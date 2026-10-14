import * as THREE from "three";
import type { TradeRecord } from "../market/Portfolio";
import { formatQty } from "../market/Portfolio";
import { fmtClock, fmtPct, fmtUsd } from "../market/format";
import { FONT_MONO, FONT_UI, drawCandleMark } from "../world/textures";

export interface ReceiptInfo {
  title: string;
  lines: [string, string][];
  pnl: number | null;
  pct: number | null;
  footer: string;
  who: string;
}

/** Real data of a closed (SELL) trade → receipt contents. */
export function receiptFromTrade(t: TradeRecord, decimals: number): ReceiptInfo {
  const pnl = t.realizedPnl ?? 0;
  const pct = t.costOfSold ? pnl / t.costOfSold : 0;
  return {
    title: `TRADE #${String(t.id).padStart(4, "0")}`,
    lines: [
      ["NIGHT", `${t.night} • ${fmtClock(t.label)}`],
      ["STATION", t.station],
      ["CLOSED", t.symbol],
      ["QTY", formatQty(t.qty)],
      ["AVG ENTRY", t.avgEntry !== null ? t.avgEntry.toFixed(decimals) : "—"],
      ["EXIT (BID)", t.price.toFixed(decimals)],
      ["COST", fmtUsd(t.costOfSold ?? 0)],
      ["PROCEEDS", fmtUsd(t.notional - t.fee)],
      ["SELL FEE", fmtUsd(t.fee)],
    ],
    pnl,
    pct,
    footer: t.closedPosition ? "POSITION CLOSED" : "PARTIAL CLOSE",
    who: "YOU",
  };
}

export function receiptTexture(r: ReceiptInfo): THREE.CanvasTexture {
  const W = 288;
  const H = 620;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f6f2e7";
  ctx.fillRect(0, 0, W, H);
  // thermal paper grain
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = `rgba(120,110,90,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 1);
  }
  ctx.fillStyle = "#1f1d1a";
  drawCandleMark(ctx, W / 2, 46, 52, "#1f1d1a");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 26px ${FONT_UI}`;
  ctx.fillText("LAST CANDLE", W / 2, 96);
  ctx.font = `400 13px ${FONT_MONO}`;
  ctx.fillText("DEGEN LAN HOUSE • 24H", W / 2, 118);
  ctx.fillText("SIMULATED MARKET • VIRTUAL FUNDS", W / 2, 136);
  const dash = (y: number) => {
    ctx.fillText("- - - - - - - - - - - - - - - - -", W / 2, y);
  };
  dash(156);
  ctx.font = `600 18px ${FONT_MONO}`;
  ctx.fillText(r.title, W / 2, 178);
  ctx.font = `400 15px ${FONT_MONO}`;
  let y = 206;
  for (const [k, v] of r.lines) {
    ctx.textAlign = "left";
    ctx.fillText(k, 18, y);
    ctx.textAlign = "right";
    ctx.fillText(v, W - 18, y);
    y += 24;
  }
  ctx.textAlign = "center";
  dash(y + 2);
  y += 30;
  if (r.pnl !== null) {
    ctx.font = `700 16px ${FONT_MONO}`;
    ctx.fillText("REALIZED P/L", W / 2, y);
    y += 34;
    ctx.font = `700 34px ${FONT_MONO}`;
    ctx.fillText(fmtUsd(r.pnl, true), W / 2, y);
    y += 30;
    ctx.font = `600 17px ${FONT_MONO}`;
    ctx.fillText(`${fmtPct(r.pct ?? 0)} • ${r.footer}`, W / 2, y);
  }
  y += 30;
  dash(y);
  ctx.font = `400 13px ${FONT_MONO}`;
  ctx.fillText(`TRADER: ${r.who}`, W / 2, y + 24);
  ctx.font = `italic 500 15px ${FONT_UI}`;
  ctx.fillText("“One more trade. Then we go home.”", W / 2, H - 46);
  ctx.font = `400 11px ${FONT_MONO}`;
  ctx.fillText("NOT REAL MONEY • NOT FINANCIAL ADVICE", W / 2, H - 20);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** An NPC's simulated closed trade, printed for the wall. */
export function npcReceipt(name: string, symbol: string, pct: number): ReceiptInfo {
  return {
    title: "TRADE • REGULAR",
    lines: [
      ["TRADER", name.toUpperCase()],
      ["CLOSED", symbol],
      ["NOTE", "simulated"],
    ],
    pnl: 100 * pct,
    pct,
    footer: "POSITION CLOSED",
    who: name.toUpperCase(),
  };
}
