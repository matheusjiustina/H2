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
//
// Each spot burns as one area: a core of large flames, clumps of smaller
// ones round it with gaps, every flame with its own fuel (0…1). Water puts
// out the flames it lands on (a drop on one side leaves the other side
// burning); the spot's intensity is their size-weighted mean, so the
// mission logic (intensity, state, water received) is unchanged. A flat
// ember / char patch under each spot (one more instanced draw); smoke is a
// continuous wind-blown column of soft sprites from the burning flames,
// steam where water hits them.
//
// Fireboss Frontier (premium map 03) uses the same field over its own fire
// sectors (src/world/frontier.js): spots start unlit ('idle') and only a
// mission lights them; a spot may be a fire LINE (a front `len` long); the
// smoke follows the camera distance (full near, thinned far away) and every
// burning spot, plus a few distant fires beyond the map, also shows a tall
// impostor smoke column (one instanced draw for all of them); hazeAt() is
// the smoke the air holds at a point (the local loss of visibility).
import * as THREE from 'three';
import { ParticlePool } from '../core/particles.js';
import { FRONTIER } from './activeMap.js';
import { FRONT_FIRE_SPOTS, DISTANT_FIRES, SMOKE_BASIN } from './frontier.js';

export const FIRE_TEST_SPOTS = [
  { x: -750, z: -3800, r: 16 },
  { x: -880, z: -3700, r: 20 },
  { x: -1000, z: -3900, r: 14 },
  { x: -820, z: -4050, r: 18 },
  { x: -1150, z: -3600, r: 15 },
];
// The active map's spots (the main map: the test zone above).
export const FIRE_SPOTS = FRONTIER ? FRONT_FIRE_SPOTS : FIRE_TEST_SPOTS;
// Is (x, z) on the burnt patch of a spot (no grass there)?
export function inSpotPatch(f, x, z) {
  if (f.kind !== 'line') return Math.abs(x - f.x) < f.r * 1.3 && Math.abs(z - f.z) < f.r * 1.3 && Math.hypot(x - f.x, z - f.z) < f.r * 1.25;
  const dx = x - f.x, dz = z - f.z, c = Math.cos(f.ang), s = Math.sin(f.ang);
  const u = (dx * c + dz * s) / (f.len / 2 + f.r * 1.2), v = (-dx * s + dz * c) / (f.r * 1.7);
  return u * u + v * v < 0.9;
}
// Litres per m² of burning area to put a flame out: the test zone's brush
// 1.0 (≈ coverage level 2.5; a full Fire Boss load knocks a spot down);
// Fireboss Frontier's cerrado grass 0.8 (≈ level 2, what grass fires take).
const L_PER_M2 = FRONTIER ? 0.8 : 1.0;
const REIGNITE = 120; // s after the last spot is out
// A drop knocks the fire down: a flame left with under KNOCK of its fuel by
// the water goes out, and a spot down to CONTROLLED of its fire is
// controlled (the last embers are the ground crew's mop-up).
const KNOCK = 0.3;
// Footprint radius of a packet on the ground (m): it spreads as it falls
// (a load dropped from 30 m lands ≈ 35–40 m wide, as the drop patterns do).
export const FOOT0 = 7, FOOTK = 5;

// One step of a falling water packet: it leaves with the aircraft's velocity,
// the air slows it toward the wind and gravity pulls it down (the drop
// lands ahead of where it was released, as fast as the aircraft was going).
// Shared by the fire field and the drop sight (same physics).
export function fallStep(p, wind, dt) {
  p.age += dt;
  const k = Math.min(1, 0.55 * dt);
  p.vx += (wind.x - p.vx) * k; p.vz += (wind.z - p.vz) * k;
  p.vy += (-9.81 - p.vy * 0.12) * dt;
  p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
}
const CONTROLLED = 0.1;
const PER_FIRE = 26; // flames per spot (core + clumps + low creeping edge flames)
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

const FLAME_VS = /* glsl */ `
attribute vec4 aInst;
attribute float aPhase;
attribute float aW;
uniform float uTime;
varying vec2 vUv;
varying float vPhase;
varying float vK;
void main() {
  vUv = uv;
  vPhase = aPhase;
  float k = aInst.w;
  vK = k;
  // Height breathes and flickers on two rates; width follows less.
  float br = 0.86 + 0.14 * sin(uTime * 2.3 + aPhase * 7.0) + 0.06 * sin(uTime * 7.9 + aPhase * 13.0);
  vec4 mv = viewMatrix * vec4(aInst.xyz, 1.0);
  float sway = (position.y) * 0.18 * sin(uTime * 1.7 + aPhase * 5.0);
  mv.xy += vec2((position.x + sway) * k * 0.62 * aW, position.y * k * br);
  gl_Position = projectionMatrix * mv;
}`;
const FLAME_FS = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vPhase;
varying float vK;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  if (vK < 0.05) discard;
  float y = vUv.y;
  // Rising turbulence: tongues that split and detach near the top.
  vec2 q = vec2(vUv.x * 3.0 + vPhase * 9.0, y * 3.2 - uTime * 2.6);
  float n = n2(q) * 0.55 + n2(q * 2.3 + 4.1) * 0.3 + n2(q * 5.1 - 1.7) * 0.15;
  float x = vUv.x - 0.5 + (n - 0.5) * 0.28 * y;
  float w = 0.46 * pow(max(0.0, 1.0 - y * 0.95), 0.8) * (0.8 + 0.4 * n);
  float body = smoothstep(w, w * 0.3, abs(x)) * smoothstep(0.0, 0.1, y);
  float top = 1.0 - smoothstep(0.35 + n * 0.45, 0.95, y);
  float a = clamp(body * top * 1.7 - n * 0.35 * y, 0.0, 1.0);
  if (a < 0.02) discard;
  // White-yellow root, orange body, deep red tips with a little soot.
  float t = clamp(y * 1.15 + (n - 0.5) * 0.35, 0.0, 1.0);
  vec3 col = mix(vec3(1.0, 0.93, 0.62), vec3(1.0, 0.56, 0.12), smoothstep(0.0, 0.35, t));
  col = mix(col, vec3(0.78, 0.16, 0.03), smoothstep(0.35, 0.8, t));
  col = mix(col, vec3(0.22, 0.12, 0.08), smoothstep(0.82, 1.0, t) * 0.6);
  gl_FragColor = vec4(col * 1.15, a * 0.95);
}`;
// Ground patch under a spot: glowing embers on the burnt ground while it
// burns, char afterwards (aInst.w: 1 burning … 0 out; aR: radius).
const PATCH_VS = /* glsl */ `
attribute float aI;
attribute vec2 aUv;
varying vec2 vUv;
varying float vI;
void main() {
  vUv = aUv;
  vI = aI;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;
const PATCH_FS = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vI;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  if (vI < -0.5) discard; // an unlit spot: nothing on the ground
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;
  float n = n2(vUv * 9.0) * 0.6 + n2(vUv * 23.0) * 0.4;
  float edge = 1.0 - smoothstep(0.55 + n * 0.3, 1.0, r);
  if (edge < 0.01) discard;
  float glow = vI * smoothstep(0.7, 0.98, n2(vUv * 16.0 + uTime * 0.35) * 0.65 + n * 0.35) * (1.0 - r * 0.7);
  vec3 col = mix(vec3(0.06, 0.05, 0.04), vec3(0.95, 0.36, 0.06), glow * 0.8);
  gl_FragColor = vec4(col, edge * (0.55 + glow * 0.3));
}`;

export class FireField {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.active = false;
    this.time = 0;
    this.allOutT = 0;
    this.qk = 1; // particle density (quality profile)
    // Main map: the test spots burn from the start and relight by themselves;
    // Fireboss Frontier: unlit until a mission lights them, no auto relight.
    this.autoRelight = !FRONTIER;
    this.cam = new THREE.Vector3(0, 1e5, 0); // camera position (smoke LOD)
    this.fires = FIRE_SPOTS.map((s, i) => ({ ...s, id: i + 1, intensity: FRONTIER ? 0 : 1, water: 0, state: FRONTIER ? 'idle' : 'burning', y: terrain.heightAt(s.x, s.z) }));
    // The flames of every spot (logic and visuals): a core, three clumps
    // round it, a few strays; fixed seed (same layout every time).
    const R = rng(4242);
    this.cells = [];
    for (const f of this.fires) {
      f.cells = [];
      f.area = Math.PI * f.r * f.r; f.br = f.r;
      if (f.kind === 'line') { this._lineCells(f, R, terrain); continue; }
      const clumps = [0, 1, 2].map((j) => ({ a: R() * 6.28 + j * 2.1, d: f.r * (0.45 + R() * 0.35) }));
      for (let j = 0; j < PER_FIRE; j++) {
        let x, z, s;
        let w = 1;
        if (j < 5) { const a = R() * 6.28, d = f.r * 0.24 * Math.sqrt(R()); x = f.x + Math.cos(a) * d; z = f.z + Math.sin(a) * d; s = 6.5 + R() * 4; w = 0.9 + R() * 0.4; }
        else if (j < 17) { const c = clumps[j % 3], a = c.a + (R() - 0.5) * 0.8, d = c.d + (R() - 0.5) * f.r * 0.35; x = f.x + Math.cos(a) * d; z = f.z + Math.sin(a) * d; s = 3 + R() * 3; w = 1 + R() * 0.6; }
        else {
          // Low, wide flames creeping along the edge between the clumps.
          const c = clumps[j % 3], a = c.a + 1.05 + (R() - 0.5) * 1.2, d = f.r * (0.55 + R() * 0.4);
          x = f.x + Math.cos(a) * d; z = f.z + Math.sin(a) * d; s = 1.4 + R() * 1.4; w = 1.8 + R() * 1.2;
        }
        const c = { f, x, z, y: terrain.heightAt(x, z) - 0.25, s, w, k: 1, ph: R() };
        f.cells.push(c);
        this.cells.push(c);
      }
      f.wsum = f.cells.reduce((a, c) => a + c.s, 0);
    }
    for (const f of this.fires) if (f.state === 'idle') for (const c of f.cells) c.k = 0;
    this.packets = [];
    this._acc = null;
    this.impacts = [];
    this.totalOnTarget = 0;
    this.visual = !!scene; // headless (tests): the logic only
    if (this.visual) this._buildVisuals(scene, terrain);
  }

  // A fire LINE: a front `len` long — a row of tall flames along it, lower
  // ones on the burnt (upwind) side, creeping flames at the ends.
  _lineCells(f, R, terrain) {
    const n = Math.round(Math.min(56, Math.max(22, f.len / 3.2))), c0 = Math.cos(f.ang), s0 = Math.sin(f.ang);
    f.area = f.len * f.r * 2; f.br = f.len / 2 + f.r;
    for (let j = 0; j < n; j++) {
      const u = (j / (n - 1) - 0.5) * f.len + (R() - 0.5) * 3, side = j % 3;
      const v = side === 0 ? (R() - 0.5) * f.r * 0.4 : side === 1 ? -f.r * (0.35 + R() * 0.45) : f.r * (0.2 + R() * 0.3);
      const end = Math.abs(u) > f.len * 0.42;
      const x = f.x + u * c0 - v * s0, z = f.z + u * s0 + v * c0;
      const s = end ? 2.2 + R() * 2 : side === 0 ? 6 + R() * 4.5 : side === 1 ? 2.2 + R() * 2 : 3.4 + R() * 3;
      const c = { f, x, z, y: terrain.heightAt(x, z) - 0.25, s, w: side === 0 ? 1.4 + R() * 0.7 : 1.9 + R() * 1.3, k: 1, ph: R() };
      f.cells.push(c);
      this.cells.push(c);
    }
    f.wsum = f.cells.reduce((a, c) => a + c.s, 0);
  }

  setQuality(particleBudget) { this.qk = Math.min(1, Math.max(0.3, particleBudget / 6000)); if (this.smoke) this.smoke.limit = Math.round(this.smoke.max * this.qk); }

  _buildVisuals(scene, terrain) {
    // Flames: one instanced quad mesh.
    const n = this.cells.length;
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    this.inst = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aInst', this.inst);
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(this.cells.map((c) => c.ph)), 1));
    geo.setAttribute('aW', new THREE.InstancedBufferAttribute(new Float32Array(this.cells.map((c) => c.w)), 1));
    geo.instanceCount = n;
    this.uTime = { value: 0 };
    this.flames = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { uTime: this.uTime }, vertexShader: FLAME_VS, fragmentShader: FLAME_FS,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide,
    }));
    this.flames.frustumCulled = false;
    this.flames.renderOrder = 24;
    this.flames.visible = false;
    // Ember / char patches: one merged mesh, a small grid per spot laid on
    // the terrain (no flat plate cut by the slope), intensity per vertex.
    const G = 10, pos = [], uvs = [], ints = [], idx = [];
    this.patchRange = [];
    for (const f of this.fires) {
      // (A line's patch: a long ellipse round the front, its grid denser along it.)
      const line = f.kind === 'line', RU = line ? f.len / 2 + f.r * 1.2 : f.r * 1.35, RV = line ? f.r * 1.7 : RU;
      const GU = line ? Math.min(30, Math.max(G, Math.round(f.len / 10))) : G, ca = Math.cos(f.ang ?? 0), sa = Math.sin(f.ang ?? 0), o = pos.length / 3;
      for (let j = 0; j <= G; j++) for (let i = 0; i <= GU; i++) {
        const u = i / GU, v = j / G, lu = (u - 0.5) * 2 * RU, lv = (v - 0.5) * 2 * RV;
        const x = f.x + lu * ca - lv * sa, z = f.z + lu * sa + lv * ca;
        pos.push(x, terrain.heightAt(x, z) + 0.12, z); uvs.push(u, v); ints.push(1);
      }
      for (let j = 0; j < G; j++) for (let i = 0; i < GU; i++) { const a = o + j * (GU + 1) + i, b = a + 1, c = a + GU + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
      this.patchRange.push([o, (GU + 1) * (G + 1)]);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    pg.setAttribute('aUv', new THREE.Float32BufferAttribute(uvs, 2));
    this.patchI = new THREE.Float32BufferAttribute(ints, 1).setUsage(THREE.DynamicDrawUsage);
    pg.setAttribute('aI', this.patchI);
    pg.setIndex(idx);
    this.patches = new THREE.Mesh(pg, new THREE.ShaderMaterial({
      uniforms: { uTime: this.uTime }, vertexShader: PATCH_VS, fragmentShader: PATCH_FS,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    this.patches.renderOrder = 2;
    this.patches.visible = false;
    this.smoke = new ParticlePool(1600, { renderOrder: 23 });
    this.water = new ParticlePool(1400, { renderOrder: 22 });
    this.smoke.limit = Math.round(this.smoke.max * this.qk);
    this.smoke.points.visible = this.water.points.visible = false;
    scene.add(this.flames, this.patches, this.smoke.points, this.water.points);
    if (FRONTIER) { this.columns = new SmokeColumns(this.fires.length + DISTANT_FIRES.length); scene.add(this.columns.mesh); }
    this._writeFlames();
  }

  setScale(viewportHeight, fov) { if (!this.visual) return; this.smoke.setScale(viewportHeight, fov); this.water.setScale(viewportHeight, fov); }

  setActive(on) {
    this.active = !!on;
    if (this.visual) this.flames.visible = this.patches.visible = this.smoke.points.visible = this.water.points.visible = this.active;
    if (this.columns) this.columns.mesh.visible = this.active;
    if (!this.active) { this.packets.length = 0; this._acc = null; }
  }

  reset() { this.relight(this.fires.map((f) => f.id)); }

  // Spots (by id) back to unlit, nothing left on the ground (a mission
  // handed in before its fire was out).
  extinguish(ids) {
    for (const f of this.fires) {
      if (!ids.includes(f.id)) continue;
      f.intensity = 0; f.state = 'idle';
      for (const c of f.cells) c.k = 0;
    }
    this._writeFlames();
  }

  // Spots (by id) burning again from full.
  relight(ids) {
    for (const f of this.fires) {
      if (!ids.includes(f.id)) continue;
      f.intensity = 1; f.water = 0; f.state = 'burning';
      for (const c of f.cells) c.k = 1;
    }
    this.allOutT = 0;
    this._writeFlames();
  }

  _spotIntensity(f) { return f.cells.reduce((a, c) => a + c.k * c.s, 0) / f.wsum; }

  _writeFlames() {
    if (!this.visual) return;
    const a = this.inst.array;
    this.cells.forEach((c, i) => {
      // A dying flame shrinks (not fades): 0.3 of its size at the last ember.
      const k = c.f.state === 'burning' && c.k > 0.02 ? c.s * (0.3 + 0.7 * Math.sqrt(c.k)) : 0;
      a[i * 4] = c.x; a[i * 4 + 1] = c.y; a[i * 4 + 2] = c.z; a[i * 4 + 3] = k;
    });
    this.inst.needsUpdate = true;
    const p = this.patchI.array;
    this.fires.forEach((f, i) => { const [o, n] = this.patchRange[i]; p.fill(f.state === 'burning' ? f.intensity : f.state === 'idle' ? -1 : 0, o, o + n); });
    this.patchI.needsUpdate = true;
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

  // Water reaching the ground: hand it to the flames it covers. Every
  // flame gets the water per m² over it (full inside the footprint, tapering
  // at its edge); a flame needs L_PER_M2 to go out. A drop covering the
  // whole spot takes its intensity down by (litres / footprint area) /
  // L_PER_M2, as before; one covering a side only puts that side out.
  applyWater(x, z, litres, radius) {
    const area = Math.PI * radius * radius, rho = litres / area;
    let onTarget = 0, hit = false;
    for (const f of this.fires) {
      if (f.state !== 'burning') continue;
      const d = Math.hypot(f.x - x, f.z - z);
      if (d > radius + f.br) continue;
      const cellA = f.area / f.cells.length;
      let L = 0;
      for (const c of f.cells) {
        const w = 1 - Math.max(0, Math.min(1, (Math.hypot(c.x - x, c.z - z) - radius * 0.8) / (radius * 0.35)));
        if (w <= 0) continue;
        L += rho * w * cellA;
        if (c.k > 0) {
          c.k = Math.max(0, c.k - (rho * w) / L_PER_M2); hit = true;
          // Knock-down: a flame soaked to under KNOCK of its fuel cannot hold
          // (wet fuel, steam) — it goes out instead of smouldering on.
          if (c.k < KNOCK) c.k = 0;
        }
      }
      f.water += L;
      onTarget += L;
      f.intensity = this._spotIntensity(f);
      if (f.intensity <= CONTROLLED) { f.state = 'out'; f.intensity = 0; f.outT = this.time; for (const c of f.cells) c.k = 0; }
      // Steam where it hit.
      if (this.visual && L > 0) {
        const n = Math.min(14, 3 + Math.round(L / 60));
        for (let j = 0; j < n; j++) {
          const a = Math.random() * Math.PI * 2, rr = Math.min(radius, f.r) * Math.sqrt(Math.random());
          this.smoke.spawn(x + Math.cos(a) * rr, f.y + 1, z + Math.sin(a) * rr, 0, 2.5 + Math.random() * 2, 0,
            { life: 4 + Math.random() * 3, size: 5, grow: 3.5, alpha: 0.34, drag: 0.4, gravity: -0.6, color: [0.86, 0.87, 0.88] });
        }
      }
    }
    this.totalOnTarget += onTarget;
    this.impacts.push({ x, z, litres, radius, onTarget, t: this.time, hit });
    if (this.impacts.length > 64) this.impacts.shift();
    this._writeFlames();
    return onTarget;
  }

  update(dt, wind, cam = null) {
    if (!this.active) return;
    if (cam) this.cam.copy(cam);
    this.time += dt;
    if (this.visual) this.uTime.value = this.time;
    const T = this.terrain;
    // Falling water packets.
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const p = this.packets[i];
      if (p === this._acc && this.time - p.t0 < 0.05) continue;
      fallStep(p, wind, dt);
      const spread = 1.5 + p.age * 4.5;
      const n = this.visual ? Math.min(4, 1 + Math.round(p.litres / 30)) : 0;
      for (let j = 0; j < n; j++) {
        this.water.spawn(p.x + (Math.random() - 0.5) * spread, p.y + (Math.random() - 0.5) * spread * 0.6, p.z + (Math.random() - 0.5) * spread,
          p.vx * 0.6, p.vy * 0.5, p.vz * 0.6, { life: 0.7 + Math.random() * 0.5, size: 1.4 + spread * 0.5, grow: 1.6, alpha: 0.32, drag: 1.2, gravity: 4, color: [0.9, 0.93, 0.96] });
      }
      const gy = T.heightAt(p.x, p.z);
      if (p.y <= gy + 0.5 || p.age > 12) {
        this.applyWater(p.x, p.z, p.litres, FOOT0 + p.age * FOOTK);
        if (this.visual) for (let j = 0; j < 4; j++) this.water.spawn(p.x + (Math.random() - 0.5) * spread, gy + 0.3, p.z + (Math.random() - 0.5) * spread, (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3, { life: 1.4, size: 2.5, grow: 2.5, alpha: 0.3, drag: 1.5, gravity: 1, color: [0.85, 0.88, 0.9] });
        this.packets.splice(i, 1);
        if (p === this._acc) this._acc = null;
      }
    }
    // Smouldering flames slowly gain back (not the ones put out); smoke
    // from the burning ones, a continuous column bent by the wind; light
    // smoke from a spot just put out.
    let dirty = false;
    for (const f of this.fires) {
      if (f.state === 'burning') {
        for (const c of f.cells) if (c.k > 0.02 && c.k < 1) { c.k = Math.min(1, c.k + dt * 0.004); dirty = true; }
        f.intensity = this._spotIntensity(f);
        if (!this.visual) continue;
        // Smoke LOD (Fireboss Frontier): full within 900 m of the camera,
        // thinned to an eighth by 2.6 km (the impostor column carries it).
        const lod = FRONTIER ? 1 - 0.88 * Math.min(1, Math.max(0, (Math.hypot(f.x - this.cam.x, f.z - this.cam.z) - 900) / 1700)) : 1;
        const big = f.kind === 'line' ? Math.min(2.2, f.len / 80) : 1;
        let n = dt * (5 + 22 * f.intensity) * this.qk * lod * big + Math.random() * 0.999;
        while (n-- >= 1) {
          const c = f.cells[Math.floor(Math.random() * f.cells.length)];
          if (c.k < 0.05) continue;
          if (lod < 0.5) { // far: fewer, larger puffs
            this.smoke.spawn(c.x, c.y + c.s, c.z, wind.x * 0.25, 4 + 3 * f.intensity, wind.z * 0.25,
              { life: 14 + Math.random() * 6, size: 8 + c.s, grow: 13, alpha: 0.22 + 0.1 * f.intensity, drag: 0.16, gravity: -0.3, color: [0.18, 0.17, 0.16] });
            continue;
          }
          const g = 0.1 + 0.16 * Math.random(), up = 3 + 3.5 * f.intensity * c.k;
          this.smoke.spawn(c.x + (Math.random() - 0.5) * 2, c.y + c.s * 0.7, c.z + (Math.random() - 0.5) * 2, wind.x * 0.25, up, wind.z * 0.25,
            { life: 10 + Math.random() * 7, size: 3 + c.s * 0.5, grow: 9 + Math.random() * 4, alpha: (0.15 + 0.15 * f.intensity) * (0.7 + 0.6 * c.k), drag: 0.16, gravity: -0.25 - 0.2 * Math.random(), color: [g, g * 0.97, g * 0.93] });
        }
      } else if (this.visual && this.time - f.outT < 25 && Math.random() < dt * 4 * this.qk * (1 - (this.time - f.outT) / 25)) {
        this.smoke.spawn(f.x + (Math.random() - 0.5) * f.r, f.y + 1, f.z + (Math.random() - 0.5) * f.r, wind.x * 0.4, 2.2, wind.z * 0.4,
          { life: 7, size: 3.5, grow: 5, alpha: 0.2, drag: 0.25, gravity: -0.3, color: [0.68, 0.68, 0.68] });
      }
    }
    if (dirty && this.visual && ((this._wt = (this._wt || 0) + dt) > 0.5)) { this._wt = 0; this._writeFlames(); }
    if (this.columns) this.columns.update(this, wind, dt);
    if (this.autoRelight && this.fires.every((f) => f.state === 'out')) {
      this.allOutT += dt;
      if (this.allOutT > REIGNITE) this.reset();
    } else this.allOutT = 0;
    if (this.visual) {
      this.smoke.update(dt, wind, null);
      this.water.update(dt, wind, (x, z) => T.heightAt(x, z));
    }
  }

  // Smoke the air holds at a point (0 clear … 1 thick): near a burning spot,
  // and downwind of it in its plume (which rises and widens); a basin holds
  // it (Fireboss Frontier's Baixada da Fumaça). Cheap: a few spots at most
  // burn at once.
  hazeAt(x, y, z, wind) {
    if (!this.active) return 0;
    const ws = Math.hypot(wind.x, wind.z), wx = ws > 0.3 ? wind.x / ws : 1, wz = ws > 0.3 ? wind.z / ws : 0;
    let h = 0;
    for (const f of this.fires) {
      if (f.state !== 'burning' || f.intensity < 0.02) continue;
      const dx = x - f.x, dz = z - f.z, ag = y - f.y;
      const size = f.kind === 'line' ? 1.4 : 1;
      // Around the fire, low: the smoke at the source.
      h += f.intensity * size * 0.55 * Math.exp(-(dx * dx + dz * dz) / (420 * 420)) * Math.exp(-Math.max(0, ag - 120) / 260);
      // The plume: along the wind, rising to 150–600 m and widening.
      const along = dx * wx + dz * wz;
      if (along > 0 && along < 3000) {
        const lat = Math.abs(-dx * wz + dz * wx), wid = 90 + along * 0.22, mid = 80 + along * 0.18;
        h += f.intensity * size * 0.5 * Math.exp(-(lat * lat) / (wid * wid)) * Math.exp(-((ag - mid) ** 2) / ((140 + along * 0.15) ** 2)) * (1 - along / 3000);
      }
    }
    if (h > 0 && FRONTIER) {
      const B = SMOKE_BASIN, ex = Math.max(0, Math.abs(x - B.c[0]) - B.half[0]), ez = Math.max(0, Math.abs(z - B.c[1]) - B.half[1]);
      h *= 1 + (B.haze - 1) * Math.exp(-(ex * ex + ez * ez) / (300 * 300)) * Math.exp(-Math.max(0, y - 120) / 200);
    }
    // (Never thicker than 0.85: the player is challenged, not blinded.)
    return Math.min(0.85, h * 0.65);
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

// ---------------------------------------------------------------------------
// Impostor smoke columns (Fireboss Frontier): one tall camera-facing quad per
// burning spot and per distant fire, turned about the vertical only, leaning
// downwind, its billows drawn by a scrolling noise in the shader — what the
// particles cannot carry kilometres away. One instanced draw; near the camera
// the column fades out (the particles take over).
const COL_VS = /* glsl */ `
attribute vec4 aBase; // x, y, z, height
attribute vec4 aLook; // width, alpha, glow, seed
uniform vec2 uLean;
varying vec2 vUv;
varying vec4 vLook;
varying float vFade;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vLook = aLook;
  vec3 toCam = cameraPosition - aBase.xyz;
  vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-4, 0.0, 0.0));
  float y = uv.y, H = aBase.w;
  vec3 p = aBase.xyz + right * position.x * aLook.x * (0.3 + 1.1 * y) + vec3(0.0, y * H, 0.0) + vec3(uLean.x, 0.0, uLean.y) * y * y * H;
  float d = length(toCam);
  vFade = smoothstep(380.0, 900.0, d);
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const COL_FS = /* glsl */ `
uniform float uTime;
uniform vec3 uLight;
varying vec2 vUv;
varying vec4 vLook;
varying float vFade;
#include <fog_pars_fragment>
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  float y = vUv.y, x = vUv.x - 0.5;
  vec2 q = vec2(vUv.x * 2.6 + vLook.w * 7.0, y * 4.0 - uTime * 0.05 - vLook.w * 3.0);
  float n = n2(q) * 0.5 + n2(q * 2.1 + 3.3) * 0.3 + n2(q * 4.3 - 1.1) * 0.2;
  float hw = 0.5 * (0.45 + 0.55 * smoothstep(0.0, 0.5, y)) * (0.75 + 0.5 * n);
  float a = smoothstep(hw, hw * 0.25, abs(x + (n - 0.5) * 0.25 * y));
  a *= smoothstep(0.0, 0.06, y) * (1.0 - smoothstep(0.55 + 0.35 * n, 1.0, y));
  a *= vLook.y * vFade * (0.65 + 0.5 * n);
  if (a < 0.01) discard;
  vec3 dark = vec3(0.16, 0.15, 0.14), lite = vec3(0.6, 0.58, 0.55);
  vec3 col = mix(dark, lite, smoothstep(0.05, 0.75, y) * (0.6 + 0.6 * n)) * uLight;
  col = mix(col, vec3(1.0, 0.45, 0.12), vLook.z * (1.0 - smoothstep(0.0, 0.12, y)) * 0.8);
  gl_FragColor = vec4(col, min(1.0, a));
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
class SmokeColumns {
  constructor(max) {
    const quad = new THREE.PlaneGeometry(1, 1, 1, 6).translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    this.base = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.look = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aBase', this.base);
    geo.setAttribute('aLook', this.look);
    geo.instanceCount = 0;
    this.u = { uTime: { value: 0 }, uLean: { value: new THREE.Vector2() }, uLight: { value: new THREE.Color(1, 1, 1) } };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]), vertexShader: COL_VS, fragmentShader: COL_FS,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    }));
    Object.assign(this.mesh.material.uniforms, this.u);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 21;
    this.lvl = new Float32Array(max); // eased strength per column
    this.max = max;
  }
  update(field, wind, dt) {
    this.u.uTime.value += dt;
    const ws = Math.hypot(wind.x, wind.z);
    this.u.uLean.value.set(ws > 0.2 ? (wind.x / ws) * Math.min(0.6, ws * 0.07) : 0, ws > 0.2 ? (wind.z / ws) * Math.min(0.6, ws * 0.07) : 0);
    const B = this.base.array, L = this.look.array;
    let n = 0;
    const put = (k, x, y, z, H, W, A, glow, seed) => {
      this.lvl[k] += (A - this.lvl[k]) * Math.min(1, dt * 0.35); // columns build and die slowly
      if (this.lvl[k] < 0.01) return;
      B.set([x, y, z, H], n * 4); L.set([W, this.lvl[k], glow, seed], n * 4); n++;
    };
    field.fires.forEach((f, i) => {
      const on = f.state === 'burning' ? f.intensity : 0, big = f.kind === 'line' ? 1.5 : 1;
      put(i, f.x, f.y, f.z, (260 + 220 * on) * big, (70 + 50 * on) * big, 0.55 * Math.sqrt(on), on, i * 0.37);
    });
    DISTANT_FIRES.forEach(([x, z, s], j) => put(field.fires.length + j, x, 0, z, 520 * s, 210 * s, 0.6, 0, 3.1 + j * 0.71));
    this.base.needsUpdate = this.look.needsUpdate = true;
    this.mesh.geometry.instanceCount = n;
  }
}
