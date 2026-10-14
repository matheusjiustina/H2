import { bus } from "../core/EventBus";
import type { Loadout } from "../world/Station";

export interface UpgradeDef {
  id: string;
  name: string;
  blurb: string;
  cost: number;
  rep: number;
  requires?: string;
  kind: "station" | "instant" | "consumable";
}

export const UPGRADES: UpgradeDef[] = [
  { id: "chair", name: "Better chair", blurb: "Someone's old gaming chair. Still has some spring.", cost: 40, rep: 0, kind: "station" },
  { id: "keyboard", name: "Mechanical keyboard", blurb: "Clacky. Your neighbors will love it.", cost: 30, rep: 0, kind: "station" },
  { id: "deco", name: "Desk decoration", blurb: "A cactus, a little lamp and a framed first green candle.", cost: 25, rep: 0, kind: "station" },
  { id: "monitor", name: "Bigger monitor", blurb: "24-inch widescreen. More candles per glance. Same market.", cost: 60, rep: 15, kind: "station" },
  { id: "second", name: "Second monitor", blurb: "An overview of every token. Still not a crystal ball.", cost: 80, rep: 15, requires: "monitor", kind: "station" },
  { id: "case", name: "Custom case", blurb: "Glass side panel, three warm fans. Zero alpha.", cost: 70, rep: 40, kind: "station" },
  { id: "locker", name: "Personal locker", blurb: "Locker 03 in the hallway. Keep your stuff safe.", cost: 35, rep: 15, kind: "instant" },
  { id: "mezz", name: "Mezzanine station", blurb: "Premium seat upstairs. Same market, better view.", cost: 150, rep: 75, kind: "instant" },
];

export const CONSUMABLES = [
  { id: "hour", name: "PC time • 1 hour", cost: 5 },
  { id: "nightpass", name: "Night pass", cost: 20 },
];

export const REP_LEVELS = [
  { at: 0, title: "Walk-in" },
  { at: 15, title: "Regular" },
  { at: 40, title: "Night Owl" },
  { at: 75, title: "Back Row Legend" },
  { at: 120, title: "Mezzanine Material" },
  { at: 180, title: "House Furniture" },
];

export interface TaskDef {
  id: string;
  title: string;
  desc: string;
  reward: number;
  rep: number;
}

export const TASKS: TaskDef[] = [
  { id: "restock", title: "Restock the fridge", desc: "Carry the drink crate from under the stairs to the fridge.", reward: 12, rep: 6 },
  { id: "mice", title: "Return stray mice", desc: "Three mice wandered off. Drop them in the lost & found box on the counter.", reward: 12, rep: 6 },
  { id: "trash", title: "Clean up", desc: "Toss three pieces of trash in the bin by the counter.", reward: 10, rep: 5 },
  { id: "reboot", title: "Reboot PC 09", desc: "PC 09 froze again. Press E on its monitor to reboot it.", reward: 6, rep: 4 },
  { id: "wipe", title: "Wipe the whiteboard", desc: "The Wizard's triangles need a fresh start. Wipe the board.", reward: 6, rep: 4 },
];

export interface GoalDef {
  id: string;
  text: string;
}

export const GOAL_POOL: GoalDef[] = [
  { id: "close", text: "Close any trade — win or lose." },
  { id: "print", text: "Print a receipt at the counter." },
  { id: "pin", text: "Pin a receipt on the wall." },
  { id: "talk3", text: "Talk to three regulars." },
  { id: "draw", text: "Draw something on the whiteboard." },
  { id: "job", text: "Help the Owner with one job." },
  { id: "walk", text: "Take a walk: 3 minutes away from a terminal while holding a position." },
  { id: "bin", text: "Sink something in the bin." },
  { id: "drink", text: "Grab a drink from the fridge." },
  { id: "spin", text: "Spin an empty chair. Responsibly." },
];

export const SECRETS: Record<string, string> = {
  candle: "The Last Candle",
  sticker: "GM from under the desk",
  wc: "Occupied since 2021",
  rimshot: "Three-pointer",
  bell: "Persistent customer",
};

export interface ProgressData {
  credits: number;
  rep: number;
  owned: string[];
  homeStation: string;
  loadout: Loadout;
  secrets: string[];
  introDone: boolean;
  firstTradeDone: boolean;
  activeTask: { id: string; progress: number } | null;
  tasksDone: number;
  goals: { id: string; done: boolean }[];
  goalsNight: number;
  talkedTonight: string[];
  tradesTonight: number;
  repFromTradesTonight: number;
  floatsTonight: number;
  printed: number[];
  pinned: { tradeId: number; u: number; v: number; rot: number; npc?: string; text?: string }[];
  stored: string[];
  sessionMin: number;
  nightPass: boolean;
  bellCount: number;
  wcKnocks: number;
  challenge: "offered" | "active" | "done" | null;
  stats: { trades: number; nights: number; bestTrade: number; worstTrade: number; throws: number; drinks: number };
  pendingDeliveries: string[];
}

export const BASE_LOADOUT: Loadout = { chair: "old", keyboard: "old", monitor: "crt", second: false, case: "old", deco: false };

export function freshProgress(): ProgressData {
  return {
    credits: 20,
    rep: 0,
    owned: [],
    homeStation: "pc03",
    loadout: { ...BASE_LOADOUT },
    secrets: [],
    introDone: false,
    firstTradeDone: false,
    activeTask: null,
    tasksDone: 0,
    goals: [],
    goalsNight: 0,
    talkedTonight: [],
    tradesTonight: 0,
    repFromTradesTonight: 0,
    floatsTonight: 0,
    printed: [],
    pinned: [],
    stored: [],
    sessionMin: 120,
    nightPass: false,
    bellCount: 0,
    wcKnocks: 0,
    challenge: null,
    stats: { trades: 0, nights: 1, bestTrade: 0, worstTrade: 0, throws: 0, drinks: 0 },
    pendingDeliveries: [],
  };
}

/**
 * Reputation, credits, upgrades, tasks, goals and secrets. Progress comes from
 * many activities — not just from making money.
 */
export class Progression {
  d: ProgressData = freshProgress();
  onLoadoutChange: ((lo: Loadout) => void) | null = null;

  get level(): number {
    let l = 0;
    REP_LEVELS.forEach((r, i) => {
      if (this.d.rep >= r.at) l = i;
    });
    return l;
  }

  get title(): string {
    return REP_LEVELS[this.level].title;
  }

  nextLevelAt(): number | null {
    const n = REP_LEVELS[this.level + 1];
    return n ? n.at : null;
  }

  addRep(n: number, reason: string) {
    if (n <= 0) return;
    const before = this.level;
    this.d.rep += n;
    bus.emit("toast", { text: `+${n} REP • ${reason}`, kind: "rep" });
    if (this.level > before) {
      this.d.credits += 15;
      bus.emit("toast", { text: `Reputation: ${this.title}. The Owner nods. +15 CR`, kind: "good" });
    }
  }

  addCredits(n: number, reason: string) {
    if (n <= 0) return;
    this.d.credits += n;
    bus.emit("toast", { text: `+${n} CR • ${reason}`, kind: "good" });
  }

  spend(n: number): boolean {
    if (this.d.credits < n) return false;
    this.d.credits -= n;
    return true;
  }

  owns(id: string) {
    return this.d.owned.includes(id);
  }

  canBuy(u: UpgradeDef): { ok: boolean; why?: string } {
    if (this.owns(u.id)) return { ok: false, why: "Owned" };
    if (this.d.pendingDeliveries.includes(u.id)) return { ok: false, why: "On its way" };
    if (u.requires && !this.owns(u.requires)) return { ok: false, why: `Needs ${UPGRADES.find((x) => x.id === u.requires)?.name}` };
    if (this.d.rep < u.rep) return { ok: false, why: `Needs ${u.rep} rep` };
    if (this.d.credits < u.cost) return { ok: false, why: `${u.cost} CR` };
    return { ok: true };
  }

  /** Mark owned and apply to the loadout (called on delivery/installation). */
  install(id: string) {
    if (!this.owns(id)) this.d.owned.push(id);
    this.d.pendingDeliveries = this.d.pendingDeliveries.filter((x) => x !== id);
    const lo = this.d.loadout;
    if (id === "chair") lo.chair = "gamer";
    if (id === "keyboard") lo.keyboard = "mech";
    if (id === "monitor") lo.monitor = "lcdWide";
    if (id === "second") lo.second = true;
    if (id === "case") lo.case = "custom";
    if (id === "deco") lo.deco = true;
    this.onLoadoutChange?.(lo);
    bus.emit("upgrade:installed", { id });
  }

  // ------------------------------------------------------------- goals

  rollGoals(night: number) {
    if (this.d.goalsNight === night && this.d.goals.length) return;
    const pool = [...GOAL_POOL];
    const picks: { id: string; done: boolean }[] = [];
    let seed = night * 7919 + 13;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    // the first night always teaches the core loop
    if (night === 1) picks.push({ id: "close", done: false }, { id: "walk", done: false }, { id: "print", done: false });
    while (picks.length < 3 && pool.length) {
      const i = Math.floor(rand() * pool.length);
      const g = pool.splice(i, 1)[0];
      if (!picks.some((p) => p.id === g.id)) picks.push({ id: g.id, done: false });
    }
    this.d.goals = picks;
    this.d.goalsNight = night;
  }

  completeGoal(id: string) {
    const g = this.d.goals.find((x) => x.id === id && !x.done);
    if (!g) return;
    g.done = true;
    const def = GOAL_POOL.find((x) => x.id === id);
    bus.emit("toast", { text: `Night goal done: ${def?.text ?? id}`, kind: "good" });
    this.addRep(5, "Night goal");
    this.addCredits(8, "Night goal");
  }

  goalsView(): { text: string; done: boolean }[] {
    return this.d.goals.map((g) => ({ text: GOAL_POOL.find((x) => x.id === g.id)?.text ?? g.id, done: g.done }));
  }

  // ------------------------------------------------------------- secrets

  findSecret(id: string) {
    if (this.d.secrets.includes(id)) return false;
    this.d.secrets.push(id);
    bus.emit("toast", { text: `Secret found: ${SECRETS[id] ?? id} (${this.d.secrets.length}/${Object.keys(SECRETS).length})`, kind: "good" });
    this.addRep(6, "Secret");
    this.addCredits(10, "Secret");
    bus.emit("secret:found", { id });
    return true;
  }

  // ------------------------------------------------------------- night

  newNight(night: number) {
    this.d.talkedTonight = [];
    this.d.tradesTonight = 0;
    this.d.repFromTradesTonight = 0;
    this.d.floatsTonight = 0;
    this.d.nightPass = false;
    this.d.challenge = null;
    // regulars get the first hour on the house
    this.d.sessionMin = Math.max(this.d.sessionMin, 60);
    this.d.stats.nights = night;
    this.rollGoals(night);
  }
}
