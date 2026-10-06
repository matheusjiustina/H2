import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Merge static meshes under `root` into one mesh per (material, layer, shadow flags)
 * to cut draw calls. Objects in `exclude` (and their descendants) are left untouched.
 */
export function batchStatic(root, exclude = []) {
  root.updateMatrixWorld(true);
  const skip = new Set();
  for (const e of exclude) if (e) e.traverse((o) => skip.add(o));
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const remove = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || skip.has(o)) return;
    if (Array.isArray(o.material) || o.material.transparent || o.material.defines?.WIND_ENABLED !== undefined) return;
    const key = `${o.material.uuid}|${o.layers.mask}|${o.castShadow}|${o.receiveShadow}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { material: o.material, layers: o.layers.mask, cast: o.castShadow, receive: o.receiveShadow, geos: [] }));
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    b.geos.push(g);
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  let n = 0;
  for (const b of buckets.values()) {
    const geo = mergeGeometries(b.geos, false);
    if (!geo) continue;
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, b.material);
    m.castShadow = b.cast;
    m.receiveShadow = b.receive;
    m.layers.mask = b.layers;
    m.name = 'batched';
    root.add(m);
    n++;
  }
  return { merged: remove.length, meshes: n };
}
