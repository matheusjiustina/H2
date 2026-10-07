import * as THREE from 'three';
import { FullscreenPass } from './PostProcessing.js';

const MAX_DROPS = 16;
// hard bounds of the simulated state; real ripples stay far inside them
const MAX_H = 1.2, MAX_V = 0.6;

// Each texel is read exactly (texelFetch on integer coordinates): no filtering or
// sub-texel rounding can leak into the update, which behaves the same on every GPU.
// Every value read is checked, and the result is clamped, so a bad sample (NaN, Inf,
// a driver quirk) can never grow into the runaway waves it used to.
const SIM_FRAG = /* glsl */ `
uniform sampler2D tPrev;
uniform ivec2 uShift; // whole texels the area moved since the last step
uniform int uSize;
uniform vec4 uDrops[${MAX_DROPS}]; // uv.x, uv.y, radius(uv), strength
uniform int uDropCount;
uniform float uDamping;
uniform float uFoamDecay;
varying vec2 vUv;

vec3 cell(ivec2 p) {
  if (p.x < 0 || p.y < 0 || p.x >= uSize || p.y >= uSize) return vec3(0.0);
  vec3 s = texelFetch(tPrev, p, 0).rgb;
  if (!(abs(s.r) <= ${MAX_H.toFixed(2)})) s.r = 0.0;
  if (!(abs(s.g) <= ${MAX_V.toFixed(2)})) s.g = 0.0;
  if (!(s.b >= 0.0 && s.b <= 1.0)) s.b = 0.0;
  return s;
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) + uShift;
  vec3 s = cell(p);
  float h = s.r, v = s.g, foam = s.b;
  float avg = (cell(p + ivec2(-1, 0)).r + cell(p + ivec2(1, 0)).r + cell(p + ivec2(0, -1)).r + cell(p + ivec2(0, 1)).r) * 0.25;
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
  vec2 e = smoothstep(vec2(0.0), vec2(0.08), vUv) * (1.0 - smoothstep(vec2(0.92), vec2(1.0), vUv));
  float edge = e.x * e.y;
  h = clamp(h * mix(0.92, 1.0, edge), -${MAX_H.toFixed(2)}, ${MAX_H.toFixed(2)});
  v = clamp(v * mix(0.9, 1.0, edge), -${MAX_V.toFixed(2)}, ${MAX_V.toFixed(2)});
  gl_FragColor = vec4(h, v, clamp(foam * edge, 0.0, 1.0), 1.0);
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
      uSize: { value: size },
      uShift: { value: new THREE.Vector2() },
      uDrops: { value: Array.from({ length: MAX_DROPS }, () => new THREE.Vector4()) },
      uDropCount: { value: 0 },
      uDamping: { value: 0.988 },
      uFoamDecay: { value: 0.985 },
    });
    this.center = new THREE.Vector2(); // where the area is centred now
    this.texCenter = new THREE.Vector2(); // where the texture's content is centred (after the last step)
    this.pendingShift = new THREE.Vector2(); // whole texels not yet applied to the texture
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
    this.pass.uniforms.uSize.value = size;
    this.uniforms.uRippleArea.value.w = 1 / size;
    this.pendingShift.set(0, 0);
    this.texCenter.copy(this.center);
    this._clear();
  }

  /** Disturb the water at world position (x,z). radius in metres, strength ~0.02..0.4 */
  addDrop(x, z, radius = 0.4, strength = 0.1) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius) || !Number.isFinite(strength)) return;
    const half = this.area / 2;
    if (Math.abs(x - this.center.x) > half || Math.abs(z - this.center.y) > half) return;
    if (this.drops.length >= MAX_DROPS) this.drops.shift();
    this.drops.push([x, z, Math.min(Math.max(radius, 0.05), 4), Math.min(Math.max(strength, -0.5), 0.5)]);
  }

  update(dt, focusX, focusZ) {
    // recentre in whole texels when the focus drifts away
    const texel = this.area / this.size;
    const dx = focusX - this.center.x, dz = focusZ - this.center.y;
    if (Math.abs(dx) > this.area * 0.12 || Math.abs(dz) > this.area * 0.12) {
      const nx = Math.round(dx / texel), nz = Math.round(dz / texel);
      this.center.x += nx * texel;
      this.center.y += nz * texel;
      this.pendingShift.x += nx;
      this.pendingShift.y += nz;
      // a jump bigger than the area (teleport, respawn) starts from calm water
      if (Math.abs(this.pendingShift.x) >= this.size || Math.abs(this.pendingShift.y) >= this.size) {
        this.pendingShift.set(0, 0);
        this.drops.length = 0;
        this.texCenter.copy(this.center);
        this._clear();
      }
    }
    this.acc = Math.min(this.acc + dt, 0.1);
    const step = 1 / 60;
    let first = true;
    while (this.acc >= step) {
      this.acc -= step;
      this._step(first);
      first = false;
    }
    // the water samples the texture where its content actually is: a recentre only takes
    // effect with the step that shifts the content
    this.uniforms.uRippleArea.value.set(this.texCenter.x, this.texCenter.y, this.area, 1 / this.size);
  }

  _step(withDrops) {
    const u = this.pass.uniforms;
    u.tPrev.value = this.rtA.texture;
    u.uShift.value.copy(this.pendingShift);
    this.pendingShift.set(0, 0);
    this.texCenter.copy(this.center);
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
