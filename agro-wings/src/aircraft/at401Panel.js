// Air Tractor AT-401B instrument panel — layout and textures for the cockpit
// (at401Cockpit.js). The layout follows the photographs of real AT-401B
// panels (a black panel arched to the windshield's base; a raised housing
// on top at the centre with three engine dials; the big dials along the
// arch under it, the engine gauges stepping down the arch on the left and
// the flight instruments on the right; a row of push-button annunciators
// under the centre dial; the agricultural GPS screen low in the centre; a
// big white gauge low on the right; switch panels along the bottom) and
// the reference package's 2D panel only for the list of instruments (turn
// coordinator at the centre, tachometer, oil P/T, fuel, ASI, altimeter,
// VSI) — none of its bitmaps or gauges is used.
// Every needle reads Aircraft.instruments(): ias, altFt, vsFpm, yawRate /
// slip (turn coordinator), rpm, mp, fuelFlow, oilP, oilT, cht, fuel,
// hopper, flow (spray), hdg (compass), engine state, stall, brake, flaps.
// Nothing the simulator does not compute is shown (no ammeter / voltmeter
// readings). The ag GPS is the game's own (agroNav.js).
// Dial faces are drawn once into an atlas (1536 × 1152: twelve 384 px
// cells); needles and the compass card are 3D; the hour meter is redrawn
// only when its tenth changes.
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp, rng } from '../core/math.js';
import { text, scale, radial } from './r44Panel.js';
import { createAgroNav } from './agroNav.js';
import { BASE } from '../world/layout.js';

const D2R = Math.PI / 180;
const INK = '#f1f0ea', DIM = '#c4c4bc', GREEN = '#22a94a', YELLOW = '#f1c21b', RED = '#df2a1c', WHITE = '#f4f4f0', BLUE = '#3d7fd8';

// ---------------------------------------------------------------- layout
// Panel-local metres: u to the pilot's right, v up the face; origin = the
// face's centre (AT401_CK.panel.c). The arch (the face's top edge) is built
// from the cabin's own section in at401Cockpit.js; vTop is its height at
// the centre, the hump rises above it.
export const AT401_PANEL = {
  halfW: 0.5,
  bottom: -0.3,
  depth: 0.06,
  hump: { half: 0.145, top: 0.455, r: 0.03 },
  dials: {
    // Hump: manifold pressure, tachometer, fuel flow.
    mp: { u: -0.093, v: 0.397, f: 0.035, cell: 5 },
    rpm: { u: 0, v: 0.397, f: 0.035, cell: 4 },
    ff: { u: 0.093, v: 0.397, f: 0.035, cell: 6 },
    // Along the arch: turn coordinator at the centre, the flight
    // instruments to the right, the engine gauges stepping down to the left.
    turn: { u: 0, v: 0.285, f: 0.043, cell: 3 },
    asi: { u: 0.113, v: 0.278, f: 0.04, cell: 0 },
    alt: { u: 0.222, v: 0.248, f: 0.04, cell: 1 },
    vsi: { u: 0.318, v: 0.19, f: 0.034, cell: 2 },
    oil: { u: -0.111, v: 0.279, f: 0.034, cell: 7 },
    cht: { u: -0.206, v: 0.252, f: 0.032, cell: 8 },
    fuel: { u: -0.293, v: 0.2, f: 0.032, cell: 9 },
    hopper: { u: -0.366, v: 0.126, f: 0.03, cell: 11 },
    // Low on the right: the big white spray-flow gauge.
    spray: { u: 0.318, v: 0.03, f: 0.047, cell: 10 },
  },
  annun: { u0: -0.0625, du: 0.025, v: 0.208, n: 6 },
  gps: { u: 0, v: 0.04, w: 0.2, h: 0.15, d: 0.07, screen: { w: 0.15, h: 0.1 }, keysV: -0.057, keysU: [-0.054, -0.018, 0.018, 0.054] },
  hobbs: { u: 0.17, v: 0.12, w: 0.066, h: 0.026 },
  key: { u: -0.205, v: 0.115 },
  lamps: [{ u: -0.38, v: 0.04, id: 'fuel' }, { u: -0.315, v: 0.04, id: 'oil' }],
  guard: { u: -0.255, v: 0.045 }, // red guarded switch (boost pump)
  switchesL: { u0: -0.43, u1: -0.14, v: -0.2, n: 8 },
  switchesR: { u0: 0.14, u1: 0.43, v: -0.2, n: 8 },
  breakersL: { u0: -0.43, u1: -0.14, v: -0.25, n: 9 },
  breakersR: { u0: 0.14, u1: 0.43, v: -0.25, n: 9 },
  plates: [{ u: -0.285, v: -0.225, w: 0.33, h: 0.115 }, { u: 0.285, v: -0.225, w: 0.33, h: 0.115 }],
};
export const AT401_ANNUN = [
  { id: 'fuel', label: 'FUEL\nLOW', col: '#f0a01c' },
  { id: 'oil', label: 'OIL\nPRESS', col: '#e8322a' },
  { id: 'start', label: 'START', col: '#f0a01c' },
  { id: 'stall', label: 'STALL', col: '#e8322a' },
  { id: 'brake', label: 'PARK\nBRAKE', col: '#f0a01c' },
  { id: 'spray', label: 'SPRAY', col: '#39d05a' },
];

// Dial angles (radians, clockwise from twelve o'clock as the pilot sees them).
export const AT401_ANG = {
  asi: (kt) => (-160 + ((clamp(kt, 30, 180) - 30) / 150) * 320) * D2R,
  alt100: (ft) => ((((ft % 1000) + 1000) % 1000) / 1000) * Math.PI * 2,
  alt1000: (ft) => ((((ft % 10000) + 10000) % 10000) / 10000) * Math.PI * 2,
  vsi: (fpm) => (-90 + (clamp(fpm, -2000, 2000) / 2000) * 170) * D2R, // 0 at nine o'clock
  rpm: (rpm) => (-135 + (clamp(rpm, 0, 3000) / 3000) * 270) * D2R,
  mp: (inHg) => (-135 + ((clamp(inHg, 10, 40) - 10) / 30) * 270) * D2R,
  ff: (lh) => (-120 + (clamp(lh, 0, 300) / 300) * 240) * D2R,
  oilP: (psi) => (-150 + (clamp(psi, 0, 120) / 120) * 120) * D2R,
  oilT: (c) => (150 - (clamp(c, 0, 120) / 120) * 120) * D2R,
  cht: (c) => (-120 + (clamp(c, 0, 300) / 300) * 240) * D2R,
  fuel: (l) => (-120 + (clamp(l, 0, 477) / 477) * 240) * D2R,
  hopper: (l) => (-120 + (clamp(l, 0, 1514) / 1514) * 240) * D2R,
  spray: (lmin) => (-135 + (clamp(lmin, 0, 500) / 500) * 270) * D2R,
  // Turn coordinator: the little airplane banks 20° at a standard-rate turn
  // (3 °/s); the ball's offset (rad on its arc) from the sideslip.
  turn: (yawRate) => clamp((yawRate / (3 * D2R)) * 20, -38, 38) * D2R,
  ball: (slip) => clamp(slip * 2.2, -0.42, 0.42),
};
// Atlas: drawn in 512 px design units, stored at 384 px per cell.
export const AT401_ATLAS = { W: 1536, H: 1152, cols: 4, rows: 3, k: 0.75 };
const canvasAng = (a) => a - Math.PI / 2;

function arc(g, x, y, r, ang, v0, v1, col, w, rr = 0.93) {
  const a0 = ang(v0), a1 = ang(v1);
  g.strokeStyle = col; g.lineWidth = r * w;
  g.beginPath(); g.arc(x, y, r * rr, Math.min(a0, a1), Math.max(a0, a1)); g.stroke();
}
function faceBase(g, x, y, r, light = false) {
  const gr = g.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.1, x, y, r);
  if (light) { gr.addColorStop(0, '#fbfbf6'); gr.addColorStop(1, '#d9d9d0'); } else { gr.addColorStop(0, '#1d2023'); gr.addColorStop(1, '#08090a'); }
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}
function screwHead(g, x, y, r) {
  g.fillStyle = '#2b2d30'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#0a0a0a'; g.lineWidth = r * 0.3; g.beginPath(); g.moveTo(x - r * 0.7, y); g.lineTo(x + r * 0.7, y); g.stroke();
}

function drawDials(V) {
  const A = AT401_ATLAS, c = canvas(A.W, A.H), g = c.getContext('2d');
  g.setTransform(A.k, 0, 0, A.k, 0, 0);
  g.fillStyle = '#060707'; g.fillRect(0, 0, 2048, 1536);
  const cell = (i) => ({ x: (i % 4) * 512 + 256, y: Math.floor(i / 4) * 512 + 256, r: 250 });
  const AN = AT401_ANG;
  const T = (t, x, y, s, col = INK, bold = true) => text(g, t, x, y, s, col, bold);
  // 0 — airspeed, knots and mph (white flap arc, green, yellow, red line).
  {
    const { x, y, r } = cell(0);
    faceBase(g, x, y, r);
    const ang = (kt) => canvasAng(AN.asi(kt)), vno = V.vne * 0.8;
    arc(g, x, y, r, ang, V.vs0, V.vfe, WHITE, 0.05, 0.83);
    arc(g, x, y, r, ang, V.vs1, vno, GREEN, 0.06, 0.885);
    arc(g, x, y, r, ang, vno, V.vne, YELLOW, 0.06, 0.885);
    radial(g, x, y, r, ang(V.vne), RED, 0.05);
    scale(g, x, y, r, ang, 30, 180, 5, 20, { numR: 0.66, size: 0.16, skip: (v) => v < 40 && v % 10 !== 0, num: (v) => (v % 20 === 0 && v >= 40 ? String(v) : null) });
    for (let mph = 60; mph <= 200; mph += 20) {
      const a = ang(mph / 1.15078);
      g.strokeStyle = '#d0d0c6'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42); g.lineTo(x + Math.cos(a) * r * 0.48, y + Math.sin(a) * r * 0.48); g.stroke();
      if (mph % 40 === 0) T(String(mph), x + Math.cos(a) * r * 0.33, y + Math.sin(a) * r * 0.33, 18, DIM, false);
    }
    T('AIRSPEED', x, y - r * 0.16, 24); T('KNOTS', x, y + r * 0.14, 20, DIM, false); T('MPH', x, y + r * 0.26, 15, DIM, false);
  }
  // 1 — altimeter, feet; Kollsman window in in.Hg.
  {
    const { x, y, r } = cell(1);
    faceBase(g, x, y, r);
    for (let i = 0; i < 50; i++) {
      const a = canvasAng((i / 50) * Math.PI * 2), maj = i % 5 === 0;
      g.strokeStyle = INK; g.lineWidth = maj ? r * 0.045 : r * 0.022;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * (maj ? 0.8 : 0.87), y + Math.sin(a) * r * (maj ? 0.8 : 0.87)); g.lineTo(x + Math.cos(a) * r * 0.97, y + Math.sin(a) * r * 0.97); g.stroke();
      if (maj) T(String(i / 5), x + Math.cos(a) * r * 0.64, y + Math.sin(a) * r * 0.64, 46);
    }
    T('ALT', x, y - r * 0.3, 24, DIM, false); T('FEET', x, y - r * 0.18, 16, DIM, false);
    g.fillStyle = '#000'; g.fillRect(x + r * 0.2, y - r * 0.065, r * 0.38, r * 0.13);
    T('29.92', x + r * 0.39, y + r * 0.002, 19, WHITE, false);
  }
  // 2 — vertical speed, ×100 ft/min, zero at nine o'clock.
  {
    const { x, y, r } = cell(2);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(AN.vsi(v * 100));
    scale(g, x, y, r, ang, -20, 20, 1, 5, { numR: 0.66, size: 0.19, num: (v) => String(Math.abs(v)) });
    T('UP', x - r * 0.45, y - r * 0.32, 20, DIM, false); T('DOWN', x - r * 0.42, y + r * 0.34, 20, DIM, false);
    T('VERTICAL SPEED', x + r * 0.12, y - r * 0.12, 19); T('100 FT PER MIN', x + r * 0.12, y + r * 0.1, 15, DIM, false);
  }
  // 3 — turn coordinator: the standard-rate marks, the inclinometer tube
  // (the ball is 3D).
  {
    const { x, y, r } = cell(3);
    faceBase(g, x, y, r);
    for (const s of [-1, 1]) for (const deg of [0, 20]) {
      const a = canvasAng(Math.PI / 2 * s + s * deg * D2R);
      g.strokeStyle = WHITE; g.lineWidth = r * 0.05;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72); g.lineTo(x + Math.cos(a) * r * 0.94, y + Math.sin(a) * r * 0.94); g.stroke();
    }
    T('L', x - r * 0.72, y + r * 0.4, 30); T('R', x + r * 0.72, y + r * 0.4, 30);
    T('TURN COORDINATOR', x, y - r * 0.55, 20, DIM, false);
    T('2 MIN', x, y + r * 0.26, 20, DIM, false);
    T('NO PITCH\nINFORMATION', x, y + r * 0.78, 13, DIM, false);
    // Inclinometer tube: a curved glass channel low on the face.
    g.strokeStyle = '#3a3f44'; g.lineWidth = r * 0.17; g.lineCap = 'round';
    g.beginPath(); g.arc(x, y - r * 0.75, r * 1.25, Math.PI / 2 - 0.42, Math.PI / 2 + 0.42); g.stroke();
    g.strokeStyle = '#c8ccc6'; g.lineWidth = r * 0.12;
    g.beginPath(); g.arc(x, y - r * 0.75, r * 1.25, Math.PI / 2 - 0.4, Math.PI / 2 + 0.4); g.stroke();
    g.lineCap = 'butt';
    for (const s of [-1, 1]) { const a = Math.PI / 2 + s * 0.075; g.strokeStyle = '#111'; g.lineWidth = 4; g.beginPath(); g.moveTo(x + Math.cos(a) * r * 1.17 , y - r * 0.75 + Math.sin(a) * r * 1.17); g.lineTo(x + Math.cos(a) * r * 1.33, y - r * 0.75 + Math.sin(a) * r * 1.33); g.stroke(); }
  }
  // 4 — tachometer (R-1340: green 1,600–2,200, red line 2,250), ×100 rpm.
  {
    const { x, y, r } = cell(4);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(AN.rpm(v * 100));
    arc(g, x, y, r, ang, 16, 22, GREEN, 0.075, 0.9);
    radial(g, x, y, r, ang(22.5), RED, 0.07);
    scale(g, x, y, r, ang, 0, 30, 1, 5, { numR: 0.66, size: 0.2 });
    T('RPM', x, y - r * 0.3, 28); T('X 100', x, y - r * 0.16, 17, DIM, false);
    g.fillStyle = '#000'; g.fillRect(x - r * 0.24, y + r * 0.3, r * 0.48, r * 0.14);
    T('2 7 8 6 4', x, y + r * 0.37, 18, WHITE, false);
  }
  // 5 — manifold pressure, in.Hg (green 18–32, red line 36: the take-off).
  {
    const { x, y, r } = cell(5);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(AN.mp(v));
    arc(g, x, y, r, ang, 18, 32, GREEN, 0.075, 0.9);
    radial(g, x, y, r, ang(36), RED, 0.07);
    scale(g, x, y, r, ang, 10, 40, 1, 5, { numR: 0.66, size: 0.19 });
    T('MANIFOLD', x, y + r * 0.27, 22); T('PRESSURE', x, y + r * 0.41, 22); T('IN. HG', x, y - r * 0.25, 18, DIM, false);
  }
  // 6 — fuel flow, litres per hour.
  {
    const { x, y, r } = cell(6);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(AN.ff(v));
    arc(g, x, y, r, ang, 120, 230, GREEN, 0.075, 0.9);
    scale(g, x, y, r, ang, 0, 300, 10, 50, { numR: 0.66, size: 0.18 });
    T('FUEL FLOW', x, y + r * 0.3, 22); T('L / H', x, y + r * 0.45, 17, DIM, false);
  }
  // 7 — oil: pressure (left, psi, green 70–90) and temperature (right, °C,
  // green 40–85, red line 95).
  {
    const { x, y, r } = cell(7);
    faceBase(g, x, y, r);
    const angP = (v) => canvasAng(AN.oilP(v)), angT = (v) => canvasAng(AN.oilT(v));
    arc(g, x, y, r, angP, 60, 90, GREEN, 0.075, 0.9);
    radial(g, x, y, r, angP(100), RED, 0.05);
    scale(g, x, y, r, angP, 0, 120, 10, 40, { numR: 0.68, size: 0.15 });
    arc(g, x, y, r, angT, 40, 85, GREEN, 0.075, 0.9);
    radial(g, x, y, r, angT(95), RED, 0.05);
    scale(g, x, y, r, angT, 0, 120, 10, 40, { numR: 0.68, size: 0.15 });
    T('OIL', x, y - r * 0.32, 26); T('PSI', x - r * 0.3, y + r * 0.06, 18, DIM, false); T('°C', x + r * 0.3, y + r * 0.06, 18, DIM, false);
  }
  // 8 — cylinder-head temperature, °C (green 120–232, red line 260).
  {
    const { x, y, r } = cell(8);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(AN.cht(v));
    arc(g, x, y, r, ang, 120, 232, GREEN, 0.075, 0.9);
    radial(g, x, y, r, ang(260), RED, 0.06);
    scale(g, x, y, r, ang, 0, 300, 25, 100, { numR: 0.66, size: 0.18 });
    T('CYL HEAD', x, y + r * 0.28, 24); T('TEMP °C', x, y + r * 0.44, 18, DIM, false);
  }
  // 9 — fuel, litres of the wing tanks (477 L).
  {
    const { x, y, r } = cell(9);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(AN.fuel(v));
    arc(g, x, y, r, ang, 0, 50, RED, 0.08, 0.88);
    scale(g, x, y, r, ang, 0, 477, 477 / 8, 477 / 4, { numR: 0.64, size: 0.2, num: (v) => (v < 1 ? 'E' : v > 476 ? 'F' : Math.abs(v - 238.5) < 1 ? '½' : null) });
    T('FUEL', x, y + r * 0.28, 28); T('LITROS', x, y + r * 0.45, 16, DIM, false);
  }
  // 10 — spray flow (white face, the big gauge low on the right), L/min.
  {
    const { x, y, r } = cell(10);
    faceBase(g, x, y, r, true);
    const ang = (v) => canvasAng(AN.spray(v));
    g.save(); g.strokeStyle = '#1a1a1a'; g.fillStyle = '#1a1a1a';
    for (let v = 0; v <= 500; v += 10) {
      const a = ang(v), maj = v % 50 === 0;
      g.lineWidth = maj ? r * 0.04 : r * 0.02;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * (maj ? 0.8 : 0.88), y + Math.sin(a) * r * (maj ? 0.8 : 0.88)); g.lineTo(x + Math.cos(a) * r * 0.97, y + Math.sin(a) * r * 0.97); g.stroke();
      if (v % 100 === 0) text(g, String(v), x + Math.cos(a) * r * 0.65, y + Math.sin(a) * r * 0.65, 40, '#1a1a1a', true);
    }
    g.restore();
    arc(g, x, y, r, ang, 250, 400, BLUE, 0.06, 0.92);
    text(g, 'SPRAY', x, y + r * 0.28, 30, '#1a1a1a', true); text(g, 'L / MIN', x, y + r * 0.44, 20, '#3a3a3a', true);
    screwHead(g, x, y - r * 0.82, 10);
  }
  // 11 — hopper quantity, litres (1,514 L).
  {
    const { x, y, r } = cell(11);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(AN.hopper(v));
    scale(g, x, y, r, ang, 0, 1500, 100, 500, { numR: 0.64, size: 0.19 });
    T('HOPPER', x, y + r * 0.3, 25); T('LITROS', x, y + r * 0.45, 16, DIM, false);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

// Annunciator caps (six cells across a strip, lit and unlit drawn by the
// emissive material — the legend is the same).
function drawAnnun() {
  const c = canvas(768, 128), g = c.getContext('2d');
  AT401_ANNUN.forEach((a, i) => {
    const x = i * 128;
    g.fillStyle = '#1a1a1a'; g.fillRect(x, 0, 128, 128);
    g.fillStyle = a.col; g.globalAlpha = 0.55; g.fillRect(x + 8, 8, 112, 112); g.globalAlpha = 1;
    text(g, a.label, x + 64, 64, 26, '#111', true);
  });
  return c;
}

function drawGpsBezel() {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#1b1d20'; g.fillRect(0, 0, 256, 256);
  const r = rng(29);
  for (let i = 0; i < 1500; i++) { const v = r() < 0.5 ? 48 : 16; g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(r() * 256, r() * 256, 2, 2); }
  text(g, 'AGROWINGS', 104, 14, 14, '#7fd6ff'); text(g, 'NAV', 164, 14, 14, '#e8eef2');
  return c;
}
// Compass card: the band round the cylinder (N … 33), 0° at u = 0.
function drawCompassCard() {
  const c = canvas(512, 64), g = c.getContext('2d');
  g.fillStyle = '#0d0e0f'; g.fillRect(0, 0, 512, 64);
  for (let d = 0; d < 360; d += 5) {
    const x = (d / 360) * 512, maj = d % 30 === 0;
    g.fillStyle = '#ececE4'; g.fillRect(x - 1, 0, 2, maj ? 18 : d % 10 === 0 ? 12 : 7);
    if (maj) {
      const lab = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] ?? String(d / 10);
      text(g, lab, x, 40, lab.length === 1 && 'NESW'.includes(lab) ? 26 : 20, '#ececE4', true);
      if (d === 0) text(g, 'N', 512, 40, 26, '#ececE4', true);
    }
  }
  return c;
}
// Placards: one strip of small plates, one per row.
export const AT401_PLACARDS = {
  W: 512, H: 640,
  rows: [
    { lines: ['MASTER  ALT  BCN  NAV  STRB  LDG  TAXI  CABIN'], dark: true },
    { lines: ['BOOST PUMP  ·  PRIMER  ·  AVIONICS  ·  GPS'], dark: true },
    { lines: ['AVGAS 100 / 100LL'], dark: true },
    { lines: ['THIS AIRPLANE MUST BE OPERATED', 'IN THE RESTRICTED CATEGORY'], dark: true },
    { lines: ['THR   PROP   MIX'], light: true },
    { lines: ['FLAPS  0 · 10 · 20 · 30'], light: true },
    { lines: ['SPRAY  ON / OFF'], dark: true },
    { lines: ['MAGNETOS  OFF L R BOTH START'], dark: true },
    { lines: ['VNE 150 KT  ·  VA 115 KT'], dark: true },
    { lines: ['CIRCUIT BREAKERS'], dark: true },
  ],
};
function drawPlacards() {
  const P = AT401_PLACARDS, c = canvas(P.W, P.H), g = c.getContext('2d');
  const h = P.H / P.rows.length;
  P.rows.forEach(({ lines, dark }, i) => {
    g.fillStyle = dark ? '#0f1011' : '#c9cbc6'; g.fillRect(0, i * h, P.W, h);
    g.strokeStyle = dark ? '#cfcfc6' : '#55585a'; g.lineWidth = 2; g.strokeRect(3, i * h + 3, P.W - 6, h - 6);
    lines.forEach((t, k) => text(g, t, P.W / 2, i * h + h * ((k + 1) / (lines.length + 1)), lines.length > 1 ? 15 : 18, dark ? '#ecece4' : '#1a1b1c', true));
  });
  return c;
}

export function createAT401Panel({ reg = 'PR-ATR' } = {}) {
  let dialC = drawDials({ vs0: 55, vs1: 68, vfe: 100, vne: 150 });
  const dials = canvasTexture(dialC, { aniso: 8 });
  const bezel = canvasTexture(drawGpsBezel(), { aniso: 4 });
  const placards = canvasTexture(drawPlacards(), { aniso: 4 });
  const annun = canvasTexture(drawAnnun(), { aniso: 4 });
  const compass = canvasTexture(drawCompassCard(), { aniso: 4 });
  const mk = (w, h) => { const c = canvas(w, h); return { c, g: c.getContext('2d'), tex: canvasTexture(c, { aniso: 4 }), key: '' }; };
  const hobbs = mk(192, 80);
  const gps = createAgroNav({ home: { x: BASE.pad.x, z: BASE.pad.z, name: 'BASE · PÁTIO', label: 'PÁTIO DA BASE (SEM CONTRATO)' } });
  const redraw = (s, key, fn) => { if (key === s.key) return; s.key = key; fn(s.g); s.tex.needsUpdate = true; };
  let lastNow = performance.now(), hours = 6412.7, vKey = '';
  const api = {
    dials, bezel, placards, annun, compass, hobbs, gps,
    texture: null, // (no flat panel texture: the instruments are 3D)
    last: null,
    lit: {},
    reg,
    get page() { return gps.page; },
    setPage: gps.setPage,
    nextPage: gps.nextPage,
    draw(d) {
      const now = performance.now(), dt = Math.min(0.5, (now - lastNow) / 1000);
      lastNow = now;
      api.last = d;
      const run = d.engine === 'running', master = d.engine !== 'off';
      const vk = [d.vs0, d.vs1, d.vfe, d.vne].join();
      if (d.vne && vk !== vKey) { vKey = vk; const nc = drawDials(d); dialC.getContext('2d').drawImage(nc, 0, 0); nc.width = nc.height = 1; dials.needsUpdate = true; }
      api.lit = master ? {
        fuel: d.fuel < d.fuelCap * 0.12,
        oil: (d.oilP ?? 0) < 25,
        start: d.engine === 'cranking',
        stall: (d.stall ?? 0) > 0.3,
        brake: !!d.brake,
        spray: !!d.spray,
      } : {};
      if (run) hours += dt / 3600;
      // Hour meter (the yellow-backlit LCD of the photographs).
      redraw(hobbs, master ? (hours * 10).toFixed(0) : 'off', (g) => {
        g.fillStyle = '#111214'; g.fillRect(0, 0, 192, 80);
        g.fillStyle = master ? '#d9c34a' : '#4a4630'; g.fillRect(10, 12, 172, 56);
        if (master) text(g, (hours % 100000).toFixed(1), 96, 41, 36, '#1d1a08', true);
      });
      gps.draw(d, dt, master);
    },
    setReg(r) { api.reg = r; },
  };
  return api;
}
