import * as THREE from "three";
import { damp } from "../core/math";
import { capsule, cyl, mergeDeep, rbox, sphere } from "../world/geometry";
import { toonMat } from "../world/materials";
import { canvas, drawCandleMark, FONT_UI, toTexture } from "../world/textures";

export interface Look {
  height: number; // overall scale (1 = ~1.75m)
  width: number; // shoulder/hip width multiplier
  belly: number; // 0..1
  head: number; // head size multiplier
  skin: string;
  /** Main torso garment color (tee, hoodie, jacket...). */
  top: string;
  topStyle: "hoodie" | "tee" | "bomber" | "openShirt" | "raincoat";
  /** Sleeve color/material: tees show skin forearms. */
  sleeves?: "short" | "long";
  /** Print on the chest of a tee. */
  print?: "logo" | "triangles" | null;
  /** Open shirt worn over the tee (Chart Wizard). */
  overShirt?: string;
  /** Trim color for jackets (cuffs, collar, zipper). */
  trim?: string;
  pants: string;
  shoes: string;
  shoeAccent?: string;
  hair: "messy" | "cap" | "hood" | "beanie" | "bald" | "helmet";
  hairColor: string;
  accent: string;
  iris: string;
  glasses?: "round" | "screen" | null;
  beard?: boolean;
  mustache?: boolean;
  headphones?: boolean;
  chain?: boolean;
  keys?: boolean;
  belt?: string;
  eyeBags?: boolean;
  /** Brow thickness multiplier and resting tilt (positive = inner ends up, i.e. worried/tired). */
  brow: { size: number; tilt: number };
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
  | "pointR"
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
  pointR: 0,
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

function printTex(kind: "logo" | "triangles", ink: string): THREE.Texture {
  const [c, ctx] = canvas(256, 160);
  ctx.clearRect(0, 0, 256, 160);
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  if (kind === "logo") {
    drawCandleMark(ctx, 56, 86, 92, "#c9573f");
    ctx.font = `700 40px ${FONT_UI}`;
    ctx.textBaseline = "middle";
    ctx.fillText("LAST", 92, 62);
    ctx.fillText("CANDLE", 92, 104);
    ctx.font = `500 15px ${FONT_UI}`;
    ctx.fillText("STAFF • 24H", 94, 136);
  } else {
    ctx.lineWidth = 7;
    ctx.lineJoin = "round";
    const tri = (x: number, y: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.95, y + r * 0.7);
      ctx.lineTo(x - r * 0.95, y + r * 0.7);
      ctx.closePath();
      ctx.stroke();
    };
    tri(128, 84, 64);
    tri(128, 100, 32);
    tri(128, 108, 13);
  }
  const t = toTexture(c);
  return t;
}

function plaidTex(base: string): THREE.Texture {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  for (let i = 0; i < 128; i += 32) {
    ctx.fillRect(i, 0, 10, 128);
    ctx.fillRect(0, i, 128, 10);
  }
  ctx.fillStyle = "rgba(255,235,200,0.16)";
  for (let i = 18; i < 128; i += 32) {
    ctx.fillRect(i, 0, 3, 128);
    ctx.fillRect(0, i, 128, 3);
  }
  return toTexture(c, { repeat: [2, 2] });
}

/** Toon material with a texture map (shares the gradient ramp of the others). */
function toonTex(tex: THREE.Texture, transparent = false): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color: "#ffffff", map: tex, transparent, gradientMap: toonMat("#ffffff").gradientMap });
}

/**
 * Procedural stylized character: big expressive head, full body, cartoon hands
 * with a separate index finger, outfit + accessories per character, and a
 * damped pose system for smooth blending between animations.
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
  private indexL!: THREE.Object3D;
  private indexR!: THREE.Object3D;
  readonly handR = new THREE.Group(); // attach point for held things
  readonly handL = new THREE.Group();
  readonly headAnchor = new THREE.Group(); // above head, for speech bubbles
  private blinkT = 2;
  /** Body animation speed multiplier (personality: slow and discreet vs. jittery). */
  speed = 1;
  readonly hipHeight: number;
  readonly eyeHeight: number;
  private browBase: number;
  /** Chart Wizard's spare marker (hidden while he holds it). */
  earMarker: THREE.Mesh | null = null;

  constructor(readonly look: Look) {
    const s = look.height;
    const w = look.width;
    const skin = toonMat(look.skin);
    const pants = toonMat(look.pants);
    const shoes = toonMat(look.shoes);
    const hairM = toonMat(look.hairColor);
    const accent = toonMat(look.accent);
    const dark = toonMat("#141414");
    const white = toonMat("#f7f4ee");
    const topMat: THREE.Material = toonMat(look.top);
    const shirtMat: THREE.Material | null = look.overShirt ? toonTex(plaidTex(look.overShirt)) : null;
    const trim = toonMat(look.trim ?? look.accent);
    // sleeves: over-shirt sleeves for the Wizard, jacket sleeves for the bomber, skin for tees
    const sleeveMat = shirtMat ?? topMat;
    const shortSleeves = look.sleeves === "short";

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
    if (look.belt) mesh(cyl(0.165 * w, 0.165 * w, 0.035, 18), toonMat(look.belt), hips, [0, 0.07, 0], [1, 1, 0.84 + look.belly * 0.18]);
    if (look.keys) {
      // a ring of keys on the belt loop, right hip
      const kx = 0.15 * w;
      mesh(new THREE.TorusGeometry(0.018, 0.0035, 6, 14), toonMat("#b8b2a2"), hips, [kx, 0.03, -0.06], [1, 1, 1], [0, Math.PI / 2, 0]);
      mesh(rbox(0.008, 0.045, 0.014, 0.003), toonMat("#c9a13a"), hips, [kx + 0.004, -0.008, -0.07], [1, 1, 1], [0, 0, 0.15]);
      mesh(rbox(0.008, 0.04, 0.014, 0.003), toonMat("#a8aaac"), hips, [kx + 0.004, -0.004, -0.05], [1, 1, 1], [0, 0, -0.25]);
      mesh(rbox(0.012, 0.03, 0.022, 0.005), toonMat("#c9573f"), hips, [kx + 0.006, -0.01, -0.035], [1, 1, 1], [0, 0, 0.35]);
    }
    const spine = mk("spine", hips, 0, 0.05 * s, 0);
    const torsoH = 0.42 * s;
    const zScale = 0.8 + look.belly * 0.35;
    mesh(capsule(0.165, torsoH * 0.5, 6, 16), topMat, spine, [0, torsoH * 0.42, 0.0], [w * 1.1, 1, zScale]);
    if (look.belly > 0.2) mesh(sphere(0.16, 16, 12), topMat, spine, [0, torsoH * 0.18, -0.06 - look.belly * 0.04], [w * 1.0, 0.9, 0.7 + look.belly * 0.35]);
    const chestFront = -0.165 * zScale;
    if (look.print) {
      const ink = look.print === "logo" ? "#efe6d2" : "#2b4fa8";
      const pr = mesh(new THREE.PlaneGeometry(0.2 * w, 0.125 * w), toonTex(printTex(look.print, ink), true), spine, [0, torsoH * 0.64, chestFront - 0.012], [1, 1, 1], [-0.12 + Math.PI, 0, Math.PI]);
      pr.castShadow = false;
    }
    if (look.topStyle === "hoodie") {
      // hood bunched at the back + kangaroo pocket + strings
      if (look.hair !== "hood") mesh(sphere(0.12, 12, 8), topMat, spine, [0, torsoH * 0.88, 0.1], [w * 1.25, 0.6, 0.7]);
      mesh(rbox(0.24 * w, 0.11, 0.025, 0.02), topMat, spine, [0, torsoH * 0.14, chestFront + 0.03 - look.belly * 0.05], [1, 1, 1], [0.1, 0, 0]);
      mesh(cyl(0.005, 0.005, 0.12, 4), white, spine, [0.04, torsoH * 0.72, chestFront + 0.03]);
      mesh(cyl(0.005, 0.005, 0.12, 4), white, spine, [-0.04, torsoH * 0.72, chestFront + 0.03]);
    }
    if (look.topStyle === "bomber") {
      // satin bomber: zipper, ribbed waistband and a peek of the white tee
      mesh(rbox(0.012, torsoH * 0.82, 0.01, 0.003), trim, spine, [0, torsoH * 0.44, chestFront - 0.004], [1, 1, 1], [0.06, 0, 0]);
      mesh(cyl(0.168 * w * 1.1, 0.168 * w * 1.1, 0.05, 18), trim, spine, [0, torsoH * 0.06, 0], [1, 1, zScale * 1.02]);
      mesh(rbox(0.07, 0.05, 0.01, 0.01), white, spine, [0, torsoH * 0.88, chestFront + 0.01], [1, 1, 1], [0.2, 0, 0]);
    }
    if (look.topStyle === "openShirt" && shirtMat) {
      // the over-shirt hangs open: two front panels and a back, tee visible in the middle
      for (const sx of [-1, 1]) {
        mesh(rbox(0.11 * w, torsoH * 0.95, 0.02, 0.01), shirtMat, spine, [sx * 0.105 * w, torsoH * 0.4, chestFront - 0.005], [1, 1, 1], [0.05, sx * 0.12, sx * 0.05]);
        mesh(rbox(0.06, 0.08, 0.03, 0.01), shirtMat, spine, [sx * 0.07, torsoH * 0.9, chestFront + 0.02], [1, 1, 1], [0.4, sx * 0.5, sx * 0.4]); // collar
      }
      mesh(capsule(0.17, torsoH * 0.4, 4, 12), shirtMat, spine, [0, torsoH * 0.4, 0.04], [w * 1.12, 1, zScale * 0.85]);
    }
    if (look.topStyle === "raincoat") {
      mesh(cyl(0.2 * w, 0.26 * w, 0.5 * s, 14), topMat, spine, [0, torsoH * 0.05, 0]);
    }
    const chest = mk("chest", spine, 0, torsoH * 0.78, 0);
    if (look.chain) mesh(new THREE.TorusGeometry(0.085, 0.008, 6, 20), toonMat("#e3b23c"), chest, [0, 0.06, -0.06], [1.1 * w, 1, 1], [Math.PI / 2 + 0.55, 0, 0]);
    if (look.headphones) {
      mesh(new THREE.TorusGeometry(0.11, 0.015, 6, 16, Math.PI), dark, chest, [0, 0.11, 0.02], [1, 1, 1], [Math.PI / 2 + 0.3, 0, Math.PI]);
      mesh(cyl(0.04, 0.04, 0.03, 12), dark, chest, [0.11, 0.1, -0.02], [1, 1, 1], [0, 0, Math.PI / 2]);
      mesh(cyl(0.04, 0.04, 0.03, 12), dark, chest, [-0.11, 0.1, -0.02], [1, 1, 1], [0, 0, Math.PI / 2]);
    }
    const neck = mk("neck", chest, 0, 0.1 * s, 0);
    mesh(cyl(0.05, 0.06, 0.12, 10), skin, neck, [0, 0.03, 0]);
    if (look.topStyle === "bomber") mesh(new THREE.TorusGeometry(0.066, 0.02, 8, 16), trim, neck, [0, -0.02, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
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
    // eyes: sclera + colored iris + pupil + catchlight, with an eyelid that closes over them
    const er = hs * 0.24 * look.eyeSize;
    const iris = toonMat(look.iris);
    const eyeGroup = (x: number) => {
      const g = new THREE.Group();
      g.position.set(x, hs * 0.18, -hs * 0.82);
      head.add(g);
      mesh(sphere(er, 14, 10), white, g, [0, 0, 0], [1, 1.15, 0.7]);
      const pupilPivot = new THREE.Group();
      g.add(pupilPivot);
      mesh(sphere(er * 0.5, 12, 8), iris, pupilPivot, [0, 0, -er * 0.52], [1, 1.1, 0.42]);
      mesh(sphere(er * 0.27, 10, 8), dark, pupilPivot, [0, 0, -er * 0.66], [1, 1.1, 0.4]);
      mesh(sphere(er * 0.1, 6, 4), white, pupilPivot, [er * 0.14, er * 0.17, -er * 0.74], [1, 1, 0.5]);
      // upper lid: a dome that rotates down over the front of the eye (open = tilted back)
      const lid = new THREE.Group();
      g.add(lid);
      mesh(new THREE.SphereGeometry(er * 1.08, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), skin, lid, [0, 0, 0], [1.02, 0.82, 1.22]);
      if (look.eyeBags) mesh(sphere(er * 0.8, 10, 6), toonMat("#b98266"), g, [0, -er * 1.05, er * 0.05], [1.1, 0.4, 0.5]);
      return { pupilPivot, lid };
    };
    const eyeL = eyeGroup(-hs * 0.36);
    const eyeR = eyeGroup(hs * 0.36);
    // brows: thickness and shape per character
    const bs = look.brow.size;
    const brow = (x: number, side: number) => {
      const g = new THREE.Group();
      g.position.set(x, hs * 0.5, -hs * 0.86);
      head.add(g);
      mesh(rbox(hs * 0.5, hs * 0.1 * bs, hs * 0.08, hs * 0.035 * bs), hairM, g, [0, 0, 0], [1, 1, 1], [0.2, 0, side * 0.08]);
      return g;
    };
    const browL = brow(-hs * 0.36, 1);
    const browR = brow(hs * 0.36, -1);
    this.browBase = hs * 0.5;
    // mouth
    // a beard hugs the jaw; the mouth sits in a small bare patch in front of it
    const mz = look.beard ? -hs * 0.99 : -hs * 0.86;
    if (look.beard) {
      mesh(sphere(hs * 0.72, 16, 12), hairM, head, [0, -hs * 0.53, -hs * 0.27], [1.05, 0.8, 0.95]);
      mesh(sphere(hs * 0.3, 12, 8), skin, head, [0, -hs * 0.47, -hs * 0.86], [1.0, 0.5, 0.42]);
    }
    const mouth = mesh(new THREE.TorusGeometry(hs * 0.22, hs * 0.035, 6, 14, Math.PI), dark, head, [0, -hs * 0.48, mz]);
    const mouthOpen = mesh(sphere(hs * 0.16, 12, 8), toonMat("#3a1414"), head, [0, -hs * 0.52, mz + hs * 0.02], [1.1, 0.6, 0.4]);
    mouthOpen.visible = false;
    if (look.mustache || look.beard) mesh(capsule(hs * 0.09, hs * 0.38, 4, 8), hairM, head, [0, -hs * 0.34, mz - hs * 0.06], [1, 1, 0.8], [0, 0, Math.PI / 2]);
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
        // the marker he forgot behind his ear
        this.earMarker = mesh(cyl(0.008, 0.008, 0.11, 8), toonMat("#2b4fa8"), head, [hs * 0.92, hs * 0.25, hs * 0.05], [1, 1, 1], [0.3, 0, 1.2]);
        this.earMarker.userData.keep = true;
        break;
      case "cap":
        mesh(new THREE.SphereGeometry(hs * 1.02, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), accent, head, [0, hs * 0.18, 0.0], [1, 0.9, 1.05]);
        mesh(rbox(hs * 1.1, hs * 0.06, hs * 0.7, hs * 0.03), accent, head, [0, hs * 0.2, hs * 1.05], [1, 1, 1], [-0.12, 0, 0]);
        mesh(sphere(hs * 0.42, 10, 8), hairM, head, [0, hs * 0.05, hs * 0.75], [1.6, 0.8, 0.8]);
        break;
      case "beanie":
        mesh(new THREE.SphereGeometry(hs * 1.05, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), accent, head, [0, hs * 0.22, 0.02], [1, 1.05, 1.05]);
        mesh(cyl(hs * 1.05, hs * 1.07, hs * 0.25, 18), toonMat("#2c2a27"), head, [0, hs * 0.25, 0.02]);
        mesh(sphere(hs * 0.22, 8, 6), accent, head, [0, hs * 1.28, 0.02]); // pom-pom
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
    const makeArm = (side: 1 | -1) => {
      const sh = mk(side > 0 ? "shR" : "shL", chest, side * 0.185 * w, -0.01, 0);
      mesh(sphere(0.068, 12, 10), sleeveMat, sh, [0, -0.01, 0], [1.0, 1.05, 1]);
      if (shortSleeves) {
        // short sleeve + bare upper arm
        mesh(cyl(0.068, 0.064, armLen * 0.45, 12), sleeveMat, sh, [0, -armLen * 0.22, 0]);
        mesh(capsule(0.054, armLen * 0.55, 4, 10), skin, sh, [0, -armLen * 0.62, 0]);
      } else mesh(capsule(0.06, armLen * 0.78, 4, 10), sleeveMat, sh, [0, -armLen / 2, 0]);
      const el = mk(side > 0 ? "elR" : "elL", sh, 0, -armLen, 0);
      const fore = shortSleeves ? skin : sleeveMat;
      mesh(sphere(0.052, 10, 8), fore, el, [0, 0, 0]);
      mesh(capsule(0.05, foreLen * 0.78, 4, 10), fore, el, [0, -foreLen / 2, 0]);
      if (!shortSleeves) mesh(cyl(0.054, 0.054, 0.03, 10), look.topStyle === "bomber" ? trim : sleeveMat, el, [0, -foreLen + 0.02, 0]);
      const wr = mk(side > 0 ? "wrR" : "wrL", el, 0, -foreLen, 0);
      // cartoon hand: palm + index finger + three-finger block + thumb
      mesh(rbox(0.078, 0.082, 0.042, 0.02), skin, wr, [0, -0.044, 0]);
      const index = new THREE.Group();
      index.position.set(-side * 0.026, -0.084, 0);
      wr.add(index);
      mesh(capsule(0.012, 0.045, 4, 6), skin, index, [0, -0.03, 0]);
      const fingers = new THREE.Group();
      fingers.position.set(side * 0.01, -0.082, 0.0);
      wr.add(fingers);
      mesh(rbox(0.054, 0.056, 0.032, 0.015), skin, fingers, [0, -0.026, 0]);
      mesh(capsule(0.014, 0.035, 4, 6), skin, wr, [-side * 0.044, -0.05, -0.012], [1, 1, 1], [0.3, 0, side * 0.5]);
      const hand = side > 0 ? this.handR : this.handL;
      hand.position.set(0, -0.09, -0.03);
      wr.add(hand);
      if (side > 0) {
        this.fingersR = fingers;
        this.indexR = index;
      } else {
        this.fingersL = fingers;
        this.indexL = index;
      }
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
      if (look.shoeAccent) mesh(rbox(0.104, 0.025, 0.08, 0.008), toonMat(look.shoeAccent), an, [0, -0.005, 0.03]);
    };
    makeLeg(1);
    makeLeg(-1);

    this.face = { pupilL: eyeL.pupilPivot, pupilR: eyeR.pupilPivot, lidL: eyeL.lid, lidR: eyeR.lid, browL, browR, mouth, mouthOpen };
    mouth.userData.keep = true;
    mouthOpen.userData.keep = true;
    mergeDeep(this.root);
    // tiny details don't need to cast shadows
    this.root.traverse((o) => {
      const mm = o as THREE.Mesh;
      if (!mm.isMesh) return;
      mm.geometry.computeBoundingSphere();
      if ((mm.geometry.boundingSphere?.radius ?? 1) < 0.05) mm.castShadow = false;
      mm.receiveShadow = false;
    });
    this.eyeHeight = this.hipHeight + 0.05 * s + torsoH * 0.78 + 0.1 * s + 0.1 + hs * 0.9 + hs * 0.18;
  }

  /** Reset target to neutral before layering a new pose this frame. */
  resetTarget() {
    Object.assign(this.target, NEUTRAL);
    this.target.browL = this.target.browR = this.look.brow.tilt;
  }

  update(dt: number, time: number) {
    const t = this.target;
    const c = this.cur;
    for (const k in t) {
      const key = k as Channel;
      const sp = FAST[key] ?? 9 * this.speed;
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
    this.indexL.rotation.x = c.gripL * 1.35;
    this.indexR.rotation.x = c.gripR * 1.35 * (1 - Math.min(1, c.pointR));

    const f = this.face;
    const lid = Math.max(c.lid, blink);
    // 0 = dome tilted back over the top of the eyeball, 1 = covering the front
    const la = 0.78 - lid * (Math.PI / 2 + 0.78);
    f.lidL.rotation.x = la;
    f.lidR.rotation.x = la;
    f.pupilL.rotation.set(c.eyeY * 0.5, -c.eyeX * 0.6, 0);
    f.pupilR.rotation.set(c.eyeY * 0.5, -c.eyeX * 0.6, 0);
    f.browL.rotation.z = c.browL;
    f.browR.rotation.z = -c.browR;
    f.browL.position.y = f.browR.position.y = this.browBase + c.browY * 0.03;
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
  // short, round, tired; LAN house staff tee, keys on the belt
  owner: {
    height: 0.95,
    width: 1.15,
    belly: 0.8,
    head: 1.08,
    skin: "#d9a37e",
    top: "#2b2d31",
    topStyle: "tee",
    sleeves: "short",
    print: "logo",
    pants: "#4a4236",
    shoes: "#3a2a1f",
    belt: "#1d1b19",
    keys: true,
    hair: "bald",
    hairColor: "#4a3a2e",
    accent: "#8a5a3a",
    iris: "#5a4330",
    mustache: true,
    eyeBags: true,
    brow: { size: 1.2, tilt: 0.18 },
    nose: 1.35,
    eyeSize: 0.9,
  },
  // tall, skinny, loud teal satin bomber with gold trim, gold chain, red cap backwards
  topbuyer: {
    height: 1.04,
    width: 0.92,
    belly: 0,
    head: 1.0,
    skin: "#e8bf9a",
    top: "#14a39c",
    topStyle: "bomber",
    trim: "#e3b23c",
    pants: "#2b3550",
    shoes: "#f2efe6",
    shoeAccent: "#d4402f",
    hair: "cap",
    hairColor: "#2a1d14",
    accent: "#c8312b",
    iris: "#3a6aa5",
    headphones: true,
    chain: true,
    brow: { size: 0.9, tilt: 0.05 },
    nose: 1.1,
    eyeSize: 1.15,
  },
  // dark hoodie, hood up, screen glare on the glasses
  lurker: {
    height: 1.0,
    width: 0.95,
    belly: 0.1,
    head: 1.0,
    skin: "#c99572",
    top: "#30343b",
    topStyle: "hoodie",
    pants: "#1e2024",
    shoes: "#141414",
    hair: "hood",
    hairColor: "#141414",
    accent: "#3a3c40",
    iris: "#4f5a63",
    glasses: "screen",
    brow: { size: 1.0, tilt: -0.08 },
    nose: 0.95,
    eyeSize: 0.85,
  },
  // tall, thin, open plaid shirt over a triangle tee, wild white hair, marker behind the ear
  wizard: {
    height: 1.06,
    width: 0.88,
    belly: 0.15,
    head: 1.04,
    skin: "#efc7a3",
    top: "#e8e2d0",
    topStyle: "openShirt",
    print: "triangles",
    overShirt: "#4b6a9a",
    pants: "#5b5144",
    shoes: "#2a2420",
    hair: "messy",
    hairColor: "#d9d6cf",
    accent: "#7a5aa0",
    iris: "#4d7a4a",
    glasses: "round",
    beard: true,
    brow: { size: 1.35, tilt: -0.05 },
    nose: 1.45,
    eyeSize: 1.05,
  },
  // big, calm, oversized sage hoodie and grey sweatpants, beanie with a pom-pom
  nightshift: {
    height: 1.02,
    width: 1.22,
    belly: 0.45,
    head: 1.05,
    skin: "#8f5e44",
    top: "#6f8a6a",
    topStyle: "hoodie",
    pants: "#6b6e74",
    shoes: "#4a3a2a",
    hair: "beanie",
    hairColor: "#3a2c22",
    accent: "#c9822e",
    iris: "#3a2a20",
    beard: true,
    brow: { size: 1.1, tilt: 0.06 },
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
    iris: "#4a3a2a",
    brow: { size: 1, tilt: 0 },
    nose: 1.1,
    eyeSize: 1.0,
  },
};
