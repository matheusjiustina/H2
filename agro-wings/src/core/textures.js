// Procedural textures (no external assets): tileable noise, foliage cards,
// clouds, labels. Everything is generated once at startup.
import * as THREE from 'three';
import { rng } from './math.js';

// Tileable value noise on a period-P lattice.
function tileNoise(P, seed) {
  const r = rng(seed);
  const g = new Float32Array(P * P);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const x0 = ((ix % P) + P) % P, y0 = ((iy % P) + P) % P;
    const x1 = (x0 + 1) % P, y1 = (y0 + 1) % P;
    const a = g[y0 * P + x0], b = g[y0 * P + x1], c = g[y1 * P + x0], d = g[y1 * P + x1];
    return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
  };
}

// RGBA noise: four independent tileable fBm fields of increasing detail.
export function makeNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const chans = [
    { base: 4, oct: 5, seed: 11 },
    { base: 8, oct: 4, seed: 23 },
    { base: 16, oct: 3, seed: 37 },
    { base: 32, oct: 2, seed: 51 },
  ].map((c) => {
    const ns = [];
    for (let o = 0; o < c.oct; o++) ns.push({ f: tileNoise(c.base << o, c.seed + o * 7), p: c.base << o });
    return ns;
  });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      for (let c = 0; c < 4; c++) {
        let s = 0, amp = 1, norm = 0;
        for (const n of chans[c]) {
          s += n.f((x / size) * n.p, (y / size) * n.p) * amp;
          norm += amp;
          amp *= 0.5;
        }
        data[i + c] = Math.max(0, Math.min(255, Math.round(((s / norm - 0.5) * 1.6 + 0.5) * 255)));
      }
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function canvasTexture(c, { srgb = true, repeat = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

// Side-view crop strip (used on row "fins" and field edges). Width = 4 m of
// row, height = 1 crop height. Alpha-tested. Plants are drawn back to front
// with light from above: sunlit tops, shaded lower leaves, a few yellowing.
export function makeCropCard(kind, seed = 3) {
  const W = 512, H = 256;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const r = rng(seed);
  g.clearRect(0, 0, W, H);
  const leaf = (x, y, len, ang, wid, col) => {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(len * 0.5, -wid, len, 0);
    g.quadraticCurveTo(len * 0.5, wid, 0, 0);
    g.fill();
    g.restore();
  };
  const wrapX = (x) => ((x % W) + W) % W;
  if (kind === 'soy') {
    // Bushy plants every ~6 cm, trifoliate leaves on petioles.
    for (let i = 0; i < 40; i++) { // stems
      g.strokeStyle = hsl(70, 30, 26, 0.9);
      g.lineWidth = 2;
      const x = r() * W;
      g.beginPath(); g.moveTo(x, H); g.lineTo(x + (r() - 0.5) * 24, H * 0.35); g.stroke();
    }
    for (let i = 0; i < 520; i++) {
      const x = r() * W, yN = 0.1 + 0.9 * Math.pow(r(), 0.75), y = H * yN;
      const l = 9 + r() * 11;
      const yellow = yN > 0.75 && r() < 0.25;
      const light = 24 + (1 - yN) * 20 + r() * 8;
      const col = yellow ? hsl(52 + r() * 10, 45, 38 + r() * 8) : hsl(84 + r() * 16, 38 + r() * 12, light);
      const a = r() * Math.PI * 2;
      for (let k = 0; k < 3; k++) { // trifoliate
        const aa = a + (k - 1) * 0.9;
        leaf(wrapX(x), y, l, aa, l * 0.38, col);
      }
    }
    // Pods along the stems low down.
    for (let i = 0; i < 90; i++) {
      g.fillStyle = hsl(70, 25, 32 + r() * 10);
      g.beginPath(); g.ellipse(r() * W, H * (0.55 + r() * 0.4), 1.6, 5, r() - 0.5, 0, Math.PI * 2); g.fill();
    }
  } else if (kind === 'corn') {
    // Stalks with long arching blades, ears and tassels.
    const n = 22;
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * W + (r() - 0.5) * 10;
      g.strokeStyle = hsl(86, 30, 20 + r() * 6);
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(x, H); g.lineTo(x + (r() - 0.5) * 4, H * 0.08); g.stroke();
      for (let k = 0; k < 10; k++) {
        const y = H * (0.16 + k * 0.08) + r() * 6;
        const side = k % 2 ? 1 : -1;
        const dry = k > 7 && r() < 0.5;
        const light = 22 + (1 - y / H) * 22 + r() * 8;
        leaf(x, y, 50 + r() * 45, side > 0 ? -0.35 + r() * 0.55 : Math.PI + 0.35 - r() * 0.55, 4 + r() * 3,
          dry ? hsl(45, 35, 45) : hsl(78 + r() * 14, 34 + r() * 14, light));
      }
      g.strokeStyle = hsl(40, 32, 44);
      g.lineWidth = 1.4;
      for (let k = 0; k < 5; k++) {
        g.beginPath(); g.moveTo(x, H * 0.1); g.lineTo(x + (r() - 0.5) * 26, H * (0.0 + r() * 0.06)); g.stroke();
      }
      g.fillStyle = hsl(68, 30, 42);
      g.beginPath(); g.ellipse(x + 6, H * 0.52, 4, 15, 0.3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = hsl(30, 40, 40); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x + 8, H * 0.45); g.lineTo(x + 12, H * 0.41); g.stroke(); // silk
    }
  } else if (kind === 'cotton') {
    for (let i = 0; i < 30; i++) {
      g.strokeStyle = hsl(20, 30, 28, 0.9); g.lineWidth = 2.5;
      const x = r() * W;
      g.beginPath(); g.moveTo(x, H); g.lineTo(x + (r() - 0.5) * 30, H * 0.25); g.stroke();
    }
    for (let i = 0; i < 620; i++) {
      const x = r() * W, yN = 0.12 + 0.88 * Math.pow(r(), 0.8), y = H * yN;
      const l = 11 + r() * 13;
      const red = r() < 0.08;
      g.fillStyle = red ? hsl(10, 35, 35) : hsl(92 + r() * 18, 30 + r() * 12, 20 + (1 - yN) * 18 + r() * 8);
      g.beginPath();
      g.ellipse(x, y, l * 0.5, l * 0.45, r() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 170; i++) { // open bolls
      const x = r() * W, y = H * (0.15 + 0.65 * r());
      g.fillStyle = hsl(40, 15, 88 + r() * 8);
      g.beginPath(); g.arc(x, y, 3 + r() * 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = hsl(30, 25, 30);
      g.beginPath(); g.arc(x + 1, y + 3, 1.6, 0, Math.PI * 2); g.fill();
    }
  }
  const t = canvasTexture(c, { repeat: true });
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Top-view canopy texture: one tile covers 4 rows x 4 m. Rows run along U.
// Individual plants with a sunlit side and a shaded side, soil and straw
// (palhada, no-till) showing in the inter-row.
export function makeCanopyTop(kind, seed = 5) {
  const S = 512;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const r = rng(seed);
  g.fillStyle = '#3c2a1e';
  g.fillRect(0, 0, S, S);
  // Straw mulch in the inter-row.
  for (let i = 0; i < 2600; i++) {
    g.strokeStyle = hsl(36 + r() * 10, 26, 26 + r() * 14, 0.7);
    g.lineWidth = 1;
    const x = r() * S, y = r() * S, a = r() * Math.PI;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); g.stroke();
  }
  const rows = 4;
  const put = (x, y, fn) => {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const px = x + ox, py = y + oy;
      if (px < -60 || px > S + 60 || py < -60 || py > S + 60) continue;
      fn(px, py);
    }
  };
  for (let k = 0; k < rows; k++) {
    const yc = ((k + 0.5) / rows) * S;
    if (kind === 'corn') {
      // Long arching blades crossing the inter-row; dense.
      for (let i = 0; i < 520; i++) {
        const x = r() * S, y = yc + (r() - 0.5) * 18, a = (r() - 0.5) * 2.6 + (r() < 0.5 ? 0 : Math.PI);
        const L = 26 + r() * 40, l = 24 + r() * 22, col = hsl(78 + r() * 12, 34 + r() * 14, l);
        put(x, y, (px, py) => {
          g.save(); g.translate(px, py); g.rotate(a + Math.PI / 2);
          g.fillStyle = col;
          g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * 0.5, -3.2, L, 0); g.quadraticCurveTo(L * 0.5, 3.2, 0, 0); g.fill();
          g.restore();
        });
      }
      for (let i = 0; i < 70; i++) { // tassels
        g.fillStyle = hsl(42, 40, 60 + r() * 12);
        g.fillRect(r() * S, yc + (r() - 0.5) * 10, 2, 2);
      }
      continue;
    }
    const spread = kind === 'soy' ? 104 : 92;
    for (let i = 0; i < 560; i++) {
      const x = r() * S, y = yc + (r() - 0.5) * spread * (0.6 + r() * 0.4);
      const l = kind === 'cotton' ? 9 + r() * 10 : 8 + r() * 9;
      const hue = kind === 'cotton' ? 95 + r() * 14 : 86 + r() * 14;
      const sat = kind === 'cotton' ? 30 + r() * 12 : 40 + r() * 12;
      const L = 30 + r() * 16, a1 = r() * Math.PI, a2 = r() * Math.PI;
      put(x, y, (px, py) => {
        // shadow side then lit side
        g.fillStyle = hsl(hue, sat, L * 0.6);
        g.beginPath(); g.ellipse(px + 2, py + 2, l * 0.62, l * 0.48, a1, 0, Math.PI * 2); g.fill();
        g.fillStyle = hsl(hue, sat, L);
        g.beginPath(); g.ellipse(px - 1, py - 1, l * 0.5, l * 0.38, a2, 0, Math.PI * 2); g.fill();
      });
    }
    if (kind === 'cotton') {
      for (let i = 0; i < 110; i++) {
        g.fillStyle = hsl(40, 12, 90);
        g.beginPath(); g.arc(r() * S, yc + (r() - 0.5) * 30, 2 + r() * 2.2, 0, Math.PI * 2); g.fill();
      }
    }
  }
  return canvasTexture(c, { repeat: true });
}

// Soft cumulus puff (alpha) for cloud billboards.
export function makeCloudTexture() {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const r = rng(77);
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * S * 0.28;
    const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d * 0.8;
    const rad = S * (0.08 + r() * 0.14);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  const t = canvasTexture(c, { srgb: false });
  return t;
}

// Simple text label texture (signs, registration, threshold boards).
export function makeLabel(text, { w = 256, h = 128, bg = '#ffffff', fg = '#111111', font = 'bold 72px Arial' } = {}) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  return canvasTexture(c);
}

// Soft round particle sprite (spray mist, dust).
export function makeSoftDot() {
  const S = 64;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  return canvasTexture(c, { srgb: false });
}

// Ground micro-detail (tileable, linear data): R pebbles (height), G cracks of
// dry compacted soil, B grass-clump speckle, A fine grain. Sampled by the
// terrain shader near the camera for colour breakup and bump.
export function makeGroundDetail(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const r = rng(321);
  const peb = new Float32Array(size * size);
  // Pebbles: small domes, wrapped.
  for (let i = 0; i < 900; i++) {
    const cx = r() * size, cy = r() * size, rad = 1.2 + Math.pow(r(), 2) * 4.5, h = 0.4 + r() * 0.6;
    const R = Math.ceil(rad);
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x + (cx % 1), y + (cy % 1)) / rad;
      if (d >= 1) continue;
      const px = ((Math.floor(cx) + x) % size + size) % size, py = ((Math.floor(cy) + y) % size + size) % size;
      peb[py * size + px] = Math.max(peb[py * size + px], h * Math.sqrt(1 - d * d));
    }
  }
  // Cracks: jittered-grid Voronoi, F2 - F1 small near cell borders.
  const G = 9, cell = size / G;
  const pts = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) pts.push([(i + 0.15 + r() * 0.7) * cell, (j + 0.15 + r() * 0.7) * cell]);
  const gr = tileNoise(32, 97);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gi = Math.floor(x / cell), gj = Math.floor(y / cell);
      let f1 = 1e9, f2 = 1e9;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = (gi + di + G) % G, jj = (gj + dj + G) % G;
        const [px, py] = pts[jj * G + ii];
        const ox = px + (gi + di - ii) * cell, oy = py + (gj + dj - jj) * cell;
        const d = Math.hypot(x - ox, y - oy);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
      const crack = Math.max(0, 1 - (f2 - f1) / 2.2);
      const i = (y * size + x) * 4;
      const grain = gr((x / size) * 32, (y / size) * 32);
      data[i] = Math.round(peb[y * size + x] * 255);
      data[i + 1] = Math.round(crack * 255);
      data[i + 2] = Math.round(r() * 255);
      data[i + 3] = Math.round((0.6 * grain + 0.4 * r()) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
