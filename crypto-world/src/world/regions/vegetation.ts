import { Vector3 } from 'three';
import { Rng } from '../../core/math/random';
import { tangentFrame } from '../../core/math/sphere';
import { PLANET_RADIUS, SEA_LEVEL } from '../constants';
import { RegionId } from '../layout/LayoutBuilder';
import { World } from '../World';
import { WorldContent } from '../content/WorldContent';

type Entry = { kind: string; w: number; params?: Record<string, any> };

interface Table {
  trees: number; // relative tree density
  forest: number; // 0..1 how strongly trees cluster into forests
  big: Entry[];
  ground: number; // grass / flower density
  small: Entry[];
}

const TABLES: Record<RegionId, Table> = {
  city: {
    trees: 0.25, forest: 0.2,
    big: [{ kind: 'tree.round', w: 3 }, { kind: 'tree.round', w: 1, params: { leaves: 'blossom' } }, { kind: 'bush', w: 2, params: { flowers: '#f29db0' } }],
    ground: 0.5, small: [{ kind: 'grass.tuft', w: 5 }, { kind: 'flower', w: 2 }],
  },
  hills: {
    trees: 1.3, forest: 0.85,
    big: [{ kind: 'tree.round', w: 5 }, { kind: 'tree.birch', w: 2 }, { kind: 'tree.round', w: 1, params: { leaves: 'autumn' } }, { kind: 'bush', w: 3 }, { kind: 'bush', w: 1, params: { flowers: '#f6d55c' } }, { kind: 'rock', w: 1.2 }],
    ground: 1.4, small: [{ kind: 'grass.tuft', w: 6 }, { kind: 'flower', w: 3 }, { kind: 'mushroom', w: 0.2 }],
  },
  coast: {
    trees: 0.55, forest: 0.3,
    big: [{ kind: 'tree.palm', w: 5 }, { kind: 'bush', w: 2 }, { kind: 'rock', w: 1.5 }],
    ground: 0.8, small: [{ kind: 'grass.tuft', w: 5, params: { color: '#a9b862' } }, { kind: 'flower', w: 0.6, params: { color: '#ffffff' } }],
  },
  mining: {
    trees: 0.35, forest: 0.4,
    big: [{ kind: 'tree.pine', w: 2 }, { kind: 'rock', w: 3 }, { kind: 'bush', w: 1 }],
    ground: 0.5, small: [{ kind: 'grass.tuft', w: 5, params: { color: '#a5a26e' } }],
  },
  heights: {
    trees: 0.8, forest: 0.6,
    big: [{ kind: 'tree.pine', w: 4 }, { kind: 'tree.birch', w: 1 }, { kind: 'rock', w: 2 }, { kind: 'bush', w: 1 }],
    ground: 1.0, small: [{ kind: 'grass.tuft', w: 6, params: { color: '#86b97c' } }, { kind: 'flower', w: 1, params: { color: '#b8a4f2' } }],
  },
  woods: {
    trees: 2.2, forest: 0.6,
    big: [{ kind: 'tree.pine', w: 5 }, { kind: 'tree.round', w: 3, params: { leaves: 'dark' } }, { kind: 'tree.birch', w: 1 }, { kind: 'bush', w: 2 }, { kind: 'rock', w: 1 }],
    ground: 1.2, small: [{ kind: 'grass.tuft', w: 5, params: { color: '#6a9f4b' } }, { kind: 'mushroom', w: 0.8 }, { kind: 'flower', w: 0.8 }],
  },
  south: {
    trees: 0.9, forest: 0.6,
    big: [{ kind: 'tree.pine', w: 5, params: { snow: true } }, { kind: 'rock', w: 2, params: { snow: true, color: '#c3c9ce' } }],
    ground: 0.0, small: [],
  },
  wilds: {
    trees: 0.9, forest: 0.75,
    big: [{ kind: 'tree.round', w: 5 }, { kind: 'tree.pine', w: 2 }, { kind: 'tree.birch', w: 1 }, { kind: 'bush', w: 3 }, { kind: 'rock', w: 1.2 }],
    ground: 1.1, small: [{ kind: 'grass.tuft', w: 6 }, { kind: 'flower', w: 2.5 }],
  },
};

function pick(rng: Rng, list: Entry[]): Entry {
  let total = 0;
  for (const e of list) total += e.w;
  let r = rng.next() * total;
  for (const e of list) {
    r -= e.w;
    if (r <= 0) return e;
  }
  return list[list.length - 1];
}

/**
 * Seeded scatter of trees, bushes, rocks, grass and flowers over the whole planet. Candidates are
 * rejected on roads, in water, on steep rock and near anything that already has a collider, so
 * plants never grow through buildings or block paths.
 */
export function scatterVegetation(world: World, content: WorldContent, quality: 'low' | 'medium' | 'high'): void {
  const rng = new Rng('vegetation-v1');
  const noise = world.layout.shape.noise;
  const R = PLANET_RADIUS;
  const area = 4 * Math.PI * R * R;
  const big = Math.round(area / 22);
  const smallMul = quality === 'low' ? 0.35 : quality === 'medium' ? 0.7 : 1;
  const small = Math.round((area / 3.2) * smallMul);
  const d = new Vector3();
  const e = new Vector3();
  const n = new Vector3();
  const nrm = new Vector3();
  const near: any[] = [];

  const accept = (dir: Vector3, clearance: number): { h: number; region: RegionId; w: number } | null => {
    const h = world.heightfield.heightAt(dir);
    if (h < SEA_LEVEL + 0.55) return null;
    world.heightfield.normalAt(dir, nrm);
    if (nrm.dot(dir) < 0.86) return null; // too steep
    if (world.biomes.roads.onRoad(dir, clearance)) return null;
    near.length = 0;
    world.collision.near(e.copy(dir).multiplyScalar(R + h), clearance + 3.5, near);
    for (const c of near) {
      const dist = c.center.distanceTo(dir) * R;
      const reach = c.kind === 'circle' ? c.radius : Math.hypot(c.hx, c.hz);
      if (dist < reach + clearance) return null;
    }
    const reg = world.biomes.regionAt(dir);
    return { h, region: reg.id, w: reg.weight };
  };

  // Trees, bushes, rocks.
  for (let i = 0; i < big; i++) {
    randomDir(rng, d);
    const t = TABLES[world.biomes.regionAt(d).id];
    const forestN = noise.noise3(d.x * 5.5 + 7, d.y * 5.5, d.z * 5.5 - 3) * 0.5 + 0.5;
    const density = t.trees * (1 - t.forest + t.forest * Math.pow(forestN, 2.2) * 2.4);
    if (rng.next() > Math.min(1, density * 0.55)) continue;
    // City core stays clear (streets have planters instead).
    const cityLoc = world.layout.get('city').frame.local(d);
    if (Math.hypot(cityLoc.x, cityLoc.y) < 33) continue;
    const ok = accept(d, 1.6);
    if (!ok) continue;
    const entry = pick(rng, t.big);
    tangentFrame(d, e, n);
    const a = rng.next() * Math.PI * 2;
    const fwd = n.clone().multiplyScalar(Math.cos(a)).addScaledVector(e, Math.sin(a));
    const xAxis = new Vector3().crossVectors(d, fwd).normalize();
    content.instantiate(entry.kind, d.clone(), xAxis, fwd, ok.h - 0.05, entry.params ?? {}, `veg${i}`);
  }

  // Ground cover.
  for (let i = 0; i < small; i++) {
    randomDir(rng, d);
    const t = TABLES[world.biomes.regionAt(d).id];
    if (!t.small.length) continue;
    const meadow = noise.noise3(d.x * 9 - 2, d.y * 9 + 5, d.z * 9) * 0.5 + 0.5;
    if (rng.next() > t.ground * (0.25 + meadow * 0.9) * 0.6) continue;
    const ok = accept(d, 0.5);
    if (!ok) continue;
    const cityLoc = world.layout.get('city').frame.local(d);
    if (Math.hypot(cityLoc.x, cityLoc.y) < 24) continue;
    const entry = pick(rng, t.small);
    tangentFrame(d, e, n);
    const xAxis = new Vector3().crossVectors(d, n).normalize();
    content.instantiate(entry.kind, d.clone(), xAxis, n.clone(), ok.h - 0.02, entry.params ?? {}, `gc${i}`);
  }
}

function randomDir(rng: Rng, out: Vector3): Vector3 {
  const z = rng.range(-1, 1);
  const a = rng.next() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return out.set(r * Math.cos(a), z, r * Math.sin(a));
}
