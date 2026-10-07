import * as THREE from 'three';
import { patchMaterial } from '../core/MaterialPatch.js';
import { LAYER } from '../core/Shared.js';
import { rng, hash2, smoothstep, clamp, Noise } from '../utils/MathUtils.js';
import { CAMP, PIER } from '../world/Layout.js';

const CELL = 6;
const MAX_INSTANCES = 42000;

/** Build a clump of curved grass blades. */
function buildClump(seed, blades, hMin, hMax, widthBase, spread, segs = 4) {
  const r = rng(seed);
  const pos = [], nor = [], col = [], wind = [], idx = [];
  for (let b = 0; b < blades; b++) {
    const a = r() * Math.PI * 2;
    const off = Math.sqrt(r()) * spread;
    const bx = Math.cos(a) * off, bz = Math.sin(a) * off;
    const h = hMin + r() * (hMax - hMin);
    const facing = r() * Math.PI * 2;
    const lean = 0.15 + r() * 0.45;
    const leanDir = a + (r() - 0.5) * 0.8;
    const w = widthBase * (0.7 + r() * 0.6);
    const phase = r();
    const base = pos.length / 3;
    const fx = Math.cos(facing), fz = Math.sin(facing);
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const curve = lean * t * t * h;
      const cx = bx + Math.cos(leanDir) * curve, cz = bz + Math.sin(leanDir) * curve;
      const y = h * t * (1 - lean * 0.25 * t);
      const ww = w * (1 - t * 0.92);
      const shade = 0.32 + 0.68 * Math.pow(t, 0.8);
      const n = [Math.cos(leanDir) * 0.3, 0.9, Math.sin(leanDir) * 0.3];
      if (s < segs) {
        pos.push(cx - fz * ww, y, cz + fx * ww, cx + fz * ww, y, cz - fx * ww);
        nor.push(...n, ...n);
        col.push(shade, shade, shade, shade, shade, shade);
        wind.push(t * t, t * 0.6, phase, 0, t * t, t * 0.6, phase, 0);
      } else {
        pos.push(cx, y, cz);
        nor.push(...n);
        col.push(shade * 1.05, shade * 1.05, shade);
        wind.push(1, 0.6, phase, 0);
      }
    }
    for (let s = 0; s < segs - 1; s++) {
      const i0 = base + s * 2;
      idx.push(i0, i0 + 1, i0 + 3, i0, i0 + 3, i0 + 2);
    }
    const last = base + (segs - 1) * 2;
    idx.push(last, last + 1, last + 2);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aWind', new THREE.Float32BufferAttribute(wind, 4));
  g.setIndex(idx);
  return g;
}

/**
 * Dense clustered grass around the player. Cells are generated lazily and
 * deterministically from terrain masks (grass weight, sand, rock, paths,
 * canopy shade, wetness) and streamed into instanced attributes each frame.
 */
export class GrassSystem {
  constructor({ terrainData, quality }) {
    this.td = terrainData;
    this.quality = quality;
    this.noise = new Noise(77);
    this.cells = new Map();
    this.group = new THREE.Group();
    this.kinds = [
      buildClump(1, 11, 0.28, 0.55, 0.022, 0.16), // lush
      buildClump(2, 8, 0.5, 0.95, 0.018, 0.2), // tall wispy
      buildClump(3, 7, 0.45, 0.85, 0.014, 0.22), // dune grass
    ];
    this.meshes = this.kinds.map((geo, i) => {
      const offsets = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES * 4), 4);
      const params = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES * 4), 4);
      offsets.setUsage(THREE.DynamicDrawUsage);
      params.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aOffset', offsets);
      geo.setAttribute('aParams', params);
      geo.instanceCount = 0;
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.72, envMapIntensity: 0.7 });
      patchMaterial(mat, {
        wind: 'grass', grassInstanced: true, translucency: 0.55, wet: 0.5, canopy: true, key: `grass${i}`,
        vertex: (shader) => {
          shader.vertexShader = shader.vertexShader.replace('vec3 objectNormal = vec3(_gc * normal.x', `
#ifdef USE_COLOR
  vec3 _lush = vec3(0.17, 0.30, 0.06);
  vec3 _yel = vec3(0.33, 0.38, 0.10);
  vec3 _dry = vec3(0.56, 0.48, 0.24);
  vColor.rgb *= mix(mix(_lush, _yel, aParams.y), _dry, aParams.w) * 2.2;
#endif
vec3 objectNormal = vec3(_gc * normal.x`);
        },
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.layers.set(LAYER.DETAIL);
      this.group.add(mesh);
      return mesh;
    });
    this.lastCam = new THREE.Vector3(1e9, 0, 0);
    this.lastDir = new THREE.Vector3();
    this.frustum = new THREE.Frustum();
    this._pm = new THREE.Matrix4();
    this._box = new THREE.Box3();
    this._v = new THREE.Vector3();
    this.deckExclusion = { x: CAMP.deck.x, z: CAMP.deck.z, hw: CAMP.deck.w / 2 + 0.6, hd: CAMP.deck.d / 2 + 0.6 };
  }

  applySettings(settings, game) {
    this.quality = game.vegetationQuality;
    for (const m of this.meshes) m.material.userData.patchUniforms.uGrassFade.value.set(this.quality.grassRadius * 0.72, this.quality.grassRadius);
    this.lastCam.set(1e9, 0, 0);
  }

  _density(x, z, out) {
    const td = this.td;
    const h = td.heightAt(x, z);
    if (h < 0.45) return 0;
    const s = td.splatAt(x, z, out);
    const sl = td.slopeAt(x, z);
    if (sl > 0.45) return 0;
    const pd = td.pathAt(x, z);
    let d = s.grass * (1 - s.canopy * 0.8) * (1 - s.rock) * smoothstep(0.6, 1.8, pd);
    // patchy clusters
    const n = this.noise.noise2(x * 0.08, z * 0.08) * 0.5 + 0.5;
    const n2 = this.noise.noise2(x * 0.021 + 5, z * 0.021) * 0.5 + 0.5;
    d *= smoothstep(0.15, 0.6, n * 0.65 + n2 * 0.55);
    // dune grass on the upper beach
    const dc = td.coastAt(x, z);
    const dune = s.sand > 0.5 && dc > 9 && dc < 30 ? smoothstep(9, 15, dc) * (1 - smoothstep(22, 30, dc)) * smoothstep(0.55, 0.8, n) * 0.5 : 0;
    // avoid the deck footprint and pier landing
    const e = this.deckExclusion;
    if (Math.abs(x - e.x) < e.hw && Math.abs(z - e.z) < e.hd) return 0;
    if (Math.abs(x - PIER.x) < 1.6 && z < PIER.zStart + 1.5 && z > PIER.zStart - 6) return 0;
    return Math.max(d, dune) * (1 - smoothstep(0.32, 0.45, sl));
  }

  _cell(cx, cz) {
    const key = cx * 100000 + cz;
    let c = this.cells.get(key);
    if (c) return c;
    const r = rng(Math.floor(hash2(cx, cz, 9) * 1e9));
    const x0 = cx * CELL, z0 = cz * CELL;
    const data = [];
    const maxN = 92;
    const tmp = {};
    let ymin = Infinity, ymax = -Infinity;
    for (let i = 0; i < maxN; i++) {
      const x = x0 + r() * CELL, z = z0 + r() * CELL;
      const d = this._density(x, z, tmp);
      const keep = r();
      if (keep > d) { r(); r(); r(); r(); continue; }
      const y = this.td.heightAt(x, z) - 0.04;
      ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
      const sand = tmp.sand;
      const kind = sand > 0.5 ? 2 : (r() < 0.22 ? 1 : 0);
      const wet = 1 - smoothstep(1.0, 3.0, y);
      const tint = clamp(this.noise.noise2(x * 0.05, z * 0.05) * 0.5 + 0.5 + (r() - 0.5) * 0.3, 0, 1);
      const dry = kind === 2 ? 0.55 + r() * 0.35 : clamp(smoothstep(0.55, 0.9, tint) * 0.5 - wet * 0.3 + (r() < 0.06 ? 0.5 : 0), 0, 1);
      data.push({ x, y, z, s: 0.75 + r() * 0.6, rot: r() * 6.28, tint, lean: (r() - 0.5) * 0.6, dry, kind, keep });
    }
    c = { x0, z0, data, box: new THREE.Box3(new THREE.Vector3(x0, ymin - 0.2, z0), new THREE.Vector3(x0 + CELL, ymax + 1.2, z0 + CELL)), empty: data.length === 0 };
    this.cells.set(key, c);
    if (this.cells.size > 9000) {
      // drop the oldest cells (simple FIFO eviction)
      const it = this.cells.keys();
      for (let i = 0; i < 1500; i++) this.cells.delete(it.next().value);
    }
    return c;
  }

  update(dt, game) {
    const cam = game.camera;
    // from the air the grass is sub-pixel: skip it entirely
    const high = cam.position.y - this.td.heightAt(cam.position.x, cam.position.z) > 60;
    if (high !== this._high) {
      this._high = high;
      for (const m of this.meshes) m.visible = !high && m.count > 0;
      if (!high) this.lastCam.set(1e9, 0, 0);
    }
    if (high) return;
    const dir = cam.getWorldDirection(this._v);
    const moved = cam.position.distanceToSquared(this.lastCam) > 0.36;
    const turned = dir.dot(this.lastDir) < 0.998;
    if (!moved && !turned) return;
    this.lastCam.copy(cam.position);
    this.lastDir.copy(dir);

    const R = this.quality.grassRadius;
    const dens = this.quality.grassDensity;
    this._pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this._pm);
    const px = cam.position.x, pz = cam.position.z;
    const c0x = Math.floor((px - R) / CELL), c1x = Math.floor((px + R) / CELL);
    const c0z = Math.floor((pz - R) / CELL), c1z = Math.floor((pz + R) / CELL);
    const counts = [0, 0, 0];
    const arrs = this.meshes.map((m) => [m.geometry.attributes.aOffset.array, m.geometry.attributes.aParams.array]);
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const ccx = (cx + 0.5) * CELL - px, ccz = (cz + 0.5) * CELL - pz;
        const cd = Math.hypot(ccx, ccz);
        if (cd > R + CELL) continue;
        const cell = this._cell(cx, cz);
        if (cell.empty) continue;
        if (cd > CELL * 1.5 && !this.frustum.intersectsBox(cell.box)) continue;
        for (const g of cell.data) {
          const dx = g.x - px, dz = g.z - pz;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > R) continue;
          // thin out with distance, keep near grass dense
          const thin = dens * (1 - smoothstep(R * 0.35, R, d) * 0.55);
          if (g.keep > thin) continue;
          const k = g.kind;
          const n = counts[k];
          if (n >= MAX_INSTANCES) continue;
          const [off, par] = arrs[k];
          const comp = 1 + smoothstep(R * 0.35, R, d) * 0.35;
          off[n * 4] = g.x; off[n * 4 + 1] = g.y; off[n * 4 + 2] = g.z; off[n * 4 + 3] = g.s * comp;
          par[n * 4] = g.rot; par[n * 4 + 1] = g.tint; par[n * 4 + 2] = g.lean; par[n * 4 + 3] = g.dry;
          counts[k] = n + 1;
        }
      }
    }
    this.meshes.forEach((m, i) => {
      const geo = m.geometry;
      geo.instanceCount = counts[i];
      m.visible = counts[i] > 0;
      const a = geo.attributes.aOffset, b = geo.attributes.aParams;
      a.clearUpdateRanges(); a.addUpdateRange(0, counts[i] * 4); a.needsUpdate = true;
      b.clearUpdateRanges(); b.addUpdateRange(0, counts[i] * 4); b.needsUpdate = true;
    });
  }
}
