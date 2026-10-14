import * as THREE from "three";
import { Rng } from "../core/rng";

/**
 * Procedural canvas textures. Everything visual in the game is generated here
 * (no external images), which keeps the identity original and the build small.
 */

export const FONT_UI = '"Space Grotesk", "Segoe UI", system-ui, sans-serif';
export const FONT_MONO = '"JetBrains Mono", "Consolas", ui-monospace, monospace';
export const FONT_HAND = '"Permanent Marker", "Comic Sans MS", cursive';

const rng = new Rng(1337);
let maxAniso = 4;
export const setMaxAnisotropy = (n: number) => (maxAniso = n);

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  return [c, ctx];
}

export function toTexture(c: HTMLCanvasElement, opts: { repeat?: [number, number]; srgb?: boolean; aniso?: boolean } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  t.anisotropy = opts.aniso === false ? 1 : maxAniso;
  t.needsUpdate = true;
  return t;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, alpha: number, dark = true) {
  const n = Math.floor(w * h * amount);
  for (let i = 0; i < n; i++) {
    const x = rng.next() * w;
    const y = rng.next() * h;
    const v = dark ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rng.next()})`;
    ctx.fillRect(x, y, 1 + rng.next() * 2, 1 + rng.next() * 2);
  }
}

function blotches(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, color: string, maxR: number) {
  for (let i = 0; i < count; i++) {
    const x = rng.next() * w;
    const y = rng.next() * h;
    const r = maxR * (0.3 + rng.next());
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

// ----------------------------------------------------------------- surfaces

export function floorTiles(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const n = 4; // 4x4 tiles per texture = 1.2m with 30cm tiles
  const ts = S / n;
  const tones = ["#73736f", "#6b6c6a", "#7b7a74", "#6f706d", "#807b70"];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = tones[Math.floor(rng.next() * tones.length)];
      ctx.fillRect(x * ts, y * ts, ts, ts);
      // speckle (vinyl chips)
      for (let i = 0; i < 220; i++) {
        ctx.fillStyle = rng.chance(0.5) ? "rgba(40,38,34,0.35)" : "rgba(200,195,185,0.25)";
        ctx.fillRect(x * ts + rng.next() * ts, y * ts + rng.next() * ts, 2, 2);
      }
    }
  blotches(ctx, S, S, 10, "rgba(30,25,20,0.12)", 90);
  ctx.strokeStyle = "rgba(25,22,18,0.55)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath();
    ctx.moveTo(i * ts, 0);
    ctx.lineTo(i * ts, S);
    ctx.moveTo(0, i * ts);
    ctx.lineTo(S, i * ts);
    ctx.stroke();
  }
  // scuffs
  ctx.strokeStyle = "rgba(20,18,15,0.25)";
  for (let i = 0; i < 26; i++) {
    ctx.lineWidth = 1 + rng.next() * 2;
    ctx.beginPath();
    const x = rng.next() * S;
    const y = rng.next() * S;
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + rng.range(-30, 30), y + rng.range(-10, 10), x + rng.range(-60, 60), y + rng.range(-20, 20));
    ctx.stroke();
  }
  return toTexture(c, { repeat: [1, 1] });
}

export function plaster(base = "#8c8a80", grime = 0.05): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  // paint roller streaks
  for (let x = 0; x < S; x += 24) {
    ctx.fillStyle = `rgba(${rng.chance(0.5) ? "255,255,255" : "0,0,0"},${0.006 + rng.next() * 0.01})`;
    ctx.fillRect(x, 0, 18 + rng.next() * 30, S);
  }
  blotches(ctx, S, S, 14, `rgba(60,55,45,${grime})`, 140);
  noise(ctx, S, S, 0.12, 0.06);
  noise(ctx, S, S, 0.05, 0.05, false);
  return toTexture(c, { repeat: [1, 1] });
}

export function ceilingTex(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = "#2b2a28";
  ctx.fillRect(0, 0, S, S);
  noise(ctx, S, S, 0.3, 0.2);
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, S, S);
  return toTexture(c, { repeat: [1, 1] });
}

export function woodTex(base = "#4a3424", line = "rgba(20,12,6,0.35)"): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = line;
    ctx.lineWidth = 0.6 + rng.next() * 1.8;
    ctx.beginPath();
    let y = rng.next() * H;
    ctx.moveTo(0, y);
    for (let x = 0; x <= W; x += 32) {
      y += rng.range(-2.5, 2.5);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  blotches(ctx, W, H, 6, "rgba(255,220,180,0.05)", 80);
  return toTexture(c, { repeat: [1, 1] });
}

export function laminateTex(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = "#b3ab98";
  ctx.fillRect(0, 0, S, S);
  noise(ctx, S, S, 0.25, 0.07);
  noise(ctx, S, S, 0.1, 0.06, false);
  blotches(ctx, S, S, 5, "rgba(80,60,40,0.1)", 60);
  // coffee ring
  ctx.strokeStyle = "rgba(90,60,30,0.18)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(170, 80, 22, 0.3, Math.PI * 1.8);
  ctx.stroke();
  return toTexture(c, { repeat: [1, 1] });
}

export function fabricTex(base: string): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  ctx.globalAlpha = 0.12;
  for (let y = 0; y < S; y += 3) {
    ctx.fillStyle = y % 6 === 0 ? "#000" : "#fff";
    ctx.fillRect(0, y, S, 1);
  }
  for (let x = 0; x < S; x += 3) {
    ctx.fillStyle = x % 6 === 0 ? "#000" : "#fff";
    ctx.fillRect(x, 0, 1, S);
  }
  ctx.globalAlpha = 1;
  blotches(ctx, S, S, 6, "rgba(0,0,0,0.15)", 60);
  return toTexture(c, { repeat: [2, 2] });
}

export function corkTex(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = "#a07848";
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = rng.chance(0.5) ? "rgba(70,45,20,0.5)" : "rgba(210,170,110,0.4)";
    ctx.fillRect(rng.next() * S, rng.next() * S, 1 + rng.next() * 3, 1 + rng.next() * 3);
  }
  return toTexture(c);
}

export function concreteTex(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = "#5c5a56";
  ctx.fillRect(0, 0, S, S);
  noise(ctx, S, S, 0.8, 0.2);
  blotches(ctx, S, S, 12, "rgba(0,0,0,0.12)", 50);
  return toTexture(c, { repeat: [1, 1] });
}

export function keyboardTex(mech = false): THREE.CanvasTexture {
  const W = 512;
  const H = 160;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = mech ? "#1c1c1e" : "#cfc6b0";
  ctx.fillRect(0, 0, W, H);
  const rows = 5;
  const kw = W / 15.5;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < 15; k++) {
      const x = 6 + k * kw + (r % 2) * 6;
      const y = 8 + r * (H - 12) / rows;
      let w = kw - 4;
      if (r === 4 && k === 4) w = kw * 6;
      if (r === 4 && k > 4 && k < 10) continue;
      ctx.fillStyle = mech ? (k === 0 && r === 0 ? "#c96d3a" : "#2e2e33") : rng.chance(0.08) ? "#b8ad94" : "#e3dbc7";
      ctx.fillRect(x, y, w, (H - 12) / rows - 5);
      ctx.fillStyle = mech ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.4)";
      ctx.fillRect(x, y, w, 3);
    }
  }
  if (!mech) {
    // worn keys
    blotches(ctx, W, H, 4, "rgba(60,50,30,0.15)", 30);
  }
  return toTexture(c);
}

// ----------------------------------------------------------------- signage

export function logoCanvas(w = 512, h = 256, onDark = true): HTMLCanvasElement {
  const [c, ctx] = canvas(w, h);
  if (!onDark) {
    ctx.fillStyle = "#e9e1cf";
    ctx.fillRect(0, 0, w, h);
  }
  drawLogo(ctx, w / 2, h / 2, h * 0.8, onDark);
  return c;
}

/** LAST CANDLE mark: a single candlestick whose wick ends in a small flame. */
export function drawCandleMark(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, bodyColor = "#d9534f") {
  ctx.save();
  ctx.translate(x, y);
  // wick
  ctx.strokeStyle = "#e8dcc4";
  ctx.lineWidth = s * 0.05;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.28);
  ctx.lineTo(0, s * 0.5);
  ctx.stroke();
  // body
  ctx.fillStyle = bodyColor;
  ctx.fillRect(-s * 0.15, -s * 0.18, s * 0.3, s * 0.52);
  // flame
  ctx.fillStyle = "#ffb347";
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.62);
  ctx.quadraticCurveTo(s * 0.16, -s * 0.38, 0, -s * 0.27);
  ctx.quadraticCurveTo(-s * 0.16, -s * 0.38, 0, -s * 0.62);
  ctx.fill();
  ctx.fillStyle = "#fff1c9";
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.48);
  ctx.quadraticCurveTo(s * 0.07, -s * 0.36, 0, -s * 0.3);
  ctx.quadraticCurveTo(-s * 0.07, -s * 0.36, 0, -s * 0.48);
  ctx.fill();
  ctx.restore();
}

export function drawLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number, h: number, onDark = true) {
  const fg = onDark ? "#efe6d2" : "#1d1b18";
  drawCandleMark(ctx, cx - h * 1.05, cy + h * 0.06, h * 0.75);
  ctx.fillStyle = fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${h * 0.34}px ${FONT_UI}`;
  ctx.fillText("LAST", cx - h * 0.72, cy - h * 0.02);
  ctx.fillText("CANDLE", cx - h * 0.72, cy + h * 0.3);
  ctx.font = `500 ${h * 0.09}px ${FONT_MONO}`;
  ctx.fillStyle = onDark ? "#b9a77f" : "#6b5a3a";
  ctx.fillText("DEGEN LAN HOUSE • 24H", cx - h * 0.71, cy + h * 0.44);
}

export function posterTex(kind: string, w = 512, h = 700): THREE.CanvasTexture {
  const [c, ctx] = canvas(w, h);
  const paper = (col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 8, "rgba(120,90,40,0.12)", 140);
    noise(ctx, w, h, 0.05, 0.1);
  };
  const center = (text: string, y: number, size: number, color: string, font = FONT_UI, weight = 700) => {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, y);
  };
  const left = (text: string, x: number, y: number, size: number, color: string, font = FONT_MONO, weight = 500) => {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  };
  switch (kind) {
    case "motto": {
      paper("#1e1c1a");
      drawCandleMark(ctx, w / 2, h * 0.32, h * 0.32);
      center("ONE MORE TRADE.", h * 0.62, w * 0.1, "#efe3c8");
      center("THEN WE GO HOME.", h * 0.74, w * 0.1, "#d9a441");
      center("— the house, every night since forever", h * 0.88, w * 0.035, "#8a8170", FONT_MONO, 400);
      break;
    }
    case "rules": {
      paper("#e7dfcb");
      center("HOUSE RULES", h * 0.09, w * 0.11, "#2a2520");
      const rules = [
        "1. No leverage talk before 2AM.",
        "2. Don't break the keyboards.",
        "3. Wins get printed.",
        "   Losses also get printed.",
        "4. If the chart looks like a cat,",
        "   it is not a signal.",
        "5. Feed the fridge, not the FUD.",
        "6. Go home eventually.",
      ];
      rules.forEach((r, i) => left(r, w * 0.07, h * 0.2 + i * h * 0.085, w * 0.042, "#2a2520"));
      center("— MGMT", h * 0.92, w * 0.05, "#7a2e22", FONT_HAND, 400);
      break;
    }
    case "prices": {
      paper("#202326");
      center("PRICE LIST", h * 0.1, w * 0.11, "#f3e9d2");
      const rows: [string, string][] = [
        ["PC TIME 1H", "5 CR"],
        ["NIGHT PASS", "20 CR"],
        ["INSTANT NOODLES", "3 CR"],
        ["OVERNIGHT ENERGY", "2 CR"],
        ["RECEIPT PRINT", "FREE"],
        ["FEELINGS", "NOT INCL."],
      ];
      rows.forEach(([a, b], i) => {
        left(a, w * 0.08, h * 0.24 + i * h * 0.1, w * 0.048, "#e8dcc0");
        ctx.textAlign = "right";
        ctx.fillStyle = "#d9a441";
        ctx.fillText(b, w * 0.92, h * 0.24 + i * h * 0.1);
      });
      center("all trading here is SIMULATED", h * 0.9, w * 0.038, "#8a8f94", FONT_MONO, 400);
      break;
    }
    case "food": {
      paper("#f0e6c8");
      ctx.fillStyle = "#b8332a";
      ctx.fillRect(0, 0, w, h * 0.2);
      center("NOTICE", h * 0.1, w * 0.12, "#fff4dc");
      center("CANDLES ARE", h * 0.38, w * 0.1, "#2a2520");
      center("NOT A FOOD", h * 0.5, w * 0.1, "#2a2520");
      center("GROUP", h * 0.62, w * 0.1, "#2a2520");
      center("(eat the noodles)", h * 0.8, w * 0.05, "#7a2e22", FONT_HAND, 400);
      break;
    }
    case "employee": {
      paper("#ded5bf");
      center("EMPLOYEE OF", h * 0.08, w * 0.08, "#2a2520");
      center("THE MONTH", h * 0.16, w * 0.08, "#2a2520");
      ctx.strokeStyle = "#2a2520";
      ctx.lineWidth = 6;
      ctx.strokeRect(w * 0.2, h * 0.24, w * 0.6, h * 0.42);
      center("?", h * 0.45, w * 0.3, "#9a8f78");
      center("BUY HIGH,", h * 0.75, w * 0.07, "#2a2520");
      center("SELL LOWER", h * 0.84, w * 0.07, "#b8332a");
      break;
    }
    case "grass": {
      paper("#27402c");
      center("IN CASE OF DUMP", h * 0.2, w * 0.085, "#e9f0d8");
      center("TOUCH GRASS", h * 0.42, w * 0.12, "#bfe39a");
      center("(plant by the door)", h * 0.6, w * 0.05, "#e9f0d8", FONT_HAND, 400);
      ctx.fillStyle = "#bfe39a";
      ctx.beginPath();
      ctx.moveTo(w * 0.3, h * 0.78);
      ctx.lineTo(w * 0.7, h * 0.78);
      ctx.lineTo(w * 0.7, h * 0.72);
      ctx.lineTo(w * 0.82, h * 0.82);
      ctx.lineTo(w * 0.7, h * 0.92);
      ctx.lineTo(w * 0.7, h * 0.86);
      ctx.lineTo(w * 0.3, h * 0.86);
      ctx.fill();
      break;
    }
    case "wifi": {
      paper("#f2efe6");
      center("WI-FI", h * 0.2, w * 0.14, "#2a2520");
      center("lastcandle24h", h * 0.45, w * 0.07, "#2a2520", FONT_MONO, 600);
      center("pass:", h * 0.6, w * 0.05, "#6b6457", FONT_MONO, 400);
      center("notfinancialadvice", h * 0.72, w * 0.06, "#2a2520", FONT_MONO, 600);
      break;
    }
    case "server": {
      paper("#d8d2c0");
      ctx.fillStyle = "#e0b100";
      ctx.fillRect(0, 0, w, h * 0.22);
      center("STAFF ONLY", h * 0.11, w * 0.11, "#1d1b18");
      center("SERVER ROOM", h * 0.38, w * 0.09, "#1d1b18");
      center("do not feed", h * 0.56, w * 0.07, "#4b453a", FONT_HAND, 400);
      center("the fans", h * 0.68, w * 0.07, "#4b453a", FONT_HAND, 400);
      break;
    }
    case "mezz": {
      paper("#1d1b18");
      center("MEZZANINE", h * 0.25, w * 0.11, "#e9dcc0");
      center("PREMIUM STATIONS", h * 0.42, w * 0.065, "#d9a441");
      center("ask the owner", h * 0.66, w * 0.07, "#b9b0a0", FONT_HAND, 400);
      break;
    }
    case "wc": {
      paper("#cfd6d8");
      center("WC", h * 0.3, w * 0.25, "#2a3236");
      center("no charts on", h * 0.62, w * 0.07, "#2a3236", FONT_HAND, 400);
      center("the walls", h * 0.74, w * 0.07, "#2a3236", FONT_HAND, 400);
      break;
    }
    default: {
      paper("#ccc");
      center(kind, h / 2, w * 0.08, "#222");
    }
  }
  return toTexture(c);
}

export function stickerTex(text: string, bg: string, fg: string, w = 256, h = 128, font = FONT_UI): THREE.CanvasTexture {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = bg;
  const r = h * 0.2;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, r);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = text.split("\n");
  const size = Math.min(h / (lines.length + 0.6), (w * 1.6) / Math.max(...lines.map((l) => l.length)));
  ctx.font = `700 ${size}px ${font}`;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.05));
  const t = toTexture(c);
  return t;
}

export function labelTex(text: string, opts: { w?: number; h?: number; bg?: string; fg?: string; font?: string; size?: number } = {}): THREE.CanvasTexture {
  const w = opts.w ?? 256;
  const h = opts.h ?? 64;
  const [c, ctx] = canvas(w, h);
  if (opts.bg) {
    ctx.fillStyle = opts.bg;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.fillStyle = opts.fg ?? "#eee";
  ctx.font = `700 ${opts.size ?? h * 0.6}px ${opts.font ?? FONT_MONO}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2);
  return toTexture(c);
}

/** Store-front vinyl lettering (drawn mirrored, because we see it from inside). */
export function storefrontLetteringTex(): THREE.CanvasTexture {
  const [c, ctx] = canvas(1024, 256);
  ctx.translate(1024, 0);
  ctx.scale(-1, 1);
  ctx.fillStyle = "rgba(240,230,210,0.85)";
  ctx.font = `700 92px ${FONT_UI}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("LAST CANDLE", 512, 100);
  ctx.font = `500 40px ${FONT_MONO}`;
  ctx.fillText("LAN • 24H • COFFEE • PRINTS", 512, 180);
  return toTexture(c);
}

export function canLabelTex(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, "#14203a");
  g.addColorStop(0.5, "#24365e");
  g.addColorStop(1, "#14203a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#f4c542";
  ctx.beginPath();
  ctx.arc(128, 96, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#24365e";
  ctx.beginPath();
  ctx.arc(146, 84, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f4ead2";
  ctx.font = `700 34px ${FONT_UI}`;
  ctx.textAlign = "center";
  ctx.fillText("OVERNIGHT", 128, 176);
  ctx.font = `500 16px ${FONT_MONO}`;
  ctx.fillText("ENERGY • ZERO SLEEP", 128, 206);
  return toTexture(c);
}

export function chipsTex(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 320);
  ctx.fillStyle = "#e0782b";
  ctx.fillRect(0, 0, 256, 320);
  ctx.fillStyle = "#f6d24a";
  ctx.beginPath();
  ctx.ellipse(128, 170, 90, 60, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3b1d0e";
  ctx.font = `700 40px ${FONT_UI}`;
  ctx.textAlign = "center";
  ctx.fillText("CRUNCH", 128, 160);
  ctx.fillText("LINE", 128, 200);
  ctx.fillStyle = "#fff3dc";
  ctx.font = `500 18px ${FONT_MONO}`;
  ctx.fillText("SALTED • SUPPORT LEVEL", 128, 60);
  ctx.fillText("DIP INCLUDED", 128, 290);
  return toTexture(c);
}

export function cupTex(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 128);
  ctx.fillStyle = "#e9e2d2";
  ctx.fillRect(0, 0, 256, 128);
  drawCandleMark(ctx, 64, 66, 70, "#3a8a5c");
  ctx.fillStyle = "#3a3530";
  ctx.font = `700 22px ${FONT_UI}`;
  ctx.fillText("GM", 150, 72);
  return toTexture(c);
}

export function streetTex(): THREE.CanvasTexture {
  const W = 2048;
  const H = 1024;
  const [c, ctx] = canvas(W, H);
  // night sky
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
  sky.addColorStop(0, "#0b0e16");
  sky.addColorStop(1, "#262632");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  // buildings across the street
  let x = -40;
  const facades = ["#2a2522", "#23252a", "#2c2826", "#1f2226", "#2b2a27"];
  while (x < W) {
    const bw = rng.range(260, 520);
    const top = rng.range(H * 0.05, H * 0.25);
    ctx.fillStyle = rng.pick(facades);
    ctx.fillRect(x, top, bw, H * 0.72 - top);
    // windows
    for (let wy = top + 30; wy < H * 0.5; wy += 70) {
      for (let wx = x + 24; wx < x + bw - 50; wx += 74) {
        const lit = rng.chance(0.18);
        ctx.fillStyle = lit ? (rng.chance(0.5) ? "#d9a45a" : "#b8c4d8") : "#15171b";
        ctx.globalAlpha = lit ? rng.range(0.5, 0.9) : 1;
        ctx.fillRect(wx, wy, 40, 46);
        ctx.globalAlpha = 1;
      }
    }
    // shop at street level
    const sh = H * 0.72;
    if (rng.chance(0.6)) {
      ctx.fillStyle = "#3a3c40";
      ctx.fillRect(x + 20, sh - 170, bw - 40, 170);
      for (let ly = sh - 165; ly < sh; ly += 10) {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(x + 20, ly, bw - 40, 3);
      }
    } else {
      ctx.fillStyle = "#4a3624";
      ctx.fillRect(x + 20, sh - 170, bw - 40, 170);
      const g = ctx.createLinearGradient(0, sh - 170, 0, sh);
      g.addColorStop(0, "rgba(255,190,110,0.55)");
      g.addColorStop(1, "rgba(255,150,80,0.2)");
      ctx.fillStyle = g;
      ctx.fillRect(x + 30, sh - 160, bw - 60, 150);
      ctx.fillStyle = "#ffcf8a";
      ctx.font = `700 34px ${FONT_UI}`;
      ctx.textAlign = "center";
      ctx.fillText(rng.pick(["NOODLES 24H", "PHARMA • OPEN", "LAUNDRY"]), x + bw / 2, sh - 190);
    }
    x += bw + rng.range(4, 20);
  }
  // street
  const road = ctx.createLinearGradient(0, H * 0.72, 0, H);
  road.addColorStop(0, "#1a1b1e");
  road.addColorStop(1, "#0d0e10");
  ctx.fillStyle = road;
  ctx.fillRect(0, H * 0.72, W, H * 0.28);
  // wet reflections
  for (let i = 0; i < 40; i++) {
    const rx = rng.next() * W;
    const g = ctx.createLinearGradient(0, H * 0.73, 0, H);
    const col = rng.pick(["255,180,100", "200,210,230", "255,140,80"]);
    g.addColorStop(0, `rgba(${col},0.25)`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(rx, H * 0.73, rng.range(6, 30), H * 0.27);
  }
  // lane dashes
  ctx.fillStyle = "rgba(220,210,180,0.35)";
  for (let lx = 0; lx < W; lx += 220) ctx.fillRect(lx, H * 0.86, 120, 8);
  return toTexture(c);
}

export function rainGlassTex(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  ctx.clearRect(0, 0, S, S);
  for (let i = 0; i < 180; i++) {
    const x = rng.next() * S;
    const y = rng.next() * S;
    const r = rng.range(1.5, 5);
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(0.6, "rgba(200,210,220,0.18)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // streaks
  for (let i = 0; i < 26; i++) {
    const x = rng.next() * S;
    const y = rng.next() * S;
    const len = rng.range(30, 140);
    ctx.strokeStyle = "rgba(220,230,240,0.18)";
    ctx.lineWidth = rng.range(1, 2.5);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + rng.range(-6, 6), y + len * 0.3, x + rng.range(-6, 6), y + len * 0.6, x + rng.range(-4, 4), y + len);
    ctx.stroke();
  }
  return toTexture(c, { repeat: [2, 1] });
}

export function rackTex(): [THREE.CanvasTexture, HTMLCanvasElement, CanvasRenderingContext2D] {
  const [c, ctx] = canvas(128, 512);
  ctx.fillStyle = "#121315";
  ctx.fillRect(0, 0, 128, 512);
  for (let y = 8; y < 504; y += 24) {
    ctx.fillStyle = "#1e2024";
    ctx.fillRect(8, y, 112, 20);
    ctx.fillStyle = "#2a2d32";
    ctx.fillRect(8, y, 112, 2);
  }
  return [toTexture(c), c, ctx];
}

const padCache = new Map<string, THREE.CanvasTexture>();
/** Original desk-mat designs (cosmetic). */
export function padTex(id: string): THREE.CanvasTexture {
  const hit = padCache.get(id);
  if (hit) return hit;
  const [c, ctx] = canvas(512, 248);
  if (id === "pad-grid") {
    ctx.fillStyle = "#0f141c";
    ctx.fillRect(0, 0, 512, 248);
    ctx.strokeStyle = "rgba(90,140,210,0.22)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= 512; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, 248);
      ctx.stroke();
    }
    for (let y = 0; y <= 248; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(512, y + 0.5);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(120,180,255,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    let y = 170;
    ctx.moveTo(20, y);
    for (let x = 20; x < 490; x += 18) {
      y += Math.sin(x * 0.07) * 9 - 2;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(160,190,230,0.55)";
    ctx.font = `600 13px ${FONT_MONO}`;
    ctx.fillText("NIGHT GRID • LAST CANDLE", 330, 232);
  } else if (id === "pad-wick") {
    ctx.fillStyle = "#1b1511";
    ctx.fillRect(0, 0, 512, 248);
    // one candle with an absurdly long upper wick
    ctx.strokeStyle = "#e7a24a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(390, 228);
    ctx.lineTo(390, 18);
    ctx.stroke();
    ctx.fillStyle = "#e7a24a";
    ctx.fillRect(374, 168, 32, 48);
    ctx.fillStyle = "rgba(231,162,74,0.7)";
    ctx.font = `400 34px ${FONT_HAND}`;
    ctx.fillText("patience.", 40, 130);
    ctx.font = `600 12px ${FONT_MONO}`;
    ctx.fillStyle = "rgba(231,162,74,0.45)";
    ctx.fillText("LONG WICK", 40, 226);
  } else {
    // rain window
    const gr = ctx.createLinearGradient(0, 0, 512, 248);
    gr.addColorStop(0, "#1a2129");
    gr.addColorStop(1, "#0d1116");
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 512, 248);
    for (let i = 0; i < 70; i++) {
      const x = (i * 97) % 512;
      const y0 = (i * 53) % 248;
      ctx.strokeStyle = `rgba(170,200,225,${0.12 + (i % 5) * 0.04})`;
      ctx.lineWidth = 1 + (i % 3) * 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x - 6, y0 + 22 + (i % 4) * 8);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,170,90,0.35)";
    ctx.beginPath();
    ctx.arc(430, 60, 26, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = toTexture(c);
  padCache.set(id, t);
  return t;
}

let placeholder: THREE.CanvasTexture | null = null;
/** What the receipt stand shows before any trade has been closed. */
export function placeholderReceipt(): THREE.CanvasTexture {
  if (placeholder) return placeholder;
  const [c, ctx] = canvas(144, 310);
  ctx.fillStyle = "#f6f2e7";
  ctx.fillRect(0, 0, 144, 310);
  ctx.fillStyle = "#3a352d";
  ctx.textAlign = "center";
  ctx.font = `600 13px ${FONT_MONO}`;
  ctx.fillText("YOUR BEST", 72, 120);
  ctx.fillText("TRADE GOES", 72, 140);
  ctx.fillText("HERE", 72, 160);
  ctx.font = `400 10px ${FONT_MONO}`;
  ctx.fillText("(close one first)", 72, 190);
  placeholder = toTexture(c);
  return placeholder;
}

/** Engraved brass nameplate text. */
export function plateTex(text: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 108);
  ctx.clearRect(0, 0, 512, 108);
  ctx.fillStyle = "#3a2a10";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 46px ${FONT_UI}`;
  ctx.fillText(text, 256, 56);
  return toTexture(c);
}
