// World Expansion 2.0 (src/world/expansion.js): integrity of the new
// landscapes against the existing map, and their physical consistency.
//   node --test test/expansion.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, getTerrain, deg, Vector3 } from './harness.mjs';
import * as L from '../src/world/layout.js';
import {
  EXP_REGIONS, AUX_STRIPS, EXP_STREAMS, EXP_PONDS, EXP_FALLS, EXP_ROADS, EXP_FORESTS, MESAS, stripUV, auxStripLevel, biomeWeights,
} from '../src/world/expansion.js';
import { segDist } from '../src/core/math.js';

const T = getTerrain();
T.buildBaseline();
const H0 = (x, z) => T.heightAt0(x, z);

// Protected elements of the existing map: every farm's strip and apron,
// every field, the original roads, forests, streams, ponds and the creek.
const rects = [];
for (const s of L.SITES) {
  const r = s.runway;
  rects.push({ n: 'strip ' + s.id, x0: r.x0, x1: r.x1, z0: r.z - r.width / 2, z1: r.z + r.width / 2 });
  rects.push({ n: 'apron ' + s.id, x0: s.apron.x0, x1: s.apron.x1, z0: s.apron.z0, z1: s.apron.z1 });
}
for (const f of L.FIELDS) rects.push({ n: 'field ' + f.name, x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1 });
for (const f of L.FORESTS) if (!f.exp) rects.push({ n: 'forest', x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1 });
const lines = [{ n: 'creek', pts: L.CREEK.points, w: L.CREEK.width / 2 }];
for (const r of L.ROADS) if (!r.exp) lines.push({ n: 'road', pts: r.pts, w: r.w / 2 });
for (const st of L.WATER.streams) if (!st.exp) lines.push({ n: st.name, pts: st.points, w: st.width / 2 });
const ponds = L.WATER.ponds.filter((p) => !p.exp);
function protectedDist(x, z) {
  let best = 1e9, n = '';
  for (const r of rects) { const d = Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1)); if (d < best) { best = d; n = r.n; } }
  for (const l of lines) for (let i = 0; i < l.pts.length - 1; i++) { const d = segDist(x, z, l.pts[i][0], l.pts[i][1], l.pts[i + 1][0], l.pts[i + 1][1]) - l.w; if (d < best) { best = d; n = l.n; } }
  for (const p of ponds) { const d = Math.hypot(x - p.x, z - p.z) - p.rmax; if (d < best) { best = d; n = p.name; } }
  return [best, n];
}

test('the existing map keeps its ground: no change near any farm, field, road, forest or water', () => {
  let changed = 0, n = 0, near80 = [], near150 = [];
  for (let z = -5975; z < 6000; z += 25) for (let x = -5975; x < 6000; x += 25) {
    n++;
    const dh = Math.abs(T.heightAt(x, z) - H0(x, z));
    if (dh < 1e-4) continue;
    changed++;
    const [d, what] = protectedDist(x, z);
    if (d < 80 && dh > 0.01) near80.push([x, z, +dh.toFixed(3), Math.round(d), what]);
    if (d < 150 && dh > 1) near150.push([x, z, +dh.toFixed(3), Math.round(d), what]);
  }
  console.log(`  changed ${changed} of ${n} samples (${((100 * changed) / n).toFixed(1)} %), all in the new regions`);
  assert.deepEqual(near80, [], 'changes within 80 m of a protected element: ' + JSON.stringify(near80.slice(0, 8)));
  assert.deepEqual(near150, [], 'changes over 1 m within 150 m of a protected element');
  assert.ok(changed / n < 0.15);
});

test('the farms and their strips are untouched: strip levels, ponds and the original streams', () => {
  for (const s of L.SITES) {
    const r = s.runway;
    for (let x = r.x0; x <= r.x1; x += 20) assert.equal(T.heightAt(x, r.z), H0(x, r.z), `${s.id} at ${x}`);
  }
  for (const p of ponds) assert.equal(T.heightAt(p.x, p.z), H0(p.x, p.z), p.name);
  // The new regions sit well away from every farm.
  for (const reg of EXP_REGIONS) {
    const d = Math.min(...L.SITES.map((s) => Math.hypot(reg.c[0] - (s.runway.x0 + s.runway.x1) / 2, reg.c[1] - s.runway.z)));
    assert.ok(d > 1500, `${reg.id} ${Math.round(d)} m from a farm`);
  }
});

test('six auxiliary strips: on their platform, the right surface, clear of water and roads', () => {
  assert.equal(AUX_STRIPS.length, 6);
  assert.deepEqual(AUX_STRIPS.map((s) => s.kind).sort(), ['A', 'B', 'C', 'D', 'E', 'F']);
  for (const s of AUX_STRIPS) {
    let maxDev = 0, maxCross = 0;
    for (let u = -s.len / 2 + 0.5; u <= s.len / 2 - 0.5; u += 10) for (const v of [-s.width / 2 + 0.5, 0, s.width / 2 - 0.5]) {
      const x = s.c[0] + u * s.ax - v * s.az, z = s.c[1] + u * s.az + v * s.ax;
      maxDev = Math.max(maxDev, Math.abs(T.heightAt(x, z) - auxStripLevel(s, u, v)));
      const surf = T.surfaceAt(x, z);
      assert.equal(surf, s.surface === 2 || s.surface >= 4 ? 'grass' : 'dirt', `${s.id} surface at ${u},${v} (${x.toFixed(0)},${z.toFixed(0)})`);
    }
    for (let u = -s.len / 2; u <= s.len / 2; u += 25) {
      const xl = s.c[0] + u * s.ax + (s.width / 2) * s.az, zl = s.c[1] + u * s.az - (s.width / 2) * s.ax;
      const xr = s.c[0] + u * s.ax - (s.width / 2) * s.az, zr = s.c[1] + u * s.az + (s.width / 2) * s.ax;
      maxCross = Math.max(maxCross, Math.abs(T.heightAt(xl, zl) - T.heightAt(xr, zr)) / s.width);
    }
    // No water on the strip or its approach corridor.
    for (let u = -s.len / 2 - s.run; u <= s.len / 2 + s.run; u += 20) {
      const x = s.c[0] + u * s.ax, z = s.c[1] + u * s.az;
      assert.ok(T.waterLevel(x, z) < T.heightAt(x, z) - 0.2, `${s.id}: water at ${u}`);
    }
    console.log(`  ${s.kind} ${s.name}: ${s.len} × ${s.width} m, level ${s.y0} m, grade ${(s.grade * 100).toFixed(1)} %, platform deviation ${maxDev.toFixed(2)} m, cross slope ${(maxCross * 100).toFixed(1)} %`);
    assert.ok(maxDev < 0.25, `${s.id} platform ${maxDev}`);
    assert.ok(maxCross < 0.02, `${s.id} cross slope ${maxCross}`);
  }
});

test('an Ipanema takes off from every auxiliary strip (downhill), straight and on the strip', () => {
  for (const s of AUX_STRIPS) {
    const dir = s.grade > 0 ? -1 : 1;
    const sim = makeSim({ hopper: 0, fuel: 150, wind: false });
    const { fm } = sim;
    const u0 = -dir * (s.len / 2 - 25);
    const x0 = s.c[0] + u0 * s.ax, z0 = s.c[1] + u0 * s.az;
    const hdg = Math.atan2(dir * s.ax, dir * s.az);
    fm.settleOnGround(x0, z0, hdg, sim.env);
    fm.engine = 'running'; fm.rpm = 2000; fm.throttle = 0.05;
    sim.step(240);
    let off = null, maxV = 0, minPitch = 99, maxBank = 0;
    const cmd = { pitch: 0, roll: 0, yaw: 0 };
    for (let i = 0; i < 120 * 60; i++) {
      fm.throttle = Math.min(1, fm.throttle + 0.6 / 120);
      let e = hdg - fm.heading(); e = Math.atan2(Math.sin(e), Math.cos(e));
      cmd.yaw = Math.max(-1, Math.min(1, -e * 3 + fm.omega.y * 1.5));
      const v = fm.out.airspeed;
      cmd.pitch = v < 14 ? 0 : v < 30 ? -0.2 : 0.55;
      cmd.roll = -sim.att().bank * 2;
      sim.step(1, cmd, 'normal');
      const [u, vv] = stripUV(s, fm.pos.x, fm.pos.z);
      maxV = Math.max(maxV, Math.abs(vv));
      const a = sim.att();
      minPitch = Math.min(minPitch, deg(a.pitch)); maxBank = Math.max(maxBank, Math.abs(deg(a.bank)));
      if (!fm.out.onGround && fm.out.agl > 1) { off = (u - u0) * dir; break; }
    }
    console.log(`  ${s.kind} ${s.name}: airborne after ${off?.toFixed(0)} m, max lateral ${maxV.toFixed(1)} m, min pitch ${minPitch.toFixed(1)}°, max bank ${maxBank.toFixed(1)}°`);
    assert.ok(off !== null && off < s.len - 25, `${s.id} roll ${off}`);
    assert.ok(maxV < s.width / 2, `${s.id} left the strip (${maxV})`);
    assert.ok(minPitch > -3 && maxBank < 10, `${s.id} attitude`);
  }
});

test('rivers flow downhill into lagoons, under their banks; two waterfalls with real drops', () => {
  for (const st of EXP_STREAMS) {
    for (let i = 1; i < st.levels.length; i++) assert.ok(st.levels[i] <= st.levels[i - 1] + 1e-9, `${st.name} rises at ${i}`);
    // The water lies below the ground a little beside the channel.
    for (let i = 0; i < st.points.length; i++) {
      const [x, z] = st.points[i];
      const a = st.points[Math.max(0, i - 1)], b = st.points[Math.min(st.points.length - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz); tx /= l; tz /= l;
      const off = st.valley + 25;
      const bank = Math.min(T.heightAt(x - tz * off, z + tx * off), T.heightAt(x + tz * off, z - tx * off));
      assert.ok(bank - st.levels[i] < 6.5, `${st.name}: a ${(bank - st.levels[i]).toFixed(1)} m cut (through a hill) at ${x},${z}`);
      assert.ok(T.heightAt(x, z) < st.levels[i] + 0.5, `${st.name}: dry bed at ${x},${z}`);
    }
  }
  // Every reach ends in a pool or lagoon (or joins the creek).
  for (const st of EXP_STREAMS) {
    const [ex, ez] = st.points[st.points.length - 1];
    const toPond = Math.min(...EXP_PONDS.map((p) => Math.hypot(ex - p.x, ez - p.z) - p.r * 1.3));
    const toFall = Math.min(...EXP_FALLS.map((f) => Math.hypot(ex - f.lip[0], ez - f.lip[1])));
    assert.ok(toPond < 5 || toFall < 3, `${st.name} ends nowhere (${toPond.toFixed(0)} m from a lagoon)`);
  }
  for (const f of EXP_FALLS) {
    const up = EXP_STREAMS.find((st) => Math.hypot(st.points.at(-1)[0] - f.lip[0], st.points.at(-1)[1] - f.lip[1]) < 3);
    const pool = EXP_PONDS.find((p) => Math.hypot(p.x - f.base[0], p.z - f.base[1]) < 3);
    const drop = up.levels.at(-1) - pool.level;
    console.log(`  ${f.name}: ${drop.toFixed(1)} m drop over ${Math.hypot(f.base[0] - f.lip[0], f.base[1] - f.lip[1]).toFixed(0)} m`);
    assert.ok(drop > 8, `${f.name} drop ${drop}`);
  }
  for (const p of EXP_PONDS) assert.ok(p.level < T.heightAt(p.x + p.rmax * 1.6, p.z) + 0.5 && p.level > T.heightAt(p.x, p.z), p.name);
});

test('roads: drivable grades, out of the water, joined to the network or a strip', () => {
  for (const r of EXP_ROADS) {
    let maxG = 0;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], L2 = Math.hypot(bx - ax, bz - az);
      maxG = Math.max(maxG, Math.abs(T.heightAt(bx, bz) - T.heightAt(ax, az)) / L2);
      for (const p of L.WATER.ponds) assert.ok(Math.hypot(ax - p.x, az - p.z) > p.rmax, `road through ${p.name}`);
    }
    const ends = [r.pts[0], r.pts.at(-1)];
    const joined = ends.map(([x, z]) => AUX_STRIPS.some((s) => { const [u, v] = stripUV(s, x, z); return Math.abs(u) < s.len / 2 + 30 && Math.abs(v) < s.width / 2 + 40; })
      || L.ROADS.some((o) => o !== r && o.pts.some((q) => Math.hypot(q[0] - x, q[1] - z) < 45))
      || r.w < 3);
    assert.ok(joined.some(Boolean), `a road joined at neither end (${ends})`);
    assert.ok(maxG < 0.14, `road grade ${maxG}`);
  }
  // Forest blocks clear of the strips' runways, the roads and the water.
  for (const f of EXP_FORESTS) {
    for (const s of AUX_STRIPS) for (let u = -s.len / 2; u <= s.len / 2; u += 10) {
      const x = s.c[0] + u * s.ax, z = s.c[1] + u * s.az;
      assert.ok(!(x > f.x0 - s.clear && x < f.x1 + s.clear && z > f.z0 - s.clear && z < f.z1 + s.clear), `forest on ${s.id}`);
    }
    for (const r of EXP_ROADS) for (const [x, z] of r.pts) assert.ok(!(x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1), 'road under a forest');
    for (const p of EXP_PONDS) assert.ok(!(p.x > f.x0 - p.r && p.x < f.x1 + p.r && p.z > f.z0 - p.r && p.z < f.z1 + p.r), `forest over ${p.name}`);
  }
});

test('biomes: present in their regions, zero beyond them; chapada and buttes stand out', () => {
  const w = [0, 0, 0, 0];
  const at = (x, z) => [...biomeWeights(x, z, w)];
  assert.ok(at(-2250, -4700)[0] > 0.9, 'cerrado');
  assert.ok(at(2750, 5100)[1] > 0.7, 'várzea');
  assert.ok(at(-4800, 2700)[2] > 0.7, 'mata');
  assert.ok(at(4750, -2800)[3] > 0.9, 'serra');
  for (const s of L.SITES) {
    const x = (s.runway.x0 + s.runway.x1) / 2, z = s.runway.z;
    const b = at(x, z);
    assert.ok(b.every((v) => v < 0.35), `${s.id} biome ${b.map((v) => v.toFixed(2))}`);
  }
  for (const m of MESAS) {
    const top = T.heightAt(...m.c), around = Math.min(...[0, 1, 2, 3].map((k) => T.heightAt(m.c[0] + Math.cos(k * 1.57) * (Math.max(...m.half) + m.cliffW + m.talusW + 80), m.c[1] + Math.sin(k * 1.57) * (Math.max(...m.half) + m.cliffW + m.talusW + 80))));
    console.log(`  ${m.name}: top ${top.toFixed(1)} m, ${(top - around).toFixed(0)} m over the land around`);
    assert.ok(top - around > 12, m.name);
  }
});
