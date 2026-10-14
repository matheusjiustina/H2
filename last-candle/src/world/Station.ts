import * as THREE from "three";
import type { Builder } from "./Builder";
import { cyl, mergeByMaterial, plane, rbox, sphere } from "./geometry";
import { L, type StationDef } from "./layout";
import { colorMat, materials } from "./materials";
import { screenGlowMat } from "./Dressing";
import { stickerTex } from "./textures";

export type MonitorKind = "crt" | "lcd4" | "lcdWide";

export interface Loadout {
  chair: "old" | "gamer";
  keyboard: "old" | "mech";
  monitor: MonitorKind;
  second: boolean;
  case: "old" | "custom";
  deco: boolean;
}

export const SCREEN_SIZES: Record<MonitorKind, { w: number; h: number; px: [number, number] }> = {
  crt: { w: 0.33, h: 0.25, px: [1280, 970] },
  lcd4: { w: 0.37, h: 0.28, px: [1280, 970] },
  lcdWide: { w: 0.62, h: 0.385, px: [1680, 1044] },
};

export const DESK_FRONT = 0.4; // distance chair center → desk front edge
const DESK_W = 1.28;

const CHAIR_VARIANTS = [
  { fabric: "fabricBlue", back: 0.5, arms: true, tape: false },
  { fabric: "fabricRed", back: 0.42, arms: false, tape: true },
  { fabric: "fabricGreen", back: 0.55, arms: true, tape: false },
  { fabric: "fabricBlue", back: 0.46, arms: false, tape: false },
  { fabric: "fabricRed", back: 0.5, arms: true, tape: false },
  { fabric: "fabricGreen", back: 0.4, arms: false, tape: true },
] as const;

/**
 * One PC station: desk, monitor(s), tower, peripherals and a swivel chair.
 * Upgradeable parts are rebuilt in place when the loadout changes.
 */
export class StationVisual {
  readonly root = new THREE.Group();
  /** Swivel part of the chair (seat + back). NPCs sit on this. */
  readonly swivel = new THREE.Group();
  screen!: THREE.Mesh<THREE.PlaneGeometry | THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  screen2: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null = null;
  monitorKind: MonitorKind = "lcd4";
  fans: THREE.Object3D[] = [];
  keyboardMesh: THREE.Object3D | null = null;
  /** Interaction proxy covering the chair (for "Sit"). */
  readonly chairProxy: THREE.Mesh;
  /** Interaction proxy covering the monitor (for "Use terminal"). */
  readonly monitorProxy: THREE.Mesh;
  chairYaw = 0;
  chairSpin = 0;
  /** How far the chair is rolled back from the desk (m) and tipped forward (rad). Driven by whoever sits. */
  chairSlide = 0;
  chairTilt = 0;
  slideTarget = 0;
  tiltTarget = 0;
  private parts = {
    chair: new THREE.Group(),
    keyboard: new THREE.Group(),
    monitor: new THREE.Group(),
    second: new THREE.Group(),
    tower: new THREE.Group(),
    deco: new THREE.Group(),
  };
  private loadout: Loadout | null = null;
  private screenTex: THREE.Texture | null = null;
  private screen2Tex: THREE.Texture | null = null;
  readonly variant: (typeof CHAIR_VARIANTS)[number];

  constructor(
    readonly def: StationDef,
    readonly index: number,
    b: Builder,
  ) {
    const m = materials();
    this.variant = CHAIR_VARIANTS[index % CHAIR_VARIANTS.length];
    this.root.name = `station-${def.id}`;
    this.root.userData.dynamic = true;
    this.root.position.set(def.chair[0], def.chair[1], def.chair[2]);
    this.root.rotation.y = def.facing;
    b.scene.add(this.root);
    for (const p of Object.values(this.parts)) this.root.add(p);

    const y0 = def.chair[1];
    const deskCZ = -(DESK_FRONT + L.deskDepth / 2);
    // Desk (static parts go in a separate non-dynamic group so they can be batched)
    const staticGroup = new THREE.Group();
    staticGroup.position.copy(this.root.position);
    staticGroup.rotation.copy(this.root.rotation);
    b.scene.add(staticGroup);
    staticGroup.updateMatrixWorld(true);
    const top = b.mesh(rbox(DESK_W, 0.035, L.deskDepth, 0.008), m.laminate, { pos: [0, L.deskH - 0.0175, deskCZ], parent: staticGroup, cast: true });
    top.receiveShadow = true;
    // edge band
    b.mesh(rbox(DESK_W + 0.004, 0.03, 0.02, 0.006), m.darkGrey, { pos: [0, L.deskH - 0.02, deskCZ + L.deskDepth / 2], parent: staticGroup });
    for (const sx of [-1, 1]) {
      b.mesh(rbox(0.04, L.deskH - 0.035, L.deskDepth - 0.06, 0.006), m.metal, { pos: [sx * (DESK_W / 2 - 0.04), (L.deskH - 0.035) / 2, deskCZ], parent: staticGroup });
    }
    b.mesh(rbox(DESK_W - 0.1, 0.36, 0.02, 0.004), m.darkGrey, { pos: [0, 0.45, deskCZ - L.deskDepth / 2 + 0.06], parent: staticGroup });
    // mousepad (big)
    b.mesh(rbox(0.62, 0.004, 0.3, 0.002), m.mousepad, { pos: [0.08, L.deskH + 0.002, deskCZ + 0.2], parent: staticGroup });
    // mouse
    b.mesh(rbox(0.06, 0.03, 0.1, 0.014), def.row === "mezz" ? m.black : m.beigeOld, { pos: [0.32, L.deskH + 0.019, deskCZ + 0.2], parent: staticGroup });
    // cable from mouse to back
    this.cable(b, staticGroup, [0.32, L.deskH + 0.01, deskCZ + 0.14], [0.45, L.deskH + 0.005, deskCZ - 0.3]);
    // headphones hanging on some desks
    if (index % 3 === 1) {
      b.mesh(new THREE.TorusGeometry(0.08, 0.012, 6, 16, Math.PI), m.black, { pos: [-0.62, L.deskH - 0.08, deskCZ + 0.25], rot: [0, Math.PI / 2, Math.PI], parent: staticGroup });
    }
    // cable runs: tower ↔ monitor and keyboard through a desk grommet, down to a floor power strip
    const backZ = -(DESK_FRONT + L.deskDepth);
    const side = index % 2 === 0 ? -1 : 1;
    const tx = side * 0.48;
    const gx = side * 0.3;
    const dy = L.deskH + 0.004;
    b.mesh(cyl(0.028, 0.028, 0.004, 14), m.black, { pos: [gx, L.deskH + 0.001, backZ + 0.09], parent: staticGroup });
    this.wire(b, staticGroup, [[0, dy, backZ + 0.16], [gx * 0.5, dy, backZ + 0.13], [gx, dy, backZ + 0.09]]);
    this.wire(b, staticGroup, [[tx, L.deskH + 0.04, backZ + 0.09], [tx - side * 0.06, dy, backZ + 0.08], [gx, dy, backZ + 0.09]]);
    this.wire(b, staticGroup, [[-0.08, dy, deskCZ + 0.1], [-0.12, dy, deskCZ - 0.05], [gx * 0.6, dy, backZ + 0.2], [gx, dy, backZ + 0.09]]);
    this.wire(b, staticGroup, [[gx, L.deskH - 0.03, backZ + 0.09], [gx + side * 0.02, 0.4, backZ + 0.11], [gx * 0.7, 0.03, backZ + 0.16]]);
    b.mesh(rbox(0.3, 0.035, 0.06, 0.008), m.darkGrey, { pos: [gx * 0.45, 0.018, backZ + 0.18], parent: staticGroup });
    b.mesh(sphere(0.006, 6, 4), m.ledAmber, { pos: [gx * 0.45 + 0.13, 0.036, backZ + 0.18], parent: staticGroup });
    // the screen's light pooling on the desk
    b.mesh(plane(0.95, 0.6), screenGlowMat(), { pos: [0, L.deskH + 0.002, backZ + 0.46], rot: [-Math.PI / 2, 0, 0], parent: staticGroup, receive: false });
    staticGroup.updateMatrixWorld(true);

    // World-space collision: desk footprint
    const wDesk = this.toWorld(0, 0, deskCZ);
    const fwd = this.toWorldDir(0, 0, -1);
    const right = this.toWorldDir(1, 0, 0);
    const halfAlongFwd = L.deskDepth / 2;
    const halfAlongRight = DESK_W / 2;
    const ex = Math.abs(fwd.x) * halfAlongFwd + Math.abs(right.x) * halfAlongRight;
    const ez = Math.abs(fwd.z) * halfAlongFwd + Math.abs(right.z) * halfAlongRight;
    b.solid(wDesk.x - ex, wDesk.x + ex, y0, y0 + L.deskH + 0.6, wDesk.z - ez, wDesk.z + ez, `desk-${def.id}`);
    // physics: desk top, thickened downward so fast props can't tunnel
    b.phys([wDesk.x, y0 + L.deskH - 0.08, wDesk.z], [ex, 0.08, ez], 0, `desk-${def.id}`);
    // chair: small player blocker
    b.solid(def.chair[0] - 0.26, def.chair[0] + 0.26, y0, y0 + 0.95, def.chair[2] - 0.26, def.chair[2] + 0.26, `chair-${def.id}`);
    b.phys([def.chair[0], y0 + 0.47, def.chair[2]], [0.24, 0.05, 0.24], 0, `chair-${def.id}`);

    // proxies for interaction raycasts (invisible)
    const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
    this.chairProxy = new THREE.Mesh(rbox(0.52, 0.95, 0.5, 0), proxyMat);
    this.chairProxy.position.set(0, 0.5, 0.04);
    this.chairProxy.userData.stationId = def.id;
    this.root.add(this.chairProxy);
    this.monitorProxy = new THREE.Mesh(rbox(0.75, 0.55, 0.3, 0), proxyMat);
    this.monitorProxy.position.set(0, L.deskH + 0.26, -(DESK_FRONT + L.deskDepth - 0.3));
    this.monitorProxy.userData.stationId = def.id;
    this.root.add(this.monitorProxy);

    // chair base (fixed) + swivel
    this.swivel.position.set(0, 0.47, 0);
    this.parts.chair.add(this.swivel);
  }

  private wire(b: Builder, parent: THREE.Object3D, pts: [number, number, number][]) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    b.mesh(new THREE.TubeGeometry(curve, 12, 0.0045, 4, false), materials().cable, { parent, receive: false });
  }

  private cable(b: Builder, parent: THREE.Object3D, a: [number, number, number], c: [number, number, number]) {
    const mid = new THREE.Vector3((a[0] + c[0]) / 2, Math.min(a[1], c[1]) - 0.02, (a[2] + c[2]) / 2);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(...a), mid, new THREE.Vector3(...c)]);
    b.mesh(new THREE.TubeGeometry(curve, 10, 0.004, 4, false), materials().cable, { parent, receive: false });
  }

  toWorld(x: number, y: number, z: number): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return new THREE.Vector3(x, y, z).applyMatrix4(this.root.matrixWorld);
  }

  toWorldDir(x: number, y: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.root.rotation.y);
  }

  /** World position where a seated camera's eyes are. */
  seatedEye(): THREE.Vector3 {
    return this.toWorld(0, 1.18, 0.02);
  }

  get facing(): number {
    return this.def.facing;
  }

  /** Camera transform that frames the main screen fully for the given aspect ratio. */
  terminalView(fovDeg: number, aspect: number): { pos: THREE.Vector3; target: THREE.Vector3 } {
    this.screen.updateMatrixWorld(true);
    const size = SCREEN_SIZES[this.monitorKind];
    const t = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
    const dH = size.h / 2 / t;
    const dW = size.w / 2 / (t * aspect);
    const d = Math.max(dH, dW) * 1.05;
    const center = new THREE.Vector3().setFromMatrixPosition(this.screen.matrixWorld);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(this.screen.matrixWorld);
    return { pos: center.clone().addScaledVector(normal, d), target: center };
  }

  screenPixelSize(): [number, number] {
    return SCREEN_SIZES[this.monitorKind].px;
  }

  setScreenTexture(tex: THREE.Texture | null) {
    this.screenTex = tex;
    if (this.screen) {
      this.screen.material.map = tex;
      this.screen.material.color.set(tex ? "#ffffff" : "#0b0d10");
      this.screen.material.needsUpdate = true;
    }
  }

  setSecondTexture(tex: THREE.Texture | null) {
    this.screen2Tex = tex;
    if (this.screen2) {
      this.screen2.material.map = tex;
      this.screen2.material.needsUpdate = true;
    }
  }

  /** Rebuild the upgradeable parts to match a loadout. */
  applyLoadout(lo: Loadout) {
    const prev = this.loadout;
    this.loadout = { ...lo };
    if (!prev || prev.chair !== lo.chair) {
      this.buildChair(lo.chair);
      this.finishPart(this.parts.chair);
      mergeByMaterial(this.swivel);
    }
    if (!prev || prev.keyboard !== lo.keyboard) this.buildKeyboard(lo.keyboard);
    if (!prev || prev.monitor !== lo.monitor) {
      this.buildMonitor(lo.monitor);
      this.screen.userData.keep = true;
      this.finishPart(this.parts.monitor);
    }
    if (!prev || prev.second !== lo.second) this.buildSecond(lo.second);
    if (!prev || prev.case !== lo.case) {
      this.buildTower(lo.case);
      this.finishPart(this.parts.tower);
    }
    if (!prev || prev.deco !== lo.deco) {
      this.buildDeco(lo.deco);
      this.finishPart(this.parts.deco);
    }
  }

  getLoadout(): Loadout | null {
    return this.loadout ? { ...this.loadout } : null;
  }

  private clear(g: THREE.Group) {
    for (const c of [...g.children]) {
      if (c === this.swivel) continue;
      g.remove(c);
    }
  }

  private buildChair(kind: "old" | "gamer") {
    const m = materials();
    const g = this.parts.chair;
    this.clear(g);
    for (const c of [...this.swivel.children]) if ((c as THREE.Mesh).isMesh) this.swivel.remove(c);
    // base: 5-star + gas lift
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const leg = new THREE.Mesh(rbox(0.035, 0.03, 0.3, 0.01), m.black);
      leg.position.set(Math.sin(a) * 0.14, 0.07, Math.cos(a) * 0.14);
      leg.rotation.y = a;
      leg.castShadow = true;
      g.add(leg);
      const caster = new THREE.Mesh(sphere(0.025, 8, 6), m.rubber);
      caster.position.set(Math.sin(a) * 0.28, 0.028, Math.cos(a) * 0.28);
      g.add(caster);
    }
    const lift = new THREE.Mesh(cyl(0.025, 0.03, 0.34, 10), m.chrome);
    lift.position.set(0, 0.25, 0);
    g.add(lift);

    const fabric = kind === "gamer" ? colorMat("#2a2a2e", 0.8) : (m[this.variant.fabric] as THREE.Material);
    const accent = kind === "gamer" ? colorMat("#6e2a2a", 0.8) : fabric;
    const seat = new THREE.Mesh(rbox(0.5, 0.09, 0.48, 0.035, 3), fabric);
    seat.castShadow = true;
    this.swivel.add(seat);
    if (kind === "gamer") {
      const back = new THREE.Mesh(rbox(0.5, 0.78, 0.09, 0.04, 3), fabric);
      back.position.set(0, 0.45, 0.24);
      back.rotation.x = -0.12;
      back.castShadow = true;
      this.swivel.add(back);
      const stripe = new THREE.Mesh(rbox(0.14, 0.7, 0.095, 0.03), accent);
      stripe.position.copy(back.position);
      stripe.rotation.x = -0.12;
      stripe.position.z += 0.003;
      this.swivel.add(stripe);
      const pillow = new THREE.Mesh(rbox(0.28, 0.12, 0.06, 0.04, 3), accent);
      pillow.position.set(0, 0.7, 0.2);
      this.swivel.add(pillow);
      for (const sx of [-1, 1]) {
        const arm = new THREE.Mesh(rbox(0.06, 0.04, 0.3, 0.015), m.black);
        arm.position.set(sx * 0.27, 0.2, 0.02);
        this.swivel.add(arm);
        const post = new THREE.Mesh(rbox(0.03, 0.18, 0.03, 0.01), m.black);
        post.position.set(sx * 0.27, 0.1, 0.08);
        this.swivel.add(post);
      }
    } else {
      const v = this.variant;
      const post = new THREE.Mesh(rbox(0.05, 0.3, 0.03, 0.01), m.black);
      post.position.set(0, 0.15, 0.24);
      this.swivel.add(post);
      const back = new THREE.Mesh(rbox(0.44, v.back, 0.07, 0.03, 3), fabric);
      back.position.set(0, 0.2 + v.back / 2, 0.25);
      back.rotation.x = -0.08;
      back.castShadow = true;
      this.swivel.add(back);
      if (v.arms) {
        for (const sx of [-1, 1]) {
          const arm = new THREE.Mesh(rbox(0.05, 0.035, 0.26, 0.012), m.black);
          arm.position.set(sx * 0.27, 0.2, 0.02);
          this.swivel.add(arm);
          const ap = new THREE.Mesh(rbox(0.025, 0.18, 0.025, 0.008), m.black);
          ap.position.set(sx * 0.27, 0.1, 0.08);
          this.swivel.add(ap);
        }
      }
      if (v.tape) {
        const tape = new THREE.Mesh(rbox(0.16, 0.004, 0.05, 0.001), m.tape);
        tape.position.set(0.08, 0.047, -0.05);
        tape.rotation.y = 0.5;
        this.swivel.add(tape);
        const tape2 = tape.clone();
        tape2.rotation.y = -0.6;
        this.swivel.add(tape2);
      }
    }
  }

  private finishPart(g: THREE.Group) {
    mergeByMaterial(g);
  }

  private buildKeyboard(kind: "old" | "mech") {
    const m = materials();
    const g = this.parts.keyboard;
    this.clear(g);
    const deskCZ = -(DESK_FRONT + L.deskDepth / 2);
    const kb = new THREE.Mesh(rbox(0.44, 0.025, 0.15, 0.008), kind === "mech" ? m.darkGrey : m.beige);
    kb.position.set(-0.08, L.deskH + 0.013, deskCZ + 0.18);
    kb.rotation.x = 0.04;
    g.add(kb);
    const keys = new THREE.Mesh(plane(0.42, 0.13), kind === "mech" ? m.keyboardMech : m.keyboardOld);
    keys.rotation.x = -Math.PI / 2 + 0.04;
    keys.position.set(-0.08, L.deskH + 0.0265, deskCZ + 0.18);
    g.add(keys);
    if (kind === "mech") {
      const glow = new THREE.Mesh(rbox(0.44, 0.004, 0.004, 0.001), colorMat("#ff9a3c", 0.5));
      (glow.material as THREE.MeshStandardMaterial).emissive = new THREE.Color("#ff8a2c");
      glow.position.set(-0.08, L.deskH + 0.004, deskCZ + 0.255);
      g.add(glow);
    }
    this.keyboardMesh = kb;
  }

  private buildMonitor(kind: MonitorKind) {
    const m = materials();
    const g = this.parts.monitor;
    this.clear(g);
    this.monitorKind = kind;
    const backZ = -(DESK_FRONT + L.deskDepth);
    const size = SCREEN_SIZES[kind];
    const screenMat = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false, map: this.screenTex });
    let screenY = 0;
    let screenZ = 0;
    if (kind === "crt") {
      const z = backZ + 0.32;
      const body = new THREE.Mesh(rbox(0.42, 0.37, 0.24, 0.03, 3), m.beigeOld);
      body.position.set(0, L.deskH + 0.215, z);
      body.castShadow = true;
      g.add(body);
      const back = new THREE.Mesh(rbox(0.32, 0.28, 0.2, 0.05, 3), m.beigeOld);
      back.position.set(0, L.deskH + 0.18, z - 0.18);
      back.castShadow = true;
      g.add(back);
      const foot = new THREE.Mesh(rbox(0.26, 0.03, 0.22, 0.01), m.beigeOld);
      foot.position.set(0, L.deskH + 0.015, z - 0.05);
      g.add(foot);
      const bezel = new THREE.Mesh(rbox(0.36, 0.28, 0.01, 0.01), m.darkGrey);
      bezel.position.set(0, L.deskH + 0.225, z + 0.118);
      g.add(bezel);
      screenY = L.deskH + 0.225;
      screenZ = z + 0.125;
      const led = new THREE.Mesh(sphere(0.005, 6, 4), m.ledGreen);
      led.position.set(0.17, L.deskH + 0.06, z + 0.122);
      g.add(led);
      const st = new THREE.Mesh(plane(0.08, 0.04), new THREE.MeshStandardMaterial({ map: stickerTex("THIS PC HAS\nSEEN THINGS", "#f2e7c9", "#3a2a1a", 256, 128), roughness: 0.8 }));
      st.position.set(-0.13, L.deskH + 0.06, z + 0.1205);
      g.add(st);
    } else {
      const z = backZ + 0.28;
      const thick = kind === "lcdWide" ? 0.035 : 0.05;
      const pw = size.w + 0.04;
      const ph = size.h + (kind === "lcdWide" ? 0.035 : 0.06);
      const standH = kind === "lcdWide" ? 0.12 : 0.1;
      const mat = kind === "lcdWide" ? m.black : this.index % 2 === 0 ? m.darkGrey : m.beige;
      const panel = new THREE.Mesh(rbox(pw, ph, thick, 0.01), mat);
      screenY = L.deskH + standH + ph / 2;
      panel.position.set(0, screenY, z);
      panel.castShadow = true;
      g.add(panel);
      const neck = new THREE.Mesh(rbox(0.05, standH + 0.06, 0.03, 0.01), mat);
      neck.position.set(0, L.deskH + (standH + 0.06) / 2, z - 0.04);
      g.add(neck);
      const base = new THREE.Mesh(rbox(0.22, 0.02, 0.16, 0.01), mat);
      base.position.set(0, L.deskH + 0.01, z - 0.03);
      g.add(base);
      screenZ = z + thick / 2 + 0.001;
      if (kind === "lcd4") screenY += 0.01;
    }
    const screen = new THREE.Mesh(plane(size.w, size.h), screenMat);
    screen.position.set(0, screenY, screenZ);
    screen.name = `screen-${this.def.id}`;
    g.add(screen);
    this.screen = screen as typeof this.screen;
    this.setScreenTexture(this.screenTex);
    this.monitorProxy.position.set(0, screenY, screenZ - 0.12);
    this.monitorProxy.scale.set(size.w / 0.6 + 0.1, size.h / 0.45 + 0.2, 1);
  }

  private buildSecond(on: boolean) {
    const m = materials();
    const g = this.parts.second;
    this.clear(g);
    this.screen2 = null;
    if (!on) return;
    const backZ = -(DESK_FRONT + L.deskDepth);
    const w = 0.37;
    const h = 0.28;
    const holder = new THREE.Group();
    holder.position.set(0.55, 0, backZ + 0.34);
    holder.rotation.y = -0.45;
    g.add(holder);
    const panel = new THREE.Mesh(rbox(w + 0.04, h + 0.05, 0.04, 0.01), m.black);
    panel.position.set(0, L.deskH + 0.13 + h / 2, 0);
    holder.add(panel);
    const neck = new THREE.Mesh(rbox(0.04, 0.16, 0.03, 0.01), m.black);
    neck.position.set(0, L.deskH + 0.08, -0.035);
    holder.add(neck);
    const base = new THREE.Mesh(rbox(0.18, 0.02, 0.14, 0.01), m.black);
    base.position.set(0, L.deskH + 0.01, -0.03);
    holder.add(base);
    const screen = new THREE.Mesh(plane(w, h), new THREE.MeshBasicMaterial({ color: "#fff", toneMapped: false, map: this.screen2Tex }));
    screen.position.set(0, L.deskH + 0.13 + h / 2, 0.021);
    holder.add(screen);
    this.screen2 = screen;
  }

  private buildTower(kind: "old" | "custom") {
    const m = materials();
    const g = this.parts.tower;
    this.clear(g);
    this.fans = [];
    const backZ = -(DESK_FRONT + L.deskDepth);
    const side = this.index % 2 === 0 ? -1 : 1;
    const x = side * 0.48;
    const z = backZ + 0.3;
    const h = 0.42;
    if (kind === "custom") {
      const body = new THREE.Mesh(rbox(0.2, h + 0.04, 0.44, 0.012), m.black);
      body.position.set(x, L.deskH + (h + 0.04) / 2, z);
      body.castShadow = true;
      g.add(body);
      const glass = new THREE.Mesh(plane(0.4, h - 0.02), new THREE.MeshStandardMaterial({ color: "#20160e", roughness: 0.1, transparent: true, opacity: 0.55 }));
      glass.position.set(x - side * 0.101, L.deskH + h / 2 + 0.02, z);
      glass.rotation.y = -side * Math.PI / 2;
      g.add(glass);
      for (let i = 0; i < 3; i++) {
        const fan = this.makeFan(0.055, colorMat("#ffb15c", 0.4));
        ((fan.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).emissive = new THREE.Color("#a5521a");
        fan.position.set(x - side * 0.085, L.deskH + 0.1 + i * 0.13, z + 0.17);
        fan.rotation.y = -side * Math.PI / 2;
        g.add(fan);
        this.fans.push(fan.children[1]);
      }
      const strip = new THREE.Mesh(rbox(0.005, 0.005, 0.38, 0.001), m.neonWarm);
      strip.position.set(x - side * 0.098, L.deskH + h + 0.0, z);
      g.add(strip);
    } else {
      const variant = this.index % 3;
      const body = new THREE.Mesh(rbox(0.19, h, 0.42, 0.01), variant === 1 ? m.darkGrey : m.beigeOld);
      body.position.set(x, L.deskH + h / 2, z);
      body.castShadow = true;
      g.add(body);
      // front bays
      for (let i = 0; i < 2; i++) {
        const bay = new THREE.Mesh(rbox(0.16, 0.04, 0.01, 0.003), m.beige);
        bay.position.set(x, L.deskH + h - 0.06 - i * 0.05, z + 0.211);
        g.add(bay);
      }
      const led = new THREE.Mesh(sphere(0.006, 6, 4), this.index % 4 === 0 ? m.ledAmber : m.ledGreen);
      led.position.set(x + 0.05, L.deskH + 0.06, z + 0.212);
      g.add(led);
      if (variant === 2) {
        // open side panel with a mismatched spinning fan ("reused parts")
        const fan = this.makeFan(0.05, m.darkGrey);
        fan.position.set(x - side * 0.1, L.deskH + h / 2, z + 0.05);
        fan.rotation.y = -side * Math.PI / 2;
        g.add(fan);
        this.fans.push(fan.children[1]);
      }
    }
  }

  private makeFan(r: number, bladeMat: THREE.Material): THREE.Group {
    const m = materials();
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 6, 20), bladeMat);
    g.add(frame);
    const rotor = new THREE.Group();
    const hub = new THREE.Mesh(cyl(r * 0.3, r * 0.3, 0.01, 10), m.black);
    hub.rotation.x = Math.PI / 2;
    rotor.add(hub);
    for (let i = 0; i < 7; i++) {
      const blade = new THREE.Mesh(rbox(r * 0.7, 0.012, 0.003, 0.001), m.darkGrey);
      blade.position.set(Math.cos((i / 7) * Math.PI * 2) * r * 0.5, Math.sin((i / 7) * Math.PI * 2) * r * 0.5, 0);
      blade.rotation.z = (i / 7) * Math.PI * 2;
      blade.rotation.x = 0.4;
      rotor.add(blade);
    }
    g.add(rotor);
    return g;
  }

  private buildDeco(on: boolean) {
    const m = materials();
    const g = this.parts.deco;
    this.clear(g);
    if (!on) return;
    const backZ = -(DESK_FRONT + L.deskDepth);
    // cactus
    const pot = new THREE.Mesh(cyl(0.035, 0.028, 0.06, 10), m.terracotta);
    pot.position.set(-0.52, L.deskH + 0.03, backZ + 0.15);
    g.add(pot);
    const cactus = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.06, 4, 8), m.plant);
    cactus.position.set(-0.52, L.deskH + 0.1, backZ + 0.15);
    g.add(cactus);
    // photo frame
    const frame = new THREE.Mesh(rbox(0.1, 0.13, 0.012, 0.004), m.woodDark);
    frame.position.set(-0.4, L.deskH + 0.07, backZ + 0.12);
    frame.rotation.x = -0.15;
    g.add(frame);
    const photo = new THREE.Mesh(plane(0.08, 0.1), new THREE.MeshStandardMaterial({ map: stickerTex("FIRST\nGREEN\nCANDLE", "#20352a", "#bfe39a", 128, 160), roughness: 0.6 }));
    photo.position.set(-0.4, L.deskH + 0.071, backZ + 0.127);
    photo.rotation.x = -0.15;
    g.add(photo);
    // small warm desk lamp (emissive only, no extra light cost)
    const lampBase = new THREE.Mesh(cyl(0.05, 0.06, 0.015, 12), m.black);
    lampBase.position.set(0.5, L.deskH + 0.008, backZ + 0.45);
    g.add(lampBase);
    const arm = new THREE.Mesh(cyl(0.007, 0.007, 0.3, 6), m.black);
    arm.position.set(0.5, L.deskH + 0.15, backZ + 0.42);
    arm.rotation.x = -0.25;
    g.add(arm);
    const head = new THREE.Mesh(cyl(0.025, 0.06, 0.08, 12, true), m.lampShade);
    head.position.set(0.5, L.deskH + 0.29, backZ + 0.36);
    head.rotation.x = 0.6;
    g.add(head);
    const bulb = new THREE.Mesh(sphere(0.02, 8, 6), m.bulb);
    bulb.position.set(0.5, L.deskH + 0.27, backZ + 0.38);
    g.add(bulb);
  }

  update(dt: number, time: number) {
    for (let i = 0; i < this.fans.length; i++) this.fans[i].rotation.z += dt * (14 + i * 3);
    // free chair spin (with damping and physical limits)
    if (Math.abs(this.chairSpin) > 0.001) {
      this.chairYaw += this.chairSpin * dt;
      this.chairSpin *= Math.exp(-2.2 * dt);
      const lim = 2.4; // armrest hits the desk/divider beyond this
      if (this.chairYaw > lim) {
        this.chairYaw = lim;
        this.chairSpin = -this.chairSpin * 0.35;
      } else if (this.chairYaw < -lim) {
        this.chairYaw = -lim;
        this.chairSpin = -this.chairSpin * 0.35;
      }
    }
    this.swivel.rotation.y = this.chairYaw;
    this.chairSlide += (this.slideTarget - this.chairSlide) * (1 - Math.exp(-2.5 * dt));
    this.chairTilt += (this.tiltTarget - this.chairTilt) * (1 - Math.exp(-4 * dt));
    this.swivel.rotation.x = -this.chairTilt;
    this.parts.chair.position.z = this.chairSlide;
    void time;
  }
}
