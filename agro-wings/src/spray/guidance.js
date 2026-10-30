// Swath guidance (lightbar + GPS screen): parallel pass lines over the
// contract fields, completion of each pass from real coverage, the next pass
// to fly and the cross-track error to it. Also records the flight track
// (with where the boom was spraying) and draws the GPS page used by the
// cockpit unit and by the HUD's GPS mode. Every readout comes from live
// state: position, heading, ground speed, coverage grid, sprayer flow.
import { clamp, KT } from '../core/math.js';
import { reliefPatch } from '../ui/maps.js';
import { UNITS, GAME } from '../config.js';
import { FIELDS, SITES, siteById } from '../world/layout.js';

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
      // Coverage of the strip, weighted by how much of it each talhão holds
      // (staggered talhões can share a strip by a sliver only).
      let s = 0, n = 0;
      for (const cov of this.job.coverages) {
        const f = cov.f;
        const lo = this.axis === 'x' ? f.z0 : f.x0, hi = this.axis === 'x' ? f.z1 : f.x1;
        const a = Math.max(lo, p.c0 + 1), b = Math.min(hi, p.c1 - 1);
        if (b - a < 1) continue;
        const w = (b - a) * ((this.axis === 'x' ? f.x1 - f.x0 : f.z1 - f.z0));
        s += cov.stripCoverage(this.axis, a, b) * w;
        n += w;
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

  // Where the aircraft should be heading when not working the talhão: the
  // job's farm strip (ferry), the job's talhões, or nothing.
  navTarget() {
    const ac = this.game.aircraft, p = ac.fm.pos;
    if (!this.job) return null;
    const fs = this.job.fields;
    const cx = (Math.min(...fs.map((f) => f.x0)) + Math.max(...fs.map((f) => f.x1))) / 2;
    const cz = (Math.min(...fs.map((f) => f.z0)) + Math.max(...fs.map((f) => f.z1))) / 2;
    const farm = this.job.c.farm ? siteById(this.job.c.farm) : null;
    // Ferry to the farm strip until the crew is there; then the talhões.
    if (farm && this.game.site !== farm) return { x: farm.runway.x0 + 60, z: farm.runway.z, name: farm.farm.short.toUpperCase(), kind: 'strip' };
    if (Math.hypot(cx - p.x, cz - p.z) > 1600) return { x: cx, z: cz, name: fs.map((f) => f.name).join('+'), kind: 'field' };
    return null;
  }

  // GPS screen. Two pages, chosen from the situation: OPS (track-up moving map
  // over the talhão: boundaries, pass lines, coverage, track, cross-track) and
  // NAV (ferry: strips, farms and talhões around, the destination with
  // distance, bearing and time). Both carry the same live side strip: fuel,
  // load, spray state, heading, ground speed, position. Colours follow the
  // aircraft's unit (green Ipanema AgNav, amber AT-502B Satloc, cyan R44).
  // opts.big: HUD version (larger text).
  draw(g, x, y, w, h, opts = {}) {
    const ac = this.game.aircraft;
    const P = THEMES[ac.type.id] ?? THEMES.ipanema;
    const fs = opts.big ? 1.35 : 1;
    const nav = this.navTarget();
    g.fillStyle = P.bg;
    g.fillRect(x, y, w, h);
    const barW = Math.round(16 * fs);
    const mw = w - barW * 2 - 6; // map width (bars on the right)
    // opts.page: 'map' (always the NAV page) or 'cov' (the talhão page when
    // there is a job); otherwise chosen from the situation.
    if (opts.page === 'map' || ((!this.job || nav) && opts.page !== 'cov') || !this.job) this._drawNav(g, x, y, mw, h, fs, P, nav, opts);
    else this._drawOps(g, x, y, mw, h, fs, P, opts);
    this._drawBars(g, x + mw + 3, y, barW, h, fs, P);
  }

  _readoutStrip(g, x, y, w, h, fs, P, line2, right2 = '') {
    const ac = this.game.aircraft;
    const lh = Math.round(14 * fs);
    g.fillStyle = P.strip;
    g.fillRect(x, y + h - lh * 2 - 10, w, lh * 2 + 10);
    const sp = this.game.sprayer;
    const on = sp.on && sp.flowNow > 0;
    const gs = Math.hypot(ac.fm.vel.x, ac.fm.vel.z) * KT;
    const l1 = `HDG ${String(Math.round(ac.headingDeg()) % 360).padStart(3, '0')}°  GS ${Math.round(gs)}kt`;
    const r1 = on ? `SPRAY ${(sp.flowNow * 60).toFixed(0)}L/m` : sp.on ? 'NO FLOW' : 'SPRAY OFF';
    // Shrink the type until both columns fit the strip.
    let px = lh - 1;
    for (; px > 8; px--) {
      g.font = `bold ${px}px monospace`;
      if (Math.max(g.measureText(l1).width + g.measureText(r1).width, g.measureText(line2).width + g.measureText(right2).width) + 22 <= w) break;
    }
    g.textAlign = 'left';
    g.fillStyle = P.text;
    g.fillText(l1, x + 6, y + h - lh - 8);
    g.fillText(line2, x + 6, y + h - 4);
    g.textAlign = 'right';
    g.fillStyle = on ? P.spray : sp.on ? P.warn : P.dim;
    g.fillText(r1, x + w - 6, y + h - lh - 8);
    if (right2) { g.fillStyle = P.text; g.fillText(right2, x + w - 6, y + h - 4); }
    return lh;
  }

  // Fuel and load columns with their values.
  _drawBars(g, x, y, bw, h, fs, P) {
    const ac = this.game.aircraft, fm = ac.fm, A = ac.A;
    const items = [['F', fm.fuel / A.fuelCapacity, P.fuel], ['L', fm.hopper / A.hopperCapacity, P.load]];
    const top = y + 6 * fs, bot = y + h - 22 * fs;
    g.font = `bold ${Math.round(10 * fs)}px monospace`;
    g.textAlign = 'center';
    items.forEach(([lbl, k, col], i) => {
      const bx = x + i * (bw + 2);
      g.fillStyle = P.track;
      g.fillRect(bx + 2, top, bw - 4, bot - top);
      const f = clamp(k, 0, 1);
      g.fillStyle = lbl === 'F' && f < 0.15 ? P.warn : col;
      g.fillRect(bx + 2, bot - (bot - top) * f, bw - 4, (bot - top) * f);
      g.fillStyle = P.text;
      g.fillText(lbl, bx + bw / 2, bot + 10 * fs);
      g.fillText(String(Math.round(clamp(k, 0, 1) * 100)), bx + bw / 2, bot + 20 * fs);
    });
  }

  _drawOps(g, x, y, w, h, fs, P, opts) {
    const ac = this.game.aircraft;
    const pos = ac.fm.pos;
    const hdg = Math.atan2(ac.forward().x, ac.forward().z);
    const scale = (opts.scale ?? 0.32) * (w / 294); // px per metre
    const cx = x + w / 2, cy = y + h * 0.62;
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.translate(cx, cy);
    // Track-up: rotate world so heading points up the screen.
    g.rotate(hdg - Math.PI);
    g.scale(scale, scale);
    g.translate(-pos.x, -pos.z);
    // Terrain shading from the real height field (only where there is relief).
    if (this.relief?.shade && opts.terrain !== false) {
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
      g.strokeStyle = P.edge;
      g.lineWidth = 2 / scale;
      g.strokeRect(f.x0, f.z0, f.x1 - f.x0, f.z1 - f.z0);
    }
    // Flight track: thin grey where the boom was off, bright where spraying.
    if (this.trackN > 1) {
      const T = this.track, n = this.trackN, start = (this.trackHead - n + TRACK_MAX) % TRACK_MAX;
      for (const pass of [0, 1]) {
        g.strokeStyle = pass ? P.trackOn : 'rgba(210,220,210,0.45)';
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
      g.strokeStyle = nxt ? P.next : p.done > 0.85 ? 'rgba(120,200,120,0.35)' : 'rgba(200,230,200,0.35)';
      g.lineWidth = (nxt ? 3 : 1) / scale;
      g.beginPath();
      if (this.axis === 'x') { g.moveTo(this.l0 - 200, p.c); g.lineTo(this.l1 + 200, p.c); }
      else { g.moveTo(p.c, this.l0 - 200); g.lineTo(p.c, this.l1 + 200); }
      g.stroke();
    }
    g.restore();
    aircraftSymbol(g, cx, cy, ac.kind === 'heli');
    northArrow(g, x + w - 14 * fs, y + h * 0.42, hdg, fs, P);
    scaleBar(g, x + 8, y + h * 0.5, scale, fs, P);
    // Readouts
    g.fillStyle = P.main;
    g.font = `bold ${Math.round(15 * fs)}px monospace`;
    g.textAlign = 'left';
    const done = this.passes.filter((p) => p.done > 0.85).length;
    const names = this.job.fields.map((f) => f.name).join('+');
    g.fillText(`${names}`, x + 6, y + 17 * fs);
    g.font = `bold ${Math.round(13 * fs)}px monospace`;
    g.fillText(`PASS ${this.next ? this.next.k + 1 : '-'}/${this.passes.length}  DONE ${done}`, x + 6, y + 33 * fs);
    if (this.relief?.shade) {
      // Terrain under the aircraft and the talhões' elevation range (MSL, m).
      const gnd = this.game.world.terrain.heightAt(pos.x, pos.z) + UNITS.altOffsetM;
      g.fillStyle = P.terrain;
      g.font = `bold ${Math.round(12 * fs)}px monospace`;
      g.fillText(`GND ${Math.round(gnd)}m  FLD ${Math.round(this.relief.fmn + UNITS.altOffsetM)}-${Math.round(this.relief.fmx + UNITS.altOffsetM)}m`, x + 6, y + 48 * fs);
    }
    if (this.next && this.aligned) {
      const e = this.xte;
      g.textAlign = 'right';
      g.font = `bold ${Math.round(15 * fs)}px monospace`;
      g.fillStyle = Math.abs(e) < 0.75 ? P.good : Math.abs(e) > 4 ? P.warn : P.next;
      g.fillText(`${Math.abs(e) < 0.75 ? 'ON LINE' : (e > 0 ? 'R ' : 'L ') + Math.abs(e).toFixed(1) + 'm'}`, x + w - 6, y + 17 * fs);
    }
    // Bottom strip: progress bar, heading, ground speed, spray, covered and remaining area.
    const s = this.game.jobStats || this.job.stats();
    const remHa = Math.max(0, (1 - s.coverage) * this.job.ha);
    const covHa = Math.min(this.job.ha, s.coverage * this.job.ha);
    const lh = this._readoutStrip(g, x, y, w, h, fs, P, `${covHa.toFixed(1)}/${this.job.ha.toFixed(1)}ha REM ${remHa.toFixed(1)}`, `${Math.round(s.coverage * 100)}%`);
    // Mission progress bar (to the completion threshold).
    const by = y + h - lh * 2 - 13;
    g.fillStyle = P.track;
    g.fillRect(x, by, w, 3);
    g.fillStyle = P.main;
    g.fillRect(x, by, w * clamp(s.coverage / GAME.completeCoverage, 0, 1), 3);
  }

  _drawNav(g, x, y, w, h, fs, P, nav, opts) {
    const ac = this.game.aircraft;
    const pos = ac.fm.pos;
    const hdg = Math.atan2(ac.forward().x, ac.forward().z);
    // Range: the destination fits on the screen (1.5 .. 9 km across).
    const dist = nav ? Math.hypot(nav.x - pos.x, nav.z - pos.z) : 0;
    const span = clamp(nav ? dist * 2.4 : 2600, 1500, 9000);
    const scale = Math.min(w, h) / span;
    const cx = x + w / 2, cy = y + h * 0.6;
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.translate(cx, cy);
    g.rotate(hdg - Math.PI);
    g.scale(scale, scale);
    g.translate(-pos.x, -pos.z);
    const R = span * 0.9;
    // Talhões around: outlines (contract ones brighter).
    for (const f of FIELDS) {
      if (f.x1 < pos.x - R || f.x0 > pos.x + R || f.z1 < pos.z - R || f.z0 > pos.z + R) continue;
      const mine = this.job?.fields.includes(f);
      g.strokeStyle = mine ? P.next : f.contract ? P.edge : P.dim;
      g.globalAlpha = mine ? 1 : 0.6;
      g.lineWidth = (mine ? 2.2 : 1) / scale;
      g.strokeRect(f.x0, f.z0, f.x1 - f.x0, f.z1 - f.z0);
    }
    g.globalAlpha = 1;
    // Strips: main base and farm strips.
    for (const st of SITES) {
      const r = st.runway;
      g.fillStyle = st === this.game.site ? P.main : P.text;
      g.fillRect(r.x0, r.z - r.width, r.x1 - r.x0, r.width * 2);
    }
    // Course line to the destination.
    if (nav) {
      g.strokeStyle = P.next;
      g.setLineDash([12 / scale, 8 / scale]);
      g.lineWidth = 2 / scale;
      g.beginPath(); g.moveTo(pos.x, pos.z); g.lineTo(nav.x, nav.z); g.stroke();
      g.setLineDash([]);
    }
    g.restore();
    // Strip names (upright text at the rotated positions).
    const toScr = (wx, wz) => {
      const dx = (wx - pos.x) * scale, dz = (wz - pos.z) * scale;
      const a = hdg - Math.PI, c = Math.cos(a), sn = Math.sin(a);
      return [cx + dx * c - dz * sn, cy + dx * sn + dz * c];
    };
    g.font = `bold ${Math.round(10 * fs)}px monospace`;
    g.textAlign = 'center';
    for (const st of SITES) {
      const [sx, sy] = toScr((st.runway.x0 + st.runway.x1) / 2, st.runway.z);
      if (sx < x || sx > x + w || sy < y || sy > y + h) continue;
      g.fillStyle = st === this.game.site ? P.main : P.text;
      g.fillText(st.main ? 'BASE' : st.farm.short.toUpperCase(), sx, sy - 7);
    }
    aircraftSymbol(g, cx, cy, ac.kind === 'heli');
    northArrow(g, x + w - 14 * fs, y + 30 * fs, hdg, fs, P);
    scaleBar(g, x + 8, y + h * 0.52, scale, fs, P);
    g.textAlign = 'left';
    g.fillStyle = P.main;
    g.font = `bold ${Math.round(14 * fs)}px monospace`;
    if (nav) {
      const brg = Math.round(((Math.atan2(nav.x - pos.x, -(nav.z - pos.z)) * 180) / Math.PI + 360) % 360);
      const gsMs = Math.hypot(ac.fm.vel.x, ac.fm.vel.z);
      const ete = gsMs > 8 ? dist / gsMs : null;
      g.fillText(`NAV ${nav.name}`, x + 6, y + 17 * fs);
      g.font = `bold ${Math.round(13 * fs)}px monospace`;
      g.fillText(`${(dist / 1000).toFixed(1)}km BRG ${String(brg).padStart(3, '0')}°`, x + 6, y + 33 * fs);
      g.fillText(`ETE ${ete ? `${Math.floor(ete / 60)}:${String(Math.round(ete % 60)).padStart(2, '0')}` : '--:--'}`, x + 6, y + 48 * fs);
    } else {
      g.fillText(this.job ? 'NAV' : 'NO JOB · NAV', x + 6, y + 17 * fs);
    }
    void opts;
    this._readoutStrip(g, x, y, w, h, fs, P, latLon(pos.x, pos.z));
  }
}

// Unit colours per aircraft (screen background, text, accents).
const THEMES = {
  ipanema: { bg: '#081009', strip: 'rgba(4,10,6,0.82)', main: '#9ff0a4', text: '#cfe9d2', dim: '#5d7563', edge: '#d8f5d0', next: '#ffe14a', good: '#7dff8a', warn: '#ff8a6a', spray: '#ffd640', trackOn: 'rgba(255,214,64,0.9)', terrain: '#c9d8a0', fuel: '#e9c24a', load: '#7fc8ff', track: 'rgba(255,255,255,0.12)' },
  at502: { bg: '#0b0905', strip: 'rgba(14,10,4,0.85)', main: '#ffc35a', text: '#ffe6b8', dim: '#7a6a4c', edge: '#ffe2a8', next: '#7fe0ff', good: '#9dff86', warn: '#ff7056', spray: '#7fe0ff', trackOn: 'rgba(127,224,255,0.9)', terrain: '#e8c890', fuel: '#ffb347', load: '#7fe0ff', track: 'rgba(255,220,160,0.14)' },
  // Dromader: amber-on-black unit of an older install, red accents.
  m18: { bg: '#0c0806', strip: 'rgba(16,9,5,0.85)', main: '#ffb066', text: '#ffe2c4', dim: '#7d6250', edge: '#ffd9b0', next: '#9df0ff', good: '#a6ff8c', warn: '#ff6a52', spray: '#9df0ff', trackOn: 'rgba(157,240,255,0.9)', terrain: '#e3c49a', fuel: '#ffc24d', load: '#9df0ff', track: 'rgba(255,214,180,0.14)' },
  // Thrush: AG-NAV-style unit, green on a deep blue-black screen.
  thrush: { bg: '#060b12', strip: 'rgba(6,12,20,0.85)', main: '#7dffa0', text: '#e2f2ff', dim: '#5a6e80', edge: '#d8f0ff', next: '#ffe14a', good: '#7dff8a', warn: '#ff7a5a', spray: '#ffd640', trackOn: 'rgba(255,214,64,0.9)', terrain: '#c6dcb0', fuel: '#ffc85a', load: '#7fd0ff', track: 'rgba(220,240,255,0.14)' },
  // Bell 206: AGROWINGS NAV, a modern colour unit (white text, cyan route).
  b206: { bg: '#07101a', strip: 'rgba(5,12,22,0.86)', main: '#52d8ff', text: '#eef6ff', dim: '#5c7488', edge: '#d6f1ff', next: '#ffd23a', good: '#6cf5a0', warn: '#ff6f5e', spray: '#ffd23a', trackOn: 'rgba(255,210,58,0.9)', terrain: '#a9c9a4', fuel: '#ffc85a', load: '#52d8ff', track: 'rgba(200,235,255,0.14)' },
  // Ipanema 203: the EMB-202A's unit (provisional cockpit), green-blue.
  e203: { bg: '#05100b', strip: 'rgba(4,14,9,0.85)', main: '#7dffb0', text: '#e0f6ec', dim: '#5a7a6a', edge: '#d6f6e6', next: '#ffe14a', good: '#86ff9a', warn: '#ff7a5a', spray: '#ffd640', trackOn: 'rgba(255,214,64,0.9)', terrain: '#c6dcb8', fuel: '#ffd36a', load: '#7fd8ff', track: 'rgba(220,245,230,0.14)' },
  r44: { bg: '#050a10', strip: 'rgba(4,8,14,0.85)', main: '#8fe3ff', text: '#dff3ff', dim: '#56707e', edge: '#cfeeff', next: '#ffe14a', good: '#86ffb0', warn: '#ff7a6a', spray: '#ffd640', trackOn: 'rgba(255,214,64,0.9)', terrain: '#b9d6e6', fuel: '#ffd36a', load: '#8fe3ff', track: 'rgba(200,235,255,0.14)' },
};

function aircraftSymbol(g, cx, cy, heli) {
  g.fillStyle = '#ffffff';
  g.beginPath();
  if (heli) { g.arc(cx, cy, 4.5, 0, Math.PI * 2); g.fill(); g.fillRect(cx - 1, cy + 3, 2, 9); return; }
  g.moveTo(cx, cy - 10); g.lineTo(cx + 7, cy + 7); g.lineTo(cx, cy + 3); g.lineTo(cx - 7, cy + 7); g.closePath();
  g.fill();
}

// North pointer of the track-up map.
function northArrow(g, x, y, hdg, fs, P) {
  const r = 9 * fs;
  g.save();
  g.translate(x, y);
  g.strokeStyle = P.dim; g.lineWidth = 1;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
  // World -Z (north) in screen space after the map rotation (hdg - PI).
  const a = hdg - Math.PI;
  const nx = -Math.sin(a) * -1, nz = Math.cos(a) * -1;
  g.fillStyle = P.main;
  g.beginPath(); g.moveTo(nx * r, nz * r); g.lineTo(-nz * 3, nx * 3); g.lineTo(nz * 3, -nx * 3); g.closePath(); g.fill();
  g.font = `bold ${Math.round(8 * fs)}px monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('N', nx * (r + 7 * fs), nz * (r + 7 * fs));
  g.restore();
  g.textBaseline = 'alphabetic';
}

// Map scale: a round distance near 60 px.
function scaleBar(g, x, y, scale, fs, P) {
  const want = (60 * fs) / scale;
  const steps = [25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const m = steps.find((v) => v >= want * 0.7) ?? 5000;
  const px = m * scale;
  g.strokeStyle = P.dim; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 4); g.lineTo(x + px, y + 4); g.lineTo(x + px, y); g.stroke();
  g.fillStyle = P.dim; g.font = `${Math.round(9 * fs)}px monospace`; g.textAlign = 'left';
  g.fillText(m >= 1000 ? `${m / 1000}km` : `${m}m`, x + 2, y - 2);
}

// Position as the unit shows it (WGS-84, the farm in northern Mato Grosso).
const LAT0 = -11.8640, LON0 = -55.5020;
function latLon(x, z) {
  const lat = LAT0 - z / 111320, lon = LON0 + x / (111320 * Math.cos((LAT0 * Math.PI) / 180));
  const f = (v, d, pos, neg) => {
    const a = Math.abs(v), deg = Math.floor(a), min = (a - deg) * 60;
    return `${v >= 0 ? pos : neg}${String(deg).padStart(d, '0')}°${min.toFixed(2).padStart(5, '0')}'`;
  };
  return `${f(lat, 2, 'N', 'S')} ${f(lon, 3, 'E', 'W')}`;
}
