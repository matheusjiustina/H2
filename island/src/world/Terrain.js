import * as THREE from 'three';
import { patchMaterial } from '../core/MaterialPatch.js';
import { LAYER } from '../core/Shared.js';

const CHUNKS = 8;

// Terrain splat shading: 7 procedural layers in texture arrays, height-blended,
// rock triplanar on cliffs, wet sand band with wave wash, puddles in rain.
const TERRAIN_FRAG_PARS = /* glsl */ `
uniform highp sampler2DArray uAlb;
uniform highp sampler2DArray uNrm;
uniform sampler2D uSplatA;
uniform float uDetailFade;
vec4 sampleLayer(sampler2DArray t, vec2 uv, float layer) { return texture(t, vec3(uv, layer)); }
`;

const TERRAIN_FRAG_MAIN = /* glsl */ `
{
  vec2 tuv = terrainUV(vWPos.xz);
  vec4 sa = texture2D(uSplatA, tuv);
  vec4 sb = texture2D(uTerrainSplatB, tuv);
  vec4 td = texture2D(uTerrainData, tuv);
  vec3 wn0 = normalize(vTerrNormal);
  float dist = length(vWPos - cameraPosition);
  float macro = texture2D(uNoiseTex, vWPos.xz * 0.0021).r;
  float macro2 = texture2D(uNoiseTex, vWPos.xz * 0.011 + 0.3).g;
  float micro = texture2D(uNoiseTex, vWPos.xz * 0.09).b;

  // tiling with two scales to hide repetition
  vec2 uvA = vWPos.xz * 0.42;
  vec2 uvB = vWPos.xz * 0.093 + vec2(0.37, 0.71);
  float farMix = smoothstep(18.0, 70.0, dist);

  float wSand = sa.r, wGrass = sa.g, wSoil = sa.b, wRock = sa.a;
  float wPath = sb.r, wCoral = sb.b, wMud = sb.a, canopy = sb.g;
  // forest floor under the canopy, grass in the open
  float forest = wSoil + wGrass * canopy * 0.9;
  wGrass *= 1.0 - canopy * 0.9;
  // slope based rock from the actual mesh normal
  wRock = max(wRock, smoothstep(0.62, 0.48, wn0.y));
  wCoral *= step(vWPos.y, -0.1);

  float w[7];
  w[0] = wSand; w[1] = wGrass; w[2] = forest; w[3] = wRock; w[4] = wPath; w[5] = wCoral; w[6] = wMud;
  // break up borders with noise
  w[1] *= 0.6 + macro2 * 0.8;
  w[2] *= 0.6 + (1.0 - macro2) * 0.8;
  w[4] *= 1.2;

  vec3 alb = vec3(0.0); vec3 nrm = vec3(0.0); float rough = 0.0; float ao = 0.0; float wsum = 0.0;
  float hmax = -1.0;
  vec4 A[7]; vec4 N[7];
  for (int i = 0; i < 7; i++) {
    if (w[i] < 0.01) { A[i] = vec4(0.0); N[i] = vec4(0.5, 0.5, 0.8, 1.0); continue; }
    float li = float(i);
    vec4 a, n;
    if (i == 3) {
      // triplanar rock
      vec3 bw = pow(abs(wn0), vec3(4.0)); bw /= dot(bw, vec3(1.0));
      vec2 ux = vWPos.zy * 0.11, uy = vWPos.xz * 0.11, uz = vWPos.xy * 0.11;
      a = sampleLayer(uAlb, ux, li) * bw.x + sampleLayer(uAlb, uy, li) * bw.y + sampleLayer(uAlb, uz, li) * bw.z;
      n = sampleLayer(uNrm, ux, li) * bw.x + sampleLayer(uNrm, uy, li) * bw.y + sampleLayer(uNrm, uz, li) * bw.z;
      vec4 af = sampleLayer(uAlb, uy * 0.23, li);
      a.rgb = mix(a.rgb, a.rgb * af.rgb * 2.0, 0.35);
    } else {
      a = mix(sampleLayer(uAlb, uvA, li), sampleLayer(uAlb, uvB, li), 0.25 + farMix * 0.45);
      n = mix(sampleLayer(uNrm, uvA, li), sampleLayer(uNrm, uvB, li), 0.25 + farMix * 0.45);
    }
    A[i] = a; N[i] = n;
    hmax = max(hmax, a.a + w[i]);
  }
  for (int i = 0; i < 7; i++) {
    if (w[i] < 0.01) continue;
    float bw = max(A[i].a + w[i] - hmax + 0.25, 0.0) * w[i];
    alb += A[i].rgb * bw;
    nrm += (N[i].xyz * 2.0 - 1.0) * vec3(1.0, 1.0, 0.0) * bw;
    rough += N[i].b * bw;
    ao += N[i].a * bw;
    wsum += bw;
  }
  alb /= max(wsum, 1e-4); nrm /= max(wsum, 1e-4); rough /= max(wsum, 1e-4); ao /= max(wsum, 1e-4);
  // macro colour variation
  alb *= 0.82 + macro * 0.36;
  alb = mix(alb, alb * vec3(1.06, 1.0, 0.86), macro2 * 0.3);

  // --- wet sand band along the shore + wave wash
  float h = vWPos.y - uWaterLevel;
  float shore = td.b; // signed distance to waterline
  float wash = 0.16 * sin(uTime * 0.62 + shore * 0.35 + micro * 3.0) + 0.1;
  float wetBand = 1.0 - smoothstep(0.08 + wash * 0.6, 0.6 + wash * 0.4, h);
  float sandness = w[0] / max(w[0] + w[1] + w[2] + w[3] + 1e-3, 1e-3);
  float shoreWet = clamp(wetBand, 0.0, 1.0);

  // rain puddles in flat soil/path areas
  float flatness = smoothstep(0.92, 0.985, wn0.y);
  float puddleN = texture2D(uNoiseTex, vWPos.xz * 0.045).g;
  float puddle = smoothstep(0.58, 0.68, puddleN + uWetness * 0.12) * flatness * uWetness * (1.0 - sandness) * smoothstep(0.3, 0.8, w[4] + w[2] + w[6]) * step(0.2, h);
  float wet = max(shoreWet * mix(0.7, 1.0, sandness), puddle);

  diffuseColor.rgb = alb * mix(1.0, 0.62, wet);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.62, 0.68), puddle * 0.8);
  _terrRough = mix(rough, 0.08, wet * 0.85);
  _terrRough = mix(_terrRough, 0.03, puddle);
  _terrAO = ao;
  // detail normal (fade out with distance, flat in puddles)
  float nScale = (1.0 - smoothstep(30.0, 140.0, dist) * 0.7) * (1.0 - puddle) * mix(1.0, 0.6, shoreWet);
  _terrNrm = nrm * nScale;
}
`;

/**
 * Chunked terrain mesh built from TerrainData, rendered with a patched
 * MeshStandardMaterial for full PBR + shadows + IBL integration.
 */
export class Terrain {
  constructor(data, textures) {
    this.data = data;
    this.group = new THREE.Group();
    this.group.name = 'terrain';

    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    const extra = {
      uAlb: { value: textures.terrainAlbedo },
      uNrm: { value: textures.terrainNormal },
      uSplatA: { value: data.splatATexture },
      uDetailFade: { value: 1 },
    };
    patchMaterial(mat, {
      wet: 0, // terrain has its own wetness
      canopy: true,
      caustics: true,
      uniforms: extra,
      key: 'terrain',
      vertex: (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace('varying vec3 vWPos;', 'varying vec3 vWPos;\nvarying vec3 vTerrNormal;')
          .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvTerrNormal = normalize(mat3(modelMatrix) * objectNormal);');
      },
      fragment: (shader) => {
        let fs = shader.fragmentShader;
        fs = fs.replace('varying vec3 vWPos;', `varying vec3 vWPos;\nvarying vec3 vTerrNormal;\n${TERRAIN_FRAG_PARS}`);
        fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\nfloat _terrRough = 0.9; float _terrAO = 1.0; vec3 _terrNrm = vec3(0.0);\n${TERRAIN_FRAG_MAIN}`);
        fs = fs.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = _terrRough;');
        // world space detail normal perturbation (terrain is in world space; build TBN from world axes)
        fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 wn = normalize(vTerrNormal);
  vec3 t = normalize(vec3(1.0, 0.0, 0.0) - wn * wn.x);
  vec3 b = normalize(vec3(0.0, 0.0, 1.0) - wn * wn.z - t * t.z);
  vec3 pn = normalize(wn + t * _terrNrm.x + b * _terrNrm.y);
  normal = normalize((viewMatrix * vec4(pn, 0.0)).xyz);
}`);
        fs = fs.replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= _terrAO; reflectedLight.indirectSpecular *= _terrAO;');
        shader.fragmentShader = fs;
      },
    });
    this.material = mat;

    const { res, size } = data;
    const per = (res - 1) / CHUNKS;
    const W = per + 1;
    const chunkSize = size / CHUNKS;
    const SKIRT = 4;
    const skirtList = [];
    const skirtMap = new Map();
    {
      const ringV = [];
      for (let i = 0; i <= per; i++) ringV.push(i);
      for (let j = 1; j <= per; j++) ringV.push(per + W * j);
      for (let i = per - 1; i >= 0; i--) ringV.push(i + W * per);
      for (let j = per - 1; j >= 1; j--) ringV.push(W * j);
      for (const v of ringV) { if (!skirtMap.has(v)) { skirtMap.set(v, skirtList.length); skirtList.push(v); } }
    }
    // shared LOD index buffers (every chunk has the same vertex layout)
    this.lodIndex = [1, 2, 4].map((step) => {
      const idx = [];
      for (let iy = 0; iy < per; iy += step) {
        for (let ix = 0; ix < per; ix += step) {
          const a = ix + W * iy, b = ix + W * (iy + step), c = ix + step + W * (iy + step), d = ix + step + W * iy;
          idx.push(a, b, d, b, c, d);
        }
      }
      // skirts: border vertices dropped by SKIRT metres, both windings
      const border = (k) => W * W + k;
      const ring = [];
      for (let i = 0; i <= per; i++) ring.push(i); // z = 0 row
      for (let j = 1; j <= per; j++) ring.push(per + W * j); // x = max column
      for (let i = per - 1; i >= 0; i--) ring.push(i + W * per); // z = max row
      for (let j = per - 1; j >= 1; j--) ring.push(W * j); // x = 0 column
      ring.push(0);
      for (let k = 0; k < ring.length - 1; k++) {
        const v0 = ring[k], v1 = ring[k + 1];
        const onStep = (v) => ((v % W) % step === 0) && (Math.floor(v / W) % step === 0);
        if (!onStep(v0)) continue;
        // advance to the next vertex on this LOD's lattice along the ring
        let kk = k + 1;
        while (kk < ring.length - 1 && !onStep(ring[kk])) kk++;
        const vb = ring[kk];
        const s0 = border(ringIndexOf(v0)), s1 = border(ringIndexOf(vb));
        idx.push(v0, s0, vb, vb, s0, s1, v0, vb, s0, vb, s1, s0);
        k = kk - 1;
      }
      function ringIndexOf(v) { return skirtMap.get(v); }
      return new THREE.Uint32BufferAttribute(idx, 1);
    });
    this.chunks = [];
    for (let cz = 0; cz < CHUNKS; cz++) {
      for (let cx = 0; cx < CHUNKS; cx++) {
        const x0 = -size / 2 + cx * chunkSize;
        const z0 = -size / 2 + cz * chunkSize;
        const nv = W * W + skirtList.length;
        const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
        const H = (a, b) => data.heights[Math.min(res - 1, Math.max(0, b)) * res + Math.min(res - 1, Math.max(0, a))];
        const gi0 = cx * per, gj0 = cz * per;
        for (let iy = 0; iy < W; iy++) {
          for (let ix = 0; ix < W; ix++) {
            const k = ix + W * iy;
            const gi = gi0 + ix, gj = gj0 + iy;
            pos[k * 3] = x0 + ix * data.cell; pos[k * 3 + 1] = H(gi, gj); pos[k * 3 + 2] = z0 + iy * data.cell;
            const nx = H(gi - 1, gj) - H(gi + 1, gj), nz = H(gi, gj - 1) - H(gi, gj + 1), ny = 2 * data.cell;
            const l = Math.hypot(nx, ny, nz);
            nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;
            uv[k * 2] = ix / per; uv[k * 2 + 1] = iy / per;
          }
        }
        skirtList.forEach((v, n) => {
          const k = W * W + n;
          pos[k * 3] = pos[v * 3]; pos[k * 3 + 1] = pos[v * 3 + 1] - SKIRT; pos[k * 3 + 2] = pos[v * 3 + 2];
          nor[k * 3] = nor[v * 3]; nor[k * 3 + 1] = nor[v * 3 + 1]; nor[k * 3 + 2] = nor[v * 3 + 2];
          uv[k * 2] = uv[v * 2]; uv[k * 2 + 1] = uv[v * 2 + 1];
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geo.setIndex(this.lodIndex[0]);
        geo.computeBoundingBox();
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        mesh.layers.enable(LAYER.REFLECT_LITE);
        mesh.userData.center = new THREE.Vector3(x0 + chunkSize / 2, 0, z0 + chunkSize / 2);
        mesh.userData.lod = 0;
        this.group.add(mesh);
        this.chunks.push(mesh);
      }
    }
    this.chunkSize = chunkSize;
  }

  update(dt, game) {
    const c = game.camera.position;
    for (const m of this.chunks) {
      const d = Math.hypot(m.userData.center.x - c.x, m.userData.center.z - c.z) - this.chunkSize * 0.5;
      const lod = d < 150 ? 0 : d < 360 ? 1 : 2;
      if (lod !== m.userData.lod) {
        m.userData.lod = lod;
        m.geometry.setIndex(this.lodIndex[lod]);
      }
    }
  }
}
