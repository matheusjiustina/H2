import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../core/MaterialPatch.js';
import { LAYER } from '../core/Shared.js';
import { lerp, smoothstep, clamp } from '../utils/MathUtils.js';
import {
  TAU, C, RGB8, HEX, WHITE, TEAL, ORANGE, DARK, ALU, RUBBER, STEEL, V3, hash,
  makeCanvas, canvasTexture, imageTexture, normalImage, sdPoly, orient, cyl, box, part,
  airfoilT, liftSurface, linspace, skinMaterial, plainMaterial,
} from './SeaplaneModel.js';

// Procedural light single-turbine helicopter in the H125 mould, built like the seaplane:
// a lofted cabin pod and tail boom with the livery, panel seams, rivets, doors, window
// openings and weathering baked into textures, a separate engine cowling with intake
// grilles and exhaust, a Starflex-style hub with three profiled, twisted blades, a
// two-blade tail rotor on the left of the fin, skids on arched cross tubes, and a
// furnished cockpit (pilot in the right seat) with working cyclics, collectives and
// pedals. Same livery as the seaplane: aviation white, deep teal, a restrained orange
// line, metal fittings and dark tinted glass. Registration PT-TDM.
// Body axes: +Z forward, +Y up, +X left. The origin is the centre of gravity under the
// mast; skids touch the ground at y = -1.47 and the rotor head sits at y = 1.62.

// ==================================================================== lofts
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** A lofted body: superellipse sections (z, half width, bottom, top, exponent) along z. */
class Loft {
  constructor(stations) {
    this.S = stations;
    this.zmax = stations[0][0];
    this.zmin = stations[stations.length - 1][0];
  }

  section(z) {
    const S = this.S;
    let i = 0;
    while (i < S.length - 2 && z < S[i + 1][0]) i++;
    const a = S[Math.max(0, i - 1)], b = S[i], c = S[i + 1], d = S[Math.min(S.length - 1, i + 2)];
    const t = clamp((b[0] - z) / (b[0] - c[0]), 0, 1);
    const f = (k) => catmull(a[k], b[k], c[k], d[k], t);
    return { hw: Math.max(0.01, f(1)), yb: f(2), yt: f(3), n: f(4) };
  }

  ring(sec, theta, inset = 0) {
    const s = Math.sin(theta), c = Math.cos(theta);
    const e = 2 / sec.n;
    const hw = sec.hw - inset, hy = (sec.yt - sec.yb) / 2 - inset, yc = (sec.yt + sec.yb) / 2;
    return [Math.sign(s) * hw * Math.abs(s) ** e, yc + Math.sign(c) * hy * Math.abs(c) ** e];
  }

  /** Half width of the skin at height y. */
  skinX(z, y) {
    const sec = this.section(z);
    const hy = (sec.yt - sec.yb) / 2, yc = (sec.yt + sec.yb) / 2, e = 2 / sec.n;
    const c = Math.abs(clamp((y - yc) / hy, -1, 1)) ** (1 / e);
    return sec.hw * Math.sqrt(Math.max(0, 1 - c * c)) ** e;
  }

  /** Top of the skin at lateral offset x. */
  skinY(z, x) {
    const sec = this.section(z);
    const hy = (sec.yt - sec.yb) / 2, yc = (sec.yt + sec.yb) / 2, e = 2 / sec.n;
    const s = Math.abs(clamp(x / sec.hw, -1, 1)) ** (1 / e);
    return yc + hy * Math.sqrt(Math.max(0, 1 - s * s)) ** e;
  }

  u(z) { return (z - this.zmin) / (this.zmax - this.zmin); }

  vSide(z, y, side) {
    const sec = this.section(z);
    const hy = (sec.yt - sec.yb) / 2, yc = (sec.yt + sec.yb) / 2, e = 2 / sec.n;
    const t = clamp((y - yc) / hy, -1, 1);
    const th = Math.acos(Math.sign(t) * Math.abs(t) ** (1 / e));
    return side > 0 ? (th + Math.PI) / TAU : (Math.PI - th) / TAU;
  }

  perimeter(z) {
    const sec = this.section(z);
    let p = 0, last = this.ring(sec, 0);
    for (let k = 1; k <= 48; k++) { const q = this.ring(sec, (k / 48) * TAU); p += Math.hypot(q[0] - last[0], q[1] - last[1]); last = q; }
    return p;
  }

  shell({ zs, segs = 64, inset = 0, inward = false, keep = null, uvFn = null, caps = false }) {
    const pos = [], uv = [], idx = [];
    for (const z of zs) {
      const sec = this.section(z);
      for (let j = 0; j <= segs; j++) {
        const v = j / segs;
        const [x, y] = this.ring(sec, Math.PI + v * TAU, inset);
        pos.push(x, y, z);
        if (uvFn) uv.push(...uvFn(x, y, z)); else uv.push(this.u(z), v);
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
    if (caps) {
      // close the ends with a fan (nose tip, tail end)
      for (const [ri, dir] of [[0, 1], [zs.length - 1, -1]]) {
        const z = zs[ri];
        const sec = this.section(z);
        const ci = pos.length / 3;
        pos.push(0, (sec.yt + sec.yb) / 2, z + dir * 0.004);
        uv.push(this.u(z), 0.5);
        for (let j = 0; j < segs; j++) {
          const a = ri * w + j, b = a + 1;
          if (dir > 0) idx.push(ci, b, a); else idx.push(ci, a, b);
        }
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
}

const zsOf = (segs) => {
  const out = [];
  for (const [a, b, n] of segs) for (let i = 0; i <= n; i++) out.push(Math.round((a + (b - a) * (i / n)) * 1e4) / 1e4);
  return [...new Set(out)].sort((p, q) => q - p);
};

// cabin pod flowing into the tail boom
const BODY = new Loft([
  [2.27, 0.04, -0.33, -0.21, 2.0],
  [2.23, 0.30, -0.55, 0.0, 2.1],
  [2.13, 0.52, -0.69, 0.22, 2.3],
  [1.96, 0.68, -0.79, 0.44, 2.5],
  [1.70, 0.80, -0.85, 0.62, 2.8],
  [1.35, 0.88, -0.88, 0.75, 3.1],
  [0.90, 0.91, -0.88, 0.81, 3.4],
  [0.20, 0.92, -0.88, 0.82, 3.5],
  [-0.60, 0.91, -0.87, 0.82, 3.4],
  [-1.30, 0.87, -0.80, 0.81, 3.1],
  [-1.85, 0.74, -0.62, 0.79, 2.8],
  [-2.30, 0.52, -0.30, 0.76, 2.5],
  [-2.65, 0.32, 0.08, 0.72, 2.2],
  [-2.95, 0.25, 0.20, 0.68, 2.05],
  [-3.60, 0.225, 0.26, 0.68, 2.0],
  [-4.60, 0.195, 0.33, 0.69, 2.0],
  [-5.60, 0.165, 0.42, 0.72, 2.0],
  [-6.50, 0.135, 0.50, 0.75, 2.0],
  [-6.78, 0.10, 0.53, 0.74, 2.0],
  [-6.86, 0.03, 0.60, 0.68, 2.0],
]);
const BODY_ZS = (fine) => zsOf(fine
  ? [[2.27, 1.35, 22], [1.35, -1.3, 30], [-1.3, -2.95, 18], [-2.95, -6.86, 26]]
  : [[2.27, 1.35, 6], [1.35, -1.3, 6], [-1.3, -2.95, 6], [-2.95, -6.86, 8]]);

// engine and transmission cowling on the cabin roof
const COWL = new Loft([
  [1.02, 0.12, 0.70, 0.80, 2.0],
  [0.85, 0.34, 0.70, 1.02, 2.4],
  [0.55, 0.47, 0.70, 1.22, 2.9],
  [0.10, 0.53, 0.70, 1.31, 3.2],
  [-0.90, 0.55, 0.70, 1.33, 3.4],
  [-1.90, 0.52, 0.69, 1.30, 3.1],
  [-2.45, 0.42, 0.66, 1.20, 2.7],
  [-2.78, 0.26, 0.64, 1.04, 2.3],
  [-2.88, 0.08, 0.68, 0.92, 2.0],
]);

// windows, doors and panels in side view (z, y)
const R = (core, r) => ({ core, r });
const WS = R([[2.6, -0.15], [1.44, -0.06], [0.99, 0.78], [0.96, 1.4], [2.6, 1.4]], 0.0);
const CHIN = R([[2.12, -0.62], [2.18, -0.27], [1.56, -0.19], [1.6, -0.62]], 0.05);
const FDW = R([[1.31, 0.0], [0.93, 0.72], [0.42, 0.72], [0.42, 0.0]], 0.06);
const FDL = R([[1.3, -0.6], [1.3, -0.14], [0.86, -0.14], [0.86, -0.58]], 0.05);
const RDW = R([[0.2, -0.02], [0.2, 0.69], [-0.76, 0.69], [-0.76, -0.02]], 0.07);
const FDOOR = R([[1.43, -0.81], [1.43, -0.05], [0.995, 0.8], [0.33, 0.8], [0.33, -0.81]], 0.03);
const RDOOR = R([[0.28, -0.81], [0.28, 0.8], [-0.86, 0.8], [-0.86, -0.81]], 0.03);
const BAG = R([[-1.32, -0.42], [-1.32, 0.36], [-1.92, 0.36], [-1.84, -0.3]], 0.03);
const sdR = (z, y, s) => sdPoly(z, y, s.core) - s.r;
const SKID = C(0xa4a8a9);
const CHEAT = [[2.4, -0.40], [1.2, -0.43], [-1.2, -0.42], [-2.2, -0.1], [-2.95, 0.40], [-6.9, 0.59]];
function cheatLine(z) {
  for (let i = 0; i < CHEAT.length - 1; i++) {
    const [z0, y0] = CHEAT[i], [z1, y1] = CHEAT[i + 1];
    if (z <= z0 && z >= z1) { const t = (z0 - z) / (z0 - z1); return lerp(y0, y1, t * t * (3 - 2 * t)); }
  }
  return z > CHEAT[0][0] ? CHEAT[0][1] : CHEAT[CHEAT.length - 1][1];
}

/** Livery, seams, rivets, doors, window openings and weathering of the cabin and boom. */
function bodyTextures() {
  const L = BODY;
  const W = 2048, H = 1024;
  const fc = makeCanvas(W, H), fg = fc.getContext('2d', { willReadFrequently: true });
  fg.fillStyle = '#808080';
  fg.fillRect(0, 0, W, H);
  const px = (z) => L.u(z) * W, py = (v) => (1 - v) * H;
  const seam = (x0, y0, x1, y1, w = 1.5, shade = 92) => { fg.strokeStyle = `rgb(${shade},${shade},${shade})`; fg.lineWidth = w; fg.beginPath(); fg.moveTo(x0, y0); fg.lineTo(x1, y1); fg.stroke(); };
  const dot = (x, y, r = 1.4, shade = 165) => { fg.fillStyle = `rgb(${shade},${shade},${shade})`; fg.beginPath(); fg.arc(x, y, r, 0, TAU); fg.fill(); };
  const screw = (x, y) => { dot(x, y, 2.1, 150); dot(x, y, 0.8, 98); };
  // tail boom: frames with rivet rows, skin joints, longitudinal rivet lines
  for (const z of [-2.96, -3.55, -4.15, -4.75, -5.35, -5.95, -6.5]) {
    const x = px(z), n = Math.round(L.perimeter(z) / 0.03);
    if (z === -2.96 || z === -4.75 || z === -6.5) seam(x, 0, x, H, 1.8);
    for (let k = 0; k < n; k++) dot(x - 3, py((k + 0.5) / n));
  }
  for (const v of [0.18, 0.32, 0.5, 0.68, 0.82]) {
    const seamToo = v === 0.32 || v === 0.68;
    if (seamToo) seam(px(-2.96), py(v), px(-6.8), py(v), 1.3);
    for (let z = -6.8; z <= -2.96; z += 0.04) dot(px(z), py(v) + (seamToo ? 3 : 0));
  }
  // cabin: roof seam rows, belly panels, nose access panel screws
  for (const z of [-1.3, -1.95]) { const x = px(z); seam(x, py(0.0), x, py(0.16), 1.5); seam(x, py(0.84), x, py(1.0), 1.5); }
  for (const v of [0.07, 0.93]) for (let z = -2.2; z <= 1.9; z += 0.05) dot(px(z), py(v));
  for (const z of [2.0, 1.8, 1.6]) for (const v of [0.47, 0.53]) screw(px(z), py(v - 0.44));
  // rear fuselage and baggage area: screws around the transmission deck edge
  for (const side of [1, -1]) {
    for (let z = -2.5; z < 0.8; z += 0.16) screw(px(z), py(L.vSide(z, 0.78, side)));
    for (let z = -2.6; z < -1.0; z += 0.12) dot(px(z), py(L.vSide(z, -0.3, side)), 1.3);
    // door hinges: front doors hinge at the front post, rear doors at the back
    for (const [z, y] of [[1.38, 0.05], [1.38, -0.62], [-0.83, 0.62], [-0.83, -0.62]]) {
      const x0 = px(z), y0 = py(L.vSide(z, y, side));
      fg.fillStyle = 'rgb(152,152,152)'; fg.fillRect(x0 - 4, y0 - 10, 8, 20);
      fg.fillStyle = 'rgb(110,110,110)'; fg.fillRect(x0 - 1, y0 - 10, 2, 20);
    }
    // step recesses under the doors and the fuel filler on the left rear
    for (const z of [0.85, -0.25]) { const x0 = px(z), y0 = py(L.vSide(z, -0.72, side)); fg.fillStyle = 'rgb(60,60,60)'; fg.fillRect(x0 - 16, y0 - 5, 32, 10); }
  }
  {
    const x0 = px(-1.55), y0 = py(L.vSide(-1.55, 0.5, 1));
    fg.strokeStyle = 'rgb(96,96,96)'; fg.lineWidth = 2; fg.beginPath(); fg.arc(x0, y0, 15, 0, TAU); fg.stroke();
    dot(x0, y0, 5, 140);
  }
  const feat = fg.getImageData(0, 0, W, H).data;

  // painted decals (stencils, fuel marking, walkway lines)
  const dc = makeCanvas(W, H), dg = dc.getContext('2d', { willReadFrequently: true });
  dg.textAlign = 'center'; dg.textBaseline = 'middle';
  const stencil = (z, y, side, text, size = 11, color = '#20282a') => {
    dg.save();
    dg.translate(px(z), py(L.vSide(z, y, side)));
    // side > 0 (left): u runs nose → tail left to right in the image, read it the right way round
    if (side > 0) dg.scale(-1, -1);
    dg.fillStyle = color; dg.font = `bold ${size}px Arial`;
    dg.fillText(text, 0, 0);
    dg.restore();
  };
  for (const side of [1, -1]) {
    stencil(-1.6, 0.0, side, 'BAGGAGE', 10);
    stencil(-3.3, 0.62, side, 'NO STEP', 9);
    stencil(0.6, -0.55, side, 'NO PUSH', 8, '#e8eaea');
    stencil(-5.2, 0.48, side, 'DANGER', 10, '#c4401a');
    stencil(-5.2, 0.42, side, 'TAIL ROTOR', 8, '#c4401a');
  }
  stencil(-1.55, 0.36, 1, 'JET A-1', 9);
  const deco = dg.getImageData(0, 0, W, H).data;

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
  const texel = (L.zmax - L.zmin) / W;
  for (let col = 0; col < W; col++) {
    const z = L.zmin + ((col + 0.5) / W) * (L.zmax - L.zmin);
    const sec = L.section(z);
    const e = 2 / sec.n, hw = sec.hw, hy = (sec.yt - sec.yb) / 2, yc = (sec.yt + sec.yb) / 2;
    const cl = cheatLine(z);
    const streak = hash(col * 0.37);
    const cabin = z > -0.95 && z < 2.3;
    for (let row = 0; row < H; row++) {
      const s = sinT[row], c = cosT[row];
      const x = (s < 0 ? -hw : hw) * Math.exp(e * lnS[row]);
      const y = yc + (c < 0 ? -hy : hy) * Math.exp(e * lnC[row]);
      const ax = Math.abs(x);
      const i = row * W + col;
      let h = feat[i * 4] / 255;
      // livery: deep teal belly and lower boom, a restrained orange line, white above
      const tO = clamp((y - cl) / 0.004 + 0.5, 0, 1), tW = clamp((y - cl - 0.045) / 0.004 + 0.5, 0, 1);
      let r = lerp(lerp(cT[0], cO[0], tO), cW[0], tW), g = lerp(lerp(cT[1], cO[1], tO), cW[1], tW), b = lerp(lerp(cT[2], cO[2], tO), cW[2], tW);
      let mul = 0.985 + 0.03 * Math.sin(z * 3.1 + y * 5.3) * Math.sin(z * 1.7 - y * 2.9);
      const side = ax > hw * 0.55 && c < 0.85;
      let dWin = 9;
      if (cabin) {
        // windshield (sides and roof), its centre post, chin windows, door windows
        if (z > 0.9 && y > -0.2) {
          dWin = sdR(z, y, WS);
          if (y > -0.12) dWin = Math.max(dWin, 0.021 - ax);
        }
        if (z > 1.5 && y < -0.15 && ax < hw * 0.68 && ax > 0.055) dWin = Math.min(dWin, sdR(z, y, CHIN));
        if (side) {
          if (z > 0.35 && z < 1.4) dWin = Math.min(dWin, sdR(z, y, FDW), sdR(z, y, FDL));
          if (z < 0.25 && z > -0.82) dWin = Math.min(dWin, sdR(z, y, RDW));
          // door and baggage door outlines
          const gd = Math.min(Math.abs(sdR(z, y, FDOOR)), Math.abs(sdR(z, y, RDOOR)));
          const gr = 1 - gd / 0.0045;
          if (gr > 0) { h -= 0.32 * gr; mul *= 1 - 0.16 * gr; }
        }
      }
      if (side && z < -1.2 && z > -2.0) { const gr = 1 - Math.abs(sdR(z, y, BAG)) / 0.004; if (gr > 0) { h -= 0.28 * gr; mul *= 1 - 0.12 * gr; } }
      // weathering: exhaust soot on the upper right of the boom root, grime under the belly,
      // oil streaks aft of the transmission deck, rain streaks under the windows
      if (x < 0.05 && z < -2.4 && z > -4.6) { const k = smoothstep(0.45, 0.66, y) * Math.exp(-(-2.4 - z) / 0.9) * 0.55; mul *= 1 - k * 0.6; r += k * 4; }
      if (y < sec.yb + 0.12) mul *= 1 - 0.12 * (1 - smoothstep(-2.6, -1.0, z) * 0.4);
      if (side && z < -1.9 && z > -2.9 && y > 0.3 && streak > 0.75) mul *= 1 - 0.08 * ((streak - 0.75) / 0.25) * smoothstep(0.75, 0.4, y);
      if (side && y < 0.0 && y > -0.45 && z > -0.8 && z < 1.3 && streak > 0.82) mul *= 1 - 0.05 * ((streak - 0.82) / 0.18);
      // worn paint around the door handles and on the step areas
      if (side && Math.abs(y + 0.05) < 0.08 && (Math.abs(z - 0.42) < 0.08 || Math.abs(z + 0.72) < 0.08)) mul *= 0.95 + 0.05 * hash(i * 0.013);
      const o = i * 4;
      // decals
      const da = deco[o + 3] / 255;
      if (da > 0) { r = lerp(r, deco[o], da); g = lerp(g, deco[o + 1], da); b = lerp(b, deco[o + 2], da); }
      if (dWin >= 0 && dWin < 0.022) {
        const k = 1 - smoothstep(0.016, 0.022, dWin);
        r = lerp(r, cS[0], k); g = lerp(g, cS[1], k); b = lerp(b, cS[2], k);
        h += 0.1 * k;
      }
      const a = clamp(dWin / texel + 0.5, 0, 1);
      mul *= 1 + (h - 0.5) * 0.45;
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

/** The engine cowling: white panels, latches, side intake grilles, oil cooler grille, exhaust soot. */
function cowlTextures() {
  const L = COWL;
  const W = 1024, H = 512;
  const fc = makeCanvas(W, H), fg = fc.getContext('2d', { willReadFrequently: true });
  fg.fillStyle = '#808080';
  fg.fillRect(0, 0, W, H);
  const px = (z) => L.u(z) * W, py = (v) => (1 - v) * H;
  const seam = (x0, y0, x1, y1, w = 1.5, shade = 90) => { fg.strokeStyle = `rgb(${shade},${shade},${shade})`; fg.lineWidth = w; fg.beginPath(); fg.moveTo(x0, y0); fg.lineTo(x1, y1); fg.stroke(); };
  for (const z of [0.42, -0.3, -1.55, -2.35]) seam(px(z), py(0.18), px(z), py(0.82), 2);
  for (const v of [0.31, 0.69]) seam(px(0.42), py(v), px(-2.35), py(v), 1.6);
  // latches along the lower edge
  for (const side of [1, -1]) {
    for (const z of [0.2, -0.55, -1.3, -2.0]) {
      const x0 = px(z), y0 = py(L.vSide(z, 0.82, side));
      fg.fillStyle = 'rgb(105,105,105)'; fg.fillRect(x0 - 9, y0 - 3, 18, 6);
      fg.fillStyle = 'rgb(160,160,160)'; fg.fillRect(x0 - 5, y0 - 1, 10, 2);
    }
  }
  const feat = fg.getImageData(0, 0, W, H).data;
  const color = new ImageData(W, H), cd = color.data;
  const hgt = new Float32Array(W * H);
  const cW = RGB8(HEX.white), cG = RGB8(0x2b2f31);
  for (let col = 0; col < W; col++) {
    const z = L.zmin + ((col + 0.5) / W) * (L.zmax - L.zmin);
    const sec = L.section(z);
    const e = 2 / sec.n, hw = sec.hw, hy = (sec.yt - sec.yb) / 2, yc = (sec.yt + sec.yb) / 2;
    for (let row = 0; row < H; row++) {
      const th = Math.PI + (1 - (row + 0.5) / H) * TAU;
      const s = Math.sin(th), c = Math.cos(th);
      const x = Math.sign(s) * hw * Math.abs(s) ** e, y = yc + Math.sign(c) * hy * Math.abs(c) ** e;
      const ax = Math.abs(x);
      const i = row * W + col;
      let h = feat[i * 4] / 255;
      let [r, g, b] = cW;
      let mul = 0.99 + 0.02 * Math.sin(z * 4.1 + x * 3.3);
      // side intake grilles: a dark recess with a fine diagonal mesh
      const gi = Math.max(Math.abs(z + 0.78) - 0.42, Math.abs(y - 1.1) - 0.1);
      if (ax > 0.3 && gi < 0) {
        const mesh = (Math.sin((z * 160 + y * 160)) > 0.2 ? 1 : 0) * (Math.sin((z * 160 - y * 160)) > 0.2 ? 1 : 0);
        r = cG[0] + mesh * 40; g = cG[1] + mesh * 40; b = cG[2] + mesh * 40;
        h -= 0.25 - mesh * 0.1;
      } else if (ax > 0.3 && gi < 0.012) { h -= 0.3; mul *= 0.8; }
      // oil cooler grille on the top rear
      const go = Math.max(Math.abs(z + 2.05) - 0.24, ax - 0.2);
      if (c > 0.5 && go < 0) {
        const slat = Math.sin(z * 220) > 0 ? 1 : 0;
        r = cG[0] + slat * 30; g = cG[1] + slat * 30; b = cG[2] + slat * 30; h -= 0.2 - slat * 0.12;
      } else if (c > 0.5 && go < 0.01) { h -= 0.28; mul *= 0.82; }
      // heat and soot towards the exhaust, oil weeping from the latches
      if (z < -1.9) { const k = smoothstep(-1.9, -2.85, z) * (x < 0.1 ? 1 : 0.4); mul *= 1 - 0.35 * k; r -= 6 * k; g -= 4 * k; }
      if (y < 0.86 && hash(col * 0.71) > 0.86) mul *= 0.95;
      mul *= 1 + (h - 0.5) * 0.45;
      const o = i * 4;
      cd[o] = r * mul; cd[o + 1] = g * mul; cd[o + 2] = b * mul; cd[o + 3] = 255;
      hgt[i] = h;
    }
  }
  return { color: imageTexture(color, true, 8), normal: imageTexture(normalImage(hgt, W, H, 3), false, 8) };
}

// ==================================================================== rotors
/** One main rotor blade along +X from the sleeve to the tip; leading edge towards +Z. */
function mainBladeGeometry(fine = true) {
  const r0 = 0.62, r1 = 5.35, NS = fine ? 26 : 8, NP = fine ? 9 : 5;
  const pos = [], col = [], idx = [];
  const loopN = NP * 2;
  const dark = C(0x2a2d2f), edge = C(0x8e9396), tip = ORANGE, tipW = WHITE;
  for (let i = 0; i <= NS; i++) {
    const s = i / NS, r = lerp(r0, r1, s);
    // root cuff, constant chord, swept parabolic tip
    let chord = r < 0.95 ? lerp(0.2, 0.35, smoothstep(0.62, 0.95, r)) : 0.35;
    let sweep = 0;
    if (r > 5.0) { const k = (r - 5.0) / 0.35; chord *= 1 - 0.55 * k * k; sweep = -0.1 * k * k; }
    const tr = r < 0.95 ? lerp(0.3, 0.12, smoothstep(0.62, 0.95, r)) : lerp(0.12, 0.09, s);
    const twist = lerp(0.07, -0.08, s); // washout
    const ct = Math.cos(twist), st = Math.sin(twist);
    const band = r > 4.95 ? (r > 5.18 ? tipW : tip) : null;
    for (let k = 0; k < loopN; k++) {
      const up = k < NP;
      const kk = up ? k : loopN - 1 - k;
      const f = (1 - Math.cos((kk / (NP - 1)) * Math.PI)) / 2;
      const w = (up ? 1 : -1) * airfoilT(f, tr) * chord;
      const q = (0.25 - f) * chord + sweep; // chord position, LE at +z
      // pitch up = leading edge up: rotate (q, w) about the span axis
      pos.push(r, w * ct + q * st, q * ct - w * st);
      col.push(...(band || (f < 0.07 ? edge : dark)));
    }
  }
  for (let i = 0; i < NS; i++) for (let k = 0; k < loopN; k++) { const k1 = (k + 1) % loopN; const a = i * loopN + k, b = i * loopN + k1, c = b + loopN, d = a + loopN; idx.push(a, d, b, b, d, c); }
  const tipC = pos.length / 3;
  let cx = 0, cy = 0, cz = 0;
  for (let k = 0; k < loopN; k++) { const j = (NS * loopN + k) * 3; cx += pos[j]; cy += pos[j + 1]; cz += pos[j + 2]; }
  pos.push(cx / loopN + 0.01, cy / loopN, cz / loopN); col.push(...tipW);
  for (let k = 0; k < loopN; k++) idx.push(tipC, NS * loopN + ((k + 1) % loopN), NS * loopN + k);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return orient(g, V3(0, 1, 0), Math.floor(NS / 2) * loopN + Math.floor(NP / 2));
}

function rotorDiscTexture(R0, blades, tipColor) {
  const S = 512;
  const cv = makeCanvas(S, S);
  const g = cv.getContext('2d');
  const Rp = S / 2;
  const grd = g.createRadialGradient(Rp, Rp, Rp * R0, Rp, Rp, Rp);
  grd.addColorStop(0, 'rgba(30,32,34,0)');
  grd.addColorStop(0.08, 'rgba(30,32,34,0.13)');
  grd.addColorStop(0.6, 'rgba(32,34,36,0.11)');
  grd.addColorStop(0.9, 'rgba(34,36,38,0.08)');
  if (tipColor) {
    grd.addColorStop(0.93, `rgba(${tipColor},0.16)`);
    grd.addColorStop(0.99, 'rgba(235,235,230,0.14)');
  }
  grd.addColorStop(1, 'rgba(34,36,38,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  g.translate(Rp, Rp);
  for (let k = 0; k < blades; k++) {
    for (let a = 0; a < 1.1; a += 0.025) {
      g.save();
      g.rotate((k / blades) * TAU + a);
      g.fillStyle = `rgba(20,22,24,${0.06 * Math.exp(-a * 3.4)})`;
      g.beginPath(); g.moveTo(-4, -Rp * R0); g.lineTo(-7, -Rp * 0.98); g.lineTo(7, -Rp * 0.98); g.lineTo(4, -Rp * R0); g.fill();
      g.restore();
    }
  }
  return canvasTexture(cv, true, 4);
}

/** Shadow mask for the spinning rotor: three thin blade wedges (the alpha test cuts the rest). */
function rotorShadowTexture() {
  const S = 256;
  const cv = makeCanvas(S, S);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.translate(S / 2, S / 2);
  g.fillStyle = '#fff';
  for (let k = 0; k < 3; k++) {
    g.save(); g.rotate((k / 3) * TAU);
    g.beginPath(); g.moveTo(-2, -S * 0.08); g.lineTo(-4.5, -S * 0.5); g.lineTo(4.5, -S * 0.5); g.lineTo(2, -S * 0.08); g.fill();
    g.restore();
  }
  return canvasTexture(cv, true, 1);
}

function ringGeometry(r0, r1, seg = 72) {
  const g = new THREE.RingGeometry(r0, r1, seg, 1);
  // planar uv across the disc so the texture centre is the rotor axis
  const P = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < P.count; i++) uv.setXY(i, P.getX(i) / (2 * r1) + 0.5, P.getY(i) / (2 * r1) + 0.5);
  g.rotateX(-Math.PI / 2);
  return g;
}

// ==================================================================== decals
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

/** Registration on the boom sides, a grid following the skin. */
function registrationGeometry(side) {
  const pos = [], uv = [], idx = [];
  const NZ = 14, NY = 3, zc = -3.85, half = 0.6, y0 = 0.485, y1 = 0.615;
  for (let i = 0; i <= NZ; i++) {
    const z = zc + half - (2 * half * i) / NZ;
    for (let j = 0; j <= NY; j++) {
      const y = lerp(y0, y1, j / NY);
      pos.push(side * (BODY.skinX(z, y) + 0.003), y, z);
      uv.push(side > 0 ? i / NZ : 1 - i / NZ, j / NY);
    }
  }
  for (let i = 0; i < NZ; i++) for (let j = 0; j < NY; j++) { const a = i * (NY + 1) + j, b = a + NY + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return orient(g, V3(side, 0, 0), 2 * (NY + 1) + 1);
}

function tube(points, r, rgb, radial = 10, seg = 40, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => V3(...p)), closed, 'centripetal');
  return part(new THREE.TubeGeometry(curve, seg, r, radial, closed), rgb);
}

function sphere(r, x, y, z, rgb, sx = 1, sy = 1, sz = 1, seg = 10) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1));
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return part(g, rgb);
}

/** Surface colours by position: white with an orange tip band (crisp edge via doubled stations). */
function paintBy(g, fn) {
  const P = g.attributes.position;
  const col = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) { const c = fn(P.getX(i), P.getY(i), P.getZ(i)); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) {
    // toNonIndexed copies attributes; recompute colours on the expanded geometry
    const Q = n.attributes.position, c2 = new Float32Array(Q.count * 3);
    for (let i = 0; i < Q.count; i++) { const c = fn(Q.getX(i), Q.getY(i), Q.getZ(i)); c2[i * 3] = c[0]; c2[i * 3 + 1] = c[1]; c2[i * 3 + 2] = c[2]; }
    n.setAttribute('color', new THREE.BufferAttribute(c2, 3));
    return n;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ==================================================================== build
export function buildHelicopter() {
  const root = new THREE.Group();
  root.name = 'helicopter';
  const timing = {};
  let t0 = performance.now();
  const bodyTex = bodyTextures();
  timing.body = performance.now() - t0; t0 = performance.now();
  const cowlTex = cowlTextures();
  timing.cowl = performance.now() - t0; t0 = performance.now();

  const skinB = skinMaterial({ map: bodyTex.color, normalMap: bodyTex.normal, alphaTest: 0.5, clearcoat: 0.45 });
  const skinC = skinMaterial({ map: cowlTex.color, normalMap: cowlTex.normal, roughness: 0.34, clearcoat: 0.35 });
  const paint = plainMaterial({ roughness: 0.32, key: 'heliPaint' });
  const alu = plainMaterial({ roughness: 0.4, metalness: 0.5, key: 'heliAlu' });
  const dark = plainMaterial({ roughness: 0.6, metalness: 0.15, key: 'heliDark' });
  const hubMat = plainMaterial({ roughness: 0.38, metalness: 0.6, key: 'heliHub' });
  const skidMat = plainMaterial({ roughness: 0.45, metalness: 0.35, key: 'heliSkid' });
  const lens = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0, vertexColors: true });
  const cabin = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0, vertexColors: true, side: THREE.DoubleSide, emissive: 0x201f1c, emissiveIntensity: 1 });
  patchMaterial(cabin, { wet: 0, canopy: false, caustics: false, key: 'heliCabin' });
  const liningMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, emissive: 0x262421, emissiveIntensity: 1, alphaMap: bodyTex.lining, alphaTest: 0.5 });
  patchMaterial(liningMat, { wet: 0, canopy: false, caustics: false, key: 'heliLining' });
  // dark, slightly tinted glass: see-through head on, mirror-like at grazing angles
  const glass = new THREE.MeshStandardMaterial({ color: 0x4f6266, roughness: 0.035, metalness: 0.1, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, alphaMap: bodyTex.glass, envMapIntensity: 1.7 });
  patchMaterial(glass, {
    wet: 0, canopy: false, caustics: false, key: 'heliGlass',
    fragment: (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `{
  float _ndv = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
  float _fr = pow(1.0 - _ndv, 4.0);
  // from inside the cabin the tint is light and the glass barely reflects
  float _in = gl_FrontFacing ? 0.0 : 1.0;
  diffuseColor.a *= mix(mix(1.0, 0.85 / max(opacity, 0.02), _fr), 0.35 + 0.4 * _fr, _in);
}
#include <opaque_fragment>`);
    },
  });
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.46, metalness: 0.15, vertexColors: true, transparent: true, opacity: 1 });
  patchMaterial(bladeMat, { wet: 0.3, key: 'heliBlade' });

  const mk = (geo, mat, { cast = true, receive = true } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast; m.receiveShadow = receive;
    m.layers.set(LAYER.WORLD);
    return m;
  };

  // ---------------------------------------------------------------- airframe
  const body = new THREE.Group();
  body.name = 'airframe';
  const shellHi = mk(BODY.shell({ zs: BODY_ZS(true), segs: 64, caps: true }), skinB);
  const shellLo = mk(BODY.shell({ zs: BODY_ZS(false), segs: 20, caps: true }), skinB);
  shellLo.visible = false;
  body.add(shellHi, shellLo);
  const cowlKeep = (x, y, z) => y > 0.74 || z < -2.2;
  const cowlZs = zsOf([[1.02, 0.55, 8], [0.55, -1.9, 14], [-1.9, -2.88, 10]]);
  const cowlHi = mk(COWL.shell({ zs: cowlZs, segs: 48, keep: cowlKeep, caps: true }), skinC);
  body.add(cowlHi);
  // glass over the openings: windshield, roof, chin and door windows
  const glassKeep = (x, y, z) => (z > 0.9 && y > -0.22) || (z > 1.5 && y < -0.1 && Math.abs(x) < 0.62) || (Math.abs(x) > 0.55 && z > -0.85 && z < 1.4 && y > -0.65 && y < 0.78);
  const glassMesh = mk(BODY.shell({ zs: zsOf([[2.27, 1.35, 22], [1.35, -0.9, 20]]), segs: 64, inset: 0.006, keep: glassKeep }), glass, { cast: false, receive: false });
  glassMesh.renderOrder = 2;
  body.add(glassMesh);

  // cabin lining (window cut-outs share the skin's alpha) and the interior
  const interior = new THREE.Group();
  interior.name = 'cabin';
  const liningG = BODY.shell({ zs: zsOf([[2.2, 1.35, 18], [1.35, -1.95, 22]]), segs: 40, inset: 0.03, inward: true });
  {
    const P = liningG.attributes.position, col = new Float32Array(P.count * 3);
    const head = C(0x3c3e3f), wall = C(0x5a5c5c), low = C(0x2c2d2e);
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i);
      const a = smoothstep(0.62, 0.78, y), b = smoothstep(-0.6, -0.45, y);
      for (let k = 0; k < 3; k++) col[i * 3 + k] = lerp(lerp(low[k], wall[k], b), head[k], a);
    }
    liningG.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  interior.add(mk(liningG, liningMat, { cast: false }));
  const cab = [];
  // floor, rear bulkhead, seats
  {
    // floor following the inside of the skin
    const pts = [];
    const zs = linspace(-1.92, 2.02, 14);
    for (const z of zs) pts.push(new THREE.Vector2(Math.max(0.05, BODY.skinX(z, -0.73) - 0.05), -z));
    const shape = new THREE.Shape([...pts.map((p) => new THREE.Vector2(p.x, p.y)), ...pts.slice().reverse().map((p) => new THREE.Vector2(-p.x, p.y))]);
    const g = new THREE.ShapeGeometry(shape, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(0, -0.73, 0);
    cab.push(part(g, C(0x262728)));
  }
  {
    const sec = BODY.section(-1.95);
    const shape = new THREE.Shape();
    for (let j = 0; j <= 32; j++) { const [x, y] = BODY.ring(sec, (j / 32) * TAU, 0.035); if (j === 0) shape.moveTo(x, y); else shape.lineTo(x, y); }
    const g = new THREE.ShapeGeometry(shape, 1); g.translate(0, 0, -1.95);
    cab.push(part(g, C(0x34363a)));
  }
  const fabric = C(0x3e4a50), fabricDark = C(0x2f3a3f), frameC = C(0x1f2122), belt = C(0x9a6a2a);
  const seat = (x, z, w = 0.5, back = 0.7) => {
    cab.push(box(w, 0.12, 0.5, x, -0.38, z, fabric, { round: 0.04 }));
    cab.push(box(w, back, 0.1, x, -0.38 + back / 2 + 0.04, z - 0.28, fabric, { rx: 0.12, round: 0.04 }));
    cab.push(box(w * 0.9, back * 0.8, 0.02, x, -0.38 + back / 2 + 0.06, z - 0.225, fabricDark, { rx: 0.12 }));
    cab.push(box(w * 0.7, 0.32, 0.06, x, -0.58, z, frameC));
    for (const sx of [-0.13, 0.13]) cab.push(box(0.04, 0.6, 0.012, x + sx, -0.38 + back * 0.55, z - 0.22, belt, { rx: 0.12 }));
  };
  seat(-0.42, 0.66); seat(0.42, 0.66);
  for (const x of [-0.5, 0, 0.5]) seat(x, -1.3, 0.48, 0.68);
  // centre console, instrument panel housing, glareshield, overhead console, pedals
  cab.push(box(0.26, 0.5, 0.75, 0, -0.5, 1.28, C(0x1c1d1e), { round: 0.03 }));
  cab.push(box(1.18, 0.4, 0.14, 0, -0.08, 1.66, C(0x18191a), { rx: 0.3, round: 0.02 }));
  cab.push(box(1.2, 0.05, 0.3, 0, 0.16, 1.74, C(0x111213), { rx: 0.12, round: 0.02 }));
  cab.push(box(0.3, 0.05, 0.55, 0, 0.77, 0.55, C(0x222324), { round: 0.015 }));
  for (const x of [0.06, -0.06]) cab.push(box(0.02, 0.03, 0.05, x, 0.74, 0.62, C(0xc23a22)));
  cab.push(box(0.03, 0.02, 0.08, 0.1, 0.74, 0.45, C(0xd4c23a)));
  // fire extinguisher and first-aid box behind the pilot seat, a map pocket
  cab.push(cyl([-0.72, -0.62, -0.05], [-0.72, -0.25, -0.05], 0.055, C(0xb4231c), 12));
  cab.push(box(0.26, 0.16, 0.08, 0.66, 0.2, 0.2, C(0x9c1f1a), { round: 0.01 }));
  cab.push(box(0.04, 0.24, 0.32, -0.84, -0.3, 0.75, C(0x2a2b2c)));
  interior.add(mk(mergeGeometries(cab), cabin, { cast: false }));

  // instrument panel face (drawn by Helicopter._drawPanel)
  const panelCanvas = makeCanvas(1024, 384);
  const panelTex = canvasTexture(panelCanvas, true, 4);
  const panelMat = new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.55, metalness: 0, emissive: 0xffffff, emissiveMap: panelTex, emissiveIntensity: 0.09 });
  const panelFace = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 0.42), panelMat);
  panelFace.rotation.set(0.3, Math.PI, 0);
  panelFace.position.set(0, -0.058, 1.588);
  panelFace.layers.set(LAYER.WORLD);
  interior.add(panelFace);

  // cyclic sticks (pivot at the floor), collective levers (pivot aft, left of each seat), pedals
  const ctlMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.3, vertexColors: true });
  patchMaterial(ctlMat, { wet: 0, canopy: false, caustics: false, key: 'heliCtl' });
  const cyclics = [];
  for (const x of [-0.42, 0.42]) {
    const g = new THREE.Group();
    g.position.set(x, -0.72, 1.06);
    const parts = [cyl([0, 0, 0], [0, 0.48, 0.06], 0.014, C(0x2a2b2c), 8), cyl([0, 0.48, 0.06], [0, 0.62, 0.05], 0.024, C(0x121212), 10)];
    parts.push(box(0.05, 0.03, 0.04, 0, 0.64, 0.05, C(0x161616), { round: 0.01 }));
    parts.push(box(0.012, 0.012, 0.012, -0.012, 0.66, 0.068, C(0xc4301c)));
    parts.push(cyl([0, 0, 0], [0, 0.07, 0], 0.05, C(0x111111), 10, 0.03));
    const m = new THREE.Mesh(mergeGeometries(parts), ctlMat);
    m.layers.set(LAYER.WORLD);
    g.add(m);
    interior.add(g);
    cyclics.push(g);
  }
  const collective = new THREE.Group();
  collective.position.set(0, -0.52, 0.42);
  {
    const parts = [];
    for (const x of [-0.12, 0.72]) {
      parts.push(cyl([x, 0, 0], [x, 0.07, 0.5], 0.016, C(0x2c2d2e), 8));
      parts.push(cyl([x, 0.07, 0.5], [x, 0.09, 0.66], 0.026, C(0x141414), 10));
      parts.push(box(0.06, 0.04, 0.05, x, 0.1, 0.66, C(0x1a1a1a), { round: 0.01 }));
    }
    const m = new THREE.Mesh(mergeGeometries(parts), ctlMat);
    m.layers.set(LAYER.WORLD);
    collective.add(m);
  }
  interior.add(collective);
  const pedals = [];
  for (const side of [1, -1]) {
    const g = new THREE.Group();
    g.position.set(0, -0.66, 1.9);
    const parts = [];
    for (const sx of [-0.42, 0.42]) parts.push(box(0.07, 0.16, 0.025, sx + side * 0.09, 0, 0, C(0x2e2f30), { rx: -0.5, round: 0.01 }));
    const m = new THREE.Mesh(mergeGeometries(parts), ctlMat);
    m.layers.set(LAYER.WORLD);
    g.add(m);
    interior.add(g);
    pedals.push(g);
  }
  body.add(interior);

  // ---------------------------------------------------------------- tail: stabiliser, endplates, fins
  const tail = [];
  const STAB_Y = 0.6;
  {
    const spans = [...linspace(0.14, 1.0, 8), 1.0005, ...linspace(1.02, 1.15, 3)];
    for (const sg of [1, -1]) {
      const frame = (s) => ({ le: V3(sg * s, STAB_Y, -5.03 - s * 0.03), back: V3(0, 0, -1), up: V3(0, 1, 0), chord: 0.44 - s * 0.05, thick: 1, span: s });
      const g = liftSurface({ spans, frame, t: 0.13, m: -0.02, uvOf: () => [0, 0], capStart: false });
      tail.push(paintBy(g, (x) => (Math.abs(x) > 1.0 ? ORANGE : WHITE)));
      // endplate fins at the tips
      const ep = liftSurface({
        spans: linspace(0, 1, 5), t: 0.1, uvOf: () => [0, 0],
        frame: (s) => ({ le: V3(sg * 1.17, lerp(STAB_Y - 0.2, STAB_Y + 0.32, s), -4.98 - s * 0.12), back: V3(0, 0, -1), up: V3(sg, 0, 0), chord: lerp(0.4, 0.3, s), thick: 1, span: s }),
      });
      tail.push(paintBy(ep, () => TEAL));
    }
  }
  {
    // upper fin swept back, lower (ventral) fin with the tail skid guard
    const finF = (y) => {
      const s = (y - 0.68) / (1.95 - 0.68);
      return { le: V3(0, y, lerp(-5.95, -6.42, s)), back: V3(0, 0, -1), up: V3(1, 0, 0), chord: lerp(0.86, 0.46, s), thick: 1, span: y };
    };
    const fin = liftSurface({ spans: [...linspace(0.68, 1.72, 9), 1.7205, ...linspace(1.75, 1.95, 3)], frame: finF, t: 0.14, m: 0.03, uvOf: () => [0, 0] });
    tail.push(paintBy(fin, (x, y) => (y > 1.72 ? ORANGE : WHITE)));
    const venF = (y) => {
      const s = (0.55 - y) / (0.55 + 0.02);
      return { le: V3(0, y, lerp(-6.0, -6.22, s)), back: V3(0, 0, -1), up: V3(1, 0, 0), chord: lerp(0.52, 0.34, s), thick: 1, span: y };
    };
    const ven = liftSurface({ spans: linspace(0.55, -0.02, 6), frame: venF, t: 0.12, uvOf: () => [0, 0] });
    tail.push(paintBy(ven, () => TEAL));
  }
  // tail rotor gearbox fairing and driveshaft cover along the boom
  tail.push(sphere(0.12, 0.08, 1.15, -6.5, WHITE, 1.1, 1.0, 1.6, 14));
  const dsTop = (z) => BODY.skinY(z, 0) + 0.035;
  tail.push(tube(linspace(-2.95, -5.98, 6).map((z) => [0, dsTop(z), z]), 0.045, WHITE, 8, 24));
  for (const z of [-3.6, -4.6, -5.6]) tail.push(box(0.12, 0.05, 0.06, 0, dsTop(z) - 0.01, z, C(0xc9ccca)));
  body.add(mk(mergeGeometries(tail.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; })), paint));

  // ---------------------------------------------------------------- skids
  const skidParts = [];
  for (const sg of [1, -1]) {
    const x = sg * 1.05;
    skidParts.push(tube([[x, -1.43, -1.32], [x, -1.43, -0.4], [x, -1.43, 0.6], [x, -1.43, 1.32], [x, -1.4, 1.58], [x, -1.32, 1.76], [x, -1.18, 1.86]], 0.042, SKID, 10, 36));
    skidParts.push(sphere(0.042, x, -1.43, -1.32, SKID, 1, 1, 1, 10));
    // wear shoes under the tubes, a boarding step on the forward cross tube
    for (const z of [-0.9, 0.0, 0.9]) skidParts.push(box(0.05, 0.016, 0.42, x, -1.468, z, C(0x6e7274)));
    skidParts.push(box(0.26, 0.02, 0.14, sg * 0.84, -1.0, 0.95, C(0x55595b), { round: 0.005 }));
  }
  for (const [z, rake] of [[0.95, 0.04], [-0.82, -0.02]]) {
    const pts = [];
    for (const t of linspace(-1, 1, 12)) {
      const ax = Math.abs(t);
      const xx = t * 1.05;
      const yy = -1.43 + 0.53 * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, ax - 0.0) , 3))) * smoothstep(1.0, 0.55, ax) + (ax > 0.97 ? 0 : 0);
      pts.push([xx, yy, z + rake * (1 - ax)]);
    }
    skidParts.push(tube(pts, 0.045, SKID, 10, 44));
    // saddle fittings where the cross tube meets the belly
    for (const sg of [1, -1]) skidParts.push(box(0.12, 0.06, 0.12, sg * 0.5, -0.91, z, C(0x7d8183), { round: 0.015 }));
  }
  const skids = mk(mergeGeometries(skidParts), skidMat);
  body.add(skids);

  // ---------------------------------------------------------------- exterior detail
  const det = [];
  for (const side of [1, -1]) {
    // door handles
    for (const [z, y] of [[0.42, -0.05], [-0.72, -0.05]]) det.push(box(0.014, 0.024, 0.12, side * (BODY.skinX(z, y) + 0.018), y, z, C(0x2a2d2f), { round: 0.006 }));
    // baggage door latch
    det.push(box(0.012, 0.05, 0.03, side * (BODY.skinX(-1.6, -0.05) + 0.01), -0.05, -1.6, C(0x2a2d2f)));
  }
  // engine exhaust, intake lips, pitot, antennas, mast fairing, landing light housing
  det.push(cyl([-0.14, 1.04, -2.6], [-0.2, 1.1, -3.0], 0.12, C(0x4a3c32), 16, 0.11));
  det.push(cyl([-0.2, 1.1, -3.0], [-0.205, 1.105, -3.02], 0.105, C(0x0f0d0b), 16));
  det.push(cyl([0, 0.82, 1.0], [0, 0.9, 1.05], 0.012, C(0x2c2e30), 6));
  det.push(cyl([0, 0.9, 1.05], [0, 0.9, 1.45], 0.008, C(0xb4b8ba), 6));
  det.push(cyl([0, BODY.skinY(-3.5, 0) + 0.05, -3.5], [0, BODY.skinY(-3.5, 0) + 0.6, -3.75], 0.006, C(0x1c1d1e), 6, 0.003));
  det.push(box(0.012, 0.14, 0.12, 0, -0.95, -0.6, C(0x24272a), { rx: 0.4, round: 0.004 }));
  det.push(box(0.12, 0.02, 0.12, 0.25, 1.33, 0.25, C(0x26292b), { round: 0.01 }));
  det.push(cyl([0, 1.3, 0], [0, 1.47, 0], 0.13, WHITE, 18, 0.09));
  det.push(box(0.3, 0.06, 0.18, 0, -0.88, 1.62, C(0x2b2e30), { round: 0.02 }));
  // tail skid guard (stinger)
  det.push(tube([[0, 0.02, -5.98], [0, -0.1, -6.08], [0, -0.13, -6.3], [0, -0.05, -6.5]], 0.028, STEEL, 8, 16));
  // static ports, drain masts
  for (const z of [-0.95, -1.15]) det.push(cyl([0.2, -0.86, z], [0.2, -0.95, z - 0.03], 0.008, C(0x1c1d1e), 6));
  const detail = mk(mergeGeometries(det), dark, { cast: false });
  body.add(detail);
  // registration on both boom sides
  const regMat = new THREE.MeshStandardMaterial({ map: registrationTexture('PT-TDM'), transparent: true, depthWrite: false, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 });
  const reg = new THREE.Mesh(mergeGeometries([registrationGeometry(1), registrationGeometry(-1)]), regMat);
  reg.layers.set(LAYER.WORLD);
  reg.renderOrder = 1;
  body.add(reg);
  root.add(body);

  // ---------------------------------------------------------------- main rotor
  // rotor (non-rotating, tilts with the tip-path plane) → spin (rotates about Y)
  const rotor = new THREE.Group();
  rotor.position.set(0, 1.62, 0);
  const spin = new THREE.Group();
  rotor.add(spin);
  {
    const hub = [];
    // mast, swashplate and pitch links, Starflex star, sleeves, elastomeric bearings, cap
    hub.push(cyl([0, -0.18, 0], [0, 0.06, 0], 0.07, C(0x8c9092), 14));
    hub.push(cyl([0, -0.2, 0], [0, -0.16, 0], 0.24, C(0x6a6e70), 24));
    hub.push(cyl([0, -0.16, 0], [0, -0.12, 0], 0.2, C(0x9da1a3), 24));
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU;
      const ca = Math.cos(a), sa = -Math.sin(a);
      const arm = new THREE.BoxGeometry(0.5, 0.045, 0.16);
      arm.translate(0.28, 0, 0); arm.rotateY(a);
      hub.push(part(arm, C(0x3a3f42)));
      const sleeve = new THREE.BoxGeometry(0.42, 0.09, 0.16);
      sleeve.translate(0.6, 0.0, 0); sleeve.rotateY(a);
      hub.push(part(sleeve, C(0x9a9ea0)));
      const brg = new THREE.CylinderGeometry(0.075, 0.075, 0.11, 14);
      brg.translate(0.32, 0, 0); brg.rotateY(a);
      hub.push(part(brg, C(0x1d1f20)));
      // frequency adapter and pitch horn with its link down to the swashplate
      const fa = new THREE.CylinderGeometry(0.045, 0.045, 0.2, 10); fa.rotateZ(Math.PI / 2); fa.translate(0.62, -0.08, 0.06); fa.rotateY(a);
      hub.push(part(fa, C(0x26292b)));
      const hx = 0.42 * ca + 0.1 * sa, hz = 0.42 * sa - 0.1 * ca;
      hub.push(cyl([hx * 0.92, -0.04, hz * 0.92], [hx * 0.55, -0.15, hz * 0.55], 0.012, C(0xb0b4b6), 6));
      // bolts at the blade root
      for (const d of [0.74, 0.8]) { const b = new THREE.CylinderGeometry(0.018, 0.018, 0.13, 8); b.translate(d, 0, 0); b.rotateY(a); hub.push(part(b, C(0xc4c8ca))); }
    }
    hub.push(cyl([0, 0.02, 0], [0, 0.08, 0], 0.2, C(0x34383a), 24, 0.16));
    const cap = new THREE.SphereGeometry(0.15, 18, 8, 0, TAU, 0, Math.PI / 2); cap.scale(1, 0.55, 1); cap.translate(0, 0.08, 0);
    hub.push(part(cap, C(0xd8d9d6)));
    spin.add(mk(mergeGeometries(hub), hubMat, { cast: true }));
  }
  const bladeHi = mainBladeGeometry(true), bladeLo = mainBladeGeometry(false);
  const blades = [];
  for (let k = 0; k < 3; k++) {
    const az = new THREE.Group();
    az.rotation.y = (k / 3) * TAU;
    const flap = new THREE.Group();
    flap.position.x = 0.16; // flapping hinge (the Starflex arm flexes here)
    const feather = new THREE.Group();
    const hi = mk(bladeHi, bladeMat);
    hi.position.x = -0.16;
    const lo = mk(bladeLo, bladeMat);
    lo.position.x = -0.16;
    lo.visible = false;
    feather.add(hi, lo);
    flap.add(feather);
    az.add(flap);
    spin.add(az);
    blades.push({ az, flap, feather, hi, lo });
  }
  const discMat = new THREE.MeshBasicMaterial({ map: rotorDiscTexture(0.13, 3, '220,100,40'), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const disc = new THREE.Mesh(ringGeometry(0.62, 5.38, 96), discMat);
  disc.position.y = 0.06;
  disc.layers.set(LAYER.WORLD);
  disc.renderOrder = 4;
  disc.castShadow = false;
  rotor.add(disc);
  // a spinning rotor still throws a shadow: three blade wedges through an alpha test. The shadow
  // pass takes map and alphaTest from the mesh's own material, so this is a mesh of its own that
  // draws nothing in the view (no colour, no depth) and only casts.
  const rotorShadow = new THREE.Mesh(ringGeometry(0.62, 5.38, 48), new THREE.MeshBasicMaterial({ map: rotorShadowTexture(), alphaTest: 0.5, colorWrite: false, depthWrite: false, side: THREE.DoubleSide }));
  rotorShadow.layers.set(LAYER.WORLD);
  rotorShadow.castShadow = false;
  rotorShadow.receiveShadow = false;
  disc.add(rotorShadow);
  root.add(rotor);

  // ---------------------------------------------------------------- tail rotor (left of the fin, axis along X)
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.24, 1.15, -6.5);
  const tailSpin = new THREE.Group();
  tailRotor.add(tailSpin);
  const tailBladeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.46, metalness: 0.2, vertexColors: true, transparent: true, opacity: 1 });
  patchMaterial(tailBladeMat, { wet: 0.3, key: 'heliTailBlade' });
  {
    const tb = [];
    for (const sgn of [1, -1]) {
      const NS = 8, NP = 6, pos = [], col = [], idx = [];
      const loopN = NP * 2;
      for (let i = 0; i <= NS; i++) {
        const s = i / NS, r = lerp(0.14, 0.93, s), ch = r < 0.24 ? lerp(0.1, 0.17, (r - 0.14) / 0.1) : 0.17;
        const rgb = r > 0.8 ? (Math.floor((r - 0.8) / 0.045) % 2 ? WHITE : C(0xc4301c)) : C(0x2b2e30);
        for (let k = 0; k < loopN; k++) {
          const up = k < NP, kk = up ? k : loopN - 1 - k;
          const f = (1 - Math.cos((kk / (NP - 1)) * Math.PI)) / 2;
          const w = (up ? 1 : -1) * airfoilT(f, 0.12) * ch;
          pos.push(w, sgn * r, sgn * (0.3 - f) * ch);
          col.push(...rgb);
        }
      }
      for (let i = 0; i < NS; i++) for (let k = 0; k < loopN; k++) { const k1 = (k + 1) % loopN; const a = i * loopN + k, b = i * loopN + k1, c = b + loopN, d = a + loopN; idx.push(a, d, b, b, d, c); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      tb.push(orient(g, V3(1, 0, 0), Math.floor(NS / 2) * loopN + 2));
    }
    tailSpin.add(mk(mergeGeometries(tb), tailBladeMat, { cast: false }));
    const th = [cyl([0.0, 0, 0], [0.09, 0, 0], 0.07, C(0x8c9092), 12), cyl([0.09, 0, 0], [0.12, 0, 0], 0.045, C(0x3a3d3f), 12)];
    th.push(box(0.05, 0.3, 0.08, 0.05, 0, 0, C(0x9a9ea0)));
    tailSpin.add(mk(mergeGeometries(th), hubMat, { cast: false }));
  }
  const tailDiscMat = new THREE.MeshBasicMaterial({ map: rotorDiscTexture(0.16, 2, '200,50,30'), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const tailDisc = new THREE.Mesh(ringGeometry(0.12, 0.95, 48), tailDiscMat);
  tailDisc.rotation.z = Math.PI / 2;
  tailDisc.position.x = 0.02;
  tailDisc.layers.set(LAYER.WORLD);
  tailDisc.renderOrder = 4;
  tailRotor.add(tailDisc);
  root.add(tailRotor);

  // ---------------------------------------------------------------- lights
  const glowTex = (() => {
    const cv = makeCanvas(64, 64);
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  })();
  const lensGeos = [];
  const sprite = (p, c, s = 0.9) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(...p);
    sp.scale.setScalar(s);
    sp.layers.set(LAYER.WORLD);
    return sp;
  };
  const lights = new THREE.Group();
  const nav = [];
  for (const [p, c, lc] of [[[1.19, STAB_Y + 0.33, -5.12], 0xff2a1a, 0xb8231a], [[-1.19, STAB_Y + 0.33, -5.12], 0x2aff5a, 0x1e9a42], [[0, 0.7, -6.86], 0xffffff, 0xd8d8d0]]) {
    lensGeos.push(sphere(0.035, p[0], p[1], p[2], C(lc), 1, 0.8, 1.4, 10));
    const sp = sprite(p, c);
    lights.add(sp);
    nav.push(sp);
  }
  lights.visible = false;
  root.add(lights);
  // anti-collision beacons (red, flashing while the engine runs): cowling top and belly
  const beacons = [];
  const beaconGroup = new THREE.Group();
  for (const p of [[0, 1.35, -2.25], [0, -0.92, -1.2]]) {
    lensGeos.push(sphere(0.04, p[0], p[1], p[2], C(0x9a1a12), 1, 0.7, 1.4, 10));
    const sp = sprite(p, 0xff2a1a, 1.2);
    beaconGroup.add(sp);
    beacons.push(sp);
  }
  beaconGroup.visible = false;
  root.add(beaconGroup);
  for (const sx of [0.09, -0.09]) lensGeos.push(sphere(0.045, sx, -0.92, 1.62, C(0xe8eef0), 1, 0.5, 1, 12));
  body.add(mk(mergeGeometries(lensGeos), lens, { cast: false }));

  const pieces = [body];
  for (const p of pieces) p.userData.home = { position: p.position.clone(), quaternion: p.quaternion.clone() };

  // ---------------------------------------------------------------- level of detail
  let level = -1;
  const updateLOD = (d) => {
    const edges = [50, 160, 280];
    let target = edges.findIndex((e) => d < e);
    if (target < 0) target = 3;
    if (level >= 0 && target !== level) {
      const edge = edges[Math.min(target, level)];
      if (Math.abs(d - edge) < 6) target = level;
    }
    if (target === level) return;
    level = target;
    interior.visible = level === 0;
    detail.visible = level <= 1;
    reg.visible = level <= 2;
    shellHi.visible = level <= 2;
    shellLo.visible = level === 3;
    for (const b of blades) { b.hi.visible = level <= 1; b.lo.visible = level >= 2; }
    tailSpin.visible = level <= 2;
  };
  updateLOD(0);
  timing.geometry = performance.now() - t0;

  return {
    root, body, pieces,
    rotor, spin, blades, bladeMat, disc, discMat, rotorShadow,
    tailRotor, tailSpin, tailBladeMat, tailDisc, tailDiscMat,
    cyclics, collective, pedals,
    lights, nav, beaconGroup, beacons,
    glassMat: glass,
    panel: { canvas: panelCanvas, ctx: panelCanvas.getContext('2d'), texture: panelTex },
    eye: new THREE.Vector3(-0.42, 0.42, 0.74),
    updateLOD, timing,
    get lod() { return level; },
  };
}
