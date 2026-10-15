// Ground service routine run by the badeco when the aircraft is parked on the
// pad with the engine off: walk to the reel, carry the hose along a safe path
// (behind the wing, never in front of the prop), connect, transfer the fluid
// gradually, disconnect, reel the hose back in and return to the post.
// Separate fuel (ethanol, wing filler) and application liquid (hopper
// quick-fill coupler) circuits. Any attempt to move the aircraft aborts.
import * as THREE from 'three';
import { Badeco } from './badeco.js';
import { Hose } from './hose.js';
import { BASE } from '../world/layout.js';

export const SERVICE = { fuelRate: 4.5, liquidRate: 14, walk: 1.35, carry: 1.1, run: 3.0 };

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _l = new THREE.Vector3();
const _qi = new THREE.Quaternion();

// Plane-local waypoints (body x = left, z = forward; y ignored for walking)
// come from the aircraft type: A behind the wingtip trailing edge, B halfway
// in, F where the badeco stands for the fuel filler, P by the hopper coupler.

export class GroundService {
  constructor(game) {
    this.game = game;
    this.badeco = new Badeco(game.scene);
    this.fuelHose = new Hose(game.scene, 0x161616, 0.03);
    this.mixHose = new Hose(game.scene, 0x2a63b8, 0.035);
    const ft = BASE.fuelTank, mt = BASE.mixTank;
    this.fuelReel = new THREE.Vector3(ft.x + 3.3, 1.0, ft.z + 1.85);
    this.mixReel = new THREE.Vector3(mt.x + 1.6, 1.0, mt.z + 1.3);
    this.post = new THREE.Vector3(BASE.crewPost.x, 0, BASE.crewPost.z + 0.3);
    this.fuelHose.reset(this.fuelReel);
    this.mixHose.reset(this.mixReel);
    this.badeco.setPosition(this.post.x, 0, this.post.z);
    this.badeco.heading = Math.PI;
    this.state = 'idle';
    this.queue = [];
    this.step = null;
    this.target = { fuel: 0, liquid: 0 };
    this.fast = 1;
    this.message = '';
    this.loaded = { fuel: 0, liquid: 0 };
    this.parkRef = null;
    this.carry = null; // 'fuel' | 'mix' | null
    this.connected = null; // 'fuel' | 'mix' | null
    this.pumpOn = false;
  }

  // Aircraft parked in the service area?
  inZone() {
    const ac = this.game.aircraft;
    const p = BASE.pad;
    return Math.hypot(ac.fm.pos.x - p.x, ac.fm.pos.z - p.z) < p.radius;
  }
  ready() {
    const fm = this.game.aircraft.fm;
    return this.inZone() && fm.engine === 'off' && fm.out.groundSpeed < 0.25 && fm.out.onGround && this.game.aircraft.state === 'ok';
  }
  busy() { return this.state === 'working' || this.state === 'aborting'; }

  // Called before an engine start; returns a veto message while the crew is close.
  engineVeto() {
    if (this.state === 'working') {
      this.abort('Engine start requested — ground crew clearing the aircraft.');
      return 'Ground crew is clearing the aircraft. Wait for the all-clear before starting.';
    }
    if (this.state === 'aborting') return 'Ground crew is still clearing the aircraft.';
    const ac = this.game.aircraft;
    if (this.badeco.pos.distanceTo(_v.set(ac.fm.pos.x, this.badeco.pos.y, ac.fm.pos.z)) < ac.type.service.veto) return 'Ground crew is too close to the propeller.';
    return null;
  }

  request(fuelTarget, liquidTarget) {
    const ac = this.game.aircraft, fm = ac.fm;
    this.target.fuel = Math.min(ac.A.fuelCapacity, Math.max(fm.fuel, fuelTarget));
    this.target.liquid = Math.min(ac.A.hopperCapacity, Math.max(fm.hopper, liquidTarget));
    if (!this.ready()) {
      this.game.toast('Park on the service pad and shut the engine down for service.');
      return false;
    }
    this.parkRef = fm.pos.clone();
    this.side = this._side();
    this.loaded.fuel = this.loaded.liquid = 0;
    const needFuel = this.target.fuel - fm.fuel > 1;
    const needLiq = this.target.liquid - fm.hopper > 1;
    if (!needFuel && !needLiq) { this.game.toast('Tanks already at the requested levels.'); return false; }
    this.queue = [];
    const Lp = (k) => this._local(k);
    // A turboprop's prop takes many seconds to run down after shutdown: the
    // badeco stays at his post until it has stopped.
    if (ac.A.turbine && fm.rpm > 60) {
      this.queue.push({ a: 'wait', t: 40, until: () => this.game.aircraft.fm.rpm < 40, msg: 'Badeco waits for the propeller to stop.' });
    }
    if (needFuel) {
      this.queue.push(
        { a: 'walk', to: () => [this._near(this.fuelReel)], speed: SERVICE.walk, msg: 'Badeco is heading to the fuel pump.' },
        { a: 'pickup', hose: 'fuel', t: 1.0 },
        { a: 'walk', to: () => [Lp('A'), Lp('B'), Lp('F')], speed: SERVICE.carry, pose: 'carry', msg: 'Carrying the fuel hose (behind the wing).' },
        { a: 'face', at: () => this._world(this._port(this.game.aircraft.model.fuelFiller)) },
        { a: 'connect', hose: 'fuel', t: 1.6, pose: 'reach', msg: 'Connecting to the wing tank.' },
        { a: 'transfer', kind: 'fuel', pose: 'hold' },
        { a: 'disconnect', hose: 'fuel', t: 1.2, pose: 'reach' },
        { a: 'walk', to: () => [Lp('B'), Lp('A'), this._near(this.fuelReel)], speed: SERVICE.carry, pose: 'carry' },
        { a: 'stow', hose: 'fuel', t: 1.4 },
      );
    }
    if (needLiq) {
      this.queue.push(
        { a: 'walk', to: () => [this._near(this.mixReel)], speed: SERVICE.walk, msg: 'Badeco is heading to the mixing station.' },
        { a: 'pickup', hose: 'mix', t: 1.0 },
        { a: 'walk', to: () => [Lp('A'), Lp('B'), Lp('P')], speed: SERVICE.carry, pose: 'carry', msg: 'Carrying the loading hose.' },
        { a: 'face', at: () => this._world(this._port(this.game.aircraft.model.hopperPort)) },
        { a: 'connect', hose: 'mix', t: 1.8, pose: 'reachLow', msg: 'Coupling the hopper quick-fill.' },
        { a: 'transfer', kind: 'liquid', pose: 'crouch' },
        { a: 'disconnect', hose: 'mix', t: 1.3, pose: 'reachLow' },
        { a: 'walk', to: () => [Lp('B'), Lp('A'), this._near(this.mixReel)], speed: SERVICE.carry, pose: 'carry' },
        { a: 'stow', hose: 'mix', t: 1.4 },
      );
    }
    this.queue.push(
      { a: 'walk', to: () => [this.post.clone()], speed: SERVICE.walk },
      { a: 'face', at: () => this.game.aircraft.fm.pos.clone() },
      { a: 'signal', t: 2.2, pose: 'thumbs', msg: 'All clear — aircraft released.' },
    );
    this.state = 'working';
    this.step = null;
    this.game.onServiceStart?.();
    return true;
  }

  abort(reason) {
    if (this.state !== 'working') return;
    this.game.toast(reason || 'Ground crew: service interrupted.');
    this.state = 'aborting';
    this.queue = [];
    if (this.connected || this.carry) {
      this.queue.push({ a: 'disconnect', hose: this.connected || this.carry, t: 0.5, pose: 'reach', drop: true });
    }
    const behind = this._isNearAircraft();
    const path = behind ? () => [this._local('A'), this.post.clone()] : () => [this.post.clone()];
    this.queue.push({ a: 'walk', to: path, speed: SERVICE.run });
    this.queue.push({ a: 'face', at: () => this.game.aircraft.fm.pos.clone() });
    this.step = null;
    this.pumpOn = false;
  }

  _isNearAircraft() {
    const ac = this.game.aircraft;
    return Math.hypot(this.badeco.pos.x - ac.fm.pos.x, this.badeco.pos.z - ac.fm.pos.z) < ac.type.service.veto;
  }

  // Which wing faces the service equipment (+1 left, -1 right).
  _side() {
    const ac = this.game.aircraft;
    const yaw = ac.fm.heading();
    const dx = this.fuelReel.x - ac.fm.pos.x, dz = this.fuelReel.z - ac.fm.pos.z;
    // Body +X (left) in world: (cos yaw, -sin yaw).
    return dx * Math.cos(yaw) - dz * Math.sin(yaw) >= 0 ? 1 : -1;
  }
  _port(v) {
    const p = v.clone();
    p.x *= this.side || 1;
    return p;
  }

  // Plane-local ground point -> world (yaw only).
  _local(k) {
    const ac = this.game.aircraft;
    const [lx, z] = ac.type.service.local[k];
    const x = lx * (this.side || 1);
    const yaw = ac.fm.heading();
    const c = Math.cos(yaw), s = Math.sin(yaw);
    // Body +Z -> (sin yaw, cos yaw); body +X -> (cos yaw, -sin yaw).
    return new THREE.Vector3(ac.fm.pos.x + x * c + z * s, 0, ac.fm.pos.z - x * s + z * c);
  }
  _world(local) { return this.game.aircraft.toWorld(local, new THREE.Vector3()); }
  _near(reel) {
    const ac = this.game.aircraft;
    const d = _v.set(ac.fm.pos.x - reel.x, 0, ac.fm.pos.z - reel.z).normalize();
    return new THREE.Vector3(reel.x + d.x * 1.1, 0, reel.z + d.z * 1.1);
  }

  update(dt) {
    const game = this.game;
    const ac = game.aircraft;
    const b = this.badeco;
    const fm = ac.fm;
    const sdt = dt * (this.state === 'working' ? this.fast : 1);
    // Abort if the aircraft moves while working.
    if (this.state === 'working' && this.parkRef) {
      if (fm.engine !== 'off' || fm.pos.distanceTo(this.parkRef) > 0.4 || fm.out.groundSpeed > 0.25) {
        this.abort('Aircraft moved — ground crew stopped the service.');
      }
    }
    this.pumpOn = false;
    if (this.state === 'working' || this.state === 'aborting') {
      if (!this.step && this.queue.length) this._begin(this.queue.shift());
      if (this.step) this._run(this.step, sdt);
      if (!this.step && !this.queue.length) {
        const wasWorking = this.state === 'working';
        this.state = 'idle';
        b.pose = 'idle';
        if (wasWorking) game.onServiceDone?.(this.loaded);
      }
    } else {
      b.speed = 0;
      b.pose = 'idle';
    }
    b.animate(dt, (x, z) => game.world.terrain.heightAt(x, z));
    this._hoses(dt, sdt);
  }

  _begin(st) {
    this.step = st;
    st.time = 0;
    if (st.msg) { this.message = st.msg; this.game.crewMessage?.(st.msg); }
    if (st.a === 'walk') { st.path = st.to(); st.i = 0; }
  }

  _run(st, dt) {
    const b = this.badeco;
    const fm = this.game.aircraft.fm;
    st.time += dt;
    b.pose = st.pose || 'idle';
    switch (st.a) {
      case 'walk': {
        const tgt = st.path[st.i];
        const dx = tgt.x - b.pos.x, dz = tgt.z - b.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.12) {
          st.i++;
          if (st.i >= st.path.length) { b.speed = 0; this.step = null; }
          return;
        }
        const want = Math.atan2(dx, dz);
        let dh = want - b.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        b.heading += dh * Math.min(1, dt * 7);
        const sp = st.speed * (Math.abs(dh) > 1.2 ? 0.4 : 1);
        b.speed = sp;
        const step = Math.min(d, sp * dt);
        b.pos.x += (dx / d) * step;
        b.pos.z += (dz / d) * step;
        break;
      }
      case 'face': {
        const t = st.at();
        const want = Math.atan2(t.x - b.pos.x, t.z - b.pos.z);
        let dh = want - b.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        b.heading += dh * Math.min(1, dt * 6);
        b.speed = 0;
        if (Math.abs(dh) < 0.05 || st.time > 1.5) this.step = null;
        break;
      }
      case 'pickup':
        b.speed = 0;
        b.pose = st.time < st.t * 0.6 ? 'reachLow' : 'carry';
        if (st.time > st.t * 0.5 && this.carry !== st.hose) {
          this.carry = st.hose;
          b.nozzle.visible = true;
          this.game.audio?.play('clank');
        }
        if (st.time >= st.t) this.step = null;
        break;
      case 'connect':
        b.speed = 0;
        if (st.time >= st.t) {
          this.connected = st.hose;
          b.nozzle.visible = false;
          this.game.audio?.play('clank');
          this.step = null;
        }
        break;
      case 'transfer': {
        b.speed = 0;
        this.pumpOn = true;
        if (st.kind === 'fuel') {
          const add = Math.min(this.game.aircraft.type.service.rates.fuel * dt, this.target.fuel - fm.fuel);
          if (add > 0) {
            fm.fuel += add;
            this.loaded.fuel += add;
            this.game.charge?.(add * this.game.aircraft.type.fuel.price, 'fuel');
          }
          if (this.target.fuel - fm.fuel <= 0.05) this.step = null;
        } else {
          const add = Math.min(this.game.aircraft.type.service.rates.liquid * dt, this.target.liquid - fm.hopper);
          if (add > 0) { fm.hopper += add; this.loaded.liquid += add; }
          if (this.target.liquid - fm.hopper <= 0.05) this.step = null;
        }
        fm.updateMass();
        break;
      }
      case 'disconnect':
        b.speed = 0;
        if (st.time >= st.t) {
          this.connected = null;
          if (st.drop) { this.carry = null; b.nozzle.visible = false; } else b.nozzle.visible = true;
          this.game.audio?.play('clank');
          this.step = null;
        }
        break;
      case 'stow':
        b.speed = 0;
        b.pose = 'reachLow';
        if (st.time >= st.t * 0.5 && this.carry) {
          this.carry = null;
          b.nozzle.visible = false;
          this.game.audio?.play('reel');
        }
        if (st.time >= st.t) this.step = null;
        break;
      case 'signal':
        b.speed = 0;
        if (st.time >= st.t) this.step = null;
        break;
      case 'wait':
        b.speed = 0;
        if (st.time >= st.t || st.until?.()) this.step = null;
        break;
      default:
        this.step = null;
    }
  }

  _hoses(dt, sdt) {
    const ac = this.game.aircraft;
    const ground = (x, z) => this.game.world.terrain.heightAt(x, z);
    const keepOut = this._keepOut();
    const hand = this.badeco.nozzleTip(_w);
    for (const [name, hose, reel, port] of [
      ['fuel', this.fuelHose, this.fuelReel, this._port(ac.model.fuelFiller)],
      ['mix', this.mixHose, this.mixReel, this._port(ac.model.hopperPort)],
    ]) {
      hose.anchor.copy(reel);
      let target;
      if (this.connected === name) target = this._world(port);
      else if (this.carry === name) target = hand;
      else target = null;
      if (target) {
        hose.end.copy(target);
        hose.autoLength(1.12, 1.6);
        hose.stowed = false;
      } else {
        // Reel the free end back home (auto-rewind), then hide.
        _l.copy(reel).add(_v.set(0, -0.35, 0));
        const d = hose.end.distanceTo(_l);
        if (d > 0.05) hose.end.lerp(_l, Math.min(1, (6 * dt) / Math.max(d, 0.2)));
        hose.length = Math.max(1.0, hose.length - 6 * dt);
        if (d < 0.15 && hose.length <= 1.05) hose.stowed = true;
      }
      hose.mesh.visible = !hose.stowed;
      if (!hose.stowed) {
        const n = Math.max(1, Math.ceil(dt / (1 / 120)));
        for (let i = 0; i < n; i++) hose.step(dt / n, ground, keepOut);
        hose.rebuild();
      }
    }
    void sdt;
  }

  // Push rope points out of the wing, fuselage and stabiliser (body-frame
  // boxes from the aircraft type).
  _keepOut() {
    const ac = this.game.aircraft;
    const pos = ac.fm.pos, q = ac.fm.quat;
    const K = ac.type.service.keepOut;
    const [wx, wz0, wz1] = K.wing, [fx, fy0, fy1, fz0, fz1] = K.fus, [sx, sy0, sy1, sz0, sz1] = K.stab;
    const sm = (sy0 + sy1) / 2;
    _qi.copy(q).invert();
    const lp = new THREE.Vector3();
    return (p) => {
      lp.copy(p).sub(pos).applyQuaternion(_qi);
      const ax = Math.abs(lp.x);
      let moved = false;
      if (ax < wx && lp.z > wz0 && lp.z < wz1) {
        const yc = K.wingY(ax);
        if (lp.y > yc - 0.2 && lp.y < yc + 0.32) {
          lp.y = lp.y > yc + 0.05 ? yc + 0.33 : yc - 0.21;
          moved = true;
        }
      }
      if (ax < fx && lp.y > fy0 && lp.y < fy1 && lp.z > fz0 && lp.z < fz1) {
        lp.x = Math.sign(lp.x || 1) * (fx + 0.01);
        moved = true;
      }
      if (ax < sx && lp.y > sy0 && lp.y < sy1 && lp.z > sz0 && lp.z < sz1) {
        lp.y = lp.y > sm ? sy1 + 0.01 : sy0 - 0.01;
        moved = true;
      }
      if (moved) p.copy(lp.applyQuaternion(q).add(pos));
    };
  }
}
