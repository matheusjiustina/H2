import { Conversation, DialogueLine } from './types';
import { GameState } from './GameState';

export interface ShownLine {
  speaker: string;
  text: string;
  line: DialogueLine;
  choices: { text: string; index: number }[];
}

/** Chooses which conversation an NPC has for the player right now. */
export function pickConversation(convs: Conversation[], npc: string, state: GameState): Conversation | null {
  let top = -Infinity;
  let pool: Conversation[] = [];
  for (const c of convs) {
    if (c.npc !== npc) continue;
    if (c.once && state.data.seen.includes(c.id)) continue;
    if (!state.check(c.when)) continue;
    if (c.priority > top) {
      top = c.priority;
      pool = [c];
    } else if (c.priority === top) pool.push(c);
  }
  if (!pool.length) return null;
  // Equal-priority small talk rotates with each visit.
  return pool[(state.data.talked[npc] ?? 0) % pool.length];
}

/**
 * Steps through one conversation. Effects on a line fire when that line is shown; effects on a
 * choice fire when it is picked. Lines whose condition fails are skipped.
 */
export class DialogueRunner {
  private index = -1;
  done = false;
  private labels = new Map<string, number>();

  constructor(readonly conv: Conversation, private state: GameState) {
    conv.lines.forEach((l, i) => l.label && this.labels.set(l.label, i));
    if (!state.data.seen.includes(conv.id)) state.data.seen.push(conv.id);
    this.goto(0);
  }

  private goto(i: number): void {
    let k = i;
    while (k < this.conv.lines.length && !this.state.check(this.conv.lines[k].when)) k++;
    if (k >= this.conv.lines.length) {
      this.done = true;
      this.index = -1;
      return;
    }
    this.index = k;
    this.state.apply(this.conv.lines[k].effects);
  }

  current(): ShownLine | null {
    if (this.done || this.index < 0) return null;
    const line = this.conv.lines[this.index];
    const choices = (line.choices ?? [])
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => this.state.check(c.when))
      .map(({ c, i }) => ({ text: c.text, index: i }));
    return { speaker: line.who ?? this.conv.npc, text: line.text, line, choices };
  }

  /** Advances; pass the chosen choice index when the line has choices. */
  next(choice?: number): void {
    if (this.done) return;
    const line = this.conv.lines[this.index];
    if (line.choices && line.choices.length) {
      const visible = this.current()!.choices;
      const pick = choice ?? visible[0]?.index ?? 0;
      const ch = line.choices[pick];
      if (ch) {
        this.state.apply(ch.effects);
        if (ch.end) return this.finish();
        if (ch.goto) return this.jump(ch.goto);
      }
    }
    if (line.end) return this.finish();
    if (line.goto) return this.jump(line.goto);
    this.goto(this.index + 1);
  }

  private jump(label: string): void {
    const i = this.labels.get(label);
    if (i === undefined) throw new Error(`Missing label ${label} in ${this.conv.id}`);
    this.goto(i);
  }

  private finish(): void {
    this.done = true;
    this.index = -1;
  }
}
