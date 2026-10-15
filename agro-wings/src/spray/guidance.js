// Swath guidance (lightbar + GPS screen): parallel pass lines over the
// contract fields, completion of each pass from real coverage, the next pass
// to fly and the cross-track error to it.
import { SPRAY } from '../config.js';
import { clamp } from '../core/math.js';

export class Guidance {
  constructor(game) {
    this.game = game;
    this.job = null;
    this.passes = [];
    this.next = null;
    this.xte = 0;
    this.aligned = false;
    this.t = 0;
  }

  setJob(job) {
    this.job = job;
    this.passes = [];
    this.next = null;
    if (!job) return;
    // Group fields sharing the same axis; passes span the union extent.
    const fs = job.fields;
    const axis = fs[0].rowAxis; // rows along X -> passes along X, spaced across Z
    const a0 = Math.min(...fs.map((f) => (axis === 'x' ? f.z0 : f.x0)));
    const a1 = Math.max(...fs.map((f) => (axis === 'x' ? f.z1 : f.x1)));
    const l0 = Math.min(...fs.map((f) => (axis === 'x' ? f.x0 : f.z0)));
    const l1 = Math.max(...fs.map((f) => (axis === 'x' ? f.x1 : f.z1)));
    const W = this.game.aircraft.type.spray.swath;
    const n = Math.max(1, Math.round((a1 - a0) / W));
    const sp = (a1 - a0) / n;
    for (let k = 0; k < n; k++) {
      const c = a0 + sp * (k + 0.5);
      this.passes.push({ k, c, c0: c - sp / 2, c1: c + sp / 2, done: 0 });
    }
    this.axis = axis;
    this.a0 = a0; this.a1 = a1; this.l0 = l0; this.l1 = l1;
    this.spacing = sp;
    this.refresh(true);
  }

  refresh() {
    if (!this.job) return;
    for (const p of this.passes) {
      let s = 0, n = 0;
      for (const cov of this.job.coverages) {
        const f = cov.f;
        const lo = this.axis === 'x' ? f.z0 : f.x0, hi = this.axis === 'x' ? f.z1 : f.x1;
        if (p.c1 < lo || p.c0 > hi) continue;
        s += cov.stripCoverage(this.axis, Math.max(lo, p.c0 + 1), Math.min(hi, p.c1 - 1));
        n++;
      }
      p.done = n ? s / n : 1;
    }
  }

  update(dt) {
    if (!this.job) { this.next = null; return; }
    this.t -= dt;
    if (this.t <= 0) { this.t = 0.5; this.refresh(); }
    const ac = this.game.aircraft;
    const pos = ac.fm.pos;
    const cross = this.axis === 'x' ? pos.z : pos.x;
    const f = ac.forward();
    const along = this.axis === 'x' ? f.x : f.z;
    this.dirSign = along >= 0 ? 1 : -1;
    this.aligned = Math.abs(along) > 0.85;
    // Next = incomplete pass closest to where we are.
    let best = null, bd = 1e9;
    for (const p of this.passes) {
      if (p.done > 0.85) continue;
      const d = Math.abs(p.c - cross);
      if (d < bd) { bd = d; best = p; }
    }
    this.next = best;
    if (best) {
      // Positive xte = target is to the pilot's right.
      const raw = best.c - cross;
      // Right of the aircraft when flying +X is +Z; flying +Z right is -X.
      const rightSign = this.axis === 'x' ? this.dirSign : -this.dirSign;
      this.xte = raw * rightSign;
    } else this.xte = 0;
    this._lightbar();
  }

  _lightbar() {
    const leds = this.game.aircraft.model.leds;
    const on = this.next && this.aligned;
    const e = clamp(this.xte, -7, 7);
    for (let i = 0; i < leds.length; i++) {
      const pos = i - 7; // -7 (left) .. +7 (right)
      let col = 0x1c1c1c;
      if (on) {
        if (pos === 0) col = Math.abs(e) < 0.75 ? 0x33ff66 : 0x225533;
        else if (Math.sign(pos) === Math.sign(e) && Math.abs(pos) <= Math.ceil(Math.abs(e))) col = Math.abs(pos) > 4 ? 0xff3322 : 0xffaa22;
      } else if (this.next && pos === 0) col = 0x223a28;
      leds[i].material.color.setHex(col);
    }
  }

  // GPS screen (track-up moving map).
  draw(g, x, y, w, h) {
    const ac = this.game.aircraft;
    if (!this.job) {
      g.fillStyle = '#081009';
      g.fillRect(x, y, w, h);
      g.fillStyle = '#4c6b52';
      g.font = 'bold 18px monospace';
      g.textAlign = 'center';
      g.fillText('NO JOB', x + w / 2, y + h / 2);
      g.font = '14px monospace';
      g.fillText(`HDG ${String(Math.round(ac.headingDeg())).padStart(3, '0')}°`, x + w / 2, y + h / 2 + 24);
      return;
    }
    const pos = ac.fm.pos;
    const hdg = Math.atan2(ac.forward().x, ac.forward().z);
    const scale = 0.32; // px per metre
    const cx = x + w / 2, cy = y + h * 0.72;
    g.fillStyle = '#081009';
    g.fillRect(x, y, w, h);
    g.save();
    g.translate(cx, cy);
    // Track-up: rotate world so heading points up the screen.
    g.rotate(hdg - Math.PI);
    g.scale(scale, scale);
    g.translate(-pos.x, -pos.z);
    // Coverage images
    for (const cov of this.job.coverages) {
      const img = this.game.overlay?.canvasFor(cov);
      const f = cov.f;
      if (img) {
        g.globalAlpha = 0.85;
        g.imageSmoothingEnabled = false;
        g.drawImage(img, f.x0, f.z0, f.x1 - f.x0, f.z1 - f.z0);
        g.globalAlpha = 1;
      }
      g.strokeStyle = '#d8f5d0';
      g.lineWidth = 2 / scale;
      g.strokeRect(f.x0, f.z0, f.x1 - f.x0, f.z1 - f.z0);
    }
    // Pass lines
    for (const p of this.passes) {
      const nxt = p === this.next;
      g.strokeStyle = nxt ? '#ffe14a' : p.done > 0.85 ? 'rgba(120,200,120,0.35)' : 'rgba(200,230,200,0.35)';
      g.lineWidth = (nxt ? 3 : 1) / scale;
      g.beginPath();
      if (this.axis === 'x') { g.moveTo(this.l0 - 200, p.c); g.lineTo(this.l1 + 200, p.c); }
      else { g.moveTo(p.c, this.l0 - 200); g.lineTo(p.c, this.l1 + 200); }
      g.stroke();
    }
    g.restore();
    // Aircraft symbol
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(cx, cy - 10); g.lineTo(cx + 7, cy + 7); g.lineTo(cx, cy + 3); g.lineTo(cx - 7, cy + 7); g.closePath();
    g.fill();
    // Readouts
    g.fillStyle = '#9ff0a4';
    g.font = 'bold 16px monospace';
    g.textAlign = 'left';
    const done = this.passes.filter((p) => p.done > 0.85).length;
    g.fillText(`PASS ${this.next ? this.next.k + 1 : '-'} / ${this.passes.length}`, x + 8, y + 20);
    g.fillText(`DONE ${done}`, x + 8, y + 40);
    if (this.next && this.aligned) {
      const e = this.xte;
      g.textAlign = 'right';
      g.fillText(`${Math.abs(e) < 0.75 ? 'ON LINE' : (e > 0 ? 'R ' : 'L ') + Math.abs(e).toFixed(1) + 'm'}`, x + w - 8, y + 20);
    }
  }
}
