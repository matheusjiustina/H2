// Full-screen panels: loading, title, contracts board, load sheet, results,
// pause, settings (quality, assist, wind, audio, key bindings), help, map,
// crash.
import { h } from './hud.js';
import { TIMES, WEATHER, TIME_ORDER, WEATHER_ORDER } from '../world/atmosphere.js';
import { CONTRACTS, LEVELS } from '../game/contracts.js';
import { fieldsTerrain } from '../world/terrainInfo.js';
import { BASE } from '../world/layout.js';
import { ACTIONS, KEY_SCHEMES, keyLabel } from '../core/input.js';
import { GAME } from '../config.js';
import { AIRCRAFT_TYPES, AIRCRAFT_ORDER, REG_PREFIXES, normalizeReg, regTaken } from '../aircraft/types.js';
import { hoverPower, hoverPowerFrac } from '../flight/heliModel.js';
import { drawMap, mapControls } from './maps.js';
import { showOffice } from './office.js';
import { t, getLang, setLang } from '../i18n/index.js';

const money = (v) => `${GAME.currency} ${Math.round(v).toLocaleString('en-US')}`;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const pct = (v) => `${Math.round(v * 100)}%`;

export class Screens {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.open = null;
    this.loading = h(`<div class="loading"><div class="brand">AGRO <b>WINGS</b></div><div class="loading-bar"><span style="width:0%"></span></div><div class="loading-label">${t('Loading')}</div></div>`);
    root.appendChild(this.loading);
    this.title = h(`<div class="overlay title interactive">
      <div class="title-inner">
        <div class="brand">AGRO <b>WINGS</b></div>
        <div class="title-sub">${t('Agricultural aviation · Fazenda Boa Esperança, Mato Grosso')}</div>
        <div class="ac-select" role="radiogroup" aria-label="${t('Aircraft')}">${AIRCRAFT_ORDER.map((id) => {
          const ty = AIRCRAFT_TYPES[id];
          return `<button class="ac-card" role="radio" aria-checked="false" data-ac="${id}">
            <span class="ac-slot">${t('Aircraft {0}', ty.slot)}</span>
            <span class="ac-label">${ty.label}</span>
            <span class="ac-reg">${ty.reg} · ${ty.name}</span>${ty.role ? `<span class="ac-role">${ty.role}</span>` : ''}
            <span class="ac-spec">${ty.engineName}<br>${ty.summary}</span>${id === 'b206' ? `
            <span class="ac-opts"><span class="ac-opt-l">${t('Paint')}</span>${['A', 'B', 'C'].map((l, i) => `<span class="ac-opt" data-livery="${i}" title="${[t('Agricultural Classic'), t('Dark Green Agricultural'), t('Red Utility')][i]}">${l}</span>`).join('')}<span class="ac-opt kit" data-kit="1">${t('Spray kit')}</span></span>` : ''}${id === 'm18' ? `
            <span class="ac-opts"><span class="ac-opt-l">${t('Paint')}</span>${['A', 'B'].map((l, i) => `<span class="ac-opt" data-lk="m18Livery" data-livery="${i}" title="${[t('Agro Wings yellow'), t('Hellenic fire-fighter')][i]}">${l}</span>`).join('')}</span>` : ''}
          </button>`;
        }).join('')}</div>
        <div class="btn-row">
          <button class="btn primary" data-a="career">${t('Contracts')}</button>
          <button class="btn" data-a="free">${t('Free flight')}</button>
          <button class="btn" data-a="freeAir">${t('Free flight (airborne)')}</button>
          <button class="btn" data-a="settings">${t('Settings')}</button>
          <button class="btn" data-a="help">${t('Controls')}</button>
        </div>
        <div class="title-keys"></div>
      </div></div>`);
    // Language: two small flags, top right (Portuguese is the default).
    const BR = '<svg viewBox="0 0 20 14" aria-hidden="true"><rect width="20" height="14" fill="#009c3b"/><path d="M10 1.6 18.2 7 10 12.4 1.8 7z" fill="#ffdf00"/><circle cx="10" cy="7" r="3.1" fill="#002776"/><path d="M7.1 6.3q3-1 5.8.9" stroke="#fff" stroke-width=".5" fill="none"/></svg>';
    const US = '<svg viewBox="0 0 19 10" aria-hidden="true"><rect width="19" height="10" fill="#fff"/>' +
      [0, 2, 4, 6, 8, 10, 12].map((i) => `<rect y="${(i * 10) / 13}" width="19" height="${10 / 13}" fill="#b22234"/>`).join('') +
      '<rect width="7.6" height="5.4" fill="#3c3b6e"/>' +
      [0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4].map((c) => `<circle cx="${0.8 + c * 1.5 + (r % 2) * 0.75}" cy="${0.75 + r * 1.3}" r=".3" fill="#fff"/>`).join('')).join('') + '</svg>';
    const pick = h(`<div class="lang-pick" role="radiogroup" aria-label="Idioma / Language">
      <button data-lang="pt" role="radio" title="Português">${BR}<span>PT</span></button>
      <button data-lang="en" role="radio" title="English">${US}<span>EN</span></button></div>`);
    for (const b of pick.querySelectorAll('[data-lang]')) {
      const on = b.dataset.lang === getLang();
      b.classList.toggle('sel', on);
      b.setAttribute('aria-checked', String(on));
    }
    pick.addEventListener('click', (e) => {
      const l = e.target.closest('[data-lang]')?.dataset.lang;
      if (!l || l === getLang()) return;
      setLang(l);
      // Everything is rebuilt in the new language (the game has not started yet).
      try { location.reload(); } catch { /* sandboxed: applies on the next load */ }
    });
    this.title.appendChild(pick);
    root.appendChild(this.title);
    this.title.addEventListener('click', (e) => {
      const lvEl = e.target.closest('[data-livery]');
      if (lvEl) game.setAircraftOption(lvEl.dataset.lk ?? 'b206Livery', +lvEl.dataset.livery);
      if (e.target.closest('[data-kit]')) game.setAircraftOption('b206Kit', game.settings.b206Kit === false);
      const ac = e.target.closest('[data-ac]')?.dataset.ac;
      if (ac) { game.selectAircraft(ac); this._markAircraft(); return; }
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

  _markAircraft() {
    for (const el of this.title.querySelectorAll('[data-ac]')) {
      const on = el.dataset.ac === this.game.aircraftId;
      el.classList.toggle('sel', on);
      el.setAttribute('aria-checked', String(on));
    }
    const S = this.game.settings;
    for (const el of this.title.querySelectorAll('[data-livery]')) el.classList.toggle('on', +el.dataset.livery === (S[el.dataset.lk ?? 'b206Livery'] ?? 0));
    for (const el of this.title.querySelectorAll('[data-kit]')) el.classList.toggle('on', S.b206Kit !== false);
  }

  showTitle(v) {
    this.title.classList.toggle('show', v);
    if (v) {
      this._markAircraft();
      const k = (a) => keyLabel(this.game.input.keysOf(a)[0]);
      const heli = this.game.aircraft?.kind === 'heli';
      this.title.querySelector('.title-keys').innerHTML = this.game.touch?.active
        ? (heli ? t('Touch: left stick is the cyclic, right slider the collective. Buttons for spray, camera and engine.') : t('Touch: left stick flies, right slider sets power. Buttons for spray, brakes, camera and engine.'))
        : heli
          ? t('{0}/{1}/{2}/{3} cyclic · {4}/{5} pedals · {6}/{7} collective · {8} spray · hold {9} engine · {10} camera · {11} map · Esc menu', k('pitchDown'), k('pitchUp'), k('rollLeft'), k('rollRight'), k('yawLeft'), k('yawRight'), k('throttleUp'), k('throttleDown'), k('spray'), k('engine'), k('camera'), k('map'))
          : t('{0}/{1} pitch · {2}/{3} roll · {4}/{5} rudder · {6}/{7} power · {8} brakes · {9} spray · hold {10} engine · {11} camera · {12} map · Esc menu', k('pitchDown'), k('pitchUp'), k('rollLeft'), k('rollRight'), k('yawLeft'), k('yawRight'), k('throttleUp'), k('throttleDown'), k('brakes'), k('spray'), k('engine'), k('camera'), k('map'));
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

  // Hangar office computer (secondary farms, messages, histories).
  office(tab) { showOffice(this, tab); }

  // --------------------------------------------------------------- contracts
  board() {
    const g = this.game;
    const card = (c) => {
      const job = g.career.jobs[c.id];
      const st = job ? job.stats() : null;
      const jb = job || g.career.job(c.id);
      const ha = jb.ha;
      const done = g.career.completed[c.id];
      const prog = st && st.coverage > 0.001 ? t('In progress · {0} covered', pct(st.coverage)) : done ? t('Completed {0} · can be flown again', done.stars ? '★'.repeat(done.stars) : '') : t('Not started');
      // Real terrain data of the talhões (from the height field the aircraft flies over).
      const T = fieldsTerrain(g.world.terrain, jb.fields);
      const dist = Math.hypot(T.cx - BASE.pad.x, T.cz - BASE.pad.z) / 1000;
      const terr = c.level > 1 ? `<span>${t('relief {0} m', Math.round(T.relief))}</span><span>${t('slope ≤ {0}°', Math.round(T.maxSlope))}</span>` : '';
      return `<div class="card ${g.job?.c.id === c.id ? 'sel' : ''}">
        <span class="tag lv${c.level}">${LEVELS[c.level].short} · ${c.difficulty}</span>
        <div class="name">${c.title}</div>
        <div class="desc">${c.brief}</div>
        <div class="meta"><span>${ha.toFixed(1)} ha</span><span>${GAME.currency} ${c.payPerHa}/ha</span><span>${t('bonus {0}', money(c.bonus))}</span><span>${dist.toFixed(1)} km</span>${terr}</div>
        <div class="prog">${prog}</div>
        <div class="btn-row" style="justify-content:flex-start">
          <button class="btn primary small" data-sel="${c.id}">${st && st.coverage > 0.001 ? t('Resume') : t('Accept')}</button>
          ${st && st.coverage > 0.001 ? `<button class="btn small" data-restart="${c.id}">${t('Restart')}</button>` : ''}
        </div>
      </div>`;
    };
    const cards = [1, 2, 3].map((lv) => `<h3 class="lvl">${LEVELS[lv].label} <span>${LEVELS[lv].blurb}</span></h3><div class="cards">${CONTRACTS.filter((c) => c.level === lv).map(card).join('')}</div>`).join('');
    const el = h(`<div class="panel"><h2>${t('Service orders')}</h2>
      <div class="sub">${t('Choose a job, set the load, and the badeco will service the aircraft on the pad.')}</div>
      ${cards}
      <div class="row2"><span class="money">${t('Balance {0}', money(g.career.money))}</span>
      <div class="btn-row"><button class="btn small" data-a="office">${t('Office computer · other farms')}</button>${g.job ? `<button class="btn small" data-a="abandon">${t('Hand in current job')}</button>` : ''}<button class="btn small" data-a="close">${t('Close')}</button></div></div></div>`);
    el.addEventListener('click', (e) => {
      const sel = e.target.closest('[data-sel]')?.dataset.sel;
      const rs = e.target.closest('[data-restart]')?.dataset.restart;
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (sel) g.selectContract(sel);
      else if (rs) { g.career.job(rs).reset(); g.career.save(); this.board(); }
      else if (a === 'close') this.close();
      else if (a === 'abandon') g.handIn();
      else if (a === 'office') this.office();
    });
    this._show('board', el);
  }

  // --------------------------------------------------------------- load sheet
  loadSheet(job) {
    const g = this.game;
    const ac = g.aircraft, fm = ac.fm, A = ac.A, T = ac.type;
    // Contract recommendations are written for the PR-AGW; a bigger aircraft
    // carries proportionally more per sortie.
    const kf = A.fuelCapacity / 260, kl = A.hopperCapacity / 900;
    const rec0 = job ? job.c.recommended : { fuel: A.fuelCapacity, liquid: 600 * kl };
    const rec = { fuel: Math.round((job ? rec0.fuel * kf : rec0.fuel) / 5) * 5, liquid: Math.round((job ? rec0.liquid * kl : rec0.liquid) / 10) * 10 };
    let fuel = Math.max(fm.fuel, Math.min(A.fuelCapacity, rec.fuel));
    let liquid = Math.max(fm.hopper, Math.min(A.hopperCapacity, rec.liquid));
    const st = job ? job.stats() : null;
    const el = h(`<div class="panel" style="width:min(620px,calc(100vw - 32px))"><h2>${t('Load sheet')}</h2>
      <div class="sub">${T.reg} · ${T.name}. ${job ? t('{0} — {1} covered. {2}', job.c.title, pct(st.coverage), job.c.tip) : t('Free flight — load as you like.')}</div>
      <div class="field"><label>${t('Fuel ({0})', T.fuel.name)}</label><input type="range" min="0" max="${A.fuelCapacity}" step="5" value="${fuel}" data-k="fuel"><span class="val vf"></span></div>
      <div class="field"><label>${t('Application liquid')}</label><input type="range" min="0" max="${A.hopperCapacity}" step="10" value="${liquid}" data-k="liquid"><span class="val vl"></span></div>
      <h3>${t('Weight &amp; performance')}</h3>
      <div class="stats">
        <div class="stat"><b class="m"></b><span>${t('Take-off mass · MTOW {0} kg', A.mtow.toLocaleString('en-US'))}</span></div>
        ${T.loadSheet.heli ? `<div class="stat"><b class="b"></b><span>${t('Hover power at 1 m (in ground effect)')}${g.settings.heliModel === 'rotor' ? t(' · {0} hp take-off', Math.round(A.engine.ratedKW / 0.7457)) : ''}</span></div>
        <div class="stat"><b class="r"></b><span>${t('Hover power out of ground effect')}</span></div>` : `<div class="stat"><b class="b"></b><span>${t('Max level bank at {0} kt', T.loadSheet.bankKt)}</span></div>
        <div class="stat"><b class="r"></b><span>${t('Est. ground roll')}</span></div>`}
        <div class="stat"><b class="c"></b><span>${t('Fuel cost')}</span></div>
        <div class="stat"><b class="e"></b><span>${t('Spray time at full flow')}</span></div>
      </div>
      <div class="note">${t('Fuel is billed to you. The client supplies the application liquid; whatever lands outside the talhão, drifts away or is over-applied counts as waste in the evaluation.')} ${T.loadSheet.heli ? t('A heavy tank needs more power for the hover and leaves less to climb or stop a descent: keep the mass under the MTOW, take off into the wind and transition to forward flight low over the pad.') : t('A heavy hopper means a longer take-off roll, slower climb, a higher stall speed and shallower turns: pull up before the balão, then bank.')}</div>
      <div class="row2"><span class="money">${t('Balance {0}', money(g.career.money))}</span><div class="btn-row">
        <button class="btn small" data-a="rec">${t('Recommended')}</button><button class="btn small" data-a="close">${t('Cancel')}</button><button class="btn primary" data-a="go">${t('Request service')}</button></div></div></div>`);
    const upd = () => {
      el.querySelector('.vf').textContent = `${Math.round(fuel)} L`;
      el.querySelector('.vl').textContent = `${Math.round(liquid)} L`;
      const mass = A.emptyMass + (A.agKitMass ?? 0) + A.pilotMass + fuel * A.fuelDensity + liquid * A.liquidDensity;
      const mEl = el.querySelector('.m');
      mEl.textContent = `${Math.round(mass)} kg${mass > A.mtow ? t(' · OVER') : ''}`;
      mEl.style.color = mass > A.mtow ? 'var(--bad)' : '';
      if (T.loadSheet.heli && g.settings.heliModel !== 'rotor') {
        // Power model: the lever power that hovers at this weight.
        for (const [sel, k] of [['.b', 1], ['.r', Infinity]]) {
          const p = Math.round(hoverPowerFrac(A, mass, k) * 100), e = el.querySelector(sel);
          e.textContent = `${t('{0} % power', p)}${p > 100 ? t(' · NO HOVER') : ''}`;
          e.style.color = p > 100 ? 'var(--bad)' : p > 92 ? 'var(--warn, #f0c020)' : '';
        }
      } else if (T.loadSheet.heli) {
        // Shaft power for the hover from the helicopter's own rotor model.
        const hp = (skid) => Math.round(hoverPower(A, mass, skid) / 745.7);
        const cap = A.engine.ratedKW / 0.7457;
        for (const [sel, k] of [['.b', 1], ['.r', Infinity]]) {
          const p = hp(k), e = el.querySelector(sel);
          e.textContent = `${p} hp${p > cap ? t(' · NO HOVER') : ''}`;
          e.style.color = p > cap ? 'var(--bad)' : p > cap * 0.95 ? 'var(--warn, #f0c020)' : '';
        }
      } else {
        // Load factor at the stall-protected angle of attack, sea level.
        const clProt = A.CL0 + A.CLa * (A.alphaStall - 0.025);
        const vb = T.loadSheet.bankKt / 1.943844;
        const n = (clProt * 0.6125 * vb ** 2 * A.wingArea) / (mass * 9.81);
        el.querySelector('.b').textContent = `${Math.round((Math.acos(1 / Math.max(1.01, n)) * 180) / Math.PI)}°`;
        // Empirical fit to the flight model's measured rolls for this aircraft.
        const [r0, m0, ex] = T.loadSheet.roll;
        const roll = r0 * Math.pow(mass / m0, ex);
        el.querySelector('.r').textContent = `${Math.round(roll / 10) * 10} m`;
      }
      el.querySelector('.c').textContent = money(Math.max(0, fuel - fm.fuel) * T.fuel.price);
      el.querySelector('.e').textContent = `${Math.round(liquid / T.spray.flow)} s`;
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
    const el = h(`<div class="panel"><h2>${r.done ? t('Job complete') : t('Job handed in')} — ${job.c.title}</h2>
      <div class="sub">${r.done ? t('The client inspected the talhão.') : t('Partial work is paid pro rata.')} <span class="stars">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</span></div>
      <div class="stats">
        <div class="stat"><b>${pct(r.coverage)}</b><span>${t('Useful coverage')}</span></div>
        <div class="stat"><b>${pct(r.uniformity)}</b><span>${t('Uniformity')}</span></div>
        <div class="stat"><b>${pct(r.gaps)}</b><span>${t('Gaps (falhas)')}</span></div>
        <div class="stat"><b>${pct(r.overlap)}</b><span>${t('Overlap')}</span></div>
        <div class="stat"><b>${pct(r.waste)}</b><span>${t('Waste')}</span></div>
        <div class="stat"><b>${Math.round(100 - r.damage)}%</b><span>${t('Aircraft condition')}</span></div>
        <div class="stat"><b>${mmss(job.flightTime)}</b><span>${job.sorties > 1 ? t('Flight time · {0} sorties', job.sorties) : t('Flight time · 1 sortie')}</span></div>
        <div class="stat"><b>${job.flightTime > 30 ? ((job.ha * Math.min(1, r.coverage)) / (job.flightTime / 3600)).toFixed(0) : '—'}</b><span>${t('Work rate (ha/h)')}</span></div>
      </div>
      <h3>${t('Liquid')}</h3>
      <table class="ledger">
        <tr><td>${t('Sprayed')}</td><td>${Math.round(r.sprayed)} L</td></tr>
        <tr><td>${t('Landed on the talhão')}</td><td>${Math.round(r.applied)} L</td></tr>
        <tr><td>${t('Off target (roads, creek, other fields)')}</td><td>${Math.round(r.offTarget)} L</td></tr>
        <tr><td>${t('Drift / evaporation')}</td><td>${Math.round(r.lost)} L</td></tr>
        <tr><td>${t('Over-application')}</td><td>${Math.round(r.overdose)} L</td></tr>
      </table>
      <h3>${t('Payment')}</h3>
      <table class="ledger">
        <tr><td>${t('Area rate ({0} ha × {1} {2}, by coverage)', job.ha.toFixed(1), GAME.currency, job.c.payPerHa)}</td><td>${money(r.base)}</td></tr>
        <tr><td>${t('Quality factor (uniformity, waste)')}</td><td>× ${(r.quality).toFixed(2)}</td></tr>
        <tr><td>${t('Completion bonus')}</td><td>${money(r.bonus)}</td></tr>
        <tr><td>${t('Repairs')}</td><td>− ${money(r.repair)}</td></tr>
        <tr class="total"><td>${t('Credited')}</td><td>${money(r.total)}</td></tr>
      </table>
      <div class="row2"><span class="money">${t('Balance {0}', money(g.career.money))}</span><div class="btn-row">
        ${g.lastRecord && g.replay.has(g.lastRecord.n) ? `<button class="btn" data-a="replay">▶ ${t('Watch the replay')}</button>` : ''}<button class="btn" data-a="fly">${t('Keep flying')}</button><button class="btn primary" data-a="board">${t('New service')}</button></div></div></div>`);
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'fly') this.close();
      if (a === 'board') this.board();
      if (a === 'replay') g.replay.play(g.lastRecord.n);
    });
    this._show('results', el);
    g.audio?.play('success');
  }

  // --------------------------------------------------------------- pause
  pause() {
    const g = this.game;
    const el = h(`<div class="panel" style="width:min(420px,calc(100vw - 32px))"><h2>${t('Paused')}</h2>
      <div class="sub">${g.job ? g.job.c.title : g.mode === 'free' ? t('Free flight') : ''}</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn primary" data-a="resume">${t('Resume')}</button>
        <button class="btn" data-a="board">${t('Service orders')}</button>
        <button class="btn" data-a="map">${t('Map')}</button>
        <button class="btn" data-a="settings">${t('Settings')}</button>
        <button class="btn" data-a="help">${t('Controls')}</button>
        <button class="btn" data-a="resetPad">${t('Reset aircraft to the pad')}</button>
        <button class="btn" data-a="resetRwy">${t('Reset aircraft on the strip')}</button>
        <button class="btn" data-a="title">${t('Main menu')}</button>
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
    const aidBtns = (key, items) => items.map(([k, l]) => `<button class="aid${s[key]?.[k] !== false ? ' on' : ''}" data-aid="${k}">${l}</button>`).join('');
    const keyRow = ([a, d]) => `<div class="kr"><span>${d.label}</span><button class="keybtn" data-bind="${a}">${g.input.bindings[a].map(keyLabel).join(' / ')}</button></div>`;
    const keyGroup = (scope) => Object.entries(ACTIONS).filter(([, d]) => d.scope === scope).map(keyRow).join('');
    // Registration marks, one row per aircraft: the national prefix and the
    // three letters (only the letters on the aircraft change).
    const regRow = (id) => {
      const T = AIRCRAFT_TYPES[id], [p, x] = T.reg.split('-');
      return `<div class="field reg" data-reg="${id}"><label>${T.label}</label><div class="regin"><div class="seg regp">${REG_PREFIXES.map((v) => `<button data-p="${v}" class="${v === p ? 'on' : ''}">${v}</button>`).join('')}</div><span class="regdash">-</span><input type="text" maxlength="3" value="${x}" spellcheck="false" autocomplete="off" aria-label="${t('Registration')}"><button class="btn small" data-regdef title="${t('Default')} ${T.reg0}">${T.reg0}</button></div><span class="val">${T.reg}</span></div>`;
    };
    const keys = keyGroup(undefined), numKeys = keyGroup('num'), classicKeys = keyGroup('classic');
    const el = h(`<div class="panel"><h2>${t('Settings')}</h2>
      <h3>${t('Graphics')}</h3>
      <div class="field"><label>${t('Quality')}</label>${seg('quality', [['low', t('Low')], ['medium', t('Medium')], ['high', t('High')]])}<span></span></div>
      <div class="field"><label>${t('Show FPS')}</label>${seg('showFps', [[false, t('Off')], [true, t('On')]])}<span></span></div>
      <div class="field"><label>${t('Cockpit shake')}</label>${seg('shake', [[0, t('Off')], [0.5, t('Low')], [1, t('Normal')]])}<span></span></div>
      <h3>${t('Environment')}</h3>
      <div class="field"><label>${t('Time of day')}</label>${seg('timeOfDay', [...TIME_ORDER.map((k) => [k, t(TIMES[k].label)]), ['flow', t('Passing')]])}<span></span></div>
      <div class="field"><label>${t('Weather')}</label>${seg('weather', [...WEATHER_ORDER.map((k) => [k, t(WEATHER[k].label)]), ['dynamic', t('Dynamic')]])}<span></span></div>
      <h3>${t('Flying')}</h3>
      <div class="field"><label>${t('Helicopter model')}</label>${seg('heliModel', [['power', t('Power (one lever)')], ['rotor', t('Detailed rotor')]])}<span></span></div>
      <div class="field"><label>${t('Wind')}</label>${seg('wind', [[0, t('Calm')], [1, t('Light')], [1.8, t('Moderate')]])}<span></span></div>
      <div class="field"><label>${t('Flight keys')}</label>${seg('keyScheme', [['numpad', t('Numpad + Q/E')], ['classic', 'W/S/A/D + Z/X']])}<span></span></div>
      <h3>${t('Assistance')} <span style="color:var(--ink-faint);letter-spacing:0;text-transform:none">${t('— the physics is the same with it on or off')}</span></h3>
      <div class="field"><label>${t('Airplane')}</label>${seg('assist', [['off', t('Off')], ['on', t('On')]])}<span></span></div>
      <div class="aids${s.assist === 'on' ? '' : ' off'}" data-aids="aidPlane">${aidBtns('aidPlane', [['pedal', t('Soft pedal on the ground')], ['smooth', t('Smoothed controls')], ['coord', t('Light turn coordination')], ['cues', t('Speed × weight warnings')]])}</div>
      <div class="field"><label>${t('Helicopter')}</label>${seg('heliAssist', [['off', t('Off')], ['on', t('On')]])}<span></span></div>
      <div class="aids${s.heliAssist === 'on' ? '' : ' off'}" data-aids="aidHeli">${aidBtns('aidHeli', [['torque', t('Torque compensation on the pedals')], ['sas', t('Light stabiliser (damper)')], ['smooth', t('Smoothed controls')], ['cues', t('Hover warnings')]])}</div>
      <div class="note">${t('Off: the controls move the control surfaces, cyclic and pedals directly. On: small helps that never limit an angle or fly for you — the pedal comes in gently on the ground and softens as the speed builds, the stick is finer near the centre (full at the stop), a little rudder against the slip, and warnings for the minimum speed at this weight and bank. Helicopter: the pedal the torque needs (detailed rotor model), a light damper on the rotation rates (it still drifts and still needs you) and drift / ground-effect warnings.')}</div>
      <h3>${t('Registrations')} <span style="color:var(--ink-faint);letter-spacing:0;text-transform:none">${t('— PP, PR, PS, PT or PU and three letters (not starting with Q)')}</span></h3>
      ${AIRCRAFT_ORDER.map(regRow).join('')}
      <h3>${t('Audio')}</h3>
      <div class="field"><label>${t('Volume')}</label><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-vol><span class="val">${Math.round(s.volume * 100)}%</span></div>
      <h3>${t('Keys')} <span style="color:var(--ink-faint);letter-spacing:0;text-transform:none">${t('— click a key, then press the new one (Esc cancels)')}</span></h3>
      <div class="keys">${keys}</div>
      <h3>${t('Flight keys — numpad scheme')} <span style="color:var(--ink-faint);letter-spacing:0;text-transform:none">${t('(default; Flying → Flight keys picks the scheme, all aircraft)')}</span></h3>
      <div class="keys">${numKeys}</div>
      <h3>${t('Flight keys — classic scheme')}</h3>
      <div class="keys">${classicKeys}</div>
      <div class="row2"><button class="btn small" data-a="resetKeys">${t('Reset keys')}</button><button class="btn small" data-a="resetSave">${t('Reset career')}</button><button class="btn primary small" data-a="close">${t('Done')}</button></div></div>`);
    // Applies a row's prefix + letters when they make valid, free marks.
    const applyReg = (row) => {
      const id = row.dataset.reg, inp = row.querySelector('input'), out = row.querySelector('.val');
      const p = row.querySelector('.regp button.on')?.dataset.p ?? 'PR';
      const want = normalizeReg(p + inp.value);
      if (inp.value.length < 3) { out.textContent = AIRCRAFT_TYPES[id].reg; out.classList.remove('bad'); return; }
      const r = want && !regTaken(id, want) ? g.setRegistration(id, want) : null;
      out.textContent = r ?? (want ? t('in use') : t('invalid'));
      out.classList.toggle('bad', !r);
    };
    const showReg = (row) => {
      const [p, x] = AIRCRAFT_TYPES[row.dataset.reg].reg.split('-');
      row.querySelectorAll('.regp button').forEach((x2) => x2.classList.toggle('on', x2.dataset.p === p));
      row.querySelector('input').value = x;
      const out = row.querySelector('.val'); out.textContent = `${p}-${x}`; out.classList.remove('bad');
    };
    el.addEventListener('click', (e) => {
      const rp = e.target.closest('.regp button');
      if (rp) {
        rp.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === rp));
        applyReg(rp.closest('[data-reg]'));
        return;
      }
      const ab = e.target.closest('[data-aid]');
      if (ab) {
        const key = ab.parentElement.dataset.aids;
        const v = { ...g.settings[key], [ab.dataset.aid]: !ab.classList.contains('on') };
        g.setSetting(key, v);
        ab.classList.toggle('on', v[ab.dataset.aid]);
        return;
      }
      const rd = e.target.closest('[data-regdef]');
      if (rd) { const row = rd.closest('[data-reg]'); g.setRegistration(row.dataset.reg, null); showReg(row); return; }
      const b = e.target.closest('.seg button');
      if (b) {
        const key = b.parentElement.dataset.key;
        let v = b.dataset.v;
        if (v === 'true' || v === 'false') v = v === 'true';
        else if (!Number.isNaN(+v) && (key === 'wind' || key === 'shake')) v = +v;
        g.setSetting(key, v);
        b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        const aids = el.querySelector(`[data-aids="${key === 'assist' ? 'aidPlane' : 'aidHeli'}"]`);
        if (aids && (key === 'assist' || key === 'heliAssist')) aids.classList.toggle('off', v !== 'on');
        return;
      }
      const kb = e.target.closest('[data-bind]');
      if (kb) {
        kb.classList.add('wait');
        kb.textContent = t('press a key…');
        g.input.rebind(kb.dataset.bind, () => { this.settings(); });
        return;
      }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'close') this.close();
      if (a === 'resetKeys') { g.input.resetBindings(); this.settings(); }
      if (a === 'resetSave') {
        // Two-step confirmation inside the page (no browser dialogs).
        const btn = e.target.closest('[data-a]');
        if (btn.dataset.armed) { g.career.resetAll(); g.job = null; g.setJob(null); this.settings(); g.toast(t('Career reset.')); }
        else { btn.dataset.armed = '1'; btn.textContent = t('Click again to reset'); }
      }
    });
    el.addEventListener('input', (e) => {
      const row = e.target.closest('[data-reg]');
      if (row) {
        // Letters only, upper case (no digits, accents or symbols in the marks).
        const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
        if (v !== e.target.value) e.target.value = v;
        applyReg(row);
        return;
      }
      if (e.target.dataset.vol !== undefined) {
        g.setSetting('volume', +e.target.value);
        e.target.nextElementSibling.textContent = `${Math.round(+e.target.value * 100)}%`;
      }
    });
    el.addEventListener('focusout', (e) => { const row = e.target.closest?.('[data-reg]'); if (row && e.target.tagName === 'INPUT') showReg(row); });
    this._show('settings', el);
  }

  help() {
    const g = this.game;
    // The helicopter relabels the shared actions (cyclic, pedals, collective).
    const L = g.aircraft?.type.controls?.labels ?? {};
    const rows = Object.entries(ACTIONS).filter(([a, d]) => d.scope !== 'num' && L[a] !== null).map(([a, d]) => `<div><span>${L[a] ?? d.label}</span><b>${g.input.keysOf(a).map(keyLabel).join(' / ')}</b></div>`).join('');
    const kk = (a) => keyLabel(g.input.keysOf(a)[0]);
    // The scheme not in use, for the notes.
    const other = g.settings.keyScheme === 'classic' ? 'numpad' : 'classic';
    const ko = (a) => keyLabel(g.input.bindings[KEY_SCHEMES[other][a] ?? a][0]);
    const el = h(`<div class="panel"><h2>${t('Controls')}</h2>
      <div class="sub">${t('Flight keys: {0} / {1} stick forward / back, {2} / {3} roll, {4} / {5} rudder, {6} engine — Settings → Flying → Flight keys switches to {7} ({8} / {9} / {10} / {11}, {12} / {13}, {14}). Mouse: left-drag looks around, right-drag is a virtual stick, wheel zooms the camera. Gamepad: left stick flies, triggers set power, bumpers rudder, A spray, B brakes.', kk('pitchDown'), kk('pitchUp'), kk('rollLeft'), kk('rollRight'), kk('yawLeft'), kk('yawRight'), kk('engine'), other === 'classic' ? t('the Tidemark layout') : t('the numpad layout'), ko('pitchDown'), ko('pitchUp'), ko('rollLeft'), ko('rollRight'), ko('yawLeft'), ko('yawRight'), ko('engine'))}</div>
      <div class="helpgrid">${rows}<div><span>${t('Speed up ground service')}</span><b>${t('T (hold)')}</b></div></div>
      ${g.aircraft?.kind === 'heli' ? `<h3>Robinson R44</h3>
      <div class="note" style="color:var(--ink-dim)">${g.settings.heliModel !== 'rotor' ? `${t('{0} / {1} / {2} / {3} move the cyclic forward / aft / left / right and {4} / {5} the pedals. The helicopter does not level itself: a tilt you start goes on growing until you take it out with the opposite key, so fly it with small, short inputs. The more it tilts, the faster it goes (about 10° for 40–60 kt, 20° for 100 kt); a steep tilt takes lift away, so add power or it sinks. {6}/{7} (or Shift / Ctrl, the triggers) set the <b>power</b> — the one control for up and down: rotor and torque act as one, so the power never swings the nose. The power that hovers is shown next to the POWER readout (about 50–55 % light, 65–70 % with a full tank, less close to the ground); more power climbs, less sinks, and the CLIMB readout shows by how much. Start with the power at zero (hold {8}): the rotor comes up to speed in about 6 s — then raise the power until the skids leave the ground, settle it at the hover figure and ease the cyclic forward. To land, hover low over the spot and take the power a few percent below the hover figure. Settings → Assistance → Helicopter <b>on</b> adds a light damper on the rotation rates, a finer cyclic near the centre and drift warnings — it never levels or flies the helicopter for you. Settings → Helicopter model → <b>Detailed rotor</b> gives the full rotor simulation (governor, rotor droop, torque, autorotation). Spray at 2.5–4.5 m over the crop at 40–60 kt; land on the H pad, shut down and wait for the rotor to stop before the crew comes in.', kk('pitchDown'), kk('pitchUp'), kk('rollLeft'), kk('rollRight'), kk('yawLeft'), kk('yawRight'), keyLabel(g.input.bindings.throttleUp[0]), keyLabel(g.input.bindings.throttleDown[0]), kk('engine'))}</div>` : `${t('{0} / {1} / {2} / {3} tilt the cyclic forward / aft / left / right, {4} / {5} are the anti-torque pedals, {6}/{7} (or Shift / Ctrl, the triggers) raise and lower the collective; the governor holds the rotor at 101–102 %. Start with the collective full down (hold {8}): the clutch engages and the rotor spins up — wait for the green before lifting. Pull the collective slowly to a hover at about 1 m, then ease the cyclic forward; the aircraft shudders through translational lift. Settings → Assistance → Helicopter <b>on</b> puts the pedal and cyclic the torque needs under the centred keys, adds a light damper on the rotation rates and drift warnings — it never levels or flies the helicopter for you. Watch LOW RPM (horn): lower the collective. Spray at 2.5–4.5 m over the crop at 40–60 kt; land on the H pad, shut down and wait for the rotor to stop before the crew comes in.', kk('pitchDown'), kk('pitchUp'), kk('rollLeft'), kk('rollRight'), kk('yawLeft'), kk('yawRight'), keyLabel(g.input.bindings.throttleUp[0]), keyLabel(g.input.bindings.throttleDown[0]), kk('engine'))}</div>`}` : ''}
      <h3>${t('Agricultural flying')}</h3>
      <div class="note" style="color:var(--ink-dim)">${t('Work at 2.5–4.5 m over the crop canopy (the HGT readout turns green), around 85–105 kt. Too low narrows the swath and risks a crop strike; too high widens it but liquid drifts and evaporates. Fly along the yellow pass line — the lightbar on the glareshield shows which way to steer. Switch the spray off at the field edge and over gaps. Land back on the strip, taxi to the pad and tap {0} to shut down: the badeco reloads and your coverage is kept.', kk('engine'))}</div>
      <div class="row2"><span></span><button class="btn primary small" data-a="close">${t('Close')}</button></div></div>`);
    el.addEventListener('click', (e) => { if (e.target.closest('[data-a]')) this.close(); });
    this._show('help', el);
  }

  map() {
    const g = this.game;
    const el = h(`<div class="mapwrap"><canvas width="1400" height="1400"></canvas><div class="maphint">${t('Mouse wheel: zoom · drag: move · click: close')}</div>
      <div class="legend"><div><i style="background:#3f8f2c"></i>${t('Soy')}</div><div><i style="background:#2f7224"></i>${t('Corn')}</div><div><i style="background:#5f8f4a"></i>${t('Cotton')}</div><div><i style="background:#9a3a1c"></i>${t('Roads / fallow')}</div><div><i style="background:#1f3a18"></i>${t('Forest')}</div><div><i style="background:#c83228"></i>${t('Not covered')}</div><div><i style="background:#46c85a"></i>${t('Covered')}</div><div><i style="background:#9650dc"></i>${t('Overlap')}</div><div><i style="background:#ffe14a"></i>${t('Next pass')}</div></div></div>`);
    const c = el.querySelector('canvas');
    // Framed automatically until the wheel or a drag takes over.
    const view = { cx: 0, cz: 0, range: 1900, manual: false };
    mapControls(c, view, { onClick: () => this.close() });
    const draw = () => {
      if (this.open !== 'map') return;
      if (view.manual) {
        drawMap(c.getContext('2d'), c.width, c.height, g.hud.base, g, { cx: view.cx, cz: view.cz, range: view.range, labelPx: 30 });
        requestAnimationFrame(draw);
        return;
      }
      const ac = g.aircraft.fm.pos;
      const job = g.job;
      // Frame the aircraft with the job's talhões (or with the base): the
      // farms of the outer ring are up to 7 km away.
      let x0 = Math.min(ac.x, 0), x1 = Math.max(ac.x, 800), z0 = Math.min(ac.z, -400), z1 = Math.max(ac.z, 400), minR = 1900;
      if (job) {
        const f = job.fields;
        x0 = Math.min(ac.x, ...f.map((q) => q.x0)); x1 = Math.max(ac.x, ...f.map((q) => q.x1));
        z0 = Math.min(ac.z, ...f.map((q) => q.z0)); z1 = Math.max(ac.z, ...f.map((q) => q.z1));
        minR = 1200;
      }
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const range = Math.min(6000, Math.max(minR, Math.max(x1 - x0, z1 - z0) / 2 + 500));
      Object.assign(view, { cx, cz, range });
      drawMap(c.getContext('2d'), c.width, c.height, g.hud.base, g, { cx, cz, range, labelPx: 30 });
      requestAnimationFrame(draw);
    };
    this._show('map', el);
    el.addEventListener('click', (e) => { if (e.target !== c) this.close(); });
    requestAnimationFrame(draw);
  }

  crash(reason, cost) {
    const g = this.game;
    const el = h(`<div class="panel" style="width:min(480px,calc(100vw - 32px))"><h2>${reason}</h2>
      <div class="sub">${t('The aircraft is down. You walked away from it.')}${cost ? ` ${t('Recovery and repairs: <b>{0}</b>.', money(cost))}` : ''} ${t('It comes back repaired, as new: to the runway with the load it had, to the base with the hopper empty for the badeco to load again. Job coverage is kept.')}</div>
      <div class="row2"><span class="money">${t('Balance {0}', money(g.career.money))}</span>
        <span style="display:flex;gap:8px;flex-wrap:wrap">${g.aircraft.kind === 'heli' ? '' : `<button class="btn" data-a="runway">${t('Back to the runway')}</button>`}<button class="btn primary" data-a="pad">${t('Back to the base')}</button></span></div></div>`);
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) g.recover(b.dataset.a === 'runway' ? 'runway' : 'pad'); });
    this._show('crash', el);
  }
}

export { money, pct };
