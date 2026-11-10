import { Rect, rect } from '../core/util';

/** Sea surface height. Land is at 0. */
export const SEA = -1.0;
export const BOUNDS = { x0: -890, x1: 890, z0: -590, z1: 690 };
export const ROAD_Y = 0.04;
export const SLAB_Y = 0.16;

export type DistrictId =
  | 'downtown'
  | 'government'
  | 'suburbs'
  | 'harbor'
  | 'beach'
  | 'desert'
  | 'wallstreet'
  | 'outskirts'
  | 'ocean';

export interface DistrictInfo {
  name: string;
  color: string;
  faction: string;
  tagline: string;
}

export const DISTRICTS: Record<DistrictId, DistrictInfo> = {
  downtown: { name: 'Golden Downtown', color: '#f1dca0', faction: 'The Hecklers', tagline: 'Gold towers. Loud opinions.' },
  government: { name: 'Government District', color: '#e6e2d0', faction: 'Deep State Security', tagline: 'Marble, lawns and paperwork.' },
  suburbs: { name: 'Classic Suburbs', color: '#cfe3ae', faction: 'The H.O.A.', tagline: 'White fences. Strong feelings.' },
  harbor: { name: 'Freedom Harbor', color: '#c9d3d8', faction: 'Dockside Union', tagline: 'Containers, cranes and Lady Liberty.' },
  beach: { name: 'Liberty Beach', color: '#f3e3b4', faction: 'Spring Breakers', tagline: 'Sun, sand and selfie sticks.' },
  desert: { name: 'Route 66 Desert', color: '#e7bd84', faction: 'Desert Mercs', tagline: 'Long roads. Longer grudges.' },
  wallstreet: { name: 'Wall Street Chaos', color: '#d9d4c6', faction: 'The Bears', tagline: 'Buy the dip. Run from the mob.' },
  outskirts: { name: 'American Outskirts', color: '#bcd79a', faction: 'County Sheriff', tagline: 'Corn, barns and back roads.' },
  ocean: { name: 'Open Water', color: '#8cc6d6', faction: 'Coast Guard', tagline: '' },
};

export const ISLAND = { x: 0, z: 592, r: 50 };

export function districtAt(x: number, z: number): DistrictId {
  if (z > 240) {
    if (z > 480 && Math.hypot(x - ISLAND.x, z - ISLAND.z) > ISLAND.r + 14) return 'ocean';
    if (x < -30) return z > 500 ? 'ocean' : 'beach';
    if (x < 530) return 'harbor';
    return z > 420 ? 'ocean' : 'desert';
  }
  if (x >= 530) return 'desert';
  if (z < -120) {
    if (x < -170 || z < -490) return 'outskirts';
    return 'government';
  }
  if (x < -760) return 'outskirts';
  if (x < -340) return 'suburbs';
  if (x < 180) return 'downtown';
  return 'wallstreet';
}

export type RoadKind = 'arterial' | 'street' | 'narrow' | 'rural' | 'highway' | 'dirt' | 'bridge';
export const ROAD_W: Record<RoadKind, number> = { arterial: 18, street: 12, narrow: 9, rural: 9, highway: 11, dirt: 6, bridge: 12 };

export interface RoadLine {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  kind: RoadKind;
  w: number;
  city: boolean;
  traffic: boolean;
  name: string;
}

export const ROAD_LINES: RoadLine[] = [];
const add = (ax: number, az: number, bx: number, bz: number, kind: RoadKind, name = '', traffic = true) =>
  ROAD_LINES.push({
    ax, az, bx, bz, kind, w: ROAD_W[kind], name, traffic,
    city: kind === 'arterial' || kind === 'street' || kind === 'narrow',
  });
const H = (z: number, x0: number, x1: number, kind: RoadKind, name = '') => add(x0, z, x1, z, kind, name);
const V = (x: number, z0: number, z1: number, kind: RoadKind, name = '') => add(x, z0, x, z1, kind, name);
const path = (pts: number[][], kind: RoadKind, name = '', traffic = true) => {
  for (let i = 0; i < pts.length - 1; i++) add(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], kind, name, traffic);
};

// ---- Arterials --------------------------------------------------------------
H(-120, -760, 530, 'arterial', 'Liberty Avenue');
H(240, -760, 530, 'arterial', 'Ocean Boulevard');
V(-340, -120, 240, 'arterial', 'Fifth Avenue');
V(180, -120, 325, 'arterial', 'Broadway');
V(530, -470, 325, 'arterial', 'Interstate 45');
V(-170, -470, -120, 'arterial', '17th Street');
H(-470, -170, 530, 'arterial', 'Constitution Parkway');
V(-760, -120, 325, 'arterial', 'County Line Road');
H(325, -830, 530, 'street', 'Shore Drive');

// ---- District grids -----------------------------------------------------------
export const GRID = {
  downtown: { xs: [-340, -230, -120, -10, 90, 180], zs: [-120, -30, 60, 150, 240] },
  wallstreet: { xs: [180, 250, 320, 390, 460, 530], zs: [-120, -50, 20, 90, 165, 240] },
  government: { xs: [-170, -20, 100, 230, 380, 530], zs: [-470, -345, -245, -120] },
  suburbs: { xs: [-760, -655, -550, -445, -340], zs: [-120, -30, 60, 150, 240] },
  beach: { xs: [-760, -600, -440, -280, -120, 0], zs: [240, 325] },
  harbor: { xs: [0, 90, 180, 300, 420, 530], zs: [240, 325] },
};

for (const x of [-230, -120, -10, 90]) V(x, -120, 240, 'street');
for (const z of [-30, 60, 150]) H(z, -340, 180, 'street');
for (const x of [250, 320, 460]) V(x, -120, 240, 'narrow');
V(390, -120, 20, 'narrow');
V(390, 90, 240, 'narrow');
for (const z of [-50, 20, 90, 165]) H(z, 180, 530, 'narrow', z === 20 ? 'Wall Street' : '');
for (const x of [-20, 100, 230, 380]) V(x, -470, -120, 'street');
H(-345, -170, 530, 'street', 'Independence Avenue');
H(-245, -170, 530, 'street', 'Madison Drive');
for (const x of [-655, -550, -445]) V(x, -120, 240, 'narrow');
for (const z of [-30, 60, 150]) H(z, -760, -340, 'narrow', z === 60 ? 'Maple Street' : '');
for (const x of [-600, -440, -280, -120, 0]) V(x, 240, 325, 'street');
for (const x of [90, 300, 420]) V(x, 240, 325, 'street');

// ---- Rural / desert -------------------------------------------------------------
path([[-760, -120], [-830, -120], [-850, 60], [-830, 240], [-830, 325]], 'rural', 'Old Mill Road');
path([[-760, 240], [-830, 240]], 'rural');
path([[-170, -470], [-330, -470], [-480, -420], [-640, -440], [-800, -380], [-840, -240], [-830, -120]], 'rural', 'Farm Road 12');
path([[-170, -245], [-300, -260], [-420, -300], [-480, -420]], 'rural', 'Orchard Lane');
path([[-640, -440], [-640, -575]], 'dirt', 'Railroad Lane', false);
path([[-420, -300], [-520, -230], [-650, -240]], 'dirt', '', false);
path([[530, -120], [620, -120], [700, -180], [800, -180], [860, -260], [860, -420], [790, -500], [640, -520], [530, -470]], 'highway', 'Route 66');
path([[620, -120], [680, 0], [700, 140], [640, 220], [530, 240]], 'highway', 'Route 66 South');
path([[680, 0], [738, 20]], 'dirt', '', false);
path([[700, 140], [735, 262]], 'dirt', '', false);
// Liberty Bridge (deck geometry is built separately)
export const BRIDGE = { x: 0, z0: 331, zUp: 396, zDown: 498, z1: 546, h: 7.5, w: 12 };
path([[0, 325], [0, 396], [0, 498], [0, 556]], 'bridge', 'Liberty Bridge', false);

// ---- Underground --------------------------------------------------------------------
/** Government service tunnel (player-only shortcut; not part of the traffic graph). */
export const TUNNEL = { x0: 140, x1: 150, zTop: -400, zIn: -360, zOut: -100, zEnd: -60, depth: -6 };
/** Underground garage beneath Liberty Square. */
export const GARAGE = { rampX0: -110, rampX1: -100, rampZ0: 70, rampZ1: 110, room: rect(-110, 110, -30, 142), depth: -5 };

export const RAIL_Z = -540;

// ---- Points of interest ---------------------------------------------------------------
export interface POI {
  x: number;
  z: number;
  y?: number;
}
export const P = {
  tower: { x: -65, z: -2 },
  towerDoor: { x: -65, z: 26 },
  towerElevator: { x: -65, z: -16 },
  towerRoof: { x: -65, z: -2, y: 150 },
  helipad: { x: -65, z: -2, y: 150 },
  square: { x: -65, z: 105 },
  garage: { x: -70, z: 126, y: -5 },
  garageRamp: { x: -105, z: 66 },
  parking: { x: -285, z: 195 },
  showroom: { x: 40, z: 105 },
  whiteHouse: { x: 165, z: -428 },
  whGate: { x: 104, z: -405 },
  whLawn: { x: 185, z: -385 },
  tunnelNorth: { x: 145, z: -404 },
  tunnelSouth: { x: 145, z: -52 },
  capitol: { x: 455, z: -295 },
  obelisk: { x: 165, z: -295 },
  memorial: { x: -110, z: -295 },
  policeHQ: { x: 40, z: -180 },
  exchange: { x: 390, z: 40 },
  exchangePlaza: { x: 390, z: 62 },
  bull: { x: 355, z: 76 },
  metroWall: { x: 300, z: 130 },
  metroDowntown: { x: -160, z: 105 },
  metroGov: { x: 290, z: -210 },
  metroBeach: { x: -330, z: 290 },
  diner: { x: -700, z: -80 },
  gasStation: { x: -610, z: -85 },
  school: { x: -500, z: 10 },
  mall: { x: -395, z: 100 },
  park: { x: -605, z: 105 },
  safeSuburb: { x: -706, z: 196 },
  safeBeach: { x: -520, z: 285 },
  safeHarbor: { x: 240, z: 285 },
  safeDesert: { x: 742, z: -205 },
  safeFarm: { x: -560, z: -395 },
  pier: { x: -440, z: 430 },
  ferris: { x: -440, z: 468 },
  stage: { x: -680, z: 368 },
  boatRental: { x: -200, z: 408 },
  marina: { x: 130, z: 408 },
  containers: { x: 300, z: 365 },
  coastGuard: { x: 475, z: 368 },
  liberty: { x: 0, z: 600 },
  islandDock: { x: 44, z: 572 },
  motel: { x: 750, z: -215 },
  oldGas: { x: 625, z: -160 },
  compound: { x: 805, z: 20 },
  compoundGate: { x: 742, z: 20 },
  airstrip: { x: 780, z: 300 },
  hangar: { x: 730, z: 270 },
  freight: { x: 760, z: -545 },
  sheriff: { x: -500, z: -455 },
  farm: { x: -560, z: -380 },
  barn: { x: -720, z: -300 },
  restaurant: { x: -300, z: -290 },
  crossing: { x: -640, z: RAIL_Z },
  cabin: { x: -850, z: -480 },
  dropZone: { x: -180, z: 100, y: 330 },
} satisfies Record<string, POI>;

/** Rural places that the terrain must keep flat. */
export const FLAT_ZONES: { x: number; z: number; r: number }[] = [
  { x: P.compound.x, z: P.compound.z, r: 95 },
  { x: P.airstrip.x, z: P.airstrip.z, r: 120 },
  { x: P.motel.x, z: P.motel.z, r: 60 },
  { x: P.oldGas.x, z: P.oldGas.z, r: 40 },
  { x: P.freight.x, z: P.freight.z, r: 110 },
  { x: P.sheriff.x, z: P.sheriff.z, r: 40 },
  { x: P.farm.x, z: P.farm.z, r: 80 },
  { x: P.barn.x, z: P.barn.z, r: 70 },
  { x: P.restaurant.x, z: P.restaurant.z, r: 45 },
  { x: P.cabin.x, z: P.cabin.z, r: 30 },
  { x: -640, z: -560, r: 45 },
  { x: -400, z: -380, r: 60 },
];

export interface Zone {
  id: string;
  kind: 'safe' | 'restricted' | 'hide' | 'arena';
  rect: Rect;
  label?: string;
}
