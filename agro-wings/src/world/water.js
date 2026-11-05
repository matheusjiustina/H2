// Water regions: the creek, the Vale do Rio stream and the farm reservoirs /
// valley lake, all drawn with one material: colour from the real depth
// (water level minus the terrain under each vertex: brown-green shallows,
// dark teal pools), alpha fading out on the shore so the edges blend into
// the banks, the sky reflected by the PBR environment (low roughness, so the
// fresnel brightens it at grazing angles), and two scrolling noise layers
// tilting the normal for a slight ripple and slow drift. Small timber
// bridges carry the farm roads over the water.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CREEK, WATER, ROADS, pondRadius } from './layout.js';
import { ATMO_U } from './atmosphere.js';

// Contact ripples / wake (src/world/waterFx.js): up to RIP rings in world
// space, [x, z, start time, strength]; one uniform array, no textures.
export const RIP = 16;
export const WATER_U = {
  rip: { value: Array.from({ length: RIP }, () => new THREE.Vector4(0, 0, -1e4, 0)) },
  detail: { value: 1 }, // quality: 1 full detail, 0.5 simplified (mobile)
};

function waterMaterial(noise) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.07, metalness: 0.0, envMapIntensity: 1.25, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.onBeforeCompile = (s) => {
    s.uniforms.uNoise = { value: noise };
    s.uniforms.uTime = ATMO_U.time;
    s.uniforms.uWind = ATMO_U.wind;
    s.uniforms.uRip = WATER_U.rip;
    s.uniforms.uDetail = WATER_U.detail;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aDepth;\nvarying float vDepth;\nvarying vec3 vWW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDepth = aDepth;\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uNoise;
        uniform float uTime;
        uniform vec4 uWind;
        uniform vec4 uRip[${RIP}];
        uniform float uDetail;
        varying float vDepth;
        varying vec3 vWW;
        float wFoam = 0.0, wRough = 0.07;
        // Slope (d/dx, d/dz) of the wind sea: four directional trains around
        // the wind (lengths 2.6–13 m, deep-water speeds), their height grows
        // with the wind; patches of calmer and rougher water drift with it.
        vec2 windSea(vec2 p, float k, float fade) {
          vec2 d0 = normalize(uWind.xy + vec2(1e-4));
          vec2 g = vec2(0.0);
          float t = uTime;
          // Six trains, spread round the wind with unrelated lengths; each
          // one's height wanders with its own large-scale noise, so no
          // regular bands survive; the short ones fade with distance (no
          // moiré far away).
          vec4 m1 = texture2D(uNoise, p * 0.0037 + vec2(0.13, 0.71));
          vec4 m2 = texture2D(uNoise, p * 0.0061 + vec2(0.57, 0.29));
          float amps[6];
          amps[0] = m1.r; amps[1] = m1.g; amps[2] = m1.b; amps[3] = m2.r; amps[4] = m2.g; amps[5] = m2.b;
          for (int i = 0; i < 6; i++) {
            float fi = float(i);
            float ang = (fract(sin(fi * 12.9898) * 43758.5453) - 0.5) * 1.6;
            vec2 d = vec2(d0.x * cos(ang) - d0.y * sin(ang), d0.x * sin(ang) + d0.y * cos(ang));
            float L = 14.0 * pow(0.68, fi) * (0.85 + 0.3 * fract(fi * 0.618));
            float w = 6.2832 / L, c = sqrt(9.81 / w);
            float ph = w * (dot(d, p) - c * t) + fi * 2.39;
            float far = fi < 2.0 ? 1.0 : fade;
            g += d * (w * cos(ph)) * (L * 0.011 * k) * (0.3 + 1.4 * amps[i]) * far;
          }
          return g;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dk = smoothstep(0.05, 1.8, vDepth);
        vec3 shallow = vec3(0.20, 0.18, 0.10), deep = vec3(0.018, 0.062, 0.060);
        // Slow, large variations of tint (no visible tiling).
        float tintN = texture2D(uNoise, vWW.xz * 0.0021 + vec2(0.31, 0.77)).r;
        deep *= 0.85 + 0.3 * tintN;
        diffuseColor.rgb = mix(shallow, deep, dk);
        float aE = smoothstep(0.0, 1.1, vDepth);
        diffuseColor.a = aE * aE * mix(0.72, 0.95, dk);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float ws = uWind.z;                                // m/s, the weather's mean wind
          float calm = smoothstep(0.0, 9.0, ws);
          vec2 drift = uWind.xy * uTime * (0.02 + 0.012 * min(ws, 10.0));
          // Gusty patches (cat's paws) moving downwind.
          float gustP = texture2D(uNoise, vWW.xz * 0.0055 - drift * 0.06).g;
          gustP = mix(0.45, 1.35, smoothstep(0.25, 0.8, gustP));
          float k = (0.25 + 1.6 * calm) * gustP;
          float camD = length(vWW - cameraPosition);
          float fade = 1.0 - smoothstep(70.0, 380.0, camD);
          vec2 g = windSea(vWW.xz, k, fade);
          // Fine ripples (two rotated noise layers at unrelated scales).
          vec2 p1 = vWW.xz * 0.061 + drift * 0.9 + vec2(uTime * 0.004, 0.0);
          vec2 p2 = mat2(0.8, -0.6, 0.6, 0.8) * vWW.xz * 0.149 - drift * 1.4 + vec2(0.0, uTime * 0.007);
          vec4 n1 = texture2D(uNoise, p1);
          vec4 n2 = texture2D(uNoise, p2);
          g += (n1.rg + n2.gb - 1.0) * (0.035 + 0.05 * calm) * gustP * uDetail * (0.4 + 0.6 * fade);
          // Contact rings and wake from the aircraft.
          float foam = 0.0;
          for (int i = 0; i < ${RIP}; i++) {
            vec4 r = uRip[i];
            float age = uTime - r.z;
            if (age < 0.0 || age > 7.0 || r.w <= 0.0) continue;
            vec2 dv = vWW.xz - r.xy;
            float dist = length(dv);
            float front = 0.6 + age * 2.6;
            float x = dist - front;
            float env = exp(-x * x / (2.0 + age * 1.6)) * exp(-age * 0.55) * r.w;
            g += (dv / max(dist, 0.01)) * cos(x * 1.9) * env * 0.35;
            foam += r.w * exp(-age * 0.9) * (1.0 - smoothstep(0.5, 2.2 + age * 1.1, dist)) * 0.7;
          }
          // Whitecaps only in strong wind.
          float cap = smoothstep(7.5, 12.0, ws) * smoothstep(0.72, 0.9, n1.b * 0.6 + n2.r * 0.4 + gustP * 0.15);
          wFoam = clamp(foam + cap * 0.6, 0.0, 1.0);
          wRough = mix(0.035, 0.17, calm * smoothstep(0.4, 1.3, gustP)) + wFoam * 0.4;
          vec3 nW = normalize(vec3(-g.x, 1.0, -g.y));
          vec3 nV = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
          normal = normalize(mix(normal, nV, 0.92));
          roughnessFactor = wRough; // (declared by roughnessmap_fragment, read by the lights below)
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.9), wFoam * 0.75);
        diffuseColor.a = max(diffuseColor.a, wFoam * 0.85 * smoothstep(0.2, 0.8, vDepth));`);
  };
  m.customProgramCacheKey = () => 'water-v2';
  return m;
}

// Ribbon along a water line: cross-sections every 8 m, five columns.
function ribbon(terrain, pts, halfW, levelAt) {
  const pos = [], dep = [], idx = [];
  const C = [-1, -0.5, 0, 0.5, 1];
  let rows = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(len / 8));
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    for (let k = 0; k <= steps; k++) {
      if (i > 0 && k === 0) continue;
      const t = k / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const y = levelAt(x, z);
      for (const c of C) {
        const px = x + nx * halfW * c, pz = z + nz * halfW * c;
        pos.push(px, y, pz);
        // The channel is narrower than the terrain grid: the middle of the
        // ribbon stays opaque (the banks hide it where the grid is higher).
        dep.push(Math.max(Math.abs(c) <= 0.5 ? 0.9 : 0, y - terrain.heightAt(px, pz)));
      }
      if (rows > 0) {
        const r0 = (rows - 1) * C.length, r1 = rows * C.length;
        for (let j = 0; j < C.length - 1; j++) idx.push(r0 + j, r1 + j, r0 + j + 1, r0 + j + 1, r1 + j, r1 + j + 1);
      }
      rows++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Pond: rings out to just past the shoreline.
function pondGeometry(terrain, p) {
  const SEG = p.lobes ? (p.big ? 160 : 112) : 72;
  // Rings: spaced out in the open water, dense across the shore, where the
  // depth (and so the colour and alpha) changes fast — a soft edge instead of
  // the terrain grid's steps.
  const KS = [0.3, 0.55, 0.72, 0.83, 0.9, 0.94, 0.97, 0.99, 1.01, 1.03, 1.05, 1.08, 1.12];
  const RINGS = KS.length;
  const pos = [p.x, p.level, p.z], dep = [Math.max(0, p.level - terrain.heightAt(p.x, p.z))], idx = [];
  for (let r = 1; r <= RINGS; r++) {
    const k = KS[r - 1];
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2, rr = pondRadius(p, a) * k;
      const x = p.x + Math.cos(a) * rr, z = p.z + Math.sin(a) * rr;
      pos.push(x, p.level, z);
      dep.push(Math.max(0, p.level - terrain.heightAt(x, z)));
    }
  }
  for (let s = 0; s < SEG; s++) idx.push(0, 1 + ((s + 1) % SEG), 1 + s);
  for (let r = 1; r < RINGS; r++) {
    const o0 = 1 + (r - 1) * SEG, o1 = 1 + r * SEG;
    for (let s = 0; s < SEG; s++) {
      const s1 = (s + 1) % SEG;
      idx.push(o0 + s, o0 + s1, o1 + s, o1 + s, o0 + s1, o1 + s1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Where the farm roads cross water: point, road direction and width.
export function waterCrossings() {
  const lines = [{ pts: CREEK.points, w: CREEK.width }, ...WATER.streams.map((s) => ({ pts: s.points, w: s.width }))];
  const out = [];
  for (const r of ROADS) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      for (const L of lines) {
        for (let j = 0; j < L.pts.length - 1; j++) {
          const [cx, cz] = L.pts[j], [dx, dz] = L.pts[j + 1];
          const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
          if (Math.abs(den) < 1e-9) continue;
          const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den;
          const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          const len = Math.hypot(bx - ax, bz - az);
          out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, dir: Math.atan2(bx - ax, bz - az), roadW: r.w, waterW: L.w, ux: (bx - ax) / len, uz: (bz - az) / len });
        }
      }
    }
  }
  return out;
}

function buildBridges(terrain) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x6f5034, roughness: 0.92 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3f2e20, roughness: 0.95 });
  const parts = { wood: [], dark: [] };
  const box = (list, w, h, d, x, y, z, ry) => list.push(new THREE.BoxGeometry(w, h, d).rotateY(ry).translate(x, y, z));
  for (const c of waterCrossings()) {
    const L = c.waterW + 16, W = c.roadW + 1.2;
    const e0x = c.x - c.ux * L / 2, e0z = c.z - c.uz * L / 2, e1x = c.x + c.ux * L / 2, e1z = c.z + c.uz * L / 2;
    const y = Math.max(terrain.heightAt(e0x, e0z), terrain.heightAt(e1x, e1z)) + 0.35;
    const ry = c.dir;
    // Deck (planks across), two stringers, rails on posts, piers in the water.
    for (let s = -L / 2; s <= L / 2; s += 0.5) box(parts.wood, W, 0.12, 0.42, c.x + c.ux * s, y, c.z + c.uz * s, ry);
    const nx = c.uz, nz = -c.ux;
    for (const side of [-1, 1]) {
      const ox = nx * side * (W / 2 - 0.3), oz = nz * side * (W / 2 - 0.3);
      box(parts.dark, 0.3, 0.45, L, c.x + ox, y - 0.3, c.z + oz, ry);
      const rx = nx * side * (W / 2 + 0.05), rz = nz * side * (W / 2 + 0.05);
      for (let s = -L / 2; s <= L / 2 + 0.01; s += 2.4) box(parts.dark, 0.14, 1.05, 0.14, c.x + rx + c.ux * s, y + 0.55, c.z + rz + c.uz * s, ry);
      box(parts.wood, 0.1, 0.12, L, c.x + rx, y + 1.05, c.z + rz, ry);
      for (const s of [-c.waterW * 0.35, c.waterW * 0.35]) {
        const px = c.x + ox + c.ux * s, pz = c.z + oz + c.uz * s;
        const gy = terrain.heightAt(px, pz) - 0.6;
        box(parts.dark, 0.32, y - gy, 0.32, px, (y + gy) / 2, pz, ry);
      }
    }
  }
  const g = new THREE.Group();
  g.name = 'bridges';
  for (const [k, mat] of [['wood', wood], ['dark', dark]]) {
    if (!parts[k].length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(parts[k].map((x) => x.toNonIndexed())), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}

export function createWater(terrain, noise) {
  const group = new THREE.Group();
  group.name = 'water';
  const mat = waterMaterial(noise);
  const add = (geo, name) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.renderOrder = 1; m.receiveShadow = true; group.add(m); };
  // Creek: the water surface under its banks (terrainData.waterLevel).
  add(ribbon(terrain, CREEK.points, CREEK.width * 0.5 + 3, (x, z) => terrain.waterLevel(x, z)), 'creek');
  for (const st of WATER.streams) add(ribbon(terrain, st.points, st.width * 0.5 + 10, (x, z) => terrain.waterLevel(x, z)), 'stream');
  for (const p of WATER.ponds) add(pondGeometry(terrain, p), 'pond');
  group.add(buildBridges(terrain));
  return group;
}
