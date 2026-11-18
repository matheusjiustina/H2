// The badeco (ground crew loader), Badeco 2.0: a rounded, stylised farm
// worker in the game's look — cap with a neck flap, long-sleeved work shirt
// with reflective bands, work trousers, rubber gloves, boots — built from
// lathed and capsule shapes (no boxes), one vertex-coloured mesh per body
// segment on one shared material (13 draw calls for the whole figure, no
// textures), and the procedural animation set the service needs: idle,
// walk, turn, carry the hose, reach, reach low / crouch, hold, climb a
// ladder, thumbs up. The skeleton is plain groups (no skinning).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, damp, lerp } from '../core/math.js';

const C = {
  shirt: 0x41678f, band: 0xd9dfd2, trousers: 0x3b4148, skin: 0x8a5a3c, cap: 0xd8cfb4,
  capBrim: 0x2f5a34, glove: 0x2e7d52, boot: 0x2a2623, sole: 0x161412, belt: 0x2a2018,
  nozzle: 0x7a7e83, grip: 0x222426, hair: 0x2b2018,
};

// Geometry helpers: every part gets its colour as a vertex attribute.
function paint(g, hex) {
  g = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
const lathe = (pts, seg = 14) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const capsule = (r, len, seg = 10) => new THREE.CapsuleGeometry(r, len, 3, seg);
// A limb segment hanging from its joint: tapering from r0 (top) to r1
// (bottom) over len, with rounded ends (a lathed, tapered capsule).
function limb(r0, r1, len, seg = 10) {
  const out = [];
  for (let i = 0; i <= 4; i++) { const a = (i / 4) * Math.PI / 2; out.push([Math.sin(a) * r0, Math.cos(a) * r0 * 0.6]); }
  out.push([r1, -len]);
  for (let i = 1; i <= 4; i++) { const a = (i / 4) * Math.PI / 2; out.push([Math.cos(a) * r1, -len - Math.sin(a) * r1 * 0.6]); }
  // (Lathe wants the profile from bottom to top for outward normals.)
  return lathe(out.reverse().map(([r, y]) => [Math.max(0.0005, r), y]), seg);
}

export class Badeco {
  constructor(scene) {
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02 });
    this.root = new THREE.Group();
    this.root.name = 'badeco';
    const mesh = (parts, parent, name) => {
      const m = new THREE.Mesh(mergeGeometries(parts), this.mat);
      m.castShadow = true;
      m.name = name;
      parent.add(m);
      return m;
    };
    // Hierarchy: root (feet) > hips > spine > (neck > head, arms); legs on hips.
    const hips = new THREE.Group();
    hips.position.y = 0.95;
    this.root.add(hips);
    // Pelvis: rounded, belt line.
    mesh([
      paint(lathe([[0.001, -0.1], [0.12, -0.09], [0.165, -0.03], [0.17, 0.04], [0.16, 0.09], [0.001, 0.1]]).scale(1, 1, 0.72), C.trousers),
      paint(new THREE.TorusGeometry(0.168, 0.018, 6, 20).rotateX(Math.PI / 2).scale(1, 1, 0.72).translate(0, 0.07, 0), C.belt),
    ], hips, 'pelvis');
    const spine = new THREE.Group();
    spine.position.y = 0.08;
    hips.add(spine);
    // Torso: waist → chest → rounded shoulders (lathe, flattened front-back).
    const torsoPts = [[0.001, -0.02], [0.155, -0.01], [0.16, 0.1], [0.18, 0.24], [0.195, 0.36], [0.19, 0.44], [0.15, 0.5], [0.07, 0.54], [0.001, 0.545]];
    mesh([
      paint(lathe(torsoPts, 18).scale(1, 1, 0.66), C.shirt),
      // Reflective bands round the chest and the waist.
      paint(new THREE.TorusGeometry(0.183, 0.012, 5, 22).rotateX(Math.PI / 2).scale(1, 1, 0.68).translate(0, 0.26, 0), C.band),
      paint(new THREE.TorusGeometry(0.193, 0.012, 5, 22).rotateX(Math.PI / 2).scale(1, 1, 0.68).translate(0, 0.38, 0), C.band),
      // Collar.
      paint(new THREE.TorusGeometry(0.065, 0.022, 6, 16).rotateX(Math.PI / 2).translate(0, 0.535, 0.005), C.shirt),
    ], spine, 'torso');
    const neck = new THREE.Group();
    neck.position.y = 0.54;
    spine.add(neck);
    const head = new THREE.Group();
    head.position.y = 0.075;
    neck.add(head);
    // Neck, head (egg-shaped, a nose and ears), cap with visor and neck flap.
    const skull = new THREE.SphereGeometry(0.1, 16, 12).scale(0.9, 1.08, 0.98).translate(0, 0.09, 0);
    const jaw = new THREE.SphereGeometry(0.075, 12, 8).scale(1, 0.8, 1).translate(0, 0.035, 0.018);
    const nose = new THREE.SphereGeometry(0.018, 8, 6).scale(0.8, 1, 1.2).translate(0, 0.075, 0.098);
    const ears = [-1, 1].map((s) => new THREE.SphereGeometry(0.022, 8, 6).scale(0.5, 1, 0.8).translate(s * 0.088, 0.085, -0.005));
    const capCrown = new THREE.SphereGeometry(0.102, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.95, 0.72, 1.02).translate(0, 0.135, -0.004);
    const visor = new THREE.CylinderGeometry(0.075, 0.075, 0.012, 16, 1, false, -Math.PI / 2, Math.PI).scale(1.15, 1, 1.25).rotateY(Math.PI).rotateX(0.12).translate(0, 0.14, 0.072);
    const flap = new THREE.CylinderGeometry(0.1, 0.112, 0.07, 14, 1, true, Math.PI * 0.62, Math.PI * 0.76).translate(0, 0.105, -0.006);
    mesh([
      paint(capsule(0.045, 0.05, 10).translate(0, -0.02, 0), C.skin),
      paint(skull, C.skin), paint(jaw, C.skin), paint(nose, C.skin), ...ears.map((e) => paint(e, C.skin)),
      paint(capCrown, C.cap), paint(visor, C.capBrim), paint(flap, C.cap),
    ], head, 'head');
    // Arms: shoulder ball, tapered sleeve, elbow, forearm, cuffed glove.
    const arm = (sx) => {
      const sh = new THREE.Group();
      sh.position.set(sx * 0.2, 0.455, 0);
      spine.add(sh);
      mesh([
        paint(new THREE.SphereGeometry(0.062, 10, 8), C.shirt),
        paint(limb(0.056, 0.046, 0.25, 10), C.shirt),
        paint(new THREE.TorusGeometry(0.05, 0.008, 5, 12).rotateX(Math.PI / 2).translate(0, -0.12, 0), C.band),
      ], sh, 'upperArm');
      const elbow = new THREE.Group();
      elbow.position.y = -0.285;
      sh.add(elbow);
      mesh([paint(limb(0.046, 0.036, 0.21, 10), C.shirt)], elbow, 'foreArm');
      const hand = new THREE.Group();
      hand.position.y = -0.255;
      elbow.add(hand);
      // Glove: cuff, palm (flattened sphere), fingers block rounded, thumb.
      mesh([
        paint(new THREE.CylinderGeometry(0.044, 0.04, 0.06, 10).translate(0, 0.035, 0), C.glove),
        paint(new THREE.SphereGeometry(0.042, 10, 8).scale(0.8, 1.05, 0.55).translate(0, -0.02, 0), C.glove),
        paint(capsule(0.03, 0.03, 8).scale(1.15, 1, 0.6).translate(0, -0.075, 0.004), C.glove),
        paint(capsule(0.014, 0.03, 6).rotateZ(sx * 0.6).translate(sx * 0.035, -0.02, 0.015), C.glove),
      ], hand, 'hand');
      return { sh, elbow, hand };
    };
    // Legs: thigh, knee, shin with the trouser hem over the boot, foot.
    const leg = (sx) => {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.092, -0.06, 0);
      hips.add(hip);
      mesh([paint(limb(0.08, 0.062, 0.4, 12), C.trousers)], hip, 'thigh');
      const knee = new THREE.Group();
      knee.position.y = -0.43;
      hip.add(knee);
      // Boot: shaft, rounded toe, heel, sole.
      const boot = [
        paint(new THREE.CylinderGeometry(0.058, 0.062, 0.2, 12).translate(0, -0.33, 0), C.boot),
        paint(new THREE.SphereGeometry(0.06, 12, 8).scale(1, 0.7, 1.6).translate(0, -0.415, 0.06), C.boot),
        paint(new THREE.SphereGeometry(0.058, 10, 8).scale(1, 0.7, 1).translate(0, -0.42, -0.02), C.boot),
        paint(new THREE.CylinderGeometry(0.062, 0.062, 0.02, 12).scale(1, 1, 2.05).translate(0, -0.455, 0.035), C.sole),
      ];
      mesh([paint(limb(0.062, 0.055, 0.25, 12), C.trousers), ...boot], knee, 'shin');
      return { hip, knee };
    };
    this.parts = { hips, spine, neck, head, armL: arm(1), armR: arm(-1), legL: leg(1), legR: leg(-1) };
    // Hose nozzle held in the right hand while carrying a hose.
    this.nozzle = new THREE.Group();
    this.nozzle.add(new THREE.Mesh(mergeGeometries([
      paint(new THREE.CylinderGeometry(0.025, 0.03, 0.28, 8).rotateX(Math.PI / 2).translate(0, 0, 0.1), C.nozzle),
      paint(new THREE.BoxGeometry(0.03, 0.08, 0.04).translate(0, -0.04, 0), C.grip),
    ]), this.mat));
    this.nozzle.position.set(0, -0.07, 0.03);
    this.nozzle.visible = false;
    this.parts.armR.hand.add(this.nozzle);
    scene.add(this.root);

    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.phase = 0;
    this.speed = 0;
    this.pose = 'idle';
    this.t = 0;
    this.crouch = 0;
    this.climb = 0; // ladder: height of the feet above the ground (m)
    this.climbPhase = 0;
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

  // Animate: walking (speed m/s), idle, reach toward a point, crouch, carry,
  // hold, climb (on a ladder: this.climb metres up, climbing while it changes).
  animate(dt, ground) {
    this.t += dt;
    const P = this.parts;
    const walking = this.speed > 0.05 && this.pose !== 'climb';
    this.phase += dt * this.speed * 3.3;
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const wk = clamp(this.speed / 1.3, 0, 1.6);
    const run = clamp((this.speed - 1.8) / 1.2, 0, 1);
    this.crouch = damp(this.crouch, this.pose === 'crouch' || this.pose === 'reachLow' ? 1 : 0, 5, dt);
    const ab = 1 - Math.exp(-10 * dt);
    let lhx, rhx, lkx, rkx;
    if (this.pose === 'climb') {
      // Alternating step-up on the rungs, hands on the rails.
      const k = Math.sin(this.climbPhase);
      lhx = -0.6 - 0.45 * Math.max(0, k); rhx = -0.6 - 0.45 * Math.max(0, -k);
      lkx = 0.9 * Math.max(0, k) + 0.15; rkx = 0.9 * Math.max(0, -k) + 0.15;
    } else {
      const legSwing = 0.48 * wk * (1 + run * 0.3);
      lhx = walking ? s * legSwing - this.crouch * 0.9 : -this.crouch * 1.0;
      rhx = walking ? -s * legSwing - this.crouch * 0.9 : -this.crouch * 0.6;
      lkx = walking ? Math.max(0, -c) * 0.9 * wk : this.crouch * 1.7;
      rkx = walking ? Math.max(0, c) * 0.9 * wk : this.crouch * 1.2;
    }
    P.legL.hip.rotation.x = lerp(P.legL.hip.rotation.x, lhx, walking ? 1 : ab);
    P.legR.hip.rotation.x = lerp(P.legR.hip.rotation.x, rhx, walking ? 1 : ab);
    P.legL.knee.rotation.x = lerp(P.legL.knee.rotation.x, lkx, walking ? 1 : ab);
    P.legR.knee.rotation.x = lerp(P.legR.knee.rotation.x, rkx, walking ? 1 : ab);
    // Body bob, lean, breathing.
    const bob = walking ? Math.abs(s) * 0.03 * wk : Math.sin(this.t * 1.6) * 0.004;
    P.hips.position.y = 0.95 + bob - this.crouch * 0.32;
    P.spine.rotation.x = walking ? 0.06 * wk + run * 0.15 : this.crouch * 0.35 + (this.pose === 'reach' ? 0.45 : 0) + (this.pose === 'climb' ? 0.12 : 0);
    P.hips.rotation.y = walking ? s * 0.08 * wk : 0;
    P.spine.rotation.y = walking ? -s * 0.12 * wk : Math.sin(this.t * 0.4) * 0.05;
    // Arms.
    const armSwing = 0.45 * wk;
    let lx = walking ? -s * armSwing : 0.05 * Math.sin(this.t * 1.1);
    let rx = walking ? s * armSwing : 0.05 * Math.sin(this.t * 1.3 + 1);
    let lz = 0.08, rz = -0.08, le = -0.15, re = -0.15;
    if (this.pose === 'carry') { rx = -0.55; re = -0.9; rz = -0.15; }
    if (this.pose === 'reach' || this.pose === 'reachLow' || this.pose === 'hold') {
      rx = -1.15; re = -0.35; lx = -0.95; le = -0.5; lz = -0.2;
      if (this.pose === 'hold') { rx = -1.0; re = -0.5; lx = -0.7; le = -0.9; }
    }
    if (this.pose === 'reachUp') { rx = -2.3; re = -0.25; lx = -1.6; le = -0.4; lz = -0.1; }
    if (this.pose === 'climb') {
      const k = Math.sin(this.climbPhase);
      lx = -2.0 - 0.35 * Math.max(0, -k); rx = -2.0 - 0.35 * Math.max(0, k); le = -0.55; re = -0.55; lz = 0.12; rz = -0.12;
    }
    if (this.pose === 'wave') { rx = -2.7 + Math.sin(this.t * 9) * 0.25; re = -0.3; rz = -0.3; }
    if (this.pose === 'thumbs') { rx = -1.6; re = -1.2; rz = -0.2; }
    P.armL.sh.rotation.x = lerp(P.armL.sh.rotation.x, lx, ab);
    P.armR.sh.rotation.x = lerp(P.armR.sh.rotation.x, rx, ab);
    P.armL.sh.rotation.z = lerp(P.armL.sh.rotation.z, lz, ab);
    P.armR.sh.rotation.z = lerp(P.armR.sh.rotation.z, rz, ab);
    P.armL.elbow.rotation.x = lerp(P.armL.elbow.rotation.x, le, ab);
    P.armR.elbow.rotation.x = lerp(P.armR.elbow.rotation.x, re, ab);
    // Head looks toward the work (or around while idle).
    P.neck.rotation.y = this.pose === 'idle' && !walking ? Math.sin(this.t * 0.31) * 0.5 : 0;
    P.neck.rotation.x = this.pose === 'reach' || this.pose === 'reachLow' ? 0.35 : this.pose === 'reachUp' ? -0.3 : 0;
    // Place on the ground (or on the ladder).
    const gy = ground(this.pos.x, this.pos.z);
    this.root.position.set(this.pos.x, gy + this.climb, this.pos.z);
    this.root.rotation.y = this.heading;
  }
}
