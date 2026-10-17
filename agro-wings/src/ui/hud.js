// HUD: minimal permanent readouts, job card, minimap, contextual warnings,
// toasts, prompts, crew status and tutorial card.
import { SPRAY, GAME } from '../config.js';
import { buildBaseMap, drawMap } from './maps.js';
import { keyLabel } from '../core/input.js';

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

export class HUD {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.el = h(`<div class="hud">
      <div class="vignette"></div>
      <div class="jobcard"><div class="t"></div><div class="s s1"></div><div class="bar"><span></span></div><div class="s s2"></div></div>
      <div class="crew"><div class="h">Ground crew</div><div class="msg"></div>
        <div class="levels"><div>Fuel <b class="lf"></b><div class="bar"><span class="bf"></span></div></div><div>Hopper <b class="lh"></b><div class="bar blue"><span class="bh"></span></div></div></div>
        <div class="s hint" style="margin-top:6px;color:var(--ink-faint)"></div></div>
      <div class="toasts"></div>
      <div class="warnings"></div>
      <div class="prompt interactive"></div>
      <div class="spraybadge">SPRAY ON</div>
      <div class="readouts">
        <div class="ro r-spd"><span class="l">Speed</span><span class="v">0<span class="u">kt</span></span></div>
        <div class="ro r-hgt"><span class="l">Height</span><span class="v">0<span class="u">m</span></span></div>
        <div class="ro r-g"><span class="l">Load</span><span class="v">1.0<span class="u">G</span></span></div>
        <div class="ro r-pwr"><span class="l">Power</span><span class="v">0<span class="u">%</span></span></div>
        <div class="ro r-fuel"><span class="l">Fuel</span><span class="v">0<span class="u">L</span></span><div class="bar"><span></span></div></div>
        <div class="ro r-hop"><span class="l">Hopper</span><span class="v">0<span class="u">L</span></span><div class="bar blue"><span></span></div></div>
      </div>
      <div class="minimap"><canvas width="352" height="352"></canvas></div>
      <div class="tut interactive"><div class="step"></div><div class="txt"></div><div class="row"><span class="dim" style="font-size:11px;color:var(--ink-faint)"></span><button class="btn small skip">Skip tutorial</button></div></div>
      <div class="fps"></div>
    </div>`);
    root.appendChild(this.el);
    const q = (s) => this.el.querySelector(s);
    this.$ = {
      job: q('.jobcard'), jobT: q('.jobcard .t'), jobS1: q('.jobcard .s1'), jobS2: q('.jobcard .s2'), jobBar: q('.jobcard .bar span'),
      crew: q('.crew'), crewMsg: q('.crew .msg'), lf: q('.crew .lf'), lh: q('.crew .lh'), bf: q('.crew .bf'), bh: q('.crew .bh'), crewHint: q('.crew .hint'),
      toasts: q('.toasts'), warnings: q('.warnings'), prompt: q('.prompt'), spray: q('.spraybadge'),
      spd: q('.r-spd'), hgt: q('.r-hgt'), gl: q('.r-g'), pwr: q('.r-pwr'), fuel: q('.r-fuel'), hop: q('.r-hop'),
      mini: q('.minimap canvas'), tut: q('.tut'), tutStep: q('.tut .step'), tutTxt: q('.tut .txt'), tutDim: q('.tut .dim'),
      fps: q('.fps'), vig: q('.vignette'),
    };
    this.$.tut.querySelector('.skip').addEventListener('click', () => game.tutorial?.skip());
    this.$.prompt.addEventListener('click', () => this.promptAction?.());
    // Click the minimap to switch it between the farm map and the GPS page.
    this.$.mini.parentElement.classList.add('interactive');
    this.$.mini.addEventListener('click', () => this.toggleGps());
    this.base = buildBaseMap(1024);
    this.miniT = 0;
    this.warnState = '';
    this.fpsAcc = { t: 0, n: 0, v: 0 };
  }

  show(v) { this.el.classList.toggle('show', v); }

  toggleGps() {
    const g = this.game;
    g.setSetting('hudGps', !g.settings.hudGps);
    this.miniT = 0;
    if (g.settings.hudGps && !g.job) this.toast('GPS guidance shows passes once a job is active.');
  }

  toast(msg, dur = 4.5) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    this.$.toasts.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 500); }, dur * 1000);
    while (this.$.toasts.children.length > 4) this.$.toasts.firstChild.remove();
  }

  setPrompt(html, action) {
    if (!html) { this.$.prompt.classList.remove('show'); this.promptAction = null; this._prompt = ''; return; }
    if (html !== this._prompt) this.$.prompt.innerHTML = html;
    this._prompt = html;
    this.promptAction = action;
    this.$.prompt.classList.add('show');
  }

  key(action) { return `<span class="k">${keyLabel(this.game.input.bindings[action][0])}</span>`; }

  setTutorial(stepLabel, text, foot) {
    if (!text) { this.$.tut.classList.remove('show'); return; }
    this.$.tut.classList.add('show');
    this.$.tutStep.textContent = stepLabel;
    if (this.$.tutTxt.innerHTML !== text) this.$.tutTxt.innerHTML = text;
    this.$.tutDim.textContent = foot || '';
  }

  update(dt) {
    const g = this.game;
    const ac = g.aircraft;
    const t = ac.telemetry();
    const $ = this.$;
    // Readouts
    // Airspeed in flight; ground speed while taxiing (an ASI reads nothing useful there).
    $.spd.querySelector('.l').textContent = t.onGround ? 'Gnd spd' : 'Speed';
    $.spd.querySelector('.v').firstChild.nodeValue = String(Math.round(t.onGround ? t.gs : t.ias));
    const overCrop = ac.env.cropHeight(ac.fm.pos.x, ac.fm.pos.z) > 0;
    $.hgt.querySelector('.l').textContent = overCrop ? 'Hgt crop' : 'Hgt gnd';
    $.hgt.querySelector('.v').firstChild.nodeValue = t.hgt > 99 ? Math.round(t.hgt).toString() : t.hgt.toFixed(1);
    const sprayingNow = g.sprayer.on;
    $.hgt.className = 'ro r-hgt' + (sprayingNow ? (t.hgt < 1.5 ? ' bad' : t.hgt > 6 ? ' warn' : t.hgt >= SPRAY.idealHeight[0] && t.hgt <= SPRAY.idealHeight[1] ? ' good' : '') : '');
    // Load factor (smoothed): what the pull-up and the balão cost the wing.
    if (t.heli) {
      // Helicopter: main-rotor speed (%) in place of the load factor.
      if (!this._heliRo) { $.gl.querySelector('.l').textContent = 'Rotor'; $.gl.querySelector('.u').textContent = '%'; this._heliRo = true; }
      $.gl.querySelector('.v').firstChild.nodeValue = String(Math.round(t.rotorPct));
      $.gl.className = 'ro r-g' + (t.rotorPct < 1 ? ' dim' : t.lowRotor ? ' bad' : t.rotorPct < 97 || t.rotorPct > 108 ? ' warn' : '');
    } else {
      if (this._heliRo) { $.gl.querySelector('.l').textContent = 'Load'; $.gl.querySelector('.u').textContent = 'G'; this._heliRo = false; }
      this.gs = (this.gs ?? 1) + (t.g - (this.gs ?? 1)) * Math.min(1, dt * 6);
      $.gl.querySelector('.v').firstChild.nodeValue = t.onGround ? '1.0' : this.gs.toFixed(1);
      $.gl.className = 'ro r-g' + (t.onGround || Math.abs(this.gs - 1) < 0.25 ? ' dim' : this.gs > 3.3 ? ' bad' : this.gs > 2.2 ? ' warn' : '');
    }
    $.pwr.querySelector('.v').firstChild.nodeValue = String(Math.round(t.power * 100));
    $.fuel.querySelector('.v').firstChild.nodeValue = String(Math.round(t.fuel));
    $.fuel.querySelector('.bar span').style.width = `${(t.fuel / t.fuelCap) * 100}%`;
    $.fuel.className = 'ro r-fuel' + (t.fuel < t.fuelCap * 0.15 ? ' bad' : '');
    $.hop.querySelector('.v').firstChild.nodeValue = String(Math.round(t.hopper));
    $.hop.querySelector('.bar span').style.width = `${(t.hopper / t.hopperCap) * 100}%`;
    // Spray badge
    $.spray.classList.toggle('show', sprayingNow || (g.job && !t.onGround));
    $.spray.classList.toggle('off', !sprayingNow);
    $.spray.textContent = sprayingNow ? (g.sprayer.flowNow > 0 ? `SPRAY ON · ${(g.sprayer.flowNow * 60).toFixed(0)} L/min` : 'SPRAY ON · NO FLOW') : `SPRAY OFF · ${keyLabel(g.input.bindings.spray[0])}`;
    // Job card
    if (g.job) {
      $.job.classList.add('show');
      const s = g.jobStats || g.job.stats();
      $.jobT.textContent = g.job.c.title;
      $.jobS1.textContent = `${g.job.ha.toFixed(1)} ha · ${g.job.crop} · sortie ${Math.max(1, g.job.sorties)}`;
      $.jobBar.style.width = `${Math.min(100, (s.coverage / GAME.completeCoverage) * 100)}%`;
      const gd = g.guidance;
      const passes = gd.passes.length ? `pass ${gd.next ? gd.next.k + 1 : '—'}/${gd.passes.length}` : '';
      $.jobS2.textContent = `${Math.round(s.coverage * 100)}% covered · ${passes}${s.overlap > 0.02 ? ` · overlap ${Math.round(s.overlap * 100)}%` : ''}${g.job.complete() ? ' · COMPLETE — return to base' : ''}`;
    } else $.job.classList.remove('show');
    // Crew card
    const sv = g.service;
    if (sv.busy()) {
      $.crew.classList.add('show');
      $.crewMsg.textContent = sv.message;
      $.lf.textContent = `${Math.round(ac.fm.fuel)} / ${Math.round(sv.target.fuel)} L`;
      $.lh.textContent = `${Math.round(ac.fm.hopper)} / ${Math.round(sv.target.liquid)} L`;
      $.bf.style.width = `${(ac.fm.fuel / ac.A.fuelCapacity) * 100}%`;
      $.bh.style.width = `${(ac.fm.hopper / ac.A.hopperCapacity) * 100}%`;
      $.crewHint.innerHTML = `Hold <span class="k">T</span> to speed up · ${this.key('orbit')} free camera`;
    } else $.crew.classList.remove('show');
    // Warnings (only when needed)
    const w = g.warnings();
    const ws = w.map((x) => x.text + x.cls).join('|');
    if (ws !== this.warnState) {
      this.warnState = ws;
      $.warnings.innerHTML = w.map((x) => `<div class="warning ${x.cls}">${x.text}</div>`).join('');
    }
    $.vig.classList.toggle('show', t.stall > 0.5 && !t.onGround);
    // Minimap at 10 Hz
    this.miniT -= dt;
    if (this.miniT <= 0) {
      this.miniT = 0.1;
      const c = $.mini;
      const gctx = c.getContext('2d');
      const yaw = ac.fm.heading();
      $.mini.parentElement.classList.toggle('gps', !!(g.settings.hudGps && g.job));
      if (g.settings.hudGps && g.job) {
        // GPS guidance page (same as the cockpit unit, larger text).
        gctx.save();
        g.guidance.draw(gctx, 0, 0, c.width, c.height, { big: true, scale: 0.3 });
        gctx.restore();
        this._fps(dt);
        return;
      }
      drawMap(gctx, c.width, c.height, this.base, g, { cx: ac.fm.pos.x, cz: ac.fm.pos.z, range: 650, rot: yaw - Math.PI });
      // North tick
      gctx.save();
      gctx.translate(c.width / 2, c.height / 2);
      gctx.rotate(yaw - Math.PI);
      gctx.fillStyle = '#fff';
      gctx.font = 'bold 22px Arial';
      gctx.textAlign = 'center';
      gctx.fillText('N', 0, -c.height / 2 + 26);
      gctx.restore();
    }
    this._fps(dt);
  }

  _fps(dt) {
    const g = this.game, $ = this.$;
    const f = this.fpsAcc;
    f.t += dt; f.n++;
    if (f.t >= 0.5) { f.v = f.n / f.t; f.t = 0; f.n = 0; }
    $.fps.classList.toggle('show', !!g.settings.showFps);
    if (g.settings.showFps) {
      const st = g.frameStats?.(120) ?? { avg: 0, p95: 0 };
      $.fps.textContent = `${f.v.toFixed(0)} fps · ${st.avg.toFixed(1)} ms avg / ${st.p95.toFixed(1)} p95 · ${g.renderer.info.render.calls} calls · ${(g.renderer.info.render.triangles / 1000).toFixed(0)}k tris · ${g.settings.quality}`;
    }
  }
}

export { h };
