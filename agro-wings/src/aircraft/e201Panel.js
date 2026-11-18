// Embraer EMB-201A Ipanema instrument panel — layout and textures for the
// cockpit (e201Cockpit.js), after the photograph of a yellow EMB-201 cabin
// (grey panel under a dark padded lip; on the left three small engine
// dials and a digital hour meter; the agricultural moving-map left of the
// centre with its coloured keys under it; on the right the altimeter over
// the airspeed and the tachometer, a smaller dial lower right; the row of
// toggles and breakers along the bottom; a control box at the bottom
// right; below the panel the hopper's front wall with its round sight
// window and gallon scale).
// Instruments are assigned from what the flight model supplies
// (Aircraft.instruments(): ias, altFt, rpm, mp, oilP, oilT, cht, fuel)
// and what an IO-540 agricultural aircraft carries; the photograph shows
// the dials' positions and sizes, not their legends — see README. The
// moving map of the photograph (an aftermarket unit) is the game's own GPS
// (agroNav.js) here, in a housing of that size and place.
// Dial faces are drawn once into an atlas; needles, the hour meter and the
// hopper level are live (the level redrawn only when it moves by 1 %).
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp, rng } from '../core/math.js';
import { roundRect } from './panel.js';
import { text, scale, radial } from './r44Panel.js';
import { createAgroNav } from './agroNav.js';
import { BASE } from '../world/layout.js';

const D2R = Math.PI / 180;
const KMH = 1.852;
const INK = '#f1f0ea', DIM = '#c9c9c1', GREEN = '#22a94a', YELLOW = '#f1c21b', RED = '#df2a1c', WHITE = '#f4f4f0', DARK = '#141414';

// ---------------------------------------------------------------- layout
// Panel-local metres: u to the pilot's right, v up the face (origin: the
// face's centre).
export const E201_PANEL = {
  // The face, after the photographs of real 201 panels: three plates —
  // light-grey instrument plates left and right, a dark centre plate set
  // back holding the GPS — under an arched padded hood; the top edge arches
  // up toward the centre, the sides lean in toward the bottom.
  half: 0.435, halfBot: 0.405, top: 0.15, topArc: 0.05, bottom: -0.14, bottomC: -0.125,
  split: [-0.13, 0.12], // left plate | centre | right plate
  recess: 0.015, // the centre plate's depth behind the side plates
  depth: 0.12,
  // Left plate: fuel and altimeter on top, the dimmer, tachometer and
  // airspeed below, the switch strip at the bottom. Right plate: manifold
  // pressure and the hour meter on top, oil and cylinder-head temperature
  // below, the spray box and the placards at the bottom.
  dials: {
    fuel: { u: -0.3, v: 0.118, r: 0.034, f: 0.03, cell: 6 },
    alt: { u: -0.195, v: 0.118, r: 0.042, f: 0.038, cell: 1 },
    rpm: { u: -0.3, v: 0.02, r: 0.046, f: 0.041, cell: 2 },
    asi: { u: -0.19, v: 0.02, r: 0.046, f: 0.041, cell: 0 },
    mp: { u: 0.215, v: 0.1, r: 0.046, f: 0.041, cell: 3 },
    oil: { u: 0.205, v: -0.02, r: 0.042, f: 0.038, cell: 4 },
    cht: { u: 0.31, v: -0.02, r: 0.036, f: 0.032, cell: 5 },
  },
  hobbs: { u: 0.33, v: 0.105, w: 0.056, h: 0.03 },
  // Centre: the GPS (the game's AGROWINGS NAV) in its box, the page keys
  // under the screen; a slot and the AVGAS plate above it.
  gps: { u: -0.005, v: -0.008, w: 0.23, h: 0.2, d: 0.07, screen: { w: 0.19, h: 0.128 }, keysV: -0.075, keysU: [-0.075, -0.025, 0.025, 0.075] },
  slot: { u: -0.035, v: 0.128, w: 0.1, h: 0.026 },
  label: { u: 0.37, v: 0.045, w: 0.07, h: 0.028 }, // black placard (operating limitations)
  limits: { u: 0.37, v: -0.11, w: 0.07, h: 0.013 },
  avgas: { u: 0.065, v: 0.128 },
  key: { u: -0.395, v: -0.08 }, // magneto key
  switches: { u0: -0.355, u1: -0.165, v: -0.075, n: 7 },
  breakers: { u0: -0.355, u1: -0.165, v: -0.108, n: 8 },
  dimmer: { u: -0.395, v: 0.03 },
  box: { u: 0.25, v: -0.105, w: 0.15, h: 0.045 }, // the spray control box
  lamp: { u: -0.395, v: 0.12 },
  vents: [],
};

// Dial angles (radians, clockwise from twelve o'clock as the pilot sees them).
export const E201_ANG = {
  // Airspeed in knots: 40 at the bottom left, 160 kt after 300°.
  asi: (kt) => (-150 + ((clamp(kt, 40, 160) - 40) / 120) * 300) * D2R,
  alt100: (ft) => ((((ft % 1000) + 1000) % 1000) / 1000) * Math.PI * 2,
  alt1000: (ft) => ((((ft % 10000) + 10000) % 10000) / 10000) * Math.PI * 2,
  rpm: (rpm) => (-135 + (clamp(rpm, 0, 3500) / 3500) * 270) * D2R,
  mp: (inHg) => (-135 + ((clamp(inHg, 10, 35) - 10) / 25) * 270) * D2R,
  oilP: (psi) => (-150 + (clamp(psi, 0, 120) / 120) * 120) * D2R,
  oilT: (c) => (150 - (clamp(c, 0, 120) / 120) * 120) * D2R,
  cht: (c) => (-120 + (clamp(c, 0, 300) / 300) * 240) * D2R,
  fuel: (l) => (-120 + (clamp(l, 0, 292) / 292) * 240) * D2R,
};
export const E201_ATLAS = { W: 2048, H: 1024, cell: 512, cols: 4, rows: 2 };
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
  const c = canvas(E201_ATLAS.W, E201_ATLAS.H), g = c.getContext('2d');
  g.fillStyle = '#060707'; g.fillRect(0, 0, c.width, c.height);
  const cell = (i) => ({ x: (i % 4) * 512 + 256, y: Math.floor(i / 4) * 512 + 256, r: 250 });
  const A = E201_ANG;
  const T = (t, x, y, s, col = INK, bold = true) => text(g, t, x, y, s, col, bold);
  // 0 — airspeed, knots (white arc flaps, green to the caution range,
  // yellow, red line), km/h on the inner ring.
  {
    const { x, y, r } = cell(0);
    faceBase(g, x, y, r);
    const ang = (kt) => canvasAng(A.asi(kt)), vno = V.vne * 0.82;
    arc(g, x, y, r, ang, V.vs0, V.vfe, WHITE, 0.05, 0.83);
    arc(g, x, y, r, ang, V.vs1, vno, GREEN, 0.06, 0.885);
    arc(g, x, y, r, ang, vno, V.vne, YELLOW, 0.06, 0.885);
    radial(g, x, y, r, ang(V.vne), RED, 0.05);
    scale(g, x, y, r, ang, 40, 160, 5, 20, { numR: 0.67, size: 0.16 });
    for (let k = 80; k <= 280; k += 20) {
      const a = ang(k / KMH);
      g.strokeStyle = '#d9c86a'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42); g.lineTo(x + Math.cos(a) * r * 0.48, y + Math.sin(a) * r * 0.48); g.stroke();
      if (k % 40 === 0) T(String(k), x + Math.cos(a) * r * 0.34, y + Math.sin(a) * r * 0.34, 19, '#d9c86a', false);
    }
    T('AIRSPEED', x, y - r * 0.15, 25, YELLOW); T('KNOTS', x, y + r * 0.15, 21, DIM, false); T('KM/H', x, y + r * 0.27, 15, '#a99f5a', false);
  }
  // 1 — altimeter, feet (100 ft and 1,000 ft hands), Kollsman window (hPa).
  {
    const { x, y, r } = cell(1);
    faceBase(g, x, y, r);
    for (let i = 0; i < 50; i++) {
      const a = canvasAng((i / 50) * Math.PI * 2), maj = i % 5 === 0;
      g.strokeStyle = INK; g.lineWidth = maj ? r * 0.045 : r * 0.022;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * (maj ? 0.8 : 0.87), y + Math.sin(a) * r * (maj ? 0.8 : 0.87)); g.lineTo(x + Math.cos(a) * r * 0.97, y + Math.sin(a) * r * 0.97); g.stroke();
      if (maj) T(String(i / 5), x + Math.cos(a) * r * 0.64, y + Math.sin(a) * r * 0.64, 46);
    }
    T('ALT', x, y - r * 0.3, 24, DIM, false); T('100 FEET', x, y - r * 0.18, 16, DIM, false);
    g.fillStyle = '#000'; roundRect(g, x + r * 0.2, y - r * 0.06, r * 0.36, r * 0.13, 5); g.fill();
    T('1013', x + r * 0.38, y + r * 0.005, 20, WHITE, false);
  }
  // 2 — tachometer (IO-540-K: green 2,200–2,700, red line 2,700), hundreds
  // of rpm.
  {
    const { x, y, r } = cell(2);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(A.rpm(v * 100));
    arc(g, x, y, r, ang, 22, 27, GREEN, 0.075, 0.9);
    radial(g, x, y, r, ang(27), RED, 0.06);
    scale(g, x, y, r, ang, 0, 35, 1, 5, { numR: 0.66, size: 0.2 });
    T('RPM', x, y - r * 0.3, 26); T('X 100', x, y - r * 0.17, 17, DIM, false);
  }
  // 3 — manifold pressure, in.Hg (normally aspirated: green 15–28.3).
  {
    const { x, y, r } = cell(3);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(A.mp(v));
    arc(g, x, y, r, ang, 15, 28.3, GREEN, 0.075, 0.9);
    scale(g, x, y, r, ang, 10, 35, 1, 5, { numR: 0.66, size: 0.19 });
    T('MANIFOLD', x, y + r * 0.26, 22); T('PRESSURE', x, y + r * 0.4, 22); T('IN. HG', x, y - r * 0.24, 18, DIM, false);
  }
  // 4 — oil: pressure (left, psi, green 60–90) and temperature (right, °C,
  // green 40–100, red line 118).
  {
    const { x, y, r } = cell(4);
    faceBase(g, x, y, r);
    const angP = (v) => canvasAng(A.oilP(v)), angT = (v) => canvasAng(A.oilT(v));
    arc(g, x, y, r, angP, 60, 90, GREEN, 0.075, 0.9);
    radial(g, x, y, r, angP(100), RED, 0.05);
    scale(g, x, y, r, angP, 0, 120, 10, 40, { numR: 0.68, size: 0.15 });
    arc(g, x, y, r, angT, 40, 100, GREEN, 0.075, 0.9);
    radial(g, x, y, r, angT(118), RED, 0.05);
    scale(g, x, y, r, angT, 0, 120, 10, 40, { numR: 0.68, size: 0.15 });
    T('OIL', x, y - r * 0.32, 26); T('PSI', x - r * 0.3, y + r * 0.06, 18, DIM, false); T('°C', x + r * 0.3, y + r * 0.06, 18, DIM, false);
  }
  // 5 — cylinder-head temperature, °C (green 120–240, red line 260).
  {
    const { x, y, r } = cell(5);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(A.cht(v));
    arc(g, x, y, r, ang, 120, 240, GREEN, 0.075, 0.9);
    radial(g, x, y, r, ang(260), RED, 0.06);
    scale(g, x, y, r, ang, 0, 300, 25, 100, { numR: 0.66, size: 0.18 });
    T('CYL', x, y + r * 0.28, 26); T('TEMP °C', x, y + r * 0.45, 18, DIM, false);
  }
  // 6 — fuel, litres of the two wing tanks together (292 L).
  {
    const { x, y, r } = cell(6);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(A.fuel(v));
    arc(g, x, y, r, ang, 0, 30, RED, 0.08, 0.88);
    scale(g, x, y, r, ang, 0, 292, 36.5, 73, { numR: 0.64, size: 0.2, num: (v) => (v < 1 ? 'E' : v > 291 ? 'F' : Math.abs(v - 146) < 1 ? '½' : null) });
    T('FUEL', x, y + r * 0.28, 28); T('LITROS', x, y + r * 0.45, 16, DIM, false);
  }
  return c;
}

function drawGpsBezel() {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#1b1d20'; g.fillRect(0, 0, 256, 256);
  const r = rng(17);
  for (let i = 0; i < 1500; i++) { const v = r() < 0.5 ? 48 : 16; g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(r() * 256, r() * 256, 2, 2); }
  text(g, 'AGROWINGS', 104, 14, 14, '#7fd6ff'); text(g, 'NAV', 164, 14, 14, '#e8eef2');
  return c;
}
// Placards: one strip of small plates (dark or light), each row one plate.
export const E201_PLACARDS = {
  W: 512, H: 512,
  rows: [
    { lines: ['MASTER  ALT  BCN  NAV  STRB  LDG  BOMBA  RÁDIO  GPS'], light: true },
    { lines: ['AVGAS 100 / 100LL'], dark: true },
    { lines: ['OPERAÇÃO RESTRITA', 'VEDADAS AS MANOBRAS ACROBÁTICAS'], dark: true },
    { lines: ['POT   HÉLICE   MIST'], light: true },
    { lines: ['ALIJAMENTO', 'PUXE'], dark: true },
    { lines: ['NAV  ·  SPRAY  ·  AUX'], dark: true },
    { lines: ['MAGNETOS'], light: true },
    { lines: ['VNE 140 KT  ·  VA 105 KT'], dark: true },
  ],
};
function drawPlacards() {
  const P = E201_PLACARDS, c = canvas(P.W, P.H), g = c.getContext('2d');
  const h = P.H / P.rows.length;
  P.rows.forEach(({ lines, dark }, i) => {
    g.fillStyle = dark ? '#0f1011' : '#c9cbc6'; g.fillRect(0, i * h, P.W, h);
    g.strokeStyle = dark ? '#cfcfc6' : '#55585a'; g.lineWidth = 2; g.strokeRect(3, i * h + 3, P.W - 6, h - 6);
    lines.forEach((t, k) => text(g, t, P.W / 2, i * h + h * ((k + 1) / (lines.length + 1)), lines.length > 1 ? 15 : 18, dark ? '#ecece4' : '#1a1b1c', true));
  });
  return c;
}

// The hopper's front wall under the panel: cream fibreglass with the round
// sight window (the product seen through it) and the stencilled gallon /
// litre marks beside it.
export const E201_HOPPER = { W: 512, H: 512, cap: 680, win: { x: 300, y: 250, r: 72 } };
// The product in the round sight window (hopperLiquid.js): empty at the
// window's bottom, full at its top.
export const E201_SIGHT_LIQUID = {
  size: [512, 512],
  windows: [{ box: [228, 372, 178, 322], mask: { circle: [300, 250, 72] }, rows: [[322, 0], [178, 1]], top: [150, 170, 120, 0.9], bot: [70, 90, 60, 0.95], men: [235, 245, 220, 0.7], menPx: 3 }],
};
function drawHopperBg() {
  const H = E201_HOPPER, c = canvas(H.W, H.H), g = c.getContext('2d');
  g.fillStyle = '#c4b38f'; g.fillRect(0, 0, H.W, H.H);
  const r = rng(31);
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,250,235' : '70,60,40'},${0.03 + r() * 0.06})`; g.fillRect(r() * H.W, r() * H.H, 1 + r() * 2, 1 + r() * 2); }
  // Litre marks on the right of the window.
  for (let l = 100; l <= 600; l += 100) {
    const y = H.win.y + H.win.r - (l / 700) * 2 * H.win.r;
    g.fillStyle = '#2a2622'; g.fillRect(H.win.x + H.win.r + 14, y - 2, 22, 4);
    text(g, String(l), H.win.x + H.win.r + 58, y, 17, '#2a2622', true);
  }
  text(g, 'LITROS', 300 + 72 + 50, 250 - 72 - 22, 16, '#2a2622', true);
  return c;
}

export function createE201Panel({ reg = 'PR-IPC' } = {}) {
  let dialC = drawDials({ vs0: 50, vs1: 58, vfe: 95, vne: 140 });
  const dials = canvasTexture(dialC, { aniso: 8 });
  const bezel = canvasTexture(drawGpsBezel(), { aniso: 4 });
  const placards = canvasTexture(drawPlacards(), { aniso: 4 });
  const hopBg = drawHopperBg();
  const H = E201_HOPPER;
  const hopC = canvas(H.W, H.H), hg = hopC.getContext('2d');
  const hopper = canvasTexture(hopC, { aniso: 4 });
  const mk = (w, h) => { const c = canvas(w, h); return { c, g: c.getContext('2d'), tex: canvasTexture(c, { aniso: 4 }), key: '' }; };
  const hobbs = mk(192, 96);
  const gps = createAgroNav({ home: { x: BASE.pad.x, z: BASE.pad.z, name: 'BASE · PÁTIO', label: 'PÁTIO DA BASE (SEM CONTRATO)' } });
  const redraw = (s, key, fn) => { if (key === s.key) return; s.key = key; fn(s.g); s.tex.needsUpdate = true; };
  let lastNow = performance.now(), hours = 2786.4, lastLvl = -1, vKey = '';
  // The sight window without the product (drawn live by the wall's
  // material: hopperLiquid.js, E201_SIGHT_LIQUID): dark well, glint, bezel.
  {
    hg.drawImage(hopBg, 0, 0);
    const { x, y, r } = H.win;
    hg.save();
    hg.beginPath(); hg.arc(x, y, r, 0, Math.PI * 2); hg.clip();
    hg.fillStyle = '#2b3236'; hg.fillRect(x - r, y - r, 2 * r, 2 * r);
    hg.fillStyle = 'rgba(255,255,255,0.08)'; hg.beginPath(); hg.ellipse(x - r * 0.3, y - r * 0.4, r * 0.5, r * 0.25, -0.5, 0, Math.PI * 2); hg.fill();
    hg.restore();
    hg.strokeStyle = '#3a3936'; hg.lineWidth = 12; hg.beginPath(); hg.arc(x, y, r + 6, 0, Math.PI * 2); hg.stroke();
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; hg.fillStyle = '#8a8d90'; hg.beginPath(); hg.arc(x + Math.cos(a) * (r + 6), y + Math.sin(a) * (r + 6), 4, 0, Math.PI * 2); hg.fill(); }
    hopper.needsUpdate = true;
  }
  const api = {
    dials, bezel, placards, hopper, hobbs, gps,
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
      if (d.vne && vk !== vKey) { vKey = vk; dialC.getContext('2d').drawImage(drawDials(d), 0, 0); dials.needsUpdate = true; }
      api.lit = { fuel: master && d.fuel < d.fuelCap * 0.15, spray: master && !!d.spray };
      if (run) hours += dt / 3600;
      // Digital hour meter (the blue unit at the top left of the panel).
      redraw(hobbs, master ? (hours * 10).toFixed(0) : 'off', (g) => {
        g.fillStyle = '#16305c'; g.fillRect(0, 0, 192, 96);
        g.fillStyle = master ? '#9fc3a0' : '#3c4a3e'; g.fillRect(14, 22, 164, 52);
        if (master) text(g, (hours % 100000).toFixed(1), 96, 49, 34, '#152015', true);
        text(g, 'HOURS', 96, 12, 14, '#c9d6ea', true);
      });
      gps.draw(d, dt, master);
    },
    setReg(r) { api.reg = r; },
  };
  return api;
}
