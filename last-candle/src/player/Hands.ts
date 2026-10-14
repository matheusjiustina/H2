import * as THREE from "three";
import { damp } from "../core/math";
import { capsule, cyl, rbox, sphere } from "../world/geometry";
import { toonMat } from "../world/materials";

const SKIN = "#e7b48d";
const SLEEVE = "#30343a";
const CUFF = "#454a52";

interface HandRig {
  root: THREE.Group; // wrist pivot (animated)
  arm: THREE.Mesh; // forearm sleeve, stretched from wrist to an off-screen shoulder anchor
  shoulder: THREE.Vector3;
  fingers: { base: THREE.Group; mid: THREE.Group }[];
  thumb: { base: THREE.Group; mid: THREE.Group };
  grip: THREE.Group; // attachment point for held objects
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  gripV: number;
  visible: number;
}

export type HandAction = "none" | "reach" | "press" | "grab" | "drink" | "eat" | "squeak" | "show" | "throwCharge" | "throw" | "wipe" | "write" | "crumple";

/** Where the hand rests when it is out of the way, and how far an arm can reach (camera space). */
const REACH_MAX = 0.6;

/**
 * First-person stylized hands, rendered in a separate viewmodel pass so they
 * never clip into the world. Poses are procedural and blend smoothly.
 */
export class Hands {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly right: HandRig;
  readonly left: HandRig;
  holding: THREE.Object3D | null = null;
  private holdOffset = { pos: new THREE.Vector3(), rot: new THREE.Euler() };
  private inspectBase: THREE.Euler | null = null;
  private action: HandAction = "none";
  private actionT = 0;
  private actionDur = 0;
  private leftAction: HandAction = "none";
  private leftT = 0;
  private leftDur = 0;
  charge = 0;
  inspecting = false;
  inspectRot = new THREE.Quaternion();
  extraYaw = 0; // R-rotation of held object
  private sway = new THREE.Vector2();
  private bobT = 0;
  drawing = false;
  visibleIdle = false;
  /** Camera-space point the hand reaches toward for reach/press/grab (clamped to arm length). */
  private reachTarget = new THREE.Vector3(0.08, -0.12, -0.62);
  /** 0..1: how much a nearby wall/desk pushes the hands back so they never poke into it. */
  wallPush = 0;
  /** Mass of the held object (kg) — heavier things sit lower and lag more. */
  private heldMass = 0.2;
  private lag = new THREE.Vector3();
  private lagVel = new THREE.Vector3();

  constructor(fov: number) {
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.01, 5);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight("#fff1dc", "#3a3028", 1.35));
    const key = new THREE.DirectionalLight("#ffe0b8", 1.4);
    key.position.set(-0.6, 1.2, 0.4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight("#9fb4d0", 0.5);
    rim.position.set(0.8, -0.2, -0.6);
    this.scene.add(rim);
    this.right = this.buildHand(1);
    this.left = this.buildHand(-1);
    this.camera.add(this.right.root, this.left.root, this.right.arm, this.left.arm);
    this.right.root.visible = false;
    this.left.root.visible = false;
  }

  private buildHand(side: 1 | -1): HandRig {
    const root = new THREE.Group();
    const skin = toonMat(SKIN);
    const sleeve = toonMat(SLEEVE);
    const cuff = toonMat(CUFF);
    // forearm sleeve: lives on the camera and is aimed at an off-screen shoulder every frame
    const arm = new THREE.Mesh(cyl(0.044, 0.058, 1, 14), sleeve);
    arm.frustumCulled = false;
    const cf = new THREE.Mesh(cyl(0.052, 0.052, 0.045, 14), cuff);
    cf.rotation.x = Math.PI / 2 - 0.15;
    cf.position.set(0, -0.005, 0.03);
    root.add(cf);
    const wrist = new THREE.Mesh(cyl(0.034, 0.038, 0.05, 12), skin);
    wrist.rotation.x = Math.PI / 2;
    wrist.position.set(0, 0, 0.0);
    root.add(wrist);
    // palm (back of hand up)
    const palm = new THREE.Mesh(rbox(0.095, 0.042, 0.1, 0.02, 3), skin);
    palm.position.set(0, 0, -0.06);
    root.add(palm);
    const fingers: HandRig["fingers"] = [];
    for (let i = 0; i < 4; i++) {
      const base = new THREE.Group();
      const fx = (-0.034 + i * 0.0225) * side;
      base.position.set(fx, 0.0, -0.108);
      root.add(base);
      const len1 = i === 0 || i === 3 ? 0.03 : 0.036;
      const seg1 = new THREE.Mesh(capsule(0.0115, len1, 4, 8), skin);
      seg1.rotation.x = Math.PI / 2;
      seg1.position.z = -len1 / 2;
      base.add(seg1);
      const mid = new THREE.Group();
      mid.position.z = -len1 - 0.004;
      base.add(mid);
      const seg2 = new THREE.Mesh(capsule(0.0105, 0.026, 4, 8), skin);
      seg2.rotation.x = Math.PI / 2;
      seg2.position.z = -0.015;
      mid.add(seg2);
      fingers.push({ base, mid });
    }
    const tb = new THREE.Group();
    tb.position.set(-0.05 * side, -0.006, -0.05);
    tb.rotation.y = 0.7 * side;
    root.add(tb);
    const t1 = new THREE.Mesh(capsule(0.013, 0.028, 4, 8), skin);
    t1.rotation.x = Math.PI / 2;
    t1.position.z = -0.016;
    tb.add(t1);
    const tm = new THREE.Group();
    tm.position.z = -0.034;
    tb.add(tm);
    const t2 = new THREE.Mesh(capsule(0.012, 0.022, 4, 8), skin);
    t2.rotation.x = Math.PI / 2;
    t2.position.z = -0.012;
    tm.add(t2);
    const knuckles = new THREE.Mesh(sphere(0.012, 6, 4), skin);
    knuckles.position.set(0.03 * side, 0.012, -0.1);
    knuckles.visible = false;
    root.add(knuckles);
    const grip = new THREE.Group();
    grip.position.set(-0.01 * side, -0.05, -0.1);
    grip.scale.setScalar(1 / 0.88); // the hand is drawn at 0.88 scale; held objects stay true size
    root.add(grip);
    root.traverse((o) => {
      o.frustumCulled = false;
    });
    return { root, arm, shoulder: new THREE.Vector3(0.42 * side, -0.62, 0.12), fingers, thumb: { base: tb, mid: tm }, grip, pos: new THREE.Vector3(0.3 * side, -0.6, -0.4), quat: new THREE.Quaternion(), gripV: 0, visible: 0 };
  }

  setFov(fov: number, aspect: number) {
    this.camera.fov = fov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Attach a prop mesh to the right hand. When `fromCamLocal` is given (the object's
   * transform relative to the main camera), it starts there and travels into the hand.
   */
  hold(obj: THREE.Object3D, pos: [number, number, number], rot: [number, number, number], inspect?: [number, number, number], mass = 0.2, fromCamLocal?: THREE.Matrix4) {
    this.holding = obj;
    this.heldMass = mass;
    this.inspectBase = inspect ? new THREE.Euler(...inspect) : null;
    this.holdOffset.pos.set(...pos);
    this.holdOffset.rot.set(...rot);
    this.extraYaw = 0;
    this.lag.set(0, 0, 0);
    this.lagVel.set(0, 0, 0);
    this.right.grip.add(obj);
    obj.position.copy(this.holdOffset.pos);
    obj.rotation.copy(this.holdOffset.rot);
    if (fromCamLocal) {
      // start where the object really is on screen, then the update loop eases it into the grip
      this.camera.updateMatrixWorld(true);
      this.right.root.updateMatrixWorld(true);
      const local = new THREE.Matrix4().copy(this.right.grip.matrixWorld).invert().multiply(fromCamLocal);
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      local.decompose(p, q, new THREE.Vector3());
      // never start behind the camera or absurdly far
      if (p.length() < 2) {
        obj.position.copy(p);
        obj.quaternion.copy(q);
      }
    }
    obj.traverse((o) => {
      o.frustumCulled = false;
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false;
    });
    this.right.gripV = 0.2;
  }

  release(): THREE.Object3D | null {
    const o = this.holding;
    if (o) {
      o.removeFromParent();
      o.traverse((c) => {
        c.frustumCulled = true;
        if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).castShadow = true;
      });
    }
    this.holding = null;
    this.inspecting = false;
    this.charge = 0;
    return o;
  }

  /** World-space transform of the held object's anchor, given the main camera. */
  heldWorldTransform(mainCam: THREE.Camera): { pos: THREE.Vector3; quat: THREE.Quaternion } | null {
    if (!this.holding) return null;
    this.camera.updateMatrixWorld(true);
    const local = new THREE.Matrix4().copy(this.camera.matrixWorldInverse).multiply(this.holding.matrixWorld);
    const world = new THREE.Matrix4().copy(mainCam.matrixWorld).multiply(local);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    world.decompose(pos, quat, new THREE.Vector3());
    return { pos, quat };
  }

  /** Set right before an interaction fires so whatever hand animation it plays aims at the real spot. */
  nextReach: THREE.Vector3 | null = null;

  play(a: HandAction, dur = 0.45, target?: THREE.Vector3) {
    this.action = a;
    this.actionT = 0;
    this.actionDur = dur;
    const t = target ?? this.nextReach;
    if (t) this.setReach(t);
    else this.reachTarget.set(0.08, -0.12, -0.62);
  }

  /** Aim reach/press/grab at a camera-space point, clamped to a comfortable arm length. */
  setReach(camLocal: THREE.Vector3) {
    const t = camLocal.clone();
    if (t.z > -0.25) t.z = -0.25;
    const len = t.length();
    if (len > REACH_MAX) t.multiplyScalar(REACH_MAX / len);
    t.x = Math.max(-0.05, Math.min(0.3, t.x + 0.05));
    t.y = Math.max(-0.32, Math.min(0.1, t.y - 0.04));
    this.reachTarget.copy(t);
  }

  playLeft(a: HandAction, dur = 0.5) {
    if (this.nextReach) this.setReach(this.nextReach);
    this.leftAction = a;
    this.leftT = 0;
    this.leftDur = dur;
  }

  get busy(): boolean {
    return this.action !== "none" && this.action !== "throwCharge";
  }

  update(dt: number, mouseDX: number, mouseDY: number, speed: number, time: number) {
    // look sway & walk bob
    this.sway.x += (-mouseDX * 0.00035 - this.sway.x) * damp(10, dt);
    this.sway.y += (mouseDY * 0.00035 - this.sway.y) * damp(10, dt);
    this.sway.clampScalar(-0.04, 0.04);
    this.bobT += dt * (4 + speed * 2.2);
    const bob = Math.min(1, speed / 3);
    const bx = Math.cos(this.bobT) * 0.008 * bob;
    const by = -Math.abs(Math.sin(this.bobT)) * 0.012 * bob;

    if (this.action !== "none" && this.action !== "throwCharge") {
      this.actionT += dt;
      if (this.actionT >= this.actionDur) {
        this.action = "none";
      }
    }
    if (this.leftAction !== "none") {
      this.leftT += dt;
      if (this.leftT >= this.leftDur) this.leftAction = "none";
    }

    // held-object inertia: a damped spring driven by looking around; heavier = more lag
    const massK = Math.min(1.6, 0.35 + this.heldMass * 0.9);
    if (this.holding) {
      this.lagVel.x += (-mouseDX * 0.00012 * massK - this.lag.x * 60) * dt;
      this.lagVel.y += (mouseDY * 0.00012 * massK - this.lag.y * 60) * dt;
      this.lagVel.multiplyScalar(Math.exp(-9 * dt));
      this.lag.addScaledVector(this.lagVel, dt * 60);
      this.lag.clampScalar(-0.05, 0.05);
    } else this.lag.multiplyScalar(Math.exp(-10 * dt));

    // ---------------------------------------------------------- right hand target
    const R = this.right;
    const tp = new THREE.Vector3();
    const te = new THREE.Euler();
    let grip = 0.15;
    let show = 0;
    const k = this.actionDur > 0 ? Math.min(1, this.actionT / this.actionDur) : 0;
    const arc = Math.sin(k * Math.PI);
    if (this.holding) {
      show = 1;
      const heavy = this.heldMass >= 1;
      tp.set(heavy ? 0.16 : 0.24, heavy ? -0.33 : -0.25, heavy ? -0.42 : -0.46);
      te.set(0.15, 0.12, 0.08);
      grip = 0.85;
      tp.x += this.lag.x;
      tp.y += this.lag.y - Math.min(0.06, this.heldMass * 0.02);
      if (this.inspecting) {
        tp.set(0.16, -0.22, -0.36);
        te.set(0.3, -0.1, 0.0);
      }
      if (this.drawing) {
        tp.set(0.12, -0.12, -0.5);
        te.set(0.3, 0.05, 0);
      }
    } else if (this.visibleIdle) {
      show = 1;
      tp.set(0.27, -0.33, -0.42);
      te.set(0.25, 0.15, 0.1);
      grip = 0.35;
    }
    switch (this.action) {
      case "reach":
      case "press":
      case "grab":
        show = 1;
        tp.lerp(this.reachTarget, arc);
        te.x += -0.5 * arc;
        grip = this.action === "press" ? 0.55 : this.action === "grab" ? (k < 0.5 ? 0.1 : 0.85) : 0.15 + 0.6 * k;
        break;
      case "drink":
        tp.lerp(new THREE.Vector3(0.05, -0.11, -0.22), arc);
        te.x += 0.9 * arc;
        te.z += -0.5 * arc;
        break;
      case "eat":
        tp.lerp(new THREE.Vector3(0.04, -0.16, -0.24), arc);
        te.x += 0.4 * arc;
        break;
      case "squeak":
        tp.y += Math.abs(Math.sin(k * Math.PI * 3)) * 0.06;
        grip = 0.85 + 0.15 * arc;
        break;
      case "show":
        tp.lerp(new THREE.Vector3(0.12, -0.04, -0.4), arc);
        te.x += -0.9 * arc;
        break;
      case "throwCharge": {
        const c = this.charge;
        tp.add(new THREE.Vector3(0.06 * c, 0.1 * c, 0.14 * c));
        te.x += -0.6 * c;
        break;
      }
      case "throw":
        tp.lerp(new THREE.Vector3(0.05, -0.05, -0.75), arc);
        te.x += 0.7 * arc;
        grip = 0.85 - 0.8 * Math.min(1, k * 2);
        break;
      case "crumple":
        show = 1;
        tp.lerp(new THREE.Vector3(0.15, -0.2, -0.4), arc);
        grip = 0.4 + 0.6 * Math.abs(Math.sin(k * Math.PI * 3));
        break;
      default:
        break;
    }
    if (this.drawing) grip = 0.9;
    tp.x += bx + this.sway.x;
    tp.y += by + this.sway.y;
    // something right in front of the camera: pull the hands back instead of poking through it
    if (this.wallPush > 0 && !this.inspecting) {
      tp.z += this.wallPush * 0.2;
      tp.y -= this.wallPush * 0.12;
      tp.x += this.wallPush * 0.05;
    }
    if (show === 0) tp.set(0.3, -0.7, -0.35);
    this.applyRig(R, tp, te, grip, show, dt);

    // held object local offset (R rotates held object around vertical)
    if (this.holding) {
      const o = this.holding;
      if (this.inspecting) {
        // bring it in front of the eyes, facing the viewer, regardless of the hand pose
        const gripInv = new THREE.Matrix4().copy(R.grip.matrixWorld).invert();
        this.camera.updateMatrixWorld(true);
        const camPos = new THREE.Vector3(0.0, -0.02, -0.27).applyMatrix4(this.camera.matrixWorld);
        const localPos = camPos.applyMatrix4(gripInv);
        o.position.lerp(localPos, damp(12, dt));
        const base = new THREE.Quaternion().setFromEuler(this.inspectBase ?? this.holdOffset.rot);
        const camQ = this.camera.getWorldQuaternion(new THREE.Quaternion());
        const gripQ = R.grip.getWorldQuaternion(new THREE.Quaternion());
        const want = camQ.multiply(this.inspectRot.clone().multiply(base));
        o.quaternion.slerp(gripQ.invert().multiply(want), damp(12, dt));
      } else {
        o.position.lerp(this.holdOffset.pos, damp(this.heldMass >= 1 ? 7 : 11, dt));
        const q = new THREE.Quaternion().setFromEuler(this.holdOffset.rot);
        q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.extraYaw));
        o.quaternion.slerp(q, damp(14, dt));
      }
    }

    // ---------------------------------------------------------- left hand
    const Lh = this.left;
    const lp = new THREE.Vector3(-0.3, -0.7, -0.35);
    const le = new THREE.Euler(0.2, -0.1, -0.1);
    let lshow = 0;
    let lgrip = 0.2;
    const lk = this.leftDur > 0 ? Math.min(1, this.leftT / this.leftDur) : 0;
    const larc = Math.sin(lk * Math.PI);
    if (this.leftAction === "reach" || this.leftAction === "press") {
      lshow = 1;
      const lt = new THREE.Vector3(Math.min(0.05, this.reachTarget.x - 0.16), this.reachTarget.y, this.reachTarget.z);
      lp.set(-0.26, -0.3, -0.42).lerp(lt, larc);
      le.x += -0.5 * larc;
      lgrip = this.leftAction === "press" ? 0.5 : 0.1 + 0.7 * lk;
    } else if (this.leftAction === "wipe") {
      lshow = 1;
      lp.set(-0.1 + Math.sin(lk * Math.PI * 6) * 0.12, -0.12 + Math.cos(lk * Math.PI * 3) * 0.04, -0.55);
      le.set(-0.9, 0, 0.3);
      lgrip = 0.1;
    } else if (this.leftAction === "crumple") {
      lshow = 1;
      lp.set(-0.12, -0.2, -0.4);
      lgrip = 0.4 + 0.6 * Math.abs(Math.sin(lk * Math.PI * 3));
    } else if (this.holding && this.heldMass >= 1 && !this.inspecting) {
      // heavy things are carried with both hands
      lshow = 1;
      lp.set(-0.16 + this.lag.x, -0.33 + this.lag.y, -0.42);
      le.set(0.15, -0.12, -0.08);
      lgrip = 0.8;
    }
    if (this.wallPush > 0) {
      lp.z += this.wallPush * 0.2;
      lp.y -= this.wallPush * 0.12;
    }
    lp.x += this.sway.x;
    lp.y += this.sway.y + by;
    this.applyRig(Lh, lp, le, lgrip, lshow, dt);
    void time;
  }

  private applyRig(h: HandRig, tp: THREE.Vector3, te: THREE.Euler, grip: number, show: number, dt: number) {
    h.visible += (show - h.visible) * damp(show > h.visible ? 14 : 8, dt);
    const hiddenPos = new THREE.Vector3(tp.x, -0.75, -0.3);
    const target = hiddenPos.lerp(tp, h.visible);
    h.pos.lerp(target, damp(16, dt));
    h.quat.slerp(new THREE.Quaternion().setFromEuler(te), damp(14, dt));
    h.root.position.copy(h.pos);
    h.root.quaternion.copy(h.quat);
    h.root.scale.setScalar(0.88);
    h.root.visible = h.visible > 0.02;
    // forearm from just behind the wrist to the shoulder anchor
    const wrist = new THREE.Vector3(0, -0.01, 0.03).applyQuaternion(h.quat).add(h.pos);
    const dir = h.shoulder.clone().sub(wrist);
    const len = dir.length();
    h.arm.position.copy(wrist).addScaledVector(dir, 0.5);
    h.arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize().negate());
    h.arm.scale.set(1, len, 1);
    h.arm.visible = h.root.visible;
    h.gripV += (grip - h.gripV) * damp(16, dt);
    const g = h.gripV;
    for (const f of h.fingers) {
      f.base.rotation.x = -g * 1.25;
      f.mid.rotation.x = -g * 1.45;
    }
    h.thumb.base.rotation.x = -g * 0.6;
    h.thumb.mid.rotation.x = -g * 0.8;
  }
}
