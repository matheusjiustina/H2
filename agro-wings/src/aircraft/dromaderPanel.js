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
export const M18_PANEL = { W: 1024, H: 512, split: 512, left: [0, 500], right: [524, 1024] };
export const M18_HOPPER = { W: 512, H: 768, cap: 2500 };

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
    const top = 60, bot = 720;
    const y = bot - clamp(hopper / M18_HOPPER.cap, 0, 1) * (bot - top);
    if (hopper > 1) {
      const lg = hg.createLinearGradient(0, y, 0, bot);
      lg.addColorStop(0, 'rgba(70,95,60,0.42)');
      lg.addColorStop(1, 'rgba(40,60,35,0.55)');
      hg.fillStyle = lg;
      hg.fillRect(0, y, M18_HOPPER.W, bot - y + 48);
      hg.fillStyle = 'rgba(235,240,210,0.55)';
      hg.fillRect(0, y - 2, M18_HOPPER.W, 4);
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
      // ---- left board: flight instruments (metric).
      const kmh = d.ias * KMH;
      gauge(g, 92, 150, 62, {
        label: 'PRĘDKOŚĆ', unit: 'km/h', min: 0, max: 350, value: kmh, major: 50, minor: 10,
        arcs: [[(d.vs0 ?? 58) * KMH, (d.vfe ?? 100) * KMH, '#e8e8e8', 90], [(d.vs1 ?? 65) * KMH, 220, '#3fb24a', 98], [220, (d.vne ?? 140) * KMH, '#f0c020', 98], [(d.vne ?? 140) * KMH, 350, '#d0362a', 98]],
      });
      attitude(g, 250, 150, 62, d.pitch, d.bank, d.slip);
      metricAltimeter(g, 408, 150, 62, d.altFt * 0.3048);
      turn(g, 92, 300, 54, d.yawRate, d.slip);
      heading(g, 250, 300, 54, d.hdg);
      gauge(g, 408, 300, 54, {
        label: 'WARIOMETR', unit: 'm/s', min: -10, max: 10, value: d.vsFpm * MPS, major: 5, minor: 1, sweep: 320, arcs: [],
      });
      gauge(g, 92, 430, 42, {
        label: 'PRZECIĄŻENIE', unit: 'g', min: -2, max: 5, value: d.gLoad, major: 1, minor: 0.5, sweep: 270,
        arcs: [[3.8, 5, '#d0362a', 98], [-2, -1.0, '#d0362a', 98]],
      });
      flapInd(g, 205, 434, d.flaps);
      gauge(g, 408, 430, 42, {
        label: 'PALIWO', unit: 'L x100', min: 0, max: Math.ceil(d.fuelCap / 100), value: d.fuel / 100, major: 2, minor: 1, sweep: 240,
        arcs: [[0, (d.fuelCap * 0.15) / 100, '#d0362a', 98]],
      });
      // ---- right board: ASz-62IR engine.
      const run = d.engine !== 'off' || d.rpm > 30;
      gauge(g, 610, 150, 62, {
        label: 'OBROTY', unit: 'obr/min x100', min: 0, max: 26, value: d.rpm / 100, major: 2, minor: 1,
        arcs: [[16, 21, '#3fb24a', 98], [21, 22, '#f0c020', 98], [22, 26, '#d0362a', 98]],
      });
      gauge(g, 770, 150, 62, {
        label: 'DOŁADOWANIE', unit: 'mm Hg x100', min: 3, max: 12, value: ((d.mp ?? 29.6) * MMHG) / 100, major: 1, minor: 0.5,
        arcs: [[5, 9.4, '#3fb24a', 98], [9.4, 10.5, '#f0c020', 98], [10.5, 12, '#d0362a', 98]],
      });
      gauge(g, 930, 150, 62, {
        label: 'TEMP. GŁOWIC', unit: '°C', min: 0, max: 300, value: d.cht ?? 30, major: 50, minor: 10,
        arcs: [[140, 215, '#3fb24a', 98], [215, 245, '#f0c020', 98], [245, 300, '#d0362a', 98]],
      });
      gauge(g, 610, 300, 54, {
        label: 'TEMP. OLEJU', unit: '°C', min: 0, max: 125, value: d.oilT ?? 30, major: 25, minor: 5,
        arcs: [[60, 75, '#3fb24a', 98], [75, 85, '#f0c020', 98], [85, 125, '#d0362a', 98]],
      });
      gauge(g, 770, 300, 54, {
        label: 'CIŚN. OLEJU', unit: 'kG/cm²', min: 0, max: 8, value: (d.oilP ?? 0) * KGCM, major: 1, minor: 0.5,
        arcs: [[4, 6, '#3fb24a', 98], [0, 2, '#d0362a', 98]],
      });
      gauge(g, 930, 300, 54, {
        label: 'PRZEPŁYW', unit: 'L/h x10', min: 0, max: 40, value: (d.fuelFlow ?? 0) / 10, major: 10, minor: 2, sweep: 260, arcs: [],
      });
      gauge(g, 610, 430, 42, {
        label: 'ZBIORNIK', unit: 'L x100', min: 0, max: 25, value: d.hopper / 100, major: 5, minor: 1, sweep: 240, arcs: [], needle: '#9fd8ff',
      });
      gauge(g, 770, 430, 42, {
        label: 'NAPIĘCIE', unit: 'V', min: 0, max: 32, value: d.engine === 'running' && d.rpm > 900 ? 28 : run ? 23.5 : 24.4, major: 8, minor: 2, sweep: 240,
        arcs: [[26.5, 29, '#3fb24a', 98]],
      });
      flowBox(g, 870, 400, d);
      tex.needsUpdate = true;
      gps(gg, 0, 0, 420, 300, d.gps);
      gpsTexture.needsUpdate = true;
      if (Math.abs(d.hopper - lastHopper) > 2) { lastHopper = d.hopper; drawSight(d.hopper); }
    },
  };
}

// Board outlines (the canvas outside them stays transparent: the meshes use
// an alpha test, so the boards have their real outline in the cockpit).
function boardPath(g, x0, x1, inner) {
  const top = 70, bot = 500, ch = 46;
  g.beginPath();
  if (inner === 'right') { g.moveTo(x0, top); g.lineTo(x1 - ch, top); g.lineTo(x1, top + ch); }
  else { g.moveTo(x0 + ch, top); g.lineTo(x1, top); g.lineTo(x1, top + ch); }
  g.lineTo(x1, bot); g.lineTo(x0, bot); g.lineTo(x0, inner === 'right' ? top : top + ch);
  g.closePath();
}

function drawBackground(g, reg) {
  g.clearRect(0, 0, M18_PANEL.W, M18_PANEL.H);
  const r = rng(181);
  for (const [x0, x1, side] of [[...M18_PANEL.left, 'left'], [...M18_PANEL.right, 'right']]) {
    // Black crackle-finish boards.
    boardPath(g, x0, x1, side === 'left' ? 'left' : 'right');
    const grd = g.createLinearGradient(0, 70, 0, 500);
    grd.addColorStop(0, '#1b1c1d'); grd.addColorStop(1, '#232425');
    g.fillStyle = grd; g.fill();
    g.save(); g.clip();
    for (let i = 0; i < 2600; i++) {
      const v = r() < 0.5 ? 255 : 0;
      g.fillStyle = `rgba(${v},${v},${v},${0.02 + r() * 0.035})`;
      g.fillRect(x0 + r() * (x1 - x0), 70 + r() * 430, 1 + r() * 3, 1 + r() * 3);
    }
    g.restore();
    g.strokeStyle = 'rgba(120,120,120,0.45)'; g.lineWidth = 3;
    boardPath(g, x0, x1, side === 'left' ? 'left' : 'right'); g.stroke();
    // Screws round the edge.
    g.fillStyle = '#6a6d70';
    for (let k = 0; k < 7; k++) {
      g.beginPath(); g.arc(x0 + 14 + (k * (x1 - x0 - 28)) / 6, 486, 4, 0, Math.PI * 2); g.fill();
    }
  }
  // Placards (white on black), as stencilled on the real boards.
  g.fillStyle = '#d8d8d2'; g.font = 'bold 11px Arial'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillText(reg, 60, 92);
  g.fillText('PZL M-18B', 395, 92);
  g.fillText('ASz-62IR-M18', 560, 92);
  g.font = '9px Arial';
  g.fillText('VNE 256 km/h · VFE 185 km/h', 170, 92);
  g.fillText('MAX 2200 obr/min · 1050 mm Hg · 5 min', 680, 92);
  g.fillText('ZAKAZ PALENIA', 878, 92);
  // Switch row labels on the left board (live toggles drawn per frame).
  const sw = ['AKU', 'PRĄDN.', 'ISKR.', 'ROZRUCH', 'POMPA', 'NAV', 'BŁYSK.', 'OPRYSK'];
  g.font = 'bold 8px Arial'; g.textAlign = 'center';
  sw.forEach((t, i) => g.fillText(t, 282 + i * 26 - 3 * 26 + 18, 466));
}

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
    const left = i < 4;
    const x = (left ? 26 : 548) + (i % 4) * 116, y = 18, w = 104, h = 30;
    g.fillStyle = '#0f1012';
    roundRect(g, x - 3, y - 3, w + 6, h + 6, 5); g.fill();
    const base = { '#ff3b2a': '#4a1712', '#ffb020': '#4d3a10', '#3dff7a': '#173d22' }[col];
    g.fillStyle = on ? col : base;
    roundRect(g, x, y, w, h, 3); g.fill();
    g.fillStyle = on ? '#111' : 'rgba(255,255,255,0.28)';
    g.font = 'bold 12px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, x + w / 2, y + h / 2 + 1);
  });
  // Switch toggles: battery, generator, magnetos, starter, fuel pump, nav, strobe, spray.
  const on = [true, d.engine === 'running', d.engine !== 'off', d.engine === 'cranking', d.engine !== 'off', true, d.engine !== 'off', d.spray];
  on.forEach((v, i) => {
    const x = 222 + i * 26, y = 486 - 34;
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

// Back wall of the hopper: yellowed translucent fibreglass with the litre
// scale stencilled in black (2,500 L at the top), seen between the boards.
function drawHopperWall(g) {
  const { W, H, cap } = M18_HOPPER;
  g.fillStyle = '#cbb27c';
  g.fillRect(0, 0, W, H);
  const r = rng(77);
  for (let i = 0; i < 5000; i++) {
    g.strokeStyle = `rgba(${110 + r() * 70},${90 + r() * 50},${50 + r() * 30},${0.18 + r() * 0.2})`;
    g.lineWidth = 1;
    const x = r() * W, y = r() * H, a = r() * Math.PI;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14); g.stroke();
  }
  // Moulding seams and the bonded frame.
  g.fillStyle = 'rgba(80,60,30,0.35)';
  g.fillRect(0, 0, W, 10); g.fillRect(0, H - 10, W, 10);
  g.fillRect(120, 0, 3, H);
  const top = 60, bot = 720;
  g.fillStyle = '#16110a';
  g.textAlign = 'left'; g.textBaseline = 'middle';
  for (let v = 0; v <= cap; v += 100) {
    const y = bot - (v / cap) * (bot - top);
    const major = v % 500 === 0;
    g.fillRect(140, y - 2.5, major ? 70 : 40, 5);
    if (v >= 500 && (v % 100 === 0)) {
      g.font = `bold ${major ? 46 : 34}px Arial`;
      g.fillText(String(v), 226, y + 1);
    }
  }
  g.font = 'bold 22px Arial';
  g.fillText('ZBIORNIK  2500 L', 140, 30);
}
