// The badeco (ground crew loader): procedural articulated character with PPE
// (coverall, wide-brim hat with neck flap, goggles, half-face respirator,
// nitrile gloves, PVC boots, impermeable apron) and procedural animation.
import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/math.js';

const MAT = () => ({
  coverall: new THREE.MeshStandardMaterial({ color: 0x3f5f86, roughness: 0.85 }),
  stripe: new THREE.MeshStandardMaterial({ color: 0xd9e0d0, roughness: 0.4, emissive: 0x222222 }),
  skin: new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.7 }),
  hat: new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 0.8 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.6 }),
  boot: new THREE.MeshStandardMaterial({ color: 0xf0efe8, roughness: 0.5 }),
  apron: new THREE.MeshStandardMaterial({ color: 0x1f3a2a, roughness: 0.45, metalness: 0.05 }),
  mask: new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.6 }),
  filter: new THREE.MeshStandardMaterial({ color: 0xc23a8a, roughness: 0.5 }),
  goggle: new THREE.MeshStandardMaterial({ color: 0xb8d8e8, roughness: 0.1, transparent: true, opacity: 0.55 }),
  nozzle: new THREE.MeshStandardMaterial({ color: 0x777b7f, roughness: 0.35, metalness: 0.8 }),
});

function cap(r, len, m) {
  const g = new THREE.CapsuleGeometry(r, len, 4, 10);
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  return mesh;
}

export class Badeco {
  constructor(scene) {
    const M = MAT();
    this.M = M;
    this.root = new THREE.Group();
    this.root.name = 'badeco';
    // Hierarchy: root (feet) > hips > spine > chest > neck > head; arms on chest; legs on hips.
    const hips = new THREE.Group();
    hips.position.y = 0.95;
    this.root.add(hips);
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.2), M.coverall);
    pelvis.castShadow = true;
    hips.add(pelvis);
    const spine = new THREE.Group();
    spine.position.y = 0.08;
    hips.add(spine);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.22), M.coverall);
    torso.position.y = 0.27;
    torso.castShadow = true;
    spine.add(torso);
    // Reflective stripes + apron
    for (const y of [0.18, 0.38]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.385, 0.035, 0.225), M.stripe);
      s.position.y = y;
      spine.add(s);
    }
    const apron = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.95, 0.02), M.apron);
    apron.position.set(0, 0.0, 0.125);
    apron.castShadow = true;
    spine.add(apron);
    const neck = new THREE.Group();
    neck.position.y = 0.55;
    spine.add(neck);
    const head = new THREE.Group();
    head.position.y = 0.12;
    neck.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 10), M.skin);
    skull.scale.set(0.95, 1.1, 1);
    skull.castShadow = true;
    head.add(skull);
    // Hat with brim and neck flap.
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.1, 14), M.hat);
    crown.position.y = 0.1;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 18), M.hat);
    brim.position.y = 0.06;
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.01), M.hat);
    flap.position.set(0, -0.02, -0.12);
    flap.rotation.x = 0.25;
    head.add(crown, brim, flap);
    // Goggles + respirator with two cartridges.
    const gog = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.045, 0.03), M.goggle);
    gog.position.set(0, 0.025, 0.095);
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.mask);
    mask.rotation.x = Math.PI / 2;
    mask.position.set(0, -0.045, 0.085);
    head.add(gog, mask);
    for (const sx of [1, -1]) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10), M.filter);
      f.rotation.z = Math.PI / 2;
      f.rotation.y = sx * 0.6;
      f.position.set(sx * 0.055, -0.055, 0.12);
      head.add(f);
    }
    // Arms
    const arm = (sx) => {
      const sh = new THREE.Group();
      sh.position.set(sx * 0.23, 0.48, 0);
      spine.add(sh);
      const upper = cap(0.05, 0.22, M.coverall);
      upper.position.y = -0.15;
      sh.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      sh.add(elbow);
      const fore = cap(0.045, 0.2, M.coverall);
      fore.position.y = -0.13;
      elbow.add(fore);
      const hand = new THREE.Group();
      hand.position.y = -0.27;
      elbow.add(hand);
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), M.glove);
      glove.scale.set(0.8, 1.2, 0.6);
      glove.castShadow = true;
      hand.add(glove);
      const cuff = cap(0.048, 0.06, M.glove);
      cuff.position.y = 0.06;
      hand.add(cuff);
      return { sh, elbow, hand };
    };
    const leg = (sx) => {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.1, -0.06, 0);
      hips.add(hip);
      const thigh = cap(0.068, 0.3, M.coverall);
      thigh.position.y = -0.21;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.43;
      hip.add(knee);
      const shin = cap(0.058, 0.22, M.coverall);
      shin.position.y = -0.14;
      knee.add(shin);
      const boot = cap(0.065, 0.22, M.boot);
      boot.position.y = -0.3;
      knee.add(boot);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.24), M.boot);
      foot.position.set(0, -0.42, 0.05);
      foot.castShadow = true;
      knee.add(foot);
      return { hip, knee };
    };
    this.parts = { hips, spine, neck, head, armL: arm(1), armR: arm(-1), legL: leg(1), legR: leg(-1) };
    // Hose nozzle held in the right hand when carrying a hose.
    this.nozzle = new THREE.Group();
    const nz = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.28, 8), M.nozzle);
    nz.rotation.x = Math.PI / 2;
    nz.position.z = 0.1;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.04), M.mask);
    handle.position.set(0, -0.04, 0);
    this.nozzle.add(nz, handle);
    this.nozzle.position.set(0, -0.06, 0.03);
    this.nozzle.visible = false;
    this.parts.armR.hand.add(this.nozzle);
    scene.add(this.root);

    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.phase = 0;
    this.speed = 0;
    this.pose = 'idle';
    this.poseBlend = 0;
    this.reachTarget = null;
    this.t = 0;
    this.crouch = 0;
    this.lookAt = null;
  }

  setPosition(x, y, z) { this.pos.set(x, y, z); }

  // Hand world position (for hose attachment).
  handWorld(out) {
    this.root.updateMatrixWorld(true);
    return out.setFromMatrixPosition(this.nozzle.matrixWorld);
  }
  nozzleTip(out) {
    this.root.updateMatrixWorld(true);
    return out.set(0, 0, 0.24).applyMatrix4(this.nozzle.matrixWorld);
  }

  // Animate: walking (speed m/s), idle, reach toward a world point, crouch, wave.
  animate(dt, ground) {
    this.t += dt;
    const P = this.parts;
    const walking = this.speed > 0.05;
    this.phase += dt * this.speed * 3.3;
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const wk = clamp(this.speed / 1.3, 0, 1.6);
    const run = clamp((this.speed - 1.8) / 1.2, 0, 1);
    this.crouch = damp(this.crouch, this.pose === 'crouch' || this.pose === 'reachLow' ? 1 : 0, 5, dt);
    // Legs
    const legSwing = 0.48 * wk * (1 + run * 0.3);
    P.legL.hip.rotation.x = walking ? s * legSwing - this.crouch * 0.9 : -this.crouch * 1.0;
    P.legR.hip.rotation.x = walking ? -s * legSwing - this.crouch * 0.9 : -this.crouch * 0.6;
    P.legL.knee.rotation.x = walking ? Math.max(0, -c) * 0.9 * wk : this.crouch * 1.7;
    P.legR.knee.rotation.x = walking ? Math.max(0, c) * 0.9 * wk : this.crouch * 1.2;
    // Body bob, lean, breathing
    const bob = walking ? Math.abs(s) * 0.03 * wk : Math.sin(this.t * 1.6) * 0.004;
    P.hips.position.y = 0.95 + bob - this.crouch * 0.32;
    P.spine.rotation.x = walking ? 0.06 * wk + run * 0.15 : this.crouch * 0.35 + (this.pose === 'reach' ? 0.45 : 0);
    P.hips.rotation.y = walking ? s * 0.08 * wk : 0;
    P.spine.rotation.y = walking ? -s * 0.12 * wk : Math.sin(this.t * 0.4) * 0.05;
    // Arms
    const armSwing = 0.45 * wk;
    let lx = walking ? -s * armSwing : 0.05 * Math.sin(this.t * 1.1);
    let rx = walking ? s * armSwing : 0.05 * Math.sin(this.t * 1.3 + 1);
    let lz = 0.08, rz = -0.08, le = -0.15, re = -0.15;
    if (this.pose === 'carry') { rx = -0.55; re = -0.9; rz = -0.15; }
    if (this.pose === 'reach' || this.pose === 'reachLow' || this.pose === 'hold') {
      rx = -1.15; re = -0.35; lx = -0.95; le = -0.5; lz = -0.2;
      if (this.pose === 'hold') { rx = -1.0; re = -0.5; lx = -0.7; le = -0.9; }
    }
    if (this.pose === 'wave') { rx = -2.7 + Math.sin(this.t * 9) * 0.25; re = -0.3; rz = -0.3; }
    if (this.pose === 'thumbs') { rx = -1.6; re = -1.2; rz = -0.2; }
    const ab = 1 - Math.exp(-10 * dt);
    P.armL.sh.rotation.x = lerp(P.armL.sh.rotation.x, lx, ab);
    P.armR.sh.rotation.x = lerp(P.armR.sh.rotation.x, rx, ab);
    P.armL.sh.rotation.z = lerp(P.armL.sh.rotation.z, lz, ab);
    P.armR.sh.rotation.z = lerp(P.armR.sh.rotation.z, rz, ab);
    P.armL.elbow.rotation.x = lerp(P.armL.elbow.rotation.x, le, ab);
    P.armR.elbow.rotation.x = lerp(P.armR.elbow.rotation.x, re, ab);
    // Head looks toward the work (or around while idle).
    P.neck.rotation.y = this.pose === 'idle' && !walking ? Math.sin(this.t * 0.31) * 0.5 : 0;
    P.neck.rotation.x = this.pose === 'reach' || this.pose === 'reachLow' ? 0.35 : 0;
    // Place on the ground.
    const gy = ground(this.pos.x, this.pos.z);
    this.root.position.set(this.pos.x, gy, this.pos.z);
    this.root.rotation.y = this.heading;
  }
}
