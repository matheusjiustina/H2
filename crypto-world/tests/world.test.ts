import { beforeAll, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { buildLayout } from '../src/world/regions/index';
import { World } from '../src/world/World';
import { gridDir } from '../src/world/terrain/Heightfield';
import { PLANET_RADIUS, SEA_LEVEL } from '../src/world/constants';
import { PlayerController } from '../src/player/PlayerController';
import type { RegionId } from '../src/world/layout/LayoutBuilder';

const R = PLANET_RADIUS;
let world: World;

beforeAll(() => {
  world = new World(buildLayout());
}, 60000);

function randomDirs(n: number, seed = 1): Vector3[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const out: Vector3[] = [];
  while (out.length < n) {
    const v = new Vector3(rnd(), rnd(), rnd());
    if (v.lengthSq() > 0.01 && v.lengthSq() <= 1) out.push(v.normalize());
  }
  return out;
}

describe('planet terrain', () => {
  it('is deterministic for the world seed', () => {
    const other = buildLayout();
    other.finalizeTerrain();
    for (const d of randomDirs(300, 7)) expect(other.shape.height(d)).toBe(world.layout.shape.height(d));
  });

  it('samples the baked heightfield exactly at grid vertices and never returns NaN', () => {
    const hf = world.heightfield;
    const d = new Vector3();
    for (let face = 0; face < 6; face++)
      for (const [i, j] of [[0, 0], [5, 9], [64, 64], [100, 3], [127, 127]]) {
        gridDir(face, i, j, hf.N, d);
        expect(hf.heightAt(d)).toBeCloseTo(hf.vertexHeight(face, i, j), 4);
      }
    for (const v of randomDirs(2000, 3)) expect(Number.isFinite(hf.heightAt(v))).toBe(true);
  });

  it('keeps every region centre on dry land and joins regions with one ring road', () => {
    for (const id of ['city', 'hills', 'coast', 'mining', 'heights', 'woods', 'south'] as RegionId[]) {
      const c = world.layout.get(id).frame.basis(0, 0, 0).pos.clone().normalize();
      expect(world.groundHeight(c), id).toBeGreaterThan(SEA_LEVEL + 0.2);
    }
    const ring = world.layout.roads.find((r) => r.id === 'the-chain');
    expect(ring).toBeTruthy();
    // The ring road stays above water along its whole length.
    for (const p of ring!.points) expect(world.groundHeight(p.clone().normalize())).toBeGreaterThan(SEA_LEVEL);
  });
});

describe('player on the sphere', () => {
  it('walks a full great circle on bare terrain and stays glued to the ground', () => {
    const p = new PlayerController(world.collision, () => 'grass');
    const start = world.layout.get('city').frame.basis(0, -12.3, 90);
    p.teleport(start.pos, start.forward);
    const s0 = p.dir.clone();
    const axis = new Vector3().crossVectors(s0, p.facing).normalize();
    let travelled = 0;
    let maxDev = 0;
    const last = p.dir.clone();
    const dt = 1 / 30;
    for (let i = 0; i < 30 * 150 && travelled < 2 * Math.PI * R; i++) {
      const ahead = new Vector3().crossVectors(axis, p.dir).normalize();
      p.update(dt, ahead, true, false);
      travelled += last.angleTo(p.dir) * R;
      last.copy(p.dir);
      maxDev = Math.max(maxDev, Math.abs(p.dir.dot(axis)) * R);
      expect(p.dir.length()).toBeCloseTo(1, 6);
      if (p.grounded) expect(Math.abs(p.feet - world.collision.ground(p.dir, p.feet).height)).toBeLessThan(0.6);
    }
    expect(travelled).toBeGreaterThan(2 * Math.PI * R * 0.98);
    // Water and slopes can nudge you sideways, but the path stays near the great circle.
    expect(maxDev).toBeLessThan(6);
  });

  it('walks straight over a pole without spinning or getting stuck', () => {
    const p = new PlayerController(world.collision, () => 'grass');
    const north = new Vector3(0, 1, 0);
    // Start 20 m south of the north pole, heading towards it.
    const start = new Vector3(Math.sin(20 / R), Math.cos(20 / R), 0);
    const toward = north.clone().sub(start).addScaledVector(start, -north.clone().sub(start).dot(start)).normalize();
    p.teleport(start, toward);
    const axis = new Vector3().crossVectors(start, toward).normalize();
    let crossed = false;
    for (let i = 0; i < 30 * 12; i++) {
      const ahead = new Vector3().crossVectors(axis, p.dir).normalize();
      p.update(1 / 30, ahead, false, false);
      if (p.dir.y > 0.9999) crossed = true;
    }
    expect(crossed || p.dir.x < 0).toBe(true); // passed over the pole onto the far side
    expect(Math.abs(p.dir.dot(axis)) * R).toBeLessThan(3);
    expect(p.facing.dot(p.dir)).toBeCloseTo(0, 5);
  });

  it('jumps and lands under radial gravity', () => {
    const p = new PlayerController(world.collision, () => 'grass');
    const b = world.layout.get('hills').frame.basis(0, -12, 0);
    p.teleport(b.pos, b.forward);
    const ground = p.feet;
    let peak = ground;
    p.update(1 / 60, new Vector3(), false, true);
    for (let i = 0; i < 180; i++) {
      p.update(1 / 60, new Vector3(), false, false);
      peak = Math.max(peak, p.feet);
    }
    expect(peak - ground).toBeGreaterThan(0.5);
    expect(p.grounded).toBe(true);
    expect(Math.abs(p.feet - ground)).toBeLessThan(0.05);
  });
});
