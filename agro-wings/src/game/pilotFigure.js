// Standing pilot for the on-foot mode: a light procedural figure (flight
// suit, cap, boots), 4 shared materials, 15 small meshes, a procedural walk
// and idle. Built once on the first exit and reused afterwards (never
// rebuilt, never disposed while the game runs).
import * as THREE from 'three';

let MATS = null;
const mats = () => (MATS ??= {
  suit: new THREE.MeshStandardMaterial({ color: 0x5f6448, roughness: 0.85 }),
  skin: new THREE.MeshStandardMaterial({ color: 0x9a6a4a, roughness: 0.7 }),
  cap: new THREE.MeshStandardMaterial({ color: 0x1f2a3a, roughness: 0.7 }),
  boot: new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.8 }),
});

const capsule = (r, len, m, shadow = true) => {
  const g = new THREE.CapsuleGeometry(r, len, 3, 8);
  g.translate(0, -len / 2 - r, 0); // pivot at the top (joint)
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = shadow;
  return mesh;
};

export class PilotFigure {
  constructor() {
    const M = mats();
    this.root = new THREE.Group();
    this.root.name = 'pilot-on-foot';
    const body = (this.body = new THREE.Group());
    this.root.add(body);
    // Torso, neck, head, cap and peak.
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 3, 10), M.suit);
    torso.scale.set(1.1, 1, 0.66);
    torso.position.y = 1.2;
    torso.castShadow = true;
    body.add(torso);
    const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.1, 3, 10), M.suit);
    hips.rotation.z = Math.PI / 2;
    hips.scale.set(1, 1, 0.75);
    hips.position.y = 0.9;
    body.add(hips);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), M.skin);
    head.position.y = 1.62;
    head.scale.set(0.92, 1.08, 1);
    body.add(head);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.118, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.cap);
    cap.position.y = 1.655;
    body.add(cap);
    const peak = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.015, 0.1), M.cap);
    peak.position.set(0, 1.66, 0.13);
    body.add(peak);
    // Legs (hip pivot > knee pivot > boot) and arms (shoulder > elbow).
    const limb = (x, y, r1, l1, r2, l2, m1, m2, foot) => {
      const top = new THREE.Group();
      top.position.set(x, y, 0);
      const a = capsule(r1, l1, m1);
      top.add(a);
      const joint = new THREE.Group();
      joint.position.y = -(l1 + r1 * 1.4);
      top.add(joint);
      joint.add(capsule(r2, l2, m2));
      if (foot) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.26), M.boot);
        b.position.set(0, -(l2 + r2 * 2) + 0.03, 0.05);
        b.castShadow = true;
        joint.add(b);
      } else {
        const h = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), M.skin);
        h.position.y = -(l2 + r2 * 2);
        joint.add(h);
      }
      body.add(top);
      return { top, joint };
    };
    this.legL = limb(0.1, 0.88, 0.075, 0.3, 0.062, 0.32, M.suit, M.suit, true);
    this.legR = limb(-0.1, 0.88, 0.075, 0.3, 0.062, 0.32, M.suit, M.suit, true);
    this.armL = limb(0.235, 1.44, 0.052, 0.22, 0.045, 0.2, M.suit, M.suit, false);
    this.armR = limb(-0.235, 1.44, 0.052, 0.22, 0.045, 0.2, M.suit, M.suit, false);
    this.phase = 0;
    this.t = 0;
    this.root.visible = false;
  }

  // speed: m/s along the ground (0 = standing).
  animate(dt, speed) {
    this.t += dt;
    const k = Math.min(1, speed / 1.5);
    this.phase += dt * speed * 4.4; // ≈ 1.4 m per stride
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const sw = 0.5 * k;
    this.legL.top.rotation.x = s * sw;
    this.legR.top.rotation.x = -s * sw;
    this.legL.joint.rotation.x = Math.max(0, -c) * 0.7 * k;
    this.legR.joint.rotation.x = Math.max(0, c) * 0.7 * k;
    this.armL.top.rotation.x = -s * 0.4 * k;
    this.armR.top.rotation.x = s * 0.4 * k;
    this.armL.joint.rotation.x = -0.25 - 0.15 * k;
    this.armR.joint.rotation.x = -0.25 - 0.15 * k;
    this.armL.top.rotation.z = 0.06;
    this.armR.top.rotation.z = -0.06;
    // Bob while walking, slow breathing when standing.
    this.body.position.y = k > 0.05 ? Math.abs(c) * 0.035 * k : Math.sin(this.t * 1.6) * 0.006;
  }
}
