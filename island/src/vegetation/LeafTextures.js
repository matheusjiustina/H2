import * as THREE from 'three';
import { rng } from '../utils/MathUtils.js';

// Canvas-drawn foliage textures. Colours of transparent texels are dilated from the
// leaf colour so mip-mapping never bleeds dark fringes, then uploaded as DataTextures.

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(canvas, fill = [70, 100, 40]) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  // two-pass dilation of colour into transparent texels (cheap and good enough)
  const src = new Uint8ClampedArray(d);
  for (let pass = 0; pass < 2; pass++) {
    const rad = pass === 0 ? 2 : 6;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (src[i + 3] > 8) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const xx = Math.min(w - 1, Math.max(0, Math.round(x + Math.cos(a) * rad)));
          const yy = Math.min(h - 1, Math.max(0, Math.round(y + Math.sin(a) * rad)));
          const j = (yy * w + xx) * 4;
          if (src[j + 3] > 8) { r += src[j]; g += src[j + 1]; b += src[j + 2]; n++; }
        }
        if (n > 0) { d[i] = r / n; d[i + 1] = g / n; d[i + 2] = b / n; src[i + 3] = pass === 0 ? 9 : src[i + 3]; } else if (pass === 1 && d[i + 3] === 0 && d[i] === 0) { d[i] = fill[0]; d[i + 1] = fill[1]; d[i + 2] = fill[2]; }
      }
    }
  }
  const tex = new THREE.DataTexture(new Uint8Array(d.buffer.slice(0)), w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  tex.userData.size = [w, h];
  return tex;
}

const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

/** Pinnate coconut palm frond: x along length (base -> tip), y across (midrib at centre). */
function palmFrond(seed = 1) {
  const W = 1024, H = 256;
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(seed);
  const mid = H / 2;
  // leaflets
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 74; i++) {
      const t = 0.03 + (i / 74) * 0.95;
      const x0 = t * W;
      if (r() < 0.05) continue; // missing leaflet
      const lenF = Math.sin(Math.min(1, t * 1.15) * Math.PI) ** 0.55 * (0.82 + r() * 0.2);
      const len = lenF * (H * 0.5 - 6);
      const ang = (0.55 + r() * 0.15) * (1 - t * 0.35);
      const x1 = x0 + Math.cos(ang) * len * 1.25;
      const y1 = mid + side * Math.sin(ang) * len * 1.4;
      const wdt = 4.5 + r() * 2.5;
      const dry = r() < 0.07 || (t > 0.9 && r() < 0.4);
      const gch = dry ? [150, 128, 70] : [62 + r() * 30, 104 + r() * 30, 30 + r() * 18];
      const grad = ctx.createLinearGradient(x0, mid, x1, y1);
      grad.addColorStop(0, rgb(gch[0] * 0.75, gch[1] * 0.75, gch[2] * 0.75));
      grad.addColorStop(0.6, rgb(gch[0], gch[1], gch[2]));
      grad.addColorStop(1, rgb(gch[0] * 1.1 + 12, gch[1] * 1.08 + 10, gch[2]));
      ctx.fillStyle = grad;
      ctx.beginPath();
      const nx = -(y1 - mid), ny = x1 - x0;
      const nl = Math.hypot(nx, ny) || 1;
      const ox = (nx / nl) * wdt, oy = (ny / nl) * wdt;
      ctx.moveTo(x0, mid);
      ctx.quadraticCurveTo((x0 + x1) / 2 + ox, (mid + y1) / 2 + oy, x1, y1);
      ctx.quadraticCurveTo((x0 + x1) / 2 - ox * 0.4, (mid + y1) / 2 - oy * 0.4, x0 + 3, mid);
      ctx.fill();
      // leaflet midrib
      ctx.strokeStyle = rgb(gch[0] * 1.25 + 20, gch[1] * 1.15 + 15, gch[2] + 10, 0.5);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x0, mid);
      ctx.lineTo(x0 + (x1 - x0) * 0.9, mid + (y1 - mid) * 0.9);
      ctx.stroke();
    }
  }
  // rachis (midrib)
  const g2 = ctx.createLinearGradient(0, 0, W, 0);
  g2.addColorStop(0, rgb(150, 140, 80));
  g2.addColorStop(1, rgb(120, 130, 60));
  ctx.strokeStyle = g2;
  ctx.lineCap = 'round';
  for (let k = 0; k < 2; k++) {
    ctx.lineWidth = k === 0 ? 7 : 3;
    ctx.globalAlpha = k === 0 ? 1 : 0.6;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(W * 0.985, mid);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return toTexture(c, [70, 100, 35]);
}

/** Cluster of glossy ovate leaves on twigs (broadleaf canopy card). 2x1 atlas. */
function leafCluster(seed = 3) {
  const W = 1024, H = 512;
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(seed);
  for (let cell = 0; cell < 2; cell++) {
    const ox = cell * 512;
    const palette = cell === 0 ? [[38, 78, 26], [52, 96, 30], [72, 112, 38]] : [[48, 86, 22], [70, 110, 30], [96, 128, 40]];
    // twigs
    ctx.strokeStyle = rgb(70, 55, 40);
    ctx.lineWidth = 3;
    const twigs = [];
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2;
      const len = 120 + r() * 120;
      const x0 = ox + 256, y0 = 256;
      const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
      twigs.push([x0, y0, x1, y1]);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    // leaves (back to front)
    const leaves = [];
    for (let i = 0; i < 70; i++) {
      const tw = twigs[Math.floor(r() * twigs.length)];
      const t = 0.25 + r() * 0.8;
      const x = tw[0] + (tw[2] - tw[0]) * t + (r() - 0.5) * 50;
      const y = tw[1] + (tw[3] - tw[1]) * t + (r() - 0.5) * 50;
      const d = Math.hypot(x - (ox + 256), y - 256);
      if (d > 235) continue;
      leaves.push({ x, y, a: Math.atan2(y - 256, x - (ox + 256)) + (r() - 0.5) * 1.6, l: 34 + r() * 30, w: 0.38 + r() * 0.12, shade: r(), d });
    }
    leaves.sort((a, b) => a.d - b.d);
    for (const L of leaves) {
      ctx.save();
      ctx.translate(L.x, L.y);
      ctx.rotate(L.a);
      const col = palette[Math.floor(L.shade * 3)];
      const dark = 0.75 + (L.d / 256) * 0.35;
      const grad = ctx.createLinearGradient(0, -L.l * L.w, 0, L.l * L.w);
      grad.addColorStop(0, rgb(col[0] * dark * 1.15, col[1] * dark * 1.15, col[2] * dark));
      grad.addColorStop(1, rgb(col[0] * dark * 0.8, col[1] * dark * 0.8, col[2] * dark * 0.8));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-L.l * 0.5, 0);
      ctx.bezierCurveTo(-L.l * 0.2, -L.l * L.w, L.l * 0.3, -L.l * L.w * 0.8, L.l * 0.55, 0);
      ctx.bezierCurveTo(L.l * 0.3, L.l * L.w * 0.8, -L.l * 0.2, L.l * L.w, -L.l * 0.5, 0);
      ctx.fill();
      ctx.strokeStyle = rgb(col[0] * 1.4 + 20, col[1] * 1.3 + 20, col[2] + 10, 0.55);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-L.l * 0.48, 0); ctx.lineTo(L.l * 0.5, 0); ctx.stroke();
      // highlight (gloss)
      ctx.fillStyle = 'rgba(255,255,230,0.07)';
      ctx.beginPath(); ctx.ellipse(0, -L.l * L.w * 0.3, L.l * 0.3, L.l * L.w * 0.25, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  return toTexture(c, [45, 85, 28]);
}

/** Banana leaf: length along x, with parallel veins and tattered edges. */
function bananaLeaf(seed = 5) {
  const W = 1024, H = 256;
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(seed);
  const mid = H / 2;
  const half = (t) => Math.sin(Math.min(1, t * 1.05) * Math.PI) ** 0.45 * (H * 0.46);
  // body with tears
  for (let side = -1; side <= 1; side += 2) {
    let x = 6;
    while (x < W - 4) {
      const segW = 6 + r() * 22;
      const t0 = x / W, t1 = Math.min(1, (x + segW) / W);
      const torn = r() < 0.35 ? 0.4 + r() * 0.5 : 1;
      const grad = ctx.createLinearGradient(0, mid, 0, mid + side * half(t0));
      const g = 112 + r() * 14;
      grad.addColorStop(0, rgb(66, g, 36));
      grad.addColorStop(1, rgb(92, g + 22, 44));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x, mid);
      ctx.lineTo(x + 2, mid + side * half(t0) * torn);
      ctx.lineTo(x + segW - 1, mid + side * half(t1) * torn * (0.96 + r() * 0.04));
      ctx.lineTo(x + segW + 1, mid);
      ctx.closePath();
      ctx.fill();
      // dry brown edge fringe sometimes
      if (r() < 0.25) {
        ctx.fillStyle = rgb(140, 120, 70, 0.8);
        ctx.fillRect(x + 1, mid + side * half(t0) * torn - (side > 0 ? 4 : 0), segW, 4);
      }
      x += segW + (torn < 1 ? 1.5 : 0);
    }
  }
  // veins
  ctx.strokeStyle = 'rgba(30,60,20,0.25)';
  ctx.lineWidth = 1;
  for (let x = 10; x < W; x += 7) {
    ctx.beginPath();
    ctx.moveTo(x, mid);
    ctx.lineTo(x + 26, mid - half(x / W) * 0.98);
    ctx.moveTo(x, mid);
    ctx.lineTo(x + 26, mid + half(x / W) * 0.98);
    ctx.stroke();
  }
  ctx.strokeStyle = rgb(170, 175, 110);
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W - 10, mid); ctx.stroke();
  return toTexture(c, [80, 120, 40]);
}

/** Fern frond: bipinnate look. */
function fernFrond(seed = 7) {
  const W = 512, H = 256;
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(seed);
  const mid = H / 2;
  for (let i = 0; i < 46; i++) {
    const t = 0.04 + (i / 46) * 0.94;
    const x0 = t * W;
    const len = Math.sin(Math.min(1, t * 1.1) * Math.PI) ** 0.7 * (H * 0.46);
    for (let side = -1; side <= 1; side += 2) {
      const ang = 0.95 - t * 0.3;
      const x1 = x0 + Math.cos(ang) * len * 0.7;
      const y1 = mid + side * Math.sin(ang) * len;
      // pinnules along the pinna
      const n = 7;
      for (let k = 0; k < n; k++) {
        const u = k / n;
        const px = x0 + (x1 - x0) * u, py = mid + (y1 - mid) * u;
        const s = (1 - u) * 7 + 2;
        const g = 100 + r() * 30;
        ctx.fillStyle = rgb(50 + r() * 20, g, 30);
        ctx.beginPath();
        ctx.ellipse(px + s * 0.5, py, s, s * 0.45, side * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = rgb(70, 95, 40);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x0, mid); ctx.lineTo(x1, y1); ctx.stroke();
    }
  }
  ctx.strokeStyle = rgb(90, 100, 50);
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();
  return toTexture(c, [60, 105, 32]);
}

/** Large leaves: left = heart shaped elephant ear, right = split monstera. */
function bigLeaves(seed = 9) {
  const W = 1024, H = 512;
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(seed);
  // elephant ear (tip pointing +x)
  {
    const cx = 256, cy = 256;
    ctx.save();
    ctx.translate(cx, cy);
    const grad = ctx.createRadialGradient(-120, 0, 10, 0, 0, 260);
    grad.addColorStop(0, rgb(70, 118, 42));
    grad.addColorStop(1, rgb(44, 92, 30));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-170, 0);
    ctx.bezierCurveTo(-250, -170, 60, -230, 240, 0);
    ctx.bezierCurveTo(60, 230, -250, 170, -170, 0);
    ctx.fill();
    ctx.strokeStyle = rgb(150, 170, 100, 0.8);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-170, 0); ctx.lineTo(230, 0); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgb(140, 165, 95, 0.55);
    for (let i = 0; i < 9; i++) {
      const x = -130 + i * 40;
      for (let s = -1; s <= 1; s += 2) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + 50, s * 70, x + 90, s * (150 - i * 12)); ctx.stroke();
      }
    }
    ctx.restore();
  }
  // monstera with fenestrations
  {
    const cx = 768, cy = 256;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = rgb(30, 78, 30);
    ctx.beginPath();
    ctx.moveTo(-200, 0);
    ctx.bezierCurveTo(-230, -210, 150, -230, 230, 0);
    ctx.bezierCurveTo(150, 230, -230, 210, -200, 0);
    ctx.fill();
    // splits from the edge towards the midrib
    ctx.globalCompositeOperation = 'destination-out';
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 0; i < 7; i++) {
        const x = -150 + i * 52 + r() * 10;
        ctx.beginPath();
        ctx.moveTo(x, s * 40);
        ctx.lineTo(x + 30, s * 230);
        ctx.lineTo(x + 48, s * 230);
        ctx.lineTo(x + 14, s * 46);
        ctx.fill();
        if (r() < 0.7) { ctx.beginPath(); ctx.ellipse(x + 2, s * 26, 7, 4, 0, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = rgb(120, 150, 80, 0.8);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-200, 0); ctx.lineTo(225, 0); ctx.stroke();
    ctx.restore();
  }
  return toTexture(c, [40, 90, 30]);
}

/** Shrub cards: 2x2 atlas (plain, hibiscus, frangipani, sea grape). */
function shrubs(seed = 11) {
  const W = 1024, H = 1024;
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(seed);
  const cells = [
    { leaf: [[40, 84, 26], [58, 104, 32]], flower: null, round: false },
    { leaf: [[34, 76, 24], [50, 96, 30]], flower: [[200, 30, 40], [230, 60, 60]], round: false },
    { leaf: [[46, 92, 30], [64, 114, 36]], flower: [[245, 240, 225], [250, 210, 90]], round: false },
    { leaf: [[70, 112, 40], [96, 132, 48]], flower: null, round: true },
  ];
  cells.forEach((cell, idx) => {
    const ox = (idx % 2) * 512, oy = Math.floor(idx / 2) * 512;
    const leaves = [];
    for (let i = 0; i < 160; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 215;
      leaves.push({ x: ox + 256 + Math.cos(a) * d, y: oy + 256 + Math.sin(a) * d * 0.92, a: r() * Math.PI * 2, l: cell.round ? 26 + r() * 12 : 22 + r() * 18, d });
    }
    leaves.sort((a, b) => b.d - a.d);
    for (const L of leaves) {
      const col = cell.leaf[r() < 0.5 ? 0 : 1];
      const sh = 0.8 + (1 - L.d / 215) * 0.35;
      ctx.save();
      ctx.translate(L.x, L.y);
      ctx.rotate(L.a);
      ctx.fillStyle = rgb(col[0] * sh, col[1] * sh, col[2] * sh);
      ctx.beginPath();
      if (cell.round) ctx.ellipse(0, 0, L.l * 0.55, L.l * 0.5, 0, 0, Math.PI * 2);
      else {
        ctx.moveTo(-L.l * 0.5, 0);
        ctx.quadraticCurveTo(0, -L.l * 0.42, L.l * 0.5, 0);
        ctx.quadraticCurveTo(0, L.l * 0.42, -L.l * 0.5, 0);
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,220,150,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-L.l * 0.45, 0); ctx.lineTo(L.l * 0.45, 0); ctx.stroke();
      ctx.restore();
    }
    if (cell.flower) {
      for (let i = 0; i < 16; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 180;
        const x = ox + 256 + Math.cos(a) * d, y = oy + 256 + Math.sin(a) * d;
        const [p, q] = cell.flower;
        const petals = 5;
        for (let k = 0; k < petals; k++) {
          const pa = (k / petals) * Math.PI * 2 + a;
          ctx.fillStyle = rgb(p[0] + r() * 15, p[1] + r() * 15, p[2] + r() * 15);
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(pa) * 9, y + Math.sin(pa) * 9, 10, 6.5, pa, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = rgb(q[0], q[1], q[2]);
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
  });
  return toTexture(c, [45, 90, 30]);
}

/** Hanging vine strip with small heart leaves (vertical). */
function vine(seed = 13) {
  const W = 128, H = 512;
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(seed);
  ctx.strokeStyle = rgb(70, 80, 40);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  let x = 64;
  ctx.moveTo(x, 0);
  for (let y = 0; y < H; y += 16) { x = 64 + Math.sin(y * 0.03) * 10; ctx.lineTo(x, y); }
  ctx.stroke();
  for (let y = 8; y < H - 8; y += 9 + r() * 8) {
    const xx = 64 + Math.sin(y * 0.03) * 10 + (r() - 0.5) * 20;
    const s = 9 + r() * 7;
    ctx.save();
    ctx.translate(xx, y);
    ctx.rotate((r() - 0.5) * 1.8);
    ctx.fillStyle = rgb(48 + r() * 20, 100 + r() * 30, 34);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.2);
    ctx.bezierCurveTo(-s, -s, -s, s * 0.4, 0, s);
    ctx.bezierCurveTo(s, s * 0.4, s, -s, 0, -s * 0.2);
    ctx.fill();
    ctx.restore();
  }
  return toTexture(c, [55, 100, 35]);
}

export function createLeafTextures() {
  return {
    palm: palmFrond(17),
    cluster: leafCluster(3),
    banana: bananaLeaf(5),
    fern: fernFrond(7),
    big: bigLeaves(9),
    shrub: shrubs(11),
    vine: vine(13),
  };
}
