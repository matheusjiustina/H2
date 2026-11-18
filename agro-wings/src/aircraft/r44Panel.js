// R44 Raven II instruments, laid out after cockpit photographs of the type
// (the frontal panel photo is the reference for every position): the
// moulded pod with its two rows of 3-1/8" instruments — a blank cap with the
// R44 logo, altimeter, attitude, airspeed and the dual engine / rotor
// tachometer on top; vertical speed, directional gyro, turn coordinator and
// manifold pressure below, offset half a pitch — with four warning lamps
// either side of the centre above them and the FULL THROTTLE lamp at the
// right; the pedestal with its lamp row, hour meter and clock, the engine
// gauge cluster, the fuel gauges, the switch row (nav lights, strobe, the
// guarded clutch switch, alternator, master battery), the magneto key and
// mixture, and the avionics stack (audio panel, the GPS showing the game's
// guidance, transponder, COM). An agricultural fit adds the spray-tank
// gauge in the auxiliary-fuel window and the pump / valve switches.
//
// Positions are in metres on the pod face (x right, y up from the face
// centre), measured on the photograph (0.00091 m per pixel at half size,
// from the 3-1/8" instrument cases); the canvas maps those metres to pixels.
// Static faces are drawn once; needles, the attitude ball, the heading card,
// the turn-coordinator symbol and ball, and the lamps are 3D parts moved
// every frame (r44Cockpit.js). Only the GPS screen is a live canvas.
import { canvas, canvasTexture } from '../core/textures.js';
import { rng } from '../core/math.js';
import { gps, roundRect } from './panel.js';

const D2R = Math.PI / 180;

// Pod face canvas: 0.62 × 0.30 m (outer outline included).
export const POD = { W: 1024, H: 496, w: 0.62 };
POD.s = POD.w / POD.W; POD.h = POD.H * POD.s;
const mx = (x) => x / POD.s + POD.W / 2; // metres -> canvas px
const my = (y) => POD.H / 2 - y / POD.s;
// Outer outline of the pod (metres, right half from the top centre round to
// the bottom centre), traced on the frontal Raven II photo: a broad, slightly
// domed top, large rounded ears standing out at the upper corners, the sides
// drawn in steeply below the ears to a bottom about two thirds as wide that
// sits on the pedestal.
const POD_HALF = [
  [0, 0.144], [0.1, 0.1425], [0.19, 0.138], [0.245, 0.131], [0.282, 0.118], [0.303, 0.098],
  [0.311, 0.072], [0.305, 0.042], [0.29, 0.006], [0.266, -0.04], [0.238, -0.083],
  [0.211, -0.117], [0.188, -0.138], [0.158, -0.146], [0.08, -0.147], [0, -0.147],
];
// Closed outline as points (counter-clockwise), optionally inset (the face
// inside the moulded rim: insets at the top, the sides and the bottom).
export function podOutline(ins = null, n = 96) {
  // Clockwise from the top centre: right side down, left side back up.
  const loop = [...POD_HALF, ...POD_HALF.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
  // Smooth closed Catmull-Rom through the traced points.
  const m = loop.length, out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * m, k = Math.floor(t), f = t - k;
    const P = (j) => loop[((k + j) % m + m) % m];
    const [a, b, c, d] = [P(-1), P(0), P(1), P(2)];
    const cr = (q) => 0.5 * (2 * b[q] + (-a[q] + c[q]) * f + (2 * a[q] - 5 * b[q] + 4 * c[q] - d[q]) * f * f + (-a[q] + 3 * b[q] - 3 * c[q] + d[q]) * f * f * f);
    out.push([cr(0), cr(1)]);
  }
  if (ins) {
    // Inward normal of a clockwise loop; inset blended by the normal's slope.
    const res = out.map((p, i) => {
      const a = out[(i - 1 + n) % n], b = out[(i + 1) % n];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const nx = -ty, ny = tx; // outward for a clockwise loop
      const d = ny > 0 ? ins.side + (ins.top - ins.side) * ny : ins.side + (ins.bot - ins.side) * -ny;
      return [p[0] - nx * d, p[1] - ny * d];
    });
    return res.reverse();
  }
  return out.reverse();
}
export const POD_OUT = { top: 0.144, bot: -0.147, wTop: 0.311 };
// Recessed face inside the moulded rim (insets: top, side, bottom).
export const POD_IN = { top: 0.026, side: 0.024, bot: 0.012 };
const R_CASE = 0.041; // bezel radius of a 3-1/8" instrument
// Instruments [x, y] in metres; r = bezel radius. The rows follow the photo.
export const POD_G = {
  blank: { x: -0.178, y: 0.009, r: R_CASE },
  alt: { x: -0.089, y: 0.009, r: R_CASE },
  att: { x: 0, y: 0.009, r: R_CASE },
  asi: { x: 0.0895, y: 0.009, r: R_CASE },
  tach: { x: 0.179, y: 0.009, r: R_CASE },
  vsi: { x: -0.131, y: -0.0774, r: R_CASE },
  dg: { x: -0.0437, y: -0.0774, r: R_CASE },
  tc: { x: 0.0437, y: -0.0774, r: R_CASE },
  map: { x: 0.131, y: -0.0774, r: R_CASE },
};
export const DIAL = 0.88; // dial radius / bezel radius
export const ANG = {
  // VSI: 0 at 9 o'clock, climb clockwise over the top, ±2,000 ft/min.
  vsi: (fpm) => { const v = Math.max(-2000, Math.min(2000, fpm)) / 2000; return (180 + v * 170) * D2R; },
  asi: (kt) => (-90 + (Math.max(0, Math.min(150, kt)) / 150) * 330) * D2R, // knots, 0 at 12 o'clock
  tach: (pct) => (90 + (Math.max(0, Math.min(115, pct)) / 115) * 240) * D2R, // % rpm
  map: (v) => (135 + ((Math.max(10, Math.min(35, v)) - 10) / 25) * 270) * D2R, // in Hg
  altHund: (ft) => (-90 + (((ft % 1000) + 1000) % 1000) * 0.36) * D2R,
  altThou: (ft) => (-90 + (((ft % 10000) + 10000) % 10000) * 0.036) * D2R,
  altTenThou: (ft) => (-90 + Math.max(0, ft) * 0.0036) * D2R,
  small: (v0, v1) => (v) => (150 + ((Math.max(v0, Math.min(v1, v)) - v0) / (v1 - v0)) * 240) * D2R,
};
// Warning lamps: four left of centre, four right (as on the panel), and
// FULL THROTTLE at the right of the lower row. [label, colour, state key].
export const POD_LAMPS = [
  ...[['CLUTCH', 'a', 'clutch'], ['MR\nTEMP', 'r', null], ['MR\nCHIP', 'r', null], ['CARBON\nMONOXIDE', 'r', null]].map(([label, col, key], i) => ({ label, col, key, x: -0.093 + i * 0.02, y: 0.0883 })),
  ...[['STARTER\nON', 'r', 'starter'], ['TR\nCHIP', 'r', null], ['LOW\nFUEL', 'r', 'lowFuel'], ['LOW\nRPM', 'r', 'lowRpm']].map(([label, col, key], i) => ({ label, col, key, x: 0.03 + i * 0.0207, y: 0.0883 })),
  { label: 'FULL\nTHROTTLE', col: 'a', key: 'fullThrottle', x: 0.19, y: -0.057 },
];
export const LAMP_R = 0.0062;

// Pedestal face: 0.22 m wide, 0.57 m tall (canvas px, origin top-left).
export const CON = { W: 512, H: 1320, w: 0.22 };
CON.s = CON.w / CON.W; CON.h = CON.H * CON.s;
export const CON_LAMPS = [['FUEL\nFILTER', 'a', null], ['AUX FUEL\nPUMP', 'a', null], ['ALT', 'a', 'alt'], ['ENG\nFIRE', 'r', null], ['OIL', 'r', 'oil'], ['GOV\nOFF', 'a', 'govOff']]
  .map(([label, col, key], i) => ({ label, col, key, x: 196 + i * 50, y: 34 }))
  .concat([{ label: 'BRAKE', col: 'a', key: 'rotorBrake', x: 148, y: 470 }, { label: 'SPRAY', col: 'g', key: 'spray', x: 454, y: 700 }]);
// Engine cluster (2 × 2 small gauges on one plate) and the two fuel-type
// gauges below it (the agricultural spray tank in the aux-fuel window).
export const CON_G = {
  oilT: { x: 278, y: 128, r: 34, v: [50, 250], label: 'OIL °F' },
  oilP: { x: 418, y: 128, r: 34, v: [0, 100], label: 'OIL PSI' },
  cht: { x: 278, y: 218, r: 34, v: [200, 550], label: 'CYL °F' },
  amps: { x: 418, y: 218, r: 34, v: [-60, 60], label: 'AMPS' },
  tank: { x: 348, y: 352, r: 42, v: [0, 250], label: 'SPRAY TANK L', wide: true },
  fuel: { x: 348, y: 448, r: 42, v: [0, 180], label: 'FUEL L', wide: true },
};
export const CON_CLOCK = { hours: { x: 110, y: 128, r: 52 }, clock: { x: 110, y: 290, r: 58 } };
// Switches [key, x, y, label, red, guard]; knobs [x, y, r].
export const CON_SW = [
  ['nav', 64, 600, 'NAV LTS'], ['strobe', 128, 600, 'STROBE'], ['clutch', 206, 600, 'CLUTCH', true, true],
  ['alt', 300, 600, 'ALT'], ['batt', 364, 600, 'MASTER\nBATTERY', true],
  ['pump', 330, 712, 'PUMP'], ['valve', 394, 712, 'VALVE'],
];
export const CON_KEY = { x: 448, y: 598 };
export const CON_KNOBS = [[70, 470, 0.009], [70, 712, 0.0085], [214, 712, 0.0095]];
export const CON_GPS = { x: 30, y: 868, w: 452, h: 248 };
export const CON_RADIO = [{ y: 790, h: 60, label: 'AUDIO' }, { y: 1134, h: 70, label: 'XPDR', lcd: 'ALT 7000' }, { y: 1218, h: 82, label: 'COM', lcd: '120.525', lcd2: 'STBY 124.850' }];

// --------------------------------------------------------------- drawing
const ink = '#ecebe5', inkDim = '#a9aba6';

function speckle(g, w, h, seed, base) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < (w * h) / 90; i++) {
    const v = r() < 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${0.012 + r() * 0.02})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

function screw(g, x, y, s = 5) {
  const gr = g.createRadialGradient(x - s * 0.3, y - s * 0.3, 0, x, y, s);
  gr.addColorStop(0, '#7d838a'); gr.addColorStop(1, '#2e3238');
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#15171a'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(x - s * 0.7, y - s * 0.2); g.lineTo(x + s * 0.7, y + s * 0.2); g.stroke();
}

function text(g, t, x, y, size, col = ink, bold = true, align = 'center') {
  g.fillStyle = col;
  g.font = `${bold ? 'bold ' : ''}${size}px "Arial Narrow", Arial, sans-serif`;
  g.textAlign = align; g.textBaseline = 'middle';
  const lines = String(t).split('\n');
  lines.forEach((l, i) => g.fillText(l, x, y + (i - (lines.length - 1) / 2) * size * 1.05));
}

// Dial background (matte black with a faint radial sheen) — the case and
// bezel are 3D.
function dial(g, x, y, r) {
  const gr = g.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
  gr.addColorStop(0, '#24272b'); gr.addColorStop(1, '#0a0b0c');
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}

function scale(g, x, y, r, ang, v0, v1, minor, major, { num = (v) => v, numR = 0.66, size = 0.17, skip = () => false } = {}) {
  for (let v = v0; v <= v1 + 1e-6; v += minor) {
    if (skip(v)) continue;
    const a = ang(v), isMaj = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    g.strokeStyle = ink; g.lineWidth = isMaj ? r * 0.045 : r * 0.024;
    const r0 = r * (isMaj ? 0.8 : 0.87);
    g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r * 0.97, y + Math.sin(a) * r * 0.97); g.stroke();
    if (isMaj && num(v) !== null) text(g, num(v), x + Math.cos(a) * r * numR, y + Math.sin(a) * r * numR, Math.round(r * size));
  }
}

function arc(g, x, y, r, ang, v0, v1, col, w, rr = 0.93) {
  g.strokeStyle = col; g.lineWidth = r * w;
  g.beginPath(); g.arc(x, y, r * rr, ang(v0), ang(v1)); g.stroke();
}

function radial(g, x, y, r, a, col, w = 0.05) {
  g.strokeStyle = col; g.lineWidth = r * w;
  g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78); g.lineTo(x + Math.cos(a) * r * 0.99, y + Math.sin(a) * r * 0.99); g.stroke();
}

function drawPod(g, reg) {
  speckle(g, POD.W, POD.H, 91, '#1b1d20');
  // Soft shading toward the moulded rim.
  const vg = g.createRadialGradient(POD.W / 2, POD.H * 0.5, POD.H * 0.25, POD.W / 2, POD.H * 0.5, POD.W * 0.6);
  vg.addColorStop(0, 'rgba(255,255,255,0.025)'); vg.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = vg; g.fillRect(0, 0, POD.W, POD.H);
  const G = Object.fromEntries(Object.entries(POD_G).map(([k, o]) => [k, { x: mx(o.x), y: my(o.y), r: (o.r * DIAL) / POD.s, R: o.r / POD.s }]));
  // Shadow ring round every instrument case (where the case meets the face).
  for (const o of Object.values(G)) {
    const sh = g.createRadialGradient(o.x, o.y + 3, o.R * 0.95, o.x, o.y + 3, o.R * 1.25);
    sh.addColorStop(0, 'rgba(0,0,0,0.55)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.beginPath(); g.arc(o.x, o.y + 3, o.R * 1.25, 0, Math.PI * 2); g.fill();
  }
  // Lamp labels (the lamps are 3D).
  for (const l of POD_LAMPS) text(g, l.label, mx(l.x), my(l.y) - (l.y > 0 ? -24 : -26), 8.5, '#c9cbc6');
  // Blank cap with the R44 logo.
  { const { x, y, r } = G.blank; g.fillStyle = '#141517'; g.beginPath(); g.arc(x, y, r * 1.08, 0, Math.PI * 2); g.fill(); g.save(); g.translate(x, y); g.transform(1, 0, -0.18, 1, 0, 0); text(g, 'R44', 0, 2, r * 0.62, '#2c2f33'); g.restore(); }
  // Altimeter: 0–9 dial, Kollsman window.
  {
    const { x, y, r } = G.alt;
    dial(g, x, y, r);
    const ang = (v) => (-90 + v * 36) * D2R;
    for (let v = 0; v < 10; v += 0.2) {
      const a = ang(v), maj = Math.abs(v - Math.round(v)) < 1e-6;
      g.strokeStyle = ink; g.lineWidth = maj ? r * 0.045 : r * 0.022;
      const r0 = r * (maj ? 0.8 : 0.88);
      g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r * 0.97, y + Math.sin(a) * r * 0.97); g.stroke();
      if (maj) text(g, String(Math.round(v)), x + Math.cos(a) * r * 0.64, y + Math.sin(a) * r * 0.64, r * 0.24);
    }
    g.fillStyle = '#050606'; g.fillRect(x + r * 0.26, y - r * 0.12, r * 0.42, r * 0.24);
    text(g, '29.92', x + r * 0.47, y, r * 0.13, ink, false);
    text(g, 'ALT', x - r * 0.3, y - r * 0.28, r * 0.15, ink);
    text(g, '100 FEET', x, y + r * 0.42, r * 0.09, inkDim);
  }
  // Attitude: case only (ball and overlay are 3D).
  { const { x, y, r } = G.att; g.fillStyle = '#101214'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  // Airspeed: knots outside, MPH inside; green 20–110, yellow to 130, red line.
  {
    const { x, y, r } = G.asi, ang = ANG.asi;
    dial(g, x, y, r);
    arc(g, x, y, r, ang, 20, 110, '#36b24a', 0.08);
    arc(g, x, y, r, ang, 110, 130, '#f0c020', 0.08);
    radial(g, x, y, r, ang(130), '#d8301f', 0.07);
    scale(g, x, y, r, ang, 0, 150, 5, 10, { num: (v) => (v % 20 === 0 && v > 0 ? v : null), numR: 0.66, size: 0.17, skip: (v) => v < 20 });
    for (let m = 40; m <= 160; m += 20) { const a = ang(m / 1.15078); text(g, String(m), x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42, r * 0.1, inkDim, false); }
    text(g, 'KNOTS', x, y - r * 0.2, r * 0.11, ink);
    text(g, 'AIRSPEED', x, y + r * 0.22, r * 0.09, inkDim);
    text(g, 'MPH', x, y + r * 0.36, r * 0.09, inkDim);
  }
  // Dual tachometer: rotor (R, left needle) and engine (E, right needle).
  {
    const { x, y, r } = G.tach, ang = ANG.tach;
    dial(g, x, y, r);
    arc(g, x, y, r, ang, 90, 108, '#36b24a', 0.075, 0.95);
    arc(g, x, y, r, ang, 108, 110, '#d8301f', 0.075, 0.95);
    arc(g, x, y, r, ang, 80, 90, '#f0c020', 0.075, 0.95);
    arc(g, x, y, r, ang, 101, 102, '#36b24a', 0.09, 0.72);
    radial(g, x, y, r, ang(102), '#d8301f', 0.05);
    scale(g, x, y, r, ang, 0, 110, 5, 10, { num: (v) => (v >= 50 && v % 10 === 0 ? v : null), numR: 0.62, size: 0.14 });
    text(g, 'E', x - r * 0.3, y - r * 0.55, r * 0.2, ink);
    text(g, 'R', x + r * 0.3, y - r * 0.55, r * 0.2, ink);
    text(g, '% RPM', x, y + r * 0.6, r * 0.11, inkDim);
  }
  // Vertical speed.
  {
    const { x, y, r } = G.vsi;
    dial(g, x, y, r);
    const ang = (v) => ANG.vsi(v * 100);
    for (let v = -20; v <= 20; v += 1) {
      const a = ang(v), maj = v % 5 === 0;
      g.strokeStyle = ink; g.lineWidth = maj ? r * 0.045 : r * 0.022;
      const r0 = r * (maj ? 0.8 : 0.87);
      g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r * 0.97, y + Math.sin(a) * r * 0.97); g.stroke();
      if (maj && Math.abs(v) !== 20) text(g, String(Math.abs(v)), x + Math.cos(a) * r * 0.64, y + Math.sin(a) * r * 0.64, r * 0.22);
    }
    text(g, 'UP', x - r * 0.42, y - r * 0.3, r * 0.12);
    text(g, 'DOWN', x - r * 0.4, y + r * 0.3, r * 0.11);
    text(g, 'VERTICAL SPEED', x + r * 0.12, y - r * 0.16, r * 0.1, inkDim);
    text(g, '100 FEET PER MINUTE', x + r * 0.12, y + r * 0.14, r * 0.08, inkDim);
  }
  // Directional gyro: case only (card and overlay are 3D); heading-bug knob.
  { const { x, y, r } = G.dg; g.fillStyle = '#0c0d0f'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  // Turn coordinator: rate marks, labels and the inclinometer tube (the
  // aircraft symbol and the ball are 3D).
  {
    const { x, y, r } = G.tc;
    dial(g, x, y, r);
    g.strokeStyle = ink; g.lineWidth = r * 0.06;
    for (const s of [-1, 1]) for (const a of [0, 0.35]) {
      const t = s > 0 ? a : Math.PI - a;
      g.beginPath(); g.moveTo(x + Math.cos(t) * r * 0.74, y + Math.sin(t) * r * 0.74); g.lineTo(x + Math.cos(t) * r * 0.94, y + Math.sin(t) * r * 0.94); g.stroke();
    }
    text(g, 'L', x - r * 0.72, y + r * 0.5, r * 0.16); text(g, 'R', x + r * 0.72, y + r * 0.5, r * 0.16);
    text(g, 'D.C.\nELEC.', x, y - r * 0.6, r * 0.08, inkDim);
    text(g, 'TURN COORDINATOR', x, y + r * 0.12, r * 0.075, inkDim);
    text(g, '2 MIN.', x, y + r * 0.56, r * 0.1, ink);
    text(g, 'NO PITCH\nINFORMATION', x, y + r * 0.76, r * 0.07, inkDim);
    g.fillStyle = '#d9d3c0'; roundRect(g, x - r * 0.42, y + r * 0.2, r * 0.84, r * 0.2, r * 0.1); g.fill();
    g.strokeStyle = '#222'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x - r * 0.1, y + r * 0.2); g.lineTo(x - r * 0.1, y + r * 0.4); g.moveTo(x + r * 0.1, y + r * 0.2); g.lineTo(x + r * 0.1, y + r * 0.4); g.stroke();
  }
  // Manifold pressure.
  {
    const { x, y, r } = G.map, ang = ANG.map;
    dial(g, x, y, r);
    arc(g, x, y, r, ang, 10, 21.6, '#36b24a', 0.08);
    arc(g, x, y, r, ang, 21.6, 25.1, '#f0c020', 0.08);
    radial(g, x, y, r, ang(25.1), '#d8301f', 0.06);
    scale(g, x, y, r, ang, 10, 35, 1, 5, { numR: 0.64, size: 0.2 });
    text(g, 'MANIFOLD', x, y - r * 0.26, r * 0.11, ink);
    text(g, 'PRESSURE', x, y - r * 0.12, r * 0.11, ink);
    text(g, 'INCHES\nOF MERCURY', x, y + r * 0.22, r * 0.08, inkDim);
    text(g, 'CAUTION\nDO NOT EXCEED\nMP TABLE LIMITS', x, y + r * 0.6, r * 0.065, inkDim);
  }
  // Placards; registration plate; panel screws round the face.
  text(g, 'DO NOT EXCEED 110 KIAS EXCEPT IN SMOOTH AIR', mx(0.089), my(-0.034), 8.5, '#d9dbd6');
  g.fillStyle = '#0d0e10'; roundRect(g, mx(-0.205) - 34, my(-0.047) - 9, 68, 18, 3); g.fill();
  text(g, reg, mx(-0.205), my(-0.047), 11, '#d7d9dc');
  for (const [x, y] of [[-0.262, 0.07], [0.262, 0.07], [-0.212, -0.074], [0.212, -0.074], [-0.07, 0.108], [0.07, 0.108], [-0.166, -0.124], [0.166, -0.124]]) screw(g, mx(x), my(y), 3.6);
  // Small screws at the corners of every case.
  for (const o of Object.values(G)) for (const a of [45, 135, 225, 315]) screw(g, o.x + Math.cos(a * D2R) * o.R * 1.16, o.y + Math.sin(a * D2R) * o.R * 1.16, 2.6);
}

// Small engine gauge in its rectangular window (pedestal cluster).
function smallGauge(g, o, ang, arcs) {
  const { x, y, r } = o;
  const w = o.wide ? r * 4.4 : r * 2.6, h = o.wide ? r * 1.6 : r * 2.3;
  g.fillStyle = '#08090a';
  roundRect(g, x - w / 2, y - h / 2, w, h, 6); g.fill();
  g.strokeStyle = 'rgba(190,195,200,0.22)'; g.lineWidth = 1.2;
  roundRect(g, x - w / 2, y - h / 2, w, h, 6); g.stroke();
  const cy = o.wide ? y + r * 0.45 : y;
  for (const [v0, v1, col] of arcs) arc(g, x, cy, r, ang, v0, v1, col, 0.12, 0.86);
  const [v0, v1] = o.v;
  for (let i = 0; i <= 8; i++) {
    const a = ang(v0 + ((v1 - v0) * i) / 8), maj = i % 4 === 0;
    g.strokeStyle = ink; g.lineWidth = maj ? 2 : 1;
    g.beginPath(); g.moveTo(x + Math.cos(a) * r * (maj ? 0.66 : 0.74), cy + Math.sin(a) * r * (maj ? 0.66 : 0.74)); g.lineTo(x + Math.cos(a) * r * 0.93, cy + Math.sin(a) * r * 0.93); g.stroke();
  }
  text(g, o.label, x, o.wide ? y - h * 0.32 : y + r * 0.62, 10.5, inkDim);
}

function drawConsole(g) {
  speckle(g, CON.W, CON.H, 17, '#1a1c1f');
  // Module plates (slightly lighter panels between the screws).
  const plate = (x, y, w, h) => { g.fillStyle = 'rgba(255,255,255,0.03)'; roundRect(g, x, y, w, h, 6); g.fill(); g.strokeStyle = 'rgba(200,205,210,0.18)'; g.lineWidth = 1.2; roundRect(g, x, y, w, h, 6); g.stroke(); };
  plate(10, 70, 492, 440); plate(10, 520, 492, 250);
  // Lamp labels (lamps are 3D).
  for (const l of CON_LAMPS) text(g, l.label, l.x, l.y + 26, 8.5, inkDim);
  // Hour meter and clock (left column).
  {
    const { x, y, r } = CON_CLOCK.hours;
    g.fillStyle = '#08090a'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e6e3d8'; g.fillRect(x - 32, y - 2, 64, 20);
    g.fillStyle = '#111'; g.font = 'bold 15px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('1 2 4 3 6', x, y + 8);
    text(g, 'HOURS', x, y - 16, 10, ink); text(g, 'COLLECTIVE\nACTIVATED', x, y + 32, 7, inkDim);
  }
  {
    const { x, y, r } = CON_CLOCK.clock;
    dial(g, x, y, r);
    for (let i = 0; i < 12; i++) {
      const a = (i * 30 - 90) * D2R;
      g.strokeStyle = ink; g.lineWidth = i % 3 === 0 ? 3 : 1.5;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78); g.lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95); g.stroke();
      if (i % 3 === 0) text(g, String(i === 0 ? 12 : i), x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, 13);
    }
    text(g, 'QUARTZ', x, y + r * 0.35, 8, inkDim);
    // The clock is not simulated: its hands stand still.
    g.strokeStyle = ink; g.lineWidth = 3.5;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + r * 0.42, y - r * 0.24); g.stroke();
    g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x - r * 0.12, y - r * 0.7); g.stroke();
  }
  // Engine cluster and the fuel / spray-tank gauges (needles are 3D).
  const C = CON_G;
  g.fillStyle = '#0d0e10'; roundRect(g, 220, 82, 266, 182, 8); g.fill();
  smallGauge(g, C.oilT, ANG.small(...C.oilT.v), [[75, 245, '#36b24a'], [245, 250, '#d8301f']]);
  smallGauge(g, C.oilP, ANG.small(...C.oilP.v), [[0, 25, '#d8301f'], [25, 55, '#f0c020'], [55, 95, '#36b24a']]);
  smallGauge(g, C.cht, ANG.small(...C.cht.v), [[200, 500, '#36b24a'], [500, 550, '#d8301f']]);
  smallGauge(g, C.amps, ANG.small(...C.amps.v), [[-60, -5, '#d8301f'], [-5, 60, '#36b24a']]);
  g.save(); g.translate(352, 290); g.transform(1, 0, -0.2, 1, 0, 0);
  text(g, 'R44', -50, 0, 26, '#e9e9e6'); text(g, 'Raven II', 34, 2, 19, '#d9dbdd', false);
  g.restore();
  smallGauge(g, C.tank, ANG.small(...C.tank.v), []);
  smallGauge(g, C.fuel, ANG.small(...C.fuel.v), [[0, 18, '#d8301f']]);
  text(g, 'PANEL LTS', 70, 440, 9, inkDim); text(g, 'DIM', 70, 500, 8, inkDim);
  // Switch row: rocker plates (the levers are 3D); the clutch switch under
  // its red guard.
  g.strokeStyle = 'rgba(225,228,232,0.5)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(26, 548); g.lineTo(420, 548); g.stroke();
  for (const [, x, y, label, red, guard] of CON_SW) {
    g.fillStyle = red && !guard ? '#7a1610' : '#121315';
    roundRect(g, x - 20, y - 28, 40, 56, 4); g.fill();
    g.strokeStyle = 'rgba(220,224,228,0.4)'; g.lineWidth = 1; roundRect(g, x - 20, y - 28, 40, 56, 4); g.stroke();
    text(g, 'ON', x, y - 18, 9, ink, false); text(g, 'OFF', x, y + 18, 9, ink, false);
    text(g, label, x, y + 46, 9.5, ink);
  }
  text(g, 'SPRAY', 362, 676, 9, '#9fdcab');
  text(g, 'ENG\nDISEN', 254, 600, 8, inkDim);
  // Magneto key switch.
  {
    const { x, y } = CON_KEY;
    g.fillStyle = '#9aa0a6'; g.beginPath(); g.arc(x, y, 22, 0, Math.PI * 2); g.fill();
    text(g, 'OFF', x + 26, y - 30, 8, inkDim, false); text(g, 'R', x + 34, y - 6, 8, inkDim, false); text(g, 'L', x + 32, y + 16, 8, inkDim, false);
    text(g, 'BOTH', x + 18, y + 34, 8, inkDim, false); text(g, 'PRIME', x - 6, y + 40, 8, inkDim, false);
  }
  text(g, 'MIXTURE\nPULL LEAN/OFF', 214, 744, 8, inkDim);
  text(g, 'CABIN AIR', 70, 744, 8, inkDim);
  // Avionics stack: audio panel, GPS (the screen is live), XPDR, COM.
  for (const R of CON_RADIO) {
    g.fillStyle = '#0b0c0e'; roundRect(g, 14, R.y, 484, R.h, 6); g.fill();
    g.strokeStyle = 'rgba(200,205,210,0.22)'; g.lineWidth = 1; roundRect(g, 14, R.y, 484, R.h, 6); g.stroke();
    text(g, R.label, 50, R.y + R.h / 2, 11, inkDim);
    if (R.lcd) {
      g.fillStyle = '#100604'; g.fillRect(110, R.y + 10, 280, R.h - 20);
      g.fillStyle = '#ff5530'; g.font = 'bold 26px "Courier New", monospace'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(R.lcd, 120, R.y + R.h / 2 - (R.lcd2 ? 12 : 0));
      if (R.lcd2) { g.font = '17px "Courier New", monospace'; g.fillText(R.lcd2, 120, R.y + R.h / 2 + 16); }
    } else {
      for (let i = 0; i < 9; i++) { g.fillStyle = '#26292d'; roundRect(g, 96 + i * 42, R.y + 16, 32, 26, 4); g.fill(); g.fillStyle = i % 3 ? '#4b4e52' : '#a5ff7a'; g.fillRect(108 + i * 42, R.y + 20, 8, 4); }
    }
  }
  g.fillStyle = '#0c0e10'; roundRect(g, CON_GPS.x - 14, CON_GPS.y - 12, CON_GPS.w + 28, CON_GPS.h + 24, 10); g.fill();
  text(g, 'LOW-G PUSHOVERS PROHIBITED', 256, 1312, 9.5, '#d8a72a');
  for (const [x, y] of [[20, 78], [492, 78], [20, 504], [492, 504], [20, 526], [492, 526], [20, 764], [492, 764]]) screw(g, x, y, 4);
}

// Turn-coordinator aircraft symbol (white, on a transparent square).
function drawTcPlane(g, S) {
  const c = S / 2;
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#f4f2ea';
  g.fillRect(c - S * 0.42, c - 4, S * 0.84, 8);
  g.beginPath(); g.arc(c, c, S * 0.07, 0, Math.PI * 2); g.fill();
  g.fillRect(c - 3, c - S * 0.16, 6, S * 0.12);
  g.fillRect(c - S * 0.1, c + S * 0.05, S * 0.2, 5);
}

// Attitude tape: sky over ground, pitch lines every 5°, ±90° over the height.
function drawAttTape(g, W, H) {
  const sky = g.createLinearGradient(0, 0, 0, H / 2);
  sky.addColorStop(0, '#0e3f7a'); sky.addColorStop(1, '#3d8ad6');
  g.fillStyle = sky; g.fillRect(0, 0, W, H / 2);
  const gnd = g.createLinearGradient(0, H / 2, 0, H);
  gnd.addColorStop(0, '#8a5a2c'); gnd.addColorStop(1, '#4a2c12');
  g.fillStyle = gnd; g.fillRect(0, H / 2, W, H / 2);
  g.fillStyle = '#ffffff'; g.fillRect(0, H / 2 - 3, W, 6);
  const pxDeg = H / 180;
  for (let p = -60; p <= 60; p += 5) {
    if (p === 0) continue;
    const y = H / 2 - p * pxDeg, half = p % 10 === 0 ? W * 0.2 : W * 0.1;
    g.fillStyle = '#ffffff'; g.fillRect(W / 2 - half, y - 1.5, half * 2, 3);
    if (p % 10 === 0) text(g, String(Math.abs(p)), W / 2 + half + 18, y, 18, '#ffffff');
  }
}

// Attitude overlay: bank scale and pointer, fixed aircraft symbol.
function drawAttOverlay(g, S) {
  const c = S / 2, r = S * 0.46;
  g.clearRect(0, 0, S, S);
  for (const b of [-60, -30, -20, -10, 10, 20, 30, 60]) {
    const a = (-90 + b) * D2R, long = Math.abs(b) === 30 || Math.abs(b) === 60;
    g.strokeStyle = '#ffffff'; g.lineWidth = long ? 4 : 3;
    g.beginPath(); g.moveTo(c + Math.cos(a) * r * (long ? 0.8 : 0.86), c + Math.sin(a) * r * (long ? 0.8 : 0.86)); g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); g.stroke();
  }
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(c, c - r * 0.8); g.lineTo(c - 9, c - r); g.lineTo(c + 9, c - r); g.closePath(); g.fill();
  // Fixed aircraft symbol (orange).
  g.strokeStyle = '#ff8a1e'; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.moveTo(c - r * 0.62, c); g.lineTo(c - r * 0.22, c); g.lineTo(c - r * 0.12, c + r * 0.12); g.lineTo(c, c); g.lineTo(c + r * 0.12, c + r * 0.12); g.lineTo(c + r * 0.22, c); g.lineTo(c + r * 0.62, c); g.stroke();
  g.fillStyle = '#ff8a1e'; g.beginPath(); g.arc(c, c, 6, 0, Math.PI * 2); g.fill();
  g.lineCap = 'butt';
}

// Heading card: compass rose, N up.
function drawCard(g, S) {
  const c = S / 2, r = S * 0.49;
  g.fillStyle = '#101214'; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill();
  for (let d = 0; d < 360; d += 5) {
    const a = (d - 90) * D2R, maj = d % 30 === 0, mid = d % 10 === 0;
    g.strokeStyle = ink; g.lineWidth = maj ? 4 : mid ? 3 : 1.6;
    const r0 = r * (maj ? 0.8 : mid ? 0.85 : 0.9);
    g.beginPath(); g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); g.lineTo(c + Math.cos(a) * r * 0.98, c + Math.sin(a) * r * 0.98); g.stroke();
    if (maj) {
      g.save(); g.translate(c + Math.cos(a) * r * 0.66, c + Math.sin(a) * r * 0.66); g.rotate(a + Math.PI / 2);
      const lab = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] ?? String(d / 10);
      text(g, lab, 0, 0, lab.length === 1 && 'NESW'.includes(lab) ? 40 : 30, lab === 'N' ? '#ffffff' : ink);
      g.restore();
    }
  }
}

function drawCardOverlay(g, S) {
  const c = S / 2, r = S * 0.46;
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#ff8a1e';
  g.beginPath(); g.moveTo(c, c - r * 0.78); g.lineTo(c - 8, c - r * 0.98); g.lineTo(c + 8, c - r * 0.98); g.closePath(); g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(c, c - r * 0.42); g.lineTo(c, c + r * 0.34); g.moveTo(c - r * 0.3, c - r * 0.02); g.lineTo(c + r * 0.3, c - r * 0.02); g.moveTo(c - r * 0.12, c + r * 0.3); g.lineTo(c + r * 0.12, c + r * 0.3); g.stroke();
  g.lineCap = 'butt';
  for (const a of [45, 135, 225, 315]) {
    const t = (a - 90) * D2R;
    g.strokeStyle = '#ffffff'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(c + Math.cos(t) * r * 0.9, c + Math.sin(t) * r * 0.9); g.lineTo(c + Math.cos(t) * r, c + Math.sin(t) * r); g.stroke();
  }
}

// Glass: a soft glint on the upper left of each instrument (transparent).
function drawGlass(g, S) {
  g.clearRect(0, 0, S, S);
  const c = S / 2;
  const gr = g.createRadialGradient(c * 0.62, c * 0.5, 2, c * 0.62, c * 0.5, c * 0.8);
  gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.05)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 4;
  g.beginPath(); g.arc(c, c, c * 0.94, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
}


export function createR44Panel({ reg = 'PR-AGH' } = {}) {
  const mk = (w, h, fn, opts) => { const c = canvas(w, h); fn(c.getContext('2d'), w, h); return canvasTexture(c, opts); };
  const pod = mk(POD.W, POD.H, (g) => drawPod(g, reg), { aniso: 8 });
  const con = mk(CON.W, CON.H, (g) => drawConsole(g), { aniso: 8 });
  const attTape = mk(256, 1024, (g, w, h) => drawAttTape(g, w, h), { aniso: 4 });
  const attOverlay = mk(256, 256, (g, w) => drawAttOverlay(g, w), { aniso: 4 });
  const card = mk(512, 512, (g, w) => drawCard(g, w), { aniso: 4 });
  const cardOverlay = mk(256, 256, (g, w) => drawCardOverlay(g, w), { aniso: 4 });
  const glass = mk(256, 256, (g, w) => drawGlass(g, w), { aniso: 2 });
  const tcPlane = mk(256, 256, (g, w) => drawTcPlane(g, w), { aniso: 4 });
  // Live guidance screen (the GPS in the stack and the tablet on the pod).
  const gc = canvas(512, 328);
  const gpsTex = canvasTexture(gc, { aniso: 4 });
  const gg = gc.getContext('2d');
  return {
    setReg(r) {
      const n = canvas(POD.W, POD.H), pg = pod.image.getContext('2d');
      drawPod(n.getContext('2d'), r);
      pg.clearRect(0, 0, POD.W, POD.H); pg.drawImage(n, 0, 0); pod.needsUpdate = true;
    },
    texture: pod, texture2: con, attTape, attOverlay, card, cardOverlay, glass, tcPlane, gpsTex,
    draw(d) {
      gps(gg, 0, 0, gc.width, gc.height, d.gps);
      gpsTex.needsUpdate = true;
    },
  };
}

// Shared with the Bell 206 panel (b206Panel.js).
export { speckle, screw, text, dial, scale, arc, radial, drawTcPlane, drawAttTape, drawAttOverlay, drawCard, drawCardOverlay, drawGlass };
