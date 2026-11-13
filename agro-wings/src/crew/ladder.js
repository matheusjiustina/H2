// Service step ladder (Badeco 2.0): a light aluminium A-frame the badeco
// carries out for service points he cannot reach from the ground (the Fire
// Boss on its floats; any point higher than his reach). One merged mesh,
// one draw call, built for the height asked (only when a service needs it)
// and hidden when stowed. Local frame: origin on the ground at the foot of
// the climbing side, +z toward the aircraft (the rails lean in), +y up.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const LADDER = { rung: 0.28, lean: 0.22, width: 0.5 };

export class ServiceLadder {
  constructor(scene) {
    this.mat = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.4, metalness: 0.75 });
    this.footMat = new THREE.MeshStandardMaterial({ color: 0x1d1d1d, roughness: 0.9 });
    this.group = new THREE.Group();
    this.group.name = 'serviceLadder';
    this.group.visible = false;
    scene.add(this.group);
    this.h = 0;
    this.mesh = null;
  }

  // Height of the top step (m above the ground).
  build(top) {
    const h = Math.round(top * 20) / 20;
    if (this.mesh && h === this.h) return;
    this.h = h;
    if (this.mesh) { this.group.remove(this.mesh); this.mesh.geometry.dispose(); }
    const W = LADDER.width, lean = LADDER.lean;
    const H = h + 0.6; // rails run up past the top step (hand rails)
    const railLen = Math.hypot(H, H * lean);
    const tilt = Math.atan(lean); // rails lean toward +z
    const parts = [];
    const rail = (x) => new THREE.BoxGeometry(0.045, railLen, 0.06).translate(0, railLen / 2, 0).rotateX(tilt).translate(x, 0, 0);
    parts.push(rail(-W / 2), rail(W / 2));
    // Rungs every LADDER.rung up to the top step (a wider platform).
    const nR = Math.max(1, Math.round(h / LADDER.rung));
    for (let i = 1; i <= nR; i++) {
      const y = (h * i) / nR, z = y * lean;
      parts.push(new THREE.BoxGeometry(W, 0.03, i === nR ? 0.3 : 0.09).translate(0, y, z + (i === nR ? 0.1 : 0)));
    }
    // Back legs (the A-frame) from the top to the ground behind, a spreader.
    const back = (x) => {
      const zt = h * lean + 0.25, spread = h * 0.3;
      const len = Math.hypot(h + 0.05, spread), a = Math.atan2(spread, h + 0.05);
      // Up from the foot, leaning back toward the top (−z).
      return new THREE.BoxGeometry(0.04, len, 0.05).translate(0, len / 2, 0).rotateX(-a).translate(x, 0, zt + spread);
    };
    parts.push(back(-W / 2), back(W / 2));
    parts.push(new THREE.BoxGeometry(W, 0.025, 0.025).translate(0, h * 0.45, h * lean + 0.25 + h * 0.13));
    this.mesh = new THREE.Mesh(mergeGeometries(parts), this.mat);
    this.mesh.castShadow = true;
    this.group.add(this.mesh);
  }

  // Place on the ground at (x, z), facing yaw (+z toward the aircraft).
  place(x, y, z, yaw) {
    this.group.position.set(x, y, z);
    this.group.rotation.set(0, yaw, 0);
    this.group.visible = true;
  }
  stow() { this.group.visible = false; }
  // Where the climber's feet are at height y on the ladder (local z offset).
  stepZ(y) { return y * LADDER.lean - 0.08; }
}
