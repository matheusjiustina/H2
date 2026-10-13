import { Mesh, Object3D, Sphere, Vector3 } from 'three';
import { PLANET_RADIUS } from '../world/constants';

interface Item {
  obj: Object3D;
  center: Vector3;
  radius: number;
  maxDist: number;
}

/**
 * Planet-aware visibility. An object is skipped only when its whole bounding sphere lies below
 * the camera's horizon (with the planet approximated by a conservative inner sphere), so things
 * still rise naturally over the curve — the horizon itself hides them, culling only saves the work.
 * Three.js frustum culling runs afterwards on whatever remains.
 */
export class HorizonCuller {
  private items: Item[] = [];
  occluderRadius = PLANET_RADIUS - 1.2;
  visibleCount = 0;

  /** Registers a mesh whose geometry is already in world coordinates (identity transform). */
  addStatic(mesh: Mesh, maxDist = Infinity): void {
    const g = mesh.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const s = g.boundingSphere as Sphere;
    this.items.push({ obj: mesh, center: s.center.clone(), radius: s.radius, maxDist });
  }

  /** Registers any object with an explicit world-space bounding sphere. */
  add(obj: Object3D, center: Vector3, radius: number, maxDist = Infinity): void {
    this.items.push({ obj, center: center.clone(), radius, maxDist });
  }

  remove(obj: Object3D): void {
    this.items = this.items.filter((i) => i.obj !== obj);
  }

  /** Updates the stored centre for a moving object. */
  move(obj: Object3D, center: Vector3): void {
    const it = this.items.find((i) => i.obj === obj);
    if (it) it.center.copy(center);
  }

  static isAboveHorizon(cam: Vector3, center: Vector3, radius: number, occ: number): boolean {
    const D = cam.length();
    const rc = center.length();
    if (D <= occ || rc < 1e-6) return true;
    const cosT = cam.dot(center) / (D * rc);
    const theta = Math.acos(Math.max(-1, Math.min(1, cosT)));
    const thetaH = Math.acos(occ / D);
    const top = rc + radius;
    const thetaO = top > occ ? Math.acos(occ / top) : 0;
    return theta - radius / Math.max(rc, occ) <= thetaH + thetaO;
  }

  update(cameraPos: Vector3): void {
    let n = 0;
    for (const it of this.items) {
      let vis = HorizonCuller.isAboveHorizon(cameraPos, it.center, it.radius, this.occluderRadius);
      if (vis && it.maxDist < Infinity) vis = cameraPos.distanceTo(it.center) - it.radius < it.maxDist;
      it.obj.visible = vis;
      if (vis) n++;
    }
    this.visibleCount = n;
  }

  get count(): number {
    return this.items.length;
  }
}
