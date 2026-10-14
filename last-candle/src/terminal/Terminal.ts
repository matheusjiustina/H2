import * as THREE from "three";
import { ASSETS, MARKET_RULES } from "../market/assets";
import type { MarketEngine } from "../market/MarketEngine";
import { formatQty, type Portfolio, type TradeRecord } from "../market/Portfolio";
import { fmtClock, fmtPct, fmtPrice, fmtUsd, fmtVol } from "../market/format";
import { FONT_MONO, FONT_UI, drawCandleMark } from "../world/textures";
import { COLORS, drawCandles, drawEmblem, drawSparkline } from "./chart";

export interface OrderOutcome {
  ok: boolean;
  message: string;
}

export interface TerminalContext {
  market: MarketEngine;
  portfolio: Portfolio;
  stationLabel(): string;
  clockMinute(): number;
  night(): number;
  session(): { text: string; low: boolean; closeOnly: boolean };
  goals(): { text: string; done: boolean }[];
  credits(): number;
  rep(): { value: number; title: string };
  buy(assetId: string, usd: number): OrderOutcome;
  sell(assetId: string, usd: number): OrderOutcome;
  sellAll(assetId: string): OrderOutcome;
  coach(): string | null;
  crt(): boolean;
  wide(): boolean;
  printed(id: number): boolean;
  onClick(): void;
}

interface Btn {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  enabled: boolean;
  action: () => void;
}

type Tab = "positions" | "history" | "goals";

const PRESETS: (number | "MAX")[] = [10, 25, 50, 100, 250, "MAX"];

/**
 * The in-world trading terminal. Rendered into a canvas used as the monitor
 * texture; pointer input arrives as canvas pixel coordinates from a raycast on
 * the screen mesh, so the cursor really clicks the 3D monitor.
 */
export class Terminal {
  readonly canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  W = 1280;
  H = 970;
  selected = ASSETS[0].id;
  size = 50;
  private editing = false;
  private editBuf = "";
  tab: Tab = "positions";
  private hover: { x: number; y: number } | null = null;
  private buttons: Btn[] = [];
  private toast: { text: string; good: boolean; until: number } | null = null;
  private flash: { side: "BUY" | "SELL"; until: number } | null = null;
  private lastDraw = 0;
  active = false;
  private now = 0;

  constructor(private c: TerminalContext) {
    this.ctx = this.canvas.getContext("2d")!;
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
  }

  setResolution(px: [number, number]) {
    if (px[0] === this.W && px[1] === this.H) return;
    this.W = px[0];
    this.H = px[1];
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.texture.dispose();
    this.texture.image = this.canvas;
    this.texture.needsUpdate = true;
    this.lastDraw = 0;
  }

  // ------------------------------------------------------------------ input

  /** u,v from a raycast hit on the screen plane (0..1). */
  pointer(u: number, v: number) {
    this.hover = { x: u * this.W, y: (1 - v) * this.H };
  }

  pointerLeave() {
    this.hover = null;
  }

  click(): boolean {
    if (!this.hover) return false;
    const { x, y } = this.hover;
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        if (b.enabled) {
          b.action();
          this.c.onClick();
        }
        this.lastDraw = 0;
        return true;
      }
    }
    if (this.editing) this.commitEdit();
    return false;
  }

  key(code: string): boolean {
    if (this.editing) {
      if (code.startsWith("Digit") || code.startsWith("Numpad")) {
        const d = code.replace("Digit", "").replace("Numpad", "");
        if (/^[0-9]$/.test(d) && this.editBuf.length < 7) this.editBuf += d;
      } else if (code === "Backspace") this.editBuf = this.editBuf.slice(0, -1);
      else if (code === "Enter" || code === "NumpadEnter") this.commitEdit();
      else if (code === "Escape") {
        this.editing = false;
        return true; // consumed: don't stand up
      }
      this.lastDraw = 0;
      return true;
    }
    const idx = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"].indexOf(code);
    if (idx >= 0 && ASSETS[idx]) {
      this.selected = ASSETS[idx].id;
    } else if (code === "KeyB") this.doBuy();
    else if (code === "KeyS") this.doSell();
    else if (code === "KeyX") this.doSellAll();
    else if (code === "Equal" || code === "NumpadAdd" || code === "ArrowUp") this.bump(1);
    else if (code === "Minus" || code === "NumpadSubtract" || code === "ArrowDown") this.bump(-1);
    else if (code === "Tab") this.tab = this.tab === "positions" ? "history" : this.tab === "history" ? "goals" : "positions";
    else return false;
    this.lastDraw = 0;
    return true;
  }

  private commitEdit() {
    const v = parseInt(this.editBuf || "0", 10);
    if (v > 0) this.size = v;
    this.editing = false;
    this.editBuf = "";
  }

  private bump(dir: number) {
    const step = this.size < 50 ? 5 : this.size < 200 ? 10 : 50;
    this.size = Math.max(1, Math.round((this.size + dir * step) / step) * step);
  }

  private doBuy() {
    const r = this.c.buy(this.selected, this.size);
    this.showToast(r.message, r.ok);
    if (r.ok) this.flash = { side: "BUY", until: this.now + 0.6 };
  }

  private doSell() {
    const r = this.c.sell(this.selected, this.size);
    this.showToast(r.message, r.ok);
    if (r.ok) this.flash = { side: "SELL", until: this.now + 0.6 };
  }

  private doSellAll() {
    const r = this.c.sellAll(this.selected);
    this.showToast(r.message, r.ok);
    if (r.ok) this.flash = { side: "SELL", until: this.now + 0.6 };
  }

  showToast(text: string, good: boolean) {
    this.toast = { text, good, until: this.now + 3.2 };
    this.lastDraw = 0;
  }

  // ------------------------------------------------------------------ drawing

  /** Redraw if due. Returns true if the texture changed. */
  update(now: number, hz: number): boolean {
    this.now = now;
    if (now - this.lastDraw < 1 / hz) return false;
    this.lastDraw = now;
    this.draw();
    this.texture.needsUpdate = true;
    return true;
  }

  private btn(id: string, x: number, y: number, w: number, h: number, action: () => void, enabled = true): boolean {
    this.buttons.push({ id, x, y, w, h, action, enabled });
    const hv = this.hover;
    return !!hv && enabled && hv.x >= x && hv.x <= x + w && hv.y >= y && hv.y <= y + h;
  }

  private text(t: string, x: number, y: number, size: number, color: string, opts: { font?: string; weight?: number; align?: CanvasTextAlign; base?: CanvasTextBaseline; maxW?: number } = {}) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.font = `${opts.weight ?? 500} ${size}px ${opts.font ?? FONT_UI}`;
    ctx.textAlign = opts.align ?? "left";
    ctx.textBaseline = opts.base ?? "middle";
    ctx.fillText(t, x, y, opts.maxW);
  }

  private panel(x: number, y: number, w: number, h: number, title?: string) {
    const ctx = this.ctx;
    const u = this.H / 100;
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (title) this.text(title, x + u * 1.4, y + u * 2.2, u * 1.7, COLORS.muted, { font: FONT_MONO, weight: 600 });
  }

  draw() {
    const ctx = this.ctx;
    const { W, H } = this;
    const u = H / 100;
    const m = this.c.market;
    const pf = this.c.portfolio;
    this.buttons = [];
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    // ----------------------------------------------------------- header
    const hh = u * 6;
    ctx.fillStyle = "#0a0b0c";
    ctx.fillRect(0, 0, W, hh);
    drawCandleMark(ctx, u * 2.6, hh / 2 + u * 0.4, u * 4.2);
    this.text("LAST CANDLE", u * 4.6, hh / 2, u * 2.4, COLORS.text, { weight: 700 });
    this.text(`TERMINAL • ${this.c.stationLabel()}`, u * 22, hh / 2, u * 1.6, COLORS.muted, { font: FONT_MONO });
    this.text("SIMULATED MARKET • VIRTUAL FUNDS", W / 2 + u * 6, hh / 2, u * 1.45, COLORS.dim, { font: FONT_MONO, align: "center" });
    const ses = this.c.session();
    this.text(`${fmtClock(this.c.clockMinute())} • NIGHT ${this.c.night()}`, W - u * 1.5, hh / 2 - u * 1.1, u * 1.6, COLORS.text, { font: FONT_MONO, align: "right", weight: 600 });
    this.text(ses.text, W - u * 1.5, hh / 2 + u * 1.3, u * 1.35, ses.low ? COLORS.down : COLORS.muted, { font: FONT_MONO, align: "right" });

    const wide = W / H > 1.45;
    const leftW = W * (wide ? 0.21 : 0.25);
    const rightW = W * (wide ? 0.25 : 0.28);
    const gap = u * 0.8;
    const top = hh + gap;
    const centerX = leftW + gap * 2;
    const centerW = W - leftW - rightW - gap * 4;
    const rightX = W - rightW - gap;
    const bottomH = H * 0.3;
    const mainH = H - top - bottomH - gap * 2;

    // ----------------------------------------------------------- watchlist
    const wlH = u * 9.6;
    this.panel(gap, top, leftW, wlH * ASSETS.length + u * 4.5, "WATCHLIST");
    ASSETS.forEach((a, i) => {
      const y = top + u * 4.5 + i * wlH;
      const sel = a.id === this.selected;
      const hov = this.btn(`wl-${a.id}`, gap, y, leftW, wlH, () => (this.selected = a.id));
      if (sel || hov) {
        ctx.fillStyle = sel ? COLORS.panel2 : "#181c20";
        ctx.fillRect(gap + 1, y, leftW - 2, wlH);
        if (sel) {
          ctx.fillStyle = COLORS.accent;
          ctx.fillRect(gap + 1, y, u * 0.45, wlH);
        }
      }
      const q = m.quote(a.id);
      const ch = m.changePct(a.id, 60);
      drawEmblem(ctx, a.emblem.shape, a.emblem.color, gap + u * 3.4, y + wlH / 2, u * 2.3);
      this.text(a.symbol, gap + u * 6.6, y + wlH * 0.33, u * 2.0, COLORS.text, { weight: 700 });
      this.text(a.name, gap + u * 6.6, y + wlH * 0.66, u * 1.45, COLORS.muted);
      this.text(fmtPrice(q.mid, a.decimals), gap + leftW - u * 1.2, y + wlH * 0.33, u * 1.85, COLORS.text, { font: FONT_MONO, align: "right", weight: 600 });
      this.text(fmtPct(ch), gap + leftW - u * 1.2, y + wlH * 0.68, u * 1.5, ch >= 0 ? COLORS.up : COLORS.down, { font: FONT_MONO, align: "right" });
      if (leftW > u * 26) drawSparkline(ctx, gap + leftW * 0.5, y + wlH * 0.25, leftW * 0.18, wlH * 0.5, m.candles(a.id), 40);
      // tiny position marker
      if (pf.position(a.id)) {
        ctx.fillStyle = COLORS.accent;
        ctx.beginPath();
        ctx.arc(gap + u * 5.6, y + wlH * 0.25, u * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // account box
    const accY = top + wlH * ASSETS.length + u * 4.5 + gap;
    const accH = H - accY - gap;
    this.panel(gap, accY, leftW, accH, "ACCOUNT");
    const quoteOf = (id: string) => m.quote(id);
    const eq = pf.equity(quoteOf);
    const ur = pf.unrealizedTotal(quoteOf);
    const rows: [string, string, string][] = [
      ["Balance", fmtUsd(pf.cash), COLORS.text],
      ["Equity", fmtUsd(eq), COLORS.text],
      ["Unrealized", fmtUsd(ur, true), ur >= 0 ? COLORS.up : COLORS.down],
      ["Realized", fmtUsd(pf.realizedTotal, true), pf.realizedTotal >= 0 ? COLORS.up : COLORS.down],
      ["Fees paid", fmtUsd(pf.feesTotal), COLORS.muted],
    ];
    const rowH = Math.min(u * 3.6, (accH - u * 5) / rows.length);
    rows.forEach(([k, v, col], i) => {
      const y = accY + u * 5 + i * rowH + rowH / 2;
      this.text(k, gap + u * 1.4, y, u * 1.6, COLORS.muted);
      this.text(v, gap + leftW - u * 1.4, y, u * 1.8, col, { font: FONT_MONO, align: "right", weight: 600 });
    });
    const rep = this.c.rep();
    if (accH > u * 26) {
      this.text(`◆ ${this.c.credits()} CR   REP ${rep.value} • ${rep.title}`, gap + u * 1.4, accY + accH - u * 2, u * 1.35, COLORS.accent, { font: FONT_MONO, maxW: leftW - u * 2.8 });
    }

    // ----------------------------------------------------------- chart
    const a = ASSETS.find((x) => x.id === this.selected)!;
    const q = m.quote(a.id);
    const pos = pf.position(a.id);
    this.panel(centerX, top, centerW, mainH);
    drawEmblem(ctx, a.emblem.shape, a.emblem.color, centerX + u * 3.6, top + u * 4, u * 2.6);
    this.text(a.name, centerX + u * 7, top + u * 3, u * 2.8, COLORS.text, { weight: 700 });
    this.text(`${a.symbol} • ${a.blurb}`, centerX + u * 7, top + u * 6, u * 1.45, COLORS.muted, { maxW: centerW * 0.55 });
    const ch = m.changePct(a.id, 60);
    this.text(fmtPrice(q.mid, a.decimals), centerX + centerW - u * 1.5, top + u * 3, u * 3.2, ch >= 0 ? COLORS.up : COLORS.down, { font: FONT_MONO, align: "right", weight: 600 });
    this.text(`${fmtPct(ch)} 1h   VOL ${fmtVol(m.volume(a.id, 60))}`, centerX + centerW - u * 1.5, top + u * 6.2, u * 1.45, COLORS.muted, { font: FONT_MONO, align: "right" });
    const count = Math.max(30, Math.floor(centerW / (u * 1.55)));
    drawCandles(ctx, centerX + u * 1, top + u * 8.6, centerW - u * 2, mainH - u * 9.6, m.candles(a.id), {
      count,
      volume: true,
      axis: true,
      timeAxis: true,
      fontPx: u * 1.45,
      avgEntry: pos?.avgEntry ?? null,
      decimals: a.decimals,
      separators: true,
      highlightLast: true,
    });

    // ----------------------------------------------------------- order panel
    this.panel(rightX, top, rightW, mainH, "ORDER • SPOT");
    let y = top + u * 5;
    const px = rightX + u * 1.4;
    const pw = rightW - u * 2.8;
    this.text(`BID ${fmtPrice(q.bid, a.decimals)}`, px, y, u * 1.5, COLORS.down, { font: FONT_MONO });
    this.text(`ASK ${fmtPrice(q.ask, a.decimals)}`, px + pw, y, u * 1.5, COLORS.up, { font: FONT_MONO, align: "right" });
    y += u * 2.6;
    this.text(`spread ${(a.spreadBps / 100).toFixed(2)}% • fee ${(MARKET_RULES.feeRate * 100).toFixed(2)}%/side`, px, y, u * 1.25, COLORS.dim, { font: FONT_MONO });
    y += u * 3;

    // size field
    const fieldH = u * 5.2;
    const bw = fieldH;
    const minusHov = this.btn("minus", px, y, bw, fieldH, () => this.bump(-1));
    this.button(px, y, bw, fieldH, "−", minusHov, COLORS.panel2, COLORS.text);
    const plusHov = this.btn("plus", px + pw - bw, y, bw, fieldH, () => this.bump(1));
    this.button(px + pw - bw, y, bw, fieldH, "+", plusHov, COLORS.panel2, COLORS.text);
    const fx = px + bw + u * 0.6;
    const fw = pw - bw * 2 - u * 1.2;
    const fHov = this.btn("field", fx, y, fw, fieldH, () => {
      this.editing = !this.editing;
      this.editBuf = "";
    });
    ctx.fillStyle = this.editing ? "#22272c" : fHov ? "#1d2125" : "#191c20";
    ctx.fillRect(fx, y, fw, fieldH);
    ctx.strokeStyle = this.editing ? COLORS.accent : COLORS.line;
    ctx.strokeRect(fx + 0.5, y + 0.5, fw - 1, fieldH - 1);
    const shown = this.editing ? `$${this.editBuf}${Math.floor(this.now * 2) % 2 ? "▏" : " "}` : fmtUsd(this.size);
    this.text(shown, fx + fw / 2, y + fieldH / 2, u * 2.4, COLORS.text, { font: FONT_MONO, align: "center", weight: 600 });
    y += fieldH + u * 1;

    // presets
    const cols = 3;
    const pg = u * 0.6;
    const pbw = (pw - pg * (cols - 1)) / cols;
    const pbh = u * 3.6;
    PRESETS.forEach((p, i) => {
      const bx = px + (i % cols) * (pbw + pg);
      const by = y + Math.floor(i / cols) * (pbh + pg);
      const label = p === "MAX" ? "MAX" : `$${p}`;
      const h = this.btn(`preset-${label}`, bx, by, pbw, pbh, () => {
        this.editing = false;
        this.size = p === "MAX" ? Math.max(1, Math.floor(pf.maxBuyNotional())) : p;
      });
      const active = p !== "MAX" && this.size === p;
      this.button(bx, by, pbw, pbh, label, h, active ? "#2a2416" : COLORS.panel2, active ? COLORS.accent : COLORS.muted, u * 1.6);
    });
    y += pbh * 2 + pg + u * 1.6;

    const estQty = this.size / q.ask;
    const fee = this.size * MARKET_RULES.feeRate;
    this.text(`≈ ${formatQty(estQty)} ${a.symbol}`, px, y, u * 1.5, COLORS.muted, { font: FONT_MONO });
    this.text(`fee ${fmtUsd(fee)}`, px + pw, y, u * 1.5, COLORS.muted, { font: FONT_MONO, align: "right" });
    y += u * 2.8;

    // BUY / SELL
    const sbh = u * 6.2;
    const half = (pw - u * 0.8) / 2;
    const closeOnly = ses.closeOnly;
    const flashing = this.flash && this.flash.until > this.now ? this.flash.side : null;
    const buyHov = this.btn("buy", px, y, half, sbh, () => this.doBuy(), !closeOnly);
    this.button(px, y, half, sbh, closeOnly ? "BUY ✕" : "BUY", buyHov, closeOnly ? "#1e2622" : flashing === "BUY" ? "#6fe0a0" : buyHov ? "#5fd08f" : COLORS.up, "#08130d", u * 2.4, 700);
    const sellHov = this.btn("sell", px + half + u * 0.8, y, half, sbh, () => this.doSell(), !!pos);
    this.button(px + half + u * 0.8, y, half, sbh, "SELL", sellHov, !pos ? "#2a1e1d" : flashing === "SELL" ? "#ff8a84" : sellHov ? "#f0706a" : COLORS.down, pos ? "#1a0807" : "#5a4040", u * 2.4, 700);
    y += sbh + u * 0.8;
    const saHov = this.btn("sellall", px, y, pw, u * 3.6, () => this.doSellAll(), !!pos);
    this.button(px, y, pw, u * 3.6, pos ? `SELL ALL ${a.symbol}` : "NO POSITION", saHov, saHov ? "#2a1e1d" : COLORS.panel, pos ? COLORS.down : COLORS.dim, u * 1.6, 600, true);
    y += u * 3.6 + u * 1.4;

    // selected position summary
    if (pos && y < top + mainH - u * 6) {
      const val = pf.liquidationValue(a.id, q);
      const ur1 = pf.unrealized(a.id, q);
      const pct = ur1 / pos.costBasis;
      const lines: [string, string, string][] = [
        ["Holding", `${formatQty(pos.qty)} ${a.symbol}`, COLORS.text],
        ["Avg entry", fmtPrice(pos.avgEntry, a.decimals), COLORS.accent],
        ["Value", fmtUsd(val), COLORS.text],
        ["Unrealized", `${fmtUsd(ur1, true)} (${fmtPct(pct, 1)})`, ur1 >= 0 ? COLORS.up : COLORS.down],
      ];
      for (const [k, v, col] of lines) {
        if (y > top + mainH - u * 2.4) break;
        this.text(k, px, y, u * 1.45, COLORS.muted);
        this.text(v, px + pw, y, u * 1.6, col, { font: FONT_MONO, align: "right", weight: 600 });
        y += u * 2.6;
      }
    } else if (!pos) {
      this.text("Spot only. No leverage.", px, y, u * 1.4, COLORS.dim);
      y += u * 2.4;
      this.text("Keys: 1-5 B S X  ± size", px, y, u * 1.3, COLORS.dim, { font: FONT_MONO });
    }

    // toast (inside order panel top)
    if (this.toast && this.toast.until > this.now) {
      const tw = rightW - u * 1.6;
      const tx = rightX + u * 0.8;
      const ty = top + mainH - u * 6.5;
      ctx.fillStyle = this.toast.good ? "rgba(30,60,40,0.96)" : "rgba(70,28,26,0.96)";
      ctx.fillRect(tx, ty, tw, u * 5.6);
      ctx.strokeStyle = this.toast.good ? COLORS.up : COLORS.down;
      ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, u * 5.6 - 1);
      this.wrapText(this.toast.text, tx + u * 1, ty + u * 1.9, tw - u * 2, u * 1.5, COLORS.text, u * 1.9);
    }

    // ----------------------------------------------------------- bottom tabs
    const by = top + mainH + gap;
    const bx = centerX;
    const bwid = W - centerX - gap;
    this.panel(bx, by, bwid, bottomH);
    const tabs: [Tab, string][] = [
      ["positions", `POSITIONS (${pf.allPositions().length})`],
      ["history", "HISTORY"],
      ["goals", "NIGHT GOALS"],
    ];
    let tx = bx + u * 0.8;
    for (const [id, label] of tabs) {
      ctx.font = `600 ${u * 1.55}px ${FONT_MONO}`;
      const tw = ctx.measureText(label).width + u * 2.4;
      const h = this.btn(`tab-${id}`, tx, by + u * 0.6, tw, u * 3.4, () => (this.tab = id));
      ctx.fillStyle = this.tab === id ? COLORS.panel2 : h ? "#181c20" : "transparent";
      ctx.fillRect(tx, by + u * 0.6, tw, u * 3.4);
      if (this.tab === id) {
        ctx.fillStyle = COLORS.accent;
        ctx.fillRect(tx, by + u * 3.7, tw, u * 0.3);
      }
      this.text(label, tx + tw / 2, by + u * 2.3, u * 1.55, this.tab === id ? COLORS.text : COLORS.muted, { font: FONT_MONO, weight: 600, align: "center" });
      tx += tw + u * 0.6;
    }
    const tableY = by + u * 5.2;
    const tableH = bottomH - u * 5.6;
    if (this.tab === "positions") this.drawPositions(bx, tableY, bwid, tableH);
    else if (this.tab === "history") this.drawHistory(bx, tableY, bwid, tableH);
    else this.drawGoals(bx, tableY, bwid, tableH);

    // coach line (onboarding)
    const coach = this.c.coach();
    if (coach) {
      ctx.font = `600 ${u * 1.7}px ${FONT_UI}`;
      const cw = ctx.measureText(coach).width + u * 3;
      const cx = centerX + centerW / 2 - cw / 2;
      const cy = top + u * 9.5;
      ctx.fillStyle = "rgba(217,164,65,0.95)";
      ctx.fillRect(cx, cy, cw, u * 3.6);
      this.text(coach, cx + cw / 2, cy + u * 1.8, u * 1.7, "#1a1408", { align: "center", weight: 700 });
    }

    if (closeOnly) {
      ctx.fillStyle = "rgba(224,96,90,0.92)";
      ctx.fillRect(centerX, H - gap - bottomH - u * 3.6 - gap, centerW, u * 3.4);
      this.text("SESSION EXPIRED • CLOSE-ONLY MODE • extend time at the counter", centerX + centerW / 2, H - gap - bottomH - u * 1.9 - gap, u * 1.45, "#1a0807", { font: FONT_MONO, weight: 600, align: "center" });
    }

    // cursor
    if (this.hover && this.active) {
      const { x: hx, y: hy } = this.hover;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.fillStyle = "#f4efe4";
      ctx.strokeStyle = "#0a0b0c";
      ctx.lineWidth = u * 0.25;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, u * 3.2);
      ctx.lineTo(u * 0.85, u * 2.4);
      ctx.lineTo(u * 1.5, u * 3.8);
      ctx.lineTo(u * 2.0, u * 3.55);
      ctx.lineTo(u * 1.35, u * 2.2);
      ctx.lineTo(u * 2.4, u * 2.2);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    }

    if (this.c.crt()) this.crtOverlay();
  }

  private wrapText(t: string, x: number, y: number, maxW: number, size: number, color: string, lh: number) {
    const ctx = this.ctx;
    ctx.font = `600 ${size}px ${FONT_UI}`;
    const words = t.split(" ");
    let line = "";
    let yy = y;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        this.text(line, x, yy, size, color, { weight: 600 });
        line = w;
        yy += lh;
      } else line = test;
    }
    if (line) this.text(line, x, yy, size, color, { weight: 600 });
  }

  private button(x: number, y: number, w: number, h: number, label: string, hover: boolean, bg: string, fg: string, size?: number, weight = 600, outline = false) {
    const ctx = this.ctx;
    const u = this.H / 100;
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    if (outline || hover) {
      ctx.strokeStyle = hover ? "rgba(255,255,255,0.4)" : COLORS.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    this.text(label, x + w / 2, y + h / 2 + u * 0.1, size ?? u * 2.2, fg, { align: "center", weight, font: size && size < u * 2 ? FONT_MONO : FONT_UI });
  }

  private drawPositions(x: number, y: number, w: number, h: number) {
    const u = this.H / 100;
    const m = this.c.market;
    const pf = this.c.portfolio;
    const cols = [0, 0.16, 0.34, 0.5, 0.66, 0.84];
    const heads = ["TOKEN", "QTY", "AVG ENTRY", "LAST BID", "VALUE", "UNREALIZED"];
    heads.forEach((hd, i) => this.text(hd, x + u * 1.4 + cols[i] * (w - u * 2.8), y + u * 1, u * 1.3, COLORS.dim, { font: FONT_MONO, weight: 600 }));
    const ps = pf.allPositions();
    if (!ps.length) {
      this.text("No open positions. Positions keep running while you walk around.", x + u * 1.4, y + u * 5, u * 1.6, COLORS.muted);
      return;
    }
    const rh = u * 3.2;
    ps.slice(0, Math.floor((h - u * 3) / rh)).forEach((p, i) => {
      const a = ASSETS.find((z) => z.id === p.assetId)!;
      const q = m.quote(p.assetId);
      const ur = pf.unrealized(p.assetId, q);
      const yy = y + u * 4 + i * rh;
      const hov = this.btn(`pos-${p.assetId}`, x, yy - rh / 2, w, rh, () => (this.selected = p.assetId));
      if (hov || p.assetId === this.selected) {
        this.ctx.fillStyle = "#1a1e22";
        this.ctx.fillRect(x + 1, yy - rh / 2, w - 2, rh);
      }
      const vals = [a.symbol, formatQty(p.qty), fmtPrice(p.avgEntry, a.decimals), fmtPrice(q.bid, a.decimals), fmtUsd(pf.liquidationValue(p.assetId, q)), `${fmtUsd(ur, true)} ${fmtPct(ur / p.costBasis, 1)}`];
      vals.forEach((v, k) =>
        this.text(v, x + u * 1.4 + cols[k] * (w - u * 2.8), yy, u * 1.55, k === 5 ? (ur >= 0 ? COLORS.up : COLORS.down) : k === 0 ? COLORS.text : COLORS.muted, { font: FONT_MONO, weight: k === 0 || k === 5 ? 600 : 400 }),
      );
    });
  }

  private drawHistory(x: number, y: number, w: number, h: number) {
    const u = this.H / 100;
    const pf = this.c.portfolio;
    const cols = [0, 0.1, 0.2, 0.32, 0.48, 0.64, 0.78];
    const heads = ["#", "TIME", "SIDE", "TOKEN", "QTY @ PRICE", "FEE", "REALIZED"];
    heads.forEach((hd, i) => this.text(hd, x + u * 1.4 + cols[i] * (w - u * 2.8), y + u * 1, u * 1.3, COLORS.dim, { font: FONT_MONO, weight: 600 }));
    const hist = pf.history;
    if (!hist.length) {
      this.text("No trades yet. Closed trades can be printed at the counter.", x + u * 1.4, y + u * 5, u * 1.6, COLORS.muted);
      return;
    }
    const rh = u * 3.0;
    const max = Math.floor((h - u * 3) / rh);
    const list = hist.slice(-max).reverse();
    list.forEach((t: TradeRecord, i) => {
      const a = ASSETS.find((z) => z.id === t.assetId);
      const yy = y + u * 4 + i * rh;
      const dec = a?.decimals ?? 4;
      const r = t.realizedPnl;
      const vals = [
        String(t.id).padStart(3, "0") + (t.side === "SELL" && this.c.printed(t.id) ? "⎙" : ""),
        fmtClock(t.label),
        t.side,
        t.symbol,
        `${formatQty(t.qty)} @ ${t.price.toFixed(dec)}`,
        fmtUsd(t.fee),
        r === null ? "—" : fmtUsd(r, true),
      ];
      vals.forEach((v, k) => {
        let col = COLORS.muted;
        if (k === 2) col = t.side === "BUY" ? COLORS.up : COLORS.down;
        if (k === 6 && r !== null) col = r >= 0 ? COLORS.up : COLORS.down;
        if (k === 3) col = COLORS.text;
        this.text(v, x + u * 1.4 + cols[k] * (w - u * 2.8), yy, u * 1.5, col, { font: FONT_MONO });
      });
    });
  }

  private drawGoals(x: number, y: number, w: number, h: number) {
    const u = this.H / 100;
    const goals = this.c.goals();
    this.text("Tonight's goals — none of them need a win.", x + u * 1.4, y + u * 1, u * 1.4, COLORS.dim, { font: FONT_MONO });
    goals.forEach((g, i) => {
      const yy = y + u * 4.4 + i * u * 3.4;
      if (yy > y + h - u) return;
      this.text(g.done ? "■" : "□", x + u * 1.4, yy, u * 1.8, g.done ? COLORS.up : COLORS.muted, { font: FONT_MONO });
      this.text(g.text, x + u * 4, yy, u * 1.65, g.done ? COLORS.muted : COLORS.text, { maxW: w - u * 6 });
    });
  }

  private crtOverlay() {
    const ctx = this.ctx;
    const { W, H } = this;
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1.5);
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}
