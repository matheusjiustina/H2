// Terrain information derived from the actual height data (no invented
// numbers): relief and slope of a field set. Used by the mission board.
import { terrainLevel } from './relief.js';

const cache = new WeakMap();

// Elevation range, relief and slope over the talhões of a job, sampled on a
// 30 m grid from terrain.heightAt (the same surface the aircraft touches).
export function fieldsTerrain(terrain, fields) {
  const key = fields[0];
  const hit = cache.get(key);
  if (hit && hit.n === fields.length) return hit.v;
  let mn = 1e9, mx = -1e9, maxSl = 0, sum = 0, n = 0;
  const S = 30;
  for (const f of fields) {
    for (let z = f.z0; z <= f.z1; z += S) for (let x = f.x0; x <= f.x1; x += S) {
      const h = terrain.heightAt(x, z);
      mn = Math.min(mn, h); mx = Math.max(mx, h);
      const gx = (terrain.heightAt(x + 10, z) - terrain.heightAt(x - 10, z)) / 20;
      const gz = (terrain.heightAt(x, z + 10) - terrain.heightAt(x, z - 10)) / 20;
      const sl = Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI;
      maxSl = Math.max(maxSl, sl); sum += sl; n++;
    }
  }
  const cx = fields.reduce((s, f) => s + (f.x0 + f.x1) / 2, 0) / fields.length;
  const cz = fields.reduce((s, f) => s + (f.z0 + f.z1) / 2, 0) / fields.length;
  const v = { min: mn, max: mx, relief: mx - mn, meanSlope: sum / n, maxSlope: maxSl, level: terrainLevel(cx, cz), cx, cz };
  cache.set(key, { n: fields.length, v });
  return v;
}

