import { Matrix4, Quaternion, Vector3 } from 'three';
import { geodesicStep, latLonToDir, logMap, tangentFrame } from '../core/math/sphere';
import { PLANET_RADIUS } from './constants';

/**
 * A local map projection around a point on the planet. World designers lay out each district in
 * flat metres (x = east, y = north); this class wraps them onto the sphere with the azimuthal
 * equidistant (exponential) map so distances from the centre are preserved exactly and nearby
 * geometry is undistorted.
 */
export class RegionFrame {
  readonly center: Vector3;
  readonly east = new Vector3();
  readonly north = new Vector3();

  constructor(lat: number, lon: number, rotationDeg = 0) {
    this.center = latLonToDir(lat, lon);
    tangentFrame(this.center, this.east, this.north);
    if (rotationDeg) {
      const q = new Quaternion().setFromAxisAngle(this.center, (-rotationDeg * Math.PI) / 180);
      this.east.applyQuaternion(q);
      this.north.applyQuaternion(q);
    }
  }

  /** Unit direction for local coordinates (x east, y north) in world units. */
  dir(x: number, y: number, out = new Vector3()): Vector3 {
    const d = Math.hypot(x, y);
    if (d < 1e-6) return out.copy(this.center);
    const t = new Vector3().copy(this.east).multiplyScalar(x / d).addScaledVector(this.north, y / d);
    return geodesicStep(this.center, t, d, PLANET_RADIUS, out);
  }

  /** Local coordinates of a world direction/position. */
  local(p: Vector3): { x: number; y: number } {
    return logMap(this.center, this.east, this.north, p, PLANET_RADIUS);
  }

  /**
   * Orientation basis at local point (x, y) with a heading (degrees, 0 = local north, 90 = east).
   * Returns the object's local axes, already parallel-transported from the centre:
   * xAxis (+X = up × forward, i.e. the left-hand side when looking along forward), up (+Y), forward (+Z).
   */
  basis(x: number, y: number, headingDeg = 0): { pos: Vector3; xAxis: Vector3; up: Vector3; forward: Vector3 } {
    const pos = this.dir(x, y);
    const q = new Quaternion().setFromUnitVectors(this.center, pos);
    const north = this.north.clone().applyQuaternion(q);
    const east = this.east.clone().applyQuaternion(q);
    const h = (headingDeg * Math.PI) / 180;
    const forward = north.multiplyScalar(Math.cos(h)).addScaledVector(east, Math.sin(h)).normalize();
    const up = pos.clone();
    const xAxis = new Vector3().crossVectors(up, forward).normalize();
    return { pos, xAxis, up, forward };
  }
}

/** Rotation matrix whose columns are the local X, up, forward axes. */
export function basisMatrix(xAxis: Vector3, up: Vector3, forward: Vector3, out = new Matrix4()): Matrix4 {
  return out.makeBasis(xAxis, up, forward);
}

/** Quaternion orienting an object so local +Y = up and local +Z = forward (forward must be tangent). */
export function orientQuat(up: Vector3, forward: Vector3, out = new Quaternion()): Quaternion {
  const xAxis = new Vector3().crossVectors(up, forward).normalize();
  const fwd = new Vector3().crossVectors(xAxis, up).normalize();
  const m = new Matrix4().makeBasis(xAxis, up, fwd);
  return out.setFromRotationMatrix(m);
}
