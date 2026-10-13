import * as THREE from 'three';
import { RELICS, RARITY, NOTES, MISSIONS, MISSION_ORDER, CONTAINERS } from '../systems/Content.js';
import { ARCHIPELAGO_POIS } from '../world/Archipelago.js';

const h = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const para = (s) => esc(s).replace(/\n/g, '<br>');
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const dist = (d) => (d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`);

const KIND = { story: 'Signal Lost', boat: 'Skiff', plane: 'Seaplane', side: 'Discovery' };
const STATE = { available: 'Available', active: 'Active', completed: 'Completed', failed: 'Failed' };

// line-art glyphs for the relics (viewBox 48)
const GLYPH = {
  coin: '<circle cx="24" cy="24" r="16"/><circle cx="24" cy="24" r="11.5"/><path d="M24 17.5l5.6 3.2v6.6L24 30.5l-5.6-3.2v-6.6z"/>',
  lens: '<circle cx="24" cy="24" r="15"/><path d="M15 21a10 10 0 0 1 7-7.5"/><circle cx="24" cy="24" r="9" stroke-dasharray="2 3"/>',
  key: '<circle cx="15" cy="24" r="7"/><circle cx="15" cy="24" r="2.5"/><path d="M22 24h19M34 24v6M38 24v4.5"/>',
  wings: '<path d="M24 23c-6-6-14-7.5-20-6.5 4 4.5 10 7.5 20 8.5 10-1 16-4 20-8.5-6-1-14 .5-20 6.5z"/><circle cx="24" cy="26" r="3"/>',
  compass: '<circle cx="24" cy="24" r="16"/><path d="M24 11l4.5 13-4.5 13-4.5-13z"/><path d="M24 6v3M24 39v3M6 24h3M39 24h3"/>',
  seal: '<circle cx="24" cy="24" r="15.5"/><circle cx="24" cy="24" r="10"/><path d="M19 21h10M19 24h10M19 27h6"/>',
  crystal: '<path d="M24 5l7.5 11L24 43l-7.5-27z"/><path d="M16.5 16h15M24 5v38"/>',
  core: '<rect x="13" y="13" width="22" height="22" rx="4"/><rect x="19" y="19" width="10" height="10" rx="1"/><path d="M24 6v7M24 35v7M6 24h7M35 24h7"/>',
  fragment: '<path d="M12 11l22 3.5 4.5 19.5L20 40.5 9.5 26z"/><path d="M17 19l13 2.5M15 26l15 2.5"/>',
  relic: '<rect x="12" y="7" width="24" height="34" rx="2"/><path d="M18 18h12M18 24h12M21 30h6"/><circle cx="24" cy="12.5" r="1.5"/>',
  unknown: '<circle cx="24" cy="24" r="15" stroke-dasharray="3 4"/><path d="M20 20a4 4 0 1 1 5.5 3.7c-1 .5-1.5 1.3-1.5 2.3v1.5M24 31.5v.5"/>',
};
const glyph = (k) => `<svg viewBox="0 0 48 48" class="xp-glyph" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${GLYPH[k] || GLYPH.unknown}</svg>`;

// marks a clue adds to the chart
const CHART_MARKS = {
  sandbar: { place: 'sandbar', text: 'weighted crate' },
  outpost: { place: 'outpostHut', text: 'outpost — come here' },
  outpostVault: { place: 'outpostHut', text: 'under the floor', dy: 16 },
  vault: { place: 'relicSummit', text: 'the watcher' },
  stripCamp: { place: 'stripCamp', text: 'last camp' },
  coveRadio: { place: 'coveRadio', text: 'decode here' },
};
// supply caches revealed by chart fragments, two per fragment
const CACHE_ORDER = ['headland', 'falls', 'coveDock', 'outpostDock', 'relicBeach', 'needle', 'stripFuel', 'wreckLocker'];

/**
 * Screens for the archipelago expansion: the mission tracker and waypoint, the reveal card
 * for recovered rewards, readers for clues, the small device puzzles at the radio sites, the
 * harbour ledger, and the journal with the missions, the Relic Archive, clues and the chart.
 * Panels are modal (the game waits, the mouse is freed); the tracker and reveal card are not.
 */
export class ExpansionUI {
  constructor(game, xp) {
    this.g = game;
    this.xp = xp;
    this.open = null;
    this.token = 0;
    this.tab = 'missions';
    this.revealQueue = [];
    this.revealT = 0;
    this.revealing = false;
    this.banners = [];
    this.bannerT = 0;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._build();
  }

  _build() {
    const ui = this.g.ui;
    this.tracker = h('div', 'xp-tracker');
    this.way = h('div', 'xp-way', '<div class="xp-way-mark"></div><div class="xp-way-dist"></div>');
    ui.hud.append(this.tracker, this.way);
    this.wayDist = this.way.querySelector('.xp-way-dist');
    this.revealEl = h('div', 'xp-reveal');
    this.modal = h('div', 'overlay xp-modal interactive');
    ui.root.append(this.revealEl, this.modal);
    // keys for the open panel (digits on a keypad, arrows on the tuner, E/Enter to put a note away)
    window.addEventListener('keydown', (e) => {
      if (!this.open || !this._keys || e.repeat) return;
      if (this._keys(e)) {
        e.preventDefault();
        this.g.input.pressed.delete(e.code);
      }
    });
  }

  // ================================================================ modal plumbing
  _show(kind, el, { keys = null, tick = null } = {}) {
    const wasOpen = !!this.open;
    if (!wasOpen) {
      this.g.ui.closeAll(false);
      this.g.ui.pause.classList.remove('show');
    }
    this.token++;
    this.modal.replaceChildren(el);
    this.modal.classList.add('show');
    this.modal.dataset.kind = kind;
    this.open = kind;
    this._keys = keys;
    this._tickFn = tick;
    if (!wasOpen || this.g.state !== 'menu') this.g.setMenuOpen(true);
    return this.token;
  }

  /** Close the open panel. Returns whether one was open. */
  closeAll(notify = true) {
    if (!this.open) return false;
    this.token++;
    this.open = null;
    this._keys = null;
    this._tickFn = null;
    this.modal.classList.remove('show');
    if (notify) this.g.setMenuOpen(false);
    return true;
  }

  /** Run fn as the panel finishes; close unless fn opened another panel. */
  _finish(fn) {
    const t = this.token;
    try { fn?.(); } finally { if (this.token === t && this.open) this.closeAll(); }
  }

  /** As _finish, after a short beat so a success state can be seen. */
  _finishLater(fn, ms = 650) {
    const t = this.token;
    setTimeout(() => { if (this.token === t) this._finish(fn); }, ms);
  }

  isBusy() { return !!this.open; }

  _closeBtn(el, label) {
    const b = el.querySelector('[data-close]');
    if (b) {
      b.textContent = label || b.textContent;
      b.addEventListener('click', () => this.closeAll());
    }
  }

  // ================================================================ notes
  showNote(note, first = false) {
    // a note found with a reward waits until the reveal card has been seen
    if (this.revealing) { if (!this._pending?.finale) this._pending = { run: () => this.showNote(note, first) }; return; }
    const radio = /^Transmission|^Vault message/.test(note.title);
    const el = h('div', `xp-paper${radio ? ' radio' : ''}`, `
      <div class="xp-paper-title">${esc(note.title)}</div>
      <div class="xp-paper-text">${para(note.text)}</div>
      ${first ? '<div class="xp-paper-foot">Kept in your journal · J</div>' : ''}
      <button type="button" class="close-hint" data-close>Close · E</button>`);
    this._closeBtn(el);
    this._show('note', el, { keys: (e) => { if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') { this.closeAll(); return true; } return false; } });
    this.g.audio?.play(radio ? 'click' : 'cloth', { volume: radio ? 0.4 : 0.25, rate: radio ? 0.8 : 1.6 });
  }

  // ================================================================ reveal card
  reveal(r) {
    this.revealQueue.push(r);
    if (!this.revealing) this._nextReveal();
  }

  _nextReveal() {
    const r = this.revealQueue.shift();
    if (!r) {
      this.revealing = false;
      return;
    }
    this.revealing = true;
    const rel = r.relic ? RELICS[r.relic] : null;
    const rar = rel ? RARITY[rel.rarity] : null;
    let html = `<div class="xp-rv-sub">Recovered</div><div class="xp-rv-title">${esc(r.title)}</div>`;
    if (rel) {
      html += `<div class="xp-rv-relic" style="--rc:${rar.color}">${glyph(rel.icon)}<div>
        <div class="xp-rv-rname">${esc(rel.name)}</div>
        <div class="xp-rv-rsub">${rar.label} relic · ${rel.serial}${r.relicNew ? ' · added to the Relic Archive' : ''}</div></div></div>`;
    }
    const lines = [];
    if (r.credits) lines.push(`<span class="xp-cr">+${fmt(r.credits)}</span> credits`);
    for (const it of r.items || []) lines.push(`${esc(it.name)}${it.n > 1 ? ` ×${it.n}` : ''}`);
    if (lines.length) html += `<div class="xp-rv-lines">${lines.map((l) => `<div>${l}</div>`).join('')}</div>`;
    this.revealEl.innerHTML = html;
    this.revealEl.className = `xp-reveal${rel ? ` r-${rel.rarity}` : ''}`;
    void this.revealEl.offsetWidth;
    this.revealEl.classList.add('in');
    this.revealT = rel ? 6 : 3.8;
    this.g.audio?.play('click', { volume: 0.5, rate: rel ? 0.55 : 0.8 });
  }

  // ================================================================ banners / mission events
  _banner(name, sub) {
    this.banners.push([name, sub]);
    if (this.bannerT <= 0 && this.g.state === 'playing') this._nextBanner();
  }

  _nextBanner() {
    const b = this.banners.shift();
    if (!b) return;
    this.g.ui.discover(esc(b[0]), b[1]);
    this.bannerT = 3.6;
  }

  missionStarted(def) {
    this._banner(def.title, def.kind === 'story' ? 'Signal Lost · new transmission' : def.kind === 'side' ? 'New discovery' : 'Mission started');
    this.g.toast(def.brief, 7);
    this._trKey = null;
    this.refreshTracker();
  }

  objective(def) {
    const t = this.xp.trackedStep();
    if (t && t.def === def) {
      this.tracker.classList.remove('xp-pulse');
      void this.tracker.offsetWidth;
      this.tracker.classList.add('xp-pulse');
    } else {
      const m = this.xp.P.data.missions[MISSION_ORDER.find((id) => MISSIONS[id] === def)];
      const step = m && def.steps[m.step];
      if (step) this.g.toast(`${def.title}: ${step.text}`);
    }
    this.g.audio?.play('click', { volume: 0.35, rate: 1.25 });
    this._trKey = null;
    this.refreshTracker();
  }

  missionComplete(def, res) {
    this._banner(def.title, 'Mission complete');
    const parts = [];
    if (res?.credits) parts.push(`+${fmt(res.credits)} credits`);
    for (const it of res?.items || []) parts.push(it.name);
    if (parts.length) this.g.toast(`Reward: ${parts.join(' · ')}`);
    this.g.audio?.play('click', { volume: 0.5, rate: 0.6 });
    this._trKey = null;
    this.refreshTracker();
  }

  finale() {
    if (this.revealing) { this._pending = { finale: true, run: () => this.finale() }; return; }
    const P = this.xp.P.data;
    const relics = Object.keys(P.relics).length, total = Object.keys(RELICS).length;
    const done = Object.values(P.missions).filter((m) => m.state === 'completed').length;
    const el = h('div', 'xp-finale', `
      <div class="xp-fin-sub">Signal Lost · 005</div>
      <div class="xp-fin-title">Network restored</div>
      <div class="xp-fin-text">${para(NOTES.finalLore.text)}</div>
      <div class="xp-fin-stats"><div><b>${relics}/${total}</b><span>relics</span></div><div><b>${fmt(P.credits)}</b><span>credits</span></div><div><b>${done}/${Object.keys(MISSIONS).length}</b><span>missions</span></div></div>
      <div class="xp-fin-note">The islands stay open. Some caches, charters and relics may still be out there.</div>
      <button type="button" class="xp-btn primary" data-close>Keep exploring</button>`);
    this._closeBtn(el);
    this._show('finale', el, { keys: (e) => { if (e.code === 'Enter') { this.closeAll(); return true; } return false; } });
  }

  // ================================================================ tracker + waypoint
  refreshTracker() {
    const t = this.xp.trackedStep();
    const key = t ? `${t.id}:${t.index}` : '';
    if (key === this._trKey) return;
    this._trKey = key;
    this.tracker.classList.toggle('show', !!t);
    if (!t) return;
    this.tracker.innerHTML = `
      <div class="xp-tr-l">Mission</div><div class="xp-tr-m">${esc(t.def.title)}</div>
      <div class="xp-tr-l">Objective <span class="xp-tr-n">${t.index + 1}/${t.def.steps.length}</span></div>
      <div class="xp-tr-o">${esc(t.step.text)}</div><div class="xp-tr-d"></div>`;
    this.trDist = this.tracker.querySelector('.xp-tr-d');
  }

  _myPos() {
    const g = this.g;
    return g.player.mode === 'boat' ? g.boat.pos : g.player.mode === 'plane' ? g.seaplane.fm.pos : g.player.mode === 'heli' ? g.heli.hf.pos : g.player.pos;
  }

  _updateWaypoint() {
    const g = this.g;
    const t = this.xp.trackedStep();
    let show = false;
    if (t && t.step.at && this.xp.places[t.step.at]) {
      const place = this.xp.places[t.step.at];
      const p = this.xp.placePos(t.step.at, this._v);
      const me = this._myPos();
      const d = Math.hypot(p.x - me.x, p.z - me.z);
      const txt = dist(d);
      if (this.trDist && this.trDist.textContent !== txt) this.trDist.textContent = txt;
      if (d > Math.max(5, place.r * 0.6) && g.state === 'playing') {
        show = true;
        p.y += 2.5;
        const cam = g.camera;
        const W = innerWidth, H = innerHeight, m = 42;
        const vs = this._w.copy(p).applyMatrix4(cam.matrixWorldInverse);
        let sx, sy, edge = false;
        if (vs.z < -0.5) {
          p.project(cam);
          sx = (p.x * 0.5 + 0.5) * W;
          sy = (-p.y * 0.5 + 0.5) * H;
        } else {
          edge = true;
          const ax = Math.abs(vs.x) < 1e-3 ? 1e-3 : vs.x;
          sx = W / 2 + Math.sign(ax) * W;
          sy = H * 0.75;
        }
        if (sx < m || sx > W - m || sy < m || sy > H - m) edge = true;
        if (edge) {
          const dx = sx - W / 2 || 1e-3, dy = sy - H / 2 || 1e-3;
          const k = Math.min((W / 2 - m) / Math.abs(dx), (H / 2 - m) / Math.abs(dy));
          sx = W / 2 + dx * k; sy = H / 2 + dy * k;
          this.way.style.setProperty('--a', `${Math.atan2(dy, dx) + Math.PI / 2}rad`);
        }
        this.way.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
        this.way.classList.toggle('edge', edge);
        if (this.wayDist.textContent !== txt) this.wayDist.textContent = txt;
      }
    } else if (this.trDist && this.trDist.textContent) this.trDist.textContent = '';
    if (show !== this._wayShown) { this._wayShown = show; this.way.classList.toggle('show', show); }
  }

  update(dt) {
    this._updateWaypoint();
    // the reveal card waits (hidden) while a panel is open
    const held = !!this.open || this.g.state !== 'playing';
    if (held !== this._revealHeld) { this._revealHeld = held; this.revealEl.classList.toggle('held', held); }
    if (this.revealing && !held) {
      this.revealT -= dt;
      if (this.revealT <= 0 && this.revealEl.classList.contains('in')) {
        this.revealEl.classList.remove('in');
        this.revealT = -0.0001;
        setTimeout(() => this._nextReveal(), 650);
      }
    }
    // mission banners wait while a panel is open (the HUD is hidden)
    if (this.g.state === 'playing') {
      if (this.bannerT > 0) this.bannerT -= dt;
      if (this.bannerT <= 0 && this.banners.length) this._nextBanner();
    }
    // a panel held back for the reveal card opens once it is gone and nothing else is open
    if (this._pending && !this.revealing && !this.open && this.g.state === 'playing') {
      const p = this._pending;
      this._pending = null;
      p.run();
    }
    this._tickFn?.(dt);
  }

  // ================================================================ menu
  menu({ title, items }) {
    const el = h('div', 'xp-panel xp-device narrow', `
      <div class="xp-dev-title">${esc(title)}</div>
      <div class="xp-menu">${items.map((it, i) => `<button type="button" class="xp-menu-item" data-i="${i}"><span class="xp-key">${i + 1}</span>${esc(it.label)}</button>`).join('')}</div>
      <button type="button" class="close-hint" data-close>Close · Esc</button>`);
    this._closeBtn(el);
    const run = (i) => { const it = items[i]; if (it) this._finish(it.run); };
    el.querySelectorAll('.xp-menu-item').forEach((b) => b.addEventListener('click', () => run(+b.dataset.i)));
    this._show('menu', el, { keys: (e) => { const m = /^(Digit|Numpad)(\d)$/.exec(e.code); if (m) { run(+m[2] - 1); return true; } return false; } });
    this.g.audio?.play('click', { volume: 0.35 });
  }

  // ================================================================ keypad
  keypad({ title, digits = 4, hint = '', note = null, onSubmit }) {
    let code = '';
    let locked = false;
    const el = h('div', 'xp-panel xp-device narrow xp-keypad', `
      <div class="xp-dev-title">${esc(title)}</div>
      <div class="xp-dev-hint">${esc(hint)}</div>
      <div class="xp-kp-display">${'<span></span>'.repeat(digits)}</div>
      <div class="xp-kp-status">&nbsp;</div>
      <div class="xp-kp-grid">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'del', 0, 'ok'].map((k) => `<button type="button" data-k="${k}">${k === 'del' ? '⌫' : k === 'ok' ? '↵' : k}</button>`).join('')}</div>
      ${note ? `<details class="xp-kp-note"><summary>${esc(note.title)}</summary><div>${para(note.text)}</div></details>` : ''}
      <button type="button" class="close-hint" data-close>Close · Esc</button>`);
    this._closeBtn(el);
    const cells = [...el.querySelectorAll('.xp-kp-display span')];
    const status = el.querySelector('.xp-kp-status');
    const draw = () => cells.forEach((c, i) => { c.textContent = code[i] ?? ''; c.classList.toggle('on', i < code.length); });
    const submit = () => {
      if (locked || code.length !== digits) return;
      if (onSubmit(code)) {
        locked = true;
        el.classList.remove('bad');
        el.classList.add('ok');
        status.textContent = 'Accepted';
        this._finishLater(null, 700);
      } else {
        locked = true;
        el.classList.remove('bad'); void el.offsetWidth; el.classList.add('bad');
        status.textContent = 'Incorrect';
        this.g.audio?.play('knock', { volume: 0.4, rate: 1.6 });
        setTimeout(() => { locked = false; code = ''; draw(); status.innerHTML = '&nbsp;'; }, 750);
      }
    };
    const press = (k) => {
      if (locked) return;
      if (k === 'del') code = code.slice(0, -1);
      else if (k === 'ok') { submit(); return; } else if (code.length < digits) code += k;
      this.g.audio?.play('click', { volume: 0.25, rate: 1.5 });
      draw();
      if (code.length === digits) setTimeout(submit, 160);
    };
    el.querySelectorAll('.xp-kp-grid button').forEach((b) => b.addEventListener('click', () => press(b.dataset.k)));
    this._show('keypad', el, {
      keys: (e) => {
        const m = /^(Digit|Numpad)(\d)$/.exec(e.code);
        if (m) { press(m[2]); return true; }
        if (e.code === 'Backspace') { press('del'); return true; }
        if (e.code === 'Enter' || e.code === 'NumpadEnter') { press('ok'); return true; }
        return false;
      },
    });
  }

  // ================================================================ breaker panel
  breaker({ onSolved, note = null }) {
    const st = { A: true, B: false, C: false, MAIN: false };
    let solved = false;
    const LINES = [['A', 'Line A', 'insulation blackened'], ['B', 'Line B', 'station load'], ['C', 'Line C', 'mast and lamps'], ['MAIN', 'Main', 'incomer']];
    const el = h('div', 'xp-panel xp-device xp-breaker', `
      <div class="xp-dev-title">Distribution box</div>
      <div class="xp-dev-hint">Three feeder lines and the main breaker. Something in here has burnt out.</div>
      <div class="xp-brk-row">${LINES.map(([k, n, s]) => `
        <div class="xp-brk${k === 'A' ? ' scorched' : ''}${k === 'MAIN' ? ' main' : ''}" data-k="${k}">
          <div class="xp-brk-lamp"></div>
          <button type="button" class="xp-brk-lever" aria-label="${n}"><span></span></button>
          <div class="xp-brk-state"></div>
          <div class="xp-brk-name">${n}</div><div class="xp-brk-sub">${s}</div>
        </div>`).join('')}</div>
      <div class="xp-dev-status">The board is dead.</div>
      <div class="xp-dev-keys">Click a lever to switch it (or press 1–4). Up is on.</div>
      ${note ? `<details class="xp-kp-note"><summary>${esc(note.title)}</summary><div>${para(note.text)}</div></details>` : '<div class="xp-dev-keys">Whoever left the station may have written down how the board should be set. Look inside.</div>'}
      <button type="button" class="close-hint" data-close>Close · Esc</button>`);
    this._closeBtn(el);
    const status = el.querySelector('.xp-dev-status');
    const draw = () => {
      el.querySelectorAll('.xp-brk').forEach((b) => {
        const k = b.dataset.k;
        b.classList.toggle('on', st[k]);
        b.querySelector('.xp-brk-state').textContent = st[k] ? 'On' : 'Off';
        const live = st.MAIN && (k === 'MAIN' || st[k]);
        b.classList.toggle('live', solved ? k !== 'A' : live && k !== 'A');
      });
    };
    const trip = (msg) => {
      st.MAIN = false;
      status.textContent = msg;
      el.classList.remove('spark'); void el.offsetWidth; el.classList.add('spark');
      this.g.audio?.play('knock', { volume: 0.7, rate: 0.7 });
    };
    const toggle = (k) => {
      if (solved) return;
      st[k] = !st[k];
      this.g.audio?.play('click', { volume: 0.55, rate: k === 'MAIN' ? 0.75 : 1.1 });
      if (st.MAIN && st.A) trip('The main trips with a crack. A shorted line is still connected.');
      else if (k !== 'MAIN' && st.MAIN && st[k]) trip('The inrush trips the main. Close the feeders before the main.');
      else if (k === 'MAIN' && st.MAIN && st.B && st.C) {
        solved = true;
        status.textContent = 'The main holds. Power restored.';
        el.classList.add('ok');
        this._finishLater(onSolved, 1100);
      } else if (k === 'MAIN' && st.MAIN) status.textContent = 'The main is closed, but no feeder is carrying the station load.';
      else status.textContent = st.MAIN ? 'Main closed.' : 'The board is dead.';
      draw();
    };
    el.querySelectorAll('.xp-brk').forEach((b) => b.querySelector('button').addEventListener('click', () => toggle(b.dataset.k)));
    draw();
    this._show('breaker', el, { keys: (e) => { const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code); if (i >= 0) { toggle(LINES[i][0]); return true; } return false; } });
  }

  // ================================================================ receiver
  tuner({ title, target, hint = '', onSolved }) {
    const MIN = 140, MAX = 160;
    let f = Math.round((target > 150 ? 143.6 : 154.4) * 20) / 20;
    let hold = 0, solved = false, t = 0;
    const el = h('div', 'xp-panel xp-device xp-tuner', `
      <div class="xp-dev-title">${esc(title)}</div>
      <div class="xp-dev-hint">${esc(hint)}</div>
      <div class="xp-tu-freq"><span class="xp-tu-val"></span> MHz</div>
      <canvas class="xp-tu-scope" width="440" height="110"></canvas>
      <div class="xp-tu-meter"><span></span></div>
      <input class="xp-tu-dial" type="range" min="${MIN}" max="${MAX}" step="0.05">
      <div class="xp-tu-btns"><button type="button" data-d="-1">« 1.00</button><button type="button" data-d="-0.05">‹ 0.05</button><button type="button" data-d="0.05">0.05 ›</button><button type="button" data-d="1">1.00 »</button></div>
      <div class="xp-dev-status">Find a clean carrier and hold it.</div>
      <div class="xp-dev-keys">A / D or ← → to tune · Shift for big steps</div>
      <button type="button" class="close-hint" data-close>Close · Esc</button>`);
    this._closeBtn(el);
    const val = el.querySelector('.xp-tu-val'), dial = el.querySelector('.xp-tu-dial'), meter = el.querySelector('.xp-tu-meter span'), status = el.querySelector('.xp-dev-status');
    const cv = el.querySelector('canvas'), cx = cv.getContext('2d');
    const set = (v) => {
      if (solved) return;
      f = Math.min(MAX, Math.max(MIN, Math.round(v * 20) / 20));
      val.textContent = f.toFixed(2);
      dial.value = f;
    };
    dial.addEventListener('input', () => set(+dial.value));
    el.querySelectorAll('.xp-tu-btns button').forEach((b) => b.addEventListener('click', () => set(f + +b.dataset.d)));
    set(f);
    const tick = (dt) => {
      t += dt;
      const d = f - target;
      // the carrier, plus a weak ghost a little off frequency so the sweep has texture
      const s = Math.max(Math.exp(-((d / 0.16) ** 2)), 0.32 * Math.exp(-(((d + 0.9) / 0.25) ** 2)));
      meter.style.width = `${Math.round(s * 100)}%`;
      const W = cv.width, H = cv.height;
      cx.fillStyle = '#060a09'; cx.fillRect(0, 0, W, H);
      cx.strokeStyle = 'rgba(159,214,164,0.12)'; cx.lineWidth = 1;
      for (let x = 0; x < W; x += 44) { cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke(); }
      cx.beginPath(); cx.moveTo(0, H / 2); cx.lineTo(W, H / 2); cx.stroke();
      cx.strokeStyle = s > 0.9 ? '#b8f0b0' : '#7fc48a'; cx.lineWidth = 1.6;
      cx.beginPath();
      for (let x = 0; x <= W; x += 2) {
        const n = (Math.random() * 2 - 1) * (1 - s) * 0.85;
        const y = H / 2 - (Math.sin(x * 0.09 + t * 9) * s * 0.75 + n) * H * 0.42;
        if (x === 0) cx.moveTo(x, y); else cx.lineTo(x, y);
      }
      cx.stroke();
      if (solved) return;
      if (s > 0.9 && Math.abs(d) < 0.08) {
        hold += dt;
        status.textContent = hold < 1.3 ? 'Carrier found… holding' : 'Locked.';
        if (hold >= 1.3) {
          solved = true;
          el.classList.add('ok');
          status.textContent = 'Carrier locked. Decoding.';
          this.g.audio?.play('click', { volume: 0.6, rate: 0.7 });
          this._finishLater(onSolved, 800);
        }
      } else {
        hold = Math.max(0, hold - dt * 2);
        status.textContent = s > 0.25 ? 'Something faint… keep turning.' : 'Static.';
      }
    };
    this._show('tuner', el, {
      tick,
      keys: (e) => {
        const big = e.shiftKey ? 0.5 : 0.05;
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') { set(f - big); return true; }
        if (e.code === 'ArrowRight' || e.code === 'KeyD') { set(f + big); return true; }
        return false;
      },
    });
  }

  // ================================================================ cipher wheel
  cipher({ cipher, key, onSolved }) {
    let s = 0, solved = false;
    const letters = cipher.replace(/[^A-Z]/g, '').split('');
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const el = h('div', 'xp-panel xp-device xp-cipher', `
      <div class="xp-dev-title">Cipher wheel</div>
      <div class="xp-dev-hint">Bolted beside the cove radio: letters on the brass ring, digits on the turning inner ring. The log’s last entry reads <b>${esc(cipher.slice(0, 3))}-${esc(cipher.slice(3))}</b>.</div>
      <svg class="xp-ci-wheel" viewBox="-110 -110 220 220"></svg>
      <div class="xp-ci-read">${letters.map(() => '<div><b></b><span></span></div>').join('')}</div>
      <div class="xp-ci-ctl"><button type="button" data-d="-1">‹ Turn</button><span class="xp-ci-set"></span><button type="button" data-d="1">Turn ›</button></div>
      <div class="xp-dev-status">&nbsp;</div>
      <button type="button" class="xp-btn primary" data-write>Write it down</button>
      <button type="button" class="close-hint" data-close>Close · Esc</button>`);
    this._closeBtn(el);
    const svg = el.querySelector('svg'), setEl = el.querySelector('.xp-ci-set'), status = el.querySelector('.xp-dev-status');
    const reads = [...el.querySelectorAll('.xp-ci-read > div')];
    const draw = () => {
      let out = '<circle r="104" class="ring"/><circle r="76" class="ring"/><circle r="50" class="ring inner"/>';
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2 - Math.PI / 2;
        const hot = letters.includes(A[i]);
        out += `<text x="${(Math.cos(a) * 90).toFixed(1)}" y="${(Math.sin(a) * 90 + 4).toFixed(1)}" class="${hot ? 'hot' : ''}">${A[i]}</text>`;
        out += `<text x="${(Math.cos(a) * 63).toFixed(1)}" y="${(Math.sin(a) * 63 + 4).toFixed(1)}" class="dg${hot ? ' hot' : ''}">${(i + s) % 10}</text>`;
      }
      out += `<text y="5" class="set">${s}</text>`;
      svg.innerHTML = out;
      setEl.textContent = `Ring setting ${s}`;
      letters.forEach((l, i) => { reads[i].querySelector('b').textContent = l; reads[i].querySelector('span').textContent = (A.indexOf(l) + s) % 10; });
    };
    const turn = (d) => { if (solved) return; s = (s + d + 10) % 10; status.innerHTML = '&nbsp;'; this.g.audio?.play('click', { volume: 0.3, rate: 1.7 }); draw(); };
    el.querySelectorAll('.xp-ci-ctl button').forEach((b) => b.addEventListener('click', () => turn(+b.dataset.d)));
    const write = () => {
      if (solved) return;
      if (s === key) {
        solved = true;
        el.classList.add('ok');
        status.textContent = 'Six digits. That reads like a code.';
        this._finishLater(onSolved, 900);
      } else status.textContent = 'Just numbers. The log says how the ring was set: the number of hands aboard.';
    };
    el.querySelector('[data-write]').addEventListener('click', write);
    draw();
    this._show('cipher', el, {
      keys: (e) => {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') { turn(-1); return true; }
        if (e.code === 'ArrowRight' || e.code === 'KeyD') { turn(1); return true; }
        if (e.code === 'Enter') { write(); return true; }
        return false;
      },
    });
  }

  // ================================================================ fragment chain
  fragments({ onSolved }) {
    const F = [
      { id: '3f9a', prev: '0000', text: 'THE FIRST ENTRY LIES BENEATH' },
      { id: '81c4', prev: '3f9a', text: 'THE WATCHER ON THE WESTERN STONES.' },
      { id: 'd07e', prev: '81c4', text: 'LINK THE NODES IN THE ORDER THE SIGNAL TRAVELLED.' },
    ];
    const pool = [F[2], F[0], F[1]];
    const slots = [null, null, null];
    let solved = false, busy = false;
    const el = h('div', 'xp-panel xp-device xp-frag', `
      <div class="xp-dev-title">Reassemble the vault message</div>
      <div class="xp-dev-hint">Each fragment carries its own block id and the id of the block before it. Chain them from the one that follows nothing.</div>
      <div class="xp-fr-pool"></div>
      <div class="xp-fr-slots"></div>
      <div class="xp-dev-status">Click fragments to place them in order. Click a placed one to take it back.</div>
      <button type="button" class="close-hint" data-close>Close · Esc</button>`);
    this._closeBtn(el);
    const poolEl = el.querySelector('.xp-fr-pool'), slotEl = el.querySelector('.xp-fr-slots'), status = el.querySelector('.xp-dev-status');
    const card = (f) => `<div class="xp-fr-card"><div class="xp-fr-hash"><span>block ${f.id}</span><span>prev ${f.prev}</span></div><div class="xp-fr-text">${f.text}</div></div>`;
    const draw = () => {
      poolEl.innerHTML = pool.map((f, i) => (f && !slots.includes(f) ? `<button type="button" data-p="${i}">${card(f)}</button>` : '<div class="xp-fr-empty"></div>')).join('');
      slotEl.innerHTML = slots.map((f, i) => `<button type="button" class="xp-fr-slot${f ? ' full' : ''}" data-s="${i}"><span class="xp-fr-n">${i + 1}</span>${f ? card(f) : ''}</button>`).join('');
      poolEl.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => place(pool[+b.dataset.p])));
      slotEl.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => { if (!solved && !busy) { slots[+b.dataset.s] = null; draw(); } }));
    };
    const place = (f) => {
      if (solved || busy) return;
      const i = slots.indexOf(null);
      if (i < 0) return;
      slots[i] = f;
      this.g.audio?.play('click', { volume: 0.3, rate: 1.4 });
      draw();
      if (!slots.includes(null)) {
        const bad = slots.findIndex((s, k) => s.prev !== (k === 0 ? '0000' : slots[k - 1].id));
        if (bad < 0) {
          solved = true;
          el.classList.add('ok');
          status.textContent = 'Chain verified. The message decodes.';
          this._finishLater(onSolved, 1000);
        } else {
          busy = true;
          status.textContent = `The chain breaks at fragment ${bad + 1}: its previous block does not match.`;
          el.classList.remove('bad'); void el.offsetWidth; el.classList.add('bad');
          setTimeout(() => { busy = false; slots.fill(null); draw(); }, 1300);
        }
      }
    };
    draw();
    this._show('fragments', el);
  }

  // ================================================================ node link
  nodes({ status: online, order, onSolved }) {
    const NODE = {
      outpost: { name: 'Outpost', x: -60, y: -62, need: 'Install the transmitter on the outpost mast.' },
      beacon: { name: 'Beacon', x: 18, y: 64, need: 'Power the south beacon on Airstrip Island.' },
      stones: { name: 'Stones', x: -88, y: 22, need: 'Wake the old node among the stones on Relic Island.' },
    };
    const seq = [];
    let solved = false, busy = false;
    const dark = Object.keys(NODE).filter((k) => !online[k]);
    const el = h('div', 'xp-panel xp-device xp-nodes', `
      <div class="xp-dev-title">Link the nodes</div>
      <div class="xp-dev-hint">The station is node zero. Route the handshake through the other three.</div>
      <svg class="xp-nd-map" viewBox="-120 -96 240 196"></svg>
      <div class="xp-dev-status"></div>
      <button type="button" class="close-hint" data-close>Close · Esc</button>`);
    this._closeBtn(el);
    const svg = el.querySelector('svg'), status = el.querySelector('.xp-dev-status');
    const draw = () => {
      const pts = [[0, 0], ...seq.map((k) => [NODE[k].x, NODE[k].y])];
      let out = '<path class="coast" d="M-30 -20 Q -10 -36 18 -22 T 34 14 Q 10 34 -18 22 T -30 -20z"/>';
      if (pts.length > 1) out += `<polyline class="link${solved ? ' ok' : ''}" points="${pts.map((p) => p.join(',')).join(' ')}"/>`;
      out += '<g class="node station"><circle r="9"/><text y="24">Station</text></g>';
      for (const [k, n] of Object.entries(NODE)) {
        const i = seq.indexOf(k);
        out += `<g class="node${online[k] ? ' on' : ' off'}${i >= 0 ? ' picked' : ''}" data-k="${k}" transform="translate(${n.x},${n.y})"><circle r="11"/>${i >= 0 ? `<text class="idx" y="4">${i + 1}</text>` : ''}<text y="${n.y > 0 ? 26 : -17}">${n.name}</text></g>`;
      }
      svg.innerHTML = out;
      svg.querySelectorAll('[data-k]').forEach((g) => g.addEventListener('click', () => pick(g.dataset.k)));
    };
    const pick = (k) => {
      if (solved || busy) return;
      if (!online[k]) { status.textContent = `The ${NODE[k].name.toLowerCase()} node is dark. ${NODE[k].need}`; return; }
      if (seq.includes(k)) return;
      seq.push(k);
      this.g.audio?.play('click', { volume: 0.4, rate: 1.2 });
      draw();
      if (seq.length === 3) {
        if (seq.every((s, i) => s === order[i])) {
          solved = true;
          status.textContent = 'Handshake complete. Network restored.';
          el.classList.add('ok');
          draw();
          this._finishLater(onSolved, 1300);
        } else {
          busy = true;
          status.textContent = 'The handshake fails: the signal cannot travel that way.';
          el.classList.remove('bad'); void el.offsetWidth; el.classList.add('bad');
          setTimeout(() => { busy = false; seq.length = 0; draw(); status.textContent = 'Pick the first node.'; }, 1300);
        }
      } else status.textContent = 'Next node…';
    };
    status.textContent = dark.length ? `Dark: ${dark.map((k) => NODE[k].name).join(', ')}. ${NODE[dark[0]].need}` : 'Pick the first node.';
    draw();
    this._show('nodes', el);
  }

  // ================================================================ harbour ledger
  board() {
    const xp = this.xp, g = this.g;
    const el = h('div', 'xp-panel xp-board');
    const row = (id) => {
      const def = MISSIONS[id], st = xp._missionState(id);
      const tracked = xp.P.data.tracked === id;
      const btns = [];
      if (st === 'available') btns.push(`<button type="button" class="xp-btn primary" data-a="accept" data-id="${id}">Accept</button>`);
      if (st === 'active' && !tracked) btns.push(`<button type="button" class="xp-btn" data-a="track" data-id="${id}">Track</button>`);
      if (st === 'active' || st === 'failed') btns.push(`<button type="button" class="xp-btn" data-a="restart" data-id="${id}">${st === 'failed' ? 'Retry' : 'Restart'}</button>`);
      return `<div class="xp-job s-${st}">
        <div class="xp-job-head"><span class="xp-tag">${KIND[def.kind]}</span><span class="xp-job-title">${esc(def.title)}</span><span class="xp-state">${tracked && st === 'active' ? 'Tracked' : STATE[st]}</span></div>
        <div class="xp-job-brief">${esc(def.brief)}</div>
        <div class="xp-job-foot"><span>${def.cargo ? `Cargo: ${esc(def.cargo.label)} · ` : ''}Pays ${fmt(def.reward?.credits || 0)} credits</span><span class="xp-job-btns">${btns.join('')}</span></div>
      </div>`;
    };
    const render = () => {
      const jobs = MISSION_ORDER.filter((id) => (MISSIONS[id].giver === 'ledger' || MISSIONS[id].giver === 'flightlog'));
      const shown = (kind) => jobs.filter((id) => MISSIONS[id].kind === kind && xp._missionState(id) !== 'locked');
      const hiddenN = jobs.filter((id) => xp._missionState(id) === 'locked').length;
      const sec = (title, list, empty) => `<div class="xp-sec">${title}</div>${list.length ? list.map(row).join('') : `<div class="xp-empty">${empty}</div>`}`;
      const sp = g.seaplane;
      el.innerHTML = `
        <div class="xp-head"><span>Harbour ledger</span><span class="dim">${fmt(xp.P.data.credits)} credits</span></div>
        ${sec('Skiff jobs', shown('boat'), 'No jobs posted yet.')}
        ${sec('Seaplane charters', shown('plane'), 'No charters yet. The ridge station may have news.')}
        ${hiddenN ? `<div class="xp-empty small">${hiddenN} more ${hiddenN === 1 ? 'job is' : 'jobs are'} not posted yet.</div>` : ''}
        <div class="xp-sec">Moorings and helipad</div>
        <div class="xp-services">
          <button type="button" class="xp-btn" data-a="skiff"${g.boat.occupied ? ' disabled' : ''}>Bring the skiff back to the pier</button>
          <button type="button" class="xp-btn" data-a="plane"${sp.occupied ? ' disabled' : ''}>${sp.broken ? 'Salvage and repair the seaplane' : 'Bring the seaplane back to her mooring'}</button>
          ${g.heli ? `<button type="button" class="xp-btn" data-a="heli"${g.heli.occupied ? ' disabled' : ''}>${g.heli.wrecked ? 'Recover and repair the helicopter' : 'Bring the helicopter back to the helipad'}</button>` : ''}
        </div>
        <button type="button" class="close-hint" data-close>Close · Esc</button>`;
      this._closeBtn(el);
      el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => act(b.dataset.a, b.dataset.id)));
    };
    const act = (a, id) => {
      if (a === 'accept') xp.accept(id);
      if (a === 'track') xp.track(id);
      if (a === 'restart') xp.restart(id);
      if (a === 'skiff' && !g.boat.occupied) { g.boat.recall(); g.toast('The skiff is back at her mooring by the pier.'); }
      if (a === 'plane' && !g.seaplane.occupied) { g.seaplane.atPier(); g.toast('The seaplane is back at her mooring off the pier, fuelled and checked.'); }
      if (a === 'heli' && g.heli && !g.heli.occupied) { g.heli.atPad(); g.toast('The helicopter is back on the helipad, fuelled and checked.'); }
      g.audio?.play('click', { volume: 0.3 });
      this._trKey = null;
      this.refreshTracker();
      render();
    };
    render();
    this._show('board', el);
  }

  // ================================================================ journal
  openJournal(tab = this.tab) {
    this.tab = tab;
    const el = h('div', 'xp-panel xp-journal');
    this._journalEl = el;
    this._renderJournal();
    this._show('journal', el, { keys: (e) => { if (e.code === 'KeyJ' || (e.code === 'KeyM' && this.tab === 'chart')) { this.closeAll(); return true; } return false; } });
  }

  _renderJournal() {
    const el = this._journalEl;
    const P = this.xp.P.data;
    const relN = Object.keys(P.relics).length, relT = Object.keys(RELICS).length;
    const tabs = [['missions', 'Missions'], ['relics', 'Relic Archive'], ['clues', 'Clues'], ['chart', 'Chart']];
    el.innerHTML = `
      <div class="xp-head"><span>Journal</span><span class="dim">${fmt(P.credits)} credits · ${relN}/${relT} relics</span></div>
      <div class="xp-tabs">${tabs.map(([k, n]) => `<button type="button" data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="xp-body"></div>
      <div class="xp-foot"><button type="button" class="close-hint" data-close>Close · J</button></div>`;
    this._closeBtn(el);
    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.tab = b.dataset.tab; this._renderJournal(); }));
    const body = el.querySelector('.xp-body');
    if (this.tab === 'missions') this._missionsTab(body);
    else if (this.tab === 'relics') this._relicsTab(body);
    else if (this.tab === 'clues') this._cluesTab(body);
    else this._chartTab(body);
  }

  _missionsTab(body) {
    const xp = this.xp, P = xp.P.data;
    const order = { active: 0, failed: 1, available: 2, completed: 3 };
    const ids = MISSION_ORDER.filter((id) => xp._missionState(id) !== 'locked').sort((a, b) => order[xp._missionState(a)] - order[xp._missionState(b)]);
    const locked = MISSION_ORDER.length - ids.length;
    const card = (id) => {
      const def = MISSIONS[id], m = P.missions[id], st = m.state;
      const tracked = P.tracked === id && st === 'active';
      const steps = def.steps.map((s, i) => {
        const done = st === 'completed' || i < m.step;
        const cur = (st === 'active' || st === 'failed') && i === m.step;
        if (!done && !cur) return '';
        return `<li class="${done ? 'done' : 'cur'}">${esc(s.text)}</li>`;
      }).join('');
      const more = st !== 'completed' && m.step + 1 < def.steps.length ? `<li class="more">${def.steps.length - m.step - 1} more</li>` : '';
      const btns = [];
      if (st === 'available') btns.push(`<button type="button" class="xp-btn primary" data-a="accept" data-id="${id}">Accept</button>`);
      if (st === 'active' && !tracked) btns.push(`<button type="button" class="xp-btn" data-a="track" data-id="${id}">Track</button>`);
      if (st === 'active' || st === 'failed') btns.push(`<button type="button" class="xp-btn" data-a="restart" data-id="${id}">${st === 'failed' ? 'Retry' : 'Restart'}</button>`);
      return `<div class="xp-mis s-${st}${tracked ? ' tracked' : ''}">
        <div class="xp-job-head"><span class="xp-tag">${KIND[def.kind]}</span><span class="xp-job-title">${esc(def.title)}</span><span class="xp-state">${tracked ? 'Tracked' : STATE[st]}</span></div>
        <div class="xp-job-brief">${esc(def.brief)}</div>
        <ul class="xp-steps">${steps}${more}</ul>
        <div class="xp-job-foot"><span>Reward ${fmt(def.reward?.credits || 0)} credits</span><span class="xp-job-btns">${btns.join('')}</span></div>
      </div>`;
    };
    body.innerHTML = `${ids.map(card).join('') || '<div class="xp-empty">No missions yet.</div>'}${locked ? `<div class="xp-empty small">${locked} more ${locked === 1 ? 'mission is' : 'missions are'} still out there.</div>` : ''}`;
    body.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
      const { a, id } = b.dataset;
      if (a === 'accept') xp.accept(id);
      if (a === 'track') xp.track(id);
      if (a === 'restart') xp.restart(id);
      this._trKey = null;
      this.refreshTracker();
      this._renderJournal();
    }));
  }

  _relicsTab(body) {
    const P = this.xp.P.data;
    const ids = Object.keys(RELICS).sort((a, b) => RARITY[RELICS[a].rarity].rank - RARITY[RELICS[b].rarity].rank);
    const sel = this._relicSel && P.relics[this._relicSel] ? this._relicSel : ids.find((id) => P.relics[id]);
    const card = (id) => {
      const r = RELICS[id], got = P.relics[id], rar = RARITY[r.rarity];
      return `<button type="button" class="xp-relic${got ? ' got' : ''}${id === sel ? ' sel' : ''}" style="--rc:${rar.color}" data-id="${id}"${got ? '' : ' disabled'}>
        ${glyph(got ? r.icon : 'unknown')}<div class="xp-rl-name">${got ? esc(r.name) : 'Unrecovered'}</div><div class="xp-rl-rar">${rar.label}</div></button>`;
    };
    let detail = '<div class="xp-empty">No relics recovered yet. They turn up in the rarer containers and the places nobody goes.</div>';
    if (sel) {
      const r = RELICS[sel], got = P.relics[sel], rar = RARITY[r.rarity];
      const when = got.at ? new Date(got.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      detail = `<div class="xp-rd" style="--rc:${rar.color}">
        <div class="xp-rd-top">${glyph(r.icon)}<div><div class="xp-rd-name">${esc(r.name)}</div><div class="xp-rd-rar">${rar.label}</div></div></div>
        <div class="xp-rd-desc">${esc(r.desc)}</div>
        <dl><dt>ID</dt><dd>${r.serial}</dd><dt>Status</dt><dd>Recovered${when ? ` · ${when}` : ''}</dd><dt>Location</dt><dd>${esc(got.where || r.where)}</dd></dl>
        <div class="xp-rd-lore">${esc(r.lore)}</div></div>`;
    }
    const n = Object.keys(P.relics).length, total = ids.length;
    body.innerHTML = `
      <div class="xp-rl-sum"><div class="xp-rl-bar"><span style="width:${(n / total) * 100}%"></span></div><span>${n} of ${total} recovered</span></div>
      <div class="xp-rl-wrap"><div class="xp-rl-grid">${ids.map(card).join('')}</div><div class="xp-rl-detail">${detail}</div></div>
      <div class="xp-disclaimer">Relics and credits are fictional in-game collectibles. They have no real-world value and cannot be bought, sold, traded or withdrawn.</div>`;
    body.querySelectorAll('.xp-relic.got').forEach((b) => b.addEventListener('click', () => { this._relicSel = b.dataset.id; this._renderJournal(); }));
  }

  _cluesTab(body) {
    const xp = this.xp, P = xp.P.data;
    const frag = xp.itemCount('signalFragment');
    const chart = xp.itemCount('mapFragment');
    const notes = P.notes.slice().reverse().filter((id) => NOTES[id]);
    body.innerHTML = `
      <div class="xp-clue-stats"><div><b>${Math.min(frag, 3)}/3</b><span>signal fragments</span></div><div><b>${chart}</b><span>chart fragments</span></div><div><b>${Object.keys(P.opened).length}/${Object.keys(CONTAINERS).length}</b><span>containers opened</span></div></div>
      ${notes.length ? notes.map((id) => `<details class="xp-clue"><summary>${esc(NOTES[id].title)}</summary><div>${para(NOTES[id].text)}</div></details>`).join('') : '<div class="xp-empty">Nothing yet. Logs, notes and transmissions you find are kept here.</div>'}
      <div class="xp-reset"><button type="button" class="xp-link" data-reset>Reset expedition progress…</button></div>`;
    const first = body.querySelector('details');
    if (first) first.open = true;
    body.querySelector('[data-reset]').addEventListener('click', (e) => {
      const b = e.currentTarget;
      if (b.dataset.armed) { this.xp.resetProgress(); return; }
      b.dataset.armed = '1';
      b.textContent = 'Click again to erase missions, relics, credits and clues';
    });
  }

  // ================================================================ chart
  _chartBase() {
    if (this._chart) return this._chart;
    const td = this.g.terrainData;
    const N = 860, half = 1024, sc = (half * 2) / N;
    const hts = new Float32Array(N * N);
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) hts[py * N + px] = td.heightAt(-half + (px + 0.5) * sc, -half + (py + 0.5) * sc);
    const c = document.createElement('canvas');
    c.width = N; c.height = N;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(N, N);
    const d = img.data;
    const lerp = (a, b, t) => a + (b - a) * t;
    for (let py = 0; py < N; py++) {
      for (let px = 0; px < N; px++) {
        const k = py * N + px, hh = hts[k];
        let r, g, b;
        if (hh < 0) {
          const t = Math.min(1, -hh / 30);
          r = lerp(176, 118, t); g = lerp(212, 156, t); b = lerp(204, 172, t);
        } else {
          const t = Math.min(1, hh / 110);
          r = lerp(214, 160, t); g = lerp(206, 150, t); b = lerp(160, 120, t);
          if (hh < 2) { r = 232; g = 214; b = 170; }
        }
        const right = px < N - 1 ? hts[k + 1] : hh, down = py < N - 1 ? hts[k + N] : hh;
        if ((hh < 0) !== (right < 0) || (hh < 0) !== (down < 0)) { r = 70; g = 54; b = 38; } else if (hh > 0 && (Math.floor(hh / 15) !== Math.floor(right / 15) || Math.floor(hh / 15) !== Math.floor(down / 15))) { r *= 0.8; g *= 0.76; b *= 0.7; } else if (hh < 0 && hh > -5 && (right <= -5 || down <= -5)) { r *= 0.9; g *= 0.94; b *= 0.96; }
        const n = (Math.sin(px * 0.31) * Math.cos(py * 0.27) + Math.sin(px * 0.05 + py * 0.07)) * 3;
        d[k * 4] = r + n; d[k * 4 + 1] = g + n; d[k * 4 + 2] = b + n; d[k * 4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = 'rgba(60,45,30,0.12)';
    ctx.lineWidth = 1;
    for (let w = -1000; w <= 1000; w += 250) {
      const p = (w + half) / sc;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, N); ctx.moveTo(0, p); ctx.lineTo(N, p); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(50,38,28,0.9)';
    ctx.font = '22px Georgia';
    ctx.fillText('CHART — THE OUTER ISLANDS', 28, 42);
    ctx.font = 'italic 13px Georgia';
    ctx.fillText('grid 250 m · soundings approximate', 30, 62);
    ctx.save();
    ctx.translate(N - 70, 76);
    ctx.strokeStyle = 'rgba(60,45,30,0.9)';
    ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(8, 0); ctx.lineTo(0, 40); ctx.lineTo(-8, 0); ctx.closePath(); ctx.stroke();
    ctx.font = 'bold 15px Georgia'; ctx.textAlign = 'center'; ctx.fillText('N', 0, -46);
    ctx.restore();
    this._chart = { canvas: c, N, half, sc };
    return this._chart;
  }

  _drawChart() {
    const { canvas: base, N, half, sc } = this._chartBase();
    const xp = this.xp, g = this.g, P = xp.P.data;
    const c = document.createElement('canvas');
    c.width = N; c.height = N;
    const ctx = c.getContext('2d');
    ctx.drawImage(base, 0, 0);
    const px = (x) => (x + half) / sc, pz = (z) => (z + half) / sc;
    const ink = 'rgba(50,38,28,0.92)', pencil = 'rgba(140,48,34,0.9)';
    const label = (t, x, z, { size = 15, color = ink, italic = true, dy = 0 } = {}) => {
      ctx.font = `${italic ? 'italic ' : ''}${size}px Georgia`;
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.fillText(t, px(x), pz(z) + dy);
    };
    // the home island, then the archipelago (named once discovered)
    label('Lagoon station', 0, 40, { size: 15 });
    const known = (id) => P.places[id] || g.collectibles.discovered.has(id);
    for (const poi of ARCHIPELAGO_POIS) {
      if (known(poi.id)) {
        label(poi.name, poi.x, poi.z, { size: 14, dy: -poi.radius / sc - 6 });
        ctx.fillStyle = ink;
        ctx.beginPath(); ctx.arc(px(poi.x), pz(poi.z), 2.5, 0, Math.PI * 2); ctx.fill();
      } else label('?', poi.x, poi.z, { size: 16, color: 'rgba(50,38,28,0.55)', italic: false });
    }
    // pencilled clue marks
    const cross = (x, z, t, dy = 0) => {
      const X = px(x), Z = pz(z) + dy;
      ctx.strokeStyle = pencil; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(X - 6, Z - 6); ctx.lineTo(X + 6, Z + 6); ctx.moveTo(X + 6, Z - 6); ctx.lineTo(X - 6, Z + 6); ctx.stroke();
      ctx.font = 'italic 13px Georgia'; ctx.fillStyle = pencil; ctx.textAlign = 'left';
      ctx.fillText(t, X + 9, Z + 4);
    };
    for (const [k, m] of Object.entries(CHART_MARKS)) {
      if (!P.chart[k]) continue;
      const p = xp.places[m.place];
      if (p) cross(p.x, p.z, m.text, m.dy || 0);
    }
    // caches from chart fragments
    const frags = xp.itemCount('mapFragment');
    CACHE_ORDER.slice(0, frags * 2).forEach((id) => {
      const def = CONTAINERS[id], cont = xp.containers.get(id);
      if (!def || !cont || cont.open) return;
      const p = cont.root.getWorldPosition(this._v);
      ctx.strokeStyle = pencil; ctx.lineWidth = 1.5;
      ctx.strokeRect(px(p.x) - 4, pz(p.z) - 4, 8, 8);
    });
    // tracked objective
    const t = xp.trackedStep();
    if (t && t.step.at && xp.places[t.step.at]) {
      const p = xp.places[t.step.at];
      const X = px(p.x), Z = pz(p.z);
      ctx.fillStyle = 'rgba(176,42,26,0.9)';
      ctx.beginPath(); ctx.moveTo(X, Z - 8); ctx.lineTo(X + 8, Z); ctx.lineTo(X, Z + 8); ctx.lineTo(X - 8, Z); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(176,42,26,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(X, Z, Math.max(10, p.r / sc), 0, Math.PI * 2); ctx.stroke();
    }
    // vehicles
    const veh = (x, z, t2) => {
      ctx.fillStyle = 'rgba(30,60,80,0.9)';
      ctx.beginPath(); ctx.arc(px(x), pz(z), 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.font = '11px Georgia'; ctx.textAlign = 'left'; ctx.fillText(t2, px(x) + 6, pz(z) + 4);
    };
    if (g.player.mode !== 'boat') veh(g.boat.pos.x, g.boat.pos.z, 'skiff');
    if (g.player.mode !== 'plane') veh(g.seaplane.fm.pos.x, g.seaplane.fm.pos.z, 'seaplane');
    if (g.heli && g.player.mode !== 'heli') veh(g.heli.hf.pos.x, g.heli.hf.pos.z, 'helicopter');
    // you
    const me = this._myPos();
    const dir = g.camera.getWorldDirection(this._w);
    ctx.save();
    ctx.translate(px(me.x), pz(me.z));
    ctx.rotate(Math.atan2(dir.x, -dir.z));
    ctx.fillStyle = '#a0281a';
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
    return c;
  }

  _chartTab(body) {
    body.innerHTML = '<div class="xp-chart"></div><div class="xp-chart-key"><span><i class="k-you"></i>you</span><span><i class="k-obj"></i>objective</span><span><i class="k-x"></i>clue</span><span><i class="k-cache"></i>cache (chart fragments)</span><span><i class="k-veh"></i>skiff · seaplane · helicopter</span></div>';
    body.querySelector('.xp-chart').append(this._drawChart());
  }

  /** The archipelago chart on its own (M, away from the home island). */
  openChart() { this.openJournal('chart'); }
}
