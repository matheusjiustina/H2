import * as THREE from 'three';
import { U, GLSL_UNIFORMS, GLSL_COMMON, LAYER } from '../core/Shared.js';

// Atlas: 0 soft puff, 1 droplet, 2 flame, 3 spark/glow
function makeAtlas() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S * 2;
  const ctx = c.getContext('2d');
  const radial = (cx, cy, r, stops) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  };
  // soft puff with noisy edge
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * 22;
    radial(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 30 + Math.random() * 18, [[0, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
  }
  // droplet
  radial(S + 64, 64, 40, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.85)'], [1, 'rgba(255,255,255,0)']]);
  // flame
  const g = ctx.createRadialGradient(64, S + 80, 4, 64, S + 70, 56);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(64, S + 6);
  ctx.bezierCurveTo(100, S + 60, 104, S + 120, 64, S + 122);
  ctx.bezierCurveTo(24, S + 120, 28, S + 60, 64, S + 6);
  ctx.fill();
  // spark
  radial(S + 64, S + 64, 26, [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

const VERT = /* glsl */ `
${GLSL_UNIFORMS}
attribute vec4 iPos;   // xyz, size
attribute vec4 iColor; // rgb, alpha
attribute vec4 iVel;   // stretch dir xyz, kind (atlas cell + lit flag * 10)
varying vec2 vUv;
varying vec4 vColor;
varying float vLit;
varying vec3 vWorld;
void main() {
  float kind = mod(iVel.w, 10.0);
  vLit = step(10.0, iVel.w);
  vec2 cell = vec2(mod(kind, 2.0), 1.0 - floor(kind / 2.0));
  vUv = (uv + cell) * 0.5;
  vColor = iColor;
  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 corner = position;
  vec3 wp;
  float stretch = length(iVel.xyz);
  if (stretch > 0.001) {
    vec3 d = iVel.xyz / stretch;
    vec3 toCam = normalize(cameraPosition - iPos.xyz);
    vec3 side = normalize(cross(d, toCam));
    wp = iPos.xyz + side * corner.x * iPos.w + d * corner.y * (iPos.w + stretch);
  } else {
    wp = iPos.xyz + (camRight * corner.x + camUp * corner.y) * iPos.w;
  }
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const FRAG = /* glsl */ `
${GLSL_UNIFORMS}
${GLSL_COMMON}
uniform sampler2D uAtlas;
uniform float uAdditive;
varying vec2 vUv;
varying vec4 vColor;
varying float vLit;
varying vec3 vWorld;
void main() {
  vec4 t = texture2D(uAtlas, vUv);
  float a = t.a * vColor.a;
  if (a < 0.003) discard;
  vec3 col = vColor.rgb;
  if (vLit > 0.5) col *= uAmbient * 0.9 + uSunColor * max(uSunDir.y, 0.0) * 0.35;
  col = applyAtmosphere(col, vWorld);
  if (uAdditive > 0.5) gl_FragColor = vec4(col * a, 1.0);
  else gl_FragColor = vec4(col, a);
}`;

class Pool {
  constructor(max, additive, atlas) {
    this.max = max;
    this.n = 0;
    this.p = []; // particle objects
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iColor', this.aCol);
    geo.setAttribute('iVel', this.aVel);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { ...U, uAtlas: { value: atlas }, uAdditive: { value: additive ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.CustomBlending : THREE.NormalBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(LAYER.FX);
    this.mesh.renderOrder = additive ? 11 : 10;
  }
}

/**
 * Pooled CPU-simulated billboard particles (splashes, spray, fire, smoke, embers,
 * sand puffs). Two draw calls total (alpha + additive).
 */
export class Particles {
  constructor(scene, quality = 1) {
    this.atlas = makeAtlas();
    this.alpha = new Pool(2400, false, this.atlas);
    this.add = new Pool(1200, true, this.atlas);
    scene.add(this.alpha.mesh, this.add.mesh);
    this.quality = quality;
    this.ocean = null;
    this.terrain = null;
  }

  /**
   * opts: pos, vel, life, size, grow, color [r,g,b], alpha, gravity, drag, kind (0 puff,1 drop,2 flame,3 spark),
   * lit (bool), additive, stretch (velocity stretch factor), water (die on water hit), onWater cb
   */
  spawn(o) {
    const pool = o.additive ? this.add : this.alpha;
    if (pool.p.length >= pool.max) return null;
    if (Math.random() > this.quality && !o.essential) return null;
    const p = {
      x: o.pos.x, y: o.pos.y, z: o.pos.z,
      vx: o.vel ? o.vel.x : 0, vy: o.vel ? o.vel.y : 0, vz: o.vel ? o.vel.z : 0,
      life: o.life ?? 1, age: 0, size: o.size ?? 0.1, grow: o.grow ?? 0,
      r: o.color ? o.color[0] : 1, g: o.color ? o.color[1] : 1, b: o.color ? o.color[2] : 1,
      a: o.alpha ?? 1, gravity: o.gravity ?? 0, drag: o.drag ?? 0, kind: o.kind ?? 0, lit: o.lit !== false,
      stretch: o.stretch ?? 0, fadeIn: o.fadeIn ?? 0.05, water: !!o.water, onWater: o.onWater || null, buoy: o.buoy ?? 0,
    };
    pool.p.push(p);
    return p;
  }

  update(dt) {
    for (const pool of [this.alpha, this.add]) {
      const arr = pool.p;
      let w = 0;
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        p.age += dt;
        if (p.age >= p.life) continue;
        p.vy -= p.gravity * dt;
        const dr = Math.exp(-p.drag * dt);
        p.vx *= dr; p.vy *= dr; p.vz *= dr;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.buoy) p.y += (p.buoy - p.y) * Math.min(1, dt * 3);
        if (p.water && p.vy < 0 && this.ocean) {
          const wy = this.ocean.heightAt(p.x, p.z);
          if (p.y < wy) {
            if (p.onWater) p.onWater(p);
            continue;
          }
        }
        arr[w++] = p;
      }
      arr.length = w;
      const n = Math.min(arr.length, pool.max);
      const P = pool.aPos.array, C = pool.aCol.array, Vv = pool.aVel.array;
      for (let i = 0; i < n; i++) {
        const p = arr[i];
        const t = p.age / p.life;
        const fade = Math.min(1, p.age / Math.max(p.fadeIn, 1e-3)) * (1 - t * t);
        P[i * 4] = p.x; P[i * 4 + 1] = p.y; P[i * 4 + 2] = p.z; P[i * 4 + 3] = p.size + p.grow * p.age;
        C[i * 4] = p.r; C[i * 4 + 1] = p.g; C[i * 4 + 2] = p.b; C[i * 4 + 3] = p.a * fade;
        const s = p.stretch;
        Vv[i * 4] = p.vx * s; Vv[i * 4 + 1] = p.vy * s; Vv[i * 4 + 2] = p.vz * s; Vv[i * 4 + 3] = p.kind + (p.lit ? 10 : 0);
      }
      const geo = pool.mesh.geometry;
      geo.instanceCount = n;
      for (const a of [pool.aPos, pool.aCol, pool.aVel]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * 4); a.needsUpdate = true; }
      pool.mesh.visible = n > 0;
    }
  }

  // ------------------------------------------------------------------ presets
  splash(x, y, z, strength = 1) {
    const n = Math.round(26 * strength + 6);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.6 + Math.random() * 1.6) * (0.6 + strength * 0.6);
      const up = (1.8 + Math.random() * 2.6) * (0.5 + strength * 0.7);
      this.spawn({ pos: { x: x + Math.cos(a) * 0.05, y: y + 0.02, z: z + Math.sin(a) * 0.05 }, vel: { x: Math.cos(a) * sp, y: up, z: Math.sin(a) * sp }, life: 1.4, size: 0.012 + Math.random() * 0.018, color: [0.85, 0.95, 1.0], alpha: 0.9, gravity: 9.8, drag: 0.4, kind: 1, stretch: 0.03, water: true, essential: i < 10 });
    }
    // central crown column
    for (let i = 0; i < 8 * strength + 3; i++) {
      this.spawn({ pos: { x, y: y + 0.02, z }, vel: { x: (Math.random() - 0.5) * 0.5, y: 2.5 + Math.random() * 2.5 * strength, z: (Math.random() - 0.5) * 0.5 }, life: 0.9, size: 0.02 + Math.random() * 0.02, color: [0.9, 0.97, 1], alpha: 0.85, gravity: 9.8, drag: 0.6, kind: 1, stretch: 0.04, water: true });
    }
    // mist
    for (let i = 0; i < 6 * strength + 2; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn({ pos: { x, y: y + 0.08, z }, vel: { x: Math.cos(a) * 0.5, y: 0.4 + Math.random() * 0.5, z: Math.sin(a) * 0.5 }, life: 1.2, size: 0.12, grow: 0.35, color: [0.92, 0.96, 1], alpha: 0.25, drag: 1.6, kind: 0 });
    }
  }

  spray(x, y, z, vx, vy, vz, n = 6) {
    for (let i = 0; i < n; i++) {
      this.spawn({ pos: { x: x + (Math.random() - 0.5) * 0.2, y, z: z + (Math.random() - 0.5) * 0.2 }, vel: { x: vx + (Math.random() - 0.5) * 1.2, y: vy + Math.random() * 1.5, z: vz + (Math.random() - 0.5) * 1.2 }, life: 0.9, size: 0.015 + Math.random() * 0.02, color: [0.88, 0.96, 1], alpha: 0.8, gravity: 9.8, drag: 0.8, kind: 1, stretch: 0.03, water: true });
      if (Math.random() < 0.4) this.spawn({ pos: { x, y: y + 0.1, z }, vel: { x: vx * 0.5, y: 0.5, z: vz * 0.5 }, life: 1.0, size: 0.15, grow: 0.5, color: [0.95, 0.98, 1], alpha: 0.18, drag: 2.0, kind: 0 });
    }
  }

  sandPuff(x, y, z, strength = 1) {
    for (let i = 0; i < 4 * strength; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn({ pos: { x, y: y + 0.03, z }, vel: { x: Math.cos(a) * 0.4, y: 0.3 + Math.random() * 0.4, z: Math.sin(a) * 0.4 }, life: 0.8, size: 0.04, grow: 0.12, color: [0.85, 0.78, 0.62], alpha: 0.3, gravity: 0.5, drag: 3, kind: 0 });
    }
  }

  fire(pos, intensity = 1, dt = 0.016) {
    const rate = 40 * intensity;
    let n = rate * dt;
    while (n > 0) {
      if (Math.random() < n) {
        const r = Math.random() * 0.22;
        const a = Math.random() * Math.PI * 2;
        this.spawn({ pos: { x: pos.x + Math.cos(a) * r, y: pos.y - 0.2, z: pos.z + Math.sin(a) * r }, vel: { x: (Math.random() - 0.5) * 0.2, y: 0.8 + Math.random() * 0.7, z: (Math.random() - 0.5) * 0.2 }, life: 0.55 + Math.random() * 0.35, size: 0.12 + Math.random() * 0.1, grow: -0.12, color: [3.2, 1.3 + Math.random() * 0.4, 0.35], alpha: 0.8, kind: 2, lit: false, additive: true, drag: 0.5 });
      }
      n -= 1;
    }
    if (Math.random() < dt * 6 * intensity) this.spawn({ pos: { x: pos.x, y: pos.y, z: pos.z }, vel: { x: (Math.random() - 0.5) * 0.8, y: 1.6 + Math.random() * 1.6, z: (Math.random() - 0.5) * 0.8 }, life: 1.8, size: 0.012, color: [6, 2.4, 0.6], alpha: 1, kind: 3, lit: false, additive: true, drag: 0.6, gravity: -0.3 });
    if (Math.random() < dt * 7 * intensity) this.spawn({ pos: { x: pos.x, y: pos.y + 0.5, z: pos.z }, vel: { x: 0.15 + (Math.random() - 0.5) * 0.2, y: 0.7, z: (Math.random() - 0.5) * 0.2 }, life: 4, size: 0.25, grow: 0.45, color: [0.35, 0.33, 0.32], alpha: 0.22, kind: 0, drag: 0.3, fadeIn: 0.6 });
  }
}
