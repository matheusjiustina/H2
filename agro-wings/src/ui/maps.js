// Farm map rendering for the minimap and the full map (M).
import { FIELDS, ROADS, FORESTS, CREEK, RUNWAY, BASE, POWERLINE, HQ, GRAIN_POINTS, WORLD_HALF, FARM_SITES, SITES, WATER, pondRadius } from '../world/layout.js';
import { rawHeight } from '../world/terrainData.js';

const EXT = WORLD_HALF - 100; // half extent of the base map (m)
const CROP_COL = { soy: '#3f8f2c', corn: '#2f7224', cotton: '#5f8f4a', stubble: '#b79a5a', fallow: '#9a3a1c', pasture: '#6f9a3a' };


// Hillshade + a light elevation tint from the real height function (not an
// invented picture): lit slopes lighten, shaded slopes darken, the high ground
// of the rolling and hilly zones warms and the valleys cool. Flat land stays
// as drawn. `grid` samples across the whole map.
function reliefOverlay(size, grid = 256) {
  const N = grid + 1, step = (EXT * 2) / grid;
  const h = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) h[j * N + i] = rawHeight(-EXT + i * step, -EXT + j * step);
  const c = document.createElement('canvas');
  c.width = c.height = grid;
  const g = c.getContext('2d');
  const img = g.createImageData(grid, grid);
  const L = [-0.5, 0.78, -0.5], ll = Math.hypot(...L);
  const base = L[1] / ll;
  for (let j = 0; j < grid; j++) {
    for (let i = 0; i < grid; i++) {
      const a = h[j * N + i], b = h[j * N + i + 1], d = h[(j + 1) * N + i], e = h[(j + 1) * N + i + 1];
      const gx = ((b - a) + (e - d)) / (2 * step), gz = ((d - a) + (e - b)) / (2 * step);
      const nl = Math.hypot(gx, 1, gz);
      const shade = ((-gx * L[0] + L[1] - gz * L[2]) / (nl * ll) - base) * 7; // ± about 0 on flat ground
      const avg = (a + b + d + e) / 4;
      let r = 0, gg = 0, bl = 0, al = 0;
      if (shade > 0) { r = gg = bl = 255; al = Math.min(0.5, shade * 0.6); } else { al = Math.min(0.55, -shade * 0.7); }
      if (avg > 10) { const t = Math.min(0.32, (avg - 10) / 70); r = r * (1 - t) + 255 * t; gg = gg * (1 - t) + 214 * t; bl = bl * (1 - t) + 140 * t; al = Math.max(al, t); }
      else if (avg < -10) { const t = Math.min(0.3, (-avg - 10) / 60); r = r * (1 - t) + 30 * t; gg = gg * (1 - t) + 70 * t; bl = bl * (1 - t) + 95 * t; al = Math.max(al, t); }
      const k = (j * grid + i) * 4;
      img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = bl; img.data[k + 3] = al * 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Same overlay for one rectangle (the GPS page of a job): returns a canvas and
// the elevation range of the real terrain under it.
export function reliefPatch(x0, z0, x1, z1, px = 160) {
  const W = px, Hh = Math.max(16, Math.round((px * (z1 - z0)) / (x1 - x0)));
  const sx = (x1 - x0) / W, sz = (z1 - z0) / Hh;
  const hs = new Float32Array((W + 1) * (Hh + 1));
  let mn = 1e9, mx = -1e9;
  for (let j = 0; j <= Hh; j++) for (let i = 0; i <= W; i++) { const v = rawHeight(x0 + i * sx, z0 + j * sz); hs[j * (W + 1) + i] = v; mn = Math.min(mn, v); mx = Math.max(mx, v); }
  const c = document.createElement('canvas');
  c.width = W; c.height = Hh;
  const g = c.getContext('2d');
  const img = g.createImageData(W, Hh);
  const L = [-0.5, 0.78, -0.5], ll = Math.hypot(...L), base = L[1] / ll;
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    const a = hs[j * (W + 1) + i], b = hs[j * (W + 1) + i + 1], d = hs[(j + 1) * (W + 1) + i], e = hs[(j + 1) * (W + 1) + i + 1];
    const gx = ((b - a) + (e - d)) / (2 * sx), gz = ((d - a) + (e - b)) / (2 * sz);
    const shade = ((-gx * L[0] + L[1] - gz * L[2]) / (Math.hypot(gx, 1, gz) * ll) - base) * 9;
    // Elevation tint inside the shown range: low = dark green, high = olive/tan.
    const t = mx > mn ? ((a + b + d + e) / 4 - mn) / (mx - mn) : 0.5;
    const r = 28 + 90 * t, gg = 62 + 70 * t, bl = 36 + 40 * t;
    const k = (j * W + i) * 4, m = 1 + Math.max(-0.5, Math.min(0.6, shade));
    img.data[k] = Math.min(255, r * m); img.data[k + 1] = Math.min(255, gg * m); img.data[k + 2] = Math.min(255, bl * m); img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { canvas: c, min: mn, max: mx };
}

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
  for (const st of WATER.streams) {
    g.lineWidth = 11;
    g.beginPath();
    st.points.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
    g.stroke();
  }
  g.fillStyle = '#3b6fa0';
  for (const p of WATER.ponds) {
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.2) { const r = pondRadius(p, a); g.lineTo(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r); }
    g.fill();
  }
  g.fillStyle = '#d9c6a6';
  g.fillRect(RUNWAY.x0, RUNWAY.z - RUNWAY.width, RUNWAY.x1 - RUNWAY.x0, RUNWAY.width * 2);
  const a = BASE.apron;
  g.fillStyle = '#b06a44';
  g.fillRect(a.x0, a.z0, a.x1 - a.x0, a.z1 - a.z0);
  g.fillStyle = '#d8d8d0';
  const h = BASE.hangar;
  g.fillRect(h.x - h.w / 2, h.z - h.d / 2, h.w, h.d);
  g.fillRect(HQ.house.x - 9, HQ.house.z - 5, 18, 10);
  // Secondary farms: strip, apron, shed.
  for (const st of FARM_SITES) {
    const r = st.runway;
    g.fillStyle = r.surface === 2 ? '#8fb46a' : r.surface === 3 ? '#b8b0a2' : r.surface === 4 ? '#a8603a' : r.surface === 5 ? '#d8c08e' : '#c98a5c';
    g.fillRect(r.x0, r.z - r.width, r.x1 - r.x0, r.width * 2);
    g.fillStyle = '#b06a44';
    g.fillRect(st.apron.x0, st.apron.z0, st.apron.x1 - st.apron.x0, st.apron.z1 - st.apron.z0);
    g.fillStyle = '#d8d8d0';
    g.fillRect(st.hangar.x - 10, st.hangar.z - 7, 20, 14);
  }
  for (const si of HQ.silos) { g.beginPath(); g.arc(si.x, si.z, 6, 0, Math.PI * 2); g.fill(); }
  for (const gp of GRAIN_POINTS) for (let i = 0; i < gp.n; i++) { g.beginPath(); g.arc(gp.x + (gp.axis === 'x' ? i * 28 : 0), gp.z + (gp.axis === 'z' ? i * 28 : 0), 6, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#ff8a2a';
  g.setLineDash([16, 12]);
  g.lineWidth = 6;
  g.beginPath();
  POWERLINE.points.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
  g.stroke();
  g.setLineDash([]);
  // Relief shading over everything but the labels (flat land is unchanged).
  g.imageSmoothingEnabled = true;
  g.drawImage(reliefOverlay(size, 320), -EXT, -EXT, EXT * 2, EXT * 2);
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
  // The chosen course: a dashed line from the aircraft to the marker, the
  // distance beside it (kept upright on a track-up map).
  const wp = game.waypoint;
  if (wp) {
    const a = game.aircraft.fm.pos;
    g.strokeStyle = '#38e1ff';
    g.lineWidth = 2.5 / scale;
    g.setLineDash([12 / scale, 7 / scale]);
    g.beginPath(); g.moveTo(a.x, a.z); g.lineTo(wp.x, wp.z); g.stroke();
    g.setLineDash([]);
    g.save();
    g.translate(wp.x, wp.z);
    g.rotate(-rot);
    g.scale(1 / scale, 1 / scale);
    const m = Math.max(6, (view.labelPx ?? 13) * 0.55);
    g.fillStyle = '#38e1ff'; g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -m * 1.5); g.lineTo(m, 0); g.lineTo(0, m * 1.5); g.lineTo(-m, 0); g.closePath(); g.fill(); g.stroke();
    const d = Math.hypot(wp.x - a.x, wp.z - a.z);
    g.font = `bold ${view.labelPx ?? 13}px Arial`; g.textAlign = 'center';
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.7)'; g.fillStyle = '#38e1ff';
    const txt = d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;
    g.strokeText(txt, 0, m * 1.5 + (view.labelPx ?? 13) + 2); g.fillText(txt, 0, m * 1.5 + (view.labelPx ?? 13) + 2);
    g.restore();
  }
  // Service pad marker (where the crew is now).
  const pad = game.site?.pad ?? BASE.pad;
  g.strokeStyle = '#7fd0ff';
  g.lineWidth = 2 / scale;
  g.beginPath();
  g.arc(pad.x, pad.z, BASE.pad.radius, 0, Math.PI * 2);
  g.stroke();
  // Farm markers (strip pin in the farm's colour, a ring round the farm of
  // the accepted request) and names, kept upright on a track-up map.
  if (view.labels !== false) {
    const lp = view.labelPx ?? 13;
    for (const st of SITES) {
      const r = st.runway;
      const mx = (r.x0 + r.x1) / 2;
      g.save();
      g.translate(mx, r.z);
      g.rotate(-rot);
      g.scale(1 / scale, 1 / scale);
      const col = st.main ? '#ffffff' : st.farm.color;
      const pin = Math.max(4, lp * 0.42);
      if (game.job?.c.farm === st.id) {
        g.strokeStyle = '#ffe14a'; g.lineWidth = 2.5;
        g.beginPath(); g.arc(0, 0, pin * 2.1, 0, Math.PI * 2); g.stroke();
      }
      g.fillStyle = col; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(0, 0, pin, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.75)';
      g.fillRect(-pin * 0.62, -pin * 0.16, pin * 1.24, pin * 0.32); // the strip
      g.font = `bold ${lp}px Arial`;
      g.textAlign = 'center';
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.fillStyle = col;
      const txt = st.main ? 'Boa Esperança' : st.farm.short;
      g.strokeText(txt, 0, -pin - 5); g.fillText(txt, 0, -pin - 5);
      g.restore();
    }
  }
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

// World point under a pointer event on a north-up map canvas.
export function mapPoint(canvas, view, e) {
  const r = canvas.getBoundingClientRect();
  return { x: view.cx + ((e.clientX - r.left) / r.width - 0.5) * 2 * view.range, z: view.cz + ((e.clientY - r.top) / r.height - 0.5) * 2 * view.range };
}

// Mouse-wheel zoom (about the cursor, out to the whole 12 km map) and
// drag-to-pan for a north-up map canvas drawn with drawMap. `view` ({ cx,
// cz, range }) is changed in place and marked `manual` once touched;
// onClick fires for a click that did not drag.
export function mapControls(canvas, view, { min = 250, max = WORLD_HALF, onChange, onClick } = {}) {
  const lim = (v, a, b) => Math.min(b, Math.max(a, v));
  const keep = () => {
    view.range = lim(view.range, min, max);
    view.cx = lim(view.cx, -WORLD_HALF, WORLD_HALF);
    view.cz = lim(view.cz, -WORLD_HALF, WORLD_HALF);
    view.manual = true;
    onChange?.();
  };
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const r = canvas.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width - 0.5, v = (e.clientY - r.top) / r.height - 0.5;
    const wx = view.cx + u * 2 * view.range, wz = view.cz + v * 2 * view.range;
    // One wheel notch (~100 px) is ~16 %; trackpads give smaller steps.
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    view.range = lim(view.range * Math.exp(lim(dy, -400, 400) * 0.0015), min, max);
    view.cx = wx - u * 2 * view.range; view.cz = wz - v * 2 * view.range;
    keep();
  }, { passive: false });
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz, moved: false };
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = canvas.getBoundingClientRect(), dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    view.cx = drag.cx - (dx / r.width) * 2 * view.range;
    view.cz = drag.cz - (dy / r.height) * 2 * view.range;
    keep();
  });
  canvas.addEventListener('pointerup', (e) => {
    const d = drag;
    drag = null;
    if (d && !d.moved) onClick?.(e);
  });
  canvas.addEventListener('pointercancel', () => { drag = null; });
}
