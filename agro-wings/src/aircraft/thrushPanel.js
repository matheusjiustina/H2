// Thrush 510G instruments: one small canvas per unit, each redrawn only
// when what it shows has changed (and at its own rate), so a screen's
// texture is re-uploaded only when its numbers move:
//   MVP-50T-style engine monitor (Ng, ITT, Np, torque, fuel flow, fuel
//     quantity, run timer, alerts) — the GE H80 values of the flight model;
//     what the simulation does not model (oil, fuel pressure, volts, OAT)
//     reads "---" with an N/S tag instead of an invented number;
//   G5-style electronic attitude indicator (attitude, airspeed and altitude
//     tapes, vertical speed, heading, slip ball);
//   AG-NAV-style guidance monitor: the game's guidance (talhão, pass lines,
//     coverage, track, cross-track, the job's progress) inside a frame with
//     its status line and soft-key bar;
//   the glareshield guidance display (pass, cross-track, ground speed,
//     height over the crop, an arc cross-track indicator).
// The analog airspeed indicator and altimeter faces are static textures;
// their needles are 3D (thrushCockpit.js) and follow the same data.
// draw(d) receives Aircraft.instruments() (15 Hz, cockpit view only).
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp, rng } from '../core/math.js';
import { roundRect } from './panel.js';

const KT_MPH = 1.15078;
const MAX_TORQUE = 2020; // ft·lb (FLIGHT_T510G.turbine.maxTorque)

// Unit screen sizes (px).
export const TH_SCREENS = {
  mvp: [512, 400], g5: [256, 320], agnav: [640, 420], hud: [320, 96],
};

export function createThrushPanel() {
  const mk = (w, h, aniso = 4) => { const c = canvas(w, h); return { c, g: c.getContext('2d'), tex: canvasTexture(c, { aniso }), key: '' }; };
  const S = {
    mvp: mk(...TH_SCREENS.mvp), g5: mk(...TH_SCREENS.g5), agnav: mk(...TH_SCREENS.agnav), hud: mk(...TH_SCREENS.hud),
  };
  const dials = drawDials();
  const face = drawFace();
  const consoles = drawConsoles();
  const hopperWall = drawHopperWall();
  // Start with every screen blank-dark (engine off, before the first draw).
  for (const k of Object.keys(S)) { const s = S[k]; s.g.fillStyle = '#05070a'; s.g.fillRect(0, 0, s.c.width, s.c.height); s.tex.needsUpdate = true; }
  let runT = 0, lastT = performance.now(), slowT = 0;
  const api = {
    texture: face.tex, // the panel face (what aircraft.js calls the panel texture)
    face, dials, consoles, hopperWall,
    screens: S,
    last: null,
    draw(d) {
      const now = performance.now();
      const dt = Math.min(0.5, (now - lastT) / 1000);
      lastT = now;
      api.last = d;
      if (d.engine === 'running') runT += dt;
      const power = d.engine !== 'off' || d.ng > 8; // avionics bus: battery on with the engine
      // G5 every call (attitude moves continuously); the others at ~5 Hz.
      redraw(S.g5, power ? `${d.pitch.toFixed(3)}|${d.bank.toFixed(3)}|${Math.round(d.ias)}|${Math.round(d.altFt / 10)}|${Math.round(d.hdg)}|${(d.slip ?? 0).toFixed(2)}|${Math.round(d.vsFpm / 50)}` : 'off', () => drawG5(S.g5.g, d, power));
      slowT -= dt;
      if (slowT > 0) return;
      slowT = 0.2;
      const tq = (d.torque / MAX_TORQUE) * 100;
      redraw(S.mvp, power ? `${d.ng.toFixed(1)}|${Math.round(d.itt)}|${Math.round(d.rpm / 10)}|${tq.toFixed(1)}|${Math.round(d.fuelFlow)}|${Math.round(d.fuel)}|${Math.floor(runT)}|${d.engine}|${d.stall > 0.5}|${d.beta}` : 'off', () => drawMVP(S.mvp.g, d, tq, runT, power));
      redraw(S.agnav, power ? `${Math.floor(now / 200)}` : 'off', () => drawAgNav(S.agnav.g, d, power));
      const gps = d.gps;
      redraw(S.hud, power ? `${gps?.next?.k ?? '-'}|${(gps?.xte ?? 0).toFixed(1)}|${Math.round(d.gs ?? 0)}|${(d.hgt ?? 0).toFixed(1)}|${d.spray}|${gps?.aligned}` : 'off', () => drawHud(S.hud.g, d, power));
    },
  };
  return api;
}

function redraw(s, key, fn) {
  if (key === s.key) return;
  s.key = key;
  fn();
  s.tex.needsUpdate = true;
}

// ---------------------------------------------------------------- MVP-50T
function drawMVP(g, d, tq, runT, power) {
  const [W, H] = TH_SCREENS.mvp;
  g.fillStyle = '#04060a'; g.fillRect(0, 0, W, H);
  if (!power) return;
  // Header.
  g.fillStyle = '#101a2a'; g.fillRect(0, 0, W, 26);
  g.fillStyle = '#9fc4ff'; g.font = 'bold 15px Arial'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText('ENGINE', 10, 13);
  g.textAlign = 'right'; g.fillStyle = '#d6dde8';
  g.fillText('GE H80 · 800 SHP', W - 10, 13);
  // Four round arc gauges: Ng, ITT, Np, torque.
  const arcG = (cx, cy, r, v, min, max, bands, label, txt, unit) => {
    const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
    const A = (x) => a0 + ((clamp(x, min, max) - min) / (max - min)) * (a1 - a0);
    g.lineWidth = 9;
    for (const [b0, b1, col] of bands) { g.strokeStyle = col; g.beginPath(); g.arc(cx, cy, r, A(b0), A(b1)); g.stroke(); }
    g.strokeStyle = '#f4f4f4'; g.lineWidth = 4;
    const a = A(v);
    g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.35, cy + Math.sin(a) * r * 0.35); g.lineTo(cx + Math.cos(a) * (r + 6), cy + Math.sin(a) * (r + 6)); g.stroke();
    const warn = bands.find(([b0, b1, col]) => v >= b0 && v <= b1 && col !== '#1fbf3a');
    g.fillStyle = warn ? warn[2] : '#36e05a';
    g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(txt, cx, cy + 4);
    g.fillStyle = '#c9d2dd'; g.font = 'bold 13px Arial';
    g.fillText(label, cx, cy + r * 0.62);
    g.font = '11px Arial'; g.fillStyle = '#8b97a6';
    g.fillText(unit, cx, cy + r * 0.62 + 14);
  };
  const G = '#1fbf3a', Y = '#f2c81e', R = '#e8302a';
  arcG(76, 96, 54, d.ng, 0, 110, [[0, 56, '#2b3440'], [56, 100.5, G], [100.5, 110, R]], 'NG', d.ng.toFixed(1), '%');
  arcG(206, 96, 54, d.itt, 0, 900, [[0, 400, '#2b3440'], [400, 740, G], [740, 805, Y], [805, 900, R]], 'ITT', String(Math.round(d.itt)), '°C');
  arcG(76, 232, 54, d.rpm, 0, 2400, [[0, 1100, '#2b3440'], [1100, 2080, G], [2080, 2400, R]], 'NP', String(Math.round(d.rpm / 10) * 10), 'RPM');
  arcG(206, 232, 54, tq, 0, 120, [[0, 100, G], [100, 106, Y], [106, 120, R]], 'TORQ', tq.toFixed(1), '%');
  // Right column: fuel flow, fuel quantity, what the simulation does not
  // model (shown as not available).
  const row = (y, label, val, unit, col = '#36e05a') => {
    g.fillStyle = '#c9d2dd'; g.font = 'bold 14px Arial'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(label, 300, y);
    g.fillStyle = col; g.font = 'bold 22px Arial'; g.textAlign = 'right';
    g.fillText(val, 462, y);
    g.fillStyle = '#8b97a6'; g.font = '12px Arial'; g.textAlign = 'left';
    g.fillText(unit, 468, y + 2);
  };
  const lowFuel = d.fuel < d.fuelCap * 0.15;
  row(52, 'F.FLOW', String(Math.round(d.fuelFlow)), 'L/H');
  row(84, 'FUEL', String(Math.round(d.fuel)), 'L', lowFuel ? R : '#36e05a');
  {
    // Fuel quantity bar.
    g.fillStyle = '#1b222c'; g.fillRect(300, 102, 190, 10);
    g.fillStyle = lowFuel ? R : G; g.fillRect(300, 102, 190 * clamp(d.fuel / d.fuelCap, 0, 1), 10);
  }
  for (const [i, lab] of ['OIL P', 'OIL T', 'FUEL P', 'VOLTS', 'OAT'].entries()) {
    const y = 140 + i * 30;
    row(y, lab, '---', '', '#5d6876');
    g.fillStyle = '#5d6876'; g.font = 'bold 10px Arial'; g.textAlign = 'left';
    g.fillText('N/S', 468, y + 2);
  }
  // Run timer and alert strip.
  g.fillStyle = '#c9d2dd'; g.font = 'bold 13px Arial'; g.textAlign = 'left';
  g.fillText('ENG RUN', 300, 304);
  const hh = Math.floor(runT / 3600), mm = Math.floor((runT % 3600) / 60), ss = Math.floor(runT % 60);
  g.fillStyle = '#f2f2f2'; g.font = 'bold 26px monospace'; g.textAlign = 'right';
  g.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, 492, 306);
  const alerts = [];
  if (d.engine === 'cranking') alerts.push(['START', Y]);
  if (lowFuel) alerts.push(['LOW FUEL', R]);
  if (d.itt > 805) alerts.push(['ITT HIGH', R]);
  if (d.engine === 'off' && d.ng < 8) alerts.push(['ENGINE OFF', Y]);
  if (d.beta) alerts.push(['BETA', '#36e05a']);
  g.fillStyle = '#0c121a'; g.fillRect(0, H - 52, W, 52);
  g.font = 'bold 18px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (!alerts.length) { g.fillStyle = '#5d6876'; g.fillText('NO ALERTS', W / 2, H - 26); }
  alerts.slice(0, 3).forEach(([txt, col], i, arr) => {
    const w = W / arr.length;
    g.fillStyle = col; roundRect(g, i * w + 8, H - 44, w - 16, 36, 5); g.fill();
    g.fillStyle = '#05070a'; g.fillText(txt, i * w + w / 2, H - 25);
  });
}

// ---------------------------------------------------------------- G5 ADI
function drawG5(g, d, power) {
  const [W, H] = TH_SCREENS.g5;
  g.fillStyle = '#04060a'; g.fillRect(0, 0, W, H);
  if (!power) return;
  const cx = W / 2, cy = 150, k = 260; // px per rad of pitch
  g.save();
  g.beginPath(); g.rect(0, 0, W, 270); g.clip();
  g.translate(cx, cy);
  g.rotate(-d.bank);
  const py = clamp(d.pitch, -0.7, 0.7) * k;
  g.fillStyle = '#2a73c9'; g.fillRect(-W * 1.5, -H * 2 + py, W * 3, H * 2);
  g.fillStyle = '#8a5a2e'; g.fillRect(-W * 1.5, py, W * 3, H * 2);
  g.strokeStyle = '#fff'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-W * 1.5, py); g.lineTo(W * 1.5, py); g.stroke();
  g.fillStyle = '#fff'; g.font = 'bold 11px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const p of [-20, -15, -10, -5, 5, 10, 15, 20]) {
    const yy = py - (p * Math.PI / 180) * k, w = Math.abs(p) % 10 === 0 ? 34 : 16;
    g.beginPath(); g.moveTo(-w, yy); g.lineTo(w, yy); g.stroke();
    if (Math.abs(p) % 10 === 0) { g.fillText(String(Math.abs(p)), -w - 12, yy); g.fillText(String(Math.abs(p)), w + 12, yy); }
  }
  // Bank pointer on the rolling card.
  g.fillStyle = '#fff';
  g.beginPath(); g.moveTo(0, -104); g.lineTo(-8, -92); g.lineTo(8, -92); g.closePath(); g.fill();
  g.restore();
  // Fixed bank scale.
  g.strokeStyle = '#fff'; g.lineWidth = 2;
  for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const an = -Math.PI / 2 + (a * Math.PI) / 180, l = Math.abs(a) % 30 === 0 ? 14 : 8;
    g.beginPath(); g.moveTo(cx + Math.cos(an) * 112, cy + Math.sin(an) * 112); g.lineTo(cx + Math.cos(an) * (112 - l), cy + Math.sin(an) * (112 - l)); g.stroke();
  }
  // Aircraft symbol and slip ball.
  g.strokeStyle = '#ffcc00'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(cx - 62, cy); g.lineTo(cx - 22, cy); g.lineTo(cx - 12, cy + 10); g.stroke();
  g.beginPath(); g.moveTo(cx + 62, cy); g.lineTo(cx + 22, cy); g.lineTo(cx + 12, cy + 10); g.stroke();
  g.fillStyle = '#ffcc00'; g.beginPath(); g.arc(cx, cy, 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.fillRect(cx - 16, 40, 32, 6);
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx + clamp(-(d.slip ?? 0) * 3, -1, 1) * 13, 43, 4, 0, Math.PI * 2); g.fill();
  // Speed (left) and altitude (right) tapes.
  const tape = (x, w, val, step, fmt, left) => {
    g.fillStyle = 'rgba(20,24,30,0.72)'; g.fillRect(x, 30, w, 230);
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.font = 'bold 12px Arial'; g.fillStyle = '#fff';
    g.textAlign = left ? 'right' : 'left'; g.textBaseline = 'middle';
    const pxPer = 46 / step;
    const base = Math.floor(val / step) * step;
    for (let v = base - step * 3; v <= base + step * 3; v += step) {
      const y = cy - (v - val) * pxPer;
      if (y < 34 || y > 256) continue;
      g.beginPath(); g.moveTo(left ? x + w : x, y); g.lineTo(left ? x + w - 7 : x + 7, y); g.stroke();
      if (v >= 0) g.fillText(fmt(v), left ? x + w - 10 : x + 10, y);
    }
    g.fillStyle = '#000'; g.fillRect(x - 2, cy - 13, w + 4, 26);
    g.strokeStyle = '#fff'; g.strokeRect(x - 2, cy - 13, w + 4, 26);
    g.fillStyle = '#fff'; g.font = 'bold 16px Arial'; g.textAlign = 'center';
    g.fillText(fmt(Math.round(val)), x + w / 2, cy + 1);
  };
  tape(4, 46, d.ias, 10, (v) => String(Math.round(v)), true);
  tape(W - 56, 52, d.altFt, 100, (v) => String(Math.round(v / 10) * 10), false);
  g.fillStyle = '#ff6ad5'; g.font = 'bold 11px Arial'; g.textAlign = 'center';
  g.fillText('KT', 27, 270);
  g.fillText(`${d.vsFpm >= 0 ? '+' : ''}${Math.round(d.vsFpm / 10) * 10}`, W - 30, 270);
  // Heading box.
  g.fillStyle = '#000'; g.fillRect(0, 276, W, H - 276);
  g.fillStyle = '#fff'; g.font = 'bold 22px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(`${String(Math.round(d.hdg) % 360).padStart(3, '0')}°`, cx, 298);
  g.fillStyle = '#6fd1ff'; g.font = 'bold 11px Arial';
  g.textAlign = 'left'; g.fillText('HDG', 8, 298);
  g.textAlign = 'right'; g.fillText('29.92', W - 8, 298);
}

// ---------------------------------------------------------------- AG-NAV
function drawAgNav(g, d, power) {
  const [W, H] = TH_SCREENS.agnav;
  g.fillStyle = '#06080b'; g.fillRect(0, 0, W, H);
  if (!power) return;
  const gps = d.gps;
  const top = 34, bot = 44;
  // Status line: the next pass, cross-track, ground speed, height over the
  // crop, the spray state.
  g.fillStyle = '#10151c'; g.fillRect(0, 0, W, top);
  g.font = 'bold 16px Arial'; g.textBaseline = 'middle';
  const job = gps?.job;
  const cells = [
    ['PASS', gps?.next ? String(gps.next.k + 1) : '--'],
    ['XTE', gps?.next && gps.aligned ? `${gps.xte > 0 ? 'R' : 'L'}${Math.abs(gps.xte).toFixed(1)}` : '--'],
    ['GS', String(Math.round(d.gs ?? 0))],
    ['ALT', d.hgt < 99 ? d.hgt.toFixed(1) : '--'],
  ];
  cells.forEach(([lab, val], i) => {
    const x = 8 + i * 118;
    g.fillStyle = '#7f8c9b'; g.font = 'bold 11px Arial'; g.textAlign = 'left'; g.fillText(lab, x, 10);
    g.fillStyle = '#f2f2f2'; g.font = 'bold 17px Arial'; g.fillText(val, x, 25);
  });
  g.textAlign = 'right';
  g.fillStyle = d.spray ? (d.flow > 0 ? '#41e36a' : '#f2c81e') : '#7f8c9b';
  g.font = 'bold 15px Arial';
  g.fillText(d.spray ? (d.flow > 0 ? `BOOM ON ${Math.round(d.flow * 60)} L/M` : 'BOOM ON · NO FLOW') : 'BOOM OFF', W - 8, 17);
  // The game's guidance map in the middle.
  if (gps) gps.draw(g, 0, top, W, H - top - bot, { theme: 'thrush' });
  else { g.fillStyle = '#7f8c9b'; g.font = 'bold 16px Arial'; g.textAlign = 'center'; g.fillText('NO GPS', W / 2, H / 2); }
  // Soft-key bar (labels of the unit's pages; not interactive).
  g.fillStyle = '#10151c'; g.fillRect(0, H - bot, W, bot);
  const keys = [job ? 'JOB' : 'NO JOB', 'MAP', 'GUIDE', 'LOG', 'ZOOM', 'MENU'];
  keys.forEach((k, i) => {
    const w = W / keys.length;
    g.fillStyle = i === 0 && job ? '#d6402e' : '#2a3442';
    roundRect(g, i * w + 5, H - bot + 6, w - 10, bot - 12, 4); g.fill();
    g.fillStyle = '#e6ebf1'; g.font = 'bold 13px Arial'; g.textAlign = 'center';
    g.fillText(k, i * w + w / 2, H - bot / 2);
  });
}

// --------------------------------------------------- glareshield display
function drawHud(g, d, power) {
  const [W, H] = TH_SCREENS.hud;
  g.fillStyle = '#020403'; g.fillRect(0, 0, W, H);
  if (!power) return;
  const gps = d.gps;
  const on = gps?.next && gps.aligned;
  const e = on ? gps.xte : 0;
  g.font = 'bold 26px monospace'; g.textBaseline = 'middle';
  g.fillStyle = '#41ff6a';
  g.textAlign = 'left'; g.fillText(gps?.next ? String(gps.next.k + 1) : '--', 10, 24);
  g.textAlign = 'right'; g.fillText(on ? Math.abs(e).toFixed(1) : '--', W - 10, 24);
  g.textAlign = 'left'; g.fillText(String(Math.round(d.gs ?? 0)), 10, H - 20);
  g.textAlign = 'right'; g.fillText(d.hgt < 99 ? d.hgt.toFixed(1) : '--', W - 10, H - 20);
  // Arc cross-track indicator: green centre, amber and red either side.
  const cx = W / 2, cy = H - 8, r = 54;
  for (const [a0, a1, col] of [[-1, -0.6, '#e8302a'], [-0.6, -0.15, '#f2a81e'], [-0.15, 0.15, '#41ff6a'], [0.15, 0.6, '#f2a81e'], [0.6, 1, '#e8302a']]) {
    g.strokeStyle = col; g.lineWidth = 6;
    g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2 + a0 * 1.2, -Math.PI / 2 + a1 * 1.2); g.stroke();
  }
  if (on) {
    const a = -Math.PI / 2 + clamp(e / 7, -1, 1) * 1.2;
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 6, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = d.spray ? '#ffd640' : '#3a4a3e';
  g.font = 'bold 14px Arial'; g.textAlign = 'center';
  g.fillText(d.spray ? 'SPRAY' : 'OFF', cx, cy - 22);
}

// ------------------------------------------------- static textures
function finish(c) { return { c, tex: canvasTexture(c, { aniso: 8 }) }; }

// Airspeed (MPH, knots inside) and altimeter faces, side by side (512 x 256:
// two 256 px dials).
export const DIAL = {
  // Airspeed: 40–240 mph over 320°, 40 at the top.
  asiAngle: (kt) => ((clamp(kt * KT_MPH, 0, 250) - 40) / 200) * ((320 * Math.PI) / 180) + (10 * Math.PI) / 180,
  altAngle: (ft, per) => ((((ft % per) + per) % per) / per) * Math.PI * 2,
};
function drawDials() {
  const c = canvas(512, 256), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 256);
  const face = (cx) => {
    const cy = 128, r = 120;
    g.fillStyle = '#0a0b0c'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    return { cy, r };
  };
  // Airspeed.
  {
    const cx = 128, { cy, r } = face(cx);
    const ang = (mph) => DIAL.asiAngle(mph / KT_MPH) - Math.PI / 2;
    const arc = (m0, m1, col, rr, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(cx, cy, rr, ang(m0), ang(m1)); g.stroke(); };
    arc(55, 110, '#e8e8e8', r * 0.8, 8); // flaps
    arc(84, 188, '#2fae3e', r * 0.88, 10); // normal (clean stall at MTOW → VNE)
    g.strokeStyle = '#d8301e'; g.lineWidth = 4; { const a = ang(188); g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78); g.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95); g.stroke(); }
    g.strokeStyle = '#f2f2ee'; g.fillStyle = '#f2f2ee'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let m = 40; m <= 240; m += 5) {
      const a = ang(m), major = m % 20 === 0;
      g.lineWidth = major ? 3 : 1.5;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r * (major ? 0.8 : 0.86), cy + Math.sin(a) * r * (major ? 0.8 : 0.86)); g.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95); g.stroke();
      if (major) { g.font = 'bold 19px Arial'; g.fillText(String(m), cx + Math.cos(a) * r * 0.64, cy + Math.sin(a) * r * 0.64); }
    }
    // Knots ring inside.
    g.fillStyle = '#c9c9c4'; g.font = '12px Arial';
    for (let k = 40; k <= 200; k += 20) { const a = ang(k * KT_MPH); g.fillText(String(k), cx + Math.cos(a) * r * 0.44, cy + Math.sin(a) * r * 0.44); }
    g.font = 'bold 13px Arial'; g.fillStyle = '#f2f2ee';
    g.fillText('MPH', cx, cy - 34); g.font = '11px Arial'; g.fillText('AIRSPEED', cx, cy + 30); g.fillText('KNOTS', cx, cy + 46);
  }
  // Altimeter.
  {
    const cx = 384, { cy, r } = face(cx);
    g.strokeStyle = '#f2f2ee'; g.fillStyle = '#f2f2ee'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 50; i++) {
      const a = (i / 50) * Math.PI * 2 - Math.PI / 2, major = i % 5 === 0;
      g.lineWidth = major ? 3 : 1.5;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r * (major ? 0.8 : 0.87), cy + Math.sin(a) * r * (major ? 0.8 : 0.87)); g.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95); g.stroke();
      if (major) { g.font = 'bold 22px Arial'; g.fillText(String(i / 5), cx + Math.cos(a) * r * 0.64, cy + Math.sin(a) * r * 0.64); }
    }
    g.font = 'bold 13px Arial'; g.fillText('ALT', cx, cy - 36);
    g.font = '10px Arial'; g.fillText('100 FEET', cx, cy + 32);
    // Kollsman window.
    g.fillStyle = '#000'; g.fillRect(cx + 34, cy - 10, 46, 20);
    g.fillStyle = '#f2f2ee'; g.font = 'bold 13px monospace'; g.fillText('29.92', cx + 57, cy + 1);
    // Low-altitude stripes (hatched sector below 10,000 ft).
    g.save(); g.beginPath(); g.rect(cx - 30, cy + 44, 60, 16); g.clip();
    for (let k = -4; k < 8; k++) { g.fillStyle = k % 2 ? '#f2f2ee' : '#111'; g.beginPath(); g.moveTo(cx - 30 + k * 10, cy + 60); g.lineTo(cx - 20 + k * 10, cy + 44); g.lineTo(cx - 10 + k * 10, cy + 44); g.lineTo(cx - 20 + k * 10, cy + 60); g.fill(); }
    g.restore();
  }
  return finish(c);
}

// Panel face (1024 x 448 px for 0.96 x 0.42 m): black anodised, placards,
// labels round the units, the annunciator captions.
export const FACE = { W: 1024, H: 448, w: 0.96, h: 0.42 };
function drawFace() {
  const c = canvas(FACE.W, FACE.H), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, FACE.H);
  grd.addColorStop(0, '#141619'); grd.addColorStop(0.15, '#1c1f23'); grd.addColorStop(1, '#17191c');
  g.fillStyle = grd; g.fillRect(0, 0, FACE.W, FACE.H);
  const r = rng(117);
  for (let i = 0; i < 2600; i++) {
    const v = r() < 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${0.012 + r() * 0.022})`;
    g.fillRect(r() * FACE.W, r() * FACE.H, 1 + r() * 30, 1);
  }
  // u (m, pilot's right +) / v (m, up) → px.
  const P = (u, v) => [(u + FACE.w / 2) * (FACE.W / FACE.w), FACE.H - v * (FACE.H / FACE.h)];
  const text = (u, v, s, px = 10, col = '#d9dde1', bold = true) => { const [x, y] = P(u, v); g.fillStyle = col; g.font = `${bold ? 'bold ' : ''}${px}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, x, y); };
  const placard = (u, v, w, h, lines, bg = '#e8e9ea', fg = '#111') => {
    const [x, y] = P(u - w / 2, v + h / 2), [x1, y1] = P(u + w / 2, v - h / 2);
    g.fillStyle = bg; g.fillRect(x, y, x1 - x, y1 - y);
    g.fillStyle = fg; g.font = 'bold 9px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((s, i) => g.fillText(s, (x + x1) / 2, y + (y1 - y) * ((i + 0.5) / lines.length)));
  };
  const stripe = (u, v, w, h, s) => {
    const [x, y] = P(u - w / 2, v + h / 2), [x1, y1] = P(u + w / 2, v - h / 2);
    g.save(); g.beginPath(); g.rect(x, y, x1 - x, y1 - y); g.clip();
    for (let k = -10; k < 60; k++) { g.fillStyle = k % 2 ? '#d22a22' : '#f2f2f2'; g.beginPath(); g.moveTo(x + k * 10, y1); g.lineTo(x + k * 10 + 10, y); g.lineTo(x + k * 10 + 20, y); g.lineTo(x + k * 10 + 10, y1); g.fill(); }
    g.restore();
    g.fillStyle = '#d22a22'; g.fillRect(x + 14, y + 3, x1 - x - 28, y1 - y - 6);
    g.fillStyle = '#fff'; g.font = 'bold 8px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, (x + x1) / 2, (y + y1) / 2);
  };
  // Annunciator captions (the lamps are 3D).
  text(-0.33, 0.385, 'MASTER CAUTION', 9); text(-0.22, 0.385, 'MASTER WARNING', 9);
  text(-0.275, 0.07, 'PUSH · SELECT', 8, '#9aa2aa');
  text(-0.41, 0.3, 'MVP', 8, '#9aa2aa'); text(-0.41, 0.285, 'ALERTS', 8, '#9aa2aa');
  placard(-0.065, 0.405, 0.15, 0.03, ['MAX AIRSPEED AT GROSS WEIGHTS', 'ABOVE 9,000 LB 150 MPH']);
  placard(0.24, 0.4, 0.2, 0.024, ['GPS FOR DAY VFR FLIGHT ONLY'], '#e8e9ea');
  placard(-0.3, 0.035, 0.18, 0.024, ['USABLE FUEL 863 L (228 US GAL)']);
  stripe(-0.3, 0.012, 0.2, 0.02, 'NÃO OPERAR EM BETA EM VOO');
  stripe(0.3, 0.012, 0.18, 0.02, 'NÃO DECOLAR COM HOPPER ABERTO');
  text(0.04, 0.4, 'PR-TSH', 11, '#e6e8ea');
  text(0.04, 0.07, 'HOPPER', 9, '#c3c9cf');
  text(0.43, 0.18, 'BOOM', 8, '#9aa2aa'); text(0.43, 0.165, 'PRESS', 8, '#9aa2aa');
  // Module plates: slightly lighter outlines round each unit's cut-out.
  g.strokeStyle = 'rgba(150,160,170,0.18)'; g.lineWidth = 2;
  const plate = (u0, v0, u1, v1) => { const [x0, y0] = P(u0, v1), [x1, y1] = P(u1, v0); roundRect(g, x0, y0, x1 - x0, y1 - y0, 6); g.stroke(); };
  plate(-0.43, 0.05, -0.135, 0.37); plate(-0.125, 0.06, 0.0, 0.37); plate(0.005, 0.06, 0.105, 0.37); plate(0.115, 0.05, 0.445, 0.37);
  return finish(c);
}

// Console faces (two 512 x 256 halves of one canvas: left, right). Labels
// and switch plates; the toggles, knobs and breakers are 3D.
export const CONSOLE = {
  W: 1024, H: 256,
  // Toggle and breaker layouts in console-face metres (u across, v up the
  // slope), shared with the 3D parts. Left: dimmers, low-fuel test, boom
  // and lights toggles; right: breaker matrix, start / battery, the
  // tailwheel-lock placard.
  left: {
    w: 0.3, h: 0.2,
    toggles: [[-0.11, 0.07, 'BATT'], [-0.07, 0.07, 'GEN'], [-0.03, 0.07, 'AVION'], [0.01, 0.07, 'BOOST'], [0.05, 0.07, 'IGN'], [0.09, 0.07, 'START'],
      [-0.11, 0.135, 'NAV'], [-0.07, 0.135, 'STRB'], [-0.03, 0.135, 'BCN'], [0.01, 0.135, 'LAND'], [0.05, 0.135, 'TAXI'], [0.09, 0.135, 'WIPER']],
    knobs: [[-0.1, 0.02, 'PANEL'], [-0.04, 0.02, 'FLOOD'], [0.06, 0.02, 'GPS DIM']],
    lamp: [0.11, 0.175, 'LOW FUEL'],
  },
  right: {
    w: 0.3, h: 0.2,
    rows: 4, cols: 9,
    toggles: [[0.09, 0.03, 'START'], [0.12, 0.03, 'BATT']],
    lamp: [0.1, 0.17, 'CHIP'],
  },
};
function drawConsoles() {
  const c = canvas(CONSOLE.W, CONSOLE.H), g = c.getContext('2d');
  for (const [ox, def, title] of [[0, CONSOLE.left, 'ENGINE · LIGHTS'], [512, CONSOLE.right, 'CIRCUIT BREAKERS']]) {
    g.fillStyle = '#131518'; g.fillRect(ox, 0, 512, 256);
    const r = rng(ox + 7);
    for (let i = 0; i < 900; i++) { const v = r() < 0.5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},${0.015 + r() * 0.02})`; g.fillRect(ox + r() * 512, r() * 256, 1 + r() * 20, 1); }
    const P = (u, v) => [ox + (u / def.w + 0.5) * 512, 256 - (v / def.h) * 256];
    g.fillStyle = '#d9dde1'; g.font = 'bold 13px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(title, ox + 256, 14);
    g.font = 'bold 11px Arial';
    for (const [u, v, s] of def.toggles ?? []) { const [x, y] = P(u, v); g.fillText(s, x, y - 20); g.fillText('ON', x, y + 21); }
    for (const [u, v, s] of def.knobs ?? []) { const [x, y] = P(u, v); g.fillText(s, x, y - 18); }
    if (def.lamp) { const [x, y] = P(def.lamp[0], def.lamp[1]); g.fillText(def.lamp[2], x, y + 18); }
    if (def.rows) {
      g.font = 'bold 8px Arial';
      const labels = ['PITOT', 'BOOST', 'START', 'IGN', 'GEN', 'BATT', 'AVION', 'GPS', 'COM', 'NAV', 'STRB', 'BCN', 'LAND', 'TAXI', 'FLAP', 'TRIM', 'WIPER', 'HTR', 'MVP', 'G5', 'AGNAV', 'FLOW', 'PUMP', 'VALVE', 'HOPPER', 'LTS', 'PANEL', 'CHIP', 'FIRE', 'ITT', 'TQ', 'NG', 'NP', 'FUEL', 'OIL', 'AUX'];
      for (let i = 0; i < def.rows; i++) for (let j = 0; j < def.cols; j++) {
        const [x, y] = P(-0.12 + j * 0.022, 0.155 - i * 0.032);
        g.fillText(labels[(i * def.cols + j) % labels.length], x, y - 13);
      }
      // Tailwheel-lock placard (as on the type).
      g.fillStyle = '#e8e9ea'; const [px, py] = P(-0.05, 0.03); g.fillRect(px - 90, py - 12, 180, 24);
      g.fillStyle = '#111'; g.font = 'bold 10px Arial'; g.fillText('EMPURRE O MANCHE PARA', px, py - 4); g.fillText('DESTRAVAR A BEQUILHA', px, py + 7);
    }
    // Plate screws.
    g.fillStyle = '#5a6168';
    for (const [x, y] of [[ox + 10, 10], [ox + 502, 10], [ox + 10, 246], [ox + 502, 246]]) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
  }
  return finish(c);
}

// The hopper's rear wall under the panel (beige fibreglass, litre / US
// gallon scale as in the cockpit photos).
function drawHopperWall() {
  const c = canvas(256, 512), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 256, 0);
  grd.addColorStop(0, '#a99a7b'); grd.addColorStop(0.5, '#c2b493'); grd.addColorStop(1, '#a99a7b');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 512);
  const r = rng(73);
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(80,65,40,${0.03 + r() * 0.05})`; g.fillRect(r() * 256, r() * 512, 1 + r() * 3, 1 + r() * 3); }
  g.fillStyle = '#2a2520'; g.font = 'bold 26px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const rows = [[1930, 510], [1600, 420], [1300, 340], [1000, 260], [700, 185], [400, 105]];
  rows.forEach(([l, gal], i) => {
    const y = 40 + i * 78;
    g.fillText(`${gal} — ${l}`, 128, y);
    g.fillRect(20, y + 22, 216, 3);
  });
  g.font = 'bold 14px Arial'; g.fillText('GALS. — LITERS', 128, 500);
  return finish(c);
}
