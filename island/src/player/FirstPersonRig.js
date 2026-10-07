import * as THREE from 'three';
import { LAYER } from '../core/Shared.js';
import { patchMaterial } from '../core/MaterialPatch.js';
import { damp, clamp, lerp, smoothstep } from '../utils/MathUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Finger definitions for a right hand (metres). x: towards thumb is negative.
const FINGERS = [
  { name: 'index', x: -0.029, len: [0.043, 0.026, 0.02], r: 0.0092 },
  { name: 'middle', x: -0.009, len: [0.048, 0.029, 0.021], r: 0.0095 },
  { name: 'ring', x: 0.011, len: [0.045, 0.027, 0.02], r: 0.009 },
  { name: 'pinky', x: 0.029, len: [0.035, 0.021, 0.018], r: 0.0078 },
];
const THUMB = { len: [0.042, 0.032, 0.026], r: 0.0108 };

function capsule(r, len) {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 2 + r * 0.6), 4, 10);
  // capsule along -Z starting at origin
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -len / 2 + r * 0.3);
  return g;
}

function roundedPalm() {
  const g = new THREE.BoxGeometry(0.084, 0.03, 0.096, 6, 3, 6);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // round the box
    const nx = v.x / 0.042, ny = v.y / 0.015, nz = v.z / 0.048;
    const k = 1 - 0.12 * (nx * nx * ny * ny + ny * ny * nz * nz * 0.5);
    v.x *= k * (1 - 0.08 * (nz + 1) * 0.5);
    v.y *= 1 - 0.25 * nx * nx;
    // palm thicker at the heel, thenar bulge near the thumb
    if (v.y < 0) v.y -= 0.004 * Math.max(0, 1 - Math.hypot(nx + 0.6, nz - 0.5));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  g.translate(0, 0, -0.048);
  return g;
}

function forearm(len = 0.27) {
  const g = new THREE.CylinderGeometry(0.03, 0.026, len, 14, 6, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = (y + len / 2) / len; // 0 wrist .. 1 elbow
    const s = 1 + 0.38 * smoothstep(0.1, 0.8, t);
    p.setX(i, p.getX(i) * s * 1.12);
    p.setZ(i, p.getZ(i) * s * 0.88);
  }
  g.computeVertexNormals();
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, len / 2 - 0.005);
  return g;
}

/**
 * Pose: wrist position in camera space, roll of the hand around the forearm axis,
 * wrist bend (pitch, yaw) applied to the palm bone, finger curls [thumb, index..pinky].
 * The forearm always points from the wrist towards an elbow anchor below the screen.
 */
const P = (x, y, z, roll, bp, by, curl, thumb = curl, spread = 0) => ({ pos: new THREE.Vector3(x, y, z), roll, bend: new THREE.Vector2(bp, by), curl: [thumb, curl, curl, curl, curl], spread });

const POSES = {
  rightIdle: P(0.17, -0.43, -0.3, -1.05, 0.05, 0.25, 0.38, 0.25),
  leftIdle: P(-0.18, -0.44, -0.31, 1.05, 0.05, 0.25, 0.42, 0.25),
  rightHold: P(0.13, -0.24, -0.33, -1.35, 0.2, 0.15, 0.6, 0.45),
  rightPalmUp: P(0.1, -0.25, -0.33, -2.75, -0.15, 0.05, 0.3, 0.3),
  rightGrip: P(0.15, -0.21, -0.36, -1.5, 0.0, 0.08, 0.92, 0.75),
  rightLantern: P(0.16, -0.12, -0.38, -1.5, -0.25, 0.0, 0.95, 0.8),
  rightMug: P(0.13, -0.2, -0.32, -1.45, 0.1, 0.2, 0.75, 0.6),
  rightCamera: P(0.085, -0.16, -0.3, -1.55, 0.1, 0.25, 0.65, 0.5),
  leftCamera: P(-0.085, -0.17, -0.3, 1.55, 0.1, 0.25, 0.55, 0.4),
  rightCameraAim: P(0.07, -0.05, -0.18, -1.55, 0.0, 0.3, 0.65, 0.5),
  leftCameraAim: P(-0.07, -0.055, -0.18, 1.55, 0.0, 0.3, 0.55, 0.4),
  rightBino: P(0.05, -0.16, -0.27, -1.45, 0.1, 0.2, 0.8, 0.6),
  leftBino: P(-0.05, -0.16, -0.27, 1.45, 0.1, 0.2, 0.8, 0.6),
  rightBinoAim: P(0.04, -0.04, -0.13, -1.5, 0.0, 0.25, 0.8, 0.6),
  leftBinoAim: P(-0.04, -0.04, -0.13, 1.5, 0.0, 0.25, 0.8, 0.6),
  rightReach: P(0.12, -0.14, -0.45, -0.7, 0.0, 0.0, 0.12, 0.1),
  rightThrowBack: P(0.24, -0.07, -0.13, -1.2, 0.4, 0.0, 0.85, 0.8),
  rightThrowFwd: P(0.1, -0.13, -0.52, -0.9, -0.2, 0.0, 0.1, 0.1),
  rightDrink: P(0.035, -0.09, -0.18, -1.5, 0.35, 0.6, 0.75, 0.6),
  rightTiller: P(0.21, -0.4, -0.26, -1.1, 0.2, 0.2, 0.9, 0.7),
  leftBoat: P(-0.25, -0.42, -0.29, 0.8, 0.2, 0.2, 0.55, 0.4),
  rightSwim: P(0.14, -0.27, -0.44, -0.5, -0.1, 0.1, 0.12, 0.1),
  leftSwim: P(-0.14, -0.27, -0.44, 0.5, -0.1, 0.1, 0.12, 0.1),
  rightRun: P(0.19, -0.34, -0.32, -1.25, 0.1, 0.2, 0.7, 0.55),
  leftRun: P(-0.2, -0.35, -0.33, 1.25, 0.1, 0.2, 0.7, 0.55),
  hidden: P(0.25, -0.8, -0.1, -0.9, 0.3, 0.2, 0.4),
  hiddenL: P(-0.25, -0.8, -0.1, 0.9, 0.3, 0.2, 0.4),
};
const ELBOW = { right: new THREE.Vector3(0.24, -0.4, 0.2), left: new THREE.Vector3(-0.24, -0.4, 0.2) };
const _Z = new THREE.Vector3(0, 0, 1);

/**
 * One hand + forearm as a single SkinnedMesh with rigidly bound parts (one draw call
 * per material). Bones mirror the old group hierarchy so finger curls stay simple.
 */
class Hand {
  constructor(side, skin, sleeve, extra) {
    this.side = side;
    this.root = new THREE.Group(); // wrist, positioned in camera space
    this.root.scale.x = side === 'left' ? -1 : 1;
    const bones = [];
    const bone = (parent, x = 0, y = 0, z = 0) => {
      const b = new THREE.Bone();
      b.position.set(x, y, z);
      if (parent) parent.add(b);
      bones.push(b);
      return b;
    };
    const wrist = bone(null);
    this.palm = bone(wrist);
    this.fingers = [];
    for (const f of FINGERS) {
      const joints = [];
      let parent = this.palm;
      for (let s = 0; s < 3; s++) {
        const j = bone(parent, s === 0 ? f.x : 0, s === 0 ? 0.002 : 0, s === 0 ? -0.094 : -f.len[s - 1]);
        joints.push(j);
        parent = j;
      }
      this.fingers.push(joints);
    }
    const tb = bone(this.palm, -0.036, -0.006, -0.026);
    const t1 = bone(tb, 0, 0, -THUMB.len[0]);
    const t2 = bone(t1, 0, 0, -THUMB.len[1]);
    this.thumb = [tb, t1, t2];
    wrist.updateMatrixWorld(true);

    // parts per material group: [geometry in bone space, bone]; skin parts get vertex tints
    const tint = (g, fn) => {
      const p = g.attributes.position;
      const c = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { const t = fn(p.getX(i), p.getY(i), p.getZ(i)); c[i * 3] = t[0]; c[i * 3 + 1] = t[1]; c[i * 3 + 2] = t[2]; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      return g;
    };
    const phal = (r, len, distal) => {
      const g = tint(capsule(r, len), (x, y, z) => {
        const joint = Math.exp(-((z + 0.004) ** 2) / 0.00008);
        return [1.0 + joint * 0.06, 0.97 - joint * 0.08, 0.95 - joint * 0.09];
      });
      if (!distal) return g;
      const nail = new THREE.SphereGeometry(r * 0.78, 8, 5);
      nail.scale(1, 0.32, 1.15);
      nail.translate(0, r * 0.72, -len + r * 1.25);
      tint(nail, () => [1.28, 1.12, 1.05]);
      return mergeGeometries([g.index ? g.toNonIndexed() : g, nail.toNonIndexed()], false);
    };
    const groups = [[], [], []];
    groups[0].push([tint(forearm(), (x, y) => (y > 0 ? [0.96, 0.92, 0.9] : [1.03, 0.98, 0.96])), wrist]);
    groups[0].push([tint(roundedPalm(), (x, y, z) => (y > 0.004 ? [0.94, 0.9, 0.88] : [1.1, 0.98, 0.95])), this.palm]);
    this.fingers.forEach((joints, fi) => joints.forEach((j, s) => groups[0].push([phal(FINGERS[fi].r * (1 - s * 0.08), FINGERS[fi].len[s], s === 2), j])));
    this.thumb.forEach((j, s) => groups[0].push([phal(THUMB.r * (1 - s * 0.1), THUMB.len[s], s === 2), j]));
    // shirt sleeve rolled to mid forearm: loose, slightly creased fabric with a thick rolled cuff
    const sl = new THREE.CylinderGeometry(0.056, 0.047, 0.21, 16, 6, true);
    {
      const p = sl.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const a = Math.atan2(p.getZ(i), p.getX(i)), y = p.getY(i);
        const crease = 1 + 0.06 * Math.sin(a * 3 + y * 40) * Math.sin(y * 25 + 1.3);
        p.setX(i, p.getX(i) * crease * 1.08);
        p.setZ(i, p.getZ(i) * crease * 0.92);
      }
      sl.computeVertexNormals();
    }
    sl.rotateX(Math.PI / 2);
    sl.translate(0, 0.003, 0.235);
    const cuff = new THREE.TorusGeometry(0.05, 0.014, 8, 18);
    cuff.scale(1.08, 0.92, 1.25);
    cuff.translate(0, 0.003, 0.135);
    groups[1].push([sl, wrist], [cuff, wrist]);
    const materials = [skin, sleeve];
    if (extra) {
      const parts = extra(this);
      groups[2].push(...parts.geos.map((g) => [g, wrist]));
      materials.push(parts.material);
    }
    const all = [];
    const groupRanges = [];
    let start = 0;
    groups.forEach((list, gi) => {
      let count = 0;
      for (const [g0, b] of list) {
        const g = (g0.index ? g0.toNonIndexed() : g0).clone();
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
        g.applyMatrix4(b.matrixWorld);
        const n = g.attributes.position.count;
        const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
        const bi = bones.indexOf(b);
        for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
        g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
        g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
        all.push(g);
        count += n;
      }
      if (count) groupRanges.push([start, count, gi]);
      start += count;
    });
    const geo = mergeGeometries(all, false);
    for (const [st, c, gi] of groupRanges) geo.addGroup(st, c, gi);
    const mesh = new THREE.SkinnedMesh(geo, materials);
    mesh.add(wrist);
    mesh.bind(new THREE.Skeleton(bones));
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.layers.set(LAYER.VIEWMODEL);
    this.root.add(mesh);
    this.mesh = mesh;
    // grip anchor where held items attach (centre of the curled fingers)
    this.grip = new THREE.Group();
    this.grip.position.set(-0.004, -0.032, -0.07);
    this.palm.add(this.grip);

    this.cur = { pos: new THREE.Vector3(), roll: 0, bend: new THREE.Vector2(), quat: new THREE.Quaternion(), curl: [0.3, 0.3, 0.3, 0.3, 0.3] };
    this.vel = new THREE.Vector3();
  }

  applyCurl(curl, spread = 0) {
    this.fingers.forEach((joints, i) => {
      const c = curl[i + 1];
      joints[0].rotation.set(-c * 1.35, (i - 1.5) * (0.06 + spread * 0.08), 0);
      joints[1].rotation.set(-c * 1.6, 0, 0);
      joints[2].rotation.set(-c * 1.1, 0, 0);
    });
    const t = curl[0];
    this.thumb[0].rotation.set(-0.35 - t * 0.35, 0.75 - t * 0.45, -0.6 - t * 0.5, 'YXZ');
    this.thumb[1].rotation.set(-t * 0.7, 0, 0);
    this.thumb[2].rotation.set(-t * 0.9, 0, 0);
  }
}

/**
 * First person hands + forearms with procedural animation (walk sway, look lag,
 * breathing, landing) and simple pose blending for holding / reaching / throwing.
 */
export class FirstPersonRig {
  constructor(camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.name = 'viewmodel';
    camera.add(this.group);
    // sun-tanned skin: a little rougher and with a soft warm sheen so it reads as skin rather than vinyl
    const skin = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0xb7866a), roughness: 0.6, sheen: 0.4, sheenColor: new THREE.Color(0xe39a7c), sheenRoughness: 0.42, specularIntensity: 0.6, vertexColors: true });
    patchMaterial(skin, { translucency: 0.35, wet: 0.6, canopy: false, caustics: false, fog: true, key: 'skin' });
    const sleeve = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0x8c8466), roughness: 0.92, sheen: 0.5, sheenColor: new THREE.Color(0xd8d4c0), side: THREE.DoubleSide });
    patchMaterial(sleeve, { wet: 1.0, canopy: false, caustics: false, key: 'sleeve' });
    this.skin = skin;
    this.watchCanvas = document.createElement('canvas');
    this.watchCanvas.width = this.watchCanvas.height = 64;
    this.watchTex = new THREE.CanvasTexture(this.watchCanvas);
    this.watchTex.colorSpace = THREE.SRGBColorSpace;
    this.right = new Hand('right', skin, sleeve);
    this.left = new Hand('left', skin, sleeve, () => {
      // wrist watch (band + case + dial) bound to the wrist bone
      const band = new THREE.TorusGeometry(0.032, 0.006, 6, 18);
      band.scale(1.12, 0.88, 1.7);
      band.translate(0, 0, 0.03);
      const face = new THREE.CylinderGeometry(0.016, 0.016, 0.006, 20);
      face.translate(0, 0.032, 0.03);
      const dial = new THREE.CircleGeometry(0.0135, 20);
      dial.rotateX(-Math.PI / 2);
      dial.translate(0, 0.0352, 0.03);
      // dial uvs only matter for the face; band/case sample a dark corner of the watch texture
      for (const g of [band, face]) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.02, 0.02); }
      return { geos: [band, face, dial], material: new THREE.MeshStandardMaterial({ map: this.watchTex, roughness: 0.35, metalness: 0.2 }) };
    });
    this.group.add(this.right.root, this.left.root);
    this.rightTarget = POSES.rightIdle;
    this.leftTarget = POSES.leftIdle;
    this.heldObject = null;
    this.heldOffset = null;
    this.action = null; // { type, t, duration, target }
    this.time = 0;
    this.swayX = 0; this.swayY = 0;
    this.walkPhase = 0;
    this.visible = true;
    this.lastMinute = -1;
    this.right.cur.pos.copy(POSES.hidden.pos);
    this.left.cur.pos.copy(POSES.hiddenL.pos);
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
  }

  /**
   * Hold an object in the right hand. offset.pos is relative to the right wrist in
   * camera space, offset.rot the object's camera space orientation.
   */
  hold(object, offset = {}) {
    this.release();
    if (!object) return;
    this.heldObject = object;
    object.traverse((o) => { o.layers.set(LAYER.VIEWMODEL); o.castShadow = false; o.frustumCulled = false; });
    this.heldOffset = {
      pos: offset.pos ? offset.pos.clone() : new THREE.Vector3(),
      quat: new THREE.Quaternion().setFromEuler(offset.rot || new THREE.Euler()),
      left: !!offset.left,
    };
    object.scale.setScalar(offset.scale || 1);
    this.group.add(object);
  }

  release() {
    if (this.heldObject) this.group.remove(this.heldObject);
    const o = this.heldObject;
    this.heldObject = null;
    return o;
  }

  play(type, opts = {}) {
    this.action = { type, t: 0, duration: opts.duration || 0.6, target: opts.target || null, onPeak: opts.onPeak || null, fired: false };
  }

  get busy() { return !!this.action; }

  _pose(hand, target, dt, stiff = 14) {
    const cur = hand.cur;
    cur.pos.x = damp(cur.pos.x, target.pos.x, stiff, dt);
    cur.pos.y = damp(cur.pos.y, target.pos.y, stiff, dt);
    cur.pos.z = damp(cur.pos.z, target.pos.z, stiff, dt);
    cur.roll = damp(cur.roll, target.roll, stiff, dt);
    cur.bend.x = damp(cur.bend.x, target.bend.x, stiff, dt);
    cur.bend.y = damp(cur.bend.y, target.bend.y, stiff, dt);
    for (let i = 0; i < 5; i++) cur.curl[i] = damp(cur.curl[i], target.curl[i], stiff * 0.9, dt);
    hand.applyCurl(cur.curl, target.spread || 0);
    hand.palm.rotation.set(cur.bend.x, cur.bend.y * (hand.side === 'left' ? 1 : 1), 0);
  }

  /** Orient a wrist so its forearm points at the elbow anchor, then roll around that axis. */
  _orient(hand, pos) {
    const elbow = ELBOW[hand.side];
    const f = this._v.subVectors(elbow, pos).normalize();
    hand.cur.quat.setFromUnitVectors(_Z, f);
    this._q.setFromAxisAngle(f, hand.cur.roll);
    hand.cur.quat.premultiply(this._q);
  }

  update(dt, game) {
    this.time += dt;
    const player = game.player;
    // flying: the hands are on the yoke out of sight, the cockpit is the view model
    this.group.visible = player.mode !== 'plane';
    if (player.mode === 'plane') return;
    const held = game.inventory ? game.inventory.equippedDef : null;
    const aiming = held && held.aim && game.input.mouseDown[2] && game.state === 'playing';

    // choose targets
    let rt = POSES.rightIdle, lt = POSES.leftIdle;
    const running = player.sprinting && player.onGround && player.speed01 > 0.5;
    if (running) {
      // arms swing into view with the stride
      const sw = Math.sin(player.bobPhase);
      this._runR = this._runR || { ...POSES.rightRun, pos: POSES.rightRun.pos.clone() };
      this._runL = this._runL || { ...POSES.leftRun, pos: POSES.leftRun.pos.clone() };
      this._runR.pos.copy(POSES.rightRun.pos).add(this._v.set(0, sw * 0.05, -sw * 0.07));
      this._runL.pos.copy(POSES.leftRun.pos).add(this._v.set(0, -sw * 0.05, sw * 0.07));
      rt = this._runR; lt = this._runL;
    }
    if (player.mode === 'boat') { rt = POSES.rightTiller; lt = POSES.leftBoat; } else if (player.mode === 'swim') { rt = POSES.rightSwim; lt = POSES.leftSwim; }
    if (held && player.mode !== 'swim') {
      const p = held.pose || 'hold';
      if (p === 'camera') { rt = aiming ? POSES.rightCameraAim : POSES.rightCamera; lt = aiming ? POSES.leftCameraAim : POSES.leftCamera; } else if (p === 'bino') { rt = aiming ? POSES.rightBinoAim : POSES.rightBino; lt = aiming ? POSES.leftBinoAim : POSES.leftBino; } else if (p === 'lantern') rt = POSES.rightLantern;
      else if (p === 'grip') rt = POSES.rightGrip;
      else if (p === 'palmUp') rt = POSES.rightPalmUp;
      else if (p === 'mug') rt = POSES.rightMug;
      else rt = POSES.rightHold;
    }
    if (game.state !== 'playing' && game.state !== 'paused' && game.state !== 'menu') { rt = POSES.hidden; lt = POSES.hiddenL; }

    // actions override the right hand
    let stiff = 13;
    if (this.action) {
      const a = this.action;
      a.t += dt;
      const k = a.t / a.duration;
      if (a.type === 'reach' || a.type === 'grab') {
        const reach = POSES.rightReach;
        const custom = { ...reach, pos: reach.pos.clone(), bend: reach.bend.clone() };
        if (a.target) {
          // move the wrist towards the target, in camera space, clamped to arm reach
          const local = this.camera.worldToLocal(this._v.copy(a.target));
          local.multiplyScalar(Math.min(1, 0.5 / Math.max(local.length(), 0.01)));
          local.y -= 0.05; local.x += 0.04; local.z += 0.09;
          custom.pos.lerpVectors(reach.pos, local, 0.8);
        }
        const out = k < 0.45;
        rt = out ? custom : rt;
        if (a.type === 'grab' && k > 0.35 && k < 0.6) custom.curl = [0.6, 0.8, 0.8, 0.8, 0.8];
        if (!a.fired && k > 0.4) { a.fired = true; if (a.onPeak) a.onPeak(); }
        stiff = 16;
      } else if (a.type === 'throw') {
        if (k < 0.45) rt = POSES.rightThrowBack;
        else rt = POSES.rightThrowFwd;
        if (!a.fired && k > 0.55) { a.fired = true; if (a.onPeak) a.onPeak(); }
        stiff = k < 0.45 ? 10 : 24;
      } else if (a.type === 'drink') {
        rt = k < 0.8 ? POSES.rightDrink : rt;
        if (!a.fired && k > 0.45) { a.fired = true; if (a.onPeak) a.onPeak(); }
        stiff = 7;
      } else if (a.type === 'use') {
        stiff = 20;
        if (!a.fired) { a.fired = true; if (a.onPeak) a.onPeak(); }
      }
      if (a.t >= a.duration) this.action = null;
    }

    this._pose(this.right, rt, dt, stiff);
    this._pose(this.left, lt, dt, 11);

    // swim stroke animation
    if (player.mode === 'swim') {
      const s = Math.sin(this.time * 2.2);
      this.right.cur.pos.x += s * 0.002; this.left.cur.pos.x -= s * 0.002;
    }

    // procedural motion: look lag, walk sway, breathing, landing
    this.swayX = damp(this.swayX, clamp(player.lookLagX * 0.9, -0.05, 0.05), 10, dt);
    this.swayY = damp(this.swayY, clamp(player.lookLagY * 0.9, -0.05, 0.05), 10, dt);
    const walk = player.bobAmp;
    const ph = player.bobPhase;
    const bobX = Math.cos(ph) * 0.009 * walk;
    const bobY = Math.abs(Math.sin(ph)) * 0.012 * walk;
    const breath = Math.sin(this.time * 1.6) * 0.0025;
    const land = player.landImpulse * 0.35;
    const sprint = player.sprinting ? 1 : 0;
    for (const hand of [this.right, this.left]) {
      const sign = hand === this.right ? 1 : -1;
      hand.root.position.set(
        hand.cur.pos.x + this.swayX + bobX,
        hand.cur.pos.y - this.swayY * 0.8 - bobY + breath - land - sprint * 0.03,
        hand.cur.pos.z + sprint * 0.04,
      );
      this._orient(hand, hand.root.position);
      hand.root.quaternion.copy(hand.cur.quat);
      hand.root.rotateZ(sign * Math.cos(ph) * 0.03 * walk);
    }

    // held object follows the right wrist
    if (this.heldObject) {
      const o = this.heldObject, off = this.heldOffset;
      const anchor = off.left ? this.left.root : this.right.root;
      o.position.copy(off.pos).add(anchor.position);
      o.quaternion.copy(off.quat);
      // inherit a little of the hand's deviation from its pose for liveliness
      o.rotateZ(Math.cos(ph) * 0.03 * walk - this.swayX * 0.6);
      o.rotateX(this.swayY * 0.6);
      if (this.action && this.action.type === 'drink') {
        const k = Math.min(1, this.action.t / this.action.duration);
        o.rotateZ(Math.sin(k * Math.PI) * 1.1);
      }
      o.visible = this.visible;
    }
    this.right.root.visible = this.visible;
    this.left.root.visible = this.visible;

    // wrist watch shows game time
    const minute = Math.floor(game.timeOfDay.hour * 60);
    if (minute !== this.lastMinute) {
      this.lastMinute = minute;
      const c = this.watchCanvas.getContext('2d');
      c.fillStyle = '#26221d'; c.fillRect(0, 0, 64, 64);
      c.fillStyle = '#e8e2cf'; c.beginPath(); c.arc(32, 32, 30, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#222'; c.lineWidth = 2;
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.beginPath(); c.moveTo(32 + Math.sin(a) * 26, 32 - Math.cos(a) * 26); c.lineTo(32 + Math.sin(a) * 30, 32 - Math.cos(a) * 30); c.stroke(); }
      const h = game.timeOfDay.hour;
      const ha = ((h % 12) / 12) * Math.PI * 2, ma = ((h % 1)) * Math.PI * 2;
      c.lineWidth = 4; c.beginPath(); c.moveTo(32, 32); c.lineTo(32 + Math.sin(ha) * 15, 32 - Math.cos(ha) * 15); c.stroke();
      c.lineWidth = 2.5; c.beginPath(); c.moveTo(32, 32); c.lineTo(32 + Math.sin(ma) * 24, 32 - Math.cos(ma) * 24); c.stroke();
      this.watchTex.needsUpdate = true;
    }
  }
}

export { POSES };
