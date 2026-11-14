// Procedural Air Tractor AT-401B (fictional registration PR-ATR): the radial
// Air Tractor, its own geometry — nothing taken from the AT-502B / AT-802
// models or from the reference FS2004 package (its MDL is not imported or
// decoded; its aircraft.cfg only confirmed the layout). VISUAL ONLY: the
// physics (FLIGHT_AT401), gear contact points and hard points live in
// src/config.js; the gear points are read here only to place the wheels.
// Body frame: +Z nose, +Y up, +X left wing; origin = CG (25 % of the chord).
//
// Reference map (the side photograph PR-DDD — prop removed, the cowl ring
// and hub clear — rotated to the 10.6° three-point attitude and scaled by
// the published 8.23 m length; the photographs N7317E, the low front
// views, the S.A.E. yellow 401 for the cowl and exhaust; published span
// 15.57 m, the R-1340's 1.31 m diameter):
//   hub 2.62 · prop plane 2.42 · cowl ring 2.12 … 1.74 (Ø 1.31) · accessory
//   section to 1.55 · hopper deck 0.87 rising to the windshield base
//   1.13 at −0.56 · roof −1.19 … −1.82 (1.69 … 1.76) · the canopy's rear
//   fairing down to the dorsal at −2.58 · fin LE −3.97 (root) … −4.56 (top,
//   2.24), fin top 2.27, rudder TE −5.61 · tailplane at 0.78, braced below ·
//   wing LE 0.46, 1.83 m chord · main axle 0.78, track 2.8 · tailwheel −5.45.
// What makes it an AT-401B: the big round ring cowl with the nine cylinders
// showing; the slab-sided hopper section rising to a tall canopy with a
// rounded roof, set well aft; the long tapering rear fuselage to a tall
// swept fin; the strut-braced tailplane; the long constant-chord wing with
// big flaps and squared tips; spring main legs on big tyres; a two-blade
// Hamilton Standard on a bare hub.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { rng, clamp, smoothstep, lerp } from '../core/math.js';
import { FLIGHT_AT401 } from '../config.js';
import {
  loft, K, sampleStations, ring, airfoil, wingPanel, flipWinding, tagged, tx, rod, tube, bar, ball, rbox, lathe, grid,
  speckle, orangePeel, treadTexture, propDiscTexture, WING_SPAN_UV, buildPilot,
} from './model.js';
import { buildAT401Cockpit } from './at401Cockpit.js';

const A = FLIGHT_AT401;
export const AT401_WING = { rootX: 0.52, tipX: 7.6, half: 7.785, rootY: -0.33, le: 0.46, chord: 1.83, dih: Math.tan((2.5 * Math.PI) / 180) };
const W = AT401_WING;
export const at401WingY = (x) => W.rootY + Math.max(0, Math.abs(x) - W.rootX) * W.dih;
const AX = 0.2; // thrust line above the CG
const EZ = 1.93; // cylinder plane
const SPAN_UV = 7.9;
export const AT401_SHADOW = { W: 17.5, L: 10.6, wing: [7.8, -1.37, 0.46], fus: [0.6, -5.64, 2.62], tail: [2.7, -5.4, -4.35], core: [5.6, 3.4] };

// ---------------------------------------------------------------------------
// Paint schemes. A — yellow with the blue band between black pinlines,
// blue fin band (the Brazilian S.A.E. / PR-DDD style); B — factory yellow
// with the black cheat line, black fin band and blue tip bands (N7317E).
const YELLOW = '#f2c414', BLUE = '#2140a0', BLACK = '#151617', WHITE = '#f3f3ee';
export const AT401_LIVERIES = [
  { id: 'sae', name: 'Paint A — yellow, blue band', base: YELLOW, band: BLUE, pin: BLACK, fin: BLUE, tip: YELLOW, text: BLACK },
  { id: 'factory', name: 'Paint B — factory yellow, black line', base: YELLOW, band: BLACK, pin: null, fin: BLACK, tip: BLUE, text: BLACK },
];

// ---------------------------------------------------------------------------
// Forward fuselage behind the ring cowl K(z, hw, ys, yb, yt, pU, pL): the
// accessory section inside the ring, opening to the slab-sided hopper bay,
// its deck rising to the windshield's base.
const FWD_KEYS = [
  K(1.78, 0.6, AX, AX - 0.6, AX + 0.6, 2.05, 2.05),
  K(1.6, 0.6, 0.16, -0.42, 0.8, 2.4, 2.4),
  K(1.35, 0.58, 0.1, -0.4, 0.86, 3.0, 3.0),
  K(0.9, 0.565, 0.08, -0.39, 0.92, 3.6, 3.6),
  K(0.2, 0.555, 0.06, -0.38, 1.02, 4.0, 4.0),
  K(-0.56, 0.53, 0.06, -0.37, 1.13, 7.0, 4.5),
];
// Cabin and aft fuselage: the box under the longerons and the shell over
// them (canopy, rear fairing, dorsal) — [z, half width, longeron y,
// side→belly y, bottom y, belly exponent].
export const CAB = { wsB: -0.56, roofF: -1.19, roofR: -1.82, bPost: -1.78, fair: -2.58, sill: 0.95, roof: 1.76, end: -5.44 };
const BOX = [
  [CAB.wsB, 0.53, 0.95, 0.06, -0.37, 4.5],
  [-1.4, 0.51, 0.95, 0.08, -0.36, 4.2],
  [CAB.fair, 0.47, 0.93, 0.12, -0.28, 3.8],
  [-3.5, 0.36, 0.86, 0.17, -0.12, 3.2],
  [-4.5, 0.22, 0.79, 0.24, 0.1, 2.8],
  [CAB.end, 0.08, 0.74, 0.34, 0.33, 2.4],
];
const CREST = [[CAB.wsB, 1.13], [-0.7, 1.31], [-0.86, 1.5], [-1.02, 1.63], [-1.19, 1.69], [-1.5, 1.74], [-1.82, 1.76], [-2.05, 1.63],
  [-2.3, 1.43], [-2.58, 1.26], [-3.27, 1.1], [-3.97, 0.95], [-4.6, 0.87], [CAB.end, 0.8]];
function pchip(Kn) {
  const n = Kn.length, xs = Kn.map((k) => -k[0]), ys = Kn.map((k) => k[1]);
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return (z) => {
    const x = -z;
    let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = clamp((x - xs[i]) / h, 0, 1), t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
export const crestY = pchip(CREST);
export const boxAt = (z) => {
  let i = 0; while (i < BOX.length - 2 && z < BOX[i + 1][0]) i++;
  const a = BOX[i], b = BOX[i + 1], t = clamp((a[0] - z) / (a[0] - b[0]), 0, 1), s = t * t * (3 - 2 * t) * 0.35 + t * 0.65;
  return { w: lerp(a[1], b[1], s), yl: lerp(a[2], b[2], s), ys: lerp(a[3], b[3], s), yb: lerp(a[4], b[4], s), p: lerp(a[5], b[5], s) };
};
// Shell: in the cabin a rounded canopy (its roof narrower than the
// fuselage), behind the roof the fairing rounding off into the dorsal.
const cabinF = (z) => 1 - smoothstep(CAB.roofR - 0.1, CAB.fair - 0.2, z);
export const shellP = (z, t) => {
  const b = boxAt(z), top = Math.max(b.yl + 0.002, crestY(z)), f = cabinF(z);
  const p = lerp(2.3, 3.4, f), lean = lerp(1, 0.78, f);
  const a = Math.PI * t, c = Math.cos(a), sn = Math.sin(a);
  const v = Math.abs(sn) ** (2 / p);
  return [b.w * Math.sign(c) * Math.abs(c) ** (2 / p) * lerp(1, lean, v), b.yl + (top - b.yl) * v, z];
};
export const boxX = (z, y) => {
  const b = boxAt(z);
  if (y >= b.ys) return b.w;
  const t = clamp((b.ys - y) / (b.ys - b.yb), 0, 1);
  return b.w * Math.max(0, 1 - t ** b.p) ** (1 / b.p);
};

// ---------------------------------------------------------------------------
// Livery: side projection (top half left side, bottom half right side).
const LV = { Z0: -5.9, Z1: 2.25, Y0: -0.6, Y1: 2.4, W: 2048, H: 1024, M: 6 };
LV.kx = LV.W / (LV.Z1 - LV.Z0);
LV.ky = (LV.H / 2 - 2 * LV.M) / (LV.Y1 - LV.Y0);
const lvPix = (side, z, y) => [side > 0 ? (LV.Z1 - z) * LV.kx : (z - LV.Z0) * LV.kx, (side > 0 ? 0 : LV.H / 2) + LV.M + (LV.Y1 - y) * LV.ky];
function liveryUV(geo) {
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let t = 0; t < p.count; t += 3) {
    const side = p.getX(t) + p.getX(t + 1) + p.getX(t + 2) >= 0 ? 1 : -1;
    for (let k = t; k < t + 3; k++) {
      const [px, py] = lvPix(side, p.getZ(k), p.getY(k));
      uv[k * 2] = px / LV.W;
      uv[k * 2 + 1] = 1 - py / LV.H;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
const FIN = { root: [-3.97, 0.92], top: [-4.56, 2.24], topY: 2.27, hinge: -5.06, te: -5.61, bottom: 0.3 };
const bandY = (z) => lerp(0.37, 0.49, (1.6 - z) / (1.6 + 5.5));

function liveryTextures(reg, L = AT401_LIVERIES[0]) {
  const c = canvas(LV.W, LV.H), b = canvas(LV.W, LV.H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, LV.W, LV.H);
  orangePeel(gb, LV.W, LV.H, 91);
  for (const side of [1, -1]) {
    const P = (z, y) => lvPix(side, z, y);
    const oy = side > 0 ? 0 : LV.H / 2;
    const path = (ctx, pts) => { ctx.beginPath(); pts.forEach(([z, y], i) => { const [px, py] = P(z, y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); };
    const poly = (pts, fill) => { path(g, pts); g.closePath(); g.fillStyle = fill; g.fill(); };
    const line = (ctx, pts, col, w) => { path(ctx, pts); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
    const text = (z, y, str, hM, col, font = 'bold', stretch = 1) => {
      const [px, py] = P(z, y);
      g.save();
      g.font = `${font} ${Math.round(hM * LV.ky * 1.25)}px Arial`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.setTransform(1, 0, 0, 1, px, py);
      g.scale((LV.kx / LV.ky) * stretch, 1);
      g.fillStyle = col; g.fillText(str, 0, 0);
      g.restore();
    };
    g.save();
    g.beginPath(); g.rect(0, oy, LV.W, LV.H / 2); g.clip();
    g.fillStyle = L.base; g.fillRect(0, oy, LV.W, LV.H / 2);
    // The cheat line: straight from the cowl's rear to the tail post.
    const z0 = 2.2, z1 = -5.6;
    const bandH = L.pin ? 0.075 : 0.045;
    poly([[z0, bandY(z0) + bandH], [z1, bandY(z1) + bandH], [z1, bandY(z1) - bandH], [z0, bandY(z0) - bandH]], L.band);
    if (L.pin) for (const s of [1, -1]) poly([[z0, bandY(z0) + s * (bandH + 0.022)], [z1, bandY(z1) + s * (bandH + 0.022)], [z1, bandY(z1) + s * (bandH + 0.036)], [z0, bandY(z0) + s * (bandH + 0.036)]], L.pin);
    // Fin band near the top, with pinlines on paint A.
    poly([[-3.6, 1.93], [-6.0, 1.93], [-6.0, 2.08], [-3.6, 2.08]], L.fin);
    if (L.pin) for (const y of [1.9, 2.1]) poly([[-3.6, y], [-6.0, y], [-6.0, y + 0.015], [-3.6, y + 0.015]], L.pin);
    text(-3.2, 0.12, reg, 0.3, L.text, 'bold', 1.08);
    text(-1.0, 0.75, 'AIR TRACTOR', 0.06, L.text, 'italic bold');
    text(-4.75, 1.45, 'AT-401B', 0.07, L.text, 'bold');
    // Belly grime, the exhaust soot along the right side.
    const [, belly] = P(0, -0.28);
    const grd = g.createLinearGradient(0, belly, 0, oy + LV.H / 2);
    grd.addColorStop(0, 'rgba(60,50,30,0)'); grd.addColorStop(1, 'rgba(60,50,30,0.26)');
    g.fillStyle = grd; g.fillRect(0, belly, LV.W, oy + LV.H / 2 - belly);
    if (side < 0) {
      const [ax, ay] = P(1.4, -0.3), [bx] = P(-1.4, -0.3);
      const sg = g.createLinearGradient(ax, 0, bx, 0);
      sg.addColorStop(0, 'rgba(30,25,20,0.4)'); sg.addColorStop(1, 'rgba(30,25,20,0)');
      g.fillStyle = sg;
      g.beginPath(); g.ellipse((ax + bx) / 2, ay + 8, Math.abs(bx - ax) / 2, 0.14 * LV.ky, 0, 0, Math.PI * 2); g.fill();
    }
    // Seams with rivets: accessory cowl, hopper bay, cabin frames, the
    // door, aft frames, tail access door.
    const seams = [
      [[1.6, -0.42], [1.6, 0.8]], [[1.0, -0.39], [1.0, 0.9]], [[0.2, -0.38], [0.2, 1.02]], [[CAB.wsB, -0.37], [CAB.wsB, 0.95]],
      [[CAB.fair, -0.28], [CAB.fair, 0.93]], [[-3.3, -0.16], [-3.3, 0.88]], [[-4.2, 0.03], [-4.2, 0.82]], [[1.0, 0.05], [CAB.fair, 0.12]],
    ];
    if (side > 0) seams.push([[-0.75, 0.95], [-0.75, 0.15], [-1.7, 0.15], [-1.7, 0.95]]);
    for (const s of seams) {
      line(g, s, 'rgba(90,70,0,0.3)', 2); line(gb, s, '#3c3c3c', 2.6);
      for (let q = 0; q < s.length - 1; q++) {
        const [[za, ya], [zb, yb]] = [s[q], s[q + 1]];
        const n = Math.max(2, Math.round(Math.hypot(za - zb, ya - yb) / 0.06));
        for (let k = 0; k <= n; k++) {
          const [px, py] = P(za + ((zb - za) * k) / n + 0.022, ya + ((yb - ya) * k) / n);
          g.fillStyle = 'rgba(90,70,0,0.28)'; g.fillRect(px - 1, py - 1, 2, 2);
          gb.fillStyle = '#5c5c5c'; gb.beginPath(); gb.arc(px, py, 1.3, 0, Math.PI * 2); gb.fill();
        }
      }
    }
    text(0.6, -0.25, 'AVGAS 100', 0.03, 'rgba(30,30,30,0.7)', 'bold');
    speckle(g, 0, oy, LV.W, LV.H / 2, 2600, side > 0 ? 51 : 52, 0.08);
    g.restore();
  }
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}

function wingTextures(L = AT401_LIVERIES[0]) {
  const Wd = 2048, H = 512;
  const c = canvas(Wd, H), b = canvas(Wd, H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  g.fillStyle = L.base; g.fillRect(0, 0, Wd, H);
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, Wd, H);
  orangePeel(gb, Wd, H, 93);
  const X = (m) => (m / SPAN_UV) * Wd, Y = (f) => f * H;
  if (L.tip !== L.base) { g.fillStyle = L.tip; g.fillRect(X(W.tipX - 0.35), 0, X(0.22), H); }
  const r = rng(57);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(80,80,70,${0.02 + r() * 0.035})`; g.fillRect(r() * Wd, Y(0.1 + r() * 0.8), 2 + r() * 3, 30 + r() * 110); }
  for (let i = 0; i < 1200; i++) { g.fillStyle = `rgba(60,48,30,${0.06 + r() * 0.12})`; g.fillRect(r() * Wd, Y(r() * 0.05), 1 + r() * 2, 1 + r() * 2); }
  const seam = (x0, y0, x1, y1) => {
    g.strokeStyle = 'rgba(90,70,0,0.28)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    gb.strokeStyle = '#3e3e3e'; gb.lineWidth = 2.6; gb.beginPath(); gb.moveTo(x0, y0); gb.lineTo(x1, y1); gb.stroke();
    const n = Math.max(2, Math.round(Math.hypot((x1 - x0) / (Wd / SPAN_UV), ((y1 - y0) / H) * W.chord) / 0.055));
    for (let k = 0; k <= n; k++) { const px = x0 + ((x1 - x0) * k) / n + 0.5, py = y0 + ((y1 - y0) * k) / n + 5; gb.fillStyle = '#5c5c5c'; gb.beginPath(); gb.arc(px, py, 1.3, 0, Math.PI * 2); gb.fill(); }
  };
  for (const f of [0.12, 0.3, 0.72]) seam(X(0.4), Y(f), X(7.7), Y(f));
  for (let x = 1.0; x < 7.6; x += 0.55) seam(X(x), Y(0.0), X(x), Y(0.72));
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, Y(0.742), Wd, 4);
  gb.fillStyle = '#202020'; gb.fillRect(0, Y(0.742), Wd, 6);
  speckle(g, 0, 0, Wd, H, 2600, 59, 0.07);
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}
const wingP = (stations, prof, side, ao) => {
  const g = wingPanel(stations, prof, side, ao);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * WING_SPAN_UV) / SPAN_UV);
  return g;
};

export const AT401_DIM = { hubZ: 2.62, rudderZ: FIN.te, axisY: AX };
export function at401Extent() {
  return { span: 2 * W.half, length: AT401_DIM.hubZ - AT401_DIM.rudderZ, tops: [[0, CAB.roof + 0.01, -1.6], [0, FIN.topY, FIN.hinge]] };
}

// One R-1340 cylinder along +Y from the crank axis (local frame): finned
// steel barrel, finned head, rocker boxes, push-rods, plug lead.
function cylinderParts(R0, R1) {
  const parts = { barrel: [], head: [], rod: [] };
  const L = R1 - R0, hb = L * 0.5;
  const fins = [], nf = 12;
  for (let i = 0; i <= nf; i++) { const y = R0 + (hb * i) / nf; fins.push([0.08, y], [i % 2 ? 0.076 : 0.108, y + hb / nf / 2]); }
  parts.barrel.push(lathe(fins, 12));
  const head = [], nh = 8, h0 = R0 + hb, hh = L - hb;
  for (let i = 0; i <= nh; i++) { const y = h0 + (hh * 0.78 * i) / nh; head.push([0.09, y], [i % 2 ? 0.085 : 0.132 - 0.014 * (i / nh), y + (hh * 0.78) / nh / 2]); }
  head.push([0.07, R1 - 0.02], [0.04, R1], [0.0, R1 + 0.005]);
  parts.head.push(lathe(head, 12).scale(1.15, 1, 0.95));
  for (const s of [-1, 1]) {
    parts.head.push(tx(new THREE.BoxGeometry(0.06, 0.05, 0.07), s * 0.066, R1 - 0.05, 0.08));
    parts.rod.push(rod([s * 0.05, R0 + 0.02, 0.1], [s * 0.056, R1 - 0.07, 0.09], 0.009, 6));
  }
  parts.rod.push(rod([0, R1 - 0.1, 0.11], [0, R1 - 0.03, 0.125], 0.006, 5));
  return parts;
}
// Hamilton Standard blade (+X): wide, round-tipped, twisted.
function bladeLoft(r0, r1, steps, R) {
  const pos = [], idx = [];
  let n = 0;
  for (let i = 0; i <= steps; i++) {
    const r = r0 + ((r1 - r0) * i) / steps;
    const f = clamp((r - 0.2) / (R - 0.2), 0, 1);
    let c = 0.13 + 0.1 * Math.sin(Math.PI * Math.min(1, f * 0.8 + 0.2)) ** 0.7;
    if (f > 0.84) c *= Math.sqrt(Math.max(0.05, 1 - ((f - 0.84) / 0.16) ** 2));
    const t = lerp(0.26, 0.07, f);
    const beta = Math.atan(2.2 / (2 * Math.PI * Math.max(r, 0.24)));
    const prof = airfoil(0, 1, t, 0.03, 0.35, 8);
    n = prof.length;
    for (const [xc, yc] of prof) {
      const Y = (xc - 0.35) * c, Z = yc * c;
      pos.push(r, Y * Math.cos(beta) - Z * Math.sin(beta), Y * Math.sin(beta) + Z * Math.cos(beta));
    }
  }
  for (let i = 0; i < steps; i++) for (let k = 0; k < n - 1; k++) { const a = i * n + k, b = a + 1, c = a + n, d = c + 1; idx.push(a, c, b, b, c, d); }
  const base = steps * n;
  for (let k = 1; k < n - 1; k++) idx.push(base, base + k, base + k + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Pilot and cockpit anchors (body frame), on this cabin (the reference
// package's eyepoint: ≈ 1.36 m aft of the datum).
export const AT401_CABIN = {
  eye: [0, 1.4, -1.4], seat: [0, 0.45, -1.62], floorY: 0.0,
  roof: [0, CAB.roof, -1.5], door: [0.5, 1.2, -1.2], windshield: [0, 1.4, -0.85],
};

// ==========================================================================
export function createAT401Model(panel, opts = {}) {
  const root = new THREE.Group();
  root.name = 'at401';
  let REG = opts.reg ?? 'PR-ATR', livery = 0;
  const L0 = AT401_LIVERIES[0];
  const liv = liveryTextures(REG, L0), wtx = wingTextures(L0);
  const coat = { roughness: 0.46, metalness: 0.0, specularIntensity: 0.35, clearcoat: 0.22, clearcoatRoughness: 0.3, envMap: opts.envMap ?? null, envMapIntensity: 0.3 };
  const ALB = 0.86;
  const col = (c) => new THREE.Color(c).multiplyScalar(ALB);
  const phys = (c, extra = {}) => new THREE.MeshPhysicalMaterial({ color: col(c), vertexColors: true, ...coat, ...extra });
  const M = {
    livery: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALB), map: liv.map, bumpMap: liv.bump, bumpScale: 1.3, vertexColors: true, ...coat }),
    wing: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALB), map: wtx.map, bumpMap: wtx.bump, bumpScale: 1.3, vertexColors: true, ...coat }),
    paint: phys(YELLOW),
    roof: phys(YELLOW, { side: THREE.DoubleSide }),
    frame: phys(YELLOW),
    tip: phys(L0.tip),
    lid: new THREE.MeshPhysicalMaterial({ color: 0x9b8a62, roughness: 0.45, metalness: 0.25, clearcoat: 0.3, vertexColors: true, side: THREE.DoubleSide, envMap: opts.envMap ?? null, envMapIntensity: 0.4 }),
    ink: new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.6, vertexColors: true }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.62, metalness: 0.1, vertexColors: true, side: THREE.DoubleSide }),
    deck: new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.93, vertexColors: true }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.28, metalness: 0.92, vertexColors: true }),
    polished: new THREE.MeshStandardMaterial({ color: 0xe6e8ea, roughness: 0.14, metalness: 1.0, envMap: opts.envMap ?? null, envMapIntensity: 1.0, vertexColors: true }),
    steel: new THREE.MeshStandardMaterial({ color: 0x5c6166, roughness: 0.42, metalness: 0.85, vertexColors: true }),
    cyl: new THREE.MeshStandardMaterial({ color: 0x404346, roughness: 0.5, metalness: 0.75, vertexColors: true }),
    head: new THREE.MeshStandardMaterial({ color: 0x8b8e91, roughness: 0.42, metalness: 0.8, vertexColors: true }),
    crank: new THREE.MeshStandardMaterial({ color: 0x232527, roughness: 0.5, metalness: 0.45, vertexColors: true }),
    exhaust: new THREE.MeshStandardMaterial({ color: 0x8b8178, roughness: 0.48, metalness: 0.85, vertexColors: true }),
    soot: new THREE.MeshStandardMaterial({ color: 0x2c2722, roughness: 0.7, metalness: 0.6, vertexColors: true }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.94, vertexColors: true }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92, metalness: 0, bumpMap: treadTexture(), bumpScale: 2.5 }),
    gloss: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.28, metalness: 0.1, vertexColors: true }),
    hub: new THREE.MeshStandardMaterial({ color: 0xdadcdc, roughness: 0.35, metalness: 0.5, vertexColors: true }),
    wire: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.35, metalness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xa8bcc6, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.12, clearcoat: 0.35, clearcoatRoughness: 0.08, specularIntensity: 0.35, envMapIntensity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false }),
    interior: new THREE.MeshStandardMaterial({ color: 0xd1a51c, roughness: 0.7, metalness: 0.1, vertexColors: true, side: THREE.DoubleSide }), // yellow inside
    seat: new THREE.MeshStandardMaterial({ color: 0x9a3a36, roughness: 0.82, vertexColors: true }),
    harness: new THREE.MeshStandardMaterial({ color: 0x2d3a52, roughness: 0.8 }),
    red: new THREE.MeshStandardMaterial({ color: 0xc8261b, roughness: 0.45, emissive: 0x330000, vertexColors: true }),
    green: new THREE.MeshStandardMaterial({ color: 0x1f9a3a, roughness: 0.45, emissive: 0x002200, vertexColors: true }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xf2c21b, roughness: 0.45, vertexColors: true }),
    orange: new THREE.MeshStandardMaterial({ color: 0xf0561c, roughness: 0.5 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb8913c, roughness: 0.35, metalness: 0.9, vertexColors: true }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35, emissive: 0x222222, vertexColors: true }),
    beacon: new THREE.MeshStandardMaterial({ color: 0xd8261b, roughness: 0.3, emissive: 0xff2010, emissiveIntensity: 0, vertexColors: true }),
    strobe: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.2, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true }),
    suit: new THREE.MeshStandardMaterial({ color: 0x3f4a58, roughness: 0.88 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.75 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xb88462, roughness: 0.7 }),
    helmet: new THREE.MeshPhysicalMaterial({ color: 0xeeeae2, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x15181c, roughness: 0.05, metalness: 0.3, clearcoat: 1 }),
    helmStripe: new THREE.MeshPhysicalMaterial({ color: 0x1d4c9c, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
  };
  const B = {};
  const add = (mat, g, fine = false) => { const k = (fine ? 'fine:' : '') + mat; (B[k] ||= []).push(tagged(g)); };

  // ---------------- fuselage ----------------
  const fusAO = (x, y, z) => {
    let a = 1 - Math.max(0, -y - 0.15) * 0.45;
    const yb = Math.max(0, 1 - Math.abs(y + 0.33) / 0.2), zb = Math.max(0, 1 - Math.abs(z + 0.45) / 1.2);
    a *= 1 - 0.32 * yb * Math.sqrt(zb);
    if (z < -3.9 && z > -5.5) a *= 1 - 0.18 * Math.max(0, 1 - Math.abs(y - 0.78) / 0.12);
    if (z > 1.5) a *= 0.8 + 0.2 * clamp((1.78 - z) / 0.28, 0, 1);
    return clamp(a, 0.5, 1);
  };
  const fwdSt = sampleStations(FWD_KEYS, 22);
  add('livery', liveryUV(tagged(loft(fwdSt, 60, fusAO))));
  const zsAft = [];
  for (let z = CAB.wsB; z > CAB.end + 1e-6; z -= 0.09) zsAft.push(z);
  zsAft.push(CAB.end);
  const rings = (fn, n, zs) => {
    const pos = [], cl = [], idx = [];
    for (const z of zs) for (let k = 0; k <= n; k++) { const [x, y] = fn(z, k / n); pos.push(x, y, z); const gg = fusAO(x, y, z); cl.push(gg, gg, gg); }
    for (let si = 0; si < zs.length - 1; si++) for (let k = 0; k < n; k++) { const a = si * (n + 1) + k, b = a + 1, c = a + n + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  const boxRing = (z, u) => {
    const b = boxAt(z), side = 0.2;
    if (u <= side) return [b.w, lerp(b.yl, b.ys, u / side)];
    if (u >= 1 - side) return [-b.w, lerp(b.ys, b.yl, (u - (1 - side)) / side)];
    const a = Math.PI + Math.PI * ((u - side) / (1 - 2 * side)), c = Math.cos(a), sn = Math.sin(a);
    return [-b.w * Math.sign(c) * Math.abs(c) ** (2 / b.p), b.ys - (b.ys - b.yb) * Math.abs(sn) ** (2 / b.p)];
  };
  add('livery', liveryUV(tagged(rings(boxRing, 40, zsAft))));
  // Collar at the windshield base (the hopper bay's section into the box
  // and the canopy's foot).
  {
    const outer = []; for (let k = 0; k <= 40; k++) outer.push(new THREE.Vector2(...boxRing(CAB.wsB, k / 40)));
    for (let k = 1; k < 30; k++) { const [x, y] = shellP(CAB.wsB, 1 - k / 30); outer.push(new THREE.Vector2(x, y)); }
    const sh = new THREE.Shape(outer);
    const st = fwdSt[fwdSt.length - 1], cy = (st.yt + st.yb) / 2;
    sh.holes.push(new THREE.Path(ring(st, 60).slice(0, -1).reverse().map(([x, y]) => new THREE.Vector2(x * 0.996, cy + (y - cy) * 0.996))));
    add('livery', liveryUV(tagged(tx(new THREE.ShapeGeometry(sh), 0, 0, CAB.wsB - 0.002))));
  }
  // Tail post.
  {
    const pts = []; for (let k = 0; k <= 40; k++) pts.push(new THREE.Vector2(...boxRing(CAB.end, k / 40)));
    for (let k = 1; k < 24; k++) { const [x, y] = shellP(CAB.end, 1 - k / 24); pts.push(new THREE.Vector2(x, y)); }
    const cap = new THREE.ShapeGeometry(new THREE.Shape(pts));
    cap.scale(-1, 1, 1); cap.translate(0, 0, CAB.end);
    add('livery', liveryUV(tagged(cap)));
  }

  // ---------------- ring cowl and the R-1340 ----------------
  {
    // Ring cowl: outer skin (painted, the livery's band runs over it),
    // rolled lip, inner skin (dark).
    const RO = 0.655, RI = 0.6;
    const outer = lathe([[RI + 0.012, 2.125], [RO - 0.02, 2.14], [RO, 2.11], [RO + 0.002, 1.95], [RO - 0.005, 1.78], [0.62, 1.72], [RI, 1.72]], 64);
    outer.rotateX(Math.PI / 2); outer.translate(0, AX, 0);
    add('livery', liveryUV(tagged(flipWinding(outer))));
    const inner = lathe([[RI, 1.72], [RI, 1.98], [RI + 0.012, 2.125]], 64);
    inner.rotateX(Math.PI / 2); inner.translate(0, AX, 0);
    add('dark', flipWinding(inner));
    // Nine cylinders on the crankcase, the nose case, ignition harness,
    // push-rods; intake pipes; exhaust stacks into the collector ring and
    // the stack on the right side, low.
    const cyl = cylinderParts(0.27, 0.6);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const m = new THREE.Matrix4().makeRotationZ(a).premultiply(new THREE.Matrix4().makeTranslation(0, AX, EZ));
      for (const g of cyl.barrel) add('cyl', g.clone().applyMatrix4(m));
      for (const g of cyl.head) add('head', g.clone().applyMatrix4(m));
      for (const g of cyl.rod) add('steel', g.clone().applyMatrix4(m), true);
      const rot = (p) => new THREE.Vector3(...p).applyMatrix4(m).toArray();
      add('steel', tube([rot([0, 0.22, -0.16]), rot([0, 0.36, -0.15]), rot([0.015, 0.47, -0.09])], 0.02, 8, 6), true);
      add('exhaust', tube([rot([0, 0.53, -0.08]), rot([0, 0.5, -0.18]), rot([0, 0.46, -0.22])], 0.028, 8, 6));
    }
    const crank = lathe([[0.0, EZ - 0.22], [0.24, EZ - 0.22], [0.3, EZ - 0.1], [0.31, EZ + 0.05], [0.26, EZ + 0.11]], 32);
    crank.rotateX(Math.PI / 2); crank.translate(0, AX, 0);
    add('crank', crank);
    const nose = lathe([[0.25, EZ + 0.1], [0.22, EZ + 0.18], [0.17, 2.32], [0.1, 2.38], [0.0, 2.39]], 28);
    nose.rotateX(Math.PI / 2); nose.translate(0, AX, 0);
    add('crank', nose);
    add('steel', tx(new THREE.TorusGeometry(0.35, 0.013, 6, 40), 0, AX, EZ + 0.08), true);
    add('exhaust', tx(new THREE.TorusGeometry(0.48, 0.045, 8, 48), 0, AX, EZ - 0.25));
    // The stack: from the collector down the right side under the cowl.
    add('exhaust', tube([[-0.36, AX - 0.32, EZ - 0.25], [-0.56, -0.3, 1.55], [-0.6, -0.38, 1.25], [-0.6, -0.42, 1.0]], 0.06, 20, 10));
    add('soot', tx(new THREE.CylinderGeometry(0.062, 0.062, 0.05, 12), -0.6, -0.425, 0.98, Math.PI / 2 - 0.05));
    // Baffle closing the fuselage's nose behind the cylinders.
    const bf = new THREE.Shape(ring(fwdSt[0], 56).slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y)));
    add('dark', tx(new THREE.ShapeGeometry(bf), 0, 0, fwdSt[0].z));
    add('dark', tx(new THREE.ShapeGeometry(bf), 0, 0, fwdSt[0].z - 0.001, 0, Math.PI, 0));
    // Carburettor air scoop under the accessory section, oil cooler (left).
    add('livery', liveryUV(tagged(rbox(0.26, 0.14, 0.42, 0.04, 0, -0.43, 1.45))));
    add('dark', rbox(0.2, 0.08, 0.02, 0.01, 0, -0.43, 1.665));
    add('dark', rbox(0.24, 0.18, 0.12, 0.02, 0.3, -0.3, 1.5));
  }
  // Hopper: the lid on the deck between the cowl and the windshield, its
  // frame and the loading box at its front; vent.
  const topY = (z) => (z > CAB.wsB ? fwdSt.reduce((b, s) => (Math.abs(s.z - z) < Math.abs(b.z - z) ? s : b)).yt : crestY(z));
  {
    const st = fwdSt.filter((s) => s.z <= 1.3 && s.z >= -0.45).map((s) => ({ ...s, hw: s.hw * 0.74, yt: s.yt + 0.012, ys: s.yt - 0.07 }));
    add('lid', loft(st, 18, null, [Math.PI * 0.2, Math.PI * 0.8]));
    for (const z of [1.3, -0.45]) add('dark', tx(new THREE.BoxGeometry(0.82, 0.02, 0.03), 0, topY(z) + 0.006, z));
    for (const sx of [1, -1]) add('dark', tube(st.map((s) => [sx * s.hw * 0.95, s.yt - 0.03, s.z]), 0.011, 18, 6));
    add('alu', rbox(0.34, 0.12, 0.24, 0.02, 0, topY(1.05) + 0.06, 1.05));
    add('dark', rbox(0.28, 0.02, 0.18, 0.008, 0, topY(1.05) + 0.125, 1.05), true);
    add('dark', tx(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 10), 0.3, topY(0.3) + 0.04, 0.3));
  }
  // Gatebox under the hopper, loading coupler (left).
  add('dark', rbox(0.4, 0.09, 0.5, 0.02, 0, -0.42, 0.45));
  add('dark', tx(new THREE.CylinderGeometry(0.07, 0.07, 0.09, 18), 0.565, -0.2, 0.0, 0, 0, Math.PI / 2));
  add('brass', tx(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 18), 0.6, -0.2, 0.0, 0, 0, Math.PI / 2));

  // ---------------- canopy, rear fairing and dorsal (one shell) ----------------
  const glassG = [];
  const TW = 0.3;
  {
    const NT = 30, zs = [];
    for (let z = CAB.wsB; z > CAB.end + 1e-6; z -= z > CAB.fair ? 0.035 : 0.1) zs.push(z);
    zs.push(CAB.end);
    const pos = [], cl = [];
    for (const z of zs) for (let k = 0; k <= NT; k++) { const p = shellP(z, k / NT); pos.push(...p); const gg = fusAO(...p); cl.push(gg, gg, gg); }
    const reg = { glass: [], roof: [], paint: [] };
    for (let si = 0; si < zs.length - 1; si++) for (let k = 0; k < NT; k++) {
      const a = si * (NT + 1) + k, b = a + 1, c = a + NT + 1, d = c + 1;
      const zc = (zs[si] + zs[si + 1]) / 2, tc = (k + 0.5) / NT, sideT = Math.min(tc, 1 - tc);
      let r = 'paint';
      if (zc > CAB.roofF) r = 'glass';
      else if (zc > CAB.bPost) r = sideT < TW ? 'glass' : 'roof';
      reg[r].push(a, c, b, b, c, d);
    }
    const mk = (idx) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
    glassG.push(mk(reg.glass));
    add('roof', mk(reg.roof));
    add('livery', liveryUV(tagged(mk(reg.paint))));
    // Bulkhead behind the seat.
    {
      const zb = CAB.bPost - 0.25;
      const pts = []; for (let k = 0; k <= NT; k++) { const p = shellP(zb, k / NT); pts.push(new THREE.Vector2(p[0], p[1])); }
      for (let k = 1; k < 20; k++) { const [x, y] = boxRing(zb, 1 - k / 20); pts.push(new THREE.Vector2(x, y)); }
      add('interior', tx(new THREE.ShapeGeometry(new THREE.Shape(pts)), 0, 0, zb));
    }
    // Frames (painted, the canopy structure): windshield base, A-posts, the
    // centre post, roof rails and front bow, door posts, sill rails.
    const F = (pts, r = 0.022) => add('frame', tube(pts, r, Math.max(4, pts.length * 2), 6));
    const alongZ = (t, z0, z1, n = 10) => Array.from({ length: n + 1 }, (_, i) => shellP(lerp(z0, z1, i / n), t));
    const alongT = (z, t0, t1, n = 12) => Array.from({ length: n + 1 }, (_, i) => shellP(z, lerp(t0, t1, i / n)));
    F(alongT(CAB.wsB - 0.012, 0, 1, 20), 0.024);
    for (const t of [TW, 1 - TW]) F(alongZ(t, CAB.wsB - 0.01, CAB.roofF, 10), 0.026);
    F(alongZ(0.5, CAB.wsB - 0.01, CAB.roofF, 8), 0.016);
    F(alongT(CAB.roofF, TW, 1 - TW, 16), 0.026);
    for (const t of [TW, 1 - TW]) F(alongZ(t, CAB.roofF, CAB.bPost, 10), 0.022);
    for (const [t0, t1] of [[0, TW], [1 - TW, 1]]) { F(alongT(CAB.bPost, t0, t1, 6), 0.024); F(alongT(-1.0, t0, t1, 6), 0.016); }
    for (const t of [0.003, 0.997]) F(alongZ(t, CAB.wsB, CAB.bPost, 12), 0.022);
    const dh = shellP(-1.5, 0.08);
    add('steel', rod([dh[0] + 0.015, dh[1], dh[2] + 0.07], [dh[0] + 0.015, dh[1], dh[2] - 0.07], 0.008, 6), true);
  }
  // Wire cutter on the windshield and the deflector cable to the fin top.
  const cut = [0, CAB.roof + 0.14, CAB.roofF + 0.02];
  add('steel', rod([0, crestY(-0.75) + 0.02, -0.75], cut, 0.014, 6), true);
  add('wire', rod(cut, [0, FIN.topY + 0.01, FIN.top[0] - 0.05], 0.004, 4), true);
  add('white', rod([0, 1.12, -3.0], [0, 1.45, -3.2], 0.006, 5), true);

  // ---------------- wing ----------------
  const leY = (x) => at401WingY(x);
  const mainProf = airfoil(0, 0.72, 0.15, 0.035, 0.4, 18), aftProf = airfoil(0.74, 1.0, 0.15, 0.035, 0.4, 6), fullProf = airfoil(0, 1, 0.15, 0.035, 0.4, 20);
  const flaps = [], ailerons = [];
  const wingAO = (x, xc, lower) => (lower ? 1 : 1 - 0.25 * Math.max(0, 1 - (x - 0.5) / 0.5));
  const st = (x) => ({ x, y: leY(x), le: W.le, chord: W.chord });
  const hinge = (side, x) => new THREE.Vector3(side * x, leY(x) + 0.035, W.le - 0.74 * W.chord);
  const surfaceMesh = (geo, x0, x1, side) => {
    const a = hinge(side, x0), b = hinge(side, x1);
    const X = b.clone().sub(a).normalize();
    if (X.x < 0) X.negate();
    const Z = new THREE.Vector3().crossVectors(X, new THREE.Vector3(0, 1, 0)).normalize();
    const Y = new THREE.Vector3().crossVectors(Z, X);
    const pivot = new THREE.Group();
    pivot.position.copy(a).add(b).multiplyScalar(0.5);
    pivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    pivot.updateMatrix();
    geo.applyMatrix4(pivot.matrix.clone().invert());
    const deflect = new THREE.Group();
    const m = new THREE.Mesh(tagged(geo), M.wing);
    m.castShadow = true; m.receiveShadow = true;
    deflect.add(m); pivot.add(deflect); root.add(pivot);
    return deflect;
  };
  const FLAP = [0.62, 4.55], AIL = [4.63, 7.45];
  const TIP = [[0, 0, 0, 0], [0.07, -0.004, 0, 0], [0.13, -0.012, -0.03, 0.01], [0.17, -0.025, -0.1, 0.03], [0.185, -0.035, -0.22, 0.06]];
  for (const side of [1, -1]) {
    add('wing', wingP([0.36, W.rootX, 1.6, 2.8, 4.0, 5.2, 6.4, W.tipX].map(st), mainProf, side, wingAO));
    for (const [a, b] of [[0.36, FLAP[0]], [FLAP[1], AIL[0]], [AIL[1], W.tipX]]) add('wing', wingP([st(a), st(b)], aftProf, side, wingAO));
    flaps.push(surfaceMesh(wingP([FLAP[0], 2.6, FLAP[1]].map(st), aftProf, side, wingAO), FLAP[0], FLAP[1], side));
    ailerons.push(surfaceMesh(wingP([AIL[0], 6.0, AIL[1]].map(st), aftProf, side), AIL[0], AIL[1], side));
    add('tip', wingP(TIP.map(([dx, dy, dc, dl]) => ({ x: W.tipX + dx, y: leY(W.tipX) + dy, le: W.le - dl, chord: W.chord + dc })), fullProf, side));
    const navP = [side * (W.tipX + 0.15), leY(W.tipX) - 0.01, W.le - 0.05];
    add(side > 0 ? 'red' : 'green', ball(navP, 0.026, 10));
    add('lens', tx(new THREE.SphereGeometry(0.048, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), ...navP, 0, 0, side * Math.PI / 2, [1, 1, 1.3]));
    add('strobe', ball([side * (W.tipX + 0.14), leY(W.tipX), W.le - W.chord + 0.2], 0.018, 8));
    const fil = mainProf.slice(0, 19).map(([xc, yc]) => { const y = W.rootY + yc * W.chord + 0.01, z = W.le - xc * W.chord; return [side * (Math.min(boxX(z, y), 0.56) - 0.006), y, z]; });
    add('wing', tube(fil, 0.04, 30, 10));
    if (side > 0) {
      const up = mainProf.slice(0, 19).filter(([xc]) => xc > 0.12 && xc < 0.6);
      const sheet = up.map(([xc, yc]) => [xc, yc + 0.004]).concat(up.slice().reverse().map(([xc, yc]) => [xc, yc + 0.0005]));
      add('deck', wingP([0.56, 0.86, 1.15].map(st), sheet, side));
    }
    for (const fx of [2.4, 3.4]) add('dark', tx(new THREE.CylinderGeometry(0.06, 0.06, 0.025, 18), side * fx, leY(fx) + 0.14, W.le - 0.35 * W.chord, 0, 0, side * Math.atan(W.dih)));
    for (const hx of [1.0, 2.2, 3.4, 4.4, 5.4, 6.4, 7.3]) {
      const h = hinge(side, hx);
      add('dark', tx(new THREE.BoxGeometry(0.03, 0.09, 0.14), h.x, h.y - 0.1, h.z + 0.03, 0, 0, side * Math.atan(W.dih)), true);
    }
  }
  add('steel', rod([5.6, leY(5.6) - 0.1, 0.3], [5.6, leY(5.6) - 0.1, 0.85], 0.011, 8), true);

  // ---------------- tail ----------------
  const vfin = (prof, sts) => {
    const g = wingPanel(sts.map(([h, le, c]) => ({ x: h, y: 0, le, chord: c })), prof, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getY(i), p.getX(i), p.getZ(i));
    return flipWinding(g);
  };
  const finLE = (y) => lerp(FIN.root[0], FIN.top[0], (y - FIN.root[1]) / (FIN.top[1] - FIN.root[1]));
  const finSt = [0.75, FIN.root[1], 1.3, 1.7, 2.05, 2.2, 2.25, FIN.topY].map((y) => {
    const round = y > 2.18 ? (y - 2.18) / (FIN.topY - 2.18) : 0;
    const le = y < FIN.root[1] ? FIN.root[0] : finLE(y) - 0.06 * round ** 2;
    return [y, le, le - FIN.hinge - 0.01];
  });
  add('livery', liveryUV(tagged(vfin(airfoil(0, 1, 0.12, 0, 0.4, 12), finSt))));
  add('livery', liveryUV(tagged(loft(sampleStations([
    K(-3.3, 0.014, 1.09, 1.08, 1.1, 2.2, 2.2), K(-3.55, 0.035, 1.03, 1.02, 1.1, 2.2, 2.2),
    K(-3.8, 0.05, 0.98, 0.97, 1.12, 2.2, 2.2), K(-3.96, 0.055, 0.95, 0.94, 1.15, 2.2, 2.2),
  ], 20), 12, null))));
  const RC = FIN.hinge - FIN.te; // rudder chord to the published length
  const rudSt = [[FIN.bottom, FIN.hinge, RC - 0.07], [0.5, FIN.hinge, RC], [1.0, FIN.hinge, RC], [1.6, FIN.hinge, RC], [2.1, FIN.hinge, RC], [FIN.topY, FIN.hinge, RC - 0.02]];
  const rudGeo = liveryUV(tagged(vfin(airfoil(0, 1, 0.12, 0, 0.3, 8), rudSt)));
  const rudTab = tagged(tx(new THREE.BoxGeometry(0.012, 0.3, 0.08), 0, 0.6, FIN.hinge - RC + 0.04));
  rudGeo.translate(0, 0, -FIN.hinge); rudTab.translate(0, 0, -FIN.hinge);
  const rudder = new THREE.Group();
  rudder.position.set(0, 0, FIN.hinge);
  const rudMesh = new THREE.Mesh(rudGeo, M.livery);
  rudMesh.castShadow = true;
  rudder.add(rudMesh, new THREE.Mesh(rudTab, M.paint));
  rudder.add(new THREE.Mesh(tagged(ball([0, FIN.bottom + 0.06, -RC + 0.02], 0.02, 8)), M.white));
  root.add(rudder);
  add('beacon', tx(new THREE.SphereGeometry(0.032, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, FIN.topY + 0.004, FIN.hinge + 0.15));
  // Tailplane on the cone at the fin's root, braced by struts below;
  // elevators with a trim tab.
  const STY = 0.78, SLE = -4.35, SC = 1.0, ELEV = 0.58, STIP = 2.7;
  const sst = (x) => ({ x, y: STY, le: SLE, chord: SC });
  const elevParts = [];
  for (const side of [1, -1]) {
    add('paint', wingPanel([0.06, 1.3, 2.58].map(sst), airfoil(0, ELEV - 0.02, 0.11, 0, 0.4, 12), side));
    add('paint', wingPanel([2.58, 2.66, STIP].map((x, i) => ({ ...sst(x), chord: SC * (1 - [0, 0.03, 0.1][i]), le: SLE - [0, 0.008, 0.04][i] })), airfoil(0, 1, 0.11, 0, 0.4, 14), side));
    elevParts.push(tagged(wingPanel([0.1, 1.3, 2.56].map(sst), airfoil(ELEV, 1, 0.11, 0, 0.4, 4), side)));
    // Struts from the lower fuselage to the tailplane's underside.
    const s0 = [side * boxX(-4.75, 0.3) * 0.9, 0.32, -4.75], s1 = [side * 1.3, STY - 0.04, -4.72];
    add('paint', tube([s0, s1], 0.022, 4, 8));
  }
  elevParts.push(tagged(tx(new THREE.BoxGeometry(0.5, 0.012, 0.1), 1.0, STY + 0.006, SLE - SC - 0.03)));
  const elevGeo = mergeGeometries(elevParts);
  const elevHingeZ = SLE - ELEV * SC;
  elevGeo.translate(0, -STY, -elevHingeZ);
  const elevator = new THREE.Group();
  elevator.position.set(0, STY, elevHingeZ);
  const elevMesh = new THREE.Mesh(elevGeo, M.paint);
  elevMesh.castShadow = true; elevMesh.receiveShadow = true;
  elevator.add(elevMesh);
  root.add(elevator);

  // ---------------- landing gear ----------------
  const gearCfg = Object.fromEntries(A.gear.map((g) => [g.name, g]));
  const gearGroups = {};
  const tyreProfile = (R, Wd, rim) => [
    [rim, -Wd * 0.42], [rim + 0.02, -Wd * 0.5], [R * 0.78, -Wd * 0.54], [R * 0.95, -Wd * 0.46], [R * 0.995, -Wd * 0.3],
    [R, -Wd * 0.12], [R, Wd * 0.12], [R * 0.995, Wd * 0.3], [R * 0.95, Wd * 0.46], [R * 0.78, Wd * 0.54], [rim + 0.02, Wd * 0.5], [rim, Wd * 0.42],
  ];
  const makeWheel = (R, Wd, rim, sx, big) => {
    const spin = new THREE.Group();
    const tyre = lathe(tyreProfile(R, Wd, rim), big ? 44 : 26);
    tyre.rotateZ(Math.PI / 2);
    const tmesh = new THREE.Mesh(tyre, M.tyre);
    tmesh.castShadow = true; tmesh.receiveShadow = true;
    const hubG = lathe([[0.0, -Wd * 0.3], [rim * 0.35, -Wd * 0.32], [rim * 0.55, -Wd * 0.18], [rim * 0.9, -Wd * 0.3], [rim + 0.008, -Wd * 0.44],
      [rim + 0.008, Wd * 0.44], [rim * 0.9, Wd * 0.3], [rim * 0.55, Wd * 0.18], [rim * 0.35, Wd * 0.32], [0.0, Wd * 0.3]], big ? 30 : 18);
    hubG.rotateZ(Math.PI / 2);
    const parts = [tagged(hubG)];
    if (big) for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; parts.push(tagged(tx(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8), sx * Wd * 0.33, Math.cos(a) * rim * 0.55, Math.sin(a) * rim * 0.55, 0, 0, Math.PI / 2))); }
    spin.add(tmesh, new THREE.Mesh(mergeGeometries(parts), M.hub));
    return spin;
  };
  for (const [name, sx] of [['mainL', 1], ['mainR', -1]]) {
    const cfg = gearCfg[name];
    const R = cfg.radius, Wd = 0.22;
    const ax = cfg.p[0], ay = cfg.p[1] + R, az = cfg.p[2];
    const g = new THREE.Group();
    // Spring leg from the wing-root fitting (at the front spar), tapered
    // flat, out and down to the axle; the brake line along it.
    const fA = [sx * 0.6, -0.38, 0.62];
    const attachY = fA[1];
    const leg = new THREE.Group();
    leg.position.y = attachY;
    const Lp = (p) => [p[0], p[1] - attachY, p[2]];
    const axIn = [ax - sx * 0.14, ay + 0.02, az];
    const legParts = [bar(Lp(fA), Lp(axIn), 0.14, 0.05), bar(Lp([fA[0], fA[1], fA[2] - 0.05]), Lp(lerp3(fA, axIn, 0.5)), 0.08, 0.04), tx(new RoundedBoxGeometry(0.1, 0.12, 0.14, 2, 0.025), ...Lp(axIn)), rod(Lp(axIn), Lp([ax - sx * 0.02, ay, az]), 0.034, 12)];
    const legMesh = new THREE.Mesh(mergeGeometries(legParts.map((p) => tagged(p))), M.paint);
    legMesh.castShadow = true; legMesh.receiveShadow = true;
    const brakeLine = new THREE.Mesh(tagged(tube([Lp([fA[0], fA[1] - 0.03, fA[2] - 0.04]), Lp(lerp3(fA, axIn, 0.55).map((v, i) => v + [0, 0, -0.05][i])), Lp([axIn[0], axIn[1] + 0.07, axIn[2] - 0.05])], 0.007, 14, 5)), M.rubber);
    leg.add(legMesh, brakeLine);
    g.add(leg);
    add('dark', rbox(0.12, 0.08, 0.16, 0.02, fA[0], fA[1] + 0.03, fA[2]));
    const wheel = new THREE.Group();
    wheel.position.set(ax, ay, az);
    const spinPart = makeWheel(R, Wd, 0.13, sx, true);
    const brake = new THREE.Mesh(tagged(tx(new THREE.CylinderGeometry(0.11, 0.11, 0.012, 24), -sx * 0.09, 0, 0, 0, 0, Math.PI / 2)), M.steel);
    const caliper = new THREE.Mesh(tagged(new RoundedBoxGeometry(0.05, 0.08, 0.1, 2, 0.012).translate(-sx * 0.095, 0.085, -0.05)), M.dark);
    wheel.add(spinPart, brake, caliper);
    g.add(wheel);
    root.add(g);
    gearGroups[name] = { group: g, wheel, spin: spinPart, leg, legH: attachY - ay, rest: wheel.position.clone(), sx };
  }
  {
    const cfg = gearCfg.tail;
    const g = new THREE.Group();
    const R = cfg.radius;
    const fz = cfg.p[2] + 0.07, fy = cfg.p[1] + R + 0.14;
    add('ink', bar([0, 0.36, -5.05], [0, fy + 0.03, fz + 0.02], 0.055, 0.018));
    add('dark', rbox(0.09, 0.04, 0.15, 0.015, 0, 0.36, -5.05));
    add('ink', tx(new THREE.CylinderGeometry(0.028, 0.028, 0.07, 10), 0, fy + 0.03, fz));
    const fork = new THREE.Group();
    fork.position.set(0, fy, fz);
    const forkGeo = mergeGeometries([
      tagged(tx(new THREE.BoxGeometry(0.014, 0.15, 0.06), 0.06, -0.06, -0.05, 0.5)), tagged(tx(new THREE.BoxGeometry(0.014, 0.15, 0.06), -0.06, -0.06, -0.05, 0.5)),
      tagged(tx(new THREE.BoxGeometry(0.13, 0.022, 0.06), 0, 0.02, 0)),
    ]);
    fork.add(new THREE.Mesh(forkGeo, M.steel));
    const wheel = new THREE.Group();
    wheel.position.set(0, -0.14, -0.07);
    wheel.add(makeWheel(R, 0.09, 0.065, 1, false));
    fork.add(wheel);
    g.add(fork);
    root.add(g);
    gearGroups.tail = { group: g, wheel, spin: wheel.children[0], fork, rest: wheel.position.clone(), sx: 0 };
  }

  // ---------------- spray system ----------------
  const nozzles = [];
  const BZ = -1.5, BDROP = 0.25;
  const boomAt = (side, x) => [side * x, leY(x) - BDROP, BZ];
  for (const side of [1, -1]) {
    add('alu', rod(boomAt(side, 0.6), boomAt(side, 6.6), 0.028, 12));
    add('alu', ball(boomAt(side, 6.6), 0.032, 10));
    for (const hx of [1.3, 2.6, 3.9, 5.2, 6.4]) {
      const topP = [side * hx, leY(hx) - 0.05, -0.95], bot = boomAt(side, hx);
      const len = Math.hypot(topP[1] - bot[1], topP[2] - bot[2]);
      add('alu', tx(new RoundedBoxGeometry(0.02, len, 0.06, 2, 0.007), side * hx, (topP[1] + bot[1]) / 2, (topP[2] + bot[2]) / 2, Math.atan2(topP[2] - bot[2], topP[1] - bot[1])));
      add('dark', tx(new THREE.CylinderGeometry(0.034, 0.034, 0.03, 10), ...bot, 0, 0, Math.PI / 2), true);
    }
    const NZ = 22;
    for (let k = 0; k < NZ; k++) {
      const x = 0.8 + ((6.5 - 0.8) * k) / (NZ - 1);
      const [bx, by, bz] = boomAt(side, x);
      add('alu', rod([bx, by, bz], [bx, by - 0.06, bz - 0.015], 0.007, 6), true);
      add('yellow', tx(new THREE.CylinderGeometry(0.017, 0.014, 0.045, 10), bx, by - 0.085, bz - 0.022, 0.3), true);
      add('brass', tx(new THREE.ConeGeometry(0.009, 0.022, 8), bx, by - 0.115, bz - 0.032, Math.PI + 0.3), true);
      nozzles.push(new THREE.Vector3(bx, by - 0.12, bz - 0.032));
    }
  }
  add('alu', rod(boomAt(1, 0.6), boomAt(-1, 0.6), 0.038, 12));
  add('alu', tube([[0, -0.66, 1.0], [0, -0.62, 0.3], [0, -0.55, -0.8], [0, boomAt(1, 0)[1], BZ]], 0.04, 24, 10));
  const pump = new THREE.Group();
  pump.position.set(0, -0.68, 1.15);
  {
    const pumpBody = lathe([[0.0, -0.24], [0.085, -0.23], [0.11, -0.14], [0.12, 0.06], [0.1, 0.17], [0.06, 0.23], [0.0, 0.24]], 22);
    pumpBody.rotateX(Math.PI / 2);
    pump.add(new THREE.Mesh(tagged(pumpBody), M.dark));
    pump.add(new THREE.Mesh(tagged(tx(new THREE.SphereGeometry(0.05, 12, 8), 0, 0, 0.25)), M.steel));
    pump.add(new THREE.Mesh(tagged(rod([0, 0.1, 0], [0, 0.3, 0.05], 0.026, 8)), M.dark));
  }
  const pumpFan = new THREE.Group();
  pumpFan.position.z = 0.27;
  for (let i = 0; i < 7; i++) {
    const a = (i * Math.PI * 2) / 7;
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.055, 0.008), M.orange);
    bl.position.set(Math.cos(a) * 0.095, Math.sin(a) * 0.095, 0);
    bl.rotation.z = a; bl.rotation.x = 0.4;
    pumpFan.add(bl);
  }
  pump.add(pumpFan);
  root.add(pump);

  // ---------------- propeller (Hamilton Standard, two blades) ----------------
  const R = A.propRadius;
  const PZ = 2.42;
  const prop = new THREE.Group();
  prop.position.set(0, AX, PZ);
  {
    // Bare hub: the barrel, the blade clamps, the dome (no spinner).
    const hubBody = lathe([[0.0, -0.1], [0.14, -0.1], [0.15, -0.02], [0.13, 0.08], [0.1, 0.14], [0.06, 0.19], [0.0, 0.2]], 28);
    hubBody.rotateX(Math.PI / 2);
    const hm = new THREE.Mesh(tagged(hubBody), M.polished);
    hm.castShadow = true;
    const clamps = mergeGeometries([0, Math.PI].map((a) => tagged(tx(new THREE.CylinderGeometry(0.075, 0.075, 0.12, 16), Math.cos(a + Math.PI / 2) * 0.17, Math.sin(a + Math.PI / 2) * 0.17, 0.0, 0, 0, a))));
    prop.add(hm, new THREE.Mesh(clamps, M.steel));
  }
  const blades = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.55, metalness: 0.3, transparent: true });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xf0d020, roughness: 0.5, transparent: true });
  const bodyGeo = bladeLoft(0.2, R - 0.12, 16, R), tipGeo = bladeLoft(R - 0.12, R, 4, R);
  const pitchGroups = [];
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Group();
    b.rotation.z = i * Math.PI + Math.PI / 2;
    const pg = new THREE.Group();
    const bm = new THREE.Mesh(bodyGeo, bladeMat);
    bm.castShadow = true;
    pg.add(bm, new THREE.Mesh(tipGeo, tipMat));
    b.add(pg); blades.add(b);
    pitchGroups.push(pg);
  }
  prop.add(blades);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R + 0.01, 64), new THREE.MeshBasicMaterial({ map: propDiscTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.z = 0.03;
  disc.renderOrder = 11;
  prop.add(disc);
  root.add(prop);

  // ---------------- cockpit ----------------
  const C = AT401_CABIN;
  const ck = buildAT401Cockpit({ panel, envMap: opts.envMap ?? null, M, C, CAB, shellP, boxAt, boxX, crestY, TW });
  const { cockpit, stick, pedals, throttle, valve, leds, THR } = ck;
  root.add(cockpit);
  const OFF = new THREE.Vector3(C.eye[0], C.eye[1] - 0.98, C.eye[2] + 0.52);
  const thrPF = [THR[0] - OFF.x, THR[1] + 0.175 - OFF.y, THR[2] + 0.02 - OFF.z];
  const pilot = buildPilot(M, stick, throttle, { throttleAt: thrPF });
  pilot.position.copy(OFF);
  root.add(pilot);

  // ---------------- merge static parts ----------------
  const fine = new THREE.Group();
  for (const [k, parts] of Object.entries(B)) {
    const isFine = k.startsWith('fine:');
    const mat = M[isFine ? k.slice(5) : k];
    const m = new THREE.Mesh(mergeGeometries(parts), mat);
    m.castShadow = !isFine && mat !== M.glass && mat !== M.lens;
    m.receiveShadow = true;
    if (mat === M.lens) m.renderOrder = 9;
    (isFine ? fine : root).add(m);
  }
  const lod = new THREE.LOD();
  lod.addLevel(fine, 0);
  lod.addLevel(new THREE.Group(), 110);
  root.add(lod);
  const glassMesh = new THREE.Group();
  const gm = new THREE.Mesh(mergeGeometries(glassG.map((g) => tagged(g))), M.glass);
  gm.renderOrder = 10;
  glassMesh.add(gm);
  root.add(glassMesh);
  root.traverse((o) => { if (o.isMesh && o.castShadow === undefined) o.castShadow = true; });

  let t = 0;
  const update = (dt, fm, ac) => {
    t += dt;
    const on = fm.engine !== 'off';
    M.beacon.emissiveIntensity = on ? 0.6 + 2.4 * Math.max(0, Math.sin(t * 7.5)) ** 8 : 0;
    M.strobe.emissiveIntensity = on && t % 1.2 < 0.06 ? 4 : 0;
    ck.update(dt, fm, ac);
  };
  for (const pg of pitchGroups) pg.rotation.x = 0.3; // fixed-pitch-like blade angle at rest

  const swap = (mat, n) => { mat.map.dispose(); mat.bumpMap.dispose(); mat.map = n.map; mat.bumpMap = n.bump; mat.needsUpdate = true; };
  return {
    setReg(r) { REG = r; swap(M.livery, liveryTextures(REG, AT401_LIVERIES[livery])); },
    setLivery(i) {
      const k = ((i % AT401_LIVERIES.length) + AT401_LIVERIES.length) % AT401_LIVERIES.length;
      if (k === livery) return;
      livery = k;
      const L = AT401_LIVERIES[k];
      swap(M.livery, liveryTextures(REG, L));
      swap(M.wing, wingTextures(L));
      M.tip.color.set(L.tip).multiplyScalar(ALB);
    },
    get livery() { return livery; },
    root, M,
    refs: { ...Object.fromEntries(Object.entries(C).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, new THREE.Vector3(...v)])), floorY: C.floorY, ...(ck.refs ?? {}) },
    prop, blades, bladeMats: [bladeMat, tipMat], disc,
    ailerons, flaps, elevator, rudder,
    gear: gearGroups,
    stick, pedals, throttle, valve, leds, panelMesh: ck.panelMesh, inst: { pick: ck.pick, pickables: ck.pickables, needles: ck.needles },
    pumpFan, nozzles, pilot, cockpit, glassMesh,
    eye: new THREE.Vector3(...C.eye),
    fuelFiller: new THREE.Vector3(2.4, leY(2.4) + 0.15, W.le - 0.35 * W.chord),
    hopperPort: new THREE.Vector3(0.6, -0.2, 0.0),
    update,
  };
}
