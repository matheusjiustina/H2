// OPERATION: FIREBOSS FRONTIER — premium map expansion 03 (a separate map,
// chosen at load: src/world/activeMap.js). A compact wildfire theatre of the
// Brazilian cerrado built for the Fire Boss: dry grassland and scrub, two
// large lakes to scoop from, broken hills, a low basin where the smoke
// gathers, and the fire sectors the missions light. Everything the map is
// made of lives here as data and pure functions (no three.js): layout.js,
// expansion.js, terrainData.js, vegetation.js and the fire system take their
// data from this module when it is the active map; no other map reads it.
//
// 7.2 × 7.2 km of detailed terrain, 6 × 6 km of it playable (36 km², a
// quarter of the main map's 144 km²), ringed by low cerrado hills.
// Axes as the main map: x east, z south (north is −z), metres.
//
//   A  Chapadão do Capim — the open fire plains east and south-east of the
//      base: low rolling grassland, scattered trees, long fire lines.
//   B  Morro Queimado — the broken hills of the north-east: hills and
//      slopes cut by narrow corridors (the stream runs down one of them).
//   C  Distrito das Lagoas — the two lakes: Lagoa Grande north of the base
//      (the main scooping lake) and Lagoa das Garças deep in the south-west.
//   D  Baixada da Fumaça — the low basin in the south, where smoke lies.
//   E  Serra da Brasa — the higher, rougher ridge along the west.
import { valueNoise, smoothstep, lerp, clamp, segDist } from '../core/math.js';

// The main base's name (map labels, the office).
export const FRONT_BASE_NAME = 'Base Lagoa Grande';
export const FRONT_WORLD_HALF = 3600; // detailed terrain (9.4 m grid)
export const FRONT_PLAY_HALF = 3000;

// ---------------------------------------------------------------------------
// Shapes.
const polyD = (pts, x, z, k = 60) => {
  let d = 1e9, e = 0;
  // (Every segment counts, however far: a cut-off would make steps where one enters the sum.)
  for (let i = 0; i < pts.length - 1; i++) { const q = segDist(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]); if (q < d) d = q; e += Math.exp(-q / k); }
  return e > 0 ? Math.max(0, -k * Math.log(e)) : d;
};
const rot = (x, z, a) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];
const blob = (x, z) => smoothstep(-0.55, 0.75, valueNoise(x, z));
const dome = (x, z) => { const v = valueNoise(x, z); return 1 - v * v; };
// Rounded-rectangle zone weight (1 inside, 0 beyond `fall`), warped edge.
function zoneW(Z, x, z) {
  const dx = Math.abs(x - Z.c[0]) - Z.half[0], dz = Math.abs(z - Z.c[1]) - Z.half[1];
  const sd = Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
  return 1 - smoothstep(-Z.fall * 0.35, Z.fall, sd);
}
export const ZONES = {
  A: { id: 'A', c: [1500, 300], half: [1100, 900], fall: 500 },
  B: { id: 'B', c: [2250, -2000], half: [850, 900], fall: 550 },
  D: { id: 'D', c: [620, 2150], half: [800, 480], fall: 480 },
  E: { id: 'E', c: [-2250, -1450], half: [700, 1300], fall: 600 },
};

// ---------------------------------------------------------------------------
// Water. Two large lakes (the existing pond technology: an irregular
// outline of harmonics, a bowl under a level set by the lowest point of the
// rim, gentle banks). Lagoa Grande lies east–west, into the prevailing
// easterly: 1.25 km of open water a kilometre north of the base. Lagoa das
// Garças is smaller, turned, deeper in the map. A small farm dam by the
// auxiliary strip is scenery.
export const FRONT_PONDS = [
  { name: 'Lagoa Grande', x: 480, z: -1520, r: 450, depth: 4.6, ph: Math.PI / 2, bank: 0.04, blend: 1.8, trees: 0.4, open: -0.1, big: true, lobes: [0.3, 0.13, 0.08, 0.045] },
  { name: 'Lagoa das Garças', x: -1880, z: 1380, r: 390, depth: 4.0, ph: 2.35, bank: 0.04, blend: 1.9, trees: 1.0, open: 0.4, big: true, lobes: [0.24, 0.13, 0.07, 0.04] },
  { name: 'Açude do Retiro', x: 2160, z: 1420, r: 46, depth: 2.0, ph: 0.9, bank: 0.05, blend: 2.0, trees: 1.2, open: 0.5, lobes: [0.16, 0.1, 0.05, 0.02] },
];
// Córrego da Fumaça: out of Lagoa das Garças east into the basin and south
// out of the map (CREEK: the ribbon under its banks).
export const FRONT_CREEK = {
  points: [[-1420, 1560], [-1050, 1700], [-680, 1840], [-300, 1960], [80, 2060], [450, 2140], [800, 2250], [1080, 2470], [1260, 2800], [1380, 3200], [1460, 3700]],
  width: 6, depth: 1.4, valley: 70, valleyDepth: 1.6,
};
// Córrego do Morro Queimado: down a corridor of the north-east hills into
// Lagoa Grande's east end (its level only falls on the way down).
export const FRONT_STREAMS = [
  { name: 'Córrego do Morro Queimado', width: 6, depth: 1.3, valley: 60, valleyDepth: 1.8,
    points: [[3350, -3300], [3000, -2960], [2700, -2700], [2420, -2480], [2150, -2280], [1900, -2080], [1650, -1880], [1400, -1700], [1180, -1580]] },
];
const lakeR = (p, a) => {
  const [a2, a3, a5, a7] = p.lobes;
  return p.r * (1 + a2 * Math.sin(2 * a + p.ph) + a3 * Math.sin(3 * a + p.ph * 1.7) + a5 * Math.sin(5 * a + p.ph * 2.3 + 1.1) + a7 * Math.sin(7 * a + p.ph * 3.1 + 2.0));
};
// Lake distance in radii (1 at the shore).
const lakeQ = (p, x, z) => Math.hypot(x - p.x, z - p.z) / lakeR(p, Math.atan2(z - p.z, x - p.x));

// Corridors through the north-east hills (hills eased down along them).
const B_CORRIDORS = [
  { pts: FRONT_STREAMS[0].points, w: 170, k: 0.85 },
  { pts: [[1250, -900], [1700, -1150], [2200, -1350], [2800, -1500], [3400, -1600]], w: 150, k: 0.75 },
];
// The Serra da Brasa's spine (west) and its spurs.
const E_SPINE = [[-2650, 450], [-2420, -500], [-2150, -1350], [-1850, -2150], [-1450, -2950], [-1200, -3500]];

// ---------------------------------------------------------------------------
// Terrain.
export function frontierNatural(x, z) {
  const wx = x + 170 * valueNoise(x / 1500 + 2.1, z / 1500 - 4.3), wz = z + 170 * valueNoise(x / 1500 - 6.2, z / 1500 + 1.7);
  // Zone A everywhere underneath: rolling grassland, a few metres of swell.
  let h = 6.5 * valueNoise(wx / 950 + 1.1, wz / 950 - 2.2) + 3.2 * valueNoise(wx / 340 - 5.0, wz / 340 + 3.0) + 1.1 * valueNoise(x / 85 + 0.7, z / 85 - 1.9);
  // B: broken hills cut by corridors.
  const wB = zoneW(ZONES.B, wx, wz);
  if (wB > 0) {
    const [ax, az] = rot(wx, wz, 0.7), [bx, bz] = rot(wx, wz, -0.55);
    let hb = 12 + 62 * blob(ax / 480 + 3.1, az / 480 - 1.4) + 22 * dome(bx / 300 - 2.2, bz / 300 + 5.1) + 6 * valueNoise(wx / 120 + 4.4, wz / 120 - 7.7);
    for (const c of B_CORRIDORS) { const d = polyD(c.pts, wx, wz); if (d < c.w * 2.4) hb *= 1 - c.k * (1 - smoothstep(c.w * 0.3, c.w * 2.4, d)); }
    h += wB * hb;
  }
  // E: the ridge — a spine, rough crests, spurs running down to the east.
  const wE = zoneW(ZONES.E, wx, wz);
  if (wE > 0) {
    const dS = polyD(E_SPINE, wx, wz, 120);
    const crest = (98 + 38 * valueNoise(wx / 600 + 8.2, wz / 600 - 3.3)) * Math.exp(-(dS * dS) / (2 * 360 * 360));
    // Broken crests: ridged noise stretched along the spine (gullies and
    // spurs, not bumps).
    const [rx, rz] = rot(wx, wz, 0.38);
    const rv = valueNoise(rx / 170 - 1.7, rz / 520 + 6.6), rough = 1.1 - Math.sqrt(rv * rv + 0.012); // (rounded crests: no cusp)
    const [cx, cz] = rot(wx, wz, 1.25);
    const spurs = 34 * blob(cx / 380 + 0.4, cz / 380 + 9.1) * smoothstep(200, 900, wx - lerp(-2650, -1200, clamp((-wz + 450) / 3950, 0, 1)) + 900);
    h += wE * (crest + 26 * rough * rough * (0.4 + 0.6 * Math.exp(-(dS * dS) / (2 * 600 * 600))) + spurs);
  }
  // D: the basin — 20 m down, its floor nearly level.
  // (An organic bowl: a warped ellipse, no straight edges.)
  const qD = Math.hypot((wx - ZONES.D.c[0]) / (ZONES.D.half[0] + 180), (wz - ZONES.D.c[1]) / (ZONES.D.half[1] + 160)) + 0.22 * valueNoise(wx / 420 + 5.5, wz / 420 - 0.9);
  const wD = 1 - smoothstep(0.62, 1.2, qD);
  if (wD > 0) h = lerp(h, -19 + 2 * valueNoise(wx / 400 + 3.3, wz / 400), wD);
  // The rim of the map: low cerrado hills.
  const rr = (x ** 4 + z ** 4) ** 0.25;
  h += smoothstep(2850, 3550, rr + 140 * valueNoise(x / 900 + 6.6, z / 900 - 1.2)) * (55 + 40 * valueNoise(x / 1300 - 4.1, z / 1300 + 2.9));
  // Lake basins: the ground round each lake eases to a near-level floor, so
  // the shores are natural and the rim's lowest point sets a sensible level.
  for (const p of FRONT_PONDS) {
    if (!p.big) continue;
    const dx = x - p.x, dz = z - p.z;
    const box = p.r * (1 + p.lobes.reduce((m, v) => m + Math.abs(v), 0)) * 2.55; // (beyond 2.5 radii k = 0: no step at the box)
    if (Math.abs(dx) > box || Math.abs(dz) > box) continue;
    const q = lakeQ(p, x, z);
    const k = 1 - smoothstep(1.12, 2.5, q);
    if (k > 0) h = lerp(h, -2.5 + 1.4 * valueNoise(x / 160 + p.ph, z / 160 - p.ph) + 1.6 * smoothstep(1.05, 2.4, q), k);
  }
  return h;
}

// ---------------------------------------------------------------------------
// Strips. The main one is the map's base (the game's main site: service pad,
// fuel, hangar, office): BASE 01, the fire operations base by Lagoa Grande,
// 840 × 22 m compacted earth. BASE 02 is a remote rural strip in the farm
// format (layout.js FARMS). BASE 03 is a water-access point on Lagoa das
// Garças (a shed, a water tank and drums by the shore; no strip).
export const FRONT_RUNWAY = { x0: -400, x1: 440, z: 0, width: 22, shoulder: 8 };
export const FRONT_FARMS = [
  {
    id: 'retiro', name: 'Pista do Retiro', short: 'Retiro', dx: 2350, dz: 900, ring: true,
    len: 560, width: 18, surface: 1, grade: 0, difficulty: 3, color: '#e0622c', clear: 40, blend: 170,
    crops: [], weather: 'dry', marks: 'tyres', shed: 'wood', aircraft: ['at802', 'at802f'],
    props: [['shack', -470, -150, 0.1], ['drums', -300, -124], ['tower', -462, -178]],
  },
];

// ---------------------------------------------------------------------------
// Roads: the base's access in the ground shader; red-earth tracks draped on
// the land to the lakes, the auxiliary strip, the basin and out of the map.
function track(w, ...way) {
  const pts = [way[0]];
  for (let i = 1; i < way.length; i++) {
    const [ax, az] = way[i - 1], [bx, bz] = way[i];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 40));
    for (let k = 1; k <= n; k++) pts.push([Math.round(ax + ((bx - ax) * k) / n), Math.round(az + ((bz - az) * k) / n)]);
  }
  return { w, mesh: true, ring: true, pts };
}
export const FRONT_ROADS = [
  { w: 7, pts: [[-760, -150], [-560, -150], [-445, -150], [-445, -121]] },
  // West out of the map (the way in).
  track(6, [-760, -150], [-1200, -60], [-1700, 120], [-2300, 260], [-2900, 300], [-3560, 330]),
  // North to Lagoa Grande's south shore (the water-truck landing).
  track(5, [-445, -150], [-420, -520], [-300, -860], [-120, -1020]),
  // East along the plains to the Pista do Retiro.
  track(6, [-445, -150], [-100, -260], [500, -280], [1000, -150], [1450, 160], [1700, 560], [1780, 740]),
  // South-west to Lagoa das Garças (BASE 03) and on to the basin.
  track(5, [-760, -150], [-900, 250], [-1100, 680], [-1280, 960], [-1360, 1080]),
  track(5, [-1100, 680], [-700, 1150], [-300, 1550], [150, 1800], [520, 1900]),
];

// ---------------------------------------------------------------------------
// Fire. Spots in the format of src/world/fires.js: a spot burns as one area
// (r: radius) or, kind 'line', as a strip of fire `len` long across `ang`
// (a fire front). Sectors group them; the missions light whole sectors.
// Spots of the same sector sit within one scoop–drop circuit.
const line = (x, z, len, ang, r = 9) => ({ x, z, r, kind: 'line', len, ang });
const front = (pts, r = 9) => pts.slice(1).map(([bx, bz], i) => { const [ax, az] = pts[i]; return line((ax + bx) / 2, (az + bz) / 2, Math.hypot(bx - ax, bz - az), Math.atan2(bz - az, bx - ax), r); });
export const FRONT_SECTORS = [
  { id: 'capim', zone: 'A', name: 'Capim do Chapadão', spots: [{ x: 1380, z: 520, r: 18 }] },
  { id: 'chapadao', zone: 'A', name: 'Linha do Chapadão', spots: front([[1720, -320], [1880, -200], [2040, -110], [2200, 10], [2350, 140]]) },
  { id: 'morro', zone: 'B', name: 'Encosta do Morro Queimado', spots: [{ x: 1960, z: -1240, r: 16 }, { x: 2160, z: -1430, r: 18 }, line(2380, -1600, 150, 0.95)] },
  { id: 'baixada', zone: 'D', name: 'Baixada da Fumaça', spots: [{ x: 300, z: 1990, r: 20 }, line(640, 2400, 170, 0.18), { x: 980, z: 2060, r: 16 }] },
  { id: 'brasa', zone: 'E', name: 'Serra da Brasa', spots: [{ x: -1900, z: -1180, r: 16 }, line(-2120, -880, 140, 1.25)] },
  { id: 'garcas', zone: 'C', name: 'Margens da Lagoa das Garças', spots: [{ x: -1200, z: 880, r: 16 }, { x: -2420, z: 1960, r: 18 }, line(-1500, 1990, 130, -0.4)] },
  { id: 'norte', zone: 'C', name: 'Cerrado ao norte da Lagoa Grande', spots: [{ x: 320, z: -2380, r: 15 }] },
  // Flare-ups: lit by a mission whose fire is not under control in time.
  { id: 'flare-chapadao', zone: 'A', name: 'Retomada no Chapadão', spots: [line(2500, 300, 120, 0.7)] },
  { id: 'flare-brasa', zone: 'E', name: 'Retomada na Serra da Brasa', spots: [{ x: -2340, z: -640, r: 14 }] },
];
// Flat list with ids (1-based, stable: missions refer to them).
export const FRONT_FIRE_SPOTS = [];
for (const s of FRONT_SECTORS) { s.ids = []; for (const sp of s.spots) { const id = FRONT_FIRE_SPOTS.length + 1; FRONT_FIRE_SPOTS.push({ ...sp, sector: s.id }); s.ids.push(id); } }
export const sectorIds = (...ids) => ids.flatMap((id) => FRONT_SECTORS.find((s) => s.id === id)?.ids ?? []);
// Smoke the basin holds (zone D): the local haze is thicker there.
export const SMOKE_BASIN = { ...ZONES.D, haze: 1.8 };
// Distant fires beyond the map (impostor smoke columns only): [x, z, scale].
export const DISTANT_FIRES = [[-4700, -2400, 1.2], [4400, 1600, 1.0], [1300, 4800, 0.9], [-3900, 4100, 1.1], [3600, -4600, 0.8]];
// Old burn scars on the ground (static): ellipses [x, z, rx, rz, rot].
export const BURN_SCARS = [
  [2600, -400, 320, 170, 0.5], [1100, 1150, 260, 140, -0.3], [2700, -1100, 240, 160, 1.0], [-1500, -700, 220, 130, 0.9],
  [-2600, -2100, 300, 160, 1.3], [800, -2500, 260, 150, 0.2], [-600, 2500, 280, 150, -0.2], [2700, 2200, 300, 170, 0.6],
];

// ---------------------------------------------------------------------------
// Ground: nothing tall where the strips, roads and water are.
const stripRects = () => [FRONT_RUNWAY, ...FRONT_FARMS.map((f) => ({ x0: -400 + f.dx, x1: -400 + f.dx + f.len, z: f.dz, width: f.width }))];
const rectD = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
export function frontierStripD(x, z) {
  let d = 1e9;
  for (const r of stripRects()) d = Math.min(d, rectD({ x0: r.x0 - 420, x1: r.x1 + 420, z0: r.z - 90, z1: r.z + 90 }, x, z), rectD({ x0: r.x0 - 160, x1: r.x0 + 130, z0: r.z - 220, z1: r.z + 60 }, x, z));
  return d;
}
const waterD = (x, z) => {
  let d = polyD(FRONT_CREEK.points, x, z, 15);
  for (const st of FRONT_STREAMS) d = Math.min(d, polyD(st.points, x, z, 15));
  return d;
};
const lakeD = (x, z) => { let d = 1e9; for (const p of FRONT_PONDS) d = Math.min(d, (lakeQ(p, x, z) - 1) * p.r); return d; };
const scarW = (x, z) => {
  let w = 0;
  for (const [cx, cz, rx, rz, a] of BURN_SCARS) {
    const dx = x - cx, dz = z - cz;
    if (Math.abs(dx) > rx * 1.6 && Math.abs(dz) > rx * 1.6) continue;
    const u = (dx * Math.cos(a) + dz * Math.sin(a)) / rx, v = (-dx * Math.sin(a) + dz * Math.cos(a)) / rz;
    const e = Math.hypot(u, v) + 0.35 * valueNoise(x / 60 + cx, z / 60 - cz);
    w = Math.max(w, 1 - smoothstep(0.75, 1.05, e));
  }
  return w;
};

// Ground tint weights [dry cerrado, wet, wooded floor, burnt]: the whole map
// is dry grassland; green margins along the water; darker wooded patches on
// the ridge's flanks, the hills' hollows and the gallery woods; old burn
// scars (channel 4 is read as char on this map, not rock).
export function frontierBiome(x, z, out = [0, 0, 0, 0]) {
  const dw = Math.min(waterD(x, z), Math.max(0, lakeD(x, z)));
  const wet = 0.85 * (1 - smoothstep(10, 110, dw));
  const n = valueNoise(x / 650 + 3.7, z / 650 - 8.1), n2 = valueNoise(x / 180 - 2.2, z / 180 + 4.4);
  let wood = smoothstep(0.18, 0.5, n + 0.25 * n2) * 0.85;
  wood = Math.max(wood, (1 - smoothstep(20, 150, dw)) * 0.55 * smoothstep(-0.2, 0.3, n2));
  wood = Math.max(wood, zoneW(ZONES.E, x, z) * smoothstep(-0.1, 0.35, n2) * 0.6);
  wood *= smoothstep(30, 140, frontierStripD(x, z));
  const burnt = scarW(x, z);
  out[0] = Math.max(0, 1 - wood * 0.7 - wet * 0.8) * (1 - burnt * 0.5);
  out[1] = wet;
  out[2] = wood * (1 - burnt * 0.6);
  out[3] = burnt;
  return out;
}

// Vegetation regions (src/world/vegetation.js scatters each biome over its
// region): three over the whole map, one per biome; the scatter of a point
// goes to the strongest biome there.
const ALL = { c: [0, 0], half: [FRONT_PLAY_HALF + 300, FRONT_PLAY_HALF + 300], rot: 0, fall: 100 };
export const FRONT_VEG_REGIONS = [
  { id: 'front-cerrado', biome: 'cerrado', ...ALL },
  { id: 'front-mata', biome: 'mata', ...ALL },
  { id: 'front-varzea', biome: 'varzea', ...ALL },
];
// Streaming region of the scenery (props): the whole map.
export const FRONT_REGIONS = [{ id: 'fireboss-frontier', name: 'Fireboss Frontier', biome: 'cerrado', c: [0, 0], half: [FRONT_PLAY_HALF, FRONT_PLAY_HALF], rot: 0, fall: 400 }];

// Scenery props [kind, x, z, rot] (world frame): the fire base's extra
// sheds, water tanks and drums west of the apron; BASE 03 at Lagoa das
// Garças; a few sítios by the tracks.
export const FRONT_PROPS = [
  ['galpao', -600, -70, Math.PI / 2], ['tower', -585, -112, 0], ['tower', -585, -30, 0], ['drums', -560, -18, 0],
  // BASE 03 — Ponto d'Água das Garças (on the north-east shore).
  ['galpao', -1470, 1010, 0.6], ['tower', -1440, 980, 0], ['drums', -1490, 1040, 0.3],
  // Sítios.
  ['house', -1650, 40, 0.2], ['galpao', -1615, 55, 0.2], ['corral', -1690, 110, 0.2],
  ['house', 1150, -330, -0.1], ['tower', 1170, -355, 0],
  ['shack', -150, 1720, 0.4], ['corral', -110, 1690, 0.4],
];
export const FRONT_PASTURES = [[-1820, -1700, 150, 260, 'n', 0.4]];

// Clear ground for the sítios' trees.
export const frontierCleared = (x, z) => FRONT_PROPS.some(([k, px, pz]) => Math.abs(x - px) < (k === 'corral' ? 26 : 18) && Math.abs(z - pz) < (k === 'corral' ? 26 : 18));

// A place is open land (no water, no strip): fire spots must be.
export function frontierOpen(x, z) { return lakeD(x, z) > 30 && waterD(x, z) > 25 && frontierStripD(x, z) > 60; }
