import { GameState } from '../gameplay/GameState';
import { MISSIONS, ITEMS } from '../data/missions';
import { NPCS } from '../data/npcs';
import { SECRETS } from '../data/docs';
import { el, esc } from './UI';

type Tab = 'missions' | 'residents' | 'discoveries' | 'items';

/** Builds the journal card: missions, residents met, discoveries and carried items. */
export function buildJournal(card: HTMLElement, state: GameState, onTrack: (id: string) => void, start: Tab = 'missions'): void {
  card.classList.add('journal');
  const header = el('header', '', `<div class="kicker">Messenger’s Journal</div><h3>The Living Chain</h3>`);
  const tabs = el('div', 'tabs');
  const body = el('div', 'body');
  header.appendChild(tabs);
  card.append(header, body);
  const labels: [Tab, string][] = [['missions', 'Missions'], ['residents', 'Residents'], ['discoveries', 'Discoveries'], ['items', 'Bag']];
  const show = (t: Tab) => {
    [...tabs.children].forEach((c) => c.classList.toggle('on', (c as HTMLElement).dataset.tab === t));
    body.innerHTML = '';
    if (t === 'missions') renderMissions(body, state, (id) => {
      onTrack(id);
      show('missions');
    });
    if (t === 'residents') renderResidents(body, state);
    if (t === 'discoveries') renderDiscoveries(body, state);
    if (t === 'items') renderItems(body, state);
  };
  for (const [t, l] of labels) {
    const b = el('button', 'tab', l);
    b.dataset.tab = t;
    b.onclick = () => show(t);
    tabs.appendChild(b);
  }
  show(start);
}

function renderMissions(body: HTMLElement, s: GameState, onTrack: (id: string) => void): void {
  const active = MISSIONS.filter((m) => s.status(m.id) === 'active');
  const avail = MISSIONS.filter((m) => s.status(m.id) === 'available');
  const done = MISSIONS.filter((m) => s.status(m.id) === 'done');
  const total = MISSIONS.length;
  body.appendChild(el('p', 'empty-note', `${done.length} of ${total} missions complete.`));
  for (const m of active) {
    const p = s.progress(m.id);
    const card = el('div', `mission${s.data.tracked === m.id ? ' tracked' : ''}`);
    const row = el('div', 'row', `<div><div class="num">MISSION ${String(m.number).padStart(2, '0')}</div><h4>${esc(m.title)}</h4></div>`);
    const tb = el('button', `track${s.data.tracked === m.id ? ' on' : ''}`, s.data.tracked === m.id ? 'Tracking' : 'Track');
    tb.onclick = () => onTrack(m.id);
    row.appendChild(tb);
    card.appendChild(row);
    card.appendChild(el('p', '', esc(m.summary)));
    const ul = el('ul');
    m.objectives.forEach((o, i) => {
      if (i > p.objective) return;
      let text = o.text;
      if (o.type === 'collect') text += ` (${Math.min(o.count ?? 1, s.countCollected(o.target))}/${o.count})`;
      ul.appendChild(el('li', i < p.objective ? 'ok' : 'now', esc(text) + (i === p.objective && o.hint ? `<br/><small style="color:var(--ink-soft)">${esc(o.hint)}</small>` : '')));
    });
    card.appendChild(ul);
    body.appendChild(card);
  }
  if (avail.length) {
    body.appendChild(el('h4', '', 'Residents who need you'));
    for (const m of avail) {
      const giver = NPCS.find((n) => n.id === m.giver)!;
      body.appendChild(el('div', 'mission', `<div class="num">MISSION ${String(m.number).padStart(2, '0')}</div><h4>${esc(m.title)}</h4><p>Talk to <b>${esc(giver.name)}</b> (${esc(giver.title)}) — look for the <b style="color:var(--amber-deep)">!</b> above their head.</p>`));
    }
  }
  if (done.length) {
    body.appendChild(el('h4', '', 'Completed'));
    for (const m of done) body.appendChild(el('div', 'mission done', `<div class="num">MISSION ${String(m.number).padStart(2, '0')} · COMPLETE</div><h4>${esc(m.title)}</h4><p>${esc(m.completeText)}</p>`));
  }
  if (!active.length && !avail.length && !done.length) body.appendChild(el('p', 'empty-note', 'No missions yet. Find NODE at the Relay Office.'));
}

function renderResidents(body: HTMLElement, s: GameState): void {
  const met = NPCS.filter((n) => (s.data.talked[n.id] ?? 0) > 0);
  body.appendChild(el('p', 'empty-note', `You have met ${met.length} of ${NPCS.length} residents.`));
  const g = el('div', 'grid2');
  for (const n of NPCS) {
    const known = (s.data.talked[n.id] ?? 0) > 0;
    const rel = n.relationships.map((r) => `${NPCS.find((x) => x.id === r.id)?.name}: ${r.note}`).join(' ');
    g.appendChild(el('div', `resident${known ? '' : ' unknown'}`, known
      ? `<b>${esc(n.name)}</b><small>${esc(n.title)}</small><p>${esc(n.bio)}</p><p><i>${esc(n.concern)}</i></p><p>${esc(rel)}</p>`
      : `<b>???</b><small>${esc(n.title)}</small><p>Somewhere in ${esc(regionName(n.region))}.</p>`));
  }
  body.appendChild(g);
}

function renderDiscoveries(body: HTMLElement, s: GameState): void {
  const ids = Object.keys(SECRETS);
  const found = ids.filter((i) => s.data.secrets.includes(i));
  body.appendChild(el('p', 'empty-note', `${found.length} of ${ids.length} discoveries found. Secrets reward curiosity — look behind, beneath and above.`));
  const g = el('div', 'grid2');
  for (const id of ids) {
    const ok = found.includes(id);
    g.appendChild(el('div', `secret-item${ok ? ' found' : ''}`, `<i>${ok ? '★' : '?'}</i><div><b>${ok ? esc(SECRETS[id].title) : 'Undiscovered'}</b></div>`));
  }
  body.appendChild(g);
  const frags = s.countCollected('frag.');
  body.appendChild(el('p', 'empty-note', `Historical blocks recovered: ${frags} / 5`));
}

function renderItems(body: HTMLElement, s: GameState): void {
  if (!s.data.inventory.length) {
    body.appendChild(el('p', 'empty-note', 'Your messenger bag is empty. It is a very good bag, though.'));
    return;
  }
  const g = el('div', 'grid2');
  for (const i of s.data.inventory) {
    const it = ITEMS[i] ?? { name: i, desc: '' };
    g.appendChild(el('div', 'resident', `<b>${esc(it.name)}</b><p>${esc(it.desc)}</p>`));
  }
  body.appendChild(g);
}

function regionName(id: string): string {
  return ({ city: 'Chain City', hills: 'Genesis Hills', coast: 'Degen Coast', mining: 'the Mining District', heights: 'Node Heights', woods: 'Whitepaper Woods', south: 'Cold Storage' } as Record<string, string>)[id] ?? 'the wilds';
}
