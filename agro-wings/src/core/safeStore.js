// Local saves that survive a page killed mid-write or a damaged entry
// (phase 05). Each write keeps the previous good copy under `<key>.bak`
// and stores the data in an envelope { f, v, sum, data }: `f` marks the
// format, `v` the caller's data version, `sum` a hash of the data string.
// A read that finds the main entry unreadable (bad JSON, wrong hash) falls
// back to the backup; entries written before this module (plain JSON) are
// still read. Nothing here decides a purchase or a permission — callers
// keep their own rules for that.
const F = 'aw1';

// FNV-1a over the UTF-16 code units, as 8 hex digits.
export function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function decode(raw) {
  if (raw == null) return { ok: false, empty: true };
  let o;
  try { o = JSON.parse(raw); } catch { return { ok: false }; }
  if (o && o.f === F && typeof o.data === 'string') {
    if (hash(o.data) !== o.sum) return { ok: false };
    try { return { ok: true, data: JSON.parse(o.data), v: o.v }; } catch { return { ok: false }; }
  }
  return { ok: true, data: o, v: 0, legacy: true }; // written before the envelope existed
}

// { data, source: 'main' | 'backup' | 'none', damaged } — data is null when nothing usable exists.
export function readSafe(key, storage = globalThis.localStorage) {
  let main, bak;
  try { main = decode(storage.getItem(key)); } catch { main = { ok: false }; }
  if (main.ok) return { data: main.data, v: main.v, source: 'main', damaged: false };
  try { bak = decode(storage.getItem(key + '.bak')); } catch { bak = { ok: false }; }
  if (bak.ok) return { data: bak.data, v: bak.v, source: 'backup', damaged: !main.empty };
  return { data: null, source: 'none', damaged: !main.empty };
}

// Writes `data`; the previous entry (if readable) becomes the backup.
// Returns false when storage refuses (private mode, quota): the game goes on.
export function writeSafe(key, data, v = 1, storage = globalThis.localStorage) {
  try {
    const s = JSON.stringify(data);
    const prev = storage.getItem(key);
    if (prev != null && decode(prev).ok) storage.setItem(key + '.bak', prev);
    storage.setItem(key, JSON.stringify({ f: F, v, sum: hash(s), data: s }));
    return true;
  } catch { return false; }
}
