import * as THREE from 'three';
import { clamp, damp, lerp, smoothstep } from '../utils/MathUtils.js';
import { WORLD } from '../world/Layout.js';

const STEP = 1 / 120;
const RADIUS = 0.3;
const HEIGHT = 1.78;
const EYE = 1.64;
const STEP_HEIGHT = 0.46;
const GRAVITY = 21;

/**
 * First-person character: weighted acceleration, gravity, slopes, step handling,
 * swimming/diving and restrained procedural camera motion. Fixed 120 Hz simulation
 * with interpolated eye position.
 */
export class PlayerController {
  constructor({ camera, input, collision, terrain, ocean }) {
    this.camera = camera;
    this.input = input;
    this.collision = collision;
    this.terrain = terrain;
    this.ocean = ocean;

    this.pos = new THREE.Vector3();
    this.prevPos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.surface = 'terrain';
    this.mode = 'walk'; // walk | swim | boat | locked
    this.acc = 0;
    this.speed01 = 0;
    this.sprinting = false;
    this.waterDepth = 0;
    this.waterSurface = 0;
    this.eyeUnderwater = false;
    this.headSubmersion = 0;

    // procedural camera state
    this.bobPhase = 0;
    this.bobAmp = 0;
    this.landImpulse = 0;
    this.landVel = 0;
    this.eyeSmoothY = 0;
    this.roll = 0;
    this.breath = 0;
    this.fovKick = 0;
    this.lookLagX = 0;
    this.lookLagY = 0;
    this.airTime = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.lastStepPhase = 0;
    this.onStep = null; // (surface, pos, side, speed01)
    this.onLand = null; // (surface, intensity)
    this.onSplash = null; // (x, z, strength)
    this.onBoundary = null;
    this.frozen = false;
    this.eye = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this.wadeTimer = 0;
  }

  spawn(x, z, yaw = 0, pitch = 0) {
    const g = this.collision.ground(x, z, 100);
    this.pos.set(x, g.y, z);
    this.prevPos.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = pitch;
    this.eyeSmoothY = this.pos.y + EYE;
    this.mode = 'walk';
    this.onGround = true;
  }

  look(dt, allowLook = true) {
    if (!allowLook) { this.input.consumeMouse(); return; }
    const { dx, dy } = this.input.consumeMouse();
    this.yaw -= dx;
    this.pitch = clamp(this.pitch - dy, -1.5, 1.5);
    // tiny lag value used by the view model sway
    this.lookLagX = damp(this.lookLagX + dx, 0, 9, dt);
    this.lookLagY = damp(this.lookLagY + dy, 0, 9, dt);
  }

  update(dt) {
    if (this.mode === 'boat' || this.mode === 'locked') return;
    this.acc = Math.min(this.acc + dt, 0.25);
    while (this.acc >= STEP) {
      this.prevPos.copy(this.pos);
      this._step(STEP);
      this.acc -= STEP;
    }
    this._updateCamera(dt);
  }

  _wish() {
    if (this.frozen) return { x: 0, z: 0, len: 0 };
    const a = this.input.axis();
    let x = a.x, z = -a.y;
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    // rotate by yaw
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return { x: x * c + z * s, z: -x * s + z * c, len: Math.min(len, 1) };
  }

  _step(dt) {
    const input = this.input;
    const p = this.pos, v = this.vel;
    const wish = this._wish();

    // --- water state
    this.waterSurface = this.ocean.heightAt(p.x, p.z);
    const groundH = this.terrain.heightAt(p.x, p.z);
    this.waterDepth = this.waterSurface - groundH;
    const feetDepth = this.waterSurface - p.y;

    if (this.mode === 'walk' && this.waterDepth > 1.38 && feetDepth > 1.3) this.mode = 'swim';
    if (this.mode === 'swim' && (this.waterDepth < 1.25 || feetDepth < 0.9)) {
      this.mode = 'walk';
    }

    this.sprinting = input.isDown('sprint') && wish.len > 0.1 && this.mode === 'walk';
    if (input.wasPressed('jump')) this.jumpBuffer = 0.15;
    this.jumpBuffer -= dt;

    if (this.mode === 'swim') {
      this._swim(dt, wish);
    } else {
      // walking speed with water drag
      let max = this.sprinting ? 6.1 : 3.5;
      const wade = clamp(feetDepth, 0, 1.3);
      max *= lerp(1, 0.48, smoothstep(0.15, 1.1, wade));
      const accel = this.onGround ? (wish.len > 0 ? 24 : 15) : 3.5;
      const tx = wish.x * max * wish.len, tz = wish.z * max * wish.len;
      const ddx = tx - v.x, ddz = tz - v.z;
      const dl = Math.hypot(ddx, ddz);
      const maxDelta = accel * dt;
      if (dl > maxDelta) { v.x += (ddx / dl) * maxDelta; v.z += (ddz / dl) * maxDelta; } else { v.x = tx; v.z = tz; }

      // jumping
      if (this.jumpBuffer > 0 && (this.onGround || this.coyote > 0) && wade < 0.9 && !this.frozen) {
        v.y = 6.2;
        this.onGround = false;
        this.coyote = 0;
        this.jumpBuffer = 0;
      }
      v.y -= GRAVITY * dt;
      if (wade > 0.2) v.y *= 1 - dt * 2.0; // water slows the fall

      const oldX = p.x, oldZ = p.z;
      p.x += v.x * dt;
      p.z += v.z * dt;
      p.y += v.y * dt;

      // steep terrain blocks uphill movement
      const n = this.terrain.normalAt(p.x, p.z, this._tmp);
      const tH = this.terrain.heightAt(p.x, p.z);
      if (n.y < 0.62 && tH > p.y + 0.05) {
        const into = v.x * -n.x + v.z * -n.z;
        if (into > 0) {
          p.x = oldX + (v.x + n.x * into) * dt * 0.4;
          p.z = oldZ + (v.z + n.z * into) * dt * 0.4;
        }
      }

      this.collision.resolve(p, RADIUS, HEIGHT, STEP_HEIGHT);

      // ceiling
      if (v.y > 0) {
        const ceil = this.collision.ceiling(p.x, p.z, p.y + 0.5, RADIUS);
        if (p.y + HEIGHT > ceil) { p.y = ceil - HEIGHT; v.y = 0; }
      }

      // ground
      const wasGround = this.onGround;
      const g = this.collision.ground(p.x, p.z, p.y + STEP_HEIGHT, RADIUS);
      const snap = wasGround && v.y <= 0.01 ? 0.4 : 0.0;
      if (p.y <= g.y + snap) {
        if (!wasGround && v.y < -3.5 && this.onLand) this.onLand(g.surface, clamp(-v.y / 12, 0, 1));
        if (!wasGround && v.y < -2) { this.landVel = Math.min(0.14, -v.y * 0.012); }
        p.y = g.y;
        v.y = 0;
        this.onGround = true;
        this.surface = g.collider ? g.collider.surface : this._terrainSurface(p.x, p.z);
        this.coyote = 0.12;
        this.airTime = 0;
      } else {
        this.onGround = false;
        this.coyote -= dt;
        this.airTime += dt;
      }

      // slide down very steep ground
      if (this.onGround && !g.collider) {
        const nn = this.terrain.normalAt(p.x, p.z, this._tmp);
        if (nn.y < 0.6) {
          v.x += nn.x * 9 * dt;
          v.z += nn.z * 9 * dt;
        }
      }

      // wading splashes / ripples
      if (wade > 0.05 && Math.hypot(v.x, v.z) > 0.5) {
        this.wadeTimer -= dt;
        if (this.wadeTimer <= 0 && this.onSplash) {
          this.wadeTimer = 0.12;
          this.onSplash(p.x + v.x * 0.15, p.z + v.z * 0.15, clamp(wade, 0.1, 0.8) * 0.05);
        }
      }
    }

    // soft world boundary
    const r = Math.hypot(p.x, p.z);
    if (r > WORLD.playRadius) {
      const k = (r - WORLD.playRadius) * 2.5;
      v.x -= (p.x / r) * k * dt;
      v.z -= (p.z / r) * k * dt;
      if (this.onBoundary) this.onBoundary();
    }

    // never fall below terrain
    const minY = this.terrain.heightAt(p.x, p.z);
    if (p.y < minY - 0.02 && this.mode !== 'swim') { p.y = minY; if (v.y < 0) v.y = 0; }
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
      p.copy(this.prevPos);
      v.set(0, 0, 0);
    }

    // footsteps from the bob phase
    const hs = Math.hypot(v.x, v.z);
    this.speed01 = clamp(hs / 6, 0, 1);
    if ((this.onGround || this.mode === 'swim') && hs > 0.3) {
      const freq = this.mode === 'swim' ? 0.7 : lerp(1.65, 2.45, smoothstep(3.5, 6, hs));
      this.bobPhase += dt * freq * Math.PI * 2 * 0.5;
      const stepIndex = Math.floor(this.bobPhase / Math.PI);
      if (stepIndex !== this.lastStepPhase) {
        this.lastStepPhase = stepIndex;
        if (this.onStep) this.onStep(this.mode === 'swim' ? 'swim' : (feetDepth > 0.08 ? 'water' : this.surface), p, stepIndex & 1, this.speed01);
      }
    }
  }

  _swim(dt, wish) {
    const p = this.pos, v = this.vel, input = this.input;
    const fast = input.isDown('sprint');
    const max = fast ? 3.0 : 1.9;
    // 3D swim direction when underwater, surface swimming otherwise
    // floating: the eye rides about 0.22 m over the waves, head and shoulders out
    const surfaceFeet = this.waterSurface - 1.42;
    const diving = input.isDown('crouch');
    const rising = input.isDown('jump');
    let ty = 0;
    if (diving) ty = -1.6;
    else if (rising) ty = 1.6;
    const submerged = p.y < surfaceFeet - 0.25;
    if (submerged && wish.len > 0.1) ty += Math.sin(this.pitch) * max * 0.9;
    const tx = wish.x * max * wish.len * (submerged ? Math.cos(this.pitch) * 0.5 + 0.5 : 1);
    const tz = wish.z * max * wish.len * (submerged ? Math.cos(this.pitch) * 0.5 + 0.5 : 1);
    v.x = damp(v.x, tx, 2.6, dt);
    v.z = damp(v.z, tz, 2.6, dt);
    if (!diving && !rising && !submerged) {
      // float at the surface, following the waves
      v.y = damp(v.y, (surfaceFeet - p.y) * 4, 6, dt);
    } else if (!diving && !rising) {
      v.y = damp(v.y, ty + 0.35, 1.8, dt); // slight buoyancy
    } else {
      v.y = damp(v.y, ty, 3, dt);
    }
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    if (p.y > surfaceFeet + 0.05) p.y = surfaceFeet + 0.05;
    this.collision.resolve(p, RADIUS, HEIGHT, 0.2);
    const g = this.terrain.heightAt(p.x, p.z);
    if (p.y < g) { p.y = g; if (v.y < 0) v.y = 0; }
    this.onGround = false;
    if (Math.hypot(v.x, v.z) > 0.4 && !submerged) {
      this.wadeTimer -= dt;
      if (this.wadeTimer <= 0 && this.onSplash) {
        this.wadeTimer = 0.35;
        this.onSplash(p.x, p.z, 0.06);
      }
    }
  }

  _terrainSurface(x, z) {
    const s = this.terrain.splatAt(x, z, this._splat || (this._splat = {}));
    if (s.path > 0.4) return 'dirt';
    if (s.rock > 0.5) return 'rock';
    if (s.sand > 0.5) return 'sand';
    if (s.canopy > 0.4) return 'leaves';
    return 'grass';
  }

  _updateCamera(dt) {
    const alpha = this.acc / STEP;
    const ix = lerp(this.prevPos.x, this.pos.x, alpha);
    const iy = lerp(this.prevPos.y, this.pos.y, alpha);
    const iz = lerp(this.prevPos.z, this.pos.z, alpha);

    // smooth upward steps, track downward instantly-ish
    const targetEye = iy + EYE;
    if (targetEye > this.eyeSmoothY) this.eyeSmoothY = damp(this.eyeSmoothY, targetEye, 18, dt);
    else this.eyeSmoothY = damp(this.eyeSmoothY, targetEye, 40, dt);
    if (Math.abs(this.eyeSmoothY - targetEye) > 1.2) this.eyeSmoothY = targetEye;

    // bob amplitude follows speed (restrained)
    const moving = (this.onGround || this.mode === 'swim') ? this.speed01 : 0;
    this.bobAmp = damp(this.bobAmp, moving, 6, dt);
    const sprintK = this.sprinting ? 1.35 : 1;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.034 * this.bobAmp * sprintK - 0.017 * this.bobAmp;
    const bobX = Math.cos(this.bobPhase) * 0.018 * this.bobAmp;

    // landing dip spring
    this.landImpulse += this.landVel;
    this.landVel = 0;
    this.landImpulse = damp(this.landImpulse, 0, 7, dt);

    // breathing when idle
    this.breath += dt;
    const idle = 1 - this.bobAmp;
    const breathY = Math.sin(this.breath * 1.6) * 0.004 * idle;

    // swimming bob
    let swimY = 0;
    if (this.mode === 'swim') swimY = Math.sin(this.breath * 1.2) * 0.03;

    // strafe lean
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const rightVel = this.vel.x * c - this.vel.z * s;
    this.roll = damp(this.roll, -rightVel * 0.004 + Math.sin(this.bobPhase) * 0.002 * this.bobAmp, 6, dt);
    this.fovKick = damp(this.fovKick, this.sprinting ? 1 : 0, 4, dt);

    this.eye.set(ix + bobX * c, this.eyeSmoothY + bobY + breathY + swimY - this.landImpulse, iz - bobX * s);
    if (this.mode === 'walk') {
      // never let the eye dip under the ground when stepping off ledges
      const gy = this.terrain.heightAt(this.eye.x, this.eye.z);
      if (this.eye.y < gy + 0.4) this.eye.y = gy + 0.4;
    }
    const cam = this.camera;
    cam.position.copy(this.eye);
    cam.rotation.set(this.pitch + Math.sin(this.breath * 1.6) * 0.0012 * idle, this.yaw, this.roll, 'YXZ');
  }

  get feet() { return this.pos; }
  get height() { return HEIGHT; }
  get radius() { return RADIUS; }
}
