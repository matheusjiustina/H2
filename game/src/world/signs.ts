import * as THREE from 'three';

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

export const HEAD_FONT = 'Bangers, "Arial Narrow", Impact, sans-serif';
export const BODY_FONT = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';

/** Fits text into a box by shrinking the font. */
export function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number, font = HEAD_FONT, weight = '') {
  let s = size;
  do {
    g.font = `${weight} ${s}px ${font}`;
    if (g.measureText(text).width <= maxW) break;
    s -= 2;
  } while (s > 8);
  g.fillText(text, x, y);
}

/**
 * All signs, billboards and painted text share one texture atlas and one mesh,
 * so the whole city's signage costs a single draw call.
 */
export class Signs {
  private cv = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private shelfY = 2;
  private shelfH = 0;
  private cursorX = 2;
  private tiles = new Map<string, { x: number; y: number; w: number; h: number }>();
  private pos: number[] = [];
  private uv: number[] = [];
  material: THREE.MeshBasicMaterial;
  texture: THREE.CanvasTexture;
  readonly size = 2048;

  constructor() {
    this.cv.width = this.cv.height = this.size;
    this.g = this.cv.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.cv);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, fog: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 });
  }

  private tile(key: string, w: number, h: number, draw: Draw) {
    let t = this.tiles.get(key);
    if (t) return t;
    w = Math.min(w, this.size - 4);
    if (this.cursorX + w + 2 > this.size) {
      this.cursorX = 2;
      this.shelfY += this.shelfH + 2;
      this.shelfH = 0;
    }
    if (this.shelfY + h + 2 > this.size) {
      // atlas full: reuse the first tile rather than failing
      return this.tiles.values().next().value!;
    }
    t = { x: this.cursorX, y: this.shelfY, w, h };
    this.cursorX += w + 2;
    this.shelfH = Math.max(this.shelfH, h);
    this.tiles.set(key, t);
    const g = this.g;
    g.save();
    g.translate(t.x, t.y);
    g.beginPath();
    g.rect(0, 0, w, h);
    g.clip();
    draw(g, w, h);
    g.restore();
    return t;
  }

  /** Vertical sign quad centred at (x,y,z) facing direction `rot` (local +z). */
  add(key: string, x: number, y: number, z: number, rot: number, w: number, h: number, pw: number, ph: number, draw: Draw, both = false) {
    const t = this.tile(key, pw, ph, draw);
    const S = this.size;
    const u0 = t.x / S, u1 = (t.x + t.w) / S, v1 = 1 - t.y / S, v0 = 1 - (t.y + t.h) / S;
    const emit = (r: number, off: number) => {
      const nx = Math.sin(r), nz = Math.cos(r);
      const rx = nz, rz = -nx;
      const cx = x + nx * off, cz = z + nz * off;
      const ax = cx - (rx * w) / 2, az = cz - (rz * w) / 2, bx = cx + (rx * w) / 2, bz = cz + (rz * w) / 2;
      const y0 = y - h / 2, y1 = y + h / 2;
      this.pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
      this.uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    };
    emit(rot, 0);
    if (both) emit(rot + Math.PI, 0.02);
  }

  /** Flat (ground) decal facing up; `rot` rotates the text's "up" direction. */
  addFlat(key: string, x: number, y: number, z: number, rot: number, w: number, d: number, pw: number, ph: number, draw: Draw) {
    const t = this.tile(key, pw, ph, draw);
    const S = this.size;
    const u0 = t.x / S, u1 = (t.x + t.w) / S, v1 = 1 - t.y / S, v0 = 1 - (t.y + t.h) / S;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const P = (lx: number, lz: number) => [x + lx * cs + lz * sn, y, z - lx * sn + lz * cs];
    const a = P(-w / 2, d / 2), b = P(w / 2, d / 2), c = P(w / 2, -d / 2), e = P(-w / 2, -d / 2);
    this.pos.push(...a, ...b, ...c, ...a, ...c, ...e);
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
  }

  /** Simple lettered sign. */
  text(x: number, y: number, z: number, rot: number, w: number, h: number, text: string, bg = '#f6ecd0', fg = '#1d1a2e', both = false, font = HEAD_FONT) {
    const pw = Math.min(512, Math.max(64, Math.round(w * 42)));
    const ph = Math.max(24, Math.round((pw * h) / w));
    this.add(`t|${text}|${bg}|${fg}|${pw}x${ph}`, x, y, z, rot, w, h, pw, ph, (g, W, H) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = fg;
      g.lineWidth = Math.max(3, H * 0.07);
      g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth);
      g.fillStyle = fg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      fitText(g, text, W / 2, H / 2 + H * 0.04, W * 0.86, H * 0.68, font);
    }, both);
  }

  build(): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    this.texture.needsUpdate = true;
    const m = new THREE.Mesh(geo, this.material);
    m.frustumCulled = false;
    m.renderOrder = 3;
    return m;
  }
}

// ---------------------------------------------------------------------------
// Fictional billboard ads. All brands, slogans and campaigns are invented parody.
// ---------------------------------------------------------------------------
interface Ad {
  bg: string;
  fg: string;
  accent: string;
  head: string;
  sub: string;
  tag?: string;
}
export const ADS: Ad[] = [
  { bg: '#1d1a2e', fg: '#f2c94c', accent: '#f6ecd0', head: 'GOLDEN TOWER', sub: 'THE TALLEST. EVERYBODY SAYS SO.', tag: 'LUXURY SUITES' },
  { bg: '#f2c94c', fg: '#1d1a2e', accent: '#d43a34', head: 'HAIR FORCE ONE', sub: 'EXTRA-HOLD HAIRSPRAY · WIND TESTED', tag: 'NEW' },
  { bg: '#d43a34', fg: '#f6ecd0', accent: '#1d1a2e', head: 'COVFEFE COLA', sub: "NOBODY KNOWS WHAT'S IN IT", tag: 'ICE COLD' },
  { bg: '#f6ecd0', fg: '#d43a34', accent: '#1d1a2e', head: 'TREMENDOUS BURGER', sub: 'HUGE. THE BEST. BELIEVE US.', tag: '99¢' },
  { bg: '#2f5fa8', fg: '#f6ecd0', accent: '#f2c94c', head: 'FAKE NEWS NETWORK', sub: 'WE REPORT. YOU DECIDE TO YELL.', tag: 'LIVE 24/7' },
  { bg: '#f6ecd0', fg: '#2f5fa8', accent: '#d43a34', head: 'VOTE SOMEBODY', sub: '"ANYBODY, REALLY." — THE CITY', tag: 'ELECTION SEASON' },
  { bg: '#4c9a5a', fg: '#f6ecd0', accent: '#1d1a2e', head: 'BIGLY INSURANCE', sub: "YOU'RE COVERED. PROBABLY.", tag: 'CALL NOW' },
  { bg: '#1d1a2e', fg: '#f6ecd0', accent: '#d43a34', head: 'DEBATE NIGHT!', sub: 'EVERYONE vs. EVERYONE · LIVE', tag: 'TONIGHT' },
  { bg: '#ee8a3a', fg: '#1d1a2e', accent: '#f6ecd0', head: 'GET YOUR KICKS', sub: 'ROUTE 66 · NEXT GAS: EVENTUALLY', tag: 'EXIT EAST' },
  { bg: '#3fa7c4', fg: '#f6ecd0', accent: '#f2c94c', head: 'LIBERTY BEACH', sub: 'SUN. SAND. SELFIES.', tag: 'OPEN ALL YEAR' },
  { bg: '#7a62a8', fg: '#f6ecd0', accent: '#f2c94c', head: 'BULL & BEAR', sub: 'STEAKHOUSE · STONKS ONLY GO UP', tag: 'WALL ST.' },
  { bg: '#f6ecd0', fg: '#1d1a2e', accent: '#ee8a3a', head: 'THE WALL', sub: 'NOW A ROOFTOP BAR', tag: 'HAPPY HOUR' },
  { bg: '#f2a0a8', fg: '#1d1a2e', accent: '#f6ecd0', head: 'FREEDOM FRIES', sub: 'NOW 30% FREER', tag: 'LIMITED TIME' },
  { bg: '#2b2e42', fg: '#f2c94c', accent: '#f6ecd0', head: 'ATOMIC MOTEL', sub: 'COLOR TV · NO QUESTIONS', tag: 'VACANCY' },
  { bg: '#f6ecd0', fg: '#4c9a5a', accent: '#1d1a2e', head: 'MAKE TRAFFIC', sub: 'GREAT AGAIN · CITY ROADS DEPT.', tag: 'DETOUR AHEAD' },
  { bg: '#d43a34', fg: '#f2c94c', accent: '#f6ecd0', head: 'RED HAT OUTLET', sub: 'ONE SIZE FITS MOST OPINIONS', tag: 'SALE' },
];

export function drawAd(i: number): Draw {
  const ad = ADS[i % ADS.length];
  return (g, W, H) => {
    g.fillStyle = ad.bg;
    g.fillRect(0, 0, W, H);
    // halftone corner
    g.fillStyle = ad.accent;
    g.globalAlpha = 0.16;
    for (let y = 0; y < H; y += 9) for (let x = (y / 9) % 2 ? 4 : 0; x < W * 0.5; x += 9) {
      const r = 3.2 * (1 - x / (W * 0.5));
      g.beginPath();
      g.arc(W - x, y, r, 0, 6.3);
      g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = ad.fg;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.save();
    g.transform(1, 0, -0.12, 1, 0, 0);
    fitText(g, ad.head, W * 0.07 + 10, H * 0.52, W * 0.84, H * 0.42);
    g.restore();
    g.fillStyle = ad.accent;
    fitText(g, ad.sub, W * 0.06, H * 0.78, W * 0.88, H * 0.16, BODY_FONT, '700');
    if (ad.tag) {
      g.font = `700 ${Math.round(H * 0.1)}px ${BODY_FONT}`;
      const tw = g.measureText(ad.tag).width + 16;
      g.fillStyle = ad.accent;
      g.fillRect(W * 0.06, H * 0.08, tw, H * 0.15);
      g.fillStyle = ad.bg;
      g.fillText(ad.tag, W * 0.06 + 8, H * 0.19);
    }
    g.strokeStyle = '#1d1a2e';
    g.lineWidth = 6;
    g.strokeRect(3, 3, W - 6, H - 6);
  };
}
