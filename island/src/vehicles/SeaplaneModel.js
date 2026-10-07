import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../core/MaterialPatch.js';
import { wornPaint } from '../environment/PropMaterials.js';
import { LAYER } from '../core/Shared.js';
import { lerp, smoothstep, clamp } from '../utils/MathUtils.js';

// Procedural single-engine radial floatplane: high braced wing, nine-cylinder
// radial up front, stepped aluminium floats, full cabin interior with a working
// instrument panel. Body axes: +Z forward, +Y up, +X left (port).
//
// Livery: survey-white upper surfaces, ocean-teal belly and cowling, signal-orange
// cheat line, wing tips and rudder bands. Registration PT-ILH.

const C = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const WHITE = C(0xeceae2), TEAL = C(0x1d5c68), ORANGE = C(0xe06a26), DARK = C(0x23282a), ALU = C(0xb6bbbb);

// ------------------------------------------------------------------ fuselage loft
const STATIONS = [
  // z, half width, bottom, top, superellipse exponent
  [3.42, 0.66, -0.54, 0.78, 2.0],
  [2.9, 0.69, -0.57, 0.81, 2.05],
  [2.35, 0.7, -0.58, 0.83, 2.2],
  [2.05, 0.7, -0.57, 0.96, 2.6],
  [1.75, 0.69, -0.55, 1.24, 3.0],
  [0.6, 0.69, -0.55, 1.27, 3.2],
  [-0.9, 0.66, -0.52, 1.25, 3.0],
  [-2.0, 0.52, -0.3, 1.13, 2.6],
  [-3.4, 0.32, 0.06, 0.99, 2.4],
  [-4.6, 0.16, 0.36, 0.87, 2.2],
  [-5.35, 0.05, 0.53, 0.76, 2.0],
];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export function fuselageSection(z) {
  const S = STATIONS;
  let i = 0;
  while (i < S.length - 2 && z < S[i + 1][0]) i++;
  const a = S[Math.max(0, i - 1)], b = S[i], c = S[i + 1], d = S[Math.min(S.length - 1, i + 2)];
  const t = clamp((b[0] - z) / (b[0] - c[0]), 0, 1);
  const f = (k) => catmull(a[k], b[k], c[k], d[k], t);
  return { hw: Math.max(0.02, f(1)), yb: f(2), yt: f(3), n: f(4) };
}

function ringPoint(sec, theta, inset = 0) {
  const s = Math.sin(theta), c = Math.cos(theta);
  const e = 2 / sec.n;
  const hw = sec.hw - inset, hy = (sec.yt - sec.yb) / 2 - inset, yc = (sec.yt + sec.yb) / 2;
  return [Math.sign(s) * hw * Math.abs(s) ** e, yc + Math.sign(c) * hy * Math.abs(c) ** e];
}

function linspace(a, b, n) { const out = []; for (let i = 0; i <= n; i++) out.push(a + (b - a) * (i / n)); return out; }

// window openings, judged on the quad centre (x, y, z)
function windowAt(x, y, z) {
  const ax = Math.abs(x);
  if (z > 1.8 && z < 2.3 && y > 0.86 && ax < 0.6) return 'windshield';
  if (y > 0.42 && y < 1.1 && ax > 0.5) {
    if (z > 0.78 && z < 1.66) return 'door';
    if (z > -0.76 && z < 0.56) return 'rear';
  }
  return null;
}

function buildFuselage() {
  const zs = [...new Set([
    ...linspace(3.42, 2.35, 8), ...linspace(2.35, 1.75, 8), ...linspace(1.75, -0.9, 30), ...linspace(-0.9, -5.35, 22),
  ].map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => b - a);
  const segs = 44;
  const build = (inset, inward, zMin, skipWindows) => {
    const pos = [], col = [], uv = [], idx = [];
    const glass = [];
    const zz = zs.filter((z) => z >= zMin - 1e-6);
    for (let i = 0; i < zz.length; i++) {
      const sec = fuselageSection(zz[i]);
      for (let j = 0; j <= segs; j++) {
        const th = (j / segs) * Math.PI * 2;
        const [x, y] = ringPoint(sec, th, inset);
        pos.push(x, y, zz[i]);
        uv.push(zz[i] / 2, j / segs * 3);
        col.push(...liveryFuselage(x, y, zz[i]));
      }
    }
    const w = segs + 1;
    for (let i = 0; i < zz.length - 1; i++) {
      for (let j = 0; j < segs; j++) {
        const a = i * w + j, b = a + w, c = b + 1, d = a + 1;
        const cx = (pos[a * 3] + pos[c * 3]) / 2, cy = (pos[a * 3 + 1] + pos[c * 3 + 1]) / 2, cz = (zz[i] + zz[i + 1]) / 2;
        const win = skipWindows ? windowAt(cx, cy, cz) : null;
        if (win) { glass.push({ a, b, c, d, win }); continue; }
        // rings run top → port → keel → starboard, stations nose → tail
        if (inward) idx.push(a, b, d, b, c, d);
        else idx.push(a, d, b, d, c, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return { g, glass, pos };
  };
  const outer = build(0, false, -99, true);
  const lining = build(0.03, true, -0.9, true);
  // glass panes from the skipped quads (flat shaded, slightly inset)
  const panes = { windshield: [], side: [] };
  for (const q of outer.glass) {
    const P = (k) => [outer.pos[k * 3], outer.pos[k * 3 + 1], outer.pos[k * 3 + 2]];
    const quad = [P(q.a), P(q.b), P(q.c), P(q.d)];
    (q.win === 'windshield' ? panes.windshield : panes.side).push(quad);
  }
  return { outer: outer.g, lining: lining.g, panes };
}

function liveryFuselage(x, y, z) {
  // cheat line sweeps gently down toward the tail
  const line = 0.2 + (z < 0 ? z * 0.035 : 0) + (z > 2.35 ? -0.02 : 0);
  if (z > 2.35) return y > 0.72 && Math.abs(x) < 0.3 ? TEAL : (z > 3.34 ? ORANGE : TEAL);
  if (y < line - 0.05) return TEAL;
  if (y < line + 0.03) return ORANGE;
  return WHITE;
}

function panesGeometry(quads, inset = 0.004) {
  const pos = [], uv = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const q of quads) for (const p of q) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]); }
  for (const q of quads) {
    for (const k of [0, 1, 3, 1, 2, 3]) {
      const p = q[k];
      const s = 1 - inset;
      pos.push(p[0] * s, p[1], p[2]);
      uv.push((p[0] - minX) / Math.max(1e-3, maxX - minX), (p[1] - minY) / Math.max(1e-3, maxY - minY) * 0.5 + (p[2] - minZ) / Math.max(1e-3, maxZ - minZ) * 0.5);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ lifting surfaces
// cambered airfoil (upper then lower surface), x along the chord 0..1
const AIRFOIL = (() => {
  const pts = [];
  const N = 14;
  for (let i = 0; i <= N; i++) { const x = 1 - (1 - Math.cos((i / N) * Math.PI)) / 2; pts.push([x, upper(x)]); }
  for (let i = 1; i < N; i++) { const x = (1 - Math.cos((i / N) * Math.PI)) / 2; pts.push([x, lower(x)]); }
  return pts;
  function thick(x) { return 0.6 * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4); }
  function camber(x) { return x < 0.4 ? 0.04 / 0.16 * (0.8 * x - x * x) : 0.04 / 0.36 * (0.2 + 0.8 * x - x * x); }
  function upper(x) { return camber(x) + thick(x); }
  function lower(x) { return camber(x) - thick(x) * 0.85; }
})();

/**
 * Loft a wing panel between spanwise stations. c0/c1 = chord fraction range,
 * frame(x) → { le: [y, z] leading edge, chord, thick } for spanwise position x.
 */
function wingPanel(xs, c0, c1, frame, colorAt) {
  const prof = AIRFOIL.filter(([c]) => c >= c0 - 1e-6 && c <= c1 + 1e-6);
  // close the cut faces at the hinge line
  const pos = [], col = [], idx = [];
  const n = prof.length;
  for (const x of xs) {
    const f = frame(x);
    for (const [c, t] of prof) {
      const y = f.le[0] + t * f.chord * f.thickScale - c * f.chord * Math.tan(f.incidence);
      const z = f.le[1] - c * f.chord;
      pos.push(x, y, z);
      col.push(...colorAt(x, c, t));
    }
  }
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      const j1 = (j + 1) % n;
      const a = i * n + j, b = i * n + j1, c = (i + 1) * n + j1, d = (i + 1) * n + j;
      if (xs[i] < xs[i + 1]) idx.push(a, b, d, b, c, d); else idx.push(a, d, b, b, d, c);
    }
  }
  // end caps
  for (const [i, dir] of [[0, 1], [xs.length - 1, -1]]) {
    const center = pos.length / 3;
    let sx = 0, sy = 0, sz = 0;
    for (let j = 0; j < n; j++) { sx += pos[(i * n + j) * 3]; sy += pos[(i * n + j) * 3 + 1]; sz += pos[(i * n + j) * 3 + 2]; }
    pos.push(sx / n, sy / n, sz / n);
    col.push(...colorAt(xs[i], 0.5, 0));
    const other = xs[dir === 1 ? xs.length - 1 : 0];
    const outwardPlusX = xs[i] > other;
    for (let j = 0; j < n; j++) {
      const a = i * n + j, b = i * n + (j + 1) % n;
      if (outwardPlusX) idx.push(center, a, b); else idx.push(center, b, a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const WING = { span: 7.0, root: 1.28, le: 1.95, chord: 1.66, dihedral: Math.tan(1.6 * Math.PI / 180), hinge: 0.72 };
function wingFrame(x) {
  const ax = Math.abs(x);
  // rounded tips: the chord narrows over the last 40 cm
  const tip = smoothstep(6.6, 7.0, ax);
  const chord = WING.chord * (1 - tip * 0.35);
  return { le: [WING.root + ax * WING.dihedral + tip * 0.02, WING.le - tip * 0.1], chord, thickScale: 1 - tip * 0.5, incidence: 0.03 };
}
function wingColor(x, c, t) {
  const ax = Math.abs(x);
  if (ax > 5.95) return ORANGE;
  return t < -0.005 ? C(0xdedbd2) : WHITE;
}

// planform extruded in thickness (tail surfaces)
function extrudeXZ(shapePts, thickness, bevel = 0.02) {
  const s = new THREE.Shape(shapePts.map(([a, b]) => new THREE.Vector2(a, b)));
  const g = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  return g;
}
// shape (x = span, y = chordwise z) → body (X = -x, Y = thickness, Z = y)
function toHorizontal(g, t) {
  g.applyMatrix4(new THREE.Matrix4().set(-1, 0, 0, 0, 0, 0, 1, -t / 2, 0, 1, 0, 0, 0, 0, 0, 1));
  return g;
}
// shape (x = body z, y = body y) → body (X = thickness, Y = y, Z = x)
function toVertical(g, t) {
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, -1, t / 2, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  return g;
}

function colorize(g, rgb) {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
function colorBy(g, fn) {
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i)); c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.count * 2), 2));
  return g;
}

function strut(a, b, w, t, rgb) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(1, 1, len, 10, 1);
  g.scale(w, 1, t);
  const dir = B.clone().sub(A).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  // keep the flat side facing along the flight direction
  g.applyQuaternion(q);
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return colorize(g.toNonIndexed(), rgb);
}

function toNI(g) { return g.index ? g.toNonIndexed() : g; }

// ------------------------------------------------------------------ floats
const FLOAT_ST = [
  // z, half width, keel, chine, deck
  [4.25, 0.04, -1.63, -1.61, -1.6],
  [3.9, 0.2, -1.8, -1.72, -1.57],
  [3.3, 0.34, -1.99, -1.86, -1.55],
  [2.5, 0.39, -2.11, -1.95, -1.55],
  [1.0, 0.39, -2.15, -1.98, -1.55],
  [-0.4, 0.39, -2.15, -1.98, -1.55],
  [-0.46, 0.37, -2.07, -1.96, -1.55],
  [-1.5, 0.34, -2.0, -1.92, -1.55],
  [-2.6, 0.25, -1.86, -1.82, -1.56],
  [-3.55, 0.05, -1.63, -1.62, -1.6],
];
function buildFloat(side) {
  const ring = (st) => {
    const [, hw, keel, chine, deck] = st;
    return [[0, deck], [hw * 0.8, deck], [hw, deck - 0.05], [hw, chine], [0, keel], [-hw, chine], [-hw, deck - 0.05], [-hw * 0.8, deck]];
  };
  const pos = [], col = [], idx = [];
  const n = 8;
  FLOAT_ST.forEach((st, i) => {
    for (const [x, y] of ring(st)) {
      pos.push(side * 1.55 + x, y, st[0]);
      const wl = y < -1.88 ? C(0x2a3133) : (y > -1.6 ? TEAL : ALU);
      col.push(...wl);
    }
  });
  for (let i = 0; i < FLOAT_ST.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      const j1 = (j + 1) % n;
      const a = i * n + j, b = i * n + j1, c = (i + 1) * n + j1, d = (i + 1) * n + j;
      idx.push(a, d, b, d, c, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const ni = g.toNonIndexed();
  ni.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ni.attributes.position.count * 2), 2));
  return ni;
}

// ------------------------------------------------------------------ propeller
function bladeGeometry() {
  const parts = [];
  const N = 8;
  for (let i = 0; i < N; i++) {
    const r0 = 0.16 + (i / N) * 1.14, r1 = 0.16 + ((i + 1) / N) * 1.14;
    const chord = 0.2 * (1 - 0.35 * (i / N)) + 0.03 * Math.sin((i / N) * Math.PI);
    const g = new THREE.BoxGeometry(chord, r1 - r0, 0.035);
    g.translate(0, (r0 + r1) / 2, 0);
    // blade twist: steep at the root, flat at the tip
    g.rotateY(0.9 - (i / N) * 0.6);
    colorize(g, i >= N - 1 ? ORANGE : C(0x1a1b1c));
    parts.push(toNI(g));
  }
  return mergeGeometries(parts);
}

function propDiscTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, S * 0.06, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(20,20,20,0.0)');
  grd.addColorStop(0.2, 'rgba(25,25,25,0.22)');
  grd.addColorStop(0.82, 'rgba(25,25,25,0.12)');
  grd.addColorStop(0.86, 'rgba(225,110,40,0.45)');
  grd.addColorStop(0.97, 'rgba(225,110,40,0.3)');
  grd.addColorStop(1, 'rgba(225,110,40,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  // faint blade ghosts
  g.translate(S / 2, S / 2);
  for (let k = 0; k < 3; k++) {
    g.rotate((Math.PI * 2) / 3);
    const lg = g.createLinearGradient(0, 0, 0, -S / 2);
    lg.addColorStop(0, 'rgba(10,10,10,0.25)');
    lg.addColorStop(1, 'rgba(10,10,10,0.0)');
    g.fillStyle = lg;
    g.beginPath(); g.moveTo(-6, 0); g.lineTo(-14, -S / 2); g.lineTo(14, -S / 2); g.lineTo(6, 0); g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ windshield cracks
function crackTexture(seed = 3) {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const star = (cx, cy, arms, len) => {
    for (let a = 0; a < arms; a++) {
      let x = cx, y = cy, ang = (a / arms) * Math.PI * 2 + r() * 0.5;
      g.beginPath(); g.moveTo(x, y);
      const steps = 6 + Math.floor(r() * 6);
      for (let k = 0; k < steps; k++) {
        ang += (r() - 0.5) * 0.7;
        const l = len * (0.3 + r() * 0.5) / steps * 2;
        x += Math.cos(ang) * l; y += Math.sin(ang) * l;
        g.lineTo(x, y);
        if (r() < 0.2) { g.moveTo(x, y); }
      }
      g.stroke();
    }
    // concentric arcs
    for (let k = 1; k < 4; k++) {
      g.beginPath();
      const rr = k * len * 0.12;
      g.arc(cx, cy, rr, r() * 6, r() * 6 + 1.2 + r() * 2);
      g.stroke();
    }
  };
  g.strokeStyle = 'rgba(235,245,250,0.85)';
  g.lineWidth = 1.4;
  star(S * 0.62, S * 0.42, 9, S * 0.45);
  g.lineWidth = 1.0;
  star(S * 0.3, S * 0.6, 7, S * 0.28);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ registration decal
function registrationTexture(text) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#1b2224';
  g.font = 'bold 92px "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------------ build
export function buildSeaplane(M) {
  const root = new THREE.Group();
  root.name = 'seaplane';
  const paint = wornPaint(0xffffff, { bare: 0x8f9494, wear: 0.22, rust: 0.05, scale: 1.4, bareMetal: 0.8, roughness: 0.42, metalness: 0.05 });
  paint.vertexColors = true;
  const alu = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.75, vertexColors: true });
  patchMaterial(alu, { wet: 0.5, key: 'planeAlu' });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d2022, roughness: 0.6, metalness: 0.2, vertexColors: true });
  patchMaterial(dark, { wet: 0.3, key: 'planeDark' });
  // cabin trim: light enough to read in the shade of the wing, with a touch of light bouncing around inside
  const cabin = new THREE.MeshStandardMaterial({ color: 0x9b968a, roughness: 0.9, metalness: 0, vertexColors: true, side: THREE.DoubleSide, emissive: 0x2a2824, emissiveIntensity: 1 });
  patchMaterial(cabin, { wet: 0, canopy: false, caustics: false, key: 'planeCabin' });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xbfd2d8, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.17, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.3 });
  const parts = {};
  const mk = (geo, mat, { cast = true, receive = true } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast; m.receiveShadow = receive;
    m.layers.set(LAYER.WORLD);
    return m;
  };

  // ---- fuselage group (shell, cowling, engine, tail, interior)
  const fus = new THREE.Group();
  fus.name = 'fuselage';
  const fuse = buildFuselage();
  fus.add(mk(fuse.outer, paint));
  fus.add(mk(fuse.lining, cabin, { cast: false }));
  const ws = mk(panesGeometry(fuse.panes.windshield), glass, { cast: false, receive: false });
  ws.renderOrder = 2;
  const side = mk(panesGeometry(fuse.panes.side), glass, { cast: false, receive: false });
  side.renderOrder = 2;
  fus.add(ws, side);
  // windshield cracks (shown with damage)
  const crackMat = new THREE.MeshBasicMaterial({ map: crackTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const cracks = mk(panesGeometry(fuse.panes.windshield, 0.008), crackMat, { cast: false, receive: false });
  cracks.renderOrder = 3;
  cracks.visible = false;
  fus.add(cracks);
  // bulkheads closing the cabin: firewall behind the panel and the rear baggage wall
  const bulk = [];
  for (const [z, flip] of [[2.18, true], [-0.88, false]]) {
    const sec = fuselageSection(z);
    const shape = new THREE.Shape();
    for (let j = 0; j <= 32; j++) { const [x, y] = ringPoint(sec, (j / 32) * Math.PI * 2, 0.03); if (j === 0) shape.moveTo(x, y); else shape.lineTo(x, y); }
    const g = new THREE.ShapeGeometry(shape, 1);
    if (flip) g.rotateY(Math.PI);
    g.translate(0, 0, z);
    bulk.push(colorize(toNI(g), C(0x3c3a35)));
  }
  fus.add(mk(mergeGeometries(bulk), cabin, { cast: false }));

  // engine face: dark opening with cylinder heads, spinner
  const eng = [];
  const face = new THREE.CircleGeometry(0.6, 36);
  face.translate(0, 0.12, 3.36);
  eng.push(colorize(toNI(face), C(0x121314)));
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const cyl = new THREE.CylinderGeometry(0.07, 0.08, 0.34, 10);
    cyl.rotateZ(Math.PI / 2);
    cyl.rotateZ(a);
    cyl.translate(Math.cos(a) * 0.4, 0.12 + Math.sin(a) * 0.4, 3.3);
    eng.push(colorize(toNI(cyl), C(0x55585a)));
    for (let f = 0; f < 4; f++) {
      const fin = new THREE.TorusGeometry(0.085, 0.008, 4, 10);
      fin.rotateY(Math.PI / 2);
      fin.rotateZ(a);
      fin.translate(Math.cos(a) * (0.3 + f * 0.06), 0.12 + Math.sin(a) * (0.3 + f * 0.06), 3.3);
      eng.push(colorize(toNI(fin), C(0x3f4244)));
    }
  }
  const crank = new THREE.CylinderGeometry(0.22, 0.24, 0.2, 18);
  crank.rotateX(Math.PI / 2);
  crank.translate(0, 0.12, 3.32);
  eng.push(colorize(toNI(crank), C(0x2b2d2e)));
  // exhaust stack (right side) and oil cooler under the cowl
  const ex = new THREE.CylinderGeometry(0.06, 0.07, 0.6, 10);
  ex.rotateX(Math.PI / 2 - 0.15);
  ex.translate(-0.55, -0.42, 2.3);
  eng.push(colorize(toNI(ex), C(0x3a2b22)));
  const cooler = new THREE.BoxGeometry(0.34, 0.14, 0.5);
  cooler.translate(0, -0.6, 2.85);
  eng.push(colorize(toNI(cooler), TEAL));
  fus.add(mk(mergeGeometries(eng), dark));

  // spinner + propeller (rotates about Z)
  const prop = new THREE.Group();
  prop.position.set(0, 0.12, 3.55);
  const spinner = new THREE.LatheGeometry([...Array(9)].map((_, i) => { const t = i / 8; return new THREE.Vector2(0.22 * Math.sqrt(Math.max(0, 1 - t * t)) + 0.001, t * 0.42); }), 20);
  spinner.rotateX(Math.PI / 2);
  colorize(spinner, WHITE);
  prop.add(mk(spinner, paint));
  const bladesG = bladeGeometry();
  const blades = new THREE.Group();
  for (let k = 0; k < 3; k++) { const b = mk(bladesG, dark); b.rotation.z = (k / 3) * Math.PI * 2; blades.add(b); }
  prop.add(blades);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.3, 48), new THREE.MeshBasicMaterial({ map: propDiscTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.z = 0.05;
  disc.layers.set(LAYER.WORLD);
  disc.renderOrder = 4;
  prop.add(disc);
  fus.add(prop);

  // tail: horizontal stabiliser + elevator, fin + rudder
  const stab = toHorizontal(extrudeXZ([[0.3, -3.82], [2.45, -4.08], [2.5, -4.74], [-2.5, -4.74], [-2.45, -4.08], [-0.3, -3.82]], 0.08), 0.08);
  stab.translate(0, 0.62, 0);
  fus.add(mk(colorBy(stab, () => WHITE), paint));
  const elevator = new THREE.Group();
  elevator.position.set(0, 0.62, -4.76);
  const elevG = toHorizontal(extrudeXZ([[2.5, 0], [2.45, -0.42], [0.2, -0.55], [-0.2, -0.55], [-2.45, -0.42], [-2.5, 0]], 0.05, 0.012), 0.05);
  elevator.add(mk(colorBy(elevG, (x) => (Math.abs(x) > 2.1 ? ORANGE : WHITE)), paint));
  fus.add(elevator);
  const fin = toVertical(extrudeXZ([[-3.5, 0.78], [-4.5, 2.28], [-4.86, 2.32], [-4.86, 0.58]], 0.08), 0.08);
  fus.add(mk(colorBy(fin, (x, y) => (y > 1.95 ? TEAL : WHITE)), paint));
  const rudder = new THREE.Group();
  rudder.position.set(0, 0, -4.88);
  const rudG = toVertical(extrudeXZ([[0, 2.32], [-0.35, 2.22], [-0.58, 1.6], [-0.6, 0.6], [-0.2, 0.42], [0, 0.5]], 0.05, 0.012), 0.05);
  rudder.add(mk(colorBy(rudG, (x, y) => (y > 1.75 ? ORANGE : y > 1.35 ? WHITE : y > 0.95 ? ORANGE : WHITE)), paint));
  fus.add(rudder);

  // antenna wire from the cabin roof to the fin top, pitot under the left wing
  fus.add(mk(strut([0, 1.3, 0.2], [0, 2.3, -4.6], 0.006, 0.006, C(0x222222)), dark, { cast: false }));

  // registration on both sides of the rear fuselage
  const regTex = registrationTexture('PT-ILH');
  const regMat = new THREE.MeshStandardMaterial({ map: regTex, transparent: true, depthWrite: false, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const sideX of [1, -1]) {
    const z = -2.6;
    const sec = fuselageSection(z);
    const reg = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.375), regMat);
    reg.position.set(sideX * (sec.hw + 0.004), 0.72, z);
    reg.rotation.y = sideX > 0 ? Math.PI / 2 : -Math.PI / 2;
    reg.layers.set(LAYER.WORLD);
    fus.add(reg);
  }

  // ---- cabin interior
  const interior = [];
  const floor = new THREE.BoxGeometry(1.22, 0.04, 3.0);
  floor.translate(0, -0.47, 0.6);
  interior.push(colorize(toNI(floor), C(0x2f2c27)));
  const seat = (x, z, w = 0.48) => {
    const base = new THREE.BoxGeometry(w, 0.12, 0.5); base.translate(x, -0.02, z);
    const back = new THREE.BoxGeometry(w, 0.66, 0.1); back.rotateX(0.18); back.translate(x, 0.32, z - 0.28);
    const leg = new THREE.BoxGeometry(w * 0.7, 0.42, 0.06); leg.translate(x, -0.27, z);
    return [colorize(toNI(base), C(0x5b3a26)), colorize(toNI(back), C(0x5b3a26)), colorize(toNI(leg), C(0x2a2a2a))];
  };
  interior.push(...seat(0.33, 1.0), ...seat(-0.33, 1.0), ...seat(0, -0.3, 1.18));
  // glareshield and panel housing
  const glare = new THREE.BoxGeometry(1.26, 0.06, 0.28);
  glare.translate(0, 0.86, 2.06);
  interior.push(colorize(toNI(glare), C(0x161718)));
  const housing = new THREE.BoxGeometry(1.24, 0.56, 0.08);
  housing.rotateX(-0.16);
  housing.translate(0, 0.56, 2.17);
  interior.push(colorize(toNI(housing), C(0x1b1c1d)));
  // centre pedestal
  const ped = new THREE.BoxGeometry(0.16, 0.4, 0.3);
  ped.translate(0, 0.1, 1.98);
  interior.push(colorize(toNI(ped), C(0x1b1c1d)));
  fus.add(mk(mergeGeometries(interior), cabin, { cast: false }));

  // instrument panel face (canvas)
  const panelCanvas = document.createElement('canvas');
  panelCanvas.width = 1024; panelCanvas.height = 448;
  const panelTex = new THREE.CanvasTexture(panelCanvas);
  panelTex.colorSpace = THREE.SRGBColorSpace;
  panelTex.anisotropy = 4;
  const panelMat = new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.55, metalness: 0, emissive: 0xffffff, emissiveMap: panelTex, emissiveIntensity: 0.06 });
  const panelFace = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.525), panelMat);
  panelFace.rotation.set(-0.16, Math.PI, 0);
  panelFace.position.set(0, 0.56, 2.125);
  panelFace.layers.set(LAYER.WORLD);
  fus.add(panelFace);

  // magnetic compass on the glareshield
  const compass = new THREE.Group();
  compass.position.set(0, 0.95, 2.02);
  const housingC = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.09), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5 }));
  housingC.layers.set(LAYER.WORLD);
  const cardCanvas = document.createElement('canvas');
  cardCanvas.width = 512; cardCanvas.height = 64;
  const cg = cardCanvas.getContext('2d');
  cg.fillStyle = '#111'; cg.fillRect(0, 0, 512, 64);
  cg.fillStyle = '#f2efe6'; cg.font = 'bold 26px Arial'; cg.textAlign = 'center'; cg.textBaseline = 'middle';
  const lab = ['N', '3', '6', 'E', '12', '15', 'S', '21', '24', 'W', '30', '33'];
  for (let k = 0; k < 36; k++) {
    const x = (k / 36) * 512;
    cg.fillRect(x - 1, 46, 2, k % 3 === 0 ? 16 : 9);
    if (k % 3 === 0) cg.fillText(lab[k / 3], x === 0 ? 14 : x, 24);
  }
  const cardTex = new THREE.CanvasTexture(cardCanvas);
  cardTex.colorSpace = THREE.SRGBColorSpace;
  cardTex.wrapS = THREE.RepeatWrapping;
  const card = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.03, 32, 1, true), new THREE.MeshBasicMaterial({ map: cardTex, color: 0xbbbbbb }));
  card.layers.set(LAYER.WORLD);
  card.position.set(0, 0.0, -0.01);
  compass.add(housingC, card);
  fus.add(compass);

  // yokes (pilot left, co-pilot right), throttle lever, overhead trim crank
  const yokes = [];
  for (const x of [0.33, -0.33]) {
    const yoke = new THREE.Group();
    yoke.position.set(x, 0.45, 1.84);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.36, 8), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.4 }));
    col.rotation.x = Math.PI / 2; col.position.z = 0.18;
    const wheel = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.035), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 }));
    const gripG = new THREE.CylinderGeometry(0.02, 0.02, 0.13, 8);
    const gl = new THREE.Mesh(gripG, bar.material); gl.position.set(0.17, 0.05, 0);
    const gr = new THREE.Mesh(gripG, bar.material); gr.position.set(-0.17, 0.05, 0);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), new THREE.MeshStandardMaterial({ color: 0xa0451c, roughness: 0.5 }));
    hub.rotation.x = Math.PI / 2;
    wheel.add(bar, gl, gr, hub);
    yoke.add(col, wheel);
    yoke.traverse((o) => o.layers && o.layers.set(LAYER.WORLD));
    yoke.userData.wheel = wheel;
    yoke.userData.z0 = yoke.position.z;
    fus.add(yoke);
    yokes.push(yoke);
  }
  const throttle = new THREE.Group();
  throttle.position.set(0, 0.28, 1.95);
  const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.3 }));
  lever.position.y = 0.1;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }));
  knob.position.y = 0.2;
  throttle.add(lever, knob);
  throttle.traverse((o) => o.layers && o.layers.set(LAYER.WORLD));
  fus.add(throttle);
  const trimCrank = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 16), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5 }));
  trimCrank.scale.setScalar(0.6);
  trimCrank.position.set(0, 1.22, 0.7); // overhead, behind the pilot's line of sight
  trimCrank.layers.set(LAYER.WORLD);
  fus.add(trimCrank);

  // nav lights (port red on the left = +X, starboard green, tail white)
  const lights = new THREE.Group();
  const navMat = (c) => new THREE.MeshBasicMaterial({ color: c });
  const glowTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  })();
  const nav = [];
  for (const [p, c] of [[[7.02, 1.42, 1.15], 0xff2a1a], [[-7.02, 1.42, 1.15], 0x2aff5a], [[0, 0.68, -5.38], 0xffffff]]) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), navMat(new THREE.Color(c).multiplyScalar(3)));
    bulb.position.set(...p);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.set(...p);
    glow.scale.setScalar(0.9);
    bulb.layers.set(LAYER.WORLD); glow.layers.set(LAYER.WORLD);
    lights.add(bulb, glow);
    nav.push(glow);
  }
  lights.visible = false;
  fus.add(lights);
  root.add(fus);

  // ---- wings (each with its struts), flaps and ailerons
  const xsMain = (sgn) => linspace(sgn * 0.0, sgn * 7.0, 28);
  const wingGroups = [];
  const flaps = [], ailerons = [];
  for (const sgn of [1, -1]) {
    const wg = new THREE.Group();
    wg.name = sgn > 0 ? 'wingL' : 'wingR';
    const geos = [];
    geos.push(wingPanel(xsMain(sgn), 0, WING.hinge, wingFrame, wingColor));
    // fixed trailing edge over the cabin and at the tip
    geos.push(wingPanel(linspace(0, sgn * 0.7, 3), WING.hinge, 1, wingFrame, wingColor));
    geos.push(wingPanel(linspace(sgn * 6.72, sgn * 7.0, 3), WING.hinge, 1, wingFrame, wingColor));
    wg.add(mk(mergeGeometries(geos.map(toNI)), paint));
    // movable surfaces hinge at 72 % chord
    const surface = (x0, x1) => {
      const f = wingFrame((x0 + x1) / 2);
      const hingeY = f.le[0] + 0.02 - WING.hinge * f.chord * Math.tan(f.incidence), hingeZ = f.le[1] - WING.hinge * f.chord;
      const g = wingPanel(linspace(x0, x1, 6), WING.hinge, 1, wingFrame, wingColor);
      g.translate(0, -hingeY, -hingeZ);
      const grp = new THREE.Group();
      grp.position.set(0, hingeY, hingeZ);
      grp.add(mk(g, paint));
      wg.add(grp);
      return grp;
    };
    flaps.push(surface(sgn * 0.72, sgn * 3.82));
    ailerons.push(surface(sgn * 3.88, sgn * 6.7));
    // lift strut + jury strut
    const strutTop = [sgn * 3.1, WING.root + 3.1 * WING.dihedral - 0.05, 1.3];
    wg.add(mk(mergeGeometries([
      strut([sgn * 0.68, -0.32, 1.2], strutTop, 0.05, 0.022, WHITE),
      strut([sgn * 1.9, 0.48, 1.25], [sgn * 1.9, WING.root + 1.9 * WING.dihedral - 0.05, 1.25], 0.025, 0.015, WHITE),
    ]), paint));
    // pitot tube under the left wing
    if (sgn > 0) wg.add(mk(strut([4.6, WING.root - 0.05, 1.6], [4.6, WING.root - 0.05, 2.1], 0.012, 0.012, C(0x999999)), alu, { cast: false }));
    root.add(wg);
    wingGroups.push(wg);
  }

  // ---- floats (each with its struts and water rudder)
  const floatGroups = [];
  const waterRudders = [];
  for (const sgn of [1, -1]) {
    const fg = new THREE.Group();
    fg.name = sgn > 0 ? 'floatL' : 'floatR';
    const fx = sgn * 1.55;
    const geos = [buildFloat(sgn)];
    geos.push(
      strut([fx, -1.56, 2.1], [sgn * 0.6, -0.5, 2.05], 0.045, 0.025, ALU),
      strut([fx, -1.56, -0.2], [sgn * 0.58, -0.5, -0.45], 0.045, 0.025, ALU),
      strut([fx, -1.56, 2.1], [sgn * 0.58, -0.5, -0.45], 0.03, 0.02, ALU),
      // spreader bars and bracing wires (half each side, they meet in the middle)
      strut([fx, -1.6, 2.1], [0, -1.62, 2.1], 0.03, 0.02, ALU),
      strut([fx, -1.6, -0.2], [0, -1.62, -0.2], 0.03, 0.02, ALU),
      strut([fx, -1.6, 2.1], [-sgn * 0.0, -1.1, 2.08], 0.006, 0.006, C(0x333333)),
      // deck cleats
      strut([fx, -1.55, 3.6], [fx, -1.48, 3.6], 0.03, 0.03, C(0x333333)),
    );
    fg.add(mk(mergeGeometries(geos), alu));
    const wr = new THREE.Group();
    wr.position.set(fx, -1.82, -3.5);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.32, 0.22), dark);
    blade.position.set(0, -0.1, -0.1);
    blade.castShadow = true;
    blade.layers.set(LAYER.WORLD);
    wr.add(blade);
    fg.add(wr);
    waterRudders.push(wr);
    root.add(fg);
    floatGroups.push(fg);
  }

  // remember how everything was assembled so a wreck can be rebuilt
  const pieces = [fus, ...wingGroups, ...floatGroups];
  for (const p of pieces) p.userData.home = { position: p.position.clone(), quaternion: p.quaternion.clone() };

  return {
    root, pieces,
    fuselage: fus, wings: wingGroups, floats: floatGroups,
    prop, blades, disc, elevator, rudder, flaps, ailerons, waterRudders, yokes, throttle, trimCrank,
    compassCard: card, cracks, crackMat, lights, nav,
    panel: { canvas: panelCanvas, ctx: panelCanvas.getContext('2d'), texture: panelTex },
    eye: new THREE.Vector3(0.33, 1.06, 1.14),
  };
}
