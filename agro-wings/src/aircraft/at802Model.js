// Procedural Air Tractor AT-802 family: one airframe, two configurations.
//   variant 'ag'       — AT-802A agricultural: fixed spring-steel gear,
//                        tailwheel, spray booms, wind-driven pump (PR-AWX).
//   variant 'fireboss' — AT-802AF Fire Boss: the same airframe on Wipline
//                        10000 amphibious floats with retractable wheels,
//                        scoop probes, drop door, stabiliser fins (PR-FBS).
// VISUAL ONLY: the physics (FLIGHT_AT802 / FLIGHT_FIREBOSS), gear contact
// points and float stations live in src/config.js and are read here to place
// the wheels and to shape the floats.
// Body frame: +Z nose, +Y up, +X left wing; origin = CG (≈ 27 % MAC).
//
// Geometry: own cross-sections fitted to the VH-LII side photograph
// (aeropedia, 88 px/m, spinner tip to rudder 10.9 m), converted from its
// three-point attitude to the body frame with the 10° ground angle the gear
// gives (cowl top almost level on the ground, drooping toward the spinner in
// flight), checked against PR-CUN, NT-802, the yellow 802s from the front
// and three-quarters, LX-AFF / 4O-EAB / EC-KRT / EC-JTZ (Fire Boss). The
// type's identity: a long, slab-sided PT6A-65 nose with exhaust stacks just
// behind the prop and the chin inlet; a deep 800 US gal hopper section; a
// tall glasshouse set on the fuselage top with a three-piece windshield and
// a fairing that drops steeply onto a straight turtle deck; a tall, nearly
// straight-topped fin with a long rudder; a strut-braced tailplane; an
// 18.04 m constant-chord wing with squared tips; a five-blade Hartzell.
// Not available (estimated, proportional to the photographs): cabin width,
// cowl width, float lines (no Wipline drawings), wheel sizes.
// Paint and lettering are a side-projected livery with a matching bump map;
// AO is baked into vertex colours; fine detail sits in a LOD level. Both
// configurations come out of this one builder (shared airframe code, no
// duplicated model): only the gear, the ag kit or the float kit, the paint
// and the prop finish differ.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { rng, clamp, smoothstep, lerp } from '../core/math.js';
import { FLIGHT_AT802, FLIGHT_FIREBOSS, FLOATS_W10000 } from '../config.js';
import {
  loft, K, sampleStations, airfoil, wingPanel, flipWinding, tagged, shade, tx, rod, tube, bar, ball, rbox, lathe, grid,
  speckle, orangePeel, treadTexture, propDiscTexture, ribTexture, WING_SPAN_UV, buildPilot,
} from './model.js';
import { buildAT802Cockpit } from './at802Cockpit.js';

const DIH = Math.tan((4 * Math.PI) / 180);
export const AT802_WING = { rootX: 0.64, tipX: 8.86, half: 9.02, rootY: -0.47, le: 0.6, chord: 2.07 };
const W = AT802_WING;
export const at802WingY = (x) => W.rootY + Math.max(0, Math.abs(x) - W.rootX) * DIH;
const SPAN_UV = 9.1;
const YELLOW = '#f3c218';
const NAVY = '#15285a';
const GREEN = '#1d7a3c';
const RED = '#c61f1b';
const BLACK = '#131417';
const WHITE = '#f3f3ee';
const INK = '#141a24';

// Paint A follows the yellow agricultural 802 with the green band between
// two navy lines (green rudder, green tip bands); paint B the Fire Boss of
// LX-AFF / 4O-EAB: yellow with a red cheat line edged in black, red rudder,
// red tip bands, the floats yellow with the red stripe and FIRE BOSS.
export const AT802_LIVERIES = {
  ag: { id: 'ag', base: YELLOW, band: GREEN, line: NAVY, tail: GREEN, tailLine: NAVY, tip: GREEN, tipLine: NAVY, text: NAVY, model: 'AT-802A', blades: 0x17181a, bladeTip: 0xf4f0e6 },
  fireboss: { id: 'fireboss', base: YELLOW, band: RED, line: BLACK, tail: RED, tailLine: BLACK, tip: RED, tipLine: BLACK, text: BLACK, model: 'AT-802', blades: 0x8f959b, bladeTip: 0x8f959b },
};

// Cockpit reference: the shared pilot (PR-AGW frame) moved by this offset;
// eye point ≈ 0.28 m under the roof, 1 m aft of the windshield base.
const OFF = new THREE.Vector3(0, 0.58, -1.42);
const o3 = (x, y, z) => [x + OFF.x, y + OFF.y, z + OFF.z];
export const AT802_EYE = [0, 1.48, -1.8]; // seated, leaning a little forward: 0.38 m under the roof, 0.66 m from the panel

// Ground shadow planforms for createContactShadow().
export const AT802_SHADOW = { W: 19.6, L: 12.4, wing: [9.0, -1.47, 0.6], fus: [0.62, -1.0, 6.4], tail: [3.0, -7.0, -5.6], core: [6.4, 3.8] };
export const FIREBOSS_SHADOW = { W: 19.6, L: 12.4, wing: [9.0, -1.47, 0.6], fus: [2.3, -5.1, 9.0], tail: [3.0, -7.0, -5.6], core: [7.0, 4.6] };

// ==========================================================================
// Fuselage cross-sections, nose to tail (see atModel for the section
// shape): S(z, yb, ys, yw, yt, hw, ww, tL, pL, pU, lean). Crown (yt) and
// keel (yb) lines from the VH-LII profile in the body frame:
//   top  z 3.92 0.07 · 3.5 0.33 · 2.86 0.49 · 1.95 0.70 · 1.05 0.89 ·
//        -0.29 1.14 · -0.92 1.25 (windshield base) · roof 1.86 ·
//        -2.36 1.85 (cabin rear) · -2.88 1.49 · -3.52 1.04 · -5.43 0.97 ·
//        -6.71 0.70
//   keel z 3.30 -0.12 · 2.43 -0.49 · 1.15 -0.57 · 0.51 -0.90 · -0.08 -1.0 ·
//        -0.97 -0.94 · -1.94 -0.72 · -2.57 -0.41 · -3.85 -0.06 ·
//        -5.07 0.20 · -6.72 0.52
const S = (z, yb, ys, yw, yt, hw, ww, tL, pL, pU, lean) => ({ z, yb, ys, yw, yt, hw, ww, tL, pL, pU, lean });
const SILL = 1.12; // the side glass reaches down to here (VH-LII: ≈ 0.6 m of glass under a 0.14 m roof)
const CAN = { ww: 0.5, lean: 0.2, pU: 4, yt: 1.86, zR: -2.36, glassTop: 1.72 };
const FWD_KEYS = [
  S(3.38, -0.24, 0.07, 0.2, 0.37, 0.31, 0.3, 0.8, 2.2, 2.4, 0.12),
  S(3.26, -0.36, 0.05, 0.22, 0.4, 0.35, 0.33, 0.8, 2.4, 2.5, 0.18),
  S(3.0, -0.46, 0.03, 0.28, 0.45, 0.385, 0.35, 0.78, 2.8, 2.7, 0.28),
  S(2.5, -0.49, 0.02, 0.36, 0.56, 0.415, 0.37, 0.76, 3.2, 2.9, 0.34),
  S(1.95, -0.47, 0.02, 0.46, 0.7, 0.455, 0.4, 0.76, 3.6, 3.0, 0.4),
  S(1.5, -0.51, 0.02, 0.57, 0.795, 0.5, 0.43, 0.76, 4.0, 3.0, 0.44),
  S(1.05, -0.6, 0.0, 0.68, 0.89, 0.56, 0.47, 0.76, 4.4, 3.0, 0.46),
  S(0.5, -0.86, -0.04, 0.82, 0.99, 0.61, 0.5, 0.74, 4.5, 3.2, 0.42),
  S(0.0, -0.99, -0.06, 0.93, 1.06, 0.62, 0.505, 0.72, 4.5, 3.6, 0.32),
  S(-0.45, -0.97, -0.06, 1.02, 1.1, 0.62, 0.505, 0.72, 4.5, 4.5, 0.25),
  S(-0.92, -0.94, -0.06, 1.1, 1.13, 0.62, CAN.ww, 0.72, 4.5, 6, 0.2),
];
// Cabin: the lower fuselage only, cut along the sill.
const CAB_KEYS = [[-0.92, -0.94, 0.62], [-1.6, -0.8, 0.62], [CAN.zR, -0.55, 0.6]].map(([z, yb, hw]) => S(z, yb, -0.04, SILL, SILL, hw, CAN.ww, 0.72, 4.5, 2, 0));
// Behind the cabin: the fairing rolls off the roof and drops steeply to the
// turtle deck ~1.2 m aft of the rear post; the deck runs nearly straight to
// the fin, the tail cone keeping its depth to the rudder post.
const AFT_KEYS = [
  S(CAN.zR, -0.55, -0.02, SILL, CAN.yt, 0.6, CAN.ww, 0.74, 4.5, CAN.pU, CAN.lean),
  S(-2.6, -0.45, 0.0, 1.1, 1.72, 0.59, 0.495, 0.74, 4.4, 3.9, 0.2),
  S(-2.9, -0.34, 0.03, 1.07, 1.48, 0.565, 0.475, 0.74, 4.1, 3.4, 0.21),
  S(-3.22, -0.24, 0.06, 1.04, 1.21, 0.53, 0.45, 0.74, 3.8, 3.1, 0.22),
  S(-3.55, -0.15, 0.09, 0.96, 1.06, 0.5, 0.42, 0.74, 3.6, 3.0, 0.22),
  S(-4.3, 0.0, 0.15, 0.92, 1.05, 0.41, 0.34, 0.73, 3.2, 2.9, 0.24),
  S(-5.0, 0.17, 0.27, 0.86, 1.0, 0.31, 0.25, 0.72, 2.8, 2.7, 0.25),
  S(-5.6, 0.31, 0.38, 0.8, 0.94, 0.22, 0.17, 0.71, 2.6, 2.6, 0.24),
  S(-6.2, 0.42, 0.48, 0.74, 0.84, 0.13, 0.1, 0.7, 2.5, 2.5, 0.18),
  S(-6.75, 0.52, 0.56, 0.66, 0.7, 0.025, 0.02, 0.7, 2.4, 2.4, 0.02),
];
function sampleSt(keys, per) {
  const out = [];
  const P = Object.keys(keys[0]);
  const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
    const n = Math.max(2, Math.round(Math.abs(k1.z - k2.z) * per));
    for (let j = 0; j < n; j++) {
      const t = j / n, st = {};
      for (const k of P) st[k] = cr(k0[k], k1[k], k2[k], k3[k], t);
      st.hw = Math.max(0.005, st.hw); st.ww = Math.max(0.004, Math.min(st.ww, st.hw));
      st.pL = Math.max(1.6, st.pL); st.pU = Math.max(1.6, st.pU);
      out.push(st);
    }
  }
  out.push({ ...keys[keys.length - 1] });
  return out;
}
const N_KEEL = 12, N_WALL = 4, N_TOP = 14;
function halfSection(st, top = true) {
  const out = [];
  for (let i = 0; i <= N_KEEL; i++) {
    const a = (Math.PI / 2) * (1 - i / N_KEEL), f = Math.sin(a) ** (2 / st.pL);
    out.push([st.hw * Math.max(0, Math.cos(a)) ** (2 / st.pL) * lerp(1, st.tL, f), st.ys - (st.ys - st.yb) * f]);
  }
  for (let i = 1; i <= N_WALL; i++) out.push([lerp(st.hw, st.ww, i / N_WALL), lerp(st.ys, st.yw, i / N_WALL)]);
  if (top) {
    for (let i = 1; i <= N_TOP; i++) {
      const a = (Math.PI / 2) * (i / N_TOP), u = Math.sin(a) ** (2 / st.pU), y = st.yw + (st.yt - st.yw) * u;
      out.push([Math.max(0, st.ww - st.lean * (y - st.yw)) * Math.max(0, Math.cos(a)) ** (2 / st.pU), y]);
    }
  }
  return out;
}
function sectionRing(st, open = false) {
  const h = halfSection(st, !open);
  const m = h.map(([x, y]) => [-x, y]);
  return open ? m.reverse().concat(h.slice(1)) : h.concat(m.reverse().slice(1));
}
function loftSt(sts, colorFn, open = false, ringFn = sectionRing) {
  const pos = [], col = [], idx = [];
  let rl = 0;
  for (const st of sts) {
    const pts = ringFn(st, open);
    rl = pts.length;
    for (const [x, y] of pts) {
      pos.push(x, y, st.z);
      const g = colorFn ? colorFn(x, y, st.z) : 1;
      col.push(g, g, g);
    }
  }
  for (let si = 0; si < sts.length - 1; si++) for (let k = 0; k < rl - 1; k++) {
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
const ALL_ST = [...sampleSt(FWD_KEYS, 20), ...sampleSt(AFT_KEYS, 14)].sort((a, b) => b.z - a.z);
function fusX(z, y) {
  const xAt = (st) => {
    const h = halfSection(st);
    if (y <= h[0][1]) return 0;
    for (let i = 1; i < h.length; i++) {
      if (y <= h[i][1]) { const [x0, y0] = h[i - 1], [x1, y1] = h[i]; return x0 + ((y - y0) / Math.max(1e-6, y1 - y0)) * (x1 - x0); }
    }
    return 0;
  };
  let i = ALL_ST.findIndex((st) => st.z <= z);
  if (i <= 0) return xAt(ALL_ST[Math.max(0, i)]);
  const a = ALL_ST[i - 1], b = ALL_ST[i], t = (a.z - z) / Math.max(1e-6, a.z - b.z);
  return lerp(xAt(a), xAt(b), t);
}
const canW = (y) => {
  const u = clamp((y - SILL) / (CAN.yt - SILL), 0, 1);
  return Math.max(0, CAN.ww - CAN.lean * (y - SILL)) * Math.max(0, 1 - u ** CAN.pU) ** (1 / CAN.pU);
};
// Three-piece windshield: flat centre pane raked back from the hopper deck,
// flat side panes angled back to the A-posts.
const canF = (y) => -0.92 - 0.85 * Math.pow(clamp((y - SILL) / (CAN.yt - SILL), 0, 1), 1.3);
const wsC = (y) => lerp(0.22, 0.15, clamp((y - SILL) / (CAN.glassTop - SILL), 0, 1.2));
const WS_K = 1.0;
const DOOR_Z = -1.62;

// Side-projected livery: top half left side, bottom half right side.
const LV = { Z0: -7.15, Z1: 4.0, Y0: -1.1, Y1: 2.95, W: 2048, H: 1024, M: 6 };
LV.kx = LV.W / (LV.Z1 - LV.Z0);
LV.ky = (LV.H / 2 - 2 * LV.M) / (LV.Y1 - LV.Y0);
const lvPix = (side, z, y) => [side > 0 ? (LV.Z1 - z) * LV.kx : (z - LV.Z0) * LV.kx, (side > 0 ? 0 : LV.H / 2) + LV.M + (LV.Y1 - y) * LV.ky];
function liveryUV(geo) {
  geo = tagged(geo);
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
const aftTop = sampleSt(AFT_KEYS, 14).map((st) => [st.z, st.yt]);
// Fin: [height y, leading edge z, chord] — tall, LE swept only ≈ 7°, the top
// nearly straight; rudder hinge at 62 % chord.
const FIN_ST = [[0.9, -5.36, 1.66], [1.6, -5.47, 1.42], [2.3, -5.58, 1.18], [2.62, -5.64, 1.04], [2.73, -5.68, 0.95], [2.765, -5.72, 0.86]];
const HINGE = 0.62;

function liveryTextures(reg, L) {
  const c = canvas(LV.W, LV.H), b = canvas(LV.W, LV.H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  gb.fillStyle = '#808080';
  gb.fillRect(0, 0, LV.W, LV.H);
  orangePeel(gb, LV.W, LV.H, 61);
  for (const side of [1, -1]) {
    const P = (z, y) => lvPix(side, z, y);
    const oy = side > 0 ? 0 : LV.H / 2;
    const path = (ctx, pts) => { ctx.beginPath(); pts.forEach(([z, y], i) => { const [px, py] = P(z, y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); };
    const poly = (pts, fill) => { path(g, pts); g.closePath(); g.fillStyle = fill; g.fill(); };
    const line = (ctx, pts, col, w) => { path(ctx, pts); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
    g.fillStyle = L.base;
    g.fillRect(0, oy, LV.W, LV.H / 2);
    const [, belly] = P(0, -0.3);
    const grd = g.createLinearGradient(0, belly, 0, oy + LV.H / 2);
    grd.addColorStop(0, 'rgba(90,70,30,0)');
    grd.addColorStop(1, 'rgba(90,70,30,0.22)');
    g.fillStyle = grd;
    g.fillRect(0, belly, LV.W, oy + LV.H / 2 - belly);
    // Rudder and the fin's trailing area behind a diagonal from the fin root
    // to the top (the coloured tail of both schemes), edged with a line.
    const fr = FIN_ST[0], ft = FIN_ST[FIN_ST.length - 1];
    const d0 = [fr[1] - fr[2] * 0.42, 0.6], d1 = [ft[1] - ft[2] * 0.12, 3.0];
    poly([d0, d1, [-7.3, 3.0], [-7.3, 0.45]], L.tail);
    line(g, [d0, d1], L.tailLine, 0.03 * LV.ky);
    line(g, [[d0[0] + 0.07, d0[1]], [d1[0] + 0.07, d1[1]]], WHITE, 0.012 * LV.ky);
    // Cheat line: the band between two lines, nose to tail, rising aft.
    const cl = [[3.45, 0.1], [2.6, 0.15], [1.6, 0.24], [0.4, 0.33], [-1.0, 0.43], [-2.6, 0.52], [-4.2, 0.6], [-5.5, 0.64], [-6.6, 0.66]];
    const hh = [0.035, 0.06, 0.075, 0.08, 0.08, 0.075, 0.065, 0.05, 0.035];
    const band = (pts, hs, off = 0) => pts.map(([z, y], i) => [z, y + off + hs[i]]).concat(pts.map(([z, y], i) => [z, y + off - hs[i]]).reverse());
    poly(band(cl, hh), L.band);
    for (const s of [1, -1]) poly(band(cl.map(([z, y], i) => [z, y + s * (hh[i] + 0.022)]), hh.map(() => 0.016)), L.line);
    // Anti-glare: the cowl crown is painted dark (the matte panel is a mesh);
    // a thin line where it meets the yellow.
    line(g, [[3.3, 0.35], [2.5, 0.52], [1.5, 0.75], [0.9, 0.86]], 'rgba(20,20,20,0.35)', 2);
    // Cowl doors, camlocs, hopper and tail access panels, firewall.
    const seams = [
      [[3.3, -0.25], [3.3, 0.36]], [[2.15, -0.48], [2.15, 0.62]], [[3.3, 0.22], [2.15, 0.46]], [[3.3, -0.06], [2.15, -0.12]],
      [[1.05, -0.6], [1.05, 0.88]], [[-0.92, -0.92], [-0.92, 1.22]], [[-2.4, -0.55], [-2.4, 1.22]], [[-3.6, -0.15], [-3.6, 1.0]], [[-5.1, 0.18], [-5.1, 0.98]],
      [[1.6, -0.5], [1.6, 0.78]], [[-0.92, 0.0], [-3.6, 0.2]],
    ];
    for (const s of seams) {
      line(g, s, 'rgba(80,60,0,0.3)', 2);
      line(gb, s, '#3c3c3c', 2.6);
      const [[za, ya], [zb, yb]] = s;
      const n = Math.max(2, Math.round(Math.hypot(za - zb, ya - yb) / 0.06));
      for (let k = 0; k <= n; k++) {
        const [px, py] = P(za + ((zb - za) * k) / n + 0.02, ya + ((yb - ya) * k) / n);
        g.fillStyle = 'rgba(90,70,0,0.25)'; g.fillRect(px - 1, py - 1, 2, 2);
        gb.fillStyle = '#5c5c5c'; gb.beginPath(); gb.arc(px, py, 1.4, 0, Math.PI * 2); gb.fill();
      }
    }
    for (let k = 0; k < 9; k++) {
      const z = 3.15 - k * 0.12;
      for (const y of [0.3 + (3.15 - z) * 0.17, -0.1]) {
        const [px, py] = P(z, y);
        g.fillStyle = 'rgba(40,40,40,0.55)'; g.beginPath(); g.arc(px, py, 2.6, 0, Math.PI * 2); g.fill();
        gb.fillStyle = '#a8a8a8'; gb.beginPath(); gb.arc(px, py, 2.6, 0, Math.PI * 2); gb.fill();
      }
    }
    for (let k = 0; k < 10; k++) {
      const pts = [[2.0 - k * 0.05, -0.28], [2.0 - k * 0.05, -0.08]];
      line(g, pts, 'rgba(20,15,10,0.6)', 3); line(gb, pts, '#202020', 4);
    }
    const door = (z0, z1, y0, y1) => { const pts = [[z0, y0], [z1, y0], [z1, y1], [z0, y1], [z0, y0]]; line(g, pts, 'rgba(80,60,0,0.36)', 2); line(gb, pts, '#383838', 2.8); };
    door(-2.8, -3.3, -0.1, 0.25);
    door(-4.4, -4.85, 0.45, 0.72);
    door(0.95, 0.15, -0.5, -0.2);
    {
      const [ax, ay] = P(2.7, 0.12), [bx] = P(0.2, 0.12);
      const sg = g.createLinearGradient(ax, 0, bx, 0);
      sg.addColorStop(0, 'rgba(30,24,16,0.5)'); sg.addColorStop(0.5, 'rgba(30,24,16,0.16)'); sg.addColorStop(1, 'rgba(30,24,16,0)');
      g.fillStyle = sg;
      g.beginPath(); g.ellipse((ax + bx) / 2, ay + 6, Math.abs(bx - ax) / 2, 0.13 * LV.ky, 0, 0, Math.PI * 2); g.fill();
    }
    const text = (z, y, str, hM, col, font = 'bold', stroke = null) => {
      const [px, py] = P(z, y);
      g.save();
      g.font = `${font} ${Math.round(hM * LV.ky * 1.25)}px Arial`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.setTransform(1, 0, 0, 1, px, py);
      g.scale(LV.kx / LV.ky, 1);
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 6; g.strokeText(str, 0, 0); }
      g.fillStyle = col;
      g.fillText(str, 0, 0);
      g.restore();
    };
    text(-3.85, 0.3, reg, 0.25, L.text);
    text(-6.05, 2.25, L.model, 0.12, L.base === YELLOW ? WHITE : INK, 'italic bold');
    if (L.id === 'ag') { text(0.9, 0.62, 'AGRO WINGS', 0.13, NAVY, 'italic bold'); text(-1.6, 0.86, 'AVIAÇÃO AGRÍCOLA', 0.045, INK, 'bold'); }
    else { text(0.9, 0.62, 'COMBATE A INCÊNDIO', 0.085, RED, 'italic bold', null); text(-1.6, 0.86, 'AGRO WINGS', 0.05, INK, 'bold'); }
    text(1.6, -0.36, 'NO STEP', 0.035, 'rgba(30,30,30,0.7)', 'bold');
    text(0.6, 0.05, 'JET A-1', 0.035, 'rgba(30,30,30,0.75)', 'bold');
    speckle(g, 0, oy, LV.W, LV.H / 2, 2600, side > 0 ? 27 : 28, 0.1);
  }
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}

// Wing skin: u = span / SPAN_UV, v = chord fraction (0 = LE).
function wingTextures(L) {
  const WD = 2048, H = 512;
  const c = canvas(WD, H), b = canvas(WD, H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  g.fillStyle = L.base; g.fillRect(0, 0, WD, H);
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, WD, H);
  orangePeel(gb, WD, H, 63);
  const X = (m) => (m / SPAN_UV) * WD, Y = (f) => f * H;
  const r = rng(37);
  g.fillStyle = L.tip; g.fillRect(X(8.15), 0, WD - X(8.15), H);
  g.fillStyle = L.tipLine; g.fillRect(X(8.07), 0, X(0.06), H);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(120,100,60,${0.03 + r() * 0.05})`; g.fillRect(r() * WD, Y(0.1 + r() * 0.8), 2 + r() * 3, 30 + r() * 120); }
  for (let i = 0; i < 1200; i++) { g.fillStyle = `rgba(60,45,30,${0.08 + r() * 0.15})`; g.fillRect(r() * WD, Y(r() * 0.06), 1 + r() * 2, 1 + r() * 2); }
  const seam = (x0, y0, x1, y1, rivet = 0.055) => {
    g.strokeStyle = 'rgba(80,60,0,0.28)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    gb.strokeStyle = '#3e3e3e'; gb.lineWidth = 2.6; gb.beginPath(); gb.moveTo(x0, y0); gb.lineTo(x1, y1); gb.stroke();
    const n = Math.max(2, Math.round(Math.hypot((x1 - x0) / (WD / SPAN_UV), ((y1 - y0) / H) * 2.07) / rivet));
    gb.fillStyle = '#5c5c5c';
    for (let k = 0; k <= n; k++) { gb.beginPath(); gb.arc(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n + 5, 1.4, 0, Math.PI * 2); gb.fill(); }
  };
  for (const f of [0.12, 0.28, 0.7]) seam(X(0.3), Y(f), X(9.0), Y(f));
  for (let x = 1.0; x < 8.9; x += 0.5) seam(X(x), Y(0.0), X(x), Y(0.74), 0.06);
  g.fillStyle = 'rgba(40,20,0,0.45)'; g.fillRect(0, Y(0.742), WD, 5);
  gb.fillStyle = '#202020'; gb.fillRect(0, Y(0.742), WD, 6);
  g.fillRect(X(5.22) - 2, Y(0.75), 4, H); gb.fillRect(X(5.22) - 3, Y(0.75), 6, H);
  for (const [a, bb] of [[1.5, 2.2], [2.6, 3.3], [3.7, 4.4], [4.8, 5.5]]) {
    g.strokeStyle = 'rgba(80,60,0,0.35)'; g.lineWidth = 2; g.strokeRect(X(a), Y(0.36), X(bb) - X(a), Y(0.24));
    gb.strokeStyle = '#383838'; gb.lineWidth = 2.6; gb.strokeRect(X(a), Y(0.36), X(bb) - X(a), Y(0.24));
  }
  speckle(g, 0, 0, WD, H, 2800, 43, 0.08);
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}

// Float skin (Fire Boss): yellow with the red stripe and FIRE BOSS on the
// outboard side near the bow; u along the float (bow = 0), v round it.
function floatTexture() {
  const WD = 1024, H = 256;
  const c = canvas(WD, H), g = c.getContext('2d');
  g.fillStyle = YELLOW; g.fillRect(0, 0, WD, H);
  const r = rng(71);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(80,60,30,${0.03 + r() * 0.05})`; g.fillRect(r() * WD, r() * H, 3 + r() * 30, 1 + r() * 3); }
  // Stripe on both sides (v ≈ 0.3 and 0.7: the hull sides).
  for (const v of [0.31, 0.69]) {
    g.fillStyle = RED; g.fillRect(WD * 0.18, H * v - 7, WD * 0.8, 14);
    g.fillStyle = BLACK; g.fillRect(WD * 0.18, H * v - 10, WD * 0.8, 2.5); g.fillRect(WD * 0.18, H * v + 8, WD * 0.8, 2.5);
  }
  g.save();
  g.font = 'italic bold 30px Arial'; g.fillStyle = RED; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.translate(WD * 0.3, H * 0.27); g.scale(-1, 1); g.fillText('FIRE BOSS', 0, 0); g.restore();
  g.save();
  g.font = 'italic bold 30px Arial'; g.fillStyle = RED; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.translate(WD * 0.3, H * 0.73); g.fillText('FIRE BOSS', 0, 0); g.restore();
  speckle(g, 0, 0, WD, H, 600, 73, 0.06);
  return canvasTexture(c, { aniso: 8 });
}

const wingPanel802 = (stations, prof, side, ao) => {
  const g = wingPanel(stations, prof, side, ao);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * WING_SPAN_UV) / SPAN_UV);
  return g;
};

// Hartzell five-blade prop blade: broad, gently tapered, squared-off tip.
function bladeLoft(r0, r1, steps, R) {
  const pos = [], idx = [];
  let n = 0;
  for (let i = 0; i <= steps; i++) {
    const r = r0 + ((r1 - r0) * i) / steps;
    const f = clamp((r - 0.24) / (R - 0.24), 0, 1);
    let c = 0.15 + 0.11 * Math.sin(Math.PI * Math.min(1, f * 0.95 + 0.05)) ** 0.5;
    if (f > 0.95) c *= 1 - ((f - 0.95) / 0.05) ** 2 * 0.35;
    const t = lerp(0.18, 0.055, f);
    const beta = Math.atan(1.9 / (2 * Math.PI * Math.max(r, 0.25)));
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

// Wipline 10000 hull: lofted from the config stations (V bottom with the
// deadrise, chined sides, rounded deck), one closed surface per float.
const FL = FLOATS_W10000;
function floatHullGeo() {
  const sts = FL.stations;
  // Dense stations along the float (linear between the config stations; the
  // step is a hard break kept as two stations 12 cm apart).
  const ring = (beam, ky, dy) => {
    const hb = beam / 2, v = Math.min(FL.vee, (dy - ky) * 0.4), chine = ky + v, out = [];
    const deck = (t) => [hb * Math.cos(t), dy - 0.06 + 0.06 * Math.sin(t)];
    out.push([0, ky]);
    for (let i = 1; i <= 4; i++) out.push([hb * 0.98 * (i / 4), ky + v * (i / 4) ** 1.1]);
    out.push([hb, chine + 0.04]);
    for (let i = 1; i <= 4; i++) out.push([hb * (1 + 0.02 * Math.sin((i / 4) * Math.PI)), lerp(chine + 0.04, dy - 0.08, i / 4)]);
    for (let i = 0; i <= 6; i++) out.push(deck((i / 6) * (Math.PI / 2)));
    const left = out.slice(1).reverse().map(([x, y]) => [-x, y]);
    return out.reverse().map(([x, y]) => [x, y]).concat(left.reverse().slice(1)).reverse();
  };
  const dense = [];
  for (let i = 0; i < sts.length - 1; i++) {
    const [z0, k0, b0, d0] = sts[i], [z1, k1, b1, d1] = sts[i + 1];
    const n = Math.max(1, Math.round((z0 - z1) / 0.25));
    for (let j = 0; j < n; j++) { const t = j / n; dense.push([lerp(z0, z1, t), lerp(k0, k1, t), lerp(b0, b1, t), lerp(d0, d1, t)]); }
  }
  dense.push(sts[sts.length - 1]);
  const rings = dense.map(([z, ky, beam, dy]) => ({ z, pts: ring(beam, ky, dy) }));
  const n = rings[0].pts.length;
  const pos = [], idx = [], uv = [], col = [];
  const zb = sts[0][0], zs = sts[sts.length - 1][0];
  for (const r of rings) r.pts.forEach(([x, y], k) => {
    pos.push(x, y, r.z);
    uv.push((zb - r.z) / (zb - zs), k / (n - 1));
    const a = 0.72 + 0.28 * clamp((y - r.pts[0][1] + 0.1) / 0.8, 0, 1);
    col.push(a, a, a);
  });
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < n - 1; k++) {
    const a = i * n + k, b = a + 1, c = a + n, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  // Caps: bow tip and stern transom.
  const cap = (ri, flip) => {
    const c0 = pos.length / 3, r = rings[ri];
    const cy = r.pts.reduce((s, p) => s + p[1], 0) / n;
    pos.push(0, cy, r.z); uv.push(ri ? 1 : 0, 0.5); col.push(0.8, 0.8, 0.8);
    for (let k = 0; k < n - 1; k++) { const a = ri * n + k, b = a + 1; if (flip) idx.push(c0, b, a); else idx.push(c0, a, b); }
  };
  cap(0, true); cap(rings.length - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const floatKeelY = (z) => {
  const s = FL.stations;
  if (z >= s[0][0]) return s[0][1];
  for (let i = 1; i < s.length; i++) if (z >= s[i][0]) { const t = (s[i - 1][0] - z) / (s[i - 1][0] - s[i][0]); return lerp(s[i - 1][1], s[i][1], t); }
  return s[s.length - 1][1];
};

// Overall extents for tests (span, length, tallest points in the body frame).
export function at802Extent() {
  return {
    span: 2 * W.half,
    length: FWD_KEYS[0].z + 0.56 - Math.min(-6.75, FIN_ST[0][1] - FIN_ST[0][2]),
    tops: [[0, FIN_ST[FIN_ST.length - 1][0] + 0.03, FIN_ST[FIN_ST.length - 1][1] - 0.4], [0, CAN.yt, -2.1], [W.half, at802WingY(W.half) + 0.12, W.le - 0.6]],
  };
}

// ==========================================================================
export function createAT802Model(panel, opts = {}) {
  const variant = opts.variant === 'fireboss' ? 'fireboss' : 'ag';
  const FB = variant === 'fireboss';
  const A = FB ? FLIGHT_FIREBOSS : FLIGHT_AT802;
  const L = AT802_LIVERIES[variant];
  const root = new THREE.Group();
  root.name = FB ? 'at802-fireboss' : 'at802a';
  const liv = liveryTextures(opts.reg ?? (FB ? 'PR-FBS' : 'PR-AWX'), L);
  const wtx = wingTextures(L);
  const coat = { roughness: 0.46, metalness: 0.0, specularIntensity: 0.3, clearcoat: 0.16, clearcoatRoughness: 0.3, envMap: opts.envMap ?? null, envMapIntensity: 0.3 };
  const ALBEDO = 0.84;
  const M = {
    paint: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(L.base).multiplyScalar(ALBEDO), vertexColors: true, ...coat }),
    accent: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(L.tip).multiplyScalar(ALBEDO), vertexColors: true, ...coat }),
    livery: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALBEDO), map: liv.map, bumpMap: liv.bump, bumpScale: 1.4, vertexColors: true, ...coat }),
    wing: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALBEDO), map: wtx.map, bumpMap: wtx.bump, bumpScale: 1.4, vertexColors: true, ...coat }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.62, metalness: 0.1, vertexColors: true }),
    deck: new THREE.MeshStandardMaterial({ color: new THREE.Color('#1b1e23'), roughness: 0.93, metalness: 0.0, envMapIntensity: 0.35, vertexColors: true }),
    lid: new THREE.MeshStandardMaterial({ color: new THREE.Color('#3b362f'), roughness: 0.8, metalness: 0.0, vertexColors: true }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.28, metalness: 0.92, vertexColors: true }),
    polished: new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.18, metalness: 1.0, envMap: opts.envMap ?? null, envMapIntensity: 0.65 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x5c6166, roughness: 0.42, metalness: 0.85, vertexColors: true }),
    exhaust: new THREE.MeshStandardMaterial({ color: 0x4a423b, roughness: 0.5, metalness: 0.85, vertexColors: true }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.94, metalness: 0, vertexColors: true }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92, metalness: 0, bumpMap: treadTexture(), bumpScale: 2.5 }),
    gloss: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.28, metalness: 0.1, vertexColors: true }),
    hub: new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.32, metalness: 0.35 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb8913c, roughness: 0.35, metalness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xa8bcc6, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.17, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5, depthWrite: false, side: THREE.DoubleSide }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false }),
    interior: new THREE.MeshStandardMaterial({ color: 0x4c5258, roughness: 0.7, metalness: 0.12, vertexColors: true }),
    frameIn: new THREE.MeshStandardMaterial({ color: 0x1f2124, roughness: 0.6, metalness: 0.1, vertexColors: true }), // frames painted black inside (photographs)
    floor: new THREE.MeshStandardMaterial({ color: 0xffffff, map: ribTexture('#3c4248', 'rgba(0,0,0,0.5)', 24, 64, 256), roughness: 0.8, metalness: 0.4, vertexColors: true }),
    seat: new THREE.MeshStandardMaterial({ color: 0xffffff, map: ribTexture('#26292e', 'rgba(0,0,0,0.5)'), roughness: 0.88, vertexColors: true }),
    harness: new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.8 }),
    pad: new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.8, metalness: 0.0, vertexColors: true }),
    red: new THREE.MeshStandardMaterial({ color: 0xc8261b, roughness: 0.45, emissive: 0x330000 }),
    green: new THREE.MeshStandardMaterial({ color: 0x1f9a3a, roughness: 0.45, emissive: 0x002200 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xf2b400, roughness: 0.45 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35, emissive: 0x222222 }),
    beacon: new THREE.MeshStandardMaterial({ color: 0xd8261b, roughness: 0.3, emissive: 0xff2010, emissiveIntensity: 0 }),
    strobe: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.2, emissive: 0xffffff, emissiveIntensity: 0 }),
    suit: new THREE.MeshStandardMaterial({ color: FB ? 0x2b3a55 : 0x55603f, roughness: 0.88 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.75 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xb88462, roughness: 0.7 }),
    helmet: new THREE.MeshPhysicalMaterial({ color: FB ? 0xd8261b : 0xeeeae2, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x15181c, roughness: 0.05, metalness: 0.3, clearcoat: 1 }),
    helmStripe: new THREE.MeshPhysicalMaterial({ color: 0x1b1b1b, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
  };
  if (FB) M.float = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALBEDO), map: floatTexture(), vertexColors: true, ...coat });

  const B = {};
  const add = (mat, g, fine = false) => { const k = (fine ? 'fine:' : '') + mat; (B[k] ||= []).push(tagged(g)); };

  // ---------------- fuselage ----------------
  const fusAO = (x, y, z) => {
    let a = 1 - Math.max(0, -y - 0.2) * 0.25;
    const yb = Math.max(0, 1 - Math.abs(y + 0.4) / 0.3), zb = Math.max(0, 1 - Math.abs(z + 0.45) / 1.15);
    a *= 1 - 0.34 * yb * Math.sqrt(zb);
    const sb = Math.max(0, 1 - Math.abs(y - 0.62) / 0.15) * (z < -5.4 && z > -6.9 ? 1 : 0);
    a *= 1 - 0.22 * sb;
    if (z < -0.92 && z > CAN.zR && y > SILL - 0.18) a *= 0.9;
    if (z > 3.2) a *= 0.86 + 0.14 * clamp((3.38 - z) / 0.18, 0, 1);
    return clamp(a, 0.5, 1);
  };
  const fwdSt = sampleSt(FWD_KEYS, 20);
  const cabSt = sampleSt(CAB_KEYS, 8);
  const aftSt = sampleSt(AFT_KEYS, 14);
  add('livery', liveryUV(loftSt(fwdSt, fusAO)));
  add('livery', liveryUV(loftSt(cabSt, fusAO, true)));
  add('livery', liveryUV(loftSt(aftSt, fusAO)));
  // Matte anti-glare panel along the crown of the cowling (dark, as on the
  // photographs), narrowing toward the spinner.
  {
    const crown = (st) => {
      const h = halfSection(st).slice(N_KEEL + N_WALL + 5).map(([x, y]) => [x * 1.012, y + 0.005]);
      return h.concat(h.slice(0, -1).reverse().map(([x, y]) => [-x, y]));
    };
    add('deck', loftSt(fwdSt.filter((st) => st.z <= 3.3 && st.z >= 0.9), null, false, crown));
  }
  for (const sx of [1, -1]) add('paint', tube([[sx * CAN.ww, SILL, -0.92], [sx * (CAN.ww + 0.004), SILL, -1.6], [sx * CAN.ww, SILL, CAN.zR]], 0.024, 16, 8));
  // Hopper lid on the crown ahead of the windshield, hinges and latch.
  {
    const lidRing = (st) => {
      const h = halfSection(st).slice(N_KEEL + N_WALL + 8);
      const nrm = ([x, y], k) => { const [x0, y0] = h[Math.max(0, k - 1)], [x1, y1] = h[Math.min(h.length - 1, k + 1)], l = Math.hypot(x1 - x0, y1 - y0) || 1; return [(y1 - y0) / l, -(x1 - x0) / l]; };
      const top = h.map((p, k) => { const [nx, ny] = nrm(p, k); return [p[0] + nx * 0.024, p[1] + ny * 0.024]; });
      const [ex, ey] = h[0], [nx, ny] = nrm(h[0], 0);
      const right = [[ex + nx * 0.004, ey + ny * 0.004], ...top];
      return right.concat(right.slice(0, -1).reverse().map(([x, y]) => [-x, y]));
    };
    add('lid', loftSt(fwdSt.filter((st) => st.z <= 0.85 && st.z >= -0.45), fusAO, false, lidRing));
    const yl = (z) => halfSection(fwdSt.reduce((a, b) => (Math.abs(b.z - z) < Math.abs(a.z - z) ? b : a)))[N_KEEL + N_WALL + N_TOP][1];
    for (const sx of [-0.2, 0.2]) {
      add('steel', tx(new THREE.CylinderGeometry(0.022, 0.022, 0.08, 10), sx, yl(-0.47) + 0.014, -0.47, 0, 0, Math.PI / 2));
      add('steel', rbox(0.05, 0.028, 0.065, 0.01, sx, yl(0.86) + 0.012, 0.86, -0.08), true);
    }
    add('steel', rod([-0.12, yl(0.84) + 0.04, 0.84], [0.12, yl(0.84) + 0.04, 0.84], 0.012, 8));
  }
  // Loading couplers aft of the wing, belly pipe, gatebox under the hopper
  // (ag) / drop door (Fire Boss).
  for (const sx of [1, -1]) {
    const cx = fusX(-2.0, -0.25);
    add('dark', tx(new THREE.CylinderGeometry(0.08, 0.08, 0.11, 18), sx * (cx + 0.02), -0.25, -2.0, 0, 0, Math.PI / 2));
    add('brass', tx(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 18), sx * (cx + 0.085), -0.25, -2.0, 0, 0, Math.PI / 2));
  }
  add('alu', tube([[-2.0, -0.28], [-1.3, -0.5], [-0.4, -0.7], [0.3, -0.75]].map(([z, y]) => [fusX(z, y) + 0.035, y, z]), 0.045, 18, 8));
  const gy = -1.0;
  if (!FB) {
    add('alu', rbox(0.72, 0.04, 1.0, 0.014, 0, gy, 0.15));
    add('alu', rbox(0.62, 0.17, 0.88, 0.045, 0, gy - 0.085, 0.15));
    add('dark', rbox(0.48, 0.04, 0.68, 0.012, 0, gy - 0.175, 0.15));
    for (let k = 0; k < 9; k++) for (const sx of [1, -1]) add('steel', tx(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 6), sx * 0.34, gy + 0.024, -0.27 + k * 0.105), true);
    add('steel', rod([0.32, gy - 0.08, 0.5], [0.36, gy - 0.06, -0.1], 0.013, 6), true);
  } else {
    // Drop door frame flush with the belly (the doors are animated below).
    add('dark', rbox(0.8, 0.03, 1.4, 0.012, 0, gy + 0.02, -0.15));
  }
  {
    const sx0 = fusX(DOOR_Z + 0.4, 0.3);
    add('steel', rod([-sx0 + 0.005, 0.3, DOOR_Z + 0.4], [-sx0 - 0.06, 0.02, DOOR_Z + 0.4], 0.015, 8));
    add('steel', rbox(0.18, 0.016, 0.12, 0.004, -sx0 - 0.09, 0.012, DOOR_Z + 0.4), true);
  }
  // PT6A-65 exhaust stacks: oval pipes out of both cowl sides behind the prop.
  for (const sx of [1, -1]) {
    const y0 = 0.13;
    const pts = [[sx * 0.3, y0, 3.0], [sx * 0.44, y0, 2.98], [sx * 0.54, y0 - 0.005, 2.88], [sx * 0.6, y0 - 0.01, 2.7]];
    const pipe = tube(pts, 0.08, 22, 14);
    const p = pipe.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, y0 + (p.getY(i) - y0) * 1.3);
    pipe.computeVertexNormals();
    add('exhaust', pipe);
    const end = new THREE.Vector3(...pts[3]), dir = end.clone().sub(new THREE.Vector3(...pts[2])).normalize();
    const throat = new THREE.CircleGeometry(0.075, 18).scale(1, 1.3, 1);
    throat.applyMatrix4(new THREE.Matrix4().compose(end.clone().addScaledVector(dir, -0.03), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().negate()), new THREE.Vector3(1, 1, 1)));
    add('gloss', throat);
  }
  // Nose bowl round the spinner with the chin inlet under it, landing lights.
  {
    const st0 = fwdSt[0], z0 = st0.z;
    const face = new THREE.Shape(sectionRing(st0).slice(0, -1).map(([x, y]) => new THREE.Vector2(x * 0.995, y)));
    const hole = new THREE.Path(); hole.absarc(0, 0.07, 0.29, 0, Math.PI * 2, true); face.holes.push(hole);
    add('paint', shade(tagged(tx(new THREE.ShapeGeometry(face, 24), 0, 0, z0 - 0.004)), () => 0.86));
    add('paint', tx(new THREE.TorusGeometry(0.295, 0.014, 8, 44), 0, 0.07, z0 - 0.004));
    add('dark', tx(new THREE.CylinderGeometry(0.29, 0.29, 0.1, 44, 1, true), 0, 0.07, z0 - 0.05, Math.PI / 2));
    // Chin inlet: a scoop under the cowl front, dark mouth with a screen.
    const zi = 3.12, yi = -0.42;
    add('paint', rbox(0.46, 0.2, 0.42, 0.06, 0, yi - 0.02, zi - 0.05));
    add('gloss', tx(new THREE.PlaneGeometry(0.36, 0.12), 0, yi - 0.02, zi + 0.165));
    for (let k = -2; k <= 2; k++) add('steel', tx(new THREE.BoxGeometry(0.36, 0.005, 0.005), 0, yi - 0.02 + k * 0.022, zi + 0.17), true);
    for (const sx of [1, -1]) {
      add('lens', ball([sx * 0.25, -0.13, z0 - 0.08], 0.05, 14));
      add('white', tx(new THREE.CircleGeometry(0.036, 16), sx * 0.25, -0.13, z0 - 0.06));
    }
  }
  // Oil cooler scoop and drains under the cowl.
  add('paint', rbox(0.32, 0.12, 0.55, 0.04, 0, -0.52, 1.75, -0.06));
  add('dark', tx(new THREE.PlaneGeometry(0.26, 0.07), 0, -0.525, 2.03, -0.06));
  for (const sx of [-0.09, 0.09]) add('steel', rod([sx, -0.48, 1.4], [sx, -0.56, 1.35], 0.008, 6), true);
  // Spinner: polished, long, with backplate.
  const spinner = lathe([[0.0, 0.58], [0.03, 0.555], [0.08, 0.49], [0.13, 0.4], [0.18, 0.29], [0.225, 0.18], [0.258, 0.085], [0.28, 0]].reverse(), 44);
  spinner.rotateX(Math.PI / 2);
  const spinnerMesh = new THREE.Mesh(mergeGeometries([tagged(spinner), tagged(tx(new THREE.CylinderGeometry(0.288, 0.288, 0.02, 44), 0, 0, -0.005, Math.PI / 2))]), M.polished);
  spinnerMesh.castShadow = true;

  // ---------------- canopy ----------------
  const RN = { side: 14, corner: 6, front: 4 };
  const ringAt = (y, shrink = 0) => {
    const w = Math.max(0.003, canW(y) - shrink), zf = canF(y) - shrink, zr = CAN.zR;
    const c = Math.min(wsC(y), w * 0.6), zA = Math.max(zr + 0.05, zf - (w - c) * WS_K);
    const half = [];
    for (let i = 0; i <= RN.side; i++) half.push([w, zr + ((zA - zr) * i) / RN.side]);
    for (let i = 1; i <= RN.corner; i++) { const t = i / RN.corner; half.push([lerp(w, c, t), lerp(zA, zf, t)]); }
    for (let i = 1; i <= RN.front; i++) half.push([c * (1 - i / RN.front), zf]);
    const ring = half.concat(half.slice(0, -1).reverse().map(([x, z]) => [-x, z]));
    return ring.map(([x, z]) => [x, y, z]);
  };
  const aPostAt = (y) => { const w = canW(y), c = Math.min(wsC(y), w * 0.6); return [w, y, Math.max(CAN.zR + 0.05, canF(y) - (w - c) * WS_K)]; };
  const ringSurface = (ys, shrink = 0) => {
    const rings = ys.map((y) => ringAt(y, shrink));
    const n = rings[0].length, pos = [], idx = [];
    for (const r of rings) for (const p of r) pos.push(...p);
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const glassYs = Array.from({ length: 9 }, (_, j) => SILL + 0.005 + ((CAN.glassTop - SILL - 0.005) * j) / 8);
  const roofYs = Array.from({ length: 8 }, (_, j) => CAN.glassTop + (CAN.yt - CAN.glassTop) * Math.sin((j / 7) * (Math.PI / 2)));
  const glassMesh = new THREE.Group();
  const gm = new THREE.Mesh(tagged(ringSurface(glassYs)), M.glass);
  gm.renderOrder = 10;
  glassMesh.add(gm);
  add('livery', liveryUV(ringSurface(roofYs)));
  const headliner = tagged(ringSurface(roofYs.map((y) => y - 0.012), 0.012));
  {
    const s = new THREE.Shape();
    const y0 = SILL + 0.32, n = 14;
    s.moveTo(-canW(y0), y0);
    for (let i = 1; i <= n; i++) { const y = y0 + ((CAN.yt - y0) * i) / n; s.lineTo(-canW(y), y); }
    for (let i = n - 1; i >= 0; i--) { const y = y0 + ((CAN.yt - y0) * i) / n; s.lineTo(canW(y), y); }
    s.closePath();
    add('interior', tx(new THREE.ShapeGeometry(s, 4), 0, 0, CAN.zR - 0.004));
  }
  const cabC = new THREE.Vector3(0, 1.45, -1.6);
  const frame = (pts, r = 0.028, rIn = r * 0.85) => {
    add('paint', tube(pts, r, Math.max(6, pts.length * 3), 10));
    const mid = new THREE.Vector3(...pts[Math.floor(pts.length / 2)]);
    const inw = cabC.clone().sub(mid).normalize().multiplyScalar(r * 0.5);
    // Inside, the frame is painted black: the inner tube covers the outer
    // one as seen from the seat.
    void rIn;
    add('frameIn', tube(pts.map((p) => [p[0] + inw.x, p[1] + inw.y, p[2] + inw.z]), r * 1.02, Math.max(6, pts.length * 3), 8));
  };
  const hs = (f) => Array.from({ length: 7 }, (_, j) => f(SILL + 0.01 + ((CAN.glassTop - SILL - 0.01) * j) / 6));
  const ringEdge = (y) => { const r = ringAt(y); return r.filter((_, i) => i % 2 === 0 || i === r.length - 1); };
  frame(ringEdge(SILL + 0.012), 0.027, 0.018);
  frame(ringEdge(CAN.glassTop), 0.031, 0.024);
  { const r = ringAt(SILL + 0.022); add('paint', tube(r.slice(RN.side, r.length - RN.side), 0.036, 32, 10)); }
  for (const sx of [1, -1]) {
    frame(hs((y) => [sx * Math.min(wsC(y), canW(y) * 0.6), y, canF(y) + 0.004]), 0.025, 0.02);
    const aPost = (y) => { const p = aPostAt(y); return [sx * p[0], p[1], p[2]]; };
    frame(hs(aPost), 0.031, 0.024);
    frame(hs((y) => [sx * canW(y), y, DOOR_Z]), 0.027, 0.02);
    frame(hs((y) => [sx * canW(y), y, CAN.zR + 0.03]), 0.031, 0.024);
    for (const p of [aPost(SILL + 0.012), aPost(CAN.glassTop), [sx * canW(SILL), SILL + 0.012, DOOR_Z], [sx * canW(CAN.glassTop), CAN.glassTop, DOOR_Z]]) add('paint', ball(p, 0.033));
    add('steel', rod([sx * (canW(SILL + 0.18) + 0.012), SILL + 0.18, DOOR_Z + 0.16], [sx * (canW(SILL + 0.18) + 0.012), SILL + 0.18, DOOR_Z + 0.3], 0.01, 6));
    for (const hz of [-1.2, -1.55]) add('steel', tx(new THREE.CylinderGeometry(0.013, 0.013, 0.05, 8), sx * (canW(CAN.glassTop) - 0.01), CAN.glassTop + 0.02, hz, 0, 0, Math.PI / 2));
  }
  // Wire cutter ahead of the windshield, deflector cable roof → fin, GPS
  // dome and whip antennas.
  add('dark', rod([0, 1.22, -0.55], [0, 2.1, -1.42], 0.013, 8));
  add('steel', tx(new THREE.BoxGeometry(0.014, 0.5, 0.07), 0, 2.02, -1.36, 0.78));
  add('steel', rod([0, CAN.yt + 0.02, -1.95], [0, 2.78, -6.0], 0.006, 5));
  add('dark', tx(new THREE.SphereGeometry(0.068, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, CAN.yt - 0.005, -2.05, 0, 0, 0, [1, 0.45, 1]), true);
  add('steel', rod([0.15, CAN.yt - 0.03, -2.0], [0.15, CAN.yt + 0.42, -2.3], 0.005, 5), true);
  for (const zz of [-3.4, -4.4]) add('steel', rod([0, aftTop.find(([z]) => z <= zz)[1], zz], [0, aftTop.find(([z]) => z <= zz)[1] + 0.32, zz - 0.25], 0.005, 5), true);

  // ---------------- wing ----------------
  const leY = (x) => at802WingY(x);
  const mainProf = airfoil(0, 0.74, 0.15, 0.04, 0.4, 18), aftProf = airfoil(0.76, 1.0, 0.15, 0.04, 0.4, 6);
  const flaps = [], ailerons = [];
  const wingAO = (x, xc, lower) => (lower ? 1 : 1 - 0.28 * Math.max(0, 1 - (x - 0.62) / 0.6));
  const surfaceMesh = (geo, x0, x1, side) => {
    const hz = W.le - 0.76 * W.chord;
    const hx = (side * (x0 + x1)) / 2;
    const pivot = new THREE.Group();
    pivot.position.set(hx, leY(hx) + 0.03, hz);
    pivot.rotation.z = side * Math.atan(DIH);
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
  const wingParts = [];
  const flapEnd = 5.2;
  for (const side of [1, -1]) {
    const st = (x) => ({ x, y: leY(x), le: W.le, chord: W.chord });
    wingParts.push(wingPanel802([0.0, W.rootX, 1.2, 2.4, 3.6, 4.8, 6.0, 7.2, 8.2, W.tipX].map(st), mainProf, side, wingAO));
    wingParts.push(wingPanel802([st(0.0), st(W.rootX + 0.05)], aftProf, side, wingAO));
    flaps.push(surfaceMesh(wingPanel802([W.rootX + 0.06, 1.8, 3.4, flapEnd - 0.02].map(st), aftProf, side, wingAO), W.rootX + 0.06, flapEnd - 0.02, side));
    ailerons.push(surfaceMesh(wingPanel802([flapEnd + 0.04, 6.4, 7.7, W.tipX - 0.02].map(st), aftProf, side), flapEnd + 0.04, W.tipX - 0.02, side));
    // Squared tip with a rounded fairing cap in the tip colour.
    const tipSt = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      tipSt.push({ x: W.tipX + (W.half - W.tipX) * Math.sin((t * Math.PI) / 2), y: leY(W.tipX) + 0.012 * t, le: W.le - 0.03 * t, chord: W.chord * (1 - 0.07 * t * t) });
    }
    add('accent', wingPanel(tipSt, airfoil(0, 1, 0.15 * 0.85, 0.04, 0.4, 16), side));
    const fil = mainProf.slice(0, 19).map(([xc, yc]) => { const y = W.rootY + yc * W.chord + 0.012, z = W.le - xc * W.chord; return [side * fusX(z, y), y, z]; });
    wingParts.push(tube(fil, 0.065, 30, 10));
    const tipLE = [side * (W.tipX + 0.08), leY(W.tipX) + 0.06, W.le - 0.1];
    add(side > 0 ? 'red' : 'green', ball(tipLE, 0.034, 10));
    add('lens', tx(new THREE.SphereGeometry(0.068, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), ...tipLE, 0, 0, side * Math.PI / 2, [1, 1, 1.4]));
    add('strobe', ball([side * (W.tipX + 0.12), leY(W.tipX) + 0.06, W.le - 0.7], 0.026, 8));
    add('lens', tx(new THREE.CircleGeometry(0.06, 18), side * 3.4, leY(3.4) + 0.02, W.le + 0.004));
    {
      const up = mainProf.slice(0, 19).filter(([xc]) => xc > 0.12 && xc < 0.62);
      const sheet = up.map(([xc, yc]) => [xc, yc + 0.004]).concat(up.slice().reverse().map(([xc, yc]) => [xc, yc + 0.0005]));
      add('deck', wingPanel802([0.64, 0.98, 1.28].map(st), sheet, side));
    }
    add('dark', tx(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 20), side * 2.6, leY(2.6) + 0.12, -0.55));
    add('steel', tx(new THREE.BoxGeometry(0.12, 0.012, 0.024), side * 2.6, leY(2.6) + 0.14, -0.55), true);
    for (const hx of [1.3, 2.7, 4.1, 5.5, 6.8, 8.0]) add('dark', tx(new THREE.BoxGeometry(0.035, 0.09, 0.15), side * hx, leY(hx) - 0.09, W.le - 0.76 * W.chord + 0.02, 0, 0, side * Math.atan(DIH)), true);
  }
  add('steel', rod([5.2, leY(5.2) - 0.13, 0.62], [5.2, leY(5.2) - 0.13, 1.2], 0.011, 8), true);
  add('steel', rod([5.2, leY(5.2) - 0.02, 0.5], [5.2, leY(5.2) - 0.13, 0.66], 0.012, 6), true);
  add('steel', tx(new THREE.BoxGeometry(0.004, 0.035, 0.03), 3.0, leY(3.0) - 0.01, W.le + 0.02), true);
  for (const g of wingParts) add(g.attributes.uv && g.attributes.color ? 'wing' : 'paint', g);

  // ---------------- tail ----------------
  const stabY = 0.62;
  const stabSt = [
    { x: 0.08, y: stabY, le: -5.62, chord: 1.3 }, { x: 2.2, y: stabY + 0.01, le: -5.67, chord: 1.2 },
    { x: 2.85, y: stabY + 0.015, le: -5.72, chord: 1.06 }, { x: 2.95, y: stabY + 0.016, le: -5.77, chord: 0.94 }, { x: 3.0, y: stabY + 0.017, le: -5.84, chord: 0.8 },
  ];
  const elevParts = [];
  for (const side of [1, -1]) {
    add('paint', wingPanel(stabSt, airfoil(0, 0.62, 0.1, 0, 0.4, 12), side));
    elevParts.push(tagged(wingPanel(stabSt.slice(0, 3), airfoil(0.64, 1, 0.1, 0, 0.4, 4), side)));
    add('steel', rod([side * 1.6, stabY - 0.05, -5.95], [side * 0.15, 0.36, -5.6], 0.022, 8));
    for (const p of [[side * 1.6, stabY - 0.05, -5.95], [side * 0.15, 0.36, -5.6]]) add('steel', ball(p, 0.032, 8), true);
    // Fire Boss: auxiliary fins on the stabiliser tips (photographs).
    if (FB) {
      const fz = -6.0, fy = stabY + 0.017;
      const finTip = (y0, y1) => wingPanel([{ x: y0, y: 0, le: fz + 0.12, chord: 0.72 }, { x: y1, y: 0, le: fz - 0.02, chord: 0.5 }], airfoil(0, 1, 0.09, 0, 0.4, 10), 1);
      for (const [y0, y1] of [[fy, fy + 0.55], [fy, fy - 0.35]]) {
        const g = finTip(y0, y1);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) p.setXYZ(i, side * 3.0 + p.getY(i), p.getX(i), p.getZ(i));
        g.computeVertexNormals();
        add('accent', y1 > y0 ? flipWinding(g) : g);
      }
    }
  }
  elevParts.push(tagged(tx(new THREE.BoxGeometry(0.55, 0.014, 0.1), 0.8, stabY + 0.005, -5.62 - 1.28 - 0.04)));
  const elevGeo = mergeGeometries(elevParts);
  const elevHingeZ = -5.62 - 0.64 * 1.3;
  elevGeo.translate(0, -stabY, -elevHingeZ);
  const elevator = new THREE.Group();
  elevator.position.set(0, stabY, elevHingeZ);
  const elevMesh = new THREE.Mesh(elevGeo, M.paint);
  elevMesh.castShadow = true; elevMesh.receiveShadow = true;
  elevator.add(elevMesh);
  root.add(elevator);
  const vfin = (prof, sts) => {
    const g = wingPanel(sts.map(([h, le, c]) => ({ x: h, y: 0, le, chord: c })), prof, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getY(i), p.getX(i), p.getZ(i));
    return flipWinding(g);
  };
  add('livery', liveryUV(vfin(airfoil(0, HINGE, 0.11, 0, 0.4, 12), FIN_ST)));
  add('livery', liveryUV(loft(sampleStations([
    K(-4.35, 0.012, 1.03, 1.0, 1.06, 2.2, 2.2), K(-4.7, 0.04, 1.0, 0.97, 1.1, 2.0, 2.2), K(-5.0, 0.06, 0.97, 0.94, 1.18, 2.0, 2.2),
    K(-5.25, 0.065, 0.95, 0.92, 1.32, 2.0, 2.2), K(-5.42, 0.06, 0.93, 0.9, 1.52, 2.0, 2.2),
  ], 20), 12, null)));
  const hb = [0, FIN_ST[0][0], FIN_ST[0][1] - HINGE * FIN_ST[0][2]], ht = [0, FIN_ST[FIN_ST.length - 1][0], FIN_ST[FIN_ST.length - 1][1] - HINGE * FIN_ST[FIN_ST.length - 1][2]];
  const tilt = Math.atan2(ht[2] - hb[2], ht[1] - hb[1]);
  const rudder = new THREE.Group();
  rudder.position.set(...hb);
  rudder.rotation.x = tilt;
  rudder.updateMatrix();
  // The rudder runs down below the tail cone to the bottom of the post.
  const rudSt = [[0.7, FIN_ST[0][1] + 0.04, FIN_ST[0][2] - 0.04], ...FIN_ST];
  const rudGeo = liveryUV((vfin(airfoil(HINGE + 0.02, 1, 0.11, 0, 0.4, 5), rudSt)));
  const rudTab = tagged(tx(new THREE.BoxGeometry(0.014, 0.38, 0.1), 0, 1.05, -5.4 - 1.5));
  const inv = rudder.matrix.clone().invert();
  rudGeo.applyMatrix4(inv); rudTab.applyMatrix4(inv);
  const rudMesh = new THREE.Mesh(rudGeo, M.livery);
  rudMesh.castShadow = true;
  rudder.add(rudMesh, new THREE.Mesh(rudTab, M.accent));
  root.add(rudder);
  add('beacon', tx(new THREE.SphereGeometry(0.046, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 2.785, -5.95));
  add('white', ball([0, 0.62, -7.06], 0.03, 10));
  add('steel', tx(new THREE.TorusGeometry(0.034, 0.008, 6, 12), 0, 0.4, -6.0, 0, Math.PI / 2), true);

  // ---------------- landing gear / floats ----------------
  const gearCfg = Object.fromEntries(A.gear.map((g) => [g.name, g]));
  const gearGroups = {};
  const tyreProfile = (R, Wd, rim) => [
    [rim, -Wd * 0.42], [rim + 0.02, -Wd * 0.5], [R * 0.8, -Wd * 0.53], [R * 0.95, -Wd * 0.45], [R * 0.995, -Wd * 0.3],
    [R, -Wd * 0.12], [R, Wd * 0.12], [R * 0.995, Wd * 0.3], [R * 0.95, Wd * 0.45], [R * 0.8, Wd * 0.53], [rim + 0.02, Wd * 0.5], [rim, Wd * 0.42],
  ];
  const makeWheel = (R, Wd, rim, sx, big) => {
    const spin = new THREE.Group();
    const tyre = lathe(tyreProfile(R, Wd, rim), big ? 48 : 28);
    tyre.rotateZ(Math.PI / 2);
    const tmesh = new THREE.Mesh(tyre, M.tyre);
    tmesh.castShadow = true; tmesh.receiveShadow = true;
    const hubG = lathe([[0.0, -Wd * 0.3], [rim * 0.35, -Wd * 0.32], [rim * 0.55, -Wd * 0.18], [rim * 0.9, -Wd * 0.3], [rim + 0.008, -Wd * 0.44],
      [rim + 0.008, Wd * 0.44], [rim * 0.9, Wd * 0.3], [rim * 0.55, Wd * 0.18], [rim * 0.35, Wd * 0.32], [0.0, Wd * 0.3]], big ? 32 : 18);
    hubG.rotateZ(Math.PI / 2);
    const parts = [tagged(hubG)];
    if (big) {
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; parts.push(tagged(tx(new THREE.CylinderGeometry(0.012, 0.012, 0.022, 8), sx * Wd * 0.33, Math.cos(a) * rim * 0.55, Math.sin(a) * rim * 0.55, 0, 0, Math.PI / 2))); }
      parts.push(tagged(tx(new THREE.SphereGeometry(rim * 0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), sx * Wd * 0.31, 0, 0, 0, 0, -sx * Math.PI / 2)));
    }
    spin.add(tmesh, new THREE.Mesh(mergeGeometries(parts), M.hub));
    return spin;
  };
  const nozzles = [];
  let pumpFan = new THREE.Group();
  const gearAnim = [], probes = [], doors = [];
  if (!FB) {
    for (const [name, sx] of [['mainL', 1], ['mainR', -1]]) {
      const cfg = gearCfg[name];
      const R = cfg.radius, Wd = 0.3;
      const ax = cfg.p[0], ay = cfg.p[1] + R, az = cfg.p[2];
      const g = new THREE.Group();
      const attachY = W.rootY - 0.07, attachX = 0.62, attachZ = W.le + 0.08;
      const leg = new THREE.Group();
      leg.position.y = attachY;
      const Lp = (p) => [p[0], p[1] - attachY, p[2]];
      const axIn = ax - sx * 0.19;
      const legParts = [];
      const n = 8;
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const P = (t) => [lerp(sx * attachX, axIn, t), lerp(attachY, ay + 0.05, t) - 0.06 * Math.sin(Math.PI * t), lerp(attachZ, az, t)];
        legParts.push(bar(Lp(P(t0)), Lp(P(t1)), lerp(0.085, 0.052, (t0 + t1) / 2), lerp(0.21, 0.13, (t0 + t1) / 2)));
      }
      legParts.push(tx(new RoundedBoxGeometry(0.13, 0.17, 0.2, 2, 0.03), ...Lp([axIn, ay + 0.04, az])));
      legParts.push(rod(Lp([axIn, ay, az]), Lp([ax - sx * 0.02, ay, az]), 0.04, 12));
      const legMesh = new THREE.Mesh(mergeGeometries(legParts.map((p) => tagged(p))), M.paint);
      legMesh.castShadow = true; legMesh.receiveShadow = true;
      const brakeLine = new THREE.Mesh(tagged(tube([Lp([sx * (attachX + 0.02), attachY - 0.02, attachZ - 0.06]), Lp([(sx * attachX + axIn) / 2, (attachY + ay) / 2 - 0.06, (attachZ + az) / 2 - 0.08]), Lp([axIn - sx * 0.02, ay + 0.09, az - 0.08])], 0.009, 16, 6)), M.rubber);
      leg.add(legMesh, brakeLine);
      g.add(leg);
      add('paint', tx(new THREE.SphereGeometry(1, 20, 12), sx * 0.6, attachY + 0.03, attachZ - 0.06, 0, 0, sx * 0.5, [0.15, 0.09, 0.23]));
      add('paint', tx(new THREE.SphereGeometry(1, 16, 10), sx * (fusX(attachZ, attachY + 0.12) - 0.02), attachY + 0.12, attachZ - 0.1, 0, 0, 0, [0.09, 0.18, 0.34]));
      const wheel = new THREE.Group();
      wheel.position.set(ax, ay, az);
      const spinPart = makeWheel(R, Wd, 0.18, sx, true);
      const brake = new THREE.Mesh(tagged(tx(new THREE.CylinderGeometry(0.16, 0.16, 0.014, 26), -sx * 0.125, 0, 0, 0, 0, Math.PI / 2)), M.steel);
      const caliper = new THREE.Mesh(tagged(new RoundedBoxGeometry(0.06, 0.1, 0.11, 2, 0.014).translate(-sx * 0.125, 0.12, -0.05)), M.dark);
      wheel.add(spinPart, brake, caliper);
      g.add(wheel);
      root.add(g);
      gearGroups[name] = { group: g, wheel, spin: spinPart, leg, legH: attachY - ay, rest: wheel.position.clone(), sx };
    }
    {
      const cfg = gearCfg.tail;
      const g = new THREE.Group();
      const R = cfg.radius;
      const fz = cfg.p[2] + 0.13, fy = cfg.p[1] + R + 0.11;
      add('dark', bar([0, 0.44, -6.15], [0, fy + 0.03, fz], 0.085, 0.022));
      add('dark', tx(new THREE.CylinderGeometry(0.038, 0.038, 0.09, 12), 0, fy + 0.04, fz));
      const fork = new THREE.Group();
      fork.position.set(0, fy, fz);
      fork.add(new THREE.Mesh(mergeGeometries([
        tagged(tx(new THREE.BoxGeometry(0.015, 0.19, 0.065), 0.07, -0.055, -0.075, 0.6)), tagged(tx(new THREE.BoxGeometry(0.015, 0.19, 0.065), -0.07, -0.055, -0.075, 0.6)),
        tagged(tx(new THREE.BoxGeometry(0.15, 0.026, 0.065), 0, 0.028, -0.01)), tagged(rod([-0.085, 0.038, 0.055], [0.085, 0.038, 0.055], 0.01, 6)),
      ]), M.steel));
      const wheel = new THREE.Group();
      wheel.position.set(0, -0.11, -0.13);
      wheel.add(makeWheel(R, 0.11, 0.085, 1, false));
      fork.add(wheel);
      g.add(fork);
      root.add(g);
      for (const sx of [1, -1]) add('steel', rod([sx * 0.085, fy + 0.035, fz + 0.05], [sx * 0.12, 0.5, -6.0], 0.005, 5), true);
      gearGroups.tail = { group: g, wheel, spin: wheel.children[0], fork, rest: wheel.position.clone(), sx: 0 };
    }
    // ---------------- spray system ----------------
    const hingeZ = W.le - 0.76 * W.chord;
    const boomZ = W.le - W.chord - 0.03, boomDrop = 0.33;
    for (const side of [1, -1]) {
      const x0 = 0.95, x1 = 8.25;
      const a = [side * x0, leY(x0) - boomDrop, boomZ], b = [side * x1, leY(x1) - boomDrop, boomZ];
      add('alu', rod(a, b, 0.032, 12));
      add('alu', ball(b, 0.038, 10));
      for (const hx of [1.6, 3.0, 4.4, 5.8, 7.2]) {
        const top = [side * hx, leY(hx) - 0.04, hingeZ + 0.18], bot = [side * hx, leY(hx) - boomDrop, boomZ];
        add('alu', tx(rbox(0.02, 0.001 + Math.hypot(top[1] - bot[1], top[2] - bot[2]), 0.08, 0.008, 0, 0, 0), side * hx, (top[1] + bot[1]) / 2, (top[2] + bot[2]) / 2, Math.atan2(top[2] - bot[2], top[1] - bot[1])));
        add('dark', tx(new THREE.CylinderGeometry(0.038, 0.038, 0.035, 10), side * hx, leY(hx) - boomDrop, boomZ, 0, 0, Math.PI / 2), true);
      }
      const N = 30;
      for (let k = 0; k < N; k++) {
        const x = x0 + 0.1 + ((x1 - x0 - 0.2) * k) / (N - 1);
        const y = leY(x) - boomDrop;
        add('alu', rod([side * x, y, boomZ], [side * x, y - 0.07, boomZ - 0.02], 0.008, 6), true);
        add('dark', tx(new THREE.CylinderGeometry(0.019, 0.016, 0.05, 10), side * x, y - 0.1, boomZ - 0.03, 0.3), true);
        add('brass', tx(new THREE.ConeGeometry(0.011, 0.028, 8), side * x, y - 0.136, boomZ - 0.042, Math.PI + 0.3), true);
        nozzles.push(new THREE.Vector3(side * x, y - 0.14, boomZ - 0.042));
      }
    }
    add('alu', rod([0.95, leY(0.95) - boomDrop, boomZ], [-0.95, leY(0.95) - boomDrop, boomZ], 0.046, 12));
    add('alu', tube([[0, gy - 0.1, -0.3], [0, gy - 0.05, -0.8], [0, -0.9, -1.2], [0, leY(0.95) - boomDrop, boomZ]], 0.046, 24, 10));
    const pump = new THREE.Group();
    pump.position.set(0, gy - 0.28, 0.95);
    const pumpBody = lathe([[0.0, -0.26], [0.09, -0.25], [0.12, -0.16], [0.13, 0.06], [0.11, 0.19], [0.065, 0.25], [0.0, 0.26]], 24);
    pumpBody.rotateX(Math.PI / 2);
    pump.add(new THREE.Mesh(tagged(pumpBody), M.dark));
    pump.add(new THREE.Mesh(tagged(tx(new THREE.SphereGeometry(0.055, 14, 10), 0, 0, 0.27)), M.steel));
    pumpFan = new THREE.Group();
    pumpFan.position.z = 0.29;
    for (let i = 0; i < 4; i++) {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.065, 0.009), M.yellow);
      bl.position.x = Math.cos((i * Math.PI) / 2) * 0.125;
      bl.position.y = Math.sin((i * Math.PI) / 2) * 0.125;
      bl.rotation.z = (i * Math.PI) / 2;
      bl.rotation.x = 0.35;
      pumpFan.add(bl);
    }
    pump.add(pumpFan);
    root.add(pump);
    add('steel', rod([0, gy + 0.02, 0.95], [0, gy - 0.16, 0.95], 0.032, 10));
  } else {
    // ---------------- Wipline 10000 floats ----------------
    const hull = floatHullGeo();
    for (const sx of [1, -1]) {
      const m = new THREE.Mesh(hull, M.float);
      m.position.x = sx * FL.x;
      m.castShadow = true; m.receiveShadow = true;
      root.add(m);
      // Deck hardware: cleats, pump-out cups, the step fairing line.
      for (const z of [3.4, 1.4, -1.4, -3.2]) add('steel', tx(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10), sx * FL.x, -1.615, z), true);
      add('dark', tx(new THREE.BoxGeometry(0.98, 0.012, 0.03), sx * FL.x, floatKeelY(FL.stepZ) + 0.06, FL.stepZ - 0.04), true);
      // Struts: an N on each side from the float deck to the fuselage and
      // the wing root fitting, faired in the airframe colour.
      const deck = (z) => [sx * FL.x, -1.6, z];
      const fusF = [sx * (fusX(1.2, -0.55) - 0.02), -0.55, 1.2], fusR = [sx * (fusX(-1.1, -0.72) - 0.02), -0.72, -1.1];
      const wingFit = [sx * 1.9, leY(1.9) - 0.06, 0.15];
      const strut = (a, b, w = 0.075, t = 0.028) => add('paint', bar(a, b, t, w));
      strut(deck(1.7), fusF); strut(deck(-0.85), fusR); strut(deck(1.7), wingFit, 0.07, 0.026); strut(deck(-0.85), wingFit, 0.07, 0.026);
      strut(deck(1.7), [sx * 0.2, -0.95, 0.9], 0.06, 0.024);
      for (const p of [deck(1.7), deck(-0.85)]) add('steel', rbox(0.14, 0.05, 0.22, 0.015, p[0], p[1] + 0.01, p[2]), true);
      // Water rudder at the stern (retracts with the gear: kept down here).
      add('dark', rbox(0.02, 0.32, 0.22, 0.008, sx * FL.x, floatKeelY(-4.4) - 0.08, -4.6));
      // Scoop probes just aft of the step: hinged scoops that swing down.
      const probe = new THREE.Group();
      probe.position.set(sx * (FL.x - 0.28), floatKeelY(-0.75) + 0.02, -0.75);
      const pm = new THREE.Mesh(mergeGeometries([tagged(rbox(0.1, 0.08, 0.36, 0.02, 0, -0.04, -0.18)), tagged(rod([0, 0, 0], [0, -0.03, -0.32], 0.035, 10))]), M.steel);
      probe.add(pm);
      root.add(probe);
      probes.push(probe);
    }
    // Spreader bars between the floats.
    for (const z of [1.7, -0.85]) add('paint', bar([FL.x, -1.6, z], [-FL.x, -1.6, z], 0.035, 0.09));
    // Drop doors under the belly (two panels hinged on the sides).
    for (const sx of [1, -1]) {
      const d = new THREE.Group();
      d.position.set(sx * 0.38, gy + 0.005, -0.15);
      d.add(new THREE.Mesh(tagged(rbox(0.37, 0.025, 1.34, 0.01, -sx * 0.185, 0, 0)), M.paint));
      root.add(d);
      doors.push({ g: d, sx });
    }
    // Retractable wheels: nose pairs at the bows, mains aft of the step.
    const legMat = M.steel;
    for (const [name, sx] of [['noseL', 1], ['noseR', -1], ['mainL', 1], ['mainR', -1]]) {
      const cfg = gearCfg[name];
      const nose = name.startsWith('nose');
      const R = cfg.radius;
      const ax = cfg.p[0], ay = cfg.p[1] + R, az = cfg.p[2];
      const pivotP = nose ? [ax, -1.92, az - 0.12] : [ax, -1.85, az + 0.32];
      const pivot = new THREE.Group();
      pivot.position.set(...pivotP);
      root.add(pivot);
      const Lp = (p) => [p[0] - pivotP[0], p[1] - pivotP[1], p[2] - pivotP[2]];
      const wheel = new THREE.Group();
      wheel.position.set(...Lp([ax, ay, az]));
      const spinPart = new THREE.Group();
      for (const dx of nose ? [0.12, -0.12] : [0.16, -0.16]) {
        const w = makeWheel(R, nose ? 0.1 : 0.15, nose ? 0.09 : 0.13, sx, !nose);
        w.position.x = dx;
        spinPart.add(w);
      }
      wheel.add(spinPart, new THREE.Mesh(tagged(rod([0.22, 0, 0], [-0.22, 0, 0], 0.025, 8)), legMat));
      pivot.add(wheel);
      const legG = mergeGeometries([
        tagged(rod([0, 0, 0], Lp([ax, ay + 0.06, az]), nose ? 0.04 : 0.05, 10)),
        tagged(rod(Lp([ax, ay + 0.06, az]), Lp([ax, ay + 0.02, az + 0.08]), 0.04, 8)),
        tagged(tx(new RoundedBoxGeometry(0.12, 0.1, 0.12, 2, 0.02), ...Lp([ax, ay + 0.06, az]))),
      ]);
      const leg = new THREE.Mesh(legG, legMat);
      leg.castShadow = true;
      pivot.add(leg);
      gearGroups[name] = { group: pivot, wheel, spin: spinPart, rest: wheel.position.clone(), sx };
      // Retracted: nose legs swing up and forward over the bow, mains up and aft.
      gearAnim.push({ pivot, up: nose ? -2.55 : 1.55 });
    }
  }

  // ---------------- propeller (Hartzell five-blade, feathering) ----------------
  const PR = A.propRadius;
  const prop = new THREE.Group();
  prop.position.set(0, 0.07, 3.38);
  prop.add(spinnerMesh);
  const blades = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: L.blades, roughness: FB ? 0.35 : 0.55, metalness: FB ? 0.75 : 0.25, transparent: true });
  const tipMat = new THREE.MeshStandardMaterial({ color: L.bladeTip, roughness: 0.5, metalness: FB ? 0.75 : 0.1, transparent: true });
  const bodyGeo = bladeLoft(0.22, PR - 0.1, 18, PR), tipGeo = bladeLoft(PR - 0.1, PR, 4, PR);
  const pitchGroups = [];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Group();
    b.rotation.z = (i * Math.PI * 2) / 5;
    const pg = new THREE.Group();
    const bm = new THREE.Mesh(bodyGeo, bladeMat);
    bm.castShadow = true;
    pg.add(bm, new THREE.Mesh(tipGeo, tipMat));
    pg.add(new THREE.Mesh(tagged(rod([0.13, 0, 0], [0.28, 0, 0], 0.048, 12)), M.polished));
    b.add(pg);
    blades.add(b);
    pitchGroups.push(pg);
  }
  prop.add(blades);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(PR + 0.01, 60), new THREE.MeshBasicMaterial({ map: propDiscTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.z = 0.02;
  disc.renderOrder = 11;
  prop.add(disc);
  root.add(prop);

  // ---------------- cockpit ----------------
  // at802Cockpit.js: the panel, consoles, controls and cabin interior of
  // the configuration (shared base, configuration-specific equipment).
  const ck = buildAT802Cockpit({
    variant, panel, M,
    cab: { SILL, CAN, canW, fusX, OFF },
  });
  const { cockpit, stick, pedals, throttle, valve, leds, THR } = ck;
  // Roof lining (inside of the painted roof), matt dark grey.
  cockpit.add(new THREE.Mesh(headliner, new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.95, side: THREE.DoubleSide })));
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
  lod.addLevel(new THREE.Group(), 110);
  root.add(lod);
  root.add(glassMesh);

  // Prop blade angle (feathered stopped, fine at idle, coarse at speed,
  // beta on the ground); strobes and beacon; Fire Boss gear, probes, doors.
  let bladeAngle = 1.3, t = 0;
  const FEATHER = 1.3;
  const state = { probes: 0, door: 0 };
  const update = (dt, fm, ac) => {
    t += dt;
    // The interior is drawn only from the cockpit or a close camera (the
    // chase and distant views skip its ≈ 65 draw calls).
    const g = ac?.game;
    if (g?.camera && !ac.parked) cockpit.visible = g.cameraMode === 'cockpit' || g.cameraMode === 'free' || g.camera.position.distanceToSquared(root.position) < 22 * 22;
    if (cockpit.visible) ck.update(dt, fm, ac);
    const o = fm.out;
    let target;
    if (fm.engine === 'off' && (o.onGround || fm.rpm < 150)) target = FEATHER;
    else if (fm.engine === 'cranking') target = lerp(FEATHER, 0.0, smoothstep(250, 900, fm.rpm));
    else if (fm.beta) target = -0.2;
    else target = 0.04 + 0.42 * smoothstep(15, 75, o.airspeed) + 0.12 * (fm.shaftPower / A.maxPower);
    bladeAngle += clamp(target - bladeAngle, -dt * 0.9, dt * 0.9);
    for (const pg of pitchGroups) pg.rotation.x = bladeAngle;
    const on = fm.engine !== 'off';
    M.beacon.emissiveIntensity = on ? 0.6 + 2.4 * Math.max(0, Math.sin(t * 7.5)) ** 8 : 0;
    M.strobe.emissiveIntensity = on && t % 1.2 < 0.06 ? 4 : 0;
    if (FB) {
      const k = 1 - fm.gearDown;
      for (const ga of gearAnim) ga.pivot.rotation.x = ga.up * smoothstep(0, 1, k);
      for (const p of probes) p.rotation.x = -0.9 * state.probes;
      for (const d of doors) d.g.rotation.z = -d.sx * 1.2 * state.door;
    }
  };

  return {
    variant,
    setReg(r) {
      const n = liveryTextures(r, L);
      M.livery.map.dispose(); M.livery.bumpMap.dispose();
      M.livery.map = n.map; M.livery.bumpMap = n.bump; M.livery.needsUpdate = true;
    },
    // Scoop probes (0 up … 1 down) and drop doors (0 shut … 1 open).
    setWaterGear(probesDown, doorOpen) { state.probes = probesDown; state.door = doorOpen; },
    root, M,
    prop, blades, bladeMats: [bladeMat, tipMat], disc,
    ailerons, flaps, elevator, rudder,
    gear: gearGroups,
    stick, pedals, throttle, valve, leds, panelMesh: cockpit, inst: { pick: ck.pick, pickables: ck.pickables },
    pumpFan, nozzles, pilot, cockpit, glassMesh,
    eye: new THREE.Vector3(...AT802_EYE),
    seat: new THREE.Vector3(...o3(0, 0.05, -0.55)),
    canopy: { sill: SILL, roof: CAN.yt, windshieldZ: -0.92, rearZ: CAN.zR, halfWidth: CAN.ww },
    fuelFiller: new THREE.Vector3(2.6, at802WingY(2.6) + 0.13, -0.55),
    hopperPort: new THREE.Vector3(fusX(-2.0, -0.25) + 0.1, -0.25, -2.0),
    dropPoint: new THREE.Vector3(0, gy - 0.05, -0.15),
    probePoints: [new THREE.Vector3(FL.x - 0.28, floatKeelY(-0.75), -0.9), new THREE.Vector3(-FL.x + 0.28, floatKeelY(-0.75), -0.9)],
    update,
  };
}
