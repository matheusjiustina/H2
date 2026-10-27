// Farm layout — Fazenda Boa Esperança (fictional), northern Mato Grosso.
// World axes: +X east, -Z north, +Y up. Units: metres. The strip runs 09/27
// along X with the operations base at its west end.

// Detailed terrain extent: 12 x 12 km. The original 8 x 8 km farm country
// sits in the middle unchanged; the outer ring carries the farms added with
// the airstrips expansion (FARMS below).
export const WORLD_HALF = 6000;
export const FAR_HALF = 24000; // horizon ring

export const RUNWAY = { x0: -400, x1: 400, z: 0, width: 24, shoulder: 10 };

export const BASE = {
  apron: { x0: -445, x1: -315, z0: -104, z1: -38 },
  taxiway: { x0: -392, x1: -372, z0: -40, z1: -12 },
  hangar: { x: -385, z: -128, w: 24, d: 18, h: 7.5 },
  // Service pad: the aircraft parks here heading east, left side to the tanks.
  pad: { x: -352, z: -64, heading: Math.PI / 2, radius: 7 },
  // White tyres marking the service spot, a row behind the parked tail (pad
  // frame: dx along the heading, dz across): clear of every wing span, the
  // truck's loading stands off the wingtips and its lead-in ahead of them.
  padMarks: [[-12.5, -4], [-12.5, 0], [-12.5, 4]],
  // Where the aircraft not in use waits, on the west apron clear of the taxi
  // route from the pad to the strip.
  parking: { x: -424, z: -52, heading: Math.PI / 2 },
  // Second apron spot (south-west) for when the helicopter is flown and both
  // airplanes wait parked.
  parking2: { x: -424, z: -88, heading: Math.PI / 2 },
  // Third airplane spot (the 17.7 m Dromader fits it), south-east of the
  // others in front of the hangar, clear of the taxi route and the tanks;
  // used when the helicopter is flown and all three airplanes wait parked.
  parking3: { x: -404, z: -100, heading: Math.PI / 2 },
  // Fourth airplane spot (Thrush 510G, 14.5 m), between the first two and
  // east of them, west of the taxiway; used when the helicopter is flown
  // and all four airplanes wait parked.
  parking4: { x: -404, z: -70, heading: Math.PI / 2 },
  // Helicopter pad (R44): gravel pad with a painted H at the east end of the
  // apron, clear of the taxi route, the service pad and the fuel slab.
  helipad: { x: -323, z: -48, heading: Math.PI / 2, radius: 6 },
  // Second helicopter pad (Bell 206): on the grass east of the apron, 23 m
  // from the first (both rotor discs and the truck's stands clear).
  helipad2: { x: -300, z: -48, heading: Math.PI / 2, radius: 6 },
  // Service equipment sits behind/left of the parked aircraft, clear of the prop.
  fuelTank: { x: -358, z: -84 },
  mixTank: { x: -366, z: -74 },
  reservoirs: [{ x: -378, z: -80 }, { x: -378, z: -70 }],
  crewPost: { x: -350, z: -90 }, // shaded bench where the badeco waits
  pickup: { x: -326, z: -76, heading: -0.4 },
  // Bay of the driving service truck (rear-axle position), by the crew post.
  truck: { x: -331, z: -98, heading: -Math.PI / 2 },
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

// --- outer farmland: rolling fields (level 2) and hilly fields (level 3) ---
// Terrain class of each field: 1 flat farmland (all the fields above), 2
// rolling, 3 hilly. Irregular outlines are built from two staggered
// talhões that share one pass pattern (like the cotton pair above).
FIELDS.push(
  // LEVEL 2 — Campos do Sul (south-east) and Chapada Oeste (north-west)
  field('T-31A', 'soy', 620, 1180, 2810, 3070, 0.9, 'x', { contract: 'roll-soy', level: 2 }),
  field('T-31B', 'soy', 620, 880, 3070, 3260, 0.9, 'x', { contract: 'roll-soy', level: 2 }),
  field('T-32A', 'corn', 2200, 2740, 3110, 3370, 0.95, 'x', { contract: 'roll-corn', level: 2 }),
  field('T-32B', 'corn', 2200, 2440, 2870, 3110, 0.95, 'x', { contract: 'roll-corn', level: 2 }),
  field('T-33A', 'cotton', -2480, -1940, -2640, -2380, 0.9, 'x', { contract: 'roll-cotton', level: 2 }),
  field('T-33B', 'cotton', -1940, -1700, -2640, -2430, 0.9, 'x', { contract: 'roll-cotton', level: 2 }),
  field('T-34', 'soy', 1900, 2440, 2400, 2680, 0.8, 'x', { level: 2 }),
  field('T-35', 'fallow', 1100, 1500, 2400, 2650, 1, 'x', { level: 2 }),
  field('T-36', 'pasture', -3400, -2900, -3300, -3000, 1, 'x', { level: 2 }),
  // LEVEL 3 — Serra do Norte (north-east hills)
  field('T-41A', 'soy', 2540, 3020, -2740, -2480, 0.9, 'x', { contract: 'ridge-soy', level: 3 }),
  field('T-41B', 'soy', 2780, 3020, -2890, -2740, 0.9, 'x', { contract: 'ridge-soy', level: 3 }),
  field('T-42A', 'cotton', 2250, 2730, -3220, -2960, 0.9, 'x', { contract: 'ridge-cotton', level: 3 }),
  field('T-42B', 'cotton', 2250, 2490, -2960, -2810, 0.9, 'x', { contract: 'ridge-cotton', level: 3 }),
  field('T-43A', 'corn', 900, 1380, -2900, -2640, 0.95, 'x', { contract: 'ridge-corn', level: 3 }),
  field('T-43B', 'corn', 1140, 1380, -3040, -2900, 0.95, 'x', { contract: 'ridge-corn', level: 3 }),
  field('T-44', 'pasture', 2780, 3280, -3300, -2900, 1, 'x', { level: 3 }),
);
// --- secondary farms (src/world/layout.js FARMS): their own talhões ---
// Santa Rita (far west, flat chapada): big rectangular soy and cotton.
// Vale do Rio (south-east, rolling river valley): corn on the swells.
// Serra Azul (south-west, hills): smaller talhões on broken ground.
FIELDS.push(
  field('SR-01', 'soy', -3820, -2980, -1760, -1260, 0.9, 'x', { contract: 'sr-soy', farm: 'santarita', level: 1 }),
  field('SR-02', 'cotton', -3820, -3060, -830, -580, 0.85, 'x', { contract: 'sr-cotton', farm: 'santarita', level: 1 }),
  field('SR-03', 'corn', -2900, -2620, -1760, -1300, 0.6, 'z', { farm: 'santarita', level: 1 }),
  field('VR-01', 'corn', 2880, 3360, 2600, 2860, 0.95, 'x', { contract: 'vr-corn', farm: 'valedorio', level: 2 }),
  field('VR-02', 'soy', 2380, 3000, 1700, 1980, 0.85, 'x', { contract: 'vr-soy', farm: 'valedorio', level: 2 }),
  field('VR-03', 'stubble', 3480, 3860, 1900, 2320, 1, 'z', { farm: 'valedorio', level: 2 }),
  field('SA-01', 'corn', -2280, -1880, 3480, 3800, 0.95, 'x', { contract: 'sa-corn', farm: 'serraazul', level: 3 }),
  field('SA-02A', 'soy', -2000, -1640, 2960, 3180, 0.9, 'x', { contract: 'sa-soy', farm: 'serraazul', level: 3 }),
  field('SA-02B', 'soy', -2000, -1820, 3180, 3300, 0.9, 'x', { contract: 'sa-soy', farm: 'serraazul', level: 3 }),
  field('SA-03', 'pasture', -3380, -3020, 3700, 3940, 1, 'x', { farm: 'serraazul', level: 3 }),
);
// --- airstrips expansion: the eight outer farms' talhões ------------------
FIELDS.push(
  // Fazenda Horizonte (north, flat cerrado farmland): big blocks beside the strip.
  field('HZ-01', 'soy', -200, 760, -5150, -4830, 0.9, 'x', { contract: 'hz-soy', farm: 'horizonte', level: 1 }),
  field('HZ-02', 'corn', 840, 1400, -5140, -4840, 0.95, 'x', { contract: 'hz-corn', farm: 'horizonte', level: 1 }),
  field('HZ-03', 'soy', 150, 1100, -5760, -5420, 0.7, 'x', { farm: 'horizonte', level: 1 }),
  field('HZ-04', 'cotton', -900, -200, -5750, -5420, 0.8, 'x', { farm: 'horizonte', level: 1 }),
  // Fazenda Dois Lagos (north-west, gentle swells, two açudes).
  field('DL-01', 'soy', -5050, -4500, -4015, -3775, 0.9, 'x', { contract: 'dl-soy', farm: 'doislagos', level: 2 }),
  field('DL-02', 'corn', -4310, -3900, -4640, -4380, 0.9, 'x', { contract: 'dl-corn', farm: 'doislagos', level: 2 }),
  field('DL-03', 'soy', -5600, -5150, -4200, -3900, 0.6, 'x', { farm: 'doislagos', level: 2 }),
  // Fazenda Serra do Cedro (north-east hills): stepped soybean on the slope, corn beyond the east end.
  field('SC-01A', 'soy', 4300, 4760, -4520, -4300, 0.9, 'x', { contract: 'sc-soy', farm: 'serradocedro', level: 3 }),
  field('SC-01B', 'soy', 4300, 4560, -4300, -4180, 0.9, 'x', { contract: 'sc-soy', farm: 'serradocedro', level: 3 }),
  field('SC-02', 'corn', 4980, 5400, -4900, -4640, 0.95, 'x', { contract: 'sc-corn', farm: 'serradocedro', level: 3 }),
  // Fazenda Mata Alta (far west, clearing in dense forest).
  field('MA-01', 'soy', -4700, -4380, 780, 1060, 0.9, 'x', { contract: 'ma-soy', farm: 'mataalta', level: 1 }),
  field('MA-02', 'corn', -5250, -4950, 420, 640, 0.95, 'x', { contract: 'ma-corn', farm: 'mataalta', level: 1 }),
  // Fazenda Ipê Amarelo (east, small cerrado property).
  field('IA-01', 'corn', 5130, 5520, -820, -500, 0.95, 'x', { contract: 'ia-corn', farm: 'ipeamarelo', level: 1 }),
  field('IA-02', 'soy', 4620, 4980, -555, -380, 0.8, 'x', { farm: 'ipeamarelo', level: 1 }),
  // Fazenda Vale Verde (south-east valley): contour-farmed slopes either side.
  field('VV-01', 'soy', 4650, 5100, 4800, 5050, 0.9, 'x', { contract: 'vv-soy', farm: 'valeverde', level: 2 }),
  field('VV-02', 'corn', 4700, 5150, 3970, 4170, 0.95, 'x', { contract: 'vv-corn', farm: 'valeverde', level: 2 }),
  // Fazenda Terra Vermelha (south, big Mato Grosso farm).
  field('TV-01', 'cotton', -1000, -260, 5360, 5780, 0.9, 'x', { contract: 'tv-cotton', farm: 'terravermelha', level: 1 }),
  field('TV-02', 'soy', -90, 760, 4950, 5560, 0.9, 'z', { contract: 'tv-soy', farm: 'terravermelha', level: 1 }),
  field('TV-03', 'soy', -1700, -940, 4880, 5250, 0.8, 'x', { farm: 'terravermelha', level: 1 }),
  field('TV-04', 'cotton', -1700, -1080, 5320, 5800, 0.7, 'x', { farm: 'terravermelha', level: 1 }),
  // Fazenda Chapada dos Ventos (south-west, up on the chapada).
  field('CV-01', 'soy', -4300, -3850, 5060, 5320, 0.9, 'x', { contract: 'cv-soy', farm: 'chapada', level: 1 }),
  field('CV-02', 'pasture', -4880, -4420, 5120, 5380, 1, 'x', { farm: 'chapada', level: 1 }),
);
for (const f of FIELDS) f.level ??= 1;

export const CONTRACT_FIELDS = FIELDS.filter((f) => f.contract);

// Creek polyline (north -> south), meandering between the cotton fields.
export const CREEK = {
  // (It crosses the outer ring to the edge of the map at both ends.)
  points: [
    [1490, -6100], [1545, -5100], [1580, -4200], [1620, -3000], [1700, -2200], [1640, -1500], [1660, -900],
    [1630, -420], [1665, -120], [1640, 140], [1680, 420], [1620, 900],
    [1680, 1500], [1600, 2300], [1660, 3200], [1600, 4200], [1650, 5100], [1590, 6100],
  ],
  width: 9,
  depth: 2.2,
  valley: 160,
  valleyDepth: 7,
};

// Other water: a tributary stream through the Vale do Rio valley into the
// creek, and small farm reservoirs (açudes) / a valley lake. Pond outlines
// are irregular (radius modulated by two harmonics, phase per pond); the
// water level is set by terrainData from the lowest point of each rim.
export const WATER = {
  streams: [
    {
      name: 'Córrego do Vale', width: 6, depth: 1.6, valley: 70, valleyDepth: 2.6,
      points: [[3990, 2490], [3780, 2460], [3570, 2425], [3420, 2470], [3200, 2505], [2960, 2480], [2720, 2430], [2480, 2350], [2250, 2335], [2000, 2330], [1790, 2310], [1615, 2295]],
    },
    {
      // Small creek along the floor of the Vale Verde valley, south of the strip.
      name: 'Córrego Vale Verde', ring: true, width: 5, depth: 1.3, valley: 55, valleyDepth: 1.8,
      points: [[5900, 4790], [5700, 4770], [5500, 4730], [5300, 4745], [5100, 4720], [4900, 4740], [4700, 4715], [4500, 4730], [4300, 4760], [4150, 4810]],
    },
  ],
  ponds: [
    { name: 'Açude Santa Rita', x: -2760, z: -640, r: 60, depth: 2.4, ph: 0.7 },
    { name: 'Lagoa da Serra', x: -3050, z: 2760, r: 95, depth: 3.2, ph: 2.1 },
    { name: 'Açude da sede', x: -800, z: -420, r: 38, depth: 2.0, ph: 4.0 },
    { name: 'Açude do sul', x: 900, z: 1550, r: 50, depth: 2.2, ph: 5.3 },
    // The two açudes of Fazenda Dois Lagos, beside the strip and off its east end.
    { name: 'Lago de Cima', ring: true, x: -4760, z: -4078, r: 36, depth: 2.0, ph: 1.4 },
    { name: 'Lago de Baixo', ring: true, x: -4130, z: -4245, r: 34, depth: 1.8, ph: 3.3 },
    // Small dam where the Vale Verde creek leaves the valley.
    { name: 'Represa do Vale Verde', ring: true, x: 4070, z: 4850, r: 62, depth: 2.6, ph: 0.4 },
  ],
};
// Radius of a pond's shoreline towards angle a.
export const pondRadius = (p, a) => p.r * (1 + 0.16 * Math.sin(2 * a + p.ph) + 0.09 * Math.sin(3 * a + p.ph * 1.7));

// Forest blocks (legal reserve) and tree belts. kind: 'mata' (dense native),
// 'eucalyptus' (planted windbreak), 'riparian' (along the creek). ring: a
// block of the outer ring (airstrips expansion).
export const FORESTS = [
  { kind: 'mata', x0: -2500, x1: -1600, z0: -1700, z1: 300 },
  { kind: 'mata', x0: -260, x1: 220, z0: 652, z1: 688 }, // tree line along the south edge of the corn
  { kind: 'mata', x0: 2700, x1: 3700, z0: -1900, z1: -200 },
  { kind: 'mata', x0: -1300, x1: 200, z0: 1900, z1: 2700 },
  { kind: 'mata', x0: 2700, x1: 3600, z0: 400, z1: 1600 },
  { kind: 'mata', x0: -700, x1: 600, z0: -2400, z1: -1700 },
  { kind: 'mata', x0: 900, x1: 1500, z0: -2600, z1: -1800 },
  { kind: 'mata', x0: -3400, x1: -2700, z0: 700, z1: 2000 },
  // Fazenda Mata Alta: the strip and its two talhões are clearings in tall
  // native forest; the blocks' edges are staggered so the clearing reads
  // irregular. The strip has ~40 m of clear ground each side; each talhão is
  // walled in along its passes (trees ~15 m off its long sides) and has
  // 150–230 m of open ground at both ends to drop in and pull up over the trees.
  { kind: 'mata', ring: true, x0: -5950, x1: -5650, z0: 250, z1: 1650 },
  { kind: 'mata', ring: true, x0: -5650, x1: -5400, z0: 250, z1: 856 },
  { kind: 'mata', ring: true, x0: -5650, x1: -5100, z0: 944, z1: 1650 },
  { kind: 'mata', ring: true, x0: -5268, x1: -4935, z0: 250, z1: 405 },
  { kind: 'mata', ring: true, x0: -5170, x1: -4935, z0: 655, z1: 861 },
  { kind: 'mata', ring: true, x0: -4800, x1: -4715, z0: 250, z1: 765 },
  { kind: 'mata', ring: true, x0: -4715, x1: -4250, z0: 250, z1: 765 },
  { kind: 'mata', ring: true, x0: -5100, x1: -4935, z0: 938, z1: 1650 },
  { kind: 'mata', ring: true, x0: -4935, x1: -4715, z0: 1075, z1: 1650 },
  { kind: 'mata', ring: true, x0: -4715, x1: -4250, z0: 1075, z1: 1650 },
  { kind: 'mata', ring: true, x0: -4180, x1: -4050, z0: 765, z1: 1075 },
  { kind: 'mata', ring: true, x0: -4250, x1: -4050, z0: 250, z1: 765 },
  { kind: 'mata', ring: true, x0: -4250, x1: -4050, z0: 1075, z1: 1650 },
  // Gallery forest along the Vale Verde creek's lower course and the slopes.
  { kind: 'mata', ring: true, x0: 5300, x1: 5900, z0: 5080, z1: 5500 },
  { kind: 'mata', ring: true, x0: 4150, x1: 4520, z0: 3820, z1: 4200 },
  // Native reserve north-east of Serra do Cedro and east of Ipê Amarelo.
  { kind: 'mata', ring: true, x0: 5450, x1: 5900, z0: -5300, z1: -4500 },
  { kind: 'mata', ring: true, x0: 5600, x1: 5900, z0: -1200, z1: 0 },
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

// Access roads of the outer zones (rolling and hilly land): least-slope
// routes over the terrain, smoothed into curves. They are drawn as draped
// ribbons (src/world/roads.js), not in the ground shader.
ROADS.push(
  // north
  { w: 7, mesh: true, pts: [[2600, -1350], [2600, -1389], [2600, -1427], [2600, -1464], [2600, -1502], [2600, -1539], [2600, -1577], [2600, -1614], [2600, -1652], [2600, -1689], [2600, -1727], [2600, -1764], [2593, -1802], [2571, -1830], [2552, -1861], [2550, -1898], [2550, -1936], [2550, -1973], [2550, -2011], [2541, -2046], [2505, -2050], [2467, -2050], [2430, -2050], [2392, -2050], [2355, -2054], [2323, -2077], [2303, -2108], [2300, -2145], [2300, -2183], [2300, -2220], [2300, -2258], [2300, -2295], [2300, -2333], [2300, -2370], [2300, -2408], [2300, -2445], [2300, -2483], [2300, -2520], [2300, -2558], [2304, -2595], [2327, -2627], [2350, -2650]] },
  // northE
  { w: 6, mesh: true, pts: [[2550, -2050], [2577, -2077], [2605, -2105], [2633, -2133], [2661, -2161], [2689, -2187], [2723, -2200], [2761, -2200], [2798, -2205], [2830, -2230], [2858, -2258], [2886, -2285], [2920, -2300], [2958, -2300], [2995, -2300], [3033, -2300], [3070, -2300], [3100, -2300]] },
  // northW
  { w: 6, mesh: true, pts: [[2350, -2650], [2323, -2677], [2295, -2705], [2267, -2733], [2239, -2761], [2213, -2789], [2200, -2823], [2200, -2861], [2200, -2898], [2200, -2936], [2200, -2973], [2200, -3011], [2200, -3048], [2200, -3086], [2200, -3123], [2200, -3161], [2200, -3198], [2200, -3236], [2200, -3273], [2200, -3311], [2200, -3347], [2200, -3350]] },
  // south
  { w: 7, mesh: true, pts: [[750, 1350], [750, 1389], [750, 1427], [750, 1464], [750, 1502], [750, 1539], [750, 1577], [750, 1614], [750, 1652], [750, 1689], [750, 1727], [750, 1764], [750, 1802], [750, 1839], [750, 1877], [750, 1914], [750, 1952], [750, 1989], [750, 2027], [750, 2064], [750, 2102], [750, 2139], [750, 2177], [750, 2214], [750, 2252], [750, 2289], [750, 2327], [750, 2364], [750, 2402], [750, 2439], [750, 2477], [750, 2514], [750, 2552], [748, 2589], [729, 2620], [707, 2648], [700, 2685], [700, 2700]] },
  // southE
  { w: 6, mesh: true, pts: [[700, 2700], [739, 2700], [777, 2700], [814, 2700], [852, 2700], [889, 2702], [920, 2721], [948, 2743], [986, 2750], [1023, 2750], [1061, 2750], [1098, 2750], [1136, 2750], [1173, 2750], [1211, 2750], [1248, 2750], [1286, 2750], [1323, 2750], [1361, 2750], [1398, 2750], [1436, 2750], [1473, 2750], [1511, 2750], [1548, 2750], [1586, 2750], [1623, 2750], [1658, 2761], [1686, 2785], [1720, 2800], [1758, 2800], [1795, 2800], [1833, 2800], [1870, 2800], [1908, 2800], [1945, 2800], [1983, 2800], [2020, 2800], [2058, 2800], [2095, 2800], [2132, 2800], [2150, 2800]] },
  // west
  { w: 7, mesh: true, pts: [[-1500, -1350], [-1500, -1389], [-1500, -1427], [-1500, -1464], [-1500, -1502], [-1500, -1539], [-1500, -1577], [-1513, -1611], [-1537, -1639], [-1550, -1673], [-1561, -1708], [-1586, -1736], [-1614, -1764], [-1642, -1792], [-1670, -1820], [-1693, -1848], [-1700, -1886], [-1700, -1923], [-1700, -1961], [-1705, -1998], [-1729, -2030], [-1748, -2061], [-1750, -2098], [-1750, -2136], [-1750, -2173], [-1761, -2208], [-1786, -2236], [-1814, -2264], [-1841, -2291], [-1850, -2300]] },
  // northW2: from the end of the farm road north to the T-43 hill
  { w: 6, mesh: true, pts: [[-450, -2600], [-411, -2600], [-373, -2600], [-339, -2613], [-311, -2637], [-277, -2650], [-239, -2650], [-202, -2650], [-164, -2650], [-127, -2650], [-89, -2650], [-52, -2650], [-14, -2650], [23, -2650], [61, -2650], [98, -2650], [136, -2650], [173, -2650], [211, -2650], [248, -2650], [286, -2650], [323, -2650], [361, -2650], [398, -2650], [436, -2650], [473, -2650], [511, -2650], [548, -2650], [586, -2650], [623, -2650], [661, -2650], [698, -2650], [736, -2651], [770, -2671], [798, -2698], [827, -2727], [850, -2750]] },
);

// Access roads of the outer-ring farms (airstrips expansion), drawn the same
// way: from each farm yard out to the farm network or off the map, resampled
// every ~40 m (the ribbon drapes on the terrain). Mata Alta has none: the
// clearing is reached by air.
function track(w, ...way) {
  const pts = [way[0]];
  for (let i = 1; i < way.length; i++) {
    const [ax, az] = way[i - 1], [bx, bz] = way[i];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 40));
    for (let k = 1; k <= n; k++) pts.push([Math.round(ax + ((bx - ax) * k) / n), Math.round(az + ((bz - az) * k) / n)]);
  }
  return { w, mesh: true, ring: true, pts };
}
ROADS.push(
  // Horizonte: south to the end of the main farm's north road.
  track(7, [-80, -5292], [-260, -5210], [-262, -4800], [-400, -4200], [-452, -3400], [-450, -2600]),
  // Dois Lagos: west, off the map.
  track(6, [-5050, -4372], [-5140, -4430], [-5520, -4600], [-5980, -4690]),
  // Serra do Cedro: north over the shoulder of the hill.
  track(6, [4250, -4675], [4215, -4760], [4150, -5120], [4110, -5980]),
  // Ipê Amarelo: north past the ipês, then east.
  track(6, [4552, -672], [4560, -770], [4700, -1000], [5100, -1300], [5980, -1360]),
  // Vale Verde: west along the valley side, gaining height, then north and east.
  track(6, [4552, 4428], [4430, 4385], [4200, 4262], [4095, 4150], [4080, 3800], [4100, 3300], [5980, 3250]),
  // Terra Vermelha: north to the main farm's south road.
  track(7, [-862, 5182], [-700, 4880], [-300, 4500], [300, 3900], [520, 3300], [560, 3000], [590, 2760], [700, 2700]),
  // Chapada dos Ventos: down the north escarpment, then west.
  track(6, [-4962, 4922], [-5200, 4600], [-5520, 4260], [-5980, 4100]),
);

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
  // Pasture fences in the rolling and hilly land: every post stands on the
  // terrain, so the wires follow the swells.
  ...pasture(2780, 3280, -3300, -2900, 's', 0.35), // T-44
  ...pasture(-3400, -2900, -3300, -3000, 'e', 0.6), // T-36
  ...pasture(-4880, -4420, 5120, 5380, 'w', 0.5), // CV-02 (Chapada dos Ventos)
];

// Four fence sides 3 m inside a pasture, with the gate on one side.
function pasture(x0, x1, z0, z1, gateSide, gateAt) {
  x0 += 3; x1 -= 3; z0 += 3; z1 -= 3;
  const sides = { n: [[x0, z0], [x1, z0]], e: [[x1, z0], [x1, z1]], s: [[x1, z1], [x0, z1]], w: [[x0, z1], [x0, z0]] };
  return Object.entries(sides).map(([k, pts]) => (k === gateSide ? { pts, gateAt } : { pts }));
}

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

// ---------------------------------------------------------------------------
// Secondary farms: each has its own strip, a small service area (a copy of the
// base's service layout moved by dx, dz; level y0 set by terrainData), a local
// service truck and exclusive contracts taken at the hangar office computer.
// Strips run 09/27 like the main one, the apron off the west end.
//   surface: 0 laterite (main), 1 red earth, 2 mown grass, 3 gravel.
//   grade: rise of the strip per metre towards the east (west end level).
export const FARMS = [
  {
    id: 'santarita', name: 'Fazenda Santa Rita', short: 'Santa Rita', dx: -3000, dz: -1000,
    len: 640, width: 22, surface: 1, grade: 0, difficulty: 1, color: '#d8a24a',
    crops: ['soy', 'cotton'], weather: 'dry',
  },
  {
    id: 'valedorio', name: 'Fazenda Vale do Rio', short: 'Vale do Rio', dx: 3200, dz: 2200,
    len: 480, width: 18, surface: 2, grade: 0.011, difficulty: 2, color: '#5fb0d8',
    crops: ['corn', 'soy'], weather: 'humid',
  },
  {
    id: 'serraazul', name: 'Sítio Serra Azul', short: 'Serra Azul', dx: -2500, dz: 3600,
    len: 430, width: 15, surface: 3, grade: 0, difficulty: 3, color: '#9a8cd8',
    crops: ['corn', 'soy'], weather: 'mist',
  },
  // --- airstrips expansion: eight farms in the outer ring --------------------
  // Each strip has its own identity (length, width, grade, cross slope,
  // surface, markers, surroundings); difficulty 1-5 sets the pay.
  //   bank: cross slope of the strip, rise per metre towards the south, from
  //     100 m past the threshold on (the service area stays level).
  //   ring: an outer-ring farm (its platform level is fitted along the grade).
//   blend: metres over which the strip platform blends into the land.
  //   clear: half width kept clear of tall trees along the strip (m).
  //   tight: the talhões are clearings in the forest (no cleared run-in lanes).
  //   wind: local wind factor { mean, gust } (exposed plateau).
  //   aircraft: the aircraft cleared for the strip (default: the whole fleet).
  //   marks: strip markers — tyres, stakes, stones, ends (threshold rows only).
  //   shed: steel (default), wood (rustic) or big.
  //   props: farm scenery [kind, x, z, rot] in the base's own frame (the site
  //     is the base layout moved by dx, dz), clear of the service truck's yard.
  {
    id: 'horizonte', name: 'Fazenda Horizonte', short: 'Horizonte', dx: 400, dz: -5200, ring: true,
    len: 720, width: 24, surface: 1, grade: 0, difficulty: 1, color: '#f0c419',
    crops: ['soy', 'corn'], weather: 'dry', marks: 'tyres', shed: 'big',
    props: [['silo', -330, -232], ['silo', -316, -232], ['silo', -302, -232], ['silo', -323, -219], ['dryer', -288, -226],
      ['bigShed', -240, -184, 0], ['house', -500, -215, 0.1], ['tower', -462, -178]],
  },
  {
    id: 'doislagos', name: 'Fazenda Dois Lagos', short: 'Dois Lagos', dx: -4600, dz: -4300, ring: true,
    len: 560, width: 16, surface: 1, grade: -0.012, difficulty: 3, color: '#3fa7d6', blend: 190,
    crops: ['soy', 'corn'], weather: 'humid', marks: 'tyres',
    props: [['house', -50, 262, Math.PI], ['corral', -205, 250], ['pier', -120, 150, 0], ['boat', -112, 158, 0.4]],
  },
  {
    id: 'serradocedro', name: 'Fazenda Serra do Cedro', short: 'Serra do Cedro', dx: 4700, dz: -4600, ring: true,
    len: 540, width: 16, surface: 3, grade: 0.036, bank: 0.012, difficulty: 4, color: '#c96f3b',
    crops: ['soy', 'corn'], weather: 'mist', marks: 'stakes', aircraft: ['ipanema', 'at502', 'r44', 'thrush', 'b206'],
    props: [['boulder', -150, 31], ['boulder', -40, -33], ['boulder', 30, 38], ['boulder', 95, -36], ['tower', -470, -150], ['house', -520, -250, 0.2]],
  },
  {
    id: 'mataalta', name: 'Fazenda Mata Alta', short: 'Mata Alta', dx: -4900, dz: 900, ring: true,
    len: 440, width: 14, surface: 4, grade: -0.01, difficulty: 5, color: '#2e8b57', clear: 34, tight: true,
    crops: ['soy', 'corn'], weather: 'humid', marks: 'ends', shed: 'wood', aircraft: ['ipanema', 'r44', 'b206'],
    props: [['shack', -462, -138, 0.05], ['drums', -298, -122]],
  },
  {
    id: 'ipeamarelo', name: 'Sítio Ipê Amarelo', short: 'Ipê Amarelo', dx: 5000, dz: -600, ring: true,
    len: 400, width: 13, surface: 1, grade: -0.02, difficulty: 3, color: '#e8b923',
    crops: ['corn', 'soy'], weather: 'dry', marks: 'stones', shed: 'wood', aircraft: ['ipanema', 'r44', 'b206'],
    props: [['house', -478, -158, 0], ['corral', -540, -250]],
  },
  {
    id: 'valeverde', name: 'Fazenda Vale Verde', short: 'Vale Verde', dx: 5000, dz: 4500, ring: true,
    len: 500, width: 16, surface: 2, grade: 0.01, bank: -0.02, difficulty: 4, color: '#6cc04a',
    crops: ['soy', 'corn'], weather: 'humid', marks: 'tyres', aircraft: ['ipanema', 'at502', 'r44', 'thrush', 'b206'],
    props: [['house', -480, -200, 0], ['tower', -440, -172], ['corral', -250, 95]],
  },
  {
    id: 'terravermelha', name: 'Fazenda Terra Vermelha', short: 'Terra Vermelha', dx: -400, dz: 5300, ring: true,
    len: 580, width: 20, surface: 1, grade: 0, bank: 0.004, difficulty: 3, color: '#d1495b', shed: 'big',
    crops: ['cotton', 'soy'], weather: 'dry', marks: 'tyres',
    props: [['silo', -250, -250], ['silo', -236, -250], ['silo', -222, -250], ['silo', -208, -250], ['silo', -243, -237], ['silo', -229, -237],
      ['dryer', -190, -244], ['bigShed', -300, -212, 0], ['bigShed', -140, -212, 0], ['house', -520, -230, 0]],
  },
  {
    id: 'chapada', name: 'Fazenda Chapada dos Ventos', short: 'Chapada', dx: -4500, dz: 5000, ring: true,
    len: 520, width: 18, surface: 5, grade: 0, bank: 0.006, difficulty: 5, color: '#9b72cf',
    crops: ['soy'], weather: 'windy', marks: 'stones', wind: { mean: 1.45, gust: 2.2 }, aircraft: ['ipanema', 'at502', 'r44', 'thrush', 'b206'],
    props: [['house', -490, -210, 0], ['mast', 300, -480], ['turbine', -800, 560], ['turbine', -560, 660], ['turbine', -320, 730]],
  },
];

const mv = (p, dx, dz) => ({ ...p, x: p.x + dx, z: p.z + dz });
const mvr = (r, dx, dz) => ({ x0: r.x0 + dx, x1: r.x1 + dx, z0: r.z0 + dz, z1: r.z1 + dz });

function makeSite(f) {
  const { dx, dz } = f;
  const x0 = RUNWAY.x0 + dx;
  return {
    id: f.id, farm: f, main: false, dx, dz, y0: 0,
    runway: { x0, x1: x0 + f.len, z: dz, width: f.width, shoulder: 6, surface: f.surface, grade: f.grade, bank: f.bank ?? 0 },
    apron: mvr(BASE.apron, dx, dz),
    taxiway: { ...mvr(BASE.taxiway, dx, dz), z1: dz - f.width / 2 },
    hangar: mv(BASE.hangar, dx, dz),
    pad: mv(BASE.pad, dx, dz), parking: mv(BASE.parking, dx, dz), parking2: mv(BASE.parking2, dx, dz), parking3: mv(BASE.parking3, dx, dz), parking4: mv(BASE.parking4, dx, dz),
    helipad: mv(BASE.helipad, dx, dz), helipad2: mv(BASE.helipad2, dx, dz),
    fuelTank: mv(BASE.fuelTank, dx, dz), mixTank: mv(BASE.mixTank, dx, dz),
    reservoirs: BASE.reservoirs.map((r) => mv(r, dx, dz)),
    crewPost: mv(BASE.crewPost, dx, dz), pickup: mv(BASE.pickup, dx, dz), truck: mv(BASE.truck, dx, dz),
    windsocks: [{ x: x0 + 70, z: dz + f.width / 2 + 14 }, { x: x0 + f.len - 40, z: dz - f.width / 2 - 14 },
      ...(f.wind ? [{ x: x0 + f.len / 2, z: dz + f.width / 2 + 16 }] : [])],
  };
}

export const MAIN_SITE = {
  id: 'main', farm: null, main: true, dx: 0, dz: 0, y0: 0,
  runway: { ...RUNWAY, surface: 0, grade: 0 }, ...BASE,
};
export const SITES = [MAIN_SITE, ...FARMS.map(makeSite)];
export const siteById = (id) => SITES.find((s) => s.id === id) ?? MAIN_SITE;
export const FARM_SITES = SITES.filter((s) => !s.main);

// Nearest site to a point and its distance (m).
export function nearestSite(x, z) {
  let best = MAIN_SITE, bd = 1e9;
  for (const s of SITES) {
    const d = Math.hypot(x - s.pad.x, z - s.pad.z);
    if (d < bd) { bd = d; best = s; }
  }
  return { site: best, dist: bd };
}

// Strip level at (x, z): flat at y0 past the apron (first 100 m), then rising
// east by the grade and tilted across by the bank (the bank eases in over
// the 80 m after the level stretch).
export function stripLevel(site, x, z = site.runway?.z ?? 0) {
  const r = site.runway;
  const along = Math.max(0, Math.min(x, r.x1) - r.x0 - 100);
  let y = site.y0 + (r.grade || 0) * along;
  if (r.bank) {
    const k = Math.min(1, along / 80);
    y += r.bank * (z - r.z) * k * k * (3 - 2 * k);
  }
  return y;
}

// Aircraft cleared for a farm's strip (the main base takes the whole fleet).
export const stripAllows = (farm, aircraftId) => !farm?.aircraft || farm.aircraft.includes(aircraftId);

// Local wind factors at a point: { mean, gust } (exposed farms, 1 elsewhere).
// (Returns a shared object: read it before the next call.)
const WINDY = FARMS.filter((f) => f.wind);
const _wf = { mean: 1, gust: 1 };
export function windFactorAt(x, z) {
  let mean = 1, gust = 1;
  for (const f of WINDY) {
    const cx = RUNWAY.x0 + f.dx + f.len / 2, cz = f.dz;
    const d = Math.hypot(x - cx, z - cz);
    if (d > 2200) continue;
    const k = d < 1200 ? 1 : 1 - (d - 1200) / 1000;
    mean += (f.wind.mean - 1) * k; gust += (f.wind.gust - 1) * k;
  }
  _wf.mean = mean; _wf.gust = gust;
  return _wf;
}

// Service pad of a site for an aircraft kind (a helipad for a helicopter:
// padKey names which, 'helipad' by default).
export const padOf = (site, kind, padKey = 'helipad') => (kind === 'heli' ? site[padKey] ?? site.helipad : site.pad);
