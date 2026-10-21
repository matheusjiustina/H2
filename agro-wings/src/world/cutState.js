// Worked ground shared by the field machinery and the ground/crop shaders:
// up to NCUT rectangles (x0, z0, x1, z1) with a kind each (0 none, 1
// harvested: crop gone, stubble shows; 2 tilled: dark worked soil) and the
// row axis (kind + 4 * axis). The uniform objects are shared by reference, so
// one write per update reaches every material.
import * as THREE from 'three';

export const NCUT = 8;
export const CUT_U = {
  rects: { value: Array.from({ length: NCUT }, () => new THREE.Vector4(0, 0, 0, 0)) },
  kinds: { value: new Float32Array(NCUT) },
};

// GLSL: 1 inside a harvested rectangle (crop removed), else 0.
export const CUT_GLSL = /* glsl */ `
uniform vec4 uCut[${NCUT}];
uniform float uCutKind[${NCUT}];
float harvestedAt(vec2 p) {
  for (int i = 0; i < ${NCUT}; i++) {
    vec4 r = uCut[i];
    if (mod(uCutKind[i], 4.0) == 1.0 && p.x > r.x && p.x < r.z && p.y > r.y && p.y < r.w) return 1.0;
  }
  return 0.0;
}`;
