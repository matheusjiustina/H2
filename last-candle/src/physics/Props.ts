import * as CANNON from "cannon-es";
import * as THREE from "three";
import { cyl, mergeByMaterial, rbox, sphere } from "../world/geometry";
import { L } from "../world/layout";
import { colorMat, materials } from "../world/materials";
import * as T from "../world/textures";
import type { Physics } from "./Physics";

export type PropKind = "cup" | "can" | "chips" | "paper" | "mascot" | "marker" | "receipt" | "crate" | "mouse" | "trash";
export type UseAction = "drink" | "eat" | "squeak" | "throw" | "draw" | "show" | null;

export interface PropDef {
  kind: PropKind;
  name: string;
  mass: number;
  use: UseAction;
  /** Persistent props respawn at home instead of being cleaned up. */
  persistent: boolean;
  /** Position/rotation in the right hand's grip space. */
  hold: { pos: [number, number, number]; rot: [number, number, number] };
  halfHeight: number;
  restitution?: number;
  damping?: number;
  /** Orientation (camera space) used while inspecting, e.g. a receipt faces the viewer. */
  inspect?: [number, number, number];
}

export const PROP_DEFS: Record<PropKind, PropDef> = {
  cup: { kind: "cup", name: "GM mug", mass: 0.25, use: "drink", persistent: true, hold: { pos: [0.0, 0.01, -0.02], rot: [0, -0.4, 0] }, halfHeight: 0.05 },
  can: { kind: "can", name: "Overnight energy", mass: 0.33, use: "drink", persistent: false, hold: { pos: [0, 0.02, -0.02], rot: [0, 0.3, 0] }, halfHeight: 0.062 },
  chips: { kind: "chips", name: "Crunchline chips", mass: 0.08, use: "eat", persistent: false, hold: { pos: [0, 0.05, -0.02], rot: [0.1, 0.25, 0] }, halfHeight: 0.025, damping: 0.25 },
  paper: { kind: "paper", name: "Paper ball", mass: 0.02, use: "throw", persistent: false, hold: { pos: [0, 0.01, -0.03], rot: [0, 0, 0] }, halfHeight: 0.035, restitution: 0.4, damping: 0.12 },
  mascot: { kind: "mascot", name: "Wick (desk mascot)", mass: 0.15, use: "squeak", persistent: true, hold: { pos: [0, 0.03, -0.03], rot: [0, Math.PI, 0] }, halfHeight: 0.065 },
  marker: { kind: "marker", name: "Whiteboard marker", mass: 0.03, use: "draw", persistent: true, hold: { pos: [0.0, 0.0, -0.03], rot: [-1.2, 0, 0.3] }, halfHeight: 0.012 },
  receipt: { kind: "receipt", name: "Trade receipt", mass: 0.01, use: "show", persistent: true, hold: { pos: [0.02, 0.09, -0.04], rot: [1.2, 0, -0.25] }, halfHeight: 0.006, damping: 0.6, inspect: [Math.PI / 2, 0, 0] },
  crate: { kind: "crate", name: "Drink crate", mass: 2.5, use: null, persistent: false, hold: { pos: [-0.12, -0.05, -0.12], rot: [0, 0, 0] }, halfHeight: 0.13 },
  mouse: { kind: "mouse", name: "Stray mouse", mass: 0.09, use: null, persistent: false, hold: { pos: [0, 0.01, -0.02], rot: [0, Math.PI, 0] }, halfHeight: 0.017 },
  trash: { kind: "trash", name: "Trash", mass: 0.03, use: "throw", persistent: false, hold: { pos: [0, 0.01, -0.03], rot: [0, 0, 0] }, halfHeight: 0.04, restitution: 0.3, damping: 0.1 },
};

export type PropState = "free" | "held" | "pinned" | "stored" | "gone";

export interface Prop {
  uid: number;
  def: PropDef;
  mesh: THREE.Group;
  body: CANNON.Body;
  state: PropState;
  home: THREE.Vector3 | null;
  homeQuat: THREE.Quaternion;
  /** Remaining sips/bites for drinks and snacks. */
  uses: number;
  /** Data payload: receipt trade id, task tag, etc. */
  data: Record<string, unknown>;
  thrownAt: number;
  thrownFromZ: number;
  thrownByPlayer: boolean;
  binScored: boolean;
  spawnedAt: number;
  label?: () => string;
  idleT: number;
}

let uidSeq = 1;
const cache = new Map<string, THREE.Material>();
const matOnce = (key: string, make: () => THREE.Material) => {
  let m = cache.get(key);
  if (!m) {
    m = make();
    cache.set(key, m);
  }
  return m;
};

function buildMesh(kind: PropKind, data: Record<string, unknown>): THREE.Group {
  const g = new THREE.Group();
  const m = materials();
  // one private clone per source material, so the prop can glow alone and still merge its parts
  const own = new Map<THREE.Material, THREE.Material>();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]) => {
    let mm = own.get(mat);
    if (!mm) {
      mm = mat.clone();
      mm.userData.ownGlow = true;
      own.set(mat, mm);
    }
    const mesh = new THREE.Mesh(geo, mm);
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  switch (kind) {
    case "cup": {
      add(cyl(0.04, 0.036, 0.1, 18, true), matOnce("cupBody", () => new THREE.MeshStandardMaterial({ map: T.cupTex(), roughness: 0.5, side: THREE.DoubleSide })));
      add(cyl(0.036, 0.036, 0.005, 16), colorMat("#e9e2d2", 0.5), [0, -0.048, 0]);
      add(cyl(0.035, 0.035, 0.004, 16), colorMat("#3a2416", 0.3), [0, 0.03, 0]);
      add(new THREE.TorusGeometry(0.024, 0.007, 8, 14), colorMat("#e9e2d2", 0.5), [0.045, 0, 0], [0, 0, Math.PI / 2]);
      break;
    }
    case "can": {
      add(cyl(0.033, 0.033, 0.11, 18), matOnce("canBody", () => new THREE.MeshStandardMaterial({ map: T.canLabelTex(), roughness: 0.35, metalness: 0.4 })));
      add(cyl(0.028, 0.033, 0.012, 18), m.chrome, [0, 0.061, 0]);
      add(cyl(0.033, 0.028, 0.008, 18), m.chrome, [0, -0.059, 0]);
      break;
    }
    case "chips": {
      const bag = add(rbox(0.16, 0.22, 0.05, 0.022, 3), matOnce("chips", () => new THREE.MeshStandardMaterial({ map: T.chipsTex(), roughness: 0.45, metalness: 0.2 })));
      bag.rotation.x = -Math.PI / 2;
      bag.scale.set(1, 1, 1);
      break;
    }
    case "paper": {
      const geo = new THREE.IcosahedronGeometry(0.035, 1);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const k = 0.8 + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.35;
        pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
      }
      geo.computeVertexNormals();
      add(geo, colorMat("#f1ecdc", 0.95));
      break;
    }
    case "trash": {
      const geo = new THREE.IcosahedronGeometry(0.04, 1);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const k = 0.7 + ((Math.sin(i * 7.13) * 4758.5453) % 1 + 1) % 1 * 0.5;
        pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.8, pos.getZ(i) * k);
      }
      geo.computeVertexNormals();
      add(geo, colorMat("#b9b2a0", 0.9));
      break;
    }
    case "mascot": {
      // "Wick": a tiny candle character with a flame tuft
      add(cyl(0.032, 0.036, 0.09, 16), colorMat("#e9e1cf", 0.6), [0, -0.015, 0]);
      add(sphere(0.008, 8, 6), colorMat("#151515", 0.3), [-0.012, 0.005, -0.031]);
      add(sphere(0.008, 8, 6), colorMat("#151515", 0.3), [0.012, 0.005, -0.031]);
      add(new THREE.TorusGeometry(0.008, 0.002, 6, 10, Math.PI), colorMat("#151515", 0.3), [0, -0.012, -0.033], [0, 0, Math.PI]);
      add(cyl(0.003, 0.003, 0.02, 6), colorMat("#2a2520", 0.8), [0, 0.04, 0]);
      const flame = add(new THREE.ConeGeometry(0.014, 0.035, 10), new THREE.MeshStandardMaterial({ color: "#ffb347", emissive: new THREE.Color("#ff9a2c"), emissiveIntensity: 1.2 }), [0, 0.062, 0]);
      flame.castShadow = false;
      add(cyl(0.04, 0.04, 0.01, 16), colorMat("#3a8a5c", 0.5), [0, -0.06, 0]);
      break;
    }
    case "marker": {
      add(cyl(0.009, 0.009, 0.13, 10), colorMat("#e9e9e4", 0.5), [0, 0, 0], [Math.PI / 2, 0, 0]);
      add(cyl(0.01, 0.01, 0.035, 10), colorMat(String(data.color ?? "#1b1b1b"), 0.5), [0, 0, -0.065], [Math.PI / 2, 0, 0]);
      add(new THREE.ConeGeometry(0.006, 0.012, 8), colorMat(String(data.color ?? "#1b1b1b"), 0.5), [0, 0, -0.088], [-Math.PI / 2, 0, 0]);
      break;
    }
    case "receipt": {
      const tex = data.texture as THREE.Texture | undefined;
      const paper = add(rbox(0.09, 0.003, 0.195, 0.001), new THREE.MeshStandardMaterial({ color: "#f3efe4", roughness: 0.95 }));
      void paper;
      if (tex) {
        const face = add(new THREE.PlaneGeometry(0.087, 0.19), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), [0, 0.0021, 0], [-Math.PI / 2, 0, 0]);
        face.castShadow = false;
      }
      break;
    }
    case "crate": {
      add(rbox(0.4, 0.26, 0.3, 0.015), m.cardboard);
      add(rbox(0.405, 0.03, 0.12, 0.004), m.tape, [0, 0.12, 0]);
      for (let i = 0; i < 6; i++) add(cyl(0.033, 0.033, 0.02, 12), colorMat("#24365e", 0.4, 0.3), [-0.12 + (i % 3) * 0.12, 0.14, -0.06 + Math.floor(i / 3) * 0.12]);
      break;
    }
    case "mouse": {
      add(rbox(0.06, 0.034, 0.1, 0.015), colorMat("#cbbf9f", 0.6));
      add(rbox(0.02, 0.004, 0.035, 0.001), colorMat("#9a9078", 0.6), [0, 0.018, -0.025]);
      break;
    }
  }
  mergeByMaterial(g);
  return g;
}

function buildBody(kind: PropKind, def: PropDef, mat: CANNON.Material): CANNON.Body {
  const b = new CANNON.Body({ mass: def.mass, material: mat, linearDamping: def.damping ?? 0.06, angularDamping: def.damping ? def.damping + 0.1 : 0.15 });
  switch (kind) {
    case "cup":
      b.addShape(new CANNON.Cylinder(0.04, 0.037, 0.1, 10));
      break;
    case "can":
      b.addShape(new CANNON.Cylinder(0.033, 0.033, 0.122, 10));
      break;
    case "chips":
      b.addShape(new CANNON.Box(new CANNON.Vec3(0.08, 0.025, 0.11)));
      break;
    case "paper":
      b.addShape(new CANNON.Sphere(0.035));
      break;
    case "trash":
      b.addShape(new CANNON.Sphere(0.036));
      break;
    case "mascot":
      b.addShape(new CANNON.Cylinder(0.038, 0.04, 0.13, 10), new CANNON.Vec3(0, -0.0, 0));
      break;
    case "marker":
      b.addShape(new CANNON.Box(new CANNON.Vec3(0.012, 0.012, 0.075)));
      break;
    case "receipt":
      b.addShape(new CANNON.Box(new CANNON.Vec3(0.045, 0.004, 0.097)));
      break;
    case "crate":
      b.addShape(new CANNON.Box(new CANNON.Vec3(0.2, 0.13, 0.15)));
      break;
    case "mouse":
      b.addShape(new CANNON.Box(new CANNON.Vec3(0.03, 0.017, 0.05)));
      break;
  }
  b.sleepSpeedLimit = 0.12;
  b.sleepTimeLimit = 0.6;
  return b;
}

const CAPS: Partial<Record<PropKind, number>> = { paper: 10, can: 14, trash: 8, receipt: 16, chips: 6, mouse: 4, crate: 1 };

/** Creates, tracks, cleans up and syncs all physical props. */
export class PropManager {
  readonly props: Prop[] = [];
  readonly group = new THREE.Group();
  now = 0;

  constructor(
    private physics: Physics,
    scene: THREE.Scene,
  ) {
    this.group.name = "props";
    scene.add(this.group);
  }

  spawn(kind: PropKind, pos: THREE.Vector3, opts: { quat?: THREE.Quaternion; home?: boolean; data?: Record<string, unknown>; sleep?: boolean } = {}): Prop {
    const def = PROP_DEFS[kind];
    const data = opts.data ?? {};
    const mesh = buildMesh(kind, data);
    mesh.userData.prop = true;
    const body = buildBody(kind, def, this.physics.propMat);
    body.position.set(pos.x, pos.y, pos.z);
    if (opts.quat) body.quaternion.set(opts.quat.x, opts.quat.y, opts.quat.z, opts.quat.w);
    const p: Prop = {
      uid: uidSeq++,
      def,
      mesh,
      body,
      state: "free",
      home: opts.home ? pos.clone() : null,
      homeQuat: opts.quat?.clone() ?? new THREE.Quaternion(),
      uses: kind === "can" ? 3 : kind === "chips" ? 4 : kind === "cup" ? 5 : 0,
      data,
      thrownAt: -99,
      thrownFromZ: 0,
      thrownByPlayer: false,
      binScored: false,
      spawnedAt: this.now,
      idleT: 0,
    };
    (body as unknown as { prop: Prop }).prop = p;
    mesh.traverse((o) => (o.userData.propUid = p.uid));
    this.group.add(mesh);
    this.physics.addDynamic(body);
    if (opts.sleep) body.sleep();
    this.props.push(p);
    this.sync(p);
    this.enforceCap(kind);
    return p;
  }

  private enforceCap(kind: PropKind) {
    const cap = CAPS[kind];
    if (!cap) return;
    const list = this.props.filter((p) => p.def.kind === kind && p.state === "free" && !p.def.persistent && !p.data.task);
    while (list.length > cap) {
      const old = list.shift()!;
      this.despawn(old);
    }
  }

  despawn(p: Prop) {
    p.state = "gone";
    this.physics.removeDynamic(p.body);
    p.mesh.removeFromParent();
    const i = this.props.indexOf(p);
    if (i >= 0) this.props.splice(i, 1);
  }

  byMesh(o: THREE.Object3D): Prop | undefined {
    const uid = o.userData.propUid;
    return this.props.find((p) => p.uid === uid);
  }

  /** Raycast targets for interaction: meshes of free / pinned props. */
  targets(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const p of this.props) if (p.state === "free" || p.state === "pinned") p.mesh.traverse((o) => (o as THREE.Mesh).isMesh && out.push(o));
    return out;
  }

  sync(p: Prop) {
    const b = p.body;
    p.mesh.position.set(b.interpolatedPosition.x, b.interpolatedPosition.y, b.interpolatedPosition.z);
    p.mesh.quaternion.set(b.interpolatedQuaternion.x, b.interpolatedQuaternion.y, b.interpolatedQuaternion.z, b.interpolatedQuaternion.w);
    if (b.interpolatedPosition.lengthSquared() === 0 && b.position.lengthSquared() > 0) {
      p.mesh.position.set(b.position.x, b.position.y, b.position.z);
      p.mesh.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    }
  }

  respawnHome(p: Prop) {
    if (!p.home) return;
    p.body.position.set(p.home.x, p.home.y, p.home.z);
    p.body.quaternion.set(p.homeQuat.x, p.homeQuat.y, p.homeQuat.z, p.homeQuat.w);
    p.body.velocity.setZero();
    p.body.angularVelocity.setZero();
    p.body.interpolatedPosition.copy(p.body.position);
    p.body.interpolatedQuaternion.copy(p.body.quaternion);
    p.binScored = false;
    this.physics.resume(p.body);
    this.sync(p);
  }

  update(dt: number) {
    this.now += dt;
    for (const p of [...this.props]) {
      if (p.state !== "free") continue;
      this.sync(p);
      const pos = p.body.position;
      // out of bounds / fell through: recover
      if (pos.y < -1 || pos.x < -L.halfW - 0.3 || pos.x > L.halfW + 0.3 || pos.z > 0.3 || pos.z < L.back - 0.3 || !Number.isFinite(pos.x)) {
        if (p.home) this.respawnHome(p);
        else this.despawn(p);
      }
    }
  }
}
