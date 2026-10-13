import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { angleBetween, dirToLatLon, geodesicStep, latLonToDir, logMap, moveAlongSurface, tangentFrame, transportQuat } from '../src/core/math/sphere';

const R = 70;

describe('sphere math', () => {
  it('round-trips latitude/longitude', () => {
    for (const [lat, lon] of [[0, 0], [45, 90], [-30, -120], [80, 170], [-89, 5]]) {
      const ll = dirToLatLon(latLonToDir(lat, lon));
      expect(ll.lat).toBeCloseTo(lat, 6);
      expect(ll.lon).toBeCloseTo(lon, 6);
    }
  });

  it('geodesic steps travel the requested arc length and stay on the sphere', () => {
    const o = latLonToDir(12, 34);
    const east = new Vector3();
    const north = new Vector3();
    tangentFrame(o, east, north);
    for (const dist of [0.1, 1, 10, 50, 200]) {
      const p = geodesicStep(o, east, dist, R);
      expect(p.length()).toBeCloseTo(1, 9);
      const travelled = (angleBetween(o, p) * R) % (2 * Math.PI * R);
      const expected = dist % (2 * Math.PI * R);
      expect(Math.min(travelled, 2 * Math.PI * R - travelled)).toBeCloseTo(Math.min(expected, 2 * Math.PI * R - expected), 5);
    }
  });

  it('a full circumference brings you back to the start', () => {
    const o = latLonToDir(-20, 75);
    const east = new Vector3();
    tangentFrame(o, east, new Vector3());
    const p = geodesicStep(o, east, 2 * Math.PI * R, R);
    expect(p.distanceTo(o)).toBeLessThan(1e-9);
  });

  it('logMap inverts the exponential map locally', () => {
    const o = latLonToDir(5, 5);
    const east = new Vector3();
    const north = new Vector3();
    tangentFrame(o, east, north);
    const t = east.clone().multiplyScalar(0.6).addScaledVector(north, 0.8).normalize();
    const p = geodesicStep(o, t, 7.5, R);
    const v = logMap(o, east, north, p, R);
    expect(v.x).toBeCloseTo(0.6 * 7.5, 6);
    expect(v.y).toBeCloseTo(0.8 * 7.5, 6);
  });

  it('parallel transport keeps tangents tangent and unit length', () => {
    const a = latLonToDir(0, 0);
    const b = latLonToDir(30, 40);
    const east = new Vector3();
    tangentFrame(a, east, new Vector3());
    const moved = east.clone().applyQuaternion(transportQuat(a, b));
    expect(moved.length()).toBeCloseTo(1, 9);
    expect(moved.dot(b)).toBeCloseTo(0, 9);
  });

  it('moveAlongSurface rotates the position by distance / radius', () => {
    const pos = latLonToDir(10, 20);
    const start = pos.clone();
    const east = new Vector3();
    tangentFrame(pos, east, new Vector3());
    moveAlongSurface(pos, east, 3.5, R);
    expect(angleBetween(start, pos) * R).toBeCloseTo(3.5, 9);
    expect(pos.length()).toBeCloseTo(1, 9);
  });

  it('tangent frames are orthonormal everywhere, including the poles', () => {
    for (const [lat, lon] of [[90, 0], [-90, 0], [0, 0], [45, -45], [89.999, 10]]) {
      const up = latLonToDir(lat, lon);
      const e = new Vector3();
      const n = new Vector3();
      tangentFrame(up, e, n);
      expect(e.length()).toBeCloseTo(1, 6);
      expect(n.length()).toBeCloseTo(1, 6);
      expect(e.dot(n)).toBeCloseTo(0, 6);
      expect(e.dot(up)).toBeCloseTo(0, 6);
      expect(n.dot(up)).toBeCloseTo(0, 6);
    }
  });
});
