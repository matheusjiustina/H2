// Adaptive performance controller: pure logic (no DOM, no three.js, the clock
// is passed in), so it is tested headless (test/adaptive.test.mjs).
//
// Input: one frame time per rendered frame. Output: at most one action per
// evaluation — {type:'fx', fx} (secondary effects: 0 full, 1 reduced),
// {type:'scale', scale} (dynamic resolution) or {type:'profile', profile,
// scale} (automatic mode only) — which the caller applies. Rules:
//   * Judges WINDOWS (3 s; 2 s while calibrating in the first 15 s), never a
//     single frame: a window is bad if its mean frame time is over
//     budget × 1.25 or over a quarter of its frames took > 1.5 × budget;
//     good if the mean is under budget × 0.72 and almost no frame is slow;
//     anything in between is neutral (hysteresis).
//   * Down: two bad windows in a row (one while calibrating), and at least
//     4 s since the last change (2.5 s calibrating). Secondary effects first
//     (particle budgets halved: cheap, nothing rebuilt), then resolution in
//     steps of 0.05 down to the profile's floor; in automatic mode, at the
//     floor, one profile down (if `canProfile` allows it now).
//   * Up (recovery): good windows adding up to 15 s, at least 20 s since the
//     last change × a back-off factor. Resolution first (steps of 0.05, up
//     to 1), then the effects back, then, in automatic mode, one profile up
//     (if `canProfile` allows it now — the game keeps profile changes, which
//     rebuild vegetation caches, out of the air).
//   * Oscillation guard: a down move within 60 s of an up move means the up
//     move failed → the up back-off doubles (max × 8, back to 1 after 5
//     quiet minutes) and a failed PROFILE up bars that profile for 5 min.
//   * Not counted: frames longer than 250 ms (resource loading, tab switch),
//     a hidden page, and the time after load / aircraft change / a change of
//     this controller (hold()).
//   * Manual profiles only ever change resolution, between 1 and their floor;
//     a manually chosen Ultra Original is never touched.
import { PROFILE_ORDER, PROFILES, allowsDynamicRes } from './perfProfiles.js';

export const DEFAULTS = Object.freeze({
  windowMs: 3000, calWindowMs: 2000, calMs: 15000,
  stallMs: 250, afterStallHoldMs: 1500, warmupMs: 2500,
  downRatio: 1.25, upRatio: 0.72, slowFrame: 1.5, slowShare: 0.25, goodSlowShare: 0.02,
  downWindows: 2, calDownWindows: 1,
  gapDownMs: 4000, calGapDownMs: 2500, gapUpMs: 20000, upGoodMs: 15000,
  step: 0.05, failWindowMs: 60000, barMs: 300000, backoffMax: 8, backoffResetMs: 300000,
});

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class AdaptiveController {
  constructor({ auto = false, profile = 'medio', scale = 1, budgetMs = 1000 / 60, maxProfile = 'ultra', cfg = {} } = {}) {
    this.cfg = { ...DEFAULTS, ...cfg };
    this.auto = auto; this.profile = profile; this.scale = scale;
    this.budgetMs = budgetMs; this.maxProfile = maxProfile;
    this.frozen = false;
    this.fx = 0; // secondary effects: 0 full, 1 reduced
    this.canProfile = () => true; // (dir, now) → may a profile change happen now?
    this.reset(0, true);
    this.log = []; // last actions, for tests and the diagnostics
  }

  reset(now = 0, full = false) {
    this.holdUntil = now + this.cfg.warmupMs;
    this.win = null; this.badStreak = 0; this.goodMs = 0;
    if (full) {
      this.t0 = null; this.lastChange = -1e9; this.lastUp = null; this.backoff = 1; this.quietSince = now;
      this.bar = null; this.stalls = 0; this.frames = 0;
    }
  }

  // New profile / mode chosen by the player or the caller: start over.
  configure({ auto, profile, scale = 1 }, now = 0) {
    if (auto !== undefined) this.auto = auto;
    if (profile !== undefined) this.profile = profile;
    this.scale = scale;
    this.fx = 0;
    this.reset(now, true);
  }
  hold(now, ms) { this.holdUntil = Math.max(this.holdUntil, now + ms); this.win = null; this.badStreak = 0; }
  setBudget(ms) { this.budgetMs = ms; this.win = null; }
  get dynamicRes() { return allowsDynamicRes(this.profile, this.auto); }
  get active() { return !this.frozen && (this.auto || this.dynamicRes); }

  push(dt, now) {
    if (!this.active) return null;
    const c = this.cfg;
    this.frames++;
    if (this.t0 == null) this.t0 = now;
    const hidden = typeof document !== 'undefined' && document.hidden;
    if (dt > c.stallMs || hidden) { this.stalls++; this.hold(now, c.afterStallHoldMs); return null; }
    if (now < this.holdUntil) { this.win = null; return null; }
    const cal = now - this.t0 < c.calMs;
    const W = this.win ??= { t: now, sum: 0, n: 0, slow: 0 };
    W.sum += dt; W.n++;
    if (dt > this.budgetMs * c.slowFrame) W.slow++;
    if (now - W.t < (cal ? c.calWindowMs : c.windowMs) || W.n < 8) return null;
    this.win = null;
    const mean = W.sum / W.n, slowShare = W.slow / W.n, B = this.budgetMs;
    const bad = mean > B * c.downRatio || slowShare > c.slowShare;
    const good = mean < B * c.upRatio && slowShare <= c.goodSlowShare;
    const winMs = now - W.t;
    if (bad) { this.badStreak++; this.goodMs = 0; } else if (good) { this.goodMs += winMs; this.badStreak = 0; } else { this.badStreak = 0; this.goodMs = 0; }
    if (now - this.quietSince > c.backoffResetMs && this.backoff > 1) this.backoff = 1;
    if (bad && this.badStreak >= (cal ? c.calDownWindows : c.downWindows) && now - this.lastChange >= (cal ? c.calGapDownMs : c.gapDownMs)) {
      this.badStreak = 0;
      return this._record(this._down(now), now, -1);
    }
    if (good && this.goodMs >= c.upGoodMs && now - this.lastChange >= c.gapUpMs * this.backoff) {
      this.goodMs = 0;
      return this._record(this._up(now), now, +1);
    }
    return null;
  }

  _floor() { return PROFILES[this.profile].resMin; }

  _down(now) {
    const c = this.cfg;
    if (this.lastUp && now - this.lastUp.t < c.failWindowMs) { // the last up move did not hold
      this.backoff = Math.min(c.backoffMax, this.backoff * 2);
      if (this.lastUp.kind === 'profile') this.bar = { profile: this.lastUp.to, until: now + c.barMs };
      this.lastUp = null;
    }
    if (this.fx < 1) return { type: 'fx', fx: 1 };
    if (this.dynamicRes && this.scale > this._floor() + 1e-6) return { type: 'scale', scale: +Math.max(this._floor(), this.scale - c.step).toFixed(3) };
    if (this.auto && this.canProfile(-1, now)) {
      const i = PROFILE_ORDER.indexOf(this.profile);
      if (i > 0) return this._moveProfile(PROFILE_ORDER[i - 1]);
    }
    return null; // at the floor of what is allowed
  }

  _up(now) {
    const c = this.cfg;
    if (this.dynamicRes && this.scale < 1 - 1e-6) return { type: 'scale', scale: +Math.min(1, this.scale + c.step).toFixed(3), up: true };
    if (this.fx > 0) return { type: 'fx', fx: 0, up: true };
    if (this.auto && this.canProfile(+1, now)) {
      const i = PROFILE_ORDER.indexOf(this.profile), top = PROFILE_ORDER.indexOf(this.maxProfile);
      const next = PROFILE_ORDER[i + 1];
      if (next && i + 1 <= top && !(this.bar && this.bar.profile === next && now < this.bar.until)) return { ...this._moveProfile(next), up: true, kind: 'profile' };
    }
    return null;
  }

  // The new profile starts at the scale that keeps the effective pixel ratio
  // about the same (no visible jump), within its own limits.
  _moveProfile(next) {
    const cur = PROFILES[this.profile], nx = PROFILES[next];
    const sc = clamp((cur.quality.pixelRatio * this.scale) / nx.quality.pixelRatio, nx.resMin, 1);
    return { type: 'profile', profile: next, scale: +sc.toFixed(3) };
  }

  _record(a, now, dir) {
    if (!a) return null;
    this.lastChange = now; this.quietSince = now;
    if (dir > 0) this.lastUp = { t: now, kind: a.type === 'profile' ? 'profile' : 'scale', to: a.profile ?? this.profile };
    if (a.type === 'scale') this.scale = a.scale;
    else if (a.type === 'fx') this.fx = a.fx;
    else { this.profile = a.profile; this.scale = a.scale; this.fx = 0; } // a new profile brings its own effect budgets
    this.holdUntil = now + 1500; this.win = null; // the change itself may stall a frame
    this.log.push({ t: now, ...a }); if (this.log.length > 40) this.log.shift();
    return a;
  }
}
