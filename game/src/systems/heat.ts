import * as THREE from 'three';
import { clamp, dist2 } from '../core/util';
import { DISTRICTS } from '../world/layout';
import type { Npc } from '../entities/npcs';
import type { Vehicle } from '../entities/vehicles';
import type { Game } from '../game';

export const HEAT_NAMES = ['UNNOTICED', 'RECOGNIZED', 'LOCAL PROTEST', 'ACTIVE PURSUIT', 'CITYWIDE ALERT', 'MAXIMUM CHAOS', 'EVERYONE AGAINST TRUMP'];
const POLICE_BUDGET = [0, 0, 0, 2, 3, 4, 6];
const MOB_BUDGET = [0, 0, 2, 4, 5, 7, 10];
const HELI_BUDGET = [0, 0, 0, 0, 1, 1, 2];

/**
 * The pursuit director. Hostility is earned (being recognised, causing trouble),
 * tracked through real line-of-sight, and lost by actually breaking contact.
 */
export class Heat {
  level = 0;
  meter = 0;
  visible = false;
  lastKnown = new THREE.Vector3();
  searchT = 0;
  /** Highest level ordinary play can reach; missions may raise it to 6. */
  cap = 5;
  /** Missions can pin a minimum level. */
  floor = 0;
  /** While true the level cannot drop (scripted chases). */
  locked = false;
  private seenT = 0;
  private dirT = 0;
  private crowdSpawned = false;
  private roadblocks: { x: number; z: number; vehicles: Vehicle[]; npcs: Npc[] }[] = [];
  private zoneWarned = '';
  private maxLevel = 0;
  hidden = false;
  private spot: THREE.Mesh;
  private changeVehicleT = 0;

  constructor(private g: Game) {
    this.spot = new THREE.Mesh(
      new THREE.ConeGeometry(9, 40, 16, 1, true).translate(0, -20, 0),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.13, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
    );
    this.spot.visible = false;
    g.scene.add(this.spot);
  }

  get searching() {
    return this.level > 0 && !this.visible;
  }
  /** 0..1 progress toward losing the heat. */
  get escapeProgress() {
    return this.level > 0 ? clamp(this.searchT / this.escapeTime(), 0, 1) : 0;
  }
  private escapeTime() {
    return 9 + this.level * 5;
  }

  /** Bystanders recognising Trump: only ever raises heat to level 2. */
  recognized(amount: number) {
    if (this.level >= 2) return;
    this.meter += amount * (this.level === 0 ? 1 : 0.55);
    this.lastKnown.copy(this.g.player.pos);
    if (this.meter >= 1) this.set(this.level + 1);
  }

  /** Something that escalates regardless of level. */
  crime(amount: number, reason = '') {
    void reason;
    if (this.g.player.invulnerable && this.level === 0) return;
    this.lastKnown.copy(this.g.player.pos);
    if (this.level >= this.cap) return;
    this.meter += amount * (this.level === 0 ? 2 : 1);
    if (this.meter >= 1) this.set(this.level + 1);
    this.searchT = Math.min(this.searchT, this.escapeTime() * 0.5);
  }

  /** Called by pursuers that currently have eyes on the player. */
  spotted(weight: number) {
    this.seenT = Math.max(this.seenT, 0.45 * weight + 0.2);
  }

  set(level: number, silent = false) {
    level = clamp(Math.round(level), this.floor, 6);
    if (level === this.level) return;
    const up = level > this.level;
    this.level = level;
    this.meter = 0;
    this.searchT = 0;
    this.maxLevel = Math.max(this.maxLevel, level);
    if (!silent) {
      this.g.hud.heatChanged(level, up);
      this.g.audio.play(up ? 'heatUp' : 'heatDown', 0.7);
    }
    if (level < 2) this.crowdSpawned = false;
    if (level === 0) this.cleanup();
  }

  clear(silent = false) {
    this.floor = 0;
    this.locked = false;
    this.set(0, silent);
    this.meter = 0;
    this.visible = false;
    this.seenT = 0;
  }

  /** Does this NPC currently have licence to go after the player? */
  engages(n: Npc): boolean {
    if (n.forced) return true;
    const p = this.g.player.pos;
    switch (n.kind) {
      case 'agitator':
        return this.level >= 2;
      case 'faction':
      case 'police':
        return this.level >= 3;
      case 'security':
        return this.level >= 4 || !!this.g.world.zoneAt(p.x, p.z, 'restricted');
      case 'guard':
      case 'merc':
        return this.level >= 4 || !!this.g.world.zoneAt(p.x, p.z, 'restricted');
      default:
        return false;
    }
  }

  private cleanup() {
    const g = this.g;
    g.npcs.clearTagged('heat');
    for (const v of g.vehicles.byTag('heat')) {
      if (v.mode === 'police') {
        v.mode = 'traffic';
        v.siren = false;
        v.edge = null;
        v.tag = '';
      } else if (v.mode === 'parked' && v.kind === 'police') g.vehicles.remove(v);
    }
    this.roadblocks.length = 0;
  }

  private director(dt: number) {
    const g = this.g, p = g.player.pos;
    this.dirT -= dt;
    if (this.dirT > 0) return;
    this.dirT = 1.1;
    const L = this.level;
    // level 2: a protest forms nearby and a couple of hecklers show up
    if (L >= 2 && !this.crowdSpawned) {
      this.crowdSpawned = true;
      const node = this.pickNode(45, 85, true);
      if (node && !g.missions.quietZone(node.x, node.z)) {
        g.npcs.protest(node.x, node.z, 7, Math.round(8 * Math.max(0.6, g.npcs.density)), 'heat');
        g.hud.toast('A protest is forming nearby', 'warn');
      }
    }
    // hostile mob on foot
    const mob = g.npcs.countKind((n) => n.tag === 'heat' && (n.kind === 'agitator' || n.kind === 'faction') && n.state !== 'down');
    if (mob < MOB_BUDGET[L] && g.npcs.list.length < 170) {
      const node = this.pickNode(38, 75, true);
      if (node) {
        const n = g.npcs.spawn(L >= 5 || Math.random() < 0.3 ? 'faction' : 'agitator', node.x + (Math.random() - 0.5) * 6, node.z + (Math.random() - 0.5) * 6, { tag: 'heat' });
        n.tx = this.lastKnown.x;
        n.tz = this.lastKnown.z;
        n.state = 'search';
        n.t = 1;
      }
    }
    // police units
    if (g.vehicles.count('police') < POLICE_BUDGET[L]) g.vehicles.spawnPolice();
    // helicopters
    const helis = g.vehicles.count('heliAI');
    if (helis < HELI_BUDGET[L]) g.vehicles.spawnPoliceHeli();
    // roadblocks ahead of a fleeing driver
    if (L >= 4 && this.roadblocks.length < (L >= 5 ? 2 : 1) && g.player.vehicle && Math.abs(g.player.vehicle.speed) > 8) this.roadblock();
    this.roadblocks = this.roadblocks.filter((r) => {
      if (dist2(r.x, r.z, p.x, p.z) < 280 * 280) return true;
      for (const v of r.vehicles) if (v.mode === 'parked') g.vehicles.remove(v);
      for (const n of r.npcs) if (n.alive) g.npcs.remove(n);
      return false;
    });
  }

  private pickNode(minD: number, maxD: number, hiddenOnly: boolean) {
    const g = this.g, p = g.player.pos;
    const nodes = g.world.roads.nodes;
    for (let i = 0; i < 24; i++) {
      const n = nodes[Math.floor(Math.random() * nodes.length)];
      const d2 = dist2(n.x, n.z, p.x, p.z);
      if (d2 < minD * minD || d2 > maxD * maxD) continue;
      if (hiddenOnly && g.cam.sees(n.x, 1, n.z) && d2 < 70 * 70) continue;
      return n;
    }
    return null;
  }

  private roadblock() {
    const g = this.g, v = g.player.vehicle!;
    const roads = g.world.roads;
    // a node roughly ahead of where the player is heading
    let best: (typeof roads.nodes)[number] | null = null;
    let bs = 0;
    for (const n of roads.nodes) {
      const dx = n.x - v.x, dz = n.z - v.z;
      const d = Math.hypot(dx, dz);
      if (d < 120 || d > 210) continue;
      const along = (dx * v.fx + dz * v.fz) / d;
      if (along < 0.75 || g.cam.sees(n.x, 1, n.z) && d < 150) continue;
      if (n.edges.length < 2 || !n.edges[0].traffic) continue;
      if (along > bs) {
        bs = along;
        best = n;
      }
    }
    if (!best) return;
    const e = best.edges.reduce((a, b) => (b.w > a.w ? b : a));
    const o = roads.other(e, best);
    const dx = (o.x - best.x) / e.len, dz = (o.z - best.z) / e.len;
    const bx = best.x + dx * 14, bz = best.z + dz * 14;
    const rb = { x: bx, z: bz, vehicles: [] as Vehicle[], npcs: [] as Npc[] };
    const rot = Math.atan2(dx, dz) + Math.PI / 2;
    const n = e.w > 14 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 5.2;
      const pv = g.vehicles.spawn('police', bx - dz * off, bz + dx * off, rot + (i % 2 ? 0.25 : -0.25), { mode: 'parked', y: 0.04, tag: 'heat' });
      pv.siren = true;
      rb.vehicles.push(pv);
    }
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * 4;
      const cop = g.npcs.spawn('police', bx - dz * off + dx * 3, bz + dx * off + dz * 3, { tag: 'heat', homeRot: Math.atan2(-dx, -dz) });
      cop.state = 'post';
      rb.npcs.push(cop);
    }
    this.roadblocks.push(rb);
    g.hud.toast('Roadblock ahead!', 'warn');
  }

  update(dt: number) {
    const g = this.g, pl = g.player, p = pl.pos;
    // --- zone pressure: restricted grounds and rival-held districts
    let floor = this.floor;
    const zone = g.world.zoneAt(p.x, p.z, 'restricted');
    const d = g.world.district(p.x, p.z);
    const exempt = g.missions.heatExempt();
    if (zone && !exempt && p.y < 30) {
      floor = Math.max(floor, 3);
      if (this.zoneWarned !== zone.id) {
        this.zoneWarned = zone.id;
        g.hud.toast(`RESTRICTED: ${zone.label ?? 'keep out'}`, 'warn');
      }
    } else if (d !== 'ocean' && !g.save.districts.includes(d) && !exempt && p.y < 60) {
      floor = Math.max(floor, 3);
      if (this.zoneWarned !== d) {
        this.zoneWarned = d;
        g.hud.toast(`${DISTRICTS[d].faction} territory — you are not welcome here`, 'warn');
      }
    } else this.zoneWarned = '';
    if (floor > this.level) this.set(floor);

    // --- visibility
    this.seenT -= dt;
    const roof = g.world.roofAbove(p.x, p.z, p.y + 1);
    this.hidden = roof || !!g.world.zoneAt(p.x, p.z, 'hide') || !!g.world.zoneAt(p.x, p.z, 'safe');
    let heliSees = false;
    let heli: Vehicle | null = null;
    for (const v of g.vehicles.list) {
      if (v.mode !== 'heliAI') continue;
      heli = v;
      if (!roof && dist2(v.x, v.z, p.x, p.z) < 75 * 75) heliSees = true;
    }
    if (heliSees && this.level >= 4) this.seenT = Math.max(this.seenT, 0.6);
    for (const v of g.vehicles.list) {
      if (v.mode === 'police' && dist2(v.x, v.z, p.x, p.z) < 55 * 55 && g.world.los(v.x, v.y + 1.3, v.z, p.x, p.y + 1.2, p.z)) this.seenT = Math.max(this.seenT, 0.5);
    }
    this.visible = this.level > 0 && this.seenT > 0;
    this.spot.visible = !!heli;
    if (heli) {
      this.spot.position.set(heli.x, heli.y, heli.z);
      const tx = (this.visible ? p.x : this.lastKnown.x) - heli.x, tz = (this.visible ? p.z : this.lastKnown.z) - heli.z;
      this.spot.rotation.set(Math.atan2(Math.hypot(tx, tz), 34) * 0.9, Math.atan2(tx, tz), 0, 'YXZ');
    }

    if (this.level > 0) {
      if (this.visible) {
        this.lastKnown.copy(p);
        this.searchT = Math.max(0, this.searchT - dt * 2);
        // sustained contact slowly escalates an active pursuit
        if (this.level >= 3 && this.level < this.cap) {
          this.meter += dt * 0.018;
          if (this.meter >= 1) this.set(this.level + 1);
        }
      } else if (!this.locked && this.level > floor) {
        const far = dist2(p.x, p.z, this.lastKnown.x, this.lastKnown.z) > 170 * 170;
        this.searchT += dt * (this.hidden ? 2.2 : 1) * (far ? 1.8 : 1);
        if (this.searchT >= this.escapeTime()) {
          const was = this.maxLevel;
          this.set(Math.max(floor, 0));
          this.maxLevel = 0;
          if (this.level === 0) {
            g.hud.toast(was >= 3 ? 'YOU LOST THEM' : 'Nobody is looking', 'good');
            if (was >= 3) {
              g.save.stats.escapes++;
              g.addCash(40 * was, 'Clean getaway');
            }
          }
        }
      }
      this.director(dt);
    } else if (this.meter > 0) this.meter = Math.max(0, this.meter - dt * 0.03);
    this.changeVehicleT -= dt;
  }

  /** Swapping vehicles while nobody is watching throws pursuers off. */
  vehicleSwapped() {
    if (this.level >= 1 && !this.visible && !this.locked && this.changeVehicleT <= 0 && this.level > this.floor) {
      this.changeVehicleT = 20;
      this.searchT += this.escapeTime() * 0.45;
      this.g.hud.toast('Fresh wheels — they lost your description', 'good');
    }
  }

  reset() {
    this.cap = 5;
    this.floor = 0;
    this.locked = false;
    this.level = 0;
    this.meter = 0;
    this.visible = false;
    this.seenT = 0;
    this.searchT = 0;
    this.crowdSpawned = false;
    this.roadblocks.length = 0;
    this.spot.visible = false;
  }
}
