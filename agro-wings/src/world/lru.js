// Bounded caches of generated world cells (world optimisation, phase 3).
// A Map keeps insertion order, so "most recently used last" is a delete +
// set on every use, and trimming drops from the front: the cells around the
// camera are touched on every gather and are never the ones dropped.

// The cached value for `key` (or undefined), marked as just used.
export function lruGet(map, key) {
  const v = map.get(key);
  if (v !== undefined) { map.delete(key); map.set(key, v); }
  return v;
}

// Drop the least recently used entries until `map` holds at most `max`
// (down to `to` when given, to trim in batches). `onDrop(value, key)` frees
// what an entry owns. Returns how many were dropped.
export function lruTrim(map, max, to = max, onDrop = null) {
  if (map.size <= max) return 0;
  let n = map.size - to;
  const k0 = n;
  for (const [k, v] of map) {
    if (n-- <= 0) break;
    map.delete(k);
    onDrop?.(v, k);
  }
  return k0;
}
