// Hangar office computer (main base) — and the farm office of every strip,
// so the next request can be taken where the last one ended, with no flight
// back to the base: inbox (farmers' messages), requests (accept a secondary
// contract when its conditions allow and the strip takes the aircraft), map
// of the farms, aircraft choice (main base only), and the two operation
// histories kept apart (main farm / secondary farms) with their replays.
import { h } from './hud.js';
import { drawMap } from './maps.js';
import { FARM_CONTRACTS, FARM_INFO, contractWindow, windowLabel, contractStars } from '../game/farmContracts.js';
import { CONTRACTS, contractById } from '../game/contracts.js';
import { FARMS, siteById, MAIN_SITE, stripAllows, CROPS } from '../world/layout.js';
import { TIMES, WEATHER } from '../world/atmosphere.js';
import { AIRCRAFT_TYPES, AIRCRAFT_ORDER } from '../aircraft/types.js';
import { GAME } from '../config.js';
import { t } from '../i18n/index.js';

const money = (v) => `${GAME.currency} ${Math.round(v).toLocaleString('en-US')}`;
const pct = (v) => `${Math.round(v * 100)}%`;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const farmName = (id) => (id === 'main' ? 'Fazenda Boa Esperança' : FARMS.find((f) => f.id === id)?.name ?? id);
const farmColor = (id) => FARMS.find((f) => f.id === id)?.color ?? '#e9ecef';

const stars = (n) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));
// Compass point of a bearing (deg), for "north-west of the base".
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const point = (brg) => t(POINTS[Math.round(brg / 45) % 8]);
const bearing = (dx, dz) => ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
// Aircraft the strip takes, or every one; short names.
const fleetFor = (f) => AIRCRAFT_ORDER.filter((id) => stripAllows(f, id));
const AC_SHORT = { ipanema: 'Ipanema', at502: 'AT-502B', m18: 'M-18B Dromader', r44: 'R44' };
const acName = (id) => AC_SHORT[id] ?? AIRCRAFT_TYPES[id].name;

export function showOffice(screens, tab = 'inbox') {
  const g = screens.game;
  const office = g.officeSite(); // site whose office the aircraft stands at, or null
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
  else if (tab === 'requests') body = requests(g, env, office);
  else if (tab === 'map') body = `<div class="os-map"><canvas width="900" height="900"></canvas><div class="os-farms">${FARMS.slice().sort((a, b) => a.difficulty - b.difficulty).map((f) => {
    const s = siteById(f.id), km = Math.hypot(s.pad.x - MAIN_SITE.pad.x, s.pad.z - MAIN_SITE.pad.z) / 1000;
    const brg = bearing(s.pad.x - MAIN_SITE.pad.x, s.pad.z - MAIN_SITE.pad.z);
    return `<div class="os-farm"><i style="background:${f.color}"></i><b>${f.name}</b><span>${km.toFixed(1)} km ${point(brg)} · ${t('heading {0}°', String(Math.round(brg)).padStart(3, '0'))} · <span class="os-stars" title="${t('difficulty {0}/5', f.difficulty)}">${stars(f.difficulty)}</span></span><span>${FARM_INFO[f.id].blurb}</span><span>${t('Strip')}: ${FARM_INFO[f.id].strip}</span><span>${t('Aircraft')}: ${fleetFor(f).map(acName).join(', ')}</span><span>${t('Weather')}: ${FARM_INFO[f.id].weather}</span></div>`;
  }).join('')}</div></div>`;
  else if (tab === 'aircraft') body = aircraftTab(g, atBase);
  else body = historyTab(g);
  const where = office && !office.main ? t('Farm office · {0}', office.farm.name) : t('Hangar office · Fazenda Boa Esperança');
  const note = !office ? t('Remote access: requests can be accepted on the ground at any farm office (main base or a farm strip); aircraft are changed at the main base.')
    : !atBase && tab === 'aircraft' ? t('Aircraft are changed only at the main base.') : '';
  const el = h(`<div class="office"><div class="os-bezel"><div class="os-screen">
    <div class="os-bar"><span class="os-logo">AGRO<b>NET</b></span><span class="os-where">${where}</span><span class="os-clock">${clock}</span><span class="os-money">${money(g.career.money)}</span><button class="os-x" data-a="close">✕</button></div>
    <div class="os-tabs">${tabs.map(([k, l]) => `<button class="os-tab ${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
    ${note ? `<div class="os-note">${note}</div>` : ''}
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
    drawMap(c.getContext('2d'), c.width, c.height, g.hud.base, g, { cx: 0, cz: 0, range: 6000, labelPx: 26 });
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

function requests(g, env, office) {
  const p = g.aircraft.fm.pos;
  const card = (c) => {
    const job = g.career.jobs[c.id] ?? g.career.job(c.id);
    const st = job.stats();
    const w = contractWindow(c, env.time, env.weather);
    const site = siteById(c.farm), f = site.farm;
    const km = Math.hypot(site.pad.x - MAIN_SITE.pad.x, site.pad.z - MAIN_SITE.pad.z) / 1000;
    const here = Math.hypot(site.pad.x - p.x, site.pad.z - p.z) / 1000;
    const brg = bearing(site.pad.x - MAIN_SITE.pad.x, site.pad.z - MAIN_SITE.pad.z);
    const active = g.job?.c.id === c.id;
    const done = g.career.completed[c.id];
    const prog = active ? t('Accepted — in progress · {0} covered', pct(st.coverage)) : st.coverage > 0.001 ? t('In progress · {0} covered', pct(st.coverage)) : done ? t('Completed {0}', '★'.repeat(done.stars)) : t('Not started');
    const fits = stripAllows(f, g.aircraftId);
    const can = !!office && w.ok && !active && fits;
    const n = contractStars(c);
    const crops = [...new Set(job.fields.map((fl) => t(CROPS[fl.crop].label)))].join(', ');
    // Expected credit: full coverage, half of the quality bonus.
    const reward = c.payPerHa * job.ha + c.bonus * 0.5;
    return `<div class="os-req ${active ? 'sel' : ''} ${fits ? '' : 'nofit'}">
      <div class="os-req-top"><i style="background:${f.color}"></i><b>${f.name}</b><span class="os-stars" title="${t('difficulty {0}/5', n)}">${stars(n)}</span></div>
      <div class="os-loc">${c.from} · ${t('{0} km {1} of the base', km.toFixed(1), point(brg))} · ${t('{0} km from you', here.toFixed(1))}</div>
      <div class="name">${c.title}</div><div class="desc">${c.brief}</div>
      <div class="meta"><span>${crops}</span><span>${job.ha.toFixed(1)} ha</span><span>${t('terrain L{0}', c.level)} · ${c.difficulty}</span><span>${GAME.currency} ${c.payPerHa}/ha</span><span>${t('bonus {0}', money(c.bonus))}</span><span><b>${t('≈ {0}', money(reward))}</b></span></div>
      <div class="meta"><span>${t('Strip')}: ${FARM_INFO[c.farm].strip}</span></div>
      <div class="meta"><span>${t('Aircraft')}: ${fleetFor(f).map(acName).join(', ')}</span></div>
      ${fits ? '' : `<div class="os-cond no">${t('The strip does not take the {0} — change aircraft at the main base.', acName(g.aircraftId))}</div>`}
      <div class="os-cond ${w.ok ? 'ok' : 'no'}">${w.ok ? t('Can be flown now') : w.reason} · ${windowLabel(c)}</div>
      <div class="prog">${prog}</div>
      <button class="btn primary small" data-accept="${c.id}" ${can ? '' : 'disabled'}>${active ? t('Accepted') : t('Accept')}</button>
    </div>`;
  };
  // Grouped by farm: the farm whose office this is first, then easiest first.
  const here = office && !office.main ? office.id : null;
  const farms = FARMS.slice().sort((a, b) => (b.id === here) - (a.id === here) || a.difficulty - b.difficulty);
  return farms.map((f) => {
    const list = FARM_CONTRACTS.filter((c) => c.farm === f.id);
    if (!list.length) return '';
    return `<h3 class="os-farmh"><i style="background:${f.color}"></i>${f.name} <span class="os-stars">${stars(f.difficulty)}</span></h3><div class="os-reqs">${list.map(card).join('')}</div>`;
  }).join('');
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
