// Procedural Air Tractor AT-502B with its own markings (PR-AWT, AGRO WINGS).
// VISUAL ONLY: the physics (FLIGHT_AT502), gear contact points and hard
// points live in src/config.js; the gear points are read here only to place
// the wheels.
// Body frame: +Z nose, +Y up, +X left wing; origin = CG (≈ 30 % MAC).
//
// Built the same way as the PR-AGW model (shared helpers in model.js): a
// lofted fuselage with a long PT6A cowling, a 500 US gal hopper section, an
// open cabin under a framed canopy and a turtle deck to the fin; a
// constant-chord cantilever wing (15.85 m) with large flaps and long
// ailerons, spray booms with 50 nozzles under the trailing edge, spring-steel
// main gear, a steerable tailwheel, a strut-braced tailplane, a 2.82 m
// three-blade constant-speed prop that feathers when stopped, and a detailed
// cockpit (PT6 power quadrant, turbine instruments) laid out around the same
// seated pilot as the PR-AGW. Paint and lettering are a side-projected
// livery with a matching bump map; AO is baked into vertex colours; fine
// detail sits in a LOD.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { rng, clamp, smoothstep, lerp } from '../core/math.js';
import { FLIGHT_AT502 } from '../config.js';
import {
  sampleStations, loft, K, airfoil, wingPanel, tagged, shade, tx, rod, tube, bar, ball, rbox, lathe, patch, patchEdge,
  speckle, orangePeel, treadTexture, propDiscTexture, ribTexture, feltTexture, WING_SPAN_UV, buildPilot,
} from './model.js';
import { AT_PANEL } from './atPanel.js';

const DIH = Math.tan((3.5 * Math.PI) / 180);
export const AT_WING = { rootX: 0.66, tipX: 7.82, rootY: -0.6, le: 0.55, chord: 1.83 };
export const atWingY = (x) => AT_WING.rootY + Math.max(0, Math.abs(x) - AT_WING.rootX) * DIH;
const SPAN_UV = 8.1; // half-span metres mapped to u = 0..1 on the wing texture
const YELLOW = '#f2bd10';
const BLUE = '#1d4c9c';
const WHITE = '#f3f3ee';
const INK = '#141a24';
// Cockpit layout = the PR-AGW's seat/stick/pedal geometry moved by this
// offset (taller cabin, further aft), so the shared pilot fits the controls.
const OFF = new THREE.Vector3(0, 0.3, -0.42);
const o3 = (x, y, z) => [x + OFF.x, y + OFF.y, z + OFF.z];

// Ground shadow planform for createContactShadow().
export const AT_SHADOW = { W: 17.5, L: 12, wing: [7.95, -1.3, 0.6], fus: [0.66, -0.7, 5.0], tail: [2.75, -5.95, -4.95], core: [5.6, 3.4] };

// ==========================================================================
// Fuselage stations K(z, half-width, shoulder y, bottom y, top y, pU, pL).
const FWD_KEYS = [
  K(3.92, 0.27, 0.3, 0.03, 0.57, 2.1, 2.1), K(3.84, 0.33, 0.3, -0.05, 0.64, 2.3, 2.4),
  K(3.6, 0.37, 0.29, -0.14, 0.68, 2.7, 2.9), K(3.1, 0.405, 0.26, -0.26, 0.71, 3.0, 3.2),
  K(2.5, 0.44, 0.22, -0.4, 0.735, 3.4, 3.5), K(2.0, 0.49, 0.17, -0.55, 0.752, 3.8, 3.8),
  K(1.5, 0.55, 0.11, -0.7, 0.77, 4.2, 4.2), K(0.9, 0.59, 0.06, -0.82, 0.79, 6, 4.5),
  K(0.15, 0.6, 0.04, -0.86, 0.8, 8, 4.6),
];
const SILL = 0.8, ROOF = 1.62;
const CAB_KEYS = [K(0.15, 0.6, 0.04, -0.86, SILL, 8, 4.6), K(-0.7, 0.6, 0.06, -0.84, SILL, 8, 4.6), K(-1.55, 0.58, 0.08, -0.78, SILL, 8, 4.5)];
const AFT_KEYS = [
  K(-1.55, 0.58, 0.08, -0.78, 1.46, 8, 4.5), K(-1.85, 0.555, 0.1, -0.71, 1.34, 4.6, 4.3),
  K(-2.5, 0.48, 0.14, -0.56, 1.14, 3.2, 4.0), K(-3.2, 0.39, 0.19, -0.38, 0.96, 2.7, 3.6),
  K(-4.0, 0.28, 0.24, -0.18, 0.82, 2.5, 3.1), K(-4.7, 0.175, 0.28, -0.02, 0.7, 2.4, 2.8),
  K(-5.3, 0.09, 0.31, 0.09, 0.58, 2.4, 2.6), K(-5.66, 0.02, 0.33, 0.2, 0.45, 2.5, 2.5),
];

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
    const [, belly] = P(0, -0.45);
    const grd = g.createLinearGradient(0, belly, 0, oy + LV.H / 2);
    grd.addColorStop(0, 'rgba(90,70,30,0)');
    grd.addColorStop(1, 'rgba(90,70,30,0.24)');
    g.fillStyle = grd;
    g.fillRect(0, belly, LV.W, oy + LV.H / 2 - belly);
    // Blue fin and rudder (and the fin fillet).
    poly([[-4.42, 0.62], [-4.42, 2.6], [-6.1, 2.6], [-6.1, 0.62]], BLUE);
    line(g, [[-4.42, 0.66], [-6.0, 0.66]], WHITE, 0.022 * LV.ky);
    // Blue cheat line with white pinstripes, nose to tail.
    const band = (cl, hh, off = 0) => cl.map(([z, y], i) => [z, y + off + hh[i]]).concat(cl.map(([z, y], i) => [z, y + off - hh[i]]).reverse());
    const cl = [[3.95, 0.2], [3.2, 0.15], [2.2, 0.1], [1.0, 0.08], [0.15, 0.1], [-1.6, 0.22], [-3.2, 0.34], [-4.45, 0.43]];
    const hh = [0.05, 0.07, 0.085, 0.09, 0.09, 0.08, 0.06, 0.04];
    poly(band(cl, hh), BLUE);
    poly(band(cl, hh.map(() => 0.008), 0).map(([z, y], i) => [z, y]), BLUE);
    for (const s of [1, -1]) {
      const pin = cl.map(([z, y], i) => [z, y + s * (hh[i] + 0.028)]);
      poly(band(pin, hh.map(() => 0.009)), WHITE);
    }
    // Cowling: side door split line, camloc fasteners, louvres, firewall seam.
    const seams = [
      [[3.76, -0.2], [3.76, 0.66]], [[2.0, -0.55], [2.0, 0.75]], [[3.76, 0.42], [2.0, 0.5]], [[3.76, -0.02], [2.0, -0.15]],
      [[0.15, -0.86], [0.15, 0.8]], [[-1.55, -0.78], [-1.55, 0.8]], [[-2.9, -0.45], [-2.9, 1.0]], [[-4.2, -0.15], [-4.2, 0.8]],
      [[1.2, -0.78], [1.2, 0.78]], [[-1.55, -0.2], [-4.2, 0.1]],
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
      for (const y of [0.52, 0.0]) {
        const [px, py] = P(z, y);
        g.fillStyle = 'rgba(40,40,40,0.55)'; g.beginPath(); g.arc(px, py, 3.2, 0, Math.PI * 2); g.fill();
        gb.fillStyle = '#a8a8a8'; gb.beginPath(); gb.arc(px, py, 3.2, 0, Math.PI * 2); gb.fill();
      }
    }
    for (let k = 0; k < 8; k++) {
      const pts = [[2.75 - k * 0.055, -0.36], [2.75 - k * 0.055, -0.18]];
      line(g, pts, 'rgba(20,15,10,0.6)', 3); line(gb, pts, '#202020', 4);
    }
    // Access doors on the aft fuselage and the hopper side.
    const door = (z0, z1, y0, y1) => {
      const pts = [[z0, y0], [z1, y0], [z1, y1], [z0, y1], [z0, y0]];
      line(g, pts, 'rgba(80,60,0,0.36)', 2); line(gb, pts, '#383838', 2.8);
    };
    door(-2.05, -2.6, -0.32, 0.0);
    door(-3.55, -3.95, 0.3, 0.55);
    door(1.75, 0.95, -0.62, -0.32);
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
    text(-3.0, 0.66, reg, 0.3, INK);
    text(1.15, 0.5, 'AGRO WINGS', 0.12, BLUE, 'italic bold');
    text(-0.7, 0.6, 'AVIAÇÃO AGRÍCOLA', 0.04, INK, 'bold');
    text(-5.36, 1.6, 'AT-502B', 0.11, WHITE, 'italic bold');
    text(1.6, -0.48, 'NO STEP', 0.035, 'rgba(30,30,30,0.7)', 'bold');
    text(0.6, -0.2, 'JET A-1', 0.035, 'rgba(30,30,30,0.75)', 'bold');
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
  const liv = liveryTextures('PR-AWT');
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
    alu: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.28, metalness: 0.92, vertexColors: true }),
    polished: new THREE.MeshStandardMaterial({ color: 0xe2e5e8, roughness: 0.14, metalness: 1.0, envMap: opts.envMap ?? null, envMapIntensity: 0.9 }),
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
    headliner: new THREE.MeshStandardMaterial({ color: 0xffffff, map: feltTexture(), roughness: 0.95, side: THREE.DoubleSide }),
    floor: new THREE.MeshStandardMaterial({ color: 0xffffff, map: ribTexture('#3c4248', 'rgba(0,0,0,0.5)', 24, 64, 256), roughness: 0.8, metalness: 0.4, vertexColors: true }),
    seat: new THREE.MeshStandardMaterial({ color: 0xffffff, map: ribTexture('#2c3440', 'rgba(5,8,12,0.55)'), roughness: 0.85, vertexColors: true }),
    harness: new THREE.MeshStandardMaterial({ color: 0x8a1f1a, roughness: 0.8 }),
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
    let a = 1 - Math.max(0, -y - 0.35) * 0.3;
    const yb = Math.max(0, 1 - Math.abs(y + 0.52) / 0.26), zb = Math.max(0, 1 - Math.abs(z + 0.36) / 1.05);
    a *= 1 - 0.34 * yb * Math.sqrt(zb); // wing-root shadow line
    const sb = Math.max(0, 1 - Math.abs(y - 0.42) / 0.15) * (z < -4.9 && z > -5.95 ? 1 : 0);
    a *= 1 - 0.22 * sb;
    if (z < 0.15 && z > -1.55 && y > 0.66) a *= 0.9;
    if (z > 3.75) a *= 0.86 + 0.14 * clamp((3.92 - z) / 0.17, 0, 1);
    return clamp(a, 0.5, 1);
  };
  const fwdSt = sampleStations(FWD_KEYS, 20);
  const cabSt = sampleStations(CAB_KEYS, 8);
  const aftSt = sampleStations(AFT_KEYS, 14);
  add('livery', liveryUV(tagged(loft(fwdSt, 56, fusAO))));
  // Cabin: cut at 150° so the sides run straight up to the sill under the canopy.
  add('livery', liveryUV(tagged(loft(cabSt, 48, fusAO, [Math.PI * (5 / 6), Math.PI * (13 / 6)], SILL))));
  add('paint', rbox(1.17, 0.1, 0.14, 0.03, 0, 0.765, 0.16)); // windshield base fairing
  add('livery', liveryUV(tagged(loft(aftSt, 56, fusAO))));
  // Matte anti-glare panel along the top of the cowling.
  {
    const st = fwdSt.filter((s) => s.z <= 3.74 && s.z >= 2.02).map((s) => ({ ...s, hw: s.hw + 0.005, yt: s.yt + 0.005 }));
    add('deck', loft(st, 18, null, [Math.PI * 0.4, Math.PI * 0.6]));
  }
  // Cabin sill rails.
  for (const sx of [1, -1]) add('paint', tube([[sx * 0.585, SILL, 0.15], [sx * 0.595, SILL, -0.7], [sx * 0.575, SILL, -1.55]], 0.026, 16, 8));
  // Hopper: big hinged lid on the top deck with its collar, hinges and latches.
  {
    const s = new THREE.Shape();
    const w = 0.36, d = 0.42, r = 0.09;
    s.moveTo(-w + r, -d); s.lineTo(w - r, -d); s.quadraticCurveTo(w, -d, w, -d + r); s.lineTo(w, d - r); s.quadraticCurveTo(w, d, w - r, d);
    s.lineTo(-w + r, d); s.quadraticCurveTo(-w, d, -w, d - r); s.lineTo(-w, -d + r); s.quadraticCurveTo(-w, -d, -w + r, -d);
    const lid = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 2, curveSegments: 8 });
    lid.rotateX(-Math.PI / 2);
    add('paint', tx(lid, 0, 0.79, 1.08, -0.028));
    add('dark', tx(new THREE.TorusGeometry(1, 0.012, 6, 40), 0, 0.785, 1.08, Math.PI / 2, 0, 0, [0.4, 0.47, 1]));
    for (const sx of [-0.22, 0.22]) {
      add('steel', tx(new THREE.CylinderGeometry(0.022, 0.022, 0.08, 10), sx, 0.82, 0.62, 0, 0, Math.PI / 2));
      add('steel', rbox(0.05, 0.03, 0.07, 0.01, sx, 0.865, 1.52, -0.03), true);
    }
    add('steel', rod([-0.12, 0.885, 1.5], [0.12, 0.885, 1.5], 0.012, 8));
  }
  // Hopper loading coupler (left side, just aft of the wing) and its pipe;
  // gatebox under the hopper.
  for (const sx of [1, -1]) {
    add('dark', tx(new THREE.CylinderGeometry(0.075, 0.075, 0.11, 18), sx * 0.6, -0.55, -1.5, 0, 0, Math.PI / 2));
    add('brass', tx(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 18), sx * 0.665, -0.55, -1.5, 0, 0, Math.PI / 2));
  }
  add('alu', tube([[0.56, -0.55, -1.5], [0.5, -0.62, -0.9], [0.42, -0.7, 0.0], [0.3, -0.76, 0.7]], 0.04, 18, 8));
  add('dark', rbox(0.5, 0.14, 0.6, 0.03, 0, -0.9, 0.95));
  add('steel', rbox(0.36, 0.05, 0.4, 0.015, 0, -0.98, 0.95), true);
  // PT6A exhaust stacks: oval pipes out of the cowling just behind the prop.
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
  // Cowl front: lip ring round the spinner, dark inlet gap, chin intake with
  // a screen, oil-cooler scoop under the cowling, lower cowl drains.
  add('paint', tx(new THREE.TorusGeometry(0.275, 0.03, 12, 44), 0, 0.3, 3.905));
  add('dark', tx(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 44, 1, true), 0, 0.3, 3.86, Math.PI / 2));
  add('paint', rbox(0.42, 0.2, 0.62, 0.07, 0, -0.12, 3.42, 0.04));
  add('dark', tx(new THREE.PlaneGeometry(0.34, 0.13), 0, -0.11, 3.732, 0.04));
  for (let k = 0; k < 6; k++) add('steel', tx(new THREE.BoxGeometry(0.33, 0.006, 0.006), 0, -0.165 + k * 0.022, 3.735), true);
  add('paint', rbox(0.3, 0.12, 0.5, 0.04, 0, -0.5, 2.35, -0.1));
  add('dark', tx(new THREE.PlaneGeometry(0.24, 0.07), 0, -0.505, 2.6, -0.1));
  for (const sx of [-0.08, 0.08]) add('steel', rod([sx, -0.52, 2.05], [sx, -0.6, 2.0], 0.008, 6), true);
  // Spinner: polished, with a backplate.
  const spinner = lathe([[0.0, 0.46], [0.05, 0.44], [0.12, 0.38], [0.18, 0.29], [0.225, 0.18], [0.245, 0.07], [0.25, 0]].reverse(), 40);
  spinner.rotateX(Math.PI / 2);
  const spinnerMesh = new THREE.Mesh(mergeGeometries([tagged(spinner), tagged(tx(new THREE.CylinderGeometry(0.258, 0.258, 0.02, 40), 0, 0, -0.005, Math.PI / 2))]), M.polished);
  spinnerMesh.castShadow = true;

  // ---------------- canopy ----------------
  const cz0 = -1.55, cz1 = 0.15;
  const WS = { bl: [0.56, SILL, cz1], br: [-0.56, SILL, cz1], tl: [0.47, ROOF - 0.05, -0.32], tr: [-0.47, ROOF - 0.05, -0.32], n: [0, 0.55, 0.84], bulge: 0.06 };
  const RT = { f: -0.32, r: -1.25 }; // roof window from/to
  const glassG = [], tintG = [];
  glassG.push(patch(WS.bl, WS.br, WS.tl, WS.tr, 12, 6, WS.bulge, WS.n));
  for (const sx of [1, -1]) {
    // Side windows: front (fixed) and door (aft of the B post).
    glassG.push(patch([sx * 0.56, SILL, cz1], [sx * 0.59, SILL, -0.62], [sx * 0.47, ROOF - 0.05, -0.32], [sx * 0.47, ROOF - 0.03, -0.62], 6, 4, 0.012, [sx, 0.12, 0]));
    glassG.push(patch([sx * 0.59, SILL, -0.62], [sx * 0.585, SILL, cz0], [sx * 0.47, ROOF - 0.03, -0.62], [sx * 0.47, ROOF - 0.03, RT.r], 8, 4, 0.014, [sx, 0.12, 0]));
  }
  tintG.push(patch([0.47, ROOF - 0.03, RT.f], [-0.47, ROOF - 0.03, RT.f], [0.47, ROOF - 0.03, RT.r], [-0.47, ROOF - 0.03, RT.r], 8, 6, 0.05, [0, 1, 0]));
  const glassMesh = new THREE.Group();
  const gm = new THREE.Mesh(mergeGeometries(glassG.map((g) => tagged(g))), M.glass);
  const tm = new THREE.Mesh(mergeGeometries(tintG.map((g) => tagged(g))), M.tint);
  gm.renderOrder = 10; tm.renderOrder = 10;
  glassMesh.add(gm, tm);
  // Painted rear closure from the roof frame down onto the turtle deck.
  add('livery', liveryUV(tagged(patch([0.47, ROOF - 0.03, RT.r], [-0.47, ROOF - 0.03, RT.r], [0.585, 1.45, cz0], [-0.585, 1.45, cz0], 6, 3, 0, [0, 0.5, -0.8]))));
  // Side fill between the rear canopy post and the turtle deck.
  for (const sx of [1, -1]) {
    add('livery', liveryUV(tagged(patch([sx * 0.585, SILL, cz0], [sx * 0.585, SILL, cz0], [sx * 0.585, 1.45, cz0], [sx * 0.47, ROOF - 0.03, RT.r], 3, 4, 0, [sx, 0, 0]))));
  }
  // Frame: painted tubes outside, grey inside, rounded joints.
  const cabC = new THREE.Vector3(0, 1.2, -0.7);
  const frame = (pts, r = 0.028) => {
    add('paint', tube(pts, r, Math.max(4, pts.length * 3), 10));
    const mid = new THREE.Vector3(...pts[Math.floor(pts.length / 2)]);
    const inw = cabC.clone().sub(mid).normalize().multiplyScalar(0.014);
    add('interior', tube(pts.map((p) => [p[0] + inw.x, p[1] + inw.y, p[2] + inw.z]), r * 0.85, Math.max(4, pts.length * 3), 8));
  };
  frame(patchEdge(WS.bl, WS.br, 0, WS.bulge, WS.n, 12, WS.tl, WS.tr), 0.032);
  frame(patchEdge(WS.bl, WS.br, 1, WS.bulge, WS.n, 12, WS.tl, WS.tr));
  for (const sx of [1, -1]) {
    frame([[sx * 0.56, SILL, cz1], [sx * 0.52, (SILL + ROOF) / 2, -0.09], [sx * 0.47, ROOF - 0.05, -0.32]], 0.032);
    frame([[sx * 0.47, ROOF - 0.04, -0.32], [sx * 0.47, ROOF - 0.03, -0.8], [sx * 0.47, ROOF - 0.03, RT.r]]);
    frame([[sx * 0.59, SILL, -0.62], [sx * 0.535, (SILL + ROOF) / 2, -0.62], [sx * 0.47, ROOF - 0.03, -0.62]], 0.026);
    frame([[sx * 0.585, SILL, cz0], [sx * 0.53, (SILL + 1.42) / 2 + 0.1, -1.4], [sx * 0.47, ROOF - 0.03, RT.r]], 0.03);
    for (const p of [[sx * 0.56, SILL, cz1], [sx * 0.47, ROOF - 0.05, -0.32], [sx * 0.47, ROOF - 0.03, RT.r], [sx * 0.585, SILL, cz0], [sx * 0.59, SILL, -0.62]]) add('paint', ball(p, 0.036));
    add('steel', rod([sx * 0.6, 1.02, -0.95], [sx * 0.6, 1.02, -0.8], 0.01, 6));
    for (const hz of [-0.75, -1.15]) add('steel', tx(new THREE.CylinderGeometry(0.013, 0.013, 0.05, 8), sx * 0.47, ROOF + 0.0, hz, 0, 0, Math.PI / 2));
  }
  frame([[0.47, ROOF - 0.03, RT.r], [0, ROOF, RT.r], [-0.47, ROOF - 0.03, RT.r]]);
  frame([[0.47, ROOF - 0.04, -0.62], [0, ROOF + 0.01, -0.62], [-0.47, ROOF - 0.04, -0.62]], 0.022);
  // Windshield centre post with the wire cutter blade, deflector cable to the
  // fin top, GPS and VHF antennas on the roof.
  add('dark', rod([0, SILL + 0.06, cz1 - 0.02], [0, ROOF - 0.05, -0.32], 0.016, 8));
  add('steel', rod([0, 0.82, 0.42], [0, ROOF + 0.18, -0.3], 0.018, 8));
  add('steel', tx(new THREE.BoxGeometry(0.014, 0.5, 0.06), 0, ROOF + 0.12, -0.25, 0.75));
  add('steel', rod([0, ROOF + 0.04, -0.7], [0, 2.38, -5.3], 0.006, 5));
  add('dark', tx(new THREE.SphereGeometry(0.065, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, ROOF + 0.025, -1.05, 0, 0, 0, [1, 0.45, 1]), true);
  add('steel', rod([0.22, ROOF + 0.0, -1.0], [0.22, ROOF + 0.42, -1.32], 0.005, 5), true);
  // Headliner strip at the roof frame (inside).
  let headliner;
  {
    const nx = 8, nz = 2, inner = [], idx = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = -0.46 + (0.92 * i) / nx, z = -0.32 - (0.08 * j) / nz;
      inner.push(x, ROOF - 0.06 + 0.02 * (1 - (x / 0.46) ** 2), z);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(inner, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    headliner = tagged(g);
  }

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
    wingParts.push(atWingPanel([0.25, W.rootX, 1.0, 1.6, 2.6, 3.8, 5.0, 6.2, 7.2, W.tipX].map(st), mainProf, side, wingAO));
    wingParts.push(atWingPanel([st(0.25), st(W.rootX + 0.05)], aftProf, side, wingAO));
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
    const fil = mainProf.slice(0, 19).map(([xc, yc]) => [side * 0.6, W.rootY + yc * W.chord + 0.012, W.le - xc * W.chord]);
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
    g.computeVertexNormals();
    return g;
  };
  add('livery', liveryUV(tagged(vfin(airfoil(0, 0.64, 0.11, 0, 0.4, 12), finSt))));
  add('livery', liveryUV(tagged(loft(sampleStations([
    K(-3.85, 0.04, 0.84, 0.78, 0.86, 2.2, 2.2), K(-4.2, 0.06, 0.8, 0.74, 0.92, 2.2, 2.2), K(-4.55, 0.05, 0.74, 0.68, 0.8, 2.2, 2.2),
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
    // Spring-steel leg: a tapered flat leaf from the gear box in the lower
    // fuselage to the axle fitting, scaled with the spring deflection.
    const attachY = -0.82;
    const leg = new THREE.Group();
    leg.position.y = attachY;
    const L = (p) => [p[0], p[1] - attachY, p[2]];
    const axIn = ax - sx * 0.17;
    const legParts = [];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const P = (t) => [lerp(sx * 0.36, axIn, t), lerp(attachY, ay + 0.05, t) - 0.06 * Math.sin(Math.PI * t), lerp(az + 0.05, az, t)];
      legParts.push(bar(L(P(t0)), L(P(t1)), lerp(0.05, 0.034, (t0 + t1) / 2), lerp(0.15, 0.1, (t0 + t1) / 2)));
    }
    legParts.push(tx(new RoundedBoxGeometry(0.12, 0.16, 0.18, 2, 0.03), ...L([axIn, ay + 0.04, az])));
    legParts.push(rod(L([axIn, ay, az]), L([ax - sx * 0.02, ay, az]), 0.036, 12));
    const legMesh = new THREE.Mesh(mergeGeometries(legParts.map((p) => tagged(p))), M.paint);
    legMesh.castShadow = true; legMesh.receiveShadow = true;
    const brakeLine = new THREE.Mesh(tagged(tube([L([sx * 0.4, attachY - 0.02, az - 0.06]), L([(sx * 0.4 + axIn) / 2, (attachY + ay) / 2 - 0.06, az - 0.08]), L([axIn - sx * 0.02, ay + 0.08, az - 0.08])], 0.008, 16, 6)), M.rubber);
    leg.add(legMesh, brakeLine);
    g.add(leg);
    // Gear box fairing at the fuselage.
    add('paint', rbox(0.22, 0.12, 0.32, 0.04, sx * 0.4, -0.82, az + 0.05), false);
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
  const nozzles = [];
  const boomZ = W.le - 0.98 * W.chord, boomDrop = 0.26;
  for (const side of [1, -1]) {
    const x0 = 0.85, x1 = 7.05;
    const a = [side * x0, leY(x0) - boomDrop, boomZ], b = [side * x1, leY(x1) - boomDrop, boomZ];
    add('alu', rod(a, b, 0.03, 12));
    add('alu', ball(b, 0.036, 10));
    add('brass', tx(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 8), b[0] + side * 0.035, b[1], b[2], 0, 0, Math.PI / 2), true);
    for (const hx of [1.4, 2.6, 3.8, 5.0, 6.2]) {
      const top = [side * hx, leY(hx) - 0.03, boomZ + 0.1], bot = [side * hx, leY(hx) - boomDrop, boomZ];
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
  add('alu', tube([[0, -0.86, 0.6], [0, -0.92, 0.1], [0, -0.92, -0.6], [0, leY(0.85) - boomDrop, boomZ]], 0.042, 24, 10));
  add('alu', ball([0, leY(0.85) - boomDrop, boomZ], 0.06, 12));
  // Fan-driven pump under the belly between the gear legs.
  const pump = new THREE.Group();
  pump.position.set(0, -1.06, 0.42);
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
  add('steel', rod([0, -0.84, 0.42], [0, -0.96, 0.42], 0.03, 10));

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
  const cockpit = new THREE.Group();
  const ci = {};
  const addC = (mat, g) => { (ci[mat] ||= []).push(tagged(g)); };
  const cabAO = (x, y, z) => 0.55 + 0.45 * smoothstep(0.0, 1.15, y) * (z < -1.3 ? 0.85 : 1);
  addC('floor', tx(new THREE.BoxGeometry(1.08, 0.03, 1.7), 0, 0.04, -0.68));
  for (const sx of [1, -1]) {
    addC('interior', tx(new THREE.BoxGeometry(0.03, 0.72, 1.7), sx * 0.55, 0.42, -0.68));
    addC('interior', rbox(0.11, 0.08, 0.95, 0.02, sx * 0.475, 0.5, -0.62));
  }
  for (const [a, b] of [
    [[0.53, 0.2, 0.02], [0.53, 0.76, -0.8]], [[-0.53, 0.2, 0.02], [-0.53, 0.76, -0.8]],
    [[0.53, 0.76, 0.02], [0.53, 0.2, -1.3]], [[-0.53, 0.76, 0.02], [-0.53, 0.2, -1.3]],
    [[-0.53, 0.74, -1.35], [0.53, 0.74, -1.35]], [[0.53, 0.5, 0.02], [0.53, 0.5, -1.35]], [[-0.53, 0.5, 0.02], [-0.53, 0.5, -1.35]],
  ]) { addC('interior', rod(a, b, 0.02, 8)); addC('interior', ball(a, 0.026, 8)); }
  // Seat (dark cushions), five-point harness anchors.
  addC('seat', rbox(0.52, 0.12, 0.5, 0.045, ...o3(0, 0.05, -0.55)));
  addC('seat', rbox(0.52, 0.82, 0.12, 0.05, ...o3(0, 0.45, -0.8), -0.12));
  addC('seat', rbox(0.44, 0.22, 0.09, 0.04, ...o3(0, 0.98, -0.87), -0.12));
  for (const sx of [1, -1]) {
    addC('steel', rod(o3(sx * 0.22, -0.24, -0.4), o3(sx * 0.22, 0.0, -0.55), 0.016, 8));
    addC('steel', rod(o3(sx * 0.24, 0.0, -0.32), o3(sx * 0.24, 0.0, -0.78), 0.015, 8));
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.64, 0.01), M.harness);
    strap.position.set(...o3(sx * 0.12, 0.48, -0.74));
    strap.rotation.x = -0.12;
    cockpit.add(strap);
  }
  addC('steel', rbox(0.07, 0.05, 0.012, 0.01, ...o3(0, 0.2, -0.69), -0.12));
  // Instrument panel (live canvas) with bezels, sub-frame and glareshield.
  const PW = AT_PANEL.w, PH = AT_PANEL.h;
  const pz = -0.085, pyc = 0.755;
  const panelMat = new THREE.MeshStandardMaterial({ map: panel.texture, roughness: 0.55, emissive: 0xffffff, emissiveMap: panel.texture, emissiveIntensity: 0.12 });
  const panelMesh = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), panelMat);
  panelMesh.position.set(0, pyc, pz);
  panelMesh.rotation.y = Math.PI;
  cockpit.add(panelMesh);
  addC('interior', tx(new THREE.BoxGeometry(PW + 0.02, PH + 0.02, 0.05), 0, pyc, pz + 0.03));
  {
    const PX = (px) => PW / 2 - (px / AT_PANEL.W) * PW, PY = (py) => pyc + PH / 2 - (py / AT_PANEL.H) * PH, s = PW / AT_PANEL.W, zf = pz - 0.002;
    for (const [px, py, r] of [[92, 158, 64], [236, 158, 64], [380, 158, 64], [92, 308, 56], [236, 308, 56], [380, 308, 56],
      [520, 158, 54], [646, 158, 54], [520, 308, 54], [646, 308, 54], [72, 428, 40], [172, 428, 40], [272, 428, 40], [372, 428, 40]]) {
      const Rr = (r + 7) * s;
      addC('gloss', tx(new THREE.TorusGeometry(Rr, 0.005, 8, 32), PX(px), PY(py), zf - 0.004));
      addC('gloss', tx(new THREE.CylinderGeometry(Rr, Rr, 0.014, 32, 1, true), PX(px), PY(py), zf, Math.PI / 2));
    }
    const frameBox = (x0, y0, x1, y1, d, t) => {
      const cx = (PX(x0) + PX(x1)) / 2, cy = (PY(y0) + PY(y1)) / 2, w = Math.abs(PX(x1) - PX(x0)), h = Math.abs(PY(y1) - PY(y0));
      addC('gloss', tx(new THREE.BoxGeometry(w + t * 2, t, d), cx, cy + h / 2 + t / 2, zf - d / 2 + 0.004));
      addC('gloss', tx(new THREE.BoxGeometry(w + t * 2, t, d), cx, cy - h / 2 - t / 2, zf - d / 2 + 0.004));
      addC('gloss', tx(new THREE.BoxGeometry(t, h, d), cx + w / 2 + t / 2, cy, zf - d / 2 + 0.004));
      addC('gloss', tx(new THREE.BoxGeometry(t, h, d), cx - w / 2 - t / 2, cy, zf - d / 2 + 0.004));
    };
    frameBox(712, 18, 1008, 286, 0.03, 0.008); // GPS bezel
    frameBox(30, 34, 702, 64, 0.012, 0.004); // annunciator strip
    frameBox(722, 312, 856, 410, 0.016, 0.005); // flow monitor
    for (let i = 0; i < 10; i++) addC('steel', tx(new THREE.CylinderGeometry(0.006, 0.007, 0.008, 10), PX(586 + i * 43), PY(482), zf - 0.004, Math.PI / 2));
  }
  // Hopper sight gauge on the forward bulkhead (live level).
  const sightMat = new THREE.MeshStandardMaterial({ map: panel.sightTexture, roughness: 0.4, emissive: 0xffffff, emissiveMap: panel.sightTexture, emissiveIntensity: 0.08 });
  const sight = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.3), sightMat);
  sight.position.set(...o3(-0.17, 0.0, 0.42));
  sight.rotation.y = Math.PI;
  cockpit.add(sight);
  addC('gloss', rbox(0.2, 0.33, 0.012, 0.006, ...o3(-0.17, 0.0, 0.428)));
  addC('interior', tx(new THREE.BoxGeometry(1.12, 0.46, 0.03), 0, 0.25, 0.04));
  addC('interior', tx(new THREE.BoxGeometry(1.14, 1.3, 0.03), 0, 0.68, -1.42));
  add('deck', tx(new THREE.BoxGeometry(1.06, 0.025, 0.16), 0, 1.03, -0.02));
  const glareCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.54, 0.99, -0.095), new THREE.Vector3(0.28, 1.03, -0.098), new THREE.Vector3(0, 1.045, -0.1),
    new THREE.Vector3(-0.28, 1.03, -0.098), new THREE.Vector3(-0.54, 0.99, -0.095),
  ]);
  addC('gloss', new THREE.TubeGeometry(glareCurve, 32, 0.034, 12, false));
  // Lightbar on the glareshield.
  const lightbar = new THREE.Group();
  lightbar.position.set(0, 1.075, -0.03);
  const leds = [];
  for (let i = -7; i <= 7; i++) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.014, 0.008), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    led.position.set(-i * 0.0155, 0, -0.016);
    lightbar.add(led);
    leds.push(led);
  }
  lightbar.add(new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.032, 0.03, 2, 0.006), M.dark));
  cockpit.add(lightbar);
  // Stick (same grip geometry as the PR-AGW so the shared pilot's hand fits),
  // with the red spray trigger on top.
  const stick = new THREE.Group();
  stick.position.set(...o3(0, -0.22, -0.12));
  {
    const boot = new THREE.Mesh(lathe([[0.08, 0], [0.075, 0.02], [0.055, 0.06], [0.032, 0.1], [0.018, 0.14]], 16), M.rubber);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.56, 10), M.steel);
    shaft.position.y = 0.3;
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.027, 0.11, 6, 14), M.gloss);
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
    p.add(new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.17, 0.025, 2, 0.008), M.steel));
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.22, 8), M.steel);
    arm.position.set(0, -0.13, 0.03);
    p.add(arm);
    cockpit.add(p);
    pedals.push(p);
  }
  // PT6 power quadrant on the left console: power lever (black T-handle),
  // prop lever (blue) and fuel condition lever (red), and the flap switch.
  const THR = [0.5, 0.5, 0.05]; // power lever, PR-AGW frame (outboard of the PR-AGW's)
  addC('dark', rbox(0.11, 0.05, 0.36, 0.015, ...o3(0.48, 0.485, 0.02)));
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
  for (const [lx, col, rot] of [[0.465, M.blue, 0.38], [0.44, M.red, 0.42]]) {
    const lv = new THREE.Group();
    lv.position.set(...o3(lx, 0.5, 0.0));
    lv.rotation.x = rot;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.15, 8), M.steel);
    s.position.y = 0.075;
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), col);
    k.position.y = 0.15;
    lv.add(s, k);
    cockpit.add(lv);
  }
  // Spray valve handle (hydraulic boom valve) on the right console.
  const valve = new THREE.Group();
  valve.position.set(...o3(-0.43, 0.47, 0.0));
  {
    const vl = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.18, 8), M.steel);
    vl.position.y = 0.09;
    const vk = new THREE.Mesh(new RoundedBoxGeometry(0.055, 0.032, 0.032, 2, 0.008), M.red);
    vk.position.y = 0.18;
    valve.add(vl, vk);
  }
  cockpit.add(valve);
  const er = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 8, 16, Math.PI), M.red);
  er.position.set(...o3(-0.5, 0.52, 0.15));
  er.rotation.y = Math.PI / 2;
  cockpit.add(er);
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
    root, M,
    prop, blades, bladeMats: [bladeMat, tipMat], disc,
    ailerons, flaps, elevator, rudder,
    gear: gearGroups,
    stick, pedals, throttle, valve, leds, panelMesh,
    pumpFan, nozzles, pilot, cockpit, glassMesh,
    eye: new THREE.Vector3(0, 1.0, -0.5).add(OFF),
    fuelFiller: new THREE.Vector3(2.1, atWingY(2.1) + 0.12, -0.55),
    hopperPort: new THREE.Vector3(0.62, -0.55, -1.5),
    update,
  };
}
