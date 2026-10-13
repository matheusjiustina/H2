import { describe, expect, it } from 'vitest';
import { GameState } from '../src/gameplay/GameState';
import { DialogueRunner, pickConversation } from '../src/gameplay/Dialogue';
import { MISSIONS } from '../src/data/missions';
import { CONVERSATIONS } from '../src/data/dialogue';
import { NPCS } from '../src/data/npcs';
import type { Conversation } from '../src/gameplay/types';

/** Plays a conversation the way a cooperative player would. */
function run(state: GameState, conv: Conversation): string[] {
  const shown: string[] = [];
  const r = new DialogueRunner(conv, state);
  let guard = 0;
  while (!r.done && guard++ < 80) {
    const cur = r.current()!;
    shown.push(cur.text);
    if (cur.choices.length) {
      // Prefer choices that don't end the talk and don't lead to "wrong" answers.
      const pick =
        cur.choices.find((c) => {
          const ch = cur.line.choices![c.index];
          return !ch.end && !(ch.goto ?? '').startsWith('wrong') && !(ch.goto ?? '').startsWith('reassure');
        }) ?? cur.choices[0];
      r.next(pick.index);
    } else r.next();
  }
  expect(guard).toBeLessThan(80);
  return shown;
}

function talk(state: GameState, npc: string): string[] {
  const conv = pickConversation(CONVERSATIONS, npc, state);
  expect(conv, `no conversation for ${npc}`).not.toBeNull();
  const lines = run(state, conv!);
  state.onTalked(npc);
  return lines;
}

function interact(state: GameState, id: string): void {
  const conv = pickConversation(CONVERSATIONS, id, state);
  if (conv) run(state, conv);
  state.onInteract(id);
}

describe('full story playthrough', () => {
  it('completes all twelve missions in order', () => {
    const s = new GameState(MISSIONS);
    const events: string[] = [];
    s.on((e) => events.push(e.type === 'mission-complete' ? `done:${e.mission.id}` : e.type));
    s.apply([{ setFlag: 'game-started' }, { startMission: 'm01' }]);
    expect(s.status('m01')).toBe('active');

    // M01 First Connection
    talk(s, 'node');
    expect(s.currentObjective('m01')?.id).toBe('terminal');
    interact(s, 'city.messenger.terminal');
    expect(s.currentObjective('m01')?.id).toBe('report');
    talk(s, 'node');
    expect(s.status('m01')).toBe('done');
    expect(s.data.flags.messenger).toBe(true);

    // M02 Genesis Message
    expect(s.status('m02')).toBe('available');
    talk(s, 'genesis');
    expect(s.data.inventory).toContain('archived-message');
    talk(s, 'block');
    expect(s.data.inventory).not.toContain('archived-message');
    interact(s, 'hills.memorial');
    talk(s, 'block');
    expect(s.status('m02')).toBe('done');

    // M03 Lost Transaction
    talk(s, 'dex');
    expect(s.status('m03')).toBe('active');
    interact(s, 'city.market.terminal');
    interact(s, 'city.cafe.terminal');
    interact(s, 'city.gas.monitor');
    talk(s, 'gas');
    talk(s, 'dex');
    expect(s.status('m03')).toBe('done');

    // M04 The Developer's Mistake (code review puzzle)
    talk(s, 'nova');
    expect(s.status('m04')).toBe('active');
    interact(s, 'city.nova.terminal');
    expect(s.data.flags['bug-found']).toBe(true);
    talk(s, 'nova');
    talk(s, 'byte');
    expect(s.status('m04')).toBe('done');

    // M05 Forgotten Blocks
    talk(s, 'genesis');
    expect(s.status('m05')).toBe('active');
    for (const f of ['frag.hills', 'frag.coast', 'frag.mining', 'frag.heights', 'frag.city']) s.collect(f);
    expect(s.currentObjective('m05')?.id).toBe('return');
    talk(s, 'genesis');
    expect(s.status('m05')).toBe('done');

    // M06 The Artist's Collection
    talk(s, 'pixel');
    expect(s.data.inventory).toContain('pixel-artwork');
    talk(s, 'wallet');
    talk(s, 'meme');
    expect(s.data.inventory).toContain('meme-note');
    talk(s, 'wallet');
    interact(s, 'coast.gallery.display');
    expect(s.status('m06')).toBe('done');

    // M07 Network Congestion
    talk(s, 'gas');
    expect(s.status('m07')).toBe('active');
    interact(s, 'wilds.pylon.west');
    interact(s, 'mining.relay.panel');
    talk(s, 'hash');
    talk(s, 'gas');
    expect(s.status('m07')).toBe('done');

    // M08 The Mining Machine
    talk(s, 'hash');
    expect(s.status('m08')).toBe('active');
    talk(s, 'fork');
    interact(s, 'coast.fork.contraption');
    talk(s, 'fork');
    expect(s.data.inventory).toContain('quiet-storm');
    talk(s, 'hash');
    interact(s, 'mining.oldfaithful');
    expect(s.status('m08')).toBe('done');

    // M09 Hidden Signal
    talk(s, 'luna');
    expect(s.status('m09')).toBe('active');
    interact(s, 'hills.observatory.console');
    interact(s, 'heights.listening.post');
    interact(s, 'woods.listening.post');
    talk(s, 'luna');
    expect(s.status('m09')).toBe('done');

    // M10 The Community Message
    talk(s, 'byte');
    expect(s.status('m10')).toBe('active');
    talk(s, 'sat');
    talk(s, 'wallet');
    talk(s, 'hash');
    talk(s, 'kai');
    expect(s.data.inventory.filter((i) => i.startsWith('note-')).length).toBe(4);
    interact(s, 'city.bulletin');
    expect(s.data.inventory.filter((i) => i.startsWith('note-')).length).toBe(0);
    talk(s, 'byte');
    expect(s.status('m10')).toBe('done');

    // M11 The Missing Node
    talk(s, 'node');
    expect(s.status('m11')).toBe('active');
    s.onReach('heights.station');
    interact(s, 'heights.station.console');
    talk(s, 'kai');
    talk(s, 'alpha');
    expect(s.data.inventory).toContain('relay-crystal');
    interact(s, 'heights.station.socket');
    talk(s, 'oracle');
    expect(s.status('m11')).toBe('done');

    // M12 The Living Chain
    talk(s, 'node');
    expect(s.status('m12')).toBe('active');
    interact(s, 'heights.control.final'); // too early: must not complete
    expect(s.currentObjective('m12')?.id).toBe('beacons');
    for (const b of ['beacon.city', 'beacon.hills', 'beacon.coast', 'beacon.mining', 'beacon.heights']) interact(s, b);
    expect(s.currentObjective('m12')?.id).toBe('sign');
    interact(s, 'heights.control.final');
    expect(s.status('m12')).toBe('done');
    expect(s.data.flags['living-chain']).toBe(true);

    expect(MISSIONS.every((m) => s.status(m.id) === 'done')).toBe(true);
    expect(events.filter((e) => e.startsWith('done:')).length).toBe(12);
    expect(events).toContain('custom');
  });

  it('only advances interact objectives marked manual through explicit effects', () => {
    const s = new GameState(MISSIONS);
    s.apply([{ setFlag: 'game-started' }, { startMission: 'm01' }]);
    talk(s, 'node');
    // Interacting without registering (e.g. cancelling) must not complete it.
    s.onInteract('city.messenger.terminal');
    expect(s.currentObjective('m01')?.id).toBe('terminal');
  });

  it('wrong answers in the code review do not advance the mission', () => {
    const s = new GameState(MISSIONS);
    s.apply([{ setFlag: 'game-started' }, { startMission: 'm01' }, { startMission: 'm04' }]);
    const conv = pickConversation(CONVERSATIONS, 'city.nova.terminal', s)!;
    const r = new DialogueRunner(conv, s);
    r.next();
    r.next(); // to the question
    r.next(0); // wrong answer (price)
    expect(s.currentObjective('m04')?.id).toBe('review');
    expect(r.current()?.text).toContain('price is fine');
  });
});

describe('content integrity', () => {
  it('every conversation goto/choice label exists', () => {
    for (const c of CONVERSATIONS) {
      const labels = new Set(c.lines.map((l) => l.label).filter(Boolean));
      for (const l of c.lines) {
        if (l.goto) expect(labels.has(l.goto), `${c.id} goto ${l.goto}`).toBe(true);
        for (const ch of l.choices ?? []) if (ch.goto) expect(labels.has(ch.goto), `${c.id} choice goto ${ch.goto}`).toBe(true);
      }
    }
  });

  it('conversation ids are unique', () => {
    const ids = CONVERSATIONS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every NPC has an introduction and small talk, and every mission giver/target exists', () => {
    const npcIds = new Set(NPCS.map((n) => n.id));
    expect(NPCS.length).toBeGreaterThanOrEqual(15);
    for (const n of NPCS) {
      const mine = CONVERSATIONS.filter((c) => c.npc === n.id);
      expect(mine.length, `${n.id} conversations`).toBeGreaterThanOrEqual(4);
      expect(n.relationships.length).toBeGreaterThan(0);
      for (const r of n.relationships) expect(npcIds.has(r.id), `${n.id} → ${r.id}`).toBe(true);
    }
    for (const m of MISSIONS) {
      expect(npcIds.has(m.giver), m.giver).toBe(true);
      for (const o of m.objectives) if (o.type === 'talk' || o.type === 'deliver') expect(npcIds.has(o.target), `${m.id}.${o.id}`).toBe(true);
    }
  });

  it('defines at least twelve missions with sequential numbers', () => {
    expect(MISSIONS.length).toBe(12);
    MISSIONS.forEach((m, i) => expect(m.number).toBe(i + 1));
  });
});
