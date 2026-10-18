// Swath guidance (lightbar + GPS screen): parallel pass lines over the
// contract fields, completion of each pass from real coverage, the next pass
// to fly and the cross-track error to it. Also records the flight track
// (with where the boom was spraying) and draws the GPS page used by the
// cockpit unit and by the HUD's GPS mode. Every readout comes from live
// state: position, heading, ground speed, coverage grid, sprayer flow.
import { clamp, KT } from '../core/math.js';
import { reliefPatch } from '../ui/maps.js';
import { UNITS } from '../config.js';

const TRACK_MAX = 2400; // points (~16 min at 0.4 s)

export class Guidance {
  constructor(game) {
    this.game = game;
    this.job = null;
    this.passes = [];
    this.next = null;
    this.xte = 0;
    this.aligned = false;
    this.t = 0;
    // Flight track ring buffer: x, z, spraying flag.
    this.track = new Float32Array(TRACK_MAX * 3);
    this.trackN = 0; this.trackHead = 0; this.trackT = 0;
  }

  clearTrack() { this.trackN = 0; this.trackHead = 0; }

  _record(dt) {
    const ac = this.game.aircraft, o = ac.fm.out;
    this.trackT -= dt;
    if (this.trackT > 0 || o.onGround) return;
    this.trackT = 0.4;
    const sp = this.game.sprayer;
    const i = this.trackHead * 3;
    this.track[i] = ac.fm.pos.x; this.track[i + 1] = ac.fm.pos.z; this.track[i + 2] = sp.on && sp.flowNow > 0 ? 1 : 0;
    this.trackHead = (this.trackHead + 1) % TRACK_MAX;
    this.trackN = Math.min(TRACK_MAX, this.trackN + 1);
  }

  setJob(job) {
    if (job !== this.job) this.clearTrack();
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
    // Terrain under the job (real heights): shading for the GPS page and the
    // elevation range of the talhões.
    const m = 350;
    const bx0 = Math.min(...fs.map((f) => f.x0)) - m, bx1 = Math.max(...fs.map((f) => f.x1)) + m;
    const bz0 = Math.min(...fs.map((f) => f.z0)) - m, bz1 = Math.max(...fs.map((f) => f.z1)) + m;
    const rp = reliefPatch(bx0, bz0, bx1, bz1, 160);
    let fmn = 1e9, fmx = -1e9;
    const T = this.game.world.terrain;
    for (const f of fs) for (let z = f.z0; z <= f.z1; z += 30) for (let x = f.x0; x <= f.x1; x += 30) { const v = T.heightAt(x, z); fmn = Math.min(fmn, v); fmx = Math.max(fmx, v); }
    this.relief = { ...rp, bx0, bz0, bx1, bz1, fmn, fmx, shade: fmx - fmn >= 6 };
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
    this._record(dt);
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

  // GPS screen (track-up moving map). opts.big: HUD version (larger text).
  draw(g, x, y, w, h, opts = {}) {
    const ac = this.game.aircraft;
    const fs = opts.big ? 1.35 : 1;
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
    const scale = (opts.scale ?? 0.32) * (w / 294); // px per metre
    const cx = x + w / 2, cy = y + h * 0.66;
    g.fillStyle = '#081009';
    g.fillRect(x, y, w, h);
    g.save();
    g.translate(cx, cy);
    // Track-up: rotate world so heading points up the screen.
    g.rotate(hdg - Math.PI);
    g.scale(scale, scale);
    g.translate(-pos.x, -pos.z);
    // Terrain shading from the real height field (only where there is relief).
    if (this.relief?.shade) {
      const R = this.relief;
      g.globalAlpha = 0.9;
      g.imageSmoothingEnabled = true;
      g.drawImage(R.canvas, R.bx0, R.bz0, R.bx1 - R.bx0, R.bz1 - R.bz0);
      g.globalAlpha = 1;
    }
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
    // Flight track: thin grey where the boom was off, bright where spraying.
    if (this.trackN > 1) {
      const T = this.track, n = this.trackN, start = (this.trackHead - n + TRACK_MAX) % TRACK_MAX;
      for (const pass of [0, 1]) {
        g.strokeStyle = pass ? 'rgba(255,214,64,0.9)' : 'rgba(210,220,210,0.45)';
        g.lineWidth = (pass ? 2.2 : 1.2) / scale;
        g.beginPath();
        let pen = false;
        for (let k = 0; k < n; k++) {
          const i = ((start + k) % TRACK_MAX) * 3;
          const on = T[i + 2] > 0.5;
          if ((pass ? on : true) && k > 0) {
            const j = ((start + k - 1) % TRACK_MAX) * 3;
            if (Math.hypot(T[i] - T[j], T[i + 1] - T[j + 1]) < 60) {
              if (!pen) g.moveTo(T[j], T[j + 1]);
              g.lineTo(T[i], T[i + 1]);
              pen = true;
              continue;
            }
          }
          pen = false;
        }
        g.stroke();
      }
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
    g.font = `bold ${Math.round(16 * fs)}px monospace`;
    g.textAlign = 'left';
    const done = this.passes.filter((p) => p.done > 0.85).length;
    g.fillText(`PASS ${this.next ? this.next.k + 1 : '-'} / ${this.passes.length}`, x + 8, y + 20 * fs);
    g.fillText(`DONE ${done}`, x + 8, y + 40 * fs);
    if (this.relief?.shade) {
      // Terrain under the aircraft and the talhões' elevation range (MSL, m).
      const gnd = this.game.world.terrain.heightAt(pos.x, pos.z) + UNITS.altOffsetM;
      g.fillStyle = '#c9d8a0';
      g.font = `bold ${Math.round(13 * fs)}px monospace`;
      g.fillText(`GND ${Math.round(gnd)}m`, x + 8, y + 58 * fs);
      g.fillText(`FLD ${Math.round(this.relief.fmn + UNITS.altOffsetM)}-${Math.round(this.relief.fmx + UNITS.altOffsetM)}m`, x + 8, y + 74 * fs);
      g.font = `bold ${Math.round(16 * fs)}px monospace`;
      g.fillStyle = '#9ff0a4';
    }
    if (this.next && this.aligned) {
      const e = this.xte;
      g.textAlign = 'right';
      g.fillStyle = Math.abs(e) < 0.75 ? '#7dff8a' : Math.abs(e) > 4 ? '#ff8a6a' : '#ffd25a';
      g.fillText(`${Math.abs(e) < 0.75 ? 'ON LINE' : (e > 0 ? 'R ' : 'L ') + Math.abs(e).toFixed(1) + 'm'}`, x + w - 8, y + 20 * fs);
    }
    // Bottom strip: heading, ground speed, application state, progress, remaining area.
    const s = this.game.jobStats || this.job.stats();
    const sp = this.game.sprayer;
    const lh = Math.round(14 * fs);
    g.fillStyle = 'rgba(4,10,6,0.82)';
    g.fillRect(x, y + h - lh * 2 - 10, w, lh * 2 + 10);
    g.font = `bold ${lh - 1}px monospace`;
    g.textAlign = 'left';
    g.fillStyle = '#cfe9d2';
    const gs = Math.hypot(ac.fm.vel.x, ac.fm.vel.z) * KT;
    g.fillText(`HDG ${String(Math.round(ac.headingDeg())).padStart(3, '0')}°  GS ${Math.round(gs)}kt`, x + 6, y + h - lh - 8);
    const remHa = Math.max(0, (1 - s.coverage) * this.job.ha);
    g.fillText(`PROG ${Math.round(s.coverage * 100)}%  REM ${remHa.toFixed(1)}ha`, x + 6, y + h - 4);
    g.textAlign = 'right';
    const on = sp.on && sp.flowNow > 0;
    g.fillStyle = on ? '#ffd640' : sp.on ? '#ff8a6a' : '#7d8f80';
    g.fillText(on ? `SPRAY ${(sp.flowNow * 60).toFixed(0)}L/m` : sp.on ? 'NO FLOW' : 'SPRAY OFF', x + w - 6, y + h - lh - 8);
    g.fillStyle = '#cfe9d2';
    g.fillText(`OVL ${Math.round(s.overlap * 100)}%`, x + w - 6, y + h - 4);
  }
}
