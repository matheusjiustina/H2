// Centre-pivot irrigation machines (Mato Grosso Operations, premium map 04).
// One per pivot field (src/world/matogrosso.js MT_PIVOTS): the centre tower
// over the well, a galvanised pipeline arching span to span on A-frame
// towers with two big tyres each, the truss under every span, drop hoses
// hanging to the crop, the overhang and the end gun. All pivots are merged
// into one mesh of one material, the drop hoses into one line set: two draw
// calls for the whole district. The arm is an obstacle at the height of its
// pipe (world.js obstacleAt): low passes over a pivot field hop over it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MT_PIVOTS, pivotArmAt } from './matogrosso.js';

const UP = new THREE.Vector3(0, 1, 0);
// A cylinder from a to b (radius r, n sides).
function rod(a, b, r, n = 6) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, n, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  g.deleteAttribute('uv');
  return g;
}
function wheel(c, axis, r) {
  const g = new THREE.CylinderGeometry(r, r, 0.42, 14);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, axis));
  g.translate(c.x, c.y, c.z);
  g.deleteAttribute('uv');
  return g;
}

export function createPivots(terrain) {
  const steel = [], tyres = [], drops = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  for (const p of MT_PIVOTS) {
    const ux = Math.cos(p.ang), uz = Math.sin(p.ang), nx = -uz, nz = ux; // along the arm, across it
    const at = (s, side = 0) => [p.x + ux * s + nx * side, p.z + uz * s + nz * side];
    const g0 = terrain.heightAt(p.x, p.z);
    // Centre tower: four legs to the pivot point, the gearbox and riser.
    const top = V(p.x, g0 + p.h + 0.6, p.z);
    for (const [a, b] of [[1.6, 1.6], [-1.6, 1.6], [1.6, -1.6], [-1.6, -1.6]]) steel.push(rod(V(p.x + a, g0, p.z + b), top, 0.07));
    steel.push(rod(V(p.x, g0, p.z), V(p.x, g0 + p.h + 1.4, p.z), 0.16, 10));
    // Spans: towers every `span` m, the last one at the rim less the overhang.
    const nT = Math.max(1, Math.floor((p.r - 18) / p.span));
    let prev = top.clone();
    const stations = [];
    for (let k = 1; k <= nT; k++) stations.push(k * p.span);
    for (const s of stations) {
      const [tx, tz] = at(s), gy = terrain.heightAt(tx, tz), py = gy + p.h;
      const pipe = V(tx, py, tz);
      // The pipeline arches up between towers; the truss below it.
      const mid = prev.clone().lerp(pipe, 0.5); mid.y += 0.7;
      steel.push(rod(prev, mid, 0.1, 8), rod(mid, pipe, 0.1, 8));
      const lowA = prev.clone(), lowB = pipe.clone(); lowA.y -= 0.1; lowB.y -= 0.1;
      const chordMid = prev.clone().lerp(pipe, 0.5); chordMid.y -= 1.0;
      steel.push(rod(lowA, chordMid, 0.035), rod(chordMid, lowB, 0.035));
      for (let q = 1; q < 6; q++) {
        const t = q / 6, onPipe = prev.clone().lerp(pipe, t); onPipe.y += 0.7 * Math.sin(Math.PI * t);
        const onChord = prev.clone().lerp(pipe, t); onChord.y -= 1.0 * Math.sin(Math.PI * t) + 0.1;
        steel.push(rod(onPipe, onChord, 0.025, 4));
      }
      // Drop hoses every 3 m down toward the crop.
      for (let d = 3; d < p.span; d += 3) {
        const t = d / p.span, h = prev.clone().lerp(pipe, t); h.y += 0.7 * Math.sin(Math.PI * t);
        const gyd = terrain.heightAt(h.x, h.z);
        drops.push(h.x, h.y, h.z, h.x, gyd + 1.2, h.z);
      }
      // A-frame tower with two wheels (tracks across the arm).
      for (const side of [-1.9, 1.9]) {
        const [wx, wz] = at(s, side), wy = terrain.heightAt(wx, wz);
        steel.push(rod(V(wx, wy + 0.65, wz), pipe, 0.07));
        tyres.push(wheel(V(wx, wy + 0.62, wz), V(ux, 0, uz), 0.62));
      }
      { const [ax, az] = at(s, -1.9), [bx, bz] = at(s, 1.9); steel.push(rod(V(ax, terrain.heightAt(ax, az) + 0.65, az), V(bx, terrain.heightAt(bx, bz) + 0.65, bz), 0.05)); }
      prev = pipe;
    }
    // Overhang to the rim and the end gun.
    const [ex, ez] = at(p.r - 2), ey = terrain.heightAt(ex, ez) + p.h - 0.2;
    steel.push(rod(prev, V(ex, ey, ez), 0.07, 6));
    steel.push(rod(V(ex, ey, ez), V(ex + ux * 0.8, ey + 0.5, ez + uz * 0.8), 0.06, 6));
  }
  const group = new THREE.Group();
  group.name = 'pivots';
  const galv = new THREE.MeshStandardMaterial({ color: 0xb9bdbf, roughness: 0.45, metalness: 0.75 });
  const tyreM = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.9, metalness: 0 });
  const mS = new THREE.Mesh(mergeGeometries(steel), galv);
  const mT = new THREE.Mesh(mergeGeometries(tyres), tyreM);
  mS.castShadow = mT.castShadow = true;
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(drops, 3));
  const mD = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x3c3f41, transparent: true, opacity: 0.75 }));
  for (const m of [mS, mT, mD]) { m.matrixAutoUpdate = false; m.updateMatrix(); group.add(m); }
  for (const g of steel) g.dispose();
  for (const g of tyres) g.dispose();
  return {
    group,
    // The arm as an obstacle: within 1.3 m of it horizontally and under its
    // pipe (plus the arch) — the name the crash report shows.
    hit(x, y, z, ground) {
      for (const p of MT_PIVOTS) {
        if (Math.abs(x - p.x) > p.r + 5 || Math.abs(z - p.z) > p.r + 5) continue;
        if (pivotArmAt(p, x, z) < 1.3 && y - ground < p.h + 0.8 && y - ground > 0.15) return 'center pivot';
        if (Math.hypot(x - p.x, z - p.z) < 2.5 && y - ground < p.h + 1.5) return 'center pivot';
      }
      return null;
    },
    topNear(x, z, rad, ground) {
      let top = -Infinity;
      for (const p of MT_PIVOTS) if (pivotArmAt(p, x, z) < rad + 1.3) top = Math.max(top, ground + p.h + 0.8);
      return top;
    },
  };
}
