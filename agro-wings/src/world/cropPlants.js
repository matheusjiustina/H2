// Near-field crop plants: real 3D soybean, corn and cotton plants around the
// camera (LOD 0/1 of the crop rendering; the row "hedges" and the canopy
// surface in crops.js carry the field beyond). Visual only: the field
// rectangles, crop heights and coverage grids the game plays with are not
// touched.
//
//  * Botany. Soy: branching stems with trifoliate leaves (broad, folded
//    leaflets on petioles) in a layered bush. Corn: a tapering stalk, long
//    arching distichous blades (alternate sides, drooping tips) and a tassel.
//    Cotton: a reddish main stem with long-petioled palmate leaves, a cream
//    flower and green bolls. Leaves are cut-out cards (folded along the
//    midrib) and ribbons drawn in a botanical atlas (veins, two-tone blades).
//  * Rows. Plants follow each field's rows (spacing, axis, tramlines) with a
//    deterministic jitter along and across the row, per-plant yaw, height,
//    width and tone; growth stage scales them. Every plant stands on the
//    terrain height (relief fields included).
//  * Rendering. One instanced draw per crop (position + yaw, scale + tone in
//    two vec4 attributes; no per-plant objects). Plants are generated per
//    4 m cell, cached, and the instance buffers refilled only after the
//    camera has moved a little. Density thins with distance (every other
//    plant shrinks out in the outer ring) and all plants shrink into the
//    ground toward the radius while the canopy fades in — no ring, no pop.
//    Wind bends the plants and flutters the leaves in the vertex shader from
//    the shared wind state; harvested lanes (cutState) have no plants.
import * as THREE from 'three';
import { FIELDS, CROPS, cropHeight } from './layout.js';
import { ATMO_U } from './atmosphere.js';
import { CUT_U, CUT_GLSL, CROP_U } from './cutState.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { rng } from '../core/math.js';

const KINDS = ['soy', 'corn', 'cotton'];
// Model height (m) at full growth; along-row spacing of the plant clumps.
const MODEL = { soy: { H: 0.85, ds: 0.36 }, corn: { H: 2.45, ds: 0.3 }, cotton: { H: 1.2, ds: 0.34 } };
const CELL = 4;
const CAP = 52000;

// ---------------------------------------------------------------- atlas
// 4 x 2 tiles of 512 px: 0/1 soy trifoliate, 2/3 corn blade, 4/5 cotton
// leaf, 6 corn tassel (left) + cotton flower / bolls (right), 7 stems.
const T = 512, NX = 4, NY = 2;
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
function rect(t, u0 = 0, u1 = 1, v0 = 0, v1 = 1) {
  const i = t % NX, j = Math.floor(t / NX), e = 2 / (T * NX);
  const U0 = i / NX + e, U1 = (i + 1) / NX - e, V0 = 1 - (j + 1) / NY + e, V1 = 1 - j / NY - e;
  return [U0 + (U1 - U0) * u0, V0 + (V1 - V0) * v0, U0 + (U1 - U0) * u1, V0 + (V1 - V0) * v1];
}

function noiseSpeckle(g, x, y, w, h, r, n, dark = 0.1, light = 0.07) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(0,25,0,${dark})` : `rgba(220,240,190,${light})`;
    g.fillRect(x + r() * w, y + r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

// Ovate leaflet with midrib and lateral veins; ang = axis direction.
function leaflet(g, x, y, len, wid, ang, hue, sat, lit, r) {
  g.save();
  g.translate(x, y); g.rotate(ang);
  const path = () => {
    g.beginPath(); g.moveTo(0, 0);
    g.bezierCurveTo(len * 0.12, -wid * 0.64, len * 0.66, -wid * 0.6, len, 0);
    g.bezierCurveTo(len * 0.66, wid * 0.6, len * 0.12, wid * 0.64, 0, 0);
  };
  const grd = g.createLinearGradient(0, 0, len, 0);
  grd.addColorStop(0, hsl(hue + 4, sat, lit - 6));
  grd.addColorStop(0.45, hsl(hue, sat, lit + 4));
  grd.addColorStop(1, hsl(hue - 2, sat - 4, lit - 2));
  g.fillStyle = grd; path(); g.fill();
  g.save(); path(); g.clip();
  // One half a little darker: the leaflet is gently folded along the midrib.
  g.fillStyle = 'rgba(0,18,0,0.16)'; g.fillRect(0, 0, len, wid);
  g.strokeStyle = hsl(hue - 6, sat - 12, lit + 20, 0.5); g.lineWidth = Math.max(1.2, wid * 0.05);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.95, 0); g.stroke();
  g.lineWidth = Math.max(0.7, wid * 0.022);
  for (let i = 1; i <= 6; i++) {
    const t = i / 7.5;
    for (const sd of [-1, 1]) {
      g.beginPath(); g.moveTo(len * t, 0);
      g.quadraticCurveTo(len * (t + 0.08), sd * wid * 0.25, len * (t + 0.16), sd * wid * 0.42 * Math.sin(Math.PI * Math.min(1, t + 0.1)));
      g.stroke();
    }
  }
  noiseSpeckle(g, 0, -wid * 0.6, len, wid * 1.2, r, Math.round(len * wid * 0.02));
  g.restore();
  g.strokeStyle = 'rgba(15,35,8,0.45)'; g.lineWidth = 1.5; path(); g.stroke();
  g.restore();
}

function drawSoy(g, ox, oy, r, older) {
  const hue = older ? 78 : 92, sat = older ? 36 : 44, lit = older ? 27 : 31;
  const jx = ox + T / 2, jy = oy + T * 0.56;
  g.strokeStyle = hsl(80, 30, 30); g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.moveTo(ox + T / 2, oy + T - 4); g.lineTo(jx, jy); g.stroke();
  const L = T * 0.47;
  for (const [a, k] of [[-Math.PI / 2, 1], [-Math.PI / 2 - 1.15 - r() * 0.15, 0.8], [-Math.PI / 2 + 1.15 + r() * 0.15, 0.8]]) {
    leaflet(g, jx, jy, L * k, L * k * 0.62, a, hue + (r() - 0.5) * 8, sat, lit + (r() - 0.5) * 5, r);
  }
  // Fine hairs on the petiole junction.
  g.fillStyle = hsl(70, 25, 45, 0.6);
  g.beginPath(); g.arc(jx, jy, 6, 0, Math.PI * 2); g.fill();
}

function drawCornBlade(g, ox, oy, r, dryTip) {
  const cx = ox + T / 2, W = T * 0.23; // half-width at the widest
  const pts = 60;
  const half = (t) => W * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, 0.2 + t * 1.1))) * (1 - Math.pow(Math.max(0, t - 0.55) / 0.45, 1.6));
  const yAt = (t) => oy + T - 2 - t * (T - 6);
  g.beginPath();
  for (let i = 0; i <= pts; i++) { const t = i / pts; g.lineTo(cx - half(t) * (1 + 0.04 * Math.sin(t * 70)), yAt(t)); }
  for (let i = pts; i >= 0; i--) { const t = i / pts; g.lineTo(cx + half(t) * (1 + 0.04 * Math.cos(t * 64)), yAt(t)); }
  g.closePath();
  g.save(); g.clip();
  const grd = g.createLinearGradient(cx - W, 0, cx + W, 0);
  grd.addColorStop(0, hsl(88, 38, 24)); grd.addColorStop(0.42, hsl(84, 44, 34)); grd.addColorStop(0.5, hsl(80, 30, 48));
  grd.addColorStop(0.58, hsl(84, 44, 32)); grd.addColorStop(1, hsl(90, 38, 22));
  g.fillStyle = grd; g.fillRect(ox, oy, T, T);
  // Parallel veins.
  for (let i = 0; i < 34; i++) {
    const f = (i / 33 - 0.5) * 2;
    g.strokeStyle = i % 2 ? 'rgba(10,30,5,0.13)' : 'rgba(210,235,170,0.08)'; g.lineWidth = 1.2;
    g.beginPath();
    for (let k = 0; k <= 20; k++) { const t = k / 20; g.lineTo(cx + f * half(t) * 0.95, yAt(t)); }
    g.stroke();
  }
  // Pale midrib.
  g.strokeStyle = hsl(70, 25, 62, 0.75); g.lineWidth = 6;
  g.beginPath(); g.moveTo(cx, yAt(0)); g.lineTo(cx, yAt(0.9)); g.stroke();
  if (dryTip) {
    const gd = g.createLinearGradient(0, yAt(0.62), 0, yAt(1));
    gd.addColorStop(0, 'rgba(160,130,60,0)'); gd.addColorStop(0.4, 'rgba(168,140,70,0.8)'); gd.addColorStop(1, 'rgba(150,120,62,1)');
    g.fillStyle = gd; g.fillRect(ox, yAt(1), T, yAt(0.62) - yAt(1));
  }
  noiseSpeckle(g, cx - W, oy, W * 2, T, r, 1400, 0.08, 0.05);
  g.restore();
}

// Palmate cotton leaf: three main lobes and two small basal ones.
function drawCotton(g, ox, oy, r, young) {
  const cx = ox + T / 2, cy = oy + T * 0.5, R = T * 0.44;
  const lobes = [[0, 1], [-0.95, 0.86], [0.95, 0.86], [-1.85, 0.55], [1.85, 0.55]];
  const rad = (a) => {
    let v = 0.32;
    for (const [la, k] of lobes) { const d = Math.atan2(Math.sin(a - la), Math.cos(a - la)); v = Math.max(v, k * Math.exp(-(d * d) / 0.11)); }
    return R * v;
  };
  g.strokeStyle = hsl(15, 35, 30); g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx, oy + T - 4); g.lineTo(cx, cy + R * 0.12); g.stroke();
  const path = () => {
    g.beginPath();
    for (let i = 0; i <= 120; i++) {
      const a = -Math.PI + (i / 120) * Math.PI * 2; // 0 = up
      const rr = rad(a) * (1 + 0.025 * Math.sin(i * 1.7));
      g.lineTo(cx + Math.sin(a) * rr, cy + R * 0.12 - Math.cos(a) * rr);
    }
    g.closePath();
  };
  const hue = young ? 92 : 104, lit = young ? 36 : 30;
  const grd = g.createRadialGradient(cx, cy + R * 0.1, R * 0.05, cx, cy, R);
  grd.addColorStop(0, hsl(hue - 6, 34, lit + 6)); grd.addColorStop(1, hsl(hue, 36, lit - 4));
  g.fillStyle = grd; path(); g.fill();
  g.save(); path(); g.clip();
  g.strokeStyle = hsl(hue - 10, 22, lit + 22, 0.55);
  for (const [la, k] of lobes) {
    g.lineWidth = 4 * k;
    g.beginPath(); g.moveTo(cx, cy + R * 0.12);
    g.lineTo(cx + Math.sin(la) * R * k * 0.95, cy + R * 0.12 - Math.cos(la) * R * k * 0.95); g.stroke();
    g.lineWidth = 1.4;
    for (let i = 1; i < 5; i++) {
      const t = i / 5, bx = cx + Math.sin(la) * R * k * t, by = cy + R * 0.12 - Math.cos(la) * R * k * t;
      for (const sd of [-1, 1]) {
        g.beginPath(); g.moveTo(bx, by);
        g.lineTo(bx + Math.sin(la + sd * 0.9) * R * 0.14, by - Math.cos(la + sd * 0.9) * R * 0.14); g.stroke();
      }
    }
  }
  noiseSpeckle(g, cx - R, cy - R, R * 2, R * 2, r, 2600);
  g.restore();
  g.strokeStyle = 'rgba(15,35,10,0.5)'; g.lineWidth = 2; path(); g.stroke();
}

function drawExtras(g, ox, oy, r) {
  // Corn tassel (left half): a central spike and branches of spikelets.
  const cx = ox + T * 0.25;
  g.lineCap = 'round';
  g.strokeStyle = hsl(45, 35, 52); g.lineWidth = 4;
  g.beginPath(); g.moveTo(cx, oy + T - 4); g.lineTo(cx, oy + 14); g.stroke();
  for (let i = 0; i < 11; i++) {
    const y0 = oy + T * (0.62 - i * 0.03), a = (i % 2 ? 1 : -1) * (0.35 + r() * 0.5);
    const len = T * (0.22 + r() * 0.15);
    const ex = cx + Math.sin(a) * len, ey = y0 - Math.cos(a) * len * 0.8 + len * 0.25;
    g.strokeStyle = hsl(42 + r() * 10, 35, 50 + r() * 10); g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(cx, y0); g.quadraticCurveTo((cx + ex) / 2, y0 - len * 0.5, ex, ey); g.stroke();
    for (let k = 0; k < 18; k++) {
      const t = k / 18;
      const px = cx + (ex - cx) * t, py = y0 + (ey - y0) * t - Math.sin(Math.PI * t) * len * 0.25;
      g.fillStyle = r() < 0.25 ? hsl(320, 25, 45) : hsl(44 + r() * 10, 45, 56 + r() * 14);
      g.beginPath(); g.ellipse(px + (r() - 0.5) * 4, py, 2.2, 4, a, 0, Math.PI * 2); g.fill();
    }
  }
  // Cotton flower (upper right) and bolls (lower right).
  const fx = ox + T * 0.75, fy = oy + T * 0.25;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.fillStyle = hsl(52, 60, 86 - r() * 6);
    g.beginPath(); g.ellipse(fx + Math.cos(a) * 26, fy + Math.sin(a) * 26, 30, 18, a, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = hsl(330, 40, 55); g.beginPath(); g.arc(fx, fy, 10, 0, Math.PI * 2); g.fill();
  const bx = ox + T * 0.68, by = oy + T * 0.72;
  g.fillStyle = hsl(95, 35, 30); g.beginPath(); g.ellipse(bx, by, 26, 34, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = hsl(90, 30, 42, 0.6); g.beginPath(); g.ellipse(bx - 7, by - 9, 9, 14, 0, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 3; i++) {
    g.fillStyle = hsl(100, 30, 24); g.beginPath();
    g.moveTo(bx, by + 30); g.lineTo(bx + (i - 1) * 34, by + 6); g.lineTo(bx + (i - 1) * 14, by + 40); g.fill();
  }
  // An open boll (white lint) beside it.
  const wx = ox + T * 0.86, wy = oy + T * 0.68;
  for (let i = 0; i < 4; i++) { g.fillStyle = hsl(40, 15, 92 - r() * 6); g.beginPath(); g.arc(wx + Math.cos(i * 1.57) * 12, wy + Math.sin(i * 1.57) * 12, 17, 0, Math.PI * 2); g.fill(); }
}

function drawStems(g, ox, oy, r) {
  const grd = g.createLinearGradient(0, oy, 0, oy + T);
  grd.addColorStop(0, hsl(86, 40, 38)); grd.addColorStop(0.6, hsl(78, 36, 32)); grd.addColorStop(1, hsl(48, 30, 30));
  g.fillStyle = grd; g.fillRect(ox, oy, T, T);
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = r() < 0.5 ? 'rgba(0,30,0,0.14)' : 'rgba(230,240,190,0.1)'; g.lineWidth = 1 + r() * 2;
    const x = ox + r() * T;
    g.beginPath(); g.moveTo(x, oy); g.lineTo(x + (r() - 0.5) * 3, oy + T); g.stroke();
  }
  // Nodes.
  for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(40,50,15,0.35)'; g.fillRect(ox, oy + (i + 0.5) * T / 6, T, 5); }
}

function makeCropAtlas() {
  const c = canvas(T * NX, T * NY);
  const g = c.getContext('2d');
  const r = rng(808);
  const tile = (t, fn) => {
    const ox = (t % NX) * T, oy = Math.floor(t / NX) * T;
    g.save(); g.beginPath(); g.rect(ox + 2, oy + 2, T - 4, T - 4); g.clip();
    fn(ox, oy); g.restore();
  };
  tile(0, (x, y) => drawSoy(g, x, y, r, false));
  tile(1, (x, y) => drawSoy(g, x, y, r, true));
  tile(2, (x, y) => drawCornBlade(g, x, y, r, false));
  tile(3, (x, y) => drawCornBlade(g, x, y, r, true));
  tile(4, (x, y) => drawCotton(g, x, y, r, false));
  tile(5, (x, y) => drawCotton(g, x, y, r, true));
  tile(6, (x, y) => drawExtras(g, x, y, r));
  tile(7, (x, y) => drawStems(g, x, y, r));
  const t = canvasTexture(c, { aniso: 8 });
  return t;
}

// ---------------------------------------------------------------- geometry
class CropBuilder {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
  vert(p, n, u, v, c) { this.pos.push(p.x, p.y, p.z); this.nrm.push(n.x, n.y, n.z); this.uv.push(u, v); this.col.push(c, c, c); }
  // Leaf card from its attachment P along D (blade axis), folded along the
  // midrib; the tip drops by droop.
  leaf(P, D, len, wid, fold, droop, rc, ao) {
    const up = new THREE.Vector3(0, 1, 0);
    let S = new THREE.Vector3().crossVectors(D, up);
    if (S.lengthSq() < 1e-6) S.set(1, 0, 0);
    S.normalize();
    const N = new THREE.Vector3().crossVectors(S, D).normalize();
    if (N.y < 0) N.negate();
    const tip = P.clone().addScaledVector(D, len).add(new THREE.Vector3(0, -droop, 0));
    const lift = Math.sin(fold) * wid * 0.5, pull = (1 - Math.cos(fold)) * wid * 0.5;
    const [u0, v0, u1, v1] = rc;
    const b = this.count;
    const nC = N.clone().multiplyScalar(0.7).add(new THREE.Vector3(0, 0.5, 0)).normalize();
    for (const [Q, v, k] of [[P, v0, ao * 0.85], [tip, v1, ao]]) {
      for (const [s, u] of [[-1, u0], [0, (u0 + u1) / 2], [1, u1]]) {
        const p = Q.clone().addScaledVector(S, s * (wid * 0.5 - pull));
        if (s) p.addScaledVector(N, lift);
        const n = s ? nC.clone().addScaledVector(S, s * 0.35).normalize() : nC;
        this.vert(p, n, u, v, k);
      }
    }
    this.idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5);
  }
  // Ribbon through points, constant width, side vectors given (corn blades).
  ribbon(pts, sides, wid, rc, aoA, aoB) {
    const [u0, v0, u1, v1] = rc;
    const b = this.count;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const along = (i < n - 1 ? pts[i + 1].clone().sub(pts[i]) : pts[i].clone().sub(pts[i - 1])).normalize();
      let N = new THREE.Vector3().crossVectors(sides[i], along).normalize();
      if (N.y < 0) N.negate();
      N = N.multiplyScalar(0.75).add(new THREE.Vector3(0, 0.45, 0)).normalize();
      const k = aoA + (aoB - aoA) * t;
      for (const [s, u] of [[-1, u0], [1, u1]]) this.vert(pts[i].clone().addScaledVector(sides[i], s * wid * 0.5), N, u, v0 + (v1 - v0) * t, k);
    }
    for (let i = 0; i < n - 1; i++) { const a = b + i * 2; this.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  // Tapered prism (stem / stalk).
  prism(A, B, r0, r1, sides, rc, tint) {
    const [u0, v0, u1, v1] = rc;
    const b = this.count;
    for (let k = 0; k <= 1; k++) {
      const P = k ? B : A, rr = k ? r1 : r0;
      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        this.vert(P.clone().addScaledVector(d, rr), d, u0 + (u1 - u0) * (i / sides), k ? v1 : v0, k ? tint : tint * 0.75);
      }
    }
    for (let i = 0; i < sides; i++) this.idx.push(b + i, b + sides + 1 + i, b + i + 1, b + i + 1, b + sides + 1 + i, b + sides + 2 + i);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const GOLD = 2.39996;

function soyPlant(seed, lod = 0) {
  const B = new CropBuilder(), r = rng(seed), H = MODEL.soy.H;
  // Two plants in the clump: stems, then the trifoliates in layers.
  for (const ox of lod ? [0] : [-0.05, 0.06]) B.prism(V(ox, 0, 0), V(ox * 0.6, H * 0.5, 0.01), 0.005, 0.0025, 3, rect(7, 0.2, 0.4), 0.45);
  const n = lod ? 6 : 11, big = lod ? 1.35 : 1.06;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = i * GOLD + r() * 0.5;
    // Leaves from low on the stem (a closed soy row is leafy to the ground).
    const y = H * (0.1 + 0.88 * Math.pow(t, 0.7)) + (r() - 0.5) * 0.04;
    const ro = 0.04 + 0.15 * (1 - t) + r() * 0.05;
    const out = V(Math.cos(a), 0, Math.sin(a));
    // Leaflets turn to the sun (many stand steep); the old lower ones droop.
    const tilt = t < 0.3 ? -0.15 + r() * 0.45 : 0.15 + r() * 0.8;
    const D = out.clone().multiplyScalar(Math.cos(tilt)).add(V(0, Math.sin(tilt), 0)).normalize();
    const len = (0.28 + 0.08 * (1 - t) + r() * 0.06) * big;
    B.leaf(out.clone().multiplyScalar(ro).add(V(0, y, 0)), D, len, len * 0.98, 0.32, 0.03 + r() * 0.04, rect(t < 0.35 ? 1 : 0), 0.5 + 0.5 * t);
  }
  return B.geometry();
}

function cornPlant(seed, lod = 0) {
  const B = new CropBuilder(), r = rng(seed), H = MODEL.corn.H;
  B.prism(V(0, 0, 0), V(0.01, H * 0.9, 0), 0.022, 0.011, lod ? 3 : 4, rect(7, 0.4, 0.6), 1.0);
  const a0 = r() * Math.PI * 2, n = lod ? 6 : 10;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const y = H * (0.14 + 0.64 * t);
    const az = a0 + (i % 2 ? Math.PI : 0) + (r() - 0.5) * 0.5;
    const out = V(Math.cos(az), 0, Math.sin(az)), side = V(-Math.sin(az), 0, Math.cos(az));
    const L = (0.62 + 0.42 * Math.sin(Math.PI * (0.25 + 0.75 * t))) * (t > 0.85 ? 0.7 : 1) * (0.9 + r() * 0.2);
    const e0 = 0.75 + 0.6 * t + (r() - 0.5) * 0.15; // upper blades stand steeper
    const pts = [], sides = [];
    let p = V(0, y, 0), ang = e0;
    const seg = lod ? 2 : 3, twist = (r() - 0.5) * 0.6;
    for (let k = 0; k <= seg; k++) {
      pts.push(p.clone());
      const s = side.clone().applyAxisAngle(out, twist * (k / seg));
      sides.push(s);
      const step = L / seg;
      p = p.clone().addScaledVector(out, Math.cos(ang) * step).add(V(0, Math.sin(ang) * step, 0));
      ang -= (e0 + 0.5) * (1.2 / seg) * (0.6 + 0.6 * (k / seg));
    }
    B.ribbon(pts, sides, lod ? 0.11 : 0.095, rect(t < 0.25 && r() < 0.6 ? 3 : 2, 0.25, 0.75), 0.6 + 0.3 * t, 0.85 + 0.15 * t);
  }
  // Tassel: two crossed cards on the top.
  for (const a of [0.3, 0.3 + Math.PI / 2]) {
    const s = V(Math.cos(a), 0, Math.sin(a));
    B.ribbon([V(0, H * 0.9, 0), V(0, H * 1.03, 0)], [s, s], 0.24, rect(6, 0, 0.5), 0.6, 0.72);
  }
  return B.geometry();
}

function cottonPlant(seed, lod = 0) {
  const B = new CropBuilder(), r = rng(seed), H = MODEL.cotton.H;
  B.prism(V(0, 0, 0), V(0.02, H * 0.85, 0.01), 0.01, 0.004, 3, rect(7, 0.0, 0.2), 0.6);
  const n = lod ? 8 : 14, big = lod ? 1.3 : 1.05;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = i * GOLD + r() * 0.4;
    const y = H * (0.18 + 0.8 * Math.pow(t, 0.8)) + (r() - 0.5) * 0.04;
    const ro = 0.05 + 0.18 * (1 - t) + r() * 0.05;
    const out = V(Math.cos(a), 0, Math.sin(a));
    // Cotton leaves hang at all angles on their long petioles.
    const tilt = -0.25 + r() * 1.1;
    const D = out.clone().multiplyScalar(Math.cos(tilt)).add(V(0, Math.sin(tilt), 0)).normalize();
    const len = (0.26 + 0.1 * (1 - t) + r() * 0.05) * big;
    B.leaf(out.clone().multiplyScalar(ro).add(V(0, y, 0)), D, len, len, 0.35, 0.05 + r() * 0.06, rect(t > 0.8 ? 5 : 4), 0.55 + 0.45 * t);
  }
  // A flower and two bolls on the upper branches.
  for (let i = 0; i < (lod ? 0 : 3); i++) {
    const a = r() * Math.PI * 2, y = H * (0.55 + r() * 0.35);
    const P = V(Math.cos(a) * 0.12, y, Math.sin(a) * 0.12), s = V(-Math.sin(a), 0, Math.cos(a));
    const rc = i === 0 ? rect(6, 0.55, 0.95, 0.55, 0.95) : rect(6, 0.5, 0.95, 0.12, 0.45);
    B.ribbon([P, P.clone().add(V(0, 0.07, 0))], [s, s], 0.07, rc, 0.9, 1.0);
  }
  return B.geometry();
}

// ---------------------------------------------------------------- material
const VERT_PARS = /* glsl */ `
attribute vec4 aInst;  // x, y, z, yaw
attribute vec4 aInst2; // height scale, width scale, LOD flag, tone
varying float vDither;
uniform float uR0;
uniform vec3 uCam; // the player's camera (also in the shadow pass)
uniform float uTime;
uniform vec4 uWind;
${CUT_GLSL}
`;
const VERT_BODY = /* glsl */ `
  float cY = cos(aInst.w), sY = sin(aInst.w);
  float dC = distance(aInst.xyz, uCam);
  // Outer radius: plants shrink into the ground. LOD hand-over (dissolve):
  // flag 0 full plant (even), 1 full plant (odd, thinned out first), 2 the
  // simplified plant of the outer ring (half density).
  vDither = aInst2.z < 0.5 ? 1.0 - smoothstep(uR0 * 0.46, uR0 * 0.6, dC)
    : aInst2.z < 1.5 ? 1.0 - smoothstep(uR0 * 0.4, uR0 * 0.54, dC)
    : smoothstep(uR0 * 0.46, uR0 * 0.6, dC);
  // A plant fully dissolved by the hand-over collapses to a point (no
  // fragments for the discard to throw away).
  float fade = (1.0 - smoothstep(uR0 * 0.8, uR0, dC)) * (1.0 - harvestedAt(aInst.xz)) * step(0.002, vDither);
  vec3 pl = position * vec3(aInst2.y, aInst2.x, aInst2.y) * fade;
  vec3 pw = vec3(cY * pl.x + sY * pl.z, pl.y, -sY * pl.x + cY * pl.z);
  // Wind: the plant bends downwind with gusts rolling across the field,
  // leaves flutter on their own phase.
  float phW = dot(aInst.xz, uWind.xy) * 0.09 - uTime * (1.4 + uWind.z * 0.2);
  float gW = 0.55 + 0.45 * sin(phW) * (0.6 + 0.4 * sin(phW * 0.41 + 2.0));
  float hW = pl.y / max(0.3, aInst2.x);
  pw.xz += uWind.xy * (0.035 + 0.014 * uWind.z) * (0.4 + 0.8 * uWind.w) * gW * hW * hW * aInst2.x;
  pw += vec3(1.0, 0.5, 1.0) * 0.006 * (0.4 + 0.15 * uWind.z) * step(0.08, pl.y)
    * sin(uTime * 6.3 + dot(position, vec3(19.1, 7.3, 15.7)) + aInst.x * 1.7 + aInst.z);
  vec3 transformed = pw + aInst.xyz;
`;

function patchVertex(s) {
  s.uniforms.uR0 = CROP_U.r0;
  s.uniforms.uCam = CROP_U.cam;
  s.uniforms.uTime = ATMO_U.time;
  s.uniforms.uWind = ATMO_U.wind;
  s.uniforms.uCut = CUT_U.rects;
  s.uniforms.uCutKind = CUT_U.kinds;
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_PARS)
    .replace('#include <begin_vertex>', VERT_BODY);
  if (s.vertexShader.includes('#include <beginnormal_vertex>')) {
    s.vertexShader = s.vertexShader.replace('#include <beginnormal_vertex>', `
      float cN = cos(aInst.w), sN = sin(aInst.w);
      vec3 objectNormal = vec3(cN * normal.x + sN * normal.z, normal.y, -sN * normal.x + cN * normal.z);`);
  }
}

function cropMaterial(atlas) {
  const m = new THREE.MeshStandardMaterial({
    map: atlas, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true,
    roughness: 0.86, metalness: 0, bumpMap: atlas, bumpScale: 0.6, envMapIntensity: 0.55,
  });
  m.onBeforeCompile = (s) => {
    patchVertex(s);
    s.uniforms.uSunDir = ATMO_U.sunDir;
    s.uniforms.uSunCol = ATMO_U.sunCol;
    s.vertexShader = s.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
      vColor.rgb *= mix(vec3(0.86, 0.9, 0.84), vec3(1.08, 1.06, 0.95), aInst2.w);`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunDir;\nuniform vec3 uSunCol;')
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
      .replace('#include <common>', '#include <common>\nvarying float vDither;')
      .replace('#include <alphatest_fragment>', `
        if (vDither < fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;
        vec2 mdx = dFdx(vMapUv * 2048.0), mdy = dFdy(vMapUv * 2048.0);
        float mlod = 0.5 * log2(min(dot(mdx, mdx), dot(mdy, mdy)));
        diffuseColor.a *= 1.0 + clamp(mlod, 0.0, 6.0) * 0.3;
        #include <alphatest_fragment>`)
      .replace('#include <opaque_fragment>', `{
          vec3 Lv = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
          vec3 Vv = normalize(vViewPosition);
          float back = pow(max(dot(-Vv, Lv), 0.0), 3.0);
          outgoingLight += diffuseColor.rgb * vec3(1.0, 1.1, 0.6) * min(uSunCol, vec3(2.5)) * back * 0.06;
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'cropPlant-v2';
  return m;
}

function cropDepthMaterial(atlas) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas, alphaTest: 0.5, side: THREE.DoubleSide });
  m.onBeforeCompile = (s) => {
    patchVertex(s);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vDither;')
      .replace('#include <alphatest_fragment>', `if (vDither < fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;
        #include <alphatest_fragment>`);
  };
  m.customProgramCacheKey = () => 'cropPlantDepth-v2';
  return m;
}

// ---------------------------------------------------------------- streaming
function hash3(a, b, c) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createCropPlants(scene, terrain, quality) {
  const atlas = makeCropAtlas();
  const mat = cropMaterial(atlas), depth = cropDepthMaterial(atlas);
  // Variants 0, 1: full plants; 2: the outer ring's simplified plant.
  const geoms = { soy: [soyPlant(11), soyPlant(12), soyPlant(13, 1)], corn: [cornPlant(21), cornPlant(22), cornPlant(23, 1)], cotton: [cottonPlant(31), cottonPlant(32), cottonPlant(33, 1)] };
  const group = new THREE.Group();
  group.name = 'cropPlants';
  // One instanced draw per crop variant.
  const slots = [];
  for (const k of KINDS) {
    geoms[k].forEach((base, vi) => {
      const g = new THREE.InstancedBufferGeometry().copy(base);
      const a1 = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4).setUsage(THREE.DynamicDrawUsage);
      const a2 = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aInst', a1); g.setAttribute('aInst2', a2);
      g.instanceCount = 0;
      const m = new THREE.Mesh(g, mat);
      m.customDepthMaterial = depth;
      m.frustumCulled = false;
      m.receiveShadow = true;
      group.add(m);
      slots.push({ kind: k, vi, mesh: m, a1, a2, n: 0 });
    });
  }
  scene.add(group);
  const slotOf = (k, vi) => slots.find((s) => s.kind === k && s.vi === vi);
  const fields = FIELDS.filter((f) => KINDS.includes(f.crop));

  // Plants of one 4 m cell: per slot, packed [x, y, z, yaw] and [sh, sw, odd, tone].
  function buildCell(ci, cj) {
    const out = new Map();
    const x0 = ci * CELL, z0 = cj * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
    for (const f of fields) {
      const ix0 = Math.max(x0, f.x0 + 0.15), ix1 = Math.min(x1, f.x1 - 0.15);
      const iz0 = Math.max(z0, f.z0 + 0.15), iz1 = Math.min(z1, f.z1 - 0.15);
      if (ix0 >= ix1 || iz0 >= iz1) continue;
      const k = f.crop, M = MODEL[k], sp = CROPS[k].rowSpacing;
      const h = cropHeight(f), sh0 = h / M.H, sw0 = 0.55 + 0.45 * f.growth;
      const alongX = f.rowAxis === 'x';
      const a0 = alongX ? iz0 : ix0, a1 = alongX ? iz1 : ix1, l0 = alongX ? ix0 : iz0, l1 = alongX ? ix1 : iz1;
      const tramPhase = (f.id * 7.3) % 27;
      const r0 = Math.ceil(a0 / sp - 0.5), r1 = Math.floor(a1 / sp - 0.5);
      for (let row = r0; row <= r1; row++) {
        const c = (row + 0.5) * sp;
        const tp = (((c - tramPhase) % 27) + 27) % 27 - 13.5;
        if (Math.abs(Math.abs(tp) - 0.9) < 0.3 && k !== 'corn') continue;
        const j0 = Math.ceil(l0 / M.ds - 0.5), j1 = Math.floor(l1 / M.ds - 0.5);
        for (let j = j0; j <= j1; j++) {
          const hA = hash3(f.id, row, j), hB = hash3(row, j, f.id + 7), hC = hash3(j, f.id + 3, row);
          // A few gaps in the stand (failed emergence), more in young crops.
          if (hC < 0.04 + (1 - f.growth) * 0.08) continue;
          const l = (j + 0.5 + (hA - 0.5) * 0.45) * M.ds;
          const cc = c + (hB - 0.5) * sp * 0.12;
          const x = alongX ? l : cc, z = alongX ? cc : l;
          const vi = hB < 0.5 ? 0 : 1; // the full plant's variant
          let rec = out.get(k + vi);
          if (!rec) { rec = { slot: slotOf(k, vi), a: [], b: [] }; out.set(k + vi, rec); }
          const y = terrain.heightAt(x, z) - 0.02;
          rec.a.push(x, y, z, hC * Math.PI * 2);
          const odd = (row + j) & 1;
          rec.b.push(sh0 * (0.86 + 0.28 * hA), sw0 * (0.88 + 0.24 * hB), odd, hash3(row * 3, j * 5, f.id));
          // The outer ring's simplified plant (every other position).
          if (!odd) {
            let lr = out.get(k + 'L');
            if (!lr) { lr = { slot: slotOf(k, 2), a: [], b: [] }; out.set(k + 'L', lr); }
            lr.a.push(x, y, z, hC * Math.PI * 2);
            lr.b.push(sh0 * (0.86 + 0.28 * hA), sw0 * (0.88 + 0.24 * hB), 2, hash3(row * 3, j * 5, f.id));
          }
        }
      }
    }
    return [...out.values()].map((r) => ({ slot: r.slot, lod: r.slot.vi === 2, a: new Float32Array(r.a), b: new Float32Array(r.b) }));
  }

  const cache = new Map();
  let radius = quality.cropPlantRadius ?? 28;
  let lastX = 1e9, lastZ = 1e9, lastAlt = 1e9;
  // Refills every few metres of travel (not every frame on a low pass): the
  // loaded rings reach that far beyond the visible ones.
  const moveStep = (R0) => Math.max(3, R0 * 0.14);
  function refill(cam, R0, alt) {
    for (const s of slots) s.n = 0;
    const half = CELL * 0.71;
    const mv = moveStep(R0); // the camera may move this far before the next refill
    const R = R0 + mv + half, Rfull = R0 * 0.6 + mv + half, Rlod = R0 * 0.46 - mv - half;
    const ci0 = Math.floor((cam.x - R) / CELL), ci1 = Math.floor((cam.x + R) / CELL);
    const cj0 = Math.floor((cam.z - R) / CELL), cj1 = Math.floor((cam.z + R) / CELL);
    for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
      const d = Math.hypot((ci + 0.5) * CELL - cam.x, (cj + 0.5) * CELL - cam.z, alt);
      if (d > R) continue;
      const key = ci + ',' + cj;
      let cell = cache.get(key);
      if (!cell) { cell = buildCell(ci, cj); cache.set(key, cell); }
      for (const rec of cell) {
        if (rec.lod ? d < Rlod : d > Rfull) continue;
        const s = rec.slot, n = rec.a.length / 4;
        if (s.n + n > CAP) continue;
        s.a1.array.set(rec.a, s.n * 4); s.a2.array.set(rec.b, s.n * 4);
        s.n += n;
      }
    }
    for (const s of slots) {
      s.mesh.geometry.instanceCount = s.n;
      for (const at of [s.a1, s.a2]) { at.clearUpdateRanges(); at.addUpdateRange(0, s.n * 4); at.needsUpdate = true; }
    }
    if (cache.size > 9000) {
      let drop = cache.size - 6000;
      for (const key of cache.keys()) { if (drop-- <= 0) break; cache.delete(key); }
    }
  }

  const api = {
    group,
    setQuality(q) {
      radius = q.cropPlantRadius ?? 28; lastX = 1e9;
      for (const s of slots) s.mesh.castShadow = !!q.cropShadows;
    },
    update(cam, ground) {
      // The plants live within R0 of the camera in 3D: higher up than that
      // none is in reach and the canopy and the row hedges carry the fields
      // (no ring on the ground that grows and shrinks with the camera).
      const alt = Math.max(0, cam.y - ground), R0 = radius;
      CROP_U.r0.value = R0;
      CROP_U.cam.value.copy(cam);
      CROP_U.top.value = Math.min(1, Math.max(0, (alt - 3) / 9));
      group.visible = alt < R0 + 1;
      if (!group.visible) { lastAlt = 1e9; return; }
      const mv = moveStep(R0);
      if (Math.hypot(cam.x - lastX, cam.z - lastZ) < mv && Math.abs(alt - lastAlt) < mv * 0.5) return;
      lastX = cam.x; lastZ = cam.z; lastAlt = alt;
      refill(cam, R0, alt);
    },
    count: () => slots.reduce((a, s) => a + s.n, 0),
    atlas,
  };
  api.setQuality(quality);
  return api;
}
