// Cabin seen from outside.
//
// The detailed cockpit (60–130 draw calls) is drawn only from the cockpit
// view or from a camera close to the aircraft (CABIN_FULL). Beyond that the
// canopy used to look empty — the ground showing through the cabin — so one
// light stand-in is drawn instead: the cabin volume taken from the real
// cockpit's own extents, as a dark inward-facing liner (only its far walls
// show through the glass), an instrument-panel block and a seat. One mesh,
// ≈ 100 triangles, one small material (same shader program as the airframe's), no textures: it costs next to
// nothing at any distance and never leaves a see-through hole.
import * as THREE from 'three';

export const CABIN_FULL = 9.5; // m: the detailed cockpit is drawn inside this
export const CABIN_FULL_OUT = 11; // m: …and kept until this (no flicker at the edge)

const _m = new THREE.Matrix4(), _b = new THREE.Box3(), _p = new THREE.Vector3();

// Matrix of `o` in `root`'s frame from the local matrices up the chain (valid
// while the world matrices are frozen too, as for a parked aircraft).
function inRoot(o, root, out) {
  out.identity();
  for (let n = o; n && n !== root; n = n.parent) {
    if (n.matrixAutoUpdate) n.updateMatrix();
    out.premultiply(n.matrix);
  }
  return out;
}

// Extents of the solid parts of a group in the model's frame (null if empty).
function boundsOf(root, group, solidOnly = true) {
  const box = new THREE.Box3();
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.isInstancedMesh || o.isSprite) return;
    if (solidOnly && (o.material?.transparent || (Array.isArray(o.material) && o.material.some((m) => m.transparent)))) return; // glass
    const gb = o.geometry.boundingBox ?? (o.geometry.computeBoundingBox(), o.geometry.boundingBox);
    if (!gb || gb.isEmpty()) return;
    inRoot(o, root, _m);
    _b.copy(gb).applyMatrix4(_m);
    box.union(_b);
  });
  return box.isEmpty() ? null : box;
}

function pushBox(pos, nor, col, idx, x0, y0, z0, x1, y1, z1, color, inward) {
  const c = new THREE.Color(color);
  // 6 faces: normal, then the 4 corners CCW seen from outside.
  const F = [
    [[1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]],
    [[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
    [[0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]],
    [[0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
    [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
    [[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]],
  ];
  for (const [n, q] of F) {
    const base = pos.length / 3;
    for (const p of q) { pos.push(...p); nor.push(...(inward ? [-n[0], -n[1], -n[2]] : n)); col.push(c.r, c.g, c.b); }
    if (inward) idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

// A convex side profile [[z, y], …] extruded from x0 to x1, faces inward.
function pushPrism(pos, nor, col, idx, x0, x1, P, color) {
  const c = new THREE.Color(color), n = P.length;
  const cz = P.reduce((a, p) => a + p[0], 0) / n, cy = P.reduce((a, p) => a + p[1], 0) / n, cx = (x0 + x1) / 2;
  const face = (verts) => {
    // Inward normal: the plane's normal turned toward the centre.
    const a = new THREE.Vector3(...verts[0]), b = new THREE.Vector3(...verts[1]), d = new THREE.Vector3(...verts[2]);
    const nn = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    const mid = verts.reduce((m, v) => m.add(new THREE.Vector3(...v)), new THREE.Vector3()).multiplyScalar(1 / verts.length);
    const flip = nn.dot(new THREE.Vector3(cx, cy, cz).sub(mid)) < 0; // pointing away from the centre -> reverse
    const vs = flip ? verts.slice().reverse() : verts, nrm = flip ? nn.clone().negate() : nn;
    const base = pos.length / 3;
    for (const v of vs) { pos.push(...v); nor.push(nrm.x, nrm.y, nrm.z); col.push(c.r, c.g, c.b); }
    for (let i = 1; i < vs.length - 1; i++) idx.push(base, base + i, base + i + 1);
  };
  for (let i = 0; i < n; i++) { const A = P[i], B = P[(i + 1) % n]; face([[x0, A[1], A[0]], [x1, A[1], A[0]], [x1, B[1], B[0]], [x0, B[1], B[0]]]); }
  face(P.map(([z, y]) => [x0, y, z]));
  face(P.map(([z, y]) => [x1, y, z]));
}

// root: the model's root group; cockpit: its detailed cockpit group. Returns
// the stand-in mesh (already added to root, hidden) or null.
export function buildCabinProxy(root, cockpit, pilot) {
  const b = boundsOf(root, cockpit);
  const pb = pilot?.children.length ? boundsOf(root, pilot, false) : null;
  if (!b) return null;
  const sz = b.getSize(new THREE.Vector3());
  if (sz.x < 0.3 || sz.y < 0.3 || sz.z < 0.3) return null;
  const k = 0.05;
  const x0 = b.min.x + sz.x * k, x1 = b.max.x - sz.x * k, y0 = b.min.y + sz.y * k, y1 = b.max.y - sz.y * k, z0 = b.min.z + sz.z * k, z1 = b.max.z - sz.z * k;
  const w = x1 - x0, h = y1 - y0, d = z1 - z0, cx = (x0 + x1) / 2;
  const pos = [], nor = [], col = [], idx = [];
  // Liner: the cabin walls, floor and roof seen from inside. Behind the
  // pilot the roof drops (the canopy ends and the deck runs back lower), so
  // the rear part is a lower box and never pokes through the skin.
  // The roof follows the canopy: highest over the pilot's head, falling to the
  // glareshield in front (windshield rake) and to the deck behind — never
  // above the skin. Side profile in (z, y), extruded across the cabin.
  const zA = pb ? (pb.min.z + pb.max.z) / 2 : z0 + d * 0.5;
  const yA = pb ? Math.min(y1, pb.max.y + 0.08) : y1;
  const zF = Math.min(z1 - d * 0.1, zA + d * 0.2), zRr = Math.max(z0 + d * 0.1, zA - d * 0.2);
  const profile = [[z0, y0], [z1, y0], [z1, y0 + h * 0.62], [zF, yA], [zRr, yA], [z0, y0 + h * 0.5]];
  pushPrism(pos, nor, col, idx, x0, x1, profile, 0x2a2d30);
  // Instrument panel and glareshield at the front (+Z is forward).
  pushBox(pos, nor, col, idx, x0 + w * 0.04, y0 + h * 0.34, z1 - d * 0.24, x1 - w * 0.04, y0 + h * 0.6, z1 - d * 0.03, 0x141618, false);
  // Seat: cushion and back, a little behind the middle.
  pushBox(pos, nor, col, idx, cx - w * 0.2, y0 + h * 0.04, z0 + d * 0.24, cx + w * 0.2, y0 + h * 0.3, z0 + d * 0.56, 0x34383c, false);
  pushBox(pos, nor, col, idx, cx - w * 0.2, y0 + h * 0.04, z0 + d * 0.2, cx + w * 0.2, y0 + h * 0.5, z0 + d * 0.3, 0x34383c, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  // (One material per model: a model being released disposes its own materials.)
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  mesh.name = 'cabin-proxy';
  mesh.visible = false;
  mesh.receiveShadow = false; mesh.castShadow = false;
  root.add(mesh);
  return mesh;
}

// True while the detailed cockpit should be drawn (with hysteresis).
export function cabinFull(inCockpit, dist, wasFull) {
  return inCockpit || dist < (wasFull ? CABIN_FULL_OUT : CABIN_FULL);
}
