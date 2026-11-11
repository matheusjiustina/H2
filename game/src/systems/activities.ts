import * as THREE from 'three';
import { dist2, fmtTime } from '../core/util';
import { MeshBuilder } from '../render/geo';
import { M } from '../render/materials';
import { P, POI } from '../world/layout';
import type { VKind } from '../entities/vehicleModels';
import type { Vehicle } from '../entities/vehicles';
import type { Game } from '../game';

export interface ActivityDef {
  id: string;
  name: string;
  desc: string;
  kind: 'race' | 'rings' | 'delivery' | 'survival' | 'escape';
  where: POI;
  vehicle?: VKind;
  points?: number[][];
  time?: number;
  /** Lower-is-better record? */
  low: boolean;
}

export const ACTIVITIES: ActivityDef[] = [
  { id: 'race-downtown', name: 'Downtown Dash', desc: 'Street race around the Golden Tower.', kind: 'race', where: { x: -300, z: 250 }, vehicle: 'sports', low: true, time: 150,
    points: [[-230, 240], [-10, 240], [180, 150], [90, 60], [90, -120], [-120, -120], [-340, -30], [-340, 150], [-300, 240]] },
  { id: 'race-66', name: 'Route 66 Sprint', desc: 'Flat out around the desert loop.', kind: 'race', where: { x: 596, z: -112 }, vehicle: 'muscle', low: true, time: 170,
    points: [[700, -180], [800, -180], [860, -260], [860, -420], [790, -500], [640, -520], [530, -470], [530, -120], [600, -120]] },
  { id: 'race-farm', name: 'Back Road Rally', desc: 'Pickups, dirt and corn.', kind: 'race', where: { x: -320, z: -462 }, vehicle: 'pickup', low: true, time: 170,
    points: [[-480, -420], [-640, -440], [-800, -380], [-840, -240], [-830, -120], [-760, -120], [-760, 240], [-830, 240]] },
  { id: 'rings', name: 'Chopper Rings', desc: 'Fly the Golden Chopper through every ring.', kind: 'rings', where: { x: 786, z: 286 }, vehicle: 'heli', low: true, time: 190,
    points: [[700, 200, 40], [600, 60, 55], [540, -120, 70], [390, 40, 95], [165, -295, 85], [-65, 4, 175], [0, 450, 45], [300, 430, 50], [640, 330, 40], [800, 300, 20]] },
  { id: 'boat', name: 'Harbor Slalom', desc: 'Thread the buoys from the marina to the pier and back.', kind: 'race', where: { x: 116, z: 405 }, vehicle: 'boat', low: true, time: 180,
    points: [[60, 470], [-80, 520], [-200, 460], [-330, 500], [-440, 530], [-300, 580], [-120, 560], [20, 660], [120, 560], [122, 450]] },
  { id: 'delivery', name: 'Burger Run', desc: 'Deliver Tremendous Burgers before they go cold.', kind: 'delivery', where: { x: -690, z: -56 }, vehicle: 'van', low: false, time: 200,
    points: [[-500, 60], [-395, 130], [-285, 240], [-65, 62], [40, 150], [165, -240], [-110, -240], [-600, 240], [-440, 325], [-170, -345]] },
  { id: 'survival', name: 'Everyone Against Trump: Survival', desc: 'Heat 6. No rules. How long can you last?', kind: 'survival', where: { x: -40, z: 136 }, low: false },
  { id: 'escape-gov', name: 'Great Escape: Capitol', desc: 'Start red-hot on the Mall and lose the heat as fast as you can.', kind: 'escape', where: { x: 305, z: -262 }, low: true },
  { id: 'escape-wall', name: 'Great Escape: Wall Street', desc: 'Start red-hot among the Bears and vanish.', kind: 'escape', where: { x: 285, z: 30 }, low: true },
];

const col = new THREE.Color();
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v3 = new THREE.Vector3();
const s3 = new THREE.Vector3();

const NEWS = [
  'BREAKING: Man in suit seen running. Experts baffled.',
  'TRAFFIC: Delays downtown due to "one specific individual".',
  'MARKETS: TRMP up 4.5% on no news whatsoever.',
  'WEATHER: Hot air mass moving across the city.',
  'LOCAL: H.O.A. passes emergency lawn ordinance.',
  'SPORTS: Golf cart chase declared "technically a sport".',
  'POLL: 51% against, 49% also against, margin of error 100%.',
  'FOOD: Tremendous Burger sells out citywide. Again.',
];

/** Free-roam content: collectibles, challenges, random street events. */
export class Activities {
  def: ActivityDef | null = null;
  marker: POI | null = null;
  objective = '';
  private i = 0;
  private t = 0;
  private veh: Vehicle | null = null;
  private tokens: THREE.InstancedMesh;
  private starts: THREE.InstancedMesh;
  private ring: THREE.Mesh;
  private eventT = 50;
  private newsT = 35;
  private cool = 0;
  private score = 0;
  private endT = -1;
  group = new THREE.Group();

  constructor(private g: Game) {
    const b = new MeshBuilder();
    b.box(0, 0.42, 0, 0.9, 0.24, 0.2, 0xf2c94c, 0, 0);
    b.box(0, -0.05, 0, 0.26, 0.9, 0.2, 0xf2c94c, 0, 0);
    this.tokens = new THREE.InstancedMesh(b.build(), M.actor, Math.max(1, g.world.collectSpots.length));
    this.tokens.frustumCulled = false;
    this.starts = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1.6, 1.6, 30, 12, 1, true).translate(0, 15, 0),
      new THREE.MeshBasicMaterial({ color: 0x5fd0ff, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }),
      ACTIVITIES.length,
    );
    this.starts.frustumCulled = false;
    this.starts.renderOrder = 8;
    ACTIVITIES.forEach((a, i) => {
      m4.makeTranslation(a.where.x, a.where.y ?? g.world.groundAt(a.where.x, a.where.z, 300), a.where.z);
      this.starts.setMatrixAt(i, m4);
    });
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(9, 0.7, 6, 18),
      new THREE.MeshBasicMaterial({ color: 0xffc430, transparent: true, opacity: 0.85, fog: false }),
    );
    this.ring.visible = false;
    this.group.add(this.tokens, this.starts, this.ring);
  }

  get active() {
    return !!this.def;
  }

  begin(def: ActivityDef) {
    const g = this.g;
    this.def = def;
    this.i = 0;
    this.t = 0;
    this.score = 0;
    this.endT = -1;
    g.heat.clear(true);
    const y = def.where.y ?? g.world.groundAt(def.where.x, def.where.z, 300);
    if (def.vehicle) {
      if (g.player.vehicle) g.player.forceExit();
      const first = def.points![0];
      const rot = Math.atan2(first[0] - def.where.x, first[1] - def.where.z);
      this.veh = g.vehicles.spawn(def.vehicle, def.where.x, def.where.z, rot, { persistent: true, tag: 'activity', y: def.vehicle === 'heli' ? y : undefined });
      g.player.pos.set(def.where.x, y, def.where.z);
      g.player.enter(this.veh);
    }
    if (def.kind === 'survival') {
      g.heat.cap = 6;
      g.heat.floor = 6;
      g.heat.locked = true;
      g.heat.set(6);
    } else if (def.kind === 'escape') {
      g.heat.cap = 5;
      g.heat.set(4);
      g.heat.spotted(6);
    }
    g.hud.title('CHALLENGE', def.name, def.desc);
    g.audio.play('missionStart', 0.8);
  }

  private finish(ok: boolean, value: number, label: string) {
    const g = this.g, def = this.def!;
    if (this.endT >= 0) return;
    this.endT = 0;
    if (ok) {
      const prev = g.save.records[def.id];
      const better = prev === undefined || (def.low ? value < prev : value > prev);
      if (better) g.save.records[def.id] = Math.round(value * 10) / 10;
      const cash = def.kind === 'survival' ? Math.round(value * 8) : 400;
      g.addCash(cash);
      if (def.kind === 'survival') g.save.records.bestSurvival = Math.max(g.save.records.bestSurvival ?? 0, Math.round(value));
      g.hud.banner(better ? 'NEW RECORD!' : 'CHALLENGE COMPLETE', `${def.name} — ${label} · +$${cash}`, 'good');
      g.audio.play('missionDone', 0.8);
    } else {
      g.hud.banner('CHALLENGE FAILED', `${def.name} — ${label}`, 'bad');
      g.audio.play('fail', 0.8);
    }
    g.store.save();
  }

  playerDown() {
    const g = this.g, def = this.def;
    if (!def) return;
    if (def.kind === 'survival') this.finish(true, this.t, `survived ${fmtTime(this.t)}`);
    else this.finish(false, 0, 'you were cancelled');
    const w = def.where;
    g.fade(() => {
      this.stop();
      g.player.revive(w.x + 5, w.y ?? g.world.groundAt(w.x, w.z, 300), w.z + 4);
    });
  }

  stop() {
    const g = this.g;
    if (!this.def) return;
    this.def = null;
    this.marker = null;
    this.objective = '';
    this.ring.visible = false;
    g.heat.cap = 5;
    g.heat.floor = 0;
    g.heat.locked = false;
    g.heat.clear(true);
    g.npcs.clearTagged('heat');
    for (const v of g.vehicles.byTag('heat')) g.vehicles.remove(v);
    for (const v of g.vehicles.byTag('activity')) {
      v.persistent = false;
      v.tag = '';
    }
    this.veh = null;
    this.cool = 4;
  }

  private collect() {
    const g = this.g, spots = g.world.collectSpots, p = g.player.pos;
    let n = 0;
    for (let i = 0; i < spots.length; i++) {
      if (g.save.collectibles.includes(i)) continue;
      const s = spots[i];
      const y = (s.y ?? g.world.groundAt(s.x, s.z, 300)) + 1.2;
      if (dist2(s.x, s.z, p.x, p.z) < 2.2 * 2.2 && Math.abs(p.y + 1 - y) < 2.6) {
        g.save.collectibles.push(i);
        g.addCash(100, 'Golden T');
        g.audio.play('pickup', 0.8);
        g.fx.confetti(s.x, y, s.z);
        const have = g.save.collectibles.length;
        g.hud.toast(`Golden T collected (${have}/${spots.length})`, 'good');
        if (have >= 15 && !g.save.outfits.includes('casual')) {
          g.save.outfits.push('casual');
          g.hud.toast('Outfit unlocked: Patriot Casual Trump', 'good');
        }
        if (have === spots.length) g.addCash(5000, 'Every Golden T found!');
        g.store.save();
        continue;
      }
      if (dist2(s.x, s.z, p.x, p.z) > 220 * 220) continue;
      q.setFromAxisAngle(v3.set(0, 1, 0), g.time * 2 + i);
      m4.compose(v3.set(s.x, y + Math.sin(g.time * 2 + i) * 0.15, s.z), q, s3.setScalar(1));
      this.tokens.setMatrixAt(n, m4);
      this.tokens.setColorAt(n, col.setHex(0xffffff));
      n++;
    }
    this.tokens.count = n;
    this.tokens.instanceMatrix.needsUpdate = true;
  }

  private events(dt: number) {
    const g = this.g, p = g.player.pos;
    this.newsT -= dt;
    if (this.newsT <= 0) {
      this.newsT = 70 + Math.random() * 60;
      g.hud.toast(NEWS[Math.floor(Math.random() * NEWS.length)], 'news');
    }
    this.eventT -= dt;
    if (this.eventT > 0 || g.heat.level > 1 || g.player.state !== 'foot') return;
    this.eventT = 75 + Math.random() * 70;
    const roll = Math.random();
    const a = Math.random() * 6.28;
    const x = p.x + Math.cos(a) * 26, z = p.z + Math.sin(a) * 26;
    if (g.world.inside(x, p.y + 1, z) || g.world.waterAt(x, z)) return;
    if (roll < 0.35) {
      // press ambush
      for (let i = 0; i < 3; i++) g.npcs.spawn('reporter', x + i, z + i, { y: g.world.groundAt(x, z, p.y + 2) });
      g.hud.toast('A news crew has found you', 'warn');
    } else if (roll < 0.65) {
      for (let i = 0; i < 3; i++) g.npcs.spawn('fan', x + i * 0.8, z - i * 0.8, { y: g.world.groundAt(x, z, p.y + 2) });
      g.addCash(25, 'Autographs');
    } else if (roll < 0.85) {
      g.npcs.protest(x, z, 5, 8);
      g.hud.toast('A flash protest is forming', 'warn');
    } else {
      const v = g.vehicles.spawnPolice();
      if (v) {
        v.mode = 'traffic';
        v.siren = true;
        v.tag = '';
        g.hud.toast('Police patrol passing through', 'news');
      }
    }
  }

  update(dt: number) {
    const g = this.g, p = g.player;
    this.collect();
    this.cool -= dt;
    const free = !g.missions.active && !this.def;
    this.starts.visible = free;
    if (free) {
      this.events(dt);
      if (this.cool <= 0 && g.heat.level < 3 && p.state !== 'down') {
        for (const a of ACTIVITIES) {
          const y = a.where.y ?? g.world.groundAt(a.where.x, a.where.z, 300);
          if (dist2(p.pos.x, p.pos.z, a.where.x, a.where.z) < 2.6 * 2.6 && Math.abs(p.pos.y - y) < 4) {
            if (!p.vehicle) g.interact.prompt = { label: `Start challenge: ${a.name}${g.save.records[a.id] !== undefined ? ` (best ${a.low ? fmtTime(g.save.records[a.id]) : fmtTime(g.save.records[a.id])})` : ''}`, progress: 0 };
            if (g.input.hit('interact') && !p.vehicle) {
              this.begin(a);
              return;
            }
          }
        }
      }
      return;
    }
    const def = this.def;
    if (!def) return;
    if (this.endT >= 0) {
      this.endT += dt;
      if (this.endT > 3) this.stop();
      return;
    }
    this.t += dt;
    const left = (def.time ?? 0) - this.t;
    if (def.kind === 'race' || def.kind === 'rings' || def.kind === 'delivery') {
      const pt = def.points![this.i];
      const y = pt[2] ?? g.world.groundAt(pt[0], pt[1], 300);
      this.marker = { x: pt[0], z: pt[1], y };
      this.objective = `${def.kind === 'delivery' ? 'Deliver' : 'Checkpoint'} ${this.i + 1}/${def.points!.length} — ${fmtTime(left)} left`;
      this.ring.visible = def.kind === 'rings';
      if (def.kind === 'rings') {
        this.ring.position.set(pt[0], y, pt[1]);
        const nx = def.points![Math.min(this.i + 1, def.points!.length - 1)];
        this.ring.rotation.y = Math.atan2(nx[0] - pt[0], nx[1] - pt[1]);
      }
      const r = def.kind === 'rings' ? 13 : def.vehicle === 'boat' ? 16 : 11;
      const hit = dist2(p.pos.x, p.pos.z, pt[0], pt[1]) < r * r && (def.kind !== 'rings' || Math.abs(p.pos.y + 1.5 - y) < 12);
      if (hit && !!p.vehicle) {
        this.i++;
        g.audio.play('objective', 0.7);
        g.fx.text(p.pos.x, p.pos.y + 3, p.pos.z, def.kind === 'delivery' ? '+$60 TIP' : 'CHECK!', 'good');
        if (def.kind === 'delivery') g.addCash(60);
        if (this.i >= def.points!.length) {
          this.finish(true, def.low ? this.t : left, def.low ? `time ${fmtTime(this.t)}` : `${fmtTime(left)} to spare`);
          return;
        }
      }
      if (left <= 0) this.finish(false, 0, 'out of time');
      else if (this.veh && this.veh.mode === 'wreck') this.finish(false, 0, 'vehicle destroyed');
    } else if (def.kind === 'survival') {
      this.marker = null;
      this.objective = `Survive — ${fmtTime(this.t)}`;
      if (dist2(p.pos.x, p.pos.z, def.where.x, def.where.z) > 420 * 420) this.finish(true, this.t, `survived ${fmtTime(this.t)}`);
    } else if (def.kind === 'escape') {
      this.marker = null;
      this.objective = `Lose the heat — ${fmtTime(this.t)}`;
      if (this.t > 2 && g.heat.level === 0) this.finish(true, this.t, `escaped in ${fmtTime(this.t)}`);
    }
    void this.score;
  }
}
