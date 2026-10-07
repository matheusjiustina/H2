import { ITEMS } from '../player/Inventory.js';
import { POIS } from '../world/Layout.js';
import { WEATHER_STATES } from '../world/Weather.js';
import { STATE_HOURS } from '../world/TimeOfDay.js';

const h = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

const JOURNAL = [
  { title: 'Day 1 — Arrival', text: 'Landed at the old pier on the high tide. The station is as the last team left it: a deck, a canvas roof, a table and a radio that only half works. The lagoon is unreal — glass over white sand, then that hard line where the reef drops away into blue.' },
  { title: 'Survey tasks', text: '• Sound the channel through the reef (take the skiff — mind the coral heads).\n• Photograph the islet sandbar at low sun.\n• Check the falls up the valley path; the stream feeds the eastern swamp.\n• Climb to the headland lookout and sketch the reef line.' },
  { title: 'On the weather', text: 'Afternoons build cloud over the ridge. When the wind backs west the rain comes fast and warm and the whole jungle hisses. The lantern lives on the table; the flashlight in the crate.' },
  { title: 'Shells', text: 'Previous team logged twelve rare shells along these shores. They left a few on the islet and the point. Worth a look when the light is low and they catch it.' },
];

export class UI {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.toasts = [];
    this.discovered = new Set();
    this.build();
  }

  build() {
    const r = this.root;
    // HUD
    this.hud = h('div', 'hud');
    this.reticle = h('div', 'reticle');
    this.prompt = h('div', 'prompt');
    this.hint = h('div', 'hint');
    this.toastBox = h('div', 'toasts');
    this.discovery = h('div', 'discovery');
    this.fps = h('div', 'fps');
    this.lockHint = h('div', 'lock-hint', 'Click the view to capture the mouse · or drag to look around');
    this.flightStatus = h('div', 'flight-status');
    this.flightHelp = h('div', 'flight-help', `
      <b>Flying</b> <span class="k">W</span><span class="k">S</span> pitch · <span class="k">A</span><span class="k">D</span> roll (steer on water) · <span class="k">Z</span><span class="k">X</span> rudder ·
      <span class="k">R</span><span class="k">F</span> or wheel throttle · <span class="k">G</span><span class="k">B</span> flaps · hold <span class="k">Q</span> start (tap to stop) ·
      <span class="k">U</span> water rudders · <span class="k">L</span> lights · <span class="k">[</span><span class="k">]</span> trim · hold <span class="k">RMB</span> mouse yoke ·
      <span class="k">V</span> chase cam · <span class="k">O</span> orbit · hold <span class="k">E</span> get out`);
    this.hud.append(this.reticle, this.prompt, this.hint, this.toastBox, this.discovery, this.fps, this.lockHint, this.flightStatus, this.flightHelp);
    r.append(this.hud);
    this.flash = h('div', 'flash');
    this.fade = h('div', 'fade');
    this.aimCamera = h('div', 'aim aim-camera', '<div class="vf-corner tl"></div><div class="vf-corner tr"></div><div class="vf-corner bl"></div><div class="vf-corner br"></div><div class="vf-center"></div><div class="vf-info">F · capture</div>');
    this.aimBino = h('div', 'aim aim-bino');
    r.append(this.aimCamera, this.aimBino, this.flash, this.fade);

    // title
    this.title = h('div', 'overlay title interactive', `
      <div class="title-inner">
        <div class="title-name">TIDEMARK</div>
        <div class="title-sub">a lagoon field journal</div>
        <button class="title-start">Begin</button>
        <div class="title-keys">WASD move · Mouse look · Shift sprint · Space jump · E interact · F use · R put down · Q stow · Tab inventory · M map · N notebook · Esc pause</div>
        <div class="title-keys touch-only">Left thumb moves, push to the rim to run · Right thumb looks around · E interacts, F uses what you hold</div>
      </div>`);
    this.title.querySelector('.title-start').addEventListener('click', (e) => { e.stopPropagation(); this.game.start(); });
    this.title.addEventListener('click', () => this.game.start());
    r.append(this.title);

    // pause
    this.pause = h('div', 'overlay pause interactive');
    this.pauseMain = h('div', 'menu', `
      <div class="menu-title">Paused</div>
      <button data-a="continue">Continue</button>
      <button data-a="settings">Settings</button>
      <button data-a="controls">Controls</button>
      <button data-a="restart">Restart</button>`);
    this.pauseMain.addEventListener('click', (e) => {
      const a = e.target.dataset.a;
      if (a === 'continue') this.game.resume();
      if (a === 'settings') this.showPanel('settings');
      if (a === 'controls') this.showPanel('controls');
      if (a === 'restart') this.game.restart();
    });
    this.settingsPanel = this._buildSettings();
    this.controlsPanel = h('div', 'menu wide', `
      <div class="menu-title">Controls</div>
      <div class="keys">
        <div><b>W A S D</b><span>Move</span></div><div><b>Mouse</b><span>Look</span></div>
        <div><b>Shift</b><span>Sprint</span></div><div><b>Space</b><span>Jump · swim up</span></div>
        <div><b>C / Ctrl</b><span>Dive</span></div><div><b>E</b><span>Interact</span></div>
        <div><b>F / Left click</b><span>Use held item · contextual action</span></div><div><b>Right mouse</b><span>Aim camera / binoculars</span></div>
        <div><b>R</b><span>Put down held item</span></div><div><b>Q</b><span>Stow held item</span></div>
        <div><b>Tab / I</b><span>Inventory</span></div><div><b>M</b><span>Map</span></div>
        <div><b>N</b><span>Field notebook</span></div><div><b>Esc</b><span>Pause</span></div>
        <div><b>In the boat</b><span>W/S throttle · A/D steer · E leave</span></div><div><b>F2</b><span>Developer panel</span></div>
      </div>
      <div class="menu-sub">Flying the seaplane</div>
      <div class="keys">
        <div><b>W / S</b><span>Pitch (push / pull)</span></div><div><b>A / D</b><span>Roll · steer on the water</span></div>
        <div><b>Z / X</b><span>Rudder</span></div><div><b>R / F · wheel</b><span>Throttle</span></div>
        <div><b>G / B</b><span>Flaps up / down</span></div><div><b>[ ] · PgUp / PgDn</b><span>Elevator trim</span></div>
        <div><b>Hold Q</b><span>Start engine (tap to stop)</span></div><div><b>U</b><span>Water rudders</span></div>
        <div><b>L</b><span>Lights</span></div><div><b>Hold right mouse</b><span>Fly with the mouse</span></div>
        <div><b>V · O</b><span>Cockpit / chase · orbit camera</span></div><div><b>Hold E</b><span>Climb out</span></div>
      </div>
      <button data-a="back">Back</button>`);
    this.controlsPanel.addEventListener('click', (e) => { if (e.target.dataset.a === 'back') this.showPanel('main'); });
    this.pause.append(this.pauseMain, this.settingsPanel, this.controlsPanel);
    r.append(this.pause);

    // inventory
    this.inv = h('div', 'overlay inventory interactive');
    r.append(this.inv);
    // notebook
    this.note = h('div', 'overlay notebook interactive');
    r.append(this.note);
    // map
    this.map = h('div', 'overlay mapview interactive');
    r.append(this.map);

    // debug
    this.debug = this._buildDebug();
    r.append(this.debug);
    this.showPanel('main');
  }

  _buildSettings() {
    const g = this.game;
    const s = g.settings;
    const el = h('div', 'menu wide settings');
    const opt = (key, label, values) => `<div class="row"><label>${label}</label><div class="seg" data-k="${key}">${values.map(([v, t]) => `<button data-v="${v}">${t}</button>`).join('')}</div></div>`;
    const range = (key, label, min, max, step) => `<div class="row"><label>${label}</label><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}"><span class="val" data-for="${key}"></span></div>`;
    el.innerHTML = `
      <div class="menu-title">Settings</div>
      <div class="section">Graphics</div>
      ${opt('preset', 'Preset', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}
      ${range('renderScale', 'Resolution scale', 0.5, 1, 0.05)}
      ${opt('shadows', 'Shadow quality', [['off', 'Off'], ['low', 'Low'], ['medium', 'Med'], ['high', 'High']])}
      ${opt('vegetation', 'Vegetation', [['low', 'Low'], ['medium', 'Med'], ['high', 'High']])}
      ${opt('water', 'Water', [['low', 'Low'], ['medium', 'Med'], ['high', 'High']])}
      ${opt('post', 'Post processing', [['low', 'Low'], ['medium', 'Med'], ['high', 'High']])}
      ${range('fov', 'Field of view', 60, 90, 1)}
      <div class="section">Audio</div>
      ${range('master', 'Master', 0, 1, 0.05)}
      ${range('ambience', 'Ambience', 0, 1, 0.05)}
      ${range('effects', 'Effects', 0, 1, 0.05)}
      ${range('music', 'Radio', 0, 1, 0.05)}
      <div class="section">Input</div>
      ${range('sensitivity', 'Mouse sensitivity', 0.2, 2.5, 0.05)}
      ${opt('invertY', 'Invert Y', [['false', 'Off'], ['true', 'On']])}
      ${opt('flightAssist', 'Flight assist', [['off', 'Off'], ['normal', 'Normal'], ['high', 'High']])}
      <button data-a="back">Back</button>`;
    const refresh = () => {
      el.querySelectorAll('.seg').forEach((seg) => {
        const k = seg.dataset.k;
        seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(s.get(k)) === b.dataset.v));
      });
      el.querySelectorAll('input[type=range]').forEach((inp) => {
        inp.value = s.get(inp.dataset.k);
        const v = el.querySelector(`.val[data-for="${inp.dataset.k}"]`);
        const val = Number(s.get(inp.dataset.k));
        v.textContent = inp.dataset.k === 'fov' ? `${val}°` : inp.dataset.k === 'renderScale' ? `${Math.round(val * 100)}%` : val.toFixed(2);
      });
    };
    el.addEventListener('click', (e) => {
      const b = e.target;
      if (b.dataset.a === 'back') { this.showPanel('main'); return; }
      const seg = b.closest('.seg');
      if (seg && b.dataset.v !== undefined) {
        const k = seg.dataset.k;
        let v = b.dataset.v;
        if (k === 'preset') s.applyPreset(v);
        else {
          if (v === 'true') v = true; else if (v === 'false') v = false;
          s.set(k, v);
        }
        refresh();
      }
    });
    el.addEventListener('input', (e) => {
      const inp = e.target;
      if (inp.dataset.k) { s.set(inp.dataset.k, Number(inp.value)); refresh(); }
    });
    this.refreshSettings = refresh;
    refresh();
    return el;
  }

  _buildDebug() {
    const el = h('div', 'debug interactive');
    const weatherBtns = Object.keys(WEATHER_STATES).map((k) => `<button data-w="${k}">${WEATHER_STATES[k].label}</button>`).join('');
    const timeBtns = Object.entries(STATE_HOURS).map(([k, v]) => `<button data-t="${v}">${k}</button>`).join('');
    const poiBtns = POIS.map((p) => `<button data-p="${p.id}">${p.name}</button>`).join('');
    el.innerHTML = `
      <div class="dbg-title">Developer</div>
      <div class="dbg-stats"></div>
      <div class="dbg-row"><label>Time</label><input type="range" min="0" max="24" step="0.05" data-d="hour"><span class="dbg-clock"></span></div>
      <div class="dbg-row"><label>Speed</label><button data-s="0">pause</button><button data-s="1">1×</button><button data-s="20">20×</button><button data-s="120">120×</button><button data-s="600">600×</button></div>
      <div class="dbg-row wrap">${timeBtns}</div>
      <div class="dbg-row wrap">${weatherBtns}<button data-wa="1">auto</button><button data-wf="1">fast transitions</button></div>
      <div class="dbg-row wrap">${poiBtns}</div>
      <div class="dbg-row wrap"><label>Plane</label><button data-sp="pier">Moored at pier</button><button data-sp="air">Airborne 300 m</button><button data-sp="repair">Repair</button></div>`;
    el.addEventListener('click', (e) => {
      const b = e.target;
      const g = this.game;
      if (b.dataset.w) { g.weather.auto = false; g.weather.set(b.dataset.w); }
      if (b.dataset.wa) g.weather.auto = true;
      if (b.dataset.wf) { g.weather.transitionRate = g.weather.transitionRate > 0.1 ? 0.035 : 0.4; b.classList.toggle('on', g.weather.transitionRate > 0.1); }
      if (b.dataset.t) g.setTime(parseFloat(b.dataset.t));
      if (b.dataset.sp === 'pier') { if (g.seaplane.occupied) g.seaplane.exit(g, true); g.seaplane.atPier(); }
      if (b.dataset.sp === 'air') { if (g.boat.occupied) g.boat.exit(g); if (!g.seaplane.occupied) g.seaplane.board(g); g.seaplane.airborne(300); }
      if (b.dataset.sp === 'repair') g.seaplane.repair();
      if (b.dataset.s !== undefined) {
        const sp = parseFloat(b.dataset.s);
        g.timeOfDay.paused = sp === 0;
        g.timeOfDay.speed = sp === 0 ? g.timeOfDay.speed : (sp / 75);
      }
      if (b.dataset.p) {
        const p = POIS.find((q) => q.id === b.dataset.p);
        if (p) g.teleport(p.x, p.z + (p.id === 'camp' ? 3 : 0));
      }
    });
    el.addEventListener('input', (e) => { if (e.target.dataset.d === 'hour') this.game.setTime(parseFloat(e.target.value)); });
    return el;
  }

  showPanel(which) {
    this.pauseMain.style.display = which === 'main' ? '' : 'none';
    this.settingsPanel.style.display = which === 'settings' ? '' : 'none';
    this.controlsPanel.style.display = which === 'controls' ? '' : 'none';
    if (which === 'settings') this.refreshSettings();
  }

  setState(state) {
    this.title.classList.toggle('show', state === 'title');
    this.pause.classList.toggle('show', state === 'paused');
    this.hud.classList.toggle('show', state === 'playing');
    if (state === 'paused') this.showPanel('main');
  }

  // ---------------------------------------------------------------- HUD
  toast(text, dur = 4.5) {
    const t = h('div', 'toast', text);
    this.toastBox.prepend(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 700); }, dur * 1000);
    while (this.toastBox.children.length > 4) this.toastBox.lastChild.remove();
  }

  discover(name, sub = 'Discovered') {
    this.discovery.innerHTML = `<div class="disc-sub">${sub}</div><div class="disc-name">${name}</div>`;
    this.discovery.classList.remove('in');
    void this.discovery.offsetWidth;
    this.discovery.classList.add('in');
    clearTimeout(this._discT);
    this._discT = setTimeout(() => this.discovery.classList.remove('in'), 4200);
  }

  photoFlash() {
    this.flash.classList.remove('go');
    void this.flash.offsetWidth;
    this.flash.classList.add('go');
  }

  setFade(v) { this.fade.style.opacity = v; }

  setAimOverlay(id) {
    this.aimCamera.classList.toggle('show', id === 'camera');
    this.aimBino.classList.toggle('show', id === 'binoculars');
  }

  update(dt) {
    const g = this.game;
    const it = g.interaction.focus;
    let html = '';
    if (it && g.state === 'playing') {
      html = `<span class="k">E</span>${it.label(g)}`;
      const l2 = it.label2(g);
      if (l2) html += `<span class="sep"></span><span class="k">F</span>${l2}`;
    } else if (g.boat && g.boat.prompt && g.state === 'playing') {
      html = g.boat.prompt;
    }
    if (html !== this._lastPrompt) {
      this.prompt.innerHTML = html;
      this.prompt.classList.toggle('show', !!html);
      this._lastPrompt = html;
    }
    this.reticle.classList.toggle('active', !!it);
    // held item hints
    const def = g.inventory.equippedDef;
    let hint = '';
    if (g.player.mode === 'boat') hint = '<span class="k">W</span><span class="k">S</span> throttle <span class="k">A</span><span class="k">D</span> steer <span class="k">E</span> leave';
    else if (def) {
      const id = g.inventory.equipped;
      const count = def.stack ? ` ×${g.inventory.count(id)}` : '';
      hint = `<span class="item">${def.name}${count}</span>`;
      if (def.use) hint += `<span class="k">F</span>${def.use}`;
      if (def.aim) hint += '<span class="k">RMB</span>aim';
      if (def.world) hint += '<span class="k">R</span>put down';
      hint += '<span class="k">Q</span>stow';
    }
    if (hint !== this._lastHint) {
      this.hint.innerHTML = hint;
      this.hint.classList.toggle('show', !!hint);
      this._lastHint = hint;
    }
    // the mouse is free (capture refused or not yet requested): say how to look around
    const needLock = g.state === 'playing' && !g.input.locked && !g.touch?.active && !g.autostart;
    if (needLock !== this._lastLock) {
      this.lockHint.classList.toggle('show', needLock);
      this._lastLock = needLock;
    }
    // seaplane instruments line
    const flying = g.player.mode === 'plane' && g.seaplane;
    if (flying) {
      if (g.seaplane.status !== this._lastStatus) { this.flightStatus.innerHTML = g.seaplane.status; this._lastStatus = g.seaplane.status; }
    }
    if (flying !== this._lastFlying) {
      this._lastFlying = flying;
      this.flightStatus.classList.toggle('show', !!flying);
      this.reticle.style.display = flying ? 'none' : '';
    }
    // fps / debug
    if (this.debug.classList.contains('show')) {
      const info = g.renderer.renderer.info.render;
      this.debug.querySelector('.dbg-stats').textContent = `${g.perf.fps.toFixed(0)} fps · ${g.perf.ms.toFixed(1)} ms · ${info.calls} calls · ${(info.triangles / 1000).toFixed(0)}k tris · ${g.timeOfDay.name} · ${g.weather.label}${g.weather.auto ? ' (auto)' : ''} · pos ${g.player.pos.x.toFixed(0)}, ${g.player.pos.z.toFixed(0)}`;
      this.debug.querySelector('.dbg-clock').textContent = g.timeOfDay.clock;
      const slider = this.debug.querySelector('input[data-d=hour]');
      if (document.activeElement !== slider) slider.value = g.timeOfDay.hour;
    }
    if (g.settings.get('showFps')) this.fps.textContent = `${g.perf.fps.toFixed(0)}`;
  }

  toggleDebug() { this.debug.classList.toggle('show'); }

  /** The flight controls card shows while flying and fades to a reminder after a while. */
  showFlightHelp(on) {
    clearTimeout(this._helpTimer);
    this.flightHelp.classList.toggle('show', on);
    this.flightHelp.classList.remove('dim');
    if (on) this._helpTimer = setTimeout(() => this.flightHelp.classList.add('dim'), 25000);
  }

  // ---------------------------------------------------------------- inventory
  openInventory() {
    const g = this.game;
    const list = g.inventory.list();
    const items = list.map((it) => `
      <div class="inv-item ${g.inventory.equipped === it.id ? 'eq' : ''}" data-id="${it.id}">
        <div class="inv-name">${it.name}${it.stack ? ` <span class="cnt">×${it.count}</span>` : ''}</div>
        <div class="inv-desc">${it.desc}</div>
        ${it.hold ? `<div class="inv-act">${g.inventory.equipped === it.id ? 'In hand' : 'Hold'}</div>` : ''}
      </div>`).join('') || '<div class="empty">Nothing yet. Look around the camp.</div>';
    const photos = g.inventory.photos.slice().reverse().map((p) => `<figure><img src="${p.url}"><figcaption>${p.caption}</figcaption></figure>`).join('');
    const shells = g.inventory.count('shell');
    const found = [...this.discovered].length;
    this.inv.innerHTML = `
      <div class="panel">
        <div class="panel-head"><span>Inventory</span><span class="dim">${shells}/12 shells · ${found}/${POIS.length} places</span></div>
        <div class="inv-grid">${items}</div>
        ${photos ? `<div class="panel-head small">Photographs</div><div class="photos">${photos}</div>` : ''}
        <button type="button" class="close-hint" data-close>Close · Tab</button>
      </div>`;
    this.inv.querySelectorAll('.inv-item').forEach((el) => el.addEventListener('click', () => {
      const id = el.dataset.id;
      if (ITEMS[id]?.hold) {
        if (g.inventory.equipped === id) g.inventory.unequip(); else g.inventory.equip(id);
        this.openInventory();
      } else if (id === 'map') { this.closeAll(); this.openMap(); } else if (id === 'notebook') { this.closeAll(); this.openNotebook(); }
    }));
    this._open('inv');
  }

  openNotebook() {
    const g = this.game;
    const entries = JOURNAL.concat(g.journal || []);
    this.note.innerHTML = `
      <div class="book">
        <div class="book-head">Field Notebook</div>
        ${entries.map((e) => `<div class="entry"><div class="entry-title">${e.title}</div><div class="entry-text">${e.text.replace(/\n/g, '<br>')}</div></div>`).join('')}
        <button type="button" class="close-hint" data-close>Close · N</button>
      </div>`;
    this._open('note');
  }

  openMap() {
    const g = this.game;
    const camp = g.camp;
    const { x0, x1, z0, z1 } = camp.mapBounds;
    const px = ((g.player.pos.x - x0) / (x1 - x0)) * 100;
    const pz = ((g.player.pos.z - z0) / (z1 - z0)) * 100;
    const yawDeg = (-g.player.yaw * 180) / Math.PI;
    this.map.innerHTML = `
      <div class="map-wrap">
        <img src="${camp.mapCanvas.toDataURL('image/jpeg', 0.9)}">
        <div class="you" style="left:${px}%;top:${pz}%;transform:translate(-50%,-50%) rotate(${yawDeg}deg)"></div>
        <button type="button" class="close-hint" data-close>Close · M</button>
      </div>`;
    this._open('map');
  }

  _open(which) {
    this.closeAll(false);
    const el = which === 'inv' ? this.inv : which === 'note' ? this.note : this.map;
    el.classList.add('show');
    el.querySelector('[data-close]')?.addEventListener('click', () => this.closeAll());
    this.open = which;
    this.game.setMenuOpen(true);
  }

  closeAll(notify = true) {
    for (const el of [this.inv, this.note, this.map]) el.classList.remove('show');
    const was = this.open;
    this.open = null;
    if (notify && was) this.game.setMenuOpen(false);
  }
}
