// World Expansion 2.0 — the new landscapes inside the existing 12 × 12 km map:
// five regions placed in the largest stretches the audit found visually
// empty (no fields, forest, water, buildings and almost no tall trees),
// each with its own landform and biome, six auxiliary strips, three rivers
// (two waterfalls), lagoons, roads and small rural properties.
//
// Pure JS (no three.js): the terrain grid, the flight model's ground, the
// renderer and the tests all read the same functions. Every landform has
// compact support and sits away from the farms, their strips, fields,
// roads, forests and water (test/expansion.test.mjs checks the distances and
// that the heights everywhere else are bit-for-bit the old ones).
//
// Coordinates: x east, z south (north is −z), metres; strip headings are the
// angle of the strip's axis from +x towards +z.
import { SERRA, FRONTIER, MATOGROSSO } from './activeMap.js';
import * as SB from './serra.js';
import * as FB from './frontier.js';
import * as MT from './matogrosso.js';
import { smoothstep, lerp, clamp, valueNoise } from '../core/math.js';

// ---------------------------------------------------------------------------
// Regions (biome identity; outline = rounded rectangle, soft warped edge).
export const EXP_REGIONS = [
  { id: 'cerrado', name: 'Cerrado do Chapéu', biome: 'cerrado', c: [-2250, -4700], half: [1350, 1050], rot: 0.05, fall: 650 },
  { id: 'serra', name: 'Serra das Pedras', biome: 'serra', c: [4750, -2800], half: [1050, 1050], rot: 0, fall: 550 },
  { id: 'morros', name: 'Morros do Leste', biome: 'morros', c: [5100, 1650], half: [800, 1250], rot: 0, fall: 500 },
  { id: 'mata', name: 'Mata do Jatobá', biome: 'mata', c: [-4800, 2700], half: [1150, 850], rot: 0, fall: 500 },
  { id: 'varzea', name: 'Várzea do Taquaral', biome: 'varzea', c: [2750, 5100], half: [950, 800], rot: 0.1, fall: 450 },
];

// ---------------------------------------------------------------------------
// Landforms.
// Mesas (chapadas, morros-testemunho): a flat top at an absolute height
// (top, m), a sandstone cliff along the upper part of the scarp and a talus
// below down to the land around; the outline is warped into re-entrant
// ravines. cliffW / talusW in metres. Applied lowest first (the step under
// the chapada, then the chapada).
export const MESAS = [
  // The lower step west of the chapada (the river's second fall).
  { id: 'degrau', name: 'Degrau das Pedras', c: [4560, -2960], half: [330, 360], rot: 0.1, round: 120, top: 22, cliffW: 16, cliffFrac: 0.8, talusW: 90, warp: 30 },
  { id: 'chapada', name: 'Chapada das Pedras', c: [5200, -3150], half: [520, 500], rot: 0.15, round: 150, top: 52, cliffW: 26, cliffFrac: 0.82, talusW: 140, warp: 95 },
  // Isolated buttes: landmarks seen from far.
  { id: 'frade', name: 'Morro do Frade', c: [4120, -1620], half: [150, 130], rot: 0.4, round: 110, top: 18, cliffW: 18, cliffFrac: 0.72, talusW: 110, warp: 22 },
  { id: 'chapeu', name: 'Morro do Chapéu', c: [-1950, -4550], half: [170, 150], rot: -0.2, round: 130, top: 20, cliffW: 18, cliffFrac: 0.68, talusW: 120, warp: 24 },
];
const MESA_BY = Object.fromEntries(MESAS.map((m) => [m.id, m]));
// Serra: ridge along a spine, height per point, gaussian flanks (sigma),
// spurs and ravines from noise.
export const RIDGES = [
  { id: 'tatu', name: 'Serra do Tatu', pts: [[4000, -3620], [4200, -3470], [4400, -3390], [4620, -3460]], H: [18, 34, 40, 34], sigma: 150 },
];
// Rounded hills ("meia-laranja"): centre, radius, height.
export const HILLS = [
  // Morros do Leste.
  { x: 5550, z: 850, r: 330, h: 40, name: 'Morro Redondo' },
  { x: 4700, z: 900, r: 300, h: 26 },
  { x: 5650, z: 2080, r: 330, h: 30 },
  { x: 4600, z: 2350, r: 270, h: 22 },
  { x: 5150, z: 2700, r: 250, h: 17 },
  { x: 4450, z: 1530, r: 210, h: 10 },
  // Serra das Pedras, south-east foot.
  { x: 5560, z: -2250, r: 300, h: 22 },
  { x: 5700, z: -1960, r: 220, h: 15 },
  // Cerrado: low colinas.
  { x: -3300, z: -5300, r: 520, h: 12 },
  { x: -2350, z: -5250, r: 450, h: 10 },
  { x: -1450, z: -4150, r: 480, h: 9 },
  { x: -3500, z: -4000, r: 330, h: 8 },
];
// Lowland (várzea): the ground eased down a few metres, swales inside.
export const BASINS = [
  { id: 'taquaral', c: [2700, 5150], half: [700, 640], rot: 0.1, round: 300, depth: 3.5, fall: 330 },
];

// ---------------------------------------------------------------------------
// Auxiliary strips (open world, no service): A open rural strip in the
// cerrado pastures, B an old farm strip in the várzea, C a strip on a
// grade among the hills, D a clearing in the forest, E a rough strip on
// the foot of the serra (controlled undulation), F a remote unlisted strip.
//   psi: axis heading; grade: rise per metre towards +axis; bank: rise per
//   metre across (towards +normal); bumps: [amplitude m, wavelength m];
//   surface: 1 red earth, 2 grass, 4 rough earth, 5 sand; clear: half
//   width kept clear of tall trees; run: approach corridor beyond each end.
export const AUX_STRIPS = [
  { id: 'cerrado', kind: 'A', name: 'Pista do Cerrado', region: 'cerrado', c: [-2850, -4650], psi: -0.08, len: 520, width: 18, surface: 1, grade: 0, bank: 0, clear: 60, run: 320, blend: 140,
    note: 'Faixa aberta de terra vermelha em pastagem de Cerrado, cercada, com estrada de acesso.' },
  { id: 'taquaral', kind: 'B', name: 'Pista Velha do Taquaral', region: 'varzea', c: [2300, 5420], psi: 0.05, len: 450, width: 16, surface: 2, grade: 0, bank: 0.004, clear: 50, run: 300, blend: 130,
    note: 'Pista antiga de grama gasta numa fazenda de várzea, pouco usada.' },
  { id: 'morro', kind: 'C', name: 'Pista do Morro Redondo', region: 'morros', c: [5050, 1380], psi: 0, len: 420, width: 15, surface: 1, grade: -0.022, bank: -0.006, clear: 50, run: 300, blend: 150,
    note: 'Pista em aclive para oeste (2,2 %) entre morros; relevo em volta e na aproximação oeste.' },
  { id: 'jatoba', kind: 'D', name: 'Clareira do Jatobá', region: 'mata', c: [-4800, 2600], psi: 0, len: 400, width: 14, surface: 4, grade: -0.018, bank: 0, clear: 34, run: 300, blend: 110,
    note: 'Faixa estreita numa clareira de mata alta, estrada de terra estreita.' },
  { id: 'grota', kind: 'E', name: 'Pista da Grota', region: 'serra', c: [4700, -2050], psi: 0.25, len: 380, width: 14, surface: 4, grade: 0.03, bank: 0.008, bumps: [0.32, 85], clear: 50, run: 300, blend: 120,
    note: 'Pista rústica e irregular no sopé da serra (ondulações suaves do solo).' },
  { id: 'esquecida', kind: 'F', name: 'Pista Esquecida', region: 'cerrado', c: [-4550, -5760], psi: 0.05, len: 360, width: 13, surface: 5, grade: 0, bank: 0, clear: 45, run: 280, blend: 110, remote: true,
    note: 'Faixa remota sem infraestrutura, não catalogada; só pedras marcando as cabeceiras.' },
];
for (const s of AUX_STRIPS) {
  s.ax = Math.cos(s.psi); s.az = Math.sin(s.psi);
  s.y0 = 0; // set by terrainData (mean natural ground under the strip)
}
// Strip frame: along (u, from the centre towards +axis) and across (v).
export function stripUV(s, x, z) {
  const dx = x - s.c[0], dz = z - s.c[1];
  return [dx * s.ax + dz * s.az, -dx * s.az + dz * s.ax];
}
export function auxStripLevel(s, u, v) {
  let y = s.y0 + s.grade * (clamp(u, -s.len / 2, s.len / 2) + s.len / 2) + s.bank * clamp(v, -s.width, s.width);
  if (s.bumps) {
    const [a, L] = s.bumps, uu = clamp(u, -s.len / 2 - 40, s.len / 2 + 40);
    y += a * (Math.sin((uu / L) * Math.PI * 2 + 0.7) + 0.45 * Math.sin((uu / (L * 0.62)) * Math.PI * 2 + 2.1));
  }
  return y;
}
// The strip a point lies on (runway rectangle), or null.
export function auxStripAt(x, z, margin = 0) {
  for (const s of AUX_STRIPS) {
    if (Math.abs(x - s.c[0]) > s.len / 2 + 30 || Math.abs(z - s.c[1]) > s.len / 2 + 30) continue;
    const [u, v] = stripUV(s, x, z);
    if (Math.abs(u) <= s.len / 2 + margin && Math.abs(v) <= s.width / 2 + margin) return s;
  }
  return null;
}
// Corridor kept clear of tall trees (strip + its approaches).
export function inStripCorridor(x, z, tall = true) {
  for (const s of AUX_STRIPS) {
    const reach = s.len / 2 + (tall ? s.run : 25);
    if (Math.abs(x - s.c[0]) > reach + 80 || Math.abs(z - s.c[1]) > reach + 80) continue;
    const [u, v] = stripUV(s, x, z);
    if (Math.abs(u) < reach && Math.abs(v) < (tall ? s.clear : s.width / 2 + 8)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Shapes.
function sdRoundRect(x, z, c, half, rot, round) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const dx = x - c[0], dz = z - c[1];
  const u = Math.abs(dx * cs + dz * sn) - (half[0] - round), v = Math.abs(-dx * sn + dz * cs) - (half[1] - round);
  return Math.hypot(Math.max(u, 0), Math.max(v, 0)) + Math.min(Math.max(u, v), 0) - round;
}
// Signed distance to a mesa's warped outline (< 0 inside).
export function mesaSd(m, x, z) {
  // Re-entrant ravines and spurs at three scales.
  const w = m.warp * (0.55 * valueNoise(x / 260 + m.c[0] * 0.001, z / 260 - 3.7) + 0.3 * valueNoise(x / 110 - 5.1, z / 110 + m.c[1] * 0.001) + 0.15 * valueNoise(x / 45 + 1.3, z / 45 - 2.9));
  return sdRoundRect(x, z, m.c, m.half, m.rot, m.round) + w;
}
// Share of the mesa's top at a point (1 on the top, 0 beyond the talus).
function mesaWeight(m, sd) {
  if (sd > m.cliffW + m.talusW) return 0;
  const drop1 = m.cliffFrac * smoothstep(-6, m.cliffW, sd);
  const drop2 = (1 - m.cliffFrac) * Math.pow(smoothstep(m.cliffW * 0.3, m.cliffW + m.talusW, sd), 0.75);
  return 1 - drop1 - drop2;
}
function ridgeHeight(r, x, z) {
  let best = 1e9, bh = 0;
  const p = r.pts;
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i], [bx, bz] = p[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) { best = d; bh = lerp(r.H[i], r.H[i + 1], t); }
  }
  // Spurs and ravines: the flank width and the crest wander.
  const sig = r.sigma * (1 + 0.32 * valueNoise(x / 260 + 4.4, z / 260 - 8.2));
  const k = best / sig;
  if (k > 2.6) return 0;
  const rav = 1 - 0.22 * Math.abs(valueNoise(x / 120 - 2.6, z / 120 + 6.1));
  return bh * Math.exp(-0.5 * k * k) * (1 - smoothstep(2.0, 2.6, k)) * rav * (1 + 0.08 * valueNoise(x / 60, z / 60));
}
function hillHeight(hl, x, z) {
  const d = Math.hypot(x - hl.x, z - hl.z) * (1 + 0.1 * valueNoise(x / 170 + hl.x * 0.01, z / 170));
  if (d >= hl.r) return 0;
  const u = d / hl.r;
  return hl.h * Math.pow(0.5 + 0.5 * Math.cos(Math.PI * u), 1.15);
}

// Bounding boxes for the early reject (every landform's compact support).
const BOXES = [];
for (const m of MESAS) {
  const R = Math.hypot(m.half[0], m.half[1]) + m.cliffW + m.talusW + m.warp + 10;
  m.box = [m.c[0] - R, m.c[0] + R, m.c[1] - R, m.c[1] + R];
  BOXES.push(m.box);
}
for (const r of RIDGES) {
  const xs = r.pts.map((p) => p[0]), zs = r.pts.map((p) => p[1]), M = r.sigma * 1.32 * 2.6 + 10;
  r.box = [Math.min(...xs) - M, Math.max(...xs) + M, Math.min(...zs) - M, Math.max(...zs) + M];
  BOXES.push(r.box);
}
for (const h of HILLS) { const R = h.r * 1.12 + 5; h.box = [h.x - R, h.x + R, h.z - R, h.z + R]; BOXES.push(h.box); }
for (const b of BASINS) {
  const R = Math.hypot(b.half[0], b.half[1]) + b.fall + 10;
  b.box = [b.c[0] - R, b.c[0] + R, b.c[1] - R, b.c[1] + R];
  BOXES.push(b.box);
}
const inBox = (b, x, z) => x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3];
export const EXP_BOXES = BOXES;

// Relief added to the natural ground at (x, z), metres (0 outside every
// landform's support).
export function expansionReliefAt(x, z) {
  let any = false;
  for (const b of BOXES) if (inBox(b, x, z)) { any = true; break; }
  if (!any) return 0;
  let h = 0;
  for (const hl of HILLS) if (inBox(hl.box, x, z)) h += hillHeight(hl, x, z);
  for (const r of RIDGES) if (inBox(r.box, x, z)) h += ridgeHeight(r, x, z);
  for (const b of BASINS) {
    if (!inBox(b.box, x, z)) continue;
    const sd = sdRoundRect(x, z, b.c, b.half, b.rot, b.round);
    const w = 1 - smoothstep(-b.fall * 0.3, b.fall, sd);
    // Swales and slightly higher dikes (cordões) across the lowland.
    h += -b.depth * w + 0.7 * w * valueNoise(x / 160 + 9.1, z / 160 - 2.4);
  }
  return h;
}
// The mesas over the natural ground h at (x, z): flat tops at their own
// height (low irregular relief of eroded sandstone, fading at the rim), the
// cliff and talus down to h.
export function expansionMesas(h, x, z) {
  for (const m of MESAS) {
    if (!inBox(m.box, x, z)) continue;
    const sd = mesaSd(m, x, z), w = mesaWeight(m, sd);
    if (w <= 0) continue;
    const top = m.top + 1.4 * valueNoise(x / 140 + 2.2, z / 140 - 1.3) * (1 - smoothstep(-60, 0, sd));
    h = lerp(h, top, w);
  }
  return h;
}

// ---------------------------------------------------------------------------
// Water: rivers (split at the falls), plunge pools and lagoons. Levels are
// set by terrainData like the other streams (under the banks, never rising
// downstream); exp: true keeps them out of the original placements.
const RIO = [[5560, -3450], [5400, -3330], [5250, -3260], [5080, -3180], [4950, -3120], [4800, -3070], [4650, -3030], [4520, -2990],
  [4400, -2960], [4280, -2950], [4150, -2900], [4050, -2830], [3960, -2770], [3890, -2730]];
// Walk a polyline from the start; the point where fn first holds (1 m steps).
function walkUntil(pts, fn) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    for (let s = 0; s <= L; s += 1) {
      const x = ax + ((bx - ax) * s) / L, z = az + ((bz - az) * s) / L;
      if (fn(x, z)) return { i, x, z };
    }
  }
  return null;
}
// Split the river where it leaves each mesa: lip on the rim (sd −8), base at
// the foot of the cliff (sd cliffW + 10).
function splitAtFalls(pts, mesas) {
  const parts = [], falls = [];
  let rest = pts;
  for (const m of mesas) {
    const lip = walkUntil(rest, (x, z) => mesaSd(m, x, z) > -8);
    const base = walkUntil(rest, (x, z) => mesaSd(m, x, z) > m.cliffW + 10);
    parts.push([...rest.slice(0, lip.i + 1), [Math.round(lip.x), Math.round(lip.z)]]);
    falls.push({ mesa: m.id, lip: [lip.x, lip.z], base: [base.x, base.z] });
    rest = [[Math.round(base.x), Math.round(base.z)], ...rest.slice(base.i + 1)];
  }
  parts.push(rest);
  return { parts, falls };
}
const RIO_SPLIT = splitAtFalls(RIO, [MESA_BY.chapada, MESA_BY.degrau]);
// Each fall's pool sits at its base; the river below starts beyond the pool.
const POOL_R = [17, 13];
export const EXP_FALLS = RIO_SPLIT.falls.map((f, i) => ({
  ...f, name: i === 0 ? 'Cachoeira do Véu' : 'Cachoeira da Grota', pool: POOL_R[i], width: i === 0 ? 9 : 7,
}));
// Push the downstream reach's first point out of its pool's bowl.
function startBeyond(pts, c, d) {
  const out = pts.slice();
  while (out.length > 2 && Math.hypot(out[1][0] - c[0], out[1][1] - c[1]) < d) out.splice(1, 1);
  const [bx, bz] = out[1], L = Math.hypot(bx - c[0], bz - c[1]);
  out[0] = [Math.round(c[0] + ((bx - c[0]) * d) / L), Math.round(c[1] + ((bz - c[1]) * d) / L)];
  return out;
}
// Stop a reach before a lagoon's bowl.
function endBefore(pts, c, d) {
  const out = pts.slice();
  while (out.length > 2 && Math.hypot(out[out.length - 2][0] - c[0], out[out.length - 2][1] - c[1]) < d) out.splice(out.length - 2, 1);
  const [ax, az] = out[out.length - 2], L = Math.hypot(ax - c[0], az - c[1]);
  out[out.length - 1] = [Math.round(c[0] + ((ax - c[0]) * d) / L), Math.round(c[1] + ((az - c[1]) * d) / L)];
  return out;
}
const LAGOA_PEDRAS = { name: 'Lagoa das Pedras', exp: true, x: 3820, z: -2690, r: 70, depth: 2.2, ph: 1.1, bank: 0.045, blend: 2.2, trees: 1.2, open: 0.4, lobes: [0.14, 0.1, 0.05, 0.02] };
// The Mata do Jatobá's lagoon lies in the bottom of its basin; two creeks
// come down to it from the west and the east.
const LAGOA_JATOBA = { name: 'Lagoa do Jatobá', exp: true, x: -4780, z: 2960, r: 85, depth: 2.4, ph: 2.9, bank: 0.04, blend: 2.2, trees: 1.5, open: 0.5, lobes: [0.12, 0.13, 0.06, 0.03] };
// The várzea's deepest hollow holds the Lagoa do Taquaral, the córrego ends in it.
const LAGOA_TAQUARAL = { name: 'Lagoa do Taquaral', exp: true, x: 3060, z: 5420, r: 88, depth: 1.6, ph: 2.2, bank: 0.03, blend: 2.4, trees: 1.6, open: 0.3, lobes: [0.18, 0.14, 0.07, 0.03] };
const [rUp, rMid, rLow] = RIO_SPLIT.parts;
const JC = [LAGOA_JATOBA.x, LAGOA_JATOBA.z], JR = LAGOA_JATOBA.r * 1.25;
export const EXP_STREAMS = [
  { name: 'Rio das Pedras (alto)', exp: true, width: 6, depth: 1.2, valley: 40, valleyDepth: 1.0, points: rUp },
  { name: 'Rio das Pedras (degrau)', exp: true, width: 6, depth: 1.2, valley: 35, valleyDepth: 0.8, points: startBeyond(rMid, EXP_FALLS[0].base, POOL_R[0] * 1.35) },
  { name: 'Rio das Pedras', exp: true, width: 7, depth: 1.4, valley: 60, valleyDepth: 1.6, points: endBefore(startBeyond(rLow, EXP_FALLS[1].base, POOL_R[1] * 1.35), [LAGOA_PEDRAS.x, LAGOA_PEDRAS.z], LAGOA_PEDRAS.r * 1.25) },
  { name: 'Córrego da Mata', exp: true, width: 5, depth: 1.2, valley: 55, valleyDepth: 1.4,
    points: endBefore([[-5950, 3020], [-5830, 2995], [-5700, 2960], [-5570, 2915], [-5450, 2880], [-5320, 2860], [-5200, 2860], [-5080, 2885], [-4980, 2915], [-4900, 2940]], JC, JR) },
  { name: 'Rio Jatobá', exp: true, width: 6, depth: 1.3, valley: 60, valleyDepth: 1.6,
    points: endBefore([[-4250, 3050], [-4330, 3010], [-4420, 2975], [-4520, 2960], [-4620, 2955], [-4680, 2958]], JC, JR) },
  { name: 'Córrego do Taquaral', exp: true, width: 5, depth: 1.2, valley: 55, valleyDepth: 1.4,
    points: endBefore([[3760, 4380], [3700, 4460], [3640, 4540], [3560, 4630], [3460, 4720], [3360, 4810], [3270, 4910], [3200, 5020], [3150, 5120], [3110, 5220], [3080, 5300]], [LAGOA_TAQUARAL.x, LAGOA_TAQUARAL.z], LAGOA_TAQUARAL.r * 1.25) },
];
export const EXP_PONDS = [
  { name: 'Poço do Véu', exp: true, x: EXP_FALLS[0].base[0], z: EXP_FALLS[0].base[1], r: POOL_R[0], depth: 1.8, ph: 0.3, bank: 0.06, blend: 1.8, trees: 0, open: 2, lobes: [0.08, 0.06, 0, 0] },
  { name: 'Poço da Grota', exp: true, x: EXP_FALLS[1].base[0], z: EXP_FALLS[1].base[1], r: POOL_R[1], depth: 1.4, ph: 1.7, bank: 0.06, blend: 1.8, trees: 0, open: 2, lobes: [0.08, 0.06, 0, 0] },
  LAGOA_PEDRAS,
  LAGOA_JATOBA,
  LAGOA_TAQUARAL,
  // Várzea lagoons (shallow, seasonal look) in the other hollows.
  { name: 'Lagoa Comprida', exp: true, x: 2250, z: 4360, r: 62, depth: 1.3, ph: 0.9, bank: 0.03, blend: 2.4, trees: 1.4, open: 0.2, lobes: [0.32, 0.12, 0.05, 0.02] },
  { name: 'Lagoa Rasa', exp: true, x: 3460, z: 5580, r: 52, depth: 1.1, ph: 4.4, bank: 0.03, blend: 2.4, trees: 1.2, open: 0.5, lobes: [0.22, 0.1, 0.04, 0.02] },
];

// ---------------------------------------------------------------------------
// Roads (red-earth tracks, drawn as ribbons; resampled every ~40 m) and the
// footpath on the chapada. They join the existing tracks or the strips.
function track(w, ...way) {
  const pts = [way[0]];
  for (let i = 1; i < way.length; i++) {
    const [ax, az] = way[i - 1], [bx, bz] = way[i];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 40));
    for (let k = 1; k <= n; k++) pts.push([Math.round(ax + ((bx - ax) * k) / n), Math.round(az + ((bz - az) * k) / n)]);
  }
  return { w, mesh: true, ring: true, exp: true, pts };
}
export const EXP_ROADS = [
  // Cerrado: Pista do Cerrado → the Horizonte road, south of the Morro do Chapéu.
  track(6, [-2580, -4672], [-2250, -4850], [-1600, -4930], [-900, -4760], [-331, -4500]),
  // Cerrado: the sítio's yard to the strip.
  track(4, [-3000, -4420], [-2960, -4560], [-2900, -4630]),
  // Várzea: Pista Velha do Taquaral → north to the south fields' road.
  track(6, [2400, 5395], [2550, 5000], [2560, 4500], [2350, 3950], [2100, 3300], [2150, 2800]),
  // Várzea: the old sítio's lane down to the Lagoa do Taquaral (over the córrego).
  track(4, [2440, 5292], [2620, 5290], [2850, 5170], [3000, 5150], [3330, 5240]),
  // Morros: Pista do Morro Redondo → south to the Vale Verde road.
  track(6, [4836, 1385], [4900, 1800], [4950, 2250], [4950, 2600], [4900, 3268]),
  // Morros: the sítio to the road.
  track(4, [5200, 1900], [5060, 1870], [4915, 1880]),
  // Mata: Clareira do Jatobá → south over the Córrego da Mata to the Chapada road (narrow).
  track(4, [-5000, 2600], [-5100, 2700], [-5130, 2900], [-5120, 3200], [-5100, 3600], [-5250, 4000], [-5430, 4280]),
  // Serra: Pista da Grota → south to the Ipê Amarelo road.
  track(5, [4520, -2097], [4480, -1700], [4560, -1300], [4700, -1000]),
  // Footpath on the chapada: from the radio mast to the viewpoint over the fall.
  track(2.5, [5350, -3260], [5150, -3200], [4950, -3170], [4820, -3150]),
];

// Forest blocks of the Mata do Jatobá (canopy + edge trees as the other
// blocks; exp: true keeps them out of the original placements).
export const EXP_FORESTS = [
  { kind: 'mata', ring: true, exp: true, x0: -5950, x1: -5250, z0: 1800, z1: 2480 },
  { kind: 'mata', ring: true, exp: true, x0: -5150, x1: -4150, z0: 1800, z1: 2480 },
  { kind: 'mata', ring: true, exp: true, x0: -5950, x1: -5640, z0: 2720, z1: 2880 },
  { kind: 'mata', ring: true, exp: true, x0: -4450, x1: -3950, z0: 2720, z1: 2900 },
  { kind: 'mata', ring: true, exp: true, x0: -5950, x1: -5250, z0: 3090, z1: 3700 },
  { kind: 'mata', ring: true, exp: true, x0: -4600, x1: -4000, z0: 3150, z1: 3550 },
  // Lobes on the blocks' edges: the forest outline reads irregular from the
  // air instead of as clean rectangles.
  { kind: 'mata', ring: true, exp: true, x0: -5260, x1: -5170, z0: 1900, z1: 2300 },
  { kind: 'mata', ring: true, exp: true, x0: -4160, x1: -4020, z0: 1950, z1: 2250 },
  { kind: 'mata', ring: true, exp: true, x0: -4900, x1: -4500, z0: 1700, z1: 1810 },
  { kind: 'mata', ring: true, exp: true, x0: -5600, x1: -5350, z0: 1720, z1: 1810 },
  { kind: 'mata', ring: true, exp: true, x0: -5450, x1: -5250, z0: 3690, z1: 3820 },
  { kind: 'mata', ring: true, exp: true, x0: -5260, x1: -5180, z0: 3200, z1: 3450 },
  { kind: 'mata', ring: true, exp: true, x0: -4010, x1: -3900, z0: 3250, z1: 3450 },
  { kind: 'mata', ring: true, exp: true, x0: -4500, x1: -4200, z0: 3540, z1: 3640 },
  { kind: 'mata', ring: true, exp: true, x0: -4250, x1: -4050, z0: 2660, z1: 2730 },
  // Capões on the Morros do Leste hilltops and in the serra's ravine.
  { kind: 'mata', ring: true, exp: true, x0: 5470, x1: 5640, z0: 760, z1: 930 },
  { kind: 'mata', ring: true, exp: true, x0: 3700, x1: 3930, z0: -3320, z1: -3120 },
];

// Small rural properties (sítios) and scenery: [kind, x, z, rot]. Kinds:
// house, shack, galpao, tower (water tank), corral, trough, drums, mast,
// boulders, stones (strip markers), sock (windsock pole).
export const EXP_PROPS = [
  // Sítio do Cerrado.
  ['house', -3040, -4380, 0.2], ['galpao', -2950, -4330, 0.2], ['tower', -3090, -4330, 0], ['corral', -3200, -4440, 0.2], ['trough', -3160, -4400, 0.2],
  // Sítio Morro Redondo.
  ['house', 5230, 1940, -0.1], ['tower', 5280, 1900, 0], ['corral', 5120, 2010, -0.1], ['trough', 5170, 2050, -0.1], ['galpao', 5300, 2010, -0.1],
  // Taquaral: an old house and corral beside the old strip, drums.
  ['shack', 2600, 5300, 0.05], ['corral', 2720, 5260, 0.05], ['trough', 2690, 5230, 0.05], ['drums', 2580, 5320, 0],
  // Clareira do Jatobá: a hut and drums at the east end.
  ['shack', -4560, 2555, 0], ['drums', -4585, 2575, 0],
  // Serra: radio mast on the chapada (landmark).
  ['mast', 5350, -3300, 0],
  // Pista Esquecida: an old drum (its ends are marked with stones).
  ['drums', -4760, -5790, 0],
];
// Pastures fenced with wire and posts, a gate (porteira) on one side:
// [x0, x1, z0, z1, gateSide, gateAt].
export const EXP_PASTURES = [
  [-3400, -3060, -4520, -4250, 'e', 0.5], // Sítio do Cerrado
  [5000, 5420, 1820, 2150, 'n', 0.3], // Sítio Morro Redondo
  [2650, 2950, 5180, 5330, 'w', 0.6], // Taquaral
  [-2450, -2120, -4600, -4380, 's', 0.4], // beside the Pista do Cerrado
];

// ---------------------------------------------------------------------------
// Biome weights at a point: [cerrado, wet, lush forest floor, rock].
// Region weights fall off gradually over `fall` metres through a warped
// edge (no straight lines on the ground); the wet channel also follows the
// new water; the rock channel is the serra (shown on its steep ground).
function regionW(r, x, z) {
  const wx = x + 180 * valueNoise(x / 700 + 1.7, z / 700 - 6.3), wz = z + 180 * valueNoise(x / 700 - 3.1, z / 700 + 4.9);
  const sd = sdRoundRect(wx, wz, r.c, r.half, r.rot, Math.min(r.half[0], r.half[1]) * 0.6);
  return 1 - smoothstep(-r.fall * 0.4, r.fall, sd);
}
const REG = Object.fromEntries(EXP_REGIONS.map((r) => [r.id, r]));
export function biomeWeights(x, z, out = [0, 0, 0, 0]) {
  if (SERRA) return SB.serraBiome(x, z, out);
  if (FRONTIER) return FB.frontierBiome(x, z, out);
  if (MATOGROSSO) return MT.mtBiome(x, z, out);
  out[0] = out[1] = out[2] = out[3] = 0;
  const cer = regionW(REG.cerrado, x, z), ser = regionW(REG.serra, x, z), mor = regionW(REG.morros, x, z), mat = regionW(REG.mata, x, z), var_ = regionW(REG.varzea, x, z);
  out[0] = Math.max(cer, ser * 0.55, mor * 0.25);
  out[1] = var_ * 0.85;
  out[2] = Math.max(mat * 0.8, mor * 0.2);
  out[3] = Math.max(ser, 0);
  // Buttes elsewhere carry their rock too.
  for (const m of MESAS) {
    if (!inBox(m.box, x, z)) continue;
    const sd = mesaSd(m, x, z);
    out[3] = Math.max(out[3], 1 - smoothstep(m.cliffW, m.cliffW + m.talusW * 0.8, sd));
  }
  // Wet margins of the new rivers and lagoons.
  if (out[0] + out[1] + out[2] + out[3] > 0) {
    let dw = 1e9;
    for (const st of EXP_STREAMS) for (let i = 0; i < st.points.length - 1; i++) {
      const [ax, az] = st.points[i], [bx, bz] = st.points[i + 1];
      if (x < Math.min(ax, bx) - 120 || x > Math.max(ax, bx) + 120 || z < Math.min(az, bz) - 120 || z > Math.max(az, bz) + 120) continue;
      const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      dw = Math.min(dw, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    for (const p of EXP_PONDS) dw = Math.min(dw, Math.max(0, Math.hypot(x - p.x, z - p.z) - p.r * 1.2));
    out[1] = Math.max(out[1], 0.9 * (1 - smoothstep(10, 90, dw)));
  }
  return out;
}

// Serra das Bananeiras (a separate map): none of the main map's expansion
// landforms, strips or water exist there; its own scenery, fences and
// streaming region come from src/world/serra.js in the same shapes.
if (SERRA) {
  for (const a of [EXP_REGIONS, MESAS, RIDGES, HILLS, BASINS, AUX_STRIPS, BOXES, EXP_FALLS, EXP_STREAMS, EXP_PONDS, EXP_ROADS, EXP_FORESTS, EXP_PROPS, EXP_PASTURES]) a.length = 0;
  EXP_REGIONS.push(...SB.SERRA_REGIONS);
  EXP_PROPS.push(...SB.SERRA_PROPS);
  EXP_PASTURES.push(...SB.SERRA_PASTURES);
}
// Fireboss Frontier (a separate map): the same, from src/world/frontier.js.
if (FRONTIER) {
  for (const a of [EXP_REGIONS, MESAS, RIDGES, HILLS, BASINS, AUX_STRIPS, BOXES, EXP_FALLS, EXP_STREAMS, EXP_PONDS, EXP_ROADS, EXP_FORESTS, EXP_PROPS, EXP_PASTURES]) a.length = 0;
  EXP_REGIONS.push(...FB.FRONT_REGIONS);
  EXP_PROPS.push(...FB.FRONT_PROPS);
  EXP_PASTURES.push(...FB.FRONT_PASTURES);
}
// Mato Grosso Operations (a separate map): the same, from src/world/matogrosso.js.
if (MATOGROSSO) {
  for (const a of [EXP_REGIONS, MESAS, RIDGES, HILLS, BASINS, AUX_STRIPS, BOXES, EXP_FALLS, EXP_STREAMS, EXP_PONDS, EXP_ROADS, EXP_FORESTS, EXP_PROPS, EXP_PASTURES]) a.length = 0;
  EXP_REGIONS.push(...MT.MT_REGIONS);
  EXP_PROPS.push(...MT.MT_PROPS);
}
