// Procedural Bell 206B-3 JetRanger III in the agricultural configuration
// (DART / Simplex Aerospace Model 4900 spray kit), own markings (PR-AGJ,
// AGRO WINGS) in three paint schemes on one geometry. VISUAL ONLY: the
// physics (FLIGHT_B206 and src/flight/heliModel.js), the skid contact points
// and the hard points are read here only to place parts.
// Body frame: +Z nose, +Y up, +X left; origin = CG, under the main-rotor mast.
//
// Construction (helpers shared with the R44, model.js and r44Model.js): the
// cabin is one lofted shell with the JetRanger's round nose, the large
// two-piece windshield wrapping round to the front doors, a front and a rear
// door window per side and the green-tinted roof windows, cut exactly along
// their outlines, sealed, with a dark inner skin; the transmission and
// engine fairing ("doghouse") on the roof with the engine air inlets and the
// two upturned exhaust stacks; the aft fuselage, the long tapered tail boom
// with the horizontal stabiliser and its end-plate fins, the swept upper and
// lower fins, the tail skid and the two-blade tail rotor on the left of the
// fin; low skid gear on arched cross tubes. Spray kit: the carbon-glass
// belly tank between the cross tubes (530 L), its pump and manifold, the
// 11 m boom (95 % of the rotor diameter) as a light truss with 44 nozzles,
// clamped to the skid tubes and braced to the fuselage. The two-blade
// teetering main rotor (counter-clockwise from above) cones with rotor
// speed, tilts with the simulated tip-path plane and is drawn with the R44's
// speed-dependent motion blur (never a solid disc).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { rng, clamp, smoothstep, lerp } from '../core/math.js';
import { FLIGHT_B206 } from '../config.js';
import { sampleStations, ring, loft, K, airfoil, wingPanel, tagged, tx, rod, tube, ball, rbox, lathe, orangePeel, ribTexture, buildPilot } from './model.js';
import { roundPoly, polyRegion, halfWidthAt, stationAt, soupOf, splitSoup, soupGeo, innerShell, blurMaterial, bladeGeo, carpetTexture } from './r44Model.js';
import { createB206Instruments } from './b206Cockpit.js';

const A = FLIGHT_B206;
const R = A.rotor, TR = A.tailRotor;
const GROUND = A.skids[0][1]; // skid bottom
const SKID_X = Math.abs(A.skids[0][0]);
// Seated pilot: the shared pilot (PR-AGW frame) moved into the right seat.
export const B206_OFF = new THREE.Vector3(-0.34, -0.55, 1.55);
const OFF = B206_OFF;
const o3 = (x, y, z) => [x + OFF.x, y + OFF.y, z + OFF.z];
const THR = [0.25, 0.12, -0.3]; // collective grip (left hand), PR-AGW frame
const ELBOW_L = [0.32 + (THR[0] - 0.415) * 0.6, 0.56 + (THR[1] - 0.5) * 0.6, -0.4 + (THR[2] - 0.05) * 0.6];
const COLL_PIVOT = [0.27, -0.06, -0.92];
const TAIL_HUB = new THREE.Vector3(TR.x, TR.height, -TR.arm);
// Spray kit (Simplex 4900): belly tank between the cross tubes, boom under it.
export const B206_KIT = {
  tank: { z0: -0.84, z1: 0.66, hw: 0.6, top: -0.765, bot: -1.1 },
  // 10.7 m (35 ft) boom, mid-ship between the tank and the forward cross
  // tube, 0.3 m over the ground (≈ 3° of roll before a tip touches).
  boom: { half: 5.35, y: -0.98, z: 0.82 },
  cross: [0.95, -0.95], // skid cross tubes
};
const BOOM = B206_KIT.boom;

// Ground shadow planform for createContactShadow().
export const B206_SHADOW = { W: 12, L: 14, wing: [5.35, 0.76, 0.88], fus: [0.68, 0.0, 2.75], tail: [1.0, -4.55, -4.1], core: [1.7, 2.9] };

// ==========================================================================
// Stations K(z, half-width, shoulder y, bottom y, top y, pU, pL).
// Round JetRanger nose, cabin 1.29 m wide, flat floor at -0.68 inside.
const CAB_KEYS = [
  K(2.7, 0.05, -0.33, -0.4, -0.25, 2.0, 2.0), K(2.65, 0.29, -0.31, -0.54, -0.05, 2.2, 2.3),
  K(2.54, 0.45, -0.28, -0.67, 0.16, 2.4, 2.6), K(2.34, 0.56, -0.23, -0.76, 0.36, 2.6, 3.0),
  K(2.05, 0.62, -0.18, -0.8, 0.52, 2.9, 3.6), K(1.74, 0.643, -0.13, -0.81, 0.62, 3.2, 4.2),
  K(1.38, 0.648, -0.09, -0.81, 0.68, 3.6, 4.5), K(0.8, 0.648, -0.06, -0.81, 0.705, 3.8, 4.6),
  K(0.2, 0.643, -0.04, -0.8, 0.715, 3.8, 4.5), K(-0.35, 0.625, -0.01, -0.77, 0.715, 3.6, 4.2),
  K(-0.8, 0.585, 0.04, -0.71, 0.705, 3.2, 3.6),
];
// Transmission / engine fairing on the roof (upper shell only).
const FAIR_KEYS = [
  K(1.22, 0.04, 0.69, 0.5, 0.705, 2.2, 2.2), K(1.02, 0.28, 0.69, 0.5, 0.86, 2.4, 2.4),
  K(0.62, 0.38, 0.69, 0.5, 1.0, 2.8, 2.4), K(0.2, 0.41, 0.69, 0.5, 1.08, 3.0, 2.4),
  K(-0.25, 0.41, 0.69, 0.5, 1.1, 3.0, 2.4), K(-0.7, 0.4, 0.69, 0.5, 1.08, 3.0, 2.4),
  K(-1.15, 0.37, 0.68, 0.5, 1.04, 2.8, 2.4), K(-1.6, 0.31, 0.64, 0.5, 0.97, 2.6, 2.4),
  K(-1.95, 0.24, 0.6, 0.45, 0.86, 2.4, 2.4), K(-2.2, 0.17, 0.57, 0.42, 0.72, 2.2, 2.2),
];
// Aft fuselage under the engine, into the tail-boom root.
const AFT_KEYS = [
  K(-0.8, 0.585, 0.04, -0.71, 0.705, 3.2, 3.6), K(-1.2, 0.52, 0.12, -0.56, 0.69, 2.9, 3.1),
  K(-1.6, 0.42, 0.22, -0.32, 0.66, 2.6, 2.7), K(-1.95, 0.3, 0.31, -0.05, 0.62, 2.4, 2.4),
  K(-2.2, 0.215, 0.37, 0.155, 0.585, 2.2, 2.2),
];
const TC0 = -2.2, TC1 = -6.05;
const tcAt = (z) => { const t = clamp((TC0 - z) / (TC0 - TC1), 0, 1); return { r: lerp(0.215, 0.092, t), y: lerp(0.37, 0.45, t) }; };

// Window outlines in the side projection (z, y), same on both sides.
const zA = (y) => 1.6 + 0.36 * (0.66 - y); // windshield side edge (front door post)
const WS_TOP = 0.665;
const WS_BOTTOM_AT = (z) => Math.max(-0.36, -0.36 + 0.15 * (z - 2.3));
const FRONT_WIN = roundPoly([[1.02, -0.2], [zA(-0.2) - 0.055, -0.2], [zA(0.6) - 0.055, 0.6], [1.02, 0.6]], 0.06);
const REAR_WIN = roundPoly([[0.05, 0.02], [0.78, 0.02], [0.78, 0.58], [0.05, 0.58]], 0.07);
const WS_REGION = (sx) => [[0, 0.36, 1, -(1.6 + 0.36 * 0.66)], [0, -1, 0, WS_TOP], [0, 1, 0, 0.36], [0, 1, -0.15, 0.36 + 0.15 * 2.3], [sx, 0, 0, -0.013]];
// Green-tinted roof windows over the pilots.
const ROOF_REGION = (sx) => [[0, 1, 0, -0.62], [0, 0, 1, -1.08], [0, 0, -1, 1.55], [sx, 0, 0, -0.07], [-sx, 0, 0, 0.5]];

// ==========================================================================
// Livery: side projection (z, y); top half = left side (nose to the left),
// bottom half = right side (nose to the right).
const LV = { Z0: -6.95, Z1: 2.75, Y0: -1.0, Y1: 1.55, W: 2048, H: 1024, M: 6 };
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

// Three schemes inspired by the reference photos (fictional markings).
export const B206_LIVERIES = [
  // A — Agricultural Classic: white with green and blue stripes.
  { id: 'classic', name: 'Agricultural Classic', base: '#f0f0ea', upper: '#f0f0ea', belly: '#f0f0ea', s1: '#13704f', s2: '#1d3f7a', s3: '#2fa889', text: '#1d3f7a', tank: '#ecebe4', paint: '#f0f0ea', fin: '#1d3f7a' },
  // B — Dark Green Agricultural: metallic dark green over cream, discreet stripes, light tank.
  { id: 'green', name: 'Dark Green Agricultural', base: '#0f4a32', upper: '#0f4a32', belly: '#ece9de', s1: '#1c2f6e', s2: '#ece9de', s3: '#0f4a32', text: '#ece9de', tank: '#e9e7dd', paint: '#0f4a32', fin: '#0f4a32' },
  // C — Red Utility: red with light details.
  { id: 'red', name: 'Red Utility', base: '#c4231b', upper: '#c4231b', belly: '#c4231b', s1: '#f2f0ea', s2: '#2a2c30', s3: '#f2f0ea', text: '#f2f0ea', tank: '#efeee8', paint: '#c4231b', fin: '#c4231b' },
];

function liveryTexture(L, reg, bumpCtx) {
  const c = canvas(LV.W, LV.H);
  const g = c.getContext('2d');
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
    // Lower body (scheme B: cream belly below a line from the nose up the boom).
    if (L.belly !== L.base) poly([[2.8, -0.48], [1.2, -0.42], [-0.4, -0.36], [-1.4, -0.18], [-2.2, 0.2], [-6.2, 0.38], [-6.2, -1.0], [2.8, -1.0]], L.belly);
    // The stripes: from the lower nose, along the cabin under the windows,
    // sweeping up the aft body onto the tail boom (as on the photos).
    const sweep = (dy) => [[2.72, -0.5 + dy], [2.3, -0.5 + dy], [1.2, -0.44 + dy], [-0.4, -0.38 + dy], [-1.4, -0.2 + dy], [-2.2, 0.18 + dy], [-3.5, 0.31 + dy], [-5.6, 0.39 + dy], [-6.3, 0.41 + dy]];
    const band = (dy0, dy1, col) => { const a = sweep(dy0), b = sweep(dy1).reverse(); poly([...a, ...b], col); };
    if (L.id === 'classic') {
      band(0.0, 0.075, L.s1); band(0.095, 0.13, L.s2); band(0.145, 0.165, L.s3);
      // Navy tail-boom end band.
      poly([[-5.65, 0.0], [-6.95, 0.0], [-6.95, 1.0], [-5.65, 1.0]], L.s2);
    } else if (L.id === 'green') {
      band(0.0, 0.03, L.s1); band(0.045, 0.06, L.s2);
    } else {
      band(0.0, 0.05, L.s1); band(0.065, 0.085, L.s2); band(0.1, 0.115, L.s1);
    }
    // Upper cowl: dark inlet louvres and the engine-deck panels.
    for (let k = 0; k < 7; k++) {
      const z = -0.32 - k * 0.07;
      const [x0, y0] = P(z, 0.95), [, y1] = P(z, 0.8);
      g.fillStyle = 'rgba(15,15,15,0.85)'; g.fillRect(x0 - 3, y0, 6, y1 - y0);
      bumpCtx.fillStyle = '#303030'; bumpCtx.fillRect(x0 - 3, y0, 6, y1 - y0);
    }
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
    const boomText = L.id === 'classic' ? L.s2 : L.text;
    text(reg, -3.6, tcAt(-3.6).y + 0.02, 0.2, boomText, 'bold', 5);
    text('AGRO WINGS', -1.05, 0.48, 0.1, L.id === 'classic' ? L.s1 : L.text, 'bold', 3);
    text('PERIGO · ROTOR DE CAUDA', -5.3, tcAt(-5.3).y + 0.05, 0.035, L.id === 'classic' ? L.s2 : L.text);
    text('JET-A', -0.62, -0.05, 0.03, L.id === 'classic' ? L.s2 : L.text);
    // Brazilian flag on the tail boom.
    {
      const [fx, fy] = P(-2.75, tcAt(-2.75).y + 0.05);
      const w = 0.2 * LV.kx, h = 0.13 * LV.ky;
      g.fillStyle = '#1a8a3a'; g.fillRect(fx - w / 2, fy - h / 2, w, h);
      g.fillStyle = '#f6cf2a';
      g.beginPath(); g.moveTo(fx - w * 0.42, fy); g.lineTo(fx, fy - h * 0.42); g.lineTo(fx + w * 0.42, fy); g.lineTo(fx, fy + h * 0.42); g.closePath(); g.fill();
      g.fillStyle = '#1f3c8a'; g.beginPath(); g.arc(fx, fy, h * 0.24, 0, Math.PI * 2); g.fill();
    }
    // Door outlines, cowl and baggage-door seams, boom rivet rings.
    const yr = 0.69;
    const frontDoor = [[0.96, -0.68], [0.96, yr], [zA(yr) - 0.02, yr], ...[0.4, 0.1, -0.2, -0.36].map((y) => [zA(y) - 0.02, y]), [zA(-0.36) - 0.12, -0.68]];
    const rearDoor = [[0.88, -0.68], [0.88, yr], [-0.05, yr], [-0.05, -0.68]];
    const seams = [
      [...frontDoor, frontDoor[0]], [...rearDoor, rearDoor[0]],
      [[-0.5, -0.5], [-0.5, 0.45], [-1.1, 0.45], [-1.1, -0.4], [-0.5, -0.5]], // baggage door
      [[0.25, 0.7], [0.25, 1.05]], [[-0.85, 0.72], [-0.85, 1.08]], [[-1.65, 0.66], [-1.65, 0.98]],
    ];
    for (let z = TC0 - 0.15; z > TC1; z -= 0.55) { const t = tcAt(z); seams.push([[z, t.y - t.r], [z, t.y + t.r]]); }
    const seamCol = L.id === 'classic' ? 'rgba(60,60,60,0.35)' : 'rgba(0,0,0,0.45)';
    for (const s of seams) {
      line(g, s, seamCol, 2);
      line(bumpCtx, s, '#3a3a3a', 2.6);
    }
    for (let z = TC0 - 0.15; z > TC1; z -= 0.55) {
      const t = tcAt(z);
      for (let y = t.y - t.r * 0.95; y < t.y + t.r * 0.95; y += 0.035) {
        for (const dz of [0.02, -0.02]) {
          const [px, py] = P(z + dz, y);
          bumpCtx.fillStyle = '#5a5a5a'; bumpCtx.beginPath(); bumpCtx.arc(px, py, 1.3, 0, Math.PI * 2); bumpCtx.fill();
        }
      }
    }
    // Exhaust soot on the upper aft cowl, worn paint at the door sills.
    const [scx, scy] = P(-1.8, 0.95);
    const soot = g.createRadialGradient(scx, scy, 4, scx, scy, 110);
    soot.addColorStop(0, 'rgba(20,16,14,0.3)'); soot.addColorStop(1, 'rgba(20,16,14,0)');
    g.fillStyle = soot; g.fillRect(scx - 120, scy - 120, 240, 240);
    const r = rng(side > 0 ? 17 : 18);
    for (let i = 0; i < 140; i++) {
      const [px, py] = P(0.0 + r() * 1.9, -0.66 + r() * 0.2);
      g.fillStyle = `rgba(120,110,100,${0.05 + r() * 0.08})`; g.fillRect(px, py, 1 + r() * 3, 1);
    }
  }
  return canvasTexture(c, { aniso: 8 });
}

// Yellow warning placard / ag-kit decal.
function decalTexture(text, bg = '#f2c400', fg = '#111') {
  const c = canvas(256, 64);
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 64);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 26px Arial, sans-serif';
  g.fillText(text, 128, 33);
  return canvasTexture(c, { aniso: 4 });
}

// Beige leather (seats) with stitched panels.
function leatherTexture() {
  return ribTexture('#9c7a55', 'rgba(60,40,20,0.45)', 6);
}

// ==========================================================================
export function createB206Model(panel, opts = {}) {
  const root = new THREE.Group();
  root.name = 'b206';
  let REG = opts.reg ?? 'PR-AGJ';
  // Livery canvases are drawn on first use (one per scheme, shared geometry).
  const bumpC = canvas(LV.W, LV.H);
  const gb = bumpC.getContext('2d');
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, LV.W, LV.H);
  orangePeel(gb, LV.W, LV.H, 54);
  const livMaps = [];
  const livMap = (i) => (livMaps[i] ??= liveryTexture(B206_LIVERIES[i], REG, gb));
  const map0 = livMap(0);
  const bump = canvasTexture(bumpC, { srgb: false, aniso: 4 });
  const coat = { roughness: 0.38, metalness: 0.0, specularIntensity: 0.35, clearcoat: 0.35, clearcoatRoughness: 0.2, envMap: opts.envMap ?? null, envMapIntensity: 0.35 };
  const ALB = 0.88;
  const M = {
    livery: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALB), map: map0, bumpMap: bump, bumpScale: 1.3, vertexColors: true, ...coat }),
    paint: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(B206_LIVERIES[0].paint).multiplyScalar(ALB), vertexColors: true, ...coat }),
    fin: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(B206_LIVERIES[0].fin).multiplyScalar(ALB), vertexColors: true, ...coat }),
    seal: new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.75, metalness: 0.05, vertexColors: true }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.62, metalness: 0.1, vertexColors: true }),
    interior: new THREE.MeshStandardMaterial({ color: 0x8e8573, roughness: 0.85, metalness: 0.02 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xbfb39a, roughness: 0.8, metalness: 0.02, vertexColors: true }),
    floor: new THREE.MeshStandardMaterial({ color: 0xffffff, map: carpetTexture(), roughness: 0.97, metalness: 0, vertexColors: true }),
    satin: new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.42, metalness: 0.35, vertexColors: true }),
    seat: new THREE.MeshStandardMaterial({ color: 0xffffff, map: leatherTexture(), roughness: 0.62, vertexColors: true }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc6cacd, roughness: 0.3, metalness: 0.9, vertexColors: true }),
    skid: new THREE.MeshStandardMaterial({ color: 0xb9bcbe, roughness: 0.38, metalness: 0.75, vertexColors: true }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe4e7ea, roughness: 0.12, metalness: 1.0, envMap: opts.envMap ?? null, envMapIntensity: 0.9 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.45, metalness: 0.75, vertexColors: true }),
    boom: new THREE.MeshStandardMaterial({ color: 0xd6d8d6, roughness: 0.4, metalness: 0.6, vertexColors: true }),
    engine: new THREE.MeshStandardMaterial({ color: 0x3b3f44, roughness: 0.55, metalness: 0.55, vertexColors: true }),
    exhaust: new THREE.MeshStandardMaterial({ color: 0x2c2a28, roughness: 0.5, metalness: 0.7, vertexColors: true }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.94, metalness: 0, vertexColors: true }),
    gloss: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.28, metalness: 0.1, vertexColors: true }),
    blade: new THREE.MeshStandardMaterial({ color: 0x2e3135, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide, envMap: opts.envMap ?? null, envMapIntensity: 0.5 }),
    bladeTip: new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.45, metalness: 0.2, side: THREE.DoubleSide }),
    tblade: new THREE.MeshStandardMaterial({ color: 0xd9dbdc, roughness: 0.45, metalness: 0.3, side: THREE.DoubleSide }),
    tank: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(B206_LIVERIES[0].tank), roughness: 0.5, metalness: 0.0, clearcoat: 0.2, vertexColors: true }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb8913c, roughness: 0.35, metalness: 0.9, vertexColors: true }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xaec2c9, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.15, clearcoat: 1, clearcoatRoughness: 0.02, envMap: opts.envMap ?? null, envMapIntensity: 1.5, depthWrite: false, side: THREE.DoubleSide }),
    tint: new THREE.MeshPhysicalMaterial({ color: 0x3f7a5c, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.45, clearcoat: 1, envMap: opts.envMap ?? null, envMapIntensity: 1.2, depthWrite: false, side: THREE.DoubleSide }),
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
    helmStripe: new THREE.MeshPhysicalMaterial({ color: 0x1d3f7a, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    harness: new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.8 }),
  };

  const B = {}; // airframe parts per material ('fine:' = dropped beyond 40 m)
  const K_ = {}; // spray-kit parts per material (hidden with the kit)
  const add = (mat, g, fine = false) => { const k = (fine ? 'fine:' : '') + mat; (B[k] ||= []).push(tagged(g)); };
  const addK = (mat, g, fine = false) => { const k = (fine ? 'fine:' : '') + mat; (K_[k] ||= []).push(tagged(g)); };

  // ---------------- cabin ----------------
  const cabSt = sampleStations(CAB_KEYS, 44);
  const cabAO = (x, y, z) => {
    let a = 1 - Math.max(0, -y - 0.45) * 0.45;
    if (z < -0.5) a *= 0.92;
    return clamp(a, 0.55, 1);
  };
  const cabinShell = (st, around) => {
    let rest = soupOf(loft(st, around, cabAO));
    const glassTris = [], tintTris = [];
    for (const sx of [1, -1]) {
      for (const region of [WS_REGION(sx), polyRegion(FRONT_WIN, sx), polyRegion(REAR_WIN, sx)]) {
        const sp = splitSoup(rest, region);
        glassTris.push(...sp.inn);
        rest = sp.out;
      }
      const sp = splitSoup(rest, ROOF_REGION(sx));
      tintTris.push(...sp.inn);
      rest = sp.out;
    }
    const paint = liveryUV(soupGeo(rest));
    return { paint, glass: soupGeo(glassTris), tint: soupGeo(tintTris), inner: innerShell(paint, 0.014) };
  };
  const cabHi = cabinShell(cabSt, 128), cabLo = cabinShell(sampleStations(CAB_KEYS, 12), 36);
  // Window seals, the windshield centre post and frames.
  const surf = (list, z, y, sx, off = 0.006) => [sx * (halfWidthAt(stationAt(list, z), y) + off), y, z];
  const seal = (pts, r = 0.016) => { if (pts.length > 1) add('seal', tube(pts, r, Math.max(8, pts.length * 2), 6)); };
  for (const sx of [1, -1]) {
    for (const W of [FRONT_WIN, REAR_WIN]) seal([...W, W[0]].map(([z, y]) => surf(cabSt, z, y, sx)), 0.013);
    // Door post (windshield side edge), slim as on the JetRanger.
    const ap = [];
    for (let y = WS_TOP; y >= -0.36; y -= 0.04) ap.push(surf(cabSt, zA(y), y, sx));
    seal(ap, 0.017);
    // Windshield lower edge round the nose.
    const wb = [];
    for (let z = zA(-0.36); z <= 2.66; z += 0.02) {
      const s = stationAt(cabSt, z), y = WS_BOTTOM_AT(z);
      if (s.yb > y || s.z < z - 0.05) break;
      wb.push(surf(cabSt, z, y, sx));
    }
    seal(wb, 0.015);
    // Roof-window frames.
    const rw = [];
    for (const [z, x] of [[1.1, 0.08], [1.53, 0.08], [1.53, 0.48], [1.1, 0.48], [1.1, 0.08]]) {
      const st = stationAt(cabSt, z);
      const yy = ring(st, 96).reduce((b, [px, py]) => (py > 0 && Math.abs(px - x) < Math.abs(b[0] - x) ? [px, py] : b), [9, 0])[1];
      rw.push([sx * x, yy + 0.008, z]);
    }
    seal(rw, 0.011);
  }
  {
    // Windshield top edge across the roof and the centre post.
    // (where the windshield's side plane crosses the roof: a fixed point per
    // ring position, z = zA(y(z)).)
    const top = [];
    for (let k = 4; k <= 28; k++) {
      let z = 1.6, p = null;
      for (let it = 0; it < 6; it++) { p = ring(stationAt(cabSt, z), 64)[k]; z = zA(p[1]); }
      if (p[1] > 0.3) top.push([p[0] * 1.01, p[1] + 0.005, z]);
    }
    seal(top, 0.019);
    const cp = [];
    for (let z = zA(WS_TOP); z <= 2.62; z += 0.04) cp.push([0, stationAt(cabSt, z).yt + 0.006, z]);
    const tip = cabSt[0];
    for (let y = tip.yt; y >= WS_BOTTOM_AT(tip.z) - 0.01; y -= 0.03) cp.push([0, y, tip.z + 0.006]);
    seal(cp, 0.016);
  }
  // Door handles, hinges, steps (fine detail).
  for (const sx of [1, -1]) {
    for (const [z, y] of [[1.1, -0.12], [0.08, -0.12]]) add('chrome', tx(new THREE.CapsuleGeometry(0.009, 0.07, 3, 8), sx * (halfWidthAt(stationAt(cabSt, z), y) + 0.014), y, z, Math.PI / 2), true);
    for (const y of [0.42, -0.42]) {
      add('dark', rbox(0.02, 0.06, 0.04, 0.006, sx * (halfWidthAt(stationAt(cabSt, zA(y) - 0.03), y) + 0.006), y, zA(y) - 0.03), true);
      add('dark', rbox(0.02, 0.06, 0.04, 0.006, sx * (halfWidthAt(stationAt(cabSt, 0.86), y) + 0.006), y, 0.86), true);
    }
  }
  // Landing lights in the lower nose, pitot tube, cabin-roof antennas.
  for (const sx of [0.16, -0.16]) {
    const z = 2.47, y = -0.5;
    const hw = halfWidthAt(stationAt(cabSt, z), y);
    const x = Math.sign(sx) * Math.min(Math.abs(sx), hw - 0.05);
    add('chrome', tx(new THREE.TorusGeometry(0.05, 0.009, 6, 20), x, y, z + 0.06, -0.9, sx > 0 ? 0.25 : -0.25));
    add('lens', tx(new THREE.CircleGeometry(0.05, 18), x, y + 0.002, z + 0.066, -0.9, sx > 0 ? 0.25 : -0.25));
  }
  add('steel', rod([0, 0.71, 1.0], [0, 0.73, 1.22], 0.007, 6), true);
  add('dark', rod([0, 0.71, 0.4], [0, 0.98, 0.32], 0.006, 5), true);
  add('dark', rod([0.18, -0.8, 1.6], [0.18, -0.95, 1.55], 0.005, 5), true);

  // ---------------- fairing (transmission + engine) ----------------
  const fairSt = sampleStations(FAIR_KEYS, 26);
  const fairAO = (x, y) => clamp(0.8 + (y - 0.7) * 0.6, 0.7, 1);
  add('livery', liveryUV(tagged(loft(fairSt, 40, fairAO, [-0.06, Math.PI + 0.06]))));
  // Mast opening collar, air inlets (screens) behind it, engine exhaust stacks.
  add('dark', tx(new THREE.CylinderGeometry(0.11, 0.15, 0.05, 24), 0, 1.09, 0));
  for (const sx of [1, -1]) {
    const st = stationAt(fairSt, -0.5);
    const x = sx * (halfWidthAt(st, 0.86) + 0.004);
    add('dark', rbox(0.02, 0.15, 0.42, 0.01, x, 0.86, -0.52));
    for (let k = 0; k < 8; k++) add('steel', rbox(0.022, 0.13, 0.008, 0.002, x * 1.01, 0.86, -0.34 - k * 0.05), true);
    // Exhaust stack: oval tube out of the cowl, turned up and outboard.
    const ex = [[sx * 0.12, 0.92, -1.42], [sx * 0.15, 1.02, -1.5], [sx * 0.19, 1.12, -1.55], [sx * 0.22, 1.17, -1.56]];
    add('exhaust', tube(ex, 0.075, 12, 14));
    add('gloss', tx(new THREE.CircleGeometry(0.07, 16), sx * 0.225, 1.19, -1.565, -Math.PI / 2 + 0.05, 0, sx * -0.4));
    add('exhaust', tx(new THREE.TorusGeometry(0.075, 0.008, 6, 18), sx * 0.22, 1.172, -1.56, Math.PI / 2, 0, sx * -0.4), true);
  }

  // ---------------- aft fuselage ----------------
  const aftSt = sampleStations(AFT_KEYS, 26);
  const aftAO = (x, y) => clamp(1 - Math.max(0, 0.2 - y) * 0.3, 0.6, 1);
  const aftHi = liveryUV(tagged(loft(aftSt, 64, aftAO))), aftLo = liveryUV(tagged(loft(sampleStations(AFT_KEYS, 8), 24, aftAO)));
  // Belly: oil-cooler air exit and the fuel-sump drains.
  add('dark', rbox(0.3, 0.05, 0.4, 0.015, 0, -0.5, -1.45), true);

  // ---------------- tail boom, empennage ----------------
  {
    const st = [];
    for (let z = TC0; z >= TC1 - 1e-6; z -= 0.1) { const t = tcAt(z); st.push({ z, hw: t.r, ys: t.y, yb: t.y - t.r, yt: t.y + t.r, pU: 2, pL: 2 }); }
    add('livery', liveryUV(tagged(loft(st, 28, (x, y, z) => clamp(0.85 + (y - tcAt(z).y) * 1.2, 0.6, 1)))));
    const t1 = tcAt(TC1);
    add('fin', tx(new THREE.SphereGeometry(t1.r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, t1.y, TC1, -Math.PI / 2));
    // Tail-rotor drive-shaft cover along the top of the boom, tail gearbox.
    {
      const pts = [];
      for (let z = TC0 - 0.2; z >= -5.7; z -= 0.4) { const t = tcAt(z); pts.push([0, t.y + t.r + 0.02, z]); }
      add('paint', tube(pts, 0.035, 20, 8));
      for (let z = TC0 - 0.6; z > -5.7; z -= 0.9) { const t = tcAt(z); add('dark', rbox(0.09, 0.03, 0.06, 0.01, 0, t.y + t.r + 0.05, z), true); }
    }
    add('alu', rbox(0.18, 0.2, 0.22, 0.05, 0.04, TR.height, -TR.arm));
    add('steel', rod([0.1, TR.height, -TR.arm], [TAIL_HUB.x - 0.03, TR.height, -TR.arm], 0.028, 12));
    // Upper and lower vertical fins (swept), tail skid.
    const fin = (pts, thick) => {
      const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
      const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.014, bevelSegments: 2, curveSegments: 6 });
      g.translate(0, 0, -thick / 2);
      g.rotateY(-Math.PI / 2);
      return g;
    };
    add('fin', fin([[-5.55, 0.5], [-6.3, 0.5], [-6.78, 1.5], [-6.42, 1.52]], 0.05));
    add('fin', fin([[-5.78, 0.42], [-6.25, 0.42], [-6.42, -0.12], [-6.18, -0.12]], 0.045));
    add('steel', tube([[0, -0.08, -6.32], [0, -0.22, -6.3], [0, -0.26, -6.1], [0, -0.2, -5.9]], 0.016, 10, 6));
    // Horizontal stabiliser (inverted-camber section) with the B-3's
    // end-plate fins.
    const prof = airfoil(0, 1, 0.13, -0.02, 0.4, 12);
    const hsY = tcAt(-4.32).y;
    for (const side of [1, -1]) {
      add('paint', wingPanel([{ x: 0, y: hsY, le: -4.1, chord: 0.5 }, { x: 0.98, y: hsY, le: -4.16, chord: 0.42 }], prof, side));
      add('fin', fin([[-4.12, hsY - 0.12], [-4.6, hsY - 0.12], [-4.66, hsY + 0.24], [-4.28, hsY + 0.22]], 0.025).translate(side * 0.99, 0, 0));
    }
    add('lens', tx(new THREE.SphereGeometry(0.025, 10, 8), 1.0, hsY + 0.24, -4.45), true);
    add('lens', tx(new THREE.SphereGeometry(0.025, 10, 8), -1.0, hsY + 0.24, -4.45), true);
  }

  // ---------------- skids ----------------
  {
    const sr = 0.04, sy = GROUND + sr;
    const zf = 1.35, za = -1.5;
    for (const sx of [1, -1]) {
      const x = sx * SKID_X;
      add('skid', tube([[x, sy, za], [x, sy, 0], [x, sy, zf], [x, sy + 0.03, zf + 0.2], [x, sy + 0.14, zf + 0.33], [x, sy + 0.26, zf + 0.37]], sr, 40, 12));
      add('skid', ball([x, sy, za], sr, 10));
      add('skid', ball([x, sy + 0.26, zf + 0.37], sr, 10));
      for (const z of [-1.05, 0.7]) add('steel', rbox(0.05, 0.016, 0.42, 0.006, x, GROUND + 0.008, z), true);
    }
    // Arched cross tubes with their saddles, fuselage fittings and steps.
    const arch = (z) => {
      const xs = [[SKID_X, GROUND + 0.075], [SKID_X - 0.04, -1.12], [SKID_X - 0.16, -0.95], [SKID_X - 0.34, -0.83], [0.45, -0.77]];
      for (const sx of [1, -1]) {
        add('skid', tube(xs.map(([x, y]) => [sx * x, y, z]), 0.045, 24, 12));
        add('dark', rbox(0.12, 0.06, 0.12, 0.015, sx * 0.43, -0.76, z));
        add('steel', tx(new THREE.CylinderGeometry(0.055, 0.055, 0.09, 14), sx * SKID_X, GROUND + 0.078, z), true);
        // Boarding step on the forward cross tube.
        if (z > 0) add('dark', rbox(0.22, 0.02, 0.12, 0.006, sx * (SKID_X - 0.25), -0.88, z + 0.06));
      }
    };
    for (const z of B206_KIT.cross) arch(z);
  }

  // ---------------- spray kit (Simplex 4900) ----------------
  const nozzles = [];
  {
    const T = B206_KIT.tank;
    // Belly tank: a smooth carbon-glass pod, flat on top under the belly,
    // rounded ends, sitting between the cross tubes.
    const keys = [];
    const zc = (T.z0 + T.z1) / 2, half = (T.z1 - T.z0) / 2, yc = (T.top + T.bot) / 2, hh = (T.top - T.bot) / 2;
    for (let i = 0; i <= 18; i++) {
      const u = -1 + (2 * i) / 18;
      const f = Math.sqrt(Math.max(0, 1 - Math.abs(u) ** 3.2));
      keys.push({ z: zc - u * half, hw: Math.max(0.01, T.hw * f), ys: yc + hh * 0.35, yb: yc - hh * Math.max(0.05, f), yt: T.top - 0.002, pU: 5, pL: 2.6 });
    }
    addK('tank', loft(keys, 40, (x, y) => clamp(0.85 + (y - yc) * 1.2, 0.65, 1)));
    // Saddle straps to the belly, fill cap and level sight on the side,
    // service coupler aft (the hose couples here).
    for (const z of [zc - half * 0.55, zc + half * 0.55]) addK('dark', tx(new THREE.TorusGeometry(1, 0.012, 6, 36), 0, yc, z, 0, 0, 0, [T.hw + 0.006, hh + 0.012, 1]));
    addK('dark', tx(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 18), 0.3, T.top - 0.005, zc + 0.2));
    for (const sx of [1, -1]) {
      addK('tint', tx(new THREE.PlaneGeometry(0.6, 0.045), sx * (T.hw - 0.004), yc + 0.02, zc, 0, sx * Math.PI / 2, 0), true);
      addK('dark', tx(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 16), sx * (T.hw * 0.86), yc, T.z0 + 0.25, 0, 0, Math.PI / 2));
      addK('brass', tx(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), sx * (T.hw * 0.86 + 0.04), yc, T.z0 + 0.25, 0, 0, Math.PI / 2));
      // Tank hangers to the cross-tube saddles (the tank does not touch the tubes).
      for (const z of B206_KIT.cross) addK('steel', rod([sx * 0.43, -0.785, z], [sx * 0.36, yc + 0.04, z > 0 ? T.z1 - 0.18 : T.z0 + 0.18], 0.014, 6));
    }
    // Pump (fan-driven on the Simplex: impeller housing under the tank
    // front) and the manifold down to the boom centre section.
    addK('dark', tx(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 18), 0, T.bot + 0.03, T.z1 - 0.12, Math.PI / 2));
    addK('alu', tx(lathe([[0.0, 0.0], [0.06, 0.0], [0.065, 0.05], [0.03, 0.1], [0, 0.11]], 16), 0, T.bot + 0.03, T.z1 - 0.04, Math.PI / 2));
    addK('rubber', tube([[0, T.bot + 0.03, T.z1 + 0.02], [0, T.bot + 0.05, T.z1 + 0.09], [0, BOOM.y - 0.01, BOOM.z - 0.06], [0, BOOM.y, BOOM.z - 0.02]], 0.024, 10, 8));
    addK('boom', rbox(0.5, 0.06, 0.12, 0.02, 0, BOOM.y + 0.02, BOOM.z));
    // Boom: main tube with a light top chord and diagonal web near the root
    // (a slim truss, not a wing), end caps, 22 nozzles a side on drop tubes.
    addK('boom', rod([BOOM.half, BOOM.y, BOOM.z], [-BOOM.half, BOOM.y, BOOM.z], 0.022, 12));
    for (const sx of [1, -1]) {
      const tip = sx * BOOM.half;
      addK('boom', ball([tip, BOOM.y, BOOM.z], 0.026, 10));
      const chordY = (x) => BOOM.y + 0.14 * (1 - Math.abs(x) / BOOM.half) ** 0.8;
      const topPts = [];
      for (let x = 0.3; x <= BOOM.half - 0.05; x += 0.25) topPts.push([sx * x, chordY(x), BOOM.z - 0.02]);
      addK('boom', tube(topPts, 0.011, 30, 6));
      for (let x = 0.3; x < BOOM.half - 0.4; x += 0.5) {
        addK('boom', rod([sx * x, chordY(x), BOOM.z - 0.02], [sx * (x + 0.25), BOOM.y, BOOM.z], 0.006, 5), true);
        addK('boom', rod([sx * (x + 0.25), BOOM.y, BOOM.z], [sx * (x + 0.5), chordY(x + 0.5), BOOM.z - 0.02], 0.006, 5), true);
      }
      // Clamp onto the skid tube, its saddle and a brace to the fuselage side.
      const x = sx * SKID_X;
      addK('steel', rbox(0.06, BOOM.y - GROUND - 0.06, 0.07, 0.01, x, (BOOM.y + GROUND + 0.08) / 2, BOOM.z));
      addK('steel', rod([sx * 0.62, -0.42, BOOM.z + 0.05], [sx * 2.9, BOOM.y + 0.02, BOOM.z], 0.006, 5));
      addK('steel', rod([sx * 0.62, -0.42, BOOM.z - 0.05], [sx * 1.6, BOOM.y + 0.02, BOOM.z], 0.007, 5));
      addK('dark', rbox(0.05, 0.08, 0.06, 0.01, sx * (halfWidthAt(stationAt(cabSt, BOOM.z), -0.42) + 0.01), -0.42, BOOM.z));
      const N = 22;
      for (let k = 0; k < N; k++) {
        const nx = sx * (0.55 + ((BOOM.half - 0.7) * k) / (N - 1));
        addK('boom', rod([nx, BOOM.y, BOOM.z], [nx, BOOM.y - 0.05, BOOM.z + 0.01], 0.006, 6), true);
        addK('dark', tx(new THREE.CylinderGeometry(0.015, 0.013, 0.04, 8), nx, BOOM.y - 0.07, BOOM.z + 0.012), true);
        addK('brass', tx(new THREE.ConeGeometry(0.009, 0.02, 8), nx, BOOM.y - 0.1, BOOM.z + 0.014, Math.PI), true);
        nozzles.push(new THREE.Vector3(nx, BOOM.y - 0.11, BOOM.z + 0.014));
      }
    }
  }

  // ---------------- main rotor ----------------
  // Mast (out of the fairing) and the stationary swashplate; the rotating
  // parts turn in `spin`, inside `tpp` (tip-path-plane tilt).
  add('steel', tx(new THREE.CylinderGeometry(0.06, 0.07, R.hubHeight - 1.05, 16), 0, (R.hubHeight + 1.05) / 2, R.hubZ));
  const rotor = new THREE.Group();
  rotor.position.set(0, R.hubHeight, R.hubZ);
  const swash = new THREE.Group();
  swash.position.set(0, 1.2 - R.hubHeight, 0);
  rotor.add(swash);
  swash.add(new THREE.Mesh(tagged(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 28)), M.alu));
  const tpp = new THREE.Group();
  rotor.add(tpp);
  const spin = new THREE.Group();
  tpp.add(spin);
  {
    // Underslung teetering hub: yoke, pillow blocks, grips, the mast nut.
    const hub = [];
    hub.push(tagged(rbox(0.2, 0.1, 0.22, 0.03, 0, 0.0, 0)));
    hub.push(tagged(tx(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 12), 0, 0.02, 0, Math.PI / 2)));
    for (const sx of [1, -1]) {
      hub.push(tagged(rbox(0.36, 0.07, 0.16, 0.025, sx * 0.24, 0.05, 0)));
      hub.push(tagged(tx(new THREE.CylinderGeometry(0.06, 0.07, 0.24, 16), sx * 0.52, 0.05, 0, 0, 0, Math.PI / 2)));
    }
    hub.push(tagged(tx(lathe([[0, 0.14], [0.05, 0.13], [0.075, 0.08], [0.08, 0]], 18), 0, 0.06, 0)));
    spin.add(new THREE.Mesh(mergeGeometries(hub), M.alu));
    // Rotating swashplate, scissors and the two pitch links up to the horns.
    const links = [tagged(tx(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 28), 0, 1.24 - R.hubHeight, 0))];
    for (const sx of [1, -1]) links.push(tagged(rod([sx * 0.04, 1.24 - R.hubHeight, sx * -0.14], [sx * 0.34, 0.03, sx * -0.12], 0.012, 6)));
    links.push(tagged(rod([0.0, 1.26 - R.hubHeight, 0.14], [0.0, -0.08, 0.08], 0.014, 6)));
    spin.add(new THREE.Mesh(mergeGeometries(links), M.steel));
  }
  // Blades: cone -> pitch -> blade (13 in chord, white tips).
  const bladeG = mergeGeometries([
    tagged(bladeGeo(0.62, R.radius - 0.32, R.chord, 0.11, 0.035, -0.05, 30)),
    tagged(bladeGeo(0.5, 0.75, (u) => R.chord * (0.8 + 0.2 * u), 0.16, 0.035, 0.035, 3)),
  ]);
  const tipG = tagged(bladeGeo(R.radius - 0.32, R.radius, R.chord, 0.11, -0.05, -0.06, 4));
  const bladeMat = M.blade;
  const blades = [];
  for (const s of [1, -1]) {
    const cone = new THREE.Group();
    cone.rotation.y = s > 0 ? 0 : Math.PI;
    const pitch = new THREE.Group();
    cone.add(pitch);
    const mesh = new THREE.Mesh(bladeG, bladeMat);
    const tipMesh = new THREE.Mesh(tipG, M.bladeTip);
    mesh.castShadow = true;
    pitch.add(mesh, tipMesh);
    spin.add(cone);
    blades.push({ cone, pitch, mesh, tipMesh });
  }
  const discMat = blurMaterial(0x2e3237, { blades: 2, chord: R.chord, dir: 1, plane: 'xz', envMap: opts.envMap, radius: R.radius });
  const disc = new THREE.Mesh(new THREE.RingGeometry(0.6, R.radius, 120, 6).rotateX(-Math.PI / 2), discMat);
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
    tagged(tx(new THREE.CylinderGeometry(0.05, 0.05, 0.09, 14), 0, 0, 0, 0, 0, Math.PI / 2)),
    tagged(rbox(0.05, 0.26, 0.07, 0.012, 0.0, 0, 0)),
    tagged(tx(lathe([[0, 0.05], [0.035, 0.04], [0.045, 0]], 12), 0.045, 0, 0, 0, 0, -Math.PI / 2)),
  ]), M.alu));
  const tbG = bladeGeo(0.11, TR.radius, (u) => TR.chord * (1.05 - 0.08 * u), 0.11, 0, 0, 10);
  tbG.rotateZ(Math.PI / 2);
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
  {
    const band = tagged(bladeGeo(TR.radius - 0.14, TR.radius, TR.chord * 0.97, 0.115, 0, 0, 2));
    band.rotateZ(Math.PI / 2);
    for (const tb of tBlades) tb.pitch.add(new THREE.Mesh(band, M.red));
  }
  const tdiscMat = blurMaterial(0xc9c9c9, { blades: 2, chord: TR.chord, dir: -1, plane: 'yz', envMap: opts.envMap, radius: TR.radius });
  const tdisc = new THREE.Mesh(new THREE.RingGeometry(0.12, TR.radius, 64, 3).rotateY(Math.PI / 2), tdiscMat);
  tdisc.renderOrder = 9;
  tdisc.frustumCulled = false;
  tail.add(tdisc);
  root.add(tail);

  // Lights: beacon on the fin, nav lights on the stabiliser fins, tail light.
  const beacon = new THREE.Mesh(tagged(tx(lathe([[0.035, 0], [0.034, 0.03], [0.02, 0.055], [0, 0.06]], 14), 0, 1.03, -0.95)), M.beacon);
  const navL = new THREE.Mesh(tagged(tx(new THREE.SphereGeometry(0.02, 8, 6), 1.0, tcAt(-4.32).y + 0.24, -4.45)), M.navRed);
  const navR = new THREE.Mesh(tagged(tx(new THREE.SphereGeometry(0.02, 8, 6), -1.0, tcAt(-4.32).y + 0.24, -4.45)), M.navGreen);
  const tailLight = new THREE.Mesh(tagged(tx(new THREE.SphereGeometry(0.022, 8, 6), 0, 1.5, -6.6)), M.strobe);
  root.add(beacon, navL, navR, tailLight);

  // ---------------- cabin interior and controls ----------------
  const cockpit = new THREE.Group();
  const ci = {};
  const addC = (mat, g) => { (ci[mat] ||= []).push(tagged(g)); };
  {
    // Floor following the hull; firewall/bulkhead behind the rear seat.
    const pos = [], uv = [], idx = [];
    const zs = [];
    for (let z = -0.62; z <= 2.2; z += 0.06) zs.push(z);
    for (const z of zs) {
      const w = halfWidthAt(stationAt(cabSt, z), -0.68) - 0.02;
      pos.push(w, -0.68, z, -w, -0.68, z);
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
  // Front seats: low frames, beige leather cushions and backs, belts.
  for (const sx of [0.34, -0.34]) {
    addC('interior', rbox(0.48, 0.24, 0.48, 0.03, sx, -0.56, 0.98));
    addC('seat', rbox(0.48, 0.09, 0.5, 0.04, sx, -0.395, 0.98));
    addC('seat', rbox(0.48, 0.62, 0.11, 0.045, sx, -0.06, 0.72, -0.12));
    addC('seat', rbox(0.3, 0.16, 0.09, 0.03, sx, 0.33, 0.69, -0.12));
    for (const bx of [-0.12, 0.12]) addC('satin', rbox(0.05, 0.6, 0.01, 0.004, sx + bx, -0.04, 0.785, -0.12));
  }
  // Rear bench and backrest, bulkhead trim.
  addC('interior', rbox(1.22, 0.3, 0.52, 0.03, 0, -0.53, -0.12));
  addC('seat', rbox(1.22, 0.09, 0.52, 0.04, 0, -0.34, -0.12));
  addC('seat', rbox(1.2, 0.66, 0.11, 0.045, 0, 0.0, -0.4, -0.1));
  addC('trim', rbox(1.18, 0.5, 0.04, 0.02, 0, 0.42, -0.5));
  // Instrument panel, its glareshield and the centre pedestal (b206Cockpit.js).
  const inst = createB206Instruments(panel, { M, cabSt, halfAt: (z, y) => halfWidthAt(stationAt(cabSt, z), y) });
  cockpit.add(inst.group);
  // Cyclic: Bell conventional stick from the floor between the pilot's
  // knees, pivot below the floor in a boot; the right hand on the grip.
  const CP = new THREE.Vector3(OFF.x, -0.74, 1.37);
  const cyclic = new THREE.Group();
  cyclic.position.copy(CP);
  const gripAt = new THREE.Vector3(...o3(-0.02, 0.42, -0.12));
  {
    const loc = (p) => [p[0] - CP.x, p[1] - CP.y, p[2] - CP.z];
    const top = [gripAt.x, gripAt.y - 0.07, gripAt.z];
    const parts = [tagged(rod(loc([CP.x, CP.y, CP.z]), loc([CP.x, -0.42, CP.z + 0.02]), 0.016, 10)), tagged(tube([loc([CP.x, -0.42, CP.z + 0.02]), loc([CP.x - 0.005, -0.3, CP.z + 0.04]), loc(top)], 0.014, 12, 8))];
    cyclic.add(new THREE.Mesh(mergeGeometries(parts), M.satin));
    // Grip: moulded black handle, trim hat, the trigger and radio switches.
    const grip = mergeGeometries([
      tagged(tx(new THREE.CapsuleGeometry(0.024, 0.09, 4, 10), ...loc([gripAt.x, gripAt.y - 0.005, gripAt.z]), 0.15)),
      tagged(rbox(0.05, 0.04, 0.06, 0.012, ...loc([gripAt.x, gripAt.y + 0.06, gripAt.z + 0.008]))),
    ]);
    cyclic.add(new THREE.Mesh(grip, M.rubber));
    cyclic.add(new THREE.Mesh(tagged(rbox(0.012, 0.022, 0.012, 0.003, ...loc([gripAt.x, gripAt.y + 0.035, gripAt.z + 0.035]))), M.red));
    cyclic.add(new THREE.Mesh(tagged(tx(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 10), ...loc([gripAt.x, gripAt.y + 0.085, gripAt.z]))), M.gloss));
    const boot = new THREE.Mesh(tagged(tx(lathe([[0.07, 0], [0.06, 0.02], [0.035, 0.06], [0.02, 0.09]], 14), 0, -0.68 - CP.y, 0)), M.rubber);
    cyclic.add(boot);
  }
  const stick = new THREE.Group();
  stick.position.set(...o3(0, -0.22, -0.12)).sub(CP);
  cyclic.add(stick);
  cockpit.add(cyclic);
  // Collective (left of the pilot seat) with its twist-grip throttle.
  const collective = new THREE.Group();
  const CPv = new THREE.Vector3(...o3(...COLL_PIVOT));
  collective.position.copy(CPv);
  const gripRest = new THREE.Vector3(...o3(THR[0], THR[1] + 0.15, THR[2] - 0.01));
  const collRest = Math.atan2(gripRest.y - CPv.y, gripRest.z - CPv.z);
  {
    const L = gripRest.distanceTo(CPv);
    const g = [tagged(tx(new THREE.CylinderGeometry(0.017, 0.019, L - 0.1, 10), 0, 0, (L - 0.1) / 2, Math.PI / 2))];
    g.push(tagged(tx(new THREE.CylinderGeometry(0.032, 0.032, 0.07, 14), 0, 0, 0, 0, 0, Math.PI / 2)));
    const lever = mergeGeometries(g);
    lever.rotateX(-collRest);
    collective.add(new THREE.Mesh(lever, M.satin));
    collective.add(new THREE.Mesh(tagged(tx(new THREE.CylinderGeometry(0.024, 0.024, 0.15, 12), 0, 0, L - 0.04, Math.PI / 2)).rotateX(-collRest), M.rubber));
    // Switch box at the head of the collective (start, idle release, lights).
    collective.add(new THREE.Mesh(tagged(rbox(0.06, 0.05, 0.07, 0.01, 0, 0, L + 0.05)).rotateX(-collRest), M.dark));
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
  for (const px of [-0.34, 0.34]) {
    for (const sx of [1, -1]) {
      const p = new THREE.Group();
      p.position.set(px + sx * 0.16, -0.6, 2.05);
      p.rotation.x = -0.8;
      // Pedal plate with its tread, on an arm down to the pivot on the floor.
      p.add(new THREE.Mesh(tagged(rbox(0.085, 0.16, 0.022, 0.008, 0, 0, 0)), M.satin));
      p.add(new THREE.Mesh(tagged(rbox(0.07, 0.12, 0.006, 0.002, 0, 0, -0.013)), M.rubber));
      p.add(new THREE.Mesh(tagged(rod([0, -0.05, 0.01], [0, -0.1, 0.12], 0.009, 8)), M.steel));
      cockpit.add(p);
      addC('satin', rbox(0.05, 0.03, 0.06, 0.008, px + sx * 0.16, -0.665, 2.12));
      pedals.push({ p, sign: sx, z0: p.position.z, mine: px < 0 });
    }
  }
  // Fire extinguisher and door pulls.
  addC('red', tx(lathe([[0, -0.13], [0.035, -0.13], [0.036, 0.09], [0.025, 0.13], [0, 0.14]], 14), 0.56, -0.52, 1.25));
  addC('dark', rbox(0.04, 0.03, 0.2, 0.01, 0.6, -0.05, 1.35));
  addC('dark', rbox(0.04, 0.03, 0.2, 0.01, -0.6, -0.05, 1.35));
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
  const shell = (geos, mat, cast, order = 0) => {
    const m = new THREE.Mesh(mergeGeometries(geos.map((g) => tagged(g))), mat);
    m.castShadow = cast; m.receiveShadow = mat !== M.glass && mat !== M.tint; m.renderOrder = order;
    return m;
  };
  const glassMesh = new THREE.Group();
  glassMesh.add(shell([cabHi.glass], M.glass, false, 10), shell([cabHi.tint], M.tint, false, 10));
  const near = new THREE.Group(), far = new THREE.Group();
  near.add(shell([cabHi.paint, aftHi], M.livery, true), shell([cabHi.inner], M.interior, false), glassMesh);
  far.add(shell([cabLo.paint, aftLo], M.livery, true), shell([cabLo.inner], M.interior, false), shell([cabLo.glass], M.glass, false, 10), shell([cabLo.tint], M.tint, false, 10));
  const shellLod = new THREE.LOD();
  shellLod.addLevel(near, 0);
  shellLod.addLevel(far, 40);
  root.add(shellLod);
  const fine = new THREE.Group();
  const kitFine = new THREE.Group();
  const kit = new THREE.Group();
  const build = (parts, coarseParent, fineParent) => {
    for (const [k, list] of Object.entries(parts)) {
      const isFine = k.startsWith('fine:');
      const mat = M[isFine ? k.slice(5) : k];
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.castShadow = !isFine && mat !== M.lens && mat !== M.tint;
      m.receiveShadow = true;
      if (mat === M.lens || mat === M.tint) m.renderOrder = 9;
      (isFine ? fineParent : coarseParent).add(m);
    }
  };
  build(B, root, fine);
  build(K_, kit, kitFine);
  root.add(kit);
  const lod = new THREE.LOD();
  const fineAll = new THREE.Group();
  fineAll.add(fine, kitFine);
  lod.addLevel(fineAll, 0);
  lod.addLevel(new THREE.Group(), 45);
  root.add(lod);

  // Paint scheme and spray kit (shared geometry: only the maps and colours
  // change; the kit is shown or hidden).
  let livery = 0;
  const setLivery = (i) => {
    livery = ((i % B206_LIVERIES.length) + B206_LIVERIES.length) % B206_LIVERIES.length;
    const L = B206_LIVERIES[livery];
    M.livery.map = livMap(livery);
    M.livery.needsUpdate = true;
    M.paint.color.set(L.paint).multiplyScalar(ALB);
    M.fin.color.set(L.fin).multiplyScalar(ALB);
    M.tank.color.set(L.tank);
  };
  const setKit = (on) => { kit.visible = on; kitFine.visible = on; };

  // ---------------- animation ----------------
  const EXPOSURE = 1 / 50;
  const elbow = new THREE.Vector3(...o3(...ELBOW_L));
  const handRest = new THREE.Vector3(...o3(THR[0], THR[1] + 0.17, THR[2] - 0.01));
  const _h = new THREE.Vector3();
  const _ax = new THREE.Vector3(1, 0, 0);
  let t = 0;
  const setBladeOpacity = (mat, a) => {
    const tr = a < 0.999;
    if (mat.transparent !== tr) { mat.transparent = tr; mat.depthWrite = !tr; mat.needsUpdate = true; }
    mat.opacity = a;
  };
  const update = (dt, fm, ac) => {
    t += dt;
    if (ac && ac.game?.cameraMode === 'cockpit' && ac.game.aircraft === ac) inst.update(ac.instruments(), dt);
    const o = fm.out;
    const om = fm.rotorOmega;
    const pct = o.rotorPct / 100;
    tpp.rotation.set(fm.a1, 0, fm.b1);
    swash.rotation.set(fm.a1 * 0.8, 0, fm.b1 * 0.8);
    spin.rotation.y = fm.rotorAngle;
    // Teetering rotor: the blades cone together; the heavy Bell rotor droops less at rest.
    const beta = lerp(-0.022, R.precone, smoothstep(0.15, 0.95, pct * pct));
    const theta = R.pitchMin + clamp(fm.collective, 0, 1) * (R.pitchMax - R.pitchMin);
    for (const b of blades) { b.cone.rotation.z = beta; b.pitch.rotation.x = theta * 0.6; }
    const blur = om * EXPOSURE;
    const op = 1 - smoothstep(0.35, 0.95, blur);
    setBladeOpacity(bladeMat, op);
    setBladeOpacity(M.bladeTip, op);
    for (const b of blades) { b.mesh.visible = b.tipMesh.visible = op > 0.01; b.mesh.castShadow = op > 0.5; }
    const u = discMat.userData.u;
    u.uAngle.value = fm.rotorAngle; u.uBlur.value = blur; u.uCone.value = Math.tan(beta);
    u.uOpacity.value = smoothstep(0.06, 0.3, blur);
    disc.visible = u.uOpacity.value > 0.002;
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
    // Controls: cyclic about its floor pivot, collective (hand on the grip), pedals.
    cyclic.rotation.set(clamp(fm.cyclicLon + fm.trim, -1, 1) * 0.2, 0, clamp(fm.cyclicLat, -1, 1) * 0.17);
    const phi = clamp(fm.collective, 0, 1) * 0.4;
    lhPivot.rotation.x = -phi;
    _h.copy(handRest).sub(elbow).applyAxisAngle(_ax, -phi).add(elbow);
    collective.rotation.x = -(Math.atan2(_h.y - 0.02 - CPv.y, _h.z - CPv.z) - collRest);
    for (const pd of pedals) pd.p.position.z = pd.z0 + pd.sign * -clamp(fm.pedal, -1, 1) * 0.045;
    // Beacon and position lights while the master is on.
    const on = fm.engine !== 'off' || pct > 0.05;
    M.beacon.emissiveIntensity = on ? 0.6 + 2.4 * Math.max(0, Math.sin(t * 7.5)) ** 8 : 0;
    M.strobe.emissiveIntensity = on && t % 1.3 < 0.06 ? 4 : on ? 0.4 : 0;
    M.navRed.emissiveIntensity = on ? 1.6 : 0;
    M.navGreen.emissiveIntensity = on ? 1.6 : 0;
  };

  return {
    root, M,
    rotor, disc, tail, blades, tailBlades: tBlades,
    stick: cyclic, cyclic, collective, pedals, throttle, leds: inst.leds, panelMesh: inst.group, inst,
    nozzles, pilot, cockpit, glassMesh, kit,
    eye: new THREE.Vector3(...o3(0, 0.98, -0.42)),
    fuelFiller: new THREE.Vector3(0.56, 0.2, -0.85), // (mirrored to the side the crew works from)
    hopperPort: new THREE.Vector3(B206_KIT.tank.hw * 0.86 + 0.06, (B206_KIT.tank.top + B206_KIT.tank.bot) / 2, B206_KIT.tank.z0 + 0.25),
    setLivery, setKit, get livery() { return livery; },
    // New registration marks: the scheme canvases are redrawn on demand.
    setReg(r) {
      REG = r;
      for (const m of livMaps) m?.dispose();
      livMaps.length = 0;
      M.livery.map = livMap(livery);
      M.livery.needsUpdate = true;
    },
    update,
  };
}
