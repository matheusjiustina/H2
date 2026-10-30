// Grain storage: silos on a concrete slab with a lettered panel, ladder and a
// roof vent, a bucket-elevator tower, and the loading gallery that runs from
// the tower along the silo tops (resting on each silo, with a trestle on the
// slope). Everything stands on the ground (slabs reach below the terrain),
// is merged per material by the scene builder and has one collider each.
import * as THREE from 'three';
import { canvas, canvasTexture } from '../core/textures.js';

const LABEL_MAT = {};
// Painted lettering on a curved panel: two lines on an off-white band.
function labelMat(line1, line2) {
  const key = `${line1}|${line2}`;
  return (LABEL_MAT[key] ??= (() => {
    const c = canvas(1024, 256);
    const g = c.getContext('2d');
    g.fillStyle = '#eceae2'; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = '#1f4d2b'; g.fillRect(0, 0, 1024, 14); g.fillRect(0, 242, 1024, 14);
    g.fillStyle = '#1f4d2b'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 118px Arial'; g.fillText(line1, 512, 98);
    g.fillStyle = '#9a6a12'; g.font = 'bold 66px Arial'; g.fillText(line2, 512, 192);
    return new THREE.MeshStandardMaterial({ map: canvasTexture(c), roughness: 0.55, metalness: 0.2 });
  })());
}

const R = 5.5, WALL_H = 13, SLAB = 1.0;
// Ground under a footprint: highest and lowest terrain among a few points.
function groundSpan(H, x, z, r) {
  let hi = -1e9, lo = 1e9;
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) { const y = H(x + dx, z + dz); hi = Math.max(hi, y); lo = Math.min(lo, y); }
  return [lo, hi];
}

// One silo whose base is at x, z. `face`: direction (rad from +z toward +x)
// of the lettering, `side`: direction of the ladder.
export function grainSilo(B, M, H, x, z, { face = 0, side = Math.PI, line1 = 'AGRO WINGS', line2 = 'SILO' } = {}) {
  const [lo, hi] = groundSpan(H, x, z, R + 0.6);
  const y = hi;
  // Slab: from below the lowest ground to a little above the highest.
  const sh = y - lo + SLAB;
  B.cyl(R + 0.7, R + 0.7, sh, M.concrete, x, y + SLAB - sh / 2, z, 28);
  const y0 = y + SLAB;
  B.cyl(R, R, WALL_H, M.galv, x, y0 + WALL_H / 2, z, 28);
  for (const h of [3.2, 6.6, 10.0]) B.cyl(R + 0.1, R + 0.1, 0.22, M.steel, x, y0 + h, z, 28);
  B.cyl(R + 0.25, R + 0.25, 0.3, M.steel, x, y0 + WALL_H, z, 28); // eave ring
  const roofH = 3.0;
  B.add(new THREE.ConeGeometry(R + 0.2, roofH, 28), M.galv, x, y0 + WALL_H + roofH / 2, z);
  const peak = y0 + WALL_H + roofH;
  B.cyl(0.9, 0.9, 0.7, M.steel, x, peak + 0.2, z, 12); // feed hatch
  B.add(new THREE.ConeGeometry(1.15, 0.6, 12), M.steel, x, peak + 0.85, z); // vent cap
  // Lettering panel on the wall.
  const len = 1.35;
  const panel = new THREE.CylinderGeometry(R + 0.03, R + 0.03, 2.1, 20, 1, true, face - len / 2, len);
  B.add(panel, labelMat(line1, line2), x, y0 + 7.4, z);
  // Ladder up the side: two rails and rungs, fixed with brackets.
  const sx = Math.sin(side), cz = Math.cos(side), px = cz, pz = -sx; // radial / tangent
  const lx = x + sx * (R + 0.18), lz = z + cz * (R + 0.18);
  const lh = WALL_H + 0.6;
  for (const o of [-0.26, 0.26]) B.box(0.07, lh, 0.07, M.steel, lx + px * o, y0 + lh / 2, lz + pz * o);
  for (let i = 0; i < 14; i++) B.add(new THREE.BoxGeometry(0.52, 0.05, 0.05), M.steel, lx, y0 + 0.5 + i * ((lh - 0.8) / 13), lz, Math.atan2(px, pz));
  for (const h of [2, 7, 12]) B.box(0.1, 0.1, 0.2, M.steel, lx - sx * 0.1, y0 + h, lz - cz * 0.1);
  // Door (hatch) at the base.
  B.add(new THREE.BoxGeometry(0.9, 1.5, 0.12), M.black, x + Math.sin(face + 0.8) * (R + 0.04), y0 + 0.75, z + Math.cos(face + 0.8) * (R + 0.04), face + 0.8);
  B.collider(x - R - 0.4, x + R + 0.4, z - R - 0.4, z + R + 0.4, peak + 1.2, 'silo');
  return { top: peak, y0 };
}

// The elevator tower at (x, z): concrete shaft on a slab, a head house with
// a roof, a ladder, and an inlet pit hopper at the foot.
export function elevatorTower(B, M, H, x, z, { face = 0 } = {}) {
  const [lo, hi] = groundSpan(H, x, z, 2.4);
  const y = hi, sh = y - lo + 0.8;
  B.box(6.4, sh, 6.4, M.concrete, x, y + 0.8 - sh / 2, z);
  const y0 = y + 0.8, shaft = 25;
  B.box(3.2, shaft, 3.2, M.concrete, x, y0 + shaft / 2, z, 0, 4);
  for (const [dx, dz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) B.box(0.3, shaft, 0.3, M.steel, x + dx, y0 + shaft / 2, z + dz);
  const hy = y0 + shaft;
  B.box(4.6, 3.4, 4.6, M.galv, x, hy + 1.7, z, 0, 3); // head house
  B.add(new THREE.ConeGeometry(3.6, 1.6, 4), M.steel, x, hy + 3.4 + 0.8, z, Math.PI / 4);
  B.box(1.2, 1.2, 0.1, M.black, x, hy + 1.9, z + 2.33); // window
  // Ladder on the shaft.
  for (const o of [-0.26, 0.26]) B.box(0.07, shaft, 0.07, M.steel, x + o, y0 + shaft / 2, z - 1.75);
  for (let i = 0; i < 24; i++) B.box(0.52, 0.05, 0.05, M.steel, x, y0 + 0.5 + i * 1.0, z - 1.75);
  // Intake: pit hopper on the ground in front of the tower.
  const hx = x + Math.sin(face) * 5.2, hz = z + Math.cos(face) * 5.2;
  B.box(3.4, 0.5, 3.4, M.concrete, hx, y0 + 0.25, hz);
  B.add(new THREE.CylinderGeometry(1.9, 0.7, 1.4, 4, 1, true), M.steel, hx, y0 + 1.2, hz, Math.PI / 4);
  B.collider(x - 3.4, x + 3.4, z - 3.4, z + 3.4, hy + 5.2, 'elevator');
  return { head: hy + 1.7 };
}

// A complete store: `n` silos in a line from (x, z) along `axis` ('z' or
// 'x'), spaced 28 m, the elevator at the end with its gallery, a grain
// dryer beside the tower. Returns the silos' positions.
export function grainStore(B, M, H, x, z, { n = 3, axis = 'z', name = 'AGRO WINGS', dir = 1, dryer = true } = {}) {
  const step = 28 * dir;
  const at = (i) => (axis === 'z' ? [x, z + i * step] : [x + i * step, z]);
  const face = axis === 'z' ? Math.PI / 2 : 0, side = axis === 'z' ? -Math.PI / 2 : Math.PI;
  const tops = [];
  for (let i = 0; i < n; i++) {
    const [sx, sz] = at(i);
    tops.push(grainSilo(B, M, H, sx, sz, { face, side, line1: name, line2: `SILO ${String(i + 1).padStart(2, '0')}` }));
  }
  // Tower beyond the last silo.
  const [tx, tz] = at(n - 1 + 1.05);
  const twr = elevatorTower(B, M, H, tx, tz, { face: axis === 'z' ? Math.PI / 2 : 0 });
  const gy = tops[0].top + 1.5; // gallery axis height, resting on the silo hatches
  const [fx, fz] = at(0), [lx, lz] = at(n - 1);
  // Horizontal run over the silo tops.
  const runLen = Math.hypot(lx - fx, lz - fz) + 2.4;
  const mx = (fx + lx) / 2, mz = (fz + lz) / 2, yaw = axis === 'z' ? 0 : Math.PI / 2;
  B.add(new THREE.BoxGeometry(1.3, 1.3, runLen), M.galv, mx, gy, mz, yaw);
  B.add(new THREE.BoxGeometry(1.5, 0.12, runLen), M.steel, mx, gy + 0.72, mz, yaw);
  for (let i = 0; i < n; i++) { // posts from each hatch to the gallery
    const [sx, sz] = at(i);
    const ph = gy - 0.65 - tops[i].top;
    B.box(0.45, ph + 0.6, 0.45, M.steel, sx, tops[i].top + (ph - 0.6) / 2 + 0.5, sz);
  }
  // Sloping run from the tower head down to the end of the horizontal run.
  const sxEnd = axis === 'z' ? lx : lx + 2 * dir, szEnd = axis === 'z' ? lz + 2 * dir : lz;
  const hxs = tx, hzs = tz;
  const dx = hxs - sxEnd, dz = hzs - szEnd, dy = twr.head - gy, dl = Math.hypot(dx, dz);
  const slopeLen = Math.hypot(dl, dy);
  const sYaw = Math.atan2(dx, dz), pitch = Math.atan2(dy, dl);
  B.add(new THREE.BoxGeometry(1.3, 1.3, slopeLen), M.galv, (sxEnd + hxs) / 2, (gy + twr.head) / 2, (szEnd + hzs) / 2, sYaw, -pitch);
  // One trestle under the slope's middle.
  const tmx = (sxEnd + hxs) / 2, tmz = (szEnd + hzs) / 2, tmy = (gy + twr.head) / 2;
  const [tlo, thi] = groundSpan(H, tmx, tmz, 1.2);
  B.box(0.4, tmy - 0.7 - tlo, 0.4, M.steel, tmx - 0.9, (tmy - 0.7 + tlo) / 2, tmz);
  B.box(0.4, tmy - 0.7 - tlo, 0.4, M.steel, tmx + 0.9, (tmy - 0.7 + tlo) / 2, tmz);
  B.box(2.4, 0.3, 0.4, M.steel, tmx, tmy - 0.75, tmz);
  B.box(1.6, 0.6, 1.6, M.concrete, tmx, thi + 0.2, tmz);
  B.collider(Math.min(fx, lx, tx) - 1, Math.max(fx, lx, tx) + 1, Math.min(fz, lz, tz) - 1, Math.max(fz, lz, tz) + 1, gy + 1, 'gallery', gy - 1);
  // Dryer beside the tower, joined to it by a duct.
  if (dryer) {
    const ox = axis === 'z' ? 13 : 0, oz = axis === 'z' ? 0 : 13;
    const ddx = tx + ox, ddz = tz + oz;
    const dy0 = grainDryer(B, M, H, ddx, ddz, { axis });
    const dyh = dy0 + 12;
    const dul = Math.hypot(ddx - tx, ddz - tz) - 4.2;
    B.add(new THREE.BoxGeometry(1.0, 1.0, dul), M.galv, (ddx + tx) / 2, dyh, (ddz + tz) / 2, axis === 'z' ? Math.PI / 2 : 0);
  }
  return Array.from({ length: n }, (_, i) => at(i));
}

// The grain dryer: slab, tall galvanized body with a roof ring, burner house
// on one side, chimney on top. Returns the height of its slab top.
export function grainDryer(B, M, H, x, z, { axis = 'z' } = {}) {
  const [lo, hi] = groundSpan(H, x, z, 3.2);
  B.box(7, hi - lo + 0.6, 7, M.concrete, x, hi + 0.6 - (hi - lo + 0.6) / 2, z);
  const y0 = hi + 0.6;
  B.box(5, 18, 5, M.galv, x, y0 + 9, z, 0, 4);
  B.box(5.6, 0.4, 5.6, M.steel, x, y0 + 18.2, z);
  const bx = axis === 'z' ? 4.2 : 0, bz = axis === 'z' ? 0 : 4.2;
  B.box(3.2, 2.6, 3.2, M.steel, x + bx, y0 + 1.3, z + bz); // burner house
  B.box(0.5, 4, 0.5, M.steel, x + bx * 0.6, y0 + 4.6, z + bz * 0.6); // flue up the wall
  B.cyl(0.5, 0.5, 8, M.steel, x + (axis === 'z' ? 1.4 : 0), y0 + 22.4, z + (axis === 'z' ? 0 : 1.4), 10);
  B.collider(x - 3.2, x + 3.2, z - 3.2, z + 3.2, y0 + 26.6, 'dryer');
  return y0;
}
