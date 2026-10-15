// Full-screen panels: loading, title, contracts board, load sheet, results,
// pause, settings (quality, assist, wind, audio, key bindings), help, map,
// crash.
import { h } from './hud.js';
import { CONTRACTS } from '../game/contracts.js';
import { ACTIONS, keyLabel } from '../core/input.js';
import { FLIGHT, GAME, SPRAY } from '../config.js';
import { drawMap } from './maps.js';

const money = (v) => `${GAME.currency} ${Math.round(v).toLocaleString('en-US')}`;
const pct = (v) => `${Math.round(v * 100)}%`;

export class Screens {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.open = null;
    this.loading = h(`<div class="loading"><div class="brand">AGRO <b>WINGS</b></div><div class="loading-bar"><span style="width:0%"></span></div><div class="loading-label">Loading</div></div>`);
    root.appendChild(this.loading);
    this.title = h(`<div class="overlay title interactive">
      <div class="title-inner">
        <div class="brand">AGRO <b>WINGS</b></div>
        <div class="title-sub">Agricultural aviation · Fazenda Boa Esperança, Mato Grosso</div>
        <div class="btn-row">
          <button class="btn primary" data-a="career">Contracts</button>
          <button class="btn" data-a="free">Free flight</button>
          <button class="btn" data-a="freeAir">Free flight (airborne)</button>
          <button class="btn" data-a="settings">Settings</button>
          <button class="btn" data-a="help">Controls</button>
        </div>
        <div class="title-keys"></div>
      </div></div>`);
    root.appendChild(this.title);
    this.title.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a) game.menuAction(a);
    });
    this.modal = h(`<div class="overlay modal interactive"></div>`);
    root.appendChild(this.modal);
    this.modal.addEventListener('pointerdown', (e) => { if (e.target === this.modal && this.open !== 'crash' && this.open !== 'results') this.close(); });
  }

  setLoading(p, label) {
    this.loading.querySelector('.loading-bar span').style.width = `${Math.round(p * 100)}%`;
    this.loading.querySelector('.loading-label').textContent = label;
  }
  hideLoading() { this.loading.remove(); }

  showTitle(v) {
    this.title.classList.toggle('show', v);
    if (v) {
      const k = (a) => keyLabel(this.game.input.bindings[a][0]);
      this.title.querySelector('.title-keys').innerHTML = this.game.touch?.active
        ? 'Touch: left stick flies, right slider sets power. Buttons for spray, brakes, camera and engine.'
        : `W/S pitch · A/D roll · ${k('yawLeft')}/${k('yawRight')} rudder · ${k('throttleUp')}/${k('throttleDown')} power · ${k('brakes')} brakes · ${k('spray')} spray · hold ${k('engine')} engine · ${k('camera')} camera · ${k('map')} map · Esc menu`;
    }
  }

  close() {
    if (!this.open) return;
    const was = this.open;
    this.open = null;
    this.modal.classList.remove('show');
    this.modal.innerHTML = '';
    this.game.onScreenClosed?.(was);
  }

  _show(name, el) {
    this.open = name;
    this.modal.innerHTML = '';
    this.modal.appendChild(el);
    this.modal.classList.add('show');
    this.game.audio?.play('ui');
  }

  // --------------------------------------------------------------- contracts
  board() {
    const g = this.game;
    const cards = CONTRACTS.map((c) => {
      const job = g.career.jobs[c.id];
      const st = job ? job.stats() : null;
      const ha = job ? job.ha : g.career.job(c.id).ha;
      const done = g.career.completed[c.id];
      const prog = st && st.coverage > 0.001 ? `In progress · ${pct(st.coverage)} covered` : done ? `Completed ${done.stars ? '★'.repeat(done.stars) : ''} · can be flown again` : 'Not started';
      return `<div class="card ${g.job?.c.id === c.id ? 'sel' : ''}">
        <span class="tag">${c.difficulty}</span>
        <div class="name">${c.title}</div>
        <div class="desc">${c.brief}</div>
        <div class="meta"><span>${ha.toFixed(1)} ha</span><span>${GAME.currency} ${c.payPerHa}/ha</span><span>bonus ${money(c.bonus)}</span></div>
        <div class="prog">${prog}</div>
        <div class="btn-row" style="justify-content:flex-start">
          <button class="btn primary small" data-sel="${c.id}">${st && st.coverage > 0.001 ? 'Resume' : 'Accept'}</button>
          ${st && st.coverage > 0.001 ? `<button class="btn small" data-restart="${c.id}">Restart</button>` : ''}
        </div>
      </div>`;
    }).join('');
    const el = h(`<div class="panel"><h2>Service orders</h2>
      <div class="sub">Choose a job, set the load, and the badeco will service the aircraft on the pad.</div>
      <div class="cards">${cards}</div>
      <div class="row2"><span class="money">Balance ${money(g.career.money)}</span>
      <div class="btn-row">${g.job ? '<button class="btn small" data-a="abandon">Hand in current job</button>' : ''}<button class="btn small" data-a="close">Close</button></div></div></div>`);
    el.addEventListener('click', (e) => {
      const sel = e.target.closest('[data-sel]')?.dataset.sel;
      const rs = e.target.closest('[data-restart]')?.dataset.restart;
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (sel) g.selectContract(sel);
      else if (rs) { g.career.job(rs).reset(); g.career.save(); this.board(); }
      else if (a === 'close') this.close();
      else if (a === 'abandon') g.handIn();
    });
    this._show('board', el);
  }

  // --------------------------------------------------------------- load sheet
  loadSheet(job) {
    const g = this.game;
    const fm = g.aircraft.fm;
    const rec = job ? job.c.recommended : { fuel: FLIGHT.fuelCapacity, liquid: 600 };
    let fuel = Math.max(fm.fuel, Math.min(FLIGHT.fuelCapacity, rec.fuel));
    let liquid = Math.max(fm.hopper, Math.min(FLIGHT.hopperCapacity, rec.liquid));
    const st = job ? job.stats() : null;
    const el = h(`<div class="panel" style="width:min(620px,calc(100vw - 32px))"><h2>Load sheet</h2>
      <div class="sub">${job ? `${job.c.title} — ${pct(st.coverage)} covered. ${job.c.tip}` : 'Free flight — load as you like.'}</div>
      <div class="field"><label>Fuel (ethanol)</label><input type="range" min="0" max="${FLIGHT.fuelCapacity}" step="5" value="${fuel}" data-k="fuel"><span class="val vf"></span></div>
      <div class="field"><label>Application liquid</label><input type="range" min="0" max="${FLIGHT.hopperCapacity}" step="10" value="${liquid}" data-k="liquid"><span class="val vl"></span></div>
      <h3>Weight &amp; performance</h3>
      <div class="stats">
        <div class="stat"><b class="m"></b><span>Take-off mass</span></div>
        <div class="stat"><b class="r"></b><span>Est. ground roll</span></div>
        <div class="stat"><b class="c"></b><span>Fuel cost</span></div>
        <div class="stat"><b class="e"></b><span>Spray time at full flow</span></div>
      </div>
      <div class="note">Fuel is billed to you. The client supplies the application liquid; whatever lands outside the talhão, drifts away or is over-applied counts as waste in the evaluation. A heavy hopper means a longer take-off roll, slower climb and a higher stall speed.</div>
      <div class="row2"><span class="money">Balance ${money(g.career.money)}</span><div class="btn-row">
        <button class="btn small" data-a="rec">Recommended</button><button class="btn small" data-a="close">Cancel</button><button class="btn primary" data-a="go">Request service</button></div></div></div>`);
    const upd = () => {
      el.querySelector('.vf').textContent = `${Math.round(fuel)} L`;
      el.querySelector('.vl').textContent = `${Math.round(liquid)} L`;
      const mass = FLIGHT.emptyMass + FLIGHT.pilotMass + fuel * FLIGHT.fuelDensity + liquid * FLIGHT.liquidDensity;
      el.querySelector('.m').textContent = `${Math.round(mass)} kg`;
      // Empirical fit to the flight model's measured rolls (empty ~140 m, full ~600 m).
      const roll = 140 * Math.pow(mass / 1303, 2.9);
      el.querySelector('.r').textContent = `${Math.round(roll / 10) * 10} m`;
      el.querySelector('.c').textContent = money(Math.max(0, fuel - fm.fuel) * GAME.fuelPrice);
      el.querySelector('.e').textContent = `${Math.round(liquid / SPRAY.flow)} s`;
    };
    el.addEventListener('input', (e) => {
      const k = e.target.dataset.k;
      if (k === 'fuel') fuel = Math.max(fm.fuel, +e.target.value);
      if (k === 'liquid') liquid = Math.max(fm.hopper, +e.target.value);
      e.target.value = k === 'fuel' ? fuel : liquid;
      upd();
    });
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'close') this.close();
      if (a === 'rec') {
        fuel = Math.max(fm.fuel, rec.fuel); liquid = Math.max(fm.hopper, rec.liquid);
        el.querySelector('[data-k=fuel]').value = fuel; el.querySelector('[data-k=liquid]').value = liquid; upd();
      }
      if (a === 'go') { this.close(); g.requestService(fuel, liquid); }
    });
    upd();
    this._show('load', el);
  }

  // --------------------------------------------------------------- results
  results(r, job) {
    const g = this.game;
    const el = h(`<div class="panel"><h2>${r.done ? 'Job complete' : 'Job handed in'} — ${job.c.title}</h2>
      <div class="sub">${r.done ? 'The client inspected the talhão.' : 'Partial work is paid pro rata.'} <span class="stars">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</span></div>
      <div class="stats">
        <div class="stat"><b>${pct(r.coverage)}</b><span>Useful coverage</span></div>
        <div class="stat"><b>${pct(r.uniformity)}</b><span>Uniformity</span></div>
        <div class="stat"><b>${pct(r.gaps)}</b><span>Gaps (falhas)</span></div>
        <div class="stat"><b>${pct(r.overlap)}</b><span>Overlap</span></div>
        <div class="stat"><b>${pct(r.waste)}</b><span>Waste</span></div>
        <div class="stat"><b>${Math.round(100 - r.damage)}%</b><span>Aircraft condition</span></div>
      </div>
      <h3>Liquid</h3>
      <table class="ledger">
        <tr><td>Sprayed</td><td>${Math.round(r.sprayed)} L</td></tr>
        <tr><td>Landed on the talhão</td><td>${Math.round(r.applied)} L</td></tr>
        <tr><td>Off target (roads, creek, other fields)</td><td>${Math.round(r.offTarget)} L</td></tr>
        <tr><td>Drift / evaporation</td><td>${Math.round(r.lost)} L</td></tr>
        <tr><td>Over-application</td><td>${Math.round(r.overdose)} L</td></tr>
      </table>
      <h3>Payment</h3>
      <table class="ledger">
        <tr><td>Area rate (${job.ha.toFixed(1)} ha × ${GAME.currency} ${job.c.payPerHa}, by coverage)</td><td>${money(r.base)}</td></tr>
        <tr><td>Quality factor (uniformity, waste)</td><td>× ${(r.quality).toFixed(2)}</td></tr>
        <tr><td>Completion bonus</td><td>${money(r.bonus)}</td></tr>
        <tr><td>Repairs</td><td>− ${money(r.repair)}</td></tr>
        <tr class="total"><td>Credited</td><td>${money(r.total)}</td></tr>
      </table>
      <div class="row2"><span class="money">Balance ${money(g.career.money)}</span><div class="btn-row">
        <button class="btn" data-a="fly">Keep flying</button><button class="btn primary" data-a="board">New service</button></div></div></div>`);
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'fly') this.close();
      if (a === 'board') this.board();
    });
    this._show('results', el);
    g.audio?.play('success');
  }

  // --------------------------------------------------------------- pause
  pause() {
    const g = this.game;
    const el = h(`<div class="panel" style="width:min(420px,calc(100vw - 32px))"><h2>Paused</h2>
      <div class="sub">${g.job ? g.job.c.title : g.mode === 'free' ? 'Free flight' : ''}</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn primary" data-a="resume">Resume</button>
        <button class="btn" data-a="board">Service orders</button>
        <button class="btn" data-a="map">Map</button>
        <button class="btn" data-a="settings">Settings</button>
        <button class="btn" data-a="help">Controls</button>
        <button class="btn" data-a="resetPad">Reset aircraft to the pad</button>
        <button class="btn" data-a="resetRwy">Reset aircraft on the strip</button>
        <button class="btn" data-a="title">Main menu</button>
      </div></div>`);
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      if (a === 'resume') this.close();
      else g.menuAction(a);
    });
    this._show('pause', el);
  }

  // --------------------------------------------------------------- settings
  settings() {
    const g = this.game;
    const s = g.settings;
    const seg = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const keys = Object.entries(ACTIONS).map(([a, d]) => `<div class="kr"><span>${d.label}</span><button class="keybtn" data-bind="${a}">${g.input.bindings[a].map(keyLabel).join(' / ')}</button></div>`).join('');
    const el = h(`<div class="panel"><h2>Settings</h2>
      <h3>Graphics</h3>
      <div class="field"><label>Quality</label>${seg('quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}<span></span></div>
      <div class="field"><label>Show FPS</label>${seg('showFps', [[false, 'Off'], [true, 'On']])}<span></span></div>
      <h3>Flying</h3>
      <div class="field"><label>Flight assist</label>${seg('assist', [['off', 'Off'], ['normal', 'Normal'], ['high', 'High']])}<span></span></div>
      <div class="field"><label>Wind</label>${seg('wind', [[0, 'Calm'], [1, 'Light'], [1.8, 'Moderate']])}<span></span></div>
      <h3>Audio</h3>
      <div class="field"><label>Volume</label><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-vol><span class="val">${Math.round(s.volume * 100)}%</span></div>
      <h3>Keys <span style="color:var(--ink-faint);letter-spacing:0;text-transform:none">— click a key, then press the new one (Esc cancels)</span></h3>
      <div class="keys">${keys}</div>
      <div class="note">Assist Normal keeps attitude when the stick is centred, coordinates turns and protects against stalls; High also limits bank and pitch. Off gives raw control surfaces. On the ground, assist adds a light yaw damper against ground loops.</div>
      <div class="row2"><button class="btn small" data-a="resetKeys">Reset keys</button><button class="btn small" data-a="resetSave">Reset career</button><button class="btn primary small" data-a="close">Done</button></div></div>`);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('.seg button');
      if (b) {
        const key = b.parentElement.dataset.key;
        let v = b.dataset.v;
        if (v === 'true' || v === 'false') v = v === 'true';
        else if (!Number.isNaN(+v) && key === 'wind') v = +v;
        g.setSetting(key, v);
        b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        return;
      }
      const kb = e.target.closest('[data-bind]');
      if (kb) {
        kb.classList.add('wait');
        kb.textContent = 'press a key…';
        g.input.rebind(kb.dataset.bind, () => { this.settings(); });
        return;
      }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'close') this.close();
      if (a === 'resetKeys') { g.input.resetBindings(); this.settings(); }
      if (a === 'resetSave') {
        // Two-step confirmation inside the page (no browser dialogs).
        const btn = e.target.closest('[data-a]');
        if (btn.dataset.armed) { g.career.resetAll(); g.job = null; g.setJob(null); this.settings(); g.toast('Career reset.'); }
        else { btn.dataset.armed = '1'; btn.textContent = 'Click again to reset'; }
      }
    });
    el.addEventListener('input', (e) => {
      if (e.target.dataset.vol !== undefined) {
        g.setSetting('volume', +e.target.value);
        e.target.nextElementSibling.textContent = `${Math.round(+e.target.value * 100)}%`;
      }
    });
    this._show('settings', el);
  }

  help() {
    const g = this.game;
    const rows = Object.entries(ACTIONS).map(([a, d]) => `<div><span>${d.label}</span><b>${g.input.bindings[a].map(keyLabel).join(' / ')}</b></div>`).join('');
    const el = h(`<div class="panel"><h2>Controls</h2>
      <div class="sub">Same layout as Tidemark’s aircraft. Mouse: left-drag looks around, right-drag is a virtual stick, wheel sets power (zoom in the free camera). Gamepad: left stick flies, triggers set power, bumpers rudder, A spray, B brakes.</div>
      <div class="helpgrid">${rows}<div><span>Speed up ground service</span><b>T (hold)</b></div></div>
      <h3>Agricultural flying</h3>
      <div class="note" style="color:var(--ink-dim)">Work at 2.5–4.5 m over the crop canopy (the HGT readout turns green), around 85–105 kt. Too low narrows the swath and risks a crop strike; too high widens it but liquid drifts and evaporates. Fly along the yellow pass line — the lightbar on the glareshield shows which way to steer. Switch the spray off at the field edge and over gaps. Land back on the strip, taxi to the pad and tap Q to shut down: the badeco reloads and your coverage is kept.</div>
      <div class="row2"><span></span><button class="btn primary small" data-a="close">Close</button></div></div>`);
    el.addEventListener('click', (e) => { if (e.target.closest('[data-a]')) this.close(); });
    this._show('help', el);
  }

  map() {
    const g = this.game;
    const el = h(`<div class="mapwrap"><canvas width="1400" height="1400"></canvas>
      <div class="legend"><div><i style="background:#3f8f2c"></i>Soy</div><div><i style="background:#2f7224"></i>Corn</div><div><i style="background:#5f8f4a"></i>Cotton</div><div><i style="background:#9a3a1c"></i>Roads / fallow</div><div><i style="background:#1f3a18"></i>Forest</div><div><i style="background:#c83228"></i>Not covered</div><div><i style="background:#46c85a"></i>Covered</div><div><i style="background:#9650dc"></i>Overlap</div><div><i style="background:#ffe14a"></i>Next pass</div></div></div>`);
    const c = el.querySelector('canvas');
    const draw = () => {
      if (this.open !== 'map') return;
      const ac = g.aircraft.fm.pos;
      const job = g.job;
      let cx = ac.x * 0.5 + 400, cz = ac.z * 0.5, range = 1900;
      if (job) {
        const f = job.fields;
        cx = (Math.min(...f.map((x) => x.x0)) + Math.max(...f.map((x) => x.x1))) / 2 * 0.6 + ac.x * 0.4;
        cz = (Math.min(...f.map((x) => x.z0)) + Math.max(...f.map((x) => x.z1))) / 2 * 0.6 + ac.z * 0.4;
        range = 1200;
      }
      drawMap(c.getContext('2d'), c.width, c.height, g.hud.base, g, { cx, cz, range });
      requestAnimationFrame(draw);
    };
    this._show('map', el);
    el.addEventListener('click', () => this.close());
    requestAnimationFrame(draw);
  }

  crash(reason, cost) {
    const g = this.game;
    const el = h(`<div class="panel" style="width:min(480px,calc(100vw - 32px))"><h2>${reason}</h2>
      <div class="sub">The aircraft is down. You walked away from it. Recovery and repairs: <b>${money(cost)}</b>. Job coverage is kept.</div>
      <div class="row2"><span class="money">Balance ${money(g.career.money)}</span><button class="btn primary" data-a="recover">Recover at the base</button></div></div>`);
    el.addEventListener('click', (e) => { if (e.target.closest('[data-a]')) { this.close(); g.recover(); } });
    this._show('crash', el);
  }
}

export { money, pct };
