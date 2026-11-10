// Procedural Embraer EMB-201A Ipanema (fictional registration PR-IPC): the
// classic Ipanema, its own geometry — nothing here is taken from the
// EMB-202A (model.js) or EMB-203 (e203Model.js) models. VISUAL ONLY: the
// physics (FLIGHT_E201), gear contact points and hard points live in
// src/config.js; the gear points are read here only to place the wheels.
// Body frame: +Z nose, +Y up, +X left wing; origin = CG (25 % of the chord).
//
// Reference map (the blueprint's side view, axis level, scaled by the
// published 7.43 m length; photographs PT-UCV, the yellow / blue in flight,
// PT-UDY and the SAE orange; the cockpit photograph for the cabin frame):
//   spinner tip z 2.53 · cowl lip 2.16 · firewall 1.03 · windshield base
//   −0.47 · roof front −0.84 · roof rear −1.57 · the rear fairing meets the
//   dorsal at −2.14 · fin leading edge −3.37 (root) … −3.97 (top) · rudder
//   hinge −4.50, trailing edge −4.90 · main axle 0.50, wing LE 0.43 (1.71 m
//   chord) · tailwheel −4.66.
//   Heights over the thrust line (y 0.12): cowl top 0.15 at the lip, 0.35
//   at the firewall, 0.51 at the windshield base; roof 1.08; the dorsal
//   behind the cabin at the hopper-top height (0.51), falling slightly to
//   the fin; fin top 1.45; belly −0.59; the tail post 0.55 m deep.
// What makes it a 201: the slim cowl tapering to a pointed spinner; the
// cabin a framed "doghouse" standing on a flat-topped fuselage — raked
// windshield, flat side windows leaning in, a flat roof with a small visor
// over the windshield, a short convex fairing behind the roof with a small
// quarter window — then a straight dorsal at the hopper's height to the
// fin; a tall fin with a straight swept leading edge and a flat top; a
// rectangular tailplane on the cone; the constant-chord wing with 7° of
// dihedral and drooped tips (no winglets); tubular V main legs on big
// tyres; the tailwheel on a spring under the rudder; a two-blade Hartzell.
// Paint and lettering are a side-projected livery with a matching bump map
// (two schemes share the geometry and UVs: only canvases and a few colours
// change); AO is baked into vertex colours; small parts sit in a LOD.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { rng, clamp, smoothstep, lerp } from '../core/math.js';
import { FLIGHT_E201 } from '../config.js';
import {
  loft, K, sampleStations, ring, airfoil, wingPanel, flipWinding, tagged, tx, rod, tube, bar, ball, rbox, lathe, grid,
  speckle, orangePeel, treadTexture, propDiscTexture, WING_SPAN_UV, buildPilot,
} from './model.js';
import { buildE201Cockpit } from './e201Cockpit.js';

const A = FLIGHT_E201;
// Wing: rectangular, 1.71 m chord, LE 0.43 ahead of the CG, root chord
// plane low on the fuselage, 7° dihedral from the root; the drooped tip
// cap takes it from tipX to the 5.845 m half span.
export const E201_WING = { rootX: 0.48, tipX: 5.66, half: 5.845, rootY: -0.4, le: 0.43, chord: 1.71, dih: Math.tan((7 * Math.PI) / 180) };
const W = E201_WING;
export const e201WingY = (x) => W.rootY + Math.max(0, Math.abs(x) - W.rootX) * W.dih;
const AX = 0.12; // thrust line above the CG
const SPAN_UV = 5.9; // half-span metres mapped to u = 0..1 on the wing texture
export const E201_SHADOW = { W: 13.4, L: 9.4, wing: [5.9, -1.28, 0.43], fus: [0.5, -4.9, 2.53], tail: [2.02, -4.54, -3.62], core: [4.2, 2.6] };

// ---------------------------------------------------------------------------
// Paint schemes. A — green with the Brazilian identity: green, a yellow and
// white cheat line, the flag on the fin. B — yellow-orange with the blue
// band (PT-UCV, the yellow 201 in flight, PT-UDY): a straight band along
// the side that widens over the tail cone, blue fin cap and wing tips.
const GREEN = '#1d6b3b', YELLOW = '#f2c419', WHITE = '#f3f3ee', BLUE = '#233a92', ORANGE = '#f2a21a', NAVY = '#1c2a6e';
const LIME = '#4fbf34', DEEPBLUE = '#1b2a78', MIDBLUE = '#2f62c4';
export const E201_LIVERIES = [
  { id: 'brasil', name: 'Paint A — green, Brazilian flag', base: GREEN, roof: GREEN, frame: GREEN, wing: GREEN, tip: YELLOW, stab: GREEN, gear: '#2b2f33', text: WHITE, seam: 'rgba(8,24,14,0.35)', rivet: 'rgba(6,18,10,0.3)' },
  { id: 'azul', name: 'Paint B — yellow-orange, blue band', base: ORANGE, roof: ORANGE, frame: ORANGE, wing: ORANGE, tip: BLUE, stab: ORANGE, gear: ORANGE, text: NAVY, seam: 'rgba(90,60,0,0.3)', rivet: 'rgba(80,55,0,0.28)' },
  // C — bright Brazilian green with dark-blue sweeping graphics (after the
  // green SAE operator Ipanemas): two curved blue bands from the cowl up
  // under the cabin windows and down the tail cone, the registration in
  // blue under them, the flag on the fin; green wings and tips.
  { id: 'verde', name: 'Paint C — green, blue graphics', base: LIME, roof: LIME, frame: LIME, wing: LIME, tip: LIME, stab: LIME, gear: '#2b2f33', text: DEEPBLUE, seam: 'rgba(14,50,10,0.32)', rivet: 'rgba(10,40,8,0.28)' },
];

// ---------------------------------------------------------------------------
// Forward fuselage K(z, half width, shoulder y, bottom y, top y, pU, pL):
// the cowl lip just larger than the spinner, opening out to the firewall;
// the hopper bay squaring into the cabin's straight sides.
const FWD_KEYS = [
  K(2.16, 0.225, 0.11, -0.11, 0.27, 2.4, 2.2),
  K(2.04, 0.275, 0.09, -0.18, 0.33, 2.6, 2.4),
  K(1.75, 0.335, 0.06, -0.27, 0.4, 3.0, 2.8),
  K(1.35, 0.385, 0.03, -0.35, 0.45, 3.4, 3.2),
  K(1.03, 0.415, 0.01, -0.4, 0.49, 3.8, 3.6),
  K(0.5, 0.445, -0.02, -0.45, 0.55, 4.4, 4.2),
  K(0.0, 0.46, -0.03, -0.46, 0.6, 5.5, 5),
  K(-0.47, 0.46, -0.03, -0.46, 0.62, 9, 6),
];
// Cabin and the aft fuselage: a box under the longerons (straight sides,
// superellipse belly) and over it one shell (cabin, rear fairing, dorsal)
// whose crest follows CREST. [z, half width, longeron y, side→belly y,
// bottom y, belly exponent].
export const CAB = { wsB: -0.47, roofF: -0.85, roofR: -1.57, bPost: -1.5, win: -1.95, fair: -2.14, sill: 0.47, roof: 1.21, end: -4.5 };
const BOX = [
  [CAB.wsB, 0.46, 0.6, -0.03, -0.46, 6],
  [-0.7, 0.46, CAB.sill, -0.03, -0.46, 5.8],
  [-1.2, 0.46, CAB.sill, -0.03, -0.45, 5.6],
  [CAB.win, 0.445, CAB.sill + 0.01, -0.025, -0.415, 5.0],
  [CAB.fair, 0.43, 0.5, -0.02, -0.4, 4.8],
  [-3.0, 0.33, 0.5, 0.0, -0.29, 4.2],
  [-3.8, 0.215, 0.46, 0.04, -0.17, 3.5],
  [-4.25, 0.135, 0.43, 0.07, -0.11, 3.0],
  [CAB.end, 0.07, 0.42, 0.1, -0.08, 2.6],
];
const CREST = [[CAB.wsB, 0.62], [-0.6, 0.83], [-0.72, 1.02], [-0.8, 1.14], [-0.86, 1.195], [-1.2, 1.215], [-1.57, 1.2],
  [-1.72, 1.13], [-1.9, 0.94], [-2.05, 0.74], [-2.2, 0.66], [-2.6, 0.635], [-3.37, 0.6], [-4.0, 0.545], [CAB.end, 0.5]];
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
// Shell point: t 0 = left longeron, 0.5 = crest, 1 = right longeron. In the
// cabin the section is boxy (flat roof, rounded edges) with the sides
// leaning in 12 %; behind the roof it rounds off into the dorsal.
const cabinF = (z) => 1 - smoothstep(CAB.roofR - 0.1, CAB.fair - 0.25, z) * 1; // 1 in the cabin, 0 on the dorsal
export const shellP = (z, t) => {
  const b = boxAt(z), top = Math.max(b.yl + 0.002, crestY(z)), f = cabinF(z);
  const p = lerp(2.3, 4.6, f), lean = lerp(1, 0.86, f);
  const a = Math.PI * t, c = Math.cos(a), sn = Math.sin(a);
  const v = Math.abs(sn) ** (2 / p);
  return [b.w * Math.sign(c) * Math.abs(c) ** (2 / p) * lerp(1, lean, v), b.yl + (top - b.yl) * v, z];
};
// Body half width at (z, y) under the longerons (fittings, wing root).
export const boxX = (z, y) => {
  const b = boxAt(z);
  if (y >= b.ys) return b.w;
  const t = clamp((b.ys - y) / (b.ys - b.yb), 0, 1);
  return b.w * Math.max(0, 1 - t ** b.p) ** (1 / b.p);
};

// ---------------------------------------------------------------------------
// Livery: side projection (top half of the canvas = left side, nose to the
// left; bottom half = right side, nose to the right).
const LV = { Z0: -5.0, Z1: 2.6, Y0: -0.65, Y1: 1.65, W: 2048, H: 1024, M: 6 };
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
// Fin outline in the side projection [z, y] (leading edge root → top →
// rudder trailing edge), shared by the livery and the geometry.
const FIN = { root: [-3.37, 0.58], top: [-3.97, 1.57], hinge: -4.5, te: -4.9, bottom: -0.08 };

function liveryTextures(reg, L = E201_LIVERIES[0]) {
  const c = canvas(LV.W, LV.H), b = canvas(LV.W, LV.H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, LV.W, LV.H);
  orangePeel(gb, LV.W, LV.H, 83);
  const brasil = L.id === 'brasil', verde = L.id === 'verde';
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
    if (brasil || verde) {
      if (brasil) {
        // Cheat line: yellow over white, straight from the cowl to the tail
        // post (it follows the fuselage's side, where the sides are flat).
        poly([[2.2, 0.06], [-4.6, 0.2], [-4.6, 0.25], [2.2, 0.11]], YELLOW);
        poly([[2.2, 0.035], [-4.6, 0.175], [-4.6, 0.19], [2.2, 0.05]], WHITE);
      } else {
        // Sweeping bands: a centre line (z, y) through Catmull-Rom points
        // with a half thickness that tapers to points at both ends.
        const band = (pts, half, fill) => {
          const S = [];
          for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 12; k++) {
            const t = k / 12, p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
            const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
            S.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
          }
          S.push(pts[pts.length - 1]);
          const n = S.length, up = [], dn = [];
          for (let i = 0; i < n; i++) {
            const f = i / (n - 1), w = half * Math.min(1, f / 0.12, (1 - f) / 0.3) ** 0.7;
            up.push([S[i][0], S[i][1] + w]); dn.push([S[i][0], S[i][1] - w]);
          }
          poly(up.concat(dn.reverse()), fill);
        };
        band([[2.0, 0.02], [1.1, 0.12], [0.1, 0.25], [-1.0, 0.31], [-2.1, 0.26], [-3.3, 0.15], [-4.45, 0.12]], 0.075, DEEPBLUE);
        band([[1.75, -0.06], [0.8, 0.03], [-0.4, 0.13], [-1.6, 0.15], [-2.8, 0.06], [-4.2, 0.0]], 0.026, MIDBLUE);
        band([[0.45, 0.38], [-0.3, 0.41], [-1.2, 0.43], [-2.0, 0.4]], 0.016, DEEPBLUE);
      }
      // Fin and rudder: the flag — the yellow rhombus, the blue globe with
      // its white band (proportions of the flag, fitted to the fin's middle).
      const cz = -4.27, cy = 1.06, hz = 0.52, hy = 0.36;
      if (verde) poly([[-3.47, 0.72], [-4.95, 0.72], [-4.95, 1.43], [-3.9, 1.43]], '#0f8a3a'); // the flag's own green on the lime fin
      poly([[cz + hz, cy], [cz, cy + hy], [cz - hz, cy], [cz, cy - hy]], YELLOW);
      const [gx, gy] = P(cz, cy);
      const rg = 0.2 * LV.ky;
      g.fillStyle = '#1f3c94';
      g.beginPath(); g.ellipse(gx, gy, rg * (LV.kx / LV.ky) * (LV.ky / LV.kx), rg, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = WHITE; g.lineWidth = 0.035 * LV.ky;
      g.beginPath(); g.ellipse(gx + (side > 0 ? 1 : -1) * 0.12 * LV.kx, gy + 0.33 * LV.ky, 0.36 * LV.kx, 0.36 * LV.ky, 0, side > 0 ? 3.75 : -0.6, side > 0 ? 4.35 : 0.0); g.stroke();
      g.fillStyle = WHITE;
      for (let k = 0; k < 9; k++) { const r = rng(5 + k); const [sx, sy] = P(cz - 0.12 + r() * 0.24, cy - 0.1 + r() * 0.12); g.fillRect(sx, sy, 2, 2); }
      if (brasil) {
        text(-3.25, 0.37, reg, 0.24, L.text, 'bold', 1.1);
        text(1.62, 0.25, 'IPANEMA', 0.085, YELLOW, 'italic bold', 1.05);
        text(-1.95, 0.42, 'RESTRITA', 0.032, WHITE, 'bold');
      } else {
        text(-2.75, -0.1, reg, 0.22, DEEPBLUE, 'bold', 1.05);
        text(-2.75, 0.43, 'SERVIÇO AÉREO', 0.034, '#141a22', 'bold');
        text(-2.75, 0.385, 'ESPECIALIZADO', 0.034, '#141a22', 'bold');
        text(-1.55, 0.37, 'RESTRITA', 0.032, '#f4f4ee', 'bold');
        text(-4.22, 0.64, 'IPANEMA', 0.07, DEEPBLUE, 'bold', 1.05);
      }
    } else {
      // Blue band, straight from the cowl lip to the tail; over the cone it
      // drops to cover the lower rear fuselage and the rudder's foot; a fine
      // blue line above it.
      poly([[2.2, -0.05], [-2.2, 0.06], [-3.3, -0.2], [-4.95, -0.2], [-4.95, 0.36], [-3.2, 0.3], [-2.2, 0.27], [2.2, 0.16]], BLUE);
      poly([[2.2, 0.185], [-3.2, 0.33], [-3.2, 0.345], [2.2, 0.2]], BLUE);
      // Fin cap.
      poly([[-3.85, 1.42], [-5.0, 1.42], [-5.0, 1.7], [-3.8, 1.7]], BLUE);
      text(-3.6, 0.04, reg, 0.22, ORANGE, 'bold', 1.1);
      text(1.62, 0.32, 'IPANEMA', 0.075, NAVY, 'italic bold', 1.05);
      text(-1.95, 0.45, 'RESTRITA', 0.032, NAVY, 'bold');
    }
    if (!verde) text(-4.25, 1.3, 'EMB-201A', 0.04, brasil ? WHITE : NAVY, 'bold');
    // Belly grime and the exhaust streak (left side).
    const [, belly] = P(0, -0.36);
    const grd = g.createLinearGradient(0, belly, 0, oy + LV.H / 2);
    grd.addColorStop(0, 'rgba(60,50,30,0)'); grd.addColorStop(1, 'rgba(60,50,30,0.24)');
    g.fillStyle = grd; g.fillRect(0, belly, LV.W, oy + LV.H / 2 - belly);
    if (side > 0) {
      const [ax, ay] = P(0.95, -0.3), [bx] = P(-0.9, -0.3);
      const sg = g.createLinearGradient(ax, 0, bx, 0);
      sg.addColorStop(0, 'rgba(30,25,20,0.32)'); sg.addColorStop(1, 'rgba(30,25,20,0)');
      g.fillStyle = sg;
      g.beginPath(); g.ellipse((ax + bx) / 2, ay + 6, Math.abs(bx - ax) / 2, 0.12 * LV.ky, 0, 0, Math.PI * 2); g.fill();
    }
    // Seams with rivet rows: cowl (the side doors, firewall), hopper bay,
    // cabin frames, the left door, aft frames, the tail access door.
    const seams = [
      [[2.16, -0.12], [2.16, 0.28]], [[1.03, -0.43], [1.03, 0.49]], [[2.05, 0.08], [1.1, 0.04]], [[1.9, 0.3], [1.15, 0.38]],
      [[0.5, -0.48], [0.5, 0.55]], [[CAB.wsB, -0.46], [CAB.wsB, 0.6]], [[CAB.fair, -0.4], [CAB.fair, 0.5]],
      [[-2.9, -0.34], [-2.9, 0.55]], [[-3.6, -0.25], [-3.6, 0.5]], [[0.5, -0.25], [CAB.fair, -0.24]], [[CAB.fair, -0.24], [-4.4, -0.1]],
    ];
    if (side > 0) seams.push([[-0.62, CAB.sill - 0.01], [-0.62, -0.05], [-1.45, -0.05], [-1.45, CAB.sill - 0.01]]);
    for (const s of seams) {
      line(g, s, L.seam, 2); line(gb, s, '#3c3c3c', 2.6);
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
    for (let k = 0; k < 6; k++) {
      const [px, py] = P(1.95 - k * 0.15, 0.06);
      gb.fillStyle = '#2e2e2e'; gb.beginPath(); gb.arc(px, py, 3, 0, Math.PI * 2); gb.fill();
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(px, py, 2.4, 0, Math.PI * 2); g.fill();
    }
    for (let k = 0; k < 5; k++) line(g, [[1.3 - k * 0.06, -0.2], [1.27 - k * 0.06, -0.32]], 'rgba(0,0,0,0.45)', 3);
    text(0.75, -0.36, 'AVGAS 100', 0.03, brasil || verde ? 'rgba(240,240,236,0.8)' : 'rgba(30,30,30,0.7)', 'bold');
    speckle(g, 0, oy, LV.W, LV.H / 2, 2400, side > 0 ? 41 : 42, 0.08);
    g.restore();
  }
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}

// Wing skin: u = span / SPAN_UV, v = chord fraction (0 = LE).
function wingTextures(L = E201_LIVERIES[0]) {
  const Wd = 2048, H = 512;
  const c = canvas(Wd, H), b = canvas(Wd, H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  g.fillStyle = L.wing; g.fillRect(0, 0, Wd, H);
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, Wd, H);
  orangePeel(gb, Wd, H, 79);
  const X = (m) => (m / SPAN_UV) * Wd, Y = (f) => f * H;
  // Tip band in the tip colour (both schemes).
  g.fillStyle = L.tip; g.fillRect(X(W.tipX - 0.42), 0, Wd, H);
  const r = rng(43);
  for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(80,80,70,${0.02 + r() * 0.035})`; g.fillRect(r() * Wd, Y(0.1 + r() * 0.8), 2 + r() * 3, 30 + r() * 110); }
  for (let i = 0; i < 1000; i++) { g.fillStyle = `rgba(60,48,30,${0.06 + r() * 0.12})`; g.fillRect(r() * Wd, Y(r() * 0.05), 1 + r() * 2, 1 + r() * 2); }
  const seam = (x0, y0, x1, y1, rivet = 0.055) => {
    g.strokeStyle = L.seam; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    gb.strokeStyle = '#3e3e3e'; gb.lineWidth = 2.6; gb.beginPath(); gb.moveTo(x0, y0); gb.lineTo(x1, y1); gb.stroke();
    const n = Math.max(2, Math.round(Math.hypot((x1 - x0) / (Wd / SPAN_UV), ((y1 - y0) / H) * W.chord) / rivet));
    for (let k = 0; k <= n; k++) {
      const px = x0 + ((x1 - x0) * k) / n + 0.5, py = y0 + ((y1 - y0) * k) / n + 5;
      gb.fillStyle = '#5c5c5c'; gb.beginPath(); gb.arc(px, py, 1.3, 0, Math.PI * 2); gb.fill();
      g.fillStyle = L.rivet; g.fillRect(px - 1, py - 1, 2, 2);
    }
  };
  for (const f of [0.12, 0.3, 0.72]) seam(X(0.4), Y(f), X(5.8), Y(f));
  for (let x = 0.9; x < 5.7; x += 0.5) seam(X(x), Y(0.0), X(x), Y(0.72), 0.06);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, Y(0.742), Wd, 4);
  gb.fillStyle = '#202020'; gb.fillRect(0, Y(0.742), Wd, 6);
  for (const [a, bb] of [[1.4, 2.0], [2.3, 2.9]]) {
    g.strokeStyle = L.seam; g.lineWidth = 2; g.strokeRect(X(a), Y(0.32), X(bb) - X(a), Y(0.22));
    gb.strokeStyle = '#383838'; gb.lineWidth = 2.6; gb.strokeRect(X(a), Y(0.32), X(bb) - X(a), Y(0.22));
  }
  speckle(g, 0, 0, Wd, H, 2200, 49, 0.07);
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}
const wingP = (stations, prof, side, ao) => {
  const g = wingPanel(stations, prof, side, ao);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * WING_SPAN_UV) / SPAN_UV);
  return g;
};

// Overall dimensions (tests): span over the drooped tips, spinner to rudder,
// the high points (roof, fin).
export const E201_DIM = { spinnerZ: 2.53, rudderZ: FIN.te };
export function e201Extent() {
  return {
    span: 2 * W.half, length: E201_DIM.spinnerZ - E201_DIM.rudderZ,
    tops: [[0, CAB.roof + 0.012, -1.2], [0, FIN.top[1], FIN.hinge]],
  };
}

// Hartzell two-blade (+X): broad, gently tapered, twisted.
function bladeLoft(r0, r1, steps, R) {
  const pos = [], idx = [];
  let n = 0;
  for (let i = 0; i <= steps; i++) {
    const r = r0 + ((r1 - r0) * i) / steps;
    const f = clamp((r - 0.18) / (R - 0.18), 0, 1);
    let c = 0.11 + 0.08 * Math.sin(Math.PI * Math.min(1, f * 0.85 + 0.15)) ** 0.6;
    if (f > 0.86) c *= 1 - ((f - 0.86) / 0.14) ** 2 * 0.55;
    const t = lerp(0.24, 0.07, f);
    const beta = Math.atan(1.9 / (2 * Math.PI * Math.max(r, 0.22)));
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

// Pilot and cockpit anchors (body frame), on this cabin.
export const E201_CABIN = {
  eye: [0, 0.87, -1.34], seat: [0, -0.06, -1.55], floorY: -0.4,
  roof: [0, CAB.roof, -1.2], door: [0.47, 0.35, -1.0], windshield: [0, 0.9, -0.66],
};

// ==========================================================================
export function createE201Model(panel, opts = {}) {
  const root = new THREE.Group();
  root.name = 'e201';
  let REG = opts.reg ?? 'PR-IPC', livery = 0;
  const L0 = E201_LIVERIES[0];
  const liv = liveryTextures(REG, L0), wtx = wingTextures(L0);
  const coat = { roughness: 0.44, metalness: 0.0, specularIntensity: 0.38, clearcoat: 0.28, clearcoatRoughness: 0.26, envMap: opts.envMap ?? null, envMapIntensity: 0.33 };
  const ALB = 0.86;
  const col = (c) => new THREE.Color(c).multiplyScalar(ALB);
  const phys = (c, extra = {}) => new THREE.MeshPhysicalMaterial({ color: col(c), vertexColors: true, ...coat, ...extra });
  const M = {
    livery: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALB), map: liv.map, bumpMap: liv.bump, bumpScale: 1.3, vertexColors: true, ...coat }),
    wing: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALB), map: wtx.map, bumpMap: wtx.bump, bumpScale: 1.3, vertexColors: true, ...coat }),
    roof: phys(L0.roof, { side: THREE.DoubleSide }),
    frame: phys(L0.frame),
    stab: phys(L0.stab),
    tip: phys(L0.tip),
    gear: phys(L0.gear, { roughness: 0.5 }),
    lid: new THREE.MeshPhysicalMaterial({ color: 0xbfa77d, roughness: 0.4, metalness: 0.2, clearcoat: 0.4, clearcoatRoughness: 0.25, vertexColors: true, side: THREE.DoubleSide, envMap: opts.envMap ?? null, envMapIntensity: 0.4 }),
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
    wire: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.35, metalness: 0.9 }),
    // (Kept low on reflection: the side windows are seen from the seat at a
    // grazing angle and would wash out to white over the wing.)
    glass: new THREE.MeshPhysicalMaterial({ color: 0xa8bcc6, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.12, clearcoat: 0.35, clearcoatRoughness: 0.08, specularIntensity: 0.35, envMapIntensity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false }),
    interior: new THREE.MeshStandardMaterial({ color: 0xd9d6cc, roughness: 0.75, metalness: 0.12, vertexColors: true, side: THREE.DoubleSide }),
    seat: new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.82, vertexColors: true }),
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
    let a = 1 - Math.max(0, -y - 0.2) * 0.45;
    const yb = Math.max(0, 1 - Math.abs(y + 0.4) / 0.2), zb = Math.max(0, 1 - Math.abs(z + 0.43) / 1.1);
    a *= 1 - 0.32 * yb * Math.sqrt(zb); // wing-root shadow
    if (z < -3.5 && z > -4.6) a *= 1 - 0.18 * Math.max(0, 1 - Math.abs(y - 0.4) / 0.12); // tailplane root
    if (z > 2.0) a *= 0.84 + 0.16 * clamp((2.16 - z) / 0.16, 0, 1);
    return clamp(a, 0.5, 1);
  };
  const fwdSt = sampleStations(FWD_KEYS, 22);
  add('livery', liveryUV(tagged(loft(fwdSt, 60, fusAO))));
  const zsAft = [];
  for (let z = CAB.wsB; z > CAB.end + 1e-6; z -= 0.08) zsAft.push(z);
  zsAft.push(CAB.end);
  const rings = (fn, n, zs, wind = 1) => {
    const pos = [], cl = [], idx = [];
    for (const z of zs) for (let k = 0; k <= n; k++) { const [x, y] = fn(z, k / n); pos.push(x, y, z); const gg = fusAO(x, y, z); cl.push(gg, gg, gg); }
    for (let si = 0; si < zs.length - 1; si++) for (let k = 0; k < n; k++) {
      const a = si * (n + 1) + k, b = a + 1, c = a + n + 1, d = c + 1;
      if (wind > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
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
  // Collar at the windshield base (the hopper bay's rounded shoulders into
  // the cabin's straight sides).
  {
    const outer = []; for (let k = 0; k <= 40; k++) outer.push(new THREE.Vector2(...boxRing(CAB.wsB, k / 40)));
    const sh = new THREE.Shape(outer);
    const st = fwdSt[fwdSt.length - 1], cy = (st.yt + st.yb) / 2;
    sh.holes.push(new THREE.Path(ring(st, 60).slice(0, -1).reverse().map(([x, y]) => new THREE.Vector2(x * 0.997, cy + (y - cy) * 0.997))));
    add('livery', liveryUV(tagged(tx(new THREE.ShapeGeometry(sh), 0, 0, CAB.wsB - 0.002))));
  }
  // Tail post: the end of the cone, closed.
  {
    const pts = []; for (let k = 0; k <= 40; k++) pts.push(new THREE.Vector2(...boxRing(CAB.end, k / 40)));
    for (let k = 1; k < 24; k++) { const [x, y] = shellP(CAB.end, 1 - k / 24); pts.push(new THREE.Vector2(x, y)); }
    const cap = new THREE.ShapeGeometry(new THREE.Shape(pts));
    cap.scale(-1, 1, 1); cap.translate(0, 0, CAB.end);
    add('livery', liveryUV(tagged(cap)));
  }
  // Cowl nose: the face from the lip to the spinner's back plate, the two
  // cooling inlets beside the spinner, the chin intake.
  const lip = fwdSt[0];
  add('livery', liveryUV(tagged(grid((u, v) => {
    const a = u * Math.PI * 2;
    const [ox, oy] = ring({ ...lip }, 1, [a, a + 1e-6])[0];
    const ix = Math.cos(a) * 0.2, iy = AX + Math.sin(a) * 0.2;
    return [lerp(ox, ix, v), lerp(oy, iy, v), lerp(lip.z, 2.2, v ** 1.3)];
  }, 56, 4, [0, AX, 1.4]))));
  for (const sx of [1, -1]) {
    add('dark', tx(new THREE.CircleGeometry(0.055, 20), sx * 0.155, AX - 0.04, 2.178, 0, 0, 0, [1, 0.7, 1]));
    add('dark', tx(new THREE.CylinderGeometry(0.055, 0.055, 0.1, 20, 1, true), sx * 0.155, AX - 0.04, 2.13, Math.PI / 2, 0, 0, [1, 1, 0.7]));
  }
  add('dark', rbox(0.18, 0.05, 0.05, 0.018, 0, AX - 0.25, 2.07));
  // Exhaust: the stack out of the left side of the cowl, pointing down-aft.
  add('exhaust', tube([[0.36, -0.18, 1.18], [0.42, -0.25, 1.06], [0.45, -0.34, 0.88]], 0.038, 10, 10));
  {
    const e = new THREE.Vector3(0.45, -0.34, 0.88), dir = new THREE.Vector3(0.02, -0.06, -0.16).normalize();
    const th = new THREE.CircleGeometry(0.034, 14);
    th.applyMatrix4(new THREE.Matrix4().compose(e, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir), new THREE.Vector3(1, 1, 1)));
    add('soot', th);
  }
  // Hopper: the tan fibreglass lid between the cowl and the windshield, its
  // frame and latches, the loading box at its front; vent.
  const topY = (z) => (z > CAB.wsB ? fwdSt.reduce((b, s) => (Math.abs(s.z - z) < Math.abs(b.z - z) ? s : b)).yt : crestY(z));
  {
    const st = fwdSt.filter((s) => s.z <= 0.95 && s.z >= -0.38).map((s) => ({ ...s, hw: s.hw * 0.72, yt: s.yt + 0.012, ys: s.yt - 0.06 }));
    add('lid', loft(st, 18, null, [Math.PI * 0.2, Math.PI * 0.8]));
    for (const z of [0.95, -0.38]) add('dark', tx(new THREE.BoxGeometry(0.7, 0.02, 0.03), 0, topY(z) + 0.006, z));
    for (const sx of [1, -1]) add('dark', tube(st.map((s) => [sx * s.hw * 0.95, s.yt - 0.028, s.z]), 0.01, 18, 6));
    for (const z of [0.55, 0.0]) add('steel', rbox(0.05, 0.025, 0.07, 0.01, -0.3, topY(z) + 0.012, z), true);
    add('alu', rbox(0.3, 0.12, 0.22, 0.02, 0, topY(1.1) + 0.05, 1.1));
    add('dark', rbox(0.24, 0.02, 0.16, 0.008, 0, topY(1.1) + 0.115, 1.1), true);
    add('dark', tx(new THREE.CylinderGeometry(0.025, 0.025, 0.09, 10), 0.24, topY(0.75) + 0.04, 0.75));
  }
  // Hopper loading coupler (left), gatebox under the hopper.
  add('dark', tx(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 18), boxX(0.1, -0.22) + 0.01, -0.22, 0.1, 0, 0, Math.PI / 2));
  add('brass', tx(new THREE.CylinderGeometry(0.045, 0.045, 0.025, 18), boxX(0.1, -0.22) + 0.05, -0.22, 0.1, 0, 0, Math.PI / 2));
  add('dark', rbox(0.34, 0.08, 0.42, 0.02, 0, -0.5, 0.25));

  // ---------------- cabin, rear fairing and dorsal (one shell) ----------------
  // Regions: glass (windshield and the side windows to the B-post, the
  // quarter window behind it), roof (scheme colour, seen from inside too),
  // painted shell (livery).
  const glassG = [];
  const TW = 0.27, TQ = 0.2; // side window height (fraction of the arch), quarter window
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
      else if (zc > CAB.roofR) r = sideT < TW ? 'paint' : 'roof';
      if (zc < CAB.bPost - 0.04 && zc > CAB.win && sideT < TQ) r = 'glass';
      reg[r].push(a, c, b, b, c, d);
    }
    const mk = (idx) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
    glassG.push(mk(reg.glass));
    add('roof', mk(reg.roof));
    add('livery', liveryUV(tagged(mk(reg.paint))));
    // Bulkhead behind the seat (the cabin closed at the fairing's foot).
    {
      const pts = []; for (let k = 0; k <= NT; k++) { const p = shellP(CAB.win - 0.06, k / NT); pts.push(new THREE.Vector2(p[0], p[1])); }
      for (let k = 1; k < 20; k++) { const [x, y] = boxRing(CAB.win - 0.06, 1 - k / 20); pts.push(new THREE.Vector2(x, y)); }
      add('interior', tx(new THREE.ShapeGeometry(new THREE.Shape(pts)), 0, 0, CAB.win - 0.06));
    }
    // Frames: windshield base, A-posts, the centre strip, roof rails, the
    // visor edge, B-posts, the quarter window's rear edge, sill rails.
    const F = (pts, r = 0.02) => add('frame', tube(pts, r, Math.max(4, pts.length * 2), 6));
    const alongZ = (t, z0, z1, n = 10) => Array.from({ length: n + 1 }, (_, i) => shellP(lerp(z0, z1, i / n), t));
    const alongT = (z, t0, t1, n = 12) => Array.from({ length: n + 1 }, (_, i) => shellP(z, lerp(t0, t1, i / n)));
    F(alongT(CAB.wsB - 0.012, 0, 1, 20), 0.022);
    for (const t of [TW, 1 - TW]) F(alongZ(t, CAB.wsB - 0.01, CAB.roofF, 10), 0.024);
    add('ink', tube(alongZ(0.5, CAB.wsB - 0.01, CAB.roofF, 8).map(([x, y, z]) => [x, y + 0.004, z]), 0.006, 16, 6)); // the slim dark centre rod
    F(alongT(CAB.roofF, TW, 1 - TW, 16), 0.024);
    for (const t of [TW, 1 - TW]) F(alongZ(t, CAB.roofF, CAB.roofR, 10), 0.02);
    for (const [t0, t1] of [[0, TW], [1 - TW, 1]]) F(alongT(CAB.bPost, t0, t1, 6), 0.022);
    for (const [t0, t1] of [[0, TQ], [1 - TQ, 1]]) F(alongT(CAB.win, t0, t1, 5), 0.02);
    for (const t of [0, 1]) F(alongZ(t, CAB.wsB, CAB.win, 12), 0.022); // on the sill line itself
    for (const t of [TQ, 1 - TQ]) F(alongZ(t, CAB.bPost, CAB.win, 6), 0.016);
    // Visor: the roof's front edge stands proud of the windshield's top.
    add('roof', grid((u, v) => { const t = lerp(TW - 0.01, 1 - TW + 0.01, u); const p = shellP(CAB.roofF + 0.05, t), q = shellP(CAB.roofF - 0.06, t); return lerp3([p[0] * 1.02, p[1] + 0.012, CAB.roofF + 0.05], [q[0], q[1] + 0.012, q[2]], v); }, 16, 2));
    // Door (left): handle and hinges on the sill side.
    // (On the door frame at the sill, under the window — not in the glass.)
    const dh = shellP(-1.36, 0); // the sill line itself: the handle sits on the painted door, under the glass
    add('steel', rod([dh[0] + 0.03, dh[1] - 0.035, dh[2] + 0.07], [dh[0] + 0.03, dh[1] - 0.035, dh[2] - 0.07], 0.008, 6), true);
  }
  // Mast over the windshield and the wire to the fin top; a whip aerial.
  const mastTop = [0, CAB.roof + 0.1, CAB.roofF - 0.02];
  add('ink', rod([0, CAB.roof, CAB.roofF - 0.06], mastTop, 0.012, 6));
  add('wire', rod(mastTop, [0, FIN.top[1] + 0.01, FIN.top[0] - 0.05], 0.0035, 4));
  add('white', rod([0, 0.62, -2.9], [0, 0.95, -3.1], 0.006, 5), true);

  // ---------------- wing ----------------
  const leY = (x) => e201WingY(x);
  const mainProf = airfoil(0, 0.74, 0.15, 0.035, 0.4, 18), aftProf = airfoil(0.76, 1.0, 0.15, 0.035, 0.4, 6), fullProf = airfoil(0, 1, 0.15, 0.035, 0.4, 20);
  const flaps = [], ailerons = [];
  const wingAO = (x, xc, lower) => (lower ? 1 : 1 - 0.25 * Math.max(0, 1 - (x - 0.5) / 0.5));
  const st = (x) => ({ x, y: leY(x), le: W.le, chord: W.chord });
  const hinge = (side, x) => new THREE.Vector3(side * x, leY(x) + 0.035, W.le - 0.76 * W.chord);
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
  const FLAP = [0.6, 3.3], AIL = [3.38, 5.6];
  // Drooped tip: the section carried out and curved down, the chord
  // rounding at the trailing corner.
  const TIP = [[0, 0, 0, 0], [0.06, -0.012, 0, 0], [0.11, -0.04, -0.02, 0.01], [0.15, -0.08, -0.06, 0.03], [0.175, -0.12, -0.14, 0.06], [0.185, -0.14, -0.26, 0.1]];
  for (const side of [1, -1]) {
    add('wing', wingP([0.34, W.rootX, 1.5, 2.6, 3.7, 4.7, W.tipX].map(st), mainProf, side, wingAO));
    for (const [a, b] of [[0.34, FLAP[0]], [FLAP[1], AIL[0]], [AIL[1], W.tipX]]) add('wing', wingP([st(a), st(b)], aftProf, side, wingAO));
    flaps.push(surfaceMesh(wingP([FLAP[0], 2.0, FLAP[1]].map(st), aftProf, side, wingAO), FLAP[0], FLAP[1], side));
    ailerons.push(surfaceMesh(wingP([AIL[0], 4.5, AIL[1]].map(st), aftProf, side), AIL[0], AIL[1], side));
    add('tip', wingP(TIP.map(([dx, dy, dc, dl]) => ({ x: W.tipX + dx, y: leY(W.tipX) + dy * 0.6, le: W.le - dl, chord: W.chord + dc })), fullProf, side));
    // Nav light in the tip's leading edge, strobe at its trailing edge.
    const navP = [side * (W.tipX + 0.12), leY(W.tipX) - 0.04, W.le - 0.06];
    add(side > 0 ? 'red' : 'green', ball(navP, 0.024, 10));
    add('lens', tx(new THREE.SphereGeometry(0.045, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), ...navP, 0, 0, side * Math.PI / 2, [1, 1, 1.3]));
    add('strobe', ball([side * (W.tipX + 0.1), leY(W.tipX) - 0.05, W.le - W.chord + 0.18], 0.016, 8));
    // Root fillet along the fuselage side.
    const fil = mainProf.slice(0, 19).map(([xc, yc]) => { const y = W.rootY + yc * W.chord + 0.01, z = W.le - xc * W.chord; return [side * (boxX(z, y) - 0.006), y, z]; });
    add('wing', tube(fil, 0.034, 30, 10));
    if (side > 0) {
      const up = mainProf.slice(0, 19).filter(([xc]) => xc > 0.12 && xc < 0.62);
      const sheet = up.map(([xc, yc]) => [xc, yc + 0.004]).concat(up.slice().reverse().map(([xc, yc]) => [xc, yc + 0.0005]));
      add('deck', wingP([0.52, 0.8, 1.06].map(st), sheet, side));
    }
    const fx = 2.1, fy = leY(fx) + 0.13, fz = W.le - 0.35 * W.chord;
    add('dark', tx(new THREE.CylinderGeometry(0.055, 0.055, 0.025, 18), side * fx, fy, fz, 0, 0, side * Math.atan(W.dih)));
    for (const hx of [0.9, 2.0, 3.0, 3.9, 4.8, 5.5]) {
      const h = hinge(side, hx);
      add('dark', tx(new THREE.BoxGeometry(0.03, 0.08, 0.13), h.x, h.y - 0.09, h.z + 0.03, 0, 0, side * Math.atan(W.dih)), true);
    }
  }
  add('steel', rod([4.2, leY(4.2) - 0.1, 0.25], [4.2, leY(4.2) - 0.1, 0.75], 0.01, 8), true); // pitot

  // ---------------- tail ----------------
  const vfin = (prof, sts) => {
    const g = wingPanel(sts.map(([h, le, c]) => ({ x: h, y: 0, le, chord: c })), prof, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getY(i), p.getX(i), p.getZ(i));
    return flipWinding(g);
  };
  // Fin: straight leading edge swept ≈ 32°, flat top with a small radius at
  // its front corner; rudder on a vertical hinge down past the cone's end.
  const finLE = (y) => lerp(FIN.root[0], FIN.top[0], (y - FIN.root[1]) / (FIN.top[1] - FIN.root[1]));
  const finSt = [0.5, 0.58, 0.9, 1.2, 1.45, 1.53, 1.565, FIN.top[1]].map((y, i, a) => {
    const round = y > 1.5 ? (y - 1.5) / (FIN.top[1] - 1.5) : 0;
    const le = y < FIN.root[1] ? FIN.root[0] : finLE(y) - 0.07 * round ** 2;
    return [y, le, le - FIN.hinge - 0.01];
  });
  add('livery', liveryUV(tagged(vfin(airfoil(0, 1, 0.12, 0, 0.4, 12), finSt))));
  // Dorsal fillet into the fin's leading edge.
  add('livery', liveryUV(tagged(loft(sampleStations([
    K(-2.95, 0.012, 0.61, 0.6, 0.618, 2.2, 2.2), K(-3.1, 0.03, 0.6, 0.59, 0.64, 2.2, 2.2),
    K(-3.25, 0.045, 0.59, 0.58, 0.68, 2.2, 2.2), K(-3.36, 0.05, 0.585, 0.575, 0.72, 2.2, 2.2),
  ], 20), 12, null))));
  const rudSt = [[FIN.bottom, FIN.hinge, 0.36], [0.1, FIN.hinge, 0.4], [0.5, FIN.hinge, 0.4], [1.0, FIN.hinge, 0.4], [1.5, FIN.hinge, 0.4], [FIN.top[1], FIN.hinge, 0.39]];
  const rudGeo = liveryUV(tagged(vfin(airfoil(0, 1, 0.13, 0, 0.3, 8), rudSt)));
  const rudTab = tagged(tx(new THREE.BoxGeometry(0.012, 0.24, 0.07), 0, 0.2, FIN.hinge - 0.39));
  rudGeo.translate(0, 0, -FIN.hinge); rudTab.translate(0, 0, -FIN.hinge);
  const rudder = new THREE.Group();
  rudder.position.set(0, 0, FIN.hinge);
  const rudMesh = new THREE.Mesh(rudGeo, M.livery);
  rudMesh.castShadow = true;
  rudder.add(rudMesh, new THREE.Mesh(rudTab, M.stab));
  rudder.add(new THREE.Mesh(tagged(ball([0, FIN.bottom + 0.05, -0.39], 0.02, 8)), M.white)); // tail light
  root.add(rudder);
  add('beacon', tx(new THREE.SphereGeometry(0.03, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, FIN.top[1] + 0.004, FIN.hinge + 0.12));
  // Tailplane: rectangular on the cone at the longerons, rounded tips;
  // elevators with a trim tab.
  const STY = 0.42, SLE = -3.62, SC = 0.92, ELEV = 0.58, STIP = 2.02;
  const sst = (x) => ({ x, y: STY, le: SLE, chord: SC });
  const elevParts = [];
  for (const side of [1, -1]) {
    add('stab', wingPanel([0.06, 1.0, 1.9].map(sst), airfoil(0, ELEV - 0.02, 0.11, 0, 0.4, 12), side));
    add('tip', wingPanel([1.9, 1.97, STIP].map((x, i) => ({ ...sst(x), chord: SC * (1 - [0, 0.03, 0.12][i]), le: SLE - [0, 0.008, 0.045][i] })), airfoil(0, 1, 0.11, 0, 0.4, 14), side));
    elevParts.push(tagged(wingPanel([0.1, 1.0, 1.88].map(sst), airfoil(ELEV, 1, 0.11, 0, 0.4, 4), side)));
  }
  elevParts.push(tagged(tx(new THREE.BoxGeometry(0.45, 0.012, 0.09), 0.8, STY + 0.006, SLE - SC - 0.03)));
  const elevGeo = mergeGeometries(elevParts);
  const elevHingeZ = SLE - ELEV * SC;
  elevGeo.translate(0, -STY, -elevHingeZ);
  const elevator = new THREE.Group();
  elevator.position.set(0, STY, elevHingeZ);
  const elevMesh = new THREE.Mesh(elevGeo, M.stab);
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
    if (big) for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; parts.push(tagged(tx(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 8), sx * Wd * 0.33, Math.cos(a) * rim * 0.55, Math.sin(a) * rim * 0.55, 0, 0, Math.PI / 2))); }
    spin.add(tmesh, new THREE.Mesh(mergeGeometries(parts), M.hub));
    return spin;
  };
  for (const [name, sx] of [['mainL', 1], ['mainR', -1]]) {
    const cfg = gearCfg[name];
    const R = cfg.radius, Wd = 0.19;
    const ax = cfg.p[0], ay = cfg.p[1] + R, az = cfg.p[2];
    const g = new THREE.Group();
    // Tubular V: the front leg from the firewall's lower corner, the rear
    // leg from the lower longeron at the wing's spar, meeting at the axle.
    const fA = [sx * boxX(1.0, -0.36), -0.36, 1.0], rA = [sx * (boxX(0.05, -0.44) - 0.01), -0.44, 0.05];
    fA[0] = sx * 0.43;
    const attachY = (fA[1] + rA[1]) / 2;
    const leg = new THREE.Group();
    leg.position.y = attachY;
    const Lp = (p) => [p[0], p[1] - attachY, p[2]];
    const axIn = [ax - sx * 0.125, ay + 0.03, az];
    const legParts = [rod(Lp(fA), Lp(axIn), 0.034, 12, 0.03), rod(Lp(rA), Lp(axIn), 0.03, 12, 0.026), tx(new RoundedBoxGeometry(0.09, 0.12, 0.14, 2, 0.025), ...Lp(axIn)), rod(Lp(axIn), Lp([ax - sx * 0.02, ay, az]), 0.032, 12)];
    const legMesh = new THREE.Mesh(mergeGeometries(legParts.map((p) => tagged(p))), M.gear);
    legMesh.castShadow = true; legMesh.receiveShadow = true;
    const brakeLine = new THREE.Mesh(tagged(tube([Lp([fA[0] - sx * 0.02, fA[1] - 0.02, fA[2] - 0.05]), Lp(lerp3(fA, axIn, 0.55).map((v, i) => v + [0, 0, -0.04][i])), Lp([axIn[0], axIn[1] + 0.06, axIn[2] - 0.04])], 0.007, 14, 5)), M.rubber);
    leg.add(legMesh, brakeLine);
    g.add(leg);
    for (const p of [fA, rA]) add('dark', rbox(0.1, 0.06, 0.12, 0.02, p[0], p[1] + 0.02, p[2]));
    const wheel = new THREE.Group();
    wheel.position.set(ax, ay, az);
    const spinPart = makeWheel(R, Wd, 0.14, sx, true);
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
    const fz = cfg.p[2] + 0.06, fy = cfg.p[1] + R + 0.12;
    // Leaf spring from under the cone back to the steerable fork.
    add('ink', bar([0, -0.13, -4.18], [0, fy + 0.03, fz + 0.02], 0.045, 0.016));
    add('dark', rbox(0.08, 0.035, 0.13, 0.012, 0, -0.13, -4.18));
    add('ink', tx(new THREE.CylinderGeometry(0.026, 0.026, 0.06, 10), 0, fy + 0.03, fz));
    const fork = new THREE.Group();
    fork.position.set(0, fy, fz);
    const forkGeo = mergeGeometries([
      tagged(tx(new THREE.BoxGeometry(0.012, 0.13, 0.05), 0.05, -0.05, -0.04, 0.5)), tagged(tx(new THREE.BoxGeometry(0.012, 0.13, 0.05), -0.05, -0.05, -0.04, 0.5)),
      tagged(tx(new THREE.BoxGeometry(0.11, 0.02, 0.05), 0, 0.015, 0)),
    ]);
    fork.add(new THREE.Mesh(forkGeo, M.steel));
    const wheel = new THREE.Group();
    wheel.position.set(0, -0.12, -0.06);
    wheel.add(makeWheel(R, 0.075, 0.055, 1, false));
    fork.add(wheel);
    g.add(fork);
    root.add(g);
    gearGroups.tail = { group: g, wheel, spin: wheel.children[0], fork, rest: wheel.position.clone(), sx: 0 };
  }

  // ---------------- spray system ----------------
  // Booms under the trailing edge on four hangers a side, crossed under the
  // belly; the wind-driven pump between the main legs.
  const nozzles = [];
  const BZ = -1.1, BDROP = 0.23;
  const boomAt = (side, x) => [side * x, leY(x) - BDROP, BZ];
  for (const side of [1, -1]) {
    add('alu', rod(boomAt(side, 0.55), boomAt(side, 5.0), 0.025, 12));
    add('alu', ball(boomAt(side, 5.0), 0.029, 10));
    for (const hx of [1.2, 2.3, 3.4, 4.5]) {
      const topP = [side * hx, leY(hx) - 0.05, -0.62], bot = boomAt(side, hx);
      const len = Math.hypot(topP[1] - bot[1], topP[2] - bot[2]);
      add('alu', tx(new RoundedBoxGeometry(0.018, len, 0.06, 2, 0.007), side * hx, (topP[1] + bot[1]) / 2, (topP[2] + bot[2]) / 2, Math.atan2(topP[2] - bot[2], topP[1] - bot[1])));
      add('dark', tx(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 10), ...bot, 0, 0, Math.PI / 2), true);
    }
    const NZ = 18;
    for (let k = 0; k < NZ; k++) {
      const x = 0.7 + ((4.95 - 0.7) * k) / (NZ - 1);
      const [bx, by, bz] = boomAt(side, x);
      add('alu', rod([bx, by, bz], [bx, by - 0.06, bz - 0.015], 0.007, 6), true);
      add('yellow', tx(new THREE.CylinderGeometry(0.016, 0.013, 0.042, 10), bx, by - 0.083, bz - 0.022, 0.3), true);
      add('brass', tx(new THREE.ConeGeometry(0.009, 0.022, 8), bx, by - 0.11, bz - 0.032, Math.PI + 0.3), true);
      nozzles.push(new THREE.Vector3(bx, by - 0.115, bz - 0.032));
    }
  }
  add('alu', rod(boomAt(1, 0.55), boomAt(-1, 0.55), 0.034, 12));
  add('alu', tube([[0, -0.84, 0.75], [0, -0.85, 0.15], [0, -0.8, -0.6], [0, boomAt(1, 0)[1], BZ]], 0.034, 24, 10));
  const pump = new THREE.Group();
  pump.position.set(0, -0.8, 0.92);
  {
    const pumpBody = lathe([[0.0, -0.21], [0.075, -0.2], [0.095, -0.12], [0.105, 0.05], [0.085, 0.15], [0.05, 0.2], [0.0, 0.21]], 22);
    pumpBody.rotateX(Math.PI / 2);
    pump.add(new THREE.Mesh(tagged(pumpBody), M.dark));
    pump.add(new THREE.Mesh(tagged(tx(new THREE.SphereGeometry(0.042, 12, 8), 0, 0, 0.22)), M.steel));
    pump.add(new THREE.Mesh(tagged(rod([0, 0.09, 0], [0, 0.32, 0.05], 0.024, 8)), M.dark));
  }
  const pumpFan = new THREE.Group();
  pumpFan.position.z = 0.24;
  for (let i = 0; i < 7; i++) {
    const a = (i * Math.PI * 2) / 7;
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.008), M.orange);
    bl.position.set(Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0);
    bl.rotation.z = a; bl.rotation.x = 0.4;
    pumpFan.add(bl);
  }
  pump.add(pumpFan);
  root.add(pump);

  // ---------------- propeller (Hartzell, two blades, constant speed) ----------------
  const R = A.propRadius;
  const PZ = 2.24;
  const prop = new THREE.Group();
  prop.position.set(0, AX, PZ);
  {
    // Pointed spinner (the 201's): a long cone over the hub.
    const sp = lathe([[0.19, -0.05], [0.192, 0.0], [0.185, 0.06], [0.16, 0.13], [0.12, 0.2], [0.075, 0.25], [0.03, 0.28], [0.0, 0.29]], 36);
    sp.rotateX(Math.PI / 2);
    const spMesh = new THREE.Mesh(tagged(sp), M.polished);
    spMesh.castShadow = true;
    prop.add(spMesh, new THREE.Mesh(tagged(tx(new THREE.CylinderGeometry(0.195, 0.195, 0.02, 36), 0, 0, -0.05, Math.PI / 2)), M.steel));
  }
  const blades = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.55, metalness: 0.25, transparent: true });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xf0f0ec, roughness: 0.5, transparent: true });
  const bodyGeo = bladeLoft(0.15, R - 0.1, 16, R), tipGeo = bladeLoft(R - 0.1, R, 3, R);
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
  const C = E201_CABIN;
  const ck = buildE201Cockpit({ panel, envMap: opts.envMap ?? null, M, C, CAB, shellP, boxAt, boxX, crestY, TW, TQ });
  const { cockpit, stick, pedals, throttle, valve, leds, THR } = ck;
  root.add(cockpit);

  // ---------------- pilot ----------------
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
  lod.addLevel(new THREE.Group(), 95);
  root.add(lod);
  const glassMesh = new THREE.Group();
  const gm = new THREE.Mesh(mergeGeometries(glassG.map((g) => tagged(g))), M.glass);
  gm.renderOrder = 10;
  glassMesh.add(gm);
  root.add(glassMesh);
  root.traverse((o) => { if (o.isMesh && o.castShadow === undefined) o.castShadow = true; });

  // Constant-speed prop: fine at rest and at low speed, coarser as the
  // governor takes the power at speed; beacon and strobes; the cockpit.
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

  const swap = (mat, n) => { mat.map.dispose(); mat.bumpMap.dispose(); mat.map = n.map; mat.bumpMap = n.bump; mat.needsUpdate = true; };
  return {
    setReg(r) { REG = r; swap(M.livery, liveryTextures(REG, E201_LIVERIES[livery])); },
    // Paint scheme: the fuselage and wing canvases and the colours of the
    // roof, cabin frames, tailplane, tips and gear (same geometry and UVs).
    setLivery(i) {
      const k = ((i % E201_LIVERIES.length) + E201_LIVERIES.length) % E201_LIVERIES.length;
      if (k === livery) return;
      livery = k;
      const L = E201_LIVERIES[k];
      swap(M.livery, liveryTextures(REG, L));
      swap(M.wing, wingTextures(L));
      for (const [m, cc] of [[M.roof, L.roof], [M.frame, L.frame], [M.stab, L.stab], [M.tip, L.tip], [M.gear, L.gear]]) m.color.set(cc).multiplyScalar(ALB);
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
    fuelFiller: new THREE.Vector3(2.1, leY(2.1) + 0.14, W.le - 0.35 * W.chord),
    hopperPort: new THREE.Vector3(boxX(0.1, -0.22) + 0.05, -0.22, 0.1),
    update,
  };
}
