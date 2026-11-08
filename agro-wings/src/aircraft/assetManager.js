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
import { memoryTier, PARKED_PAINT, aircraftTextures, releaseCanvas, shrinkCanvas, rebuildModel } from './aircraftMemory.js';

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
    this.stats = { merges: 0, thaws: 0, gpuReleases: 0, lastMergeMs: 0, rebuilds: 0, lightened: 0, released: 0, lastRebuildMs: 0 };
    // Memory (aircraftMemory.js): which aircraft are light, the device tier.
    this.tier = memoryTier(game.perf?.caps ?? {});
    this.light = new Set();
  }

  // Canvases used by any aircraft other than `id` (never released for it).
  _foreignCanvases(id) {
    const s = new Set();
    for (const [k, ac] of Object.entries(this.game.fleet ?? {})) {
      if (k === id || !ac.model?.root) continue;
      const { cockpit, exterior } = aircraftTextures(ac);
      for (const t of cockpit) s.add(t.image);
      for (const t of exterior) s.add(t.image);
    }
    return s;
  }

  // Parked: the cockpit / pilot / panel canvases released (the parked
  // cockpit is hidden), the exterior paint kept at the tier's resolution.
  lighten(id) {
    const ac = this.game.fleet?.[id];
    if (!ac?.model?.root || ac.headless) return false;
    const scale = PARKED_PAINT[this.tier] ?? 1;
    let tx = aircraftTextures(ac);
    // Paint released after its upload (it was flown) and a smaller one wanted: build it again.
    if (scale < 1 && [...tx.exterior].some((t) => t.userData.cpuReleased)) { this._rebuild(id); tx = aircraftTextures(ac); }
    const foreign = this._foreignCanvases(id);
    for (const t of tx.cockpit) {
      if (foreign.has(t.image)) continue;
      t.dispose();
      releaseCanvas(t.image);
      t.userData.cpuReleased = true;
    }
    if (scale < 1) for (const t of tx.exterior) {
      t.onUpdate = null; // (no release after upload: the small copy is kept)
      if (foreign.has(t.image) || t.userData.cpuReleased || t.userData.shrunk) continue;
      if (shrinkCanvas(t.image, scale)) { t.needsUpdate = true; t.userData.shrunk = true; }
    }
    this.light.add(id);
    this.stats.lightened++;
    return true;
  }

  // Flown: a full model again (rebuilt from the type) if it was light.
  ensureFull(id) {
    if (!this.light.has(id)) return false;
    this._rebuild(id);
    this.light.delete(id);
    this.releaseAfterUpload(id);
    return true;
  }

  _rebuild(id) {
    const ac = this.game.fleet[id], t0 = performance.now();
    const wasFrozen = this.entries.get(id)?.state === 'frozen';
    if (wasFrozen) this.thaw(id);
    rebuildModel(ac, this._foreignCanvases(id));
    this._inRebuild = true;
    try { this.game._applyAircraftOptions?.(id); } finally { this._inRebuild = false; }
    this._registerOne(id);
    this.game.showroom?.radius.delete(id);
    this.stats.rebuilds++;
    this.stats.lastRebuildMs = +(performance.now() - t0).toFixed(1);
  }

  // The flown aircraft's exterior paint: the CPU copy of each canvas is let
  // go once the GPU has it (a context loss rebuilds the aircraft).
  // (Only where parked paint keeps full resolution — 'high': elsewhere the
  // flown aircraft keeps its copy so that, parked again, it is shrunk in
  // place instead of being built again.)
  releaseAfterUpload(id) {
    const ac = this.game.fleet?.[id];
    if (!ac?.model?.root || ac.headless || (PARKED_PAINT[this.tier] ?? 1) < 1) return;
    const foreign = this._foreignCanvases(id);
    for (const t of aircraftTextures(ac).exterior) {
      const c = t.image;
      if (!c || typeof c.getContext !== 'function' || c.width * c.height < 256 * 256 || foreign.has(c) || t.userData.cpuReleased) continue;
      t.onUpdate = () => {
        t.onUpdate = null;
        releaseCanvas(c);
        t.userData.cpuReleased = true;
        this.stats.released++;
      };
    }
  }

  // An option (paint, kit, marks) made new canvases for this aircraft.
  afterOptions(id) {
    if (this._inRebuild) return;
    if (this.light.has(id)) this.lighten(id); else this.releaseAfterUpload(id);
  }

  // After a context loss: every aircraft built again (its GPU copies are
  // gone, some of its CPU copies were released), then frozen / lightened as
  // before.
  async rebuildAll() {
    for (const id of Object.keys(this.game.fleet ?? {})) {
      const ac = this.game.fleet[id];
      if (ac.headless) continue;
      const light = this.light.has(id);
      this._rebuild(id);
      if (light) this.lighten(id); else this.releaseAfterUpload(id);
      if (ac !== this.game.aircraft) this.freeze(id);
      await new Promise((r) => setTimeout(r, 0));
    }
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
  // One aircraft again (its model was rebuilt).
  _registerOne(id) {
    const ac = this.game.fleet[id];
    const e = this.entries.get(id);
    const ck = this._cockpitOnly(id, ac, this._owners());
    if (e) { e.cockpitOnly = ck; e.state = 'live'; e.merged = e.saved = null; } else this.entries.set(id, { id, ac, state: 'live', cockpitOnly: ck, merged: null, saved: null });
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
    for (const [id, e] of this.entries) out[id] = { state: e.state, light: this.light.has(id), mergedMeshes: e.merged?.holder.children.length ?? 0 };
    return { ...this.stats, tier: this.tier, aircraft: out };
  }
}
