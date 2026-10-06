import * as THREE from 'three';
import { FullscreenPass } from './PostProcessing.js';

const MAX_DROPS = 16;

const SIM_FRAG = /* glsl */ `
uniform sampler2D tPrev;
uniform vec2 uTexel;
uniform vec2 uShift; // uv shift when the area recentres
uniform vec4 uDrops[${MAX_DROPS}]; // uv.x, uv.y, radius(uv), strength
uniform int uDropCount;
uniform float uDamping;
uniform float uFoamDecay;
varying vec2 vUv;
void main() {
  vec2 uv = vUv + uShift;
  vec4 s = texture2D(tPrev, uv);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) s = vec4(0.0);
  float h = s.r, v = s.g, foam = s.b;
  float l = texture2D(tPrev, uv - vec2(uTexel.x, 0.0)).r;
  float r = texture2D(tPrev, uv + vec2(uTexel.x, 0.0)).r;
  float d = texture2D(tPrev, uv - vec2(0.0, uTexel.y)).r;
  float u = texture2D(tPrev, uv + vec2(0.0, uTexel.y)).r;
  float avg = (l + r + d + u) * 0.25;
  v += (avg - h) * 0.9;
  v *= uDamping;
  h += v;
  h *= 0.9985;
  foam *= uFoamDecay;
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    if (i >= uDropCount) break;
    vec4 dr = uDrops[i];
    float dd = length(vUv - dr.xy) / dr.z;
    float m = exp(-dd * dd * 2.5);
    h -= dr.w * m;
    foam = min(1.0, foam + abs(dr.w) * m * 2.0);
  }
  // fade towards the border of the simulated area
  vec2 e = smoothstep(0.0, 0.08, vUv) * smoothstep(1.0, 0.92, vUv);
  float edge = e.x * e.y;
  gl_FragColor = vec4(h * mix(0.92, 1.0, edge), v * mix(0.9, 1.0, edge), foam * edge, 1.0);
}`;

/**
 * Small GPU wave-equation simulation centred on the player. Used for splashes,
 * wading, boat wakes and falling objects. The ocean shader samples its height.
 */
export class WaterRipples {
  constructor(renderer, { size = 256, area = 48 } = {}) {
    this.renderer = renderer;
    this.size = size;
    this.area = area;
    const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping };
    this.rtA = new THREE.WebGLRenderTarget(size, size, opts);
    this.rtB = new THREE.WebGLRenderTarget(size, size, opts);
    this.pass = new FullscreenPass(SIM_FRAG, {
      tPrev: { value: null },
      uTexel: { value: new THREE.Vector2(1 / size, 1 / size) },
      uShift: { value: new THREE.Vector2() },
      uDrops: { value: Array.from({ length: MAX_DROPS }, () => new THREE.Vector4()) },
      uDropCount: { value: 0 },
      uDamping: { value: 0.988 },
      uFoamDecay: { value: 0.985 },
    });
    this.center = new THREE.Vector2();
    this.pendingShift = new THREE.Vector2();
    this.drops = [];
    this.acc = 0;
    this.uniforms = {
      uRipples: { value: this.rtA.texture },
      uRippleArea: { value: new THREE.Vector4(0, 0, area, 1 / size) },
    };
    this._clear();
  }

  _clear() {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setClearColor(0x000000, 0);
    for (const rt of [this.rtA, this.rtB]) { r.setRenderTarget(rt); r.clear(true, false, false); }
    r.setRenderTarget(prev);
    r.setClearColor(0x000000, 1);
  }

  resize(size) {
    if (size === this.size) return;
    this.size = size;
    this.rtA.setSize(size, size);
    this.rtB.setSize(size, size);
    this.pass.uniforms.uTexel.value.set(1 / size, 1 / size);
    this.uniforms.uRippleArea.value.w = 1 / size;
    this._clear();
  }

  /** Disturb the water at world position (x,z). radius in metres, strength ~0.02..0.4 */
  addDrop(x, z, radius = 0.4, strength = 0.1) {
    const half = this.area / 2;
    if (Math.abs(x - this.center.x) > half || Math.abs(z - this.center.y) > half) return;
    if (this.drops.length >= MAX_DROPS) this.drops.shift();
    this.drops.push([x, z, radius, strength]);
  }

  update(dt, focusX, focusZ) {
    // recentre in whole texels when the focus drifts away
    const texel = this.area / this.size;
    const dx = focusX - this.center.x, dz = focusZ - this.center.y;
    if (Math.abs(dx) > this.area * 0.12 || Math.abs(dz) > this.area * 0.12) {
      const sx = Math.round(dx / texel) * texel, sz = Math.round(dz / texel) * texel;
      this.center.x += sx;
      this.center.y += sz;
      this.pendingShift.x += sx / this.area;
      this.pendingShift.y += sz / this.area;
    }
    this.acc = Math.min(this.acc + dt, 0.1);
    const step = 1 / 60;
    let first = true;
    while (this.acc >= step) {
      this.acc -= step;
      this._step(first);
      first = false;
    }
    this.uniforms.uRippleArea.value.set(this.center.x, this.center.y, this.area, 1 / this.size);
  }

  _step(withDrops) {
    const u = this.pass.uniforms;
    u.tPrev.value = this.rtA.texture;
    u.uShift.value.copy(this.pendingShift);
    this.pendingShift.set(0, 0);
    let n = 0;
    if (withDrops) {
      const half = this.area / 2;
      for (const d of this.drops) {
        u.uDrops.value[n].set((d[0] - this.center.x + half) / this.area, (d[1] - this.center.y + half) / this.area, Math.max(d[2] / this.area, 1.5 / this.size), d[3]);
        n++;
      }
      this.drops.length = 0;
    }
    u.uDropCount.value = n;
    const prev = this.renderer.getRenderTarget();
    this.pass.render(this.renderer, this.rtB);
    this.renderer.setRenderTarget(prev);
    const t = this.rtA; this.rtA = this.rtB; this.rtB = t;
    this.uniforms.uRipples.value = this.rtA.texture;
  }
}
