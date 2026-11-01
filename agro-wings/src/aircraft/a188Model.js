// Procedural Cessna A188B AgTruck (fictional Brazilian marks PR-AGT): its own
// geometry, from the type's published figures (12.70 m span, 7.94 m long,
// wing 19.05 m²) and measured on photographs — PR-LEO on the grass (side,
// ≈ 154 px/m), the yellow N5324B (front, rear 3/4), the AG Husky's cabin
// (door open) — with simulator views only for the paint and the in-flight
// three-quarter reading. VISUAL ONLY: the physics (FLIGHT_A188), gear
// contact points and hard points live in src/config.js.
// Body frame: +Z nose, +Y up, +X left wing; origin = CG (25 % of the chord).
// The geometry is built in the PR-LEO photograph's frame — the AgTruck on
// its three wheels, cowl top level — and the whole model is pitched nose-down
// A188_STANCE inside the root: the fuselage datum of a taildragger stands
// that much nose-up on the ground (the wing reaches its working angle in
// the three-point attitude) and flies a little nose-down. toBody / toPhoto
// convert between the two frames (config.js uses the same angle for the
// gear contact and hard points).
//
// The parts, after the photographs: a tall, flat-topped cowl the full height
// of the nose (the prop shaft high, the sump and chin below), a chrome
// spinner, the two landing lights and the chin inlet in the nose face; the
// hopper behind it with its square lid; the cabin standing high on the
// hopper section — windshield raked back to the roof, a centre post, the
// big side windows reaching down to a low sill, the left door, a flat roof —
// and the fairing that drops from the roof to a low dorsal; a deep rear
// fuselage, nearly straight underneath, tapering to the rudder post; the
// swept Cessna fin with its rounded top and the rudder running down below
// the cone; the tailplane low on the cone; a constant-chord low wing with
// conical drooped tips, braced by a strut from the top of the fuselage
// ahead of the windshield to mid span, with its jury strut; spring-steel
// main legs, a long tailwheel spring; booms under the trailing edge, the
// wind-driven pump under the belly; a three-blade McCauley.
// Paint and lettering are a side-projected livery with a matching bump map
// (both schemes share the geometry and UVs); AO is baked into vertex
// colours; small parts sit in a LOD. The cockpit is a188Cockpit.js (panel
// layout and textures in a188Panel.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { rng, clamp, smoothstep, lerp } from '../core/math.js';
import { FLIGHT_A188 } from '../config.js';
import {
  loft, K, sampleStations, airfoil, wingPanel, flipWinding, tagged, tx, rod, tube, bar, ball, rbox, lathe, grid,
  speckle, orangePeel, treadTexture, propDiscTexture, WING_SPAN_UV, buildPilot,
} from './model.js';
import { buildA188Cockpit } from './a188Cockpit.js';

const A = FLIGHT_A188;
export const A188_STANCE = (7 * Math.PI) / 180;
const CS = Math.cos(A188_STANCE), SN = Math.sin(A188_STANCE);
export const a188ToBody = ([x, y, z]) => [x, y * CS - z * SN, y * SN + z * CS];
const toPhoto = ([x, y, z]) => [x, y * CS + z * SN, -y * SN + z * CS];
// Wing: constant 1.62 m chord, leading edge 0.42 m ahead of the CG, root
// chord plane low on the fuselage, 5.5° dihedral; the drooped tip from
// tipX to the 6.35 m half span.
export const A188_WING = { rootX: 0.42, tipX: 6.02, half: 6.35, rootY: -0.56, le: 0.42, chord: 1.62, dih: Math.tan((5.5 * Math.PI) / 180) };
const W = A188_WING;
export const a188WingY = (x) => W.rootY + Math.max(0, Math.abs(x) - W.rootX) * W.dih;
const AX = 0.42; // thrust line above the CG (the prop shaft is high in the cowl)
const SPAN_UV = 6.4;
export const A188_SHADOW = { W: 14.6, L: 9.8, wing: [6.3, -1.25, 0.45], fus: [0.5, -1.2, 3.8], tail: [1.95, -5.2, -4.6], core: [4.4, 2.6] };

// ---------------------------------------------------------------------------
// Paint schemes. A — red (the simulator's classic scheme: red over silver
// with blue lines); B — orange (PR-LEO / N87622: orange top and cabin, white
// sides, a black band widening into the black rear fuselage, white tail).
const RED = '#c4261c', SILVER = '#d4d8da', NAVY = '#1c2c66', WHITE = '#f1f1ec';
const ORANGE = '#ec5a16', BLACK = '#141518';
export const A188_LIVERIES = [
  { id: 'red', name: 'Paint A — red', base: SILVER, top: RED, band: NAVY, pin: WHITE, tail: WHITE, tip: RED, strut: RED, gear: '#c9cdd0', wing: WHITE, wingBand: RED, text: WHITE, seam: 'rgba(40,44,50,0.28)', rivet: 'rgba(40,44,50,0.22)' },
  { id: 'orange', name: 'Paint B — orange', base: WHITE, top: ORANGE, band: BLACK, pin: '#c2271b', tail: WHITE, tip: ORANGE, strut: ORANGE, gear: WHITE, wing: ORANGE, wingBand: ORANGE, text: WHITE, seam: 'rgba(40,44,50,0.26)', rivet: 'rgba(40,44,50,0.2)' },
];

// ---------------------------------------------------------------------------
// Fuselage stations K(z, half-width, shoulder y, bottom y, top y, pU, pL),
// measured on PR-LEO (z = (x − 938) / 154.4, y = (410 − y) / 154.4 in its
// pixels): the cowl lip just round the spinner, the nose face going far
// down (the sump); the cowl top almost level at 0.6 m back to the
// windshield; the belly falling steadily to the cabin. Boxy sections (high
// exponents): flat sides and top with rounded corners.
const FWD_KEYS = [
  K(1.68, 0.27, 0.3, -0.2, 0.6, 2.5, 2.2), K(1.55, 0.36, 0.23, -0.34, 0.615, 3.2, 2.6),
  K(1.3, 0.42, 0.15, -0.48, 0.625, 4.0, 3.0), K(0.9, 0.455, 0.08, -0.58, 0.63, 4.6, 3.2),
  K(0.4, 0.47, 0.03, -0.66, 0.625, 5.0, 3.4), K(-0.2, 0.475, 0.0, -0.73, 0.615, 5.0, 3.4),
  K(-0.93, 0.475, -0.02, -0.78, 0.6, 5.0, 3.4),
];
// Under the cabin the body keeps the hopper's section, cut at the low sill
// (0.19 m): the side windows reach down to it.
const CAB_KEYS = [FWD_KEYS[FWD_KEYS.length - 1], K(-1.6, 0.475, -0.02, -0.8, 0.6, 5.0, 3.4), K(-2.22, 0.465, -0.02, -0.81, 0.6, 5.0, 3.4)];
const SILL_Y = 0.19;
const RIM_A = (() => { const st = CAB_KEYS[1]; return Math.asin(((SILL_Y - st.ys) / (st.yt - st.ys)) ** (st.pU / 2)); })();
const CAB_ARC = [Math.PI - RIM_A, 2 * Math.PI + RIM_A];
const SILL = (() => { const st = CAB_KEYS[1]; return { x: st.hw * Math.cos(RIM_A) ** (2 / st.pU), y: SILL_Y }; })();
const WS_Z = -0.93, WS_ZS = -0.98; // windshield base: centre / corners
const WS_A = 0.79; // the windshield's lower corners on the cowl's top contour (≈ 45°)

const R = (z, hw, ys, yb, pL, pU, yv, yr, yt, hwT, rT) => ({ z, hw, ys, yb, pL, pU, yv, yr, yt, hwT, rT });
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
// Rear fuselage: the cabin's rear frame (sill, straight sides, the flat roof
// 0.93 m up), the fairing dropping from the roof to a low dorsal at
// z ≈ −3.1, then the deep cone — its underside almost straight at −0.85 —
// narrowing to the rudder post.
const AFT_KEYS = [
  R(-2.22, 0.465, -0.02, -0.81, 3.4, 5.0, 0.6, SILL_Y, 0.93, 0.36, 0.08),
  R(-2.38, 0.455, -0.02, -0.815, 3.4, 4.8, 0.58, 0.18, 0.86, 0.34, 0.1),
  R(-2.6, 0.44, -0.03, -0.82, 3.3, 4.5, 0.55, 0.17, 0.67, 0.31, 0.13),
  R(-2.85, 0.415, -0.04, -0.83, 3.2, 4.0, 0.45, 0.14, 0.41, 0.27, 0.15),
  R(-3.1, 0.385, -0.06, -0.84, 3.1, 3.6, 0.3, 0.06, 0.2, 0.24, 0.15),
  R(-3.6, 0.33, -0.1, -0.85, 3.0, 3.2, 0.12, -0.02, 0.07, 0.19, 0.13),
  R(-4.2, 0.25, -0.16, -0.86, 2.8, 2.9, 0.0, -0.08, -0.04, 0.13, 0.1),
  R(-4.8, 0.17, -0.24, -0.86, 2.6, 2.6, -0.12, -0.17, -0.15, 0.08, 0.07),
  R(-5.35, 0.1, -0.34, -0.86, 2.5, 2.5, -0.26, -0.29, -0.28, 0.045, 0.04),
  R(-5.62, 0.065, -0.42, -0.85, 2.4, 2.4, -0.32, -0.35, -0.33, 0.03, 0.028),
];
const CABIN = AFT_KEYS[0];
// Cabin top: the rear frame's upper contour, rail to rail through the flat
// roof, by arc length (u = 0 left rail, 1 right rail).
const CAB_TOP = (() => {
  const { pts, tp } = topHalf(CABIN);
  const half = pts.slice(NS[0]);
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
const RAIL = CAB_TOP.rail;
const ROOF = { yt: CABIN.yt, zF: -1.4, zFc: -1.37, zR: CABIN.z };
// Side glass: its front edge leans back from the sill to the rail; the
// door window runs to the B-post, a small quarter window behind it.
const SG = { zB: -1.26, zT: -1.41 };
const BPOST = -2.03;
// Half width of a fuselage station at height y (upper half).
const surfX = (st, y) => {
  const s = clamp((y - st.ys) / (st.yt - st.ys), 0, 1) ** (st.pU / 2);
  return st.hw * Math.sqrt(Math.max(0, 1 - s * s)) ** (2 / st.pU);
};

// ---------------------------------------------------------------------------
// Livery: side projection of the fuselage, fin and rudder.
const LV = { Z0: -6.0, Z1: 2.2, Y0: -0.95, Y1: 1.15, W: 2048, H: 1024, M: 6 };
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

function liveryTextures(reg, L = A188_LIVERIES[0]) {
  const c = canvas(LV.W, LV.H), b = canvas(LV.W, LV.H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  gb.fillStyle = '#808080';
  gb.fillRect(0, 0, LV.W, LV.H);
  orangePeel(gb, LV.W, LV.H, 81);
  const orange = L.id === 'orange';
  for (const side of [1, -1]) {
    const P = (z, y) => lvPix(side, z, y);
    const oy = side > 0 ? 0 : LV.H / 2;
    const path = (ctx, pts) => {
      ctx.beginPath();
      pts.forEach(([z, y], i) => { const [px, py] = P(z, y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    };
    const poly = (pts, fill) => { path(g, pts); g.closePath(); g.fillStyle = fill; g.fill(); };
    const line = (ctx, pts, col, w) => { path(ctx, pts); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
    // A band between two lines given as (z, y) lists of the same length.
    const band = (upper, lower, fill) => poly(upper.concat(lower.slice().reverse()), fill);
    const off = (pts, dy) => pts.map(([z, y]) => [z, y + dy]);
    g.save();
    g.beginPath(); g.rect(0, oy, LV.W, LV.H / 2); g.clip();
    g.fillStyle = L.base;
    g.fillRect(0, oy, LV.W, LV.H / 2);
    // The colour line along the side: under the cowl's top, level along the
    // hopper, a little lower under the cabin, down along the cone.
    const LINE = [[2.3, 0.3], [1.6, 0.29], [0.6, 0.27], [-0.4, 0.25], [-0.95, 0.24], [-1.6, 0.2], [-2.25, 0.15], [-2.9, 0.06], [-3.6, -0.04], [-4.4, -0.14], [-5.2, -0.25], [-6.1, -0.36]];
    if (orange) {
      // Orange over the line ahead of the cabin and the whole cabin; the
      // fairing behind the roof stays white.
      poly([[2.3, 1.2], ...LINE.slice(0, 6), [-1.6, 1.2]], L.top);
      poly([[-1.55, 0.21], [-2.25, 0.16], [-2.25, 1.2], [-1.55, 1.2]], L.top);
      // Black band from the nose, widening behind the cabin into the black
      // rear fuselage (its top rising to the spine, its foot over a white
      // belly strip), with the red pinstripe under it.
      const BU = [[2.3, 0.17], [1.2, 0.16], [0.2, 0.14], [-0.8, 0.12], [-1.8, 0.08], [-2.4, 0.06], [-2.9, 0.07], [-3.5, 0.0], [-4.3, -0.1], [-5.1, -0.21], [-6.1, -0.33]];
      const BL = [[2.3, 0.05], [1.2, 0.02], [0.2, -0.02], [-0.8, -0.08], [-1.8, -0.2], [-2.4, -0.4], [-2.9, -0.6], [-3.5, -0.68], [-4.3, -0.72], [-5.1, -0.74], [-6.1, -0.76]];
      band(BU, BL, L.band);
      line(g, off(BL, -0.018), L.pin, 0.012 * LV.ky);
      line(g, off(BU.slice(0, 6), 0.016), L.pin, 0.008 * LV.ky);
      // Three stripes slanting up and back behind the cabin.
      for (let k = 0; k < 3; k++) {
        const z0 = -2.32 - k * 0.11;
        poly([[z0, 0.07], [z0 - 0.06, 0.07], [z0 - 0.17, 0.3], [z0 - 0.11, 0.3]], '#d62a1c');
      }
    } else {
      // Red over the line (cowl top, hopper, cabin and the spine to the fin),
      // white pinstripe, the blue band low on the side widening aft, a red
      // line in it; five white flashes behind the cabin.
      poly([[2.3, 1.2], ...LINE, [-6.1, 1.2]], L.top);
      line(g, off(LINE, -0.02), L.pin, 0.014 * LV.ky);
      const BU = [[2.3, 0.08], [1.2, 0.06], [0.2, 0.03], [-0.8, -0.01], [-1.8, -0.06], [-2.6, -0.1], [-3.5, -0.2], [-4.3, -0.28], [-5.1, -0.36], [-6.1, -0.44]];
      const BL = [[2.3, -0.02], [1.2, -0.05], [0.2, -0.1], [-0.8, -0.16], [-1.8, -0.26], [-2.6, -0.45], [-3.5, -0.62], [-4.3, -0.7], [-5.1, -0.74], [-6.1, -0.78]];
      band(BU, BL, L.band);
      line(g, off(BU, -0.035), L.top, 0.02 * LV.ky);
      for (let k = 0; k < 5; k++) {
        const z0 = -2.3 - k * 0.07;
        poly([[z0, 0.02], [z0 - 0.035, 0.02], [z0 - 0.1, 0.17], [z0 - 0.065, 0.17]], WHITE);
      }
    }
    // Fin and rudder: white; a stripe in the scheme's colour low on the fin,
    // the Cessna emblem near the top.
    poly([[-4.3, -0.02], [-4.3, 1.2], [-6.1, 1.2], [-6.1, -0.02]], L.tail);
    poly([[-4.3, 0.06], [-4.3, 0.12], [-6.1, 0.12], [-6.1, 0.06]], orange ? '#d62a1c' : L.top);
    if (!orange) poly([[-4.3, 0.86], [-4.3, 1.2], [-6.1, 1.2], [-6.1, 0.86]], L.top);
    {
      const [ex, ey] = P(-5.42, orange ? 0.86 : 0.7);
      const s = 0.07 * LV.ky;
      g.fillStyle = '#c8261b'; g.fillRect(ex - s, ey - s * 0.6, s * 0.95, s * 0.55);
      g.fillStyle = '#1e3c8c'; g.fillRect(ex + s * 0.05, ey - s * 0.6, s * 0.95, s * 0.55);
      g.fillStyle = '#1e3c8c'; g.fillRect(ex - s, ey + s * 0.02, s * 0.95, s * 0.5);
      g.fillStyle = '#c8261b'; g.fillRect(ex + s * 0.05, ey + s * 0.02, s * 0.95, s * 0.5);
    }
    // Painted quarter window behind the door (the fairing's glass is not
    // cut: it is a dark pane drawn on the skin).
    poly([[-2.24, 0.45], [-2.24, 0.82], [-2.36, 0.78], [-2.5, 0.52]], 'rgba(28,36,44,0.92)');
    line(g, [[-2.24, 0.45], [-2.24, 0.82], [-2.36, 0.78], [-2.5, 0.52], [-2.24, 0.45]], 'rgba(20,20,22,0.8)', 3);
    // Belly grime and the exhaust stain along the lower cowl.
    const [, belly] = P(0, -0.5);
    const grd = g.createLinearGradient(0, belly, 0, oy + LV.H / 2);
    grd.addColorStop(0, 'rgba(60,50,30,0)');
    grd.addColorStop(1, 'rgba(60,50,30,0.22)');
    g.fillStyle = grd;
    g.fillRect(0, belly, LV.W, oy + LV.H / 2 - belly);
    {
      const [ax, ay] = P(1.25, -0.12), [bx] = P(-0.4, -0.12);
      const sg = g.createLinearGradient(ax, 0, bx, 0);
      sg.addColorStop(0, 'rgba(30,25,20,0.3)'); sg.addColorStop(1, 'rgba(30,25,20,0)');
      g.fillStyle = sg;
      g.beginPath(); g.ellipse((ax + bx) / 2, ay + 4, Math.abs(bx - ax) / 2, 0.1 * LV.ky, 0, 0, Math.PI * 2); g.fill();
    }
    // Panel seams with rivet rows: the cowl (the split along its side, the
    // firewall), the hopper bay, the cabin's frames, the door (left), aft
    // frames, the access panels, the rudder hinge.
    const seams = [
      [[1.66, -0.2], [1.66, 0.6]], [[1.6, 0.42], [0.98, 0.43]], [[0.98, -0.6], [0.98, 0.62]], [[-0.93, -0.78], [-0.93, 0.6]],
      [[-2.22, -0.81], [-2.22, 0.93]], [[-2.9, -0.83], [-2.9, 0.36]], [[-3.6, -0.85], [-3.6, 0.06]], [[-4.3, -0.86], [-4.3, -0.04]],
      [[-5.0, -0.86], [-5.0, -0.19]], [[0.98, -0.25], [-0.93, -0.3]], [[-0.93, -0.32], [-5.6, -0.5]],
    ];
    if (side > 0) seams.push([[SG.zB + 0.02, SILL.y - 0.03], [BPOST - 0.01, SILL.y - 0.03], [BPOST - 0.01, 0.9]]);
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
    // Cowl fasteners along the split and the cooling louvres at its foot.
    for (let k = 0; k < 6; k++) {
      const [px, py] = P(1.5 - k * 0.1, 0.43);
      gb.fillStyle = '#2e2e2e'; gb.beginPath(); gb.arc(px, py, 3.2, 0, Math.PI * 2); gb.fill();
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.arc(px, py, 2.6, 0, Math.PI * 2); g.fill();
    }
    for (let k = 0; k < 6; k++) line(g, [[1.3 - k * 0.06, -0.42], [1.27 - k * 0.06, -0.52]], 'rgba(0,0,0,0.42)', 3);
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
    text(1.2, orange ? 0.21 : 0.2, 'FUEL INJECTION', 0.04, orange ? WHITE : NAVY, 'italic bold');
    if (orange) {
      text(-3.85, -0.33, reg, 0.27, L.text, 'bold', 1.05);
      text(-1.78, 0.25, 'RESTRICTED', 0.04, BLACK, 'bold');
    } else {
      text(-3.85, -0.43, reg, 0.22, L.text, 'bold', 1.05);
      text(-1.78, 0.25, 'RESTRICTED', 0.04, WHITE, 'bold');
    }
    text(-5.42, orange ? 0.74 : 0.58, 'Cessna', 0.05, '#1e3c8c', 'italic bold');
    text(-4.75, -0.45, 'NO STEP', 0.025, orange ? 'rgba(240,240,236,0.7)' : 'rgba(240,240,236,0.75)', 'bold');
    speckle(g, 0, oy, LV.W, LV.H / 2, 2600, side > 0 ? 41 : 42, 0.08);
    g.restore();
  }
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}

// Wing skin: u = span / SPAN_UV, v = chord fraction (0 = LE).
function wingTextures(L = A188_LIVERIES[0]) {
  const Wd = 2048, H = 512;
  const c = canvas(Wd, H), b = canvas(Wd, H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  g.fillStyle = L.wing; g.fillRect(0, 0, Wd, H);
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, Wd, H);
  orangePeel(gb, Wd, H, 83);
  const X = (m) => (m / SPAN_UV) * Wd, Y = (f) => f * H;
  // Leading-edge band and the tip in the scheme's colour (A); B is orange
  // all over with a white band near the tip.
  if (L.id === 'red') { g.fillStyle = L.wingBand; g.fillRect(0, 0, Wd, Y(0.09)); g.fillRect(X(5.7), 0, Wd, H); }
  else { g.fillStyle = WHITE; g.fillRect(X(5.35), 0, X(0.22), H); }
  const r = rng(51);
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
  for (const f of [0.1, 0.28, 0.7]) seam(X(0.35), Y(f), X(6.3), Y(f));
  for (let x = 0.85; x < 6.2; x += 0.45) seam(X(x), Y(0.0), X(x), Y(0.74), 0.06);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, Y(0.742), Wd, 4);
  gb.fillStyle = '#202020'; gb.fillRect(0, Y(0.742), Wd, 6);
  // Fuel tank bay and the filler cap.
  g.strokeStyle = L.seam; g.lineWidth = 2; g.strokeRect(X(1.2), Y(0.3), X(1.0), Y(0.24));
  gb.strokeStyle = '#383838'; gb.lineWidth = 2.6; gb.strokeRect(X(1.2), Y(0.3), X(1.0), Y(0.24));
  speckle(g, 0, 0, Wd, H, 2400, 57, 0.07);
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}

const a188WingPanel = (stations, prof, side, ao) => {
  const g = wingPanel(stations, prof, side, ao);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * WING_SPAN_UV) / SPAN_UV);
  return g;
};

// Drooped tip stations (left side): the conical camber turns the last
// 0.33 m down, the leading-edge corner rounded back.
const TIP_ST = [[0, 0, 0, 0], [0.13, -0.025, -0.012, -0.04], [0.23, -0.06, -0.045, -0.12], [0.3, -0.095, -0.1, -0.27], [0.33, -0.12, -0.17, -0.55]];
// Overall dimensions (for the tests): span, length spinner to rudder, the
// high points (roof, fin top).
export const A188_DIM = { spinnerZ: 2.075, rudderZ: -5.87 };
const FIN_TOP_Y = 1.12; // fin top: 2.36 m over the ground on three wheels
export function a188Extent() {
  return { span: 2 * W.half, length: A188_DIM.spinnerZ - A188_DIM.rudderZ, tops: [[0, ROOF.yt, -1.8], [0, FIN_TOP_Y, -5.3]].map(a188ToBody) };
}

// McCauley blade (+X): straight, gently tapered, twisted.
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
export function createA188Model(panel, opts = {}) {
  const root = new THREE.Group();
  root.name = 'a188';
  let REG = opts.reg ?? 'PR-AGT', livery = 0;
  const L0 = A188_LIVERIES[0];
  const liv = liveryTextures(REG, L0);
  const wtx = wingTextures(L0);
  const coat = { roughness: 0.42, metalness: 0.0, specularIntensity: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.26, envMap: opts.envMap ?? null, envMapIntensity: 0.35 };
  const ALB = 0.86;
  const col = (c) => new THREE.Color(c).multiplyScalar(ALB);
  const phys = (c, extra = {}) => new THREE.MeshPhysicalMaterial({ color: col(c), vertexColors: true, ...coat, ...extra });
  const M = {
    livery: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALB), map: liv.map, bumpMap: liv.bump, bumpScale: 1.3, vertexColors: true, ...coat }),
    wing: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALB), map: wtx.map, bumpMap: wtx.bump, bumpScale: 1.3, vertexColors: true, ...coat }),
    paint: phys(L0.tail), // tailplane and elevators
    frame: phys(L0.top), // cabin frames
    tip: phys(L0.tip), // stabiliser tips
    strut: phys(L0.strut),
    gear: phys(L0.gear, { roughness: 0.5 }),
    lid: phys(L0.top),
    ink: new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.6, vertexColors: true }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.62, metalness: 0.1, vertexColors: true }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.28, metalness: 0.92, vertexColors: true }),
    polished: new THREE.MeshStandardMaterial({ color: 0xe6e8ea, roughness: 0.12, metalness: 1.0, envMap: opts.envMap ?? null, envMapIntensity: 1.0, vertexColors: true }),
    steel: new THREE.MeshStandardMaterial({ color: 0x5c6166, roughness: 0.42, metalness: 0.85, vertexColors: true }),
    exhaust: new THREE.MeshStandardMaterial({ color: 0x8b8178, roughness: 0.45, metalness: 0.85, vertexColors: true }),
    soot: new THREE.MeshStandardMaterial({ color: 0x2c2722, roughness: 0.7, metalness: 0.6, vertexColors: true }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.94, vertexColors: true }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92, metalness: 0, bumpMap: treadTexture(), bumpScale: 2.5 }),
    hub: new THREE.MeshStandardMaterial({ color: 0xdadcdc, roughness: 0.35, metalness: 0.5, vertexColors: true }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xa8bcc6, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.17, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5, depthWrite: false, side: THREE.DoubleSide }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false }),
    red: new THREE.MeshStandardMaterial({ color: 0xc8261b, roughness: 0.45, emissive: 0x330000, vertexColors: true }),
    green: new THREE.MeshStandardMaterial({ color: 0x1f9a3a, roughness: 0.45, emissive: 0x002200, vertexColors: true }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xf2c21b, roughness: 0.45, vertexColors: true }),
    orange: new THREE.MeshStandardMaterial({ color: 0xf0561c, roughness: 0.5 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb8913c, roughness: 0.35, metalness: 0.9, vertexColors: true }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35, emissive: 0x222222, vertexColors: true }),
    beacon: new THREE.MeshStandardMaterial({ color: 0xd8261b, roughness: 0.3, emissive: 0xff2010, emissiveIntensity: 0, vertexColors: true }),
    strobe: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.2, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true }),
    suit: new THREE.MeshStandardMaterial({ color: 0x4a5462, roughness: 0.88 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.75 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xb88462, roughness: 0.7 }),
    helmet: new THREE.MeshPhysicalMaterial({ color: 0xeeeae2, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x15181c, roughness: 0.05, metalness: 0.3, clearcoat: 1 }),
    helmStripe: new THREE.MeshPhysicalMaterial({ color: 0xc4261c, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    harness: new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.8 }),
  };

  const B = {};
  const add = (mat, g, fine = false) => { const k = (fine ? 'fine:' : '') + mat; (B[k] ||= []).push(tagged(g)); };

  // ---------------- fuselage ----------------
  const fusAO = (x, y, z) => {
    let a = 1 - Math.max(0, -y - 0.35) * 0.4;
    // Wing-root shadow along the lower fuselage over the wing.
    const yb = Math.max(0, 1 - Math.abs(y - W.rootY) / 0.2), zb = Math.max(0, 1 - Math.abs(z + 0.4) / 1.1);
    a *= 1 - 0.32 * yb * Math.sqrt(zb);
    // Tailplane root; just behind the spinner.
    if (z < -4.55 && z > -5.65) a *= 1 - 0.2 * Math.max(0, 1 - Math.abs(y + 0.6) / 0.12);
    if (z > 1.55) a *= 0.82 + 0.18 * clamp((1.68 - z) / 0.13, 0, 1);
    return clamp(a, 0.5, 1);
  };
  const fwdSt = sampleStations(FWD_KEYS, 22);
  const cabSt = sampleStations(CAB_KEYS, 10);
  const aftSt = sampleR(AFT_KEYS, 16);
  add('livery', liveryUV(tagged(loft(fwdSt, 64, fusAO))));
  add('livery', liveryUV(tagged(loft(cabSt, 56, fusAO, CAB_ARC))));
  add('livery', liveryUV(tagged(loftR(aftSt, fusAO))));
  const bodySt = fwdSt.concat(cabSt.slice(1));
  // Half width of the body (nose to cabin rear) at (z, y).
  const halfX = (z, y) => {
    let i = 1; while (i < bodySt.length - 1 && bodySt[i].z > z) i++;
    const a = bodySt[i - 1], b = bodySt[i], f = clamp((a.z - z) / (a.z - b.z || 1), 0, 1);
    const st = {}; for (const k of ['hw', 'ys', 'yb', 'yt', 'pU', 'pL']) st[k] = lerp(a[k], b[k], f);
    if (y >= st.ys) return surfX(st, y);
    const t = clamp((st.ys - y) / (st.ys - st.yb), 0, 1);
    return st.hw * Math.max(0, 1 - t ** st.pL) ** (1 / st.pL);
  };
  const topY = (z) => { const s0 = fwdSt.reduce((b, s) => (Math.abs(s.z - z) < Math.abs(b.z - z) ? s : b)); return s0.yt; };
  {
    // Rudder post: the end of the cone, closed.
    const st = aftSt[aftSt.length - 1];
    const cap = new THREE.ShapeGeometry(new THREE.Shape(aftRing(st).slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y))));
    cap.scale(-1, 1, 1); cap.translate(0, 0, st.z);
    add('livery', liveryUV(tagged(cap)));
  }
  // Nose face between the lip and the spinner (high in it): the two
  // landing lights low either side, the rectangular chin inlet, the dark
  // cooling inlets beside the spinner.
  const lip = fwdSt[0];
  add('livery', liveryUV(tagged(grid((u, v) => {
    const a = u * Math.PI * 2;
    const [ox, oy] = sePt(lip, a);
    const ix = Math.cos(a) * 0.185, iy = AX + Math.sin(a) * 0.185;
    return [lerp(ox, ix, v), lerp(oy, iy, v), lerp(lip.z, 1.67, v ** 1.4)];
  }, 56, 4, [0, AX, 1.2]))));
  {
    const z = 1.685;
    for (const sx of [1, -1]) {
      add('polished', tx(new THREE.CircleGeometry(0.048, 22), sx * 0.13, -0.02, z + 0.001));
      add('lens', tx(new THREE.SphereGeometry(0.046, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), sx * 0.13, -0.02, z + 0.003, Math.PI / 2, 0, 0, [1, 0.3, 1]));
      add('dark', tx(new THREE.CircleGeometry(0.075, 20, 0, Math.PI), sx * 0.2, AX - 0.02, z - 0.004, 0, 0, sx > 0 ? -1.2 : 1.2 - Math.PI, [1, 0.7, 1]));
    }
    add('dark', rbox(0.17, 0.08, 0.04, 0.015, 0, -0.13, z - 0.005));
    for (let k = 0; k < 4; k++) add('steel', tx(new THREE.BoxGeometry(0.15, 0.005, 0.005), 0, -0.155 + k * 0.016, z + 0.016), true);
  }
  // Exhaust stacks out of both sides of the lower cowl, straight back.
  for (const sx of [1, -1]) {
    const x0 = sx * (halfX(1.35, -0.08) - 0.02);
    add('exhaust', rod([x0, -0.08, 1.35], [x0 + sx * 0.12, -0.09, 1.25], 0.035, 12));
    add('exhaust', rod([x0 + sx * 0.12, -0.09, 1.25], [x0 + sx * 0.13, -0.09, 1.0], 0.034, 12));
    add('soot', tx(new THREE.CircleGeometry(0.03, 14), x0 + sx * 0.13, -0.09, 0.995, 0, Math.PI));
  }
  // Hopper lid: a square lid with its frame on the top ahead of the
  // windshield, the loading box at its front.
  {
    const lz = 0.15, lw = 0.56, ld = 0.5;
    add('lid', rbox(lw, 0.035, ld, 0.012, 0, topY(lz) + 0.012, lz));
    add('dark', rbox(lw + 0.05, 0.02, ld + 0.05, 0.01, 0, topY(lz) - 0.002, lz));
    for (const sx of [1, -1]) add('steel', tx(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 8), sx * 0.17, topY(lz) + 0.035, lz + ld / 2 - 0.05, 0, 0, Math.PI / 2), true);
    add('alu', rbox(0.24, 0.1, 0.16, 0.02, 0, topY(0.62) + 0.05, 0.62));
    add('dark', rbox(0.18, 0.02, 0.11, 0.008, 0, topY(0.62) + 0.105, 0.62), true);
  }
  // Loading coupler (left side) and the gatebox under the hopper.
  { const cx = halfX(-0.55, -0.3);
    add('dark', tx(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 18), cx, -0.3, -0.55, 0, 0, Math.PI / 2));
    add('brass', tx(new THREE.CylinderGeometry(0.045, 0.045, 0.025, 18), cx + 0.045, -0.3, -0.55, 0, 0, Math.PI / 2)); }
  add('dark', rbox(0.34, 0.08, 0.42, 0.02, 0, -0.74, -0.1));

  // ---------------- cabin ----------------
  // Windshield from the cowl's top (between its rounded corners) back to the
  // roof's front edge, split by the centre post; the side windows from the
  // low sill to the roof rails, their front edge leaning back; the door
  // (left) and the small quarter window behind the B-post; the flat roof.
  const stWS = CAB_KEYS[0];
  const wsA = (u) => WS_A + (Math.PI - 2 * WS_A) * u; // u = 0 left corner .. 1 right corner
  const wsBase = (u) => { const [x, y] = sePt(stWS, wsA(u)); const c = Math.abs(2 * u - 1); return [x, y + 0.004, WS_Z + (WS_ZS - WS_Z) * c ** 2]; };
  const roofAt = (u, rear) => {
    const [x, y] = CAB_TOP.at(u);
    const c = Math.max(0, 1 - (x / RAIL.x) ** 2);
    return [x, y, rear ? ROOF.zR : ROOF.zF + (ROOF.zFc - ROOF.zF) * c ** 0.6];
  };
  const sillX = (z) => halfX(z, SILL.y);
  // Side glass between its front edge (leaning back) and z1.
  const sideAt = (sx, u, v, z0, z1) => {
    const zf = z0 === 'F' ? lerp(SG.zB, SG.zT, v) : z0;
    const z = lerp(zf, z1, u);
    return [sx * lerp(sillX(z), RAIL.x, v), lerp(SILL.y, RAIL.y, v), z];
  };
  // Roof.
  add('livery', liveryUV(tagged(grid((u, v) => lerp3(roofAt(u, false), roofAt(u, true), v), 26, 6, [0, 0.5, -1.8]))));
  // Painted panel either side between the A-post and the side glass's front
  // edge, down to the sill.
  const quarter = [];
  for (const sx of [1, -1]) {
    const c0 = wsBase(sx > 0 ? 0 : 1); // windshield corner
    const aTop = [sx * RAIL.x, RAIL.y, ROOF.zF];
    // Coons patch below the windshield corner's height: bottom = the sill,
    // top = level from the corner to the side glass's front edge, front =
    // up the hull to the corner, rear = the side glass's front edge. Above
    // it, between the A-post and that edge, the windshield wraps round as a
    // quarter pane.
    const vE = (c0[1] - SILL.y) / (RAIL.y - SILL.y), pE = sideAt(sx, 0, vE, 'F', 0);
    const bottom = (u) => { const z = lerp(WS_ZS, SG.zB, u); return [sx * sillX(z), SILL.y, z]; };
    const top = (u) => lerp3(c0, pE, u);
    const front = (v) => { const y = lerp(SILL.y, c0[1], v); return v >= 1 ? c0 : [sx * halfX(WS_ZS, y), y, WS_ZS]; };
    const rear = (v) => sideAt(sx, 0, v * vE, 'F', 0);
    quarter.push(grid((u, v) => lerp3(lerp3(c0, pE, u), aTop, v), 4, 4));
    const P00 = bottom(0), P10 = bottom(1), P01 = top(0), P11 = top(1);
    add('livery', liveryUV(tagged(grid((u, v) => {
      const a = bottom(u), b = top(u), f = front(v), r = rear(v);
      return [0, 1, 2].map((k) => (1 - v) * a[k] + v * b[k] + (1 - u) * f[k] + u * r[k]
        - ((1 - u) * (1 - v) * P00[k] + u * (1 - v) * P10[k] + (1 - u) * v * P01[k] + u * v * P11[k]));
    }, 6, 8, [0, 0.4, -1.4]))));
  }
  const glassG = [...quarter];
  // Windshield: two panes either side of the centre post.
  for (const [u0, u1] of [[0, 0.485], [0.515, 1]]) {
    glassG.push(grid((uu, v) => {
      const u = lerp(u0, u1, uu);
      const b = wsBase(u), t = roofAt(u, false);
      return lerp3(b, t, v);
    }, 12, 8));
  }
  for (const sx of [1, -1]) {
    glassG.push(grid((u, v) => sideAt(sx, u, v, 'F', BPOST), 10, 6));
    glassG.push(grid((u, v) => sideAt(sx, u, v, BPOST - 0.04, ROOF.zR + 0.02), 3, 6));
  }
  // Frames: tubes in the scheme's top colour.
  const fr = (pts, r) => add('frame', tube(pts, r, Math.max(6, pts.length * 3), 8));
  const N = 16;
  fr(Array.from({ length: N + 1 }, (_, i) => wsBase(i / N)), 0.013);
  fr(Array.from({ length: N + 1 }, (_, i) => roofAt(i / N, false)), 0.017);
  fr([wsBase(0.5), roofAt(0.5, false)], 0.016); // centre post
  for (const sx of [1, -1]) {
    const c0 = wsBase(sx > 0 ? 0 : 1), aTop = [sx * RAIL.x, RAIL.y, ROOF.zF];
    fr([c0, lerp3(c0, aTop, 0.5), aTop], 0.02); // A-post
    const g0 = [sx * sillX(SG.zB), SILL.y, SG.zB], g1 = [sx * RAIL.x, RAIL.y, SG.zT];
    fr([g0, g1], 0.016); // the side glass's front frame
    const b0 = [sx * sillX(BPOST), SILL.y, BPOST], b1 = [sx * RAIL.x, RAIL.y, BPOST];
    fr([b0, b1], 0.018); // B-post (door's rear edge)
    fr([aTop, [sx * RAIL.x, RAIL.y, ROOF.zR + 0.03]], 0.013); // roof rail
    fr([g0, [sx * sillX(ROOF.zR), SILL.y, ROOF.zR + 0.03]], 0.012); // sill
    fr([[sx * RAIL.x, RAIL.y, ROOF.zR + 0.02], [sx * sillX(ROOF.zR + 0.02), SILL.y, ROOF.zR + 0.02]], 0.015); // rear frame
  }
  // Door (left): handle, hinges on the front frame, the triangular vent
  // window's wire frame; the deflector and wire, a whip antenna.
  {
    const dz0 = SG.zB, dz1 = BPOST;
    const x = (y, z) => sillX(z) + (RAIL.x - sillX(z)) * clamp((y - SILL.y) / (RAIL.y - SILL.y), 0, 1);
    add('steel', rod([x(0.3, -1.85) + 0.035, 0.3, -1.9], [x(0.3, -1.75) + 0.035, 0.3, -1.76], 0.01, 6), true);
    for (const hy of [0.26, 0.7]) add('steel', tx(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), x(hy, dz0) + 0.01, hy, lerp(SG.zB, SG.zT, (hy - SILL.y) / (RAIL.y - SILL.y)) - 0.01), true);
    const tri = [[0.32, -1.42], [0.62, -1.47], [0.32, -1.7], [0.32, -1.42]].map(([y, z]) => [x(y, z) + 0.006, y, z]);
    add('ink', tube(tri, 0.006, 18, 5), true);
    void dz1;
  }
  const mastTop = [0, ROOF.yt + 0.09, ROOF.zFc - 0.02];
  add('ink', rod([0, topY(1.6) + 0.02, 1.6], mastTop, 0.0045, 5)); // wire deflector
  add('ink', rod([0, ROOF.yt - 0.01, ROOF.zFc - 0.03], [0, ROOF.yt + 0.1, ROOF.zFc - 0.01], 0.012, 6));
  add('ink', rod(mastTop, [0, FIN_TOP_Y + 0.02, -5.2], 0.0035, 4), true); // antenna wire to the fin top
  add('white', rod([0, ROOF.yt, -2.05], [0, ROOF.yt + 0.32, -2.3], 0.006, 5), true);
  add('dark', rbox(0.16, 0.05, 0.22, 0.02, 0, ROOF.yt + 0.02, -1.95), true); // GPS antenna dome base
  add('white', tx(new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, ROOF.yt + 0.045, -1.95, 0, 0, 0, [1, 0.8, 1.3]), true);

  // ---------------- wing ----------------
  const leY = (x) => a188WingY(x);
  const mainProf = airfoil(0, 0.74, 0.15, 0.035, 0.4, 18), aftProf = airfoil(0.76, 1.0, 0.15, 0.035, 0.4, 6), fullProf = airfoil(0, 1, 0.15, 0.035, 0.4, 18);
  const flaps = [], ailerons = [];
  const wingAO = (x, xc, lower) => (lower ? 1 : 1 - 0.25 * Math.max(0, 1 - (x - 0.5) / 0.55));
  const st = (x) => ({ x, y: leY(x), le: W.le, chord: W.chord });
  const hinge = (side, x) => new THREE.Vector3(side * x, leY(x) + 0.04, W.le - 0.76 * W.chord);
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
  const FLAP = [0.55, 3.45], AIL = [3.52, 5.98];
  const y0T = leY(W.tipX);
  const tipSt = TIP_ST.map(([dx, dy, dle, dc]) => ({ x: W.tipX + dx, y: y0T + dy, le: W.le + dle, chord: W.chord + dc }));
  // Strut: from the top of the fuselage side just ahead of the windshield to
  // the front spar at mid span; the jury strut from its middle down to the
  // wing. Flattened (streamlined) sections in the scheme's colour.
  const STRUT = { body: [0.43, 0.38, -0.55], wing: [3.05, 0, -0.1] };
  for (const side of [1, -1]) {
    add('wing', a188WingPanel([0.3, W.rootX, 1.5, 2.6, 3.7, 4.8, W.tipX].map(st), mainProf, side, wingAO));
    for (const [a, b] of [[0.3, FLAP[0]], [FLAP[1], AIL[0]], [AIL[1], W.tipX]]) add('wing', a188WingPanel([st(a), st(b)], aftProf, side, wingAO));
    add('wing', a188WingPanel(tipSt, fullProf, side, wingAO));
    flaps.push(surfaceMesh(a188WingPanel([FLAP[0], 2.0, FLAP[1]].map(st), aftProf, side, wingAO), FLAP[0], FLAP[1], side));
    ailerons.push(surfaceMesh(a188WingPanel([AIL[0], 4.8, AIL[1]].map(st), aftProf, side), AIL[0], AIL[1], side));
    // Nav light in the drooped tip, strobe beside it.
    const tl = tipSt[tipSt.length - 2];
    const navP = [side * (tl.x + 0.02), tl.y + 0.02, tl.le - 0.05];
    add(side > 0 ? 'red' : 'green', ball(navP, 0.024, 10));
    add('lens', tx(new THREE.SphereGeometry(0.045, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), ...navP, 0, 0, side * Math.PI / 2, [1, 1, 1.3]));
    add('strobe', ball([side * (tl.x + 0.01), tl.y + 0.01, tl.le - tl.chord + 0.08], 0.016, 8));
    // Root fillet along the fuselage side.
    const fil = mainProf.slice(0, 19).map(([xc, yc]) => { const y = W.rootY + yc * W.chord + 0.01, z = W.le - xc * W.chord; return [side * (halfX(z, y) - 0.006), y, z]; });
    add('wing', tube(fil, 0.034, 30, 10));
    // Strut and jury strut.
    const sb = [side * STRUT.body[0], STRUT.body[1], STRUT.body[2]];
    const sw = [side * STRUT.wing[0], leY(STRUT.wing[0]) + 0.1, STRUT.wing[2]];
    add('strut', bar(sb, sw, 0.085, 0.032));
    add('dark', rbox(0.06, 0.07, 0.1, 0.015, sb[0] - side * 0.01, sb[1], sb[2]), true);
    add('dark', rbox(0.08, 0.04, 0.12, 0.015, sw[0], sw[1] - 0.015, sw[2]), true);
    const jm = lerp3(sb, sw, 0.55);
    add('strut', bar(jm, [jm[0], leY(Math.abs(jm[0])) + 0.11, jm[2] - 0.02], 0.045, 0.018));
    // Walkway (left root), fuel filler, hinge brackets.
    if (side > 0) {
      const up = mainProf.slice(0, 19).filter(([xc]) => xc > 0.12 && xc < 0.62);
      const sheet = up.map(([xc, yc]) => [xc, yc + 0.004]).concat(up.slice().reverse().map(([xc, yc]) => [xc, yc + 0.0005]));
      add('dark', a188WingPanel([0.5, 0.78, 1.05].map(st), sheet, side));
    }
    const fx = 1.7, fy = leY(fx) + 0.13, fz = W.le - 0.35 * W.chord;
    add('dark', tx(new THREE.CylinderGeometry(0.055, 0.055, 0.025, 18), side * fx, fy, fz, 0, 0, side * Math.atan(W.dih)));
    for (const hx of [0.9, 2.0, 3.1, 4.1, 5.1, 5.9]) {
      const h = hinge(side, hx);
      add('dark', tx(new THREE.BoxGeometry(0.03, 0.08, 0.13), h.x, h.y - 0.09, h.z + 0.03, 0, 0, side * Math.atan(W.dih)), true);
    }
  }
  add('steel', rod([4.3, leY(4.3) - 0.1, 0.25], [4.3, leY(4.3) - 0.1, 0.75], 0.01, 8), true); // pitot (left)

  // ---------------- tail ----------------
  const vfin = (prof, sts) => {
    const g = wingPanel(sts.map(([h, le, c]) => ({ x: h, y: 0, le, chord: c })), prof, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getY(i), p.getX(i), p.getZ(i));
    return flipWinding(g);
  };
  const HINGE_Z = -5.49;
  // Fin (PR-LEO): the leading edge swept ≈ 31° from the dorsal, the top
  // rounded over to the rudder; the fixed part's chord down to the hinge.
  const FIN_TOP = FIN_TOP_Y;
  const finSt = [[-0.12, -4.36, 1.13], [0.107, -4.48, 1.01], [0.373, -4.64, 0.85], [0.64, -4.79, 0.7], [0.875, -4.93, 0.56], [1.003, -5.02, 0.47], [1.067, -5.1, 0.39], [1.104, -5.19, 0.3], [FIN_TOP, -5.29, 0.2]];
  add('livery', liveryUV(tagged(vfin(airfoil(0, 1, 0.12, 0, 0.4, 12), finSt))));
  // Dorsal fillet: a low strake from the spine into the fin's leading edge.
  add('livery', liveryUV(tagged(loft(sampleStations([
    K(-3.7, 0.012, 0.06, 0.05, 0.075, 2.2, 2.2), K(-4.0, 0.03, 0.0, -0.01, 0.06, 2.2, 2.2),
    K(-4.25, 0.045, -0.04, -0.05, 0.08, 2.2, 2.2), K(-4.45, 0.05, -0.07, -0.08, 0.2, 2.2, 2.2),
  ], 20), 12, null))));
  // Rudder: from below the cone to the rounded top.
  const rudSt = [[-0.72, HINGE_Z, 0.3], [-0.55, HINGE_Z, 0.34], [-0.2, HINGE_Z, 0.37], [0.32, HINGE_Z, 0.38], [0.8, HINGE_Z, 0.37], [1.013, HINGE_Z, 0.33], [1.088, HINGE_Z, 0.26], [FIN_TOP, HINGE_Z, 0.16]];
  const rudGeo = liveryUV(tagged(vfin(airfoil(0, 1, 0.13, 0, 0.3, 8), rudSt)));
  const rudTab = tagged(tx(new THREE.BoxGeometry(0.012, 0.22, 0.07), 0, -0.3, HINGE_Z - 0.36));
  rudGeo.translate(0, 0, -HINGE_Z); rudTab.translate(0, 0, -HINGE_Z);
  const rudder = new THREE.Group();
  rudder.position.set(0, 0, HINGE_Z);
  const rudMesh = new THREE.Mesh(rudGeo, M.livery);
  rudMesh.castShadow = true;
  rudder.add(rudMesh, new THREE.Mesh(rudTab, M.paint));
  rudder.add(new THREE.Mesh(tagged(ball([0, -0.62, -0.3], 0.02, 8)), M.white)); // tail light
  root.add(rudder);
  add('beacon', tx(new THREE.SphereGeometry(0.03, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, FIN_TOP + 0.005, -5.24));
  // Tailplane: low on the cone, slightly tapered, the elevators with a trim
  // tab; tips in the scheme's colour.
  const STY = -0.6, SLE = -4.62, SC = 1.05, ELEV = 0.58, STIP = 1.95;
  const sst = (x) => ({ x, y: STY + x * 0.01, le: SLE - x * 0.04, chord: SC - x * 0.1 });
  const elevParts = [];
  for (const side of [1, -1]) {
    add('paint', wingPanel([0.05, 1.0, 1.82].map(sst), airfoil(0, ELEV - 0.02, 0.11, 0, 0.4, 12), side));
    add('tip', wingPanel([1.82, 1.9, STIP].map((x, i) => ({ ...sst(x), chord: sst(x).chord * (1 - [0, 0.03, 0.12][i]), le: sst(x).le - [0, 0.01, 0.05][i] })), airfoil(0, 1, 0.11, 0, 0.4, 14), side));
    elevParts.push(tagged(wingPanel([0.1, 1.0, 1.8].map(sst), airfoil(ELEV, 1, 0.11, 0, 0.4, 4), side)));
  }
  elevParts.push(tagged(tx(new THREE.BoxGeometry(0.45, 0.012, 0.09), 0.8, STY + 0.014, sst(0.8).le - sst(0.8).chord - 0.03)));
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
  const gearCfg = Object.fromEntries(A.gear.map((g) => [g.name, { ...g, p: toPhoto(g.p) }]));
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
    // Spring-steel leg: a flat tapered bar from the lower fuselage side out,
    // down and a little forward to the axle on the inboard side of the
    // wheel; the axle, the brake line along its back.
    const top = [sx * (halfX(0.42, -0.62) - 0.04), -0.66, 0.42];
    const attachY = top[1];
    const leg = new THREE.Group();
    leg.position.y = attachY;
    const Lp = (p) => [p[0], p[1] - attachY, p[2]];
    const axIn = [ax - sx * 0.13, ay + 0.02, az];
    const legParts = [bar(Lp(top), Lp(lerp3(top, axIn, 0.5)), 0.11, 0.032), bar(Lp(lerp3(top, axIn, 0.48)), Lp(axIn), 0.085, 0.026),
      tx(new RoundedBoxGeometry(0.08, 0.1, 0.12, 2, 0.02), ...Lp(axIn)), rod(Lp(axIn), Lp([ax - sx * 0.02, ay, az]), 0.03, 12)];
    const legMesh = new THREE.Mesh(mergeGeometries(legParts.map((p) => tagged(p))), M.gear);
    legMesh.castShadow = true; legMesh.receiveShadow = true;
    const brakeLine = new THREE.Mesh(tagged(tube([Lp([top[0], top[1] - 0.02, top[2] - 0.04]), Lp(lerp3(top, axIn, 0.55).map((v, i) => v + [0, 0, -0.035][i])), Lp([axIn[0], axIn[1] + 0.06, axIn[2] - 0.04])], 0.007, 14, 5)), M.rubber);
    leg.add(legMesh, brakeLine);
    g.add(leg);
    add('dark', rbox(0.12, 0.06, 0.16, 0.02, top[0] - sx * 0.02, top[1] + 0.02, top[2]));
    const wheel = new THREE.Group();
    wheel.position.set(ax, ay, az);
    const spinPart = makeWheel(R, Wd, 0.13, sx, true);
    const brake = new THREE.Mesh(tagged(tx(new THREE.CylinderGeometry(0.11, 0.11, 0.012, 24), -sx * 0.08, 0, 0, 0, 0, Math.PI / 2)), M.steel);
    const caliper = new THREE.Mesh(tagged(new RoundedBoxGeometry(0.05, 0.08, 0.1, 2, 0.012).translate(-sx * 0.085, 0.085, -0.05)), M.dark);
    wheel.add(spinPart, brake, caliper);
    g.add(wheel);
    root.add(g);
    gearGroups[name] = { group: g, wheel, spin: spinPart, leg, legH: attachY - ay, rest: wheel.position.clone(), sx };
  }
  {
    const cfg = gearCfg.tail;
    const g = new THREE.Group();
    const R = cfg.radius;
    const fz = cfg.p[2] + 0.1, fy = cfg.p[1] + R + 0.13;
    // Long leaf spring from under the cone down and back to the steerable
    // fork (the AgTruck stands almost level on it).
    add('ink', bar([0, -0.83, -5.28], [0, fy + 0.03, fz + 0.02], 0.055, 0.02));
    add('dark', rbox(0.09, 0.04, 0.16, 0.015, 0, -0.83, -5.28));
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
    wheel.add(makeWheel(R, 0.09, 0.065, 1, false));
    fork.add(wheel);
    g.add(fork);
    root.add(g);
    gearGroups.tail = { group: g, wheel, spin: wheel.children[0], fork, rest: wheel.position.clone(), sx: 0 };
  }

  // ---------------- spray system ----------------
  // Booms under the trailing edge on four hangers a side (down from the
  // fixed wing ahead of the flap hinge, below the flaps' path), crossed under
  // the belly; the wind-driven pump under the hopper.
  const nozzles = [];
  const BZ = -1.15, BDROP = 0.32, BX = 5.2;
  const boomAt = (side, x) => [side * x, leY(x) - BDROP, BZ];
  for (const side of [1, -1]) {
    add('alu', rod(boomAt(side, 0.55), boomAt(side, BX), 0.025, 12));
    add('alu', ball(boomAt(side, BX), 0.03, 10));
    for (const hx of [1.3, 2.5, 3.7, 4.9]) {
      const topP = [side * hx, leY(hx) - 0.05, -0.6], bot = boomAt(side, hx);
      const len = Math.hypot(topP[1] - bot[1], topP[2] - bot[2]);
      add('alu', tx(new RoundedBoxGeometry(0.018, len, 0.06, 2, 0.007), side * hx, (topP[1] + bot[1]) / 2, (topP[2] + bot[2]) / 2, Math.atan2(topP[2] - bot[2], topP[1] - bot[1])));
      add('dark', tx(new THREE.CylinderGeometry(0.034, 0.034, 0.03, 10), ...bot, 0, 0, Math.PI / 2), true);
    }
    const NZ = 18;
    for (let k = 0; k < NZ; k++) {
      const x = 0.7 + ((BX - 0.05 - 0.7) * k) / (NZ - 1);
      const [bx, by, bz] = boomAt(side, x);
      add('alu', rod([bx, by, bz], [bx, by - 0.06, bz - 0.015], 0.007, 6), true);
      add('yellow', tx(new THREE.CylinderGeometry(0.017, 0.014, 0.045, 10), bx, by - 0.085, bz - 0.022, 0.3), true);
      add('brass', tx(new THREE.ConeGeometry(0.009, 0.022, 8), bx, by - 0.115, bz - 0.032, Math.PI + 0.3), true);
      nozzles.push(new THREE.Vector3(bx, by - 0.12, bz - 0.032));
    }
  }
  add('alu', rod(boomAt(1, 0.55), boomAt(-1, 0.55), 0.034, 12));
  add('alu', tube([[0, -0.84, 0.72], [0, -0.86, 0.1], [0, -0.86, -0.6], [0, boomAt(1, 0)[1], BZ]], 0.034, 24, 10));
  const pump = new THREE.Group();
  pump.position.set(0, -0.8, 0.95);
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

  // ---------------- propeller (McCauley, three blades, constant speed) ----------------
  const R = A.propRadius;
  const PZ = 1.76;
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
  // Built inside this cabin (a188Cockpit.js): the doghouse with the engine
  // gauges, the padded roll, the grey panel, the controls, the seat and the
  // inner skins.
  const OFF = new THREE.Vector3(0, -0.26, -1.36); // pilot frame (the shared pilot figure's seat)
  const o3 = (x, y, z) => [x + OFF.x, y + OFF.y, z + OFF.z];
  const ck = buildA188Cockpit({
    panel, envMap: opts.envMap ?? null, harnessMat: M.harness,
    cab: { halfX, SILL, RAIL, ROOF, WS_Z, WS_ZS, SG, BPOST, roofAt, wsBase, sideAt, sillX, CABIN, aftRing, OFF, topY },
  });
  const { cockpit, stick, pedals, throttle, valve, leds, THR } = ck;
  const REF = {
    eye: ck.eye.clone(), seat: new THREE.Vector3(...o3(0, 0.05, -0.55)), panel: ck.panelMesh.position.clone(),
    stick: stick.position.clone(), throttle: throttle.position.clone(), pedals: pedals[0].position.clone().setX(0),
    roof: new THREE.Vector3(0, ROOF.yt - 0.03, -1.8), door: new THREE.Vector3(SILL.x, 0.4, -1.6), floorY: ck.floorY,
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
  lod.addLevel(new THREE.Group(), 90);
  root.add(lod);
  const glassMesh = new THREE.Group();
  const gm = new THREE.Mesh(mergeGeometries(glassG.map((g) => tagged(g))), M.glass);
  gm.renderOrder = 10;
  glassMesh.add(gm);
  root.add(glassMesh);
  root.traverse((o) => { if (o.isMesh && o.castShadow === undefined) o.castShadow = true; });
  // Pitch the whole model into the body frame (see A188_STANCE).
  const stance = new THREE.Group();
  stance.rotation.x = A188_STANCE;
  for (const c of [...root.children]) stance.add(c);
  root.add(stance);
  const V = (v) => new THREE.Vector3(...a188ToBody([v.x, v.y, v.z]));
  for (const k of Object.keys(REF)) if (REF[k]?.isVector3) REF[k] = V(REF[k]);

  let bladeAngle = 0.18, t = 0;
  const update = (dt, fm, ac) => {
    t += dt;
    const o = fm.out;
    const pf = fm.shaftPower / A.maxPower;
    const target = fm.engine === 'running' ? 0.16 + 0.34 * smoothstep(15, 55, o.airspeed) + 0.08 * pf : 0.16;
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
    setReg(r) { REG = r; swap(M.livery, liveryTextures(REG, A188_LIVERIES[livery])); },
    // Paint scheme: the fuselage and wing canvases and the colours of the
    // tailplane, frames, struts, tips and gear (same geometry and UVs).
    setLivery(i) {
      const k = ((i % A188_LIVERIES.length) + A188_LIVERIES.length) % A188_LIVERIES.length;
      if (k === livery) return;
      livery = k;
      const L = A188_LIVERIES[k];
      swap(M.livery, liveryTextures(REG, L));
      swap(M.wing, wingTextures(L));
      for (const [m, c] of [[M.paint, L.tail], [M.frame, L.top], [M.tip, L.tip], [M.strut, L.strut], [M.gear, L.gear], [M.lid, L.top]]) m.color.set(c).multiplyScalar(ALB);
    },
    get livery() { return livery; },
    root, M, refs: REF,
    prop, blades, bladeMats: [bladeMat, tipMat], disc,
    ailerons, flaps, elevator, rudder,
    gear: gearGroups,
    stick, pedals, throttle, valve, leds, panelMesh: ck.panelMesh, inst: { pick: ck.pick, pickables: ck.pickables },
    pumpFan, pilot, cockpit, glassMesh,
    eye: REF.eye.clone(),
    nozzles: nozzles.map(V),
    fuelFiller: V(new THREE.Vector3(1.7, leY(1.7) + 0.14, W.le - 0.35 * W.chord)),
    hopperPort: V(new THREE.Vector3(halfX(-0.55, -0.3) + 0.03, -0.3, -0.55)),
    update,
  };
}
