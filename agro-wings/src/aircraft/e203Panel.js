// EMB-203 Ipanema instrument panel: layout and textures, after the cabin of
// an EMB-203 in service (PS-SBF, start and taxi video) — the four photos of
// earlier Ipanemas gave the shapes, materials and perspective. One coherent
// 203 fit for the IO-540-K1J5 on ethanol:
//   - left plate: accelerometer, airspeed (MPH, knots inside), altimeter;
//     manifold pressure / fuel flow, CYL / OIL temperatures, tachometer with
//     its hour meter; the red fuel placard, the light switches and the
//     breaker row under them;
//   - beside it: the starter lamp and the ignition key, the ALTERN., OIL
//     PRESSURE and LOW FUEL lamps, the panel-mounted wet compass, the lamp
//     test switch and the charge / discharge ammeter;
//   - centre: the big window into the yellow fibreglass hopper (upper
//     graduations) with the compass card under it; the elevator trim
//     indicator, the narrow lower hopper window and the quartz chronometer;
//   - right: the fuel totalizer, the switch block (master, alternator,
//     boost pump, panel lights), the AGROWINGS NAV unit (the game's own GPS,
//     agroNav.js) and the operating placards.
// Dial faces are drawn once into an atlas (512 px per dial); needles, the
// compass card, the key and the switches are 3D (e203Cockpit.js). Only the
// LCDs, the hour meter, the hopper level and the GPS screen are redrawn, and
// only when what they show changes. Every value comes from
// Aircraft.instruments(): nothing is invented to fill a dial.
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp, rng } from '../core/math.js';
import { roundRect } from './panel.js';
import { screw, text, scale, radial } from './r44Panel.js';
import { createAgroNav } from './agroNav.js';
import { BASE } from '../world/layout.js';

const D2R = Math.PI / 180;
const KT_MPH = 1.15078, C2F = (c) => c * 1.8 + 32;
const INK = '#f1f0ea', GREEN = '#22a94a', YELLOW = '#f1c21b', RED = '#df2a1c', WHITE = '#f4f4f0';

// Panel frame (metres): u to the pilot's right, v up the face from its
// bottom edge. The outline (the cabin section under the glareshield) is
// built in e203Cockpit.js; everything here sits inside it.
export const E203_PANEL = {
  w: 0.96, h: 0.36, W: 2048, H: 768,
  // Round instruments: bezel radius r, face radius f, atlas cell.
  dials: {
    accel: { u: -0.335, v: 0.215, r: 0.031, f: 0.0255, cell: 5 },
    asi: { u: -0.245, v: 0.215, r: 0.0415, f: 0.0365, cell: 0 },
    alt: { u: -0.155, v: 0.215, r: 0.0415, f: 0.0365, cell: 1 },
    mpff: { u: -0.335, v: 0.125, r: 0.0415, f: 0.0365, cell: 3 },
    cht: { u: -0.245, v: 0.125, r: 0.0415, f: 0.0365, cell: 4 },
    rpm: { u: -0.155, v: 0.125, r: 0.0415, f: 0.0365, cell: 2 },
    amp: { u: -0.064, v: 0.085, r: 0.031, f: 0.0255, cell: 6 },
    chrono: { u: 0.103, v: 0.104, r: 0.029, f: 0.024, cell: 7 },
  },
  // Sub-plates (u0, u1, v0, v1; v1 = top: clipped by the outline).
  plates: [
    [-0.47, -0.112, 0, 1], [-0.108, -0.02, 0.158, 1], [-0.108, -0.02, 0, 0.154],
    [-0.016, 0.142, 0.168, 1], [-0.016, 0.142, 0, 0.164], [0.146, 0.47, 0.25, 1], [0.146, 0.47, 0, 0.246],
  ],
  // Lamps: lens radius, colour, label, the state that lights them.
  lamps: [
    { id: 'start', u: -0.092, v: 0.300, r: 0.0085, col: 0xe8281c, label: 'PARTIDA' },
    { id: 'alt', u: -0.093, v: 0.252, r: 0.0072, col: 0xe8281c, label: 'ALTERN.' },
    { id: 'oil', u: -0.064, v: 0.252, r: 0.0072, col: 0xe8281c, label: 'PRESS.\nÓLEO' },
    { id: 'fuel', u: -0.035, v: 0.252, r: 0.0072, col: 0xf0a21a, label: 'COMB.\nBAIXO' },
    { id: 'stall', u: -0.288, v: 0.266, r: 0.0042, col: 0xff2a1a, label: '' },
    { id: 'spray', u: 0.103, v: 0.148, r: 0.0055, col: 0xf0b21a, label: 'APLIC.', side: 'r' },
  ],
  key: { u: -0.046, v: 0.300, r: 0.016 },
  compass: { u: -0.064, v: 0.198, w: 0.056, h: 0.048, win: [0.036, 0.017] },
  testSw: { u: -0.094, v: 0.142 },
  blanks: [[-0.064, 0.028, 0.018], [0.103, 0.036, 0.018]],
  // The two windows into the hopper, the trim indicator.
  hopperWin: { u: 0.063, v: 0.262, w: 0.13, h: 0.11, r: 0.009 },
  hopperLow: { u: 0.028, v: 0.066, w: 0.044, h: 0.08, r: 0.006 },
  trim: { u: 0.028, v: 0.138, w: 0.052, h: 0.024 },
  totalizer: { u: 0.19, v: 0.298, w: 0.08, h: 0.034 },
  // Switch block: push caps over toggles.
  block: { us: [0.24, 0.261, 0.282, 0.303], vCap: 0.296, vSw: 0.268, labels: ['BAT', 'ALT.', 'B.COMB', 'LUZ'] },
  // Left switch row and breakers under the instruments.
  row: { v: 0.048, us: [-0.39, -0.346, -0.302, -0.258, -0.214, -0.17], labels: ['NAV', 'STROBE', 'BEACON', 'FAROL', 'TÁXI', 'PITOT'] },
  breakers: { v: 0.018, us: [-0.37, -0.337, -0.304, -0.271, -0.238, -0.205, -0.172], labels: ['5', '5', '10', '5', '15', '10', '5'], caps: ['INSTR', 'GPS', 'B.COMB', 'LUZES', 'PARTIDA', 'FAROL', 'VÁLV.'] },
  redStrip: { u0: -0.395, u1: -0.118, v: 0.074, h: 0.0105 },
  regPlate: { u: -0.33, v: 0.263, w: 0.056, h: 0.015 },
  // GPS housing (bezel) and the screen in it; soft keys along the bottom.
  gps: { u: 0.31, v: 0.16, w: 0.175, h: 0.128, d: 0.045, screen: { u: 0.318, v: 0.168, w: 0.13, h: 0.0894 }, keysV: 0.107, keysU: [0.272, 0.302, 0.332, 0.362], side: { u: 0.2365, vs: [0.19, 0.168, 0.146] } },
  pushes: [[0.178, 0.062], [0.201, 0.062], [0.178, 0.036], [0.201, 0.036]],
  placard: { u: 0.33, v: 0.05, w: 0.15, h: 0.045 },
  vents: [[-0.42, 0.03, 0.019], [0.42, 0.03, 0.019]],
};
const P = E203_PANEL;
const S = P.W / P.w; // px per metre
const X = (u) => (u + P.w / 2) * S, Y = (v) => (P.h - v) * S;

// Dial angles (radians, clockwise from 12 o'clock as the pilot sees them).
export const E203_ANG = {
  asi: (kt) => { const mph = Math.max(0, kt) * KT_MPH; return (mph < 40 ? (mph / 40) * 10 : 10 + ((Math.min(mph, 205) - 40) / 160) * 320) * D2R; },
  alt100: (ft) => ((((ft % 1000) + 1000) % 1000) / 1000) * Math.PI * 2,
  alt1000: (ft) => ((((ft % 10000) + 10000) % 10000) / 10000) * Math.PI * 2,
  alt10k: (ft) => ((((ft % 100000) + 100000) % 100000) / 100000) * Math.PI * 2,
  rpm: (rpm) => (-135 + (clamp(rpm, 0, 3500) / 3500) * 270) * D2R,
  // Dual gauges: the left scale climbs from seven o'clock, the right one
  // from five, each over 130° (a gap at the top keeps the end figures apart).
  mp: (inHg) => (210 + ((clamp(inHg, 10, 35) - 10) / 25) * 130) * D2R,
  ff: (gph) => (150 - (clamp(gph, 0, 35) / 35) * 130) * D2R,
  cht: (f) => (210 + ((clamp(f, 100, 500) - 100) / 400) * 130) * D2R,
  oilT: (f) => (150 - ((clamp(f, 50, 250) - 50) / 200) * 130) * D2R,
  accel: (g) => (-90 + clamp(g, -2.2, 6.2) * 33.75) * D2R,
  amp: (a) => (clamp(a, -60, 60) / 60) * 70 * D2R,
};

// ---------------------------------------------------------------- face
function aluminium(g, w, h, seed, base = [201, 204, 206]) {
  g.fillStyle = `rgb(${base.join(',')})`; g.fillRect(0, 0, w, h);
  const r = rng(seed);
  // Fine paint orange-peel and a faint vertical sheen.
  for (let i = 0; i < w * h * 0.004; i++) {
    const v = (r() - 0.5) * 18, a = 0.08 + r() * 0.08;
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${a * Math.abs(v) / 9})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5);
  }
  const sh = g.createLinearGradient(0, 0, 0, h);
  sh.addColorStop(0, 'rgba(255,255,255,0.05)'); sh.addColorStop(1, 'rgba(0,0,0,0.07)');
  g.fillStyle = sh; g.fillRect(0, 0, w, h);
}

function drawFace(reg) {
  const c = canvas(P.W, P.H), g = c.getContext('2d');
  aluminium(g, P.W, P.H, 2031);
  // Sub-plate seams: a dark gap with a lit lower edge; wear near the
  // switches (slightly polished paint).
  for (const [u0, u1, v0, v1] of P.plates) {
    const x0 = X(u0), x1 = X(u1), y0 = Y(Math.min(v1, P.h)), y1 = Y(v0);
    g.strokeStyle = 'rgba(40,44,48,0.85)'; g.lineWidth = 5;
    g.strokeRect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x0 + 5, y1 - 5); g.lineTo(x1 - 5, y1 - 5); g.lineTo(x1 - 5, y0 + 5); g.stroke();
    const top = Math.min(v1, 0.34);
    for (const [u, v] of [[u0 + 0.008, v0 + 0.008], [u1 - 0.008, v0 + 0.008], [u0 + 0.008, top - 0.012], [u1 - 0.008, top - 0.012]]) screw(g, X(u), Y(v), 6);
    if (u1 - u0 > 0.25) for (const v of [v0 + 0.008, top - 0.012]) screw(g, X((u0 + u1) / 2), Y(v), 6);
  }
  // Soft shadow ring round every recessed instrument (case meets face).
  for (const d of Object.values(P.dials)) {
    const x = X(d.u), y = Y(d.v) + 4, R = d.r * S;
    const sh = g.createRadialGradient(x, y, R * 0.92, x, y, R * 1.3);
    sh.addColorStop(0, 'rgba(0,0,0,0.5)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.beginPath(); g.arc(x, y, R * 1.3, 0, Math.PI * 2); g.fill();
    // Mounting screws at the corners of the square flange.
    const k = d.r * 0.98;
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) screw(g, X(d.u + sx * k), Y(d.v + sy * k), d.r > 0.035 ? 6.5 : 5);
  }
  // Registration placard (black, white letters) with the stall LED by it.
  {
    const R = P.regPlate;
    g.fillStyle = '#121315'; roundRect(g, X(R.u - R.w / 2), Y(R.v + R.h / 2), R.w * S, R.h * S, 5); g.fill();
    text(g, reg, X(R.u), Y(R.v) + 1, 25, WHITE);
    text(g, 'ESTOL', X(-0.288), Y(0.252), 12, '#2a2c2e');
  }
  // Lamp captions; key positions; compass and ammeter captions.
  for (const l of P.lamps) {
    if (!l.label) continue;
    if (l.side === 'r') text(g, l.label, X(l.u + l.r + 0.004), Y(l.v), 12.5, '#26282b', true, 'left');
    else text(g, l.label, X(l.u), Y(l.v - l.r - 0.0095), 12.5, '#26282b');
  }
  {
    const K = P.key;
    const ring = [['DESL', -55], ['D', -25], ['E', 5], ['AMBOS', 35], ['PARTIDA', 70]];
    for (const [t, a] of ring) {
      const r = K.r * S * 1.55, aa = (a - 90) * D2R;
      text(g, t, X(K.u) + Math.cos(aa) * r, Y(K.v) + Math.sin(aa) * r, 10.5, '#26282b');
    }
    text(g, 'MAGNETOS', X(K.u), Y(K.v - K.r - 0.01), 11, '#26282b');
  }
  text(g, 'TESTE DE LUZES', X(P.testSw.u + 0.0075), Y(P.testSw.v), 11, '#26282b', true, 'left');
  text(g, 'AMPERÍMETRO', X(P.dials.amp.u), Y(P.dials.amp.v + P.dials.amp.r + 0.0072), 11, '#26282b');
  // Red fuel placard under the instruments.
  {
    const R = P.redStrip;
    g.fillStyle = '#c42519'; g.fillRect(X(R.u0), Y(R.v + R.h / 2), (R.u1 - R.u0) * S, R.h * S);
    text(g, 'COMBUSTÍVEL: ETANOL HIDRATADO (AEHC)  ·  292 L', X((R.u0 + R.u1) / 2), Y(R.v) + 1, 15, WHITE);
  }
  // Switch captions (left row, the block), breaker ratings and captions.
  for (const [i, u] of P.row.us.entries()) text(g, P.row.labels[i], X(u), Y(P.row.v + 0.019), 11.5, '#26282b');
  for (const [i, u] of P.block.us.entries()) text(g, P.block.labels[i], X(u), Y(P.block.vSw - 0.016), 9.5, '#26282b');
  text(g, 'LIGA ▲', X(P.block.us[1] + 0.01), Y(P.block.vSw - 0.026), 9, '#55595d');
  for (const [i, u] of P.breakers.us.entries()) {
    text(g, P.breakers.caps[i], X(u), Y(P.breakers.v + 0.0125), 9, '#26282b');
    g.strokeStyle = 'rgba(30,32,34,0.6)'; g.lineWidth = 1.2; g.beginPath(); g.arc(X(u), Y(P.breakers.v), 0.0078 * S, 0, Math.PI * 2); g.stroke();
  }
  text(g, 'DISJUNTORES — PUXAR PARA DESARMAR', X(-0.27), Y(0.005), 9, '#45494d');
  // Hopper window: graduation caption; compass correction card under it.
  {
    const H = P.hopperWin;
    text(g, 'VISOR DO HOPPER — 1.050 L', X(H.u), Y(H.v + H.h / 2 + 0.008), 11, '#26282b');
    const cx = X(H.u), cy = Y(H.v - H.h / 2 - 0.02), w = 0.11 * S, h = 0.026 * S;
    g.fillStyle = '#f2f1ec'; g.fillRect(cx - w / 2, cy - h / 2, w, h);
    g.strokeStyle = '#3a3d40'; g.lineWidth = 1.5; g.strokeRect(cx - w / 2, cy - h / 2, w, h);
    const heads = ['N', '30', '60', 'L', '120', '150', 'S', '210', '240', 'O', '300', '330'];
    g.beginPath(); g.moveTo(cx - w / 2, cy); g.lineTo(cx + w / 2, cy); g.stroke();
    text(g, 'PARA', cx - w / 2 + 16, cy - h / 4, 8.5, '#222');
    text(g, 'GOV.', cx - w / 2 + 16, cy + h / 4, 8.5, '#222');
    heads.forEach((t, i) => {
      const x = cx - w / 2 + 34 + i * ((w - 40) / 12);
      text(g, t, x, cy - h / 4, 8.5, '#222', false);
      text(g, t, x, cy + h / 4, 8.5, '#222', false);
    });
  }
  text(g, 'COMPENSADOR', X(P.trim.u), Y(P.trim.v + P.trim.h / 2 + 0.008), 10.5, '#26282b');
  text(g, 'CRONÔMETRO', X(P.dials.chrono.u), Y(P.dials.chrono.v - P.dials.chrono.r - 0.009), 10.5, '#26282b');
  text(g, 'TOTALIZADOR', X(P.totalizer.u), Y(P.totalizer.v - P.totalizer.h / 2 - 0.007), 10.5, '#26282b');
  // Operating placards under the GPS (category, manoeuvres, the hopper).
  {
    const Pl = P.placard, x = X(Pl.u), y = Y(Pl.v);
    g.fillStyle = '#e9e8e2'; g.fillRect(x - (Pl.w / 2) * S, y - (Pl.h / 2) * S, Pl.w * S, Pl.h * S);
    g.strokeStyle = '#2b2d30'; g.lineWidth = 1.2; g.strokeRect(x - (Pl.w / 2) * S, y - (Pl.h / 2) * S, Pl.w * S, Pl.h * S);
    const L = ['OPERAÇÃO NA CATEGORIA RESTRITA', 'APLICAÇÃO AGRÍCOLA — NÃO TRANSPORTAR', 'PASSAGEIROS · MANOBRAS ACROBÁTICAS', 'PROIBIDAS · CARGA DO HOPPER LIMITADA', 'PELO PMD DE 1.900 kg'];
    L.forEach((t, i) => text(g, t, x, y - 0.0176 * S + i * 0.0088 * S, 8.6, '#1d1f22', i === 0));
  }
  text(g, 'VENT.', X(P.vents[0][0]), Y(P.vents[0][1] + P.vents[0][2] + 0.008), 10, '#26282b');
  text(g, 'VENT.', X(P.vents[1][0]), Y(P.vents[1][1] + P.vents[1][2] + 0.008), 10, '#26282b');
  // Polished wear round the most used controls.
  for (const [u, v] of [[P.key.u, P.key.v], [P.block.us[0], P.block.vSw], [P.gps.u, P.gps.v - P.gps.h / 2]]) {
    const gr = g.createRadialGradient(X(u), Y(v), 0, X(u), Y(v), 0.03 * S);
    gr.addColorStop(0, 'rgba(255,255,255,0.08)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(X(u) - 0.03 * S, Y(v) - 0.03 * S, 0.06 * S, 0.06 * S);
  }
  return c;
}

// ---------------------------------------------------------------- dials
// Atlas 2048 x 1024: eight 512 px faces (0 asi, 1 alt, 2 rpm, 3 mp/ff,
// 4 cyl/oil, 5 accelerometer, 6 ammeter, 7 chronometer).
export const DIAL_ATLAS = { W: 2048, H: 1024, cell: 512 };
const canvasAng = (a) => a - Math.PI / 2; // clock angle -> canvas angle
// Coloured range on a scale that may run either way round the dial.
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
  const c = canvas(DIAL_ATLAS.W, DIAL_ATLAS.H), g = c.getContext('2d');
  g.fillStyle = '#060707'; g.fillRect(0, 0, c.width, c.height);
  const cell = (i) => ({ x: (i % 4) * 512 + 256, y: Math.floor(i / 4) * 512 + 256, r: 250 });
  const A = E203_ANG;
  const T = (g2, t, x, y, s, col = INK, bold = true) => text(g2, t, x, y, s, col, bold);
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
    g.fillStyle = '#cfcfc8';
    for (let k = 40; k <= 170; k += 10) {
      const a = ang(kt(k));
      g.strokeStyle = '#cfcfc8'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45); g.lineTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5); g.stroke();
      if (k % 20 === 0) T(g, String(k), x + Math.cos(a) * r * 0.37, y + Math.sin(a) * r * 0.37, 22, '#cfcfc8', false);
    }
    T(g, 'MPH', x, y - r * 0.2, 30); T(g, 'AIRSPEED', x, y + r * 0.07, 19, '#cfcfc8', false); T(g, 'KNOTS', x, y + r * 0.17, 17, '#cfcfc8', false);
  }
  // 1 — altimeter (0–9, 20 ft steps), Kollsman window, low-altitude flag.
  {
    const { x, y, r } = cell(1);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng((v / 10) * Math.PI * 2);
    scale(g, x, y, r, ang, 0, 9.8, 0.2, 1, { numR: 0.66, size: 0.2, num: (v) => Math.round(v) });
    T(g, 'ALT', x, y - r * 0.32, 32);
    T(g, '100 FEET', x, y - r * 0.18, 20, '#cfcfc8', false);
    T(g, '1000 FT', x - r * 0.3, y + r * 0.04, 16, '#cfcfc8', false);
    g.fillStyle = '#000'; roundRect(g, x + r * 0.2, y - r * 0.09, r * 0.42, r * 0.17, 6); g.fill();
    g.strokeStyle = '#777'; g.lineWidth = 2; roundRect(g, x + r * 0.2, y - r * 0.09, r * 0.42, r * 0.17, 6); g.stroke();
    T(g, '29.92', x + r * 0.41, y, 30, WHITE, false);
    T(g, 'IN.HG', x + r * 0.41, y + r * 0.16, 15, '#cfcfc8', false);
    g.save(); g.beginPath(); g.rect(x - r * 0.18, y + r * 0.3, r * 0.36, r * 0.12); g.clip();
    for (let k = -6; k < 10; k++) { g.fillStyle = k % 2 ? WHITE : '#111'; g.beginPath(); g.moveTo(x - r * 0.18 + k * 14, y + r * 0.42); g.lineTo(x - r * 0.18 + k * 14 + 14, y + r * 0.3); g.lineTo(x - r * 0.18 + k * 14 + 28, y + r * 0.3); g.lineTo(x - r * 0.18 + k * 14 + 14, y + r * 0.42); g.fill(); }
    g.restore();
  }
  // 2 — tachometer, hundreds of rpm, green 2,100–2,700, red line 2,700,
  // hour meter window (the counter itself is a live texture).
  {
    const { x, y, r } = cell(2);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(A.rpm(v * 100));
    arc(g, x, y, r, ang, 21, 27, GREEN, 0.075, 0.9);
    radial(g, x, y, r, ang(27), RED, 0.055);
    scale(g, x, y, r, ang, 0, 35, 1, 5, { numR: 0.66, size: 0.19 });
    T(g, 'RPM', x, y - r * 0.32, 30); T(g, 'HUNDREDS', x, y - r * 0.19, 18, '#cfcfc8', false);
    g.fillStyle = '#000'; roundRect(g, x - r * 0.3, y + r * 0.27, r * 0.6, r * 0.16, 5); g.fill();
    T(g, 'HOURS', x, y + r * 0.52, 17, '#cfcfc8', false);
  }
  // 3 — manifold pressure (left, in.Hg) / fuel flow (right, gal/h).
  {
    const { x, y, r } = cell(3);
    faceBase(g, x, y, r);
    const am = (v) => canvasAng(A.mp(v)), af = (v) => canvasAng(A.ff(v));
    arc(g, x, y, r, am, 15, 25.5, GREEN, 0.07, 0.9);
    scale(g, x, y, r, am, 10, 35, 1, 5, { numR: 0.7, size: 0.15 });
    arc(g, x, y, r, af, 5, 30, GREEN, 0.07, 0.9);
    scale(g, x, y, r, af, 0, 35, 1, 5, { numR: 0.7, size: 0.15 });
    T(g, 'MANIFOLD', x - r * 0.3, y - r * 0.24, 17); T(g, 'PRESSURE', x - r * 0.3, y - r * 0.13, 17); T(g, 'IN HG', x - r * 0.3, y - r * 0.02, 15, '#cfcfc8', false);
    T(g, 'FUEL', x + r * 0.3, y + r * 0.02, 17); T(g, 'FLOW', x + r * 0.3, y + r * 0.13, 17); T(g, 'GAL/HR', x + r * 0.3, y + r * 0.24, 15, '#cfcfc8', false);
    g.strokeStyle = '#3a3d40'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y - r * 0.9); g.lineTo(x, y - r * 0.5); g.moveTo(x, y + r * 0.5); g.lineTo(x, y + r * 0.9); g.stroke();
  }
  // 4 — CYL (head temperature, left) / OIL (temperature, right), °F.
  {
    const { x, y, r } = cell(4);
    faceBase(g, x, y, r);
    const ac = (v) => canvasAng(A.cht(v)), ao = (v) => canvasAng(A.oilT(v));
    arc(g, x, y, r, ac, 200, 460, GREEN, 0.07, 0.9);
    radial(g, x, y, r, ac(500), RED, 0.06);
    scale(g, x, y, r, ac, 100, 500, 20, 100, { numR: 0.7, size: 0.15 });
    arc(g, x, y, r, ao, 100, 240, GREEN, 0.07, 0.9);
    radial(g, x, y, r, ao(245), RED, 0.06);
    scale(g, x, y, r, ao, 50, 250, 10, 50, { numR: 0.7, size: 0.15 });
    T(g, 'CYL', x - r * 0.3, y - r * 0.14, 26); T(g, '°F', x - r * 0.3, y + r * 0.0, 17, '#cfcfc8', false);
    T(g, 'OIL', x + r * 0.3, y + r * 0.06, 26); T(g, '°F', x + r * 0.3, y + r * 0.2, 17, '#cfcfc8', false);
    g.strokeStyle = '#3a3d40'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y - r * 0.9); g.lineTo(x, y - r * 0.5); g.moveTo(x, y + r * 0.5); g.lineTo(x, y + r * 0.9); g.stroke();
  }
  // 5 — accelerometer, −2 to +6 g, 0 at nine o'clock.
  {
    const { x, y, r } = cell(5);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(A.accel(v));
    scale(g, x, y, r, ang, -2, 6, 0.5, 1, { numR: 0.64, size: 0.2, num: (v) => (v > 0 ? `+${v}` : String(v)) });
    T(g, 'G', x + r * 0.22, y + r * 0.04, 40); T(g, 'UNITS', x + r * 0.22, y + r * 0.24, 18, '#cfcfc8', false);
    T(g, 'PUSH TO SET', x + r * 0.22, y + r * 0.4, 14, '#9a9a94', false);
  }
  // 6 — ammeter, centre zero.
  {
    const { x, y, r } = cell(6);
    faceBase(g, x, y, r);
    const ang = (v) => canvasAng(A.amp(v));
    scale(g, x, y, r, ang, -60, 60, 10, 30, { numR: 0.66, size: 0.17 });
    T(g, '−', x - r * 0.55, y + r * 0.1, 50); T(g, '+', x + r * 0.55, y + r * 0.1, 50);
    T(g, 'AMPS', x, y + r * 0.3, 24);
  }
  // 7 — quartz chronometer: the LCD window (live texture over it) and the
  // button captions.
  {
    const { x, y, r } = cell(7);
    faceBase(g, x, y, r);
    T(g, 'QUARTZ CHRONOMETER', x, y - r * 0.5, 22, '#cfcfc8', false);
    g.fillStyle = '#000'; roundRect(g, x - r * 0.62, y - r * 0.3, r * 1.24, r * 0.52, 10); g.fill();
    T(g, 'UT      LT      ET', x, y + r * 0.34, 20, '#cfcfc8');
    T(g, 'SEL', x - r * 0.5, y + r * 0.62, 22, '#cfcfc8'); T(g, 'CTL', x + r * 0.5, y + r * 0.62, 22, '#cfcfc8');
  }
  return c;
}

// ---------------------------------------------------------------- misc
// Trim indicator scale, compass card (drum, 360°), GPS bezel face.
function drawTrimScale() {
  const c = canvas(512, 224), g = c.getContext('2d');
  g.fillStyle = '#0d0e10'; g.fillRect(0, 0, 512, 224);
  g.fillStyle = '#e9e8e2'; g.fillRect(36, 60, 440, 104);
  g.fillStyle = '#111';
  for (let i = -10; i <= 10; i++) {
    const x = 256 + i * 20, maj = i % 5 === 0;
    g.fillRect(x - (maj ? 2.5 : 1.5), 60, maj ? 5 : 3, maj ? 44 : 26);
    if (maj) text(g, String(Math.abs(i)), x, 138, 36, '#111');
  }
  text(g, 'PICAR', 70, 30, 24, '#d6d6d0'); text(g, 'CABRAR', 442, 30, 24, '#d6d6d0');
  return c;
}
function drawCompassCard() {
  const c = canvas(1024, 128), g = c.getContext('2d');
  g.fillStyle = '#16181a'; g.fillRect(0, 0, 1024, 128);
  // Numbers increase to the LEFT as seen through the window (the card is
  // read from behind: the reverse sense of a wet compass).
  for (let d = 0; d < 360; d += 5) {
    const x = 1024 - (d / 360) * 1024, maj = d % 30 === 0;
    g.fillStyle = WHITE; g.fillRect(x - (maj ? 2 : 1), 0, maj ? 4 : 2, maj ? 34 : 20);
    if (maj) {
      const t = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] ?? String(d / 10);
      text(g, t, x, 78, d % 90 === 0 ? 56 : 44, d % 90 === 0 ? WHITE : '#e5e5df');
    }
  }
  return c;
}
function drawGpsBezel() {
  const W = 512, H = 366;
  const c = canvas(W, H), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#2a2e33'); gr.addColorStop(1, '#16181b');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  speckleDark(g, W, H, 7);
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 3; roundRect(g, 6, 6, W - 12, H - 12, 20); g.stroke();
  text(g, 'AGROWINGS', 70, 20, 16, '#e7ebef'); text(g, 'NAV', 130, 20, 16, '#52d8ff');
  // Soft-key captions along the bottom (the keys are 3D under them).
  const k = P.gps, kx = (u) => ((u - (k.u - k.w / 2)) / k.w) * W;
  ['MAPA', 'DEST.', 'MISSÃO', 'COB.'].forEach((t, i) => text(g, t, kx(k.keysU[i]), H - 46, 15, '#a9c4d8'));
  // Side buttons: power, brightness, home (their symbols).
  const sx = kx(k.side.u), sy = (v) => ((k.v + k.h / 2 - v) / k.h) * H;
  text(g, '⏻', sx + 30, sy(k.side.vs[0]), 18, '#c9d0d6'); text(g, '☀', sx + 30, sy(k.side.vs[1]), 18, '#c9d0d6'); text(g, '⌂', sx + 30, sy(k.side.vs[2]), 18, '#c9d0d6');
  return c;
}
function speckleDark(g, w, h, seed) {
  const r = rng(seed);
  for (let i = 0; i < w * h * 0.01; i++) { g.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.03})`; g.fillRect(r() * w, r() * h, 1, 1); }
}
// Black leather grain (bump) for the glareshield, with the stitched seam
// along the bullnose (v ≈ 0.55 of the profile).
function drawLeather() {
  const c = canvas(512, 512), g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, 512, 512);
  const r = rng(77);
  for (let i = 0; i < 9000; i++) {
    const x = r() * 512, y = r() * 512, s = 2 + r() * 5;
    g.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},0.07)`;
    g.beginPath(); g.ellipse(x, y, s, s * 0.7, r() * 3, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,0.55)';
  for (let x = 0; x < 512; x += 12) g.fillRect(x, 250, 7, 4);
  return c;
}

// ---------------------------------------------------------------- hopper
// The hopper's rear wall (yellow fibreglass, lit from outside) seen through
// the two windows and below the panel: litre graduations and the product
// level from the aircraft's load. Height ↔ volume: the hopper narrows to its
// gatebox, so a litre near the bottom takes more height than near the top.
// Canvas x = 800 px/m from x = +0.32 (the pilot's left); the figures and
// marks sit under the upper window (u ≈ 0.063, canvas ≈ 254–358).
export const HOPPER_WALL = { W: 512, H: 1024, x0: -0.32, x1: 0.32, top: [0.15, 0.6], low: [-0.48, 0.22], split: 400, cap: 1050, yb: -0.45, yt: 0.585, mark: 324 };
const HW = HOPPER_WALL;
export const hopperY = (L) => HW.yb + (HW.yt - HW.yb) * clamp(L / HW.cap, 0, 1) ** 0.72;
function wallRows(y) { // body y -> canvas row (upper region or tunnel face)
  if (y >= HW.top[0]) return { region: 'top', row: (1 - (y - HW.top[0]) / (HW.top[1] - HW.top[0])) * HW.split };
  return { region: 'low', row: HW.split + (1 - (y - HW.low[0]) / (HW.low[1] - HW.low[0])) * (HW.H - HW.split) };
}
// Lower face (between the pilot's legs), as in the cabin photographs: a U
// slot in an aluminium frame through which the product is seen, the
// in-flight scale (VÔO) on its right and the parked scale (SOLO) on its
// left. Parked on the tailwheel the product runs aft, so a mark reads fewer
// litres on the ground than at the same height in flight: about 1 : 1.4
// (read off the photograph's two scales, e.g. SOLO 300 beside VÔO 400–450).
export const HOPPER_SLOT = { x: 256, w: 36, y0: -0.3, y1: 0.1 };
const SLOT = HOPPER_SLOT, SOLO_K = 1.4;
const slotRows = () => [wallRows(SLOT.y1).row, wallRows(SLOT.y0).row];
function drawHopperBase() {
  const c = canvas(HW.W, HW.H), g = c.getContext('2d');
  g.fillStyle = '#efc11e'; g.fillRect(0, 0, HW.W, HW.H);
  // Fibreglass weave and light through it.
  const r = rng(5);
  for (let i = 0; i < 26000; i++) { g.fillStyle = `rgba(${r() > 0.5 ? '255,240,180' : '150,105,10'},0.06)`; g.fillRect(r() * HW.W, r() * HW.H, 2, 2); }
  // Upper wall (through the panel window): big figures, the hopper's own.
  const markTop = (L, label) => {
    const y = hopperY(L);
    if (y < HW.top[0] || y > HW.top[1]) return;
    const row = wallRows(y).row, big = L % 100 === 0;
    g.fillStyle = '#16140e';
    g.fillRect(big ? HW.mark : HW.mark + 10, row - (big ? 4 : 2.5), big ? 32 : 22, big ? 8 : 5);
    if (label) text(g, label, HW.mark - 34, row, 38, '#16140e');
  };
  for (let L = 50; L <= HW.cap; L += 50) markTop(L, L % 100 === 0 ? String(L) : null);
  markTop(HW.cap, 'MÁX');
  // Lower face: the slot, its frame and the two scales.
  const [ra, rb] = slotRows(), x0 = SLOT.x - SLOT.w / 2, x1 = SLOT.x + SLOT.w / 2;
  g.fillStyle = 'rgba(70,52,12,0.32)'; roundRect(g, x0, ra, SLOT.w, rb - ra, SLOT.w / 2); g.fill();
  g.strokeStyle = '#8d949b'; g.lineWidth = 9; roundRect(g, x0 - 5, ra - 5, SLOT.w + 10, rb - ra + 10, SLOT.w / 2 + 5); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2; roundRect(g, x0 - 8, ra - 8, SLOT.w + 16, rb - ra + 16, SLOT.w / 2 + 8); g.stroke();
  for (const yy of [ra + 12, (ra + rb) / 2, rb - 12]) for (const xx of [x0 - 5, x1 + 5]) { g.fillStyle = '#5d636a'; g.beginPath(); g.arc(xx, yy, 3.5, 0, Math.PI * 2); g.fill(); }
  const scaleLow = (k, side, cap) => {
    for (let L = 100; L <= 800; L += 50) {
      const y = hopperY(L * k);
      if (y < SLOT.y0 + 0.02 || y > SLOT.y1 - 0.01) continue;
      const row = wallRows(y).row, big = L % 100 === 0;
      const xm = side > 0 ? x1 + 14 : x0 - 14 - (big ? 24 : 14);
      g.fillStyle = '#16140e'; g.fillRect(xm, row - (big ? 3 : 2), big ? 24 : 14, big ? 6 : 4);
      if (big) text(g, String(L), side > 0 ? x1 + 44 : x0 - 44, row, 24, '#16140e', true, side > 0 ? 'left' : 'right');
    }
    text(g, cap, side > 0 ? x1 + 44 : x0 - 44, rb + 22, 22, '#16140e', true, side > 0 ? 'left' : 'right');
  };
  scaleLow(1, 1, 'VÔO');
  scaleLow(SOLO_K, -1, 'SOLO');
  return c;
}

// ---------------------------------------------------------------- live
function lcdFrame(g, w, h) {
  const lg = g.createLinearGradient(0, 0, 0, h);
  lg.addColorStop(0, '#9fb08c'); lg.addColorStop(1, '#7e9070');
  g.fillStyle = lg; g.fillRect(0, 0, w, h);
}

export function createE203Panel({ reg: reg0 = 'PR-IPB' } = {}) {
  let reg = reg0;
  const faceC = drawFace(reg);
  const face = canvasTexture(faceC, { aniso: 8 });
  const dialC = drawDials({ vs0: 48, vs1: 56, vfe: 95, vne: 140 });
  const dials = canvasTexture(dialC, { aniso: 8 });
  const trim = canvasTexture(drawTrimScale(), { aniso: 4 });
  const card = canvasTexture(drawCompassCard(), { aniso: 4, repeat: true });
  const bezel = canvasTexture(drawGpsBezel(), { aniso: 4 });
  const leather = canvasTexture(drawLeather(), { srgb: false, repeat: true, aniso: 4 });
  const mk = (w, h) => { const c = canvas(w, h); return { c, g: c.getContext('2d'), tex: canvasTexture(c, { aniso: 4 }), key: '' }; };
  const chrono = mk(256, 112), fuel = mk(256, 96), hobbs = mk(192, 48), hopper = mk(HW.W, HW.H);
  const hopperBg = drawHopperBase();
  const gps = createAgroNav({ home: { x: BASE.pad.x, z: BASE.pad.z, name: 'BASE · PÁTIO', label: 'PÁTIO DA BASE (SEM CONTRATO)' } });
  const redraw = (s, key, fn) => { if (key === s.key) return; s.key = key; fn(s.g); s.tex.needsUpdate = true; };
  let lastNow = performance.now(), etT = 0, hours = 0, ampT = 0, gMax = 1, gMin = 1, vKey = '';
  const drawHopper = (L) => redraw(hopper, String(Math.round(L / 2)), (g) => {
    g.drawImage(hopperBg, 0, 0);
    if (L < 1) return;
    // Product: darker where the wall is wet behind, a bright meniscus.
    const y = hopperY(L);
    for (const region of ['top', 'low']) {
      const rr = region === 'top' ? HW.top : HW.low;
      const r0 = region === 'top' ? 0 : HW.split, r1 = region === 'top' ? HW.split : HW.H;
      if (y < rr[0]) continue;
      const row = y > rr[1] ? r0 : wallRows(y).row;
      // Through the painted wall the product only darkens it; in the lower
      // face's slot it shows plainly, with its meniscus.
      const low = region === 'low';
      g.fillStyle = `rgba(70,58,18,${low ? 0.16 : 0.42})`; g.fillRect(0, row, HW.W, r1 - row);
      if (y <= rr[1] && !low) { g.fillStyle = 'rgba(255,250,215,0.85)'; g.fillRect(0, row - 3, HW.W, 4); g.fillStyle = 'rgba(40,32,8,0.5)'; g.fillRect(0, row + 1, HW.W, 3); }
      if (low) {
        const [ra, rb] = slotRows(), top = Math.max(row, ra);
        if (top < rb) {
          g.save(); roundRect(g, SLOT.x - SLOT.w / 2, ra, SLOT.w, rb - ra, SLOT.w / 2); g.clip();
          g.fillStyle = 'rgba(52,40,10,0.62)'; g.fillRect(0, top, HW.W, rb - top);
          if (row > ra) { g.fillStyle = 'rgba(255,248,205,0.9)'; g.fillRect(0, row - 2, HW.W, 3); }
          g.restore();
        }
      }
    }
  });
  drawHopper(0);
  const api = {
    face, dials, trim, card, bezel, leather, chrono, fuel, hobbs, hopper, gps,
    // Kept for the cockpit's per-frame needles (the last instruments() set).
    last: null,
    lit: {},
    gload: { now: 1, max: 1, min: 1 },
    amps: 0,
    get page() { return gps.page; },
    setPage: gps.setPage,
    nextPage: gps.nextPage,
    draw(d) {
      const now = performance.now(), dt = Math.min(0.5, (now - lastNow) / 1000);
      lastNow = now;
      api.last = d;
      const run = d.engine === 'running', crank = d.engine === 'cranking';
      const master = d.engine !== 'off';
      // Airspeed arcs follow the type's V-speeds (redrawn only if they change).
      const vk = [d.vs0, d.vs1, d.vfe, d.vne].join();
      if (d.vne && vk !== vKey) { vKey = vk; const cc = drawDials(d); dialC.getContext('2d').drawImage(cc, 0, 0); dials.needsUpdate = true; }
      // Lamps: starter engaged, alternator not charging, oil pressure low,
      // fuel under 15 %, stall warning, spray valve open.
      api.lit = {
        start: crank, alt: master && !run, oil: master && (d.oilP ?? 0) < 15,
        fuel: master && d.fuel < (d.fuelCap ?? 292) * 0.15, stall: !!d.stall && !d.onGround, spray: master && !!d.spray,
      };
      // Accelerometer with its max / min memory needles (reset on the ground
      // with the engine stopped).
      if (!master && d.onGround) { gMax = 1; gMin = 1; }
      gMax = Math.max(gMax, d.gLoad ?? 1); gMin = Math.min(gMin, d.gLoad ?? 1);
      api.gload = { now: d.gLoad ?? 1, max: gMax, min: gMin };
      // Ammeter: starter draw while cranking, the alternator's recharge after
      // the start tapering to the running load; nothing with the engine off.
      if (crank) { api.amps = -48; ampT = 0; } else if (run) { ampT += dt; api.amps = 4 + 26 * Math.exp(-ampT / 40); } else api.amps = 0;
      // Hour meter (engine running time this session) and chronometer (time
      // since the engine was started).
      if (run) { hours += dt / 3600; etT += dt; } else if (!master) etT = 0;
      redraw(hobbs, (hours * 10).toFixed(0), (g) => {
        g.fillStyle = '#060606'; g.fillRect(0, 0, 192, 48);
        const s = (hours % 10000).toFixed(1).padStart(6, '0');
        for (const [i, ch] of [...s.replace('.', '')].entries()) {
          const x = 8 + i * 35;
          g.fillStyle = i === 4 ? '#e8e8e0' : '#141414'; g.fillRect(x, 4, 30, 40);
          text(g, ch, x + 15, 25, 30, i === 4 ? '#111' : '#eee', false);
        }
      });
      redraw(chrono, master ? `${Math.floor(etT)}` : 'off', (g) => {
        lcdFrame(g, 256, 112);
        if (!master) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, 256, 112); return; }
        text(g, `${String(Math.floor(etT / 60)).padStart(2, '0')}:${String(Math.floor(etT % 60)).padStart(2, '0')}`, 128, 64, 62, '#1a2214', false);
        text(g, 'ET', 228, 22, 22, '#1a2214');
      });
      // Fuel totalizer: quantity left and the flow, from the engine.
      redraw(fuel, master ? `${Math.round(d.fuel)}|${Math.round(d.fuelFlow ?? 0)}` : 'off', (g) => {
        g.fillStyle = '#050607'; g.fillRect(0, 0, 256, 96);
        if (!master) return;
        g.fillStyle = 'rgba(255,120,40,0.06)'; g.fillRect(0, 0, 256, 96);
        text(g, `${Math.round(d.fuel)}`, 150, 34, 44, '#ff9a3c', false); text(g, 'L', 228, 40, 20, '#ff9a3c');
        text(g, 'QTD', 30, 34, 16, '#c07a3a');
        text(g, `${Math.round(d.fuelFlow ?? 0)}`, 150, 76, 30, '#ff9a3c', false); text(g, 'L/H', 228, 78, 16, '#ff9a3c');
        text(g, 'FLX', 30, 76, 16, '#c07a3a');
      });
      drawHopper(d.hopper);
      gps.draw(d, dt, master);
    },
    setReg(r) { reg = r; const c = drawFace(reg); faceC.getContext('2d').drawImage(c, 0, 0); face.needsUpdate = true; },
  };
  return api;
}

// Fuel flow L/h -> gal/h; temperatures °C -> °F (the dials are US units).
export const toGph = (lph) => lph / 3.785;
export { C2F };
// Magneto key positions (clock angles; the captions on the face match).
export const KEY_POS = { off: -55 * D2R, both: 35 * D2R, start: 70 * D2R };
