// Procedural Embraer EMB-203 Ipanema (fictional registration PR-IPB): its own
// geometry, built from the 203's published dimensions (13.30 m span with the
// winglets, 8.00 m long, 2.43 m high) and photographs of the type — nothing
// here is taken from the EMB-202A model. VISUAL ONLY: the physics
// (FLIGHT_E203), gear contact points and hard points live in src/config.js;
// the gear points are read here only to place the wheels.
// Body frame: +Z nose, +Y up, +X left wing; origin = CG (25 % of the chord).
//
// The parts, after the photographs: a long IO-540 cowl tapering to the
// polished spinner, a round cooling inlet and the landing light in its nose,
// a chin inlet; the hopper's tan fibreglass lid with the loading box at its
// front; the cabin standing on the hopper section — windshield raked 43°,
// flat side windows leaning in from the sill, the door on the left with its
// lower window, a flat roof with rounded edges — and behind it a fairing
// that drops steeply from the roof to a low, rounded dorsal tapering to the
// rudder post; the swept fin with a straight-hinged rudder that runs down
// past the end of the cone; a rectangular tailplane low on the cone; a
// constant-chord 1.71 m
// wing with 6.5° of dihedral, flaps and ailerons, ending in the 203's
// winglets — swept "fins" that rise out of the full tip chord in one
// continuous curve; tubular V main legs on big tyres, a long-spring
// tailwheel; booms under the trailing edge on five hangers a side, the
// wind-driven pump between the legs; the wire from the roof to the fin top
// and the deflector over the windshield; a three-blade Hartzell.
// Paint and lettering are a side-projected livery with a matching bump map
// (two schemes share the geometry and UVs; only canvases and a few colours
// change); AO is baked into vertex colours; small parts sit in a LOD.
// The cockpit is built inside this cabin by e203Cockpit.js (panel layout and
// textures in e203Panel.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { rng, clamp, smoothstep, lerp } from '../core/math.js';
import { FLIGHT_E203 } from '../config.js';
import {
  loft, K, sampleStations, ring, airfoil, wingPanel, flipWinding, tagged, tx, rod, tube, bar, ball, rbox, lathe, grid,
  speckle, orangePeel, treadTexture, propDiscTexture, WING_SPAN_UV, buildPilot,
} from './model.js';
import { buildE203Cockpit } from './e203Cockpit.js';

const A = FLIGHT_E203;
// Wing: rectangular planform, 1.71 m chord, leading edge 0.43 m ahead of the
// CG, root chord plane at the bottom of the fuselage, 6.5° dihedral from the
// root; the winglet takes the tip from x = tipX to the 6.65 m half span.
export const E203_WING = { rootX: 0.5, tipX: 6.42, rootY: -0.42, le: 0.43, chord: 1.71, dih: Math.tan((6.5 * Math.PI) / 180) };
const W = E203_WING;
export const e203WingY = (x) => W.rootY + Math.max(0, Math.abs(x) - W.rootX) * W.dih;
const AX = 0.15; // thrust line above the CG
const SPAN_UV = 6.7; // half-span metres mapped to u = 0..1 on the wing texture
export const E203_SHADOW = { W: 15.5, L: 10.5, wing: [6.6, -1.3, 0.45], fus: [0.55, -1.4, 4.2], tail: [2.1, -5.0, -4.05], core: [4.6, 2.8] };

// ---------------------------------------------------------------------------
// Paint schemes (Pintura 01 / 02). Colours of the parts that are not on the
// livery canvas: tailplane, cabin frame, winglets and stabiliser tips, gear.
const GREEN = '#1f6a3c', BLUE = '#1d3b8f', GOLD = '#cfa245', WHITE = '#f2f2ee';
const BLUE2 = '#1f40a0', GREEN2 = '#16883f', GOLD2 = '#e3a92e', NAVY = '#1c2a70', INK = '#18191c';
export const E203_LIVERIES = [
  // 01 — the Embraer demonstrators (PS-DIR, PS-BYA): green front, blue rear
  // and wings, the gold band sweeping up behind the cabin.
  { id: 'brasil', name: 'Paint 01 — green, blue and gold', base: GREEN, tail: BLUE, frame: GREEN, tip: BLUE, gear: BLUE, wing: BLUE, text: '#f4f4f0', seam: 'rgba(10,25,15,0.35)', rivet: 'rgba(8,20,12,0.3)' },
  // 02 — PP-ZPK: white, blue belly, green swoosh with a gold line, blue
  // rudder, wingtips and winglets.
  { id: 'zpk', name: 'Paint 02 — white, green and blue', base: WHITE, tail: WHITE, frame: WHITE, tip: BLUE2, gear: BLUE2, wing: WHITE, text: NAVY, seam: 'rgba(60,64,70,0.26)', rivet: 'rgba(60,64,70,0.2)' },
];

// ---------------------------------------------------------------------------
// Fuselage stations K(z, half-width, shoulder y, bottom y, top y, pU, pL).
// Nose: the cowl lip just larger than the spinner, opening out over the
// engine to the hopper; the top line rises gently to the windshield base.
// Seen from above the body widens steadily to the cabin (0.97 m) and starts
// narrowing again right behind it.
const FWD_KEYS = [
  // The nose slimmer toward the spinner and its top line falling more
  // steeply to it (on the photographs the cowl rises at an angle from the
  // spinner to the windshield); the lip just clears the spinner.
  K(2.14, 0.27, 0.11, -0.16, 0.37, 2.3, 2.2), K(2.02, 0.295, 0.1, -0.225, 0.395, 2.5, 2.4),
  K(1.7, 0.34, 0.07, -0.315, 0.44, 2.85, 2.75), K(1.2, 0.39, 0.04, -0.41, 0.51, 3.4, 3.2),
  K(0.6, 0.435, 0.0, -0.5, 0.575, 3.8, 3.6), K(0.0, 0.465, -0.04, -0.56, 0.62, 4.2, 3.8),
  K(-0.5, 0.485, -0.06, -0.58, 0.64, 4.3, 3.8),
];
// Cabin: the lower fuselage keeps the hopper's section; it is cut 30° above
// the sides (the window sill) and the cabin stands on it.
const CAB_KEYS = [FWD_KEYS[FWD_KEYS.length - 1], K(-1.2, 0.485, -0.06, -0.58, 0.64, 4.3, 3.8), K(-1.78, 0.48, -0.06, -0.57, 0.64, 4.3, 3.8)];
const CAB_ARC = [Math.PI * (5 / 6), Math.PI * (13 / 6)]; // open above the sill (30°)
const RIM_A = Math.PI / 6;
// Sill line: where the cabin loft is cut (its 30° point).
const SILL = (() => { const st = CAB_KEYS[1]; return { x: st.hw * Math.cos(RIM_A) ** (2 / st.pU), y: st.ys + (st.yt - st.ys) * Math.sin(RIM_A) ** (2 / st.pU) }; })();
const WS_Z = -0.5, WS_ZS = -0.62; // windshield base: centre / sides

// Structured sections for the cabin top and the rear fuselage
// R(z, hw, ys, yb, pL, pU, yv, yr, yt, hwT, rT): below the rim yr the body
// is the superellipse of the lower fuselage (half width hw at the shoulder
// ys, belly yb, exponents pL / pU, virtual top yv); above it straight sides
// lean in to a top corner of radius rT and a flat top at yt, hwT wide (half).
// The first key is the cabin itself at its rear frame: the sill, the side
// windows leaning in 12°, the flat roof with its rounded edges. Behind it
// the fairing drops steeply from the roof (convex at the roof edge, about
// 45° in the middle, concave into the dorsal) to a low dorsal near the sill
// height, which runs on, rounded and narrowing, to the rudder post.
const R = (z, hw, ys, yb, pL, pU, yv, yr, yt, hwT, rT) => ({ z, hw, ys, yb, pL, pU, yv, yr, yt, hwT, rT });
// (measured on the PS-SAR side photograph, scaled by the 2.43 m height):
// the canopy from sill to roof ≈ 0.8 m, so the roof stands at 1.20 m; the
// fairing drops from it to a dorsal a little under the sill line; the rear
// fuselage keeps its depth (≈ 0.75 m at the rudder post, the underside
// nearly straight) while it narrows in plan.
const AFT_KEYS = [
  R(-1.78, 0.48, -0.06, -0.57, 3.8, 4.3, 0.64, 0.447, 1.2, 0.345, 0.08),
  R(-1.95, 0.472, -0.06, -0.567, 3.78, 4.25, 0.635, 0.445, 1.14, 0.33, 0.12),
  R(-2.15, 0.455, -0.062, -0.56, 3.72, 4.1, 0.625, 0.435, 0.93, 0.3, 0.15),
  R(-2.35, 0.435, -0.065, -0.55, 3.62, 3.9, 0.61, 0.41, 0.7, 0.28, 0.17),
  R(-2.6, 0.41, -0.07, -0.54, 3.5, 3.7, 0.58, 0.36, 0.52, 0.275, 0.19),
  R(-3.0, 0.36, -0.07, -0.515, 3.3, 3.4, 0.52, 0.31, 0.45, 0.25, 0.18),
  R(-3.5, 0.3, -0.06, -0.48, 3.1, 3.1, 0.47, 0.27, 0.4, 0.21, 0.16),
  R(-4.0, 0.235, -0.04, -0.45, 2.9, 2.9, 0.43, 0.24, 0.37, 0.165, 0.13),
  R(-4.5, 0.16, -0.02, -0.42, 2.7, 2.7, 0.39, 0.21, 0.355, 0.11, 0.09),
  R(-5.02, 0.075, 0.0, -0.4, 2.5, 2.5, 0.36, 0.18, 0.34, 0.05, 0.045),
];
const CABIN = AFT_KEYS[0];
// Upper contour of a structured section, left half (x ≥ 0), from the rim up
// to the top centre: rim point, the side line to the corner's tangent
// point, the corner arc, the flat top. counts: [side, arc, top].
const NS = [5, 7, 4];
function topHalf(st) {
  const s = clamp((st.yr - st.ys) / (st.yv - st.ys), 0, 1) ** st.pU;
  const rim = [st.hw * (1 - s) ** (1 / st.pU), st.yr];
  const cx = Math.max(0, st.hwT - st.rT), cy = st.yt - st.rT;
  const dx = rim[0] - cx, dy = rim[1] - cy, d = Math.hypot(dx, dy);
  const a1 = Math.atan2(dy, dx) + Math.acos(clamp(st.rT / d, -1, 1));
  const tp = [cx + Math.cos(a1) * st.rT, cy + Math.sin(a1) * st.rT];
  const pts = [];
  for (let i = 0; i < NS[0]; i++) pts.push([lerp(rim[0], tp[0], i / NS[0]), lerp(rim[1], tp[1], i / NS[0])]);
  for (let i = 0; i < NS[1]; i++) { const a = a1 + ((Math.PI / 2 - a1) * i) / NS[1]; pts.push([cx + Math.cos(a) * st.rT, cy + Math.sin(a) * st.rT]); }
  for (let i = 0; i <= NS[2]; i++) pts.push([cx * (1 - i / NS[2]), st.yt]);
  return { pts, rim, tp };
}
// The whole ring: left shoulder, up to the rim (superellipse), the top half,
// mirrored down the right side, the belly back to the start — the same
// direction as ring() so the faces point outward.
const NLO = [6, 24]; // shoulder->rim, belly
function aftRing(st) {
  const out = [];
  const s0 = clamp((st.yr - st.ys) / (st.yv - st.ys), 0, 1);
  const aR = Math.asin(s0 ** (st.pU / 2)); // superellipse angle of the rim
  const up = (a) => { const c = Math.cos(a), s = Math.sin(a); return [st.hw * c ** (2 / st.pU), st.ys + (st.yv - st.ys) * s ** (2 / st.pU)]; };
  for (let i = 0; i < NLO[0]; i++) out.push(up((aR * i) / NLO[0]));
  const { pts } = topHalf(st);
  out.push(...pts);
  const right = out.slice(0, -1).reverse().map(([x, y]) => [-x, y]);
  out.push(...right);
  for (let i = 1; i < NLO[1]; i++) {
    const a = Math.PI + (Math.PI * i) / NLO[1], c = Math.cos(a), s = Math.sin(a);
    out.push([st.hw * Math.sign(c) * Math.abs(c) ** (2 / st.pL), st.ys - (st.ys - st.yb) * Math.abs(s) ** (2 / st.pL)]);
  }
  out.push(out[0].slice());
  return out;
}
function sampleR(keys, per) {
  const P = Object.keys(keys[0]);
  const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  const out = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
    const n = Math.max(2, Math.round(Math.abs(k1.z - k2.z) * per));
    for (let j = 0; j < n; j++) { const t = j / n, st = {}; for (const p of P) st[p] = cr(k0[p], k1[p], k2[p], k3[p], t); out.push(st); }
  }
  out.push({ ...keys[keys.length - 1] });
  return out;
}
function loftR(stations, colorFn) {
  const pos = [], col = [], idx = [];
  let rl = 0;
  for (const st of stations) {
    const pts = aftRing(st);
    rl = pts.length;
    for (const [x, y] of pts) { pos.push(x, y, st.z); const g = colorFn ? colorFn(x, y, st.z) : 1; col.push(g, g, g); }
  }
  for (let si = 0; si < stations.length - 1; si++) for (let k = 0; k < rl - 1; k++) {
    const a = si * rl + k, b = a + 1, c = a + rl, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// Cabin top (roof and windshield head): the structured section's upper
// contour, right rail -> left rail through the flat top, by arc length
// (u = 0 left rail, 1 right rail).
const CAB_TOP = (() => {
  const { pts, tp } = topHalf(CABIN);
  const half = pts.slice(NS[0]); // from the rail (tangent point) to the centre
  const all = half.concat(half.slice(0, -1).reverse().map(([x, y]) => [-x, y]));
  const L = [0];
  for (let i = 1; i < all.length; i++) L.push(L[i - 1] + Math.hypot(all[i][0] - all[i - 1][0], all[i][1] - all[i - 1][1]));
  const at = (u) => {
    const t = clamp(u, 0, 1) * L[L.length - 1];
    let i = 1; while (i < L.length - 1 && L[i] < t) i++;
    const f = (t - L[i - 1]) / (L[i] - L[i - 1] || 1);
    return [lerp(all[i - 1][0], all[i][0], f), lerp(all[i - 1][1], all[i][1], f)];
  };
  return { at, rail: { x: tp[0], y: tp[1] } };
})();
const RAIL = CAB_TOP.rail; // where the side glass meets the roof edge
const ROOF = { yt: CABIN.yt, zF: -0.97, zFc: -0.93, zR: CABIN.z }; // roof top, front edge (rails / centre), rear frame
const BPOST = -1.58;
// Half width of a fuselage station at height y (upper half).
const surfX = (st, y) => {
  const s = clamp((y - st.ys) / (st.yt - st.ys), 0, 1) ** (st.pU / 2);
  return st.hw * Math.sqrt(Math.max(0, 1 - s * s)) ** (2 / st.pU);
};

// ---------------------------------------------------------------------------
// Livery: side projection of the fuselage, fin and rudder (one half of the
// canvas per side), with a bump map for the panel lines and rivets.
const LV = { Z0: -5.6, Z1: 2.6, Y0: -0.75, Y1: 1.6, W: 2048, H: 1024, M: 6 };
LV.kx = LV.W / (LV.Z1 - LV.Z0);
LV.ky = (LV.H / 2 - 2 * LV.M) / (LV.Y1 - LV.Y0);
const lvPix = (side, z, y) => [
  side > 0 ? (LV.Z1 - z) * LV.kx : (z - LV.Z0) * LV.kx,
  (side > 0 ? 0 : LV.H / 2) + LV.M + (LV.Y1 - y) * LV.ky,
];
function liveryUV(geo) {
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let t = 0; t < p.count; t += 3) {
    const cx = p.getX(t) + p.getX(t + 1) + p.getX(t + 2);
    const side = cx >= 0 ? 1 : -1;
    for (let k = t; k < t + 3; k++) {
      const [px, py] = lvPix(side, p.getZ(k), p.getY(k));
      uv[k * 2] = px / LV.W;
      uv[k * 2 + 1] = 1 - py / LV.H;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// Embraer-style arrow (pointing forward) with its long tail.
function arrow(g, x, y, s, col, dir) {
  g.save();
  g.translate(x, y); g.scale(s * dir, s);
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(-1.0, 0); g.lineTo(-0.55, -0.42); g.lineTo(-0.55, -0.12); g.lineTo(1.5, -0.06); g.lineTo(1.5, 0.06);
  g.lineTo(-0.55, 0.12); g.lineTo(-0.55, 0.42); g.closePath();
  g.fill();
  g.restore();
}

function liveryTextures(reg, L = E203_LIVERIES[0]) {
  const c = canvas(LV.W, LV.H), b = canvas(LV.W, LV.H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  gb.fillStyle = '#808080';
  gb.fillRect(0, 0, LV.W, LV.H);
  orangePeel(gb, LV.W, LV.H, 71);
  const brasil = L.id === 'brasil';
  for (const side of [1, -1]) {
    const P = (z, y) => lvPix(side, z, y);
    const oy = side > 0 ? 0 : LV.H / 2;
    const path = (ctx, pts) => {
      ctx.beginPath();
      pts.forEach(([z, y], i) => { const [px, py] = P(z, y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    };
    const poly = (pts, fill) => { path(g, pts); g.closePath(); g.fillStyle = fill; g.fill(); };
    const line = (ctx, pts, col, w) => { path(ctx, pts); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
    // A band along a centre line: half-thickness th(i) (m) across it.
    const band = (pts, th, fill) => {
      const n = pts.length, up = [], dn = [];
      for (let i = 0; i < n; i++) {
        const [za, ya] = pts[Math.max(0, i - 1)], [zb, yb] = pts[Math.min(n - 1, i + 1)];
        let nz = -(yb - ya), ny = zb - za;
        const l = Math.hypot(nz, ny) || 1; nz /= l; ny /= l;
        if (ny < 0) { nz = -nz; ny = -ny; }
        const h = typeof th === 'function' ? th(i / (n - 1)) : th;
        up.push([pts[i][0] + nz * h, pts[i][1] + ny * h]);
        dn.push([pts[i][0] - nz * h, pts[i][1] - ny * h]);
      }
      poly(up.concat(dn.reverse()), fill);
    };
    g.save();
    g.beginPath(); g.rect(0, oy, LV.W, LV.H / 2); g.clip();
    g.fillStyle = L.base;
    g.fillRect(0, oy, LV.W, LV.H / 2);
    if (brasil) {
      // Gold band from under the cabin front, past the B-post and up the
      // fairing behind the roof to the dorsal; blue below and aft of it;
      // green ahead and above (the cabin and the top of the fairing).
      const C = [[0.45, -0.66], [-0.3, -0.4], [-0.95, -0.16], [-1.55, 0.08], [-1.98, 0.3], [-2.3, 0.55], [-2.55, 0.85]];
      const off = (dz, dy) => C.map(([z, y]) => [z + dz, y + dy]);
      poly(off(-0.07, -0.09).concat([[-3.4, 1.7], [-5.8, 1.7], [-5.8, -0.9], [0.5, -0.9]]), BLUE);
      band(C, 0.105, GOLD);
      // Fin: green cap over a gold stripe, the white Embraer arrow.
      // (proportions of PS-SAR: the cap the top 22 % of the fin, the
      // stripe the next 10 %).
      poly([[-3.7, 1.245], [-3.7, 1.7], [-5.8, 1.7], [-5.8, 1.245]], GREEN);
      poly([[-3.7, 1.13], [-3.7, 1.245], [-5.8, 1.245], [-5.8, 1.13]], GOLD);
      { const [px, py] = P(-5.0, 0.76); arrow(g, px, py, 0.14 * LV.ky, '#f4f4f0', side > 0 ? 1 : -1); }
    } else {
      // Blue belly from the nose to the tail post; blue rudder.
      poly([[2.7, -0.2], [2.0, -0.25], [1.2, -0.35], [0.2, -0.43], [-1.0, -0.46], [-2.5, -0.43], [-3.8, -0.36], [-4.8, -0.29], [-5.8, -0.24], [-5.8, -0.9], [2.7, -0.9]], BLUE2);
      poly([[-5.04, -0.5], [-5.04, 1.7], [-5.8, 1.7], [-5.8, -0.5]], BLUE2);
      // Green swoosh, thin at the cabin and broad up the fin, a gold line
      // under it.
      const S = [[0.35, -0.11], [-0.5, -0.06], [-1.3, 0.0], [-2.1, 0.07], [-2.9, 0.15], [-3.5, 0.27], [-3.95, 0.5], [-4.25, 0.85], [-4.5, 1.25]];
      band(S, (f) => 0.012 + 0.065 * f ** 1.3, GREEN2);
      band(S.slice(1, 7).map(([z, y]) => [z, y - 0.075]), (f) => 0.008 + 0.012 * f, GOLD2);
      { const [px, py] = P(-4.75, 1.32); arrow(g, px, py, 0.06 * LV.ky, BLUE2, side > 0 ? 1 : -1); }
    }
    // Belly grime under the hopper gatebox and behind the exhaust.
    const [, belly] = P(0, -0.42);
    const grd = g.createLinearGradient(0, belly, 0, oy + LV.H / 2);
    grd.addColorStop(0, 'rgba(60,50,30,0)');
    grd.addColorStop(1, 'rgba(60,50,30,0.22)');
    g.fillStyle = grd;
    g.fillRect(0, belly, LV.W, oy + LV.H / 2 - belly);
    if (side < 0) {
      const [ax, ay] = P(1.15, -0.32), [bx] = P(-0.6, -0.32);
      const sg = g.createLinearGradient(ax, 0, bx, 0);
      sg.addColorStop(0, 'rgba(30,25,20,0.32)'); sg.addColorStop(1, 'rgba(30,25,20,0)');
      g.fillStyle = sg;
      g.beginPath(); g.ellipse((ax + bx) / 2, ay + 6, Math.abs(bx - ax) / 2, 0.13 * LV.ky, 0, 0, Math.PI * 2); g.fill();
    }
    // Panel seams with rivet rows: cowl (firewall, the side split, the top
    // access door), hopper bay, cabin frames, the left door, aft frames,
    // access doors, the rudder hinge.
    const seams = [
      [[2.14, -0.2], [2.14, 0.4]], [[1.45, -0.5], [1.45, 0.55]], [[2.1, 0.1], [1.45, 0.08]], [[1.95, 0.32], [1.5, 0.36]],
      [[1.15, -0.55], [1.15, 0.6]], [[0.2, -0.6], [0.2, 0.65]], [[-0.5, -0.6], [-0.5, 0.66]],
      [[-1.78, -0.58], [-1.78, 1.21]], [[-2.6, -0.56], [-2.6, 0.5]], [[-3.3, -0.52], [-3.3, 0.42]], [[-4.0, -0.48], [-4.0, 0.37]],
      [[-4.5, -0.45], [-4.5, 0.34]], [[0.2, -0.3], [-1.78, -0.34]], [[-1.78, -0.32], [-4.9, -0.2]],
    ];
    if (side > 0) seams.push([[-0.64, 0.43], [-0.64, 0.1], [-1.56, 0.1], [-1.56, 0.43]]);
    for (const s of seams) {
      line(g, s, L.seam, 2);
      line(gb, s, '#3c3c3c', 2.6);
      for (let q = 0; q < s.length - 1; q++) {
        const [[za, ya], [zb, yb]] = [s[q], s[q + 1]];
        const n = Math.max(2, Math.round(Math.hypot(za - zb, ya - yb) / 0.06));
        for (let k = 0; k <= n; k++) {
          const [px, py] = P(za + ((zb - za) * k) / n + 0.022, ya + ((yb - ya) * k) / n);
          g.fillStyle = L.rivet; g.fillRect(px - 1, py - 1, 2, 2);
          gb.fillStyle = '#5c5c5c'; gb.beginPath(); gb.arc(px, py, 1.3, 0, Math.PI * 2); gb.fill();
        }
      }
    }
    // Cowl camlocs and the cooling louvres at the bottom rear of the cowl.
    for (let k = 0; k < 6; k++) {
      const [px, py] = P(2.02 - k * 0.11, 0.09);
      gb.fillStyle = '#2e2e2e'; gb.beginPath(); gb.arc(px, py, 3.2, 0, Math.PI * 2); gb.fill();
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(px, py, 2.6, 0, Math.PI * 2); g.fill();
    }
    for (let k = 0; k < 5; k++) line(g, [[1.75 - k * 0.06, -0.26], [1.72 - k * 0.06, -0.36]], 'rgba(0,0,0,0.45)', 3);
    const text = (z, y, str, hM, col, font = 'bold', stretch = 1) => {
      const [px, py] = P(z, y);
      g.save();
      g.font = `${font} ${Math.round(hM * LV.ky * 1.25)}px Arial`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.setTransform(1, 0, 0, 1, px, py);
      g.scale((LV.kx / LV.ky) * stretch, 1);
      g.fillStyle = col;
      g.fillText(str, 0, 0);
      g.restore();
    };
    // IPANEMA 203 on the cowl with the three speed lines.
    text(1.68, 0.25, 'IPANEMA', 0.1, L.text, 'italic bold', 1.05);
    text(1.4, 0.16, '203', 0.05, L.text, 'bold');
    for (let k = 0; k < 3; k++) line(g, [[1.98 - k * 0.03, 0.17 - k * 0.022], [1.52, 0.17 - k * 0.022]], L.text, 2);
    if (brasil) {
      text(-3.28, 0.04, reg, 0.3, '#f4f4f0', 'bold', 1.12);
      text(-1.92, 0.5, 'RESTRITA', 0.035, '#f4f4f0', 'bold');
    } else {
      text(-2.95, -0.14, reg, 0.28, NAVY, 'bold', 1.12);
      text(-1.2, 0.3, 'EXPERIMENTAL', 0.035, NAVY, 'bold');
    }
    text(0.95, -0.42, 'ETANOL', 0.03, 'rgba(240,240,236,0.85)', 'bold');
    text(-4.7, -0.3, 'NÃO PISE', 0.025, brasil ? 'rgba(240,240,236,0.7)' : 'rgba(30,40,80,0.6)', 'bold');
    speckle(g, 0, oy, LV.W, LV.H / 2, 2600, side > 0 ? 31 : 32, 0.08);
    g.restore();
  }
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}

// Wing skin: u = span / SPAN_UV, v = chord fraction (0 = LE); both wings and
// both skins share it.
function wingTextures(L = E203_LIVERIES[0]) {
  const Wd = 2048, H = 512;
  const c = canvas(Wd, H), b = canvas(Wd, H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  g.fillStyle = L.wing; g.fillRect(0, 0, Wd, H);
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, Wd, H);
  orangePeel(gb, Wd, H, 73);
  const X = (m) => (m / SPAN_UV) * Wd, Y = (f) => f * H;
  if (L.id === 'zpk') { g.fillStyle = L.tip; g.fillRect(X(W.tipX - 0.36), 0, Wd, H); }
  const r = rng(41);
  for (let i = 0; i < 80; i++) {
    g.fillStyle = `rgba(80,80,70,${0.02 + r() * 0.035})`;
    g.fillRect(r() * Wd, Y(0.1 + r() * 0.8), 2 + r() * 3, 30 + r() * 110);
  }
  for (let i = 0; i < 1100; i++) {
    g.fillStyle = `rgba(60,48,30,${0.06 + r() * 0.12})`;
    g.fillRect(r() * Wd, Y(r() * 0.05), 1 + r() * 2, 1 + r() * 2);
  }
  const seam = (x0, y0, x1, y1, rivet = 0.055) => {
    g.strokeStyle = L.seam; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    gb.strokeStyle = '#3e3e3e'; gb.lineWidth = 2.6;
    gb.beginPath(); gb.moveTo(x0, y0); gb.lineTo(x1, y1); gb.stroke();
    const n = Math.max(2, Math.round(Math.hypot((x1 - x0) / (Wd / SPAN_UV), ((y1 - y0) / H) * W.chord) / rivet));
    for (let k = 0; k <= n; k++) {
      const px = x0 + ((x1 - x0) * k) / n + 0.5, py = y0 + ((y1 - y0) * k) / n + 5;
      gb.fillStyle = '#5c5c5c'; gb.beginPath(); gb.arc(px, py, 1.3, 0, Math.PI * 2); gb.fill();
      g.fillStyle = L.rivet; g.fillRect(px - 1, py - 1, 2, 2);
    }
  };
  // Spars, ribs every ≈ 0.42 m, the hinge line.
  for (const f of [0.1, 0.27, 0.7]) seam(X(0.4), Y(f), X(6.6), Y(f));
  for (let x = 0.95; x < 6.5; x += 0.42) seam(X(x), Y(0.0), X(x), Y(0.74), 0.06);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, Y(0.742), Wd, 4);
  gb.fillStyle = '#202020'; gb.fillRect(0, Y(0.742), Wd, 6);
  // Fuel tank access panels and the filler.
  for (const [a, bb] of [[1.5, 2.1], [2.5, 3.1]]) {
    g.strokeStyle = L.seam; g.lineWidth = 2; g.strokeRect(X(a), Y(0.32), X(bb) - X(a), Y(0.22));
    gb.strokeStyle = '#383838'; gb.lineWidth = 2.6; gb.strokeRect(X(a), Y(0.32), X(bb) - X(a), Y(0.22));
  }
  speckle(g, 0, 0, Wd, H, 2400, 47, 0.07);
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}

const e203WingPanel = (stations, prof, side, ao) => {
  const g = wingPanel(stations, prof, side, ao);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * WING_SPAN_UV) / SPAN_UV);
  return g;
};
// Mirror a left-side (+X) geometry to the right: faces turned back outward.
const mirrorX = (g) => { const m = g.clone(); m.scale(-1, 1, 1); return m.index ? flipWinding(m) : m; };

// Winglet (left side): a swept fin that rises out of the full tip chord.
// Stations follow a path in the spanwise plane — out along the dihedral, a
// short knee, then up with a 12° outward cant; the trailing edge stays on
// the wing's trailing edge while the chord shrinks along a concave leading
// edge to a narrow rounded top. The section turns with the path, so the
// first station is the wing's tip section exactly.
export const WINGLET = { H: 0.46, cant: (12 * Math.PI) / 180, knee: 0.15, topChord: 0.16 };
function wingletGeometry() {
  const x0 = W.tipX, y0 = e203WingY(W.tipX), th0 = Math.atan(W.dih), th1 = Math.PI / 2 - WINGLET.cant;
  const te = W.le - W.chord;
  const N = 14, nK = 5;
  const sts = [];
  let px = x0, py = y0;
  const len = WINGLET.knee * (th1 - th0) + WINGLET.H;
  for (let i = 0; i <= N; i++) {
    let th, s;
    if (i <= nK) { const f = i / nK; th = th0 + (th1 - th0) * f; s = WINGLET.knee * (th1 - th0) * f; } else { th = th1; s = WINGLET.knee * (th1 - th0) + (WINGLET.H * (i - nK)) / (N - nK); }
    if (i > 0) {
      const ds = s - sts[i - 1].s, tm = (th + sts[i - 1].th) / 2;
      px += Math.cos(tm) * ds; py += Math.sin(tm) * ds;
    }
    const f = clamp(s / len, 0, 1);
    const chord = WINGLET.topChord + (W.chord - WINGLET.topChord) * (1 - f) ** 2.1;
    sts.push({ s, th, x: px, y: py, chord, le: te + chord, t: lerp(0.15, 0.085, f), m: lerp(0.04, 0.02, f) });
  }
  const n = 34, pos = [], idx = [];
  for (const st of sts) {
    const prof = airfoil(0, 1, st.t, st.m, 0.4, n / 2 - 1);
    const a = st.th - th0, Tx = -Math.sin(a), Ty = Math.cos(a);
    for (const [xc, yc] of prof) pos.push(st.x + Tx * yc * st.chord, st.y + Ty * yc * st.chord, st.le - xc * st.chord);
  }
  const np = pos.length / 3 / sts.length;
  for (let i = 0; i < sts.length - 1; i++) for (let k = 0; k < np; k++) {
    const a = i * np + k, b = i * np + ((k + 1) % np), c = a + np, d = b + np;
    idx.push(a, c, b, b, c, d);
  }
  const base = (sts.length - 1) * np;
  for (let k = 1; k < np - 1; k++) idx.push(base, base + k + 1, base + k);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const top = sts[sts.length - 1];
  return { geo, top: [top.x, top.y, top.le - top.chord * 0.5], root: [x0, y0, W.le] };
}

// Overall dimensions of the model (for the tests): span over the winglets,
// length spinner to rudder, and the high points (roof, fin, winglet tops).
export const E203_DIM = { spinnerZ: 2.53, rudderZ: -5.47 };
const FIN_TOP_Y = 1.5; // fin and rudder top (body frame)
export function e203Extent() {
  const wl = wingletGeometry();
  wl.geo.computeBoundingBox();
  const bb = wl.geo.boundingBox;
  return {
    span: 2 * bb.max.x, length: E203_DIM.spinnerZ - E203_DIM.rudderZ,
    tops: [[0, ROOF.yt, -1.45], [0, FIN_TOP_Y, -4.8], [bb.max.x, bb.max.y, -1.2]],
  };
}

// Hartzell blade (+X): straight, gently tapered, twisted.
function bladeLoft(r0, r1, steps, R) {
  const pos = [], idx = [];
  let n = 0;
  for (let i = 0; i <= steps; i++) {
    const r = r0 + ((r1 - r0) * i) / steps;
    const f = clamp((r - 0.18) / (R - 0.18), 0, 1);
    let c = 0.1 + 0.075 * Math.sin(Math.PI * Math.min(1, f * 0.9 + 0.12)) ** 0.6;
    if (f > 0.88) c *= 1 - ((f - 0.88) / 0.12) ** 2 * 0.6;
    const t = lerp(0.24, 0.07, f);
    const beta = Math.atan(1.9 / (2 * Math.PI * Math.max(r, 0.22)));
    const prof = airfoil(0, 1, t, 0.03, 0.35, 8);
    n = prof.length;
    for (const [xc, yc] of prof) {
      const Y = (xc - 0.35) * c, Z = yc * c;
      pos.push(r, Y * Math.cos(beta) - Z * Math.sin(beta), Y * Math.sin(beta) + Z * Math.cos(beta));
    }
  }
  for (let i = 0; i < steps; i++) for (let k = 0; k < n - 1; k++) {
    const a = i * n + k, b = a + 1, c = a + n, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const base = steps * n;
  for (let k = 1; k < n - 1; k++) idx.push(base, base + k, base + k + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// Point on a superellipse station at angle a (0 = left side, π/2 = top).
const sePt = (st, a) => {
  const c = Math.cos(a), s = Math.sin(a), up = s >= 0, p = up ? st.pU : st.pL;
  return [st.hw * Math.sign(c) * Math.abs(c) ** (2 / p), up ? st.ys + (st.yt - st.ys) * Math.abs(s) ** (2 / p) : st.ys - (st.ys - st.yb) * Math.abs(s) ** (2 / p)];
};
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ==========================================================================
export function createE203Model(panel, opts = {}) {
  const root = new THREE.Group();
  root.name = 'e203';
  let REG = opts.reg ?? 'PR-IPB', livery = 0;
  const L0 = E203_LIVERIES[0];
  const liv = liveryTextures(REG, L0);
  const wtx = wingTextures(L0);
  const coat = { roughness: 0.42, metalness: 0.0, specularIntensity: 0.4, clearcoat: 0.32, clearcoatRoughness: 0.24, envMap: opts.envMap ?? null, envMapIntensity: 0.35 };
  const ALB = 0.86;
  const col = (c) => new THREE.Color(c).multiplyScalar(ALB);
  const phys = (c, extra = {}) => new THREE.MeshPhysicalMaterial({ color: col(c), vertexColors: true, ...coat, ...extra });
  const M = {
    livery: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALB), map: liv.map, bumpMap: liv.bump, bumpScale: 1.3, vertexColors: true, ...coat }),
    wing: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALB), map: wtx.map, bumpMap: wtx.bump, bumpScale: 1.3, vertexColors: true, ...coat }),
    paint: phys(L0.tail), // tailplane and elevators
    frame: phys(L0.frame), // cabin frames
    tip: phys(L0.tip), // winglets, stabiliser tips
    gear: phys(L0.gear, { roughness: 0.5 }),
    lid: new THREE.MeshPhysicalMaterial({ color: 0xcdb993, roughness: 0.36, metalness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.2, vertexColors: true, envMap: opts.envMap ?? null, envMapIntensity: 0.5 }),
    ink: new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.6, vertexColors: true }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.62, metalness: 0.1, vertexColors: true }),
    deck: new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.93, vertexColors: true }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.28, metalness: 0.92, vertexColors: true }),
    polished: new THREE.MeshStandardMaterial({ color: 0xe6e8ea, roughness: 0.12, metalness: 1.0, envMap: opts.envMap ?? null, envMapIntensity: 1.0, vertexColors: true }),
    steel: new THREE.MeshStandardMaterial({ color: 0x5c6166, roughness: 0.42, metalness: 0.85, vertexColors: true }),
    exhaust: new THREE.MeshStandardMaterial({ color: 0x8b8178, roughness: 0.45, metalness: 0.85, vertexColors: true }),
    soot: new THREE.MeshStandardMaterial({ color: 0x2c2722, roughness: 0.7, metalness: 0.6, vertexColors: true }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.94, vertexColors: true }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92, metalness: 0, bumpMap: treadTexture(), bumpScale: 2.5 }),
    gloss: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.28, metalness: 0.1, vertexColors: true }),
    hub: new THREE.MeshStandardMaterial({ color: 0xdadcdc, roughness: 0.35, metalness: 0.5, vertexColors: true }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xa8bcc6, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.17, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5, depthWrite: false, side: THREE.DoubleSide }),
    tint: new THREE.MeshPhysicalMaterial({ color: 0x40505a, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.45, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false }),
    interior: new THREE.MeshStandardMaterial({ color: 0x4f5862, roughness: 0.75, metalness: 0.12, vertexColors: true }),
    floor: new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.85, metalness: 0.3, vertexColors: true }),
    seat: new THREE.MeshStandardMaterial({ color: 0x2e3338, roughness: 0.9, vertexColors: true }),
    harness: new THREE.MeshStandardMaterial({ color: 0x2d3a52, roughness: 0.8 }),
    red: new THREE.MeshStandardMaterial({ color: 0xc8261b, roughness: 0.45, emissive: 0x330000, vertexColors: true }),
    green: new THREE.MeshStandardMaterial({ color: 0x1f9a3a, roughness: 0.45, emissive: 0x002200, vertexColors: true }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xf2c21b, roughness: 0.45, vertexColors: true }),
    orange: new THREE.MeshStandardMaterial({ color: 0xf0561c, roughness: 0.5 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb8913c, roughness: 0.35, metalness: 0.9, vertexColors: true }),
    knob: new THREE.MeshStandardMaterial({ color: 0xd2231a, roughness: 0.3, metalness: 0.05 }),
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
    let a = 1 - Math.max(0, -y - 0.25) * 0.4;
    // Wing-root shadow line along the lower fuselage over the wing.
    const yb = Math.max(0, 1 - Math.abs(y + 0.42) / 0.2), zb = Math.max(0, 1 - Math.abs(z + 0.43) / 1.1);
    a *= 1 - 0.32 * yb * Math.sqrt(zb);
    // Tailplane root; just behind the spinner.
    if (z < -3.95 && z > -5.05) a *= 1 - 0.2 * Math.max(0, 1 - Math.abs(y - 0.22) / 0.12);
    if (z > 2.0) a *= 0.82 + 0.18 * clamp((2.14 - z) / 0.14, 0, 1);
    return clamp(a, 0.5, 1);
  };
  const fwdSt = sampleStations(FWD_KEYS, 22);
  const cabSt = sampleStations(CAB_KEYS, 10);
  const aftSt = sampleR(AFT_KEYS, 16);
  add('livery', liveryUV(tagged(loft(fwdSt, 64, fusAO))));
  add('livery', liveryUV(tagged(loft(cabSt, 56, fusAO, CAB_ARC))));
  add('livery', liveryUV(tagged(loftR(aftSt, fusAO))));
  // Half width of the body (nose to cabin rear) at (z, y): wing-root fillet,
  // gear and coupler fits.
  const bodySt = fwdSt.concat(cabSt.slice(1));
  const halfX = (z, y) => {
    let i = 1; while (i < bodySt.length - 1 && bodySt[i].z > z) i++;
    const a = bodySt[i - 1], b = bodySt[i], f = clamp((a.z - z) / (a.z - b.z || 1), 0, 1);
    const st = {}; for (const k of ['hw', 'ys', 'yb', 'yt', 'pU', 'pL']) st[k] = lerp(a[k], b[k], f);
    if (y >= st.ys) return surfX(st, y);
    const t = clamp((st.ys - y) / (st.ys - st.yb), 0, 1);
    return st.hw * Math.max(0, 1 - t ** st.pL) ** (1 / st.pL);
  };
  // Rudder post: the end of the cone, closed.
  {
    const st = aftSt[aftSt.length - 1];
    const cap = new THREE.ShapeGeometry(new THREE.Shape(aftRing(st).slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y))));
    cap.scale(-1, 1, 1); cap.translate(0, 0, st.z);
    add('livery', liveryUV(tagged(cap)));
  }
  // Cowl nose: the face between the lip and the spinner, with the round
  // cooling inlet (right), the landing light (left) and the chin inlet.
  const lip = fwdSt[0];
  add('livery', liveryUV(tagged(grid((u, v) => {
    const a = u * Math.PI * 2;
    const [ox, oy] = sePt(lip, a);
    const ix = Math.cos(a) * 0.19, iy = AX + Math.sin(a) * 0.19;
    return [lerp(ox, ix, v), lerp(oy, iy, v), lerp(lip.z, 2.11, v ** 1.4)];
  }, 56, 4, [0, AX, 1.4]))));
  {
    const z = 2.132;
    add('dark', tx(new THREE.CircleGeometry(0.05, 24), -0.205, AX + 0.03, z));
    add('dark', tx(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 24, 1, true), -0.205, AX + 0.03, z - 0.06, Math.PI / 2));
    add('polished', tx(new THREE.TorusGeometry(0.052, 0.008, 8, 28), -0.205, AX + 0.03, z + 0.002), true);
    add('polished', tx(new THREE.CircleGeometry(0.045, 22), 0.2, AX - 0.04, z + 0.001, 0, 0, 0, [1.2, 0.85, 1]));
    add('lens', tx(new THREE.SphereGeometry(0.045, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.2, AX - 0.04, z + 0.003, Math.PI / 2, 0, 0, [1.2, 0.25, 0.85]));
    add('dark', rbox(0.2, 0.06, 0.05, 0.02, 0, AX - 0.255, 2.112));
    for (let k = 0; k < 4; k++) add('steel', tx(new THREE.BoxGeometry(0.18, 0.005, 0.005), 0, AX - 0.276 + k * 0.013, 2.14), true);
  }
  // Exhaust stubs out of the bottom of the cowl, either side.
  for (const sx of [1, -1]) {
    add('exhaust', tube([[sx * 0.3, -0.3, 1.42], [sx * 0.34, -0.38, 1.3], [sx * 0.36, -0.44, 1.14]], 0.035, 10, 10));
    const e = new THREE.Vector3(sx * 0.36, -0.44, 1.14), dir = new THREE.Vector3(sx * 0.02, -0.06, -0.16).normalize();
    const th = new THREE.CircleGeometry(0.032, 14);
    th.applyMatrix4(new THREE.Matrix4().compose(e, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir), new THREE.Vector3(1, 1, 1)));
    add('soot', th);
  }
  // Hopper: the tan fibreglass lid between the cowl and the windshield, its
  // frame, and the loading box at its front.
  const topY = (z) => { const s0 = fwdSt.reduce((b, s) => (Math.abs(s.z - z) < Math.abs(b.z - z) ? s : b)); return s0.yt; };
  {
    const st = fwdSt.filter((s) => s.z <= 1.1 && s.z >= -0.4).map((s) => ({ ...s, hw: s.hw * 0.74, yt: s.yt + 0.012, ys: s.yt - 0.06 }));
    add('lid', loft(st, 18, null, [Math.PI * 0.2, Math.PI * 0.8]));
    for (const z of [1.1, -0.4]) add('dark', tx(new THREE.BoxGeometry(0.72, 0.02, 0.03), 0, topY(z) + 0.005, z));
    for (const sx of [1, -1]) add('dark', tube(st.map((s) => [sx * s.hw * 0.95, s.yt - 0.03, s.z]), 0.01, 18, 6));
    add('alu', rbox(0.3, 0.13, 0.22, 0.02, 0, topY(1.2) + 0.06, 1.22));
    add('dark', rbox(0.24, 0.02, 0.16, 0.008, 0, topY(1.2) + 0.13, 1.22), true);
    for (const sx of [1, -1]) add('steel', tx(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 8), sx * 0.09, topY(1.2) + 0.13, 1.115, 0, 0, Math.PI / 2), true);
  }
  // Hopper loading coupler on the left side, gatebox under the hopper.
  { const cx = halfX(-0.75, -0.26);
    add('dark', tx(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 18), cx, -0.26, -0.75, 0, 0, Math.PI / 2));
    add('brass', tx(new THREE.CylinderGeometry(0.045, 0.045, 0.025, 18), cx + 0.045, -0.26, -0.75, 0, 0, Math.PI / 2)); }
  add('dark', rbox(0.34, 0.08, 0.42, 0.02, 0, -0.59, 0.2));

  // ---------------- cabin ----------------
  // A structured cabin on the hopper section: the windshield raked 40° from
  // the hopper's top to the roof's front edge; flat side windows leaning in
  // from the sill to the roof rails; a flat roof with rounded edges; the
  // painted side panels behind the B-posts; the rear frame flows into the
  // fairing (rear fuselage, AFT_KEYS).
  const stWS = CAB_KEYS[0], stCab = CAB_KEYS[1];
  const wsA = (u) => RIM_A + (Math.PI - 2 * RIM_A) * u; // u = 0 left rim .. 1 right rim
  const wsZ = (y) => WS_Z + (WS_ZS - WS_Z) * (1 - clamp((y - SILL.y) / (stWS.yt - SILL.y), 0, 1)) ** 0.7;
  const wsBase = (u) => { const [x, y] = sePt(stWS, wsA(u)); return [x, y, wsZ(y)]; };
  // Roof across (u = 0 left rail .. 1 right rail): its front edge curves
  // forward to the centre; the rear frame is straight across.
  const roofAt = (u, rear) => {
    const [x, y] = CAB_TOP.at(u);
    const c = Math.max(0, 1 - (x / RAIL.x) ** 2);
    return [x, y, rear ? ROOF.zR : ROOF.zF + (ROOF.zFc - ROOF.zF) * c ** 0.6];
  };
  // Sill half width along the cabin (the lower body's 30° line).
  const sillX = (z) => halfX(z, SILL.y);
  // Deck strip from the hopper top back to the curved windshield base.
  add('livery', liveryUV(tagged(grid((u, v) => { const [x, y, z] = wsBase(u); return [x, y, lerp(WS_Z, z, v)]; }, 28, 2, [0, 0.1, -0.6]))));
  // Roof.
  add('livery', liveryUV(tagged(grid((u, v) => lerp3(roofAt(u, false), roofAt(u, true), v), 26, 6, [0, 0.6, -1.4]))));
  // Side: flat glass from the A-post to the B-post, painted panel behind it.
  const sideAt = (sx, u, v, z0, z1) => {
    const zf = z0 === 'A' ? lerp(WS_ZS, ROOF.zF, v) : z0;
    const z = lerp(zf, z1, u);
    return [sx * lerp(sillX(z), RAIL.x, v), lerp(SILL.y, RAIL.y, v), z];
  };
  const glassG = [];
  glassG.push(grid((u, v) => {
    const b = wsBase(u), t = roofAt(u, false);
    const p = lerp3(b, t, v);
    const bul = 0.012 * Math.sin(Math.PI * v);
    return [p[0], p[1] + bul * 0.6, p[2] + bul * 0.8];
  }, 26, 10));
  for (const sx of [1, -1]) {
    glassG.push(grid((u, v) => sideAt(sx, u, v, 'A', BPOST), 10, 6));
    add('livery', liveryUV(tagged(grid((u, v) => sideAt(sx, u, v, BPOST, ROOF.zR), 4, 6, [0, 0.6, -1.7]))));
  }
  // Lower window in the left door, under the side window's front half.
  const DW = { z0: -0.72, z1: -1.2, y0: 0.2, y1: 0.38 };
  const doorWin = grid((u, v) => { const y = lerp(DW.y0, DW.y1, v); return [surfX(stCab, y) + 0.005, y, lerp(DW.z0, DW.z1, u)]; }, 6, 4);
  // Frames: slim painted tubes in the scheme colour.
  const fr = (pts, r) => add('frame', tube(pts, r, Math.max(6, pts.length * 3), 8));
  const N = 16;
  fr(Array.from({ length: N + 1 }, (_, i) => wsBase(i / N)), 0.012);
  fr(Array.from({ length: N + 1 }, (_, i) => roofAt(i / N, false)), 0.015);
  for (const sx of [1, -1]) {
    const f0 = [sx * sillX(WS_ZS), SILL.y, WS_ZS], f1 = [sx * RAIL.x, RAIL.y, ROOF.zF];
    fr([f0, lerp3(f0, f1, 0.5), f1], 0.017); // A-post
    const b0 = [sx * sillX(BPOST), SILL.y, BPOST], b1 = [sx * RAIL.x, RAIL.y, BPOST];
    fr([b0, lerp3(b0, b1, 0.5), b1], 0.015); // B-post
    fr([f1, [sx * RAIL.x, RAIL.y, ROOF.zR + 0.03]], 0.012); // roof rail
    fr([f0, [sx * sillX(ROOF.zR), SILL.y, ROOF.zR + 0.03]], 0.011); // sill
  }
  {
    const loopPts = [[DW.z0, DW.y0], [DW.z1, DW.y0], [DW.z1, DW.y1], [DW.z0, DW.y1], [DW.z0, DW.y0]].map(([z, y]) => [surfX(stCab, y) + 0.008, y, z]);
    add('frame', tube(loopPts, 0.011, 20, 6));
    add('steel', rod([surfX(stCab, 0.3) + 0.03, 0.3, -1.5], [surfX(stCab, 0.3) + 0.03, 0.3, -1.38], 0.01, 6), true); // door handle
    for (const hy of [0.0, 0.36]) add('steel', tx(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), surfX(stCab, hy) + 0.01, hy, -0.68), true);
  }
  // Wire deflector over the windshield, the mast, the antenna wire to the
  // fin top, a whip on the turtle deck, beacon on the fin.
  const mastTop = [0, ROOF.yt + 0.075, ROOF.zFc - 0.01];
  add('ink', rod([0, topY(1.95) + 0.02, 1.95], mastTop, 0.0045, 5));
  add('ink', rod([0, ROOF.yt - 0.01, ROOF.zFc - 0.03], [0, ROOF.yt + 0.085, ROOF.zFc - 0.005], 0.012, 6));
  add('ink', rod(mastTop, [0, 1.135, -4.93], 0.0035, 4), true);
  add('white', rod([0, 0.41, -3.35], [0, 0.82, -3.55], 0.006, 5), true);

  // ---------------- wing ----------------
  const leY = (x) => e203WingY(x);
  const mainProf = airfoil(0, 0.74, 0.15, 0.035, 0.4, 18), aftProf = airfoil(0.76, 1.0, 0.15, 0.035, 0.4, 6);
  const flaps = [], ailerons = [];
  const wingAO = (x, xc, lower) => (lower ? 1 : 1 - 0.25 * Math.max(0, 1 - (x - 0.55) / 0.55));
  const st = (x) => ({ x, y: leY(x), le: W.le, chord: W.chord });
  const hinge = (side, x) => new THREE.Vector3(side * x, leY(x) + 0.04, W.le - 0.76 * W.chord);
  // Control surface on the hinge from x0 to x1: the pivot's X axis runs
  // along the hinge (towards +X on both sides), so rotation.x deflects it.
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
    deflect.add(m);
    pivot.add(deflect);
    root.add(pivot);
    return deflect;
  };
  const FLAP = [0.6, 3.62], AIL = [3.7, 6.2];
  const winglet = wingletGeometry();
  for (const side of [1, -1]) {
    add("wing", e203WingPanel([0.34, W.rootX, 1.5, 2.6, 3.7, 4.8, 5.8, W.tipX].map(st), mainProf, side, wingAO));
    for (const [a, b] of [[0.34, FLAP[0]], [FLAP[1], AIL[0]], [AIL[1], W.tipX]]) add('wing', e203WingPanel([st(a), st(b)], aftProf, side, wingAO));
    flaps.push(surfaceMesh(e203WingPanel([FLAP[0], 2.0, FLAP[1]].map(st), aftProf, side, wingAO), FLAP[0], FLAP[1], side));
    ailerons.push(surfaceMesh(e203WingPanel([AIL[0], 5.0, AIL[1]].map(st), aftProf, side), AIL[0], AIL[1], side));
    // Winglet out of the tip, nav light at its root, strobe at its top.
    add('tip', side > 0 ? winglet.geo.clone() : mirrorX(winglet.geo));
    const navP = [side * (W.tipX + 0.04), leY(W.tipX) + 0.01, W.le - 0.03];
    add(side > 0 ? 'red' : 'green', ball(navP, 0.026, 10));
    add('lens', tx(new THREE.SphereGeometry(0.05, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), ...navP, 0, 0, side * Math.PI / 2, [1, 1, 1.3]));
    add('strobe', ball([side * winglet.top[0], winglet.top[1] - 0.02, winglet.top[2] - 0.04], 0.018, 8));
    // Root fillet along the fuselage side.
    const fil = mainProf.slice(0, 19).map(([xc, yc]) => { const y = W.rootY + yc * W.chord + 0.01, z = W.le - xc * W.chord; return [side * (halfX(z, y) - 0.006), y, z]; });
    add('wing', tube(fil, 0.036, 30, 10));
    // Walkway on the left root, fuel filler, hinge brackets, pitot (left).
    if (side > 0) {
      const up = mainProf.slice(0, 19).filter(([xc]) => xc > 0.12 && xc < 0.62);
      const sheet = up.map(([xc, yc]) => [xc, yc + 0.004]).concat(up.slice().reverse().map(([xc, yc]) => [xc, yc + 0.0005]));
      add('deck', e203WingPanel([0.56, 0.85, 1.12].map(st), sheet, side));
    }
    const fx = 2.3, fy = leY(fx) + 0.13, fz = W.le - 0.35 * W.chord;
    add('dark', tx(new THREE.CylinderGeometry(0.06, 0.06, 0.025, 18), side * fx, fy, fz, 0, 0, side * Math.atan(W.dih)));
    add('steel', tx(new THREE.BoxGeometry(0.09, 0.01, 0.02), side * fx, fy + 0.016, fz, 0, 0, side * Math.atan(W.dih)), true);
    for (const hx of [0.9, 2.0, 3.3, 4.2, 5.2, 6.1]) {
      const h = hinge(side, hx);
      add('dark', tx(new THREE.BoxGeometry(0.03, 0.08, 0.13), h.x, h.y - 0.09, h.z + 0.03, 0, 0, side * Math.atan(W.dih)), true);
    }
  }
  add('steel', rod([4.4, leY(4.4) - 0.1, 0.25], [4.4, leY(4.4) - 0.1, 0.8], 0.01, 8), true);
  add('steel', rod([4.4, leY(4.4) - 0.02, 0.2], [4.4, leY(4.4) - 0.1, 0.3], 0.011, 6), true);

  // ---------------- tail ----------------
  const vfin = (prof, sts) => {
    const g = wingPanel(sts.map(([h, le, c]) => ({ x: h, y: 0, le, chord: c })), prof, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getY(i), p.getX(i), p.getZ(i));
    return flipWinding(g);
  };
  const HINGE_Z = -5.04;
  // Fin: 45° leading edge from the dorsal, square top; rudder on a
  // straight vertical hinge, running down past the end of the cone. The
  // root reaches down into the low dorsal; the top is where it was.
  // Fin (measured on PS-SAR): a big, almost square surface — the chord at
  // the top about 0.9 of the root's, the leading edge swept 26°, the top
  // flat (a small radius at its front corner), 1.16 m above the dorsal.
  const FIN_TOP = FIN_TOP_Y;
  const finSt = [[0.25, -3.806, 1.234], [0.34, -3.85, 1.19], [0.6, -3.977, 1.063], [0.9, -4.123, 0.917], [1.2, -4.27, 0.77], [1.4, -4.367, 0.673], [1.46, -4.405, 0.635], [1.49, -4.44, 0.6], [FIN_TOP, -4.49, 0.55]];
  add('livery', liveryUV(tagged(vfin(airfoil(0, 1, 0.12, 0, 0.4, 12), finSt))));
  // Dorsal fillet: a concave rise from the spine that runs into the fin's
  // leading edge (its last station is inside the fin).
  add('livery', liveryUV(tagged(loft(sampleStations([
    K(-3.1, 0.015, 0.43, 0.42, 0.445, 2.2, 2.2), K(-3.45, 0.035, 0.4, 0.39, 0.47, 2.2, 2.2),
    K(-3.72, 0.05, 0.385, 0.372, 0.56, 2.2, 2.2), K(-4.06, 0.055, 0.37, 0.355, 0.72, 2.2, 2.2),
  ], 20), 12, null))));
  // Rudder: constant chord from the fuselage's underside to the flat top,
  // square at its trailing-edge corner.
  const rudSt = [[-0.45, HINGE_Z, 0.38], [-0.3, HINGE_Z, 0.41], [0.0, HINGE_Z, 0.43], [0.5, HINGE_Z, 0.43], [1.0, HINGE_Z, 0.43], [1.42, HINGE_Z, 0.43], [1.48, HINGE_Z, 0.425], [FIN_TOP, HINGE_Z, 0.41]];
  const rudGeo = liveryUV(tagged(vfin(airfoil(0, 1, 0.13, 0, 0.3, 8), rudSt)));
  const rudTab = tagged(tx(new THREE.BoxGeometry(0.012, 0.26, 0.08), 0, 0.15, HINGE_Z - 0.42));
  rudGeo.translate(0, 0, -HINGE_Z); rudTab.translate(0, 0, -HINGE_Z);
  const rudder = new THREE.Group();
  rudder.position.set(0, 0, HINGE_Z);
  const rudMesh = new THREE.Mesh(rudGeo, M.livery);
  rudMesh.castShadow = true;
  rudder.add(rudMesh, new THREE.Mesh(rudTab, M.paint));
  rudder.add(new THREE.Mesh(tagged(ball([0, -0.29, -0.42], 0.022, 8)), M.white)); // tail light
  root.add(rudder);
  add('beacon', tx(new THREE.SphereGeometry(0.03, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, FIN_TOP + 0.005, -4.8));
  // Tailplane: rectangular, low on the cone; elevators with a trim tab;
  // tips in the scheme's tip colour.
  // High on the rear fuselage, just under the dorsal at the fin (PS-SAR).
  const STY = 0.22, SLE = -4.05, SC = 0.92, ELEV = 0.61, STIP = 2.1;
  const sst = (x) => ({ x, y: STY + x * 0.005, le: SLE, chord: SC });
  const elevParts = [];
  for (const side of [1, -1]) {
    add('paint', wingPanel([0.06, 1.0, 1.92].map(sst), airfoil(0, ELEV - 0.02, 0.11, 0, 0.4, 12), side));
    add('tip', wingPanel([1.92, 2.04, STIP].map((x, i) => ({ ...sst(x), chord: SC * (1 - [0, 0.02, 0.08][i]), le: SLE - [0, 0.005, 0.03][i] })), airfoil(0, 1, 0.11, 0, 0.4, 14), side));
    elevParts.push(tagged(wingPanel([0.1, 1.0, 1.9].map(sst), airfoil(ELEV, 1, 0.11, 0, 0.4, 4), side)));
  }
  elevParts.push(tagged(tx(new THREE.BoxGeometry(0.5, 0.012, 0.1), 0.9, STY + 0.006, SLE - SC - 0.03)));
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
    if (big) for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      parts.push(tagged(tx(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 8), sx * Wd * 0.33, Math.cos(a) * rim * 0.55, Math.sin(a) * rim * 0.55, 0, 0, Math.PI / 2)));
    }
    spin.add(tmesh, new THREE.Mesh(mergeGeometries(parts), M.hub));
    return spin;
  };
  for (const [name, sx] of [['mainL', 1], ['mainR', -1]]) {
    const cfg = gearCfg[name];
    const R = cfg.radius, Wd = 0.2;
    const ax = cfg.p[0], ay = cfg.p[1] + R, az = cfg.p[2];
    const g = new THREE.Group();
    // Tubular V: a front and a rear leg from the lower fuselage meet at the
    // axle on the inboard side of the wheel; the axle stub, brake line.
    // Leg roots on the fuselage's lower sides (front leg ahead of the wing).
    const fA = [sx * halfX(0.98, -0.36), -0.36, 0.98], rA = [sx * halfX(0.18, -0.46), -0.46, 0.18];
    const attachY = (fA[1] + rA[1]) / 2;
    const leg = new THREE.Group();
    leg.position.y = attachY;
    const Lp = (p) => [p[0], p[1] - attachY, p[2]];
    const axIn = [ax - sx * 0.13, ay + 0.03, az];
    const legParts = [rod(Lp(fA), Lp(axIn), 0.034, 12, 0.03), rod(Lp(rA), Lp(axIn), 0.03, 12, 0.026), tx(new RoundedBoxGeometry(0.09, 0.12, 0.14, 2, 0.025), ...Lp(axIn)), rod(Lp(axIn), Lp([ax - sx * 0.02, ay, az]), 0.032, 12)];
    const legMesh = new THREE.Mesh(mergeGeometries(legParts.map((p) => tagged(p))), M.gear);
    legMesh.castShadow = true; legMesh.receiveShadow = true;
    const brakeLine = new THREE.Mesh(tagged(tube([Lp([fA[0] - sx * 0.02, fA[1] - 0.02, fA[2] - 0.05]), Lp(lerp3(fA, axIn, 0.55).map((v, i) => v + [0, 0, -0.04][i])), Lp([axIn[0], axIn[1] + 0.06, axIn[2] - 0.04])], 0.007, 14, 5)), M.rubber);
    leg.add(legMesh, brakeLine);
    g.add(leg);
    for (const p of [fA, rA]) add('dark', rbox(0.1, 0.06, 0.12, 0.02, p[0], p[1] + 0.02, p[2]));
    const wheel = new THREE.Group();
    wheel.position.set(ax, ay, az);
    const spinPart = makeWheel(R, Wd, 0.15, sx, true);
    const brake = new THREE.Mesh(tagged(tx(new THREE.CylinderGeometry(0.12, 0.12, 0.012, 24), -sx * 0.08, 0, 0, 0, 0, Math.PI / 2)), M.steel);
    const caliper = new THREE.Mesh(tagged(new RoundedBoxGeometry(0.05, 0.08, 0.1, 2, 0.012).translate(-sx * 0.085, 0.09, -0.05)), M.dark);
    wheel.add(spinPart, brake, caliper);
    g.add(wheel);
    root.add(g);
    gearGroups[name] = { group: g, wheel, spin: spinPart, leg, legH: attachY - ay, rest: wheel.position.clone(), sx };
  }
  {
    const cfg = gearCfg.tail;
    const g = new THREE.Group();
    const R = cfg.radius;
    const fz = cfg.p[2] + 0.08, fy = cfg.p[1] + R + 0.13;
    // Short leaf spring from under the cone back to the steerable fork (the
    // tail sits low: the wheel is just under the rudder, as on the real one).
    add('ink', bar([0, -0.42, -4.5], [0, fy + 0.03, fz + 0.02], 0.05, 0.018));
    add('dark', rbox(0.09, 0.04, 0.15, 0.015, 0, -0.41, -4.5));
    add('ink', tx(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 10), 0, fy + 0.03, fz));
    const fork = new THREE.Group();
    fork.position.set(0, fy, fz);
    const forkGeo = mergeGeometries([
      tagged(tx(new THREE.BoxGeometry(0.014, 0.16, 0.06), 0.06, -0.06, -0.05, 0.5)), tagged(tx(new THREE.BoxGeometry(0.014, 0.16, 0.06), -0.06, -0.06, -0.05, 0.5)),
      tagged(tx(new THREE.BoxGeometry(0.13, 0.022, 0.06), 0, 0.02, 0)),
    ]);
    fork.add(new THREE.Mesh(forkGeo, M.steel));
    const wheel = new THREE.Group();
    wheel.position.set(0, -0.13, -0.08);
    wheel.add(makeWheel(R, 0.09, 0.07, 1, false));
    fork.add(wheel);
    g.add(fork);
    root.add(g);
    gearGroups.tail = { group: g, wheel, spin: wheel.children[0], fork, rest: wheel.position.clone(), sx: 0 };
  }

  // ---------------- spray system ----------------
  // Booms under the trailing edge on five hangers a side (they come down
  // from the fixed wing ahead of the flap hinge, below the flaps' path),
  // crossed under the belly; the wind-driven pump between the main legs.
  const nozzles = [];
  const BZ = -1.12, BDROP = 0.36;
  const boomAt = (side, x) => [side * x, leY(x) - BDROP, BZ];
  for (const side of [1, -1]) {
    add('alu', rod(boomAt(side, 0.62), boomAt(side, 5.55), 0.026, 12));
    add('alu', ball(boomAt(side, 5.55), 0.03, 10));
    for (const hx of [1.25, 2.3, 3.35, 4.4, 5.35]) {
      const topP = [side * hx, leY(hx) - 0.05, -0.6], bot = boomAt(side, hx);
      const len = Math.hypot(topP[1] - bot[1], topP[2] - bot[2]);
      add('alu', tx(new RoundedBoxGeometry(0.018, len, 0.06, 2, 0.007), side * hx, (topP[1] + bot[1]) / 2, (topP[2] + bot[2]) / 2, Math.atan2(topP[2] - bot[2], topP[1] - bot[1])));
      add('dark', tx(new THREE.CylinderGeometry(0.034, 0.034, 0.03, 10), ...bot, 0, 0, Math.PI / 2), true);
    }
    const NZ = 20;
    for (let k = 0; k < NZ; k++) {
      const x = 0.75 + ((5.5 - 0.75) * k) / (NZ - 1);
      const [bx, by, bz] = boomAt(side, x);
      add('alu', rod([bx, by, bz], [bx, by - 0.06, bz - 0.015], 0.007, 6), true);
      add('yellow', tx(new THREE.CylinderGeometry(0.017, 0.014, 0.045, 10), bx, by - 0.085, bz - 0.022, 0.3), true);
      add('brass', tx(new THREE.ConeGeometry(0.009, 0.022, 8), bx, by - 0.115, bz - 0.032, Math.PI + 0.3), true);
      nozzles.push(new THREE.Vector3(bx, by - 0.12, bz - 0.032));
    }
  }
  add('alu', rod(boomAt(1, 0.62), boomAt(-1, 0.62), 0.036, 12));
  add('alu', tube([[0, -0.9, 0.82], [0, -0.92, 0.2], [0, -0.86, -0.6], boomAt(1, 0.0).map((v, i) => (i === 0 ? 0 : v))], 0.035, 24, 10));
  const pump = new THREE.Group();
  pump.position.set(0, -0.86, 1.0);
  {
    const pumpBody = lathe([[0.0, -0.22], [0.08, -0.21], [0.1, -0.13], [0.11, 0.05], [0.09, 0.16], [0.055, 0.21], [0.0, 0.22]], 22);
    pumpBody.rotateX(Math.PI / 2);
    pump.add(new THREE.Mesh(tagged(pumpBody), M.dark));
    pump.add(new THREE.Mesh(tagged(tx(new THREE.SphereGeometry(0.045, 12, 8), 0, 0, 0.23)), M.steel));
    pump.add(new THREE.Mesh(tagged(rod([0, 0.1, 0], [0, 0.42, 0.05], 0.025, 8)), M.dark));
  }
  const pumpFan = new THREE.Group();
  pumpFan.position.z = 0.25;
  for (let i = 0; i < 7; i++) {
    const a = (i * Math.PI * 2) / 7;
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.008), M.orange);
    bl.position.set(Math.cos(a) * 0.085, Math.sin(a) * 0.085, 0);
    bl.rotation.z = a;
    bl.rotation.x = 0.4;
    pumpFan.add(bl);
  }
  pump.add(pumpFan);
  root.add(pump);

  // ---------------- propeller (Hartzell, three blades, constant speed) ----------------
  const R = A.propRadius;
  const PZ = 2.22;
  const prop = new THREE.Group();
  prop.position.set(0, AX, PZ);
  {
    const sp = lathe([[0.18, -0.11], [0.182, -0.04], [0.178, 0.05], [0.16, 0.14], [0.125, 0.22], [0.08, 0.28], [0.035, 0.31], [0.0, 0.315]], 36);
    sp.rotateX(Math.PI / 2);
    const spMesh = new THREE.Mesh(tagged(sp), M.polished);
    spMesh.castShadow = true;
    const back = tx(new THREE.CylinderGeometry(0.185, 0.185, 0.02, 36), 0, 0, -0.115, Math.PI / 2);
    prop.add(spMesh, new THREE.Mesh(tagged(back), M.steel));
  }
  const blades = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.55, metalness: 0.25, transparent: true });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xf0f0ec, roughness: 0.5, transparent: true });
  const bodyGeo = bladeLoft(0.14, R - 0.1, 16, R), tipGeo = bladeLoft(R - 0.1, R, 3, R);
  const pitchGroups = [];
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Group();
    b.rotation.z = (i * Math.PI * 2) / 3 + Math.PI / 6;
    const pg = new THREE.Group();
    const bm = new THREE.Mesh(bodyGeo, bladeMat);
    bm.castShadow = true;
    pg.add(bm, new THREE.Mesh(tipGeo, tipMat));
    b.add(pg);
    blades.add(b);
    pitchGroups.push(pg);
  }
  prop.add(blades);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R + 0.01, 64), new THREE.MeshBasicMaterial({ map: propDiscTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.z = 0.03;
  disc.renderOrder = 11;
  prop.add(disc);
  root.add(prop);

  // ---------------- cockpit ----------------
  // Built inside this cabin (e203Cockpit.js): glareshield, panel and its
  // instruments, the GPS, hopper windows, controls, seat and inner skins.
  const OFF = new THREE.Vector3(0, -0.2, -0.95); // pilot frame (the shared pilot figure's seat)
  const o3 = (x, y, z) => [x + OFF.x, y + OFF.y, z + OFF.z];
  const ck = buildE203Cockpit({
    panel, envMap: opts.envMap ?? null, harnessMat: M.harness, cowlTopY: topY,
    cab: { halfX, SILL, RAIL, ROOF, WS_Z, WS_ZS, BPOST, roofAt, sideAt, wsZ, deckPt: (a) => sePt(stWS, a), RIM_A, sillX, CABIN, aftRing, DW, OFF },
  });
  const { cockpit, stick, pedals, throttle, valve, leds, THR } = ck;
  const REF = {
    eye: ck.eye.clone(), seat: new THREE.Vector3(...o3(0, 0.05, -0.55)), panel: ck.panelMesh.position.clone(),
    stick: stick.position.clone(), throttle: throttle.position.clone(), pedals: pedals[0].position.clone().setX(0),
    roof: new THREE.Vector3(0, ROOF.yt - 0.03, -1.5), door: new THREE.Vector3(SILL.x, 0.2, -1.15), floorY: -0.48,
  };
  root.add(cockpit);

  // ---------------- pilot ----------------
  const pilot = buildPilot(M, stick, throttle, { throttleAt: THR });
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
  lod.addLevel(new THREE.Group(), 95);
  root.add(lod);
  const glassMesh = new THREE.Group();
  const gm = new THREE.Mesh(mergeGeometries(glassG.map((g) => tagged(g))), M.glass);
  gm.renderOrder = 10;
  const dm = new THREE.Mesh(tagged(doorWin), M.tint);
  dm.renderOrder = 10;
  glassMesh.add(gm, dm);
  root.add(glassMesh);
  root.traverse((o) => { if (o.isMesh && o.castShadow === undefined) o.castShadow = true; });

  // Blade angle of the constant-speed prop: fine at rest and at low speed,
  // coarser as the governor takes the power at speed; beacon and strobes.
  let bladeAngle = 0.18, t = 0;
  const update = (dt, fm, ac) => {
    t += dt;
    const o = fm.out;
    const pf = fm.shaftPower / A.maxPower;
    const target = fm.engine === 'running' ? 0.16 + 0.36 * smoothstep(15, 60, o.airspeed) + 0.08 * pf : 0.16;
    bladeAngle += clamp(target - bladeAngle, -dt * 0.8, dt * 0.8);
    for (const pg of pitchGroups) pg.rotation.x = bladeAngle;
    const on = fm.engine !== 'off';
    M.beacon.emissiveIntensity = on ? 0.6 + 2.4 * Math.max(0, Math.sin(t * 7.5)) ** 8 : 0;
    M.strobe.emissiveIntensity = on && t % 1.2 < 0.06 ? 4 : 0;
    ck.update(dt, fm, ac);
  };

  const swap = (mat, n) => {
    mat.map.dispose(); mat.bumpMap.dispose();
    mat.map = n.map; mat.bumpMap = n.bump; mat.needsUpdate = true;
  };
  return {
    // New registration marks: only the livery canvas is redrawn.
    setReg(r) { REG = r; swap(M.livery, liveryTextures(REG, E203_LIVERIES[livery])); },
    // Paint scheme: the fuselage and wing canvases and the colours of the
    // tailplane, cabin frame, winglets and gear (same geometry and UVs).
    setLivery(i) {
      const k = ((i % E203_LIVERIES.length) + E203_LIVERIES.length) % E203_LIVERIES.length;
      if (k === livery) return;
      livery = k;
      const L = E203_LIVERIES[k];
      swap(M.livery, liveryTextures(REG, L));
      swap(M.wing, wingTextures(L));
      for (const [m, c] of [[M.paint, L.tail], [M.frame, L.frame], [M.tip, L.tip], [M.gear, L.gear]]) m.color.set(c).multiplyScalar(ALB);
    },
    get livery() { return livery; },
    root, M, refs: REF,
    prop, blades, bladeMats: [bladeMat, tipMat], disc,
    ailerons, flaps, elevator, rudder,
    gear: gearGroups,
    stick, pedals, throttle, valve, leds, panelMesh: ck.panelMesh, inst: { pick: ck.pick, pickables: ck.pickables },
    pumpFan, nozzles, pilot, cockpit, glassMesh,
    eye: REF.eye.clone(),
    fuelFiller: new THREE.Vector3(2.3, leY(2.3) + 0.14, W.le - 0.35 * W.chord),
    hopperPort: new THREE.Vector3(halfX(-0.75, -0.26) + 0.03, -0.26, -0.75),
    update,
  };
}
