// Hangar office computer (main base): the desktop where the neighbouring
// farms' requests arrive. Inbox (farmers' messages), requests (accept a
// secondary contract when its conditions allow), map of the farms, aircraft
// choice, and the two operation histories kept apart (main farm / secondary
// farms) with their replays.
import { h } from './hud.js';
import { drawMap } from './maps.js';
import { FARM_CONTRACTS, FARM_INFO, contractWindow, windowLabel } from '../game/farmContracts.js';
import { CONTRACTS, contractById } from '../game/contracts.js';
import { FARMS, siteById, MAIN_SITE } from '../world/layout.js';
import { TIMES, WEATHER } from '../world/atmosphere.js';
import { AIRCRAFT_TYPES, AIRCRAFT_ORDER } from '../aircraft/types.js';
import { GAME } from '../config.js';
import { t } from '../i18n/index.js';

const money = (v) => `${GAME.currency} ${Math.round(v).toLocaleString('en-US')}`;
const pct = (v) => `${Math.round(v * 100)}%`;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const farmName = (id) => (id === 'main' ? 'Fazenda Boa Esperança' : FARMS.find((f) => f.id === id)?.name ?? id);
const farmColor = (id) => FARMS.find((f) => f.id === id)?.color ?? '#e9ecef';

export function showOffice(screens, tab = 'inbox') {
  const g = screens.game;
  const atBase = g.atMainBase();
  const env = g.envNow();
  const unread = FARM_CONTRACTS.filter((c) => !g.career.read[c.id]).length;
  const tabs = [
    ['inbox', t('Messages') + (unread ? ` <b class="badge">${unread}</b>` : '')],
    ['requests', t('Requests')], ['map', t('Farm map')], ['aircraft', t('Aircraft')], ['history', t('History')],
  ];
  const clock = `${t(TIMES[env.time]?.label ?? '')} · ${t(WEATHER[env.weather]?.label ?? '')}`;
  let body = '';
  if (tab === 'inbox') body = inbox(g);
  else if (tab === 'requests') body = requests(g, env, atBase);
  else if (tab === 'map') body = `<div class="os-map"><canvas width="900" height="900"></canvas><div class="os-farms">${FARMS.map((f) => {
    const s = siteById(f.id), km = Math.hypot(s.pad.x - MAIN_SITE.pad.x, s.pad.z - MAIN_SITE.pad.z) / 1000;
    const brg = Math.round(((Math.atan2(s.pad.x - MAIN_SITE.pad.x, -(s.pad.z - MAIN_SITE.pad.z)) * 180) / Math.PI + 360) % 360);
    return `<div class="os-farm"><i style="background:${f.color}"></i><b>${f.name}</b><span>${km.toFixed(1)} km · ${t('heading {0}°', String(brg).padStart(3, '0'))} · ${t('level {0}', f.difficulty)}</span><span>${FARM_INFO[f.id].blurb}</span><span>${t('Strip')}: ${FARM_INFO[f.id].strip}</span><span>${t('Weather')}: ${FARM_INFO[f.id].weather}</span></div>`;
  }).join('')}</div></div>`;
  else if (tab === 'aircraft') body = aircraftTab(g, atBase);
  else body = historyTab(g);
  const el = h(`<div class="office"><div class="os-bezel"><div class="os-screen">
    <div class="os-bar"><span class="os-logo">AGRO<b>NET</b></span><span class="os-where">${t('Hangar office · Fazenda Boa Esperança')}</span><span class="os-clock">${clock}</span><span class="os-money">${money(g.career.money)}</span><button class="os-x" data-a="close">✕</button></div>
    <div class="os-tabs">${tabs.map(([k, l]) => `<button class="os-tab ${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
    ${atBase ? '' : `<div class="os-note">${t('Remote access: requests can be accepted and aircraft changed only on the ground at the main base.')}</div>`}
    <div class="os-body">${body}</div>
  </div></div><div class="os-stand"></div></div>`);
  el.addEventListener('click', (e) => {
    const d = e.target.closest('[data-tab],[data-a],[data-msg],[data-accept],[data-ac],[data-replay]')?.dataset;
    if (!d) return;
    if (d.tab) return showOffice(screens, d.tab);
    if (d.a === 'close') return screens.close();
    if (d.msg) { g.career.read[d.msg] = true; g.career.save(); screens._officeMsg = d.msg; return showOffice(screens, 'inbox'); }
    if (d.accept) { g.career.read[d.accept] = true; return g.selectContract(d.accept); }
    if (d.ac) { g.selectAircraft(d.ac); return showOffice(screens, 'aircraft'); }
    if (d.replay) return g.replay?.play(d.replay);
  });
  screens._show('office', el);
  if (tab === 'map') {
    const c = el.querySelector('canvas');
    drawMap(c.getContext('2d'), c.width, c.height, g.hud.base, g, { cx: 0, cz: 1250, range: 3700, labelPx: 30 });
  }
}

function inbox(g) {
  const sel = g.screens._officeMsg ?? FARM_CONTRACTS[0].id;
  const c = contractById(sel);
  const list = FARM_CONTRACTS.map((m) => `<button class="os-msg ${m.id === sel ? 'on' : ''} ${g.career.read[m.id] ? '' : 'new'}" data-msg="${m.id}">
    <i style="background:${farmColor(m.farm)}"></i><b>${m.from}</b><span>${farmName(m.farm)}</span><span class="subj">${m.title}</span></button>`).join('');
  const done = g.career.completed[c.id];
  return `<div class="os-inbox"><div class="os-list">${list}</div><div class="os-read">
    <div class="os-head"><b>${c.from}</b> · ${farmName(c.farm)}</div><div class="os-subj">${c.title}</div>
    <p>${c.message}</p>
    <div class="os-meta">${t('Conditions')}: ${windowLabel(c) || t('none')}${done ? ` · ${t('flown before')} ${'★'.repeat(done.stars)}` : ''}</div>
    <button class="btn small" data-tab="requests">${t('Open the request')}</button></div></div>`;
}

function requests(g, env, atBase) {
  const card = (c) => {
    const job = g.career.jobs[c.id] ?? g.career.job(c.id);
    const st = job.stats();
    const w = contractWindow(c, env.time, env.weather);
    const site = siteById(c.farm), f = site.farm;
    const km = Math.hypot(site.pad.x - MAIN_SITE.pad.x, site.pad.z - MAIN_SITE.pad.z) / 1000;
    const active = g.job?.c.id === c.id;
    const done = g.career.completed[c.id];
    const prog = active ? t('Accepted — in progress · {0} covered', pct(st.coverage)) : st.coverage > 0.001 ? t('In progress · {0} covered', pct(st.coverage)) : done ? t('Completed {0}', '★'.repeat(done.stars)) : t('Not started');
    const can = atBase && w.ok && !active;
    return `<div class="os-req ${active ? 'sel' : ''}">
      <div class="os-req-top"><i style="background:${f.color}"></i><b>${f.name}</b><span>${km.toFixed(1)} km · L${c.level} · ${c.difficulty}</span></div>
      <div class="name">${c.title}</div><div class="desc">${c.brief}</div>
      <div class="meta"><span>${job.ha.toFixed(1)} ha</span><span>${GAME.currency} ${c.payPerHa}/ha</span><span>${t('bonus {0}', money(c.bonus))}</span><span>${t('Strip')}: ${FARM_INFO[c.farm].strip}</span></div>
      <div class="os-cond ${w.ok ? 'ok' : 'no'}">${w.ok ? t('Can be flown now') : w.reason} · ${windowLabel(c)}</div>
      <div class="prog">${prog}</div>
      <button class="btn primary small" data-accept="${c.id}" ${can ? '' : 'disabled'}>${active ? t('Accepted') : t('Accept')}</button>
    </div>`;
  };
  return `<div class="os-reqs">${FARM_CONTRACTS.map(card).join('')}</div>`;
}

function aircraftTab(g, atBase) {
  return `<div class="os-acs">${AIRCRAFT_ORDER.map((id) => {
    const T = AIRCRAFT_TYPES[id], ac = g.fleet[id];
    const cur = g.aircraftId === id;
    return `<div class="os-ac ${cur ? 'sel' : ''}"><b>${T.reg}</b><span>${T.name}</span>
      <span>${t('Fuel')} ${Math.round(ac.fm.fuel)} / ${ac.A.fuelCapacity} L · ${t('Hopper')} ${Math.round(ac.fm.hopper)} / ${ac.A.hopperCapacity} L</span>
      <span>${t('Condition')} ${Math.round(100 - ac.damage)}%</span>
      <button class="btn small ${cur ? '' : 'primary'}" data-ac="${id}" ${cur || !atBase ? 'disabled' : ''}>${cur ? t('In use') : t('Select')}</button></div>`;
  }).join('')}</div>`;
}

function historyTab(g) {
  const row = (e) => {
    const c = contractById(e.id);
    const d = new Date(e.t);
    const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const has = g.replay?.has(e.n);
    return `<tr><td>#${e.n ?? '-'}</td><td>${date}</td><td>${c?.title ?? e.id}</td><td>${farmName(e.farm ?? 'main')}</td><td>${e.ac ?? '—'}</td>
      <td>${pct(e.coverage)}</td><td>${e.uniformity !== undefined ? pct(e.uniformity) : '—'}</td><td>${e.flight !== undefined ? mmss(e.flight) : '—'}</td>
      <td>${e.stars ? '★'.repeat(e.stars) : '—'}</td><td>${money(e.total)}</td>
      <td>${has ? `<button class="btn small" data-replay="${e.n}">▶ ${t('Replay')}</button>` : ''}</td></tr>`;
  };
  const table = (list, empty) => (list.length
    ? `<table class="ledger os-hist"><tr><th>#</th><th>${t('Date')}</th><th>${t('Job')}</th><th>${t('Farm')}</th><th>${t('Aircraft')}</th><th>${t('Coverage')}</th><th>${t('Uniformity')}</th><th>${t('Flight')}</th><th>${t('Result')}</th><th>${t('Credited')}</th><th></th></tr>${list.slice().reverse().map(row).join('')}</table>`
    : `<div class="os-empty">${empty}</div>`);
  void CONTRACTS;
  return `<h3>${t('Main farm operations')}</h3>${table(g.career.history, t('No main-farm operation recorded yet.'))}
    <h3>${t('Secondary farm operations')}</h3>${table(g.career.history2, t('No secondary-farm operation recorded yet.'))}`;
}
