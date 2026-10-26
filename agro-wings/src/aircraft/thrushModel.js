// Procedural Thrush 510G (fictional registration PR-TSH), white with the red
// swoosh of the reference photographs. VISUAL ONLY: the physics
// (FLIGHT_T510G), gear contact points and hard points live in
// src/config.js; the gear points are read here only to place the wheels.
// Body frame: +Z nose, +Y up, +X left wing; origin = CG.
//
// Fuselage, glasshouse and wing come from thrushGeom.js (shared with the
// cockpit). The parts, after photographs of the type: a slim GE H80 cowling
// falling to a long polished spinner, the round exhaust stacks either side
// behind the prop and the chin inlet; a dark anti-glare top on the cowl; the
// hopper with its natural (tan) fibreglass lid rising to the windshield; a
// tall glasshouse with a three-piece windshield, door and quarter windows
// and a white roof; a steep cabin fairing into the upswept tail cone; the
// tall square-topped fin with a large rudder, a strut-braced tailplane; a
// constant-chord wing with large flaps, long ailerons and red tips; tubular
// main legs with drag braces on big 29×11 tyres, a tailwheel on a long
// spring; booms under the trailing edge on hangers; a four-blade Hartzell.
// The cockpit is built by thrushCockpit.js. Paint and lettering are a
// side-projected livery with a matching bump map; AO is baked into vertex
// colours; fine detail sits in a LOD.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { rng, clamp, smoothstep, lerp } from '../core/math.js';
import { FLIGHT_T510G } from '../config.js';
import {
  loft, K, sampleStations, airfoil, wingPanel, flipWinding, tagged, shade, tx, rod, tube, bar, ball, rbox, lathe,
  speckle, orangePeel, treadTexture, propDiscTexture, WING_SPAN_UV, buildPilot,
} from './model.js';
import {
  SILL, CAN, PROP_Z, THRUST_Y, FWD_KEYS, AFT_KEYS, FWD_ST, CAB_ST, AFT_ST, N_KEEL, N_WALL, N_TOP,
  halfSection, sectionRing, sampleSt, fusX, crownY, canW, canF, wsC, WS_K, DOOR_Z, TH_WING, thWingY, COCKPIT_OFF, EYE,
} from './thrushGeom.js';
import { buildThrushCockpit } from './thrushCockpit.js';

const DIH = TH_WING.dih;
export { thWingY };
void sampleSt; void FWD_KEYS; void AFT_KEYS; void N_TOP;
const SPAN_UV = 7.4; // half-span metres mapped to u = 0..1 on the wing texture
const WHITE = '#f4f4f1';
const RED = '#c21f26';
const INK = '#1a1a1d';
const TAN = '#b9a57c';

// Ground shadow planform for createContactShadow().
export const T510_SHADOW = { W: 16, L: 11.5, wing: [7.24, -1.65, 0.75], fus: [0.6, -0.5, 4.3], tail: [2.7, -5.4, -4.3], core: [5.2, 3.2] };

// Livery: side projection (z, y); top half = left side (nose to the left),
// bottom half = right side (nose to the right), lettering upright on both.
const LV = { Z0: -5.65, Z1: 4.4, Y0: -0.7, Y1: 2.45, W: 2048, H: 1024, M: 6 };
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

const aftTop = AFT_ST.map((st) => [st.z, st.yt]);
const aftBot = AFT_ST.map((st) => [st.z, st.yb]);
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
    g.fillStyle = WHITE;
    g.fillRect(0, oy, LV.W, LV.H / 2);
    // Grey-dusted belly.
    const [, belly] = P(0, -0.25);
    const grd = g.createLinearGradient(0, belly, 0, oy + LV.H / 2);
    grd.addColorStop(0, 'rgba(110,100,85,0)');
    grd.addColorStop(1, 'rgba(110,100,85,0.18)');
    g.fillStyle = grd;
    g.fillRect(0, belly, LV.W, oy + LV.H / 2 - belly);
    // The swoosh: a solid red sweep along the lower forward fuselage, its
    // top edge curving up and aft to under the cabin, split by white
    // pinstripes into five bands that fan out toward the tail.
    const bez = (p0, p1, p2, t) => [(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]];
    const curve = (p0, p1, p2, n = 28) => Array.from({ length: n + 1 }, (_, i) => bez(p0, p1, p2, i / n));
    const bands = 5;
    const top0 = [[2.45, -0.12], [0.6, -0.12], [-1.2, 0.72]];
    const bot0 = [[2.6, -0.32], [0.2, -0.62], [-1.85, 0.12]];
    // Solid lower part, under the bands.
    poly([...curve(...bot0), ...curve([-1.6, -0.4], [0.4, -0.75], [2.7, -0.45]), [2.6, -0.32]], RED);
    for (let i = 0; i < bands; i++) {
      const f0 = i / bands, f1 = (i + 0.78) / bands;
      const mix = (f) => top0.map((p, k) => [lerp(p[0], bot0[k][0], f), lerp(p[1], bot0[k][1], f)]);
      const a = curve(...mix(f0)), bb = curve(...mix(f1));
      poly([...a, ...bb.reverse()], RED);
    }
    // Cowling: access-panel seams, camlock rows, the firewall seam, the
    // hopper bay seams; aft fuselage doors and the tail cone joint.
    const seams = [
      [[3.62, -0.02], [3.62, 0.62]], [[2.2, -0.3], [2.2, 0.88]], [[3.62, 0.5], [2.2, 0.72]], [[3.62, 0.08], [2.2, -0.02]],
      [[1.85, -0.39], [1.85, 1.02]], [[0.48, -0.49], [0.48, 1.18]], [[-1.48, -0.36], [-1.48, 1.08]], [[-3.0, -0.08], [-3.0, 0.95]],
      [[-1.48, 0.2], [-3.0, 0.32]], [[-4.4, 0.24], [-4.4, 0.8]],
    ];
    for (const s of seams) {
      line(g, s, 'rgba(90,90,95,0.28)', 2);
      line(gb, s, '#3c3c3c', 2.6);
      const [[za, ya], [zb, yb]] = s;
      const n = Math.max(2, Math.round(Math.hypot(za - zb, ya - yb) / 0.06));
      for (let k = 0; k <= n; k++) {
        const [px, py] = P(za + ((zb - za) * k) / n + 0.02, ya + ((yb - ya) * k) / n);
        g.fillStyle = 'rgba(90,90,95,0.22)'; g.fillRect(px - 1, py - 1, 2, 2);
        gb.fillStyle = '#5c5c5c'; gb.beginPath(); gb.arc(px, py, 1.4, 0, Math.PI * 2); gb.fill();
      }
    }
    for (let k = 0; k < 6; k++) {
      const z = 3.45 - k * 0.22;
      for (const y of [0.56, 0.06]) {
        const [px, py] = P(z, y);
        g.fillStyle = 'rgba(60,60,64,0.5)'; g.beginPath(); g.arc(px, py, 3, 0, Math.PI * 2); g.fill();
        gb.fillStyle = '#a8a8a8'; gb.beginPath(); gb.arc(px, py, 3, 0, Math.PI * 2); gb.fill();
      }
    }
    // Louvres on the lower cowl, behind the exhaust.
    for (let k = 0; k < 7; k++) {
      const pts = [[2.85 - k * 0.05, -0.12], [2.85 - k * 0.05, 0.05]];
      line(g, pts, 'rgba(25,25,28,0.55)', 3); line(gb, pts, '#202020', 4);
    }
    const door = (z0, z1, y0, y1) => {
      const pts = [[z0, y0], [z1, y0], [z1, y1], [z0, y1], [z0, y0]];
      line(g, pts, 'rgba(90,90,95,0.32)', 2); line(gb, pts, '#383838', 2.8);
    };
    door(-2.0, -2.5, 0.25, 0.6);
    door(-3.6, -3.95, 0.48, 0.68);
    // Exhaust soot streaming aft from the stacks.
    {
      const [ax, ay] = P(3.2, 0.3), [bx] = P(1.4, 0.3);
      const sg = g.createLinearGradient(ax, 0, bx, 0);
      sg.addColorStop(0, 'rgba(40,34,26,0.42)');
      sg.addColorStop(0.5, 'rgba(40,34,26,0.14)');
      sg.addColorStop(1, 'rgba(40,34,26,0)');
      g.fillStyle = sg;
      g.beginPath(); g.ellipse((ax + bx) / 2, ay + 5, Math.abs(bx - ax) / 2, 0.1 * LV.ky, 0, 0, Math.PI * 2); g.fill();
    }
    const text = (z, y, str, hM, col, font = 'bold', stroke = null, wScale = 1) => {
      const [px, py] = P(z, y);
      g.save();
      g.font = `${font} ${Math.round(hM * LV.ky * 1.25)}px Arial`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.setTransform(1, 0, 0, 1, px, py);
      g.scale((LV.kx / LV.ky) * wScale, 1);
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 6; g.strokeText(str, 0, 0); }
      g.fillStyle = col;
      g.fillText(str, 0, 0);
      g.restore();
    };
    // GE roundel and a THRUSH badge on the cowl side, as on the type.
    {
      const [px, py] = P(3.05, 0.4);
      const rr = 0.075 * LV.ky;
      g.fillStyle = '#1f5fae'; g.beginPath(); g.ellipse(px, py, rr * (LV.kx / LV.ky), rr, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = WHITE; g.lineWidth = 2; g.stroke();
      text(3.05, 0.4, 'GE', 0.07, WHITE, 'italic bold');
      const [bx0, by0] = P(2.78, 0.48), [bx1, by1] = P(2.28, 0.34);
      g.fillStyle = WHITE; g.fillRect(Math.min(bx0, bx1) - 3, by0 - 3, Math.abs(bx1 - bx0) + 6, by1 - by0 + 6);
      g.fillStyle = RED; g.fillRect(Math.min(bx0, bx1), by0, Math.abs(bx1 - bx0), by1 - by0);
      text(2.53, 0.41, 'THRUSH', 0.085, WHITE, 'italic bold');
    }
    // Registration on the aft fuselage; small lettering.
    text(-2.75, 0.5, reg, 0.24, RED, 'bold', null, 1.05);
    text(-1.05, 0.16, 'AGRO WINGS', 0.05, 'rgba(40,40,44,0.75)', 'italic bold');
    text(-2.3, 0.14, 'RESTRICTED', 0.032, 'rgba(30,30,30,0.7)', 'bold');
    text(1.95, -0.1, 'NO STEP', 0.032, 'rgba(30,30,30,0.7)', 'bold');
    text(0.9, 0.18, 'JET A-1', 0.034, 'rgba(30,30,30,0.75)', 'bold');
    // Fin: THRUSH badge (red, white italic letters) under the cap.
    {
      const [x0, y0] = P(-4.1, 2.12), [x1, y1] = P(-5.0, 1.86);
      g.fillStyle = WHITE; g.fillRect(Math.min(x0, x1) - 4, y0 - 4, Math.abs(x1 - x0) + 8, y1 - y0 + 8);
      g.fillStyle = RED; g.fillRect(Math.min(x0, x1), y0, Math.abs(x1 - x0), y1 - y0);
      text(-4.55, 1.99, 'THRUSH', 0.15, WHITE, 'italic bold');
    }
    // Rudder hinge line and the fin/deck seam.
    line(g, [[-4.9, 0.85], [-5.02, 2.3]], 'rgba(60,60,64,0.4)', 2);
    line(gb, [[-4.9, 0.85], [-5.02, 2.3]], '#202020', 3);
    line(g, aftTop.filter(([z]) => z < -3.2).map(([z, y]) => [z, y + 0.01]), 'rgba(90,90,95,0.25)', 2);
    void aftBot;
    speckle(g, 0, oy, LV.W, LV.H / 2, 2400, side > 0 ? 27 : 28, 0.06);
  }
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}

// Wing skin: u = span / SPAN_UV, v = chord fraction (0 = LE). Red tip
// with a curved inner edge; 510G in white on the upper surface of the
// tip (the shader shows the same texture on both surfaces; the lettering
// is only drawn on the top: see `upper`).
function wingTextures(upper) {
  const W = 2048, H = 512;
  const c = canvas(W, H), b = canvas(W, H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  g.fillStyle = WHITE; g.fillRect(0, 0, W, H);
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, W, H);
  orangePeel(gb, W, H, 63);
  const X = (m) => (m / SPAN_UV) * W, Y = (f) => f * H;
  const r = rng(37);
  // Red tip: inner edge raked, curved toward the trailing edge.
  g.fillStyle = RED;
  g.beginPath(); g.moveTo(X(5.85), 0);
  g.bezierCurveTo(X(5.9), Y(0.35), X(6.2), Y(0.7), X(6.5), H);
  g.lineTo(W, H); g.lineTo(W, 0); g.closePath(); g.fill();
  if (upper) {
    g.save();
    g.translate(X(6.55), Y(0.42));
    g.rotate(Math.PI / 2);
    g.scale(1, (W / SPAN_UV) / (H / 2.37));
    g.fillStyle = WHITE; g.font = 'bold 74px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('510G', 0, 0);
    g.restore();
  }
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(120,110,90,${0.02 + r() * 0.04})`;
    g.fillRect(r() * W, Y(0.1 + r() * 0.8), 2 + r() * 3, 30 + r() * 120);
  }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(70,60,45,${0.06 + r() * 0.12})`;
    g.fillRect(r() * W, Y(r() * 0.06), 1 + r() * 2, 1 + r() * 2);
  }
  const seam = (x0, y0, x1, y1, rivet = 0.055) => {
    g.strokeStyle = 'rgba(90,90,95,0.24)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    gb.strokeStyle = '#3e3e3e'; gb.lineWidth = 2.6;
    gb.beginPath(); gb.moveTo(x0, y0); gb.lineTo(x1, y1); gb.stroke();
    const n = Math.max(2, Math.round(Math.hypot((x1 - x0) / (W / SPAN_UV), ((y1 - y0) / H) * 2.37) / rivet));
    gb.fillStyle = '#5c5c5c';
    for (let k = 0; k <= n; k++) { gb.beginPath(); gb.arc(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n + 5, 1.4, 0, Math.PI * 2); gb.fill(); }
  };
  for (const f of [0.1, 0.27, 0.72]) seam(X(0.3), Y(f), X(7.2), Y(f));
  for (let x = 0.9; x < 7.1; x += 0.5) seam(X(x), Y(0.0), X(x), Y(0.72), 0.06);
  g.fillStyle = 'rgba(40,40,40,0.4)'; g.fillRect(0, Y(0.742), W, 5);
  gb.fillStyle = '#202020'; gb.fillRect(0, Y(0.742), W, 6);
  g.fillRect(X(4.12) - 2, Y(0.75), 4, H); gb.fillRect(X(4.12) - 3, Y(0.75), 6, H);
  for (const [a, bb] of [[1.4, 2.0], [2.3, 2.9], [3.2, 3.8]]) {
    g.strokeStyle = 'rgba(90,90,95,0.3)'; g.lineWidth = 2; g.strokeRect(X(a), Y(0.34), X(bb) - X(a), Y(0.24));
    gb.strokeStyle = '#383838'; gb.lineWidth = 2.6; gb.strokeRect(X(a), Y(0.34), X(bb) - X(a), Y(0.24));
  }
  speckle(g, 0, 0, W, H, 2200, upper ? 43 : 44, 0.06);
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}

// Wing panel with the texture's span scale; `lowerOnly`/`upperOnly` split
// the profile so the upper surface can carry its own lettering.
const thWingPanel = (stations, prof, side, ao) => {
  const g = wingPanel(stations, prof, side, ao);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * WING_SPAN_UV) / SPAN_UV);
  return g;
};

// Four-blade Hartzell blade (twisted airfoil sections along +X), a broad
// paddle with a rounded tip.
function bladeLoft(r0, r1, steps, R) {
  const pos = [], idx = [];
  let n = 0;
  for (let i = 0; i <= steps; i++) {
    const r = r0 + ((r1 - r0) * i) / steps;
    const f = clamp((r - 0.2) / (R - 0.2), 0, 1);
    let c = 0.11 + 0.12 * Math.sin(Math.PI * Math.min(1, f * 1.0 + 0.05)) ** 0.5;
    if (f > 0.9) c *= Math.sqrt(Math.max(0.05, 1 - ((f - 0.9) / 0.1) ** 2));
    const t = lerp(0.22, 0.06, f);
    const beta = Math.atan(1.5 / (2 * Math.PI * Math.max(r, 0.24)));
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
export function createThrushModel(panel, opts = {}) {
  const A = FLIGHT_T510G;
  const root = new THREE.Group();
  root.name = 'thrush510g';
  const liv = liveryTextures(opts.reg ?? 'PR-TSH');
  const wtxU = wingTextures(true), wtxL = wingTextures(false);
  const coat = { roughness: 0.42, metalness: 0.0, specularIntensity: 0.32, clearcoat: 0.2, clearcoatRoughness: 0.28, envMap: opts.envMap ?? null, envMapIntensity: 0.32 };
  const ALBEDO = 0.86;
  const M = {
    paint: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(WHITE).multiplyScalar(ALBEDO), vertexColors: true, ...coat }),
    red: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(RED).multiplyScalar(ALBEDO), vertexColors: true, ...coat }),
    livery: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALBEDO), map: liv.map, bumpMap: liv.bump, bumpScale: 1.3, vertexColors: true, ...coat }),
    wing: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALBEDO), map: wtxU.map, bumpMap: wtxU.bump, bumpScale: 1.3, vertexColors: true, ...coat }),
    wingLow: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALBEDO), map: wtxL.map, bumpMap: wtxL.bump, bumpScale: 1.3, vertexColors: true, ...coat }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.62, metalness: 0.1, vertexColors: true }),
    // Anti-glare top of the cowling: dark grey, matte.
    deck: new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a2d31'), roughness: 0.9, metalness: 0.05, envMapIntensity: 0.35 }),
    // Anti-slip walkway at the wing roots.
    walk: new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a4d50'), roughness: 0.95, metalness: 0.0 }),
    // Hopper lid: natural fibreglass, a warm tan with a little gloss.
    lid: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(TAN).multiplyScalar(0.92), roughness: 0.38, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35, vertexColors: true, envMap: opts.envMap ?? null, envMapIntensity: 0.4 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.28, metalness: 0.92, vertexColors: true }),
    polished: new THREE.MeshStandardMaterial({ color: 0xd0d5da, roughness: 0.16, metalness: 1.0, envMap: opts.envMap ?? null, envMapIntensity: 0.7 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x5c6166, roughness: 0.42, metalness: 0.85, vertexColors: true }),
    grey: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.35, vertexColors: true }),
    exhaust: new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.45, metalness: 0.85, vertexColors: true }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.94, metalness: 0, vertexColors: true }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92, metalness: 0, bumpMap: treadTexture(), bumpScale: 2.5 }),
    gloss: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.28, metalness: 0.1, vertexColors: true }),
    hub: new THREE.MeshStandardMaterial({ color: 0xd8d8d4, roughness: 0.32, metalness: 0.4 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb8913c, roughness: 0.35, metalness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xa8bcc6, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.4, depthWrite: false, side: THREE.DoubleSide }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false }),
    navRed: new THREE.MeshStandardMaterial({ color: 0xc8261b, roughness: 0.45, emissive: 0x330000 }),
    navGreen: new THREE.MeshStandardMaterial({ color: 0x1f9a3a, roughness: 0.45, emissive: 0x002200 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xf2b400, roughness: 0.45 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35, emissive: 0x222222 }),
    beacon: new THREE.MeshStandardMaterial({ color: 0xd8261b, roughness: 0.3, emissive: 0xff2010, emissiveIntensity: 0 }),
    strobe: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.2, emissive: 0xffffff, emissiveIntensity: 0 }),
    suit: new THREE.MeshStandardMaterial({ color: 0x4f5a6a, roughness: 0.88 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.75 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xb88462, roughness: 0.7 }),
    helmet: new THREE.MeshPhysicalMaterial({ color: 0xf0eee8, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x15181c, roughness: 0.05, metalness: 0.3, clearcoat: 1 }),
    helmStripe: new THREE.MeshPhysicalMaterial({ color: 0xc21f26, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
  };

  const B = {};
  const add = (mat, g, fine = false) => { const k = (fine ? 'fine:' : '') + mat; (B[k] ||= []).push(tagged(g)); };

  // ---------------- fuselage ----------------
  const fusAO = (x, y, z) => {
    let a = 1 - Math.max(0, -y - 0.15) * 0.3;
    const yb = Math.max(0, 1 - Math.abs(y + 0.36) / 0.26), zb = Math.max(0, 1 - Math.abs(z + 0.4) / 1.3);
    a *= 1 - 0.32 * yb * Math.sqrt(zb); // wing-root shadow line
    const sb = Math.max(0, 1 - Math.abs(y - 0.7) / 0.14) * (z < -4.2 && z > -5.4 ? 1 : 0);
    a *= 1 - 0.2 * sb;
    if (z > 3.65) a *= 0.86 + 0.14 * clamp((3.8 - z) / 0.15, 0, 1);
    return clamp(a, 0.5, 1);
  };
  add('livery', liveryUV(tagged(loftSt(FWD_ST, fusAO))));
  // Cabin: the lower fuselage only, its walls cut along the sill under the
  // glasshouse.
  add('livery', liveryUV(tagged(loftSt(CAB_ST, fusAO, true))));
  add('livery', liveryUV(tagged(loftSt(AFT_ST, fusAO))));
  // Dark anti-glare top along the cowling crown, spinner to the hopper.
  const crownBand = (from, scale = 1.012, lift = 0.005) => (st) => {
    const h = halfSection(st).slice(from).map(([x, y]) => [x * scale, y + lift]);
    return h.concat(h.slice(0, -1).reverse().map(([x, y]) => [-x, y]));
  };
  add('deck', loftSt(FWD_ST.filter((st) => st.z <= 3.72 && st.z >= 1.86), null, false, crownBand(N_KEEL + N_WALL + 7)));
  // Hopper: the fibreglass lid over the top and upper sides of the hopper
  // bay (z 1.85 → windshield), with a raised rim, the yellow vent cap and
  // the latch handles.
  {
    const lidRing = (st) => {
      const h = halfSection(st).slice(N_KEEL + 3);
      const nrm = (k) => { const [x0, y0] = h[Math.max(0, k - 1)], [x1, y1] = h[Math.min(h.length - 1, k + 1)], l = Math.hypot(x1 - x0, y1 - y0) || 1; return [(y1 - y0) / l, -(x1 - x0) / l]; };
      const top = h.map((p, k) => { const [nx, ny] = nrm(k); return [p[0] + nx * 0.006, p[1] + ny * 0.006]; });
      return top.concat(top.slice(0, -1).reverse().map(([x, y]) => [-x, y]));
    };
    add('lid', loftSt(FWD_ST.filter((st) => st.z <= 1.83 && st.z >= 0.5), (x, y) => 0.8 + 0.2 * smoothstep(0.6, 1.1, y), false, lidRing));
    // Rims fore and aft of the lid, the frame along its lower edges.
    for (const z of [1.83, 0.52]) {
      const st = FWD_ST.reduce((a, b) => (Math.abs(b.z - z) < Math.abs(a.z - z) ? b : a));
      const h = halfSection(st).slice(N_KEEL + 3).map(([x, y]) => [x * 1.01, y + 0.008, z]);
      add('paint', tube(h.concat(h.slice(0, -1).reverse().map(([x, y, zz]) => [-x, y, zz])), 0.012, 40, 6));
    }
    for (const sx of [1, -1]) {
      const edge = FWD_ST.filter((st) => st.z <= 1.83 && st.z >= 0.52).map((st) => { const [x, y] = halfSection(st)[N_KEEL + 3]; return [sx * (x + 0.006), y, st.z]; });
      add('paint', tube(edge, 0.011, 30, 6));
    }
    add('yellow', tx(new THREE.CylinderGeometry(0.06, 0.07, 0.06, 18), 0, crownY(1.62) + 0.03, 1.62));
    add('steel', tx(new THREE.CylinderGeometry(0.012, 0.012, 0.13, 8), 0, crownY(1.62) + 0.065, 1.62, 0, 0, Math.PI / 2), true);
    for (const sx of [-0.2, 0.2]) add('steel', rbox(0.05, 0.024, 0.07, 0.01, sx, crownY(0.75) + 0.012, 0.75, -0.08), true);
  }
  // Cabin sill ledges.
  for (const sx of [1, -1]) add('paint', tube([[sx * CAN.ww, SILL, 0.48], [sx * (CAN.ww + 0.004), SILL, -0.3], [sx * CAN.ww, SILL, CAN.zR]], 0.022, 16, 8));
  // Hopper loading coupler (left side, behind the wing) and the pipe along
  // the belly; gatebox under the hopper.
  {
    const cx = fusX(-1.6, -0.12);
    add('dark', tx(new THREE.CylinderGeometry(0.075, 0.075, 0.11, 18), cx + 0.02, -0.12, -1.6, 0, 0, Math.PI / 2));
    add('brass', tx(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 18), cx + 0.085, -0.12, -1.6, 0, 0, Math.PI / 2));
    add('alu', tube([[-1.6, -0.15], [-1.0, -0.33], [0.0, -0.44], [0.9, -0.47]].map(([z, y]) => [fusX(z, y) + 0.03, y, z]), 0.04, 18, 8));
    const gy = -0.49;
    add('alu', rbox(0.62, 0.035, 0.84, 0.012, 0, gy, 1.15));
    add('alu', rbox(0.54, 0.15, 0.74, 0.04, 0, gy - 0.075, 1.15));
    add('dark', rbox(0.42, 0.04, 0.58, 0.012, 0, gy - 0.155, 1.15));
    for (let k = 0; k < 8; k++) for (const sx of [1, -1]) add('steel', tx(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 6), sx * 0.29, gy + 0.022, 0.78 + k * 0.105), true);
    add('steel', rod([0.28, gy - 0.07, 1.45], [0.32, gy - 0.05, 0.9], 0.012, 6), true);
  }
  // Boarding step and grab handle (left side, the cabin door).
  {
    const sx0 = fusX(-0.4, 0.25);
    add('steel', rod([sx0 - 0.005, 0.25, -0.4], [sx0 + 0.06, -0.02, -0.4], 0.014, 8));
    add('steel', rbox(0.15, 0.016, 0.11, 0.004, sx0 + 0.09, -0.025, -0.4), true);
    const hx = fusX(-0.1, 1.08);
    add('steel', tube([[hx, 1.04, -0.02], [hx + 0.035, 1.08, -0.06], [hx + 0.035, 1.08, -0.24], [hx, 1.04, -0.28]], 0.011, 10, 6), true);
  }
  // GE H80 exhaust stacks: short round bronze pipes out of the cowl sides
  // just behind the prop, at the spinner's height, turned aft.
  for (const sx of [1, -1]) {
    const pts = [[sx * 0.3, 0.3, 3.38], [sx * 0.4, 0.3, 3.36], [sx * 0.47, 0.295, 3.3], [sx * 0.5, 0.29, 3.18]];
    add('exhaust', tube(pts, 0.062, 22, 14));
    const end = new THREE.Vector3(...pts[3]), dir = end.clone().sub(new THREE.Vector3(...pts[2])).normalize();
    const throat = new THREE.CircleGeometry(0.058, 18);
    throat.applyMatrix4(new THREE.Matrix4().compose(end.clone().addScaledVector(dir, -0.03), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().negate()), new THREE.Vector3(1, 1, 1)));
    add('gloss', throat);
    add('exhaust', tx(new THREE.TorusGeometry(0.066, 0.01, 6, 20), sx * 0.31, 0.3, 3.38, 0, Math.PI / 2));
  }
  // Nose bowl: a face round the spinner; the chin air inlet under it (dark
  // mouth, screen, duct); the oil-cooler scoop under the cowl, drains.
  {
    const st0 = FWD_ST[0], z0 = st0.z;
    const face = new THREE.Shape(sectionRing(st0).slice(0, -1).map(([x, y]) => new THREE.Vector2(x * 0.995, y)));
    const hole = new THREE.Path(); hole.absarc(0, THRUST_Y, 0.236, 0, Math.PI * 2, true); face.holes.push(hole);
    const mouth = new THREE.Path(); mouth.absellipse(0, 0.12, 0.13, 0.05, 0, Math.PI * 2, true); face.holes.push(mouth);
    add('paint', shade(tagged(tx(new THREE.ShapeGeometry(face, 24), 0, 0, z0 - 0.004)), () => 0.86));
    add('paint', tx(new THREE.TorusGeometry(0.242, 0.012, 8, 44), 0, THRUST_Y, z0 - 0.004));
    add('dark', tx(new THREE.CylinderGeometry(0.236, 0.236, 0.1, 44, 1, true), 0, THRUST_Y, z0 - 0.05, Math.PI / 2));
    const duct = new THREE.CylinderGeometry(1, 1, 0.3, 28, 1, true).rotateX(Math.PI / 2).scale(0.13, 0.05, 1);
    const ductM = new THREE.Mesh(duct, new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.9, side: THREE.BackSide }));
    ductM.position.set(0, 0.12, z0 - 0.15);
    root.add(ductM);
    add('gloss', tx(new THREE.CircleGeometry(1, 28).scale(0.13, 0.05, 1), 0, 0.12, z0 - 0.29));
    for (let k = -2; k <= 2; k++) add('steel', tx(new THREE.BoxGeometry(0.24, 0.004, 0.004), 0, 0.12 + k * 0.018, z0 - 0.025), true);
  }
  add('paint', rbox(0.28, 0.11, 0.55, 0.04, 0, -0.28, 2.55, -0.12));
  add('dark', tx(new THREE.PlaneGeometry(0.22, 0.06), 0, -0.285, 2.83, -0.12));
  for (const sx of [-0.08, 0.08]) add('steel', rod([sx, -0.26, 2.15], [sx, -0.34, 2.1], 0.008, 6), true);
  // Landing/taxi lights in the lower cowl cheeks.
  for (const sx of [1, -1]) {
    add('lens', tx(new THREE.CircleGeometry(0.045, 16), sx * (fusX(3.5, 0.05) + 0.004), 0.05, 3.5, 0, sx * Math.PI / 2));
    add('white', tx(new THREE.CircleGeometry(0.035, 16), sx * (fusX(3.5, 0.05) - 0.002), 0.05, 3.5, 0, sx * Math.PI / 2));
  }
  // Spinner: long and pointed, polished, with a backplate.
  const spinner = lathe([[0.0, 0.46], [0.03, 0.43], [0.07, 0.38], [0.115, 0.31], [0.16, 0.22], [0.2, 0.13], [0.225, 0.06], [0.234, 0]].reverse(), 40);
  spinner.rotateX(Math.PI / 2);
  const spinnerMesh = new THREE.Mesh(mergeGeometries([tagged(spinner), tagged(tx(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 40), 0, 0, -0.005, Math.PI / 2))]), M.polished);
  spinnerMesh.castShadow = true;

  // ---------------- glasshouse ----------------
  // Horizontal plan rings from the sill to the crown; front = the three
  // windshield panes, rear = the fairing's first section at CAN.zR. Glass up
  // to CAN.glassTop, the white fibreglass roof above.
  const RN = { side: 12, corner: 6, front: 4 };
  const ringAt = (y, shrink = 0) => {
    const w = Math.max(0.003, canW(y) - shrink), zf = canF(y) - shrink, zr = CAN.zR;
    const c = Math.min(wsC(y), w * 0.7), zA = Math.max(zr + 0.05, zf - (w - c) * WS_K);
    const half = [];
    for (let i = 0; i <= RN.side; i++) half.push([w, zr + ((zA - zr) * i) / RN.side]);
    for (let i = 1; i <= RN.corner; i++) { const t = i / RN.corner; half.push([lerp(w, c, t), lerp(zA, zf, t)]); }
    for (let i = 1; i <= RN.front; i++) half.push([c * (1 - i / RN.front), zf]);
    const ring = half.concat(half.slice(0, -1).reverse().map(([x, z]) => [-x, z]));
    return ring.map(([x, z]) => [x, y, z]);
  };
  const aPostAt = (y) => { const w = canW(y), c = Math.min(wsC(y), w * 0.7); return [w, y, Math.max(CAN.zR + 0.05, canF(y) - (w - c) * WS_K)]; };
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
  // Frame: white tubes outside (the cockpit adds the inner trim). Posts:
  // either side of the centre pane, the A-posts, the door post, the rear
  // post; the sill and the roof rail.
  const frame = (pts, r = 0.026) => add('paint', tube(pts, r, Math.max(6, pts.length * 3), 10));
  const hs = (f) => Array.from({ length: 7 }, (_, j) => f(SILL + 0.01 + ((CAN.glassTop - SILL - 0.01) * j) / 6));
  const ringEdge = (y) => { const r = ringAt(y); return r.filter((_, i) => i % 2 === 0 || i === r.length - 1); };
  frame(ringEdge(SILL + 0.012), 0.024);
  frame(ringEdge(CAN.glassTop), 0.03);
  { const r = ringAt(SILL + 0.02); add('paint', tube(r.slice(RN.side, r.length - RN.side), 0.03, 32, 10)); }
  const posts = { centre: [], aPost: [], door: [], rear: [] };
  for (const sx of [1, -1]) {
    const cp = hs((y) => [sx * Math.min(wsC(y), canW(y) * 0.7), y, canF(y) + 0.004]);
    frame(cp, 0.022); posts.centre.push(cp);
    const aPost = (y) => { const p = aPostAt(y); return [sx * p[0], p[1], p[2]]; };
    const ap = hs(aPost); frame(ap, 0.028); posts.aPost.push(ap);
    const dp = hs((y) => [sx * canW(y), y, DOOR_Z]); frame(dp, 0.024); posts.door.push(dp);
    const rp = hs((y) => [sx * canW(y), y, CAN.zR + 0.03]); frame(rp, 0.028); posts.rear.push(rp);
    for (const p of [aPost(SILL + 0.012), aPost(CAN.glassTop), [sx * canW(SILL), SILL + 0.012, DOOR_Z], [sx * canW(CAN.glassTop), CAN.glassTop, DOOR_Z]]) add('paint', ball(p, 0.03));
    // Door handle (left: the pilot's door) and hinges on the roof rail.
    if (sx > 0) add('steel', rod([canW(SILL + 0.22) + 0.012, SILL + 0.22, -0.5], [canW(SILL + 0.22) + 0.012, SILL + 0.22, -0.36], 0.01, 6));
    for (const hz of [-0.15, -0.5]) add('paint', tx(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8), sx * (canW(CAN.glassTop) + 0.004), CAN.glassTop + 0.012, hz, 0, 0, Math.PI / 2), true);
  }
  // Roof vent hatch, GPS antenna dome, beacon on the roof's rear.
  add('paint', rbox(0.34, 0.05, 0.26, 0.02, 0, CAN.yt + 0.005, -0.42));
  add('dark', rbox(0.3, 0.012, 0.03, 0.004, 0, CAN.yt + 0.01, -0.28), true);
  add('dark', tx(new THREE.SphereGeometry(0.06, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, CAN.yt - 0.005, -0.78, 0, 0, 0, [1, 0.45, 1]), true);
  // Wire cutter: a blade up the windshield's centre from the hopper lid to
  // the roof front, the deflector cable from the roof to the fin top.
  {
    const base = [0, SILL + 0.03, canF(SILL) + 0.03], top = [0, CAN.yt + 0.14, canF(CAN.yt) + 0.02];
    add('dark', bar(base, top, 0.012, 0.05));
    add('steel', tx(new THREE.BoxGeometry(0.01, 0.34, 0.07), 0, CAN.yt + 0.02, canF(CAN.yt) + 0.08, -0.5));
    add('steel', rod([0, CAN.yt + 0.12, canF(CAN.yt)], [0, 2.32, -4.25], 0.005, 5));
  }
  // Windshield wiper (parked on the centre pane's lower edge, as in the
  // cockpit photos).
  const wiper = new THREE.Group();
  {
    const pivot = [0.0, CAN.glassTop - 0.02, canF(CAN.glassTop - 0.02) + 0.035];
    wiper.position.set(...pivot);
    const arm = new THREE.Mesh(tagged(rod([0, 0, 0], [0.02, -0.4, 0.13], 0.007, 6)), M.dark);
    const blade = new THREE.Mesh(tagged(tx(new THREE.BoxGeometry(0.012, 0.36, 0.012), 0.022, -0.3, 0.1, -0.3)), M.rubber);
    wiper.add(arm, blade);
    wiper.rotation.z = -0.15;
    root.add(wiper);
  }

  // ---------------- wing ----------------
  const W = TH_WING;
  const leY = (x) => thWingY(x);
  const mainProf = airfoil(0, 0.74, 0.15, 0.04, 0.4, 18), aftProf = airfoil(0.76, 1.0, 0.15, 0.04, 0.4, 6);
  const upper = (prof) => prof.slice(0, Math.ceil(prof.length / 2)), lower = (prof) => prof.slice(Math.floor(prof.length / 2));
  const flaps = [], ailerons = [];
  const wingAO = (x, xc, low) => (low ? 1 : 1 - 0.28 * Math.max(0, 1 - (x - 0.6) / 0.6));
  const surfaceMesh = (geos, x0, x1, side) => {
    const hz = W.le - 0.76 * W.chord;
    const hx = (side * (x0 + x1)) / 2;
    const pivot = new THREE.Group();
    pivot.position.set(hx, leY(hx) + 0.025, hz);
    pivot.rotation.z = side * Math.atan(DIH);
    pivot.updateMatrix();
    const deflect = new THREE.Group();
    for (const [geo, mat] of geos) {
      geo.applyMatrix4(pivot.matrix.clone().invert());
      const m = new THREE.Mesh(tagged(geo), mat);
      m.castShadow = true; m.receiveShadow = true;
      deflect.add(m);
    }
    pivot.add(deflect);
    root.add(pivot);
    return deflect;
  };
  const wingParts = { up: [], low: [], paint: [] };
  const flapEnd = 4.1;
  for (const side of [1, -1]) {
    const st = (x) => ({ x, y: leY(x), le: W.le, chord: W.chord });
    const span = [0.0, W.rootX, 1.0, 1.6, 2.6, 3.8, 4.9, 5.9, 6.6, W.tipX].map(st);
    wingParts.up.push(thWingPanel(span, upper(mainProf), side, wingAO));
    wingParts.low.push(thWingPanel(span, lower(mainProf), side, wingAO));
    wingParts.up.push(thWingPanel([st(0.0), st(W.rootX + 0.05)], aftProf, side, wingAO));
    const fl = [W.rootX + 0.06, 1.6, 2.8, flapEnd - 0.02].map(st), al = [flapEnd + 0.04, 5.2, 6.2, W.tipX - 0.02].map(st);
    flaps.push(surfaceMesh([[thWingPanel(fl, upper(aftProf), side, wingAO), M.wing], [thWingPanel(fl, lower(aftProf), side, wingAO), M.wingLow]], W.rootX + 0.06, flapEnd - 0.02, side));
    ailerons.push(surfaceMesh([[thWingPanel(al, upper(aftProf), side), M.wing], [thWingPanel(al, lower(aftProf), side), M.wingLow]], flapEnd + 0.04, W.tipX - 0.02, side));
    // Tip cap: rounded in plan, a slight upturn; red.
    const tipSt = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      tipSt.push({ x: W.tipX + 0.16 * Math.sin((t * Math.PI) / 2), y: leY(W.tipX) + 0.05 * t * t, le: W.le - 0.1 * t * t, chord: W.chord * (1 - 0.12 * t * t) });
    }
    add('red', wingPanel(tipSt, airfoil(0, 1, 0.15 * 0.85, 0.04, 0.4, 16), side));
    // Root fillet.
    const fil = mainProf.slice(0, 19).map(([xc, yc]) => { const y = W.rootY + yc * W.chord + 0.012, z = W.le - xc * W.chord; return [side * fusX(z, y), y, z]; });
    wingParts.paint.push(tube(fil, 0.06, 30, 10));
    // Nav light + strobe at the tip, landing light in the leading edge.
    const tipLE = [side * (W.tipX + 0.08), leY(W.tipX) + 0.08, W.le - 0.12];
    add(side > 0 ? 'navRed' : 'navGreen', ball(tipLE, 0.03, 10));
    add('lens', tx(new THREE.SphereGeometry(0.06, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), ...tipLE, 0, 0, side * Math.PI / 2, [1, 1, 1.4]));
    add('strobe', ball([side * (W.tipX + 0.13), leY(W.tipX) + 0.08, W.le - 0.75], 0.024, 8));
    add('lens', tx(new THREE.CircleGeometry(0.055, 18), side * 2.9, leY(2.9) + 0.02, W.le + 0.004));
    add('steel', tx(new THREE.CircleGeometry(0.042, 16), side * 2.9, leY(2.9) + 0.02, W.le - 0.002), true);
    // Walkway on the wing root; fuel filler on the integral tank.
    {
      const up = mainProf.slice(0, 19).filter(([xc]) => xc > 0.1 && xc < 0.62);
      const sheet = up.map(([xc, yc]) => [xc, yc + 0.004]).concat(up.slice().reverse().map(([xc, yc]) => [xc, yc + 0.0005]));
      add('walk', thWingPanel([0.62, 0.85, 1.05].map(st), sheet, side));
    }
    add('dark', tx(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 20), side * 2.3, leY(2.3) + 0.15, -0.35));
    add('steel', tx(new THREE.BoxGeometry(0.11, 0.012, 0.022), side * 2.3, leY(2.3) + 0.17, -0.35), true);
    for (const hx of [1.2, 2.4, 3.6, 4.7, 5.8, 6.8]) {
      add('dark', tx(new THREE.BoxGeometry(0.035, 0.08, 0.14), side * hx, leY(hx) - 0.08, W.le - 0.76 * W.chord + 0.02, 0, 0, side * Math.atan(DIH)), true);
    }
  }
  // Pitot under the left wing; stall-warning vane.
  add('steel', rod([4.5, leY(4.5) - 0.14, 0.62], [4.5, leY(4.5) - 0.14, 1.2], 0.01, 8), true);
  add('steel', rod([4.5, leY(4.5) - 0.02, 0.5], [4.5, leY(4.5) - 0.14, 0.68], 0.011, 6), true);
  add('steel', tx(new THREE.BoxGeometry(0.004, 0.035, 0.03), 2.5, leY(2.5) - 0.01, W.le + 0.02), true);
  for (const g of wingParts.up) add('wing', g);
  for (const g of wingParts.low) add('wingLow', g);
  for (const g of wingParts.paint) add('paint', g);

  // ---------------- tail ----------------
  const stabY = 0.68;
  const stabStations = [
    { x: 0.06, y: stabY, le: -4.3, chord: 1.05 }, { x: 1.6, y: stabY + 0.01, le: -4.36, chord: 0.96 },
    { x: 2.45, y: stabY + 0.015, le: -4.42, chord: 0.88 }, { x: 2.62, y: stabY + 0.016, le: -4.46, chord: 0.8 }, { x: 2.7, y: stabY + 0.017, le: -4.52, chord: 0.68 },
  ];
  const elevParts = [], elevRed = [];
  for (const side of [1, -1]) {
    add('paint', wingPanel(stabStations.slice(0, 3), airfoil(0, 0.64, 0.1, 0, 0.4, 12), side));
    add('red', wingPanel(stabStations.slice(2), airfoil(0, 0.64, 0.1, 0, 0.4, 12), side));
    elevParts.push(tagged(wingPanel(stabStations.slice(0, 3), airfoil(0.66, 1, 0.1, 0, 0.4, 4), side)));
    elevRed.push(tagged(wingPanel(stabStations.slice(2), airfoil(0.66, 1, 0.1, 0, 0.4, 4), side)));
    // Lift strut from the lower tail cone to the stabiliser, end fittings.
    const sa = [side * 1.35, stabY - 0.04, -4.75], sb = [side * 0.1, fusX(-4.45, 0.36) > 0 ? 0.36 : 0.36, -4.45];
    add('steel', rod(sa, sb, 0.018, 8));
    for (const p of [sa, sb]) add('steel', ball(p, 0.028, 8), true);
  }
  elevParts.push(tagged(tx(new THREE.BoxGeometry(0.5, 0.014, 0.1), 0.8, stabY + 0.005, -4.3 - 1.03 - 0.04)));
  const elevHingeZ = -4.3 - 0.66 * 1.05;
  const mkElev = (parts, mat) => {
    const geo = mergeGeometries(parts);
    geo.translate(0, -stabY, -elevHingeZ);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };
  const elevator = new THREE.Group();
  elevator.position.set(0, stabY, elevHingeZ);
  elevator.add(mkElev(elevParts, M.paint), mkElev(elevRed, M.red));
  root.add(elevator);
  // Fin + rudder: tall, square-topped with rounded corners (vertical
  // airfoils), livery-mapped (the THRUSH badge).
  const finSt = [[0.72, -3.5, 1.96], [1.3, -3.66, 1.76], [1.9, -3.8, 1.6], [2.2, -3.88, 1.52], [2.3, -3.96, 1.42], [2.35, -4.06, 1.3]];
  const vfin = (prof, sts) => {
    const g = wingPanel(sts.map(([h, le, c]) => ({ x: h, y: 0, le, chord: c })), prof, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getY(i), p.getX(i), p.getZ(i));
    return flipWinding(g);
  };
  add('livery', liveryUV(tagged(vfin(airfoil(0, 0.62, 0.11, 0, 0.4, 12), finSt))));
  // Dorsal fillet: rises out of the deck into the fin leading edge.
  add('livery', liveryUV(tagged(loft(sampleStations([
    K(-2.6, 0.02, 0.96, 0.94, 0.985, 2.2, 2.2), K(-2.95, 0.05, 0.93, 0.91, 1.0, 2.0, 2.2), K(-3.2, 0.07, 0.9, 0.88, 1.07, 2.0, 2.2),
    K(-3.42, 0.085, 0.88, 0.86, 1.17, 2.0, 2.2), K(-3.62, 0.09, 0.86, 0.84, 1.32, 2.0, 2.2),
  ], 20), 12, null))));
  // Rudder on a slightly slanted hinge (62 % chord), with its trim tab.
  const hb = [0, 0.72, -3.5 - 0.62 * 1.96], ht = [0, 2.35, -4.06 - 0.62 * 1.3];
  const tilt = Math.atan2(ht[2] - hb[2], ht[1] - hb[1]);
  const rudder = new THREE.Group();
  rudder.position.set(...hb);
  rudder.rotation.x = tilt;
  rudder.updateMatrix();
  const rudGeo = liveryUV(tagged(vfin(airfoil(0.64, 1, 0.11, 0, 0.4, 5), finSt)));
  const rudTab = tagged(tx(new THREE.BoxGeometry(0.014, 0.36, 0.09), 0, 1.0, -3.5 - 1.96 * 0.98 + 0.02));
  const inv = rudder.matrix.clone().invert();
  rudGeo.applyMatrix4(inv); rudTab.applyMatrix4(inv);
  const rudMesh = new THREE.Mesh(rudGeo, M.livery);
  rudMesh.castShadow = true;
  rudder.add(rudMesh, new THREE.Mesh(rudTab, M.paint));
  root.add(rudder);
  // Beacon on the fin cap, tail light, tie-down.
  add('beacon', tx(new THREE.SphereGeometry(0.042, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 2.36, -4.35));
  add('white', ball([0, 0.6, -5.32], 0.028, 10));
  add('steel', tx(new THREE.TorusGeometry(0.03, 0.008, 6, 12), 0, 0.3, -4.5, 0, Math.PI / 2), true);

  // ---------------- landing gear ----------------
  const gearCfg = Object.fromEntries(A.gear.map((g) => [g.name, g]));
  const gearGroups = {};
  const tyreProfile = (R, Wd, rim) => [
    [rim, -Wd * 0.42], [rim + 0.02, -Wd * 0.5], [R * 0.78, -Wd * 0.54], [R * 0.94, -Wd * 0.47], [R * 0.99, -Wd * 0.32],
    [R, -Wd * 0.12], [R, Wd * 0.12], [R * 0.99, Wd * 0.32], [R * 0.94, Wd * 0.47], [R * 0.78, Wd * 0.54], [rim + 0.02, Wd * 0.5], [rim, Wd * 0.42],
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
    }
    spin.add(tmesh, new THREE.Mesh(mergeGeometries(parts), M.hub));
    return spin;
  };
  for (const [name, sx] of [['mainL', 1], ['mainR', -1]]) {
    const cfg = gearCfg[name];
    const R = cfg.radius, Wd = 0.29;
    const ax = cfg.p[0], ay = cfg.p[1] + R, az = cfg.p[2];
    const g = new THREE.Group();
    // Tubular leg from the lower longeron ahead of the wing down and out to
    // the axle, with a drag brace from the front spar; both scale with the
    // spring travel (the leg group is stretched from its top).
    const attachY = -0.42, attachZ = 1.3;
    const leg = new THREE.Group();
    leg.position.y = attachY;
    const L = (p) => [p[0], p[1] - attachY, p[2]];
    const axIn = ax - sx * 0.18;
    const top = [sx * (fusX(attachZ, attachY) - 0.02), attachY, attachZ];
    const brace = [sx * (fusX(0.7, attachY - 0.02) - 0.02), attachY - 0.02, 0.62];
    const legParts = [
      tagged(rod(L(top), L([axIn, ay + 0.06, az + 0.02]), 0.045, 12)),
      tagged(rod(L(brace), L([axIn, ay + 0.12, az - 0.02]), 0.032, 10)),
      tagged(tx(new RoundedBoxGeometry(0.11, 0.16, 0.16, 2, 0.03), ...L([axIn, ay + 0.05, az]))),
      tagged(rod(L([axIn, ay, az]), L([ax - sx * 0.02, ay, az]), 0.036, 12)),
    ];
    const legMesh = new THREE.Mesh(mergeGeometries(legParts), M.grey);
    legMesh.castShadow = true; legMesh.receiveShadow = true;
    const brakeLine = new THREE.Mesh(tagged(tube([L([top[0], attachY - 0.03, attachZ - 0.04]), L([(top[0] + axIn) / 2, (attachY + ay) / 2, (attachZ + az) / 2 - 0.05]), L([axIn - sx * 0.02, ay + 0.1, az - 0.06])], 0.008, 16, 6)), M.rubber);
    leg.add(legMesh, brakeLine);
    g.add(leg);
    // Fittings where the tubes meet the fuselage.
    for (const p of [top, brace]) add('steel', tx(new RoundedBoxGeometry(0.08, 0.06, 0.1, 2, 0.015), ...p));
    const wheel = new THREE.Group();
    wheel.position.set(ax, ay, az);
    const spinPart = makeWheel(R, Wd, 0.16, sx, true);
    const brake = new THREE.Mesh(tagged(tx(new THREE.CylinderGeometry(0.14, 0.14, 0.014, 26), -sx * 0.12, 0, 0, 0, 0, Math.PI / 2)), M.steel);
    const caliper = new THREE.Mesh(tagged(new RoundedBoxGeometry(0.06, 0.09, 0.1, 2, 0.014).translate(-sx * 0.12, 0.1, -0.05)), M.dark);
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
    // Long spring leaf from the tail cone's bottom down and aft to the
    // steering head.
    add('dark', bar([0, 0.3, -4.55], [0, fy + 0.03, fz], 0.07, 0.02));
    add('dark', tx(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 12), 0, fy + 0.04, fz));
    const fork = new THREE.Group();
    fork.position.set(0, fy, fz);
    const forkGeo = mergeGeometries([
      tagged(tx(new THREE.BoxGeometry(0.014, 0.17, 0.06), 0.065, -0.05, -0.07, 0.6)), tagged(tx(new THREE.BoxGeometry(0.014, 0.17, 0.06), -0.065, -0.05, -0.07, 0.6)),
      tagged(tx(new THREE.BoxGeometry(0.14, 0.024, 0.06), 0, 0.025, -0.01)),
      tagged(rod([-0.08, 0.035, 0.05], [0.08, 0.035, 0.05], 0.009, 6)),
    ]);
    fork.add(new THREE.Mesh(forkGeo, M.steel));
    const wheel = new THREE.Group();
    wheel.position.set(0, -0.1, -0.12);
    wheel.add(makeWheel(R, 0.1, 0.075, 1, false));
    fork.add(wheel);
    g.add(fork);
    root.add(g);
    for (const sx of [1, -1]) add('steel', rod([sx * 0.08, fy + 0.035, fz + 0.05], [sx * 0.07, 0.42, -4.75], 0.005, 5), true);
    gearGroups.tail = { group: g, wheel, spin: wheel.children[0], fork, rest: wheel.position.clone(), sx: 0 };
  }

  // ---------------- spray system ----------------
  // Booms just aft of the trailing edge, below the flaps' trailing edge at
  // full deflection, on hangers from the fixed wing ahead of the flap hinge.
  const nozzles = [];
  const hingeZ = W.le - 0.76 * W.chord;
  const boomZ = W.le - W.chord - 0.05, boomDrop = 0.3;
  for (const side of [1, -1]) {
    const x0 = 0.8, x1 = 6.5;
    const a = [side * x0, leY(x0) - boomDrop, boomZ], b = [side * x1, leY(x1) - boomDrop, boomZ];
    add('alu', rod(a, b, 0.03, 12));
    add('alu', ball(b, 0.036, 10));
    add('brass', tx(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 8), b[0] + side * 0.035, b[1], b[2], 0, 0, Math.PI / 2), true);
    for (const hx of [1.3, 2.5, 3.7, 4.9, 6.0]) {
      const top = [side * hx, leY(hx) - 0.04, hingeZ + 0.16], bot = [side * hx, leY(hx) - boomDrop, boomZ];
      add('alu', tx(rbox(0.018, 0.001 + Math.hypot(top[1] - bot[1], top[2] - bot[2]), 0.07, 0.008, 0, 0, 0), side * hx, (top[1] + bot[1]) / 2, (top[2] + bot[2]) / 2, Math.atan2(top[2] - bot[2], top[1] - bot[1])));
      add('dark', tx(new THREE.CylinderGeometry(0.036, 0.036, 0.035, 10), side * hx, leY(hx) - boomDrop, boomZ, 0, 0, Math.PI / 2), true);
    }
    const N = 24;
    for (let k = 0; k < N; k++) {
      const x = x0 + 0.1 + ((x1 - x0 - 0.2) * k) / (N - 1);
      const y = leY(x) - boomDrop;
      add('alu', rod([side * x, y, boomZ], [side * x, y - 0.07, boomZ - 0.02], 0.008, 6), true);
      add('dark', tx(new THREE.CylinderGeometry(0.019, 0.016, 0.05, 10), side * x, y - 0.1, boomZ - 0.03, 0.3), true);
      add('brass', tx(new THREE.ConeGeometry(0.011, 0.028, 8), side * x, y - 0.136, boomZ - 0.042, Math.PI + 0.3), true);
      nozzles.push(new THREE.Vector3(side * x, y - 0.14, boomZ - 0.042));
    }
  }
  add('alu', rod([0.8, leY(0.8) - boomDrop, boomZ], [-0.8, leY(0.8) - boomDrop, boomZ], 0.042, 12));
  add('alu', tube([[0, -0.66, 0.75], [0, -0.66, 0.1], [0, -0.7, -0.9], [0, leY(0.8) - boomDrop, boomZ]], 0.042, 24, 10));
  add('alu', ball([0, leY(0.8) - boomDrop, boomZ], 0.06, 12));
  // Fan-driven pump under the belly between the gear legs.
  const pump = new THREE.Group();
  pump.position.set(0, -0.72, 0.65);
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
  add('steel', rod([0, -0.52, 0.65], [0, -0.62, 0.65], 0.03, 10));

  // ---------------- propeller (Hartzell, 4 blades, feathering) ----------------
  const R = A.propRadius;
  const prop = new THREE.Group();
  prop.position.set(0, THRUST_Y, PROP_Z);
  prop.add(spinnerMesh);
  const blades = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.55, metalness: 0.25, transparent: true });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.5, transparent: true });
  const bodyGeo = bladeLoft(0.2, R - 0.09, 16, R), tipGeo = bladeLoft(R - 0.09, R, 4, R);
  const pitchGroups = [];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Group();
    b.rotation.z = (i * Math.PI) / 2;
    const pg = new THREE.Group();
    const bm = new THREE.Mesh(bodyGeo, bladeMat);
    bm.castShadow = true;
    pg.add(bm, new THREE.Mesh(tipGeo, tipMat));
    pg.add(new THREE.Mesh(tagged(rod([0.12, 0, 0], [0.25, 0, 0], 0.042, 12)), M.polished));
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

  // ---------------- cockpit + pilot ----------------
  const ck = buildThrushCockpit({ M, panel, posts, ringSurface, ringAt, roofYs, envMap: opts.envMap ?? null });
  root.add(ck.cockpit);
  const pilot = buildPilot(M, ck.stick, ck.throttle, { throttleAt: ck.THR });
  pilot.position.set(...COCKPIT_OFF);
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

  // Prop blade angle (feathered when stopped on the ground, out of feather
  // in the start, fine at idle, coarser as the governor absorbs power,
  // beta on the ground at idle); lights while the engine runs; cockpit.
  let bladeAngle = 1.3, t = 0;
  const FEATHER = 1.3;
  const update = (dt, fm, ac) => {
    t += dt;
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
    ck.update?.(dt, fm, ac);
  };

  return {
    root, M,
    prop, blades, bladeMats: [bladeMat, tipMat], disc,
    ailerons, flaps, elevator, rudder, wiper,
    gear: gearGroups,
    stick: ck.stick, pedals: ck.pedals, throttle: ck.throttle, valve: ck.valve, leds: ck.leds, panelMesh: ck.panelMesh,
    pumpFan, nozzles, pilot, cockpit: ck.cockpit, glassMesh,
    eye: new THREE.Vector3(...EYE),
    fuelFiller: new THREE.Vector3(2.3, thWingY(2.3) + 0.16, -0.35),
    hopperPort: new THREE.Vector3(fusX(-1.6, -0.12) + 0.1, -0.12, -1.6),
    update,
  };
}
