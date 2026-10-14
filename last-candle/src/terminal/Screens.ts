import * as THREE from "three";
import { ASSETS } from "../market/assets";
import type { MarketEngine } from "../market/MarketEngine";
import { fmtClock, fmtPct, fmtPrice } from "../market/format";
import { FONT_MONO, FONT_UI, drawCandleMark } from "../world/textures";
import { COLORS, drawCandles, drawEmblem, drawSparkline } from "./chart";

function makeTex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Every other screen in the room: NPC monitors (one mini chart per asset,
 * shared), idle screensavers, the big screen, second monitor overview and the
 * counter's session timer CRT. All of them read the same MarketEngine.
 */
export class Screens {
  readonly mini = new Map<string, { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture }>();
  readonly saver: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture };
  readonly big: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture };
  readonly overview: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture };
  readonly timers: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture };
  private miniIdx = 0;
  private miniT = 0;
  private bigT = 0;
  private slowT = 0;
  bigFocus = ASSETS[0].id;
  private bigFocusUntil = 0;
  private bigBanner: { text: string; up: boolean; until: number } | null = null;
  private rotateT = 0;
  timerRows: () => { label: string; who: string; time: string }[] = () => [];
  clock: () => { minute: number; night: number } = () => ({ minute: 0, night: 1 });

  constructor(private market: MarketEngine) {
    for (const a of ASSETS) {
      const c = document.createElement("canvas");
      c.width = 384;
      c.height = 288;
      this.mini.set(a.id, { canvas: c, tex: makeTex(c) });
    }
    const mk = (w: number, h: number) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      return { canvas: c, tex: makeTex(c) };
    };
    this.saver = mk(320, 240);
    this.big = mk(1024, 576);
    this.overview = mk(512, 384);
    this.timers = mk(256, 192);
    this.drawSaver(0);
    for (const a of ASSETS) this.drawMini(a.id);
    this.drawBig(0);
    this.drawOverview();
  }

  /** Focus the big screen on a token for a while (e.g. during a big move). */
  focusBig(assetId: string, banner: string, up: boolean, now: number) {
    this.bigFocus = assetId;
    this.bigFocusUntil = now + 25;
    this.bigBanner = { text: banner, up, until: now + 9 };
    this.drawBig(now);
    this.big.tex.needsUpdate = true;
  }

  update(dt: number, now: number) {
    // round-robin mini charts: each ~0.6s
    this.miniT += dt;
    if (this.miniT > 0.12) {
      this.miniT = 0;
      const a = ASSETS[this.miniIdx % ASSETS.length];
      this.miniIdx++;
      this.drawMini(a.id);
      this.mini.get(a.id)!.tex.needsUpdate = true;
    }
    this.bigT += dt;
    if (this.bigT > 0.25) {
      this.bigT = 0;
      this.rotateT += 0.25;
      if (now > this.bigFocusUntil && this.rotateT > 14) {
        this.rotateT = 0;
        const i = ASSETS.findIndex((a) => a.id === this.bigFocus);
        this.bigFocus = ASSETS[(i + 1) % ASSETS.length].id;
      }
      this.drawBig(now);
      this.big.tex.needsUpdate = true;
    }
    this.slowT += dt;
    if (this.slowT > 1) {
      this.slowT = 0;
      this.drawSaver(now);
      this.saver.tex.needsUpdate = true;
      this.drawOverview();
      this.overview.tex.needsUpdate = true;
      this.drawTimers(now);
      this.timers.tex.needsUpdate = true;
    }
  }

  private drawMini(id: string) {
    const { canvas } = this.mini.get(id)!;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width;
    const H = canvas.height;
    const a = ASSETS.find((x) => x.id === id)!;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#0a0b0c";
    ctx.fillRect(0, 0, W, 40);
    drawEmblem(ctx, a.emblem.shape, a.emblem.color, 22, 20, 14);
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 20px ${FONT_UI}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(a.symbol, 42, 20);
    const p = this.market.price(id);
    const ch = this.market.changePct(id, 60);
    ctx.textAlign = "right";
    ctx.font = `600 18px ${FONT_MONO}`;
    ctx.fillStyle = ch >= 0 ? COLORS.up : COLORS.down;
    ctx.fillText(`${fmtPrice(p, a.decimals)} ${fmtPct(ch, 1)}`, W - 10, 20);
    drawCandles(ctx, 8, 48, W - 16, H - 56, this.market.candles(id), { count: 42, volume: true, axis: false, fontPx: 12, grid: true });
  }

  private drawSaver(now: number) {
    const ctx = this.saver.canvas.getContext("2d")!;
    const W = this.saver.canvas.width;
    const H = this.saver.canvas.height;
    ctx.fillStyle = "#07080a";
    ctx.fillRect(0, 0, W, H);
    const t = now * 0.35;
    const x = W / 2 + Math.sin(t) * W * 0.25;
    const y = H / 2 + Math.sin(t * 1.3 + 1) * H * 0.18;
    drawCandleMark(ctx, x, y, 60, Math.floor(now / 6) % 2 ? "#3a8a5c" : "#b8443f");
    ctx.fillStyle = "#6b6f75";
    ctx.font = `600 15px ${FONT_MONO}`;
    ctx.textAlign = "center";
    ctx.fillText("FREE • 5 CR / HOUR", W / 2, H - 22);
  }

  private drawBig(now: number) {
    const { canvas } = this.big;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = "#0b0c0e";
    ctx.fillRect(0, 0, W, H);
    const id = this.bigFocus;
    const a = ASSETS.find((x) => x.id === id)!;
    const listW = 300;
    // left: focused chart
    drawEmblem(ctx, a.emblem.shape, a.emblem.color, 34, 34, 20);
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 34px ${FONT_UI}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(a.name, 64, 34);
    const p = this.market.price(id);
    const ch = this.market.changePct(id, 60);
    ctx.font = `600 30px ${FONT_MONO}`;
    ctx.textAlign = "right";
    ctx.fillStyle = ch >= 0 ? COLORS.up : COLORS.down;
    ctx.fillText(fmtPrice(p, a.decimals), W - listW - 24, 30);
    ctx.font = `500 18px ${FONT_MONO}`;
    ctx.fillText(`${fmtPct(ch)} 1h`, W - listW - 24, 58);
    drawCandles(ctx, 16, 76, W - listW - 40, H - 120, this.market.candles(id), {
      count: 60,
      volume: true,
      axis: true,
      timeAxis: true,
      fontPx: 14,
      decimals: a.decimals,
      separators: true,
      highlightLast: true,
    });
    // right: ticker list
    const lx = W - listW;
    ctx.fillStyle = "#121417";
    ctx.fillRect(lx, 0, listW, H);
    ASSETS.forEach((b, i) => {
      const y = 22 + i * ((H - 70) / ASSETS.length);
      const rowH = (H - 70) / ASSETS.length;
      if (b.id === id) {
        ctx.fillStyle = "#1c2024";
        ctx.fillRect(lx, y - 8, listW, rowH);
        ctx.fillStyle = COLORS.accent;
        ctx.fillRect(lx, y - 8, 5, rowH);
      }
      drawEmblem(ctx, b.emblem.shape, b.emblem.color, lx + 30, y + rowH / 2 - 8, 15);
      ctx.fillStyle = COLORS.text;
      ctx.font = `700 22px ${FONT_UI}`;
      ctx.textAlign = "left";
      ctx.fillText(b.symbol, lx + 54, y + rowH / 2 - 20);
      const bp = this.market.price(b.id);
      const bc = this.market.changePct(b.id, 60);
      ctx.font = `500 17px ${FONT_MONO}`;
      ctx.fillStyle = bc >= 0 ? COLORS.up : COLORS.down;
      ctx.fillText(`${fmtPrice(bp, b.decimals)}  ${fmtPct(bc, 1)}`, lx + 54, y + rowH / 2 + 4);
      drawSparkline(ctx, lx + 54, y + rowH / 2 + 18, listW - 80, 16, this.market.candles(b.id), 40);
    });
    // footer
    const c = this.clock();
    ctx.fillStyle = "#08090a";
    ctx.fillRect(0, H - 34, W, 34);
    ctx.fillStyle = COLORS.dim;
    ctx.font = `500 15px ${FONT_MONO}`;
    ctx.textAlign = "left";
    ctx.fillText("SIMULATED MARKET • VIRTUAL FUNDS • NOT FINANCIAL ANYTHING", 14, H - 17);
    ctx.textAlign = "right";
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`${fmtClock(c.minute)}  NIGHT ${c.night}`, W - 14, H - 17);

    if (this.bigBanner && this.bigBanner.until > now) {
      const blink = Math.floor(now * 3) % 2 === 0;
      ctx.fillStyle = this.bigBanner.up ? "rgba(79,191,127,0.92)" : "rgba(224,96,90,0.92)";
      ctx.fillRect(16, H - 92, W - listW - 40, 46);
      ctx.fillStyle = "#0b0c0e";
      ctx.font = `700 26px ${FONT_UI}`;
      ctx.textAlign = "center";
      ctx.fillText((blink ? "● " : "  ") + this.bigBanner.text, 16 + (W - listW - 40) / 2, H - 68);
    }
  }

  private drawOverview() {
    const { canvas } = this.overview;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `600 16px ${FONT_MONO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("OVERVIEW • ALL TOKENS", 12, 16);
    const rh = (H - 34) / ASSETS.length;
    ASSETS.forEach((a, i) => {
      const y = 32 + i * rh;
      drawEmblem(ctx, a.emblem.shape, a.emblem.color, 22, y + rh / 2, 13);
      ctx.fillStyle = COLORS.text;
      ctx.font = `700 18px ${FONT_UI}`;
      ctx.fillText(a.symbol, 42, y + rh / 2 - 9);
      const ch = this.market.changePct(a.id, 60);
      ctx.font = `500 14px ${FONT_MONO}`;
      ctx.fillStyle = ch >= 0 ? COLORS.up : COLORS.down;
      ctx.fillText(fmtPct(ch, 1), 42, y + rh / 2 + 11);
      drawCandles(ctx, 130, y + 4, W - 140, rh - 8, this.market.candles(a.id), { count: 50, axis: false, grid: false, priceLine: false });
    });
  }

  private drawTimers(now: number) {
    const { canvas } = this.timers;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = "#06120a";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#7dff9e";
    ctx.font = `600 15px ${FONT_MONO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("SESSIONS", 10, 8);
    const rows = this.timerRows();
    rows.slice(0, 9).forEach((r, i) => {
      ctx.fillStyle = r.who === "—" ? "#2f6b40" : "#7dff9e";
      ctx.fillText(`${r.label} ${r.who.padEnd(10).slice(0, 10)} ${r.time}`, 10, 30 + i * 17);
    });
    if (Math.floor(now * 2) % 2) ctx.fillRect(W - 18, 10, 8, 14);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  }
}
