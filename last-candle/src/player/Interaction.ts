import * as THREE from "three";
import type { CollisionWorld } from "../world/Collision";

export interface Interactable {
  id: string;
  /** Meshes the crosshair ray tests against. */
  targets: THREE.Object3D[];
  /** Object whose materials get the hover glow (defaults to first target if it is visible). */
  highlight?: THREE.Object3D | null;
  /** Prompt label; returning null hides the prompt and disables E. */
  label: () => string | null;
  /** Secondary hint (e.g. "LMB draw"). */
  hint?: () => string | null;
  range?: number;
  onInteract?: () => void;
  enabled?: () => boolean;
  /** Higher wins when several are hit at similar distances. */
  priority?: number;
  /** Invisible helper volume (chair, monitor): real objects just behind it take precedence. */
  proxy?: boolean;
}

export interface Hit {
  it: Interactable;
  point: THREE.Vector3;
  distance: number;
  object: THREE.Object3D;
  uv?: THREE.Vector2;
  normal?: THREE.Vector3;
}

const glowColor = new THREE.Color("#ffcf7a");

/**
 * Crosshair raycasting against registered interactables, with wall occlusion
 * from the collision world and a subtle emissive glow on the hovered object.
 */
export class Interaction {
  private list: Interactable[] = [];
  private byTarget = new Map<THREE.Object3D, Interactable>();
  private ray = new THREE.Raycaster();
  current: Hit | null = null;
  private glowMats: { mat: THREE.MeshStandardMaterial; base: THREE.Color; baseI: number }[] = [];
  private glowOwner: Interactable | null = null;
  private targetsCache: THREE.Object3D[] = [];
  private dirty = true;

  constructor(private collision: CollisionWorld) {
    this.ray.far = 4;
  }

  add(it: Interactable): Interactable {
    this.list.push(it);
    for (const t of it.targets) this.byTarget.set(t, it);
    this.dirty = true;
    return it;
  }

  remove(id: string) {
    const it = this.list.find((x) => x.id === id);
    if (!it) return;
    this.list = this.list.filter((x) => x !== it);
    for (const t of it.targets) this.byTarget.delete(t);
    if (this.glowOwner === it) this.clearGlow();
    if (this.current?.it === it) this.current = null;
    this.dirty = true;
  }

  get(id: string): Interactable | undefined {
    return this.list.find((x) => x.id === id);
  }

  /** Raycast from the camera center. */
  update(camera: THREE.Camera, time: number, extraFilter?: (it: Interactable, hit: THREE.Intersection) => boolean) {
    if (this.dirty) {
      this.targetsCache = this.list.flatMap((i) => i.targets);
      this.dirty = false;
    }
    this.ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const origin = this.ray.ray.origin;
    const dir = this.ray.ray.direction;
    const hits = this.ray.intersectObjects(this.targetsCache, false);
    let best: Hit | null = null;
    const occ = this.collision.occlusion(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 4);
    for (const h of hits) {
      // small margin: doors and boards sit on the surface of their own occluder
      if (h.distance > occ + 0.1) break;
      const it = this.byTarget.get(h.object);
      if (!it) continue;
      if (it.enabled && !it.enabled()) continue;
      if (extraFilter && !extraFilter(it, h)) continue;
      if (h.distance > (it.range ?? 2.2)) continue;
      if (!it.label()) continue;
      // nearest valid hit wins; a higher-priority target just behind it (≤25cm) can take over
      if (!best) {
        best = { it, point: h.point.clone(), distance: h.distance, object: h.object, uv: h.uv?.clone(), normal: h.face?.normal.clone().transformDirection(h.object.matrixWorld) };
      } else if ((it.priority ?? 0) > (best.it.priority ?? 0) && h.distance - best.distance < (best.it.proxy ? 0.9 : 0.25)) {
        best = { it, point: h.point.clone(), distance: h.distance, object: h.object, uv: h.uv?.clone(), normal: h.face?.normal.clone().transformDirection(h.object.matrixWorld) };
      } else if (h.distance - best.distance >= (best.it.proxy ? 0.9 : 0.25)) break;
    }
    this.current = best;
    // glow
    const owner = best?.it ?? null;
    if (owner !== this.glowOwner) {
      this.clearGlow();
      this.glowOwner = owner;
      if (owner) this.collectGlow(owner);
    }
    const pulse = 0.1 + 0.06 * Math.sin(time * 6);
    for (const g of this.glowMats) {
      g.mat.emissive.copy(g.base).lerp(glowColor, pulse * 2.2);
      g.mat.emissiveIntensity = Math.max(g.baseI, 0.0) + pulse * (g.baseI > 0.5 ? 0.3 : 1);
    }
  }

  private collectGlow(it: Interactable) {
    const root = it.highlight === undefined ? it.targets[0] : it.highlight;
    if (!root) return;
    const seen = new Set<THREE.Material>();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mm of mats) {
        const sm = mm as THREE.MeshStandardMaterial;
        if (!sm.emissive || seen.has(sm) || sm.visible === false) continue;
        if (!sm.userData.ownGlow) continue; // only materials we own (cloned) get glow
        seen.add(sm);
        this.glowMats.push({ mat: sm, base: sm.emissive.clone(), baseI: sm.emissiveIntensity });
      }
    });
  }

  private clearGlow() {
    for (const g of this.glowMats) {
      g.mat.emissive.copy(g.base);
      g.mat.emissiveIntensity = g.baseI;
    }
    this.glowMats = [];
    this.glowOwner = null;
  }

  /** Make materials under an object unique so they can glow without affecting shared ones. */
  static ownMaterials(root: THREE.Object3D) {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (Array.isArray(mesh.material)) return;
      const mm = mesh.material as THREE.MeshStandardMaterial;
      if (!mm.emissive || mm.userData.ownGlow) return;
      const c = mm.clone();
      c.userData.ownGlow = true;
      mesh.material = c;
    });
  }
}
