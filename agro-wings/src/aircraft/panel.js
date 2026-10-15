// Instrument panel drawn on a canvas texture from live simulation values.
// Layout after a real Ipanema panel: light grey aluminium, warning lamps on
// top, a 3x2 block of round gauges, compass, switch rows, and a big guidance
// GPS in a black bezel on the right. A second small texture is the hopper
// sight window under the panel (level graduations + live liquid level).
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp, rng } from '../core/math.js';

export function createPanel() {
  const c = canvas(1024, 512);
  const tex = canvasTexture(c, { aniso: 8 });
  const g = c.getContext('2d');
  const bg = canvas(1024, 512);
  drawBackground(bg.getContext('2d'));
  const sc = canvas(256, 448);
  const sightTex = canvasTexture(sc, { aniso: 4 });
  const sg = sc.getContext('2d');
  const sightBg = canvas(256, 448);
  drawSightBackground(sightBg.getContext('2d'));
  let lastHopper = -1;
  const drawSight = (hopper, cap) => {
    sg.drawImage(sightBg, 0, 0);
    const top = 24, bot = 424;
    const y = bot - (clamp(hopper / cap, 0, 1)) * (bot - top);
    if (hopper > 0.5) {
      const lg = sg.createLinearGradient(0, y, 0, bot);
      lg.addColorStop(0, 'rgba(95,150,120,0.55)');
      lg.addColorStop(1, 'rgba(45,90,70,0.7)');
      sg.fillStyle = lg;
      sg.fillRect(14, y, 228, bot - y);
      sg.fillStyle = 'rgba(220,240,225,0.75)';
      sg.fillRect(14, y - 1, 228, 3);
    }
    // Window frame shadow.
    sg.strokeStyle = 'rgba(0,0,0,0.6)'; sg.lineWidth = 14;
    sg.strokeRect(7, 7, 242, 434);
    sightTex.needsUpdate = true;
  };
  drawSight(0, 900);
  return {
    canvas: c, texture: tex, sightTexture: sightTex,
    draw(d) {
      g.drawImage(bg, 0, 0);
      lamps(g, d);
      gauge(g, 95, 178, 54, {
        label: 'OIL', unit: '°C   PSI', min: 0, max: 100, value: d.engine === 'running' ? 35 + 45 * clamp(d.rpm / 2700, 0, 1) : 0, major: 25, minor: 12.5, sweep: 240,
        arcs: [[30, 85, '#3fb24a', 98], [85, 100, '#d0362a', 98]],
      });
      gauge(g, 255, 178, 82, {
        label: 'AIRSPEED', unit: 'KNOTS', min: 0, max: 160, value: d.ias, major: 20, minor: 5,
        arcs: [[d.vs0, d.vfe, '#e8e8e8', 90], [d.vs1, 125, '#3fb24a', 98], [125, 145, '#f0c020', 98], [145, 160, '#d0362a', 98]],
      });
      gauge(g, 445, 178, 82, {
        label: 'RPM', unit: 'x100', min: 0, max: 30, value: d.rpm / 100, major: 5, minor: 1,
        arcs: [[7, 27, '#3fb24a', 98], [27, 30, '#d0362a', 98]],
      });
      compass(g, 598, 92, d.hdg);
      gauge(g, 598, 212, 48, {
        label: 'HOPPER', unit: 'x100 L', min: 0, max: d.hopperCap / 100, value: d.hopper / 100, major: 3, minor: 1, sweep: 240,
        arcs: [], needle: '#9fd8ff',
      });
      gauge(g, 95, 348, 54, {
        label: 'FUEL', unit: 'LITERS', min: 0, max: d.fuelCap, value: d.fuel, major: 65, minor: 32.5, sweep: 240,
        arcs: [[0, d.fuelCap * 0.15, '#d0362a', 98]],
      });
      altimeter(g, 255, 348, 82, d.altFt);
      gauge(g, 445, 348, 82, {
        label: 'VERTICAL SPEED', unit: 'x100 FT/MIN', min: -20, max: 20, value: d.vsFpm / 100, major: 5, minor: 1, sweep: 320,
        arcs: [],
      });
      flapInd(g, 598, 312, d.flaps);
      switches(g, d);
      gps(g, 672, 22, 330, 300, d.gps);
      digital(g, 690, 344, d);
      tex.needsUpdate = true;
      if (Math.abs(d.hopper - lastHopper) > 0.8) { lastHopper = d.hopper; drawSight(d.hopper, d.hopperCap); }
    },
  };
}

function drawBackground(g) {
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#9aa3ab');
  grd.addColorStop(0.08, '#aab3bb');
  grd.addColorStop(1, '#a1aab2');
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 512);
  // Shadow under the padded glareshield.
  const sh = g.createLinearGradient(0, 0, 0, 34);
  sh.addColorStop(0, 'rgba(0,0,0,0.55)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh;
  g.fillRect(0, 0, 1024, 34);
  // Brushed texture + scuffs.
  const r = rng(77);
  for (let i = 0; i < 2600; i++) {
    const v = r() < 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${0.02 + r() * 0.03})`;
    g.fillRect(r() * 1024, r() * 512, 1 + r() * 30, 1);
  }
  // Sub-panel seam for the switch strip and the GPS cut-out.
  g.strokeStyle = 'rgba(40,46,52,0.55)'; g.lineWidth = 2;
  g.strokeRect(30, 430, 620, 74);
  // Screws round the edges.
  g.fillStyle = '#3b4148';
  const screw = (x, y) => { g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill(); };
  for (const x of [16, 180, 345, 512, 680, 850, 1008]) { screw(x, 30); screw(x, 498); }
  for (const y of [140, 260, 380]) { screw(16, y); screw(1008, y); }
  // Placards.
  g.fillStyle = '#1f252b';
  g.font = 'bold 11px Arial';
  g.textAlign = 'left';
  g.fillText('PR-AGW', 36, 30);
  g.font = '9px Arial';
  g.fillText('NÃO DECOLAR COM O HOPPER ABERTO', 36, 424);
  g.fillText('MANOBRAS ACROBÁTICAS PROIBIDAS', 360, 424);
}

function bezel(g, x, y, r) {
  // Four mounting screws, black case, glass reflection.
  g.fillStyle = '#2b3036';
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    g.beginPath(); g.arc(x + Math.cos(a) * (r + 12), y + Math.sin(a) * (r + 12), 3.5, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#16191c';
  g.beginPath(); g.arc(x, y, r + 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#070808';
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}

function glassGlint(g, x, y, r) {
  const gl = g.createLinearGradient(x - r, y - r, x + r * 0.2, y + r * 0.2);
  gl.addColorStop(0, 'rgba(255,255,255,0.12)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gl;
  g.beginPath(); g.arc(x, y, r, Math.PI * 0.95, Math.PI * 1.75); g.lineTo(x, y); g.fill();
}

function gauge(g, x, y, r, o) {
  const sweep = ((o.sweep ?? 300) * Math.PI) / 180;
  const a0 = Math.PI / 2 + (Math.PI * 2 - sweep) / 2;
  const ang = (v) => a0 + ((clamp(v, o.min, o.max) - o.min) / (o.max - o.min)) * sweep;
  bezel(g, x, y, r);
  for (const [v0, v1, col, rr] of o.arcs) {
    if (v1 <= v0) continue;
    g.strokeStyle = col; g.lineWidth = Math.max(4, r * 0.07);
    g.beginPath(); g.arc(x, y, (rr / 108) * r, ang(v0), ang(v1)); g.stroke();
  }
  g.strokeStyle = '#e9e9e4'; g.fillStyle = '#e9e9e4';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${Math.round(r * 0.18)}px Arial`;
  for (let v = o.min; v <= o.max + 1e-6; v += o.minor) {
    const a = ang(v);
    const major = Math.abs(((v - o.min) / o.major) - Math.round((v - o.min) / o.major)) < 1e-6;
    const r0 = r * (major ? 0.78 : 0.85);
    g.lineWidth = major ? 3 : 1.5;
    g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r * 0.93, y + Math.sin(a) * r * 0.93); g.stroke();
    if (major) g.fillText(String(Math.round(Math.abs(v))), x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
  }
  g.font = `${Math.round(r * 0.12)}px Arial`;
  g.fillStyle = '#b9bcb6';
  g.fillText(o.label, x, y + r * 0.3);
  g.fillText(o.unit, x, y + r * 0.46);
  needle(g, x, y, r * 0.82, ang(o.value), o.needle || '#f2f2ec');
  glassGlint(g, x, y, r);
}

function needle(g, x, y, len, a, col) {
  g.save();
  g.translate(x, y); g.rotate(a);
  g.fillStyle = col;
  g.beginPath(); g.moveTo(-len * 0.15, -4); g.lineTo(len, 0); g.lineTo(-len * 0.15, 4); g.closePath(); g.fill();
  g.restore();
  g.fillStyle = '#2a2d30';
  g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
}

function altimeter(g, x, y, r, ft) {
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
  g.fillText('ALT', x, y - r * 0.3);
  g.fillText('FEET', x, y + r * 0.44);
  g.fillStyle = '#000'; g.fillRect(x - 25, y + 6, 50, 20);
  g.fillStyle = '#fff'; g.font = 'bold 16px Arial';
  g.fillText(String(Math.max(0, Math.round(ft))).padStart(4, '0'), x, y + 17);
  const a100 = -Math.PI / 2 + ((ft % 1000) / 1000) * Math.PI * 2;
  const a1000 = -Math.PI / 2 + ((ft % 10000) / 10000) * Math.PI * 2;
  needle(g, x, y, r * 0.5, a1000, '#d9d9d2');
  needle(g, x, y, r * 0.84, a100, '#f2f2ec');
  glassGlint(g, x, y, r);
}

// Vertical-card magnetic compass in a small housing.
function compass(g, x, y, hdg) {
  g.fillStyle = '#16191c';
  g.fillRect(x - 52, y - 36, 104, 72);
  g.fillStyle = '#050606';
  g.fillRect(x - 44, y - 22, 88, 40);
  g.save();
  g.beginPath(); g.rect(x - 44, y - 22, 88, 40); g.clip();
  g.fillStyle = '#e9e9e4'; g.strokeStyle = '#e9e9e4';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 14px Arial';
  const pxPerDeg = 2.2;
  for (let d = -40; d <= 40; d += 5) {
    const h = Math.round(hdg / 5) * 5 + d;
    const px = x + (h - hdg) * pxPerDeg;
    const hh = ((h % 360) + 360) % 360;
    g.lineWidth = hh % 30 === 0 ? 2 : 1;
    g.beginPath(); g.moveTo(px, y - 22); g.lineTo(px, y - (hh % 10 === 0 ? 12 : 16)); g.stroke();
    if (hh % 30 === 0) {
      const lbl = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[hh] ?? String(hh / 10);
      g.fillText(lbl, px, y + 4);
    }
  }
  g.restore();
  g.strokeStyle = '#ff7a1a'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x, y - 24); g.lineTo(x, y + 20); g.stroke();
  // Correction card.
  g.fillStyle = '#e8e6df';
  g.fillRect(x - 32, y + 40, 64, 30);
  g.fillStyle = '#333';
  g.font = '8px Arial';
  g.fillText('N 0  E 90', x, y + 50);
  g.fillText('S 180 W 270', x, y + 62);
}

function flapInd(g, x, y, flaps) {
  g.fillStyle = '#16191c';
  g.fillRect(x - 40, y - 34, 80, 78);
  g.fillStyle = '#e9e9e4';
  g.font = 'bold 11px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('FLAPS', x, y - 22);
  g.strokeStyle = '#555'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x - 24, y - 8); g.lineTo(x - 24, y + 34); g.stroke();
  g.font = '10px Arial'; g.textAlign = 'left';
  ['0', '10', '20', '30'].forEach((t, i) => g.fillText(t, x - 12, y - 6 + i * 13));
  g.fillStyle = '#ffb000';
  g.fillRect(x - 31, y - 9 + flaps * 39, 14, 5);
}

function lamps(g, d) {
  const items = [
    ['STALL', d.stall > 0.5, '#ff3b2a'],
    ['ENG', d.engine !== 'running', d.engine === 'cranking' ? '#ffb020' : '#ff3b2a'],
    ['FUEL', d.fuel < d.fuelCap * 0.15, '#ffb020'],
    ['BRAKE', d.brake, '#ffb020'],
    ['SPRAY', d.spray, '#3dff7a'],
  ];
  items.forEach(([t, on, col], i) => {
    const x = 210 + i * 44, y = 52;
    g.fillStyle = '#1a1d20';
    g.beginPath(); g.arc(x, y, 15, 0, Math.PI * 2); g.fill();
    const base = { '#ff3b2a': '#7a1d16', '#ffb020': '#7a5310', '#3dff7a': '#1d5a2c' }[col];
    g.fillStyle = on ? col : base;
    g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.fill();
    if (on) {
      const halo = g.createRadialGradient(x, y, 4, x, y, 22);
      halo.addColorStop(0, col + 'aa');
      halo.addColorStop(1, col + '00');
      g.fillStyle = halo;
      g.beginPath(); g.arc(x, y, 22, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.arc(x - 4, y - 4, 3.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1f252b'; g.font = 'bold 9px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, x, y + 24);
  });
}

function switches(g, d) {
  const items = [
    ['MAGNETO', d.engine !== 'off'], ['BATT', true], ['ALTERN', d.engine === 'running'], ['B. COMB', true],
    ['NAV', true], ['STROBE', true], ['FARÓIS', false], ['BOMBA', true], ['VÁLVULA', d.spray], ['GPS', true],
  ];
  items.forEach(([t, on], i) => {
    const x = 62 + i * 59, y = 478;
    g.fillStyle = '#1f252b'; g.font = 'bold 9px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, x, 446);
    g.fillStyle = '#d7dadc';
    g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7d848b';
    g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#e8eaec'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + (on ? -17 : 17)); g.stroke();
    g.lineCap = 'butt';
    if (t === 'VÁLVULA') { g.fillStyle = '#c8261b'; g.fillRect(x - 13, y - 26, 26, 3); }
  });
}

function digital(g, x, y, d) {
  g.fillStyle = '#16191c';
  g.fillRect(x - 6, y - 6, 300, 144);
  g.fillStyle = '#071008';
  g.fillRect(x, y, 288, 132);
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = 'bold 20px monospace';
  g.fillStyle = '#9ff0a4';
  g.fillText(`HDG ${String(Math.round(d.hdg) % 360).padStart(3, '0')}°`, x + 12, y + 28);
  g.fillText(`HGT ${d.hgt < 99 ? d.hgt.toFixed(1) : '--'} m`, x + 150, y + 28);
  g.fillText(`VS  ${(d.vsFpm >= 0 ? '+' : '') + Math.round(d.vsFpm / 10) * 10}`, x + 12, y + 62);
  g.fillStyle = d.spray ? '#7fd0ff' : '#4a6a7a';
  g.fillText(`FLOW ${d.spray ? (d.flow * 60).toFixed(0) : '0'} L/min`, x + 12, y + 96);
  g.font = '12px monospace';
  g.fillStyle = '#6f8a74';
  g.fillText('FLOW MONITOR', x + 12, y + 122);
}

function gps(g, x, y, w, h, s) {
  // Rugged bezel with a USB port and brand, screen inset.
  g.fillStyle = '#0d0f11';
  roundRect(g, x, y, w, h, 14); g.fill();
  g.strokeStyle = '#2a2f35'; g.lineWidth = 3;
  roundRect(g, x + 3, y + 3, w - 6, h - 6, 12); g.stroke();
  g.fillStyle = '#c9ced3';
  g.font = 'bold 12px Arial'; g.textAlign = 'right'; g.textBaseline = 'middle';
  g.fillText('SKYGUIDE', x + w - 20, y + 18);
  g.fillStyle = '#3a4047'; g.fillRect(x + 20, y + 12, 18, 10);
  const sx = x + 18, sy = y + 32, sw = w - 36, sh = h - 74;
  g.fillStyle = '#0a0f0b';
  g.fillRect(sx, sy, sw, sh);
  g.save();
  g.beginPath(); g.rect(sx, sy, sw, sh); g.clip();
  if (s && s.draw) s.draw(g, sx, sy, sw, sh);
  g.restore();
  g.fillStyle = '#e9ecef';
  g.font = 'bold 22px Arial'; g.textAlign = 'center';
  g.fillText('AGRONAV', x + w / 2 - 12, y + h - 22);
  g.beginPath();
  g.moveTo(x + w / 2 + 58, y + h - 30); g.lineTo(x + w / 2 + 78, y + h - 30); g.lineTo(x + w / 2 + 68, y + h - 16); g.closePath(); g.fill();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

function drawSightBackground(g) {
  // Translucent fibreglass hopper wall seen through the sight window, with
  // stencilled level marks (litres).
  g.fillStyle = '#cdb98e';
  g.fillRect(0, 0, 256, 448);
  const r = rng(19);
  for (let i = 0; i < 1600; i++) {
    g.strokeStyle = `rgba(${120 + r() * 60},${100 + r() * 50},${60 + r() * 30},0.25)`;
    g.lineWidth = 1;
    const x = r() * 256, y = r() * 448, a = r() * Math.PI;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10); g.stroke();
  }
  g.fillStyle = '#17130d';
  g.textAlign = 'left'; g.textBaseline = 'middle';
  const top = 24, bot = 424;
  for (let v = 0; v <= 900; v += 50) {
    const y = bot - (v / 900) * (bot - top);
    const major = v % 100 === 0;
    g.fillRect(18, y - 2, major ? 44 : 24, 4);
    if (major && v > 0) {
      g.font = 'bold 34px Arial';
      g.fillText(`-${v}`, 72, y + 1);
    }
  }
}
