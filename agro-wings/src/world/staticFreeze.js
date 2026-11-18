// Static subtrees (terrain, roads, forest cells...) never move: their world
// matrices are computed once and the per-frame scene traversal skips them.
// Three.js recomputes matrices for every node each frame (compose + multiply
// for ~9000 forest nodes with matrixAutoUpdate on); this removes that work
// without changing a pixel. Only groups whose own transform is the identity
// and that never move are frozen; children added later (crop fin patches)
// keep their default identity world matrix, which is correct under identity
// ancestors.
import * as THREE from 'three';

const I = new THREE.Matrix4();

export function freezeStatic(root) {
  if (!root || root.__frozen) return false;
  if (root.parent && !root.parent.matrixWorld.equals(I)) return false;
  root.updateMatrix();
  if (!root.matrix.equals(I)) return false;
  root.updateMatrixWorld(true);
  root.traverse((o) => { o.matrixAutoUpdate = false; o.matrixWorldNeedsUpdate = false; });
  // Instance-level override: the subtree's matrices are final.
  root.updateMatrixWorld = function () {};
  root.__frozen = true;
  return true;
}
