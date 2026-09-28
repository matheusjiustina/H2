import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merge every static mesh under `root` that shares a material into a single
 * mesh (world transforms baked in). Objects flagged with userData.dynamic
 * (and their children) are left untouched so they can keep animating.
 * Turns ~170 decor draw calls into ~25.
 */
export function bakeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();

  const visit = (obj) => {
    if (obj.userData.dynamic) return;
    if (obj.isMesh && !obj.isSkinnedMesh && !Array.isArray(obj.material)) {
      const key = obj.material.uuid;
      if (!buckets.has(key)) buckets.set(key, { material: obj.material, meshes: [] });
      buckets.get(key).meshes.push(obj);
    }
    for (const c of obj.children) visit(c);
  };
  visit(root);

  for (const { material, meshes } of buckets.values()) {
    if (meshes.length < 2) continue;
    const geos = meshes.map((m) => {
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(g.attributes)) {
        if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      }
      if (!g.attributes.uv) {
        g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
      }
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      return g;
    });
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = meshes.some((m) => m.castShadow);
    mesh.receiveShadow = meshes.some((m) => m.receiveShadow);
    mesh.renderOrder = meshes[0].renderOrder;
    root.add(mesh);
    meshes.forEach((m) => m.removeFromParent());
  }

  // Drop groups left empty by the merge.
  const prune = (obj) => {
    for (const c of [...obj.children]) prune(c);
    if (obj !== root && obj.type === 'Group' && obj.children.length === 0 && !obj.userData.dynamic) obj.removeFromParent();
  };
  prune(root);
}
