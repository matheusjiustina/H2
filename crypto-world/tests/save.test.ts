import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, KeyValueStore, migrate, SAVE_VERSION, SaveSystem } from '../src/gameplay/SaveSystem';
import { GameState } from '../src/gameplay/GameState';
import { MISSIONS } from '../src/data/missions';

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

function sample() {
  const state = new GameState(MISSIONS);
  state.apply([{ setFlag: 'game-started' }, { startMission: 'm01' }]);
  state.discover('pizza');
  return {
    state: state.data,
    player: { dir: [0, 0, 1] as [number, number, number], facing: [1, 0, 0] as [number, number, number] },
    time: 0.42,
    cosmetics: { jacket: '#2f8f8f', bag: 'backpack' as const, bagColor: '#c9663e', hat: 'beanie' as const, hatColor: '#d9584a', hairStyle: 'bob' as const, hair: '#4a3226', skin: '#c98b62' },
    dials: [1, 2, 3, 4],
  };
}

describe('save system', () => {
  it('round-trips a save', () => {
    const store = new MemoryStore();
    const saves = new SaveSystem(store);
    expect(saves.hasSave()).toBe(false);
    expect(saves.save(sample())).toBe(true);
    const back = saves.load()!;
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.state.missions.m01.status).toBe('active');
    expect(back.state.secrets).toContain('pizza');
    expect(back.time).toBeCloseTo(0.42);
    expect(back.dials).toEqual([1, 2, 3, 4]);
    expect(back.cosmetics.hat).toBe('beanie');
    // A restored state keeps working with the mission data.
    const s = new GameState(MISSIONS, back.state);
    expect(s.currentObjective('m01')?.id).toBe('meet');
  });

  it('migrates version 1 saves', () => {
    const v1: any = { ...sample(), version: 1 };
    delete v1.cosmetics;
    delete v1.dials;
    v1.state = { ...v1.state, found: ['mural'] };
    delete v1.state.secrets;
    const m = migrate(v1)!;
    expect(m).not.toBeNull();
    expect(m.version).toBe(2);
    expect(m.state.secrets).toEqual(['mural']);
    expect(m.dials).toEqual([0, 0, 0, 0]);
    expect(m.cosmetics.jacket).toBeTruthy();
  });

  it('rejects unknown versions and malformed data', () => {
    expect(migrate(null)).toBeNull();
    expect(migrate({ ...sample(), version: 99 })).toBeNull();
    expect(migrate({ ...sample(), version: 2, player: { dir: [0, 0, 'x'], facing: [1, 0, 0] } })).toBeNull();
    expect(migrate({ ...sample(), version: 2, player: { dir: [0, 0, 0], facing: [1, 0, 0] } })).toBeNull();
    expect(migrate({ ...sample(), version: 2, state: { flags: {} } })).toBeNull();
  });

  it('sanitises out-of-range values', () => {
    const m = migrate({ ...sample(), version: 2, time: 3.25, dials: [12, -3, 4.7, 'x'] })!;
    expect(m.time).toBeCloseTo(0.25);
    expect(m.dials).toEqual([2, 3, 4, 0]);
  });

  it('quarantines corrupt saves instead of crashing', () => {
    const store = new MemoryStore();
    store.setItem('crypto-world.save', '{"version":2, broken');
    const saves = new SaveSystem(store);
    expect(saves.load()).toBeNull();
    expect(saves.lastError).toMatch(/corrupt/i);
    expect(store.getItem('crypto-world.save')).toBeNull();
    expect(store.getItem('crypto-world.save.corrupt')).toContain('broken');
  });

  it('survives storage that throws', () => {
    const broken: KeyValueStore = {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('quota');
      },
      removeItem() {
        throw new Error('denied');
      },
    };
    const saves = new SaveSystem(broken);
    expect(saves.load()).toBeNull();
    expect(saves.save(sample())).toBe(false);
    expect(saves.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(() => saves.clear()).not.toThrow();
  });

  it('merges stored settings with defaults and ignores wrong types', () => {
    const store = new MemoryStore();
    store.setItem('crypto-world.settings', JSON.stringify({ master: 0.3, quality: 'low', invertY: 'yes', unknown: 1 }));
    const s = new SaveSystem(store).loadSettings();
    expect(s.master).toBe(0.3);
    expect(s.quality).toBe('low');
    expect(s.invertY).toBe(DEFAULT_SETTINGS.invertY);
    expect((s as any).unknown).toBeUndefined();
  });
});
