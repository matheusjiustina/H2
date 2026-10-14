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
// row, height = 1 crop height. Alpha-tested.
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
  if (kind === 'soy') {
    // Bushy rounded trifoliate canopy.
    for (let i = 0; i < 900; i++) {
      const x = r() * W, y = H * (0.12 + 0.88 * Math.pow(r(), 0.7));
      const l = 10 + r() * 16;
      const shade = 26 + r() * 22 - (y / H) * 12;
      g.fillStyle = hsl(88 + r() * 18, 55 + r() * 15, shade);
      g.beginPath();
      g.ellipse(x, y, l * 0.55, l * 0.4, r() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 40; i++) { // stems
      g.strokeStyle = hsl(80, 35, 28, 0.9);
      g.lineWidth = 2;
      const x = r() * W;
      g.beginPath(); g.moveTo(x, H); g.lineTo(x + (r() - 0.5) * 20, H * 0.4); g.stroke();
    }
  } else if (kind === 'corn') {
    // Stalks with long arching blades and tassels.
    const n = 22;
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * W + (r() - 0.5) * 10;
      g.strokeStyle = hsl(78, 40, 30 + r() * 8);
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(x, H); g.lineTo(x + (r() - 0.5) * 4, H * 0.08); g.stroke();
      for (let k = 0; k < 9; k++) {
        const y = H * (0.18 + k * 0.09) + r() * 6;
        const side = k % 2 ? 1 : -1;
        leaf(x, y, 50 + r() * 40, side > 0 ? -0.35 + r() * 0.5 : Math.PI + 0.35 - r() * 0.5, 5 + r() * 3,
          hsl(84 + r() * 16, 45 + r() * 20, 26 + r() * 16));
      }
      g.strokeStyle = hsl(45, 55, 60);
      g.lineWidth = 2;
      for (let k = 0; k < 5; k++) {
        g.beginPath(); g.moveTo(x, H * 0.1); g.lineTo(x + (r() - 0.5) * 24, H * (0.0 + r() * 0.05)); g.stroke();
      }
      // Ear
      g.fillStyle = hsl(70, 35, 45);
      g.beginPath(); g.ellipse(x + 6, H * 0.5, 4, 14, 0.3, 0, Math.PI * 2); g.fill();
    }
  } else if (kind === 'cotton') {
    for (let i = 0; i < 700; i++) {
      const x = r() * W, y = H * (0.15 + 0.85 * Math.pow(r(), 0.8));
      const l = 12 + r() * 14;
      g.fillStyle = hsl(95 + r() * 20, 40 + r() * 15, 22 + r() * 18 - (y / H) * 8);
      g.beginPath();
      g.ellipse(x, y, l * 0.5, l * 0.45, r() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 140; i++) { // open bolls
      const x = r() * W, y = H * (0.15 + 0.6 * r());
      g.fillStyle = hsl(40, 20, 92 + r() * 6);
      g.beginPath(); g.arc(x, y, 3 + r() * 3, 0, Math.PI * 2); g.fill();
    }
  }
  const t = canvasTexture(c, { repeat: true });
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Top-view canopy texture: one tile covers 4 rows x 4 m. Rows run along U.
export function makeCanopyTop(kind, seed = 5) {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const r = rng(seed);
  const soil = '#4a2a1c';
  g.fillStyle = kind === 'corn' ? '#2f4a18' : soil;
  g.fillRect(0, 0, S, S);
  const rows = 4;
  for (let k = 0; k < rows; k++) {
    const yc = ((k + 0.5) / rows) * S;
    const n = kind === 'corn' ? 220 : 380;
    for (let i = 0; i < n; i++) {
      const x = r() * S;
      const spread = kind === 'soy' ? 30 : kind === 'cotton' ? 26 : 34;
      const y = yc + (r() - 0.5) * spread;
      const l = kind === 'corn' ? 18 + r() * 22 : 7 + r() * 9;
      g.fillStyle = kind === 'corn'
        ? hsl(84 + r() * 14, 55 + r() * 20, 26 + r() * 18)
        : kind === 'cotton' ? hsl(95 + r() * 18, 45 + r() * 14, 26 + r() * 18)
          : hsl(90 + r() * 14, 62 + r() * 16, 30 + r() * 18);
      g.save();
      g.translate(((x % S) + S) % S, ((y % S) + S) % S);
      g.rotate(r() * Math.PI);
      g.beginPath();
      if (kind === 'corn') g.ellipse(0, 0, l, 2.4, 0, 0, Math.PI * 2);
      else g.ellipse(0, 0, l * 0.6, l * 0.45, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    if (kind === 'cotton') {
      for (let i = 0; i < 70; i++) {
        g.fillStyle = hsl(40, 15, 93);
        g.beginPath(); g.arc(r() * S, yc + (r() - 0.5) * 20, 1.6 + r() * 1.8, 0, Math.PI * 2); g.fill();
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
