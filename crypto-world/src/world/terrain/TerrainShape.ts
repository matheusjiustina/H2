import { Vector3 } from 'three';
import { SimplexNoise } from '../../core/math/noise';
import { smoothstep } from '../../core/math/sphere';
import { PLANET_RADIUS, SEA_LEVEL, WORLD_SEED } from '../constants';
import { SphereHash } from '../SphereHash';

/**
 * Analytic description of the planet's ground. Everything is expressed as a height (world units)
 * relative to PLANET_RADIUS for a unit direction. The function is deterministic and is baked once
 * into the Heightfield, which both physics and rendering read, so they always agree exactly.
 */

export interface OceanFeature {
  center: Vector3;
  radius: number; // shoreline distance from centre, world units
  depth: number; // floor height (negative)
  beachWidth: number;
  coastNoise: number;
}
export interface HillsFeature {
  center: Vector3;
  radius: number;
  amplitude: number;
  frequency: number;
}
export interface PlateauFeature {
  center: Vector3;
  innerRadius: number;
  outerRadius: number;
  height: number;
}
export interface BumpFeature {
  center: Vector3;
  radius: number; // footprint radius where the bump fades to zero
  height: number;
  flatTop?: number; // radius of a flat summit
}
export interface IslandFeature {
  center: Vector3;
  radius: number;
  height: number;
}
export interface PadFeature {
  center: Vector3;
  xAxis: Vector3;
  zAxis: Vector3;
  hx: number;
  hz: number;
  round?: number; // corner rounding / circle radius when hx = hz = 0
  falloff: number;
  /** Absolute height relative to PLANET_RADIUS. Sampled from the ground beneath when omitted. */
  height?: number;
  strength?: number;
  priority?: number;
}
export interface RoadFeature {
  points: Vector3[]; // unit directions, roughly evenly spaced
  width: number;
  falloff: number;
  strength?: number;
  fixedHeight?: number;
  smoothWindow?: number; // samples either side for profile smoothing
}

interface PreparedPad extends PadFeature {
  h: number;
  reach: number;
  order: number;
}
interface RoadSeg {
  a: Vector3;
  b: Vector3;
  ha: number;
  hb: number;
  halfWidth: number;
  falloff: number;
  strength: number;
}

const _t = new Vector3();
const _p = new Vector3();

export class TerrainShape {
  readonly noise = new SimplexNoise(WORLD_SEED);
  readonly detailNoise = new SimplexNoise(WORLD_SEED + ':detail');
  oceans: OceanFeature[] = [];
  hills: HillsFeature[] = [];
  plateaus: PlateauFeature[] = [];
  bumps: BumpFeature[] = [];
  islands: IslandFeature[] = [];
  private pads: PreparedPad[] = [];
  private padHash = new SphereHash<PreparedPad>(8);
  private roadHash = new SphereHash<RoadSeg>(5);
  private qPads: PreparedPad[] = [];
  private qSeen = new Set<PreparedPad>();
  private qSegs: RoadSeg[] = [];
  private qSeenSeg = new Set<RoadSeg>();

  /** Rolling base landscape: gentle, always above sea level away from oceans. */
  base(d: Vector3): number {
    const n1 = this.noise.fbm(d.x * 1.7, d.y * 1.7, d.z * 1.7, 4);
    const n2 = this.detailNoise.fbm(d.x * 6, d.y * 6, d.z * 6, 3);
    return 0.95 + 0.75 * n1 + 0.28 * n2;
  }

  /** Base plus large regional shaping (oceans, hills, plateaus, bumps, islands). */
  regional(d: Vector3): number {
    let h = this.base(d);
    const R = PLANET_RADIUS;
    for (const hl of this.hills) {
      const dist = Math.acos(Math.min(1, d.dot(hl.center))) * R;
      if (dist > hl.radius) continue;
      const w = smoothstep(hl.radius, hl.radius * 0.35, dist);
      const f = hl.frequency;
      const n = this.noise.fbm(d.x * f + 11.3, d.y * f - 4.1, d.z * f + 2.7, 3) * 0.5 + 0.5;
      h += w * Math.pow(Math.max(0, n), 1.5) * hl.amplitude;
    }
    for (const pl of this.plateaus) {
      const dist = Math.acos(Math.min(1, d.dot(pl.center))) * R;
      if (dist > pl.outerRadius) continue;
      h += pl.height * smoothstep(pl.outerRadius, pl.innerRadius, dist);
    }
    for (const b of this.bumps) {
      const dist = Math.acos(Math.min(1, d.dot(b.center))) * R;
      if (dist > b.radius) continue;
      const inner = b.flatTop ?? 0;
      h += b.height * smoothstep(b.radius, inner, dist);
    }
    for (const o of this.oceans) {
      const dist = Math.acos(Math.min(1, d.dot(o.center))) * R;
      const shore = o.radius + o.coastNoise * this.noise.noise3(d.x * 3.1 + 5, d.y * 3.1, d.z * 3.1 - 2);
      const s = shore - dist; // positive = inside water body
      if (s < -o.beachWidth) continue;
      if (s <= 0) {
        // Beach: rises from sea level toward the natural ground over beachWidth.
        const t = -s / o.beachWidth;
        const beach = SEA_LEVEL + 0.25 + t * 0.9;
        h = h * smoothstep(0.35, 1, t) + beach * (1 - smoothstep(0.35, 1, t));
        h = Math.min(h, beach + t * 2.5);
      } else {
        const floor = SEA_LEVEL + 0.25 - s * 0.32;
        h = Math.max(o.depth + 0.6 * this.detailNoise.noise3(d.x * 9, d.y * 9, d.z * 9), floor);
      }
    }
    for (const is of this.islands) {
      const dist = Math.acos(Math.min(1, d.dot(is.center))) * R;
      if (dist > is.radius * 2.2) continue;
      const prof = is.height - Math.pow(dist / is.radius, 2) * (is.height - SEA_LEVEL - 0.1);
      const n = 0.25 * this.detailNoise.noise3(d.x * 14, d.y * 14, d.z * 14);
      h = Math.max(h, prof + n);
    }
    return h;
  }

  /** Registers flattening pads (building footprints, plazas). Lower priority pads are applied first. */
  setPads(pads: PadFeature[]): void {
    this.pads = [];
    this.padHash.clear();
    const sorted = [...pads].sort((a, b) => (a.priority ?? 1) - (b.priority ?? 1));
    for (const p of sorted) {
      const reach = Math.max(p.hx, p.hz) + (p.round ?? 0) + p.falloff + 0.5;
      const prepared: PreparedPad = { ...p, h: 0, reach, order: this.pads.length };
      // Height sampled from the ground as shaped by all previously registered (lower priority) pads.
      prepared.h = p.height ?? this.withPads(p.center);
      this.pads.push(prepared);
      _p.copy(p.center).multiplyScalar(PLANET_RADIUS);
      this.padHash.insert(prepared, _p, reach);
    }
  }

  private padWeight(p: PreparedPad, d: Vector3): number {
    _t.copy(d).sub(p.center);
    const x = Math.abs(_t.dot(p.xAxis) * PLANET_RADIUS);
    const z = Math.abs(_t.dot(p.zAxis) * PLANET_RADIUS);
    const dx = Math.max(0, x - p.hx);
    const dz = Math.max(0, z - p.hz);
    const dist = Math.max(0, Math.hypot(dx, dz) - (p.round ?? 0));
    return (1 - smoothstep(0, p.falloff, dist)) * (p.strength ?? 1);
  }

  withPads(d: Vector3): number {
    let h = this.regional(d);
    if (this.pads.length === 0) return h;
    _p.copy(d).multiplyScalar(PLANET_RADIUS);
    this.qPads.length = 0;
    this.qSeen.clear();
    this.padHash.query(_p, 0.1, this.qPads, this.qSeen);
    if (this.qPads.length > 1) this.qPads.sort((a, b) => a.order - b.order);
    for (const p of this.qPads) {
      const w = this.padWeight(p, d);
      if (w > 0) h += (p.h - h) * w;
    }
    return h;
  }

  /** Registers roads; their height profile is smoothed so they climb hills gracefully without side tilt. */
  setRoads(roads: RoadFeature[]): void {
    this.roadHash.clear();
    for (const r of roads) {
      const n = r.points.length;
      if (n < 2) continue;
      const raw = r.points.map((p) => (r.fixedHeight !== undefined ? r.fixedHeight : this.withPads(p)));
      const win = r.smoothWindow ?? 4;
      const prof = raw.map((_, i) => {
        if (r.fixedHeight !== undefined) return r.fixedHeight;
        let s = 0, c = 0;
        for (let k = -win; k <= win; k++) {
          const j = Math.min(n - 1, Math.max(0, i + k));
          const w = 1 - Math.abs(k) / (win + 1);
          s += raw[j] * w;
          c += w;
        }
        return s / c;
      });
      for (let i = 0; i < n - 1; i++) {
        const seg: RoadSeg = {
          a: r.points[i],
          b: r.points[i + 1],
          ha: prof[i],
          hb: prof[i + 1],
          halfWidth: r.width / 2,
          falloff: r.falloff,
          strength: r.strength ?? 1,
        };
        const mid = new Vector3().addVectors(seg.a, seg.b).multiplyScalar(0.5 * PLANET_RADIUS);
        const segLen = seg.a.distanceTo(seg.b) * PLANET_RADIUS;
        this.roadHash.insert(seg, mid, segLen / 2 + seg.halfWidth + seg.falloff);
      }
    }
  }

  /** Final terrain height. */
  height(d: Vector3): number {
    const h = this.withPads(d);
    _p.copy(d).multiplyScalar(PLANET_RADIUS);
    this.qSegs.length = 0;
    this.qSeenSeg.clear();
    this.roadHash.query(_p, 0.1, this.qSegs, this.qSeenSeg);
    if (this.qSegs.length === 0) return h;
    let sw = 0, swh = 0, maxW = 0;
    for (const s of this.qSegs) {
      // Closest point on chord segment (adequate at road scale).
      _t.copy(s.b).sub(s.a);
      const len2 = _t.lengthSq();
      let t = len2 > 0 ? (d.x - s.a.x) * _t.x + (d.y - s.a.y) * _t.y + (d.z - s.a.z) * _t.z : 0;
      t = len2 > 0 ? Math.min(1, Math.max(0, t / len2)) : 0;
      const cx = s.a.x + _t.x * t - d.x, cy = s.a.y + _t.y * t - d.y, cz = s.a.z + _t.z * t - d.z;
      const dist = Math.sqrt(cx * cx + cy * cy + cz * cz) * PLANET_RADIUS;
      const w = (1 - smoothstep(s.halfWidth, s.halfWidth + s.falloff, dist)) * s.strength;
      if (w <= 0) continue;
      const ph = s.ha + (s.hb - s.ha) * t;
      sw += w;
      swh += w * ph;
      if (w > maxW) maxW = w;
    }
    if (sw <= 0) return h;
    return h + (swh / sw - h) * Math.min(1, maxW);
  }
}
