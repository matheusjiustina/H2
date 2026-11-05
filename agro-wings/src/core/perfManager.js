// Glue between the game and the adaptive controller (src/core/adaptive.js):
// resolves the profile (settings / URL / old saves), applies it through the
// same paths the quality setting always used (world.setQuality, the pixel
// ratio, the spray particle limit), feeds the controller the frame times,
// and implements the optional FPS cap. No loop of its own: Game.frame() calls
// gate() and update().
import { AdaptiveController } from './adaptive.js';
import { PROFILES, PROFILE_ORDER, normalizeProfile, pixelRatioFor, LEGACY_TO_PROFILE } from './perfProfiles.js';
import { detectCapabilities } from './capabilities.js';
import { t } from '../i18n/index.js';

export const FPS_LIMITS = [0, 30, 60]; // 0 = none

export class PerfManager {
  constructor(game, search = typeof location !== 'undefined' ? location.search : '') {
    this.game = game;
    const s = game.settings;
    const q = normalizeProfile(new URLSearchParams(search).get('q'));
    // Settings: profile 'auto' | a profile id. Old saves had quality
    // low / medium / high plus qualityAuto: a manual choice maps over, an
    // automatic one starts in auto.
    let p = normalizeProfile(s.profile);
    if (!p) p = s.qualityAuto === false ? (LEGACY_TO_PROFILE[s.quality] ?? 'auto') : 'auto';
    this.forced = !!q; // ?q= pins the profile for the session (benchmarks, tests): manual, no adaptation
    if (q) p = q;
    s.profile = p;
    this.mode = p === 'auto' ? 'auto' : 'manual';
    this.caps = null;
    this.profileId = this.mode === 'auto' ? (PROFILES[s.autoLast] ? s.autoLast : 'medio') : p; // refined in init()
    this.ctl = new AdaptiveController({ auto: this.mode === 'auto', profile: this.profileId, budgetMs: this._budget() });
    if (this.forced) this.ctl.frozen = true;
    this.lastFrame = 0; this.costUs = 0; this.costN = 0; this.ready = false;
    this._syncLegacy();
  }

  get profile() { return PROFILES[this.profileId]; }
  get quality() { return this.profile.quality; }
  get scale() { return this.ctl.scale; }
  get auto() { return this.mode === 'auto'; }

  _budget() { const lim = this.game.settings.fpsLimit; return 1000 / (lim > 0 ? Math.min(60, lim) : 60); }
  _syncLegacy() { this.game.settings.quality = this.profile.legacy; } // old code / saves keep reading settings.quality

  // After the renderer exists: capabilities and, in auto, the starting rung.
  init() {
    const g = this.game;
    this.caps = detectCapabilities(g.renderer);
    if (this.auto) {
      const idx = (id) => PROFILE_ORDER.indexOf(id);
      const saved = PROFILES[g.settings.autoLast] ? g.settings.autoLast : null;
      // The rung measured on this device last time wins, else the hint;
      // never above 'alto' to start (Ultra Original has to be earned by the
      // measurements); no WebGL2 / software rendering → the lowest rung.
      let i = Math.min(idx(saved ?? this.caps.startProfile), idx('alto'));
      if (!this.caps.webgl2 || this.caps.software) i = 0;
      this.profileId = PROFILE_ORDER[i];
      this.ctl.configure({ auto: true, profile: this.profileId, scale: 1 }, performance.now());
    }
    this.ready = true;
    this._syncLegacy();
    this.ctl.setBudget(this._budget());
    this.apply({ initial: true });
  }

  // Applies profile + scale. Everything goes through the paths that already
  // existed, so Ultra Original (scale 1) is exactly the previous setup.
  // `scaleOnly`: only the resolution factor changed — the world modules are
  // left alone (their setQuality would rebuild grass and crop caches).
  apply({ initial = false, scaleOnly = false } = {}) {
    const g = this.game, P = this.profile;
    g.quality = P.quality;
    this._syncLegacy();
    this.refreshRatio(true);
    if (initial) return;
    if (!scaleOnly) {
      g.world?.setQuality(P.quality);
      if (g.mist) g.mist.limit = Math.min(g.mist.max, P.particles);
      g.waterFx?.setQuality?.(P.particles); // splash / spray (src/world/waterFx.js)
      g.fires?.setQuality?.(P.particles); // flames and smoke density (src/world/fires.js)
    }
    g.resize();
  }

  refreshRatio(force = false) {
    const g = this.game;
    if (!g.renderer) return;
    const r = pixelRatioFor(this.profile, this.ctl.scale, window.devicePixelRatio, window.innerWidth, window.innerHeight);
    if (force || Math.abs(g.renderer.getPixelRatio() - r) > 1e-3) g.renderer.setPixelRatio(r);
  }

  // Player choice: 'auto' or a profile id. Manual choices reset the controller.
  setProfile(id) {
    const p = normalizeProfile(id) ?? 'auto';
    const g = this.game;
    g.settings.profile = p;
    this.mode = p === 'auto' ? 'auto' : 'manual';
    this.forced = false; this.ctl.frozen = false;
    if (this.auto) {
      const start = PROFILES[g.settings.autoLast] ? g.settings.autoLast : (this.caps?.startProfile ?? 'medio');
      this.profileId = PROFILE_ORDER[Math.min(PROFILE_ORDER.indexOf(start), PROFILE_ORDER.indexOf('alto'))];
    } else this.profileId = p;
    this.ctl.configure({ auto: this.auto, profile: this.profileId, scale: 1 }, performance.now());
    this.ctl.setBudget(this._budget());
    if (this.ready) this.apply();
  }

  setFpsLimit(v) {
    this.game.settings.fpsLimit = FPS_LIMITS.includes(+v) ? +v : 0;
    this.ctl.setBudget(this._budget());
    this.ctl.hold(performance.now(), 2000);
  }

  // Back to the defaults of the graphics section.
  restoreDefaults() {
    const s = this.game.settings;
    s.fpsLimit = 0; s.showFps = false; s.autoLast = null;
    this.setProfile('auto');
  }

  hold(sec = 3) { this.ctl.hold(performance.now(), sec * 1000); }
  freeze(on) { this.ctl.frozen = !!on || this.forced; }

  // FPS cap: true when this animation callback should be skipped. The next
  // processed frame sees the whole elapsed time, so the game stays correct.
  gate(now) {
    const lim = this.game.settings.fpsLimit;
    if (!(lim > 0)) { this.lastFrame = now; return false; }
    if (now - this.lastFrame < 1000 / lim - 2) return true;
    this.lastFrame = now;
    return false;
  }

  update(now, dtMs) {
    const t0 = performance.now();
    const a = this.ctl.push(dtMs, now);
    if (a) {
      const profChanged = a.type === 'profile';
      if (profChanged) {
        this.profileId = a.profile;
        this.game.setSetting('autoLast', a.profile, true);
      }
      this.apply({ scaleOnly: !profChanged });
      if (profChanged) this.game.toast?.(t('Automatic quality: {0}', t(this.profile.label)));
    }
    this.costUs += (performance.now() - t0) * 1000; this.costN++;
  }

  label() { const P = this.profile; return `${this.auto ? 'auto · ' : ''}${P.id} ${Math.round(this.ctl.scale * 100)}%`; }
  stats() { return { mode: this.mode, profile: this.profileId, scale: this.ctl.scale, forced: this.forced, costUsPerFrame: this.costN ? +(this.costUs / this.costN).toFixed(2) : 0, stalls: this.ctl.stalls, backoff: this.ctl.backoff, log: this.ctl.log.slice(-8), caps: this.caps }; }
}
