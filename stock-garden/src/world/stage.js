import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { damp, ease, clamp, isCoarsePointer } from '../utils/math.js';

/**
 * Renderer + camera rig + render loop.
 * The camera is a narrow-FOV "miniature diorama" view that automatically
 * frames the farm for any viewport (desktop landscape or phone portrait).
 */
export class Stage {
  constructor(container) {
    this.container = container;
    this.coarse = isCoarsePointer();
    this.maxDpr = this.coarse ? 1.6 : 2;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(this.dpr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    // Shadows are refreshed every other frame: half the shadow-pass cost,
    // visually identical for slow swaying plants.
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    this.frame = 0;
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    this.renderer = renderer;
    this.canvas = renderer.domElement;

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.38;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 120);

    this.addLights();

    // Camera rig state
    this.rig = {
      target: new THREE.Vector3(0, 0.35, 0.2),
      azimuth: 0.52,
      elevation: 0.72,
      dist: 20,
      fitDist: 20,
      fitOffset: { x: 0, y: 0 },
      extraOffsetY: 0,
      extraOffsetYTarget: 0,
      intro: 1, // 0 → far, 1 → settled
      focus: new THREE.Vector3(),
      focusAmt: 0,
      focusTarget: 0,
      shake: 0,
      drift: 0,
    };
    this.fitPoints = [];

    this.updaters = new Set();
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.time = 0;
    this.frameTimes = [];
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this._v = new THREE.Vector3();

    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    window.visualViewport?.addEventListener('resize', this.onResize);
  }

  addLights() {
    const hemi = new THREE.HemisphereLight('#c4dcff', '#1a1510', 0.55);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight('#fff0dc', 2.1);
    key.position.set(-5.5, 11, 6.5);
    key.castShadow = true;
    key.shadow.mapSize.set(this.coarse ? 1024 : 2048, this.coarse ? 1024 : 2048);
    const sc = key.shadow.camera;
    sc.left = -7.5;
    sc.right = 7.5;
    sc.top = 6.5;
    sc.bottom = -6.5;
    sc.near = 2;
    sc.far = 30;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.025;
    key.shadow.radius = 3;
    this.scene.add(key);
    this.key = key;

    const rim = new THREE.DirectionalLight('#7fa6ff', 0.9);
    rim.position.set(6, 5, -8);
    this.scene.add(rim);
  }

  /** World-space points the camera must always keep in frame. */
  setFitPoints(points) {
    this.fitPoints = points;
    this.onResize();
  }

  get size() {
    return { w: this.container.clientWidth || window.innerWidth, h: this.container.clientHeight || window.innerHeight };
  }

  safeArea() {
    const { w } = this.size;
    const small = w < 640;
    return {
      top: small ? 64 : 76,
      bottom: small ? 70 : 54,
      side: small ? 18 : 40,
    };
  }

  placeCamera(dist) {
    const r = this.rig;
    const portrait = this.size.h > this.size.w;
    const az = portrait ? r.azimuth + 0.2 : r.azimuth;
    const el = portrait ? r.elevation + 0.16 : r.elevation;
    // intro: start higher, further, rotated
    const k = ease.inOutCubic(r.intro);
    const introAz = az - (1 - k) * 0.55;
    const introEl = el + (1 - k) * 0.28;
    const introDist = dist * (1 + (1 - k) * 0.55);

    const tgt = this._v.copy(r.target);
    let d = introDist;
    if (r.focusAmt > 0.0001) {
      tgt.lerp(r.focus, r.focusAmt * 0.35);
      d *= 1 - r.focusAmt * 0.09;
    }
    const drift = Math.sin(r.drift * 0.12) * 0.015;
    const cx = tgt.x + Math.sin(introAz + drift) * Math.cos(introEl) * d;
    const cy = tgt.y + Math.sin(introEl) * d;
    const cz = tgt.z + Math.cos(introAz + drift) * Math.cos(introEl) * d;
    this.camera.position.set(cx, cy, cz);
    if (r.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * r.shake;
      this.camera.position.y += (Math.random() - 0.5) * r.shake;
    }
    this.camera.lookAt(tgt);
    this.camera.updateMatrixWorld();
  }

  onResize() {
    const { w, h } = this.size;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.fit();
    this.onResizeCb?.(w, h);
  }

  /** Solve camera distance + pixel offset so fitPoints fill the safe area. */
  fit() {
    const { w, h } = this.size;
    const pts = h > w * 1.05 && this.fitPointsPortrait ? this.fitPointsPortrait : this.fitPoints;
    if (!pts.length) return;
    const safe = this.safeArea();
    const availW = w - safe.side * 2;
    const availH = h - safe.top - safe.bottom;
    const saveIntro = this.rig.intro;
    const saveFocus = this.rig.focusAmt;
    this.rig.intro = 1;
    this.rig.focusAmt = 0;
    this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    let dist = 20;
    let box;
    for (let i = 0; i < 3; i++) {
      this.placeCamera(dist);
      box = this.projectBox(pts, w, h);
      const s = Math.max((box.maxX - box.minX) / availW, (box.maxY - box.minY) / availH);
      dist *= s;
    }
    this.placeCamera(dist);
    box = this.projectBox(pts, w, h);
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    this.rig.fitDist = dist;
    this.rig.fitOffset.x = cx - w / 2;
    this.rig.fitOffset.y = cy - (safe.top + availH / 2);
    this.rig.intro = saveIntro;
    this.rig.focusAmt = saveFocus;
    this.applyViewOffset();
  }

  projectBox(pts, w, h) {
    const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (const p of pts) {
      this._v.copy(p).project(this.camera);
      const x = (this._v.x * 0.5 + 0.5) * w;
      const y = (-this._v.y * 0.5 + 0.5) * h;
      box.minX = Math.min(box.minX, x);
      box.maxX = Math.max(box.maxX, x);
      box.minY = Math.min(box.minY, y);
      box.maxY = Math.max(box.maxY, y);
    }
    return box;
  }

  applyViewOffset() {
    const { w, h } = this.size;
    const r = this.rig;
    this.camera.setViewOffset(w, h, r.fitOffset.x, r.fitOffset.y + r.extraOffsetY, w, h);
    this.camera.updateProjectionMatrix();
  }

  /** Micro-zoom toward a world point (harvest). amount 0..1 */
  focusOn(point, amount = 1) {
    this.rig.focus.copy(point);
    this.rig.focusTarget = amount;
  }

  /** World → CSS pixel coordinates. */
  project(point, out = { x: 0, y: 0, visible: true }) {
    const { w, h } = this.size;
    this._v.copy(point).project(this.camera);
    out.x = (this._v.x * 0.5 + 0.5) * w;
    out.y = (-this._v.y * 0.5 + 0.5) * h;
    out.visible = this._v.z < 1;
    return out;
  }

  pick(clientX, clientY, objects) {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(objects, false);
    return hits[0] ?? null;
  }

  onUpdate(fn) {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  start() {
    const loop = (ts) => {
      requestAnimationFrame(loop);
      this.timer.update(ts);
      // rAF timestamps can precede the timer start: never let dt go negative.
      const dt = Math.min(Math.max(this.timer.getDelta(), 0), 1 / 20);
      if (this.paused) return;
      this.time += dt;
      this.tick(dt);
    };
    requestAnimationFrame(loop);
  }

  /** Advance one frame. Public so tests can step the game deterministically. */
  step(dt = 1 / 60, render = true) {
    this.time += dt;
    this.tick(dt, render);
  }

  tick(dt, render = true) {
    const r = this.rig;
    r.drift += dt;
    r.focusAmt = damp(r.focusAmt, r.focusTarget, 7, dt);
    r.shake = Math.max(0, r.shake - dt * 0.2);
    const prevExtra = r.extraOffsetY;
    r.extraOffsetY = damp(r.extraOffsetY, r.extraOffsetYTarget, 8, dt);
    if (Math.abs(prevExtra - r.extraOffsetY) > 0.01) this.applyViewOffset();
    this.placeCamera(r.fitDist);

    for (const fn of this.updaters) fn(dt, this.time);
    if (!render) return;
    this.frame++;
    if (this.frame % 2 === 0) this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
    this.adaptQuality(dt);
  }

  /** Lower the pixel ratio if the device can't hold a smooth frame rate. */
  adaptQuality(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 1 / 45 && this.dpr > 1) {
      this.dpr = clamp(this.dpr - 0.25, 1, this.maxDpr);
      this.renderer.setPixelRatio(this.dpr);
      this.onResize();
    }
  }
}
