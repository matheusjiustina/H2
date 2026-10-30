// Procedural Robinson R44 Raven II in an agricultural configuration, own
// markings (PR-AGH, AGRO WINGS). VISUAL ONLY: the physics (FLIGHT_R44 and
// src/flight/heliModel.js), the skid contact points and the hard points are
// read here only to place parts; nothing here feeds back into the flight.
// Body frame: +Z nose, +Y up, +X left; origin = CG, under the main-rotor mast.
//
// Construction (shared helpers from model.js): the cabin is one lofted
// bubble whose triangles are split into paint and glass by the window
// outlines (two-piece windshield with a centre post, four door windows),
// with rubber seals along every outline and a dark inner shell; a mast
// fairing on the roof, an aft body with the open engine bay (flat-six,
// cooling scroll, exhaust, steel tube frame), the tail cone, fins, the
// horizontal stabiliser, a guarded two-blade tail rotor on the left side,
// skids on arched cross tubes, and the ag kit: belly tank, pump, an 8 m boom
// with 28 nozzles. The two-blade teetering main rotor turns counter-clockwise
// seen from above, cones with rotor speed, tilts with the simulated
// tip-path plane and is drawn with a speed-dependent motion-blur sector
// (not a permanent disc); the tail rotor turns with its advancing blade at
// the bottom. Cockpit: pedestal console with a live panel texture, T-bar
// cyclic, collective and pedals moved by the simulation, four seats and the
// shared seated pilot (right seat, hands on cyclic and collective).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { rng, clamp, smoothstep, lerp } from '../core/math.js';
import { FLIGHT_R44 } from '../config.js';
import { sampleStations, ring, loft, K, airfoil, wingPanel, tagged, tx, rod, tube, ball, rbox, lathe, orangePeel, ribTexture, buildPilot } from './model.js';
import { POD_OUT } from './r44Panel.js';
import { createR44Instruments } from './r44Cockpit.js';

const A = FLIGHT_R44;
const R = A.rotor, TR = A.tailRotor;
const GROUND = A.skids[0][1]; // skid bottom
const RED = '#b5141c';
const GRAPHITE = '#2b2e33';
const WHITE = '#f1f1ec';
// Paint schemes (one model, only the livery canvas and three colours change):
// A — the original red and graphite with white pinstripes; B — Black
// Agricultural: deep black with fine gold pinstripes along the belt line and
// the tail cone, the type name on the aft cabin and the marks in gold (after
// the black-and-gold agricultural R44s of the reference photographs).
const GOLD = '#c9a24a';
export const R44_LIVERIES = [
  { id: 'A', base: RED, belly: GRAPHITE, pin: WHITE, tail: GRAPHITE, text: WHITE, marks: WHITE, seam: 'rgba(40,0,0,0.45)', paint: RED, cross: RED },
  { id: 'B', base: '#0f1012', belly: '#0f1012', pin: GOLD, tail: '#0f1012', text: '#d8d6cf', marks: GOLD, seam: 'rgba(120,120,125,0.35)', paint: '#121315', cross: '#141517', gold: true },
];
// Seated pilot: the shared pilot (PR-AGW frame) moved into the right seat.
const OFF = new THREE.Vector3(-0.29, -0.54, 1.6);
const o3 = (x, y, z) => [x + OFF.x, y + OFF.y, z + OFF.z];
const THR = [0.25, 0.13, -0.29]; // collective grip (left hand), PR-AGW frame
const ELBOW_L = [0.32 + (THR[0] - 0.415) * 0.6, 0.56 + (THR[1] - 0.5) * 0.6, -0.4 + (THR[2] - 0.05) * 0.6];
const COLL_PIVOT = [0.25, -0.02, -0.95]; // collective pivot, PR-AGW frame
const TAIL_HUB = new THREE.Vector3(0.32, TR.height, -TR.arm);
const BOOM = { half: 4.0, y: -1.16, z: 0.6 };

// Ground shadow planform for createContactShadow().
export const R44_SHADOW = { W: 10, L: 13, wing: [4.0, 0.52, 0.68], fus: [0.66, 0.9, 1.75], tail: [0.62, -5.22, -4.78], core: [1.6, 2.6] };

// ==========================================================================
// Stations K(z, half-width, shoulder y, bottom y, top y, pU, pL).
// Cabin: 1.28 m outside at the doors (R44 data; was 1.39), the lower nose
// fuller (flatter bottom corners) so the pedals stay inside the bubble.
const CAB_KEYS = [
  // Nose: a blunt three-dimensional bubble (no pointed tip), its foremost
  // point low, the underside rounding up into it (after the side photo of
  // a black R44 II on the ramp).
  K(2.57, 0.13, -0.26, -0.4, -0.1, 2.2, 2.2), K(2.53, 0.31, -0.27, -0.56, 0.08, 2.3, 2.6),
  K(2.45, 0.45, -0.27, -0.7, 0.27, 2.5, 3.4), K(2.3, 0.54, -0.25, -0.79, 0.44, 2.7, 4.3),
  K(2.1, 0.59, -0.21, -0.84, 0.57, 3.0, 4.7), K(1.85, 0.615, -0.17, -0.86, 0.65, 3.2, 4.5),
  K(1.55, 0.63, -0.13, -0.87, 0.71, 3.5, 4.6), K(1.05, 0.639, -0.1, -0.87, 0.75, 3.7, 4.3),
  K(0.55, 0.639, -0.08, -0.87, 0.765, 3.8, 4.3), K(0.05, 0.63, -0.06, -0.86, 0.77, 3.7, 4.2),
  K(-0.3, 0.607, -0.03, -0.83, 0.77, 3.4, 3.9), K(-0.52, 0.57, 0.0, -0.79, 0.77, 3.0, 3.5),
];
// Aft body (engine compartment), closed: its top carries the cabin roof
// line back to the tail cone, its underside sweeps up to the cone's root;
// the cooling-air outlet is the open lower rear (as on the real aircraft).
const AFT_KEYS = [
  K(-0.52, 0.57, 0.0, -0.79, 0.79, 3.0, 3.5), K(-0.9, 0.54, 0.02, -0.75, 0.8, 3.0, 3.2),
  K(-1.3, 0.48, 0.08, -0.6, 0.78, 2.8, 2.8), K(-1.7, 0.36, 0.2, -0.32, 0.74, 2.5, 2.4),
  K(-2.15, 0.215, 0.44, 0.225, 0.655, 2.2, 2.2),
];
// Mast fairing: the R44's tall tapered tower behind the cabin roof, front
// edge raked back, rear edge raked forward, up to just under the
// swashplate (side profile after the reference photographs).
const TOWER = { y0: 0.7, y1: 1.4, front: [0.32, 0.15], rear: [-0.9, -0.22], hw: [0.29, 0.125] };
const TC0 = -2.15, TC1 = -6.1;
const tcAt = (z) => { const t = clamp((TC0 - z) / (TC0 - TC1), 0, 1); return { r: lerp(0.215, 0.085, t), y: lerp(0.44, 0.6, t) }; };

// Window outlines in the side projection (z, y), same on both sides.
const zA = (y) => 1.42 + 0.622 * (0.7 - y); // A-pillar (windshield side edge)
const WS_BOTTOM = -0.3, WS_TOP_Z = 1.42;
function roundPoly(pts, r = 0.07, n = 4) {
  // Rounded corners (cut and arc) for a closed outline.
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length];
    const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const rr = Math.min(r, da * 0.45, db * 0.45);
    const pa = [p[0] + ((a[0] - p[0]) / da) * rr, p[1] + ((a[1] - p[1]) / da) * rr];
    const pb = [p[0] + ((b[0] - p[0]) / db) * rr, p[1] + ((b[1] - p[1]) / db) * rr];
    for (let k = 0; k <= n; k++) {
      const t = k / n, u = 1 - t;
      out.push([u * u * pa[0] + 2 * u * t * p[0] + t * t * pb[0], u * u * pa[1] + 2 * u * t * p[1] + t * t * pb[1]]);
    }
  }
  return out;
}
// Front door window: its lower edge falls toward the A-pillar, corners on
// generous radii (the R44's curved glazing, not a rectangle).
const FRONT_WIN = roundPoly([[1.0, -0.26], [zA(-0.34) - 0.08, -0.34], [zA(0.64) - 0.08, 0.64], [1.0, 0.64]], 0.11);
// Rear door window: aft upper corner swept on a large radius, as on the R44.
const REAR_WIN = roundPoly([
  [0.12, -0.26], [0.88, -0.26], [0.88, 0.62], [0.38, 0.62],
  ...[0.25, 0.5, 0.75].map((t) => [0.38 - 0.26 * Math.sin((t * Math.PI) / 2), 0.36 + 0.26 * Math.cos((t * Math.PI) / 2)]),
  [0.12, 0.36],
], 0.09);
// Glazing regions as intersections of half-spaces a·x + b·y + c·z + d >= 0
// (window outlines are lines in the side view, i.e. planes containing X), so
// the skin is cut exactly along them.
const zAPlane = [0, 0.622, 1, -(1.42 + 0.622 * 0.7)]; // z >= zA(y)
// Lower edge: from the A-pillar's foot it runs down and forward into the
// lower nose (the R44's deep two-piece bubble; a short painted chin below).
const WS_FOOT_Z = 1.42 + 0.622 * (0.7 - WS_BOTTOM), WS_DROP = 0.45;
const WS_REGION = (sx) => [zAPlane, [0, 0, 1, -WS_TOP_Z], [0, 1, WS_DROP, -(WS_BOTTOM + WS_DROP * WS_FOOT_Z)], [0, -1, 0, 0.72], [sx, 0, 0, -0.014]];
function polyRegion(P, sx) {
  let cz = 0, cy = 0;
  for (const [z, y] of P) { cz += z / P.length; cy += y / P.length; }
  const out = [[sx, 0, 0, -0.3]];
  for (let i = 0; i < P.length; i++) {
    const [z1, y1] = P[i], [z2, y2] = P[(i + 1) % P.length];
    const l = Math.hypot(z2 - z1, y2 - y1);
    if (l < 1e-5) continue;
    let nz = -(y2 - y1) / l, ny = (z2 - z1) / l;
    if (nz * (cz - z1) + ny * (cy - y1) < 0) { nz = -nz; ny = -ny; }
    out.push([0, ny, nz, -(nz * z1 + ny * y1)]);
  }
  return out;
}
const WS_BOTTOM_AT = (z) => WS_BOTTOM - WS_DROP * Math.max(0, z - WS_FOOT_Z);

// Half-width of a station at height y (inverse of model.js ring()).
function halfWidthAt(s, y) {
  if (y >= s.ys) {
    const f = clamp((y - s.ys) / Math.max(1e-4, s.yt - s.ys), 0, 1);
    const sn = f ** (s.pU / 2);
    return s.hw * Math.sqrt(Math.max(0, 1 - sn * sn)) ** (2 / s.pU);
  }
  const f = clamp((s.ys - y) / Math.max(1e-4, s.ys - s.yb), 0, 1);
  const sn = f ** (s.pL / 2);
  return s.hw * Math.sqrt(Math.max(0, 1 - sn * sn)) ** (2 / s.pL);
}
function stationAt(list, z) {
  if (z >= list[0].z) return list[0];
  for (let i = 1; i < list.length; i++) {
    if (z >= list[i].z) {
      const a = list[i - 1], b = list[i], t = (z - a.z) / (b.z - a.z), s = {};
      for (const k of ['z', 'hw', 'ys', 'yb', 'yt', 'pU', 'pL']) s[k] = lerp(a[k], b[k], t);
      return s;
    }
  }
  return list[list.length - 1];
}

// Triangle soup of a lofted surface (vertices: position, normal, colour).
function soupOf(g) {
  const pos = g.attributes.position, nor = g.attributes.normal, col = g.attributes.color, idx = g.index.array;
  const tris = [];
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [];
    for (let k = 0; k < 3; k++) {
      const v = idx[t + k];
      tri.push([pos.getX(v), pos.getY(v), pos.getZ(v), nor.getX(v), nor.getY(v), nor.getZ(v), col.getX(v), col.getY(v), col.getZ(v)]);
    }
    tris.push(tri);
  }
  return tris;
}
const hsEval = (h, v) => h[0] * v[0] + h[1] * v[1] + h[2] * v[2] + h[3];
function clipPoly(poly, h, keepIn) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = hsEval(h, a) * (keepIn ? 1 : -1), db = hsEval(h, b) * (keepIn ? 1 : -1);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      out.push(a.map((x, k) => x + (b[k] - x) * t));
    }
  }
  return out;
}
const fan = (poly, list) => { for (let k = 1; k < poly.length - 1; k++) list.push([poly[0], poly[k], poly[k + 1]]); };
// Split a soup by a convex region (half-space list): { inn, out }, cut exactly.
function splitSoup(tris, region) {
  const inn = [], out = [];
  for (const tri of tris) {
    let allIn = true, allOut = false;
    for (const h of region) {
      const d0 = hsEval(h, tri[0]), d1 = hsEval(h, tri[1]), d2 = hsEval(h, tri[2]);
      if (d0 < 0 || d1 < 0 || d2 < 0) allIn = false;
      if (d0 < 0 && d1 < 0 && d2 < 0) { allOut = true; break; }
    }
    if (allOut) { out.push(tri); continue; }
    if (allIn) { inn.push(tri); continue; }
    let rem = tri;
    for (const h of region) {
      const o = clipPoly(rem, h, false);
      if (o.length >= 3) fan(o, out);
      rem = clipPoly(rem, h, true);
      if (rem.length < 3) break;
    }
    if (rem.length >= 3) fan(rem, inn);
  }
  return { inn, out };
}
function soupGeo(tris) {
  const p = [], n = [], c = [];
  for (const tri of tris) for (const v of tri) {
    const l = Math.hypot(v[3], v[4], v[5]) || 1;
    p.push(v[0], v[1], v[2]); n.push(v[3] / l, v[4] / l, v[5] / l); c.push(v[6], v[7], v[8]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((p.length / 3) * 2), 2));
  return g;
}

// Inner skin of a shell: pushed in along the normal, winding reversed.
function innerShell(geo, d = 0.012) {
  const p = geo.attributes.position.array, n = geo.attributes.normal.array;
  const P = new Float32Array(p.length), N = new Float32Array(n.length);
  for (let i = 0; i < p.length; i += 9) {
    for (const [dst, src] of [[0, 0], [1, 2], [2, 1]]) {
      for (let a = 0; a < 3; a++) {
        P[i + dst * 3 + a] = p[i + src * 3 + a] - n[i + src * 3 + a] * d;
        N[i + dst * 3 + a] = -n[i + src * 3 + a];
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((P.length / 3) * 2), 2));
  return g;
}

// ==========================================================================
// Livery: side projection (z, y); top half = left side (nose to the left),
// bottom half = right side (nose to the right).
const LV = { Z0: -6.75, Z1: 2.6, Y0: -1.0, Y1: 1.5, W: 2048, H: 1024, M: 6 };
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

function liveryTextures(reg, scheme = 0) {
  const L = R44_LIVERIES[scheme] ?? R44_LIVERIES[0];
  const c = canvas(LV.W, LV.H), b = canvas(LV.W, LV.H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  gb.fillStyle = '#808080';
  gb.fillRect(0, 0, LV.W, LV.H);
  orangePeel(gb, LV.W, LV.H, 44);
  for (const side of [1, -1]) {
    const P = (z, y) => lvPix(side, z, y);
    const oy = side > 0 ? 0 : LV.H / 2;
    const path = (ctx, pts) => {
      ctx.beginPath();
      pts.forEach(([z, y], i) => { const [px, py] = P(z, y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    };
    const poly = (pts, fill) => { path(g, pts); g.closePath(); g.fillStyle = fill; g.fill(); };
    const line = (ctx, pts, col, w) => { path(ctx, pts); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
    g.fillStyle = L.base;
    g.fillRect(0, oy, LV.W, LV.H / 2);
    // Graphite belly band with a white pinstripe, sweeping up at the nose.
    const belt = [[2.65, -0.26], [2.3, -0.4], [1.8, -0.5], [0.9, -0.54], [-0.55, -0.54], [-0.6, -0.54]];
    poly([...belt, [-0.6, -1.0], [2.65, -1.0]], L.belly);
    line(g, belt.map(([z, y]) => [z, y + 0.03]), L.pin, 0.022 * LV.ky);
    if (L.gold) {
      // Gold band from the nose along the lower cabin, rising along the
      // engine cowling (PR-TOS), a fine line above it.
      const band = [[2.6, -0.21], [2.3, -0.35], [1.8, -0.44], [0.9, -0.48], [-0.55, -0.47], [-1.2, -0.38], [-1.75, -0.2], [-2.05, 0.05]];
      line(g, band, L.pin, 0.045 * LV.ky);
      line(g, band.map(([z, y]) => [z, y + 0.045]), L.pin, 0.008 * LV.ky);
    }
    // Tail cone: graphite and white pinstripes along its side.
    const tl = [];
    for (let z = TC0 + 0.2; z >= TC1 + 0.05; z -= 0.25) tl.push([z, tcAt(z).y - 0.05 * (tcAt(z).r / 0.215)]);
    line(g, tl, L.tail, 0.05 * LV.ky);
    line(g, tl.map(([z, y]) => [z, y - 0.045]), L.pin, 0.014 * LV.ky);
    if (L.gold) line(g, tl.map(([z, y]) => [z, y + 0.03]), L.pin, 0.006 * LV.ky);
    // Upper cowl: dark louvres (engine air) and the fuel placard.
    for (let k = 0; k < 6; k++) {
      const z = -0.95 - k * 0.07;
      const [x0, y0] = P(z, 0.52), [, y1] = P(z, 0.36);
      g.fillStyle = 'rgba(15,15,15,0.85)'; g.fillRect(x0 - 3, y0, 6, y1 - y0);
      gb.fillStyle = '#303030'; gb.fillRect(x0 - 3, y0, 6, y1 - y0);
    }
    // Lettering.
    const text = (str, z, y, hM, col, font = 'bold', spacing = 0) => {
      const [px, py] = P(z, y);
      g.save();
      g.fillStyle = col;
      g.font = `${font} ${Math.round(hM * LV.ky)}px Arial`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      if (spacing) g.letterSpacing = `${spacing}px`;
      g.fillText(str, px, py);
      g.restore();
    };
    if (L.gold) {
      text('R44', -0.95, 0.18, 0.17, L.text, 'bold italic', 2);
      text('RAVEN II', -0.95, 0.04, 0.045, L.marks, 'bold', 3);
      text('AGRO WINGS', -1.2, 0.62, 0.07, L.marks, 'bold', 3);
    } else text('AGRO WINGS', -1.2, 0.66, 0.11, L.text, 'bold', 3);
    text(reg, -3.45, tcAt(-3.45).y + 0.07, 0.17, L.marks, 'bold', 4);
    text('PERIGO · ROTOR DE CAUDA', -5.25, tcAt(-5.25).y + 0.06, 0.035, L.text);
    text('AVGAS 100LL', -0.86, 0.48, 0.03, L.text);
    // Brazilian flag on the tail cone.
    {
      const [fx, fy] = P(-4.55, tcAt(-4.55).y + 0.1);
      const w = 0.2 * LV.kx, h = 0.13 * LV.ky;
      g.fillStyle = '#1a8a3a'; g.fillRect(fx - w / 2, fy - h / 2, w, h);
      g.fillStyle = '#f6cf2a';
      g.beginPath(); g.moveTo(fx - w * 0.42, fy); g.lineTo(fx, fy - h * 0.42); g.lineTo(fx + w * 0.42, fy); g.lineTo(fx, fy + h * 0.42); g.closePath(); g.fill();
      g.fillStyle = '#1f3c8a'; g.beginPath(); g.arc(fx, fy, h * 0.24, 0, Math.PI * 2); g.fill();
    }
    // Door outlines, cowl panels, tail-cone rivet rings: seams in the bump.
    const yr = 0.74;
    const frontDoor = [[0.96, -0.6], [0.96, yr], [zA(yr) - 0.03, yr], ...[0.6, 0.3, 0, -0.3].map((y) => [zA(y) - 0.03, y]), [zA(-0.3) - 0.12, -0.6]];
    const rearDoor = [[0.9, -0.6], [0.9, yr], [0.3, yr], [0.1, 0.62], [0.02, 0.45], [0.02, -0.6]];
    const seams = [
      [...frontDoor, frontDoor[0]], [...rearDoor, rearDoor[0]],
      // Cowling: its forward seam, the access door, the upper cowl line.
      [[-0.55, -0.7], [-0.55, 0.78]], [[-0.75, -0.55], [-0.75, 0.5], [-1.45, 0.5], [-1.45, -0.4]], [[-0.62, 0.62], [-1.9, 0.58]], [[-1.7, 0.1], [-1.7, 0.72]],
    ];
    for (let z = TC0 - 0.1; z > TC1; z -= 0.5) { const t = tcAt(z); seams.push([[z, t.y - t.r], [z, t.y + t.r]]); }
    for (const s of seams) {
      line(g, s, L.seam, 2);
      line(gb, s, '#3a3a3a', 2.6);
    }
    for (let z = TC0 - 0.1; z > TC1; z -= 0.5) {
      const t = tcAt(z);
      for (let y = t.y - t.r * 0.95; y < t.y + t.r * 0.95; y += 0.035) {
        for (const dz of [0.02, -0.02]) {
          const [px, py] = P(z + dz, y);
          gb.fillStyle = '#5a5a5a'; gb.beginPath(); gb.arc(px, py, 1.3, 0, Math.PI * 2); gb.fill();
        }
      }
    }
    // Exhaust soot on the aft lower body, scuffed paint at the doors.
    const [scx, scy] = P(-1.9, -0.1);
    const soot = g.createRadialGradient(scx, scy, 4, scx, scy, 120);
    soot.addColorStop(0, 'rgba(20,16,14,0.35)'); soot.addColorStop(1, 'rgba(20,16,14,0)');
    g.fillStyle = soot; g.fillRect(scx - 130, scy - 130, 260, 260);
    const r = rng(side > 0 ? 7 : 8);
    for (let i = 0; i < 160; i++) {
      const [px, py] = P(0.1 + r() * 1.9, -0.55 + r() * 0.25);
      g.fillStyle = `rgba(210,190,170,${0.05 + r() * 0.08})`; g.fillRect(px, py, 1 + r() * 3, 1);
    }
  }
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 4 }) };
}

// ==========================================================================
// Motion-blurred rotor sector: a lit, fogged standard material whose alpha
// is the smeared blade coverage behind each blade over one frame's exposure
// (uBlur = rotor speed x exposure, in radians). At low rotor speed the trail
// is short and the solid blades carry the look; at speed the blades fade and
// only the faint, flickering sectors remain — no permanent opaque disc.
function blurMaterial(color, { blades, chord, dir, plane, envMap, radius }) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.2, transparent: true, depthWrite: false, side: THREE.DoubleSide, envMap: envMap ?? null, envMapIntensity: 0.4 });
  const u = { uAngle: { value: 0 }, uBlur: { value: 0 }, uOpacity: { value: 0 }, uCone: { value: 0 } };
  m.userData.u = u;
  const period = ((Math.PI * 2) / blades).toFixed(6);
  const phi = plane === 'xz' ? 'atan(-vLocal.z, vLocal.x)' : 'atan(vLocal.z, vLocal.y)';
  const rad = plane === 'xz' ? 'length(vLocal.xz)' : 'length(vLocal.yz)';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;\nuniform float uCone;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvLocal = position;\n${plane === 'xz' ? 'transformed.y += length(position.xz) * uCone;' : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;\nuniform float uAngle;\nuniform float uBlur;\nuniform float uOpacity;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float r = ${rad};
          float period = ${period};
          float B = clamp(uBlur, 0.02, period);
          float d = mod(${dir > 0 ? `uAngle - ${phi}` : `${phi} - uAngle`}, period);
          // Smeared coverage, weighted toward the blade (perceived darker than
          // the exposure average), plus the faint persistence of the swept disc.
          float dens = clamp(1.8 * ${chord.toFixed(4)} / max(r, 0.05) / B, 0.0, 1.0);
          float a = d < B ? dens * (0.55 + 0.9 * (1.0 - d / B)) : 0.0;
          a += 0.06 * smoothstep(0.35, 0.9, uBlur) * (1.0 - smoothstep(0.85, 1.0, r / ${(radius ?? (plane === 'xz' ? 5.03 : 0.737)).toFixed(3)}) * 0.5);
          diffuseColor.a *= clamp(a, 0.0, 0.85) * uOpacity;
        }`);
  };
  m.customProgramCacheKey = () => `rotorblur-${plane}-${blades}-${dir}-${radius ?? ''}`;
  return m;
}

// Rotor blade along +X (leading edge toward -Z), quarter chord on the pitch
// axis, linear twist (rad, + = leading edge up) from root to tip.
function bladeGeo(r0, r1, chord, thick, tw0, tw1, n = 28, prof = airfoil(0, 1, thick, 0, 0.4, 12)) {
  const pos = [], idx = [];
  const m = prof.length;
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = r0 + (r1 - r0) * u, tw = lerp(tw0, tw1, u);
    const c = typeof chord === 'function' ? chord(u) : chord;
    const cs = Math.cos(tw), sn = Math.sin(tw);
    for (const [xc, yc] of prof) {
      const z = (xc - 0.25) * c, y = yc * c;
      pos.push(x, y * cs - z * sn, y * sn + z * cs);
    }
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < m - 1; k++) {
    const a = i * m + k, b = a + 1, c = a + m, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  for (const i of [0, n]) for (let k = 1; k < m - 2; k++) idx.push(i * m, i * m + k, i * m + k + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Grey cabin carpet: dense random tufts, tiled.
function carpetTexture() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#3c3f43';
  g.fillRect(0, 0, 256, 256);
  const r = rng(23);
  for (let i = 0; i < 9000; i++) {
    const v = 38 + Math.floor(r() * 46);
    g.fillStyle = `rgba(${v},${v + 2},${v + 5},0.55)`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 1.6, 1 + r() * 1.6);
  }
  return canvasTexture(c, { repeat: true });
}

// Yellow warning placard on the cyclic pivot.
function placardTexture() {
  const c = canvas(192, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#f2c400'; g.fillRect(0, 0, 192, 64);
  g.strokeStyle = '#111'; g.lineWidth = 3; g.strokeRect(3, 3, 186, 58);
  g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 15px Arial, sans-serif';
  g.fillText('LOW-G PUSHOVERS', 96, 22); g.fillText('PROHIBITED', 96, 43);
  return canvasTexture(c, { aniso: 4 });
}

// ==========================================================================
export function createR44Model(panel, opts = {}) {
  const root = new THREE.Group();
  root.name = 'r44';
  let reg = opts.reg ?? 'PR-AGH', scheme = 0;
  const liv = liveryTextures(reg, scheme);
  const coat = { roughness: 0.4, metalness: 0.0, specularIntensity: 0.35, clearcoat: 0.3, clearcoatRoughness: 0.22, envMap: opts.envMap ?? null, envMapIntensity: 0.35 };
  const ALB = 0.86;
  const M = {
    livery: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALB), map: liv.map, bumpMap: liv.bump, bumpScale: 1.3, vertexColors: true, ...coat }),
    paint: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(RED).multiplyScalar(ALB), vertexColors: true, ...coat }),
    skid: new THREE.MeshStandardMaterial({ color: 0xc6cacd, roughness: 0.3, metalness: 0.9, vertexColors: true }),
    cross: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(RED).multiplyScalar(ALB), vertexColors: true, ...coat }),
    graphite: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(GRAPHITE), vertexColors: true, ...coat }),
    seal: new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.75, metalness: 0.05, vertexColors: true }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.62, metalness: 0.1, vertexColors: true }),
    interior: new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.85, metalness: 0.05, side: THREE.FrontSide }),
    floor: new THREE.MeshStandardMaterial({ color: 0xffffff, map: carpetTexture(), roughness: 0.97, metalness: 0, vertexColors: true }),
    satin: new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.42, metalness: 0.35, vertexColors: true }),
    seat: new THREE.MeshStandardMaterial({ color: 0xffffff, map: ribTexture('#30343a', 'rgba(5,8,12,0.55)'), roughness: 0.88, vertexColors: true }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc6cacd, roughness: 0.3, metalness: 0.9, vertexColors: true }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe4e7ea, roughness: 0.12, metalness: 1.0, envMap: opts.envMap ?? null, envMapIntensity: 0.9 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.45, metalness: 0.75, vertexColors: true }),
    frame: new THREE.MeshStandardMaterial({ color: 0x9a9da0, roughness: 0.55, metalness: 0.4, vertexColors: true }),
    engine: new THREE.MeshStandardMaterial({ color: 0x3b3f44, roughness: 0.55, metalness: 0.55, vertexColors: true }),
    exhaust: new THREE.MeshStandardMaterial({ color: 0x7d736a, roughness: 0.45, metalness: 0.85, vertexColors: true }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.94, metalness: 0, vertexColors: true }),
    gloss: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.28, metalness: 0.1, vertexColors: true }),
    blade: new THREE.MeshStandardMaterial({ color: 0x33373b, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide, envMap: opts.envMap ?? null, envMapIntensity: 0.5 }),
    tblade: new THREE.MeshStandardMaterial({ color: 0xd9dbdc, roughness: 0.45, metalness: 0.3, side: THREE.DoubleSide }),
    tank: new THREE.MeshStandardMaterial({ color: 0xe6e3da, roughness: 0.62, metalness: 0.0, vertexColors: true }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb8913c, roughness: 0.35, metalness: 0.9, vertexColors: true }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xaec2c9, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.02, envMap: opts.envMap ?? null, envMapIntensity: 1.5, depthWrite: false, side: THREE.DoubleSide }),
    tint: new THREE.MeshPhysicalMaterial({ color: 0x4f7d6a, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.32, clearcoat: 1, envMapIntensity: 1.4, depthWrite: false, side: THREE.DoubleSide }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.4, clearcoat: 1, depthWrite: false }),
    red: new THREE.MeshStandardMaterial({ color: 0xc8261b, roughness: 0.45, emissive: 0x330000 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xf2b400, roughness: 0.45 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35, emissive: 0x222222 }),
    beacon: new THREE.MeshStandardMaterial({ color: 0xd8261b, roughness: 0.3, emissive: 0xff2010, emissiveIntensity: 0 }),
    strobe: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.2, emissive: 0xffffff, emissiveIntensity: 0 }),
    navRed: new THREE.MeshStandardMaterial({ color: 0xc81f1a, roughness: 0.3, emissive: 0xff1a10, emissiveIntensity: 0 }),
    navGreen: new THREE.MeshStandardMaterial({ color: 0x1f9a3a, roughness: 0.3, emissive: 0x10ff40, emissiveIntensity: 0 }),
    suit: new THREE.MeshStandardMaterial({ color: 0x3f4a5a, roughness: 0.88 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.75 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xb88462, roughness: 0.7 }),
    helmet: new THREE.MeshPhysicalMaterial({ color: 0xeeeae2, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x15181c, roughness: 0.05, metalness: 0.3, clearcoat: 1 }),
    helmStripe: new THREE.MeshPhysicalMaterial({ color: 0xb8231b, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    harness: new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.8 }),
  };

  const B = {};
  const add = (mat, g, fine = false) => { const k = (fine ? 'fine:' : '') + mat; (B[k] ||= []).push(tagged(g)); };

  // ---------------- cabin bubble ----------------
  const cabSt = sampleStations(CAB_KEYS, 44);
  const cabAO = (x, y, z) => {
    let a = 1 - Math.max(0, -y - 0.45) * 0.45;
    if (z < -0.3) a *= 0.9;
    return clamp(a, 0.55, 1);
  };
  // The bubble (skin, glass, inner skin) is built twice: full resolution for
  // the near LOD, coarse beyond 40 m (same exact window cuts).
  const cabinShell = (st, around) => {
    let rest = soupOf(loft(st, around, cabAO));
    const glassTris = [];
    for (const sx of [1, -1]) {
      for (const region of [WS_REGION(sx), polyRegion(FRONT_WIN, sx), polyRegion(REAR_WIN, sx)]) {
        const sp = splitSoup(rest, region);
        glassTris.push(...sp.inn);
        rest = sp.out;
      }
    }
    const paint = liveryUV(soupGeo(rest));
    return { paint, glass: soupGeo(glassTris), inner: innerShell(paint, 0.014) };
  };
  const cabHi = cabinShell(cabSt, 128), cabLo = cabinShell(sampleStations(CAB_KEYS, 12), 36);
  // Rear bulkhead cap (cabin back wall).
  const capShape = (st, n = 40) => {
    const pts = ring(st, n).map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.ShapeGeometry(new THREE.Shape(pts));
  };
  const lastCab = cabSt[cabSt.length - 1];
  add('livery', liveryUV(tagged(tx(capShape(lastCab), 0, 0, lastCab.z, 0, Math.PI, 0))));
  // Window seals and the centre post (rubber), on the skin.
  const surf = (list, z, y, sx, off = 0.006) => [sx * (halfWidthAt(stationAt(list, z), y) + off), y, z];
  const seal = (pts, r = 0.016) => add('seal', tube(pts, r, Math.max(8, pts.length * 2), 6));
  for (const sx of [1, -1]) {
    for (const W of [FRONT_WIN, REAR_WIN]) seal([...W, W[0]].map(([z, y]) => surf(cabSt, z, y, sx)), 0.014);
    // A-pillar edges (windshield side and front door window front).
    const ap = [];
    for (let y = 0.7; y >= WS_BOTTOM - 0.001; y -= 0.04) ap.push(surf(cabSt, zA(y), y, sx));
    seal(ap, 0.018);
    // Windshield bottom edge round to the nose.
    const wb = [];
    for (let z = zA(WS_BOTTOM); z <= 2.6; z += 0.02) {
      const s = stationAt(cabSt, z), y = WS_BOTTOM_AT(z);
      if (s.yb > y || s.z < z - 0.05) break;
      wb.push(surf(cabSt, z, y, sx));
    }
    seal(wb, 0.016);
  }
  // Windshield top edge across the roof.
  {
    const s = stationAt(cabSt, WS_TOP_Z);
    const pts = ring(s, 64).filter(([, y]) => y >= 0.7).map(([x, y]) => [x * 1.01, y + 0.005, WS_TOP_Z]);
    seal(pts, 0.02);
    // Centre post and the compass on it.
    const cp = [];
    for (let z = WS_TOP_Z; z <= 2.52; z += 0.04) cp.push([0, stationAt(cabSt, z).yt + 0.006, z]);
    const tip = cabSt[0];
    for (let y = tip.yt; y >= tip.yb; y -= 0.03) cp.push([0, y, tip.z + 0.006]);
    // ...and back under the nose to the glass's lower edge.
    for (let z = tip.z - 0.02; z >= WS_FOOT_Z; z -= 0.03) {
      const st = stationAt(cabSt, z);
      if (st.yb < WS_BOTTOM_AT(z) - 0.01) break;
      cp.push([0, st.yb - 0.006, z]);
    }
    seal(cp, 0.018);
    add('dark', rbox(0.07, 0.06, 0.07, 0.015, 0, 0.66, 1.36));
    add('dark', rod([0, 0.7, 1.4], [0, 0.73, 1.33], 0.008, 6));
  }
  // Door handles, hinges and the step plates (fine detail).
  for (const sx of [1, -1]) {
    for (const [z, y] of [[1.08, -0.3], [0.1, -0.3]]) add('chrome', tx(new THREE.CapsuleGeometry(0.009, 0.07, 3, 8), sx * (halfWidthAt(stationAt(cabSt, z), y) + 0.014), y, z, Math.PI / 2), true);
    for (const y of [0.45, -0.4]) {
      add('dark', rbox(0.02, 0.06, 0.04, 0.006, sx * (halfWidthAt(stationAt(cabSt, zA(y) - 0.02), y) + 0.006), y, zA(y) - 0.02), true);
      add('dark', rbox(0.02, 0.06, 0.04, 0.006, sx * (halfWidthAt(stationAt(cabSt, 0.92), y) + 0.006), y, 0.92), true);
    }
  }
  // Landing lights in the lower nose, fresh-air vent.
  for (const sx of [0.1, -0.1]) {
    const st = stationAt(cabSt, 2.43);
    const y = -0.5, z = 2.43, x = sx;
    void st;
    add('chrome', tx(new THREE.TorusGeometry(0.04, 0.008, 6, 20), x, y, z + 0.035, -0.75));
    add('lens', tx(new THREE.CircleGeometry(0.04, 18), x, y + 0.002, z + 0.04, -0.75));
  }


  // ---------------- mast fairing (tower) ----------------
  {
    const NY = 18, NA = 40, T = TOWER, pos = [], idx = [];
    const ringAt = (t) => {
      const y = lerp(T.y0, T.y1, t), zf = lerp(T.front[0], T.front[1], t), zr = lerp(T.rear[0], T.rear[1], t ** 0.85);
      const hw = lerp(T.hw[0], T.hw[1], t ** 0.9), cz = (zf + zr) / 2, hl = (zf - zr) / 2;
      // Teardrop plan: full round nose, the tail drawn out behind the mast.
      return Array.from({ length: NA }, (_, i) => {
        const a = (i / NA) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
        const w = hw * (c >= 0 ? 1 : 1 - 0.55 * c * c) * Math.sign(sn) * Math.abs(sn) ** 0.85;
        return [w, y, cz + hl * c];
      });
    };
    for (let j = 0; j <= NY; j++) for (const p of ringAt(j / NY)) pos.push(...p);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NA; i++) {
      const a = j * NA + i, b = j * NA + ((i + 1) % NA), c = a + NA, d = b + NA;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    add('livery', liveryUV(tagged(g)));
    // Top deck round the mast, collar, the pitot on the tower's front.
    const top = ringAt(1).map(([x, , z]) => new THREE.Vector2(x, -z));
    add('livery', liveryUV(tagged(new THREE.ShapeGeometry(new THREE.Shape(top)).rotateX(-Math.PI / 2).translate(0, T.y1, 0))));
    add('dark', tx(new THREE.CylinderGeometry(0.075, 0.095, 0.04, 24), 0, T.y1 + 0.015, 0));
    add('steel', rod([0, 1.06, 0.22], [0, 1.08, 0.42], 0.007, 6), true);
    add('steel', rod([0, 1.03, 0.22], [0, 1.08, 0.24], 0.009, 6), true);
  }

  // ---------------- aft body + open engine bay ----------------
  const aftSt = sampleStations(AFT_KEYS, 26);
  const aftAO = (x, y, z) => clamp(1 - Math.max(0, 0.4 - y) * 0.35, 0.6, 1);
  // Cooling-air outlet: the skin of the lower rear (aft of z -1.5, under
  // y 0.2) is open; the dark inner skin and the engine show through it.
  const aftShell = (st, around) => {
    const paint = liveryUV(soupGeo(splitSoup(soupOf(loft(st, around, aftAO)), [[0, -1, 0, 0.2], [0, 0, -1, -1.5], [0, 0, 1, 2.02]]).out));
    return { paint, inner: innerShell(paint, 0.012) };
  };
  const aftHi = aftShell(aftSt, 64), aftLo = aftShell(sampleStations(AFT_KEYS, 8), 24);
  // Outlet rim (frame tube round the opening's edge).
  for (const sx of [1, -1]) {
    const rim = [];
    for (let z = -1.5; z >= -2.0; z -= 0.05) {
      const st = stationAt(aftSt, z);
      if (st.yb > 0.2) break;
      rim.push(surf(aftSt, z, Math.max(st.yb + 0.01, Math.min(0.2, st.ys)), sx, -0.004));
    }
    if (rim.length > 1) add('frame', tube(rim, 0.012, 12, 6));
  }
  // Lycoming flat-six: crankcase, finned cylinders, sump, cooling scroll
  // (the fan housing ahead of the engine), exhaust to the muffler and the
  // tailpipe under the tail-cone root, alternator, oil cooler.
  {
    const ex = (g) => add('engine', g);
    ex(rbox(0.36, 0.28, 0.72, 0.05, 0, -0.18, -1.18));
    ex(rbox(0.3, 0.12, 0.5, 0.04, 0, -0.38, -1.2));
    for (const sx of [1, -1]) {
      for (let k = 0; k < 3; k++) {
        const z = -0.92 - k * 0.2 - (sx > 0 ? 0 : 0.09);
        // (inside the closed cowling; seen through the outlet)
        const cyl = new THREE.CylinderGeometry(0.07, 0.07, 0.2, 14);
        ex(tx(cyl, sx * 0.29, -0.14, z, 0, 0, Math.PI / 2));
        for (let f = 0; f < 6; f++) ex(tx(new THREE.CylinderGeometry(0.085, 0.085, 0.008, 14), sx * (0.21 + f * 0.03), -0.14, z, 0, 0, Math.PI / 2));
        add('steel', tx(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12), sx * 0.42, -0.1, z, 0, 0, Math.PI / 2));
        add('exhaust', tube([[sx * 0.33, -0.22, z], [sx * 0.28, -0.3, z - 0.05], [sx * 0.14, -0.2, -1.45], [sx * 0.06, -0.12, -1.6]], 0.022, 10, 6));
      }
    }
    add('dark', tx(new THREE.CylinderGeometry(0.31, 0.31, 0.2, 32), 0, -0.12, -0.72, Math.PI / 2));
    add('engine', tx(new THREE.TorusGeometry(0.31, 0.02, 8, 32), 0, -0.12, -0.82));
    // Muffler inside the outlet, the tailpipe turned down out of it.
    add('exhaust', tx(new THREE.CylinderGeometry(0.1, 0.1, 0.36, 20), 0, -0.1, -1.6, Math.PI / 2));
    add('exhaust', tube([[-0.04, -0.12, -1.78], [-0.08, -0.18, -1.86], [-0.12, -0.28, -1.9]], 0.042, 10, 10));
    add('gloss', tx(new THREE.CircleGeometry(0.04, 14), -0.12, -0.285, -1.9, Math.PI / 2, 0, 0));
    add('alu', tx(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 14), 0.16, 0.0, -0.9, 0, 0, Math.PI / 2));
    add('dark', rbox(0.26, 0.2, 0.06, 0.01, -0.22, -0.05, -1.62));
    // Upper drive: belt sheave and the clutch actuator under the fairing.
    add('steel', tx(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 20), 0, 0.08, -0.7, Math.PI / 2), true);
  }

  // ---------------- tail cone, empennage ----------------
  {
    const st = [];
    for (let z = TC0; z >= TC1 - 1e-6; z -= 0.1) { const t = tcAt(z); st.push({ z, hw: t.r, ys: t.y, yb: t.y - t.r, yt: t.y + t.r, pU: 2, pL: 2 }); }
    add('livery', liveryUV(tagged(loft(st, 28, (x, y, z) => clamp(0.85 + (y - tcAt(z).y) * 1.2, 0.6, 1)))));
    const t1 = tcAt(TC1);
    add('paint', tx(new THREE.SphereGeometry(t1.r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, t1.y, TC1, -Math.PI / 2));
    // Tail gearbox and the tail-rotor output shaft (left side).
    add('alu', rbox(0.16, 0.16, 0.2, 0.04, 0.02, TR.height, -TR.arm));
    add('steel', rod([0.08, TR.height, -TR.arm], [TAIL_HUB.x - 0.02, TR.height, -TR.arm], 0.025, 12));
    // Tail-rotor drive shaft cover strip on top and the beacon.
    add('dark', tx(new THREE.CylinderGeometry(0.035, 0.04, 0.04, 14), 0, tcAt(-2.7).y + tcAt(-2.7).r + 0.01, -2.7));
    // Upper vertical stabiliser (swept), lower stabiliser with the stinger.
    const fin = (pts, thick) => {
      const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
      const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 6 });
      g.translate(0, 0, -thick / 2);
      g.rotateY(-Math.PI / 2);
      return g;
    };
    add('paint', fin([[-5.55, 0.62], [-6.05, 0.62], [-6.48, 1.16], [-6.18, 1.16]], 0.04));
    add('paint', fin([[-5.72, 0.5], [-6.15, 0.5], [-6.32, -0.24], [-6.06, -0.24]], 0.04));
    add('steel', tube([[0, -0.2, -6.12], [0, -0.33, -6.1], [0, -0.36, -5.95], [0, -0.3, -5.82]], 0.014, 10, 6));
    // Tail-rotor guard (bent tube under the tail rotor, left side).
    add('steel', tube([[0.02, -0.15, -5.86], [0.16, -0.31, -5.92], [0.3, -0.34, -6.1], [0.31, -0.28, -6.45], [0.12, -0.18, -6.5], [0.02, -0.16, -6.3]], 0.016, 24, 6));
    // Horizontal stabiliser through the cone, forward of the tail-rotor disc.
    const prof = airfoil(0, 1, 0.12, 0, 0.4, 12);
    for (const side of [1, -1]) add('paint', wingPanel([{ x: 0, y: 0.53, le: -4.78, chord: 0.44 }, { x: 0.62, y: 0.53, le: -4.81, chord: 0.4 }], prof, side));
    // Position lights on the stabiliser tips, white tail light, beacon.
    add('lens', tx(new THREE.SphereGeometry(0.025, 10, 8), 0.63, 0.53, -4.92), true);
    add('lens', tx(new THREE.SphereGeometry(0.025, 10, 8), -0.63, 0.53, -4.92), true);
  }

  // ---------------- skids ----------------
  {
    const sr = 0.038, sy = GROUND + sr;
    const zf = 1.32, za = -1.38;
    for (const sx of [1, -1]) {
      const x = sx * Math.abs(A.skids[0][0]);
      add('skid', tube([[x, sy, za], [x, sy, 0], [x, sy, zf], [x, sy + 0.03, zf + 0.18], [x, sy + 0.12, zf + 0.3], [x, sy + 0.22, zf + 0.35]], sr, 40, 12));
      add('skid', ball([x, sy, za], sr, 10));
      add('skid', ball([x, sy + 0.22, zf + 0.35], sr, 10));
      // Wear shoes under the skid tube.
      for (const z of [-0.95, 0.75]) add('steel', rbox(0.05, 0.016, 0.4, 0.006, x, GROUND + 0.008, z), true);
    }
    // Arched cross tubes (forward and aft), painted; attach fittings.
    const arch = (z) => {
      const xs = [[1.09, GROUND + 0.075], [1.04, -1.18], [0.92, -1.02], [0.72, -0.935], [0.42, -0.9], [0, -0.892]];
      const pts = [...xs.map(([x, y]) => [x, y, z]), ...xs.slice(0, -1).reverse().map(([x, y]) => [-x, y, z])];
      add('cross', tube(pts, 0.042, 48, 12));
      for (const sx of [1, -1]) {
        add('dark', rbox(0.1, 0.06, 0.1, 0.015, sx * 0.42, -0.865, z));
        add('steel', tx(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 14), sx * 1.09, GROUND + 0.075, z), true);
      }
    };
    arch(0.95);
    arch(-0.82);
  }

  // ---------------- ag kit: belly tank, pump, boom, nozzles ----------------
  const nozzles = [];
  {
    // Cylindrical belly tank (as in the photographs) on two straps, slung
    // between the cross tubes.
    const tz = -0.05, TR0 = 0.19, TL = 1.5, ty = -0.88 - TR0;
    add('tank', tx(new THREE.CylinderGeometry(TR0, TR0, TL - 2 * 0.12, 32, 1, true), 0, ty, tz, Math.PI / 2));
    for (const sz of [1, -1]) add('tank', tx(new THREE.SphereGeometry(TR0, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, ty, tz + sz * (TL / 2 - 0.12), sz * Math.PI / 2, 0, 0, [1, 0.63, 1]));
    for (const z of [tz - 0.42, tz + 0.4]) {
      add('dark', tx(new THREE.TorusGeometry(TR0 + 0.006, 0.011, 6, 36), 0, ty, z));
      add('steel', rbox(0.06, 0.05, 0.03, 0.008, 0, -0.875, z));
    }
    for (const sx of [1, -1]) {
      add('steel', rod([sx * 0.15, -0.95, tz - 0.42], [sx * 0.42, -0.88, -0.82], 0.014, 6));
      add('steel', rod([sx * 0.15, -0.95, tz + 0.4], [sx * 0.42, -0.88, 0.95], 0.014, 6));
    }
    // Fill coupler on the tank's left side, aft — the hose couples here.
    add('dark', tx(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 16), TR0 + 0.02, ty, -0.55, 0, 0, Math.PI / 2));
    add('brass', tx(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), TR0 + 0.06, ty, -0.55, 0, 0, Math.PI / 2));
    // Sight strip (translucent level band) along the tank's side.
    add('tint', tx(new THREE.PlaneGeometry(0.6, 0.045), TR0 * 0.97 + 0.003, ty, tz, 0, Math.PI / 2, 0), true);
    // Pump at the tank front and the feed line to the boom centre.
    add('dark', tx(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 16), 0, ty - 0.05, 0.78, Math.PI / 2));
    add('alu', tx(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 14), 0, ty - 0.05, 0.88, Math.PI / 2));
    add('rubber', tube([[0, ty - 0.08, 0.7], [0, ty - 0.12, 0.66], [0, BOOM.y, 0.62], [0, BOOM.y, BOOM.z]], 0.022, 12, 8));
    // Boom: 8 m (80 % of the rotor diameter, kept inside the rotor wake).
    add('alu', rod([BOOM.half, BOOM.y, BOOM.z], [-BOOM.half, BOOM.y, BOOM.z], 0.025, 12));
    add('alu', ball([0, BOOM.y, BOOM.z], 0.045, 12));
    for (const sx of [1, -1]) {
      add('alu', ball([sx * BOOM.half, BOOM.y, BOOM.z], 0.03, 10));
      // Brackets onto the skid tube and up to the belly; braces to the cross tube.
      const x = sx * Math.abs(A.skids[0][0]);
      add('steel', rbox(0.04, 0.16, 0.05, 0.008, x, BOOM.y - 0.07, BOOM.z));
      add('steel', rod([sx * 0.45, BOOM.y, BOOM.z], [sx * 0.42, -0.87, BOOM.z + 0.02], 0.014, 6));
      add('steel', rod([sx * 2.6, BOOM.y + 0.02, BOOM.z], [sx * 0.9, -1.0, 0.95], 0.008, 6));
      add('steel', rod([sx * 3.7, BOOM.y + 0.02, BOOM.z], [sx * 0.75, -0.94, 0.95], 0.006, 5), true);
      const N = 14;
      for (let k = 0; k < N; k++) {
        const nx = sx * (0.3 + ((BOOM.half - 0.4) * k) / (N - 1));
        add('alu', rod([nx, BOOM.y, BOOM.z], [nx, BOOM.y - 0.06, BOOM.z + 0.01], 0.007, 6), true);
        add('dark', tx(new THREE.CylinderGeometry(0.017, 0.014, 0.045, 10), nx, BOOM.y - 0.085, BOOM.z + 0.012), true);
        add('brass', tx(new THREE.ConeGeometry(0.01, 0.024, 8), nx, BOOM.y - 0.118, BOOM.z + 0.014, Math.PI), true);
        nozzles.push(new THREE.Vector3(nx, BOOM.y - 0.13, BOOM.z + 0.014));
      }
    }
  }

  // ---------------- main rotor ----------------
  // Mast and the stationary swashplate on the airframe; the rotating parts
  // turn in `spin`, inside `tpp` (tip-path-plane tilt from the simulation).
  add('steel', tx(new THREE.CylinderGeometry(0.052, 0.058, R.hubHeight - TOWER.y1, 16), 0, (R.hubHeight + TOWER.y1) / 2, R.hubZ));
  const rotor = new THREE.Group();
  rotor.position.set(0, R.hubHeight, R.hubZ);
  const swash = new THREE.Group();
  swash.position.set(0, TOWER.y1 + 0.07 - R.hubHeight, 0);
  rotor.add(swash);
  swash.add(new THREE.Mesh(tagged(new THREE.CylinderGeometry(0.15, 0.15, 0.035, 28)), M.alu));
  const tpp = new THREE.Group();
  rotor.add(tpp);
  const spin = new THREE.Group();
  tpp.add(spin);
  {
    const hub = [];
    hub.push(tagged(rbox(0.17, 0.12, 0.15, 0.03, 0, 0, 0)));
    hub.push(tagged(tx(new THREE.CylinderGeometry(0.028, 0.028, 0.24, 12), 0, 0, 0, Math.PI / 2)));
    for (const sx of [1, -1]) {
      hub.push(tagged(tx(new THREE.CylinderGeometry(0.04, 0.055, 0.34, 14), sx * 0.25, 0, 0, 0, 0, Math.PI / 2)));
      hub.push(tagged(rbox(0.1, 0.05, 0.13, 0.015, sx * 0.45, 0, 0)));
    }
    hub.push(tagged(tx(lathe([[0, 0.1], [0.05, 0.09], [0.07, 0.05], [0.075, 0]], 18), 0, 0.055, 0)));
    spin.add(new THREE.Mesh(mergeGeometries(hub), M.alu));
    // Rotating swashplate ring and the two pitch links up to the horns.
    const yl = TOWER.y1 + 0.11 - R.hubHeight;
    const links = [tagged(tx(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 28), 0, yl, 0))];
    for (const sx of [1, -1]) links.push(tagged(rod([sx * 0.04, yl, sx * -0.12], [sx * 0.2, -0.02, sx * -0.1], 0.011, 6)));
    spin.add(new THREE.Mesh(mergeGeometries(links), M.steel));
  }
  // Blades: cone (coning / static droop) -> pitch (collective) -> blade.
  const bladeG = mergeGeometries([
    tagged(bladeGeo(0.48, R.radius, R.chord, 0.12, 0.05, -0.06, 30)),
    tagged(bladeGeo(0.4, 0.9, (u) => R.chord * (1.05 - 0.05 * u), 0.17, 0.05, 0.04, 4)),
  ]);
  const bladeMat = M.blade;
  const blades = [];
  for (const s of [1, -1]) {
    const cone = new THREE.Group();
    cone.rotation.y = s > 0 ? 0 : Math.PI;
    const pitch = new THREE.Group();
    cone.add(pitch);
    const mesh = new THREE.Mesh(bladeG, bladeMat);
    mesh.castShadow = true;
    pitch.add(mesh);
    spin.add(cone);
    blades.push({ cone, pitch, mesh });
  }
  // Blur sector (cone-shaped ring in the tip-path plane, not spinning).
  const discMat = blurMaterial(0x30343a, { blades: 2, chord: R.chord, dir: 1, plane: 'xz', envMap: opts.envMap });
  const disc = new THREE.Mesh(new THREE.RingGeometry(0.46, R.radius, 120, 6).rotateX(-Math.PI / 2), discMat);
  disc.renderOrder = 9;
  disc.frustumCulled = false;
  tpp.add(disc);
  root.add(rotor);

  // ---------------- tail rotor ----------------
  const tail = new THREE.Group();
  tail.position.copy(TAIL_HUB);
  const tspin = new THREE.Group();
  tail.add(tspin);
  tspin.add(new THREE.Mesh(mergeGeometries([
    tagged(tx(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 14), 0, 0, 0, 0, 0, Math.PI / 2)),
    tagged(rbox(0.05, 0.22, 0.06, 0.012, 0.0, 0, 0)),
    tagged(tx(lathe([[0, 0.05], [0.03, 0.04], [0.04, 0]], 12), 0.04, 0, 0, 0, 0, -Math.PI / 2)),
  ]), M.alu));
  const tbG = bladeGeo(0.09, TR.radius, (u) => TR.chord * (1.08 - 0.12 * u), 0.11, 0, 0, 10);
  tbG.rotateZ(Math.PI / 2); // span along +Y
  const tBlades = [];
  for (const s of [1, -1]) {
    const pg = new THREE.Group();
    pg.rotation.x = s > 0 ? 0 : Math.PI;
    const p2 = new THREE.Group();
    pg.add(p2);
    const m = new THREE.Mesh(tagged(tbG.clone()), M.tblade);
    m.castShadow = true;
    p2.add(m);
    tspin.add(pg);
    tBlades.push({ pitch: p2, mesh: m });
  }
  // Red/white tip bands (painted tips) on the tail blades.
  {
    const band = tagged(bladeGeo(TR.radius - 0.13, TR.radius, TR.chord * 0.97, 0.115, 0, 0, 2));
    band.rotateZ(Math.PI / 2);
    for (const tb of tBlades) tb.pitch.add(new THREE.Mesh(band, M.red));
  }
  const tdiscMat = blurMaterial(0xc9c9c9, { blades: 2, chord: TR.chord, dir: -1, plane: 'yz', envMap: opts.envMap });
  const tdisc = new THREE.Mesh(new THREE.RingGeometry(0.1, TR.radius, 64, 3).rotateY(Math.PI / 2), tdiscMat);
  tdisc.renderOrder = 9;
  tdisc.frustumCulled = false;
  tail.add(tdisc);
  root.add(tail);

  // Lights.
  const beacon = new THREE.Mesh(tagged(tx(lathe([[0.035, 0], [0.034, 0.03], [0.02, 0.055], [0, 0.06]], 14), 0, tcAt(-2.7).y + tcAt(-2.7).r + 0.03, -2.7)), M.beacon);
  root.add(beacon);
  const navL = new THREE.Mesh(tagged(tx(new THREE.SphereGeometry(0.02, 8, 6), 0.63, 0.53, -4.92)), M.navRed);
  const navR = new THREE.Mesh(tagged(tx(new THREE.SphereGeometry(0.02, 8, 6), -0.63, 0.53, -4.92)), M.navGreen);
  const tailLight = new THREE.Mesh(tagged(tx(new THREE.SphereGeometry(0.022, 8, 6), 0, 0.95, -6.38)), M.strobe);
  root.add(navL, navR, tailLight);

  // ---------------- cockpit ----------------
  const cockpit = new THREE.Group();
  const ci = {};
  const addC = (mat, g) => { (ci[mat] ||= []).push(tagged(g)); };
  // Floor following the hull.
  {
    const pos = [], uv = [], idx = [];
    const zs = [];
    for (let z = -0.48; z <= 2.16; z += 0.06) zs.push(z);
    for (const z of zs) {
      const w = halfWidthAt(stationAt(cabSt, z), -0.7) - 0.02;
      pos.push(w, -0.7, z, -w, -0.7, z);
      uv.push(w * 2, z * 2, -w * 2, z * 2);
    }
    for (let i = 0; i < zs.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    addC('floor', g);
  }
  // Front seats: base boxes (under-seat compartments), cushions, backs.
  for (const sx of [0.29, -0.29]) {
    addC('interior', rbox(0.46, 0.3, 0.46, 0.03, sx, -0.55, 1.02));
    addC('seat', rbox(0.46, 0.08, 0.46, 0.035, sx, -0.36, 1.03));
    addC('seat', rbox(0.46, 0.66, 0.1, 0.04, sx, -0.04, 0.78, -0.14));
    addC('seat', rbox(0.3, 0.14, 0.08, 0.03, sx, 0.36, 0.73, -0.14));
  }
  // Rear bench and backrest against the bulkhead.
  addC('interior', rbox(1.0, 0.32, 0.5, 0.03, 0, -0.54, -0.22));
  addC('seat', rbox(1.0, 0.08, 0.5, 0.035, 0, -0.35, -0.2));
  addC('seat', rbox(1.0, 0.72, 0.1, 0.04, 0, 0.02, -0.44, -0.08));
  // Pedestal console and the instrument pod (r44Cockpit.js): the pod face
  // tilted toward the pilots, the pedestal face below it sloping back to the
  // floor. Needles, lamps, the attitude ball and the heading card are 3D and
  // move every frame (update()).
  const inst = createR44Instruments(panel);
  const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  inst.pod.position.set(0, 0.07, 1.8);
  inst.pod.quaternion.setFromEuler(new THREE.Euler(0.4, 0, 0)).multiply(flip);
  inst.con.position.set(0, -0.387, 1.661);
  inst.con.quaternion.setFromEuler(new THREE.Euler(0.31, 0, 0)).multiply(flip);
  cockpit.add(inst.group);
  const panelMesh = inst.pod;
  // Guidance lightbar: a slim bar sitting on the pod's hood.
  const lightbar = new THREE.Group();
  lightbar.position.set(0, POD_OUT.top + 0.018, -0.04);
  lightbar.rotation.y = Math.PI;
  const leds = [];
  for (let i = -7; i <= 7; i++) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.0095, 0.011, 0.006), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    led.position.set(-i * 0.0122, 0, -0.0125);
    lightbar.add(led);
    leds.push(led);
  }
  lightbar.add(new THREE.Mesh(new RoundedBoxGeometry(0.205, 0.026, 0.024, 2, 0.005), M.dark));
  inst.pod.add(lightbar);
  // Overhead: rotor-brake handle (red) and the mixture/carb knobs on the pod.
  const brake = new THREE.Group();
  brake.position.set(0, 0.74, 0.95);
  brake.add(new THREE.Mesh(tagged(rod([0, 0, 0], [0, -0.08, 0.03], 0.008, 6)), M.steel));
  brake.add(new THREE.Mesh(tagged(rbox(0.06, 0.025, 0.03, 0.008, 0, -0.085, 0.035)), M.red));
  cockpit.add(brake);
  addC('dark', rbox(0.14, 0.04, 0.3, 0.015, 0, 0.75, 0.95));
  // Cyclic: Robinson T-bar, satin black, teetering on a pivot housing at the
  // top of the centre post (yellow placard on it); the pilot's right hand
  // rides on the right grip.
  const cyclic = new THREE.Group();
  const CP = new THREE.Vector3(0, -0.7, 1.52);
  cyclic.position.copy(CP);
  {
    const loc = (x, y, z) => [x - CP.x, y - CP.y, z - CP.z];
    const parts = [];
    parts.push(tagged(rod(loc(0, -0.7, 1.52), loc(0, -0.27, 1.5), 0.019, 10)));
    parts.push(tagged(rbox(0.07, 0.05, 0.06, 0.012, ...loc(0, -0.25, 1.5))));
    for (const sx of [1, -1]) {
      parts.push(tagged(rod(loc(sx * 0.03, -0.25, 1.5), loc(sx * 0.3, -0.27, 1.47), 0.015, 8)));
      parts.push(tagged(rod(loc(sx * 0.3, -0.27, 1.47), loc(sx * 0.3, -0.19, 1.485), 0.015, 8)));
    }
    cyclic.add(new THREE.Mesh(mergeGeometries(parts), M.satin));
    const grips = [];
    for (const sx of [1, -1]) {
      grips.push(tagged(tx(new THREE.CapsuleGeometry(0.021, 0.08, 4, 10), ...loc(sx * 0.3, -0.13, 1.49), 0.1)));
    }
    cyclic.add(new THREE.Mesh(mergeGeometries(grips), M.rubber));
    const caps = [], keys = [];
    for (const sx of [1, -1]) {
      caps.push(tagged(tx(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 10), ...loc(sx * 0.3, -0.075, 1.5))));
      keys.push(tagged(rbox(0.012, 0.018, 0.01, 0.003, ...loc(sx * 0.3, -0.115, 1.512))));
    }
    cyclic.add(new THREE.Mesh(mergeGeometries(caps), M.gloss));
    cyclic.add(new THREE.Mesh(mergeGeometries(keys), M.red));
    const placard = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.022), new THREE.MeshStandardMaterial({ map: placardTexture(), roughness: 0.6 }));
    placard.position.set(...loc(0, -0.245, 1.469));
    placard.rotation.y = Math.PI;
    cyclic.add(placard);
    const boot = new THREE.Mesh(tagged(tx(lathe([[0.07, 0], [0.06, 0.02], [0.04, 0.06], [0.022, 0.1]], 14), 0, 0, 0)), M.rubber);
    cyclic.add(boot);
  }
  const stick = new THREE.Group();
  stick.position.set(...o3(0, -0.22, -0.12)).sub(CP);
  cyclic.add(stick);
  cockpit.add(cyclic);
  // Collective (left of the pilot) with its twist-grip throttle; the left
  // forearm turns at the elbow and the lever follows the hand.
  const collective = new THREE.Group();
  const CPv = new THREE.Vector3(...o3(...COLL_PIVOT));
  collective.position.copy(CPv);
  const gripRest = new THREE.Vector3(...o3(THR[0], THR[1] + 0.15, THR[2] - 0.01));
  const collRest = Math.atan2(gripRest.y - CPv.y, gripRest.z - CPv.z);
  {
    const L = gripRest.distanceTo(CPv);
    const g = [tagged(tx(new THREE.CylinderGeometry(0.016, 0.018, L - 0.1, 10), 0, 0, (L - 0.1) / 2, Math.PI / 2))];
    g.push(tagged(tx(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 14), 0, 0, 0, 0, 0, Math.PI / 2)));
    const lever = mergeGeometries(g);
    lever.rotateX(-collRest);
    collective.add(new THREE.Mesh(lever, M.steel));
    const grip = new THREE.Mesh(tagged(tx(new THREE.CylinderGeometry(0.022, 0.022, 0.13, 12), 0, 0, L - 0.04, Math.PI / 2)).rotateX(-collRest), M.rubber);
    collective.add(grip);
  }
  cockpit.add(collective);
  const lhPivot = new THREE.Group();
  lhPivot.position.set(...o3(...ELBOW_L));
  const throttle = new THREE.Group();
  throttle.position.set(THR[0] - ELBOW_L[0], THR[1] - ELBOW_L[1], THR[2] - ELBOW_L[2]);
  lhPivot.add(throttle);
  cockpit.add(lhPivot);
  // Pedals (both seats; the right pair moves with the simulation).
  const pedals = [];
  for (const px of [-0.29, 0.29]) {
    for (const sx of [1, -1]) {
      const p = new THREE.Group();
      p.position.set(px + sx * 0.14, -0.62, 2.02);
      p.rotation.x = -0.75;
      p.add(new THREE.Mesh(tagged(rbox(0.1, 0.16, 0.025, 0.008, 0, 0, 0)), M.steel));
      p.add(new THREE.Mesh(tagged(tx(new THREE.CylinderGeometry(0.01, 0.01, 0.16, 8), 0, -0.11, 0.03)), M.steel));
      cockpit.add(p);
      pedals.push({ p, sign: sx, z0: p.position.z, mine: px < 0 });
    }
  }
  // Door pulls, fire extinguisher, rear-seat belts (fine).
  addC('dark', rbox(0.04, 0.03, 0.18, 0.01, 0.575, -0.08, 1.3));
  addC('dark', rbox(0.04, 0.03, 0.18, 0.01, -0.575, -0.08, 1.3));
  addC('red', tx(lathe([[0, -0.13], [0.035, -0.13], [0.036, 0.09], [0.025, 0.13], [0, 0.14]], 14), 0.48, -0.55, 0.6));
  for (const [mat, parts] of Object.entries(ci)) {
    const m = new THREE.Mesh(mergeGeometries(parts), M[mat]);
    m.receiveShadow = true;
    cockpit.add(m);
  }
  root.add(cockpit);

  // ---------------- pilot ----------------
  const pilot = buildPilot(M, stick, throttle, { throttleAt: THR });
  pilot.position.copy(OFF);
  root.add(pilot);

  // ---------------- glass, static merge, LOD ----------------
  // Cabin and aft-body skins with their inner skin (what is seen through the
  // windows and the open engine bay) and the glass, near and far versions.
  const shell = (geos, mat, cast, order = 0) => {
    const m = new THREE.Mesh(mergeGeometries(geos.map((g) => tagged(g))), mat);
    m.castShadow = cast; m.receiveShadow = mat !== M.glass; m.renderOrder = order;
    return m;
  };
  const glassMesh = new THREE.Group();
  glassMesh.add(shell([cabHi.glass], M.glass, false, 10));
  const near = new THREE.Group(), far = new THREE.Group();
  near.add(shell([cabHi.paint, aftHi.paint], M.livery, true), shell([cabHi.inner, aftHi.inner], M.interior, false), glassMesh);
  far.add(shell([cabLo.paint, aftLo.paint], M.livery, true), shell([cabLo.inner, aftLo.inner], M.interior, false), shell([cabLo.glass], M.glass, false, 10));
  const shellLod = new THREE.LOD();
  shellLod.addLevel(near, 0);
  shellLod.addLevel(far, 40);
  root.add(shellLod);
  const fine = new THREE.Group();
  for (const [k, parts] of Object.entries(B)) {
    const isFine = k.startsWith('fine:');
    const mat = M[isFine ? k.slice(5) : k];
    const m = new THREE.Mesh(mergeGeometries(parts), mat);
    m.castShadow = !isFine && mat !== M.lens && mat !== M.tint;
    m.receiveShadow = true;
    if (mat === M.lens || mat === M.tint) m.renderOrder = 9;
    (isFine ? fine : root).add(m);
  }
  const lod = new THREE.LOD();
  lod.addLevel(fine, 0);
  lod.addLevel(new THREE.Group(), 40);
  root.add(lod);

  // ---------------- animation ----------------
  const EXPOSURE = 1 / 50; // s of rotor travel smeared per frame
  const elbow = new THREE.Vector3(...o3(...ELBOW_L));
  const handRest = new THREE.Vector3(...o3(THR[0], THR[1] + 0.17, THR[2] - 0.01));
  const _h = new THREE.Vector3();
  let t = 0, bladeOpacity = 1;
  const setBladeOpacity = (mat, a) => {
    const tr = a < 0.999;
    if (mat.transparent !== tr) { mat.transparent = tr; mat.depthWrite = !tr; }
    mat.opacity = a;
  };
  const update = (dt, fm, ac) => {
    t += dt;
    // Instruments every frame while flown from the cockpit (smooth needles).
    if (ac && ac.game?.cameraMode === 'cockpit' && ac.game.aircraft === ac) inst.update(ac.instruments());
    const o = fm.out;
    const om = fm.rotorOmega;
    const pct = o.rotorPct / 100;
    // Main rotor: tip-path plane, coning (droop at rest), collective pitch.
    tpp.rotation.set(fm.a1, 0, fm.b1);
    swash.rotation.set(fm.a1 * 0.8, 0, fm.b1 * 0.8);
    spin.rotation.y = fm.rotorAngle;
    const beta = lerp(-0.032, R.precone, smoothstep(0.15, 0.95, pct * pct));
    const theta = R.pitchMin + clamp(fm.collective, 0, 1) * (R.pitchMax - R.pitchMin);
    blades[0].cone.rotation.z = beta; blades[1].cone.rotation.z = beta;
    blades[0].pitch.rotation.x = theta * 0.6; blades[1].pitch.rotation.x = theta * 0.6;
    const blur = om * EXPOSURE;
    const target = 1 - smoothstep(0.35, 0.95, blur);
    bladeOpacity = target;
    setBladeOpacity(bladeMat, Math.max(0.0, bladeOpacity));
    for (const b of blades) { b.mesh.visible = bladeOpacity > 0.01; b.mesh.castShadow = bladeOpacity > 0.5; }
    const u = discMat.userData.u;
    u.uAngle.value = fm.rotorAngle; u.uBlur.value = blur; u.uCone.value = Math.tan(beta);
    u.uOpacity.value = smoothstep(0.06, 0.3, blur);
    disc.visible = u.uOpacity.value > 0.002;
    // Tail rotor (advancing blade at the bottom), pitch from the pedals.
    tspin.rotation.x = fm.tailAngle;
    const thT = TR.pitchMax + ((TR.pitchMin - TR.pitchMax) * (clamp(fm.pedal, -1, 1) + 1)) / 2;
    for (const tb of tBlades) tb.pitch.rotation.y = thT * 0.7;
    const tblur = om * TR.gear * EXPOSURE;
    const tu = tdiscMat.userData.u;
    tu.uAngle.value = fm.tailAngle; tu.uBlur.value = tblur; tu.uOpacity.value = smoothstep(0.1, 0.5, tblur);
    tdisc.visible = tu.uOpacity.value > 0.002;
    const tOp = 1 - smoothstep(0.5, 1.4, tblur);
    setBladeOpacity(M.tblade, tOp);
    for (const tb of tBlades) { tb.mesh.visible = tOp > 0.01; tb.mesh.castShadow = tOp > 0.5; }
    // Controls: T-bar cyclic, collective (hand on the grip), pedals.
    cyclic.rotation.set(clamp(fm.cyclicLon + fm.trim, -1, 1) * 0.16, 0, clamp(fm.cyclicLat, -1, 1) * 0.14);
    const phi = clamp(fm.collective, 0, 1) * 0.42;
    lhPivot.rotation.x = -phi;
    _h.copy(handRest).sub(elbow).applyAxisAngle(new THREE.Vector3(1, 0, 0), -phi).add(elbow);
    collective.rotation.x = -(Math.atan2(_h.y - 0.02 - CPv.y, _h.z - CPv.z) - collRest);
    for (const pd of pedals) pd.p.position.z = pd.z0 + pd.sign * -clamp(fm.pedal, -1, 1) * 0.045;
    brake.position.y = 0.74 - (fm.rotorBrake ? 0.05 : 0);
    // Beacon and position lights while the master is on (engine running or rotor turning).
    const on = fm.engine !== 'off' || pct > 0.05;
    M.beacon.emissiveIntensity = on ? 0.6 + 2.4 * Math.max(0, Math.sin(t * 7.5)) ** 8 : 0;
    M.strobe.emissiveIntensity = on && t % 1.3 < 0.06 ? 4 : on ? 0.4 : 0;
    M.navRed.emissiveIntensity = on ? 1.6 : 0;
    M.navGreen.emissiveIntensity = on ? 1.6 : 0;
  };

  const repaint = () => {
    const n = liveryTextures(reg, scheme), L = R44_LIVERIES[scheme];
    M.livery.map.dispose(); M.livery.bumpMap.dispose();
    M.livery.map = n.map; M.livery.bumpMap = n.bump; M.livery.needsUpdate = true;
    M.paint.color.set(L.paint).multiplyScalar(ALB);
    M.cross.color.set(L.cross).multiplyScalar(ALB);
    M.skid.color.set(L.gold ? 0x2a2c30 : 0xc6cacd); M.skid.roughness = L.gold ? 0.38 : 0.3; M.skid.metalness = L.gold ? 0.6 : 0.9;
    // Black paint: a little more gloss so the shapes still read.
    for (const m of [M.livery, M.paint, M.cross]) { m.clearcoat = L.gold ? 0.55 : 0.3; m.roughness = L.gold ? 0.32 : 0.4; }
  };
  return {
    // New registration marks or paint scheme: only the livery canvas and
    // the plain paint colours change (same meshes, same materials).
    setReg(r) { reg = r; repaint(); },
    setLivery(i) { const k = clamp(Math.round(i) || 0, 0, R44_LIVERIES.length - 1); if (k === scheme) return; scheme = k; repaint(); },
    get livery() { return scheme; },
    root, M,
    rotor, disc, tail, blades, tailBlades: tBlades,
    stick: cyclic, cyclic, collective, pedals, throttle, leds, panelMesh, inst,
    nozzles, pilot, cockpit, glassMesh,
    eye: new THREE.Vector3(...o3(0, 0.98, -0.42)),
    fuelFiller: new THREE.Vector3(0.44, 0.56, -0.86),
    hopperPort: new THREE.Vector3(0.27, -1.07, -0.55),
    update,
  };
}

// Shared with the Bell 206 model (b206Model.js).
export { roundPoly, polyRegion, halfWidthAt, stationAt, soupOf, splitSoup, soupGeo, innerShell, blurMaterial, bladeGeo, carpetTexture };
