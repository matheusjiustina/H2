import * as THREE from 'three';
import { U, GLSL_UNIFORMS, GLSL_COMMON, LAYER } from '../core/Shared.js';

function footprintTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 76, 4, 32, 76, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(32, 80, 17, 34, 0, 0, Math.PI * 2); ctx.fill();
  const g2 = ctx.createRadialGradient(32, 30, 2, 32, 30, 20);
  g2.addColorStop(0, 'rgba(255,255,255,1)');
  g2.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g2;
  ctx.beginPath(); ctx.ellipse(33, 30, 15, 18, 0, 0, Math.PI * 2); ctx.fill();
  const t = new THREE.CanvasTexture(c);
  return t;
}

const VERT = /* glsl */ `
attribute vec4 iData; // x, z, yaw, birth
attribute float iSide;
uniform float uTime;
uniform sampler2D uTerrainData;
uniform vec4 uTerrainUV;
varying vec2 vUv;
varying float vFade;
varying vec3 vWorld;
void main() {
  vUv = uv;
  float c = cos(iData.z), s = sin(iData.z);
  vec2 local = vec2(position.x * 0.13 + iSide * 0.09, position.y * 0.28);
  vec2 xz = iData.xy + vec2(c * local.x + s * local.y, -s * local.x + c * local.y);
  float h = texture2D(uTerrainData, xz * uTerrainUV.xy + uTerrainUV.zw).r;
  float age = uTime - iData.w;
  vFade = (1.0 - smoothstep(30.0, 90.0, age)) * step(0.0, iData.w);
  // waves wash prints off low on the beach
  vFade *= smoothstep(0.25, 0.55, h);
  vec3 wp = vec3(xz.x, h + 0.012, xz.y);
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const FRAG = /* glsl */ `
${GLSL_UNIFORMS}
${GLSL_COMMON}
uniform sampler2D uPrint;
varying vec2 vUv;
varying float vFade;
varying vec3 vWorld;
void main() {
  float a = texture2D(uPrint, vUv).a * vFade * 0.32;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(0.18, 0.15, 0.1) * (uAmbient * 0.5 + 0.2), a);
}`;

/** Footprints left on sand (ring buffer of decals, washed away by the waves). */
export class Footprints {
  constructor(scene) {
    this.max = 120;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    geo.setIndex([0, 2, 1, 0, 3, 2]);
    this.data = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 4).fill(-1), 4);
    this.side = new THREE.InstancedBufferAttribute(new Float32Array(this.max), 1);
    geo.setAttribute('iData', this.data);
    geo.setAttribute('iSide', this.side);
    geo.instanceCount = this.max;
    for (let i = 0; i < this.max; i++) this.data.array[i * 4 + 3] = -1e6;
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { ...U, uPrint: { value: footprintTexture() } }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(LAYER.DETAIL);
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.i = 0;
  }

  add(x, z, yaw, side, time) {
    const k = this.i++ % this.max;
    const a = this.data.array;
    a[k * 4] = x; a[k * 4 + 1] = z; a[k * 4 + 2] = yaw; a[k * 4 + 3] = time;
    this.side.array[k] = side ? 1 : -1;
    this.data.needsUpdate = true;
    this.side.needsUpdate = true;
  }
}
