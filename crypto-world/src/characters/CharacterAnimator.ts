import { Quaternion, Vector3 } from 'three';
import { CharacterRig, PropName } from './CharacterRig';
import { clamp, damp, smoothstep } from '../core/math/sphere';

/** Pose channels (radians unless noted). Conventions: the character faces +Z, +X is its left. */
const enum C {
  rootY, rootX, rootZ, hipsY, spineX, spineY, spineZ, neckX, neckY, neckZ,
  shLX, shLY, shLZ, elLX, shRX, shRY, shRZ, elRX,
  hipLX, hipLZ, knLX, hipRX, hipRZ, knRX, rootFwd, COUNT,
}
const N = C.COUNT as number;
type Pose = Float32Array;

export type ActionName =
  | 'wave' | 'talk' | 'interact' | 'inspect' | 'receive' | 'deliver' | 'type' | 'hammer' | 'paint'
  | 'cheer' | 'think' | 'shrug' | 'nod' | 'point' | 'lookAround' | 'read' | 'drink' | 'sweep'
  | 'stretch' | 'phone' | 'listen' | 'laugh' | 'bow';

interface ActionDef {
  duration: number; // seconds (ignored when looping)
  fullBody?: boolean;
  prop?: PropName;
  pose: (t: number, out: Pose) => void;
}

const ARM_REST = (o: Pose) => {
  o[C.shLZ] = 0.1; o[C.shRZ] = -0.1; o[C.elLX] = -0.15; o[C.elRX] = -0.15;
};

const ACTIONS: Record<ActionName, ActionDef> = {
  wave: { duration: 1.8, pose: (t, o) => { ARM_REST(o); o[C.shRZ] = -2.55 + 0.22 * Math.sin(t * 10); o[C.elRX] = -0.45; o[C.neckZ] = 0.08; } },
  talk: { duration: 2.4, pose: (t, o) => {
    o[C.shLX] = -0.35 + 0.18 * Math.sin(t * 2.7); o[C.shLZ] = 0.2; o[C.elLX] = -1.0 + 0.15 * Math.sin(t * 3.1);
    o[C.shRX] = -0.45 + 0.22 * Math.sin(t * 2.1 + 1.2); o[C.shRZ] = -0.25; o[C.elRX] = -1.1 + 0.2 * Math.sin(t * 2.6 + 0.4);
    o[C.neckX] = 0.06 * Math.sin(t * 3.7); o[C.neckZ] = 0.05 * Math.sin(t * 1.3); o[C.spineY] = 0.06 * Math.sin(t * 1.1);
  } },
  listen: { duration: 2.4, pose: (t, o) => { ARM_REST(o); o[C.neckZ] = 0.12; o[C.neckX] = 0.05 + 0.05 * Math.sin(t * 2.2); } },
  interact: { duration: 1.1, pose: (t, o) => {
    const r = smoothstep(0, 0.35, t) * (1 - smoothstep(0.8, 1.1, t));
    ARM_REST(o); o[C.shRX] = -1.35 * r; o[C.elRX] = -0.15 - 0.25 * (1 - r); o[C.spineX] = 0.12 * r; o[C.neckX] = 0.15 * r;
  } },
  inspect: { duration: 2.6, pose: (t, o) => {
    o[C.spineX] = 0.26; o[C.neckX] = 0.28 + 0.06 * Math.sin(t * 1.5); o[C.neckY] = 0.15 * Math.sin(t * 0.9);
    o[C.shRX] = -1.15; o[C.shRZ] = 0.32; o[C.elRX] = -2.05; o[C.shLX] = -0.45; o[C.shLZ] = -0.25; o[C.elLX] = -1.45;
  } },
  think: { duration: 2.4, pose: (t, o) => {
    o[C.shRX] = -1.0; o[C.shRZ] = 0.32; o[C.elRX] = -2.15; o[C.shLX] = -0.4; o[C.shLZ] = -0.25; o[C.elLX] = -1.4;
    o[C.neckZ] = 0.16; o[C.neckX] = -0.12; o[C.neckY] = 0.2 * Math.sin(t * 0.6);
  } },
  receive: { duration: 2.2, prop: 'phone', pose: (t, o) => {
    const r = smoothstep(0, 0.4, t);
    ARM_REST(o); o[C.shRX] = -1.0 * r; o[C.shRZ] = 0.25 * r; o[C.elRX] = -1.55 * r; o[C.neckX] = 0.32 * r; o[C.shLX] = -0.2 * r;
  } },
  phone: { duration: 3, prop: 'phone', pose: (t, o) => {
    ARM_REST(o); o[C.shRX] = -1.0; o[C.shRZ] = 0.25; o[C.elRX] = -1.6; o[C.neckX] = 0.35; o[C.elLX] = -0.3; o[C.neckY] = 0.04 * Math.sin(t * 2);
  } },
  deliver: { duration: 1.8, prop: 'envelope', pose: (t, o) => {
    const r = smoothstep(0, 0.45, t) * (1 - smoothstep(1.4, 1.8, t));
    o[C.shLX] = -1.0 * r; o[C.elLX] = -0.6 * r; o[C.shRX] = -1.2 * r; o[C.elRX] = -0.45 * r; o[C.spineX] = 0.18 * r; o[C.neckX] = 0.1 * r;
    o[C.shLZ] = 0.1 - 0.15 * r; o[C.shRZ] = -0.1 + 0.15 * r;
  } },
  type: { duration: 3, pose: (t, o) => {
    o[C.shLX] = -0.85; o[C.shRX] = -0.85; o[C.shLZ] = -0.1; o[C.shRZ] = 0.1;
    o[C.elLX] = -1.0 + 0.12 * Math.sin(t * 15); o[C.elRX] = -1.0 + 0.12 * Math.sin(t * 13 + 1.7);
    o[C.neckX] = 0.18; o[C.spineX] = 0.08;
  } },
  hammer: { duration: 2.2, prop: 'tool', pose: (t, o) => {
    o[C.spineX] = 0.18; o[C.neckX] = 0.25;
    o[C.shRX] = -1.25 + 0.55 * Math.sin(t * 7); o[C.elRX] = -1.2 + 0.4 * Math.sin(t * 7 + 0.6);
    o[C.shLX] = -0.7; o[C.elLX] = -0.9;
  } },
  paint: { duration: 3, prop: 'brush', pose: (t, o) => {
    o[C.shRX] = -1.25 + 0.25 * Math.sin(t * 2.4); o[C.shRZ] = -0.3 + 0.35 * Math.sin(t * 2.4 + 1.3); o[C.elRX] = -0.55;
    o[C.shLZ] = 0.15; o[C.elLX] = -0.3; o[C.neckX] = 0.05; o[C.neckZ] = 0.1 * Math.sin(t * 0.7);
  } },
  cheer: { duration: 2, fullBody: true, pose: (t, o) => {
    const b = Math.abs(Math.sin(t * 7));
    o[C.shLZ] = 2.6; o[C.shRZ] = -2.6; o[C.elLX] = -0.4; o[C.elRX] = -0.4; o[C.rootY] = 0.06 * b; o[C.neckX] = -0.25;
  } },
  laugh: { duration: 1.8, pose: (t, o) => {
    ARM_REST(o); o[C.spineX] = 0.1 + 0.06 * Math.sin(t * 16); o[C.neckX] = -0.2 + 0.08 * Math.sin(t * 16); o[C.shLX] = -0.5; o[C.elLX] = -1.5; o[C.shLZ] = -0.2;
  } },
  shrug: { duration: 1.4, pose: (t, o) => {
    const r = smoothstep(0, 0.3, t) * (1 - smoothstep(1.0, 1.4, t));
    o[C.shLZ] = 0.1 + 0.45 * r; o[C.shRZ] = -0.1 - 0.45 * r; o[C.elLX] = -0.15 - 1.4 * r; o[C.elRX] = -0.15 - 1.4 * r; o[C.neckZ] = 0.22 * r; o[C.shLY] = 0.6 * r; o[C.shRY] = -0.6 * r;
  } },
  nod: { duration: 1.2, pose: (t, o) => { ARM_REST(o); o[C.neckX] = 0.28 * Math.sin(t * 9) * (1 - t / 1.2); } },
  bow: { duration: 1.6, fullBody: true, pose: (t, o) => { const r = Math.sin(clamp(t / 1.6, 0, 1) * Math.PI); ARM_REST(o); o[C.spineX] = 0.6 * r; o[C.neckX] = 0.3 * r; } },
  point: { duration: 1.6, pose: (t, o) => { const r = smoothstep(0, 0.3, t) * (1 - smoothstep(1.2, 1.6, t)); ARM_REST(o); o[C.shRX] = -1.55 * r; o[C.elRX] = -0.05; o[C.neckY] = -0.15 * r; } },
  lookAround: { duration: 4.5, pose: (t, o) => { ARM_REST(o); o[C.neckY] = 0.85 * Math.sin(t * 1.25); o[C.neckX] = -0.08; o[C.spineY] = 0.2 * Math.sin(t * 1.25); } },
  read: { duration: 3, prop: 'book', pose: (t, o) => {
    o[C.shLX] = -0.95; o[C.elLX] = -1.25; o[C.shLZ] = -0.2; o[C.shRX] = -0.75; o[C.elRX] = -1.15; o[C.shRZ] = 0.3; o[C.neckX] = 0.38 + 0.04 * Math.sin(t * 0.8);
  } },
  drink: { duration: 3, prop: 'cup', pose: (t, o) => {
    const sip = smoothstep(0.6, 1.0, Math.sin(t * 1.3) * 0.5 + 0.5);
    ARM_REST(o); o[C.shRX] = -0.75 - 0.55 * sip; o[C.shRZ] = 0.2 + 0.2 * sip; o[C.elRX] = -1.45 - 0.55 * sip; o[C.neckX] = -0.15 * sip;
  } },
  sweep: { duration: 3, pose: (t, o) => {
    o[C.spineX] = 0.2; o[C.shLX] = -0.6 + 0.3 * Math.sin(t * 3); o[C.shRX] = -0.4 + 0.3 * Math.sin(t * 3); o[C.elLX] = -0.5; o[C.elRX] = -0.9; o[C.spineY] = 0.25 * Math.sin(t * 3);
  } },
  stretch: { duration: 2.2, pose: (t, o) => { const r = Math.sin(clamp(t / 2.2, 0, 1) * Math.PI); o[C.shLZ] = 2.7 * r + 0.1; o[C.shRZ] = -2.7 * r - 0.1; o[C.spineX] = -0.15 * r; o[C.neckX] = -0.3 * r; } },
};

const tmpV = new Vector3();
const tmpQ = new Quaternion();

/**
 * Procedural animation with layered blending:
 *   base locomotion (idle ↔ walk ↔ run, phase locked to distance so feet do not slide)
 *   → sit / airborne overrides → one-shot or looping actions → turn lean, look-at and blinking.
 */
export class CharacterAnimator {
  speed = 0;
  grounded = true;
  turnRate = 0;
  sitting = false;
  /** World position the head should turn toward (null = look ahead). */
  lookTarget: Vector3 | null = null;
  walkStride: number;
  runStride: number;
  idleTime = 0;
  autoLookAround = true;

  private phase = 0;
  private t = 0;
  private sitW = 0;
  private airW = 0;
  private stopLean = 0;
  private prevSpeed = 0;
  private action: { name: ActionName; t: number; loop: boolean; w: number; fading: boolean } | null = null;
  private fadingOut: { name: ActionName; t: number; w: number } | null = null;
  private blinkT = 2;
  private blinking = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private base = new Float32Array(N);
  private a = new Float32Array(N);
  private b = new Float32Array(N);
  private act = new Float32Array(N);

  constructor(readonly rig: CharacterRig) {
    const s = rig.scale;
    this.walkStride = 1.3 * s;
    this.runStride = 2.15 * s;
  }

  get currentAction(): ActionName | null {
    return this.action && !this.action.fading ? this.action.name : null;
  }

  play(name: ActionName, loop = false): void {
    if (this.action && this.action.name === name && !this.action.fading) {
      this.action.loop = loop;
      return;
    }
    if (this.action) this.fadingOut = { name: this.action.name, t: this.action.t, w: this.action.w };
    this.action = { name, t: 0, loop, w: 0, fading: false };
    this.syncProps();
  }

  stop(): void {
    if (this.action) this.action.fading = true;
  }

  private syncProps(): void {
    const want = this.action && !this.action.fading ? ACTIONS[this.action.name].prop : undefined;
    for (const p of ['envelope', 'phone', 'tool', 'cup', 'brush', 'book'] as PropName[]) this.rig.showProp(p, p === want);
  }

  /** Force a prop on (e.g. carrying a parcel while walking). */
  holding: PropName | null = null;

  update(dt: number, distance: number): void {
    this.t += dt;
    const sp = this.speed;
    const sc = this.rig.scale;
    const walkW = smoothstep(0.05, 1.2 * sc, sp);
    const runW = smoothstep(3.4 * sc, 5.2 * sc, sp);
    const stride = this.walkStride + (this.runStride - this.walkStride) * runW;
    this.phase = (this.phase + (distance / stride) * Math.PI * 2) % (Math.PI * 2);
    if (sp < 0.05) this.idleTime += dt; else this.idleTime = 0;

    // Stop lean: brief lean back when braking hard.
    const decel = (this.prevSpeed - sp) / Math.max(dt, 1e-4);
    this.prevSpeed = sp;
    if (decel > 6 && this.grounded) this.stopLean = Math.min(1, this.stopLean + dt * 6);
    else this.stopLean = Math.max(0, this.stopLean - dt * 2.5);

    // ---- Base locomotion -----------------------------------------------------------------------
    const base = this.base;
    this.idlePose(this.t, this.a);
    this.locoPose(this.phase, runW, this.b);
    for (let i = 0; i < N; i++) base[i] = this.a[i] + (this.b[i] - this.a[i]) * walkW;
    // Small shuffle when turning on the spot.
    if (sp < 0.3 && Math.abs(this.turnRate) > 1.2) {
      const s = Math.sin(this.t * 14) * 0.18;
      base[C.hipLX] += s; base[C.hipRX] -= s; base[C.knLX] += Math.max(0, s) * 1.2; base[C.knRX] += Math.max(0, -s) * 1.2;
    }

    // ---- Sit / airborne ------------------------------------------------------------------------------
    this.sitW += ((this.sitting ? 1 : 0) - this.sitW) * damp(7, dt);
    if (this.sitW > 0.001) {
      this.sitPose(this.t, this.a);
      for (let i = 0; i < N; i++) base[i] += (this.a[i] - base[i]) * this.sitW;
    }
    this.airW += ((this.grounded ? 0 : 1) - this.airW) * damp(this.grounded ? 14 : 8, dt);
    if (this.airW > 0.001) {
      this.airPose(this.a);
      for (let i = 0; i < N; i++) base[i] += (this.a[i] - base[i]) * this.airW;
    }

    // ---- Automatic idle flourishes -------------------------------------------------------------------
    if (this.autoLookAround && !this.action && !this.sitting && this.idleTime > 8) {
      this.play(Math.random() < 0.7 ? 'lookAround' : 'stretch');
      this.idleTime = -6;
    }

    // ---- Action layer ------------------------------------------------------------------------------------
    const upper = (i: number) => i >= C.spineX && i <= C.elRX;
    if (this.fadingOut) {
      const f = this.fadingOut;
      f.t += dt;
      f.w -= dt * 4;
      if (f.w <= 0) this.fadingOut = null;
      else {
        this.act.fill(0);
        ACTIONS[f.name].pose(f.t, this.act);
        const full = ACTIONS[f.name].fullBody;
        for (let i = 0; i < N; i++) if ((full && i === C.rootY) || upper(i)) base[i] += (this.act[i] - base[i]) * f.w * (1 - this.locoMask(i, walkW));
      }
    }
    if (this.action) {
      const a = this.action;
      const def = ACTIONS[a.name];
      a.t += dt;
      if (!a.loop && a.t > def.duration) a.fading = true;
      a.w += (a.fading ? -1 : 1) * dt * 4;
      a.w = clamp(a.w, 0, 1);
      if (a.fading && a.w <= 0) {
        this.action = null;
        this.syncProps();
      } else {
        this.act.fill(0);
        def.pose(a.t, this.act);
        const w = smoothstep(0, 1, a.w);
        for (let i = 0; i < N; i++) {
          if (!((def.fullBody && i === C.rootY) || upper(i))) continue;
          base[i] += (this.act[i] - base[i]) * w * (1 - this.locoMask(i, walkW));
        }
      }
    }
    if (this.holding && !(this.action && ACTIONS[this.action.name].prop)) {
      // Carrying something: keep it in view against the chest.
      this.rig.showProp(this.holding, true);
      base[C.shRX] = Math.min(base[C.shRX], -0.55);
      base[C.elRX] = -1.25;
    }

    // ---- Additive layers ------------------------------------------------------------------------------
    base[C.rootZ] += clamp(-this.turnRate * sp * 0.025, -0.16, 0.16);
    base[C.spineX] -= this.stopLean * 0.22;
    // Look-at.
    let yaw = 0, pitch = 0;
    if (this.lookTarget) {
      const head = this.rig.bones.head;
      head.getWorldPosition(tmpV);
      const local = tmpV.subVectors(this.lookTarget, tmpV);
      this.rig.group.getWorldQuaternion(tmpQ);
      local.applyQuaternion(tmpQ.invert());
      yaw = clamp(Math.atan2(local.x, local.z), -1.15, 1.15);
      pitch = clamp(-Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.45, 0.5);
      if (Math.abs(Math.atan2(local.x, local.z)) > 2.2) yaw = 0;
    }
    this.lookYaw += (yaw - this.lookYaw) * damp(6, dt);
    this.lookPitch += (pitch - this.lookPitch) * damp(6, dt);
    base[C.neckY] += this.lookYaw * 0.7;
    base[C.spineY] += this.lookYaw * 0.25;
    base[C.neckX] += this.lookPitch * 0.8;

    this.apply(base);

    // Blink.
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinking = 0.14;
      this.blinkT = 2 + Math.random() * 4;
    }
    if (this.blinking > 0) this.blinking -= dt;
    this.rig.bones.eyes.scale.y = this.blinking > 0 ? 0.12 : 1;
  }

  /** While walking, actions only drive the arms partially so the gait still reads. */
  private locoMask(i: number, walkW: number): number {
    if (i >= C.shLX && i <= C.elRX) return walkW * 0.35;
    if (i === C.spineX || i === C.spineY) return walkW * 0.6;
    return 0;
  }

  private idlePose(t: number, o: Pose): void {
    o.fill(0);
    const br = Math.sin(t * 1.7);
    o[C.rootY] = 0.004 * br;
    o[C.spineX] = 0.015 * br - 0.01;
    o[C.neckX] = -0.01 * br;
    o[C.shLZ] = 0.09 + 0.012 * br; o[C.shRZ] = -0.09 - 0.012 * br;
    o[C.elLX] = -0.14; o[C.elRX] = -0.14;
    o[C.shLX] = 0.02; o[C.shRX] = 0.02;
    const shift = Math.sin(t * 0.45);
    o[C.rootZ] = 0.025 * shift;
    o[C.hipLZ] = 0.02 * shift; o[C.hipRZ] = 0.02 * shift;
    o[C.knLX] = 0.04 + 0.03 * Math.max(0, shift); o[C.knRX] = 0.04 + 0.03 * Math.max(0, -shift);
    o[C.neckY] = 0.08 * Math.sin(t * 0.31) + 0.04 * Math.sin(t * 0.83);
  }

  private locoPose(p: number, run: number, o: Pose): void {
    o.fill(0);
    const s = Math.sin(p), c = Math.cos(p);
    const legA = 0.5 + 0.38 * run;
    const armA = 0.42 + 0.3 * run;
    const knee = 0.75 + 0.75 * run;
    o[C.hipLX] = -legA * s;
    o[C.hipRX] = legA * s;
    o[C.knLX] = 0.08 + knee * Math.pow(Math.max(0, c), 1.4);
    o[C.knRX] = 0.08 + knee * Math.pow(Math.max(0, -c), 1.4);
    o[C.shLX] = armA * s;
    o[C.shRX] = -armA * s;
    o[C.shLZ] = 0.08; o[C.shRZ] = -0.08;
    o[C.elLX] = -0.3 - 1.0 * run - 0.15 * Math.max(0, -s);
    o[C.elRX] = -0.3 - 1.0 * run - 0.15 * Math.max(0, s);
    const bob = 0.035 + 0.04 * run;
    o[C.rootY] = -bob * (1 - Math.cos(2 * p)) / 2 + 0.01;
    o[C.hipsY] = 0.09 * s;
    o[C.spineY] = -0.07 * s;
    o[C.rootZ] = 0.025 * s;
    o[C.spineX] = 0.05 + 0.2 * run;
    o[C.neckX] = -0.03 - 0.1 * run;
  }

  private sitPose(t: number, o: Pose): void {
    o.fill(0);
    const seat = 0.45;
    o[C.rootY] = seat - this.rig.legLength + 0.02;
    o[C.rootFwd] = -0.2;
    o[C.hipLX] = -1.45; o[C.hipRX] = -1.45;
    o[C.knLX] = 1.4; o[C.knRX] = 1.4;
    o[C.hipLZ] = 0.06; o[C.hipRZ] = -0.06;
    o[C.shLX] = -0.45; o[C.shRX] = -0.45; o[C.elLX] = -0.55; o[C.elRX] = -0.55;
    o[C.shLZ] = 0.05; o[C.shRZ] = -0.05;
    o[C.spineX] = 0.04 + 0.012 * Math.sin(t * 1.6);
    o[C.neckY] = 0.12 * Math.sin(t * 0.27);
  }

  private airPose(o: Pose): void {
    o.fill(0);
    o[C.hipLX] = -0.75; o[C.hipRX] = -0.3;
    o[C.knLX] = 1.1; o[C.knRX] = 0.7;
    o[C.shLX] = -0.5; o[C.shRX] = 0.3; o[C.shLZ] = 0.55; o[C.shRZ] = -0.55;
    o[C.elLX] = -0.6; o[C.elRX] = -0.6;
    o[C.spineX] = 0.12;
    o[C.rootY] = 0.0;
  }

  private apply(p: Pose): void {
    const B = this.rig.bones;
    const bp = this.rig.bind;
    B.root.position.set(0, p[C.rootY], p[C.rootFwd]);
    B.root.rotation.set(p[C.rootX], 0, p[C.rootZ]);
    B.hips.position.copy(bp.hips);
    B.hips.rotation.set(0, p[C.hipsY], 0);
    B.spine.rotation.set(p[C.spineX], p[C.spineY], p[C.spineZ]);
    B.head.rotation.set(p[C.neckX], p[C.neckY], p[C.neckZ]);
    B.shL.rotation.set(p[C.shLX], p[C.shLY], p[C.shLZ]);
    B.elL.rotation.set(p[C.elLX], 0, 0);
    B.shR.rotation.set(p[C.shRX], p[C.shRY], p[C.shRZ]);
    B.elR.rotation.set(p[C.elRX], 0, 0);
    B.hipL.rotation.set(p[C.hipLX], 0, p[C.hipLZ]);
    B.knL.rotation.set(p[C.knLX], 0, 0);
    B.hipR.rotation.set(p[C.hipRX], 0, p[C.hipRZ]);
    B.knR.rotation.set(p[C.knRX], 0, 0);
  }
}
