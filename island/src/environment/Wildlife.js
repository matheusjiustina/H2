import * as THREE from 'three';
import { patchMaterial } from '../core/MaterialPatch.js';
import { U, GLSL_UNIFORMS, LAYER } from '../core/Shared.js';
import { rng, smoothstep, clamp, damp } from '../utils/MathUtils.js';
import { PIER, ISLET } from '../world/Layout.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Flapping animation injected into an instanced material: aFlap.x = wing weight, aFlap.y = side */
function flapPatch(mat, freqUniform, ampUniform, key) {
  patchMaterial(mat, {
    wet: 0, canopy: false, caustics: false, key,
    uniforms: { uFlapFreq: freqUniform, uFlapAmp: ampUniform },
    vertex: (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('attribute vec4 aWind;', 'attribute vec4 aWind;\nattribute vec2 aFlap;\nuniform float uFlapFreq;\nuniform float uFlapAmp;')
        .replace('vec3 transformed = vec3( position );', `vec3 transformed = vec3( position );
{
  #ifdef USE_INSTANCING
  float _ph = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
  float _glide = smoothstep(0.2, 0.8, sin(uTime * 0.37 + _ph * 3.0) * 0.5 + 0.5);
  #else
  float _ph = 0.0; float _glide = 0.0;
  #endif
  float _a = sin(uTime * uFlapFreq + _ph) * uFlapAmp * mix(1.0, 0.15, _glide);
  float _w = aFlap.x;
  transformed.y += _w * abs(transformed.x) * sin(_a) * 1.2;
  transformed.x *= mix(1.0, cos(_a), _w);
}`);
    },
  });
}

function birdGeometry(span, body) {
  // body + two wings (flat, slightly swept)
  const pos = [], flap = [], idx = [];
  const v = (x, y, z, w) => { pos.push(x, y, z); flap.push(w, Math.sign(x)); return pos.length / 3 - 1; };
  // body diamond
  const b0 = v(0, 0, body * 0.6, 0), b1 = v(0.06 * body, 0.02, 0, 0), b2 = v(-0.06 * body, 0.02, 0, 0), b3 = v(0, -0.02, -body * 0.5, 0), b4 = v(0, 0.05, 0, 0);
  idx.push(b0, b1, b4, b0, b4, b2, b1, b3, b4, b4, b3, b2);
  for (const s of [-1, 1]) {
    const r0 = v(0.05 * s * body, 0.02, 0.12 * body, 0.0);
    const r1 = v(0.05 * s * body, 0.02, -0.12 * body, 0.0);
    const t0 = v(span * 0.5 * s, 0.05, -0.1 * body, 1);
    const m0 = v(span * 0.28 * s, 0.03, 0.08 * body, 0.55);
    if (s > 0) idx.push(r0, r1, m0, m0, r1, t0); else idx.push(r0, m0, r1, m0, t0, r1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFlap', new THREE.Float32BufferAttribute(flap, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function fishGeometry(len) {
  const g = new THREE.SphereGeometry(len * 0.5, 10, 6);
  g.scale(0.32, 0.42, 1);
  const p = g.attributes.position;
  const tail = [];
  for (let i = 0; i < p.count; i++) tail.push(Math.max(0, -p.getZ(i) / (len * 0.5)));
  // tail fin
  const tailG = new THREE.BufferGeometry();
  tailG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -len * 0.45, 0, len * 0.22, -len * 0.75, 0, -len * 0.22, -len * 0.75], 3));
  tailG.computeVertexNormals();
  const merged = new THREE.BufferGeometry();
  const pa = [...p.array, ...tailG.attributes.position.array];
  const idx = [...g.index.array, p.count, p.count + 1, p.count + 2, p.count, p.count + 2, p.count + 1];
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pa, 3));
  merged.setAttribute('aFlap', new THREE.Float32BufferAttribute([...tail.flatMap((t) => [t, 0]), 1.6, 0, 2, 0, 2, 0], 2));
  merged.setIndex(idx);
  merged.computeVertexNormals();
  return merged;
}

/**
 * Low cost ambient life: seabirds circling the lagoon, butterflies near the player,
 * fish schools + a stingray in the shallows, fireflies at night, beach crabs.
 */
export class Wildlife {
  constructor({ scene, terrainData, ocean, quality = 'high' }) {
    this.scene = scene;
    this.td = terrainData;
    this.ocean = ocean;
    this.r = rng(1234);
    this.time = 0;
    this._buildBirds();
    this._buildFish();
    this._buildButterflies();
    this._buildFireflies();
    this._buildCrabs();
  }

  _buildBirds() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.8, side: THREE.DoubleSide });
    flapPatch(mat, { value: 5.5 }, { value: 0.55 }, 'bird');
    const n = 14;
    this.birds = [];
    for (let i = 0; i < n; i++) {
      const r = this.r;
      const coast = i < 9;
      this.birds.push({
        cx: coast ? -200 + r() * 450 : -150 + r() * 300, cz: coast ? -40 - r() * 260 : 150 + r() * 150,
        rad: 25 + r() * 70, h: coast ? 18 + r() * 40 : 70 + r() * 60, w: (0.12 + r() * 0.1) * (r() < 0.5 ? 1 : -1), ph: r() * 6.28, bob: r() * 6.28,
      });
    }
    this.birdMesh = new THREE.InstancedMesh(birdGeometry(1.6, 1), mat, n);
    this.birdMesh.frustumCulled = false;
    this.birdMesh.castShadow = false;
    this.birdMesh.layers.set(LAYER.WORLD);
    this.scene.add(this.birdMesh);
  }

  _buildFish() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x8aa6a8, roughness: 0.35, metalness: 0.3 });
    flapPatch(mat, { value: 9 }, { value: 0.35 }, 'fish');
    // tail wiggle uses the same flap attribute but rotates around Y: reuse by swapping axes in geometry orientation
    mat.onBeforeCompile = ((orig) => (shader, r) => {
      orig(shader, r);
      shader.vertexShader = shader.vertexShader.replace('transformed.y += _w * abs(transformed.x) * sin(_a) * 1.2;\n  transformed.x *= mix(1.0, cos(_a), _w);', 'transformed.x += _w * sin(uTime * uFlapFreq * 1.3 + _ph + transformed.z * 6.0) * 0.06;');
    })(mat.onBeforeCompile);
    this.schools = [];
    const centers = [[PIER.x + 3, PIER.zEnd + 8], [PIER.x - 5, -32], [ISLET.x - 30, ISLET.z + 20], [-60, -150], [60, -240], [-200, -230], [150, -110]];
    let total = 0;
    for (const [x, z] of centers) {
      const count = 14 + Math.floor(this.r() * 14);
      this.schools.push({ x, z, ox: x, oz: z, count, start: total, ang: this.r() * 6.28, speed: 0.06 + this.r() * 0.08, rad: 4 + this.r() * 8, size: 0.18 + this.r() * 0.15, offs: Array.from({ length: count }, () => [this.r() * 2 - 1, this.r() * 2 - 1, this.r() * 2 - 1, this.r() * 6.28]) });
      total += count;
    }
    this.fishMesh = new THREE.InstancedMesh(fishGeometry(1), mat, total);
    this.fishMesh.frustumCulled = false;
    this.fishMesh.layers.set(LAYER.DETAIL);
    this.fishMesh.receiveShadow = true;
    this.scene.add(this.fishMesh);
    // stingrays
    const ray = new THREE.BufferGeometry();
    const rp = [0, 0, 0.5, 0.55, 0, 0, 0, 0, -0.35, -0.55, 0, 0, 0, 0.04, 0, 0, 0, -1.2];
    ray.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    ray.setAttribute('aFlap', new THREE.Float32BufferAttribute([0, 0, 1, 1, 0, 0, 1, -1, 0, 0, 0, 0], 2));
    ray.setIndex([0, 1, 4, 4, 1, 2, 0, 4, 3, 4, 2, 3, 2, 5, 2]);
    ray.computeVertexNormals();
    const rmat = new THREE.MeshStandardMaterial({ color: 0x5c564a, roughness: 0.7, side: THREE.DoubleSide });
    flapPatch(rmat, { value: 1.6 }, { value: 0.3 }, 'ray');
    this.rays = [{ x: PIER.x - 6, z: -30, a: 0, s: 0.4 }, { x: 40, z: -80, a: 2, s: 0.5 }];
    this.rayMesh = new THREE.InstancedMesh(ray, rmat, this.rays.length);
    this.rayMesh.frustumCulled = false;
    this.rayMesh.layers.set(LAYER.DETAIL);
    this.scene.add(this.rayMesh);
  }

  _buildButterflies() {
    const n = 26;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.03, 0.05, 0, 0.02, 0.045, 0, -0.03, 0, 0, -0.02, -0.05, 0, 0.02, -0.045, 0, -0.03], 3));
    geo.setAttribute('aFlap', new THREE.Float32BufferAttribute([0, 0, 1, 1, 1, 1, 0, 0, 1, -1, 1, -1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 5, 0, 5, 4]);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x000000 });
    flapPatch(mat, { value: 22 }, { value: 1.0 }, 'butterfly');
    this.flyMesh = new THREE.InstancedMesh(geo, mat, n);
    this.flyMesh.frustumCulled = false;
    this.flyMesh.layers.set(LAYER.DETAIL);
    const cols = [0x2f7fe0, 0xf09a28, 0xf3e7a0, 0xe04f3a, 0x46c2d8];
    this.flies = [];
    for (let i = 0; i < n; i++) {
      this.flyMesh.setColorAt(i, new THREE.Color(cols[i % cols.length]).multiplyScalar(1.4));
      this.flies.push({ x: 0, y: 0, z: 0, vx: 0, vz: 0, home: null, t: this.r() * 10, alive: false });
    }
    this.scene.add(this.flyMesh);
  }

  _buildFireflies() {
    const n = 90;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) seed[i] = this.r();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: `${GLSL_UNIFORMS}\nattribute float aSeed; varying float vB;\nvoid main(){ vec4 mv = viewMatrix * modelMatrix * vec4(position,1.0); float blink = pow(max(0.0, sin(uTime * (1.2 + aSeed) + aSeed * 40.0)), 6.0); vB = blink * uNight; gl_PointSize = (2.0 + 70.0 * blink) / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: 'varying float vB; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vB; if (a < 0.01) discard; gl_FragColor = vec4(vec3(2.6, 3.4, 1.0) * a, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.fireflies = new THREE.Points(geo, mat);
    this.fireflies.frustumCulled = false;
    this.fireflies.layers.set(LAYER.FX);
    this.ffData = Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0, a: this.r() * 6.28, home: null }));
    this.scene.add(this.fireflies);
  }

  _buildCrabs() {
    const body = new THREE.SphereGeometry(0.06, 10, 6);
    body.scale(1.3, 0.5, 1);
    const parts = [body];
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const leg = new THREE.CylinderGeometry(0.006, 0.004, 0.09, 4);
        leg.rotateZ(s * 1.0);
        leg.translate(s * 0.08, -0.01, -0.03 + k * 0.03);
        parts.push(leg);
      }
      const claw = new THREE.SphereGeometry(0.022, 6, 4);
      claw.translate(s * 0.06, 0.0, 0.07);
      parts.push(claw);
    }
    const merged = new THREE.BufferGeometry();
    let pos = [], idx = [], off = 0;
    for (const g of parts) {
      const ng = g.index ? g : g;
      pos = pos.concat(Array.from(ng.attributes.position.array));
      idx = idx.concat(Array.from(ng.index.array).map((i) => i + off));
      off += ng.attributes.position.count;
    }
    merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    merged.setIndex(idx);
    merged.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xc8643a, roughness: 0.5 });
    patchMaterial(mat, { wet: 0.5, key: 'crab' });
    this.crabs = [];
    const spots = [[-10, -16], [-30, -18], [18, -18], [-60, -20], [35, -21], [ISLET.x + 10, ISLET.z + 15], [-120, -24], [70, -26]];
    for (const [x, z] of spots) this.crabs.push({ x, z, hx: x, hz: z, state: 'idle', t: this.r() * 3, dir: this.r() * 6.28, hidden: 0 });
    this.crabMesh = new THREE.InstancedMesh(merged, mat, this.crabs.length);
    this.crabMesh.castShadow = true;
    this.crabMesh.frustumCulled = false;
    this.crabMesh.layers.set(LAYER.DETAIL);
    this.scene.add(this.crabMesh);
  }

  update(dt, game) {
    this.time += dt;
    const t = this.time;
    const cam = game.camera.position;
    const day = 1 - game.timeOfDay.night;
    const rain = game.weather.rain || 0;

    // --- birds
    this.birds.forEach((b, i) => {
      b.ph += b.w * dt * (1 + rain * 0.5);
      const x = b.cx + Math.cos(b.ph) * b.rad, z = b.cz + Math.sin(b.ph) * b.rad;
      const y = b.h + Math.sin(t * 0.3 + b.bob) * 3;
      const heading = Math.atan2(-Math.sin(b.ph) * Math.sign(b.w), Math.cos(b.ph) * Math.sign(b.w));
      _e.set(0, heading, -Math.sign(b.w) * 0.35, 'YXZ');
      _q.setFromEuler(_e);
      const sc = day > 0.2 ? 1 : 0.001;
      _m.compose(_p.set(x, y, z), _q, _s.set(sc, sc, sc));
      this.birdMesh.setMatrixAt(i, _m);
    });
    this.birdMesh.instanceMatrix.needsUpdate = true;

    // --- fish schools
    for (const s of this.schools) {
      s.ang += s.speed * dt;
      const tx = s.ox + Math.cos(s.ang) * s.rad, tz = s.oz + Math.sin(s.ang * 1.3) * s.rad;
      const floor = this.td.heightAt(tx, tz);
      const surf = 0;
      const depth = surf - floor;
      const midY = floor + Math.min(Math.max(depth * 0.45, 0.3), 3);
      const head = Math.atan2(-Math.sin(s.ang) * s.rad * s.speed, Math.cos(s.ang * 1.3) * 1.3 * s.rad * s.speed);
      for (let k = 0; k < s.count; k++) {
        const o = s.offs[k];
        const fx = tx + o[0] * 1.6 + Math.sin(t * 0.8 + o[3]) * 0.3;
        const fz = tz + o[2] * 1.6 + Math.cos(t * 0.7 + o[3]) * 0.3;
        let fy = midY + o[1] * 0.35;
        const fl = this.td.heightAt(fx, fz);
        const visible = depth > 0.5 && fy > fl + 0.12 && fy < surf - 0.2;
        if (fy < fl + 0.15) fy = fl + 0.15;
        _e.set(0, head + o[0] * 0.2 + Math.sin(t * 2 + o[3]) * 0.1, 0, 'YXZ');
        _q.setFromEuler(_e);
        const sc = visible ? s.size * (0.8 + (o[1] + 1) * 0.2) : 0.0001;
        _m.compose(_p.set(fx, fy, fz), _q, _s.set(sc, sc, sc));
        this.fishMesh.setMatrixAt(s.start + k, _m);
      }
    }
    this.fishMesh.instanceMatrix.needsUpdate = true;
    this.rays.forEach((r, i) => {
      r.a += dt * 0.08;
      const x = r.x + Math.cos(r.a) * 12, z = r.z + Math.sin(r.a * 0.7) * 9;
      const y = this.td.heightAt(x, z) + 0.12;
      const head = Math.atan2(-Math.sin(r.a) * 12, Math.cos(r.a * 0.7) * 0.7 * 9) + Math.PI;
      _q.setFromEuler(_e.set(0, head, 0));
      const ok = y < -0.3;
      _m.compose(_p.set(x, y, z), _q, _s.setScalar(ok ? r.s * 1.6 : 0.0001));
      this.rayMesh.setMatrixAt(i, _m);
    });
    this.rayMesh.instanceMatrix.needsUpdate = true;

    // --- butterflies: wander around flowering edges near the player in fair daytime weather
    const active = day > 0.6 && rain < 0.15;
    this.flies.forEach((f, i) => {
      f.t += dt;
      if (!f.home || Math.hypot(f.home.x - cam.x, f.home.z - cam.z) > 45) {
        const a = this.r() * 6.28, d = 8 + this.r() * 30;
        const hx = cam.x + Math.cos(a) * d, hz = cam.z + Math.sin(a) * d;
        const s = this.td.splatAt(hx, hz, {});
        const h = this.td.heightAt(hx, hz);
        if (h > 1.2 && s.rock < 0.5) { f.home = { x: hx, z: hz, y: h }; f.x = hx; f.z = hz; f.y = h + 1; }
      }
      if (!f.home) return;
      const ang = Math.sin(f.t * 0.7 + i) * 3 + f.t * 0.4;
      f.vx = damp(f.vx, Math.cos(ang) * 1.2, 2, dt);
      f.vz = damp(f.vz, Math.sin(ang) * 1.2, 2, dt);
      f.x += f.vx * dt + (f.home.x - f.x) * dt * 0.15;
      f.z += f.vz * dt + (f.home.z - f.z) * dt * 0.15;
      const gy = this.td.heightAt(f.x, f.z);
      f.y = damp(f.y, gy + 0.7 + Math.sin(f.t * 2.3 + i) * 0.45 + 0.4, 3, dt);
      _q.setFromEuler(_e.set(Math.sin(f.t * 5) * 0.2, Math.atan2(f.vx, f.vz), 0));
      const sc = active ? 1.4 : 0.0001;
      _m.compose(_p.set(f.x, f.y, f.z), _q, _s.setScalar(sc));
      this.flyMesh.setMatrixAt(i, _m);
    });
    this.flyMesh.instanceMatrix.needsUpdate = true;

    // --- fireflies around the jungle edge near the player at night
    if (game.timeOfDay.night > 0.3) {
      const pos = this.fireflies.geometry.attributes.position.array;
      this.ffData.forEach((f, i) => {
        if (!f.home || Math.hypot(f.home.x - cam.x, f.home.z - cam.z) > 40) {
          const a = this.r() * 6.28, d = 5 + this.r() * 28;
          const hx = cam.x + Math.cos(a) * d, hz = cam.z + Math.sin(a) * d;
          f.home = { x: hx, z: hz };
        }
        f.a += dt * 0.5;
        f.x = f.home.x + Math.sin(f.a + i) * 1.5;
        f.z = f.home.z + Math.cos(f.a * 0.8 + i * 2) * 1.5;
        f.y = this.td.heightAt(f.x, f.z) + 0.6 + Math.sin(f.a * 1.7 + i) * 0.6 + 0.6;
        pos[i * 3] = f.x; pos[i * 3 + 1] = f.y; pos[i * 3 + 2] = f.z;
      });
      this.fireflies.geometry.attributes.position.needsUpdate = true;
      this.fireflies.visible = true;
    } else this.fireflies.visible = false;

    // --- crabs: scuttle away from the player, hide, come back later
    const pl = game.player.pos;
    this.crabs.forEach((c, i) => {
      const d = Math.hypot(c.x - pl.x, c.z - pl.z);
      if (c.state === 'idle') {
        c.t -= dt;
        if (c.t < 0) { c.t = 1 + this.r() * 3; c.dir = this.r() * 6.28; c.state = 'walk'; }
        if (d < 3.2) { c.state = 'flee'; c.dir = Math.atan2(c.z - pl.z, c.x - pl.x); c.t = 1.4; }
      } else if (c.state === 'walk') {
        c.t -= dt;
        c.x += Math.cos(c.dir) * 0.25 * dt; c.z += Math.sin(c.dir) * 0.25 * dt;
        if (c.t < 0) { c.state = 'idle'; c.t = 1 + this.r() * 4; }
        if (d < 3.2) { c.state = 'flee'; c.dir = Math.atan2(c.z - pl.z, c.x - pl.x); c.t = 1.4; }
        if (Math.hypot(c.x - c.hx, c.z - c.hz) > 5) c.dir = Math.atan2(c.hz - c.z, c.hx - c.x);
      } else if (c.state === 'flee') {
        c.t -= dt;
        c.x += Math.cos(c.dir) * 1.6 * dt; c.z += Math.sin(c.dir) * 1.6 * dt;
        if (c.t < 0) { c.state = 'hidden'; c.hidden = 20 + this.r() * 30; }
      } else if (c.state === 'hidden') {
        c.hidden -= dt;
        if (c.hidden < 0 && d > 15) { c.x = c.hx; c.z = c.hz; c.state = 'idle'; }
      }
      const y = this.td.heightAt(c.x, c.z);
      const water = y < 0.05;
      const show = c.state !== 'hidden' && !water ? 1 : 0.0001;
      _q.setFromEuler(_e.set(0, -c.dir + Math.PI / 2, 0));
      _m.compose(_p.set(c.x, y + 0.025, c.z), _q, _s.setScalar(show));
      this.crabMesh.setMatrixAt(i, _m);
    });
    this.crabMesh.instanceMatrix.needsUpdate = true;
  }
}
