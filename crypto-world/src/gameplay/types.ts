import type { ActionName } from '../characters/CharacterAnimator';

export type MissionStatus = 'locked' | 'available' | 'active' | 'done';

/** Declarative condition evaluated against the game state. */
export type Cond =
  | { flag: string; is?: string | number | boolean }
  | { not: Cond }
  | { all: Cond[] }
  | { any: Cond[] }
  | { mission: string; status: MissionStatus | 'started' | 'notDone' }
  | { objective: [string, string] }
  | { item: string }
  | { talked: string; min?: number }
  | { seen: string }
  | { secret: string }
  | { fragments: number }
  | { time: 'day' | 'night' };

/** Declarative effect applied when a line, choice or interaction fires. */
export type Effect =
  | { setFlag: string; value?: string | number | boolean }
  | { give: string }
  | { take: string }
  | { startMission: string }
  | { advance: [string, string] }
  | { event: string; data?: unknown }
  | { secret: string }
  | { collect: string };

export interface DialogueChoice {
  text: string;
  goto?: string;
  effects?: Effect[];
  when?: Cond;
  /** Closes the conversation after this choice. */
  end?: boolean;
}

export interface DialogueLine {
  label?: string;
  /** Speaker: the NPC id, or 'player'. Defaults to the conversation's NPC. */
  who?: string;
  text: string;
  anim?: ActionName;
  playerAnim?: ActionName;
  effects?: Effect[];
  choices?: DialogueChoice[];
  goto?: string;
  end?: boolean;
  when?: Cond;
}

export interface Conversation {
  id: string;
  npc: string;
  /** Higher wins when several conversations are eligible. */
  priority: number;
  when?: Cond;
  /** Only ever plays once. */
  once?: boolean;
  lines: DialogueLine[];
}

export type ObjectiveType = 'talk' | 'interact' | 'reach' | 'collect' | 'deliver';

export interface Objective {
  id: string;
  type: ObjectiveType;
  text: string;
  /** NPC id (talk/deliver), interactable id (interact), place id (reach), item prefix (collect). */
  target: string;
  count?: number;
  /** Where the HUD arrow points: npc:<id>, interact:<id>, anchor:<id>, or region-local place. */
  marker?: string;
  hint?: string;
  /** Completed only by an explicit dialogue/interaction effect, never automatically. */
  manual?: boolean;
}

export interface Mission {
  id: string;
  number: number;
  title: string;
  giver: string;
  region: string;
  summary: string;
  requires: Cond;
  objectives: Objective[];
  /** Effects applied when the final objective completes. */
  onComplete?: Effect[];
  completeText: string;
}

export interface MissionProgress {
  status: MissionStatus;
  objective: number;
  counts: Record<string, number>;
}

export interface GameStateData {
  flags: Record<string, string | number | boolean>;
  inventory: string[];
  missions: Record<string, MissionProgress>;
  tracked: string | null;
  talked: Record<string, number>;
  seen: string[];
  secrets: string[];
  fragments: string[];
  night: boolean;
}
