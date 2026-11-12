// Which map this page runs: the main world or a premium expansion map.
//
// A map is a complete data set of its own (terrain function, strips, fields,
// forests, water, roads, scenery, contracts). It is chosen ONCE, when the
// page loads, before any world module evaluates — the main map and an
// expansion map are never in memory together; switching maps reloads the
// page (src/ui: the map selector stores the choice and reloads).
//
// Sources, in order: the test environment (AGRO_MAP), the address (?map=,
// development and tests), the stored choice. A premium map that is not
// unlocked falls back to the main map (src/game/expansions.js is the one
// place that answers "unlocked?").
import { isUnlocked, SERRA_EXPANSION } from '../game/expansions.js';

export const MAP_KEY = 'agrowings.map';
export const MAPS = Object.freeze({
  main: { id: 'main', name: 'Fazenda Boa Esperança', premium: null },
  serra: { id: 'serra', name: 'Serra das Bananeiras', premium: SERRA_EXPANSION.id },
});

function requested() {
  try { if (typeof process !== 'undefined' && process.env?.AGRO_MAP) return process.env.AGRO_MAP; } catch { /* browser */ }
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('map');
    if (q) return q;
  } catch { /* no address */ }
  try { return globalThis.localStorage?.getItem(MAP_KEY) ?? 'main'; } catch { return 'main'; }
}

const want = MAPS[requested()] ?? MAPS.main;
export const MAP_ID = want.premium && !isUnlocked(want.premium) ? 'main' : want.id;
export const SERRA = MAP_ID === 'serra';

// Store the choice for the next load (the caller reloads the page).
export function storeMapChoice(id) {
  try { globalThis.localStorage?.setItem(MAP_KEY, MAPS[id] ? id : 'main'); return true; } catch { return false; }
}

// Asked again while the game runs (entering a mode): a premium map whose
// access is no longer granted is left for the main map.
export function mapAllowed() {
  return !MAPS[MAP_ID].premium || isUnlocked(MAPS[MAP_ID].premium);
}
