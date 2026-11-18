// World Expansion 2.0 — what is drawn in the new regions besides terrain,
// trees, roads and water (those come from the shared systems): the auxiliary
// strips (draped ribbons with their markers and windsocks), the small rural
// properties (house, galpão, water tank, corral, trough), the fenced pastures
// with their gates, the radio mast on the chapada, the rocks at the cliff
// feet and the two waterfalls.
//
// Performance: a region's meshes are built when the camera comes within
// reach and released when it is far behind (one region per scan, a scan
// every 0.25 s); everything of a region is merged per material; small items
// are hidden beyond 2.5 km; the waterfalls are animated in their shaders
// (shared clock: no CPU per frame), their mist only within 450 m on the
// profiles that draw near plants. The colliders are plain boxes built from
// the data at start (physics never depends on what is drawn).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Builder, buildProp, gableRoof, buildWindsock } from './structures.js';
import { EXP_REGIONS, AUX_STRIPS, EXP_PROPS, EXP_PASTURES, EXP_FALLS, EXP_STREAMS, EXP_PONDS, MESAS, mesaSd } from './expansion.js';
import { ATMO_U } from './atmosphere.js';
import { rng } from '../core/math.js';

// m beyond a region's own radius: from the main base (every region's outline
// is 2.85 km or more away) nothing is built, and a region left behind is released.
const BUILD_R = 2000, RELEASE_R = 2800;
const NEAR_R = 2500; // small items (markers, fences, troughs)
const SCAN = 0.25;

// Region of a point: the nearest region centre.
const regionOf = (x, z) => {
  let best = EXP_REGIONS[0], bd = 1e18;
  for (const r of EXP_REGIONS) { const d = (x - r.c[0]) ** 2 + (z - r.c[1]) ** 2; if (d < bd) { bd = d; best = r; } }
  return best.id;
};

// ---------------------------------------------------------------------------
// Colliders (boxes, from the data): [x0, x1, z0, z1, top above ground, name].
const PROP_BOX = {
  house: [7.5, 7.5, 6, 'house'], shack: [3.6, 2.8, 3.2, 'shack'], galpao: [7, 5, 6.2, 'shed'], tower: [2, 2, 12.4, 'water tank'],
  corral: [15.5, 12.5, 1.8, 'corral'], trough: [1.8, 0.8, 0.9, 'trough'], mast: [1, 1, 40.5, 'radio mast'], drums: [1, 1, 1, 'drums'],
};
function sockPos(s) {
  const u = -s.len / 2 + 60, v = s.width / 2 + 16;
  return [s.c[0] + u * s.ax - v * s.az, s.c[1] + u * s.az + v * s.ax];
}
export function expansionColliders(terrain) {
  const out = [];
  for (const [kind, x, z] of EXP_PROPS) {
    const b = PROP_BOX[kind];
    if (!b) continue;
    const y = terrain.heightAt(x, z);
    out.push({ x0: x - b[0], x1: x + b[0], z0: z - b[1], z1: z + b[1], top: y + b[2], name: b[3] });
  }
  for (const s of AUX_STRIPS) {
    if (s.remote || s.kind === 'D') continue;
    const [x, z] = sockPos(s);
    out.push({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, top: terrain.heightAt(x, z) + 6.8, name: 'windsock' });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Strip surfaces: one canvas, four bands across (red earth, worn grass,
// rough earth with ruts and tufts, sand), tiled along the strip.
function stripTexture() {
  const W = 256, H = 256, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), r = rng(424242);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const band = Math.floor(x / 64), u = (x % 64) / 63;
    const tr = Math.exp(-(((u - 0.3) / 0.06) ** 2)) + Math.exp(-(((u - 0.7) / 0.06) ** 2));
    const n = r(), m = 0.5 + 0.5 * Math.sin(y * 0.21 + u * 7 + band);
    let R, G, B;
    if (band === 0) { R = 136 + n * 22; G = 82 + n * 14; B = 58 + n * 10; const k = 1 - tr * 0.22; R *= k; G *= k; B *= k; }
    else if (band === 1) { R = 74 + n * 16; G = 92 + n * 18; B = 44 + n * 10; R += tr * 26; G += tr * 6; B += tr * 4; }
    else if (band === 2) { R = 128 + n * 26; G = 70 + n * 16; B = 46 + n * 10; const k = 1 - tr * 0.3; R *= k; G *= k; B *= k; if (m * n > 0.55 && tr < 0.3) { R = 88; G = 98; B = 48; } }
    else { R = 168 + n * 22; G = 140 + n * 20; B = 102 + n * 14; const k = 1 - tr * 0.12; R *= k; G *= k; B *= k; }
    const i = (y * W + x) * 4;
    img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
const BAND = { 1: 0, 2: 1, 4: 2, 5: 3 };
function stripRibbon(terrain, s) {
  const COLS = [-1.3, -1, -0.5, 0, 0.5, 1, 1.3], STEP = 5;
  const u0 = -s.len / 2 - 15, u1 = s.len / 2 + 15, rows = Math.round((u1 - u0) / STEP) + 1;
  const pos = [], uv = [], col = [], idx = [];
  const band = BAND[s.surface] ?? 0;
  for (let r = 0; r < rows; r++) {
    const u = u0 + r * STEP;
    for (let c = 0; c < COLS.length; c++) {
      const v = (COLS[c] * s.width) / 2;
      const x = s.c[0] + u * s.ax - v * s.az, z = s.c[1] + u * s.az + v * s.ax;
      pos.push(x, terrain.heightAt(x, z) + 0.06, z);
      uv.push((band + 0.04 + (0.92 * (COLS[c] + 1.3)) / 2.6) / 4, u / 14);
      const end = Math.min(1, (u - u0) / 15, (u1 - u) / 15);
      col.push(1, 1, 1, c === 0 || c === COLS.length - 1 ? 0 : Math.max(0, end));
    }
  }
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < COLS.length - 1; c++) {
    const a = r * COLS.length + c, b = a + 1, d = a + COLS.length, e = d + 1;
    idx.push(a, b, d, b, e, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Waterfalls: a sheet that follows the rock face from the lip to the pool,
// foam on the pool, mist sprites near the foot.
function fallMaterial(noise) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.onBeforeCompile = (s) => {
    s.uniforms.uNoise = { value: noise };
    s.uniforms.uTime = ATMO_U.time;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vFallUv;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFallUv = uv;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uNoise;\nuniform float uTime;\nvarying vec2 vFallUv;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        // Streaks falling down the sheet (two layers at different speeds),
        // thin and translucent at the edges, white where the water breaks.
        float s1 = texture2D(uNoise, vec2(vFallUv.x * 2.3, vFallUv.y * 0.08 - uTime * 0.55)).r;
        float s2 = texture2D(uNoise, vec2(vFallUv.x * 4.1 + 0.37, vFallUv.y * 0.15 - uTime * 0.9)).g;
        float st = smoothstep(0.35, 0.85, s1 * 0.6 + s2 * 0.5);
        float edge = smoothstep(0.0, 0.18, vFallUv.x) * smoothstep(1.0, 0.82, vFallUv.x);
        diffuseColor.rgb = mix(vec3(0.62, 0.72, 0.72), vec3(0.97, 0.98, 0.98), st);
        diffuseColor.a = edge * (0.45 + 0.5 * st);`);
  };
  m.customProgramCacheKey = () => 'exp-fall-v1';
  return m;
}
function foamMaterial(noise) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, transparent: true, depthWrite: false });
  m.onBeforeCompile = (s) => {
    s.uniforms.uNoise = { value: noise };
    s.uniforms.uTime = ATMO_U.time;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vFoamUv;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFoamUv = uv;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uNoise;\nuniform float uTime;\nvarying vec2 vFoamUv;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 d = vFoamUv - 0.5;
        float r = length(d) * 2.0, a = atan(d.y, d.x);
        // Foam rings spreading out from where the water lands.
        float n = texture2D(uNoise, vec2(a * 0.32, r * 0.6 - uTime * 0.18)).r;
        float k = (1.0 - smoothstep(0.25, 1.0, r)) * smoothstep(0.35, 0.75, n + 0.25 * (1.0 - r));
        diffuseColor.rgb = vec3(0.95);
        diffuseColor.a = k * 0.85;`);
  };
  m.customProgramCacheKey = () => 'exp-foam-v1';
  return m;
}
function mistTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function fallInfo(f) {
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const up = EXP_STREAMS.find((st) => near(st.points[st.points.length - 1], f.lip) < 3);
  const pool = EXP_PONDS.find((p) => near([p.x, p.z], f.base) < 3);
  return { top: up.levels[up.levels.length - 1], bottom: pool.level, pool };
}
function fallSheet(terrain, f, info) {
  const dx = f.base[0] - f.lip[0], dz = f.base[1] - f.lip[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
  const ROWS = 26, COLS = 7, pos = [], uv = [], idx = [];
  let along = 0, prev = null;
  for (let r = 0; r <= ROWS; r++) {
    const t = r / ROWS;
    // From a little behind the lip (on the river) to the middle of the pool.
    const s = -4 + (L + 4) * t;
    const cx = f.lip[0] + ux * s, cz = f.lip[1] + uz * s;
    const w = f.width * (0.85 + 0.6 * t);
    let yc = Math.min(info.top + 0.05, Math.max(terrain.heightAt(cx, cz) + 0.55, info.bottom + 0.05));
    if (r === ROWS) yc = info.bottom + 0.05;
    if (prev) along += Math.hypot(cx - prev[0], yc - prev[1], cz - prev[2]);
    prev = [cx, yc, cz];
    for (let c = 0; c < COLS; c++) {
      const k = c / (COLS - 1), v = (k - 0.5) * w;
      const x = cx + nx * v, z = cz + nz * v;
      pos.push(x, Math.min(info.top + 0.05, Math.max(yc, terrain.heightAt(x, z) + 0.45)), z);
      uv.push(k, along);
    }
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS - 1; c++) {
    const a = r * COLS + c, b = a + 1, d = a + COLS, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Rocks: low-poly blocks, shades of sandstone in the vertex colours.
function rockGeo(seed) {
  const g = new THREE.DodecahedronGeometry(1, 0).toNonIndexed();
  const r = rng(seed), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + r() * 0.4), p.getY(i) * (0.7 + r() * 0.35), p.getZ(i) * (0.8 + r() * 0.4));
  g.computeVertexNormals();
  return g;
}

export function createExpansionScenery(terrain, scene, M, noise, quality) {
  const root = new THREE.Group();
  root.name = 'expansion';
  scene.add(root);
  const shared = {
    strip: new THREE.MeshStandardMaterial({ map: stripTexture(), vertexColors: true, transparent: true, roughness: 0.96, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    rock: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92, metalness: 0 }),
    fall: fallMaterial(noise), foam: foamMaterial(noise),
    mist: new THREE.SpriteMaterial({ map: mistTexture(), transparent: true, depthWrite: false, opacity: 0.6 }),
    wire: new THREE.LineBasicMaterial({ color: 0x55585a, transparent: true, opacity: 0.8 }),
  };
  const H = (x, z) => terrain.heightAt(x, z);
  const rocks = [0, 1, 2].map((i) => rockGeo(77 + i));
  const items = { strips: [], props: [], pastures: [], falls: [], mesas: [] };
  for (const s of AUX_STRIPS) items.strips.push({ s, reg: regionOf(...s.c) });
  for (const p of EXP_PROPS) items.props.push({ p, reg: regionOf(p[1], p[2]) });
  for (const p of EXP_PASTURES) items.pastures.push({ p, reg: regionOf((p[0] + p[1]) / 2, (p[2] + p[3]) / 2) });
  for (const f of EXP_FALLS) items.falls.push({ f, info: fallInfo(f), reg: regionOf(...f.lip) });
  for (const m of MESAS) items.mesas.push({ m, reg: regionOf(...m.c) });

  // Rocks: talus blocks at the cliff feet (on the outline's foot), boulders
  // round the pools and on the lips, as one vertex-coloured geometry.
  function rocksFor(regId, r) {
    const list = [];
    const put = (x, z, sc, tint) => {
      const g = rocks[Math.floor(r() * rocks.length)].clone();
      const m4 = new THREE.Matrix4().compose(new THREE.Vector3(x, H(x, z) + sc * 0.25, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(r(), r() * 6.28, r())), new THREE.Vector3(sc * (0.8 + r() * 0.6), sc * (0.6 + r() * 0.4), sc * (0.8 + r() * 0.6)));
      g.applyMatrix4(m4);
      const col = new Float32Array(g.attributes.position.count * 3), k = 0.85 + r() * 0.3;
      for (let i = 0; i < col.length; i += 3) { col[i] = tint[0] * k; col[i + 1] = tint[1] * k; col[i + 2] = tint[2] * k; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      list.push(g);
    };
    for (const { m, reg } of items.mesas) {
      if (reg !== regId) continue;
      const per = 2 * (m.half[0] + m.half[1]) * 1.3;
      for (let i = 0; i < per / 22; i++) {
        // A point on the outline's foot: walk out from the centre on a ray.
        const a = r() * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        let d = 0;
        while (d < 2000 && mesaSd(m, m.c[0] + ca * d, m.c[1] + sa * d) < m.cliffW + 4) d += 4;
        const off = r() * 40;
        const x = m.c[0] + ca * (d + off), z = m.c[1] + sa * (d + off);
        if (EXP_PONDS.some((p) => Math.hypot(x - p.x, z - p.z) < p.r * 1.2)) continue;
        put(x, z, 0.9 + r() * 2.2, [0.55, 0.42, 0.32]);
      }
    }
    for (const { f, info, reg } of items.falls) {
      if (reg !== regId) continue;
      for (let i = 0; i < 18; i++) {
        const a = r() * Math.PI * 2, d = info.pool.r * (1.05 + r() * 0.5);
        put(info.pool.x + Math.cos(a) * d, info.pool.z + Math.sin(a) * d, 0.7 + r() * 1.8, [0.42, 0.36, 0.3]);
      }
      for (let i = 0; i < 8; i++) {
        const dx = f.base[0] - f.lip[0], dz = f.base[1] - f.lip[1], L = Math.hypot(dx, dz), side = r() < 0.5 ? -1 : 1, v = side * (f.width * 0.6 + r() * 6);
        const x = f.lip[0] - (dz / L) * v - (dx / L) * r() * 6, z = f.lip[1] + (dx / L) * v - (dz / L) * r() * 6;
        put(x, z, 0.8 + r() * 1.5, [0.5, 0.4, 0.31]);
      }
    }
    return list.length ? mergeGeometries(list) : null;
  }

  const regions = EXP_REGIONS.map((r) => ({ r, R: Math.hypot(r.half[0], r.half[1]) + r.fall, group: null, near: null, socks: [], mist: [], disposables: [] }));
  function buildRegion(reg) {
    const g = new THREE.Group(), near = new THREE.Group(), id = reg.r.id;
    g.name = 'expansion ' + id;
    const B = new Builder(M), BN = new Builder(M), r = rng(id.length * 7919 + 13);
    const disp = [];
    // Strips: surface ribbon, markers, windsock.
    for (const { s, reg: rr } of items.strips) {
      if (rr !== id) continue;
      const rib = new THREE.Mesh(stripRibbon(terrain, s), shared.strip);
      rib.renderOrder = 2; rib.receiveShadow = true;
      g.add(rib); disp.push(rib.geometry);
      const at = (u, v) => [s.c[0] + u * s.ax - v * s.az, s.c[1] + u * s.az + v * s.ax];
      const ry = -s.psi;
      for (const end of [-1, 1]) for (let k = -2; k <= 2; k++) {
        const v = (k / 2) * (s.width / 2 + 1), u = end * (s.len / 2 - 4);
        const [x, z] = at(u, v), y = H(x, z);
        if (s.kind === 'A' || (s.kind === 'B' && Math.abs(k) !== 1)) BN.add(new THREE.TorusGeometry(0.42, 0.16, 6, 12), s.kind === 'B' ? M.dirtyWhite : M.white, x, y + 0.08, z, ry, Math.PI / 2);
        else if (s.kind === 'C' || s.kind === 'E') { if (Math.abs(k) === 2) BN.box(0.08, 1.0, 0.08, M.orange, x, y + 0.5, z, ry); }
        else if (s.kind === 'D') { if (Math.abs(k) === 2) BN.add(new THREE.DodecahedronGeometry(0.35, 0), M.white, x, y + 0.15, z, r() * 3); }
        else if (Math.abs(k) === 2) BN.add(new THREE.DodecahedronGeometry(0.4, 0), M.concrete, x, y + 0.15, z, r() * 3);
      }
      // Side markers along the edges every 60 m (painted stones / old tyres).
      if (s.kind === 'A' || s.kind === 'C') for (let u = -s.len / 2 + 30; u < s.len / 2; u += 60) for (const side of [-1, 1]) {
        const [x, z] = at(u, side * (s.width / 2 + 1.5));
        BN.add(new THREE.DodecahedronGeometry(0.3, 0), M.white, x, H(x, z) + 0.12, z, r() * 3);
      }
      if (!s.remote && s.kind !== 'D') {
        const [x, z] = sockPos(s);
        const ws = buildWindsock(B, M, g, x, H(x, z), z);
        reg.socks.push(ws);
      }
    }
    // Props.
    for (const { p: [kind, x, z, rot], reg: rr } of items.props) {
      if (rr !== id) continue;
      if (kind === 'galpao') {
        // Small open farm shed: posts, back wall, gable roof, concrete floor.
        const y = H(x, z), w = 12, d = 8, hh = 4.2, cs = Math.cos(rot), sn = Math.sin(rot);
        const at2 = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
        for (const lx of [-w / 2, 0, w / 2]) for (const lz of [-d / 2, d / 2]) { const [px, pz] = at2(lx, lz); B.box(0.25, hh, 0.25, M.woodDark, px, y + hh / 2, pz, rot); }
        const [bx, bz] = at2(0, -d / 2);
        B.box(w, hh, 0.1, M.metalWall, bx, y + hh / 2, bz, rot, 4);
        gableRoof(B, M.metalRoof, x, y + hh, z, d, w, 1.6, Math.PI / 2 + rot, 0.7);
        B.box(w, 0.15, d, M.concrete, x, y + 0.07, z, rot, 4);
      } else if (kind === 'trough') {
        // Cattle trough (bebedouro): a concrete basin with water in it.
        const y = H(x, z);
        BN.box(3.2, 0.6, 1.2, M.concrete, x, y + 0.3, z, rot, 2);
        BN.box(2.9, 0.05, 0.9, M.blueDark, x, y + 0.56, z, rot);
      } else if (kind === 'drums') {
        buildProp(BN, M, near, H, kind, x, z, rot, null, null, null);
      } else {
        buildProp(B, M, g, H, kind, x, z, rot, null, null, null);
      }
    }
    // Pastures: posts every 4 m, three wires, a gate.
    const wirePts = [];
    for (const { p: [x0, x1, z0, z1, gateSide, gateAt], reg: rr } of items.pastures) {
      if (rr !== id) continue;
      const sides = { n: [[x0, z0], [x1, z0]], e: [[x1, z0], [x1, z1]], s: [[x1, z1], [x0, z1]], w: [[x0, z1], [x0, z0]] };
      for (const [k, [a, b]] of Object.entries(sides)) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
        const gS = k === gateSide ? gateAt * len : -1e9;
        let prev = null;
        for (let s = 0; s <= len; s += 4) {
          if (s > gS - 2.5 && s < gS + 2.5) { prev = null; continue; }
          const x = a[0] + dx * s, z = a[1] + dz * s, y = H(x, z);
          BN.box(0.12, 1.5, 0.12, M.woodDark, x, y + 0.6, z);
          if (prev) for (const hh of [0.45, 0.8, 1.1]) wirePts.push(prev[0], prev[1] + hh, prev[2], x, y + hh, z);
          prev = [x, y, z];
        }
        if (k === gateSide) {
          const gx = a[0] + dx * (gS - 2.5), gz = a[1] + dz * (gS - 2.5), gy = H(gx, gz), ry = Math.atan2(dx, dz) + 0.5;
          BN.box(0.2, 1.9, 0.2, M.woodDark, gx, gy + 0.9, gz);
          for (const hh of [0.4, 0.8, 1.2]) BN.add(new THREE.BoxGeometry(0.06, 0.12, 4.4), M.wood, gx + Math.sin(ry) * 2.2, gy + hh, gz + Math.cos(ry) * 2.2, ry);
        }
      }
    }
    if (wirePts.length) {
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
      near.add(new THREE.LineSegments(lg, shared.wire)); disp.push(lg);
    }
    // Rocks.
    const rg = rocksFor(id, r);
    if (rg) { const rm = new THREE.Mesh(rg, shared.rock); rm.castShadow = rm.receiveShadow = true; g.add(rm); disp.push(rg); }
    // Waterfalls.
    for (const { f, info, reg: rr } of items.falls) {
      if (rr !== id) continue;
      const sheet = new THREE.Mesh(fallSheet(terrain, f, info), shared.fall);
      sheet.renderOrder = 3; g.add(sheet); disp.push(sheet.geometry);
      const foam = new THREE.Mesh(new THREE.CircleGeometry(info.pool.r * 0.95, 32).rotateX(-Math.PI / 2), shared.foam);
      foam.position.set(info.pool.x, info.bottom + 0.06, info.pool.z);
      foam.renderOrder = 3; g.add(foam); disp.push(foam.geometry);
      if (quality?.nearPlants !== false) {
        for (let i = 0; i < 10; i++) {
          const sp = new THREE.Sprite(shared.mist);
          sp.userData = { base: new THREE.Vector3(info.pool.x + (r() - 0.5) * info.pool.r, info.bottom + 1, info.pool.z + (r() - 0.5) * info.pool.r), ph: r() * 10, sc: 5 + r() * 6 };
          sp.visible = false;
          g.add(sp); reg.mist.push(sp);
        }
      }
    }
    B.build(g); BN.build(near);
    g.traverse((o) => { if (o.isMesh && o.geometry) disp.push(o.geometry); });
    near.traverse((o) => { if (o.isMesh && o.geometry) disp.push(o.geometry); });
    g.add(near);
    // Static meshes: local matrices computed once (the windsocks' moving
    // groups and the mist sprites keep theirs).
    g.traverse((o) => { if (o.isMesh || o.isLineSegments) { o.updateMatrix(); o.matrixAutoUpdate = false; } });
    root.add(g);
    reg.group = g; reg.near = near; reg.disposables = disp;
  }
  function releaseRegion(reg) {
    root.remove(reg.group);
    for (const geo of new Set(reg.disposables)) geo.dispose();
    // The windsocks' segments carry their own material clones.
    reg.group.traverse((o) => { if (o.isMesh && o.material && !Object.values(shared).includes(o.material) && !Object.values(M).includes(o.material)) o.material.dispose(); });
    reg.group = reg.near = null; reg.socks = []; reg.mist = []; reg.disposables = [];
  }

  let t = 0, clock = 0;
  const stats = { built: 0, released: 0 };
  return {
    group: root,
    regions,
    stats: () => ({ ...stats, live: regions.filter((r) => r.group).length }),
    // All built at once (tests / tools).
    buildAll() { for (const reg of regions) if (!reg.group) { buildRegion(reg); stats.built++; } },
    update(camera, focus, dt) {
      const p = camera.position;
      clock += dt; t -= dt;
      if (t <= 0) {
        t = SCAN;
        let builtOne = false;
        for (const reg of regions) {
          const d = Math.hypot(p.x - reg.r.c[0], p.z - reg.r.c[1]) - reg.R;
          if (!reg.group && d < BUILD_R && !builtOne) { buildRegion(reg); stats.built++; builtOne = true; }
          else if (reg.group && d > RELEASE_R) { releaseRegion(reg); stats.released++; }
          if (reg.group) reg.near.visible = d < NEAR_R;
        }
      }
      for (const reg of regions) {
        if (!reg.group) continue;
        const d = Math.hypot(p.x - reg.r.c[0], p.z - reg.r.c[1]) - reg.R;
        if (d < 1500) for (const ws of reg.socks) ws.update(dt, clock, this.wind ?? { x: 0, z: 3 });
        for (const sp of reg.mist) {
          const b = sp.userData.base, dd = Math.hypot(p.x - b.x, p.z - b.z);
          sp.visible = dd < 450;
          if (!sp.visible) continue;
          const k = ((clock * 0.12 + sp.userData.ph) % 1);
          sp.position.set(b.x, b.y + k * 9, b.z);
          sp.scale.setScalar(sp.userData.sc * (0.6 + k));
          sp.material.opacity = 0.6;
        }
      }
    },
  };
}
