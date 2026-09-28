import * as THREE from 'three';

/**
 * Pooled GPU point particles: one draw call per system.
 * CPU integrates a few hundred particles per frame, which is trivial.
 */
const VERT = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  uniform float uScale;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG_GLOW = /* glsl */ `
  varying vec4 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a = a * a;
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  }
`;

const FRAG_SOLID = /* glsl */ `
  varying vec4 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.35, d);
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  }
`;

const _c = new THREE.Color();

export class Particles {
  constructor(max = 600, { additive = true } = {}) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.p = Array.from({ length: max }, () => ({
      alive: false,
      x: 0, y: 0, z: 0,
      vx: 0, vy: 0, vz: 0,
      life: 0, max: 1,
      s0: 0.1, s1: 0,
      r: 1, g: 1, b: 1, a: 1,
      grav: 0, drag: 0,
      tx: 0, ty: 0, tz: 0, pull: 0,
      fadeIn: 0.1,
      floorY: -Infinity,
    }));
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aColor', this.colAttr);
    geo.setAttribute('aSize', this.sizeAttr);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: VERT,
      fragmentShader: additive ? FRAG_GLOW : FRAG_SOLID,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 5;
    this.active = 0;
  }

  setScale(viewportHeightPx, fovDeg) {
    this.material.uniforms.uScale.value = viewportHeightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  /**
   * emit({ pos, count, color, speed, up, spread, life, size, sizeEnd, gravity, drag,
   *        radius, ring, target, pull, alpha, floorY, velocity })
   */
  emit(o) {
    const count = o.count ?? 10;
    const colors = Array.isArray(o.color) ? o.color : [o.color ?? '#ffffff'];
    for (let i = 0; i < count; i++) {
      const p = this.p[this.cursor];
      this.cursor = (this.cursor + 1) % this.max;
      p.alive = true;
      // spawn offset
      const r = o.radius ?? 0;
      let ox = 0, oy = 0, oz = 0;
      if (r > 0) {
        if (o.ring) {
          const a = Math.random() * Math.PI * 2;
          ox = Math.cos(a) * r;
          oz = Math.sin(a) * r;
          oy = (Math.random() - 0.5) * (o.ringHeight ?? 0);
        } else {
          const u = Math.random() * 2 - 1;
          const a = Math.random() * Math.PI * 2;
          const k = Math.cbrt(Math.random()) * r;
          const s = Math.sqrt(1 - u * u);
          ox = s * Math.cos(a) * k;
          oy = u * k * (o.flatY ?? 1);
          oz = s * Math.sin(a) * k;
        }
      }
      p.x = o.pos.x + ox;
      p.y = o.pos.y + oy;
      p.z = o.pos.z + oz;
      // velocity: random direction biased upward
      const sp = (o.speed ?? 1) * (0.5 + Math.random() * 0.7);
      const spread = o.spread ?? 1;
      let dx = (Math.random() * 2 - 1) * spread;
      let dy = (o.up ?? 0.5) + (Math.random() * 2 - 1) * spread * 0.5;
      let dz = (Math.random() * 2 - 1) * spread;
      if (o.radial && r > 0) {
        dx = ox;
        dy = o.up ?? 0.2;
        dz = oz;
      }
      const len = Math.hypot(dx, dy, dz) || 1;
      p.vx = (dx / len) * sp + (o.velocity?.x ?? 0);
      p.vy = (dy / len) * sp + (o.velocity?.y ?? 0);
      p.vz = (dz / len) * sp + (o.velocity?.z ?? 0);
      p.life = 0;
      p.max = (o.life ?? 1) * (0.7 + Math.random() * 0.6);
      p.s0 = (o.size ?? 0.08) * (0.6 + Math.random() * 0.8);
      p.s1 = o.sizeEnd != null ? o.sizeEnd * p.s0 / (o.size ?? 0.08) : 0;
      _c.set(colors[(Math.random() * colors.length) | 0]);
      p.r = _c.r;
      p.g = _c.g;
      p.b = _c.b;
      p.a = o.alpha ?? 1;
      p.grav = o.gravity ?? 0;
      p.drag = o.drag ?? 1.5;
      p.pull = o.pull ?? 0;
      if (o.target) {
        p.tx = o.target.x;
        p.ty = o.target.y;
        p.tz = o.target.z;
      }
      p.targetRef = o.targetRef ?? null;
      p.fadeIn = o.fadeIn ?? 0.08;
      p.floorY = o.floorY ?? -Infinity;
    }
  }

  update(dt) {
    let active = 0;
    for (let i = 0; i < this.max; i++) {
      const p = this.p[i];
      const i3 = i * 3;
      const i4 = i * 4;
      if (!p.alive) {
        this.size[i] = 0;
        continue;
      }
      p.life += dt;
      if (p.life >= p.max) {
        p.alive = false;
        this.size[i] = 0;
        continue;
      }
      active++;
      if (p.pull > 0) {
        const tx = p.targetRef ? p.targetRef.x : p.tx;
        const ty = p.targetRef ? p.targetRef.y : p.ty;
        const tz = p.targetRef ? p.targetRef.z : p.tz;
        p.vx += (tx - p.x) * p.pull * dt;
        p.vy += (ty - p.y) * p.pull * dt;
        p.vz += (tz - p.z) * p.pull * dt;
      }
      p.vy -= p.grav * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.vz *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < p.floorY) {
        p.y = p.floorY;
        p.vy *= -0.25;
        p.vx *= 0.5;
        p.vz *= 0.5;
      }
      const k = p.life / p.max;
      const fade = Math.min(1, p.life / p.fadeIn) * (1 - k * k);
      this.pos[i3] = p.x;
      this.pos[i3 + 1] = p.y;
      this.pos[i3 + 2] = p.z;
      this.col[i4] = p.r;
      this.col[i4 + 1] = p.g;
      this.col[i4 + 2] = p.b;
      this.col[i4 + 3] = p.a * fade;
      this.size[i] = p.s0 + (p.s1 - p.s0) * k;
    }
    // Skip GPU uploads once everything settled.
    if (active > 0 || this.active > 0) {
      this.posAttr.needsUpdate = true;
      this.colAttr.needsUpdate = true;
      this.sizeAttr.needsUpdate = true;
    }
    this.active = active;
  }
}

/** Ambient floating motes, animated entirely on the GPU. */
export function createMotes(count = 70, bounds = { x: 6, y: 3.5, z: 4.5 }) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * bounds.x;
    pos[i * 3 + 1] = Math.random() * bounds.y;
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * bounds.z;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 400 }, uHeight: { value: bounds.y } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uScale;
      uniform float uHeight;
      varying float vA;
      void main() {
        vec3 p = position;
        float t = uTime * (0.05 + aSeed * 0.06);
        p.y = mod(p.y + t, uHeight);
        p.x += sin(uTime * 0.3 + aSeed * 40.0) * 0.25;
        p.z += cos(uTime * 0.25 + aSeed * 30.0) * 0.25;
        vA = smoothstep(0.0, 0.6, p.y) * smoothstep(uHeight, uHeight - 1.0, p.y) * (0.25 + 0.35 * sin(uTime * 1.5 + aSeed * 20.0) * 0.5 + 0.2);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (0.025 + aSeed * 0.03) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(0.75, 0.92, 1.0, vA * a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  return points;
}
