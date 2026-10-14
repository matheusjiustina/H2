import * as THREE from "three";
import { damp } from "../core/math";
import { capsule, cyl, mergeDeep, rbox, sphere } from "../world/geometry";
import { toonMat } from "../world/materials";
import { canvas, toTexture } from "../world/textures";

export interface Look {
  height: number; // overall scale (1 = ~1.75m)
  width: number; // shoulder/hip width multiplier
  belly: number; // 0..1
  head: number; // head size multiplier
  skin: string;
  top: string;
  topStyle: "hoodie" | "shirt" | "flannel" | "cardigan" | "raincoat";
  apron?: string;
  pants: string;
  shoes: string;
  hair: "messy" | "cap" | "hood" | "beanie" | "bald" | "helmet";
  hairColor: string;
  accent: string;
  glasses?: "round" | "screen" | null;
  beard?: boolean;
  mustache?: boolean;
  headphones?: boolean;
  scarf?: string;
  nose: number; // nose size
  eyeSize: number;
}

export type Channel =
  | "hipsY"
  | "hipsZ"
  | "spineX"
  | "spineY"
  | "spineZ"
  | "chestX"
  | "neckX"
  | "headX"
  | "headY"
  | "headZ"
  | "shLX"
  | "shLY"
  | "shLZ"
  | "elLX"
  | "elLY"
  | "wrLX"
  | "shRX"
  | "shRY"
  | "shRZ"
  | "elRX"
  | "elRY"
  | "wrRX"
  | "hipLX"
  | "hipLZ"
  | "knLX"
  | "hipRX"
  | "hipRZ"
  | "knRX"
  | "gripL"
  | "gripR"
  | "browL"
  | "browR"
  | "browY"
  | "lid"
  | "mouth"
  | "mouthOpen"
  | "eyeX"
  | "eyeY";

export type Pose = Record<Channel, number>;

export const NEUTRAL: Pose = {
  hipsY: 0,
  hipsZ: 0,
  spineX: 0,
  spineY: 0,
  spineZ: 0,
  chestX: 0,
  neckX: 0,
  headX: 0,
  headY: 0,
  headZ: 0,
  shLX: 0,
  shLY: 0,
  shLZ: -0.07,
  elLX: 0.28,
  elLY: 0,
  wrLX: 0,
  shRX: 0,
  shRY: 0,
  shRZ: 0.07,
  elRX: 0.28,
  elRY: 0,
  wrRX: 0,
  hipLX: 0,
  hipLZ: 0,
  knLX: 0,
  hipRX: 0,
  hipRZ: 0,
  knRX: 0,
  gripL: 0.3,
  gripR: 0.3,
  browL: 0,
  browR: 0,
  browY: 0,
  lid: 0.15,
  mouth: 0.1,
  mouthOpen: 0,
  eyeX: 0,
  eyeY: 0,
};

const FAST: Partial<Record<Channel, number>> = { lid: 30, mouthOpen: 22, eyeX: 18, eyeY: 18, browL: 12, browR: 12, browY: 12 };

function flannelTex(base: string): THREE.Texture {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  for (let i = 0; i < 128; i += 32) {
    ctx.fillRect(i, 0, 12, 128);
    ctx.fillRect(0, i, 128, 12);
  }
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let i = 16; i < 128; i += 32) {
    ctx.fillRect(i, 0, 3, 128);
    ctx.fillRect(0, i, 128, 3);
  }
  const t = toTexture(c, { repeat: [2, 2] });
  return t;
}

/**
 * Procedural stylized character: big expressive head, full body, mitten-style
 * hands, a joint hierarchy and a damped pose system for smooth blending.
 */
export class CharacterRig {
  readonly root = new THREE.Group();
  readonly j: Record<string, THREE.Group> = {};
  private cur: Pose = { ...NEUTRAL };
  readonly target: Pose = { ...NEUTRAL };
  private face!: {
    pupilL: THREE.Object3D;
    pupilR: THREE.Object3D;
    lidL: THREE.Object3D;
    lidR: THREE.Object3D;
    browL: THREE.Object3D;
    browR: THREE.Object3D;
    mouth: THREE.Mesh;
    mouthOpen: THREE.Mesh;
  };
  private fingersL!: THREE.Object3D;
  private fingersR!: THREE.Object3D;
  readonly handR = new THREE.Group(); // attach point for held things
  readonly handL = new THREE.Group();
  readonly headAnchor = new THREE.Group(); // above head, for speech bubbles
  private blinkT = 2;
  readonly hipHeight: number;
  readonly eyeHeight: number;

  constructor(readonly look: Look) {
    const s = look.height;
    const w = look.width;
    const skin = toonMat(look.skin);
    let topMat: THREE.Material = toonMat(look.top);
    if (look.topStyle === "flannel") {
      const m = new THREE.MeshToonMaterial({ color: "#ffffff", map: flannelTex(look.top), gradientMap: (toonMat("#fff") as THREE.MeshToonMaterial).gradientMap });
      topMat = m;
    }
    const pants = toonMat(look.pants);
    const shoes = toonMat(look.shoes);
    const hairM = toonMat(look.hairColor);
    const accent = toonMat(look.accent);
    const dark = toonMat("#141414");
    const white = toonMat("#f7f4ee");

    const mk = (name: string, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const g = new THREE.Group();
      g.name = name;
      g.position.set(x, y, z);
      parent.add(g);
      this.j[name] = g;
      return g;
    };
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, pos: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1], rot: [number, number, number] = [0, 0, 0]) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      m.scale.set(...scale);
      m.rotation.set(...rot);
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    this.hipHeight = 0.86 * s;
    const hips = mk("hips", this.root, 0, this.hipHeight, 0);
    // pelvis
    mesh(sphere(0.165, 16, 12), pants, hips, [0, 0.0, 0], [w * 1.0, 0.75, 0.82 + look.belly * 0.15]);
    const spine = mk("spine", hips, 0, 0.05 * s, 0);
    const torsoH = 0.42 * s;
    // torso: lathe-like capsule with belly
    const torso = mesh(capsule(0.165, torsoH * 0.5, 6, 16), topMat, spine, [0, torsoH * 0.42, 0.0], [w * 1.1, 1, 0.8 + look.belly * 0.35]);
    void torso;
    if (look.belly > 0.2) mesh(sphere(0.16, 16, 12), topMat, spine, [0, torsoH * 0.18, -0.06 - look.belly * 0.04], [w * 1.0, 0.9, 0.7 + look.belly * 0.35]);
    if (look.apron) {
      mesh(rbox(0.3 * w, 0.5 * s, 0.03, 0.01), toonMat(look.apron), spine, [0, torsoH * 0.2, -0.16 - look.belly * 0.09], [1, 1, 1], [0.08, 0, 0]);
      mesh(rbox(0.1, 0.06, 0.02, 0.005), white, spine, [0.06, torsoH * 0.25, -0.18 - look.belly * 0.09], [1, 1, 1], [0.08, 0, 0]);
    }
    if (look.topStyle === "hoodie") {
      // hood bunched at the back + pocket + strings
      if (look.hair !== "hood") mesh(sphere(0.12, 12, 8), topMat, spine, [0, torsoH * 0.88, 0.1], [w * 1.25, 0.6, 0.7]);
      mesh(rbox(0.22 * w, 0.1, 0.02, 0.02), topMat, spine, [0, torsoH * 0.12, -0.13 - look.belly * 0.05], [1, 1, 1], [0.1, 0, 0]);
      mesh(cyl(0.005, 0.005, 0.12, 4), white, spine, [0.04, torsoH * 0.72, -0.13]);
      mesh(cyl(0.005, 0.005, 0.12, 4), white, spine, [-0.04, torsoH * 0.72, -0.13]);
    }
    if (look.topStyle === "cardigan") {
      mesh(rbox(0.06, torsoH * 0.9, 0.01, 0.005), toonMat("#e6dfcf"), spine, [0, torsoH * 0.42, -0.125], [1, 1, 1], [0.05, 0, 0]);
    }
    if (look.topStyle === "raincoat") {
      mesh(cyl(0.2 * w, 0.26 * w, 0.5 * s, 14), topMat, spine, [0, torsoH * 0.05, 0]);
    }
    const chest = mk("chest", spine, 0, torsoH * 0.78, 0);
    if (look.scarf) {
      mesh(new THREE.TorusGeometry(0.1, 0.04, 8, 16), toonMat(look.scarf), chest, [0, 0.1, 0], [1.1 * w, 1, 1], [Math.PI / 2, 0, 0]);
      mesh(rbox(0.07, 0.35, 0.03, 0.02), toonMat(look.scarf), chest, [0.06, -0.08, -0.14], [1, 1, 1], [0.15, 0, 0.1]);
    }
    if (look.headphones) {
      mesh(new THREE.TorusGeometry(0.11, 0.015, 6, 16, Math.PI), dark, chest, [0, 0.11, 0.02], [1, 1, 1], [Math.PI / 2 + 0.3, 0, Math.PI]);
      mesh(cyl(0.04, 0.04, 0.03, 12), dark, chest, [0.11, 0.1, -0.02], [1, 1, 1], [0, 0, Math.PI / 2]);
      mesh(cyl(0.04, 0.04, 0.03, 12), dark, chest, [-0.11, 0.1, -0.02], [1, 1, 1], [0, 0, Math.PI / 2]);
    }
    const neck = mk("neck", chest, 0, 0.1 * s, 0);
    mesh(cyl(0.05, 0.06, 0.12, 10), skin, neck, [0, 0.03, 0]);
    const hs = 0.165 * look.head;
    const head = mk("head", neck, 0, 0.1 + hs * 0.9, 0);
    // head shape
    mesh(sphere(hs, 24, 18), skin, head, [0, 0, 0], [0.95, 1.08, 1.0]);
    mesh(sphere(hs * 0.7, 16, 12), skin, head, [0, -hs * 0.45, -hs * 0.25], [1.0, 0.8, 0.9]); // jaw/cheeks
    // ears
    mesh(sphere(hs * 0.22, 10, 8), skin, head, [hs * 0.93, -0.01, 0.01], [0.5, 1, 0.8]);
    mesh(sphere(hs * 0.22, 10, 8), skin, head, [-hs * 0.93, -0.01, 0.01], [0.5, 1, 0.8]);
    // nose (caricature)
    const ns = look.nose;
    mesh(sphere(hs * 0.2 * ns, 12, 10), skin, head, [0, -hs * 0.12, -hs * 1.0], [0.85, 0.9, 1.2]);
    // eyes
    const er = hs * 0.24 * look.eyeSize;
    const eyeGroup = (x: number) => {
      const g = new THREE.Group();
      g.position.set(x, hs * 0.18, -hs * 0.82);
      head.add(g);
      mesh(sphere(er, 14, 10), white, g, [0, 0, 0], [1, 1.15, 0.7]);
      const pupilPivot = new THREE.Group();
      g.add(pupilPivot);
      mesh(sphere(er * 0.42, 10, 8), dark, pupilPivot, [0, 0, -er * 0.62], [1, 1.1, 0.5]);
      mesh(sphere(er * 0.12, 6, 4), white, pupilPivot, [er * 0.12, er * 0.15, -er * 0.8], [1, 1, 0.5]);
      // eyelid: a skin hemisphere that rotates down to close
      const lid = new THREE.Group();
      g.add(lid);
      const lidMesh = mesh(new THREE.SphereGeometry(er * 1.08, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), skin, lid, [0, 0, 0], [1, 1.15, 0.78]);
      lidMesh.rotation.x = -Math.PI / 2 - 0.2;
      return { pupilPivot, lid };
    };
    const eyeL = eyeGroup(-hs * 0.36);
    const eyeR = eyeGroup(hs * 0.36);
    // brows
    const brow = (x: number) => {
      const g = new THREE.Group();
      g.position.set(x, hs * 0.5, -hs * 0.86);
      head.add(g);
      mesh(rbox(hs * 0.5, hs * 0.1, hs * 0.08, hs * 0.04), hairM, g, [0, 0, 0], [1, 1, 1], [0.2, 0, 0]);
      return g;
    };
    const browL = brow(-hs * 0.36);
    const browR = brow(hs * 0.36);
    // mouth
    const mouth = mesh(new THREE.TorusGeometry(hs * 0.22, hs * 0.035, 6, 14, Math.PI), dark, head, [0, -hs * 0.48, -hs * 0.86]);
    const mouthOpen = mesh(sphere(hs * 0.16, 12, 8), toonMat("#3a1414"), head, [0, -hs * 0.52, -hs * 0.84], [1.1, 0.6, 0.4]);
    mouthOpen.visible = false;
    if (look.mustache) mesh(capsule(hs * 0.09, hs * 0.38, 4, 8), hairM, head, [0, -hs * 0.34, -hs * 0.95], [1, 1, 0.8], [0, 0, Math.PI / 2]);
    if (look.beard) mesh(sphere(hs * 0.62, 14, 10), hairM, head, [0, -hs * 0.6, -hs * 0.35], [1.05, 0.75, 0.85]);
    // glasses
    if (look.glasses) {
      const gm = look.glasses === "screen" ? new THREE.MeshBasicMaterial({ color: "#9fd6ff", transparent: true, opacity: 0.8 }) : dark;
      for (const x of [-hs * 0.36, hs * 0.36]) {
        if (look.glasses === "round") mesh(new THREE.TorusGeometry(er * 1.2, er * 0.13, 6, 16), dark, head, [x, hs * 0.18, -hs * 1.0]);
        else mesh(rbox(er * 2.4, er * 1.6, 0.004, 0.004), gm, head, [x, hs * 0.18, -hs * 1.0]);
      }
      mesh(rbox(hs * 0.25, 0.008, 0.008, 0.002), dark, head, [0, hs * 0.2, -hs * 1.0]);
    }
    // hair styles
    switch (look.hair) {
      case "messy":
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          mesh(sphere(hs * 0.38, 10, 8), hairM, head, [Math.cos(a) * hs * 0.55, hs * 0.62 + Math.sin(i * 1.7) * hs * 0.1, Math.sin(a) * hs * 0.5 + hs * 0.1]);
        }
        mesh(sphere(hs * 0.5, 10, 8), hairM, head, [0, hs * 0.85, hs * 0.1]);
        break;
      case "cap":
        mesh(new THREE.SphereGeometry(hs * 1.02, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), accent, head, [0, hs * 0.18, 0.0], [1, 0.9, 1.05]);
        mesh(rbox(hs * 1.1, hs * 0.06, hs * 0.7, hs * 0.03), accent, head, [0, hs * 0.2, hs * 1.05], [1, 1, 1], [-0.12, 0, 0]);
        mesh(sphere(hs * 0.42, 10, 8), hairM, head, [0, hs * 0.05, hs * 0.75], [1.6, 0.8, 0.8]);
        break;
      case "beanie":
        mesh(new THREE.SphereGeometry(hs * 1.05, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), accent, head, [0, hs * 0.22, 0.02], [1, 1.05, 1.05]);
        mesh(cyl(hs * 1.05, hs * 1.07, hs * 0.25, 18), toonMat(look.hairColor === look.accent ? "#333" : look.accent), head, [0, hs * 0.25, 0.02]);
        break;
      case "hood":
        mesh(sphere(hs * 1.18, 18, 12), toonMat(look.top), head, [0, hs * 0.1, hs * 0.22], [1.05, 1.08, 1.05]);
        mesh(new THREE.TorusGeometry(hs * 0.95, hs * 0.13, 8, 20), toonMat(look.top), head, [0, -0.0, -hs * 0.62], [0.92, 1.08, 1]);
        mesh(sphere(hs * 0.4, 10, 8), hairM, head, [0, hs * 0.55, -hs * 0.65], [1.6, 0.5, 0.6]);
        break;
      case "bald":
        mesh(sphere(hs * 0.45, 10, 8), hairM, head, [hs * 0.72, hs * 0.05, hs * 0.25], [0.5, 0.9, 1.1]);
        mesh(sphere(hs * 0.45, 10, 8), hairM, head, [-hs * 0.72, hs * 0.05, hs * 0.25], [0.5, 0.9, 1.1]);
        mesh(sphere(hs * 0.55, 10, 8), hairM, head, [0, hs * 0.1, hs * 0.75], [1.3, 0.8, 0.5]);
        break;
      case "helmet":
        mesh(new THREE.SphereGeometry(hs * 1.12, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), accent, head, [0, hs * 0.1, 0.02], [1, 1.05, 1.1]);
        mesh(rbox(hs * 1.6, hs * 0.5, 0.01, 0.02), new THREE.MeshBasicMaterial({ color: "#2a3a48", transparent: true, opacity: 0.6 }), head, [0, hs * 0.2, -hs * 1.05], [1, 1, 1], [-0.25, 0, 0]);
        break;
    }
    this.headAnchor.position.set(0, hs * 1.6, 0);
    head.add(this.headAnchor);

    // arms
    const armLen = 0.27 * s;
    const foreLen = 0.25 * s;
    const sleeve = topMat;
    const makeArm = (side: 1 | -1) => {
      const sh = mk(side > 0 ? "shR" : "shL", chest, side * 0.185 * w, -0.01, 0);
      mesh(sphere(0.068, 12, 10), sleeve, sh, [0, -0.01, 0], [1.0, 1.05, 1]);
      mesh(capsule(0.06, armLen * 0.78, 4, 10), sleeve, sh, [0, -armLen / 2, 0]);
      const el = mk(side > 0 ? "elR" : "elL", sh, 0, -armLen, 0);
      mesh(sphere(0.052, 10, 8), look.topStyle === "shirt" ? skin : sleeve, el, [0, 0, 0]);
      mesh(capsule(0.05, foreLen * 0.78, 4, 10), look.topStyle === "shirt" ? skin : sleeve, el, [0, -foreLen / 2, 0]);
      if (look.topStyle !== "shirt") mesh(cyl(0.054, 0.054, 0.03, 10), sleeve, el, [0, -foreLen + 0.02, 0]);
      const wr = mk(side > 0 ? "wrR" : "wrL", el, 0, -foreLen, 0);
      // mitten hand: palm + finger block + thumb
      mesh(rbox(0.075, 0.085, 0.04, 0.018), skin, wr, [0, -0.045, 0]);
      const fingers = new THREE.Group();
      fingers.position.set(0, -0.085, 0.0);
      wr.add(fingers);
      mesh(rbox(0.072, 0.06, 0.035, 0.016), skin, fingers, [0, -0.028, 0]);
      mesh(capsule(0.014, 0.035, 4, 6), skin, wr, [-side * 0.042, -0.05, -0.012], [1, 1, 1], [0.3, 0, side * 0.5]);
      const hand = side > 0 ? this.handR : this.handL;
      hand.position.set(0, -0.09, -0.03);
      wr.add(hand);
      if (side > 0) this.fingersR = fingers;
      else this.fingersL = fingers;
    };
    makeArm(1);
    makeArm(-1);

    // legs
    const thigh = 0.4 * s;
    const shin = 0.4 * s;
    const makeLeg = (side: 1 | -1) => {
      const hp = mk(side > 0 ? "hipR" : "hipL", hips, side * 0.1 * w, -0.04, 0);
      mesh(capsule(0.088, thigh * 0.7, 4, 10), pants, hp, [0, -thigh / 2, 0]);
      const kn = mk(side > 0 ? "knR" : "knL", hp, 0, -thigh, 0);
      mesh(sphere(0.074, 10, 8), pants, kn, [0, 0, 0]);
      mesh(capsule(0.072, shin * 0.78, 4, 10), pants, kn, [0, -shin / 2, 0]);
      const an = new THREE.Group();
      an.position.set(0, -shin, 0);
      kn.add(an);
      mesh(rbox(0.1, 0.07, 0.24, 0.03), shoes, an, [0, -0.02, -0.05]);
      mesh(rbox(0.105, 0.02, 0.25, 0.008), white, an, [0, -0.05, -0.05]);
    };
    makeLeg(1);
    makeLeg(-1);

    this.face = { pupilL: eyeL.pupilPivot, pupilR: eyeR.pupilPivot, lidL: eyeL.lid, lidR: eyeR.lid, browL, browR, mouth, mouthOpen };
    mouth.userData.keep = true;
    mouthOpen.userData.keep = true;
    mergeDeep(this.root);
    this.eyeHeight = this.hipHeight + 0.05 * s + torsoH * 0.78 + 0.1 * s + 0.1 + hs * 0.9 + hs * 0.18;
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).receiveShadow = false;
    });
  }

  /** Reset target to neutral before layering a new pose this frame. */
  resetTarget() {
    Object.assign(this.target, NEUTRAL);
  }

  update(dt: number, time: number) {
    const t = this.target;
    const c = this.cur;
    for (const k in t) {
      const key = k as Channel;
      const sp = FAST[key] ?? 9;
      c[key] += (t[key] - c[key]) * damp(sp, dt);
    }
    // blink
    this.blinkT -= dt;
    let blink = 0;
    if (this.blinkT < 0.12) blink = 1;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 4;
    // breathing
    const breath = Math.sin(time * 1.6) * 0.012;

    const J = this.j;
    J.hips.position.y = this.hipHeight + c.hipsY;
    J.hips.position.z = c.hipsZ;
    J.spine.rotation.set(c.spineX + breath, c.spineY, c.spineZ);
    J.chest.rotation.set(c.chestX, 0, 0);
    J.neck.rotation.set(c.neckX, 0, 0);
    J.head.rotation.set(c.headX, c.headY, c.headZ, "YXZ");
    J.shL.rotation.set(c.shLX, c.shLY, c.shLZ, "XZY");
    J.elL.rotation.set(c.elLX, c.elLY, 0);
    J.wrL.rotation.set(c.wrLX, 0, 0);
    J.shR.rotation.set(c.shRX, c.shRY, c.shRZ, "XZY");
    J.elR.rotation.set(c.elRX, c.elRY, 0);
    J.wrR.rotation.set(c.wrRX, 0, 0);
    J.hipL.rotation.set(c.hipLX, 0, c.hipLZ);
    J.knL.rotation.set(-c.knLX, 0, 0);
    J.hipR.rotation.set(c.hipRX, 0, c.hipRZ);
    J.knR.rotation.set(-c.knRX, 0, 0);
    this.fingersL.rotation.x = c.gripL * 1.4;
    this.fingersR.rotation.x = c.gripR * 1.4;

    const f = this.face;
    const lid = Math.max(c.lid, blink);
    f.lidL.rotation.x = 1.45 - lid * 1.45;
    f.lidR.rotation.x = 1.45 - lid * 1.45;
    f.pupilL.rotation.set(c.eyeY * 0.5, -c.eyeX * 0.6, 0);
    f.pupilR.rotation.set(c.eyeY * 0.5, -c.eyeX * 0.6, 0);
    f.browL.rotation.z = c.browL;
    f.browR.rotation.z = -c.browR;
    f.browL.position.y = f.browR.position.y = this.look.head * 0.165 * 0.5 + c.browY * 0.03;
    const m = c.mouth;
    if (m >= 0) {
      f.mouth.rotation.z = Math.PI;
      f.mouth.scale.set(1, Math.max(0.12, m), 1);
    } else {
      f.mouth.rotation.z = 0;
      f.mouth.scale.set(1, Math.max(0.12, -m), 1);
    }
    f.mouthOpen.visible = c.mouthOpen > 0.06;
    f.mouthOpen.scale.set(1.1, 0.15 + c.mouthOpen * 0.9, 0.4);
  }

  /** World position of the eyes (for look-at targets). */
  headWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.j.head.getWorldPosition(out);
  }
}

export const LOOKS: Record<string, Look> = {
  owner: {
    height: 0.95,
    width: 1.15,
    belly: 0.8,
    head: 1.08,
    skin: "#d9a37e",
    top: "#6b7d8c",
    topStyle: "shirt",
    apron: "#3c3a36",
    pants: "#2d2f33",
    shoes: "#3a2a1f",
    hair: "bald",
    hairColor: "#4a3a2e",
    accent: "#8a5a3a",
    mustache: true,
    nose: 1.35,
    eyeSize: 0.9,
  },
  topbuyer: {
    height: 1.04,
    width: 0.92,
    belly: 0,
    head: 1.0,
    skin: "#e8bf9a",
    top: "#c99a2e",
    topStyle: "hoodie",
    pants: "#3a4a63",
    shoes: "#e9e4da",
    hair: "cap",
    hairColor: "#2a1d14",
    accent: "#a73a2e",
    headphones: true,
    nose: 1.1,
    eyeSize: 1.15,
  },
  lurker: {
    height: 1.0,
    width: 0.95,
    belly: 0.1,
    head: 1.0,
    skin: "#c99572",
    top: "#26282c",
    topStyle: "hoodie",
    pants: "#1e2024",
    shoes: "#141414",
    hair: "hood",
    hairColor: "#141414",
    accent: "#3a3c40",
    glasses: "screen",
    nose: 0.95,
    eyeSize: 0.85,
  },
  wizard: {
    height: 1.06,
    width: 0.88,
    belly: 0.15,
    head: 1.04,
    skin: "#efc7a3",
    top: "#5a4a6e",
    topStyle: "cardigan",
    pants: "#4a4238",
    shoes: "#2a2420",
    hair: "messy",
    hairColor: "#d9d6cf",
    accent: "#7a5aa0",
    glasses: "round",
    beard: true,
    scarf: "#8a3a3a",
    nose: 1.45,
    eyeSize: 1.05,
  },
  nightshift: {
    height: 1.02,
    width: 1.22,
    belly: 0.45,
    head: 1.05,
    skin: "#8f5e44",
    top: "#7a2e2a",
    topStyle: "flannel",
    pants: "#3a3f47",
    shoes: "#4a3a2a",
    hair: "beanie",
    hairColor: "#1d1712",
    accent: "#3e5a4a",
    beard: true,
    nose: 1.15,
    eyeSize: 0.95,
  },
  courier: {
    height: 0.98,
    width: 1.0,
    belly: 0.1,
    head: 1.0,
    skin: "#d6a07a",
    top: "#c9d43a",
    topStyle: "raincoat",
    pants: "#2a2d33",
    shoes: "#202020",
    hair: "helmet",
    hairColor: "#2a1d14",
    accent: "#e8e4da",
    nose: 1.1,
    eyeSize: 1.0,
  },
};
