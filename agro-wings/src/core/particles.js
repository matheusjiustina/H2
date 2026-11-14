// CPU-simulated particle pools rendered as soft point sprites.
// Used for spray mist (fine, translucent, wind-driven) and wheel/prop dust.
import * as THREE from 'three';
import { makeSoftDot } from './textures.js';

const VS = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = aSize * uScale / max(0.5, -mvPosition.z);
  // Fade sprites that get huge on screen (camera inside the cloud); the
  // fully faded ones are not rasterised at all (a spray cloud blown back
  // over the chase camera would otherwise fill the screen many times over).
  vAlpha = aAlpha * (1.0 - smoothstep(180.0, 420.0, gl_PointSize));
  gl_PointSize = vAlpha > 0.0 ? min(gl_PointSize, 420.0) : 0.0;
  vColor = aColor;
  #include <fog_vertex>
}`;
const FS = /* glsl */ `
uniform sampler2D uTex;
varying float vAlpha;
varying vec3 vColor;
#include <fog_pars_fragment>
void main() {
  float a = texture2D(uTex, gl_PointCoord).a * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class ParticlePool {
  constructor(max, { blending = THREE.NormalBlending, renderOrder = 20 } = {}) {
    this.max = max;
    this.count = 0;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.col = new Float32Array(max * 3);
    this.kind = new Uint8Array(max);
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('aSize', this.sizeAttr);
    g.setAttribute('aAlpha', this.alphaAttr);
    g.setAttribute('aColor', this.colAttr);
    g.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTex: { value: makeSoftDot() }, uScale: { value: 600 } }]),
      vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false, blending, fog: true,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
    this.limit = max;
  }

  setScale(viewportHeight, fovDeg) {
    this.material.uniforms.uScale.value = viewportHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  spawn(x, y, z, vx, vy, vz, o) {
    if (this.count >= this.limit) return;
    const i = this.count++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = 0;
    this.maxLife[i] = o.life;
    this.size0[i] = o.size;
    this.grow[i] = o.grow ?? 1;
    this.alpha0[i] = o.alpha ?? 0.3;
    this.drag[i] = o.drag ?? 1;
    this.grav[i] = o.gravity ?? 0;
    this.col[i * 3] = o.color[0]; this.col[i * 3 + 1] = o.color[1]; this.col[i * 3 + 2] = o.color[2];
    this.kind[i] = o.kind ?? 0;
  }

  // wind: THREE.Vector3; floor(x,z) -> y where particles die (crop top/ground).
  update(dt, wind, floor) {
    let n = this.count;
    for (let i = 0; i < n; i++) {
      this.life[i] += dt;
      const i3 = i * 3;
      let dead = this.life[i] >= this.maxLife[i];
      if (!dead) {
        const k = Math.min(1, this.drag[i] * dt);
        this.v[i3] += (wind.x - this.v[i3]) * k;
        this.v[i3 + 1] += (wind.y - this.grav[i] - this.v[i3 + 1]) * k;
        this.v[i3 + 2] += (wind.z - this.v[i3 + 2]) * k;
        this.p[i3] += this.v[i3] * dt;
        this.p[i3 + 1] += this.v[i3 + 1] * dt;
        this.p[i3 + 2] += this.v[i3 + 2] * dt;
        if (floor) {
          const fy = floor(this.p[i3], this.p[i3 + 2]);
          if (this.p[i3 + 1] < fy) {
            if (this.kind[i] === 1) dead = this.life[i] > this.maxLife[i] * 0.4 || this.p[i3 + 1] < fy - 0.6;
            else this.p[i3 + 1] = fy;
            if (this.kind[i] === 1) this.v[i3 + 1] *= 0.3;
          }
        }
      }
      if (dead) {
        n--;
        if (i !== n) this._move(n, i);
        i--;
      }
    }
    this.count = n;
    const pa = this.posAttr.array, sa = this.sizeAttr.array, aa = this.alphaAttr.array, ca = this.colAttr.array;
    for (let i = 0; i < n; i++) {
      const t = this.life[i] / this.maxLife[i];
      pa[i * 3] = this.p[i * 3]; pa[i * 3 + 1] = this.p[i * 3 + 1]; pa[i * 3 + 2] = this.p[i * 3 + 2];
      sa[i] = this.size0[i] * (1 + this.grow[i] * t);
      aa[i] = this.alpha0[i] * Math.min(1, t * 8) * (1 - t) * (1 - t * 0.3);
      ca[i * 3] = this.col[i * 3]; ca[i * 3 + 1] = this.col[i * 3 + 1]; ca[i * 3 + 2] = this.col[i * 3 + 2];
    }
    this.points.geometry.setDrawRange(0, n);
    this.posAttr.needsUpdate = this.sizeAttr.needsUpdate = this.alphaAttr.needsUpdate = this.colAttr.needsUpdate = true;
    if (n) {
      this.posAttr.clearUpdateRanges(); this.posAttr.addUpdateRange(0, n * 3);
      this.sizeAttr.clearUpdateRanges(); this.sizeAttr.addUpdateRange(0, n);
      this.alphaAttr.clearUpdateRanges(); this.alphaAttr.addUpdateRange(0, n);
      this.colAttr.clearUpdateRanges(); this.colAttr.addUpdateRange(0, n * 3);
    }
  }

  _move(from, to) {
    for (let k = 0; k < 3; k++) {
      this.p[to * 3 + k] = this.p[from * 3 + k];
      this.v[to * 3 + k] = this.v[from * 3 + k];
      this.col[to * 3 + k] = this.col[from * 3 + k];
    }
    this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from];
    this.size0[to] = this.size0[from]; this.grow[to] = this.grow[from];
    this.alpha0[to] = this.alpha0[from]; this.drag[to] = this.drag[from];
    this.grav[to] = this.grav[from]; this.kind[to] = this.kind[from];
  }

  clear() { this.count = 0; this.points.geometry.setDrawRange(0, 0); }
}
