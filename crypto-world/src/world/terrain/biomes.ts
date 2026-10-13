import { Color, Vector3 } from 'three';
import { smoothstep } from '../../core/math/sphere';
import { PLANET_RADIUS, SEA_LEVEL } from '../constants';
import { LayoutBuilder, RegionId, RoadDef } from '../layout/LayoutBuilder';
import { SphereHash } from '../SphereHash';
import type { SurfaceMaterial } from '../Collision';

interface RoadSeg {
  a: Vector3;
  b: Vector3;
  road: RoadDef;
}

/** Spatial index over all road centre-lines. */
export class RoadIndex {
  private hash = new SphereHash<RoadSeg>(5);
  private buf: RoadSeg[] = [];
  private seen = new Set<RoadSeg>();
  private tmp = new Vector3();

  constructor(roads: RoadDef[]) {
    for (const r of roads) {
      for (let i = 0; i < r.points.length - 1; i++) {
        const seg = { a: r.points[i], b: r.points[i + 1], road: r };
        const mid = new Vector3().addVectors(seg.a, seg.b).multiplyScalar(0.5 * PLANET_RADIUS);
        this.hash.insert(seg, mid, seg.a.distanceTo(seg.b) * PLANET_RADIUS * 0.5 + 4);
      }
    }
  }

  /** Nearest road (centre-line distance in world units) within `maxDist`, or null. */
  nearest(d: Vector3, maxDist = 4): { dist: number; road: RoadDef } | null {
    const p = this.tmp.copy(d).normalize().multiplyScalar(PLANET_RADIUS);
    this.buf.length = 0;
    this.seen.clear();
    this.hash.query(p, maxDist, this.buf, this.seen);
    let best: { dist: number; road: RoadDef } | null = null;
    const dn = d.clone().normalize();
    const ab = new Vector3();
    for (const s of this.buf) {
      ab.subVectors(s.b, s.a);
      const l2 = ab.lengthSq();
      let t = l2 > 0 ? dn.clone().sub(s.a).dot(ab) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const c = s.a.clone().addScaledVector(ab, t);
      const dist = c.distanceTo(dn) * PLANET_RADIUS;
      if (dist <= maxDist && (!best || dist < best.dist)) best = { dist, road: s.road };
    }
    return best;
  }

  /** True if d lies on a road surface (including its edge/shoulder) plus a margin. */
  onRoad(d: Vector3, margin = 0): boolean {
    const n = this.nearest(d, 4 + margin);
    if (!n) return false;
    const half = (n.road.style.edge?.width ?? n.road.style.width) / 2;
    return n.dist <= half + margin;
  }
}

export interface Biomes {
  colorAt(d: Vector3, h: number, normal: Vector3, out: Color): void;
  materialAt(d: Vector3): SurfaceMaterial;
  regionAt(d: Vector3): { id: RegionId; weight: number };
  roads: RoadIndex;
}

const SAND = new Color('#ecdcaa');
const WET_SAND = new Color('#d7c38f');
const SEA_FLOOR = new Color('#7fb6a8');
const DEEP_FLOOR = new Color('#4f8a8e');
const ROCK = new Color('#a89f92');
const ROCK_DARK = new Color('#8d857a');
const WILD_A = new Color('#97c55f');
const WILD_B = new Color('#7eb453');
const SNOW_A = new Color('#f1f6f9');

export function createBiomes(L: LayoutBuilder): Biomes {
  const regions = [...L.regions.values()];
  const palettes = regions.map((r) => [new Color(r.grass[0]), new Color(r.grass[1])]);
  const noise = L.shape.noise;
  const roads = new RoadIndex(L.roads);
  const tmpA = new Color();
  const tmpB = new Color();
  const hsl = { h: 0, s: 0, l: 0 };

  function weights(d: Vector3): number[] {
    return regions.map((r) => {
      const dist = Math.acos(Math.min(1, d.dot(r.frame.center))) * PLANET_RADIUS;
      return 1 - smoothstep(r.radius * 0.65, r.radius * 1.3, dist);
    });
  }

  function colorAt(d: Vector3, h: number, normal: Vector3, out: Color): void {
    const w = weights(d);
    const n = noise.noise3(d.x * 9, d.y * 9, d.z * 9) * 0.5 + 0.5;
    const n2 = noise.noise3(d.x * 23 + 3, d.y * 23, d.z * 23 - 7) * 0.5 + 0.5;
    const mixT = Math.min(1, Math.max(0, n * 0.8 + n2 * 0.35 - 0.1));
    // Wilderness base.
    out.copy(WILD_A).lerp(WILD_B, mixT);
    let total = 0.35;
    out.multiplyScalar(0.35);
    for (let i = 0; i < regions.length; i++) {
      if (w[i] <= 0) continue;
      tmpA.copy(palettes[i][0]).lerp(palettes[i][1], mixT).multiplyScalar(w[i]);
      out.add(tmpA);
      total += w[i];
    }
    out.multiplyScalar(1 / total);
    // Painted-background greens: a touch less saturated and deeper than a toy palette.
    out.getHSL(hsl);
    out.setHSL(hsl.h + 0.012, hsl.s * 0.82, hsl.l * 0.95);

    // Polar snow regardless of region weighting.
    const lat = Math.asin(d.y) * (180 / Math.PI);
    const snow = smoothstep(-58, -68, lat);
    if (snow > 0) out.lerp(SNOW_A, snow);

    // Steep slopes show rock.
    const slope = 1 - Math.max(0, normal.dot(d));
    const rock = smoothstep(0.22, 0.28, slope);
    if (rock > 0) {
      tmpB.copy(ROCK).lerp(ROCK_DARK, n2);
      out.lerp(tmpB, rock * (1 - snow * 0.7));
    }

    // Shorelines and sea floor.
    if (h < SEA_LEVEL + 1.3) {
      const beach = smoothstep(SEA_LEVEL + 1.0, SEA_LEVEL + 0.82, h);
      out.lerp(SAND, beach * (1 - snow * 0.8));
      if (h < SEA_LEVEL + 0.15) {
        out.lerp(WET_SAND, smoothstep(SEA_LEVEL + 0.15, SEA_LEVEL - 0.3, h));
      }
      if (h < SEA_LEVEL - 0.3) {
        tmpB.copy(SEA_FLOOR).lerp(DEEP_FLOOR, smoothstep(SEA_LEVEL - 1, SEA_LEVEL - 7, h));
        out.lerp(tmpB, smoothstep(SEA_LEVEL - 0.3, SEA_LEVEL - 1.4, h));
      }
    }
  }

  function regionAt(d: Vector3): { id: RegionId; weight: number } {
    const w = weights(d);
    let best = -1, bw = 0;
    for (let i = 0; i < w.length; i++) if (w[i] > bw) { bw = w[i]; best = i; }
    if (best < 0 || bw < 0.35) return { id: 'wilds', weight: 1 - bw };
    return { id: regions[best].id, weight: bw };
  }

  function materialAt(d: Vector3): SurfaceMaterial {
    const r = roads.nearest(d, 3);
    if (r && r.dist <= (r.road.style.edge?.width ?? r.road.style.width) / 2) return r.road.style.material;
    const lat = Math.asin(Math.max(-1, Math.min(1, d.y))) * (180 / Math.PI);
    if (lat < -63) return 'snow';
    const h = L.shape.regional(d);
    if (h < SEA_LEVEL + 1.0) return 'sand';
    const reg = regionAt(d);
    if (reg.id === 'city' && reg.weight > 0.8) return 'stone';
    return 'grass';
  }

  return { colorAt, materialAt, regionAt, roads };
}
