/**
 * All key coordinates of the LAN house in one place (meters, y up).
 * The store front glass is at z = 0 and the shop extends toward -z.
 *
 *   z=0    ┌──────── glass front / door ────────┐   street outside (+z)
 *          │ lounge (couch facing rain) │ counter│
 *   z=-4   │ fridge                     │        │
 *          │ PC01..PC06  (left row)  aisle  PC07..PC09 (right row)
 *   z=-9   │                                stairs ↑ (to mezzanine)
 *   z=-13  │ whiteboard │ big screen │ mural │      mezzanine edge above
 *   z=-14  ├──── partition ── corridor ── lockers ──┤
 *   z=-18.6│          server room (glass)           │
 *   z=-21  └────────────────────────────────────────┘
 */
export const L = {
  halfW: 3.2,
  front: 0,
  back: -21,
  ceiling: 5.2,
  mezzY: 3.0,
  mezzSlabBottom: 2.75,
  mezzFront: -13.0,
  partitionZ: -14.0,
  corridorHalfW: 0.8,
  serverZ: -18.6,
  door: { x0: -0.4, x1: 0.8, h: 2.3 },
  stairs: { x0: 2.25, x1: 3.2, zBottom: -9.4, zTop: -13.0 },
  counter: { x0: 1.3, x1: 1.9, z0: -0.9, z1: -3.5, h: 1.05 },
  deskDepth: 0.75,
  deskH: 0.74,
  stationPitch: 1.4,
};

export interface StationDef {
  id: string;
  label: string;
  /** Desk center, chair center, stand point. `facing` = yaw the seated person looks at (radians). */
  desk: [number, number, number];
  chair: [number, number, number];
  stand: [number, number];
  facing: number;
  row: "left" | "right" | "mezz";
  monitor: "crt" | "lcd4" | "lcdWide";
}

// yaw convention: 0 looks toward -z; +PI/2 looks toward -x; -PI/2 looks toward +x.
const LEFT_FACING = Math.PI / 2;
const RIGHT_FACING = -Math.PI / 2;

const leftZ = [-4.8, -6.2, -7.6, -9.0, -10.4, -11.8];
const rightZ = [-5.2, -6.6, -8.0];

export const STATIONS: StationDef[] = [
  ...leftZ.map((z, i) => ({
    id: `pc${String(i + 1).padStart(2, "0")}`,
    label: `PC ${String(i + 1).padStart(2, "0")}`,
    desk: [-L.halfW + L.deskDepth / 2, 0, z] as [number, number, number],
    chair: [-2.05, 0, z] as [number, number, number],
    stand: [-1.3, z] as [number, number],
    facing: LEFT_FACING,
    row: "left" as const,
    monitor: (i === 2 ? "crt" : i % 2 === 0 ? "lcd4" : i === 3 ? "crt" : "lcd4") as StationDef["monitor"],
  })),
  ...rightZ.map((z, i) => ({
    id: `pc${String(i + 7).padStart(2, "0")}`,
    label: `PC ${String(i + 7).padStart(2, "0")}`,
    desk: [L.halfW - L.deskDepth / 2, 0, z] as [number, number, number],
    chair: [2.05, 0, z] as [number, number, number],
    stand: [1.3, z] as [number, number],
    facing: RIGHT_FACING,
    row: "right" as const,
    monitor: (i === 1 ? "crt" : "lcd4") as StationDef["monitor"],
  })),
  {
    id: "mz1",
    label: "MZ 1",
    desk: [-1.6, L.mezzY, -13.6],
    chair: [-1.6, L.mezzY, -14.35],
    stand: [-1.6, -15.2],
    facing: Math.PI, // looks toward +z, over the railing
    row: "mezz",
    monitor: "lcdWide",
  },
  {
    id: "mz2",
    label: "MZ 2",
    desk: [0.6, L.mezzY, -13.6],
    chair: [0.6, L.mezzY, -14.35],
    stand: [0.6, -15.2],
    facing: Math.PI,
    row: "mezz",
    monitor: "lcdWide",
  },
];

export const stationById = (id: string): StationDef => {
  const s = STATIONS.find((x) => x.id === id);
  if (!s) throw new Error(`station ${id}`);
  return s;
};

export const SPOTS = {
  playerStart: { x: 0.25, z: -1.15, yaw: 0.35 },
  ownerIdle: { x: 2.55, z: -2.2, yaw: Math.PI / 2 },
  counterFront: { x: 0.85, z: -2.2, yaw: -Math.PI / 2 },
  printer: { x: 1.55, y: 1.05, z: -3.05 },
  fridge: { x: -2.85, z: -3.62 },
  fridgeFront: { x: -1.95, z: -3.62, yaw: Math.PI / 2 },
  couchSeat: { x: -2.1, z: -2.45, yaw: Math.PI },
  window: { x: -0.9, z: -0.7, yaw: Math.PI },
  whiteboard: { x: -L.halfW + 0.02, y: 1.5, z: -13.3 },
  whiteboardStand: { x: -2.3, z: -13.3, yaw: Math.PI / 2 },
  bigScreen: { x: -2.05, y: 1.85, z: -13.92 },
  bigScreenView: { x: -0.6, z: -11.2, yaw: 0 },
  mural: { x: 1.55, y: 1.45, z: -13.92 },
  muralStand: { x: 1.55, z: -13.1, yaw: 0 },
  bin: { x: 1.02, z: -3.8 },
  binLineZ: -7.0,
  serverWindow: { x: 0, z: -17.9, yaw: 0 },
  corridor: { x: 0, z: -15.2 },
  doorInside: { x: 0.2, z: -1.0 },
  doorOutside: { x: 0.2, z: 1.2 },
  stairBottom: { x: 2.7, z: -9.0 },
};
