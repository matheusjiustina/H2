// Grumman G-164A Super Ag-Cat (radial R-985) instrument panel — layout and
// textures for the cockpit of Prompt 02 (agcatCockpit.js), after the FSX
// reference's arrangement checked against the photographs of real G-164A
// cockpits:
//   - the raised black POD under the windshield: airspeed (mph, knots
//     inside), the compass window, the altimeter; the FUEL WARNING lamp
//     (push to test) and the red boost-pump switch on its right;
//   - beside the pod on the left, the white boom-pressure gauge on its own
//     bracket;
//   - the angular LOWER PANEL in three parts: on the left board the oil
//     gauge (pressure / temperature) and the tachometer with its hour
//     meter; on the right board the manifold pressure, the fuel quantity
//     (white face) and the cylinder-head temperature; between them the
//     hopper's sloped rear wall with its GROUND / FLIGHT gallon scale and
//     the product seen through the translucent fibreglass.
// Only instruments whose functions the flight model supplies: every needle
// reads Aircraft.instruments() (ias, altFt, hdg, rpm, mp, oilP, oilT, cht,
// fuel) or the game's sprayer (boom pressure: proportional to the flow the
// sprayer delivers — the game has no pressure model, see README). Dial faces
// are drawn once into an atlas; needles, the compass card, the hour meter,
// lamps and the product level are live. The AGROWINGS NAV unit
// (agroNav.js) is the game's GPS, the same as in the other cockpits.
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp, rng } from '../core/math.js';
import { roundRect } from './panel.js';
import { text, scale, radial } from './r44Panel.js';
import { createAgroNav } from './agroNav.js';
import { BASE } from '../world/layout.js';

const D2R = Math.PI / 180;
const KT_MPH = 1.15078;
const INK = '#f1f0ea', DIM = '#c9c9c1', GREEN = '#22a94a', YELLOW = '#f1c21b', RED = '#df2a1c', WHITE = '#f4f4f0';
const DARK = '#141414';

// ---------------------------------------------------------------- layout
// Panel-local metres: u to the pilot's right, v up the face.
export const AGCAT_PANEL = {
  pod: {
    out: { w: 0.4, h: 0.15, d: 0.065, r: 0.03 },
    face: { w: 0.35, h: 0.112, recess: 0.016 },
    dials: {
      asi: { u: -0.1, v: -0.004, r: 0.05, f: 0.044, cell: 0 },
      alt: { u: 0.1, v: -0.004, r: 0.05, f: 0.044, cell: 1 },
    },
    compass: { u: 0, v: 0.012, w: 0.066, h: 0.036 },
    lamp: { u: 0.164, v: 0.026, r: 0.0085 },
    pump: { u: 0.164, v: -0.024, w: 0.02, h: 0.03 },
  },
  boom: { r: 0.038, f: 0.033, cell: 7 },
  left: {
    w: 0.28, h: 0.22,
    dials: {
      oil: { u: -0.072, v: 0.03, r: 0.036, f: 0.031, cell: 4 },
      rpm: { u: 0.05, v: 0.015, r: 0.054, f: 0.047, cell: 2 },
    },
  },
  right: {
    w: 0.28, h: 0.22,
    dials: {
      mp: { u: -0.055, v: 0.012, r: 0.046, f: 0.04, cell: 3 },
      fuel: { u: 0.05, v: 0.055, r: 0.032, f: 0.028, cell: 6 },
      cht: { u: 0.066, v: -0.04, r: 0.03, f: 0.026, cell: 5 },
    },
  },
  gps: { w: 0.124, h: 0.09, d: 0.04, screen: { w: 0.098, h: 0.0674 }, keysV: -0.038, keysU: [-0.039, -0.013, 0.013, 0.039] },
};

// Dial angles (radians, clockwise from twelve o'clock as the pilot sees them).
export const AGCAT_ANG = {
  // Airspeed in mph: 40 at the bottom left, 180 mph after 300°.
  asi: (kt) => { const mph = Math.max(0, kt) * KT_MPH; return (-150 + ((clamp(mph, 40, 180) - 40) / 140) * 300) * D2R; },
  alt100: (ft) => ((((ft % 1000) + 1000) % 1000) / 1000) * Math.PI * 2,
  alt1000: (ft) => ((((ft % 10000) + 10000) % 10000) / 10000) * Math.PI * 2,
  rpm: (rpm) => (-135 + (clamp(rpm, 0, 3000) / 3000) * 270) * D2R,
  mp: (inHg) => (-135 + ((clamp(inHg, 10, 40) - 10) / 30) * 270) * D2R,
  // Oil gauge: pressure on the left half (bottom to top), temperature on
  // the right half (bottom to top).
  oilP: (psi) => (-150 + (clamp(psi, 0, 120) / 120) * 120) * D2R,
  oilT: (c) => (150 - (clamp(c, 0, 120) / 120) * 120) * D2R,
  cht: (c) => (-120 + (clamp(c, 0, 300) / 300) * 240) * D2R,
  fuel: (gal) => (-110 + (clamp(gal, 0, 46) / 46) * 220) * D2R,
  boom: (psi) => (-135 + (clamp(psi, 0, 100) / 100) * 270) * D2R,
};
export const AGCAT_ATLAS = { W: 2048, H: 1024, cell: 512, cols: 4, rows: 2 };
export const BOOM_PSI = 40; // boom pressure at the full metered flow (gauge reading)
const canvasAng = (a) => a - Math.PI / 2;

function arc(g, x, y, r, ang, v0, v1, col, w, rr = 0.93) {
  const a0 = ang(v0), a1 = ang(v1);
  g.strokeStyle = col; g.lineWidth = r * w;
  g.beginPath(); g.arc(x, y, r * rr, Math.min(a0, a1), Math.max(a0, a1)); g.stroke();
}
function faceBase(g, x, y, r, light = false) {
  const gr = g.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.1, x, y, r);
  if (light) { gr.addColorStop(0, '#fbfbf7'); gr.addColorStop(1, '#dcdcd4'); } else { gr.addColorStop(0, '#1e2124'); gr.addColorStop(1, '#08090a'); }
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}
// Ticks on a white face (scale() draws in the light ink).
function darkScale(g, x, y, r, ang, v0, v1, minor, major, num, size = 0.17) {
  for (let v = v0; v <= v1 + 1e-6; v += minor) {
    const a = ang(v), maj = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    g.strokeStyle = DARK; g.lineWidth = maj ? r * 0.045 : r * 0.022;
    g.beginPath(); g.moveTo(x + Math.cos(a) * r * (maj ? 0.8 : 0.87), y + Math.sin(a) * r * (maj ? 0.8 : 0.87)); g.lineTo(x + Math.cos(a) * r * 0.97, y + Math.sin(a) * r * 0.97); g.stroke();
    if (maj && num(v) !== null) text(g, num(v), x + Math.cos(a) * r * 0.64, y + Math.sin(a) * r * 0.64, Math.round(r * size), DARK, true);
  }
}

function drawDials(V) {
  const c = canvas(AGCAT_ATLAS.W, AGCAT_ATLAS.H), g = c.getContext('2d');
  g.fillStyle = '#060707'; g.fillRect(0, 0, c.width, c.height);
  const cell = (i) => ({ x: (i % 4) * 512 + 256, y: Math.floor(i / 4) * 512 + 256, r: 250 });
  const A = AGCAT_ANG;
  const T = (t, x, y, s, col = INK, bold = true) => text(g, t, x, y, s, col, bold);
  // 0 — airspeed, MPH outside (white arc none: no flaps; green from the
  // stall to the caution range, red line at the maximum), knots inside.
  {
    const { x, y, r } = cell(0);
    faceBase(g, x, y, r);
    const ang = (mph) => canvasAng(A.asi(mph / KT_MPH));
    const kt = (k) => k * KT_MPH, vno = V.vne * 0.85;
    arc(g, x, y, r, ang, kt(V.vs1), kt(vno), GREEN, 0.06, 0.885);
    arc(g, x, y, r, ang, kt(vno), kt(V.vne), YELLOW, 0.06, 0.885);
    radial(g, x, y, r, ang(kt(V.vne)), RED, 0.05);
    scale(g, x, y, r, ang, 40, 180, 5, 20, { numR: 0.67, size: 0.15 });
    for (let k = 40; k <= 150; k += 10) {
      const a = ang(kt(k));
      g.strokeStyle = '#d9c86a'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.44, y + Math.sin(a) * r * 0.44); g.lineTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5); g.stroke();
      if (k % 20 === 0) T(String(k), x + Math.cos(a) * r * 0.36, y + Math.sin(a) * r * 0.36, 20, '#d9c86a', false);
    }
    T('AIRSPEED', x, y - r * 0.14, 26, YELLOW); T('MPH', x, y + r * 0.14, 22, DIM, false); T('KNOTS', x, y + r * 0.26, 15, '#a99f5a', false);
  }
  // 1 — altimeter, feet (100 ft hand, 1,000 ft hand), Kollsman window.
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
    T('29.92', x + r * 0.38, y + r * 0.005, 20, WHITE, false);
  }
  // 2 — tachometer, hundreds of rpm, green 1,400–2,200, red line 2,300
  // (R-985 take-off rpm); the hour meter window.
  {
    const { x, y, r } = cell(2);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(A.rpm(v * 100));
    arc(g, x, y, r, ang, 14, 22, GREEN, 0.075, 0.9);
    radial(g, x, y, r, ang(23), RED, 0.06);
    scale(g, x, y, r, ang, 0, 30, 1, 5, { numR: 0.66, size: 0.2 });
    T('RPM', x, y - r * 0.3, 26); T('X 100', x, y - r * 0.17, 17, DIM, false);
    g.fillStyle = '#000'; roundRect(g, x - r * 0.33, y + r * 0.2, r * 0.66, r * 0.17, 5); g.fill();
    T('HOURS', x, y + r * 0.46, 15, DIM, false);
  }
  // 3 — manifold pressure, in.Hg, green 15–32, red line 36 (take-off).
  {
    const { x, y, r } = cell(3);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(A.mp(v));
    arc(g, x, y, r, ang, 15, 32, GREEN, 0.075, 0.9);
    radial(g, x, y, r, ang(36), RED, 0.06);
    scale(g, x, y, r, ang, 10, 40, 1, 5, { numR: 0.66, size: 0.19 });
    T('MANIFOLD', x, y + r * 0.26, 22); T('PRESSURE', x, y + r * 0.4, 22); T('IN. HG', x, y - r * 0.24, 18, DIM, false);
  }
  // 4 — oil: pressure (left, psi, green 60–90) and temperature (right,
  // °C, green 40–85, red line 100).
  {
    const { x, y, r } = cell(4);
    faceBase(g, x, y, r);
    const angP = (v) => canvasAng(A.oilP(v)), angT = (v) => canvasAng(A.oilT(v));
    arc(g, x, y, r, angP, 60, 90, GREEN, 0.075, 0.9);
    radial(g, x, y, r, angP(100), RED, 0.05);
    scale(g, x, y, r, angP, 0, 120, 10, 40, { numR: 0.68, size: 0.15 });
    arc(g, x, y, r, angT, 40, 85, GREEN, 0.075, 0.9);
    radial(g, x, y, r, angT(100), RED, 0.05);
    scale(g, x, y, r, angT, 0, 120, 10, 40, { numR: 0.68, size: 0.15 });
    T('OIL', x, y - r * 0.32, 26); T('PSI', x - r * 0.3, y + r * 0.06, 18, DIM, false); T('°C', x + r * 0.3, y + r * 0.06, 18, DIM, false);
  }
  // 5 — cylinder-head temperature, °C, green 120–232, red line 260.
  {
    const { x, y, r } = cell(5);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(A.cht(v));
    arc(g, x, y, r, ang, 120, 232, GREEN, 0.075, 0.9);
    radial(g, x, y, r, ang(260), RED, 0.06);
    scale(g, x, y, r, ang, 0, 300, 25, 100, { numR: 0.66, size: 0.18 });
    T('CYL', x, y + r * 0.28, 26); T('TEMP °C', x, y + r * 0.45, 18, DIM, false);
  }
  // 6 — fuel quantity, US gallons of the 46-gal centre-section tank (white
  // face, as on the reference).
  {
    const { x, y, r } = cell(6);
    faceBase(g, x, y, r, true);
    const ang = (v) => canvasAng(A.fuel(v));
    arc(g, x, y, r, ang, 0, 5, RED, 0.08, 0.86);
    darkScale(g, x, y, r, ang, 0, 46, 11.5 / 2, 11.5, (v) => (v === 0 ? 'E' : v > 45 ? 'F' : v === 23 ? '½' : null), 0.22);
    text(g, 'FUEL', x, y + r * 0.26, 40, DARK, true); text(g, 'U.S. GAL', x, y + r * 0.46, 20, '#555', false);
  }
  // 7 — boom pressure, psi (white face, "POUNDS").
  {
    const { x, y, r } = cell(7);
    faceBase(g, x, y, r, true);
    const ang = (v) => canvasAng(A.boom(v));
    darkScale(g, x, y, r, ang, 0, 100, 5, 20, (v) => String(v), 0.17);
    text(g, 'POUNDS', x, y + r * 0.3, 26, DARK, true); text(g, 'BOOM', x, y + r * 0.46, 20, '#555', false);
  }
  return c;
}

// Compass card: the band of headings seen through the pod's window.
function drawCompassCard() {
  const W = 1024, H = 128, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#0d0e0f'; g.fillRect(0, 0, W, H);
  for (let d = 0; d < 360; d += 5) {
    const x = (1 - d / 360) * W, maj = d % 30 === 0;
    g.strokeStyle = '#ecebe4'; g.lineWidth = maj ? 3 : 1.6;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, maj ? 34 : d % 10 === 0 ? 26 : 18); g.stroke();
    if (maj) { const lab = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] ?? String(d / 10); text(g, lab, x, 72, lab.length > 1 ? 40 : 50, '#ecebe4', true); }
  }
  return c;
}
function drawGpsBezel() {
  const c = canvas(256, 192), g = c.getContext('2d');
  g.fillStyle = '#1a1c1f'; g.fillRect(0, 0, 256, 192);
  const r = rng(13);
  for (let i = 0; i < 1200; i++) { const v = r() < 0.5 ? 46 : 18; g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(r() * 256, r() * 192, 2, 2); }
  text(g, 'AGROWINGS', 98, 11, 12, '#7fd6ff'); text(g, 'NAV', 150, 11, 12, '#e8eef2');
  return c;
}
// Placards (black plates, light lettering) on one small strip texture.
export const AGCAT_PLACARDS = { W: 512, H: 256, rows: [['FUEL WARNING', 'PUSH TO TEST'], ['MAGNETOS'], ['BOOST PUMP'], ['HOPPER DUMP', 'PULL'], ['MASTER  ALT  NAV  STROBE'], ['NO SMOKING'], ['RESTRICTED', 'CATEGORY'], ['THR  PROP  MIX']] };
function drawPlacards() {
  const P = AGCAT_PLACARDS, c = canvas(P.W, P.H), g = c.getContext('2d');
  const h = P.H / P.rows.length;
  P.rows.forEach((lines, i) => {
    g.fillStyle = '#0f1011'; g.fillRect(0, i * h, P.W, h);
    g.strokeStyle = '#cfcfc6'; g.lineWidth = 2; g.strokeRect(3, i * h + 3, P.W - 6, h - 6);
    lines.forEach((t, k) => text(g, t, P.W / 2, i * h + h * ((k + 1) / (lines.length + 1)), lines.length > 1 ? 13 : 17, '#ecece4', true));
  });
  return c;
}

// The hopper's rear wall, seen below the pod between the boards: translucent
// orange-tan fibreglass with the stencilled gallon scale (GROUND | FLIGHT:
// the same level reads differently on three wheels and in level flight) and
// the product line behind it.
export const AGCAT_HOPPER = { W: 256, H: 512, cap: 1136 };
const HOP_WIN = { top: 70, bot: 470 };
// The product through the translucent wall (hopperLiquid.js): empty at row
// 470, 300 US gal (the hopper's 1,136 L) at row 70, the whole wall's width.
export const AGCAT_SIGHT_LIQUID = {
  size: [AGCAT_HOPPER.W, AGCAT_HOPPER.H],
  windows: [{ box: [0, AGCAT_HOPPER.W, 0, AGCAT_HOPPER.H], rows: [[470, 0], [70, 1]], top: [60, 40, 15, 0.5], bot: [40, 25, 8, 0.62], men: [255, 235, 190, 0.55], menPx: 3 }],
};
function drawHopperBg() {
  const c = canvas(AGCAT_HOPPER.W, AGCAT_HOPPER.H), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, AGCAT_HOPPER.H);
  gr.addColorStop(0, '#b6824a'); gr.addColorStop(1, '#8c5a2c');
  g.fillStyle = gr; g.fillRect(0, 0, AGCAT_HOPPER.W, AGCAT_HOPPER.H);
  const r = rng(29);
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,220,170' : '60,30,10'},${0.04 + r() * 0.07})`; g.fillRect(r() * 256, r() * 512, 1 + r() * 2, 1 + r() * 2); }
  text(g, 'GROUND', 74, 40, 22, '#2a160a', true); text(g, 'FLIGHT', 186, 40, 22, '#2a160a', true);
  // Gallons: 50…300 on the ground column, the flight column offset (nose
  // down in flight: the level reads lower at the back of the hopper).
  for (let gal = 50; gal <= 300; gal += 25) {
    const yG = HOP_WIN.bot - (gal / 300) * (HOP_WIN.bot - HOP_WIN.top), yF = Math.min(HOP_WIN.bot, yG + 26);
    const maj = gal % 50 === 0;
    g.strokeStyle = '#2a160a'; g.lineWidth = maj ? 4 : 2;
    g.beginPath(); g.moveTo(40, yG); g.lineTo(maj ? 108 : 82, yG); g.stroke();
    g.beginPath(); g.moveTo(maj ? 148 : 174, yF); g.lineTo(216, yF); g.stroke();
    if (maj) { text(g, String(gal), 128, yG, 20, '#2a160a', true); }
  }
  return c;
}

export function createAgCatPanel({ reg = 'PR-GAC' } = {}) {
  const dialC = drawDials({ vs1: 58, vne: 128 });
  const dials = canvasTexture(dialC, { aniso: 8 });
  const card = canvasTexture(drawCompassCard(), { aniso: 4, repeat: true });
  const bezel = canvasTexture(drawGpsBezel(), { aniso: 4 });
  const placards = canvasTexture(drawPlacards(), { aniso: 4 });
  const hopBg = drawHopperBg();
  const hopC = canvas(AGCAT_HOPPER.W, AGCAT_HOPPER.H), hg = hopC.getContext('2d');
  const hopper = canvasTexture(hopC, { aniso: 4 });
  const mk = (w, h) => { const c = canvas(w, h); return { c, g: c.getContext('2d'), tex: canvasTexture(c, { aniso: 4 }), key: '' }; };
  const hobbs = mk(192, 48);
  const gps = createAgroNav({ home: { x: BASE.pad.x, z: BASE.pad.z, name: 'BASE · PÁTIO', label: 'PÁTIO DA BASE (SEM CONTRATO)' } });
  const redraw = (s, key, fn) => { if (key === s.key) return; s.key = key; fn(s.g); s.tex.needsUpdate = true; };
  let lastNow = performance.now(), hours = 3412.6, lastLvl = -1, vKey = '';
  // The wall and its scales only: the product is drawn live by the wall's
  // material (hopperLiquid.js, AGCAT_SIGHT_LIQUID).
  hg.drawImage(hopBg, 0, 0);
  hopper.needsUpdate = true;
  const api = {
    dials, card, bezel, placards, hopper, hobbs, gps,
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
      const vk = [d.vs1, d.vne].join();
      if (d.vne && vk !== vKey) { vKey = vk; dialC.getContext('2d').drawImage(drawDials(d), 0, 0); dials.needsUpdate = true; }
      // Lamp: low fuel (a sixth of the tank) with the master on.
      api.lit = { fuel: master && d.fuel < d.fuelCap * 0.15 };
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
    setReg(r) { api.reg = r; },
  };
  return api;
}
