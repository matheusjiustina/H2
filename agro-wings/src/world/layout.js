// Farm layout — Fazenda Boa Esperança (fictional), northern Mato Grosso.
// World axes: +X east, -Z north, +Y up. Units: metres. The strip runs 09/27
// along X with the operations base at its west end.

export const WORLD_HALF = 4000; // detailed terrain extent (8 x 8 km)
export const FAR_HALF = 24000; // horizon ring

export const RUNWAY = { x0: -400, x1: 400, z: 0, width: 24, shoulder: 10 };

export const BASE = {
  apron: { x0: -445, x1: -315, z0: -104, z1: -38 },
  taxiway: { x0: -392, x1: -372, z0: -40, z1: -12 },
  hangar: { x: -385, z: -128, w: 24, d: 18, h: 7.5 },
  // Service pad: the aircraft parks here heading east, left side to the tanks.
  pad: { x: -352, z: -64, heading: Math.PI / 2, radius: 7 },
  // Where the aircraft not in use waits, on the west apron clear of the taxi
  // route from the pad to the strip.
  parking: { x: -424, z: -52, heading: Math.PI / 2 },
  // Service equipment sits behind/left of the parked aircraft, clear of the prop.
  fuelTank: { x: -358, z: -84 },
  mixTank: { x: -366, z: -74 },
  reservoirs: [{ x: -378, z: -80 }, { x: -378, z: -70 }],
  crewPost: { x: -350, z: -90 }, // shaded bench where the badeco waits
  pickup: { x: -326, z: -76, heading: -0.4 },
  truck: { x: -420, z: -86, heading: 0.0 },
  windsocks: [{ x: -330, z: 26 }, { x: 360, z: -26 }],
};

// Crop presets: canopy height at full growth, row spacing, look.
export const CROPS = {
  soy: { height: 0.82, rowSpacing: 0.5, label: 'Soybean' },
  corn: { height: 2.45, rowSpacing: 0.8, label: 'Corn' },
  cotton: { height: 1.2, rowSpacing: 0.9, label: 'Cotton' },
  stubble: { height: 0.18, rowSpacing: 0.5, label: 'Stubble' },
  fallow: { height: 0, rowSpacing: 0.9, label: 'Fallow' },
  pasture: { height: 0, rowSpacing: 0, label: 'Pasture' },
};

let fid = 0;
const field = (name, crop, x0, x1, z0, z1, growth = 1, rowAxis = 'x', extra = {}) => ({
  id: fid++, name, crop, x0, x1, z0, z1, growth, rowAxis, ...extra,
});

// Contract fields are named "talhões" (T-xx) as on a real farm map.
export const FIELDS = [
  // --- contract fields ---
  field('T-07', 'soy', 140, 780, -420, -132, 0.92, 'x', { contract: 'soy' }),
  field('T-12', 'corn', -260, 220, 300, 636, 0.95, 'x', { contract: 'corn' }),
  field('T-03A', 'cotton', 1180, 1540, -96, 96, 0.9, 'x', { contract: 'cotton' }),
  field('T-03B', 'cotton', 1760, 2120, -96, 96, 0.9, 'x', { contract: 'cotton' }),

  // --- scenery: north block ---
  field('T-01', 'soy', -1500, -620, -1320, -560, 1.0, 'z'),
  field('T-02', 'corn', -580, 100, -1320, -560, 0.35, 'x'),
  field('T-04', 'cotton', 140, 900, -1100, -560, 0.75, 'x'),
  field('T-05', 'stubble', 940, 1560, -1320, -560, 1, 'z'),
  field('T-06', 'soy', 1760, 2600, -1320, -560, 0.55, 'z'),
  field('T-08', 'fallow', 820, 1520, -420, -180, 1, 'x'),
  field('T-09', 'soy', 140, 900, -1320, -1140, 0.8, 'x'),

  // --- east block ---
  field('T-10', 'soy', 1760, 2600, -460, -180, 0.95, 'x'),
  field('T-11', 'corn', 1180, 1540, 160, 620, 0.7, 'x'),
  field('T-13', 'soy', 1760, 2600, 160, 900, 0.4, 'z'),
  field('T-14', 'fallow', 2160, 2600, -96, 120, 1, 'x'),
  field('T-15', 'cotton', 460, 1100, 280, 640, 1.0, 'x'),

  // --- south block ---
  field('T-16', 'soy', -1500, -470, 300, 680, 1.0, 'x'),
  field('T-17', 'stubble', -260, 700, 720, 1310, 1, 'x'),
  field('T-18', 'soy', 760, 1540, 720, 1310, 0.65, 'z'),
  field('T-19', 'corn', -1500, -470, 720, 1310, 1.0, 'x'),
  field('T-20', 'soy', -260, 700, 1350, 1800, 0.85, 'z'),
  field('T-22', 'cotton', -1500, -470, 1350, 1800, 0.6, 'x'),
  field('T-21', 'pasture', -1140, -570, -135, 220, 1, 'x'),
];

export const CONTRACT_FIELDS = FIELDS.filter((f) => f.contract);

// Creek polyline (north -> south), meandering between the cotton fields.
export const CREEK = {
  points: [
    [1580, -4200], [1620, -3000], [1700, -2200], [1640, -1500], [1660, -900],
    [1630, -420], [1665, -120], [1640, 140], [1680, 420], [1620, 900],
    [1680, 1500], [1600, 2300], [1660, 3200], [1600, 4200],
  ],
  width: 9,
  depth: 2.2,
  valley: 160,
  valleyDepth: 7,
};

// Forest blocks (legal reserve) and tree belts. kind: 'mata' (dense native),
// 'eucalyptus' (planted windbreak), 'riparian' (along the creek).
export const FORESTS = [
  { kind: 'mata', x0: -2500, x1: -1600, z0: -1700, z1: 300 },
  { kind: 'mata', x0: -260, x1: 220, z0: 652, z1: 688 }, // tree line along the south edge of the corn
  { kind: 'mata', x0: 2700, x1: 3700, z0: -1900, z1: -200 },
  { kind: 'mata', x0: -1300, x1: 200, z0: 1900, z1: 2700 },
  { kind: 'mata', x0: 2700, x1: 3600, z0: 400, z1: 1600 },
  { kind: 'mata', x0: -700, x1: 600, z0: -2400, z1: -1700 },
  { kind: 'mata', x0: 900, x1: 1500, z0: -2600, z1: -1800 },
  { kind: 'mata', x0: -3400, x1: -2700, z0: 700, z1: 2000 },
  // Windbreaks behind the base, out of the extended pass lines of T-07.
  { kind: 'eucalyptus', x0: -540, x1: -500, z0: -130, z1: -75 },
  { kind: 'eucalyptus', x0: -540, x1: -500, z0: -270, z1: -175 },
];

// Power line along the east side of the corn talhão: obstacle at the end of each pass.
export const POWERLINE = {
  points: [[310, 130], [310, 260], [310, 390], [310, 520], [310, 640], [330, 690], [450, 692], [570, 694], [690, 696], [810, 698], [930, 700]],
  height: 10.5,
  sag: 1.4,
};

// Main farm roads (centre polylines). Field perimeters get carreadores automatically.
export const ROADS = [
  { w: 9, pts: [[-1900, -150], [-1200, -150], [-560, -150], [-450, -130], [-445, -70]] }, // sede -> base
  { w: 8, pts: [[-445, -70], [-445, 220], [-450, 700], [-430, 1700]] },
  { w: 8, pts: [[-445, -150], [-445, -1400], [-450, -2600]] },
  { w: 8, pts: [[-560, -150], [-560, -520]] },
  { w: 8, pts: [[-300, 250], [1150, 250]] },
  { w: 7, pts: [[1150, -130], [1150, 700]] },
  { w: 7, pts: [[120, -130], [120, -1350]] },
  { w: 7, pts: [[1564, -130], [1564, 700]] },
  { w: 7, pts: [[1736, -130], [1736, 1000]] },
  { w: 7, pts: [[1150, 140], [2600, 140]] },
  { w: 7, pts: [[1150, -130], [2600, -130]] },
  { w: 7, pts: [[-1600, 250], [-300, 250]] },
  { w: 7, pts: [[-1520, -1340], [2620, -1340]] },
  { w: 7, pts: [[-1520, -540], [2620, -540]] },
  { w: 7, pts: [[-1520, 700], [1560, 700]] },
  { w: 7, pts: [[-1520, 1330], [740, 1330]] },
];

// Farm headquarters (sede) and grain storage.
export const HQ = {
  house: { x: -1260, z: -260, rot: 0.0 },
  sheds: [{ x: -1120, z: -380, rot: 0, w: 40, d: 18 }, { x: -1060, z: -380, rot: 0, w: 30, d: 16 }],
  silos: [{ x: -980, z: -300 }, { x: -980, z: -270 }, { x: -980, z: -240 }, { x: -955, z: -285 }],
  dryer: { x: -955, z: -250 },
  corral: { x: -1350, z: -360 },
};

// Fences with gates (porteiras) along the base and HQ approaches.
export const FENCES = [
  { pts: [[-560, -140], [-560, 230]], gateAt: 0.15 },
  { pts: [[-1150, -140], [-560, -140]], gateAt: 0.5 },
  { pts: [[-1150, 230], [-560, 230]], gateAt: 0.3 },
  { pts: [[-1150, -140], [-1150, 230]], gateAt: 0.7 },
  { pts: [[-455, -110], [-455, -40]], gateAt: 0.5 },
];

export function fieldAt(x, z) {
  for (const f of FIELDS) {
    if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) return f;
  }
  return null;
}

export function cropHeight(f) {
  if (!f) return 0;
  return CROPS[f.crop].height * (0.25 + 0.75 * f.growth);
}
