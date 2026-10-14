import type { EmblemShape } from "../market/assets";
import type { Candle } from "../market/MarketEngine";
import { fmtClock } from "../market/format";
import { FONT_MONO } from "../world/textures";

export const COLORS = {
  bg: "#0e1012",
  panel: "#15181b",
  panel2: "#1b1f23",
  line: "#272c31",
  grid: "#1f2428",
  text: "#e6e1d6",
  muted: "#8b9096",
  dim: "#5b6066",
  up: "#4fbf7f",
  down: "#e0605a",
  accent: "#d9a441",
  accentDim: "#7a5f2a",
};

export interface ChartOpts {
  count: number;
  volume?: boolean;
  axis?: boolean;
  timeAxis?: boolean;
  fontPx?: number;
  avgEntry?: number | null;
  decimals?: number;
  priceLine?: boolean;
  separators?: boolean;
  grid?: boolean;
  highlightLast?: boolean;
}

/** Draws OHLC candles + optional volume into a rectangle. Pure function of the market data. */
export function drawCandles(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, candles: readonly Candle[], o: ChartOpts) {
  const fs = o.fontPx ?? 12;
  const axisW = o.axis ? fs * 6.2 : 0;
  const timeH = o.timeAxis ? fs * 1.8 : 0;
  const volH = o.volume ? (h - timeH) * 0.18 : 0;
  const cw = w - axisW;
  const ph = h - timeH - volH;
  const n = Math.min(o.count, candles.length);
  if (n < 1) return;
  const vis = candles.slice(candles.length - n);
  let hi = -Infinity;
  let lo = Infinity;
  let vmax = 0;
  for (const c of vis) {
    if (c.h > hi) hi = c.h;
    if (c.l < lo) lo = c.l;
    if (c.v > vmax) vmax = c.v;
  }
  const pad = (hi - lo) * 0.08 || hi * 0.01;
  hi += pad;
  lo -= pad;
  const py = (p: number) => y + ((hi - p) / (hi - lo)) * ph;
  const step = cw / o.count;
  const bodyW = Math.max(1, step * 0.62);
  const x0 = x + cw - n * step;

  if (o.grid !== false) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 5; i++) {
      const gy = Math.round(y + (ph * i) / 5) + 0.5;
      ctx.moveTo(x, gy);
      ctx.lineTo(x + cw, gy);
    }
    ctx.stroke();
  }

  // night separators
  if (o.separators) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = COLORS.accentDim;
    ctx.fillStyle = COLORS.accent;
    ctx.font = `600 ${fs * 0.85}px ${FONT_MONO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (let i = 1; i < vis.length; i++) {
      if (vis[i].night !== vis[i - 1].night) {
        const sx = Math.round(x0 + i * step) + 0.5;
        ctx.beginPath();
        ctx.moveTo(sx, y);
        ctx.lineTo(sx, y + ph + volH);
        ctx.stroke();
        ctx.fillText(vis[i].night > 0 ? `NIGHT ${vis[i].night}` : "", sx + 4, y + 4);
      }
    }
    ctx.restore();
  }

  for (let i = 0; i < vis.length; i++) {
    const c = vis[i];
    const cx = x0 + i * step + step / 2;
    const up = c.c >= c.o;
    ctx.strokeStyle = ctx.fillStyle = up ? COLORS.up : COLORS.down;
    ctx.lineWidth = Math.max(1, step * 0.12);
    ctx.beginPath();
    ctx.moveTo(cx, py(c.h));
    ctx.lineTo(cx, py(c.l));
    ctx.stroke();
    const by0 = py(Math.max(c.o, c.c));
    const by1 = py(Math.min(c.o, c.c));
    ctx.fillRect(cx - bodyW / 2, by0, bodyW, Math.max(1, by1 - by0));
    if (o.volume && vmax > 0) {
      const vh = (c.v / vmax) * volH * 0.9;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(cx - bodyW / 2, y + ph + volH - vh, bodyW, vh);
      ctx.globalAlpha = 1;
    }
  }

  const last = vis[vis.length - 1];
  if (o.highlightLast) {
    const cx = x0 + (vis.length - 1) * step + step / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - bodyW / 2 - 2, py(last.h) - 2, bodyW + 4, py(last.l) - py(last.h) + 4);
  }

  const dec = o.decimals ?? 4;
  if (o.avgEntry && o.avgEntry > 0) {
    const ay = py(o.avgEntry);
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 1.5;
    if (ay >= y && ay <= y + ph) {
      ctx.beginPath();
      ctx.moveTo(x, ay);
      ctx.lineTo(x + cw, ay);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.accent;
      ctx.font = `600 ${fs * 0.85}px ${FONT_MONO}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(`AVG ${o.avgEntry.toFixed(dec)}`, x + 6, ay - 3);
    } else {
      ctx.fillStyle = COLORS.accent;
      ctx.font = `600 ${fs * 0.85}px ${FONT_MONO}`;
      ctx.textAlign = "left";
      ctx.textBaseline = ay < y ? "top" : "bottom";
      ctx.fillText(`${ay < y ? "▲" : "▼"} AVG ${o.avgEntry.toFixed(dec)}`, x + 6, ay < y ? y + 4 : y + ph - 4);
    }
    ctx.restore();
  }

  if (o.priceLine !== false) {
    const ly = py(last.c);
    ctx.save();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = last.c >= last.o ? COLORS.up : COLORS.down;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(x, ly);
    ctx.lineTo(x + cw, ly);
    ctx.stroke();
    ctx.restore();
  }

  if (o.axis) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `400 ${fs * 0.9}px ${FONT_MONO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 5; i++) {
      const p = hi - ((hi - lo) * i) / 5;
      ctx.fillText(p.toFixed(dec), x + cw + 6, y + (ph * i) / 5);
    }
    // last price tag
    const ly = py(last.c);
    ctx.fillStyle = last.c >= last.o ? COLORS.up : COLORS.down;
    ctx.fillRect(x + cw + 1, ly - fs * 0.75, axisW - 2, fs * 1.5);
    ctx.fillStyle = "#0b0d0f";
    ctx.font = `600 ${fs * 0.9}px ${FONT_MONO}`;
    ctx.fillText(last.c.toFixed(dec), x + cw + 5, ly);
  }

  if (o.timeAxis) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `400 ${fs * 0.85}px ${FONT_MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const every = Math.max(1, Math.round(n / 6));
    for (let i = vis.length - 1; i >= 0; i -= every) {
      const cx = x0 + i * step + step / 2;
      if (cx < x + fs * 2) break;
      ctx.fillText(fmtClock(vis[i].label), cx, y + ph + volH + fs * 0.4);
    }
  }
}

export function drawSparkline(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, candles: readonly Candle[], n: number) {
  const vis = candles.slice(Math.max(0, candles.length - n));
  if (vis.length < 2) return;
  let hi = -Infinity;
  let lo = Infinity;
  for (const c of vis) {
    hi = Math.max(hi, c.c);
    lo = Math.min(lo, c.c);
  }
  const up = vis[vis.length - 1].c >= vis[0].c;
  ctx.strokeStyle = up ? COLORS.up : COLORS.down;
  ctx.lineWidth = Math.max(1.5, h * 0.05);
  ctx.beginPath();
  vis.forEach((c, i) => {
    const px = x + (i / (vis.length - 1)) * w;
    const py = y + h - ((c.c - lo) / (hi - lo || 1)) * h;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
}

/** Provisional, original placeholder emblems (simple geometry). Swap for verified art later via the registry. */
export function drawEmblem(ctx: CanvasRenderingContext2D, shape: EmblemShape, color: string, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#1d2125";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = r * 0.16;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const s = r * 0.55;
  ctx.beginPath();
  switch (shape) {
    case "delta":
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.95, s * 0.75);
      ctx.lineTo(-s * 0.95, s * 0.75);
      ctx.closePath();
      ctx.stroke();
      break;
    case "hook":
      ctx.moveTo(s * 0.35, -s);
      ctx.lineTo(s * 0.35, s * 0.25);
      ctx.arc(-s * 0.15, s * 0.25, s * 0.5, 0, Math.PI, false);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.65, s * 0.25);
      ctx.lineTo(-s * 0.4, -s * 0.05);
      ctx.stroke();
      break;
    case "ring":
      ctx.arc(0, 0, s * 0.85, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "bolt":
      ctx.moveTo(s * 0.2, -s);
      ctx.lineTo(-s * 0.5, s * 0.1);
      ctx.lineTo(0, s * 0.1);
      ctx.lineTo(-s * 0.2, s);
      ctx.lineTo(s * 0.5, -s * 0.15);
      ctx.lineTo(0, -s * 0.15);
      ctx.closePath();
      ctx.fill();
      break;
    case "whisker":
      ctx.arc(0, s * 0.15, s * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, -s * 0.2);
      ctx.lineTo(-s * 0.6, -s * 0.85);
      ctx.lineTo(-s * 0.1, -s * 0.42);
      ctx.moveTo(s * 0.5, -s * 0.2);
      ctx.lineTo(s * 0.6, -s * 0.85);
      ctx.lineTo(s * 0.1, -s * 0.42);
      ctx.stroke();
      ctx.beginPath();
      ctx.lineWidth = r * 0.07;
      for (const sx of [-1, 1]) {
        ctx.moveTo(sx * s * 0.25, s * 0.25);
        ctx.lineTo(sx * s * 1.05, s * 0.1);
        ctx.moveTo(sx * s * 0.25, s * 0.35);
        ctx.lineTo(sx * s * 1.05, s * 0.45);
      }
      ctx.stroke();
      break;
  }
  ctx.restore();
}
