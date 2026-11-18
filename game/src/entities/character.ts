import * as THREE from 'three';
import { clamp, damp } from '../core/util';
import { MeshBuilder, shade } from '../render/geo';
import { M } from '../render/materials';

export interface CharSpec {
  skin: number;
  hair: number;
  hairStyle: 'swoop' | 'side' | 'short' | 'turban' | 'cap' | 'bald';
  jacket: number;
  shirt: number;
  tie: number | null;
  pants: number;
  shoes: number;
  /** Torso width multiplier. */
  bulk?: number;
  glasses?: boolean;
  beard?: number;
  bareArms?: boolean;
  tattoos?: boolean;
  stripes?: number;
  cap?: number;
  gold?: boolean;
  robe?: boolean;
}

export const OUTFITS: Record<string, { name: string; spec: CharSpec; how: string }> = {
  president: {
    name: 'Classic Presidential Suit', how: 'Default',
    spec: { skin: 0xf2a65e, hair: 0xf5c542, hairStyle: 'swoop', jacket: 0x1e2f5c, shirt: 0xf7f4ea, tie: 0xd2222d, pants: 0x1e2f5c, shoes: 0x1d1a2e },
  },
  golf: {
    name: 'Golf Trump', how: 'Finish Act I',
    spec: { skin: 0xf2a65e, hair: 0xf5c542, hairStyle: 'cap', cap: 0xd2222d, jacket: 0xf7f4ea, shirt: 0xf7f4ea, tie: null, pants: 0xd8cba8, shoes: 0xf7f4ea },
  },
  agent: {
    name: 'Secret Agent Trump', how: 'Escape the White House',
    spec: { skin: 0xf2a65e, hair: 0xf5c542, hairStyle: 'swoop', jacket: 0x16161f, shirt: 0xf7f4ea, tie: 0x16161f, pants: 0x16161f, shoes: 0x0e0e14, glasses: true },
  },
  golden: {
    name: 'Golden Suit Trump', how: 'Finish the campaign',
    spec: { skin: 0xf2a65e, hair: 0xf7d45a, hairStyle: 'swoop', jacket: 0xe8b830, shirt: 0xfff6d0, tie: 0xc98f1e, pants: 0xe8b830, shoes: 0x8a6414, gold: true },
  },
  casual: {
    name: 'Patriot Casual Trump', how: 'Find 15 Golden Ts',
    spec: { skin: 0xf2a65e, hair: 0xf5c542, hairStyle: 'swoop', jacket: 0x2a56c8, shirt: 0xf7f4ea, tie: 0xd2222d, pants: 0xf7f4ea, shoes: 0x1d1a2e, stripes: 0xd2222d },
  },
  bodybuilder: {
    name: 'Cartoon Bodybuilder Trump', how: 'Defeat the Desert Hideout',
    spec: { skin: 0xf2a65e, hair: 0xf5c542, hairStyle: 'swoop', jacket: 0xf7f4ea, shirt: 0xf7f4ea, tie: 0x2f6fd0, pants: 0x2f4f9a, shoes: 0x1d1a2e, bulk: 1.3, bareArms: true, tattoos: true },
  },
};

export const BOSS_SPECS: Record<string, CharSpec> = {
  biden: { skin: 0xf0c8a4, hair: 0xf2f0ea, hairStyle: 'side', jacket: 0x1f2c50, shirt: 0xf7f4ea, tie: 0x2f5fa8, pants: 0x1f2c50, shoes: 0x1d1a2e, glasses: true },
  obama: { skin: 0x9a6a48, hair: 0x3a3836, hairStyle: 'short', jacket: 0x4a4f5c, shirt: 0xf7f4ea, tie: 0x7a8fb0, pants: 0x4a4f5c, shoes: 0x1d1a2e },
  binladen: { skin: 0xc49a6c, hair: 0xf2f0ea, hairStyle: 'turban', jacket: 0x6f7a4a, shirt: 0xe6dcc6, tie: null, pants: 0xe6dcc6, shoes: 0x5a4a3a, beard: 0x4a4440, robe: true },
};

export interface Pose {
  hipY: number;
  rootX: number;
  torsoX: number;
  torsoY: number;
  torsoZ: number;
  headX: number;
  headY: number;
  aLx: number;
  aLz: number;
  fLx: number;
  aRx: number;
  aRz: number;
  fRx: number;
  lLx: number;
  sLx: number;
  lRx: number;
  sRx: number;
}

const zeroPose = (): Pose => ({ hipY: 0, rootX: 0, torsoX: 0, torsoY: 0, torsoZ: 0, headX: 0, headY: 0, aLx: 0, aLz: 0.1, fLx: -0.15, aRx: 0, aRz: -0.1, fRx: -0.15, lLx: 0, sLx: 0, lRx: 0, sRx: 0 });

export type AnimMode =
  | 'idle' | 'move' | 'jump' | 'fall' | 'land' | 'crouch' | 'dodge' | 'punch1' | 'punch2' | 'punch3' | 'aim' | 'shoot'
  | 'hit' | 'swim' | 'chute' | 'drive' | 'ride' | 'victory' | 'down' | 'climb' | 'taunt' | 'cheer' | 'talk' | 'throw';

const HIP = 0.84;

export class CharacterRig {
  root = new THREE.Group();
  private body = new THREE.Group();
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private aL = new THREE.Group();
  private aR = new THREE.Group();
  private fL = new THREE.Group();
  private fR = new THREE.Group();
  private lL = new THREE.Group();
  private lR = new THREE.Group();
  private sL = new THREE.Group();
  private sR = new THREE.Group();
  /** Attach point in the right hand (held items). */
  hand = new THREE.Group();
  pose = zeroPose();
  private target = zeroPose();
  phase = 0;
  private meshes: THREE.Mesh[] = [];
  height = 1.86;

  constructor(spec: CharSpec) {
    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.add(this.torso, this.lL, this.lR);
    this.torso.add(this.head, this.aL, this.aR);
    this.aL.add(this.fL);
    this.aR.add(this.fR);
    this.lL.add(this.sL);
    this.lR.add(this.sR);
    this.fR.add(this.hand);
    this.build(spec);
  }

  private part(parent: THREE.Group, b: MeshBuilder) {
    const m = new THREE.Mesh(b.build(), M.actor);
    m.castShadow = true;
    parent.add(m);
    this.meshes.push(m);
  }

  build(s: CharSpec) {
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.parent?.remove(m);
    }
    this.meshes = [];
    const bulk = s.bulk ?? 1;
    const TW = 0.62 * bulk, TH = 0.62, TD = 0.38 * (s.bulk ? 1.12 : 1);
    this.hips.position.y = HIP;
    this.torso.position.y = 0.06;
    this.head.position.y = TH + 0.02;
    const shoulder = TW / 2 + 0.07;
    this.aL.position.set(shoulder, TH - 0.08, 0);
    this.aR.position.set(-shoulder, TH - 0.08, 0);
    this.fL.position.y = -0.32;
    this.fR.position.y = -0.32;
    this.lL.position.set(0.16, 0, 0);
    this.lR.position.set(-0.16, 0, 0);
    this.sL.position.y = -0.4;
    this.sR.position.y = -0.4;
    this.hand.position.set(0, -0.36, 0.06);

    // ---- torso
    let b = new MeshBuilder();
    const jacket = s.bareArms ? s.skin : s.jacket;
    if (s.robe) {
      b.box(0, TH / 2 - 0.2, 0, TW, TH + 0.4, TD, s.shirt, 0, 0);
      b.box(0, TH / 2 + 0.05, 0, TW + 0.04, TH - 0.1, TD + 0.04, s.jacket, 0, 4 | 8 | 16);
    } else if (s.bareArms) {
      // tank top over bare torso
      b.box(0, TH / 2, 0, TW, TH, TD, s.skin, 0, 0);
      b.box(0, TH / 2 - 0.06, 0, TW * 0.82, TH - 0.1, TD + 0.03, s.shirt, 0, 0);
      if (s.tattoos) for (const [x, y] of [[-0.36, 0.45], [0.36, 0.42], [-0.34, 0.2], [0.35, 0.18]]) b.box(x * bulk, y, 0.05, 0.04, 0.12, 0.2, 0x2f7f86, 0, 0);
    } else {
      b.box(0, TH / 2, 0, TW, TH, TD, jacket, 0, 0);
      b.box(0, -0.05, 0, TW + 0.04, 0.2, TD + 0.04, shade(jacket, 0.92), 0, 4);
      // shirt V + lapels
      b.tri(-0.13, TH, TD / 2 + 0.006, 0, TH - 0.34, TD / 2 + 0.006, 0.13, TH, TD / 2 + 0.006, s.shirt);
      b.tri(-0.2, TH, TD / 2 + 0.01, -0.03, TH - 0.36, TD / 2 + 0.01, -0.12, TH, TD / 2 + 0.01, shade(jacket, 1.35));
      b.tri(0.12, TH, TD / 2 + 0.01, 0.03, TH - 0.36, TD / 2 + 0.01, 0.2, TH, TD / 2 + 0.01, shade(jacket, 1.35));
      for (const y of [0.14, 0.26]) b.box(0.02, y, TD / 2 + 0.01, 0.035, 0.035, 0.02, s.gold ? 0xfff0a0 : 0x101018, 0, 0);
      // flag lapel pin
      b.box(0.2, TH - 0.16, TD / 2 + 0.012, 0.06, 0.04, 0.012, 0xd2222d, 0, 0);
      b.box(0.185, TH - 0.15, TD / 2 + 0.016, 0.03, 0.022, 0.012, 0x2a56c8, 0, 0);
    }
    if (s.tie !== null) {
      // famously long tie
      b.box(0, TH - 0.07, TD / 2 + 0.02, 0.1, 0.09, 0.03, s.tie, 0, 0);
      b.box(0, TH - 0.42, TD / 2 + 0.03, 0.105, 0.64, 0.025, s.tie, 0, 0);
      b.tri(-0.052, TH - 0.74, TD / 2 + 0.043, 0, TH - 0.84, TD / 2 + 0.043, 0.052, TH - 0.74, TD / 2 + 0.043, s.tie);
    }
    b.box(0, TH + 0.02, 0, 0.2, 0.08, 0.2, s.skin, 0, 0);
    this.part(this.torso, b);

    // ---- head
    b = new MeshBuilder();
    const HW = 0.46, HH = 0.46, HD = 0.44, hy = 0.06;
    b.box(0, hy + HH / 2, 0, HW, HH, HD, s.skin, 0, 0);
    b.box(0, hy + 0.1, 0.01, HW + 0.05, 0.22, HD, shade(s.skin, 0.97), 0, 0); // jowls
    b.box(0, hy + 0.22, HD / 2 + 0.05, 0.1, 0.13, 0.1, shade(s.skin, 0.93), 0, 0); // nose
    for (const sx of [-1, 1]) {
      b.box(sx * 0.115, hy + 0.3, HD / 2 + 0.006, 0.15, 0.1, 0.012, shade(s.skin, 1.18), 0, 0); // pale eye patch
      b.box(sx * 0.115, hy + 0.3, HD / 2 + 0.014, 0.07, 0.035, 0.012, 0xf7f4ea, 0, 0);
      b.box(sx * 0.115, hy + 0.3, HD / 2 + 0.02, 0.03, 0.035, 0.012, 0x23324a, 0, 0);
      b.box(sx * 0.12, hy + 0.37, HD / 2 + 0.02, 0.15, 0.035, 0.03, s.hairStyle === 'short' || s.hairStyle === 'turban' ? 0x3a3836 : shade(s.hair, 0.9), -sx * 0.0, 0);
      b.box(sx * (HW / 2 + 0.025), hy + 0.24, -0.02, 0.05, 0.13, 0.08, shade(s.skin, 0.95), 0, 0); // ears
    }
    // angled brows
    b.quad(-0.2, hy + 0.385, HD / 2 + 0.04, -0.04, hy + 0.345, HD / 2 + 0.04, -0.04, hy + 0.38, HD / 2 + 0.04, -0.2, hy + 0.42, HD / 2 + 0.04, s.hairStyle === 'short' || s.hairStyle === 'turban' ? 0x3a3836 : shade(s.hair, 0.82));
    b.quad(0.04, hy + 0.345, HD / 2 + 0.04, 0.2, hy + 0.385, HD / 2 + 0.04, 0.2, hy + 0.42, HD / 2 + 0.04, 0.04, hy + 0.38, HD / 2 + 0.04, s.hairStyle === 'short' || s.hairStyle === 'turban' ? 0x3a3836 : shade(s.hair, 0.82));
    b.box(0, hy + 0.1, HD / 2 + 0.012, 0.13, 0.06, 0.02, 0xc9705a, 0, 0); // pursed mouth
    b.box(0, hy + 0.1, HD / 2 + 0.02, 0.07, 0.03, 0.02, 0x7a2a2a, 0, 0);
    if (s.glasses) {
      b.box(0, hy + 0.3, HD / 2 + 0.03, 0.4, 0.09, 0.02, 0x15151c, 0, 0);
      for (const sx of [-1, 1]) b.box(sx * (HW / 2 + 0.01), hy + 0.31, 0.08, 0.02, 0.03, 0.3, 0x15151c, 0, 0);
    }
    if (s.beard !== undefined) {
      b.box(0, hy - 0.02, HD / 2 - 0.04, 0.4, 0.34, 0.16, s.beard, 0, 0);
      b.box(0, hy - 0.2, HD / 2 - 0.02, 0.26, 0.2, 0.1, shade(s.beard, 1.5), 0, 0);
      for (const sx of [-1, 1]) b.box(sx * 0.22, hy + 0.14, 0.06, 0.06, 0.24, 0.3, s.beard, 0, 0);
    }
    const top = hy + HH;
    const hc = s.hair, hd2 = shade(s.hair, 0.86);
    if (s.hairStyle === 'swoop' || s.hairStyle === 'cap') {
      // the hair: back volume, side wings, and a big forward-swept quiff
      b.box(0, top - 0.12, -HD / 2 - 0.03, HW + 0.08, 0.42, 0.14, hc, 0, 0);
      for (const sx of [-1, 1]) b.box(sx * (HW / 2 + 0.03), top - 0.1, -0.03, 0.08, 0.3, HD * 0.82, hd2, 0, 0);
      if (s.hairStyle === 'swoop') {
        b.box(0, top + 0.07, -0.04, HW + 0.1, 0.17, HD + 0.06, hc, 0, 0);
        b.box(0.02, top + 0.1, HD / 2 + 0.07, HW + 0.12, 0.15, 0.3, hc, 0, 0);
        b.box(0.06, top + 0.19, HD / 2 + 0.02, HW * 0.86, 0.1, 0.34, shade(hc, 1.1), 0.1, 0);
        b.box(-0.2, top + 0.04, HD / 2 + 0.18, 0.2, 0.1, 0.14, hd2, 0.5, 0);
        b.box(0.26, top + 0.13, HD / 2 + 0.2, 0.14, 0.12, 0.14, shade(hc, 1.1), -0.6, 0); // the flick
        for (const x of [-0.14, 0.03, 0.18]) b.box(x, top + 0.162, -0.02, 0.02, 0.012, HD, hd2, 0, 0);
      } else {
        b.box(0, top + 0.06, 0, HW + 0.06, 0.14, HD + 0.06, s.cap!, 0, 0);
        b.box(0, top + 0.01, HD / 2 + 0.14, HW * 0.9, 0.04, 0.26, shade(s.cap!, 0.85), 0, 0);
        b.box(0, top + 0.07, HD / 2 + 0.035, 0.2, 0.08, 0.012, 0xf7f4ea, 0, 0);
      }
    } else if (s.hairStyle === 'side') {
      b.box(0, top + 0.03, -0.03, HW + 0.04, 0.09, HD + 0.02, hc, 0, 0);
      b.box(0, top - 0.12, -HD / 2 - 0.02, HW + 0.05, 0.3, 0.08, hc, 0, 0);
      for (const sx of [-1, 1]) b.box(sx * (HW / 2 + 0.02), top - 0.1, -0.06, 0.05, 0.22, HD * 0.6, hd2, 0, 0);
      b.box(0.1, top + 0.06, HD / 2 - 0.02, 0.3, 0.07, 0.1, hc, 0.25, 0);
    } else if (s.hairStyle === 'short') {
      b.box(0, top + 0.02, -0.02, HW + 0.03, 0.08, HD + 0.02, hc, 0, 0);
      b.box(0, top - 0.1, -HD / 2 - 0.015, HW + 0.03, 0.26, 0.05, hc, 0, 0);
      for (const sx of [-1, 1]) b.box(sx * (HW / 2 + 0.045), hy + 0.25, -0.02, 0.05, 0.19, 0.1, shade(s.skin, 0.95), 0, 0); // generous ears
    } else if (s.hairStyle === 'turban') {
      b.box(0, top + 0.07, -0.02, HW + 0.14, 0.24, HD + 0.14, hc, 0, 0);
      b.box(0, top + 0.2, -0.02, HW, 0.1, HD, shade(hc, 0.94), 0, 0);
      b.box(-0.12, top + 0.08, HD / 2 + 0.075, 0.3, 0.07, 0.02, shade(hc, 0.9), 0.5 * 0, 0);
    }
    this.part(this.head, b);

    // ---- arms
    const arm = (side: number) => {
      const up = new MeshBuilder();
      const ac = s.bareArms ? s.skin : s.jacket;
      const aw = s.bareArms && s.bulk ? 0.24 : 0.18;
      up.box(0, -0.16, 0, aw, 0.36, aw + 0.02, ac, 0, 0);
      if (s.tattoos) {
        up.box(side * (aw / 2 + 0.004), -0.14, 0, 0.01, 0.2, 0.13, 0x2f7f86, 0, 0);
        up.box(0, -0.2, aw / 2 + 0.014, 0.12, 0.12, 0.01, 0x2f7f86, 0, 0);
      }
      this.part(side > 0 ? this.aL : this.aR, up);
      const fo = new MeshBuilder();
      fo.box(0, -0.14, 0, aw - 0.03, 0.3, aw - 0.01, ac, 0, 0);
      if (!s.bareArms && !s.robe) fo.box(0, -0.275, 0, aw - 0.01, 0.045, aw + 0.01, s.shirt, 0, 0);
      if (s.tattoos) fo.box(side * (aw / 2 - 0.012), -0.13, 0, 0.01, 0.2, 0.12, 0x2f7f86, 0, 0);
      fo.box(0, -0.36, 0.01, 0.13, 0.14, 0.14, s.skin, 0, 0);
      fo.box(side * -0.02, -0.35, 0.09, 0.05, 0.07, 0.05, s.skin, 0, 0); // thumb
      this.part(side > 0 ? this.fL : this.fR, fo);
    };
    arm(1);
    arm(-1);

    // ---- legs
    const leg = (side: number) => {
      const th = new MeshBuilder();
      if (s.robe) th.box(0, -0.2, 0, 0.24, 0.42, 0.26, s.shirt, 0, 0);
      else th.box(0, -0.2, 0, 0.22, 0.42, 0.24, s.pants, 0, 0);
      if (s.stripes) for (const x of [-0.06, 0.06]) th.box(x, -0.2, 0, 0.04, 0.42, 0.245, s.stripes, 0, 4 | 8);
      this.part(side > 0 ? this.lL : this.lR, th);
      const sh = new MeshBuilder();
      sh.box(0, -0.18, 0, 0.19, 0.38, 0.21, s.robe ? s.shirt : s.pants, 0, 0);
      if (s.stripes) for (const x of [-0.05, 0.05]) sh.box(x, -0.18, 0, 0.035, 0.38, 0.215, s.stripes, 0, 4 | 8);
      sh.box(0, -0.4, 0.05, 0.2, 0.1, 0.34, s.shoes, 0, 0);
      this.part(side > 0 ? this.sL : this.sR, sh);
    };
    leg(1);
    leg(-1);
  }

  /** Compute the target pose for a mode. `p` is progress 0..1 for one-shot actions, `speed` in m/s. */
  animate(mode: AnimMode, dt: number, speed = 0, p = 0, time = 0) {
    const t = this.target;
    Object.assign(t, zeroPose());
    let stiff = 16;
    switch (mode) {
      case 'idle':
        t.torsoX = 0.02 + Math.sin(time * 1.7) * 0.012;
        t.aLz = 0.12 + Math.sin(time * 1.7) * 0.01;
        t.aRz = -t.aLz;
        t.headY = Math.sin(time * 0.6) * 0.12;
        break;
      case 'move': {
        const amp = clamp(speed / 7.5, 0.15, 1);
        this.phase += dt * (4.2 + speed * 1.25);
        const s = Math.sin(this.phase), c = Math.cos(this.phase);
        t.lLx = -s * (0.45 + 0.5 * amp);
        t.lRx = s * (0.45 + 0.5 * amp);
        t.sLx = Math.max(0, c) * (0.5 + 0.9 * amp) + 0.08;
        t.sRx = Math.max(0, -c) * (0.5 + 0.9 * amp) + 0.08;
        t.aLx = s * (0.35 + 0.6 * amp);
        t.aRx = -s * (0.35 + 0.6 * amp);
        t.fLx = t.fRx = -(0.25 + 1.0 * amp);
        t.torsoX = 0.04 + 0.2 * amp;
        t.torsoY = s * 0.1 * amp;
        t.hipY = -Math.abs(c) * 0.035 * amp;
        stiff = 22;
        break;
      }
      case 'jump':
        t.aLx = t.aRx = -2.2;
        t.aLz = 0.5;
        t.aRz = -0.5;
        t.lLx = -0.5;
        t.sLx = 0.9;
        t.lRx = 0.15;
        t.sRx = 0.4;
        t.torsoX = 0.1;
        break;
      case 'fall':
        t.aLx = t.aRx = -1.4 + Math.sin(time * 16) * 0.3;
        t.aLz = 1.1;
        t.aRz = -1.1;
        t.lLx = -0.3 + Math.sin(time * 13) * 0.25;
        t.lRx = -0.3 - Math.sin(time * 13) * 0.25;
        t.sLx = t.sRx = 0.5;
        break;
      case 'land':
        t.hipY = -0.28;
        t.lLx = t.lRx = -0.9;
        t.sLx = t.sRx = 1.5;
        t.torsoX = 0.4;
        t.aLz = 0.6;
        t.aRz = -0.6;
        stiff = 30;
        break;
      case 'crouch': {
        this.phase += dt * (3 + speed * 2.2);
        const s = Math.sin(this.phase) * clamp(speed / 2, 0, 1);
        t.hipY = -0.3;
        t.lLx = -1.0 - s * 0.3;
        t.lRx = -1.0 + s * 0.3;
        t.sLx = t.sRx = 1.6;
        t.torsoX = 0.42;
        t.headX = -0.3;
        t.fLx = t.fRx = -1.1;
        break;
      }
      case 'dodge':
        t.rootX = p * Math.PI * 2;
        t.hipY = -0.34;
        t.lLx = t.lRx = -1.6;
        t.sLx = t.sRx = 2.0;
        t.torsoX = 0.7;
        t.aLx = t.aRx = -1.2;
        t.fLx = t.fRx = -1.6;
        stiff = 40;
        break;
      case 'punch1':
      case 'punch2': {
        const k = Math.sin(clamp(p * 1.4, 0, 1) * Math.PI);
        const right = mode === 'punch1';
        t.torsoY = (right ? 1 : -1) * k * 0.7;
        t.torsoX = 0.15;
        if (right) {
          t.aRx = -0.3 - k * 1.4;
          t.fRx = -1.5 + k * 1.4;
          t.aLx = -0.6;
          t.fLx = -1.7;
        } else {
          t.aLx = -0.3 - k * 1.4;
          t.fLx = -1.5 + k * 1.4;
          t.aRx = -0.6;
          t.fRx = -1.7;
        }
        t.lLx = -0.3;
        t.lRx = 0.25;
        stiff = 34;
        break;
      }
      case 'punch3': {
        const k = Math.sin(clamp(p * 1.3, 0, 1) * Math.PI);
        t.aLx = t.aRx = -0.4 - k * 1.2;
        t.fLx = t.fRx = -1.6 + k * 1.5;
        t.torsoX = 0.1 + k * 0.4;
        t.lLx = -0.5;
        t.lRx = 0.4;
        stiff = 34;
        break;
      }
      case 'throw': {
        const k = clamp(p * 1.6, 0, 1);
        t.aRx = -2.8 + k * 2.3;
        t.fRx = -0.9 + k * 0.7;
        t.torsoY = 0.5 - k * 0.9;
        t.aLx = -0.5;
        t.fLx = -0.8;
        stiff = 30;
        break;
      }
      case 'aim':
      case 'shoot':
        t.aRx = -1.5 + (mode === 'shoot' ? -0.25 * (1 - p) : 0);
        t.fRx = -0.05;
        t.aRz = 0.1;
        t.aLx = -0.9;
        t.fLx = -1.3;
        t.aLz = -0.5;
        t.torsoY = -0.25;
        if (speed > 0.3) {
          this.phase += dt * (4 + speed * 1.4);
          const s = Math.sin(this.phase);
          t.lLx = -s * 0.5;
          t.lRx = s * 0.5;
          t.sLx = Math.max(0, Math.cos(this.phase)) * 0.6;
          t.sRx = Math.max(0, -Math.cos(this.phase)) * 0.6;
        }
        stiff = 26;
        break;
      case 'hit':
        t.torsoX = -0.45;
        t.headX = -0.3;
        t.aLx = t.aRx = -0.8;
        t.aLz = 0.9;
        t.aRz = -0.9;
        t.lLx = 0.2;
        t.lRx = -0.3;
        stiff = 30;
        break;
      case 'swim': {
        this.phase += dt * (3 + speed * 1.2);
        const s = Math.sin(this.phase);
        t.rootX = 1.25;
        t.hipY = -0.5;
        t.headX = -0.9;
        t.aLx = -2.6 + s * 0.9;
        t.aRx = -2.6 - s * 0.9;
        t.fLx = t.fRx = -0.2;
        t.lLx = s * 0.4;
        t.lRx = -s * 0.4;
        t.sLx = t.sRx = 0.25;
        break;
      }
      case 'chute':
        t.aLx = t.aRx = -2.75;
        t.aLz = 0.42;
        t.aRz = -0.42;
        t.fLx = t.fRx = -0.25;
        t.lLx = -0.25 + Math.sin(time * 1.9) * 0.14 - speed * 0.02;
        t.lRx = -0.1 - Math.sin(time * 1.9) * 0.14 - speed * 0.02;
        t.sLx = t.sRx = 0.45;
        t.torsoX = clamp(speed * 0.015, 0, 0.3);
        stiff = 8;
        break;
      case 'drive':
      case 'ride':
        t.hipY = mode === 'ride' ? -0.2 : -0.42;
        t.lLx = t.lRx = mode === 'ride' ? -1.15 : -1.45;
        t.sLx = t.sRx = mode === 'ride' ? 1.5 : 1.25;
        t.aLx = t.aRx = mode === 'ride' ? -1.25 : -1.05;
        t.fLx = t.fRx = -0.4;
        t.aLz = 0.15;
        t.aRz = -0.15;
        t.torsoX = mode === 'ride' ? 0.4 : 0.05;
        t.headX = mode === 'ride' ? -0.3 : 0;
        break;
      case 'victory':
      case 'cheer': {
        const s = Math.sin(time * 9);
        t.aLx = t.aRx = -2.7 + s * 0.25;
        t.aLz = 0.5;
        t.aRz = -0.5;
        t.fLx = t.fRx = -0.5 - s * 0.3;
        t.hipY = Math.abs(s) * 0.05;
        t.headX = -0.2;
        break;
      }
      case 'taunt': {
        const s = Math.sin(time * 5);
        t.aRx = -1.5 + s * 0.2;
        t.fRx = -1.2;
        t.aRz = -0.3;
        t.aLz = 0.5;
        t.fLx = -1.5;
        t.torsoY = s * 0.15;
        break;
      }
      case 'talk': {
        const s = Math.sin(time * 4);
        t.aRx = -0.7 + s * 0.3;
        t.fRx = -1.2 - s * 0.3;
        t.aLx = -0.5 - s * 0.2;
        t.fLx = -1.0 + s * 0.3;
        t.headY = s * 0.15;
        break;
      }
      case 'down':
        t.rootX = -1.45;
        t.hipY = -0.55;
        t.aLz = 1.2;
        t.aRz = -1.2;
        t.lLx = 0.2;
        t.lRx = -0.1;
        stiff = 9;
        break;
      case 'climb':
        t.aLx = t.aRx = -2.9 + p * 1.8;
        t.fLx = t.fRx = -0.3 - p;
        t.lLx = -0.2 - p * 1.0;
        t.sLx = 0.4 + p;
        t.lRx = 0.1;
        t.torsoX = 0.2;
        break;
    }
    const k = this.pose;
    for (const key of Object.keys(t) as (keyof Pose)[]) k[key] = damp(k[key], t[key], key === 'rootX' && mode === 'dodge' ? 60 : stiff, dt);
    if (mode !== 'dodge' && Math.abs(k.rootX) > 3.2) k.rootX = 0; // finish a roll cleanly
    this.apply();
  }

  private apply() {
    const k = this.pose;
    this.body.rotation.x = k.rootX;
    this.body.position.y = k.rootX !== 0 ? HIP * (1 - Math.cos(k.rootX)) * 0.5 : 0;
    this.hips.position.y = HIP + k.hipY;
    this.torso.rotation.set(k.torsoX, k.torsoY, k.torsoZ);
    this.head.rotation.set(k.headX, k.headY, 0);
    this.aL.rotation.set(k.aLx, 0, k.aLz);
    this.aR.rotation.set(k.aRx, 0, k.aRz);
    this.fL.rotation.x = k.fLx;
    this.fR.rotation.x = k.fRx;
    this.lL.rotation.x = k.lLx;
    this.lR.rotation.x = k.lRx;
    this.sL.rotation.x = k.sLx;
    this.sR.rotation.x = k.sRx;
  }

  setVisible(v: boolean) {
    this.root.visible = v;
  }
}

/** American-flag parachute canopy. */
export function buildParachute(): THREE.Group {
  const g = new THREE.Group();
  const b = new MeshBuilder();
  const R = 4.2, N = 12;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
    const blue = i >= N - 3;
    const col = blue ? 0x2a56c8 : i % 2 ? 0xd2222d : 0xf7f4ea;
    const ring = (r: number, y: number, a: number): [number, number, number] => [Math.cos(a) * r, y, Math.sin(a) * r];
    const p0 = ring(R, 5.2, a0), p1 = ring(R, 5.2, a1), q0 = ring(R * 0.62, 6.5, a0), q1 = ring(R * 0.62, 6.5, a1);
    b.quad(p1[0], p1[1], p1[2], p0[0], p0[1], p0[2], q0[0], q0[1], q0[2], q1[0], q1[1], q1[2], col);
    b.tri(q1[0], q1[1], q1[2], q0[0], q0[1], q0[2], 0, 7.0, 0, blue ? 0x2a56c8 : col);
    // inside faces
    b.quad(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], q1[0], q1[1], q1[2], q0[0], q0[1], q0[2], shade(col, 0.8));
    b.tri(q0[0], q0[1], q0[2], q1[0], q1[1], q1[2], 0, 7.0, 0, shade(col, 0.8));
    if (blue) b.box((p0[0] + q1[0]) / 2, 5.95, (p0[2] + q1[2]) / 2, 0.3, 0.3, 0.3, 0xf7f4ea, a0, 0);
    // suspension lines
    if (i % 2 === 0) {
      const sx = Math.cos(a0) * 0.25, sz = Math.sin(a0) * 0.25;
      b.quad(sx, 1.7, sz, p0[0], p0[1], p0[2], p0[0] + 0.04, p0[1], p0[2] + 0.04, sx + 0.04, 1.7, sz + 0.04, 0x2b2e42);
      b.quad(p0[0], p0[1], p0[2], sx, 1.7, sz, sx + 0.04, 1.7, sz + 0.04, p0[0] + 0.04, p0[1], p0[2] + 0.04, 0x2b2e42);
    }
  }
  const m = new THREE.Mesh(b.build(), M.actor);
  m.castShadow = true;
  g.add(m);
  return g;
}
