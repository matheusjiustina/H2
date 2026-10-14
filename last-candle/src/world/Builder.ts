import * as THREE from "three";
import type { CollisionWorld } from "./Collision";
import { StaticBatcher } from "./geometry";

export interface PhysicsBoxDef {
  pos: [number, number, number];
  half: [number, number, number];
  rotY?: number;
  rotX?: number;
  tag?: string;
}

export interface PlaceOpts {
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number] | number;
  /** Merge into static batches (default true). Set false for anything that moves or highlights. */
  static?: boolean;
  cast?: boolean;
  receive?: boolean;
  parent?: THREE.Object3D;
  name?: string;
}

/**
 * Helper that places meshes, registers player collision boxes and physics
 * colliders, and funnels static decor into the batcher.
 */
export class Builder {
  readonly batcher = new StaticBatcher();
  readonly physicsBoxes: PhysicsBoxDef[] = [];
  private staticRoot = new THREE.Group();

  constructor(
    readonly scene: THREE.Scene,
    readonly collision: CollisionWorld,
  ) {
    this.staticRoot.name = "static-root";
    scene.add(this.staticRoot);
  }

  mesh(geo: THREE.BufferGeometry, mat: THREE.Material, o: PlaceOpts = {}): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    if (o.pos) m.position.set(o.pos[0], o.pos[1], o.pos[2]);
    if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
    if (o.scale !== undefined) {
      if (typeof o.scale === "number") m.scale.setScalar(o.scale);
      else m.scale.set(o.scale[0], o.scale[1], o.scale[2]);
    }
    m.castShadow = o.cast ?? false;
    m.receiveShadow = o.receive ?? true;
    if (o.name) m.name = o.name;
    const parent = o.parent ?? this.staticRoot;
    parent.add(m);
    if (o.static !== false && !o.parent) {
      // will be merged; keep it in the graph until build() so world matrices are valid
      this.pendingStatic.push(m);
    } else if (o.static !== false && o.parent) {
      this.pendingStatic.push(m);
    }
    return m;
  }

  private pendingStatic: THREE.Mesh[] = [];

  /** Player collision box (axis aligned). */
  solid(minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number, tag?: string) {
    return this.collision.addBox({ minX, maxX, minY, maxY, minZ, maxZ, tag });
  }

  /** Physics collider box (center + half extents). */
  phys(pos: [number, number, number], half: [number, number, number], rotY = 0, tag?: string, rotX = 0): PhysicsBoxDef {
    const d = { pos, half, rotY, rotX, tag };
    this.physicsBoxes.push(d);
    return d;
  }

  /** Both: an axis-aligned solid that blocks the player and props. */
  block(minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number, tag?: string) {
    this.solid(minX, maxX, minY, maxY, minZ, maxZ, tag);
    this.phys([(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2], [(maxX - minX) / 2, (maxY - minY) / 2, (maxZ - minZ) / 2], 0, tag);
  }

  /** Merge everything that was marked static. Meshes inside moving parents are skipped. */
  finalize(): number {
    let calls = 0;
    const batched: THREE.Mesh[] = [];
    for (const m of this.pendingStatic) {
      if (!m.parent) continue;
      // only batch meshes whose whole ancestry is static (no named dynamic groups)
      let p: THREE.Object3D | null = m.parent;
      let ok = true;
      while (p && p !== this.scene) {
        if (p.userData.dynamic) {
          ok = false;
          break;
        }
        p = p.parent;
      }
      if (!ok) continue;
      this.batcher.add(m);
      batched.push(m);
    }
    for (const m of batched) m.removeFromParent();
    calls = this.batcher.build(this.staticRoot);
    this.pendingStatic = [];
    return calls;
  }
}
