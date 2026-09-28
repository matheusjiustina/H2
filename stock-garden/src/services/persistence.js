/**
 * Persistence adapter. The store only talks to { load(), save(state) },
 * so a backend / database adapter can replace this later without
 * touching gameplay code.
 */
export function createLocalPersistence(key) {
  return {
    load() {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    save(state) {
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch {
        /* storage unavailable (private mode) — the game still works in-memory */
      }
    },
  };
}
