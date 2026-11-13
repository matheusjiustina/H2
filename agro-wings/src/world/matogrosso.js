// MATO GROSSO OPERATIONS — premium map expansion 04 (a separate map, chosen at
// load: src/world/activeMap.js). The agribusiness frontier of Mato Grosso:
// broad soybean and corn blocks, capim for desiccation, three centre-pivot
// circles, the BR-163 cutting across, red-earth farm roads, legal-reserve
// forest edges and four short dirt strips. Everything the map is made of
// lives here as data and pure functions (no three.js): layout.js,
// expansion.js, terrainData.js and the contract modules take their data from
// this module when it is the active map; no other map reads it.
//
// 8 × 8 km of detailed terrain, 6.8 × 6.8 km of it playable (46 km², a third
// of the main map's 144 km²), on gently rolling chapadão.
// Axes as the main map: x east, z south (north is −z), metres.
//
//   A  Frente da BR — the BR-163 and the big soy / corn blocks on both sides.
//   B  Distrito dos Pivôs — three centre-pivot circles in the north-east, the
//      big one's arm across the passes (fly over it), the pivot strip.
//   C  Setor do Capim — brachiaria for desiccation in the north-west.
//   D  Borda da Reserva — farmland against the legal reserve in the
//      south-west, the reserve strip by the highway.
//   E  Fundos da Fazenda — narrow back roads, long runs, the north.
import { valueNoise, smoothstep, segDist } from '../core/math.js';

export const MT_WORLD_HALF = 4000; // detailed terrain (10.4 m grid)
export const MT_PLAY_HALF = 3400;
export const MT_BASE_NAME = 'Fazenda Santa Fé';

// ---------------------------------------------------------------------------
// Terrain: broad and open, gently undulating — swells of a few metres over
// kilometres, the chapadão rising a little to the north, shallow valleys of
// the creeks. Slopes stay under ≈ 4 %.
const polyD = (pts, x, z) => { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])); return d; };
export const MT_CREEK = {
  // Córrego Santa Fé: down the west edge of the farm (its gallery forest),
  // under the BR and through the reserve.
  points: [[-3500, -3950], [-3560, -3000], [-3620, -2000], [-3560, -1000], [-3620, 0], [-3560, 900], [-3420, 1600], [-3120, 2100], [-2750, 2700], [-2450, 3300], [-2350, 3950]],
  width: 5, depth: 1.2, valley: 90, valleyDepth: 2.4,
};
export const MT_STREAMS = [
  // Ribeirão do Pivô: down from the chapadão into the pivots' dam.
  { name: 'Ribeirão do Pivô', width: 5, depth: 1.2, valley: 70, valleyDepth: 2.0,
    points: [[2350, -3700], [2500, -3100], [2650, -2350], [2730, -1900], [2770, -1560]] },
];
export function mtNatural(x, z) {
  let h = 7.5 * valueNoise(x / 2100 + 1.3, z / 2100 - 4.7) + 3.2 * valueNoise(x / 780 - 2.9, z / 780 + 6.1) + 0.8 * valueNoise(x / 160 + 5.5, z / 160 - 0.4);
  h += 12 * smoothstep(-400, -3600, z) * (0.7 + 0.3 * valueNoise(x / 1500 + 9.1, z / 1500)); // the chapadão rises north
  const dc = Math.min(polyD(MT_CREEK.points, x, z), polyD(MT_STREAMS[0].points, x, z));
  h -= 5 * (1 - smoothstep(60, 520, dc)); // shallow creek valleys
  // The base and the sede sit on level ground: the land eases to it over a kilometre.
  h *= smoothstep(350, 1300, Math.hypot(x + 700, z + 160));
  return h;
}

// ---------------------------------------------------------------------------
// Strips: the farm's main one (the game's main site: base, hangar, office) and
// three short dirt strips in the farm format (layout.js FARMS).
export const MT_RUNWAY = { x0: -400, x1: 300, z: 0, width: 20, shoulder: 8 };
const SMALL = ['ipanema', 'e203', 'a188', 'pa36', 'agcat', 'e201', 'r44', 'b206'];
export const MT_FARMS = [
  {
    // Pista do Pivô: by the pivot district, red clay, a little uphill eastbound.
    id: 'pivo', name: 'Pista do Pivô', short: 'Pivô', dx: 2350, dz: -150, ring: true,
    len: 540, width: 16, surface: 1, grade: 0.015, difficulty: 3, color: '#3fa7d6', clear: 36, blend: 170,
    crops: ['soy', 'corn'], weather: 'dry', marks: 'tyres', shed: 'wood', aircraft: [...SMALL, 'at401', 'at502', 'thrush', 'm18'],
    props: [['shack', -470, -150, 0.1], ['drums', -300, -124], ['tower', -462, -178]],
  },
  {
    // Pista do Capim: out in the capim sector, short and narrow, uphill eastbound.
    id: 'capim', name: 'Pista do Capim', short: 'Capim', dx: -2400, dz: -2050, ring: true,
    len: 470, width: 14, surface: 4, grade: 0.022, difficulty: 4, color: '#9bbf3a', clear: 30, tight: true, blend: 160,
    crops: ['capim'], weather: 'dry', marks: 'stakes', shed: 'wood', aircraft: SMALL,
    props: [['shack', -468, -140, 0.2]],
  },
  {
    // Pista da Reserva: by the BR-163 against the reserve, downhill eastbound,
    // a little cross slope.
    id: 'reserva', name: 'Pista da Reserva', short: 'Reserva', dx: -2350, dz: 2200, ring: true,
    len: 500, width: 15, surface: 1, grade: -0.012, bank: 0.006, difficulty: 3, color: '#2e8b57', clear: 32, blend: 170,
    crops: ['soy', 'corn'], weather: 'humid', marks: 'ends', shed: 'wood', aircraft: [...SMALL, 'at401', 'at502', 'thrush'],
    props: [['house', -478, -158, 0], ['drums', -300, -124]],
  },
];

// ---------------------------------------------------------------------------
// Fields. Rectangles in the engine's format; a pivot field carries
// `circle: { x, z, r }` (its rectangle is the circle's square): only the disc
// is crop, coverage, GPS and ground. Names as on a farm map.
// [name, crop, x0, x1, z0, z1, rowAxis, contract, site]
const F = [
  // A — Frente da BR (north of the highway, the base's orders).
  ['A-01', 'soy', 450, 1750, 300, 1000, 'x', 'mt-a01', 'main'],
  ['A-02', 'corn', 450, 1750, 1060, 1640, 'x', 'mt-a02', 'main'],
  ['A-03', 'soy', -1750, -600, 300, 1100, 'x', 'mt-a03', 'main'],
  ['A-04', 'corn', -1750, -600, 1160, 1620, 'x', 'mt-a04', 'main'],
  // A — south of the highway: the big soy blocks.
  ['A-05', 'soy', -800, 1100, 2250, 3150, 'x', 'mt-a05', 'main'],
  ['A-06', 'soy', 1180, 2700, 2250, 3200, 'z', 'mt-a06', 'main'],
  ['A-07', 'corn', 2800, 3350, 2100, 3000, 'z', null, null],
  // B — Distrito dos Pivôs (the pivot strip's requests).
  ['P-01', 'soy', 0, 0, 0, 0, 'x', 'mt-p01', 'pivo', { x: 2000, z: -1330, r: 420 }],
  ['P-02', 'corn', 0, 0, 0, 0, 'x', 'mt-p02', 'pivo', { x: 3000, z: -2560, r: 320 }],
  ['P-03', 'soy', 0, 0, 0, 0, 'z', 'mt-p03', 'pivo', { x: 950, z: -2520, r: 300 }],
  ['B-01', 'corn', 1000, 1800, -820, -330, 'x', 'mt-b01', 'pivo'],
  ['B-02', 'soy', 300, 1350, -1750, -950, 'x', 'mt-b02', 'main'],
  // C — Setor do Capim (desiccation, the capim strip's requests).
  ['C-01', 'capim', -3250, -2150, -3050, -2350, 'x', 'mt-c01', 'capim'],
  ['C-02', 'capim', -1900, -1050, -3000, -2150, 'z', 'mt-c02', 'capim'],
  ['C-03', 'capim', -3250, -2300, -1750, -1000, 'x', 'mt-c03', 'capim'],
  ['C-04', 'capim', -1900, -1000, -1800, -900, 'x', null, null],
  // D — Borda da Reserva (the reserve strip's requests).
  ['D-01', 'soy', -1750, -950, 2300, 3250, 'z', 'mt-d01', 'reserva'],
  ['D-02', 'corn', -3300, -2350, 450, 1500, 'x', 'mt-d02', 'reserva'],
  // E — Fundos (the base's long runs).
  ['E-01', 'soy', -950, 200, -2550, -1950, 'x', 'mt-e01', 'main'],
  ['E-02', 'corn', 1400, 2150, -3150, -2700, 'x', null, null],
  // Harvested and resting land (the mosaic; no orders).
  ['H-01', 'stubble', -3300, -2350, -750, 300, 'x', null, null],
  ['H-02', 'fallow', 1950, 2950, 900, 1650, 'x', null, null],
  ['H-03', 'stubble', -500, 200, -1600, -650, 'z', null, null],
  ['H-04', 'pasture', 2950, 3350, -2050, -1250, 'x', null, null],
];
export const MT_FIELDS = F.map(([name, crop, x0, x1, z0, z1, rowAxis, contract, site, circle]) => {
  if (circle) { x0 = circle.x - circle.r; x1 = circle.x + circle.r; z0 = circle.z - circle.r; z1 = circle.z + circle.r; }
  return { name, crop, x0, x1, z0, z1, rowAxis, growth: crop === 'stubble' || crop === 'fallow' ? 1 : 0.9 + 0.08 * Math.abs(Math.sin(x0 * 0.013 + z0)),
    ...(circle ? { circle } : {}), extra: { ...(contract ? { contract } : {}), ...(site && site !== 'main' ? { farm: site } : {}), level: 1, ...(circle ? { pivot: true } : {}) } };
});

// Centre-pivot machines: the centre tower and the arm of spans on wheeled
// towers, parked across the passes (rows run east–west, the arm lies
// north–south: every pass of the big pivot meets it). `ang`: the arm's
// direction from the centre (radians from +x toward +z); height of the
// pipe at the towers. The arm is an obstacle (src/world/world.js).
export const MT_PIVOTS = [
  { field: 'P-01', x: 2000, z: -1330, r: 420, ang: Math.PI / 2 + 0.06, span: 52, h: 4.1 },
  { field: 'P-02', x: 3000, z: -2560, r: 320, ang: -2.3, span: 52, h: 4.0 },
  { field: 'P-03', x: 950, z: -2520, r: 300, ang: 0.4, span: 52, h: 3.9 },
];
// Distance (horizontal) from (x, z) to a pivot's arm, and the arm's top there.
export function pivotArmAt(p, x, z) {
  const ex = p.x + Math.cos(p.ang) * p.r, ez = p.z + Math.sin(p.ang) * p.r;
  return segDist(x, z, p.x, p.z, ex, ez);
}

// ---------------------------------------------------------------------------
// Roads. The BR-163 — paved, two lanes with shoulders — crosses the whole map
// east–west with long straights and gentle bends. Red-earth farm roads
// (narrow, some odd) link the base, the strips, the pivots and the fields.
function track(w, ...way) {
  const pts = [way[0]];
  for (let i = 1; i < way.length; i++) {
    const [ax, az] = way[i - 1], [bx, bz] = way[i];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 40));
    for (let k = 1; k <= n; k++) pts.push([Math.round(ax + ((bx - ax) * k) / n), Math.round(az + ((bz - az) * k) / n)]);
  }
  return { w, mesh: true, ring: true, pts };
}
export const BR_163 = [[-4000, 1900], [-2600, 1830], [-1200, 1770], [0, 1790], [900, 1880], [1700, 2040], [2600, 2070], [3300, 1890], [4000, 1660]];
export const MT_ROADS = [
  // The sede road on the level base platform (ground shader).
  { w: 8, pts: [[-1900, -150], [-1200, -150], [-560, -150], [-445, -150], [-445, -121]] },
  { ...track(14, ...BR_163), paved: true, name: 'BR-163' },
  // Base south to the BR (the farm's gate on the highway).
  track(7, [-445, -150], [-450, 250], [-430, 800], [-420, 1300], [-400, 1785]),
  // Along the reserve edge, red earth (D).
  track(6, [-3400, 2350], [-2900, 2380], [-2300, 2400], [-1800, 2270], [-1200, 2200], [-700, 2180], [-200, 2160], [1100, 2190], [2700, 2200]),
  // Base east to the pivot strip and on to the pivots (B).
  track(6, [-445, -150], [300, -260], [900, -240], [1600, -260], [1880, -280]),
  track(5, [1880, -280], [1880, -880], [1560, -910], [1500, -1300], [1520, -1950], [1300, -2250], [1260, -2900]),
  track(5, [1520, -1950], [2100, -1890], [2600, -1900], [2850, -2150]),
  // North to the backlands (E) and the capim (C), narrow and crooked.
  track(5, [-1900, -150], [-1950, -600], [-2100, -1000], [-2150, -1450], [-2150, -1880], [-2400, -1930], [-2840, -1920]),
  track(4, [-2150, -1880], [-1500, -1990], [-1000, -1890], [-300, -1830], [300, -1830], [450, -2300], [480, -2900], [660, -3400]),
  track(4, [-2100, -1000], [-2000, -820], [-1500, -800], [-1000, -700], [-700, -560]),
  // Odd service roads along the blocks (F).
  track(4, [-620, 1120], [-120, 1110], [400, 1040], [1750, 1040]),
  track(4, [-3400, 1500], [-3420, 900], [-3440, 300], [-3420, -800]),
];

// Forest: the legal reserve blocks (straight edges against the crops, as
// the frontier is cut) and the gallery forest along the creek.
export const MT_FORESTS = [
  { kind: 'mata', x0: -3400, x1: -1900, z0: 2470, z1: 3400 },
  { kind: 'mata', x0: 3020, x1: 3400, z0: -1150, z1: 1300 },
  { kind: 'mata', x0: -700, x1: 450, z0: -3400, z1: -2750 },
  { kind: 'mata', x0: -3400, x1: -2700, z0: -3400, z1: -3150 },
  { kind: 'eucalyptus', x0: -540, x1: -500, z0: -130, z1: -75 },
];
export const MT_PONDS = [
  // Represa do Pivô: the pivots' water.
  { name: 'Represa do Pivô', x: 2780, z: -1500, r: 95, depth: 2.6, ph: 0.8, bank: 0.04, blend: 2.2, trees: 0.6, open: 0.3, lobes: [0.22, 0.1, 0.05, 0.02] },
];
// Grain store by the base road, near the highway.
export const MT_GRAIN = [{ x: -330, z: 1420, axis: 'z', n: 4, name: 'SANTA FÉ' }];

// Streaming region of the scenery: the whole map; biome 'morros' scatters
// isolated shade trees and ipês on the open land between the blocks.
export const MT_REGIONS = [{ id: 'mato-grosso', name: 'Mato Grosso', biome: 'morros', c: [0, 0], half: [MT_PLAY_HALF, MT_PLAY_HALF], rot: 0, fall: 400 }];
export const MT_PROPS = [
  // A highway sign of the farm by its gate, a truck stop's shed.
  ['galpao', -520, 1720, 0], ['tower', -560, 1690, 0],
  // Pivot pump house by the dam.
  ['galpao', 2650, -1420, 0.3], ['drums', 2630, -1385, 0],
  // Sítios in the backlands.
  ['house', -1600, -2350, 0.1], ['corral', -1520, -2420, 0.1],
  ['house', 2450, 1650, 0], ['galpao', 2490, 1640, 0],
];
const rectD = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
// Ground tint weights [cerrado, wet, forest floor, rock]: green pasture, a
// little dry cerrado in the capim sector, wet along the creeks, forest floor
// under the reserves.
export function mtBiome(x, z, out = [0, 0, 0, 0]) {
  const dc = Math.min(polyD(MT_CREEK.points, x, z), polyD(MT_STREAMS[0].points, x, z));
  out[0] = 0.06 + 0.35 * smoothstep(-600, -1600, z) * smoothstep(-500, -1500, x);
  out[1] = 0.75 * (1 - smoothstep(15, 110, dc));
  let df = 1e9;
  for (const f of MT_FORESTS) if (f.kind !== 'eucalyptus') df = Math.min(df, rectD(f, x, z));
  out[2] = 0.7 * (1 - smoothstep(0, 40, df));
  out[3] = 0;
  return out;
}
