import { Vector3 } from 'three';
import { latLonToDir } from '../../core/math/sphere';
import { PLANET_RADIUS } from '../constants';
import { RegionFrame } from '../RegionFrame';
import { PadFeature, RoadFeature, TerrainShape } from '../terrain/TerrainShape';
import { OverlayPainter } from '../terrain/Overlay';
import type { SurfaceMaterial } from '../Collision';

export type RegionId = 'city' | 'hills' | 'coast' | 'mining' | 'heights' | 'woods' | 'south' | 'wilds';

export interface RegionInfo {
  id: RegionId;
  name: string;
  subtitle: string;
  frame: RegionFrame;
  radius: number;
  grass: [string, string];
  ground: SurfaceMaterial;
}

export interface RoadStyle {
  width: number;
  color: string;
  edge?: { width: number; color: string };
  center?: { width: number; color: string; dash: number; gap: number };
  falloff: number;
  material: SurfaceMaterial;
  strength?: number;
  /** Stacking layer for overlapping road meshes (sidewalks 0, streets 1). */
  layer?: number;
}

export const ROAD_STYLES = {
  avenue: {
    width: 3.6,
    color: '#a59c92',
    edge: { width: 4.4, color: '#d9cfbf' },
    center: { width: 0.14, color: '#f3e9cf', dash: 1.4, gap: 1.2 },
    falloff: 3,
    material: 'stone',
    layer: 2,
  },
  street: { width: 2.6, color: '#b5aa9c', edge: { width: 3.1, color: '#ddd3c2' }, falloff: 2.2, material: 'stone' },
  lane: { width: 1.8, color: '#c7b9a3', edge: { width: 2.2, color: '#ddd0bb' }, falloff: 1.8, material: 'stone' },
  path: { width: 1.7, color: '#c8a77a', edge: { width: 2.3, color: '#b9a073' }, falloff: 1.6, material: 'dirt', strength: 0.7 },
  trail: { width: 1.2, color: '#c3a57c', falloff: 1.2, material: 'dirt', strength: 0.5 },
  industrial: { width: 3.4, color: '#8f8d88', edge: { width: 4, color: '#b8b2a5' }, center: { width: 0.16, color: '#e8c95a', dash: 2, gap: 1.5 }, falloff: 2.5, material: 'stone', layer: 1.5 },
  sandbar: { width: 3, color: '#ecd9a8', falloff: 3.5, material: 'sand' },
  sidewalk: { width: 7.6, color: '#d8cdbb', falloff: 2.5, material: 'stone', layer: 0 },
  plazaPath: { width: 3.2, color: '#dccfb9', edge: { width: 3.8, color: '#c8baa2' }, falloff: 2, material: 'stone' },
  boardwalk: { width: 2.2, color: '#b88a5e', edge: { width: 2.6, color: '#8d6646' }, falloff: 1.5, material: 'wood' },
  snowpath: { width: 1.8, color: '#dfe6ec', edge: { width: 2.3, color: '#cfd8df' }, falloff: 1.8, material: 'snow', strength: 0.7 },
} satisfies Record<string, RoadStyle>;

export interface RoadDef {
  id: string;
  points: Vector3[];
  style: RoadStyle;
  flatten: boolean;
  fixedHeight?: number;
}

export interface DecalDef {
  center: Vector3;
  xDir: Vector3;
  yDir: Vector3;
  half: number;
  res: number;
  draw: (ctx: CanvasRenderingContext2D, half: number) => void;
}

export interface Placement {
  id?: string;
  kind: string;
  region: RegionId;
  pos: Vector3;
  xAxis: Vector3;
  up: Vector3;
  forward: Vector3;
  params: Record<string, any>;
  /** Fixed base height relative to PLANET_RADIUS; otherwise sampled from the ground. */
  base?: number;
}

/** Catmull-Rom spline through unit vectors, resampled every `spacing` world units. */
export function densifyPath(ctrl: Vector3[], spacing = 1, closed = false): Vector3[] {
  const pts = ctrl.map((p) => p.clone().normalize());
  const n = pts.length;
  const get = (i: number) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const out: Vector3[] = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const len = p1.distanceTo(p2) * PLANET_RADIUS;
    const steps = Math.max(1, Math.ceil(len / spacing));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t, t3 = t2 * t;
      const v = new Vector3()
        .addScaledVector(p0, -0.5 * t3 + t2 - 0.5 * t)
        .addScaledVector(p1, 1.5 * t3 - 2.5 * t2 + 1)
        .addScaledVector(p2, -1.5 * t3 + 2 * t2 + 0.5 * t)
        .addScaledVector(p3, 0.5 * t3 - 0.5 * t2)
        .normalize();
      out.push(v);
    }
  }
  if (!closed) out.push(get(n - 1).clone());
  else out.push(out[0].clone());
  return out;
}

export function ll(lat: number, lon: number): Vector3 {
  return latLonToDir(lat, lon);
}

/**
 * Collects the authored description of the planet: regions, terrain features, roads, flatten pads,
 * ground artwork and object placements. Pure data — no meshes are created here, so the layout can
 * shape the terrain before anything is built on it, and it can be validated in unit tests.
 */
export class LayoutBuilder {
  readonly regions = new Map<RegionId, RegionInfo>();
  readonly shape = new TerrainShape();
  readonly roads: RoadDef[] = [];
  readonly pads: PadFeature[] = [];
  readonly overlayOps: { order: number; fn: (p: OverlayPainter) => void }[] = [];
  readonly placements: Placement[] = [];
  readonly decals: DecalDef[] = [];

  region(info: RegionInfo): RegionInfo {
    this.regions.set(info.id, info);
    return info;
  }

  get(id: RegionId): RegionInfo {
    const r = this.regions.get(id);
    if (!r) throw new Error(`Unknown region ${id}`);
    return r;
  }

  /** Adds a road through control points (unit vectors). */
  road(id: string, ctrl: Vector3[], style: RoadStyle, opts: { closed?: boolean; flatten?: boolean; fixedHeight?: number; spacing?: number } = {}): RoadDef {
    const points = densifyPath(ctrl, opts.spacing ?? 1, opts.closed ?? false);
    const def: RoadDef = { id, points, style, flatten: opts.flatten ?? true, fixedHeight: opts.fixedHeight };
    this.roads.push(def);
    return def;
  }

  /** Region-local road helper: points given as [x, y] metres in the region frame. */
  localRoad(region: RegionId, id: string, pts: [number, number][], style: RoadStyle, opts: { closed?: boolean; flatten?: boolean; fixedHeight?: number } = {}): RoadDef {
    const f = this.get(region).frame;
    return this.road(id, pts.map(([x, y]) => f.dir(x, y)), style, opts);
  }

  /** Places a kit object at region-local (x, y) with heading in degrees (0 = north, 90 = east). */
  place(region: RegionId, kind: string, x: number, y: number, heading: number, params: Record<string, any> = {}, opts: { id?: string; pad?: { hx: number; hz: number; falloff?: number; round?: number; strength?: number; offset?: number }; base?: number } = {}): Placement {
    const f = this.get(region).frame;
    const b = f.basis(x, y, heading);
    const p: Placement = { id: opts.id, kind, region, pos: b.pos, xAxis: b.xAxis, up: b.up, forward: b.forward, params, base: opts.base };
    this.placements.push(p);
    if (opts.pad) {
      this.pads.push({
        center: b.pos,
        xAxis: b.xAxis,
        zAxis: b.forward,
        hx: opts.pad.hx,
        hz: opts.pad.hz,
        round: opts.pad.round,
        falloff: opts.pad.falloff ?? 2.5,
        strength: opts.pad.strength,
        priority: 2,
      });
    }
    return p;
  }

  /** Circular / rectangular flatten area in region coordinates. */
  flatten(region: RegionId, x: number, y: number, opts: { radius?: number; hx?: number; hz?: number; heading?: number; falloff: number; height?: number; strength?: number; priority?: number }): void {
    const f = this.get(region).frame;
    const b = f.basis(x, y, opts.heading ?? 0);
    this.pads.push({
      center: b.pos,
      xAxis: b.xAxis,
      zAxis: b.forward,
      hx: opts.hx ?? 0,
      hz: opts.hz ?? 0,
      round: opts.radius,
      falloff: opts.falloff,
      height: opts.height,
      strength: opts.strength,
      priority: opts.priority ?? 1,
    });
  }

  /** Ground artwork centred at region-local (x, y); canvas units are world units with +y = heading. */
  decal(region: RegionId, x: number, y: number, heading: number, half: number, draw: DecalDef['draw'], res = 1024): void {
    const b = this.get(region).frame.basis(x, y, heading);
    // Art +x = east-like axis (−xAxis because xAxis is up × forward), +y = forward.
    this.decals.push({ center: b.pos, xDir: b.xAxis.clone().negate(), yDir: b.forward, half, res, draw });
  }

  /** Places a sequence of kits along a polyline (region-local points) every `spacing` units, offset sideways. */
  along(region: RegionId, kind: string, pts: [number, number][], spacing: number, side: number, params: Record<string, any> = {}, opts: { start?: number; faceRoad?: boolean; both?: boolean } = {}): void {
    let next = opts.start ?? spacing / 2;
    let walked = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len < 1e-6) continue;
      const dx = (x1 - x0) / len, dy = (y1 - y0) / len;
      const heading = (Math.atan2(dx, dy) * 180) / Math.PI;
      while (next <= walked + len) {
        const t = next - walked;
        const px = x0 + dx * t, py = y0 + dy * t;
        for (const s of opts.both ? [side, -side] : [side]) {
          // Right-hand normal of (dx, dy) is (dy, -dx).
          const ox = px + dy * s, oy = py - dx * s;
          const face = opts.faceRoad ? heading + (s > 0 ? -90 : 90) : heading;
          this.place(region, kind, ox, oy, face, params);
        }
        next += spacing;
      }
      walked += len;
    }
  }

  overlay(fn: (p: OverlayPainter) => void, order = 0): void {
    this.overlayOps.push({ order, fn });
  }

  /** Finalises terrain: registers pads then roads (roads smooth over the padded ground). */
  finalizeTerrain(): void {
    this.shape.setPads(this.pads);
    const feats: RoadFeature[] = this.roads
      .filter((r) => r.flatten)
      .map((r) => ({
        points: r.points,
        width: r.style.edge ? r.style.edge.width : r.style.width,
        falloff: r.style.falloff,
        strength: r.style.strength ?? 1,
        fixedHeight: r.fixedHeight,
        smoothWindow: 5,
      }));
    this.shape.setRoads(feats);
  }

  /** Paints all roads and registered overlay operations. */
  paintOverlay(p: OverlayPainter): void {
    const ops = [...this.overlayOps].sort((a, b) => a.order - b.order);
    for (const op of ops.filter((o) => o.order < 0)) op.fn(p);
    // Paved roads are meshes (RoadMesh); here they only get a soft worn shoulder. Dirt paths,
    // sandbars and snow trails are painted fully — their soft edges suit the overlay resolution.
    const paved = (r: RoadDef) => r.style.material === 'stone' || r.style.material === 'metal' || r.style.material === 'wood';
    for (const r of this.roads) if (paved(r)) p.ribbon(r.points, (r.style.edge?.width ?? r.style.width) + 1.8, 'rgba(176,158,118,0.42)');
    for (const r of this.roads) if (!paved(r) && r.style.edge) p.ribbon(r.points, r.style.edge.width, r.style.edge.color);
    for (const r of this.roads) if (!paved(r)) p.ribbon(r.points, r.style.width, r.style.color);
    for (const op of ops.filter((o) => o.order >= 0)) op.fn(p);
  }
}
