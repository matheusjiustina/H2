// PZL M-18B Dromader instrument panels (canvas textures, live values). A
// classic split panel as in the real aircraft: the flight instruments on the
// left board, the ASz-62IR engine instruments on the right one, metric dials
// with Polish legends (km/h, m, m/s, mm Hg boost, °C, kG/cm², litres), an
// annunciator strip on top. Between the boards the pilot looks at the back
// wall of the hopper: translucent fibreglass with the stencilled litre scale
// and the liquid level behind it (second texture). The guidance GPS sits on
// the glareshield (third texture).
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp, rng } from '../core/math.js';
import { gauge, bezel, needle, flapInd, gps, roundRect, glassGlint } from './panel.js';
import { attitude, heading, turn } from './atPanel.js';

// Canvas layout: left board x 0–500, right board x 524–1024.
// One canvas, three boards (canvas rectangles [x0, y0, x1, y1]), laid out as
// in the real cabin: the wide flight-instrument panel under the glareshield
// hood, and below it a board on each side of the hopper wall — the left one
// with the warning lamps, the switches and the engine gauges, the right one
// with the temperatures, pressures and the spray readout.
export const M18_PANEL = { W: 1024, H: 512, up: [0, 0, 1024, 164], left: [0, 176, 504, 512], right: [520, 176, 1024, 512] };
export const M18_HOPPER = { W: 512, H: 640, cap: 2500 };

const KMH = 1.852, MPS = 0.00508, KGCM = 0.0703, MMHG = 25.4;

export function createDromaderPanel({ reg = 'PR-DMD' } = {}) {
  const c = canvas(M18_PANEL.W, M18_PANEL.H);
  const tex = canvasTexture(c, { aniso: 8 });
  const g = c.getContext('2d');
  const bg = canvas(M18_PANEL.W, M18_PANEL.H);
  const bgg = bg.getContext('2d');
  drawBackground(bgg, reg);
  // Glareshield GPS.
  const gc = canvas(420, 300);
  const gpsTexture = canvasTexture(gc, { aniso: 4 });
  const gg = gc.getContext('2d');
  // Hopper back wall (sight).
  const hc = canvas(M18_HOPPER.W, M18_HOPPER.H);
  const sightTexture = canvasTexture(hc, { aniso: 4 });
  const hg = hc.getContext('2d');
  const hBg = canvas(M18_HOPPER.W, M18_HOPPER.H);
  drawHopperWall(hBg.getContext('2d'));
  let lastHopper = -1;
  const drawSight = (hopper) => {
    hg.drawImage(hBg, 0, 0);
    // The liquid shows through the translucent wall as a darker band.
    const { x0, x1, top, bot } = HOPPER_WIN;
    const y = bot - clamp(hopper / M18_HOPPER.cap, 0, 1) * (bot - top);
    if (hopper > 1) {
      const lg = hg.createLinearGradient(0, y, 0, bot);
      lg.addColorStop(0, 'rgba(70,95,60,0.55)');
      lg.addColorStop(1, 'rgba(40,60,35,0.7)');
      hg.fillStyle = lg;
      hg.fillRect(x0, y, x1 - x0, bot - y);
      hg.fillStyle = 'rgba(235,240,210,0.7)';
      hg.fillRect(x0, y - 2, x1 - x0, 3);
    }
    sightTexture.needsUpdate = true;
  };
  drawSight(0);
  return {
    canvas: c, texture: tex, gpsTexture, sightTexture,
    setReg(r) { bgg.clearRect(0, 0, bg.width, bg.height); drawBackground(bgg, r); g.drawImage(bg, 0, 0); tex.needsUpdate = true; },
    draw(d) {
      g.clearRect(0, 0, M18_PANEL.W, M18_PANEL.H);
      g.drawImage(bg, 0, 0);
      annunciators(g, d);
      // ---- upper panel: flight instruments (metric), one row.
      const kmh = d.ias * KMH, UY = 84;
      gauge(g, 88, UY, 62, {
        label: 'PRĘDKOŚĆ', unit: 'km/h', min: 0, max: 350, value: kmh, major: 50, minor: 10,
        arcs: [[(d.vs0 ?? 58) * KMH, (d.vfe ?? 100) * KMH, '#e8e8e8', 90], [(d.vs1 ?? 65) * KMH, 220, '#3fb24a', 98], [220, (d.vne ?? 140) * KMH, '#f0c020', 98], [(d.vne ?? 140) * KMH, 350, '#d0362a', 98]],
      });
      attitude(g, 258, UY, 66, d.pitch, d.bank, d.slip);
      metricAltimeter(g, 428, UY, 62, d.altFt * 0.3048);
      heading(g, 596, UY, 60, d.hdg);
      gauge(g, 766, UY, 60, {
        label: 'WARIOMETR', unit: 'm/s', min: -10, max: 10, value: d.vsFpm * MPS, major: 5, minor: 1, sweep: 320, arcs: [],
      });
      turn(g, 936, UY, 58, d.yawRate, d.slip);
      // ---- left board: lamps, switches, ASz-62IR power.
      const run = d.engine !== 'off' || d.rpm > 30;
      gauge(g, 92, 330, 56, {
        label: 'OBROTY', unit: 'obr/min x100', min: 0, max: 26, value: d.rpm / 100, major: 2, minor: 1,
        arcs: [[16, 21, '#3fb24a', 98], [21, 22, '#f0c020', 98], [22, 26, '#d0362a', 98]],
      });
      gauge(g, 252, 330, 56, {
        label: 'DOŁADOWANIE', unit: 'mm Hg x100', min: 3, max: 12, value: ((d.mp ?? 29.6) * MMHG) / 100, major: 1, minor: 0.5,
        arcs: [[5, 9.4, '#3fb24a', 98], [9.4, 10.5, '#f0c020', 98], [10.5, 12, '#d0362a', 98]],
      });
      gauge(g, 412, 330, 56, {
        label: 'PALIWO', unit: 'L x100', min: 0, max: Math.ceil(d.fuelCap / 100), value: d.fuel / 100, major: 2, minor: 1, sweep: 240,
        arcs: [[0, (d.fuelCap * 0.15) / 100, '#d0362a', 98]],
      });
      gauge(g, 92, 446, 40, {
        label: 'PRZECIĄŻENIE', unit: 'g', min: -2, max: 5, value: d.gLoad, major: 1, minor: 0.5, sweep: 270,
        arcs: [[3.8, 5, '#d0362a', 98], [-2, -1.0, '#d0362a', 98]],
      });
      flapInd(g, 410, 418, d.flaps);
      // ---- right board: temperatures, pressures, hopper, spray readout.
      gauge(g, 612, 300, 50, {
        label: 'TEMP. GŁOWIC', unit: '°C', min: 0, max: 300, value: d.cht ?? 30, major: 50, minor: 10,
        arcs: [[140, 215, '#3fb24a', 98], [215, 245, '#f0c020', 98], [245, 300, '#d0362a', 98]],
      });
      gauge(g, 772, 300, 50, {
        label: 'TEMP. OLEJU', unit: '°C', min: 0, max: 125, value: d.oilT ?? 30, major: 25, minor: 5,
        arcs: [[60, 75, '#3fb24a', 98], [75, 85, '#f0c020', 98], [85, 125, '#d0362a', 98]],
      });
      gauge(g, 932, 300, 50, {
        label: 'CIŚN. OLEJU', unit: 'kG/cm²', min: 0, max: 8, value: (d.oilP ?? 0) * KGCM, major: 1, minor: 0.5,
        arcs: [[4, 6, '#3fb24a', 98], [0, 2, '#d0362a', 98]],
      });
      gauge(g, 612, 432, 44, {
        label: 'PRZEPŁYW', unit: 'L/h x10', min: 0, max: 40, value: (d.fuelFlow ?? 0) / 10, major: 10, minor: 2, sweep: 260, arcs: [],
      });
      gauge(g, 732, 432, 44, {
        label: 'ZBIORNIK', unit: 'L x100', min: 0, max: 25, value: d.hopper / 100, major: 5, minor: 1, sweep: 240, arcs: [], needle: '#9fd8ff',
      });
      gauge(g, 852, 432, 38, {
        label: 'NAPIĘCIE', unit: 'V', min: 0, max: 32, value: d.engine === 'running' && d.rpm > 900 ? 28 : run ? 23.5 : 24.4, major: 8, minor: 2, sweep: 240,
        arcs: [[26.5, 29, '#3fb24a', 98]],
      });
      flowBox(g, 898, 398, d);
      tex.needsUpdate = true;
      gps(gg, 0, 0, 420, 300, d.gps);
      gpsTexture.needsUpdate = true;
      if (Math.abs(d.hopper - lastHopper) > 2) { lastHopper = d.hopper; drawSight(d.hopper); }
    },
  };
}

// Board outlines (the canvas outside them stays transparent: the meshes use
// an alpha test, so each board keeps its real outline in the cockpit).
function boardPath(g, [x0, y0, x1, y1], ch) {
  g.beginPath();
  g.moveTo(x0 + ch, y0); g.lineTo(x1 - ch, y0); g.lineTo(x1, y0 + ch);
  g.lineTo(x1, y1 - ch); g.lineTo(x1 - ch, y1); g.lineTo(x0 + ch, y1); g.lineTo(x0, y1 - ch);
  g.lineTo(x0, y0 + ch);
  g.closePath();
}

function drawBackground(g, reg) {
  g.clearRect(0, 0, M18_PANEL.W, M18_PANEL.H);
  const r = rng(181);
  for (const [B, ch] of [[M18_PANEL.up, 14], [M18_PANEL.left, 26], [M18_PANEL.right, 26]]) {
    const [x0, y0, x1, y1] = B;
    // Black crackle-finish boards.
    boardPath(g, B, ch);
    const grd = g.createLinearGradient(0, y0, 0, y1);
    grd.addColorStop(0, '#1b1c1d'); grd.addColorStop(1, '#232425');
    g.fillStyle = grd; g.fill();
    g.save(); g.clip();
    const n = ((x1 - x0) * (y1 - y0)) / 80;
    for (let i = 0; i < n; i++) {
      const v = r() < 0.5 ? 255 : 0;
      g.fillStyle = `rgba(${v},${v},${v},${0.02 + r() * 0.035})`;
      g.fillRect(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 1 + r() * 3, 1 + r() * 3);
    }
    g.restore();
    g.strokeStyle = 'rgba(120,120,120,0.45)'; g.lineWidth = 3;
    boardPath(g, B, ch); g.stroke();
    // Screws in the corners.
    g.fillStyle = '#6a6d70';
    for (const [sx, sy] of [[x0 + ch * 0.8, y0 + 9], [x1 - ch * 0.8, y0 + 9], [x0 + ch * 0.8, y1 - 9], [x1 - ch * 0.8, y1 - 9]]) {
      g.beginPath(); g.arc(sx, sy, 4, 0, Math.PI * 2); g.fill();
    }
  }
  // Placards (white on black), as stencilled on the real boards.
  g.fillStyle = '#d8d8d2'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = 'bold 11px Arial';
  g.fillText(reg, 572, 202);
  g.fillText('PZL M-18B', 572, 218);
  g.font = '9px Arial';
  g.fillText('VNE 256 km/h · VFE 185 km/h', 660, 202);
  g.fillText('MAX 2200 obr/min · 1050 mm Hg · 5 min', 660, 218);
  g.fillText('ZAKAZ PALENIA', 900, 238);
  // Switch row labels on the left board (live toggles drawn per frame).
  const sw = ['AKU', 'PRĄDN.', 'ISKR.', 'ROZR.', 'POMPA', 'NAV', 'BŁYSK.', 'OPRYSK'];
  g.font = 'bold 8px Arial'; g.textAlign = 'center';
  sw.forEach((t, i) => g.fillText(t, SW.x + i * SW.dx, SW.y + 26));
}

// Switch row on the left board (canvas px).
const SW = { x: 160, y: 432, dx: 26 };

function annunciators(g, d) {
  const items = [
    ['PRZECIĄGN.', d.stall > 0.5, '#ff3b2a'], // stall
    ['PALIWO', d.fuel < d.fuelCap * 0.15, '#ffb020'],
    ['OLEJ', d.engine === 'running' && (d.oilP ?? 0) * KGCM < 2, '#ff3b2a'],
    ['GŁOWICE', (d.cht ?? 0) > 245, '#ff3b2a'],
    ['ROZRUCH', d.engine === 'cranking', '#ffb020'],
    ['PRĄDNICA', d.engine !== 'running', '#ffb020'],
    ['HAMULEC', d.brake, '#ffb020'],
    ['OPRYSK', d.spray, '#3dff7a'],
  ];
  items.forEach(([t, on, col], i) => {
    // Two rows of four lamps across the top of the left board.
    const x = 22 + (i % 4) * 118, y = 192 + Math.floor(i / 4) * 34, w = 108, h = 26;
    g.fillStyle = '#0f1012';
    roundRect(g, x - 3, y - 3, w + 6, h + 6, 5); g.fill();
    const base = { '#ff3b2a': '#4a1712', '#ffb020': '#4d3a10', '#3dff7a': '#173d22' }[col];
    g.fillStyle = on ? col : base;
    roundRect(g, x, y, w, h, 3); g.fill();
    g.fillStyle = on ? '#111' : 'rgba(255,255,255,0.28)';
    g.font = 'bold 11px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, x + w / 2, y + h / 2 + 1);
  });
  // Switch toggles: battery, generator, magnetos, starter, fuel pump, nav, strobe, spray.
  const on = [true, d.engine === 'running', d.engine !== 'off', d.engine === 'cranking', d.engine !== 'off', true, d.engine !== 'off', d.spray];
  on.forEach((v, i) => {
    const x = SW.x + i * SW.dx, y = SW.y;
    g.fillStyle = '#d7dadc';
    g.beginPath(); g.arc(x, y, 6.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7d848b';
    g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#e8eaec'; g.lineWidth = 3.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + (v ? -12 : 12)); g.stroke();
    g.lineCap = 'butt';
  });
}

// Altimeter in metres (Soviet / Polish style): the long hand turns once per
// 1,000 m (dial 0–9 = hundreds), the short one once per 10,000 m, with a
// drum readout of the altitude in metres.
function metricAltimeter(g, x, y, r, m) {
  bezel(g, x, y, r);
  g.strokeStyle = '#e9e9e4'; g.fillStyle = '#e9e9e4';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${Math.round(r * 0.19)}px Arial`;
  for (let i = 0; i < 50; i++) {
    const a = -Math.PI / 2 + (i / 50) * Math.PI * 2;
    const major = i % 5 === 0;
    g.lineWidth = major ? 3 : 1.5;
    const r0 = r * (major ? 0.78 : 0.86);
    g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r * 0.93, y + Math.sin(a) * r * 0.93); g.stroke();
    if (major) g.fillText(String(i / 5), x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62);
  }
  g.font = `${Math.round(r * 0.12)}px Arial`;
  g.fillStyle = '#b9bcb6';
  g.fillText('WYSOKOŚĆ', x, y - r * 0.3);
  g.fillText('m', x, y + r * 0.46);
  const mm = Math.max(0, m);
  g.fillStyle = '#000'; g.fillRect(x - 25, y + 6, 50, 20);
  g.fillStyle = '#fff'; g.font = 'bold 16px Arial';
  g.fillText(String(Math.round(mm)).padStart(4, '0'), x, y + 17);
  needle(g, x, y, r * 0.5, -Math.PI / 2 + ((mm % 10000) / 10000) * Math.PI * 2, '#d9d9d2');
  needle(g, x, y, r * 0.84, -Math.PI / 2 + ((mm % 1000) / 1000) * Math.PI * 2, '#f2f2ec');
  glassGlint(g, x, y, r);
}

function flowBox(g, x, y, d) {
  g.fillStyle = '#121416';
  g.fillRect(x - 4, y - 4, 128, 76);
  g.fillStyle = '#071008';
  g.fillRect(x, y, 120, 68);
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = 'bold 14px monospace';
  g.fillStyle = d.spray ? '#7fd0ff' : '#4a6a7a';
  g.fillText(`${d.spray ? (d.flow * 60).toFixed(0) : '0'} L/min`, x + 7, y + 20);
  g.fillStyle = '#9ff0a4';
  g.fillText(`H ${d.hgt < 99 ? d.hgt.toFixed(1) : '--'} m`, x + 7, y + 40);
  g.fillText(`${Math.round(d.hopper)} L`, x + 7, y + 60);
}

// Back wall of the hopper between the lower boards: riveted tan plate with a
// narrow vertical sight window (the liquid shows through as a darker band)
// and the litre scale beside it.
export const HOPPER_WIN = { x0: 196, x1: 266, top: 70, bot: 590 };
function drawHopperWall(g) {
  const { W, H, cap } = M18_HOPPER, Wn = HOPPER_WIN;
  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, '#8d7450'); grd.addColorStop(0.5, '#a88b5f'); grd.addColorStop(1, '#8a714e');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  const r = rng(77);
  for (let i = 0; i < 4000; i++) {
    g.strokeStyle = `rgba(${70 + r() * 60},${55 + r() * 40},${30 + r() * 25},${0.12 + r() * 0.15})`;
    g.lineWidth = 1;
    const x = r() * W, y = r() * H, a = r() * Math.PI;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10); g.stroke();
  }
  // Rivet lines along the seams and round the window.
  const rivet = (x, y) => {
    g.fillStyle = 'rgba(40,30,18,0.55)'; g.beginPath(); g.arc(x + 1, y + 1, 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c9b18a'; g.beginPath(); g.arc(x, y, 3.4, 0, Math.PI * 2); g.fill();
  };
  for (let y = 24; y < H; y += 34) { rivet(18, y); rivet(W - 18, y); rivet(Wn.x0 - 22, y); rivet(Wn.x1 + 22, y); }
  for (let x = 18; x < W; x += 34) { rivet(x, 18); rivet(x, H - 18); }
  // Sight window: dark frame, translucent fibreglass behind.
  g.fillStyle = '#2a2622'; g.fillRect(Wn.x0 - 8, Wn.top - 8, Wn.x1 - Wn.x0 + 16, Wn.bot - Wn.top + 16);
  g.fillStyle = '#d9c99c'; g.fillRect(Wn.x0, Wn.top, Wn.x1 - Wn.x0, Wn.bot - Wn.top);
  g.fillStyle = '#16110a';
  g.textAlign = 'left'; g.textBaseline = 'middle';
  for (let v = 0; v <= cap; v += 100) {
    const y = Wn.bot - (v / cap) * (Wn.bot - Wn.top);
    const major = v % 500 === 0;
    g.fillStyle = '#16110a';
    g.fillRect(Wn.x1 + 4, y - 1.5, major ? 26 : 14, 3);
    if (major && v > 0) { g.font = 'bold 20px Arial'; g.fillText(String(v), Wn.x1 + 34, y + 1); }
  }
  g.font = 'bold 15px Arial'; g.fillStyle = '#1d150c';
  g.fillText('ZBIORNIK 2500 L', Wn.x0 - 40, 44);
}
