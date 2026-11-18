// Phase 05 — errors, fail-safe screen and an optional diagnostics panel.
//
//  * Every uncaught error and unhandled promise rejection is kept in a small
//    ring (no network, nothing leaves the page).
//  * failSafe(): when the game cannot go on (the frame loop keeps throwing,
//    the WebGL context never comes back) the player gets a clear screen with
//    a Restart button — the page is reloaded only on that click, never by
//    itself, so there is no reload loop. Saved progress is written first.
//  * The diagnostics panel exists only with `?diag` on the URL (absent from
//    the public game otherwise); Ctrl+Shift+D shows / hides it. It reads
//    what the renderer and the browser already expose and shows
//    "unavailable" for what they do not (e.g. JS heap outside Chromium).
import { t } from '../i18n/index.js';

const MAX = 30;

export class Diagnostics {
  constructor(game, win = window) {
    this.game = game; this.win = win;
    this.errors = [];
    this.t0 = performance.now();
    this.readyMs = null;
    this.enabled = (() => { try { return new URLSearchParams(win.location.search).has('diag'); } catch { return false; } })();
    this.failed = false;
    win.addEventListener('error', (e) => this.record('error', e.message || String(e.error || 'error'), e.filename ? `${e.filename.split('/').pop()}:${e.lineno}` : ''));
    win.addEventListener('unhandledrejection', (e) => this.record('promise', String(e.reason?.message ?? e.reason ?? 'rejection'), ''));
    if (this.enabled) win.addEventListener('keydown', (e) => { if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) { e.preventDefault(); this.toggle(); } });
  }

  record(kind, msg, where = '') {
    this.errors.push({ t: +((performance.now() - this.t0) / 1000).toFixed(1), kind, msg: String(msg).slice(0, 200), where });
    if (this.errors.length > MAX) this.errors.shift();
  }

  ready() { if (this.readyMs == null) this.readyMs = Math.round(performance.now() - this.t0); }

  // Measured values only; null = the browser does not expose it.
  snapshot() {
    const g = this.game, r = g.renderer, n = Math.min(g.frameN ?? 0, g.frameMs?.length ?? 0);
    let fps = null, avg = null, p95 = null, p99 = null;
    if (n > 10) {
      const a = Array.from(g.frameMs.slice(0, n)).filter((x) => x > 0).sort((x, y) => x - y);
      avg = a.reduce((s, x) => s + x, 0) / a.length;
      fps = 1000 / avg;
      p95 = a[Math.floor(a.length * 0.95)]; p99 = a[Math.floor(a.length * 0.99)];
    }
    const last = n ? g.frameMs[(g.frameN - 1 + g.frameMs.length) % g.frameMs.length] : null;
    const gl = r?.getContext?.();
    const mem = performance.memory;
    return {
      fps, frameMs: last, avgMs: avg, p95, p99,
      profile: g.perf?.label?.() ?? null,
      internal: g.canvas ? `${g.canvas.width}×${g.canvas.height}` : null,
      pixelRatio: r?.getPixelRatio?.() ?? null,
      calls: r?.info?.render?.calls ?? null, triangles: r?.info?.render?.triangles ?? null,
      textures: r?.info?.memory?.textures ?? null, geometries: r?.info?.memory?.geometries ?? null,
      heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
      webgl: g.lifecycle?.contextLost || gl?.isContextLost?.() ? 'lost' : gl ? 'ok' : null,
      loadMs: this.readyMs,
      errors: this.errors.length,
    };
  }

  toggle() {
    if (!this.enabled) return;
    if (this.el) { clearInterval(this._iv); this.el.remove(); this.el = null; return; }
    const el = this.el = this.win.document.createElement('pre');
    el.className = 'diagPanel';
    el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:9999;margin:0;padding:8px 10px;max-width:46ch;background:rgba(0,0,0,.72);color:#cfe8c8;font:11px/1.35 ui-monospace,monospace;pointer-events:none;white-space:pre-wrap;border-radius:6px';
    this.win.document.body.appendChild(el);
    const NA = t('unavailable');
    const f = (v, d = 0, u = '') => (v == null ? NA : `${(+v).toFixed(d)}${u}`);
    const draw = () => {
      const s = this.snapshot();
      el.textContent = [
        `FPS ${f(s.fps, 1)}  ·  ${t('frame')} ${f(s.frameMs, 1, ' ms')}`,
        `${t('avg')} ${f(s.avgMs, 1, ' ms')}  p95 ${f(s.p95, 1, ' ms')}  p99 ${f(s.p99, 1, ' ms')}`,
        `${t('quality')} ${s.profile ?? NA}`,
        `${t('internal resolution')} ${s.internal ?? NA}  (×${f(s.pixelRatio, 2)})`,
        `draw calls ${f(s.calls)}  ·  ${t('triangles')} ${f(s.triangles)}`,
        `${t('textures')} ${f(s.textures)}  ·  ${t('geometries')} ${f(s.geometries)}`,
        `JS heap ${f(s.heapMB, 0, ' MB')}`,
        `WebGL ${s.webgl ?? NA}  ·  ${t('load')} ${f(s.loadMs == null ? null : s.loadMs / 1000, 1, ' s')}`,
        `${t('errors')} ${s.errors}`,
        ...this.errors.slice(-5).map((e) => `  ${e.t}s ${e.kind}: ${e.msg}${e.where ? ' @' + e.where : ''}`),
      ].join('\n');
    };
    draw();
    this._iv = setInterval(draw, 500); // only while the panel is open
  }

  // The game cannot continue: a clear screen and a Restart button (reload on
  // the player's click only). Shown once.
  failSafe(reason) {
    if (this.failed) return;
    this.failed = true;
    this.record('fatal', reason);
    try { this.game.career?.save(); } catch { /* ignore */ }
    try { this.game.renderer?.setAnimationLoop(null); } catch { /* ignore */ }
    const doc = this.win.document, root = doc.getElementById('ui') ?? doc.body;
    const box = doc.createElement('div');
    box.className = 'fatal failsafe';
    const h = doc.createElement('h1'); h.textContent = t('Agro Wings had to stop');
    const p = doc.createElement('p'); p.textContent = t('Your saved progress is kept. Restarting the game usually solves it.');
    const d = doc.createElement('p'); d.style.opacity = '0.6'; d.style.fontSize = '12px'; d.textContent = String(reason).slice(0, 160);
    const b = doc.createElement('button'); b.className = 'btn'; b.textContent = t('Restart');
    b.addEventListener('click', () => this.win.location.reload());
    box.append(h, p, d, b);
    root.appendChild(box);
    this._box = box;
  }

  // A fail-safe shown because the GPU context was gone, and it came back:
  // the screen goes and the game loop runs again.
  clearFailSafe() {
    if (!this.failed) return;
    this.failed = false;
    this._box?.remove(); this._box = null;
    try { this.game.renderer?.setAnimationLoop(() => this.game.frame()); } catch { /* ignore */ }
  }
}
