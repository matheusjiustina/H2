// Procedural agricultural aircraft modelled on the Embraer EMB-202 Ipanema
// (own markings: PR-AGW, AGRO WINGS). VISUAL ONLY — the flight model, the gear
// contact points and the collision hard points live in src/config.js and are
// not read or changed here (except the gear points, to place the wheels).
// Body frame: +Z nose, +Y up, +X left wing; origin = CG.
//
// Construction: a single smooth fuselage lofted through spline-interpolated
// stations (cowling, open cabin, integrated turtle deck), airfoil wings with
// upturned tips and root fillets, a framed canopy with a curved windshield,
// lathe-profiled tyres and hubs, a twisted airfoil propeller, and a detailed
// cockpit. Paint, stripes, registration and the flag are a side-projected
// livery with a matching bump map (panel seams, rivets, doors, louvres).
// Ambient occlusion is baked into vertex colours; fine detail sits in a LOD.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { rng, clamp, smoothstep, lerp } from '../core/math.js';
import { FLIGHT } from '../config.js';
import { IPA_PANEL } from './panel.js';

const DIH = Math.tan((6 * Math.PI) / 180);
export const WING = { rootX: 0.55, tipX: 5.85, rootY: -0.33, le: 0.85, chord: 1.7 };
export const wingY = (x) => WING.rootY + Math.max(0, Math.abs(x) - WING.rootX) * DIH;

export const PAINT = '#ff8700'; // Ipanema orange
const NAVY = '#16285e';
const DECK = '#2b2f35';
const WING_SPAN_UV = 6.2; // metres of half-span mapped to u = 0..1

// ==========================================================================
// Fuselage stations: z, half-width, shoulder height, bottom, top, upper and
// lower superellipse exponents. Spline-interpolated between keys.
//
// Side profile from a true side photo of the type (scaled by the 7.43 m
// overall length, placed on the physics main-wheel point): the spinner tip
// 2.0 m ahead of the main wheels, a slim nose whose top line rises
// steadily to the windshield, a flat belly ~1 m above the ground, a cabin
// standing behind the hopper, and a slab-sided rear fuselage that stays deep
// to the tail under an upright fin.
const K = (z, hw, ys, yb, yt, pU, pL) => ({ z, hw, ys, yb, yt, pU, pL });
// Nose: the IO-540 cowl is barely larger than the spinner at its lip (two
// round cooling inlets beside the spinner), then opens out over the engine
// and the hopper, widest at the cabin (in plan the body is a long taper from
// the cabin to the spinner and to the tail); the hopper top continues the
// cowl's top line up to the windshield base.
const FWD_KEYS = [
  K(2.33, 0.3, 0.17, -0.04, 0.38, 2.7, 2.6), K(2.2, 0.32, 0.15, -0.09, 0.405, 2.8, 2.7),
  K(1.9, 0.355, 0.11, -0.17, 0.445, 3.1, 3.0), K(1.4, 0.415, 0.06, -0.23, 0.505, 3.4, 3.2),
  K(0.8, 0.475, -0.02, -0.29, 0.6, 3.8, 3.4), K(0.2, 0.51, -0.12, -0.35, 0.7, 4.1, 3.6),
  K(-0.29, 0.53, -0.19, -0.4, 0.795, 4.2, 3.6),
];
const FWD_END = FWD_KEYS[FWD_KEYS.length - 1];
// Cabin: the lower fuselage keeps the hopper's section and is cut 30° above
// the sides (the window sill); the glazed cabin closes it above.
const CAB_KEYS = [FWD_END, K(-0.8, 0.53, -0.19, -0.43, 0.795, 4.2, 3.6), K(-1.45, 0.53, -0.19, -0.47, 0.795, 4.2, 3.6)];
const CAB_Z = -1.45; // cabin rear frame, start of the rear fuselage
// Rear fuselage (true side views of the 203): the roof ends in a short
// shoulder at the cabin's rear frame, the turtle deck then falls in a nearly
// straight ramp (~35°) and eases out to ~0.38 m at the fin root, running on
// nearly level to the rudder post; behind the cabin the deck keeps the
// cabin's section instead of filling out; the belly drops a little behind
// the wing (the rear fuselage is deeper than the wing root) and rises gently
// to the tail, the tail cone a flat-sided, flat-bottomed box right to the
// rudder post;
// seen from above the sides taper steadily from the cabin's rear frame to
// the rudder post, so the tail cone stays deep but slender.
const AFT_KEYS = [
  K(-1.45, 0.53, -0.19, -0.47, 1.22, 4.2, 3.6), K(-1.62, 0.51, -0.17, -0.48, 1.08, 3.6, 3.6),
  K(-1.78, 0.49, -0.15, -0.485, 0.94, 3.5, 3.7), K(-2.08, 0.44, -0.13, -0.485, 0.725, 3.4, 3.9),
  K(-2.52, 0.36, -0.12, -0.47, 0.5, 3.3, 4.2), K(-3.0, 0.28, -0.12, -0.44, 0.38, 3.2, 4.5),
  K(-3.5, 0.205, -0.1, -0.415, 0.33, 3.1, 4.6),
  K(-3.85, 0.14, -0.08, -0.385, 0.3, 2.9, 4.5), K(-3.97, 0.075, -0.06, -0.34, 0.26, 2.6, 3.8),
];
const AFT_MORPH = -2.3; // the cabin's section has become the plain rear section here
// Top line of the turtle deck (the fin flag is kept above it).
let aftTopPts = null;
const aftTop = (z) => {
  aftTopPts ||= sampleStations(AFT_KEYS, 16).map((s) => [s.z, s.yt]);
  const p = aftTopPts;
  if (z >= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (z >= p[i][0]) { const [z0, y0] = p[i - 1], [z1, y1] = p[i]; return y0 + ((z - z0) / (z1 - z0)) * (y1 - y0); }
  }
  return p[p.length - 1][1];
};

// Canopy: one family of cross-sections from the sill (ys) over the roof
// crown (yt), angle 0 = left sill, π/2 = crown, π = right sill. The sill is
// the lower fuselage's cut edge (30° on the hopper section), so the side
// windows, the roof skin and every frame meet the fuselage without steps;
// its rear section is the rear fuselage's first station.
const SILL_A = Math.PI / 6;
const SILL_X = FWD_END.hw * Math.cos(SILL_A) ** (2 / FWD_END.pU);
const SILL_Y = FWD_END.ys + (FWD_END.yt - FWD_END.ys) * Math.sin(SILL_A) ** (2 / FWD_END.pU);
// Section exponent of the canopy: the side windows lean in from the sill
// and the roof is narrower than the fuselage, as on the real cabin.
const CAN_P = 3.6;
const CANOPY = [
  K(-0.29, SILL_X, SILL_Y, 0, 0.98, CAN_P, 2), K(-0.88, SILL_X, SILL_Y, 0, 1.28, CAN_P, 2),
  K(-1.02, SILL_X, SILL_Y, 0, 1.315, CAN_P, 2), K(-1.2, SILL_X, SILL_Y, 0, 1.32, CAN_P, 2),
  K(-1.33, SILL_X, SILL_Y, 0, 1.295, CAN_P, 2), K(CAB_Z, SILL_X, SILL_Y, 0, 1.22, CAN_P, 2),
];
// Canopy angle of the roof rail (top of the side windows, ~74 % of the way
// from the sill to the crown).
const RAIL = Math.asin(0.74 ** (CAN_P / 2));
// Canopy angle at height fraction v between the sill (0) and the roof rail
// (1): the superellipse rises steeply off the sill, so equal angle steps
// are not equal heights.
const railA = (v) => Math.asin(Math.min(1, (v * Math.sin(RAIL) ** (2 / CAN_P)) ** (CAN_P / 2)));
const WS_TOP = -0.88, WS_BOT = FWD_END.z; // windshield top (at the rail) and base
const WIN_GAP = 0.13; // painted strip between the A-pillar and the side window
const canSec = (z) => {
  const c = CANOPY;
  if (z >= c[0].z) return c[0];
  for (let i = 1; i < c.length; i++) {
    if (z >= c[i].z) {
      const a = c[i - 1], b = c[i], t = (z - a.z) / (b.z - a.z), s = {};
      for (const k of Object.keys(a)) s[k] = a[k] + (b[k] - a[k]) * t;
      return s;
    }
  }
  return c[c.length - 1];
};
const secXY = (st, a) => {
  const c = Math.cos(a), s = Math.max(0, Math.sin(a));
  return [st.hw * Math.sign(c) * Math.abs(c) ** (2 / st.pU), st.ys + (st.yt - st.ys) * s ** (2 / st.pU)];
};
// Point on the canopy at station z, angle a, pushed `off` metres along the
// surface normal (positive = outward).
const canPt = (z, a, off = 0) => {
  const st = canSec(z);
  const [x, y] = secXY(st, a);
  if (!off) return [x, y, z];
  const [x1, y1] = secXY(st, a - 1e-3), [x2, y2] = secXY(st, a + 1e-3);
  const l = Math.hypot(x2 - x1, y2 - y1) || 1;
  return [x + ((y2 - y1) / l) * off, y - ((x2 - x1) / l) * off, z];
};
// Height fraction of angle a between the sill and the roof rail.
const railFrac = (a) => {
  const st = canSec(-1.0);
  return (secXY(st, a)[1] - st.ys) / (secXY(st, RAIL)[1] - st.ys);
};
// Raked A-pillar (windshield side edge), the window's front edge behind it
// and the C-pillar leaning forward at the back of the side window.
const pillarZ = (a) => WS_BOT + (WS_TOP - WS_BOT) * railFrac(a);
const winZ = (a) => pillarZ(a) - WIN_GAP;
const cPillarZ = (a) => -1.4 + 0.11 * railFrac(a);
// Top line ahead of the windshield (for the dark hopper deck in the livery).
const deckTop = (z) => {
  const pts = FWD_KEYS.slice().reverse().map((k) => [k.z, k.yt]);
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (z <= pts[i][0]) { const [z0, y0] = pts[i - 1], [z1, y1] = pts[i]; return y0 + ((z - z0) / (z1 - z0)) * (y1 - y0); }
  }
  return pts[pts.length - 1][1];
};
// Cockpit interior, pilot and eye sit this far from where they were drawn
// (moved back with the cabin and 2 cm up under its roof); the instrument
// panel and glareshield stay on the airframe under the windshield.
const COCKPIT_OFF = new THREE.Vector3(0, 0.02, -0.62);

function sampleStations(keys, per) {
  const out = [];
  const P = ['z', 'hw', 'ys', 'yb', 'yt', 'pU', 'pL'];
  const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
    const n = Math.max(2, Math.round(Math.abs(k1.z - k2.z) * per));
    for (let j = 0; j < n; j++) {
      const t = j / n, s = {};
      for (const p of P) s[p] = cr(k0[p], k1[p], k2[p], k3[p], t);
      s.hw = Math.max(0.005, s.hw); s.pU = Math.max(1.6, s.pU); s.pL = Math.max(1.6, s.pL);
      out.push(s);
    }
  }
  out.push({ ...keys[keys.length - 1] });
  return out;
}

function ring(st, n, arc) {
  const out = [];
  const a0 = arc ? arc[0] : 0, a1 = arc ? arc[1] : Math.PI * 2;
  for (let k = 0; k <= n; k++) {
    const a = a0 + (k / n) * (a1 - a0);
    const c = Math.cos(a), s = Math.sin(a);
    const up = s >= 0;
    const p = up ? st.pU : st.pL;
    const x = st.hw * Math.sign(c) * Math.abs(c) ** (2 / p);
    const y = up ? st.ys + (st.yt - st.ys) * Math.abs(s) ** (2 / p) : st.ys - (st.ys - st.yb) * Math.abs(s) ** (2 / p);
    out.push([x, y]);
  }
  return out;
}

// Loft through stations (nose -> tail). colorFn bakes AO into vertex colours.
// extendTo: for the open cabin, carry both rim ends straight up to this height.
function loft(stations, n, colorFn, arc = null, extendTo = null) {
  const pos = [], col = [], idx = [];
  let rl = 0;
  for (const st of stations) {
    let pts = ring(st, n, arc);
    if (extendTo !== null) pts = [[pts[0][0], extendTo], ...pts, [pts[pts.length - 1][0], extendTo]];
    rl = pts.length;
    for (const [x, y] of pts) {
      pos.push(x, y, st.z);
      const g = colorFn ? colorFn(x, y, st.z) : 1;
      col.push(g, g, g);
    }
  }
  for (let si = 0; si < stations.length - 1; si++) {
    for (let k = 0; k < rl - 1; k++) {
      const a = si * rl + k, b = a + 1, c = a + rl, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ==========================================================================
// Textures
function speckle(g, x, y, w, h, n, seed, alpha = 0.14) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const v = 205 + Math.floor(r() * 45);
    g.fillStyle = `rgba(${v},${v - 6},${v - 20},${alpha})`;
    g.fillRect(x + r() * w, y + r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}
function orangePeel(g, w, h, seed) {
  const r = rng(seed);
  for (let i = 0; i < (w * h) / 90; i++) {
    const v = r() < 0.5 ? 150 : 106;
    g.fillStyle = `rgba(${v},${v},${v},0.08)`;
    g.fillRect(r() * w, r() * h, 2, 2);
  }
}

// Livery: fuselage, fin and rudder use a side projection (z, y) of the body.
// Top half = left side (+X, nose to the left), bottom half = right side (-X,
// nose to the right) so lettering reads normally on both sides.
const LV = { Z0: -4.8, Z1: 2.9, Y0: -0.75, Y1: 1.6, W: 2048, H: 1024, M: 6 };
LV.kx = LV.W / (LV.Z1 - LV.Z0);
LV.ky = (LV.H / 2 - 2 * LV.M) / (LV.Y1 - LV.Y0);
const lvPix = (side, z, y) => [
  side > 0 ? (LV.Z1 - z) * LV.kx : (z - LV.Z0) * LV.kx,
  (side > 0 ? 0 : LV.H / 2) + LV.M + (LV.Y1 - y) * LV.ky,
];

function liveryTextures(reg) {
  const c = canvas(LV.W, LV.H), b = canvas(LV.W, LV.H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  gb.fillStyle = '#808080';
  gb.fillRect(0, 0, LV.W, LV.H);
  orangePeel(gb, LV.W, LV.H, 41);
  for (const side of [1, -1]) {
    const P = (z, y) => lvPix(side, z, y);
    const oy = side > 0 ? 0 : LV.H / 2;
    const path = (ctx, pts) => {
      ctx.beginPath();
      pts.forEach(([z, y], i) => { const [px, py] = P(z, y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    };
    const poly = (pts, fill) => { path(g, pts); g.closePath(); g.fillStyle = fill; g.fill(); };
    const line = (ctx, pts, col, w) => { path(ctx, pts); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
    // Base paint + a light dusty gradient on the belly.
    g.fillStyle = PAINT;
    g.fillRect(0, oy, LV.W, LV.H / 2);
    const [, belly] = P(0, -0.2);
    const grd = g.createLinearGradient(0, belly, 0, oy + LV.H / 2);
    grd.addColorStop(0, 'rgba(90,60,30,0)');
    grd.addColorStop(1, 'rgba(90,60,30,0.2)');
    g.fillStyle = grd;
    g.fillRect(0, belly, LV.W, oy + LV.H / 2 - belly);
    // Dark deck over the hopper, from the windshield to the cowling.
    const deck = [];
    for (let z = WS_BOT - 0.05; z <= 2.3; z += 0.05) deck.push([z, deckTop(z) - 0.075]);
    deck.push([2.3, 2], [WS_BOT - 0.05, 2]);
    poly(deck, DECK);
    // Stripes: navy band with the rising check at the wing root, gold
    // pinstripe and a thin navy line under it.
    const band = (cl, hh, off = 0) => cl.map(([z, y], i) => [z, y + off + hh[i]]).concat(cl.map(([z, y], i) => [z, y + off - hh[i]]).reverse());
    const cl = [[2.4, 0.0], [1.2, -0.07], [0.35, -0.11], [-0.55, 0.06], [-1.6, 0.12], [-2.8, 0.13], [-3.98, 0.12]];
    poly(band(cl, [0.06, 0.065, 0.065, 0.055, 0.045, 0.032, 0.016]), NAVY);
    const cl2 = cl.slice(0, 5);
    poly(band(cl2, [0.013, 0.013, 0.012, 0.011, 0.009], -0.115), '#ffd23c');
    poly(band(cl2.slice(0, 4), [0.022, 0.022, 0.02, 0.016], -0.165), NAVY);
    // Brazilian flag across fin and rudder, kept above the turtle deck (the
    // deck sides stay orange; a white line follows the deck under it).
    {
      g.save();
      const edge = [];
      for (let z = -2.95; z >= -4.75; z -= 0.05) edge.push([z, z < -3.97 ? -0.4 : aftTop(z) + 0.035]);
      path(g, [[-2.95, 2.0], [-4.75, 2.0], ...edge.slice().reverse()]); g.closePath(); g.clip();
      g.fillStyle = '#079a3d';
      g.fillRect(0, oy, LV.W, LV.H / 2);
      const zc = -4.12, yc = 0.9;
      poly([[zc + 0.36, yc], [zc, yc + 0.28], [zc - 0.36, yc], [zc, yc - 0.28]], '#fedf00');
      const [cx, cy] = P(zc, yc);
      g.fillStyle = '#002776';
      g.beginPath(); g.ellipse(cx, cy, 0.155 * LV.kx, 0.155 * LV.ky, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ffffff'; g.lineWidth = 0.026 * LV.ky;
      g.beginPath(); g.ellipse(cx + (side > 0 ? 0.14 : -0.14) * LV.kx, cy + 0.24 * LV.ky, 0.34 * LV.kx, 0.29 * LV.ky, 0, Math.PI * 1.22, Math.PI * 1.62); g.stroke();
      g.restore();
      line(g, edge, '#ffffff', 0.03 * LV.ky);
    }
    // Panel seams with rivet rows (colour + relief).
    const seams = [
      [[2.05, -0.2], [2.05, 0.45]], [[1.25, -0.3], [1.25, 0.52]], [[WS_BOT, -0.42], [WS_BOT, 0.78]],
      [[CAB_Z, -0.42], [CAB_Z, 1.1]], [[-2.6, -0.4], [-2.6, 0.5]], [[-3.45, -0.38], [-3.45, 0.36]],
      [[2.3, 0.2], [1.25, 0.2]], [[1.25, -0.27], [WS_BOT, -0.27]], [[CAB_Z, -0.28], [-3.45, -0.27]],
    ];
    for (const s of seams) {
      line(g, s, 'rgba(70,35,0,0.3)', 2);
      line(gb, s, '#3c3c3c', 2.6);
      const [[za, ya], [zb, yb]] = s;
      const n = Math.max(2, Math.round(Math.hypot(za - zb, ya - yb) / 0.055));
      for (let k = 0; k <= n; k++) {
        const [px, py] = P(za + ((zb - za) * k) / n + 0.022, ya + ((yb - ya) * k) / n);
        g.fillStyle = 'rgba(80,40,0,0.25)'; g.fillRect(px - 1, py - 1, 2, 2);
        gb.fillStyle = '#5c5c5c'; gb.beginPath(); gb.arc(px, py, 1.4, 0, Math.PI * 2); gb.fill();
      }
    }
    // Access doors (rear fuselage, cowling, cabin door lower panel), louvres.
    const door = (z0, z1, y0, y1) => {
      const pts = [[z0, y0], [z1, y0], [z1, y1], [z0, y1], [z0, y0]];
      line(g, pts, 'rgba(70,35,0,0.36)', 2); line(gb, pts, '#383838', 2.8);
    };
    door(-2.25, -1.8, -0.24, 0.02);
    door(2.0, 1.6, 0.06, 0.3);
    door(WS_BOT - 0.15, CAB_Z + 0.08, -0.12, SILL_Y - 0.03);
    door(1.1, 0.4, -0.18, 0.05);
    for (let k = 0; k < 6; k++) {
      const pts = [[2.0 - k * 0.045, -0.1], [2.0 - k * 0.045, 0.04]];
      line(g, pts, 'rgba(20,15,10,0.6)', 3); line(gb, pts, '#202020', 4);
    }
    // Exhaust soot behind the stacks.
    {
      const [ax, ay] = P(1.55, -0.16), [bx] = P(0.2, -0.16);
      const sg = g.createLinearGradient(ax, 0, bx, 0);
      sg.addColorStop(0, 'rgba(35,25,15,0.42)');
      sg.addColorStop(1, 'rgba(35,25,15,0)');
      g.fillStyle = sg;
      g.beginPath(); g.ellipse((ax + bx) / 2, ay + 4, Math.abs(bx - ax) / 2, 0.08 * LV.ky, 0, 0, Math.PI * 2); g.fill();
    }
    // Lettering (always drawn upright).
    const text = (z, y, str, hM, col, font = 'bold') => {
      const [px, py] = P(z, y);
      g.save();
      g.font = `${font} ${Math.round(hM * LV.ky * 1.25)}px Arial`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = col;
      g.setTransform(1, 0, 0, 1, px, py);
      g.scale(LV.kx / LV.ky, 1);
      g.fillText(str, 0, 0);
      g.restore();
    };
    text(-2.4, -0.1, reg, 0.22, NAVY);
    text(1.05, 0.22, 'AGRO WINGS', 0.08, NAVY, 'italic bold');
    text(-1.55, 0.36, 'AVIAÇÃO AGRÍCOLA', 0.033, NAVY, 'bold');
    text(0.75, -0.2, 'NO STEP', 0.028, 'rgba(30,30,30,0.7)', 'bold');
    speckle(g, 0, oy, LV.W, LV.H / 2, 2600, side > 0 ? 7 : 8, 0.1);
  }
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}

// Wing skin: u = span (0..WING_SPAN_UV m), v = chord fraction (0 = LE).
function wingTextures() {
  const W = 2048, H = 512;
  const c = canvas(W, H), b = canvas(W, H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  g.fillStyle = PAINT; g.fillRect(0, 0, W, H);
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, W, H);
  orangePeel(gb, W, H, 43);
  const X = (m) => (m / WING_SPAN_UV) * W, Y = (f) => f * H;
  const r = rng(17);
  // Faint chordwise residue streaks and leading-edge bug/dust specks.
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(120,100,70,${0.03 + r() * 0.05})`;
    g.fillRect(r() * W, Y(0.1 + r() * 0.8), 2 + r() * 3, 30 + r() * 120);
  }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(60,45,30,${0.08 + r() * 0.15})`;
    g.fillRect(r() * W, Y(r() * 0.06), 1 + r() * 2, 1 + r() * 2);
  }
  const seam = (x0, y0, x1, y1, rivet = 0.05) => {
    g.strokeStyle = 'rgba(70,35,0,0.28)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    gb.strokeStyle = '#3e3e3e'; gb.lineWidth = 2.6;
    gb.beginPath(); gb.moveTo(x0, y0); gb.lineTo(x1, y1); gb.stroke();
    const len = Math.hypot(x1 - x0, (y1 - y0) * (1.7 / H) * (W / WING_SPAN_UV) / (W / WING_SPAN_UV)) ;
    const n = Math.max(2, Math.round(Math.hypot((x1 - x0) / (W / WING_SPAN_UV), ((y1 - y0) / H) * 1.7) / rivet));
    void len;
    gb.fillStyle = '#5c5c5c';
    for (let k = 0; k <= n; k++) { gb.beginPath(); gb.arc(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n + 5, 1.5, 0, Math.PI * 2); gb.fill(); }
  };
  // Spars (LE skin joint, main spar, rear spar) along the span.
  for (const f of [0.12, 0.3, 0.72]) seam(X(0.2), Y(f), X(6.1), Y(f));
  // Ribs across the chord.
  for (let x = 0.55; x < 6.0; x += 0.5) seam(X(x), Y(0.0), X(x), Y(0.74), 0.06);
  // Hinge gap shadow and the flap/aileron split.
  g.fillStyle = 'rgba(40,20,0,0.45)'; g.fillRect(0, Y(0.742), W, 5);
  gb.fillStyle = '#202020'; gb.fillRect(0, Y(0.742), W, 6);
  g.fillRect(X(3.21) - 2, Y(0.75), 4, H); gb.fillRect(X(3.21) - 3, Y(0.75), 6, H);
  // Fuel tank access panel and filler ring.
  {
    const x0 = X(1.9), x1 = X(2.9), y0 = Y(0.45), y1 = Y(0.68);
    g.strokeStyle = 'rgba(70,35,0,0.35)'; g.lineWidth = 2; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    gb.strokeStyle = '#383838'; gb.lineWidth = 2.6; gb.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }
  speckle(g, 0, 0, W, H, 2400, 23, 0.08);
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}

function treadTexture() {
  const c = canvas(64, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#909090'; g.fillRect(0, 0, 64, 256);
  g.fillStyle = '#202020';
  for (const v of [0.4, 0.5, 0.6]) g.fillRect(0, v * 256 - 3, 64, 6);
  // Shoulder sipes.
  for (let x = 0; x < 64; x += 16) { g.fillRect(x, 0.31 * 256, 4, 0.06 * 256); g.fillRect(x + 8, 0.63 * 256, 4, 0.06 * 256); }
  const t = canvasTexture(c, { srgb: false, repeat: true });
  t.repeat.set(18, 1);
  return t;
}

function propDiscTexture() {
  const S = 512;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const R = S / 2;
  // Blade blur: three soft lobes (stroboscopic look as the disc turns).
  if (g.createConicGradient) {
    const cg = g.createConicGradient(0, R, R);
    for (let i = 0; i < 3; i++) {
      const a = i / 3;
      cg.addColorStop(a, 'rgba(20,20,20,0.42)');
      cg.addColorStop(a + 0.07, 'rgba(20,20,20,0.12)');
      cg.addColorStop(a + 0.2, 'rgba(20,20,20,0.04)');
      cg.addColorStop(Math.min(1, a + 0.32), 'rgba(20,20,20,0.3)');
    }
    g.fillStyle = cg;
  } else g.fillStyle = 'rgba(20,20,20,0.25)';
  g.fillRect(0, 0, S, S);
  // Radial mask: hidden behind the spinner, fading tips, yellow tip ring.
  g.globalCompositeOperation = 'destination-in';
  const m = g.createRadialGradient(R, R, R * 0.16, R, R, R);
  m.addColorStop(0, 'rgba(0,0,0,0)');
  m.addColorStop(0.22, 'rgba(0,0,0,0.75)');
  m.addColorStop(0.8, 'rgba(0,0,0,0.55)');
  m.addColorStop(0.97, 'rgba(0,0,0,0.25)');
  m.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = m; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-over';
  const tip = g.createRadialGradient(R, R, R * 0.86, R, R, R);
  tip.addColorStop(0, 'rgba(242,194,27,0)');
  tip.addColorStop(0.55, 'rgba(242,194,27,0.32)');
  tip.addColorStop(0.85, 'rgba(242,194,27,0.18)');
  tip.addColorStop(1, 'rgba(242,194,27,0)');
  g.fillStyle = tip; g.fillRect(0, 0, S, S);
  return canvasTexture(c, { srgb: true });
}

// Disc blur of the PR-AGW's two-blade Hartzell: two soft lobes, the same
// radial mask and yellow tip ring as propDiscTexture.
function twoBladeDiscTexture() {
  const S = 512;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const R = S / 2;
  if (g.createConicGradient) {
    const cg = g.createConicGradient(0, R, R);
    for (let i = 0; i < 2; i++) {
      const a = i / 2;
      cg.addColorStop(a, 'rgba(20,20,20,0.4)');
      cg.addColorStop(a + 0.08, 'rgba(20,20,20,0.1)');
      cg.addColorStop(a + 0.3, 'rgba(20,20,20,0.03)');
      cg.addColorStop(Math.min(1, a + 0.47), 'rgba(20,20,20,0.26)');
    }
    g.fillStyle = cg;
  } else g.fillStyle = 'rgba(20,20,20,0.22)';
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'destination-in';
  const m = g.createRadialGradient(R, R, R * 0.16, R, R, R);
  m.addColorStop(0, 'rgba(0,0,0,0)');
  m.addColorStop(0.22, 'rgba(0,0,0,0.72)');
  m.addColorStop(0.8, 'rgba(0,0,0,0.5)');
  m.addColorStop(0.97, 'rgba(0,0,0,0.22)');
  m.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = m; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-over';
  const tip = g.createRadialGradient(R, R, R * 0.86, R, R, R);
  tip.addColorStop(0, 'rgba(242,194,27,0)');
  tip.addColorStop(0.55, 'rgba(242,194,27,0.28)');
  tip.addColorStop(0.85, 'rgba(242,194,27,0.15)');
  tip.addColorStop(1, 'rgba(242,194,27,0)');
  g.fillStyle = tip; g.fillRect(0, 0, S, S);
  return canvasTexture(c, { srgb: true });
}

// Vertical card of the magnetic compass, wrapped round a cylinder (u runs
// against the heading so the card reads correctly through the lens).
function compassCardTexture() {
  const W = 1024, H = 96;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#111315'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#ecebe4'; g.fillStyle = '#ecebe4';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let h = 0; h < 360; h += 5) {
    const x = (1 - h / 360) * W;
    const big = h % 30 === 0;
    g.lineWidth = h % 10 === 0 ? 3 : 2;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, big ? 26 : h % 10 === 0 ? 20 : 13); g.stroke();
    if (big) {
      g.font = `bold ${h % 90 === 0 ? 40 : 32}px Arial`;
      g.fillText({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[h] ?? String(h / 10), x, 60);
      if (h === 0) g.fillText('N', W, 60);
    }
  }
  return canvasTexture(c, { aniso: 4 });
}

function ribTexture(base, groove, n = 10, w = 128, h = 256) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const y = ((i + 0.5) / n) * h;
    const gr = g.createLinearGradient(0, y - 8, 0, y + 8);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(0.5, groove);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, y - 8, w, 16);
  }
  speckle(g, 0, 0, w, h, 400, 5);
  return canvasTexture(c, { repeat: true });
}

function feltTexture() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#c2c8ce';
  g.fillRect(0, 0, 256, 256);
  const r = rng(11);
  for (let i = 0; i < 5000; i++) {
    const v = 150 + Math.floor(r() * 80);
    g.fillStyle = `rgba(${v},${v + 4},${v + 10},0.35)`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2.5, 1 + r() * 2.5);
  }
  return canvasTexture(c, { repeat: true });
}

// ==========================================================================
// Geometry helpers
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

// NACA-like cambered airfoil between chord fractions [c0, c1] (closed loop).
function airfoil(c0, c1, t = 0.15, m = 0.035, pp = 0.4, n = 16) {
  const yt = (x) => 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const yc = (x) => (m === 0 ? 0 : x < pp ? (m / (pp * pp)) * (2 * pp * x - x * x) : (m / (1 - pp) ** 2) * (1 - 2 * pp + 2 * pp * x - x * x));
  const xs = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    xs.push(c0 + (c1 - c0) * (c0 === 0 ? (1 - Math.cos((u * Math.PI) / 2)) : u));
  }
  const up = xs.map((x) => [x, yc(x) + yt(x)]);
  const lo = xs.slice().reverse().map((x) => [x, yc(x) - yt(x)]);
  return up.concat(lo);
}

// Loft a wing panel along span between stations {x, y, le, chord}.
// UV: u = span / WING_SPAN_UV, v = chord fraction. Colour: AO + darker underside.
function wingPanel(stations, prof, side = 1, ao = null) {
  const pos = [], uv = [], col = [], idx = [];
  const n = prof.length;
  stations.forEach((s) => {
    prof.forEach(([xc, yc], k) => {
      const lower = k >= n / 2;
      const X = side * s.x, Y = s.y + yc * s.chord, Z = s.le - xc * s.chord;
      pos.push(X, Y, Z);
      uv.push(s.x / WING_SPAN_UV, xc);
      const g = (lower ? 0.8 : 1) * (ao ? ao(s.x, xc, lower) : 1);
      col.push(g, g, g);
    });
  });
  // Faces wound counter-clockwise seen from outside (the materials cull back
  // faces): the profile runs over the top from the leading edge and back
  // underneath, so (span, chord) quads turn the other way on the right wing.
  // The ring is closed (the last point joins the first), which also closes
  // the hinge face of a flap or aileron profile that starts aft of the nose.
  for (let si = 0; si < stations.length - 1; si++) {
    for (let k = 0; k < n; k++) {
      const a = si * n + k, b = si * n + ((k + 1) % n), c = a + n, d = b + n;
      if (side > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  }
  // End caps: the root faces inboard, the outer end outboard.
  const cap = (si, outer) => {
    const base = si * n;
    for (let k = 1; k < n - 1; k++) {
      const tri = [base, base + k, base + k + 1];
      if ((side > 0) === outer) idx.push(tri[0], tri[2], tri[1]); else idx.push(...tri);
    }
  };
  cap(0, false);
  cap(stations.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function tagged(g, r = 1) {
  if (!g.attributes.color) {
    const c = new Float32Array(g.attributes.position.count * 3).fill(r);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  return g.index ? g.toNonIndexed() : g;
}

// Multiply vertex colours (AO) by fn(x, y, z).
function shade(g, fn) {
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const f = fn(p.getX(i), p.getY(i), p.getZ(i));
    c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f);
  }
  return g;
}

function tx(g, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) {
  const sc = Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s);
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), sc));
  return g;
}

// Tube between two points.
function rod(a, b, r, seg = 8, r2 = r) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}
// Smooth tube along points.
function tube(points, r, seg = 24, radial = 8) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), seg, r, radial, false);
}
// Flat bar (leaf spring) between two points.
function bar(a, b, w, t) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const g = new THREE.BoxGeometry(w, va.distanceTo(vb), t);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const ball = (p, r, seg = 10) => tx(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)), ...p);
const rbox = (w, h, d, r, x, y, z, rx = 0, ry = 0, rz = 0) => tx(new RoundedBoxGeometry(w, h, d, 3, r), x, y, z, rx, ry, rz);
function lathe(pts, seg = 32) { return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); }

// Curved quad patch (windshield / windows): bilinear between four corners,
// bulged along `nrm` by bulge·(1 - (2u-1)²).
function patch(p00, p10, p01, p11, nx, ny, bulge, nrm) {
  const pos = [], idx = [];
  const V = (a) => new THREE.Vector3(...a);
  const A = V(p00), B = V(p10), C = V(p01), D = V(p11), N = V(nrm).normalize();
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const u = i / nx, v = j / ny;
      const p = A.clone().multiplyScalar((1 - u) * (1 - v)).add(B.clone().multiplyScalar(u * (1 - v))).add(C.clone().multiplyScalar((1 - u) * v)).add(D.clone().multiplyScalar(u * v));
      p.addScaledVector(N, bulge * (1 - (2 * u - 1) ** 2));
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const patchEdge = (p00, p10, v, bulge, nrm, n = 12, p01, p11) => {
  const out = [];
  const N = new THREE.Vector3(...nrm).normalize();
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = new THREE.Vector3(...p00).lerp(new THREE.Vector3(...p10), u);
    const b = new THREE.Vector3(...p01).lerp(new THREE.Vector3(...p11), u);
    const p = a.lerp(b, v).addScaledVector(N, bulge * (1 - (2 * u - 1) ** 2));
    out.push([p.x, p.y, p.z]);
  }
  return out;
};
// Parametric surface fn(u, v) -> [x, y, z] on an (nu x nv) grid, faces turned
// away from `inside` (a point the surface wraps).
function grid(fn, nu, nv, inside) {
  const pos = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) pos.push(...fn(i / nu, j / nv));
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  if (inside) {
    // Probe the middle face: flip the winding if it faces the inside point.
    const P = (k) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
    const m = Math.floor(nv / 2) * (nu + 1) + Math.floor(nu / 2);
    const A = P(m), B = P(m + 1), C = P(m + nu + 1);
    const n = B.clone().sub(A).cross(C.clone().sub(A));
    if (n.dot(A.clone().sub(new THREE.Vector3(...inside))) < 0) flipWinding(g);
  }
  g.computeVertexNormals();
  return g;
}
// Reverse the triangle winding of an indexed geometry (faces turn round).
function flipWinding(g) {
  const ix = g.index.array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  g.index.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

// ==========================================================================
export function createAircraftModel(panel, opts = {}) {
  const root = new THREE.Group();
  root.name = 'aircraft';
  const liv = liveryTextures('PR-AGW');
  const wtx = wingTextures();
  // Gloss aviation enamel. Base colours are scaled to a physically plausible
  // albedo (a real orange paint reflects ~60–70 % of red light, not 100 %),
  // so the same orange keeps its saturation under the tropical sun.
  // The paint gets its own reference to the scene environment so its sky
  // reflection can be set apart from the ambient light (three.js otherwise
  // applies scene.environmentIntensity to every material): full ambient,
  // restrained grazing-angle sheen, a thin clearcoat.
  const coat = { roughness: 0.5, metalness: 0.0, specularIntensity: 0.3, clearcoat: 0.12, clearcoatRoughness: 0.3, envMap: opts.envMap ?? null, envMapIntensity: 0.3 };
  const ALBEDO = 0.84;
  const M = {
    paint: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(PAINT).multiplyScalar(ALBEDO), vertexColors: true, ...coat }),
    livery: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALBEDO), map: liv.map, bumpMap: liv.bump, bumpScale: 1.4, vertexColors: true, ...coat }),
    wing: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALBEDO), map: wtx.map, bumpMap: wtx.bump, bumpScale: 1.4, vertexColors: true, ...coat }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.62, metalness: 0.1, vertexColors: true }),
    deck: new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c1f24'), roughness: 0.93, metalness: 0.0, envMapIntensity: 0.35 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.28, metalness: 0.92, vertexColors: true }),
    steel: new THREE.MeshStandardMaterial({ color: 0x5c6166, roughness: 0.42, metalness: 0.85, vertexColors: true }),
    exhaust: new THREE.MeshStandardMaterial({ color: 0x6e5a46, roughness: 0.5, metalness: 0.8 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.94, metalness: 0, vertexColors: true }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92, metalness: 0, bumpMap: treadTexture(), bumpScale: 2.5 }),
    gloss: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.28, metalness: 0.1, vertexColors: true }),
    hub: new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.32, metalness: 0.35 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb8913c, roughness: 0.35, metalness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xa8bcc6, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.17, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5, depthWrite: false, side: THREE.DoubleSide }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false }),
    interior: new THREE.MeshStandardMaterial({ color: 0xb4bbc2, roughness: 0.68, metalness: 0.12, vertexColors: true }),
    headliner: new THREE.MeshStandardMaterial({ color: 0xffffff, map: feltTexture(), roughness: 0.95, side: THREE.DoubleSide }),
    floor: new THREE.MeshStandardMaterial({ color: 0xffffff, map: ribTexture('#454b52', 'rgba(0,0,0,0.5)', 24, 64, 256), roughness: 0.8, metalness: 0.4, vertexColors: true }),
    seat: new THREE.MeshStandardMaterial({ color: 0xffffff, map: ribTexture('#3b3f45', 'rgba(0,0,0,0.6)'), roughness: 0.82, vertexColors: true }),
    // Padded black vinyl (glareshield), dark grey interior frames, the dark
    // inside of the cowl inlets (seen from within), panel paint.
    pad: new THREE.MeshStandardMaterial({ color: 0x121315, roughness: 0.78, metalness: 0.0, vertexColors: true }),
    frameIn: new THREE.MeshStandardMaterial({ color: 0x2e3135, roughness: 0.6, metalness: 0.2, vertexColors: true }),
    cavity: new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.9, metalness: 0.0, side: THREE.BackSide }),
    panelGrey: new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.5, metalness: 0.35, vertexColors: true }),
    harness: new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.8 }),
    red: new THREE.MeshStandardMaterial({ color: 0xc8261b, roughness: 0.45, emissive: 0x330000 }),
    green: new THREE.MeshStandardMaterial({ color: 0x1f9a3a, roughness: 0.45, emissive: 0x002200 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xf2b400, roughness: 0.45 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x1f4fb0, roughness: 0.4 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35, emissive: 0x222222 }),
    suit: new THREE.MeshStandardMaterial({ color: 0x3a4a5e, roughness: 0.88 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x1e2023, roughness: 0.75 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xc28c6a, roughness: 0.7 }),
    helmet: new THREE.MeshPhysicalMaterial({ color: 0xeeeae2, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x15181c, roughness: 0.05, metalness: 0.3, clearcoat: 1 }),
    helmStripe: new THREE.MeshPhysicalMaterial({ color: 0x1b2a55, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
  };

  // Part buckets merged per material at the end. `fine` buckets go into a LOD
  // level that is dropped beyond ~80 m.
  const B = {};
  const add = (mat, g, fine = false) => { const k = (fine ? 'fine:' : '') + mat; (B[k] ||= []).push(tagged(g)); };

  // ---------------- fuselage ----------------
  const fusAO = (x, y, z) => {
    let a = 1 - Math.max(0, -y - 0.1) * 0.4; // dusty, shaded belly
    const yb = Math.max(0, 1 - Math.abs(y + 0.3) / 0.2), zb = Math.max(0, 1 - Math.abs(z) / 0.98);
    a *= 1 - 0.3 * yb * Math.sqrt(zb); // wing-root shadow line
    const sb = Math.max(0, 1 - Math.abs(y - 0.14) / 0.12) * (z < -3.35 && z > -4.0 ? 1 : 0);
    a *= 1 - 0.22 * sb; // stabiliser root
    if (z < WS_BOT && z > CAB_Z && y > SILL_Y - 0.06) a *= 0.9; // under the canopy rails
    if (z > 2.2) a *= 0.85 + 0.15 * clamp((2.33 - z) / 0.13, 0, 1); // cowl lip
    return clamp(a, 0.5, 1);
  };
  const fwdSt = sampleStations(FWD_KEYS, 22);
  const cabSt = sampleStations(CAB_KEYS, 8);
  add('livery', liveryUV(tagged(loft(fwdSt, 56, fusAO))));
  add('livery', liveryUV(tagged(loft(cabSt, 48, fusAO, [Math.PI - SILL_A, Math.PI * 2 + SILL_A]))));
  // Rear fuselage: its first rings are the cabin's own section (canopy arch
  // over the lower fuselage), morphing into the plain rear sections by
  // AFT_MORPH, so the cabin roof flows into the turtle deck without a step.
  {
    const N = 56, aftSt = sampleStations(AFT_KEYS, 16);
    const lowAt = (z) => ({ ...CAB_KEYS[CAB_KEYS.length - 1], z });
    const rings = aftSt.map((st) => {
      const plain = ring(st, N);
      const t = smoothstep(CAB_Z, AFT_MORPH, st.z);
      if (t >= 1) return plain;
      const cs = { ...canSec(CAB_Z), yt: st.yt }, low = ring(lowAt(st.z), N);
      return plain.map(([px, py], k) => {
        let a = (k / N) * Math.PI * 2;
        let q;
        if (a >= SILL_A && a <= Math.PI - SILL_A) q = secXY(cs, ((a - SILL_A) / (Math.PI - 2 * SILL_A)) * Math.PI);
        else q = low[k];
        return [lerp(q[0], px, t), lerp(q[1], py, t)];
      });
    });
    const pos = [], col = [], idx = [], rl = N + 1;
    rings.forEach((r, si) => r.forEach(([x, y]) => { const z = aftSt[si].z; pos.push(x, y, z); const g = fusAO(x, y, z); col.push(g, g, g); }));
    for (let si = 0; si < rings.length - 1; si++) for (let k = 0; k < N; k++) {
      const a = si * rl + k, b = a + 1, c = a + rl, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    add('livery', liveryUV(tagged(g)));
    // Tail cone end cap at the rudder post.
    const last = aftSt[aftSt.length - 1];
    add('paint', tx(new THREE.ShapeGeometry(new THREE.Shape(ring(last, 24).slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y)))).rotateY(Math.PI), 0, 0, last.z));
  }
  // Matte anti-glare deck over the hopper and the cowl top.
  {
    const st = fwdSt.filter((s) => s.z <= 2.25 && s.z >= WS_BOT).map((s) => ({ ...s, hw: s.hw + 0.005, yt: s.yt + 0.005 }));
    add('deck', loft(st, 24, null, [Math.PI * 0.33, Math.PI * 0.67]));
  }
  // Hopper lid: rounded, bevelled black lid with hinges and handle, the
  // hopper vent forward of it.
  {
    const s = new THREE.Shape();
    const w = 0.22, d = 0.26, r = 0.05;
    s.moveTo(-w + r, -d); s.lineTo(w - r, -d); s.quadraticCurveTo(w, -d, w, -d + r); s.lineTo(w, d - r); s.quadraticCurveTo(w, d, w - r, d);
    s.lineTo(-w + r, d); s.quadraticCurveTo(-w, d, -w, d - r); s.lineTo(-w, -d + r); s.quadraticCurveTo(-w, -d, -w + r, -d);
    const lid = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 6 });
    lid.rotateX(-Math.PI / 2);
    const lz = 0.55, slope = Math.atan2(deckTop(lz - 0.3) - deckTop(lz + 0.3), 0.6);
    add('dark', tx(lid, 0, deckTop(lz) - 0.025, lz, slope));
    const hy = deckTop(lz + 0.14) + 0.055;
    add('steel', rod([-0.12, hy, lz + 0.14], [0.12, hy, lz + 0.14], 0.012, 8));
    for (const sx of [-0.15, 0.15]) {
      add('steel', rod([sx, hy - 0.02, lz + 0.14], [sx, hy, lz + 0.14], 0.008, 6));
      add('steel', tx(new THREE.CylinderGeometry(0.018, 0.018, 0.06, 10), sx, deckTop(lz - 0.27) + 0.015, lz - 0.27, 0, 0, Math.PI / 2));
    }
    add('dark', tx(new THREE.CylinderGeometry(0.075, 0.08, 0.05, 20), 0, deckTop(1.25) + 0.01, 1.25));
    add('steel', tx(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16), 0, deckTop(1.25) + 0.04, 1.25));
  }
  // Hopper quick-fill couplers either side, aft of the wing root, and the
  // transfer pipe.
  for (const sx of [1, -1]) {
    add('dark', tx(new THREE.CylinderGeometry(0.055, 0.055, 0.1, 16), sx * 0.5, -0.12, -1.1, 0, 0, Math.PI / 2));
    add('brass', tx(new THREE.CylinderGeometry(0.042, 0.042, 0.03, 16), sx * 0.56, -0.12, -1.1, 0, 0, Math.PI / 2));
  }
  // Exhaust stubs: short pipes out of the lower cowl sides, angled down and
  // aft, flared tips.
  for (const sx of [1, -1]) {
    add('exhaust', tube([[sx * 0.33, -0.03, 1.86], [sx * 0.41, -0.08, 1.72], [sx * 0.46, -0.14, 1.58]], 0.04, 16, 10));
    add('exhaust', tx(new THREE.CylinderGeometry(0.052, 0.042, 0.07, 12, 1, true), sx * 0.467, -0.15, 1.55, Math.PI / 2 + 0.4, 0, 0));
  }
  // Cowl front (IO-540): a small flat face with a rounded lip around the
  // spinner, the two round cooling inlets beside it (ducts, lips and the dark
  // baffles behind), the spinner shaft opening; oil-cooler scoop under the
  // cowl.
  {
    const st0 = fwdSt[0], z0 = st0.z;
    const inlets = [[0.22, 0.18], [-0.22, 0.18]], rIn = 0.056;
    const face = new THREE.Shape(ring(st0, 64).slice(0, -1).map(([x, y]) => new THREE.Vector2(x * 0.985, y * 0.985 + st0.ys * 0.015)));
    for (const [x, y] of inlets) { const h = new THREE.Path(); h.absarc(x, y, rIn, 0, Math.PI * 2, true); face.holes.push(h); }
    add('paint', shade(tagged(tx(new THREE.ShapeGeometry(face, 24), 0, 0, z0 + 0.004)), () => 0.9));
    const lip = ring(st0, 64).map(([x, y]) => [x * 0.975, y * 0.975 + st0.ys * 0.025, z0 - 0.006]);
    add('paint', tube(lip, 0.014, 48, 6));
    for (const [x, y] of inlets) {
      add('paint', tx(new THREE.TorusGeometry(rIn, 0.01, 8, 28), x, y, z0 + 0.004));
      add('cavity', tx(new THREE.CylinderGeometry(rIn, rIn * 0.92, 0.18, 28, 1, true), x, y, z0 - 0.086, Math.PI / 2));
      add('dark', tx(new THREE.CircleGeometry(rIn, 24), x, y, z0 - 0.17));
      // Engine baffle and a cylinder fin pack seen through the inlet.
      for (let k = -2; k <= 2; k++) add('steel', tx(new THREE.BoxGeometry(rIn * 1.6, 0.005, 0.02), x, y + k * 0.018, z0 - 0.15), true);
    }
    add('dark', tx(new THREE.CircleGeometry(0.07, 24), 0, 0.2, z0 + 0.006));
  }
  add('paint', rbox(0.26, 0.1, 0.38, 0.035, 0, -0.17, 1.93, -0.06));
  add('dark', tx(new THREE.PlaneGeometry(0.22, 0.06), 0, -0.17, 2.125, -0.06));
  // Polished conical spinner (slightly convex flanks, sharp tip) with a
  // backplate, narrower than the cowl lip.
  const spinner = lathe([[0.155, 0], [0.154, 0.03], [0.146, 0.09], [0.131, 0.16], [0.109, 0.23], [0.081, 0.3], [0.049, 0.36], [0.019, 0.405], [0, 0.42]], 40);
  spinner.rotateX(Math.PI / 2);
  const spinnerMesh = new THREE.Mesh(mergeGeometries([tagged(spinner), tagged(tx(new THREE.CylinderGeometry(0.158, 0.158, 0.02, 40), 0, 0, -0.005, Math.PI / 2))]), M.alu);
  spinnerMesh.castShadow = true;

  // ---------------- cabin ----------------
  // Raked one-piece windshield standing on the hopper top, one side window
  // each side (no extra bars) behind a painted strip,
  // a crowned roof flowing into the turtle deck. Frames: painted tubes
  // outside, black rubber seals along the glass, dark grey tubes inside.
  const roof = canSec(-0.99).yt;
  const inside = [0, 0.75, -1.0];
  const mirror = (fn, sx) => (u, v) => { const p = fn(u, v); return [p[0] * sx, p[1], p[2]]; };
  // Windshield: Coons patch between the A-pillars, the hopper top edge (the
  // forward fuselage's last section above the sills) and the roof's front
  // arch, bulged forward a little.
  const WSN = new THREE.Vector3(0, 0.55, 0.84).normalize();
  const wsB = (u) => { const a = SILL_A + (Math.PI - 2 * SILL_A) * u, c = Math.cos(a), s = Math.sin(a); return [FWD_END.hw * Math.sign(c) * Math.abs(c) ** (2 / FWD_END.pU), FWD_END.ys + (FWD_END.yt - FWD_END.ys) * s ** (2 / FWD_END.pU), WS_BOT]; };
  const wsT = (u) => canPt(WS_TOP, RAIL + (Math.PI - 2 * RAIL) * u);
  const wsL = (v) => canPt(pillarZ(railA(v)), railA(v));
  const wsPt = (u, v, off = 0) => {
    const B = wsB(u), T = wsT(u), Lp = wsL(v), R = wsL(v), b0 = wsB(0), b1 = wsB(1), t0 = wsT(0), t1 = wsT(1);
    R[0] = -R[0];
    const p = [0, 1, 2].map((k) => (1 - v) * B[k] + v * T[k] + (1 - u) * Lp[k] + u * R[k]
      - ((1 - u) * (1 - v) * b0[k] + u * (1 - v) * b1[k] + (1 - u) * v * t0[k] + u * v * t1[k]));
    const bl = 0.045 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v) + off; // one-piece glass, bowed out
    return [p[0] + WSN.x * bl, p[1] + WSN.y * bl, p[2] + WSN.z * bl];
  };
  // The glass's lower edge runs nearly level across the hopper top (the
  // windshield stands above the cowl line, as on the real aircraft); below
  // its lower corners the patch is painted skin down to the sills.
  // glassV(u): the patch's v at which the glass begins.
  const GLASS_LOW = FWD_END.yt - 0.045;
  const gvCache = new Map();
  const glassV = (u) => {
    const key = Math.round(u * 1e4);
    if (gvCache.has(key)) return gvCache.get(key);
    const target = GLASS_LOW + (FWD_END.yt - GLASS_LOW) * (1 - (2 * u - 1) ** 2);
    let lo = 0, hi = 0.9;
    if (wsPt(u, 0)[1] >= target) hi = 0;
    else for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (wsPt(u, m)[1] >= target) hi = m; else lo = m; }
    gvCache.set(key, hi);
    return hi;
  };
  const wsGlass = (u, w, off = 0) => wsPt(u, lerp(glassV(u), 1, w), off);
  {
    // Only where there is skin (the centre of the base is glass right down
    // to the hopper top): from each sill to the last u with glassV > 0.
    let uS = 0;
    while (uS < 0.5 && glassV(uS) > 0) uS += 0.005;
    for (const [u0, u1] of [[0, uS], [1 - uS, 1]]) {
      const f = (off) => (u, w) => { const uu = lerp(u0, u1, u); return wsPt(uu, glassV(uu) * w, off); };
      add('livery', liveryUV(tagged(grid(f(0), 10, 3, inside))));
      add('frameIn', tagged(flipWinding(grid(f(-0.006), 10, 3, inside))));
    }
  }
  // Side window (left; mirrored for the right) from just behind the A-pillar
  // to the C-pillar; painted strip ahead of it and skin behind it.
  const winPt = (u, v, off = 0) => { const a = railA(v); return canPt(lerp(winZ(a), cPillarZ(a), u), a, off); };
  const glassG = [grid((u, v) => wsGlass(u, v), 24, 10)];
  for (const sx of [1, -1]) {
    glassG.push(grid(mirror(winPt, sx), 14, 8));
    add('livery', liveryUV(tagged(grid(mirror((u, v) => { const a = railA(v); return canPt(lerp(pillarZ(a), winZ(a), u), a); }, sx), 2, 8, inside))));
    add('livery', liveryUV(tagged(grid(mirror((u, v) => { const a = railA(v); return canPt(lerp(cPillarZ(a), CAB_Z, u), a); }, sx), 2, 8, inside))));
  }
  const glassMesh = new THREE.Mesh(mergeGeometries(glassG.map((g) => tagged(g))), M.glass);
  glassMesh.renderOrder = 10;
  // Roof: the canopy surface between the rails, painted; felt headliner
  // under it.
  const roofSt = [];
  for (let i = 0; i <= 12; i++) { const z = lerp(WS_TOP, CAB_Z, i / 12); roofSt.push({ ...canSec(z), z }); }
  add('livery', liveryUV(tagged(loft(roofSt, 20, fusAO, [RAIL, Math.PI - RAIL]))));
  const headliner = tagged(flipWinding(loft(roofSt.map((s) => ({ ...s, hw: s.hw - 0.018, yt: s.yt - 0.018 })), 20, null, [RAIL - 0.05, Math.PI - RAIL + 0.05])));
  // Frames: a line on the canopy f(t, off) -> point, swept as a painted tube
  // (outside), a dark tube (inside) and, where `seal` gives the glass side
  // of the frame, a rubber strip.
  const line = (f, n = 16) => (off) => { const out = []; for (let i = 0; i <= n; i++) out.push(f(i / n, off)); return out; };
  const frame = (f, r = 0.024, n = 16, inner = true) => {
    const L = line(f, n);
    add('paint', tube(L(r * 0.35), r, n, 8));
    if (inner) add('frameIn', tube(L(-r * 0.45), r * 0.62, n, 6));
  };
  const seal = (pts) => add('rubber', tube(pts, 0.0065, pts.length, 4), true);
  frame((t, o) => wsPt(t, 1, o), 0.028, 20);
  frame((t, o) => wsGlass(t, 0, o), 0.024, 24, false); // the glass's lower frame
  {
    // Dark over the side of the tube that faces the seat (the pilot sees no
    // paint over the glareshield).
    const eye = new THREE.Vector3(0, 1.0, -0.5).add(COCKPIT_OFF), q = new THREE.Vector3();
    const pts = line((t) => wsGlass(t, 0, 0.0084), 24)(0).map((p) => { q.set(...p); const e = eye.clone().sub(q).normalize(); return [p[0] + e.x * 0.011, p[1] + e.y * 0.011, p[2] + e.z * 0.011]; });
    add('frameIn', tube(pts, 0.0265, 24, 8));
  }
  seal(line((t) => wsPt(t, 0.975, 0.004), 20)(0));
  seal(line((t) => wsGlass(t, 0.03, 0.004), 24)(0));
  for (const sx of [1, -1]) {
    const S = (f) => (t, o) => { const p = f(t, o); return [p[0] * sx, p[1], p[2]]; };
    frame(S((t, o) => canPt(pillarZ(railA(t)), railA(t), o)), 0.03, 14); // A-pillar
    frame(S((t, o) => canPt(lerp(WS_TOP, CAB_Z, t), RAIL, o)), 0.024, 20); // roof rail
    frame(S((t, o) => canPt(winZ(railA(t)), railA(t), o)), 0.02, 10); // window front frame
    frame(S((t, o) => canPt(cPillarZ(railA(t)), railA(t), o)), 0.026, 10); // C-pillar
    frame(S((t, o) => canPt(lerp(WS_BOT - 0.01, CAB_Z - 0.01, t), 0, o)), 0.024, 20); // sill (the window's lower edge)
    for (const [u, v] of [[0, 0], [0, 1], [1, 0], [1, 1]]) add('paint', ball(mirror(winPt, sx)(u, v), 0.028, 10));
    add('paint', ball(S((t, o) => canPt(pillarZ(railA(t)), railA(t), o))(1, 0), 0.034, 10));
    // Seal round the window glass.
    {
      const pts = [];
      const du = 0.03, dv = 0.055, C = [[du, dv], [1 - du, dv], [1 - du, 1 - dv], [du, 1 - dv], [du, dv]];
      for (let k = 0; k < 4; k++) for (let i = 0; i < 8; i++) {
        const [u0, v0] = C[k], [u1, v1] = C[k + 1], t = i / 8;
        const p = winPt(lerp(u0, u1, t), lerp(v0, v1, t), 0.004);
        pts.push([p[0] * sx, p[1], p[2]]);
      }
      pts.push(pts[0]);
      seal(pts);
    }
    seal(line((t) => wsGlass(sx > 0 ? 0.025 : 0.975, 0.03 + t * 0.94, 0.004), 12)(0));
    // Door (the window bay is the door): handle and hinges, window latch
    // inside (red).
    const dh = secXY(FWD_END, SILL_A - 0.12);
    dh[0] += 0.014;
    add('steel', rod([sx * dh[0], dh[1], -1.24], [sx * dh[0], dh[1], -1.12], 0.009, 6));
    add('steel', tx(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 8), sx * (dh[0] - 0.006), dh[1], -1.18, 0, 0, Math.PI / 2), true);
    for (const hz of [-0.82, -1.25]) { const hp = canPt(hz, RAIL, 0.02); add('steel', tx(new THREE.CylinderGeometry(0.011, 0.011, 0.07, 8), sx * hp[0], hp[1], hz, 0, 0, Math.PI / 2), true); }
  }
  // Wire-cutter blade on the roof, deflector cable roof -> fin top,
  // roof antennas (VHF whip, DGPS puck).
  add('steel', tx(new THREE.BoxGeometry(0.018, 0.26, 0.06), 0, roof + 0.1, -0.69, 0.62));
  add('steel', rod([0, roof + 0.02, -1.0], [0, 1.4, -3.93], 0.006, 5));
  add('dark', tx(new THREE.SphereGeometry(0.06, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, roof - 0.004, -1.12, 0, 0, 0, [1, 0.45, 1]), true);
  add('steel', rod([0.18, roof - 0.02, -1.15], [0.18, roof + 0.32, -1.45], 0.005, 5), true);

  // ---------------- wing ----------------
  const leY = (x) => wingY(x);
  const mainProf = airfoil(0, 0.74, 0.15, 0.035, 0.4, 18), aftProf = airfoil(0.76, 1.0, 0.15, 0.035, 0.4, 6);
  const flaps = [], ailerons = [];
  const wingAO = (x, xc, lower) => (lower ? 1 : 1 - 0.28 * Math.max(0, 1 - (x - 0.55) / 0.55));
  const surfaceMesh = (geo, x0, x1, side) => {
    // Pivot on the hinge line (76% chord), X axis along the dihedral line;
    // the returned group's rotation.x deflects the surface.
    const hz = WING.le - 0.76 * WING.chord;
    const hx = (side * (x0 + x1)) / 2;
    const pivot = new THREE.Group();
    pivot.position.set(hx, leY(hx) + 0.02, hz);
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
  for (const side of [1, -1]) {
    const st = (x) => ({ x, y: leY(x), le: WING.le, chord: WING.chord });
    wingParts.push(wingPanel([0.2, WING.rootX, 0.8, 1.1, 2.0, 3.2, 4.4, WING.tipX].map(st), mainProf, side, wingAO));
    wingParts.push(wingPanel([st(0.2), st(WING.rootX + 0.05)], aftProf, side, wingAO));
    flaps.push(surfaceMesh(wingPanel([WING.rootX + 0.06, 1.1, 2.2, 3.18].map(st), aftProf, side, wingAO), WING.rootX + 0.06, 3.18, side));
    ailerons.push(surfaceMesh(wingPanel([3.24, 4.5, WING.tipX - 0.02].map(st), aftProf, side), 3.24, WING.tipX - 0.02, side));
    // Upturned Hoerner-style tip: a smooth curve up and back, the leading
    // edge swept and the chord tapering into the rounded end.
    const tipSt = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8, e = t ** 1.6;
      tipSt.push({ x: WING.tipX + 0.26 * Math.sin((t * Math.PI) / 2), y: leY(WING.tipX) + 0.3 * e, le: WING.le - 0.3 * e ** 1.3, chord: WING.chord * (1 - 0.4 * e ** 1.2) });
    }
    wingParts.push(wingPanel(tipSt, airfoil(0, 1, 0.15, 0.035, 0.4, 16), side));
    // Root fillet: a fairing that blends the wing top into the fuselage side.
    const fil = mainProf.slice(0, 19).map(([xc, yc]) => [side * 0.5, WING.rootY + yc * WING.chord + 0.01, WING.le - xc * WING.chord]);
    wingParts.push(tube(fil, 0.055, 30, 10));
    // Nav light: coloured bulb under a clear lens at the tip leading edge.
    const tipLE = [side * (WING.tipX + 0.11), leY(WING.tipX) + 0.06, WING.le - 0.05];
    add(side > 0 ? 'red' : 'green', ball(tipLE, 0.03, 10));
    add('lens', tx(new THREE.SphereGeometry(0.06, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), ...tipLE, 0, 0, side * Math.PI / 2, [1, 1, 1.4]));
    // Black non-slip walkway at the root (where the badeco steps): a thin
    // sheet laid on the upper skin.
    {
      const up = mainProf.slice(0, 19).filter(([xc]) => xc > 0.1 && xc < 0.62);
      const sheet = up.map(([xc, yc]) => [xc, yc + 0.004]).concat(up.slice().reverse().map(([xc, yc]) => [xc, yc + 0.0005]));
      add('deck', wingPanel([0.62, 0.9, 1.16].map(st), sheet, side));
    }
    // Fuel filler cap on top of the wing tank.
    add('dark', tx(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 18), side * 2.4, leY(2.4) + 0.125, -0.4));
    add('steel', tx(new THREE.BoxGeometry(0.1, 0.012, 0.02), side * 2.4, leY(2.4) + 0.145, -0.4), true);
    // Hinge brackets under the flap/aileron line and tie-down rings.
    for (const hx of [0.9, 1.9, 2.9, 3.6, 4.6, 5.5]) {
      add('dark', tx(new THREE.BoxGeometry(0.03, 0.07, 0.12), side * hx, leY(hx) - 0.07, WING.le - 0.76 * WING.chord + 0.02, 0, 0, side * Math.atan(DIH)), true);
    }
    add('steel', tx(new THREE.TorusGeometry(0.025, 0.006, 6, 12), side * 4.0, leY(4.0) - 0.12, -0.1, 0, Math.PI / 2), true);
  }
  // Pitot tube under the left wing.
  add('steel', rod([3.6, leY(3.6) - 0.1, 0.55], [3.6, leY(3.6) - 0.1, 1.05], 0.009, 8), true);
  add('steel', rod([3.6, leY(3.6) - 0.02, 0.5], [3.6, leY(3.6) - 0.1, 0.62], 0.01, 6), true);
  for (const g of wingParts) add(g.attributes.uv && g.attributes.color ? 'wing' : 'paint', g);

  // ---------------- tail ----------------
  // Tailplane through the tail cone at mid height, elevators either side of
  // the rudder (cut back clear of it); an upright fin with a curved dorsal
  // fillet and a big rudder on a vertical hinge whose trailing edge leans
  // forward toward the bottom of the tail cone.
  const STAB_Y = 0.1, HINGE_Z = -3.96;
  const stabStations = [
    { x: 0.08, y: STAB_Y, le: -3.42, chord: 0.87 }, { x: 1.2, y: STAB_Y + 0.01, le: -3.47, chord: 0.79 },
    { x: 1.78, y: STAB_Y + 0.02, le: -3.52, chord: 0.71 }, { x: 1.87, y: STAB_Y + 0.022, le: -3.55, chord: 0.62 }, { x: 1.92, y: STAB_Y + 0.023, le: -3.6, chord: 0.5 },
  ];
  const elevStations = [{ ...stabStations[0], x: 0.24, le: -3.425, chord: 0.865 }, ...stabStations.slice(1, 3)];
  const elevParts = [];
  for (const side of [1, -1]) {
    add('wing', wingPanel(stabStations, airfoil(0, 0.6, 0.1, 0, 0.4, 12), side));
    elevParts.push(tagged(wingPanel(elevStations, airfoil(0.62, 1, 0.1, 0, 0.4, 4), side)));
    // Strut from the tail cone bottom to the stabiliser, with end lugs.
    add('steel', rod([side * 0.95, STAB_Y - 0.03, -3.62], [side * 0.1, -0.27, -3.5], 0.015, 8));
    for (const p of [[side * 0.95, STAB_Y - 0.03, -3.62], [side * 0.1, -0.27, -3.5]]) add('steel', ball(p, 0.024, 8), true);
  }
  // Trim tab on the left elevator.
  elevParts.push(tagged(tx(new THREE.BoxGeometry(0.4, 0.012, 0.08), 0.6, STAB_Y + 0.01, -3.47 - 0.79 * 0.98 - 0.03)));
  const elevGeo = mergeGeometries(elevParts);
  const elevHingeZ = -3.42 - 0.62 * 0.87;
  elevGeo.translate(0, -STAB_Y, -elevHingeZ);
  const elevator = new THREE.Group();
  elevator.position.set(0, STAB_Y, elevHingeZ);
  const elevMesh = new THREE.Mesh(elevGeo, M.wing);
  elevMesh.castShadow = true; elevMesh.receiveShadow = true;
  elevator.add(elevMesh);
  root.add(elevator);
  // Fin + rudder: vertical airfoils (profile rotated into the YZ plane). Each
  // part has its own stations so the hinge stays vertical: the fin's profile
  // ends blunt at the hinge (62 % of a longer virtual chord), the rudder's
  // starts there.
  const vfin = (prof, sts) => {
    const g = wingPanel(sts.map(([h, le, c]) => ({ x: h, y: 0, le, chord: c })), prof, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setXYZ(i, y, x, z);
    }
    // Swapping x and y mirrors the panel: turn its faces back outward.
    return flipWinding(g);
  };
  // Straight leading edge swept ~35° from the dorsal fillet to the tip,
  // where the rudder's top carries on to the full height.
  const FIN_LE = [[0.2, -3.16], [0.38, -3.27], [0.57, -3.39], [0.9, -3.62], [1.15, -3.795], [1.3, -3.9], [1.36, -3.942]];
  const finSt = FIN_LE.map(([h, le]) => [h, le, (le - HINGE_Z) / 0.62]);
  add('livery', liveryUV(tagged(vfin(airfoil(0, 0.62, 0.105, 0, 0.4, 12), finSt))));
  // Dorsal fillet rising off the turtle deck into the fin's leading edge.
  add('livery', liveryUV(tagged(loft(sampleStations([
    K(-2.72, 0.01, 0.37, 0.36, 0.385, 2.2, 2.2), K(-2.92, 0.03, 0.36, 0.34, 0.41, 2.2, 2.2), K(-3.08, 0.043, 0.36, 0.33, 0.455, 2.2, 2.2),
    K(-3.25, 0.05, 0.37, 0.33, 0.52, 2.2, 2.2), K(-3.43, 0.05, 0.38, 0.33, 0.62, 2.2, 2.2),
  ], 20), 12, null))));
  // Rudder trailing edge: 4.66 m aft at the top, 4.48 m at the bottom (below
  // the tail cone).
  const rudTE = (h) => -4.48 - (h + 0.3) * 0.104;
  const rudSt = [-0.3, 0.1, 0.5, 0.9, 1.2, 1.38, 1.43].map((h) => { const c = (HINGE_Z - rudTE(h)) / 0.38; return [h, HINGE_Z + 0.62 * c, c]; });
  const rudGeo = liveryUV(tagged(vfin(airfoil(0.63, 1, 0.045, 0, 0.4, 5), rudSt)));
  const rudTab = tagged(tx(new THREE.BoxGeometry(0.012, 0.26, 0.08), 0, 0.25, rudTE(0.25) + 0.035));
  const rudder = new THREE.Group();
  rudder.position.set(0, 0, HINGE_Z);
  const rudMesh = new THREE.Mesh(rudGeo.translate(0, 0, -HINGE_Z), M.livery);
  rudMesh.castShadow = true;
  rudder.add(rudMesh);
  const rudTabMesh = new THREE.Mesh(rudTab.translate(0, 0, -HINGE_Z), M.paint);
  rudder.add(rudTabMesh);
  root.add(rudder);
  // Rudder post (fairing between the tail cone and the rudder), tail light
  // and tie-down.
  add('paint', tx(new THREE.CylinderGeometry(0.025, 0.025, 0.62, 10), 0, 0.0, HINGE_Z + 0.02));
  add('white', ball([0, -0.1, rudTE(-0.1) + 0.01], 0.022, 10));
  add('steel', tx(new THREE.TorusGeometry(0.03, 0.007, 6, 12), 0, -0.36, -3.6, 0, Math.PI / 2), true);

  // ---------------- landing gear ----------------
  // Wheel positions follow the physics contact points (src/config.js).
  const gearCfg = Object.fromEntries(FLIGHT.gear.map((g) => [g.name, g]));
  const gearGroups = {};
  const tyreProfile = (R, W, rim) => [
    [rim, -W * 0.42], [rim + 0.02, -W * 0.5], [R * 0.82, -W * 0.52], [R * 0.95, -W * 0.44], [R * 0.995, -W * 0.3],
    [R, -W * 0.12], [R, W * 0.12], [R * 0.995, W * 0.3], [R * 0.95, W * 0.44], [R * 0.82, W * 0.52], [rim + 0.02, W * 0.5], [rim, W * 0.42],
  ];
  const makeWheel = (R, W, rim, sx, big) => {
    const spin = new THREE.Group();
    const tyre = lathe(tyreProfile(R, W, rim), big ? 48 : 28);
    tyre.rotateZ(Math.PI / 2);
    const tm = new THREE.Mesh(tyre, M.tyre);
    tm.castShadow = true; tm.receiveShadow = true;
    const hubG = lathe([[0.0, -W * 0.3], [rim * 0.35, -W * 0.32], [rim * 0.55, -W * 0.18], [rim * 0.9, -W * 0.3], [rim + 0.008, -W * 0.44],
      [rim + 0.008, W * 0.44], [rim * 0.9, W * 0.3], [rim * 0.55, W * 0.18], [rim * 0.35, W * 0.32], [0.0, W * 0.3]], big ? 32 : 18);
    hubG.rotateZ(Math.PI / 2);
    const parts = [tagged(hubG)];
    if (big) {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        parts.push(tagged(tx(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 8), sx * W * 0.33, Math.cos(a) * rim * 0.55, Math.sin(a) * rim * 0.55, 0, 0, Math.PI / 2)));
      }
      parts.push(tagged(tx(new THREE.SphereGeometry(rim * 0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), sx * W * 0.31, 0, 0, 0, 0, -sx * Math.PI / 2)));
      // Valve stem (shows the wheel turning).
      parts.push(tagged(rod([sx * W * 0.38, rim * 0.92, 0], [sx * W * 0.45, rim * 0.98, 0], 0.006, 6)));
    }
    spin.add(tm, new THREE.Mesh(mergeGeometries(parts), M.hub));
    return spin;
  };
  for (const [name, sx] of [['mainL', 1], ['mainR', -1]]) {
    const cfg = gearCfg[name];
    const R = 0.325, W = 0.2;
    const ax = cfg.p[0], ay = cfg.p[1] + R, az = cfg.p[2];
    const g = new THREE.Group();
    // Faired spring leg (as on the real aircraft): one wide strut of
    // streamlined section from the wing-root fitting, raked forward and out
    // to the axle, with a small cuff at each end. Scaled vertically with the
    // spring compression so it stays connected to the wheel.
    const attachY = WING.rootY - 0.08;
    const leg = new THREE.Group();
    leg.position.y = attachY;
    const L = (p) => [p[0], p[1] - attachY, p[2]];
    const axIn = ax - sx * 0.13;
    const top = [sx * 0.42, attachY, az - 0.2], bot = [axIn, ay + 0.04, az];
    const strut = (a, b, c0, c1, t0, t1, n = 10) => {
      // Elliptical streamlined section: chord along the flight direction.
      const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), Y = Bv.clone().sub(A), len = Y.length();
      Y.normalize();
      const Z = new THREE.Vector3(0, 0, 1).addScaledVector(Y, -Y.z).normalize(), X = Y.clone().cross(Z);
      const g = new THREE.CylinderGeometry(1, 1, len, 18, n, false);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = p.getY(i) / len + 0.5, c = lerp(c0, c1, t) / 2, w = lerp(t0, t1, t) / 2;
        // tear-drop: fuller ahead of the thickest point
        const zz = p.getZ(i), xx = p.getX(i);
        p.setXYZ(i, xx * w * (zz > 0 ? 1 : 0.85), p.getY(i), zz * c);
      }
      g.computeVertexNormals();
      return g.applyMatrix4(new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(A.clone().add(Bv).multiplyScalar(0.5)));
    };
    const legParts = [
      strut(L(top), L(bot), 0.3, 0.15, 0.07, 0.05),
      tx(new RoundedBoxGeometry(0.1, 0.11, 0.17, 2, 0.025), ...L([axIn, ay + 0.03, az])),
      rod(L([axIn, ay, az]), L([ax - sx * 0.02, ay, az]), 0.03, 12),
      tx(new RoundedBoxGeometry(0.2, 0.05, 0.34, 2, 0.02), ...L([sx * 0.42, attachY + 0.01, az - 0.2])),
    ];
    const legMesh = new THREE.Mesh(mergeGeometries(legParts.map((p) => tagged(p))), M.paint);
    legMesh.castShadow = true; legMesh.receiveShadow = true;
    const brakeLine = new THREE.Mesh(tagged(tube([L([sx * 0.4, attachY - 0.02, az - 0.32]), L([lerp(sx * 0.42, axIn, 0.5) - sx * 0.03, (attachY + ay) / 2, az - 0.14]), L([axIn - sx * 0.02, ay + 0.06, az - 0.06])], 0.007, 16, 6)), M.rubber);
    leg.add(legMesh, brakeLine);
    g.add(leg);
    const wheel = new THREE.Group();
    wheel.position.set(ax, ay, az);
    const spinPart = makeWheel(R, W, 0.155, sx, true);
    // Brake disc + caliper on the inboard side (do not spin).
    const brake = new THREE.Mesh(mergeGeometries([
      tagged(tx(new THREE.CylinderGeometry(0.12, 0.12, 0.012, 24), -sx * 0.085, 0, 0, 0, 0, Math.PI / 2)),
    ]), M.steel);
    const caliper = new THREE.Mesh(tagged(new RoundedBoxGeometry(0.05, 0.07, 0.08, 2, 0.012).translate(-sx * 0.085, 0.09, -0.04)), M.dark);
    wheel.add(spinPart, brake, caliper);
    g.add(wheel);
    root.add(g);
    gearGroups[name] = { group: g, wheel, spin: spinPart, leg, legH: attachY - ay, rest: wheel.position.clone(), sx };
  }
  {
    const cfg = gearCfg.tail;
    const g = new THREE.Group();
    const R = 0.135;
    const fz = cfg.p[2] + 0.1, fy = cfg.p[1] + R + 0.085;
    // Tapered leaf spring from a bracket under the tail cone, just ahead of
    // the rudder post, back and down to the steerable fork under the rudder.
    add('dark', tx(new RoundedBoxGeometry(0.09, 0.05, 0.16, 2, 0.012), 0, -0.38, -3.8));
    add('dark', bar([0, -0.39, -3.8], [0, fy + 0.02, fz], 0.06, 0.016));
    add('dark', tx(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 12), 0, fy + 0.03, fz));
    const fork = new THREE.Group();
    fork.position.set(0, fy, fz);
    const forkGeo = mergeGeometries([
      tagged(tx(new THREE.BoxGeometry(0.012, 0.14, 0.05), 0.045, -0.04, -0.06, 0.6)), tagged(tx(new THREE.BoxGeometry(0.012, 0.14, 0.05), -0.045, -0.04, -0.06, 0.6)),
      tagged(tx(new THREE.BoxGeometry(0.1, 0.02, 0.05), 0, 0.02, -0.01)),
      tagged(rod([-0.06, 0.03, 0.04], [0.06, 0.03, 0.04], 0.008, 6)),
    ]);
    fork.add(new THREE.Mesh(forkGeo, M.steel));
    const wheel = new THREE.Group();
    wheel.position.set(0, -0.085, -0.1);
    const spinPart = makeWheel(R, 0.075, 0.06, 1, false);
    wheel.add(spinPart);
    fork.add(wheel);
    g.add(fork);
    root.add(g);
    // Steering springs to the rudder horn.
    for (const sx of [1, -1]) add('steel', rod([sx * 0.06, fy + 0.03, fz + 0.04], [sx * 0.1, -0.2, HINGE_Z - 0.12], 0.005, 5), true);
    gearGroups.tail = { group: g, wheel, spin: spinPart, fork, rest: wheel.position.clone(), sx: 0 };
  }

  // ---------------- spray system ----------------
  // The boom runs just aft of the trailing edge, low enough to stay under the
  // flaps' trailing edge at full deflection (30 deg), and its hangers come
  // down from the fixed wing ahead of the flap hinge, under the flaps' path:
  // lowered flaps never pass through the boom or its hangers.
  const nozzles = [];
  const hingeZ = WING.le - 0.76 * WING.chord;
  const boomZ = WING.le - WING.chord - 0.03, boomDrop = 0.27;
  for (const side of [1, -1]) {
    const x0 = 0.7, x1 = 5.0;
    const a = [side * x0, wingY(x0) - boomDrop, boomZ], b = [side * x1, wingY(x1) - boomDrop, boomZ];
    add('alu', rod(a, b, 0.024, 12));
    add('alu', ball(b, 0.03, 10));
    add('brass', tx(new THREE.CylinderGeometry(0.012, 0.012, 0.04, 8), b[0] + side * 0.03, b[1], b[2], 0, 0, Math.PI / 2), true);
    // Streamlined hangers from the wing (ahead of the hinge) to the boom.
    for (const hx of [1.1, 2.2, 3.3, 4.4]) {
      const top = [side * hx, wingY(hx) - 0.035, hingeZ + 0.15], bot = [side * hx, wingY(hx) - boomDrop, boomZ];
      add('alu', tx(rod(top, bot, 0.016, 10), 0, 0, 0));
      add('dark', tx(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10), side * hx, wingY(hx) - boomDrop, boomZ, 0, 0, Math.PI / 2), true);
    }
    const N = 24;
    for (let k = 0; k <= N; k++) {
      const x = x0 + ((x1 - x0) * k) / N;
      const y = wingY(x) - boomDrop;
      // Drop tube + diaphragm check-valve body + brass nozzle tip.
      add('alu', rod([side * x, y, boomZ], [side * x, y - 0.06, boomZ - 0.02], 0.007, 6), true);
      add('dark', tx(new THREE.CylinderGeometry(0.017, 0.014, 0.045, 10), side * x, y - 0.085, boomZ - 0.03, 0.3), true);
      add('brass', tx(new THREE.ConeGeometry(0.01, 0.025, 8), side * x, y - 0.118, boomZ - 0.04, Math.PI + 0.3), true);
      nozzles.push(new THREE.Vector3(side * x, y - 0.12, boomZ - 0.04));
    }
  }
  // Feed pipe from the pump to the boom centre (T junction, elbows).
  add('alu', rod([0.7, wingY(0.7) - boomDrop, boomZ], [-0.7, wingY(0.7) - boomDrop, boomZ], 0.034, 12));
  add('alu', tube([[0, -0.36, 0.9], [0, -0.45, 0.5], [0, -0.47, 0.0], [0, wingY(0.7) - boomDrop, boomZ]], 0.034, 24, 10));
  add('alu', ball([0, wingY(0.7) - boomDrop, boomZ], 0.05, 12));
  // Wind-driven pump under the belly (body, nose, fan with hub).
  const pump = new THREE.Group();
  pump.position.set(0, -0.5, 0.95);
  const pumpBody = lathe([[0.0, -0.2], [0.07, -0.19], [0.095, -0.12], [0.1, 0.05], [0.085, 0.15], [0.05, 0.19], [0.0, 0.2]], 24);
  pumpBody.rotateX(Math.PI / 2);
  pump.add(new THREE.Mesh(tagged(pumpBody), M.red));
  pump.add(new THREE.Mesh(tagged(tx(new THREE.SphereGeometry(0.045, 14, 10), 0, 0, 0.21)), M.steel));
  const pumpFan = new THREE.Group();
  pumpFan.position.z = 0.22;
  for (let i = 0; i < 4; i++) {
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.05, 0.008), M.dark);
    bl.position.x = Math.cos((i * Math.PI) / 2) * 0.09;
    bl.position.y = Math.sin((i * Math.PI) / 2) * 0.09;
    bl.rotation.z = (i * Math.PI) / 2;
    bl.rotation.x = 0.35;
    pumpFan.add(bl);
  }
  pump.add(pumpFan);
  root.add(pump);
  add('steel', rod([0, -0.28, 0.95], [0, -0.42, 0.95], 0.024, 10));
  add('red', tx(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 12), 0.12, -0.36, 0.7, 0, 0, Math.PI / 2));

  // ---------------- propeller (two-blade Hartzell, twisted airfoil sections) ----------------
  const prop = new THREE.Group();
  prop.position.set(0, 0.2, 2.35);
  prop.add(spinnerMesh);
  const blades = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x18191a, roughness: 0.55, metalness: 0.25, transparent: true });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xf2c21b, roughness: 0.5, transparent: true });
  const bladeLoft = (r0, r1, steps) => {
    const pos = [], idx = [];
    let n = 0;
    for (let i = 0; i <= steps; i++) {
      const r = r0 + ((r1 - r0) * i) / steps;
      const f = clamp((r - 0.12) / 0.95, 0, 1);
      let c = 0.075 + 0.1 * Math.sin(Math.PI * Math.min(1, f * 1.15)) ** 0.7;
      if (r > 0.97) c *= 1 - ((r - 0.97) / 0.1) ** 2 * 0.55;
      const t = lerp(0.22, 0.07, f);
      const beta = Math.atan(1.75 / (2 * Math.PI * Math.max(r, 0.15)));
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
  };
  const bodyGeo = bladeLoft(0.12, 0.96, 14), tipGeo = bladeLoft(0.96, 1.07, 4);
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Group();
    const bm = new THREE.Mesh(bodyGeo, bladeMat);
    const tm = new THREE.Mesh(tipGeo, tipMat);
    bm.castShadow = true;
    b.add(bm, tm);
    b.rotation.z = i * Math.PI;
    blades.add(b);
  }
  prop.add(blades);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.08, 48), new THREE.MeshBasicMaterial({ map: twoBladeDiscTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.z = 0.02;
  disc.renderOrder = 11;
  prop.add(disc);
  root.add(prop);

  // ---------------- cockpit interior ----------------
  // Light grey aluminium panel with real depth: the instruments are recessed
  // cans (dial faces from the panel canvas) behind black bezels and glass,
  // with 3D needles set from the telemetry; the guidance unit stands proud of
  // the panel in its own housing under a sun hood; toggles, the magneto key
  // and the mixture and prop levers follow the aircraft's state. Black padded
  // glareshield, hanging magnetic compass, hopper sight window under the
  // panel, dark vinyl seat with its harness.
  const cockpit = new THREE.Group();
  const ci = {};
  const addC = (mat, g) => { (ci[mat] ||= []).push(tagged(g)); };
  // Small parts (instruments, switches, fittings) go to `near`, dropped
  // beyond 7 m with the moving instruments.
  const near = new THREE.Group(), cf = {};
  const addP = (mat, g) => { (cf[mat] ||= []).push(tagged(g)); };
  const cabAO = (x, y, z) => 0.55 + 0.45 * smoothstep(-0.3, 0.85, y) * (z < -0.85 ? 0.85 : 1);
  addC('floor', tx(new THREE.BoxGeometry(0.95, 0.03, 1.5), 0, -0.25, -0.25));
  for (const sx of [1, -1]) {
    addC('interior', tx(new THREE.BoxGeometry(0.03, 0.78, 1.24), sx * 0.47, 0.15, -0.2)); // side walls, below the sill
    addC('interior', tx(new RoundedBoxGeometry(0.13, 0.09, 0.8, 2, 0.02), sx * 0.43, 0.42, -0.18)); // side consoles
    addC('red', tx(new THREE.BoxGeometry(0.014, 0.055, 0.024), sx * 0.47, 0.76, -0.03)); // window latch
    addC('red', tx(new THREE.BoxGeometry(0.03, 0.012, 0.012), sx * 0.46, 0.785, -0.03));
  }
  // Tubular cage visible inside (light grey tubes, rounded joints).
  for (const [a, b] of [
    [[0.45, -0.1, 0.42], [0.45, 0.53, -0.4]], [[-0.45, -0.1, 0.42], [-0.45, 0.53, -0.4]],
    [[0.45, 0.53, 0.42], [0.45, -0.1, -0.8]], [[-0.45, 0.53, 0.42], [-0.45, -0.1, -0.8]],
    [[-0.44, 0.53, -0.8], [0.44, 0.53, -0.8]], [[0.45, 0.25, 0.42], [0.45, 0.25, -0.8]], [[-0.45, 0.25, 0.42], [-0.45, 0.25, -0.8]],
  ]) { addC('interior', rod(a, b, 0.018, 8)); addC('interior', ball(a, 0.024, 8)); }
  // Rear bulkhead closing the cabin under the turtle deck (the canopy's own
  // section, inset).
  {
    const st = canSec(CAB_Z), pts = [], oy = -COCKPIT_OFF.y;
    for (let i = 0; i <= 24; i++) { const [x, y] = secXY(st, (i / 24) * Math.PI); pts.push(new THREE.Vector2(x * 0.96, st.ys + (y - st.ys) * 0.97 + oy)); }
    const sh = new THREE.Shape([...pts, new THREE.Vector2(-0.5, -0.36 + oy), new THREE.Vector2(0.5, -0.36 + oy)]);
    addC('interior', tx(new THREE.ShapeGeometry(sh, 4), 0, 0, CAB_Z - COCKPIT_OFF.z + 0.01));
  }
  // Hopper's back wall above the glareshield (closes the forward fuselage
  // seen through the windshield over the panel).
  {
    const pts = ring(FWD_END, 48).filter(([, y]) => y > 0.45).map(([x, y]) => new THREE.Vector2(x * 0.98, y - 0.01 - COCKPIT_OFF.y));
    pts.sort((p, q) => Math.atan2(p.y - 0.4, p.x) - Math.atan2(q.y - 0.4, q.x));
    addC('pad', tx(new THREE.ShapeGeometry(new THREE.Shape(pts), 4), 0, 0, -0.15 - COCKPIT_OFF.z));
  }
  // Seat: ribbed dark vinyl cushions on a tube frame, harness with buckle.
  addC('seat', rbox(0.5, 0.11, 0.48, 0.04, 0, 0.05, -0.55));
  addC('seat', rbox(0.5, 0.78, 0.11, 0.045, 0, 0.44, -0.8, -0.12));
  addC('seat', rbox(0.42, 0.2, 0.08, 0.035, 0, 0.95, -0.86, -0.12));
  for (const sx of [1, -1]) {
    addC('seat', rbox(0.06, 0.62, 0.13, 0.025, sx * 0.24, 0.42, -0.78, -0.12)); // side bolsters
    addC('steel', rod([sx * 0.22, -0.24, -0.4], [sx * 0.22, 0.0, -0.55], 0.015, 8));
    addC('steel', rod([sx * 0.24, 0.0, -0.32], [sx * 0.24, 0.0, -0.78], 0.014, 8));
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.01), M.harness);
    strap.position.set(sx * 0.12, 0.48, -0.74);
    strap.rotation.x = -0.12;
    cockpit.add(strap);
  }
  addC('steel', rbox(0.07, 0.05, 0.012, 0.01, 0, 0.2, -0.69, -0.12));

  // Instrument panel: an aluminium plate (canvas face) cut for the round
  // instruments, 16 mm deep; the dial faces sit at the back of the holes.
  const PL = panel.layout ?? IPA_PANEL, G = PL.gauges;
  const ps = 0.96 / PL.W;
  // The layout's top edge sits just under the glareshield; the glareshield
  // follows the windshield's lower frame (the hopper top's crown, falling
  // to the sills), so the plate's top edge is level in the middle and rounds
  // down into the corners.
  const PT = 0.7 - COCKPIT_OFF.y, PB = PT - 0.48; // panel top 0.70 m on the airframe
  const PX = (px) => 0.48 - px * ps, PY = (py) => PT - py * ps;
  const ZP = 0.335, PD = 0.016;
  const gsU = [];
  for (let i = 0; i <= 64; i++) { const [x, y] = wsB(i / 64); gsU.push([x, y - COCKPIT_OFF.y]); }
  // Height of the windshield's lower frame (cockpit frame) at x.
  const gsY = (x) => {
    const ax = Math.min(Math.abs(x), gsU[0][0]);
    for (let i = 1; i <= 32; i++) {
      const [x1, y1] = gsU[i], [x0, y0] = gsU[i - 1];
      if (ax >= x1) return y0 + ((ax - x0) / (x1 - x0)) * (y1 - y0);
    }
    return gsU[32][1];
  };
  const plateTop = (x) => Math.min(PT, gsY(x) - 0.045);
  const panelUV = (g) => {
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = (0.48 - p.getX(i)) / 0.96; uv[i * 2 + 1] = (p.getY(i) - PB) / 0.48; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  };
  const panelMat = new THREE.MeshStandardMaterial({ map: panel.texture, roughness: 0.5, metalness: 0.25, emissive: 0xffffff, emissiveMap: panel.texture, emissiveIntensity: 0.08 });
  const screenMat = new THREE.MeshStandardMaterial({ map: panel.texture, roughness: 0.22, metalness: 0, emissive: 0xffffff, emissiveMap: panel.texture, emissiveIntensity: 0.6 });
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.7, metalness: 0.2 });
  let panelMesh;
  {
    const r0 = 0.03, sh = new THREE.Shape();
    sh.moveTo(-0.48 + r0, PB); sh.lineTo(0.48 - r0, PB); sh.quadraticCurveTo(0.48, PB, 0.48, PB + r0);
    for (let i = 0; i <= 48; i++) { const x = 0.48 - (0.96 * i) / 48; sh.lineTo(x, plateTop(x)); }
    sh.lineTo(-0.48, PB + r0); sh.quadraticCurveTo(-0.48, PB, -0.48 + r0, PB);
    for (const g of Object.values(G)) { const h = new THREE.Path(); h.absarc(PX(g.x), PY(g.y), (g.r + 4) * ps, 0, Math.PI * 2, true); sh.holes.push(h); }
    const plate = new THREE.ExtrudeGeometry(sh, { depth: PD, bevelEnabled: false, curveSegments: 32 });
    plate.translate(0, 0, ZP);
    panelMesh = new THREE.Mesh(panelUV(plate), [panelMat, holeMat]);
    panelMesh.receiveShadow = true;
    near.add(panelMesh);
    const faces = Object.values(G).map((g) => tx(new THREE.CircleGeometry((g.r + 4.5) * ps, 40).rotateY(Math.PI), PX(g.x), PY(g.y), ZP + PD - 0.0006));
    near.add(new THREE.Mesh(panelUV(mergeGeometries(faces)), panelMat));
  }
  // Bezels (black rings standing off the plate), screws, glass.
  const instGlass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.2, depthWrite: false });
  {
    const discs = [];
    for (const g of Object.values(G)) {
      const ri = (g.r + 4) * ps, w = Math.max(0.006, g.r * ps * 0.12), cx = PX(g.x), cy = PY(g.y);
      addP('gloss', tx(lathe([[ri + w, 0], [ri + w, 0.005], [ri + w * 0.6, 0.0074], [ri, 0.0048], [ri, -0.001]], 32).rotateX(-Math.PI / 2), cx, cy, ZP));
      for (let q = 0; q < 4; q++) {
        const a = Math.PI / 4 + (q * Math.PI) / 2, rr = ri + w + 0.0055;
        addP('steel', tx(new THREE.CylinderGeometry(0.0026, 0.0026, 0.003, 6, 1, true), cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, ZP - 0.0015, Math.PI / 2));
      }
      discs.push(tx(new THREE.CircleGeometry(ri, 36).rotateY(Math.PI), cx, cy, ZP - 0.0035));
      if (g !== G.tc) addP('gloss', tx(new THREE.CylinderGeometry(g.r * ps * 0.085, g.r * ps * 0.1, 0.004, 16), cx, cy, ZP + PD - 0.0062, Math.PI / 2));
    }
    const gm = new THREE.Mesh(mergeGeometries(discs), instGlass);
    gm.renderOrder = 6;
    near.add(gm);
  }
  // Needles (one instanced mesh), turn-coordinator symbol and ball.
  const needleMat = new THREE.MeshStandardMaterial({ color: 0xf4f2ea, emissive: 0xf4f2ea, emissiveIntensity: 0.25, roughness: 0.45 });
  const needleGeo = (() => {
    const s = new THREE.Shape();
    s.moveTo(-0.16, -0.32); s.lineTo(0.08, -0.5); s.lineTo(0.7, -0.3); s.lineTo(1, 0); s.lineTo(0.7, 0.3); s.lineTo(0.08, 0.5); s.lineTo(-0.16, 0.32); s.closePath();
    return new THREE.ShapeGeometry(s).rotateX(Math.PI);
  })();
  const NI = Object.entries(PL.needles).map(([k, [gk, lk, wk, layer]]) => {
    const g = G[gk];
    return { k, wrap: gk === 'alt', x: PX(g.x), y: PY(g.y), len: g.r * ps * lk, w: g.r * ps * wk, z: ZP + PD - 0.0024 - layer * 0.0009, cur: null, tgt: null };
  });
  const needles = new THREE.InstancedMesh(needleGeo, needleMat, NI.length);
  needles.frustumCulled = false;
  near.add(needles);
  const tcR = G.tc.r * ps;
  const tcPlane = new THREE.Mesh(mergeGeometries([
    new THREE.PlaneGeometry(tcR * 1.3, tcR * 0.075), new THREE.CircleGeometry(tcR * 0.12, 18),
    new THREE.PlaneGeometry(tcR * 0.06, tcR * 0.2).translate(0, tcR * 0.13, 0),
  ].map((g) => g.rotateY(Math.PI))), needleMat);
  tcPlane.position.set(PX(G.tc.x), PY(G.tc.y), ZP + PD - 0.004);
  near.add(tcPlane);
  const slipBall = new THREE.Mesh(new THREE.SphereGeometry(tcR * 0.075, 12, 8), M.gloss);
  near.add(slipBall);
  // Annunciator lenses.
  for (const [x, y] of PL.lamps) {
    addP('lens', tx(new THREE.SphereGeometry(12 * ps, 14, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), PX(x), PY(y), ZP, 0, 0, 0, [1, 1, 0.45]));
    addP('gloss', tx(new THREE.TorusGeometry(13.5 * ps, 0.0022, 4, 20), PX(x), PY(y), ZP - 0.001));
  }
  // Toggle switches (bat handles on an instanced mesh), nuts, the spray
  // valve switch under a red guard; magneto key.
  const togGeo = mergeGeometries([tagged(tx(new THREE.CylinderGeometry(0.0022, 0.003, 0.02, 8), 0, 0, -0.01, Math.PI / 2)), tagged(ball([0, 0, -0.02], 0.0036, 8))]);
  const toggles = new THREE.InstancedMesh(togGeo, M.alu, PL.toggles.length);
  toggles.frustumCulled = false;
  near.add(toggles);
  for (const t of PL.toggles) {
    addP('steel', tx(new THREE.CylinderGeometry(0.0058, 0.0058, 0.004, 6), PX(t.x), PY(t.y), ZP - 0.002, Math.PI / 2));
  }
  {
    const t = PL.toggles[6], x = PX(t.x), y = PY(t.y);
    addP('red', tx(new THREE.BoxGeometry(0.026, 0.004, 0.03), x, y + 0.016, ZP - 0.015, -0.5));
    for (const s of [1, -1]) addP('red', tx(new THREE.BoxGeometry(0.003, 0.02, 0.026), x + s * 0.012, y + 0.008, ZP - 0.012));
  }
  addP('alu', tx(new THREE.CylinderGeometry(0.0165, 0.0175, 0.008, 28), PX(PL.key.x), PY(PL.key.y), ZP - 0.004, Math.PI / 2));
  const key = new THREE.Group();
  key.position.set(PX(PL.key.x), PY(PL.key.y), ZP - 0.008);
  key.add(new THREE.Mesh(tagged(mergeGeometries([
    tagged(new THREE.BoxGeometry(0.03, 0.006, 0.004).translate(0, 0, -0.004)),
    tagged(tx(new THREE.BoxGeometry(0.012, 0.016, 0.005), 0.016, 0, -0.012)),
  ])), M.gloss));
  near.add(key);
  // Guidance unit housing (SATLOC style) standing off the panel, its face
  // (screen, keys) from the panel canvas, sun hood over the screen.
  {
    const gp = PL.gps, x0 = PX(gp.x), x1 = PX(gp.x + gp.w), y0 = PY(gp.y), y1 = PY(gp.y + gp.h);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, w = Math.abs(x1 - x0), h = Math.abs(y0 - y1), D = 0.034;
    addP('gloss', tx(new RoundedBoxGeometry(w + 0.014, h + 0.014, D, 2, 0.009), cx, cy, ZP - D / 2 + 0.003));
    const face = new THREE.Mesh(panelUV(tx(new THREE.PlaneGeometry(w, h).rotateY(Math.PI), cx, cy, ZP - D - 0.0006)), screenMat);
    near.add(face);
    const sy = PY(PL.screen.y);
    addP('gloss', tx(new THREE.BoxGeometry(w + 0.018, 0.007, 0.062), cx, sy + 0.006, ZP - D - 0.026, 0.12));
    for (const s of [1, -1]) addP('gloss', tx(new THREE.BoxGeometry(0.006, 0.05, 0.06), cx + s * (w / 2 + 0.006), sy - 0.018, ZP - D - 0.026));
    for (const s of [1, -1]) addP('steel', tx(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 14), cx + s * (w / 2 + 0.012), cy, ZP - D / 2, 0, 0, Math.PI / 2));
    // Flow monitor LCD in a black frame.
    const L = PL.lcd, lx0 = PX(L.x), lx1 = PX(L.x + L.w), ly0 = PY(L.y), ly1 = PY(L.y + L.h);
    const lcx = (lx0 + lx1) / 2, lcy = (ly0 + ly1) / 2, lw = Math.abs(lx1 - lx0), lh = Math.abs(ly0 - ly1);
    near.add(new THREE.Mesh(panelUV(tx(new THREE.PlaneGeometry(lw, lh).rotateY(Math.PI), lcx, lcy, ZP - 0.0012)), screenMat));
    for (const [bx, by, bw, bh] of [[lcx, ly0 + 0.004, lw + 0.016, 0.008], [lcx, ly1 - 0.004, lw + 0.016, 0.008], [lx0 + 0.004, lcy, 0.008, lh], [lx1 - 0.004, lcy, 0.008, lh]]) {
      addP('gloss', tx(new THREE.BoxGeometry(bw, bh, 0.012), bx, by, ZP - 0.005));
    }
  }
  // Hopper sight window under the panel (live level).
  const sightMat = new THREE.MeshStandardMaterial({ map: panel.sightTexture, roughness: 0.4, emissive: 0xffffff, emissiveMap: panel.sightTexture, emissiveIntensity: 0.08 });
  const sight = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.3), sightMat);
  sight.position.set(-0.17, 0.0, 0.42);
  sight.rotation.y = Math.PI;
  near.add(sight);
  addP('gloss', tx(new THREE.BoxGeometry(0.2, 0.33, 0.012), -0.17, 0.0, 0.428));
  for (const [x, y] of [[-0.075, 0.155], [-0.265, 0.155], [-0.075, -0.155], [-0.265, -0.155]]) addP('steel', tx(new THREE.CylinderGeometry(0.004, 0.004, 0.004, 8), x, y, 0.42, Math.PI / 2));
  // Firewall under the panel.
  addC('interior', tx(new THREE.BoxGeometry(0.96, 0.58, 0.03), 0, 0.01, 0.445));
  // Black padded glareshield: its top runs under the windshield's lower
  // frame from sill to sill and overhangs the panel by 5 cm with a padded
  // roll; its underside closes down onto the plate's arched top edge.
  // The hood is 10 cm deep: its top runs level just above the glass's lower
  // frame (hiding it from the seat) and drops under the raked glass to the
  // windshield base; a padded roll at the lip.
  const gsLip = ZP - 0.1;
  const WSK = (wsT(0.5)[1] - wsB(0.5)[1]) / (WS_BOT - WS_TOP); // windshield rise per metre aft
  const zWB = WS_BOT - COCKPIT_OFF.z; // windshield base in the cockpit frame
  const hoodTop = (x, z) => Math.min(gsY(x) + 0.032, gsY(x) + (zWB - z) * WSK - 0.012);
  {
    const arc = (u) => { const [x] = wsB(0.015 + 0.97 * u); return x * 0.975; };
    addC('pad', grid((u, v) => { const x = arc(u), z = lerp(gsLip, zWB - 0.004, v); return [x, hoodTop(x, z), z]; }, 32, 6, [0, 0.4, 0.37]));
    addC('pad', grid((u, v) => { const x = arc(u); return [x, lerp(hoodTop(x, gsLip) - 0.034, plateTop(x) + 0.002, v), lerp(gsLip + 0.004, ZP - 0.001, v)]; }, 32, 2, [0, 0.95, 0.5]));
    addC('pad', tube(line((t) => { const x = arc(0.02 + 0.96 * t); return [x, hoodTop(x, gsLip) - 0.017, gsLip + 0.004]; }, 32)(0), 0.018, 48, 10));
  }
  // Lightbar (swath guidance LEDs) on the glareshield's roll, clear of the
  // raked glass.
  const lightbar = new THREE.Group();
  lightbar.position.set(0, hoodTop(0, gsLip) + 0.006, gsLip - 0.012);
  const leds = [];
  for (let i = -7; i <= 7; i++) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.014, 0.008), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    led.position.set(-i * 0.0155, 0, -0.016); // pilot faces +Z: +X is left
    lightbar.add(led);
    leds.push(led);
  }
  lightbar.add(new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.032, 0.03, 2, 0.006), M.dark));
  cockpit.add(lightbar);
  // Magnetic compass on the glareshield's roll, right of centre (the
  // one-piece windshield has no centre post): vertical card behind a domed
  // lens, lubber line, foot.
  const cardMat = new THREE.MeshStandardMaterial({ roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.12 });
  cardMat.map = cardMat.emissiveMap = compassCardTexture();
  const CPX = -0.24, CPY = hoodTop(-0.24, gsLip) + 0.01, CPZ = gsLip - 0.03;
  const compassCard = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.022, 40, 1, true), cardMat);
  compassCard.position.set(CPX, CPY, CPZ - 0.032);
  near.add(compassCard);
  addP('gloss', tx(new RoundedBoxGeometry(0.078, 0.056, 0.05, 2, 0.012), CPX, CPY + 0.005, CPZ));
  addP('gloss', tx(new THREE.CylinderGeometry(0.012, 0.018, 0.02, 10), CPX, CPY - 0.028, CPZ));
  addP('lens', tx(new THREE.SphereGeometry(0.03, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), CPX, CPY, CPZ - 0.026, 0, 0, 0, [1, 0.82, 1.15]));
  addP('red', tx(new THREE.BoxGeometry(0.0016, 0.026, 0.002), CPX, CPY, CPZ - 0.06));
  // Stick: rubber boot, shaft, ergonomic black grip with hat switch and trigger.
  const stick = new THREE.Group();
  stick.position.set(0, -0.22, -0.12);
  const boot = new THREE.Mesh(lathe([[0.075, 0], [0.07, 0.02], [0.05, 0.06], [0.03, 0.1], [0.018, 0.14]], 16), M.rubber);
  const shaft = new THREE.Mesh(tagged(new THREE.CylinderGeometry(0.014, 0.018, 0.56, 10)), M.steel);
  shaft.position.y = 0.3;
  const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.027, 0.11, 6, 14), M.gloss);
  grip.position.set(0, 0.63, 0.012);
  grip.rotation.x = 0.22;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.015, 10), M.red);
  hat.position.set(0, 0.71, 0.035);
  const trig = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.035, 0.012), M.dark);
  trig.position.set(0, 0.62, 0.042);
  stick.add(boot, shaft, grip, hat, trig);
  cockpit.add(stick);
  // Rudder pedals (plate with toe-brake bar, arm).
  const pedals = [];
  for (const sx of [1, -1]) {
    const p = new THREE.Group();
    p.position.set(sx * 0.17, -0.12, 0.42);
    p.rotation.x = -0.6;
    p.add(new THREE.Mesh(tagged(mergeGeometries([
      tagged(new RoundedBoxGeometry(0.1, 0.16, 0.025, 2, 0.008)),
      tagged(rbox(0.11, 0.035, 0.03, 0.008, 0, 0.075, -0.012)),
      tagged(tx(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 8), 0, -0.12, 0.03)),
    ])), M.steel));
    cockpit.add(p);
    pedals.push(p);
  }
  // Engine quadrant on the left console: throttle (black), propeller (blue),
  // mixture (red ribbed) levers.
  addC('dark', rbox(0.1, 0.05, 0.32, 0.015, 0.43, 0.485, 0.05));
  for (const x of [0.415, 0.443, 0.468]) addP('gloss', tx(new THREE.BoxGeometry(0.008, 0.012, 0.2), x, 0.512, 0.05));
  const throttle = new THREE.Group();
  throttle.position.set(0.415, 0.5, 0.05);
  const tl = new THREE.Mesh(tagged(new THREE.CylinderGeometry(0.008, 0.008, 0.17, 8)), M.steel);
  tl.position.y = 0.085;
  const tk = new THREE.Mesh(new RoundedBoxGeometry(0.065, 0.032, 0.036, 2, 0.011), M.gloss);
  tk.position.y = 0.17;
  throttle.add(tl, tk);
  cockpit.add(throttle);
  const lever = (x, knob) => {
    const gr = new THREE.Group();
    gr.position.set(x, 0.5, 0.05);
    const l = new THREE.Mesh(tagged(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 8)), M.steel);
    l.position.y = 0.07;
    knob.position.y = 0.145;
    gr.add(l, knob);
    cockpit.add(gr);
    return gr;
  };
  const propLever = lever(0.443, new THREE.Mesh(new THREE.SphereGeometry(0.019, 14, 10), M.blue));
  const mixLever = lever(0.468, new THREE.Mesh(tagged(tx(new THREE.CylinderGeometry(0.017, 0.017, 0.02, 12), 0, 0, 0, 0, 0, Math.PI / 2)), M.red));
  // Spray valve handle on the right console.
  const valve = new THREE.Group();
  valve.position.set(-0.43, 0.47, 0.0);
  const vl = new THREE.Mesh(tagged(new THREE.CylinderGeometry(0.009, 0.009, 0.16, 8)), M.steel);
  vl.position.y = 0.08;
  const vk = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.03, 0.03, 2, 0.008), M.red);
  vk.position.y = 0.16;
  valve.add(vl, vk);
  cockpit.add(valve);
  // Red canopy release handle and a fire extinguisher.
  const er = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 8, 16, Math.PI), M.red);
  er.position.set(-0.47, 0.5, 0.2);
  er.rotation.y = Math.PI / 2;
  cockpit.add(er);
  const ext = new THREE.Mesh(mergeGeometries([tagged(lathe([[0, -0.14], [0.035, -0.14], [0.036, 0.1], [0.025, 0.14], [0.01, 0.16], [0, 0.16]], 16))]), M.red);
  ext.position.set(0.38, 0.05, -0.75);
  cockpit.add(ext);
  for (const [mat, parts] of Object.entries(ci)) {
    const g = mergeGeometries(parts);
    if (g.attributes.color) shade(g, cabAO);
    const m = new THREE.Mesh(g, M[mat]);
    m.receiveShadow = true;
    if (mat === 'lens') m.renderOrder = 7;
    cockpit.add(m);
  }
  for (const [mat, parts] of Object.entries(cf)) {
    const m = new THREE.Mesh(mergeGeometries(parts), M[mat]);
    if (mat === 'lens') m.renderOrder = 7;
    near.add(m);
  }
  const nearLod = new THREE.LOD();
  nearLod.addLevel(near, 0);
  nearLod.addLevel(new THREE.Group(), 7);
  cockpit.add(nearLod);
  root.add(new THREE.Mesh(headliner, M.headliner));
  cockpit.position.copy(COCKPIT_OFF);
  root.add(cockpit);

  // Instruments: targets from the telemetry (every frame in the cockpit
  // view, and whenever the panel canvas is drawn), needles eased toward them
  // like damped movements. The altimeter hands take the short way round.
  const _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _p4 = new THREE.Vector3(), _s4 = new THREE.Vector3(), _z4 = new THREE.Vector3(0, 0, 1), _x4 = new THREE.Vector3(1, 0, 0);
  let tcT = 0, tcC = 0;
  const ballT = [G.tc.x, G.tc.y + G.tc.r * 0.5], ballC = ballT.slice();
  const lev = { mix: 0, prop: 0.15 };
  const setGauges = (d) => {
    if (!panel.readings) return;
    const r = panel.readings(d);
    for (const n of NI) { n.tgt = r.a[n.k]; if (n.cur === null) n.cur = n.tgt; }
    tcT = r.tc; ballT[0] = r.ball[0]; ballT[1] = r.ball[1];
    PL.toggles.forEach((t, i) => {
      _q4.setFromAxisAngle(_x4, r.toggles[i] ? 0.5 : -0.5);
      toggles.setMatrixAt(i, _m4.compose(_p4.set(PX(t.x), PY(t.y), ZP - 0.004), _q4, _s4.set(1, 1, 1)));
    });
    toggles.instanceMatrix.needsUpdate = true;
    key.rotation.z = r.key + Math.PI;
    lev.mix = r.mixture; lev.prop = r.prop;
    compassCard.rotation.y = (d.hdg * Math.PI) / 180 - Math.PI;
  };
  const applyGauges = (dt) => {
    const k = dt > 0 ? 1 - Math.exp(-dt * 10) : 1;
    NI.forEach((n, i) => {
      if (n.tgt === null) return;
      let dd = n.tgt - n.cur;
      if (n.wrap) dd = (((dd + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      n.cur += dd * k;
      _q4.setFromAxisAngle(_z4, n.cur + Math.PI);
      needles.setMatrixAt(i, _m4.compose(_p4.set(n.x, n.y, n.z), _q4, _s4.set(n.len, n.w, 1)));
    });
    needles.instanceMatrix.needsUpdate = true;
    tcC += (tcT - tcC) * k;
    tcPlane.rotation.z = tcC;
    ballC[0] += (ballT[0] - ballC[0]) * k; ballC[1] += (ballT[1] - ballC[1]) * k;
    slipBall.position.set(PX(ballC[0]), PY(ballC[1]), ZP + PD - 0.006);
    propLever.rotation.x += (-0.5 + lev.prop * 0.95 - propLever.rotation.x) * k;
    mixLever.rotation.x += (-0.5 + lev.mix * 0.95 - mixLever.rotation.x) * k;
  };
  setGauges({ ias: 0, altFt: 0, rpm: 0, fuel: 0, fuelCap: 260, throttle: 0, engine: 'off', spray: false, flow: 0, vsFpm: 0, yawRate: 0, slip: 0, onGround: true, hdg: 0 });
  applyGauges(0);
  if (panel.readings) {
    const draw0 = panel.draw;
    panel.draw = (d) => { draw0(d); setGauges(d); };
  }
  const update = (dt, fm, ac) => {
    if (ac && ac.game?.cameraMode === 'cockpit' && ac.game.aircraft === ac) setGauges(ac.instruments());
    if (cockpit.visible) applyGauges(dt);
  };

  const pilot = buildPilot(M, stick, throttle);
  pilot.position.copy(COCKPIT_OFF);
  root.add(pilot);

  // ---------------- merge static parts ----------------
  const fine = new THREE.Group();
  for (const [k, parts] of Object.entries(B)) {
    const isFine = k.startsWith('fine:');
    const mat = M[isFine ? k.slice(5) : k];
    const m = new THREE.Mesh(mergeGeometries(parts), mat);
    // Fine parts are smaller than a shadow texel: skip them in the shadow pass.
    m.castShadow = !isFine && mat !== M.glass && mat !== M.lens;
    m.receiveShadow = true;
    if (mat === M.lens) m.renderOrder = 9;
    (isFine ? fine : root).add(m);
  }
  const lod = new THREE.LOD();
  lod.addLevel(fine, 0);
  lod.addLevel(new THREE.Group(), 80);
  root.add(lod);
  root.add(glassMesh);
  root.traverse((o) => { if (o.isMesh && o.castShadow === undefined) o.castShadow = true; });

  return {
    root, M,
    prop, blades, bladeMats: [bladeMat, tipMat], disc,
    ailerons, flaps, elevator, rudder,
    gear: gearGroups,
    stick, pedals, throttle, valve, leds, panelMesh,
    pumpFan, nozzles, pilot, cockpit, glassMesh, update,
    eye: new THREE.Vector3(0, 1.0, -0.5).add(COCKPIT_OFF),
    // Service points (body frame) used by the badeco.
    fuelFiller: new THREE.Vector3(2.4, wingY(2.4) + 0.14, -0.4),
    hopperPort: new THREE.Vector3(0.56, -0.12, -1.1),
  };
}

// ---------------- pilot (seen from outside) ----------------
// Seated pilot in a flight suit and helmet, built in the PR-AGW cockpit frame
// (seat cushion at z -0.55). The forearms and gloves ride on the stick and the
// throttle groups, positioned relative to where those sit in that frame
// (stick at 0, -0.22, -0.12; throttle at 0.415, 0.5, 0.05), so another
// aircraft can reuse it by moving the pilot, stick and throttle by the same
// offset.
export function buildPilot(M, stick, throttle, { throttleAt = [0.415, 0.5, 0.05] } = {}) {
  // A throttle placed elsewhere (in the same frame) moves the left elbow part
  // of the way with it so the forearm stays attached.
  const dT = throttleAt.map((v, i) => v - [0.415, 0.5, 0.05][i]);
  const elbowL = [0.32 + dT[0] * 0.6, 0.56 + dT[1] * 0.6, -0.4 + dT[2] * 0.6];
  const pilot = new THREE.Group();
  const capsule = (a, b, r, mat, parent = pilot) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const len = Math.max(0.01, va.distanceTo(vb));
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 12), mat);
    m.position.copy(va).add(vb).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize());
    parent.add(m);
    return m;
  };
  // Static body parts are collected per material and merged (one mesh per
  // material instead of one per part).
  // The head (helmet, visor, mic) goes to its own map so it can turn.
  const PB = new Map(), HB = new Map();
  let PT = PB;
  const pput = (mat, g) => { if (!PT.has(mat)) PT.set(mat, []); PT.get(mat).push(g.index ? g.toNonIndexed() : g); };
  const place = (g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => g.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
  const limb = (a, b, r, mat) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const g = new THREE.CapsuleGeometry(r, Math.max(0.01, va.distanceTo(vb)), 4, 12);
    g.applyMatrix4(new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize()), new THREE.Vector3(1, 1, 1)));
    pput(mat, g);
  };
  const LEAN = -0.12; // seat-back recline
  const TZ = -0.66;
  // Torso: lathed chest-to-shoulders profile, wider than deep, reclined.
  const torsoProf = [[0.0, 0.0], [0.128, 0.0], [0.138, 0.1], [0.158, 0.2], [0.168, 0.28], [0.162, 0.34], [0.13, 0.4], [0.07, 0.44], [0.0, 0.45]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  pput(M.suit, place(new THREE.LatheGeometry(torsoProf, 20), 0, 0.3, TZ + 0.02, LEAN, 0, 0, 1.24, 1, 0.74));
  const T = (x, y, z) => { // point on the reclined torso frame
    const v = new THREE.Vector3(x, y - 0.3, z).applyAxisAngle(new THREE.Vector3(1, 0, 0), LEAN);
    return [v.x, v.y + 0.3, v.z + TZ + 0.02];
  };
  for (const sx of [1, -1]) pput(M.suit, place(new THREE.SphereGeometry(0.068, 14, 10), ...T(sx * 0.18, 0.71, 0)));
  pput(M.suit, place(new RoundedBoxGeometry(0.36, 0.16, 0.3, 3, 0.06), 0, 0.2, -0.6));
  // Collar, zip, chest pockets, name patch.
  for (const sx of [1, -1]) pput(M.suit, place(new RoundedBoxGeometry(0.08, 0.05, 0.02, 2, 0.008), ...T(sx * 0.045, 0.73, 0.115), LEAN - 0.5, sx * 0.4, 0));
  pput(M.gloss, place(new THREE.BoxGeometry(0.008, 0.36, 0.006), ...T(0, 0.52, 0.12), LEAN));
  for (const sx of [1, -1]) {
    pput(M.suit, place(new RoundedBoxGeometry(0.085, 0.1, 0.022, 2, 0.008), ...T(sx * 0.075, 0.6, 0.118), LEAN));
    pput(M.dark, place(new THREE.BoxGeometry(0.087, 0.028, 0.012), ...T(sx * 0.075, 0.645, 0.128), LEAN));
  }
  // Four-point harness: shoulder straps, lap belt, rotary buckle.
  for (const sx of [1, -1]) {
    const a = T(sx * 0.1, 0.74, 0.02), b = T(sx * 0.07, 0.36, 0.128);
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const g = new THREE.BoxGeometry(0.045, va.distanceTo(vb), 0.012);
    g.applyMatrix4(new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize()), new THREE.Vector3(1, 1, 1)));
    pput(M.harness, g);
    pput(M.harness, place(new THREE.BoxGeometry(0.05, 0.012, 0.16), sx * 0.1, 0.83, -0.76, 0.3, 0, 0)); // over the shoulder
  }
  pput(M.harness, place(new RoundedBoxGeometry(0.38, 0.05, 0.03, 2, 0.01), 0, 0.33, -0.5));
  pput(M.alu, place(new THREE.CylinderGeometry(0.035, 0.035, 0.018, 16), 0, 0.36, -0.49, Math.PI / 2, 0, 0));
  // Neck, head, flight helmet (shell + rubber edge + visor housing + navy
  // stripe), tinted visor down, boom mic, filtered-air hose to the seat.
  limb([0, 0.77, -0.68], [0, 0.86, -0.67], 0.045, M.skin);
  PT = HB;
  pput(M.skin, place(new THREE.SphereGeometry(0.095, 20, 14), 0, 0.95, -0.64));
  pput(M.helmet, place(new THREE.SphereGeometry(0.128, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.64), 0, 0.97, -0.665, 0.12, 0, 0, 1, 1.05, 1.12));
  pput(M.dark, place(new THREE.TorusGeometry(0.1235, 0.008, 6, 28), 0, 0.97 - 0.056, -0.665 - 0.017, Math.PI / 2 + 0.12, 0, 0, 1, 1.12, 1));
  pput(M.helmet, place(new RoundedBoxGeometry(0.17, 0.04, 0.07, 2, 0.015), 0, 1.088, -0.575, 0.55, 0, 0));
  for (const sx of [1, -1]) pput(M.dark, place(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 12), sx * 0.122, 1.0, -0.6, 0, 0, Math.PI / 2));
  pput(M.helmStripe, place(new THREE.SphereGeometry(0.1295, 6, 14, Math.PI / 2 - 0.12, 0.24, 0, Math.PI * 0.6), 0, 0.97, -0.665, 0.12, 0, 0, 1, 1.05, 1.12));
  pput(M.visor, place(new THREE.SphereGeometry(0.133, 20, 10, -Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.32, Math.PI * 0.2), 0, 0.97, -0.66, 0, 0, 0, 1, 1.04, 1.12));
  limb([0.124, 0.93, -0.63], [0.06, 0.89, -0.535], 0.0055, M.gloss);
  pput(M.gloss, place(new THREE.SphereGeometry(0.014, 10, 8), 0.05, 0.885, -0.53));
  PT = PB;
  {
    const c = new THREE.CatmullRomCurve3([[0, 0.94, -0.8], [0.06, 0.82, -0.86], [0.17, 0.6, -0.87], [0.24, 0.36, -0.86]].map((v) => new THREE.Vector3(...v)));
    pput(M.rubber, new THREE.TubeGeometry(c, 20, 0.02, 8, false));
    for (let i = 1; i < 12; i++) {
      const g = new THREE.TorusGeometry(0.021, 0.004, 4, 10);
      g.applyMatrix4(new THREE.Matrix4().compose(c.getPoint(i / 12),
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), c.getTangent(i / 12)), new THREE.Vector3(1, 1, 1)));
      pput(M.rubber, g);
    }
  }
  // Upper arms (static); forearms + gloves ride on the stick and the throttle.
  limb(T(-0.19, 0.69, 0), [-0.2, 0.52, -0.45], 0.047, M.suit);
  limb(T(0.19, 0.69, 0), elbowL, 0.047, M.suit);
  // Thighs on the cushion, knees, shins to the pedals, boots; kneeboard on
  // the right thigh.
  for (const sx of [1, -1]) {
    limb([sx * 0.1, 0.18, -0.55], [sx * 0.13, 0.3, -0.13], 0.068, M.suit);
    pput(M.suit, place(new THREE.SphereGeometry(0.06, 12, 10), sx * 0.13, 0.3, -0.13));
    limb([sx * 0.13, 0.3, -0.13], [sx * 0.17, -0.06, 0.33], 0.052, M.suit);
    pput(M.glove, place(new RoundedBoxGeometry(0.095, 0.085, 0.22, 2, 0.03), sx * 0.17, -0.1, 0.38));
  }
  pput(M.white, place(new RoundedBoxGeometry(0.13, 0.014, 0.19, 2, 0.005), -0.12, 0.365, -0.33, -0.28, 0, 0));
  for (const [mat, list] of PB) {
    const m = new THREE.Mesh(mergeGeometries(list.map((g) => tagged(g))), mat);
    pilot.add(m);
  }
  // Head on a neck pivot (looks into turns, along the boom; see Aircraft._animate).
  const head = new THREE.Group();
  head.position.set(0, 0.86, -0.67);
  for (const [mat, list] of HB) {
    const m = new THREE.Mesh(mergeGeometries(list.map((g) => tagged(g).translate(0, -0.86, 0.67))), mat);
    head.add(m);
  }
  pilot.add(head);
  pilot.head = head;
  const S0 = new THREE.Vector3(0, -0.22, -0.12), T0 = new THREE.Vector3(0.415, 0.5, 0.05);
  const rel = (p, o) => [p[0] - o.x, p[1] - o.y, p[2] - o.z];
  const handR = new THREE.Group(), handL = new THREE.Group();
  capsule(rel([-0.2, 0.52, -0.45], S0), rel([-0.02, 0.42, -0.14], S0), 0.042, M.suit, handR);
  capsule(rel([-0.05, 0.44, -0.2], S0), rel([-0.02, 0.425, -0.15], S0), 0.046, M.glove, handR); // gauntlet
  const gR = new THREE.Mesh(new THREE.SphereGeometry(0.042, 14, 10), M.glove);
  gR.position.set(...rel([-0.01, 0.42, -0.11], S0));
  gR.scale.set(1, 1.2, 0.9);
  handR.add(gR);
  stick.add(handR);
  capsule(rel(elbowL, new THREE.Vector3(...throttleAt)), rel([0.41, 0.64, 0.0], T0), 0.042, M.suit, handL);
  capsule(rel([0.39, 0.62, -0.06], T0), rel([0.41, 0.64, 0.0], T0), 0.046, M.glove, handL);
  const gL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 10), M.glove);
  gL.position.set(...rel([0.415, 0.67, 0.04], T0));
  handL.add(gL);
  throttle.add(handL);
  pilot.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // The camera rig hides the pilot in the cockpit view; the hands ride on the
  // controls, so they follow the pilot's visibility.
  {
    let vis = true;
    Object.defineProperty(pilot, 'visible', { get: () => vis, set: (v) => { vis = v; handR.visible = v; handL.visible = v; } });
  }

  return pilot;
}

// Soft contact shadow (ambient occlusion on the ground under the aircraft):
// a blurred planform decal laid on the terrain, fading with height. Visual only.
// The default planform is the PR-AGW's; other aircraft pass their own.
const SHADOW_PR_AGW = { W: 13, L: 9, wing: [5.9, -0.85, 0.85], fus: [0.55, -0.95, 3.7], tail: [1.92, -4.3, -3.42], core: [4.2, 2.6] };
export function createContactShadow(P = SHADOW_PR_AGW) {
  const S = 256, W = P.W, L = P.L;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const px = (x) => ((x + W / 2) / W) * S, pz = (z) => ((z + L / 2) / L) * S;
  g.filter = 'blur(9px)';
  g.fillStyle = 'rgba(0,0,0,0.9)';
  g.fillRect(px(-P.wing[0]), pz(P.wing[1]), px(P.wing[0]) - px(-P.wing[0]), pz(P.wing[2]) - pz(P.wing[1])); // wing
  g.beginPath(); g.ellipse(px(0), pz(P.fus[1]), (P.fus[0] / W) * S, (P.fus[2] / L) * S, 0, 0, Math.PI * 2); g.fill(); // fuselage
  g.fillRect(px(-P.tail[0]), pz(P.tail[1]), px(P.tail[0]) - px(-P.tail[0]), pz(P.tail[2]) - pz(P.tail[1])); // tailplane
  g.filter = 'blur(22px)';
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.beginPath(); g.ellipse(px(0), pz(0), (P.core[0] / W) * S, (P.core[1] / L) * S, 0, 0, Math.PI * 2); g.fill();
  const geo = new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: canvasTexture(c), transparent: true, opacity: 0, depthWrite: false, color: 0xffffff });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  m.frustumCulled = false;
  return m;
}


// Geometry and texture helpers shared with the other aircraft models.
export { sampleStations, ring, loft, K, airfoil, wingPanel, flipWinding, tagged, shade, tx, rod, tube, bar, ball, rbox, lathe, patch, patchEdge, grid, speckle, orangePeel, treadTexture, propDiscTexture, ribTexture, feltTexture, WING_SPAN_UV };
