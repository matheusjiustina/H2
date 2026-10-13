import type { Cond, Conversation, DialogueLine } from '../../gameplay/types';

/** Small helpers that keep the dialogue data readable. */
export const active = (m: string): Cond => ({ mission: m, status: 'active' });
export const done = (m: string): Cond => ({ mission: m, status: 'done' });
export const avail = (m: string): Cond => ({ mission: m, status: 'available' });
export const obj = (m: string, o: string): Cond => ({ objective: [m, o] });
export const all = (...c: Cond[]): Cond => ({ all: c });
export const not = (c: Cond): Cond => ({ not: c });

export function conv(id: string, npc: string, priority: number, when: Cond | undefined, lines: DialogueLine[], once = false): Conversation {
  return { id, npc, priority, when, lines, once };
}

/** Rotating small talk: one-line conversations with low priority. */
export function chatter(npc: string, lines: (string | DialogueLine[])[], when?: Cond): Conversation[] {
  return lines.map((l, i) => conv(`${npc}.chat.${i}`, npc, 1, when, typeof l === 'string' ? [{ text: l, anim: 'talk' }] : l));
}

export const P = (text: string, extra: Partial<DialogueLine> = {}): DialogueLine => ({ who: 'player', text, ...extra });
