// Premium expansions: stable identifiers and the one question the game asks
// of them — is this expansion unlocked for this player?
//
// There is NO purchase, checkout, account, payment or Pix code here, and
// nothing here changes how purchases are made or validated. The answer
// comes from an entitlement source installed by the platform's existing
// premium system (setEntitlementSource). With enforcement on and no source
// installed, every premium expansion is locked. The game asks isUnlocked() at the points
// where a locked expansion must not run (selecting / activating the
// aircraft), not only in the UI.
//
// Note: in a browser game every client-side check can be bypassed by a
// determined user; the authoritative entitlement check belongs to the
// server side of the premium system that grants it.

export const FIREBOSS_EXPANSION = Object.freeze({
  id: 'expansion.at802f-fireboss', // stable: do not rename (saves and entitlements refer to it)
  aircraft: 'at802f',
  name: 'Air Tractor AT-802AF Fire Boss',
});

// Premium map expansion 01: a separate map (src/world/serra.js), chosen at
// load (src/world/activeMap.js).
export const SERRA_EXPANSION = Object.freeze({
  id: 'expansion.map-serra-das-bananeiras', // stable: do not rename
  map: 'serra',
  name: 'Serra das Bananeiras',
});

// Premium map expansion 03: the fire-fighting theatre (src/world/frontier.js).
// Its package carries the map, its fire missions and the red fire-service
// AT-802; flying the Fire Boss there is part of it (`includes`).
export const FRONTIER_EXPANSION = Object.freeze({
  id: 'expansion.map-fireboss-frontier', // stable: do not rename
  map: 'frontier',
  name: 'Operation: Fireboss Frontier',
  includes: Object.freeze(['at802f']),
});

export const EXPANSIONS = Object.freeze([FIREBOSS_EXPANSION, SERRA_EXPANSION, FRONTIER_EXPANSION]);

// The platform's premium system may install its answer BEFORE the game
// loads (a function on globalThis.AGROWINGS_ENTITLEMENTS), so that what is
// decided at load — which map this page runs — is validated by it too.
let source = null;
try { if (typeof globalThis.AGROWINGS_ENTITLEMENTS === 'function') source = globalThis.AGROWINGS_ENTITLEMENTS; } catch { /* no globals */ }

// TESTING PHASE: premium expansions are not enforced yet — the Fire Boss is
// open to everyone while it is being flown and tested. The lock (and the
// hook above) stays in place: setPremiumEnforced(true) turns it on once the
// paid / free decisions are made.
let enforced = false;
export function setPremiumEnforced(on) { enforced = !!on; }
export const premiumEnforced = () => enforced;

// Installed by the platform's premium system: fn(expansionId) → boolean.
// Passing null removes it (everything premium locked again).
export function setEntitlementSource(fn) {
  source = typeof fn === 'function' ? fn : null;
}

export function isUnlocked(id) {
  if (!id) return true; // not a premium item
  if (!EXPANSIONS.some((e) => e.id === id)) return false;
  if (!enforced) return true; // testing phase: open
  try { return source?.(id) === true; } catch { return false; }
}

// Aircraft types carry `premium: <expansion id>` when they belong to one.
// An aircraft a map package includes is open with that package too (the
// package is only ever asked about on its own map: activeMap's MAP_PACKAGE).
let mapPackage = null;
export function setMapPackage(exp) { mapPackage = exp ?? null; }
export const aircraftUnlocked = (type) => !type?.premium || isUnlocked(type.premium)
  || (!!mapPackage?.includes?.includes(type.id) && isUnlocked(mapPackage.id));
