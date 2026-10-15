// Crop rendering, kept separate from the physics representation (which only
// uses the field rectangle + canopy height):
//  * canopy: a terrain-following surface at ~78% of crop height with a row
//    texture and patchy vertex colour (what you see from altitude);
//  * edge walls: leafy side cards around every field (field borders read as
//    real plant walls, as in the reference video);
//  * row fins: vertical alpha-tested leaf strips, one per crop row, generated
//    in 48 m patches around the camera. They shrink into the canopy toward the
//    edge of the detail radius so there is no visible pop.
import * as THREE from 'three';
import { FIELDS, CROPS, cropHeight } from './layout.js';
import { makeCropCard, makeCanopyTop } from '../core/textures.js';
import { fbm } from '../core/math.js';

const CANOPY = 0.78; // canopy surface relative to crop height
const FIN_LO = 0.42, FIN_HI = 1.04;
const PATCH = 48;
const CROP_KINDS = ['soy', 'corn', 'cotton'];

function finMaterial(tex, radiusU) {
  const m = new THREE.MeshStandardMaterial({
    map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, metalness: 0,
    color: new THREE.Color(0.86, 0.9, 0.82), alphaToCoverage: true,
  });
  m.onBeforeCompile = (s) => {
    s.uniforms.uRadius = radiusU;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uRadius;\nattribute float aBase;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wpF = modelMatrix * vec4(transformed, 1.0);
        float dF = distance(wpF.xz, cameraPosition.xz);
        float k = 1.0 - smoothstep(uRadius * 0.62, uRadius, dF);
        transformed.y = aBase + (transformed.y - aBase) * k;`);
    // Self-shadowing inside the crop: darker toward the base of each row.
    s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\n diffuseColor.rgb *= mix(0.38, 1.05, smoothstep(0.0, 0.95, vMapUv.y));');
  };
  m.customProgramCacheKey = () => 'fin';
  return m;
}

// Canopy seen from altitude: the row texture plus what makes a real field read
// from the air — the ground sprayer's tramlines (two wheel tracks every
// 27 m, plants flattened to soil and straw) and the headlands at the row
// ends, where rows turn across and the machines' turning track shows.
function canopyMaterial(tex, kind) {
  const m = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.88, metalness: 0 });
  const tramK = kind === 'corn' ? 0.45 : 0.8;
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aField;\nattribute vec4 aInfo;\nvarying vec4 vField;\nvarying vec4 vInfo;\nvarying vec3 vCWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvField = aField; vInfo = aInfo; vCWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vField;\nvarying vec4 vInfo;\nvarying vec3 vCWP;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec2 p = vCWP.xz;
          bool ax = vInfo.x < 0.5;
          float along = ax ? p.x : p.y;
          float across = ax ? p.y : p.x;
          float a0 = ax ? vField.x : vField.y, a1 = ax ? vField.z : vField.w;
          float e = min(along - a0, a1 - along);
          float head = 1.0 - smoothstep(9.0, 10.5, e);
          vec4 tH = texture2D(map, vec2(across / 4.0, along / (4.0 * vInfo.y)));
          diffuseColor.rgb = mix(diffuseColor.rgb, tH.rgb, head);
          float fwA = fwidth(across), fwE = fwidth(e);
          float vis = 1.0 - smoothstep(0.25, 0.9, max(fwA, fwE));
          float tp = mod(across - vInfo.w, vInfo.z) - vInfo.z * 0.5;
          float tr = 1.0 - smoothstep(0.16, 0.42 + fwA, abs(abs(tp) - 0.9));
          tr *= (1.0 - head) * step(4.0, abs(across - (ax ? vField.y : vField.x))) * step(4.0, abs((ax ? vField.w : vField.z) - across));
          float turn = 1.0 - smoothstep(0.16, 0.42 + fwE, abs(abs(e - 5.2) - 0.9));
          float t = max(tr, turn * head) * vis * ${tramK.toFixed(2)};
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.4, 0.32) + vec3(0.035, 0.022, 0.012), t);
        }`);
  };
  m.customProgramCacheKey = () => 'canopy-' + kind;
  return m;
}

export function createCrops(terrain, quality) {
  const group = new THREE.Group();
  group.name = 'crops';
  const tex = {};
  const canopyMats = {};
  const cardMats = {};
  const radiusU = { value: quality.cropRadius };
  for (const k of CROP_KINDS) {
    tex[k] = { card: makeCropCard(k, 7 + k.length), top: makeCanopyTop(k, 3 + k.length) };
    canopyMats[k] = canopyMaterial(tex[k].top, k);
    cardMats[k] = finMaterial(tex[k].card, radiusU);
  }

  const fields = FIELDS.filter((f) => CROP_KINDS.includes(f.crop));
  for (const f of fields) {
    const h = cropHeight(f);
    group.add(buildCanopy(f, h, terrain, canopyMats[f.crop]));
    group.add(buildEdges(f, h, terrain, cardMats[f.crop]));
  }

  // --- row fin patches around the camera ---------------------------------
  const cache = new Map();
  const active = new Set();
  const finGroup = new THREE.Group();
  group.add(finGroup);
  let radius = quality.cropRadius;

  function patchKey(px, pz) { return px + ',' + pz; }

  function buildPatch(px, pz) {
    const x0 = px * PATCH, z0 = pz * PATCH, x1 = x0 + PATCH, z1 = z0 + PATCH;
    const meshes = [];
    for (const f of fields) {
      const ix0 = Math.max(x0, f.x0), ix1 = Math.min(x1, f.x1);
      const iz0 = Math.max(z0, f.z0), iz1 = Math.min(z1, f.z1);
      if (ix0 >= ix1 || iz0 >= iz1) continue;
      const geo = buildFins(f, ix0, ix1, iz0, iz1, terrain);
      if (!geo) continue;
      const m = new THREE.Mesh(geo, cardMats[f.crop]);
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      meshes.push(m);
    }
    return meshes;
  }

  const tmp = [];
  return {
    group,
    setQuality(q) { radius = q.cropRadius; radiusU.value = radius; },
    update(cameraPos) {
      // Only build fins when the camera is reasonably low; from high up the
      // canopy texture carries the look.
      const ground = terrain.heightAt(cameraPos.x, cameraPos.z);
      const alt = cameraPos.y - ground;
      const r = alt > 380 ? 0 : radius;
      const need = new Set();
      if (r > 0) {
        const pcx = Math.floor(cameraPos.x / PATCH), pcz = Math.floor(cameraPos.z / PATCH);
        const n = Math.ceil(r / PATCH) + 1;
        tmp.length = 0;
        for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
          const px = pcx + i, pz = pcz + j;
          const cx = (px + 0.5) * PATCH, cz = (pz + 0.5) * PATCH;
          const d = Math.hypot(cx - cameraPos.x, cz - cameraPos.z);
          if (d - PATCH * 0.71 > r) continue;
          tmp.push([d, px, pz]);
        }
        tmp.sort((a, b) => a[0] - b[0]);
        let budget = 6;
        for (const [, px, pz] of tmp) {
          const key = patchKey(px, pz);
          need.add(key);
          if (!cache.has(key)) {
            if (budget-- <= 0) { need.delete(key); continue; }
            cache.set(key, buildPatch(px, pz));
          }
        }
      }
      for (const key of active) {
        if (!need.has(key)) {
          for (const m of cache.get(key) || []) finGroup.remove(m);
          active.delete(key);
        }
      }
      for (const key of need) {
        if (!active.has(key)) {
          for (const m of cache.get(key)) finGroup.add(m);
          active.add(key);
        }
      }
      // Evict far cached patches.
      if (cache.size > 600) {
        for (const [key, ms] of cache) {
          if (active.has(key)) continue;
          for (const m of ms) m.geometry.dispose();
          cache.delete(key);
          if (cache.size < 400) break;
        }
      }
    },
  };
}

function buildCanopy(f, h, terrain, mat) {
  const step = 8;
  const nx = Math.max(2, Math.ceil((f.x1 - f.x0) / step) + 1);
  const nz = Math.max(2, Math.ceil((f.z1 - f.z0) / step) + 1);
  const sp = CROPS[f.crop].rowSpacing;
  const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), col = new Float32Array(nx * nz * 3);
  const nrm = new Float32Array(nx * nz * 3);
  const n = { x: 0, y: 1, z: 0 };
  const hc = h * CANOPY;
  const hue = f.crop === 'corn' ? [1.0, 1.0, 0.82] : f.crop === 'cotton' ? [1.0, 1.0, 0.95] : [1.02, 1.06, 0.88];
  // Tramlines of the ground sprayer every 27 m, phase per field.
  const tram = [f.rowAxis === 'x' ? 0 : 1, sp, 27, (f.id * 7.3) % 27];
  const fld = [f.x0, f.z0, f.x1, f.z1];
  const aF = new Float32Array(nx * nz * 4), aI = new Float32Array(nx * nz * 4);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = Math.min(f.x1, f.x0 + i * step), z = Math.min(f.z1, f.z0 + j * step);
      const k = j * nx + i;
      const edge = Math.min(x - f.x0, f.x1 - x, z - f.z0, f.z1 - z);
      // Slightly lower at the very edge (headlands are trodden by machines).
      const eh = 0.85 + 0.15 * Math.min(1, edge / 6);
      pos[k * 3] = x; pos[k * 3 + 1] = terrain.heightAt(x, z) + hc * eh; pos[k * 3 + 2] = z;
      if (f.rowAxis === 'x') { uv[k * 2] = x / 4; uv[k * 2 + 1] = z / (4 * sp); }
      else { uv[k * 2] = z / 4; uv[k * 2 + 1] = x / (4 * sp); }
      terrain.normalAt(x, z, n);
      nrm[k * 3] = n.x; nrm[k * 3 + 1] = n.y; nrm[k * 3 + 2] = n.z;
      // Vigour patches (soil fertility, moisture): mottled tone from altitude.
      const v = fbm(x / 140 + f.id * 3.1, z / 140, 3);
      const v2 = fbm(x / 35, z / 35 + f.id, 2);
      const tone = 0.86 + 0.2 * v + 0.07 * v2;
      const yellow = Math.max(0, -v) * 0.25;
      aF.set(fld, k * 4); aI.set(tram, k * 4);
      col[k * 3] = tone * hue[0] * (1 + yellow);
      col[k * 3 + 1] = tone * hue[1];
      col[k * 3 + 2] = tone * hue[2] * (1 - yellow);
    }
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, d = a + 1, b = a + nx, c = b + 1;
    idx.push(a, b, d, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aField', new THREE.BufferAttribute(aF, 4));
  g.setAttribute('aInfo', new THREE.BufferAttribute(aI, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  m.name = 'canopy-' + f.name;
  return m;
}

const edgeMats = new Map();
function buildEdges(f, h, terrain, mat) {
  const pos = [], uv = [], nrm = [], base = [], idx = [];
  const seg = 6;
  const side = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / seg));
    const start = pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const g = terrain.heightAt(x, z);
      const u = (t * len) / 4;
      pos.push(x, g - 0.05, z, x, g + h * FIN_HI, z);
      uv.push(u, 0, u, 1);
      nrm.push(0, 1, 0, 0, 1, 0);
      base.push(g, g);
    }
    for (let i = 0; i < n; i++) {
      const a = start + i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  };
  side(f.x0, f.z0, f.x1, f.z0);
  side(f.x1, f.z0, f.x1, f.z1);
  side(f.x1, f.z1, f.x0, f.z1);
  side(f.x0, f.z1, f.x0, f.z0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aBase', new THREE.Float32BufferAttribute(base, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  // Edge walls never shrink: give them a huge radius via a separate material.
  const em = edgeMats.get(mat) || mat.clone();
  if (!edgeMats.has(mat)) {
    const src = mat.onBeforeCompile;
    em.onBeforeCompile = (sh) => { src(sh); sh.uniforms.uRadius = { value: 1e7 }; };
    em.customProgramCacheKey = () => 'edge';
    edgeMats.set(mat, em);
  }
  const m = new THREE.Mesh(g, em);
  m.receiveShadow = true;
  m.castShadow = false;
  return m;
}

function buildFins(f, x0, x1, z0, z1, terrain) {
  const sp = CROPS[f.crop].rowSpacing;
  const h = cropHeight(f);
  const seg = 12;
  const pos = [], uv = [], nrm = [], base = [], idx = [];
  const alongX = f.rowAxis === 'x';
  const a0 = alongX ? z0 : x0, a1 = alongX ? z1 : x1; // across-row extent
  const l0 = alongX ? x0 : z0, l1 = alongX ? x1 : z1; // along-row extent
  const k0 = Math.ceil(a0 / sp - 0.5), k1 = Math.floor(a1 / sp - 0.5);
  const n = Math.max(1, Math.ceil((l1 - l0) / seg));
  const tramPhase = (f.id * 7.3) % 27;
  for (let k = k0; k <= k1; k++) {
    const c = (k + 0.5) * sp;
    // Rows under the ground sprayer's wheel tracks are flattened (matches the
    // tramlines drawn on the canopy from the air).
    const tp = (((c - tramPhase) % 27) + 27) % 27 - 13.5;
    if (Math.abs(Math.abs(tp) - 0.9) < 0.3 && f.crop !== 'corn') continue;
    const start = pos.length / 3;
    // Each row gets its own texture offset so rows don't line up.
    const uOff = ((k * 0.618) % 1) * 4;
    for (let i = 0; i <= n; i++) {
      const l = l0 + ((l1 - l0) * i) / n;
      const x = alongX ? l : c, z = alongX ? c : l;
      const g = terrain.heightAt(x, z);
      const u = (l + uOff) / 4;
      pos.push(x, g + h * FIN_LO, z, x, g + h * FIN_HI, z);
      uv.push(u, 0.02, u, 1);
      nrm.push(0, 1, 0, 0, 1, 0);
      base.push(g + h * (CANOPY - 0.08), g + h * (CANOPY - 0.08));
    }
    for (let i = 0; i < n; i++) {
      const a = start + i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aBase', new THREE.Float32BufferAttribute(base, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
