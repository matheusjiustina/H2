import { Rng } from '../core/math/random';

/**
 * Resolution-independent drawing routines for every in-world computer display. The same functions
 * render the small animated screen tiles on buildings and the large focused view when the player
 * walks up to a computer. All data is simulated from seeded generators — nothing here is live.
 */

export type ScreenKind =
  | 'candles'
  | 'candles2'
  | 'explorer'
  | 'terminal'
  | 'network'
  | 'monitor'
  | 'mempool'
  | 'hashrate'
  | 'ticker'
  | 'art'
  | 'signal'
  | 'relaymap'
  | 'contract'
  | 'status'
  | 'menu'
  | 'dex'
  | 'archive'
  | 'gallery'
  | 'weather';

export const PAL = {
  bg: '#14202e',
  bg2: '#1b2a3b',
  grid: 'rgba(160,190,220,0.12)',
  text: '#d9e6f2',
  dim: '#7f95ab',
  up: '#58d6a0',
  down: '#f0727a',
  accent: '#f2b544',
  accent2: '#7cc8ff',
  violet: '#b49cff',
};

/** Seeded random-walk market used by chart screens. */
export class MarketSim {
  candles: { o: number; h: number; l: number; c: number }[] = [];
  private rng: Rng;
  private price: number;
  private t = 0;
  constructor(seed: string, start: number, private vol: number, private period = 1.2) {
    this.rng = new Rng(seed);
    this.price = start;
    for (let i = 0; i < 48; i++) this.pushCandle();
  }
  private pushCandle(): void {
    const o = this.price;
    let h = o, l = o, c = o;
    for (let k = 0; k < 6; k++) {
      c = c * (1 + this.rng.gauss(0.0002, this.vol));
      h = Math.max(h, c);
      l = Math.min(l, c);
    }
    this.price = c;
    this.candles.push({ o, h, l, c });
    if (this.candles.length > 64) this.candles.shift();
  }
  update(dt: number): void {
    this.t += dt;
    while (this.t > this.period) {
      this.t -= this.period;
      this.pushCandle();
    }
    // Live wick on the last candle.
    const last = this.candles[this.candles.length - 1];
    const wobble = Math.sin(performance.now() / 700 + last.o) * this.vol * 0.4;
    last.c = last.c * (1 + wobble * 0.05);
    last.h = Math.max(last.h, last.c);
    last.l = Math.min(last.l, last.c);
  }
  get last(): number {
    return this.candles[this.candles.length - 1].c;
  }
  get change(): number {
    const first = this.candles[Math.max(0, this.candles.length - 24)].o;
    return (this.last - first) / first;
  }
}

export const markets = {
  btc: new MarketSim('btc-sim', 64210, 0.004),
  eth: new MarketSim('eth-sim', 3120, 0.006, 1.0),
  chain: new MarketSim('chain-sim', 21.0, 0.009, 0.8),
};

const LINES = [
  '$ chain status --all',
  '> districts: 5   relays: 4/5',
  '> peers: 21  latency: 42ms',
  '$ git commit -m "fix: off-by-one"',
  '[main 3f2a1c9] fix: off-by-one',
  '$ npm run test',
  '  ✓ transfers settle (12ms)',
  '  ✓ nonce increments (3ms)',
  '  ✗ coffee() returns free espresso',
  '$ deploy --network=testnet',
  '> estimating gas… 21000',
  '> tx 0x7a1e…c0de confirmed',
  '$ hash "hello planet"',
  '> 9f86d081884c7d65…',
  '$ ping node-heights',
  '> reply from 10.0.0.21 time=12ms',
  '// TODO: sleep',
  '$ cat whitepaper.txt | wc -l',
  '> 9 pages, 1 idea',
];

const CONTRACT = [
  'contract CoffeeVault {',
  '  uint price = 3;',
  '  function buy(uint paid) {',
  '    require(paid >= price);',
  '    pour(msg.sender);',
  '  }',
  '  function refund(uint paid) {',
  '    send(paid - price);',
  '  }',
  '}',
];

function hashHex(rng: Rng, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += '0123456789abcdef'[Math.floor(rng.next() * 16)];
  return s;
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, bg = PAL.bg): void {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
}

function header(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string, color = PAL.accent): number {
  const hh = Math.max(8, h * 0.14);
  ctx.fillStyle = PAL.bg2;
  ctx.fillRect(x, y, w, hh);
  ctx.fillStyle = color;
  ctx.font = `700 ${hh * 0.62}px Fredoka, 'Trebuchet MS', sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(title, x + hh * 0.4, y + hh * 0.52);
  // SIM badge — clearly marks simulated data.
  ctx.fillStyle = 'rgba(242,181,68,0.18)';
  const bw = hh * 1.7;
  ctx.fillRect(x + w - bw - hh * 0.25, y + hh * 0.18, bw, hh * 0.64);
  ctx.fillStyle = PAL.accent;
  ctx.font = `700 ${hh * 0.42}px Fredoka, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('SIM', x + w - bw / 2 - hh * 0.25, y + hh * 0.52);
  ctx.textAlign = 'left';
  return hh;
}

function drawCandles(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, m: MarketSim, label: string): void {
  panel(ctx, x, y, w, h);
  const hh = header(ctx, x, y, w, h, label);
  const top = y + hh + h * 0.04, bottom = y + h * 0.84;
  const cs = m.candles.slice(-Math.max(16, Math.floor(w / 6)));
  let lo = Infinity, hi = -Infinity;
  for (const c of cs) { lo = Math.min(lo, c.l); hi = Math.max(hi, c.h); }
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad; hi += pad;
  const sy = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
  ctx.strokeStyle = PAL.grid;
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const gy = top + ((bottom - top) * i) / 4;
    ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke();
  }
  const cw = (w * 0.94) / cs.length;
  cs.forEach((c, i) => {
    const cx = x + w * 0.03 + i * cw + cw / 2;
    const col = c.c >= c.o ? PAL.up : PAL.down;
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = Math.max(1, cw * 0.15);
    ctx.beginPath(); ctx.moveTo(cx, sy(c.h)); ctx.lineTo(cx, sy(c.l)); ctx.stroke();
    const yo = sy(c.o), yc = sy(c.c);
    ctx.fillRect(cx - cw * 0.32, Math.min(yo, yc), cw * 0.64, Math.max(1, Math.abs(yc - yo)));
  });
  const ch = m.change;
  ctx.font = `700 ${h * 0.1}px Fredoka, sans-serif`;
  ctx.fillStyle = PAL.text;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(m.last.toFixed(m.last > 100 ? 0 : 2), x + w * 0.04, y + h * 0.96);
  ctx.fillStyle = ch >= 0 ? PAL.up : PAL.down;
  ctx.textAlign = 'right';
  ctx.fillText(`${ch >= 0 ? '+' : ''}${(ch * 100).toFixed(2)}%`, x + w * 0.96, y + h * 0.96);
  ctx.textAlign = 'left';
}

function drawExplorer(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number): void {
  panel(ctx, x, y, w, h);
  const hh = header(ctx, x, y, w, h, 'BLOCK EXPLORER', PAL.accent2);
  const height = 840000 + Math.floor(t / 6);
  const rows = 5;
  const rh = (h - hh) / rows;
  ctx.font = `600 ${rh * 0.34}px 'Courier New', monospace`;
  for (let i = 0; i < rows; i++) {
    const bh = height - i;
    const rng = new Rng(bh);
    const yy = y + hh + i * rh;
    ctx.fillStyle = i === 0 ? 'rgba(124,200,255,0.12)' : 'transparent';
    ctx.fillRect(x, yy, w, rh);
    // Block cube icon.
    ctx.fillStyle = i === 0 ? PAL.accent : PAL.accent2;
    ctx.fillRect(x + w * 0.04, yy + rh * 0.2, rh * 0.6, rh * 0.6);
    ctx.fillStyle = PAL.text;
    ctx.textBaseline = 'middle';
    ctx.fillText(`#${bh}`, x + w * 0.04 + rh * 0.85, yy + rh * 0.35);
    ctx.fillStyle = PAL.dim;
    ctx.fillText(`${hashHex(rng, 8)}… ${rng.int(900, 3600)} tx`, x + w * 0.04 + rh * 0.85, yy + rh * 0.72);
  }
}

function drawTerminal(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, lines = LINES): void {
  panel(ctx, x, y, w, h, '#0f1720');
  const n = Math.max(6, Math.floor(h / (h * 0.11)));
  const lh = h / (n + 1);
  const start = Math.floor(t * 1.2);
  ctx.font = `600 ${lh * 0.72}px 'Courier New', monospace`;
  ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const line = lines[(start + i) % lines.length];
    ctx.fillStyle = line.startsWith('$') ? PAL.up : line.includes('✗') ? PAL.down : line.startsWith('//') ? PAL.dim : PAL.text;
    ctx.fillText(line, x + w * 0.04, y + lh * (i + 0.8));
  }
  if (Math.floor(t * 2) % 2 === 0) {
    ctx.fillStyle = PAL.up;
    ctx.fillRect(x + w * 0.04, y + lh * (n + 0.35), lh * 0.45, lh * 0.75);
  }
}

function drawNetwork(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, title = 'NETWORK', healthy = 1): void {
  panel(ctx, x, y, w, h);
  const hh = header(ctx, x, y, w, h, title, PAL.violet);
  const rng = new Rng('net');
  const nodes: [number, number][] = [];
  for (let i = 0; i < 9; i++) nodes.push([x + w * (0.1 + rng.next() * 0.8), y + hh + (h - hh) * (0.12 + rng.next() * 0.76)]);
  ctx.lineWidth = Math.max(1, w * 0.008);
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      if ((i * 7 + j * 3) % 4 !== 0) continue;
      const broken = healthy < 1 && (i + j) % 5 === 0;
      ctx.strokeStyle = broken ? 'rgba(240,114,122,0.6)' : 'rgba(180,156,255,0.45)';
      ctx.beginPath(); ctx.moveTo(nodes[i][0], nodes[i][1]); ctx.lineTo(nodes[j][0], nodes[j][1]); ctx.stroke();
      if (!broken) {
        const p = (t * 0.6 + (i + j) * 0.13) % 1;
        ctx.fillStyle = PAL.accent;
        ctx.beginPath();
        ctx.arc(nodes[i][0] + (nodes[j][0] - nodes[i][0]) * p, nodes[i][1] + (nodes[j][1] - nodes[i][1]) * p, w * 0.012, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  nodes.forEach(([nx, ny], i) => {
    const pulse = 0.8 + 0.2 * Math.sin(t * 3 + i);
    ctx.fillStyle = i === 0 ? PAL.accent : PAL.violet;
    ctx.beginPath(); ctx.arc(nx, ny, w * 0.03 * pulse, 0, Math.PI * 2); ctx.fill();
  });
}

function drawMonitor(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number): void {
  panel(ctx, x, y, w, h);
  const hh = header(ctx, x, y, w, h, 'RIG STATUS', PAL.up);
  const bars = 6;
  const bw = (w * 0.86) / bars;
  for (let i = 0; i < bars; i++) {
    const v = 0.55 + 0.3 * Math.sin(t * 1.3 + i * 1.7) + 0.1 * Math.sin(t * 4.1 + i);
    const bx = x + w * 0.07 + i * bw;
    const top = y + hh + (h - hh) * 0.1;
    const bh = (h - hh) * 0.62;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(bx + bw * 0.15, top, bw * 0.7, bh);
    ctx.fillStyle = v > 0.82 ? PAL.down : v > 0.7 ? PAL.accent : PAL.up;
    ctx.fillRect(bx + bw * 0.15, top + bh * (1 - v), bw * 0.7, bh * v);
    ctx.fillStyle = PAL.dim;
    ctx.font = `600 ${h * 0.08}px Fredoka, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`G${i + 1}`, bx + bw / 2, y + h * 0.9);
  }
  ctx.textAlign = 'left';
}

function drawMempool(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, congested = 0.5): void {
  panel(ctx, x, y, w, h);
  const hh = header(ctx, x, y, w, h, 'MEMPOOL', PAL.accent);
  const rng = new Rng(Math.floor(t / 3));
  const cols = 8, rows = 4;
  const cw = w / cols, rh = (h - hh) / rows;
  const fill = Math.floor(cols * rows * (0.35 + congested * 0.6));
  for (let i = 0; i < cols * rows; i++) {
    const cx = x + (i % cols) * cw, cy = y + hh + Math.floor(i / cols) * rh;
    const on = i < fill;
    const fee = rng.next();
    ctx.fillStyle = on ? (fee > 0.7 ? PAL.down : fee > 0.35 ? PAL.accent : PAL.up) : 'rgba(255,255,255,0.05)';
    ctx.globalAlpha = on ? 0.55 + 0.45 * Math.sin(t * 2 + i) ** 2 : 1;
    ctx.fillRect(cx + cw * 0.12, cy + rh * 0.12, cw * 0.76, rh * 0.76);
  }
  ctx.globalAlpha = 1;
}

function drawHashrate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number): void {
  panel(ctx, x, y, w, h);
  const hh = header(ctx, x, y, w, h, 'HASHRATE', PAL.up);
  ctx.strokeStyle = PAL.up;
  ctx.lineWidth = Math.max(1.5, w * 0.012);
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const px = x + (w * i) / 40;
    const v = 0.5 + 0.22 * Math.sin(i * 0.4 + t) + 0.12 * Math.sin(i * 1.3 - t * 2) + i * 0.006;
    const py = y + h - (h - hh) * v * 0.85;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.stroke();
  ctx.fillStyle = PAL.text;
  ctx.font = `700 ${h * 0.11}px Fredoka, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${(612 + 8 * Math.sin(t)).toFixed(1)} EH/s`, x + w * 0.05, y + hh + h * 0.14);
}

function drawTicker(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number): void {
  panel(ctx, x, y, w, h, '#101a26');
  const items = [
    `BTC ${markets.btc.last.toFixed(0)} ${markets.btc.change >= 0 ? '▲' : '▼'}`,
    `ETH ${markets.eth.last.toFixed(0)} ${markets.eth.change >= 0 ? '▲' : '▼'}`,
    `CHAIN ${markets.chain.last.toFixed(2)}`,
    'BLOCKS ARE BREAD',
    'SIMULATED DATA — NOT FINANCIAL ADVICE',
    'GM, CHAIN CITY',
  ];
  const text = items.join('   •   ') + '   •   ';
  ctx.font = `700 ${h * 0.42}px Fredoka, sans-serif`;
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  const off = (t * h * 1.4) % tw;
  ctx.fillStyle = PAL.accent;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillText(text, x - off, y + h / 2);
  ctx.fillText(text, x - off + tw, y + h / 2);
  ctx.restore();
}

function drawArt(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, seed = 'pixel'): void {
  const rng = new Rng(seed);
  const n = 8;
  const cs = Math.min(w, h) / n;
  const pal = ['#f2b544', '#e8644a', '#7cc8ff', '#58d6a0', '#b49cff', '#ffe9c4', '#1d2433'];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const k = Math.floor(rng.next() * pal.length);
      ctx.fillStyle = pal[(k + Math.floor(t * 0.5 + (i + j) * 0.1)) % pal.length];
      ctx.fillRect(x + i * cs + (w - cs * n) / 2, y + j * cs + (h - cs * n) / 2, cs + 0.5, cs + 0.5);
    }
}

function drawSignal(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number): void {
  panel(ctx, x, y, w, h, '#0e1a1e');
  const hh = header(ctx, x, y, w, h, 'SIGNAL 21.0 MHz', PAL.up);
  ctx.strokeStyle = PAL.up;
  ctx.lineWidth = Math.max(1.5, w * 0.01);
  ctx.beginPath();
  for (let i = 0; i <= 80; i++) {
    const px = x + (w * i) / 80;
    const ph = i / 80 * Math.PI * 8 + t * 3;
    // A heartbeat that repeats every 21 samples — the mystery signal.
    const beat = (i + Math.floor(t * 10)) % 21 === 0 ? 0.35 : 0;
    const v = Math.sin(ph) * 0.12 + Math.sin(ph * 0.37) * 0.08 + beat;
    const py = y + hh + (h - hh) * (0.5 - v);
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.stroke();
}

function drawRelayMap(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, links = [1, 1, 0, 1, 0]): void {
  panel(ctx, x, y, w, h);
  const hh = header(ctx, x, y, w, h, 'THE CHAIN — RELAYS', PAL.accent);
  const cx = x + w / 2, cy = y + hh + (h - hh) / 2, r = Math.min(w, h - hh) * 0.36;
  const names = ['CITY', 'HILLS', 'COAST', 'MINES', 'HEIGHTS'];
  for (let i = 0; i < 5; i++) {
    const a0 = -Math.PI / 2 + (i / 5) * Math.PI * 2;
    const a1 = -Math.PI / 2 + ((i + 1) / 5) * Math.PI * 2;
    ctx.strokeStyle = links[i] ? PAL.up : 'rgba(240,114,122,0.7)';
    ctx.setLineDash(links[i] ? [] : [w * 0.02, w * 0.02]);
    ctx.lineWidth = Math.max(1.5, w * 0.012);
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r); ctx.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r); ctx.stroke();
  }
  ctx.setLineDash([]);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
    const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    ctx.fillStyle = PAL.accent;
    ctx.beginPath(); ctx.arc(px, py, w * 0.03 * (1 + 0.15 * Math.sin(t * 3 + i)), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.text;
    ctx.font = `700 ${h * 0.07}px Fredoka, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(names[i], px, py + (py < cy ? -h * 0.07 : h * 0.07));
  }
  ctx.textAlign = 'left';
}

function drawStatus(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number): void {
  panel(ctx, x, y, w, h, '#102018');
  ctx.fillStyle = PAL.up;
  ctx.font = `700 ${h * 0.2}px Fredoka, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 2);
  ctx.fillText('ONLINE', x + w / 2, y + h * 0.42);
  ctx.globalAlpha = 1;
  ctx.font = `600 ${h * 0.09}px Fredoka, sans-serif`;
  ctx.fillStyle = PAL.dim;
  ctx.fillText(`uptime ${Math.floor(1000 + t / 60)}d`, x + w / 2, y + h * 0.7);
  ctx.textAlign = 'left';
}

function drawMenu(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  panel(ctx, x, y, w, h, '#2a2220');
  ctx.fillStyle = '#ffe9c4';
  ctx.font = `700 ${h * 0.13}px Fredoka, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PROOF OF BREW', x + w / 2, y + h * 0.14);
  const items = ['Espresso ........ 3', 'Hodl Latte ...... 5', 'Gas-Free Tea .... 2', 'Moon Muffin ..... 4'];
  ctx.font = `600 ${h * 0.085}px 'Courier New', monospace`;
  items.forEach((s, i) => ctx.fillText(s, x + w / 2, y + h * (0.36 + i * 0.15)));
  ctx.textAlign = 'left';
}

function drawDex(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number): void {
  panel(ctx, x, y, w, h);
  const hh = header(ctx, x, y, w, h, 'DEX — LEARN MODE', PAL.accent2);
  const rows = 6;
  const rh = (h - hh) / rows;
  const mid = markets.chain.last;
  ctx.font = `600 ${rh * 0.5}px 'Courier New', monospace`;
  ctx.textBaseline = 'middle';
  for (let i = 0; i < rows; i++) {
    const ask = i < rows / 2;
    const p = mid * (1 + (ask ? (rows / 2 - i) : -(i - rows / 2 + 1)) * 0.004);
    const size = 0.5 + Math.abs(Math.sin(t * 0.7 + i * 1.3)) * 3;
    const yy = y + hh + i * rh;
    ctx.fillStyle = ask ? 'rgba(240,114,122,0.18)' : 'rgba(88,214,160,0.18)';
    ctx.fillRect(x + w - (w * size) / 4, yy + 1, (w * size) / 4, rh - 2);
    ctx.fillStyle = ask ? PAL.down : PAL.up;
    ctx.fillText(p.toFixed(3), x + w * 0.05, yy + rh / 2);
    ctx.fillStyle = PAL.text;
    ctx.fillText(size.toFixed(2), x + w * 0.55, yy + rh / 2);
  }
}

function drawArchive(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number): void {
  panel(ctx, x, y, w, h, '#1e1a14');
  const hh = header(ctx, x, y, w, h, 'MERKLE ARCHIVE', '#e8c98a');
  // Merkle tree drawing.
  const levels = 4;
  for (let l = 0; l < levels; l++) {
    const count = 2 ** l;
    for (let i = 0; i < count; i++) {
      const nx = x + (w * (i + 0.5)) / count;
      const ny = y + hh + ((h - hh) * (l + 0.5)) / levels;
      if (l < levels - 1) {
        ctx.strokeStyle = 'rgba(232,201,138,0.5)';
        ctx.lineWidth = 1;
        for (const c of [0, 1]) {
          const cx2 = x + (w * (i * 2 + c + 0.5)) / (count * 2);
          const cy2 = y + hh + ((h - hh) * (l + 1.5)) / levels;
          ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(cx2, cy2); ctx.stroke();
        }
      }
      const active = Math.floor(t * 2) % (levels * 2) === l + i;
      ctx.fillStyle = active ? '#f2b544' : '#e8c98a';
      ctx.fillRect(nx - w * 0.025, ny - w * 0.025, w * 0.05, w * 0.05);
    }
  }
}

function drawWeather(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number): void {
  panel(ctx, x, y, w, h, '#16283a');
  ctx.fillStyle = '#ffd27f';
  ctx.beginPath(); ctx.arc(x + w * 0.3, y + h * 0.42, h * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e6eef5';
  ctx.beginPath(); ctx.ellipse(x + w * 0.45 + Math.sin(t * 0.5) * w * 0.03, y + h * 0.52, w * 0.18, h * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.font = `700 ${h * 0.14}px Fredoka, sans-serif`;
  ctx.fillStyle = PAL.text;
  ctx.textBaseline = 'middle';
  ctx.fillText('21°', x + w * 0.66, y + h * 0.45);
  ctx.font = `600 ${h * 0.08}px Fredoka, sans-serif`;
  ctx.fillStyle = PAL.dim;
  ctx.fillText('mostly bullish', x + w * 0.1, y + h * 0.82);
}

export interface ScreenState {
  /** Health of the relay network 0..1 (mission progress feeds this). */
  relayLinks: number[];
  congestion: number;
}

export const screenState: ScreenState = { relayLinks: [1, 1, 0, 1, 0], congestion: 0.85 };

export function drawScreen(kind: ScreenKind, ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, seed = ''): void {
  switch (kind) {
    case 'candles': return drawCandles(ctx, x, y, w, h, markets.btc, 'BTC / SAT-USD');
    case 'candles2': return drawCandles(ctx, x, y, w, h, markets.eth, 'ETH / GAS-USD');
    case 'explorer': return drawExplorer(ctx, x, y, w, h, t);
    case 'terminal': return drawTerminal(ctx, x, y, w, h, t);
    case 'contract': return drawTerminal(ctx, x, y, w, h, t * 0.4, CONTRACT);
    case 'network': return drawNetwork(ctx, x, y, w, h, t, 'NETWORK', screenState.relayLinks.every(Boolean) ? 1 : 0.6);
    case 'monitor': return drawMonitor(ctx, x, y, w, h, t);
    case 'mempool': return drawMempool(ctx, x, y, w, h, t, screenState.congestion);
    case 'hashrate': return drawHashrate(ctx, x, y, w, h, t);
    case 'ticker': return drawTicker(ctx, x, y, w, h, t);
    case 'art': return drawArt(ctx, x, y, w, h, t, seed || 'pixel');
    case 'gallery': return drawArt(ctx, x, y, w, h, t * 0.2, seed || 'gallery');
    case 'signal': return drawSignal(ctx, x, y, w, h, t);
    case 'relaymap': return drawRelayMap(ctx, x, y, w, h, t, screenState.relayLinks);
    case 'status': return drawStatus(ctx, x, y, w, h, t);
    case 'menu': return drawMenu(ctx, x, y, w, h);
    case 'dex': return drawDex(ctx, x, y, w, h, t);
    case 'archive': return drawArchive(ctx, x, y, w, h, t);
    case 'weather': return drawWeather(ctx, x, y, w, h, t);
  }
}

export function updateMarkets(dt: number): void {
  markets.btc.update(dt);
  markets.eth.update(dt);
  markets.chain.update(dt);
}
