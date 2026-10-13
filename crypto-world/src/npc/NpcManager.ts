import { CanvasTexture, Group, Scene, Sprite, SpriteMaterial, SRGBColorSpace, Vector3 } from 'three';
import { Avatar } from '../characters/Avatar';
import { ActionName } from '../characters/CharacterAnimator';
import { NpcDef, NPCS, RoutineEntry, Spot } from '../data/npcs';
import { World } from '../world/World';
import { WorldContent } from '../world/content/WorldContent';
import { PLANET_RADIUS } from '../world/constants';
import { damp } from '../core/math/sphere';
import { HorizonCuller } from '../render/Culling';

export interface ResolvedSpot {
  dir: Vector3;
  facing: Vector3;
  sit: boolean;
}

export type MarkerKind = 'new' | 'target' | null;

const _v = new Vector3();
const _w = new Vector3();

/** One resident of the planet, driven by a lightweight state machine. */
export class Npc {
  readonly avatar: Avatar;
  readonly dir = new Vector3();
  readonly facing = new Vector3();
  feet = 0;
  speed = 0;
  state: 'idle' | 'walking' | 'talking' = 'idle';
  talkingTo: Vector3 | null = null;
  marker: MarkerKind = null;
  private markerSprite: Sprite | null = null;
  private target: ResolvedSpot | null = null;
  private entry: RoutineEntry | null = null;
  private actionTimer = 2;
  private stuck = 0;
  private waveCooldown = 0;
  private wasNear = false;
  private lastDist = 0;
  private animAccum = 0;
  sitting = false;

  constructor(readonly def: NpcDef, private mgr: NpcManager) {
    this.avatar = new Avatar(def.look);
    this.avatar.group.name = `npc-${def.id}`;
  }

  private readonly pos = new Vector3();

  /** World position of the feet (a vector owned by this NPC; copy it if you keep it). */
  get position(): Vector3 {
    return this.pos.copy(this.dir).multiplyScalar(PLANET_RADIUS + this.feet);
  }

  headPosition(out = new Vector3()): Vector3 {
    return out.copy(this.dir).multiplyScalar(PLANET_RADIUS + this.feet + this.avatar.rig.height * 0.85);
  }

  get talkRadius(): number {
    return this.def.talkRadius ?? 2.7;
  }

  /** Puts the NPC at the spot for the current time immediately (on load). */
  snapToRoutine(hours: number): void {
    this.entry = this.mgr.entryAt(this.def, hours);
    const s = this.mgr.resolveSpot(this.def, this.entry.spot);
    this.target = s;
    this.dir.copy(s.dir);
    this.facing.copy(s.facing);
    this.feet = this.mgr.world.collision.ground(this.dir).height;
    this.sitting = s.sit && this.entry.activity.kind === 'sit';
    this.state = 'idle';
    this.avatar.anim.sitting = this.sitting;
    this.avatar.place(this.renderFeet(), this.dir, this.facing, 0);
  }

  private renderFeet(): Vector3 {
    return _w.copy(this.dir).multiplyScalar(PLANET_RADIUS + this.feet);
  }

  update(dt: number, hours: number, player: Vector3, playerBusy: boolean, animate: boolean): void {
    const world = this.mgr.world;
    // Routine changes.
    const entry = this.mgr.entryAt(this.def, hours);
    if (entry !== this.entry && this.state !== 'talking') {
      this.entry = entry;
      this.target = this.mgr.resolveSpot(this.def, entry.spot);
      if (this.sitting) {
        this.sitting = false;
        this.avatar.anim.sitting = false;
      }
    }
    const tgt = this.target!;
    const toPlayer = player.distanceTo(this.position);

    let moved = 0;
    if (this.state === 'talking' && this.talkingTo) {
      this.faceToward(this.talkingTo, dt, 6);
      this.speed = 0;
    } else {
      const dist = this.dir.angleTo(tgt.dir) * PLANET_RADIUS;
      if (dist > 0.25) {
        // Walk toward the spot along the surface, sliding around obstacles.
        if (this.sitting) {
          this.sitting = false;
          this.avatar.anim.sitting = false;
        }
        this.state = 'walking';
        const here = this.position;
        const blocked = toPlayer < 1.2 && _v.copy(player).sub(here).dot(this.facing) > 0;
        const want = blocked ? 0 : Math.min(1.55, 0.6 + dist);
        this.speed += (want - this.speed) * damp(5, dt);
        const step = this.speed * dt;
        const tangent = _v.copy(tgt.dir).addScaledVector(this.dir, -tgt.dir.dot(this.dir)).normalize();
        this.facing.lerp(tangent, damp(6, dt)).addScaledVector(this.dir, -this.facing.dot(this.dir)).normalize();
        const before = this.dir.clone();
        const axis = _w.crossVectors(this.dir, this.facing).normalize();
        this.dir.applyAxisAngle(axis, Math.min(step, dist) / PLANET_RADIUS).normalize();
        world.collision.resolve(this.dir, this.feet, 0.3, 1.5);
        moved = before.angleTo(this.dir) * PLANET_RADIUS;
        if (moved < step * 0.3 && !blocked) this.stuck += dt; else this.stuck = Math.max(0, this.stuck - dt);
        if (this.stuck > 2.5 && toPlayer > 18) {
          this.dir.copy(tgt.dir);
          this.stuck = 0;
        }
        const g = world.collision.ground(this.dir, this.feet);
        this.feet += (g.height - this.feet) * Math.min(1, dt * 18);
      } else {
        // Arrived: settle into the activity.
        if (this.state === 'walking') {
          this.state = 'idle';
          this.actionTimer = 0.5;
        }
        this.speed += (0 - this.speed) * damp(8, dt);
        this.dir.lerp(tgt.dir, damp(4, dt)).normalize();
        const g = world.collision.ground(this.dir, this.feet + 0.5);
        this.feet += (g.height - this.feet) * Math.min(1, dt * 10);
        const act = this.entry!.activity;
        if (act.kind === 'sit' && tgt.sit) {
          if (!this.sitting) {
            this.sitting = true;
            this.avatar.anim.sitting = true;
          }
          this.turnToward(tgt.facing, dt);
        } else if (act.kind === 'chat') {
          const partner = this.mgr.byId(act.with);
          if (partner && partner.position.distanceTo(this.position) < 4) this.faceToward(partner.position, dt, 4);
          else this.turnToward(tgt.facing, dt);
        } else if (toPlayer < 5.5 && !playerBusy) {
          this.faceToward(player, dt, 1.5);
        } else {
          this.turnToward(tgt.facing, dt);
        }
        this.runActivity(dt, act, toPlayer);
      }
    }

    // Greeting wave when the player approaches.
    this.waveCooldown -= dt;
    const near = toPlayer < 4.5;
    if (near && !this.wasNear && this.waveCooldown <= 0 && this.state === 'idle' && !this.sitting) {
      this.avatar.anim.play('wave');
      this.waveCooldown = 45;
    }
    this.wasNear = near;

    // Look at the player when nearby.
    const anim = this.avatar.anim;
    if (this.state === 'talking' && this.talkingTo) anim.lookTarget = this.talkingTo;
    else if (toPlayer < 6) anim.lookTarget = player.clone().addScaledVector(player.clone().normalize(), 1.3);
    else anim.lookTarget = null;

    anim.speed = this.speed;
    anim.grounded = true;
    this.lastDist = moved;
    this.avatar.place(this.renderFeet(), this.dir, this.facing, dt, 10);
    // Distant NPCs animate at a reduced rate.
    this.animAccum += dt;
    if (animate || this.animAccum > 0.25) {
      anim.update(this.animAccum, this.lastDist);
      this.animAccum = 0;
    }
    this.updateMarker();
  }

  private runActivity(dt: number, act: NonNullable<RoutineEntry['activity']>, toPlayer: number): void {
    const anim = this.avatar.anim;
    this.actionTimer -= dt;
    if (this.actionTimer > 0) return;
    switch (act.kind) {
      case 'work':
        anim.play(act.action, true);
        this.actionTimer = 4;
        break;
      case 'chat': {
        const partner = this.mgr.byId(act.with);
        if (partner && partner.position.distanceTo(this.position) < 4) {
          const mine = Math.floor(performance.now() / 2600) % 2 === (this.def.id < act.with ? 0 : 1);
          anim.play(mine ? 'talk' : (Math.random() < 0.3 ? 'laugh' : 'listen'));
        }
        this.actionTimer = 2.6;
        break;
      }
      case 'idle': {
        const list: ActionName[] = act.actions ?? ['lookAround'];
        if (toPlayer > 3 && Math.random() < 0.6) anim.play(list[Math.floor(Math.random() * list.length)]);
        this.actionTimer = 4 + Math.random() * 5;
        break;
      }
      case 'watch':
        anim.play('think');
        this.actionTimer = 8;
        break;
      default:
        this.actionTimer = 5;
    }
  }

  private turnToward(fwd: Vector3, dt: number): void {
    this.facing.lerp(fwd, damp(4, dt)).addScaledVector(this.dir, -this.facing.dot(this.dir)).normalize();
  }

  faceToward(p: Vector3, dt: number, rate = 5): void {
    const t = _v.copy(p).normalize().sub(this.dir);
    t.addScaledVector(this.dir, -t.dot(this.dir));
    if (t.lengthSq() < 1e-10) return;
    t.normalize();
    if (dt <= 0) this.facing.copy(t);
    else this.facing.lerp(t, damp(rate, dt)).addScaledVector(this.dir, -this.facing.dot(this.dir)).normalize();
  }

  /** Enter/leave conversation with the player. */
  beginTalk(with_: Vector3): void {
    this.state = 'talking';
    this.talkingTo = with_.clone();
    if (this.sitting) {
      // Stay seated; just look up.
    }
    this.avatar.anim.stop();
  }

  endTalk(): void {
    this.state = 'idle';
    this.talkingTo = null;
    this.actionTimer = 2;
  }

  private updateMarker(): void {
    if (!this.marker) {
      if (this.markerSprite) this.markerSprite.visible = false;
      return;
    }
    if (!this.markerSprite) {
      this.markerSprite = new Sprite(this.mgr.markerMaterial(this.marker));
      this.markerSprite.scale.set(0.42, 0.42, 1);
      this.markerSprite.renderOrder = 10;
      this.avatar.group.add(this.markerSprite);
    }
    this.markerSprite.material = this.mgr.markerMaterial(this.marker);
    this.markerSprite.visible = this.state !== 'talking';
    this.markerSprite.position.set(0, this.avatar.rig.height + 0.42 + Math.sin(performance.now() / 300) * 0.05, 0);
  }
}

/** Creates, updates and looks up every NPC. */
export class NpcManager {
  readonly npcs: Npc[] = [];
  readonly group = new Group();
  private markerMats = new Map<string, SpriteMaterial>();

  constructor(readonly world: World, readonly content: WorldContent, scene: Scene, private culler: HorizonCuller) {
    this.group.name = 'npcs';
    scene.add(this.group);
    for (const def of NPCS) {
      const npc = new Npc(def, this);
      this.npcs.push(npc);
      this.group.add(npc.avatar.group);
    }
  }

  byId(id: string): Npc | undefined {
    return this.npcs.find((n) => n.def.id === id);
  }

  entryAt(def: NpcDef, hours: number): RoutineEntry {
    for (const e of def.routine) {
      const inside = e.from <= e.to ? hours >= e.from && hours < e.to : hours >= e.from || hours < e.to;
      if (inside) return e;
    }
    return def.routine[0];
  }

  resolveSpot(def: NpcDef, name: string): ResolvedSpot {
    const spot: Spot | undefined = def.spots[name];
    if (!spot) throw new Error(`NPC ${def.id} has no spot ${name}`);
    if ('anchor' in spot) {
      const a = this.content.anchors.get(spot.anchor);
      const it = a ? null : this.content.interacts.find((i) => i.id === spot.anchor);
      const src = a ?? it;
      if (!src) throw new Error(`Unknown anchor ${spot.anchor} for ${def.id}`);
      const up = src.pos.clone().normalize();
      const fwd = src.forward.clone();
      const side = new Vector3().crossVectors(up, fwd).normalize();
      const p = src.pos.clone().addScaledVector(side, spot.dx ?? 0).addScaledVector(fwd, spot.dz ?? 0);
      const dir = p.normalize();
      let facing = fwd.clone();
      if (spot.turn) facing.applyAxisAngle(up, spot.turn);
      facing.addScaledVector(dir, -facing.dot(dir)).normalize();
      return { dir, facing, sit: !!it && it.kind === 'sit' };
    }
    const f = this.world.layout.get(spot.region).frame;
    const b = f.basis(spot.x, spot.y, spot.heading);
    return { dir: b.pos, facing: b.forward, sit: false };
  }

  snapAll(hours: number): void {
    for (const n of this.npcs) n.snapToRoutine(hours);
  }

  update(dt: number, hours: number, player: Vector3, camera: Vector3, playerBusy: boolean): void {
    for (const n of this.npcs) {
      const visible = HorizonCuller.isAboveHorizon(camera, n.position, 2.5, this.culler.occluderRadius);
      n.avatar.group.visible = visible;
      const near = camera.distanceTo(n.position) < 45;
      n.update(dt, hours, player, playerBusy, visible && near);
    }
  }

  /** Bodies the player collides with. */
  bodies(): { dir: Vector3; radius: number }[] {
    return this.npcs.map((n) => ({ dir: n.dir, radius: 0.32 }));
  }

  markerMaterial(kind: 'new' | 'target'): SpriteMaterial {
    let m = this.markerMats.get(kind);
    if (m) return m;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = kind === 'new' ? '#f0b04a' : '#7cc8ff';
    ctx.strokeStyle = '#1d2433';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(64, 64, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1d2433';
    ctx.font = '800 72px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(kind === 'new' ? '!' : '✉', 64, 70);
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    m = new SpriteMaterial({ map: tex, depthTest: true, transparent: true, toneMapped: false });
    this.markerMats.set(kind, m);
    return m;
  }
}

