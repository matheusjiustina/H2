// Air Tractor AT-802A / Fire Boss instruments and panel textures. Every
// screen is its own small canvas, redrawn only when what it shows changed
// (a key of its rounded values), at most at the Aircraft's 15 Hz cockpit
// rate, and only while the cockpit view is up (aircraft.js):
//   engine monitor (MVP-50T style, left of the GPS): Ng, ITT, torque and Np
//     arcs, fuel flow, fuel, g, the engine run timer, warnings — the values
//     of the flight model's PT6A (-65AG or -67F per configuration); what the
//     simulation does not model (oil pressure and temperature, fuel
//     pressure, volts, OAT) reads "---" with N/S, never an invented number;
//   electronic attitude indicator (right of the GPS): attitude, slip;
//   red LED readout under it: AT-802A — spray flow (L/min) from the
//     sprayer; Fire Boss — water on board (L);
//   auxiliary display: AT-802A — flow monitor (flow, hopper, swath,
//     height); Fire Boss — water mission display (water, probes, door, gear,
//     water contact, nearest test fire) from the water systems;
//   the AGROWINGS NAV unit (the game's own GPS, agroNav.js) in the centre.
// Static textures: analog airspeed (per configuration's V-speeds) and
// altimeter faces, the placards, the switch-panel legends (agricultural or
// Fire Boss), the hopper sight scale (US gal of product or litres of water)
// and the Air Tractor pedal plates.
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp, rng } from '../core/math.js';
import { createAgroNav } from './agroNav.js';
import { BASE } from '../world/layout.js';

const KT = 1;
export const AT802_SCREENS = { ems: [512, 360], adi: [256, 256], led: [256, 72], aux: [384, 240] };

const ink = '#e9ecef';
function txt(g, t, x, y, size, col = ink, bold = true, align = 'center', font = 'Arial') {
  g.fillStyle = col;
  g.font = `${bold ? 'bold ' : ''}${size}px "Arial Narrow", ${font}, sans-serif`;
  g.textAlign = align; g.textBaseline = 'middle';
  String(t).split('\n').forEach((l, i, a) => g.fillText(l, x, y + (i - (a.length - 1) / 2) * size * 1.08));
}
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
const mk = (w, h, aniso = 4) => { const c = canvas(w, h); return { c, g: c.getContext('2d'), tex: canvasTexture(c, { aniso }), key: '' }; };
function redraw(s, key, fn) { if (key === s.key) return; s.key = key; fn(s.g); s.tex.needsUpdate = true; }

// Needle angles (radians clockwise from 12 o'clock) shared by the faces
// and the 3D needles.
export const AT802_ANG = {
  asi: (kt) => (kt <= 40 ? (kt / 40) * 0.35 : 0.35 + ((Math.min(kt, 220) - 40) / 180) * 5.4),
  alt100: (ft) => ((ft % 1000) / 1000) * Math.PI * 2,
  alt1000: (ft) => ((ft % 10000) / 10000) * Math.PI * 2,
};

// ------------------------------------------------------------ static faces
// Dial atlas: [airspeed | altimeter], 512 px cells.
function drawDials(v) {
  const c = canvas(1024, 512), g = c.getContext('2d');
  const face = (cx) => {
    const gr = g.createRadialGradient(cx - 50, 200, 20, cx, 256, 250);
    gr.addColorStop(0, '#202326'); gr.addColorStop(1, '#08090a');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, 256, 250, 0, Math.PI * 2); g.fill();
  };
  // Airspeed (knots, 40–220): white flap arc vs0–vfe, green vs1–vno, yellow to VNE, red radial.
  {
    const cx = 256, R = 236;
    face(cx);
    const P = (a, r) => [cx + Math.sin(a) * r, 256 - Math.cos(a) * r];
    const arc = (k0, k1, r, w, col) => {
      g.strokeStyle = col; g.lineWidth = w; g.beginPath();
      g.arc(cx, 256, r, AT802_ANG.asi(k0) - Math.PI / 2, AT802_ANG.asi(k1) - Math.PI / 2); g.stroke();
    };
    const vno = Math.round(v.vne * 0.86);
    arc(v.vs0, v.vfe, R - 30, 12, '#f2f2f2');
    arc(v.vs1, vno, R - 14, 14, '#1fae3a');
    arc(vno, v.vne, R - 14, 14, '#f0c420');
    { const a = AT802_ANG.asi(v.vne); const [x0, y0] = P(a, R - 34), [x1, y1] = P(a, R); g.strokeStyle = '#e02a22'; g.lineWidth = 7; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
    for (let k = 40; k <= 220; k += 5) {
      const a = AT802_ANG.asi(k), maj = k % 20 === 0;
      const [x0, y0] = P(a, R - (maj ? 34 : 20)), [x1, y1] = P(a, R);
      g.strokeStyle = '#f4f4f4'; g.lineWidth = maj ? 5 : 2.5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      if (maj) { const [tx, ty] = P(a, R - 66); txt(g, k, tx, ty, 34, '#f4f4f4'); }
    }
    txt(g, 'AIRSPEED', cx, 180, 26, '#d8d8d8');
    txt(g, 'KNOTS', cx, 336, 22, '#bbbbbb');
  }
  // Altimeter: 0–9 (hundreds of ft), Kollsman window.
  {
    const cx = 768, R = 236;
    face(cx);
    for (let i = 0; i < 50; i++) {
      const a = (i / 50) * Math.PI * 2, maj = i % 5 === 0;
      const r0 = R - (maj ? 34 : 18);
      g.strokeStyle = '#f4f4f4'; g.lineWidth = maj ? 6 : 2.5;
      g.beginPath(); g.moveTo(cx + Math.sin(a) * r0, 256 - Math.cos(a) * r0); g.lineTo(cx + Math.sin(a) * R, 256 - Math.cos(a) * R); g.stroke();
      if (maj) txt(g, i / 5, cx + Math.sin(a) * (R - 70), 256 - Math.cos(a) * (R - 70), 48, '#f4f4f4');
    }
    txt(g, 'ALTITUDE', cx, 196, 24, '#d8d8d8');
    txt(g, '100 FEET', cx, 226, 18, '#aaaaaa');
    g.fillStyle = '#050505'; g.fillRect(cx + 70, 236, 92, 40);
    txt(g, '29.92', cx + 116, 256, 26, '#f4f4f4', true, 'center', 'monospace');
    txt(g, 'CALIBRATED TO\n20,000 FEET', cx, 330, 16, '#999999');
  }
  return c;
}

// Placards on the left panel wing (after the photographs: operating
// limitations, warning, power settings), cream lettering on black.
function drawPlacards(v, fireboss) {
  // Tall strip (0.10 × 0.19 m on the panel): four plates stacked.
  const W = 280, H = 512;
  const c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#0d0e10'; g.fillRect(0, 0, W, H);
  const plate = (y, h, lines, size, title = null) => {
    g.fillStyle = '#121315'; rr(g, 6, y, W - 12, h, 6); g.fill();
    g.strokeStyle = '#d9d6cc'; g.lineWidth = 2; rr(g, 9, y + 3, W - 18, h - 6, 5); g.stroke();
    let yy = y + 15;
    if (title) { txt(g, title, W / 2, yy, size + 3, '#ece8dc'); yy += size + 7; }
    for (const l of lines) { txt(g, l, 16, yy, size, '#d9d6cc', true, 'left'); yy += size + 2.5; }
  };
  plate(6, 92, ['RPM     1700', `TORQUE  ${fireboss ? '4940' : '4000'} FT-LB`, 'ITT MAX 820 °C'], 15, 'MAX CONT PWR');
  plate(104, 188, [
    'OPERATE IN THE RESTRICTED', 'CATEGORY PER PLACARDS', 'AND MARKINGS.', 'NO ACROBATIC MANEUVERS,', 'INCLUDING SPINS.',
    `MANEUVERING ${Math.round(v.vs1 * 1.45)} KTS`, `FLAPS DOWN MAX ${v.vfe} KTS`, `VNE ${v.vne} KTS`,
  ], 13.5);
  plate(298, 126, ['NO ENGINE RUN-UP ABOVE', '1500 FT-LB NEAR DEBRIS.', 'NO FLIGHT IN THUNDER-', 'STORMS OR KNOWN ICING.'], 13.5, 'WARNING');
  plate(430, 76, fireboss ? ['GEAR DN — LAND', 'GEAR UP — WATER'] : ['HOPPER MAX', '3028 L · 800 GAL'], 15, fireboss ? 'AMPHIBIAN' : null);
  return c;
}

// Switch-panel legends of the lower console: two strips each side of the
// stick, white on black (group titles and the switch names).
export const AT802_CONSOLE = {
  W: 1024, H: 256,
  // [u0, u1] of each strip on the texture (0..1 of the width), rows top / bottom.
  strips: [[0.0, 0.47], [0.53, 1.0]],
};
function drawConsoleLabels(fireboss) {
  const { W, H } = AT802_CONSOLE;
  const c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#0b0c0e'; g.fillRect(0, 0, W, H);
  const strip = (x0, x1, y, title, labels) => {
    g.strokeStyle = '#5c6066'; g.lineWidth = 2; rr(g, x0 + 6, y + 4, x1 - x0 - 12, 112, 6); g.stroke();
    txt(g, title, (x0 + x1) / 2, y + 18, 15, '#f1f1f1');
    const n = labels.length;
    labels.forEach((l, i) => txt(g, l, x0 + 18 + ((x1 - x0 - 36) * (i + 0.5)) / n, y + 96, 11, '#e8e8e8'));
  };
  strip(0, 480, 0, 'LANDING / WORKING LIGHTS', ['LAND', 'TAXI', 'WORK L', 'WORK R', 'NAV', 'STROBE', 'BEACON']);
  strip(544, 1024, 0, 'FLIGHT LIGHTS / GYROS / FLAPS', ['PANEL', 'FLOOD', 'GYRO', 'PITOT', 'FLAP', 'TRIM', 'AVIONICS']);
  if (fireboss) strip(0, 480, 128, 'FIRE BOSS — WATER SYSTEM', ['GEAR', 'PROBES', 'DOOR', 'ARM', 'FOAM', 'HYD', 'RUDDER']);
  else strip(0, 480, 128, 'DISPERSAL SYSTEMS / MISC', ['VALVE', 'PUMP', 'BRAKE', 'SMOKER', 'FLOW', 'HOPPER', 'LIGHT']);
  strip(544, 1024, 128, 'ENGINE OPERATION', ['BATT', 'GEN', 'START', 'IGN', 'BOOST', 'FUEL', 'MAG']);
  return c;
}
export const CONSOLE_KEYS = {
  ag: [null, null, null, null, null, null, null],
  fireboss: ['gear', 'probes', 'door', null, null, null, null],
};

// Hopper sight on the hopper's back wall at the floor: the scale (US gal for
// the product, litres for the Fire Boss water).
function drawHopperScale(fireboss) {
  const c = canvas(256, 512), g = c.getContext('2d');
  g.fillStyle = '#e4c21c'; g.fillRect(0, 0, 256, 512);
  g.fillStyle = '#121212';
  const max = fireboss ? 3000 : 800, step = fireboss ? 250 : 50;
  for (let v = 0; v <= max; v += step) {
    const y = 488 - (v / max) * 440;
    const maj = v % (step * 2) === 0;
    g.fillRect(150, y - 2, maj ? 60 : 36, 4);
    if (maj) txt(g, v, 112, y, 34, '#121212');
  }
  txt(g, fireboss ? 'LITROS\nÁGUA' : 'US GAL', 200, 26, 22, '#121212');
  return c;
}

// Air Tractor pedal plates (diamond tread round the triangle mark).
function drawPedalPlate() {
  const c = canvas(128, 160), g = c.getContext('2d');
  g.fillStyle = '#8c9298'; g.fillRect(0, 0, 128, 160);
  g.fillStyle = '#6c7278';
  for (let y = 0; y < 160; y += 10) for (let x = (y / 10) % 2 ? 5 : 0; x < 128; x += 10) g.fillRect(x, y, 5, 3);
  g.fillStyle = '#d8dce0';
  g.beginPath(); g.moveTo(64, 34); g.lineTo(104, 118); g.lineTo(24, 118); g.closePath(); g.fill();
  g.fillStyle = '#4a5056';
  g.beginPath(); g.moveTo(64, 56); g.lineTo(88, 108); g.lineTo(40, 108); g.closePath(); g.fill();
  txt(g, 'AIR TRACTOR', 64, 140, 13, '#e8ecef');
  return c;
}

// Matte "technical" surface for the panel sheet: fine stipple.
function drawStipple() {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
  const r = rng(802);
  for (let i = 0; i < 9000; i++) { const v = 100 + Math.floor(r() * 56); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * 256, r() * 256, 1.4, 1.4); }
  return c;
}

// --------------------------------------------------------------- screens
function drawEMS(g, d, run, power, A) {
  const [W, H] = AT802_SCREENS.ems;
  g.fillStyle = '#030507'; g.fillRect(0, 0, W, H);
  if (!power) return;
  g.fillStyle = '#0e1724'; g.fillRect(0, 0, W, 24);
  txt(g, 'ENGINE', 12, 12, 14, '#9fc4ff', true, 'left');
  txt(g, A.engine, W - 12, 12, 13, '#d6dde8', true, 'right');
  const G = '#1fbf3a', Y = '#f2c81e', R = '#e8302a', D = '#26303c';
  const arcG = (cx, cy, r, v, min, max, bands, label, val, unit) => {
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    const Aa = (x) => a0 + ((clamp(x, min, max) - min) / (max - min)) * (a1 - a0);
    g.lineWidth = 8;
    for (const [b0, b1, col] of bands) { g.strokeStyle = col; g.beginPath(); g.arc(cx, cy, r, Aa(b0), Aa(b1)); g.stroke(); }
    const a = Aa(v);
    g.strokeStyle = '#f5f5f5'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3); g.lineTo(cx + Math.cos(a) * (r + 5), cy + Math.sin(a) * (r + 5)); g.stroke();
    const warn = bands.find(([b0, b1, col]) => v >= b0 && v <= b1 && (col === R || col === Y));
    txt(g, val, cx, cy + 4, 27, warn ? warn[2] : '#3be35e', true, 'center', 'Arial');
    txt(g, label, cx, cy + r * 0.66, 12, '#c9d2dd');
    txt(g, unit, cx + r * 0.62, cy + r * 0.66, 10, '#8b97a6');
  };
  const tq = d.torque;
  arcG(64, 92, 48, d.ng, 0, 110, [[0, 52, D], [52, 101.5, G], [101.5, 104, Y], [104, 110, R]], 'NG', d.ng.toFixed(1), '%');
  arcG(186, 92, 48, d.itt, 0, 1000, [[0, 400, D], [400, 760, G], [760, 820, Y], [820, 1000, R]], 'ITT', String(Math.round(d.itt)), '°C');
  arcG(64, 222, 48, tq, 0, A.maxTq * 1.2, [[0, A.maxTq, G], [A.maxTq, A.maxTq * 1.05, Y], [A.maxTq * 1.05, A.maxTq * 1.2, R]], 'TORQ', String(Math.round(tq)), 'FT-LB');
  arcG(186, 222, 48, d.rpm, 0, 2000, [[0, 1000, D], [1000, 1700, G], [1700, 1760, Y], [1760, 2000, R]], 'NP', String(Math.round(d.rpm / 10) * 10), 'RPM');
  const row = (y, label, val, unit, col = '#3be35e') => {
    txt(g, label, 262, y, 13, '#c9d2dd', true, 'left');
    txt(g, val, 446, y, 20, col, true, 'right');
    txt(g, unit, 452, y + 1, 11, '#8b97a6', false, 'left');
  };
  const low = d.fuel < d.fuelCap * 0.15;
  row(44, 'F.FLOW', String(Math.round(d.fuelFlow)), 'L/H');
  row(72, 'FUEL', String(Math.round(d.fuel)), 'L', low ? R : '#3be35e');
  g.fillStyle = '#1b222c'; g.fillRect(262, 86, 230, 8);
  g.fillStyle = low ? R : G; g.fillRect(262, 86, 230 * clamp(d.fuel / d.fuelCap, 0, 1), 8);
  row(116, 'G-METER', (d.gLoad ?? 1).toFixed(1), 'G');
  for (const [i, lab] of ['OIL P', 'OIL T', 'FUEL P', 'VOLTS', 'OAT'].entries()) {
    const y = 144 + i * 26;
    row(y, lab, '---', '', '#56616f');
    txt(g, 'N/S', 452, y + 1, 10, '#56616f', true, 'left');
  }
  // Run timer, alerts.
  txt(g, 'FLIGHT TIMER', 262, 286, 12, '#c9d2dd', true, 'left');
  const hh = Math.floor(run / 3600), mm = Math.floor((run % 3600) / 60), ss = Math.floor(run % 60);
  txt(g, `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, 492, 288, 24, '#f2f2f2', true, 'right', 'monospace');
  const alerts = [];
  if (d.engine === 'cranking') alerts.push(['STARTER', Y]);
  if (d.beta) alerts.push(['BETA', '#3fa7ff']);
  if (low) alerts.push(['LOW FUEL', R]);
  if (d.stall > 0.5 && !d.onGround) alerts.push(['STALL', R]);
  if (d.itt > 820) alerts.push(['ITT', R]);
  g.fillStyle = '#0e1724'; g.fillRect(0, H - 40, W, 40);
  alerts.slice(0, 4).forEach(([t, col], i) => { g.fillStyle = col; rr(g, 10 + i * 124, H - 32, 114, 24, 4); g.fill(); txt(g, t, 67 + i * 124, H - 20, 14, '#05070a'); });
  if (!alerts.length) txt(g, 'NO ALERTS', W / 2, H - 20, 13, '#5d6876');
}

function drawADI(g, d, power) {
  const [W, H] = AT802_SCREENS.adi;
  g.fillStyle = '#020304'; g.fillRect(0, 0, W, H);
  if (!power) return;
  const cx = W / 2, cy = H / 2 + 6, pp = 4.2; // px per degree of pitch
  g.save();
  g.beginPath(); g.rect(4, 4, W - 8, H - 8); g.clip();
  g.translate(cx, cy);
  g.rotate(-d.bank);
  const off = (d.pitch * 180) / Math.PI * pp;
  g.fillStyle = '#2f7fd6'; g.fillRect(-400, -800 + off, 800, 800);
  g.fillStyle = '#8a5a2a'; g.fillRect(-400, off, 800, 800);
  g.strokeStyle = '#ffffff'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-400, off); g.lineTo(400, off); g.stroke();
  for (let p = -30; p <= 30; p += 5) {
    if (!p) continue;
    const y = off - p * pp, w = p % 10 === 0 ? 46 : 22;
    g.beginPath(); g.moveTo(-w, y); g.lineTo(w, y); g.stroke();
    if (p % 10 === 0) { txt(g, Math.abs(p), -w - 14, y, 13, '#ffffff'); txt(g, Math.abs(p), w + 14, y, 13, '#ffffff'); }
  }
  g.restore();
  // Bank scale and pointer.
  g.strokeStyle = '#ffffff'; g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, 98, -Math.PI * 5 / 6, -Math.PI / 6); g.stroke();
  for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const t = ((a - 90) * Math.PI) / 180, l = a % 30 === 0 ? 12 : 7;
    g.beginPath(); g.moveTo(cx + Math.cos(t) * 98, cy + Math.sin(t) * 98); g.lineTo(cx + Math.cos(t) * (98 + l), cy + Math.sin(t) * (98 + l)); g.stroke();
  }
  g.save(); g.translate(cx, cy); g.rotate(-d.bank);
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(0, -96); g.lineTo(-8, -82); g.lineTo(8, -82); g.closePath(); g.fill();
  g.restore();
  // Aircraft symbol and slip indicator.
  g.strokeStyle = '#ffd400'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(cx - 62, cy); g.lineTo(cx - 22, cy); g.lineTo(cx - 12, cy + 10); g.stroke();
  g.beginPath(); g.moveTo(cx + 62, cy); g.lineTo(cx + 22, cy); g.lineTo(cx + 12, cy + 10); g.stroke();
  g.fillStyle = '#ffd400'; g.fillRect(cx - 3, cy - 3, 6, 6);
  g.fillStyle = '#0a0a0a'; g.fillRect(cx - 34, H - 26, 68, 16);
  g.fillStyle = '#f2f2f2'; g.beginPath(); g.arc(cx + clamp((d.slip ?? 0) * 120, -28, 28), H - 18, 7, 0, Math.PI * 2); g.fill();
  txt(g, 'ATTITUDE', cx, 14, 12, '#cfd6de');
}

function drawLED(g, value, power, label) {
  const [W, H] = AT802_SCREENS.led;
  g.fillStyle = '#100404'; g.fillRect(0, 0, W, H);
  if (!power) return;
  const s = String(Math.max(0, Math.round(value))).padStart(5, ' ');
  g.font = 'bold 58px "Courier New", monospace'; g.textAlign = 'right'; g.textBaseline = 'middle';
  g.fillStyle = '#3a0806'; g.fillText('88888', W - 46, H / 2 + 3);
  g.fillStyle = '#ff2a18'; g.fillText(s, W - 46, H / 2 + 3);
  txt(g, label, W - 22, H / 2, 13, '#ff7a6a');
}

function drawAux(g, d, power, fireboss) {
  const [W, H] = AT802_SCREENS.aux;
  g.fillStyle = '#04070b'; g.fillRect(0, 0, W, H);
  if (!power) return;
  g.fillStyle = '#121d2b'; g.fillRect(0, 0, W, 28);
  const line = (y, l, v, col = '#eaf2ff') => { txt(g, l, 14, y, 16, '#8aa2b8', true, 'left'); txt(g, v, W - 14, y, 20, col, true, 'right'); };
  if (fireboss) {
    const w = d.water;
    txt(g, 'FIRE BOSS · WATER SYSTEM', W / 2, 14, 15, '#ff8a5c');
    line(52, 'WATER', `${Math.round(d.hopper)} / ${d.hopperCap} L`, '#7cc7ff');
    g.fillStyle = '#16212e'; g.fillRect(14, 66, W - 28, 10);
    g.fillStyle = '#2f8fe0'; g.fillRect(14, 66, (W - 28) * clamp(d.hopper / d.hopperCap, 0, 1), 10);
    line(98, 'PROBES', w ? (w.scooping ? `SCOOPING ${Math.round(w.flowIn)} L/S` : w.probesCmd ? 'DOWN' : 'UP') : '---', w?.scooping ? '#3be35e' : w?.probesCmd ? '#f2c81e' : '#eaf2ff');
    line(126, 'DOOR', w ? (w.dropping ? `OPEN ${Math.round(w.flowOut)} L/S` : 'CLOSED') : '---', w?.dropping ? '#ff5a3c' : '#eaf2ff');
    const gd = d.gearDown ?? 1;
    line(154, 'GEAR', gd > 0.98 ? 'DOWN · LAND' : gd < 0.02 ? 'UP · WATER' : 'IN TRANSIT', gd > 0.98 ? '#3be35e' : gd < 0.02 ? '#58b4ff' : '#f2c81e');
    line(182, 'SURFACE', d.onWater ? 'ON WATER' : d.onGround ? 'ON GROUND' : 'AIRBORNE', d.onWater ? '#58b4ff' : '#eaf2ff');
    const f = d.fire;
    line(212, 'FIRE', f ? `#${f.fire.id} ${Math.round(f.dist)} M ${String(Math.round(f.bearing)).padStart(3, '0')}° ${Math.round(f.fire.intensity * 100)}%` : 'NONE ACTIVE', f ? '#ffb35c' : '#5d6876');
  } else {
    txt(g, 'FLOW MONITOR', W / 2, 14, 15, '#9fe07a');
    line(56, 'FLOW', `${(d.flow * 60).toFixed(0)} L/MIN`, d.spray ? '#3be35e' : '#eaf2ff');
    line(90, 'HOPPER', `${Math.round(d.hopper)} L`);
    g.fillStyle = '#16212e'; g.fillRect(14, 104, W - 28, 10);
    g.fillStyle = '#5cc24a'; g.fillRect(14, 104, (W - 28) * clamp(d.hopper / d.hopperCap, 0, 1), 10);
    line(138, 'VALVE', d.spray ? 'OPEN' : 'CLOSED', d.spray ? '#3be35e' : '#eaf2ff');
    line(168, 'HEIGHT', `${(d.hgt ?? 0).toFixed(1)} M`);
    line(198, 'GND SPD', `${Math.round(d.gs ?? 0)} KT`);
  }
}

// ------------------------------------------------------------------ api
export function createAT802Panel({ reg = 'PR-AWX', variant = 'ag', vspeeds, A } = {}) {
  const fireboss = variant === 'fireboss';
  const v = vspeeds ?? (fireboss ? { vs0: 77, vs1: 91, vfe: 120, vne: 165 } : { vs0: 79, vs1: 92, vfe: 120, vne: 180 });
  const S = { ems: mk(...AT802_SCREENS.ems, 8), adi: mk(...AT802_SCREENS.adi), led: mk(...AT802_SCREENS.led), aux: mk(...AT802_SCREENS.aux) };
  for (const s of Object.values(S)) { s.g.fillStyle = '#030405'; s.g.fillRect(0, 0, s.c.width, s.c.height); s.tex.needsUpdate = true; }
  const dials = canvasTexture(drawDials(v), { aniso: 8 });
  const placards = canvasTexture(drawPlacards(v, fireboss), { aniso: 8 });
  const labels = canvasTexture(drawConsoleLabels(fireboss), { aniso: 8 });
  const hopperScale = canvasTexture(drawHopperScale(fireboss), { aniso: 4 });
  const pedal = canvasTexture(drawPedalPlate(), { aniso: 4 });
  const stipple = canvasTexture(drawStipple(), { srgb: false, aniso: 4 });
  stipple.wrapS = stipple.wrapT = 1000; // RepeatWrapping
  const gps = createAgroNav({ home: { x: BASE.pad.x, z: BASE.pad.z, name: 'BASE · PÁTIO', label: 'PÁTIO DA BASE (SEM CONTRATO)' } });
  const engine = { engine: fireboss ? 'PT6A-67F · 1600 SHP' : 'PT6A-65AG · 1295 SHP', maxTq: A?.turbine?.maxTorque ?? (fireboss ? 4940 : 4000) };
  let run = 0, last = performance.now(), slow = 0;
  const api = {
    variant, screens: S, dials, placards, labels, hopperScale, pedal, stipple, gps,
    texture: placards, // what aircraft.js calls the panel texture
    last: null, lit: {}, reg,
    get page() { return gps.page; },
    setPage: gps.setPage,
    nextPage: gps.nextPage,
    draw(d) {
      const now = performance.now(), dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      api.last = d;
      if (d.engine === 'running') run += dt;
      const power = d.engine !== 'off' || d.ng > 8;
      // Annunciator lamps (warning / caution) from the same data.
      api.lit = {
        warn: power && ((d.stall > 0.5 && !d.onGround) || d.itt > 820 || d.fuel < d.fuelCap * 0.05),
        caution: power && (d.fuel < d.fuelCap * 0.15 || d.engine === 'cranking' || (fireboss && (d.gearDown ?? 1) > 0.02 && (d.gearDown ?? 1) < 0.98)),
        gearDn: fireboss && (d.gearDown ?? 1) > 0.98, gearUp: fireboss && (d.gearDown ?? 1) < 0.02,
        transit: fireboss && (d.gearDown ?? 1) >= 0.02 && (d.gearDown ?? 1) <= 0.98,
        probes: fireboss && !!d.water?.probesCmd, scoop: fireboss && !!d.water?.scooping, door: fireboss && !!d.water?.dropping,
        onWater: fireboss && !!d.onWater, spray: !fireboss && !!d.spray,
      };
      redraw(S.adi, power ? `${d.pitch.toFixed(3)}|${d.bank.toFixed(3)}|${(d.slip ?? 0).toFixed(2)}` : 'off', (g) => drawADI(g, d, power));
      gps.draw(d, dt, power);
      slow -= dt;
      if (slow > 0) return;
      slow = 0.2;
      redraw(S.ems, power ? `${d.ng.toFixed(1)}|${Math.round(d.itt)}|${Math.round(d.rpm / 10)}|${Math.round(d.torque / 10)}|${Math.round(d.fuelFlow)}|${Math.round(d.fuel)}|${Math.floor(run)}|${d.engine}|${d.stall > 0.5}|${d.beta}|${(d.gLoad ?? 1).toFixed(1)}` : 'off', (g) => drawEMS(g, d, run, power, engine));
      const ledV = fireboss ? d.hopper : d.flow * 60;
      redraw(S.led, power ? `${Math.round(ledV)}` : 'off', (g) => drawLED(g, ledV, power, fireboss ? 'L' : 'L/M'));
      const w = d.water;
      redraw(S.aux, power ? (fireboss
        ? `${Math.round(d.hopper)}|${w?.probesCmd}|${w?.scooping}|${Math.round(w?.flowIn ?? 0)}|${w?.dropping}|${Math.round(w?.flowOut ?? 0)}|${(d.gearDown ?? 1).toFixed(2)}|${d.onWater}|${d.onGround}|${d.fire ? `${d.fire.fire.id}|${Math.round(d.fire.dist / 10)}|${Math.round(d.fire.bearing)}|${Math.round(d.fire.fire.intensity * 100)}` : '-'}`
        : `${(d.flow * 60).toFixed(0)}|${Math.round(d.hopper)}|${d.spray}|${(d.hgt ?? 0).toFixed(1)}|${Math.round(d.gs ?? 0)}`) : 'off', (g) => drawAux(g, d, power, fireboss));
    },
    setReg(r) { api.reg = r; },
  };
  return api;
}
void KT;
