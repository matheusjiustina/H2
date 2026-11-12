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
import { buildCabinProxy } from './cabinProxy.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { memoryTier, PARKED_PAINT, aircraftTextures, releaseCanvas, shrinkCanvas, rebuildModel } from './aircraftMemory.js';

const _inv = new THREE.Matrix4(), _m = new THREE.Matrix4(), _n = new THREE.Matrix3();
// Stand-in for the released originals of a parked shell (never drawn).
const EMPTY = new THREE.BufferGeometry();
EMPTY.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
const geoBytes = (g) => { let b = 0; for (const k in g.attributes) b += g.attributes[k].array?.byteLength ?? 0; return b + (g.index?.array.byteLength ?? 0); };
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
    this.stats = { merges: 0, thaws: 0, gpuReleases: 0, lastMergeMs: 0, rebuilds: 0, lightened: 0, released: 0, lastRebuildMs: 0, shells: 0, shellMB: 0, softParks: 0 };
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
    // Full-resolution parked paint ('high'): its CPU copy goes once uploaded.
    if (scale >= 1) this.releaseAfterUpload(id);
    // Cockpit and pilot meshes: hidden while parked, built again with the
    // whole aircraft when it is selected — their geometry is let go now.
    // The cabin stand-in outlives the cockpit it is measured from.
    if (ac.model.cabinProxy === undefined && ac.model.cockpit?.children.length) ac.model.cabinProxy = buildCabinProxy(ac.model.root, ac.model.cockpit, ac.model.pilot) ?? null;
    for (const sub of [ac.model.cockpit, ac.model.pilot]) {
      if (!sub?.isObject3D || !sub.children.length) continue;
      sub.traverse((o) => o.geometry?.dispose());
      sub.clear();
    }
    this.light.add(id);
    this.stats.lightened++;
    if (this.entries.get(id)?.state === 'frozen') this._shell(id);
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
    const st = this.entries.get(id)?.state;
    if (st === 'frozen' || st === 'soft') this.thaw(id, true);
    rebuildModel(ac, this._foreignCanvases(id), { gpu: !this._afterLoss });
    this._inRebuild = true;
    try { this.game._applyAircraftOptions?.(id); } finally { this._inRebuild = false; }
    this._registerOne(id);
    this.game.showroom?.radius.delete(id);
    this.stats.rebuilds++;
    this.stats.lastRebuildMs = +(performance.now() - t0).toFixed(1);
  }

  // Phase 04 — the selected aircraft's cockpit is prepared ahead (it is
  // hidden from outside): its shader programs compiled and its own textures
  // (panel canvas, dials…) uploaded right after the selection, so the first
  // cockpit frame does not pay for them. Nothing is drawn or changed.
  prepareCockpit(id) {
    const g = this.game, ac = g.fleet?.[id], ck = ac?.model?.cockpit, r = g.renderer;
    if (!ck?.isObject3D || ac.headless || !r?.compile || this.game.lifecycle?.suspended) return null;
    const t0 = performance.now();
    const done = () => {
      if (g.fleet?.[id] !== ac || ac.model.cockpit !== ck) return;
      for (const t of aircraftTextures(ac).cockpit) if (!t.userData.cpuReleased && t.image) r.initTexture(t);
      // One off-screen frame (32 px) with the cockpit shown, from a camera
      // just behind the aircraft: its buffers and textures go to the GPU now.
      if (g.cameraMode !== 'cockpit') {
        const rt = (this._warmRT ??= new THREE.WebGLRenderTarget(32, 32));
        const cam = (this._warmCam ??= new THREE.PerspectiveCamera(60, 1, 0.05, 200));
        const p = ac.model.root.getWorldPosition(new THREE.Vector3());
        cam.position.set(p.x + 6, p.y + 3, p.z + 6); cam.lookAt(p); cam.updateMatrixWorld();
        const vis = ck.visible, prev = r.getRenderTarget();
        ck.visible = true;
        try { r.setRenderTarget(rt); r.render(g.scene, cam); } finally { r.setRenderTarget(prev); ck.visible = vis; }
      }
      this.stats.cockpitPrepMs = +(performance.now() - t0).toFixed(0);
      this.stats.cockpitPreps = (this.stats.cockpitPreps ?? 0) + 1;
    };
    // (the whole aircraft: some cockpit parts hang outside the cockpit group)
    const p = r.compileAsync ? r.compileAsync(ac.model.root, g.camera, g.scene) : Promise.resolve(r.compile(ac.model.root, g.camera, g.scene));
    return p.then(done).catch(() => {});
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
    this._afterLoss = true;
    try { await this._rebuildAll(); } finally { this._afterLoss = false; }
  }
  async _rebuildAll() {
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
    if (e) { e.cockpitOnly = ck; e.state = 'live'; e.shell = false; e.merged = e.saved = null; } else this.entries.set(id, { id, ac, state: 'live', cockpitOnly: ck, merged: null, saved: null });
  }

  // Freeze a parked aircraft (call after park()).
  freeze(id) {
    const e = this.entries.get(id);
    if (!e || e.state === 'frozen') return false;
    if (e.state === 'soft') return this._refreeze(e);
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
    if (this.light.has(id)) this._shell(id);
    return true;
  }

  // Phase 04 — parked SHELL. A parked aircraft that is light (it is rebuilt
  // from its type when selected, aircraftMemory.js) only ever shows its
  // baked copy: the hidden originals beside it are let go (CPU arrays, and
  // GPU buffers when it had been flown). Geometries any other mesh of the
  // scene still uses are left alone. What is drawn does not change.
  _shell(id) {
    const e = this.entries.get(id);
    if (!e || e.state !== 'frozen' || e.shell) return false;
    const drop = new Set();
    for (const o of e.saved.hidden) if (o.geometry && o.geometry !== EMPTY) { drop.add(o.geometry); o.geometry = EMPTY; }
    // Meshes already hidden at bake time (spray kit off, the other paint
    // scheme's parts, …) go too: a shell is rebuilt from its type on any
    // option change (refresh). Visibility is judged below the root only (the
    // root itself is hidden by the distance cull of far parked aircraft).
    const root = e.ac.model.root, holder = e.merged.holder;
    e.offs = [];
    const walk = (o, vis) => {
      // LOD levels switch with the camera (a fine level hidden now is shown
      // up close): left alone, beyond what the bake already holds.
      if (o === holder || o.isLOD) return;
      const v = vis && o.visible;
      if (!v && o.geometry && o.geometry !== EMPTY && (o.isMesh || o.isLine || o.isPoints)) { drop.add(o.geometry); o.geometry = EMPTY; e.offs.push(o); }
      for (const c of o.children) walk(c, v);
    };
    for (const c of root.children) walk(c, true);
    const inUse = new Set();
    this.game.scene.traverse((o) => { if (o.geometry) inUse.add(o.geometry); });
    let bytes = 0;
    for (const g of drop) {
      if (inUse.has(g)) continue;
      bytes += geoBytes(g);
      if (!this._afterLoss) g.dispose();
    }
    e.shell = true;
    this.stats.shells++;
    this.stats.shellMB = +(this.stats.shellMB + bytes / 1048576).toFixed(1);
    return true;
  }

  // Re-park of a shell (soft thaw → park() → freeze): the baked copy is kept
  // (same pose — a parked aircraft always settles the same way), only the
  // root's matrices are computed again for the new spot.
  _refreeze(e) {
    const root = e.ac.model.root;
    for (const o of e.saved.hidden) o.visible = false; // park() may have shown a part again
    for (const o of e.offs ?? []) o.visible = false;
    for (const o of e.saved.autos) o.matrixAutoUpdate = false;
    root.updateMatrixWorld(true);
    root.updateMatrixWorld = function () {};
    e.state = 'frozen';
    this.stats.softParks++;
    return true;
  }

  // Back to the original meshes (selection, option changes, re-parking).
  // A shell is only thawed softly (matrices free for re-parking, baked copy
  // kept) unless `full` (it is being rebuilt from its type: _rebuild).
  thaw(id, full = false) {
    const e = this.entries.get(id);
    if (!e || (e.state !== 'frozen' && e.state !== 'soft')) return false;
    const root = e.ac.model.root;
    if (e.state === 'frozen') {
      delete root.updateMatrixWorld;
      if (e.saved.ownUpdate) root.updateMatrixWorld = e.saved.ownUpdate;
      for (const o of e.saved.autos) o.matrixAutoUpdate = true;
    }
    if (e.shell && !full) { e.state = 'soft'; return true; }
    for (const o of e.saved.hidden) o.visible = true;
    root.remove(e.merged.holder);
    if (!this._afterLoss) for (const g of e.merged.geoms) g.dispose(); // (after a context loss they are gone already)
    e.merged = e.saved = null;
    e.state = 'live'; e.shell = false; e.offs = null;
    this.stats.thaws++;
    return true;
  }

  // An option changed meshes / materials of this aircraft: redo the bake.
  refresh(id) {
    const e = this.entries.get(id);
    if (e?.shell) {
      if (this._inRebuild) return;
      // meshes may change (kit, livery parts): built again from the type, light, baked
      this._rebuild(id); this.lighten(id); this.freeze(id);
      return;
    }
    if (this.thaw(id)) { this.freeze(id); }
  }
  refreshAll() { for (const id of this.entries.keys()) this.refresh(id); }

  report() {
    const out = {};
    for (const [id, e] of this.entries) out[id] = { state: e.state, light: this.light.has(id), shell: !!e.shell, mergedMeshes: e.merged?.holder.children.length ?? 0 };
    return { ...this.stats, tier: this.tier, aircraft: out };
  }
}
