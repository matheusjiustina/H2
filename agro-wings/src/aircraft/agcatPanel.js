// Grumman G-164A Super Ag-Cat — PROVISIONAL flat instrument board (Prompt
// 01). One black board under the windshield with the classic round dials,
// all driven by Aircraft.instruments() (the flight model's own values):
// airspeed (mph), altimeter, tachometer (R-985, 2,300 rpm red line),
// manifold pressure, oil pressure and temperature, cylinder-head
// temperature, fuel (US gal of the 46-gal tank), hopper; the game's GPS on
// its own small texture. Replaced by the real Ag-Cat cockpit (Prompt 02).
import { canvas, canvasTexture } from '../core/textures.js';
import { gauge, altimeter, gps, roundRect } from './panel.js';

export const AGCAT_PANEL = { W: 1024, H: 384 };
const MPH = 1.15078, GAL = 1 / 3.785;

export function createAgCatPanel({ reg = 'PR-GAC' } = {}) {
  const L = AGCAT_PANEL;
  const c = canvas(L.W, L.H);
  const tex = canvasTexture(c, { aniso: 8 });
  const g = c.getContext('2d');
  const bg = canvas(L.W, L.H);
  const drawBg = (r) => {
    const b = bg.getContext('2d');
    b.fillStyle = '#16171a'; b.fillRect(0, 0, L.W, L.H);
    b.strokeStyle = '#2c2e33'; b.lineWidth = 6; roundRect(b, 4, 4, L.W - 8, L.H - 8, 18); b.stroke();
    b.fillStyle = '#8b8f96'; b.font = 'bold 18px Arial'; b.textAlign = 'right'; b.fillText(r, L.W - 30, L.H - 22);
  };
  drawBg(reg);
  const gc = canvas(420, 300);
  const gpsTexture = canvasTexture(gc, { aniso: 4 });
  const gg = gc.getContext('2d');
  return {
    canvas: c, texture: tex, gpsTexture,
    setReg(r) { drawBg(r); },
    draw(d) {
      g.drawImage(bg, 0, 0);
      const mph = d.ias * MPH;
      gauge(g, 110, 112, 78, { label: 'AIRSPEED', unit: 'MPH', min: 40, max: 180, value: mph, major: 20, minor: 5, arcs: [[(d.vs1 ?? 58) * MPH, 125, '#3fb24a', 98], [125, (d.vne ?? 128) * MPH, '#f0c020', 98], [(d.vne ?? 128) * MPH, 180, '#d0362a', 98]] });
      altimeter(g, 290, 112, 78, d.altFt);
      gauge(g, 470, 112, 78, { label: 'RPM', unit: 'x100', min: 0, max: 30, value: d.rpm / 100, major: 5, minor: 1, arcs: [[14, 22, '#3fb24a', 98], [23, 30, '#d0362a', 98]] });
      gauge(g, 650, 112, 78, { label: 'MANIFOLD', unit: 'IN HG', min: 10, max: 40, value: d.mp ?? 29.6, major: 5, minor: 1, arcs: [[20, 36, '#3fb24a', 98], [36, 40, '#d0362a', 98]] });
      gauge(g, 110, 290, 58, { label: 'OIL PRESS', unit: 'PSI', min: 0, max: 120, value: d.oilP ?? 0, major: 20, minor: 10, arcs: [[60, 90, '#3fb24a', 98]] });
      gauge(g, 260, 290, 58, { label: 'OIL TEMP', unit: '°C', min: 0, max: 120, value: d.oilT ?? 30, major: 20, minor: 10, arcs: [[40, 85, '#3fb24a', 98], [85, 120, '#d0362a', 98]] });
      gauge(g, 410, 290, 58, { label: 'CYL HEAD', unit: '°C', min: 0, max: 300, value: d.cht ?? 30, major: 50, minor: 25, arcs: [[120, 230, '#3fb24a', 98], [232, 300, '#d0362a', 98]] });
      gauge(g, 560, 290, 58, { label: 'FUEL', unit: 'US GAL', min: 0, max: 50, value: d.fuel * GAL, major: 10, minor: 5, sweep: 240, arcs: [[0, 5, '#d0362a', 98]] });
      gauge(g, 710, 290, 58, { label: 'HOPPER', unit: 'L x100', min: 0, max: 12, value: d.hopper / 100, major: 2, minor: 1, sweep: 240, arcs: [], needle: '#9fd8ff' });
      // Lamps: stall warning, low fuel, spray on, brake.
      [['STALL', d.stall > 0.5, '#ff3b2a'], ['FUEL', d.fuel < d.fuelCap * 0.15, '#ffb020'], ['SPRAY', d.spray, '#3dff7a'], ['BRAKE', d.brake, '#ffb020']].forEach(([t, on, col], i) => {
        const x = 840, y = 70 + i * 60;
        g.fillStyle = on ? col : '#2a2b2e'; g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#c9ccd1'; g.font = 'bold 16px Arial'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(t, x + 24, y);
      });
      tex.needsUpdate = true;
      gps(gg, 0, 0, 420, 300, d.gps);
      gpsTexture.needsUpdate = true;
    },
  };
}
