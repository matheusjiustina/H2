// Spray system: wind-driven pump, valve, hopper consumption, deposition
// onto coverage grids (with height-dependent swath, drift and losses), and
// the visible mist (fine translucent particles that follow the wind).
import * as THREE from 'three';
import { SPRAY } from '../config.js';
import { smoothstep, clamp } from '../core/math.js';
import { fieldAt, cropHeight } from '../world/layout.js';

const _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _side = new THREE.Vector3();
const SAMPLES = 64;

export class Sprayer {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.flowNow = 0;
    this.coverages = []; // FieldCoverage list that count as target
    this.reset();
    this.emitAcc = 0;
    this.quality = { height: 0, speed: 0, swath: 0, loss: 0 };
  }

  reset() {
    this.sprayed = 0;
    this.offTarget = 0;
    this.lost = 0;
    this.onTarget = 0;
  }

  setTargets(list) { this.coverages = list; }

  toggle(force) {
    const fm = this.game.aircraft.fm;
    const next = force ?? !this.on;
    if (next && fm.hopper <= 0.5) {
      this.game.toast('Hopper is empty — return to base for a reload.');
      this.on = false;
      return;
    }
    this.on = next;
    this.game.audio?.play('valve');
  }

  // Effective swath width for a nozzle height above the canopy.
  swathFor(h) {
    const w = SPRAY.swath * (0.42 + 0.58 * smoothstep(0.4, 2.8, h)) * (1 + 0.05 * Math.max(0, h - 4.5));
    return clamp(w, 6, SPRAY.swath * 1.45);
  }

  // Called once per fixed simulation step.
  step(h) {
    const ac = this.game.aircraft;
    const fm = ac.fm;
    const o = fm.out;
    // Wind-driven pump: needs airflow.
    const pump = smoothstep(10, 28, o.airspeed);
    this.flowNow = this.on && fm.hopper > 0 ? SPRAY.flow * pump : 0;
    if (!this.on) return;
    if (fm.hopper <= 0) {
      this.on = false;
      this.game.toast('Hopper empty. Valve closed.');
      return;
    }
    const litres = Math.min(fm.hopper, this.flowNow * h);
    if (litres <= 0) return;
    fm.hopper -= litres;
    this.sprayed += litres;

    // Boom line in world space.
    _a.set(4.7, -0.3, -0.95).applyQuaternion(fm.quat).add(fm.pos);
    _b.set(-4.7, -0.3, -0.95).applyQuaternion(fm.quat).add(fm.pos);
    const mid = _p.copy(_a).add(_b).multiplyScalar(0.5);
    const top = ac.env.top(mid.x, mid.z);
    const hMid = mid.y - top;
    const wind = ac.windVec;
    const W = this.swathFor(Math.max(0, hMid));
    // Losses: evaporation/fine drift above the ideal window, worse with wind.
    const windSp = Math.hypot(wind.x, wind.z);
    let loss = smoothstep(4.5, 14, hMid) * 0.55 + windSp * 0.012 + smoothstep(55, 70, o.airspeed) * 0.1;
    loss = clamp(loss, 0, 0.8);
    const useful = litres * (1 - loss);
    this.lost += litres * loss;
    // Lateral axis on the ground (left wing direction, flattened).
    _side.copy(_a).sub(_b);
    _side.y = 0;
    const span = _side.length();
    _side.divideScalar(Math.max(span, 1e-3));
    const stretch = W / 9.4;
    const taper = 0.35 * W;
    const half = W / 2;
    let wsum = 0;
    const wts = this._w || (this._w = new Float32Array(SAMPLES));
    const us = this._u || (this._u = new Float32Array(SAMPLES));
    for (let i = 0; i < SAMPLES; i++) {
      const u = -half - taper / 2 + ((i + 0.5) / SAMPLES) * (W + taper);
      us[i] = u;
      const au = Math.abs(u);
      const w = au < half - taper / 2 ? 1 : au > half + taper / 2 ? 0 : (half + taper / 2 - au) / taper;
      wts[i] = w;
      wsum += w;
    }
    for (let i = 0; i < SAMPLES; i++) {
      if (wts[i] <= 0) continue;
      const u = us[i];
      // Nozzle point on the boom that "feeds" this landing position.
      const t = clamp(u / stretch / 9.4 + 0.5, 0, 1);
      const nx = _b.x + (_a.x - _b.x) * t, ny = _b.y + (_a.y - _b.y) * t, nz = _b.z + (_a.z - _b.z) * t;
      const ground = ac.env.top(nx, nz);
      const hh = Math.max(0, ny - ground);
      const tf = hh / SPRAY.fallSpeed + 0.25;
      const dx = wind.x * tf * SPRAY.driftFactor + fm.vel.x * 0.12;
      const dz = wind.z * tf * SPRAY.driftFactor + fm.vel.z * 0.12;
      const cx = mid.x + _side.x * u + dx;
      const cz = mid.z + _side.z * u + dz;
      const l = (useful * wts[i]) / wsum;
      let landed = false;
      for (const cov of this.coverages) {
        if (cov.deposit(cx, cz, l) >= 0) { landed = true; this.onTarget += l; break; }
      }
      if (!landed) this.offTarget += l;
    }
    this.quality.height = hMid;
    this.quality.speed = o.airspeed;
    this.quality.swath = W;
    this.quality.loss = loss;
  }

  // Visible mist, once per rendered frame.
  emit(dt) {
    const ac = this.game.aircraft;
    const pool = this.game.mist;
    if (!pool || !this.on || this.flowNow <= 0) return;
    const fm = ac.fm;
    const nozzles = ac.model.nozzles;
    const rate = 1400 * (this.flowNow / SPRAY.flow); // particles per second
    this.emitAcc += rate * dt;
    const wind = ac.windVec;
    while (this.emitAcc >= 1) {
      this.emitAcc -= 1;
      const n = nozzles[(Math.random() * nozzles.length) | 0];
      _p.copy(n).applyQuaternion(ac.rQuat).add(ac.rPos);
      const out = Math.sign(n.x) * (0.4 + Math.abs(n.x) / 5) * 1.2;
      _side.set(out, 0, 0).applyQuaternion(fm.quat);
      pool.spawn(
        _p.x + (Math.random() - 0.5) * 0.3, _p.y - Math.random() * 0.3, _p.z + (Math.random() - 0.5) * 0.3,
        fm.vel.x * 0.32 + _side.x + (Math.random() - 0.5) * 0.8,
        fm.vel.y * 0.3 - 1.2 - Math.random() * 0.8,
        fm.vel.z * 0.32 + _side.z + (Math.random() - 0.5) * 0.8,
        { life: 2.4 + Math.random() * 2.0, size: 0.5 + Math.random() * 0.4, grow: 8, alpha: 0.13 + Math.random() * 0.08, drag: 1.3, gravity: SPRAY.fallSpeed * 0.5, color: [0.95, 0.97, 0.98], kind: 1 },
      );
    }
    void wind;
  }

  efficiency() {
    const s = this.sprayed || 1;
    return { onTarget: this.onTarget / s, offTarget: this.offTarget / s, lost: this.lost / s };
  }
}

export function cropTopAt(x, z, terrain) {
  return terrain.heightAt(x, z) + cropHeight(fieldAt(x, z));
}
