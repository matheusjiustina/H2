// AT-502B instrument panel (canvas texture, live values): grey panel with
// the flight instruments on the left (airspeed, attitude, altimeter, heading,
// vertical speed), the PT6A engine stack on the right (torque, ITT, gas
// generator Ng, prop Np, fuel flow, oil), fuel / hopper / flaps below, the
// annunciator strip on top, the guidance GPS and the flow monitor. A second
// texture is the hopper sight gauge on the forward bulkhead.
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp, rng } from '../core/math.js';
import { gauge, bezel, needle, altimeter, flapInd, gps, roundRect, glassGlint, drawSightBackground } from './panel.js';

export const AT_PANEL = { W: 1024, H: 512, w: 1.08, h: 0.54 };

export function createTurbinePanel() {
  const c = canvas(AT_PANEL.W, AT_PANEL.H);
  const tex = canvasTexture(c, { aniso: 8 });
  const g = c.getContext('2d');
  const bg = canvas(AT_PANEL.W, AT_PANEL.H);
  drawBackground(bg.getContext('2d'));
  const sc = canvas(256, 448);
  const sightTex = canvasTexture(sc, { aniso: 4 });
  const sg = sc.getContext('2d');
  const sightBg = canvas(256, 448);
  drawSightBackground(sightBg.getContext('2d'), 1900, 100);
  let lastHopper = -1;
  const drawSight = (hopper, cap) => {
    sg.drawImage(sightBg, 0, 0);
    const top = 24, bot = 424;
    const y = bot - clamp(hopper / 1900, 0, cap / 1900) * (bot - top);
    if (hopper > 0.5) {
      const lg = sg.createLinearGradient(0, y, 0, bot);
      lg.addColorStop(0, 'rgba(95,150,120,0.55)');
      lg.addColorStop(1, 'rgba(45,90,70,0.7)');
      sg.fillStyle = lg;
      sg.fillRect(14, y, 228, bot - y);
      sg.fillStyle = 'rgba(220,240,225,0.75)';
      sg.fillRect(14, y - 1, 228, 3);
    }
    sg.strokeStyle = 'rgba(0,0,0,0.6)'; sg.lineWidth = 14;
    sg.strokeRect(7, 7, 242, 434);
    sightTex.needsUpdate = true;
  };
  drawSight(0, 1893);
  return {
    canvas: c, texture: tex, sightTexture: sightTex,
    draw(d) {
      g.drawImage(bg, 0, 0);
      annunciators(g, d);
      // Flight instruments.
      gauge(g, 92, 158, 64, {
        label: 'AIRSPEED', unit: 'KNOTS', min: 0, max: 200, value: d.ias, major: 20, minor: 5,
        arcs: [[d.vs0, d.vfe, '#e8e8e8', 90], [d.vs1, 140, '#3fb24a', 98], [140, d.vne, '#f0c020', 98], [d.vne, 200, '#d0362a', 98]],
      });
      attitude(g, 236, 158, 64, d.pitch, d.bank, d.slip);
      altimeter(g, 380, 158, 64, d.altFt);
      heading(g, 236, 308, 56, d.hdg);
      gauge(g, 380, 308, 56, {
        label: 'VERTICAL SPEED', unit: 'x100 FT/MIN', min: -20, max: 20, value: d.vsFpm / 100, major: 5, minor: 1, sweep: 320, arcs: [],
      });
      turn(g, 92, 308, 56, d.yawRate, d.slip);
      // PT6A engine stack.
      const run = d.engine !== 'off' || d.ng > 1;
      gauge(g, 520, 158, 54, {
        label: 'TORQUE', unit: 'FT-LB x100', min: 0, max: 22, value: d.torque / 100, major: 4, minor: 1,
        arcs: [[0, 17.9, '#3fb24a', 98], [17.9, 22, '#d0362a', 98]],
      });
      gauge(g, 646, 158, 54, {
        label: 'ITT', unit: '°C x100', min: 0, max: 11, value: d.itt / 100, major: 2, minor: 0.5,
        arcs: [[4, 6.95, '#3fb24a', 98], [6.95, 10.9, '#f0c020', 98], [10.9, 11, '#d0362a', 98]],
      });
      gauge(g, 520, 308, 54, {
        label: 'Ng', unit: '% RPM', min: 0, max: 110, value: d.ng, major: 20, minor: 5,
        arcs: [[52, 101.5, '#3fb24a', 98], [101.5, 110, '#d0362a', 98]],
      });
      gauge(g, 646, 308, 54, {
        label: 'PROP', unit: 'RPM x100', min: 0, max: 26, value: d.rpm / 100, major: 4, minor: 1,
        arcs: [[16, 22, '#3fb24a', 98], [22, 26, '#d0362a', 98]],
      });
      // Fuel, oil, hopper, flaps.
      gauge(g, 72, 428, 40, {
        label: 'FUEL', unit: 'L x100', min: 0, max: Math.ceil(d.fuelCap / 100), value: d.fuel / 100, major: 2, minor: 1, sweep: 240,
        arcs: [[0, (d.fuelCap * 0.15) / 100, '#d0362a', 98]],
      });
      gauge(g, 172, 428, 40, {
        label: 'FUEL FLOW', unit: 'L/H x10', min: 0, max: 30, value: d.fuelFlow / 10, major: 10, minor: 2, sweep: 240, arcs: [],
      });
      const oilP = run ? clamp(20 + d.ng * 0.85, 0, 120) : 0;
      gauge(g, 272, 428, 40, {
        label: 'OIL PSI', unit: '', min: 0, max: 140, value: oilP, major: 40, minor: 10, sweep: 240,
        arcs: [[85, 105, '#3fb24a', 98], [0, 40, '#d0362a', 98]],
      });
      gauge(g, 372, 428, 40, {
        label: 'HOPPER', unit: 'L x100', min: 0, max: 20, value: d.hopper / 100, major: 5, minor: 1, sweep: 240, arcs: [], needle: '#9fd8ff',
      });
      flapInd(g, 470, 432, d.flaps);
      gps(g, 712, 18, 296, 268, d.gps);
      flowMonitor(g, 728, 318, d);
      tex.needsUpdate = true;
      if (Math.abs(d.hopper - lastHopper) > 1.5) { lastHopper = d.hopper; drawSight(d.hopper, d.hopperCap); }
    },
  };
}

function drawBackground(g) {
  const W = AT_PANEL.W, H = AT_PANEL.H;
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#80888f');
  grd.addColorStop(0.08, '#8e979e');
  grd.addColorStop(1, '#868f96');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  const sh = g.createLinearGradient(0, 0, 0, 30);
  sh.addColorStop(0, 'rgba(0,0,0,0.6)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh;
  g.fillRect(0, 0, W, 30);
  const r = rng(91);
  for (let i = 0; i < 2600; i++) {
    const v = r() < 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${0.02 + r() * 0.03})`;
    g.fillRect(r() * W, r() * H, 1 + r() * 30, 1);
  }
  // Sub-panels: flight block, engine block, lower strip.
  g.strokeStyle = 'rgba(30,34,38,0.55)'; g.lineWidth = 2;
  g.strokeRect(14, 84, 438, 296);
  g.strokeRect(462, 84, 242, 296);
  g.strokeRect(14, 388, 530, 82);
  g.fillStyle = '#20262c';
  g.font = 'bold 10px Arial'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillText('PT6A-34AG', 470, 98);
  g.fillText('PR-AWT', 22, 98);
  g.font = '9px Arial';
  g.fillText('VNE 155 KIAS · MÁX. TORQUE 1790 FT-LB · ITT 695 °C', 22, 380);
  g.fillText('NÃO DECOLAR COM O HOPPER ABERTO', 712, 432);
  // Screws.
  g.fillStyle = '#353b42';
  const screw = (x, y) => { g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill(); };
  for (const x of [16, 190, 360, 530, 700, 870, 1008]) { screw(x, 22); screw(x, 500); }
  for (const y of [140, 260, 380]) { screw(8, y); screw(1016, y); }
  // Switch strip labels.
  const sw = ['BATT', 'GEN', 'IGN', 'START', 'B. COMB', 'NAV', 'STROBE', 'BEACON', 'VÁLVULA', 'GPS'];
  g.font = 'bold 9px Arial'; g.textAlign = 'center';
  sw.forEach((t, i) => g.fillText(t, 586 + i * 43, 456));
}

function annunciators(g, d) {
  const T = d.throttle ?? 0;
  const items = [
    ['STALL', d.stall > 0.5, '#ff3b2a'],
    ['CHIP', false, '#ff3b2a'],
    ['FUEL LOW', d.fuel < d.fuelCap * 0.15, '#ffb020'],
    ['START', d.engine === 'cranking', '#ffb020'],
    ['GEN', d.engine !== 'running', '#ffb020'],
    ['BETA', !!d.beta || (d.engine === 'running' && d.onGround && T < 0.04), '#3dff7a'],
    ['BRAKE', d.brake, '#ffb020'],
    ['SPRAY', d.spray, '#3dff7a'],
  ];
  items.forEach(([t, on, col], i) => {
    const x = 30 + i * 84, y = 34, w = 74, h = 30;
    g.fillStyle = '#121518';
    roundRect(g, x - 3, y - 3, w + 6, h + 6, 5); g.fill();
    const base = { '#ff3b2a': '#4a1712', '#ffb020': '#4d3a10', '#3dff7a': '#173d22' }[col];
    g.fillStyle = on ? col : base;
    roundRect(g, x, y, w, h, 3); g.fill();
    g.fillStyle = on ? '#111' : 'rgba(255,255,255,0.28)';
    g.font = 'bold 12px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, x + w / 2, y + h / 2 + 1);
  });
  // Switch toggles (live where they mean something).
  const on = [true, d.engine === 'running', d.engine !== 'off', d.engine === 'cranking', true, true, true, true, d.spray, true];
  on.forEach((v, i) => {
    const x = 586 + i * 43, y = 482;
    g.fillStyle = '#d7dadc';
    g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7d848b';
    g.beginPath(); g.arc(x, y, 5.5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#e8eaec'; g.lineWidth = 4.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + (v ? -15 : 15)); g.stroke();
    g.lineCap = 'butt';
  });
}

// Attitude indicator: sky/ground ball moved by pitch, rolled by bank, fixed
// aircraft symbol and bank scale.
function attitude(g, x, y, r, pitch, bank, slip) {
  bezel(g, x, y, r);
  g.save();
  g.beginPath(); g.arc(x, y, r - 2, 0, Math.PI * 2); g.clip();
  g.translate(x, y);
  g.rotate(-bank);
  const k = r * 1.6; // px per rad of pitch
  const py = clamp(pitch, -0.6, 0.6) * k;
  g.fillStyle = '#2f78c4';
  g.fillRect(-r * 2, -r * 3 + py, r * 4, r * 3);
  g.fillStyle = '#7a4f2a';
  g.fillRect(-r * 2, py, r * 4, r * 3);
  g.strokeStyle = '#f2f2ec'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(-r * 2, py); g.lineTo(r * 2, py); g.stroke();
  g.lineWidth = 1.5;
  g.fillStyle = '#f2f2ec'; g.font = `${Math.round(r * 0.14)}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const p of [-20, -10, 10, 20]) {
    const yy = py - (p * Math.PI / 180) * k;
    const w = r * (Math.abs(p) === 10 ? 0.28 : 0.42);
    g.beginPath(); g.moveTo(-w, yy); g.lineTo(w, yy); g.stroke();
    g.fillText(String(Math.abs(p)), w + r * 0.14, yy);
  }
  // Bank pointer on the rotating card.
  g.fillStyle = '#f2f2ec';
  g.beginPath(); g.moveTo(0, -r * 0.92); g.lineTo(-6, -r * 0.78); g.lineTo(6, -r * 0.78); g.closePath(); g.fill();
  g.restore();
  // Fixed bank scale.
  g.strokeStyle = '#f2f2ec'; g.lineWidth = 2;
  for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const ang = -Math.PI / 2 + (a * Math.PI) / 180, l = Math.abs(a) % 30 === 0 ? 0.14 : 0.08;
    g.beginPath(); g.moveTo(x + Math.cos(ang) * r * 0.98, y + Math.sin(ang) * r * 0.98); g.lineTo(x + Math.cos(ang) * r * (0.98 - l), y + Math.sin(ang) * r * (0.98 - l)); g.stroke();
  }
  // Aircraft symbol.
  g.strokeStyle = '#ffb000'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(x - r * 0.55, y); g.lineTo(x - r * 0.2, y); g.lineTo(x - r * 0.1, y + r * 0.1); g.stroke();
  g.beginPath(); g.moveTo(x + r * 0.55, y); g.lineTo(x + r * 0.2, y); g.lineTo(x + r * 0.1, y + r * 0.1); g.stroke();
  g.fillStyle = '#ffb000'; g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill();
  void slip;
  glassGlint(g, x, y, r);
}

// Directional gyro: rotating compass card under a fixed lubber line.
function heading(g, x, y, r, hdg) {
  bezel(g, x, y, r);
  g.save();
  g.translate(x, y);
  g.rotate((-hdg * Math.PI) / 180);
  g.strokeStyle = '#e9e9e4'; g.fillStyle = '#e9e9e4';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let d = 0; d < 360; d += 5) {
    const a = (d * Math.PI) / 180 - Math.PI / 2;
    const major = d % 30 === 0;
    g.lineWidth = d % 10 === 0 ? 2 : 1;
    const r0 = r * (d % 10 === 0 ? 0.78 : 0.85);
    g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r * 0.93, Math.sin(a) * r * 0.93); g.stroke();
    if (major) {
      g.save();
      g.translate(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
      g.rotate(a + Math.PI / 2);
      g.font = `bold ${Math.round(r * 0.2)}px Arial`;
      g.fillText({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] ?? String(d / 10), 0, 0);
      g.restore();
    }
  }
  g.restore();
  g.strokeStyle = '#ff7a1a'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(x, y - r * 0.95); g.lineTo(x, y - r * 0.7); g.stroke();
  g.strokeStyle = '#ffb000'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(x, y - r * 0.35); g.lineTo(x, y + r * 0.3); g.moveTo(x - r * 0.28, y - r * 0.05); g.lineTo(x + r * 0.28, y - r * 0.05); g.moveTo(x - r * 0.12, y + r * 0.26); g.lineTo(x + r * 0.12, y + r * 0.26); g.stroke();
  glassGlint(g, x, y, r);
}

// Turn coordinator: rate-of-turn aircraft symbol and the slip ball.
function turn(g, x, y, r, yawRate, slip) {
  bezel(g, x, y, r);
  g.strokeStyle = '#e9e9e4'; g.lineWidth = 3;
  for (const a of [-0.35, 0.35]) {
    const ang = a;
    g.beginPath(); g.moveTo(x - Math.cos(ang) * r * 0.9, y + Math.sin(ang) * r * 0.9); g.lineTo(x - Math.cos(ang) * r * 0.72, y + Math.sin(ang) * r * 0.72); g.stroke();
    g.beginPath(); g.moveTo(x + Math.cos(ang) * r * 0.9, y + Math.sin(ang) * r * 0.9); g.lineTo(x + Math.cos(ang) * r * 0.72, y + Math.sin(ang) * r * 0.72); g.stroke();
  }
  g.fillStyle = '#b9bcb6'; g.font = `${Math.round(r * 0.13)}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('TURN COORDINATOR', x, y - r * 0.5);
  g.fillText('2 MIN', x, y + r * 0.58);
  // Standard rate (3°/s) at 0.35 rad of symbol tilt.
  const tilt = clamp((yawRate / 0.0524) * 0.35, -0.7, 0.7);
  g.save(); g.translate(x, y - r * 0.05); g.rotate(tilt);
  g.strokeStyle = '#f2f2ec'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(-r * 0.62, 0); g.lineTo(r * 0.62, 0); g.stroke();
  g.fillStyle = '#f2f2ec'; g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(0, -4); g.lineTo(0, -r * 0.18); g.stroke();
  g.restore();
  // Inclinometer tube and ball.
  g.fillStyle = '#1d2226';
  roundRect(g, x - r * 0.45, y + r * 0.22, r * 0.9, r * 0.2, r * 0.1); g.fill();
  g.strokeStyle = '#555'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(x - r * 0.1, y + r * 0.22); g.lineTo(x - r * 0.1, y + r * 0.42); g.moveTo(x + r * 0.1, y + r * 0.22); g.lineTo(x + r * 0.1, y + r * 0.42); g.stroke();
  g.fillStyle = '#0b0b0b';
  g.beginPath(); g.arc(x + clamp(-slip * 3, -1, 1) * r * 0.32, y + r * 0.32, r * 0.085, 0, Math.PI * 2); g.fill();
  glassGlint(g, x, y, r);
}

function flowMonitor(g, x, y, d) {
  g.fillStyle = '#16191c';
  g.fillRect(x - 6, y - 6, 132, 92);
  g.fillStyle = '#071008';
  g.fillRect(x, y, 120, 80);
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = 'bold 15px monospace';
  g.fillStyle = d.spray ? '#7fd0ff' : '#4a6a7a';
  g.fillText(`${d.spray ? (d.flow * 60).toFixed(0) : '0'} L/m`, x + 8, y + 22);
  g.fillStyle = '#9ff0a4';
  g.fillText(`H ${d.hgt < 99 ? d.hgt.toFixed(1) : '--'}m`, x + 8, y + 44);
  g.fillText(`${Math.round(d.hopper)} L`, x + 8, y + 66);
  g.font = '9px monospace';
  g.fillStyle = '#6f8a74';
  g.fillText('FLOW', x + 84, y + 76);
  void needle;
}
