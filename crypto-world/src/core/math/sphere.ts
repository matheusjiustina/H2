import { Quaternion, Vector3 } from 'three';

/**
 * Spherical-world helpers. Conventions:
 *  - The planet is centred at the origin. "Up" at any point is the normalised position.
 *  - Latitude/longitude in degrees: lat +90 is +Y, lon 0 faces +Z, lon +90 faces +X.
 *  - Local tangent frames are (east, up, north), right-handed with east × up = -north… we only
 *    ever use them explicitly so handedness is documented per call.
 */

const DEG = Math.PI / 180;
const _q = new Quaternion();
const _v = new Vector3();
const _w = new Vector3();
const WORLD_Y = new Vector3(0, 1, 0);
const WORLD_Z = new Vector3(0, 0, 1);

export function latLonToDir(latDeg: number, lonDeg: number, out = new Vector3()): Vector3 {
  const la = latDeg * DEG;
  const lo = lonDeg * DEG;
  return out.set(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo));
}

export function dirToLatLon(dir: Vector3): { lat: number; lon: number } {
  const d = _v.copy(dir).normalize();
  return { lat: Math.asin(Math.max(-1, Math.min(1, d.y))) / DEG, lon: Math.atan2(d.x, d.z) / DEG };
}

/** Angle in radians between two direction vectors (need not be normalised). */
export function angleBetween(a: Vector3, b: Vector3): number {
  const la = a.length();
  const lb = b.length();
  if (la === 0 || lb === 0) return 0;
  const c = a.dot(b) / (la * lb);
  return Math.acos(Math.max(-1, Math.min(1, c)));
}

/** Projects v onto the tangent plane with normal `up` (unit). */
export function projectOnTangent(v: Vector3, up: Vector3, out = new Vector3()): Vector3 {
  return out.copy(v).addScaledVector(up, -v.dot(up));
}

/**
 * Builds a stable tangent frame at `up`: north points toward +Y pole where possible,
 * east = north × up … chosen so that (east, up, north) maps to (x, y, -z) like a
 * standard Three.js object looking toward -Z = north. Near the poles the reference
 * switches to world Z to stay well conditioned.
 */
export function tangentFrame(up: Vector3, outEast = new Vector3(), outNorth = new Vector3()): void {
  const ref = Math.abs(up.y) > 0.999 ? WORLD_Z : WORLD_Y;
  outNorth.copy(ref).addScaledVector(up, -ref.dot(up)).normalize();
  outEast.crossVectors(outNorth, up).normalize();
}

/**
 * Exponential map: travel `distance` (world units along the surface of a sphere of `radius`)
 * from `origin` (unit) in tangent direction `tangent` (unit, perpendicular to origin).
 */
export function geodesicStep(origin: Vector3, tangent: Vector3, distance: number, radius: number, out = new Vector3()): Vector3 {
  const a = distance / radius;
  return out.copy(origin).multiplyScalar(Math.cos(a)).addScaledVector(tangent, Math.sin(a)).normalize();
}

/**
 * Rotation that carries unit vector `from` to unit vector `to` along the connecting great circle.
 * Applying it to tangent vectors performs parallel transport along that geodesic.
 */
export function transportQuat(from: Vector3, to: Vector3, out = new Quaternion()): Quaternion {
  return out.setFromUnitVectors(from, to);
}

/**
 * Inverse exponential map: local 2D coordinates of `p` relative to `origin` using the given
 * tangent axes (east, north), in world units on a sphere of `radius`.
 */
export function logMap(origin: Vector3, east: Vector3, north: Vector3, p: Vector3, radius: number): { x: number; y: number } {
  const pn = _v.copy(p).normalize();
  const c = Math.max(-1, Math.min(1, pn.dot(origin)));
  const ang = Math.acos(c);
  _w.copy(pn).addScaledVector(origin, -c);
  const len = _w.length();
  if (len < 1e-9) return { x: 0, y: 0 };
  _w.multiplyScalar((ang * radius) / len);
  return { x: _w.dot(east), y: _w.dot(north) };
}

/** Rotates the unit position `pos` by moving `distance` along tangent `dir`; returns the rotation used. */
export function moveAlongSurface(pos: Vector3, dir: Vector3, distance: number, radius: number, outQuat = new Quaternion()): Quaternion {
  const up = _v.copy(pos).normalize();
  const axis = _w.crossVectors(up, dir);
  const len = axis.length();
  if (len < 1e-9 || distance === 0) return outQuat.identity();
  axis.multiplyScalar(1 / len);
  outQuat.setFromAxisAngle(axis, distance / radius);
  pos.applyQuaternion(outQuat);
  return outQuat;
}

/** Spherical linear interpolation between unit vectors. */
export function slerpDir(a: Vector3, b: Vector3, t: number, out = new Vector3()): Vector3 {
  _q.setFromUnitVectors(a, b);
  const id = new Quaternion();
  id.slerp(_q, t);
  return out.copy(a).applyQuaternion(id);
}

/** Frame-rate independent exponential smoothing factor. */
export function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest signed angle difference a→b in radians. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const DEG2RAD = DEG;
