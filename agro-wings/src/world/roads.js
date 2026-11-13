// Access roads of the rolling and hilly zones, drawn as ribbons draped on the
// terrain: every vertex takes its height from terrain.heightAt (the surface
// the aircraft and vehicles touch), also across the width, so a road on a
// slope lies on the slope instead of floating above a valley or cutting
// into a hill. Edges fade out (vertex alpha) so the road blends into the
// grass, the middle carries the two tyre ruts and a strip of grass.
// (The farm-core roads are painted by the ground shader instead.)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROADS } from './layout.js';

const STEP = 5; // m between cross-sections
const CHUNK = 64; // cross-sections per ribbon piece
const REGION = 1500; // m: ribbon pieces of a region are merged into one mesh
const LIFT = 0.07; // m above the ground

function roadTexture() {
  const W = 128, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  // Compacted red earth across the width (u), ruts at 0.27 and 0.73.
  const img = g.createImageData(W, H);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1);
      const rut = Math.exp(-(((u - 0.27) / 0.05) ** 2)) + Math.exp(-(((u - 0.73) / 0.05) ** 2));
      const mid = Math.exp(-(((u - 0.5) / 0.1) ** 2));
      const n = rnd();
      let r = 150 + n * 22, gg = 90 + n * 14, b = 62 + n * 10;
      const k = 1 - rut * 0.26;
      r *= k; gg *= k; b *= k;
      // Grass in the crown of the road, patchy.
      const gr = mid * (0.5 + 0.5 * Math.sin(y * 0.37 + u * 9)) * 0.6;
      r = r * (1 - gr) + 92 * gr; gg = gg * (1 - gr) + 104 * gr; b = b * (1 - gr) + 52 * gr;
      const i = (y * W + x) * 4;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// A paved highway (Mato Grosso Operations' BR-163): asphalt, white edge
// lines, a yellow centre line dashed every 10 m, a red gravel shoulder.
function asphaltTexture() {
  const W = 128, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  let seed = 777;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = (x / (W - 1)) * 2.24 - 1.12; // across, in half widths
    const n = rnd();
    let r = 58 + n * 12, gg = 58 + n * 12, b = 60 + n * 12;
    // Darker oil strips in the wheel paths.
    const lane = Math.abs(Math.abs(s) - 0.5);
    if (lane > 0.2 && lane < 0.32) { r -= 8; gg -= 8; b -= 8; }
    if (Math.abs(s) > 1.0) { r = 150 + n * 25; gg = 96 + n * 15; b = 70 + n * 10; } // shoulder
    else if (Math.abs(Math.abs(s) - 0.93) < 0.025) { r = gg = b = 210 + n * 20; } // edge lines
    else if (Math.abs(s) < 0.025 && y < H * 0.45) { r = 214; gg = 168; b = 40; } // centre dashes
    const i = (y * W + x) * 4;
    img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Columns across the width as fractions of the half width (outer two fade).
const COLS = [-1.35, -1, 0, 1, 1.35];
// (A paved road: a sharp edge, the shoulder within the texture.)
const COLS_P = [-1.12, -1.1, 0, 1.1, 1.12];

function ribbon(terrain, pts, w, from, to, cols = COLS) {
  const COLS = cols, span = cols[cols.length - 1] * 2;
  const rows = to - from + 1;
  const pos = new Float32Array(rows * COLS.length * 3);
  const nrm = new Float32Array(rows * COLS.length * 3);
  const uv = new Float32Array(rows * COLS.length * 2);
  const col = new Float32Array(rows * COLS.length * 4);
  const n = { x: 0, y: 1, z: 0 };
  for (let r = 0; r < rows; r++) {
    const i = from + r;
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z;
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const nx = -tz, nz = tx; // left of the direction of travel
    for (let c = 0; c < COLS.length; c++) {
      const off = COLS[c] * w * 0.5;
      const x = p.x + nx * off, z = p.z + nz * off;
      const k = r * COLS.length + c;
      pos[k * 3] = x; pos[k * 3 + 1] = terrain.heightAt(x, z) + LIFT; pos[k * 3 + 2] = z;
      terrain.visualNormalAt(x, z, n);
      nrm[k * 3] = n.x; nrm[k * 3 + 1] = n.y; nrm[k * 3 + 2] = n.z;
      uv[k * 2] = (COLS[c] + span / 2) / span; uv[k * 2 + 1] = (i * STEP) / 10;
      const edge = c === 0 || c === COLS.length - 1;
      col[k * 4] = col[k * 4 + 1] = col[k * 4 + 2] = 1; col[k * 4 + 3] = edge ? 0 : 1;
    }
  }
  const idx = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < COLS.length - 1; c++) {
      const a = r * COLS.length + c, b = a + 1, d = a + COLS.length, e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export function createRoads(terrain) {
  const group = new THREE.Group();
  group.name = 'roads';
  const mat = new THREE.MeshStandardMaterial({
    map: roadTexture(), vertexColors: true, transparent: true, roughness: 0.97, metalness: 0,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const meshes = [];
  const regions = new Map();
  let paved = null;
  for (const road of ROADS) {
    if (!road.mesh) continue;
    if (road.paved && !paved) paved = new THREE.MeshStandardMaterial({ map: asphaltTexture(), vertexColors: true, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    // Smooth the polyline further (Catmull-Rom) and respace it evenly.
    const curve = new THREE.CatmullRomCurve3(road.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const total = curve.getLength();
    const pts = curve.getSpacedPoints(Math.max(2, Math.round(total / STEP)));
    for (let from = 0; from < pts.length - 1; from += CHUNK - 1) {
      const to = Math.min(pts.length - 1, from + CHUNK - 1);
      const g = ribbon(terrain, pts, road.w, from, to, road.paved ? COLS_P : COLS);
      // Phase 3: the ribbons of one REGION share a single draw call (same
      // material, same geometry; culling per region instead of per 320 m).
      const c = g.boundingSphere.center;
      const key = (road.paved ? 'p' : '') + Math.floor(c.x / REGION) + ',' + Math.floor(c.z / REGION);
      if (!regions.has(key)) regions.set(key, []);
      regions.get(key).push(g);
    }
  }
  for (const [key, parts] of regions) {
    const g = parts.length > 1 ? mergeGeometries(parts) : parts[0];
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, key[0] === 'p' ? paved : mat);
    m.receiveShadow = true;
    m.renderOrder = key[0] === 'p' ? 3 : 2;
    m.matrixAutoUpdate = false;
    group.add(m);
    meshes.push(m);
  }
  return { group, meshes };
}
