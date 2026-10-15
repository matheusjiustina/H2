// Aircraft controller: fixed-step simulation with render interpolation,
// control shaping (Tidemark rates), engine start/stop, brakes, damage,
// obstacle collisions, part animation and ground effects.
import * as THREE from 'three';
import { FlightModel } from '../flight/flightModel.js';
import { Assist } from '../flight/assist.js';
import { createFlightEnv, windAt, compassFromYaw } from '../flight/env.js';
import { createAircraftModel } from './model.js';
import { createPanel } from './panel.js';
import { FLIGHT, UNITS } from '../config.js';
import { BASE, RUNWAY, POWERLINE } from '../world/layout.js';
import { approach, clamp, smoothstep, KT, FT } from '../core/math.js';

const FLAP_NOTCHES = [0, 1 / 3, 2 / 3, 1];

// Minimal stand-in for the visual model (headless simulation / tests).
function stubModel() {
  const led = () => ({ material: { color: { setHex() {} } } });
  return {
    root: new THREE.Group(), nozzles: [], leds: Array.from({ length: 15 }, led),
    eye: new THREE.Vector3(0, 0.98, -0.42), fuelFiller: new THREE.Vector3(2.4, -0.2, -0.4), hopperPort: new THREE.Vector3(0.6, -0.35, -1.05),
    pilot: { visible: true }, cockpit: { visible: true },
  };
}
const DT = FLIGHT.sim.dt;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Aircraft {
  constructor(game, { headless = false } = {}) {
    this.game = game;
    this.world = game.world;
    this.headless = headless;
    this.fm = new FlightModel();
    this.assist = new Assist();
    if (headless) {
      this.panel = { draw() {}, texture: null };
      this.model = stubModel();
    } else {
      this.panel = createPanel();
      this.model = createAircraftModel(this.panel);
    }
    game.scene.add(this.model.root);
    this.env = createFlightEnv(this.world.terrain);
    this.shaped = { elev: 0, ail: 0, rud: 0 };
    this.cmd = { pitch: 0, roll: 0, yaw: 0 };
    this.target = { pitch: 0, roll: 0, yaw: 0, brake: 0 };
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
    this.onSimStep = null; // (dt) => void — spray deposition hooks in here
    this.onEvent = null;
    this.windVec = new THREE.Vector3();
    this.dustT = 0;
    this.panelT = 0;
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
    this.shaped.elev = this.shaped.ail = this.shaped.rud = 0;
    this.state = 'ok';
    this._sync();
  }
  placeAtPad() {
    const p = BASE.pad;
    this.fm.settleOnGround(p.x, p.z, p.heading, this.env);
    this.fm.parkBrake = true;
    this._afterPlace();
  }
  placeOnRunway(end = 'west') {
    const x = end === 'west' ? RUNWAY.x0 + 18 : RUNWAY.x1 - 18;
    this.fm.settleOnGround(x, RUNWAY.z, end === 'west' ? Math.PI / 2 : -Math.PI / 2, this.env);
    this._afterPlace();
  }
  placeAirborne(x, z, heading, agl = 150, speed = 48) {
    const g = this.world.terrain.heightAt(x, z);
    this.fm.reset(new THREE.Vector3(x, g + agl, z), heading, { speed, engineOn: true });
    this.fm.trim = 0.1;
    this.fm.throttle = 0.7;
    this._afterPlace();
  }
  repair() { this.damage = 0; this.fm.roughness = 0; this.fm.extraDrag = 0; }

  // ------------------------------------------------------------------ per frame
  update(dt, input, opts) {
    const fm = this.fm;
    if (this.state === 'crashed') {
      this._animate(dt);
      return;
    }
    this._readControls(dt, input, opts);
    // Fixed-step integration with render interpolation.
    this.acc += Math.min(dt, 0.25);
    let steps = 0;
    while (this.acc >= DT && steps < FLIGHT.sim.maxSubsteps * 2) {
      this.prevPos.copy(fm.pos);
      this.prevQuat.copy(fm.quat);
      this._simStep(DT, opts);
      this.acc -= DT;
      steps++;
      if (this.state === 'crashed') break;
    }
    if (steps >= FLIGHT.sim.maxSubsteps * 2) this.acc = 0;
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
    // Right-drag yoke (Tidemark), springs back when released.
    if (m.buttons & 4) {
      this.yoke.x = clamp(this.yoke.x + m.dx * 1.4, -1, 1);
      this.yoke.y = clamp(this.yoke.y + m.dy * 1.4, -1, 1);
    } else {
      this.yoke.x *= Math.exp(-6 * dt);
      this.yoke.y *= Math.exp(-6 * dt);
    }
    const v = input.virtual;
    const gp = input.gamepad;
    let pitch = (input.isDown('pitchUp') ? 1 : 0) - (input.isDown('pitchDown') ? 1 : 0) - this.yoke.y;
    let roll = (input.isDown('rollRight') ? 1 : 0) - (input.isDown('rollLeft') ? 1 : 0) + this.yoke.x;
    let yaw = (input.isDown('yawRight') ? 1 : 0) - (input.isDown('yawLeft') ? 1 : 0);
    if (v.active) { pitch += v.pitch; roll += v.roll; yaw += v.yaw; }
    if (gp) { pitch -= gp.pitch; roll += gp.roll; yaw += gp.yaw; }
    this.target.pitch = clamp(pitch, -1, 1);
    this.target.roll = clamp(roll, -1, 1);
    this.target.yaw = clamp(yaw, -1, 1);
    this.target.brake = input.isDown('brakes') || v.brake || (gp && gp.btn[1]) ? 1 : 0;

    if (this.game.controlsLocked) {
      this.target.pitch = this.target.roll = this.target.yaw = 0;
      return;
    }
    // Throttle
    let thr = fm.throttle;
    if (input.isDown('throttleUp')) thr += dt * 0.55;
    if (input.isDown('throttleDown')) thr -= dt * 0.55;
    if (gp) thr += (gp.throttleUp - gp.throttleDown) * dt * 0.6;
    if (v.throttle !== null && v.throttle !== undefined) thr = v.throttle;
    if (m.wheel && opts.cameraMode !== 'orbit') thr -= m.wheel * 0.05;
    fm.throttle = clamp(thr, 0, 1);
    // Flaps
    const notch = FLAP_NOTCHES.reduce((b, n) => (Math.abs(n - fm.flapsCmd) < Math.abs(b - fm.flapsCmd) ? n : b), 0);
    const ni = FLAP_NOTCHES.indexOf(notch);
    if (input.wasPressed('flapsUp')) fm.flapsCmd = FLAP_NOTCHES[Math.max(0, ni - 1)];
    if (input.wasPressed('flapsDown')) fm.flapsCmd = FLAP_NOTCHES[Math.min(3, ni + 1)];
    if (input.isDown('trimUp')) fm.trim = clamp(fm.trim + dt * 0.3, -1, 1);
    if (input.isDown('trimDown')) fm.trim = clamp(fm.trim - dt * 0.3, -1, 1);
    // Engine: hold to start, tap to stop (Tidemark Q behaviour).
    const engDown = input.isDown('engine') || v.engine;
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
    if (fm.fuel <= 0.5) { this.game.toast('No fuel. Taxi is impossible — request service at the pad.'); this.holdQ = -10; return false; }
    if (this.damage >= 90) { this.game.toast('The engine won’t turn over.'); this.holdQ = -10; return false; }
    fm.engine = 'cranking';
    fm.crankTime = 0;
    fm.parkBrake = false;
    this.game.audio?.play('starter');
    this.onEvent?.({ kind: 'engineStart' });
    return true;
  }
  stopEngine() {
    if (this.fm.engine === 'off') return;
    this.fm.engine = 'off';
    this.game.audio?.play('click');
    this.onEvent?.({ kind: 'engineStop' });
  }

  _simStep(h, opts) {
    const fm = this.fm;
    this.simTime += h;
    // Command shaping, same rates as Tidemark's controller.
    const s = this.shaped, t = this.target;
    s.elev = approach(s.elev, t.pitch, t.pitch === 0 ? 4 : 2.6, h);
    s.ail = approach(s.ail, t.roll, t.roll === 0 ? 5 : 3.2, h);
    s.rud = approach(s.rud, t.yaw, t.yaw === 0 ? 4 : 2.5, h);
    const o = fm.out;
    const flying = !o.onGround && o.agl > 0.8;
    this.cmd.pitch = s.elev;
    this.cmd.roll = s.ail;
    this.cmd.yaw = flying ? s.rud : clamp(s.rud + s.ail, -1, 1);
    this.assist.update(fm, this.cmd, opts.assist, h);
    fm.brake = approach(fm.brake, t.brake, 4, h);
    fm.parkBrake = fm.engine === 'off' && o.groundSpeed < 0.4 && o.onGround;
    fm.flaps = approach(fm.flaps, fm.flapsCmd, 0.22, h);
    windAt(this.windVec, this.simTime, fm.pos, o.agl, opts.windScale ?? 1);
    this.env.wind.copy(this.windVec);
    fm.step(h, this.env);
    for (const e of fm.events) this._event(e);
    this.onSimStep?.(h);
    fm.updateMass();
  }

  _event(e) {
    const g = this.game;
    const A = FLIGHT;
    if (e.kind === 'touch') {
      if (e.part !== 'tail') this.lastTouch = { vs: e.speed, t: this.simTime };
      // The tailwheel sits 4.5 m behind the CG: when the mains touch first it
      // comes down several times faster than the CG, carrying a small share of
      // the mass. Judge it with proportionally higher limits.
      const k = e.part === 'tail' ? 1.5 : 1;
      if (e.speed > A.crashVs * k) return this.crash('Hard impact');
      if (e.speed > A.hardLandingVs * k) {
        this.hurt((e.speed - A.hardLandingVs * k) * 22);
        this._toast('hard', `Hard landing (${e.speed.toFixed(1)} m/s).`);
      }
      this.game.audio?.play('thump', { volume: Math.min(1, 0.2 + e.speed * 0.25) });
    } else if (e.kind === 'bottom') {
      this.hurt(6);
      this.game.audio?.play('thump', { volume: 1 });
    } else if (e.kind === 'ground') {
      const p = e.part;
      if (p === 'prop' || p === 'spinner') {
        if (this.fm.rpm > 300 || e.speed > 3) {
          if (e.speed > 14) return this.crash('Nose-over at speed');
          this.hurt(45);
          this.fm.engine = 'off';
          this._toast('prop', 'Prop strike! The engine stopped.');
        }
      } else if (p.startsWith('wingtip') || p.startsWith('boom') || p.startsWith('stab')) {
        if (e.speed > 14) return this.crash('Wing struck the ground');
        this.hurt(12);
        this._toast('tip', 'Wingtip scraped the ground.');
      } else if (p === 'tail') {
        if (e.speed > 6) this.hurt(4);
      } else if (e.speed > 6) {
        return this.crash('Impact');
      } else this.hurt(10);
    } else if (e.kind === 'crop') {
      const deep = e.depth;
      if (deep > 1.4 && e.speed > 18) return this.crash('Flew into the crop');
      this.hurt(Math.min(8, deep * 4));
      this._toast('crop', 'Crop strike — wheels in the canopy. Climb!');
    } else if (e.kind === 'starved') {
      this._toast('fuel', 'Engine stopped: out of fuel.');
    }
    this.onEvent?.(e);
  }

  hurt(n) {
    const before = this.damage;
    this.damage = Math.min(100, this.damage + n);
    this.fm.roughness = smoothstep(55, 95, this.damage) * 0.7;
    this.fm.extraDrag = this.damage * 0.0002;
    if (before < 50 && this.damage >= 50) this.game.toast('Aircraft damaged — the engine sounds rough.');
    if (this.damage >= 100) this.crash('Structural failure');
  }

  crash(reason) {
    if (this.state === 'crashed') return;
    this.state = 'crashed';
    this.crashReason = reason;
    this.damage = 100;
    this.fm.engine = 'off';
    this.fm.rpm = 0;
    this.crashT = 0;
    this.crashSpin = new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.2);
    this.game.audio?.play('crash');
    const p = this.fm.pos;
    for (let i = 0; i < 40; i++) {
      this.game.dust?.spawn(p.x + (Math.random() - 0.5) * 6, p.y + Math.random() * 2, p.z + (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 4, 1 + Math.random() * 3, (Math.random() - 0.5) * 4,
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
  }
  toWorld(local, out = new THREE.Vector3()) {
    return out.copy(local).applyQuaternion(this.rQuat).add(this.rPos);
  }
  forward(out = new THREE.Vector3()) { return out.set(0, 0, 1).applyQuaternion(this.fm.quat); }
  headingDeg() { return compassFromYaw(this.fm.heading()); }

  // Height of the lowest working point (booms/wheels) above crop top or ground.
  workHeight() {
    const fm = this.fm;
    let h = 1e9;
    for (const p of [[0, -1.25, 0.75], [4.9, -0.22, -0.95], [-4.9, -0.22, -0.95]]) {
      _v.set(p[0], p[1], p[2]).applyQuaternion(fm.quat).add(fm.pos);
      h = Math.min(h, _v.y - this.env.top(_v.x, _v.z));
    }
    return Math.max(0, h);
  }

  _collide() {
    if (this.state !== 'ok') return;
    const fm = this.fm;
    const pts = [[0, 0.05, 3.3], [5.9, 0.1, -0.1], [-5.9, 0.1, -0.1], [0, 1.75, -4.0], [0, 0.2, -4.3], [0, -1.2, 0.75], [0, 1.3, 0]];
    for (const p of pts) {
      _v.set(p[0], p[1], p[2]).applyQuaternion(fm.quat).add(fm.pos);
      const hit = this.world.obstacleAt(_v.x, _v.y, _v.z);
      if (hit) return this.crash(`Hit ${hit}`);
    }
    // Power line: only checked near its corridor.
    const pl = this.plBox || (this.plBox = (() => {
      const xs = POWERLINE.points.map((q) => q[0]), zs = POWERLINE.points.map((q) => q[1]);
      return { x0: Math.min(...xs) - 30, x1: Math.max(...xs) + 30, z0: Math.min(...zs) - 30, z1: Math.max(...zs) + 30 };
    })());
    if (fm.pos.x > pl.x0 && fm.pos.x < pl.x1 && fm.pos.z > pl.z0 && fm.pos.z < pl.z1 && fm.pos.y - this.world.terrain.heightAt(fm.pos.x, fm.pos.z) < 25) {
      for (const p of [[0, 0.05, 3.3], [5.9, 0.1, -0.1], [-5.9, 0.1, -0.1], [0, 1.75, -4.0], [0, -1.2, 0.75], [2.9, -0.4, 0], [-2.9, -0.4, 0]]) {
        _v.set(p[0], p[1], p[2]).applyQuaternion(fm.quat).add(fm.pos);
        if (this.world.wireDistance(_v.x, _v.y, _v.z) < 0.5) return this.crash('Wire strike');
      }
    }
  }

  _stuck(dt) {
    const fm = this.fm, o = fm.out;
    if (o.onGround && fm.engine === 'running' && fm.throttle > 0.5 && o.groundSpeed < 0.5) this.stuckT += dt; else this.stuckT = 0;
    const att = FlightModel.attitude(fm, this._att || (this._att = {}));
    // Tipped over: resting on wheels or on any structural point with a wild attitude.
    const resting = o.onGround || fm.hard.some((h) => h.prev > 0);
    if (resting && o.groundSpeed < 3 && (Math.abs(att.bank) > 0.9 || att.pitch < -0.45 || Math.abs(att.pitch) > 1.2)) this.flipT += dt; else this.flipT = 0;
    const far = Math.abs(fm.pos.x) > 3900 || Math.abs(fm.pos.z) > 3900;
    this.stuck = this.stuckT > 6 || this.flipT > 2.5 || far;
    if (far) {
      // Turn the aircraft back toward the farm.
      this._toast('far', 'Leaving the farm area — turning back.', 8);
      const h = Math.atan2(-fm.pos.x, -fm.pos.z);
      this.placeAirborne(fm.pos.x * 0.92, fm.pos.z * 0.92, h, Math.max(120, o.agl), Math.max(40, o.airspeed));
    }
  }

  // ------------------------------------------------------------------ visuals
  _animate(dt) {
    const m = this.model, fm = this.fm;
    if (this.state === 'crashed') {
      this.crashT += dt;
      const k = Math.exp(-this.crashT * 1.5);
      _q.setFromEuler(new THREE.Euler(this.crashSpin.x * dt * k, this.crashSpin.y * dt * k, this.crashSpin.z * dt * k));
      this.rQuat.multiply(_q);
      this._sync();
    }
    const el = clamp(fm.elevator + fm.trim * 0.3, -1, 1);
    m.elevator.rotation.x = el * 0.35;
    m.rudder.rotation.y = fm.rudder * 0.42;
    m.ailerons[0].rotation.x = -fm.aileron * 0.33;
    m.ailerons[1].rotation.x = fm.aileron * 0.33;
    for (const f of m.flaps) f.rotation.x = -fm.flaps * 0.52;
    // Propeller: blades fade into a disc as rpm rises.
    m.blades.rotation.z += (fm.rpm / 60) * Math.PI * 2 * dt;
    const disc = smoothstep(380, 900, fm.rpm);
    m.disc.material.opacity = disc * 0.85;
    m.disc.rotation.z += dt * 2.3;
    const ba = 1 - smoothstep(0.3, 0.92, disc);
    for (const bm of m.bladeMats) { bm.opacity = ba; bm.depthWrite = ba > 0.98; }
    m.blades.visible = ba > 0.02;
    // Gear: suspension travel, wheel spin, tailwheel steering.
    for (const g of fm.gear) {
      const gg = m.gear[g.name];
      gg.wheel.position.y = gg.rest.y + g.compression;
      if (gg.legH) gg.leg.scale.y = (gg.legH - g.compression) / gg.legH;
      gg.spin.rotation.x += g.spin * dt;
      if (g.name === 'tail') gg.fork.rotation.y = g.steerAngle;
    }
    // Cockpit controls.
    m.stick.rotation.x = -fm.elevator * 0.25;
    m.stick.rotation.z = fm.aileron * 0.25;
    m.pedals[0].position.z = 0.42 - fm.rudder * 0.05;
    m.pedals[1].position.z = 0.42 + fm.rudder * 0.05;
    m.throttle.rotation.x = -0.5 + fm.throttle * 0.95;
    const spraying = this.game.sprayer?.on;
    m.valve.rotation.x = spraying ? 0.6 : -0.3;
    m.pumpFan.rotation.z += (spraying ? fm.out.airspeed * 1.6 : fm.out.airspeed * 0.3) * dt;
    // Instrument panel at 15 Hz while visible.
    this.panelT -= dt;
    if (this.panelT <= 0 && this.game.cameraMode === 'cockpit') {
      this.panelT = 1 / 15;
      this.panel.draw(this.instruments());
    }
  }

  instruments() {
    const fm = this.fm, o = fm.out;
    const att = FlightModel.attitude(fm, this._att2 || (this._att2 = {}));
    const ias = o.airspeed * KT * Math.sqrt(o.density / 1.225);
    return {
      ias, altFt: (fm.pos.y + UNITS.altOffsetM) * FT, rpm: fm.rpm,
      fuel: fm.fuel, fuelCap: FLIGHT.fuelCapacity, hopper: fm.hopper, hopperCap: FLIGHT.hopperCapacity,
      vs0: 48, vs1: 55, vfe: 95,
      stall: o.stall, spray: !!this.game.sprayer?.on, brake: fm.brake > 0.3 || fm.parkBrake,
      engine: fm.engine, flaps: fm.flaps, hdg: this.headingDeg(), hgt: this.workHeight(), vsFpm: o.vs * FT * 60,
      flow: this.game.sprayer?.flowNow ?? 0, gps: this.game.guidance, pitch: att.pitch, bank: att.bank,
    };
  }

  _effects(dt) {
    const fm = this.fm, o = fm.out;
    const dust = this.game.dust;
    if (!dust) return;
    this.dustT -= dt;
    if (this.dustT > 0) return;
    this.dustT = 0.04;
    const col = (s) => (s === 'dirt' ? [0.55, 0.22, 0.12] : s === 'runway' ? [0.62, 0.5, 0.38] : s === 'crop' ? [0.4, 0.42, 0.25] : [0.45, 0.43, 0.3]);
    const wind = this.windVec;
    if (o.onGround && o.groundSpeed > 3) {
      for (const g of fm.gear) {
        if (!g.onGround || g.name === 'tail') continue;
        _v.copy(g.pv).applyQuaternion(fm.quat).add(fm.pos);
        const s = this.env.surface(_v.x, _v.z);
        if (s === 'grass' && Math.random() < 0.6) continue;
        const k = Math.min(1, o.groundSpeed / 25);
        dust.spawn(_v.x, _v.y + 0.1, _v.z, -fm.vel.x * 0.15 + wind.x * 0.3, 0.5 + Math.random(), -fm.vel.z * 0.15 + wind.z * 0.3,
          { life: 1.5 + Math.random() * 1.5, size: 0.8 + k, grow: 3, alpha: 0.28 * k, drag: 1.2, gravity: -0.15, color: col(s) });
      }
    }
    // Prop wash raising dust on the ground at high power.
    if (o.agl < 4 && fm.rpm > 1500 && o.groundSpeed < 30) {
      _v.set((Math.random() - 0.5) * 2, -1.0, -2 - Math.random() * 3).applyQuaternion(fm.quat).add(fm.pos);
      const gh = this.world.terrain.heightAt(_v.x, _v.z);
      const s = this.env.surface(_v.x, _v.z);
      if (s !== 'grass' && s !== 'crop') {
        _v2.set(0, 0, -1).applyQuaternion(fm.quat);
        const k = smoothstep(1500, 2600, fm.rpm);
        dust.spawn(_v.x, gh + 0.2, _v.z, _v2.x * 8 * k + wind.x, 0.4, _v2.z * 8 * k + wind.z,
          { life: 1.8, size: 1.2, grow: 3.5, alpha: 0.22 * k, drag: 0.9, gravity: -0.1, color: col(s) });
      }
    }
    // Rough engine smoke.
    if (this.damage > 55 && fm.engine !== 'off') {
      _v.set(-0.5, -0.3, 2.0).applyQuaternion(fm.quat).add(fm.pos);
      dust.spawn(_v.x, _v.y, _v.z, fm.vel.x * 0.4, 0.5, fm.vel.z * 0.4, { life: 2.2, size: 0.4, grow: 3, alpha: 0.3, drag: 1.2, gravity: -0.3, color: [0.15, 0.15, 0.15] });
    }
  }

  telemetry() {
    const fm = this.fm, o = fm.out;
    return {
      ias: o.airspeed * KT * Math.sqrt(o.density / 1.225), gs: o.groundSpeed * KT,
      hgt: this.workHeight(), agl: o.agl, altFt: (fm.pos.y + UNITS.altOffsetM) * FT,
      power: fm.throttle, rpm: fm.rpm, fuel: fm.fuel, hopper: fm.hopper, engine: fm.engine,
      stall: o.stall, onGround: o.onGround, flaps: fm.flaps, brake: fm.brake, parkBrake: fm.parkBrake,
      vs: o.vs, damage: this.damage, mass: fm.mass, hdg: this.headingDeg(), state: this.state, g: o.gLoad,
    };
  }
}
