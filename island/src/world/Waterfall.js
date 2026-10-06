import * as THREE from 'three';
import { U, GLSL_UNIFORMS, GLSL_COMMON, LAYER } from '../core/Shared.js';
import { WATERFALL } from './Layout.js';

const FALL_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vN;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FALL_FRAG = /* glsl */ `
${GLSL_UNIFORMS}
${GLSL_COMMON}
uniform sampler2D uFoam;
uniform float uLayer;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vN;
void main() {
  float speed = 0.9 + uLayer * 0.35;
  vec2 uv = vec2(vUv.x * 2.2 + uLayer * 0.37, vUv.y * 1.2 - uTime * speed);
  float streak = texture2D(uFoam, vec2(uv.x, uv.y * 0.35)).g;
  float foam = texture2D(uFoam, uv * vec2(1.0, 0.6)).r;
  float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
  float a = clamp(streak * 0.7 + foam * 0.6 - 0.25 + vUv.y * 0.35, 0.0, 1.0) * edge;
  a *= smoothstep(0.0, 0.04, vUv.y) * (0.55 + uLayer * 0.35);
  vec3 V = normalize(cameraPosition - vWorld);
  float back = pow(max(dot(-V, normalize(uSunDir)), 0.0), 3.0);
  vec3 col = uAmbient * 1.25 + uSunColor * (max(uSunDir.y, 0.0) * 0.35 + back * 0.4) * cloudShadowAt(vWorld);
  col *= vec3(0.9, 0.97, 1.0);
  col = applyAtmosphere(col, vWorld);
  gl_FragColor = vec4(col, a);
}`;

const POOL_VERT = /* glsl */ `
${GLSL_UNIFORMS}
varying vec3 vWorld;
varying float vViewZ;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float d = length(wp.xz - vec2(${WATERFALL.x.toFixed(1)}, ${(WATERFALL.z + 10).toFixed(1)}));
  wp.y += sin(d * 3.0 - uTime * 6.0) * 0.015 * exp(-d * 0.25);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const POOL_FRAG = /* glsl */ `
${GLSL_UNIFORMS}
${GLSL_COMMON}
uniform sampler2D uRefraction;
uniform vec2 uResolution;
uniform sampler2D uNormalMap;
uniform sampler2D uFoam;
varying vec3 vWorld;
varying float vViewZ;
void main() {
  vec2 impact = vec2(${WATERFALL.x.toFixed(1)}, ${(WATERFALL.z + 10).toFixed(1)});
  float di = length(vWorld.xz - impact);
  vec2 n1 = texture2D(uNormalMap, vWorld.xz * 0.25 + vec2(0.0, uTime * 0.12)).xy * 2.0 - 1.0;
  vec2 n2 = texture2D(uNormalMap, vWorld.xz * 0.6 - vec2(uTime * 0.07, 0.0)).xy * 2.0 - 1.0;
  vec2 radial = normalize(vWorld.xz - impact + 1e-4) * sin(di * 4.0 - uTime * 7.0) * exp(-di * 0.3) * 0.6;
  vec2 det = (n1 * 0.6 + n2 * 0.4) * (0.35 + exp(-di * 0.2) * 1.2) + radial;
  if (uRain > 0.01) det += vec2(sin(vWorld.x * 30.0 + uTime * 9.0), cos(vWorld.z * 27.0 + uTime * 8.0)) * 0.08 * uRain;
  vec3 N = normalize(vec3(det.x, 1.0, det.y));
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec2 suv = gl_FragCoord.xy / uResolution;
  vec4 refr = texture2D(uRefraction, suv + N.xz * 0.03);
  if (refr.a < vViewZ) refr = texture2D(uRefraction, suv);
  float thick = max(refr.a - vViewZ, 0.0);
  vec3 T = exp(-vec3(0.5, 0.16, 0.13) * thick * 1.2);
  vec3 body = refr.rgb * T + vec3(0.02, 0.14, 0.12) * uAmbient * (1.0 - T);
  vec3 R = reflect(-V, N); R.y = abs(R.y);
  vec3 refl = skyWithClouds(R, vWorld) * 0.8;
  vec3 col = mix(body, refl, fres);
  vec3 H = normalize(V + normalize(uSunDir));
  col += uSunColor * pow(max(dot(N, H), 0.0), 220.0) * 0.6;
  float foam = smoothstep(0.35, 0.8, texture2D(uFoam, vWorld.xz * 0.35 + vec2(0.0, uTime * 0.05)).r + exp(-di * 0.35) * 0.9) * exp(-di * 0.18);
  col = mix(col, uAmbient * 1.2 + uSunColor * 0.2, foam * 0.85);
  col = mix(refr.rgb, col, smoothstep(0.0, 0.12, thick));
  gl_FragColor = vec4(applyAtmosphere(col, vWorld), 1.0);
}`;

/** Waterfall sheet + plunge pool + mist. */
export class Waterfall {
  constructor({ scene, terrainData, textures, ripples }) {
    const W = WATERFALL;
    this.group = new THREE.Group();
    this.group.name = 'waterfall';
    scene.add(this.group);
    // locate the lip on the actual terrain: march from the pool towards the cliff
    let lipZ = W.z + 10, lipY = W.poolLevel;
    for (let z = W.z + 6; z < W.z + 26; z += 0.25) {
      const h = terrainData.heightAt(W.x, z);
      if (h > lipY) { lipY = h; lipZ = z; }
      if (h >= W.cliffTop - 1.5) break;
    }
    const top = new THREE.Vector3(W.x, lipY + 0.25, lipZ - 0.6);
    const bottom = new THREE.Vector3(W.x, W.poolLevel - 0.1, W.z + 10);
    this.impact = bottom.clone();
    const mkSheet = (layer, widthTop, widthBottom, offset) => {
      const segs = 28;
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const y = top.y + (bottom.y - top.y) * t;
        const z = top.z + (bottom.z - top.z) * Math.pow(t, 0.7) - Math.sin(t * Math.PI) * 0.6 - offset;
        const w = widthTop + (widthBottom - widthTop) * t;
        for (const s of [-1, 1]) {
          pos.push(W.x + s * w * 0.5 + Math.sin(t * 9 + s) * 0.08, y, z);
          uv.push(s < 0 ? 0 : 1, t * (top.y - bottom.y) / 4);
        }
      }
      for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const mat = new THREE.ShaderMaterial({ vertexShader: FALL_VERT, fragmentShader: FALL_FRAG, uniforms: { ...U, uFoam: { value: textures.foam }, uLayer: { value: layer } }, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(g, mat);
      m.layers.set(LAYER.FX);
      m.renderOrder = 4 + layer;
      this.group.add(m);
      return m;
    };
    mkSheet(0, 2.4, 3.6, 0.15);
    mkSheet(1, 3.0, 4.6, -0.05);
    // pool surface
    const poolGeo = new THREE.CircleGeometry(W.poolRadius + 2.5, 64);
    poolGeo.rotateX(-Math.PI / 2);
    this.poolUniforms = { ...U, uRefraction: { value: null }, uResolution: { value: new THREE.Vector2(1, 1) }, uNormalMap: { value: textures.waterNormal }, uFoam: { value: textures.foam } };
    const pool = new THREE.Mesh(poolGeo, new THREE.ShaderMaterial({ vertexShader: POOL_VERT, fragmentShader: POOL_FRAG, uniforms: this.poolUniforms }));
    pool.position.set(W.x, W.poolLevel, W.z + 3);
    pool.layers.set(LAYER.WATER);
    this.group.add(pool);
    this.pool = pool;
    this.mistTimer = 0;
  }

  update(dt, game) {
    // share the refraction pass with the ocean
    const ou = game.ocean.uniforms;
    this.poolUniforms.uRefraction.value = ou.uRefraction.value;
    this.poolUniforms.uResolution.value.copy(ou.uResolution.value);
    const d = game.camera.position.distanceTo(this.impact);
    if (d < 140 && dt > 0) {
      this.mistTimer -= dt;
      while (this.mistTimer < 0) {
        this.mistTimer += 0.03;
        const a = Math.random() * Math.PI * 2;
        game.particles.spawn({ pos: { x: this.impact.x + (Math.random() - 0.5) * 3, y: this.impact.y + 0.2, z: this.impact.z + (Math.random() - 0.5) * 1.5 }, vel: { x: Math.cos(a) * 1.5, y: 1.2 + Math.random() * 1.5, z: Math.sin(a) * 1.5 - 0.6 }, life: 2.4, size: 0.5, grow: 1.1, color: [0.92, 0.96, 1], alpha: 0.16, drag: 1.2, kind: 0 });
        if (Math.random() < 0.5) game.particles.spawn({ pos: { x: this.impact.x + (Math.random() - 0.5) * 3.5, y: this.impact.y + 0.1, z: this.impact.z }, vel: { x: (Math.random() - 0.5) * 3, y: 2 + Math.random() * 3, z: -Math.random() * 2 }, life: 1, size: 0.02, color: [0.9, 0.97, 1], alpha: 0.8, gravity: 9.8, kind: 1, stretch: 0.03 });
      }
    }
  }
}
