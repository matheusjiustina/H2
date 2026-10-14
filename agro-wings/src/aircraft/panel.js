// Instrument panel drawn on a canvas texture from live simulation values.
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp } from '../core/math.js';

export function createPanel() {
  const c = canvas(1024, 512);
  const tex = canvasTexture(c, { aniso: 8 });
  const g = c.getContext('2d');
  // Static background (painted once).
  const bg = canvas(1024, 512);
  drawBackground(bg.getContext('2d'));
  return {
    canvas: c, texture: tex,
    draw(d) {
      g.drawImage(bg, 0, 0);
      gauge(g, 130, 150, 108, {
        label: 'AIRSPEED', unit: 'KT', min: 0, max: 160, value: d.ias, major: 20, minor: 5,
        arcs: [[d.vs0, d.vfe, '#e8e8e8', 92], [d.vs1, 125, '#3fb24a', 98], [125, 145, '#f0c020', 98], [145, 160, '#d0362a', 98]],
      });
      altimeter(g, 370, 150, 108, d.altFt);
      gauge(g, 610, 150, 108, {
        label: 'RPM', unit: 'x100', min: 0, max: 30, value: d.rpm / 100, major: 5, minor: 1,
        arcs: [[7, 27, '#3fb24a', 98], [27, 30, '#d0362a', 98]],
      });
      gauge(g, 120, 395, 82, {
        label: 'FUEL', unit: 'L', min: 0, max: d.fuelCap, value: d.fuel, major: 50, minor: 25, sweep: 240,
        arcs: [[0, d.fuelCap * 0.15, '#d0362a', 74]],
      });
      gauge(g, 330, 395, 82, {
        label: 'HOPPER', unit: 'L', min: 0, max: d.hopperCap, value: d.hopper, major: 150, minor: 50, sweep: 240,
        arcs: [], needle: '#7fd0ff',
      });
      annunciators(g, 450, 330, d);
      gps(g, 760, 28, 236, 260, d.gps);
      digital(g, 760, 320, d);
      tex.needsUpdate = true;
    },
  };
}

function drawBackground(g) {
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#2b3036');
  grd.addColorStop(1, '#1f2327');
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 512);
  // Panel screws + subtle scratches
  g.fillStyle = '#121416';
  for (const [x, y] of [[14, 14], [1010, 14], [14, 498], [1010, 498], [512, 14], [512, 498]]) {
    g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < 60; i++) {
    g.beginPath();
    const x = Math.random() * 1024, y = Math.random() * 512;
    g.moveTo(x, y); g.lineTo(x + Math.random() * 40, y + Math.random() * 6); g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = 'bold 15px Arial';
  g.fillText('PR-AGW', 470, 495);
}

function bezel(g, x, y, r) {
  g.fillStyle = '#0d0f10';
  g.beginPath(); g.arc(x, y, r + 8, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#060707';
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}

function gauge(g, x, y, r, o) {
  const sweep = ((o.sweep ?? 300) * Math.PI) / 180;
  const a0 = Math.PI / 2 + (Math.PI * 2 - sweep) / 2;
  const ang = (v) => a0 + ((clamp(v, o.min, o.max) - o.min) / (o.max - o.min)) * sweep;
  bezel(g, x, y, r);
  for (const [v0, v1, col, rr] of o.arcs) {
    if (v1 <= v0) continue;
    g.strokeStyle = col; g.lineWidth = 7;
    g.beginPath(); g.arc(x, y, (rr / 108) * r, ang(v0), ang(v1)); g.stroke();
  }
  g.strokeStyle = '#e9e9e4'; g.fillStyle = '#e9e9e4';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${Math.round(r * 0.17)}px Arial`;
  for (let v = o.min; v <= o.max + 1e-6; v += o.minor) {
    const a = ang(v);
    const major = Math.abs((v - o.min) % o.major) < 1e-6;
    const r0 = r * (major ? 0.78 : 0.85);
    g.lineWidth = major ? 3 : 1.5;
    g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r * 0.93, y + Math.sin(a) * r * 0.93); g.stroke();
    if (major) g.fillText(String(Math.round(v)), x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62);
  }
  g.font = `${Math.round(r * 0.13)}px Arial`;
  g.fillStyle = '#b9bcb6';
  g.fillText(o.label, x, y + r * 0.3);
  g.fillText(o.unit, x, y + r * 0.47);
  needle(g, x, y, r * 0.82, ang(o.value), o.needle || '#f2f2ec');
}

function needle(g, x, y, len, a, col) {
  g.save();
  g.translate(x, y); g.rotate(a);
  g.fillStyle = col;
  g.beginPath(); g.moveTo(-len * 0.15, -4); g.lineTo(len, 0); g.lineTo(-len * 0.15, 4); g.closePath(); g.fill();
  g.restore();
  g.fillStyle = '#2a2d30';
  g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill();
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
  g.fillText('FT', x, y + r * 0.42);
  // Thousands window
  g.fillStyle = '#000'; g.fillRect(x - 26, y + 8, 52, 22);
  g.fillStyle = '#fff'; g.font = 'bold 18px Arial';
  g.fillText(String(Math.max(0, Math.round(ft))).padStart(4, '0'), x, y + 20);
  const a100 = -Math.PI / 2 + ((ft % 1000) / 1000) * Math.PI * 2;
  const a1000 = -Math.PI / 2 + ((ft % 10000) / 10000) * Math.PI * 2;
  needle(g, x, y, r * 0.5, a1000, '#d9d9d2');
  needle(g, x, y, r * 0.84, a100, '#f2f2ec');
}

function annunciators(g, x, y, d) {
  const items = [
    ['STALL', d.stall > 0.5, '#e8402e'],
    ['LOW FUEL', d.fuel < d.fuelCap * 0.15, '#f0b020'],
    ['SPRAY', d.spray, '#3fd06a'],
    ['BRAKE', d.brake, '#f0b020'],
    ['ENGINE', d.engine !== 'running', d.engine === 'cranking' ? '#f0b020' : '#e8402e'],
    ['HOPPER', d.hopper <= 0.5 && d.hopperCap > 0, '#7fd0ff'],
  ];
  items.forEach(([t, on, col], i) => {
    const cx = x + (i % 2) * 140, cy = y + Math.floor(i / 2) * 50;
    g.fillStyle = on ? col : '#1a1c1e';
    g.fillRect(cx, cy, 128, 38);
    g.strokeStyle = '#000'; g.lineWidth = 2; g.strokeRect(cx, cy, 128, 38);
    g.fillStyle = on ? '#101010' : '#4a4d50';
    g.font = 'bold 18px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, cx + 64, cy + 20);
  });
  // Flap position
  g.fillStyle = '#b9bcb6'; g.font = '14px Arial';
  g.fillText(`FLAPS ${Math.round(d.flaps * 30)}°`, x + 134, y + 168);
}

function digital(g, x, y, d) {
  g.fillStyle = '#050606';
  g.fillRect(x, y, 236, 150);
  g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeRect(x, y, 236, 150);
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = 'bold 22px monospace';
  g.fillStyle = '#9ff0a4';
  g.fillText(`HDG ${String(Math.round(d.hdg) % 360).padStart(3, '0')}°`, x + 12, y + 32);
  g.fillText(`HGT ${d.hgt < 99 ? d.hgt.toFixed(1) : '--'} m`, x + 12, y + 62);
  g.fillText(`VS  ${(d.vsFpm >= 0 ? '+' : '') + Math.round(d.vsFpm / 10) * 10}`, x + 12, y + 92);
  g.fillStyle = d.spray ? '#7fd0ff' : '#4a6a7a';
  g.fillText(`FLOW ${d.spray ? (d.flow * 60).toFixed(0) : '0'} L/m`, x + 12, y + 122);
  g.font = '14px monospace';
  g.fillStyle = '#6f8a74';
  g.fillText('AG-NAV', x + 160, y + 142);
}

function gps(g, x, y, w, h, s) {
  g.fillStyle = '#0a0f0b';
  g.fillRect(x, y, w, h);
  g.strokeStyle = '#000'; g.lineWidth = 4; g.strokeRect(x, y, w, h);
  g.save();
  g.beginPath(); g.rect(x + 2, y + 2, w - 4, h - 4); g.clip();
  if (s && s.draw) s.draw(g, x, y, w, h);
  else {
    g.fillStyle = '#4c6b52'; g.font = 'bold 18px monospace'; g.textAlign = 'center';
    g.fillText('NO JOB', x + w / 2, y + h / 2);
  }
  g.restore();
  g.fillStyle = '#6f8a74'; g.font = '13px monospace'; g.textAlign = 'left';
  g.fillText('SWATH GUIDE', x + 8, y + h + 16);
}
