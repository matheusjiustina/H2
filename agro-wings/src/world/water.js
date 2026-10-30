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

function waterMaterial(noise) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.07, metalness: 0.0, envMapIntensity: 1.25, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.onBeforeCompile = (s) => {
    s.uniforms.uNoise = { value: noise };
    s.uniforms.uTime = ATMO_U.time;
    s.uniforms.uWind = ATMO_U.wind;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aDepth;\nvarying float vDepth;\nvarying vec3 vWW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDepth = aDepth;\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uNoise;\nuniform float uTime;\nuniform vec4 uWind;\nvarying float vDepth;\nvarying vec3 vWW;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dk = smoothstep(0.05, 1.8, vDepth);
        vec3 shallow = vec3(0.20, 0.18, 0.10), deep = vec3(0.018, 0.062, 0.060);
        diffuseColor.rgb = mix(shallow, deep, dk);
        diffuseColor.a = smoothstep(0.0, 0.45, vDepth) * mix(0.72, 0.95, dk);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 drift = uWind.xy * uTime * 0.05;
          vec4 n1 = texture2D(uNoise, vWW.xz * 0.045 + drift + vec2(uTime * 0.006, 0.0));
          vec4 n2 = texture2D(uNoise, vWW.xz * 0.11 - drift * 1.3 + vec2(0.0, uTime * 0.009));
          vec2 tilt = (n1.rg + n2.gb - 1.0) * (0.05 + 0.012 * min(uWind.z, 8.0));
          normal = normalize(normal + (viewMatrix * vec4(tilt.x, 0.0, tilt.y, 0.0)).xyz);
        }`);
  };
  m.customProgramCacheKey = () => 'water-v1';
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
  const SEG = 56, RINGS = 6;
  const pos = [p.x, p.level, p.z], dep = [Math.max(0, p.level - terrain.heightAt(p.x, p.z))], idx = [];
  for (let r = 1; r <= RINGS; r++) {
    const k = (r / RINGS) * 1.08;
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
