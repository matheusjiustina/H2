// Farm map rendering for the minimap and the full map (M).
import { FIELDS, ROADS, FORESTS, CREEK, RUNWAY, BASE, POWERLINE, HQ } from '../world/layout.js';

const EXT = 3200; // half extent of the base map (m)
const CROP_COL = { soy: '#3f8f2c', corn: '#2f7224', cotton: '#5f8f4a', stubble: '#b79a5a', fallow: '#9a3a1c', pasture: '#6f9a3a' };

export function buildBaseMap(size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const s = size / (EXT * 2);
  g.setTransform(s, 0, 0, s, EXT * s, EXT * s);
  g.fillStyle = '#4f6f2c';
  g.fillRect(-EXT, -EXT, EXT * 2, EXT * 2);
  for (const f of FORESTS) {
    g.fillStyle = f.kind === 'eucalyptus' ? '#2c4a22' : '#1f3a18';
    g.fillRect(f.x0, f.z0, f.x1 - f.x0, f.z1 - f.z0);
  }
  for (const f of FIELDS) {
    g.fillStyle = '#9a3a1c';
    g.fillRect(f.x0 - 7, f.z0 - 7, f.x1 - f.x0 + 14, f.z1 - f.z0 + 14);
  }
  for (const f of FIELDS) {
    g.fillStyle = CROP_COL[f.crop];
    g.fillRect(f.x0, f.z0, f.x1 - f.x0, f.z1 - f.z0);
  }
  g.strokeStyle = '#a8401f';
  g.lineCap = 'round';
  for (const r of ROADS) {
    g.lineWidth = r.w * 1.6;
    g.beginPath();
    r.pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
    g.stroke();
  }
  g.strokeStyle = '#3b6fa0';
  g.lineWidth = 14;
  g.beginPath();
  CREEK.points.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
  g.stroke();
  g.fillStyle = '#d9c6a6';
  g.fillRect(RUNWAY.x0, RUNWAY.z - RUNWAY.width, RUNWAY.x1 - RUNWAY.x0, RUNWAY.width * 2);
  const a = BASE.apron;
  g.fillStyle = '#b06a44';
  g.fillRect(a.x0, a.z0, a.x1 - a.x0, a.z1 - a.z0);
  g.fillStyle = '#d8d8d0';
  const h = BASE.hangar;
  g.fillRect(h.x - h.w / 2, h.z - h.d / 2, h.w, h.d);
  g.fillRect(HQ.house.x - 9, HQ.house.z - 5, 18, 10);
  for (const si of HQ.silos) { g.beginPath(); g.arc(si.x, si.z, 6, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#ff8a2a';
  g.setLineDash([16, 12]);
  g.lineWidth = 6;
  g.beginPath();
  POWERLINE.points.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
  g.stroke();
  g.setLineDash([]);
  return { canvas: c, ext: EXT };
}

// Draw a map view. view: {cx, cz, range (m half-width), rot (radians, track-up) }
export function drawMap(g, w, h, base, game, view) {
  const { cx, cz, range, rot = 0 } = view;
  const scale = w / (range * 2);
  g.save();
  g.fillStyle = '#3d5a24';
  g.fillRect(0, 0, w, h);
  g.translate(w / 2, h / 2);
  g.rotate(rot);
  g.scale(scale, scale);
  g.translate(-cx, -cz);
  g.imageSmoothingEnabled = true;
  g.drawImage(base.canvas, -base.ext, -base.ext, base.ext * 2, base.ext * 2);
  const job = game.job;
  if (job) {
    for (const cov of job.coverages) {
      const img = game.overlay.canvasFor(cov);
      const f = cov.f;
      g.globalAlpha = 0.9;
      g.imageSmoothingEnabled = false;
      g.drawImage(img, f.x0, f.z0, f.x1 - f.x0, f.z1 - f.z0);
      g.globalAlpha = 1;
      g.strokeStyle = '#ffe14a';
      g.lineWidth = 3 / scale;
      g.strokeRect(f.x0, f.z0, f.x1 - f.x0, f.z1 - f.z0);
    }
    const gd = game.guidance;
    if (gd.next) {
      const p = gd.next;
      g.strokeStyle = '#ffe14a';
      g.lineWidth = 3 / scale;
      g.setLineDash([10 / scale, 6 / scale]);
      g.beginPath();
      if (gd.axis === 'x') { g.moveTo(gd.l0 - 150, p.c); g.lineTo(gd.l1 + 150, p.c); }
      else { g.moveTo(p.c, gd.l0 - 150); g.lineTo(p.c, gd.l1 + 150); }
      g.stroke();
      g.setLineDash([]);
    }
  }
  // Service pad marker
  g.strokeStyle = '#7fd0ff';
  g.lineWidth = 2 / scale;
  g.beginPath();
  g.arc(BASE.pad.x, BASE.pad.z, BASE.pad.radius, 0, Math.PI * 2);
  g.stroke();
  // Aircraft
  const ac = game.aircraft;
  const p = ac.fm.pos;
  const yaw = ac.fm.heading();
  g.translate(p.x, p.z);
  g.rotate(-yaw + Math.PI);
  const k = Math.max(1.5, 9 / scale);
  g.fillStyle = '#ffd21a';
  g.strokeStyle = '#000';
  g.lineWidth = 0.6 * k / 3;
  g.beginPath();
  g.moveTo(0, -k * 1.4);
  g.lineTo(k * 1.2, k * 0.2);
  g.lineTo(k * 0.25, k * 0.25);
  g.lineTo(k * 0.35, k * 1.1);
  g.lineTo(-k * 0.35, k * 1.1);
  g.lineTo(-k * 0.25, k * 0.25);
  g.lineTo(-k * 1.2, k * 0.2);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}
