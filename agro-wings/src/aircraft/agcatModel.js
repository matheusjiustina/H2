// Procedural Grumman G-164A Super Ag-Cat 450 — the RADIAL Ag-Cat (Pratt &
// Whitney R-985 Wasp Jr, nine cylinders, 450 hp, two-blade Hamilton Standard
// constant-speed prop) with fictional Brazilian marks PR-GAC. Not a Turbo
// Ag-Cat (no long turbine nose), not a G-164B (shorter, 10.95 m upper span).
// VISUAL ONLY: the physics (FLIGHT_AGCAT), gear contacts and hard points are
// in config.js; the gear points are read here only to place the wheels.
//
// Body frame: +Z nose, +Y up, +X left wing; origin = CG (≈ 25 % of the mean
// chord of the two wings). Built level (thrust line horizontal); the gear
// points stand it ≈ 12° nose-up on three wheels.
//
// Reference map (photographs N7509V, TI-AYR, the PZ- radial, N8362K, N974H,
// N84PG, the Hellenic 1569, N8882H and a head-on view; scaled to the type's
// 10.95 m span, 7.42 m length, ≈ 3.30 m height):
//   spinner/hub nose z 2.04 · prop plane 1.86 · cylinder plane 1.55 (R-985
//   ≈ 1.17 m across, the crank axis 0.12 over the CG; no ring cowl: the
//   cylinders stand in the air ahead of the baffle) · accessory cowl to the
//   firewall 1.0 · hopper 1.0 … −0.85 under and behind the upper wing, its
//   lid on top · windshield foot −0.85 (behind the upper wing's trailing
//   edge) · roof crest 1.235 at −1.6 · window rear −2.22, the fairing curving
//   down into the turtledeck and on to the fin · upper wing LE 0.62, chord 1.42, chord
//   line 1.42 over the CG (flat, 1.5° incidence) · lower wing LE 0.12 (0.5 m
//   stagger), at the fuselage bottom (−0.50), 3° dihedral, 10.5 m span ·
//   N interplane struts at 3.3 m · cabane N-struts from the hopper sides ·
//   fin LE root −4.30, rudder TE −5.38 · tailplane 0.30 high, 3.7 m span,
//   strut-braced underneath, wired above · main wheels z 0.70, 2.3 m track,
//   8.50-10 tyres · tailwheel on a long leaf spring at −4.62.
// What makes it an Ag-Cat: the short nose with the exposed radial; the
// slab-sided fuselage with the hopper ahead of a tall,
// framed single-seat canopy standing behind the upper wing's trailing edge;
// two nearly equal wings, the lower one at the fuselage bottom and staggered
// aft; the N interplane and cabane struts with doubled flying/landing wires;
// the tall, square-topped fin and rudder; the braced tailplane; the big
// main wheels on splayed legs; the tailwheel on a long spring; the booms
// under the lower wing's trailing edge, the windmill pump under the belly.
// The cockpit (agcatCockpit.js) is built in its own frame and placed CK_DZ
// aft with the cabin.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { buildAgCatCockpit, AGCAT_CK } from './agcatCockpit.js';
import { rng, clamp, lerp } from '../core/math.js';
import { FLIGHT_AGCAT } from '../config.js';
import {
  sampleStations, ring, loft, K, airfoil, wingPanel, tagged, tx, rod, tube, ball, lathe, patch,
  speckle, orangePeel, treadTexture, propDiscTexture, WING_SPAN_UV, buildPilot,
} from './model.js';

const A = FLIGHT_AGCAT;
// Small fittings: one bevel segment is enough at their size (a third of the
// shared helper's triangles).
const rbox = (w, h, d, r, x, y, z, rx = 0, ry = 0, rz = 0) => tx(new RoundedBoxGeometry(w, h, d, 1, r), x, y, z, rx, ry, rz);
const HUB_Y = 0.12; // crank / thrust axis
const EZ = 1.55; // cylinder plane
const PROP_Z = 1.86, NOSE_Z = 2.04, RUDDER_Z = -5.38;

// Wings.
export const AGCAT_WING = {
  upper: { half: 5.475, y: 1.42, le: 0.62, chord: 1.42, inc: (1.5 * Math.PI) / 180, ail: [2.75, 5.2] },
  lower: { half: 5.25, root: 0.5, y: -0.38, le: 0.12, chord: 1.42, dih: Math.tan((3 * Math.PI) / 180), inc: (1.5 * Math.PI) / 180, ail: [2.6, 5.0] },
  strutX: 3.3,
};
const WU = AGCAT_WING.upper, WL = AGCAT_WING.lower;
export const agcatLowerY = (x) => WL.y + Math.max(0, Math.abs(x) - WL.root) * WL.dih;
const SPAN_UV = 5.6;
const T_UP = 0.12; // NACA 4412-like: 12 % thick, 4 % camber
// Incidence about each wing's leading edge.
const incM = (y, le, a) => new THREE.Matrix4().makeTranslation(0, y, le).multiply(new THREE.Matrix4().makeRotationX(-a)).multiply(new THREE.Matrix4().makeTranslation(0, -y, -le));
const UM = incM(WU.y, WU.le, WU.inc), LM = incM(WL.y, WL.le, WL.inc);
const upAt = (x, xc) => new THREE.Vector3(x, WU.y, WU.le - xc * WU.chord).applyMatrix4(UM); // chord-line point
const loAt = (x, xc) => new THREE.Vector3(x, agcatLowerY(x), WL.le - xc * WL.chord).applyMatrix4(LM);
// Spars (front 20 %, rear 68 % of the chord), on the skins (struts, wires).
const SPAR = [0.2, 0.68];
const upSpar = (x, k) => upAt(x, SPAR[k]).add(new THREE.Vector3(0, -0.055, 0));
const loSpar = (x, k) => loAt(x, SPAR[k]).add(new THREE.Vector3(0, 0.055, 0));

export const AGCAT_SHADOW = { W: 12.5, L: 9.5, wing: [5.47, -1.3, 0.62], fus: [0.55, -1.6, 3.6], tail: [1.85, -5.1, -4.25], core: [4.0, 2.6] };

// Cabin (body frame): the sill (top longerons), the windshield's foot and
// the roof's front bow, the roof's rear end, the window's rear edge, the
// rear bulkhead behind the seat, the door post. The cabin stands behind the
// upper wing's trailing edge (photographs TI-AYR, N84PG, N-48429: the
// windshield's foot ≈ 1.55 m behind the main wheels), its roof a rounded
// crest, and behind it the fairing falls in a curve into the turtledeck
// that runs on to the fin.
const CAB = { sill: 0.51, roof: 1.235, hwS: 0.5, wsF: -0.85, wsT: -1.22, rT: -1.95, win: -2.22, rF: -2.3, post: -1.62 };
// The cockpit (agcatCockpit.js) is laid out in its own frame; it sits in
// the cabin moved CK_DZ along the body's z.
export const CK_DZ = -0.5;
// Pilot and cockpit anchors (body frame).
export const AGCAT_CABIN = {
  eye: [0, 0.9, -1.48], seat: [0, 0.02, -1.62], floorY: -0.38, panel: [0, 0.515, -0.99], stick: [0, -0.3, -1.08],
  pedals: [0, -0.21, -0.56], throttle: [0.43, 0.04, -1.14], windshield: [0, 0.85, -1.0], roof: [0, CAB.roof, -1.6],
  door: [0.5, 0.75, -1.4], gps: [-0.272, 0.533, -0.976], sill: CAB.sill, wsFoot: CAB.wsF, wsTop: CAB.wsT, roofRear: CAB.rT, rearFoot: CAB.rF, post: CAB.post,
};

// Overall dimensions (tests): span, nose to rudder, the high points.
export function agcatExtent() {
  return {
    span: 2 * WU.half, lowerSpan: 2 * WL.half, length: NOSE_Z - RUDDER_Z,
    // Points that may be the highest on three wheels: upper wing (LE, top),
    // a blade standing up, the fin top, the canopy roof.
    tops: [[0, WU.y + 0.1, WU.le - 0.4], [WU.half, WU.y + 0.08, WU.le - 0.4], [0, HUB_Y + A.propRadius, PROP_Z], [0, 1.6, -4.8], [0, CAB.roof + 0.005, -1.6]],
  };
}

// ---------------------------------------------------------------------------
// Paint schemes (same geometry). A — classic agricultural yellow: yellow all
// over, the radial dark metallic, black prop with yellow tips, tan
// fibreglass hopper lid, black registration. B — yellow and blue: a straight
// blue band with a navy pinstripe along both sides from the cowl to the
// rudder, blue ring cowl, blue bands on the fin and rudder, blue wing and
// tailplane tips, navy canopy frames. Registrations are the game's own.
const YELLOW = '#f2c512', BLUE = '#1c3f9a', NAVY = '#0f1a3a', INK = '#141414';
export const AGCAT_LIVERIES = [
  { id: 'yellow', name: 'Classic yellow', base: YELLOW, band: null, ring: '#3a3d40', frame: YELLOW, tip: YELLOW, stab: YELLOW, gear: YELLOW, blade: '#17181a', bladeTip: YELLOW, mark: INK },
  { id: 'blue', name: 'Yellow & blue', base: YELLOW, band: BLUE, pin: NAVY, ring: BLUE, frame: NAVY, tip: BLUE, stab: YELLOW, gear: YELLOW, blade: '#17181a', bladeTip: YELLOW, mark: NAVY },
];

// Side projection of the livery: top half = left side (nose to the left),
// bottom half = right side (nose to the right), lettering upright on both.
const LV = { Z0: -5.6, Z1: 2.1, Y0: -0.9, Y1: 1.75, W: 2048, H: 1024, M: 6 };
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

// The band: straight edges in the side projection (a stripe that follows
// the fuselage's taper in plan stays straight on the side), from the cowl
// to the rudder; its centre line descends gently with the top line.
const bandLine = (z0, y0, z1, y1) => (z) => y0 + ((z - z0) / (z1 - z0)) * (y1 - y0);
const BAND_TOP = bandLine(1.42, 0.24, RUDDER_Z, 0.33), BAND_BOT = bandLine(1.42, 0.07, RUDDER_Z, 0.24);
const REG_AT = [-3.15, 0.02]; // registration on the aft fuselage, under the band

function liveryTextures(reg, L = AGCAT_LIVERIES[0]) {
  const c = canvas(LV.W, LV.H), b = canvas(LV.W, LV.H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, LV.W, LV.H);
  orangePeel(gb, LV.W, LV.H, 71);
  for (const side of [1, -1]) {
    const P = (z, y) => lvPix(side, z, y);
    const oy = side > 0 ? 0 : LV.H / 2;
    const poly = (pts, fill) => { g.beginPath(); pts.forEach(([z, y], i) => { const [px, py] = P(z, y); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath(); g.fillStyle = fill; g.fill(); };
    const text = (z, y, s, h, col, style = 'bold') => {
      const [px, py] = P(z, y);
      g.save(); g.fillStyle = col; g.font = `${style} ${Math.round(h * LV.ky)}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(s, px, py); g.restore();
    };
    g.fillStyle = L.base; g.fillRect(0, oy, LV.W, LV.H / 2);
    // Panel seams and rivet rows (bump): the forward fuselage's removable
    // side panels, the cabin door, the aft fuselage skins.
    const seam = (pts) => {
      for (const [ctx, col, w] of [[g, 'rgba(80,60,0,0.25)', 2], [gb, '#404040', 2.5]]) {
        ctx.beginPath(); pts.forEach(([z, y], i) => { const [px, py] = P(z, y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
      }
    };
    for (const z of [1.0, 0.35, -0.35, -1.8, -2.7, -3.6]) seam([[z, -0.55], [z, 0.55]]);
    seam([[1.0, 0.25], [-0.35, 0.25]]);
    seam([[-0.4, -0.1], [-1.75, -0.1]]);
    gb.fillStyle = '#5a5a5a';
    for (let z = -5.0; z < 1.0; z += 0.07) for (const y of [0.47, -0.36]) { const [px, py] = P(z, y + (z < -1.8 ? (z + 1.8) * -0.03 : 0)); gb.beginPath(); gb.arc(px, py, 1.3, 0, Math.PI * 2); gb.fill(); }
    // Oil and exhaust stain along the belly from the right-hand stack.
    const [, belly] = P(0, -0.2);
    const grd = g.createLinearGradient(0, belly, 0, oy + LV.H / 2);
    grd.addColorStop(0, 'rgba(70,55,25,0)'); grd.addColorStop(1, `rgba(60,48,24,${side < 0 ? 0.38 : 0.24})`);
    g.fillStyle = grd; g.fillRect(0, belly, LV.W, oy + LV.H / 2 - belly);
    if (L.band) {
      const zs = [1.45, RUDDER_Z - 0.05];
      poly([[zs[0], BAND_TOP(zs[0])], [zs[1], BAND_TOP(zs[1])], [zs[1], BAND_BOT(zs[1])], [zs[0], BAND_BOT(zs[0])]], L.band);
      const pin = (f) => { const a = (z) => BAND_BOT(z) - 0.035 - f; poly([[zs[0], a(zs[0])], [zs[1], a(zs[1])], [zs[1], a(zs[1]) - 0.018], [zs[0], a(zs[0]) - 0.018]], L.pin); };
      pin(0);
      // Fin and rudder: two blue bands across the top.
      for (const [y0, y1] of [[1.36, 1.46], [1.22, 1.28]]) poly([[-4.2, y0], [-5.5, y0], [-5.5, y1], [-4.2, y1]], L.band);
    }
    text(REG_AT[0], REG_AT[1], reg, 0.3, L.mark);
    text(-1.05, 0.3, 'G-164A SUPER AG-CAT', 0.07, L.mark, 'italic bold');
    text(0.62, -0.12, 'AVGAS 100LL', 0.035, 'rgba(30,30,30,0.75)');
    text(-0.15, 0.0, 'RESTRICTED', 0.045, 'rgba(25,25,25,0.85)');
    speckle(g, 0, oy, LV.W, LV.H / 2, 2400, side > 0 ? 31 : 32, 0.09);
  }
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}

// Wing skin (fabric over ribs): u = span / SPAN_UV, v = chord fraction.
// Rib tapes every ≈ 0.3 m, the spars, the scheme's tips.
function wingTextures(L = AGCAT_LIVERIES[0]) {
  const Wd = 1024, H = 256;
  const c = canvas(Wd, H), b = canvas(Wd, H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  g.fillStyle = L.base; g.fillRect(0, 0, Wd, H);
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, Wd, H);
  const X = (m) => (m / SPAN_UV) * Wd, Y = (f) => f * H;
  if (L.tip !== L.base) { g.fillStyle = L.tip; g.fillRect(X(4.95), 0, Wd - X(4.95), H); }
  const r = rng(53);
  for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(60,45,30,${0.08 + r() * 0.14})`; g.fillRect(r() * Wd, Y(r() * 0.06), 1 + r() * 2, 1 + r() * 2); }
  for (let x = 0.35; x < 5.5; x += 0.3) {
    g.fillStyle = 'rgba(120,90,0,0.16)'; g.fillRect(X(x) - 1.5, 0, 3, H);
    gb.fillStyle = '#9a9a9a'; gb.fillRect(X(x) - 2, 0, 4, H); // rib tapes stand proud of the fabric
  }
  for (const f of SPAR) { gb.fillStyle = '#8c8c8c'; gb.fillRect(0, Y(f) - 2, Wd, 4); }
  g.fillStyle = 'rgba(40,20,0,0.45)'; g.fillRect(0, Y(0.75), Wd, 3);
  gb.fillStyle = '#2a2a2a'; gb.fillRect(0, Y(0.75), Wd, 4);
  speckle(g, 0, 0, Wd, H, 900, 47, 0.07);
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}

const wingP = (stations, prof, side, ao) => {
  const g = wingPanel(stations, prof, side, ao);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * WING_SPAN_UV) / SPAN_UV);
  return g;
};

// Streamlined strut between two points: elliptic section (w along the
// flight direction, t across), seg-sided.
function strut(a, b, w, t, seg = 10) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const d = vb.clone().sub(va), len = d.length();
  d.normalize();
  const c = new THREE.Vector3(0, 0, 1).addScaledVector(d, -d.z).normalize();
  const s = new THREE.Vector3().crossVectors(d, c).normalize();
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, seg, 1);
  const m = new THREE.Matrix4().makeBasis(s.clone().multiplyScalar(t), d.clone().multiplyScalar(len), c.clone().multiplyScalar(w));
  m.setPosition(va.clone().add(vb).multiplyScalar(0.5));
  g.applyMatrix4(m);
  g.computeVertexNormals();
  return g;
}

// Hamilton Standard blade (+X): narrow shank, paddle from ≈ 40 %, round tip.
function bladeLoft(r0, r1, steps, R) {
  const pos = [], idx = [];
  let n = 0;
  for (let i = 0; i <= steps; i++) {
    const r = r0 + ((r1 - r0) * i) / steps;
    const f = clamp((r - 0.14) / (R - 0.14), 0, 1);
    let c = 0.1 + 0.13 * Math.sin(Math.PI * Math.min(1, f * 0.75 + 0.18)) ** 0.7;
    if (f > 0.88) c *= 1 - ((f - 0.88) / 0.12) ** 2 * 0.75;
    const t = lerp(0.3, 0.07, f);
    const beta = Math.atan(2.05 / (2 * Math.PI * Math.max(r, 0.2)));
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

// One R-985 cylinder along +Y from the crank axis (local frame): finned
// steel barrel, finned aluminium head, two rocker boxes, push-rods, the
// front spark-plug lead.
function cylinderParts(R0, R1) {
  const parts = { barrel: [], head: [], rod: [] };
  const L = R1 - R0, hb = L * 0.5;
  const fins = [], nf = 11;
  for (let i = 0; i <= nf; i++) { const y = R0 + (hb * i) / nf; fins.push([0.066, y], [i % 2 ? 0.062 : 0.09, y + hb / nf / 2]); }
  parts.barrel.push(lathe(fins, 12));
  const head = [], nh = 8, h0 = R0 + hb, hh = L - hb;
  for (let i = 0; i <= nh; i++) { const y = h0 + (hh * 0.78 * i) / nh; head.push([0.075, y], [i % 2 ? 0.07 : 0.112 - 0.012 * (i / nh), y + (hh * 0.78) / nh / 2]); }
  head.push([0.06, R1 - 0.018], [0.035, R1], [0.0, R1 + 0.004]);
  // The head's fins are wider across than along the crank axis (R-985).
  parts.head.push(lathe(head, 12).scale(1.18, 1, 0.92));
  for (const s of [-1, 1]) {
    parts.head.push(tx(new THREE.BoxGeometry(0.05, 0.042, 0.06), s * 0.056, R1 - 0.045, 0.07));
    parts.rod.push(rod([s * 0.044, R0 + 0.02, 0.085], [s * 0.048, R1 - 0.06, 0.075], 0.008, 6));
  }
  parts.rod.push(rod([0, R1 - 0.09, 0.095], [0, R1 - 0.025, 0.11], 0.005, 5));
  return parts;
}

// Fuselage stations K(z, half-width, shoulder y, bottom y, top y, pU, pL):
// the accessory cowl just behind the cylinders no wider than the radial's
// crankcase section (the cylinders stand out of it, no ring cowl), then
// slab-sided and flat-bottomed from the firewall to the windshield's foot.
const FWD_KEYS = [
  K(1.43, 0.47, HUB_Y, HUB_Y - 0.46, HUB_Y + 0.44, 2.6, 2.6),
  K(1.25, 0.5, 0.08, -0.43, 0.53, 2.8, 2.9),
  K(1.0, 0.515, 0.04, -0.47, 0.51, 3.2, 4.2),
  K(0.5, 0.515, 0.02, -0.48, 0.51, 3.8, 5.5),
  K(-0.0, 0.515, 0.0, -0.48, 0.51, 5.0, 6),
  K(CAB.wsF, 0.515, 0.0, -0.48, 0.51, 9.0, 6), // squaring into the cabin's straight sides
];
// Aft of the windshield's foot: the box fuselage under the top longerons
// [z, half-width, longeron y, side→belly y, bottom y, belly exponent] —
// deep to the tail (the bottom line nearly straight, as on the photographs),
// and over it the cabin, fairing and turtledeck in one shell whose crest
// follows CREST (roof → fairing → dorsal → fin root).
const BOX = [
  [CAB.wsF, 0.515, 0.51, 0.0, -0.48, 6],
  [-1.6, 0.515, 0.51, 0.0, -0.476, 6],
  [CAB.rF, 0.505, 0.51, 0.0, -0.466, 6],
  [-3.0, 0.445, 0.47, 0.02, -0.43, 5],
  [-3.7, 0.35, 0.41, 0.05, -0.345, 4],
  [-4.4, 0.24, 0.345, 0.09, -0.23, 3.5],
  [-4.78, 0.15, 0.305, 0.11, -0.16, 3],
  [-5.02, 0.045, 0.28, 0.12, -0.12, 2.6],
];
const CREST = [[CAB.wsF, 0.51], [-1.04, 0.875], [-1.2, 1.17], [-1.32, 1.225], [-1.6, 1.235], [-1.88, 1.226], [-2.08, 1.17], [-2.32, 1.03],
  [-2.62, 0.84], [-3.0, 0.69], [-3.7, 0.565], [-4.4, 0.48], [-4.78, 0.44], [-5.02, 0.415]];
// Monotone cubic through the knots (no overshoot between them).
function pchip(K) {
  const n = K.length, xs = K.map((k) => -k[0]), ys = K.map((k) => k[1]);
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
const crestY = pchip(CREST);
const boxAt = (z) => {
  let i = 0; while (i < BOX.length - 2 && z < BOX[i + 1][0]) i++;
  const a = BOX[i], b = BOX[i + 1], t = clamp((a[0] - z) / (a[0] - b[0]), 0, 1), s = t * t * (3 - 2 * t) * 0.35 + t * 0.65;
  return { w: lerp(a[1], b[1], s), yl: lerp(a[2], b[2], s), ys: lerp(a[3], b[3], s), yb: lerp(a[4], b[4], s), p: lerp(a[5], b[5], s) };
};
// Top / bottom line of the fuselage (hopper lid, fittings, tailplane struts).
const topY = (z) => (z > CAB.wsF ? 0.51 : crestY(z));
const botY = (z) => (z > CAB.wsF ? -0.48 : boxAt(z).yb);
// Shell point: arch over the longerons, t 0 = left longeron, 0.5 = crest, 1 = right.
const shellP = (z, t) => {
  const b = boxAt(z), top = Math.max(b.yl + 0.002, crestY(z)), p = z > CAB.rF ? 2.5 : 2.25;
  const a = Math.PI * t, c = Math.cos(a), sn = Math.sin(a);
  return [b.w * Math.sign(c) * Math.abs(c) ** (2 / p), b.yl + (top - b.yl) * Math.abs(sn) ** (2 / p), z];
};

// ==========================================================================
export function createAgCatModel(panel, opts = {}) {
  const root = new THREE.Group();
  root.name = 'agcat';
  let REG = opts.reg ?? 'PR-GAC', livery = 0;
  const L0 = AGCAT_LIVERIES[0];
  const liv = liveryTextures(REG, L0), wtx = wingTextures(L0);
  const coat = { roughness: 0.5, metalness: 0.0, specularIntensity: 0.3, clearcoat: 0.1, clearcoatRoughness: 0.35, envMap: opts.envMap ?? null, envMapIntensity: 0.3 };
  const ALB = 0.84;
  const col = (c) => new THREE.Color(c).multiplyScalar(ALB);
  const M = {
    livery: new THREE.MeshPhysicalMaterial({ color: col('#ffffff'), map: liv.map, bumpMap: liv.bump, bumpScale: 1.3, vertexColors: true, ...coat }),
    wing: new THREE.MeshPhysicalMaterial({ color: col('#ffffff'), map: wtx.map, bumpMap: wtx.bump, bumpScale: 1.6, vertexColors: true, ...coat, roughness: 0.58 }),
    paint: new THREE.MeshPhysicalMaterial({ color: col(YELLOW), vertexColors: true, ...coat }),
    frame: new THREE.MeshPhysicalMaterial({ color: col(L0.frame), vertexColors: true, ...coat, side: THREE.DoubleSide }),
    tip: new THREE.MeshPhysicalMaterial({ color: col(L0.tip), vertexColors: true, ...coat }),
    stab: new THREE.MeshPhysicalMaterial({ color: col(L0.stab), vertexColors: true, ...coat }),
    gear: new THREE.MeshPhysicalMaterial({ color: col(L0.gear), vertexColors: true, ...coat }),
    lid: new THREE.MeshStandardMaterial({ color: 0x8f7650, roughness: 0.75, metalness: 0.02, vertexColors: true, side: THREE.DoubleSide }), // thin shell
    dark: new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.62, metalness: 0.1, vertexColors: true }),
    ink: new THREE.MeshStandardMaterial({ color: 0x151617, roughness: 0.55, metalness: 0.15, vertexColors: true }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.3, metalness: 0.9, vertexColors: true }),
    steel: new THREE.MeshStandardMaterial({ color: 0x5c6166, roughness: 0.42, metalness: 0.85, vertexColors: true }),
    wire: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.35, metalness: 0.9 }),
    cyl: new THREE.MeshStandardMaterial({ color: 0x4a4d50, roughness: 0.48, metalness: 0.75, vertexColors: true }), // dark steel barrels
    head: new THREE.MeshStandardMaterial({ color: 0x8d9093, roughness: 0.4, metalness: 0.8, vertexColors: true }), // aluminium heads
    crank: new THREE.MeshStandardMaterial({ color: 0x232527, roughness: 0.5, metalness: 0.45, vertexColors: true }),
    exhaust: new THREE.MeshStandardMaterial({ color: 0x8b8178, roughness: 0.48, metalness: 0.85, vertexColors: true }),
    soot: new THREE.MeshStandardMaterial({ color: 0x2c2722, roughness: 0.7, metalness: 0.6, vertexColors: true }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.94, metalness: 0, vertexColors: true }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92, metalness: 0, bumpMap: treadTexture(), bumpScale: 2.5 }),
    hub: new THREE.MeshStandardMaterial({ color: 0x9a9ea3, roughness: 0.38, metalness: 0.75 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb8913c, roughness: 0.35, metalness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xa8bcc6, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5, depthWrite: false, side: THREE.DoubleSide }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false }),
    interior: new THREE.MeshStandardMaterial({ color: 0x5f666d, roughness: 0.75, metalness: 0.2, vertexColors: true, side: THREE.DoubleSide }),
    floor: new THREE.MeshStandardMaterial({ color: 0x3e4247, roughness: 0.82, metalness: 0.35, vertexColors: true }),
    seat: new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.85, vertexColors: true }),
    harness: new THREE.MeshStandardMaterial({ color: 0x2d3a52, roughness: 0.8 }),
    red: new THREE.MeshStandardMaterial({ color: 0xc8261b, roughness: 0.45, emissive: 0x330000 }),
    green: new THREE.MeshStandardMaterial({ color: 0x1f9a3a, roughness: 0.45, emissive: 0x002200 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35, emissive: 0x222222 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xe0661c, roughness: 0.5 }),
    gloss: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.28, metalness: 0.1, vertexColors: true }),
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
    let a = 1 - Math.max(0, -y - 0.25) * 0.4;
    if (z > 1.0) a *= 0.82 + 0.18 * clamp((1.4 - z) / 0.4, 0, 1); // behind the cylinders
    const lw = Math.max(0, 1 - Math.abs(y + 0.48) / 0.2) * (z < 0.3 && z > -1.5 ? 1 : 0); // lower wing root
    a *= 1 - 0.3 * lw;
    return clamp(a, 0.5, 1);
  };
  const fwdSt = sampleStations(FWD_KEYS, 18);
  add('livery', liveryUV(tagged(loft(fwdSt, 56, fusAO))));
  // Box fuselage aft of the windshield's foot: straight sides from the
  // longerons down to the belly's superellipse (open on top: the shell
  // closes it).
  const zsAft = [];
  for (let z = CAB.wsF; z > -5.02 + 1e-6; z -= 0.09) zsAft.push(z);
  zsAft.push(-5.02);
  const rings = (fn, n) => {
    const pos = [], col = [], idx = [];
    for (const z of zsAft) for (let k = 0; k <= n; k++) { const [x, y] = fn(z, k / n); pos.push(x, y, z); const gg = fusAO(x, y, z); col.push(gg, gg, gg); }
    for (let si = 0; si < zsAft.length - 1; si++) for (let k = 0; k < n; k++) { const a = si * (n + 1) + k, b = a + 1, c = a + n + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  const boxRing = (z, u) => {
    // u 0..1: left longeron → down the left side → belly → up the right side.
    const b = boxAt(z), side = 0.18;
    if (u <= side) return [b.w, lerp(b.yl, b.ys, u / side)];
    if (u >= 1 - side) return [-b.w, lerp(b.ys, b.yl, (u - (1 - side)) / side)];
    const a = Math.PI + Math.PI * ((u - side) / (1 - 2 * side)), c = Math.cos(a), sn = Math.sin(a);
    return [-b.w * Math.sign(c) * Math.abs(c) ** (2 / b.p), b.ys - (b.ys - b.yb) * Math.abs(sn) ** (2 / b.p)];
  };
  add('livery', liveryUV(tagged(rings(boxRing, 40))));
  // Collar at the windshield's foot: closes the thin step between the forward
  // fuselage's rounded shoulders and the cabin's straight sides.
  {
    const outer = []; for (let k = 0; k <= 40; k++) outer.push(new THREE.Vector2(...boxRing(CAB.wsF, k / 40)));
    const sh = new THREE.Shape(outer);
    const st = fwdSt[fwdSt.length - 1], cy = (st.yt + st.yb) / 2;
    sh.holes.push(new THREE.Path(ring(st, 56).slice(0, -1).reverse().map(([x, y]) => new THREE.Vector2(x * 0.997, cy + (y - cy) * 0.997))));
    add('livery', liveryUV(tagged(tx(new THREE.ShapeGeometry(sh), 0, 0, CAB.wsF - 0.002))));
  }
  // Tail post (the rudder's hinge post closes the narrow end).
  add('livery', liveryUV(tagged(rbox(0.09, 0.42, 0.04, 0.015, 0, 0.15, -5.0))));
  // Hopper lid (fibreglass): framed, hinged on the right, two latches and
  // the loading window at its front; the hopper vent.
  {
    const st = fwdSt.filter((s) => s.z <= 0.95 && s.z >= CAB.wsF + 0.07).map((s) => ({ ...s, hw: s.hw * 0.78, yt: s.yt + 0.014, ys: s.yt - 0.06 }));
    add('lid', loft(st, 18, null, [Math.PI * 0.2, Math.PI * 0.8]));
    for (const z of [0.95, CAB.wsF + 0.07]) add('dark', tx(new THREE.BoxGeometry(0.84, 0.022, 0.03), 0, topY(z) + 0.012, z));
    for (const sx of [1, -1]) add('dark', tube(st.map((s) => [sx * s.hw * 0.94, s.yt - 0.03, s.z]), 0.01, 16, 5));
    for (const z of [0.6, -0.4]) add('steel', rbox(0.05, 0.03, 0.08, 0.01, 0.39, topY(z) + 0.012, z), true);
    add('dark', tx(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 10), -0.25, 0.55, 0.85)); // vent
  }
  // Hopper side quick-fill coupling (left), gatebox under the hopper, the
  // windmill pump bracket.
  add('dark', tx(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 16), 0.53, -0.16, 0.3, 0, 0, Math.PI / 2));
  add('brass', tx(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16), 0.59, -0.16, 0.3, 0, 0, Math.PI / 2));
  add('paint', rbox(0.5, 0.14, 0.7, 0.04, 0, -0.53, 0.35));
  add('dark', rbox(0.42, 0.04, 0.55, 0.012, 0, -0.61, 0.35));
  // Step (left) and hand-holds to the cabin.
  add('steel', rod([0.52, -0.25, -1.25], [0.62, -0.5, -1.25], 0.012, 6));
  add('steel', rbox(0.14, 0.012, 0.1, 0.004, 0.64, -0.51, -1.25));

  // ---------------- engine: the exposed R-985 ----------------
  {
    // Nine cylinders on the black crankcase, the nose case, the ignition
    // harness ring, intake pipes from the blower case behind, exhaust
    // stacks into the collector ring and the stack on the right.
    const cyl = cylinderParts(0.24, 0.585);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const m = new THREE.Matrix4().makeRotationZ(a).premultiply(new THREE.Matrix4().makeTranslation(0, HUB_Y, EZ));
      for (const g of cyl.barrel) add('cyl', g.clone().applyMatrix4(m));
      for (const g of cyl.head) add('head', g.clone().applyMatrix4(m));
      for (const g of cyl.rod) add('steel', g.clone().applyMatrix4(m), true);
      const rot = (p) => new THREE.Vector3(...p).applyMatrix4(m).toArray();
      add('steel', tube([rot([0, 0.2, -0.14]), rot([0, 0.32, -0.13]), rot([0.015, 0.44, -0.08])], 0.018, 8, 6), true);
      add('exhaust', tube([rot([0, 0.5, -0.07]), rot([0, 0.46, -0.16]), rot([0, 0.42, -0.2])], 0.026, 8, 6));
    }
    const crank = lathe([[0.0, EZ - 0.2], [0.21, EZ - 0.2], [0.26, EZ - 0.1], [0.27, EZ + 0.05], [0.23, EZ + 0.1]], 32);
    crank.rotateX(Math.PI / 2); crank.translate(0, HUB_Y, 0);
    add('crank', crank);
    const nose = lathe([[0.22, EZ + 0.09], [0.2, EZ + 0.16], [0.15, PROP_Z - 0.1], [0.08, PROP_Z - 0.05], [0.0, PROP_Z - 0.04]], 28);
    nose.rotateX(Math.PI / 2); nose.translate(0, HUB_Y, 0);
    add('crank', nose);
    add('steel', tx(new THREE.TorusGeometry(0.31, 0.012, 6, 40), 0, HUB_Y, EZ + 0.07), true); // ignition harness
    add('crank', rbox(0.09, 0.08, 0.1, 0.015, 0, HUB_Y + 0.17, EZ + 0.16), true); // prop governor on the nose case
    for (const s of [1, -1]) add('dark', rbox(0.1, 0.11, 0.12, 0.02, s * 0.2, HUB_Y + 0.12, EZ - 0.48), true); // magnetos, behind on the accessory case
    add('crank', tx(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 28), 0, HUB_Y, EZ - 0.3, Math.PI / 2)); // blower / accessory case
    // Collector ring behind the cylinders and the stack on the right side,
    // low, along the fuselage (sooted outlet).
    add('exhaust', tx(new THREE.TorusGeometry(0.43, 0.04, 8, 48), 0, HUB_Y, EZ - 0.22));
    add('exhaust', tube([[-0.3, HUB_Y - 0.33, EZ - 0.22], [-0.5, -0.36, 1.2], [-0.56, -0.45, 0.95], [-0.57, -0.48, 0.72]], 0.055, 20, 10));
    add('soot', tx(new THREE.CylinderGeometry(0.058, 0.058, 0.06, 12), -0.57, -0.485, 0.7, Math.PI / 2 - 0.1));
    // No ring cowl (the photographs of the radial G-164A: the cylinders
    // stand bare in front of the accessory cowl); the dark baffle plate
    // closes the cowl's front behind them, the engine mount ring.
    // Baffle closing the fuselage's nose, cut to its first section (both faces).
    const bf = new THREE.Shape(ring(fwdSt[0], 56).slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y)));
    add('dark', tx(new THREE.ShapeGeometry(bf), 0, 0, fwdSt[0].z));
    add('dark', tx(new THREE.ShapeGeometry(bf), 0, 0, fwdSt[0].z - 0.001, 0, Math.PI, 0));
    add('steel', tx(new THREE.TorusGeometry(0.4, 0.018, 6, 36), 0, HUB_Y, EZ - 0.3), true);
    // Oil cooler under the accessory cowl (left), carburettor air scoop below.
    add('dark', rbox(0.22, 0.16, 0.14, 0.02, 0.25, -0.33, 1.3));
    add('paint', rbox(0.24, 0.12, 0.34, 0.04, 0, -0.43, 1.18));
    add('dark', rbox(0.18, 0.07, 0.02, 0.01, 0, -0.43, 1.355));
  }

  // ---------------- cabin, fairing and turtledeck (one shell) ----------------
  // The arch over the longerons from the windshield's foot to the tail:
  // the raked windshield, the rounded roof crest, the side windows to the
  // door post and behind it, their rear edges curving down with the
  // fairing; behind the cabin the painted fairing falls into the turtledeck
  // on to the fin. Quads are sorted by region: glass, roof (scheme colour,
  // seen from inside too), painted turtledeck.
  const glassG = [];
  {
    const NT = 28, zs = [];
    for (let z = CAB.wsF; z > -5.02 + 1e-6; z -= z > CAB.win - 0.1 ? 0.045 : 0.1) zs.push(z);
    zs.push(-5.02);
    const pos = [], col = [];
    for (const z of zs) for (let k = 0; k <= NT; k++) { const p = shellP(z, k / NT); pos.push(...p); const g = fusAO(p[0], p[1], p[2]); col.push(g, g, g); }
    const reg = { glass: [], roof: [], paint: [] };
    const TW = 0.3; // side window height (fraction of the arch from each longeron)
    for (let si = 0; si < zs.length - 1; si++) for (let k = 0; k < NT; k++) {
      const a = si * (NT + 1) + k, b = a + 1, c = a + NT + 1, d = c + 1;
      const zc = (zs[si] + zs[si + 1]) / 2, tc = (k + 0.5) / NT;
      const r = zc > CAB.wsT ? 'glass' : zc > CAB.win ? (tc < TW || tc > 1 - TW ? 'glass' : 'roof') : 'paint';
      reg[r].push(a, c, b, b, c, d);
    }
    const mk = (idx) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
    glassG.push(mk(reg.glass));
    add('frame', mk(reg.roof));
    add('livery', liveryUV(tagged(mk(reg.paint))));
    // Bulkhead over the seat's back (inside, the turtledeck's front), so the
    // cabin is closed behind the pilot.
    {
      const pts = []; for (let k = 0; k <= NT; k++) { const p = shellP(CAB.win, k / NT); pts.push(new THREE.Vector2(p[0], p[1])); }
      add('frame', tx(new THREE.ShapeGeometry(new THREE.Shape(pts)), 0, 0, CAB.win - 0.005));
    }
    // Frames along the shell: windshield foot, A-posts, the roof's front
    // bow, roof rails, door posts, the windows' rear edges, sill rails.
    const F = (pts, r = 0.022) => add('frame', tube(pts, r, Math.max(4, pts.length * 2), 6));
    const alongZ = (t, z0, z1, n = 10) => Array.from({ length: n + 1 }, (_, i) => shellP(lerp(z0, z1, i / n), t));
    const alongT = (z, t0, t1, n = 12) => Array.from({ length: n + 1 }, (_, i) => shellP(z, lerp(t0, t1, i / n)));
    const b0 = boxAt(CAB.wsF);
    F([[b0.w, CAB.sill + 0.01, CAB.wsF], [-b0.w, CAB.sill + 0.01, CAB.wsF]], 0.026);
    for (const t of [0.13, 0.87]) F(alongZ(t, CAB.wsF - 0.005, CAB.wsT, 8), 0.024);
    F(alongT(CAB.wsT, 0, 1, 20), 0.028);
    for (const t of [TW, 1 - TW]) F(alongZ(t, CAB.wsT, CAB.win, 12), 0.022);
    for (const [t0, t1] of [[0, TW], [1 - TW, 1]]) { F(alongT(CAB.post, t0, t1, 5), 0.022); F(alongT(CAB.win, t0, t1, 5), 0.024); }
    for (const t of [0.002, 0.998]) F(alongZ(t, CAB.wsF, CAB.win, 12), 0.026);
    // Door handle (left side: the door).
    const dh = shellP(-1.45, 0.08);
    add('steel', rod([dh[0] + 0.02, dh[1], dh[2] + 0.08], [dh[0] + 0.02, dh[1], dh[2] - 0.08], 0.008, 6), true);
  }

  // ---------------- wings ----------------
  const prof = airfoil(0, 1, T_UP, 0.04, 0.4, 18);
  const foreProf = airfoil(0, 0.745, T_UP, 0.04, 0.4, 16);
  const aftProf = airfoil(0.755, 1.0, T_UP, 0.04, 0.4, 6);
  const wingAO = (x, xc, lower) => (lower ? 1 : 1);
  const ailerons = [], lowerAil = [];
  const surfaceMesh = (geo, a, b, mat = M.wing) => {
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
    const m = new THREE.Mesh(tagged(geo), mat);
    m.castShadow = true; m.receiveShadow = true;
    deflect.add(m);
    pivot.add(deflect);
    root.add(pivot);
    return deflect;
  };
  // Tip: the trailing corner rounded, the leading corner slightly.
  const TIP = [[0, 0, 0], [0.06, -0.004, -0.04], [0.11, -0.012, -0.14], [0.15, -0.03, -0.38], [0.17, -0.07, -0.85]];
  const buildWing = (W, yAt, Mx, upper) => {
    const st = (x, cut = false) => ({ x, y: yAt(x), le: W.le, chord: W.chord, cut });
    const x0 = upper ? 0 : WL.root - 0.02, xt = W.half - 0.17;
    for (const side of [1, -1]) {
      // Full-chord inner panel to the aileron, fore part along the aileron,
      // full chord again to the tip, the tip cap.
      const inner = [x0, 0.6, 1.4, 2.1, W.ail[0]].filter((v, i, a) => i === 0 || v > a[0]);
      add('wing', wingP(inner.map((x) => st(x)), prof, side, wingAO).applyMatrix4(Mx));
      add('wing', wingP([W.ail[0], (W.ail[0] + W.ail[1]) / 2, W.ail[1]].map((x) => st(x)), foreProf, side, wingAO).applyMatrix4(Mx));
      add('wing', wingP([W.ail[1], xt].map((x) => st(x)), prof, side, wingAO).applyMatrix4(Mx));
      add('wing', wingP(TIP.map(([dx, dy, dc]) => ({ x: xt + dx, y: yAt(xt) + dy * 0.3, le: W.le + dc * 0.06, chord: W.chord + dc })), prof, side, wingAO).applyMatrix4(Mx));
      // Aileron (hinge at 75 % chord).
      const hinge = (x) => new THREE.Vector3(side * x, yAt(x) + 0.01, W.le - 0.75 * W.chord).applyMatrix4(Mx);
      const geo = wingP([W.ail[0] + 0.01, W.ail[1] - 0.01].map((x) => st(x)), aftProf, side, wingAO).applyMatrix4(Mx);
      const d = surfaceMesh(geo, hinge(W.ail[0]), hinge(W.ail[1]));
      (upper ? ailerons : lowerAil).push(d);
      // Nav light in the upper tip, strobe; aileron horns.
      if (upper) {
        const p = new THREE.Vector3(side * (W.half - 0.02), yAt(W.half), W.le - 0.25).applyMatrix4(Mx).toArray();
        add(side > 0 ? 'red' : 'green', ball(p, 0.022, 10));
        add('lens', tx(new THREE.SphereGeometry(0.04, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), ...p, 0, 0, side * Math.PI / 2, [1, 1, 1.3]));
      }
      const hx = (W.ail[0] + W.ail[1]) / 2;
      add('steel', tx(new THREE.BoxGeometry(0.008, 0.07, 0.07), ...new THREE.Vector3(side * hx, yAt(hx) - 0.05, W.le - 0.78 * W.chord).applyMatrix4(Mx).toArray()), true);
    }
  };
  buildWing(WU, () => WU.y, UM, true);
  buildWing(WL, agcatLowerY, LM, false);
  // Lower wing root fairing on the fuselage side.
  for (const sx of [1, -1]) add('paint', tube([[sx * 0.51, -0.31, WL.le + 0.02], [sx * 0.52, -0.32, WL.le - 0.5], [sx * 0.515, -0.34, WL.le - 1.2]], 0.04, 12, 8));
  // Upper wing centre-section fuel filler and gauge, the hand-hold in the
  // trailing edge cut-out.
  add('dark', tx(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 14), 0, WU.y + 0.085, 0.25));
  add('brass', tx(new THREE.CylinderGeometry(0.03, 0.03, 0.035, 12), 0, WU.y + 0.095, 0.25));
  add('steel', rod([0.25, WU.y - 0.06, WU.le - WU.chord + 0.02], [-0.25, WU.y - 0.06, WU.le - WU.chord + 0.02], 0.012, 6), true);
  // Beacon on the upper wing centre (top).
  add('beacon', tx(new THREE.SphereGeometry(0.035, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, WU.y + 0.08, -0.25));

  // ---------------- struts and wires ----------------
  {
    const SX = AGCAT_WING.strutX;
    for (const sx of [1, -1]) {
      // Interplane N strut: front and rear struts spar to spar, the diagonal
      // from the lower rear spar to the upper front spar; spar fittings.
      const uf = upSpar(sx * SX, 0), ur = upSpar(sx * SX, 1), lf = loSpar(sx * SX, 0), lr = loSpar(sx * SX, 1);
      for (const [a, b] of [[lf, uf], [lr, ur], [lr, uf]]) add('paint', strut(a.toArray(), b.toArray(), 0.085, 0.034));
      for (const p of [uf, ur, lf, lr]) add('steel', rbox(0.05, 0.03, 0.08, 0.01, p.x, p.y, p.z), true);
      // Cabane: front and rear struts from the hopper sides up to the upper
      // spars, the diagonal; seen head-on they splay outward.
      const cuf = upSpar(sx * 0.78, 0), cur = upSpar(sx * 0.78, 1);
      const cff = [sx * 0.46, 0.46, 0.78], cfr = [sx * 0.46, 0.5, -0.22];
      for (const [a, b] of [[cff, cuf.toArray()], [cfr, cur.toArray()], [cff, cur.toArray()]]) add('paint', strut(a, b, 0.07, 0.03));
      for (const p of [cff, cfr]) add('steel', rbox(0.06, 0.04, 0.09, 0.012, p[0], p[1] - 0.01, p[2]), true);
      // Flying wires (doubled) from the lower wing root to the upper wing at
      // the interplane strut, landing wires from the cabane top down to the
      // lower wing at the strut; front and rear bays.
      const lroot = (k) => loSpar(sx * (WL.root + 0.06), k), uroot = (k) => upSpar(sx * 0.82, k);
      for (const k of [0, 1]) {
        for (const dz of [-0.025, 0.025]) {
          const o = new THREE.Vector3(0, 0, dz);
          add('wire', rod(lroot(k).add(o).toArray(), (k ? ur : uf).clone().add(o).toArray(), 0.0045, 4));
        }
        add('wire', rod(uroot(k).toArray(), (k ? lr : lf).toArray(), 0.0045, 4));
      }
      // Cabane cross-wire under the centre section.
      add('wire', rod(cuf.toArray(), [-sx * 0.46, 0.5, -0.22], 0.004, 4), true);
    }
  }

  // ---------------- tail ----------------
  // Fin (square-topped, straight swept leading edge), rudder with a horn
  // balance at the top and its bottom to the fuselage's lower line;
  // tailplane on the fuselage, struts underneath, wires to the fin.
  const FIN_T = 0.07, FTOP = 1.55, HINGE_Z = -4.95;
  const finLE = (y) => lerp(-4.3, -4.66, clamp((y - 0.43) / (FTOP - 0.43), 0, 1));
  {
    const ys = [0.36, 0.7, 1.0, 1.3, FTOP];
    const sts = ys.map((y) => ({ x: y, y: 0, le: finLE(y), chord: finLE(y) - HINGE_Z }));
    // Fin built as a wing panel in (span = y) then turned upright.
    const g = wingPanel(sts, airfoil(0, 1, FIN_T, 0, 0.4, 10), 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const X = p.getX(i), Y = p.getY(i); p.setXYZ(i, Y, X, p.getZ(i)); }
    g.computeVertexNormals();
    { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
    add('livery', liveryUV(tagged(g)));
    // Fin cap.
    add('livery', liveryUV(tagged(rbox(0.06, 0.04, finLE(FTOP) - HINGE_Z, 0.018, 0, FTOP, (finLE(FTOP) + HINGE_Z) / 2))));
  }
  const rudPivot = new THREE.Group();
  rudPivot.position.set(0, 0, HINGE_Z);
  const rudder = new THREE.Group();
  {
    const RT = (y) => (y > 1.2 ? lerp(-0.43, -0.3, (y - 1.2) / 0.42) : y < 0.15 ? lerp(-0.3, -0.43, (y + 0.12) / 0.27) : -0.43);
    const ys = [-0.12, 0.15, 0.5, 0.9, 1.2, 1.45, 1.6];
    const sts = ys.map((y) => ({ x: y, y: 0, le: 0, chord: -RT(y) }));
    const g = wingPanel(sts, airfoil(0, 1, 0.09, 0, 0.3, 8), 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const X = p.getX(i), Y = p.getY(i); p.setXYZ(i, Y, X, p.getZ(i)); }
    { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } }
    g.computeVertexNormals();
    // Livery UV in the body frame (the rudder rests at the hinge).
    const rg = tagged(g);
    rg.translate(0, 0, HINGE_Z); liveryUV(rg); rg.translate(0, 0, -HINGE_Z);
    const mesh = new THREE.Mesh(rg, M.livery);
    mesh.castShadow = true;
    rudder.add(mesh);
    add('steel', rod([0, -0.1, -4.97], [0, 1.5, -4.97], 0.012, 6), true);
  }
  rudPivot.add(rudder);
  root.add(rudPivot);
  add('white', ball([0, 0.12, RUDDER_Z + 0.03], 0.018, 8), true);
  const STY = 0.3, SLE = -4.25, SHINGE = -4.78, STIP = 1.85;
  const sst = (x) => ({ x, y: STY + x * 0.005, le: SLE - x * 0.03, chord: SLE - x * 0.03 - (SHINGE - 0.0) });
  for (const side of [1, -1]) {
    add('stab', wingPanel([0.05, 0.9, STIP - 0.12].map(sst), airfoil(0, 1, 0.1, 0, 0.4, 12), side));
    add('tip', wingPanel([STIP - 0.12, STIP - 0.05, STIP].map((x, i) => ({ ...sst(x), chord: sst(x).chord * [1, 0.9, 0.6][i], le: sst(x).le - [0, 0.01, 0.05][i] })), airfoil(0, 1, 0.1, 0, 0.4, 12), side));
    // Strut under the tailplane to the fuselage's lower longeron, wire from
    // the tailplane top to the fin.
    add('gear', strut([side * 1.0, STY - 0.035, -4.45], [side * 0.08, botY(-4.2) + 0.02, -4.2], 0.05, 0.022));
    add('wire', rod([side * 1.0, STY + 0.035, -4.48], [side * 0.03, 1.1, finLE(1.1) - 0.08], 0.004, 4));
    add('wire', rod([side * 1.0, STY + 0.035, -4.62], [side * 0.03, 1.1, HINGE_Z + 0.05], 0.004, 4), true);
  }
  const elevator = new THREE.Group();
  elevator.position.set(0, STY, SHINGE);
  {
    const parts = [];
    for (const side of [1, -1]) {
      const es = (x) => ({ x, y: STY + x * 0.005, le: SHINGE, chord: 0.36 - (x > 1.5 ? (x - 1.5) * 0.3 : 0) });
      parts.push(tagged(wingPanel([0.13, 0.9, 1.5, STIP - 0.02].map(es), airfoil(0, 1, 0.08, 0, 0.25, 6), side)));
    }
    const eg = mergeGeometries(parts);
    eg.translate(0, -STY, -SHINGE);
    const em = new THREE.Mesh(eg, M.stab);
    em.castShadow = true; em.receiveShadow = true;
    elevator.add(em);
  }
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
    const tyre = lathe(tyreProfile(R, Wd, rim), big ? 40 : 24);
    tyre.rotateZ(Math.PI / 2);
    const tm = new THREE.Mesh(tyre, M.tyre);
    tm.castShadow = true; tm.receiveShadow = true;
    const hubG = lathe([[0.0, -Wd * 0.3], [rim * 0.35, -Wd * 0.32], [rim * 0.55, -Wd * 0.18], [rim * 0.9, -Wd * 0.3], [rim + 0.008, -Wd * 0.44],
      [rim + 0.008, Wd * 0.44], [rim * 0.9, Wd * 0.3], [rim * 0.55, Wd * 0.18], [rim * 0.35, Wd * 0.32], [0.0, Wd * 0.3]], big ? 28 : 16);
    hubG.rotateZ(Math.PI / 2);
    const parts = [tagged(hubG)];
    if (big) for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; parts.push(tagged(tx(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8), sx * Wd * 0.33, Math.cos(a) * rim * 0.55, Math.sin(a) * rim * 0.55, 0, 0, Math.PI / 2))); }
    spin.add(tm, new THREE.Mesh(mergeGeometries(parts), M.hub));
    return spin;
  };
  for (const [name, sx] of [['mainL', 1], ['mainR', -1]]) {
    const cfg = gearCfg[name];
    const R = cfg.radius, Wd = 0.25;
    const ax = cfg.p[0], ay = cfg.p[1] + R, az = cfg.p[2];
    const g = new THREE.Group();
    // Spring leg from the lower longeron, splayed out and down to the axle
    // inboard of the wheel; the drag brace back to the lower wing's front
    // spar fitting; brake line.
    const top = [sx * 0.45, -0.45, 0.78];
    const attachY = top[1];
    const leg = new THREE.Group();
    leg.position.y = attachY;
    const Lp = (p) => [p[0], p[1] - attachY, p[2]];
    const axIn = ax - sx * 0.16;
    const parts = [
      strut(Lp(top), Lp([axIn, ay + 0.05, az]), 0.1, 0.06),
      strut(Lp([sx * 0.44, -0.47, 0.05]), Lp([axIn, ay + 0.08, az - 0.04]), 0.06, 0.04),
      tx(new RoundedBoxGeometry(0.1, 0.14, 0.18, 2, 0.025), ...Lp([axIn, ay + 0.03, az])),
      rod(Lp([axIn, ay, az]), Lp([ax - sx * 0.02, ay, az]), 0.035, 10),
    ];
    const legMesh = new THREE.Mesh(mergeGeometries(parts.map((p) => tagged(p))), M.gear);
    legMesh.castShadow = true; legMesh.receiveShadow = true;
    const line = new THREE.Mesh(tagged(tube([Lp([sx * 0.49, -0.47, 0.7]), Lp([lerp(top[0], axIn, 0.5), lerp(-0.45, ay, 0.5), az + 0.02]), Lp([axIn - sx * 0.02, ay + 0.1, az - 0.06])], 0.008, 14, 5)), M.rubber);
    leg.add(legMesh, line);
    g.add(leg);
    add('dark', rbox(0.12, 0.06, 0.16, 0.02, top[0], top[1] + 0.02, top[2]));
    const wheel = new THREE.Group();
    wheel.position.set(ax, ay, az);
    const spin = makeWheel(R, Wd, 0.15, sx, true);
    const brake = new THREE.Mesh(tagged(tx(new THREE.CylinderGeometry(0.14, 0.14, 0.014, 22), -sx * 0.1, 0, 0, 0, 0, Math.PI / 2)), M.steel);
    const caliper = new THREE.Mesh(tagged(new RoundedBoxGeometry(0.06, 0.09, 0.1, 2, 0.012).translate(-sx * 0.105, 0.1, -0.05)), M.dark);
    wheel.add(spin, brake, caliper);
    g.add(wheel);
    root.add(g);
    gearGroups[name] = { group: g, wheel, spin, leg, legH: attachY - ay, rest: wheel.position.clone(), sx };
  }
  {
    // Tailwheel: a long leaf spring from the fuselage bottom down and aft,
    // the steerable fork with its springs to the rudder horns.
    const cfg = gearCfg.tail;
    const g = new THREE.Group();
    const R = cfg.radius;
    const fz = cfg.p[2] + 0.1, fy = cfg.p[1] + R + 0.14;
    const z0 = -4.2;
    add('ink', strut([0, botY(z0) + 0.03, z0], [0, fy + 0.03, fz], 0.07, 0.022));
    add('dark', rbox(0.1, 0.05, 0.18, 0.015, 0, botY(z0) + 0.02, z0));
    const fork = new THREE.Group();
    fork.position.set(0, fy, fz);
    fork.add(new THREE.Mesh(mergeGeometries([
      tagged(tx(new THREE.BoxGeometry(0.014, 0.17, 0.06), 0.065, -0.07, -0.06, 0.45)), tagged(tx(new THREE.BoxGeometry(0.014, 0.17, 0.06), -0.065, -0.07, -0.06, 0.45)),
      tagged(tx(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 10), 0, 0.03, 0)),
    ]), M.steel));
    const wheel = new THREE.Group();
    wheel.position.set(0, -0.14, -0.1);
    wheel.add(makeWheel(R, 0.09, 0.07, 1, false));
    fork.add(wheel);
    g.add(fork);
    root.add(g);
    for (const sx of [1, -1]) add('steel', rod([sx * 0.07, fy + 0.03, fz + 0.03], [sx * 0.1, 0.15, -5.0], 0.005, 5), true);
    gearGroups.tail = { group: g, wheel, spin: wheel.children[0], fork, rest: wheel.position.clone(), sx: 0 };
  }

  // ---------------- spray system ----------------
  // Booms behind and under the lower wing's trailing edge on five hangers a
  // side, nozzles hanging from them, crossed under the belly to the
  // gatebox; the windmill pump under the belly between the main legs.
  const nozzles = [];
  const BZ = -1.45, BY = -0.56, BX = 4.7;
  for (const side of [1, -1]) {
    add('alu', rod([side * 0.3, BY, BZ], [side * BX, BY, BZ], 0.022, 10));
    add('alu', ball([side * BX, BY, BZ], 0.028, 10));
    for (const hx of [0.9, 1.9, 2.9, 3.8, 4.55]) {
      const topP = loAt(side * hx, 0.88).add(new THREE.Vector3(0, -0.03, 0)).toArray();
      add('alu', rod(topP, [side * hx, BY + 0.02, BZ], 0.011, 6));
      add('dark', tx(new THREE.CylinderGeometry(0.03, 0.03, 0.028, 10), side * hx, BY, BZ, 0, 0, Math.PI / 2), true);
    }
    const NZ = 16;
    for (let k = 0; k < NZ; k++) {
      const x = 0.55 + ((BX - 0.1 - 0.55) * k) / (NZ - 1);
      add('alu', rod([side * x, BY, BZ], [side * x, BY - 0.055, BZ - 0.01], 0.006, 5), true);
      add('red', tx(new THREE.CylinderGeometry(0.016, 0.013, 0.04, 8), side * x, BY - 0.075, BZ - 0.015, 0.25), true);
      add('brass', tx(new THREE.ConeGeometry(0.008, 0.02, 6), side * x, BY - 0.105, BZ - 0.022, Math.PI + 0.25), true);
      nozzles.push(new THREE.Vector3(side * x, BY - 0.11, BZ - 0.025));
    }
  }
  add('alu', tube([[0, -0.63, 0.3], [0, -0.64, -0.3], [0, -0.6, -1.0], [0, BY, BZ]], 0.03, 20, 8));
  const pump = new THREE.Group();
  pump.position.set(0, -0.66, 0.5);
  {
    const body = lathe([[0.0, -0.18], [0.07, -0.17], [0.088, -0.1], [0.092, 0.05], [0.078, 0.14], [0.045, 0.18], [0.0, 0.19]], 20);
    body.rotateX(Math.PI / 2);
    pump.add(new THREE.Mesh(tagged(body), M.dark));
    pump.add(new THREE.Mesh(tagged(rod([0, 0.08, 0], [0, 0.17, 0.02], 0.022, 8)), M.dark));
  }
  const pumpFan = new THREE.Group();
  pumpFan.position.z = 0.21;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI * 2) / 6;
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.04, 0.008), M.orange);
    bl.position.set(Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0);
    bl.rotation.z = a; bl.rotation.x = 0.4;
    pumpFan.add(bl);
  }
  pump.add(pumpFan);
  root.add(pump);

  // ---------------- propeller (Hamilton Standard, two blades) ----------------
  const PR = A.propRadius;
  const prop = new THREE.Group();
  prop.position.set(0, HUB_Y, PROP_Z);
  {
    // Bare hub: the barrel with its clamps, the counterweight brackets
    // on the blade shanks, the front dome (no spinner).
    const parts = [
      tagged(tx(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 20), 0, 0, -0.02, Math.PI / 2)),
      tagged(tx(new THREE.SphereGeometry(0.095, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0, 0.08, Math.PI / 2)),
      tagged(tx(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 16), 0, 0, 0.17, Math.PI / 2)),
    ];
    for (const s of [1, -1]) {
      parts.push(tagged(tx(new THREE.CylinderGeometry(0.075, 0.075, 0.12, 16), s * 0.14, 0, 0, 0, 0, Math.PI / 2)));
      parts.push(tagged(tx(new THREE.BoxGeometry(0.05, 0.16, 0.08), s * 0.14, 0, 0.09)));
    }
    const hubMesh = new THREE.Mesh(mergeGeometries(parts), M.hub);
    hubMesh.castShadow = true;
    prop.add(hubMesh);
  }
  const blades = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(L0.blade), roughness: 0.55, metalness: 0.25, transparent: true });
  const tipMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(L0.bladeTip), roughness: 0.5, transparent: true });
  const bodyGeo = bladeLoft(0.13, PR - 0.1, 16, PR), tipGeo = bladeLoft(PR - 0.1, PR, 3, PR);
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

  // ---------------- cockpit (Prompt 02) ----------------
  // The G-164A cockpit (agcatCockpit.js) in this same body frame, on the
  // cabin's anchors; its instrument textures come from agcatPanel.js.
  const C = AGCAT_CABIN;
  // Built in its own frame (anchors CK_DZ forward of the body's), then moved
  // into the cabin.
  const loc = (v) => [v[0], v[1], v[2] - CK_DZ];
  const ck = buildAgCatCockpit({
    panel, envMap: opts.envMap ?? null, harnessMat: M.harness,
    C: { ...C, eye: loc(C.eye), seat: loc(C.seat) }, CAB: { sill: CAB.sill, hwS: CAB.hwS, wsF: CAB.wsF - CK_DZ, rF: CAB.rF - CK_DZ },
  });
  const { cockpit, stick, pedals, throttle, valve, leds } = ck;
  cockpit.position.z = CK_DZ;
  const THR = [AGCAT_CK.throttle[0], AGCAT_CK.throttle[1], AGCAT_CK.throttle[2] + CK_DZ];
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
    m.castShadow = !isFine && mat !== M.glass && mat !== M.lens && mat !== M.wire;
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

  const eye = new THREE.Vector3(...C.eye);
  let bladeAngle = 0.18, t = 0;
  const update = (dt, fm, ac) => {
    t += dt;
    ck.update(dt, fm, ac);
    const o = fm.out;
    const pf = fm.shaftPower / A.maxPower;
    const target = fm.engine === 'running' ? 0.16 + 0.34 * clamp((o.airspeed - 15) / 40, 0, 1) + 0.08 * pf : 0.16;
    bladeAngle += clamp(target - bladeAngle, -dt * 0.8, dt * 0.8);
    for (const pg of pitchGroups) pg.rotation.x = bladeAngle;
    // The lower ailerons are linked to the upper ones (push-rods).
    lowerAil[0].rotation.x = ailerons[0].rotation.x;
    lowerAil[1].rotation.x = ailerons[1].rotation.x;
    const on = fm.engine !== 'off';
    M.beacon.emissiveIntensity = on ? 0.6 + 2.4 * Math.max(0, Math.sin(t * 7.5)) ** 8 : 0;
    M.strobe.emissiveIntensity = on && t % 1.2 < 0.06 ? 4 : 0;
  };
  const swap = (mat, n) => { mat.map.dispose(); mat.bumpMap.dispose(); mat.map = n.map; mat.bumpMap = n.bump; mat.needsUpdate = true; };
  return {
    setReg(r) { REG = r; swap(M.livery, liveryTextures(REG, AGCAT_LIVERIES[livery])); },
    setLivery(i) {
      const k = ((i % AGCAT_LIVERIES.length) + AGCAT_LIVERIES.length) % AGCAT_LIVERIES.length;
      if (k === livery) return;
      livery = k;
      const L = AGCAT_LIVERIES[k];
      swap(M.livery, liveryTextures(REG, L));
      swap(M.wing, wingTextures(L));
      for (const [m, cc] of [[M.frame, L.frame], [M.tip, L.tip], [M.stab, L.stab], [M.gear, L.gear]]) m.color.set(cc).multiplyScalar(ALB);
      bladeMat.color.set(L.blade); tipMat.color.set(L.bladeTip);
    },
    get livery() { return livery; },
    root, M,
    refs: { ...Object.fromEntries(Object.entries(C).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, new THREE.Vector3(...v)])), floorY: C.floorY },
    prop, blades, bladeMats: [bladeMat, tipMat], disc,
    ailerons, lowerAilerons: lowerAil, flaps: [], elevator, rudder,
    gear: gearGroups,
    stick, pedals, throttle, valve, leds, panelMesh: ck.panelMesh, inst: { pick: ck.pick, pickables: ck.pickables, needles: ck.needles, card: ck.card },
    pumpFan, pilot, cockpit, glassMesh,
    eye,
    nozzles,
    fuelFiller: new THREE.Vector3(0, WU.y + 0.1, 0.25),
    hopperPort: new THREE.Vector3(0.59, -0.16, 0.3),
    update,
  };
}
