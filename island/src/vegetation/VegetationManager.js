import * as THREE from 'three';
import { patchMaterial, makeDepthMaterial } from '../core/MaterialPatch.js';
import { LAYER } from '../core/Shared.js';
import { rng, Noise, smoothstep, clamp, lerp } from '../utils/MathUtils.js';
import { createLeafTextures } from './LeafTextures.js';
import { buildPalm, buildTree, buildBanana, buildFern, buildBigLeaf, buildBush } from './PlantGeometry.js';
import { CAMP, PIER, WATERFALL, ISLET, VIEWPOINT } from '../world/Layout.js';

const CHUNK = 32;
const PALM_HEIGHTS = [7.5, 9.2, 11, 12.8, 8.4];
const TREE_CROWNS = [4.6, 5.4, 6.6, 6.0];

// Hand placed hero palms around the camp and on the islet: [x, z, height, lean, leanDirAngle(rad), fronds]
export const HERO_PALMS = [
  [5.6, 7.6, 9.6, 3.0, Math.PI * 0.92, 16], // leans over the deck, casts the signature leaf shadows
  [-6.4, 9.8, 11.2, 1.8, -0.35, 15],
  [-8.2, -2.4, 8.4, 3.2, Math.PI * 0.55, 14],
  [11.5, 1.2, 10.4, 2.4, Math.PI * 0.62, 15],
  [15.5, 10.5, 12.5, 1.2, Math.PI * 0.4, 14],
  [-13.5, 4.5, 9.8, 2.2, Math.PI * 0.7, 14],
  [ISLET.x - 6, ISLET.z + 2, 9.5, 3.4, Math.PI * 0.75, 15],
  [ISLET.x + 8, ISLET.z - 4, 8.2, 2.0, -Math.PI * 0.3, 13],
  [ISLET.x + 1, ISLET.z + 7, 11.0, 1.4, Math.PI * 0.2, 15],
];

/** Definitions of every plant type. */
function typeDefs(textures, leafTex) {
  const barkPalm = new THREE.MeshStandardMaterial({ map: textures.barkPalm, normalMap: textures.barkPalmNormal, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.92, vertexColors: true });
  const barkTree = new THREE.MeshStandardMaterial({ map: textures.barkTree, normalMap: textures.barkTreeNormal, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.95, vertexColors: true });
  const stemMat = new THREE.MeshStandardMaterial({ map: textures.barkTree, roughness: 0.8, vertexColors: true, color: new THREE.Color(0.75, 0.95, 0.6) });
  const leaf = (map, opts = {}) => new THREE.MeshStandardMaterial({ map, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: opts.roughness ?? 0.62, color: opts.color ?? 0xffffff, envMapIntensity: 0.8 });
  const palmLeaf = leaf(leafTex.palm, { roughness: 0.55 });
  const clusterLeaf = leaf(leafTex.cluster, { roughness: 0.58 });
  const vineLeaf = leaf(leafTex.vine);
  const bananaLeaf = leaf(leafTex.banana, { roughness: 0.5 });
  const fernLeaf = leaf(leafTex.fern, { roughness: 0.7 });
  const bigLeaf = leaf(leafTex.big, { roughness: 0.45 });
  const shrubLeaf = leaf(leafTex.shrub, { roughness: 0.6 });

  patchMaterial(barkPalm, { wind: 'palm', wet: 0.9, key: 'barkPalm' });
  patchMaterial(barkTree, { wind: 'tree', wet: 0.9, key: 'barkTree' });
  patchMaterial(stemMat, { wind: 'plant', wet: 0.6, key: 'stem' });
  patchMaterial(palmLeaf, { wind: 'palm', translucency: 0.75, foliage: true, wet: 0.5, key: 'palmLeaf' });
  patchMaterial(clusterLeaf, { wind: 'tree', translucency: 0.6, foliage: true, wet: 0.5, key: 'clusterLeaf' });
  patchMaterial(vineLeaf, { wind: 'tree', translucency: 0.5, foliage: true, wet: 0.4, key: 'vine' });
  patchMaterial(bananaLeaf, { wind: 'plant', translucency: 0.8, foliage: true, wet: 0.5, key: 'banana' });
  patchMaterial(fernLeaf, { wind: 'plant', translucency: 0.6, foliage: true, wet: 0.5, key: 'fern' });
  patchMaterial(bigLeaf, { wind: 'plant', translucency: 0.7, foliage: true, wet: 0.5, key: 'big' });
  patchMaterial(shrubLeaf, { wind: 'plant', translucency: 0.5, foliage: true, wet: 0.5, key: 'shrub' });

  const depth = {
    palm: makeDepthMaterial({ wind: 'palm' }),
    palmLeaf: makeDepthMaterial({ wind: 'palm', map: leafTex.palm }),
    tree: makeDepthMaterial({ wind: 'tree' }),
    treeLeaf: makeDepthMaterial({ wind: 'tree', map: leafTex.cluster }),
    vine: makeDepthMaterial({ wind: 'tree', map: leafTex.vine }),
    plant: makeDepthMaterial({ wind: 'plant' }),
    banana: makeDepthMaterial({ wind: 'plant', map: leafTex.banana }),
    fern: makeDepthMaterial({ wind: 'plant', map: leafTex.fern }),
    big: makeDepthMaterial({ wind: 'plant', map: leafTex.big }),
    shrub: makeDepthMaterial({ wind: 'plant', map: leafTex.shrub }),
  };

  return {
    palm: {
      variants: 5, big: true, layer: LAYER.WORLD,
      build: (v, lod) => buildPalm(1000 + v * 17, lod, { height: PALM_HEIGHTS[v] }),
      parts: { trunk: [barkPalm, depth.palm], leaves: [palmLeaf, depth.palmLeaf] },
    },
    tree: {
      variants: 4, big: true, layer: LAYER.WORLD,
      build: (v, lod) => buildTree(2000 + v * 31, lod, { height: [5.5, 6.5, 8, 7][v], crown: TREE_CROWNS[v], vines: v % 2 === 0 }),
      parts: { trunk: [barkTree, depth.tree], leaves: [clusterLeaf, depth.treeLeaf], vines: [vineLeaf, depth.vine] },
    },
    banana: {
      variants: 3, big: false, medium: true, layer: LAYER.WORLD,
      build: (v, lod) => buildBanana(3000 + v * 13, lod),
      parts: { trunk: [stemMat, depth.plant], leaves: [bananaLeaf, depth.banana] },
    },
    fern: {
      variants: 3, small: true, layer: LAYER.DETAIL,
      build: (v, lod) => buildFern(4000 + v * 7, lod),
      parts: { leaves: [fernLeaf, depth.fern] },
    },
    bigleaf: {
      variants: 2, small: true, layer: LAYER.DETAIL,
      build: (v, lod) => buildBigLeaf(5000 + v * 11, lod, v % 2),
      parts: { trunk: [stemMat, depth.plant], leaves: [bigLeaf, depth.big] },
    },
    bush: {
      variants: 4, small: true, medium: true, layer: LAYER.DETAIL,
      build: (v, lod) => buildBush(6000 + v * 19, lod, v, v === 3 ? { radius: 1.2, height: 0.75 } : {}),
      parts: { leaves: [shrubLeaf, depth.shrub] },
    },
  };
}

export class VegetationManager {
  constructor({ terrainData, textures, collision, quality }) {
    this.td = terrainData;
    this.textures = textures;
    this.collision = collision;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    this.noise = new Noise(512);
    this.leafTextures = createLeafTextures();
    this.defs = typeDefs(textures, this.leafTextures);
    this.instances = {}; // type -> [{x,y,z,rot,scale,tilt,tiltDir,variant,tint,keep}]
    this.frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._box = new THREE.Box3();
    this._pm = new THREE.Matrix4();
    this.lastCam = new THREE.Vector3(1e9, 0, 0);
    this.lastDir = new THREE.Vector3();
    this.frame = 0;
  }

  // -------------------------------------------------------------- placement
  _excluded(x, z, pad = 0) {
    // camp clearing / deck, pier, fire pit, waterfall pool
    const dzc = z - CAMP.deck.z;
    if (Math.abs(x - CAMP.deck.x) < CAMP.deck.w / 2 + 2.5 + pad && dzc > -CAMP.deck.d / 2 - 4 - pad && dzc < CAMP.deck.d / 2 + 2.5 + pad) return true;
    if (Math.abs(x - PIER.x) < 3.5 + pad && z < PIER.zStart + 6 && z > PIER.zEnd - 5) return true;
    if (Math.hypot(x + 3.2, z + 2.8) < 3 + pad) return true; // fire pit
    if (Math.hypot(x - WATERFALL.x, z - (WATERFALL.z + 3)) < WATERFALL.poolRadius + 1.5 + pad) return true;
    if (Math.hypot(x - VIEWPOINT.x, z - VIEWPOINT.z) < 7 + pad) return true;
    return false;
  }

  _scatter(spacing, seed, accept) {
    const r = rng(seed);
    const half = this.td.half - 10;
    const out = [];
    for (let z = -half; z < half; z += spacing) {
      for (let x = -half; x < half; x += spacing) {
        const px = x + (r() - 0.5) * spacing * 0.95, pz = z + (r() - 0.5) * spacing * 0.95;
        const rv = r();
        const res = accept(px, pz, rv, r);
        if (res) out.push(res);
      }
    }
    return out;
  }

  _site(x, z) {
    const td = this.td;
    return { h: td.heightAt(x, z), dc: td.coastAt(x, z), sl: td.slopeAt(x, z), pd: td.pathAt(x, z), s: td.splatAt(x, z, this._splat || (this._splat = {})) };
  }

  place(progress = () => {}) {
    const td = this.td;
    const n = this.noise;
    const inst = this.instances;
    for (const k of Object.keys(this.defs)) inst[k] = [];
    const add = (type, o) => { o.keep = o.keep ?? Math.random(); inst[type].push(o); };

    // --- hero palms
    HERO_PALMS.forEach((p, i) => {
      const [x, z, H, lean, dir] = p;
      const y = td.heightAt(x, z);
      // choose the variant with the closest height and scale to match
      const heights = PALM_HEIGHTS;
      let best = 0;
      heights.forEach((hh, k) => { if (Math.abs(hh - H) < Math.abs(heights[best] - H)) best = k; });
      add('palm', { x, y, z, rot: dir, scale: H / heights[best], variant: best, tint: [1, 1, 1], keep: 0, hero: true, tilt: 0 });
    });

    // --- beach / coastal palms (lean seaward)
    this._scatter(5.5, 11, (x, z, rv, r) => {
      if (this._excluded(x, z, 3)) return null;
      const s = this._site(x, z);
      if (s.h < 0.7 || s.sl > 0.32 || s.pd < 2.5 || s.dc < 5 || s.dc > 70) return null;
      const grove = smoothstep(-0.25, 0.45, n.noise2(x * 0.011, z * 0.011));
      const band = smoothstep(5, 13, s.dc) * (1 - smoothstep(32, 70, s.dc));
      if (rv > band * (0.25 + 0.75 * grove) * 0.75) return null;
      if (Math.hypot(x - CAMP.x, z - CAMP.z) < 18) return null;
      const gx = td.coastAt(x + 2, z) - td.coastAt(x - 2, z);
      const gz = td.coastAt(x, z + 2) - td.coastAt(x, z - 2);
      const sea = Math.atan2(gz, -gx); // local +x towards decreasing coast distance
      return { x, y: s.h, z, rot: sea + (r() - 0.5) * 0.9, scale: 0.8 + r() * 0.45, variant: Math.floor(r() * 5), tint: [0.9 + r() * 0.2, 0.92 + r() * 0.16, 0.85 + r() * 0.2] };
    }).forEach((o) => add('palm', o));
    // --- inland palms
    this._scatter(15, 12, (x, z, rv, r) => {
      if (this._excluded(x, z, 2)) return null;
      const s = this._site(x, z);
      if (s.dc < 60 || s.h > 95 || s.sl > 0.4 || s.pd < 3) return null;
      if (rv > 0.16) return null;
      return { x, y: s.h, z, rot: r() * 6.28, scale: 0.85 + r() * 0.4, variant: Math.floor(r() * 5), tint: [0.9 + r() * 0.2, 0.95, 0.9] };
    }).forEach((o) => add('palm', o));
    progress(0.2);

    // --- canopy trees
    this._scatter(7.2, 21, (x, z, rv, r) => {
      if (this._excluded(x, z, 4)) return null;
      const s = this._site(x, z);
      if (s.dc < 30 || s.h > 128 || s.sl > 0.55 || s.pd < 4.5 || s.h < 1.5) return null;
      const dense = smoothstep(-0.45, 0.35, n.noise2(x * 0.009 + 4, z * 0.009));
      const clearing = smoothstep(0.55, 0.75, n.noise2(x * 0.03, z * 0.03 + 9));
      const p = smoothstep(30, 62, s.dc) * (0.45 + 0.55 * dense) * (1 - clearing) * (1 - smoothstep(0.42, 0.55, s.sl));
      if (rv > p * 0.92) return null;
      const v = Math.floor(r() * 4);
      const hue = r();
      const tint = hue < 0.15 ? [1.12, 1.08, 0.75] : hue < 0.3 ? [0.82, 0.9, 0.8] : [0.92 + r() * 0.16, 0.95 + r() * 0.1, 0.9 + r() * 0.12];
      return { x, y: s.h, z, rot: r() * 6.28, scale: 0.8 + r() * 0.5 + smoothstep(80, 200, s.dc) * 0.25, variant: v, tint };
    }).forEach((o) => add('tree', o));
    progress(0.4);

    // --- canopy map from crowns
    this._buildCanopy();
    progress(0.5);

    // --- bananas near paths / clearings / camp
    this._scatter(8, 31, (x, z, rv, r) => {
      if (this._excluded(x, z, 1)) return null;
      const s = this._site(x, z);
      if (s.dc < 20 || s.dc > 160 || s.sl > 0.4 || s.pd < 2.2 || s.h < 1.2) return null;
      const nearPath = 1 - smoothstep(4, 14, s.pd);
      const open = 1 - s.s.canopy;
      const p = 0.08 + nearPath * 0.4 + open * 0.15;
      if (rv > p) return null;
      return { x, y: s.h, z, rot: r() * 6.28, scale: 0.85 + r() * 0.35, variant: Math.floor(r() * 3), tint: [0.92 + r() * 0.15, 1, 0.9] };
    }).forEach((o) => add('banana', o));

    // --- ferns: jungle floor
    this._scatter(2.4, 41, (x, z, rv, r) => {
      if (this._excluded(x, z)) return null;
      const s = this._site(x, z);
      if (s.dc < 24 || s.sl > 0.62 || s.pd < 1.3 || s.h < 1.0) return null;
      const p = 0.1 + s.s.canopy * 0.85 + (1 - smoothstep(0, 18, Math.hypot(x - WATERFALL.x, z - WATERFALL.z) - WATERFALL.poolRadius)) * 0.6 + (1 - smoothstep(2, 6, s.pd)) * 0.25;
      if (rv > p * 0.9) return null;
      return { x, y: s.h - 0.05, z, rot: r() * 6.28, scale: 0.7 + r() * 0.65, variant: Math.floor(r() * 3), tint: [0.85 + r() * 0.25, 0.95 + r() * 0.1, 0.8 + r() * 0.2] };
    }).forEach((o) => add('fern', o));
    progress(0.7);

    // --- big leaf plants
    this._scatter(3.8, 51, (x, z, rv, r) => {
      if (this._excluded(x, z)) return null;
      const s = this._site(x, z);
      if (s.dc < 28 || s.sl > 0.5 || s.pd < 1.6 || s.h < 1.0) return null;
      const p = 0.05 + s.s.canopy * 0.5 + (1 - smoothstep(2, 7, s.pd)) * 0.15;
      if (rv > p) return null;
      return { x, y: s.h - 0.05, z, rot: r() * 6.28, scale: 0.75 + r() * 0.7, variant: Math.floor(r() * 2), tint: [0.9 + r() * 0.15, 1, 0.9 + r() * 0.15] };
    }).forEach((o) => add('bigleaf', o));

    // --- shrubs: jungle edge + beach sea grape
    this._scatter(4.2, 61, (x, z, rv, r) => {
      if (this._excluded(x, z, 0.5)) return null;
      const s = this._site(x, z);
      if (s.sl > 0.5 || s.pd < 1.6 || s.h < 0.9) return null;
      const edge = smoothstep(14, 22, s.dc) * (1 - smoothstep(48, 80, s.dc));
      const beach = smoothstep(7, 11, s.dc) * (1 - smoothstep(17, 24, s.dc));
      const p = edge * 0.6 + beach * 0.32 + 0.12 * smoothstep(60, 80, s.dc) * (0.4 + s.s.canopy);
      if (rv > p) return null;
      const v = beach > edge ? 3 : Math.floor(r() * 3);
      return { x, y: s.h - 0.08, z, rot: r() * 6.28, scale: 0.7 + r() * 0.7, variant: v, tint: [0.9 + r() * 0.2, 0.95 + r() * 0.1, 0.9 + r() * 0.15] };
    }).forEach((o) => add('bush', o));
    progress(0.85);

    // trunk collisions
    for (const o of inst.palm) this.collision.addCylinder({ x: o.x, z: o.z, r: 0.26 * o.scale, y0: o.y - 1, y1: o.y + 4, surface: 'wood', tag: 'palm' });
    for (const o of inst.tree) this.collision.addCylinder({ x: o.x, z: o.z, r: 0.45 * o.scale, y0: o.y - 1, y1: o.y + 6, surface: 'wood', tag: 'tree' });
    for (const o of inst.banana) this.collision.addCylinder({ x: o.x, z: o.z, r: 0.12 * o.scale, y0: o.y - 1, y1: o.y + 2, surface: 'leaves', tag: 'banana' });
  }

  _buildCanopy() {
    const td = this.td;
    const res = td.res;
    const canopy = new Float32Array(res * res);
    const splat = (x, z, radius, strength) => {
      const gx = (x + td.half) / td.cell, gz = (z + td.half) / td.cell;
      const rr = radius / td.cell;
      const x0 = Math.max(0, Math.floor(gx - rr)), x1 = Math.min(res - 1, Math.ceil(gx + rr));
      const z0 = Math.max(0, Math.floor(gz - rr)), z1 = Math.min(res - 1, Math.ceil(gz + rr));
      for (let j = z0; j <= z1; j++) {
        for (let i = x0; i <= x1; i++) {
          const d = Math.hypot(i - gx, j - gz) / rr;
          if (d < 1) canopy[j * res + i] += strength * (1 - d * d);
        }
      }
    };
    const crowns = TREE_CROWNS;
    for (const o of this.instances.tree) splat(o.x, o.z, crowns[o.variant] * o.scale, 0.8);
    for (const o of this.instances.palm) splat(o.x + Math.cos(o.rot) * 2, o.z - Math.sin(o.rot) * 2, 3.5 * o.scale, 0.35);
    for (let k = 0; k < canopy.length; k++) canopy[k] = clamp(canopy[k], 0, 1);
    td.setCanopy(canopy);
  }

  // -------------------------------------------------------------- meshes
  build() {
    this.tv = []; // typeVariant entries
    for (const [type, def] of Object.entries(this.defs)) {
      const list = this.instances[type];
      for (let v = 0; v < def.variants; v++) {
        const ids = [];
        list.forEach((o, i) => { if (o.variant === v) ids.push(i); });
        if (!ids.length) continue;
        const entry = { type, def, variant: v, ids, lods: [] };
        for (let lod = 0; lod < 3; lod++) {
          if (def.small && lod === 2) break;
          const geo = def.build(v, lod);
          const parts = [];
          for (const [part, [mat, depth]] of Object.entries(def.parts)) {
            const g = part === 'leaves' ? geo.leaves : part === 'vines' ? geo.vines : geo.trunk;
            if (!g) continue;
            const mesh = new THREE.InstancedMesh(g, mat, ids.length);
            mesh.count = 0;
            mesh.frustumCulled = true;
            mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
            mesh.userData.radius = g.boundingSphere ? g.boundingSphere.radius + g.boundingSphere.center.length() : 10;
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ids.length * 3), 3);
            mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
            mesh.customDepthMaterial = depth;
            const casts = def.big || def.medium ? lod < 2 : (this.quality.castSmall && lod === 0);
            mesh.castShadow = casts;
            mesh.receiveShadow = true;
            mesh.layers.set(def.layer);
            mesh.name = `${type}_${v}_${part}_lod${lod}`;
            this.group.add(mesh);
            parts.push(mesh);
          }
          entry.lods.push(parts);
        }
        this.tv.push(entry);
      }
    }
    // precompute instance matrices and chunk lists
    const ncs = Math.ceil(this.td.size / CHUNK);
    this.ncs = ncs;
    this.chunks = new Map();
    this.tv.forEach((entry, tvi) => {
      const list = this.instances[entry.type];
      entry.matrices = new Float32Array(entry.ids.length * 16);
      entry.colors = new Float32Array(entry.ids.length * 3);
      entry.pos = new Float32Array(entry.ids.length * 3);
      entry.keep = new Float32Array(entry.ids.length);
      entry.ids.forEach((id, k) => {
        const o = list[id];
        this._e.set((o.tilt || 0) * 0.5, o.rot, (o.tilt || 0) * 0.5, 'YXZ');
        this._q.setFromEuler(this._e);
        this._s.setScalar(o.scale);
        this._m.compose(this._p.set(o.x, o.y, o.z), this._q, this._s);
        this._m.toArray(entry.matrices, k * 16);
        entry.colors.set(o.tint, k * 3);
        entry.pos.set([o.x, o.y, o.z], k * 3);
        entry.keep[k] = o.keep;
        const cx = Math.floor((o.x + this.td.half) / CHUNK), cz = Math.floor((o.z + this.td.half) / CHUNK);
        const key = cz * ncs + cx;
        let ch = this.chunks.get(key);
        if (!ch) {
          ch = { cx, cz, center: new THREE.Vector3((cx + 0.5) * CHUNK - this.td.half, 0, (cz + 0.5) * CHUNK - this.td.half), box: new THREE.Box3(new THREE.Vector3(Infinity, Infinity, Infinity), new THREE.Vector3(-Infinity, -Infinity, -Infinity)), items: new Map() };
          this.chunks.set(key, ch);
        }
        let arr = ch.items.get(tvi);
        if (!arr) ch.items.set(tvi, (arr = []));
        arr.push(k);
        const h = entry.def.big ? 16 * o.scale : 3;
        ch.box.expandByPoint(this._p.set(o.x - 8, o.y - 1, o.z - 8));
        ch.box.expandByPoint(this._p.set(o.x + 8, o.y + h, o.z + 8));
      });
    });
    this.chunkList = [...this.chunks.values()];
  }

  applySettings(settings, game) {
    this.quality = game.vegetationQuality;
    if (!this.tv) return;
    for (const e of this.tv) {
      e.lods.forEach((parts, lod) => {
        for (const m of parts) m.castShadow = e.def.big || e.def.medium ? lod < 2 : (this.quality.castSmall && lod === 0);
      });
    }
    this.lastCam.set(1e9, 0, 0);
  }

  // -------------------------------------------------------------- per frame
  update(dt, game) {
    const cam = game.camera;
    this.frame++;
    const camPos = cam.position;
    const dir = cam.getWorldDirection(this._p);
    const moved = camPos.distanceToSquared(this.lastCam) > 0.25;
    const turned = dir.dot(this.lastDir) < 0.9995;
    if (!moved && !turned) return;
    this.lastCam.copy(camPos);
    this.lastDir.copy(dir);
    this.cull(cam);
  }

  cull(cam) {
    const q = this.quality;
    this._pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this._pm);
    const cx = cam.position.x, cz = cam.position.z, cy = cam.position.y;
    const maxBig = q.maxDist, lod0 = q.lod0, lod1 = q.lod1, plant = q.plantDist;
    const counts = this.tv.map(() => [0, 0, 0]);
    const bounds = this.tv.map(() => [[Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity, 0], [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity, 0], [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity, 0]]);
    const shadowRadius = 45;
    for (const ch of this.chunkList) {
      const dx = ch.center.x - cx, dz = ch.center.z - cz;
      const d = Math.hypot(dx, dz) - CHUNK * 0.72;
      if (d > maxBig) continue;
      if (d > shadowRadius && !this.frustum.intersectsBox(ch.box)) continue;
      for (const [tvi, ks] of ch.items) {
        const e = this.tv[tvi];
        const def = e.def;
        const limit = def.big ? maxBig : def.medium ? plant * 1.6 : plant;
        if (d > limit) continue;
        const keepLimit = def.big ? 1 : q.density;
        const cnt = counts[tvi];
        for (const k of ks) {
          if (e.keep[k] > keepLimit) continue;
          const ix = e.pos[k * 3] - cx, iy = e.pos[k * 3 + 1] - cy, iz = e.pos[k * 3 + 2] - cz;
          const dist = Math.sqrt(ix * ix + iy * iy + iz * iz);
          if (dist > limit) continue;
          let lod;
          let fade = 1;
          if (def.big) lod = dist < lod0 ? 0 : dist < lod1 ? 1 : 2;
          else {
            lod = dist < lod0 * (def.medium ? 0.8 : 0.5) ? 0 : 1;
            fade = smoothstep(limit, limit * 0.82, dist);
          }
          if (lod >= e.lods.length) lod = e.lods.length - 1;
          const parts = e.lods[lod];
          const slot = cnt[lod]++;
          const bb = bounds[tvi][lod];
          const px = e.pos[k * 3], py = e.pos[k * 3 + 1], pz = e.pos[k * 3 + 2];
          if (px < bb[0]) bb[0] = px; if (py < bb[1]) bb[1] = py; if (pz < bb[2]) bb[2] = pz;
          if (px > bb[3]) bb[3] = px; if (py > bb[4]) bb[4] = py; if (pz > bb[5]) bb[5] = pz;
          const sc = e.matrices[k * 16] * e.matrices[k * 16] + e.matrices[k * 16 + 1] * e.matrices[k * 16 + 1] + e.matrices[k * 16 + 2] * e.matrices[k * 16 + 2];
          if (sc > bb[6]) bb[6] = sc;
          for (const mesh of parts) {
            const arr = mesh.instanceMatrix.array;
            const o = slot * 16, src = k * 16;
            if (fade < 1) {
              for (let i = 0; i < 12; i++) arr[o + i] = e.matrices[src + i] * ((i % 4) === 3 ? 1 : fade);
              arr[o + 12] = e.matrices[src + 12]; arr[o + 13] = e.matrices[src + 13]; arr[o + 14] = e.matrices[src + 14]; arr[o + 15] = 1;
            } else {
              for (let i = 0; i < 16; i++) arr[o + i] = e.matrices[src + i];
            }
            const ca = mesh.instanceColor.array;
            ca[slot * 3] = e.colors[k * 3]; ca[slot * 3 + 1] = e.colors[k * 3 + 1]; ca[slot * 3 + 2] = e.colors[k * 3 + 2];
          }
        }
      }
    }
    this.tv.forEach((e, tvi) => {
      e.lods.forEach((parts, lod) => {
        const c = counts[tvi][lod];
        const bb = bounds[tvi][lod];
        for (const mesh of parts) {
          mesh.count = c;
          mesh.visible = c > 0;
          if (c > 0) {
            const sph = mesh.boundingSphere;
            sph.center.set((bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2);
            sph.radius = Math.hypot(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) / 2 + mesh.userData.radius * Math.sqrt(bb[6]);
          }
          if (c > 0) {
            mesh.instanceMatrix.clearUpdateRanges();
            mesh.instanceMatrix.addUpdateRange(0, c * 16);
            mesh.instanceMatrix.needsUpdate = true;
            mesh.instanceColor.clearUpdateRanges();
            mesh.instanceColor.addUpdateRange(0, c * 3);
            mesh.instanceColor.needsUpdate = true;
          }
        }
      });
    });
  }

  /** Instance list for other systems (e.g. coconut / frond litter placement). */
  getInstances(type) { return this.instances[type] || []; }
}
