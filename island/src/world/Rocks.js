import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../core/MaterialPatch.js';
import { LAYER } from '../core/Shared.js';
import { Noise, rng, smoothstep, clamp } from '../utils/MathUtils.js';
import { VIEWPOINT, WATERFALL, ISLET, CAMP, PIER } from './Layout.js';

/** Build a displaced boulder geometry with baked crevice AO in vertex colours. */
function rockGeometry(seed, { flat = 0.75, sharp = 0.5, elong = 1 } = {}, detail = 3) {
  const n = new Noise(seed);
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const disp = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let d = n.fbm3(v.x * 1.1, v.y * 1.1, v.z * 1.1, 4) * 0.38;
    d += (1 - Math.abs(n.noise3(v.x * 2.6 + 3, v.y * 2.6, v.z * 2.6))) * 0.16 * sharp;
    // planar facets for a fractured, eroded look
    const facet = Math.max(0, n.noise3(v.x * 1.4 + 7, v.y * 1.4, v.z * 1.4));
    d -= facet * facet * 0.2;
    disp[i] = d;
    v.multiplyScalar(1 + d);
    v.y *= flat;
    if (v.y < -0.25) v.y = -0.25 + (v.y + 0.25) * 0.35; // flat-ish base
    v.x *= elong;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const ao = clamp(0.55 + (disp[i] + 0.15) * 1.3, 0.35, 1.05);
    col[i * 3] = ao; col[i * 3 + 1] = ao; col[i * 3 + 2] = ao;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

// Triplanar rock with moss on upward faces and coral tint via instance colour.
const ROCK_FRAG = (shader) => {
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform sampler2D uRockAlb;\nuniform sampler2D uRockNrm;\nuniform float uMoss;')
    .replace('#include <map_fragment>', `
vec3 _wn = normalize(vRockN);
vec3 _bw = pow(abs(_wn), vec3(4.0)); _bw /= dot(_bw, vec3(1.0));
float _sc = 0.32;
vec4 _ax = texture2D(uRockAlb, vWPos.zy * _sc), _ay = texture2D(uRockAlb, vWPos.xz * _sc), _az = texture2D(uRockAlb, vWPos.xy * _sc);
vec3 _alb = _ax.rgb * _bw.x + _ay.rgb * _bw.y + _az.rgb * _bw.z;
vec3 _nx = texture2D(uRockNrm, vWPos.zy * _sc).xyz * 2.0 - 1.0;
vec3 _ny = texture2D(uRockNrm, vWPos.xz * _sc).xyz * 2.0 - 1.0;
vec3 _nz = texture2D(uRockNrm, vWPos.xy * _sc).xyz * 2.0 - 1.0;
vec3 _pn = normalize(_wn + vec3(0.0, _nx.y, _nx.x) * _bw.x * 0.8 + vec3(_ny.x, 0.0, _ny.y) * _bw.y * 0.8 + vec3(_nz.x, _nz.y, 0.0) * _bw.z * 0.8);
float _macro = texture2D(uNoiseTex, vWPos.xz * 0.05 + vWPos.y * 0.02).r;
_alb *= 0.8 + _macro * 0.4;
// moss on top surfaces, more in the shady jungle and above the splash zone
float _mossN = texture2D(uNoiseTex, vWPos.xz * 0.21 + vWPos.y * 0.1).g;
float _moss = smoothstep(0.35, 0.85, _pn.y + _mossN * 0.45 - 0.2) * uMoss * smoothstep(0.6, 2.0, vWPos.y);
vec3 _mossCol = mix(vec3(0.09, 0.15, 0.035), vec3(0.2, 0.25, 0.07), _mossN);
_alb = mix(_alb, _mossCol, _moss);
// dark wet band + barnacles near the waterline
float _wl = smoothstep(0.9, -0.2, vWPos.y - uWaterLevel) * (1.0 - step(vWPos.y, uWaterLevel - 1.5));
_alb *= mix(1.0, 0.55, _wl);
diffuseColor.rgb *= _alb;
float _rockRough = mix(0.85, 0.95, _moss);
_rockRough = mix(_rockRough, 0.35, _wl);
`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = _rockRough;')
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(_pn, 0.0)).xyz);')
    .replace('varying vec3 vWPos;', 'varying vec3 vWPos;\nvarying vec3 vRockN;');
};
const ROCK_VERT = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('varying vec3 vWPos;', 'varying vec3 vWPos;\nvarying vec3 vRockN;')
    .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
#ifdef USE_INSTANCING
vRockN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
#else
vRockN = normalize(mat3(modelMatrix) * objectNormal);
#endif`);
};

export class Rocks {
  constructor({ scene, terrainData, textures, collision }) {
    this.td = terrainData;
    this.collision = collision;
    this.group = new THREE.Group();
    this.group.name = 'rocks';
    scene.add(this.group);
    const defs = [
      [11, { flat: 0.7 }],
      [23, { flat: 0.55, elong: 1.4 }],
      [37, { flat: 0.9, sharp: 0.9 }],
      [41, { flat: 0.45, elong: 1.2 }],
      [59, { flat: 1.1, sharp: 1 }],
      [67, { flat: 0.8, elong: 0.8 }],
    ];
    this.variants = defs.map(([seed, o]) => rockGeometry(seed, o, 3));
    this.variantsLow = defs.map(([seed, o]) => rockGeometry(seed, o, 2));
    this.material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, vertexColors: true });
    patchMaterial(this.material, {
      wet: 0.9, key: 'rock',
      uniforms: { uRockAlb: { value: textures.rock }, uRockNrm: { value: textures.rockNormal }, uMoss: { value: 1 } },
      vertex: ROCK_VERT, fragment: ROCK_FRAG,
    });
    this.place();
  }

  place() {
    const td = this.td;
    const r = rng(9001);
    const n = new Noise(4);
    const items = this.variants.map(() => []);
    const add = (x, z, size, opts = {}) => {
      const v = opts.variant ?? Math.floor(r() * this.variants.length);
      const y = (opts.y ?? td.heightAt(x, z)) - size * (opts.sink ?? 0.28);
      const rot = r() * Math.PI * 2;
      const tilt = (r() - 0.5) * (opts.tilt ?? 0.3);
      const sy = size * (opts.sy ?? (0.7 + r() * 0.5));
      items[v].push({ x, y, z, s: size, sy, rot, tilt, tint: opts.tint || [0.9 + r() * 0.2, 0.9 + r() * 0.15, 0.88 + r() * 0.15] });
      if (opts.collide !== false && size > 0.35 && y + sy * 0.6 > -1.2) {
        this.collision.addEllipsoid({ x, y: y + sy * 0.1, z, rx: size * 0.92, ry: sy * 0.72, rz: size * 0.92, surface: 'rock' });
      }
    };
    const avoid = (x, z, pad = 4) => Math.hypot(x - CAMP.x, z - CAMP.z) < 16 + pad || (Math.abs(x - PIER.x) < 5 && z < PIER.zStart + 4 && z > PIER.zEnd - 6);

    // coastal boulders where the shore is rocky
    for (const [x, z] of td.coastPoly) {
      for (let k = 0; k < 3; k++) {
        const px = x + (r() - 0.5) * 22, pz = z + (r() - 0.5) * 22;
        if (avoid(px, pz)) continue;
        const s = td.splatAt(px, pz, {});
        const h = td.heightAt(px, pz);
        const cliff = td._cliffiness(px, pz);
        if (cliff < 0.25 && s.rock < 0.3 && r() > 0.08) continue;
        if (h < -3 || h > 30) continue;
        add(px, pz, 0.8 + r() * (1.5 + cliff * 3.5), { sink: 0.35 });
      }
    }
    // headland cliff blocks
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = 25 + r() * 60;
      const x = VIEWPOINT.x + Math.cos(a) * d, z = VIEWPOINT.z + Math.sin(a) * d;
      const sl = td.slopeAt(x, z);
      if (sl < 0.25 || td.heightAt(x, z) < -4) continue;
      add(x, z, 3 + r() * 6, { sink: 0.4, tilt: 0.5 });
    }
    // steep slopes / mountain rock bands
    for (let i = 0; i < 1600; i++) {
      const x = -360 + r() * 720, z = 40 + r() * 420;
      const sl = td.slopeAt(x, z);
      const h = td.heightAt(x, z);
      if (sl < 0.45 || h < 6 || avoid(x, z)) continue;
      if (r() > 0.35) continue;
      add(x, z, 2.5 + r() * 7 * smoothstep(0.45, 0.8, sl) + h * 0.02, { sink: 0.45, tilt: 0.6, collide: h < 40 });
    }
    // jungle boulders
    for (let i = 0; i < 900; i++) {
      const x = -330 + r() * 660, z = -20 + r() * 440;
      const dc = td.coastAt(x, z);
      if (dc < 35 || td.pathAt(x, z) < 3 || avoid(x, z)) continue;
      if (n.noise2(x * 0.02, z * 0.02) < 0.15 || r() > 0.45) continue;
      add(x, z, 0.5 + r() * 2.2, { sink: 0.35 });
    }
    // small stones on the beach and path edges
    for (let i = 0; i < 260; i++) {
      const x = -320 + r() * 640, z = -40 + r() * 60;
      const dc = td.coastAt(x, z);
      if (dc < 2 || dc > 30 || avoid(x, z, -6)) continue;
      add(x, z, 0.15 + r() * 0.35, { sink: 0.3, collide: false });
    }
    // coral heads in the lagoon
    for (let i = 0; i < 700; i++) {
      const x = -420 + r() * 840, z = -345 + r() * 320;
      const h = td.heightAt(x, z);
      const s = td.splatAt(x, z, {});
      if (h > -0.6 || h < -5 || s.coral < 0.35 || r() > 0.55) continue;
      const pick = r();
      const tint = pick < 0.3 ? [1.25, 0.85, 0.85] : pick < 0.55 ? [1.15, 1.05, 0.75] : pick < 0.75 ? [0.85, 1.05, 0.95] : [1.0, 0.95, 0.9];
      add(x, z, 0.6 + r() * 1.6, { sink: 0.25, sy: 0.6 + r() * 0.4, tint, collide: h > -1.4 });
    }
    // islet rocks
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2;
      const x = ISLET.x + Math.cos(a) * ISLET.rx * (0.8 + r() * 0.4), z = ISLET.z + Math.sin(a) * ISLET.rz * (0.8 + r() * 0.4);
      add(x, z, 0.8 + r() * 1.8, { sink: 0.3 });
    }
    // waterfall amphitheatre: large blocks around the pool and at the cliff foot
    const W = WATERFALL;
    for (let i = 0; i < 34; i++) {
      const a = Math.PI * (0.05 + r() * 0.9);
      const d = W.poolRadius + 1 + r() * 8;
      const x = W.x + Math.cos(a) * d * 1.1, z = W.z + 3 + Math.sin(a) * d;
      add(x, z, 1.2 + r() * 3.2, { sink: 0.35, tilt: 0.5 });
    }
    for (let i = 0; i < 10; i++) {
      const a = Math.PI + r() * Math.PI;
      const x = W.x + Math.cos(a) * (W.poolRadius - 1), z = W.z + 3 + Math.sin(a) * (W.poolRadius - 1) * 0.8;
      add(x, z, 0.6 + r() * 1.3, { sink: 0.3 });
    }

    // instance data + two LOD instanced meshes per variant, filled per frame by culling
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    this.sets = [];
    items.forEach((list, vi) => {
      if (!list.length) return;
      const mats = new Float32Array(list.length * 16);
      const cols = new Float32Array(list.length * 3);
      const info = new Float32Array(list.length * 4); // x, y, z, radius
      list.forEach((o, i) => {
        e.set(o.tilt, o.rot, o.tilt * 0.6, 'YXZ');
        q.setFromEuler(e);
        m.compose(p.set(o.x, o.y, o.z), q, sc.set(o.s, o.sy, o.s));
        m.toArray(mats, i * 16);
        cols.set(o.tint, i * 3);
        info.set([o.x, o.y, o.z, Math.max(o.s, o.sy) * 1.3], i * 4);
      });
      const mk = (geo) => {
        const mesh = new THREE.InstancedMesh(geo, this.material, list.length);
        mesh.count = 0;
        mesh.frustumCulled = true;
        mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.layers.set(LAYER.WORLD);
        mesh.layers.enable(LAYER.REFLECT_LITE);
        this.group.add(mesh);
        return mesh;
      };
      this.sets.push({ mats, cols, info, n: list.length, hi: mk(this.variants[vi]), lo: mk(this.variantsLow[vi]) });
    });
    this.frustum = new THREE.Frustum();
    this._pm = new THREE.Matrix4();
    this._sphere = new THREE.Sphere();
    this.lastCam = new THREE.Vector3(1e9, 0, 0);
    this.lastDir = new THREE.Vector3();
    this.count = items.reduce((a, l) => a + l.length, 0);
  }

  update(dt, game) {
    const cam = game.camera;
    const dir = cam.getWorldDirection(this._sphere.center);
    if (cam.position.distanceToSquared(this.lastCam) < 0.5 && dir.dot(this.lastDir) > 0.9995) return;
    this.lastCam.copy(cam.position);
    this.lastDir.copy(dir);
    this._pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this._pm);
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    for (const set of this.sets) {
      let nh = 0, nl = 0;
      const bh = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity, 0], bl = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity, 0];
      const H = set.hi.instanceMatrix.array, Lo = set.lo.instanceMatrix.array;
      const HC = set.hi.instanceColor.array, LC = set.lo.instanceColor.array;
      for (let i = 0; i < set.n; i++) {
        const x = set.info[i * 4], y = set.info[i * 4 + 1], z = set.info[i * 4 + 2], rad = set.info[i * 4 + 3];
        const d = Math.hypot(x - cx, y - cy, z - cz);
        const maxD = 60 + rad * 220;
        if (d > maxD) continue;
        if (d > 50 + rad) {
          this._sphere.center.set(x, y, z);
          this._sphere.radius = rad;
          if (!this.frustum.intersectsSphere(this._sphere)) continue;
        }
        const hi = d < 45 + rad * 8;
        const arr = hi ? H : Lo, carr = hi ? HC : LC;
        const bb = hi ? bh : bl;
        if (x - rad < bb[0]) bb[0] = x - rad; if (y - rad < bb[1]) bb[1] = y - rad; if (z - rad < bb[2]) bb[2] = z - rad;
        if (x + rad > bb[3]) bb[3] = x + rad; if (y + rad > bb[4]) bb[4] = y + rad; if (z + rad > bb[5]) bb[5] = z + rad;
        const k = hi ? nh++ : nl++;
        for (let j = 0; j < 16; j++) arr[k * 16 + j] = set.mats[i * 16 + j];
        carr[k * 3] = set.cols[i * 3]; carr[k * 3 + 1] = set.cols[i * 3 + 1]; carr[k * 3 + 2] = set.cols[i * 3 + 2];
      }
      for (const [mesh, c, bb] of [[set.hi, nh, bh], [set.lo, nl, bl]]) {
        mesh.count = c;
        mesh.visible = c > 0;
        if (c > 0) {
          mesh.boundingSphere.center.set((bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2);
          mesh.boundingSphere.radius = Math.hypot(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) / 2;
        }
        mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, c * 16); mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.addUpdateRange(0, c * 3); mesh.instanceColor.needsUpdate = true;
      }
    }
  }
}
