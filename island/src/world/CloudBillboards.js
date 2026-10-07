import * as THREE from 'three';
import { U, GLSL_UNIFORMS, GLSL_COMMON, LAYER } from '../core/Shared.js';
import { rng } from '../utils/MathUtils.js';

// Cumulus billboards ringing the horizon. The flat cloud layer handles the sky
// overhead; these give low clouds a towering, sun-lit volume where perspective would
// otherwise squash a 2D layer into streaks.

function cumulusAtlas() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S * 2; c.height = S * 2;
  const ctx = c.getContext('2d');
  const r = rng(77);
  for (let cell = 0; cell < 4; cell++) {
    const ox = (cell % 2) * S, oy = Math.floor(cell / 2) * S;
    const base = oy + S * 0.78;
    const blobs = [];
    const towers = 2 + Math.floor(r() * 3);
    for (let t = 0; t < towers; t++) {
      const cx = ox + S * (0.2 + r() * 0.6);
      const h = S * (0.25 + r() * 0.35);
      const w = S * (0.12 + r() * 0.12);
      for (let k = 0; k < 26; k++) {
        const y = base - r() * h;
        const spread = w * (1 - (base - y) / (h * 1.6));
        blobs.push([cx + (r() - 0.5) * 2 * spread, y, 18 + r() * 46 * (1 - (base - y) / (h * 1.4))]);
      }
    }
    for (let k = 0; k < 30; k++) blobs.push([ox + S * (0.08 + r() * 0.84), base - r() * S * 0.08, 20 + r() * 34]);
    for (const [x, y, rad] of blobs) {
      const g = ctx.createRadialGradient(x, y, rad * 0.2, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    // flat-ish base
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const fg = ctx.createLinearGradient(0, base - 10, 0, base + 30);
    fg.addColorStop(0, 'rgba(0,0,0,0)');
    fg.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = fg;
    ctx.fillRect(ox, base - 10, S, S - (base - oy) + 10);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

const VERT = /* glsl */ `
attribute vec4 aCloud; // cell, scale, alphaThreshold(by coverage), phase
varying vec2 vUv;
varying vec2 vCellUv;
varying vec3 vWorld;
varying float vThresh;
void main() {
  vec2 cell = vec2(mod(aCloud.x, 2.0), 1.0 - floor(aCloud.x / 2.0));
  vCellUv = uv;
  vUv = (uv + cell) * 0.5;
  vThresh = aCloud.z;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
${GLSL_UNIFORMS}
${GLSL_COMMON}
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec2 vCellUv;
varying vec3 vWorld;
varying float vThresh;
void main() {
  // instances fade in with cloud cover
  float show = smoothstep(vThresh, vThresh + 0.15, uCloudCover);
  if (show < 0.01) discard;
  float a = texture2D(uAtlas, vUv).a;
  vec3 L = normalize(uSunDisk);
  vec3 V = normalize(cameraPosition - vWorld);
  // offset towards the sun in billboard space to find lit edges
  vec3 camRight = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
  vec2 sunDir2 = normalize(vec2(dot(L, camRight), L.y + 0.15)) * 0.025;
  float a2 = texture2D(uAtlas, vUv + sunDir2).a;
  float edge = clamp((a - a2) * 3.0 + 0.5, 0.0, 1.0);
  float height = clamp(vCellUv.y * 1.3 - 0.15, 0.0, 1.0);
  float lit = clamp(height * 0.7 + edge * 0.5, 0.0, 1.2);
  vec3 col = mix(uCloudDark * 0.85, uCloudLit, lit);
  float mu = max(dot(-V, L), 0.0);
  col += uSunGlow * pow(mu, 8.0) * (1.0 - a) * 1.4;
  col *= mix(1.0, 0.42, uNight); // moonlit clouds stay dim silhouettes
  col = applyAtmosphere(col, vWorld);
  float alpha = smoothstep(0.08, 0.6, a) * show * 0.95;
  gl_FragColor = vec4(col, alpha);
}`;

export class CloudBillboards {
  constructor(scene) {
    const n = 34;
    const r = rng(5);
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);
    const data = new Float32Array(n * 4);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { ...U, uAtlas: { value: cumulusAtlas() } },
      transparent: true, depthWrite: false,
    }), n);
    this.items = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + r() * 0.15;
      const dist = 2600 + r() * 1100;
      const w = 900 + r() * 900;
      const y = 60 + r() * 140;
      this.items.push({ ang, dist, w, y, cell: Math.floor(r() * 4) });
      data[i * 4] = this.items[i].cell;
      data[i * 4 + 1] = 1;
      data[i * 4 + 2] = r() * 0.55; // appears once cover exceeds this
      data[i * 4 + 3] = r();
    }
    geo.setAttribute('aCloud', new THREE.InstancedBufferAttribute(data, 4));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -50;
    this.mesh.layers.set(LAYER.WORLD);
    this.mesh.layers.enable(LAYER.REFLECT_LITE);
    scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this.drift = 0;
  }

  update(dt, camera) {
    this.drift += dt * 0.0012;
    const cx = camera.position.x, cz = camera.position.z;
    this.items.forEach((it, i) => {
      const a = it.ang + this.drift;
      const x = cx + Math.cos(a) * it.dist, z = cz + Math.sin(a) * it.dist;
      // face the camera around the vertical axis
      this._q.setFromAxisAngle(this._p.set(0, 1, 0), Math.atan2(cx - x, cz - z));
      this._m.compose(this._p.set(x, it.y, z), this._q, this._s.set(it.w, it.w * 0.55, 1));
      this.mesh.setMatrixAt(i, this._m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
