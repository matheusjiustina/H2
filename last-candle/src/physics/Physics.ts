import * as CANNON from "cannon-es";
import type { PhysicsBoxDef } from "../world/Builder";

export const MAX_LIN = 9;
export const MAX_ANG = 25;

/**
 * Thin wrapper over cannon-es: fixed-step simulation, static level colliders,
 * sleeping, velocity clamps and impact callbacks.
 */
export class Physics {
  readonly world: CANNON.World;
  readonly propMat = new CANNON.Material("prop");
  readonly staticMat = new CANNON.Material("static");
  private tagged = new Map<string, CANNON.Body[]>();
  onImpact: ((body: CANNON.Body, other: CANNON.Body, speed: number) => void) | null = null;
  private dynamic = new Set<CANNON.Body>();
  private lastImpact = new WeakMap<CANNON.Body, number>();
  private time = 0;

  constructor() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    (this.world.solver as CANNON.GSSolver).iterations = 12;
    this.world.defaultContactMaterial.friction = 0.4;
    this.world.defaultContactMaterial.restitution = 0.15;
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.propMat, this.staticMat, { friction: 0.45, restitution: 0.22, contactEquationRelaxation: 3, contactEquationStiffness: 1e7 }),
    );
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.propMat, this.propMat, { friction: 0.4, restitution: 0.2 }));
  }

  addStatic(defs: PhysicsBoxDef[]) {
    for (const d of defs) {
      const body = new CANNON.Body({ mass: 0, material: this.staticMat, type: CANNON.Body.STATIC });
      body.addShape(new CANNON.Box(new CANNON.Vec3(d.half[0], d.half[1], d.half[2])));
      body.position.set(d.pos[0], d.pos[1], d.pos[2]);
      const q = new CANNON.Quaternion();
      q.setFromEuler(d.rotX ?? 0, d.rotY ?? 0, 0, "YXZ");
      body.quaternion.copy(q);
      (body as unknown as { tag?: string }).tag = d.tag;
      this.world.addBody(body);
      if (d.tag) {
        const list = this.tagged.get(d.tag) ?? [];
        list.push(body);
        this.tagged.set(d.tag, list);
      }
    }
  }

  /** Enable/disable static colliders by tag (doors, gates). */
  setTagEnabled(tag: string, on: boolean) {
    for (const b of this.tagged.get(tag) ?? []) {
      const inWorld = this.world.bodies.includes(b);
      if (on && !inWorld) this.world.addBody(b);
      if (!on && inWorld) this.world.removeBody(b);
    }
  }

  addDynamic(body: CANNON.Body) {
    if (!this.world.bodies.includes(body)) this.world.addBody(body);
    this.dynamic.add(body);
    const flagged = body as unknown as { __impactHooked?: boolean };
    if (flagged.__impactHooked) return;
    flagged.__impactHooked = true;
    body.addEventListener("collide", (e: { body: CANNON.Body; contact: CANNON.ContactEquation }) => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (v < 0.6) return;
      const last = this.lastImpact.get(body) ?? -1;
      if (this.time - last < 0.08) return;
      this.lastImpact.set(body, this.time);
      this.onImpact?.(body, e.body, v);
    });
  }

  removeDynamic(body: CANNON.Body) {
    if (this.world.bodies.includes(body)) this.world.removeBody(body);
    this.dynamic.delete(body);
  }

  /** Temporarily take a body out of the simulation (held objects). */
  suspend(body: CANNON.Body) {
    if (this.world.bodies.includes(body)) this.world.removeBody(body);
  }

  resume(body: CANNON.Body) {
    if (!this.world.bodies.includes(body)) this.world.addBody(body);
    body.wakeUp();
  }

  step(dt: number) {
    this.time += dt;
    this.world.step(1 / 60, dt, 3);
    for (const b of this.dynamic) {
      if (b.sleepState === CANNON.Body.SLEEPING) continue;
      const v = b.velocity;
      const sp = v.length();
      if (sp > MAX_LIN) v.scale(MAX_LIN / sp, v);
      const w = b.angularVelocity;
      const ap = w.length();
      if (ap > MAX_ANG) w.scale(MAX_ANG / ap, w);
    }
  }

  /** Closest static/dynamic hit along a segment, ignoring a given body. */
  raycast(from: CANNON.Vec3, to: CANNON.Vec3, skip?: CANNON.Body | null): CANNON.RaycastResult | null {
    const res = new CANNON.RaycastResult();
    const hit = this.world.raycastClosest(from, to, { skipBackfaces: true, collisionFilterMask: -1 }, res);
    if (!hit) return null;
    if (skip && res.body === skip) return null;
    return res;
  }

  get activeCount(): number {
    let n = 0;
    for (const b of this.dynamic) if (b.sleepState !== CANNON.Body.SLEEPING && this.world.bodies.includes(b)) n++;
    return n;
  }
}
