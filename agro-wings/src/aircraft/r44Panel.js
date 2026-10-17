// R44 console (canvas textures, live values from the helicopter simulation).
// Upper pod: caution/warning strip; airspeed, attitude, altimeter and the
// dual tachometer (engine "E" and rotor "R" needles on one dial) on the top
// row; manifold pressure, heading, vertical speed and the slip/turn
// indicator below; engine gauges (oil pressure and temperature, CHT,
// ammeter), fuel and the ag-tank level, and the flow monitor on the right.
// Lower pedestal: guidance GPS, COM/transponder strips, switch row and
// placards. Layout after the R44's pedestal console; the exact instrument
// arrangement varies between real aircraft and is not claimed here.
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp, rng } from '../core/math.js';
import { gauge, bezel, needle, altimeter, gps, roundRect, glassGlint } from './panel.js';
import { attitude, heading, turn } from './atPanel.js';

export const R44_PANEL = { W: 1024, H: 512, w: 0.48, h: 0.24, W2: 512, H2: 1024, w2: 0.19, h2: 0.38 };
const F = (c) => c * 1.8 + 32; // °C -> °F (R44 engine gauges read °F)

export function createR44Panel() {
  const c = canvas(R44_PANEL.W, R44_PANEL.H);
  const tex = canvasTexture(c, { aniso: 8 });
  const g = c.getContext('2d');
  const bg = canvas(R44_PANEL.W, R44_PANEL.H);
  drawPodBackground(bg.getContext('2d'));
  const c2 = canvas(R44_PANEL.W2, R44_PANEL.H2);
  const tex2 = canvasTexture(c2, { aniso: 8 });
  const g2 = c2.getContext('2d');
  const bg2 = canvas(R44_PANEL.W2, R44_PANEL.H2);
  drawPedestalBackground(bg2.getContext('2d'));
  let n = 0;
  return {
    canvas: c, texture: tex, texture2: tex2,
    draw(d) {
      g.drawImage(bg, 0, 0);
      annunciators(g, d);
      const vne = d.vne ?? 130;
      gauge(g, 100, 178, 70, {
        label: 'AIRSPEED', unit: 'KNOTS', min: 0, max: 150, value: d.ias, major: 20, minor: 5,
        arcs: [[20, vne - 20, '#3fb24a', 98], [vne - 20, vne, '#f0c020', 98], [vne, vne + 1.5, '#d0362a', 104]],
      });
      attitude(g, 262, 178, 70, d.pitch, d.bank, d.slip);
      altimeter(g, 424, 178, 70, d.altFt);
      dualTach(g, 600, 178, 82, d.enginePct, d.rotorPct);
      gauge(g, 100, 392, 62, {
        label: 'MANIFOLD', unit: 'IN HG', min: 10, max: 30, value: d.map, major: 5, minor: 1,
        arcs: [[10, 21.6, '#3fb24a', 98], [21.6, 25.1, '#f0c020', 98], [25.1, 25.4, '#d0362a', 104]],
      });
      heading(g, 262, 392, 62, d.hdg);
      gauge(g, 424, 392, 62, {
        label: 'VERTICAL SPEED', unit: 'x100 FT/MIN', min: -20, max: 20, value: d.vsFpm / 100, major: 5, minor: 1, sweep: 320, arcs: [],
      });
      turn(g, 600, 392, 62, d.yawRate, d.slip);
      // Engine gauges (°F as on the R44), ammeter, fuel and ag tank.
      const sm = (x, y, o) => gauge(g, x, y, 40, { sweep: 240, ...o });
      sm(748, 118, { label: 'OIL', unit: 'PSI', min: 0, max: 100, value: d.oilP, major: 25, minor: 12.5, arcs: [[0, 25, '#d0362a', 98], [25, 55, '#f0c020', 98], [55, 95, '#3fb24a', 98]] });
      sm(846, 118, { label: 'OIL', unit: '°F', min: 50, max: 250, value: F(d.oilT), major: 50, minor: 25, arcs: [[75, 245, '#3fb24a', 98], [245, 250, '#d0362a', 98]] });
      sm(944, 118, { label: 'CHT', unit: '°F', min: 100, max: 550, value: F(d.cht), major: 100, minor: 50, arcs: [[200, 500, '#3fb24a', 98], [500, 550, '#d0362a', 98]] });
      sm(748, 226, { label: 'AMPS', unit: '', min: -60, max: 60, value: d.amps, major: 30, minor: 15, arcs: [] });
      sm(846, 226, { label: 'FUEL', unit: 'L x10', min: 0, max: Math.ceil(d.fuelCap / 10), value: d.fuel / 10, major: 4, minor: 2, arcs: [[0, (d.fuelCap * 0.1) / 10, '#d0362a', 98]] });
      sm(944, 226, { label: 'TANK', unit: 'L x10', min: 0, max: Math.ceil(d.hopperCap / 10), value: d.hopper / 10, major: 5, minor: 2.5, arcs: [], needle: '#9fd8ff' });
      flowMonitor(g, 708, 290, d);
      tex.needsUpdate = true;
      // Pedestal: the guidance screen every frame it is asked for, the rest is static-ish.
      if (n++ % 2 === 0) {
        g2.drawImage(bg2, 0, 0);
        gps(g2, 14, 14, 484, 420, d.gps);
        pedestalStrips(g2, d);
        tex2.needsUpdate = true;
      }
    },
  };
}

function drawPodBackground(g) {
  g.fillStyle = '#17191c';
  g.fillRect(0, 0, 1024, 512);
  const r = rng(91);
  for (let i = 0; i < 2600; i++) {
    const v = r() < 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${0.012 + r() * 0.02})`;
    g.fillRect(r() * 1024, r() * 512, 1 + r() * 2, 1 + r() * 2);
  }
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 2;
  roundRect(g, 6, 6, 1012, 500, 26); g.stroke();
  g.fillStyle = '#5b6066';
  for (const [x, y] of [[22, 70], [1002, 70], [22, 492], [1002, 492], [512, 492]]) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#9aa0a6';
  g.font = 'bold 12px Arial'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText('PR-AGH', 26, 492);
  g.font = '10px Arial';
  g.fillText('R44 RAVEN II · MAX GROSS 2500 LB · NO ACROBATIC MANEUVERS', 120, 492);
}

function drawPedestalBackground(g) {
  g.fillStyle = '#15171a';
  g.fillRect(0, 0, 512, 1024);
  const r = rng(17);
  for (let i = 0; i < 1600; i++) {
    const v = r() < 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${0.012 + r() * 0.02})`;
    g.fillRect(r() * 512, r() * 1024, 1 + r() * 2, 1 + r() * 2);
  }
  g.fillStyle = '#c8ccd0';
  g.font = '15px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('ROTOR BRAKE — APPLY ONLY AFTER ENGINE SHUTDOWN', 256, 948);
  g.fillText('LOW ROTOR RPM: LOWER COLLECTIVE', 256, 974);
  g.fillText('NO SMOKING', 256, 1000);
}

function annunciators(g, d) {
  const items = [
    ['CLUTCH', d.clutch, '#ffb020'],
    ['ALT', d.engine !== 'running' || d.amps < 0, '#ffb020'],
    ['OIL', d.oilP < 25, '#ff3b2a'],
    ['MR CHIP', false, '#ff3b2a'],
    ['TR CHIP', false, '#ff3b2a'],
    ['LOW FUEL', d.fuel < d.fuelCap * 0.1, '#ffb020'],
    ['LOW RPM', !!d.lowRotor, '#ff3b2a'],
    ['STARTER', d.engine === 'cranking', '#ff3b2a'],
    ['GOV OFF', d.engine === 'running' && !d.gov, '#ffb020'],
    ['ROTOR BRK', !!d.rotorBrake, '#ffb020'],
    ['SPRAY', d.spray, '#3dff7a'],
  ];
  items.forEach(([t, on, col], i) => {
    const x = 16 + i * 91.5, y = 22, w = 84, h = 32;
    g.fillStyle = '#0b0c0e';
    roundRect(g, x - 3, y - 3, w + 6, h + 6, 5); g.fill();
    const base = { '#ff3b2a': '#3c1410', '#ffb020': '#3d2f0d', '#3dff7a': '#14331c' }[col];
    g.fillStyle = on ? col : base;
    roundRect(g, x, y, w, h, 3); g.fill();
    g.fillStyle = on ? '#111' : 'rgba(255,255,255,0.25)';
    g.font = 'bold 12px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, x + w / 2, y + h / 2 + 1);
  });
}

// Dual tachometer: one dial in percent, rotor needle "R" and engine needle
// "E"; rotor arcs outside (green 90–108, red limits), engine arc inside
// (green 101–102). 100 % = 400 rotor rpm / 2665 engine rpm.
function dualTach(g, x, y, r, eng, rot) {
  bezel(g, x, y, r);
  const sweep = (300 * Math.PI) / 180, a0 = Math.PI / 2 + (Math.PI * 2 - sweep) / 2;
  const ang = (v) => a0 + (clamp(v, 0, 120) / 120) * sweep;
  const arc = (v0, v1, col, rr, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(x, y, rr, ang(v0), ang(v1)); g.stroke(); };
  arc(90, 108, '#3fb24a', r * 0.9, 6);
  arc(108, 109.5, '#d0362a', r * 0.9, 6);
  arc(88.5, 90, '#d0362a', r * 0.9, 6);
  arc(101, 102, '#3fb24a', r * 0.74, 7);
  arc(102, 103, '#d0362a', r * 0.74, 7);
  g.strokeStyle = '#e9e9e4'; g.fillStyle = '#e9e9e4';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${Math.round(r * 0.16)}px Arial`;
  for (let v = 0; v <= 120; v += 5) {
    const a = ang(v), major = v % 20 === 0;
    g.lineWidth = major ? 3 : 1.5;
    const r0 = r * (major ? 0.8 : 0.86);
    g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95); g.stroke();
    if (major) g.fillText(String(v), x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
  }
  g.font = `${Math.round(r * 0.11)}px Arial`;
  g.fillStyle = '#b9bcb6';
  g.fillText('ROTOR · ENGINE', x, y + r * 0.3);
  g.fillText('% RPM', x, y + r * 0.44);
  // Needles with their letters near the tips.
  const tip = (v, len, col, label) => {
    const a = ang(v);
    needle(g, x, y, len, a, col);
    g.fillStyle = '#111';
    g.beginPath(); g.arc(x + Math.cos(a) * len * 0.62, y + Math.sin(a) * len * 0.62, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = col; g.font = `bold ${Math.round(r * 0.12)}px Arial`;
    g.fillText(label, x + Math.cos(a) * len * 0.62, y + Math.sin(a) * len * 0.62 + 1);
  };
  tip(eng, r * 0.74, '#f2f2ec', 'E');
  tip(rot, r * 0.88, '#ffd34d', 'R');
  glassGlint(g, x, y, r);
}

function flowMonitor(g, x, y, d) {
  g.fillStyle = '#0d0f11';
  roundRect(g, x - 6, y - 6, 312, 196, 10); g.fill();
  g.fillStyle = '#071008';
  g.fillRect(x, y, 300, 184);
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = 'bold 24px monospace';
  g.fillStyle = d.spray ? '#7fd0ff' : '#4a6a7a';
  g.fillText(`FLOW ${d.spray ? (d.flow * 60).toFixed(0) : '0'} L/min`, x + 14, y + 36);
  g.fillStyle = '#9ff0a4';
  g.fillText(`HGT  ${d.hgt < 99 ? d.hgt.toFixed(1) : '--'} m`, x + 14, y + 74);
  g.fillText(`TANK ${Math.round(d.hopper)} L`, x + 14, y + 112);
  const rp = d.rotorPct ?? 0;
  g.fillStyle = d.lowRotor ? '#ff6655' : rp > 1 ? '#ffd34d' : '#6f8a74';
  g.fillText(`NR   ${rp.toFixed(0)} %`, x + 14, y + 150);
  g.font = 'bold 15px monospace';
  g.fillText(d.rotorState ?? '', x + 180, y + 150);
  g.font = '13px monospace';
  g.fillStyle = '#6f8a74';
  g.fillText('AG FLOW · ROTOR', x + 14, y + 176);
}

function pedestalStrips(g, d) {
  // COM / NAV radio and the transponder (static frequencies, live ALT mode).
  const strip = (y, h, lines) => {
    g.fillStyle = '#0b0c0e';
    roundRect(g, 18, y, 476, h, 8); g.fill();
    g.fillStyle = '#050605';
    g.fillRect(36, y + 12, 300, h - 24);
    g.font = 'bold 26px monospace'; g.textAlign = 'left'; g.textBaseline = 'middle';
    lines.forEach(([t, col], i) => { g.fillStyle = col; g.fillText(t, 46, y + 30 + i * 30); });
    g.fillStyle = '#2b2f34';
    for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(380 + k * 40, y + h / 2, 14, 0, Math.PI * 2); g.fill(); }
  };
  strip(452, 96, [['COM 122.850', '#ffb24a'], ['NAV 117.30', '#ffb24a']]);
  strip(560, 66, [[`XPDR 1200 ${d.engine === 'running' ? 'ALT' : 'SBY'}`, '#7ad07a']]);
  // Switch row (live where they mean something).
  const sw = [
    ['MASTER', true], ['ALT', d.engine === 'running'], ['CLUTCH', d.engine !== 'off' || d.rotorPct > 1], ['STROBE', d.engine !== 'off'],
    ['NAV', true], ['LDG LT', false], ['PUMP', d.engine === 'running'], ['VALVE', d.spray],
  ];
  sw.forEach(([t, on], i) => {
    const x = 40 + i * 61, y = 760;
    g.fillStyle = '#c8ccd0'; g.font = 'bold 13px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, x, 712);
    g.fillStyle = '#d7dadc';
    g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7d848b';
    g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#e8eaec'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + (on ? -24 : 24)); g.stroke();
    g.lineCap = 'butt';
    if (t === 'VALVE') { g.fillStyle = '#c8261b'; g.fillRect(x - 18, y - 36, 36, 4); }
  });
  // Carb heat and mixture knobs, hour meter.
  g.fillStyle = '#c8ccd0'; g.font = 'bold 13px Arial';
  g.fillText('CARB HEAT', 128, 838); g.fillText('MIXTURE', 384, 838);
  g.fillStyle = '#2b2f34'; g.beginPath(); g.arc(128, 880, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c8261b'; g.beginPath(); g.arc(384, 880, 22, 0, Math.PI * 2); g.fill();
}
