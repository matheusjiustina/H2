import { Vector3 } from 'three';
import { Rng } from '../../core/math/random';
import { GeoBuilder } from '../kit/GeoBuilder';
import { ScreenKind } from '../../render/ScreenContent';
import { SignSpec } from '../../render/Atlases';
import { SurfaceMaterial } from '../Collision';

export type Vec3 = [number, number, number];

/** Collider authored in kit-local units (x, z on the ground plane, y up from the base). */
export type KitCollider =
  | { type: 'box'; x: number; z: number; hx: number; hz: number; h: number; y0?: number; rot?: number; camera?: boolean; tag?: string }
  | { type: 'circle'; x: number; z: number; r: number; h: number; y0?: number; tag?: string };

export interface KitSurface {
  x: number;
  z: number;
  hx: number;
  hz: number;
  y0: number; // height at local -z edge
  y1: number; // height at local +z edge
  rot?: number;
  material?: SurfaceMaterial;
}

export interface KitInteract {
  id: string;
  kind: string;
  label: string;
  x: number;
  y: number;
  z: number;
  heading?: number; // radians around local Y; direction the player should face when using it
  radius?: number;
  data?: Record<string, any>;
}

/**
 * The API every kit function (building, prop, tree…) uses. Coordinates are local to the placement:
 * +Y up, +Z forward (the placement's heading), +X = up × forward.
 */
export interface KitCtx {
  g: GeoBuilder;
  /** Geometry that rotates about `pivot` around `axis` at `speed` rad/s, animated on the GPU. */
  spin(build: (g: GeoBuilder) => void, pivot: Vec3, axis: Vec3, speed: number): void;
  /** Gentle bobbing (boats, buoys) animated on the GPU. */
  bob(build: (g: GeoBuilder) => void, amplitude: number, speed: number): void;
  collider(c: KitCollider): void;
  surface(s: KitSurface): void;
  screen(x: number, y: number, z: number, w: number, h: number, rotY: number, kind: ScreenKind, seed?: string, span?: number): void;
  sign(x: number, y: number, z: number, w: number, h: number, rotY: number, spec: Omit<SignSpec, 'width' | 'height'>, opts?: { tiltX?: number; double?: boolean; depth?: number }): void;
  lamp(x: number, y: number, z: number, radius?: number): void;
  anchor(name: string, x: number, y: number, z: number, headingRad?: number): void;
  interact(spec: KitInteract): void;
  /** Grass / flowers that fade with distance (no shadows). */
  grass: GeoBuilder;
  rng: Rng;
  params: Record<string, any>;
  id: string;
  /** World up at the placement (for kits that need to know orientation). */
  up: Vector3;
}

export type KitFn = (ctx: KitCtx) => void;

const registry = new Map<string, KitFn>();

export function defineKit(name: string, fn: KitFn): void {
  registry.set(name, fn);
}

export function getKit(name: string): KitFn {
  const k = registry.get(name);
  if (!k) throw new Error(`Unknown kit "${name}"`);
  return k;
}

export function hasKit(name: string): boolean {
  return registry.has(name);
}

export function kitNames(): string[] {
  return [...registry.keys()];
}
