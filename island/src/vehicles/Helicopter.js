import * as THREE from 'three';
import { HeliFlight, HeliAssist } from './HeliFlight.js';
import { buildHelicopter } from './HeliModel.js';
import { U } from '../core/Shared.js';
import { clamp, damp, lerp, smoothstep } from '../utils/MathUtils.js';
import { HELIPAD } from '../world/Archipelago.js';

const STEP = 1 / 120; // fixed physics step
const KT = 1.943844, FT = 3.28084;
const SKID = 1.47; // skid bottom below the centre of gravity

const approach = (v, target, rate, dt) => (v < target ? Math.min(target, v + rate * dt) : Math.max(target, v - rate * dt));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The helicopter as a game object: rotorcraft model + airframe, controls, cameras,
 * cockpit instruments, sound, rotor wash, damage and recovery. It lives on the helipad
 * west of the camp, parked with the engine off, and only ever moves under physics.
 */
export class Helicopter {
  constructor({ scene, ocean, terrainData, collision, particles, ripples, interaction, distant, game, helipad }) {
    this.scene = scene;
    this.ocean = ocean;
    this.td = terrainData;
    this.collision = collision;
    this.particles = particles;
    this.ripples = ripples;
    this.distant = distant;
    this.game = game;
    this.helipad = helipad;

    const t0 = performance.now();
    this.model = buildHelicopter();
    this.buildMs = performance.now() - t0;
    scene.add(this.model.root);
    this.hf = new HeliFlight();
    this.assist = new HeliAssist();

    this.occupied = false;
    this.wrecked = false;
    this.damage = 0;
    this.view = 'chase'; // chase | cockpit | orbit
    this.lookYaw = 0; this.lookPitch = -0.12;
    this.chaseYaw = 0; this.chasePitch = 0; this.chaseIdle = 0;
    this.orbit = { yaw: 0.6, pitch: 0.25, dist: 18 };
    this.input = { x: 0, y: 0, yaw: 0, lever: 0, climb: 0 };
    this.stick = new THREE.Vector2();
    this.lightsOn = false;
    this.holdE = 0;
    this.stopArm = 0;
    this.panelTimer = 0;
    this.fxTimer = 0;
    this.respawnTimer = 0;
    this.status = '';
    this.firstBoard = true;
    this.readyTold = false;
    this.acc = 0;
    this.asleep = false;
    this.settle = 0;
    this.downwash = 0;
    this.washPoint = new THREE.Vector3();
    this.camBlend = 1;
    this.camFrom = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    this.chasePos = new THREE.Vector3();
    this.chaseLook = new THREE.Vector3();
    this.rpos = new THREE.Vector3();
    this.rquat = new THREE.Quaternion();
    this.prevPos = new THREE.Vector3();
    this.prevQuat = new THREE.Quaternion();
    this.parkColliders = [];
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._v3 = new THREE.Vector3();
    this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
    this._splat = {};

    // world queries for the flight model
    const canopy = {};
    const nrm = new THREE.Vector3();
    this.env = {
      water: (x, z) => ocean.heightAt(x, z),
      surface: (x, z, maxY, out) => {
        const g = collision.ground(x, z, maxY, 0.05);
        let y = g.y;
        const far = distant ? distant.heightAt(x, z) : -50;
        if (g.collider) { out.nx = 0; out.ny = 1; out.nz = 0; out.kind = 'pad'; } else {
          terrainData.normalAt(x, z, nrm);
          out.nx = nrm.x; out.ny = nrm.y; out.nz = nrm.z; out.kind = 'terrain';
        }
        if (far > y) { y = far; out.nx = 0; out.ny = 1; out.nz = 0; out.kind = 'terrain'; }
        out.y = y;
        return out;
      },
      solid: (x, y, z) => {
        const c = collision.pointInside(x, y, z, 0.1);
        if (c && c.tag !== 'heli') return true;
        const g = terrainData.heightAt(x, z);
        if (y > g + 16 || y < g) return false;
        terrainData.splatAt(x, z, canopy);
        return canopy.canopy > 0.45 && y < g + 13; // into the jungle canopy
      },
      wind: new THREE.Vector3(),
      engineSubmerged: false,
    };

    this.interactable = interaction.add({
      object: this.model.body, name: 'helicopter', interactionDistance: 6.5, boxPadding: 0.2,
      interactionLabel: () => (this.wrecked ? null : this.damage > 30 ? 'Fly the helicopter (damaged)' : 'Fly the helicopter'),
      onInteract: (g) => this.board(g),
    });

    this.atPad();
  }

  // ------------------------------------------------------------------ placement
  /** Parked on the helipad, engine off, rotor stopped (never called while someone is aboard). */
  atPad() {
    if (this.occupied) return;
    this._unwreck();
    const top = this.helipad ? this.helipad.top : this.td.heightAt(HELIPAD.x, HELIPAD.z) + 0.14;
    this.hf.reset(new THREE.Vector3(HELIPAD.x, top + SKID - 0.01, HELIPAD.z), HELIPAD.heading);
    this.assist.reset();
    this.damage = 0;
    this.model.spin.rotation.y = 0.42;
    this._settled();
    this._sync(1);
  }

  /** Debug / test helper: put her in a hover (or cruise) above where she is. */
  airborne(alt = 60, speed = 0) {
    this._unwreck();
    const p = this.hf.pos.clone();
    const heading = this._heading();
    const g = Math.max(this.ocean.heightAt(p.x, p.z), this.td.heightAt(p.x, p.z));
    this.hf.reset(new THREE.Vector3(p.x, Math.max(p.y, g + alt), p.z), heading, { speed, running: true, collective: 0.5 });
    this.assist.reset();
    this._unpark();
    this.asleep = false;
    this._sync(1);
  }

  repair() { if (this.wrecked) this.atPad(); else this.damage = 0; }

  _heading() {
    const q = this.hf.quat;
    return Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
  }

  _fwd(out = this._v) { return out.set(0, 0, 1).applyQuaternion(this.rquat); }

  /** Parked: make the cabin and boom solid for the player and let the physics sleep. */
  _settled() {
    this._unpark();
    const hf = this.hf, q = hf.quat;
    const yaw = this._heading();
    const at = (x, y, z) => this._v.set(x, y, z).applyQuaternion(q).add(hf.pos);
    const c1 = at(0, -0.05, -0.1), c2 = at(0, 0.5, -4.4);
    this.parkColliders.push(this.collision.addBox({ x: c1.x, y: c1.y, z: c1.z, hx: 0.9, hy: 0.85, hz: 1.35, yaw, tag: 'heli', surface: 'metal' }));
    this.parkColliders.push(this.collision.addBox({ x: c2.x, y: c2.y, z: c2.z, hx: 0.24, hy: 0.24, hz: 2.2, yaw, tag: 'heli', surface: 'metal' }));
    this.asleep = true;
    this.acc = 0;
  }

  _unpark() {
    for (const c of this.parkColliders) this.collision.remove(c);
    this.parkColliders.length = 0;
    this.asleep = false;
  }

  // ------------------------------------------------------------------ boarding
  board(game) {
    if (this.occupied || this.wrecked) return;
    this.occupied = true;
    this._unpark();
    this.holdE = -1; // ignore the E press that boarded us
    game.player.mode = 'heli';
    game.player.vel.set(0, 0, 0);
    game.inventory.unequip();
    this.interactable.enabled = false;
    // the camera eases from the player's eyes out to the chase view
    this.camFrom.pos.copy(game.camera.position);
    this.camFrom.quat.copy(game.camera.quaternion);
    this.camBlend = 0;
    this.view = 'chase';
    this.chaseYaw = 0; this.chasePitch = 0;
    this.chasePos.set(0, -1e6, 0);
    this.lookYaw = 0; this.lookPitch = -0.12;
    const hf = this.hf;
    this.input.lever = hf.collective;
    this.assist.reset();
    game.audio?.play('click', { volume: 0.6 });
    if (this.firstBoard) {
      this.firstBoard = false;
      game.ui.discover('PT-TDM', 'Helicopter');
    }
    game.ui.showFlightHelp?.(true, 'heli');
    if (hf.engine === 'off') {
      if (this.env.engineSubmerged || this.damage >= 90) game.toast('The turbine won’t light.');
      else {
        hf.start();
        this.readyTold = false;
        game.toast('Starting the turbine. Wait for the rotor to reach 100 %.');
      }
    } else game.toast('Rotor turning. Space raises the collective.');
  }

  /** Someone aboard and she is sitting on her skids, lever down, stopped. */
  canExit() {
    const o = this.hf.out;
    return this.occupied && !this.wrecked && o.contacts >= 4 && o.groundSpeed < 1.2 && o.load > 0.55 && !o.onWater;
  }

  exit(game, force = false) {
    const hf = this.hf;
    if (!force && !this.canExit()) {
      game.toast(this.hf.out.onWater ? 'Not over the water: find solid ground first.' : 'Land first, then lower the collective (Shift) before you step out.');
      return;
    }
    // the pilot's door is on the right; try it first, then the left, then front and back
    const fwd = this._v.set(0, 0, 1).applyQuaternion(hf.quat); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const candidates = [];
    for (const [s, f] of [[1, 0.6], [1, -0.4], [-1, 0.6], [-1, -0.4], [0, 3.6], [1, 2.4], [-1, 2.4]]) {
      for (const d of [2.1, 2.8]) candidates.push(hf.pos.clone().addScaledVector(right, s * d).addScaledVector(fwd, f + (s === 0 ? d - 2.1 : 0)));
    }
    let best = null;
    for (const c of candidates) {
      const g = this.collision.ground(c.x, c.z, hf.pos.y + 1);
      if (g.y > this.ocean.heightAt(c.x, c.z) + 0.05 && Math.abs(g.y - (hf.pos.y - SKID)) < 1.6 && !this.collision.pointInside(c.x, g.y + 0.9, c.z, 0.2)) { best = c.set(c.x, g.y, c.z); break; }
    }
    this.occupied = false;
    this.interactable.enabled = !this.wrecked;
    game.ui.showFlightHelp?.(false);
    const yaw = Math.atan2(-fwd.x, -fwd.z) + Math.PI;
    if (best) game.player.spawn(best.x, best.z, yaw, -0.05);
    else {
      const c = candidates[0];
      game.player.spawn(c.x, c.z, yaw, 0);
      const wy = this.ocean.heightAt(c.x, c.z);
      if (wy > this.td.heightAt(c.x, c.z) + 1.2) { game.player.pos.y = wy - 1.45; game.player.mode = 'swim'; }
    }
    if (game.player.mode === 'heli') game.player.mode = 'walk';
    // shut down: the rotor runs down by itself where she stands
    if (hf.engine !== 'off') { hf.stop(); game.audio?.play('click', { volume: 0.5 }); }
    this.input.lever = 0;
    if (force && !hf.out.onGround) this.atPad();
  }

  // ------------------------------------------------------------------ per frame
  update(dt, game) {
    if (dt <= 0) { if (this.occupied) this._camera(0, game); return; }
    const hf = this.hf;
    if (this.occupied && game.state === 'playing') this._controls(dt, game);

    // world inputs: wind with gusts, a drowned engine
    const w = U.uWind.value;
    const gust = (Math.sin(game.time * 0.7) * 0.5 + Math.sin(game.time * 1.9 + 1.3) * 0.3) * game.weather.p.gust;
    this.env.wind.set(w.x, 0, w.y).multiplyScalar(w.z * (6 + gust * 3));
    if (this.occupied) this._bounds(dt, game);
    const intake = this._v2.set(0, 1.15, -0.8).applyQuaternion(hf.quat).add(hf.pos);
    this.env.engineSubmerged = intake.y < this.ocean.heightAt(intake.x, intake.z);

    // physics in fixed steps, the pose interpolated between the last two
    if (!this.asleep) {
      this.acc = Math.min(this.acc + dt, STEP * 12);
      const mode = game.settings.get('flightAssist') || 'normal';
      const cmd = this.occupied ? this.input : this._idleCmd || (this._idleCmd = { x: 0, y: 0, yaw: 0, lever: 0, climb: 0 });
      let events = null;
      while (this.acc >= STEP) {
        this.acc -= STEP;
        this.prevPos.copy(hf.pos); this.prevQuat.copy(hf.quat);
        if (!this.wrecked) this.assist.update(hf, cmd, mode, STEP);
        hf.step(STEP, this.env);
        if (hf.events.length) (events || (events = [])).push(...hf.events);
      }
      if (events && !this.wrecked) this._impacts(events, game);
      if (!this.wrecked) this._checkAttitude(game);
      // unattended and run down: settle and sleep
      if (!this.occupied && !this.wrecked && hf.engine === 'off' && hf.nr < 0.003 && hf.out.contacts >= 6 && hf.vel.lengthSq() < 4e-4 && hf.omega.lengthSq() < 4e-4) {
        this.settle += dt;
        if (this.settle > 0.8) { hf.nr = 0; this._settled(); }
      } else this.settle = 0;
    }
    this._sync(this.asleep ? 1 : this.acc / STEP);
    if (this.wrecked) this._wreckUpdate(dt, game);
    this._animate(dt, game);
    this._effects(dt, game);
    if (this.occupied) {
      this._camera(dt, game);
      const p = game.player;
      p.pos.set(this.rpos.x, this.rpos.y - 1.0, this.rpos.z);
      p.prevPos.copy(p.pos);
      this.status = this._statusLine();
      this._tips(game);
    }
    const o = hf.out;
    game.audio?.setHeli({
      n1: hf.spool, nr: hf.nr, power: clamp(o.power, 0, 1.2), slap: this._slap(), occupied: this.occupied,
      inside: this.occupied && this.view === 'cockpit', position: this.rpos, starting: hf.engine === 'starting', airspeed: o.airspeed,
    });
  }

  _tips(game) {
    const hf = this.hf;
    if (!this.readyTold && hf.engine === 'running' && hf.nr > 0.97) {
      this.readyTold = true;
      game.toast('Rotor at 100 %. Hold Space to raise the collective and lift off; W A S D cyclic, Q / R pedals.');
    }
  }

  // blade slap: loaded rotor in descents, turns and the flare
  _slap() {
    const hf = this.hf, o = hf.out;
    if (hf.nr < 0.5) return 0;
    const descent = smoothstep(1, 4, -o.vs) * (1 - smoothstep(14, 30, o.airspeed)) * 0.6;
    const load = smoothstep(1.15, 1.6, o.gLoad) * 0.7;
    return clamp(descent + load + o.vrs * 0.6 + o.etl * (1 - o.etl) * 0.5, 0, 1) * hf.nr;
  }

  _controls(dt, game) {
    const inp = game.input;
    const key = (c) => inp.down.has(c);
    const tap = (c) => inp.pressed.has(c);
    const hf = this.hf;

    // mouse: look around (or swing the chase camera); with the right button held it flies the cyclic
    const { dx, dy } = inp.consumeMouse();
    if (inp.mouseDown[2]) {
      this.stick.x = clamp(this.stick.x + dx * 1.3, -1, 1);
      this.stick.y = clamp(this.stick.y - dy * 1.3, -1, 1);
    } else {
      this.stick.x = damp(this.stick.x, 0, 6, dt);
      this.stick.y = damp(this.stick.y, 0, 6, dt);
      if (this.view === 'orbit') {
        this.orbit.yaw -= dx; this.orbit.pitch = clamp(this.orbit.pitch + dy, -0.3, 1.3);
      } else if (this.view === 'chase') {
        if (dx || dy) this.chaseIdle = 0;
        this.chaseYaw = clamp(this.chaseYaw - dx, -Math.PI, Math.PI);
        this.chasePitch = clamp(this.chasePitch + dy, -0.3, 0.9);
      } else {
        this.lookYaw = clamp(this.lookYaw - dx, -2.4, 2.4);
        this.lookPitch = clamp(this.lookPitch - dy, -1.1, 0.8);
      }
    }
    // the chase camera drifts back behind the tail once the mouse is left alone
    this.chaseIdle += dt;
    if (this.chaseIdle > 2.5) { this.chaseYaw = damp(this.chaseYaw, 0, 1.2, dt); this.chasePitch = damp(this.chasePitch, 0, 1.2, dt); }

    // cyclic: W/S/A/D ramp like a real stick instead of snapping; touch stick and mouse add in
    const fwd = (inp.isDown('forward') ? 1 : 0) - (inp.isDown('back') ? 1 : 0);
    const lat = (inp.isDown('right') ? 1 : 0) - (inp.isDown('left') ? 1 : 0);
    const tv = inp.virtualAxis;
    const cyT = clamp(fwd + this.stick.y + (tv ? tv.y : 0), -1, 1);
    const cxT = clamp(lat + this.stick.x + (tv ? tv.x : 0), -1, 1);
    this.input.y = approach(this.input.y, cyT, cyT === 0 ? 3.5 : 2.2, dt);
    this.input.x = approach(this.input.x, cxT, cxT === 0 ? 4 : 2.6, dt);
    // pedals: Q / R (or Z / X)
    const ped = (key('KeyR') || key('KeyX') ? 1 : 0) - (key('KeyQ') || key('KeyZ') ? 1 : 0);
    this.input.yaw = approach(this.input.yaw, ped, ped === 0 ? 4 : 2.4, dt);
    // collective: Space up, Left Shift down, or the mouse wheel; in High assist they ask for climb / descent
    const up = key('Space') ? 1 : 0, down = key('ShiftLeft') ? 1 : 0;
    this.input.climb = approach(this.input.climb, up - down, 3, dt);
    let lever = this.input.lever;
    // the lever moves slowly for fine corrections and faster the longer it is held (and on the skids)
    this.leverHeld = up || down ? (this.leverHeld || 0) + dt : 0;
    const rate = hf.out.contacts > 0 && lever < 0.3 ? 0.4 : lerp(0.14, 0.4, smoothstep(0.5, 1.6, this.leverHeld));
    lever += (up - down) * rate * dt;
    // Normal assist: a soft detent at the hover. Let go of the lever close to level flight and it
    // trims itself to hold the height; an established climb or descent is left alone.
    const assistMode = game.settings.get('flightAssist') || 'normal';
    // in High the assist works the lever: keep ours on it so switching modes is seamless
    if (assistMode === 'high') lever = hf.collective;
    if (assistMode === 'normal' && !up && !down && hf.out.contacts === 0 && Math.abs(hf.out.vs) < 0.9 && hf.engine === 'running') {
      const target = hf.out.cHover - this.assist.tiltComp - 0.15 * hf.out.vs;
      lever = approach(lever, target, 0.06, dt);
    }
    if (inp.wheel) {
      if (this.view === 'orbit' || (this.view === 'chase' && inp.mouseDown[1])) this.orbit.dist = clamp(this.orbit.dist * (1 + inp.wheel * 0.1), 7, 60);
      else lever -= inp.wheel * 0.03;
    }
    // the lever can't be raised on the skids before the rotor is up to speed
    if (hf.out.contacts > 0 && !(hf.engine === 'running' && hf.nr > 0.9)) lever = Math.min(lever, hf.collective);
    this.input.lever = clamp(lever, 0, 1);

    // engine: T starts it or shuts it down (twice in flight, to be sure)
    if (tap('KeyT')) {
      if (hf.engine === 'off') {
        if (this.env.engineSubmerged || this.damage >= 90) game.toast('The turbine won’t light.');
        else { hf.start(); this.readyTold = false; game.toast('Starting the turbine.'); }
      } else if (hf.out.contacts > 0 || this.stopArm > 0) {
        hf.stop(); this.stopArm = 0;
        game.toast(hf.out.contacts > 0 ? 'Engine shut down. The rotor will run down.' : 'Engine off: lower the collective and autorotate!');
      } else { this.stopArm = 2; game.toast('Press T again to shut the engine down in flight.'); }
    }
    this.stopArm = Math.max(0, this.stopArm - dt);
    if (tap('KeyL')) { this.lightsOn = !this.lightsOn; game.audio?.play('click', { volume: 0.4 }); }
    if (tap('KeyV')) this._setView(this.view === 'cockpit' ? 'chase' : 'cockpit', game);
    if (tap('KeyO')) { this._setView(this.view === 'orbit' ? 'chase' : 'orbit', game); this.orbit.yaw = this._heading() + Math.PI; }

    // E: step out (the press that boarded doesn't count until the key is let go)
    if (tap('KeyE') && this.holdE >= 0) this.exit(game);
    if (!key('KeyE')) this.holdE = 0;
  }

  _setView(v, game) {
    if (v === this.view) return;
    this.camFrom.pos.copy(game.camera.position);
    this.camFrom.quat.copy(game.camera.quaternion);
    this.camBlend = 0;
    this.view = v;
  }

  // ------------------------------------------------------------------ damage
  _impacts(events, game) {
    let crash = null;
    for (const e of events) {
      if (e.kind === 'skid') {
        if (e.speed > 5 || e.h > 14) crash = 'The skids collapsed on a hard landing.';
        else if (e.speed > 3.2 || e.h > 7) this._hurt((e.speed - 2.5) * 14 + Math.max(0, e.h - 6) * 3, game, 'Hard landing.');
      } else if (e.kind === 'tail') {
        if (e.speed > 4.5) crash = 'The tail struck the ground.';
        else if (e.speed > 1.6) this._hurt(e.speed * 6, game, 'Tail strike!');
      } else if (e.kind === 'water') {
        if (e.speed > 3.5) crash = 'She hit the water hard.';
      } else if (e.part === 'rotor') {
        crash = e.kind === 'water' ? 'The rotor struck the water.' : e.kind === 'solid' ? 'The rotor struck an obstacle.' : 'The rotor struck the ground.';
      } else if (e.part === 'tailRotor') {
        crash = 'The tail rotor struck something.';
      } else if (e.part === 'belly' && e.kind === 'water') {
        // a gentle touch of the belly on the water is a ditching all the same
        crash = 'Ditched in the water.';
      } else if (e.speed > 3.5) crash = 'The airframe hit hard.';
      else if (e.speed > 1) this._hurt(e.speed * 8, game);
    }
    if (crash || this.damage >= 100) { this.lastEvents = events.slice(0, 6); this.crash(game, crash || 'Too much damage.'); }
  }

  /** Rolled over on the ground, or the cabin under water: that ends the flight. */
  _checkAttitude(game) {
    const hf = this.hf, o = hf.out;
    const up = this._v3.set(0, 1, 0).applyQuaternion(hf.quat);
    if (o.contacts > 0 && up.y < Math.cos(0.6)) this.crash(game, 'She rolled over on the ground.');
    else if (o.agl < 4 && up.y < 0.2) this.crash(game, 'She went in inverted.');
    else {
      const wy = this.ocean.heightAt(hf.pos.x, hf.pos.z);
      if (wy > this.td.heightAt(hf.pos.x, hf.pos.z) + 0.6 && hf.pos.y - 0.6 < wy) this.crash(game, 'Ditched in the water.');
    }
  }

  _hurt(amount, game, msg) {
    const before = this.damage;
    this.damage = Math.min(100, this.damage + amount);
    if (this.occupied) {
      game.audio?.play('knock', { volume: Math.min(1, 0.4 + amount / 30) });
      if (msg && amount > 4) game.toast(`${msg} Damage ${Math.round(this.damage)} %.`);
      else if (before < 50 && this.damage >= 50) game.toast('The airframe is badly damaged.');
    }
  }

  /** The flight ends: rotor destroyed, the wreck settles where it fell and is recovered to the pad later. */
  crash(game, why) {
    if (this.wrecked) return;
    const hf = this.hf;
    this.wrecked = true;
    this.lastCrash = why;
    this.damage = 100;
    hf.engine = 'off'; hf.spool = 0; hf.nr = 0; hf.Qe = 0; hf.collective = 0;
    this.interactable.enabled = false;
    const m = this.model;
    // broken blades: short stubs left on the hub
    for (const b of m.blades) { b.feather.scale.set(0.22, 1, 1); b.flap.rotation.z = -0.25 + Math.random() * 0.3; }
    m.disc.visible = false; m.tailDisc.visible = false;
    m.bladeMat.opacity = 1; m.bladeMat.depthWrite = true;
    for (const b of m.blades) { b.hi.visible = true; b.lo.visible = false; }
    m.tailSpin.visible = false;
    m.beaconGroup.visible = false; m.lights.visible = false;
    const p = hf.pos.clone();
    const water = this.ocean.heightAt(p.x, p.z), ground = this.td.heightAt(p.x, p.z);
    if (water > ground) {
      for (let k = 0; k < 5; k++) this.particles.splash(p.x + (Math.random() - 0.5) * 7, water, p.z + (Math.random() - 0.5) * 7, 2.2);
      for (let k = 0; k < 6; k++) this.ripples.addDrop(p.x + (Math.random() - 0.5) * 9, p.z + (Math.random() - 0.5) * 9, 3, 0.6);
    } else for (let k = 0; k < 5; k++) this.particles.sandPuff(p.x + (Math.random() - 0.5) * 6, ground, p.z + (Math.random() - 0.5) * 6, 3);
    for (let k = 0; k < 16; k++) this.particles.spawn({ pos: { x: p.x, y: p.y + 1.2, z: p.z }, vel: { x: (Math.random() - 0.5) * 3, y: 1 + Math.random() * 2, z: (Math.random() - 0.5) * 3 }, life: 4, size: 0.8, grow: 2.5, color: [0.2, 0.2, 0.2], alpha: 0.45, drag: 0.7, kind: 0 });
    for (let k = 0; k < 18; k++) this.particles.spawn({ pos: { x: p.x, y: p.y + 1.6, z: p.z }, vel: { x: (Math.random() - 0.5) * 9, y: 2 + Math.random() * 5, z: (Math.random() - 0.5) * 9 }, life: 1.6, size: 0.05, color: [0.3, 0.32, 0.33], alpha: 1, gravity: 9.8, drag: 0.3, kind: 1 });
    game.audio?.play('crash', { position: p, volume: 1 });
    if (water > ground) game.audio?.play('splash', { position: p, volume: 1, rate: 0.6 });
    game.renderer.grade.flash = 0.5;
    if (this.occupied) {
      this.occupied = false;
      game.ui.showFlightHelp?.(false);
      const yaw = this._heading() + Math.PI;
      game.player.spawn(p.x + 3, p.z + 2.5, yaw, 0.2);
      if (water > ground + 1.2) { game.player.pos.y = water - 2.4; game.player.mode = 'swim'; } else game.player.mode = 'walk';
      game.toast(`${why} You got clear of the wreck.`);
      setTimeout(() => game.toast('The helicopter will be recovered to the helipad.'), 4000);
    }
    this.respawnTimer = 22;
    this.sinking = water > ground + 0.5;
    this.asleep = false;
  }

  _wreckUpdate(dt, game) {
    const hf = this.hf;
    if (this.sinking) {
      // settle into the water and go down slowly
      hf.vel.multiplyScalar(Math.exp(-2 * dt));
      hf.vel.y = -0.35;
      hf.omega.multiplyScalar(Math.exp(-1.5 * dt));
    }
    if (Math.random() < dt * 6) {
      const p = this._v2.set(0, 1.2, -2.4).applyQuaternion(hf.quat).add(hf.pos);
      if (p.y > this.ocean.heightAt(p.x, p.z)) this.particles.spawn({ pos: { x: p.x, y: p.y, z: p.z }, vel: { x: this.env.wind.x * 0.2, y: 0.9, z: this.env.wind.z * 0.2 }, life: 4, size: 0.5, grow: 1.4, color: [0.16, 0.16, 0.16], alpha: 0.35, drag: 0.5, kind: 0 });
    }
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.atPad();
      game.toast('The helicopter has been recovered and repaired on the helipad.');
    }
  }

  _unwreck() {
    if (!this.wrecked) return;
    this.wrecked = false;
    this.sinking = false;
    const m = this.model;
    for (const b of m.blades) b.feather.scale.set(1, 1, 1);
    m.disc.visible = true; m.tailDisc.visible = true; m.tailSpin.visible = true;
    this.interactable.enabled = !this.occupied;
  }

  // ------------------------------------------------------------------ visuals
  _sync(alpha) {
    const hf = this.hf;
    if (alpha >= 1 || this.asleep) { this.rpos.copy(hf.pos); this.rquat.copy(hf.quat); } else {
      this.rpos.lerpVectors(this.prevPos, hf.pos, alpha);
      this.rquat.slerpQuaternions(this.prevQuat, hf.quat, alpha);
    }
    const r = this.model.root;
    r.position.copy(this.rpos);
    r.quaternion.copy(this.rquat);
    r.updateMatrixWorld();
  }

  _animate(dt, game) {
    const m = this.model, hf = this.hf;
    const nr = hf.nr;
    m.updateLOD(game.camera.position.distanceTo(this.rpos));
    if (!this.wrecked) {
      // main rotor: blades coning up under load, drooping at rest; the disc tilts with the cyclic
      m.spin.rotation.y = (m.spin.rotation.y - nr * hf.A.omega0 * dt) % (Math.PI * 2);
      const lift = clamp(hf.thrust / (hf.A.mass * 9.81), 0, 1.5);
      const cone = lerp(-0.034, 0.012 + 0.045 * lift, smoothstep(0.15, 0.65, nr));
      const pitch = lerp(hf.A.pitchMin, hf.A.pitchMax, hf.collective);
      for (const b of m.blades) { b.flap.rotation.z = cone; b.feather.rotation.x = -pitch; }
      m.rotor.rotation.x = hf.a1 * 0.9;
      m.rotor.rotation.z = hf.b1 * 0.9;
      // fast enough and the eye only sees a disc: fade the blades into the blur (no strobing)
      const blur = smoothstep(0.22, 0.62, nr);
      const solid = 1 - smoothstep(0.3, 0.7, nr);
      m.discMat.opacity = blur * 0.6;
      m.disc.rotation.y -= dt * 1.7;
      m.rotorShadow.castShadow = blur > 0.5;
      m.bladeMat.opacity = solid;
      m.bladeMat.depthWrite = solid > 0.98;
      const showBlades = solid > 0.02;
      for (const b of m.blades) { b.hi.visible = showBlades && m.lod <= 1; b.lo.visible = showBlades && m.lod >= 2; }
      // tail rotor: ~5.3 times the main rotor speed, a blur almost as soon as it turns
      m.tailSpin.rotation.x += nr * hf.A.omega0 * 5.3 * dt;
      const tBlur = smoothstep(0.06, 0.25, nr);
      m.tailDiscMat.opacity = tBlur * 0.55;
      m.tailBladeMat.opacity = 1 - tBlur;
      m.tailBladeMat.depthWrite = tBlur < 0.02;
      m.tailSpin.visible = tBlur < 0.98 && m.lod <= 2;
      // a little airframe buzz while the rotor turns (and more through translational lift)
      const vib = nr > 0.1 ? 0.0006 * nr + 0.0015 * hf.out.etl * (1 - hf.out.etl) + hf.out.vrs * 0.003 : 0;
      m.body.position.set((Math.random() - 0.5) * vib, (Math.random() - 0.5) * vib, 0);
    }
    // cockpit controls follow the pilot
    for (const c of m.cyclics) { c.rotation.x = hf.cyclicY * 0.16; c.rotation.z = hf.cyclicX * 0.13; }
    m.collective.rotation.x = -hf.collective * 0.32;
    m.pedals[0].position.z = 1.9 - hf.pedal * 0.06;
    m.pedals[1].position.z = 1.9 + hf.pedal * 0.06;
    // lights: nav lights on L, anti-collision beacons whenever the rotor turns
    m.lights.visible = this.lightsOn && !this.wrecked;
    const beacon = !this.wrecked && (hf.engine !== 'off' || nr > 0.05);
    m.beaconGroup.visible = beacon;
    if (beacon) {
      const f = (game.time % 1.1) < 0.09 ? 3 : 0.0;
      for (const b of m.beacons) b.scale.setScalar(Math.max(0.001, f * 0.6));
    }
    this.panelTimer -= dt;
    if (this.occupied && this.view === 'cockpit' && this.panelTimer <= 0) {
      this.panelTimer = 1 / 15;
      this._drawPanel();
    }
  }

  _effects(dt, game) {
    const hf = this.hf, o = hf.out;
    // rotor wash strength: thrust, rotor speed and how close the disc is to the surface
    const hub = this._v2.set(0, 1.62, 0).applyQuaternion(this.rquat).add(this.rpos);
    const h = hub.y - o.surface;
    const wash = this.wrecked ? 0 : clamp(hf.thrust / (hf.A.mass * 9.81), 0, 1.3) * hf.nr * hf.nr * (1 - smoothstep(4, 22, h));
    this.downwash = damp(this.downwash, wash, 4, dt);
    this.washPoint.set(hub.x, o.surface, hub.z);
    U.uDownwash.value.set(hub.x, o.surface, hub.z, this.downwash);

    this.fxTimer -= dt;
    if (this.fxTimer > 0) return;
    this.fxTimer = 0.05;
    const P = this.particles;
    const d = this.downwash;
    if (d > 0.06) {
      const reach = 4 + 6 * d;
      if (o.overWater) {
        // rings of ripples pushed out from under the disc, spray and mist at the edge
        for (let k = 0; k < 3; k++) {
          const a = Math.random() * Math.PI * 2, rr = reach * (0.35 + Math.random() * 0.7);
          this.ripples.addDrop(hub.x + Math.cos(a) * rr, hub.z + Math.sin(a) * rr, 1.2 + d, 0.05 * d);
        }
        if (Math.random() < d * 1.5) this.ripples.addDrop(hub.x, hub.z, 2.5, 0.08 * d);
        const n = Math.round(d * 5);
        for (let k = 0; k < n; k++) {
          const a = Math.random() * Math.PI * 2, rr = reach * (0.6 + Math.random() * 0.5);
          const x = hub.x + Math.cos(a) * rr, z = hub.z + Math.sin(a) * rr;
          const wy = this.ocean.heightAt(x, z);
          const out = 2 + d * 5;
          P.spawn({ pos: { x, y: wy + 0.15, z }, vel: { x: Math.cos(a) * out, y: 0.6 + Math.random() * 1.2 * d, z: Math.sin(a) * out }, life: 1.3, size: 0.2, grow: 1.2 + d, color: [0.92, 0.96, 1], alpha: 0.11 * d, drag: 1.4, kind: 0 });
          if (Math.random() < 0.5) P.spray(x, wy + 0.05, z, Math.cos(a) * out, 0.4 + d, Math.sin(a) * out, 1);
        }
      } else {
        // dust over dry ground: sand flies, grass and the wet season much less, concrete a little
        this.td.splatAt(hub.x, hub.z, this._splat);
        const s = this._splat;
        const onPad = o.surface > this.td.heightAt(hub.x, hub.z) + 0.05;
        const dry = 1 - 0.75 * U.uWetness.value;
        const amount = (onPad ? 0.35 : 0.25 + 0.9 * (s.sand || 0) + 0.25 * (s.dirt || 0)) * dry * (1 - 0.7 * (s.canopy || 0));
        const n = Math.round(d * amount * 6);
        const col = onPad ? [0.62, 0.6, 0.56] : (s.sand || 0) > 0.4 ? [0.84, 0.76, 0.6] : [0.55, 0.5, 0.4];
        for (let k = 0; k < n; k++) {
          const a = Math.random() * Math.PI * 2, rr = reach * (0.4 + Math.random() * 0.7);
          const x = hub.x + Math.cos(a) * rr, z = hub.z + Math.sin(a) * rr;
          const gy = this.collision.ground(x, z, o.surface + 1).y;
          const out = 2.5 + d * 6;
          P.spawn({ pos: { x, y: gy + 0.2, z }, vel: { x: Math.cos(a) * out, y: 0.4 + Math.random() * 1.4, z: Math.sin(a) * out }, life: 1.8, size: 0.35, grow: 1.6 + d * 1.5, color: col, alpha: 0.2 * Math.min(1, d * 1.5), drag: 1.1, kind: 0 });
        }
        if (!onPad && Math.random() < d * amount) P.sandPuff(hub.x + (Math.random() - 0.5) * 4, o.surface, hub.z + (Math.random() - 0.5) * 4, 1.5);
      }
    }
    // light-off: a puff of smoke from the exhaust as the turbine catches
    if (hf.engine === 'starting' && hf.spool > 0.02 && hf.spool < 0.35 && Math.random() < 0.7) {
      const p = this._v2.set(-0.2, 1.1, -3.0).applyQuaternion(this.rquat).add(this.rpos);
      P.spawn({ pos: { x: p.x, y: p.y, z: p.z }, vel: { x: (Math.random() - 0.5) * 0.4, y: 0.6, z: (Math.random() - 0.5) * 0.4 }, life: 2.5, size: 0.3, grow: 1.1, color: [0.35, 0.34, 0.33], alpha: 0.3 * (1 - hf.spool * 2.5), drag: 0.6, kind: 0 });
    }
    // damaged: oily smoke from the engine bay
    if (this.damage > 50 && hf.engine !== 'off' && !this.wrecked) {
      const p = this._v2.set(-0.2, 1.1, -2.8).applyQuaternion(this.rquat).add(this.rpos);
      P.spawn({ pos: { x: p.x, y: p.y, z: p.z }, vel: { x: hf.vel.x * 0.3, y: 0.5, z: hf.vel.z * 0.3 }, life: 2.2, size: 0.25, grow: 1.6, color: [0.18, 0.18, 0.18], alpha: 0.35 * (this.damage / 100), drag: 1.2, kind: 0 });
    }
  }

  _camera(dt, game) {
    if (!this.occupied) return;
    const cam = game.camera;
    const hf = this.hf, o = hf.out;
    const pos = this.rpos, quat = this.rquat;
    if (this.view === 'cockpit') {
      // head sways with g-load; the airframe buzz grows through translational lift
      const shake = hf.nr > 0.3 ? 0.0012 * hf.nr + 0.004 * o.etl * (1 - o.etl) + o.vrs * 0.006 : 0;
      const eye = this._v.copy(this.model.eye);
      eye.y -= clamp((o.gLoad - 1) * 0.03, -0.05, 0.06);
      eye.x += (Math.random() - 0.5) * shake; eye.y += (Math.random() - 0.5) * shake;
      cam.position.copy(eye.applyQuaternion(quat).add(pos));
      this._q.setFromAxisAngle(this._v2.set(0, 1, 0), Math.PI);
      cam.quaternion.copy(quat).multiply(this._q);
      this._e.set(this.lookPitch, this.lookYaw, 0, 'YXZ');
      cam.quaternion.multiply(this._q.setFromEuler(this._e));
    } else {
      if (this.view === 'chase') {
        // behind and above, following the heading smoothly; the mouse can swing it round
        const heading = this._heading() + this.chaseYaw;
        // higher on the ground and in a low hover, to see over the props and the pad
        const low = 1 - smoothstep(2, 12, o.agl);
        this.chaseLow = damp(this.chaseLow ?? low, low, 1.5, dt);
        const pitch = 0.17 + 0.16 * this.chaseLow + this.chasePitch + clamp(-o.vs * 0.01, -0.08, 0.12);
        const dist = 13.5 + clamp(o.airspeed * 0.05, 0, 3);
        // behind (against the heading) and up by the elevation angle
        const dir = this._v2.set(Math.sin(heading) * Math.cos(pitch), -Math.sin(pitch), Math.cos(heading) * Math.cos(pitch));
        const target = this._v3.copy(pos).addScaledVector(dir, -dist).add(this._v.set(0, 1.2, 0));
        const k = dt > 0 ? 1 - Math.exp(-4 * dt) : 1;
        if (this.chasePos.distanceToSquared(target) > 2500) this.chasePos.copy(target);
        else this.chasePos.lerp(target, k);
        const f = this._fwd(this._v);
        this.chaseLook.copy(pos).addScaledVector(f, 3 * smoothstep(5, 30, o.airspeed)).add(this._v2.set(0, 1.0, 0));
      } else {
        const ob = this.orbit;
        this.chasePos.set(Math.sin(ob.yaw) * Math.cos(ob.pitch), Math.sin(ob.pitch), Math.cos(ob.yaw) * Math.cos(ob.pitch)).multiplyScalar(ob.dist).add(pos);
        this.chaseLook.copy(pos);
      }
      // stay above the ground, the water and the rotor-tip plane of the jungle
      const floor = Math.max(this.ocean.heightAt(this.chasePos.x, this.chasePos.z), this.td.heightAt(this.chasePos.x, this.chasePos.z), this.distant ? this.distant.heightAt(this.chasePos.x, this.chasePos.z) : -50) + 0.9;
      if (this.chasePos.y < floor) this.chasePos.y = floor;
      cam.position.copy(this.chasePos);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.chaseLook);
    }
    // ease in from wherever the camera was (boarding, switching views)
    if (this.camBlend < 1) {
      this.camBlend = Math.min(1, this.camBlend + dt / 0.7);
      const t = this.camBlend * this.camBlend * (3 - 2 * this.camBlend);
      cam.position.lerpVectors(this.camFrom.pos, cam.position, t);
      cam.quaternion.slerpQuaternions(this.camFrom.quat, cam.quaternion, t);
    }
    cam.updateMatrixWorld();
    const p = game.player;
    const f = this._fwd(this._v);
    p.yaw = Math.atan2(-f.x, -f.z);
    p.pitch = 0;
  }

  /** Far out at sea the trade wind turns into a gale that pushes her back (never a teleport). */
  _bounds(dt, game) {
    const hf = this.hf;
    const r = Math.hypot(hf.pos.x, hf.pos.z);
    this.warnTimer = (this.warnTimer || 0) - dt;
    if (r > 2600 && this.warnTimer <= 0) {
      this.warnTimer = 14;
      game.toast(r > 3000 ? 'Strong headwinds out here — turn back toward the island.' : 'Fuel is getting low — turn back toward the island.');
    }
    const push = smoothstep(3000, 3800, r) * 55;
    if (push > 0) this.env.wind.addScaledVector(this._v.set(-hf.pos.x / r, 0, -hf.pos.z / r), push);
  }

  // ------------------------------------------------------------------ HUD
  _statusLine() {
    const hf = this.hf, o = hf.out;
    const kt = Math.round(o.airspeed * KT);
    const alt = Math.round(Math.max(0, hf.pos.y - SKID) * FT);
    const agl = Math.round(Math.max(0, o.agl) * FT);
    const fpm = Math.round((o.vs * FT * 60) / 10) * 10;
    const eng = hf.engine === 'running' ? 'ENGINE RUNNING' : hf.engine === 'starting' ? 'STARTING' : 'ENGINE OFF';
    let s = `<span>${kt} KT</span><span>ALT ${alt} FT</span><span>AGL ${agl}</span><span>${fpm > 0 ? '+' : ''}${fpm} FPM</span><span>NR ${Math.round(hf.nr * 100)}%</span><span>TQ ${Math.round(o.torque * 100)}%</span><span>COLL ${Math.round(hf.collective * 100)}%${o.contacts === 0 && hf.nr > 0.9 ? ` · HOVER ${Math.round(clamp(o.cHover, 0, 1) * 100)}%` : ''}</span><span>${eng}</span>`;
    if (hf.engine !== 'off' && hf.nr < 0.9 && hf.nr > 0.2 && hf.engine === 'running') s += '<span class="warn">ROTOR LOW</span>';
    if (hf.engine === 'off' && o.contacts === 0 && hf.nr > 0.05) s += '<span class="warn">AUTOROTATE</span>';
    if (o.power > 0.98) s += '<span class="warn">TQ LIMIT</span>';
    if (o.vrs > 0.4) s += '<span class="warn">VORTEX RING</span>';
    if (o.contacts > 0 && o.slope > 0.17) s += '<span class="warn">SLOPE</span>';
    if (this.damage > 25) s += `<span class="warn">DAMAGE ${Math.round(this.damage)}%</span>`;
    return s;
  }

  // ------------------------------------------------------------------ cockpit panel
  _drawPanel() {
    const { ctx: g, canvas, texture } = this.model.panel;
    const W = canvas.width, H = canvas.height;
    const hf = this.hf, o = hf.out;
    const q = hf.quat;
    const fwd = this._v.set(0, 0, 1).applyQuaternion(q);
    const right = this._v2.set(-1, 0, 0).applyQuaternion(q);
    const hdg = ((Math.atan2(fwd.x, -fwd.z) * 180) / Math.PI + 360) % 360;
    const bank = Math.asin(clamp(-right.y, -1, 1));
    const pitch = Math.asin(clamp(fwd.y, -1, 1));
    g.fillStyle = '#1b1d1e';
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i < 50; i++) g.fillRect((i * 97) % W, (i * 53) % H, 2, 2);
    const R = 62;
    const dial = (cx, cy, label) => {
      g.save(); g.translate(cx, cy);
      g.fillStyle = '#0c0d0d'; g.beginPath(); g.arc(0, 0, R + 7, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#3a3c3d'; g.lineWidth = 3; g.stroke();
      g.fillStyle = '#121414'; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
      if (label) { g.fillStyle = '#9aa0a0'; g.font = '11px Arial'; g.textAlign = 'center'; g.fillText(label, 0, R * 0.5); }
    };
    const ticks = (from, to, n, major, labels) => {
      g.strokeStyle = '#e8e4da'; g.fillStyle = '#e8e4da'; g.font = 'bold 12px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 0; i <= n; i++) {
        const a = from + (to - from) * (i / n), big = i % major === 0;
        g.lineWidth = big ? 2.2 : 1.1;
        const r0 = R - 10;
        g.beginPath(); g.moveTo(Math.cos(a) * (big ? r0 - 7 : r0 - 3), Math.sin(a) * (big ? r0 - 7 : r0 - 3)); g.lineTo(Math.cos(a) * r0, Math.sin(a) * r0); g.stroke();
        if (big && labels) { const t = labels(i); if (t !== null) g.fillText(t, Math.cos(a) * (r0 - 20), Math.sin(a) * (r0 - 20)); }
      }
    };
    const needle = (a, len, w = 4, color = '#f4f1e8') => {
      g.save(); g.rotate(a); g.fillStyle = color; g.beginPath(); g.moveTo(-w / 2, 7); g.lineTo(0, -len); g.lineTo(w / 2, 7); g.fill(); g.restore();
      g.fillStyle = '#333'; g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fill();
    };
    // left: airspeed and attitude; right: altimeter and vertical speed (the pilot sits right)
    {
      dial(90, 100, 'KNOTS');
      const ang = (kt) => -Math.PI / 2 - Math.PI * 0.8 + (kt / 160) * Math.PI * 1.6;
      g.lineWidth = 6; g.strokeStyle = '#2fa84f'; g.beginPath(); g.arc(0, 0, R - 5, ang(0), ang(125)); g.stroke();
      g.strokeStyle = '#d42'; g.beginPath(); g.arc(0, 0, R - 5, ang(150), ang(153)); g.stroke();
      ticks(ang(0), ang(160), 16, 2, (i) => (i % 4 === 0 ? String(i * 10) : null));
      needle(ang(Math.min(160, o.airspeed * KT)) + Math.PI / 2, R - 14);
      g.restore();
    }
    {
      dial(240, 100, null);
      g.save(); g.beginPath(); g.arc(0, 0, R - 2, 0, Math.PI * 2); g.clip();
      g.rotate(-bank);
      const py = (pitch * 180 / Math.PI) * 2.8;
      g.fillStyle = '#3d7fc4'; g.fillRect(-R * 2, -R * 2 + py, R * 4, R * 2);
      g.fillStyle = '#6b4a2c'; g.fillRect(-R * 2, py, R * 4, R * 2);
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(-R * 2, py); g.lineTo(R * 2, py); g.stroke();
      g.lineWidth = 1.4;
      for (const dd of [-20, -10, 10, 20]) { const y = py - dd * 2.8; const w = dd % 20 === 0 ? 22 : 13; g.beginPath(); g.moveTo(-w, y); g.lineTo(w, y); g.stroke(); }
      g.restore();
      g.strokeStyle = '#ffb030'; g.lineWidth = 4; g.beginPath(); g.moveTo(-34, 0); g.lineTo(-12, 0); g.lineTo(-7, 7); g.moveTo(34, 0); g.lineTo(12, 0); g.lineTo(7, 7); g.stroke();
      g.restore();
    }
    {
      dial(784, 100, 'ALT FT');
      ticks(-Math.PI / 2, Math.PI * 1.5, 50, 5, (i) => (i < 50 && i % 5 === 0 ? String(i / 5) : null));
      const ft = Math.max(0, hf.pos.y - SKID) * FT;
      needle(((ft % 10000) / 10000) * Math.PI * 2, R - 34, 7, '#d8d4c8');
      needle(((ft % 1000) / 1000) * Math.PI * 2, R - 14, 4);
      g.restore();
    }
    {
      dial(934, 100, 'VERT SPEED');
      const ang = (k) => Math.PI + clamp(k, -2, 2) * (Math.PI * 0.85 / 2);
      ticks(ang(-2), ang(2), 8, 2, (i) => String(Math.abs(i / 2 - 2)));
      needle(ang((o.vs * FT * 60) / 1000) + Math.PI / 2, R - 14);
      g.restore();
    }
    // centre: VEMD-style display (NR / N1 / TQ bars, temperatures) and a heading strip
    {
      const x0 = 352, y0 = 22, w = 320, h = 230;
      g.fillStyle = '#05080a'; g.fillRect(x0 - 6, y0 - 6, w + 12, h + 12);
      g.fillStyle = '#0a1418'; g.fillRect(x0, y0, w, h);
      g.font = 'bold 14px "Courier New", monospace'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      const bar = (bx, label, v, lo, hi, red) => {
        const by = y0 + 40, bh = 140;
        g.fillStyle = '#1d2a2f'; g.fillRect(bx, by, 26, bh);
        g.fillStyle = '#2fa84f'; g.fillRect(bx + 28, by + bh * (1 - hi), 4, bh * (hi - lo));
        g.fillStyle = '#d33'; g.fillRect(bx + 28, by + bh * (1 - red) - 2, 4, 3);
        g.fillStyle = v > red ? '#ff5a3c' : '#52e07a';
        const f = clamp(v, 0, 1.1);
        g.fillRect(bx + 3, by + bh * (1 - Math.min(1, f)), 20, bh * Math.min(1, f));
        g.fillStyle = '#9fd8e8'; g.fillText(label, bx - 2, by - 10);
        g.fillStyle = '#e8f4f8'; g.fillText(String(Math.round(v * 100)).padStart(3, ' '), bx - 4, by + bh + 20);
      };
      bar(x0 + 22, 'NR', hf.nr, 0.95, 1.03, 1.06);
      bar(x0 + 96, 'N1', o.n1, 0.6, 0.98, 1.02);
      bar(x0 + 170, 'TQ', o.torque, 0.0, 0.95, 1.0);
      g.fillStyle = '#9fd8e8';
      g.fillText('T4', x0 + 238, y0 + 50);
      g.fillStyle = '#e8f4f8'; g.fillText(String(Math.round(hf.spool > 0 ? 420 + 380 * o.n1 : 30)), x0 + 238, y0 + 70);
      g.fillStyle = '#9fd8e8'; g.fillText('FUEL', x0 + 238, y0 + 110);
      g.fillStyle = '#e8f4f8'; g.fillText('68%', x0 + 238, y0 + 130);
      g.fillStyle = '#9fd8e8'; g.fillText('OAT', x0 + 238, y0 + 170);
      g.fillStyle = '#e8f4f8'; g.fillText('29°', x0 + 238, y0 + 190);
      const st = hf.engine === 'running' ? 'FLIGHT' : hf.engine === 'starting' ? 'START' : 'OFF';
      g.fillStyle = hf.engine === 'running' ? '#52e07a' : '#ffb030'; g.fillText(st, x0 + 12, y0 + h - 8);
    }
    {
      const x0 = 352, y0 = 268, w = 320, h = 44;
      g.fillStyle = '#05080a'; g.fillRect(x0, y0, w, h);
      g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
      g.strokeStyle = '#e8e4da'; g.fillStyle = '#e8e4da'; g.font = 'bold 13px Arial'; g.textAlign = 'center';
      const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
      for (let d = -90; d <= 90; d += 5) {
        const a = Math.round(hdg / 5) * 5 + d;
        const x = x0 + w / 2 + (a - hdg) * 3;
        const ang = ((a % 360) + 360) % 360;
        g.lineWidth = ang % 10 === 0 ? 2 : 1;
        g.beginPath(); g.moveTo(x, y0 + h); g.lineTo(x, y0 + h - (ang % 10 === 0 ? 12 : 7)); g.stroke();
        if (ang % 30 === 0) g.fillText(names[ang] || String(ang / 10), x, y0 + 18);
      }
      g.restore();
      g.fillStyle = '#ffb030'; g.beginPath(); g.moveTo(x0 + w / 2, y0 + h - 14); g.lineTo(x0 + w / 2 - 6, y0 + h); g.lineTo(x0 + w / 2 + 6, y0 + h); g.fill();
    }
    // warning panel
    const lamp = (x, y, text, on, color) => {
      g.fillStyle = on ? color : '#262626'; g.fillRect(x, y, 96, 24);
      g.fillStyle = on ? '#111' : '#555'; g.font = 'bold 12px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x + 48, y + 13);
    };
    const nrLow = hf.nr < 0.9 && hf.nr > 0.2 && hf.engine === 'running';
    lamp(40, 230, 'ROTOR LOW', nrLow || (hf.engine === 'off' && hf.nr > 0.2 && o.contacts === 0), '#e23b2a');
    lamp(146, 230, 'ENG OFF', hf.engine === 'off', '#e0b020');
    lamp(40, 262, 'START', hf.engine === 'starting', '#e0b020');
    lamp(146, 262, 'TQ LIMIT', o.power > 0.98, '#e0b020');
    lamp(40, 294, 'NAV LTS', this.lightsOn, '#3cbf6a');
    lamp(146, 294, 'GOV', hf.engine === 'running', '#3cbf6a');
    lamp(730, 230, 'LOW ALT', o.agl < 6 && o.contacts === 0 && o.vs < -2, '#e0b020');
    lamp(836, 230, 'CHIP', this.damage > 60, '#e23b2a');
    lamp(730, 262, 'SLOPE', o.contacts > 0 && o.slope > 0.17, '#e0b020');
    lamp(836, 262, 'VRS', o.vrs > 0.4, '#e23b2a');
    g.fillStyle = '#9aa0a0'; g.font = 'bold 13px Arial'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText('PT-TDM', 730, 330);
    texture.needsUpdate = true;
  }
}
