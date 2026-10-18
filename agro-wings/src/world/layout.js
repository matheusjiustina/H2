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
  // Second apron spot (south-west) for when the helicopter is flown and both
  // airplanes wait parked.
  parking2: { x: -424, z: -88, heading: Math.PI / 2 },
  // Helicopter pad (R44): gravel pad with a painted H at the east end of the
  // apron, clear of the taxi route, the service pad and the fuel slab.
  helipad: { x: -323, z: -48, heading: Math.PI / 2, radius: 6 },
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
for (const f of FIELDS) f.level ??= 1;

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
