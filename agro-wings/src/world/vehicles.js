// Farm vehicles and service-area props, built from extruded side profiles,
// rounded boxes and lathed wheels, then merged into the static per-material
// meshes (no extra draw calls per vehicle). Local frame: +Z forward, +Y up.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Places parts in a vehicle's local frame and hands them to the Builder.
class Kit {
  constructor(B, x, y, z, ry) {
    this.B = B;
    this.base = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), ry), V(1, 1, 1));
  }
  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V(sx, sy, sz));
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(this.base.clone().multiply(m));
    this.B.addRaw(g, mat);
  }
  box(w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) { this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz); }
  rbox(w, h, d, rad, mat, x, y, z, rx = 0, ry = 0, rz = 0) { this.add(new RoundedBoxGeometry(w, h, d, 2, Math.min(rad, w / 2, h / 2, d / 2) - 1e-3), mat, x, y, z, rx, ry, rz); }
  cylX(r, len, mat, x, y, z, seg = 16) { this.add(new THREE.CylinderGeometry(r, r, len, seg), mat, x, y, z, 0, 0, Math.PI / 2); }
  cylZ(r, len, mat, x, y, z, seg = 16, sx = 1, sy = 1) { this.add(new THREE.CylinderGeometry(r, r, len, seg), mat, x, y, z, Math.PI / 2, 0, 0, sx, 1, sy); }
  cylY(r, len, mat, x, y, z, seg = 12) { this.add(new THREE.CylinderGeometry(r, r, len, seg), mat, x, y, z); }
  rod(a, b, r, mat, seg = 6) {
    const va = V(...a), vb = V(...b);
    const g = new THREE.CylinderGeometry(r, r, va.distanceTo(vb), seg);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), vb.clone().sub(va).normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, V(1, 1, 1)));
    this.add(g, mat);
  }
  // Side profile [u forward, v up] extruded across the width (centred on x=0).
  profile(pts, width, mat, bevel = 0.04, arches = []) {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p === 'arch') { const a = arches.shift(); s.lineTo(a[0] + a[2], a[1]); s.absarc(a[0], a[1], a[2], 0, Math.PI, false); continue; }
      s.lineTo(p[0], p[1]);
    }
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
    g.translate(0, 0, -(width - bevel * 2) / 2);
    g.rotateY(-Math.PI / 2);
    this.add(g, mat);
  }
}

// Tyre (lathed, rounded shoulders) + rim + hub; axis along local X.
function wheel(K, M, x, y, z, R, W, rimMat, dual = false) {
  const pts = [];
  const rimR = R * 0.62;
  pts.push(new THREE.Vector2(rimR, -W / 2));
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * Math.PI;
    pts.push(new THREE.Vector2(R - W * 0.18 + Math.cos(a) * W * 0.18, Math.sin(a) * W * 0.5));
  }
  pts.push(new THREE.Vector2(rimR, W / 2));
  const tyre = new THREE.LatheGeometry(pts, 20);
  const offs = dual ? [-W * 0.52, W * 0.52] : [0];
  for (const o of offs) {
    K.add(tyre, M.rubber, x + o, y, z, 0, 0, Math.PI / 2);
    K.add(new THREE.CylinderGeometry(rimR, rimR, W * 0.9, 16), rimMat, x + o, y, z, 0, 0, Math.PI / 2);
  }
  const side = Math.sign(x) || 1;
  K.add(new THREE.CylinderGeometry(rimR * 0.4, rimR * 0.45, 0.06, 10), M.chrome, x + side * (W * (dual ? 1.0 : 0.47)), y, z, 0, 0, Math.PI / 2);
}

// ---------------------------------------------------------------------------
// Double-cab support pickup (white), small chemical tank + pump in the bed.
export function pickup(B, M, x, y, z, ry) {
  const K = new Kit(B, x, y, z, ry);
  const W = 1.84;
  // Lower body: bed floor behind the cab, beltline at the cab, sloped hood,
  // wheel arches (wheelbase 3.1 m).
  K.profile([
    [-2.62, 0.48], [-2.66, 0.8], [-0.66, 0.8], [-0.62, 1.07], [1.3, 1.07], [2.3, 0.99], [2.6, 0.9], [2.66, 0.62], [2.6, 0.45],
    'arch', [-1.08 + 0.0, 0.42], 'arch', [-2.55, 0.45],
  ], W, M.paintWhite, 0.05, [[1.55, 0.4, 0.47], [-1.55, 0.4, 0.47]]);
  // Bed walls and tailgate.
  for (const s of [-1, 1]) K.rbox(0.06, 0.32, 1.96, 0.02, M.paintWhite, s * (W / 2 - 0.03), 0.95, -1.62);
  K.rbox(W, 0.32, 0.06, 0.02, M.paintWhite, 0, 0.95, -2.63);
  K.box(W - 0.14, 0.03, 1.9, M.plasticBlack, 0, 0.81, -1.62); // bed liner
  // Greenhouse: glass inset, roof and pillars in body colour.
  K.profile([[-0.6, 1.05], [-0.54, 1.78], [0.48, 1.8], [1.3, 1.07]], W - 0.18, M.glass, 0);
  K.rbox(W - 0.1, 0.07, 1.04, 0.03, M.paintWhite, 0, 1.82, -0.03);
  for (const s of [-1, 1]) {
    K.rod([s * (W / 2 - 0.1), 1.07, 1.28], [s * (W / 2 - 0.1), 1.8, 0.48], 0.045, M.paintWhite);
    K.box(0.07, 0.72, 0.1, M.paintWhite, s * (W / 2 - 0.1), 1.44, 0.0);
    K.box(0.07, 0.74, 0.12, M.paintWhite, s * (W / 2 - 0.1), 1.43, -0.56);
    K.box(0.05, 0.05, 0.28, M.plasticBlack, s * (W / 2 + 0.01), 0.98, 0.35); // door handles
    K.box(0.05, 0.05, 0.28, M.plasticBlack, s * (W / 2 + 0.01), 0.98, -0.3);
    K.rbox(0.12, 0.16, 0.2, 0.03, M.plasticBlack, s * (W / 2 + 0.1), 1.25, 1.1); // mirrors
    K.box(0.04, 0.12, 0.3, M.lens, s * 0.7, 0.88, 2.6, 0, 0, 0); // headlights
    K.box(0.18, 0.12, 0.05, M.lens, s * 0.72, 0.9, 2.64);
    K.box(0.14, 0.26, 0.05, M.tailLens, s * 0.82, 0.94, -2.66);
  }
  K.box(1.0, 0.24, 0.05, M.plasticBlack, 0, 0.8, 2.66); // grille
  K.box(1.0, 0.03, 0.06, M.chrome, 0, 0.86, 2.68);
  K.rbox(1.9, 0.18, 0.22, 0.05, M.plasticBlack, 0, 0.5, 2.7); // bumpers
  K.rbox(1.86, 0.14, 0.2, 0.05, M.chrome, 0, 0.52, -2.72);
  K.box(0.02, 0.6, 0.02, M.plasticBlack, -0.75, 2.1, 0.6); // antenna
  K.box(1.5, 0.05, 0.05, M.plasticBlack, 0, 1.88, 0.25); K.box(1.5, 0.05, 0.05, M.plasticBlack, 0, 1.88, -0.35); // roof rails
  // Wheels.
  for (const s of [-1, 1]) for (const wz of [1.55, -1.55]) wheel(K, M, s * 0.8, 0.38, wz, 0.38, 0.26, M.alu);
  // Bed: 600 L polyethylene tank in a frame, small pump and hose reel.
  K.rbox(1.05, 0.72, 1.0, 0.12, M.poly, 0, 1.18, -1.35);
  K.cylY(0.13, 0.08, M.blue, 0, 1.58, -1.35, 12);
  for (const s of [-1, 1]) K.box(0.04, 0.04, 1.06, M.galv, s * 0.54, 1.5, -1.35);
  K.box(0.32, 0.26, 0.3, M.red, 0.55, 0.95, -2.25);
  K.add(new THREE.TorusGeometry(0.2, 0.06, 8, 16), M.hoseBlack, -0.5, 1.06, -2.25, 0, Math.PI / 2, 0);
}

// Cab-over support tanker (caminhão de apoio): white cab, aluminium tank with
// walkway, rail, domes, ladder and rear valve cabinet; tandem rear axle.
// With { dynamic: true } the wheels and the rear reel are left out (the
// driving service truck animates its own) and the wheel layout is returned.
export function tanker(B, M, x, y, z, ry, { dynamic = false } = {}) {
  const K = new Kit(B, x, y, z, ry);
  const L = 4.1; // cab front at +L
  // Chassis rails, fuel tank, battery box, air tanks.
  for (const s of [-1, 1]) K.box(0.12, 0.28, 7.6, M.plasticBlack, s * 0.48, 0.92, 0.1);
  K.cylZ(0.28, 1.0, M.alu, 0.95, 0.85, 1.6, 16);
  K.box(0.5, 0.42, 0.6, M.plasticBlack, -0.98, 0.86, 1.7);
  // Cab.
  K.rbox(2.42, 2.05, 1.95, 0.16, M.paintWhite, 0, 2.2, L - 0.98);
  K.rbox(2.3, 0.95, 0.06, 0.04, M.glass, 0, 2.62, L + 0.02, -0.06);
  for (const s of [-1, 1]) K.box(0.05, 0.62, 1.0, M.glass, s * 1.21, 2.55, L - 0.62);
  K.box(2.2, 0.55, 0.05, M.plasticBlack, 0, 1.55, L + 0.01); // grille
  for (let i = 0; i < 4; i++) K.box(2.0, 0.03, 0.06, M.chrome, 0, 1.38 + i * 0.12, L + 0.03);
  K.rbox(2.46, 0.36, 0.3, 0.06, M.plasticBlack, 0, 0.98, L + 0.06); // bumper
  for (const s of [-1, 1]) {
    K.box(0.34, 0.16, 0.06, M.lens, s * 0.88, 1.02, L + 0.22);
    K.box(0.08, 0.06, 0.06, M.amber, s * 1.12, 1.02, L + 0.22);
    K.rod([s * 1.18, 2.9, L - 0.3], [s * 1.5, 2.5, L - 0.1], 0.02, M.plasticBlack);
    K.rbox(0.08, 0.42, 0.2, 0.03, M.plasticBlack, s * 1.52, 2.32, L - 0.1); // mirrors
    K.box(0.4, 0.06, 0.32, M.plasticBlack, s * 1.0, 0.68, L - 0.6); // steps
    K.box(0.4, 0.06, 0.32, M.plasticBlack, s * 1.0, 0.36, L - 0.6);
    K.box(0.02, 0.5, 0.06, M.plasticBlack, s * 1.21, 2.0, L - 1.5); // door seam
    K.rbox(0.18, 0.62, 1.02, 0.04, M.plasticBlack, s * 1.1, 0.95, L - 1.0); // front mudguard
  }
  K.rbox(2.44, 0.22, 0.32, 0.08, M.paintWhite, 0, 3.32, L - 0.2); // sun visor
  for (let i = -2; i <= 2; i++) K.box(0.1, 0.05, 0.05, M.amber, i * 0.35, 3.25, L + 0.0);
  // Tank: elliptical shell with dished heads.
  const tl = 4.6, tz = -1.0;
  K.add(new THREE.CylinderGeometry(1, 1, tl, 28, 1, true), M.alu, 0, 2.15, tz, Math.PI / 2, 0, 0, 1.18, 1, 0.98);
  for (const s of [-1, 1]) K.add(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.alu, 0, 2.15, tz + s * tl / 2, s * Math.PI / 2, 0, 0, 1.18, 0.25, 0.98);
  for (const bz of [tz - 1.5, tz, tz + 1.5]) K.add(new THREE.TorusGeometry(1.0, 0.03, 6, 28), M.steel, 0, 2.15, bz, 0, 0, 0, 1.18, 0.99, 1);
  K.box(0.6, 0.04, tl - 0.4, M.galv, 0, 3.15, tz); // walkway
  for (const s of [-1, 1]) {
    K.rod([s * 0.42, 3.15, tz - tl / 2 + 0.3], [s * 0.42, 3.15, tz + tl / 2 - 0.3], 0.02, M.galv);
    for (let i = 0; i <= 4; i++) K.rod([s * 0.42, 3.15, tz - tl / 2 + 0.3 + i * (tl - 0.6) / 4], [s * 0.42, 3.55, tz - tl / 2 + 0.3 + i * (tl - 0.6) / 4], 0.018, M.galv);
    K.rod([s * 0.42, 3.55, tz - tl / 2 + 0.3], [s * 0.42, 3.55, tz + tl / 2 - 0.3], 0.02, M.galv);
  }
  for (const dz of [-1.2, 0.4]) K.cylY(0.3, 0.16, M.steel, 0, 3.2, tz + dz, 16);
  K.box(2.36, 0.12, 0.08, M.red, 0, 1.55, tz + tl / 2 + 0.3); // stripe
  for (const s of [-1, 1]) K.add(new THREE.BoxGeometry(0.04, 0.14, tl), M.red, s * 1.17, 2.0, tz);
  // Rear: ladder, valve cabinet, hose reel, lights, bumper.
  for (const s of [-1, 1]) K.rod([s * 0.22, 0.9, tz - tl / 2 - 0.15], [s * 0.22, 3.15, tz - tl / 2 - 0.15], 0.025, M.galv);
  for (let i = 0; i < 6; i++) K.rod([-0.22, 1.1 + i * 0.36, tz - tl / 2 - 0.15], [0.22, 1.1 + i * 0.36, tz - tl / 2 - 0.15], 0.018, M.galv);
  K.rbox(1.6, 0.7, 0.5, 0.05, M.alu, -0.4, 1.1, tz - tl / 2 - 0.05);
  if (!dynamic) K.add(new THREE.TorusGeometry(0.3, 0.07, 8, 18), M.hoseBlack, 0.85, 1.25, tz - tl / 2 - 0.1, 0, Math.PI / 2, 0);
  K.rbox(2.4, 0.14, 0.14, 0.04, M.plasticBlack, 0, 0.6, tz - tl / 2 - 0.42);
  for (const s of [-1, 1]) K.box(0.2, 0.12, 0.05, M.tailLens, s * 0.95, 0.62, tz - tl / 2 - 0.5);
  // Wheels: steer axle single, tandem rear axle dual.
  const wheels = [];
  for (const s of [-1, 1]) {
    if (dynamic) wheels.push({ x: s * 1.02, y: 0.5, z: L - 1.0, R: 0.5, steer: true });
    else wheel(K, M, s * 1.02, 0.5, L - 1.0, 0.5, 0.3, M.paintWhite);
    for (const wz of [tz - 0.5, tz - 1.85]) {
      if (dynamic) wheels.push({ x: s * 0.88, y: 0.5, z: wz, R: 0.5, steer: false });
      else wheel(K, M, s * 0.88, 0.5, wz, 0.5, 0.28, M.paintWhite, true);
    }
    K.rbox(0.62, 0.08, 2.4, 0.03, M.plasticBlack, s * 0.9, 1.08, tz - 1.18); // rear mudguards
  }
  return { wheels, rearZ: tz - tl / 2 - 0.5, frontZ: L + 0.25, cabTop: 3.45 };
}

// One wheel (tyre + rim + hub caps on both faces) as a single vertex-coloured
// geometry centred on its axle (axis along X), for animated vehicles.
export function wheelGeometry(R, W, dual = false) {
  const parts = [];
  const col = (g, c) => {
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set(c, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  const rimR = R * 0.62;
  const pts = [new THREE.Vector2(rimR, -W / 2)];
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * Math.PI;
    pts.push(new THREE.Vector2(R - W * 0.18 + Math.cos(a) * W * 0.18, Math.sin(a) * W * 0.5));
  }
  pts.push(new THREE.Vector2(rimR, W / 2));
  for (const o of dual ? [-W * 0.52, W * 0.52] : [0]) {
    const t = new THREE.LatheGeometry(pts, 18).rotateZ(Math.PI / 2).translate(o, 0, 0);
    col(t, [0.05, 0.05, 0.05]);
    col(new THREE.CylinderGeometry(rimR, rimR, W * 0.9, 14).rotateZ(Math.PI / 2).translate(o, 0, 0), [0.8, 0.8, 0.78]);
  }
  const hw = W * (dual ? 1.0 : 0.47);
  for (const s of [-1, 1]) col(new THREE.CylinderGeometry(rimR * 0.4, rimR * 0.45, 0.06, 10).rotateZ(Math.PI / 2).translate(s * hw, 0, 0), [0.62, 0.63, 0.64]);
  // Wheel nuts: a ring of small studs so the spin reads.
  for (const s of [-1, 1]) for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    col(new THREE.BoxGeometry(0.03, 0.04, 0.04).translate(s * (hw + 0.035), Math.cos(a) * rimR * 0.55, Math.sin(a) * rimR * 0.55), [0.25, 0.25, 0.26]);
  }
  return mergeParts(parts);
}

function mergeParts(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

// Farm tractor (generic, red), 4WD, cab.
export function tractor(B, M, x, y, z, ry, { dynamic = false } = {}) {
  const K = new Kit(B, x, y, z, ry);
  const wheels = [];
  K.rbox(0.95, 0.95, 2.4, 0.12, M.tractorRed, 0, 1.45, 1.0); // hood
  K.box(0.85, 0.6, 0.1, M.plasticBlack, 0, 1.4, 2.21); // grille
  K.box(1.1, 0.5, 0.5, M.plasticBlack, 0, 0.95, 2.45); // front weights
  K.rbox(1.4, 0.35, 1.8, 0.06, M.tractorRed, 0, 1.15, -0.6); // body under cab
  // Cab: glass box, posts, roof.
  K.box(1.42, 1.25, 1.5, M.glass, 0, 2.05, -0.65);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(0.07, 1.3, 0.07, M.plasticBlack, sx * 0.72, 2.05, -0.65 + sz * 0.76);
  K.rbox(1.6, 0.14, 1.7, 0.05, M.tractorRed, 0, 2.75, -0.65);
  K.cylY(0.06, 1.3, M.plasticBlack, 0.38, 2.4, 1.6, 10); // exhaust
  for (const s of [-1, 1]) {
    if (dynamic) {
      wheels.push({ x: s * 0.98, y: 0.9, z: -0.75, R: 0.9, W: 0.5, steer: false }, { x: s * 0.85, y: 0.55, z: 1.75, R: 0.55, W: 0.36, steer: true });
    } else {
      wheel(K, M, s * 0.98, 0.9, -0.75, 0.9, 0.5, M.rimGrey);
      wheel(K, M, s * 0.85, 0.55, 1.75, 0.55, 0.36, M.rimGrey);
    }
    K.rbox(0.62, 0.08, 1.4, 0.04, M.tractorRed, s * 0.98, 1.9, -0.75); // fenders
    K.box(0.3, 0.05, 0.25, M.plasticBlack, s * 0.7, 0.6, -0.1); // step
  }
  K.box(0.5, 0.25, 0.35, M.plasticBlack, 0, 0.8, -1.6); // hitch
  return { wheels };
}

// Trailed disc harrow (grade aradora) for a working tractor; local +Z toward the hitch.
export function discHarrow(B, M, x, y, z, ry) {
  const K = new Kit(B, x, y, z, ry);
  K.box(0.12, 0.12, 2.2, M.tractorRed, 0, 0.75, 0.9); // drawbar
  K.box(3.6, 0.16, 0.16, M.tractorRed, 0, 0.75, -0.2); // frame
  K.box(3.6, 0.16, 0.16, M.tractorRed, 0, 0.75, -1.5);
  for (const s of [-1, 1]) K.box(0.16, 0.16, 1.5, M.tractorRed, s * 1.7, 0.75, -0.85);
  // Two gangs of concave discs on angled axles.
  for (const [gz, ang] of [[-0.45, 0.32], [-1.3, -0.32]]) {
    for (let i = 0; i < 9; i++) {
      const gx = -1.6 + i * 0.4;
      K.add(new THREE.CylinderGeometry(0.33, 0.33, 0.03, 16), M.steel, gx, 0.33, gz + Math.sin(ang) * gx * 0.3, 0, ang, Math.PI / 2);
    }
  }
  for (const s of [-1, 1]) K.add(new THREE.CylinderGeometry(0.3, 0.3, 0.18, 12), M.rubber, s * 1.95, 0.3, -0.85, 0, 0, Math.PI / 2);
}

// Self-propelled sprayer (autopropelido): high clearance, central tank, cab
// at the front, booms folded along the sides.
export function sprayer(B, M, x, y, z, ry) {
  const K = new Kit(B, x, y, z, ry);
  K.box(0.5, 0.35, 5.2, M.plasticBlack, 0, 1.9, 0); // frame
  K.rbox(1.6, 1.35, 2.2, 0.35, M.poly, 0, 2.75, -0.6); // tank
  K.cylY(0.22, 0.1, M.orange, 0, 3.47, -0.6, 14);
  K.box(1.5, 1.4, 1.3, M.glass, 0, 2.8, 1.75); // cab
  K.rbox(1.62, 0.14, 1.45, 0.05, M.orange, 0, 3.55, 1.75);
  K.rbox(1.62, 0.5, 1.45, 0.08, M.orange, 0, 2.0, 1.75);
  K.rbox(1.0, 0.8, 1.4, 0.1, M.orange, 0, 2.3, -2.2); // engine bay
  for (const s of [-1, 1]) {
    for (const wz of [1.6, -1.9]) {
      K.box(0.12, 1.2, 0.3, M.plasticBlack, s * 1.25, 1.45, wz); // portal legs
      wheel(K, M, s * 1.4, 0.82, wz, 0.82, 0.32, M.rimGrey);
    }
    K.box(1.2, 0.12, 0.12, M.plasticBlack, s * 0.65, 1.95, 1.6);
    K.box(1.2, 0.12, 0.12, M.plasticBlack, s * 0.65, 1.95, -1.9);
    // Folded boom trusses along the sides.
    K.box(0.08, 0.08, 4.6, M.steel, s * 1.05, 2.6, -0.2);
    K.box(0.08, 0.08, 4.6, M.steel, s * 1.05, 3.1, -0.2);
    for (let i = 0; i < 8; i++) K.rod([s * 1.05, 2.6, -2.4 + i * 0.6], [s * 1.05, 3.1, -2.1 + i * 0.6], 0.02, M.steel);
  }
}

// Combine harvester with its grain platform.
export function harvester(B, M, x, y, z, ry) {
  const K = new Kit(B, x, y, z, ry);
  K.rbox(3.0, 2.6, 6.2, 0.3, M.harvGreen, 0, 2.45, 0);
  K.rbox(3.1, 1.2, 2.6, 0.25, M.harvGreen, 0, 4.25, -0.8); // grain tank
  K.box(1.9, 1.5, 1.6, M.glass, 0, 4.4, 2.3); // cab
  K.rbox(2.1, 0.14, 1.8, 0.05, M.dirtyWhite, 0, 5.2, 2.3);
  K.cylZ(0.22, 4.6, M.harvGreen, 1.75, 4.4, -1.4, 12); // unloading auger, folded
  K.rbox(1.4, 1.2, 1.4, 0.1, M.harvGreen, 0, 1.6, 3.6); // feeder house
  K.box(7.0, 0.7, 1.4, M.harvGreen, 0, 0.9, 4.6); // platform
  K.box(7.0, 0.05, 1.2, M.steel, 0, 0.55, 4.7);
  K.cylX(0.35, 6.8, M.dirtyWhite, 0, 1.6, 4.9, 12); // reel
  for (const s of [-1, 1]) {
    wheel(K, M, s * 1.55, 0.9, 1.6, 0.9, 0.6, M.rimGrey);
    wheel(K, M, s * 1.35, 0.6, -2.4, 0.6, 0.4, M.rimGrey);
  }
  K.cylY(0.09, 1.0, M.plasticBlack, -1.1, 4.4, -2.2, 10);
}

// IBC tote (1000 L): translucent bottle in a galvanised cage on a pallet.
export function ibc(B, M, x, y, z, ry) {
  const K = new Kit(B, x, y, z, ry);
  K.box(1.2, 0.15, 1.0, M.plasticBlack, 0, 0.075, 0);
  K.rbox(1.12, 0.98, 0.94, 0.06, M.poly, 0, 0.66, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(0.04, 1.02, 0.04, M.galv, sx * 0.58, 0.66, sz * 0.48);
  for (const yy of [0.2, 0.45, 0.7, 0.95, 1.16]) {
    for (const s of [-1, 1]) {
      K.box(1.18, 0.025, 0.025, M.galv, 0, yy, s * 0.48);
      K.box(0.025, 0.025, 0.98, M.galv, s * 0.58, yy, 0);
    }
  }
  for (const xx of [-0.3, 0, 0.3]) K.box(0.025, 1.0, 0.025, M.galv, xx, 0.66, 0.49);
  K.cylY(0.11, 0.06, M.dirtyWhite, 0, 1.17, 0, 12);
  K.cylZ(0.05, 0.14, M.blue, 0, 0.26, 0.55, 10);
}

// Pallet with 200 L drums.
export function drumPallet(B, M, x, y, z, ry, mats) {
  const K = new Kit(B, x, y, z, ry);
  K.box(1.2, 0.14, 1.2, M.wood, 0, 0.07, 0);
  let i = 0;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const m = mats[i++ % mats.length];
    K.cylY(0.29, 0.88, m, sx * 0.3, 0.58, sz * 0.3, 16);
    K.add(new THREE.TorusGeometry(0.29, 0.015, 4, 16), m, sx * 0.3, 0.45, sz * 0.3, Math.PI / 2, 0, 0);
    K.add(new THREE.TorusGeometry(0.29, 0.015, 4, 16), m, sx * 0.3, 0.75, sz * 0.3, Math.PI / 2, 0, 0);
  }
}

// Converted shipping container used as the operations office.
export function officeContainer(B, M, x, y, z, ry) {
  const K = new Kit(B, x, y, z, ry);
  K.box(2.44, 2.59, 6.06, M.container, 0, 1.45, 0);
  K.box(2.5, 0.12, 6.12, M.steel, 0, 2.78, 0);
  K.box(2.5, 0.12, 6.12, M.steel, 0, 0.12, 0);
  K.box(0.05, 2.0, 0.95, M.paintWhite, 1.23, 1.15, 1.4); // door
  K.box(0.05, 0.9, 1.3, M.glass, 1.23, 1.7, -1.2); // window
  K.box(0.07, 0.04, 1.4, M.steel, 1.25, 2.16, -1.2);
  K.box(0.6, 0.45, 0.35, M.dirtyWhite, 1.42, 2.1, -0.2); // AC unit
  K.box(0.9, 0.18, 0.6, M.concrete, 1.6, 0.09, 1.4); // step
  K.box(0.02, 0.8, 1.6, M.steel, 1.4, 2.95, 0.0); // sign frame
}

// Animated wheels as two instanced meshes (steered / fixed axles), so a
// vehicle's wheels cost two draws. Returns set(distanceOver0.5m, steerAngle).
export function wheelSet(root, lay, gFront, gRear, mat) {
  const sets = [];
  for (const [geo, steer] of [[gFront, true], [gRear, false]]) {
    const list = lay.filter((w) => !!w.steer === steer);
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    im.castShadow = true;
    root.add(im);
    sets.push({ im, list });
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const set = (spin, steerAngle) => {
    for (const { im, list } of sets) {
      list.forEach((w, i) => {
        e.set(spin * (0.5 / w.R), w.steer ? steerAngle : 0, 0, 'YXZ');
        im.setMatrixAt(i, m.compose(p.set(w.x, w.y, w.z), q.setFromEuler(e), one));
      });
      im.instanceMatrix.needsUpdate = true;
    }
  };
  set.meshes = sets.map((x) => x.im);
  // Bounds once: spinning/steering about each axle keeps them (culling works).
  set(0, 0);
  for (const { im } of sets) im.computeBoundingSphere();
  return set;
}

// Collects Kit output per material in a vehicle's local frame and merges it
// into one mesh per material (animated vehicles: truck, working tractor).
export class PartCollector {
  constructor() { this.parts = new Map(); }
  addRaw(g, mat) {
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
  }
  // Only materials listed in casters cast shadows (all when omitted); the
  // other meshes are small parts, listed in .detail for distance LOD.
  build(group, casters = null) {
    this.detail = [];
    for (const [mat, list] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(list), mat);
      mesh.castShadow = !casters || casters.includes(mat);
      mesh.receiveShadow = true;
      group.add(mesh);
      if (!mesh.castShadow) this.detail.push(mesh);
    }
    return this.detail;
  }
}

// Distance LOD for an animated vehicle: small parts go beyond `near`, the
// wheels beyond `mid` (a pixel or two by then), the whole vehicle beyond
// `far`. Returns the distance.
export function vehicleLod(root, detail, cam, near = 220, far = 900, wheels = null, mid = 400) {
  const d = Math.hypot(cam.x - root.position.x, cam.z - root.position.z);
  root.visible = d < far;
  const show = d < near;
  if (detail.lodShown !== show) { for (const m of detail) m.visible = show; detail.lodShown = show; }
  if (wheels) for (const w of wheels) w.visible = d < mid;
  return d;
}
