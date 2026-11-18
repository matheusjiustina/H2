// Cessna A188B AgTruck instrument panel: layout and textures, after the
// cabin photographs (an AgTruck with the door open, its panel seen from
// the seat) and the simulator cabins for the parts the photos hide:
//   - the doghouse: a black hood on top of the panel, under the windshield,
//     with the engine gauges in a row — fuel pressure, oil temperature,
//     manifold pressure, tachometer (with its hour meter), oil pressure,
//     cylinder-head temperature;
//   - under it the black padded roll across the cabin with the white
//     operating placards (flap speeds, manifold pressure, fuel flow, the
//     restricted-category limitations);
//   - the grey metal panel: rocker switches and knobs on the left; airspeed,
//     altimeter, turn coordinator, directional gyro and the two fuel
//     gauges in the middle; the breaker caps and the lamps on the right,
//     the master switch, the magneto toggles, the starter button and the
//     red fuel valve knob ("52 GAL USABLE") at its lower right.
// The AGROWINGS NAV unit (the game's GPS, agroNav.js) sits on a bracket
// under the right of the panel, where AgTrucks carry their guidance unit.
// Dial faces are drawn once into an atlas (512 px per dial); needles, the
// gyro card, the switches and knobs are 3D (a188Cockpit.js). Every value
// comes from Aircraft.instruments(): nothing is invented to fill a dial.
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp, rng } from '../core/math.js';
import { roundRect } from './panel.js';
import { screw, text, scale, radial } from './r44Panel.js';
import { createAgroNav } from './agroNav.js';
import { E203_ANG } from './e203Panel.js';
import { BASE } from '../world/layout.js';

const D2R = Math.PI / 180;
const KT_MPH = 1.15078, C2F = (c) => c * 1.8 + 32;
const INK = '#f1f0ea', GREEN = '#22a94a', YELLOW = '#f1c21b', RED = '#df2a1c', WHITE = '#f4f4f0';

// Lower panel frame (metres): u to the pilot's right, v up from its bottom
// edge; its outline is a rectangle with clipped top corners (a188Cockpit.js).
export const A188_PANEL = {
  w: 0.84, h: 0.26, W: 2048, H: 640,
  dials: {
    asi: { u: -0.17, v: 0.145, r: 0.041, f: 0.036, cell: 0 },
    alt: { u: -0.076, v: 0.145, r: 0.041, f: 0.036, cell: 1 },
    tc: { u: 0.018, v: 0.145, r: 0.041, f: 0.036, cell: 2 },
    dg: { u: 0.112, v: 0.145, r: 0.041, f: 0.036, cell: 3 },
    fuelL: { u: 0.192, v: 0.145, r: 0.029, f: 0.025, cell: 4 },
    fuelR: { u: 0.256, v: 0.145, r: 0.029, f: 0.025, cell: 5 },
  },
  lamps: [
    { id: 'alt', u: -0.36, v: 0.112, r: 0.006, col: 0xe8281c, label: 'ALT' },
    { id: 'oil', u: -0.33, v: 0.112, r: 0.006, col: 0xe8281c, label: 'OIL' },
    { id: 'fuel', u: -0.3, v: 0.112, r: 0.006, col: 0xf0a21a, label: 'FUEL' },
    { id: 'stall', u: 0.256, v: 0.216, r: 0.0065, col: 0xff2a1a, label: 'STALL' },
    { id: 'spray', u: 0.192, v: 0.216, r: 0.0065, col: 0xf0b21a, label: 'SPRAY' },
    { id: 'start', u: 0.395, v: 0.07, r: 0.0055, col: 0xf0a21a, label: '' },
  ],
  // Rocker switches (left), knobs under them.
  rockers: { v: 0.205, us: [-0.375, -0.34, -0.305], labels: ['BAT', 'ALT', 'BOOST'] },
  knobs: [{ u: -0.385, v: 0.055, label: 'PRIMER' }, { u: -0.325, v: 0.055, label: 'CABIN AIR' }, { u: -0.265, v: 0.055, label: 'THROTTLE\nFRICTION' }],
  // Breaker caps, two rows of six.
  breakers: { vs: [0.222, 0.182], us: [0.3, 0.322, 0.344, 0.366, 0.388, 0.41], caps: [['LDG', 'NAV', 'BCN', 'STRB', 'L.SPR', 'R.SPR'], ['ALT', 'INST', 'VALV', 'AGIT', 'T.C.', 'PUMP']] },
  // Toggles at the lower right: master (red), left and right magneto.
  toggles: [{ id: 'master', u: 0.3, v: 0.105, red: true, label: 'MASTER' }, { id: 'magL', u: 0.333, v: 0.105, label: 'L MAG' }, { id: 'magR', u: 0.358, v: 0.105, label: 'R MAG' }],
  starter: { u: 0.395, v: 0.105, r: 0.009 },
  fuelValve: { u: 0.395, v: 0.04, r: 0.012 },
  regPlate: { u: -0.33, v: 0.026, w: 0.06, h: 0.015 },
  placard: { u: -0.04, v: 0.04, w: 0.17, h: 0.03 },
  // The doghouse's face (its own frame: u right, v up from its foot).
  dog: {
    w: 0.47, h: 0.105, W: 1536, H: 344,
    dials: {
      fuelP: { u: -0.185, v: 0.055, r: 0.026, f: 0.022, cell: 6 },
      oilT: { u: -0.128, v: 0.055, r: 0.026, f: 0.022, cell: 7 },
      mp: { u: -0.054, v: 0.055, r: 0.038, f: 0.033, cell: 8 },
      rpm: { u: 0.034, v: 0.055, r: 0.038, f: 0.033, cell: 9 },
      oilP: { u: 0.11, v: 0.055, r: 0.026, f: 0.022, cell: 10 },
      cht: { u: 0.168, v: 0.055, r: 0.026, f: 0.022, cell: 11 },
    },
  },
  // GPS housing on its bracket under the right of the panel (panel frame,
  // below its bottom edge): the screen and the soft keys.
  gps: { u: 0.33, v: -0.085, w: 0.175, h: 0.128, d: 0.045, screen: { u: 0.338, v: -0.077, w: 0.13, h: 0.0894 }, keysV: -0.138, keysU: [0.292, 0.322, 0.352, 0.382], side: { u: 0.2565, vs: [-0.055, -0.077, -0.099] } },
};
const P = A188_PANEL;
const S = P.W / P.w; // px per metre
const X = (u) => (u + P.w / 2) * S, Y = (v) => (P.h - v) * S;

// Dial angles (radians, clockwise from 12 o'clock as the pilot sees them).
const small = (v, a, b) => (-60 + ((clamp(v, a, b) - a) / (b - a)) * 120) * D2R;
export const A188_ANG = {
  asi: E203_ANG.asi, alt100: E203_ANG.alt100, alt1000: E203_ANG.alt1000, alt10k: E203_ANG.alt10k,
  rpm: (rpm) => (-135 + (clamp(rpm, 0, 3500) / 3500) * 270) * D2R,
  mp: (inHg) => (-135 + ((clamp(inHg, 10, 35) - 10) / 25) * 270) * D2R,
  fuel: (gal) => small(gal, 0, 27),
  fuelP: (psi) => small(psi, 0, 30),
  oilT: (f) => small(f, 50, 250),
  oilP: (psi) => small(psi, 0, 120),
  cht: (f) => small(f, 100, 500),
  // Turn coordinator: the little aeroplane banks 15° at standard rate.
  turn: (degPerS) => clamp(degPerS / 3, -1.8, 1.8) * 15 * D2R,
};

// ---------------------------------------------------------------- textures
function greyPaint(g, w, h, seed) {
  g.fillStyle = '#9da2a3'; g.fillRect(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < w * h * 0.004; i++) {
    const v = (r() - 0.5) * 20, a = 0.08 + r() * 0.08;
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${a * Math.abs(v) / 10})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5);
  }
  // Wear: rubbed paint round the switches, grime at the bottom.
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(255,255,255,0.04)'); gr.addColorStop(1, 'rgba(40,36,30,0.16)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}

function drawFace(reg) {
  const c = canvas(P.W, P.H), g = c.getContext('2d');
  greyPaint(g, P.W, P.H, 1881);
  // Screws round the edge and the seam of the centre plate.
  for (let u = -0.4; u <= 0.41; u += 0.08) for (const v of [0.012, P.h - 0.014]) screw(g, X(u), Y(v), 6);
  g.strokeStyle = 'rgba(40,44,48,0.7)'; g.lineWidth = 4;
  g.strokeRect(X(-0.225), Y(0.205), (0.52) * S, 0.12 * S);
  // Shadow ring and flange screws round every recessed instrument.
  for (const d of Object.values(P.dials)) {
    const x = X(d.u), y = Y(d.v) + 4, R = d.r * S;
    const sh = g.createRadialGradient(x, y, R * 0.92, x, y, R * 1.3);
    sh.addColorStop(0, 'rgba(0,0,0,0.5)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.beginPath(); g.arc(x, y, R * 1.3, 0, Math.PI * 2); g.fill();
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) screw(g, X(d.u + sx * d.r * 0.98), Y(d.v + sy * d.r * 0.98), 5);
  }
  const lab = (t, u, v, s = 12, col = '#1e2022', bold = true) => text(g, t, X(u), Y(v), s, col, bold);
  for (const [i, u] of P.rockers.us.entries()) lab(P.rockers.labels[i], u, P.rockers.v + 0.026);
  for (const k of P.knobs) k.label.split('\n').forEach((t, i) => lab(t, k.u, k.v - 0.02 - i * 0.011, 10));
  for (const l of P.lamps) if (l.label) lab(l.label, l.u, l.v - l.r - 0.009, 10.5);
  for (const [r, v] of P.breakers.vs.entries()) for (const [i, u] of P.breakers.us.entries()) {
    lab(P.breakers.caps[r][i], u, v + 0.013, 9);
    g.strokeStyle = 'rgba(30,32,34,0.6)'; g.lineWidth = 1.2; g.beginPath(); g.arc(X(u), Y(v), 0.0078 * S, 0, Math.PI * 2); g.stroke();
  }
  for (const tg of P.toggles) { lab(tg.label, tg.u, tg.v + 0.022, 9.5); lab('ON', tg.u, tg.v + 0.012, 8, '#3a3d40'); lab('OFF', tg.u, tg.v - 0.016, 8, '#3a3d40'); }
  lab('STARTER', P.starter.u, P.starter.v + 0.02, 9.5);
  lab('FUEL VALVE', P.fuelValve.u - 0.045, P.fuelValve.v + 0.008, 9.5);
  lab('52 GAL USABLE', P.fuelValve.u - 0.045, P.fuelValve.v - 0.004, 9);
  lab('FUEL L', P.dials.fuelL.u, P.dials.fuelL.v - P.dials.fuelL.r - 0.01, 10);
  lab('FUEL R', P.dials.fuelR.u, P.dials.fuelR.v - P.dials.fuelR.r - 0.01, 10);
  {
    const R = P.regPlate;
    g.fillStyle = '#121315'; roundRect(g, X(R.u - R.w / 2), Y(R.v + R.h / 2), R.w * S, R.h * S, 5); g.fill();
    text(g, reg, X(R.u), Y(R.v) + 1, 24, WHITE);
  }
  {
    const Pl = P.placard, x = X(Pl.u), y = Y(Pl.v);
    g.fillStyle = '#e9e8e2'; g.fillRect(x - (Pl.w / 2) * S, y - (Pl.h / 2) * S, Pl.w * S, Pl.h * S);
    g.strokeStyle = '#2b2d30'; g.lineWidth = 1.2; g.strokeRect(x - (Pl.w / 2) * S, y - (Pl.h / 2) * S, Pl.w * S, Pl.h * S);
    ['OPERATE IN RESTRICTED CATEGORY ONLY', 'NO ACROBATIC MANEUVERS · NO PASSENGERS', 'SPIN RECOVERY: OPPOSITE RUDDER, STICK FWD'].forEach((t, i) => text(g, t, x, y - 0.009 * S + i * 0.009 * S, 9, '#1d1f22', i === 0));
  }
  return c;
}

// Doghouse face: black crinkle paint, the engine gauges' flanges.
function drawDogFace() {
  const D = P.dog, s = D.W / D.w, c = canvas(D.W, D.H), g = c.getContext('2d');
  const XX = (u) => (u + D.w / 2) * s, YY = (v) => (D.h - v) * s;
  g.fillStyle = '#18191b'; g.fillRect(0, 0, D.W, D.H);
  const r = rng(77);
  for (let i = 0; i < 9000; i++) { const v = r() < 0.5 ? 40 : 10; g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(r() * D.W, r() * D.H, 2, 2); }
  for (const d of Object.values(D.dials)) {
    const x = XX(d.u), y = YY(d.v) + 3, R = d.r * s;
    const sh = g.createRadialGradient(x, y, R * 0.92, x, y, R * 1.25);
    sh.addColorStop(0, 'rgba(0,0,0,0.7)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.beginPath(); g.arc(x, y, R * 1.25, 0, Math.PI * 2); g.fill();
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) screw(g, XX(d.u + sx * d.r * 0.95), YY(d.v + sy * d.r * 0.95), 5);
  }
  return c;
}

// The padded roll: black leatherette, its seams, the white placards.
function drawRoll() {
  const W = 2048, H = 256, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#141517'; g.fillRect(0, 0, W, H);
  const r = rng(91);
  for (let i = 0; i < 26000; i++) { const v = 22 + r() * 30; g.fillStyle = `rgba(${v},${v},${v + 2},0.55)`; g.fillRect(r() * W, r() * H, 2, 2); }
  const sh = g.createLinearGradient(0, 0, 0, H);
  sh.addColorStop(0, 'rgba(255,255,255,0.0)'); sh.addColorStop(0.35, 'rgba(255,255,255,0.08)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.0)'); sh.addColorStop(1, 'rgba(0,0,0,0.4)');
  g.fillStyle = sh; g.fillRect(0, 0, W, H);
  const plac = (x, y, w, h, lines, big) => {
    g.strokeStyle = '#d8d8d2'; g.lineWidth = 3; g.strokeRect(x, y, w, h);
    lines.forEach((t, i) => text(g, t, x + w / 2, y + 16 + i * ((h - 22) / Math.max(1, lines.length - 1)), big && i === 0 ? 17 : 13, '#e6e6e0', i === 0));
  };
  plac(330, 92, 230, 70, ['MAXIMUM FLAP SPEED', 'FLAPS 5° - 120 MPH', 'FLAPS 10° & 20° - 110 MPH'], true);
  plac(600, 86, 200, 82, ['MAXIMUM ALLOWED', 'MANIFOLD PRESSURE', 'SL 28  ·  2500 26', '5000 24  ·  7500 22'], true);
  plac(840, 92, 200, 70, ['FUEL FLOW AT FULL THROTTLE', '2850 RPM   2700 RPM', 'SL 25   ·   23 GPH'], true);
  plac(1090, 70, 460, 112, ['THE MARKINGS AND PLACARDS INSTALLED IN THIS AIRPLANE CONTAIN', 'OPERATING LIMITATIONS WHICH MUST BE COMPLIED WITH WHEN OPERATING', 'THIS AIRPLANE IN THE RESTRICTED CATEGORY. OTHER OPERATING', 'LIMITATIONS ARE CONTAINED IN THE PILOT\'S OPERATING HANDBOOK.', 'NO ACROBATIC MANEUVERS, INCLUDING SPINS, APPROVED.'], false);
  plac(1590, 96, 250, 56, ['AVOID CONTINUOUS OPERATION', 'ABOVE 25 IN. M.P. 2000-2250 RPM'], true);
  return c;
}

// ---------------------------------------------------------------- dials
// Atlas 2048 x 1536: twelve 512 px faces (0 asi, 1 alt, 2 turn coordinator,
// 3 directional gyro card, 4 / 5 fuel L / R, 6 fuel pressure, 7 oil
// temperature, 8 manifold pressure, 9 tachometer, 10 oil pressure, 11 CHT).
export const A188_ATLAS = { W: 2048, H: 1536, cell: 512, cols: 4, rows: 3 };
const canvasAng = (a) => a - Math.PI / 2;
function arc(g, x, y, r, ang, v0, v1, col, w, rr = 0.93) {
  const a0 = ang(v0), a1 = ang(v1);
  g.strokeStyle = col; g.lineWidth = r * w;
  g.beginPath(); g.arc(x, y, r * rr, Math.min(a0, a1), Math.max(a0, a1)); g.stroke();
}
function faceBase(g, x, y, r) {
  const gr = g.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.1, x, y, r);
  gr.addColorStop(0, '#1d2023'); gr.addColorStop(1, '#08090a');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}
function drawDials(V) {
  const c = canvas(A188_ATLAS.W, A188_ATLAS.H), g = c.getContext('2d');
  g.fillStyle = '#060707'; g.fillRect(0, 0, c.width, c.height);
  const cell = (i) => ({ x: (i % 4) * 512 + 256, y: Math.floor(i / 4) * 512 + 256, r: 250 });
  const A = A188_ANG;
  const T = (t, x, y, s, col = INK, bold = true) => text(g, t, x, y, s, col, bold);
  // 0 — airspeed, MPH outside, knots inside.
  {
    const { x, y, r } = cell(0);
    faceBase(g, x, y, r);
    const ang = (mph) => canvasAng(A.asi(mph / KT_MPH));
    const kt = (k) => k * KT_MPH;
    const vno = V.vne * 0.8;
    arc(g, x, y, r, ang, kt(V.vs0), kt(V.vfe), WHITE, 0.055, 0.8);
    arc(g, x, y, r, ang, kt(V.vs1), kt(vno), GREEN, 0.06, 0.885);
    arc(g, x, y, r, ang, kt(vno), kt(V.vne), YELLOW, 0.06, 0.885);
    radial(g, x, y, r, ang(kt(V.vne)), RED, 0.05);
    scale(g, x, y, r, ang, 40, 200, 5, 20, { numR: 0.66, size: 0.15 });
    for (let k = 40; k <= 170; k += 10) {
      const a = ang(kt(k));
      g.strokeStyle = '#cfcfc8'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45); g.lineTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5); g.stroke();
      if (k % 20 === 0) T(String(k), x + Math.cos(a) * r * 0.37, y + Math.sin(a) * r * 0.37, 22, '#cfcfc8', false);
    }
    T('MPH', x, y - r * 0.2, 30); T('AIRSPEED', x, y + r * 0.07, 19, '#cfcfc8', false); T('KNOTS', x, y + r * 0.17, 17, '#cfcfc8', false);
  }
  // 1 — altimeter.
  {
    const { x, y, r } = cell(1);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng((v / 10) * Math.PI * 2);
    scale(g, x, y, r, ang, 0, 9.8, 0.2, 1, { numR: 0.66, size: 0.2, num: (v) => Math.round(v) });
    T('ALT', x, y - r * 0.32, 32);
    T('100 FEET', x, y - r * 0.18, 20, '#cfcfc8', false);
    g.fillStyle = '#000'; roundRect(g, x + r * 0.2, y - r * 0.09, r * 0.42, r * 0.17, 6); g.fill();
    T('29.92', x + r * 0.41, y, 30, WHITE, false);
    T('IN.HG', x + r * 0.41, y + r * 0.16, 15, '#cfcfc8', false);
  }
  // 2 — turn coordinator: the standard-rate marks, the inclinometer tube
  // (the aeroplane and the ball are 3D).
  {
    const { x, y, r } = cell(2);
    faceBase(g, x, y, r);
    g.strokeStyle = WHITE; g.lineWidth = 9;
    for (const a of [-105, -75, 75, 105]) { const aa = (a - 90 + 90) * D2R; g.beginPath(); g.moveTo(x + Math.cos(aa + Math.PI) * r * 0.62, y + Math.sin(aa + Math.PI) * r * 0.62); g.lineTo(x + Math.cos(aa + Math.PI) * r * 0.8, y + Math.sin(aa + Math.PI) * r * 0.8); g.stroke(); }
    T('L', x - r * 0.72, y + r * 0.36, 34); T('R', x + r * 0.72, y + r * 0.36, 34);
    T('TURN COORDINATOR', x, y - r * 0.55, 20, '#cfcfc8', false);
    T('2 MIN', x, y + r * 0.66, 20, '#cfcfc8', false);
    g.fillStyle = '#d8d6c8'; roundRect(g, x - r * 0.48, y + r * 0.3, r * 0.96, r * 0.16, r * 0.08); g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 4;
    for (const dx of [-0.1, 0.1]) { g.beginPath(); g.moveTo(x + dx * r, y + r * 0.3); g.lineTo(x + dx * r, y + r * 0.46); g.stroke(); }
  }
  // 3 — directional gyro card (turns with the heading).
  {
    const { x, y, r } = cell(3);
    faceBase(g, x, y, r);
    for (let k = 0; k < 72; k++) {
      const a = canvasAng(k * 5 * D2R), L = k % 6 === 0 ? 0.16 : k % 2 === 0 ? 0.1 : 0.06;
      g.strokeStyle = WHITE; g.lineWidth = k % 6 === 0 ? 6 : 3;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92); g.lineTo(x + Math.cos(a) * r * (0.92 - L), y + Math.sin(a) * r * (0.92 - L)); g.stroke();
    }
    const lab = ['N', '3', '6', 'E', '12', '15', 'S', '21', '24', 'W', '30', '33'];
    lab.forEach((t, i) => {
      const a = canvasAng(i * 30 * D2R);
      g.save(); g.translate(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6); g.rotate(i * 30 * D2R);
      text(g, t, 0, 0, t.length > 1 ? 40 : 52, i % 3 === 0 ? YELLOW : WHITE, true); g.restore();
    });
  }
  // 4 / 5 — fuel quantity, each tank (gallons).
  for (const [i, side] of [[4, 'LEFT'], [5, 'RIGHT']]) {
    const { x, y, r } = cell(i);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(A.fuel(v));
    arc(g, x, y, r, ang, 0, 3, RED, 0.08, 0.86);
    scale(g, x, y, r, ang, 0, 26, 2, 13, { numR: 0.62, size: 0.17, num: (v) => (v === 0 ? 'E' : v === 26 ? 'F' : '½') });
    T('FUEL', x, y + r * 0.18, 34); T(side + ' TANK', x, y + r * 0.36, 22, '#cfcfc8', false); T('GALLONS', x, y + r * 0.52, 18, '#9a9a94', false);
  }
  // 6 — fuel pressure (psi).
  {
    const { x, y, r } = cell(6);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(A.fuelP(v));
    arc(g, x, y, r, ang, 9, 25, GREEN, 0.08, 0.86);
    radial(g, x, y, r, ang(9), RED, 0.05); radial(g, x, y, r, ang(25), RED, 0.05);
    scale(g, x, y, r, ang, 0, 30, 2, 10, { numR: 0.62, size: 0.18 });
    T('FUEL', x, y + r * 0.2, 32); T('PRESS PSI', x, y + r * 0.38, 20, '#cfcfc8', false);
  }
  // 7 — oil temperature (°F).
  {
    const { x, y, r } = cell(7);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(A.oilT(v));
    arc(g, x, y, r, ang, 100, 240, GREEN, 0.08, 0.86);
    radial(g, x, y, r, ang(240), RED, 0.05);
    scale(g, x, y, r, ang, 50, 250, 10, 50, { numR: 0.62, size: 0.16 });
    T('OIL', x, y + r * 0.2, 32); T('TEMP °F', x, y + r * 0.38, 20, '#cfcfc8', false);
  }
  // 8 — manifold pressure (in.Hg).
  {
    const { x, y, r } = cell(8);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(A.mp(v));
    arc(g, x, y, r, ang, 15, 25, GREEN, 0.075, 0.9);
    radial(g, x, y, r, ang(28.6), RED, 0.05);
    scale(g, x, y, r, ang, 10, 35, 1, 5, { numR: 0.66, size: 0.17 });
    T('MAN', x, y - r * 0.3, 28); T('PRESS', x, y - r * 0.17, 22); T('IN. HG', x, y + r * 0.3, 18, '#cfcfc8', false);
  }
  // 9 — tachometer, hundreds of rpm, green 2,100–2,700, red line 2,850,
  // the hour meter window.
  {
    const { x, y, r } = cell(9);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(A.rpm(v * 100));
    arc(g, x, y, r, ang, 21, 27, GREEN, 0.075, 0.9);
    arc(g, x, y, r, ang, 27, 28.5, YELLOW, 0.075, 0.9);
    radial(g, x, y, r, ang(28.5), RED, 0.055);
    scale(g, x, y, r, ang, 0, 35, 1, 5, { numR: 0.66, size: 0.19 });
    T('RPM', x, y - r * 0.32, 30); T('HUNDREDS', x, y - r * 0.19, 18, '#cfcfc8', false);
    g.fillStyle = '#000'; roundRect(g, x - r * 0.3, y + r * 0.27, r * 0.6, r * 0.16, 5); g.fill();
    T('HOURS', x, y + r * 0.52, 17, '#cfcfc8', false);
  }
  // 10 — oil pressure (psi).
  {
    const { x, y, r } = cell(10);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(A.oilP(v));
    arc(g, x, y, r, ang, 30, 60, GREEN, 0.08, 0.86);
    radial(g, x, y, r, ang(10), RED, 0.05); radial(g, x, y, r, ang(100), RED, 0.05);
    scale(g, x, y, r, ang, 0, 120, 10, 40, { numR: 0.62, size: 0.17 });
    T('OIL', x, y + r * 0.2, 32); T('PRESS PSI', x, y + r * 0.38, 20, '#cfcfc8', false);
  }
  // 11 — cylinder-head temperature (°F).
  {
    const { x, y, r } = cell(11);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(A.cht(v));
    arc(g, x, y, r, ang, 200, 460, GREEN, 0.08, 0.86);
    radial(g, x, y, r, ang(460), RED, 0.05);
    scale(g, x, y, r, ang, 100, 500, 20, 100, { numR: 0.62, size: 0.15 });
    T('CYL HEAD', x, y + r * 0.2, 28); T('TEMP °F', x, y + r * 0.38, 20, '#cfcfc8', false);
  }
  return c;
}

function drawGpsBezel() {
  const c = canvas(512, 384), g = c.getContext('2d');
  g.fillStyle = '#1a1c1f'; g.fillRect(0, 0, 512, 384);
  const r = rng(13);
  for (let i = 0; i < 4000; i++) { const v = r() < 0.5 ? 46 : 18; g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(r() * 512, r() * 384, 2, 2); }
  text(g, 'AGROWINGS', 120, 360, 22, '#7fd6ff');
  text(g, 'NAV', 210, 360, 22, '#e8eef2');
  return c;
}

function lcdFrame(g, w, h) {
  g.fillStyle = '#9aa58a'; g.fillRect(0, 0, w, h);
}

export function createA188Panel({ reg: reg0 = 'PR-AGT' } = {}) {
  let reg = reg0;
  const faceC = drawFace(reg);
  const face = canvasTexture(faceC, { aniso: 8 });
  const dog = canvasTexture(drawDogFace(), { aniso: 8 });
  const roll = canvasTexture(drawRoll(), { aniso: 8 });
  const dialC = drawDials({ vs0: 47, vs1: 53, vfe: 95, vne: 136 });
  const dials = canvasTexture(dialC, { aniso: 8 });
  const bezel = canvasTexture(drawGpsBezel(), { aniso: 4 });
  const mk = (w, h) => { const c = canvas(w, h); return { c, g: c.getContext('2d'), tex: canvasTexture(c, { aniso: 4 }), key: '' }; };
  const hobbs = mk(192, 48);
  const gps = createAgroNav({ home: { x: BASE.pad.x, z: BASE.pad.z, name: 'BASE · PÁTIO', label: 'PÁTIO DA BASE (SEM CONTRATO)' } });
  const redraw = (s, key, fn) => { if (key === s.key) return; s.key = key; fn(s.g); s.tex.needsUpdate = true; };
  let lastNow = performance.now(), hours = 0, vKey = '';
  void lcdFrame;
  const api = {
    face, dog, roll, dials, bezel, hobbs, gps,
    last: null,
    lit: {},
    get page() { return gps.page; },
    setPage: gps.setPage,
    nextPage: gps.nextPage,
    draw(d) {
      const now = performance.now(), dt = Math.min(0.5, (now - lastNow) / 1000);
      lastNow = now;
      api.last = d;
      const run = d.engine === 'running', crank = d.engine === 'cranking';
      const master = d.engine !== 'off';
      const vk = [d.vs0, d.vs1, d.vfe, d.vne].join();
      if (d.vne && vk !== vKey) { vKey = vk; const cc = drawDials(d); dialC.getContext('2d').drawImage(cc, 0, 0); dials.needsUpdate = true; }
      // Lamps: starter engaged, alternator not charging, oil pressure low,
      // fuel under 15 %, stall warning, spray valve open.
      api.lit = {
        start: crank, alt: master && !run, oil: master && (d.oilP ?? 0) < 15,
        fuel: master && d.fuel < (d.fuelCap ?? 204) * 0.15, stall: !!d.stall && !d.onGround, spray: master && !!d.spray,
      };
      if (run) hours += dt / 3600;
      redraw(hobbs, (hours * 10).toFixed(0), (g) => {
        g.fillStyle = '#060606'; g.fillRect(0, 0, 192, 48);
        const s = (hours % 10000).toFixed(1).padStart(6, '0');
        for (const [i, ch] of [...s.replace('.', '')].entries()) {
          const x = 8 + i * 35;
          g.fillStyle = i === 4 ? '#e8e8e0' : '#141414'; g.fillRect(x, 4, 30, 40);
          text(g, ch, x + 15, 25, 30, i === 4 ? '#111' : '#eee', false);
        }
      });
      gps.draw(d, dt, master);
    },
    setReg(r) { reg = r; const c = drawFace(reg); faceC.getContext('2d').drawImage(c, 0, 0); face.needsUpdate = true; },
  };
  return api;
}

export const toGph = (lph) => lph / 3.785;
export { C2F };
