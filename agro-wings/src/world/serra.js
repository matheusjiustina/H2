// SERRA DAS BANANEIRAS — premium map expansion 01 (a separate map, chosen at
// load: src/world/activeMap.js). Everything the map is made of lives here as
// data and pure functions (no three.js): the terrain, the three strips, the
// banana talhões, forest, water, roads and rural scenery. layout.js,
// expansion.js, terrainData.js and contracts.js take their data from this
// module when the Serra is the active map; the main map never reads it.
//
// A compact mountain valley of the Brazilian banana country ("mar de
// morros"): 6 × 6 km of detailed terrain, 4.6 × 4.6 km of it playable
// (21 km², ≈ 15 % of the main map's 144 km²), ringed by forested ridges.
// Axes as the main map: x east, z south (north is −z), metres.
//
//   A  Vale das Bananeiras — the central valley (floor at 0 m), main strip.
//   B  Morros das Bananeiras — rolling hills north and south of the valley,
//      banana talhões draped over them.
//   C  Serra do Espigão — the forested ridge along the north and west, the
//      Pedra do Espigão its highest point.
//   D  Baixadão — the remote lowland in the south-east (floor at −27 m),
//      the creek, its pool and the grass strip.
//   E  Serra de Cima — the rugged hills of the south-west, the hill strip.
import { valueNoise, fbm, smoothstep, lerp, clamp, segDist } from '../core/math.js';
import { SERRA } from './activeMap.js';

export const SERRA_WORLD_HALF = 3000; // detailed terrain: 6 × 6 km (7.8 m grid)
export const SERRA_PLAY_HALF = 2300; // playable: 4.6 × 4.6 km

// ---------------------------------------------------------------------------
// Terrain.
// Distance to a polyline, smoothed (soft minimum over the segments) so the
// ground built on it has no creases along the bends' bisectors.
const polyD = (pts, x, z, k = 70) => {
  let d = 1e9, e = 0;
  for (let i = 0; i < pts.length - 1; i++) { const q = segDist(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]); if (q < d) d = q; if (q < 1400) e += Math.exp(-q / k); }
  return e > 0 ? Math.max(0, -k * Math.log(e)) : d;
};
// Valley floors: the central valley's axis, the gorge down to the lowland
// and on out of the map to the south-east, the lowland's own floor.
export const VALLEY = [[-1350, 60], [-700, 5], [0, 0], [650, 25], [1120, 110]];
export const GORGE = [[1120, 110], [1400, 330], [1500, 640], [1460, 960], [1300, 1200], [1100, 1400], [1030, 1650], [1100, 1850], [1400, 2050], [1900, 2330], [2500, 2700], [3300, 3150]];
export const LOWLAND = { x: 1340, z: 1610, r: 330 };
// The ridge of the Serra do Espigão (north and west) and its summit.
const SPINE = [[-2500, 500], [-2250, -700], [-1700, -1600], [-600, -2080], [600, -2000], [1700, -1650], [2500, -900]];
const PEDRA = { x: -1720, z: -1640, h: 70, s: 330 };
// Side valleys (corridors between the hills): a line, half width, depth.
const SIDE = [
  { pts: [[-350, -150], [-520, -700], [-380, -1250], [-650, -1700]], w: 260, k: 0.62 }, // north, into the serra
  { pts: [[-900, 120], [-1150, 650], [-1050, 1150], [-1500, 1500]], w: 240, k: 0.5 }, // south-west, up to the hill strip
  { pts: [[620, -60], [900, -600], [1350, -950], [2000, -1050]], w: 250, k: 0.55 }, // north-east
];
// Rounded hills on a rotated lattice (no axis-aligned grain): connected
// ridges (dome) and separate blobs.
const rot = (x, z, a) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];
const dome = (x, z) => { const v = valueNoise(x, z); return 1 - v * v; };
const blob = (x, z) => smoothstep(-0.6, 0.7, valueNoise(x, z));

export function serraNatural(x, z) {
  // Warp: ridges and valleys meander.
  const wx = x + 210 * valueNoise(x / 1300 + 4.2, z / 1300 - 2.7), wz = z + 210 * valueNoise(x / 1300 - 7.1, z / 1300 + 5.3);
  // Floors: 0 in the central valley, falling through the gorge to −27 in the
  // lowland and a little further on the way out.
  const s = wz * 0.92 + (wx - 1150) * 0.22;
  const base = -27 * smoothstep(430, 900, s) - 8 * smoothstep(1900, 3200, s);
  const dV = polyD(VALLEY, wx, wz), dG = polyD(GORGE, wx, wz), dL = Math.hypot(wx - LOWLAND.x, wz - LOWLAND.z);
  const m = smoothstep(180, 560, dV) * smoothstep(40, 340, dG) * smoothstep(LOWLAND.r, LOWLAND.r + 380, dL);
  // Mar de morros: large rounded hills, connected secondary ridges, folds.
  const [ax, az] = rot(wx, wz, 0.55), [bx, bz] = rot(wx, wz, -0.9), [cx, cz] = rot(x, z, 1.9);
  let hills = 10 + 128 * blob(ax / 700 + 1.3, az / 700 - 0.6) * (0.6 + 0.4 * (0.5 + 0.5 * valueNoise(wx / 2300 - 3.3, wz / 2300 + 8.1)))
    + 46 * dome(bx / 430 - 5.2, bz / 430 + 2.9) + 7 * valueNoise(cx / 210 + 9.9, cz / 210 - 4.4) + 1.6 * valueNoise(x / 70 + 3.3, z / 70 + 1.2);
  // Side valleys ease the hills down along their lines.
  for (const v of SIDE) { const d = polyD(v.pts, wx, wz); if (d < v.w * 2.2) hills *= 1 - v.k * (1 - smoothstep(v.w * 0.25, v.w * 2.2, d)); }
  // The serra: a ridge along the spine, the summit, and the rim of the map.
  const dS = polyD(SPINE, wx, wz, 150);
  const ridge = (105 + 30 * valueNoise(wx / 700 + 2.2, wz / 700 - 9.4)) * Math.exp(-(dS * dS) / (2 * 430 * 430));
  const pedra = PEDRA.h * Math.exp(-((wx - PEDRA.x) ** 2 + (wz - PEDRA.z) ** 2) / (2 * PEDRA.s * PEDRA.s));
  const rr = (wx ** 4 + wz ** 4) ** 0.25;
  const rim = smoothstep(1750, 2900, rr) * (95 + 55 * valueNoise(wx / 1500 - 1.1, wz / 1500 + 3.7));
  return base + m * (hills + ridge + pedra + rim);
}

// ---------------------------------------------------------------------------
// Strips (at most three). The main one is the map's base (the game's main
// site: service pad, loading, fuel, office); the other two are farm sites
// in the engine's own format (layout.js FARMS): a strip, a small service
// area and a local truck.
// AIRSTRIP 01 — Vale das Bananeiras: 720 × 20 m compacted red earth along
// the central valley.
export const SERRA_RUNWAY = { x0: -400, x1: 320, z: 0, width: 20, shoulder: 8 };
const SMALL = ['ipanema', 'e203', 'a188', 'pa36', 'agcat', 'e201', 'r44', 'b206'];
export const SERRA_FARMS = [
  {
    // AIRSTRIP 02 — Pista do Baixadão: grass and earth in the remote lowland,
    // forest on its south and east edges.
    id: 'baixadao', name: 'Pista do Baixadão', short: 'Baixadão', dx: 1580, dz: 1620, ring: true,
    len: 430, width: 16, surface: 2, grade: 0, difficulty: 3, color: '#6cc04a', clear: 30, tight: true,
    crops: ['banana'], weather: 'humid', marks: 'ends', shed: 'wood', aircraft: [...SMALL, 'at401', 'at502', 'thrush'],
    props: [['shack', -470, -150, 0.1], ['drums', -300, -124]],
  },
  {
    // AIRSTRIP 03 — Pista da Serra: a short rough-earth strip on a shoulder
    // of the south-west hills, climbing to the east; rarely used.
    id: 'pistadaserra', name: 'Pista da Serra', short: 'Pista da Serra', dx: -1240, dz: 1330, ring: true,
    len: 380, width: 14, surface: 4, grade: 0.03, bank: 0, difficulty: 5, color: '#c96f3b', clear: 30, tight: true, blend: 150,
    crops: ['banana'], weather: 'mist', marks: 'stakes', shed: 'wood', aircraft: SMALL,
    props: [['shack', -468, -140, 0.2]],
  },
];

// ---------------------------------------------------------------------------
// Water: the Córrego das Bananeiras along the south side of the central
// valley (CREEK: its surface follows the level floor), then down the gorge
// to the Baixadão (a stream whose level only falls), the pool there and the
// way out to the south-east.
export const SERRA_CREEK = {
  points: [[-1500, 330], [-1200, 262], [-900, 236], [-500, 232], [-100, 236], [300, 228], [650, 214], [900, 196], [1050, 176]],
  width: 6, depth: 1.5, valley: 70, valleyDepth: 1.6,
};
export const SERRA_STREAMS = [
  { name: 'Córrego das Bananeiras', width: 6, depth: 1.4, valley: 60, valleyDepth: 1.8,
    points: [[1050, 176], [1150, 190], [1290, 270], [1400, 380], [1470, 520], [1500, 680], [1480, 840], [1440, 980], [1360, 1110], [1250, 1230], [1140, 1350], [1070, 1480], [1035, 1600], [1040, 1700]] },
  { name: 'Córrego do Baixadão', width: 6, depth: 1.3, valley: 60, valleyDepth: 1.6,
    points: [[1085, 1850], [1180, 1930], [1320, 2010], [1520, 2110], [1750, 2240], [1980, 2380], [2250, 2540], [2550, 2720], [2900, 2930]] },
];
export const SERRA_PONDS = [
  { name: 'Poço do Baixadão', x: 1052, z: 1772, r: 44, depth: 2.2, ph: 1.3, bank: 0.05, blend: 2.0, trees: 1.3, open: 0.6, lobes: [0.16, 0.1, 0.05, 0.02] },
];

// ---------------------------------------------------------------------------
// Roads: one short stretch in the ground shader (the base's access on the
// level valley floor); every other is a red-earth track draped on the hills
// (mesh: true, resampled every ~40 m).
function track(w, ...way) {
  const pts = [way[0]];
  for (let i = 1; i < way.length; i++) {
    const [ax, az] = way[i - 1], [bx, bz] = way[i];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 40));
    for (let k = 1; k <= n; k++) pts.push([Math.round(ax + ((bx - ax) * k) / n), Math.round(az + ((bz - az) * k) / n)]);
  }
  return { w, mesh: true, ring: true, pts };
}
export const SERRA_ROADS = [
  { w: 7, pts: [[-760, -150], [-560, -150], [-445, -150], [-445, -121]] },
  // The valley road: west out of the map, east along the north side of the
  // valley and down the gorge's west bank to the Baixadão strip.
  track(6, [-2960, 180], [-2300, 120], [-1700, -40], [-1250, -130], [-760, -150]),
  track(6, [-445, -150], [-200, -205], [330, -215], [760, -180], [1010, -60], [1180, 60]),
  track(5, [1180, 60], [1300, 180], [1380, 330], [1400, 560], [1380, 800], [1330, 1000], [1240, 1140], [1150, 1290], [1120, 1440], [1140, 1530], [1160, 1560]),
  // Up the south-west side valley to the Pista da Serra.
  track(5, [-760, -150], [-860, 40], [-880, 190], [-1000, 420], [-1130, 700], [-1160, 960], [-1330, 1150], [-1560, 1220], [-1670, 1240]),
  // North, into the serra's foot (the sítio and the upper talhões).
  track(5, [-200, -205], [-330, -420], [-470, -720], [-420, -1010], [-380, -1260]),
  // North-east side valley.
  track(5, [760, -180], [860, -420], [1010, -640], [1270, -860], [1560, -960]),
];

// ---------------------------------------------------------------------------
// Where nothing is planted or grown: the strips with their service areas
// and approach lanes, the water, the roads.
const stripRects = () => [SERRA_RUNWAY, ...SERRA_FARMS.map((f) => ({ x0: -400 + f.dx, x1: -400 + f.dx + f.len, z: f.dz, width: f.width }))];
function nearStrip(x, z, side = 70, run = 330) {
  for (const r of stripRects()) {
    if (x > r.x0 - run && x < r.x1 + run && Math.abs(z - r.z) < side) return true;
    if (x > r.x0 - 130 && x < r.x0 + 110 && z > r.z - 190 && z < r.z + 40) return true; // service area (north-west of the west end)
  }
  return false;
}
const waterD = (x, z) => {
  let d = polyD(SERRA_CREEK.points, x, z, 15);
  for (const st of SERRA_STREAMS) d = Math.min(d, polyD(st.points, x, z, 15));
  for (const p of SERRA_PONDS) d = Math.min(d, Math.hypot(x - p.x, z - p.z) - p.r * 1.3);
  return d;
};
const roadD = (x, z) => { let d = 1e9; for (const r of SERRA_ROADS) d = Math.min(d, polyD(r.pts, x, z, 8)); return d; };
const slopeAt = (x, z, e = 10) => Math.hypot(serraNatural(x + e, z) - serraNatural(x - e, z), serraNatural(x, z + e) - serraNatural(x, z - e)) / (2 * e);
const free = (x, z) => Math.max(Math.abs(x), Math.abs(z)) < SERRA_PLAY_HALF - 120 && !nearStrip(x, z) && waterD(x, z) > 32 && roadD(x, z) > 16;

// ---------------------------------------------------------------------------
// Banana talhões. A plot is grown from a seed over the terrain: bands 60 m
// deep laid along the contour (rows across the slope), each band reaching
// as far each way as the ground stays near the band's height and workable —
// so a plot is a stack of rectangles with stepped ends that follows its
// hillside (the engine's irregular-field format: one rectangle per band,
// one contract over the plot's bands). Deterministic: the same terrain
// gives the same plots.
const BAND = 60;
function growPlot(sx, sz, maxSlope, taken, maxBands = 4, MAXHALF = 170) {
  const gx = serraNatural(sx + 15, sz) - serraNatural(sx - 15, sz), gz = serraNatural(sx, sz + 15) - serraNatural(sx, sz - 15);
  const axis = Math.abs(gz) >= Math.abs(gx) ? 'x' : 'z'; // rows along x when the slope runs north–south
  const P = (u, v) => (axis === 'x' ? [u, v] : [v, u]); // u along the rows, v across
  const [su, sv] = axis === 'x' ? [sx, sz] : [sz, sx];
  const ok = (u, v) => { const [x, z] = P(u, v); return free(x, z) && slopeAt(x, z) < maxSlope && !taken(x, z); };
  const bands = [];
  const band = (vc, uc, href) => {
    const [cx, cz] = P(uc, vc);
    const h0 = serraNatural(cx, cz);
    if (!ok(uc, vc) || (href !== null && Math.abs(h0 - href) > 24)) return null;
    let u0 = uc, u1 = uc;
    const good = (u) => { for (const dv of [-BAND / 2 + 4, 0, BAND / 2 - 4]) { if (!ok(u, vc + dv)) return false; } const [x, z] = P(u, vc); return Math.abs(serraNatural(x, z) - h0) < 15; };
    while (uc - u0 < MAXHALF && good(u0 - 10)) u0 -= 10;
    while (u1 - uc < MAXHALF && good(u1 + 10)) u1 += 10;
    return u1 - u0 >= 90 ? { u0, u1, v0: vc - BAND / 2, v1: vc + BAND / 2, h: h0, uc: (u0 + u1) / 2 } : null;
  };
  const first = band(sv, su, null);
  if (!first) return null;
  bands.push(first);
  for (const dir of [-1, 1]) {
    let prev = first;
    for (let k = 1; k <= 3 && bands.length < maxBands; k++) {
      const nb = band(sv + dir * k * BAND, clamp(prev.uc, prev.u0 + 30, prev.u1 - 30), prev.h);
      if (!nb || Math.min(nb.u1, prev.u1) - Math.max(nb.u0, prev.u0) < 60) break;
      if (dir < 0) bands.unshift(nb); else bands.push(nb);
      prev = nb;
    }
  }
  const rects = bands.map((bd) => (axis === 'x' ? { x0: bd.u0, x1: bd.u1, z0: bd.v0, z1: bd.v1 } : { x0: bd.v0, x1: bd.v1, z0: bd.u0, z1: bd.u1 }));
  const ha = rects.reduce((a, r) => a + (r.x1 - r.x0) * (r.z1 - r.z0), 0) / 1e4;
  return ha >= 1.6 ? { axis, rects, ha } : null;
}
function buildPlots() {
  const plots = [];
  const taken = (x, z) => plots.some((p) => p.rects.some((r) => x > r.x0 - 40 && x < r.x1 + 40 && z > r.z0 - 40 && z < r.z1 + 40));
  // Seeds on a jittered lattice. First the workable ground (the contract
  // plots come from these), nearest the roads first; then steeper hillsides
  // (plantations seen from the air). Size and depth vary from plot to plot.
  const seeds = [];
  for (let j = -7; j <= 7; j++) for (let i = -7; i <= 7; i++) {
    const x = i * 300 + 110 * valueNoise(i * 1.7 + 0.3, j * 1.3 - 4.1), z = j * 300 + 110 * valueNoise(i * 1.1 - 8.2, j * 1.9 + 2.6);
    seeds.push([x, z, roadD(x, z) + 900 * slopeAt(x, z, 20), 0.5 + 0.5 * valueNoise(i * 3.3 + 1.2, j * 2.7 - 0.8)]);
  }
  seeds.sort((p, q) => p[2] - q[2]);
  for (const [pass, cap] of [[0.21, 40], [0.36, 62]]) for (const [x, z, , u] of seeds) {
    if (plots.length >= cap) break;
    if (taken(x, z)) continue;
    const pl = growPlot(Math.round(x / 10) * 10, Math.round(z / 10) * 10, pass, taken, 2 + Math.round(u * 2.4), 90 + Math.round(u * 9) * 10);
    if (pl) { pl.steep = pass > 0.25; plots.push(pl); }
  }
  return plots;
}
// (Grown only when the Serra is the active map: on any other map nothing of
// it is built — no CPU spent on a map that is not loaded.)
export const SERRA_PLOTS = SERRA ? buildPlots() : [];
// Site of a plot (its contracts are flown from the nearest strip).
const siteOf = (pl) => {
  const cx = pl.rects.reduce((a, r) => a + (r.x0 + r.x1) / 2, 0) / pl.rects.length, cz = pl.rects.reduce((a, r) => a + (r.z0 + r.z1) / 2, 0) / pl.rects.length;
  pl.c = [cx, cz];
  let best = 'main', bd = Math.hypot(cx + 350, cz + 60);
  for (const f of SERRA_FARMS) { const d = Math.hypot(cx - (f.dx - 350), cz - (f.dz - 60)); if (d < bd * 0.8) { bd = d; best = f.id; } }
  pl.site = best; pl.dist = bd;
  return best;
};
SERRA_PLOTS.forEach(siteOf);
// Contract plots: workable ones, the larger first, spread over the three
// strips (5 at the base, up to 3 at each farm strip); the rest is scenery.
{
  const pick = (site, n) => SERRA_PLOTS.filter((p) => !p.steep && p.site === site && p.rects.length >= 2 && p.dist < 1500).sort((a, b) => a.dist - b.dist).slice(0, n);
  let k = 0;
  for (const [site, n] of [['main', 5], ['baixadao', 3], ['pistadaserra', 3]]) for (const pl of pick(site, n)) pl.contract = `sb-${String(++k).padStart(2, '0')}`;
}
// Contract plots are FIELDS (coverage, GPS, ground); the others are groves:
// banana plantations planted the same way, scenery only.
export const SERRA_FIELDS = [];
export const SERRA_GROVES = [];
SERRA_PLOTS.forEach((pl, i) => {
  pl.name = `B-${String(i + 1).padStart(2, '0')}`;
  pl.rects.forEach((r, k) => {
    if (!pl.contract) { SERRA_GROVES.push({ ...r, rowAxis: pl.axis, plot: pl.name }); return; }
    SERRA_FIELDS.push({
      name: `${pl.name}${'ABCDE'[k]}`, ...r, rowAxis: pl.axis, growth: 1,
      extra: { plot: pl.name, contract: pl.contract, ...(pl.site !== 'main' ? { farm: pl.site } : {}), level: 2 },
    });
  });
});
const allRects = [...SERRA_FIELDS, ...SERRA_GROVES];
const inField = (x, z, m = 0) => allRects.some((f) => x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m);

// ---------------------------------------------------------------------------
// Sítios: a handful of small homesteads beside the farm tracks, on level
// ground between the plantations (house, and by turns a shed, a water tank,
// a corral with its trough and fenced pasture). Found on the terrain the
// same way every time; the forest is cleared round them.
export const SERRA_SITIOS = [];
export const SERRA_PROPS = [];
export const SERRA_PASTURES = [];
if (SERRA) {
  const ok = (x, z, m) => free(x, z) && !inField(x, z, m) && slopeAt(x, z, 16) < 0.13 && serraNatural(x, z) < 110;
  const KINDS = [['galpao', 'tower'], ['corral'], ['tower'], ['galpao'], ['corral', 'tower'], ['shack'], ['galpao']];
  for (const road of SERRA_ROADS.slice(1)) {
    let acc = 140;
    for (let i = 1; i < road.pts.length && SERRA_SITIOS.length < 8; i++) {
      const [ax, az] = road.pts[i - 1], [bx, bz] = road.pts[i], len = Math.hypot(bx - ax, bz - az);
      for (let u = 0; u < len; u += 40) {
        acc += 40;
        if (acc < 300) continue;
        const dx = (bx - ax) / len, dz = (bz - az) / len;
        let side = SERRA_SITIOS.length % 2 ? 1 : -1, x, z, fits = false;
        for (let t = 0; t < 2 && !fits; t++, side = -side) {
          x = Math.round(ax + dx * u - dz * side * 44); z = Math.round(az + dz * u + dx * side * 44);
          fits = [[0, 0], [28, 0], [-28, 0], [0, 28], [0, -28]].every(([ox, oz]) => ok(x + ox, z + oz, 16));
          if (fits) break;
        }
        if (!fits || SERRA_SITIOS.some((p) => Math.hypot(p.x - x, p.z - z) < 420)) continue;
        const rot = Math.round(Math.atan2(dx, dz) * 20) / 20, kinds = KINDS[SERRA_SITIOS.length % KINDS.length];
        SERRA_SITIOS.push({ x, z });
        SERRA_PROPS.push([kinds.includes('shack') ? 'shack' : 'house', x, z, rot]);
        const cs = Math.cos(rot), sn = Math.sin(rot), at = (lx, lz) => [Math.round(x + lx * cs + lz * sn), Math.round(z - lx * sn + lz * cs)];
        if (kinds.includes('galpao')) SERRA_PROPS.push(['galpao', ...at(30, 8), rot]);
        if (kinds.includes('tower')) SERRA_PROPS.push(['tower', ...at(-16, -14), 0]);
        if (kinds.includes('corral')) {
          const [cx, cz] = at(-44, 26);
          if (ok(cx, cz, 30)) {
            SERRA_PROPS.push(['corral', cx, cz, rot], ['trough', ...at(-22, 30), rot]);
            const px = cx - side * dz * 60, pz = cz + side * dx * 60;
            if (ok(px - 50, pz - 40, 6) && ok(px + 50, pz + 40, 6) && ok(px + 50, pz - 40, 6) && ok(px - 50, pz + 40, 6)) SERRA_PASTURES.push([Math.round(px - 55), Math.round(px + 55), Math.round(pz - 44), Math.round(pz + 44), 'n', 0.4]);
          }
        }
        acc = 0;
      }
    }
  }
}
const sitioD = (x, z) => { let d = 1e9; for (const p of SERRA_SITIOS) d = Math.min(d, Math.hypot(p.x - x, p.z - z)); return d; };

// ---------------------------------------------------------------------------
// Forest: the Atlantic forest stands where the land is not farmed — the
// serra and the rim, the hilltops, the steep sides and the gorge. A density
// 0..1 at a point, continuous (the forest's outline is the terrain's own,
// not a block): the canopy mesh, the edge trees, the ground tint and the
// obstacle volume all read it. hOf: the height function (the terrain grid
// in the game; the analytic ground by default).
const rectD = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
const stripD = (x, z) => {
  let d = 1e9;
  for (const r of stripRects()) {
    d = Math.min(d, rectD({ x0: r.x0 - 420, x1: r.x1 + 420, z0: r.z - 95, z1: r.z + 95 }, x, z), rectD({ x0: r.x0 - 150, x1: r.x0 + 130, z0: r.z - 210, z1: r.z + 60 }, x, z));
  }
  return d;
};
export function serraWild(x, z, hOf = serraNatural) {
  const h = hOf(x, z), sl = Math.hypot(hOf(x + 20, z) - hOf(x - 20, z), hOf(x, z + 20) - hOf(x, z - 20)) / 40;
  const n = valueNoise(x / 420 + 6.1, z / 420 - 2.2), n2 = valueNoise(x / 130 - 1.4, z / 130 + 7.7);
  const rr = Math.max(Math.abs(x), Math.abs(z));
  let w = Math.max(smoothstep(96, 126, h + 24 * n + 8 * n2), smoothstep(0.31, 0.41, sl + 0.05 * n2), smoothstep(0.12, 0.4, n) * smoothstep(46, 68, h),
    smoothstep(SERRA_PLAY_HALF + 40, SERRA_PLAY_HALF + 260, rr + 130 * n));
  if (z > 380 && z < 1300) w = Math.max(w, (1 - smoothstep(70, 170, polyD(GORGE, x, z, 30) + 40 * n2)) * smoothstep(380, 520, z) * (1 - smoothstep(1150, 1300, z)));
  if (w <= 0) return 0;
  let df = 1e9;
  for (const r of allRects) { const d = rectD(r, x, z); if (d < df) df = d; }
  return w * smoothstep(24, 70, df) * smoothstep(0, 60, stripD(x, z)) * smoothstep(6, 24, waterD(x, z)) * smoothstep(6, 18, roadD(x, z)) * smoothstep(55, 110, sitioD(x, z));
}
// Obstacle volume of the forest: 50 m cells of closed forest merged into
// boxes (the engine's forest-collider format; top above the ground).
function buildForestBoxes() {
  const C = 50, N = Math.floor((SERRA_WORLD_HALF - 50) / C), W = 2 * N;
  const on = new Uint8Array(W * W);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) if (serraWild((i - N + 0.5) * C, (j - N + 0.5) * C) > 0.55) on[j * W + i] = 1;
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
let forestBoxes = null;
export const serraForestBoxes = () => (forestBoxes ??= buildForestBoxes());
// (No forest blocks: the Serra's forest is the continuous one above.)
export const SERRA_FORESTS = [];

// ---------------------------------------------------------------------------
// Scenery (the engine's expansion-scenery formats: streamed with the
// region, plain box colliders). Props [kind, x, z, rot]; pastures
// [x0, x1, z0, z1, gateSide, gateAt].
export const SERRA_REGIONS = [
  { id: 'serra-bananeiras', name: 'Serra das Bananeiras', biome: 'mata', c: [0, 0], half: [2300, 2300], rot: 0, fall: 400 },
];

// Ground tint weights [cerrado, wet, forest floor, rock]: forest floor on the
// high and steep ground (where the forest stands), wet along the water.
export function serraBiome(x, z, out = [0, 0, 0, 0]) {
  out[0] = out[3] = 0;
  out[2] = Math.min(1, serraWild(x, z) * 1.2);
  let dw = polyD(SERRA_CREEK.points, x, z, 20);
  for (const st of SERRA_STREAMS) dw = Math.min(dw, polyD(st.points, x, z, 20));
  out[1] = 0.8 * (1 - smoothstep(12, 80, dw));
  // Banana groves (scenery plantations): the deep green of their floor.
  let dg = 1e9;
  for (const r of SERRA_GROVES) { const d = rectD(r, x, z); if (d < dg) dg = d; }
  out[1] = Math.max(out[1], 0.95 * (1 - smoothstep(0, 22, dg)));
  return out;
}
