// Aircraft ↔ water contact effects (amphibians): visual only, read from the
// flight model's own state (nothing here touches forces or contacts).
//   * the first touch of a float: a splash sized by speed and sink rate;
//   * while a float is wet and moving: spray sheets at the step thrown out
//     and back, a bow wave at displacement speeds, rising with speed and
//     fading as the hull lifts (planing → take-off);
//   * rings and wake on the surface: ripple sources written into the water
//     shader's uniform ring buffer (WATER_U.rip, 16 entries, no textures);
//   * scooping: spray at the probes.
// One point-sprite pool (shared soft texture), its size from the quality
// profile; nothing is spawned when the aircraft is far from the camera.
import * as THREE from 'three';
import { ParticlePool } from '../core/particles.js';
import { WATER_U, RIP } from './water.js';
import { ATMO_U } from './atmosphere.js';

const _p = new THREE.Vector3(), _f = new THREE.Vector3(), _s = new THREE.Vector3();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class WaterFx {
  constructor(scene, maxParticles = 700) {
    this.pool = new ParticlePool(maxParticles, { renderOrder: 21 });
    this.pool.points.visible = false;
    scene.add(this.pool.points);
    this.rip = 0; // next ring slot
    this.ripT = 0;
    this.wet = [false, false];
    this.acc = 0;
    this.k = 1; // quality scale of the particle counts
  }
  setScale(h, fov) { this.pool.setScale(h, fov); }
  setQuality(particleBudget) {
    // The spray pool follows the profile's particle budget (Economy ≈ ⅓).
    this.k = Math.min(1, Math.max(0.3, particleBudget / 6000));
    this.pool.limit = Math.round(this.pool.max * this.k);
    WATER_U.detail.value = this.k < 0.5 ? 0.5 : 1;
  }

  ring(x, z, strength) {
    const r = WATER_U.rip.value[this.rip];
    r.set(x, z, ATMO_U.time.value, Math.min(1.5, strength));
    this.rip = (this.rip + 1) % RIP;
  }

  // Body-frame point → world.
  _w(fm, x, y, z, out) { return out.set(x, y, z).applyQuaternion(fm.quat).add(fm.pos); }

  update(dt, ac, camPos) {
    const pool = this.pool;
    const fl = ac?.A?.floats;
    const active = !!fl && ac.state === 'ok';
    if (pool.count) pool.update(dt, _s.set(0, 0, 0), (x, z) => ac.env.water(x, z) > -1e8 ? ac.env.water(x, z) - 0.05 : -1e9);
    pool.points.visible = pool.count > 0;
    if (!active) { this.wet[0] = this.wet[1] = false; return; }
    const fm = ac.fm, o = fm.out;
    const near = !camPos || camPos.distanceTo(fm.pos) < 650;
    const fwd = _f.set(0, 0, 1).applyQuaternion(fm.quat);
    const speed = o.waterSpeed || Math.hypot(fm.vel.x, fm.vel.z);
    const keelY = (fl.stations?.[5]?.[1] ?? -2.6) + 0.15;
    this.ripT += dt;
    const ripEvery = speed > 12 ? 0.32 : 0.5;
    const ripNow = this.ripT >= ripEvery;
    if (ripNow) this.ripT = 0;
    for (let i = 0; i < 2; i++) {
      const sx = i ? -fl.x : fl.x;
      const step = this._w(fm, sx, keelY, fl.stepZ ?? -0.6, _p);
      const wl = ac.env.water(step.x, step.z);
      const wetNow = o.onWater && wl > -1e8 && step.y - wl < 0.35;
      // First contact: a splash and a ring, sized by the touch.
      if (wetNow && !this.wet[i]) {
        const str = Math.min(1.5, Math.max(0.25, speed / 28 + Math.max(0, -fm.vel.y) / 2.5));
        this.ring(step.x, step.z, str);
        if (near) this._burst(step.x, wl, step.z, fwd, sx, speed, str, Math.round(40 * str * this.k));
      }
      this.wet[i] = wetNow;
      if (!wetNow) continue;
      // Wake rings from the stern of each float while it moves.
      if (ripNow && speed > 1.2) {
        const stern = this._w(fm, sx, keelY, -3.6, _s);
        this.ring(stern.x, stern.z, Math.min(1, 0.18 + speed / 22) * (1 - 0.5 * smooth(22, 34, speed)));
      }
      if (!near) continue;
      // Spray sheet at the step: grows with speed, thins out as the hull
      // planes and lifts (support → 0 at the take-off).
      const lift = Math.min(1, o.waterSupport ?? 1);
      const rate = (speed < 3 ? 0 : 90 * smooth(3, 22, speed) * (0.35 + 0.65 * lift)) * this.k;
      let n = rate * dt + Math.random();
      while (n-- >= 1) {
        const out = sx > 0 ? 1 : -1;
        const side = _s.set(out, 0, 0).applyQuaternion(fm.quat);
        const vs = 1.2 + speed * 0.12, vu = 0.8 + speed * 0.1 * Math.random();
        pool.spawn(step.x + side.x * 0.5, wl + 0.15, step.z + side.z * 0.5,
          side.x * vs - fwd.x * speed * 0.25 + (Math.random() - 0.5), vu, side.z * vs - fwd.z * speed * 0.25 + (Math.random() - 0.5),
          { life: 0.55 + Math.random() * 0.6, size: 0.9 + Math.random() * 1.4 + speed * 0.05, grow: 2.4, alpha: 0.46, drag: 0.6, gravity: 9, color: [0.97, 0.98, 0.99], kind: 1 });
      }
      // Bow wave at displacement speeds (taxi).
      if (speed > 1.5 && speed < 12 && Math.random() < dt * 14 * this.k) {
        const bow = this._w(fm, sx, keelY + 0.4, 3.9, _s);
        pool.spawn(bow.x, wl + 0.1, bow.z, fwd.x * speed * 0.6 + (Math.random() - 0.5), 0.6, fwd.z * speed * 0.6 + (Math.random() - 0.5),
          { life: 0.8, size: 1.1, grow: 1.8, alpha: 0.38, drag: 1.2, gravity: 4, color: [0.96, 0.97, 0.98], kind: 1 });
      }
    }
    // Scooping: the probes throw water up behind them.
    if (near && ac.water?.scooping) {
      let n = 40 * dt * this.k + Math.random();
      while (n-- >= 1) {
        const sx = Math.random() < 0.5 ? fl.x - 0.28 : -(fl.x - 0.28);
        const pr = this._w(fm, sx, keelY - 0.1, -1.1, _s);
        const wl = ac.env.water(pr.x, pr.z);
        pool.spawn(pr.x, wl + 0.2, pr.z, -fwd.x * speed * 0.3 + (Math.random() - 0.5) * 2, 2 + Math.random() * 2, -fwd.z * speed * 0.3 + (Math.random() - 0.5) * 2,
          { life: 0.8, size: 0.9, grow: 2.4, alpha: 0.3, drag: 0.5, gravity: 9, color: [0.94, 0.96, 0.97], kind: 1 });
      }
    }
  }

  _burst(x, y, z, fwd, sx, speed, str, n) {
    const out = sx > 0 ? 1 : -1;
    for (let j = 0; j < n; j++) {
      const a = Math.random() * Math.PI * 2, r = (0.8 + Math.random() * 2.2) * str;
      this.pool.spawn(x + Math.cos(a) * 0.8, y + 0.1, z + Math.sin(a) * 0.8,
        Math.cos(a) * r + out * str - fwd.x * speed * 0.15, (1.5 + Math.random() * 3) * str, Math.sin(a) * r - fwd.z * speed * 0.15,
        { life: 0.8 + Math.random() * 0.7, size: 1.0 + Math.random() * 1.8 * str, grow: 2.6, alpha: 0.5, drag: 0.4, gravity: 9, color: [0.97, 0.98, 0.99], kind: 1 });
    }
  }
}
