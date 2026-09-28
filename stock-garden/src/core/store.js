import { Emitter } from './events.js';
import { GROWTH, PLOT_POSITIONS } from '../config/game.js';
import { STOCK_MAP } from '../config/stocks.js';

/**
 * Game state: which stock grows on which plot, and the Harvest Vault.
 * All gameplay mutations go through here and are broadcast as events,
 * which is the seam for future services (backend sync, rewards,
 * leaderboard, wallet/NFT minting) — they can simply subscribe:
 *
 *   store.on('harvest', ({ stockId, total }) => api.recordHarvest(...))
 */
export function createStore({ persistence, now = () => Date.now() }) {
  const events = new Emitter();
  const state = hydrate(persistence.load());

  function hydrate(saved) {
    const plots = PLOT_POSITIONS.map((_, i) => {
      const p = saved?.plots?.[i];
      return p && STOCK_MAP[p.stockId] && Number.isFinite(p.plantedAt)
        ? { stockId: p.stockId, plantedAt: p.plantedAt, seed: p.seed ?? 1 }
        : { stockId: null, plantedAt: null, seed: 1 };
    });
    const vault = {};
    for (const [id, n] of Object.entries(saved?.vault ?? {})) {
      if (STOCK_MAP[id] && n > 0) vault[id] = n | 0;
    }
    const total = Object.values(vault).reduce((a, b) => a + b, 0);
    return { plots, vault, total, onboarded: !!saved?.onboarded };
  }

  const persist = () => persistence.save(state);

  function growth(plotIndex, t = now()) {
    const p = state.plots[plotIndex];
    if (!p.stockId) return null;
    const elapsed = Math.max(0, (t - p.plantedAt) / 1000);
    const starts = GROWTH.stageStarts;
    let stage = 0;
    for (let i = 0; i < starts.length; i++) if (elapsed >= starts[i]) stage = i;
    return {
      elapsed,
      stage,
      progress: Math.min(1, elapsed / GROWTH.readyAt),
      ready: elapsed >= GROWTH.readyAt,
    };
  }

  return {
    state,
    on: (type, fn) => events.on(type, fn),
    growth,

    plant(plotIndex, stockId) {
      const p = state.plots[plotIndex];
      if (!p || p.stockId || !STOCK_MAP[stockId]) return false;
      p.stockId = stockId;
      p.plantedAt = now();
      p.seed = (Math.random() * 1e9) | 0;
      state.onboarded = true;
      persist();
      events.emit('plant', { plotIndex, stockId });
      return true;
    },

    harvest(plotIndex) {
      const p = state.plots[plotIndex];
      const g = growth(plotIndex);
      if (!g?.ready) return null;
      const stockId = p.stockId;
      p.stockId = null;
      p.plantedAt = null;
      state.vault[stockId] = (state.vault[stockId] ?? 0) + 1;
      state.total += 1;
      persist();
      events.emit('harvest', { plotIndex, stockId, total: state.total });
      return stockId;
    },
  };
}
