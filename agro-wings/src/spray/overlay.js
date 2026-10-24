// Coverage visualisation: small canvases per field (used by the GPS, the map
// and the minimap) and an optional 3D overlay draped over the canopy.
import * as THREE from 'three';
import { SPRAY } from '../config.js';
import { cropHeight } from '../world/layout.js';

function doseColor(d, out) {
  const [lo, hi] = SPRAY.doseGood;
  if (d < 0.05) { out[0] = 200; out[1] = 50; out[2] = 40; out[3] = 120; return; }
  if (d < lo) { const t = d / lo; out[0] = 230; out[1] = 120 + 80 * t; out[2] = 40; out[3] = 190; return; }
  if (d <= hi) { out[0] = 70; out[1] = 200; out[2] = 90; out[3] = 200; return; }
  out[0] = 150; out[1] = 80; out[2] = 220; out[3] = 210;
}

export class CoverageOverlay {
  constructor(game) {
    this.game = game;
    this.items = new Map(); // cov -> {canvas, ctx, img, version, mesh, tex}
    this.visible = false;
    this.group = new THREE.Group();
    this.group.name = 'coverageOverlay';
    this.group.visible = false;
    game.scene.add(this.group);
    this._c = [0, 0, 0, 0];
  }

  _item(cov) {
    let it = this.items.get(cov);
    if (it) return it;
    const c = document.createElement('canvas');
    c.width = cov.nx; c.height = cov.nz;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(cov.nx, cov.nz);
    it = { canvas: c, ctx, img, version: -1, mesh: null, tex: null };
    this.items.set(cov, it);
    return it;
  }

  canvasFor(cov) {
    const it = this._item(cov);
    if (it.version !== cov.version) this._paint(cov, it);
    return it.canvas;
  }

  _paint(cov, it) {
    const d = it.img.data;
    const c = this._c;
    for (let i = 0; i < cov.dose.length; i++) {
      doseColor(cov.dose[i], c);
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = c[3];
    }
    it.ctx.putImageData(it.img, 0, 0);
    it.version = cov.version;
    if (it.tex) it.tex.needsUpdate = true;
  }

  _mesh(cov) {
    const it = this._item(cov);
    if (it.mesh) return it.mesh;
    const f = cov.f;
    const terrain = this.game.world.terrain;
    const step = 8;
    const nx = Math.ceil((f.x1 - f.x0) / step) + 1, nz = Math.ceil((f.z1 - f.z0) / step) + 1;
    const pos = [], uv = [], idx = [];
    const h = cropHeight(f) + 0.25;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = Math.min(f.x1, f.x0 + i * step), z = Math.min(f.z1, f.z0 + j * step);
      pos.push(x, terrain.heightAt(x, z) + h, z);
      uv.push((x - f.x0) / (f.x1 - f.x0), 1 - (z - f.z0) / (f.z1 - f.z0));
    }
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, d = a + 1, b = a + nx, c = b + 1;
      idx.push(a, b, d, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    it.tex = new THREE.CanvasTexture(it.canvas);
    it.tex.colorSpace = THREE.SRGBColorSpace;
    it.tex.magFilter = THREE.NearestFilter;
    it.tex.flipY = true;
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: it.tex, transparent: true, opacity: 0.75, depthWrite: false, fog: false }));
    m.renderOrder = 4;
    it.mesh = m;
    this.group.add(m);
    return m;
  }

  setVisible(v, coverages) {
    this.visible = v;
    this.group.visible = v;
    if (v) for (const cov of coverages) { this._mesh(cov); this.canvasFor(cov); }
    for (const [cov, it] of this.items) if (it.mesh) it.mesh.visible = coverages.includes(cov);
  }

  update(coverages) {
    if (!this.visible) return;
    for (const cov of coverages) this.canvasFor(cov);
  }
}
