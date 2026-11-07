// World streaming (phase 5). The world stays one continuous coordinate system
// (physics, terrain height, colliders, missions never depend on it); only the
// GRAPHICS resources of far regions are created late and released early:
//
//   * forest cells (vegetation.js): the instanced meshes of a 500 m cell exist only
//     while the cell can be drawn (≤ 1800 m + margin), the tree list and the
//     collision index stay whole;
//   * the finest terrain level (terrain.js): built for chunks within the LOD reach,
//     the three coarser levels (and the far ring) are always resident, so the
//     ground is visible from any altitude and never has a hole.
//
// What is wanted is derived from ANCHORS: the camera (needed now), a point
// ahead on the flight path (speed × lead time — prefetch), two route-change
// points, the current farm's strip and the active contract's fields (prefetch,
// only when within reach). Work is spread over frames with a small budget and
// a priority by distance; anything needed *now* is built at once.
import * as THREE from 'three';

const LEAD_S = 6; // seconds of flight ahead to prefetch
const SCAN_S = 0.2; // seconds between demand scans
const JUMP = 400; // m — a bigger step in one scan is a teleport / site change

export class WorldStreaming {
  constructor(world, hints = () => ({})) {
    this.world = world;
    this.hints = hints;
    this.last = new THREE.Vector3(1e9, 0, 1e9);
    this.vel = new THREE.Vector3();
    this.t = 0;
    this.s = { scans: 0, jumps: 0, vegBuilt: 0, vegReleased: 0, tBuilt: 0, tReleased: 0, vegMs: 0, tMs: 0, maxScanMs: 0, anchors: 0 };
    this.enabled = true;
  }

  anchors(cam, dt) {
    const out = [{ x: cam.x, y: cam.y, z: cam.z, extra: 0, need: true }];
    const sp = this.vel.length();
    if (sp > 3) {
      const h = Math.atan2(this.vel.x, this.vel.z);
      const lead = (a, k) => ({ x: cam.x + Math.sin(a) * sp * LEAD_S * k, y: cam.y, z: cam.z + Math.cos(a) * sp * LEAD_S * k, extra: 0, need: false });
      out.push(lead(h, 1), lead(h + 0.5, 0.7), lead(h - 0.5, 0.7)); // ahead + possible turns
    }
    const { site, job } = this.hints() ?? {};
    const r = site?.runway;
    if (r) {
      const x = (r.x0 + r.x1) / 2, z = r.z;
      if (Math.hypot(x - cam.x, z - cam.z) < 6000) out.push({ x, y: 0, z, extra: 400, need: false });
    }
    if (job?.fields?.length) {
      const f = job.fields[0];
      const x = (f.x0 + f.x1) / 2, z = (f.z0 + f.z1) / 2;
      if (Math.hypot(x - cam.x, z - cam.z) < 6000) out.push({ x, y: 0, z, extra: 300, need: false });
    }
    return out;
  }

  // Call every frame (cheap: scans every SCAN_S, or at once after a jump).
  update(cam, dt) {
    if (!this.enabled) return;
    this.t += dt;
    const step = Math.hypot(cam.x - this.last.x, cam.z - this.last.z);
    const jump = step > JUMP;
    if (!jump && this.t < SCAN_S) return;
    const t0 = performance.now();
    if (jump) { this.s.jumps++; this.vel.set(0, 0, 0); }
    else if (this.t > 0) {
      // smoothed ground velocity (m/s) from the camera's own motion
      this.vel.x += ((cam.x - this.last.x) / this.t - this.vel.x) * 0.5;
      this.vel.z += ((cam.z - this.last.z) / this.t - this.vel.z) * 0.5;
    }
    this.last.copy(cam); this.t = 0;
    const A = this.anchors(cam, dt);
    this.s.anchors = A.length; this.s.scans++;
    const w = this.world;
    // Terrain finest level.
    const t1 = performance.now();
    const tr = w.terrainMesh.stream?.(A.map((a) => ({ x: a.x, y: a.y, z: a.z, extra: a.extra, soon: !a.need })), { maxPrefetch: jump ? 4 : 1 });
    if (tr) { this.s.tBuilt += tr.built; this.s.tReleased += tr.released; }
    this.s.tMs += performance.now() - t1;
    // Forest cells.
    const t2 = performance.now();
    const veg = w.vegetation;
    if (veg?.cells) {
      const reach = veg.cellRadius() + 300 - 500; // far (1800) + 0.6 cell of slack (the draw test subtracts 0.6 cell)
      const wantNow = reach + 100, keepTo = reach + 800;
      let budget = jump ? 1e9 : 3;
      const todo = [];
      for (const c of veg.cells) {
        let dNeed = Infinity, dAny = Infinity;
        for (const a of A) {
          const d = Math.hypot(c.center.x - a.x, c.center.z - a.z) - a.extra;
          if (a.need) dNeed = Math.min(dNeed, d);
          dAny = Math.min(dAny, d);
        }
        if (!c.built) {
          if (dNeed < wantNow) { veg.build(c); this.s.vegBuilt++; }
          else if (dAny < wantNow) todo.push([dAny, c]);
          else if (dNeed < wantNow + 450) todo.push([dNeed, c]);
        } else if (dAny > keepTo) { veg.release(c); this.s.vegReleased++; }
      }
      todo.sort((p, q) => p[0] - q[0]);
      for (const [, c] of todo) { if (budget-- <= 0) break; veg.build(c); this.s.vegBuilt++; }
    }
    this.s.vegMs += performance.now() - t2;
    this.s.maxScanMs = Math.max(this.s.maxScanMs, performance.now() - t0);
  }

  stats() {
    const w = this.world;
    return { ...this.s, veg: w.vegetation?.stats?.(), terrainFine: w.terrainMesh.fineStats?.() };
  }
}
