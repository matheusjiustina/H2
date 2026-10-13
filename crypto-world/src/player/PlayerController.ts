import { Quaternion, Vector3 } from 'three';
import { clamp, damp, tangentFrame } from '../core/math/sphere';
import { CollisionWorld, SurfaceMaterial } from '../world/Collision';
import { PLANET_RADIUS, WATER_BLOCK_LEVEL } from '../world/constants';

/** Steepest terrain gradient (rise over run) the player can walk up: 45°. */
const MAX_SLOPE = 1.0;

export interface DynamicBody {
  dir: Vector3;
  radius: number;
}

export interface ControllerEvents {
  onLand?: (impact: number) => void;
  onJump?: () => void;
}

/**
 * Kinematic character controller for a spherical world.
 *
 * Gravity always points to the planet centre. Horizontal motion is performed by rotating the body
 * about the planet centre (a geodesic step), and the same rotation is applied to the velocity and
 * facing vectors — parallel transport — so walking in a straight line really follows a great
 * circle and the character never drifts, snaps or tilts while circumnavigating the planet.
 */
export class PlayerController {
  readonly dir = new Vector3(0, 0, 1);
  feet = 0;
  visualFeet = 0;
  readonly velocity = new Vector3();
  vertVel = 0;
  grounded = true;
  readonly facing = new Vector3(0, 1, 0);
  /** Rotation applied to the body this frame — consumers (camera) transport their frames with it. */
  readonly frameQuat = new Quaternion();
  speed = 0;
  turnRate = 0; // rad/s, signed (positive = turning left)
  surface: SurfaceMaterial = 'grass';
  distanceTravelled = 0;

  walkSpeed = 2.9;
  runSpeed = 5.9;
  accel = 13;
  decel = 15;
  airControl = 0.35;
  jumpVelocity = 5.2;
  gravity = 15;
  radius = 0.36;
  height = 1.55;
  frozen = false;
  dynamics: DynamicBody[] = [];

  private tmpA = new Vector3();
  private tmpB = new Vector3();
  private tmpC = new Vector3();
  private normals: Vector3[] = [];

  constructor(
    private world: CollisionWorld,
    private materialAt: (dir: Vector3) => SurfaceMaterial,
    private events: ControllerEvents = {},
  ) {}

  /** Places the player at a direction, standing on the ground, facing `facing` (projected to tangent). */
  teleport(dir: Vector3, facing?: Vector3): void {
    this.dir.copy(dir).normalize();
    const g = this.world.ground(this.dir);
    this.feet = g.height;
    this.visualFeet = g.height;
    this.velocity.set(0, 0, 0);
    this.vertVel = 0;
    this.grounded = true;
    if (facing) this.facing.copy(facing);
    this.reprojectFacing();
  }

  get position(): Vector3 {
    return this.tmpC.copy(this.dir).multiplyScalar(PLANET_RADIUS + this.feet);
  }

  /** World position of the rendered feet (smoothed over small steps). */
  visualPosition(out = new Vector3()): Vector3 {
    return out.copy(this.dir).multiplyScalar(PLANET_RADIUS + this.visualFeet);
  }

  private reprojectFacing(): void {
    this.facing.addScaledVector(this.dir, -this.facing.dot(this.dir));
    if (this.facing.lengthSq() < 1e-8) {
      const e = new Vector3();
      tangentFrame(this.dir, e, this.facing);
    }
    this.facing.normalize();
  }

  /**
   * @param wish desired movement direction (world tangent vector, length 0..1)
   */
  update(dt: number, wish: Vector3, run: boolean, jump: boolean): void {
    this.frameQuat.identity();
    const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.step(h, wish, run, jump && i === 0);
    this.visualFeet += (this.feet - this.visualFeet) * damp(this.grounded ? 22 : 60, dt);
    if (Math.abs(this.feet - this.visualFeet) > 0.6) this.visualFeet = this.feet;
  }

  private step(dt: number, wishIn: Vector3, run: boolean, jump: boolean): void {
    const up = this.dir;
    const R = PLANET_RADIUS;
    const wish = this.tmpA.copy(wishIn);
    if (this.frozen) wish.set(0, 0, 0);
    wish.addScaledVector(up, -wish.dot(up));
    const wishLen = Math.min(1, wish.length());
    if (wishLen > 1e-4) wish.multiplyScalar(wishLen / wish.length());

    // ---- Horizontal acceleration -------------------------------------------------------------
    const maxSpeed = run ? this.runSpeed : this.walkSpeed;
    const target = wish.multiplyScalar(maxSpeed);
    const dv = this.tmpB.copy(target).sub(this.velocity);
    const reversing = target.lengthSq() > 0.01 && target.dot(this.velocity) < 0;
    let rate = target.lengthSq() > 0.01 ? this.accel * (reversing ? 1.6 : 1) : this.decel;
    if (!this.grounded) rate *= this.airControl;
    const dvLen = dv.length();
    const maxDv = rate * dt;
    if (dvLen > maxDv) dv.multiplyScalar(maxDv / dvLen);
    this.velocity.add(dv);
    this.velocity.addScaledVector(up, -this.velocity.dot(up));

    // ---- Candidate geodesic move -------------------------------------------------------------
    const oldDir = this.tmpC.copy(this.dir);
    const oldGround = this.world.ground(oldDir, this.feet).height;
    let res = this.tryMove(dt);
    if (res !== 'ok' && this.velocity.lengthSq() > 1e-6) {
      // Slide along the blocking edge (shoreline / steep slope) using the terrain gradient.
      const n = this.blockNormal(this.dir, res === 'water');
      const vn = this.velocity.dot(n);
      if (vn < 0) this.velocity.addScaledVector(n, -vn * 1.05);
      res = this.tryMove(dt);
      if (res !== 'ok') this.velocity.multiplyScalar(0.2);
    }

    // ---- Static + dynamic collisions ---------------------------------------------------------
    this.normals.length = 0;
    this.world.resolve(this.dir, this.feet, this.radius, this.height, this.normals);
    for (const b of this.dynamics) {
      const off = this.tmpB.copy(this.dir).sub(b.dir);
      off.addScaledVector(this.dir, -off.dot(this.dir));
      const d = off.length() * R;
      const minD = b.radius + this.radius;
      if (d < minD && d > 1e-5) {
        off.normalize();
        this.dir.addScaledVector(off, (minD - d) / R).normalize();
        this.normals.push(off.clone());
      }
    }
    for (const n of this.normals) {
      const vn = this.velocity.dot(n);
      if (vn < 0) this.velocity.addScaledVector(n, -vn);
    }

    // ---- Vertical: gravity toward the core ---------------------------------------------------
    const g = this.world.ground(this.dir, this.feet);
    if (this.grounded) {
      if (jump) {
        this.vertVel = this.jumpVelocity;
        this.grounded = false;
        this.events.onJump?.();
      } else if (g.height < this.feet - 0.65) {
        this.grounded = false;
        this.vertVel = 0;
      } else {
        this.feet = g.height;
      }
    }
    if (!this.grounded) {
      this.vertVel -= this.gravity * dt;
      this.feet += this.vertVel * dt;
      if (this.feet <= g.height) {
        const impact = -this.vertVel;
        this.feet = g.height;
        this.vertVel = 0;
        this.grounded = true;
        this.events.onLand?.(impact);
      }
    }

    // Uphill drag: slopes slow the player slightly.
    const dist = oldDir.angleTo(this.dir) * R;
    if (dist > 1e-4 && this.grounded) {
      const slope = (g.height - oldGround) / dist;
      if (slope > 0.15) this.velocity.multiplyScalar(1 - clamp((slope - 0.15) * 0.5, 0, 0.35) * dt * 8);
    }
    this.distanceTravelled += dist;

    // ---- Transport frames with the actual rotation performed --------------------------------
    const q = new Quaternion().setFromUnitVectors(oldDir, this.dir);
    this.frameQuat.premultiply(q);
    this.velocity.applyQuaternion(q);
    this.velocity.addScaledVector(this.dir, -this.velocity.dot(this.dir));
    this.facing.applyQuaternion(q);
    this.reprojectFacing();

    // ---- Facing follows velocity -------------------------------------------------------------
    this.speed = this.velocity.length();
    if (this.speed > 0.25 && wishLen > 0.05) {
      const tgt = this.tmpB.copy(this.velocity).normalize();
      const ang = Math.atan2(this.tmpA.crossVectors(this.facing, tgt).dot(this.dir), this.facing.dot(tgt));
      const maxTurn = (run ? 9 : 11) * dt;
      const turn = clamp(ang, -maxTurn, maxTurn);
      this.facing.applyQuaternion(new Quaternion().setFromAxisAngle(this.dir, turn));
      this.reprojectFacing();
      this.turnRate += (turn / dt - this.turnRate) * damp(10, dt);
    } else {
      this.turnRate += (0 - this.turnRate) * damp(8, dt);
    }

    this.surface = g.surface?.material ?? this.materialAt(this.dir);
  }

  /** Moves along the velocity if the destination is walkable. */
  private tryMove(dt: number): 'ok' | 'water' | 'steep' {
    const v = this.velocity;
    const speed = v.length();
    if (speed < 1e-6) return 'ok';
    const axis = this.tmpB.crossVectors(this.dir, v).normalize();
    const ang = (speed * dt) / (PLANET_RADIUS + this.feet);
    const cand = new Vector3().copy(this.dir).applyAxisAngle(axis, ang).normalize();
    const here = this.world.ground(this.dir, this.feet).height;
    const there = this.world.ground(cand, this.feet);
    if (!there.surface && there.height < WATER_BLOCK_LEVEL && there.height < here) return 'water';
    const rise = there.height - here;
    if (this.grounded && rise > 0.02 && !there.surface) {
      const run = speed * dt;
      if (rise / Math.max(run, 1e-4) > MAX_SLOPE) return 'steep';
    }
    this.dir.copy(cand);
    return 'ok';
  }

  /** Tangent unit vector pointing away from the obstacle (toward walkable ground). */
  private blockNormal(d: Vector3, water: boolean): Vector3 {
    const e = new Vector3();
    const n = new Vector3();
    tangentFrame(d, e, n);
    const eps = 0.4 / PLANET_RADIUS;
    const hE = this.world.ground(new Vector3().copy(d).addScaledVector(e, eps).normalize(), this.feet).height;
    const hW = this.world.ground(new Vector3().copy(d).addScaledVector(e, -eps).normalize(), this.feet).height;
    const hN = this.world.ground(new Vector3().copy(d).addScaledVector(n, eps).normalize(), this.feet).height;
    const hS = this.world.ground(new Vector3().copy(d).addScaledVector(n, -eps).normalize(), this.feet).height;
    const grad = e.multiplyScalar(hE - hW).addScaledVector(n, hN - hS);
    // Water: walkable land is uphill. Steep slope: walkable ground is downhill.
    if (grad.lengthSq() < 1e-10) return grad;
    grad.normalize();
    return water ? grad : grad.negate();
  }
}
