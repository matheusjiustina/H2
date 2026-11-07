// Distant field activity: farm machinery working the talhões that are not the
// player's job — the tractor with its disc harrow on the fallow T-08, a
// combine harvesting soybean on T-16, a self-propelled sprayer on its
// tramlines over T-13, a pickup on the farm road between the sede and the
// strip, and machines at the secondary farms. Each machine's pose is an
// analytic function of time along its route (serpentine lanes with headland
// U-turns, or a road driven back and forth), so nothing accumulates and the
// updates are throttled with distance (every frame near, a few per second at
// mid range, none and hidden far away). Harvesting and tillage change the
// field as the work goes: the done lanes are written to the shared worked-
// ground rectangles (cutState.js) that the crop and ground shaders read
// (crop gone and stubble showing; dark, freshly worked soil).
import * as THREE from 'three';
import { tractor, discHarrow, harvester, sprayer, pickup, wheelGeometry, wheelSet, PartCollector, vehicleLod } from './vehicles.js';
import { FIELDS, ROADS } from './layout.js';
import { CUT_U, NCUT } from './cutState.js';

// Machine kinds: model, speed (m/s), lane width (m), worked-ground kind,
// dust (bare soil), mist (spraying).
const KINDS = {
  harrow: { speed: 2.6, lane: 12, cut: 2, dust: true, back: 5.2 },
  combine: { speed: 1.9, lane: 9, cut: 1, dust: true, back: 4.0, chaff: true },
  sprayer: { speed: 4.2, lane: 27, cut: 0, mist: true, back: 2.4 },
  pickup: { speed: 8.5, dust: true, back: 2.6 },
};

// Work plan: field, machine, axis of the lanes, how far through the field
// the work is when the game starts (0..1).
const PLAN = [
  { field: 'T-08', kind: 'harrow', axis: 'x', start: 0.25 },
  { field: 'T-16', kind: 'combine', axis: 'x', start: 0.35 },
  { field: 'T-13', kind: 'sprayer', axis: 'z', start: 0.2 },
  { field: 'SR-03', kind: 'combine', axis: 'z', start: 0.3 },
  { field: 'VR-03', kind: 'harrow', axis: 'z', start: 0.4 },
  { road: 0, kind: 'pickup', start: 0.1 },
];

function buildModel(kind, M) {
  const root = new THREE.Group();
  root.name = 'machine-' + kind;
  const C = new PartCollector();
  let lay = null, casters = null;
  if (kind === 'harrow') { lay = tractor(C, M, 0, 0, 0, 0, { dynamic: true }); discHarrow(C, M, 0, 0, -4.1, 0); casters = [M.tractorRed, M.steel]; }
  else if (kind === 'combine') { harvester(C, M, 0, 0, 0, 0); casters = [M.harvGreen, M.glass]; }
  else if (kind === 'sprayer') { sprayer(C, M, 0, 0, 0, 0); casters = [M.orange, M.poly]; }
  else { pickup(C, M, 0, 0, 0, 0); casters = null; }
  const detail = C.build(root, casters);
  let setWheels = null;
  if (lay) {
    const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.1 });
    const front = lay.wheels.find((w) => w.steer), rear = lay.wheels.find((w) => !w.steer);
    setWheels = wheelSet(root, lay.wheels, wheelGeometry(front.R, front.W), wheelGeometry(rear.R, rear.W), wheelMat);
  }
  return { root, detail, setWheels };
}

// Serpentine lanes over a field (one sweep, then the work starts again).
function laneRoute(f, axis, lane) {
  const along = axis === 'x';
  const a0 = (along ? f.x0 : f.z0) + lane / 2, a1 = (along ? f.x1 : f.z1) - lane / 2; // along the lane
  const c0 = along ? f.z0 : f.x0, c1 = along ? f.z1 : f.x1; // across
  const n = Math.max(1, Math.floor((c1 - c0) / lane));
  const L = a1 - a0, R = lane / 2, T = Math.PI * R;
  const seg = L + T, total = n * L + (n - 1) * T;
  const P = { x: 0, z: 0, yaw: 0, turning: false, lane: 0, u: 0 };
  return {
    total, n,
    pose(s) {
      s = ((s % total) + total) % total;
      const k = Math.min(n - 1, Math.floor(s / seg));
      const u = s - k * seg;
      const fwd = k % 2 === 0;
      const cc = c0 + lane * (k + 0.5);
      let a, c, da, dc;
      if (u < L || k === n - 1) {
        a = fwd ? a0 + Math.min(u, L) : a1 - Math.min(u, L); c = cc;
        da = fwd ? 1 : -1; dc = 0; P.turning = false;
      } else {
        // Half circle onto the next lane: centre (end of lane, half a lane over).
        const th = (u - L) / R, ac = fwd ? a1 : a0, sgn = fwd ? 1 : -1;
        a = ac + sgn * Math.sin(th) * R; c = cc + R - Math.cos(th) * R;
        da = sgn * Math.cos(th); dc = Math.sin(th);
        P.turning = true;
      }
      // (along, across) -> world; yaw from +Z toward +X.
      if (along) { P.x = a; P.z = c; P.yaw = Math.atan2(da, dc); } else { P.x = c; P.z = a; P.yaw = Math.atan2(dc, da); }
      P.lane = k; P.u = Math.min(u, L); P.fwd = fwd;
      return P;
    },
    // Worked ground so far: the done lanes and the current one up to the machine.
    cut(s, out0, out1) {
      s = ((s % total) + total) % total;
      const k = Math.min(n - 1, Math.floor(s / seg));
      const u = Math.min(s - k * seg, L);
      const cDone = c0 + lane * k;
      const fwd = k % 2 === 0;
      const pa0 = fwd ? a0 - lane / 2 : a1 - u, pa1 = fwd ? a0 + u : a1 + lane / 2;
      const set = (o, A0, A1, C0, C1) => (along ? o.set(A0, C0, A1, C1) : o.set(C0, A0, C1, A1));
      set(out0, a0 - lane / 2, a1 + lane / 2, c0, cDone);
      set(out1, pa0, pa1, cDone, cDone + lane);
    },
  };
}

// A road driven back and forth (pickup).
function roadRoute(pts) {
  const segs = []; let total = 0;
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segs.push({ a: pts[i], b: pts[i + 1], l, s: total }); total += l; }
  const P = { x: 0, z: 0, yaw: 0, turning: false };
  return {
    total: total * 2,
    pose(s) {
      s = ((s % (2 * total)) + 2 * total) % (2 * total);
      const back = s > total; const d = back ? 2 * total - s : s;
      const g = segs.find((q) => d <= q.s + q.l) ?? segs[segs.length - 1];
      const u = (d - g.s) / g.l;
      const dx = g.b[0] - g.a[0], dz = g.b[1] - g.a[1];
      // Keep right: 2 m off the centre line.
      const nx = dz / g.l, nz = -dx / g.l, off = back ? -2 : 2;
      P.x = g.a[0] + dx * u + nx * off; P.z = g.a[1] + dz * u + nz * off;
      P.yaw = Math.atan2(back ? -dx : dx, back ? -dz : dz);
      return P;
    },
  };
}

export function createFieldActivity(scene, M, terrain) {
  const units = [];
  let slot = 0;
  for (const p of PLAN) {
    const K = KINDS[p.kind];
    const f = p.field ? FIELDS.find((x) => x.name === p.field) : null;
    if (p.field && !f) continue;
    const route = f ? laneRoute(f, p.axis, K.lane) : roadRoute(ROADS[p.road].pts);
    const model = buildModel(p.kind, M);
    scene.add(model.root);
    const cut = f && K.cut ? [slot++, slot++] : null;
    if (cut && slot > NCUT) throw new Error('fieldActivity: too many worked-ground slots');
    if (cut) for (const i of cut) CUT_U.kinds.value[i] = K.cut + 4 * (p.axis === 'x' ? 0 : 1);
    const cx = f ? (f.x0 + f.x1) / 2 : 0, cz = f ? (f.z0 + f.z1) / 2 : 0;
    units.push({ p, K, f, route, model, cut, s0: p.start * route.total, acc: 1e9, fxT: 0, cx, cz, rad: f ? Math.hypot(f.x1 - f.x0, f.z1 - f.z0) / 2 : 0 });
  }
  const _e = new THREE.Euler();
  const st = { exclude: new Set() };

  function place(u, time) {
    const s = u.s0 + time * u.K.speed;
    const P = u.route.pose(s);
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
    const hF = terrain.heightAt(P.x + fx * 1.8, P.z + fz * 1.8), hR = terrain.heightAt(P.x - fx * 1.8, P.z - fz * 1.8);
    const r = u.model.root;
    r.position.set(P.x, (hF + hR) / 2, P.z);
    _e.set(-Math.atan2(hF - hR, 3.6), P.yaw, 0, 'YXZ');
    r.quaternion.setFromEuler(_e);
    u.model.setWheels?.((time * u.K.speed) / 0.5, P.turning ? 0.45 : 0);
    if (u.cut) u.route.cut(s, CUT_U.rects.value[u.cut[0]], CUT_U.rects.value[u.cut[1]]);
    return P;
  }
  // Worked ground is right from the first frame.
  for (const u of units) place(u, 0);

  return {
    units,
    // Talhões of the player's job: no machine works there (it waits out of sight).
    setExcluded(names) { st.exclude = new Set(names); },
    update(dt, time, camera, dust, mist) {
      for (const u of units) {
        const r = u.model.root;
        if (u.f && st.exclude.has(u.f.name)) { r.visible = false; continue; }
        const cam = camera.position;
        const dField = u.f ? Math.max(0, Math.hypot(cam.x - u.cx, cam.z - u.cz) - u.rad) : Math.hypot(cam.x - r.position.x, cam.z - r.position.z);
        if (dField > 1500) { r.visible = false; u.acc = 1e9; continue; }
        // Distance-throttled pose (the worked ground keeps up from afar too).
        u.acc += dt;
        const every = dField < 400 ? 0 : dField < 900 ? 0.12 : 0.5;
        if (u.acc < every) { vehicleLod(r, u.model.detail, cam, 220, 1100, u.model.setWheels?.meshes); continue; }
        const step = Math.min(u.acc, 1); u.acc = 0;
        const P = place(u, time);
        const d = vehicleLod(r, u.model.detail, cam, 220, 1100, u.model.setWheels?.meshes);
        if (d > 600 || P.turning) continue;
        // Dust / chaff behind the machine, spray mist from the booms.
        const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
        u.fxT -= step;
        while (u.fxT <= 0) {
          u.fxT += u.K.mist ? 0.05 : 0.1;
          const side = (Math.random() - 0.5) * (u.K.mist ? 26 : 3.2);
          const bx = P.x - fx * u.K.back + fz * side, bz = P.z - fz * u.K.back - fx * side;
          const gy = terrain.heightAt(bx, bz);
          if (u.K.mist && mist) {
            mist.spawn(bx, gy + 1.6, bz, -fx * 0.3, -0.5, -fz * 0.3, { life: 1.6, size: 0.6, grow: 4, alpha: 0.12, drag: 1.4, gravity: 0.3, color: [0.9, 0.93, 0.9], kind: 1 });
          } else if (dust) {
            const chaff = u.K.chaff;
            dust.spawn(bx, gy + (chaff ? 1.2 : 0.3), bz, -fx * 0.6, 0.3 + Math.random() * 0.4, -fz * 0.6,
              { life: 3 + Math.random() * 2, size: chaff ? 1.4 : 1.8, grow: 2.4, alpha: chaff ? 0.16 : 0.22, drag: 0.8, gravity: -0.05, color: chaff ? [0.72, 0.62, 0.4] : [0.55, 0.27, 0.15] });
          }
        }
      }
    },
  };
}
