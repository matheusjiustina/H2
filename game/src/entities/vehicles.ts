import * as THREE from 'three';
import { angleDiff, clamp, damp, dampAngle, dist2 } from '../core/util';
import { M } from '../render/materials';
import { BOUNDS, DistrictId, SEA } from '../world/layout';
import type { REdge, RNode } from '../world/roads';
import type { ParkSpot } from '../world/world';
import type { Game } from '../game';
import { bodyGeometry, rotorGeometry, VKind, VSPECS, VSpec, wheelGeometry } from './vehicleModels';

export type VMode = 'parked' | 'traffic' | 'police' | 'player' | 'wreck' | 'dazed' | 'heliAI' | 'flee';

let nextId = 1;
const tmp = { x: 0, z: 0 };
const tmp2 = { x: 0, z: 0 };

export class Vehicle {
  id = nextId++;
  spec: VSpec;
  group = new THREE.Group();
  body: THREE.Mesh;
  wheels: THREE.Mesh[] = [];
  rotor: THREE.Mesh | null = null;
  tailRotor: THREE.Mesh | null = null;
  lightBar: THREE.Mesh[] = [];
  x = 0;
  y = 0;
  z = 0;
  heading = 0;
  speed = 0;
  vx = 0;
  vz = 0;
  vy = 0;
  steer = 0;
  hp: number;
  mode: VMode = 'parked';
  pitch = 0;
  roll = 0;
  spin = 0;
  // traffic navigation
  edge: REdge | null = null;
  to: RNode | null = null;
  // pursuit
  path: RNode[] = [];
  pathT = 0;
  stuckT = 0;
  reverseT = 0;
  unloaded = false;
  siren = false;
  // misc
  persistent = false;
  tag = '';
  slot = -1;
  rotorSpeed = 0;
  landed = true;
  dazedT = 0;
  wreckT = 0;
  honkT = 0;
  smokeT = 0;
  blockedT = 0;
  orbit = Math.random() * 6.28;
  airT = 0;
  /** Was this vehicle ever driven by the player? */
  used = false;

  constructor(public kind: VKind, public color: number) {
    this.spec = VSPECS[kind];
    this.hp = this.spec.hp;
    this.body = new THREE.Mesh(bodyGeometry(kind, color), M.actor);
    this.body.castShadow = true;
    this.group.add(this.body);
    this.group.rotation.order = 'YXZ';
    const s = this.spec;
    if (s.cls === 'car' || s.cls === 'bike') {
      const pos = s.cls === 'car'
        ? [[s.wid / 2 - 0.12, s.wheelBase / 2], [-s.wid / 2 + 0.12, s.wheelBase / 2], [s.wid / 2 - 0.12, -s.wheelBase / 2], [-s.wid / 2 + 0.12, -s.wheelBase / 2]]
        : [[0, s.wheelBase / 2], [0, -s.wheelBase / 2]];
      for (const [wx, wz] of pos) {
        const w = new THREE.Mesh(wheelGeometry(), M.actor);
        w.scale.set(s.cls === 'bike' ? 0.16 : kind === 'armored' ? 0.4 : 0.28, s.wheelR, s.wheelR);
        w.position.set(wx, s.wheelR, wz);
        w.rotation.order = 'YXZ';
        w.castShadow = true;
        this.group.add(w);
        this.wheels.push(w);
      }
    }
    if (s.cls === 'heli') {
      this.rotor = new THREE.Mesh(rotorGeometry(), M.actor);
      this.rotor.position.set(0, 3.25, 0.2);
      this.group.add(this.rotor);
      this.tailRotor = new THREE.Mesh(rotorGeometry(), M.actor);
      this.tailRotor.scale.setScalar(0.17);
      this.tailRotor.rotation.z = Math.PI / 2;
      this.tailRotor.position.set(0.2, 2.6, -5.3);
      this.group.add(this.tailRotor);
    }
    if (kind === 'police') {
      for (const [sx, c] of [[-0.3, 0xff3b30], [0.3, 0x3b7bff]] as const) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.24), new THREE.MeshBasicMaterial({ color: c }));
        m.position.set(sx, s.wheelR * 0.75 + 1.32, -0.25);
        this.group.add(m);
        this.lightBar.push(m);
      }
    }
  }

  get fx() {
    return Math.sin(this.heading);
  }
  get fz() {
    return Math.cos(this.heading);
  }
  get radius() {
    return this.spec.len * 0.5;
  }
}

const CITY_KINDS: Record<DistrictId, VKind[]> = {
  downtown: ['taxi', 'taxi', 'suv', 'sports', 'limo', 'van', 'muscle', 'suv'],
  wallstreet: ['taxi', 'limo', 'sports', 'suv', 'suv', 'taxi'],
  government: ['suv', 'suv', 'limo', 'taxi', 'van', 'police'],
  suburbs: ['suv', 'pickup', 'muscle', 'van', 'suv', 'moto'],
  beach: ['muscle', 'moto', 'suv', 'sports', 'pickup', 'taxi'],
  harbor: ['van', 'pickup', 'van', 'suv', 'pickup'],
  desert: ['pickup', 'muscle', 'moto', 'van'],
  outskirts: ['pickup', 'pickup', 'suv', 'muscle'],
  ocean: ['suv'],
};

export class Vehicles {
  list: Vehicle[] = [];
  group = new THREE.Group();
  private slots: { spot: ParkSpot; v: Vehicle | null; taken: boolean }[];
  private streamT = 0;
  /** Scales the amount of ambient traffic (graphics preset). */
  density = 1;
  /** Missions can pause ambient traffic near scripted set pieces. */
  trafficScale = 1;
  private headlight: THREE.Mesh;

  constructor(private g: Game) {
    this.slots = g.world.parkSpots.map((spot) => ({ spot, v: null, taken: false }));
    this.headlight = new THREE.Mesh(
      new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -10 }),
    );
    this.headlight.scale.set(4, 1, 7);
    this.headlight.visible = false;
    this.group.add(this.headlight);
  }

  spawn(kind: VKind, x: number, z: number, heading: number, o: { color?: number; y?: number; mode?: VMode; persistent?: boolean; tag?: string } = {}): Vehicle {
    const spec = VSPECS[kind];
    const v = new Vehicle(kind, o.color ?? spec.colors[Math.floor(Math.random() * spec.colors.length)]);
    v.x = x;
    v.z = z;
    v.heading = heading;
    v.y = o.y ?? this.g.world.groundAt(x, z, 400);
    if (spec.cls === 'boat') v.y = SEA + 0.25;
    v.mode = o.mode ?? 'parked';
    v.persistent = !!o.persistent;
    v.tag = o.tag ?? '';
    this.list.push(v);
    this.group.add(v.group);
    this.syncMesh(v, 0);
    return v;
  }

  remove(v: Vehicle) {
    const i = this.list.indexOf(v);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.group.remove(v.group);
    if (v.slot >= 0) this.slots[v.slot].v = null;
    if (this.g.player.vehicle === v) this.g.player.forceExit();
  }

  byTag(tag: string) {
    return this.list.filter((v) => v.tag === tag);
  }

  clearTagged(tag: string) {
    for (const v of this.byTag(tag)) if (this.g.player.vehicle !== v) this.remove(v);
      else {
        v.tag = '';
        v.persistent = false;
      }
  }

  /** Closest enterable vehicle. */
  nearest(x: number, y: number, z: number, max = 3.6): Vehicle | null {
    let best: Vehicle | null = null;
    let bd = Infinity;
    for (const v of this.list) {
      if (v.mode === 'wreck' || v.mode === 'heliAI' || v.mode === 'police') continue;
      if (Math.abs(v.y - y) > 3) continue;
      const d = Math.sqrt(dist2(x, z, v.x, v.z)) - v.radius * 0.6;
      if (d < max && d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ streaming
  private stream() {
    const p = this.g.player.pos;
    const g = this.g;
    // parked vehicles appear near the player and are recycled when far away
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      const d2 = dist2(p.x, p.z, s.spot.x, s.spot.z);
      const special = !!s.spot.id;
      if (!s.v && !s.taken && d2 < (special ? 260 * 260 : 130 * 130) && (special || this.list.length < 34 + 30 * this.density)) {
        if (s.spot.id === 'police-heli' || (s.spot.id === 'tower-heli' && !g.save.finished && g.missions.activeId !== 'm18')) continue;
        if (s.spot.id === 'garage-beast' && !g.save.completed.includes('m11')) continue;
        const kind = (s.spot.kind as VKind) ?? this.randomKind(s.spot.x, s.spot.z);
        const v = this.spawn(kind, s.spot.x, s.spot.z, s.spot.rot, { y: s.spot.y });
        v.slot = i;
        v.tag = s.spot.id ?? '';
        s.v = v;
      } else if (s.v && d2 > 230 * 230 && s.v.mode === 'parked' && !s.v.persistent) {
        const v = s.v;
        v.slot = -1;
        s.v = null;
        this.remove(v);
      }
    }
    // ambient traffic
    const want = Math.round(15 * this.density * this.trafficScale);
    let traffic = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const v = this.list[i];
      if (v.mode === 'traffic' || v.mode === 'dazed' || v.mode === 'flee') {
        const d2 = dist2(p.x, p.z, v.x, v.z);
        if (d2 > 240 * 240 && !v.persistent) this.remove(v);
        else traffic++;
      } else if (v.mode === 'wreck' && (v.wreckT > 25 || dist2(p.x, p.z, v.x, v.z) > 200 * 200)) this.remove(v);
      else if (v.mode === 'parked' && v.used && !v.persistent && v.slot < 0 && dist2(p.x, p.z, v.x, v.z) > 260 * 260) this.remove(v);
    }
    const edges = g.world.roads.edges;
    for (let tries = 0; traffic < want && tries < 12; tries++) {
      const e = edges[Math.floor(Math.random() * edges.length)];
      if (!e.traffic || e.len < 30) continue;
      const t = 0.2 + Math.random() * 0.6;
      const x = e.a.x + (e.b.x - e.a.x) * t, z = e.a.z + (e.b.z - e.a.z) * t;
      const d2 = dist2(p.x, p.z, x, z);
      if (d2 < 85 * 85 || d2 > 210 * 210) continue;
      if (this.list.some((o) => dist2(o.x, o.z, x, z) < 14 * 14)) continue;
      const fwd = Math.random() < 0.5;
      const dx = fwd ? e.dx : -e.dx, dz = fwd ? e.dz : -e.dz;
      const off = this.laneOffset(e);
      const v = this.spawn(this.randomKind(x, z, true), x - dz * off, z + dx * off, Math.atan2(dx, dz), { mode: 'traffic', y: 0.04 });
      v.edge = e;
      v.to = fwd ? e.b : e.a;
      v.speed = 6;
      traffic++;
    }
  }

  private randomKind(x: number, z: number, moving = false): VKind {
    const list = CITY_KINDS[this.g.world.district(x, z)] ?? CITY_KINDS.downtown;
    let k = list[Math.floor(Math.random() * list.length)];
    if (moving && (k === 'police' || k === 'limo') && Math.random() < 0.7) k = 'suv';
    return k;
  }

  laneOffset(e: REdge): number {
    if (e.kind === 'arterial') return Math.random() < 0.5 ? 2.4 : 6.1;
    if (e.kind === 'street') return 2.3;
    if (e.kind === 'dirt') return 1.3;
    return e.w / 4 + 0.1;
  }

  // ------------------------------------------------------------------ physics
  /** Arcade car model shared by the player and pursuing AI. */
  private drive(v: Vehicle, thr: number, st: number, hb: boolean, dt: number) {
    const s = v.spec, w = this.g.world;
    const dmg = v.hp < s.hp * 0.3 ? 0.75 : 1;
    const offroad = s.cls === 'car' && w.roads.distToRoad(v.x, v.z) > 3 && v.y < 0.2 ? 0.82 : 1;
    const max = s.maxSpeed * dmg * offroad;
    if (thr > 0) {
      if (v.speed < -0.5) v.speed += 26 * dt;
      else v.speed += s.accel * thr * dt * Math.max(0, 1 - v.speed / max);
    } else if (thr < 0) {
      if (v.speed > 0.5) v.speed -= 30 * dt;
      else v.speed = Math.max(-max * 0.32, v.speed + s.accel * 0.7 * thr * dt);
    } else v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), (2.2 + Math.abs(v.speed) * 0.12) * dt);
    if (hb) v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 16 * dt);
    const sp = Math.abs(v.speed);
    const steerMax = s.turn * (1 - 0.62 * clamp(sp / s.maxSpeed, 0, 1));
    v.steer = damp(v.steer, st * steerMax, 9, dt);
    if (v.airT < 0.15) v.heading -= (v.speed / s.wheelBase) * Math.tan(v.steer) * dt * (hb ? 1.5 : 1);
    // velocity eases toward the facing direction: low grip = drift
    const grip = (hb ? 1.6 : s.grip) * (this.g.atmo.wet > 0.5 ? 0.75 : 1);
    const k = 1 - Math.exp(-grip * dt);
    v.vx += (v.fx * v.speed - v.vx) * k;
    v.vz += (v.fz * v.speed - v.vz) * k;
    const slip = Math.abs(-v.fz * v.vx + v.fx * v.vz);
    if (slip > 5 && v.airT < 0.1 && Math.random() < 0.5) this.g.fx.smoke(v.x - v.fx * s.len * 0.4, v.y + 0.2, v.z - v.fz * s.len * 0.4);
    v.x += v.vx * dt;
    v.z += v.vz * dt;
    this.collideWorld(v);
    // ground
    const gy = w.groundAt(v.x, v.z, v.y + 0.35, 0.7);
    if (v.y > gy + 0.06) {
      v.vy -= 24 * dt;
      v.y += v.vy * dt;
      v.airT += dt;
      if (v.y <= gy) {
        if (v.vy < -11) this.damage(v, (-v.vy - 11) * 4);
        v.y = gy;
        v.vy = 0;
      }
    } else {
      v.y = gy;
      v.vy = 0;
      v.airT = 0;
    }
    const hl = s.len * 0.35;
    const gf = w.groundAt(v.x + v.fx * hl, v.z + v.fz * hl, v.y + 0.6, 0.9), gr = w.groundAt(v.x - v.fx * hl, v.z - v.fz * hl, v.y + 0.6, 0.9);
    const tp = v.airT > 0.1 ? clamp(-v.vy * 0.02, -0.3, 0.3) : Math.atan2(gr - gf, hl * 2);
    v.pitch = damp(v.pitch, clamp(tp, -0.6, 0.6) + (thr > 0 ? -0.02 : thr < 0 && v.speed > 2 ? 0.035 : 0), 10, dt);
    v.roll = damp(v.roll, s.cls === 'bike' ? clamp(v.steer * sp * 0.06, -0.6, 0.6) : clamp(v.steer * sp * 0.006, -0.08, 0.08), 8, dt);
    w.clampBounds(v);
    // water
    if (w.waterAt(v.x, v.z) && v.y < SEA + 0.2) {
      v.speed *= 1 - Math.min(1, 3 * dt);
      this.g.fx.emit(v.x, SEA + 0.2, v.z, 0xd6f0f2, 2, 3, 0.4, 0.5, 8);
      this.damage(v, 60 * dt);
    }
  }

  private collideWorld(v: Vehicle) {
    const s = v.spec, w = this.g.world;
    const r = s.wid * 0.55, off = Math.max(0, s.len / 2 - r);
    tmp.x = v.x + v.fx * off;
    tmp.z = v.z + v.fz * off;
    tmp2.x = v.x - v.fx * off;
    tmp2.z = v.z - v.fz * off;
    const fx0 = tmp.x, fz0 = tmp.z, rx0 = tmp2.x, rz0 = tmp2.z;
    const h1 = w.collide(tmp, r, v.y, s.hgt, 0.5);
    const nx1 = w.hitNx, nz1 = w.hitNz;
    const h2 = w.collide(tmp2, r, v.y, s.hgt, 0.5);
    if (!h1 && !h2) return;
    const nx = h1 ? nx1 : w.hitNx, nz = h1 ? nz1 : w.hitNz;
    v.x += (tmp.x - fx0 + tmp2.x - rx0) / 2;
    v.z += (tmp.z - fz0 + tmp2.z - rz0) / 2;
    if (off > 0.3) {
      const nh = Math.atan2(tmp.x - tmp2.x, tmp.z - tmp2.z);
      v.heading += clamp(angleDiff(v.heading, nh), -0.08, 0.08);
    }
    const vn = v.vx * nx + v.vz * nz;
    if (vn < 0) {
      v.vx -= nx * vn * 1.25;
      v.vz -= nz * vn * 1.25;
      v.speed = v.vx * v.fx + v.vz * v.fz;
      if (-vn > 6) {
        this.damage(v, (-vn - 6) * 1.7);
        this.g.fx.emit(v.x + v.fx * s.len / 2, v.y + 0.8, v.z + v.fz * s.len / 2, 0xf2c94c, 6, 5, 0.2, 0.4);
        this.g.audio.play('crash', clamp(-vn / 30, 0.2, 1), v.x, v.z);
        if (v.mode === 'player') this.g.cam.shake = Math.min(0.6, -vn * 0.02);
      }
    }
  }

  damage(v: Vehicle, amount: number) {
    if (v.mode === 'wreck' || amount <= 0) return;
    v.hp -= amount;
    if (v.hp <= 0) this.wreck(v);
  }

  private wreck(v: Vehicle) {
    const g = this.g;
    g.fx.boom(v.x, v.y + 1, v.z);
    g.fx.text(v.x, v.y + 2.5, v.z, 'KABOOM!', 'big');
    g.audio.play('boom', 1, v.x, v.z);
    const wasPlayer = g.player.vehicle === v;
    v.mode = 'wreck';
    v.hp = 0;
    v.speed = 0;
    v.siren = false;
    v.body.material = M.wreck;
    for (const lb of v.lightBar) lb.visible = false;
    if (wasPlayer) {
      g.player.forceExit(true);
      g.player.hurt(18, 'crash', v.x, v.z);
    }
    if (v.slot >= 0) {
      this.slots[v.slot].taken = true;
      this.slots[v.slot].v = null;
      v.slot = -1;
    }
    g.missions.onVehicleWrecked(v);
  }

  // ------------------------------------------------------------------ AI
  private traffic(v: Vehicle, dt: number) {
    const g = this.g, roads = g.world.roads;
    if (!v.edge || !v.to) {
      const ne = roads.nearestEdge(v.x, v.z, true);
      if (!ne) return;
      v.edge = ne.e;
      const toB = Math.abs(angleDiff(v.heading, Math.atan2(ne.e.dx, ne.e.dz))) < Math.PI / 2;
      v.to = toB ? ne.e.b : ne.e.a;
    }
    const e = v.edge, to = v.to, from = roads.other(e, to);
    const dx = (to.x - from.x) / e.len, dz = (to.z - from.z) / e.len;
    const off = e.kind === 'arterial' ? ((v.id % 2) ? 2.4 : 6.1) : e.kind === 'street' ? 2.3 : e.kind === 'dirt' ? 1.3 : e.w / 4 + 0.1;
    const lx = from.x - dz * off, lz = from.z + dx * off;
    const s = (v.x - lx) * dx + (v.z - lz) * dz;
    const cut = roads.cut(e, to);
    const remain = e.len - cut - s;
    let vmax = roads.speedLimit(e) * (v.mode === 'flee' ? 1.5 : 0.82);
    // signals
    if (to.signal && v.mode !== 'flee' && remain > 1.5 && remain < 18) {
      const st = roads.signalFor(to, Math.abs(dx) < Math.abs(dz), g.time);
      if (st !== 'green') vmax = Math.min(vmax, Math.max(0, (remain - 3.5) * 1.1));
    }
    if (remain < 14 && to.edges.length > 1) vmax = Math.min(vmax, 7.5);
    // obstacles ahead
    const look = 7 + v.speed * 1.2;
    const check = (ox: number, oz: number, r: number) => {
      const rx = ox - v.x, rz = oz - v.z;
      const f = rx * v.fx + rz * v.fz;
      if (f < 0 || f > look + r) return;
      const lat = Math.abs(-rx * v.fz + rz * v.fx);
      if (lat < 1.5 + r) vmax = Math.min(vmax, Math.max(0, (f - r - 4.5) * 1.3));
    };
    for (const o of this.list) if (o !== v && Math.abs(o.x - v.x) < 40 && Math.abs(o.z - v.z) < 40 && Math.abs(o.y - v.y) < 3) check(o.x, o.z, o.radius * 0.7);
    const p = g.player;
    if (!p.vehicle && Math.abs(p.pos.y - v.y) < 2.5) check(p.pos.x, p.pos.z, 0.6);
    if (g.npcs.blockingCrowd(v.x + v.fx * 8, v.z + v.fz * 8, 7)) vmax = Math.min(vmax, 0);
    if (vmax < 0.5 && v.speed < 0.5) {
      v.blockedT += dt;
      if (v.blockedT > 4 && v.honkT <= 0) {
        g.audio.play('horn', 0.5, v.x, v.z);
        v.honkT = 3 + Math.random() * 4;
      }
      if (v.blockedT > 25 && dist2(p.pos.x, p.pos.z, v.x, v.z) > 60 * 60) {
        this.remove(v);
        return;
      }
    } else v.blockedT = 0;
    v.honkT -= dt;
    v.speed = v.speed < vmax ? Math.min(vmax, v.speed + 5 * dt) : Math.max(vmax, v.speed - 16 * dt);
    const la = Math.min(e.len - cut + 2, s + 7);
    const tx = lx + dx * la, tz = lz + dz * la;
    const want = Math.atan2(tx - v.x, tz - v.z);
    const dh = angleDiff(v.heading, want);
    v.heading = dampAngle(v.heading, want, 5, dt);
    v.steer = clamp(-dh, -0.5, 0.5);
    v.x += v.fx * v.speed * dt;
    v.z += v.fz * v.speed * dt;
    v.vx = v.fx * v.speed;
    v.vz = v.fz * v.speed;
    v.y = damp(v.y, 0.04, 10, dt);
    v.pitch = v.roll = 0;
    if (remain < 1.5) {
      const opts = to.edges.filter((o) => o !== e && o.traffic);
      // prefer going roughly straight, sometimes turn
      let next = e;
      if (opts.length) {
        const straight = opts.find((o) => {
          const od = roads.other(o, to);
          return ((od.x - to.x) * dx + (od.z - to.z) * dz) / o.len > 0.8;
        });
        next = straight && Math.random() < 0.6 ? straight : opts[Math.floor(Math.random() * opts.length)];
      }
      v.edge = next;
      v.to = roads.other(next, to);
    }
  }

  private pursue(v: Vehicle, dt: number) {
    const g = this.g, p = g.player, roads = g.world.roads;
    const heat = g.heat;
    v.siren = true;
    if (heat.level < 3 && !v.persistent) {
      // stand down: rejoin traffic and drift away
      v.mode = 'traffic';
      v.siren = false;
      v.edge = null;
      return;
    }
    const tgt = heat.visible ? p.pos : heat.lastKnown;
    const d = Math.sqrt(dist2(v.x, v.z, tgt.x, tgt.z));
    let tx = tgt.x, tz = tgt.z;
    v.pathT -= dt;
    if (d > 55 || !g.world.los(v.x, v.y + 1.2, v.z, tgt.x, tgt.y + 1.2, tgt.z)) {
      if (v.pathT <= 0) {
        v.pathT = 1.6;
        const a = roads.nearestNode(v.x, v.z), b = roads.nearestNode(tgt.x, tgt.z);
        v.path = roads.path(a, b);
        if (v.path.length > 1 && dist2(v.x, v.z, v.path[0].x, v.path[0].z) < 14 * 14) v.path.shift();
      }
      while (v.path.length > 1 && dist2(v.x, v.z, v.path[0].x, v.path[0].z) < 11 * 11) v.path.shift();
      if (v.path.length) {
        tx = v.path[0].x;
        tz = v.path[0].z;
      }
    } else if (p.vehicle) {
      tx += p.vehicle.vx * 0.5;
      tz += p.vehicle.vz * 0.5;
    }
    let thr = 1, st = 0, hb = false;
    const want = Math.atan2(tx - v.x, tz - v.z);
    const dh = angleDiff(v.heading, want);
    st = clamp(-dh * 2.2, -1, 1);
    if (Math.abs(dh) > 1.1 && v.speed > 9) {
      thr = -0.4;
      hb = true;
    }
    if (Math.abs(dh) > 0.5 && v.speed > 17) thr = 0.1;
    // arrive: stop next to a player on foot and let the officers out
    if (!p.vehicle && d < 15 && heat.visible) {
      thr = v.speed > 1 ? -1 : 0;
      if (!v.unloaded && v.speed < 2.5) {
        v.unloaded = true;
        for (const sx of [-1, 1]) g.npcs.spawn('police', v.x - v.fz * 1.6 * sx, v.z + v.fx * 1.6 * sx, { forced: true, y: v.y, tag: 'heat' });
      }
    }
    // stuck recovery
    if (v.reverseT > 0) {
      v.reverseT -= dt;
      thr = -1;
      st = -st;
    } else if (Math.abs(v.speed) < 1.2 && thr > 0) {
      v.stuckT += dt;
      if (v.stuckT > 1.4) {
        v.reverseT = 1.3;
        v.stuckT = 0;
      }
    } else v.stuckT = Math.max(0, v.stuckT - dt);
    this.drive(v, thr, st, hb, dt);
    if (d > 330) this.remove(v);
  }

  private heliAI(v: Vehicle, dt: number) {
    const g = this.g, p = g.player.pos;
    if (g.heat.level < 4 && !v.persistent) {
      // fly off and despawn
      v.y += 6 * dt;
      v.x += v.fx * 30 * dt;
      v.z += v.fz * 30 * dt;
      if (dist2(v.x, v.z, p.x, p.z) > 350 * 350) this.remove(v);
      return;
    }
    v.orbit += dt * 0.35;
    const tgt = g.heat.visible ? p : g.heat.lastKnown;
    const tx = tgt.x + Math.cos(v.orbit) * 24, tz = tgt.z + Math.sin(v.orbit) * 24;
    const ty = Math.max(g.world.groundAt(tgt.x, tgt.z, 400), tgt.y) + 34;
    const dx = tx - v.x, dz = tz - v.z;
    const d = Math.hypot(dx, dz);
    const sp = Math.min(30, d * 0.9);
    if (d > 0.5) {
      v.vx = damp(v.vx, (dx / d) * sp, 2, dt);
      v.vz = damp(v.vz, (dz / d) * sp, 2, dt);
    }
    v.x += v.vx * dt;
    v.z += v.vz * dt;
    v.y = damp(v.y, ty, 1.2, dt);
    v.heading = dampAngle(v.heading, Math.atan2(tgt.x - v.x, tgt.z - v.z), 2.5, dt);
    v.speed = Math.hypot(v.vx, v.vz);
    v.pitch = 0.12;
    v.rotorSpeed = 1;
  }

  // ------------------------------------------------------------------ player-controlled special vehicles
  private flyPlayer(v: Vehicle, dt: number) {
    const g = this.g, inp = g.input, w = g.world;
    const mv = inp.move();
    const up = inp.down('jump') ? 1 : inp.down('descend') ? -1 : 0;
    v.rotorSpeed = damp(v.rotorSpeed, 1, 0.9, dt);
    const ready = v.rotorSpeed > 0.75;
    const gy = w.groundAt(v.x, v.z, v.y + 0.8, 1.2);
    v.vy = damp(v.vy, ready ? up * (up > 0 ? 11 : 10) : 0, 2.6, dt);
    if (v.landed && up <= 0) v.vy = 0;
    v.y += v.vy * dt;
    const air = v.y > gy + 0.3;
    if (air) {
      v.speed = damp(v.speed, mv.y * v.spec.maxSpeed * (mv.y < 0 ? 0.4 : 1), 0.9, dt);
      v.heading -= mv.x * v.spec.turn * dt;
    } else v.speed = damp(v.speed, 0, 3, dt);
    v.vx = damp(v.vx, v.fx * v.speed, 2.2, dt);
    v.vz = damp(v.vz, v.fz * v.speed, 2.2, dt);
    v.x += v.vx * dt;
    v.z += v.vz * dt;
    tmp.x = v.x;
    tmp.z = v.z;
    if (w.collide(tmp, 2.3, v.y, 3, 0.6)) {
      const vn = v.vx * w.hitNx + v.vz * w.hitNz;
      if (vn < 0) {
        v.vx -= w.hitNx * vn * 1.5;
        v.vz -= w.hitNz * vn * 1.5;
        v.speed *= 0.5;
        if (-vn > 9) this.damage(v, (-vn - 9) * 3);
        g.cam.shake = 0.3;
      }
      v.x = tmp.x;
      v.z = tmp.z;
    }
    if (v.y <= gy) {
      if (v.vy < -8) this.damage(v, (-v.vy - 8) * 8);
      v.y = gy;
      v.vy = Math.max(0, v.vy);
      v.landed = Math.hypot(v.vx, v.vz) < 4;
    } else v.landed = false;
    v.y = Math.min(v.y, 320);
    w.clampBounds(v);
    v.pitch = damp(v.pitch, air ? clamp(v.speed * 0.009, -0.2, 0.32) : 0, 3, dt);
    v.roll = damp(v.roll, air ? mv.x * 0.28 : 0, 3, dt);
  }

  private sail(v: Vehicle, thr: number, st: number, dt: number) {
    const w = this.g.world, s = v.spec;
    if (thr > 0) v.speed += s.accel * thr * dt * Math.max(0, 1 - v.speed / s.maxSpeed);
    else if (thr < 0) v.speed = Math.max(-7, v.speed + s.accel * thr * dt);
    v.speed -= v.speed * 0.5 * dt;
    v.heading -= st * s.turn * clamp(v.speed / 9, -1, 1) * dt;
    const k = 1 - Math.exp(-s.grip * dt);
    v.vx += (v.fx * v.speed - v.vx) * k;
    v.vz += (v.fz * v.speed - v.vz) * k;
    const nx = v.x + v.vx * dt, nz = v.z + v.vz * dt;
    // shallows and shorelines stop the hull
    const bow = 2.6;
    if (w.terrain.h(nx + v.fx * bow, nz + v.fz * bow) > SEA - 0.55 || w.terrain.h(nx, nz) > SEA - 0.55) {
      v.vx *= -0.2;
      v.vz *= -0.2;
      v.speed *= 0.3;
    } else {
      v.x = nx;
      v.z = nz;
    }
    tmp.x = v.x;
    tmp.z = v.z;
    if (w.collide(tmp, 1.6, SEA, 1.2, 0.2)) {
      const vn = v.vx * w.hitNx + v.vz * w.hitNz;
      if (vn < 0) {
        v.vx -= w.hitNx * vn * 1.4;
        v.vz -= w.hitNz * vn * 1.4;
        v.speed *= 0.5;
      }
      v.x = tmp.x;
      v.z = tmp.z;
    }
    w.clampBounds(v);
    const t = this.g.time;
    v.y = SEA + 0.22 + Math.sin(t * 2.1 + v.id) * 0.07 + Math.min(0.25, Math.abs(v.speed) * 0.008);
    v.pitch = damp(v.pitch, -clamp(v.speed * 0.006, 0, 0.16) + Math.sin(t * 1.7 + v.id) * 0.02, 4, dt);
    v.roll = damp(v.roll, clamp(st * v.speed * 0.012, -0.3, 0.3) + Math.sin(t * 1.3 + v.id) * 0.03, 4, dt);
    if (Math.abs(v.speed) > 6 && Math.random() < 0.6) this.g.fx.emit(v.x - v.fx * 3, SEA + 0.15, v.z - v.fz * 3, 0xe8f6f6, 1, 2.5, 0.45, 0.6, 5);
  }

  // ------------------------------------------------------------------ frame update
  update(dt: number) {
    const g = this.g, inp = g.input, p = g.player;
    this.streamT -= dt;
    if (this.streamT <= 0) {
      this.streamT = 0.4;
      this.stream();
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const v = this.list[i];
      const cls = v.spec.cls;
      switch (v.mode) {
        case 'player': {
          if (cls === 'heli') this.flyPlayer(v, dt);
          else if (cls === 'boat') this.sail(v, inp.throttle(), inp.move().x, dt);
          else this.drive(v, inp.throttle(), inp.move().x, inp.down('jump'), dt);
          if (inp.hit('horn')) g.audio.play('horn', 0.8, v.x, v.z);
          break;
        }
        case 'traffic':
        case 'flee':
          this.traffic(v, dt);
          break;
        case 'police':
          this.pursue(v, dt);
          break;
        case 'heliAI':
          this.heliAI(v, dt);
          break;
        case 'dazed':
          v.dazedT -= dt;
          this.drive(v, 0, 0, true, dt);
          if (v.dazedT <= 0 && Math.abs(v.speed) < 1.5) {
            v.mode = Math.random() < 0.5 ? 'flee' : 'traffic';
            v.edge = null;
          }
          break;
        case 'parked':
          if (cls === 'heli') {
            v.rotorSpeed = damp(v.rotorSpeed, 0, 0.6, dt);
            const gy = g.world.groundAt(v.x, v.z, v.y + 0.8, 1.2);
            if (v.y > gy + 0.05) {
              v.y = Math.max(gy, v.y - 5 * dt);
              v.rotorSpeed = 0.8;
            }
          } else if (cls === 'boat') this.sail(v, 0, 0, dt);
          else if (Math.abs(v.speed) > 0.05 || v.airT > 0 || v.vy !== 0) this.drive(v, 0, 0, true, dt);
          break;
        case 'wreck':
          v.wreckT += dt;
          if (Math.random() < 0.25) g.fx.smoke(v.x, v.y + 1.4, v.z, true);
          break;
      }
      if (v.mode !== 'wreck' && v.hp < v.spec.hp * 0.4) {
        v.smokeT -= dt;
        if (v.smokeT <= 0) {
          v.smokeT = 0.12;
          g.fx.smoke(v.x + v.fx * v.spec.len * 0.35, v.y + 1, v.z + v.fz * v.spec.len * 0.35, v.hp < v.spec.hp * 0.2);
        }
      }
    }
    this.collidePairs();
    // on-foot player vs vehicles
    if (!p.vehicle && !p.invulnerable) {
      for (const v of this.list) {
        if (Math.abs(v.y - p.pos.y) > 2.2) continue;
        const dx = p.pos.x - v.x, dz = p.pos.z - v.z;
        const f = dx * v.fx + dz * v.fz, l = -dx * v.fz + dz * v.fx;
        const hl = v.spec.len / 2 + 0.35, hw = v.spec.wid / 2 + 0.35;
        if (Math.abs(f) < hl && Math.abs(l) < hw) {
          // push out through the nearest side
          const pf = hl - Math.abs(f), pl = hw - Math.abs(l);
          if (pl < pf) {
            const s = Math.sign(l) || 1;
            p.pos.x += -v.fz * s * pl;
            p.pos.z += v.fx * s * pl;
          } else {
            const s = Math.sign(f) || 1;
            p.pos.x += v.fx * s * pf;
            p.pos.z += v.fz * s * pf;
          }
          const sp = Math.hypot(v.vx, v.vz);
          if (sp > 7 && f * v.speed > 0) {
            p.hurt(Math.min(35, sp * 1.1), 'vehicle', v.x, v.z);
            p.knock(v.vx * 0.5, v.vz * 0.5);
          }
        }
      }
    }
    for (const v of this.list) this.syncMesh(v, dt);
    // headlight pool under the player's vehicle at night
    const pv = p.vehicle;
    const night = g.atmo.night > 0.45;
    this.headlight.visible = !!pv && night && pv.spec.cls !== 'heli';
    if (pv && night) {
      this.headlight.position.set(pv.x + pv.fx * (pv.spec.len / 2 + 6), pv.y + 0.12, pv.z + pv.fz * (pv.spec.len / 2 + 6));
      this.headlight.rotation.y = pv.heading;
    }
  }

  private collidePairs() {
    const L = this.list, g = this.g;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.mode === 'heliAI') continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (b.mode === 'heliAI') continue;
        if ((a.mode === 'parked' || a.mode === 'wreck') && (b.mode === 'parked' || b.mode === 'wreck') && a.speed === 0 && b.speed === 0) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const rr = (a.spec.wid + b.spec.wid) * 0.5 + (a.spec.len + b.spec.len) * 0.16;
        const d2 = dx * dx + dz * dz;
        if (d2 > rr * rr || d2 < 1e-4 || Math.abs(a.y - b.y) > 2.4) continue;
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = rr - d;
        const ma = a.mode === 'parked' || a.mode === 'wreck' ? 2.5 : a.spec.hp / 100, mb = b.mode === 'parked' || b.mode === 'wreck' ? 2.5 : b.spec.hp / 100;
        const ka = mb / (ma + mb), kb = ma / (ma + mb);
        a.x -= nx * pen * ka;
        a.z -= nz * pen * ka;
        b.x += nx * pen * kb;
        b.z += nz * pen * kb;
        const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rv < 0) {
          const imp = -rv * 1.3;
          a.vx -= nx * imp * ka;
          a.vz -= nz * imp * ka;
          b.vx += nx * imp * kb;
          b.vz += nz * imp * kb;
          a.speed = a.vx * a.fx + a.vz * a.fz;
          b.speed = b.vx * b.fx + b.vz * b.fz;
          if (-rv > 5) {
            const dm = (-rv - 5) * 1.4;
            this.damage(a, dm * ka * 1.4);
            this.damage(b, dm * kb * 1.4);
            g.fx.emit((a.x + b.x) / 2, a.y + 0.9, (a.z + b.z) / 2, 0xf2c94c, 6, 5, 0.2, 0.4);
            g.audio.play('crash', clamp(-rv / 28, 0.2, 1), a.x, a.z);
            const pv = a.mode === 'player' ? a : b.mode === 'player' ? b : null;
            if (pv) {
              g.cam.shake = Math.min(0.6, -rv * 0.025);
              const o = pv === a ? b : a;
              if (o.mode === 'traffic' || o.mode === 'parked') g.heat.crime(0.12, 'reckless driving');
              if (o.mode === 'police') g.heat.crime(0.25, 'ramming police');
            }
          }
          for (const v of [a, b]) {
            if (v.mode === 'traffic') {
              v.mode = 'dazed';
              v.dazedT = 2.5;
            }
          }
        }
      }
    }
  }

  private syncMesh(v: Vehicle, dt: number) {
    v.group.position.set(v.x, v.y, v.z);
    v.group.rotation.set(v.pitch, v.heading, v.roll);
    const s = v.spec;
    if (v.wheels.length) {
      v.spin += (v.speed / s.wheelR) * dt;
      for (let i = 0; i < v.wheels.length; i++) {
        const front = s.cls === 'car' ? i < 2 : i === 0;
        v.wheels[i].rotation.set(v.spin, front ? -v.steer : 0, 0);
      }
    }
    if (v.rotor) {
      v.rotor.rotation.y += v.rotorSpeed * 34 * dt;
      v.tailRotor!.rotation.x += v.rotorSpeed * 40 * dt;
    }
    if (v.lightBar.length) {
      const on = v.siren && Math.floor(this.g.time * 6) % 2 === 0;
      v.lightBar[0].visible = !v.siren || on;
      v.lightBar[1].visible = !v.siren || !on;
    }
    const d2 = dist2(v.x, v.z, this.g.player.pos.x, this.g.player.pos.z);
    v.group.visible = d2 < 420 * 420;
  }

  /** Pursuit spawns: a police unit placed on a road node out of sight. */
  spawnPolice(): Vehicle | null {
    const g = this.g, p = g.player.pos, roads = g.world.roads;
    const cands = roads.nodes.filter((n) => {
      const d2 = dist2(n.x, n.z, p.x, p.z);
      return d2 > 110 * 110 && d2 < 210 * 210 && n.edges.some((e) => e.traffic) && n.x > BOUNDS.x0 && !g.cam.sees(n.x, 1, n.z);
    });
    const pool = cands.length ? cands : roads.nodes.filter((n) => dist2(n.x, n.z, p.x, p.z) > 120 * 120 && dist2(n.x, n.z, p.x, p.z) < 260 * 260);
    if (!pool.length) return null;
    const n = pool[Math.floor(Math.random() * pool.length)];
    const v = this.spawn('police', n.x, n.z, Math.atan2(p.x - n.x, p.z - n.z), { mode: 'police', y: 0.04 });
    v.tag = 'heat';
    return v;
  }

  spawnPoliceHeli(): Vehicle {
    const p = this.g.player.pos;
    const a = Math.random() * 6.28;
    const v = this.spawn('heli', p.x + Math.cos(a) * 240, p.z + Math.sin(a) * 240, 0, { mode: 'heliAI', y: 70, color: 0x2b2e42 });
    v.tag = 'heat';
    v.rotorSpeed = 1;
    return v;
  }

  count(mode: VMode) {
    let n = 0;
    for (const v of this.list) if (v.mode === mode) n++;
    return n;
  }

  reset() {
    for (const v of [...this.list]) {
      this.group.remove(v.group);
    }
    this.list.length = 0;
    for (const s of this.slots) {
      s.v = null;
      s.taken = false;
    }
  }
}
