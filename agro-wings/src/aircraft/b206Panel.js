// Bell 206B-3 JetRanger III panel faces (canvas), after the photographed
// classic analog panel: light-grey face plate inside a black housing, the
// caution/warning row in the black top band, five columns of instruments
// for the Rolls-Royce (Allison) 250-C20J — ENG OIL, TORQUE, AIRSPEED,
// ATTITUDE, ALTIMETER on top; the digital clock, XMSN OIL, TURB OUT TEMP,
// the dual tachometer (rotor / power turbine), the directional gyro and the
// VSI; FUEL QTY, GAS PRODUCER (N1), two blanked optional positions and the
// turn coordinator; LOAD and FUEL PRESS at the bottom, the guarded FUEL
// VALVE switch at the bottom right. Dial faces are drawn once; the needles,
// the attitude ball, the heading card and the turn symbol are 3D
// (b206Cockpit.js). Redrawn only when what they show changes: the caution
// row (on a state change), the clock (once a second) and the AGROWINGS NAV
// screen (its own rate, only when its content key changes).
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp } from '../core/math.js';
import { roundRect } from './panel.js';
import { BASE } from '../world/layout.js';
import { createAgroNav, NAV, NAV_PAGES } from './agroNav.js';
import { speckle, screw, text, scale, arc, radial, drawTcPlane, drawAttTape, drawAttOverlay, drawCard, drawCardOverlay, drawGlass } from './r44Panel.js';

const D2R = Math.PI / 180;
const INK = '#eeede6', DIM = '#a6a8a3', GREEN = '#25b34a', YELLOW = '#f1c21b', RED = '#e0261c';

// Face plate (metres, panel frame: x right as the pilot sees it, y up).
export const B6_FACE = { x0: -0.29, x1: 0.29, y0: -0.135, y1: 0.165, W: 1160, H: 600 };
B6_FACE.s = (B6_FACE.x1 - B6_FACE.x0) / B6_FACE.W; // m per px
const px = (x) => (x - B6_FACE.x0) / B6_FACE.s;
const py = (y) => (B6_FACE.y1 - y) / B6_FACE.s;
// Housing: the black surround (face plus the caution band and hood).
export const B6_HOUSING = { x0: -0.305, x1: 0.305, y0: -0.15, y1: 0.232, r: 0.055 };
// Caution / warning row: 10 windows x 2 legends, above the face.
export const B6_ANN = { x0: -0.262, y: 0.192, w: 0.0405, h: 0.034, gap: 0.0055, n: 10 };
export const B6_ANN_TEST = { x: 0.2, y: 0.192 };
const RL = 0.043, RS = 0.033;
// Instruments: x, y (m), bezel radius, dial kind.
export const B6_INST = {
  engOil: { x: -0.142, y: 0.12, r: RS },
  torque: { x: -0.069, y: 0.12, r: RS },
  asi: { x: 0.028, y: 0.112, r: RL },
  att: { x: 0.128, y: 0.112, r: RL },
  alt: { x: 0.231, y: 0.112, r: RL },
  xmsnOil: { x: -0.142, y: 0.053, r: RS },
  tot: { x: -0.069, y: 0.053, r: RS },
  tach: { x: 0.028, y: 0.016, r: RL },
  dg: { x: 0.128, y: 0.016, r: RL },
  vsi: { x: 0.231, y: 0.032, r: 0.036 },
  fuel: { x: -0.142, y: -0.015, r: RS },
  n1: { x: -0.069, y: -0.015, r: RS },
  blank1: { x: 0.028, y: -0.083, r: 0.039 },
  blank2: { x: 0.128, y: -0.083, r: 0.039 },
  tc: { x: 0.231, y: -0.046, r: RS },
  load: { x: -0.142, y: -0.085, r: RS },
  fuelP: { x: -0.069, y: -0.085, r: RS },
};
export const B6_CLOCK = { x: -0.226, y: 0.075, w: 0.074, h: 0.052 };
export const B6_FUEL_VALVE = { x: 0.24, y: -0.108 };
export const B6_KNOBS = [[-0.24, 0.124, 0.008], [-0.262, -0.085, 0.006], [-0.236, -0.085, 0.006]];
export const B6_DIAL = 0.88; // dial / bezel radius

// Needle angles (canvas angle: 0 at 3 o'clock, clockwise). 3D needles turn
// by -angle about the dial normal.
const sweep = (v0, v1, a0, a1) => (v) => (a0 + ((clamp(v, v0, v1) - v0) / (v1 - v0)) * (a1 - a0)) * D2R;
export const B6_ANG = {
  oilP: sweep(0, 150, 200, 340), // upper scale, left to right
  oilT: sweep(0, 150, 160, 20), // lower scale, left to right
  xmsnP: sweep(0, 150, 200, 340),
  xmsnT: sweep(0, 150, 160, 20),
  torque: sweep(0, 120, 135, 405),
  tot: sweep(0, 1000, 135, 405),
  n1: sweep(0, 110, 135, 405),
  tach: sweep(0, 120, 120, 420),
  fuel: sweep(0, 100, 150, 390), // US gal
  fuelP: sweep(0, 30, 150, 390),
  load: sweep(0, 100, 150, 390), // % of the generator rating
  asi: (kt) => (-90 + (clamp(kt, 0, 150) / 150) * 330) * D2R,
  vsi: (fpm) => (180 + (clamp(fpm, -2000, 2000) / 2000) * 170) * D2R,
  altHund: (ft) => (-90 + (((ft % 1000) + 1000) % 1000) * 0.36) * D2R,
  altThou: (ft) => (-90 + (((ft % 10000) + 10000) % 10000) * 0.036) * D2R,
};

// Caution / warning legends (as on the B-3's panel), colour and the
// simulator state that lights it (null: never lit — nothing simulated
// would light it; no random failures).
export const B6_LAMPS = [
  [['ENGINE\nOUT', 'r', 'engOut'], ['ROTOR\nLOW RPM', 'r', 'lowRpm']],
  [['XMSN OIL\nPRESS', 'r', 'xmsnP'], ['XMSN OIL\nTEMP', 'r', null]],
  [['XMSN\nCHIP', 'a', null], ['T/R\nCHIP', 'a', null]],
  [['ENG\nCHIP', 'a', null], ['FUEL\nFILTER', 'a', null]],
  [['FUEL\nPUMP', 'a', null], ['FUEL\nLOW', 'a', 'lowFuel']],
  [['GEN\nFAIL', 'a', 'genFail'], ['BATTERY\nHOT', 'r', null]],
  [['BATTERY\nTEMP', 'a', null], ['START', 'a', 'start']],
  [['BAGGAGE\nDOOR', 'a', null], ['AUTO\nREIGN', 'a', null]],
  [['SPRAY\nON', 'g', 'spray'], ['', 'a', null]],
  [['', 'a', null], ['', 'a', null]],
];
const LAMP_COL = { r: ['#ff3a2a', '#3a1210'], a: ['#ffb31e', '#3a2a0c'], g: ['#58ff8a', '#0f2e17'] };

// Which lamps the state lights (master on with the engine running or
// cranking, or the rotor still turning).
export function b206LampStates(d) {
  const master = d.engine !== 'off' || (d.rotorPct ?? 0) > 1;
  if (!master) return {};
  return {
    engOut: (d.ng ?? 0) < 55,
    lowRpm: (d.rotorPct ?? 0) < 90,
    xmsnP: (d.xmsnOilP ?? 0) < 30,
    lowFuel: d.fuel < 75, // ~20 US gal
    genFail: d.engine !== 'running' || (d.ng ?? 0) < 58,
    start: d.engine === 'cranking',
    spray: !!d.spray,
  };
}

// ---------------------------------------------------------------- face
function dialBg(g, x, y, r) {
  const gr = g.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
  gr.addColorStop(0, '#202326'); gr.addColorStop(1, '#08090a');
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}
function drawFace() {
  const F = B6_FACE;
  const c = canvas(F.W, F.H);
  const g = c.getContext('2d');
  // Light-grey painted plate, slightly worn.
  speckle(g, F.W, F.H, 61, '#b8bab7');
  const vg = g.createLinearGradient(0, 0, 0, F.H);
  vg.addColorStop(0, 'rgba(255,255,255,0.06)'); vg.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = vg; g.fillRect(0, 0, F.W, F.H);
  const I = {};
  for (const [k, o] of Object.entries(B6_INST)) I[k] = { x: px(o.x), y: py(o.y), R: o.r / F.s, r: (o.r * B6_DIAL) / F.s };
  // Case shadows and the four mounting screws of every instrument.
  for (const o of Object.values(I)) {
    const sh = g.createRadialGradient(o.x, o.y + 3, o.R * 0.96, o.x, o.y + 3, o.R * 1.22);
    sh.addColorStop(0, 'rgba(0,0,0,0.5)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.beginPath(); g.arc(o.x, o.y + 3, o.R * 1.22, 0, Math.PI * 2); g.fill();
    for (const a of [45, 135, 225, 315]) screw(g, o.x + Math.cos(a * D2R) * o.R * 1.08, o.y + Math.sin(a * D2R) * o.R * 1.08, 4.2);
  }
  const lab = (t, x, y, sz, col = INK) => text(g, t, x, y, sz, col);
  // --- small engine gauges (black dials, white scales, coloured arcs) ---
  const small = (o, ang, v0, v1, minor, major, arcs, title, unit, opts = {}) => {
    dialBg(g, o.x, o.y, o.r);
    for (const [a, b, col] of arcs) arc(g, o.x, o.y, o.r, ang, a, b, col, 0.11, 0.88);
    scale(g, o.x, o.y, o.r, ang, v0, v1, minor, major, { numR: 0.6, size: 0.21, ...opts });
    lab(title, o.x, o.y - o.r * 0.24, Math.round(o.r * 0.17));
    if (unit) lab(unit, o.x, o.y + o.r * 0.32, Math.round(o.r * 0.14), DIM);
  };
  const dual = (o, title) => {
    dialBg(g, o.x, o.y, o.r);
    arc(g, o.x, o.y, o.r, B6_ANG.oilP, 50, 130, GREEN, 0.11, 0.88);
    arc(g, o.x, o.y, o.r, B6_ANG.oilT, 0, 107, GREEN, 0.11, 0.88);
    radial(g, o.x, o.y, o.r, B6_ANG.oilP(130), RED, 0.07);
    radial(g, o.x, o.y, o.r, B6_ANG.oilT(107), RED, 0.07);
    scale(g, o.x, o.y, o.r, B6_ANG.oilP, 0, 150, 25, 50, { numR: 0.6, size: 0.2, num: (v) => String(v / 10) });
    scale(g, o.x, o.y, o.r, B6_ANG.oilT, 0, 150, 25, 50, { numR: 0.6, size: 0.2, num: (v) => String(v / 10) });
    lab(title, o.x - o.r * 0.06, o.y - o.r * 0.06, Math.round(o.r * 0.16));
    lab('PSI', o.x - o.r * 0.42, o.y - o.r * 0.32, Math.round(o.r * 0.13), DIM);
    lab('°C', o.x - o.r * 0.42, o.y + o.r * 0.34, Math.round(o.r * 0.13), DIM);
    lab('X10', o.x + o.r * 0.38, o.y + o.r * 0.06, Math.round(o.r * 0.12), DIM);
  };
  dual(I.engOil, 'ENG OIL');
  dual(I.xmsnOil, 'XMSN OIL');
  small(I.torque, B6_ANG.torque, 0, 120, 5, 20, [[0, 85, GREEN], [85, 100, YELLOW], [100, 102, RED]], 'TORQUE', '% ', {});
  small(I.tot, B6_ANG.tot, 0, 1000, 50, 200, [[300, 738, GREEN], [738, 810, YELLOW], [810, 820, RED]], 'TURB OUT\nTEMP', '°C X100', { num: (v) => String(v / 100) });
  small(I.n1, B6_ANG.n1, 0, 110, 5, 20, [[62, 105, GREEN], [105, 106, RED]], 'GAS\nPRODUCER', '% RPM', {});
  small(I.fuel, B6_ANG.fuel, 0, 100, 10, 20, [[0, 20, YELLOW]], 'FUEL', 'U.S. GALS', {});
  small(I.fuelP, B6_ANG.fuelP, 0, 30, 2.5, 10, [[4, 20, GREEN], [25, 26, RED]], 'FUEL\nPRESS', 'PSI', {});
  small(I.load, B6_ANG.load, 0, 100, 5, 20, [[0, 100, GREEN]], 'LOAD', '% DC', {});
  // --- airspeed: knots, green to 110, red at the Vne (122 kt) ---
  {
    const o = I.asi;
    dialBg(g, o.x, o.y, o.r);
    arc(g, o.x, o.y, o.r, B6_ANG.asi, 0, 110, GREEN, 0.07, 0.95);
    radial(g, o.x, o.y, o.r, B6_ANG.asi(122), RED, 0.07);
    scale(g, o.x, o.y, o.r, B6_ANG.asi, 0, 150, 5, 10, { numR: 0.68, size: 0.15, num: (v) => (v % 20 === 0 && v > 0 ? String(v) : null) });
    lab('AIRSPEED', o.x, o.y + o.r * 0.32, Math.round(o.r * 0.12));
    lab('KNOTS', o.x, o.y - o.r * 0.3, Math.round(o.r * 0.11), DIM);
  }
  // --- dual tachometer: power turbine (T) and rotor (R), % ---
  {
    const o = I.tach;
    dialBg(g, o.x, o.y, o.r);
    arc(g, o.x, o.y, o.r, B6_ANG.tach, 97, 100, GREEN, 0.12, 0.94);
    arc(g, o.x, o.y, o.r, B6_ANG.tach, 90, 107, GREEN, 0.08, 0.78);
    radial(g, o.x, o.y, o.r, B6_ANG.tach(103), RED, 0.07);
    scale(g, o.x, o.y, o.r, B6_ANG.tach, 0, 120, 5, 10, { numR: 0.66, size: 0.15, num: (v) => (v % 20 === 0 ? String(v) : null) });
    lab('ROTOR', o.x, o.y - o.r * 0.32, Math.round(o.r * 0.12));
    lab('POWER\nTURBINE', o.x, o.y + o.r * 0.34, Math.round(o.r * 0.11));
    lab('PERCENT RPM', o.x, o.y + o.r * 0.62, Math.round(o.r * 0.09), DIM);
  }
  // --- altimeter ---
  {
    const o = I.alt;
    dialBg(g, o.x, o.y, o.r);
    scale(g, o.x, o.y, o.r, (v) => (-90 + v * 36) * D2R, 0, 10, 0.2, 1, { numR: 0.66, size: 0.22, num: (v) => (Math.round(v) < 10 ? String(Math.round(v)) : null) });
    g.fillStyle = '#040505'; g.fillRect(o.x + o.r * 0.24, o.y - o.r * 0.11, o.r * 0.44, o.r * 0.22);
    text(g, '29.92', o.x + o.r * 0.46, o.y, Math.round(o.r * 0.13), INK, false);
    lab('ALT', o.x - o.r * 0.32, o.y + o.r * 0.02, Math.round(o.r * 0.15));
    lab('100 FEET', o.x, o.y + o.r * 0.38, Math.round(o.r * 0.09), DIM);
  }
  // --- VSI: CLIMB, x1000 ft/min ---
  {
    const o = I.vsi;
    dialBg(g, o.x, o.y, o.r);
    scale(g, o.x, o.y, o.r, B6_ANG.vsi, -2000, 2000, 250, 500, { numR: 0.62, size: 0.2, num: (v) => (v % 1000 === 0 ? String(Math.abs(v / 1000)) : null) });
    lab('CLIMB', o.x + o.r * 0.18, o.y - o.r * 0.32, Math.round(o.r * 0.15));
    lab('1000 FT/MIN', o.x + o.r * 0.12, o.y + o.r * 0.32, Math.round(o.r * 0.11), DIM);
  }
  // --- turn coordinator face (the symbol and ball are 3D) ---
  {
    const o = I.tc;
    dialBg(g, o.x, o.y, o.r);
    for (const a of [0, 20, 160, 180]) radial(g, o.x, o.y, o.r, a * D2R, INK, 0.07);
    g.fillStyle = '#d9d9d2'; roundRect(g, o.x - o.r * 0.55, o.y + o.r * 0.18, o.r * 1.1, o.r * 0.22, o.r * 0.1); g.fill();
    g.fillStyle = '#111'; g.fillRect(o.x - 1.5, o.y + o.r * 0.18, 3, o.r * 0.22);
    lab('2 MIN TURN', o.x, o.y + o.r * 0.6, Math.round(o.r * 0.12));
    lab('L', o.x - o.r * 0.72, o.y + o.r * 0.42, Math.round(o.r * 0.15));
    lab('R', o.x + o.r * 0.72, o.y + o.r * 0.42, Math.round(o.r * 0.15));
  }
  // Attitude and DG positions: dark recess (their faces are 3D textures).
  for (const k of ['att', 'dg']) dialBg(g, I[k].x, I[k].y, I[k].r);
  // Blanked optional positions: black cover plates with their screws.
  for (const k of ['blank1', 'blank2']) {
    const o = I[k];
    const gr = g.createRadialGradient(o.x - o.R * 0.3, o.y - o.R * 0.3, 2, o.x, o.y, o.R);
    gr.addColorStop(0, '#2a2c2f'); gr.addColorStop(1, '#101112');
    g.fillStyle = gr; g.beginPath(); g.arc(o.x, o.y, o.R * 0.98, 0, Math.PI * 2); g.fill();
  }
  // Clock bezel (Davtron-style digital clock: white case, LCD is live).
  {
    const C = B6_CLOCK;
    const x = px(C.x - C.w / 2), y = py(C.y + C.h / 2), w = C.w / F.s, h = C.h / F.s;
    g.fillStyle = '#e9ebe8'; roundRect(g, x, y, w, h, 8); g.fill();
    g.strokeStyle = '#8e918e'; g.lineWidth = 2; roundRect(g, x, y, w, h, 8); g.stroke();
    for (let i = 0; i < 3; i++) { g.fillStyle = '#2c2f33'; roundRect(g, x + 12 + i * (w - 24) / 3, y + h - 22, (w - 24) / 3 - 8, 13, 4); g.fill(); }
    text(g, 'M      S      ET', x + w / 2, y + h - 30, 9, '#2c2f33');
  }
  // Placards, labels, knobs' engravings.
  text(g, 'HEATER\nOFF FOR\nTAKEOFF\nLANDING\nHOVER', px(-0.268), py(0.148), 9, '#1b1c1e');
  text(g, 'LV', px(-0.24), py(0.098), 11, '#1b1c1e');
  g.fillStyle = '#c2201a'; roundRect(g, px(-0.255), py(-0.012), 0.04 / F.s, 0.032 / F.s, 4); g.fill();
  text(g, 'BAT\nTEMP\n120°F', px(-0.235), py(-0.028), 10, '#f6efe6');
  text(g, 'AVOID CONT OPS 70% TO 80% N2', px(0.04), py(-0.037), 9, '#1b1c1e');
  text(g, 'MUSIC\nON', px(-0.262), py(-0.066), 8, '#1b1c1e');
  text(g, 'INST\nLTS', px(-0.236), py(-0.066), 8, '#1b1c1e');
  text(g, 'NAV 2', px(-0.226), py(0.04), 9, '#1b1c1e');
  text(g, 'NAV 1', px(0.128), py(-0.124), 9, '#1b1c1e');
  text(g, 'ON\n\nFUEL\nVALVE\n\nOFF', px(0.265), py(-0.108), 8, '#1b1c1e');
  // Face screws round the edge.
  for (const [x, y] of [[-0.282, 0.157], [0.282, 0.157], [-0.282, -0.127], [0.282, -0.127], [-0.1, 0.157], [0.08, 0.157], [-0.1, -0.127], [0.18, -0.127]]) screw(g, px(x), py(y), 4.4);
  return { c, tex: canvasTexture(c, { aniso: 8 }) };
}

// ---------------------------------------------------------------- caution row
const ANN = { W: 640, H: 64 };
function drawAnnunciator(g, lit) {
  const A = B6_ANN;
  g.fillStyle = '#060607'; g.fillRect(0, 0, ANN.W, ANN.H);
  const cw = ANN.W / A.n;
  B6_LAMPS.forEach((col, i) => col.forEach(([label, c, key], j) => {
    const x = i * cw + 3, y = j * (ANN.H / 2) + 2, w = cw - 6, h = ANN.H / 2 - 4;
    const on = key && lit[key];
    const [onC, offC] = LAMP_COL[c];
    g.fillStyle = on ? onC : offC;
    g.fillRect(x, y, w, h);
    if (on) { g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x, y, w, h * 0.35); }
    if (label) text(g, label, x + w / 2, y + h / 2 + 1, 9, on ? '#1a0e04' : 'rgba(210,200,180,0.32)');
  }));
}

// ---------------------------------------------------------------- pedestal
// Centre pedestal face (metres: w x h along the sloping face): audio panel,
// COM/NAV, transponder, the AGROWINGS NAV remote, a switch row.
export const B6_PED = { w: 0.23, h: 0.5, W: 276, H: 600 };
export const B6_PED_MODS = [
  { y: 0.02, h: 0.045, kind: 'audio', label: 'AUDIO' },
  { y: 0.07, h: 0.05, kind: 'com', label: 'COM 1', lcd: '123.450', lcd2: '122.900' },
  { y: 0.125, h: 0.05, kind: 'nav', label: 'NAV 1', lcd: '113.20', lcd2: '110.90' },
  { y: 0.18, h: 0.045, kind: 'xpdr', label: 'XPDR', lcd: '7000 ALT' },
  { y: 0.23, h: 0.06, kind: 'spray', label: 'SPRAY' },
  { y: 0.295, h: 0.075, kind: 'switches', label: '' },
];
function drawPedestal() {
  const P = B6_PED, s = P.W / P.w;
  const c = canvas(P.W, P.H);
  const g = c.getContext('2d');
  speckle(g, P.W, P.H, 77, '#2a2c2f');
  for (const m of B6_PED_MODS) {
    const y = m.y * s, h = m.h * s;
    g.fillStyle = '#121315'; roundRect(g, 8, y, P.W - 16, h, 5); g.fill();
    g.strokeStyle = 'rgba(200,205,210,0.18)'; g.lineWidth = 1.5; roundRect(g, 8, y, P.W - 16, h, 5); g.stroke();
    text(g, m.label, 30, y + 11, 9, '#cfd2d4');
    if (m.lcd) {
      g.fillStyle = '#1a0d04'; g.fillRect(56, y + h * 0.25, 120, h * 0.5);
      text(g, m.lcd, 116, y + h * 0.5, 15, '#ff8a2a', false);
      if (m.lcd2) { g.fillStyle = '#1a0d04'; g.fillRect(184, y + h * 0.25, 70, h * 0.5); text(g, m.lcd2, 219, y + h * 0.5, 11, '#ff8a2a', false); }
    }
    if (m.kind === 'audio') for (let i = 0; i < 8; i++) { g.fillStyle = '#3a3d41'; roundRect(g, 50 + i * 27, y + h * 0.3, 21, h * 0.45, 3); g.fill(); }
    if (m.kind === 'spray') {
      text(g, 'SIMPLEX 4900', P.W / 2 + 20, y + 11, 9, '#cfd2d4');
      for (const [i, t] of ['MASTER', 'PUMP', 'VALVE', 'FLOW'].entries()) text(g, t, 46 + i * 58, y + h - 10, 8, '#a8acaf');
    }
    if (m.kind === 'switches') for (const [i, t] of ['BATT', 'GEN', 'FUEL PUMP', 'ANTI-ICE', 'NAV LTS', 'ANTI COLL'].entries()) text(g, t, 30 + i * 43, y + h - 9, 7, '#a8acaf');
  }
  text(g, 'VENT', 30, 0.45 * s, 9, '#cfd2d4');
  text(g, 'VENT', P.W - 30, 0.45 * s, 9, '#cfd2d4');
  for (const [x, y] of [[14, 6], [P.W - 14, 6], [14, P.H - 8], [P.W - 14, P.H - 8]]) screw(g, x, y, 4);
  return { c, tex: canvasTexture(c, { aniso: 8 }) };
}

// ---------------------------------------------------------------- GPS
// AGROWINGS NAV (agroNav.js): the shared unit, here on its arm at the left
// of the hood.
export const B6_GPS = NAV;
export const B6_GPS_PAGES = NAV_PAGES;

export function createB206Panel() {
  const face = drawFace();
  const ped = drawPedestal();
  const mk = (w, h, aniso = 4) => { const c = canvas(w, h); return { c, g: c.getContext('2d'), tex: canvasTexture(c, { aniso }), key: '' }; };
  const ann = mk(ANN.W, ANN.H);
  const clock = mk(128, 48);
  const gps = createAgroNav({ home: { x: BASE.helipad2.x, z: BASE.helipad2.z, name: 'BASE · H2', label: 'HELIPONTO DA BASE (SEM CONTRATO)' } });
  const tex = (w, h, fn, aniso = 4) => { const c = canvas(w, h); fn(c.getContext('2d'), w, h); return canvasTexture(c, { aniso }); };
  const attTape = tex(256, 1024, (g, w, h) => drawAttTape(g, w, h));
  const attOverlay = tex(256, 256, (g, w) => drawAttOverlay(g, w));
  const card = tex(512, 512, (g, w) => drawCard(g, w));
  const cardOverlay = tex(256, 256, (g, w) => drawCardOverlay(g, w));
  const glass = tex(256, 256, (g, w) => drawGlass(g, w), 2);
  const tcPlane = tex(256, 256, (g, w) => drawTcPlane(g, w));
  drawAnnunciator(ann.g, {}); ann.tex.needsUpdate = true;
  let etT = 0, lastNow = performance.now();
  const redraw = (s, key, fn) => { if (key === s.key) return; s.key = key; fn(); s.tex.needsUpdate = true; };
  const api = {
    texture: face.tex, face, ped, ann, clock, gps,
    attTape, attOverlay, card, cardOverlay, glass, tcPlane,
    get page() { return gps.page; },
    last: null,
    lit: {},
    setPage: gps.setPage,
    nextPage: gps.nextPage,
    // d: Helicopter.instruments() (+ game data via d.gps = the Guidance).
    draw(d) {
      const now = performance.now(), dt = Math.min(0.5, (now - lastNow) / 1000);
      lastNow = now;
      api.last = d;
      const master = d.engine !== 'off' || (d.rotorPct ?? 0) > 1;
      // Caution row: redrawn only when a lamp changes.
      const lit = b206LampStates(d);
      api.lit = lit;
      redraw(ann, Object.keys(lit).filter((k) => lit[k]).join(','), () => drawAnnunciator(ann.g, lit));
      // Clock: elapsed time since the engine was started (ET mode).
      if (d.engine === 'running') etT += dt; else if (d.engine === 'off') etT = 0;
      redraw(clock, master ? `${Math.floor(etT)}` : 'off', () => {
        const g = clock.g;
        g.fillStyle = '#0d1410'; g.fillRect(0, 0, 128, 48);
        if (!master) return;
        g.fillStyle = 'rgba(160,255,190,0.07)'; g.fillRect(0, 0, 128, 48);
        text(g, `${String(Math.floor(etT / 60)).padStart(2, '0')}:${String(Math.floor(etT % 60)).padStart(2, '0')}`, 64, 26, 30, '#c8f5d0', false);
        text(g, 'ET', 116, 9, 9, '#8fbf98');
      });
      // GPS: the shared unit (its own rate, only when its content changed).
      gps.draw(d, dt, master);
    },
  };
  return api;
}
