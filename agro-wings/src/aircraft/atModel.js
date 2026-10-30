// Procedural Air Tractor AT-502B with its own markings (PR-AWT, AGRO WINGS).
// VISUAL ONLY: the physics (FLIGHT_AT502), gear contact points and hard
// points live in src/config.js; the gear points are read here only to place
// the wheels.
// Body frame: +Z nose, +Y up, +X left wing; origin = CG (≈ 30 % MAC).
//
// Built with the shared helpers in model.js, its fuselage from its own
// cross-sections (see S below), fitted to photos of the type: a long,
// slab-sided PT6A cowling drooping toward the spinner, a deep 500 US gal
// hopper section whose belly sits on the wing well clear of the wheels, a
// narrow glasshouse with a three-piece windshield set in on a sill ledge and
// a straight turtle deck to the fin; a constant-chord cantilever wing
// (15.85 m) with large flaps and long ailerons, spray booms with 50 nozzles
// under the trailing edge, tall splayed spring-steel main legs, a steerable
// tailwheel, a strut-braced tailplane, a 2.82 m three-blade constant-speed
// prop that feathers when stopped. Cockpit after Air Tractor cockpits: an
// arched black panel with recessed instruments under a padded glareshield,
// the guidance screen on its own mount, the PT6 power quadrant, a yellow
// airframe inside, laid out around the same seated pilot as the PR-AGW.
// Paint and lettering are a side-projected livery with a matching bump map;
// AO is baked into vertex colours; fine detail sits in a LOD.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { rng, clamp, smoothstep, lerp } from '../core/math.js';
import { FLIGHT_AT502 } from '../config.js';
import {
  sampleStations, loft, K, airfoil, wingPanel, flipWinding, tagged, shade, tx, rod, tube, bar, ball, rbox, lathe, grid,
  speckle, orangePeel, treadTexture, propDiscTexture, ribTexture, feltTexture, WING_SPAN_UV, buildPilot,
} from './model.js';
import { AT_PANEL } from './atPanel.js';

const DIH = Math.tan((3.5 * Math.PI) / 180);
export const AT_WING = { rootX: 0.66, tipX: 7.82, rootY: -0.35, le: 0.55, chord: 1.83 };
export const atWingY = (x) => AT_WING.rootY + Math.max(0, Math.abs(x) - AT_WING.rootX) * DIH;
const SPAN_UV = 8.1; // half-span metres mapped to u = 0..1 on the wing texture
const YELLOW = '#f2bd10';
const BLUE = '#1d4c9c';
const WHITE = '#f3f3ee';
const INK = '#141a24';
// Cockpit layout = the PR-AGW's seat/stick/pedal geometry moved by this
// offset (taller cabin, further aft), so the shared pilot fits the controls.
const OFF = new THREE.Vector3(0, 0.55, -0.42);
const o3 = (x, y, z) => [x + OFF.x, y + OFF.y, z + OFF.z];

// Ground shadow planform for createContactShadow().
export const AT_SHADOW = { W: 17.5, L: 12, wing: [7.95, -1.3, 0.6], fus: [0.66, -0.7, 5.0], tail: [2.75, -5.95, -4.95], core: [5.6, 3.4] };

// ==========================================================================
// Fuselage cross-sections, nose to tail. A station S(z, yb, ys, yw, yt, hw,
// ww, tL, pL, pU, lean) is a closed section in three parts (the left half,
// mirrored for the right):
//   keel: a superellipse quarter (exponent pL) from the bottom centre (yb)
//         out to the widest point (half-width hw at height ys), drawn in
//         toward the keel (the bottom is about tL·hw wide);
//   wall: a straight side from (hw, ys) up to (ww, yw), leaning in;
//   top:  a superellipse quarter (exponent pU) from (ww, yw) to the crown
//         (yt) whose sides lean in by `lean` per metre of height.
// Fitted to front, side and three-quarter photos of the type: a long,
// slab-sided PT6 cowling with a narrow, rounded top over the chin intake;
// a deep hopper section no wider than the cockpit needs, its belly on the
// wing's lower surface, well clear of the wheels; a narrow cabin set in on
// a sill ledge; behind it a curved cabin fairing and a long, gently
// sloping turtle deck to the fin.
const S = (z, yb, ys, yw, yt, hw, ww, tL, pL, pU, lean) => ({ z, yb, ys, yw, yt, hw, ww, tL, pL, pU, lean });
const SILL = 1.07;
// Glasshouse: its sides continue the cabin walls' lean above the sill
// ledge (half-width CAN.ww at the sill, leaning in by CAN.lean per metre)
// and turn over a narrow rounded roof (exponent CAN.pU) at CAN.yt; the
// turtle deck starts from this same section at CAN.zR.
const CAN = { ww: 0.47, lean: 0.18, pU: 4, yt: 1.89, zR: -1.5, glassTop: 1.72 };
// The cowling's top line rises ~7° from the spinner to the windshield, so
// that sitting on its tailwheel the nose top is about level.
const FWD_KEYS = [
  S(3.93, -0.2, 0.2, 0.3, 0.6, 0.33, 0.31, 0.82, 2.2, 2.4, 0.12),
  S(3.84, -0.25, 0.2, 0.34, 0.66, 0.37, 0.345, 0.8, 2.5, 2.6, 0.2),
  S(3.55, -0.29, 0.2, 0.4, 0.72, 0.39, 0.36, 0.78, 2.8, 2.8, 0.3),
  S(3.0, -0.32, 0.2, 0.48, 0.8, 0.41, 0.37, 0.76, 3.2, 2.9, 0.36),
  S(2.3, -0.35, 0.18, 0.57, 0.89, 0.45, 0.39, 0.76, 3.6, 3.0, 0.4),
  S(1.7, -0.38, 0.15, 0.66, 0.97, 0.52, 0.43, 0.76, 4.0, 3.0, 0.45),
  S(1.0, -0.4, 0.12, 0.76, 1.035, 0.57, 0.46, 0.76, 4.5, 3.0, 0.48),
  S(0.55, -0.415, 0.1, 0.83, 1.07, 0.59, 0.47, 0.76, 4.5, 3.4, 0.42),
  S(0.3, -0.42, 0.1, 0.95, 1.08, 0.6, 0.47, 0.76, 4.5, 4.5, 0.3),
  S(0.15, -0.42, 0.1, 1.05, 1.085, 0.6, 0.47, 0.76, 4.5, 6, 0.2),
];
// Cabin: the lower fuselage only, cut along the sill.
const CAB_KEYS = [0.15, -0.7, CAN.zR].map((z) => S(z, -0.42, 0.1, SILL, SILL, 0.6, CAN.ww, 0.76, 4.5, 2, 0));
// Behind the cabin, in two parts (side photos of the type): a curved cabin
// fairing rolls off the roof and falls steeply to about the window sill
// ~1 m aft of the rear post; from there a long upper deck runs nearly
// level (~5° to the fuselage line) to the fin, the tail cone keeping its
// depth to the rudder post. The belly rises steadily under it.
const AFT_KEYS = [
  S(CAN.zR, -0.42, 0.1, SILL, CAN.yt, 0.6, CAN.ww, 0.76, 4.5, CAN.pU, CAN.lean),
  S(-1.72, -0.41, 0.11, 1.05, 1.84, 0.595, 0.465, 0.76, 4.4, 3.9, 0.19),
  S(-2.02, -0.395, 0.12, 0.99, 1.5, 0.575, 0.455, 0.76, 4.1, 3.4, 0.2),
  S(-2.3, -0.37, 0.13, 0.9, 1.18, 0.55, 0.435, 0.755, 3.8, 3.1, 0.21),
  S(-2.55, -0.345, 0.14, 0.84, 1.08, 0.525, 0.415, 0.75, 3.6, 3.0, 0.22),
  S(-3.3, -0.25, 0.17, 0.76, 1.0, 0.445, 0.345, 0.74, 3.2, 2.9, 0.24),
  S(-3.9, -0.15, 0.2, 0.7, 0.94, 0.365, 0.285, 0.73, 2.8, 2.7, 0.25),
  S(-4.5, -0.04, 0.23, 0.63, 0.87, 0.28, 0.22, 0.72, 2.6, 2.6, 0.24),
  S(-4.95, 0.04, 0.26, 0.57, 0.79, 0.2, 0.155, 0.7, 2.5, 2.5, 0.2),
  S(-5.35, 0.12, 0.3, 0.5, 0.68, 0.11, 0.085, 0.7, 2.4, 2.4, 0.1),
  S(-5.66, 0.2, 0.33, 0.44, 0.54, 0.02, 0.018, 0.7, 2.4, 2.4, 0.02),
];
// Stations along the fuselage: every field Catmull-Rom interpolated, `per`
// stations per metre.
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
// Left half of a section, bottom centre upward ([x, y] pairs); without the
// top part when `top` is false (it then ends on the wall's top).
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
// Closed section (counter-clockwise seen from the nose, starting and ending
// at the bottom centre), or the open cabin section from the right sill
// round the keel to the left sill.
function sectionRing(st, open = false) {
  const h = halfSection(st, !open);
  const m = h.map(([x, y]) => [-x, y]);
  return open ? m.reverse().concat(h.slice(1)) : h.concat(m.reverse().slice(1));
}
// Loft through stations (nose to tail); colorFn bakes AO into vertex colours.
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
// Half-width of the fuselage at (z, y) (for fittings placed on the skin).
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
// Windshield: a flat centre pane (half-width wsC, narrowing upward) raked
// back from the hopper deck (canF: z of the pane at height y), and two flat
// side panes angled back to the A-posts at the glasshouse sides.
const canF = (y) => 0.15 - 0.64 * Math.pow(clamp((y - SILL) / (CAN.yt - SILL), 0, 1), 1.3);
const wsC = (y) => lerp(0.2, 0.135, clamp((y - SILL) / (CAN.glassTop - SILL), 0, 1.2));
const WS_K = 1.05; // side pane: metres aft per metre outboard

// Livery: side projection (z, y); top half = left side (nose to the left),
// bottom half = right side (nose to the right), lettering upright on both.
const LV = { Z0: -5.95, Z1: 4.45, Y0: -1.0, Y1: 2.5, W: 2048, H: 1024, M: 6 };
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

// Crown line of the turtle deck ([z, y], cabin to tail).
const aftTop = sampleSt(AFT_KEYS, 14).map((st) => [st.z, st.yt]);
function liveryTextures(reg) {
  const c = canvas(LV.W, LV.H), b = canvas(LV.W, LV.H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  gb.fillStyle = '#808080';
  gb.fillRect(0, 0, LV.W, LV.H);
  orangePeel(gb, LV.W, LV.H, 51);
  for (const side of [1, -1]) {
    const P = (z, y) => lvPix(side, z, y);
    const oy = side > 0 ? 0 : LV.H / 2;
    const path = (ctx, pts) => {
      ctx.beginPath();
      pts.forEach(([z, y], i) => { const [px, py] = P(z, y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    };
    const poly = (pts, fill) => { path(g, pts); g.closePath(); g.fillStyle = fill; g.fill(); };
    const line = (ctx, pts, col, w) => { path(ctx, pts); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
    g.fillStyle = YELLOW;
    g.fillRect(0, oy, LV.W, LV.H / 2);
    // Dusty, oil-stained belly.
    const [, belly] = P(0, -0.2);
    const grd = g.createLinearGradient(0, belly, 0, oy + LV.H / 2);
    grd.addColorStop(0, 'rgba(90,70,30,0)');
    grd.addColorStop(1, 'rgba(90,70,30,0.24)');
    g.fillStyle = grd;
    g.fillRect(0, belly, LV.W, oy + LV.H / 2 - belly);
    // Blue fin and rudder (and the fin fillet), above the turtle deck with
    // a white line along it.
    const deckEdge = aftTop.filter(([z]) => z <= -4.3).map(([z, y]) => [z, y + 0.04]);
    poly([[-4.3, 2.6], [-6.1, 2.6], [-6.1, 0.2], ...deckEdge.slice().reverse()], BLUE);
    line(g, deckEdge, WHITE, 0.022 * LV.ky);
    // Blue cheat line with white pinstripes, nose to tail.
    const band = (cl, hh, off = 0) => cl.map(([z, y], i) => [z, y + off + hh[i]]).concat(cl.map(([z, y], i) => [z, y + off - hh[i]]).reverse());
    const cl = [[3.95, 0.3], [3.2, 0.3], [2.2, 0.32], [1.0, 0.35], [0.15, 0.38], [-1.6, 0.45], [-3.2, 0.5], [-4.45, 0.52]];
    const hh = [0.05, 0.07, 0.085, 0.09, 0.09, 0.08, 0.06, 0.04];
    poly(band(cl, hh), BLUE);
    poly(band(cl, hh.map(() => 0.008), 0).map(([z, y], i) => [z, y]), BLUE);
    for (const s of [1, -1]) {
      const pin = cl.map(([z, y], i) => [z, y + s * (hh[i] + 0.028)]);
      poly(band(pin, hh.map(() => 0.009)), WHITE);
    }
    // Cowling: side door split line, camloc fasteners, louvres, firewall seam.
    const seams = [
      [[3.76, -0.2], [3.76, 0.7]], [[2.0, -0.35], [2.0, 0.92]], [[3.76, 0.5], [2.0, 0.7]], [[3.76, 0.05], [2.0, 0.0]],
      [[0.15, -0.42], [0.15, 1.07]], [[-1.55, -0.42], [-1.55, 1.07]], [[-2.9, -0.3], [-2.9, 1.35]], [[-4.2, -0.05], [-4.2, 0.9]],
      [[1.2, -0.4], [1.2, 1.03]], [[-1.55, 0.0], [-4.2, 0.2]],
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
    for (let k = 0; k < 7; k++) {
      const z = 3.55 - k * 0.24;
      for (const y of [0.6, 0.05]) {
        const [px, py] = P(z, y);
        g.fillStyle = 'rgba(40,40,40,0.55)'; g.beginPath(); g.arc(px, py, 3.2, 0, Math.PI * 2); g.fill();
        gb.fillStyle = '#a8a8a8'; gb.beginPath(); gb.arc(px, py, 3.2, 0, Math.PI * 2); gb.fill();
      }
    }
    for (let k = 0; k < 8; k++) {
      const pts = [[2.75 - k * 0.055, -0.15], [2.75 - k * 0.055, 0.03]];
      line(g, pts, 'rgba(20,15,10,0.6)', 3); line(gb, pts, '#202020', 4);
    }
    // Access doors on the aft fuselage and the hopper side.
    const door = (z0, z1, y0, y1) => {
      const pts = [[z0, y0], [z1, y0], [z1, y1], [z0, y1], [z0, y0]];
      line(g, pts, 'rgba(80,60,0,0.36)', 2); line(gb, pts, '#383838', 2.8);
    };
    door(-2.05, -2.6, -0.1, 0.2);
    door(-3.55, -3.95, 0.45, 0.7);
    door(1.75, 0.95, -0.32, -0.05);
    // Exhaust soot streaming aft from the stacks.
    {
      const [ax, ay] = P(3.2, 0.27), [bx] = P(1.0, 0.27);
      const sg = g.createLinearGradient(ax, 0, bx, 0);
      sg.addColorStop(0, 'rgba(30,24,16,0.5)');
      sg.addColorStop(0.5, 'rgba(30,24,16,0.18)');
      sg.addColorStop(1, 'rgba(30,24,16,0)');
      g.fillStyle = sg;
      g.beginPath(); g.ellipse((ax + bx) / 2, ay + 6, Math.abs(bx - ax) / 2, 0.12 * LV.ky, 0, 0, Math.PI * 2); g.fill();
    }
    // Lettering.
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
    text(-3.05, 0.27, reg, 0.22, INK); // on the flat side under the cheat line
    text(1.15, 0.72, 'AGRO WINGS', 0.12, BLUE, 'italic bold');
    text(-0.75, 0.9, 'AVIAÇÃO AGRÍCOLA', 0.04, INK, 'bold');
    text(-5.36, 1.6, 'AT-502B', 0.11, WHITE, 'italic bold');
    text(1.6, -0.25, 'NO STEP', 0.035, 'rgba(30,30,30,0.7)', 'bold');
    text(0.6, 0.05, 'JET A-1', 0.035, 'rgba(30,30,30,0.75)', 'bold');
    speckle(g, 0, oy, LV.W, LV.H / 2, 2600, side > 0 ? 17 : 18, 0.1);
  }
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}

// Wing skin: u = span / SPAN_UV, v = chord fraction (0 = LE).
function wingTextures() {
  const W = 2048, H = 512;
  const c = canvas(W, H), b = canvas(W, H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  g.fillStyle = YELLOW; g.fillRect(0, 0, W, H);
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, W, H);
  orangePeel(gb, W, H, 53);
  const X = (m) => (m / SPAN_UV) * W, Y = (f) => f * H;
  const r = rng(27);
  // Blue tip band with a white pinstripe.
  g.fillStyle = BLUE; g.fillRect(X(7.1), 0, W - X(7.1), H);
  g.fillStyle = WHITE; g.fillRect(X(7.04), 0, X(0.035), H);
  for (let i = 0; i < 80; i++) {
    g.fillStyle = `rgba(120,100,60,${0.03 + r() * 0.05})`;
    g.fillRect(r() * W, Y(0.1 + r() * 0.8), 2 + r() * 3, 30 + r() * 120);
  }
  for (let i = 0; i < 1100; i++) {
    g.fillStyle = `rgba(60,45,30,${0.08 + r() * 0.15})`;
    g.fillRect(r() * W, Y(r() * 0.06), 1 + r() * 2, 1 + r() * 2);
  }
  const seam = (x0, y0, x1, y1, rivet = 0.055) => {
    g.strokeStyle = 'rgba(80,60,0,0.28)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    gb.strokeStyle = '#3e3e3e'; gb.lineWidth = 2.6;
    gb.beginPath(); gb.moveTo(x0, y0); gb.lineTo(x1, y1); gb.stroke();
    const n = Math.max(2, Math.round(Math.hypot((x1 - x0) / (W / SPAN_UV), ((y1 - y0) / H) * 1.83) / rivet));
    gb.fillStyle = '#5c5c5c';
    for (let k = 0; k <= n; k++) { gb.beginPath(); gb.arc(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n + 5, 1.4, 0, Math.PI * 2); gb.fill(); }
  };
  for (const f of [0.12, 0.28, 0.7]) seam(X(0.3), Y(f), X(8.0), Y(f));
  for (let x = 0.9; x < 7.9; x += 0.46) seam(X(x), Y(0.0), X(x), Y(0.74), 0.06);
  g.fillStyle = 'rgba(40,20,0,0.45)'; g.fillRect(0, Y(0.742), W, 5);
  gb.fillStyle = '#202020'; gb.fillRect(0, Y(0.742), W, 6);
  g.fillRect(X(4.42) - 2, Y(0.75), 4, H); gb.fillRect(X(4.42) - 3, Y(0.75), 6, H);
  // Integral tank access panels.
  for (const [a, bb] of [[1.4, 2.0], [2.3, 2.9], [3.2, 3.8]]) {
    g.strokeStyle = 'rgba(80,60,0,0.35)'; g.lineWidth = 2; g.strokeRect(X(a), Y(0.36), X(bb) - X(a), Y(0.24));
    gb.strokeStyle = '#383838'; gb.lineWidth = 2.6; gb.strokeRect(X(a), Y(0.36), X(bb) - X(a), Y(0.24));
  }
  speckle(g, 0, 0, W, H, 2600, 33, 0.08);
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}

const atWingPanel = (stations, prof, side, ao) => {
  const g = wingPanel(stations, prof, side, ao);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * WING_SPAN_UV) / SPAN_UV);
  return g;
};

// Three-blade prop blade (twisted airfoil sections along +X).
function bladeLoft(r0, r1, steps, R) {
  const pos = [], idx = [];
  let n = 0;
  for (let i = 0; i <= steps; i++) {
    const r = r0 + ((r1 - r0) * i) / steps;
    const f = clamp((r - 0.22) / (R - 0.22), 0, 1);
    let c = 0.12 + 0.13 * Math.sin(Math.PI * Math.min(1, f * 1.05)) ** 0.6;
    if (f > 0.93) c *= 1 - ((f - 0.93) / 0.07) ** 2 * 0.5;
    const t = lerp(0.2, 0.06, f);
    const beta = Math.atan(1.6 / (2 * Math.PI * Math.max(r, 0.25)));
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

// ==========================================================================
export function createAirTractorModel(panel, opts = {}) {
  const A = FLIGHT_AT502;
  const root = new THREE.Group();
  root.name = 'airtractor';
  const liv = liveryTextures(opts.reg ?? 'PR-AWT');
  const wtx = wingTextures();
  const coat = { roughness: 0.48, metalness: 0.0, specularIntensity: 0.3, clearcoat: 0.14, clearcoatRoughness: 0.3, envMap: opts.envMap ?? null, envMapIntensity: 0.3 };
  const ALBEDO = 0.84;
  const M = {
    paint: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(YELLOW).multiplyScalar(ALBEDO), vertexColors: true, ...coat }),
    blue: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(BLUE).multiplyScalar(ALBEDO), vertexColors: true, ...coat }),
    livery: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALBEDO), map: liv.map, bumpMap: liv.bump, bumpScale: 1.4, vertexColors: true, ...coat }),
    wing: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALBEDO), map: wtx.map, bumpMap: wtx.bump, bumpScale: 1.4, vertexColors: true, ...coat }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.62, metalness: 0.1, vertexColors: true }),
    deck: new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c1f24'), roughness: 0.93, metalness: 0.0, envMapIntensity: 0.35 }),
    lid: new THREE.MeshStandardMaterial({ color: new THREE.Color('#3b362f'), roughness: 0.8, metalness: 0.0, vertexColors: true }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.28, metalness: 0.92, vertexColors: true }),
    polished: new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.2, metalness: 1.0, envMap: opts.envMap ?? null, envMapIntensity: 0.62 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x5c6166, roughness: 0.42, metalness: 0.85, vertexColors: true }),
    exhaust: new THREE.MeshStandardMaterial({ color: 0x4a423b, roughness: 0.5, metalness: 0.85, vertexColors: true }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.94, metalness: 0, vertexColors: true }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92, metalness: 0, bumpMap: treadTexture(), bumpScale: 2.5 }),
    gloss: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.28, metalness: 0.1, vertexColors: true }),
    hub: new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.32, metalness: 0.35 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb8913c, roughness: 0.35, metalness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xa8bcc6, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.17, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5, depthWrite: false, side: THREE.DoubleSide }),
    tint: new THREE.MeshPhysicalMaterial({ color: 0x5f8a72, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.42, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.4, depthWrite: false, side: THREE.DoubleSide }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false }),
    interior: new THREE.MeshStandardMaterial({ color: 0x50565c, roughness: 0.7, metalness: 0.12, vertexColors: true }),
    // Cabin structure inside: the airframe yellow, satin.
    frameIn: new THREE.MeshStandardMaterial({ color: new THREE.Color(YELLOW).multiplyScalar(0.7), roughness: 0.55, metalness: 0.05, vertexColors: true }),
    // Inside of the roof: the airframe yellow, matt.
    headliner: new THREE.MeshStandardMaterial({ color: new THREE.Color(YELLOW).multiplyScalar(0.62), map: feltTexture(), roughness: 0.92, side: THREE.DoubleSide }),
    floor: new THREE.MeshStandardMaterial({ color: 0xffffff, map: ribTexture('#3c4248', 'rgba(0,0,0,0.5)', 24, 64, 256), roughness: 0.8, metalness: 0.4, vertexColors: true }),
    seat: new THREE.MeshStandardMaterial({ color: 0xffffff, map: ribTexture('#8e1f1b', 'rgba(30,5,5,0.5)'), roughness: 0.88, vertexColors: true }),
    harness: new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.8 }),
    // Padded black vinyl (glareshield).
    pad: new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.8, metalness: 0.0, vertexColors: true }),
    red: new THREE.MeshStandardMaterial({ color: 0xc8261b, roughness: 0.45, emissive: 0x330000 }),
    green: new THREE.MeshStandardMaterial({ color: 0x1f9a3a, roughness: 0.45, emissive: 0x002200 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xf2b400, roughness: 0.45 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35, emissive: 0x222222 }),
    beacon: new THREE.MeshStandardMaterial({ color: 0xd8261b, roughness: 0.3, emissive: 0xff2010, emissiveIntensity: 0 }),
    strobe: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.2, emissive: 0xffffff, emissiveIntensity: 0 }),
    suit: new THREE.MeshStandardMaterial({ color: 0x55603f, roughness: 0.88 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.75 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xb88462, roughness: 0.7 }),
    helmet: new THREE.MeshPhysicalMaterial({ color: 0xeeeae2, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x15181c, roughness: 0.05, metalness: 0.3, clearcoat: 1 }),
    helmStripe: new THREE.MeshPhysicalMaterial({ color: 0xb8231b, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
  };

  const B = {};
  const add = (mat, g, fine = false) => { const k = (fine ? 'fine:' : '') + mat; (B[k] ||= []).push(tagged(g)); };

  // ---------------- fuselage ----------------
  const fusAO = (x, y, z) => {
    let a = 1 - Math.max(0, -y - 0.1) * 0.3;
    const yb = Math.max(0, 1 - Math.abs(y + 0.27) / 0.26), zb = Math.max(0, 1 - Math.abs(z + 0.36) / 1.05);
    a *= 1 - 0.34 * yb * Math.sqrt(zb); // wing-root shadow line
    const sb = Math.max(0, 1 - Math.abs(y - 0.42) / 0.15) * (z < -4.9 && z > -5.95 ? 1 : 0);
    a *= 1 - 0.22 * sb;
    if (z < 0.15 && z > -1.55 && y > SILL - 0.16) a *= 0.9;
    if (z > 3.75) a *= 0.86 + 0.14 * clamp((3.92 - z) / 0.17, 0, 1);
    return clamp(a, 0.5, 1);
  };
  const fwdSt = sampleSt(FWD_KEYS, 20);
  const cabSt = sampleSt(CAB_KEYS, 8);
  const aftSt = sampleSt(AFT_KEYS, 14);
  add('livery', liveryUV(tagged(loftSt(fwdSt, fusAO))));
  // Cabin: the lower fuselage only, its walls cut along the sill under the
  // glasshouse.
  add('livery', liveryUV(tagged(loftSt(cabSt, fusAO, true))));
  add('livery', liveryUV(tagged(loftSt(aftSt, fusAO))));
  // Matte anti-glare panel along the crown of the cowling, narrowing toward
  // the spinner as the cowl's top does.
  {
    const crown = (st) => {
      const h = halfSection(st).slice(N_KEEL + N_WALL + 6).map(([x, y]) => [x * 1.012, y + 0.005]);
      return h.concat(h.slice(0, -1).reverse().map(([x, y]) => [-x, y]));
    };
    add('deck', loftSt(fwdSt.filter((st) => st.z <= 3.8 && st.z >= 0.2), null, false, crown));
  }
  // Cabin sill ledges.
  for (const sx of [1, -1]) add('paint', tube([[sx * CAN.ww, SILL, 0.15], [sx * (CAN.ww + 0.004), SILL, -0.7], [sx * CAN.ww, SILL, CAN.zR]], 0.024, 16, 8));
  // Hopper: the lid on the crown ahead of the windshield (raised rim, dark
  // fibreglass), its hinges and the latch handle.
  {
    const lidRing = (st) => {
      const h = halfSection(st).slice(N_KEEL + N_WALL + 8);
      const nrm = ([x, y], k) => { const [x0, y0] = h[Math.max(0, k - 1)], [x1, y1] = h[Math.min(h.length - 1, k + 1)], l = Math.hypot(x1 - x0, y1 - y0) || 1; return [(y1 - y0) / l, -(x1 - x0) / l]; };
      const top = h.map((p, k) => { const [nx, ny] = nrm(p, k); return [p[0] + nx * 0.022, p[1] + ny * 0.022]; });
      const [ex, ey] = h[0], [nx, ny] = nrm(h[0], 0);
      const right = [[ex + nx * 0.004, ey + ny * 0.004], ...top];
      return right.concat(right.slice(0, -1).reverse().map(([x, y]) => [-x, y]));
    };
    add('lid', loftSt(sampleSt(FWD_KEYS, 20).filter((st) => st.z <= 1.45 && st.z >= 0.7), fusAO, false, lidRing));
    const yl = (z) => halfSection(sampleSt(FWD_KEYS, 20).reduce((a, b) => (Math.abs(b.z - z) < Math.abs(a.z - z) ? b : a)))[N_KEEL + N_WALL + N_TOP][1];
    for (const sx of [-0.17, 0.17]) {
      add('steel', tx(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 10), sx, yl(0.68) + 0.012, 0.68, 0, 0, Math.PI / 2));
      add('steel', rbox(0.045, 0.026, 0.06, 0.01, sx, yl(1.48) + 0.01, 1.48, -0.05), true);
    }
    add('steel', rod([-0.1, yl(1.47) + 0.035, 1.47], [0.1, yl(1.47) + 0.035, 1.47], 0.011, 8));
  }
  // Hopper loading couplers (both sides, just aft of the wing) and the pipe
  // forward along the belly; gatebox under the hopper.
  for (const sx of [1, -1]) {
    const cx = fusX(-1.5, -0.17);
    add('dark', tx(new THREE.CylinderGeometry(0.075, 0.075, 0.11, 18), sx * (cx + 0.02), -0.17, -1.5, 0, 0, Math.PI / 2));
    add('brass', tx(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 18), sx * (cx + 0.085), -0.17, -1.5, 0, 0, Math.PI / 2));
  }
  add('alu', tube([[-1.5, -0.19], [-0.9, -0.27], [0.0, -0.32], [0.7, -0.34]].map(([z, y]) => [fusX(z, y) + 0.035, y, z]), 0.04, 18, 8));
  // Gatebox under the hopper: cast aluminium body on a bolted flange, the
  // dump-gate lever on its side and the hopper drain valve ahead of it;
  // boarding step and grab handle by the right-hand door.
  {
    const gy = -0.405;
    add('alu', rbox(0.6, 0.035, 0.84, 0.012, 0, gy, 0.95));
    add('alu', rbox(0.52, 0.15, 0.74, 0.04, 0, gy - 0.075, 0.95));
    add('dark', rbox(0.4, 0.04, 0.58, 0.012, 0, gy - 0.155, 0.95));
    for (let k = 0; k < 8; k++) for (const sx of [1, -1]) add('steel', tx(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 6), sx * 0.285, gy + 0.022, 0.58 + k * 0.105), true);
    add('steel', rod([0.27, gy - 0.07, 1.25], [0.31, gy - 0.05, 0.7], 0.012, 6), true);
    add('dark', rbox(0.06, 0.05, 0.08, 0.01, 0, gy - 0.1, 1.42), true);
  }
  {
    const sx0 = fusX(-0.72, 0.2);
    add('steel', rod([-sx0 + 0.005, 0.2, -0.72], [-sx0 - 0.05, -0.05, -0.72], 0.014, 8));
    add('steel', rbox(0.16, 0.016, 0.11, 0.004, -sx0 - 0.08, -0.055, -0.72), true);
    const hx = fusX(0.0, 0.91);
    add('steel', tube([[-hx, 0.87, 0.05], [-hx - 0.035, 0.91, 0.0], [-hx - 0.035, 0.91, -0.18], [-hx, 0.87, -0.23]], 0.011, 10, 6), true);
  }
  // PT6A exhaust stacks: oval pipes out of the cowling sides just behind the
  // prop, at the spinner's height.
  for (const sx of [1, -1]) {
    const pts = [[sx * 0.3, 0.3, 3.46], [sx * 0.44, 0.3, 3.44], [sx * 0.53, 0.295, 3.36], [sx * 0.58, 0.29, 3.2]];
    const pipe = tube(pts, 0.07, 22, 14);
    const p = pipe.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, 0.3 + (p.getY(i) - 0.3) * 1.3); // oval section
    pipe.computeVertexNormals();
    add('exhaust', pipe);
    // Dark throat just inside the open end, facing aft along the pipe.
    const end = new THREE.Vector3(...pts[3]), dir = end.clone().sub(new THREE.Vector3(...pts[2])).normalize();
    const throat = new THREE.CircleGeometry(0.066, 18).scale(1, 1.3, 1);
    throat.applyMatrix4(new THREE.Matrix4().compose(end.clone().addScaledVector(dir, -0.03), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().negate()), new THREE.Vector3(1, 1, 1)));
    add('gloss', throat);
  }
  // Cowl front (nose bowl): a face round the spinner with the PT6 air inlet
  // under it (dark mouth, screen, duct) between the two landing lights; the
  // gap round the spinner; oil-cooler scoop under the cowling, drains.
  {
    const st0 = fwdSt[0], z0 = st0.z;
    const face = new THREE.Shape(sectionRing(st0).slice(0, -1).map(([x, y]) => new THREE.Vector2(x * 0.995, y)));
    const hole = new THREE.Path(); hole.absarc(0, 0.3, 0.264, 0, Math.PI * 2, true); face.holes.push(hole);
    const mouth = new THREE.Path(); mouth.absellipse(0, -0.06, 0.16, 0.085, 0, Math.PI * 2, true); face.holes.push(mouth);
    add('paint', shade(tagged(tx(new THREE.ShapeGeometry(face, 24), 0, 0, z0 - 0.004)), () => 0.86));
    add('paint', tx(new THREE.TorusGeometry(0.27, 0.014, 8, 44), 0, 0.3, z0 - 0.004));
    add('dark', tx(new THREE.CylinderGeometry(0.264, 0.264, 0.1, 44, 1, true), 0, 0.3, z0 - 0.05, Math.PI / 2));
    // Inlet duct: elliptical, dark inside, a screen across the mouth.
    const duct = new THREE.CylinderGeometry(1, 1, 0.34, 28, 1, true).rotateX(Math.PI / 2).scale(0.16, 0.085, 1);
    const ductM = new THREE.Mesh(duct, new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.9, side: THREE.BackSide }));
    ductM.position.set(0, -0.06, z0 - 0.17);
    root.add(ductM);
    add('gloss', tx(new THREE.CircleGeometry(1, 28).scale(0.16, 0.085, 1), 0, -0.06, z0 - 0.33));
    add('paint', tx(new THREE.TorusGeometry(1, 0.11, 8, 36).scale(0.165, 0.09, 0.12), 0, -0.06, z0 - 0.004));
    for (let k = -3; k <= 3; k++) add('steel', tx(new THREE.BoxGeometry(0.3, 0.005, 0.005), 0, -0.06 + k * 0.022, z0 - 0.03), true);
    for (const sx of [1, -1]) {
      add('lens', ball([sx * 0.235, 0.13, z0 - 0.03], 0.052, 14));
      add('white', tx(new THREE.CircleGeometry(0.038, 16), sx * 0.235, 0.13, z0 - 0.02));
      add('steel', tx(new THREE.TorusGeometry(0.055, 0.008, 6, 20), sx * 0.235, 0.13, z0 - 0.003), true);
    }
  }
  add('paint', rbox(0.3, 0.12, 0.5, 0.04, 0, -0.39, 2.35, -0.08));
  add('dark', tx(new THREE.PlaneGeometry(0.24, 0.07), 0, -0.395, 2.6, -0.08));
  for (const sx of [-0.08, 0.08]) add('steel', rod([sx, -0.33, 2.05], [sx, -0.4, 2.0], 0.008, 6), true);
  // Spinner: long and pointed as on the AT-502B's Hartzell prop, polished,
  // with a backplate.
  const spinner = lathe([[0.0, 0.54], [0.03, 0.51], [0.075, 0.45], [0.12, 0.37], [0.165, 0.27], [0.205, 0.17], [0.235, 0.08], [0.25, 0]].reverse(), 40);
  spinner.rotateX(Math.PI / 2);
  const spinnerMesh = new THREE.Mesh(mergeGeometries([tagged(spinner), tagged(tx(new THREE.CylinderGeometry(0.258, 0.258, 0.02, 40), 0, 0, -0.005, Math.PI / 2))]), M.polished);
  spinnerMesh.castShadow = true;

  // ---------------- canopy ----------------
  // Glasshouse built from horizontal plan rings, sill to crown: each ring's
  // sides follow the glasshouse section (canW: leaning in from the sill
  // ledge to a narrow rounded roof); its front is the three-piece
  // windshield: the flat centre pane on the raked line canF, then two flat
  // side panes angled back to the A-posts; its rear is the turtle deck's
  // first section at CAN.zR, so the roof flows straight into the deck. Glass
  // up to CAN.glassTop, painted fibreglass roof above it.
  const RN = { side: 12, corner: 6, front: 4 };
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
  // A-post (the side pane's rear edge) at height y.
  const aPostAt = (y) => { const w = canW(y), c = Math.min(wsC(y), w * 0.6); return [w, y, Math.max(CAN.zR + 0.05, canF(y) - (w - c) * WS_K)]; };
  // Surface through rings at the given heights (outward faces).
  const ringSurface = (ys, shrink = 0) => {
    const rings = ys.map((y) => ringAt(y, shrink));
    const n = rings[0].length, pos = [], idx = [];
    for (const r of rings) for (const p of r) pos.push(...p);
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
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
  add('livery', liveryUV(tagged(ringSurface(roofYs))));
  // Roof lining (inside) and the cabin's rear bulkhead top, closing the
  // turtle deck's open front behind the seat.
  const headliner = tagged(ringSurface(roofYs.map((y) => y - 0.012), 0.012));
  {
    const s = new THREE.Shape();
    const y0 = SILL + 0.38, n = 14;
    s.moveTo(-canW(y0), y0);
    for (let i = 1; i <= n; i++) { const y = y0 + ((CAN.yt - y0) * i) / n; s.lineTo(-canW(y), y); }
    for (let i = n - 1; i >= 0; i--) { const y = y0 + ((CAN.yt - y0) * i) / n; s.lineTo(canW(y), y); }
    s.closePath();
    add('interior', tx(new THREE.ShapeGeometry(s, 4), 0, 0, CAN.zR - 0.004));
  }
  // Frame: painted tubes outside, the same yellow inside. Posts follow the
  // glasshouse: the two posts either side of the centre pane, the A-posts
  // behind the side panes, the door post behind the pilot, the rear post
  // where the glass meets the deck, the sill and the roof rail.
  const cabC = new THREE.Vector3(0, 1.2, -0.7);
  const frame = (pts, r = 0.028, rIn = r * 0.85) => {
    add('paint', tube(pts, r, Math.max(6, pts.length * 3), 10));
    const mid = new THREE.Vector3(...pts[Math.floor(pts.length / 2)]);
    const inw = cabC.clone().sub(mid).normalize().multiplyScalar(r * 0.55);
    add('frameIn', tube(pts.map((p) => [p[0] + inw.x, p[1] + inw.y, p[2] + inw.z]), rIn, Math.max(6, pts.length * 3), 8));
  };
  const hs = (f) => Array.from({ length: 7 }, (_, j) => f(SILL + 0.01 + ((CAN.glassTop - SILL - 0.01) * j) / 6));
  const ringEdge = (y) => { const r = ringAt(y); return r.filter((_, i) => i % 2 === 0 || i === r.length - 1); };
  frame(ringEdge(SILL + 0.012), 0.026, 0.018);
  frame(ringEdge(CAN.glassTop), 0.03, 0.024);
  // Windshield base fairing on the hopper deck, along the three panes.
  { const r = ringAt(SILL + 0.022); add('paint', tube(r.slice(RN.side, r.length - RN.side), 0.034, 32, 10)); }
  for (const sx of [1, -1]) {
    frame(hs((y) => [sx * Math.min(wsC(y), canW(y) * 0.6), y, canF(y) + 0.004]), 0.024, 0.02); // centre-pane post
    const aPost = (y) => { const p = aPostAt(y); return [sx * p[0], p[1], p[2]]; };
    frame(hs(aPost), 0.03, 0.024);
    frame(hs((y) => [sx * canW(y), y, -1.15]), 0.026, 0.02);
    frame(hs((y) => [sx * canW(y), y, CAN.zR + 0.03]), 0.03, 0.024);
    for (const p of [aPost(SILL + 0.012), aPost(CAN.glassTop), [sx * canW(SILL), SILL + 0.012, -1.15], [sx * canW(CAN.glassTop), CAN.glassTop, -1.15]]) add('paint', ball(p, 0.032));
    // Door handle and the door's top hinges on the roof rail.
    add('steel', rod([sx * (canW(SILL + 0.2) + 0.012), SILL + 0.2, -0.98], [sx * (canW(SILL + 0.2) + 0.012), SILL + 0.2, -0.84], 0.01, 6));
    for (const hz of [-0.55, -0.95]) add('steel', tx(new THREE.CylinderGeometry(0.013, 0.013, 0.05, 8), sx * (canW(CAN.glassTop) - 0.01), CAN.glassTop + 0.02, hz, 0, 0, Math.PI / 2));
  }
  // Wire cutter ahead of the windshield, deflector cable from the roof to
  // the fin top, GPS dome and whip antenna on the roof.
  add('dark', rod([0, 1.09, 0.48], [0, 2.05, -0.36], 0.012, 8));
  add('steel', tx(new THREE.BoxGeometry(0.014, 0.5, 0.06), 0, 1.97, -0.3, 0.75));
  add('steel', rod([0, CAN.yt + 0.02, -0.8], [0, 2.38, -5.3], 0.006, 5));
  add('dark', tx(new THREE.SphereGeometry(0.065, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, CAN.yt - 0.005, -1.1, 0, 0, 0, [1, 0.45, 1]), true);
  add('steel', rod([0.14, CAN.yt - 0.03, -1.05], [0.14, CAN.yt + 0.4, -1.35], 0.005, 5), true);

  // ---------------- wing ----------------
  const W = AT_WING;
  const leY = (x) => atWingY(x);
  const mainProf = airfoil(0, 0.74, 0.15, 0.04, 0.4, 18), aftProf = airfoil(0.76, 1.0, 0.15, 0.04, 0.4, 6);
  const flaps = [], ailerons = [];
  const wingAO = (x, xc, lower) => (lower ? 1 : 1 - 0.28 * Math.max(0, 1 - (x - 0.62) / 0.6));
  const surfaceMesh = (geo, x0, x1, side) => {
    const hz = W.le - 0.76 * W.chord;
    const hx = (side * (x0 + x1)) / 2;
    const pivot = new THREE.Group();
    pivot.position.set(hx, leY(hx) + 0.025, hz);
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
  const flapEnd = 4.4;
  for (const side of [1, -1]) {
    const st = (x) => ({ x, y: leY(x), le: W.le, chord: W.chord });
    // From the centreline: the wing's lower surface is the belly under the cabin.
    wingParts.push(atWingPanel([0.0, W.rootX, 1.0, 1.6, 2.6, 3.8, 5.0, 6.2, 7.2, W.tipX].map(st), mainProf, side, wingAO));
    wingParts.push(atWingPanel([st(0.0), st(W.rootX + 0.05)], aftProf, side, wingAO));
    flaps.push(surfaceMesh(atWingPanel([W.rootX + 0.06, 1.6, 2.8, flapEnd - 0.02].map(st), aftProf, side, wingAO), W.rootX + 0.06, flapEnd - 0.02, side));
    ailerons.push(surfaceMesh(atWingPanel([flapEnd + 0.04, 5.6, 6.8, W.tipX - 0.02].map(st), aftProf, side), flapEnd + 0.04, W.tipX - 0.02, side));
    // Squared tip with a rounded fairing cap (blue band continues on it).
    const tipSt = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      tipSt.push({ x: W.tipX + 0.12 * Math.sin((t * Math.PI) / 2), y: leY(W.tipX) + 0.01 * t, le: W.le - 0.02 * t, chord: W.chord * (1 - 0.06 * t * t) });
    }
    add('blue', wingPanel(tipSt, airfoil(0, 1, 0.15 * 0.85, 0.04, 0.4, 16), side));
    // Root fillet.
    const fil = mainProf.slice(0, 19).map(([xc, yc]) => { const y = W.rootY + yc * W.chord + 0.012, z = W.le - xc * W.chord; return [side * fusX(z, y), y, z]; });
    wingParts.push(tube(fil, 0.06, 30, 10));
    // Nav light + strobe at the tip, landing light in the leading edge.
    const tipLE = [side * (W.tipX + 0.06), leY(W.tipX) + 0.05, W.le - 0.08];
    add(side > 0 ? 'red' : 'green', ball(tipLE, 0.032, 10));
    add('lens', tx(new THREE.SphereGeometry(0.065, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), ...tipLE, 0, 0, side * Math.PI / 2, [1, 1, 1.4]));
    add('strobe', ball([side * (W.tipX + 0.1), leY(W.tipX) + 0.05, W.le - 0.6], 0.025, 8));
    add('lens', tx(new THREE.CircleGeometry(0.055, 18), side * 3.0, leY(3.0) + 0.02, W.le + 0.004));
    add('steel', tx(new THREE.CircleGeometry(0.042, 16), side * 3.0, leY(3.0) + 0.02, W.le - 0.002), true);
    // Walkway and fuel filler cap on top of the integral tank.
    {
      const up = mainProf.slice(0, 19).filter(([xc]) => xc > 0.12 && xc < 0.62);
      const sheet = up.map(([xc, yc]) => [xc, yc + 0.004]).concat(up.slice().reverse().map(([xc, yc]) => [xc, yc + 0.0005]));
      add('deck', atWingPanel([0.66, 0.95, 1.22].map(st), sheet, side));
    }
    add('dark', tx(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 20), side * 2.1, leY(2.1) + 0.105, -0.55));
    add('steel', tx(new THREE.BoxGeometry(0.11, 0.012, 0.022), side * 2.1, leY(2.1) + 0.125, -0.55), true);
    for (const hx of [1.2, 2.4, 3.6, 4.9, 6.1, 7.2]) {
      add('dark', tx(new THREE.BoxGeometry(0.035, 0.08, 0.14), side * hx, leY(hx) - 0.08, W.le - 0.76 * W.chord + 0.02, 0, 0, side * Math.atan(DIH)), true);
    }
    add('steel', tx(new THREE.TorusGeometry(0.028, 0.007, 6, 12), side * 5.2, leY(5.2) - 0.14, -0.2, 0, Math.PI / 2), true);
  }
  // Pitot under the left wing; stall-warning vane in the left leading edge.
  add('steel', rod([4.6, leY(4.6) - 0.12, 0.62], [4.6, leY(4.6) - 0.12, 1.15], 0.01, 8), true);
  add('steel', rod([4.6, leY(4.6) - 0.02, 0.5], [4.6, leY(4.6) - 0.12, 0.66], 0.011, 6), true);
  add('steel', tx(new THREE.BoxGeometry(0.004, 0.035, 0.03), 2.6, leY(2.6) - 0.01, W.le + 0.02), true);
  for (const g of wingParts) add(g.attributes.uv && g.attributes.color ? 'wing' : 'paint', g);

  // ---------------- tail ----------------
  const stabY = 0.42;
  const stabStations = [
    { x: 0.08, y: stabY, le: -4.95, chord: 1.0 }, { x: 1.6, y: stabY + 0.01, le: -5.0, chord: 0.9 },
    { x: 2.6, y: stabY + 0.015, le: -5.05, chord: 0.8 }, { x: 2.72, y: stabY + 0.016, le: -5.08, chord: 0.72 }, { x: 2.78, y: stabY + 0.017, le: -5.12, chord: 0.62 },
  ];
  const elevParts = [];
  for (const side of [1, -1]) {
    add('paint', wingPanel(stabStations, airfoil(0, 0.62, 0.1, 0, 0.4, 12), side));
    elevParts.push(tagged(wingPanel(stabStations.slice(0, 3), airfoil(0.64, 1, 0.1, 0, 0.4, 4), side)));
    // Lift strut from the lower fuselage to the stabiliser, with end fittings.
    add('steel', rod([side * 1.45, stabY - 0.04, -5.3], [side * 0.14, 0.14, -5.0], 0.02, 8));
    for (const p of [[side * 1.45, stabY - 0.04, -5.3], [side * 0.14, 0.14, -5.0]]) add('steel', ball(p, 0.03, 8), true);
  }
  elevParts.push(tagged(tx(new THREE.BoxGeometry(0.5, 0.014, 0.1), 0.7, stabY + 0.005, -4.95 - 0.98 - 0.04)));
  const elevGeo = mergeGeometries(elevParts);
  const elevHingeZ = -4.95 - 0.64 * 1.0;
  elevGeo.translate(0, -stabY, -elevHingeZ);
  const elevator = new THREE.Group();
  elevator.position.set(0, stabY, elevHingeZ);
  const elevMesh = new THREE.Mesh(elevGeo, M.paint);
  elevMesh.castShadow = true; elevMesh.receiveShadow = true;
  elevator.add(elevMesh);
  root.add(elevator);
  // Fin + rudder (vertical airfoils), blue via the livery projection.
  const finSt = [[0.62, -4.5, 1.32], [1.4, -4.84, 1.02], [2.2, -5.17, 0.74], [2.3, -5.23, 0.66], [2.37, -5.29, 0.56]];
  const vfin = (prof, sts) => {
    const g = wingPanel(sts.map(([h, le, c]) => ({ x: h, y: 0, le, chord: c })), prof, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getY(i), p.getX(i), p.getZ(i));
    // Swapping x and y mirrors the panel: turn its faces back outward.
    return flipWinding(g);
  };
  add('livery', liveryUV(tagged(vfin(airfoil(0, 0.64, 0.11, 0, 0.4, 12), finSt))));
  // Dorsal fillet: rises out of the turtle deck into the fin leading edge.
  add('livery', liveryUV(tagged(loft(sampleStations([
    K(-3.55, 0.012, 0.97, 0.95, 0.99, 2.2, 2.2), K(-3.95, 0.04, 0.93, 0.9, 1.02, 2.0, 2.2), K(-4.3, 0.058, 0.89, 0.86, 1.08, 2.0, 2.2),
    K(-4.6, 0.062, 0.85, 0.82, 1.18, 2.0, 2.2), K(-4.82, 0.058, 0.82, 0.79, 1.36, 2.0, 2.2),
  ], 20), 12, null))));
  // Rudder on a slanted hinge line (64 % chord).
  const hb = [0, 0.62, -4.5 - 0.64 * 1.32], ht = [0, 2.37, -5.29 - 0.64 * 0.56];
  const tilt = Math.atan2(ht[2] - hb[2], ht[1] - hb[1]);
  const rudder = new THREE.Group();
  rudder.position.set(...hb);
  rudder.rotation.x = tilt;
  rudder.updateMatrix();
  const rudGeo = liveryUV(tagged(vfin(airfoil(0.66, 1, 0.11, 0, 0.4, 5), finSt)));
  const rudTab = tagged(tx(new THREE.BoxGeometry(0.014, 0.34, 0.09), 0, 0.95, -4.5 - 1.32 * 0.98));
  const inv = rudder.matrix.clone().invert();
  rudGeo.applyMatrix4(inv); rudTab.applyMatrix4(inv);
  const rudMesh = new THREE.Mesh(rudGeo, M.livery);
  rudMesh.castShadow = true;
  rudder.add(rudMesh, new THREE.Mesh(rudTab, M.blue));
  root.add(rudder);
  // Beacon on the fin cap, tail light, tail tie-down.
  add('beacon', tx(new THREE.SphereGeometry(0.045, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 2.385, -5.42));
  add('white', ball([0, 0.36, -5.67], 0.03, 10));
  add('steel', tx(new THREE.TorusGeometry(0.032, 0.008, 6, 12), 0, 0.12, -5.2, 0, Math.PI / 2), true);

  // ---------------- landing gear ----------------
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
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        parts.push(tagged(tx(new THREE.CylinderGeometry(0.012, 0.012, 0.022, 8), sx * Wd * 0.33, Math.cos(a) * rim * 0.55, Math.sin(a) * rim * 0.55, 0, 0, Math.PI / 2)));
      }
      parts.push(tagged(tx(new THREE.SphereGeometry(rim * 0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), sx * Wd * 0.31, 0, 0, 0, 0, -sx * Math.PI / 2)));
      parts.push(tagged(rod([sx * Wd * 0.38, rim * 0.92, 0], [sx * Wd * 0.46, rim * 0.98, 0], 0.006, 6)));
    }
    spin.add(tmesh, new THREE.Mesh(mergeGeometries(parts), M.hub));
    return spin;
  };
  for (const [name, sx] of [['mainL', 1], ['mainR', -1]]) {
    const cfg = gearCfg[name];
    const R = cfg.radius, Wd = 0.28;
    const ax = cfg.p[0], ay = cfg.p[1] + R, az = cfg.p[2];
    const g = new THREE.Group();
    // Spring-steel leg: a tapered flat leaf from the gear box under the wing
    // root, just ahead of the leading edge, down and out to the axle fitting
    // (the long, splayed legs give the type its tall stance); scaled with the
    // spring deflection.
    const attachY = W.rootY - 0.06, attachX = 0.66, attachZ = W.le + 0.08;
    const leg = new THREE.Group();
    leg.position.y = attachY;
    const L = (p) => [p[0], p[1] - attachY, p[2]];
    const axIn = ax - sx * 0.17;
    const legParts = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const P = (t) => [lerp(sx * attachX, axIn, t), lerp(attachY, ay + 0.05, t) - 0.05 * Math.sin(Math.PI * t), lerp(attachZ, az, t)];
      legParts.push(bar(L(P(t0)), L(P(t1)), lerp(0.072, 0.045, (t0 + t1) / 2), lerp(0.18, 0.11, (t0 + t1) / 2)));
    }
    legParts.push(tx(new RoundedBoxGeometry(0.12, 0.16, 0.18, 2, 0.03), ...L([axIn, ay + 0.04, az])));
    legParts.push(rod(L([axIn, ay, az]), L([ax - sx * 0.02, ay, az]), 0.036, 12));
    const legMesh = new THREE.Mesh(mergeGeometries(legParts.map((p) => tagged(p))), M.paint);
    legMesh.castShadow = true; legMesh.receiveShadow = true;
    const brakeLine = new THREE.Mesh(tagged(tube([L([sx * (attachX + 0.02), attachY - 0.02, attachZ - 0.06]), L([(sx * attachX + axIn) / 2, (attachY + ay) / 2 - 0.05, (attachZ + az) / 2 - 0.08]), L([axIn - sx * 0.02, ay + 0.08, az - 0.08])], 0.008, 16, 6)), M.rubber);
    leg.add(legMesh, brakeLine);
    g.add(leg);
    // Gear box fairing: a blister under the wing root where the leaf enters,
    // blended into the fuselage side and the leading edge, with its bolted
    // cover plate.
    add('paint', tx(new THREE.SphereGeometry(1, 20, 12), sx * 0.62, attachY + 0.03, attachZ - 0.06, 0, 0, sx * 0.5, [0.13, 0.08, 0.2]));
    add('paint', tx(new THREE.SphereGeometry(1, 16, 10), sx * (fusX(attachZ, attachY + 0.12) - 0.02), attachY + 0.12, attachZ - 0.1, 0, 0, 0, [0.08, 0.16, 0.3]));
    add('steel', tx(new THREE.TorusGeometry(1, 0.08, 4, 18), sx * (attachX + 0.06), attachY - 0.06, attachZ - 0.02, Math.PI / 2, 0, sx * 0.5, [0.075, 0.12, 1]), true);
    const wheel = new THREE.Group();
    wheel.position.set(ax, ay, az);
    const spinPart = makeWheel(R, Wd, 0.17, sx, true);
    const brake = new THREE.Mesh(tagged(tx(new THREE.CylinderGeometry(0.15, 0.15, 0.014, 26), -sx * 0.115, 0, 0, 0, 0, Math.PI / 2)), M.steel);
    const caliper = new THREE.Mesh(tagged(new RoundedBoxGeometry(0.06, 0.09, 0.1, 2, 0.014).translate(-sx * 0.115, 0.11, -0.05)), M.dark);
    wheel.add(spinPart, brake, caliper);
    g.add(wheel);
    root.add(g);
    gearGroups[name] = { group: g, wheel, spin: spinPart, leg, legH: attachY - ay, rest: wheel.position.clone(), sx };
  }
  {
    const cfg = gearCfg.tail;
    const g = new THREE.Group();
    const R = cfg.radius;
    const fz = cfg.p[2] + 0.12, fy = cfg.p[1] + R + 0.1;
    add('dark', bar([0, 0.16, -5.12], [0, fy + 0.03, fz], 0.075, 0.02));
    add('dark', tx(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 12), 0, fy + 0.04, fz));
    const fork = new THREE.Group();
    fork.position.set(0, fy, fz);
    const forkGeo = mergeGeometries([
      tagged(tx(new THREE.BoxGeometry(0.014, 0.17, 0.06), 0.06, -0.05, -0.07, 0.6)), tagged(tx(new THREE.BoxGeometry(0.014, 0.17, 0.06), -0.06, -0.05, -0.07, 0.6)),
      tagged(tx(new THREE.BoxGeometry(0.13, 0.024, 0.06), 0, 0.025, -0.01)),
      tagged(rod([-0.075, 0.035, 0.05], [0.075, 0.035, 0.05], 0.009, 6)),
    ]);
    fork.add(new THREE.Mesh(forkGeo, M.steel));
    const wheel = new THREE.Group();
    wheel.position.set(0, -0.1, -0.12);
    wheel.add(makeWheel(R, 0.095, 0.075, 1, false));
    fork.add(wheel);
    g.add(fork);
    root.add(g);
    for (const sx of [1, -1]) add('steel', rod([sx * 0.075, fy + 0.035, fz + 0.05], [sx * 0.12, 0.3, -5.25], 0.005, 5), true);
    gearGroups.tail = { group: g, wheel, spin: wheel.children[0], fork, rest: wheel.position.clone(), sx: 0 };
  }

  // ---------------- spray system ----------------
  // The boom runs just aft of the trailing edge, below the flaps' trailing
  // edge at full deflection, on hangers from the fixed wing ahead of the flap
  // hinge (under the flaps' path): lowered flaps never pass through them.
  const nozzles = [];
  const hingeZ = W.le - 0.76 * W.chord;
  const boomZ = W.le - W.chord - 0.03, boomDrop = 0.3;
  for (const side of [1, -1]) {
    const x0 = 0.85, x1 = 7.05;
    const a = [side * x0, leY(x0) - boomDrop, boomZ], b = [side * x1, leY(x1) - boomDrop, boomZ];
    add('alu', rod(a, b, 0.03, 12));
    add('alu', ball(b, 0.036, 10));
    add('brass', tx(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 8), b[0] + side * 0.035, b[1], b[2], 0, 0, Math.PI / 2), true);
    for (const hx of [1.4, 2.6, 3.8, 5.0, 6.2]) {
      const top = [side * hx, leY(hx) - 0.04, hingeZ + 0.16], bot = [side * hx, leY(hx) - boomDrop, boomZ];
      add('alu', tx(rbox(0.018, 0.001 + Math.hypot(top[1] - bot[1], top[2] - bot[2]), 0.07, 0.008, 0, 0, 0), side * hx, (top[1] + bot[1]) / 2, (top[2] + bot[2]) / 2, Math.atan2(top[2] - bot[2], top[1] - bot[1])));
      add('dark', tx(new THREE.CylinderGeometry(0.036, 0.036, 0.035, 10), side * hx, leY(hx) - boomDrop, boomZ, 0, 0, Math.PI / 2), true);
    }
    const N = 25;
    for (let k = 0; k < N; k++) {
      const x = x0 + 0.1 + ((x1 - x0 - 0.2) * k) / (N - 1);
      const y = leY(x) - boomDrop;
      add('alu', rod([side * x, y, boomZ], [side * x, y - 0.07, boomZ - 0.02], 0.008, 6), true);
      add('dark', tx(new THREE.CylinderGeometry(0.019, 0.016, 0.05, 10), side * x, y - 0.1, boomZ - 0.03, 0.3), true);
      add('brass', tx(new THREE.ConeGeometry(0.011, 0.028, 8), side * x, y - 0.136, boomZ - 0.042, Math.PI + 0.3), true);
      nozzles.push(new THREE.Vector3(side * x, y - 0.14, boomZ - 0.042));
    }
  }
  add('alu', rod([0.85, leY(0.85) - boomDrop, boomZ], [-0.85, leY(0.85) - boomDrop, boomZ], 0.042, 12));
  add('alu', tube([[0, -0.41, 0.6], [0, -0.47, 0.1], [0, -0.53, -0.6], [0, leY(0.85) - boomDrop, boomZ]], 0.042, 24, 10));
  add('alu', ball([0, leY(0.85) - boomDrop, boomZ], 0.06, 12));
  // Fan-driven pump under the belly between the gear legs.
  const pump = new THREE.Group();
  pump.position.set(0, -0.61, 0.42);
  const pumpBody = lathe([[0.0, -0.24], [0.08, -0.23], [0.11, -0.15], [0.12, 0.06], [0.1, 0.18], [0.06, 0.23], [0.0, 0.24]], 24);
  pumpBody.rotateX(Math.PI / 2);
  pump.add(new THREE.Mesh(tagged(pumpBody), M.dark));
  pump.add(new THREE.Mesh(tagged(tx(new THREE.SphereGeometry(0.05, 14, 10), 0, 0, 0.25)), M.steel));
  const pumpFan = new THREE.Group();
  pumpFan.position.z = 0.27;
  for (let i = 0; i < 4; i++) {
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.009), M.yellow);
    bl.position.x = Math.cos((i * Math.PI) / 2) * 0.115;
    bl.position.y = Math.sin((i * Math.PI) / 2) * 0.115;
    bl.rotation.z = (i * Math.PI) / 2;
    bl.rotation.x = 0.35;
    pumpFan.add(bl);
  }
  pump.add(pumpFan);
  root.add(pump);
  add('steel', rod([0, -0.38, 0.42], [0, -0.51, 0.42], 0.03, 10));

  // ---------------- propeller (Hartzell-type, 3 blades, feathering) ----------------
  const R = A.propRadius;
  const prop = new THREE.Group();
  prop.position.set(0, 0.3, 3.96);
  prop.add(spinnerMesh);
  const blades = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.55, metalness: 0.25, transparent: true });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xf2c21b, roughness: 0.5, transparent: true });
  const bodyGeo = bladeLoft(0.2, R - 0.1, 16, R), tipGeo = bladeLoft(R - 0.1, R, 4, R);
  const pitchGroups = [];
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Group();
    b.rotation.z = (i * Math.PI * 2) / 3;
    const pg = new THREE.Group();
    const bm = new THREE.Mesh(bodyGeo, bladeMat);
    bm.castShadow = true;
    pg.add(bm, new THREE.Mesh(tipGeo, tipMat));
    // Blade shank and de-ice boot root (polished hub arm).
    pg.add(new THREE.Mesh(tagged(rod([0.12, 0, 0], [0.26, 0, 0], 0.045, 12)), M.polished));
    b.add(pg);
    blades.add(b);
    pitchGroups.push(pg);
  }
  prop.add(blades);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R + 0.01, 56), new THREE.MeshBasicMaterial({ map: propDiscTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.z = 0.02;
  disc.renderOrder = 11;
  prop.add(disc);
  root.add(prop);

  // ---------------- cockpit interior ----------------
  // After Air Tractor cockpits: an arched black panel under a padded
  // glareshield that follows the three-piece windshield, the instruments set
  // into the panel behind bezels, two switch panels and the hopper sight
  // window at the bottom; the guidance screen and the flow monitor on their
  // own mount on the right; the PT6 power quadrant on the left console; a
  // yellow airframe inside (walls, floor, tube frame), a red seat. Seen from
  // the seat, the long nose shows over the glareshield.
  const cockpit = new THREE.Group();
  const ci = {};
  const addC = (mat, g) => { (ci[mat] ||= []).push(tagged(g)); };
  const cabAO = (x, y, z) => 0.5 + 0.5 * smoothstep(0.0, 1.0, y) * (z < -1.3 ? 0.85 : 1);
  // Inner skin of the cabin walls (set in from the fuselage sides), floor
  // with rubber mats, the forward bulkhead under the panel and the rear
  // bulkhead behind the seat.
  const wallX = (z, y) => fusX(z, y) - 0.022;
  const Z0 = 0.12, Z1 = CAN.zR + 0.03, YF = 0.29;
  for (const sx of [1, -1]) {
    addC('frameIn', grid((u, v) => { const z = lerp(Z0, Z1, u), y = lerp(YF, SILL - 0.008, v); return [sx * wallX(z, y), y, z]; }, 18, 8, [sx * 3, 0.4, -0.7]));
    // Tube frame along the walls: a longeron and diagonals.
    const W = (z, y) => [sx * (wallX(z, y) - 0.016), y, z];
    for (const [a, b] of [[[0.1, 0.71], [-1.45, 0.71]], [[0.1, 0.37], [-0.55, 1.05]], [[-0.55, 0.37], [-0.55, 1.05]], [[-0.55, 0.37], [-1.15, 1.05]], [[-1.15, 0.37], [-1.15, 1.05]]]) {
      const pts = Array.from({ length: 6 }, (_, i) => W(lerp(a[0], b[0], i / 5), lerp(a[1], b[1], i / 5)));
      addC('frameIn', tube(pts, 0.016, 10, 8));
    }
  }
  {
    const s = new THREE.Shape();
    const n = 10, xs = (y) => wallX(Z0, y);
    s.moveTo(-xs(YF), YF);
    for (let i = 0; i <= n; i++) { const y = YF + ((SILL - YF) * i) / n; s.lineTo(xs(y), y); }
    for (let i = n; i >= 0; i--) { const y = YF + ((SILL - YF) * i) / n; s.lineTo(-xs(y), y); }
    addC('frameIn', tx(new THREE.ShapeGeometry(s, 2).rotateY(Math.PI), 0, 0, Z0));
    const r = new THREE.Shape();
    const xr = (y) => (y <= SILL ? wallX(Z1, y) : canW(y) - 0.02);
    r.moveTo(-xr(YF), YF);
    for (let i = 0; i <= 14; i++) { const y = YF + ((SILL + 0.38 - YF) * i) / 14; r.lineTo(xr(y), y); }
    for (let i = 14; i >= 0; i--) { const y = YF + ((SILL + 0.38 - YF) * i) / 14; r.lineTo(-xr(y), y); }
    addC('frameIn', tx(new THREE.ShapeGeometry(r, 2), 0, 0, Z1));
  }
  addC('frameIn', grid((u, v) => { const z = lerp(Z0, Z1, v), x = lerp(-1, 1, u) * wallX(z, YF); return [x, YF, z]; }, 6, 8, [0, -1, -0.7]));
  addC('floor', rbox(0.5, 0.012, 0.42, 0.004, 0, YF + 0.006, -0.08));
  addC('floor', rbox(0.56, 0.012, 0.5, 0.004, 0, YF + 0.006, -0.95));
  // Seat (red cushions), harness anchors.
  addC('seat', rbox(0.5, 0.12, 0.5, 0.045, ...o3(0, 0.05, -0.55)));
  addC('seat', rbox(0.5, 0.82, 0.12, 0.05, ...o3(0, 0.45, -0.8), -0.12));
  addC('seat', rbox(0.42, 0.22, 0.09, 0.04, ...o3(0, 0.98, -0.87), -0.12));
  addC('dark', rbox(0.54, 0.05, 0.52, 0.01, ...o3(0, -0.04, -0.55)));
  for (const sx of [1, -1]) {
    addC('steel', rod(o3(sx * 0.2, -0.24, -0.4), o3(sx * 0.2, -0.04, -0.55), 0.016, 8));
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.64, 0.01), M.harness);
    strap.position.set(...o3(sx * 0.12, 0.48, -0.74));
    strap.rotation.x = -0.12;
    cockpit.add(strap);
  }
  addC('steel', rbox(0.07, 0.05, 0.012, 0.01, ...o3(0, 0.2, -0.69), -0.12));

  // Instrument panel. Plane: lower edge at y 0.7, z -0.24, tilted back 10°
  // to face the pilot's eyes. Panel coordinates (u, v): u = -x (to the
  // pilot's right), v up the plane, w toward the pilot; 1 m = AT_PANEL.K px
  // of the panel texture.
  const P = AT_PANEL, KP = P.K, FH = P.FACE.h / KP, TILT = (10 * Math.PI) / 180;
  const PU = new THREE.Vector3(-1, 0, 0), PV = new THREE.Vector3(0, Math.cos(TILT), Math.sin(TILT));
  const PWn = new THREE.Vector3().crossVectors(PU, PV);
  const P0 = new THREE.Vector3(0, 0.7, -0.24);
  const pMat = new THREE.Matrix4().makeBasis(PU, PV, PWn).setPosition(P0);
  const pv = (y) => (y - 0.7) / Math.cos(TILT);
  const pAt = (x, y, w = 0) => P0.clone().addScaledVector(PU, -x).addScaledVector(PV, pv(y)).addScaledVector(PWn, w);
  // Outline (left half, world x/y): the arched top with broad rounded
  // shoulders (clear of the windshield's side panes), straight sides, the
  // lower step under the switch panels.
  const archCurve = new THREE.CatmullRomCurve3([[0.0, 1.24], [0.2, 1.238], [0.27, 1.231], [0.325, 1.214], [0.37, 1.185], [0.4, 1.145], [0.415, 1.1], [0.42, 1.05]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const arch = archCurve.getPoints(24).map((p) => [p.x, p.y]); // centre -> side
  const archY = (x) => { const ax = Math.abs(x); for (let i = 1; i < arch.length; i++) if (arch[i][0] >= ax) { const [x0, y0] = arch[i - 1], [x1, y1] = arch[i]; return y0 + ((ax - x0) / Math.max(1e-6, x1 - x0)) * (y1 - y0); } return arch[arch.length - 1][1]; };
  const halfOutline = [[0, 0.702], [0.29, 0.702], [0.3, 0.712], [0.3, 0.755], [0.31, 0.765], [0.39, 0.765], [0.415, 0.78], [0.42, 0.81], ...arch.slice().reverse()];
  const outline = () => {
    const R = halfOutline.map(([x, y]) => new THREE.Vector2(x, pv(y)));
    const L = halfOutline.slice(1, -1).reverse().map(([x, y]) => new THREE.Vector2(-x, pv(y)));
    return R.concat(L);
  };
  const toUV = (u, v) => [(u + 0.45) / 0.9, 1 - (P.FACE.h - v * KP) / P.H];
  const inst = P.inst.map(([id, px, py, r]) => ({ id, u: px / KP - 0.45, v: (P.FACE.h - py) / KP, r: (r + 4) / KP }));
  const S = P.sight, sightR = { u0: S.x / KP - 0.45, u1: (S.x + S.w) / KP - 0.45, v0: (P.FACE.h - S.y - S.h) / KP, v1: (P.FACE.h - S.y) / KP };
  const panelShape = () => {
    const sh = new THREE.Shape(outline());
    for (const it of inst) { const h = new THREE.Path(); h.absarc(it.u, it.v, it.r, 0, Math.PI * 2, true); sh.holes.push(h); }
    const sw = new THREE.Path();
    sw.moveTo(sightR.u0, sightR.v0); sw.lineTo(sightR.u0, sightR.v1); sw.lineTo(sightR.u1, sightR.v1); sw.lineTo(sightR.u1, sightR.v0); sw.closePath();
    sh.holes.push(sw);
    return sh;
  };
  const uvFromPos = (g) => {
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { const [a, b] = toUV(p.getX(i), p.getY(i)); uv[i * 2] = a; uv[i * 2 + 1] = b; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  };
  const panelMat = new THREE.MeshStandardMaterial({ map: panel.texture, roughness: 0.6, metalness: 0.15, emissive: 0xffffff, emissiveMap: panel.texture, emissiveIntensity: 0.1 });
  const faceParts = [uvFromPos(new THREE.ShapeGeometry(panelShape(), 16))];
  // Instrument faces set 16 mm into the panel.
  for (const it of inst) faceParts.push(uvFromPos(new THREE.CircleGeometry(it.r, 36).translate(it.u, it.v, 0)).translate(0, 0, -0.016));
  const faceGeo = mergeGeometries(faceParts.map((g) => { g.deleteAttribute('normal'); g.computeVertexNormals(); return g; }));
  faceGeo.applyMatrix4(pMat);
  const panelMesh = new THREE.Mesh(faceGeo, panelMat);
  cockpit.add(panelMesh);
  // Panel body (thickness, instrument bores) and the bezels.
  {
    const body = new THREE.ExtrudeGeometry(panelShape(), { depth: 0.03, bevelEnabled: false, curveSegments: 16 });
    body.translate(0, 0, -0.032).applyMatrix4(pMat);
    addC('gloss', body);
    for (const it of inst) addC('gloss', new THREE.TorusGeometry(it.r + 0.002, 0.0045, 6, 36).translate(it.u, it.v, 0.001).applyMatrix4(pMat));
    // Hopper sight gauge behind its window.
    const sightMat = new THREE.MeshStandardMaterial({ map: panel.sightTexture, roughness: 0.4, emissive: 0xffffff, emissiveMap: panel.sightTexture, emissiveIntensity: 0.08 });
    const sight = new THREE.Mesh(new THREE.PlaneGeometry(sightR.u1 - sightR.u0, sightR.v1 - sightR.v0).translate((sightR.u0 + sightR.u1) / 2, (sightR.v0 + sightR.v1) / 2, -0.034).applyMatrix4(pMat), sightMat);
    cockpit.add(sight);
    // Toggle-switch bushings on the switch panels.
    for (const [x, y, w, , , labels] of P.switches) {
      const n = labels.length;
      for (let i = 0; i < n; i++) addC('steel', new THREE.CylinderGeometry(0.0055, 0.0065, 0.008, 10).rotateX(Math.PI / 2).translate((x + ((i + 0.5) * w) / n) / KP - 0.45, (P.FACE.h - y - 58) / KP, 0.004).applyMatrix4(pMat));
    }
  }
  // Glareshield: a padded roll along the arched top of the panel (its lip
  // overhangs the instruments) and the padded top running forward to the
  // windshield base along the three panes.
  {
    const N = 40;
    const path = [];
    for (let i = 0; i <= N; i++) { const x = lerp(-0.42, 0.42, i / N); path.push([x, archY(x)]); }
    const prof = [[0.0, -0.07], [0.012, -0.045], [0.02, -0.015], [0.02, 0.015], [0.012, 0.038], [-0.002, 0.052], [-0.016, 0.055], [-0.025, 0.045], [-0.028, 0.025], [-0.026, 0.004]];
    const frames = path.map(([x, y], i) => {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(N, i + 1)];
      const T = pAt(b[0], b[1]).sub(pAt(a[0], a[1])).normalize();
      const Nn = new THREE.Vector3().crossVectors(PWn, T).normalize();
      if (Nn.y < 0 && Math.abs(x) < 0.4) Nn.negate();
      if (Math.abs(x) >= 0.4 && Nn.x * x < 0) Nn.negate();
      return { P: pAt(x, y), N: Nn };
    });
    const lipPts = frames.map(({ P: p, N: n }) => prof.map(([a, b]) => p.clone().addScaledVector(n, a).addScaledVector(PWn, b)));
    const pos = [], idx = [], m = prof.length;
    for (const ring of lipPts) for (const q of ring) pos.push(q.x, q.y, q.z);
    for (let i = 0; i < N; i++) for (let k = 0; k < m - 1; k++) {
      const a = i * m + k, b = a + 1, c = a + m, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const lip = new THREE.BufferGeometry();
    lip.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lip.setIndex(idx);
    lip.computeVertexNormals();
    addC('pad', lip);
    // Top: from the roll's back edge to the windshield base, crowned.
    const zBase = (x) => canF(SILL) - Math.max(0, Math.abs(x) - wsC(SILL)) * WS_K;
    addC('pad', grid((u, v) => {
      const i = Math.round(u * N), back = lipPts[i][0];
      const x = back.x, fz = zBase(x) - 0.012, fy = SILL + 0.03;
      return [x, lerp(back.y, fy, v) + 0.018 * Math.sin(Math.PI * v), lerp(back.z, fz, v)];
    }, N, 5, [0, 0.5, -0.3]));
  }
  // Lightbar on the glareshield (guidance LEDs).
  const lightbar = new THREE.Group();
  lightbar.position.set(0, 1.22, -0.03);
  lightbar.rotation.x = -0.3;
  const leds = [];
  for (let i = -7; i <= 7; i++) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.014, 0.008), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    led.position.set(-i * 0.0155, 0, -0.016);
    lightbar.add(led);
    leds.push(led);
  }
  lightbar.add(new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.032, 0.03, 2, 0.006), M.dark));
  cockpit.add(lightbar);
  // Wet compass on the glareshield, right of centre.
  addC('gloss', rbox(0.07, 0.055, 0.07, 0.012, -0.16, 1.175, 0.0));
  addC('lens', tx(new THREE.SphereGeometry(0.03, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), -0.16, 1.2, -0.03, -Math.PI / 2));
  // Guidance unit and flow monitor on a mount to the right of the panel,
  // turned toward the pilot (their faces are regions of the panel texture).
  const eyeP = new THREE.Vector3(0, 1.0, -0.5).add(OFF);
  const unit = (c, w, h, d, R) => {
    const m = new THREE.Matrix4().lookAt(eyeP, c, new THREE.Vector3(0, 1, 0)).setPosition(c);
    const face = new THREE.PlaneGeometry(w, h);
    const uv = face.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (R.x + uv.getX(i) * R.w) / P.W, 1 - (R.y + (1 - uv.getY(i)) * R.h) / P.H);
    face.translate(0, 0, 0.001).applyMatrix4(m);
    const screenMat = new THREE.MeshStandardMaterial({ map: panel.texture, roughness: 0.25, metalness: 0, emissive: 0xffffff, emissiveMap: panel.texture, emissiveIntensity: 0.55 });
    cockpit.add(new THREE.Mesh(face, screenMat));
    addC('gloss', new RoundedBoxGeometry(w + 0.024, h + 0.024, d, 2, 0.008).translate(0, 0, -d / 2).applyMatrix4(m));
    return m;
  };
  const gm2 = unit(new THREE.Vector3(-0.3, 1.04, -0.33), 0.2, 0.128, 0.045, P.GPS);
  addC('gloss', new THREE.BoxGeometry(0.236, 0.006, 0.06).translate(0, 0.078, 0.03).applyMatrix4(gm2)); // sun hood
  for (const sx of [1, -1]) addC('gloss', new THREE.BoxGeometry(0.006, 0.08, 0.055).translate(sx * 0.115, 0.04, 0.028).applyMatrix4(gm2));
  addC('steel', rod([-0.3, 0.99, -0.31], [-0.36, 0.95, -0.22], 0.012, 8));
  unit(new THREE.Vector3(-0.3, 0.87, -0.33), 0.15, 0.079, 0.06, P.MON);
  // Console under them, down to the floor (switches, the dispersal box).
  addC('gloss', rbox(0.17, 0.5, 0.1, 0.01, -0.31, 0.58, -0.29));
  for (let k = 0; k < 4; k++) addC('steel', tx(new THREE.CylinderGeometry(0.006, 0.007, 0.012, 8), -0.27 - (k % 2) * 0.08, 0.75 - Math.floor(k / 2) * 0.07, -0.345, Math.PI / 2));
  // Stick (same grip geometry as the PR-AGW so the shared pilot's hand
  // fits): polished shaft in a rubber boot, black grip with the spray
  // trigger and the trim hat.
  const stick = new THREE.Group();
  stick.position.set(...o3(0, -0.22, -0.12));
  {
    const boot = new THREE.Mesh(lathe([[0.085, 0], [0.078, 0.02], [0.058, 0.06], [0.034, 0.1], [0.019, 0.14]], 16), M.rubber);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.56, 12), M.polished);
    shaft.position.y = 0.3;
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.029, 0.12, 6, 14), M.gloss);
    grip.position.set(0, 0.63, 0.012);
    grip.rotation.x = 0.22;
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.016, 12), M.red);
    btn.position.set(0, 0.718, 0.03);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.012, 8), M.steel);
    hat.position.set(0.016, 0.712, 0.018);
    const trig = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.035, 0.012), M.dark);
    trig.position.set(0, 0.62, 0.044);
    stick.add(boot, shaft, grip, btn, hat, trig);
  }
  cockpit.add(stick);
  const pedals = [];
  for (const sx of [1, -1]) {
    const p = new THREE.Group();
    p.position.set(...o3(sx * 0.17, -0.12, 0.42));
    p.rotation.x = -0.6;
    p.add(new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.17, 0.025, 2, 0.008), M.steel));
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.22, 8), M.steel);
    arm.position.set(0, -0.13, 0.03);
    p.add(arm);
    cockpit.add(p);
    pedals.push(p);
  }
  // Rudder cables (red) from the pedals forward under the panel.
  for (const sx of [1, -1]) addC('red', tube([o3(sx * 0.17, -0.2, 0.46), o3(sx * 0.2, -0.24, 0.52), [sx * 0.22, 0.33, Z0 - 0.01]], 0.004, 8, 4));
  // PT6 power quadrant on the left console: power lever (black T-handle),
  // prop lever (blue) and fuel condition lever (red), the friction knob.
  const THR = [0.33, 0.47, 0.08]; // power lever pivot, PR-AGW frame
  addC('gloss', rbox(0.11, 0.045, 0.38, 0.015, ...o3(0.36, 0.425, -0.02), 0.08));
  addC('gloss', rbox(0.09, 0.16, 0.42, 0.015, ...o3(0.4, 0.33, -0.04)));
  for (const lx of [0.33, 0.375, 0.405]) addC('dark', rbox(0.008, 0.004, 0.24, 0.002, ...o3(lx, 0.45, -0.01), 0.08)); // lever slots
  const throttle = new THREE.Group();
  throttle.position.set(...o3(...THR));
  {
    const tl = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.17, 8), M.steel);
    tl.position.y = 0.085;
    const tk = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.032, 0.036, 2, 0.01), M.gloss);
    tk.position.y = 0.17;
    throttle.add(tl, tk);
  }
  cockpit.add(throttle);
  for (const [lx, col, rot] of [[0.375, M.blue, 0.38], [0.405, M.red, 0.42]]) {
    const lv = new THREE.Group();
    lv.position.set(...o3(lx, 0.45, 0.02));
    lv.rotation.x = rot;
    const s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.15, 8), M.steel);
    s2.position.y = 0.075;
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), col);
    k.position.y = 0.15;
    lv.add(s2, k);
    cockpit.add(lv);
  }
  addC('steel', tx(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 12), ...o3(0.3, 0.46, -0.2), 0, 0, Math.PI / 2));
  // Right console: spray valve handle (hydraulic boom valve) and the red
  // hopper dump handle.
  addC('gloss', rbox(0.11, 0.06, 0.42, 0.015, ...o3(-0.36, 0.4, -0.2)));
  const valve = new THREE.Group();
  valve.position.set(...o3(-0.34, 0.44, -0.1));
  {
    const vl = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.18, 8), M.steel);
    vl.position.y = 0.09;
    const vk = new THREE.Mesh(new RoundedBoxGeometry(0.055, 0.032, 0.032, 2, 0.008), M.red);
    vk.position.y = 0.18;
    valve.add(vl, vk);
  }
  cockpit.add(valve);
  const er = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 8, 16, Math.PI), M.red);
  er.position.set(...o3(-0.38, 0.47, -0.32));
  er.rotation.y = Math.PI / 2;
  cockpit.add(er);
  const ext = new THREE.Mesh(mergeGeometries([tagged(lathe([[0, -0.14], [0.035, -0.14], [0.036, 0.1], [0.025, 0.14], [0.01, 0.16], [0, 0.16]], 16))]), M.red);
  ext.position.set(...o3(0.36, 0.05, -0.75));
  cockpit.add(ext);
  for (const [mat, parts] of Object.entries(ci)) {
    const g = mergeGeometries(parts);
    if (g.attributes.color) shade(g, cabAO);
    const m = new THREE.Mesh(g, M[mat]);
    m.receiveShadow = true;
    cockpit.add(m);
  }
  cockpit.add(new THREE.Mesh(headliner, M.headliner));
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
  root.add(glassMesh);
  root.traverse((o) => { if (o.isMesh && o.castShadow === undefined) o.castShadow = true; });

  // Prop blade angle: feathered when stopped on the ground, coming out of
  // feather as Np rises in the start, fine pitch at idle, coarser as the
  // governor absorbs power at speed, below fine (beta) on the ground at idle.
  let bladeAngle = 1.3, t = 0;
  const FEATHER = 1.3;
  const update = (dt, fm) => {
    t += dt;
    const o = fm.out;
    let target;
    if (fm.engine === 'off' && (o.onGround || fm.rpm < 150)) target = FEATHER;
    else if (fm.engine === 'cranking') target = lerp(FEATHER, 0.0, smoothstep(250, 900, fm.rpm));
    else if (fm.beta) target = -0.2;
    else target = 0.04 + 0.42 * smoothstep(15, 75, o.airspeed) + 0.12 * (fm.shaftPower / A.maxPower);
    bladeAngle += clamp(target - bladeAngle, -dt * 0.9, dt * 0.9);
    for (const pg of pitchGroups) pg.rotation.x = bladeAngle;
    // Anti-collision beacon and wingtip strobes while the engine runs.
    const on = fm.engine !== 'off';
    M.beacon.emissiveIntensity = on ? 0.6 + 2.4 * Math.max(0, Math.sin(t * 7.5)) ** 8 : 0;
    M.strobe.emissiveIntensity = on && t % 1.2 < 0.06 ? 4 : 0;
  };

  return {
    // New registration marks: only the livery canvas is redrawn.
    setReg(r) {
      const n = liveryTextures(r);
      M.livery.map.dispose(); M.livery.bumpMap.dispose();
      M.livery.map = n.map; M.livery.bumpMap = n.bump; M.livery.needsUpdate = true;
    },
    root, M,
    prop, blades, bladeMats: [bladeMat, tipMat], disc,
    ailerons, flaps, elevator, rudder,
    gear: gearGroups,
    stick, pedals, throttle, valve, leds, panelMesh,
    pumpFan, nozzles, pilot, cockpit, glassMesh,
    eye: new THREE.Vector3(0, 1.0, -0.5).add(OFF),
    fuelFiller: new THREE.Vector3(2.1, atWingY(2.1) + 0.12, -0.55),
    hopperPort: new THREE.Vector3(fusX(-1.5, -0.17) + 0.1, -0.17, -1.5),
    update,
  };
}
