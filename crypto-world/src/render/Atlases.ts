import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { drawScreen, ScreenKind, updateMarkets } from './ScreenContent';

export interface UVRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/**
 * All animated world screens share one small canvas atlas (one texture, one material). Tiles are
 * redrawn at a few frames per second and the atlas is uploaded once per refresh — cheap enough for
 * mobile, lively enough to make every computer feel alive.
 */
export class ScreenAtlas {
  readonly tile = 128;
  readonly cols = 8;
  readonly rows = 4;
  readonly canvas: HTMLCanvasElement;
  readonly texture: CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private tiles: { kind: ScreenKind; seed: string; span: number; index: number }[] = [];
  private next = 0;
  private acc = 0;
  private t = 0;
  refreshHz = 8;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.tile * this.cols;
    this.canvas.height = this.tile * this.rows;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.generateMipmaps = false;
  }

  /** Returns UVs for a tile showing `kind`. Identical kind+seed requests share a tile. */
  allocate(kind: ScreenKind, seed = '', span = 1): UVRect {
    let t = this.tiles.find((x) => x.kind === kind && x.seed === seed && x.span === span);
    if (!t) {
      // Spans must fit on one row.
      if ((this.next % this.cols) + span > this.cols) this.next += this.cols - (this.next % this.cols);
      if (this.next + span > this.cols * this.rows) {
        // Atlas full: reuse the first tile of the same kind, else tile 0.
        t = this.tiles.find((x) => x.kind === kind) ?? this.tiles[0];
      } else {
        t = { kind, seed, span, index: this.next };
        this.tiles.push(t);
        this.next += span;
      }
    }
    return this.rect(t.index, t.span);
  }

  private rect(index: number, span: number): UVRect {
    const c = index % this.cols, r = Math.floor(index / this.cols);
    const inset = 1.5 / this.canvas.width;
    return {
      u0: c / this.cols + inset,
      u1: (c + span) / this.cols - inset,
      v1: 1 - r / this.rows - inset,
      v0: 1 - (r + 1) / this.rows + inset,
    };
  }

  update(dt: number): void {
    this.t += dt;
    updateMarkets(dt);
    this.acc += dt;
    if (this.acc < 1 / this.refreshHz) return;
    this.acc = 0;
    for (const t of this.tiles) {
      const c = t.index % this.cols, r = Math.floor(t.index / this.cols);
      const x = c * this.tile, y = r * this.tile;
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(x, y, this.tile * t.span, this.tile);
      this.ctx.clip();
      drawScreen(t.kind, this.ctx, x, y, this.tile * t.span, this.tile, this.t, t.seed);
      // Subtle scanline sheen.
      this.ctx.fillStyle = 'rgba(255,255,255,0.035)';
      for (let yy = y; yy < y + this.tile; yy += 4) this.ctx.fillRect(x, yy, this.tile * t.span, 1);
      this.ctx.restore();
    }
    this.texture.needsUpdate = true;
  }
}

export interface SignSpec {
  text: string;
  sub?: string;
  width: number; // world units
  height: number;
  bg: string;
  fg: string;
  accent?: string;
  style?: 'board' | 'plaque' | 'banner' | 'round' | 'neon' | 'chalk';
  icon?: 'btc' | 'eth' | 'cup' | 'gear' | 'chain' | 'book' | 'wave' | 'pick' | 'antenna' | 'art' | 'fuel' | 'fish' | 'star' | 'house' | 'none';
  font?: string;
}

/** Static sign textures packed into one atlas (shelf packing). */
export class SignAtlas {
  readonly size = 2048;
  readonly canvas: HTMLCanvasElement;
  readonly texture: CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private x = 0;
  private y = 0;
  private shelfH = 0;
  private cache = new Map<string, UVRect>();
  readonly ppu = 110; // pixels per world unit

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = this.size;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.anisotropy = 4;
  }

  add(spec: SignSpec): UVRect {
    const key = JSON.stringify(spec);
    const c = this.cache.get(key);
    if (c) return c;
    let pw = Math.round(Math.min(560, spec.width * this.ppu));
    let ph = Math.round(Math.min(280, spec.height * this.ppu));
    const scale = Math.min(560 / Math.max(1, spec.width * this.ppu), 280 / Math.max(1, spec.height * this.ppu), 1);
    if (scale < 1) {
      pw = Math.round(spec.width * this.ppu * scale);
      ph = Math.round(spec.height * this.ppu * scale);
    }
    pw = Math.max(16, pw);
    ph = Math.max(16, ph);
    if (this.x + pw + 4 > this.size) {
      this.x = 0;
      this.y += this.shelfH + 4;
      this.shelfH = 0;
    }
    if (this.y + ph > this.size) {
      console.warn('Sign atlas full');
      return { u0: 0, v0: 0, u1: 0.01, v1: 0.01 };
    }
    const x = this.x, y = this.y;
    this.drawSign(spec, x, y, pw, ph);
    this.x += pw + 4;
    this.shelfH = Math.max(this.shelfH, ph);
    const S = this.size;
    const r = { u0: (x + 1) / S, u1: (x + pw - 1) / S, v1: 1 - (y + 1) / S, v0: 1 - (y + ph - 1) / S };
    this.cache.set(key, r);
    this.texture.needsUpdate = true;
    return r;
  }

  private drawSign(s: SignSpec, x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    const style = s.style ?? 'board';
    const r = Math.min(w, h) * (style === 'round' ? 0.5 : 0.14);
    // Background.
    ctx.fillStyle = s.bg;
    roundRect(ctx, 0, 0, w, h, r);
    ctx.fill();
    if (style === 'chalk') {
      ctx.strokeStyle = s.accent ?? '#c49a6c';
      ctx.lineWidth = h * 0.08;
      roundRect(ctx, h * 0.04, h * 0.04, w - h * 0.08, h - h * 0.08, r);
      ctx.stroke();
    } else if (style !== 'banner') {
      ctx.strokeStyle = s.accent ?? 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(2, h * 0.05);
      roundRect(ctx, h * 0.07, h * 0.07, w - h * 0.14, h - h * 0.14, r * 0.7);
      ctx.stroke();
    }
    // Icon.
    let textX = w / 2;
    let textW = w * 0.86;
    if (s.icon && s.icon !== 'none') {
      const isz = h * 0.56;
      const ix = h * 0.2 + isz / 2;
      drawIcon(ctx, s.icon, ix + (w > h * 1.6 ? 0 : w / 2 - ix), h / 2, isz, s.accent ?? s.fg);
      if (w > h * 1.6) {
        textX = (w + ix + isz / 2) / 2;
        textW = w - (ix + isz / 2) - h * 0.25;
      }
    }
    if (s.text && (w > h * 1.6 || !s.icon || s.icon === 'none')) {
      ctx.fillStyle = s.fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const hasSub = !!s.sub;
      let fs = h * (hasSub ? 0.4 : 0.52);
      const font = s.font ?? 'Fredoka';
      ctx.font = `600 ${fs}px ${font}, 'Trebuchet MS', sans-serif`;
      const tw = ctx.measureText(s.text).width;
      if (tw > textW) {
        fs *= textW / tw;
        ctx.font = `600 ${fs}px ${font}, 'Trebuchet MS', sans-serif`;
      }
      if (style === 'neon') {
        ctx.shadowColor = s.fg;
        ctx.shadowBlur = h * 0.15;
      }
      ctx.fillText(s.text, textX, h * (hasSub ? 0.4 : 0.53));
      ctx.shadowBlur = 0;
      if (hasSub) {
        let sfs = h * 0.2;
        ctx.font = `500 ${sfs}px Nunito, 'Trebuchet MS', sans-serif`;
        const sw = ctx.measureText(s.sub!).width;
        if (sw > textW) {
          sfs *= textW / sw;
          ctx.font = `500 ${sfs}px Nunito, 'Trebuchet MS', sans-serif`;
        }
        ctx.globalAlpha = 0.85;
        ctx.fillText(s.sub!, textX, h * 0.74);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Small vector icons used on signs and ground art. */
export function drawIcon(ctx: CanvasRenderingContext2D, icon: string, cx: number, cy: number, size: number, color: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const s = size / 2;
  switch (icon) {
    case 'btc': {
      ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${size * 0.72}px Fredoka, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('₿', 0, size * 0.03);
      break;
    }
    case 'eth': {
      ctx.beginPath();
      ctx.moveTo(0, -s); ctx.lineTo(s * 0.62, s * 0.05); ctx.lineTo(0, s * 0.38); ctx.lineTo(-s * 0.62, s * 0.05); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, s * 0.5); ctx.lineTo(s * 0.62, s * 0.18); ctx.lineTo(0, s); ctx.lineTo(-s * 0.62, s * 0.18); ctx.closePath(); ctx.fill();
      break;
    }
    case 'cup': {
      ctx.beginPath(); ctx.moveTo(-s * 0.6, -s * 0.2); ctx.lineTo(s * 0.5, -s * 0.2); ctx.lineTo(s * 0.4, s * 0.7); ctx.lineTo(-s * 0.5, s * 0.7); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.62, s * 0.18, s * 0.25, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.2, -s * 0.45); ctx.quadraticCurveTo(0, -s * 0.75, -s * 0.1, -s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.15, -s * 0.45); ctx.quadraticCurveTo(s * 0.35, -s * 0.75, s * 0.25, -s); ctx.stroke();
      break;
    }
    case 'gear': {
      for (let i = 0; i < 8; i++) {
        ctx.save(); ctx.rotate((i / 8) * Math.PI * 2); ctx.fillRect(-s * 0.16, -s, s * 0.32, s * 0.4); ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0, 0, s * 0.68, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'chain': {
      ctx.lineWidth = size * 0.14;
      ctx.beginPath(); ctx.ellipse(-s * 0.35, 0, s * 0.45, s * 0.28, -0.6, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(s * 0.35, 0, s * 0.45, s * 0.28, -0.6, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'book': {
      ctx.beginPath(); ctx.moveTo(0, -s * 0.6); ctx.quadraticCurveTo(-s * 0.5, -s * 0.85, -s, -s * 0.6); ctx.lineTo(-s, s * 0.7); ctx.quadraticCurveTo(-s * 0.5, s * 0.45, 0, s * 0.7); ctx.quadraticCurveTo(s * 0.5, s * 0.45, s, s * 0.7); ctx.lineTo(s, -s * 0.6); ctx.quadraticCurveTo(s * 0.5, -s * 0.85, 0, -s * 0.6); ctx.fill();
      break;
    }
    case 'wave': {
      ctx.lineWidth = size * 0.13;
      for (const o of [-0.35, 0.2]) {
        ctx.beginPath();
        for (let i = -1; i <= 1.001; i += 0.1) {
          const px = i * s, py = o * s + Math.sin(i * Math.PI * 1.5) * s * 0.2;
          i === -1 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      break;
    }
    case 'pick': {
      ctx.lineWidth = size * 0.12;
      ctx.beginPath(); ctx.moveTo(-s * 0.7, s * 0.8); ctx.lineTo(s * 0.4, -s * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.2, -s * 0.8); ctx.quadraticCurveTo(s * 0.6, -s * 0.7, s * 0.9, s * 0.1); ctx.stroke();
      break;
    }
    case 'antenna': {
      ctx.lineWidth = size * 0.1;
      ctx.beginPath(); ctx.moveTo(0, s); ctx.lineTo(0, -s * 0.3); ctx.stroke();
      for (const r of [0.35, 0.65]) {
        ctx.beginPath(); ctx.arc(0, -s * 0.3, s * r, -Math.PI * 0.85, -Math.PI * 0.15); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, -s * 0.3, s * 0.12, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'art': {
      ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.82, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      for (const [px, py] of [[-0.4, -0.3], [0, -0.45], [0.4, -0.25], [0.45, 0.2]]) {
        ctx.beginPath(); ctx.arc(px * s, py * s, s * 0.14, 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(-s * 0.35, s * 0.35, s * 0.2, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'fuel': {
      ctx.fillRect(-s * 0.6, -s * 0.8, s * 0.9, s * 1.6);
      ctx.lineWidth = size * 0.1;
      ctx.beginPath(); ctx.moveTo(s * 0.3, -s * 0.4); ctx.lineTo(s * 0.75, -s * 0.1); ctx.lineTo(s * 0.75, s * 0.5); ctx.stroke();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillRect(-s * 0.42, -s * 0.6, s * 0.54, s * 0.45);
      break;
    }
    case 'fish': {
      ctx.beginPath(); ctx.ellipse(-s * 0.1, 0, s * 0.65, s * 0.38, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s * 0.45, 0); ctx.lineTo(s, -s * 0.4); ctx.lineTo(s, s * 0.4); ctx.closePath(); ctx.fill();
      break;
    }
    case 'star': {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const rr = i % 2 === 0 ? s : s * 0.45;
        i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'house': {
      ctx.beginPath(); ctx.moveTo(-s, -s * 0.05); ctx.lineTo(0, -s * 0.9); ctx.lineTo(s, -s * 0.05); ctx.closePath(); ctx.fill();
      ctx.fillRect(-s * 0.7, -s * 0.1, s * 1.4, s * 0.95);
      break;
    }
  }
  ctx.restore();
}
