import * as THREE from 'three';
import { LAYER, U, GLSL_UNIFORMS, GLSL_COMMON } from '../core/Shared.js';
import { wornPaint } from '../environment/PropMaterials.js';
import { woodBox, place, merge, ropeGeometry } from '../environment/PropFactory.js';
import { clamp, damp, lerp, wrapAngle, smoothstep } from '../utils/MathUtils.js';
import { PIER, WORLD } from '../world/Layout.js';

const L = 4.4;
const HALF = L / 2;
const DRAFT = 0.16;

function halfBeam(s) { return 0.76 * Math.pow(Math.sin(Math.PI * (0.25 + 0.75 * s)), 0.75) + (s < 0.02 ? 0 : 0); }
function keelY(s) { return -0.42 + 0.3 * Math.pow(s, 2.6); }
function sheerY(s) { return 0.2 + 0.28 * Math.pow(s, 2.2); }

/** Lofted hull surface (outer or inner). */
function hullSurface(inset = 0, flip = false) {
  const ns = 26, nc = 10;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= ns; i++) {
    const s = i / ns;
    const z = -HALF + s * L;
    const b = Math.max(0.001, halfBeam(s) - inset);
    const ky = keelY(s) + inset, sy = sheerY(s);
    for (let j = 0; j <= nc * 2; j++) {
      const t = j / (nc * 2) * 2 - 1; // -1 port gunwale .. 0 keel .. 1 starboard gunwale
      const a = Math.abs(t) * Math.PI * 0.5;
      const x = Math.sign(t) * b * Math.pow(Math.sin(a), 0.6);
      const y = ky + (sy - ky) * Math.pow(1 - Math.cos(a), 1.15);
      pos.push(x, y, z);
      uv.push(z / 1.6, (t + 1) * 0.8);
    }
  }
  const w = nc * 2 + 1;
  for (let i = 0; i < ns; i++) {
    for (let j = 0; j < nc * 2; j++) {
      const a = i * w + j, b = a + w;
      if (flip) idx.push(a, a + 1, b + 1, a, b + 1, b);
      else idx.push(a, b + 1, a + 1, a, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const col = new Float32Array(pos.length).fill(1);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const WAKE_VERT = /* glsl */ `
attribute float aAge;
attribute float aSide;
varying float vAge;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vAge = aAge;
  vUv = vec2(aSide, aAge);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const WAKE_FRAG = /* glsl */ `
${GLSL_UNIFORMS}
${GLSL_COMMON}
uniform sampler2D uFoam;
varying float vAge;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  float f = texture2D(uFoam, vWorld.xz * 0.35).r;
  float edge = 1.0 - abs(vUv.x);
  float center = smoothstep(0.0, 0.5, edge);
  float trail = (1.0 - smoothstep(0.0, 1.0, vAge));
  float a = smoothstep(0.35, 0.8, f + edge * 0.5) * trail * (0.35 + 0.65 * center) * 0.85;
  vec3 col = (uAmbient * 1.0 + uSunColor * max(uSunDir.y, 0.0) * 0.3) * vec3(0.95, 0.98, 1.0);
  gl_FragColor = vec4(applyAtmosphere(col, vWorld), a);
}`;

export class Boat {
  constructor({ scene, materials, textures, ocean, terrainData, collision, particles, ripples, interaction, camp }) {
    this.scene = scene;
    this.ocean = ocean;
    this.td = terrainData;
    this.collision = collision;
    this.particles = particles;
    this.ripples = ripples;
    this.camp = camp;
    this.M = materials;

    this.group = new THREE.Group();
    this.group.name = 'boat';
    this.hull = new THREE.Group();
    this.group.add(this.hull);
    this._buildModel(materials);
    scene.add(this.group);

    // physics state
    this.heading = Math.PI; // bow faces -Z (out to the lagoon)
    this.pos = new THREE.Vector3(PIER.x + PIER.endWidth / 2 + 1.05, 0, PIER.zEnd + 2.6);
    this.vel = new THREE.Vector2();
    this.angVel = 0;
    this.y = 0; this.vy = 0;
    this.pitch = 0; this.vpitch = 0;
    this.roll = 0; this.vroll = 0;
    this.throttle = 0;
    this.steer = 0;
    this.moored = true;
    this.mooringPoint = camp.mooring.clone();
    this.mooringAnchor = this.pos.clone();
    this.occupied = false;
    this.prompt = '';
    this.lookYaw = 0;
    this.lookPitch = -0.05;
    this.scrapeTimer = 0;
    this.wakeTimer = 0;
    this._v = new THREE.Vector3();

    // interactable on the hull
    this.interactable = interaction.add({
      object: this.hull, name: 'boat', interactionDistance: 4.6,
      interactionLabel: () => 'Board the skiff',
      onInteract: (game) => this.board(game),
    });

    this._buildRope();
    this._buildWake(textures);
  }

  _buildModel(M) {
    const paint = wornPaint(0xe4ddcb, { bare: 0x7a5c40, wear: 0.3, rust: 0, scale: 0.8, bareMetal: 0, roughness: 0.55, metalness: 0 });
    paint.side = THREE.DoubleSide;
    this.paint = paint;
    const innerWood = M.wood.clone();
    innerWood.side = THREE.DoubleSide;
    innerWood.onBeforeCompile = M.wood.onBeforeCompile;
    innerWood.customProgramCacheKey = M.wood.customProgramCacheKey;
    const outer = new THREE.Mesh(hullSurface(0, true), paint);
    outer.castShadow = true; outer.receiveShadow = true;
    const inner = new THREE.Mesh(hullSurface(0.03, false), innerWood);
    inner.castShadow = false; inner.receiveShadow = true;
    const parts = [];
    // gunwale rails
    const rail = [];
    for (let i = 0; i <= 24; i++) {
      const s = i / 24;
      rail.push(new THREE.Vector3(halfBeam(s), sheerY(s) + 0.02, -HALF + s * L));
    }
    const railCurve = new THREE.CatmullRomCurve3(rail);
    const railG = new THREE.TubeGeometry(railCurve, 40, 0.03, 5, false);
    const railG2 = railG.clone().scale(-1, 1, 1);
    // flip winding of mirrored rail
    const ix = railG2.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; }
    railG2.computeVertexNormals();
    // seats / thwarts / floorboards / transom
    const seat = (s, w) => place(woodBox(halfBeam(s) * 2 - 0.08, 0.035, w, { seed: s * 100 }), 0, sheerY(s) - 0.18, -HALF + s * L);
    parts.push(seat(0.3, 0.26), seat(0.62, 0.24));
    parts.push(place(woodBox(halfBeam(0.06) * 2 - 0.1, 0.035, 0.42, { seed: 7 }), 0, sheerY(0.06) - 0.17, -HALF + 0.06 * L + 0.12));
    for (let k = -2; k <= 2; k++) parts.push(place(woodBox(L * 0.62, 0.025, 0.12, { seed: 50 + k }), k * 0.13, keelY(0.4) + 0.08 + Math.abs(k) * 0.025, -0.15, 0, Math.PI / 2));
    const transom = place(woodBox(halfBeam(0) * 2 + 0.02, sheerY(0) - keelY(0) + 0.04, 0.04, { seed: 9 }), 0, (sheerY(0) + keelY(0)) / 2, -HALF + 0.01);
    parts.push(transom);
    const woodParts = new THREE.Mesh(merge(parts), M.wood);
    woodParts.castShadow = true; woodParts.receiveShadow = true;
    const rails = new THREE.Mesh(merge([railG, railG2]), M.woodDark);
    rails.castShadow = true;
    // boot stripe as thin band just below the rail
    this.hull.add(outer, inner, woodParts, rails);

    // outboard motor
    const motor = new THREE.Group();
    const cowl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.42), M.metalBlack);
    cowl.position.set(0, 0.38, -0.18);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 8), M.metalBlack);
    cap.scale.set(0.75, 0.45, 1.05);
    cap.position.set(0, 0.56, -0.18);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.8, 8), M.metal);
    shaft.position.set(0, -0.1, -0.22);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.24, 10), M.metal);
    foot.rotation.x = Math.PI / 2;
    foot.position.set(0, -0.48, -0.25);
    this.prop = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.06), M.metal);
    this.prop.position.set(0, -0.48, -0.4);
    const tiller = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.62, 8), M.metalBlack);
    tiller.rotation.x = Math.PI / 2 - 0.18;
    tiller.position.set(0, 0.42, 0.22);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.14, 8), M.leather);
    grip.rotation.x = Math.PI / 2 - 0.18;
    grip.position.set(0, 0.47, 0.5);
    motor.add(cowl, cap, shaft, foot, this.prop, tiller, grip);
    motor.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    motor.position.set(0, sheerY(0) - 0.12, -HALF - 0.08);
    this.motor = motor;
    this.hull.add(motor);
    // bits in the boat: fuel can, oar, rope
    const oar = place(woodBox(2.4, 0.04, 0.07, { seed: 33 }), 0.35, keelY(0.5) + 0.2, 0.2, 0.08, Math.PI / 2 - 0.08);
    const oarMesh = new THREE.Mesh(merge([oar, place(woodBox(0.5, 0.012, 0.15, { seed: 34 }), 0.35, keelY(0.5) + 0.2, 1.4, 0.08, Math.PI / 2 - 0.08)]), M.wood);
    oarMesh.castShadow = true;
    this.hull.add(oarMesh);
    this.hull.traverse((o) => o.layers.set(LAYER.WORLD));
  }

  _buildRope() {
    this.ropeMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.M.rope);
    this.ropeMesh.castShadow = true;
    this.ropeMesh.layers.set(LAYER.DETAIL);
    this.scene.add(this.ropeMesh);
    this._ropeTimer = 0;
  }

  _buildWake(textures) {
    const N = 80;
    this.wakeN = N;
    this.wakePts = [];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    geo.setAttribute('aAge', new THREE.BufferAttribute(new Float32Array(N * 2), 1));
    const side = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { side[i * 2] = -1; side[i * 2 + 1] = 1; }
    geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    const idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({ vertexShader: WAKE_VERT, fragmentShader: WAKE_FRAG, uniforms: { ...U, uFoam: { value: textures.foam } }, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.wake = new THREE.Mesh(geo, mat);
    this.wake.frustumCulled = false;
    this.wake.layers.set(LAYER.FX);
    this.wake.renderOrder = 5;
    this.scene.add(this.wake);
  }

  // ------------------------------------------------------------------ boarding
  board(game) {
    if (this.occupied) return;
    this.occupied = true;
    this.boardedAt = game.time;
    this.ignoreInteract = true;
    this.moored = false;
    game.player.mode = 'boat';
    game.player.vel.set(0, 0, 0);
    this.lookYaw = 0;
    this.lookPitch = -0.05;
    game.inventory.unequip();
    this.interactable.enabled = false;
    game.audio?.play('knock', { volume: 0.5 });
    game.toast('W / S throttle · A / D steer · E to step out');
  }

  exit(game) {
    // find somewhere to stand: pier deck, shore, or the water
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const right = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    const candidates = [];
    for (const side of [-1, 1]) for (const along of [0, 1, -1]) for (const dist of [1.4, 2.2, 3.2]) candidates.push(this.pos.clone().addScaledVector(right, side * dist).addScaledVector(fwd, along));
    let best = null;
    for (const c of candidates) {
      const g = this.collision.ground(c.x, c.z, 50);
      const water = this.ocean.heightAt(c.x, c.z);
      if (g.y > water + 0.05) { best = { x: c.x, z: c.z, y: g.y }; break; }
    }
    this.occupied = false;
    this.interactable.enabled = true;
    this.throttle = 0;
    game.player.mode = 'walk';
    if (best) {
      game.player.spawn(best.x, best.z, game.player.yaw, 0);
    } else {
      const c = candidates[0];
      game.player.spawn(c.x, c.z, game.player.yaw, 0);
      game.player.pos.y = this.ocean.heightAt(c.x, c.z) - 1.45;
      game.player.mode = 'swim';
      game.particles.splash(c.x, this.ocean.heightAt(c.x, c.z), c.z, 1);
      game.audio?.play('splash');
    }
    // moor automatically if left next to the pier
    if (this.pos.distanceTo(this.mooringAnchor) < 6) { this.moored = true; }
  }

  // ------------------------------------------------------------------ simulation
  update(dt, game) {
    const input = game.input;
    const player = game.player;
    const driving = this.occupied && game.state === 'playing';
    if (driving) {
      const a = input.axis();
      this.throttle = damp(this.throttle, a.y, 2.5, dt);
      this.steer = damp(this.steer, -a.x, 5, dt);
      if (input.wasPressed('interact') && !this.ignoreInteract) { this.exit(game); return; }
      this.ignoreInteract = false;
    } else {
      this.throttle = damp(this.throttle, 0, 3, dt);
      this.steer = damp(this.steer, 0, 3, dt);
    }

    // sub-stepped physics for stability
    const steps = Math.ceil(dt / (1 / 90));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this._step(h, game);

    // transforms
    this.group.position.set(this.pos.x, this.y, this.pos.z);
    this.group.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');
    this.motor.rotation.y = this.steer * 0.5;
    this.prop.rotation.z += this.throttle * dt * 60;

    // camera when seated
    if (this.occupied) {
      const { dx, dy } = input.consumeMouse();
      this.lookYaw = clamp(this.lookYaw - dx, -2.4, 2.4);
      this.lookPitch = clamp(this.lookPitch - dy, -1.2, 1.1);
      const seat = (this._seat ||= new THREE.Vector3()).set(0.02, 0.98, -1.55).applyEuler(this.group.rotation).add(this.group.position);
      game.camera.position.copy(seat);
      game.camera.rotation.set(this.lookPitch + this.pitch * 0.6, this.heading + Math.PI + this.lookYaw, this.roll * 0.6, 'YXZ');
      player.pos.set(seat.x, seat.y - 1.6, seat.z);
      player.prevPos.copy(player.pos);
      player.yaw = this.heading + Math.PI + this.lookYaw;
      player.pitch = this.lookPitch;
      player.lookLagX = damp(player.lookLagX + dx, 0, 9, dt);
    }

    // prompt when standing nearby
    this.prompt = '';
    game.ocean.uniforms.uBoat.value.set(this.pos.x, this.pos.z, this.heading, 1);

    // audio
    const speed = this.vel.length();
    game.audio?.setEngine(this.occupied ? 0.25 + Math.abs(this.throttle) * 0.75 : 0, this.group.position);

    // wake + spray
    this._updateWake(dt, speed, game);
    // mooring rope
    this._ropeTimer -= dt;
    if (this._ropeTimer <= 0) {
      this._ropeTimer = 0.1;
      if (this.moored && !this.occupied) {
        const bow = new THREE.Vector3(0, sheerY(1) - 0.05, HALF - 0.1).applyEuler(this.group.rotation).add(this.group.position);
        const g = ropeGeometry(this.mooringPoint, bow, 0.35, 0.014, 10);
        this.ropeMesh.geometry.dispose();
        this.ropeMesh.geometry = g;
        this.ropeMesh.visible = true;
      } else this.ropeMesh.visible = false;
    }
  }

  _sampleWater(lx, lz) {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    const x = this.pos.x + lx * c + lz * s, z = this.pos.z - lx * s + lz * c;
    return this.ocean.heightAt(x, z);
  }

  _step(dt, game) {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    const fwd = new THREE.Vector2(s, c);
    const right = new THREE.Vector2(c, -s);
    // velocity in boat space
    let vf = this.vel.dot(fwd), vr = this.vel.dot(right);
    const thrust = this.occupied ? this.throttle * (this.throttle > 0 ? 3.4 : 1.6) : 0;
    vf += (thrust - vf * Math.abs(vf) * 0.09 - vf * 0.25) * dt;
    vr -= vr * 3.2 * dt;
    // steering: outboard steering works with thrust and speed
    const steerPower = (Math.abs(vf) * 0.32 + Math.abs(thrust) * 0.22) * Math.sign(vf || thrust || 1);
    this.angVel += (this.steer * steerPower - this.angVel * 2.2) * dt;
    this.heading = wrapAngle(this.heading + this.angVel * dt);

    // moored: spring towards the anchor + slight drift
    if (this.moored && !this.occupied) {
      const dx = this.mooringAnchor.x - this.pos.x, dz = this.mooringAnchor.z - this.pos.z;
      vf += (dx * fwd.x + dz * fwd.y) * 0.8 * dt;
      vr += (dx * right.x + dz * right.y) * 0.8 * dt;
      this.angVel += wrapAngle(Math.PI - this.heading) * 0.4 * dt + Math.sin(U.uTime.value * 0.3) * 0.004;
    }

    this.vel.set(fwd.x * vf + right.x * vr, fwd.y * vf + right.y * vr);
    // wave drift
    this.vel.x += U.uWind.value.x * U.uWind.value.z * 0.02 * dt;
    this.vel.y += U.uWind.value.y * U.uWind.value.z * 0.02 * dt;
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.y * dt;

    // grounding: terrain under bow/centre/stern
    let grounded = 0;
    const pts = [[0, HALF * 0.85], [0, 0], [0, -HALF * 0.85], [0.6, 0], [-0.6, 0]];
    for (const [lx, lz] of pts) {
      const wx = nx + lx * c + lz * s, wz = nz - lx * s + lz * c;
      const ground = this.td.heightAt(wx, wz);
      const water = this.ocean.heightAt(wx, wz);
      if (ground > water - DRAFT - 0.18) grounded = Math.max(grounded, ground - (water - DRAFT - 0.18));
      const hit = this.collision.pointInside(wx, water, wz, 0.25);
      if (hit && hit.tag !== 'palm') grounded = Math.max(grounded, 0.3);
    }
    if (grounded > 0) {
      // push back and kill speed
      this.vel.multiplyScalar(Math.max(0, 1 - grounded * 12 * dt) * 0.96);
      const back = -Math.sign(vf) || -1;
      this.vel.x += fwd.x * back * grounded * 3 * dt;
      this.vel.y += fwd.y * back * grounded * 3 * dt;
      this.scrapeTimer -= dt;
      if (this.scrapeTimer <= 0 && Math.abs(vf) > 0.6) { this.scrapeTimer = 0.4; game.audio?.play('thudSand', { position: this.group.position, volume: 0.8 }); }
    } else {
      this.pos.x = nx;
      this.pos.z = nz;
    }
    // world bounds
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > WORLD.playRadius + 20) {
      this.vel.x -= (this.pos.x / r) * 4 * dt;
      this.vel.y -= (this.pos.z / r) * 4 * dt;
    }

    // buoyancy from four hull points
    const hb = this._sampleWater(0, HALF * 0.8), hs = this._sampleWater(0, -HALF * 0.8);
    const hp = this._sampleWater(-0.65, 0), hst = this._sampleWater(0.65, 0);
    const targetY = (hb + hs + hp + hst) * 0.25 - DRAFT + (this.occupied ? -0.04 : 0);
    const targetPitch = -Math.atan2(hb - hs, L * 0.8) - vf * 0.012;
    const targetRoll = Math.atan2(hp - hst, 1.3) + this.angVel * Math.abs(vf) * 0.04;
    this.vy += ((targetY - this.y) * 40 - this.vy * 7) * dt;
    this.y += this.vy * dt;
    this.vpitch += ((targetPitch - this.pitch) * 30 - this.vpitch * 6) * dt;
    this.pitch += this.vpitch * dt;
    this.vroll += ((targetRoll - this.roll) * 26 - this.vroll * 5) * dt;
    this.roll += this.vroll * dt;
    if (!Number.isFinite(this.y)) { this.y = 0; this.vy = 0; this.pitch = 0; this.roll = 0; }
  }

  _updateWake(dt, speed, game) {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    const stern = new THREE.Vector3(this.pos.x - s * (HALF + 0.3), 0, this.pos.z - c * (HALF + 0.3));
    this.wakeTimer -= dt;
    if (this.wakeTimer <= 0 && speed > 0.4) {
      this.wakeTimer = 0.09;
      this.wakePts.unshift({ x: stern.x, z: stern.z, age: 0, speed, rx: c, rz: -s });
      if (this.wakePts.length > this.wakeN) this.wakePts.pop();
      // ripples at stern and bow
      this.ripples.addDrop(stern.x, stern.z, 0.6, 0.05 * Math.min(1, speed / 3));
      const bowX = this.pos.x + s * HALF, bowZ = this.pos.z + c * HALF;
      this.ripples.addDrop(bowX + c * 0.6, bowZ - s * 0.6, 0.4, 0.04 * Math.min(1, speed / 3));
      this.ripples.addDrop(bowX - c * 0.6, bowZ + s * 0.6, 0.4, 0.04 * Math.min(1, speed / 3));
    }
    for (const p of this.wakePts) p.age += dt / 7;
    while (this.wakePts.length && this.wakePts[this.wakePts.length - 1].age > 1) this.wakePts.pop();
    const pos = this.wake.geometry.attributes.position.array;
    const ages = this.wake.geometry.attributes.aAge.array;
    const n = this.wakePts.length;
    for (let i = 0; i < n; i++) {
      const p = this.wakePts[i];
      const w = 0.45 + p.age * 7 * Math.min(1, p.speed / 3);
      const y = this.ocean.heightAt(p.x, p.z) + 0.03;
      pos[i * 6] = p.x - p.rx * w; pos[i * 6 + 1] = y; pos[i * 6 + 2] = p.z - p.rz * w;
      pos[i * 6 + 3] = p.x + p.rx * w; pos[i * 6 + 4] = y; pos[i * 6 + 5] = p.z + p.rz * w;
      ages[i * 2] = p.age; ages[i * 2 + 1] = p.age;
    }
    this.wake.geometry.attributes.position.needsUpdate = true;
    this.wake.geometry.attributes.aAge.needsUpdate = true;
    this.wake.geometry.setDrawRange(0, Math.max(0, (n - 1) * 6));
    // bow spray at speed
    if (speed > 2.8 && Math.random() < dt * speed * 4) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const bx = this.pos.x + s * (HALF - 0.6) + c * 0.55 * side, bz = this.pos.z + c * (HALF - 0.6) - s * 0.55 * side;
      const wy = this.ocean.heightAt(bx, bz);
      game.particles.spray(bx, wy + 0.05, bz, c * side * 1.4 + this.vel.x * 0.3, 1.2, -s * side * 1.4 + this.vel.y * 0.3, 3);
    }
  }
}
