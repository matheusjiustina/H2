import { Cond, Effect, GameStateData, Mission, MissionProgress, MissionStatus } from './types';

export type GameEvent =
  | { type: 'mission-available'; mission: Mission }
  | { type: 'mission-start'; mission: Mission }
  | { type: 'objective'; mission: Mission; index: number }
  | { type: 'mission-complete'; mission: Mission }
  | { type: 'item-get'; item: string }
  | { type: 'item-lose'; item: string }
  | { type: 'secret'; id: string }
  | { type: 'fragment'; id: string }
  | { type: 'flag'; flag: string; value: unknown }
  | { type: 'custom'; name: string; data?: unknown };

export function emptyState(): GameStateData {
  return { flags: {}, inventory: [], missions: {}, tracked: null, talked: {}, seen: [], secrets: [], fragments: [], night: false };
}

/**
 * Authoritative gameplay state: flags, inventory, mission progress, discoveries. Pure logic with no
 * rendering dependencies, so mission flows can be verified end-to-end in unit tests.
 */
export class GameState {
  data: GameStateData;
  private listeners: ((e: GameEvent) => void)[] = [];

  constructor(readonly missions: Mission[], data?: GameStateData) {
    this.data = data ?? emptyState();
    for (const m of missions) if (!this.data.missions[m.id]) this.data.missions[m.id] = { status: 'locked', objective: 0, counts: {} };
    this.refresh(false);
  }

  on(fn: (e: GameEvent) => void): () => void {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((l) => l !== fn));
  }

  private emit(e: GameEvent): void {
    for (const l of this.listeners) l(e);
  }

  mission(id: string): Mission {
    const m = this.missions.find((x) => x.id === id);
    if (!m) throw new Error(`Unknown mission ${id}`);
    return m;
  }

  progress(id: string): MissionProgress {
    return this.data.missions[id];
  }

  status(id: string): MissionStatus {
    return this.data.missions[id]?.status ?? 'locked';
  }

  /** The active objective of a mission, or null. */
  currentObjective(id: string) {
    const p = this.data.missions[id];
    if (!p || p.status !== 'active') return null;
    return this.mission(id).objectives[p.objective] ?? null;
  }

  activeMissions(): Mission[] {
    return this.missions.filter((m) => this.status(m.id) === 'active');
  }

  check(c: Cond | undefined): boolean {
    if (!c) return true;
    const d = this.data;
    if ('all' in c) return c.all.every((x) => this.check(x));
    if ('any' in c) return c.any.some((x) => this.check(x));
    if ('not' in c) return !this.check(c.not);
    if ('flag' in c) return c.is === undefined ? !!d.flags[c.flag] : d.flags[c.flag] === c.is;
    if ('mission' in c) {
      const s = this.status(c.mission);
      if (c.status === 'started') return s === 'active' || s === 'done';
      if (c.status === 'notDone') return s !== 'done';
      return s === c.status;
    }
    if ('objective' in c) {
      const o = this.currentObjective(c.objective[0]);
      return !!o && o.id === c.objective[1];
    }
    if ('item' in c) return d.inventory.includes(c.item);
    if ('talked' in c) return (d.talked[c.talked] ?? 0) >= (c.min ?? 1);
    if ('seen' in c) return d.seen.includes(c.seen);
    if ('secret' in c) return d.secrets.includes(c.secret);
    if ('fragments' in c) return this.countCollected('frag.') >= c.fragments;
    if ('time' in c) return c.time === 'night' ? d.night : !d.night;
    return false;
  }

  apply(effects: Effect[] | undefined): void {
    if (!effects) return;
    for (const e of effects) {
      if ('setFlag' in e) {
        this.data.flags[e.setFlag] = e.value ?? true;
        this.emit({ type: 'flag', flag: e.setFlag, value: e.value ?? true });
      } else if ('give' in e) this.give(e.give);
      else if ('take' in e) this.take(e.take);
      else if ('startMission' in e) this.startMission(e.startMission);
      else if ('advance' in e) this.advance(e.advance[0], e.advance[1]);
      else if ('secret' in e) this.discover(e.secret);
      else if ('collect' in e) this.collect(e.collect);
      else if ('event' in e) this.emit({ type: 'custom', name: e.event, data: e.data });
    }
    this.refresh(true);
  }

  give(item: string): void {
    if (this.data.inventory.includes(item)) return;
    this.data.inventory.push(item);
    this.emit({ type: 'item-get', item });
  }

  take(item: string): void {
    const i = this.data.inventory.indexOf(item);
    if (i < 0) return;
    this.data.inventory.splice(i, 1);
    this.emit({ type: 'item-lose', item });
  }

  discover(id: string): boolean {
    if (this.data.secrets.includes(id)) return false;
    this.data.secrets.push(id);
    this.emit({ type: 'secret', id });
    return true;
  }

  /** Number of collected ids (fragments, beacons…) starting with `prefix`. */
  countCollected(prefix: string): number {
    return this.data.fragments.filter((f) => f.startsWith(prefix)).length;
  }

  hasCollected(id: string): boolean {
    return this.data.fragments.includes(id);
  }

  /** Records a collectible (block fragment, lit beacon…) and advances matching collect objectives. */
  collect(id: string): boolean {
    if (this.data.fragments.includes(id)) return false;
    this.data.fragments.push(id);
    this.emit({ type: 'fragment', id });
    for (const m of this.activeMissions()) this.autoComplete(m.id);
    this.refresh(true);
    return true;
  }

  startMission(id: string): void {
    const p = this.data.missions[id];
    if (!p || p.status === 'active' || p.status === 'done') return;
    p.status = 'active';
    p.objective = 0;
    const m = this.mission(id);
    if (!this.data.tracked || this.status(this.data.tracked) !== 'active') this.data.tracked = id;
    this.emit({ type: 'mission-start', mission: m });
    // An objective may already be satisfied (e.g. fragments collected early).
    this.autoComplete(id);
  }

  /** Completes `objectiveId` if it is the mission's current objective. */
  advance(missionId: string, objectiveId: string): boolean {
    const o = this.currentObjective(missionId);
    if (!o || o.id !== objectiveId) return false;
    this.completeObjective(missionId);
    return true;
  }

  private completeObjective(missionId: string): void {
    const p = this.data.missions[missionId];
    const m = this.mission(missionId);
    this.emit({ type: 'objective', mission: m, index: p.objective });
    p.objective++;
    if (p.objective >= m.objectives.length) {
      p.status = 'done';
      this.emit({ type: 'mission-complete', mission: m });
      this.apply(m.onComplete);
      if (this.data.tracked === missionId) this.data.tracked = this.activeMissions()[0]?.id ?? null;
    } else this.autoComplete(missionId);
  }

  private autoComplete(missionId: string): void {
    const o = this.currentObjective(missionId);
    if (!o) return;
    if (o.type === 'collect' && this.countCollected(o.target) >= (o.count ?? 1)) this.completeObjective(missionId);
  }

  /** Gameplay hooks — called by the world when the player does things. */
  onInteract(id: string): boolean {
    let hit = false;
    for (const m of this.activeMissions()) {
      const o = this.currentObjective(m.id);
      if (o && o.type === 'interact' && o.target === id && !o.manual) {
        this.completeObjective(m.id);
        hit = true;
      }
    }
    if (hit) this.refresh(true);
    return hit;
  }

  onReach(placeId: string): boolean {
    let hit = false;
    for (const m of this.activeMissions()) {
      const o = this.currentObjective(m.id);
      if (o && o.type === 'reach' && o.target === placeId) {
        this.completeObjective(m.id);
        hit = true;
      }
    }
    if (hit) this.refresh(true);
    return hit;
  }

  /** Called after any conversation with `npc` ends. Completes plain "talk to" objectives. */
  onTalked(npc: string): boolean {
    this.data.talked[npc] = (this.data.talked[npc] ?? 0) + 1;
    let hit = false;
    for (const m of this.activeMissions()) {
      const o = this.currentObjective(m.id);
      if (o && o.type === 'talk' && o.target === npc) {
        this.completeObjective(m.id);
        hit = true;
      }
    }
    this.refresh(true);
    return hit;
  }

  /** Recomputes which locked missions became available. */
  refresh(notify: boolean): void {
    for (const m of this.missions) {
      const p = this.data.missions[m.id];
      if (p.status === 'locked' && this.check(m.requires)) {
        p.status = 'available';
        if (notify) this.emit({ type: 'mission-available', mission: m });
      }
    }
  }

  /** Missions an NPC can currently offer. */
  offersFrom(npc: string): Mission[] {
    return this.missions.filter((m) => m.giver === npc && this.status(m.id) === 'available');
  }

  /** True if the NPC is the target of some active objective. */
  isObjectiveTarget(npc: string): boolean {
    return this.activeMissions().some((m) => {
      const o = this.currentObjective(m.id);
      return !!o && (o.type === 'talk' || o.type === 'deliver') && o.target === npc;
    });
  }
}
