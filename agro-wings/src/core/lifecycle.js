// Browser lifecycle (phase 7): what the page does when it goes to the background, comes back, is
// rotated or resized, loses its WebGL context or has its audio interrupted. Nothing here touches the
// flight model: the simulation already integrates a fixed step from an accumulator with the frame
// time clamped to 0.1 s, so a long gap can never become a physics jump — the resume handler still
// resets the frame clock so the first frame after a return is an ordinary one.
//
//   hidden / pagehide / freeze : progress saved, a running flight is paused (the pause screen), the
//                                audio context suspended (no CPU in the background)
//   visible / pageshow / resume: frame clock reset, controller held, audio resumed (or on the next tap
//                                when the browser demands a gesture), stuck keys released
//   webglcontextlost / restored: rendering stops, the flight is paused, and when the browser gives the
//                                context back the sky lighting (PMREM target, whose contents are lost) is
//                                baked again; three.js re-creates its own GL state
//   resize / orientation / visualViewport: one debounced resize per animation frame
//   audio state 'interrupted' / 'suspended' while visible: resumed on the next gesture
import { t } from '../i18n/index.js';

export class Lifecycle {
  constructor(game, doc = document, win = window) {
    this.game = game; this.doc = doc; this.win = win;
    this.hidden = doc.visibilityState === 'hidden';
    this.contextLost = false;
    this.stats = { hides: 0, shows: 0, lost: 0, restored: 0, autoPaused: 0, resizes: 0 };
    this._raf = 0;
    const on = (el, ev, fn, o) => el.addEventListener(ev, fn, o);
    on(doc, 'visibilitychange', () => (doc.visibilityState === 'hidden' ? this.onHide() : this.onShow()));
    on(win, 'pagehide', () => this.onHide());
    on(win, 'pageshow', () => this.onShow());
    on(doc, 'freeze', () => this.onHide());
    on(doc, 'resume', () => this.onShow());
    const resize = () => this.scheduleResize();
    on(win, 'resize', resize);
    on(win, 'orientationchange', resize);
    win.screen?.orientation?.addEventListener?.('change', resize);
    win.visualViewport?.addEventListener?.('resize', resize);
    const c = game.canvas;
    on(c, 'webglcontextlost', (e) => { e.preventDefault(); this.onContextLost(); }, false);
    on(c, 'webglcontextrestored', () => this.onContextRestored(), false);
    // Audio: a call, the lock screen or another app can leave the context 'interrupted' (iOS) or 'suspended'.
    const kick = () => this.resumeAudio();
    on(win, 'pointerdown', kick, { passive: true });
    on(win, 'touchend', kick, { passive: true });
    on(win, 'keydown', kick);
    // iOS Safari ignores user-scalable=no: block its pinch-zoom gesture events (a no-op elsewhere).
    on(doc, 'gesturestart', (e) => e.preventDefault());
    on(doc, 'gesturechange', (e) => e.preventDefault());
    // Keep the screen awake while flying (phones lock after ~30 s without touches, tilt flying included).
    on(doc, 'visibilitychange', () => { if (doc.visibilityState === 'visible') this.updateWake(); });
    this._wakeT = setInterval(() => this.updateWake(), 4000);
  }

  // Screen Wake Lock where the browser offers it (Chrome / Edge / Android, Safari 16.4+); silently absent elsewhere.
  async updateWake() {
    const nav = this.win.navigator;
    if (!nav?.wakeLock || this.hidden) return;
    const want = !!this.game.playing && this.game.touch?.active;
    if (want && !this._wake) {
      try { this._wake = await nav.wakeLock.request('screen'); this._wake.addEventListener?.('release', () => { this._wake = null; }); this.stats.wakeLocks = (this.stats.wakeLocks || 0) + 1; } catch { this._wake = null; }
    } else if (!want && this._wake) { try { await this._wake.release(); } catch { /* ignore */ } this._wake = null; }
  }

  // What this browser offers, by feature (never by user-agent string); used by the docs / the test report.
  report() {
    const w = this.win, n = w.navigator, gl = this.game.renderer?.getContext?.();
    return {
      webgl2: !!gl, depthExt: this.game.depthMode, audio: w.AudioContext ? 'AudioContext' : w.webkitAudioContext ? 'webkitAudioContext' : 'none',
      pointerEvents: 'PointerEvent' in w, coarsePointer: !!w.matchMedia?.('(pointer: coarse)').matches,
      screenOrientation: !!w.screen?.orientation, visualViewport: !!w.visualViewport, wakeLock: !!n.wakeLock,
      deviceOrientation: typeof w.DeviceOrientationEvent !== 'undefined', orientationPermission: typeof w.DeviceOrientationEvent?.requestPermission === 'function',
      gamepad: !!n.getGamepads, dvhUnits: !!w.CSS?.supports?.('height: 100dvh'), pageLifecycle: 'onfreeze' in w.document || 'onfreeze' in w,
      deviceMemory: n.deviceMemory ?? null, cores: n.hardwareConcurrency ?? null, dpr: w.devicePixelRatio,
    };
  }

  get suspended() { return this.contextLost; }

  _audioCtx() { return this.game.audio?.ctx ?? null; }
  resumeAudio() {
    const c = this._audioCtx();
    if (!c || this.hidden || this.contextLost) return;
    if (c.state === 'suspended' || c.state === 'interrupted') c.resume?.().catch?.(() => {});
  }

  onHide() {
    if (this.hidden) return;
    this.hidden = true; this.stats.hides++;
    const g = this.game;
    try { g.career?.save(); } catch { /* ignore */ }
    // A flight in progress is paused instead of running (or being clamped) behind the player's back.
    if (g.playing && !g.screens?.open && !g.replay?.active) { g.screens.pause(); this.stats.autoPaused++; }
    g.input?.down?.clear?.();
    this._audioCtx()?.suspend?.().catch?.(() => {});
  }

  onShow() {
    if (!this.hidden) return;
    this.hidden = false; this.stats.shows++;
    const g = this.game;
    g.last = performance.now(); // the gap is not a frame
    g.perf?.hold?.(3);
    g.input?.down?.clear?.();
    this.resumeAudio();
    this.scheduleResize();
  }

  scheduleResize() {
    if (this._raf) return;
    this._raf = this.win.requestAnimationFrame(() => { this._raf = 0; this.stats.resizes++; this.game.resize(); });
  }

  onContextLost() {
    if (this.contextLost) return;
    this.contextLost = true; this.stats.lost++;
    const g = this.game;
    if (g.playing && !g.screens?.open && !g.replay?.active) g.screens.pause();
    g.toast?.(t('Graphics context lost — waiting for the browser to restore it.'));
  }

  onContextRestored() {
    this.stats.restored++;
    const g = this.game;
    try { g.world?.sky?.bakeEnv?.(); } catch (e) { console.error(e); }
    // Aircraft: GPU copies gone and some CPU copies released — built again.
    try { g.assets?.rebuildAll?.(); } catch (e) { console.error(e); }
    try { g.resize(); } catch { /* ignore */ }
    g.last = performance.now();
    this.contextLost = false;
    g.toast?.(t('Graphics restored.'));
  }
}
