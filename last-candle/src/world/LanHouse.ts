import * as THREE from "three";
import { Builder } from "./Builder";
import type { CollisionWorld } from "./Collision";
import { cyl, plane, rbox, sphere, worldUvBox } from "./geometry";
import { L, SPOTS, STATIONS } from "./layout";
import { colorMat, materials } from "./materials";
import { StationVisual } from "./Station";
import * as T from "./textures";

export interface LanHouseHandles {
  stations: Map<string, StationVisual>;
  fridge: { pivot: THREE.Group; door: THREE.Mesh; light: THREE.Mesh; collider: string; canSpots: THREE.Vector3[] };
  fan: { root: THREE.Group; head: THREE.Group; rotor: THREE.Group; hit: THREE.Mesh };
  lamp: { hit: THREE.Mesh; bulb: THREE.Mesh; light: THREE.PointLight };
  whiteboard: THREE.Mesh;
  bigScreen: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  mural: THREE.Mesh;
  printer: { body: THREE.Mesh; slot: THREE.Vector3; hit: THREE.Mesh };
  register: THREE.Mesh;
  bell: THREE.Mesh;
  notepad: THREE.Mesh;
  bin: { pos: THREE.Vector3; radius: number; height: number };
  chainGate: { group: THREE.Group; collider: ReturnType<CollisionWorld["addBox"]>; physTag: string };
  serverDoor: { pivot: THREE.Group; hit: THREE.Mesh; collider: ReturnType<CollisionWorld["addBox"]> };
  wcDoor: THREE.Mesh;
  lockers: { door: THREE.Group; hit: THREE.Mesh; index: number; inside: THREE.Vector3 }[];
  candle: { flame: THREE.Mesh; hit: THREE.Mesh; light: THREE.PointLight };
  rackLeds: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture };
  entryDoor: THREE.Group;
  lights: {
    flicker: THREE.PointLight[];
    fluoMesh: THREE.Mesh;
    street: THREE.SpotLight;
    car: THREE.PointLight;
    hemi: THREE.HemisphereLight;
    key: THREE.DirectionalLight;
    all: THREE.Light[];
  };
  deliveryBoxSpot: THREE.Vector3;
  crateSpot: THREE.Vector3;
  sticker: THREE.Mesh;
  acUnit: THREE.Group;
  physicsBoxes: Builder["physicsBoxes"];
  timerScreen: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
}

const W = L.halfW;

export function buildLanHouse(scene: THREE.Scene, collision: CollisionWorld): LanHouseHandles {
  const b = new Builder(scene, collision);
  const m = materials();

  // ------------------------------------------------------------------ floors
  collision.addFloor({ minX: -W, maxX: W, minZ: L.back, maxZ: 0.0, y: 0, tag: "ground" });
  collision.addFloor({ minX: -W, maxX: W, minZ: L.back, maxZ: L.mezzFront, y: L.mezzY, tag: "mezz" });
  collision.addFloor({
    minX: L.stairs.x0,
    maxX: L.stairs.x1,
    minZ: L.stairs.zTop,
    maxZ: L.stairs.zBottom,
    y: 0,
    ramp: { z0: L.stairs.zBottom, z1: L.stairs.zTop, y1: L.mezzY },
    tag: "stairs",
  });

  // ground floor slab (tiles)
  b.mesh(worldUvBox(W * 2, 0.1, -L.back, 1.2), m.floor, { pos: [0, -0.05, L.back / 2] });
  b.phys([0, -0.25, L.back / 2], [W + 1, 0.25, -L.back / 2 + 1], 0, "ground");
  // ceiling
  b.mesh(worldUvBox(W * 2, 0.1, -L.back, 2.4), m.ceiling, { pos: [0, L.ceiling + 0.05, L.back / 2], receive: false });

  // ------------------------------------------------------------------ walls
  const wallT = 0.2;
  for (const sx of [-1, 1]) {
    const x = sx * (W + wallT / 2);
    b.mesh(worldUvBox(wallT, L.ceiling, -L.back, 2.0), m.wall, { pos: [x, L.ceiling / 2, L.back / 2] });
    b.block(sx < 0 ? -W - wallT : W, sx < 0 ? -W : W + wallT, 0, L.ceiling, L.back, 0.3, sx < 0 ? "wallL" : "wallR");
    // upper wall painted dark (old shop trick to hide ducts) — keeps the eye at human height
    b.mesh(worldUvBox(0.02, L.ceiling - 3.4, -L.back, 2.0), m.wallLow, { pos: [sx * (W - 0.012), 3.4 + (L.ceiling - 3.4) / 2, L.back / 2], receive: false });
    // dark wainscot band, ground floor only up to the mezzanine
    b.mesh(worldUvBox(0.02, 1.0, -L.back, 1.2), m.woodDark, { pos: [sx * (W - 0.01), 0.5, L.back / 2] });
    b.mesh(rbox(0.04, 0.04, -L.back, 0.01), m.woodDark, { pos: [sx * (W - 0.02), 1.0, L.back / 2] });
  }
  b.mesh(worldUvBox(W * 2 + 0.4, L.ceiling, wallT, 2.0), m.wall, { pos: [0, L.ceiling / 2, L.back - wallT / 2] });
  b.mesh(worldUvBox(W * 2, L.ceiling - 3.4, 0.02, 2.0), m.wallLow, { pos: [0, 3.4 + (L.ceiling - 3.4) / 2, L.back + 0.012], receive: false });
  b.block(-W, W, 0, L.ceiling, L.back - wallT, L.back, "wallBack");

  // ------------------------------------------------------------------ storefront
  buildStorefront(b);

  // ------------------------------------------------------------------ counter area
  const counter = buildCounter(b);

  // ------------------------------------------------------------------ lounge
  const lounge = buildLounge(b);

  // ------------------------------------------------------------------ fridge
  const fridge = buildFridge(b);

  // ------------------------------------------------------------------ PC rows
  const stations = new Map<string, StationVisual>();
  STATIONS.forEach((def, i) => {
    const sv = new StationVisual(def, i, b);
    stations.set(def.id, sv);
  });
  buildDividers(b);

  // ------------------------------------------------------------------ stairs + mezzanine
  const chainGate = buildStairsAndMezz(b);

  // ------------------------------------------------------------------ back wall (whiteboard / big screen / mural), corridor, server room
  const back = buildBack(b);

  // ------------------------------------------------------------------ decor: posters, AC, ducts, bin, clutter
  const decor = buildDecor(b);

  // ------------------------------------------------------------------ lights
  const lights = buildLights(b, lounge.lampPos);

  const occluders = /^(wall|front|partition|corr|serverWall|serverDoor|door|wcBlock|storeBlock|racks|backShelf)/;
  for (const box of collision.boxes) if (box.tag && occluders.test(box.tag)) box.occludes = true;

  const calls = b.finalize();
  console.info(`[lanhouse] static batches: ${calls}`);

  return {
    stations,
    fridge,
    fan: lounge.fan,
    lamp: { hit: lounge.lampHit, bulb: lounge.lampBulb, light: lights.lamp },
    whiteboard: back.whiteboard,
    bigScreen: back.bigScreen,
    mural: back.mural,
    printer: counter.printer,
    register: counter.register,
    bell: counter.bell,
    notepad: decor.notepad,
    bin: decor.bin,
    chainGate,
    serverDoor: back.serverDoor,
    wcDoor: back.wcDoor,
    lockers: back.lockers,
    candle: { ...back.candle, light: lights.candle },
    rackLeds: back.rackLeds,
    entryDoor: lounge.entryDoor,
    lights: {
      flicker: [lights.corridor],
      fluoMesh: lights.fluoMesh,
      street: lights.street,
      car: lights.car,
      hemi: lights.hemi,
      key: lights.key,
      all: lights.all,
    },
    deliveryBoxSpot: new THREE.Vector3(0.98, 0.1, -1.35),
    crateSpot: new THREE.Vector3(0.95, 0, -3.1),
    sticker: decor.sticker,
    acUnit: decor.ac,
    physicsBoxes: b.physicsBoxes,
    timerScreen: counter.timerScreen,
  };
}

// =========================================================================

function buildStorefront(b: Builder) {
  const m = materials();
  const H = 3.1;
  // bulkhead under the glass
  b.mesh(rbox(W * 2, 0.35, 0.18, 0.01), m.darkGrey, { pos: [0, 0.175, 0.05] });
  // header wall above the glass
  b.mesh(worldUvBox(W * 2 + 0.4, L.ceiling - H, 0.2, 2.0), m.wallLow, { pos: [0, H + (L.ceiling - H) / 2, 0.1] });
  b.block(-W, W, 0, L.ceiling, 0.0, 0.2, "front");
  // glass panes & mullions
  const xs = [-W, -2.0, -0.85, L.door.x0, L.door.x1, 2.0, W];
  for (const x of xs) {
    b.mesh(rbox(0.07, H, 0.1, 0.005), m.frame, { pos: [x, H / 2, 0.06], cast: true });
  }
  b.mesh(rbox(W * 2, 0.08, 0.1, 0.005), m.frame, { pos: [0, H, 0.06] });
  b.mesh(rbox(W * 2, 0.06, 0.1, 0.005), m.frame, { pos: [0, 0.35, 0.06] });
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    if (x0 === L.door.x0) continue; // door handled separately
    const g = new THREE.Mesh(plane(x1 - x0, H - 0.4), m.glass);
    g.position.set((x0 + x1) / 2, 0.35 + (H - 0.4) / 2 + 0.02, 0.06);
    g.renderOrder = 2;
    b.scene.add(g);
  }
  // transom over the door
  b.mesh(rbox(L.door.x1 - L.door.x0, 0.06, 0.1, 0.005), m.frame, { pos: [(L.door.x0 + L.door.x1) / 2, L.door.h, 0.06] });
  const tr = new THREE.Mesh(plane(L.door.x1 - L.door.x0, H - L.door.h - 0.08), m.glass);
  tr.position.set((L.door.x0 + L.door.x1) / 2, L.door.h + (H - L.door.h) / 2, 0.06);
  b.scene.add(tr);

  // window lettering (mirrored from inside)
  const letter = new THREE.Mesh(plane(2.2, 0.55), new THREE.MeshBasicMaterial({ map: T.storefrontLetteringTex(), transparent: true, depthWrite: false }));
  letter.position.set(-1.9, 2.45, 0.05);
  letter.rotation.y = Math.PI;
  letter.renderOrder = 3;
  b.scene.add(letter);
  // "OPEN 24H" small warm neon facing the street, visible from inside as glow
  const neon = new THREE.Mesh(rbox(0.6, 0.18, 0.03, 0.02), m.neonWarm);
  neon.position.set(1.5, 2.2, 0.0);
  b.scene.add(neon);
  const neonLabel = new THREE.Mesh(plane(0.55, 0.14), new THREE.MeshBasicMaterial({ map: T.labelTex("OPEN 24H", { w: 256, h: 64, fg: "#3a1a05", bg: "#ffb15c" }), toneMapped: false }));
  neonLabel.position.set(1.5, 2.2, -0.017);
  neonLabel.rotation.y = Math.PI;
  b.scene.add(neonLabel);
}

function buildCounter(b: Builder) {
  const m = materials();
  const c = L.counter;
  const len = c.z0 - c.z1;
  const cz = (c.z0 + c.z1) / 2;
  // main bar: front panel (wood), top (laminate)
  b.mesh(rbox(c.x1 - c.x0, c.h - 0.04, len, 0.01), m.woodDark, { pos: [(c.x0 + c.x1) / 2, (c.h - 0.04) / 2, cz], cast: true });
  b.mesh(rbox(c.x1 - c.x0 + 0.12, 0.04, len + 0.06, 0.01), m.laminate, { pos: [(c.x0 + c.x1) / 2 - 0.05, c.h - 0.02, cz], cast: true });
  // kick plate
  b.mesh(rbox(0.02, 0.1, len, 0.004), m.black, { pos: [c.x0 - 0.005, 0.05, cz] });
  // return toward the right wall at the front end
  b.mesh(rbox(W - c.x1, c.h - 0.04, 0.5, 0.01), m.woodDark, { pos: [(c.x1 + W) / 2, (c.h - 0.04) / 2, c.z0 - 0.25], cast: true });
  b.mesh(rbox(W - c.x1 + 0.06, 0.04, 0.56, 0.01), m.laminate, { pos: [(c.x1 + W) / 2, c.h - 0.02, c.z0 - 0.25] });
  b.block(c.x0 - 0.06, c.x1, 0, c.h, c.z1, c.z0, "counter");
  b.block(c.x1, W, 0, c.h, c.z0 - 0.5, c.z0, "counterReturn");

  // back shelf behind owner
  const sx0 = 2.85;
  // open shelf unit: back panel, sides, top
  b.mesh(rbox(0.03, 2.0, 2.1, 0.005), m.woodMid, { pos: [W - 0.02, 1.0, -2.35] });
  for (const z of [-1.3, -3.4]) b.mesh(rbox(0.36, 2.0, 0.03, 0.005), m.woodDark, { pos: [(sx0 + W) / 2, 1.0, z], cast: true });
  b.mesh(rbox(0.36, 0.03, 2.1, 0.005), m.woodDark, { pos: [(sx0 + W) / 2, 2.0, -2.35] });
  b.block(sx0, W, 0, 2.0, -3.4, -1.3, "backShelf");
  for (let i = 0; i < 4; i++) {
    const y = 0.45 + i * 0.42;
    b.mesh(rbox(0.36, 0.025, 2.08, 0.004), m.woodDark, { pos: [(sx0 + W) / 2 - 0.02, y, -2.35] });
    // stock: noodle cups, boxes, cable spools
    for (let k = 0; k < 6; k++) {
      const z = -1.45 - k * 0.33;
      const t = (i * 7 + k) % 4;
      if (t === 0) b.mesh(cyl(0.05, 0.04, 0.11, 10), colorMat(["#d9534f", "#e8c547", "#f2efe6"][k % 3], 0.7), { pos: [sx0 + 0.15, y + 0.07, z] });
      else if (t === 1) b.mesh(rbox(0.16, 0.2, 0.22, 0.01), m.cardboard, { pos: [sx0 + 0.17, y + 0.11, z] });
      else if (t === 2) b.mesh(new THREE.TorusGeometry(0.06, 0.025, 8, 14), m.cable, { pos: [sx0 + 0.15, y + 0.09, z], rot: [0, Math.PI / 2, 0] });
      else b.mesh(rbox(0.1, 0.16, 0.06, 0.01), colorMat(["#3b6ea5", "#2d2e31", "#a5523b"][k % 3], 0.6), { pos: [sx0 + 0.15, y + 0.09, z] });
    }
  }
  // price list
  b.mesh(plane(0.62, 0.85), new THREE.MeshStandardMaterial({ map: T.posterTex("prices"), roughness: 0.8 }), { pos: [W - 0.01, 2.55, -2.35], rot: [0, -Math.PI / 2, 0] });

  // cash register (old, beige)
  const reg = b.mesh(rbox(0.32, 0.16, 0.34, 0.02), m.beigeOld, { pos: [1.62, c.h + 0.08, -1.45], static: false, cast: true });
  b.mesh(rbox(0.22, 0.12, 0.04, 0.01), m.darkGrey, { pos: [1.55, c.h + 0.22, -1.45], rot: [0, 0, 0.5] });
  // session timer screen (small CRT facing customers)
  const tcrt = b.mesh(rbox(0.3, 0.26, 0.26, 0.03), m.beigeOld, { pos: [1.7, c.h + 0.13, -1.95], cast: true });
  void tcrt;
  const timerScreen = new THREE.Mesh(plane(0.24, 0.18), new THREE.MeshBasicMaterial({ color: "#fff", toneMapped: false }));
  timerScreen.position.set(1.7 - 0.131, c.h + 0.14, -1.95);
  timerScreen.rotation.y = -Math.PI / 2;
  b.scene.add(timerScreen);
  // bell
  const bell = b.mesh(sphere(0.045, 12, 8), m.chrome, { pos: [1.45, c.h + 0.03, -2.35], scale: [1, 0.7, 1], static: false });
  b.mesh(cyl(0.05, 0.05, 0.01, 12), m.black, { pos: [1.45, c.h + 0.005, -2.35] });
  // thermal printer
  const pr = SPOTS.printer;
  const printer = b.mesh(rbox(0.18, 0.12, 0.2, 0.025), m.darkGrey, { pos: [pr.x + 0.02, pr.y + 0.06, pr.z], static: false, cast: true });
  b.mesh(rbox(0.12, 0.01, 0.005, 0.002), m.black, { pos: [pr.x - 0.07, pr.y + 0.1, pr.z] , rot: [0, Math.PI / 2, 0] });
  const pLed = b.mesh(sphere(0.006, 6, 4), m.ledGreen, { pos: [pr.x - 0.07, pr.y + 0.06, pr.z + 0.07], static: false });
  void pLed;
  const label = b.mesh(plane(0.14, 0.04), new THREE.MeshBasicMaterial({ map: T.labelTex("PRINT ▸ FREE", { w: 256, h: 64, fg: "#e9dcc0", bg: "#2d2e31" }) }), { pos: [pr.x - 0.071, pr.y + 0.03, pr.z], rot: [0, -Math.PI / 2, 0] });
  void label;
  // candy jar + chips basket (chips are props spawned elsewhere)
  b.mesh(cyl(0.07, 0.07, 0.18, 14), m.glass, { pos: [1.5, c.h + 0.09, -0.95 - 0.15], static: false });
  b.mesh(rbox(0.3, 0.08, 0.22, 0.02), colorMat("#6b4a2a", 0.9), { pos: [1.6, c.h + 0.04, -2.75] });
  // "pay here" sign
  b.mesh(plane(0.2, 0.1), new THREE.MeshBasicMaterial({ map: T.labelTex("PAY HERE • CR", { w: 256, h: 128, bg: "#e7dfcb", fg: "#2a2520", size: 34 }) }), { pos: [1.28, 0.85, -2.2], rot: [0, -Math.PI / 2, 0] });
  // grass sticker on counter front
  b.mesh(plane(0.3, 0.41), new THREE.MeshStandardMaterial({ map: T.posterTex("grass"), roughness: 0.8 }), { pos: [1.285, 0.55, -1.3], rot: [0, -Math.PI / 2, 0] });

  return {
    printer: { body: printer, slot: new THREE.Vector3(pr.x - 0.09, pr.y + 0.1, pr.z), hit: printer },
    register: reg,
    bell,
    timerScreen,
  };
}

function buildLounge(b: Builder) {
  const m = materials();
  // couch facing the window
  const cz = SPOTS.couchSeat.z;
  const x0 = -3.05;
  const x1 = -1.15;
  const cx = (x0 + x1) / 2;
  const w = x1 - x0;
  b.mesh(rbox(w, 0.22, 0.75, 0.05, 3), m.couch, { pos: [cx, 0.2, cz - 0.05], cast: true });
  b.mesh(rbox(w - 0.3, 0.14, 0.62, 0.06, 3), m.couch, { pos: [cx, 0.37, cz], cast: true });
  b.mesh(rbox(w, 0.55, 0.2, 0.07, 3), m.couch, { pos: [cx, 0.55, cz - 0.38], rot: [-0.12, 0, 0], cast: true });
  for (const s of [-1, 1]) b.mesh(rbox(0.18, 0.5, 0.75, 0.07, 3), m.couch, { pos: [cx + s * (w / 2 - 0.09), 0.33, cz - 0.05], cast: true });
  // cushion that doesn't match
  b.mesh(rbox(0.36, 0.3, 0.12, 0.06, 3), m.fabricGreen, { pos: [cx - 0.5, 0.58, cz - 0.22], rot: [-0.3, 0.2, 0.1] });
  b.solid(x0 - 0.05, x1 + 0.05, 0, 0.85, cz - 0.5, cz + 0.33, "couch");
  b.phys([cx, 0.22, cz], [w / 2, 0.22, 0.38], 0, "couch");
  b.phys([cx, 0.6, cz - 0.38], [w / 2, 0.3, 0.1], 0, "couchBack");

  // coffee table
  const tz = -1.5;
  const tx = -2.05;
  b.mesh(rbox(0.9, 0.04, 0.5, 0.01), m.woodMid, { pos: [tx, 0.42, tz], cast: true });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.mesh(rbox(0.04, 0.4, 0.04, 0.008), m.black, { pos: [tx + sx * 0.4, 0.2, tz + sz * 0.21] });
  b.mesh(rbox(0.3, 0.01, 0.22, 0.004), colorMat("#c9b98f", 0.9), { pos: [tx + 0.15, 0.445, tz - 0.05], rot: [0, 0.3, 0] }); // magazine
  b.block(tx - 0.45, tx + 0.45, 0, 0.44, tz - 0.25, tz + 0.25, "coffeeTable");

  // side table + lamp (toggleable)
  const lx = -2.95;
  const lz = -0.55;
  b.mesh(cyl(0.2, 0.2, 0.03, 16), m.woodDark, { pos: [lx, 0.55, lz], cast: true });
  b.mesh(cyl(0.025, 0.025, 0.54, 8), m.black, { pos: [lx, 0.27, lz] });
  b.mesh(cyl(0.16, 0.18, 0.02, 16), m.black, { pos: [lx, 0.01, lz] });
  b.block(lx - 0.2, lx + 0.2, 0, 0.57, lz - 0.2, lz + 0.2, "sideTable");
  b.mesh(cyl(0.05, 0.07, 0.03, 12), m.black, { pos: [lx, 0.585, lz] });
  b.mesh(cyl(0.012, 0.012, 0.32, 6), m.chrome, { pos: [lx, 0.75, lz] });
  const shade = b.mesh(cyl(0.1, 0.16, 0.18, 16, true), colorMat("#d9c7a0", 0.9), { pos: [lx, 0.95, lz], static: false });
  (shade.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  const bulbMat = m.bulb.clone();
  const lampBulb = b.mesh(sphere(0.04, 10, 8), bulbMat, { pos: [lx, 0.92, lz], static: false });
  const lampHit = new THREE.Mesh(rbox(0.36, 0.55, 0.36, 0), new THREE.MeshBasicMaterial({ visible: false }));
  lampHit.position.set(lx, 0.82, lz);
  b.scene.add(lampHit);
  // motto poster above
  b.mesh(plane(0.5, 0.68), new THREE.MeshStandardMaterial({ map: T.posterTex("motto"), roughness: 0.7 }), { pos: [-W + 0.012, 1.75, -1.25], rot: [0, Math.PI / 2, 0] });

  // oscillating standing fan
  const fanRoot = new THREE.Group();
  fanRoot.userData.dynamic = true;
  fanRoot.position.set(-0.95, 0, -3.05);
  fanRoot.rotation.y = Math.PI / 2 + 0.4; // points toward the couch
  b.scene.add(fanRoot);
  const base = new THREE.Mesh(cyl(0.18, 0.2, 0.04, 16), m.beigeOld);
  base.position.y = 0.02;
  base.castShadow = true;
  fanRoot.add(base);
  const pole = new THREE.Mesh(cyl(0.018, 0.018, 1.0, 8), m.chrome);
  pole.position.y = 0.52;
  fanRoot.add(pole);
  const head = new THREE.Group();
  head.position.y = 1.08;
  fanRoot.add(head);
  const motor = new THREE.Mesh(rbox(0.12, 0.12, 0.16, 0.05), m.beigeOld);
  motor.position.z = 0.06;
  head.add(motor);
  const cage = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.008, 6, 28), m.chrome);
  cage.position.z = -0.05;
  head.add(cage);
  for (let i = 0; i < 6; i++) {
    const spoke = new THREE.Mesh(rbox(0.4, 0.004, 0.004, 0.001), m.chrome);
    spoke.position.z = -0.06;
    spoke.rotation.z = (i / 6) * Math.PI;
    head.add(spoke);
  }
  const rotor = new THREE.Group();
  rotor.position.z = -0.04;
  head.add(rotor);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(rbox(0.07, 0.17, 0.006, 0.03), colorMat("#9fb8c8", 0.4));
    blade.position.set(Math.sin((i / 3) * Math.PI * 2) * 0.09, Math.cos((i / 3) * Math.PI * 2) * 0.09, 0);
    blade.rotation.z = -(i / 3) * Math.PI * 2;
    rotor.add(blade);
  }
  const fanHit = new THREE.Mesh(rbox(0.5, 1.3, 0.5, 0), new THREE.MeshBasicMaterial({ visible: false }));
  fanHit.position.y = 0.65;
  fanRoot.add(fanHit);
  b.solid(-0.95 - 0.22, -0.95 + 0.22, 0, 1.3, -3.05 - 0.22, -3.05 + 0.22, "fan");
  b.phys([-0.95, 0.6, -3.05], [0.05, 0.6, 0.05], 0, "fanPole");

  // plant by the door ("touch grass")
  b.mesh(cyl(0.18, 0.14, 0.38, 14), m.terracotta, { pos: [-0.75, 0.19, -0.42], cast: true });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    b.mesh(new THREE.ConeGeometry(0.05, 0.6 + (i % 3) * 0.15, 5), i % 4 === 0 ? m.plantDry : m.plant, {
      pos: [-0.75 + Math.cos(a) * 0.07, 0.62 + (i % 3) * 0.06, -0.42 + Math.sin(a) * 0.07],
      rot: [Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35],
      cast: true,
    });
  }
  b.block(-0.95, -0.55, 0, 0.9, -0.62, -0.22, "plant");
  // door mat + umbrella stand
  b.mesh(rbox(1.0, 0.012, 0.6, 0.004), colorMat("#2b2420", 0.95), { pos: [0.2, 0.006, -0.45] });
  b.mesh(cyl(0.12, 0.11, 0.45, 12), m.darkGrey, { pos: [1.05, 0.225, -0.35], cast: true });
  b.mesh(cyl(0.012, 0.012, 0.85, 6), colorMat("#3a5a7a", 0.5), { pos: [1.02, 0.6, -0.33], rot: [0.12, 0, 0.08] });
  b.mesh(cyl(0.012, 0.012, 0.8, 6), colorMat("#7a2b2b", 0.5), { pos: [1.08, 0.58, -0.37], rot: [-0.1, 0, -0.1] });
  b.block(0.92, 1.18, 0, 0.6, -0.48, -0.22, "umbrella");

  // entry door (glass, swings outward for arrivals)
  const door = new THREE.Group();
  door.userData.dynamic = true;
  door.position.set(L.door.x1, 0, 0.06);
  b.scene.add(door);
  const dw = L.door.x1 - L.door.x0;
  const dframe = new THREE.Mesh(rbox(dw, L.door.h - 0.02, 0.05, 0.01), m.frame);
  dframe.position.set(-dw / 2, L.door.h / 2, 0);
  dframe.scale.set(1, 1, 0.6);
  const dglass = new THREE.Mesh(plane(dw - 0.12, L.door.h - 0.2), m.glass);
  dglass.position.set(-dw / 2, L.door.h / 2, 0.03);
  door.add(dglass);
  for (const [w, h, x, y] of [
    [dw, 0.08, -dw / 2, 0.04],
    [dw, 0.06, -dw / 2, L.door.h - 0.05],
    [0.06, L.door.h, -0.03, L.door.h / 2],
    [0.06, L.door.h, -dw + 0.03, L.door.h / 2],
  ] as [number, number, number, number][]) {
    const f = new THREE.Mesh(rbox(w, h, 0.06, 0.005), m.frame);
    f.position.set(x, y, 0.03);
    door.add(f);
  }
  const bar = new THREE.Mesh(cyl(0.015, 0.015, 0.9, 8), m.chrome);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(-dw / 2, 1.0, -0.02);
  door.add(bar);
  b.solid(L.door.x0, L.door.x1, 0, L.door.h, -0.02, 0.2, "door");

  return {
    fan: { root: fanRoot, head, rotor, hit: fanHit },
    lampHit,
    lampBulb,
    lampPos: new THREE.Vector3(lx, 0.95, lz),
    entryDoor: door,
  };
}

function buildFridge(b: Builder) {
  const m = materials();
  const x0 = -W;
  const x1 = -2.5;
  const z0 = -3.22;
  const z1 = -4.02;
  const h = 1.95;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const wt = 0.05;
  // body shell (open front at +x)
  b.mesh(rbox(x1 - x0, wt, z0 - z1, 0.01), m.fridgeBody, { pos: [cx, wt / 2, cz], cast: true });
  b.mesh(rbox(x1 - x0, wt, z0 - z1, 0.01), m.fridgeBody, { pos: [cx, h - wt / 2, cz], cast: true });
  b.mesh(rbox(wt, h, z0 - z1, 0.01), m.fridgeBody, { pos: [x0 + wt / 2, h / 2, cz] });
  b.mesh(rbox(x1 - x0, h, wt, 0.01), m.fridgeBody, { pos: [cx, h / 2, z0 - wt / 2], cast: true });
  b.mesh(rbox(x1 - x0, h, wt, 0.01), m.fridgeBody, { pos: [cx, h / 2, z1 + wt / 2], cast: true });
  // header sign
  b.mesh(rbox(x1 - x0 + 0.02, 0.22, z0 - z1 + 0.02, 0.01), colorMat("#24365e", 0.5), { pos: [cx, h + 0.11, cz] });
  b.mesh(plane(0.7, 0.18), new THREE.MeshBasicMaterial({ map: T.labelTex("OVERNIGHT", { w: 256, h: 64, fg: "#f4c542", bg: "#24365e" }) }), { pos: [x1 + 0.011, h + 0.11, cz], rot: [0, Math.PI / 2, 0] });
  // interior: back panel lit
  const light = new THREE.Mesh(plane(z0 - z1 - 0.12, h - 0.2), new THREE.MeshStandardMaterial({ color: "#dfe8f0", emissive: new THREE.Color("#cfe2ff"), emissiveIntensity: 0.05, roughness: 0.6 }));
  light.position.set(x0 + wt + 0.01, h / 2, cz);
  light.rotation.y = Math.PI / 2;
  b.scene.add(light);
  const canSpots: THREE.Vector3[] = [];
  const shelfYs = [0.5, 0.95, 1.4];
  for (const y of shelfYs) {
    b.mesh(rbox(x1 - x0 - 0.12, 0.015, z0 - z1 - 0.1, 0.003), m.chrome, { pos: [cx - 0.03, y, cz] });
    b.phys([cx - 0.03, y - 0.04, cz], [(x1 - x0) / 2 - 0.06, 0.05, (z0 - z1) / 2 - 0.05], 0, "fridgeShelf");
    for (let k = 0; k < 3; k++) canSpots.push(new THREE.Vector3(cx + 0.05, y + 0.08, z1 + 0.18 + k * 0.22));
  }
  // physics walls of the fridge (so cans stay in)
  b.phys([x0 + wt / 2, h / 2, cz], [wt / 2, h / 2, (z0 - z1) / 2], 0, "fridge");
  b.phys([cx, h / 2, z0 - wt / 2], [(x1 - x0) / 2, h / 2, wt / 2], 0, "fridge");
  b.phys([cx, h / 2, z1 + wt / 2], [(x1 - x0) / 2, h / 2, wt / 2], 0, "fridge");
  b.phys([cx, wt / 2, cz], [(x1 - x0) / 2, wt / 2, (z0 - z1) / 2], 0, "fridge");
  b.phys([cx, h - wt / 2, cz], [(x1 - x0) / 2, wt / 2, (z0 - z1) / 2], 0, "fridge");
  b.solid(x0, x1 + 0.06, 0, h + 0.22, z1, z0, "fridgeBody");

  // door: glass with frame, pivot on the z0 edge (front end)
  const pivot = new THREE.Group();
  pivot.userData.dynamic = true;
  pivot.position.set(x1 + 0.03, 0, z0);
  b.scene.add(pivot);
  const dl = z0 - z1;
  const door = new THREE.Mesh(rbox(0.04, h - 0.04, dl, 0.01), new THREE.MeshPhysicalMaterial({ color: "#a9c2cf", roughness: 0.1, transparent: true, opacity: 0.28, depthWrite: false }));
  door.position.set(0, h / 2, -dl / 2);
  door.renderOrder = 2;
  pivot.add(door);
  for (const [w, hh, y, z] of [
    [0.05, 0.08, 0.06, -dl / 2],
    [0.05, 0.08, h - 0.08, -dl / 2],
  ] as [number, number, number, number][]) {
    const f = new THREE.Mesh(rbox(w, hh, dl, 0.01), m.fridgeBody);
    f.position.set(0, y, z);
    pivot.add(f);
  }
  for (const z of [-0.025, -dl + 0.025]) {
    const f = new THREE.Mesh(rbox(0.05, h, 0.05, 0.01), m.fridgeBody);
    f.position.set(0, h / 2, z);
    pivot.add(f);
  }
  const handle = new THREE.Mesh(rbox(0.03, 0.5, 0.03, 0.01), m.chrome);
  handle.position.set(0.04, 1.1, -dl + 0.07);
  pivot.add(handle);
  door.userData.fridgeDoor = true;
  b.phys([x1 + 0.03, h / 2, cz], [0.025, h / 2, (z0 - z1) / 2], 0, "fridgeDoor");
  return { pivot, door, light, collider: "fridgeDoor", canSpots };
}

function buildDividers(b: Builder) {
  const m = materials();
  const h = 1.15;
  const span = 1.05;
  // left row boundaries
  const lz = [-4.1, -5.5, -6.9, -8.3, -9.7, -11.1, -12.5];
  for (const z of lz) {
    const x0 = -W;
    const x1 = -W + span;
    b.mesh(rbox(span, h, 0.04, 0.012), m.divider, { pos: [(x0 + x1) / 2, h / 2, z], cast: true });
    b.mesh(rbox(span, 0.03, 0.06, 0.01), m.darkGrey, { pos: [(x0 + x1) / 2, h, z] });
    b.block(x0, x1, 0, h, z - 0.03, z + 0.03, "divider");
  }
  const rz = [-4.7, -6.1, -7.5, -8.9];
  for (const z of rz) {
    const x1 = W;
    const x0 = W - span;
    b.mesh(rbox(span, h, 0.04, 0.012), m.divider, { pos: [(x0 + x1) / 2, h / 2, z], cast: true });
    b.mesh(rbox(span, 0.03, 0.06, 0.01), m.darkGrey, { pos: [(x0 + x1) / 2, h, z] });
    b.block(x0, x1, 0, h, z - 0.03, z + 0.03, "divider");
  }
  // power strips + cable bundles behind desks (wall side), imperfect
  for (const z of [-4.8, -6.2, -7.6, -9.0, -10.4, -11.8]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-W + 0.05, 0.05, z + 0.5),
      new THREE.Vector3(-W + 0.08, 0.3, z + 0.1),
      new THREE.Vector3(-W + 0.06, 0.74, z - 0.2),
    ]);
    b.mesh(new THREE.TubeGeometry(curve, 8, 0.01, 5), m.cable, { receive: false });
    b.mesh(rbox(0.05, 0.04, 0.35, 0.01), m.beige, { pos: [-W + 0.06, 0.03, z + 0.2] });
  }
  for (const z of [-5.4, -6.8, -8.2]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(W - 0.05, 0.05, z + 0.5),
      new THREE.Vector3(W - 0.08, 0.35, z + 0.15),
      new THREE.Vector3(W - 0.06, 0.74, z - 0.2),
    ]);
    b.mesh(new THREE.TubeGeometry(curve, 8, 0.01, 5), m.cable, { receive: false });
  }
  // cable tray along the left wall top
  b.mesh(rbox(0.12, 0.05, 8.2, 0.005), m.metal, { pos: [-W + 0.08, 2.35, -8.2] });
}

function buildStairsAndMezz(b: Builder) {
  const m = materials();
  const s = L.stairs;
  const steps = 16;
  const run = (s.zBottom - s.zTop) / steps;
  const rise = L.mezzY / steps;
  for (let i = 0; i < steps; i++) {
    const z = s.zBottom - (i + 0.5) * run;
    const y = (i + 1) * rise;
    b.mesh(rbox(s.x1 - s.x0, 0.04, run + 0.03, 0.008), m.woodDark, { pos: [(s.x0 + s.x1) / 2, y - 0.02, z], cast: true });
    b.mesh(rbox(s.x1 - s.x0, rise, 0.02, 0.004), m.darkGrey, { pos: [(s.x0 + s.x1) / 2, y - rise / 2, z + run / 2] });
  }
  // stringer (inner side) as a sloped slab
  const len = Math.hypot(s.zBottom - s.zTop, L.mezzY);
  const ang = Math.atan2(L.mezzY, s.zBottom - s.zTop);
  b.mesh(rbox(0.06, 0.32, len, 0.01), m.metal, { pos: [s.x0 - 0.02, L.mezzY / 2 - 0.12, (s.zBottom + s.zTop) / 2], rot: [ang, 0, 0], cast: true });
  b.mesh(rbox(0.06, 0.32, len, 0.01), m.metal, { pos: [s.x1 - 0.03, L.mezzY / 2 - 0.12, (s.zBottom + s.zTop) / 2], rot: [ang, 0, 0] });
  // handrail
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const z = s.zBottom - t * (s.zBottom - s.zTop);
    const y = t * L.mezzY;
    b.mesh(cyl(0.015, 0.015, 0.95, 6), m.metal, { pos: [s.x0 - 0.02, y + 0.48, z] });
  }
  b.mesh(cyl(0.022, 0.022, len, 8), m.woodDark, { pos: [s.x0 - 0.02, L.mezzY / 2 + 0.95, (s.zBottom + s.zTop) / 2], rot: [ang + Math.PI / 2, 0, 0] });
  b.block(s.x0 - 0.06, s.x0, 0, L.mezzY + 1.1, s.zTop, s.zBottom, "stairRail");
  // physics: slope for props
  b.phys([(s.x0 + s.x1) / 2, L.mezzY / 2 - 0.12, (s.zBottom + s.zTop) / 2], [(s.x1 - s.x0) / 2, 0.1, len / 2], 0, "stairs", ang);
  // under-stair storage (blocks walking under the high end)
  b.solid(s.x0, s.x1, 0, 1.0, s.zTop - 1.0, -10.6, "underStairs");
  b.mesh(rbox(0.5, 0.4, 0.45, 0.01), m.cardboard, { pos: [2.75, 0.2, -11.4], cast: true });
  b.mesh(rbox(0.45, 0.35, 0.4, 0.01), m.cardboard, { pos: [2.7, 0.58, -11.5], rot: [0, 0.2, 0], cast: true });
  b.mesh(rbox(0.6, 0.5, 0.5, 0.01), m.cardboard, { pos: [2.75, 0.25, -12.3], cast: true });
  b.mesh(cyl(0.15, 0.13, 0.3, 12), colorMat("#d9b84a", 0.6), { pos: [2.6, 0.15, -10.9] }); // mop bucket
  b.phys([2.72, 0.5, -11.8], [0.45, 0.5, 1.2], 0, "storage");

  // chain gate at the bottom (removed when the mezzanine is unlocked)
  const gate = new THREE.Group();
  gate.userData.dynamic = true;
  b.scene.add(gate);
  for (const x of [s.x0 + 0.05, s.x1 - 0.05]) {
    const post = new THREE.Mesh(cyl(0.03, 0.04, 0.95, 10), m.chrome);
    post.position.set(x, 0.475, s.zBottom + 0.1);
    gate.add(post);
    const top = new THREE.Mesh(sphere(0.04, 10, 8), m.chrome);
    top.position.set(x, 0.96, s.zBottom + 0.1);
    gate.add(top);
  }
  const chainCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(s.x0 + 0.05, 0.9, s.zBottom + 0.1),
    new THREE.Vector3((s.x0 + s.x1) / 2, 0.7, s.zBottom + 0.1),
    new THREE.Vector3(s.x1 - 0.05, 0.9, s.zBottom + 0.1),
  ]);
  const chain = new THREE.Mesh(new THREE.TubeGeometry(chainCurve, 12, 0.012, 5), colorMat("#b8332a", 0.5));
  gate.add(chain);
  const sign = new THREE.Mesh(plane(0.3, 0.41), new THREE.MeshStandardMaterial({ map: T.posterTex("mezz"), roughness: 0.7 }));
  sign.position.set((s.x0 + s.x1) / 2, 0.55, s.zBottom + 0.12);
  gate.add(sign);
  const collider = b.solid(s.x0, s.x1, 0, 1.2, s.zBottom + 0.04, s.zBottom + 0.16, "chainGate");

  // mezzanine slab
  const mz0 = L.mezzFront;
  const mzLen = mz0 - L.back;
  b.mesh(rbox(W * 2, L.mezzY - L.mezzSlabBottom, mzLen, 0.01), m.concrete, { pos: [0, (L.mezzY + L.mezzSlabBottom) / 2, (mz0 + L.back) / 2] });
  b.mesh(worldUvBox(W * 2, 0.02, mzLen, 1.6), m.woodMid, { pos: [0, L.mezzY + 0.01, (mz0 + L.back) / 2] });
  b.phys([0, L.mezzY - 0.12, (mz0 + L.back) / 2], [W, 0.13, mzLen / 2], 0, "mezzSlab");
  // steel beam under the edge
  b.mesh(rbox(W * 2, 0.22, 0.14, 0.01), m.darkGrey, { pos: [0, L.mezzSlabBottom - 0.06, mz0 + 0.05] });
  // railing at the edge (glass + posts + wood top rail), leaving the stair opening
  const rx0 = -W;
  const rx1 = s.x0;
  const rh = 1.02;
  for (let x = rx0 + 0.05; x <= rx1; x += 0.9) b.mesh(cyl(0.02, 0.02, rh, 8), m.metal, { pos: [x, L.mezzY + rh / 2, mz0 + 0.04] });
  b.mesh(rbox(rx1 - rx0, 0.05, 0.07, 0.015), m.woodDark, { pos: [(rx0 + rx1) / 2, L.mezzY + rh, mz0 + 0.04] });
  const rglass = new THREE.Mesh(plane(rx1 - rx0, 0.85), m.glass);
  rglass.position.set((rx0 + rx1) / 2, L.mezzY + 0.48, mz0 + 0.04);
  b.scene.add(rglass);
  b.block(rx0, rx1, L.mezzY, L.mezzY + rh + 0.05, mz0 - 0.02, mz0 + 0.08, "mezzRail");
  // short side rail where the stairs arrive
  b.mesh(cyl(0.02, 0.02, rh, 8), m.metal, { pos: [s.x0 - 0.02, L.mezzY + rh / 2, mz0 - 0.5] });

  // mezzanine decor
  b.mesh(rbox(2.6, 0.01, 1.6, 0.004), colorMat("#5a2f2a", 0.95), { pos: [-0.5, L.mezzY + 0.025, -15.0] });
  b.mesh(rbox(0.4, 1.6, 1.2, 0.01), m.woodDark, { pos: [-W + 0.2, L.mezzY + 0.8, -17.5], cast: true });
  b.block(-W, -W + 0.4, L.mezzY, L.mezzY + 1.6, -18.1, -16.9, "mezzShelf");
  for (let i = 0; i < 3; i++) b.mesh(rbox(0.38, 0.02, 1.15, 0.004), m.woodMid, { pos: [-W + 0.2, L.mezzY + 0.4 + i * 0.45, -17.5] });
  // trophy: golden candle
  b.mesh(cyl(0.05, 0.06, 0.06, 10), colorMat("#c9a13a", 0.3, 0.8), { pos: [-W + 0.2, L.mezzY + 1.33, -17.3] });
  b.mesh(cyl(0.02, 0.02, 0.14, 8), colorMat("#c9a13a", 0.3, 0.8), { pos: [-W + 0.2, L.mezzY + 1.43, -17.3] });
  // plant
  b.mesh(cyl(0.16, 0.13, 0.34, 12), m.terracotta, { pos: [W - 0.35, L.mezzY + 0.17, -15.2] });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.mesh(new THREE.ConeGeometry(0.05, 0.7, 5), m.plant, { pos: [W - 0.35 + Math.cos(a) * 0.06, L.mezzY + 0.65, -15.2 + Math.sin(a) * 0.06], rot: [Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3] });
  }
  b.block(W - 0.55, W - 0.15, L.mezzY, L.mezzY + 1.0, -15.4, -15.0, "mezzPlant");
  // mezz back wall poster
  b.mesh(plane(0.5, 0.68), new THREE.MeshStandardMaterial({ map: T.posterTex("employee"), roughness: 0.7 }), { pos: [0.5, L.mezzY + 1.6, L.back + 0.01] });

  return { group: gate, collider, physTag: "chainGate" };
}

function buildBack(b: Builder) {
  const m = materials();
  const pz = L.partitionZ;
  const ch = L.corridorHalfW;
  const wallH = L.mezzSlabBottom;
  // partition segments
  b.mesh(worldUvBox(W - ch, wallH, 0.15, 2.0), m.wall, { pos: [-(W + ch) / 2, wallH / 2, pz] });
  b.mesh(worldUvBox(W - ch, wallH, 0.15, 2.0), m.wall, { pos: [(W + ch) / 2, wallH / 2, pz] });
  b.mesh(worldUvBox(ch * 2, wallH - 2.3, 0.15, 2.0), m.wall, { pos: [0, 2.3 + (wallH - 2.3) / 2, pz] });
  b.mesh(worldUvBox(W - ch, 1.0, 0.02, 1.2), m.woodDark, { pos: [-(W + ch) / 2, 0.5, pz + 0.085] });
  b.mesh(worldUvBox(W - ch, 1.0, 0.02, 1.2), m.woodDark, { pos: [(W + ch) / 2, 0.5, pz + 0.085] });
  b.block(-W, -ch, 0, wallH, pz - 0.08, pz + 0.08, "partitionL");
  b.block(ch, W, 0, wallH, pz - 0.08, pz + 0.08, "partitionR");
  // door frame
  for (const x of [-ch, ch]) b.mesh(rbox(0.06, 2.3, 0.2, 0.01), m.woodDark, { pos: [x, 1.15, pz] });
  b.mesh(rbox(ch * 2 + 0.06, 0.06, 0.2, 0.01), m.woodDark, { pos: [0, 2.3, pz] });

  // whiteboard on the left wall nook
  const wbW = 1.3;
  const wbH = 1.0;
  const wb = new THREE.Mesh(plane(wbW, wbH), m.whiteboard.clone());
  wb.position.set(SPOTS.whiteboard.x + 0.03, SPOTS.whiteboard.y, SPOTS.whiteboard.z);
  wb.rotation.y = Math.PI / 2;
  wb.name = "whiteboard";
  b.scene.add(wb);
  b.mesh(rbox(0.03, wbH + 0.05, wbW + 0.05, 0.01), m.chrome, { pos: [SPOTS.whiteboard.x + 0.01, SPOTS.whiteboard.y, SPOTS.whiteboard.z] });
  b.mesh(rbox(0.08, 0.02, wbW, 0.005), m.chrome, { pos: [SPOTS.whiteboard.x + 0.06, SPOTS.whiteboard.y - wbH / 2 - 0.02, SPOTS.whiteboard.z] });
  b.phys([SPOTS.whiteboard.x + 0.05, SPOTS.whiteboard.y - wbH / 2 - 0.04, SPOTS.whiteboard.z], [0.05, 0.015, wbW / 2], 0, "wbTray");

  // big screen ("telão") on the partition
  const bs = SPOTS.bigScreen;
  const bsW = 1.9;
  const bsH = bsW * (9 / 16);
  b.mesh(rbox(bsW + 0.08, bsH + 0.08, 0.06, 0.01), m.black, { pos: [bs.x, bs.y, pz + 0.11], cast: true });
  const bigScreen = new THREE.Mesh(plane(bsW, bsH), new THREE.MeshBasicMaterial({ color: "#fff", toneMapped: false }));
  bigScreen.position.set(bs.x, bs.y, pz + 0.142);
  bigScreen.name = "bigScreen";
  b.scene.add(bigScreen);
  b.phys([bs.x, bs.y, pz + 0.11], [bsW / 2 + 0.04, bsH / 2 + 0.04, 0.03], 0, "bigScreen");

  // mural (cork board)
  const mu = SPOTS.mural;
  const mural = new THREE.Mesh(rbox(1.2, 0.9, 0.03, 0.01), m.cork);
  mural.position.set(mu.x, mu.y, pz + 0.1);
  mural.name = "mural";
  b.scene.add(mural);
  b.mesh(rbox(1.26, 0.96, 0.025, 0.01), m.woodDark, { pos: [mu.x, mu.y, pz + 0.09] });
  b.mesh(plane(0.6, 0.12), new THREE.MeshBasicMaterial({ map: T.labelTex("WALL OF RECEIPTS", { w: 512, h: 96, fg: "#2a2520", bg: "#e7dfcb", font: T.FONT_UI }) }), { pos: [mu.x, mu.y + 0.56, pz + 0.085] });

  // corridor walls
  const cz0 = pz;
  const cz1 = L.serverZ;
  const clen = cz0 - cz1;
  b.mesh(worldUvBox(0.12, wallH, clen, 2.0), m.wall, { pos: [-ch - 0.06, wallH / 2, (cz0 + cz1) / 2] });
  b.mesh(worldUvBox(0.12, wallH, clen, 2.0), m.wall, { pos: [ch + 0.06, wallH / 2, (cz0 + cz1) / 2] });
  b.block(-ch - 0.12, -ch, 0, wallH, cz1, cz0, "corrL");
  b.block(ch, ch + 0.12, 0, wallH, cz1, cz0, "corrR");
  // fill the inaccessible WC / storage volumes
  b.solid(-W, -ch - 0.12, 0, wallH, cz1, cz0, "wcBlock");
  b.solid(ch + 0.12, W, 0, wallH, cz1, cz0, "storeBlock");
  b.mesh(worldUvBox(ch * 2, 0.06, clen, 1.2), m.floor, { pos: [0, 0.0, (cz0 + cz1) / 2], scale: [1, 0.1, 1] });

  // WC door on the left corridor wall
  const wcDoor = b.mesh(rbox(0.05, 2.05, 0.8, 0.01), m.woodMid, { pos: [-ch + 0.005, 1.025, -15.8], static: false, cast: true });
  b.mesh(plane(0.3, 0.41), new THREE.MeshStandardMaterial({ map: T.posterTex("wc"), roughness: 0.7 }), { pos: [-ch + 0.035, 1.55, -15.8], rot: [0, Math.PI / 2, 0] });
  b.mesh(sphere(0.03, 8, 6), m.chrome, { pos: [-ch + 0.04, 1.0, -16.1] });

  // lockers on the right corridor wall
  const lockers: LanHouseHandles["lockers"] = [];
  const lx = ch - 0.23;
  b.solid(lx - 0.23, ch, 0, 1.9, -17.2, -14.6, "lockers");
  b.phys([lx, 0.95, -15.9], [0.23, 0.95, 1.3], 0, "lockers");
  for (let i = 0; i < 6; i++) {
    const z = -14.8 - i * 0.42;
    b.mesh(rbox(0.44, 1.85, 0.4, 0.008), colorMat(i === 2 ? "#5d6b57" : "#5b6168", 0.55, 0.3), { pos: [lx, 0.925, z] });
    const door = new THREE.Group();
    door.userData.dynamic = true;
    door.position.set(lx - 0.225, 0.925, z + 0.2);
    b.scene.add(door);
    const panel = new THREE.Mesh(rbox(0.02, 1.8, 0.38, 0.006), colorMat(i === 2 ? "#6f8068" : "#6d747c", 0.5, 0.35));
    panel.position.set(0, 0, -0.19);
    door.add(panel);
    for (let v = 0; v < 4; v++) {
      const slot = new THREE.Mesh(rbox(0.005, 0.01, 0.2, 0.001), m.black);
      slot.position.set(-0.011, 0.75 - v * 0.04, -0.19);
      door.add(slot);
    }
    const num = new THREE.Mesh(plane(0.12, 0.06), new THREE.MeshBasicMaterial({ map: T.labelTex(`0${i + 1}`, { w: 128, h: 64, fg: "#f2efe6", bg: "#2d2e31" }) }));
    num.position.set(-0.012, 0.55, -0.19);
    num.rotation.y = -Math.PI / 2;
    door.add(num);
    lockers.push({ door, hit: panel, index: i, inside: new THREE.Vector3(lx, 1.1, z) });
  }

  // server room
  const sz = L.serverZ;
  b.mesh(worldUvBox(W - 0.5, wallH, 0.12, 2.0), m.wall, { pos: [-(W + 0.5) / 2, wallH / 2, sz] });
  b.mesh(worldUvBox(W - 0.5, wallH, 0.12, 2.0), m.wall, { pos: [(W + 0.5) / 2, wallH / 2, sz] });
  b.mesh(worldUvBox(1.0, wallH - 2.2, 0.12, 2.0), m.wall, { pos: [0, 2.2 + (wallH - 2.2) / 2, sz] });
  b.block(-W, -0.5, 0, wallH, sz - 0.06, sz + 0.06, "serverWallL");
  b.block(0.5, W, 0, wallH, sz - 0.06, sz + 0.06, "serverWallR");
  b.mesh(plane(0.3, 0.41), new THREE.MeshStandardMaterial({ map: T.posterTex("server"), roughness: 0.7 }), { pos: [0.66, 1.5, sz + 0.065] });
  // server door (glass)
  const sdPivot = new THREE.Group();
  sdPivot.userData.dynamic = true;
  sdPivot.position.set(-0.5, 0, sz);
  b.scene.add(sdPivot);
  const sdGlass = new THREE.Mesh(rbox(1.0, 2.15, 0.04, 0.01), new THREE.MeshPhysicalMaterial({ color: "#8fb0c0", roughness: 0.15, transparent: true, opacity: 0.25, depthWrite: false }));
  sdGlass.position.set(0.5, 1.08, 0);
  sdGlass.renderOrder = 2;
  sdPivot.add(sdGlass);
  const sdFrame = new THREE.Mesh(rbox(0.05, 2.15, 0.06, 0.01), m.frame);
  sdFrame.position.set(0.97, 1.08, 0);
  sdPivot.add(sdFrame);
  const sdHandle = new THREE.Mesh(rbox(0.03, 0.25, 0.05, 0.01), m.chrome);
  sdHandle.position.set(0.9, 1.05, 0.04);
  sdPivot.add(sdHandle);
  const keypad = b.mesh(rbox(0.08, 0.12, 0.02, 0.01), m.black, { pos: [0.62, 1.2, sz + 0.07] });
  void keypad;
  b.mesh(sphere(0.006, 6, 4), m.ledRed, { pos: [0.62, 1.24, sz + 0.082] });
  const sdCollider = b.solid(-0.5, 0.5, 0, 2.2, sz - 0.04, sz + 0.04, "serverDoor");
  b.phys([0, 1.1, sz], [0.5, 1.1, 0.03], 0, "serverDoor");

  // racks
  const [rackT, rackC, rackX] = T.rackTex();
  const rackFront = new THREE.MeshStandardMaterial({ map: rackT, emissiveMap: rackT, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 1.0, roughness: 0.5 });
  for (const x of [-1.6, -0.6, 0.9, 1.9]) {
    b.mesh(rbox(0.62, 2.0, 0.9, 0.01), m.black, { pos: [x, 1.0, L.back + 0.6], cast: true });
    const front = new THREE.Mesh(plane(0.55, 1.9), rackFront);
    front.position.set(x, 1.0, L.back + 1.052);
    b.scene.add(front);
  }
  b.block(-2.0, 2.3, 0, 2.0, L.back, L.back + 1.06, "racks");
  // cable tray + messy cables
  b.mesh(rbox(5.0, 0.05, 0.3, 0.005), m.metal, { pos: [0, 2.3, L.back + 0.5] });
  for (let i = 0; i < 6; i++) {
    const x = -1.8 + i * 0.75;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, 2.3, L.back + 0.5),
      new THREE.Vector3(x + 0.1, 2.1 - (i % 3) * 0.1, L.back + 0.95),
      new THREE.Vector3(x + 0.05, 1.9, L.back + 1.05),
    ]);
    b.mesh(new THREE.TubeGeometry(curve, 8, 0.012, 5), colorMat(["#2d5b9a", "#b8332a", "#d9b84a", "#151515"][i % 4], 0.6), { receive: false });
  }
  // old AC in server room
  b.mesh(rbox(0.9, 0.3, 0.25, 0.03), m.beige, { pos: [-2.4, 2.2, L.back + 0.13] });
  // the secret candle on a shelf corner
  b.mesh(rbox(0.5, 0.03, 0.3, 0.005), m.woodDark, { pos: [W - 0.3, 1.2, -19.6] });
  b.mesh(cyl(0.03, 0.035, 0.12, 12), colorMat("#efe6d2", 0.7), { pos: [W - 0.3, 1.275, -19.6] });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 8), new THREE.MeshBasicMaterial({ color: "#ffcf7a", toneMapped: false }));
  flame.position.set(W - 0.3, 1.36, -19.6);
  b.scene.add(flame);
  const candleHit = new THREE.Mesh(rbox(0.25, 0.3, 0.25, 0), new THREE.MeshBasicMaterial({ visible: false }));
  candleHit.position.set(W - 0.3, 1.3, -19.6);
  b.scene.add(candleHit);
  b.solid(W - 0.55, W, 0, 1.25, -19.8, -19.4, "candleShelf");
  // server room floor
  b.mesh(worldUvBox(W * 2, 0.04, -(L.back - sz), 0.6), m.concrete, { pos: [0, 0.005, (sz + L.back) / 2] });

  return {
    whiteboard: wb,
    bigScreen,
    mural,
    serverDoor: { pivot: sdPivot, hit: sdGlass, collider: sdCollider },
    wcDoor,
    lockers,
    candle: { flame, hit: candleHit },
    rackLeds: { ctx: rackX, tex: rackT, canvas: rackC },
  };
}

function buildDecor(b: Builder) {
  const m = materials();
  // posters
  const poster = (kind: string, pos: [number, number, number], rotY: number, w = 0.48) =>
    b.mesh(plane(w, w * 1.367), new THREE.MeshStandardMaterial({ map: T.posterTex(kind), roughness: 0.75 }), { pos, rot: [0, rotY, 0] });
  poster("rules", [-W + 0.012, 1.85, -5.5], Math.PI / 2, 0.55);
  poster("food", [-W + 0.012, 1.8, -9.7], Math.PI / 2);
  poster("employee", [W - 0.012, 1.85, -6.1], -Math.PI / 2);
  poster("wifi", [W - 0.012, 1.7, -4.2], -Math.PI / 2, 0.36);

  // stickers (original crypto humor)
  const sticker = (text: string, bg: string, fg: string, pos: [number, number, number], rotY: number, w = 0.22, rotZ = 0) =>
    b.mesh(plane(w, w / 2), new THREE.MeshStandardMaterial({ map: T.stickerTex(text, bg, fg), roughness: 0.6, transparent: true }), { pos, rot: [0, rotY, rotZ] });
  sticker("WAGMI*\n*terms apply", "#f2e7c9", "#2a2520", [-W + 1.05 + 0.001, 0.95, -6.9 + 0.025], 0, 0.2, 0.05);
  sticker("SUPPORT LEVEL:\nEMOTIONAL", "#2a2520", "#d9a441", [-W + 0.012, 1.25, -11.1], Math.PI / 2, 0.24, -0.04);
  sticker("NOT FINANCIAL\nADVICE. NOT\nFINANCIAL ANYTHING", "#e8d27a", "#2a2520", [W - 0.012, 1.3, -7.5], -Math.PI / 2, 0.24, 0.06);
  sticker("PC 04 IS FINE\n(emotionally)", "#d9534f", "#fff4dc", [-W + 1.05 + 0.001, 1.0, -9.7 + 0.025], 0, 0.2, -0.04);
  const secretSticker = sticker("GM FROM\nUNDER THE DESK", "#9be3b0", "#1d2b20", [-2.6, 0.5, -10.4 + 0.66], Math.PI, 0.16, 0.1);
  secretSticker.userData.dynamic = true;

  // AC unit (old) on the left wall + drip bucket
  const ac = new THREE.Group();
  ac.userData.dynamic = true;
  ac.position.set(-W + 0.14, 2.75, -8.3);
  b.scene.add(ac);
  const acBody = new THREE.Mesh(rbox(0.26, 0.3, 0.95, 0.04), m.beige);
  acBody.castShadow = true;
  ac.add(acBody);
  const vent = new THREE.Mesh(rbox(0.02, 0.06, 0.8, 0.01), m.darkGrey);
  vent.position.set(0.13, -0.1, 0);
  ac.add(vent);
  const acLed = new THREE.Mesh(sphere(0.008, 6, 4), m.ledGreen);
  acLed.position.set(0.131, 0.08, 0.38);
  ac.add(acLed);
  b.mesh(cyl(0.01, 0.01, 2.0, 6), colorMat("#e6e2d6", 0.6), { pos: [-W + 0.06, 1.7, -8.75] });
  b.mesh(cyl(0.1, 0.09, 0.18, 12), colorMat("#3b6ea5", 0.6), { pos: [-W + 0.12, 0.09, -8.75] });

  // trash bin (hollow so things can actually land inside)
  const bin = new THREE.Vector3(SPOTS.bin.x, 0, SPOTS.bin.z);
  const binR = 0.19;
  const binH = 0.5;
  const binMesh = b.mesh(cyl(binR, binR * 0.85, binH, 18, true), colorMat("#3c4a3a", 0.7), { pos: [bin.x, binH / 2, bin.z], cast: true });
  (binMesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  b.mesh(new THREE.TorusGeometry(binR, 0.012, 6, 20), m.black, { pos: [bin.x, binH, bin.z], rot: [Math.PI / 2, 0, 0] });
  b.mesh(cyl(binR * 0.85, binR * 0.85, 0.02, 18), m.black, { pos: [bin.x, 0.01, bin.z] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.phys([bin.x + Math.cos(a) * binR, binH / 2, bin.z + Math.sin(a) * binR], [0.012, binH / 2, binR * 0.42], -a, "bin");
  }
  b.phys([bin.x, 0.02, bin.z], [binR, 0.02, binR], 0, "binBottom");
  b.solid(bin.x - binR, bin.x + binR, 0, binH, bin.z - binR, bin.z + binR, "bin");
  // free-throw line tape
  b.mesh(rbox(1.6, 0.003, 0.05, 0.001), m.tape, { pos: [0, 0.002, SPOTS.binLineZ] });
  b.mesh(plane(0.5, 0.12), new THREE.MeshBasicMaterial({ map: T.labelTex("3 PTS ▸ BIN", { w: 256, h: 64, fg: "#2a2520", bg: "#d6b54a" }), transparent: true }), {
    pos: [0, 0.004, SPOTS.binLineZ + 0.12],
    rot: [-Math.PI / 2, 0, 0],
  });

  // ducts and pipes up high
  b.mesh(cyl(0.28, 0.28, -L.back, 16), m.metal, { pos: [-1.6, 4.55, L.back / 2], rot: [Math.PI / 2, 0, 0] });
  for (let z = -1; z > L.back; z -= 3) b.mesh(rbox(0.04, 0.6, 0.04, 0.005), m.darkGrey, { pos: [-1.6, 4.95, z] });
  b.mesh(cyl(0.05, 0.05, -L.back, 8), m.darkGrey, { pos: [2.2, 4.85, L.back / 2], rot: [Math.PI / 2, 0, 0] });

  // notepad on the player's home desk area (PC 03), used to crumple paper balls
  const np = b.mesh(rbox(0.14, 0.012, 0.2, 0.003), colorMat("#f2e9a0", 0.9), { pos: [-2.95, L.deskH + 0.006, -7.6 + 0.48], rot: [0, 0.25, 0], static: false });

  // wet floor sign near the door
  const wf = new THREE.Group();
  wf.position.set(-0.3, 0, -2.1);
  wf.rotation.y = 0.6;
  b.scene.add(wf);
  wf.updateMatrixWorld(true);
  for (const s of [-1, 1]) {
    b.mesh(rbox(0.3, 0.6, 0.01, 0.01), colorMat("#e0b100", 0.5), { pos: [0, 0.3, s * 0.08], rot: [s * 0.25, 0, 0], parent: wf, cast: true });
  }
  b.block(-0.48, -0.12, 0, 0.6, -2.28, -1.92, "wetSign");

  return { bin: { pos: bin, radius: binR, height: binH }, notepad: np, sticker: secretSticker, ac };
}

function buildLights(b: Builder, lampPos: THREE.Vector3) {
  const m = materials();
  const all: THREE.Light[] = [];
  const add = <T extends THREE.Light>(l: T): T => {
    b.scene.add(l);
    all.push(l);
    return l;
  };

  const hemi = add(new THREE.HemisphereLight("#5c6a82", "#2a2420", 0.45));
  const key = add(new THREE.DirectionalLight("#ffe2bd", 0.45));
  key.position.set(-2.5, 9, 3);
  key.target.position.set(0.5, 0, -9);
  b.scene.add(key.target);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -14;
  key.shadow.camera.right = 14;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -6;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 30;
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.03;

  // pendants
  const pendant = (x: number, y: number, z: number, color: string, intensity: number, dist: number) => {
    b.mesh(cyl(0.006, 0.006, L.ceiling - y - 0.1, 4), m.black, { pos: [x, (L.ceiling + y) / 2 + 0.05, z], receive: false });
    b.mesh(new THREE.ConeGeometry(0.2, 0.16, 18, 1, true), m.lampShade, { pos: [x, y + 0.04, z], receive: false });
    b.mesh(sphere(0.05, 10, 8), m.bulb, { pos: [x, y - 0.02, z], receive: false });
    const l = add(new THREE.PointLight(color, intensity, dist, 1.6));
    l.position.set(x, y - 0.1, z);
    return l;
  };
  pendant(1.5, 2.6, -2.2, "#ffc98a", 6.5, 9);
  pendant(-1.6, 2.7, -2.0, "#ffc98a", 3.2, 7);
  pendant(-0.4, 2.85, -5.8, "#ffd2a0", 7.5, 10);
  pendant(-0.4, 2.85, -10.0, "#ffd2a0", 7.5, 10);

  // fluorescent fixture over the right row (with occasional flicker)
  b.mesh(rbox(0.25, 0.06, 2.6, 0.01), m.darkGrey, { pos: [1.9, 3.0, -6.8] });
  const fluoMesh = new THREE.Mesh(rbox(0.12, 0.03, 2.4, 0.01), m.fluo.clone());
  fluoMesh.position.set(1.9, 2.96, -6.8);
  b.scene.add(fluoMesh);
  b.mesh(cyl(0.005, 0.005, 2.2, 4), m.black, { pos: [1.9, 4.1, -6.0] });
  b.mesh(cyl(0.005, 0.005, 2.2, 4), m.black, { pos: [1.9, 4.1, -7.6] });

  // lounge lamp
  const lamp = add(new THREE.PointLight("#ffbe7a", 2.6, 5, 1.8));
  lamp.position.copy(lampPos);

  // corridor fluorescent (cool, flickers)
  b.mesh(rbox(0.2, 0.05, 1.3, 0.01), m.fluo, { pos: [0, L.mezzSlabBottom - 0.04, -16.2] });
  const corridor = add(new THREE.PointLight("#cfe0ff", 3.0, 6, 1.8));
  corridor.position.set(0, 2.45, -16.2);

  // server room glow
  const server = add(new THREE.PointLight("#5fd0ff", 2.2, 6, 1.6));
  server.position.set(0.2, 2.0, -19.6);

  // mezzanine warm light
  b.mesh(cyl(0.006, 0.006, 0.6, 4), m.black, { pos: [-0.5, L.ceiling - 0.3, -15.6] });
  b.mesh(new THREE.ConeGeometry(0.22, 0.18, 18, 1, true), m.lampShade, { pos: [-0.5, L.ceiling - 0.62, -15.6] });
  b.mesh(sphere(0.05, 10, 8), m.bulb, { pos: [-0.5, L.ceiling - 0.68, -15.6] });
  const mezz = add(new THREE.PointLight("#ffcf98", 5.5, 8, 1.6));
  mezz.position.set(-0.5, L.ceiling - 0.8, -15.6);

  // candle (secret) tiny light
  const candle = add(new THREE.PointLight("#ffb860", 0.6, 1.6, 2));
  candle.position.set(W - 0.3, 1.45, -19.55);

  // street: sodium lamp outside shining in
  const street = add(new THREE.SpotLight("#ff9f4a", 22, 20, 0.75, 0.6, 1.4));
  street.position.set(-1.5, 5.0, 5.5);
  street.target.position.set(0.5, 0, -4);
  b.scene.add(street.target);
  // passing car headlights (intensity animated, never removed → no shader recompiles)
  const car = add(new THREE.PointLight("#dfe8ff", 0, 9, 1.5));
  car.position.set(-8, 0.8, 2.5);

  return { hemi, key, lamp, corridor, server, mezz, candle, street, car, fluoMesh, all };
}
