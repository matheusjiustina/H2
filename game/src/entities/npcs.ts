import * as THREE from 'three';
import { angleDiff, clamp, dampAngle, dist2, TAU } from '../core/util';
import { canvasTexture, M, PAL } from '../render/materials';
import { DistrictId } from '../world/layout';
import type { REdge, RNode } from '../world/roads';
import type { Game } from '../game';

export type NpcKind = 'civilian' | 'protester' | 'agitator' | 'police' | 'security' | 'reporter' | 'faction' | 'merc' | 'guard' | 'fan';
export type NpcState =
  | 'wander' | 'idle' | 'react' | 'flee' | 'protest' | 'post' | 'alert' | 'pursue' | 'attack' | 'search' | 'return' | 'stunned' | 'down' | 'report';

export interface Npc {
  id: number;
  kind: NpcKind;
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  state: NpcState;
  t: number;
  hp: number;
  maxHp: number;
  phase: number;
  shirt: number;
  pants: number;
  skin: number;
  hair: number;
  prop: number; // 0 none, 1.. sign variants, 9 camera, 10 cap, 11 briefcase
  hat: number; // colour or 0
  homeX: number;
  homeZ: number;
  homeRot: number;
  tx: number;
  tz: number;
  edge: REdge | null;
  to: RNode | null;
  side: number;
  cool: number;
  seenT: number;
  lostT: number;
  reaction: number;
  forced: boolean;
  persistent: boolean;
  tag: string;
  ranged: boolean;
  dmg: number;
  vx: number;
  vz: number;
  flash: number;
  stuck: number;
  acc: number;
  group: number;
  alive: boolean;
  runSpeed: number;
  sight: number;
  spoke: number;
}

const CAP = 190;
const SHIRTS = [0xd43a34, 0x2f5fa8, 0xf4f1e6, 0x4c9a5a, 0xe8b84a, 0x7a62a8, 0xee8a3a, 0x3fa7c4, 0xf2a0a8, 0x8b93a6, 0x2b2e42, 0xb8433a];
const PANTS = [0x34425e, 0x2b2e42, 0x6e5a48, 0x8b93a6, 0x4a4f66, 0xd8cba8];
const HAIRS = [0x2b2422, 0x5a4030, 0x8a6b4a, 0xd9b36a, 0x9a9a9a, 0x3a3836, 0xb8532e];
const SLOGANS = [['BOO!', '#d43a34'], ['NOPE', '#2f5fa8'], ['TOO ORANGE', '#ee8a3a'], ['WHERE IS MY BURGER', '#4c9a5a'], ['DOWN WITH THIS SORT OF THING', '#7a62a8'], ['I AM VERY CROSS', '#2b2e42']];
const FACTION_COLORS: Record<DistrictId, number> = {
  downtown: 0xd43a34, government: 0x16161f, suburbs: 0x8fc27a, harbor: 0x2f5fa8, beach: 0xf2a0a8, desert: 0xc9a66a, wallstreet: 0x6f7892, outskirts: 0x8a6b4a, ocean: 0x2f5fa8,
};
export const SHOUTS = {
  recognize: ["IT'S HIM!", 'NO WAY!', 'IS THAT—?!', 'OH MY GOSH', 'HEY! HEY!', 'LOOK!'],
  boo: ['BOO!', 'BOOO!', 'GO HOME!', 'SHAME!', 'NOPE!'],
  fan: ['BIG FAN!', 'SIGN MY HAT!', 'SELFIE?!', 'TREMENDOUS!'],
  flee: ['AAAH!', 'NOPE NOPE', 'RUN!'],
  hostile: ['GET HIM!', "THERE HE IS!", 'AFTER HIM!', 'STOP RIGHT THERE!'],
  police: ['FREEZE!', 'HANDS UP!', 'STOP, SIR!'],
  reporter: ['ANY COMMENT?!', 'SIR! SIR!', 'ONE QUESTION!', 'BREAKING NEWS!'],
};

const m4 = new THREE.Matrix4();
const root = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v3 = new THREE.Vector3();
const one = new THREE.Vector3(1, 1, 1);
const col = new THREE.Color();
const pos = { x: 0, z: 0 };

function box(w: number, h: number, d: number, yOff: number, zOff = 0) {
  return new THREE.BoxGeometry(w, h, d).translate(0, yOff, zOff);
}

export class Npcs {
  list: Npc[] = [];
  group = new THREE.Group();
  private parts: Record<string, THREE.InstancedMesh> = {};
  private signs: THREE.InstancedMesh[] = [];
  private bars: THREE.InstancedMesh;
  private barsBg: THREE.InstancedMesh;
  private nextId = 1;
  private ambientT = 0;
  density = 1;
  /** Active protest crowds: [x, z, r, count]. */
  crowds: { x: number; z: number; r: number; id: number; site: number }[] = [];
  private crowdId = 1;
  /** Extra hostiles the pursuit director asked for and still wants alive. */
  ambientScale = 1;

  constructor(private g: Game) {
    const mk = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material = M.crowd) => {
      const im = new THREE.InstancedMesh(geo, mat, CAP);
      im.count = 0;
      im.castShadow = name === 'torso' || name === 'legL' || name === 'legR';
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.setColorAt(0, col.setHex(0xffffff));
      this.parts[name] = im;
      this.group.add(im);
    };
    mk('torso', box(0.48, 0.62, 0.28, 0.33));
    mk('head', box(0.3, 0.3, 0.3, 0.17));
    mk('hair', box(0.33, 0.14, 0.33, 0.32, -0.02));
    mk('armL', box(0.13, 0.6, 0.14, -0.26));
    mk('armR', box(0.13, 0.6, 0.14, -0.26));
    mk('legL', box(0.18, 0.84, 0.2, -0.42));
    mk('legR', box(0.18, 0.84, 0.2, -0.42));
    mk('prop', box(0.34, 0.22, 0.3, -0.62, 0.12));
    mk('hat', box(0.36, 0.1, 0.44, 0.42, 0.04));
    // protest signs: one instanced mesh per slogan texture
    for (let i = 0; i < SLOGANS.length; i++) {
      const [text, bg] = SLOGANS[i];
      const tex = canvasTexture(128, 96, (g, W, H) => {
        g.fillStyle = '#f6ecd0';
        g.fillRect(0, 0, W, H);
        g.strokeStyle = bg;
        g.lineWidth = 8;
        g.strokeRect(4, 4, W - 8, H - 8);
        g.fillStyle = bg;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const words = text.split(' ');
        const lines: string[] = [];
        let cur = '';
        for (const w of words) {
          if ((cur + ' ' + w).trim().length > 9 && cur) {
            lines.push(cur);
            cur = w;
          } else cur = (cur + ' ' + w).trim();
        }
        lines.push(cur);
        const fs = Math.min(40, 78 / lines.length);
        g.font = `${fs}px Bangers, Impact, sans-serif`;
        lines.forEach((l, k) => g.fillText(l, W / 2, H / 2 + (k - (lines.length - 1) / 2) * fs * 0.95, W - 18));
      });
      const geo = new THREE.BoxGeometry(0.95, 0.7, 0.04).translate(0, 0.75, 0);
      const stick = new THREE.BoxGeometry(0.05, 1.1, 0.05).translate(0, -0.1, -0.03);
      const merged = mergeGeo(geo, stick);
      const im = new THREE.InstancedMesh(merged, new THREE.MeshBasicMaterial({ map: tex }), 70);
      im.count = 0;
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.signs.push(im);
      this.group.add(im);
    }
    const bg = new THREE.PlaneGeometry(0.9, 0.11);
    this.barsBg = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ color: PAL.ink, depthTest: false, transparent: true }), 60);
    this.bars = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.84, 0.065).translate(0.42, 0, 0), new THREE.MeshBasicMaterial({ color: 0xee4a3a, depthTest: false, transparent: true }), 60);
    for (const b of [this.barsBg, this.bars]) {
      b.count = 0;
      b.frustumCulled = false;
      b.renderOrder = 30;
      this.group.add(b);
    }
    this.bars.renderOrder = 31;
  }

  // ------------------------------------------------------------------ spawning
  spawn(kind: NpcKind, x: number, z: number, o: Partial<Npc> & { y?: number } = {}): Npc {
    const g = this.g, r = Math.random;
    const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
    const n: Npc = {
      id: this.nextId++, kind, x, z, y: o.y ?? g.world.groundAt(x, z, 400), heading: r() * TAU, speed: 0, state: 'wander', t: 0,
      hp: 30, maxHp: 30, phase: r() * 6, shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(PAL.skin), hair: pick(HAIRS), prop: 0, hat: 0,
      homeX: x, homeZ: z, homeRot: r() * TAU, tx: x, tz: z, edge: null, to: null, side: r() < 0.5 ? 1 : -1, cool: r() * 2, seenT: 0, lostT: 0,
      reaction: Math.floor(r() * 100), forced: false, persistent: false, tag: '', ranged: false, dmg: 6, vx: 0, vz: 0, flash: 0, stuck: 0, acc: 0, group: 0,
      alive: true, runSpeed: 5.2, sight: 30, spoke: 0,
    };
    switch (kind) {
      case 'protester':
        n.state = 'protest';
        n.prop = 1 + Math.floor(r() * SLOGANS.length);
        break;
      case 'agitator':
        n.hp = n.maxHp = 40;
        n.shirt = pick([0x2b2e42, 0x3a3d55, 0x7a2a2a]);
        n.hat = 0xd43a34;
        n.ranged = r() < 0.45;
        n.dmg = n.ranged ? 6 : 8;
        n.runSpeed = 6.2;
        n.state = 'pursue';
        break;
      case 'faction': {
        const d = g.world.district(x, z);
        n.hp = n.maxHp = 55;
        n.shirt = FACTION_COLORS[d];
        n.pants = 0x2b2e42;
        n.hat = d === 'wallstreet' ? 0 : shadeHex(FACTION_COLORS[d]);
        n.prop = d === 'wallstreet' ? 11 : 0;
        n.ranged = r() < 0.5;
        n.dmg = n.ranged ? 7 : 10;
        n.runSpeed = 6.3;
        n.state = 'pursue';
        break;
      }
      case 'police':
        n.hp = n.maxHp = 65;
        n.shirt = 0x1e2f5c;
        n.pants = 0x16161f;
        n.hat = 0x1e2f5c;
        n.dmg = 9;
        n.runSpeed = 6.6;
        n.state = 'post';
        n.sight = 36;
        break;
      case 'security':
      case 'guard':
        n.hp = n.maxHp = kind === 'guard' ? 95 : 75;
        n.shirt = 0x16161f;
        n.pants = 0x16161f;
        n.hair = 0x2b2422;
        n.ranged = true;
        n.dmg = 8;
        n.runSpeed = 6.4;
        n.state = 'post';
        n.sight = 34;
        break;
      case 'merc':
        n.hp = n.maxHp = 60;
        n.shirt = 0xb8a070;
        n.pants = 0x8a7a54;
        n.hat = 0x6f7a4a;
        n.ranged = r() < 0.7;
        n.dmg = 8;
        n.runSpeed = 6.2;
        n.state = 'post';
        n.sight = 34;
        break;
      case 'reporter':
        n.shirt = 0xcfb890;
        n.prop = 9;
        n.runSpeed = 6.0;
        n.state = 'report';
        break;
      case 'fan':
        n.hat = 0xd43a34;
        n.state = 'wander';
        break;
    }
    Object.assign(n, o);
    n.homeX = o.homeX ?? x;
    n.homeZ = o.homeZ ?? z;
    if (n.forced && (kind === 'police' || kind === 'security' || kind === 'guard' || kind === 'merc')) n.state = o.state ?? 'pursue';
    this.list.push(n);
    return n;
  }

  remove(n: Npc) {
    n.alive = false;
    const i = this.list.indexOf(n);
    if (i >= 0) {
      this.list[i] = this.list[this.list.length - 1];
      this.list.pop();
    }
  }
  clearTagged(tag: string) {
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].tag === tag) this.remove(this.list[i]);
    this.crowds = this.crowds.filter((c) => this.list.some((n) => n.group === c.id));
  }
  countTag(tag: string, aliveOnly = true) {
    let c = 0;
    for (const n of this.list) if (n.tag === tag && (!aliveOnly || n.state !== 'down')) c++;
    return c;
  }
  countKind(pred: (n: Npc) => boolean) {
    let c = 0;
    for (const n of this.list) if (pred(n)) c++;
    return c;
  }

  /** Spawn a protest crowd. */
  protest(x: number, z: number, r: number, count: number, tag = '', site = -1): number {
    const id = this.crowdId++;
    this.crowds.push({ x, z, r, id, site });
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * r;
      const n = this.spawn('protester', x + Math.cos(a) * d, z + Math.sin(a) * d, { tag, persistent: !!tag });
      n.group = id;
      n.homeX = n.x;
      n.homeZ = n.z;
    }
    return id;
  }

  /** Is a protest crowd standing in the way here? (traffic AI) */
  blockingCrowd(x: number, z: number, r: number): boolean {
    for (const c of this.crowds) if (dist2(x, z, c.x, c.z) < (c.r + r) * (c.r + r)) return true;
    return false;
  }

  isHostile(n: Npc): boolean {
    return n.kind === 'agitator' || n.kind === 'faction' || n.kind === 'police' || n.kind === 'security' || n.kind === 'guard' || n.kind === 'merc';
  }

  private say(n: Npc, list: string[], cls = '') {
    if (this.g.time - n.spoke < 3) return;
    n.spoke = this.g.time;
    this.g.fx.text(n.x, n.y + 2.3, n.z, list[Math.floor(Math.random() * list.length)], cls);
  }

  // ------------------------------------------------------------------ ambient population
  private ambient() {
    const g = this.g, p = g.player.pos, roads = g.world.roads;
    const d = g.world.district(p.x, p.z);
    const base: Record<DistrictId, number> = { downtown: 34, wallstreet: 30, government: 22, suburbs: 14, beach: 24, harbor: 12, desert: 4, outskirts: 5, ocean: 0 };
    const want = Math.round(base[d] * this.density * this.ambientScale);
    let have = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i];
      const d2 = dist2(n.x, n.z, p.x, p.z);
      if (n.persistent) continue;
      if (n.kind === 'civilian' || n.kind === 'fan' || n.kind === 'reporter') {
        if (d2 > 150 * 150) this.remove(n);
        else have++;
      } else if (d2 > 240 * 240 || (n.state === 'down' && n.t > 7)) this.remove(n);
    }
    for (let tries = 0; have < want && tries < 6 && this.list.length < CAP - 30; tries++) {
      const a = Math.random() * TAU, r = 45 + Math.random() * 70;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      const ne = roads.nearestEdge(x, z);
      if (!ne || ne.d > 40 || ne.e.kind === 'bridge' || ne.e.kind === 'highway') continue;
      const ed = ne.e;
      const side = Math.random() < 0.5 ? 1 : -1;
      const off = ed.w / 2 + (ed.city ? 2.3 : 1.2);
      const sx = ed.a.x + (ed.b.x - ed.a.x) * ne.t - ed.dz * off * side, sz = ed.a.z + (ed.b.z - ed.a.z) * ne.t + ed.dx * off * side;
      if (g.cam.sees(sx, 1, sz) && dist2(sx, sz, p.x, p.z) < 70 * 70) continue;
      if (g.world.inside(sx, 1, sz)) continue;
      const roll = Math.random();
      const kind: NpcKind = roll < 0.05 ? 'reporter' : roll < 0.11 ? 'fan' : 'civilian';
      const n = this.spawn(kind, sx, sz, { y: g.world.groundAt(sx, sz, 5) });
      n.state = kind === 'reporter' ? 'wander' : 'wander';
      n.edge = ed;
      n.to = Math.random() < 0.5 ? ed.a : ed.b;
      n.side = side;
      have++;
    }
    // ambient protests at designated sites
    const sites = g.world.protestSites;
    for (let i = 0; i < sites.length; i++) {
      const s = sites[i];
      const d2 = dist2(s.x, s.z, p.x, p.z);
      const active = this.crowds.find((c) => c.site === i);
      if (!active && d2 < 150 * 150 && d2 > 60 * 60 && ((i * 7 + Math.floor(g.time / 240)) % 3 === 0 || g.heat.level >= 2) && this.list.length < CAP - 40 && !g.missions.quietZone(s.x, s.z)) {
        this.protest(s.x, s.z, s.r, Math.round((9 + (i % 4) * 2) * Math.max(0.6, this.density)), '', i);
      } else if (active && d2 > 210 * 210) {
        for (let k = this.list.length - 1; k >= 0; k--) if (this.list[k].group === active.id) this.remove(this.list[k]);
        this.crowds.splice(this.crowds.indexOf(active), 1);
      }
    }
    // posted guards / police
    for (const gp of g.world.guardPosts) {
      const d2 = dist2(gp.x, gp.z, p.x, p.z);
      const key = `post:${gp.x | 0}:${gp.z | 0}`;
      const have2 = this.list.some((n) => n.tag === key);
      if (!have2 && d2 < 140 * 140 && d2 > 30 * 30) {
        const kind: NpcKind = gp.kind === 'police' ? 'police' : gp.kind === 'merc' ? 'merc' : gp.kind === 'doorman' ? 'fan' : 'security';
        const n = this.spawn(kind, gp.x, gp.z, { tag: key, homeRot: gp.rot });
        n.state = 'post';
        n.heading = gp.rot;
        if (gp.kind === 'doorman') {
          n.shirt = 0x8f2a30;
          n.hat = 0x8f2a30;
        }
      } else if (have2 && d2 > 200 * 200) this.clearTagged(key);
    }
  }

  // ------------------------------------------------------------------ behaviour
  private move(n: Npc, tx: number, tz: number, speed: number, dt: number): number {
    const dx = tx - n.x, dz = tz - n.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) {
      n.speed = 0;
      return d;
    }
    n.heading = dampAngle(n.heading, Math.atan2(dx, dz), 9, dt);
    const sp = Math.min(speed, d / Math.max(dt, 1e-3));
    const bx = n.x, bz = n.z;
    pos.x = n.x + Math.sin(n.heading) * sp * dt;
    pos.z = n.z + Math.cos(n.heading) * sp * dt;
    const w = this.g.world;
    const hit = w.collide(pos, 0.34, n.y, 1.7, 0.45);
    n.x = pos.x;
    n.z = pos.z;
    const moved = Math.hypot(n.x - bx, n.z - bz);
    n.speed = moved / Math.max(dt, 1e-3);
    if (hit && moved < sp * dt * 0.35) n.stuck += dt;
    else n.stuck = Math.max(0, n.stuck - dt * 0.5);
    if (n.stuck > 0.6) {
      // slide around the obstacle
      n.heading += n.side * 1.2;
      n.stuck = 0.2;
    }
    const gy = w.groundAt(n.x, n.z, n.y + 0.3, 0.55);
    n.y = gy > n.y ? gy : Math.max(gy, n.y - 12 * dt);
    return d;
  }

  private wander(n: Npc, dt: number) {
    const roads = this.g.world.roads;
    if (!n.edge || !n.to) {
      const ne = roads.nearestEdge(n.x, n.z);
      if (!ne) return;
      n.edge = ne.e;
      n.to = Math.random() < 0.5 ? ne.e.a : ne.e.b;
    }
    const e2 = n.edge, to = n.to;
    const from = roads.other(e2, to);
    const dx = (to.x - from.x) / e2.len, dz = (to.z - from.z) / e2.len;
    const off = e2.w / 2 + (e2.city ? 2.3 : 1.3);
    const cut = roads.cut(e2, to) + (e2.city ? 2.3 : 0);
    const tx = to.x - dx * cut - dz * off * n.side, tz = to.z - dz * cut + dx * off * n.side;
    const d = this.move(n, tx, tz, 1.5 + (n.id % 5) * 0.12, dt);
    if (d < 1.2) {
      const opts = to.edges.filter((o) => o !== e2 && o.kind !== 'bridge' && o.kind !== 'highway');
      const next = opts.length ? opts[Math.floor(Math.random() * opts.length)] : e2;
      n.edge = next;
      n.to = roads.other(next, to);
      if (Math.random() < 0.3) n.side = -n.side;
    }
  }

  private canSee(n: Npc, range: number): boolean {
    const p = this.g.player;
    const d2 = dist2(n.x, n.z, p.pos.x, p.pos.z);
    const stealth = p.crouching ? 0.55 : p.vehicle && !p.vehicle.spec.open ? 0.7 : 1;
    const night = 1 - this.g.atmo.night * 0.25;
    const r = range * stealth * night;
    if (d2 > r * r || Math.abs(p.pos.y - n.y) > 30) return false;
    // field of view: easier to notice in front
    const a = Math.atan2(p.pos.x - n.x, p.pos.z - n.z);
    if (Math.abs(angleDiff(n.heading, a)) > 1.9 && d2 > 7 * 7) return false;
    return this.g.world.los(n.x, n.y + 1.5, n.z, p.pos.x, p.pos.y + 1.2, p.pos.z);
  }

  private think(n: Npc, dt: number) {
    const g = this.g, p = g.player, pp = p.pos, heat = g.heat;
    n.t += dt;
    n.cool -= dt;
    n.flash = Math.max(0, n.flash - dt * 4);
    const d2 = dist2(n.x, n.z, pp.x, pp.z);
    const hostile = this.isHostile(n);

    // knockback velocity
    if (n.vx || n.vz) {
      pos.x = n.x + n.vx * dt;
      pos.z = n.z + n.vz * dt;
      g.world.collide(pos, 0.34, n.y, 1.7);
      n.x = pos.x;
      n.z = pos.z;
      const k = Math.exp(-5 * dt);
      n.vx *= k;
      n.vz *= k;
      if (Math.abs(n.vx) + Math.abs(n.vz) < 0.2) n.vx = n.vz = 0;
    }

    switch (n.state) {
      case 'wander': {
        this.wander(n, dt);
        if (n.cool <= 0) {
          n.cool = 0.5;
          if (p.recognizable && this.canSee(n, 15)) {
            n.state = 'react';
            n.t = 0;
            n.speed = 0;
            const r = n.reaction;
            if (n.kind === 'reporter') {
              n.state = 'report';
              this.say(n, SHOUTS.reporter);
              heat.recognized(0.12);
            } else if (n.kind === 'fan' || r < 12) {
              n.reaction = 3;
              this.say(n, SHOUTS.fan, 'good');
            } else if (r < 55) {
              n.reaction = 0;
              this.say(n, SHOUTS.recognize);
              heat.recognized(0.22);
            } else if (r < 80) {
              n.reaction = 1;
              this.say(n, SHOUTS.boo);
              heat.recognized(0.14);
            } else {
              n.reaction = 2;
              n.state = 'flee';
              this.say(n, SHOUTS.flee);
            }
          }
        }
        break;
      }
      case 'react':
        n.heading = dampAngle(n.heading, Math.atan2(pp.x - n.x, pp.z - n.z), 6, dt);
        n.speed = 0;
        if (n.t > 3.5 || d2 > 26 * 26) {
          n.state = 'wander';
          n.cool = 9;
          n.reaction = 30 + (n.id % 40);
        }
        break;
      case 'flee': {
        const a = Math.atan2(n.x - pp.x, n.z - pp.z);
        this.move(n, n.x + Math.sin(a) * 6, n.z + Math.cos(a) * 6, 5.4, dt);
        if (n.t > 6 || d2 > 45 * 45) {
          n.state = n.group ? 'protest' : 'wander';
          n.cool = 6;
        }
        break;
      }
      case 'protest': {
        // mill about the home spot; turn on Trump and crowd him when he is close
        const near = d2 < 22 * 22 && p.recognizable;
        if (near) {
          n.heading = dampAngle(n.heading, Math.atan2(pp.x - n.x, pp.z - n.z), 5, dt);
          if (d2 < 9 * 9 && d2 > 1.6 * 1.6 && !p.vehicle) this.move(n, pp.x, pp.z, 1.3, dt);
          else n.speed = 0;
          if (n.cool <= 0) {
            n.cool = 2 + Math.random() * 4;
            this.say(n, SHOUTS.boo);
            heat.recognized(0.03);
          }
        } else if (dist2(n.x, n.z, n.homeX, n.homeZ) > 1.2) this.move(n, n.homeX, n.homeZ, 1.4, dt);
        else {
          n.speed = 0;
          if (n.cool <= 0) {
            n.cool = 3 + Math.random() * 5;
            n.heading += (Math.random() - 0.5) * 1.5;
          }
        }
        break;
      }
      case 'report': {
        // swarm Trump with a camera; harmless but raises exposure
        if (!p.recognizable || d2 > 60 * 60) {
          n.state = 'wander';
          n.cool = 6;
          break;
        }
        if (d2 > 2.8 * 2.8) this.move(n, pp.x, pp.z, n.runSpeed, dt);
        else {
          n.speed = 0;
          n.heading = dampAngle(n.heading, Math.atan2(pp.x - n.x, pp.z - n.z), 8, dt);
          heat.recognized(0.05 * dt);
          if (n.cool <= 0) {
            n.cool = 3 + Math.random() * 3;
            this.say(n, SHOUTS.reporter);
          }
        }
        break;
      }
      case 'idle':
        n.speed = 0;
        break;
      case 'post': {
        n.speed = 0;
        n.heading = dampAngle(n.heading, n.homeRot + Math.sin(g.time * 0.4 + n.id) * 0.5, 2, dt);
        if (dist2(n.x, n.z, n.homeX, n.homeZ) > 2) {
          n.state = 'return';
          break;
        }
        if (n.cool <= 0) {
          n.cool = 0.35;
          if (heat.engages(n) && this.canSee(n, n.sight)) {
            n.state = 'alert';
            n.t = 0;
            this.say(n, n.kind === 'police' ? SHOUTS.police : SHOUTS.hostile, 'bad');
            g.audio.play('alert', 0.5, n.x, n.z);
          }
        }
        break;
      }
      case 'alert':
        n.speed = 0;
        n.heading = dampAngle(n.heading, Math.atan2(pp.x - n.x, pp.z - n.z), 10, dt);
        if (n.t > 0.55) {
          n.state = 'pursue';
          n.t = 0;
        }
        break;
      case 'pursue': {
        if (!n.forced && !heat.engages(n)) {
          n.state = 'return';
          break;
        }
        let sees = n.seenT > 0;
        if (n.cool <= 0) {
          n.cool = 0.3;
          sees = this.canSee(n, n.sight + 14);
          n.seenT = sees ? 1 : 0;
          if (sees) {
            n.tx = pp.x;
            n.tz = pp.z;
            n.lostT = 0;
          }
        }
        if (!sees) n.lostT += dt;
        else heat.spotted(n.kind === 'police' ? 1 : 0.6);
        const range = n.ranged ? 13 : p.vehicle ? 3.2 : 1.7;
        const d = Math.sqrt(d2);
        if (sees && d < range && Math.abs(pp.y - n.y) < 2.4) {
          if (n.ranged && d < 5) {
            // keep some distance
            const a = Math.atan2(n.x - pp.x, n.z - pp.z);
            this.move(n, n.x + Math.sin(a) * 3, n.z + Math.cos(a) * 3, 3.5, dt);
          } else n.speed = 0;
          n.heading = dampAngle(n.heading, Math.atan2(pp.x - n.x, pp.z - n.z), 12, dt);
          if (n.acc <= 0) {
            n.state = 'attack';
            n.t = 0;
          }
        } else {
          // melee attackers fan out a little so they do not stack on one spot
          const ring = n.ranged ? 0 : ((n.id % 5) - 2) * 0.5;
          this.move(n, n.tx + Math.cos(n.id) * ring, n.tz + Math.sin(n.id) * ring, n.runSpeed * (n.hp < n.maxHp * 0.3 ? 0.8 : 1), dt);
          if (n.lostT > 4 && dist2(n.x, n.z, n.tx, n.tz) < 9) {
            n.state = 'search';
            n.t = 0;
          }
        }
        n.acc -= dt;
        if (n.lostT > 14) {
          n.state = n.forced && n.kind !== 'police' ? 'search' : 'return';
          n.t = 0;
        }
        break;
      }
      case 'attack': {
        n.speed = 0;
        n.heading = dampAngle(n.heading, Math.atan2(pp.x - n.x, pp.z - n.z), 10, dt);
        const wind = n.ranged ? 0.4 : 0.32;
        if (n.t >= wind && n.t - dt < wind) {
          if (n.ranged) {
            const type = n.kind === 'security' || n.kind === 'guard' ? 'dart' : n.kind === 'merc' ? 'paint' : n.kind === 'faction' && g.world.district(n.x, n.z) === 'suburbs' ? 'gnome' : 'tomato';
            g.combat.enemyShot(n, type);
          } else if (d2 < 2.6 * 2.6 || (p.vehicle && d2 < 4 * 4)) {
            if (p.vehicle) g.vehicles.damage(p.vehicle, n.dmg * 0.8);
            else p.hurt(n.dmg, n.kind, n.x, n.z);
            g.audio.play('hit', 0.6, n.x, n.z);
          }
        }
        if (n.t > wind + 0.35) {
          n.state = 'pursue';
          n.acc = n.ranged ? 1.1 + Math.random() * 0.9 : 0.6 + Math.random() * 0.5;
          n.t = 0;
        }
        break;
      }
      case 'search': {
        const lk = heat.lastKnown;
        if (n.t < 0.1) {
          n.tx = lk.x + (Math.random() - 0.5) * 16;
          n.tz = lk.z + (Math.random() - 0.5) * 16;
        }
        const d = this.move(n, n.tx, n.tz, 3.4, dt);
        if (d < 1.5 || n.stuck > 0.4) {
          n.tx = lk.x + (Math.random() - 0.5) * 30;
          n.tz = lk.z + (Math.random() - 0.5) * 30;
        }
        if (n.cool <= 0) {
          n.cool = 0.4;
          if ((n.forced || heat.engages(n)) && this.canSee(n, n.sight)) {
            n.state = 'pursue';
            n.lostT = 0;
            this.say(n, SHOUTS.hostile, 'bad');
          }
        }
        if (n.t > 12 && !n.forced) n.state = 'return';
        break;
      }
      case 'return': {
        const d = this.move(n, n.homeX, n.homeZ, 2.6, dt);
        if (d < 1.2 || n.t > 30) {
          n.state = n.kind === 'agitator' || n.kind === 'faction' ? 'wander' : 'post';
          if (n.tag === 'heat') this.remove(n);
        }
        if (n.cool <= 0) {
          n.cool = 0.5;
          if (heat.engages(n) && this.canSee(n, n.sight)) n.state = 'alert', (n.t = 0);
        }
        break;
      }
      case 'stunned':
        n.speed = 0;
        if (n.t > 1.6) {
          n.t = 0;
          if (hostile && (n.forced || heat.engages(n))) n.state = 'pursue';
          else if (n.kind === 'protester' || n.kind === 'civilian' || n.kind === 'fan' || n.kind === 'reporter') n.state = 'flee';
          else n.state = 'return';
        }
        break;
      case 'down':
        n.speed = 0;
        if (n.t > 6 && !n.persistent) {
          g.fx.puff(n.x, n.y + 0.4, n.z);
          this.remove(n);
        }
        break;
    }
    // dodge moving vehicles
    if (n.state !== 'down' && n.cool < 0.25) {
      for (const v of g.vehicles.list) {
        const sp = Math.hypot(v.vx, v.vz);
        if (sp < 4 || Math.abs(v.y - n.y) > 2.5) continue;
        const dx = n.x - v.x, dz = n.z - v.z;
        const f = (dx * v.vx + dz * v.vz) / sp, l = (-dx * v.vz + dz * v.vx) / sp;
        if (f > -1 && f < v.spec.len / 2 + 0.6 && Math.abs(l) < v.spec.wid / 2 + 0.4) {
          // bumped: comic tumble out of the way, never anything worse
          const s = Math.sign(l) || 1;
          n.vx = (-v.vz / sp) * s * 6 + v.vx * 0.4;
          n.vz = (v.vx / sp) * s * 6 + v.vz * 0.4;
          n.state = 'stunned';
          n.t = 0;
          g.fx.stars(n.x, n.y + 1.9, n.z);
          g.audio.play('bonk', 0.5, n.x, n.z);
          if (v.mode === 'player') {
            heat.crime(hostile ? 0.1 : 0.35, 'running people over');
            v.speed *= 0.86;
            if (hostile) this.hurt(n, sp * 1.6, v.x, v.z);
          }
        } else if (f > 0 && f < 5 + sp * 0.5 && Math.abs(l) < v.spec.wid / 2 + 1 && !hostile && n.state !== 'stunned') {
          const s = Math.sign(l) || 1;
          n.vx = (-v.vz / sp) * s * 5;
          n.vz = (v.vx / sp) * s * 5;
        }
      }
    }
  }

  /** Damage from the player. Civilians are never knocked out, they just stumble and run. */
  hurt(n: Npc, dmg: number, fromX: number, fromZ: number, knock = 5) {
    if (n.state === 'down') return;
    const g = this.g;
    const a = Math.atan2(n.x - fromX, n.z - fromZ);
    n.vx = Math.sin(a) * knock;
    n.vz = Math.cos(a) * knock;
    n.flash = 1;
    if (!this.isHostile(n)) {
      n.state = 'stunned';
      n.t = 0;
      g.fx.stars(n.x, n.y + 1.9, n.z);
      this.say(n, SHOUTS.flee);
      g.heat.crime(n.kind === 'protester' ? 0.45 : 0.3, 'shoving bystanders');
      return;
    }
    n.hp -= dmg;
    g.fx.text(n.x, n.y + 2.2, n.z, dmg >= 25 ? 'POW!' : 'BAM!', 'hit');
    if (n.hp <= 0) {
      n.state = 'down';
      n.t = 0;
      g.fx.stars(n.x, n.y + 1.6, n.z);
      g.audio.play('ko', 0.7, n.x, n.z);
      g.save.stats.knockouts++;
      g.heat.crime(n.kind === 'police' ? 0.5 : 0.08, 'knockout');
      g.missions.onNpcDown(n);
    } else {
      n.state = 'stunned';
      n.t = dmg > 20 ? 0 : 0.9;
      n.forced = n.forced || n.kind !== 'police';
      g.heat.crime(n.kind === 'police' ? 0.3 : 0.03, 'fighting');
    }
  }

  /** NPCs within a radius (combat queries). */
  near(x: number, z: number, r: number, out: Npc[] = []): Npc[] {
    out.length = 0;
    const r2 = r * r;
    for (const n of this.list) if (dist2(n.x, n.z, x, z) < r2 && n.state !== 'down') out.push(n);
    return out;
  }

  // ------------------------------------------------------------------ frame
  update(dt: number) {
    const g = this.g, p = g.player.pos;
    this.ambientT -= dt;
    if (this.ambientT <= 0) {
      this.ambientT = 0.45;
      this.ambient();
    }
    const L = this.list;
    // light-weight separation on a coarse grid
    for (let i = 0; i < L.length; i++) {
      const n = L[i];
      const d2 = dist2(n.x, n.z, p.x, p.z);
      // distance-based simulation budget
      const rate = d2 < 45 * 45 ? 1 : d2 < 100 * 100 ? 3 : 6;
      if ((g.frame + n.id) % rate !== 0) continue;
      this.think(n, dt * rate);
      if (d2 < 30 * 30 && n.state !== 'down') {
        for (let j = i + 1; j < L.length; j++) {
          const o = L[j];
          const dx = o.x - n.x, dz = o.z - n.z;
          if (Math.abs(dx) > 0.7 || Math.abs(dz) > 0.7 || o.state === 'down') continue;
          const dd = dx * dx + dz * dz;
          if (dd < 0.49 && dd > 1e-4) {
            const d = Math.sqrt(dd), push = (0.7 - d) * 0.5;
            n.x -= (dx / d) * push;
            n.z -= (dz / d) * push;
            o.x += (dx / d) * push;
            o.z += (dz / d) * push;
          }
        }
        // the player is solid too: crowds really do block the way
        const gp = g.player;
        if (!gp.vehicle && Math.abs(gp.pos.y - n.y) < 1.6) {
          const dx = gp.pos.x - n.x, dz = gp.pos.z - n.z;
          const dd = dx * dx + dz * dz;
          if (dd < 0.64 && dd > 1e-4) {
            const d = Math.sqrt(dd), push = 0.8 - d;
            gp.pos.x += (dx / d) * push * 0.6;
            gp.pos.z += (dz / d) * push * 0.6;
            n.x -= (dx / d) * push * 0.4;
            n.z -= (dz / d) * push * 0.4;
          }
        }
      }
    }
    this.render(dt);
  }

  private render(dt: number) {
    const g = this.g, cam = g.camera, p = g.player.pos;
    const P = this.parts;
    let c = 0, bars = 0;
    const signCounts = this.signs.map(() => 0);
    const time = g.time;
    const maxD2 = Math.min(150, g.renderer.preset.drawDist * 0.4) ** 2;
    for (const n of this.list) {
      const d2 = dist2(n.x, n.z, p.x, p.z);
      if (d2 > maxD2 || c >= CAP) continue;
      // pose
      let la = 0, ra = 0, ll = 0, rl = 0, pitch = 0, bob = 0, laz = 0.06, raz = -0.06, tilt = 0;
      const moving = n.speed > 0.3;
      if (moving) {
        n.phase += dt * (3.2 + n.speed * 1.5);
        const s = Math.sin(n.phase), amp = clamp(n.speed / 5, 0.25, 1);
        ll = -s * (0.4 + 0.5 * amp);
        rl = s * (0.4 + 0.5 * amp);
        la = s * (0.3 + 0.6 * amp);
        ra = -la;
        tilt = 0.05 + amp * 0.12;
      }
      switch (n.state) {
        case 'protest':
          ra = -2.6 + Math.sin(time * 5 + n.id) * 0.18;
          la = -2.4 + Math.sin(time * 5 + n.id) * 0.18;
          bob = Math.abs(Math.sin(time * 4 + n.id)) * 0.08;
          break;
        case 'react':
          if (n.reaction === 0) ra = -1.5;
          else if (n.reaction === 1) {
            ra = -2.7 + Math.sin(time * 9) * 0.3;
            laz = 0.4;
          } else if (n.reaction === 3) {
            ra = la = -2.7 + Math.sin(time * 10 + n.id) * 0.3;
            bob = Math.abs(Math.sin(time * 8 + n.id)) * 0.12;
          }
          break;
        case 'report':
          ra = -1.5;
          la = -1.3;
          break;
        case 'alert':
          ra = -1.5;
          break;
        case 'attack': {
          const k = Math.sin(clamp(n.t / 0.5, 0, 1) * Math.PI);
          ra = n.ranged ? -2.8 + k * 2 : -0.4 - k * 1.5;
          break;
        }
        case 'stunned':
          tilt = -0.25 + Math.sin(time * 14) * 0.08;
          laz = 0.9;
          raz = -0.9;
          break;
        case 'down':
          pitch = -Math.min(1.5, n.t * 6);
          laz = 1.2;
          raz = -1.2;
          break;
        case 'post':
          la = -0.15;
          ra = -0.15;
          break;
      }
      e.set(pitch + tilt, n.heading, 0, 'YXZ');
      q.setFromEuler(e);
      const hy = 0.86 + bob + (pitch ? Math.sin(-pitch) * -0.55 : 0);
      root.compose(v3.set(n.x, n.y + hy, n.z), q, one);
      const put = (name: string, x: number, y: number, z: number, rx: number, rz: number, color: number) => {
        e.set(rx, 0, rz, 'XYZ');
        q.setFromEuler(e);
        m4.compose(v3.set(x, y, z), q, one).premultiply(root);
        P[name].setMatrixAt(c, m4);
        col.setHex(color);
        if (n.flash > 0) col.lerp(WHITE, n.flash * 0.8);
        P[name].setColorAt(c, col);
      };
      put('torso', 0, 0, 0, 0, 0, n.shirt);
      put('head', 0, 0.66, 0, 0, 0, n.skin);
      put('hair', 0, 0.66, 0, 0, 0, n.hair);
      put('armL', 0.31, 0.58, 0, la, laz, n.kind === 'civilian' || n.kind === 'protester' || n.kind === 'fan' ? n.skin : n.shirt);
      put('armR', -0.31, 0.58, 0, ra, raz, n.kind === 'civilian' || n.kind === 'protester' || n.kind === 'fan' ? n.skin : n.shirt);
      put('legL', 0.12, 0, 0, ll, 0, n.pants);
      put('legR', -0.12, 0, 0, rl, 0, n.pants);
      // hat / prop (zero-scaled when absent)
      if (n.hat) put('hat', 0, 0.66, 0, 0, 0, n.hat);
      else P.hat.setMatrixAt(c, ZERO);
      if (n.prop === 9 || n.prop === 11) put('prop', n.prop === 9 ? -0.31 : 0.31, 0.58, 0, n.prop === 9 ? ra : la, 0, n.prop === 9 ? 0x23253a : 0x5a3a2c);
      else P.prop.setMatrixAt(c, ZERO);
      if (n.prop >= 1 && n.prop <= SLOGANS.length && n.state !== 'down' && n.state !== 'stunned') {
        const si = n.prop - 1;
        if (signCounts[si] < 70) {
          e.set(ra + 2.6, 0, 0, 'XYZ');
          q.setFromEuler(e);
          m4.compose(v3.set(-0.2, 1.2 + Math.sin(time * 5 + n.id) * 0.06, 0.2), q, one).premultiply(root);
          this.signs[si].setMatrixAt(signCounts[si]++, m4);
        }
      }
      // health bars for hurt hostiles
      if (n.hp < n.maxHp && n.state !== 'down' && bars < 60 && d2 < 50 * 50) {
        m4.compose(v3.set(n.x, n.y + 2.25, n.z), cam.quaternion, one);
        this.barsBg.setMatrixAt(bars, m4);
        m4.compose(v3.set(-0.42, 0, 0).applyQuaternion(cam.quaternion).add(V2.set(n.x, n.y + 2.25, n.z)), cam.quaternion, V3.set(clamp(n.hp / n.maxHp, 0.02, 1), 1, 1));
        this.bars.setMatrixAt(bars, m4);
        bars++;
      }
      c++;
    }
    for (const k of Object.keys(P)) {
      P[k].count = c;
      P[k].instanceMatrix.needsUpdate = true;
      if (P[k].instanceColor) P[k].instanceColor!.needsUpdate = true;
    }
    this.signs.forEach((s, i) => {
      s.count = signCounts[i];
      s.instanceMatrix.needsUpdate = true;
    });
    this.bars.count = this.barsBg.count = bars;
    this.bars.instanceMatrix.needsUpdate = true;
    this.barsBg.instanceMatrix.needsUpdate = true;
  }

  reset() {
    this.list.length = 0;
    this.crowds.length = 0;
  }
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const WHITE = new THREE.Color(0xffffff);
const V2 = new THREE.Vector3();
const V3 = new THREE.Vector3();

function shadeHex(c: number) {
  const k = new THREE.Color(c).multiplyScalar(0.7);
  return k.getHex();
}

function mergeGeo(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const A = a.toNonIndexed(), B = b.toNonIndexed();
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const x = A.getAttribute(name), y = B.getAttribute(name);
    const arr = new Float32Array(x.array.length + y.array.length);
    arr.set(x.array as Float32Array);
    arr.set(y.array as Float32Array, x.array.length);
    g.setAttribute(name, new THREE.BufferAttribute(arr, x.itemSize));
  }
  return g;
}
