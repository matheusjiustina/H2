// Aircraft asset management (phase 4). Every aircraft of the fleet stays in
// the scene (parked ones are visible at the apron, hangar and catalogue), but
// only the flown one needs live resources:
//
//  * a PARKED aircraft is "frozen": its static exterior meshes are baked into
//    one mesh per material (same geometry, same materials, same transforms,
//    expressed in the aircraft's own frame) so it costs a few draw calls
//    instead of ~130, and its node matrices stop being recomputed every frame;
//  * the GPU copies of its cockpit and pilot (geometries / textures used by
//    nothing else) are released — three.js uploads them again by itself the
//    next time they are drawn, so entering the cockpit again just works;
//  * when the aircraft is selected, or any option that touches its meshes
//    changes (livery, registration, spray kit), it is "thawed": the original
//    meshes are drawn again, exactly as before.
//
// Nothing here changes a model, a physics value or an access rule: premium /
// locked aircraft stay visible exactly as they were. Sources stay in memory.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _inv = new THREE.Matrix4(), _m = new THREE.Matrix4(), _n = new THREE.Matrix3();
const BASE_ON_BEFORE = THREE.Object3D.prototype.onBeforeRender;

function chainVisible(o, root) {
  for (let n = o; n; n = n.parent) { if (!n.visible) return false; if (n === root) return true; }
  return true;
}

const sig = (g) => {
  let s = g.index ? 'i' : 'n';
  for (const k of Object.keys(g.attributes).sort()) { const a = g.attributes[k]; s += `|${k}${a.itemSize}${a.normalized ? 'n' : ''}${a.isInterleavedBufferAttribute ? 'x' : ''}`; }
  return s + (g.morphAttributes && Object.keys(g.morphAttributes).length ? 'M' : '') + (g.groups.length ? 'G' : '');
};

export class AircraftAssets {
  constructor(game) {
    this.game = game;
    this.entries = new Map(); // id → state
    this.stats = { merges: 0, thaws: 0, gpuReleases: 0, lastMergeMs: 0 };
  }

  // Reference counts of every geometry / texture used by the fleet, to know
  // which resources only one aircraft's cockpit / pilot owns.
  _owners() {
    const geo = new Map(), tex = new Map();
    const add = (map, k, id) => { let s = map.get(k); if (!s) map.set(k, (s = new Set())); s.add(id); };
    for (const [id, ac] of Object.entries(this.game.fleet)) {
      ac.model.root.traverse((o) => {
        if (!o.geometry && !o.material) return;
        if (o.geometry) add(geo, o.geometry, id);
        for (const m of [].concat(o.material ?? [])) for (const k in m) if (m[k]?.isTexture) add(tex, m[k], id);
      });
    }
    return { geo, tex };
  }

  // Cockpit and pilot resources that nobody else (the exterior included) uses.
  _cockpitOnly(id, ac, owners) {
    const { cockpit, pilot, root } = ac.model;
    const inside = { g: new Set(), t: new Set() }, outside = { g: new Set(), t: new Set() };
    const into = (set, o) => {
      if (o.geometry) set.g.add(o.geometry);
      for (const m of [].concat(o.material ?? [])) for (const k in m) if (m[k]?.isTexture) set.t.add(m[k]);
    };
    const walk = (o, inCk) => {
      const ck = inCk || o === cockpit || o === pilot;
      into(ck ? inside : outside, o);
      for (const c of o.children) walk(c, ck);
    };
    walk(root, false);
    const geo = [...inside.g].filter((g) => !outside.g.has(g) && owners.geo.get(g)?.size === 1);
    const tex = [...inside.t].filter((t) => !outside.t.has(t) && owners.tex.get(t)?.size === 1);
    return { geo, tex };
  }

  register() {
    const owners = this._owners();
    for (const [id, ac] of Object.entries(this.game.fleet)) {
      this.entries.set(id, { id, ac, state: 'live', cockpitOnly: this._cockpitOnly(id, ac, owners), merged: null, saved: null });
    }
  }

  // Freeze a parked aircraft (call after park()).
  freeze(id) {
    const e = this.entries.get(id);
    if (!e || e.state === 'frozen') return false;
    const t0 = performance.now();
    const { ac } = e, root = ac.model.root;
    root.updateMatrixWorld(true);
    _inv.copy(root.matrixWorld).invert();
    const groups = new Map();
    const hidden = [];
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isSprite) return;
      if (!chainVisible(o, root) || Array.isArray(o.material) || !o.geometry?.attributes?.position) return;
      if (o.material.transparent || o.onBeforeRender !== BASE_ON_BEFORE || o.customDepthMaterial || o.customDistanceMaterial) return;
      if (o.geometry.morphAttributes?.position || o.geometry.groups.length) return;
      const key = [o.material.uuid, o.castShadow, o.receiveShadow, o.renderOrder, o.layers.mask, o.frustumCulled, sig(o.geometry)].join('~');
      let gr = groups.get(key);
      if (!gr) groups.set(key, (gr = { mat: o.material, ref: o, list: [] }));
      gr.list.push(o);
    });
    const holder = new THREE.Group();
    holder.name = 'parkedMerge';
    const geoms = [];
    for (const gr of groups.values()) {
      if (gr.list.length < 2) continue; // nothing to gain
      const parts = gr.list.map((o) => {
        const g = o.geometry.clone();
        _m.multiplyMatrices(_inv, o.matrixWorld);
        g.applyMatrix4(_m);
        return g;
      });
      const mg = mergeGeometries(parts);
      parts.forEach((p) => p.dispose());
      if (!mg) continue;
      mg.computeBoundingSphere();
      const mesh = new THREE.Mesh(mg, gr.mat);
      mesh.castShadow = gr.ref.castShadow; mesh.receiveShadow = gr.ref.receiveShadow;
      mesh.renderOrder = gr.ref.renderOrder; mesh.layers.mask = gr.ref.layers.mask; mesh.frustumCulled = gr.ref.frustumCulled;
      mesh.matrixAutoUpdate = false;
      holder.add(mesh);
      geoms.push(mg);
      for (const o of gr.list) { o.visible = false; hidden.push(o); }
    }
    holder.matrixAutoUpdate = false;
    root.add(holder);
    // Matrices of the whole model are final while parked.
    const autos = [];
    root.traverse((o) => { if (o.matrixAutoUpdate) { autos.push(o); o.matrixAutoUpdate = false; } });
    const ownUpdate = Object.prototype.hasOwnProperty.call(root, 'updateMatrixWorld') ? root.updateMatrixWorld : null;
    holder.updateMatrix(); root.updateMatrixWorld(true);
    root.updateMatrixWorld = function () {};
    // GPU copies of the cockpit and pilot (re-uploaded automatically on use).
    for (const g of e.cockpitOnly.geo) g.dispose();
    for (const t of e.cockpitOnly.tex) t.dispose();
    this.stats.gpuReleases += e.cockpitOnly.geo.length + e.cockpitOnly.tex.length;
    e.merged = { holder, geoms }; e.saved = { hidden, autos, ownUpdate };
    e.state = 'frozen';
    this.stats.merges++;
    this.stats.lastMergeMs = +(performance.now() - t0).toFixed(1);
    return true;
  }

  // Back to the original meshes (selection, option changes, re-parking).
  thaw(id) {
    const e = this.entries.get(id);
    if (!e || e.state !== 'frozen') return false;
    const root = e.ac.model.root;
    delete root.updateMatrixWorld;
    if (e.saved.ownUpdate) root.updateMatrixWorld = e.saved.ownUpdate;
    for (const o of e.saved.hidden) o.visible = true;
    for (const o of e.saved.autos) o.matrixAutoUpdate = true;
    root.remove(e.merged.holder);
    for (const g of e.merged.geoms) g.dispose();
    e.merged = e.saved = null;
    e.state = 'live';
    this.stats.thaws++;
    return true;
  }

  // An option changed meshes / materials of this aircraft: redo the bake.
  refresh(id) {
    if (this.thaw(id)) { this.freeze(id); }
  }
  refreshAll() { for (const id of this.entries.keys()) this.refresh(id); }

  report() {
    const out = {};
    for (const [id, e] of this.entries) out[id] = { state: e.state, mergedMeshes: e.merged?.holder.children.length ?? 0 };
    return { ...this.stats, aircraft: out };
  }
}
