import * as THREE from 'three';
import { FlightModel } from './FlightModel.js';
import { FlightAssist } from './FlightAssist.js';
import { buildSeaplane } from './SeaplaneModel.js';
import { U } from '../core/Shared.js';
import { clamp, damp, lerp, smoothstep } from '../utils/MathUtils.js';
import { PIER } from '../world/Layout.js';
import { ropeGeometry } from '../environment/PropFactory.js';

// Moored along the west side of the pier, nose out to the lagoon.
const MOOR = { x: PIER.x - PIER.width / 2 - 1.55 - 0.45, z: -36, heading: Math.PI };
const FLAP_NOTCHES = [0, 1 / 3, 2 / 3, 1];
const STEP = 1 / 120;
const KT = 1.943844, FT = 3.28084;

const approach = (v, target, rate, dt) => (v < target ? Math.min(target, v + rate * dt) : Math.max(target, v - rate * dt));

/**
 * The floatplane as a game object: flight model + model + controls, cameras,
 * cockpit instruments, sound, damage, break-up and recovery.
 */
export class Seaplane {
  constructor({ scene, materials, ocean, terrainData, collision, particles, ripples, interaction, distant, game }) {
    this.scene = scene;
    this.ocean = ocean;
    this.td = terrainData;
    this.collision = collision;
    this.particles = particles;
    this.ripples = ripples;
    this.distant = distant;
    this.game = game;
    this.M = materials;

    this.model = buildSeaplane(materials);
    scene.add(this.model.root);
    this.fm = new FlightModel();
    this.assist = new FlightAssist();
    this.tipShown = false;

    this.occupied = false;
    this.moored = true;
    this.broken = false;
    this.damage = 0;
    this.view = 'cockpit'; // cockpit | chase | orbit
    this.lookYaw = 0; this.lookPitch = -0.08;
    this.orbit = { yaw: 0.6, pitch: 0.25, dist: 18 };
    this.yoke = new THREE.Vector2();
    this.input = { elev: 0, ail: 0, rud: 0 };
    this.lightsOn = false;
    this.holdE = 0; this.holdQ = 0;
    this.warnTimer = 0;
    this.panelTimer = 0;
    this.fxTimer = 0;
    this.respawnTimer = 0;
    this.debris = [];
    this.status = '';
    this.firstBoard = true;
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
    this.chasePos = new THREE.Vector3();
    this.chaseLook = new THREE.Vector3();

    // world queries for the flight model
    const canopy = {};
    this.env = {
      water: (x, z) => ocean.heightAt(x, z),
      ground: (x, z) => Math.max(terrainData.heightAt(x, z), distant ? distant.heightAt(x, z) : -50),
      solid: (x, y, z) => {
        if (collision.pointInside(x, y, z, 0.15)) return true;
        const g = terrainData.heightAt(x, z);
        if (y > g + 16 || y < g) return false;
        terrainData.splatAt(x, z, canopy);
        return canopy.canopy > 0.45 && y < g + 13; // into the jungle canopy
      },
      wind: new THREE.Vector3(),
      mooring: null,
      engineSubmerged: false,
    };

    this.interactable = interaction.add({
      object: this.model.fuselage, name: 'seaplane', interactionDistance: 6.5, boxPadding: 0.4,
      interactionLabel: () => (this.damage > 25 ? 'Fly the seaplane (damaged)' : 'Fly the seaplane'),
      onInteract: (g) => this.board(g),
    });

    this.rope = new THREE.Mesh(new THREE.BufferGeometry(), materials.rope);
    this.rope.castShadow = true;
    scene.add(this.rope);
    this._ropeTimer = 0;

    this.atPier();
  }

  // ------------------------------------------------------------------ placement
  atPier() {
    this._reassemble();
    const water = this.ocean.heightAt(MOOR.x, MOOR.z);
    this.fm.reset(new THREE.Vector3(MOOR.x, water + 1.9, MOOR.z), MOOR.heading);
    this.assist.reset();
    this.moored = !this.occupied;
    this.damage = 0;
    this.broken = false;
    this._sync();
  }

  airborne(alt = 300) {
    this._reassemble();
    const p = this.occupied ? this.fm.pos.clone() : new THREE.Vector3(MOOR.x, 0, MOOR.z);
    const heading = this.occupied ? Math.atan2(this._fwd().x, this._fwd().z) : MOOR.heading;
    this.fm.reset(new THREE.Vector3(p.x, Math.max(alt, this.ground(p.x, p.z) + 120), p.z), heading, { speed: 50, engineOn: true });
    this.fm.trim = 0.05;
    this.assist.reset();
    this.moored = false;
    this.broken = false;
    this._sync();
  }

  repair() {
    if (this.broken) { this.atPier(); return; }
    this.damage = 0;
    this.fm.roughness = 0;
  }

  ground(x, z) { return this.env.ground(x, z); }

  _fwd() { return this._v.set(0, 0, 1).applyQuaternion(this.fm.quat); }

  // ------------------------------------------------------------------ boarding
  board(game) {
    if (this.occupied || this.broken) return;
    this.occupied = true;
    this.moored = false;
    this.holdE = -1; // ignore the E press that boarded us
    game.player.mode = 'plane';
    game.player.vel.set(0, 0, 0);
    game.inventory.unequip();
    this.interactable.enabled = false;
    this.view = 'cockpit';
    this.lookYaw = 0; this.lookPitch = -0.08;
    game.audio?.play('click', { volume: 0.6 });
    if (this.firstBoard) {
      this.firstBoard = false;
      game.ui.discover('PT-ILH', 'Floatplane');
    }
    game.ui.showFlightHelp?.(true);
    game.toast(this.fm.engine === 'running' ? 'Engine running. R / F throttle.' : 'Hold Q to start the engine.');
  }

  exit(game, force = false) {
    const fm = this.fm;
    if (!force && (fm.out.airspeed > 4 || !(fm.out.onWater || fm.out.onGround))) {
      game.toast('Bring her to a stop on the water before you step out.');
      return;
    }
    const fwd = this._fwd().clone(); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const candidates = [];
    for (const s of [1, -1]) for (const along of [0, 1.5, -1.5]) for (const d of [2.6, 3.4, 4.4]) candidates.push(fm.pos.clone().addScaledVector(right, s * d).addScaledVector(fwd, along));
    let best = null;
    for (const c of candidates) {
      const g = this.collision.ground(c.x, c.z, fm.pos.y + 2);
      if (g.y > this.ocean.heightAt(c.x, c.z) + 0.05) { best = c.set(c.x, g.y, c.z); break; }
    }
    this.occupied = false;
    this.interactable.enabled = !this.broken;
    game.ui.showFlightHelp?.(false);
    const yaw = Math.atan2(-fwd.x, -fwd.z) + Math.PI;
    if (best) game.player.spawn(best.x, best.z, yaw, 0);
    else {
      const c = candidates[0];
      game.player.spawn(c.x, c.z, yaw, 0);
      game.player.pos.y = this.ocean.heightAt(c.x, c.z) - 1.45;
      game.player.mode = 'swim';
      game.audio?.play('splash', { volume: 0.7 });
    }
    if (game.player.mode === 'plane') game.player.mode = 'walk';
    // tie up again when left by the pier
    if (Math.hypot(fm.pos.x - MOOR.x, fm.pos.z - MOOR.z) < 8 && fm.out.airspeed < 2) {
      this.moored = true;
      fm.engine = 'off';
      fm.throttle = 0;
    }
  }

  // ------------------------------------------------------------------ per frame
  update(dt, game) {
    if (dt <= 0) { this._camera(0, game); return; }
    if (this.broken) {
      this._updateDebris(dt, game);
      return;
    }
    const fm = this.fm;
    const playing = this.occupied && game.state === 'playing';
    if (playing) this._controls(dt, game);
    else if (!this.occupied) {
      fm.elevator = damp(fm.elevator, 0, 4, dt); fm.aileron = damp(fm.aileron, 0, 4, dt); fm.rudder = damp(fm.rudder, 0, 4, dt);
    }
    fm.flaps = approach(fm.flaps, fm.flapsCmd, 0.22, dt);

    // world inputs: wind with gusts (stronger in storms), mooring line, drowned engine
    const w = U.uWind.value;
    const gust = (Math.sin(game.time * 0.7) * 0.5 + Math.sin(game.time * 1.9 + 1.3) * 0.3) * game.weather.p.gust;
    this.env.wind.set(w.x, 0, w.y).multiplyScalar(w.z * (6 + gust * 3));
    this.env.mooring = this.moored && !this.occupied ? { anchor: new THREE.Vector3(MOOR.x, 0, MOOR.z), heading: MOOR.heading } : null;
    const prop = this._v2.set(0, 0.12, 3.5).applyQuaternion(fm.quat).add(fm.pos);
    this.env.engineSubmerged = prop.y < this.ocean.heightAt(prop.x, prop.z) - 0.2;

    // physics in fixed steps
    let steps = Math.min(12, Math.ceil(dt / STEP));
    const h = dt / steps;
    const events = [];
    while (steps-- > 0) {
      fm.step(h, this.env);
      if (fm.events.length) events.push(...fm.events);
    }
    if (events.length) this._impacts(events, game);
    if (this.broken) return;
    this._sync();
    this._animate(dt, game);
    this._effects(dt, game);
    if (this.occupied) {
      this._camera(dt, game);
      this._bounds(dt, game);
      const p = game.player;
      p.pos.set(fm.pos.x, fm.pos.y - 1.0, fm.pos.z);
      p.prevPos.copy(p.pos);
      this.status = this._statusLine();
    }
    game.audio?.setPlane({ rpm: fm.engine === 'off' ? Math.min(fm.rpm, 0) : fm.rpm, airspeed: fm.out.airspeed, stall: this.occupied ? fm.out.stall : 0, inside: this.occupied && this.view === 'cockpit', position: fm.pos });
    this._mooringRope(dt);
  }

  _controls(dt, game) {
    const fm = this.fm;
    const inp = game.input;
    const key = (c) => inp.down.has(c);
    const tap = (c) => inp.pressed.has(c);
    const assist = game.settings.get('flightAssist') || 'normal';

    // mouse: look around, or fly with it while the right button is held
    const { dx, dy } = inp.consumeMouse();
    const yokeMode = inp.mouseDown[2];
    if (yokeMode) {
      this.yoke.x = clamp(this.yoke.x + dx * 1.4, -1, 1);
      this.yoke.y = clamp(this.yoke.y + dy * 1.4, -1, 1);
    } else {
      this.yoke.x = damp(this.yoke.x, 0, 6, dt);
      this.yoke.y = damp(this.yoke.y, 0, 6, dt);
      if (this.view === 'orbit') {
        this.orbit.yaw -= dx; this.orbit.pitch = clamp(this.orbit.pitch + dy, -0.3, 1.3);
      } else {
        this.lookYaw = clamp(this.lookYaw - dx, -2.6, 2.6);
        this.lookPitch = clamp(this.lookPitch - dy, -1.1, 0.9);
      }
    }

    // keyboard flight controls ramp like a real yoke instead of snapping
    const pull = (inp.isDown('back') ? 1 : 0) - (inp.isDown('forward') ? 1 : 0);
    const roll = (inp.isDown('right') ? 1 : 0) - (inp.isDown('left') ? 1 : 0);
    const ped = (key('KeyX') ? 1 : 0) - (key('KeyZ') ? 1 : 0);
    const tv = inp.virtualAxis; // touch stick: up = nose down, like pushing the yoke
    const elevT = clamp(pull - this.yoke.y + (tv ? -tv.y : 0), -1, 1);
    const ailT = clamp(roll + this.yoke.x + (tv ? tv.x : 0), -1, 1);
    this.input.elev = approach(this.input.elev, elevT, elevT === 0 ? 4 : 2.6, dt);
    this.input.ail = approach(this.input.ail, ailT, ailT === 0 ? 5 : 3.2, dt);
    this.input.rud = approach(this.input.rud, ped, ped === 0 ? 4 : 2.5, dt);

    const out = fm.out;
    const airborne = !out.onWater && !out.onGround && out.agl > 0.8;
    const cmd = this._cmd || (this._cmd = { pitch: 0, roll: 0, yaw: 0 });
    cmd.pitch = this.input.elev;
    cmd.roll = this.input.ail;
    // on the water A/D also steer with the water rudders (and the air rudder in the prop wash)
    cmd.yaw = airborne ? this.input.rud : clamp(this.input.rud + this.input.ail, -1, 1);
    this.assist.update(fm, cmd, assist, dt);

    // throttle: R / F or the mouse wheel (the wheel zooms the orbit camera instead)
    let thr = fm.throttle;
    if (key('KeyR') || key('ShiftLeft') && !tv) thr += dt * 0.55;
    if (key('KeyF')) thr -= dt * 0.55;
    if (inp.wheel) {
      if (this.view === 'orbit') this.orbit.dist = clamp(this.orbit.dist * (1 + inp.wheel * 0.1), 7, 60);
      else thr -= inp.wheel * 0.05;
    }
    fm.throttle = clamp(thr, 0, 1);

    // flaps G / B, trim [ ] or PgUp / PgDn
    if (tap('KeyG')) fm.flapsCmd = FLAP_NOTCHES[Math.max(0, FLAP_NOTCHES.indexOf(this._notch()) - 1)];
    if (tap('KeyB')) fm.flapsCmd = FLAP_NOTCHES[Math.min(3, FLAP_NOTCHES.indexOf(this._notch()) + 1)];
    if (tap('FlapsCycle')) fm.flapsCmd = FLAP_NOTCHES[(FLAP_NOTCHES.indexOf(this._notch()) + 1) % 4];
    if (key('BracketRight') || key('PageUp')) fm.trim = clamp(fm.trim + dt * 0.3, -1, 1);
    if (key('BracketLeft') || key('PageDown')) fm.trim = clamp(fm.trim - dt * 0.3, -1, 1);
    if (tap('KeyU')) { fm.waterRudders = !fm.waterRudders; game.audio?.play('click', { volume: 0.4 }); }
    if (tap('KeyL')) { this.lightsOn = !this.lightsOn; game.audio?.play('click', { volume: 0.4 }); }
    if (tap('KeyV')) this.view = this.view === 'cockpit' ? 'chase' : 'cockpit';
    if (tap('KeyO')) { this.view = this.view === 'orbit' ? 'chase' : 'orbit'; this.orbit.yaw = Math.atan2(this._fwd().x, this._fwd().z) + Math.PI; }

    // engine: hold Q to crank, tap Q to stop
    if (key('KeyQ')) {
      this.holdQ += dt;
      if (this.holdQ > 0.35 && fm.engine === 'off') {
        if (this.env.engineSubmerged || this.damage >= 90) game.toast('The engine won’t turn over.');
        else {
          fm.engine = 'cranking'; fm.crankTime = 0; game.audio?.play('starter', { position: fm.pos, volume: 0.9 });
          if (!this.tipShown) {
            this.tipShown = true;
            setTimeout(() => game.toast('Take-off: flaps 20\u00b0 (B twice), full throttle (R), run east or west along the middle of the lagoon, ease back (S) at 55 kt.'), 2500);
          }
        }
      }
    } else {
      if (this.holdQ > 0 && this.holdQ < 0.3 && fm.engine !== 'off') { fm.engine = 'off'; game.audio?.play('click', { volume: 0.5 }); }
      this.holdQ = 0;
    }

    // hold E to climb out
    if (key('KeyE')) {
      if (this.holdE >= 0) {
        this.holdE += dt;
        if (this.holdE > 0.45) { this.holdE = -1; this.exit(game); }
      }
    } else this.holdE = 0;
  }

  _notch() {
    let best = 0;
    for (const n of FLAP_NOTCHES) if (Math.abs(n - this.fm.flapsCmd) < Math.abs(best - this.fm.flapsCmd)) best = n;
    return best;
  }

  // ------------------------------------------------------------------ damage
  _impacts(events, game) {
    let crash = false;
    for (const e of events) {
      if (e.part === 'float') {
        if (e.kind === 'water') {
          if (e.speed > 4.6 || e.h > 48) crash = true;
          else if (e.speed > 2.6) this._hurt((e.speed - 2.6) * 22, game);
        } else if (e.speed > 3.6 || e.h > 16) crash = true;
        else if (e.h > 6) this._hurt(e.h * 2, game);
      } else if (e.kind === 'solid' || e.kind === 'ground') {
        if (e.speed > 4) crash = true; else this._hurt(e.speed * 6, game);
      } else if (e.kind === 'water') {
        const tip = e.part.startsWith('wingtip') || e.part.startsWith('stab');
        if (tip && e.speed < 12) this._hurt(8 + e.speed * 3, game);
        else if (e.speed > 6) crash = true;
        else this._hurt(e.speed * 4, game);
      }
    }
    if (crash || this.damage >= 100) this.breakUp(game);
  }

  _hurt(amount, game) {
    const before = this.damage;
    this.damage = Math.min(100, this.damage + amount);
    if (this.occupied) {
      game.audio?.play('knock', { volume: Math.min(1, 0.4 + amount / 30) });
      if (before < 25 && this.damage >= 25) game.toast('Hard landing — the windshield cracked.');
      if (before < 60 && this.damage >= 60) game.toast('The engine is running rough.');
    }
    this.fm.roughness = smoothstep(55, 95, this.damage) * 0.7;
  }

  /** The airframe comes apart: each piece becomes a free body that floats, tumbles and sinks. */
  breakUp(game) {
    if (this.broken) return;
    const fm = this.fm;
    this.broken = true;
    this.damage = 100;
    fm.engine = 'off';
    this.interactable.enabled = false;
    const crashPos = fm.pos.clone();
    const water = this.ocean.heightAt(crashPos.x, crashPos.z);
    const ground = this.ground(crashPos.x, crashPos.z);
    const box = new THREE.Box3();
    const center = new THREE.Vector3();
    for (const piece of this.model.pieces) {
      box.setFromObject(piece);
      box.getCenter(center);
      const pivot = new THREE.Group();
      pivot.position.copy(center);
      this.scene.add(pivot);
      pivot.updateMatrixWorld();
      pivot.attach(piece);
      const isFloat = piece.name.startsWith('float'), isWing = piece.name.startsWith('wing');
      const spin = new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
      const kick = new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 3, (Math.random() - 0.5) * 5);
      this.debris.push({
        obj: pivot, piece, vel: fm.vel.clone().multiplyScalar(0.55).add(kick), spin,
        buoy: isFloat ? 2.2 : isWing ? 1.25 : 1.05, sink: isFloat ? 0.004 : isWing ? 0.012 : 0.02,
        radius: isWing ? 3 : isFloat ? 2.5 : 3.5,
      });
    }
    this.model.lights.visible = false;
    // spray, smoke and noise
    if (water > ground) {
      for (let k = 0; k < 6; k++) this.particles.splash(crashPos.x + (Math.random() - 0.5) * 8, water, crashPos.z + (Math.random() - 0.5) * 8, 2.5);
      for (let k = 0; k < 6; k++) this.ripples.addDrop(crashPos.x + (Math.random() - 0.5) * 10, crashPos.z + (Math.random() - 0.5) * 10, 3, 0.6);
    } else for (let k = 0; k < 4; k++) this.particles.sandPuff(crashPos.x + (Math.random() - 0.5) * 6, ground, crashPos.z + (Math.random() - 0.5) * 6, 3);
    for (let k = 0; k < 14; k++) this.particles.spawn({ pos: { x: crashPos.x, y: crashPos.y + 1, z: crashPos.z }, vel: { x: (Math.random() - 0.5) * 3, y: 1 + Math.random() * 2, z: (Math.random() - 0.5) * 3 }, life: 4, size: 0.8, grow: 2.5, color: [0.2, 0.2, 0.2], alpha: 0.45, drag: 0.7, kind: 0 });
    game.audio?.play('crash', { position: crashPos, volume: 1 });
    game.audio?.play('splash', { position: crashPos, volume: 1, rate: 0.6 });
    game.renderer.grade.flash = 0.5;

    if (this.occupied) {
      this.occupied = false;
      game.ui.showFlightHelp?.(false);
      const yaw = Math.atan2(-fm.vel.x, -fm.vel.z);
      const px = crashPos.x + 2.5, pz = crashPos.z + 2.5;
      game.player.spawn(px, pz, yaw, 0.2);
      if (water > ground + 1.2) {
        // thrown clear under the surface, like a real ditching
        game.player.pos.y = water - 2.6;
        game.player.mode = 'swim';
      } else game.player.mode = 'walk';
      game.toast('The seaplane broke apart. You got clear of the wreck.');
      setTimeout(() => game.toast('She’ll be recovered and patched up at the pier.'), 4000);
    }
    this.respawnTimer = 22;
    game.audio?.setPlane({ rpm: 0, airspeed: 0, stall: 0, position: crashPos });
  }

  _updateDebris(dt, game) {
    const q = this._q;
    for (const d of this.debris) {
      const p = d.obj.position;
      const water = this.ocean.heightAt(p.x, p.z);
      const ground = this.ground(p.x, p.z);
      d.vel.y -= 9.81 * dt;
      const depth = water - p.y;
      if (depth > -0.3 && water > ground) {
        const sub = clamp((depth + 0.3) / 0.9, 0, 1);
        d.vel.y += d.buoy * 9.81 * sub * dt;
        d.buoy = Math.max(0, d.buoy - d.sink * dt);
        d.vel.multiplyScalar(Math.exp(-2.4 * sub * dt));
        d.spin.multiplyScalar(Math.exp(-2.5 * sub * dt));
        // settle towards lying flat on the water
        d.obj.quaternion.slerp(this._q.setFromEuler(this._e.set(0, d.obj.rotation.y, 0)), 1 - Math.exp(-0.6 * sub * dt));
        if (Math.random() < dt * 2 * sub && d.buoy > 0.5) this.ripples.addDrop(p.x, p.z, 1.2, 0.05);
      }
      if (p.y < ground + 0.4) {
        p.y = ground + 0.4;
        if (d.vel.y < 0) d.vel.y *= -0.25;
        d.vel.x *= 1 - Math.min(1, dt * 4); d.vel.z *= 1 - Math.min(1, dt * 4);
        d.spin.multiplyScalar(1 - Math.min(1, dt * 5));
      }
      p.addScaledVector(d.vel, dt);
      const ang = d.spin.length();
      if (ang > 1e-4) {
        q.setFromAxisAngle(this._v.copy(d.spin).divideScalar(ang), ang * dt);
        d.obj.quaternion.premultiply(q);
      }
    }
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.atPier();
      game.toast('The seaplane is back at the pier, patched up.');
    }
  }

  _reassemble() {
    for (const d of this.debris) this.scene.remove(d.obj);
    this.debris.length = 0;
    for (const piece of this.model.pieces) {
      if (piece.parent !== this.model.root) {
        this.model.root.add(piece);
        piece.position.copy(piece.userData.home.position);
        piece.quaternion.copy(piece.userData.home.quaternion);
      }
    }
    this.interactable.enabled = !this.occupied;
  }

  // ------------------------------------------------------------------ visuals
  _sync() {
    const r = this.model.root;
    r.position.copy(this.fm.pos);
    r.quaternion.copy(this.fm.quat);
    r.updateMatrixWorld();
  }

  _animate(dt, game) {
    const m = this.model, fm = this.fm;
    m.elevator.rotation.x = clamp(fm.elevator + fm.trim * 0.3, -1, 1) * 0.35;
    m.rudder.rotation.y = fm.rudder * 0.42;
    m.ailerons[0].rotation.x = -fm.aileron * 0.3;
    m.ailerons[1].rotation.x = fm.aileron * 0.3;
    for (const f of m.flaps) f.rotation.x = -fm.flaps * 0.52;
    for (const wr of m.waterRudders) {
      wr.rotation.y = fm.rudder * 0.5;
      wr.rotation.x = damp(wr.rotation.x, fm.waterRudders ? 0 : -1.4, 4, dt);
    }
    // propeller: blades below ~900 rpm, then a blurred disc
    m.blades.rotation.z += (fm.rpm / 60) * Math.PI * 2 * dt;
    const blur = smoothstep(380, 900, fm.rpm);
    m.disc.material.opacity = blur * 0.9;
    m.disc.rotation.z += dt * 2.3;
    m.blades.visible = blur < 0.98;
    for (const y of m.yokes) {
      y.position.z = y.userData.z0 - fm.elevator * 0.07;
      y.userData.wheel.rotation.z = fm.aileron * 1.0;
    }
    m.throttle.rotation.x = lerp(-0.5, 0.45, fm.throttle);
    m.trimCrank.rotation.y = fm.trim * 6;
    const fwd = this._fwd();
    const heading = Math.atan2(fwd.x, fwd.z);
    m.compassCard.rotation.y = -heading + Math.sin(game.time * 1.7) * 0.02 * fm.out.airspeed / 50;
    m.cracks.visible = this.damage > 22;
    m.crackMat.opacity = smoothstep(22, 70, this.damage) * 0.9;
    m.lights.visible = this.lightsOn;
    if (this.lightsOn) {
      const strobe = (game.time % 1.3) < 0.06;
      m.nav[0].scale.setScalar(strobe ? 3.2 : 0.9);
      m.nav[1].scale.setScalar(strobe ? 3.2 : 0.9);
    }
    // instruments at ~15 Hz while someone is in the cabin
    this.panelTimer -= dt;
    if (this.occupied && this.view === 'cockpit' && this.panelTimer <= 0) {
      this.panelTimer = 1 / 15;
      this._drawPanel();
    }
  }

  _effects(dt, game) {
    const fm = this.fm;
    const out = fm.out;
    this.fxTimer -= dt;
    if (this.fxTimer > 0) return;
    this.fxTimer = 0.05;
    const v = Math.hypot(fm.vel.x, fm.vel.z);
    const fwd = this._v.copy(fm.vel); fwd.y = 0; if (v > 0.1) fwd.divideScalar(v);
    if (out.onWater && v > 1.5) {
      for (const s of [1, -1]) {
        const bow = this._v2.set(s * 1.55, -1.9, 2.4 + out.planing * -1.8).applyQuaternion(fm.quat).add(fm.pos);
        const wy = this.ocean.heightAt(bow.x, bow.z);
        this.ripples.addDrop(bow.x, bow.z, 0.8, Math.min(0.12, v * 0.008));
        if (v > 5 && Math.random() < 0.7) {
          const side = this._v.set(s, 0, 0).applyQuaternion(fm.quat);
          this.particles.spray(bow.x, wy + 0.05, bow.z, side.x * 2 + fm.vel.x * 0.3, 1 + v * 0.06, side.z * 2 + fm.vel.z * 0.3, 2 + Math.floor(v / 8));
        }
      }
    }
    // prop wash on the water close to the surface
    if (fm.rpm > 1200 && out.agl < 5) {
      const p = this._v2.set(0, -2, -2 - Math.random() * 6).applyQuaternion(fm.quat).add(fm.pos);
      this.ripples.addDrop(p.x, p.z, 1.5, 0.05 * (fm.rpm / 2300));
    }
    // engine smoke when damaged
    if (this.damage > 55 && fm.engine !== 'off') {
      const p = this._v2.set(-0.5, -0.3, 2.3).applyQuaternion(fm.quat).add(fm.pos);
      this.particles.spawn({ pos: { x: p.x, y: p.y, z: p.z }, vel: { x: fm.vel.x * 0.4, y: 0.5, z: fm.vel.z * 0.4 }, life: 2.2, size: 0.25, grow: 1.6, color: [0.18, 0.18, 0.18], alpha: 0.35 * (this.damage / 100), drag: 1.2, kind: 0 });
    }
  }

  _camera(dt, game) {
    if (!this.occupied) return;
    const cam = game.camera;
    const fm = this.fm;
    const m = this.model;
    if (this.view === 'cockpit') {
      // the head sways with g-load and shakes on the water
      const shake = (fm.out.onWater ? 0.008 * smoothstep(3, 18, fm.out.airspeed) : 0) + (fm.rpm > 300 ? 0.0012 : 0);
      const eye = this._v.copy(m.eye);
      eye.y -= clamp((fm.out.gLoad - 1) * 0.025, -0.05, 0.06);
      eye.x += (Math.random() - 0.5) * shake; eye.y += (Math.random() - 0.5) * shake;
      cam.position.copy(eye.applyQuaternion(fm.quat).add(fm.pos));
      this._q.setFromAxisAngle(this._v2.set(0, 1, 0), Math.PI);
      cam.quaternion.copy(fm.quat).multiply(this._q);
      this._e.set(this.lookPitch, this.lookYaw, 0, 'YXZ');
      cam.quaternion.multiply(this._q.setFromEuler(this._e));
    } else {
      const fwd = this._fwd().clone();
      let target;
      if (this.view === 'chase') {
        const heading = Math.atan2(fwd.x, fwd.z);
        const pitch = Math.asin(clamp(fwd.y, -1, 1)) * 0.6;
        const dir = this._v2.set(Math.sin(heading) * Math.cos(pitch), Math.sin(pitch), Math.cos(heading) * Math.cos(pitch));
        target = fm.pos.clone().addScaledVector(dir, -15).add(this._v.set(0, 3.6, 0));
        const k = dt > 0 ? 1 - Math.exp(-5 * dt) : 1;
        if (this.chasePos.distanceToSquared(target) > 2500) this.chasePos.copy(target);
        else this.chasePos.lerp(target, k);
        this.chaseLook.copy(fm.pos).addScaledVector(fwd, 6).add(this._v.set(0, 1.2, 0));
      } else {
        const o = this.orbit;
        this.chasePos.set(Math.sin(o.yaw) * Math.cos(o.pitch), Math.sin(o.pitch), Math.cos(o.yaw) * Math.cos(o.pitch)).multiplyScalar(o.dist).add(fm.pos);
        this.chaseLook.copy(fm.pos);
      }
      const floor = Math.max(this.ocean.heightAt(this.chasePos.x, this.chasePos.z), this.ground(this.chasePos.x, this.chasePos.z)) + 0.8;
      if (this.chasePos.y < floor) this.chasePos.y = floor;
      cam.position.copy(this.chasePos);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.chaseLook);
    }
    cam.updateMatrixWorld();
    const p = game.player;
    p.yaw = Math.atan2(-this._fwd().x, -this._fwd().z);
    p.pitch = 0;
  }

  _bounds(dt, game) {
    const r = Math.hypot(this.fm.pos.x, this.fm.pos.z);
    this.warnTimer -= dt;
    if (r > 2600 && this.warnTimer <= 0) {
      this.warnTimer = 14;
      game.toast('Fuel is getting low — turn back toward the island.');
    }
    if (r > 3400) {
      // the long way home: put her back on a heading for the island
      const k = 2000 / r;
      const heading = Math.atan2(-this.fm.pos.x, -this.fm.pos.z);
      const alt = Math.max(this.fm.pos.y, 120);
      this.fm.reset(new THREE.Vector3(this.fm.pos.x * k, alt, this.fm.pos.z * k), heading, { speed: Math.max(40, this.fm.out.airspeed), engineOn: this.fm.engine !== 'off' });
      this.assist.reset();
      game.toast('You turned back for the island.');
    }
  }

  _mooringRope(dt) {
    this._ropeTimer -= dt;
    if (this._ropeTimer > 0) return;
    this._ropeTimer = 0.1;
    if (this.moored && !this.occupied && !this.broken) {
      const cleat = this._v.set(-1.55, -1.48, 3.6).applyQuaternion(this.fm.quat).add(this.fm.pos);
      const post = this._v2.set(PIER.x - PIER.width / 2 + 0.08, 0, MOOR.z - 4);
      post.y = this.collision.ground(post.x, post.z, 10).y + 0.25;
      this.rope.geometry.dispose();
      this.rope.geometry = ropeGeometry(post.clone(), cleat.clone(), 0.3, 0.014, 10);
      this.rope.visible = true;
    } else this.rope.visible = false;
  }

  // ------------------------------------------------------------------ HUD
  _statusLine() {
    const fm = this.fm, o = fm.out;
    const kt = Math.round(o.airspeed * KT);
    const ft = Math.round(Math.max(0, fm.pos.y - 1.9) * FT);
    const fpm = Math.round(o.vs * FT * 60 / 10) * 10;
    const flaps = Math.round(fm.flaps * 30);
    const trim = Math.round(fm.trim * 100);
    const eng = fm.engine === 'running' ? 'ENGINE RUNNING' : fm.engine === 'cranking' ? 'STARTING' : 'ENGINE OFF';
    let s = `<span>${kt} KT</span><span>${ft} FT</span><span>${fpm > 0 ? '+' : ''}${fpm} FPM</span><span>THR ${Math.round(fm.throttle * 100)}%</span><span>${Math.round(fm.rpm)} RPM</span><span>FLAPS ${flaps}°</span><span>TRIM ${trim > 0 ? '+' : ''}${trim}</span><span>W.RUD ${fm.waterRudders ? 'DN' : 'UP'}</span><span>${eng}</span>`;
    if (o.stall > 0.5 && !o.onWater) s += '<span class="warn">STALL</span>';
    if (this.damage > 22) s += `<span class="warn">DAMAGE ${Math.round(this.damage)}%</span>`;
    return s;
  }

  // ------------------------------------------------------------------ cockpit panel
  _drawPanel() {
    const { ctx: g, canvas, texture } = this.model.panel;
    const W = canvas.width, H = canvas.height;
    const fm = this.fm, o = fm.out;
    const fwd = this._fwd();
    // compass heading: 0 = north (-Z), 90 = east (+X)
    const hdg = ((Math.atan2(fwd.x, -fwd.z) * 180) / Math.PI + 360) % 360;
    const right = this._v2.set(-1, 0, 0).applyQuaternion(fm.quat);
    const bank = Math.asin(clamp(-right.y, -1, 1));
    const pitch = Math.asin(clamp(fwd.y, -1, 1));
    g.fillStyle = '#1e2021';
    g.fillRect(0, 0, W, H);
    // panel texture: subtle crinkle + screws
    g.fillStyle = 'rgba(255,255,255,0.025)';
    for (let i = 0; i < 60; i++) g.fillRect((i * 97) % W, (i * 53) % H, 2, 2);
    const R = 74;
    const gauge = (cx, cy, label) => {
      g.save();
      g.translate(cx, cy);
      g.fillStyle = '#0c0d0d'; g.beginPath(); g.arc(0, 0, R + 8, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#3a3c3d'; g.lineWidth = 3; g.stroke();
      g.fillStyle = '#121414'; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#9aa0a0'; g.font = '11px Arial'; g.textAlign = 'center';
      if (label) g.fillText(label, 0, R * 0.48);
      return g;
    };
    const ticks = (from, to, n, major, r0 = R - 12, labels = null) => {
      g.strokeStyle = '#e8e4da'; g.fillStyle = '#e8e4da'; g.font = 'bold 14px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 0; i <= n; i++) {
        const a = from + (to - from) * (i / n);
        const big = i % major === 0;
        g.lineWidth = big ? 2.5 : 1.2;
        g.beginPath(); g.moveTo(Math.cos(a) * (big ? r0 - 8 : r0 - 3), Math.sin(a) * (big ? r0 - 8 : r0 - 3)); g.lineTo(Math.cos(a) * r0, Math.sin(a) * r0); g.stroke();
        if (big && labels) { const t = labels(i); if (t !== null) g.fillText(t, Math.cos(a) * (r0 - 24), Math.sin(a) * (r0 - 24)); }
      }
    };
    const needle = (a, len, w = 4, color = '#f4f1e8') => {
      g.save(); g.rotate(a); g.fillStyle = color; g.beginPath(); g.moveTo(-w / 2, 8); g.lineTo(0, -len); g.lineTo(w / 2, 8); g.fill(); g.restore();
      g.fillStyle = '#333'; g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fill();
    };
    const A0 = -Math.PI * 0.75; // start angle (towards lower left)
    const cols = [150, 330, 510];
    const rows = [118, 318];
    // 1 airspeed (kt) 0..180
    {
      gauge(cols[0], rows[0], 'KNOTS');
      const ang = (kt) => -Math.PI / 2 - Math.PI * 0.8 + (kt / 180) * Math.PI * 1.6;
      g.lineWidth = 7;
      const arc = (a, b, c) => { g.strokeStyle = c; g.beginPath(); g.arc(0, 0, R - 5, ang(a), ang(b)); g.stroke(); };
      arc(45, 95, '#e8e8e8'); arc(55, 120, '#2fa84f'); arc(120, 150, '#e0b020'); arc(150, 153, '#d42');
      ticks(ang(0), ang(180), 18, 2, R - 10, (i) => (i * 10) % 40 === 0 ? String(i * 10) : null);
      needle(ang(Math.min(180, o.airspeed * KT)) + Math.PI / 2, R - 16);
      g.restore();
    }
    // 2 attitude indicator
    {
      gauge(cols[1], rows[0], null);
      g.save();
      g.beginPath(); g.arc(0, 0, R - 2, 0, Math.PI * 2); g.clip();
      g.rotate(-bank);
      const py = (pitch * 180 / Math.PI) * 3.2;
      g.fillStyle = '#3d7fc4'; g.fillRect(-R * 2, -R * 2 + py, R * 4, R * 2);
      g.fillStyle = '#6b4a2c'; g.fillRect(-R * 2, py, R * 4, R * 2);
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(-R * 2, py); g.lineTo(R * 2, py); g.stroke();
      g.lineWidth = 1.5; g.fillStyle = '#fff'; g.font = '10px Arial';
      for (const d of [-20, -10, 10, 20]) { const y = py - d * 3.2; const w = d % 20 === 0 ? 26 : 16; g.beginPath(); g.moveTo(-w, y); g.lineTo(w, y); g.stroke(); }
      g.restore();
      // bank scale + fixed aeroplane symbol
      g.strokeStyle = '#fff'; g.lineWidth = 2;
      for (const d of [-60, -30, -20, -10, 0, 10, 20, 30, 60]) { const a = -Math.PI / 2 + (d * Math.PI) / 180; g.beginPath(); g.moveTo(Math.cos(a) * (R - 2), Math.sin(a) * (R - 2)); g.lineTo(Math.cos(a) * (R - (d % 30 === 0 ? 14 : 8)), Math.sin(a) * (R - (d % 30 === 0 ? 14 : 8))); g.stroke(); }
      g.save(); g.rotate(-bank); g.fillStyle = '#ffb030'; g.beginPath(); g.moveTo(0, -R + 4); g.lineTo(-6, -R + 15); g.lineTo(6, -R + 15); g.fill(); g.restore();
      g.strokeStyle = '#ffb030'; g.lineWidth = 4; g.beginPath(); g.moveTo(-40, 0); g.lineTo(-14, 0); g.lineTo(-8, 8); g.moveTo(40, 0); g.lineTo(14, 0); g.lineTo(8, 8); g.stroke();
      g.fillStyle = '#ffb030'; g.beginPath(); g.arc(0, 0, 3, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    // 3 altimeter (ft): 100s and 1000s hands
    {
      gauge(cols[2], rows[0], 'ALT FT');
      ticks(-Math.PI / 2, Math.PI * 1.5, 50, 5, R - 10, (i) => (i < 50 && i % 5 === 0 ? String(i / 5) : null));
      const ft = Math.max(0, fm.pos.y - 1.9) * FT;
      needle(((ft % 10000) / 10000) * Math.PI * 2, R - 40, 7, '#d8d4c8');
      needle(((ft % 1000) / 1000) * Math.PI * 2, R - 16, 4);
      g.restore();
    }
    // 4 turn coordinator
    {
      gauge(cols[0], rows[1], 'TURN COORD.');
      const turnRate = -fm.omega.y; // rad/s, right positive (approx)
      g.save(); g.rotate(clamp(turnRate / 0.0524, -1.6, 1.6) * 0.35);
      g.strokeStyle = '#f4f1e8'; g.lineWidth = 4; g.beginPath(); g.moveTo(-46, 0); g.lineTo(46, 0); g.moveTo(0, 0); g.lineTo(0, -12); g.stroke();
      g.restore();
      g.strokeStyle = '#e8e4da'; g.lineWidth = 2;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 54 * Math.cos(0.35), 54 * Math.sin(0.35 * s) * s); g.lineTo(s * 64 * Math.cos(0.35), 64 * Math.sin(0.35 * s) * s); g.stroke(); }
      // slip ball
      g.fillStyle = '#2a2c2c'; g.fillRect(-36, 26, 72, 16);
      g.fillStyle = '#111'; g.beginPath(); g.arc(clamp(-o.beta * 160, -30, 30), 34, 7, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ccc'; g.lineWidth = 1; g.strokeRect(-9, 26, 18, 16);
      g.restore();
    }
    // 5 heading indicator
    {
      gauge(cols[1], rows[1], null);
      g.save();
      g.rotate((-hdg * Math.PI) / 180);
      g.fillStyle = '#e8e4da'; g.font = 'bold 15px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const names = { 0: 'N', 9: 'E', 18: 'S', 27: 'W' };
      for (let k = 0; k < 36; k++) {
        const a = (k / 36) * Math.PI * 2 - Math.PI / 2;
        g.strokeStyle = '#e8e4da'; g.lineWidth = k % 3 === 0 ? 2.4 : 1.2;
        const r1 = R - 4, r2 = R - (k % 3 === 0 ? 14 : 9);
        g.beginPath(); g.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); g.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); g.stroke();
        if (k % 3 === 0) { g.save(); g.translate(Math.cos(a) * (R - 26), Math.sin(a) * (R - 26)); g.rotate(a + Math.PI / 2); g.fillText(names[k] || String(k), 0, 0); g.restore(); }
      }
      g.restore();
      g.fillStyle = '#ffb030'; g.beginPath(); g.moveTo(0, -24); g.lineTo(-10, 14); g.lineTo(0, 8); g.lineTo(10, 14); g.fill();
      g.fillStyle = '#ffb030'; g.beginPath(); g.moveTo(0, -R + 2); g.lineTo(-6, -R - 6); g.lineTo(6, -R - 6); g.fill();
      g.restore();
    }
    // 6 vertical speed (fpm ×1000)
    {
      gauge(cols[2], rows[1], 'VERT SPEED');
      const ang = (k) => Math.PI + clamp(k, -2, 2) * (Math.PI * 0.85 / 2);
      ticks(ang(-2), ang(2), 8, 2, R - 10, (i) => String(Math.abs(i / 2 - 2)));
      needle(ang((o.vs * FT * 60) / 1000) + Math.PI / 2, R - 16);
      g.restore();
    }
    // engine cluster: tachometer, oil, fuel, flaps, trim
    {
      gauge(700, 118, 'RPM ×100');
      const ang = (r) => -Math.PI * 1.25 + (r / 3000) * Math.PI * 1.5;
      g.lineWidth = 7; g.strokeStyle = '#2fa84f'; g.beginPath(); g.arc(0, 0, R - 5, ang(1700), ang(2300)); g.stroke();
      g.strokeStyle = '#d42'; g.beginPath(); g.arc(0, 0, R - 5, ang(2300), ang(2330)); g.stroke();
      ticks(ang(0), ang(3000), 30, 5, R - 10, (i) => String(i));
      needle(ang(fm.rpm) + Math.PI / 2, R - 16);
      g.restore();
    }
    // small gauges and annunciators
    const small = (cx, cy, label, frac, warn = false) => {
      g.save(); g.translate(cx, cy);
      g.fillStyle = '#0c0d0d'; g.beginPath(); g.arc(0, 0, 36, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#3a3c3d'; g.lineWidth = 2; g.stroke();
      g.strokeStyle = warn ? '#d42' : '#2fa84f'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 28, Math.PI * 0.8, Math.PI * 1.5); g.stroke();
      const a = Math.PI * 0.75 + clamp(frac, 0, 1) * Math.PI * 0.95;
      g.strokeStyle = '#f4f1e8'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 28, Math.sin(a) * 28); g.stroke();
      g.fillStyle = '#9aa0a0'; g.font = '10px Arial'; g.textAlign = 'center'; g.fillText(label, 0, 22);
      g.restore();
    };
    const running = fm.engine === 'running';
    small(660, 290, 'OIL P', running ? 0.75 - this.damage / 300 : 0, this.damage > 60);
    small(745, 290, 'OIL T', running ? 0.45 + fm.throttle * 0.25 + this.damage / 400 : 0.1, this.damage > 60);
    small(830, 290, 'FUEL', 0.72);
    // flap and trim indicators
    g.save(); g.translate(850, 70);
    g.fillStyle = '#0c0d0d'; g.fillRect(-14, 0, 28, 150);
    g.fillStyle = '#9aa0a0'; g.font = '10px Arial'; g.textAlign = 'center'; g.fillText('FLAPS', 0, 166);
    for (const n of [0, 1, 2, 3]) { g.fillStyle = '#e8e4da'; g.fillRect(-14, n * 48 + 2, 8, 2); }
    g.fillStyle = '#ffb030'; g.fillRect(-6, fm.flaps * 144, 18, 6);
    g.restore();
    g.save(); g.translate(910, 70);
    g.fillStyle = '#0c0d0d'; g.fillRect(-14, 0, 28, 150);
    g.fillStyle = '#9aa0a0'; g.font = '10px Arial'; g.textAlign = 'center'; g.fillText('TRIM', 0, 166);
    g.fillStyle = '#e8e4da'; g.fillRect(-14, 74, 28, 2);
    g.fillStyle = '#ffb030'; g.fillRect(-10, 72 - clamp(fm.trim, -1, 1) * 70, 20, 6);
    g.restore();
    // radio: an amber seven-segment style readout
    g.save(); g.translate(940, 300);
    g.fillStyle = '#0a0a0a'; g.fillRect(-60, -40, 120, 80);
    g.fillStyle = '#ff9a2a'; g.font = 'bold 20px "Courier New", monospace'; g.textAlign = 'center';
    g.fillText('123.45', 0, -10);
    g.fillStyle = '#8a5a20'; g.fillText('121.50', 0, 22);
    g.restore();
    // annunciator lights
    const lamp = (x, y, text, on, color) => {
      g.fillStyle = on ? color : '#2a2a2a'; g.fillRect(x, y, 86, 22);
      g.fillStyle = on ? '#111' : '#555'; g.font = 'bold 12px Arial'; g.textAlign = 'center'; g.fillText(text, x + 43, y + 15);
    };
    lamp(640, 360, 'STALL', o.stall > 0.5 && !o.onWater, '#e23b2a');
    lamp(735, 360, 'W.RUD DN', fm.waterRudders, '#3cbf6a');
    lamp(830, 360, 'STARTER', fm.engine === 'cranking', '#e0b020');
    lamp(640, 392, 'NAV LTS', this.lightsOn, '#3cbf6a');
    lamp(735, 392, 'LOW OIL', this.damage > 60, '#e23b2a');
    lamp(830, 392, 'FLAPS', fm.flaps > 0.02, '#e0b020');
    g.fillStyle = '#9aa0a0'; g.font = 'bold 13px Arial'; g.textAlign = 'left';
    g.fillText('PT-ILH', 40, 430);
    texture.needsUpdate = true;
  }
}
