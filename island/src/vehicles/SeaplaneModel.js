import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { patchMaterial } from '../core/MaterialPatch.js';
import { LAYER } from '../core/Shared.js';
import { lerp, smoothstep, clamp } from '../utils/MathUtils.js';

// Procedural single-engine high-wing floatplane, built as a flight-sim style model:
// a lofted fuselage with a tapered cowling and polished spinner, cambered wings and
// tail surfaces with working controls, stepped twin floats on streamlined struts and
// a furnished cabin. Fine detail (panel seams, rivets, doors, vents, the livery and
// the window openings) is baked at load into textures mapped on the surfaces, so the
// geometry stays light. Visual only: the flight model lives in FlightModel.js.
// Body axes: +Z forward, +Y up, +X left (port).
//
// Livery: aviation white, dark teal belly, a restrained orange cheat line, orange
// wing and tail tips, natural aluminium struts. Registration PT-ILH.

const TAU = Math.PI * 2;
const C = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const RGB8 = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const HEX = { white: 0xf2f0ea, grey: 0xe0ded7, teal: 0x14505c, orange: 0xdc5f28, seal: 0x272b2d, bottom: 0x283033, nonskid: 0x3a3e40 };
const WHITE = C(HEX.white), TEAL = C(HEX.teal), ORANGE = C(HEX.orange), DARK = C(0x1e2224), ALU = C(0xd2d4d2), RUBBER = C(0x111213), STEEL = C(0x54595c);
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasTexture(c, srgb, aniso = 8) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  return t;
}
function imageTexture(img, srgb, aniso, scale = 1) {
  const c = makeCanvas(img.width, img.height);
  c.getContext('2d').putImageData(img, 0, 0);
  if (scale === 1) return canvasTexture(c, srgb, aniso);
  // smaller copy for maps that do not need the full resolution
  const s = makeCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
  const g = s.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(c, 0, 0, s.width, s.height);
  return canvasTexture(s, srgb, aniso);
}

/** Tangent-space normal map from a height field (0..1). */
function normalImage(hgt, W, H, k) {
  const img = new ImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) {
    const yu = y > 0 ? y - 1 : y, yd = y < H - 1 ? y + 1 : y;
    for (let x = 0; x < W; x++) {
      const xl = x > 0 ? x - 1 : x, xr = x < W - 1 ? x + 1 : x;
      const nx = (hgt[y * W + xl] - hgt[y * W + xr]) * k;
      const ny = (hgt[yd * W + x] - hgt[yu * W + x]) * k;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const i = (y * W + x) * 4;
      d[i] = (nx * inv * 0.5 + 0.5) * 255; d[i + 1] = (ny * inv * 0.5 + 0.5) * 255; d[i + 2] = (inv * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }
  return img;
}

/** Signed distance to a polygon (negative inside). */
function sdPoly(px, py, P) {
  let d = Infinity, s = 1;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const ex = P[j][0] - P[i][0], ey = P[j][1] - P[i][1], wx = px - P[i][0], wy = py - P[i][1];
    const h = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
    const bx = wx - ex * h, by = wy - ey * h;
    d = Math.min(d, bx * bx + by * by);
    const c1 = py >= P[i][1], c2 = py < P[j][1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}
const sdRound = (px, py, shape) => sdPoly(px, py, shape.core) - shape.r;

function colorize(g, rgb) {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
const toNI = (g) => (g.index ? g.toNonIndexed() : g);
const part = (g, rgb) => { const n = toNI(g); for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return colorize(n, rgb); };

function orient(g, expect, sample) {
  const n = g.attributes.normal;
  if (n.getX(sample) * expect.x + n.getY(sample) * expect.y + n.getZ(sample) * expect.z < 0) {
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.index.needsUpdate = true;
    g.computeVertexNormals();
  }
  return g;
}

function cyl(a, b, r, rgb, seg = 10, r2 = r) {
  const A = V3(...a), B = V3(...b);
  const g = new THREE.CylinderGeometry(r2, r, A.distanceTo(B), seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), B.clone().sub(A).normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return part(g, rgb);
}
function box(w, h, d, x, y, z, rgb, { rx = 0, ry = 0, rz = 0, round = 0 } = {}) {
  const g = round > 0 ? new RoundedBoxGeometry(w, h, d, 2, round) : new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return part(g, rgb);
}

// ==================================================================== fuselage loft
const ZMIN = -5.44, ZMAX = 3.5;
const STATIONS = [
  // z, half width, bottom, top, superellipse exponent
  [3.50, 0.40, -0.24, 0.50, 2.0],
  [3.36, 0.47, -0.32, 0.57, 2.05],
  [3.15, 0.54, -0.40, 0.64, 2.15],
  [2.85, 0.60, -0.48, 0.71, 2.3],
  [2.55, 0.655, -0.54, 0.77, 2.5],
  [2.40, 0.675, -0.555, 0.80, 2.65],
  [2.15, 0.69, -0.56, 0.99, 3.0],
  [1.92, 0.70, -0.56, 1.195, 3.3],
  [1.70, 0.70, -0.56, 1.205, 3.5],
  [0.60, 0.70, -0.56, 1.205, 3.6],
  [-0.55, 0.685, -0.55, 1.19, 3.5],
  [-1.30, 0.62, -0.46, 1.15, 3.1],
  [-2.20, 0.48, -0.25, 1.07, 2.7],
  [-3.40, 0.31, 0.08, 0.96, 2.35],
  [-4.50, 0.175, 0.34, 0.87, 2.15],
  [-5.25, 0.07, 0.50, 0.79, 2.0],
  [-5.44, 0.02, 0.60, 0.72, 2.0],
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

/** Half width of the skin at height y (for fittings that sit on the side). */
function skinX(z, y) {
  const sec = fuselageSection(z);
  const hy = (sec.yt - sec.yb) / 2, yc = (sec.yt + sec.yb) / 2, e = 2 / sec.n;
  const c = Math.abs(clamp((y - yc) / hy, -1, 1)) ** (1 / e);
  return sec.hw * Math.sqrt(Math.max(0, 1 - c * c)) ** e;
}

// Texture coordinates on the shell: u runs nose → tail along z, v around the section
// starting at the keel: 0.25 starboard, 0.5 top, 0.75 port.
const uOfZ = (z) => (z - ZMIN) / (ZMAX - ZMIN);
function vOfSide(z, y, side) {
  const sec = fuselageSection(z);
  const hy = (sec.yt - sec.yb) / 2, yc = (sec.yt + sec.yb) / 2, e = 2 / sec.n;
  const t = clamp((y - yc) / hy, -1, 1);
  const th = Math.acos(Math.sign(t) * Math.abs(t) ** (1 / e));
  return side > 0 ? (th + Math.PI) / TAU : (Math.PI - th) / TAU;
}
function vOfTop(z, x) {
  const sec = fuselageSection(z);
  const e = 2 / sec.n;
  const th = Math.asin(clamp((Math.abs(x) / sec.hw) ** (1 / e), 0, 1));
  return x >= 0 ? (th + Math.PI) / TAU : (Math.PI - th) / TAU;
}
function perimeter(z) {
  const sec = fuselageSection(z);
  let p = 0, last = ringPoint(sec, 0);
  for (let k = 1; k <= 64; k++) { const q = ringPoint(sec, (k / 64) * TAU); p += Math.hypot(q[0] - last[0], q[1] - last[1]); last = q; }
  return p;
}

const CHEAT = [[3.5, -0.02], [2.42, 0.10], [0.5, 0.13], [-1.4, 0.24], [-3.4, 0.47], [-5.44, 0.66]];
function cheatLine(z) {
  for (let i = 0; i < CHEAT.length - 1; i++) {
    const [z0, y0] = CHEAT[i], [z1, y1] = CHEAT[i + 1];
    if (z <= z0 && z >= z1) return lerp(y0, y1, (z0 - z) / (z0 - z1));
  }
  return z > CHEAT[0][0] ? CHEAT[0][1] : CHEAT[CHEAT.length - 1][1];
}

// windows and doors in side view (z, y), windshield in plan view (x, z): rounded polygons
const WINDOWS = [
  { core: [[1.8, 0.55], [1.67, 0.99], [1.03, 0.99], [1.03, 0.55]], r: 0.07 },
  { core: [[0.73, 0.57], [0.73, 0.99], [-0.33, 0.99], [-0.33, 0.57]], r: 0.07 },
  { core: [[-0.70, 0.66], [-0.70, 0.95], [-1.07, 0.95], [-1.19, 0.7]], r: 0.08 },
];
const DOORS = [
  { core: [[1.86, -0.16], [1.7, 1.06], [0.94, 1.06], [0.94, -0.16]], r: 0.06 },
  { core: [[0.80, -0.12], [0.80, 1.06], [-0.44, 1.06], [-0.44, -0.12]], r: 0.06 },
];
const WINDSHIELD = { core: [[-0.52, 2.02], [0.52, 2.02], [0.49, 2.30], [-0.49, 2.30]], r: 0.08 };
const TAIL_PANEL = { core: [[-3.36, 0.53], [-3.36, 0.69], [-3.74, 0.69], [-3.74, 0.53]], r: 0.025 };
const winSD = (z, y) => Math.min(sdRound(z, y, WINDOWS[0]), sdRound(z, y, WINDOWS[1]), sdRound(z, y, WINDOWS[2]));
const doorSD = (z, y) => Math.min(Math.abs(sdRound(z, y, DOORS[0])), Math.abs(sdRound(z, y, DOORS[1])));

function shellZs(fine) {
  const segs = fine ? [[3.5, 2.4, 18], [2.4, 1.7, 16], [1.7, -1.4, 40], [-1.4, ZMIN, 34]] : [[3.5, 2.4, 6], [2.4, 1.7, 5], [1.7, -1.4, 8], [-1.4, ZMIN, 10]];
  const out = [];
  for (const [a, b, n] of segs) for (let i = 0; i <= n; i++) out.push(Math.round((a + (b - a) * (i / n)) * 1e4) / 1e4);
  return [...new Set(out)].sort((p, q) => q - p);
}

function buildShell({ fine = true, inset = 0, inward = false, z0 = ZMIN, z1 = ZMAX, segs = 80, keep = null, uvFn = null } = {}) {
  const zs = shellZs(fine).filter((z) => z >= z0 - 1e-6 && z <= z1 + 1e-6);
  const pos = [], uv = [], idx = [];
  for (const z of zs) {
    const sec = fuselageSection(z);
    for (let j = 0; j <= segs; j++) {
      const v = j / segs;
      const [x, y] = ringPoint(sec, Math.PI + v * TAU, inset);
      pos.push(x, y, z);
      if (uvFn) uv.push(...uvFn(x, y, z)); else uv.push(uOfZ(z), v);
    }
  }
  const w = segs + 1;
  for (let i = 0; i < zs.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * w + j, b = a + w, c = b + 1, d = a + 1;
      if (keep) {
        const k = a * 3, kc = c * 3;
        if (!keep((pos[k] + pos[kc]) / 2, (pos[k + 1] + pos[kc + 1]) / 2, (pos[k + 2] + pos[kc + 2]) / 2)) continue;
      }
      if (inward) idx.push(a, b, d, b, c, d); else idx.push(a, d, b, d, c, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // the keel seam: share normals across the first and last vertex of each ring
  const n = g.attributes.normal;
  for (let i = 0; i < zs.length; i++) {
    const a = i * w, b = i * w + segs;
    const v = V3(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z); n.setXYZ(b, v.x, v.y, v.z);
  }
  return g;
}

/** Cowling front: a rounded lip from the cowl ring down to the spinner backplate. */
function buildNoseCap(segs = 80) {
  const sec = fuselageSection(ZMAX);
  const K = 8, R = 0.205, cy = 0.12;
  const pos = [], uv = [], idx = [];
  for (let k = 0; k <= K; k++) {
    const t = k / K, rb = 1 - Math.cos((t * Math.PI) / 2), zf = Math.sin((t * Math.PI) / 2);
    for (let j = 0; j <= segs; j++) {
      const v = j / segs, th = Math.PI + v * TAU;
      const [x, y] = ringPoint(sec, th);
      pos.push(lerp(x, Math.sin(th) * R, rb), lerp(y, cy + Math.cos(th) * R, rb), ZMAX + 0.034 * zf);
      uv.push(uOfZ(ZMAX) - 0.0006, v);
    }
  }
  const w = segs + 1;
  for (let k = 0; k < K; k++) for (let j = 0; j < segs; j++) { const a = k * w + j, b = a + w, c = b + 1, d = a + 1; idx.push(a, b, d, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return orient(g, V3(0, 0, 1), K * w + Math.floor(segs / 2));
}

/** Livery, panel detail, window openings and seals for the fuselage, baked in its (u, v) space. */
function fuselageTextures() {
  const W = 2048, H = 1024;
  const fc = makeCanvas(W, H), fg = fc.getContext('2d', { willReadFrequently: true });
  fg.fillStyle = '#808080';
  fg.fillRect(0, 0, W, H);
  const px = (z) => uOfZ(z) * W, py = (v) => (1 - v) * H;
  const seam = (x0, y0, x1, y1, w = 1.5, shade = 90) => { fg.strokeStyle = `rgb(${shade},${shade},${shade})`; fg.lineWidth = w; fg.beginPath(); fg.moveTo(x0, y0); fg.lineTo(x1, y1); fg.stroke(); };
  const dot = (x, y, r = 1.5, shade = 168) => { fg.fillStyle = `rgb(${shade},${shade},${shade})`; fg.beginPath(); fg.arc(x, y, r, 0, TAU); fg.fill(); };
  const screw = (x, y) => { dot(x, y, 2.2, 150); dot(x, y, 0.9, 96); };
  // skin joints (seam + rivet row) and frames (rivets)
  const ring = (z, ranges, seamToo, off = -3.5) => {
    const x = px(z), n = Math.round(perimeter(z) / 0.036);
    for (const [a, b] of ranges) {
      if (seamToo) seam(x, py(a), x, py(b), 1.8);
      for (let k = 0; k < n; k++) { const v = (k + 0.5) / n; if (v >= a && v <= b) dot(x + off, py(v)); }
    }
  };
  ring(2.42, [[0, 1]], true);
  for (const z of [-1.38, -2.1, -2.82, -3.52, -4.22, -4.9]) ring(z, [[0, 1]], true);
  for (const z of [1.62, 0.9, 0.16, -0.62]) ring(z, [[0, 0.11], [0.89, 1]], false, 0);
  const row = (v, z0, z1, seamToo, spacing = 0.042) => {
    if (seamToo) seam(px(z0), py(v), px(z1), py(v), 1.4);
    for (let z = z1; z <= z0; z += spacing) dot(px(z), py(v) + (seamToo ? 3 : 0));
  };
  for (const v of [0.08, 0.17, 0.4, 0.6, 0.83, 0.92]) row(v, -1.38, -5.3, false);
  for (const v of [0.29, 0.71]) row(v, -1.38, -5.3, true);
  for (const v of [0.055, 0.945]) row(v, 2.42, -1.38, true);
  // cowling: split line fasteners, oil door screws; tail cone access panel; door hinges
  for (const side of [1, -1]) {
    for (let z = 2.52; z < 3.42; z += 0.13) screw(px(z), py(vOfSide(z, 0.2, side)));
    for (const [z, y] of [[-3.38, 0.55], [-3.38, 0.67], [-3.55, 0.55], [-3.55, 0.67], [-3.72, 0.55], [-3.72, 0.67]]) screw(px(z), py(vOfSide(z, y, side)));
    for (const [z, y] of [[1.86, 0.05], [1.80, 0.85], [0.79, 0.1], [0.79, 0.85]]) {
      const x0 = px(z), y0 = py(vOfSide(z, y, side));
      fg.fillStyle = 'rgb(150,150,150)'; fg.fillRect(x0 - 3, y0 - 9, 6, 18);
    }
  }
  for (const [x, z] of [[0.125, 2.72], [-0.125, 2.72], [0.125, 2.98], [-0.125, 2.98]]) screw(px(z), py(vOfTop(z, x)));

  const feat = fg.getImageData(0, 0, W, H).data;
  const color = new ImageData(W, H), cd = color.data;
  const hgt = new Float32Array(W * H);
  const MW = W >> 1, MH = H >> 1;
  const glass = new ImageData(MW, MH), lining = new ImageData(MW, MH);
  const sinT = new Float32Array(H), cosT = new Float32Array(H), lnS = new Float32Array(H), lnC = new Float32Array(H);
  for (let r = 0; r < H; r++) {
    const th = Math.PI + (1 - (r + 0.5) / H) * TAU;
    sinT[r] = Math.sin(th); cosT[r] = Math.cos(th);
    lnS[r] = Math.log(Math.max(1e-9, Math.abs(sinT[r]))); lnC[r] = Math.log(Math.max(1e-9, Math.abs(cosT[r])));
  }
  const cW = RGB8(HEX.white), cT = RGB8(HEX.teal), cO = RGB8(HEX.orange), cS = RGB8(HEX.seal);
  const texel = (ZMAX - ZMIN) / W;
  for (let col = 0; col < W; col++) {
    const z = ZMIN + ((col + 0.5) / W) * (ZMAX - ZMIN);
    const sec = fuselageSection(z);
    const e = 2 / sec.n, hw = sec.hw, hy = (sec.yt - sec.yb) / 2, yc = (sec.yt + sec.yb) / 2;
    const cl = cheatLine(z);
    const streak = hash(col * 0.37);
    const nearWin = z > -1.5 && z < 1.98, nearWs = z > 1.86 && z < 2.46, cowl = z > 2.44 && z < 3.47;
    for (let row = 0; row < H; row++) {
      const s = sinT[row], c = cosT[row];
      const x = (s < 0 ? -hw : hw) * Math.exp(e * lnS[row]);
      const y = yc + (c < 0 ? -hy : hy) * Math.exp(e * lnC[row]);
      const ax = Math.abs(x);
      const i = row * W + col;
      let h = feat[i * 4] / 255;
      // livery: teal belly, orange cheat line, white above
      const tO = clamp((y - cl) / 0.004 + 0.5, 0, 1), tW = clamp((y - cl - 0.056) / 0.004 + 0.5, 0, 1);
      let r = lerp(lerp(cT[0], cO[0], tO), cW[0], tW), g = lerp(lerp(cT[1], cO[1], tO), cW[1], tW), b = lerp(lerp(cT[2], cO[2], tO), cW[2], tW);
      let mul = 0.985 + 0.03 * Math.sin(z * 3.1 + y * 5.3) * Math.sin(z * 1.7 - y * 2.9);
      const side = ax > hw * 0.55 && c < 0.85;
      // window openings (and their rubber seals)
      let dWin = 9;
      if (side && nearWin && y > 0.42 && y < 1.12) dWin = winSD(z, y);
      if (c > 0.3 && nearWs) dWin = Math.min(dWin, sdRound(x, z, WINDSHIELD));
      // door outlines
      if (side && z > -0.6 && z < 2.0 && y > -0.3 && y < 1.2) {
        const gr = 1 - doorSD(z, y) / 0.0042;
        if (gr > 0) { h -= 0.3 * gr; mul *= 1 - 0.14 * gr; }
      }
      // cowling: split line, louvres, oil door
      if (cowl) {
        if (ax > 0.25) { const gr = 1 - Math.abs(y - 0.2) / 0.0035; if (gr > 0) { h -= 0.28 * gr; mul *= 1 - 0.12 * gr; } }
        if (side && z > 2.58 && z < 2.86) {
          for (const ly of [0.31, 0.365, 0.42]) {
            const d = Math.max(Math.abs(y - ly) - 0.011, Math.abs(z - 2.72) - 0.14);
            if (d < 0.003) { const k = clamp((0.003 - d) / 0.006, 0, 1); h -= 0.45 * k; mul *= 1 - 0.75 * k; }
          }
        }
        if (c > 0.55 && z > 2.6 && z < 3.1) {
          const gr = 1 - Math.abs(Math.max(Math.abs(x) - 0.11, Math.abs(z - 2.85) - 0.13) - 0.022) / 0.004;
          if (gr > 0) { h -= 0.28 * gr; mul *= 1 - 0.1 * gr; }
        }
      }
      if (side && z < -3.25 && z > -3.85) { const gr = 1 - Math.abs(sdRound(z, y, TAIL_PANEL)) / 0.0035; if (gr > 0) { h -= 0.25 * gr; mul *= 1 - 0.1 * gr; } }
      // weathering: exhaust soot along the starboard lower side, oil on the belly, rain streaks under the windows
      if (x < 0 && z < 2.42 && z > -2) { const k = Math.exp(-(((y + 0.36) / 0.13) ** 2)) * Math.exp(-(2.42 - z) / 1.3) * 0.5; mul *= 1 - k * 0.5; r += k * 6; }
      if (y < sec.yb + 0.1 && z < 2.42) mul *= 1 - 0.1 * Math.exp(-(2.42 - z) / 2.2);
      if (side && y < 0.56 && y > 0 && ((z > 0.96 && z < 1.8) || (z > -0.4 && z < 0.8)) && streak > 0.8) mul *= 1 - 0.06 * ((streak - 0.8) / 0.2) * smoothstep(0, 0.5, y);
      if (dWin >= 0 && dWin < 0.02) {
        const k = 1 - smoothstep(0.015, 0.02, dWin);
        r = lerp(r, cS[0], k); g = lerp(g, cS[1], k); b = lerp(b, cS[2], k);
        h += 0.1 * k;
      }
      const a = clamp(dWin / texel + 0.5, 0, 1);
      mul *= 1 + (h - 0.5) * 0.45;
      const o = i * 4;
      cd[o] = r * mul; cd[o + 1] = g * mul; cd[o + 2] = b * mul; cd[o + 3] = a * 255;
      hgt[i] = h;
      if (!(col & 1) && !(row & 1)) {
        const j = ((row >> 1) * MW + (col >> 1)) * 4;
        glass.data[j] = glass.data[j + 1] = glass.data[j + 2] = (1 - a) * 255; glass.data[j + 3] = 255;
        lining.data[j] = lining.data[j + 1] = lining.data[j + 2] = a * 255; lining.data[j + 3] = 255;
      }
    }
  }
  return {
    color: imageTexture(color, true, 8),
    normal: imageTexture(normalImage(hgt, W, H, 3.2), false, 8),
    glass: imageTexture(glass, false, 4, 0.5),
    lining: imageTexture(lining, false, 4, 0.5),
  };
}

// ==================================================================== lifting surfaces
function airfoilT(f, t) { f = clamp(f, 0, 1); return 5 * t * (0.2969 * Math.sqrt(f) - 0.126 * f - 0.3516 * f * f + 0.2843 * f ** 3 - 0.1036 * f ** 4); }
function camberY(f, m, p) { if (!m) return 0; return f < p ? (m / (p * p)) * (2 * p * f - f * f) : (m / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * f - f * f); }
function surfacePoint(F, f, side, t, m, p, out = V3()) {
  const h = (camberY(f, m, p) + side * airfoilT(f, t) * (F.thick ?? 1)) * F.chord;
  return out.copy(F.le).addScaledVector(F.back, f * F.chord).addScaledVector(F.up, h);
}

/**
 * Loft an airfoil-section surface between span stations. frame(s) → { le, back, up, chord,
 * thick, span }; the surface covers chord fractions c0..c1 (cut faces are closed), and
 * v = 0.5 ∓ f / 2 on the upper / lower side so textures line up across control surfaces.
 */
function liftSurface({ spans, frame, c0 = 0, c1 = 1, n = 18, t = 0.12, m = 0, p = 0.4, uvOf, capStart = true, capEnd = true }) {
  const fr = [];
  for (let k = 0; k <= n; k++) fr.push(c0 + (c1 - c0) * (1 - Math.cos((k / n) * Math.PI)) / 2);
  const F = spans.map(frame);
  const strips = [];
  const half = Math.floor(n / 2);
  if (c0 < 1e-6) strips.push({ pts: [...fr.slice().reverse().map((f) => [f, 1]), ...fr.slice(1).map((f) => [f, -1])], expect: 'up', mid: half });
  else {
    strips.push({ pts: fr.map((f) => [f, 1]), expect: 'up', mid: half });
    strips.push({ pts: fr.map((f) => [f, -1]), expect: 'down', mid: half });
    strips.push({ pts: [[c0, 1], [c0, -1]], expect: 'fwd', mid: 0 });
  }
  if (c1 < 1 - 1e-6) strips.push({ pts: [[c1, 1], [c1, -1]], expect: 'aft', mid: 0 });
  const geos = [];
  const q = V3();
  const im = Math.floor(F.length / 2);
  for (const st of strips) {
    const np = st.pts.length, pos = [], uv = [], idx = [];
    for (const f of F) for (const [cf, sd] of st.pts) { surfacePoint(f, cf, sd, t, m, p, q); pos.push(q.x, q.y, q.z); uv.push(...uvOf(f, cf, sd)); }
    for (let i = 0; i < F.length - 1; i++) for (let k = 0; k < np - 1; k++) { const a = i * np + k, b = a + 1, c = a + np + 1, d = a + np; idx.push(a, b, d, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const fm = F[im];
    const ex = st.expect === 'up' ? fm.up : st.expect === 'down' ? fm.up.clone().negate() : st.expect === 'fwd' ? fm.back.clone().negate() : fm.back;
    geos.push(orient(g, ex, im * np + st.mid));
  }
  const spanDir = F[F.length - 1].le.clone().sub(F[0].le).normalize();
  for (const [i, s, on] of [[0, -1, capStart], [F.length - 1, 1, capEnd]]) {
    if (!on) continue;
    const f = F[i];
    const outline = [...fr.slice().reverse().map((cf) => surfacePoint(f, cf, 1, t, m, p)), ...fr.slice(c0 < 1e-6 ? 1 : 0).map((cf) => surfacePoint(f, cf, -1, t, m, p))];
    const cen = outline.reduce((a, b) => a.add(b), V3()).divideScalar(outline.length);
    const cuv = uvOf(f, 0.3, 1);
    const pos = [cen.x, cen.y, cen.z], uv = [...cuv], idx = [];
    for (const o of outline) { pos.push(o.x, o.y, o.z); uv.push(...cuv); }
    for (let k = 1; k <= outline.length; k++) idx.push(0, k, (k % outline.length) + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    geos.push(orient(g, spanDir.clone().multiplyScalar(s), 0));
  }
  return mergeGeometries(geos);
}

const linspace = (a, b, n) => { const out = []; for (let i = 0; i <= n; i++) out.push(a + (b - a) * (i / n)); return out; };

// wing: constant chord with a rounded, slightly drooped tip, 1.6° dihedral, 2412 section
const WING = { span: 7.0, root: 1.28, le: 1.95, chord: 1.66, dihedral: Math.tan((1.6 * Math.PI) / 180), inc: 0.03, hinge: 0.745, t: 0.12, m: 0.02, p: 0.4 };
const WBACK = V3(0, -Math.sin(WING.inc), -Math.cos(WING.inc)), WUP = V3(0, Math.cos(WING.inc), -Math.sin(WING.inc));
const wingFrame = (sgn) => (s) => {
  const tip = smoothstep(6.5, 7.0, s);
  return { le: V3(sgn * s, WING.root + s * WING.dihedral - tip ** 3 * 0.035, WING.le - tip * tip * 0.1), back: WBACK, up: WUP, chord: WING.chord * (1 - tip * tip * 0.5), thick: 1 - tip * tip * 0.55, span: s };
};
// horizontal tail (stabiliser + elevator hinged at z = -4.76) and fin + rudder (hinge -4.88)
const STAB_Y = 0.62, ELEV_Z = -4.76, RUD_Z = -4.88;
const stabFrame = (sgn) => (s) => {
  const tip = smoothstep(2.15, 2.5, s);
  const le = -3.78 - 0.26 * (s / 2.5) - 0.1 * tip * tip;
  return { le: V3(sgn * s, STAB_Y, le), back: V3(0, 0, -1), up: V3(0, 1, 0), chord: (le + 4.75) / 0.68, thick: 1 - tip * 0.35, span: s };
};
const elevFrame = (sgn) => (s) => {
  const tip = smoothstep(2.15, 2.5, s);
  const ce = lerp(0.55, 0.42, s / 2.5) * (1 - tip * tip * 0.5), Ce = ce / 0.3;
  const Cs = stabFrame(1)(s).chord;
  return { le: V3(sgn * s, 0, 0.7 * Ce - 0.015), back: V3(0, 0, -1), up: V3(0, 1, 0), chord: Ce, thick: ((airfoilT(0.68, 0.09) * Cs) / (airfoilT(0.7, 0.09) * Ce)) * (1 - tip * 0.35), span: s };
};
const finFrame = (y) => {
  const tip = smoothstep(2.12, 2.32, y);
  const le = -3.4 - (y - 0.62) * 0.55 - tip * tip * 0.1;
  return { le: V3(0, y, le), back: V3(0, 0, -1), up: V3(1, 0, 0), chord: (le + 4.86) / 0.64, thick: 1 - tip * 0.3, span: y };
};
const rudFrame = (y) => {
  const tip = smoothstep(2.12, 2.33, y), bot = smoothstep(0.62, 0.45, y);
  const cr = lerp(0.5, 0.42, (y - 0.45) / 1.85) * (1 - tip * tip * 0.55) * (1 - bot * bot * 0.4), Cr = cr / 0.36;
  const Cf = finFrame(clamp(y, 0.62, 2.32)).chord;
  return { le: V3(0, y, 0.64 * Cr - 0.015), back: V3(0, 0, -1), up: V3(1, 0, 0), chord: Cr, thick: ((airfoilT(0.64, 0.1) * Cf) / (airfoilT(0.66, 0.1) * Cr)) * (1 - tip * 0.3), span: y };
};
// texture atlas for wings and tail: [u0, u1, span0, span1]
const ATLAS = { wing: [0, 0.5, 0, 7], stab: [0.5, 0.625, 0, 2.5], elev: [0.625, 0.75, 0, 2.5], fin: [0.75, 0.875, 0.4, 2.4], rud: [0.875, 1, 0.4, 2.4] };
const atlasUV = (key) => (F, f, sd) => { const [u0, u1, a, b] = ATLAS[key]; return [u0 + (u1 - u0) * clamp((F.span - a) / (b - a), 0, 1), 0.5 - sd * f * 0.5]; };
const finStripe = (y, z) => y + 0.9 * (z + 3.6);

function surfaceTextures() {
  const W = 2048, H = 512;
  const fc = makeCanvas(W, H), fg = fc.getContext('2d', { willReadFrequently: true });
  fg.fillStyle = '#808080';
  fg.fillRect(0, 0, W, H);
  const dot = (x, y, r = 1.4, shade = 166) => { fg.fillStyle = `rgb(${shade},${shade},${shade})`; fg.beginPath(); fg.arc(x, y, r, 0, TAU); fg.fill(); };
  const seamH = (x0, x1, y, shade = 92) => { fg.strokeStyle = `rgb(${shade},${shade},${shade})`; fg.lineWidth = 1.4; fg.beginPath(); fg.moveTo(x0, y); fg.lineTo(x1, y); fg.stroke(); };
  const py = (v) => (1 - v) * H;
  for (const [key, ribSpacing, chord] of [['wing', 0.3, 1.66], ['stab', 0.25, 1.1], ['elev', 0.18, 0.5], ['fin', 0.25, 1.0], ['rud', 0.18, 0.5]]) {
    const [u0, u1, a, b] = ATLAS[key];
    const ux = (s) => (u0 + ((u1 - u0) * (s - a)) / (b - a)) * W;
    const dv = 0.034 / chord / 2;
    for (let s = a + ribSpacing; s < b - 0.05; s += ribSpacing) for (let v = 0.02; v < 0.98; v += dv) dot(ux(s), py(v));
    if (key === 'wing' || key === 'stab' || key === 'fin') {
      for (const f of key === 'wing' ? [0.12, 0.68] : [0.2, 0.62]) for (const sd of [1, -1]) for (let s = a; s < b; s += 0.042) dot(ux(s), py(0.5 - sd * f * 0.5));
      for (const sd of [1, -1]) seamH(ux(a), ux(b), py(0.5 - sd * 0.035));
    }
  }
  // fuel caps
  for (const sd of [1]) {
    const x = ((2.2 / 7) * 0.5) * W, y = py(0.5 - sd * 0.09);
    fg.strokeStyle = 'rgb(96,96,96)'; fg.lineWidth = 1.5; fg.beginPath(); fg.ellipse(x, y, 9, 9, 0, 0, TAU); fg.stroke();
  }
  const feat = fg.getImageData(0, 0, W, H).data;
  const color = new ImageData(W, H), cd = color.data;
  const hgt = new Float32Array(W * H);
  const cW = RGB8(HEX.white), cG = RGB8(HEX.grey), cT = RGB8(HEX.teal), cO = RGB8(HEX.orange);
  const mix3 = (A, B, t) => [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)];
  for (let col = 0; col < W; col++) {
    const u = (col + 0.5) / W;
    const key = u < 0.5 ? 'wing' : u < 0.625 ? 'stab' : u < 0.75 ? 'elev' : u < 0.875 ? 'fin' : 'rud';
    const [u0, u1, a, b] = ATLAS[key];
    const s = a + ((u - u0) / (u1 - u0)) * (b - a);
    for (let row = 0; row < H; row++) {
      const v = 1 - (row + 0.5) / H;
      const f = Math.abs(v - 0.5) * 2, lower = v > 0.5;
      let c = key === 'wing' && lower ? cG : cW;
      if (key === 'wing') c = mix3(c, cO, clamp((s - 6.35) / 0.012 + 0.5, 0, 1));
      else if (key === 'stab' || key === 'elev') c = mix3(c, cO, clamp((s - 2.12) / 0.01 + 0.5, 0, 1));
      else {
        const F = key === 'fin' ? finFrame(s) : rudFrame(s);
        const z = (key === 'rud' ? RUD_Z : 0) + F.le.z - f * F.chord;
        const d = finStripe(s, z);
        c = mix3(c, cO, clamp((d - 0.3) / 0.006 + 0.5, 0, 1));
        c = mix3(c, cT, clamp((d - 0.47) / 0.006 + 0.5, 0, 1));
        c = mix3(c, cW, clamp((d - 0.74) / 0.006 + 0.5, 0, 1));
      }
      const i = row * W + col;
      const h = feat[i * 4] / 255;
      let mul = (1 + (h - 0.5) * 0.4) * (0.99 + 0.02 * Math.sin(s * 2.3 + f * 7.1));
      if (lower) mul *= 1 - 0.05 * smoothstep(0.6, 1, f);
      cd[i * 4] = c[0] * mul; cd[i * 4 + 1] = c[1] * mul; cd[i * 4 + 2] = c[2] * mul; cd[i * 4 + 3] = 255;
      hgt[i] = h;
    }
  }
  return { color: imageTexture(color, true, 8, 0.5), normal: imageTexture(normalImage(hgt, W, H, 3.0), false, 8) };
}

// ==================================================================== floats
const FZ0 = -3.65, FZ1 = 4.35;
const FLOAT_CTRL = [
  // z, half width, keel, chine, deck
  [4.30, 0.03, -1.66, -1.64, -1.62],
  [4.15, 0.13, -1.72, -1.67, -1.58],
  [3.90, 0.25, -1.80, -1.73, -1.56],
  [3.50, 0.34, -1.89, -1.81, -1.55],
  [3.00, 0.385, -1.98, -1.88, -1.55],
  [2.40, 0.40, -2.08, -1.94, -1.55],
  [2.00, 0.40, -2.15, -1.97, -1.55],
  [0.50, 0.40, -2.16, -1.98, -1.55],
  [-0.42, 0.40, -2.16, -1.98, -1.55],
  [-0.45, 0.39, -2.08, -1.97, -1.55],
  [-1.20, 0.37, -2.03, -1.95, -1.55],
  [-2.20, 0.31, -1.97, -1.91, -1.555],
  [-3.00, 0.21, -1.92, -1.87, -1.565],
  [-3.45, 0.11, -1.88, -1.84, -1.58],
  [-3.62, 0.03, -1.82, -1.80, -1.60],
];
function floatStation(z) {
  const S = FLOAT_CTRL;
  let i = 0;
  while (i < S.length - 2 && z < S[i + 1][0]) i++;
  const a = S[i], b = S[i + 1];
  const t = clamp((a[0] - z) / (a[0] - b[0]), 0, 1);
  return [z, lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t), lerp(a[4], b[4], t)];
}
// half section from the deck centreline to the keel (port half), 15 points
function floatProfile([, hw, keel, chine, deck]) {
  const crown = 0.025 * clamp(hw / 0.4, 0, 1), top = deck - 0.055 * clamp(hw / 0.3, 0.3, 1);
  const L = (a) => lerp(top, chine, a);
  return [[0, deck + crown], [0.35 * hw, deck + crown * 0.85], [0.7 * hw, deck + crown * 0.45], [0.9 * hw, deck], [0.985 * hw, deck - (deck - top) * 0.36], [hw, top],
    [1.005 * hw, L(0.3)], [1.01 * hw, L(0.46)], [1.012 * hw, L(0.56)], [1.02 * hw, L(0.85)], [1.035 * hw, chine], [0.97 * hw, chine - 0.012 * clamp(hw / 0.3, 0, 1)],
    [0.55 * hw, lerp(chine, keel, 0.55)], [0.12 * hw, keel + 0.008], [0, keel]];
}
function floatZs() {
  const out = [];
  for (const [a, b, n] of [[4.3, 3.0, 16], [3.0, -0.42, 20], [-0.45, -3.0, 18], [-3.0, -3.62, 8]]) for (let i = 0; i <= n; i++) out.push(Math.round((a + (b - a) * (i / n)) * 1e4) / 1e4);
  return [...new Set(out)].sort((p, q) => q - p);
}
function buildFloatGeo(side) {
  const zs = floatZs();
  const N = 29;
  const pos = [], uv = [], idx = [];
  const loops = [];
  for (const z of zs) {
    const prof = floatProfile(floatStation(z));
    const loop = [...prof, ...prof.slice(0, -1).reverse().map(([x, y]) => [-x, y])];
    loops.push(loop);
    loop.forEach(([x, y], k) => { pos.push(side * 1.55 + x, y, z); uv.push((z - FZ0) / (FZ1 - FZ0), k / 28); });
  }
  for (let i = 0; i < zs.length - 1; i++) for (let k = 0; k < N - 1; k++) { const a = i * N + k, b = a + 1, c = a + N + 1, d = a + N; idx.push(a, b, d, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mid = Math.floor(zs.length / 2);
  orient(g, V3(1, 0, 0), mid * N + 7);
  const n = g.attributes.normal;
  for (let i = 0; i < zs.length; i++) {
    const a = i * N, b = i * N + N - 1;
    const v = V3(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z); n.setXYZ(b, v.x, v.y, v.z);
  }
  // close bow and stern
  const caps = [g];
  for (const [i, dir] of [[0, 1], [zs.length - 1, -1]]) {
    const loop = loops[i], z = zs[i];
    const cen = loop.reduce((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]).map((v) => v / loop.length);
    const p = [side * 1.55 + cen[0], cen[1], z], u = [];
    const cu = [(z - FZ0) / (FZ1 - FZ0), 0.5];
    u.push(...cu);
    for (const [x, y] of loop) { p.push(side * 1.55 + x, y, z); u.push(...cu); }
    const ci = [];
    for (let k = 1; k < loop.length; k++) ci.push(0, k, k + 1);
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
    cg.setIndex(ci);
    cg.computeVertexNormals();
    caps.push(orient(cg, V3(0, 0, dir), 0));
  }
  return mergeGeometries(caps);
}

function floatTextures() {
  const W = 2048, H = 512;
  const fc = makeCanvas(W, H), fg = fc.getContext('2d', { willReadFrequently: true });
  fg.fillStyle = '#808080';
  fg.fillRect(0, 0, W, H);
  const px = (z) => ((z - FZ0) / (FZ1 - FZ0)) * W, py = (k) => (1 - k / 28) * H;
  const dot = (x, y, r = 1.4, shade = 166) => { fg.fillStyle = `rgb(${shade},${shade},${shade})`; fg.beginPath(); fg.arc(x, y, r, 0, TAU); fg.fill(); };
  const seamH = (k, shade = 92) => { fg.strokeStyle = `rgb(${shade},${shade},${shade})`; fg.lineWidth = 1.5; fg.beginPath(); fg.moveTo(0, py(k)); fg.lineTo(W, py(k)); fg.stroke(); };
  // bulkheads, chine and deck-edge rivet rows, keel strip
  for (let z = -3.0; z < 3.9; z += 0.55) for (let k = 3.4; k <= 24.6; k += 0.42) dot(px(z), py(k));
  for (const k of [3.5, 10, 18, 24.5]) for (let z = -3.5; z < 4.2; z += 0.04) dot(px(z), py(k));
  for (const k of [13.55, 14.45]) seamH(k);
  for (let z = -3.4; z < 4.1; z += 0.05) dot(px(z), py(14));
  const feat = fg.getImageData(0, 0, W, H).data;
  const color = new ImageData(W, H), cd = color.data;
  const hgt = new Float32Array(W * H);
  const cW = RGB8(HEX.white), cT = RGB8(HEX.teal), cO = RGB8(HEX.orange), cB = RGB8(HEX.bottom), cN = RGB8(HEX.nonskid);
  for (let col = 0; col < W; col++) {
    const u = (col + 0.5) / W, z = FZ0 + u * (FZ1 - FZ0);
    for (let row = 0; row < H; row++) {
      const k = (1 - (row + 0.5) / H) * 28;
      const kk = k > 14 ? 28 - k : k; // symmetric about the keel
      const i = row * W + col;
      let h = feat[i * 4] / 255;
      const band = (k0) => clamp((kk - k0) / 0.03 + 0.5, 0, 1);
      let c = cW;
      const mixc = (A, B, t) => [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)];
      c = mixc(c, cO, band(7)); c = mixc(c, cT, band(8)); c = mixc(c, cB, band(10));
      let mul = 1;
      // waterline staining, a little algae near the chine, scuffs on the bow
      mul *= 1 - 0.18 * Math.exp(-(((kk - 9.25) / 0.45) ** 2));
      if (kk > 9.2 && kk < 10.2) { c = mixc(c, [70, 92, 74], 0.18 * (1 - Math.abs(kk - 9.7) / 0.5)); }
      if (kk > 10) mul *= 0.9 + 0.12 * hash(col * 3.1 + row * 0.7);
      if (u > 0.88 && kk > 6) mul *= 1 - 0.1 * hash(Math.floor(col / 3) * 1.7 + Math.floor(row / 2));
      // non-skid walkway on the deck
      if (kk < 1.25 && z > -2.5 && z < 3.3) { const sp = hash(col * 12.9898 + row * 78.233); c = mixc(cN, cN, 0); mul *= 0.85 + 0.3 * sp; h += (sp - 0.5) * 0.25; }
      mul *= 1 + (h - 0.5) * 0.4;
      cd[i * 4] = c[0] * mul; cd[i * 4 + 1] = c[1] * mul; cd[i * 4 + 2] = c[2] * mul; cd[i * 4 + 3] = 255;
      hgt[i] = h;
    }
  }
  return { color: imageTexture(color, true, 8, 0.5), normal: imageTexture(normalImage(hgt, W, H, 3.0), false, 8) };
}

/** Streamlined (teardrop) strut from A to B, chord along the flight direction. */
function aeroStrut(a, b, chord, thick, rgb) {
  const A = V3(...a), B = V3(...b);
  const dir = B.clone().sub(A).normalize();
  const fwd = V3(0, 0, 1);
  const cd = fwd.clone().addScaledVector(dir, -fwd.dot(dir)).normalize().negate();
  const td = V3().crossVectors(dir, cd).normalize();
  const t = thick / chord, N = 8;
  const fr = [];
  for (let k = 0; k <= N; k++) fr.push((1 - Math.cos((k / N) * Math.PI)) / 2);
  const loop = [...fr.map((f) => [f, 1]), ...fr.slice(1, -1).reverse().map((f) => [f, -1])];
  const pos = [], idx = [];
  for (const E of [A, B]) for (const [f, sd] of loop) { const q = E.clone().addScaledVector(cd, (f - 0.35) * chord).addScaledVector(td, sd * airfoilT(f, t) * chord); pos.push(q.x, q.y, q.z); }
  const L = loop.length;
  for (let k = 0; k < L; k++) { const k1 = (k + 1) % L; idx.push(k, k1, k + L, k1, k1 + L, k + L); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  orient(g, td, Math.floor(N / 2));
  return part(g, rgb);
}

// ==================================================================== propeller
function bladeGeometry() {
  const R0 = 0.16, R1 = 1.28, NS = 18, NP = 10;
  const pos = [], col = [], idx = [];
  const loopN = NP * 2;
  for (let i = 0; i <= NS; i++) {
    const s = (i / NS) ** 0.85, r = lerp(R0, R1, s);
    let chord = s < 0.12 ? lerp(0.075, 0.115, s / 0.12) : 0.115 + 0.065 * Math.sin((Math.min(1, (s - 0.12) / 0.6) * Math.PI) / 2) - 0.03 * smoothstep(0.7, 0.95, s);
    if (s > 0.86) chord *= Math.sqrt(Math.max(0.02, 1 - ((s - 0.86) / 0.14) ** 2));
    const tr = s < 0.12 ? lerp(0.85, 0.22, s / 0.12) : lerp(0.2, 0.06, (s - 0.12) / 0.88);
    const beta = lerp(0.95, 0.28, s);
    const cb = Math.cos(beta), sb = Math.sin(beta);
    const rgb = s > 0.93 ? ORANGE : C(0x161718);
    for (let k = 0; k < loopN; k++) {
      // loop: upper LE → TE, then lower TE → LE
      const up = k < NP;
      const kk = up ? k : loopN - 1 - k;
      const f = (1 - Math.cos((kk / (NP - 1)) * Math.PI)) / 2;
      const w = (up ? 1 : -1) * airfoilT(f, tr) * chord + (up ? 0.012 * chord * Math.sin(f * Math.PI) : 0);
      const q = (f - 0.5) * chord;
      pos.push(q * cb + w * sb, r, -q * sb + w * cb);
      col.push(...rgb);
    }
  }
  for (let i = 0; i < NS; i++) for (let k = 0; k < loopN; k++) { const k1 = (k + 1) % loopN; const a = i * loopN + k, b = i * loopN + k1, c = b + loopN, d = a + loopN; idx.push(a, b, d, b, c, d); }
  // tip cap
  const tipC = pos.length / 3;
  let cx = 0, cy = 0, cz = 0;
  for (let k = 0; k < loopN; k++) { const j = (NS * loopN + k) * 3; cx += pos[j]; cy += pos[j + 1]; cz += pos[j + 2]; }
  pos.push(cx / loopN, cy / loopN + 0.004, cz / loopN); col.push(...ORANGE);
  for (let k = 0; k < loopN; k++) idx.push(tipC, NS * loopN + k, NS * loopN + ((k + 1) % loopN));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  orient(g, V3(0, 0, 1).applyAxisAngle(V3(0, 1, 0), 0), Math.floor(NS / 2) * loopN + Math.floor(NP / 2));
  const blades = [];
  for (let k = 0; k < 3; k++) { const c = g.clone(); c.rotateZ((k / 3) * TAU); blades.push(c); }
  return mergeGeometries(blades);
}

function propDiscTexture() {
  const S = 512;
  const cv = makeCanvas(S, S);
  const g = cv.getContext('2d');
  const R = S / 2;
  const grd = g.createRadialGradient(R, R, R * 0.12, R, R, R);
  grd.addColorStop(0, 'rgba(18,18,18,0)');
  grd.addColorStop(0.18, 'rgba(22,22,22,0.16)');
  grd.addColorStop(0.55, 'rgba(24,24,24,0.13)');
  grd.addColorStop(0.9, 'rgba(26,26,26,0.08)');
  grd.addColorStop(0.925, 'rgba(220,100,40,0.22)');
  grd.addColorStop(0.985, 'rgba(220,100,40,0.12)');
  grd.addColorStop(1, 'rgba(220,100,40,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  // three blade ghosts smeared through an arc (the eye's persistence at a few hundred rpm)
  g.translate(R, R);
  for (let k = 0; k < 3; k++) {
    for (let a = 0; a < 0.9; a += 0.03) {
      g.save();
      g.rotate((k / 3) * TAU + a);
      g.fillStyle = `rgba(14,14,14,${0.05 * Math.exp(-a * 4)})`;
      g.beginPath(); g.moveTo(-5, -R * 0.14); g.lineTo(-11, -R * 0.96); g.lineTo(11, -R * 0.96); g.lineTo(5, -R * 0.14); g.fill();
      g.restore();
    }
  }
  return canvasTexture(cv, true, 4);
}

// ==================================================================== decals
function crackTexture(seed = 3) {
  const S = 512;
  const cv = makeCanvas(S, S);
  const g = cv.getContext('2d');
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const star = (cx, cy, arms, len) => {
    for (let a = 0; a < arms; a++) {
      let x = cx, y = cy, ang = (a / arms) * TAU + r() * 0.5;
      g.beginPath(); g.moveTo(x, y);
      const steps = 6 + Math.floor(r() * 6);
      for (let k = 0; k < steps; k++) {
        ang += (r() - 0.5) * 0.7;
        const l = ((len * (0.3 + r() * 0.5)) / steps) * 2;
        x += Math.cos(ang) * l; y += Math.sin(ang) * l;
        g.lineTo(x, y);
        if (r() < 0.2) g.moveTo(x, y);
      }
      g.stroke();
    }
    for (let k = 1; k < 4; k++) { g.beginPath(); g.arc(cx, cy, k * len * 0.12, r() * 6, r() * 6 + 1.2 + r() * 2); g.stroke(); }
  };
  g.strokeStyle = 'rgba(235,245,250,0.85)';
  g.lineWidth = 1.4;
  star(S * 0.62, S * 0.42, 9, S * 0.45);
  g.lineWidth = 1.0;
  star(S * 0.3, S * 0.6, 7, S * 0.28);
  return canvasTexture(cv, true, 4);
}

function registrationTexture(text) {
  const cv = makeCanvas(512, 128);
  const g = cv.getContext('2d');
  g.fillStyle = '#1b2224';
  g.font = 'bold 92px "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(text, 256, 68);
  return canvasTexture(cv, true, 4);
}

/** Registration painted on the curved tail cone (a grid that follows the skin). */
function registrationGeometry(side) {
  const pos = [], uv = [], idx = [];
  const NZ = 16, NY = 4, zc = -2.62, half = 0.74, y0 = 0.535, y1 = 0.905;
  for (let i = 0; i <= NZ; i++) {
    const z = zc + half - (2 * half * i) / NZ;
    for (let j = 0; j <= NY; j++) {
      const y = lerp(y0, y1, j / NY);
      pos.push(side * (skinX(z, y) + 0.003), y, z);
      // read nose → tail on the port side, tail → nose on the starboard side
      uv.push(side > 0 ? i / NZ : 1 - i / NZ, j / NY);
    }
  }
  for (let i = 0; i < NZ; i++) for (let j = 0; j < NY; j++) { const a = i * (NY + 1) + j, b = a + NY + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return orient(g, V3(side, 0, 0), 2 * (NY + 1) + 2);
}

// ==================================================================== materials
function skinMaterial({ map = null, normalMap = null, alphaTest = 0, roughness = 0.3, normalScale = 0.55, clearcoat = 0.5 }) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map, normalMap, normalScale: new THREE.Vector2(normalScale, normalScale), alphaTest,
    roughness, metalness: 0.05, clearcoat, clearcoatRoughness: 0.22, envMapIntensity: 1.0,
  });
  patchMaterial(m, { wet: 0.45, key: 'planeSkin' });
  return m;
}
function plainMaterial({ roughness = 0.4, metalness = 0.05, key, ...rest }) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, metalness, vertexColors: true, ...rest });
  patchMaterial(m, { wet: 0.4, key });
  return m;
}

// ==================================================================== build
export function buildSeaplane() {
  const root = new THREE.Group();
  root.name = 'seaplane';
  const timing = {};
  let t0 = performance.now();
  const fusTex = fuselageTextures();
  timing.fuselage = performance.now() - t0; t0 = performance.now();
  const surfTex = surfaceTextures();
  timing.surfaces = performance.now() - t0; t0 = performance.now();
  const floatTex = floatTextures();
  timing.floats = performance.now() - t0; t0 = performance.now();
  const skinF = skinMaterial({ map: fusTex.color, normalMap: fusTex.normal, alphaTest: 0.5 });
  const skinW = skinMaterial({ map: surfTex.color, normalMap: surfTex.normal });
  const skinFl = skinMaterial({ map: floatTex.color, normalMap: floatTex.normal, roughness: 0.4, normalScale: 0.5, clearcoat: 0.22 });
  const paint = plainMaterial({ roughness: 0.32, key: 'planePaint' });
  const alu = plainMaterial({ roughness: 0.42, metalness: 0.45, key: 'planeAlu' });
  const dark = plainMaterial({ roughness: 0.58, metalness: 0.15, key: 'planeDark' });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe4e8e9, roughness: 0.1, metalness: 1, envMapIntensity: 1.3 });
  patchMaterial(chrome, { wet: 0.2, key: 'planeChrome' });
  const lens = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0, vertexColors: true, emissive: 0x000000 });
  // cabin trim: light enough to read in the shade of the wing, with light bouncing around inside
  const cabin = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0, vertexColors: true, side: THREE.DoubleSide, emissive: 0x23211e, emissiveIntensity: 1 });
  patchMaterial(cabin, { wet: 0, canopy: false, caustics: false, key: 'planeCabin' });
  const liningMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, emissive: 0x2a2825, emissiveIntensity: 1, alphaMap: fusTex.lining, alphaTest: 0.5 });
  patchMaterial(liningMat, { wet: 0, canopy: false, caustics: false, key: 'planeLining' });
  // glass: see-through head on, mirror-like at grazing angles
  const glass = new THREE.MeshStandardMaterial({ color: 0x9cb2b6, roughness: 0.04, metalness: 0.05, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide, alphaMap: fusTex.glass, envMapIntensity: 1.6 });
  patchMaterial(glass, {
    wet: 0, canopy: false, caustics: false, key: 'planeGlass',
    fragment: (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `{
  float _ndv = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
  float _fr = pow(1.0 - _ndv, 4.0);
  diffuseColor.a *= mix(1.0, 0.8 / max(opacity, 0.02), _fr);
}
#include <opaque_fragment>`);
    },
  });
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.48, metalness: 0.2, vertexColors: true, transparent: true, opacity: 1 });
  patchMaterial(bladeMat, { wet: 0.3, key: 'planeBlade' });

  const mk = (geo, mat, { cast = true, receive = true } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast; m.receiveShadow = receive;
    m.layers.set(LAYER.WORLD);
    return m;
  };

  // ---- fuselage group: shell, cowling, engine and propeller, tail, cabin
  const fus = new THREE.Group();
  fus.name = 'fuselage';
  const shellHi = mk(buildShell({ fine: true }), skinF);
  const shellLo = mk(buildShell({ fine: false, segs: 32 }), skinF);
  shellLo.visible = false;
  fus.add(shellHi, shellLo);
  fus.add(mk(buildNoseCap(), skinF));
  // glass: only the part of the shell around the openings
  const sideGlass = (x, y, z) => Math.abs(x) > 0.4 && y > 0.43 && y < 1.12 && z > -1.36 && z < 1.93;
  const topGlass = (x, y, z) => y > 0.75 && z > 1.92 && z < 2.4 && Math.abs(x) < 0.66;
  const ws = mk(buildShell({ fine: true, inset: 0.006, z0: -1.4, z1: 2.42, keep: (x, y, z) => sideGlass(x, y, z) || topGlass(x, y, z) }), glass, { cast: false, receive: false });
  ws.renderOrder = 2;
  fus.add(ws);
  const crackMat = new THREE.MeshBasicMaterial({ map: crackTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const cracks = mk(buildShell({ fine: true, inset: 0.004, z0: 1.9, z1: 2.42, keep: topGlass, uvFn: (x, y, z) => [(x + 0.6) / 1.2, (z - 1.92) / 0.48] }), crackMat, { cast: false, receive: false });
  cracks.renderOrder = 3;
  cracks.visible = false;
  fus.add(cracks);

  // cowling front: two round intakes either side of the spinner, the induction air box below
  const cowl = [];
  for (const sx of [1, -1]) {
    const c = new THREE.CircleGeometry(0.074, 28);
    c.translate(sx * 0.285, 0.19, ZMAX + 0.037);
    cowl.push(part(c, C(0x08090a)));
  }
  const ind = new THREE.PlaneGeometry(0.17, 0.06);
  ind.translate(0, -0.1, ZMAX + 0.037);
  cowl.push(part(ind, C(0x08090a)));
  // cowl flaps / air exit under the firewall, exhaust stack on the right
  cowl.push(box(0.5, 0.02, 0.12, 0, -0.55, 2.47, DARK, { rx: -0.25 }));
  cowl.push(cyl([-0.34, -0.47, 2.62], [-0.38, -0.6, 2.36], 0.034, C(0x4a3a2e), 12));
  cowl.push(cyl([-0.38, -0.6, 2.36], [-0.385, -0.605, 2.3], 0.03, C(0x1a1410), 12, 0.026));
  fus.add(mk(mergeGeometries(cowl), dark, { cast: false }));
  const lips = [];
  for (const sx of [1, -1]) {
    const t = new THREE.TorusGeometry(0.076, 0.012, 8, 28);
    t.translate(sx * 0.285, 0.19, ZMAX + 0.036);
    lips.push(part(t, WHITE));
  }
  // wing root fairing over the windshield header
  lips.push(box(1.08, 0.075, 0.2, 0, 1.222, 1.9, WHITE, { round: 0.03 }));
  fus.add(mk(mergeGeometries(lips), paint, { cast: false }));

  // spinner + propeller (rotates about Z)
  const prop = new THREE.Group();
  prop.position.set(0, 0.12, 3.55);
  const spinPts = [];
  for (let i = 0; i <= 20; i++) { const t = i / 20; spinPts.push(new THREE.Vector2(Math.max(0.001, 0.2 * Math.pow(Math.max(0, 1 - t ** 1.9), 0.55)), t * 0.455)); }
  const spinner = new THREE.LatheGeometry(spinPts, 36);
  spinner.rotateX(Math.PI / 2);
  prop.add(mk(spinner, chrome));
  const back = new THREE.CylinderGeometry(0.205, 0.205, 0.018, 36);
  back.rotateX(Math.PI / 2);
  back.translate(0, 0, -0.006);
  prop.add(mk(part(back, DARK), dark, { cast: false }));
  const blades = new THREE.Group();
  const bladeMesh = mk(bladeGeometry(), bladeMat);
  bladeMesh.position.z = 0.1;
  blades.add(bladeMesh);
  prop.add(blades);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.3, 64), new THREE.MeshBasicMaterial({ map: propDiscTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.z = 0.1;
  disc.layers.set(LAYER.WORLD);
  disc.renderOrder = 4;
  prop.add(disc);
  fus.add(prop);

  // tail surfaces
  const sTail = linspace(0, 2.5, 14);
  fus.add(mk(mergeGeometries([1, -1].map((sg) => liftSurface({ spans: sTail, frame: stabFrame(sg), c0: 0, c1: 0.68, t: 0.09, uvOf: atlasUV('stab'), capStart: false }))), skinW));
  const elevator = new THREE.Group();
  elevator.position.set(0, STAB_Y, ELEV_Z);
  elevator.add(mk(mergeGeometries([1, -1].map((sg) => liftSurface({ spans: sTail, frame: elevFrame(sg), c0: 0.7, c1: 1, n: 10, t: 0.09, uvOf: atlasUV('elev'), capStart: false }))), skinW));
  fus.add(elevator);
  const finG = liftSurface({ spans: linspace(0.62, 2.32, 14), frame: finFrame, c0: 0, c1: 0.64, t: 0.1, uvOf: atlasUV('fin') });
  const dorsal = liftSurface({
    spans: linspace(0.9, 1.3, 4), t: 0.08, uvOf: () => [0.76, 0.5],
    frame: (y) => { const le = lerp(-2.3, -3.58, (y - 0.9) / 0.4); return { le: V3(0, y, le), back: V3(0, 0, -1), up: V3(1, 0, 0), chord: le + 3.62 + (y - 0.9) * 0.5 + 0.2, thick: 1, span: y }; },
  });
  fus.add(mk(mergeGeometries([finG, dorsal]), skinW));
  const rudder = new THREE.Group();
  rudder.position.set(0, 0, RUD_Z);
  rudder.add(mk(liftSurface({ spans: linspace(0.45, 2.33, 16), frame: rudFrame, c0: 0.66, c1: 1, n: 10, t: 0.1, uvOf: atlasUV('rud') }), skinW));
  fus.add(rudder);

  // registration on both sides of the tail cone
  const regMat = new THREE.MeshStandardMaterial({ map: registrationTexture('PT-ILH'), transparent: true, depthWrite: false, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const side of [1, -1]) {
    const reg = new THREE.Mesh(registrationGeometry(side), regMat);
    reg.layers.set(LAYER.WORLD);
    reg.renderOrder = 1;
    fus.add(reg);
  }

  // exterior detail: door handles, antennas, beacon, static wicks, tie-down
  const det = [];
  for (const side of [1, -1]) {
    for (const [z, y] of [[1.0, 0.36], [-0.36, 0.36]]) {
      const x = side * (skinX(z, y) + 0.018);
      det.push(box(0.012, 0.022, 0.11, x, y, z, C(0x2a2d2f), { round: 0.005 }));
    }
    det.push(box(0.018, 0.012, 0.012, side * (skinX(-5.3, 0.62) + 0.004), 0.62, -5.3, DARK));
  }
  det.push(cyl([0, 1.18, -0.55], [0, 1.7, -0.92], 0.006, C(0x1c1d1e), 6, 0.003));
  det.push(box(0.012, 0.16, 0.13, 0, 1.13, -2.55, C(0x24272a), { rx: -0.45, round: 0.005 }));
  det.push(cyl([0, 1.2, 0.15], [0, 2.3, -4.45], 0.003, C(0x222222), 4));
  const fusDetail = mk(mergeGeometries(det), dark, { cast: false });
  fus.add(fusDetail);
  const beaconLens = new THREE.SphereGeometry(0.03, 12, 8);
  beaconLens.scale(1, 0.7, 1.6);
  beaconLens.translate(0, 2.335, -4.6);
  const lensGeos = [part(beaconLens, C(0x9a1a12))];

  // ---- cabin: lining, bulkheads, floor, seats, panel, controls
  const interior = new THREE.Group();
  interior.name = 'cabin';
  const liningG = buildShell({ fine: true, inset: 0.028, inward: true, z0: -1.4, z1: 2.4, segs: 48 });
  {
    const P = liningG.attributes.position, col = new Float32Array(P.count * 3);
    const head = C(0xcfc9bb), wall = C(0xaaa395), low = C(0x56524b);
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i);
      const a = smoothstep(0.98, 1.12, y), b = smoothstep(0.18, 0.3, y);
      for (let k = 0; k < 3; k++) col[i * 3 + k] = lerp(lerp(low[k], wall[k], b), head[k], a);
    }
    liningG.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const lining = mk(liningG, liningMat, { cast: false });
  fus.add(lining);
  const cab = [];
  for (const [z, flip] of [[2.39, true], [-1.39, false]]) {
    const sec = fuselageSection(z);
    const shape = new THREE.Shape();
    for (let j = 0; j <= 32; j++) { const [x, y] = ringPoint(sec, (j / 32) * TAU, 0.03); if (j === 0) shape.moveTo(x, y); else shape.lineTo(x, y); }
    const g = new THREE.ShapeGeometry(shape, 1);
    if (flip) g.rotateY(Math.PI);
    g.translate(0, 0, z);
    cab.push(part(g, C(0x3b3934)));
  }
  cab.push(box(1.24, 0.04, 3.7, 0, -0.47, 0.5, C(0x24221f)));
  const leather = C(0x9a7a52), leatherDark = C(0x7d6142), frameC = C(0x2a2a2a);
  const seat = (x, z, w = 0.46) => {
    cab.push(box(w, 0.12, 0.5, x, -0.04, z, leather, { round: 0.04 }));
    cab.push(box(w, 0.64, 0.1, x, 0.32, z - 0.29, leather, { rx: 0.2, round: 0.04 }));
    cab.push(box(w * 0.92, 0.5, 0.02, x, 0.33, z - 0.235, leatherDark, { rx: 0.2 }));
    cab.push(box(w * 0.55, 0.15, 0.08, x, 0.72, z - 0.37, leather, { rx: 0.2, round: 0.035 }));
    cab.push(box(w * 0.7, 0.4, 0.05, x, -0.27, z, frameC));
    for (const rx of [-0.15, 0.15]) cab.push(box(0.03, 0.03, 0.62, x + rx * (w / 0.46), -0.44, z - 0.02, C(0x6c6e70)));
  };
  seat(0.33, 0.95); seat(-0.33, 0.95); seat(0, -0.3, 1.16);
  // armrests / door trim along both sides
  for (const side of [1, -1]) {
    cab.push(box(0.06, 0.05, 1.7, side * 0.6, 0.27, 0.55, C(0x55524c), { round: 0.02 }));
    for (const z of [1.2, -0.25]) cab.push(box(0.014, 0.02, 0.09, side * 0.62, 0.42, z, C(0x9a9a98)));
  }
  // glareshield, panel housing, pedestal, rudder pedals, overhead console and sun visors
  cab.push(box(1.28, 0.05, 0.26, 0, 0.845, 2.12, C(0x151617), { round: 0.02 }));
  cab.push(box(1.24, 0.58, 0.1, 0, 0.56, 2.19, C(0x1b1c1d), { rx: -0.16 }));
  cab.push(box(0.17, 0.42, 0.32, 0, 0.1, 1.98, C(0x1b1c1d), { round: 0.02 }));
  for (const x of [0.43, 0.23, -0.23, -0.43]) cab.push(box(0.07, 0.14, 0.02, x, -0.32, 2.12, C(0x2b2c2d), { rx: -0.6 }));
  cab.push(box(0.22, 0.03, 0.8, 0, 1.155, 1.2, C(0x3a3935), { round: 0.012 }));
  for (const x of [0.3, -0.3]) cab.push(box(0.3, 0.008, 0.14, x, 1.145, 1.72, C(0x8c8577), { rx: 0.25, round: 0.003 }));
  // engine controls beside the throttle (propeller blue, mixture red)
  for (const [x, rgb] of [[0.055, C(0x1d3f8a)], [-0.055, C(0x8f1d18)]]) {
    cab.push(cyl([x, 0.3, 2.1], [x, 0.3, 1.98], 0.006, C(0x8a8a8a), 6));
    const k = new THREE.SphereGeometry(0.02, 10, 8); k.translate(x, 0.3, 1.97); cab.push(part(k, rgb));
  }
  interior.add(mk(mergeGeometries(cab), cabin, { cast: false }));

  // instrument panel face (drawn by Seaplane._drawPanel)
  const panelCanvas = makeCanvas(1024, 448);
  const panelTex = canvasTexture(panelCanvas, true, 4);
  const panelMat = new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.55, metalness: 0, emissive: 0xffffff, emissiveMap: panelTex, emissiveIntensity: 0.06 });
  const panelFace = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.525), panelMat);
  panelFace.rotation.set(-0.16, Math.PI, 0);
  panelFace.position.set(0, 0.56, 2.125);
  panelFace.layers.set(LAYER.WORLD);
  interior.add(panelFace);

  // magnetic compass on the glareshield
  const compass = new THREE.Group();
  compass.position.set(0, 0.935, 2.06);
  const housingC = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.09), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5 }));
  housingC.layers.set(LAYER.WORLD);
  const cardCanvas = makeCanvas(512, 64);
  const cg = cardCanvas.getContext('2d');
  cg.fillStyle = '#111'; cg.fillRect(0, 0, 512, 64);
  cg.fillStyle = '#f2efe6'; cg.font = 'bold 26px Arial'; cg.textAlign = 'center'; cg.textBaseline = 'middle';
  const lab = ['N', '3', '6', 'E', '12', '15', 'S', '21', '24', 'W', '30', '33'];
  for (let k = 0; k < 36; k++) {
    const x = (k / 36) * 512;
    cg.fillRect(x - 1, 46, 2, k % 3 === 0 ? 16 : 9);
    if (k % 3 === 0) cg.fillText(lab[k / 3], x === 0 ? 14 : x, 24);
  }
  const cardTex = canvasTexture(cardCanvas, true, 4);
  cardTex.wrapS = THREE.RepeatWrapping;
  const card = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.03, 32, 1, true), new THREE.MeshBasicMaterial({ map: cardTex, color: 0xbbbbbb }));
  card.layers.set(LAYER.WORLD);
  card.position.set(0, 0, -0.01);
  compass.add(housingC, card);
  interior.add(compass);

  // yokes (pilot left, co-pilot right): ram's-horn wheels on sliding columns
  const yokes = [];
  const yokeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.25, vertexColors: true });
  for (const x of [0.33, -0.33]) {
    const yoke = new THREE.Group();
    yoke.position.set(x, 0.45, 1.84);
    const colG = cyl([0, 0, 0.36], [0, 0, 0.0], 0.016, C(0x8c8e90), 8);
    const col = new THREE.Mesh(colG, yokeMat);
    const wheel = new THREE.Group();
    const wg = [box(0.11, 0.05, 0.035, 0, 0, 0, C(0x1a1a1a), { round: 0.012 }), box(0.3, 0.028, 0.03, 0, -0.005, 0, C(0x1a1a1a), { round: 0.01 })];
    for (const sx of [1, -1]) {
      wg.push(cyl([sx * 0.15, -0.005, 0], [sx * 0.165, 0.11, 0.005], 0.018, C(0x161616), 8));
      const cap = new THREE.SphereGeometry(0.02, 8, 6); cap.translate(sx * 0.165, 0.112, 0.005); wg.push(part(cap, C(0x161616)));
    }
    const badge = new THREE.CylinderGeometry(0.022, 0.022, 0.006, 14); badge.rotateX(Math.PI / 2); badge.translate(0, 0, -0.02); wg.push(part(badge, C(0xa0451c)));
    const wm = new THREE.Mesh(mergeGeometries(wg), yokeMat);
    wheel.add(wm);
    yoke.add(col, wheel);
    yoke.traverse((o) => o.layers && o.layers.set(LAYER.WORLD));
    yoke.userData.wheel = wheel;
    yoke.userData.z0 = yoke.position.z;
    interior.add(yoke);
    yokes.push(yoke);
  }
  const throttle = new THREE.Group();
  throttle.position.set(0, 0.28, 1.95);
  const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.3 }));
  lever.position.y = 0.1;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 8), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }));
  knob.position.y = 0.2;
  throttle.add(lever, knob);
  throttle.traverse((o) => o.layers && o.layers.set(LAYER.WORLD));
  interior.add(throttle);
  const trimCrank = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 16), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5 }));
  trimCrank.scale.setScalar(0.6);
  trimCrank.position.set(0, 1.13, 0.7);
  trimCrank.layers.set(LAYER.WORLD);
  interior.add(trimCrank);
  fus.add(interior);

  // nav lights (port red on the left = +X, starboard green, tail white)
  const lights = new THREE.Group();
  const glowTex = (() => {
    const cv = makeCanvas(64, 64);
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  })();
  const nav = [];
  for (const [p, c] of [[[7.02, 1.42, 1.15], 0xff2a1a], [[-7.02, 1.42, 1.15], 0x2aff5a], [[0, 0.68, -5.38], 0xffffff]]) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(3) }));
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

  // ---- wings (each with its strut), flaps and ailerons
  const wingGroups = [];
  const flaps = [], ailerons = [];
  const wingDetails = [];
  for (const sgn of [1, -1]) {
    const wg = new THREE.Group();
    wg.name = sgn > 0 ? 'wingL' : 'wingR';
    const frame = wingFrame(sgn);
    const common = { frame, t: WING.t, m: WING.m, p: WING.p, uvOf: atlasUV('wing') };
    const main = mergeGeometries([
      liftSurface({ ...common, spans: linspace(0, 0.71, 3), c0: 0, c1: 1, capStart: false }),
      liftSurface({ ...common, spans: linspace(0.71, 6.72, 30), c0: 0, c1: WING.hinge - 0.005, capStart: false, capEnd: false }),
      liftSurface({ ...common, spans: [...linspace(6.72, 6.95, 5), 6.99, 7.0], c0: 0, c1: 1 }),
    ]);
    wg.add(mk(main, skinW));
    const surface = (s0, s1) => {
      const F = frame((s0 + s1) / 2);
      const H = F.le.clone().addScaledVector(F.back, WING.hinge * F.chord).addScaledVector(F.up, camberY(WING.hinge, WING.m, WING.p) * F.chord);
      const g = liftSurface({ ...common, spans: linspace(s0, s1, Math.max(4, Math.round((s1 - s0) / 0.25))), c0: WING.hinge + 0.004, c1: 1, n: 10 });
      g.translate(0, -H.y, -H.z);
      const grp = new THREE.Group();
      grp.position.set(0, H.y, H.z);
      grp.add(mk(g, skinW));
      wg.add(grp);
      return grp;
    };
    flaps.push(surface(0.73, 3.85));
    ailerons.push(surface(3.89, 6.71));
    // lift strut, fittings, fuel cap, pitot, flap and aileron hinge brackets
    const strutTop = surfacePoint(frame(3.1), 0.24, -1, WING.t, WING.m, WING.p);
    const strutRoot = [sgn * (skinX(1.22, -0.43) + 0.02), -0.43, 1.22];
    const wd = [aeroStrut(strutRoot, [strutTop.x, strutTop.y - 0.02, strutTop.z], 0.12, 0.034, WHITE)];
    const wdAlu = [];
    wdAlu.push(box(0.09, 0.05, 0.08, strutRoot[0] - sgn * 0.02, strutRoot[1], strutRoot[2], ALU, { round: 0.01 }));
    wdAlu.push(box(0.06, 0.05, 0.1, strutTop.x, strutTop.y - 0.01, strutTop.z, ALU, { round: 0.01 }));
    const cap = surfacePoint(frame(2.2), 0.18, 1, WING.t, WING.m, WING.p);
    const capG = new THREE.CylinderGeometry(0.035, 0.035, 0.012, 16); capG.translate(cap.x, cap.y + 0.004, cap.z);
    wdAlu.push(part(capG, ALU));
    if (sgn > 0) {
      const pt = surfacePoint(frame(4.6), 0.15, -1, WING.t, WING.m, WING.p);
      wdAlu.push(cyl([pt.x, pt.y - 0.02, pt.z - 0.25], [pt.x, pt.y - 0.06, pt.z + 0.32], 0.009, C(0xa8acad), 8));
      wdAlu.push(box(0.01, 0.05, 0.03, pt.x, pt.y - 0.03, pt.z - 0.22, C(0xa8acad)));
    }
    for (const s of [1.4, 3.2, 4.6, 6.2]) {
      const hp = surfacePoint(frame(s), WING.hinge - 0.02, -1, WING.t, WING.m, WING.p);
      wd.push(box(0.025, 0.06, 0.13, hp.x, hp.y - 0.025, hp.z - 0.03, C(0x8a8e90)));
    }
    // nav light lens on the wing tip
    const tip = frame(7.0);
    const lensG = new THREE.SphereGeometry(0.045, 12, 8); lensG.scale(1, 0.75, 1.5);
    lensG.translate(tip.le.x + sgn * 0.01, tip.le.y + 0.0, 1.15);
    lensGeos.push(part(lensG, sgn > 0 ? C(0xb8231a) : C(0x1e9a42)));
    wg.add(mk(mergeGeometries(wd), paint));
    const wdm = mk(mergeGeometries(wdAlu), alu, { cast: false });
    wg.add(wdm);
    wingDetails.push(wdm);
    root.add(wg);
    wingGroups.push(wg);
  }
  const lensBack = new THREE.SphereGeometry(0.03, 10, 6); lensBack.scale(1, 0.8, 1); lensBack.translate(0, 0.68, -5.4);
  lensGeos.push(part(lensBack, C(0xd8d8d0)));
  fus.add(mk(mergeGeometries(lensGeos), lens, { cast: false }));

  // ---- floats (each with its struts, fittings and water rudder)
  const floatGroups = [];
  const waterRudders = [];
  const floatDetails = [];
  for (const sgn of [1, -1]) {
    const fg = new THREE.Group();
    fg.name = sgn > 0 ? 'floatL' : 'floatR';
    const fx = sgn * 1.55;
    fg.add(mk(buildFloatGeo(sgn), skinFl));
    const deckY = (z) => floatStation(z)[4] + 0.025 * clamp(floatStation(z)[1] / 0.4, 0, 1);
    // N-struts to the fuselage, spreader bars and bracing wires
    const fFront = [fx, deckY(2.05), 2.05], fRear = [fx, deckY(-0.3), -0.3];
    const bFront = [sgn * (skinX(2.05, -0.5) + 0.01), -0.5, 2.05], bRear = [sgn * (skinX(-0.45, -0.5) + 0.01), -0.5, -0.45];
    const st = [
      aeroStrut(fFront, bFront, 0.1, 0.032, ALU),
      aeroStrut(fRear, bRear, 0.1, 0.032, ALU),
      aeroStrut([fx, deckY(1.95), 1.95], bRear, 0.08, 0.026, ALU),
      cyl([fx, deckY(2.05) + 0.03, 2.05], [0, deckY(2.05) + 0.03, 2.05], 0.03, ALU, 12),
      cyl([fx, deckY(-0.3) + 0.03, -0.3], [0, deckY(-0.3) + 0.03, -0.3], 0.03, ALU, 12),
      cyl([fx, deckY(2.05) + 0.05, 2.0], [0, deckY(-0.3) + 0.05, -0.25], 0.004, STEEL, 4),
      cyl([fx * 0.96, deckY(2.05) + 0.05, 2.02], [sgn * 0.3, -0.56, 1.8], 0.004, STEEL, 4),
    ];
    // boarding step on the front strut
    const sp = V3(...fFront).lerp(V3(...bFront), 0.38);
    st.push(box(0.2, 0.012, 0.13, sp.x, sp.y, sp.z + 0.02, ALU));
    fg.add(mk(mergeGeometries(st), alu));
    // strut fittings, deck hatches, cleats, bow bumper, lift handle
    const fd = [];
    for (const z of [2.05, -0.3, 1.95]) fd.push(box(0.12, 0.04, 0.16, fx, deckY(z) + 0.015, z, C(0x8d9192), { round: 0.01 }));
    for (const z of [3.2, 2.5, 1.4, 0.5, -0.6, -1.6, -2.5]) {
      const h = new THREE.CylinderGeometry(0.06, 0.064, 0.012, 18); h.translate(fx, deckY(z) + 0.004, z); fd.push(part(h, C(0x2e3335)));
      const kb = new THREE.CylinderGeometry(0.015, 0.015, 0.012, 8); kb.translate(fx, deckY(z) + 0.014, z); fd.push(part(kb, C(0x15181a)));
    }
    for (const z of [3.6, -2.9]) {
      const y = deckY(z);
      fd.push(cyl([fx, y, z], [fx, y + 0.07, z], 0.018, DARK, 8));
      fd.push(cyl([fx, y + 0.07, z - 0.06], [fx, y + 0.07, z + 0.06], 0.012, DARK, 8));
    }
    const bump = new THREE.SphereGeometry(1, 14, 10); bump.scale(0.07, 0.06, 0.09); bump.translate(fx, -1.635, 4.29); fd.push(part(bump, RUBBER));
    fd.push(cyl([fx - 0.06, deckY(3.95) + 0.005, 3.95], [fx - 0.06, deckY(3.95) + 0.05, 3.95], 0.008, ALU, 6), cyl([fx + 0.06, deckY(3.95) + 0.005, 3.95], [fx + 0.06, deckY(3.95) + 0.05, 3.95], 0.008, ALU, 6), cyl([fx - 0.06, deckY(3.95) + 0.05, 3.95], [fx + 0.06, deckY(3.95) + 0.05, 3.95], 0.008, ALU, 6));
    const fdm = mk(mergeGeometries(fd), dark, { cast: false });
    fg.add(fdm);
    floatDetails.push(fdm);
    // water rudder (retracts up when the rudders are raised)
    const wr = new THREE.Group();
    wr.position.set(fx, -1.82, -3.5);
    const bladeShape = new THREE.Shape([new THREE.Vector2(0, 0.02), new THREE.Vector2(-0.05, -0.3), new THREE.Vector2(-0.24, -0.27), new THREE.Vector2(-0.2, 0.02)]);
    const bg = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
    bg.applyMatrix4(new THREE.Matrix4().set(0, 0, -1, 0.007, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
    const wrm = mk(mergeGeometries([part(bg, TEAL), cyl([0, 0.04, 0], [0, -0.04, 0], 0.012, STEEL, 8)]), paint);
    wr.add(wrm);
    fg.add(wr);
    waterRudders.push(wr);
    root.add(fg);
    floatGroups.push(fg);
  }

  // remember how everything was assembled so a wreck can be rebuilt
  const pieces = [fus, ...wingGroups, ...floatGroups];
  for (const p of pieces) p.userData.home = { position: p.position.clone(), quaternion: p.quaternion.clone() };

  // distance-based detail: cabin furniture up close, small fittings at mid range, a light shell far off
  let level = -1;
  const smallParts = [fusDetail, ...wingDetails, ...floatDetails];
  const updateLOD = (d) => {
    const edges = [55, 170, 280];
    let target = edges.findIndex((e) => d < e);
    if (target < 0) target = 3;
    if (level >= 0 && target !== level) {
      // hysteresis: only switch once clearly past the boundary
      const edge = edges[Math.min(target, level)];
      if (Math.abs(d - edge) < 6) target = level;
    }
    if (target === level) return;
    level = target;
    interior.visible = level === 0;
    for (const p of smallParts) p.visible = level <= 1;
    shellHi.visible = level <= 2;
    shellLo.visible = level === 3;
  };
  updateLOD(0);
  timing.geometry = performance.now() - t0;

  return {
    root, pieces,
    fuselage: fus, wings: wingGroups, floats: floatGroups,
    prop, propBase: prop.position.clone(), blades, bladeMat, disc, elevator, rudder, flaps, ailerons, waterRudders, yokes, throttle, trimCrank,
    compassCard: card, cracks, crackMat, lights, nav,
    panel: { canvas: panelCanvas, ctx: panelCanvas.getContext('2d'), texture: panelTex },
    eye: new THREE.Vector3(0.33, 1.06, 1.14),
    updateLOD, timing,
  };
}
