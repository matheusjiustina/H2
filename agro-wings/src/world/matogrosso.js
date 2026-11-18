// MATO GROSSO OPERATIONS — premium map expansion 04 (a separate map, chosen at
// load: src/world/activeMap.js). The agricultural north of Mato Grosso, as
// seen from the air: big talhões of irregular outline cut out of the native
// forest (curved where the trees were left, straight where the machines
// opened them), forest corridors and reserves between them, a wide river
// with its gallery forest, centre-pivot circles, red-earth roads, isolated
// castanheiras standing in the open, and dirt strips walled by forest.
// Everything the map is made of lives here as data and pure functions (no
// three.js): layout.js, expansion.js, terrainData.js, vegetation.js and the
// contract modules take their data from this module when it is the active
// map; no other map reads it.
//
// Map refinement 2.0 (2026-11): compacted from 6.8 × 6.8 km playable
// (8 × 8 km of terrain) to 4.8 × 4.8 km playable (6 × 6 km of terrain, a
// finer 7.8 m terrain grid for the same cost). Objects keep their real size;
// the sectors were moved together and the empty land between them removed.
// Axes as the main map: x east, z south (north is −z), metres.
//
//   A  Grandes lavouras recortadas — the north: big irregular talhões split
//      by forest corridors, a long narrow one by the creek, the capim
//      clearings with their strip in the north-west.
//   B  Distrito dos Pivôs — the north-east: four centre-pivot circles of
//      different sizes, the rectangles between them, the dam, the pivot strip.
//   C  Beira-rio — the south-west: talhões against the gallery forest of the
//      river and the creek, the reserve strip by the BR-163.
//   D  Castanhal — the south-east: open green land with isolated
//      castanheiras, a strip with a line of tall trees along one side.
import { valueNoise, smoothstep, segDist } from '../core/math.js';
import { organicOutline, outlineBox, fieldSd, polySd, pointInPoly } from './fieldShape.js';

export const MT_WORLD_HALF = 3000; // detailed terrain (7.8 m grid)
export const MT_PLAY_HALF = 2400;
export const MT_BASE_NAME = 'Fazenda Santa Fé';

const polyD = (pts, x, z) => { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])); return d; };

// ---------------------------------------------------------------------------
// Water. The river (inspired by the Teles Pires of the region; not its exact
// course): wide, slow and winding, 85–125 m across, brown-green, closed
// gallery forest on both banks. It comes in from the east, bends past the
// castanhal and the riverside talhões 1.6 km south of the base, and leaves
// by the south-west. Points run downstream.
export const MT_RIVER = {
  name: 'Rio Teles Pires', width: 105, depth: 3.6, valley: 330, valleyDepth: 3.5,
  points: [[3100, 1380], [2700, 1420], [2400, 1560], [2150, 1720], [1900, 1730], [1650, 1600], [1400, 1660], [1180, 1850],
    [950, 1990], [700, 2020], [480, 1900], [280, 1720], [60, 1640], [-180, 1660], [-380, 1800], [-520, 2020], [-700, 2190],
    [-950, 2230], [-1180, 2180], [-1380, 2290], [-1520, 2520], [-1580, 2800], [-1600, 3100]],
};
// Córrego Santa Fé: from the north down between the capim and the long
// talhão, past the reserve strip into the river (the engine's creek).
export const MT_CREEK = {
  points: [[-1480, -3050], [-1495, -2600], [-1480, -2100], [-1500, -1600], [-1470, -1100], [-1490, -620], [-1440, -150], [-1400, 300],
    [-1405, 700], [-1420, 1100], [-1400, 1500], [-1390, 1900], [-1380, 2290]],
  width: 5, depth: 1.2, valley: 80, valleyDepth: 2.2,
};
export const MT_STREAMS = [
  { ...MT_RIVER },
  // Ribeirão do Pivô: down from the chapadão into the pivots' dam.
  { name: 'Ribeirão do Pivô', width: 5, depth: 1.2, valley: 70, valleyDepth: 2.0,
    points: [[2260, -3050], [2240, -2600], [2215, -2200], [2225, -1900]] },
];
export const MT_PONDS = [
  // Represa do Pivô: the pivots' water.
  { name: 'Represa do Pivô', x: 2235, z: -1800, r: 90, depth: 2.6, ph: 0.8, bank: 0.04, blend: 2.2, trees: 0.6, open: 0.3, lobes: [0.22, 0.1, 0.05, 0.02] },
];

// Terrain: broad and open, gently undulating; the chapadão rises a little to
// the north; the land falls gently to the river over a few hundred metres;
// level ground around the base. Slopes stay under ≈ 4 %.
export function mtNatural(x, z) {
  let h = 6.5 * valueNoise(x / 1900 + 1.3, z / 1900 - 4.7) + 2.8 * valueNoise(x / 700 - 2.9, z / 700 + 6.1) + 0.7 * valueNoise(x / 150 + 5.5, z / 150 - 0.4);
  h += 9 * smoothstep(-300, -2700, z) * (0.7 + 0.3 * valueNoise(x / 1300 + 9.1, z / 1300)); // the chapadão rises north
  const dr = polyD(MT_RIVER.points, x, z), dc = polyD(MT_CREEK.points, x, z);
  h -= 7 * (1 - smoothstep(120, 900, dr)); // the river's broad valley
  h -= 3.5 * (1 - smoothstep(40, 380, dc)); // the creek's shallow one
  // The base sits on level ground: the land eases to it over a kilometre.
  h *= smoothstep(300, 1100, Math.hypot(x + 600, z + 140));
  return h;
}

// ---------------------------------------------------------------------------
// Strips: the farm's main one (the game's main site: base, hangar, office) and
// four dirt strips in the farm format (layout.js FARMS: runway from
// x0 = −400 + dx, z = dz).
export const MT_RUNWAY = { x0: -400, x1: 300, z: 0, width: 20, shoulder: 8 };
const SMALL = ['ipanema', 'e203', 'a188', 'pa36', 'agcat', 'e201', 'r44', 'b206'];
export const MT_FARMS = [
  {
    // Pista do Pivô: south of the big pivot, red clay, a little uphill eastbound.
    id: 'pivo', name: 'Pista do Pivô', short: 'Pivô', dx: 1550, dz: 420, ring: true,
    len: 540, width: 16, surface: 1, grade: 0.015, difficulty: 3, color: '#3fa7d6', clear: 36, blend: 170,
    crops: ['soy', 'corn'], weather: 'dry', marks: 'tyres', shed: 'wood', aircraft: [...SMALL, 'at401', 'at502', 'thrush', 'm18'],
    props: [['shack', -470, -150, 0.1], ['drums', -300, -124], ['tower', -462, -178]],
  },
  {
    // Pista do Capim: in a clearing of the capim sector, short and narrow,
    // uphill eastbound, forest close by.
    id: 'capim', name: 'Pista do Capim', short: 'Capim', dx: -1750, dz: -1150, ring: true,
    len: 470, width: 14, surface: 4, grade: 0.022, difficulty: 4, color: '#9bbf3a', clear: 30, tight: true, blend: 160,
    crops: ['capim'], weather: 'dry', marks: 'stakes', shed: 'wood', aircraft: SMALL,
    props: [['shack', -468, -140, 0.2]],
  },
  {
    // Pista da Reserva: by the BR-163, the reserve and the creek, downhill
    // eastbound, a little cross slope.
    id: 'reserva', name: 'Pista da Reserva', short: 'Reserva', dx: -1700, dz: 1150, ring: true,
    len: 500, width: 15, surface: 1, grade: -0.012, bank: 0.006, difficulty: 3, color: '#2e8b57', clear: 32, blend: 170,
    crops: ['soy', 'corn'], weather: 'humid', marks: 'ends', shed: 'wood', aircraft: [...SMALL, 'at401', 'at502', 'thrush'],
    props: [['house', -478, -158, 0], ['drums', -300, -124]],
  },
  {
    // Pista das Castanheiras: red earth in the castanhal, a line of tall
    // trees along its south side (26 m from the centreline: clear of any
    // wing on the strip), open approaches at both ends.
    id: 'castanha', name: 'Pista das Castanheiras', short: 'Castanheiras', dx: 1500, dz: 1000, ring: true,
    len: 560, width: 18, surface: 1, grade: 0.004, difficulty: 3, color: '#c0703a', clear: 20, blend: 170,
    crops: ['soy', 'corn'], weather: 'humid', marks: 'tyres', shed: 'wood', aircraft: [...SMALL, 'at401', 'at502', 'thrush', 'm18', 'at802'],
    props: [['shack', -470, -150, 0.05], ['drums', -300, -124], ['tower', -455, -175]],
    treeLine: { side: 1, offset: 26 }, // (vegetation.js: +z side)
  },
];
// Runways of the map in world coordinates (the main one and the farms').
export const MT_STRIPS = [
  { id: 'main', x0: MT_RUNWAY.x0, x1: MT_RUNWAY.x1, z: 0, width: MT_RUNWAY.width },
  ...MT_FARMS.map((f) => ({ id: f.id, x0: -400 + f.dx, x1: -400 + f.dx + f.len, z: f.dz, width: f.width, treeLine: f.treeLine ?? null })),
];

// ---------------------------------------------------------------------------
// Fields. Each is a rectangle in the engine's format, or an irregular outline
// (`ctrl`: control polygon, [x, z, 1] marks a corner cut square; smoothed by
// organicOutline into curves where the forest was left), or a centre-pivot
// disc (`circle`: only the disc is crop, coverage, GPS and ground).
// Contract ids are those of the map before the refinement (saved careers
// keep their history); the castanhal's two are new.
const F = [
  // ---- A — Grandes lavouras recortadas (the north) -----------------------
  // A-01: the big block north of the base, forest bays on its north side.
  { name: 'A-01', crop: 'soy', rowAxis: 'x', contract: 'mt-a01', seed: 1,
    ctrl: [[-930, -500, 1], [500, -500, 1], [560, -700], [520, -930], [600, -1120], [430, -1235], [270, -1190], [210, -960], [150, -830, 1], [60, -900], [0, -1090], [-120, -1235], [-420, -1255], [-700, -1195], [-930, -1050, 1]] },
  // A-02: north of the corridor, curved where the reserve was left.
  { name: 'A-02', crop: 'corn', rowAxis: 'x', contract: 'mt-a02', seed: 2,
    ctrl: [[-930, -1380, 1], [-560, -1340], [-260, -1380], [-110, -1470, 1], [-300, -1590], [-560, -1720], [-820, -1830], [-930, -1780, 1]] },
  // A-03: the long narrow talhão by the creek, pinched in the middle.
  { name: 'A-03', crop: 'soy', rowAxis: 'z', contract: 'mt-a03', seed: 3,
    ctrl: [[-1390, -720], [-1050, -730, 1], [-1050, -2290, 1], [-1300, -2310], [-1350, -2000], [-1180, -1660], [-1200, -1500], [-1360, -1300], [-1400, -1000]] },
  // A-04: between the corridors, with a deep forest inlet from the east.
  { name: 'A-04', crop: 'corn', rowAxis: 'x', contract: 'mt-a04', seed: 4,
    ctrl: [[-40, -1340, 1], [540, -1340, 1], [560, -1500], [360, -1530], [250, -1600, 1], [420, -1690], [540, -1780], [300, -1825], [40, -1785], [-60, -1600]] },
  // E-01: the far north block against the forest at the map's edge.
  { name: 'E-01', crop: 'soy', rowAxis: 'x', contract: 'mt-e01', seed: 5,
    ctrl: [[-940, -1930], [-500, -1990], [-120, -1915], [250, -1885], [600, -1950], [880, -1900, 1], [900, -2320, 1], [-940, -2320, 1]] },
  { name: 'H-03', crop: 'stubble', rowAxis: 'z', seed: 6,
    ctrl: [[620, -1350], [900, -1340, 1], [910, -1720, 1], [700, -1760], [600, -1560]] },
  // Capim (desiccation) clearings in the north-west.
  { name: 'C-01', crop: 'capim', rowAxis: 'x', contract: 'mt-c01', site: 'capim', seed: 7,
    ctrl: [[-2250, -1860, 1], [-1700, -1880], [-1560, -1990], [-1640, -2150], [-1580, -2290], [-1900, -2330], [-2250, -2300, 1]] },
  { name: 'C-02', crop: 'capim', rowAxis: 'z', contract: 'mt-c02', site: 'capim', seed: 8,
    ctrl: [[-2200, -1320, 1], [-1860, -1300], [-1830, -1520], [-1880, -1780], [-2200, -1780, 1]] },
  { name: 'C-03', crop: 'capim', rowAxis: 'x', contract: 'mt-c03', site: 'capim', seed: 9,
    ctrl: [[-2200, -480, 1], [-1620, -500], [-1580, -650], [-1760, -760, 1], [-1640, -880], [-1660, -990], [-2200, -1000, 1]] },
  { name: 'C-04', crop: 'capim', rowAxis: 'z', seed: 10,
    ctrl: [[-1750, -1320], [-1580, -1300], [-1560, -1560], [-1600, -1790], [-1745, -1760]] },
  // ---- B — Distrito dos Pivôs (the north-east) ---------------------------
  { name: 'P-01', crop: 'soy', rowAxis: 'x', contract: 'mt-p01', site: 'pivo', circle: { x: 1500, z: -350, r: 420 } },
  { name: 'P-02', crop: 'corn', rowAxis: 'x', contract: 'mt-p02', site: 'pivo', circle: { x: 2000, z: -1250, r: 320 } },
  { name: 'P-03', crop: 'soy', rowAxis: 'z', contract: 'mt-p03', site: 'pivo', circle: { x: 1300, z: -1320, r: 300 } },
  // New: the small pivot by the dam.
  { name: 'P-04', crop: 'corn', rowAxis: 'x', contract: 'mt-p04', site: 'pivo', circle: { x: 1700, z: -1960, r: 230 } },
  { name: 'B-01', crop: 'corn', rowAxis: 'z', contract: 'mt-b01', site: 'pivo', rect: [600, 940, -1050, -600] },
  { name: 'B-02', crop: 'soy', rowAxis: 'x', contract: 'mt-b02', seed: 11,
    ctrl: [[1010, -1720], [1380, -1700, 1], [1400, -2310, 1], [1020, -2320], [960, -2000]] },
  { name: 'E-02', crop: 'corn', rowAxis: 'z', rect: [1990, 2340, -790, -230] },
  { name: 'A-06', crop: 'soy', rowAxis: 'z', contract: 'mt-a06', seed: 12,
    ctrl: [[1990, -120, 1], [2340, -120, 1], [2360, 250], [2280, 450], [2080, 440], [1980, 250]] },
  // ---- C — Beira-rio (the south-west) ------------------------------------
  // A-05: the big riverside block; its south edge follows the gallery forest.
  { name: 'A-05', crop: 'soy', rowAxis: 'x', contract: 'mt-a05', seed: 13,
    ctrl: [[-720, 540, 1], [280, 540, 1], [330, 760], [250, 1050], [130, 1290], [-30, 1250], [-110, 1060], [-190, 990, 1], [-260, 1150], [-330, 1420], [-560, 1370], [-720, 1200], [-780, 880]] },
  { name: 'D-01', crop: 'soy', rowAxis: 'z', contract: 'mt-d01', site: 'reserva', seed: 14,
    ctrl: [[-1250, 1000], [-860, 980, 1], [-820, 1400], [-900, 1700], [-1020, 1960], [-1180, 1900], [-1300, 1500]] },
  { name: 'D-02', crop: 'corn', rowAxis: 'x', contract: 'mt-d02', site: 'reserva', seed: 15,
    ctrl: [[-2100, 300, 1], [-1520, 320], [-1480, 520], [-1620, 640, 1], [-1520, 760], [-1580, 890], [-1900, 900], [-2100, 860, 1]] },
  { name: 'H-01', crop: 'stubble', rowAxis: 'x', seed: 16,
    ctrl: [[-1320, 360], [-880, 340, 1], [-880, 800, 1], [-1150, 820], [-1330, 700]] },
  { name: 'A-07', crop: 'corn', rowAxis: 'z', seed: 17,
    ctrl: [[420, 560, 1], [780, 560], [820, 820], [740, 1100], [460, 1080], [400, 800]] },
  // ---- D — Castanhal (the south-east) ------------------------------------
  // K-01: soy south of the castanheiras' tree line, three castanheiras
  // preserved standing in it (MT_CASTANHEIRAS).
  { name: 'K-01', crop: 'soy', rowAxis: 'x', contract: 'mt-k01', site: 'castanha', seed: 18,
    ctrl: [[1180, 1075, 1], [2050, 1075, 1], [2200, 1180], [2150, 1380], [1900, 1460], [1500, 1420], [1250, 1450], [1150, 1300]] },
  { name: 'K-02', crop: 'corn', rowAxis: 'z', contract: 'mt-k02', site: 'castanha', rect: [1820, 2300, 600, 880] },
  // Bare red soil, just harvested, castanheiras standing in it.
  { name: 'H-02', crop: 'fallow', rowAxis: 'x', seed: 19,
    ctrl: [[860, 1140], [1100, 1120], [1120, 1440], [940, 1520], [840, 1360]] },
  // The castanhal's pasture: open land, castanheiras and palms.
  { name: 'H-04', crop: 'pasture', rowAxis: 'x', seed: 20,
    ctrl: [[300, 1180], [740, 1160], [760, 1500], [560, 1640], [330, 1520]] },
];
export const MT_FIELDS = F.map((d) => {
  let x0, x1, z0, z1, outline = null;
  if (d.circle) { x0 = d.circle.x - d.circle.r; x1 = d.circle.x + d.circle.r; z0 = d.circle.z - d.circle.r; z1 = d.circle.z + d.circle.r; }
  else if (d.rect) [x0, x1, z0, z1] = d.rect;
  else { outline = organicOutline(d.ctrl, { iter: 2, wobble: 6, seed: d.seed }); ({ x0, x1, z0, z1 } = outlineBox(outline)); }
  const growth = d.crop === 'stubble' || d.crop === 'fallow' ? 1 : 0.9 + 0.08 * Math.abs(Math.sin(x0 * 0.013 + z0));
  return { name: d.name, crop: d.crop, x0, x1, z0, z1, rowAxis: d.rowAxis, growth,
    ...(d.circle ? { circle: d.circle } : {}), ...(outline ? { outline } : {}),
    extra: { ...(d.contract ? { contract: d.contract } : {}), ...(d.site ? { farm: d.site } : {}), level: 1, ...(d.circle ? { pivot: true } : {}) } };
});

// Centre-pivot machines: the centre tower and the arm of spans on wheeled
// towers, parked across the passes. `ang`: the arm's direction from the
// centre (radians from +x toward +z); height of the pipe at the towers. The
// arm is an obstacle (src/world/world.js).
export const MT_PIVOTS = [
  { field: 'P-01', x: 1500, z: -350, r: 420, ang: Math.PI / 2 + 0.06, span: 52, h: 4.1 },
  { field: 'P-02', x: 2000, z: -1250, r: 320, ang: -2.3, span: 52, h: 4.0 },
  { field: 'P-03', x: 1300, z: -1320, r: 300, ang: 0.4, span: 52, h: 3.9 },
  { field: 'P-04', x: 1700, z: -1960, r: 230, ang: 2.6, span: 52, h: 3.8 },
];
export function pivotArmAt(p, x, z) {
  const ex = p.x + Math.cos(p.ang) * p.r, ez = p.z + Math.sin(p.ang) * p.r;
  return segDist(x, z, p.x, p.z, ex, ez);
}

// ---------------------------------------------------------------------------
// Roads. The BR-163 — paved, two lanes with shoulders — runs north–south
// along the west of the map. Red-earth farm roads: straight trunk roads
// between the blocks, service roads bending around talhões and pivots,
// through the forest corridors to the strips, the pivots and the river.
function track(w, ...way) {
  const pts = [way[0]];
  for (let i = 1; i < way.length; i++) {
    const [ax, az] = way[i - 1], [bx, bz] = way[i];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 40));
    for (let k = 1; k <= n; k++) pts.push([Math.round(ax + ((bx - ax) * k) / n), Math.round(az + ((bz - az) * k) / n)]);
  }
  return { w, mesh: true, ring: true, pts };
}
export const BR_163 = [[-2360, -3100], [-2320, -1900], [-2290, -700], [-2300, 500], [-2330, 1700], [-2390, 3100]];
export const MT_ROADS = [
  // The sede road on the level base platform (ground shader).
  { w: 8, pts: [[-900, -165], [-560, -150], [-445, -150], [-445, -121]] },
  { ...track(14, ...BR_163), paved: true, name: 'BR-163' },
  // Base west to the BR (the farm's gate on the highway).
  track(7, [-900, -165], [-1450, -150], [-1900, -120], [-2295, -110]),
  // North trunk road between the blocks, and the cross road.
  track(6, [-980, -165], [-990, -700], [-985, -1290], [-990, -2400]),
  track(5, [-985, -1290], [-120, -1290], [560, -1290], [960, -1295]),
  // Base east to the pivots, north past them to the dam.
  track(6, [-445, -150], [300, -185], [1010, -170]),
  track(5, [1010, -170], [1015, -850], [970, -1295], [960, -2400]),
  track(5, [1015, -850], [1950, -850], [2370, -900], [2380, -1650], [2290, -1740]),
  // To the pivot strip and on to the castanhal and the river landing.
  track(5, [1010, -170], [1060, 120], [1100, 260]),
  track(5, [1100, 260], [1080, 620], [1040, 860]),
  track(4, [1040, 860], [850, 1050], [805, 1250], [805, 1500], [880, 1800]),
  track(5, [1250, 900], [1800, 900], [2380, 920]),
  // South-west: base round the runway's west end to the riverside blocks,
  // the reserve strip and the BR.
  track(5, [-560, -150], [-820, 280], [-830, 900], [-780, 1460], [-640, 1700]),
  track(5, [-830, 900], [-1180, 930], [-1600, 990], [-1980, 1000]),
  track(5, [-1980, 1000], [-2300, 1040]),
  // Capim: from the BR into the capim clearings.
  track(5, [-2290, -1240], [-2050, -1250], [-1800, -1270], [-1800, -1840]),
];

// Forest that is not a canopy: the base's eucalyptus windbreak.
export const MT_FORESTS = [
  { kind: 'eucalyptus', x0: -540, x1: -500, z0: -130, z1: -75 },
];
// Grain store by the gate on the BR.
export const MT_GRAIN = [{ x: -2120, z: -40, axis: 'x', n: 4, name: 'SANTA FÉ' }];

// Streaming region of the scenery: the whole map; biome 'morros' scatters a
// few shade trees on open land (never under the forest canopy).
export const MT_REGIONS = [{ id: 'mato-grosso', name: 'Mato Grosso', biome: 'morros', c: [0, 0], half: [MT_PLAY_HALF, MT_PLAY_HALF], rot: 0, fall: 400 }];
export const MT_PROPS = [
  // The farm gate on the BR: a shed and a water tower.
  ['galpao', -2060, -170, 0], ['tower', -2010, -190, 0],
  // Pivot pump house by the dam.
  ['galpao', 2330, -1700, 0.3], ['drums', 2310, -1665, 0],
  // A sítio in the north-west, a house at the river landing.
  ['house', -1980, -400, 0.1], ['corral', -1900, -360, 0.1],
  ['house', 950, 1780, 0.4], ['galpao', 990, 1760, 0.4],
];

// ---------------------------------------------------------------------------
// Open land (no forest): the castanhal's pastures around its strip, the
// land around the base, and a few clearings. Polygons, smoothed.
const OPEN = [
  // Castanhal: from the pivot strip down to the river's forest.
  organicOutline([[860, 330], [2000, 300], [2380, 600], [2390, 1000], [2280, 1460], [1700, 1520], [1180, 1560], [880, 1640], [300, 1660], [250, 1150], [760, 900]], { iter: 3, wobble: 8, seed: 31 }),
  // The base's surroundings.
  organicOutline([[-1000, -380], [500, -400], [950, -250], [980, 200], [380, 380], [-1000, 320]], { iter: 3, wobble: 8, seed: 32 }),
  // The sítio in the north-west and the farm gate on the BR.
  organicOutline([[-2240, -460], [-1700, -430], [-1650, -120], [-2240, -60]], { iter: 3, wobble: 6, seed: 33 }),
];
// Forest islands left standing in the open land (ilhas de mata).
const ISLANDS = [
  organicOutline([[2270, 1150], [2360, 1130], [2380, 1240], [2290, 1270]], { iter: 3, wobble: 4, seed: 41 }),
  organicOutline([[1550, 560], [1660, 540], [1690, 640], [1580, 670]], { iter: 3, wobble: 4, seed: 42 }),
  organicOutline([[1240, 590], [1330, 570], [1360, 660], [1270, 690]], { iter: 3, wobble: 4, seed: 43 }),
];

// Isolated castanheiras (Bertholletia excelsa): emergent trees left standing
// in the open — in the castanhal's pasture, in the bare red soil of H-02,
// three in talhão K-01, by roads and at forest edges. [x, z, scale].
export const MT_CASTANHEIRAS = [
  // H-04 pasture.
  [380, 1260, 1.0], [520, 1220, 1.08], [650, 1300, 0.94], [460, 1420, 1.05], [700, 1470, 0.9], [590, 1560, 1.1], [370, 1500, 0.96],
  // H-02 bare soil (the photograph).
  [960, 1260, 1.12], [1050, 1380, 0.98],
  // Inside talhão K-01 (preserved): obstacles on the passes.
  [1420, 1230, 1.06], [1760, 1300, 1.0], [2000, 1200, 0.95],
  // Around the castanha strip and the pivot strip (clear of their approaches).
  [1250, 760, 1.04], [1600, 720, 0.97], [2340, 990, 1.08], [930, 520, 0.92], [1400, 1530, 1.0],
  // By the base (seen from the pad), clear of the runway's approaches.
  [-250, 280, 1.02], [150, 330, 0.95], [620, -330, 1.0], [-700, -330, 0.97],
  // Field edges in the north.
  [560, -560, 1.0], [-950, -430, 0.95], [600, -1380, 1.05], [-110, -1860, 0.98], [-1020, -680, 1.0],
  // By the BR and the riverside.
  [-2180, 250, 1.0], [-2150, 1350, 1.05], [-600, 1480, 0.96], [-1150, 880, 1.02],
];
// Babaçu / macaúba palms on the open land (palms the clearing left).
export const MT_PALMS = [
  [430, 1320], [740, 1380], [610, 1200], [880, 1590], [1180, 1520], [1680, 1490], [2250, 1000], [2120, 820],
  [-300, 330], [80, 280], [700, -320], [-2100, -300], [-1850, -200], [-2200, 120], [-760, 380], [2330, 1250],
];

// ---------------------------------------------------------------------------
// The forest. Wherever nothing was opened, the native forest stands: a
// density 0…1 (1 = closed forest) over the whole terrain, from the distance
// to what was cleared (talhões and their carreadores, roads, strips and their
// approaches, the base, the open land, the water), with an irregular edge;
// gallery forest along the river and the creek even through open land; ilhas
// left in the pastures; continuous beyond the playable area. Sampled once on
// a 20 m grid (mtForest), read everywhere else from there.
const FIELD_BOX = MT_FIELDS.map((f) => ({ f, x0: f.x0 - 60, x1: f.x1 + 60, z0: f.z0 - 60, z1: f.z1 + 60 }));
const ROAD_BOX = MT_ROADS.map((r) => {
  const xs = r.pts.map((p) => p[0]), zs = r.pts.map((p) => p[1]);
  return { r, x0: Math.min(...xs) - 60, x1: Math.max(...xs) + 60, z0: Math.min(...zs) - 60, z1: Math.max(...zs) + 60 };
});
const BASE_CLEAR = { x0: -760, x1: 420, z0: -300, z1: 90 }; // apron, hangar, sede
function stripClear(x, z) {
  // A runway and its approaches: open 60 m each side along it, a funnel
  // widening to 110 m 450 m out past each end.
  let d = 1e9;
  for (const s of MT_STRIPS) {
    const dz = Math.abs(z - s.z), before = s.x0 - x, after = x - s.x1;
    const out = Math.max(before, after, 0);
    if (out > 450 || dz > 200) continue;
    const half = 60 + 50 * (out / 450);
    d = Math.min(d, dz - half);
  }
  return d;
}
function clearDist(x, z) {
  let d = 1e9;
  // (Talhões: the carreador and a grass margin before the trees — about
  // 30 m from the crop to the forest, never under ~18 m.)
  for (const b of FIELD_BOX) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) d = Math.min(d, fieldSd(b.f, x, z) - 16);
  for (const b of ROAD_BOX) {
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
    d = Math.min(d, polyD(b.r.pts, x, z) - b.r.w / 2 - 7);
  }
  d = Math.min(d, stripClear(x, z));
  const bx = Math.max(BASE_CLEAR.x0 - x, x - BASE_CLEAR.x1, 0), bz = Math.max(BASE_CLEAR.z0 - z, z - BASE_CLEAR.z1, 0);
  d = Math.min(d, Math.hypot(bx, bz) - 40);
  for (const P of OPEN) d = Math.min(d, polySd(P, x, z));
  for (const [, px, pz] of MT_PROPS) d = Math.min(d, Math.hypot(x - px, z - pz) - 45);
  for (const p of MT_PONDS) d = Math.min(d, Math.hypot(x - p.x, z - p.z) - p.r - 25);
  return d;
}
export function mtWild(x, z) {
  const n = valueNoise(x / 160 + 6.1, z / 160 - 2.2), n2 = valueNoise(x / 45 - 1.4, z / 45 + 7.7);
  const dRiver = polyD(MT_RIVER.points, x, z) - MT_RIVER.width / 2, dCreek = polyD(MT_CREEK.points, x, z) - 4;
  if (dRiver < 3) return 0; // the water
  const dc = clearDist(x, z);
  // (A gap narrower than ~30 m between two clearings stays a grass verge.)
  let w = smoothstep(14, 42, dc + 8 * n + 4 * n2);
  // Gallery forest: closed along the banks through the open land (not over
  // talhões, roads or strips: those clear it as everywhere).
  const gallery = Math.max(1 - smoothstep(120, 210, dRiver + 40 * n), 1 - smoothstep(30, 70, dCreek + 15 * n));
  if (gallery > 0) {
    let hard = 1e9;
    for (const b of FIELD_BOX) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) hard = Math.min(hard, fieldSd(b.f, x, z) - 16);
    for (const b of ROAD_BOX) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) hard = Math.min(hard, polyD(b.r.pts, x, z) - b.r.w / 2 - 7);
    hard = Math.min(hard, stripClear(x, z));
    for (const [, px, pz] of MT_PROPS) hard = Math.min(hard, Math.hypot(x - px, z - pz) - 45);
    w = Math.max(w, gallery * smoothstep(6, 30, hard + 10 * n2));
  }
  // Ilhas de mata in the open land.
  for (const P of ISLANDS) { const s = polySd(P, x, z); if (s < 30) w = Math.max(w, 1 - smoothstep(-25, 15, s + 10 * n2)); }
  // Gently thinner and lower right at the river's edge (sand and shrubs).
  if (dRiver < 14) w *= smoothstep(3, 14, dRiver);
  // Beyond the playable area: continuous (the BR and the river still open).
  const rr = Math.max(Math.abs(x), Math.abs(z));
  if (rr > MT_PLAY_HALF - 100) {
    const brD = polyD(BR_163, x, z) - 20;
    w = Math.max(w, smoothstep(MT_PLAY_HALF - 100, MT_PLAY_HALF + 150, rr + 80 * n) * smoothstep(0, 30, brD) * smoothstep(3, 14, dRiver) * smoothstep(6, 34, stripClear(x, z)) * smoothstep(0, 30, dc));
  }
  return Math.max(0, Math.min(1, w));
}
// The forest density grid (20 m), built on first use.
const FG = { S: 20, H: MT_WORLD_HALF - 20, N: 0, w: null };
function forestGrid() {
  if (FG.w) return FG;
  FG.N = Math.floor((2 * FG.H) / FG.S) + 1;
  FG.w = new Float32Array(FG.N * FG.N);
  for (let j = 0; j < FG.N; j++) for (let i = 0; i < FG.N; i++) FG.w[j * FG.N + i] = mtWild(-FG.H + i * FG.S, -FG.H + j * FG.S);
  return FG;
}
// Bilinear read of the forest density.
export function mtForest(x, z) {
  const G = forestGrid(), u = (x + G.H) / G.S, v = (z + G.H) / G.S;
  const i = Math.floor(u), j = Math.floor(v);
  if (i < 0 || j < 0 || i >= G.N - 1 || j >= G.N - 1) return 1;
  const a = u - i, b = v - j, k = j * G.N + i;
  return (G.w[k] * (1 - a) + G.w[k + 1] * a) * (1 - b) + (G.w[k + G.N] * (1 - a) + G.w[k + G.N + 1] * a) * b;
}
// The grid itself (the canopy builder samples its nodes).
export function mtForestNodes() { const G = forestGrid(); return { S: G.S, H: G.H, N: G.N, w: G.w }; }
// Obstacle volume of the forest: 60 m cells of closed forest merged into
// boxes (the engine's forest-collider format; top above the ground).
export function mtForestBoxes() {
  const C = 60, N = Math.floor((MT_WORLD_HALF - 60) / C), W = 2 * N;
  const on = new Uint8Array(W * W);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    const x = (i - N + 0.5) * C, z = (j - N + 0.5) * C;
    let all = true;
    for (const [ox, oz] of [[0, 0], [-22, -22], [22, -22], [-22, 22], [22, 22]]) if (mtForest(x + ox, z + oz) < 0.6) { all = false; break; }
    if (all) on[j * W + i] = 1;
  }
  const out = [];
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    if (!on[j * W + i]) continue;
    let i1 = i; while (i1 + 1 < W && on[j * W + i1 + 1]) i1++;
    let j1 = j;
    for (;;) { if (j1 + 1 >= W) break; let all = true; for (let q = i; q <= i1; q++) if (!on[(j1 + 1) * W + q]) { all = false; break; } if (!all) break; j1++; }
    for (let b = j; b <= j1; b++) for (let q = i; q <= i1; q++) on[b * W + q] = 0;
    out.push({ x0: (i - N) * C, x1: (i1 + 1 - N) * C, z0: (j - N) * C, z1: (j1 + 1 - N) * C });
  }
  return out;
}
// Open ground where trees may be scattered (the castanheiras and palms are
// placed by hand; this keeps the generic scatter off talhões and roads).
export const mtOpen = (x, z) => OPEN.some((P) => pointInPoly(P, x, z));

// Ground tint weights [cerrado, wet, forest floor, rock]: green pasture,
// wet along the water, forest floor under the canopy.
export function mtBiome(x, z, out = [0, 0, 0, 0]) {
  const dw = Math.min(polyD(MT_RIVER.points, x, z) - MT_RIVER.width / 2, polyD(MT_CREEK.points, x, z));
  out[0] = 0.05;
  out[1] = 0.75 * (1 - smoothstep(10, 120, dw));
  out[2] = 0.75 * smoothstep(0.15, 0.6, mtForest(x, z));
  out[3] = 0;
  return out;
}
