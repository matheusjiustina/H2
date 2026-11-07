// Piper PA-36 Pawnee Brave — PROVISIONAL instrument panel (Prompt 01).
// The real Brave 300 panel (its layout, gauges and switches) is the next
// phase; until then the cockpit shows a plain grey panel with the six
// round gauges a pilot needs to fly it — airspeed, altimeter, tachometer,
// manifold pressure, fuel and hopper quantity — drawn on one canvas and
// redrawn at 15 Hz only while the cockpit view is on (Aircraft._animate).
import { canvas, canvasTexture } from '../core/textures.js';

const W = 1024, H = 384;
const GAUGES = [
  { key: 'ias', label: 'AIRSPEED', unit: 'KNOTS', max: 160, step: 20, x: 150, y: 150 },
  { key: 'alt', label: 'ALTITUDE', unit: 'FT ×100', max: 10, step: 1, x: 390, y: 150 },
  { key: 'rpm', label: 'RPM', unit: '×100', max: 30, step: 5, x: 630, y: 150 },
  { key: 'mp', label: 'MAN PRESS', unit: 'IN HG', max: 35, step: 5, x: 870, y: 150 },
  { key: 'fuel', label: 'FUEL', unit: 'LITRES', max: 1, step: 0.25, x: 270, y: 300, small: true },
  { key: 'hop', label: 'HOPPER', unit: 'LITRES', max: 1, step: 0.25, x: 750, y: 300, small: true },
];

function face(g, G) {
  const r = G.small ? 62 : 92;
  g.fillStyle = '#0d0e10';
  g.beginPath(); g.arc(G.x, G.y, r + 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#16181b';
  g.beginPath(); g.arc(G.x, G.y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#e8e8e2'; g.fillStyle = '#e8e8e2';
  g.font = `bold ${G.small ? 13 : 16}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = Math.round(G.max / G.step);
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI * 0.75 + (i / n) * Math.PI * 1.5 - Math.PI / 2;
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(G.x + Math.cos(a) * (r - 4), G.y + Math.sin(a) * (r - 4)); g.lineTo(G.x + Math.cos(a) * (r - 16), G.y + Math.sin(a) * (r - 16)); g.stroke();
    const v = G.small ? ['E', '¼', '½', '¾', 'F'][i] : String(Math.round(i * G.step));
    g.fillText(v, G.x + Math.cos(a) * (r - 32), G.y + Math.sin(a) * (r - 32));
  }
  g.font = `${G.small ? 11 : 13}px Arial`;
  g.fillStyle = '#c9c9c0';
  g.fillText(G.label, G.x, G.y + r * 0.42);
  g.fillText(G.unit, G.x, G.y + r * 0.62);
}

function needle(g, G, f) {
  const r = G.small ? 62 : 92;
  const a = -Math.PI * 0.75 + Math.max(0, Math.min(1.02, f)) * Math.PI * 1.5 - Math.PI / 2;
  g.strokeStyle = '#f4f4ee'; g.lineWidth = G.small ? 4 : 5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(G.x - Math.cos(a) * 12, G.y - Math.sin(a) * 12); g.lineTo(G.x + Math.cos(a) * (r - 18), G.y + Math.sin(a) * (r - 18)); g.stroke();
  g.fillStyle = '#222'; g.beginPath(); g.arc(G.x, G.y, 8, 0, Math.PI * 2); g.fill();
}

export function createPA36Panel({ reg = 'PR-PWB' } = {}) {
  const base = canvas(W, H), c = canvas(W, H);
  const b = base.getContext('2d'), g = c.getContext('2d');
  b.fillStyle = '#5a5f63'; b.fillRect(0, 0, W, H); // grey panel
  for (let i = 0; i < 900; i++) { b.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; b.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  for (const G of GAUGES) face(b, G);
  b.fillStyle = '#d9d9d2'; b.font = 'bold 15px Arial'; b.textAlign = 'center';
  b.fillText(`PIPER PA-36-300 BRAVE · ${reg}`, W / 2, 26);
  b.fillStyle = '#f2c21b'; b.font = 'bold 13px Arial';
  b.fillText('PROVISIONAL PANEL', W / 2, H - 14);
  const tex = canvasTexture(c, { aniso: 4 });
  let key = '';
  const draw = (d) => {
    const k = [d.ias, d.altFt, d.rpm, d.mp, d.fuel, d.hopper].map((v) => Math.round((v ?? 0) * 2)).join(',');
    if (k === key) return;
    key = k;
    g.drawImage(base, 0, 0);
    const vals = { ias: (d.ias ?? 0) / 160, alt: ((d.altFt ?? 0) % 1000) / 1000, rpm: (d.rpm ?? 0) / 3000, mp: (d.mp ?? 0) / 35, fuel: (d.fuel ?? 0) / (d.fuelCap || 1), hop: (d.hopper ?? 0) / (d.hopperCap || 1) };
    for (const G of GAUGES) needle(g, G, vals[G.key]);
    // Altimeter thousands drum.
    g.fillStyle = '#e8e8e2'; g.font = 'bold 18px Arial'; g.textAlign = 'center';
    g.fillText(`${Math.floor((d.altFt ?? 0) / 1000)}`, 390, 112);
    tex.needsUpdate = true;
  };
  draw({});
  return { texture: tex, draw, page: 0 };
}
