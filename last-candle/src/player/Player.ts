import * as THREE from "three";
import type { Input } from "../core/Input";
import { clamp, damp, easeInOut, wrapAngle } from "../core/math";
import type { SettingsData } from "../core/Settings";
import type { CollisionWorld } from "../world/Collision";

export type PlayerMode = "walk" | "tween" | "seated" | "terminal" | "frozen";

export interface CamPose {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
}

const EYE = 1.62;
const RADIUS = 0.28;
const WALK = 2.6;
const RUN = 4.0;
const GRAVITY = 18;

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler(0, 0, 0, "YXZ");

/**
 * First-person controller: smooth acceleration, step/ramp handling, head bob,
 * and camera tweens for sitting down / using a terminal / standing up.
 */
export class Player {
  readonly pos = new THREE.Vector3(); // feet
  private vel = new THREE.Vector2();
  private vy = 0;
  yaw = 0;
  pitch = 0;
  mode: PlayerMode = "walk";
  private feetSmooth = 0;
  private bobPhase = 0;
  private bobAmp = 0;
  speed = 0;
  /** Seated look limits around a base yaw. */
  private seatBaseYaw = 0;
  private seatEye = new THREE.Vector3();
  private tween: { from: CamPose; to: CamPose; t: number; dur: number; then: () => void } | null = null;
  private terminalPose: CamPose | null = null;
  onFootstep: ((speed: number) => void) | null = null;
  /** Lean/offset applied by the hands/interaction for juice (e.g., inspect). */
  readonly camOffset = new THREE.Vector3();
  private lastStepSign = 0;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private collision: CollisionWorld,
  ) {}

  teleport(x: number, z: number, yaw: number, feetY = 0) {
    this.pos.set(x, feetY, z);
    this.feetSmooth = feetY;
    this.yaw = yaw;
    this.pitch = -0.05;
    this.vel.set(0, 0);
    this.vy = 0;
    this.applyWalkCamera(0);
  }

  get eyePos(): THREE.Vector3 {
    return this.camera.position;
  }

  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return this.camera.getWorldDirection(out);
  }

  /** Begin a smooth camera move to `to`, then switch mode via callback. */
  tweenTo(to: CamPose, dur: number, then: () => void) {
    this.tween = {
      from: { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone() },
      to,
      t: 0,
      dur,
      then,
    };
    this.mode = "tween";
  }

  static poseLookAt(pos: THREE.Vector3, target: THREE.Vector3): CamPose {
    const m = new THREE.Matrix4().lookAt(pos, target, new THREE.Vector3(0, 1, 0));
    return { pos: pos.clone(), quat: new THREE.Quaternion().setFromRotationMatrix(m) };
  }

  static poseYawPitch(pos: THREE.Vector3, yaw: number, pitch: number): CamPose {
    tmpE.set(pitch, yaw, 0, "YXZ");
    return { pos: pos.clone(), quat: new THREE.Quaternion().setFromEuler(tmpE) };
  }

  enterSeated(eye: THREE.Vector3, baseYaw: number) {
    this.seatEye.copy(eye);
    this.seatBaseYaw = baseYaw;
    this.mode = "seated";
  }

  enterTerminal(pose: CamPose) {
    this.terminalPose = pose;
    this.mode = "terminal";
  }

  setTerminalPose(pose: CamPose) {
    this.terminalPose = pose;
  }

  /** Called when standing back up at a validated spot. */
  standAt(x: number, z: number, feetY: number, yaw: number) {
    this.pos.set(x, feetY, z);
    this.feetSmooth = feetY;
    this.yaw = yaw;
    this.pitch = Math.max(-0.4, Math.min(0.2, this.pitch));
    this.vel.set(0, 0);
    this.mode = "walk";
  }

  update(dt: number, input: Input, s: SettingsData, allowMove: boolean) {
    const sens = 0.0022 * s.sensitivity;
    const lookable = this.mode === "walk" || this.mode === "seated";
    if (lookable && allowMove) {
      this.yaw -= input.mouseDX * sens;
      this.pitch -= input.mouseDY * sens * (s.invertY ? -1 : 1);
      this.pitch = clamp(this.pitch, -1.45, 1.4);
    }

    if (this.mode === "walk") {
      this.walk(dt, input, s, allowMove);
      this.applyWalkCamera(dt, s);
    } else if (this.mode === "seated") {
      const rel = clamp(wrapAngle(this.yaw - this.seatBaseYaw), -1.9, 1.9);
      this.yaw = this.seatBaseYaw + rel;
      this.pitch = clamp(this.pitch, -0.9, 0.9);
      this.camera.position.copy(this.seatEye);
      tmpE.set(this.pitch, this.yaw, 0, "YXZ");
      this.camera.quaternion.setFromEuler(tmpE);
    } else if (this.mode === "terminal" && this.terminalPose) {
      this.camera.position.lerp(this.terminalPose.pos, damp(14, dt));
      this.camera.quaternion.slerp(this.terminalPose.quat, damp(14, dt));
    } else if (this.mode === "tween" && this.tween) {
      const tw = this.tween;
      tw.t += dt / tw.dur;
      const k = easeInOut(Math.min(1, tw.t));
      this.camera.position.lerpVectors(tw.from.pos, tw.to.pos, k);
      tmpQ.copy(tw.from.quat).slerp(tw.to.quat, k);
      this.camera.quaternion.copy(tmpQ);
      if (tw.t >= 1) {
        this.tween = null;
        tw.then();
      }
    }
  }

  private walk(dt: number, input: Input, s: SettingsData, allowMove: boolean) {
    let ix = 0;
    let iz = 0;
    if (allowMove) {
      if (input.held("KeyW") || input.held("ArrowUp")) iz -= 1;
      if (input.held("KeyS") || input.held("ArrowDown")) iz += 1;
      if (input.held("KeyA") || input.held("ArrowLeft")) ix -= 1;
      if (input.held("KeyD") || input.held("ArrowRight")) ix += 1;
      ix += input.touchMove.x;
      iz += input.touchMove.y;
    }
    const len = Math.hypot(ix, iz);
    if (len > 1) {
      ix /= len;
      iz /= len;
    }
    const run = input.held("ShiftLeft") || input.held("ShiftRight");
    const maxSpeed = run ? RUN : WALK;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // local (ix, iz) → world
    const tx = (ix * cos + iz * sin) * maxSpeed;
    const tz = (-ix * sin + iz * cos) * maxSpeed;
    const accel = len > 0.01 ? 12 : 14;
    const k = damp(accel, dt);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.y += (tz - this.vel.y) * k;

    const dx = this.vel.x * dt;
    const dz = this.vel.y * dt;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / 0.07));
    const p = { x: this.pos.x, z: this.pos.z };
    for (let i = 0; i < steps; i++) {
      const sx = dx / steps;
      const sz = dz / steps;
      const feet = this.pos.y;
      // try full move, else slide along axes
      if (!this.collision.floorBlocks(p.x + sx, p.z + sz, feet, RADIUS * 0.8)) {
        p.x += sx;
        p.z += sz;
      } else if (!this.collision.floorBlocks(p.x + sx, p.z, feet, RADIUS * 0.8)) {
        p.x += sx;
      } else if (!this.collision.floorBlocks(p.x, p.z + sz, feet, RADIUS * 0.8)) {
        p.z += sz;
      }
      this.collision.resolve(p, RADIUS, feet);
      const g = this.collision.groundAt(p.x, p.z, feet);
      if (g === -Infinity) {
        // off the map: undo this substep
        p.x = this.pos.x;
        p.z = this.pos.z;
        break;
      }
      this.pos.x = p.x;
      this.pos.z = p.z;
      if (g >= this.pos.y - 0.05) {
        this.pos.y = g;
        this.vy = 0;
      }
    }
    // gravity when stepping off an edge
    const g = this.collision.groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (g < this.pos.y - 0.05) {
      this.vy -= GRAVITY * dt;
      this.pos.y = Math.max(g, this.pos.y + this.vy * dt);
      if (this.pos.y <= g) this.vy = 0;
    }
    // actual speed
    this.speed = Math.hypot(this.vel.x, this.vel.y);
    void s;
  }

  private applyWalkCamera(dt: number, s?: SettingsData) {
    this.feetSmooth += (this.pos.y - this.feetSmooth) * (dt > 0 ? damp(16, dt) : 1);
    let bobY = 0;
    let bobX = 0;
    const moving = this.speed > 0.4;
    this.bobAmp += ((moving ? Math.min(1, this.speed / RUN) : 0) - this.bobAmp) * (dt > 0 ? damp(8, dt) : 1);
    if (dt > 0) {
      this.bobPhase += dt * (5.2 + this.speed * 1.4);
      const sign = Math.sign(Math.sin(this.bobPhase));
      if (moving && sign !== this.lastStepSign && sign !== 0) {
        this.lastStepSign = sign;
        this.onFootstep?.(this.speed);
      }
    }
    if (!s || s.headBob) {
      bobY = Math.abs(Math.sin(this.bobPhase)) * 0.035 * this.bobAmp;
      bobX = Math.cos(this.bobPhase) * 0.018 * this.bobAmp;
    }
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    this.camera.position.set(this.pos.x + bobX * cos, this.feetSmooth + EYE + bobY, this.pos.z - bobX * sin);
    this.camera.position.add(this.camOffset);
    tmpE.set(this.pitch, this.yaw, 0, "YXZ");
    this.camera.quaternion.setFromEuler(tmpE);
  }

  /** Current camera pose snapshot. */
  pose(): CamPose {
    return { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone() };
  }

  /** Yaw/pitch the camera currently has (used after tweens to keep look continuous). */
  syncAnglesFromCamera() {
    tmpE.setFromQuaternion(this.camera.quaternion, "YXZ");
    this.yaw = tmpE.y;
    this.pitch = tmpE.x;
  }

  get radius() {
    return RADIUS;
  }

  get eyeHeight() {
    return EYE;
  }
}
