import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Shared geometry caches so repeated furniture reuses GPU buffers. */
const cache = new Map<string, THREE.BufferGeometry>();

const key = (...parts: (string | number)[]) => parts.map((p) => (typeof p === "number" ? p.toFixed(4) : p)).join("|");

export function rbox(w: number, h: number, d: number, r = 0.01, seg = 2): THREE.BufferGeometry {
  const k = key("rb", w, h, d, r, seg);
  let g = cache.get(k);
  if (!g) {
    const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
    g = rr > 0.0005 ? new RoundedBoxGeometry(w, h, d, seg, rr) : new THREE.BoxGeometry(w, h, d);
    cache.set(k, g);
  }
  return g;
}

export function box(w: number, h: number, d: number): THREE.BufferGeometry {
  const k = key("b", w, h, d);
  let g = cache.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    cache.set(k, g);
  }
  return g;
}

export function cyl(rt: number, rb: number, h: number, seg = 16, open = false): THREE.BufferGeometry {
  const k = key("c", rt, rb, h, seg, open ? 1 : 0);
  let g = cache.get(k);
  if (!g) {
    g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
    cache.set(k, g);
  }
  return g;
}

export function sphere(r: number, ws = 16, hs = 12): THREE.BufferGeometry {
  const k = key("s", r, ws, hs);
  let g = cache.get(k);
  if (!g) {
    g = new THREE.SphereGeometry(r, ws, hs);
    cache.set(k, g);
  }
  return g;
}

export function capsule(r: number, len: number, cap = 6, rad = 12): THREE.BufferGeometry {
  const k = key("cap", r, len, cap, rad);
  let g = cache.get(k);
  if (!g) {
    g = new THREE.CapsuleGeometry(r, len, cap, rad);
    cache.set(k, g);
  }
  return g;
}

export function plane(w: number, h: number): THREE.BufferGeometry {
  const k = key("p", w, h);
  let g = cache.get(k);
  if (!g) {
    g = new THREE.PlaneGeometry(w, h);
    cache.set(k, g);
  }
  return g;
}

export function torus(r: number, tube: number, arc = Math.PI * 2, rs = 8, ts = 20): THREE.BufferGeometry {
  const k = key("t", r, tube, arc, rs, ts);
  let g = cache.get(k);
  if (!g) {
    g = new THREE.TorusGeometry(r, tube, rs, ts, arc);
    cache.set(k, g);
  }
  return g;
}

/** Box with UVs scaled to world meters (so tiling textures keep a constant density). */
export function worldUvBox(w: number, h: number, d: number, metersPerRepeat = 1.2): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let u: number;
    let v: number;
    if (ny > 0.5) {
      u = x;
      v = z;
    } else if (nx > 0.5) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uv.setXY(i, u / metersPerRepeat, v / metersPerRepeat);
  }
  return g;
}

/**
 * Collects static, non-interactive meshes and merges them by material into a
 * handful of draw calls once the level is built.
 */
export class StaticBatcher {
  private groups = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[] }>();

  add(mesh: THREE.Mesh): void {
    mesh.updateWorldMatrix(true, false);
    const mat = mesh.material as THREE.Material;
    const k = `${mat.uuid}|${mesh.castShadow ? 1 : 0}|${mesh.receiveShadow ? 1 : 0}`;
    let grp = this.groups.get(k);
    if (!grp) {
      grp = { mat, cast: mesh.castShadow, receive: mesh.receiveShadow, geos: [] };
      this.groups.set(k, grp);
    }
    let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    // keep only shared attributes
    for (const name of Object.keys(g.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    }
    if (!g.attributes.uv) {
      g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    g.applyMatrix4(mesh.matrixWorld);
    g.morphAttributes = {};
    g.clearGroups();
    grp.geos.push(g);
    g = null as unknown as THREE.BufferGeometry;
  }

  build(parent: THREE.Object3D): number {
    let calls = 0;
    for (const grp of this.groups.values()) {
      if (!grp.geos.length) continue;
      const merged = mergeGeometries(grp.geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const m = new THREE.Mesh(merged, grp.mat);
      m.castShadow = grp.cast;
      m.receiveShadow = grp.receive;
      m.matrixAutoUpdate = false;
      m.name = "static-batch";
      parent.add(m);
      for (const g of grp.geos) g.dispose();
      calls++;
    }
    this.groups.clear();
    return calls;
  }
}

/**
 * Merge the direct mesh children of a group that share a material into one
 * mesh each (keeps transforms). Children flagged `userData.keep` are left
 * alone. Cuts draw calls for characters, chairs and monitors a lot.
 */
export function mergeByMaterial(group: THREE.Object3D): void {
  const buckets = new Map<THREE.Material, THREE.Mesh[]>();
  for (const c of group.children) {
    const m = c as THREE.Mesh;
    if (!m.isMesh || m.children.length || m.userData.keep || Array.isArray(m.material)) continue;
    if ((m as unknown as THREE.Sprite).isSprite) continue;
    const list = buckets.get(m.material as THREE.Material) ?? [];
    list.push(m);
    buckets.set(m.material as THREE.Material, list);
  }
  for (const [mat, meshes] of buckets) {
    if (meshes.length < 2) continue;
    const geos: THREE.BufferGeometry[] = [];
    let cast = false;
    let receive = false;
    for (const m of meshes) {
      m.updateMatrix();
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(m.matrix);
      g.morphAttributes = {};
      g.clearGroups();
      geos.push(g);
      cast ||= m.castShadow;
      receive ||= m.receiveShadow;
    }
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.userData.merged = true;
    for (const m of meshes) group.remove(m);
    group.add(mesh);
  }
}

/** mergeByMaterial on a group and every descendant group. */
export function mergeDeep(root: THREE.Object3D): void {
  const groups: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) groups.push(o);
  });
  for (const g of groups) mergeByMaterial(g);
}
