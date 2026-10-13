import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { clamp, damp, smoothstep, tangentFrame } from '../core/math/sphere';
import { CollisionWorld } from '../world/Collision';
import { PLANET_RADIUS } from '../world/constants';
import { Input } from '../core/Input';

export interface CameraPose {
  position: Vector3;
  look: Vector3;
  up: Vector3;
}

export interface FollowTarget {
  dir: Vector3;
  feetPos: Vector3; // world position of the rendered feet
  velocity: Vector3;
  facing: Vector3;
  frameQuat: Quaternion;
  speed: number;
  running: boolean;
}

/**
 * Third-person camera for a tiny planet.
 *
 * The camera keeps its own horizontal heading vector, parallel-transported with the player every
 * frame, so walking across the sphere never induces artificial yaw. Its up vector is a smoothed
 * copy of the local gravity up, which makes the planet appear to roll gently beneath the player.
 */
export class CameraController {
  readonly heading = new Vector3(0, 1, 0); // tangent at player, the direction the camera looks along
  readonly upSmooth = new Vector3(0, 0, 1);
  readonly target = new Vector3();
  pitch = 0.46;
  distance = 9.5;
  desiredDistance = 9.5;
  minDistance = 4.5;
  maxDistance = 16;
  autoFollow = true;
  fovBase = 50;

  private special: CameraPose | null = null;
  private specialBlend = 0;
  private specialRate = 2.2;
  private lastFollow: CameraPose = { position: new Vector3(), look: new Vector3(), up: new Vector3() };
  private initialised = false;
  private tmp = new Vector3();
  private tmp2 = new Vector3();

  constructor(
    readonly camera: PerspectiveCamera,
    private world: CollisionWorld,
    private groundHeight: (d: Vector3) => number,
  ) {}

  /** Snap the rig behind the player (used on spawn / teleport). */
  reset(t: FollowTarget): void {
    this.upSmooth.copy(t.dir);
    this.heading.copy(t.facing).addScaledVector(t.dir, -t.facing.dot(t.dir)).normalize();
    this.target.copy(t.feetPos).addScaledVector(t.dir, 1.35);
    this.distance = this.desiredDistance;
    this.initialised = true;
  }

  /** Request a framed shot (dialogue, inspection, cinematic). Pass null to return to follow. */
  setSpecial(pose: CameraPose | null, rate = 2.2): void {
    if (pose) {
      if (!this.special) this.special = { position: new Vector3(), look: new Vector3(), up: new Vector3() };
      this.special.position.copy(pose.position);
      this.special.look.copy(pose.look);
      this.special.up.copy(pose.up);
    } else if (this.special && this.specialBlend <= 0) {
      this.special = null;
    }
    this.specialActive = !!pose;
    this.specialRate = rate;
  }
  private specialActive = false;

  get inSpecial(): boolean {
    return this.specialBlend > 0.01;
  }

  update(dt: number, t: FollowTarget, input: Input | null): void {
    if (!this.initialised) this.reset(t);
    const up = t.dir;

    // 1. Parallel transport the heading with the player's motion, then keep it tangent.
    this.heading.applyQuaternion(t.frameQuat);
    this.heading.addScaledVector(up, -this.heading.dot(up));
    if (this.heading.lengthSq() < 1e-8) tangentFrame(up, this.tmp, this.heading);
    this.heading.normalize();

    // 2. Manual orbit.
    if (input && !this.specialActive) {
      const yaw = -input.lookDX * 0.0055;
      this.pitch = clamp(this.pitch + input.lookDY * 0.004, 0.06, 1.25);
      if (yaw) this.heading.applyAxisAngle(up, yaw);
      this.desiredDistance = clamp(this.desiredDistance + input.zoomDelta * 0.9, this.minDistance, this.maxDistance);

      // 3. Gentle auto-follow: after a pause in camera input, ease behind the direction of travel.
      if (this.autoFollow && input.idleLookTime > 1.6 && t.speed > 0.6) {
        const v = this.tmp.copy(t.velocity).normalize();
        const cosA = v.dot(this.heading);
        if (cosA > -0.35) {
          const ang = Math.atan2(this.tmp2.crossVectors(this.heading, v).dot(up), cosA);
          const strength = 0.55 * smoothstep(0.6, 5.5, t.speed) * smoothstep(1.6, 3.2, input.idleLookTime);
          this.heading.applyAxisAngle(up, ang * damp(strength, dt));
        }
      }
    }

    // 4. Smoothed up and target.
    this.upSmooth.lerp(up, damp(7, dt)).normalize();
    const headPos = this.tmp.copy(t.feetPos).addScaledVector(up, 1.35);
    this.target.lerp(headPos, damp(14, dt));
    if (this.target.distanceTo(headPos) > 4) this.target.copy(headPos);

    // 5. Desired position from heading/pitch/distance in the smoothed frame.
    const U = this.upSmooth;
    const H = this.tmp2.copy(this.heading).addScaledVector(U, -this.heading.dot(U)).normalize();
    const back = new Vector3().copy(H).multiplyScalar(-Math.cos(this.pitch)).addScaledVector(U, Math.sin(this.pitch));
    const wanted = this.desiredDistance;
    const desiredPos = new Vector3().copy(this.target).addScaledVector(back, wanted);

    // 6. Obstacle avoidance: pull in quickly when blocked, ease back out slowly.
    const frac = this.world.raycast(this.target, desiredPos);
    const allowed = frac < 1 ? Math.max(1.6, wanted * frac - 0.45) : wanted;
    this.distance += (allowed - this.distance) * damp(allowed < this.distance ? 16 : 2.5, dt);
    const pos = new Vector3().copy(this.target).addScaledVector(back, this.distance);

    // Keep above terrain.
    const pd = this.tmp.copy(pos).normalize();
    const minR = PLANET_RADIUS + this.groundHeight(pd) + 0.7;
    if (pos.length() < minR) pos.copy(pd).multiplyScalar(minR);

    // Look slightly ahead of the player so the horizon and the path ahead read well.
    const look = new Vector3().copy(this.target).addScaledVector(H, 1.2).addScaledVector(U, 0.15);
    this.lastFollow.position.copy(pos);
    this.lastFollow.look.copy(look);
    this.lastFollow.up.copy(U);

    // 7. Blend with a special framing if requested.
    const goal = this.specialActive ? 1 : 0;
    this.specialBlend += (goal - this.specialBlend) * damp(this.specialRate, dt);
    if (!this.specialActive && this.specialBlend < 0.002) {
      this.specialBlend = 0;
      this.special = null;
    }
    let finalPos = pos, finalLook = look, finalUp = U;
    if (this.special && this.specialBlend > 0) {
      const b = smoothstep(0, 1, this.specialBlend);
      finalPos = new Vector3().lerpVectors(pos, this.special.position, b);
      finalLook = new Vector3().lerpVectors(look, this.special.look, b);
      finalUp = new Vector3().lerpVectors(U, this.special.up, b).normalize();
    }

    const cam = this.camera;
    cam.position.copy(finalPos);
    cam.up.copy(finalUp);
    cam.lookAt(finalLook);
    const fov = this.fovBase + (t.running && t.speed > 4 ? 3 : 0);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov += (fov - cam.fov) * damp(3, dt);
      cam.updateProjectionMatrix();
    }
  }

  /** The follow pose computed this frame (useful for cinematic transitions). */
  get followPose(): CameraPose {
    return this.lastFollow;
  }
}
