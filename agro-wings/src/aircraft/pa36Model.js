// Procedural Piper PA-36-300 Pawnee Brave 300 (fictional Brazilian marks
// PR-PWB): its own geometry, from the type's figures (span ≈ 11.8 m, length
// ≈ 8.2 m, height ≈ 2.3 m, wing 20.9 m²) and measured on references — the
// Earl Stahl Brave plan (side and top views, orthographic, 68.3 px/m on the
// side view after scaling the spinner-to-rudder length to 8.2 m) for the
// profile, checked against VH-SVO (fin root and tail depth), N57886 and
// HA-MJG (side, windshield rake, cabin height) and the VH three-quarter
// front view and TC-ZH (cowl face, gear track, cable). VISUAL ONLY: the
// physics (FLIGHT_PA36), gear contacts and hard points live in config.js.
//
// Body frame: +Z nose, +Y up, +X left wing; origin = CG (25 % of the wing
// chord). The geometry is built in the reference frame of the plan — the
// Brave standing on its three wheels, cowl and hopper top level, the ground
// at y = −1.42 — and the whole model is pitched nose-down PA36_STANCE (9°)
// inside the root: on the ground the body datum stands 9° nose-up and the
// wing chord ≈ 10° (1° of incidence); in level flight the long nose drops
// below the horizon as on the in-flight photographs.
//
// What makes it a Brave and not a Pawnee or another ag type: the long, flat-
// topped nose (cowl and hopper one level line to the windshield, the prop
// shaft high in a deep cowl face, the round inlets low in it); the single-
// seat cabin standing on the fuselage's top longerons well behind the hopper,
// a raked windshield, flat roof, side windows to the door post and a small
// rear window; behind it the cabin's back falls steeply to a narrow, round-
// topped turtledeck and a deep, slim cone (the spine at the fin root ≈ 1.4 m
// over the ground on three wheels; photographs PH-AJB / VH-HLW / N44523 /
// N57728); the tall, swept fin (≈ 52° leading edge, sloping top) and the
// raked rudder; the tailplane low on the cone, strut-braced; the cantilever low wing
// — constant chord with a leading-edge glove at the root, no struts, upswept
// tip caps, 6° dihedral; oleo main legs under the leading edge with a drag
// brace, the tailwheel under the rudder; the wire cable from the cabin to
// the fin top, the windshield cutter; a two-blade Hartzell with a pointed
// spinner.
// The cockpit inside is built by pa36Cockpit.js (Prompt 02) on the cabin
// anchors below.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { rng, clamp, smoothstep, lerp } from '../core/math.js';
import { FLIGHT_PA36 } from '../config.js';
import {
  airfoil, wingPanel, flipWinding, tagged, tx, rod, tube, bar, ball, rbox, lathe, grid,
  speckle, orangePeel, treadTexture, propDiscTexture, WING_SPAN_UV, buildPilot,
} from './model.js';
import { buildPA36Cockpit, PA36_CK } from './pa36Cockpit.js';

const A = FLIGHT_PA36;
export const PA36_STANCE = (9 * Math.PI) / 180;
const CS = Math.cos(PA36_STANCE), SN = Math.sin(PA36_STANCE);
export const pa36ToBody = ([x, y, z]) => [x, y * CS - z * SN, y * SN + z * CS];
const toRef = ([x, y, z]) => [x, y * CS + z * SN, -y * SN + z * CS];
const GROUND = -1.42; // ground on three wheels, reference frame

// Wing: constant 1.75 m chord, leading edge 0.45 m ahead of the CG, the
// glove adding up to 0.35 m at the root (gone 1.9 m out); root chord line
// low on the fuselage, 6° dihedral from the fuselage side; the chord
// pitched 10° nose-up in the reference frame (about the root leading edge);
// the tip cap from tipX to the 5.9 m half span.
export const PA36_WING = { rootX: 0.47, tipX: 5.7, half: 5.9, rootY: -0.47, le: 0.45, chord: 1.75, glove: 0.35, gloveX: 1.9, dih: Math.tan((6 * Math.PI) / 180), tilt: (-10 * Math.PI) / 180 };
const W = PA36_WING;
const wingYflat = (x) => W.rootY + Math.max(0, Math.abs(x) - W.rootX) * W.dih;
const gloveAt = (x) => W.glove * clamp(1 - (Math.abs(x) - W.rootX) / (W.gloveX - W.rootX), 0, 1);
// The wing's tilt about the root leading edge.
const WT = new THREE.Matrix4().makeTranslation(0, W.rootY, W.le)
  .multiply(new THREE.Matrix4().makeRotationX(W.tilt))
  .multiply(new THREE.Matrix4().makeTranslation(0, -W.rootY, -W.le));
const wv = (p) => new THREE.Vector3(...p).applyMatrix4(WT);
// Height of the wing's chord plane at span x and chord station z (reference frame).
export const pa36WingY = (x, z = W.le - 0.4 * W.chord) => wv([x, wingYflat(x), z]).y;
const AX = 0.3; // thrust line over the CG
const SPAN_UV = 5.95;
export const PA36_SHADOW = { W: 13.6, L: 9.8, wing: [5.9, -1.0, 0.45], fus: [0.5, -1.2, 3.6], tail: [1.8, -4.9, -4.3], core: [4.2, 2.4] };

// ---------------------------------------------------------------------------
// Paint schemes (same geometry): A — classic red (N57886 / VH-SVO /
// N44523: white, a red cheatline from the cowl widening into a red tail
// bottom, red fin cap, wing tips and spinner); B — yellow and blue (HA-MJG /
// TC-ZH: yellow, a broad blue band with dark pinstripes, a blue sash on the
// fin, blue wing stripes and tips, blue spinner). Both: black hopper top.
const WHITE = '#f1f1ec', RED = '#c6221b', YELLOW = '#f2c10c', BLUE = '#1d3b98', NAVY = '#101a36', BLACK = '#18191b';
export const PA36_LIVERIES = [
  { id: 'red', name: 'Classic red', base: WHITE, band: RED, pin: RED, deck: BLACK, cap: RED, tip: RED, gear: '#e6e7e2', wing: WHITE, spinner: RED, frame: WHITE, stab: WHITE, text: WHITE, mark: RED, seam: 'rgba(40,44,50,0.26)', rivet: 'rgba(40,44,50,0.2)' },
  { id: 'yellow', name: 'Yellow & blue', base: YELLOW, band: BLUE, pin: NAVY, deck: BLACK, cap: YELLOW, tip: BLUE, gear: YELLOW, wing: YELLOW, spinner: BLUE, frame: YELLOW, stab: YELLOW, text: WHITE, mark: BLUE, seam: 'rgba(60,50,20,0.28)', rivet: 'rgba(60,50,20,0.22)' },
];

// ---------------------------------------------------------------------------
// Fuselage sections. Each ring has four parts: the belly (a superellipse from
// the shoulder ys down to yb and back), the straight side from the shoulder
// to the sill sh (half width ws there), and the top cap from the sill over
// rounded corners (radius rc) to a top yt of half width wt. The cabin's body
// is the same ring cut at the sill, so the cowl/hopper, the cabin body and
// the turtledeck meet without a step.
const R_ = (z, hw, ys, yb, pL, sh, ws, yt, wt, rc) => ({ z, hw, ys, yb, pL, sh, ws, yt, wt, rc });
const RKEYS = ['z', 'hw', 'ys', 'yb', 'pL', 'sh', 'ws', 'yt', 'wt', 'rc'];
// Nose to the windshield (z = 2.45 − u, u metres behind the spinner tip on the
// plan; y = plan height over the thrust line + 0.30): the cowl face just
// round the spinner, deep below the shaft; the top one level line (≈ 0.5)
// back to the windshield; the underside falling to the wing.
const FWD_KEYS = [
  R_(2.09, 0.33, 0.2, -0.12, 2.3, 0.37, 0.31, 0.48, 0.26, 0.1),
  R_(1.96, 0.385, 0.18, -0.17, 2.6, 0.39, 0.365, 0.485, 0.31, 0.1),
  R_(1.7, 0.43, 0.15, -0.26, 3.0, 0.41, 0.41, 0.49, 0.36, 0.09),
  R_(1.3, 0.46, 0.12, -0.37, 3.2, 0.43, 0.445, 0.495, 0.39, 0.075),
  R_(0.85, 0.475, 0.1, -0.47, 3.4, 0.445, 0.46, 0.5, 0.41, 0.06),
  R_(0.25, 0.48, 0.08, -0.58, 3.6, 0.455, 0.465, 0.505, 0.415, 0.055),
  R_(-0.45, 0.48, 0.06, -0.68, 3.6, 0.46, 0.468, 0.51, 0.415, 0.05),
  R_(-0.93, 0.48, 0.05, -0.75, 3.6, 0.46, 0.468, 0.515, 0.415, 0.05),
];
// Under the cabin: the same sections, cut at the sill (the canopy stands on
// the top longerons: the side windows start at the fuselage top line).
const CAB_KEYS = [FWD_KEYS[FWD_KEYS.length - 1], R_(-1.45, 0.479, 0.05, -0.82, 3.6, 0.46, 0.468, 0.515, 0.415, 0.05), R_(-1.95, 0.476, 0.05, -0.855, 3.6, 0.46, 0.465, 0.515, 0.41, 0.05)];
// Behind the cabin (the photographs PH-AJB, VH-HLW, N44523 and N57728, not
// the model plan, which drew a long wedge and a low cone): the roof runs on
// 0.17 m past the cabin's rear frame over the rear glazing, the cabin's back
// falls steeply (≈ 45°) to a narrow, round-topped turtledeck 0.27 over the
// datum at z −2.8, and the spine then descends gently (≈ 13°) to the fin,
// whose leading edge leaves it at z ≈ −3.9 through a fillet. The cone is
// deep and narrow: vertical sides, a round top (radius up to 0.9 of the half
// width), the belly a superellipse; it tapers in plan from 0.95 m behind the
// cabin to the rudder post.
const spineY = (z) => 0.27 - 0.225 * (-2.8 - z); // straight spine behind z −2.8
const coneKey = (z, hw, yb) => {
  const yt = spineY(z), D = yt - yb, ws = hw * 0.97, ys = yb + 0.42 * D, sh = ys + 0.12 * D;
  return R_(z, hw, ys, yb, 3.0, sh, ws, yt, ws, Math.min(0.9 * ws, yt - sh));
};
const AFT_KEYS = [
  R_(-1.95, 0.476, 0.05, -0.855, 3.6, 0.46, 0.465, 0.9, 0.29, 0.1), // the cabin's rear frame (roof profile)
  R_(-2.12, 0.473, 0.04, -0.86, 3.6, 0.455, 0.46, 0.885, 0.28, 0.11), // the roof's end over the rear glazing
  R_(-2.3, 0.466, 0.02, -0.863, 3.5, 0.44, 0.455, 0.69, 0.455, 0.2),
  R_(-2.47, 0.457, -0.02, -0.866, 3.45, 0.3, 0.445, 0.5, 0.445, 0.18),
  R_(-2.65, 0.445, -0.1, -0.868, 3.4, 0.0, 0.43, 0.34, 0.43, 0.25),
  coneKey(-2.85, 0.428, -0.87), coneKey(-3.2, 0.372, -0.88), coneKey(-3.6, 0.305, -0.888), coneKey(-4.0, 0.242, -0.897),
  coneKey(-4.45, 0.163, -0.912), coneKey(-4.93, 0.055, -0.94),
];
const SILL_Y = 0.46, RAIL_Y = 0.8;
const ROOF = { yt: 0.9, zF: -1.33, zFc: 0.05, zR: -1.95 }; // front edge −1.33 at the centre, 5 cm further back at the rails
const WS = { z: -0.93, zc: 0.06 }; // windshield base on the deck, corners 6 cm aft
const BPOST = -1.8;
const CONE_END = -4.93;

const NSIDE = 4, NCAP = [3, 6, 4], NLOW = 22;
function capHalf(st) {
  // Left half of the top cap, from the sill point up to the top centre.
  const cx = Math.max(0.0005, st.wt - st.rc), cy = st.yt - st.rc;
  const dx = st.ws - cx, dy = st.sh - cy, d = Math.hypot(dx, dy);
  const a1 = Math.atan2(dy, dx) + Math.acos(clamp(st.rc / Math.max(d, 1e-6), -1, 1));
  const tp = [cx + Math.cos(a1) * st.rc, cy + Math.sin(a1) * st.rc];
  const pts = [];
  for (let i = 0; i < NCAP[0]; i++) pts.push([lerp(st.ws, tp[0], i / NCAP[0]), lerp(st.sh, tp[1], i / NCAP[0])]);
  for (let i = 0; i < NCAP[1]; i++) { const a = a1 + ((Math.PI / 2 - a1) * i) / NCAP[1]; pts.push([cx + Math.cos(a) * st.rc, cy + Math.sin(a) * st.rc]); }
  for (let i = 0; i <= NCAP[2]; i++) pts.push([cx * (1 - i / NCAP[2]), st.yt]);
  return pts;
}
const sideAt = (st, t) => [lerp(st.hw, st.ws, t) + 0.008 * Math.sin(Math.PI * t), lerp(st.ys, st.sh, t)];
// Full ring (closed): left shoulder → side → cap → right side → belly → back.
function ringR(st) {
  const left = [];
  for (let i = 0; i < NSIDE; i++) left.push(sideAt(st, i / NSIDE));
  left.push(...capHalf(st));
  const out = left.slice();
  out.push(...left.slice(0, -1).reverse().map(([x, y]) => [-x, y]));
  for (let i = 1; i < NLOW; i++) {
    const a = Math.PI + (Math.PI * i) / NLOW, c = Math.cos(a), s = Math.sin(a);
    out.push([st.hw * Math.sign(c) * Math.abs(c) ** (2 / st.pL), st.ys - (st.ys - st.yb) * Math.abs(s) ** (2 / st.pL)]);
  }
  out.push(out[0].slice());
  return out;
}
// Ring cut at the sill (cabin body): right sill → right side → belly → left side → left sill.
const iSillL = NSIDE, nLeft = NSIDE + NCAP[0] + NCAP[1] + NCAP[2] + 1;
const iSillR = 2 * nLeft - 2 - NSIDE;
function ringCut(st) {
  const full = ringR(st);
  return full.slice(iSillR).concat(full.slice(1, iSillL + 1));
}
function sampleR(keys, per) {
  const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  const out = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
    const n = Math.max(2, Math.round(Math.abs(k1.z - k2.z) * per));
    for (let j = 0; j < n; j++) { const t = j / n, st = {}; for (const p of RKEYS) st[p] = cr(k0[p], k1[p], k2[p], k3[p], t); out.push(st); }
  }
  out.push({ ...keys[keys.length - 1] });
  return out;
}
function loftRings(stations, ringFn, colorFn) {
  const pos = [], col = [], idx = [];
  let rl = 0;
  for (const st of stations) {
    const pts = ringFn(st);
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
// Half width of a section at height y.
function ringX(st, y) {
  if (y <= st.ys) {
    const s = clamp((st.ys - y) / (st.ys - st.yb), 0, 1) ** (st.pL / 2);
    return st.hw * Math.sqrt(Math.max(0, 1 - s * s)) ** (2 / st.pL);
  }
  if (y <= st.sh) return sideAt(st, (y - st.ys) / (st.sh - st.ys))[0];
  const cap = capHalf(st);
  for (let i = 1; i < cap.length; i++) if (cap[i][1] >= y) { const [x0, y0] = cap[i - 1], [x1, y1] = cap[i]; return lerp(x0, x1, (y - y0) / (y1 - y0 || 1)); }
  return 0;
}
const allKeys = FWD_KEYS.concat(CAB_KEYS.slice(1, -1), AFT_KEYS);
// The section at z (the cabin's cut sections up to the rear frame, then the turtledeck).
function stAt(z) {
  const keys = z > -1.95 ? FWD_KEYS.concat(CAB_KEYS.slice(1)) : AFT_KEYS;
  if (z >= keys[0].z) return keys[0];
  for (let i = 1; i < keys.length; i++) if (keys[i].z <= z) {
    const a = keys[i - 1], b = keys[i], f = (a.z - z) / (a.z - b.z || 1), st = {};
    for (const p of RKEYS) st[p] = lerp(a[p], b[p], f);
    return st;
  }
  return keys[keys.length - 1];
}
export const pa36HalfX = (z, y) => ringX(stAt(z), y);
const topY = (z) => stAt(z).yt;
void allKeys;

// ---------------------------------------------------------------------------
// Livery: side projection of the fuselage, fin and rudder.
const LV = { Z0: -5.9, Z1: 2.5, Y0: -1.0, Y1: 1.0, W: 2048, H: 1024, M: 6 };
LV.kx = LV.W / (LV.Z1 - LV.Z0);
LV.ky = (LV.H / 2 - 2 * LV.M) / (LV.Y1 - LV.Y0);
const lvPix = (side, z, y) => [side > 0 ? (LV.Z1 - z) * LV.kx : (z - LV.Z0) * LV.kx, (side > 0 ? 0 : LV.H / 2) + LV.M + (LV.Y1 - y) * LV.ky];
function liveryUV(geo) {
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const idx = geo.index;
  const sideOf = new Int8Array(p.count);
  // Side of each vertex by its own x (the seam on the centre line takes the
  // side of the triangles around it: centre-line vertices are on the top or
  // the belly, where both halves carry the same paint).
  for (let k = 0; k < p.count; k++) sideOf[k] = p.getX(k) >= 0 ? 1 : -1;
  void idx;
  for (let k = 0; k < p.count; k++) {
    const [px, py] = lvPix(sideOf[k], p.getZ(k), p.getY(k));
    uv[k * 2] = px / LV.W;
    uv[k * 2 + 1] = 1 - py / LV.H;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// The cheatline: its top edge along the side under the windows, level to
// the cabin; behind it the band widens downwards (the registration sits in
// it in white, N44523) and then runs down the cone under the spine, its
// lower edge reaching the belly at the tail (the tail bottom in the band
// colour).
const BAND_TOP = [[2.5, 0.31], [1.2, 0.31], [-0.9, 0.29], [-1.9, 0.27], [-2.5, 0.22], [-3.2, 0.06], [-3.8, -0.14], [-4.4, -0.38], [-5.2, -0.7]];
const BAND_LOW = [[2.5, 0.15], [1.2, 0.14], [-0.9, 0.11], [-1.9, -0.1], [-2.5, -0.17], [-3.2, -0.29], [-3.8, -0.47], [-4.4, -0.7], [-5.2, -1.0]];
const REG_AT = [-2.56, 0.0, 0.19]; // registration: centre z, y, letter height
const FIN_LE = [[-4.0, 0.0], [-5.087, 0.84]]; // fin leading edge root → top (reference frame)

function liveryTextures(reg, L = PA36_LIVERIES[0]) {
  const c = canvas(LV.W, LV.H), b = canvas(LV.W, LV.H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, LV.W, LV.H);
  orangePeel(gb, LV.W, LV.H, 91);
  const yellow = L.id === 'yellow';
  for (const side of [1, -1]) {
    const P = (z, y) => lvPix(side, z, y);
    const oy = side > 0 ? 0 : LV.H / 2;
    const path = (ctx, pts) => { ctx.beginPath(); pts.forEach(([z, y], i) => { const [px, py] = P(z, y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); };
    const poly = (pts, fill) => { path(g, pts); g.closePath(); g.fillStyle = fill; g.fill(); };
    const line = (ctx, pts, col, w) => { path(ctx, pts); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
    const off = (pts, dy) => pts.map(([z, y]) => [z, y + dy]);
    g.save();
    g.beginPath(); g.rect(0, oy, LV.W, LV.H / 2); g.clip();
    g.fillStyle = L.base; g.fillRect(0, oy, LV.W, LV.H / 2);
    // Black hopper top from the firewall to the windshield (the deck and
    // its rounded top corners).
    poly([[0.86, 0.445], [0.86, 1.0], [-0.95, 1.0], [-0.95, 0.445]], L.deck);
    // Cheatline (and, for B, the dark pinstripes either side of it).
    poly(BAND_TOP.concat(BAND_LOW.slice().reverse()), L.band);
    if (yellow) {
      line(g, off(BAND_TOP, 0.035), L.pin, 0.014 * LV.ky);
      line(g, off(BAND_TOP, 0.012), YELLOW, 0.01 * LV.ky);
      line(g, off(BAND_LOW.slice(0, 6), -0.03), L.pin, 0.012 * LV.ky);
      line(g, off(BAND_LOW.slice(0, 6), -0.06), BLUE, 0.02 * LV.ky);
    } else {
      line(g, off(BAND_TOP, 0.045), L.pin, 0.012 * LV.ky);
      line(g, off(BAND_LOW.slice(0, 6), -0.04), L.pin, 0.01 * LV.ky);
    }
    // Fin: A — red cap; B — the blue sash parallel to the leading edge.
    if (yellow) {
      // A band parallel to the leading edge, 0.3–0.52 m behind it, from the
      // fin root over the top.
      const [[za, ya], [zb, yb]] = FIN_LE;
      poly([[za - 0.3, ya], [zb - 0.3, yb + 0.3], [zb - 0.52, yb + 0.3], [za - 0.52, ya]], BLUE);
      line(g, [[za - 0.24, ya], [zb - 0.24, yb + 0.3]], NAVY, 0.012 * LV.ky);
      line(g, [[za - 0.58, ya], [zb - 0.58, yb + 0.3]], NAVY, 0.012 * LV.ky);
    } else {
      // The cap follows the sloping top, 0.14 deep.
      const [, [zt, yt]] = FIN_LE, capLow = [[-4.6, yt - 0.14], [zt, yt - 0.14], [-5.95, yt - 0.14 - 0.2 * (zt + 5.95)]];
      poly(capLow.concat([[-5.95, 1.0], [-4.6, 1.0]]), L.cap);
      line(g, off(capLow, -0.025), RED, 0.014 * LV.ky);
    }
    // Exhaust stain along the lower cowl, belly grime.
    {
      const [ax, ay] = P(1.35, -0.12), [bx] = P(-0.3, -0.16);
      const sg = g.createLinearGradient(ax, 0, bx, 0);
      sg.addColorStop(0, 'rgba(30,25,20,0.3)'); sg.addColorStop(1, 'rgba(30,25,20,0)');
      g.fillStyle = sg; g.beginPath(); g.ellipse((ax + bx) / 2, ay + 6, Math.abs(bx - ax) / 2, 0.08 * LV.ky, 0, 0, Math.PI * 2); g.fill();
      const [, belly] = P(0, -0.55);
      const grd = g.createLinearGradient(0, belly, 0, oy + LV.H / 2);
      grd.addColorStop(0, 'rgba(60,50,30,0)'); grd.addColorStop(1, 'rgba(60,50,30,0.2)');
      g.fillStyle = grd; g.fillRect(0, belly, LV.W, oy + LV.H / 2 - belly);
    }
    // Panel seams with rivet rows: cowl split and its rear edge, firewall,
    // the hopper side door, the door (left), the cabin's rear frame,
    // inspection panels down the cone, the rudder hinge.
    const seams = [
      [[2.0, 0.36], [0.87, 0.36]], [[0.87, -0.47], [0.87, 0.5]], [[1.96, -0.17], [1.96, 0.48]],
      [[0.6, -0.1], [0.6, 0.3], [-0.6, 0.3], [-0.6, -0.1], [0.6, -0.1]],
      [[-1.95, -0.85], [-1.95, 0.46]], [[-2.85, -0.87], [-2.85, 0.22]], [[-3.6, -0.89], [-3.6, 0.06]], [[-4.3, -0.9], [-4.3, -0.12]],
      [[0.87, -0.2], [-1.95, -0.32]], [[-1.95, -0.34], [-4.9, -0.75]],
    ];
    if (side < 0) seams.push([[-1.0, SILL_Y - 0.01], [-1.0, -0.22], [BPOST, -0.22], [BPOST, SILL_Y - 0.01]]); // the door (right)
    for (const s of seams) {
      line(g, s, L.seam, 2);
      line(gb, s, '#3c3c3c', 2.6);
      for (let q = 0; q < s.length - 1; q++) {
        const [[za, ya], [zb, yb]] = [s[q], s[q + 1]];
        const n = Math.max(2, Math.round(Math.hypot(za - zb, ya - yb) / 0.06));
        for (let k = 0; k <= n; k++) {
          const [px, py] = P(za + ((zb - za) * k) / n + 0.02, ya + ((yb - ya) * k) / n);
          g.fillStyle = L.rivet; g.fillRect(px - 1, py - 1, 2, 2);
          gb.fillStyle = '#5c5c5c'; gb.beginPath(); gb.arc(px, py, 1.3, 0, Math.PI * 2); gb.fill();
        }
      }
    }
    // Cowl fasteners along the split, louvres on the lower cowl.
    for (let k = 0; k < 7; k++) {
      const [px, py] = P(1.85 - k * 0.15, 0.36);
      gb.fillStyle = '#2e2e2e'; gb.beginPath(); gb.arc(px, py, 3, 0, Math.PI * 2); gb.fill();
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.arc(px, py, 2.4, 0, Math.PI * 2); g.fill();
    }
    for (let k = 0; k < 6; k++) line(g, [[1.5 - k * 0.06, -0.24], [1.47 - k * 0.06, -0.33]], 'rgba(0,0,0,0.4)', 3);
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
    // Registration in white in the band behind the cabin (N44523), the
    // BRAVE 300 badge on the cowl above the cheatline, the RESTRICTED
    // placard under the door window.
    text(REG_AT[0], REG_AT[1], reg, REG_AT[2], L.text, 'bold', 1.0);
    // (Read nose-first on the left, tail-first on the right.)
    const [bz, tz] = side > 0 ? [1.62, 1.3] : [1.38, 1.7];
    text(bz, 0.39, 'BRAVE', 0.055, BLACK, 'bold');
    text(tz, 0.39, '300', 0.06, yellow ? BLUE : RED, 'italic bold');
    text(-1.4, 0.36, 'RESTRICTED', 0.034, BLACK, 'bold');
    speckle(g, 0, oy, LV.W, LV.H / 2, 2600, side > 0 ? 61 : 62, 0.08);
    g.restore();
  }
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}

// Wing skin: u = span / SPAN_UV; the canvas's top half is the upper
// surface, the bottom half the lower surface, each from the gloved leading
// edge (chord fraction −0.25) down to the trailing edge (see wingUV).
const WV0 = -0.25;
const wingG = (f) => clamp((f - WV0) / (1 - WV0), 0, 1);
const wingUV = (geo, n) => {
  // Profile points per station: the first half on the upper surface.
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) { const g = wingG(uv.getY(i)); uv.setY(i, i % n < n / 2 ? 1 - 0.5 * g : 0.5 - 0.5 * g); }
  return geo;
};
function wingTextures(L = PA36_LIVERIES[0]) {
  const Wd = 2048, H = 1024;
  const c = canvas(Wd, H), b = canvas(Wd, H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  g.fillStyle = L.wing; g.fillRect(0, 0, Wd, H);
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, Wd, H);
  orangePeel(gb, Wd, H, 93);
  const X = (m) => (m / SPAN_UV) * Wd;
  const YU = (f) => 0.5 * wingG(f) * H, YL = (f) => (0.5 + 0.5 * wingG(f)) * H, Y = YU;
  if (L.id === 'red') {
    // Red tip panels (top and bottom) and the red flash over the root of
    // the upper surface, from the glove back to mid-chord and out to a
    // point on the leading edge (VH-SVO).
    g.fillStyle = RED; g.fillRect(X(5.35), 0, Wd, H);
    g.beginPath(); g.moveTo(0, YU(WV0)); g.lineTo(X(2.8), YU(0.02)); g.lineTo(X(1.6), YU(0.2)); g.lineTo(X(0.9), YU(0.42)); g.lineTo(0, YU(0.48)); g.closePath(); g.fill();
  } else {
    // Two blue stripes slanting across the outer upper panel, the blue tips.
    for (const [x0, w] of [[4.55, 0.22], [4.95, 0.08]]) {
      g.fillStyle = BLUE;
      g.beginPath(); g.moveTo(X(x0), YU(WV0)); g.lineTo(X(x0 + w), YU(WV0)); g.lineTo(X(x0 + w - 0.55), YU(1)); g.lineTo(X(x0 - 0.55), YU(1)); g.closePath(); g.fill();
    }
    g.fillStyle = BLUE; g.fillRect(X(5.62), 0, Wd, H);
  }
  const r = rng(53);
  for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(80,80,70,${0.02 + r() * 0.035})`; g.fillRect(r() * Wd, YU(0.1 + r() * 0.8), 2 + r() * 3, 15 + r() * 55); }
  for (const Yq of [YU, YL]) for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(60,48,30,${0.06 + r() * 0.12})`; g.fillRect(r() * Wd, Yq(r() * 0.05), 1 + r() * 2, 1 + r() * 2); }
  const seam = (x0, y0, x1, y1) => {
    g.strokeStyle = L.seam; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    gb.strokeStyle = '#3e3e3e'; gb.lineWidth = 2.6; gb.beginPath(); gb.moveTo(x0, y0); gb.lineTo(x1, y1); gb.stroke();
    const n = Math.max(2, Math.round(Math.hypot((x1 - x0) / (Wd / SPAN_UV), ((y1 - y0) / (0.5 * H)) * W.chord) / 0.06));
    for (let k = 0; k <= n; k++) {
      const px = x0 + ((x1 - x0) * k) / n + 0.5, py = y0 + ((y1 - y0) * k) / n + 3;
      gb.fillStyle = '#5c5c5c'; gb.beginPath(); gb.arc(px, py, 1.3, 0, Math.PI * 2); gb.fill();
      g.fillStyle = L.rivet; g.fillRect(px - 1, py - 1, 2, 2);
    }
  };
  for (const Yq of [YU, YL]) {
    for (const f of [0.12, 0.3, 0.72]) seam(X(0.5), Yq(f), X(5.7), Yq(f));
    for (let x = 0.95; x < 5.6; x += 0.5) seam(X(x), Yq(0.0), X(x), Yq(0.74));
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, Yq(0.742), Wd, 3);
    gb.fillStyle = '#202020'; gb.fillRect(0, Yq(0.742), Wd, 4);
  }
  // Wing tank bay on the upper surface (both wings).
  g.strokeStyle = L.seam; g.lineWidth = 2; g.strokeRect(X(1.3), YU(0.16), X(1.2), YU(0.46) - YU(0.16));
  gb.strokeStyle = '#383838'; gb.lineWidth = 2.6; gb.strokeRect(X(1.3), YU(0.16), X(1.2), YU(0.46) - YU(0.16));
  speckle(g, 0, 0, Wd, H, 2400, 59, 0.07);
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}

// Wing panel with one profile per station (the glove: the fixed part runs
// from the gloved leading edge to the same hinge line all along the span).
function wingPanelVar(stations, profs, side, ao) {
  const pos = [], uv = [], col = [], idx = [];
  const n = profs[0].length;
  stations.forEach((s, si) => {
    profs[si].forEach(([xc, yc], k) => {
      const lower = k >= n / 2;
      pos.push(side * s.x, s.y + yc * s.chord, s.le - xc * s.chord);
      uv.push(s.x / SPAN_UV, (W.le - (s.le - xc * s.chord)) / W.chord);
      const gq = (lower ? 0.8 : 1) * (ao ? ao(s.x, xc, lower) : 1);
      col.push(gq, gq, gq);
    });
  });
  for (let si = 0; si < stations.length - 1; si++) for (let k = 0; k < n; k++) {
    const a = si * n + k, b = si * n + ((k + 1) % n), c = a + n, d = b + n;
    if (side > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const cap = (si, outer) => { const base = si * n; for (let k = 1; k < n - 1; k++) { const tri = [base, base + k, base + k + 1]; if ((side > 0) === outer) idx.push(tri[0], tri[2], tri[1]); else idx.push(...tri); } };
  cap(0, false); cap(stations.length - 1, true);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return wingUV(geo, n);
}
const pa36WingPanel = (stations, prof, side, ao) => {
  const g = wingPanel(stations, prof, side, ao);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * WING_SPAN_UV) / SPAN_UV);
  return wingUV(g, prof.length);
};

// Hartzell blade (+X): wider towards 70 % radius ("paddle"), rounded tip.
function bladeLoft(r0, r1, steps, R) {
  const pos = [], idx = [];
  let n = 0;
  for (let i = 0; i <= steps; i++) {
    const r = r0 + ((r1 - r0) * i) / steps;
    const f = clamp((r - 0.16) / (R - 0.16), 0, 1);
    let c = 0.11 + 0.1 * Math.sin(Math.PI * Math.min(1, f * 0.82 + 0.1)) ** 0.8;
    if (f > 0.9) c *= 1 - ((f - 0.9) / 0.1) ** 2 * 0.7;
    const t = lerp(0.26, 0.07, f);
    const beta = Math.atan(1.85 / (2 * Math.PI * Math.max(r, 0.2)));
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

// Overall dimensions (tests): span, spinner tip, rudder trailing edge, the
// high points (roof, fin top), all in the reference frame.
export const PA36_DIM = { spinnerZ: 2.45, rudderZ: -5.75, roofY: ROOF.yt, finTopY: 0.84, ground: GROUND };
export function pa36Extent() {
  return { span: 2 * W.half, length: PA36_DIM.spinnerZ - PA36_DIM.rudderZ, tops: [[0, ROOF.yt, -1.7], [0, PA36_DIM.finTopY, -5.05]].map(pa36ToBody), height: Math.max(ROOF.yt, PA36_DIM.finTopY) - GROUND };
}
// Cabin anchors (reference frame): the pilot's eye and the cockpit's parts
// (pa36Cockpit.js builds on them; the door is on the right, as on the
// cockpit reference).
export const PA36_CABIN = {
  eye: [0, 0.645, -1.72], seat: [0, -0.27, -1.75], panel: [-0.012, 0.4825, -1.082], lowerPanel: [0, 0.25, -1.115], floorY: -0.42,
  stick: [0, -0.5, -1.27], pedals: [0, -0.36, -0.8], throttle: [0.395, -0.06, -1.36],
  door: [-0.47, 0.2, -1.4], windshield: [0, 0.7, -1.12], roof: [0, ROOF.yt, -1.64],
  sill: SILL_Y, rail: RAIL_Y, wsBaseZ: WS.z, roofFrontZ: ROOF.zF, rearFrameZ: ROOF.zR, bPost: BPOST,
};

// ==========================================================================
export function createPA36Model(panel, opts = {}) {
  const root = new THREE.Group();
  root.name = 'pa36';
  let REG = opts.reg ?? 'PR-PWB', livery = 0;
  const L0 = PA36_LIVERIES[0];
  const liv = liveryTextures(REG, L0);
  const wtx = wingTextures(L0);
  const coat = { roughness: 0.42, metalness: 0.0, specularIntensity: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.26, envMap: opts.envMap ?? null, envMapIntensity: 0.35 };
  const ALB = 0.86;
  const col = (cc) => new THREE.Color(cc).multiplyScalar(ALB);
  const phys = (cc, extra = {}) => new THREE.MeshPhysicalMaterial({ color: col(cc), vertexColors: true, ...coat, ...extra });
  const M = {
    livery: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALB), map: liv.map, bumpMap: liv.bump, bumpScale: 1.3, vertexColors: true, ...coat }),
    wing: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALB), map: wtx.map, bumpMap: wtx.bump, bumpScale: 1.3, vertexColors: true, ...coat }),
    stab: phys(L0.stab), frame: phys(L0.frame), tip: phys(L0.tip), gear: phys(L0.gear, { roughness: 0.5 }), spinner: phys(L0.spinner, { clearcoat: 0.5 }),
    deck: phys(BLACK, { roughness: 0.7, clearcoat: 0.1 }),
    ink: new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.6, vertexColors: true }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.62, metalness: 0.1, vertexColors: true }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.28, metalness: 0.92, vertexColors: true }),
    steel: new THREE.MeshStandardMaterial({ color: 0x5c6166, roughness: 0.42, metalness: 0.85, vertexColors: true }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd6d8da, roughness: 0.18, metalness: 1.0, envMap: opts.envMap ?? null, envMapIntensity: 0.9, vertexColors: true }),
    exhaust: new THREE.MeshStandardMaterial({ color: 0x8b8178, roughness: 0.45, metalness: 0.85, vertexColors: true }),
    soot: new THREE.MeshStandardMaterial({ color: 0x2c2722, roughness: 0.7, metalness: 0.6, vertexColors: true }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.94, vertexColors: true }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92, metalness: 0, bumpMap: treadTexture(), bumpScale: 2.5 }),
    hub: new THREE.MeshStandardMaterial({ color: 0xdadcdc, roughness: 0.35, metalness: 0.5, vertexColors: true }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xa8bcc6, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.17, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5, depthWrite: false, side: THREE.DoubleSide }),
    tint: new THREE.MeshPhysicalMaterial({ color: 0x1c3a3a, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.72, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false }),
    red: new THREE.MeshStandardMaterial({ color: 0xc8261b, roughness: 0.45, emissive: 0x330000, vertexColors: true }),
    green: new THREE.MeshStandardMaterial({ color: 0x1f9a3a, roughness: 0.45, emissive: 0x002200, vertexColors: true }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xf2c21b, roughness: 0.45, vertexColors: true }),
    orange: new THREE.MeshStandardMaterial({ color: 0xf0561c, roughness: 0.5 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb8913c, roughness: 0.35, metalness: 0.9, vertexColors: true }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35, emissive: 0x222222, vertexColors: true }),
    beacon: new THREE.MeshStandardMaterial({ color: 0xd8261b, roughness: 0.3, emissive: 0xff2010, emissiveIntensity: 0, vertexColors: true }),
    strobe: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.2, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true }),
    // The pilot figure.
    suit: new THREE.MeshStandardMaterial({ color: 0x4a5462, roughness: 0.88 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.75 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xb88462, roughness: 0.7 }),
    helmet: new THREE.MeshPhysicalMaterial({ color: 0xeeeae2, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x15181c, roughness: 0.05, metalness: 0.3, clearcoat: 1 }),
    helmStripe: new THREE.MeshPhysicalMaterial({ color: 0xc4261c, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    harness: new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.8 }),
  };
  const B = {};
  const add = (mat, geo, fine = false) => { const k = (fine ? 'fine:' : '') + mat; (B[k] ||= []).push(tagged(geo)); };

  // ---------------- fuselage ----------------
  const fusAO = (x, y, z) => {
    let a = 1 - Math.max(0, -y - 0.35) * 0.45;
    const yb = Math.max(0, 1 - Math.abs(y - (W.rootY - 0.12)) / 0.22), zb = Math.max(0, 1 - Math.abs(z + 0.4) / 1.2);
    a *= 1 - 0.3 * yb * Math.sqrt(zb);
    if (z < -4.0 && z > -5.0) a *= 1 - 0.2 * Math.max(0, 1 - Math.abs(y + 0.56) / 0.12);
    if (z > 1.95) a *= 0.8 + 0.2 * clamp((2.09 - z) / 0.14, 0, 1);
    return clamp(a, 0.5, 1);
  };
  const fwdSt = sampleR(FWD_KEYS, 20);
  const cabSt = sampleR(CAB_KEYS, 10);
  const aftSt = sampleR(AFT_KEYS, 14);
  add('livery', liveryUV(loftRings(fwdSt, ringR, fusAO)));
  add('livery', liveryUV(loftRings(cabSt, ringCut, fusAO)));
  add('livery', liveryUV(loftRings(aftSt, ringR, fusAO)));
  {
    // Cone end at the rudder hinge, closed.
    const st = aftSt[aftSt.length - 1];
    const cap = new THREE.ShapeGeometry(new THREE.Shape(ringR(st).slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y))));
    cap.scale(-1, 1, 1); cap.translate(0, 0, st.z);
    add('livery', liveryUV(cap));
  }
  // Cowl face between the lip and the spinner (the shaft high in it): the
  // two round cooling inlets low either side, the carburettor-air scoop and
  // the oil cooler opening under the shaft.
  const lip = fwdSt[0], SPZ = 2.11;
  add('frame', tagged(grid((u, v) => {
    const ring = ringR(lip), n = ring.length - 1;
    const f = u * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
    const [ox, oy] = [lerp(ring[i][0], ring[i + 1][0], t), lerp(ring[i][1], ring[i + 1][1], t)];
    const ang = Math.atan2(oy - AX, ox);
    const ix = Math.cos(ang) * 0.16, iy = AX + Math.sin(ang) * 0.16;
    return [lerp(ox, ix, v), lerp(oy, iy, v), lerp(lip.z, SPZ - 0.01, v ** 1.3)];
  }, ringR(lip).length - 1, 4, [0, AX, 1.0]))); // one column per lip vertex: no T-junctions with the loft
  for (const sx of [1, -1]) {
    // Round inlets (HA-MJG / TC-ZH): dark discs with a lip.
    const p = [sx * 0.19, 0.06, 2.1];
    add('dark', tx(new THREE.CircleGeometry(0.085, 22), ...p));
    add('frame', tx(new THREE.TorusGeometry(0.087, 0.012, 6, 22), ...p));
  }
  add('dark', rbox(0.2, 0.06, 0.03, 0.012, 0, -0.06, 2.095)); // oil cooler opening
  // Exhaust stacks, low on both sides, straight back (TC-ZH: the black stub).
  for (const sx of [1, -1]) {
    const x0 = sx * (pa36HalfX(1.45, -0.18) - 0.02);
    add('exhaust', rod([x0, -0.18, 1.45], [x0 + sx * 0.08, -0.2, 1.38], 0.034, 12));
    add('exhaust', rod([x0 + sx * 0.08, -0.2, 1.38], [x0 + sx * 0.09, -0.21, 1.12], 0.033, 12));
    add('soot', tx(new THREE.CircleGeometry(0.029, 14), x0 + sx * 0.09, -0.21, 1.115, 0, Math.PI));
  }
  // Hopper lid on the black deck ahead of the windshield, its hinges and the
  // loading door's latch; the hopper's sight gauge on the right side.
  {
    const lz = -0.05, lw = 0.62, ld = 0.95;
    add('deck', rbox(lw, 0.03, ld, 0.012, 0, topY(lz) + 0.01, lz));
    add('dark', rbox(lw + 0.05, 0.016, ld + 0.05, 0.008, 0, topY(lz) - 0.002, lz));
    for (const sx of [1, -1]) add('steel', tx(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 8), sx * 0.2, topY(lz) + 0.03, lz + ld / 2 - 0.05, 0, 0, Math.PI / 2), true);
    add('alu', rbox(0.12, 0.04, 0.06, 0.01, 0, topY(lz) + 0.04, lz - ld / 2 + 0.05), true);
    const sx = -pa36HalfX(0.2, 0.25);
    add('lens', rbox(0.012, 0.32, 0.05, 0.004, sx - 0.003, 0.15, 0.2), true);
  }
  // Loading coupler (left side, under the wing root) and the gatebox under
  // the hopper.
  { const cx = pa36HalfX(-0.2, -0.35);
    add('dark', tx(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 18), cx, -0.35, -0.2, 0, 0, Math.PI / 2));
    add('brass', tx(new THREE.CylinderGeometry(0.045, 0.045, 0.025, 18), cx + 0.045, -0.35, -0.2, 0, 0, Math.PI / 2)); }
  add('dark', rbox(0.36, 0.08, 0.46, 0.02, 0, -0.66, -0.35));

  // ---------------- cabin ----------------
  // Windshield from the deck (its corners down the deck's rounded edges to
  // the sill) up to the roof's front edge; the side glass from the A-post to
  // the rear frame (door to the B-post, the rear window behind it); the flat
  // roof with a tinted panel; frames in the scheme's colour.
  const stWS = FWD_KEYS[FWD_KEYS.length - 1], stRear = AFT_KEYS[0];
  const capWS = capHalf(stWS), capR = capHalf(stRear);
  const wsProfile = capWS.concat(capWS.slice(0, -1).reverse().map(([x, y]) => [-x, y])); // left sill → top → right sill
  const railX = ringX(stRear, RAIL_Y);
  const roofProfile = (() => {
    const half = [[railX, RAIL_Y], ...capR.filter(([, y]) => y > RAIL_Y)];
    return half.concat(half.slice(0, -1).reverse().map(([x, y]) => [-x, y]));
  })();
  const atProfile = (prof, u) => {
    const Ls = [0];
    for (let i = 1; i < prof.length; i++) Ls.push(Ls[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
    const tt = clamp(u, 0, 1) * Ls[Ls.length - 1];
    let i = 1; while (i < Ls.length - 1 && Ls[i] < tt) i++;
    const f = (tt - Ls[i - 1]) / (Ls[i] - Ls[i - 1] || 1);
    return [lerp(prof[i - 1][0], prof[i][0], f), lerp(prof[i - 1][1], prof[i][1], f)];
  };
  const wsBase = (u) => { const [x, y] = atProfile(wsProfile, u); return [x, y + 0.004, WS.z - WS.zc * (2 * u - 1) ** 2]; };
  const roofEdge = (u) => { const [x, y] = atProfile(roofProfile, u); return [x, y, ROOF.zF - ROOF.zFc * (2 * u - 1) ** 2]; };
  const roofRear = (u) => { const [x, y] = atProfile(roofProfile, u); return [x, y, ROOF.zR]; };
  const sillX = (z) => ringX(stAt(Math.max(z, -1.95)), SILL_Y);
  const aPost = (v) => lerp3(wsBase(0), roofEdge(0), v); // left A-post (sill → rail)
  const sideGlass = (sx, u, v, z1) => {
    const zf = lerp(wsBase(0)[2], roofEdge(0)[2], v);
    const z = lerp(zf, z1, u), y = lerp(SILL_Y, RAIL_Y, v);
    return [sx * lerp(sillX(z), railX, v), y, z];
  };
  const ROOF_CROWN = 0.03;
  add('livery', liveryUV(tagged(grid((u, v) => { const p = lerp3(roofEdge(u), roofRear(u), v); p[1] += ROOF_CROWN * Math.sin(Math.PI * v) * Math.max(0, 1 - (p[0] / railX) ** 2); return p; }, 24, 8, [0, 0.5, -1.6]))));
  add('tint', grid((u, v) => { const p = lerp3(roofEdge(0.2 + 0.6 * u), roofRear(0.2 + 0.6 * u), 0.08 + 0.45 * v); p[1] += ROOF_CROWN * Math.sin(Math.PI * (0.08 + 0.45 * v)) * Math.max(0, 1 - (p[0] / railX) ** 2) + 0.004; return p; }, 8, 4, [0, 0.5, -1.6]));
  const glassG = [];
  glassG.push(grid((u, v) => lerp3(wsBase(u), roofEdge(u), v), 24, 8));
  for (const sx of [1, -1]) {
    glassG.push(grid((u, v) => sideGlass(sx, u, v, BPOST), 10, 6));
    glassG.push(grid((u, v) => sideGlass(sx, u, v, ROOF.zR + 0.01), 3, 6));
  }
  // Frame tubes, their open ends closed by a ball.
  const fr = (pts, r) => { add('frame', tube(pts, r, Math.max(6, pts.length * 3), 8)); for (const e of [pts[0], pts[pts.length - 1]]) add('frame', ball(e, r, 8)); };
  const NF = 18;
  fr(Array.from({ length: NF + 1 }, (_, i) => wsBase(i / NF)), 0.014);
  fr(Array.from({ length: NF + 1 }, (_, i) => roofEdge(i / NF)), 0.018);
  fr(Array.from({ length: NF + 1 }, (_, i) => roofRear(i / NF)), 0.016);
  for (const sx of [1, -1]) {
    const ap0 = sx > 0 ? wsBase(0) : wsBase(1), ap1 = sx > 0 ? roofEdge(0) : roofEdge(1);
    fr([ap0, lerp3(ap0, ap1, 0.5), ap1], 0.021); // A-post
    fr([[sx * sillX(BPOST), SILL_Y, BPOST], [sx * railX, RAIL_Y, BPOST]], 0.019); // B-post
    fr([ap1, [sx * railX, RAIL_Y, ROOF.zR]], 0.014); // roof rail
    fr([ap0, [sx * sillX(-1.4), SILL_Y, -1.4], [sx * sillX(ROOF.zR), SILL_Y, ROOF.zR]], 0.013); // sill
    fr([[sx * railX, RAIL_Y, ROOF.zR], [sx * sillX(ROOF.zR), SILL_Y, ROOF.zR]], 0.016); // rear frame
  }
  void aPost;
  // The cabin's back (behind the rear frame, over the bulkhead): quarter
  // windows either side, from the rear frame to the sloping rear edge that
  // runs from the roof's end down to the sill line, and the rear window on
  // the steep back — tinted glass laid on the skin (the bulkhead stands in
  // front of it, so nothing behind needs to be seen), framed.
  {
    const QW = { z0: ROOF.zR - 0.012, zt: -2.1, zb: -2.42, y0: SILL_Y + 0.02, y1: RAIL_Y - 0.012 };
    const qRear = (y) => lerp(QW.zb, QW.zt, (y - QW.y0) / (QW.y1 - QW.y0));
    const onSide = (sx, z, y, off) => [sx * (pa36HalfX(z, y) + off), y, z];
    for (const sx of [1, -1]) {
      add('tint', grid((u, v) => { const y = lerp(QW.y0, QW.y1, v); return onSide(sx, lerp(QW.z0, qRear(y), u), y, 0.005); }, 4, 4));
      const edge = Array.from({ length: 7 }, (_, i) => { const y = lerp(QW.y0 - 0.012, QW.y1 + 0.012, i / 6); return onSide(sx, qRear(y) - 0.012, y, 0.012); });
      fr(edge, 0.013);
      fr([onSide(sx, QW.z0, QW.y1 + 0.012, 0.012), onSide(sx, QW.zt - 0.012, QW.y1 + 0.012, 0.012)], 0.012);
    }
    // Height of the skin's top at (z, |x|): the section's cap.
    const capY = (z, x) => {
      const cap = capHalf(stAt(z));
      for (let i = 1; i < cap.length; i++) if (cap[i][0] <= x) { const [x0, y0] = cap[i - 1], [x1, y1] = cap[i]; return lerp(y0, y1, (x - x0) / (x1 - x0 || 1)); }
      return cap[cap.length - 1][1];
    };
    const RWz = [-2.15, -2.46], RWx = 0.24;
    add('tint', grid((u, v) => { const z = lerp(RWz[0], RWz[1], v), hx = RWx * (1 - 0.25 * v), x = lerp(-hx, hx, u); return [x, capY(z, Math.abs(x)) + 0.006, z]; }, 6, 6));
    const rim = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, side = t < 0.25 ? 0 : t < 0.5 ? 1 : t < 0.75 ? 2 : 3, f = (t * 4) % 1;
      const [u, v] = [[f, 0], [1, f], [1 - f, 1], [0, 1 - f]][side];
      const z = lerp(RWz[0], RWz[1], v), hx = (RWx + 0.012) * (1 - 0.25 * v), x = lerp(-hx, hx, u);
      rim.push([x, capY(z, Math.abs(x)) + 0.008, z]);
    }
    add('frame', tube(rim, 0.009, 96, 6));
  }
  // Door (right, as on the cockpit reference): outside handle, hinges on
  // its front frame.
  {
    const dx = (y, z) => -(pa36HalfX(z, y) + 0.004);
    add('steel', rod([dx(0.2, -1.66) - 0.026, 0.2, -1.66], [dx(0.2, -1.52) - 0.026, 0.2, -1.52], 0.01, 6), true);
    for (const hy of [-0.1, 0.3]) add('steel', tx(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), dx(hy, -1.02), hy, -1.02), true);
  }
  // Wire cutter up the windshield's centre (from the deck to above the roof
  // front), the cable from its top to the fin top (TC-ZH / N44523), a whip
  // antenna and the GPS antenna on the roof.
  const cutterTop = [0, ROOF.yt + 0.12, ROOF.zF + 0.03];
  // (The cutter is a blade edge-on to the airflow: thin across, deep
  // fore and aft.)
  add('steel', bar([0, topY(-0.7) + 0.02, -0.7], [0, 0.72, -1.15], 0.012, 0.05));
  add('steel', bar([0, 0.72, -1.15], cutterTop, 0.012, 0.04));
  add('ink', rod(cutterTop, [0, PA36_DIM.finTopY + 0.03, -5.08], 0.0035, 4), true);
  add('white', rod([0, ROOF.yt, -1.85], [0, ROOF.yt + 0.34, -2.12], 0.006, 5), true);
  add('dark', rbox(0.14, 0.04, 0.2, 0.02, 0, ROOF.yt + 0.025, -1.72), true);
  add('white', tx(new THREE.SphereGeometry(0.055, 12, 8), 0, ROOF.yt + 0.035, -1.72, 0, 0, 0, [1, 0.6, 1.3]), true);

  // ---------------- wing ----------------
  const zHinge = W.le - 0.75 * W.chord;
  const st = (x) => ({ x, y: wingYflat(x), le: W.le + gloveAt(x), chord: W.chord + gloveAt(x) });
  const profFor = (s) => airfoil(0, (s.le - zHinge) / s.chord - 0.004, 0.15, 0.03, 0.4, 18);
  const aftProf = airfoil(0.756, 1.0, 0.15, 0.03, 0.4, 6), fullProf = airfoil(0, 1, 0.15, 0.03, 0.4, 18);
  const wingAO = (x, xc, lower) => (lower ? 1 : 1 - 0.22 * Math.max(0, 1 - (x - 0.5) / 0.6));
  const flaps = [], ailerons = [];
  const hingeP = (side, x) => wv([side * x, wingYflat(x) + 0.03, zHinge]);
  const surfaceMesh = (geo, x0, x1, side) => {
    geo.applyMatrix4(WT);
    const a = hingeP(side, x0), b = hingeP(side, x1);
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
  const FLAP = [0.55, 3.1], AIL = [3.15, 5.65];
  const TIP = [[0, 0, 0, 0], [0.08, 0.004, -0.006, -0.02], [0.14, 0.01, -0.03, -0.09], [0.18, 0.018, -0.09, -0.3], [0.2, 0.026, -0.24, -0.85]];
  const y0T = wingYflat(W.tipX);
  const tipSt = TIP.map(([dx, dy, dle, dc]) => ({ x: W.tipX + dx, y: y0T + dy, le: W.le + dle, chord: W.chord + dc }));
  const addW = (mat, geo, fine) => { geo.applyMatrix4(WT); add(mat, geo, fine); };
  for (const side of [1, -1]) {
    const xs = [0.3, W.rootX, 0.8, 1.2, 1.6, W.gloveX, 2.8, 3.8, 4.8, W.tipX];
    const sts = xs.map(st);
    addW('wing', wingPanelVar(sts, sts.map(profFor), side, wingAO));
    for (const [a, b] of [[0.3, FLAP[0]], [FLAP[1], AIL[0]], [AIL[1], W.tipX]]) addW('wing', pa36WingPanel([{ ...st(a), le: W.le, chord: W.chord }, { ...st(b), le: W.le, chord: W.chord }], aftProf, side, wingAO));
    {
      // Tip cap: the underside sweeps up (the plan's note), the corners rounded.
      const tg = pa36WingPanel(tipSt, fullProf, side, wingAO), tp = tg.attributes.position;
      for (let i = 0; i < tp.count; i++) {
        const dx = Math.abs(tp.getX(i)) - W.tipX, t = clamp(dx / 0.2, 0, 1);
        const cy = wingYflat(W.tipX) + 0.026 * t;
        if (tp.getY(i) < cy) tp.setY(i, cy + (tp.getY(i) - cy) * (1 - 0.7 * t * t));
      }
      tg.computeVertexNormals();
      addW('wing', tg);
    }
    const sec = (x) => ({ x, y: wingYflat(x), le: W.le, chord: W.chord });
    flaps.push(surfaceMesh(pa36WingPanel([FLAP[0], 1.8, FLAP[1]].map(sec), aftProf, side, wingAO), FLAP[0], FLAP[1], side));
    ailerons.push(surfaceMesh(pa36WingPanel([AIL[0], 4.4, AIL[1]].map(sec), aftProf, side), AIL[0], AIL[1], side));
    // Nav light and strobe in the tip cap.
    const tl = tipSt[tipSt.length - 2];
    const navP = wv([side * (tl.x + 0.02), tl.y + 0.015, tl.le - 0.06]).toArray();
    add(side > 0 ? 'red' : 'green', ball(navP, 0.022, 10));
    add('lens', tx(new THREE.SphereGeometry(0.042, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), ...navP, 0, 0, side * Math.PI / 2, [1, 1, 1.3]));
    add('strobe', ball(wv([side * (tl.x + 0.01), tl.y + 0.01, tl.le - tl.chord + 0.08]).toArray(), 0.016, 8));
    // Root fillet along the fuselage side (over the glove's upper surface).
    const sR = st(W.rootX);
    const fil = profFor(sR).slice(0, 19).map(([xc, yc]) => { const p = wv([side * W.rootX, sR.y + yc * sR.chord + 0.008, sR.le - xc * sR.chord]); return [side * (pa36HalfX(p.z, p.y) - 0.004), p.y, p.z]; });
    add('wing', tube(fil, 0.03, 30, 10));
    for (const e of [fil[0], fil[fil.length - 1]]) add('wing', ball(e, 0.03, 8));
    // Walkway (left root), wing tank filler, hinge brackets.
    if (side > 0) {
      const up = fullProf.slice(0, 19).filter(([xc]) => xc > 0.15 && xc < 0.62);
      const sheet = up.map(([xc, yc]) => [xc, yc + 0.004]).concat(up.slice().reverse().map(([xc, yc]) => [xc, yc + 0.0005]));
      addW('dark', pa36WingPanel([0.55, 0.8, 1.05].map(sec), sheet, side));
    }
    const fx = 1.9;
    add('dark', tx(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 18), ...wv([side * fx, wingYflat(fx) + 0.135, W.le - 0.3 * W.chord]).toArray(), W.tilt, 0, side * Math.atan(W.dih)));
    for (const hx of [1.0, 2.0, 3.0, 3.9, 4.8, 5.55]) {
      const h = hingeP(side, hx);
      add('frame', tx(new THREE.BoxGeometry(0.02, 0.05, 0.09), h.x, h.y - 0.075, h.z + 0.02, W.tilt, 0, side * Math.atan(W.dih)), true);
    }
  }
  add('steel', rod(wv([4.2, wingYflat(4.2) - 0.08, 0.2]).toArray(), wv([4.2, wingYflat(4.2) - 0.08, 0.7]).toArray(), 0.01, 8), true); // pitot (left)

  // ---------------- tail ----------------
  // A vertical surface lofted through stations [height, le, chord, profile]
  // (one profile per station), the same colour both sides.
  const vfin = (sts) => {
    const g2 = wingPanelVar(sts.map(([h, le, cc]) => ({ x: h, y: 0, le, chord: cc })), sts.map((q) => q[3]), 1);
    const p = g2.attributes.position, c = g2.attributes.color;
    for (let i = 0; i < p.count; i++) { p.setXYZ(i, p.getY(i), p.getX(i), p.getZ(i)); c.setXYZ(i, 1, 1, 1); }
    return flipWinding(g2);
  };
  // Fin (PH-AJB / VH-HLW side views): the leading edge from the spine at
  // (−4.0, 0.0) to the top at (−5.09, 0.84) (≈ 52° from the vertical),
  // curving forward into a dorsal fillet that leaves the spine at z ≈ −3.85;
  // the top falls 0.2 per metre aft (0.84 at the leading edge, 0.71 at the
  // rudder's trailing edge); the rudder hinge raked from (−4.91, −0.89); the
  // rudder's trailing edge from (−5.21, −0.89) to (−5.75, 0.71). Fin and
  // rudder are cut from one section per height (leading edge to the
  // rudder's trailing edge), so they meet flush at the hinge.
  const FTOP = PA36_DIM.finTopY, LE_TOP = -4.0 - FTOP * 1.294;
  const FIL = [[-0.9, -3.45], [-0.05, -3.45], [0.0, -3.65], [0.03, -3.82], [0.07, -3.98], [0.12, -4.13], [0.18, -4.233]];
  const finLEz = (y) => {
    if (y >= FIL[FIL.length - 1][0]) return -4.0 - y * 1.294;
    for (let i = 1; i < FIL.length; i++) if (y <= FIL[i][0]) return lerp(FIL[i - 1][1], FIL[i][1], (y - FIL[i - 1][0]) / (FIL[i][0] - FIL[i - 1][0]));
    return FIL[0][1];
  };
  const RTOP = FTOP - 0.03;
  const HB = new THREE.Vector3(0, -0.89, -4.91), HT = new THREE.Vector3(0, RTOP, -4.91 - (RTOP + 0.89) * 0.2925);
  const hingeZ = (y) => lerp(HB.z, HT.z, (y - HB.y) / (HT.y - HB.y));
  const teZ = (y) => lerp(-5.21, -5.75, (y + 0.89) / (RTOP + 0.89));
  const FIN_T = 0.1;
  // The sloping top: heights over 0.5 sheared down aft of the top's leading edge.
  const slopeTop = (geo) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > 0.5) p.setY(i, y - 0.2 * Math.max(0, LE_TOP - p.getZ(i)) * ((y - 0.5) / (FTOP - 0.5)));
    }
    geo.computeVertexNormals();
    return geo;
  };
  // Full section at height y: leading edge, chord and the hinge's chord fraction.
  const finSec = (y, leCut = 0) => {
    const yy = Math.min(y, RTOP), le = finLEz(Math.min(y, FTOP)) + leCut, c = le - teZ(yy);
    return { le, c, xh: (le - hingeZ(yy)) / c };
  };
  const finYs = [-0.85, -0.55, -0.05, 0.0, 0.03, 0.07, 0.12, 0.18, 0.35, 0.55, 0.72, FTOP - 0.03, FTOP];
  const finSt = finYs.map((y, i) => {
    const f = finSec(y, i === finYs.length - 1 ? -0.05 : 0);
    return [y, f.le, f.c, airfoil(0, f.xh, FIN_T, 0, 0.4, 12)];
  });
  add('livery', liveryUV(tagged(slopeTop(vfin(finSt)))));
  // Rudder on its raked hinge: built in place, carried into the hinge frame.
  const rudYs = [-0.89, -0.6, -0.2, 0.2, 0.5, RTOP - 0.03, RTOP];
  const rudSt = rudYs.map((y, i) => {
    const f = finSec(y);
    // The top rib rounds the trailing corner a little.
    const c = i === rudYs.length - 1 ? f.c - 0.06 : f.c;
    return [y, f.le, c, airfoil(Math.min(0.97, f.xh * (f.c / c)), 1, FIN_T * (f.c / c), 0, 0.4, 12)];
  });
  const rudGeo = liveryUV(tagged(slopeTop(vfin(rudSt))));
  const rudTab = tagged(tx(new THREE.BoxGeometry(0.01, 0.22, 0.06), 0, -0.55, teZ(-0.55) + 0.03));
  const rudPivot = new THREE.Group();
  {
    const Yh = HT.clone().sub(HB).normalize(), Xh = new THREE.Vector3(1, 0, 0), Zh = new THREE.Vector3().crossVectors(Xh, Yh).normalize();
    rudPivot.position.copy(HB);
    rudPivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(Xh, Yh, Zh));
    rudPivot.updateMatrix();
    const inv = rudPivot.matrix.clone().invert();
    rudGeo.applyMatrix4(inv); rudTab.applyMatrix4(inv);
  }
  const rudder = new THREE.Group();
  const rudMesh = new THREE.Mesh(rudGeo, M.livery);
  rudMesh.castShadow = true;
  rudder.add(rudMesh, new THREE.Mesh(rudTab, M.stab));
  rudPivot.add(rudder);
  root.add(rudPivot);
  add('white', ball([0, -0.82, teZ(-0.82) + 0.01], 0.018, 8), true); // tail light
  add('beacon', tx(new THREE.SphereGeometry(0.03, 12, 8), 0, FTOP + 0.002, LE_TOP - 0.03, 0, 0, 0, [0.8, 0.6, 1]));
  // Tailplane low on the cone, a third of its depth over the bottom (the
  // photographs; strut-braced), 3.6 m span, its chord pitched 8° nose-up in
  // this frame (≈ −1° to the datum in flight); the elevators clear of the
  // rudder; tips in the scheme's colour.
  const STY = -0.56, SLE = -4.15, SC = 1.0, ELEV = 0.6, STIP = 1.8;
  const STT = new THREE.Matrix4().makeTranslation(0, STY, SLE).multiply(new THREE.Matrix4().makeRotationX((-8 * Math.PI) / 180)).multiply(new THREE.Matrix4().makeTranslation(0, -STY, -SLE));
  const sst = (x) => ({ x, y: STY + x * 0.012, le: SLE - x * 0.05, chord: SC - x * 0.08 });
  const elevParts = [];
  for (const side of [1, -1]) {
    add('stab', wingPanel([0.04, 0.9, 1.7].map(sst), airfoil(0, ELEV - 0.02, 0.1, 0, 0.4, 12), side).applyMatrix4(STT));
    add('tip', wingPanel([1.7, 1.76, STIP].map((x, i) => ({ ...sst(x), chord: sst(x).chord * (1 - [0, 0.04, 0.16][i]), le: sst(x).le - [0, 0.01, 0.06][i] })), airfoil(0, 1, 0.1, 0, 0.4, 14), side).applyMatrix4(STT));
    elevParts.push(tagged(wingPanel([0.14, 0.9, 1.69].map(sst), airfoil(ELEV, 1, 0.1, 0, 0.4, 4), side).applyMatrix4(STT)));
    // Strut under the tailplane to the bottom of the cone, the bracing wire above to the fin.
    const sUnder = new THREE.Vector3(side * 0.95, STY - 0.04, SLE - 0.28).applyMatrix4(STT);
    add('gear', bar([side * 0.07, -0.9, -4.05], sUnder.toArray(), 0.04, 0.014));
    const sTop = new THREE.Vector3(side * 0.95, STY + 0.05, SLE - 0.35).applyMatrix4(STT);
    add('steel', rod(sTop.toArray(), [side * 0.03, 0.25, -4.55], 0.004, 4), true);
  }
  elevParts.push(tagged(tx(new THREE.BoxGeometry(0.4, 0.012, 0.08), 0.9, STY + 0.014, sst(0.9).le - sst(0.9).chord - 0.03).applyMatrix4(STT)));
  const elevGeo = mergeGeometries(elevParts);
  const elevHinge = new THREE.Vector3(0, STY, SLE - ELEV * SC).applyMatrix4(STT);
  elevGeo.translate(-elevHinge.x, -elevHinge.y, -elevHinge.z);
  const elevator = new THREE.Group();
  elevator.position.copy(elevHinge);
  const elevMesh = new THREE.Mesh(elevGeo, M.stab);
  elevMesh.castShadow = true; elevMesh.receiveShadow = true;
  elevator.add(elevMesh);
  root.add(elevator);

  // ---------------- landing gear ----------------
  const gearCfg = Object.fromEntries(A.gear.map((gg) => [gg.name, { ...gg, p: toRef(gg.p) }]));
  const gearGroups = {};
  const tyreProfile = (Rr, Wd, rim) => [
    [rim, -Wd * 0.42], [rim + 0.02, -Wd * 0.5], [Rr * 0.78, -Wd * 0.54], [Rr * 0.95, -Wd * 0.46], [Rr * 0.995, -Wd * 0.3],
    [Rr, -Wd * 0.12], [Rr, Wd * 0.12], [Rr * 0.995, Wd * 0.3], [Rr * 0.95, Wd * 0.46], [Rr * 0.78, Wd * 0.54], [rim + 0.02, Wd * 0.5], [rim, Wd * 0.42],
  ];
  const makeWheel = (Rr, Wd, rim, sx, big) => {
    const spin = new THREE.Group();
    const tyre = lathe(tyreProfile(Rr, Wd, rim), big ? 44 : 26);
    tyre.rotateZ(Math.PI / 2);
    const tmesh = new THREE.Mesh(tyre, M.tyre);
    tmesh.castShadow = true; tmesh.receiveShadow = true;
    const hubG = lathe([[0.0, -Wd * 0.3], [rim * 0.35, -Wd * 0.32], [rim * 0.55, -Wd * 0.18], [rim * 0.9, -Wd * 0.3], [rim + 0.008, -Wd * 0.44],
      [rim + 0.008, Wd * 0.44], [rim * 0.9, Wd * 0.3], [rim * 0.55, Wd * 0.18], [rim * 0.35, Wd * 0.32], [0.0, Wd * 0.3]], big ? 30 : 18);
    hubG.rotateZ(Math.PI / 2);
    const parts = [tagged(hubG)];
    if (big) for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; parts.push(tagged(tx(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 8), sx * Wd * 0.33, Math.cos(a) * rim * 0.55, Math.sin(a) * rim * 0.55, 0, 0, Math.PI / 2))); }
    spin.add(tmesh, new THREE.Mesh(mergeGeometries(parts), M.hub));
    return spin;
  };
  for (const [name, sx] of [['mainL', 1], ['mainR', -1]]) {
    const cfg = gearCfg[name];
    const Rr = cfg.radius, Wd = 0.21;
    const ax = cfg.p[0], ay = cfg.p[1] + Rr, az = cfg.p[2];
    const g2 = new THREE.Group();
    // Oleo leg from the lower fuselage side out and down to the axle (inboard
    // of the wheel); the drag brace from further aft forms the V seen from
    // the side; the brake line.
    const top = [sx * (pa36HalfX(0.6, -0.5) - 0.03), -0.5, 0.6];
    const attachY = top[1];
    const leg = new THREE.Group();
    leg.position.y = attachY;
    const Lp = (p) => [p[0], p[1] - attachY, p[2]];
    const axIn = [ax - sx * 0.13, ay + 0.02, az];
    const knee = lerp3(top, axIn, 0.55);
    const legParts = [rod(Lp(top), Lp(knee), 0.05, 12), rod(Lp(knee), Lp(axIn), 0.036, 12),
      tx(new RoundedBoxGeometry(0.08, 0.1, 0.12, 2, 0.02), ...Lp(axIn)), rod(Lp(axIn), Lp([ax - sx * 0.02, ay, az]), 0.028, 12)];
    const legMesh = new THREE.Mesh(mergeGeometries(legParts.map((p) => tagged(p))), M.gear);
    legMesh.castShadow = true; legMesh.receiveShadow = true;
    leg.add(legMesh);
    const braceTop = [sx * (pa36HalfX(0.0, -0.58) - 0.03), -0.58, 0.0];
    leg.add(new THREE.Mesh(tagged(rod(Lp(braceTop), Lp(lerp3(knee, axIn, 0.35)), 0.022, 10)), M.gear));
    leg.add(new THREE.Mesh(tagged(tube([Lp([top[0], top[1] - 0.02, top[2] - 0.04]), Lp(lerp3(top, axIn, 0.55).map((v, i) => v + [0, 0, -0.035][i])), Lp([axIn[0], axIn[1] + 0.06, axIn[2] - 0.04])], 0.007, 14, 5)), M.rubber));
    g2.add(leg);
    add('dark', rbox(0.12, 0.06, 0.16, 0.02, top[0] - sx * 0.02, top[1] + 0.02, top[2]));
    const wheel = new THREE.Group();
    wheel.position.set(ax, ay, az);
    const spinPart = makeWheel(Rr, Wd, 0.13, sx, true);
    const brake = new THREE.Mesh(tagged(tx(new THREE.CylinderGeometry(0.11, 0.11, 0.012, 24), -sx * 0.08, 0, 0, 0, 0, Math.PI / 2)), M.steel);
    const caliper = new THREE.Mesh(tagged(new RoundedBoxGeometry(0.05, 0.08, 0.1, 2, 0.012).translate(-sx * 0.085, 0.085, -0.05)), M.dark);
    wheel.add(spinPart, brake, caliper);
    g2.add(wheel);
    root.add(g2);
    gearGroups[name] = { group: g2, wheel, spin: spinPart, leg, legH: attachY - ay, rest: wheel.position.clone(), sx };
  }
  {
    const cfg = gearCfg.tail;
    const g2 = new THREE.Group();
    const Rr = cfg.radius;
    const fz = cfg.p[2] + 0.1, fy = cfg.p[1] + Rr + 0.12;
    // Leaf spring from the bottom of the cone down and back to the
    // steerable fork, under the rudder.
    add('ink', bar([0, -0.93, -4.6], [0, fy + 0.03, fz + 0.02], 0.05, 0.02));
    add('dark', rbox(0.09, 0.04, 0.16, 0.015, 0, -0.93, -4.6));
    add('ink', tx(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 10), 0, fy + 0.03, fz));
    const fork = new THREE.Group();
    fork.position.set(0, fy, fz);
    fork.add(new THREE.Mesh(mergeGeometries([
      tagged(tx(new THREE.BoxGeometry(0.014, 0.15, 0.06), 0.06, -0.06, -0.05, 0.5)), tagged(tx(new THREE.BoxGeometry(0.014, 0.15, 0.06), -0.06, -0.06, -0.05, 0.5)),
      tagged(tx(new THREE.BoxGeometry(0.13, 0.022, 0.06), 0, 0.02, 0)),
    ]), M.steel));
    const wheel = new THREE.Group();
    wheel.position.set(0, -0.12, -0.1);
    wheel.add(makeWheel(Rr, 0.085, 0.065, 1, false));
    fork.add(wheel);
    g2.add(fork);
    root.add(g2);
    gearGroups.tail = { group: g2, wheel, spin: wheel.children[0], fork, rest: wheel.position.clone(), sx: 0 };
  }

  // ---------------- spray system ----------------
  // Booms under and behind the trailing edge on four hangers a side, the
  // nozzles hanging from them, crossed under the belly; the wind-driven pump
  // under the hopper between the main legs.
  const nozzles = [];
  const BZ = -1.42, BX = 4.9;
  const teY = (x) => pa36WingY(x, W.le - W.chord);
  const boomAt = (side, x) => [side * x, teY(x) - 0.2, BZ];
  for (const side of [1, -1]) {
    add('alu', rod(boomAt(side, 0.5), boomAt(side, BX), 0.024, 12));
    add('alu', ball(boomAt(side, BX), 0.03, 10));
    for (const hx of [1.2, 2.4, 3.6, 4.7]) {
      const topP = [side * hx, pa36WingY(hx, -0.95) - 0.08, -0.95], bot = boomAt(side, hx);
      const len = Math.hypot(topP[1] - bot[1], topP[2] - bot[2]);
      add('alu', tx(new RoundedBoxGeometry(0.018, len, 0.05, 2, 0.006), side * hx, (topP[1] + bot[1]) / 2, (topP[2] + bot[2]) / 2, Math.atan2(topP[2] - bot[2], topP[1] - bot[1])));
      add('dark', tx(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 10), ...bot, 0, 0, Math.PI / 2), true);
    }
    const NZ = 17;
    for (let k = 0; k < NZ; k++) {
      const x = 0.65 + ((BX - 0.05 - 0.65) * k) / (NZ - 1);
      const [bx, by, bz] = boomAt(side, x);
      add('alu', rod([bx, by, bz], [bx, by - 0.06, bz - 0.012], 0.007, 6), true);
      add('red', tx(new THREE.CylinderGeometry(0.017, 0.014, 0.045, 10), bx, by - 0.085, bz - 0.02, 0.25), true);
      add('brass', tx(new THREE.ConeGeometry(0.009, 0.022, 8), bx, by - 0.115, bz - 0.03, Math.PI + 0.25), true);
      nozzles.push(new THREE.Vector3(bx, by - 0.12, bz - 0.03));
    }
  }
  add('alu', rod(boomAt(1, 0.5), boomAt(-1, 0.5), 0.032, 12));
  add('alu', tube([[0, -0.66, 0.35], [0, -0.74, -0.2], [0, -0.82, -0.9], [0, boomAt(1, 0)[1], BZ]], 0.032, 24, 10));
  const pump = new THREE.Group();
  pump.position.set(0, -0.72, 0.55);
  {
    const pumpBody = lathe([[0.0, -0.2], [0.075, -0.19], [0.095, -0.12], [0.1, 0.05], [0.085, 0.15], [0.05, 0.2], [0.0, 0.21]], 22);
    pumpBody.rotateX(Math.PI / 2);
    pump.add(new THREE.Mesh(tagged(pumpBody), M.dark));
    pump.add(new THREE.Mesh(tagged(tx(new THREE.SphereGeometry(0.042, 12, 8), 0, 0, 0.22)), M.steel));
    pump.add(new THREE.Mesh(tagged(rod([0, 0.09, 0], [0, 0.2, 0.03], 0.024, 8)), M.dark));
  }
  const pumpFan = new THREE.Group();
  pumpFan.position.z = 0.24;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI * 2) / 6;
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.045, 0.008), M.orange);
    bl.position.set(Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0);
    bl.rotation.z = a; bl.rotation.x = 0.4;
    pumpFan.add(bl);
  }
  pump.add(pumpFan);
  root.add(pump);

  // ---------------- propeller (Hartzell, two blades, constant speed) ----------------
  const PR = A.propRadius;
  const prop = new THREE.Group();
  prop.position.set(0, AX, SPZ + 0.06);
  const spinnerMesh = new THREE.Mesh(tagged((() => {
    // Pointed spinner (≈ 0.3 m across, 0.34 m long).
    const sp = lathe([[0.15, -0.06], [0.152, 0.0], [0.148, 0.06], [0.132, 0.13], [0.105, 0.19], [0.07, 0.24], [0.035, 0.27], [0.0, 0.28]], 32);
    sp.rotateX(Math.PI / 2);
    return sp;
  })()), M.spinner);
  spinnerMesh.castShadow = true;
  prop.add(spinnerMesh, new THREE.Mesh(tagged(tx(new THREE.CylinderGeometry(0.155, 0.155, 0.02, 32), 0, 0, -0.065, Math.PI / 2)), M.steel));
  const blades = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.55, metalness: 0.25, transparent: true });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xf2d11e, roughness: 0.5, transparent: true });
  const bodyGeo = bladeLoft(0.13, PR - 0.09, 16, PR), tipGeo = bladeLoft(PR - 0.09, PR, 3, PR);
  const pitchGroups = [];
  for (let i = 0; i < 2; i++) {
    const bl = new THREE.Group();
    bl.rotation.z = i * Math.PI + Math.PI / 2;
    const pg = new THREE.Group();
    const bm = new THREE.Mesh(bodyGeo, bladeMat);
    bm.castShadow = true;
    pg.add(bm, new THREE.Mesh(tipGeo, tipMat));
    bl.add(pg);
    blades.add(bl);
    pitchGroups.push(pg);
  }
  prop.add(blades);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(PR + 0.01, 64), new THREE.MeshBasicMaterial({ map: propDiscTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.z = 0.03;
  disc.renderOrder = 11;
  prop.add(disc);
  root.add(prop);

  // ---------------- cockpit ----------------
  // The Brave 300 cockpit (pa36Cockpit.js), in this same reference frame,
  // on the cabin's own sections; the panel's textures are pa36Panel.js.
  const C = PA36_CABIN;
  const ck = buildPA36Cockpit({
    panel, envMap: opts.envMap ?? null, harnessMat: M.harness,
    cab: { halfX: pa36HalfX, SILL_Y, RAIL_Y, ROOF, WS, BPOST, wsBase, roofEdge, roofRear, railX, sillX, rearRing: ringR(stRear), topY },
  });
  const { cockpit, stick, pedals, throttle, valve, leds } = ck;
  const THR = C.throttle;
  const eye = new THREE.Vector3(...C.eye);
  root.add(cockpit);

  // ---------------- pilot ----------------
  // The shared pilot figure in the pilot frame: the eye at (0, 0.98, −0.52)
  // of that frame sits on the cabin's eye anchor.
  const OFF = new THREE.Vector3(C.eye[0], C.eye[1] - 0.98, C.eye[2] + 0.52);
  const thrPF = [THR[0] - OFF.x, THR[1] - OFF.y, THR[2] - OFF.z];
  void PA36_CK;
  const pilot = buildPilot(M, stick, throttle, { throttleAt: thrPF });
  pilot.position.copy(OFF);
  root.add(pilot);

  // ---------------- merge static parts ----------------
  const fine = new THREE.Group();
  for (const [k, parts] of Object.entries(B)) {
    const isFine = k.startsWith('fine:');
    const mat = M[isFine ? k.slice(5) : k];
    const m = new THREE.Mesh(mergeGeometries(parts), mat);
    m.castShadow = !isFine && mat !== M.glass && mat !== M.lens && mat !== M.tint;
    m.receiveShadow = true;
    if (mat === M.lens) m.renderOrder = 9;
    (isFine ? fine : root).add(m);
  }
  const lod = new THREE.LOD();
  lod.addLevel(fine, 0);
  lod.addLevel(new THREE.Group(), 90);
  root.add(lod);
  const glassMesh = new THREE.Group();
  const gm = new THREE.Mesh(mergeGeometries(glassG.map((gq) => tagged(gq))), M.glass);
  gm.renderOrder = 10;
  glassMesh.add(gm);
  root.add(glassMesh);
  root.traverse((o) => { if (o.isMesh && o.castShadow === undefined) o.castShadow = true; });
  // Pitch the whole model into the body frame (see PA36_STANCE).
  const stance = new THREE.Group();
  stance.rotation.x = PA36_STANCE;
  for (const ch of [...root.children]) stance.add(ch);
  root.add(stance);
  const V = (v) => new THREE.Vector3(...pa36ToBody([v.x, v.y, v.z]));
  const REF = {
    eye: V(eye), seat: V(new THREE.Vector3(...C.seat)), panel: V(new THREE.Vector3(...C.panel)), stick: V(new THREE.Vector3(...C.stick)),
    throttle: V(new THREE.Vector3(...C.throttle)), pedals: V(new THREE.Vector3(...C.pedals)), roof: V(new THREE.Vector3(...C.roof)),
    door: V(new THREE.Vector3(...C.door)), windshield: V(new THREE.Vector3(...C.windshield)), floorY: C.floorY,
  };

  let bladeAngle = 0.18, t = 0;
  const update = (dt, fm, ac) => {
    t += dt;
    ck.update(dt, fm, ac);
    const o = fm.out;
    const pf = fm.shaftPower / A.maxPower;
    const target = fm.engine === 'running' ? 0.16 + 0.34 * smoothstep(15, 55, o.airspeed) + 0.08 * pf : 0.16;
    bladeAngle += clamp(target - bladeAngle, -dt * 0.8, dt * 0.8);
    for (const pg of pitchGroups) pg.rotation.x = bladeAngle;
    const on = fm.engine !== 'off';
    M.beacon.emissiveIntensity = on ? 0.6 + 2.4 * Math.max(0, Math.sin(t * 7.5)) ** 8 : 0;
    M.strobe.emissiveIntensity = on && t % 1.2 < 0.06 ? 4 : 0;
  };
  const swap = (mat, n) => { mat.map.dispose(); mat.bumpMap.dispose(); mat.map = n.map; mat.bumpMap = n.bump; mat.needsUpdate = true; };
  return {
    setReg(r) { REG = r; swap(M.livery, liveryTextures(REG, PA36_LIVERIES[livery])); },
    setLivery(i) {
      const k = ((i % PA36_LIVERIES.length) + PA36_LIVERIES.length) % PA36_LIVERIES.length;
      if (k === livery) return;
      livery = k;
      const L = PA36_LIVERIES[k];
      swap(M.livery, liveryTextures(REG, L));
      swap(M.wing, wingTextures(L));
      for (const [m, cc] of [[M.stab, L.stab], [M.frame, L.frame], [M.tip, L.tip], [M.gear, L.gear], [M.spinner, L.spinner]]) m.color.set(cc).multiplyScalar(ALB);
    },
    get livery() { return livery; },
    root, M, refs: REF,
    prop, blades, bladeMats: [bladeMat, tipMat], disc,
    ailerons, flaps, elevator, rudder,
    gear: gearGroups,
    stick, pedals, throttle, valve, leds, panelMesh: ck.panelMesh, inst: { pick: ck.pick, pickables: ck.pickables, needles: ck.needles, card: ck.card, level: ck.level },
    pumpFan, pilot, cockpit, glassMesh,
    eye: REF.eye.clone(),
    nozzles: nozzles.map(V),
    fuelFiller: V(wv([1.9, wingYflat(1.9) + 0.14, W.le - 0.3 * W.chord])),
    hopperPort: V(new THREE.Vector3(pa36HalfX(-0.2, -0.35) + 0.03, -0.35, -0.2)),
    update,
  };
}
