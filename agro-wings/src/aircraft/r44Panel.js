// R44 instruments, after the Robinson pod and pedestal: the "tombstone" pod
// with the warning-lamp row, vertical speed, attitude, airspeed and the dual
// tachometer on top, altimeter, heading and manifold pressure below; the
// pedestal with its own lamps, the engine-gauge cluster, the switch panel,
// the air-temperature readout, the guidance unit and the radios.
//
// Everything drawn here is static and drawn once at high resolution: the
// needles, the attitude ball, the heading card and the lamps are 3D parts
// (r44Cockpit.js) moved every frame, so they are smooth at any frame rate
// and cost no canvas redraw. Only the guidance screen is a live canvas,
// refreshed at the rate the helicopter asks for (draw()).
// The exact arrangement varies between real aircraft and is not claimed.
import { canvas, canvasTexture } from '../core/textures.js';
import { rng } from '../core/math.js';
import { gps, roundRect } from './panel.js';

const D2R = Math.PI / 180;

// Pod face: canvas pixels map to a 0.56 m wide face (local metres in
// r44Cockpit.js: x right, y up from the face centre).
export const POD = { W: 1024, H: 660, w: 0.56 };
POD.s = POD.w / POD.W; POD.h = POD.H * POD.s;
// Pedestal (console) face.
export const CON = { W: 512, H: 1240, w: 0.24 };
CON.s = CON.w / CON.W; CON.h = CON.H * CON.s;

// Gauge geometry [x, y, radius] in canvas pixels and the value -> angle map
// (canvas angle: radians clockwise from 3 o'clock). The 3D needles use the
// same maps.
const lin = (v0, v1, a0, sweep) => (v) => (a0 + ((Math.min(Math.max(v, v0), v1) - v0) / (v1 - v0)) * sweep) * D2R;
export const POD_G = {
  vsi: { x: 172, y: 224, r: 84 },
  att: { x: 398, y: 224, r: 84 },
  asi: { x: 626, y: 224, r: 84 },
  tach: { x: 854, y: 224, r: 84 },
  alt: { x: 284, y: 452, r: 84 },
  dg: { x: 512, y: 462, r: 78 },
  map: { x: 740, y: 452, r: 84 },
};
export const ANG = {
  // VSI: 0 at 9 o'clock, climb clockwise over the top, ±2,000 ft/min.
  vsi: (fpm) => { const v = Math.max(-2000, Math.min(2000, fpm)) / 2000; return (180 + v * 170) * D2R; },
  asi: lin(0, 150, -90, 320), // knots, 0 at 12 o'clock
  tach: lin(0, 115, 90, 240), // % rpm, 0 at 6 o'clock, 100 % at ~1 o'clock
  map: lin(10, 35, 135, 270), // in Hg
  altHund: (ft) => (-90 + (((ft % 1000) + 1000) % 1000) * 0.36) * D2R,
  altThou: (ft) => (-90 + (((ft % 10000) + 10000) % 10000) * 0.036) * D2R,
  altTenThou: (ft) => (-90 + Math.max(0, ft) * 0.0036) * D2R,
  small: (v0, v1) => lin(v0, v1, 150, 240),
};
// Warning lamps on the pod (label, colour, key read in r44Cockpit.js).
export const POD_LAMPS = [
  ['OIL', 'r', 'oil'], ['MR TEMP', 'r', null], ['MR CHIP', 'r', null], ['TR CHIP', 'r', null], ['STARTER\nON', 'r', 'starter'],
  ['CLUTCH', 'a', 'clutch'], ['LOW\nFUEL', 'a', 'lowFuel'], ['LOW\nRPM', 'r', 'lowRpm'], ['ROTOR\nBRAKE', 'a', 'rotorBrake'], ['SPRAY', 'g', 'spray'],
].map(([label, col, key], i) => ({ label, col, key, x: 134 + i * 84, y: 46 }));
// Pedestal: lamps, small engine gauges, guidance screen.
export const CON_LAMPS = [['ALT', 'a', 'alt'], ['OIL', 'r', 'oil'], ['GOV\nOFF', 'a', 'govOff']].map(([label, col, key], i) => ({ label, col, key, x: 176 + i * 80, y: 36 }));
export const CON_G = {
  amps: { x: 300, y: 150, r: 38, v: [-60, 60], label: 'AMPS' },
  oilT: { x: 420, y: 150, r: 38, v: [50, 250], label: 'OIL °F' },
  oilP: { x: 300, y: 248, r: 38, v: [0, 100], label: 'OIL PSI' },
  cht: { x: 420, y: 248, r: 38, v: [200, 550], label: 'CYL °F' },
  fuel: { x: 300, y: 346, r: 38, v: [0, 180], label: 'FUEL L' },
  tank: { x: 420, y: 346, r: 38, v: [0, 250], label: 'AG TANK L' },
};
export const CON_GPS = { x: 22, y: 712, w: 468, h: 300 };

// --------------------------------------------------------------- drawing
const ink = '#ecebe5', inkDim = '#a9aba6';
const LAMP = { r: ['#ff3b2a', '#4a1611'], a: ['#ffb020', '#4a3610'], g: ['#3dff7a', '#123a1d'] };

function speckle(g, w, h, seed, base) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < (w * h) / 90; i++) {
    const v = r() < 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${0.015 + r() * 0.025})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

function screw(g, x, y, s = 5) {
  const gr = g.createRadialGradient(x - s * 0.3, y - s * 0.3, 0, x, y, s);
  gr.addColorStop(0, '#9aa0a6'); gr.addColorStop(1, '#3d4248');
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#1c1f22'; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(x - s * 0.7, y - s * 0.2); g.lineTo(x + s * 0.7, y + s * 0.2); g.stroke();
}

// Instrument case: black bezel with a thin bright edge and four mounting
// screws, matte black face with a faint radial sheen.
function instrument(g, x, y, r, { screws = true } = {}) {
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath(); g.arc(x + 2, y + 4, r * 1.12, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0c0d0f';
  g.beginPath(); g.arc(x, y, r * 1.1, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(200,205,210,0.35)'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(x, y, r * 1.08, Math.PI * 1.05, Math.PI * 1.75); g.stroke();
  const gr = g.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
  gr.addColorStop(0, '#26292d'); gr.addColorStop(1, '#0b0c0d');
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  if (screws) for (const a of [45, 135, 225, 315]) screw(g, x + Math.cos(a * D2R) * r * 1.22, y + Math.sin(a * D2R) * r * 1.22, r * 0.055 + 1);
}

function text(g, t, x, y, size, col = ink, bold = true, align = 'center') {
  g.fillStyle = col;
  g.font = `${bold ? 'bold ' : ''}${size}px "Arial Narrow", Arial, sans-serif`;
  g.textAlign = align; g.textBaseline = 'middle';
  const lines = String(t).split('\n');
  lines.forEach((l, i) => g.fillText(l, x, y + (i - (lines.length - 1) / 2) * size * 1.05));
}

// Graduations: ticks every `minor`, longer + numbered every `major`.
function scale(g, x, y, r, ang, v0, v1, minor, major, { num = (v) => v, numR = 0.66, size = 0.17, skip = () => false } = {}) {
  for (let v = v0; v <= v1 + 1e-6; v += minor) {
    if (skip(v)) continue;
    const a = ang(v), isMaj = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    g.strokeStyle = ink; g.lineWidth = isMaj ? r * 0.04 : r * 0.022;
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

function drawPod(g) {
  speckle(g, POD.W, POD.H, 91, '#1c1e21');
  // Subtle edge shading of the moulded pod face.
  const vg = g.createRadialGradient(POD.W / 2, POD.H * 0.45, POD.H * 0.2, POD.W / 2, POD.H * 0.5, POD.W * 0.62);
  vg.addColorStop(0, 'rgba(255,255,255,0.03)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = vg; g.fillRect(0, 0, POD.W, POD.H);
  // Lamp row: bezels and labels (the lamps themselves are 3D).
  for (const l of POD_LAMPS) {
    g.fillStyle = '#0a0b0c';
    g.beginPath(); g.arc(l.x, l.y, 15, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(190,195,200,0.45)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(l.x, l.y, 15, 0, Math.PI * 2); g.stroke();
    text(g, l.label, l.x, l.y + 30, 10.5, inkDim);
  }
  const G = POD_G;
  // Vertical speed.
  {
    const { x, y, r } = G.vsi;
    instrument(g, x, y, r);
    const ang = (v) => ANG.vsi(v * 100);
    for (let v = -20; v <= 20; v += 1) {
      const a = ang(v), maj = v % 5 === 0;
      g.strokeStyle = ink; g.lineWidth = maj ? r * 0.04 : r * 0.022;
      const r0 = r * (maj ? 0.8 : 0.87);
      g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r * 0.97, y + Math.sin(a) * r * 0.97); g.stroke();
      if (maj && Math.abs(v) !== 20) text(g, String(Math.abs(v)), x + Math.cos(a) * r * 0.64, y + Math.sin(a) * r * 0.64, r * 0.2);
    }
    text(g, 'UP', x - r * 0.42, y - r * 0.3, r * 0.13);
    text(g, 'DN', x - r * 0.42, y + r * 0.3, r * 0.13);
    text(g, 'VERTICAL SPEED', x + r * 0.1, y - r * 0.18, r * 0.1, inkDim);
    text(g, '100 FEET PER MIN', x + r * 0.1, y + r * 0.18, r * 0.1, inkDim);
  }
  // Attitude: case and bezel only (ball and overlay are 3D).
  {
    const { x, y, r } = G.att;
    instrument(g, x, y, r);
    g.fillStyle = '#121416';
    g.beginPath(); g.arc(x, y, r * 0.98, 0, Math.PI * 2); g.fill();
    // Pitch-trim knob at the bottom of the bezel.
    g.fillStyle = '#2b2f33'; g.beginPath(); g.arc(x, y + r * 1.02, r * 0.1, 0, Math.PI * 2); g.fill();
  }
  // Airspeed.
  {
    const { x, y, r } = G.asi, ang = ANG.asi;
    instrument(g, x, y, r);
    arc(g, x, y, r, ang, 20, 110, '#36b24a', 0.075);
    arc(g, x, y, r, ang, 110, 130, '#f0c020', 0.075);
    radial(g, x, y, r, ang(130), '#d8301f', 0.06);
    scale(g, x, y, r, ang, 0, 150, 5, 10, { num: (v) => (v % 20 === 0 && v > 0 ? v : null), numR: 0.64, size: 0.17, skip: (v) => v < 20 });
    text(g, 'AIRSPEED', x, y - r * 0.28, r * 0.11, inkDim);
    text(g, 'KNOTS', x, y + r * 0.3, r * 0.12, inkDim);
  }
  // Dual tachometer: rotor (outer arcs) and engine (inner arcs).
  {
    const { x, y, r } = G.tach, ang = ANG.tach;
    instrument(g, x, y, r);
    arc(g, x, y, r, ang, 90, 108, '#36b24a', 0.07, 0.95);
    arc(g, x, y, r, ang, 108, 110, '#d8301f', 0.07, 0.95);
    arc(g, x, y, r, ang, 80, 90, '#f0c020', 0.07, 0.95);
    arc(g, x, y, r, ang, 101, 102, '#36b24a', 0.09, 0.72);
    radial(g, x, y, r, ang(102), '#d8301f', 0.05);
    scale(g, x, y, r, ang, 0, 110, 5, 10, { num: (v) => (v % 20 === 0 ? v : null), numR: 0.6, size: 0.16 });
    text(g, 'R', x - r * 0.28, y + r * 0.36, r * 0.17, '#ffd34d');
    text(g, 'E', x + r * 0.28, y + r * 0.36, r * 0.17, ink);
    text(g, 'PERCENT RPM', x, y + r * 0.58, r * 0.09, inkDim);
  }
  // Altimeter: 0–9 dial, Kollsman window.
  {
    const { x, y, r } = G.alt;
    instrument(g, x, y, r);
    const ang = (v) => (-90 + v * 36) * D2R;
    for (let v = 0; v < 10; v += 0.2) {
      const a = ang(v), maj = Math.abs(v - Math.round(v)) < 1e-6;
      g.strokeStyle = ink; g.lineWidth = maj ? r * 0.04 : r * 0.02;
      const r0 = r * (maj ? 0.8 : 0.88);
      g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r * 0.97, y + Math.sin(a) * r * 0.97); g.stroke();
      if (maj) text(g, String(Math.round(v)), x + Math.cos(a) * r * 0.64, y + Math.sin(a) * r * 0.64, r * 0.22);
    }
    g.fillStyle = '#060707'; g.fillRect(x + r * 0.28, y - r * 0.12, r * 0.4, r * 0.24);
    text(g, '29.92', x + r * 0.48, y, r * 0.13, ink, false);
    text(g, 'ALT', x - r * 0.3, y - r * 0.3, r * 0.12, inkDim);
    text(g, '100 FEET', x, y + r * 0.42, r * 0.09, inkDim);
  }
  // Heading: case only (card and overlay are 3D).
  {
    const { x, y, r } = G.dg;
    instrument(g, x, y, r);
    g.fillStyle = '#2b2f33'; g.beginPath(); g.arc(x - r * 0.95, y + r * 0.95, r * 0.14, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d8701f'; g.beginPath(); g.arc(x + r * 0.95, y + r * 0.95, r * 0.14, 0, Math.PI * 2); g.fill();
  }
  // Manifold pressure.
  {
    const { x, y, r } = G.map, ang = ANG.map;
    instrument(g, x, y, r);
    arc(g, x, y, r, ang, 10, 21.6, '#36b24a', 0.075);
    arc(g, x, y, r, ang, 21.6, 25.1, '#f0c020', 0.075);
    radial(g, x, y, r, ang(25.1), '#d8301f', 0.06);
    scale(g, x, y, r, ang, 10, 35, 1, 5, { numR: 0.64, size: 0.19 });
    text(g, 'MANIFOLD', x, y - r * 0.26, r * 0.11, inkDim);
    text(g, 'PRESSURE', x, y - r * 0.12, r * 0.11, inkDim);
    text(g, 'IN HG', x, y + r * 0.34, r * 0.11, inkDim);
  }
  // Placards and screws.
  g.fillStyle = '#0d0e10'; roundRect(g, 455, 600, 114, 26, 3); g.fill();
  text(g, 'PR-AGH', 512, 613, 14, '#d7d9dc');
  text(g, 'NO ACROBATIC MANEUVERS INCLUDING ROLLS AND LOOPS', 512, 580, 10, inkDim, false);
  for (const [x, y] of [[40, 30], [984, 30], [70, 600], [954, 600]]) screw(g, x, y, 5);
}

// Small engine gauge in its rectangular window (pedestal cluster).
function smallGauge(g, o, ang, arcs) {
  const { x, y, r } = o;
  g.fillStyle = '#0a0b0c';
  roundRect(g, x - r * 1.3, y - r * 1.15, r * 2.6, r * 2.3, 6); g.fill();
  g.strokeStyle = 'rgba(190,195,200,0.25)'; g.lineWidth = 1.2;
  roundRect(g, x - r * 1.3, y - r * 1.15, r * 2.6, r * 2.3, 6); g.stroke();
  const gr = g.createRadialGradient(x, y, 2, x, y, r * 1.1);
  gr.addColorStop(0, '#202326'); gr.addColorStop(1, '#0c0d0e');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  for (const [v0, v1, col] of arcs) arc(g, x, y, r, ang, v0, v1, col, 0.12, 0.86);
  const [v0, v1] = o.v;
  for (let i = 0; i <= 8; i++) {
    const a = ang(v0 + ((v1 - v0) * i) / 8), maj = i % 4 === 0;
    g.strokeStyle = ink; g.lineWidth = maj ? 2 : 1;
    g.beginPath(); g.moveTo(x + Math.cos(a) * r * (maj ? 0.66 : 0.74), y + Math.sin(a) * r * (maj ? 0.66 : 0.74)); g.lineTo(x + Math.cos(a) * r * 0.93, y + Math.sin(a) * r * 0.93); g.stroke();
  }
  text(g, o.label, x, y + r * 0.62, 11, inkDim);
}

function toggle(g, x, y, label, red = false) {
  g.fillStyle = red ? '#7a1610' : '#1a1c1f';
  roundRect(g, x - 15, y - 22, 30, 44, 4); g.fill();
  g.strokeStyle = 'rgba(220,224,228,0.4)'; g.lineWidth = 1;
  roundRect(g, x - 15, y - 22, 30, 44, 4); g.stroke();
  text(g, 'ON', x, y - 32, 10, inkDim, false);
  text(g, label, x, y + 36, 10.5, ink);
}

function drawConsole(g) {
  speckle(g, CON.W, CON.H, 17, '#1b1d20');
  // Lamp labels (lamps are 3D).
  for (const l of CON_LAMPS) {
    g.fillStyle = '#0a0b0c'; g.beginPath(); g.arc(l.x, l.y, 13, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(190,195,200,0.45)'; g.lineWidth = 1.4; g.beginPath(); g.arc(l.x, l.y, 13, 0, Math.PI * 2); g.stroke();
    text(g, l.label, l.x, l.y + 27, 10, inkDim);
  }
  // Clock and carburettor-air temperature, left of the engine cluster.
  for (const [y, lab] of [[160, 'CLOCK'], [300, 'CARB AIR']]) {
    instrument(g, 112, y, 46, { screws: false });
    for (let i = 0; i < 12; i++) {
      const a = (i * 30 - 90) * D2R;
      g.strokeStyle = ink; g.lineWidth = i % 3 === 0 ? 3 : 1.5;
      g.beginPath(); g.moveTo(112 + Math.cos(a) * 34, y + Math.sin(a) * 34); g.lineTo(112 + Math.cos(a) * 43, y + Math.sin(a) * 43); g.stroke();
    }
    text(g, lab, 112, y + 18, 9, inkDim);
  }
  // Clock hands fixed at a plausible time (the clock is not simulated).
  g.strokeStyle = ink; g.lineWidth = 3;
  g.beginPath(); g.moveTo(112, 160); g.lineTo(112 + 20, 160 - 12); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.moveTo(112, 160); g.lineTo(112 - 6, 160 - 32); g.stroke();
  // Engine cluster (needles are 3D).
  const C = CON_G;
  smallGauge(g, C.amps, ANG.small(...C.amps.v), [[-60, -5, '#d8301f'], [-5, 60, '#36b24a']]);
  smallGauge(g, C.oilT, ANG.small(...C.oilT.v), [[75, 245, '#36b24a'], [245, 250, '#d8301f']]);
  smallGauge(g, C.oilP, ANG.small(...C.oilP.v), [[0, 25, '#d8301f'], [25, 55, '#f0c020'], [55, 95, '#36b24a']]);
  smallGauge(g, C.cht, ANG.small(...C.cht.v), [[200, 500, '#36b24a'], [500, 550, '#d8301f']]);
  smallGauge(g, C.fuel, ANG.small(...C.fuel.v), [[0, 18, '#d8301f']]);
  smallGauge(g, C.tank, ANG.small(...C.tank.v), []);
  text(g, 'R44', 170, 400, 30, '#e9e9e6');
  text(g, 'RAVEN II', 170, 428, 15, '#c9ccd0');
  // Switch panel: outlined groups with toggles, the guarded clutch switch,
  // master battery, key, cabin-air knob.
  g.strokeStyle = 'rgba(225,228,232,0.55)'; g.lineWidth = 1.6;
  roundRect(g, 18, 452, 476, 168, 10); g.stroke();
  text(g, 'NAV LTS', 60, 470, 10, inkDim); text(g, 'STROBE', 110, 470, 10, inkDim);
  toggle(g, 60, 510, ''); toggle(g, 110, 510, '');
  toggle(g, 186, 510, 'CLUTCH', true);
  g.strokeStyle = '#c4261b'; g.lineWidth = 3; g.strokeRect(166, 482, 40, 56);
  toggle(g, 262, 510, 'ALT'); toggle(g, 318, 510, 'BATT', true);
  text(g, 'MASTER', 290, 470, 10, inkDim);
  toggle(g, 374, 510, 'PUMP'); toggle(g, 430, 510, 'VALVE');
  text(g, 'SPRAY', 402, 470, 10, inkDim);
  // Key switch and cabin air.
  g.fillStyle = '#8f949a'; g.beginPath(); g.arc(80, 590, 18, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2b2e32'; g.fillRect(77, 576, 6, 28);
  text(g, 'OFF  L  R  BOTH', 80, 566, 8.5, inkDim, false);
  text(g, 'CABIN AIR', 430, 572, 10, inkDim);
  text(g, 'PULL ON', 430, 608, 10, inkDim);
  // Air-temperature readout and panel-light dimmer.
  g.fillStyle = '#060606'; roundRect(g, 150, 640, 200, 52, 6); g.fill();
  g.fillStyle = '#ff3d2a'; g.font = 'bold 30px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('28.4 °C', 250, 667);
  text(g, 'AIR TEMP', 250, 632, 10, inkDim);
  text(g, 'PANEL LTS', 66, 650, 10, inkDim);
  // Guidance unit bezel (the screen itself is a live plane).
  g.fillStyle = '#0c0e10'; roundRect(g, CON_GPS.x - 8, CON_GPS.y - 8, CON_GPS.w + 16, CON_GPS.h + 16, 10); g.fill();
  // COM radio and transponder.
  const lcd = (y, h, label, l1, l2) => {
    g.fillStyle = '#0b0c0e'; roundRect(g, 18, y, 476, h, 8); g.fill();
    g.strokeStyle = 'rgba(200,205,210,0.25)'; g.lineWidth = 1; roundRect(g, 18, y, 476, h, 8); g.stroke();
    g.fillStyle = '#071407'; g.fillRect(118, y + 12, 276, h - 24);
    g.fillStyle = '#8dff7a'; g.font = 'bold 28px "Courier New", monospace'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(l1, 128, y + h / 2 - (l2 ? 13 : 0));
    if (l2) { g.font = '18px "Courier New", monospace'; g.fillText(l2, 128, y + h / 2 + 16); }
    text(g, label, 66, y + h / 2, 12, inkDim);
    for (const k of [0, 1]) { g.fillStyle = '#2a2d31'; g.beginPath(); g.arc(436 + k * 28, y + h / 2, 11, 0, Math.PI * 2); g.fill(); }
  };
  lcd(1032, 92, 'COM', '120.525', 'STBY 124.850');
  lcd(1134, 80, 'XPDR', 'ALT 7000', null);
  text(g, 'LOW-G PUSHOVERS PROHIBITED', 256, 1226, 11, '#d8a72a');
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

export function createR44Panel() {
  const mk = (w, h, fn, opts) => { const c = canvas(w, h); fn(c.getContext('2d'), w, h); return canvasTexture(c, opts); };
  const pod = mk(POD.W, POD.H, (g) => drawPod(g), { aniso: 8 });
  const con = mk(CON.W, CON.H, (g) => drawConsole(g), { aniso: 8 });
  const attTape = mk(256, 1024, (g, w, h) => drawAttTape(g, w, h), { aniso: 4 });
  const attOverlay = mk(256, 256, (g, w) => drawAttOverlay(g, w), { aniso: 4 });
  const card = mk(512, 512, (g, w) => drawCard(g, w), { aniso: 4 });
  const cardOverlay = mk(256, 256, (g, w) => drawCardOverlay(g, w), { aniso: 4 });
  const glass = mk(256, 256, (g, w) => drawGlass(g, w), { aniso: 2 });
  // Live guidance screen.
  const gc = canvas(512, 328);
  const gpsTex = canvasTexture(gc, { aniso: 4 });
  const gg = gc.getContext('2d');
  return {
    texture: pod, texture2: con, attTape, attOverlay, card, cardOverlay, glass, gpsTex,
    draw(d) {
      gps(gg, 0, 0, gc.width, gc.height, d.gps);
      gpsTex.needsUpdate = true;
    },
  };
}
