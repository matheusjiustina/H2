import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { CollisionWorld } from '../src/world/Collision';
import { latLonToDir, tangentFrame } from '../src/core/math/sphere';
import { PLANET_RADIUS } from '../src/world/constants';

const R = PLANET_RADIUS;

function frameAt(lat: number, lon: number) {
  const up = latLonToDir(lat, lon);
  const east = new Vector3();
  const north = new Vector3();
  tangentFrame(up, east, north);
  const at = (x: number, z: number) => up.clone().multiplyScalar(R).addScaledVector(east, x).addScaledVector(north, z).normalize();
  return { up, east, north, at };
}

describe('collision on the sphere', () => {
  it('pushes a body out of a round obstacle', () => {
    const w = new CollisionWorld(() => 0);
    const f = frameAt(10, 10);
    w.add({ kind: 'circle', center: f.up.clone(), radius: 1, base: 0, top: 3 });
    const body = f.at(0.5, 0);
    expect(w.resolve(body, 0, 0.3, 1.6)).toBe(true);
    const dist = body.angleTo(f.up) * R;
    expect(dist).toBeGreaterThanOrEqual(1.3 - 1e-3);
  });

  it('lets a body pass over a low wall but not through a tall one', () => {
    const w = new CollisionWorld(() => 0);
    const f = frameAt(-15, 40);
    w.add({ kind: 'box', center: f.up.clone(), xAxis: f.east.clone(), zAxis: f.north.clone(), hx: 2, hz: 0.2, base: 0, top: 1.2 });
    const high = f.at(0, 0.1);
    expect(w.resolve(high, 1.5, 0.3, 1.6)).toBe(false); // feet above the wall top
    const low = f.at(0, 0.1);
    expect(w.resolve(low, 0, 0.3, 1.6)).toBe(true);
    const out = low.clone().sub(f.up);
    expect(Math.abs(out.dot(f.north)) * R).toBeGreaterThan(0.45);
  });

  it('stands on walk surfaces, with ramps and a step-up limit', () => {
    const w = new CollisionWorld(() => 0.2);
    const f = frameAt(30, -60);
    w.addSurface({ center: f.up.clone(), xAxis: f.east.clone(), zAxis: f.north.clone(), hx: 1, hz: 2, h0: 0.2, h1: 2.2, material: 'wood' });
    expect(w.ground(f.at(0, -2.5)).height).toBeCloseTo(0.2, 6); // off the ramp: terrain
    expect(w.ground(f.at(0, 0)).height).toBeCloseTo(1.2, 2); // middle of the ramp
    expect(w.ground(f.at(0, 0), 0.2).height).toBeCloseTo(0.2, 6); // too high to step onto from the ground
    expect(w.ground(f.at(0, 0), 1.0).surface).not.toBeNull();
  });

  it('casts camera rays against boxes and cylinders', () => {
    const w = new CollisionWorld(() => 0);
    const f = frameAt(0, 120);
    w.add({ kind: 'box', center: f.at(0, 5), xAxis: f.east.clone(), zAxis: f.north.clone(), hx: 2, hz: 0.5, base: 0, top: 4, blocksCamera: true });
    w.add({ kind: 'circle', center: f.at(5, 0), radius: 1, base: 0, top: 6, blocksCamera: true });
    const eye = f.up.clone().multiplyScalar(R + 1.5);
    const behindBox = f.at(0, 10).multiplyScalar(R + 1.5);
    const frac = w.raycast(eye, behindBox);
    expect(frac).toBeGreaterThan(0.4);
    expect(frac).toBeLessThan(0.5);
    const behindPillar = f.at(10, 0).multiplyScalar(R + 1.5);
    const frac2 = w.raycast(eye, behindPillar);
    expect(frac2).toBeGreaterThan(0.35);
    expect(frac2).toBeLessThan(0.45);
    const clear = f.at(-10, 0).multiplyScalar(R + 1.5);
    expect(w.raycast(eye, clear)).toBe(1);
    // Above the pillar's top the ray is clear.
    const over = f.at(10, 0).multiplyScalar(R + 9);
    expect(w.raycast(f.up.clone().multiplyScalar(R + 8), over)).toBe(1);
  });
});
