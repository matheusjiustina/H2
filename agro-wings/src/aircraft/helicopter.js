// Helicopter controller (Robinson R44): the rotary-wing counterpart of
// Aircraft. Same public interface (placement, parking, update, collisions,
// telemetry, instruments) so the game, crew service, sprayer, GPS, HUD and
// cameras work unchanged, but its own physics (HeliModel), control laws
// (HeliAssist), events and visuals. The fixed-wing Aircraft and FlightModel
// are not used or modified by it.
import * as THREE from 'three';
import { HeliModel, hoverPowerFrac } from '../flight/heliModel.js';
import { HeliAssist } from '../flight/heliAssist.js';
import { FlightModel } from '../flight/flightModel.js';
import { createFlightEnv, windAt, compassFromYaw } from '../flight/env.js';
import { aircraftType } from './types.js';
import { t } from '../i18n/index.js';
import { UNITS } from '../config.js';
import { BASE, POWERLINE } from '../world/layout.js';
import { approach, clamp, smoothstep, damp, KT, FT } from '../core/math.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

function stubModel(type) {
  const led = () => ({ material: { color: { setHex() {} } } });
  const s = type.stub;
  return {
    root: new THREE.Group(), nozzles: [], leds: Array.from({ length: 15 }, led),
    eye: new THREE.Vector3(...s.eye), fuelFiller: new THREE.Vector3(...s.fuelFiller), hopperPort: new THREE.Vector3(...s.hopperPort),
    pilot: { visible: true }, cockpit: { visible: true },
  };
}

export class Helicopter {
  constructor(game, { headless = false, type = 'r44' } = {}) {
    this.game = game;
    this.world = game.world;
    this.headless = headless;
    this.type = aircraftType(type);
    this.A = this.type.flight;
    this.kind = 'heli';
    this.fm = new HeliModel(this.A);
    this.assist = new HeliAssist();
    if (headless) {
      this.panel = { draw() {}, texture: null };
      this.model = stubModel(this.type);
    } else {
      this.panel = this.type.createPanel();
      this.model = this.type.createModel(this.panel, { envMap: game.scene.environment });
    }
    game.scene.add(this.model.root);
    if (!headless) { this.contactShadow = this.type.createShadow(); game.scene.add(this.contactShadow); }
    this.env = createFlightEnv(this.world.terrain);
    this.shaped = { lon: 0, lat: 0, ped: 0 };
    this.target = { pitch: 0, roll: 0, yaw: 0, leverRate: 0 };
    this.lever = 0; // collective lever position the pilot holds
    this.yoke = new THREE.Vector2();
    this.prevPos = new THREE.Vector3();
    this.prevQuat = new THREE.Quaternion();
    this.rPos = new THREE.Vector3();
    this.rQuat = new THREE.Quaternion();
    this.acc = 0;
    this.simTime = 0;
    this.state = 'ok';
    this.damage = 0;
    this.holdQ = 0;
    this.stuckT = 0;
    this.flipT = 0;
    this.toastCooldown = {};
    this.lastTouch = null;
    this.onSimStep = null;
    this.onEvent = null;
    this.windVec = new THREE.Vector3();
    this.dustT = 0;
    this.panelT = 0;
    this.tipPts = Array.from({ length: 8 }, () => new THREE.Vector3());
    this.placeAtPad();
  }

  // ------------------------------------------------------------------ placement
  _afterPlace() {
    this.prevPos.copy(this.fm.pos);
    this.prevQuat.copy(this.fm.quat);
    this.rPos.copy(this.fm.pos);
    this.rQuat.copy(this.fm.quat);
    this.acc = 0;
    this.assist.reset();
    this.shaped.lon = this.shaped.lat = this.shaped.ped = 0;
    this.lever = this.fm.collective;
    this.state = 'ok';
    this._sync();
  }
  placeAtPad() {
    const p = this.type.servicePad ?? BASE.pad;
    this.placeParked(p.x, p.z, p.heading);
  }
  placeParked(x, z, heading) {
    this.fm.settleOnGround(x, z, heading, this.env);
    this._afterPlace();
  }
  placeOnRunway() { this.placeAtPad(); }
  placeAirborne(x, z, heading, agl = 150, speed = 30) {
    const g = this.world.terrain.heightAt(x, z);
    this.fm.setPowerModel(this.game.settings?.heliModel ?? 'power');
    this.fm.reset(new THREE.Vector3(x, g + agl - this.A.skids[0][1], z), heading, { speed: Math.min(speed, 50), engineOn: true });
    if (this.fm.powerModel !== 'power') this.fm.collective = 0.45; // (the power model starts at the hover power)
    this._afterPlace();
  }
  repair() { this.damage = 0; this.fm.roughness = 0; this.fm.extraDrag = 0; }

  park(spot) {
    const fm = this.fm;
    fm.engine = 'off'; fm.phase = 'off'; fm.rotorOmega = 0; fm.power = 0; fm.rpm = 0;
    this.placeParked(spot.x, spot.z, spot.heading);
    this.env.wind.set(0, 0, 0);
    for (let i = 0; i < 240; i++) fm.step(1 / 120, this.env);
    fm.vel.set(0, 0, 0); fm.omega.set(0, 0, 0);
    this.prevPos.copy(fm.pos); this.prevQuat.copy(fm.quat);
    this.rPos.copy(fm.pos); this.rQuat.copy(fm.quat);
    this._sync();
    this.parked = true;
    this.model.pilot.visible = false;
    this.model.cockpit.visible = false;
    if (!this.headless) this._animate(0);
  }

  // Airframe boxes plus the rotor disc (only while it turns or droops low).
  hitTest(x, y, z) {
    const p = _v.set(x - this.fm.pos.x, y - this.fm.pos.y, z - this.fm.pos.z);
    if (p.lengthSq() > 64) return false;
    p.applyQuaternion(_q.copy(this.fm.quat).invert());
    for (const [x0, x1, y0, y1, z0, z1] of this.type.bounds) {
      if (p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1 && p.z > z0 && p.z < z1) return true;
    }
    const R = this.A.rotor;
    if (Math.hypot(p.x, p.z - R.hubZ) < R.radius && Math.abs(p.y - (R.hubHeight - 0.1)) < 0.35) return true;
    return false;
  }

  // ------------------------------------------------------------------ per frame
  update(dt, input, opts) {
    const fm = this.fm;
    if (this.state === 'crashed') { this._animate(dt); return; }
    if (opts.heliModel) fm.setPowerModel(opts.heliModel);
    this._readControls(dt, input, opts);
    const DT = this.A.sim.dt;
    this.acc += Math.min(dt, 0.25);
    let steps = 0;
    while (this.acc >= DT && steps < this.A.sim.maxSubsteps * 2) {
      this.prevPos.copy(fm.pos);
      this.prevQuat.copy(fm.quat);
      this._simStep(DT, opts);
      this.acc -= DT;
      steps++;
      if (this.state === 'crashed') break;
    }
    if (steps >= this.A.sim.maxSubsteps * 2) this.acc = 0;
    const a = this.acc / DT;
    this.rPos.lerpVectors(this.prevPos, fm.pos, a);
    this.rQuat.copy(this.prevQuat).slerp(fm.quat, a);
    this._sync();
    this._collide();
    this._stuck(dt);
    if (this.headless) return;
    this._animate(dt);
    this._effects(dt);
  }

  _readControls(dt, input, opts) {
    const fm = this.fm;
    const m = opts.mouse;
    if (m.buttons & 4) {
      this.yoke.x = clamp(this.yoke.x + m.dx * 1.4, -1, 1);
      this.yoke.y = clamp(this.yoke.y + m.dy * 1.4, -1, 1);
    } else {
      this.yoke.x *= Math.exp(-6 * dt);
      this.yoke.y *= Math.exp(-6 * dt);
    }
    const v = input.virtual;
    const gp = input.gamepad;
    // Helicopter controls through the type's mapping onto the game actions.
    const C = this.type.controls;
    const dn = (k) => (input.isDown(C[k]) ? 1 : 0);
    let pitch = dn('cyclicAft') - dn('cyclicForward') - this.yoke.y;
    let roll = dn('cyclicRight') - dn('cyclicLeft') + this.yoke.x;
    let yaw = dn('pedalRight') - dn('pedalLeft');
    if (v.active) { pitch += v.pitch; roll += v.roll; yaw += v.yaw; }
    if (gp) { pitch -= gp.pitch; roll += gp.roll; yaw += gp.yaw; }
    this.target.pitch = clamp(pitch, -1, 1);
    this.target.roll = clamp(roll, -1, 1);
    this.target.yaw = clamp(yaw, -1, 1);
    if (this.game.controlsLocked) {
      this.target.pitch = this.target.roll = this.target.yaw = 0;
      this.target.leverRate = 0;
      return;
    }
    // Collective lever on the power keys / wheel / triggers.
    let rate = dn('collectiveUp') - dn('collectiveDown');
    if (gp) rate += gp.throttleUp - gp.throttleDown;
    if (v.active && v.leverRate) rate += v.leverRate;
    this.target.leverRate = clamp(rate, -1, 1);
    let lv = this.lever + rate * dt * (opts.assist === 'off' ? 0.32 : this.fm.powerModel === 'power' ? 0.9 : 0.55); // quicker lever with the assist (the power model: 0.9/s, the power answers at once)
    if (v.throttle !== null && v.throttle !== undefined) lv = v.throttle;
    if (m.wheel && opts.cameraMode !== 'orbit') lv -= m.wheel * 0.03;
    this.lever = clamp(lv, 0, 1);
    // Longitudinal cyclic trim (used with the assist off).
    if (input.isDown(C.trimAft)) fm.trim = clamp(fm.trim - dt * 0.25, -0.6, 0.6);
    if (input.isDown(C.trimForward)) fm.trim = clamp(fm.trim + dt * 0.25, -0.6, 0.6);
    // Engine: hold to start, tap to stop.
    const engDown = input.isDown(C.engine) || v.engine;
    if (engDown) {
      this.holdQ += dt;
      if (this.holdQ > 0.35 && fm.engine === 'off') this.startEngine();
    } else {
      if (this.holdQ > 0 && this.holdQ < 0.3 && fm.engine !== 'off') this.stopEngine();
      this.holdQ = 0;
    }
  }

  startEngine() {
    const fm = this.fm;
    if (fm.engine !== 'off' || this.state !== 'ok') return false;
    const veto = this.game.canStartEngine?.();
    if (veto) { this.game.toast(veto); this.holdQ = -10; return false; }
    if (fm.fuel <= 0.5) { this.game.toast(t('No fuel — request service at the helipad.')); this.holdQ = -10; return false; }
    if (this.damage >= 90) { this.game.toast(t('The engine won’t turn over.')); this.holdQ = -10; return false; }
    if (this.lever > 0.08) { this.game.toast(t('Collective full down before starting.')); this.holdQ = -10; return false; }
    fm.engine = 'cranking';
    fm.crankTime = 0;
    this.game.audio?.play('starter');
    this.onEvent?.({ kind: 'engineStart' });
    return true;
  }
  stopEngine() {
    if (this.fm.engine === 'off') return;
    this.fm.engine = 'off';
    this.fm.phase = 'off';
    this.game.audio?.play('click');
    this.onEvent?.({ kind: 'engineStop' });
  }

  _simStep(h, opts) {
    const fm = this.fm;
    this.simTime += h;
    const s = this.shaped, t = this.target;
    // Keyboard inputs shaped into stick/pedal travel (no instant jumps).
    s.lon = approach(s.lon, t.pitch, t.pitch === 0 ? 3.5 : 2.2, h);
    s.lat = approach(s.lat, t.roll, t.roll === 0 ? 3.5 : 2.2, h);
    s.ped = approach(s.ped, t.yaw, t.yaw === 0 ? 3 : 1.8, h);
    const cmd = { pitch: s.lon, roll: s.lat, yaw: s.ped, lever: this.lever, leverRate: t.leverRate };
    this.assist.update(fm, cmd, opts.assist ?? 'normal', h);
    if (cmd.leverOut !== undefined) this.lever = cmd.leverOut; // 'high' assist moves the lever
    windAt(this.windVec, this.simTime, fm.pos, fm.out.agl, opts.windScale ?? 1);
    this.env.wind.copy(this.windVec);
    fm.step(h, this.env);
    for (const e of fm.events) this._event(e);
    this.onSimStep?.(h);
    fm.updateMass();
  }

  _event(e) {
    const A = this.A;
    if (e.kind === 'touch') {
      this.lastTouch = { vs: e.speed, t: this.simTime };
      if (e.speed > A.crashVs) return this.crash('Hard landing — skids collapsed');
      if (e.speed > A.hardLandingVs) {
        this.hurt((e.speed - A.hardLandingVs) * 30);
        this._toast('hard', t('Hard landing ({0} m/s).', e.speed.toFixed(1)));
      }
      this.game.audio?.play('thump', { volume: Math.min(1, 0.15 + e.speed * 0.25) });
    } else if (e.kind === 'ground') {
      const p = e.part;
      const turning = this.fm.out.rotorPct > 15;
      if (p === 'rotor') { if (turning) return this.crash('Main rotor struck the ground'); }
      else if (p === 'tailRotor') {
        if (turning) return this.crash('Tail rotor strike');
        this.hurt(10);
      } else if (p === 'stinger') { if (e.speed > 3) this.hurt(8); this._toast('stinger', t('Tail stinger hit the ground — tail low!')); }
      else if (p.startsWith('boom')) { this.hurt(e.speed > 4 ? 15 : 5); this._toast('boom', t('Spray boom struck the ground.')); }
      else if (e.speed > 5) return this.crash('Impact');
      else this.hurt(10);
    } else if (e.kind === 'crop') {
      this.hurt(Math.min(4, e.depth * 3));
      this._toast('crop', t('Skids in the crop — climb!'));
    } else if (e.kind === 'starved') {
      this._toast('fuel', t('Engine stopped: out of fuel. Lower the collective — autorotate!'));
    } else if (e.kind === 'catch') {
      this.game.audio?.play('catch');
      this._toast('start', t('Engine running — clutch engaging, rotor spinning up.'), 20);
    }
    this.onEvent?.(e);
  }

  hurt(n) {
    const before = this.damage;
    this.damage = Math.min(100, this.damage + n);
    this.fm.roughness = smoothstep(55, 95, this.damage) * 0.7;
    this.fm.extraDrag = this.damage * 0.004;
    if (before < 50 && this.damage >= 50) this.game.toast(t('Helicopter damaged — the engine sounds rough.'));
    if (this.damage >= 100) this.crash('Structural failure');
  }

  crash(reason) {
    if (this.state === 'crashed') return;
    this.state = 'crashed';
    this.crashReason = reason;
    this.damage = 100;
    this.fm.engine = 'off';
    this.fm.phase = 'off';
    this.fm.rotorOmega = 0;
    this.crashT = 0;
    this.crashSpin = new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.4);
    this.game.audio?.play('crash');
    const p = this.fm.pos;
    for (let i = 0; i < 40; i++) {
      this.game.dust?.spawn(p.x + (Math.random() - 0.5) * 8, p.y + Math.random() * 2, p.z + (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 5, 1 + Math.random() * 3, (Math.random() - 0.5) * 5,
        { life: 3 + Math.random() * 3, size: 2.5, grow: 4, alpha: 0.5, drag: 0.8, gravity: -0.4, color: [0.35, 0.22, 0.15] });
    }
    this.onEvent?.({ kind: 'crash', reason });
  }

  _toast(key, msg, cd = 4) {
    const now = this.simTime;
    if ((this.toastCooldown[key] ?? -99) + cd > now) return;
    this.toastCooldown[key] = now;
    this.game.toast(msg);
  }

  // ------------------------------------------------------------------ queries
  _sync() {
    const r = this.model.root;
    r.position.copy(this.rPos);
    r.quaternion.copy(this.rQuat);
    r.updateMatrixWorld(true);
    const cs = this.contactShadow;
    if (cs) {
      const gy = this.env.ground(this.rPos.x, this.rPos.z);
      const k = 1 - smoothstep(0.4, 7, this.rPos.y - gy - 1.38);
      cs.visible = k > 0.01 && this.state !== 'crashed';
      if (cs.visible) {
        _v.set(0, 0, 1).applyQuaternion(this.rQuat);
        cs.position.set(this.rPos.x, gy + 0.05, this.rPos.z);
        cs.rotation.set(0, Math.atan2(_v.x, _v.z), 0);
        cs.material.opacity = 0.55 * k;
      }
    }
  }
  toWorld(local, out = new THREE.Vector3()) { return out.copy(local).applyQuaternion(this.rQuat).add(this.rPos); }
  forward(out = new THREE.Vector3()) { return out.set(0, 0, 1).applyQuaternion(this.fm.quat); }
  headingDeg() { return compassFromYaw(this.fm.heading()); }

  workHeight() {
    const fm = this.fm;
    let h = 1e9;
    for (const p of this.type.work) {
      _v.set(p[0], p[1], p[2]).applyQuaternion(fm.quat).add(fm.pos);
      h = Math.min(h, _v.y - this.env.top(_v.x, _v.z));
    }
    return Math.max(0, h);
  }

  // Blade-tip ring in world space (for obstacles and wires).
  _tips() {
    const fm = this.fm, R = this.A.rotor;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      this.tipPts[k].set(Math.cos(a) * R.radius, R.hubHeight + 0.1, R.hubZ + Math.sin(a) * R.radius).applyQuaternion(fm.quat).add(fm.pos);
    }
    return this.tipPts;
  }

  _collide() {
    if (this.state !== 'ok') return;
    const fm = this.fm;
    for (const p of this.type.collide) {
      _v.set(p[0], p[1], p[2]).applyQuaternion(fm.quat).add(fm.pos);
      const hit = this.world.obstacleAt(_v.x, _v.y, _v.z);
      if (hit) return this.crash(`Hit ${hit}`);
    }
    if (fm.out.rotorPct > 15) {
      for (const p of this._tips()) {
        const hit = this.world.obstacleAt(p.x, p.y, p.z);
        if (hit) return this.crash(`Main rotor struck the ${hit.replace(/^Hit /, '')}`);
      }
    }
    const pl = this.plBox || (this.plBox = (() => {
      const xs = POWERLINE.points.map((q) => q[0]), zs = POWERLINE.points.map((q) => q[1]);
      return { x0: Math.min(...xs) - 30, x1: Math.max(...xs) + 30, z0: Math.min(...zs) - 30, z1: Math.max(...zs) + 30 };
    })());
    if (fm.pos.x > pl.x0 && fm.pos.x < pl.x1 && fm.pos.z > pl.z0 && fm.pos.z < pl.z1 && fm.out.agl < 25) {
      for (const p of [...this.type.wire.map((w) => _v2.set(w[0], w[1], w[2]).applyQuaternion(fm.quat).add(fm.pos).clone()), ...this._tips()]) {
        if (this.world.wireDistance(p.x, p.y, p.z) < 0.5) return this.crash('Wire strike');
      }
    }
  }

  _stuck(dt) {
    const fm = this.fm, o = fm.out;
    const att = FlightModel.attitude(fm, this._att || (this._att = {}));
    if (o.onGround && o.groundSpeed < 2 && (Math.abs(att.bank) > 0.7 || Math.abs(att.pitch) > 0.6)) this.flipT += dt; else this.flipT = 0;
    const far = Math.abs(fm.pos.x) > 3900 || Math.abs(fm.pos.z) > 3900;
    this.stuck = this.flipT > 2.5 || far;
    if (far) {
      this._toast('far', t('Leaving the farm area — turning back.'), 8);
      const h = Math.atan2(-fm.pos.x, -fm.pos.z);
      this.placeAirborne(fm.pos.x * 0.92, fm.pos.z * 0.92, h, Math.max(60, o.agl), 25);
    }
  }

  // ------------------------------------------------------------------ visuals
  _pilotHead(dt, spraying) {
    const head = this.model.pilot?.head;
    if (!head || !this.model.pilot.visible) return;
    const fm = this.fm, o = fm.out;
    const t = this.simTime;
    const bank = _v.set(1, 0, 0).applyQuaternion(fm.quat).y;
    // Helicopter pilots look down and out a lot: at the skids near the
    // ground, along the boom when spraying, into turns.
    let yaw = -clamp(bank * 0.8, -0.5, 0.5) + 0.25 * Math.sin(t * 0.37) * (o.agl < 8 ? 1 : 0.4);
    if (spraying) yaw += 0.15 * Math.sin(t * 0.6);
    const pitch = (o.agl < 6 && !o.onGround ? 0.22 : 0.05) + clamp((o.gLoad - 1) * 0.05, -0.05, 0.1);
    head.rotation.y = damp(head.rotation.y, yaw, 2.2, dt);
    head.rotation.x = damp(head.rotation.x, pitch, 2.5, dt);
  }

  _animate(dt) {
    const m = this.model, fm = this.fm;
    if (this.state === 'crashed') {
      this.crashT = (this.crashT ?? 0) + dt;
      const k = Math.exp(-this.crashT * 1.5);
      _q.setFromEuler(_e.set(this.crashSpin.x * dt * k, this.crashSpin.y * dt * k, this.crashSpin.z * dt * k));
      this.rQuat.multiply(_q);
      this._sync();
    }
    m.update?.(dt, fm, this);
    this._pilotHead(dt, this.game.sprayer?.on);
    this.panelT -= dt;
    if (this.panelT <= 0 && this.game.cameraMode === 'cockpit' && this.game.aircraft === this) {
      this.panelT = 1 / 15;
      this.panel.draw(this.instruments());
    }
  }

  // Named rotor state (for the panel, telemetry and tests; the visuals and
  // sounds follow the continuous rotor speed).
  get rotorState() {
    const fm = this.fm, nr = fm.out.rotorPct;
    if (fm.engine === 'off') return nr < 0.5 ? 'STOPPED' : 'SHUTDOWN';
    if (fm.engine === 'cranking' || fm.phase !== 'flight') return 'STARTING';
    return nr < 97 ? 'LOW RPM' : 'NORMAL';
  }

  instruments() {
    const fm = this.fm, o = fm.out;
    const att = FlightModel.attitude(fm, this._att2 || (this._att2 = {}));
    const ias = o.airspeed * KT * Math.sqrt(o.density / 1.225);
    return {
      ias: ias < 15 ? ias * smoothstep(5, 15, ias) : ias, // pitot reads little below ~15 kt
      altFt: (fm.pos.y + UNITS.altOffsetM) * FT, vsFpm: o.vs * FT * 60, hdg: this.headingDeg(),
      pitch: att.pitch, bank: att.bank, slip: o.beta, yawRate: -fm.omega.y,
      rotorPct: o.rotorPct, enginePct: o.enginePct, map: fm.map, cht: fm.cht, oilT: fm.oilT, oilP: fm.oilP, amps: fm.amps,
      fuel: fm.fuel, fuelCap: this.A.fuelCapacity, hopper: fm.hopper, hopperCap: this.A.hopperCapacity, fuelFlow: fm.fuelFlow,
      lowRotor: o.lowRotor, gov: fm.phase === 'flight', clutch: fm.engine === 'running' && fm.phase === 'clutch', engine: fm.engine,
      rotorBrake: fm.rotorBrake, onGround: o.onGround, reg: this.type.reg, vne: this.type.vspeeds.vne,
      spray: !!this.game.sprayer?.on, flow: this.game.sprayer?.flowNow ?? 0, hgt: this.workHeight(), gps: this.game.guidance,
      power: fm.power / (this.A.engine.ratedKW * 1000), collective: fm.collective, rotorState: this.rotorState,
    };
  }

  _effects(dt) {
    const fm = this.fm, o = fm.out;
    const dust = this.game.dust;
    if (!dust) return;
    this.dustT -= dt;
    if (this.dustT > 0) return;
    this.dustT = 0.05;
    // Rotor downwash lifting dust from bare ground (simplified ring).
    const R = this.A.rotor;
    const hub = _v.set(0, R.hubHeight, 0).applyQuaternion(fm.quat).add(fm.pos);
    const gh = this.world.terrain.heightAt(hub.x, hub.z);
    const hh = hub.y - gh;
    if (fm.thrust > 3000 && hh < 2.2 * R.radius) {
      const k = (1 - hh / (2.2 * R.radius)) * Math.min(1, fm.thrust / (fm.mass * 9.81));
      const n = 3;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = R.radius * (0.7 + Math.random() * 0.5);
        const x = hub.x + Math.cos(a) * r, z = hub.z + Math.sin(a) * r;
        const s = this.env.surface(x, z);
        if (s === 'grass' && Math.random() < 0.7) continue;
        if (s === 'crop') continue;
        const col = s === 'dirt' ? [0.55, 0.24, 0.13] : s === 'runway' ? [0.6, 0.5, 0.4] : [0.46, 0.42, 0.3];
        dust.spawn(x, this.world.terrain.heightAt(x, z) + 0.2, z, Math.cos(a) * 6 * k + this.windVec.x * 0.5, 0.6 + Math.random() * 0.6, Math.sin(a) * 6 * k + this.windVec.z * 0.5,
          { life: 1.6 + Math.random(), size: 1.2, grow: 3.2, alpha: 0.26 * k, drag: 1.1, gravity: -0.1, color: col });
      }
    }
    if (this.damage > 55 && fm.engine !== 'off') {
      _v.fromArray(this.type.smoke).applyQuaternion(fm.quat).add(fm.pos);
      dust.spawn(_v.x, _v.y, _v.z, fm.vel.x * 0.4, 0.5, fm.vel.z * 0.4, { life: 2.2, size: 0.4, grow: 3, alpha: 0.3, drag: 1.2, gravity: -0.3, color: [0.15, 0.15, 0.15] });
    }
  }

  // Induced velocity reaching the boom (m/s): full rotor downwash in the
  // hover, swept behind the boom as the wake skews with forward speed.
  downwash() {
    const fm = this.fm, R = this.A.rotor;
    const rho = fm.out.density || 1.225;
    const vh = Math.sqrt(Math.max(0, fm.thrust) / (2 * rho * Math.PI * R.radius * R.radius));
    const V = fm.out.airspeed;
    return ((vh * vh) / Math.sqrt(V * V + vh * vh + 1e-6)) * (1 - smoothstep(6, 18, V));
  }

  telemetry() {
    const fm = this.fm, o = fm.out;
    // Power model: the HUD shows the power the pilot has set (the lever) and
    // the power that holds a hover right here (weight, ground cushion,
    // density), so the two can be compared at a glance.
    const pm = fm.powerModel === 'power';
    return {
      ias: o.airspeed * KT * Math.sqrt(o.density / 1.225), gs: o.groundSpeed * KT,
      hgt: this.workHeight(), agl: o.agl, altFt: (fm.pos.y + UNITS.altOffsetM) * FT,
      power: pm ? (fm.engine === 'running' ? this.lever : 0) : fm.power / (this.A.engine.ratedKW * 1000),
      powerModel: fm.powerModel, hoverPower: pm ? hoverPowerFrac(this.A, fm.mass, Math.max(0, o.agl), fm.pos.y + UNITS.altOffsetM) : null,
      rpm: fm.rpm, fuel: fm.fuel, hopper: fm.hopper, engine: fm.engine,
      fuelCap: this.A.fuelCapacity, hopperCap: this.A.hopperCapacity,
      stall: 0, onGround: o.onGround, flaps: 0, brake: 0, parkBrake: false,
      vs: o.vs, damage: this.damage, mass: fm.mass, hdg: this.headingDeg(), state: this.state, g: o.gLoad,
      rotorPct: o.rotorPct, lowRotor: o.lowRotor, collective: fm.collective, rotorState: this.rotorState, heli: true,
    };
  }
}
