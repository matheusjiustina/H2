// Main-menu showroom: the selected aircraft — the real model of the fleet,
// the same one that is flown — stands at the farm's pad in front of the
// hangar and the menu camera frames it. Nothing here builds, changes or
// duplicates a model, a material or a physics value:
//
//  * framing: the orbit camera of the rig, its distance taken from the
//    model's own bounding box (an 18 m AT-802 and a 10 m R44 both fill the
//    stage), a 3/4 front view, eased to its target on every change; the
//    view is offset so the aircraft sits right of the side menu;
//  * premium aircraft that are not unlocked are never activated (the
//    access rule in Game stays the only one): the camera goes to the parked
//    aircraft where it already stands, to be looked at from outside;
//  * card thumbnails: each one rendered once from the aircraft itself (a
//    shallow clone of its scene graph — shared geometry and materials, no
//    copy of either), one per frame while the menu is up, redone when its
//    paint changes; nothing is rendered continuously.
import * as THREE from 'three';
import { clamp } from '../core/math.js';
import { BASE } from '../world/layout.js';

const TW = 320, TH = 180; // thumbnail size (CSS px of the drawing buffer region)

export class Showroom {
  constructor(game) {
    this.game = game;
    this.preview = null; // id of a locked aircraft being looked at, else null
    this.radius = new Map(); // id → bounding radius (m)
    this.thumbs = new Map(); // id → data URL
    this.queue = [];
    this.goal = { dist: 16, pitch: 0.12 };
    this.active = false;
    this.user = false; // the player moved the camera: no easing back
  }

  // The aircraft on show: the previewed locked one, else the flown one.
  get id() { return this.preview ?? this.game.aircraftId; }
  get target() { return this.game.fleet[this.id] ?? this.game.aircraft; }

  _radius(id) {
    if (!this.radius.has(id)) {
      const root = this.game.fleet[id].model.root;
      const b = new THREE.Box3().setFromObject(root);
      const s = b.getSize(new THREE.Vector3());
      // Span, length and height, rotation-free: the diagonal of the two
      // largest horizontal sizes and the height.
      this.radius.set(id, Math.hypot(Math.max(s.x, s.z), Math.min(s.x, s.z) * 0.55, s.y) / 2);
    }
    return this.radius.get(id);
  }

  // Camera distance that fits the aircraft in the stage (the part of the
  // screen right of the menu, above the card strip).
  _fitDist(id) {
    const R = this._radius(id), cam = this.game.camera;
    const halfV = THREE.MathUtils.degToRad(55 / 2), halfH = Math.atan(Math.tan(halfV) * cam.aspect);
    const wide = this.game.uiRoot.clientWidth > 900;
    const dH = R / (Math.tan(halfH) * (wide ? 0.7 : 0.86)), dV = (R * 0.62) / (Math.tan(halfV) * 0.62);
    return clamp(Math.max(dH, dV), R * 1.3, 120);
  }

  enter() {
    this.active = true;
    this.frame(true);
    for (const id of Object.keys(this.game.fleet)) if (!this.thumbs.has(id) && !this.queue.includes(id)) this.queue.push(id);
  }
  leave() {
    this.active = false;
    this.preview = null;
    this.game.camera.clearViewOffset();
  }

  // Frame the aircraft on show (new selection, paint, resize, reset).
  frame(snap = false) {
    const g = this.game, ac = this.target;
    if (!ac) return;
    g.rig.setMode('orbit', ac);
    // 3/4 front (the rig's own orbit starts behind the wing): ~55° off the
    // nose, on the side the pad faces.
    // Of the two sides, the one that puts the hangar behind the aircraft.
    const f = ac.forward(new THREE.Vector3()), h = Math.atan2(f.x, f.z), p = ac.rPos;
    const away = Math.atan2(p.x - BASE.hangar.x, p.z - BASE.hangar.z); // from the hangar through the aircraft
    const opts = [h + Math.PI * 0.3, h - Math.PI * 0.3];
    const off = (a) => Math.abs(Math.atan2(Math.sin(a - away), Math.cos(a - away)));
    g.rig.orbit.yaw = off(opts[0]) <= off(opts[1]) ? opts[0] : opts[1];
    this.goal.dist = this._fitDist(this.id);
    this.goal.pitch = ac.kind === 'heli' ? 0.16 : 0.12;
    this.user = false;
    if (snap) { g.rig.orbit.dist = this.goal.dist; g.rig.orbit.pitch = this.goal.pitch; }
  }

  // Select a locked aircraft to look at (null: back to the flown one).
  setPreview(id) {
    this.preview = id && id !== this.game.aircraftId ? id : null;
    const t = this.target;
    if (t) { t.model.root.visible = true; if (t.contactShadow) t.contactShadow.visible = true; }
    this.flash();
    this.frame();
  }

  flash() {
    const el = this.game.screens?.title?.querySelector('.sr-fade');
    if (!el) return;
    el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  }

  // Per frame while the menu is up: ease the camera, keep the user's orbit
  // inside sane limits (never under the ground, never inside the aircraft).
  update(dt, mouse) {
    const o = this.game.rig.orbit, R = this._radius(this.id);
    if (mouse && ((mouse.buttons & 1) || mouse.wheel)) this.user = true;
    if (!this.user) {
      const k = 1 - Math.exp(-4 * dt);
      o.dist += (this.goal.dist - o.dist) * k;
      o.pitch += (this.goal.pitch - o.pitch) * k;
    }
    o.dist = clamp(o.dist, R * 1.25, Math.max(R * 4.5, this.goal.dist));
    o.pitch = clamp(o.pitch, 0.03, 1.1);
    this._viewOffset();
  }

  // Shift the picture right (desktop: past the side menu) and up (above the
  // card strip) without moving the camera: no distortion of the aircraft.
  _viewOffset() {
    const cam = this.game.camera, W = this.game.uiRoot.clientWidth || 1, H = this.game.uiRoot.clientHeight || 1;
    const wide = W > 900;
    cam.setViewOffset(W, H, wide ? -W * 0.09 : -W * 0.05, H * (wide ? 0.1 : 0.06), W, H);
  }

  // Thumbnails, rendered before the frame's own render (which then draws
  // over the corner used): one per call.
  beforeRender() {
    if (!this.active || !this.queue.length || !this.game.screens?.title?.classList.contains('show')) return;
    const id = this.queue.shift();
    try { this.thumbs.set(id, this._thumb(id)); } catch (e) { console.warn('thumbnail', id, e); return; }
    for (const img of this.game.screens.title.querySelectorAll(`[data-ac="${id}"] img`)) { img.src = this.thumbs.get(id); img.classList.add('on'); }
  }
  invalidate(id) {
    this.thumbs.delete(id);
    if (!this.queue.includes(id)) this.queue.unshift(id);
  }

  _thumbScene() {
    if (this.ts) return this.ts;
    const scene = new THREE.Scene();
    const c = document.createElement('canvas'); c.width = 4; c.height = 64;
    const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, '#7fa6c8'); gr.addColorStop(0.62, '#c9d6dc'); gr.addColorStop(0.66, '#9c7a5a'); gr.addColorStop(1, '#5c4330');
    x.fillStyle = gr; x.fillRect(0, 0, 4, 64);
    const bg = new THREE.CanvasTexture(c); bg.colorSpace = THREE.SRGBColorSpace;
    scene.background = bg;
    scene.add(new THREE.HemisphereLight(0xe4eef6, 0x6e5a44, 1.5));
    const sun = new THREE.DirectionalLight(0xfff2de, 2.6); sun.position.set(6, 9, 7); scene.add(sun);
    const cam = new THREE.PerspectiveCamera(30, TW / TH, 0.1, 200);
    this.ts = { scene, cam };
    return this.ts;
  }

  _thumb(id) {
    const g = this.game, r = g.renderer, { scene, cam } = this._thumbScene();
    scene.environment = g.scene.environment;
    const clone = g.fleet[id].model.root.clone(true);
    clone.position.set(0, 0, 0); clone.quaternion.identity(); clone.visible = true;
    scene.add(clone);
    clone.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(clone), ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const R = Math.hypot(size.x, size.z) / 2;
    // 3/4 front from the left (body frame: +Z nose, +X left wing).
    const dir = new THREE.Vector3(0.95, 0.42, 1.0).normalize();
    cam.position.copy(ctr).addScaledVector(dir, R / Math.sin(THREE.MathUtils.degToRad(15)) * 0.43);
    cam.lookAt(ctr.x, ctr.y - size.y * 0.05, ctr.z);
    cam.updateProjectionMatrix();
    const pr = r.getPixelRatio(), full = r.getSize(new THREE.Vector2());
    const out = document.createElement('canvas'); out.width = TW; out.height = TH;
    r.setScissorTest(true);
    r.setViewport(0, 0, TW, TH); r.setScissor(0, 0, TW, TH);
    r.clear();
    r.render(scene, cam);
    out.getContext('2d').drawImage(r.domElement, 0, r.domElement.height - TH * pr, TW * pr, TH * pr, 0, 0, TW, TH);
    r.setScissorTest(false);
    r.setViewport(0, 0, full.x, full.y);
    scene.remove(clone);
    return out.toDataURL('image/jpeg', 0.86);
  }
}
