// Buildings, base equipment, vehicles, fences, strip markings, windsocks,
// power line and creek water. Static parts are merged per material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BASE, RUNWAY, HQ, FENCES, POWERLINE, CREEK, FARM_SITES } from './layout.js';
import { canvas, canvasTexture, makeLabel } from '../core/textures.js';
import { rng } from '../core/math.js';
import { pickup, tractor, sprayer, harvester, ibc, drumPallet, officeContainer } from './vehicles.js';

// ---------------------------------------------------------------------------
// Materials
function corrugatedTex(base = '#b9bcbd', dark = '#8b8f91') {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  for (let x = 0; x < 256; x++) {
    const t = 0.5 + 0.5 * Math.sin((x / 256) * Math.PI * 2 * 16);
    g.fillStyle = t > 0.5 ? base : dark;
    g.globalAlpha = 1;
    g.fillRect(x, 0, 1, 256);
  }
  const r = rng(5);
  g.globalAlpha = 0.18;
  for (let i = 0; i < 90; i++) { // rust/dirt streaks
    g.fillStyle = r() < 0.5 ? '#6b4a2c' : '#555';
    g.fillRect(r() * 256, r() * 256, 2 + r() * 6, 20 + r() * 80);
  }
  return canvasTexture(c, { repeat: true });
}
function tileRoofTex() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  const r = rng(9);
  for (let y = 0; y < 256; y += 16) {
    for (let x = 0; x < 256; x += 20) {
      const k = 0.85 + r() * 0.3;
      g.fillStyle = `rgb(${Math.round(160 * k)},${Math.round(72 * k)},${Math.round(44 * k)})`;
      g.fillRect(x + ((y / 16) % 2) * 10, y, 19, 15);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x + ((y / 16) % 2) * 10, y + 12, 19, 3);
    }
  }
  return canvasTexture(c, { repeat: true });
}
function noiseTex(base, var1, seed = 3, n = 2500) {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = var1(r);
    g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3);
  }
  return canvasTexture(c, { repeat: true });
}

function makeMaterials() {
  const M = {};
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const roofT = corrugatedTex('#c4c7c6', '#959a9a');
  M.metalRoof = std({ map: roofT, metalness: 0.55, roughness: 0.45 });
  M.metalWall = std({ map: corrugatedTex('#d9d6cc', '#b5b2a7'), metalness: 0.4, roughness: 0.55 });
  M.steel = std({ color: 0x6d7275, metalness: 0.8, roughness: 0.4 });
  M.galv = std({ map: corrugatedTex('#cfd3d4', '#a7adaf'), metalness: 0.75, roughness: 0.35 });
  M.concrete = std({ map: noiseTex('#a8a39a', (r) => `rgba(${r() < 0.5 ? '80,78,72' : '200,196,188'},0.25)`), roughness: 0.95 });
  M.padConcrete = std({ map: noiseTex('#7d7a72', (r) => `rgba(${r() < 0.5 ? '50,46,40' : '150,146,138'},0.3)`, 8), roughness: 0.95 });
  M.wall = std({ map: noiseTex('#ece6da', (r) => `rgba(${r() < 0.5 ? '150,140,120' : '255,255,250'},0.12)`, 4, 1500), roughness: 0.9 });
  M.roofTile = std({ map: tileRoofTex(), roughness: 0.85 });
  M.woodDark = std({ color: 0x5a3d26, roughness: 0.9 });
  M.wood = std({ color: 0x8a6542, roughness: 0.9 });
  M.blue = std({ color: 0x1f5fa8, roughness: 0.45, metalness: 0.05 });
  M.blueDark = std({ color: 0x173f73, roughness: 0.5 });
  M.white = std({ color: 0xf2f0ea, roughness: 0.5, metalness: 0.1 });
  M.red = std({ color: 0xb3261e, roughness: 0.5 });
  M.yellow = std({ color: 0xf0b20f, roughness: 0.45 });
  M.green = std({ color: 0x2f6b2c, roughness: 0.55 });
  M.orange = std({ color: 0xff6a13, roughness: 0.6 });
  M.black = std({ color: 0x1b1c1d, roughness: 0.8 });
  M.rubber = std({ color: 0x171717, roughness: 0.95 });
  M.glass = std({ color: 0x202a30, roughness: 0.08, metalness: 0.2, envMapIntensity: 1.2 });
  M.dirtyWhite = std({ color: 0xdedbd2, roughness: 0.7 });
  M.hoseBlack = std({ color: 0x111111, roughness: 0.7 });
  // Vehicles and equipment. Most parts reuse the materials above so the
  // merged static meshes (one draw per material) stay few.
  M.paintWhite = new THREE.MeshPhysicalMaterial({ color: 0xe9e9e4, roughness: 0.38, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.25 });
  M.alu = std({ color: 0xc9cdd0, roughness: 0.3, metalness: 0.9 });
  M.plasticBlack = M.black;
  M.chrome = M.alu;
  M.lens = M.white;
  M.tailLens = M.red;
  M.amber = M.orange;
  M.poly = M.dirtyWhite;
  M.tractorRed = M.red;
  M.harvGreen = M.green;
  M.rimGrey = M.steel;
  M.container = M.metalWall;
  return M;
}

// ---------------------------------------------------------------------------
// Static geometry builder: collect transformed geometries per material.
class Builder {
  constructor(M) { this.M = M; this.parts = new Map(); this.colliders = []; }
  add(geo, mat, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
      new THREE.Vector3(sx, sy, sz),
    );
    g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return g;
  }
  box(w, h, d, mat, x, y, z, ry = 0, uvScale = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (uvScale) scaleBoxUV(g, w, h, d, uvScale);
    return this.add(g, mat, x, y, z, ry);
  }
  cyl(rt, rb, h, mat, x, y, z, seg = 16, rx = 0, rz = 0, ry = 0) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, ry, rx, rz);
  }
  collider(x0, x1, z0, z1, top, name, bottom) {
    const c = { x0, x1, z0, z1, top, name };
    if (bottom !== undefined) c.bottom = bottom;
    this.colliders.push(c);
    return c;
  }
  // Geometry already in world space (vehicle kits).
  addRaw(g, mat) {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
  }
  build(group) {
    for (const [mat, list] of this.parts) {
      const g = mergeGeometries(list);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
}

function scaleBoxUV(g, w, h, d, s) {
  // Box UVs in metres / s so tiled textures keep their scale.
  const uv = g.attributes.uv;
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, uv.getX(i) * faces[f][0] / s, uv.getY(i) * faces[f][1] / s);
  }
}

// Gable roof made of two sloped slabs.
function gableRoof(B, mat, cx, cy, cz, w, d, rise, ry = 0, over = 0.6) {
  const half = w / 2 + over;
  const slope = Math.atan2(rise, w / 2);
  const len = Math.hypot(half, rise);
  const cos = Math.cos(ry), sin = Math.sin(ry);
  for (const s of [-1, 1]) {
    const ox = s * (half / 2), oy = rise / 2;
    const g = new THREE.BoxGeometry(len, 0.12, d + over * 2);
    scaleBoxUV(g, len, 0.12, d + over * 2, 4);
    B.add(g, mat, cx + ox * cos, cy + oy, cz - ox * sin, ry, 0, -s * slope);
  }
}

// ---------------------------------------------------------------------------
export function createStructures(terrain, scene) {
  const M = makeMaterials();
  const group = new THREE.Group();
  group.name = 'structures';
  const B = new Builder(M);
  const dyn = { windsocks: [], gates: [] };
  const H = (x, z) => terrain.heightAt(x, z);

  dyn.hangar = buildHangar(B, M, group);
  buildService(B, M, group, H);
  buildHelipad(B, M, group, H);
  buildVehicles(B, M, H);
  buildStripMarks(B, M, group, H, RUNWAY);
  for (const site of FARM_SITES) buildFarmSite(B, M, group, H, site, dyn);
  buildHQ(B, M, group, H);
  buildFences(B, M, group, H, dyn);
  for (const w of BASE.windsocks) dyn.windsocks.push(buildWindsock(B, M, group, w.x, H(w.x, w.z), w.z));
  const wires = buildPowerLine(B, M, group, H);
  B.build(group);
  scene.add(group);

  return {
    group, M, colliders: B.colliders, wires,
    hangar: dyn.hangar,
    update(dt, time, wind, ctx) {
      for (const ws of dyn.windsocks) ws.update(dt, time, wind);
      if (ctx) dyn.hangar.update(dt, ctx);
    },
  };
}

function rodGeo(a, b, r = 0.06) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const g = new THREE.CylinderGeometry(r, r, va.distanceTo(vb), 6);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

function signTexture(lines, w = 1024, h = 256, bg = '#f4efe2', fg = '#1f2a1f') {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => {
    g.font = l.font;
    g.fillText(l.text, w / 2, h * ((i + 1) / (lines.length + 1)));
  });
  g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
  return canvasTexture(c);
}

function buildHangar(B, M, group) {
  const h = BASE.hangar;
  const x0 = h.x - h.w / 2, x1 = h.x + h.w / 2, z0 = h.z - h.d / 2, z1 = h.z + h.d / 2;
  // Floor slab (own material: darker the deeper inside, as the roof and
  // walls cut off the sky light).
  const shadeIn = (base, k) => {
    const m = base.clone();
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vHW;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb *= mix(1.0, ${k.toFixed(2)}, smoothstep(0.0, 7.0, ${z1.toFixed(2)} - vHW.z));`);
    };
    m.customProgramCacheKey = () => 'hangar-shade-' + k + base.uuid;
    return m;
  };
  M.hangarFloor = shadeIn(M.concrete, 0.4);
  M.hangarLining = shadeIn(M.metalWall, 0.45);
  B.box(h.w + 1, 0.25, h.d + 1, M.hangarFloor, h.x, 0.05, h.z, 0, 4);
  // Columns (open front faces +Z, the apron).
  for (const cx of [x0, h.x - h.w / 6, h.x + h.w / 6, x1]) {
    B.box(0.3, h.h, 0.3, M.steel, cx, h.h / 2, z1);
    B.box(0.3, h.h, 0.3, M.steel, cx, h.h / 2, z0);
  }
  B.box(h.w + 0.3, 0.5, 0.3, M.steel, h.x, h.h - 0.25, z1);
  // Walls: back and sides, corrugated.
  B.box(h.w, h.h, 0.1, M.metalWall, h.x, h.h / 2, z0, 0, 4);
  B.box(0.1, h.h, h.d, M.metalWall, x0, h.h / 2, h.z, 0, 4);
  B.box(0.1, h.h, h.d, M.metalWall, x1, h.h / 2, h.z, 0, 4);
  // Gable triangles (back) + roof
  const rise = 2.4;
  const tri = new THREE.Shape([new THREE.Vector2(-h.w / 2, 0), new THREE.Vector2(h.w / 2, 0), new THREE.Vector2(0, rise)]);
  const tg = new THREE.ShapeGeometry(tri);
  B.add(tg, M.metalWall, h.x, h.h, z0 + 0.05);
  B.add(tg, M.metalWall, h.x, h.h, z0 - 0.05, Math.PI);
  gableRoof(B, M.metalRoof, h.x, h.h, h.z, h.w, h.d, rise, Math.PI / 2 * 0 + 0, 0.8);
  // Sign over the opening.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6), new THREE.MeshStandardMaterial({
    map: signTexture([{ text: 'AGRO WINGS', font: 'bold 110px Arial' }, { text: 'AVIAÇÃO AGRÍCOLA', font: 'bold 54px Arial' }]), roughness: 0.7,
  }));
  sign.position.set(h.x, h.h + 1.0, z1 + 0.2);
  group.add(sign);
  // Workbench along the back wall + tools.
  const bz = z0 + 0.9;
  B.box(6, 0.08, 0.9, M.wood, h.x - 4, 0.95, bz);
  for (const lx of [-6.8, -1.2]) B.box(0.08, 0.95, 0.8, M.steel, h.x + lx, 0.47, bz);
  B.box(6, 1.6, 0.05, M.woodDark, h.x - 4, 1.9, z0 + 0.12); // pegboard
  const r = rng(12);
  for (let i = 0; i < 18; i++) B.box(0.05 + r() * 0.06, 0.2 + r() * 0.3, 0.03, r() < 0.5 ? M.steel : M.red, h.x - 6.7 + r() * 5.4, 1.4 + r() * 0.9, z0 + 0.17);
  B.box(0.5, 0.25, 0.35, M.red, h.x - 5.5, 1.12, bz); // toolbox
  B.box(0.35, 0.3, 0.3, M.blue, h.x - 3.0, 1.14, bz); // vice-ish block
  B.box(1.0, 1.8, 0.6, M.red, h.x + 0.8, 0.9, z0 + 0.45); // tool cabinet
  // Drums (tambores)
  for (let i = 0; i < 6; i++) {
    const m = i % 3 === 0 ? M.yellow : i % 3 === 1 ? M.blue : M.green;
    B.cyl(0.29, 0.29, 0.88, m, x1 - 1.2 - (i % 3) * 0.62, 0.44, z0 + 1.0 + Math.floor(i / 3) * 0.62, 14);
  }
  // Compressor, spare wheel, spare prop on the wall, engine stand.
  B.box(1.1, 0.7, 0.5, M.red, x1 - 1.0, 0.45, h.z + 2);
  B.cyl(0.25, 0.25, 1.2, M.red, x1 - 1.0, 1.0, h.z + 2, 12, 0, Math.PI / 2);
  B.add(new THREE.TorusGeometry(0.3, 0.11, 8, 16), M.rubber, x1 - 0.5, 0.42, h.z - 2, Math.PI / 2);
  B.box(0.14, 2.3, 0.04, M.black, x0 + 0.15, 2.6, h.z, Math.PI / 2, 0, 0.1);
  B.box(0.7, 0.9, 0.7, M.blue, h.x + 6.5, 0.45, z0 + 2.0);
  B.box(0.6, 0.55, 0.6, M.black, h.x + 6.5, 1.15, z0 + 2.0);
  // --- Realism 4.0: working hangar ---------------------------------------
  // Steel portal frames and purlins under the roof (visible from inside).
  for (const fz of [z0 + 0.2, h.z - h.d / 6, h.z + h.d / 6, z1 - 0.2]) {
    for (const s of [-1, 1]) {
      const a = [h.x + s * h.w / 2, h.h, fz], b = [h.x, h.h + rise - 0.25, fz];
      B.add(rodGeo(a, b, 0.11), M.steel);
    }
    B.box(h.w, 0.16, 0.16, M.steel, h.x, h.h - 0.05, fz);
  }
  for (let i = -3; i <= 3; i++) {
    const px = h.x + i * (h.w / 7), py = h.h + rise * (1 - Math.abs(i) / 3.5) - 0.2;
    B.box(0.1, 0.14, h.d, M.steel, px, py, h.z);
  }
  // Inner lining of the walls and roof (shaded like the floor).
  B.box(h.w - 0.2, h.h, 0.02, M.hangarLining, h.x, h.h / 2, z0 + 0.08, 0, 4);
  B.box(0.02, h.h, h.d, M.hangarLining, x0 + 0.08, h.h / 2, h.z, 0, 4);
  B.box(0.02, h.h, h.d, M.hangarLining, x1 - 0.08, h.h / 2, h.z, 0, 4);
  {
    const half = h.w / 2, slope = Math.atan2(rise, half), len = Math.hypot(half, rise);
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(len, 0.02, h.d);
      scaleBoxUV(g, len, 0.02, h.d, 4);
      B.add(g, M.hangarLining, h.x + s * half / 2, h.h + rise / 2 - 0.1, h.z, 0, 0, -s * slope);
    }
  }
  // Concrete floor markings: yellow safety lines, parking T, oil stain.
  B.box(h.w - 1.2, 0.012, 0.1, M.yellow, h.x, 0.19, z0 + 2.9);
  B.box(0.1, 0.012, h.d - 4, M.yellow, x1 - 2.6, 0.19, h.z + 1.4);
  B.box(0.16, 0.012, 9, M.yellow, h.x - 1, 0.19, h.z + 2.5);
  B.box(4, 0.012, 0.16, M.yellow, h.x - 1, 0.19, h.z - 2);
  // Parts and equipment: rolling tool chest, wing trestles, spare hopper,
  // parts pallet, tow bar, step ladder, oil drums on a spill tray.
  B.box(0.9, 1.05, 0.55, M.red, x0 + 1.4, 0.68, z0 + 4.2);
  for (let i = 0; i < 5; i++) B.box(0.92, 0.02, 0.56, M.steel, x0 + 1.4, 0.35 + i * 0.2, z0 + 4.2);
  for (const tz of [h.z + 1, h.z + 4]) {
    B.box(0.12, 1.2, 0.12, M.yellow, x0 + 3.0, 0.75, tz); B.box(0.12, 1.2, 0.12, M.yellow, x0 + 4.4, 0.75, tz);
    B.box(1.6, 0.12, 0.5, M.yellow, x0 + 3.7, 1.36, tz); B.box(1.8, 0.08, 0.6, M.black, x0 + 3.7, 1.46, tz);
  }
  B.cyl(0.85, 0.85, 1.5, M.dirtyWhite, x0 + 2.2, 0.95, z0 + 7.2, 18);
  B.box(1.2, 0.14, 1.0, M.wood, h.x + 3.5, 0.26, z0 + 1.2);
  for (let i = 0; i < 4; i++) B.box(0.4 + (i % 2) * 0.2, 0.3, 0.35, i % 2 ? M.blue : M.steel, h.x + 3.2 + (i % 2) * 0.55, 0.48 + Math.floor(i / 2) * 0.3, z0 + 1.0 + (i % 2) * 0.3);
  B.add(rodGeo([x1 - 4.5, 0.25, h.z + 6.5], [x1 - 7.0, 0.25, h.z + 5.6], 0.05), M.yellow);
  for (const s of [-1, 1]) B.add(rodGeo([x1 - 3.6 + s * 0.35, 0.2, h.z - 5], [x1 - 3.6 + s * 0.2, 2.4, h.z - 5.4], 0.04), M.alu);
  for (let i = 0; i < 6; i++) B.box(0.45, 0.04, 0.12, M.alu, x1 - 3.6, 0.5 + i * 0.36, h.z - 5.1 - i * 0.06);
  B.box(2.0, 0.1, 1.4, M.yellow, x1 - 1.6, 0.24, h.z + 5.6);
  for (let i = 0; i < 4; i++) B.cyl(0.29, 0.29, 0.88, i % 2 ? M.black : M.blue, x1 - 2.2 + (i % 2) * 0.62, 0.72, h.z + 5.3 + Math.floor(i / 2) * 0.62, 14);
  // Lamps: high-bay fittings that glow; light pools on the floor (no real lights).
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xf4f1e6, emissive: 0xfff4dc, emissiveIntensity: 0.4, roughness: 0.5 });
  const poolTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,240,210,1)'); gr.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false });
  const lampGeo = [], poolGeo = [];
  for (const lz of [h.z - 4, h.z + 3]) for (const lx of [-7, 0, 7]) {
    lampGeo.push(new THREE.CylinderGeometry(0.32, 0.42, 0.22, 14).translate(h.x + lx, h.h - 0.35, lz));
    poolGeo.push(new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2).translate(h.x + lx, 0.2, lz));
    B.add(rodGeo([h.x + lx, h.h - 0.25, lz], [h.x + lx, h.h + 0.4, lz], 0.015), M.steel);
  }
  const lamps = new THREE.Mesh(mergeGeometries(lampGeo), lampMat);
  const pools = new THREE.Mesh(mergeGeometries(poolGeo), poolMat);
  pools.renderOrder = 3;
  group.add(lamps, pools);
  // Sliding doors: four corrugated leaves on two top tracks; each pair parks
  // outside its side wall. Open by day, closed at dusk unless an aircraft
  // is near; while closed they are a collider.
  const leafW = h.w / 4 + 0.15, leafH = h.h - 0.65;
  const leafGeo = new THREE.BoxGeometry(leafW, leafH, 0.1);
  scaleBoxUV(leafGeo, leafW, leafH, 0.1, 4);
  // One instanced mesh for the four leaves (one draw).
  const doorIM = new THREE.InstancedMesh(leafGeo, M.metalWall, 4);
  doorIM.castShadow = true; doorIM.receiveShadow = true;
  group.add(doorIM);
  const leaves = [];
  for (const side of [-1, 1]) {
    for (const k of [0, 1]) {
      const closed = h.x + side * (h.w / 2 - leafW / 2 - k * (leafW - 0.15));
      const open = h.x + side * (h.w / 2 + leafW / 2 + 0.3);
      const track = z1 + 0.28 + k * 0.16;
      leaves.push({ closed, open, y: leafH / 2 + 0.12, z: track, delay: k * 0.35, x: NaN });
    }
  }
  const _lm = new THREE.Matrix4();
  for (const k of [0, 1]) B.box(h.w * 1.5 + 1, 0.12, 0.1, M.steel, h.x, h.h - 0.45, z1 + 0.28 + k * 0.16); // top tracks
  B.box(0.2, h.h - 0.3, 0.2, M.steel, x0 - leafW - 0.5, (h.h - 0.3) / 2, z1 + 0.35);
  B.box(0.2, h.h - 0.3, 0.2, M.steel, x1 + leafW + 0.5, (h.h - 0.3) / 2, z1 + 0.35);
  // Colliders: walls, roof (from its eaves up), interior clutter, doors.
  B.collider(x0 - 0.5, x1 + 0.5, z0 - 0.5, z0 + 3.2, h.h + rise, 'hangar wall'); // back wall + bench + drums
  B.collider(x0 - 0.5, x0 + 0.5, z0 - 0.5, z1 + 0.2, h.h + rise, 'hangar wall');
  B.collider(x1 - 0.5, x1 + 0.5, z0 - 0.5, z1 + 0.2, h.h + rise, 'hangar wall');
  B.collider(x0 + 0.5, x0 + 5.2, z0, z1 - 4, 2.2, 'hangar equipment'); // tool chest, trestles, spare hopper
  B.collider(x1 - 4.0, x1 - 0.5, h.z - 6, z1 - 1.5, 2.6, 'hangar equipment'); // compressor, ladder, drums
  B.collider(x0 - 0.5, x1 + 0.5, z0 - 0.5, z1 + 0.6, h.h + rise + 0.2, 'hangar roof', h.h - 0.6);
  const doorCol = B.collider(x0 - 0.5, x1 + 0.5, z1 + 0.1, z1 + 0.6, h.h, 'hangar door');
  const state = { open: 1, target: 1 };
  leaves.forEach((l, i) => { l.x = l.open; doorIM.setMatrixAt(i, _lm.makeTranslation(l.open, l.y, l.z)); });
  doorIM.instanceMatrix.needsUpdate = true;
  doorIM.computeBoundingSphere();
  return {
    leaves,
    get open() { return state.open; },
    update(dt, ctx) {
      const near = ctx.acPos && Math.hypot(ctx.acPos.x - h.x, ctx.acPos.z - z1) < 70;
      state.target = (ctx.light ?? 1) > 0.55 || near ? 1 : 0;
      state.open += Math.sign(state.target - state.open) * Math.min(Math.abs(state.target - state.open), dt / 12);
      let moved = false;
      leaves.forEach((l, i) => {
        const f = Math.min(1, Math.max(0, (state.open - l.delay * (1 - state.target)) / (1 - l.delay * 0.5)));
        const x = l.closed + (l.open - l.closed) * f;
        if (x !== l.x) { l.x = x; doorIM.setMatrixAt(i, _lm.makeTranslation(x, l.y, l.z)); moved = true; }
      });
      if (moved) { doorIM.instanceMatrix.needsUpdate = true; doorIM.computeBoundingSphere(); }
      // Lamps and light pools only matter up close.
      const far = ctx.cam ? Math.hypot(ctx.cam.x - h.x, ctx.cam.z - h.z) > 320 : false;
      lamps.visible = pools.visible = !far;
      doorCol.top = state.open > 0.92 ? -1e9 : h.h;
      const dark = 1 - Math.min(1, Math.max(0, ((ctx.light ?? 1) - 0.4) / 0.6));
      lampMat.emissiveIntensity = 0.35 + 2.2 * dark;
      poolMat.opacity = 0.05 + 0.3 * dark;
    },
  };
}

function buildService(B, M, group, H) {
  const ft = BASE.fuelTank;
  const g0 = 0;
  // Containment slab + curb
  B.box(8, 0.2, 4.4, M.concrete, ft.x, g0 + 0.05, ft.z, 0, 4);
  // Horizontal ethanol tank on saddles
  B.cyl(1.0, 1.0, 5.2, M.white, ft.x, 1.55, ft.z, 24, 0, Math.PI / 2);
  for (const dx of [-1.8, 1.8]) B.box(0.3, 0.9, 1.6, M.steel, ft.x + dx, 0.55, ft.z);
  B.cyl(1.01, 1.01, 0.4, M.red, ft.x, 1.55, ft.z, 24, 0, Math.PI / 2);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshStandardMaterial({ map: makeLabel('ETANOL', { w: 512, h: 128, bg: '#f2f0ea', fg: '#a8231b', font: 'bold 92px Arial' }), roughness: 0.5 }));
  label.position.set(ft.x - 1.2, 1.7, ft.z + 1.03);
  group.add(label);
  // Pump cabinet with hose reel facing the pad.
  B.box(0.8, 1.4, 0.6, M.red, ft.x + 3.3, 0.8, ft.z + 1.4);
  B.add(new THREE.TorusGeometry(0.38, 0.09, 8, 18), M.hoseBlack, ft.x + 3.3, 1.0, ft.z + 1.75);
  // Mixing station: cone-bottom tank on a frame + pump + reel.
  const mt = BASE.mixTank;
  B.box(3.2, 0.2, 3.2, M.concrete, mt.x, 0.05, mt.z, 0, 4);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(0.12, 2.0, 0.12, M.steel, mt.x + dx * 0.9, 1.0, mt.z + dz * 0.9);
  B.cyl(1.05, 1.05, 1.6, M.dirtyWhite, mt.x, 2.7, mt.z, 20);
  B.add(new THREE.ConeGeometry(1.05, 0.9, 20).rotateX(Math.PI), M.dirtyWhite, mt.x, 1.45, mt.z);
  B.cyl(1.07, 1.07, 0.12, M.green, mt.x, 3.45, mt.z, 20);
  B.box(0.6, 0.5, 0.5, M.green, mt.x + 1.6, 0.4, mt.z + 0.8);
  B.add(new THREE.TorusGeometry(0.38, 0.09, 8, 18), M.blueDark, mt.x + 1.6, 1.0, mt.z + 1.2);
  const mixLabel = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.45), new THREE.MeshStandardMaterial({ map: makeLabel('MIX', { w: 256, h: 96, bg: '#2f6b2c', fg: '#ffffff', font: 'bold 64px Arial' }), roughness: 0.6 }));
  mixLabel.position.set(mt.x, 2.7, mt.z + 1.07);
  group.add(mixLabel);
  // Elevated blue water reservoirs (as in the reference video).
  for (const rv of BASE.reservoirs) {
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      B.box(0.12, 3.2, 0.12, M.steel, rv.x + dx * 0.95, 1.6, rv.z + dz * 0.95);
    }
    for (const yy of [1.0, 2.2]) {
      B.box(2.0, 0.07, 0.07, M.steel, rv.x, yy, rv.z - 0.95); B.box(2.0, 0.07, 0.07, M.steel, rv.x, yy, rv.z + 0.95);
      B.box(0.07, 0.07, 2.0, M.steel, rv.x - 0.95, yy, rv.z); B.box(0.07, 0.07, 2.0, M.steel, rv.x + 0.95, yy, rv.z);
    }
    B.cyl(1.25, 1.25, 2.6, M.blue, rv.x, 4.55, rv.z, 24);
    B.cyl(1.28, 1.28, 0.2, M.blueDark, rv.x, 5.95, rv.z, 24);
    B.cyl(0.05, 0.05, 3.4, M.steel, rv.x + 1.0, 1.7, rv.z + 1.0, 6);
    B.collider(rv.x - 1.3, rv.x + 1.3, rv.z - 1.3, rv.z + 1.3, 6.1, 'reservoir');
  }
  // Pipe from reservoirs to the mixing tank.
  const r0 = BASE.reservoirs[0];
  B.add(rodGeo([r0.x + 1, 0.25, r0.z + 5], [mt.x - 1, 0.25, mt.z]), M.steel);
  // Crew post: shade roof, bench, water cooler, PPE rack.
  const cp = BASE.crewPost;
  for (const [dx, dz] of [[-1.8, -1.2], [1.8, -1.2], [-1.8, 1.2], [1.8, 1.2]]) B.box(0.1, 2.4, 0.1, M.wood, cp.x + dx, 1.2, cp.z + dz);
  B.box(4.2, 0.08, 3.0, M.metalRoof, cp.x, 2.45, cp.z, 0, 3);
  B.box(1.8, 0.06, 0.4, M.wood, cp.x, 0.45, cp.z - 0.7);
  B.box(0.06, 0.45, 0.35, M.wood, cp.x - 0.8, 0.22, cp.z - 0.7); B.box(0.06, 0.45, 0.35, M.wood, cp.x + 0.8, 0.22, cp.z - 0.7);
  B.box(0.4, 0.8, 0.4, M.white, cp.x + 1.3, 0.4, cp.z - 0.8);
  B.cyl(0.15, 0.15, 0.42, M.blue, cp.x + 1.3, 1.0, cp.z - 0.8, 12);
  B.box(1.2, 0.05, 0.05, M.steel, cp.x - 0.9, 1.7, cp.z + 1.1);
  // Drums by the mix station.
  for (let i = 0; i < 5; i++) B.cyl(0.29, 0.29, 0.88, i % 2 ? M.blue : M.white, mt.x + 3 + (i % 3) * 0.62, 0.44, mt.z - 1.4 + Math.floor(i / 3) * 0.62, 14);
  // Parking marks on the pad: painted circle + T line (concrete pad).
  // Service spot marked like a farm strip: white tyres at the corners and a
  // painted stop board, aircraft parks on the compacted red earth.
  const pad = BASE.pad;
  const tyre = new THREE.TorusGeometry(0.42, 0.16, 10, 22);
  for (const [dx, dz] of [[-7, -6], [7, -6], [-7, 6], [7, 6]]) B.add(tyre, M.white, pad.x + dx, 0.12, pad.z + dz, 0, Math.PI / 2);
  B.box(0.1, 1.2, 0.1, M.wood, pad.x + 9, 0.6, pad.z);
  B.box(0.06, 0.6, 1.2, M.yellow, pad.x + 9, 1.3, pad.z);
  B.collider(ft.x - 3.2, ft.x + 3.6, ft.z - 1.2, ft.z + 1.8, 2.6, 'fuel tank');
  B.collider(mt.x - 1.2, mt.x + 2.0, mt.z - 1.2, mt.z + 1.4, 3.6, 'mix tank');
}

// Helicopter pad: square of compacted gravel with a painted H and a
// touchdown circle, white-edged; low edge markers at the corners.
function buildHelipad(B, M, group, H) {
  const hp = BASE.helipad;
  const S = 15, px = 1024;
  const c = canvas(px, px);
  const g = c.getContext('2d');
  g.fillStyle = '#9b958a';
  g.fillRect(0, 0, px, px);
  const r = rng(29);
  for (let i = 0; i < 26000; i++) {
    const v = 90 + Math.floor(r() * 120);
    g.fillStyle = `rgba(${v},${v - 4},${v - 12},${0.25 + r() * 0.4})`;
    const s = 1 + r() * 3.5;
    g.fillRect(r() * px, r() * px, s, s * (0.6 + r() * 0.6));
  }
  // Red-earth wash at the edges, tyre/skid scuffs.
  const edge = g.createRadialGradient(px / 2, px / 2, px * 0.38, px / 2, px / 2, px * 0.75);
  edge.addColorStop(0, 'rgba(140,70,40,0)');
  edge.addColorStop(1, 'rgba(140,70,40,0.35)');
  g.fillStyle = edge; g.fillRect(0, 0, px, px);
  const k = px / S;
  g.fillStyle = 'rgba(236,233,224,0.88)';
  // H (letter 6 m tall), bars 0.9 m wide.
  const hw = 3.6 * k, hh = 6 * k, bw = 0.9 * k;
  g.fillRect(px / 2 - hw / 2, px / 2 - hh / 2, bw, hh);
  g.fillRect(px / 2 + hw / 2 - bw, px / 2 - hh / 2, bw, hh);
  g.fillRect(px / 2 - hw / 2, px / 2 - bw / 2, hw, bw);
  // Touchdown circle and edge line.
  g.strokeStyle = 'rgba(236,233,224,0.7)'; g.lineWidth = 0.35 * k;
  g.beginPath(); g.arc(px / 2, px / 2, 5.2 * k, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 0.25 * k;
  g.strokeRect(0.4 * k, 0.4 * k, px - 0.8 * k, px - 0.8 * k);
  // Worn paint and skid marks.
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(120,112,100,${0.2 + r() * 0.4})`;
    g.fillRect(r() * px, r() * px, 1 + r() * 4, 1 + r() * 2);
  }
  g.strokeStyle = 'rgba(40,36,32,0.18)'; g.lineWidth = 0.08 * k;
  for (const sx of [-1.09, 1.09]) { g.beginPath(); g.moveTo(px / 2 + sx * k - 1.4 * k, px / 2 - sx * 0.1 * k); g.lineTo(px / 2 + sx * k + 1.4 * k, px / 2 + sx * 0.05 * k); g.stroke(); }
  const mat = new THREE.MeshStandardMaterial({ map: canvasTexture(c, { aniso: 8 }), roughness: 0.96 });
  const y = H(hp.x, hp.z);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(S, 0.05, S), mat);
  // Rotated so the H reads along the approach (east-west).
  slab.position.set(hp.x, y - 0.012, hp.z);
  slab.rotation.y = hp.heading;
  slab.receiveShadow = true;
  group.add(slab);
  // Corner markers (low white-painted tyres) and a small red/white post.
  const tyre = new THREE.TorusGeometry(0.36, 0.13, 10, 20);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.add(tyre, M.white, hp.x + dx * (S / 2 + 3), y + 0.1, hp.z + dz * (S / 2 + 3), 0, Math.PI / 2);
}

function buildVehicles(B, M, H) {
  // Support pickup (white double cab) with a chemical tank in the bed.
  const pk = BASE.pickup;
  pickup(B, M, pk.x, 0, pk.z, pk.heading);
  B.collider(pk.x - 2.6, pk.x + 2.6, pk.z - 2.6, pk.z + 2.6, 2.1, 'pickup');
  // The tanker truck (caminhão de apoio) is the driving service truck now
  // (crew/truck.js), no longer part of the static geometry.
  // Chemical stock behind the mixing station: IBC totes and drum pallets.
  const mt = BASE.mixTank;
  ibc(B, M, mt.x - 3.2, 0, mt.z - 16.5, 0.05);
  ibc(B, M, mt.x - 1.9, 0, mt.z - 16.6, -0.04);
  ibc(B, M, mt.x - 3.2, 0, mt.z - 17.8, 0.02);
  ibc(B, M, mt.x - 3.15, 1.33, mt.z - 16.5, 0.0);
  drumPallet(B, M, mt.x - 6.0, 0, mt.z - 16.8, 0.1, [M.blue, M.blue, M.white, M.blue]);
  drumPallet(B, M, mt.x - 7.4, 0, mt.z - 16.7, -0.05, [M.green, M.white, M.green, M.green]);
  B.collider(mt.x - 8.2, mt.x - 1.2, mt.z - 18.5, mt.z - 15.8, 2.7, 'chemical store');
  // Operations office (converted container) east of the hangar.
  const h = BASE.hangar;
  officeContainer(B, M, h.x + h.w / 2 + 9, 0, h.z + 4, 0);
  B.collider(h.x + h.w / 2 + 7.6, h.x + h.w / 2 + 10.4, h.z + 0.8, h.z + 7.2, 3.0, 'office');
  // Fire extinguisher stand at the fuel slab.
  const ft = BASE.fuelTank;
  B.box(0.08, 1.4, 0.08, M.steel, ft.x - 4.6, 0.7, ft.z + 1.6);
  B.box(0.5, 0.6, 0.05, M.red, ft.x - 4.6, 1.15, ft.z + 1.66);
  B.cyl(0.11, 0.11, 0.62, M.red, ft.x - 4.6, 0.62, ft.z + 1.82, 14);
}

function buildStripMarks(B, M, group, H, R) {
  // Half-buried white tyres along the edges, rows across each threshold.
  const tyre = new THREE.TorusGeometry(0.42, 0.16, 10, 22);
  const z = R.z, hw = R.width / 2;
  const step = R === RUNWAY ? 50 : 40;
  for (let x = R.x0; x <= R.x1 + 0.1; x += step) {
    for (const s of [-1, 1]) B.add(tyre, M.white, x, H(x, z + s * (hw + 1.2)) + 0.1, z + s * (hw + 1.2));
  }
  for (const tx of [R.x0 + 3, R.x1 - 3]) {
    const n = Math.floor(hw / 2.6);
    for (let k = -n; k <= n; k++) if (Math.abs(k) > 1) B.add(tyre, M.white, tx, H(tx, z + k * 2.6) + 0.1, z + k * 2.6, Math.PI / 2);
  }
  // Threshold boards "09" (west end) and "27" (east end).
  for (const [x, txt] of [[R.x0 - 6, '09'], [R.x1 + 6, '27']]) {
    const y = H(x, z + hw + 6);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshStandardMaterial({ map: makeLabel(txt, { w: 256, h: 170, font: 'bold 120px Arial' }), roughness: 0.6, side: THREE.DoubleSide }));
    board.position.set(x, y + 1.6, z + hw + 6);
    board.rotation.y = Math.PI / 2;
    group.add(board);
    B.box(0.1, 1.0, 0.1, M.wood, x, y + 0.5, z + hw + 5.2);
    B.box(0.1, 1.0, 0.1, M.wood, x, y + 0.5, z + hw + 6.8);
  }
}

// A secondary farm's strip and service area: the base's service equipment
// (tanks, crew post, pad marks, helipad) rebuilt in the base's own layout and
// moved to the site, an open machinery shed where the base has its hangar, a
// farm sign, a pickup, windsocks and the strip markings.
function buildFarmSite(B, M, group, H, site, dyn) {
  const B2 = new Builder(M);
  const g2 = new THREE.Group();
  g2.name = 'site-' + site.id;
  const flat = () => 0;
  buildService(B2, M, g2, flat);
  buildHelipad(B2, M, g2, flat);
  const pk = BASE.pickup;
  pickup(B2, M, pk.x, 0, pk.z, pk.heading + 0.3);
  B2.collider(pk.x - 2.6, pk.x + 2.6, pk.z - 2.6, pk.z + 2.6, 2.1, 'pickup');
  // Open machinery shed (galpão): steel columns, gable roof, earth floor.
  const h = BASE.hangar, w = 20, d = 14, hh = 6;
  for (const cx of [-w / 2, -w / 6, w / 6, w / 2]) for (const cz of [-d / 2, d / 2]) B2.box(0.25, hh, 0.25, M.steel, h.x + cx, hh / 2, h.z + cz);
  B2.box(w, 0.35, 0.25, M.steel, h.x, hh - 0.18, h.z + d / 2);
  B2.box(w, 0.35, 0.25, M.steel, h.x, hh - 0.18, h.z - d / 2);
  B2.box(w, hh * 0.55, 0.1, M.metalWall, h.x, hh * 0.275, h.z - d / 2, 0, 4);
  gableRoof(B2, M.metalRoof, h.x, hh, h.z, d, w, 1.8, Math.PI / 2, 0.8);
  B2.collider(h.x - w / 2 - 0.5, h.x + w / 2 + 0.5, h.z - d / 2 - 0.5, h.z + d / 2 + 0.5, hh + 1.9, 'shed');
  // Drum pallets and IBC stock under the shed.
  drumPallet(B2, M, h.x - 6, 0, h.z - 3, 0.1, [M.blue, M.white, M.blue, M.blue]);
  ibc(B2, M, h.x - 2.5, 0, h.z - 4, 0);
  ibc(B2, M, h.x - 1.2, 0, h.z - 4, 0.05);
  // Farm sign by the apron.
  const f = site.farm;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.3), new THREE.MeshStandardMaterial({
    map: makeLabel(f.name.toUpperCase(), { w: 1024, h: 320, bg: '#f2ead8', fg: '#2c4a22', font: 'bold 92px Arial' }), roughness: 0.6, side: THREE.DoubleSide,
  }));
  const ax = BASE.apron.x0 + 6, az = BASE.apron.z1 + 4;
  sign.position.set(ax, 2.4, az);
  g2.add(sign);
  B2.box(0.12, 2.0, 0.12, M.wood, ax - 1.9, 1.0, az - 0.05);
  B2.box(0.12, 2.0, 0.12, M.wood, ax + 1.9, 1.0, az - 0.05);
  B2.build(g2);
  g2.position.set(site.dx, site.y0, site.dz);
  group.add(g2);
  for (const c of B2.colliders) {
    B.colliders.push({ ...c, x0: c.x0 + site.dx, x1: c.x1 + site.dx, z0: c.z0 + site.dz, z1: c.z1 + site.dz, top: c.top + site.y0, ...(c.bottom !== undefined ? { bottom: c.bottom + site.y0 } : {}) });
  }
  buildStripMarks(B, M, group, H, site.runway);
  for (const w of site.windsocks) dyn.windsocks.push(buildWindsock(B, M, group, w.x, H(w.x, w.z), w.z));
}

function buildHQ(B, M, group, H) {
  const h = HQ.house;
  const y = H(h.x, h.z);
  // House body with veranda
  B.box(18, 3.2, 10, M.wall, h.x, y + 1.6, h.z, 0, 3);
  B.box(18.4, 0.3, 10.4, M.concrete, h.x, y + 0.1, h.z);
  B.box(18.4, 0.15, 3.2, M.concrete, h.x, y + 0.1, h.z + 6.5);
  for (let i = 0; i < 6; i++) B.box(0.22, 2.9, 0.22, M.wall, h.x - 8.5 + i * 3.4, y + 1.6, h.z + 7.8);
  // Hip-ish roof: gable + overhang covering the veranda
  gableRoof(B, M.roofTile, h.x, y + 3.2, h.z + 1.5, 13.5, 18.5, 2.6, Math.PI / 2, 0.8);
  // Windows/doors
  for (let i = 0; i < 4; i++) B.box(1.4, 1.2, 0.08, M.blueDark, h.x - 6 + i * 4, y + 1.8, h.z + 5.02);
  B.box(1.1, 2.2, 0.08, M.woodDark, h.x + 1, y + 1.2, h.z + 5.03);
  B.collider(h.x - 9.5, h.x + 9.5, h.z - 5.5, h.z + 8.2, y + 6, 'house');
  // Farm name board at the gate.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.4), new THREE.MeshStandardMaterial({ map: signTexture([{ text: 'FAZENDA BOA ESPERANÇA', font: 'bold 84px Georgia' }, { text: 'Mato Grosso', font: 'italic 54px Georgia' }], 1024, 256, '#6b4a2c', '#f6eedc'), roughness: 0.8, side: THREE.DoubleSide }));
  sign.position.set(-1150, H(-1150, -150) + 4.2, -150);
  sign.rotation.y = Math.PI / 2;
  group.add(sign);
  B.box(0.25, 4.6, 0.25, M.woodDark, -1150, H(-1150, -153.5) + 2.3, -153.5);
  B.box(0.25, 4.6, 0.25, M.woodDark, -1150, H(-1150, -146.5) + 2.3, -146.5);
  // Machinery sheds
  for (const s of HQ.sheds) {
    const sy = H(s.x, s.z);
    for (let i = 0; i <= 4; i++) for (const dz of [-s.d / 2, s.d / 2]) B.box(0.35, 7, 0.35, M.steel, s.x - s.w / 2 + (i * s.w) / 4, sy + 3.5, s.z + dz);
    gableRoof(B, M.metalRoof, s.x, sy + 7, s.z, s.d, s.w, 2.2, Math.PI / 2, 0.8);
    B.box(s.w, 7, 0.1, M.metalWall, s.x, sy + 3.5, s.z - s.d / 2, 0, 4);
    B.box(s.w, 0.2, s.d, M.concrete, s.x, sy + 0.1, s.z, 0, 4);
    B.collider(s.x - s.w / 2 - 1, s.x + s.w / 2 + 1, s.z - s.d / 2 - 1, s.z + s.d / 2 + 1, sy + 9.5, 'shed');
  }
  // Machines under the first shed: tractor + self-propelled sprayer + harvester.
  const s0 = HQ.sheds[0], sy0 = H(s0.x, s0.z);
  tractor(B, M, s0.x - 14, sy0, s0.z + 2, 0);
  harvester(B, M, s0.x + 6, sy0, s0.z + 1, 0);
  const s1 = HQ.sheds[1], sy1 = H(s1.x, s1.z);
  sprayer(B, M, s1.x - 6, sy1, s1.z + 1.5, 0);
  tractor(B, M, s1.x + 7, sy1, s1.z + 2.5, 0.15);
  // Silos + dryer + elevator
  for (const si of HQ.silos) {
    const yy = H(si.x, si.z);
    B.cyl(5.5, 5.5, 14, M.galv, si.x, yy + 7, si.z, 32);
    B.add(new THREE.ConeGeometry(5.7, 3.2, 32), M.galv, si.x, yy + 15.6, si.z);
    B.collider(si.x - 5.8, si.x + 5.8, si.z - 5.8, si.z + 5.8, yy + 18, 'silo');
  }
  const d = HQ.dryer, dy = H(d.x, d.z);
  B.box(4, 22, 4, M.galv, d.x, dy + 11, d.z, 0, 4);
  B.box(1, 30, 1, M.steel, d.x + 4, dy + 15, d.z, 0);
  for (const si of HQ.silos) {
    const len = Math.hypot(si.x - d.x - 4, si.z - d.z);
    B.add(new THREE.BoxGeometry(0.6, 0.6, len), M.steel, (si.x + d.x + 4) / 2, dy + 22, (si.z + d.z) / 2, Math.atan2(si.x - d.x - 4, si.z - d.z), -0.12);
  }
  B.collider(d.x - 2.5, d.x + 5, d.z - 2.5, d.z + 2.5, dy + 30, 'dryer');
  // Corral
  const c = HQ.corral, cy = H(c.x, c.z);
  for (let i = 0; i <= 10; i++) for (const [ox, oz, ry] of [[-15 + i * 3, -12, 0], [-15 + i * 3, 12, 0]]) B.box(0.15, 1.6, 0.15, M.wood, c.x + ox, cy + 0.8, c.z + oz, ry);
  for (const zz of [-12, 12]) for (const yy of [0.6, 1.1, 1.5]) B.box(30, 0.12, 0.06, M.wood, c.x, cy + yy, c.z + zz);
  for (const xx of [-15, 15]) for (const yy of [0.6, 1.1, 1.5]) B.box(0.06, 0.12, 24, M.wood, c.x + xx, cy + yy, c.z);
}

function buildFences(B, M, group, H, dyn) {
  const wirePts = [];
  for (const f of FENCES) {
    const [a, b] = f.pts;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const gateS = f.gateAt != null ? f.gateAt * len : -1e9, gateW = 5;
    const dirx = (b[0] - a[0]) / len, dirz = (b[1] - a[1]) / len;
    const ry = Math.atan2(dirx, dirz);
    let prev = null;
    for (let s = 0; s <= len; s += 4) {
      if (s > gateS - gateW / 2 && s < gateS + gateW / 2) { prev = null; continue; }
      const x = a[0] + dirx * s, z = a[1] + dirz * s, y = H(x, z);
      B.box(0.12, 1.5, 0.12, M.woodDark, x, y + 0.6, z);
      if (prev) for (const hh of [0.45, 0.8, 1.1]) wirePts.push(prev[0], prev[1] + hh, prev[2], x, y + hh, z);
      prev = [x, y, z];
    }
    if (f.gateAt == null) continue;
    // Porteira: wooden gate, slightly open.
    const gx = a[0] + dirx * (gateS - gateW / 2), gz = a[1] + dirz * (gateS - gateW / 2), gy = H(gx, gz);
    B.box(0.2, 1.9, 0.2, M.woodDark, gx, gy + 0.9, gz);
    const ex = a[0] + dirx * (gateS + gateW / 2), ez = a[1] + dirz * (gateS + gateW / 2);
    B.box(0.2, 1.9, 0.2, M.woodDark, ex, H(ex, ez) + 0.9, ez);
    const open = 0.5;
    const gr = ry + Math.PI / 2 - Math.PI / 2 + open;
    const cxg = gx + Math.sin(gr) * 2.2, czg = gz + Math.cos(gr) * 2.2;
    for (const hh of [0.4, 0.8, 1.2]) B.add(new THREE.BoxGeometry(0.06, 0.12, 4.4), M.wood, cxg, gy + hh, czg, gr);
    B.add(new THREE.BoxGeometry(0.06, 0.12, 4.8), M.wood, cxg, gy + 0.8, czg, gr, 0.17 * 0, 0);
    B.add(new THREE.BoxGeometry(0.06, 1.0, 0.12), M.wood, gx + Math.sin(gr) * 4.3, gy + 0.8, gz + Math.cos(gr) * 4.3, gr);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
  group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x55585a, transparent: true, opacity: 0.8 })));
}

function buildWindsock(B, M, group, x, y, z) {
  B.cyl(0.07, 0.09, 6.5, M.white, x, y + 3.25, z, 8);
  const pivot = new THREE.Group();
  pivot.position.set(x, y + 6.3, z);
  group.add(pivot);
  const segs = [];
  const mats = [M.orange, M.white];
  let parent = pivot;
  for (let i = 0; i < 5; i++) {
    const r0 = 0.42 - i * 0.055, r1 = r0 - 0.055;
    const g = new THREE.CylinderGeometry(r1, r0, 0.7, 14, 1, true);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, -0.35);
    const m = new THREE.Mesh(g, mats[i % 2].clone());
    m.material.side = THREE.DoubleSide;
    m.castShadow = true;
    const holder = new THREE.Group();
    holder.position.z = i === 0 ? 0 : -0.7;
    holder.add(m);
    parent.add(holder);
    parent = holder;
    segs.push(holder);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.025, 6, 16), M.steel);
  pivot.add(ring);
  let yaw = 0, droop = 0;
  return {
    update(dt, time, wind) {
      const spd = Math.hypot(wind.x, wind.z);
      const target = Math.atan2(wind.x, wind.z);
      let d = target - yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw += d * Math.min(1, dt * 1.5);
      pivot.rotation.y = yaw + Math.PI;
      // Full extension around 15 kt; flutter scales with speed.
      const ext = Math.min(1, spd / 7.5);
      droop += ((1 - ext) * 0.55 - droop) * Math.min(1, dt * 2);
      segs.forEach((s, i) => {
        s.rotation.x = -droop * (i === 0 ? 0.6 : 0.35) + Math.sin(time * 7 + i * 1.3) * 0.04 * ext;
        s.rotation.y = Math.sin(time * 5.3 + i) * 0.05 * ext;
      });
    },
  };
}

function buildPowerLine(B, M, group, H) {
  const pts = POWERLINE.points.map(([x, z]) => ({ x, z, y: H(x, z) }));
  const wires = [];
  const wirePos = [];
  const markerGeo = new THREE.SphereGeometry(0.45, 10, 8);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    B.cyl(0.14, 0.2, POWERLINE.height + 0.6, M.concrete, p.x, p.y + (POWERLINE.height + 0.6) / 2 - 0.3, p.z, 8);
    const next = pts[Math.min(i + 1, pts.length - 1)], prev = pts[Math.max(i - 1, 0)];
    const ang = Math.atan2(next.x - prev.x, next.z - prev.z) + Math.PI / 2;
    B.add(new THREE.BoxGeometry(2.6, 0.14, 0.14), M.woodDark, p.x, p.y + POWERLINE.height - 0.2, p.z, ang - Math.PI / 2);
    B.collider(p.x - 1.4, p.x + 1.4, p.z - 1.4, p.z + 1.4, p.y + POWERLINE.height + 0.3, 'power pole');
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const ang = Math.atan2(b.x - a.x, b.z - a.z);
    const ox = Math.cos(ang), oz = -Math.sin(ang);
    for (const off of [-1.1, 0, 1.1]) {
      const n = 12;
      let last = null;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const x = a.x + (b.x - a.x) * t + ox * off, z = a.z + (b.z - a.z) * t + oz * off;
        const y = a.y + (b.y - a.y) * t + POWERLINE.height - 0.1 - POWERLINE.sag * 4 * t * (1 - t);
        if (last) { wirePos.push(...last, x, y, z); wires.push({ a: last, b: [x, y, z] }); }
        last = [x, y, z];
      }
    }
    // Orange marker balls on the middle wire (deliberate, legible obstacle).
    for (const t of [0.33, 0.66]) {
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const y = a.y + (b.y - a.y) * t + POWERLINE.height - 0.1 - POWERLINE.sag * 4 * t * (1 - t);
      const m = new THREE.Mesh(markerGeo, M.orange);
      m.position.set(x, y, z);
      group.add(m);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(wirePos, 3));
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2a2a2a }));
  group.add(lines);
  return wires;
}

