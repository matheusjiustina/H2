// Piper PA-36-300 Pawnee Brave instrument panel: layout and textures, after
// the cockpit reference sent with Prompt 02 (the Brave's panel seen from the
// seat). Three tiers, as in the reference:
//   - the raised black instrument POD on top, narrower than the cabin: oil
//     temperature (*), airspeed, tachometer with its hour meter, manifold
//     pressure / fuel flow, the low-fuel-pressure lamp over the red
//     emergency fuel pump switch, fuel quantity; the compass in its own case
//     on the pod's right (pa36Cockpit.js);
//   - the black padded BAND under it, across the cabin, with the placards
//     (check list, speeds and alternate static, NO SMOKING, operating
//     limitations);
//   - the wide LOWER PANEL, wall to wall: the magneto and master rockers and
//     the clock on the left; the hopper sight window in the middle; the
//     engine gauge (oil pressure / cylinder-head temperature), the breakers,
//     the white rocker switches, PUSH START and the ammeter on the right; the
//     COM radio hangs under it.
// (*) The first dial's legend is not legible on the reference; its 0–150
// scale and its reading with the engine stopped (≈ 75) fit an oil
// temperature in °C, which is what it shows here (the flight model's own
// oil temperature).
// Dial faces are drawn once into an atlas; needles, the compass card, the
// switches and the sight-gauge level are 3D (pa36Cockpit.js). Every value
// comes from Aircraft.instruments() or the game's own state: nothing is
// computed here to fill a dial. The AGROWINGS NAV unit (agroNav.js) is the
// game's GPS, the same as in the other cockpits.
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp, rng } from '../core/math.js';
import { roundRect } from './panel.js';
import { screw, text, scale, radial } from './r44Panel.js';
import { createAgroNav } from './agroNav.js';
import { E203_ANG } from './e203Panel.js';
import { BASE } from '../world/layout.js';

const D2R = Math.PI / 180;
const KT_MPH = 1.15078;
const INK = '#f1f0ea', DIM = '#c9c9c1', GREEN = '#22a94a', YELLOW = '#f1c21b', RED = '#df2a1c', WHITE = '#f4f4f0';

// ------------------------------------------------------------------ layout
// All in metres. POD: its recessed face (u right, v up from the face's
// centre). BAND and LOWER: their own sheets (u right from the cabin's
// centre line, v up from the bottom edge).
export const PA36_PANEL = {
  pod: {
    // Outer box and the recessed face inside its thick rim.
    out: { w: 0.6, h: 0.165, d: 0.07, r: 0.024 },
    face: { w: 0.52, h: 0.118, recess: 0.022 }, W: 1536, H: 348,
    dials: {
      oilT: { u: -0.205, v: 0, r: 0.0415, f: 0.036, cell: 0 },
      asi: { u: -0.103, v: 0, r: 0.0415, f: 0.036, cell: 1 },
      rpm: { u: 0.0, v: 0, r: 0.0415, f: 0.036, cell: 2 },
      mp: { u: 0.1, v: 0, r: 0.0415, f: 0.036, cell: 3 },
      fuel: { u: 0.221, v: 0.003, r: 0.0295, f: 0.025, cell: 4 },
    },
    lamp: { u: 0.163, v: 0.034, r: 0.0062 },
    pump: { u: 0.163, v: -0.027, w: 0.024, h: 0.034 },
  },
  band: { w: 0.92, h: 0.2, W: 2048, H: 448 },
  lower: {
    w: 0.9, h: 0.12, W: 2048, H: 288,
    // Centre opening for the hopper sight window (u0..u1).
    gap: [-0.046, 0.058],
    dials: {
      clock: { u: -0.105, v: 0.06, r: 0.034, f: 0.03, cell: 5 },
      eng: { u: 0.13, v: 0.058, r: 0.04, f: 0.035, cell: 6 },
      amp: { u: 0.405, v: 0.04, r: 0.023, f: 0.02, cell: 7 },
    },
    mags: { v: 0.083, us: [-0.31, -0.284] },
    master: { v: 0.032, us: [-0.296, -0.272] },
    breakers: { v: 0.1, us: [0.178, 0.198, 0.218, 0.238, 0.258, 0.3, 0.32, 0.34, 0.36], amps: ['10', '30', '10', '5', '20', '20', '10', '5', '10'], caps: ['ALT', 'FLAPS', 'INST', 'STALL', 'FUEL\nPUMP', 'NAV', 'STROBE', 'COM', 'LAND'] },
    toggle: { u: 0.279, v: 0.1 },
    rockers: { v: 0.035, us: [0.19, 0.214, 0.238, 0.262, 0.31, 0.334], labels: ['FUEL\nPUMP', 'NAV', 'STROBE', 'LAND', 'AVION', 'BCN'] },
    breaker30: { u: 0.288, v: 0.035 },
    start: { u: 0.405, v: 0.096, r: 0.008 },
    radio: { u: 0.322, w: 0.165, h: 0.036, d: 0.11 },
  },
  // Hopper sight window (lower panel frame): the grey frame, the window.
  sight: { u: 0.006, w: 0.092, h: 0.136, win: { w: 0.066, h: 0.098 }, drop: 0.026 },
  // Compass in its own case on the pod's right (cockpit frame position).
  compass: { u: 0.36, r: 0.042, len: 0.095 },
  // AGROWINGS NAV on its bracket beside the pod's left: housing and screen.
  gps: { w: 0.124, h: 0.09, d: 0.04, screen: { w: 0.098, h: 0.0674 }, keysV: -0.038, keysU: [-0.039, -0.013, 0.013, 0.039] },
};
const P = PA36_PANEL;

// Dial angles (radians, clockwise from twelve o'clock as the pilot sees them).
export const PA36_ANG = {
  oilT: (c) => (-135 + (clamp(c, 0, 150) / 150) * 270) * D2R,
  asi: E203_ANG.asi,
  // Tachometer: 0 at six o'clock, 2,000 rpm at the top, 3,500 at half past four.
  rpm: (rpm) => (-180 + (clamp(rpm, 0, 3500) / 100) * 9) * D2R,
  mp: E203_ANG.mp,
  ff: E203_ANG.ff,
  fuel: (gal) => (-110 + (clamp(gal, 0, 86) / 86) * 220) * D2R,
  // Engine gauge: oil pressure over the upper half, cylinder-head
  // temperature over the lower half (left to right).
  oilP: (psi) => (-70 + (clamp(psi, 0, 120) / 120) * 140) * D2R,
  cht: (f) => (240 - ((clamp(f, 100, 500) - 100) / 400) * 120) * D2R,
  amp: (a) => (clamp(a, -30, 30) / 30) * 60 * D2R,
  hour: (h) => ((h % 12) / 12) * Math.PI * 2,
  min: (m) => ((m % 60) / 60) * Math.PI * 2,
};
export const C2F = (c) => c * 1.8 + 32;
export const toGph = (lph) => lph / 3.785;

// ------------------------------------------------------------------ textures
// Crinkle paint / leatherette: one small speckle tile (drawn once, ~1 ms) laid
// as a repeating pattern, instead of tens of thousands of single fills.
const tiles = new Map();
function speckTile(seed, lo, hi, alpha, dens) {
  const key = `${seed}|${lo}|${hi}|${alpha}|${dens}`;
  let t = tiles.get(key);
  if (!t) {
    t = canvas(128, 128);
    const g = t.getContext('2d'), r = rng(seed);
    for (let i = 0; i < 128 * 128 * dens; i++) { const v = r() < 0.5 ? hi : lo; g.fillStyle = `rgba(${v},${v},${v + 1},${alpha})`; g.fillRect(r() * 128, r() * 128, 1.5 + r() * 1.5, 1.5 + r() * 1.5); }
    tiles.set(key, t);
  }
  return t;
}
function crinkle(g, w, h, seed, base = '#17181a', lo = 8, hi = 46, alpha = 0.45, dens = 1 / 55) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  g.fillStyle = g.createPattern(speckTile(seed, lo, hi, alpha, dens), 'repeat');
  g.fillRect(0, 0, w, h);
}
const placard = (g, x, y, w, h, lines, { size = 13, title = true, align = 'center', inv = false } = {}) => {
  g.fillStyle = inv ? '#e8e7e0' : '#0d0d0e'; g.fillRect(x, y, w, h);
  g.strokeStyle = inv ? '#2a2b2d' : '#cfcfca'; g.lineWidth = 2; g.strokeRect(x + 2, y + 2, w - 4, h - 4);
  const col = inv ? '#141516' : '#e6e6df';
  const n = lines.length, step = (h - 14) / Math.max(1, n);
  lines.forEach((t, i) => {
    const yy = y + 7 + step * (i + 0.5);
    if (Array.isArray(t)) { text(g, t[0], x + 10, yy, size, col, false, 'left'); text(g, t[1], x + w - 10, yy, size, col, false, 'right'); } else text(g, t, align === 'left' ? x + 10 : x + w / 2, yy, title && i === 0 ? size + 1 : size, col, title && i === 0, align);
  });
};

// Pod face: black crinkle, the instruments' flange screws, the placards
// beside the lamp and the pump switch.
function drawPodFace() {
  const F = P.pod.face, s = P.pod.W / F.w, c = canvas(P.pod.W, P.pod.H), g = c.getContext('2d');
  const X = (u) => (u + F.w / 2) * s, Y = (v) => (F.h / 2 - v) * s;
  crinkle(g, P.pod.W, P.pod.H, 361);
  // Darker recess toward the rim (the rim shadows the face).
  const vg = g.createLinearGradient(0, 0, 0, P.pod.H);
  vg.addColorStop(0, 'rgba(0,0,0,0.45)'); vg.addColorStop(0.25, 'rgba(0,0,0,0)'); vg.addColorStop(0.85, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = vg; g.fillRect(0, 0, P.pod.W, P.pod.H);
  for (const d of Object.values(P.pod.dials)) {
    const x = X(d.u), y = Y(d.v) + 3, R = d.r * s;
    const sh = g.createRadialGradient(x, y, R * 0.92, x, y, R * 1.25);
    sh.addColorStop(0, 'rgba(0,0,0,0.75)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.beginPath(); g.arc(x, y, R * 1.25, 0, Math.PI * 2); g.fill();
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) screw(g, X(d.u + sx * d.r * 0.97), Y(d.v + sy * d.r * 0.97), 4.2);
  }
  // Face screws along the top and bottom.
  for (let u = -0.24; u <= 0.245; u += 0.06) for (const v of [0.05, -0.051]) screw(g, X(u), Y(v), 3.6);
  // Placard between the lamp and the switch; the one beside the switch.
  const L = P.pod.lamp, Sw = P.pod.pump;
  placard(g, X(L.u - 0.021), Y(L.v - 0.012), 0.042 * s, 0.022 * s, ['WHEN LIGHT IS ON', 'OIL PRESSURE OR', 'FUEL PRESSURE', 'IS LOW'], { size: 10, title: false });
  placard(g, X(Sw.u + 0.016), Y(Sw.v + 0.004), 0.062 * s, 0.021 * s, ['EMERGENCY FUEL PUMP', 'FOR TAKE-OFF AND LANDING', 'OR IF ENGINE DRIVEN', 'PUMP FAILS'], { size: 9.5, title: true });
  // The arrow from the placard to the switch.
  g.strokeStyle = '#d8d8d2'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(X(Sw.u + 0.016), Y(Sw.v - 0.004)); g.lineTo(X(Sw.u + 0.008), Y(Sw.v - 0.006)); g.stroke();
  return c;
}

// The padded band: black leatherette, its seams and the placards, as on
// the reference (all under the pod).
function drawBand() {
  const B = P.band, s = B.W / B.w, c = canvas(B.W, B.H), g = c.getContext('2d');
  const X = (u) => (u + B.w / 2) * s, Y = (v) => (B.h - v) * s;
  crinkle(g, B.W, B.H, 717, '#151618', 20, 46, 0.5, 1 / 6);
  // Light from above: a soft sheen on the upper part, darker at the foot.
  const sh = g.createLinearGradient(0, 0, 0, B.H);
  sh.addColorStop(0, 'rgba(255,255,255,0.05)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.0)'); sh.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = sh; g.fillRect(0, 0, B.W, B.H);
  // Seam stitching along the top and bottom, the corner screws.
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 3; g.setLineDash([7, 6]);
  for (const v of [0.012, B.h - 0.012]) { g.beginPath(); g.moveTo(X(-0.44), Y(v)); g.lineTo(X(0.44), Y(v)); g.stroke(); }
  g.setLineDash([]);
  for (const [u, v] of [[-0.41, 0.17], [0.41, 0.17], [-0.41, 0.03], [0.41, 0.03], [-0.29, 0.09], [0.31, 0.09]]) screw(g, X(u), Y(v), 6);
  // Placards (under the pod, as on the reference).
  placard(g, X(-0.268), Y(0.095), 0.15 * s, 0.075 * s, [
    'TAKE-OFF          CHECK LIST          LANDING', ['ENGINE GAGES ....... CHECKED', 'MIXTURE ...... RICH'], ['ALT. AIR ................ OFF', 'PROPELLER ..... SET'], ['MIXTURE ................. SET', 'FLAP ................ SET'],
    ['PROPELLER .............. SET', ''], ['TRIM .................... SET', ''], ['FLAP .................... SET', ''], ['CONTROLS ............ FREE', ''], ['DOORS ............... CLOSED', ''],
  ], { size: 12 });
  placard(g, X(-0.1), Y(0.095), 0.12 * s, 0.032 * s, ['MAXIMUM SPEED FOR RESTRICTED CATEGORY', 'OPERATION WITH 4400 LBS: 125 MPH (109 KNOTS)', 'MANEUVERING SPEED 115 MPH (100 KNOTS)'], { size: 11 });
  placard(g, X(-0.1), Y(0.058), 0.12 * s, 0.014 * s, ['DEMONSTRATED CROSSWIND 15 MPH'], { size: 11 });
  placard(g, X(-0.1), Y(0.04), 0.12 * s, 0.024 * s, ['ALTERNATE STATIC SOURCE', 'ALL CABIN VENTS OPEN · CABIN HEATER OFF', 'PULL KNOB TO OPEN'], { size: 11 });
  placard(g, X(0.035), Y(0.093), 0.07 * s, 0.012 * s, ['NO SMOKING'], { size: 13 });
  placard(g, X(0.115), Y(0.095), 0.2 * s, 0.05 * s, [
    'OPERATING LIMITATIONS', 'THIS AIRPLANE MUST BE OPERATED AS A NORMAL OR RESTRICTED CATEGORY',
    'AIRPLANE IN COMPLIANCE WITH THE OPERATING LIMITATIONS STATED IN THE FORM OF',
    'PLACARDS, MARKINGS AND MANUALS. NO ACROBATIC MANEUVERS, INCLUDING SPINS,',
    'APPROVED. THIS AIRPLANE APPROVED FOR VFR DAY OPERATIONS ONLY.',
  ], { size: 11 });
  return c;
}

// Lower panel: black crinkle, the frame lines, labels for every switch.
function drawLower(reg) {
  const L = P.lower, s = L.W / L.w, c = canvas(L.W, L.H), g = c.getContext('2d');
  const X = (u) => (u + L.w / 2) * s, Y = (v) => (L.h - v) * s;
  crinkle(g, L.W, L.H, 1971, '#1a1b1d');
  const lab = (t, u, v, sz = 13, col = '#e2e2dc', bold = true) => text(g, t, X(u), Y(v), sz, col, bold);
  // Frame lines (the reference's structural black outline) and screws.
  g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 4;
  g.strokeRect(X(-0.445), Y(L.h - 0.006), (P.lower.gap[0] + 0.445) * s, (L.h - 0.012) * s);
  g.strokeRect(X(P.lower.gap[1]), Y(L.h - 0.006), (0.445 - P.lower.gap[1]) * s, (L.h - 0.012) * s);
  for (const u of [-0.43, -0.2, -0.06, 0.072, 0.2, 0.43]) for (const v of [0.012, L.h - 0.012]) screw(g, X(u), Y(v), 6);
  for (const d of Object.values(L.dials)) {
    const x = X(d.u), y = Y(d.v) + 3, R = d.r * s;
    const shd = g.createRadialGradient(x, y, R * 0.92, x, y, R * 1.3);
    shd.addColorStop(0, 'rgba(0,0,0,0.7)'); shd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = shd; g.beginPath(); g.arc(x, y, R * 1.3, 0, Math.PI * 2); g.fill();
  }
  // Left: MAGS (vertical), LEFT / RIGHT; the master's BAT / ALT.
  ['M', 'A', 'G', 'S'].forEach((ch, i) => lab(ch, -0.334, 0.098 - i * 0.011, 13));
  lab('LEFT', L.mags.us[0], 0.06, 10); lab('RIGHT', L.mags.us[1], 0.06, 10);
  lab('BAT', L.master.us[0], 0.011, 10); lab('ALT', L.master.us[1], 0.011, 10);
  lab('MASTER', -0.284, 0.002 + 0.0, 9, '#c8c8c2');
  lab('CLOCK', P.lower.dials.clock.u, 0.012, 10, '#bdbdb6', false);
  // Right: breaker amps and captions, the rocker captions, start, ammeter.
  for (const [i, u] of L.breakers.us.entries()) { lab(L.breakers.amps[i], u, L.breakers.v + 0.013, 10); lab(L.breakers.caps[i], u, L.breakers.v - 0.017, 8.5, '#c8c8c2', false); }
  for (const [i, u] of L.rockers.us.entries()) lab(L.rockers.labels[i], u, L.rockers.v + 0.026, 8.5, '#c8c8c2', false);
  for (const u of L.rockers.us) lab('OFF', u, L.rockers.v - 0.022, 8.5, '#c8c8c2');
  lab('30', L.breaker30.u, L.breaker30.v + 0.013, 10);
  lab('PUSH START', L.start.u, L.start.v - 0.016, 9.5, '#e8b6b0');
  lab('AMPS', P.lower.dials.amp.u, 0.008, 9, '#bdbdb6', false);
  lab('ENGINE', P.lower.dials.eng.u, 0.008, 9, '#bdbdb6', false);
  // Registration plate at the lower left.
  g.fillStyle = '#0c0c0d'; roundRect(g, X(-0.43), Y(0.026), 0.07 * s, 0.016 * s, 4); g.fill();
  text(g, reg, X(-0.395), Y(0.018), 20, WHITE);
  return c;
}

// ---------------------------------------------------------------- dials
// Atlas 2048 x 1024: eight 512 px faces (0 oil temperature, 1 airspeed,
// 2 tachometer, 3 manifold pressure / fuel flow, 4 fuel quantity, 5 clock,
// 6 engine gauge, 7 ammeter).
export const PA36_ATLAS = { W: 2048, H: 1024, cell: 512, cols: 4, rows: 2 };
const canvasAng = (a) => a - Math.PI / 2;
function arc(g, x, y, r, ang, v0, v1, col, w, rr = 0.93) {
  const a0 = ang(v0), a1 = ang(v1);
  g.strokeStyle = col; g.lineWidth = r * w;
  g.beginPath(); g.arc(x, y, r * rr, Math.min(a0, a1), Math.max(a0, a1)); g.stroke();
}
function faceBase(g, x, y, r) {
  const gr = g.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.1, x, y, r);
  gr.addColorStop(0, '#1e2124'); gr.addColorStop(1, '#08090a');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}
function drawDials(V) {
  const c = canvas(PA36_ATLAS.W, PA36_ATLAS.H), g = c.getContext('2d');
  g.fillStyle = '#060707'; g.fillRect(0, 0, c.width, c.height);
  const cell = (i) => ({ x: (i % 4) * 512 + 256, y: Math.floor(i / 4) * 512 + 256, r: 250 });
  const A = PA36_ANG;
  const T = (t, x, y, s, col = INK, bold = true) => text(g, t, x, y, s, col, bold);
  // 0 — oil temperature, °C (0–150, green 60–118, red line 118).
  {
    const { x, y, r } = cell(0);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(A.oilT(v));
    arc(g, x, y, r, ang, 60, 118, GREEN, 0.075, 0.9);
    radial(g, x, y, r, ang(118), RED, 0.055);
    scale(g, x, y, r, ang, 0, 150, 5, 25, { numR: 0.66, size: 0.17 });
    T('OIL TEMP', x, y + r * 0.34, 24, DIM, false); T('°C', x + r * 0.42, y + r * 0.62, 22, DIM, false);
  }
  // 1 — airspeed: MPH outside, knots inside (as on the reference).
  {
    const { x, y, r } = cell(1);
    faceBase(g, x, y, r);
    const ang = (mph) => canvasAng(A.asi(mph / KT_MPH));
    const kt = (k) => k * KT_MPH;
    const vno = V.vne * 0.8;
    arc(g, x, y, r, ang, kt(V.vs0), kt(V.vfe), WHITE, 0.055, 0.8);
    arc(g, x, y, r, ang, kt(V.vs1), kt(vno), GREEN, 0.06, 0.885);
    arc(g, x, y, r, ang, kt(vno), kt(V.vne), YELLOW, 0.06, 0.885);
    radial(g, x, y, r, ang(kt(V.vne)), RED, 0.05);
    scale(g, x, y, r, ang, 40, 200, 5, 20, { numR: 0.67, size: 0.15 });
    for (let k = 40; k <= 170; k += 10) {
      const a = ang(kt(k));
      g.strokeStyle = '#d9c86a'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.44, y + Math.sin(a) * r * 0.44); g.lineTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5); g.stroke();
      if (k % 20 === 0) T(String(k), x + Math.cos(a) * r * 0.36, y + Math.sin(a) * r * 0.36, 20, '#d9c86a', false);
    }
    T('AIRSPEED', x, y - r * 0.12, 26, YELLOW); T('MPH', x, y + r * 0.13, 20, DIM, false); T('KNOTS', x, y + r * 0.24, 15, '#a99f5a', false);
  }
  // 2 — tachometer, hundreds of rpm (0 at six o'clock), green 2,200–2,700,
  // red line 2,700; the hour meter window.
  {
    const { x, y, r } = cell(2);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(A.rpm(v * 100));
    arc(g, x, y, r, ang, 22, 27, GREEN, 0.075, 0.9);
    radial(g, x, y, r, ang(27), RED, 0.06);
    scale(g, x, y, r, ang, 0, 35, 1, 5, { numR: 0.66, size: 0.2 });
    T('RPM', x, y - r * 0.3, 26); T('X 100', x, y - r * 0.17, 17, DIM, false);
    g.fillStyle = '#000'; roundRect(g, x - r * 0.33, y + r * 0.2, r * 0.66, r * 0.17, 5); g.fill();
    T('HOURS', x, y + r * 0.46, 15, DIM, false);
  }
  // 3 — manifold pressure (left, in.Hg) / fuel flow (right, gal/h).
  {
    const { x, y, r } = cell(3);
    faceBase(g, x, y, r);
    const angM = (v) => canvasAng(A.mp(v)), angF = (v) => canvasAng(A.ff(v));
    arc(g, x, y, r, angM, 15, 28, GREEN, 0.075, 0.9);
    radial(g, x, y, r, angM(28.6), RED, 0.05);
    scale(g, x, y, r, angM, 10, 35, 1, 5, { numR: 0.68, size: 0.15 });
    arc(g, x, y, r, angF, 8, 28, GREEN, 0.075, 0.9);
    radial(g, x, y, r, angF(30), RED, 0.05);
    scale(g, x, y, r, angF, 0, 35, 1, 5, { numR: 0.68, size: 0.15 });
    T('MAN', x - r * 0.33, y - r * 0.12, 20); T('PRESS', x - r * 0.33, y + r * 0.02, 20); T('IN. HG', x - r * 0.33, y + r * 0.15, 13, DIM, false);
    T('FUEL', x + r * 0.33, y - r * 0.12, 20); T('FLOW', x + r * 0.33, y + r * 0.02, 20); T('GAL/HR', x + r * 0.33, y + r * 0.15, 13, DIM, false);
  }
  // 4 — fuel quantity, gallons (E–F), 86 usable.
  {
    const { x, y, r } = cell(4);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(A.fuel(v));
    arc(g, x, y, r, ang, 0, 8, RED, 0.08, 0.86);
    scale(g, x, y, r, ang, 0, 86, 4.3, 21.5, { numR: 0.63, size: 0.17, num: (v) => (v === 0 ? 'E' : v > 85 ? 'F' : String(Math.round(v / 21.5) * 20)) });
    T('FUEL', x, y + r * 0.2, 34); T('GALS', x, y + r * 0.42, 28, DIM, false);
  }
  // 5 — clock (twelve hours).
  {
    const { x, y, r } = cell(5);
    faceBase(g, x, y, r);
    for (let k = 0; k < 60; k++) {
      const a = canvasAng((k / 60) * Math.PI * 2), maj = k % 5 === 0;
      g.strokeStyle = INK; g.lineWidth = maj ? 9 : 3;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * (maj ? 0.8 : 0.88), y + Math.sin(a) * r * (maj ? 0.8 : 0.88)); g.lineTo(x + Math.cos(a) * r * 0.97, y + Math.sin(a) * r * 0.97); g.stroke();
    }
    for (let h = 1; h <= 12; h++) { const a = canvasAng((h / 12) * Math.PI * 2); T(String(h), x + Math.cos(a) * r * 0.64, y + Math.sin(a) * r * 0.64, 54); }
  }
  // 6 — engine gauge: oil pressure (upper, psi, green 60–90) and cylinder-
  // head temperature (lower, °F, green 200–475).
  {
    const { x, y, r } = cell(6);
    faceBase(g, x, y, r);
    const angP = (v) => canvasAng(A.oilP(v)), angT = (v) => canvasAng(A.cht(v));
    arc(g, x, y, r, angP, 60, 90, GREEN, 0.075, 0.9);
    radial(g, x, y, r, angP(25), RED, 0.05); radial(g, x, y, r, angP(100), RED, 0.05);
    scale(g, x, y, r, angP, 0, 120, 10, 40, { numR: 0.68, size: 0.15 });
    arc(g, x, y, r, angT, 200, 475, GREEN, 0.075, 0.9);
    radial(g, x, y, r, angT(500), RED, 0.05);
    scale(g, x, y, r, angT, 100, 500, 25, 100, { numR: 0.68, size: 0.14 });
    T('OIL', x, y - r * 0.36, 22); T('PSI', x, y - r * 0.22, 20, DIM, false);
    T('CYL HEAD', x, y + r * 0.22, 19); T('TEMP °F', x, y + r * 0.36, 17, DIM, false);
  }
  // 7 — ammeter (centre zero).
  {
    const { x, y, r } = cell(7);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(A.amp(v));
    scale(g, x, y, r, ang, -30, 30, 5, 15, { numR: 0.6, size: 0.19, num: (v) => (v === 0 ? '0' : v > 0 ? `+${v}` : String(v)) });
    T('AMPS', x, y + r * 0.34, 36, DIM, false);
  }
  return c;
}

// Compass card: the band of headings seen through the case's window.
function drawCompassCard() {
  const W = 1024, H = 128, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#0d0e0f'; g.fillRect(0, 0, W, H);
  for (let d = 0; d < 360; d += 5) {
    const x = (1 - d / 360) * W, maj = d % 30 === 0; // figures increase to the left
    g.strokeStyle = '#ecebe4'; g.lineWidth = maj ? 3 : 1.6;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, maj ? 34 : d % 10 === 0 ? 26 : 18); g.stroke();
    if (maj) {
      const lab = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] ?? String(d / 10);
      text(g, lab, x, 72, lab.length > 1 ? 40 : 50, '#ecebe4', true);
    }
  }
  return c;
}

function drawGpsBezel() {
  const c = canvas(512, 384), g = c.getContext('2d');
  g.fillStyle = '#1a1c1f'; g.fillRect(0, 0, 512, 384);
  const r = rng(13);
  for (let i = 0; i < 4000; i++) { const v = r() < 0.5 ? 46 : 18; g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(r() * 512, r() * 384, 2, 2); }
  text(g, 'AGROWINGS', 196, 22, 24, '#7fd6ff');
  text(g, 'NAV', 300, 22, 24, '#e8eef2');
  return c;
}

// Sight window: the hopper's inside (painted wall, the product line drawn
// in 3D by its level).
function drawHopperWall() {
  const c = canvas(128, 256), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#3c3a2c'); gr.addColorStop(1, '#23221a');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 256);
  const r = rng(5);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '220,200,90' : '20,18,10'},${0.05 + r() * 0.1})`; g.fillRect(r() * 128, r() * 256, 2, 2); }
  return c;
}

export function createPA36Panel({ reg: reg0 = 'PR-PWB' } = {}) {
  let reg = reg0;
  const pod = canvasTexture(drawPodFace(), { aniso: 8 });
  const band = canvasTexture(drawBand(), { aniso: 8 });
  const lowerC = drawLower(reg);
  const lower = canvasTexture(lowerC, { aniso: 8 });
  const dialC = drawDials({ vs0: 50, vs1: 60, vfe: 90, vne: 139 });
  const dials = canvasTexture(dialC, { aniso: 8 });
  const card = canvasTexture(drawCompassCard(), { aniso: 4, repeat: true });
  const bezel = canvasTexture(drawGpsBezel(), { aniso: 4 });
  const hopperWall = canvasTexture(drawHopperWall(), { aniso: 2 });
  const mk = (w, h) => { const c = canvas(w, h); return { c, g: c.getContext('2d'), tex: canvasTexture(c, { aniso: 4 }), key: '' }; };
  const hobbs = mk(192, 48), radio = mk(256, 48);
  const gps = createAgroNav({ home: { x: BASE.pad.x, z: BASE.pad.z, name: 'BASE · PÁTIO', label: 'PÁTIO DA BASE (SEM CONTRATO)' } });
  const redraw = (s, key, fn) => { if (key === s.key) return; s.key = key; fn(s.g); s.tex.needsUpdate = true; };
  let lastNow = performance.now(), hours = 1288.4, vKey = '';
  const api = {
    pod, band, lower, dials, card, bezel, hopperWall, hobbs, radio, gps,
    texture: null, // (the old flat panel: none)
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
      // Lamp: oil or fuel pressure low (engine stopped with the master on,
      // or the flight model's oil pressure under 25 psi while running).
      api.lit = { press: master && (!run || (d.oilP ?? 0) < 25), start: crank };
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
      // COM radio: its window lit with the master on (the active / standby
      // frequencies shown on the reference; no radio is simulated).
      redraw(radio, master ? 'on' : 'off', (g) => {
        g.fillStyle = master ? '#132015' : '#0b0c0b'; g.fillRect(0, 0, 256, 48);
        if (master) { text(g, '126.90', 66, 25, 30, '#9cf2a2', false); text(g, '128.25', 188, 25, 30, '#9cf2a2', false); text(g, 'COM', 128, 10, 10, '#6fae73', false); }
      });
      gps.draw(d, dt, master);
    },
    setReg(r) { reg = r; const c = drawLower(reg); lowerC.getContext('2d').drawImage(c, 0, 0); lower.needsUpdate = true; },
  };
  return api;
}
