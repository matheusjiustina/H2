// Procedural PZL-Mielec M-18B Dromader with its own markings (PR-DMD,
// fictional; AGRO WINGS). VISUAL ONLY: the physics (FLIGHT_M18), gear
// contact points and hard points live in src/config.js; the gear points are
// read here only to place the wheels.
// Body frame: +Z nose, +Y up, +X left wing; origin = CG (≈ 32 % MAC).
//
// Built with the shared helpers of the PR-AGW model, but nothing of the
// other airframes is reused: a slab-sided, boxy fuselage (high superellipse
// sections) with the long hopper bay ahead of a tall framed cabin and a
// turtle deck that runs down to a tall fin; an open-front NACA ring with the
// nine ASz-62IR cylinders exposed in front of it (finned barrels, heads,
// rocker boxes, push-rods), the reduction-gear nose case, the exhaust
// collector and the big stack on the right; a wing with a flat constant-
// chord centre section and tapered outer panels with dihedral and squared
// tips, two-piece flaps (the outer one on a swept hinge) and long ailerons;
// a strut-braced tailplane; forward-raked oleo main legs with big 800×260
// wheels; a 3.3 m four-blade constant-speed prop (black, yellow tips with a
// black band) on a bare hub; the spray booms under the trailing edge
// clearing the lowered flaps; a classic cockpit (split black boards with
// metric dials, the hopper's back wall with its litre scale between them,
// red-knobbed levers) around the same seated pilot as the other airplanes.
// Paint and lettering are a side-projected livery with a matching bump map;
// AO is baked into vertex colours; fine detail sits in a LOD.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { rng, clamp, smoothstep, lerp } from '../core/math.js';
import { FLIGHT_M18 } from '../config.js';
import {
  sampleStations, ring, loft, K, airfoil, wingPanel, flipWinding, tagged, shade, tx, rod, tube, bar, ball, rbox, lathe, patch, patchEdge,
  speckle, orangePeel, treadTexture, propDiscTexture, ribTexture, feltTexture, WING_SPAN_UV, buildPilot,
} from './model.js';
import { M18_PANEL, M18_HOPPER } from './dromaderPanel.js';

// ---------------------------------------------------------------- geometry
const DIH = Math.tan((5 * Math.PI) / 180); // outer panels (the centre section is flat)
export const M18_WING = { rootX: 0.62, centerX: 2.6, tipX: 8.85, rootY: -0.72, le: 0.75, rootChord: 2.6, tipChord: 1.7 };
const W = M18_WING;
export const m18WingY = (x) => W.rootY + Math.max(0, Math.abs(x) - W.centerX) * DIH;
export const m18Chord = (x) => {
  const a = Math.abs(x);
  return a <= W.centerX ? W.rootChord : lerp(W.rootChord, W.tipChord, (a - W.centerX) / (W.tipX - W.centerX));
};
const HUB_Y = 0.4, HUB_Z = 3.0; // thrust line / propeller plane
const EZ = 2.55; // cylinder plane of the radial
const SPAN_UV = 9.1;
const YELLOW = '#f3c21a';
const INK = '#151515';
const RED = '#c81e1e';
const WHITE = '#f2f1ea';
const FLAP_MAX = 0.5; // rad at full flap (types.js anim.flap)

// Pilot seated in the PR-AGW cockpit frame, moved to the Dromader's cabin.
const OFF = new THREE.Vector3(0, 0.42, -1.22);
const o3 = (x, y, z) => [x + OFF.x, y + OFF.y, z + OFF.z];

// Contact-shadow planform (see createContactShadow).
export const M18_SHADOW = { W: 19.5, L: 12, wing: [8.9, -1.85, 0.75], fus: [0.66, -1.9, 4.4], tail: [2.95, -6.2, -4.55], core: [6.2, 3.6] };

// Fuselage stations K(z, half-width, shoulder y, bottom y, top y, pU, pL):
// high exponents give the Dromader's flat sides and squarish corners.
// The cowl behind the engine is smaller than the cylinder circle and sits
// below the thrust line: the cylinder heads stand proud above it, as on the
// real aircraft.
const FWD_KEYS = [
  K(2.28, 0.58, 0.2, -0.36, 0.76, 2.3, 2.3), K(2.05, 0.61, 0.24, -0.41, 0.81, 2.5, 2.6),
  K(1.5, 0.63, 0.31, -0.5, 0.91, 3.1, 3.3), K(0.8, 0.62, 0.43, -0.58, 1.03, 4.2, 4.5),
  K(0.3, 0.61, 0.5, -0.62, 1.09, 5.0, 5.0), K(-0.4, 0.6, 0.56, -0.62, 1.14, 5.8, 5.0),
  K(-0.8, 0.6, 0.58, -0.61, 1.17, 6.0, 5.0),
];
// Cabin: the fuselage sides stop at the sill (1.0) and the glazed cabin
// stands on top; behind it the fuselage narrows quickly into a slim tail
// cone that carries the fin and tailplane low (reference side photo).
const SILL = 0.94;
const CAB_KEYS = [K(-0.8, 0.6, 0.58, -0.61, 1.17, 6, 5), K(-1.2, 0.6, 0.6, -0.6, 1.04, 6, 5), K(-2.0, 0.6, 0.6, -0.55, 1.04, 6, 5), K(-2.8, 0.6, 0.6, -0.44, 1.04, 6, 4.8)];
const AFT_KEYS = [
  K(-2.8, 0.6, 0.6, -0.44, 1.04, 6.0, 4.8), K(-3.1, 0.54, 0.55, -0.27, 0.86, 4.5, 4.4),
  K(-3.6, 0.44, 0.5, -0.12, 0.74, 3.4, 3.9), K(-4.2, 0.33, 0.45, 0.0, 0.68, 3.0, 3.4),
  K(-4.8, 0.23, 0.42, 0.1, 0.66, 2.7, 3.0), K(-5.3, 0.14, 0.42, 0.2, 0.62, 2.5, 2.7),
  K(-5.6, 0.035, 0.42, 0.32, 0.54, 2.5, 2.5),
];

// Livery: side projection (z, y); top half = left side (nose to the left),
// bottom half = right side (nose to the right), lettering upright on both.
const LV = { Z0: -6.7, Z1: 2.4, Y0: -1.0, Y1: 2.8, W: 2048, H: 1024, M: 6 };
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

// Red camel (the Dromader's badge) drawn as a filled silhouette.
function camel(g, x, y, s, col) {
  g.save();
  g.translate(x, y); g.scale(s, s);
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(-1.0, 0.1); g.quadraticCurveTo(-0.95, -0.35, -0.55, -0.4); // tail to rump
  g.quadraticCurveTo(-0.35, -0.95, -0.05, -0.45); // hump
  g.quadraticCurveTo(0.25, -0.5, 0.45, -0.75); // neck
  g.quadraticCurveTo(0.6, -1.0, 0.82, -0.92); g.lineTo(0.95, -0.8); g.lineTo(0.7, -0.7); // head
  g.quadraticCurveTo(0.55, -0.35, 0.35, -0.15); // throat
  g.lineTo(0.42, 0.75); g.lineTo(0.3, 0.75); g.lineTo(0.2, 0.05); // front leg
  g.lineTo(-0.35, 0.05); g.lineTo(-0.45, 0.75); g.lineTo(-0.57, 0.75); g.lineTo(-0.6, 0.1);
  g.closePath();
  g.fill();
  g.restore();
}

function liveryTextures(reg) {
  const c = canvas(LV.W, LV.H), b = canvas(LV.W, LV.H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  gb.fillStyle = '#808080';
  gb.fillRect(0, 0, LV.W, LV.H);
  orangePeel(gb, LV.W, LV.H, 61);
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
    // Oil-stained belly (radial engines leave their mark).
    const [, belly] = P(0, -0.3);
    const grd = g.createLinearGradient(0, belly, 0, oy + LV.H / 2);
    grd.addColorStop(0, 'rgba(70,55,25,0)');
    grd.addColorStop(1, 'rgba(70,55,25,0.3)');
    g.fillStyle = grd;
    g.fillRect(0, belly, LV.W, oy + LV.H / 2 - belly);
    // Black cheat line from the cowl to the tail, thinning aft.
    const cl = [[2.25, 0.3], [1.5, 0.36], [0.9, 0.42], [0.0, 0.47], [-1.3, 0.52], [-2.7, 0.55], [-4.4, 0.5], [-5.6, 0.46]];
    const hh = [0.045, 0.045, 0.045, 0.045, 0.042, 0.038, 0.03, 0.018];
    poly(cl.map(([z, y], i) => [z, y + hh[i]]).concat(cl.map(([z, y], i) => [z, y - hh[i]]).reverse()), INK);
    // Tail colours: white over red band across the upper fin and rudder,
    // where the reference aircraft wears its flag.
    poly([[-5.3, 1.9], [-5.25, 2.1], [-6.6, 2.1], [-6.6, 1.9]], WHITE);
    poly([[-5.36, 1.63], [-5.3, 1.9], [-6.6, 1.9], [-6.6, 1.63]], RED);
    // Panel seams with camloc / rivet rows: cowl, firewall, hopper bay,
    // cabin, aft fuselage frames, access doors.
    const seams = [
      [[2.25, -0.35], [2.25, 0.8]], [[1.5, -0.5], [1.5, 0.97]], [[0.45, -0.6], [0.45, 1.18]], [[-0.45, -0.6], [-0.45, 1.25]],
      [[-0.8, -0.6], [-0.8, 1.16]], [[-2.8, -0.44], [-2.8, 1.02]], [[-3.6, -0.12], [-3.6, 0.73]], [[-4.5, 0.05], [-4.5, 0.66]],
      [[-5.2, 0.2], [-5.2, 0.62]], [[1.15, 0.8], [-0.8, 0.92]], [[-0.8, 0.15], [-4.5, 0.4]],
    ];
    for (const s of seams) {
      line(g, s, 'rgba(90,65,0,0.3)', 2);
      line(gb, s, '#3c3c3c', 2.6);
      const [[za, ya], [zb, yb]] = s;
      const n = Math.max(2, Math.round(Math.hypot(za - zb, ya - yb) / 0.07));
      for (let k = 0; k <= n; k++) {
        const [px, py] = P(za + ((zb - za) * k) / n + 0.025, ya + ((yb - ya) * k) / n);
        g.fillStyle = 'rgba(90,70,0,0.25)'; g.fillRect(px - 1, py - 1, 2, 2);
        gb.fillStyle = '#5c5c5c'; gb.beginPath(); gb.arc(px, py, 1.4, 0, Math.PI * 2); gb.fill();
      }
    }
    const door = (z0, z1, y0, y1) => {
      const pts = [[z0, y0], [z1, y0], [z1, y1], [z0, y1], [z0, y0]];
      line(g, pts, 'rgba(90,65,0,0.36)', 2); line(gb, pts, '#383838', 2.8);
    };
    door(0.95, 0.2, -0.45, -0.1); // hopper side inspection door
    door(-4.15, -4.55, 0.3, 0.6); // radio bay
    door(-4.85, -5.1, 0.3, 0.55);
    // Exhaust soot along the right side behind the stack (left side lighter).
    {
      const [ax, ay] = P(1.0, side > 0 ? -0.35 : -0.4), [bx] = P(-0.9, -0.4);
      const sg = g.createLinearGradient(ax, 0, bx, 0);
      const k = side > 0 ? 0.18 : 0.45;
      sg.addColorStop(0, `rgba(25,20,15,${k})`);
      sg.addColorStop(0.6, `rgba(25,20,15,${k * 0.35})`);
      sg.addColorStop(1, 'rgba(25,20,15,0)');
      g.fillStyle = sg;
      g.beginPath(); g.ellipse((ax + bx) / 2, ay + 10, Math.abs(bx - ax) / 2, 0.16 * LV.ky, 0, 0, Math.PI * 2); g.fill();
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
    text(-3.3, 0.2, reg, 0.38, INK);
    text(0.15, 0.74, 'PZL M-18B DROMADER', 0.1, RED, 'italic bold');
    { const [px, py] = P(1.25, 0.76); camel(g, px, py, 0.12 * LV.ky, RED); }
    text(-1.95, 0.88, 'AGRO WINGS', 0.08, INK, 'italic bold');
    text(-1.95, 0.77, 'AVIAÇÃO AGRÍCOLA', 0.035, INK, 'bold');
    text(0.6, -0.42, 'AVGAS 100LL', 0.035, 'rgba(30,30,30,0.75)', 'bold');
    speckle(g, 0, oy, LV.W, LV.H / 2, 2800, side > 0 ? 27 : 28, 0.1);
  }
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}

// Wing skin: u = span / SPAN_UV, v = chord fraction (0 = LE).
function wingTextures() {
  const Wd = 2048, H = 512;
  const c = canvas(Wd, H), b = canvas(Wd, H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  g.fillStyle = YELLOW; g.fillRect(0, 0, Wd, H);
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, Wd, H);
  orangePeel(gb, Wd, H, 63);
  const X = (m) => (m / SPAN_UV) * Wd, Y = (f) => f * H;
  const r = rng(37);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(110,90,50,${0.03 + r() * 0.05})`;
    g.fillRect(r() * Wd, Y(0.1 + r() * 0.8), 2 + r() * 3, 30 + r() * 120);
  }
  // Bug and grit line on the leading edge.
  for (let i = 0; i < 1300; i++) {
    g.fillStyle = `rgba(60,45,30,${0.08 + r() * 0.15})`;
    g.fillRect(r() * Wd, Y(r() * 0.06), 1 + r() * 2, 1 + r() * 2);
  }
  const seam = (x0, y0, x1, y1, rivet = 0.06) => {
    g.strokeStyle = 'rgba(90,65,0,0.28)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    gb.strokeStyle = '#3e3e3e'; gb.lineWidth = 2.6;
    gb.beginPath(); gb.moveTo(x0, y0); gb.lineTo(x1, y1); gb.stroke();
    const n = Math.max(2, Math.round(Math.hypot((x1 - x0) / (Wd / SPAN_UV), ((y1 - y0) / H) * 2.3) / rivet));
    gb.fillStyle = '#5c5c5c';
    for (let k = 0; k <= n; k++) { gb.beginPath(); gb.arc(x0 + ((x1 - x0) * k) / n + 0.5, y0 + ((y1 - y0) * k) / n + 5, 1.4, 0, Math.PI * 2); gb.fill(); }
  };
  // Spars (front 25 %, rear 70 %), ribs every ≈ 0.45 m, the centre-section
  // joint, hinge line.
  for (const f of [0.12, 0.25, 0.7]) seam(X(0.3), Y(f), X(9.0), Y(f));
  for (let x = 0.9; x < 8.9; x += 0.45) seam(X(x), Y(0.0), X(x), Y(0.74), 0.065);
  g.fillStyle = 'rgba(40,20,0,0.5)'; g.fillRect(X(W.centerX) - 3, 0, 6, H);
  gb.fillStyle = '#1e1e1e'; gb.fillRect(X(W.centerX) - 3, 0, 6, H);
  g.fillStyle = 'rgba(40,20,0,0.45)'; g.fillRect(0, Y(0.742), Wd, 5);
  gb.fillStyle = '#202020'; gb.fillRect(0, Y(0.742), Wd, 6);
  // Outer-wing fuel tank access panels.
  for (const [a, bb] of [[3.2, 3.9], [4.2, 4.9]]) {
    g.strokeStyle = 'rgba(90,65,0,0.35)'; g.lineWidth = 2; g.strokeRect(X(a), Y(0.3), X(bb) - X(a), Y(0.25));
    gb.strokeStyle = '#383838'; gb.lineWidth = 2.6; gb.strokeRect(X(a), Y(0.3), X(bb) - X(a), Y(0.25));
  }
  speckle(g, 0, 0, Wd, H, 2800, 43, 0.08);
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}

const m18WingPanel = (stations, prof, side, ao) => {
  const g = wingPanel(stations, prof, side, ao);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * WING_SPAN_UV) / SPAN_UV);
  return g;
};

// Wide paddle blade of the four-blade constant-speed prop (twisted airfoil
// sections along +X).
function bladeLoft(r0, r1, steps, R) {
  const pos = [], idx = [];
  let n = 0;
  for (let i = 0; i <= steps; i++) {
    const r = r0 + ((r1 - r0) * i) / steps;
    const f = clamp((r - 0.3) / (R - 0.3), 0, 1);
    let c = 0.15 + 0.12 * Math.sin(Math.PI * Math.min(1, f * 0.95 + 0.08)) ** 0.5;
    if (f > 0.9) c *= 1 - ((f - 0.9) / 0.1) ** 2 * 0.55;
    const t = lerp(0.22, 0.07, f);
    const beta = Math.atan(2.2 / (2 * Math.PI * Math.max(r, 0.32)));
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

// One ASz-62 cylinder pointing along +Y from the crankcase: finned barrel,
// finned head, two rocker boxes, two push-rod tubes (local frame).
function cylinderParts(R0, R1) {
  const parts = { barrel: [], head: [], rod: [] };
  const fins = [];
  const L = R1 - R0, hb = L * 0.55;
  // Barrel: lathe with alternating fin rims.
  const nf = 12;
  for (let i = 0; i <= nf; i++) {
    const y = R0 + (hb * i) / nf;
    fins.push([0.072, y], [i % 2 ? 0.068 : 0.092, y + hb / nf / 2]);
  }
  parts.barrel.push(lathe(fins, 14));
  // Head: bigger cooling fins, domed top.
  const head = [];
  const nh = 8, h0 = R0 + hb, hh = L - hb;
  for (let i = 0; i <= nh; i++) {
    const y = h0 + (hh * 0.8 * i) / nh;
    head.push([0.08, y], [i % 2 ? 0.075 : 0.112 - 0.012 * (i / nh), y + (hh * 0.8) / nh / 2]);
  }
  head.push([0.07, R1 - 0.02], [0.04, R1], [0.0, R1 + 0.005]);
  parts.head.push(lathe(head, 14));
  // Rocker boxes (front side of the head) and push-rods from the crankcase.
  for (const s of [-1, 1]) {
    parts.head.push(tx(new RoundedBoxGeometry(0.055, 0.05, 0.07, 2, 0.012), s * 0.06, R1 - 0.05, 0.08));
    parts.rod.push(rod([s * 0.05, R0 + 0.02, 0.1], [s * 0.055, R1 - 0.07, 0.085], 0.009, 6));
  }
  // Spark-plug leads (front plug).
  parts.rod.push(rod([0, R1 - 0.1, 0.11], [0, R1 - 0.03, 0.13], 0.006, 5));
  return parts;
}

// ==========================================================================
export function createDromaderModel(panel, opts = {}) {
  const A = FLIGHT_M18;
  const root = new THREE.Group();
  root.name = 'dromader';
  const liv = liveryTextures('PR-DMD');
  const wtx = wingTextures();
  const coat = { roughness: 0.5, metalness: 0.0, specularIntensity: 0.3, clearcoat: 0.1, clearcoatRoughness: 0.35, envMap: opts.envMap ?? null, envMapIntensity: 0.3 };
  const ALBEDO = 0.84;
  const M = {
    paint: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(YELLOW).multiplyScalar(ALBEDO), vertexColors: true, ...coat }),
    ink: new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#1a1a1a'), vertexColors: true, ...coat, roughness: 0.6 }),
    livery: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALBEDO), map: liv.map, bumpMap: liv.bump, bumpScale: 1.4, vertexColors: true, ...coat }),
    wing: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALBEDO), map: wtx.map, bumpMap: wtx.bump, bumpScale: 1.4, vertexColors: true, ...coat }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.62, metalness: 0.1, vertexColors: true }),
    deck: new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c1f24'), roughness: 0.93, metalness: 0.0, envMapIntensity: 0.35 }),
    lid: new THREE.MeshStandardMaterial({ color: 0xd9d6cc, roughness: 0.55, metalness: 0.05, vertexColors: true }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.28, metalness: 0.92, vertexColors: true }),
    polished: new THREE.MeshStandardMaterial({ color: 0xe2e5e8, roughness: 0.16, metalness: 1.0, envMap: opts.envMap ?? null, envMapIntensity: 0.9 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x5c6166, roughness: 0.42, metalness: 0.85, vertexColors: true }),
    engine: new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.45, metalness: 0.8, vertexColors: true }),
    head: new THREE.MeshStandardMaterial({ color: 0x9a9c9e, roughness: 0.38, metalness: 0.85, vertexColors: true }),
    crank: new THREE.MeshStandardMaterial({ color: 0x2b5190, roughness: 0.48, metalness: 0.3, vertexColors: true }),
    exhaust: new THREE.MeshStandardMaterial({ color: 0x8b8178, roughness: 0.45, metalness: 0.85, vertexColors: true }),
    soot: new THREE.MeshStandardMaterial({ color: 0x2c2722, roughness: 0.7, metalness: 0.6, vertexColors: true }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.94, metalness: 0, vertexColors: true }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92, metalness: 0, bumpMap: treadTexture(), bumpScale: 2.5 }),
    gloss: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.28, metalness: 0.1, vertexColors: true }),
    hub: new THREE.MeshStandardMaterial({ color: 0x8e9297, roughness: 0.38, metalness: 0.75 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb8913c, roughness: 0.35, metalness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xa8bcc6, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.17, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5, depthWrite: false, side: THREE.DoubleSide }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false }),
    interior: new THREE.MeshStandardMaterial({ color: 0x5d6873, roughness: 0.72, metalness: 0.14, vertexColors: true }),
    tubeframe: new THREE.MeshStandardMaterial({ color: 0x6f7c86, roughness: 0.55, metalness: 0.3, vertexColors: true }),
    headliner: new THREE.MeshStandardMaterial({ color: 0xffffff, map: feltTexture(), roughness: 0.95, side: THREE.DoubleSide }),
    floor: new THREE.MeshStandardMaterial({ color: 0xffffff, map: ribTexture('#4a5158', 'rgba(0,0,0,0.5)', 24, 64, 256), roughness: 0.8, metalness: 0.4, vertexColors: true }),
    seat: new THREE.MeshStandardMaterial({ color: 0xffffff, map: ribTexture('#8c7d63', 'rgba(40,30,15,0.5)'), roughness: 0.9, vertexColors: true }),
    harness: new THREE.MeshStandardMaterial({ color: 0x2d3a52, roughness: 0.8 }),
    red: new THREE.MeshStandardMaterial({ color: 0xc8261b, roughness: 0.45, emissive: 0x330000 }),
    knob: new THREE.MeshStandardMaterial({ color: 0xd2231a, roughness: 0.3, metalness: 0.05 }),
    green: new THREE.MeshStandardMaterial({ color: 0x1f9a3a, roughness: 0.45, emissive: 0x002200 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xf2b400, roughness: 0.45 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35, emissive: 0x222222 }),
    beacon: new THREE.MeshStandardMaterial({ color: 0xd8261b, roughness: 0.3, emissive: 0xff2010, emissiveIntensity: 0 }),
    strobe: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.2, emissive: 0xffffff, emissiveIntensity: 0 }),
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
    let a = 1 - Math.max(0, -y - 0.2) * 0.35;
    // Wing-root shadow line along the lower fuselage over the wing.
    const yb = Math.max(0, 1 - Math.abs(y + 0.52) / 0.22), zb = Math.max(0, 1 - Math.abs(z + 0.55) / 1.4);
    a *= 1 - 0.36 * yb * Math.sqrt(zb);
    // Tailplane root.
    const sb = Math.max(0, 1 - Math.abs(y - 0.58) / 0.14) * (z < -4.5 && z > -6.2 ? 1 : 0);
    a *= 1 - 0.22 * sb;
    // Under the cabin frame and just behind the cowl ring.
    if (z < -0.8 && z > -2.8 && y > 0.85) a *= 0.9;
    if (z > 2.1) a *= 0.8 + 0.2 * clamp((2.28 - z) / 0.18, 0, 1);
    return clamp(a, 0.5, 1);
  };
  const fwdSt = sampleStations(FWD_KEYS, 20);
  const cabSt = sampleStations(CAB_KEYS, 8);
  const aftSt = sampleStations(AFT_KEYS, 14);
  add('livery', liveryUV(tagged(loft(fwdSt, 60, fusAO))));
  // Cabin: open above 30° from the sides; the glazed cabin closes it.
  add('livery', liveryUV(tagged(loft(cabSt, 52, fusAO, [Math.PI * (5 / 6), Math.PI * (13 / 6)]))));
  add('livery', liveryUV(tagged(loft(aftSt, 60, fusAO))));
  // Hopper: the long fibreglass lid over the bay (light grey, framed), its
  // hinges and two over-centre latches, and the loading window at the front.
  {
    const st = fwdSt.filter((s) => s.z <= 1.05 && s.z >= -0.75).map((s) => ({ ...s, hw: s.hw * 0.78, yt: s.yt + 0.012, ys: s.yt - 0.05 }));
    add('lid', loft(st, 18, null, [Math.PI * 0.18, Math.PI * 0.82]));
    for (const z of [1.05, -0.75]) add('dark', tx(new THREE.BoxGeometry(0.98, 0.025, 0.035), 0, lerp(1.0, 1.18, (1.05 - z) / 1.8), z));
    for (const sx of [1, -1]) {
      add('dark', tube(st.map((s) => [sx * s.hw * 0.93, s.yt - 0.035, s.z]), 0.012, 20, 6));
      for (const z of [0.7, -0.5]) add('steel', rbox(0.05, 0.03, 0.08, 0.01, sx * 0.47, lerp(1.0, 1.18, (1.05 - z) / 1.8) - 0.005, z), true);
    }
    add('red', tube(st.map((s) => [0.16, s.yt + 0.016, s.z]), 0.0035, 24, 4)); // red pin stripe on the lid
  }
  // Hopper side loading coupler (left, behind the wing), gatebox / dump door
  // under the hopper, oil-cooler scoop under the cowl.
  add('dark', tx(new THREE.CylinderGeometry(0.08, 0.08, 0.11, 18), 0.6, -0.25, -2.05, 0, 0, Math.PI / 2));
  add('brass', tx(new THREE.CylinderGeometry(0.058, 0.058, 0.03, 18), 0.665, -0.25, -2.05, 0, 0, Math.PI / 2));
  add('paint', rbox(0.62, 0.18, 0.9, 0.05, 0, -0.96, 0.35));
  add('dark', rbox(0.5, 0.04, 0.7, 0.015, 0, -1.06, 0.35));
  add('steel', rod([0.22, -1.0, 0.82], [0.22, -1.06, -0.1], 0.012, 6), true);

  // ---------------- engine: exposed radial ahead of the cowl ----------------
  // Front of the cowl: dark baffle plate behind the cylinders, closed by the
  // polished exhaust collector ring that follows the cowl lip; cowl flaps
  // (gills) at the firewall seam.
  {
    const s0 = fwdSt[0];
    add('dark', tx(new THREE.ShapeGeometry(new THREE.Shape(ring(s0, 40).map(([x, y]) => new THREE.Vector2(x, y)))), 0, 0, s0.z + 0.004));
    add('exhaust', tube(ring({ ...s0, hw: s0.hw - 0.03, yt: s0.yt - 0.03, yb: s0.yb + 0.03 }, 40).map(([x, y]) => [x, y, s0.z + 0.03]), 0.05, 60, 10));
    const s1 = fwdSt.reduce((b, s) => (Math.abs(s.z - 1.52) < Math.abs(b.z - 1.52) ? s : b));
    const rim = ring(s1, 16);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      if (Math.sin(a) < -0.5) continue; // none over the oil cooler
      const [px, py] = rim[k];
      add('paint', tx(new THREE.BoxGeometry(0.2, 0.012, 0.16), px * 1.01, py + (py - s1.ys) * 0.01, s1.z, 0.1, 0, a + Math.PI / 2), true);
    }
  }
  // Nine cylinders on the crankcase (blue-grey), nose case dome with the
  // prop governor, intake pipes, exhaust ports into the collector, ignition
  // harness ring.
  {
    const cyl = cylinderParts(0.27, 0.66);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const m = new THREE.Matrix4().makeRotationZ(a).premultiply(new THREE.Matrix4().makeTranslation(0, HUB_Y, EZ));
      for (const g of cyl.barrel) add('engine', g.clone().applyMatrix4(m));
      for (const g of cyl.head) add('head', g.clone().applyMatrix4(m));
      for (const g of cyl.rod) add('steel', g.clone().applyMatrix4(m), true);
      const rot = (p) => new THREE.Vector3(...p).applyMatrix4(m).toArray();
      add('steel', tube([rot([0, 0.24, -0.16]), rot([0, 0.36, -0.15]), rot([0.02, 0.5, -0.1])], 0.022, 8, 6), true);
      add('exhaust', tube([rot([0, 0.58, -0.09]), rot([0, 0.52, -0.2]), rot([0, 0.42, -0.26])], 0.032, 8, 6));
    }
    const crank = lathe([[0.0, EZ - 0.22], [0.24, EZ - 0.22], [0.3, EZ - 0.12], [0.31, EZ + 0.06], [0.27, EZ + 0.12]], 36);
    crank.rotateX(Math.PI / 2); crank.translate(0, HUB_Y, 0);
    add('crank', crank);
    const nose = lathe([[0.27, EZ + 0.12], [0.26, EZ + 0.2], [0.21, EZ + 0.28], [0.15, EZ + 0.34], [0.1, EZ + 0.38], [0.0, EZ + 0.39]], 32);
    nose.rotateX(Math.PI / 2); nose.translate(0, HUB_Y, 0);
    add('crank', nose);
    add('dark', rbox(0.12, 0.1, 0.1, 0.02, 0.17, HUB_Y + 0.17, EZ + 0.22), true); // governor
    add('steel', tx(new THREE.TorusGeometry(0.47, 0.012, 6, 54), 0, HUB_Y, EZ + 0.04), true); // ignition ring
    // Big exhaust stack: out of the collector at the lower right, along the
    // right side of the cowl, aft under the wing root.
    add('exhaust', tube([[-0.42, -0.24, 2.3], [-0.58, -0.3, 2.05], [-0.68, -0.38, 1.6], [-0.7, -0.44, 1.2], [-0.7, -0.47, 0.98]], 0.085, 26, 14));
    const end = new THREE.Vector3(-0.7, -0.47, 0.98), dir = new THREE.Vector3(0.0, -0.03, -0.22).normalize();
    const throat = new THREE.CircleGeometry(0.08, 18);
    throat.applyMatrix4(new THREE.Matrix4().compose(end.clone().addScaledVector(dir, 0.02), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().negate()), new THREE.Vector3(1, 1, 1)));
    add('soot', throat);
    add('soot', tx(new THREE.TorusGeometry(0.083, 0.012, 6, 20), ...end.toArray(), 0, 0, 0), true);
    // Oil cooler scoop under the cowl front.
    add('paint', rbox(0.5, 0.2, 0.7, 0.07, 0, -0.5, 1.85, 0.06));
    add('dark', tx(new THREE.PlaneGeometry(0.42, 0.14), 0, -0.49, 2.2, 0.06));
    for (let k = 0; k < 5; k++) add('steel', tx(new THREE.BoxGeometry(0.41, 0.006, 0.006), 0, -0.545 + k * 0.026, 2.205), true);
  }

  // ---------------- canopy ----------------
  // The cabin stands on the fuselage as a glazed house (proportions taken
  // from the reference side photo): windshield raked back from the hopper
  // top, door and rear side windows down to the sill, a painted roof band,
  // and a steep rear fairing down onto the slim aft fuselage. Every row
  // across the cabin uses the same superellipse arch (index 0 = left side).
  const NA = 16;
  const WB = 0.57, WT = 0.5, YW = 1.42; // half width at the sill / under the roof band, window-top height
  const ZA = -1.2, ZB = AFT_KEYS[0].z; // sill from the A-post foot to the fairing foot
  const xSide = (y) => WB - ((y - SILL) / (YW - SILL)) * (WB - WT);
  const archRow = (hw, y0, z0, yc, zc) => {
    const out = [];
    for (let i = 0; i <= NA; i++) {
      const a = (Math.PI * i) / NA, c = Math.cos(a), h = Math.abs(Math.sin(a)) ** 0.5;
      out.push([hw * Math.sign(c) * Math.abs(c) ** 0.5, y0 + (yc - y0) * h, z0 + (zc - z0) * h]);
    }
    return out;
  };
  const lerpRow = (A, B, t) => A.map((p, i) => p.map((v, k) => v + (B[i][k] - v) * t));
  const cabC = [0, 1.2, -1.75];
  // Wind the faces so the normals point away from (or towards) `c`.
  const orient = (g, c, inward = false) => {
    g.computeVertexNormals();
    const p = g.attributes.position, n = g.attributes.normal;
    let s = 0;
    for (let i = 0; i < p.count; i++) s += (p.getX(i) - c[0]) * n.getX(i) + (p.getY(i) - c[1]) * n.getY(i) + (p.getZ(i) - c[2]) * n.getZ(i);
    if (s < 0 !== inward) {
      const ix = g.index.array;
      for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
      g.computeVertexNormals();
    }
    return g;
  };
  const rowSheet = (rows, inward = false) => {
    const pos = [], uv = [], idx = [], m = rows[0].length;
    rows.forEach((r, j) => r.forEach((p, i) => { pos.push(...p); uv.push(i / (m - 1), j / (rows.length - 1)); }));
    for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < m - 1; i++) {
      const a = j * m + i, b = a + 1, c = a + m, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return orient(g, cabC, inward);
  };
  // Rows pulled a little towards the cabin centre (inner skins).
  const inset = (rows, d) => rows.map((r) => r.map((p) => {
    const v = new THREE.Vector3(p[0] - cabC[0], p[1] - cabC[1], p[2] - cabC[2]);
    const k = d / Math.max(0.01, v.length());
    return [p[0] - v.x * k, p[1] - v.y * k, p[2] - v.z * k];
  }));
  // Side-wall shapes drawn in (z, y) and wrapped onto the tumblehome.
  const onSide = (shape, sx, dx = 0, inward = false) => {
    const g = new THREE.ShapeGeometry(shape);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const z = p.getX(i), y = p.getY(i); p.setXYZ(i, sx * (xSide(y) + dx), y, z); }
    return orient(g, cabC, inward);
  };
  const shapeOf = (pts, holes = []) => {
    const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
    for (const h of holes) s.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(z, y))));
    return s;
  };

  const wsBase = archRow(WB, SILL, ZA, FWD_KEYS[FWD_KEYS.length - 1].yt, FWD_KEYS[FWD_KEYS.length - 1].z);
  const wsTop = archRow(WT, YW, -1.36, 1.58, -1.22);
  const roofRows = [
    wsTop, archRow(WT, YW, -1.47, 1.645, -1.36), archRow(WT, YW, -1.62, 1.68, -1.56),
    archRow(WT, YW, -1.92, 1.68, -1.92), archRow(WT, YW, -2.14, 1.63, -2.14),
  ];
  const aftRim = ring(AFT_KEYS[0], NA, [Math.PI / 6, (5 * Math.PI) / 6]).map(([x, y]) => [x, y, ZB]);
  const fairRows = [0, 0.25, 0.5, 0.75, 1].map((t) => lerpRow(roofRows[roofRows.length - 1], aftRim, t));
  // Hopper deck between the end of the forward fuselage and the windshield
  // base (seen through the windshield as the coaming top).
  const fwdEnd = FWD_KEYS[FWD_KEYS.length - 1];
  const fwdRim = ring(fwdEnd, NA, [Math.PI / 6, (5 * Math.PI) / 6]).map(([x, y]) => [x, y, fwdEnd.z]);
  add('livery', liveryUV(tagged(rowSheet([fwdRim, lerpRow(fwdRim, wsBase, 0.5), wsBase]))));
  add('livery', liveryUV(tagged(rowSheet(roofRows))));
  add('livery', liveryUV(tagged(rowSheet(fairRows))));
  // Windows (z, y): door window between the A and B posts, triangular rear
  // window behind it; the side wall carries both as holes.
  const ZBP = -1.9;
  const DOOR_WIN = [[ZA - 0.045, SILL + 0.035], [-1.385, YW - 0.035], [ZBP + 0.035, YW - 0.035], [ZBP + 0.035, SILL + 0.035]];
  const REAR_WIN = [[ZBP - 0.035, SILL + 0.035], [ZBP - 0.055, YW - 0.065], [-2.47, SILL + 0.035]];
  const wallPts = [[ZA, SILL], [-1.36, YW], [-2.14, YW], [ZB, aftRim[0][1]]];
  for (const sx of [1, -1]) {
    add('livery', liveryUV(tagged(onSide(shapeOf(wallPts, [DOOR_WIN, REAR_WIN]), sx))));
  }
  const glassG = [rowSheet([wsBase, lerpRow(wsBase, wsTop, 0.34), lerpRow(wsBase, wsTop, 0.67), wsTop])];
  for (const sx of [1, -1]) for (const w of [DOOR_WIN, REAR_WIN]) glassG.push(onSide(shapeOf(w), sx, -0.006));
  const glassMesh = new THREE.Group();
  const gm = new THREE.Mesh(mergeGeometries(glassG.map((g) => tagged(g))), M.glass);
  gm.renderOrder = 10;
  glassMesh.add(gm);
  // Frame: painted tubes outside, grey tubes inside, rounded joints.
  const frame = (pts, r = 0.028) => {
    add('paint', tube(pts, r, Math.max(4, pts.length * 3), 10));
    const mid = new THREE.Vector3(...pts[Math.floor(pts.length / 2)]);
    const inw = new THREE.Vector3(...cabC).sub(mid).normalize().multiplyScalar(0.016);
    add('tubeframe', tube(pts.map((p) => [p[0] + inw.x, p[1] + inw.y, p[2] + inw.z]), r * 0.8, Math.max(4, pts.length * 3), 8));
  };
  const sidePt = (sx, z, y, dx = 0.006) => [sx * (xSide(y) + dx), y, z];
  const loop = (sx, w) => [...w, w[0]].map(([z, y]) => sidePt(sx, z, y, 0.012));
  frame(wsBase, 0.032);
  frame(wsTop, 0.036);
  for (const sx of [1, -1]) {
    const i = sx > 0 ? 0 : NA;
    frame([wsBase[i], lerpRow([wsBase[i]], [wsTop[i]], 0.5)[0], wsTop[i]], 0.036); // A-post
    frame([sidePt(sx, -1.36, YW), sidePt(sx, -1.75, YW + 0.004), sidePt(sx, -2.14, YW)], 0.03); // roof rail
    frame([sidePt(sx, ZBP, SILL), sidePt(sx, ZBP, (SILL + YW) / 2), sidePt(sx, ZBP, YW)], 0.032); // B-post
    frame([sidePt(sx, ZA, SILL), sidePt(sx, -2.0, SILL), sidePt(sx, ZB, SILL)], 0.028); // sill rail
    add('paint', tube(loop(sx, DOOR_WIN), 0.016, 24, 6));
    add('paint', tube(loop(sx, REAR_WIN), 0.016, 18, 6));
    for (const p of [wsBase[i], wsTop[i], sidePt(sx, ZBP, SILL), sidePt(sx, ZBP, YW), sidePt(sx, -2.14, YW), sidePt(sx, ZB, SILL)]) add('paint', ball(p, 0.04));
    // Door handle and hinges (door = the window bay between the posts).
    add('steel', rod(sidePt(sx, -1.78, 1.07, 0.03), sidePt(sx, -1.64, 1.07, 0.03), 0.011, 6), true);
    for (const hz of [-1.45, -1.8]) add('steel', tx(new THREE.CylinderGeometry(0.013, 0.013, 0.05, 8), sx * (WT + 0.02), YW + 0.01, hz, 0, 0, Math.PI / 2), true);
    // Rear-view mirror on the left A-post (as in the real cockpit).
    if (sx > 0) {
      add('steel', rod([0.56, 1.24, -1.28], [0.74, 1.27, -1.22], 0.009, 6), true);
      add('gloss', rbox(0.02, 0.12, 0.17, 0.01, 0.78, 1.28, -1.22, 0, 0.2), true);
    }
  }
  // Roof: small peak over the windshield header, red anti-collision beacon
  // at the back, VHF blade antenna.
  add('paint', rbox(0.62, 0.025, 0.1, 0.012, 0, 1.63, -1.27, -0.35));
  add('dark', tx(new THREE.CylinderGeometry(0.05, 0.06, 0.03, 16), 0, 1.64, -2.07));
  add('beacon', tx(new THREE.SphereGeometry(0.045, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.655, -2.07));
  add('white', tx(new THREE.BoxGeometry(0.012, 0.2, 0.08), -0.16, 1.75, -1.85, -0.25), true);
  // Inner skins (roof lining, side walls, rear fairing) seen from the seat.
  add('headliner', rowSheet(inset(roofRows, 0.02), true));
  add('interior', rowSheet(inset(fairRows, 0.02), true));
  for (const sx of [1, -1]) add('interior', onSide(shapeOf(wallPts, [DOOR_WIN, REAR_WIN]), sx, -0.018, true));
  // Bulkhead closing the forward fuselage behind the hopper.
  add('interior', orient(new THREE.ShapeGeometry(new THREE.Shape(ring(fwdEnd, 40).slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y)))).translate(0, 0, fwdEnd.z - 0.01), [0, 0.4, 0]));

  // ---------------- wing ----------------
  const leY = (x) => m18WingY(x);
  const mainProf = airfoil(0, 0.74, 0.15, 0.04, 0.4, 18), aftProf = airfoil(0.76, 1.0, 0.15, 0.04, 0.4, 6);
  const flaps = [], ailerons = [];
  const wingAO = (x, xc, lower) => (lower ? 1 : 1 - 0.28 * Math.max(0, 1 - (x - 0.62) / 0.6));
  const st = (x) => ({ x, y: leY(x), le: W.le, chord: m18Chord(x) });
  const hinge = (side, x) => new THREE.Vector3(side * x, leY(x) + 0.025, W.le - 0.76 * m18Chord(x));
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
  const wingParts = [];
  const FLAP_IN = [W.rootX + 0.06, W.centerX - 0.02], FLAP_OUT = [W.centerX + 0.02, 5.3], AIL = [5.35, W.tipX - 0.05];
  for (const side of [1, -1]) {
    // Main box: flat centre section, tapered outer panel with dihedral.
    wingParts.push(m18WingPanel([0.25, W.rootX, 1.2, 1.9, W.centerX].map(st), mainProf, side, wingAO));
    wingParts.push(m18WingPanel([W.centerX, 3.6, 4.6, 5.6, 6.6, 7.7, W.tipX].map(st), mainProf, side, wingAO));
    wingParts.push(m18WingPanel([st(0.25), st(W.rootX + 0.05)], aftProf, side, wingAO));
    flaps.push(surfaceMesh(m18WingPanel([FLAP_IN[0], 1.6, FLAP_IN[1]].map(st), aftProf, side, wingAO), FLAP_IN[0], FLAP_IN[1], side));
    flaps.push(surfaceMesh(m18WingPanel([FLAP_OUT[0], 4.0, FLAP_OUT[1]].map(st), aftProf, side, wingAO), FLAP_OUT[0], FLAP_OUT[1], side));
    ailerons.push(surfaceMesh(m18WingPanel([AIL[0], 7.0, AIL[1]].map(st), aftProf, side), AIL[0], AIL[1], side));
    // Squared tip with a small rounded cap.
    const tipSt = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5, c0 = m18Chord(W.tipX);
      tipSt.push({ x: W.tipX + 0.1 * Math.sin((t * Math.PI) / 2), y: leY(W.tipX) + 0.012 * t, le: W.le - 0.02 * t, chord: c0 * (1 - 0.07 * t * t) });
    }
    add('paint', wingPanel(tipSt, airfoil(0, 1, 0.15 * 0.85, 0.04, 0.4, 16), side));
    // Root fillet along the fuselage side.
    const fil = mainProf.slice(0, 19).map(([xc, yc]) => [side * 0.6, W.rootY + yc * W.rootChord + 0.012, W.le - xc * W.rootChord]);
    wingParts.push(tube(fil, 0.065, 30, 10));
    // Centre-section joint fairing strip, nav light, strobe, landing light.
    add('paint', tx(new THREE.BoxGeometry(0.05, 0.02, W.rootChord * 0.74), side * W.centerX, leY(W.centerX) + 0.2, W.le - W.rootChord * 0.37), true);
    const tipLE = [side * (W.tipX + 0.06), leY(W.tipX) + 0.04, W.le - 0.08];
    add(side > 0 ? 'red' : 'green', ball(tipLE, 0.032, 10));
    add('lens', tx(new THREE.SphereGeometry(0.065, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), ...tipLE, 0, 0, side * Math.PI / 2, [1, 1, 1.4]));
    add('strobe', ball([side * (W.tipX + 0.08), leY(W.tipX) + 0.04, W.le - 0.7], 0.025, 8));
    add('lens', tx(new THREE.CircleGeometry(0.07, 18), side * 3.4, leY(3.4) + 0.02, W.le + 0.004));
    add('steel', tx(new THREE.CircleGeometry(0.055, 16), side * 3.4, leY(3.4) + 0.02, W.le - 0.002), true);
    // Walkway (black non-slip) on the centre section by the fuselage, fuel
    // filler on the outer-wing tank.
    {
      const up = mainProf.slice(0, 19).filter(([xc]) => xc > 0.1 && xc < 0.6);
      const sheet = up.map(([xc, yc]) => [xc, yc + 0.004]).concat(up.slice().reverse().map(([xc, yc]) => [xc, yc + 0.0005]));
      add('deck', m18WingPanel([0.62, 0.95, 1.25].map(st), sheet, side));
    }
    const fx = 4.0, fy = leY(fx) + 0.12, fz = W.le - 0.35 * m18Chord(fx);
    add('dark', tx(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 20), side * fx, fy, fz, 0, 0, side * Math.atan(DIH)));
    add('steel', tx(new THREE.BoxGeometry(0.11, 0.012, 0.022), side * fx, fy + 0.02, fz, 0, 0, side * Math.atan(DIH)), true);
    // Hinge brackets under the flap / aileron line.
    for (const hx of [1.2, 2.2, 3.4, 4.6, 5.8, 7.0, 8.2]) {
      const h = hinge(side, hx);
      add('dark', tx(new THREE.BoxGeometry(0.035, 0.09, 0.15), h.x, h.y - 0.1, h.z + 0.03, 0, 0, side * (hx > W.centerX ? Math.atan(DIH) : 0)), true);
    }
    add('steel', tx(new THREE.TorusGeometry(0.03, 0.008, 6, 12), side * 6.0, leY(6.0) - 0.16, -0.1, 0, Math.PI / 2), true);
  }
  // Pitot on the left outer wing, stall vane in the left leading edge.
  add('steel', rod([5.4, leY(5.4) - 0.12, 0.62], [5.4, leY(5.4) - 0.12, 1.2], 0.011, 8), true);
  add('steel', rod([5.4, leY(5.4) - 0.02, 0.5], [5.4, leY(5.4) - 0.12, 0.66], 0.012, 6), true);
  add('steel', tx(new THREE.BoxGeometry(0.004, 0.035, 0.03), 3.0, leY(3.0) - 0.01, W.le + 0.02), true);
  for (const g of wingParts) add(g.attributes.uv && g.attributes.color ? 'wing' : 'paint', g);

  // ---------------- tail ----------------
  // Strut-braced tailplane on the slim tail cone, tall fin with a gently
  // swept leading edge and a big rudder hinged at half chord whose lower
  // part runs down past the end of the cone (reference side photo).
  const stabY = 0.58;
  const stabStations = [
    { x: 0.06, y: stabY, le: -4.55, chord: 1.6 }, { x: 1.8, y: stabY + 0.01, le: -4.6, chord: 1.5 },
    { x: 2.75, y: stabY + 0.015, le: -4.66, chord: 1.38 }, { x: 2.88, y: stabY + 0.016, le: -4.72, chord: 1.24 }, { x: 2.95, y: stabY + 0.017, le: -4.8, chord: 1.08 },
  ];
  const ELEV = 0.6; // elevator hinge, fraction of chord
  const elevStations = [{ ...stabStations[0], x: 0.1 }, ...stabStations.slice(1, 3)];
  const elevParts = [];
  for (const side of [1, -1]) {
    add('paint', wingPanel(stabStations, airfoil(0, ELEV - 0.02, 0.11, 0, 0.4, 12), side));
    elevParts.push(tagged(wingPanel(elevStations, airfoil(ELEV, 1, 0.11, 0, 0.4, 4), side)));
    // V struts from the bottom of the tail cone up to the stabiliser.
    for (const [sz, fz] of [[-4.85, -4.9], [-5.3, -5.15]]) {
      add('steel', rod([side * 1.55, stabY - 0.04, sz], [side * 0.13, 0.22, fz], 0.022, 8));
      for (const p of [[side * 1.55, stabY - 0.04, sz], [side * 0.13, 0.22, fz]]) add('steel', ball(p, 0.032, 8), true);
    }
  }
  elevParts.push(tagged(tx(new THREE.BoxGeometry(0.55, 0.014, 0.11), 0.8, stabY + 0.005, -4.6 - 1.5 - 0.04)));
  const elevGeo = mergeGeometries(elevParts);
  const elevHingeZ = -4.55 - ELEV * 1.6;
  elevGeo.translate(0, -stabY, -elevHingeZ);
  const elevator = new THREE.Group();
  elevator.position.set(0, stabY, elevHingeZ);
  const elevMesh = new THREE.Mesh(elevGeo, M.paint);
  elevMesh.castShadow = true; elevMesh.receiveShadow = true;
  elevator.add(elevMesh);
  root.add(elevator);
  // Fin + rudder (vertical airfoils, colours from the livery projection).
  const finSt = [[0.55, -4.52, 1.72], [1.2, -4.76, 1.42], [1.7, -4.94, 1.17], [2.05, -5.07, 0.97], [2.22, -5.13, 0.86], [2.29, -5.16, 0.8]];
  const vfin = (prof, sts) => {
    const g = wingPanel(sts.map(([h, le, c]) => ({ x: h, y: 0, le, chord: c })), prof, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getY(i), p.getX(i), p.getZ(i));
    // Swapping x and y mirrors the panel: turn its faces back outward.
    return flipWinding(g);
  };
  const RUD = 0.51;
  add('livery', liveryUV(tagged(vfin(airfoil(0, RUD - 0.01, 0.11, 0, 0.4, 12), finSt))));
  // Fillet from the turtle deck into the fin leading edge.
  add('livery', liveryUV(tagged(loft(sampleStations([
    K(-4.0, 0.04, 0.7, 0.67, 0.73, 2.2, 2.2), K(-4.35, 0.065, 0.74, 0.66, 0.81, 2.2, 2.2), K(-4.6, 0.06, 0.78, 0.65, 0.88, 2.2, 2.2),
  ], 20), 12, null))));
  // The rudder starts just above the elevators so the two never meet.
  const rudSt = [[0.68, -4.568, 1.66], ...finSt.slice(1)];
  const [r0, r1] = [rudSt[0], rudSt[rudSt.length - 1]];
  const hb = [0, r0[0], r0[1] - RUD * r0[2]], ht = [0, r1[0], r1[1] - RUD * r1[2]];
  const tilt = Math.atan2(ht[2] - hb[2], ht[1] - hb[1]);
  const rudder = new THREE.Group();
  rudder.position.set(...hb);
  rudder.rotation.x = tilt;
  rudder.updateMatrix();
  const rudGeo = liveryUV(tagged(vfin(airfoil(RUD + 0.01, 1, 0.11, 0, 0.4, 5), rudSt)));
  const rudTab = tagged(tx(new THREE.BoxGeometry(0.014, 0.3, 0.1), 0, 0.95, -6.16));
  const inv = rudder.matrix.clone().invert();
  rudGeo.applyMatrix4(inv); rudTab.applyMatrix4(inv);
  const rudMesh = new THREE.Mesh(rudGeo, M.livery);
  rudMesh.castShadow = true;
  rudder.add(rudMesh, new THREE.Mesh(rudTab, M.paint));
  root.add(rudder);
  add('white', ball([0, 0.42, -5.62], 0.03, 10)); // tail light on the cone
  add('steel', tx(new THREE.TorusGeometry(0.034, 0.008, 6, 12), 0, 0.2, -5.2, 0, Math.PI / 2), true);

  // ---------------- landing gear ----------------
  const gearCfg = Object.fromEntries(A.gear.map((g) => [g.name, g]));
  const gearGroups = {};
  const tyreProfile = (R, Wd, rim) => [
    [rim, -Wd * 0.42], [rim + 0.02, -Wd * 0.5], [R * 0.78, -Wd * 0.54], [R * 0.95, -Wd * 0.46], [R * 0.995, -Wd * 0.3],
    [R, -Wd * 0.12], [R, Wd * 0.12], [R * 0.995, Wd * 0.3], [R * 0.95, Wd * 0.46], [R * 0.78, Wd * 0.54], [rim + 0.02, Wd * 0.5], [rim, Wd * 0.42],
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
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        parts.push(tagged(tx(new THREE.CylinderGeometry(0.013, 0.013, 0.024, 8), sx * Wd * 0.33, Math.cos(a) * rim * 0.58, Math.sin(a) * rim * 0.58, 0, 0, Math.PI / 2)));
      }
      parts.push(tagged(tx(new THREE.SphereGeometry(rim * 0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), sx * Wd * 0.31, 0, 0, 0, 0, -sx * Math.PI / 2)));
      parts.push(tagged(rod([sx * Wd * 0.38, rim * 0.92, 0], [sx * Wd * 0.46, rim * 0.98, 0], 0.006, 6)));
    }
    spin.add(tmesh, new THREE.Mesh(mergeGeometries(parts), M.hub));
    return spin;
  };
  for (const [name, sx] of [['mainL', 1], ['mainR', -1]]) {
    const cfg = gearCfg[name];
    const R = cfg.radius, Wd = 0.27;
    const ax = cfg.p[0], ay = cfg.p[1] + R, az = cfg.p[2];
    const g = new THREE.Group();
    // Oleo leg: from the centre-section front spar, raked forward and down
    // to the axle on the inboard side of the wheel; black cylinder, polished
    // piston, torque link; a drag brace back to the rear spar.
    const top = [sx * 1.58, leY(1.58) - 0.16, 0.22];
    const attachY = top[1];
    const leg = new THREE.Group();
    leg.position.y = attachY;
    const L = (p) => [p[0], p[1] - attachY, p[2]];
    const axIn = ax - sx * 0.19;
    const knee = [lerp(top[0], axIn, 0.55), lerp(top[1], ay + 0.1, 0.55), lerp(top[2], az - 0.02, 0.55)];
    const legParts = [];
    legParts.push(rod(L(top), L(knee), 0.068, 14, 0.06));
    const piston = rod(L(knee), L([axIn, ay + 0.06, az - 0.02]), 0.042, 12);
    legParts.push(tx(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 14).applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...knee).sub(new THREE.Vector3(...top)).normalize()))), ...L(knee)));
    legParts.push(tx(new RoundedBoxGeometry(0.12, 0.17, 0.2, 2, 0.03), ...L([axIn, ay + 0.04, az])));
    legParts.push(rod(L([axIn, ay, az]), L([ax - sx * 0.02, ay, az]), 0.04, 12));
    // Torque link (scissors) on the front of the oleo.
    legParts.push(bar(L([knee[0], knee[1] - 0.02, knee[2] + 0.08]), L([lerp(knee[0], axIn, 0.5), lerp(knee[1], ay, 0.5) + 0.05, az + 0.14]), 0.03, 0.02));
    legParts.push(bar(L([lerp(knee[0], axIn, 0.5), lerp(knee[1], ay, 0.5) + 0.05, az + 0.14]), L([axIn, ay + 0.12, az + 0.08]), 0.03, 0.02));
    const legMesh = new THREE.Mesh(mergeGeometries(legParts.map((p) => tagged(p))), M.ink);
    legMesh.castShadow = true; legMesh.receiveShadow = true;
    const pistonMesh = new THREE.Mesh(tagged(piston), M.polished);
    const brace = new THREE.Mesh(tagged(rod(L([sx * 1.38, leY(1.38) - 0.17, -0.75]), L([axIn + sx * 0.02, ay + 0.16, az - 0.08]), 0.032, 10)), M.ink);
    brace.castShadow = true;
    const brakeLine = new THREE.Mesh(tagged(tube([L([top[0] - sx * 0.05, attachY - 0.02, 0.15]), L([knee[0] - sx * 0.07, knee[1], knee[2] - 0.04]), L([axIn - sx * 0.03, ay + 0.1, az - 0.08])], 0.009, 16, 6)), M.rubber);
    leg.add(legMesh, pistonMesh, brace, brakeLine);
    g.add(leg);
    // Gear fittings on the wing underside.
    add('dark', rbox(0.2, 0.08, 0.3, 0.03, top[0], attachY + 0.03, top[2]));
    add('dark', rbox(0.14, 0.06, 0.18, 0.02, sx * 1.38, leY(1.38) - 0.15, -0.75), true);
    const wheel = new THREE.Group();
    wheel.position.set(ax, ay, az);
    const spinPart = makeWheel(R, Wd, 0.19, sx, true);
    const brake = new THREE.Mesh(tagged(tx(new THREE.CylinderGeometry(0.17, 0.17, 0.016, 26), -sx * 0.11, 0, 0, 0, 0, Math.PI / 2)), M.steel);
    const caliper = new THREE.Mesh(tagged(new RoundedBoxGeometry(0.07, 0.1, 0.12, 2, 0.015).translate(-sx * 0.115, 0.12, -0.06)), M.dark);
    wheel.add(spinPart, brake, caliper);
    g.add(wheel);
    root.add(g);
    gearGroups[name] = { group: g, wheel, spin: spinPart, leg, legH: attachY - ay, rest: wheel.position.clone(), sx };
  }
  {
    const cfg = gearCfg.tail;
    const g = new THREE.Group();
    const R = cfg.radius;
    const fz = cfg.p[2] + 0.14, fy = cfg.p[1] + R + 0.12;
    // Tailwheel oleo from the tail cone frame.
    add('ink', rod([0, 0.1, -4.45], [0, fy + 0.03, fz], 0.05, 10, 0.045));
    add('ink', tx(new THREE.CylinderGeometry(0.04, 0.04, 0.09, 12), 0, fy + 0.04, fz));
    add('dark', rbox(0.14, 0.06, 0.2, 0.02, 0, 0.08, -4.42));
    const fork = new THREE.Group();
    fork.position.set(0, fy, fz);
    const forkGeo = mergeGeometries([
      tagged(tx(new THREE.BoxGeometry(0.016, 0.19, 0.07), 0.075, -0.06, -0.08, 0.6)), tagged(tx(new THREE.BoxGeometry(0.016, 0.19, 0.07), -0.075, -0.06, -0.08, 0.6)),
      tagged(tx(new THREE.BoxGeometry(0.16, 0.026, 0.07), 0, 0.025, -0.01)),
      tagged(rod([-0.09, 0.035, 0.05], [0.09, 0.035, 0.05], 0.01, 6)),
    ]);
    fork.add(new THREE.Mesh(forkGeo, M.steel));
    const wheel = new THREE.Group();
    wheel.position.set(0, -0.12, -0.14);
    wheel.add(makeWheel(R, 0.11, 0.08, 1, false));
    fork.add(wheel);
    g.add(fork);
    root.add(g);
    for (const sx of [1, -1]) add('steel', rod([sx * 0.09, fy + 0.035, fz + 0.05], [sx * 0.12, 0.2, -4.85], 0.005, 5), true);
    gearGroups.tail = { group: g, wheel, spin: wheel.children[0], fork, rest: wheel.position.clone(), sx: 0 };
  }

  // ---------------- spray system ----------------
  // The booms follow the trailing edge (straight across the centre section,
  // swept forward with the outer panels' taper) just aft of it and below
  // where the flaps' trailing edge reaches at full deflection; the hangers
  // come down from the fixed wing ahead of the flap hinge, under the flaps'
  // path: lowered flaps never pass through the boom or its hangers.
  const nozzles = [];
  const boomDrop = 0.42;
  const teZ = (x) => W.le - m18Chord(x);
  const boomAt = (side, x) => [side * x, leY(x) - boomDrop, teZ(x) - 0.03];
  for (const side of [1, -1]) {
    const xs = [0.95, W.centerX, 7.2];
    for (let i = 0; i < xs.length - 1; i++) add('alu', rod(boomAt(side, xs[i]), boomAt(side, xs[i + 1]), 0.032, 12));
    add('alu', ball(boomAt(side, W.centerX), 0.036, 10));
    const tip = boomAt(side, 7.2);
    add('alu', ball(tip, 0.038, 10));
    add('brass', tx(new THREE.CylinderGeometry(0.015, 0.015, 0.05, 8), tip[0] + side * 0.035, tip[1], tip[2], 0, 0, Math.PI / 2), true);
    for (const hx of [1.5, 2.55, 3.8, 5.0, 6.2, 7.1]) {
      const h = hinge(side, hx);
      const topP = [side * hx, leY(hx) - 0.05, h.z + 0.16], bot = boomAt(side, hx);
      add('alu', tx(rbox(0.02, 0.001 + Math.hypot(topP[1] - bot[1], topP[2] - bot[2]), 0.075, 0.009, 0, 0, 0), side * hx, (topP[1] + bot[1]) / 2, (topP[2] + bot[2]) / 2, Math.atan2(topP[2] - bot[2], topP[1] - bot[1])));
      add('dark', tx(new THREE.CylinderGeometry(0.04, 0.04, 0.035, 10), ...bot, 0, 0, Math.PI / 2), true);
    }
    const N = 28;
    for (let k = 0; k < N; k++) {
      const x = 1.0 + ((7.1 - 1.0) * k) / (N - 1);
      const [bx, by, bz] = boomAt(side, x);
      add('alu', rod([bx, by, bz], [bx, by - 0.07, bz - 0.02], 0.008, 6), true);
      add('dark', tx(new THREE.CylinderGeometry(0.019, 0.016, 0.05, 10), bx, by - 0.1, bz - 0.03, 0.3), true);
      add('brass', tx(new THREE.ConeGeometry(0.011, 0.028, 8), bx, by - 0.136, bz - 0.042, Math.PI + 0.3), true);
      nozzles.push(new THREE.Vector3(bx, by - 0.14, bz - 0.042));
    }
  }
  // Centre: cross-pipe between the booms under the belly and the feed from
  // the pump.
  add('alu', rod(boomAt(1, 0.95), boomAt(-1, 0.95), 0.045, 12));
  add('alu', tube([[0, -1.0, 0.0], [0, -1.08, -0.4], [0, -1.12, -0.9], boomAt(1, 0.0).map((v, i) => (i === 0 ? 0 : v))], 0.045, 24, 10));
  add('alu', ball([0, leY(0.95) - boomDrop, teZ(0.95) - 0.03], 0.065, 12));
  // Fan-driven pump under the belly behind the gatebox.
  const pump = new THREE.Group();
  pump.position.set(0, -1.12, -0.3);
  const pumpBody = lathe([[0.0, -0.26], [0.09, -0.25], [0.12, -0.16], [0.13, 0.06], [0.11, 0.19], [0.065, 0.25], [0.0, 0.26]], 24);
  pumpBody.rotateX(Math.PI / 2);
  pump.add(new THREE.Mesh(tagged(pumpBody), M.dark));
  pump.add(new THREE.Mesh(tagged(tx(new THREE.SphereGeometry(0.055, 14, 10), 0, 0, 0.27)), M.steel));
  const pumpFan = new THREE.Group();
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
  add('steel', rod([0, -0.95, -0.3], [0, -1.02, -0.3], 0.03, 10));

  // ---------------- propeller (four blades, constant speed, bare hub) ----------------
  const R = A.propRadius;
  const prop = new THREE.Group();
  prop.position.set(0, HUB_Y, HUB_Z);
  {
    const hub = lathe([[0.0, 0.28], [0.06, 0.27], [0.12, 0.22], [0.16, 0.12], [0.18, 0.0], [0.18, -0.1], [0.15, -0.14]].reverse(), 32);
    hub.rotateX(Math.PI / 2);
    const cap = lathe([[0.0, 0.34], [0.05, 0.32], [0.08, 0.28], [0.09, 0.24]].reverse(), 24);
    cap.rotateX(Math.PI / 2);
    const hubMesh = new THREE.Mesh(mergeGeometries([tagged(hub)]), M.hub);
    const capMesh = new THREE.Mesh(mergeGeometries([tagged(cap)]), M.dark);
    hubMesh.castShadow = true;
    prop.add(hubMesh, capMesh);
  }
  const blades = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.55, metalness: 0.25, transparent: true });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xf2c21b, roughness: 0.5, transparent: true });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.55, metalness: 0.25, transparent: true });
  // Black blade, yellow tip with a black band (as on the reference prop).
  const bodyGeo = bladeLoft(0.24, R - 0.24, 16, R), tipA = bladeLoft(R - 0.24, R - 0.15, 3, R), band = bladeLoft(R - 0.15, R - 0.1, 2, R), tipB = bladeLoft(R - 0.1, R, 3, R);
  const pitchGroups = [];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Group();
    b.rotation.z = (i * Math.PI) / 2 + Math.PI / 4;
    const pg = new THREE.Group();
    const bm = new THREE.Mesh(bodyGeo, bladeMat);
    bm.castShadow = true;
    pg.add(bm, new THREE.Mesh(tipA, tipMat), new THREE.Mesh(band, bandMat), new THREE.Mesh(tipB, tipMat));
    // Blade shank in its clamp (brass-coloured clamp ring, as on the reference hub).
    pg.add(new THREE.Mesh(tagged(rod([0.14, 0, 0], [0.3, 0, 0], 0.05, 12)), M.dark));
    pg.add(new THREE.Mesh(tagged(tx(new THREE.CylinderGeometry(0.065, 0.065, 0.06, 14), 0.17, 0, 0, 0, 0, Math.PI / 2)), M.brass));
    b.add(pg);
    blades.add(b);
    pitchGroups.push(pg);
  }
  prop.add(blades);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R + 0.01, 64), new THREE.MeshBasicMaterial({ map: propDiscTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.z = 0.02;
  disc.renderOrder = 11;
  prop.add(disc);
  root.add(prop);

  // ---------------- cockpit interior ----------------
  const cockpit = new THREE.Group();
  const ci = {};
  const addC = (mat, g) => { (ci[mat] ||= []).push(tagged(g)); };
  const cabAO = (x, y, z) => 0.55 + 0.45 * smoothstep(0.45, 1.75, y) * (z < -2.4 ? 0.85 : 1);
  const FLOOR = OFF.y - 0.28;
  addC('floor', tx(new THREE.BoxGeometry(1.1, 0.03, 1.5), 0, FLOOR, -1.49));
  for (const sx of [1, -1]) {
    addC('interior', tx(new THREE.BoxGeometry(0.03, SILL - FLOOR, 1.38), sx * 0.555, (SILL + FLOOR) / 2, -1.52));
    addC('interior', rbox(0.1, 0.08, 0.9, 0.02, sx * 0.49, FLOOR + 0.48, -1.47));
  }
  // Exposed steel tube frame (grey-blue), as in the real cabin.
  for (const [a, b] of [
    [[0.53, FLOOR + 0.1, -0.87], [0.53, SILL - 0.05, -1.57]], [[-0.53, FLOOR + 0.1, -0.87], [-0.53, SILL - 0.05, -1.57]],
    [[0.53, SILL - 0.05, -0.87], [0.53, FLOOR + 0.1, -2.17]], [[-0.53, SILL - 0.05, -0.87], [-0.53, FLOOR + 0.1, -2.17]],
    [[-0.53, SILL - 0.08, -2.19], [0.53, SILL - 0.08, -2.19]], [[0.53, FLOOR + 0.45, -0.87], [0.53, FLOOR + 0.45, -2.19]], [[-0.53, FLOOR + 0.45, -0.87], [-0.53, FLOOR + 0.45, -2.19]],
  ]) { addC('tubeframe', rod(a, b, 0.02, 8)); addC('tubeframe', ball(a, 0.026, 8)); }
  // Seat (canvas-covered cushions), lap and shoulder straps.
  addC('seat', rbox(0.5, 0.12, 0.5, 0.045, ...o3(0, 0.05, -0.55)));
  addC('seat', rbox(0.5, 0.8, 0.12, 0.05, ...o3(0, 0.45, -0.8), -0.12));
  addC('tubeframe', rbox(0.46, 0.04, 0.06, 0.015, ...o3(0, 0.86, -0.86), -0.12));
  for (const sx of [1, -1]) {
    addC('tubeframe', rod(o3(sx * 0.22, -0.24, -0.4), o3(sx * 0.22, 0.0, -0.55), 0.016, 8));
    addC('tubeframe', rod(o3(sx * 0.24, 0.0, -0.32), o3(sx * 0.24, 0.0, -0.78), 0.015, 8));
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.64, 0.01), M.harness);
    strap.position.set(...o3(sx * 0.12, 0.48, -0.74));
    strap.rotation.x = -0.12;
    cockpit.add(strap);
  }
  // Instrument boards (live canvas, alpha-cut outlines), each toed in, with
  // the hopper's back wall between them and the glareshield coaming above.
  const PW = 1.04, PH = PW * (M18_PANEL.H / M18_PANEL.W);
  const boardMat = new THREE.MeshStandardMaterial({ map: panel.texture, roughness: 0.55, emissive: 0xffffff, emissiveMap: panel.texture, emissiveIntensity: 0.12, alphaTest: 0.5, side: THREE.DoubleSide });
  const board = (u0, u1, x, rotY) => {
    const w = PW * (u1 - u0);
    const geo = new THREE.PlaneGeometry(w, PH);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0));
    const m = new THREE.Mesh(geo, boardMat);
    m.position.set(x, 1.02, -1.0);
    m.rotation.set(-0.14, Math.PI + rotY, 0, 'YXZ');
    cockpit.add(m);
    return m;
  };
  const panelMesh = board(M18_PANEL.left[0] / M18_PANEL.W, M18_PANEL.split / M18_PANEL.W, 0.27, 0.26);
  board(M18_PANEL.split / M18_PANEL.W, M18_PANEL.right[1] / M18_PANEL.W, -0.27, -0.26);
  for (const sx of [1, -1]) addC('gloss', rbox(0.5, 0.02, 0.06, 0.008, sx * 0.27, 0.78, -1.01, 0, sx * 0.26));
  const sightMat = new THREE.MeshStandardMaterial({ map: panel.sightTexture, roughness: 0.6, emissive: 0xffffff, emissiveMap: panel.sightTexture, emissiveIntensity: 0.1 });
  const hopperWall = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5 * (M18_HOPPER.H / M18_HOPPER.W)), sightMat);
  hopperWall.position.set(0, 0.82, -0.84);
  hopperWall.rotation.y = Math.PI;
  cockpit.add(hopperWall);
  addC('interior', tx(new THREE.BoxGeometry(1.1, 0.7, 0.03), 0, FLOOR + 0.35, -0.62)); // footwell bulkhead
  // Glareshield roll just inside the windshield base, following its curve.
  const glareCurve = new THREE.CatmullRomCurve3(wsBase.slice(2, NA - 1).map(([x, y, z]) => new THREE.Vector3(x * 0.94, y + 0.045, z - 0.09)));
  addC('gloss', new THREE.TubeGeometry(glareCurve, 32, 0.035, 12, false));
  // Glareshield GPS (live guidance) on a bracket at the top centre.
  const gpsMat = new THREE.MeshStandardMaterial({ map: panel.gpsTexture, roughness: 0.4, emissive: 0xffffff, emissiveMap: panel.gpsTexture, emissiveIntensity: 0.35 });
  const gpsMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.157), gpsMat);
  gpsMesh.position.set(0.36, 1.27, -1.02);
  gpsMesh.rotation.set(-0.3, Math.PI + 0.4, 0, 'YXZ');
  cockpit.add(gpsMesh);
  addC('gloss', rbox(0.24, 0.175, 0.03, 0.012, 0.365, 1.27, -1.008, -0.3, 0.4));
  addC('steel', rod([0.36, 1.18, -0.98], [0.36, 1.21, -1.0], 0.012, 6));
  // Lightbar (the shared spray lightbar LEDs) on the glareshield.
  const lightbar = new THREE.Group();
  lightbar.position.set(-0.12, 1.27, -0.93);
  const leds = [];
  for (let i = -7; i <= 7; i++) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.014, 0.008), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    led.position.set(-i * 0.0155, 0, -0.016);
    lightbar.add(led);
    leds.push(led);
  }
  lightbar.add(new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.032, 0.03, 2, 0.006), M.dark));
  cockpit.add(lightbar);
  // Stick (same grip geometry as the others so the shared pilot's hand fits),
  // grey tube, black grip, red spray trigger.
  const stick = new THREE.Group();
  stick.position.set(...o3(0, -0.22, -0.12));
  {
    const boot = new THREE.Mesh(lathe([[0.08, 0], [0.075, 0.02], [0.055, 0.06], [0.032, 0.1], [0.018, 0.14]], 16), M.rubber);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.56, 10), M.tubeframe);
    shaft.position.y = 0.3;
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.11, 6, 14), M.gloss);
    grip.position.set(0, 0.63, 0.012);
    grip.rotation.x = 0.22;
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.016, 12), M.red);
    btn.position.set(0, 0.712, 0.03);
    const trig = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.035, 0.012), M.dark);
    trig.position.set(0, 0.62, 0.042);
    stick.add(boot, shaft, grip, btn, trig);
  }
  cockpit.add(stick);
  const pedals = [];
  for (const sx of [1, -1]) {
    const p = new THREE.Group();
    p.position.set(...o3(sx * 0.17, -0.12, 0.42));
    p.rotation.x = -0.6;
    p.add(new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.18, 0.026, 2, 0.008), M.tubeframe));
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8), M.steel);
    arm.position.set(0, -0.13, 0.03);
    p.add(arm);
    cockpit.add(p);
    pedals.push(p);
  }
  // Engine quadrant on the left: throttle (black), prop rpm and mixture
  // (red knobs, as in the real cabin), the carb-heat / cowl-flap levers.
  const THR = [0.5, 0.5, 0.05];
  addC('dark', rbox(0.12, 0.05, 0.38, 0.015, ...o3(0.48, 0.485, 0.02)));
  const throttle = new THREE.Group();
  throttle.position.set(...o3(...THR));
  {
    const tl = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.17, 8), M.steel);
    tl.position.y = 0.085;
    const tk = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), M.gloss);
    tk.position.y = 0.17;
    throttle.add(tl, tk);
  }
  cockpit.add(throttle);
  for (const [lx, rot] of [[0.465, 0.35], [0.44, 0.45], [0.415, 0.2]]) {
    const lv = new THREE.Group();
    lv.position.set(...o3(lx, 0.5, 0.0));
    lv.rotation.x = rot;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.15, 8), M.steel);
    s.position.y = 0.075;
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), M.knob);
    k.position.y = 0.15;
    lv.add(s, k);
    cockpit.add(lv);
  }
  // Hopper dump / spray valve handle on the right (red knob).
  const valve = new THREE.Group();
  valve.position.set(...o3(-0.43, 0.47, 0.0));
  {
    const vl = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.2, 8), M.steel);
    vl.position.y = 0.1;
    const vk = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), M.knob);
    vk.position.y = 0.2;
    valve.add(vl, vk);
  }
  cockpit.add(valve);
  const ext = new THREE.Mesh(mergeGeometries([tagged(lathe([[0, -0.14], [0.035, -0.14], [0.036, 0.1], [0.025, 0.14], [0.01, 0.16], [0, 0.16]], 16))]), M.red);
  ext.position.set(...o3(0.4, 0.05, -0.75));
  cockpit.add(ext);
  for (const [mat, parts] of Object.entries(ci)) {
    const g = mergeGeometries(parts);
    if (g.attributes.color) shade(g, cabAO);
    const m = new THREE.Mesh(g, M[mat]);
    m.receiveShadow = true;
    cockpit.add(m);
  }
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
  root.add(glassMesh);
  root.traverse((o) => { if (o.isMesh && o.castShadow === undefined) o.castShadow = true; });

  // Blade angle of the constant-speed prop: fine at rest and at low speed,
  // coarser as the governor takes the power at speed.
  let bladeAngle = 0.2, t = 0;
  const update = (dt, fm) => {
    t += dt;
    const o = fm.out;
    const pf = fm.shaftPower / A.maxPower;
    const target = fm.engine === 'running' ? 0.18 + 0.4 * smoothstep(15, 65, o.airspeed) + 0.1 * pf : 0.18;
    bladeAngle += clamp(target - bladeAngle, -dt * 0.8, dt * 0.8);
    for (const pg of pitchGroups) pg.rotation.x = bladeAngle;
    const on = fm.engine !== 'off';
    M.beacon.emissiveIntensity = on ? 0.6 + 2.4 * Math.max(0, Math.sin(t * 7.5)) ** 8 : 0;
    M.strobe.emissiveIntensity = on && t % 1.2 < 0.06 ? 4 : 0;
  };

  return {
    root, M,
    prop, blades, bladeMats: [bladeMat, tipMat, bandMat], disc,
    ailerons, flaps, elevator, rudder,
    gear: gearGroups,
    stick, pedals, throttle, valve, leds, panelMesh,
    pumpFan, nozzles, pilot, cockpit, glassMesh,
    eye: new THREE.Vector3(0, 1.0, -0.5).add(OFF),
    fuelFiller: new THREE.Vector3(4.0, m18WingY(4.0) + 0.14, W.le - 0.35 * m18Chord(4.0)),
    hopperPort: new THREE.Vector3(0.62, -0.25, -2.05),
    update,
  };
}
