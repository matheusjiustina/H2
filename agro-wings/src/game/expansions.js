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

export const EXPANSIONS = Object.freeze([FIREBOSS_EXPANSION]);

let source = null;

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
export const aircraftUnlocked = (type) => !type?.premium || isUnlocked(type.premium);
