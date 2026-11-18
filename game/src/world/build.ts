import { World } from './world';
import { buildDowntown } from './districts/downtown';
import { buildWallStreet } from './districts/wallstreet';
import { buildGovernment } from './districts/government';
import { buildSuburbs } from './districts/suburbs';
import { buildBeach } from './districts/beach';
import { buildHarbor } from './districts/harbor';
import { buildDesert } from './districts/desert';
import { buildOutskirts } from './districts/outskirts';
import { tunnel } from './landmarks';

/** Cars parked along the kerb of ordinary city streets. */
function curbParking(w: World) {
  for (const e of w.roads.edges) {
    if (e.kind !== 'street' || e.len < 50) continue;
    const off = e.w / 2 - 1.3;
    const rot = Math.atan2(e.dx, e.dz);
    for (let s = 16; s < e.len - 16; s += 6.8) {
      for (const side of [-1, 1]) {
        if (!w.rng.chance(0.14)) continue;
        // right-hand side of a→b is (-dz, dx)
        const x = e.a.x + e.dx * s + -e.dz * off * side, z = e.a.z + e.dz * s + e.dx * off * side;
        w.parkSpots.push({ x, z, rot: side > 0 ? rot : rot + Math.PI, y: 0.04 });
      }
    }
  }
}

/** Street-name blades at a handful of major intersections. */
function streetSigns(w: World) {
  let n = 0;
  for (const node of w.roads.nodes) {
    if (!node.signal || node.edges.length < 4 || node.id % 3 !== 0) continue;
    const names = [...new Set(node.edges.map((e) => e.name).filter(Boolean))];
    if (names.length < 1 || n++ > 40) continue;
    const x = node.x + node.hx + 1.4, z = node.z + node.hz + 1.4;
    w.geo.at('world', x, z).cyl(x, 0.16, z, 0.07, 0.07, 3.6, 5, 0x4a4f66, false);
    names.slice(0, 2).forEach((name, i) => w.signs.text(x, 3.5 + i * 0.5, z, i * (Math.PI / 2), 2.6, 0.42, name.toUpperCase(), '#2f8f5a', '#f6ecd0', true));
  }
}

/** Generates the whole city. Deterministic: the same seed always yields the same world. */
export function buildWorld(): World {
  const w = new World();
  buildDowntown(w);
  buildWallStreet(w);
  buildGovernment(w);
  buildSuburbs(w);
  buildBeach(w);
  buildHarbor(w);
  buildDesert(w);
  buildOutskirts(w);
  tunnel(w);
  curbParking(w);
  streetSigns(w);
  w.finish();
  return w;
}
