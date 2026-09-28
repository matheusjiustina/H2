import * as THREE from 'three';

/** Procedural canvas textures — no image assets to download. */

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { srgb = true, repeat } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.anisotropy = 4;
  return t;
}

function once(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

export const glowTexture = () =>
  once('glow', () => {
    const [c, g] = canvas(128, 128);
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.2, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.14)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return tex(c, { srgb: false });
  });

/** Vertical fade used for light beams. */
export const beamTexture = () =>
  once('beam', () => {
    const [c, g] = canvas(4, 128);
    const grd = g.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0.9)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 128);
    return tex(c, { srgb: false });
  });

export const soilTexture = () =>
  once('soil', () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = '#1d1712';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const r = Math.random() * 2.2 + 0.4;
      const l = 8 + Math.random() * 16;
      g.fillStyle = `hsla(${22 + Math.random() * 14}, 28%, ${l}%, ${0.35 + Math.random() * 0.5})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    // Tiny mineral glints.
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(180,220,255,${0.15 + Math.random() * 0.25})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
    }
    return tex(c, { repeat: [1, 1] });
  });

export const floorTexture = () =>
  once('floor', () => {
    const [c, g] = canvas(512, 512);
    g.fillStyle = '#1a1d23';
    g.fillRect(0, 0, 512, 512);
    const n = 4;
    const s = 512 / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const l = 10 + Math.random() * 2.5;
        g.fillStyle = `hsl(220, 10%, ${l}%)`;
        g.fillRect(x * s + 3, y * s + 3, s - 6, s - 6);
        // brushed noise
        for (let i = 0; i < 40; i++) {
          g.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`;
          g.fillRect(x * s + 3, y * s + 3 + Math.random() * (s - 6), s - 6, 1);
        }
      }
    }
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 2;
    for (let i = 0; i <= n; i++) {
      g.beginPath();
      g.moveTo(i * s, 0);
      g.lineTo(i * s, 512);
      g.moveTo(0, i * s);
      g.lineTo(512, i * s);
      g.stroke();
    }
    return tex(c, { repeat: [3, 2.2] });
  });

/** Glowing circuit traces for NVDA leaves (used as emissiveMap). */
export const circuitTexture = () =>
  once('circuit', () => {
    const [c, g] = canvas(128, 256);
    g.fillStyle = '#000';
    g.fillRect(0, 0, 128, 256);
    g.strokeStyle = '#fff';
    g.lineCap = 'round';
    // midrib
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(64, 0);
    g.lineTo(64, 256);
    g.stroke();
    g.lineWidth = 2.5;
    for (let y = 18; y < 250; y += 30) {
      for (const dir of [-1, 1]) {
        g.beginPath();
        g.moveTo(64, y);
        g.lineTo(64 + dir * 16, y + 16);
        g.lineTo(64 + dir * 44, y + 16);
        g.stroke();
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(64 + dir * 46, y + 16, 3.5, 0, Math.PI * 2);
        g.fill();
      }
    }
    const t = tex(c, { srgb: false });
    t.wrapT = THREE.RepeatWrapping;
    return t;
  });

/** Text plate (signs, coin faces). Returns a fresh texture + redraw fn. */
export function textPlate(
  text,
  {
    w = 256,
    h = 96,
    bg = '#0f1318',
    fg = '#e8edf2',
    accent = null,
    font = '700 44px "Space Grotesk", system-ui, sans-serif',
  } = {},
) {
  const [c, g] = canvas(w, h);
  const t = tex(c);
  const draw = (label, color = fg, acc = accent) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    if (acc) {
      g.fillStyle = acc;
      g.fillRect(0, h - 8, w, 8);
    }
    g.fillStyle = color;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, w / 2, h / 2 - (acc ? 3 : 0));
    t.needsUpdate = true;
  };
  draw(text);
  return { texture: t, draw };
}

/** Round coin face with the ticker in the middle. */
export function coinFace(ticker, colorA, colorB) {
  const [c, g] = canvas(256, 256);
  const grd = g.createLinearGradient(0, 0, 256, 256);
  grd.addColorStop(0, colorA);
  grd.addColorStop(1, colorB);
  g.fillStyle = '#0c0f14';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = grd;
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(8,10,14,0.82)';
  g.beginPath();
  g.arc(128, 128, 104, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = colorA;
  g.globalAlpha = 0.5;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(128, 128, 94, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = '#ffffff';
  g.font = `700 ${ticker.length > 4 ? 50 : 60}px "Space Grotesk", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(ticker, 128, 132);
  return tex(c);
}

/** Scrolling LED ticker board ("Wall Street" touch). */
export function tickerBoardTexture(items) {
  const [c, g] = canvas(1024, 64);
  g.fillStyle = '#07090c';
  g.fillRect(0, 0, 1024, 64);
  g.font = '600 30px "Space Grotesk", system-ui, sans-serif';
  g.textBaseline = 'middle';
  let x = 20;
  const step = 1024 / items.length;
  items.forEach((it, i) => {
    x = i * step + 18;
    g.fillStyle = 'rgba(210,225,240,0.85)';
    g.fillText(it.id, x, 33);
    const tw = g.measureText(it.id).width;
    g.fillStyle = it.color;
    g.beginPath();
    g.moveTo(x + tw + 12, 40);
    g.lineTo(x + tw + 24, 40);
    g.lineTo(x + tw + 18, 28);
    g.closePath();
    g.fill();
  });
  // subtle LED scanlines
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 0; y < 64; y += 3) g.fillRect(0, y, 1024, 1);
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Small control-panel screen. */
export function panelScreenTexture() {
  const [c, g] = canvas(128, 96);
  g.fillStyle = '#061014';
  g.fillRect(0, 0, 128, 96);
  g.strokeStyle = '#5fe0c8';
  g.lineWidth = 2;
  g.beginPath();
  for (let x = 0; x <= 128; x += 4) {
    const y = 34 + Math.sin(x * 0.12) * 10 + Math.sin(x * 0.31) * 4;
    x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.stroke();
  const bars = [0.5, 0.8, 0.35, 0.65, 0.9];
  bars.forEach((b, i) => {
    g.fillStyle = i === 4 ? '#ffb14d' : '#5fe0c8';
    g.globalAlpha = 0.85;
    g.fillRect(14 + i * 22, 90 - b * 32, 12, b * 32);
  });
  g.globalAlpha = 1;
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
