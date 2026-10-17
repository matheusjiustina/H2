// Ground-level grass: instanced tufts (green braquiária and dry capim) in
// 16 m cells streamed around the camera on pasture and verges only. Tufts
// sway in the wind and shrink into the ground toward the edge of the radius,
// so there is no pop; above ~120 m they are switched off entirely.
import * as THREE from 'three';
import { rng, fbm } from '../core/math.js';
import { grassTuft, TILES } from './foliage.js';
import { BASE } from './layout.js';
import { ATMO_U } from './atmosphere.js';

const CELL = 16;

function grassMaterial(atlas, U) {
  const m = new THREE.MeshStandardMaterial({
    map: atlas, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true,
    roughness: 0.9, metalness: 0, alphaToCoverage: true,
  });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = ATMO_U.time;
    s.uniforms.uWind = ATMO_U.wind;
    s.uniforms.uRadius = U.radius;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uRadius;\nuniform vec4 uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float gd = distance(ip.xz, cameraPosition.xz);
        float gk = 1.0 - smoothstep(uRadius * 0.6, uRadius, gd);
        // Shared visual wind: lean downwind, gust waves travelling with the
        // wind across the pasture, plus a little flutter.
        vec2 wdl = normalize((transpose(mat3(instanceMatrix)) * vec3(uWind.x, 0.0, uWind.y)).xz + 1e-5);
        float gph = dot(ip.xz, uWind.xy) * 0.12 - uTime * (1.3 + uWind.z * 0.22);
        float gust = 0.55 + 0.45 * sin(gph) * (0.6 + 0.4 * sin(gph * 0.37 + 1.7));
        float flut = 0.3 * sin(uTime * 3.7 + ip.z * 0.5 + ip.x * 0.31);
        transformed.xz += wdl * (0.03 + 0.014 * uWind.z) * (gust * (0.6 + 0.6 * uWind.w) + flut) * transformed.y;
        transformed.y *= gk;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <normal_fragment_begin>',
        THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
      .replace('#include <alphatest_fragment>', `
        vec2 mdx = dFdx(vMapUv * 1024.0), mdy = dFdy(vMapUv * 1024.0);
        float mlod = 0.5 * log2(min(dot(mdx, mdx), dot(mdy, mdy)));
        diffuseColor.a *= 1.0 + clamp(mlod, 0.0, 6.0) * 0.3;
        diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(0.0, 0.7, fract(vMapUv.y * 4.0)));
        #include <alphatest_fragment>`);
  };
  m.customProgramCacheKey = () => 'grass-v2';
  return m;
}

export function createGrass(terrain, quality, atlas) {
  const group = new THREE.Group();
  group.name = 'grass';
  const U = { time: { value: 0 }, radius: { value: quality.grassRadius ?? 70 } };
  const mat = grassMaterial(atlas, U);
  const kinds = [grassTuft(TILES.grass, 3, 0.95, 0.55), grassTuft(TILES.dry, 5, 1.0, 0.7)];
  const cap = 9000;
  const meshes = kinds.map((g) => {
    const im = new THREE.InstancedMesh(g, mat, cap);
    im.count = 0;
    im.frustumCulled = false;
    im.receiveShadow = true;
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    group.add(im);
    return im;
  });
  const cache = new Map();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  let density = quality.grassDensity ?? 1;

  const blocked = (x, z) => {
    const a = BASE.apron;
    if (x > a.x0 - 4 && x < a.x1 + 4 && z > a.z0 - 4 && z < a.z1 + 4) return true;
    // Hangar slab and the parked door leaves either side of it.
    const hg = BASE.hangar;
    if (x > hg.x - hg.w / 2 - 8.5 && x < hg.x + hg.w / 2 + 8.5 && z > hg.z - hg.d / 2 - 1 && z < hg.z + hg.d / 2 + 1.5) return true;
    if (terrain.surfaceAt(x, z) !== 'grass') return true;
    if (terrain.waterLevel(x, z) > -1e8) return true;
    return false;
  };

  // Each cell is built once into packed per-kind buffers, so gathering the
  // visible cells is a couple of typed-array copies per cell.
  function buildCell(cx, cz) {
    const r = rng(((cx * 73856093) ^ (cz * 19349663)) >>> 0);
    const n = Math.round(70 * density);
    const mats = [new Float32Array(n * 16), new Float32Array(n * 16)];
    const cols = [new Float32Array(n * 3), new Float32Array(n * 3)];
    const cnt = [0, 0];
    for (let i = 0; i < n; i++) {
      const x = (cx + r()) * CELL, z = (cz + r()) * CELL;
      const s = 0.55 + r() * 0.8, rot = r() * Math.PI * 2, tint = 0.82 + r() * 0.34;
      if (blocked(x, z)) continue;
      // Dry capim in patches.
      const dry = fbm(x / 70 + 3, z / 70, 2) + (r() - 0.5) * 0.6 > 0.25 ? 1 : 0;
      p.set(x, terrain.heightAt(x, z) - 0.03, z);
      q.setFromAxisAngle(UP, rot);
      sc.set(s, s * (0.8 + r() * 0.5), s);
      m4.compose(p, q, sc);
      const k = cnt[dry]++;
      mats[dry].set(m4.elements, k * 16);
      cols[dry][k * 3] = tint; cols[dry][k * 3 + 1] = tint; cols[dry][k * 3 + 2] = tint * 0.95;
    }
    return [0, 1].map((k) => ({ m: mats[k].subarray(0, cnt[k] * 16), c: cols[k].subarray(0, cnt[k] * 3), n: cnt[k] }));
  }

  let lastKey = null;
  let visible = true;
  function rebuild(cam) {
    const R = U.radius.value + CELL / 2;
    const ccx = Math.floor(cam.x / CELL), ccz = Math.floor(cam.z / CELL);
    const nC = Math.ceil(R / CELL);
    const counts = [0, 0];
    for (let j = -nC; j <= nC; j++) for (let i = -nC; i <= nC; i++) {
      const cx = ccx + i, cz = ccz + j;
      const dx = Math.max(0, Math.abs((cx + 0.5) * CELL - cam.x) - CELL / 2), dz = Math.max(0, Math.abs((cz + 0.5) * CELL - cam.z) - CELL / 2);
      if (dx * dx + dz * dz > R * R) continue;
      const key = cx + ',' + cz;
      let c = cache.get(key);
      if (!c) { c = buildCell(cx, cz); cache.set(key, c); }
      for (let k = 0; k < 2; k++) {
        const e = c[k];
        if (!e.n || counts[k] + e.n > cap) continue;
        meshes[k].instanceMatrix.array.set(e.m, counts[k] * 16);
        meshes[k].instanceColor.array.set(e.c, counts[k] * 3);
        counts[k] += e.n;
      }
    }
    for (let k = 0; k < 2; k++) {
      const im = meshes[k];
      im.count = counts[k];
      im.instanceMatrix.clearUpdateRanges(); im.instanceMatrix.addUpdateRange(0, counts[k] * 16);
      im.instanceColor.clearUpdateRanges(); im.instanceColor.addUpdateRange(0, counts[k] * 3);
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor.needsUpdate = true;
    }
    if (cache.size > 3000) {
      for (const key of cache.keys()) { cache.delete(key); if (cache.size < 2000) break; }
    }
  }

  return {
    group,
    setQuality(qq) { U.radius.value = qq.grassRadius ?? 70; density = qq.grassDensity ?? 1; cache.clear(); lastKey = null; },
    update(camera, time) {
      U.time.value = time;
      const cam = camera.position;
      const alt = cam.y - terrain.heightAt(cam.x, cam.z);
      const show = alt < 120 && U.radius.value > 0;
      if (show !== visible) { group.visible = visible = show; lastKey = null; }
      if (!show) return;
      // Re-gather when the camera enters another cell (cells are gathered
      // half a cell beyond the radius, so the fade edge never runs out).
      const key = Math.floor(cam.x / CELL) + ',' + Math.floor(cam.z / CELL);
      if (key !== lastKey) { lastKey = key; rebuild(cam); }
    },
  };
}
