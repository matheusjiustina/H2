import * as THREE from 'three';
import { U, GLSL_UNIFORMS, GLSL_COMMON, LAYER } from '../core/Shared.js';

const STREAK_VERT = /* glsl */ `
${GLSL_UNIFORMS}
${GLSL_COMMON}
attribute vec4 aSeed;
uniform float uBox;
uniform float uHeightRange;
uniform float uCount;
varying float vAlpha;
varying float vAlong;
void main() {
  // instances beyond the current rain amount collapse
  float act = step(aSeed.w, uRain);
  float speed = 9.0 + aSeed.z * 3.0;
  vec3 cam = cameraPosition;
  vec2 xz = mod(aSeed.xy * uBox - cam.xz, uBox) - uBox * 0.5 + cam.xz;
  float y = cam.y - 8.0 + fract(aSeed.z * 7.13 - uTime * speed / uHeightRange) * uHeightRange;
  vec2 wind = uWind.xy * uWind.z * 5.5;
  vec3 vel = vec3(wind.x, -speed, wind.y);
  // slant the column with the wind so drops travel diagonally
  xz += wind * ((y - cam.y) / speed);
  vec3 p = vec3(xz.x, y, xz.y);
  // occlusion: terrain, water and the camp roof
  float th = terrainData(p.xz).r;
  float hide = step(p.y, th + 0.02) + step(p.y, uWaterLevel) + (1.0 - shelterMask(vec3(p.x, min(p.y, uShelterY.y - 0.1), p.z))) * step(p.y, uShelterY.y + 0.2);
  act *= 1.0 - clamp(hide, 0.0, 1.0);
  vec3 dir = normalize(vel);
  vec3 toCam = normalize(cam - p);
  vec3 side = normalize(cross(dir, toCam));
  float len = 0.32 + aSeed.z * 0.25;
  float width = 0.0055;
  vec3 wp = p + side * position.x * width * act + dir * position.y * len * act;
  vAlpha = act * (0.5 + aSeed.z * 0.5) * (1.0 - smoothstep(10.0, 16.0, length(p - cam)));
  vAlong = position.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const STREAK_FRAG = /* glsl */ `
${GLSL_UNIFORMS}
varying float vAlpha;
varying float vAlong;
void main() {
  if (vAlpha < 0.01) discard;
  float a = vAlpha * smoothstep(0.0, 0.25, vAlong) * smoothstep(1.0, 0.6, vAlong) * 0.32;
  vec3 col = uAmbient * 1.4 + uSunColor * 0.05 + vec3(0.6, 0.65, 0.75) * uLightning;
  gl_FragColor = vec4(col, a);
}`;

const SPLASH_VERT = /* glsl */ `
${GLSL_UNIFORMS}
${GLSL_COMMON}
attribute vec4 aSeed;
varying float vAlpha;
varying vec2 vUv;
void main() {
  float rate = 1.6 + aSeed.z;
  float cyc = uTime * rate + aSeed.w * 13.0;
  float t = fract(cyc);
  float id = floor(cyc);
  vec2 h = w_hash22(aSeed.xy * 97.0 + id * 1.37);
  float ang = h.x * 6.2831, rad = sqrt(h.y) * 14.0;
  vec2 xz = cameraPosition.xz + vec2(cos(ang), sin(ang)) * rad;
  float th = terrainData(xz).r;
  float y = max(th, uWaterLevel) + 0.02;
  float act = step(aSeed.w, uRain) * step(t, 0.18) * shelterMask(vec3(xz.x, y, xz.y));
  float s = (0.04 + t * 0.5) * act;
  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 wp = vec3(xz.x, y, xz.y) + camRight * position.x * s + vec3(0.0, 1.0, 0.0) * (position.y * 0.5 + 0.5) * s * 0.7;
  vAlpha = act * (1.0 - t / 0.18);
  vUv = position.xy;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const SPLASH_FRAG = /* glsl */ `
${GLSL_UNIFORMS}
varying float vAlpha;
varying vec2 vUv;
void main() {
  if (vAlpha < 0.01) discard;
  float r = length(vec2(vUv.x, vUv.y * 0.6 + 0.4));
  float crown = smoothstep(0.9, 0.6, r) * smoothstep(0.2, 0.55, r);
  gl_FragColor = vec4(uAmbient * 1.5, crown * vAlpha * 0.5);
}`;

/** World-space GPU rain: streaks, surface splashes. Zero per-frame CPU cost. */
export class Rain {
  constructor(scene, quality = 'high') {
    this.group = new THREE.Group();
    scene.add(this.group);
    const count = quality === 'low' ? 3500 : quality === 'medium' ? 7000 : 12000;
    this.streaks = this._instanced(count, STREAK_VERT, STREAK_FRAG, [-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], { uBox: { value: 30 }, uHeightRange: { value: 20 }, uCount: { value: count } });
    this.splashes = this._instanced(quality === 'low' ? 400 : 1100, SPLASH_VERT, SPLASH_FRAG, [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], {});
  }

  _instanced(n, vs, fs, quad, extra) {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(quad, 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const seeds = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      seeds[i * 4] = Math.random();
      seeds[i * 4 + 1] = Math.random();
      seeds[i * 4 + 2] = Math.random();
      seeds[i * 4 + 3] = (i / n) * 0.98 + 0.01; // activation threshold vs rain amount
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = n;
    const mat = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms: { ...U, ...extra }, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.layers.set(LAYER.FX);
    mesh.renderOrder = 20;
    this.group.add(mesh);
    return mesh;
  }

  update() {
    const on = U.uRain.value > 0.01 && U.uUnderwater.value < 0.5;
    this.streaks.visible = on;
    this.splashes.visible = on;
  }
}
