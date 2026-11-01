// Virtual fire suppression — an isolated TEST SCENARIO for the Fire Boss
// (there is no fire system elsewhere in the game; this is not a mission
// system, no fire spread, no new map). Five fire spots on open ground west
// of the Represa do Norte. Each spot has an intensity (0…1), a radius and
// the water it has received; drops reduce the intensity by the water that
// lands inside the burning area; a spot at zero is out (steam, then ash).
// When every spot is out they reignite after a pause, so the scoop → drop
// loop can be flown again.
//
// The water: the drop door hands over packets (litres, position, velocity);
// they fall ballistically with air drag, spreading as they fall; where a
// packet reaches the ground its litres are spread over a footprint that
// grows with the fall time, and handed to the spots it covers as an event
// { x, z, litres, radius }. Visuals: one instanced, camera-facing flame
// mesh for every spot (one draw call), and two particle pools (smoke, the
// falling water / splashes) — a bounded number of points, nothing kept.
import * as THREE from 'three';
import { ParticlePool } from '../core/particles.js';

export const FIRE_TEST_SPOTS = [
  { x: -750, z: -3800, r: 16 },
  { x: -880, z: -3700, r: 20 },
  { x: -1000, z: -3900, r: 14 },
  { x: -820, z: -4050, r: 18 },
  { x: -1150, z: -3600, r: 15 },
];
const L_PER_M2 = 1.6; // litres per m² of burning area to put a spot out
const REIGNITE = 120; // s after the last spot is out
const PER_FIRE = 16; // flame billboards per spot

const FLAME_VS = /* glsl */ `
attribute vec4 aInst;
attribute float aPhase;
uniform float uTime;
varying vec2 vUv;
varying float vPhase;
void main() {
  vUv = uv;
  vPhase = aPhase;
  float s = aInst.w * (0.82 + 0.18 * sin(uTime * 3.1 + aPhase * 7.0));
  vec4 mv = viewMatrix * vec4(aInst.xyz, 1.0);
  mv.xy += vec2(position.x * s * 0.65, position.y * s);
  gl_Position = projectionMatrix * mv;
}`;
const FLAME_FS = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vPhase;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  float y = vUv.y;
  float n = n2(vec2(vUv.x * 4.0 + vPhase * 9.0, y * 5.0 - uTime * 3.2)) * 0.6 + n2(vec2(vUv.x * 9.0, y * 11.0 - uTime * 5.0)) * 0.4;
  float w = 0.5 * (1.0 - y * 0.85);
  float shape = smoothstep(w, w * 0.25, abs(vUv.x - 0.5)) * smoothstep(1.0, 0.25, y) * smoothstep(0.0, 0.08, y);
  float a = clamp(shape * 1.8 - n * 0.75 * (0.4 + y), 0.0, 1.0);
  vec3 col = mix(vec3(1.0, 0.72, 0.22), vec3(0.86, 0.2, 0.03), smoothstep(0.05, 0.7, y + n * 0.25));
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a * 0.92);
}`;

export class FireField {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.active = false;
    this.time = 0;
    this.allOutT = 0;
    this.fires = FIRE_TEST_SPOTS.map((s, i) => ({ ...s, id: i + 1, intensity: 1, water: 0, state: 'burning', y: terrain.heightAt(s.x, s.z) }));
    this.packets = [];
    this._acc = null;
    this.impacts = [];
    this.totalOnTarget = 0;
    this.visual = !!scene; // headless (tests): the logic only
    if (this.visual) this._buildVisuals(scene, terrain);
  }

  _buildVisuals(scene, terrain) {
    // Flames: one instanced quad mesh.
    const n = this.fires.length * PER_FIRE;
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    this.inst = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const phase = new Float32Array(n);
    this.base = [];
    let k = 0;
    for (const f of this.fires) {
      for (let j = 0; j < PER_FIRE; j++, k++) {
        const a = (j / PER_FIRE) * Math.PI * 2 + Math.random(), d = f.r * Math.sqrt(Math.random()) * 0.85;
        const x = f.x + Math.cos(a) * d, z = f.z + Math.sin(a) * d;
        this.base.push({ f, x, y: terrain.heightAt(x, z) - 0.2, z, s: 3.5 + Math.random() * 4.5 });
        phase[k] = Math.random();
      }
    }
    geo.setAttribute('aInst', this.inst);
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    geo.instanceCount = n;
    this.uTime = { value: 0 };
    this.flames = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { uTime: this.uTime }, vertexShader: FLAME_VS, fragmentShader: FLAME_FS,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide,
    }));
    this.flames.frustumCulled = false;
    this.flames.renderOrder = 24;
    this.flames.visible = false;
    this.smoke = new ParticlePool(900, { renderOrder: 23 });
    this.water = new ParticlePool(1400, { renderOrder: 22 });
    this.smoke.points.visible = this.water.points.visible = false;
    scene.add(this.flames, this.smoke.points, this.water.points);
    this._writeFlames();
  }

  setScale(viewportHeight, fov) { if (!this.visual) return; this.smoke.setScale(viewportHeight, fov); this.water.setScale(viewportHeight, fov); }

  setActive(on) {
    this.active = !!on;
    if (this.visual) this.flames.visible = this.smoke.points.visible = this.water.points.visible = this.active;
    if (!this.active) { this.packets.length = 0; this._acc = null; }
  }

  reset() {
    for (const f of this.fires) { f.intensity = 1; f.water = 0; f.state = 'burning'; }
    this.allOutT = 0;
    this._writeFlames();
  }

  _writeFlames() {
    if (!this.visual) return;
    const a = this.inst.array;
    this.base.forEach((b, i) => {
      const k = b.f.state === 'burning' ? 0.25 + 0.75 * b.f.intensity : 0;
      a[i * 4] = b.x; a[i * 4 + 1] = b.y; a[i * 4 + 2] = b.z; a[i * 4 + 3] = b.s * k;
    });
    this.inst.needsUpdate = true;
  }

  // Water from the drop door (merged into ≈ 50 ms packets).
  addPacket(p) {
    if (!this.active) return;
    const c = this._acc;
    if (c && this.time - c.t0 < 0.05) {
      const w = c.litres + p.litres;
      c.x = (c.x * c.litres + p.x * p.litres) / w; c.y = (c.y * c.litres + p.y * p.litres) / w; c.z = (c.z * c.litres + p.z * p.litres) / w;
      c.vx = p.vx; c.vy = p.vy; c.vz = p.vz; c.litres = w;
      return;
    }
    this._acc = { ...p, t0: this.time, age: 0 };
    this.packets.push(this._acc);
  }

  // Water reaching the ground: hand it to the spots it covers.
  applyWater(x, z, litres, radius) {
    const area = Math.PI * radius * radius;
    let onTarget = 0;
    for (const f of this.fires) {
      if (f.state !== 'burning') continue;
      const d = Math.hypot(f.x - x, f.z - z);
      if (d > radius + f.r) continue;
      // Share of the footprint over the burning disc (overlap of two discs,
      // approximated by the smaller disc inside the larger, edges tapered).
      const overlap = Math.max(0, Math.min(1, (radius + f.r - d) / (2 * Math.min(radius, f.r))));
      const covered = Math.min(area, Math.PI * f.r * f.r) * overlap;
      const L = litres * (covered / area);
      f.water += L;
      onTarget += L;
      f.intensity = Math.max(0, f.intensity - L / (L_PER_M2 * Math.PI * f.r * f.r));
      if (f.intensity <= 0.001) { f.state = 'out'; f.intensity = 0; f.outT = this.time; }
    }
    this.totalOnTarget += onTarget;
    this.impacts.push({ x, z, litres, radius, onTarget, t: this.time });
    if (this.impacts.length > 64) this.impacts.shift();
    this._writeFlames();
    return onTarget;
  }

  update(dt, wind) {
    if (!this.active) return;
    this.time += dt;
    if (this.visual) this.uTime.value = this.time;
    const T = this.terrain;
    // Falling water packets.
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const p = this.packets[i];
      if (p === this._acc && this.time - p.t0 < 0.05) continue;
      p.age += dt;
      const k = Math.min(1, 0.55 * dt);
      p.vx += (wind.x - p.vx) * k; p.vz += (wind.z - p.vz) * k;
      p.vy += (-9.81 - p.vy * 0.12) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const spread = 1.5 + p.age * 4.5;
      const n = this.visual ? Math.min(4, 1 + Math.round(p.litres / 30)) : 0;
      for (let j = 0; j < n; j++) {
        this.water.spawn(p.x + (Math.random() - 0.5) * spread, p.y + (Math.random() - 0.5) * spread * 0.6, p.z + (Math.random() - 0.5) * spread,
          p.vx * 0.6, p.vy * 0.5, p.vz * 0.6, { life: 0.7 + Math.random() * 0.5, size: 1.4 + spread * 0.5, grow: 1.6, alpha: 0.32, drag: 1.2, gravity: 4, color: [0.9, 0.93, 0.96] });
      }
      const gy = T.heightAt(p.x, p.z);
      if (p.y <= gy + 0.5 || p.age > 12) {
        this.applyWater(p.x, p.z, p.litres, 5 + p.age * 4);
        if (this.visual) for (let j = 0; j < 4; j++) this.water.spawn(p.x + (Math.random() - 0.5) * spread, gy + 0.3, p.z + (Math.random() - 0.5) * spread, (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3, { life: 1.4, size: 2.5, grow: 2.5, alpha: 0.3, drag: 1.5, gravity: 1, color: [0.85, 0.88, 0.9] });
        this.packets.splice(i, 1);
        if (p === this._acc) this._acc = null;
      }
    }
    // Smoke and steam.
    for (const f of this.fires) {
      if (!this.visual) { if (f.state === 'burning') f.intensity = Math.min(1, f.intensity + dt * 0.004); continue; }
      if (f.state === 'burning') {
        // A smouldering spot slowly gains back.
        f.intensity = Math.min(1, f.intensity + dt * 0.004);
        if (Math.random() < dt * (3 + 9 * f.intensity)) {
          const a = Math.random() * Math.PI * 2, d = f.r * Math.random() * 0.7;
          const g = 0.12 + 0.1 * Math.random();
          this.smoke.spawn(f.x + Math.cos(a) * d, f.y + 2, f.z + Math.sin(a) * d, wind.x * 0.5, 3.5 + 2.5 * f.intensity, wind.z * 0.5,
            { life: 9 + Math.random() * 6, size: 5 + f.r * 0.3, grow: 6, alpha: 0.32 + 0.2 * f.intensity, drag: 0.25, gravity: -0.4, color: [g, g * 0.98, g * 0.95] });
        }
      } else if (this.time - f.outT < 25 && Math.random() < dt * 4) {
        this.smoke.spawn(f.x + (Math.random() - 0.5) * f.r, f.y + 1, f.z + (Math.random() - 0.5) * f.r, wind.x * 0.4, 2.2, wind.z * 0.4,
          { life: 6, size: 4, grow: 4, alpha: 0.28, drag: 0.3, gravity: -0.3, color: [0.78, 0.79, 0.8] });
      }
    }
    if (this.fires.every((f) => f.state === 'out')) {
      this.allOutT += dt;
      if (this.allOutT > REIGNITE) this.reset();
    } else this.allOutT = 0;
    if (this.visual) {
      this.smoke.update(dt, wind, null);
      this.water.update(dt, wind, (x, z) => T.heightAt(x, z));
    }
  }

  // Nearest burning spot from a position (for the HUD).
  nearest(pos) {
    let best = null, bd = 1e9;
    for (const f of this.fires) {
      if (f.state !== 'burning') continue;
      const d = Math.hypot(f.x - pos.x, f.z - pos.z);
      if (d < bd) { bd = d; best = f; }
    }
    return best ? { fire: best, dist: bd, bearing: ((Math.atan2(best.x - pos.x, -(best.z - pos.z)) * 180) / Math.PI + 360) % 360 } : null;
  }
}
