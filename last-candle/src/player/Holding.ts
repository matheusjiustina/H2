import * as CANNON from "cannon-es";
import * as THREE from "three";
import type { Game } from "../core/Game";
import { bus } from "../core/EventBus";
import { clamp } from "../core/math";
import { fx } from "../core/rng";
import type { Prop } from "../physics/Props";

const CHARGE_DELAY = 0.22;

/**
 * Everything about the object in the player's hand: grab, hold, rotate (R),
 * inspect (RMB), use (LMB click), throw (hold LMB), drop (Q) and place (E).
 */
export class Holding {
  held: Prop | null = null;
  private lmbT = 0;
  private charging = false;
  private lastUse = 0;

  constructor(private g: Game) {}

  grab(p: Prop) {
    const g = this.g;
    if (this.held || p.state === "held") return;
    if (p.state === "pinned") g.unpinReceipt(p);
    if (p.state === "stored") return;
    p.state = "held";
    g.physics.suspend(p.body);
    p.body.velocity.setZero();
    p.body.angularVelocity.setZero();
    g.hands.hold(p.mesh, p.def.hold.pos, p.def.hold.rot, p.def.inspect);
    this.held = p;
    g.audio.play("tick", undefined, 0.6);
    g.hands.play("reach", 0.3);
  }

  /** Remove from hand without dropping into the world (stored, consumed). */
  consume(): Prop | null {
    const p = this.held;
    if (!p) return null;
    this.g.hands.release();
    this.held = null;
    return p;
  }

  private worldStart(): { pos: THREE.Vector3; quat: THREE.Quaternion } {
    const g = this.g;
    const cam = g.camera;
    const tr = g.hands.heldWorldTransform(cam);
    const camPos = cam.getWorldPosition(new THREE.Vector3());
    let pos = tr ? tr.pos : camPos.clone().add(cam.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.4));
    const quat = tr ? tr.quat : new THREE.Quaternion();
    // never spawn inside walls/furniture: clamp along the camera→hand segment
    const dir = pos.clone().sub(camPos);
    const len = dir.length();
    dir.normalize();
    const hit = g.physics.raycast(new CANNON.Vec3(camPos.x, camPos.y, camPos.z), new CANNON.Vec3(pos.x + dir.x * 0.08, pos.y + dir.y * 0.08, pos.z + dir.z * 0.08));
    if (hit) {
      const d = Math.max(0.05, hit.distance - 0.09);
      pos = camPos.clone().addScaledVector(dir, Math.min(d, len));
    }
    return { pos, quat };
  }

  private toWorld(p: Prop, pos: THREE.Vector3, quat: THREE.Quaternion, vel: THREE.Vector3) {
    const g = this.g;
    const mesh = g.hands.release();
    if (mesh) g.props.group.add(mesh);
    p.body.position.set(pos.x, pos.y, pos.z);
    p.body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    p.body.interpolatedPosition.copy(p.body.position);
    p.body.interpolatedQuaternion.copy(p.body.quaternion);
    p.body.previousPosition.copy(p.body.position);
    p.body.velocity.set(vel.x, vel.y, vel.z);
    p.body.angularVelocity.set(fx.range(-2, 2), fx.range(-2, 2), fx.range(-2, 2)).scale(Math.min(1, vel.length() / 4), p.body.angularVelocity);
    p.state = "free";
    p.binScored = false;
    g.physics.resume(p.body);
    g.props.sync(p);
    this.held = null;
  }

  drop() {
    const p = this.held;
    if (!p) return;
    const { pos, quat } = this.worldStart();
    const fwd = this.g.camera.getWorldDirection(new THREE.Vector3());
    this.toWorld(p, pos, quat, fwd.multiplyScalar(0.6));
  }

  throw(power: number) {
    const g = this.g;
    const p = this.held;
    if (!p) return;
    const { pos, quat } = this.worldStart();
    const dir = g.camera.getWorldDirection(new THREE.Vector3());
    dir.y += 0.1;
    dir.normalize();
    // heavier things don't fly as far
    const massK = clamp(0.35 / Math.max(0.05, p.def.mass), 0.35, 1);
    const speed = (2.4 + power * 6.4) * (0.55 + 0.45 * massK);
    const v = dir.multiplyScalar(speed);
    this.toWorld(p, pos, quat, v);
    p.thrownAt = g.time;
    p.thrownFromZ = g.player.pos.z;
    p.thrownByPlayer = true;
    g.hands.play("throw", 0.35);
    g.audio.play("swoosh", undefined, 0.4 + power * 0.4);
    g.progress.d.stats.throws++;
    bus.emit("player:threw", { propKind: p.def.kind });
  }

  /** Place gently on a surface hit point (upright, keeping the R rotation). */
  placeAt(point: THREE.Vector3, normal: THREE.Vector3) {
    const p = this.held;
    if (!p) return false;
    if (normal.y < 0.55) return false;
    const pos = point.clone().addScaledVector(normal, p.def.halfHeight + 0.012);
    const yaw = this.g.player.yaw + this.g.hands.extraYaw;
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.toWorld(p, pos, quat, new THREE.Vector3());
    this.g.hands.play("reach", 0.3);
    return true;
  }

  /** E with something in hand and nothing special targeted: place on the aimed surface or drop. */
  placeOrDrop() {
    const g = this.g;
    const cam = g.camera;
    const from = cam.getWorldPosition(new THREE.Vector3());
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const to = from.clone().addScaledVector(dir, 2.3);
    const hit = g.physics.raycast(new CANNON.Vec3(from.x, from.y, from.z), new CANNON.Vec3(to.x, to.y, to.z));
    if (hit && !(hit.body as unknown as { npcId?: string }).npcId) {
      const n = new THREE.Vector3(hit.hitNormalWorld.x, hit.hitNormalWorld.y, hit.hitNormalWorld.z);
      const pt = new THREE.Vector3(hit.hitPointWorld.x, hit.hitPointWorld.y, hit.hitPointWorld.z);
      if (this.placeAt(pt, n)) return;
    }
    this.drop();
  }

  update(dt: number, aimingBoard: boolean) {
    const g = this.g;
    const inp = g.input;
    const p = this.held;
    if (!p) {
      this.charging = false;
      g.hands.inspecting = false;
      return;
    }
    // inspect
    const inspect = inp.rmb;
    g.hands.inspecting = inspect;
    if (inspect) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(inp.mouseDY * 0.008, inp.mouseDX * 0.008, 0));
      g.hands.inspectRot.premultiply(q);
    } else g.hands.inspectRot.slerp(new THREE.Quaternion(), Math.min(1, dt * 6));
    if (inp.pressed("KeyR")) {
      g.hands.extraYaw += Math.PI / 2;
      g.audio.play("tick", undefined, 0.3);
    }
    if (inp.pressed("KeyQ") || inp.pressed("KeyG")) {
      this.drop();
      return;
    }
    // drawing is handled by the whiteboard interaction
    const isMarker = p.def.use === "draw";
    if (isMarker && aimingBoard) {
      this.lmbT = 0;
      this.charging = false;
      return;
    }
    if (inp.lmbDown || inp.dragClick) this.lmbT = 0.0001;
    if (this.lmbT > 0 && inp.lmb) {
      this.lmbT += dt;
      if (this.lmbT > CHARGE_DELAY) {
        if (!this.charging) {
          this.charging = true;
          g.hands.play("throwCharge");
        }
        g.hands.charge = clamp((this.lmbT - CHARGE_DELAY) / 0.9, 0, 1);
      }
    }
    if (this.lmbT > 0 && (inp.lmbUp || inp.dragClick || !inp.lmb)) {
      if (this.charging) this.throw(g.hands.charge);
      else this.use();
      this.lmbT = 0;
      this.charging = false;
      g.hands.charge = 0;
    }
  }

  use() {
    const g = this.g;
    const p = this.held;
    if (!p || g.time - this.lastUse < 0.5) return;
    this.lastUse = g.time;
    switch (p.def.use) {
      case "drink": {
        if (p.def.kind === "can" && p.uses <= 0) {
          bus.emit("toast", { text: "It's empty. The bin is by the counter." });
          return;
        }
        if (p.def.kind === "can" && p.uses === 3) g.audio.play("canOpen");
        g.hands.play("drink", 0.95);
        g.events.at(0.35, () => g.audio.play("sip"));
        if (p.def.kind === "can") {
          p.uses--;
          if (p.data.fromFridge) bus.emit("player:drank", { propKind: "can" });
          if (p.uses <= 0) p.data.empty = true;
        } else {
          p.uses--;
          if (p.uses === 0) bus.emit("toast", { text: "The coffee is cold. You drink it anyway." });
        }
        g.progress.d.stats.drinks++;
        break;
      }
      case "eat":
        if (p.uses <= 0) {
          bus.emit("toast", { text: "Just crumbs and regret." });
          return;
        }
        p.uses--;
        if (p.uses <= 0) p.data.empty = true;
        g.hands.play("eat", 0.7);
        g.events.at(0.25, () => g.audio.play("crunch"));
        break;
      case "squeak":
        g.hands.play("squeak", 0.6);
        g.audio.play("squeak");
        break;
      case "throw":
        this.throw(0.35);
        break;
      case "draw":
        bus.emit("toast", { text: "Aim at the whiteboard and hold the left mouse button to draw." });
        break;
      case "show": {
        g.hands.play("show", 1.6);
        const head = g.camera.getWorldPosition(new THREE.Vector3());
        const n = g.npcs.nearestTo(g.player.pos, (x) => x.free && Math.hypot(x.x - head.x, x.z - head.z) < 3.2);
        if (n) {
          n.lookAtPlayer(3);
          g.npcs.cascade(n, "nod", "receiptShow", 0.6);
        }
        bus.emit("receipt:shown", { tradeId: Number(p.data.tradeId ?? 0), npcId: n?.id ?? null });
        break;
      }
      default:
        break;
    }
  }

  get label(): string | null {
    return this.held ? (this.held.data.empty ? `Empty ${this.held.def.kind === "chips" ? "bag" : this.held.def.kind}` : this.held.def.name) : null;
  }
}
