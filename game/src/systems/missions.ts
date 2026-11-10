import * as THREE from 'three';
import { clamp, dist2 } from '../core/util';
import { toonColor } from '../render/materials';
import { DISTRICTS, DistrictId, POI } from '../world/layout';
import { BOSS_SPECS, CharacterRig, AnimMode, OUTFITS } from '../entities/character';
import type { Npc, NpcKind } from '../entities/npcs';
import type { Vehicle } from '../entities/vehicles';
import type { VKind } from '../entities/vehicleModels';
import { VSPECS } from '../entities/vehicleModels';
import { WEAPONS } from './combat';
import type { Game } from '../game';

export interface Step {
  text: string | ((m: Run) => string);
  start?: (m: Run) => void;
  /** Return true once the objective is met. */
  done: (m: Run, dt: number) => boolean;
  marker?: POI | ((m: Run) => POI | null);
  /** Seconds allowed. With `survive`, running out the clock completes the step instead. */
  timer?: number;
  survive?: boolean;
  /** Return a reason to fail the mission. */
  fail?: (m: Run) => string | null;
  /** Do not save a checkpoint when this step begins. */
  noCheckpoint?: boolean;
}

export interface Reward {
  cash: number;
  district?: DistrictId;
  outfit?: string;
  weapon?: string;
  vehicle?: VKind;
  text?: string;
}

export interface MissionDef {
  id: string;
  num: number;
  act: number;
  title: string;
  intro: string;
  where: POI;
  steps: Step[];
  reward: Reward;
  /** Runs when the mission begins and again after every checkpoint restart. */
  setup?: (m: Run) => void;
  cleanup?: (m: Run) => void;
  time?: number;
  weather?: 'clear' | 'rain';
  /** Mission handles heat itself: no territory / restricted-zone pressure. */
  exempt?: boolean;
  quiet?: { x: number; z: number; r: number };
  heatCap?: number;
  allowSafehouse?: boolean;
  /** Show the title card late (mission 1 shows it on landing). */
  lateTitle?: boolean;
  locked?: string[];
}

interface Actor {
  rig: CharacterRig;
  mode: AnimMode;
  t: number;
}
interface Light {
  cx: number; cz: number; sweep: number; speed: number; phase: number; r: number; y: number;
  x: number; z: number; disc: THREE.Mesh; cone: THREE.Mesh; onCatch: () => void; cool: number; sx: number; sz: number;
}
interface Slider {
  solid: ReturnType<Game['world']['addBox']>; mesh: THREE.Mesh; ax: number; az: number; bx: number; bz: number; speed: number; phase: number;
}

const TAG = 'mission';

/** A running mission: state plus the toolbox mission scripts use. */
export class Run {
  step = -1;
  t = 0;
  total = 0;
  timer = 0;
  data: Record<string, number> = {};
  cars = new Map<string, Vehicle>();
  actors = new Map<string, Actor>();
  lights: Light[] = [];
  sliders: Slider[] = [];
  checkpoint = { step: 0, x: 0, y: 0, z: 0, h: 0, car: '' as string, kind: '' as VKind | '' };
  boss: { name: string; hp: number; max: number } | null = null;
  finished = false;
  group = new THREE.Group();
  landed = false;

  constructor(public g: Game, public def: MissionDef, public replay: boolean) {
    g.scene.add(this.group);
  }

  get p() {
    return this.g.player;
  }

  // ---- queries
  near(poi: POI, r = 6, y = false): boolean {
    const p = this.p.pos;
    if (y && poi.y !== undefined && Math.abs(p.y - poi.y) > 4) return false;
    return dist2(p.x, p.z, poi.x, poi.z) < r * r;
  }
  inCar(key?: string): boolean {
    const v = this.p.vehicle;
    if (!v) return false;
    return key ? this.cars.get(key) === v : true;
  }
  alive(tag = TAG, kinds?: NpcKind[]): number {
    return this.g.npcs.countKind((n) => n.tag === tag && n.state !== 'down' && (!kinds || kinds.includes(n.kind)));
  }

  // ---- world helpers
  car(key: string, kind: VKind, x: number, z: number, rot: number, y?: number): Vehicle {
    let v = this.cars.get(key);
    if (v && this.g.vehicles.list.includes(v) && v.mode !== 'wreck') return v;
    v = this.g.vehicles.spawn(kind, x, z, rot, { persistent: true, tag: TAG, y });
    this.cars.set(key, v);
    return v;
  }
  /** Adopt an existing vehicle (for example the limo already parked in the garage). */
  adopt(key: string, tag: string, kind: VKind, x: number, z: number, rot: number, y?: number): Vehicle {
    const found = this.g.vehicles.byTag(tag).find((v) => v.mode !== 'wreck');
    if (found) {
      found.persistent = true;
      this.cars.set(key, found);
      return found;
    }
    return this.car(key, kind, x, z, rot, y);
  }
  npcs(kind: NpcKind, x: number, z: number, n: number, spread = 4, o: Partial<Npc> & { y?: number } = {}): Npc[] {
    const out: Npc[] = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * spread;
      out.push(this.g.npcs.spawn(kind, x + Math.cos(a) * d, z + Math.sin(a) * d, { tag: TAG, persistent: true, forced: true, ...o }));
    }
    return out;
  }
  protest(x: number, z: number, r: number, n: number) {
    this.g.npcs.protest(x, z, r, Math.max(6, Math.round(n * Math.max(0.6, this.g.npcs.density))), TAG);
  }
  heat(level: number, lock = true, cap = Math.max(level, 5)) {
    const h = this.g.heat;
    h.cap = cap;
    h.floor = lock ? level : 0;
    h.locked = lock;
    if (h.level < level) h.set(level);
    h.lastKnown.copy(this.p.pos);
  }
  /** Let the heat be lost naturally again. */
  release() {
    const h = this.g.heat;
    h.floor = 0;
    h.locked = false;
  }
  say(who: string, text: string) {
    this.g.say(who, text);
  }
  sw(id: string, x: number, y: number, z: number, label: string, hold: number, onUse: () => void, prop = true) {
    if (!this.g.interact.has(id)) this.g.interact.add({ id, tag: TAG, x, y, z, label, hold, onUse, prop });
  }
  gate(id: string, open: boolean) {
    this.g.world.setGate(id, open);
  }

  /** A caricature character standing in the world (bosses). */
  actor(key: string, spec: keyof typeof BOSS_SPECS | 'trump', x: number, y: number, z: number, heading: number, scale = 1.25): Actor {
    let a = this.actors.get(key);
    if (!a) {
      const rig = new CharacterRig(spec === 'trump' ? OUTFITS.president.spec : BOSS_SPECS[spec]);
      rig.root.scale.setScalar(scale);
      this.group.add(rig.root);
      a = { rig, mode: 'idle', t: 0 };
      this.actors.set(key, a);
    }
    a.rig.root.position.set(x, y, z);
    a.rig.root.rotation.y = heading;
    return a;
  }

  /** Sweeping searchlight: triggers `onCatch` when it finds the player in the open. */
  light(cx: number, cz: number, sweep: number, speed: number, r: number, y: number, onCatch: () => void, sx = cx, sz = cz) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 }),
    );
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(1, 1, 14, 1, true).translate(0, -0.5, 0),
      new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
    );
    disc.renderOrder = 6;
    this.group.add(disc, cone);
    this.lights.push({ cx, cz, sweep, speed, phase: this.lights.length * 2.1, r, y, x: cx, z: cz, disc, cone, onCatch, cool: 2, sx, sz });
  }

  /** A barrier that slides back and forth between two points. */
  slider(ax: number, az: number, bx: number, bz: number, len: number, speed: number, color = 0x3a3d55) {
    const along = Math.abs(bx - ax) > Math.abs(bz - az);
    const w = along ? 1 : len, d = along ? len : 1;
    const solid = this.g.world.addBox(ax, az, w, d, 0, 2.6, 0, { dynamic: true, tag: 'slider' });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), toonColor(color));
    mesh.castShadow = true;
    this.group.add(mesh);
    this.sliders.push({ solid, mesh, ax, az, bx, bz, speed, phase: this.sliders.length * 1.7 });
  }
  clearSliders() {
    for (const s of this.sliders) {
      this.g.world.removeDyn(s.solid);
      this.group.remove(s.mesh);
    }
    this.sliders.length = 0;
  }
  clearLights() {
    for (const l of this.lights) this.group.remove(l.disc, l.cone);
    this.lights.length = 0;
  }

  update(dt: number) {
    const g = this.g, p = this.p;
    for (const a of this.actors.values()) {
      a.t += dt;
      a.rig.animate(a.mode, dt, 0, clamp(a.t / 0.6, 0, 1), g.time);
    }
    for (const l of this.lights) {
      const a = Math.sin(g.time * l.speed + l.phase);
      const b = Math.cos(g.time * l.speed * 0.63 + l.phase * 1.7);
      l.x = l.cx + a * l.sweep;
      l.z = l.cz + b * l.sweep * 0.6;
      const gy = g.world.groundAt(l.x, l.z, l.y);
      l.disc.position.set(l.x, gy + 0.14, l.z);
      l.disc.scale.set(l.r, 1, l.r);
      l.cone.position.set(l.sx, l.y, l.sz);
      const dx = l.x - l.sx, dz = l.z - l.sz, dy = l.y - gy;
      const len = Math.hypot(dx, dy, dz);
      l.cone.scale.set(l.r, len, l.r);
      l.cone.rotation.set(Math.atan2(Math.hypot(dx, dz), dy), Math.atan2(dx, dz), 0, 'YXZ');
      l.cool -= dt;
      if (l.cool <= 0 && dist2(p.pos.x, p.pos.z, l.x, l.z) < l.r * l.r && !p.invulnerable && !p.crouching && !g.world.roofAbove(p.pos.x, p.pos.z, p.pos.y + 1)) {
        l.cool = 5;
        l.onCatch();
      }
      (l.disc.material as THREE.MeshBasicMaterial).color.setHex(l.cool > 3.5 ? 0xff5a4a : 0xfff2a0);
    }
    for (const s of this.sliders) {
      const k = (Math.sin(g.time * s.speed + s.phase) + 1) / 2;
      const x = s.ax + (s.bx - s.ax) * k, z = s.az + (s.bz - s.az) * k;
      s.solid.x = x;
      s.solid.z = z;
      s.mesh.position.set(x, 1.3, z);
    }
  }

  dispose() {
    const g = this.g;
    g.scene.remove(this.group);
    this.clearSliders();
    this.clearLights();
    g.npcs.clearTagged(TAG);
    g.vehicles.clearTagged(TAG);
    g.combat.clearTargets(TAG);
    g.combat.hazards.length = 0;
    g.interact.clear(TAG);
    this.cars.clear();
  }
}

// ----------------------------------------------------------------------------- step factories
type Opt = Partial<Pick<Step, 'start' | 'timer' | 'fail' | 'noCheckpoint'>> & { vehicle?: boolean | string; foot?: boolean; y?: boolean };

export function goTo(text: string, poi: POI, r = 7, o: Opt = {}): Step {
  return {
    text, marker: poi, start: o.start, timer: o.timer, fail: o.fail, noCheckpoint: o.noCheckpoint,
    done: (m) => m.near(poi, r, o.y) && (o.vehicle === undefined || o.vehicle === false || (typeof o.vehicle === 'string' ? m.inCar(o.vehicle) : m.inCar())) && (!o.foot || !m.p.vehicle),
  };
}
export function loseHeat(text = 'Lose your pursuers', start?: (m: Run) => void): Step {
  return {
    text: (m) => (m.g.heat.visible ? text + ' — break line of sight' : text + ' — stay hidden'),
    start: (m) => {
      m.release();
      start?.(m);
    },
    done: (m) => m.g.heat.level === 0,
  };
}
export function defeat(text: string, start: (m: Run) => void, kinds?: NpcKind[]): Step {
  return { text: (m) => `${text} (${m.alive(TAG, kinds)} left)`, start, done: (m) => m.t > 0.5 && m.alive(TAG, kinds) === 0 };
}

// ----------------------------------------------------------------------------- manager
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true).translate(0, 0.5, 0);

export class Missions {
  list: MissionDef[] = [];
  run: Run | null = null;
  /** Objective marker for HUD and minimap. */
  marker: POI | null = null;
  private beam: THREE.Mesh;
  private startBeam: THREE.Mesh;
  private failT = -1;
  private doneT = -1;
  private pendingStart = 0;
  objective = '';
  lastFail = '';
  private ending = -1;

  constructor(private g: Game) {
    const mat = (c: number, o: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    this.beam = new THREE.Mesh(beamGeo, mat(0xffb030, 0.3));
    this.startBeam = new THREE.Mesh(beamGeo, mat(0xf2c94c, 0.34));
    this.beam.visible = this.startBeam.visible = false;
    this.beam.renderOrder = this.startBeam.renderOrder = 8;
    g.scene.add(this.beam, this.startBeam);
  }

  get active() {
    return !!this.run;
  }
  get activeId() {
    return this.run ? this.run.def.id : '';
  }
  /** The next campaign mission, if any. */
  get next(): MissionDef | null {
    return this.g.freeRoam ? null : this.list[this.g.save.mission] ?? null;
  }

  heatExempt() {
    return !!this.run?.def.exempt;
  }
  quietZone(x: number, z: number) {
    const q = this.run?.def.quiet;
    return !!q && dist2(x, z, q.x, q.z) < q.r * q.r;
  }
  allowSafehouse() {
    return !!this.run?.def.allowSafehouse;
  }
  allowInteract(id: string) {
    return !this.run?.def.locked?.includes(id) || !!this.run.data['unlock:' + id];
  }

  // ---- event hooks
  onVehicleWrecked(v: Vehicle) {
    const r = this.run;
    if (!r) return;
    for (const [key, car] of r.cars) if (car === v) r.data['wrecked:' + key] = 1;
  }
  onEnterVehicle(_v: Vehicle) {}
  onNpcDown(_n: Npc) {}
  onLanded() {
    if (this.run) this.run.landed = true;
  }
  onPlayerDown() {
    const g = this.g;
    if (this.failT >= 0) return;
    if (this.run) this.fail('');
    else if (g.activities.active) g.activities.playerDown();
    else {
      // free roam: wake up at the nearest safehouse, a little poorer
      const fee = Math.min(g.save.cash, 100);
      g.fade(() => {
        const s = g.nearestSafehouse();
        g.heat.clear(true);
        g.npcs.clearTagged('heat');
        g.player.revive(s.x, s.y, s.z);
        if (fee) g.addCash(-fee, 'Legal fees');
      });
      this.failT = 2;
    }
  }

  // ---- lifecycle
  start(def: MissionDef, replay = false) {
    const g = this.g;
    if (this.run) this.stop();
    g.activities.stop();
    this.run = new Run(g, def, replay);
    this.failT = this.doneT = -1;
    g.heat.clear(true);
    g.heat.cap = def.heatCap ?? 5;
    g.atmo.timeOverride = def.time ?? null;
    g.atmo.weatherOverride = def.weather ?? null;
    if (!def.lateTitle) this.titleCard();
    def.setup?.(this.run);
    this.enterStep(0);
  }

  titleCard() {
    const d = this.run!.def;
    this.g.hud.title(`MISSION ${String(d.num).padStart(2, '0')}`, d.title, d.intro);
    this.g.audio.play('missionStart', 0.8);
  }

  private enterStep(i: number) {
    const r = this.run!;
    r.step = i;
    r.t = 0;
    const s = r.def.steps[i];
    r.timer = s.timer ?? 0;
    if (!s.noCheckpoint) {
      const p = r.p;
      const v = p.vehicle;
      let key = '';
      if (v) for (const [k, c] of r.cars) if (c === v) key = k;
      r.checkpoint = { step: i, x: p.pos.x, y: p.pos.y, z: p.pos.z, h: p.heading, car: v ? key || '*' : '', kind: v ? v.kind : '' };
    }
    s.start?.(r);
    if (i > 0) this.g.audio.play('objective', 0.6);
  }

  private fail(reason: string) {
    const g = this.g;
    if (this.failT >= 0 || !this.run) return;
    this.failT = 0;
    this.lastFail = reason || 'player down';
    if (reason) {
      g.hud.banner('MISSION FAILED', reason, 'bad');
      g.audio.play('fail', 0.9);
    }
  }

  /** Put everything back and resume from the last checkpoint. */
  restart(fromStart = false) {
    const g = this.g, r = this.run;
    if (!r) return;
    const def = r.def, cp = fromStart ? null : { ...r.checkpoint };
    const replay = r.replay;
    r.dispose();
    g.heat.clear(true);
    g.npcs.clearTagged('heat');
    for (const v of g.vehicles.byTag('heat')) g.vehicles.remove(v);
    g.fx.clear();
    this.run = new Run(g, def, replay);
    const nr = this.run;
    g.heat.cap = def.heatCap ?? 5;
    this.failT = this.doneT = -1;
    if (!cp || (cp.step === 0 && def.id === 'm01')) {
      def.setup?.(nr);
      this.enterStep(0);
      return;
    }
    g.player.revive(cp.x, cp.y, cp.z, cp.h);
    nr.landed = true;
    def.setup?.(nr);
    // re-create the vehicle the player had at the checkpoint
    if (cp.kind && VSPECS[cp.kind].cls !== 'heli') {
      const key = cp.car === '*' ? 'cp' : cp.car;
      const v = nr.car(key, cp.kind, cp.x, cp.z, cp.h, cp.y);
      g.player.enter(v);
    }
    // run earlier steps' world setup that later steps rely on is each step's own job
    this.enterStep(cp.step);
    nr.checkpoint = { ...cp };
  }

  stop() {
    const g = this.g;
    if (!this.run) return;
    this.run.def.cleanup?.(this.run);
    this.run.dispose();
    this.run = null;
    this.marker = null;
    this.failT = this.doneT = -1;
    g.heat.cap = 5;
    g.heat.floor = 0;
    g.heat.locked = false;
    g.atmo.timeOverride = null;
    g.atmo.weatherOverride = null;
    g.hud.boss(null);
    g.cam.cine = null;
    this.applyWorldState();
  }

  /** World gates that depend on campaign progress. */
  applyWorldState() {
    const g = this.g, done = (id: string) => g.save.completed.includes(id);
    g.world.setGate('tunnel', done('m09'));
    g.world.setGate('wh-west', true);
    g.world.setGate('wh-south', true);
    g.world.setGate('compound', true);
    g.world.setGate('tower-door', true);
    g.world.setGate('ex-w', true);
    g.world.setGate('ex-e', true);
    g.world.setGate('ex-s', true);
  }

  private complete() {
    const g = this.g, r = this.run!, d = r.def;
    r.finished = true;
    const rw = d.reward;
    const first = !g.save.completed.includes(d.id);
    const lines: string[] = [];
    const cash = first ? rw.cash : Math.round(rw.cash * 0.25);
    g.addCash(cash);
    lines.push(`+$${cash}`);
    if (first) {
      g.save.completed.push(d.id);
      if (!r.replay || g.save.mission === d.num - 1) g.save.mission = Math.max(g.save.mission, d.num);
      if (rw.district && !g.save.districts.includes(rw.district)) {
        g.save.districts.push(rw.district);
        lines.push(`District unlocked: ${DISTRICTS[rw.district].name}`);
      }
      if (rw.outfit && !g.save.outfits.includes(rw.outfit)) {
        g.save.outfits.push(rw.outfit);
        lines.push(`Outfit unlocked: ${OUTFITS[rw.outfit].name}`);
      }
      if (rw.weapon && !g.save.weapons.includes(rw.weapon)) {
        g.save.weapons.push(rw.weapon);
        lines.push(`Gear unlocked: ${WEAPONS.find((w) => w.id === rw.weapon)!.name}`);
      }
      if (rw.vehicle) lines.push(`Vehicle unlocked: ${VSPECS[rw.vehicle].name} (VIP garage)`);
      if (rw.text) lines.push(rw.text);
    }
    g.hud.banner('MISSION COMPLETE', `${d.title} — ${lines.join(' · ')}`, 'good');
    g.audio.play('missionDone', 0.9);
    g.fx.confetti(g.player.pos.x, g.player.pos.y + 2.5, g.player.pos.z);
    g.player.victoryT = 2.2;
    g.player.heal(100);
    g.save.pos = { x: g.player.pos.x, y: g.player.pos.y, z: g.player.pos.z };
    this.doneT = 0;
    if (d.id === 'm18') {
      g.save.finished = true;
      for (const k of Object.keys(DISTRICTS) as DistrictId[]) if (!g.save.districts.includes(k)) g.save.districts.push(k);
    }
    g.store.save();
  }

  update(dt: number) {
    const g = this.g, p = g.player;
    if (this.pendingStart > 0) this.pendingStart -= dt;
    // --- free roam: campaign start marker
    const nx = this.next;
    if (!this.run) {
      if (this.failT >= 0) {
        this.failT -= dt;
        if (this.failT < 0) this.failT = -1;
      }
      this.beam.visible = false;
      const show = !!nx && !g.activities.active;
      this.startBeam.visible = show;
      this.marker = show ? nx!.where : g.activities.marker;
      this.objective = show ? `Go to the mission marker: ${nx!.title}` : '';
      if (show && nx) {
        const y = nx.where.y ?? g.world.groundAt(nx.where.x, nx.where.z, 300);
        this.startBeam.position.set(nx.where.x, y, nx.where.z);
        this.startBeam.scale.set(2.6, 60, 2.6);
        const d2 = dist2(p.pos.x, p.pos.z, nx.where.x, nx.where.z);
        if (d2 < 4.5 * 4.5 && Math.abs(p.pos.y - y) < 4 && this.pendingStart <= 0 && p.state !== 'down' && g.heat.level < 3) this.start(nx);
        else if (d2 < 4.5 * 4.5 && g.heat.level >= 3 && this.pendingStart <= 0) {
          this.pendingStart = 4;
          g.hud.toast('Lose the heat before starting a mission', 'warn');
        }
      }
      return;
    }
    this.startBeam.visible = false;
    const r = this.run;
    r.total += dt;
    r.update(dt);
    if (this.ending >= 0) {
      this.endingCine(dt);
      return;
    }
    if (this.failT >= 0) {
      this.failT += dt;
      if (this.failT > 2.4) {
        this.failT = -100;
        g.fade(() => this.restart());
      }
      return;
    }
    if (this.failT < -1) return;
    if (this.doneT >= 0) {
      this.doneT += dt;
      if (this.doneT > 3.2) {
        const wasFinal = r.def.id === 'm18' && !r.replay;
        this.stop();
        this.pendingStart = 6;
        if (wasFinal) g.hud.toast('Free roam unlocked: every district is yours to explore', 'good');
      }
      return;
    }
    const s = r.def.steps[r.step];
    r.t += dt;
    this.objective = typeof s.text === 'function' ? s.text(r) : s.text;
    const mk = typeof s.marker === 'function' ? s.marker(r) : s.marker ?? null;
    this.marker = mk;
    this.beam.visible = !!mk;
    if (mk) {
      const y = mk.y ?? g.world.groundAt(mk.x, mk.z, p.pos.y + 3);
      this.beam.position.set(mk.x, y, mk.z);
      this.beam.scale.set(1.8, 45, 1.8);
    }
    if (s.timer) {
      r.timer -= dt;
      if (r.timer <= 0) {
        if (s.survive) return this.advance();
        return this.fail('Out of time!');
      }
    }
    const why = s.fail?.(r);
    if (why) return this.fail(why);
    if (!s.survive && s.done(r, dt)) this.advance();
    else if (s.survive) s.done(r, dt);
  }

  private advance() {
    const r = this.run!;
    if (r.step + 1 >= r.def.steps.length) {
      if (r.def.id === 'm18') this.ending = 0;
      else this.complete();
    } else this.enterStep(r.step + 1);
  }

  /** Closing shot: the chopper climbs away over the city. */
  private endingCine(dt: number) {
    const g = this.g, v = g.player.vehicle;
    if (this.ending === 0) {
      g.heat.clear(true);
      g.npcs.clearTagged('heat');
      for (const h of g.vehicles.byTag('heat')) g.vehicles.remove(h);
      g.hud.cinema(true);
      g.input.enabled = false;
      g.cam.cine = { pos: g.camera.position.clone(), look: new THREE.Vector3(), fov: 48 };
    }
    this.ending += dt;
    const t = this.ending;
    if (v) {
      v.speed = 24;
      v.heading = Math.PI * 0 + Math.sin(t * 0.2) * 0.1;
      v.vx = v.fx * 24;
      v.vz = v.fz * 24;
      v.x += v.vx * dt;
      v.z += v.vz * dt;
      v.y += 2.5 * dt;
      v.rotorSpeed = 1;
      v.pitch = 0.2;
      const c = g.cam.cine!;
      c.look.set(v.x, v.y + 1, v.z);
      c.pos.set(v.x + 26 - t * 2, v.y + 6 + t * 0.8, v.z + 20 + t * 2.2);
    }
    if (t > 3 && t - dt <= 3) g.hud.banner('TRUMP SURVIVED AMERICA.', 'The city will need a minute.', 'good', 8);
    if (t > 11.5) {
      this.ending = -1;
      g.cam.cine = null;
      g.hud.cinema(false);
      g.input.enabled = true;
      g.fade(() => {
        if (v) {
          v.x = -65;
          v.z = 8;
          v.y = 150;
          v.speed = v.vx = v.vz = 0;
          v.pitch = 0;
          v.landed = true;
        }
        this.complete();
        g.menus.credits(true);
      });
    }
  }

  /**
   * Test hook: plays the current objective "perfectly" (teleports to markers, flips
   * switches, clears mission enemies). Used by the automated campaign smoke test.
   */
  debugSkip() {
    const r = this.run, g = this.g, p = g.player;
    if (!r || r.finished || this.failT !== -1 || this.ending >= 0) return;
    const s = r.def.steps[r.step];
    r.data.dbg = (r.data.dbg ?? 0) + 1;
    for (const n of g.npcs.list) if (n.tag === 'mission' && g.npcs.isHostile(n) && n.state !== 'down') {
      n.hp = 0;
      n.state = 'down';
      n.t = 0;
    }
    for (const t of [...g.combat.targets]) if (t.alive) g.combat.hitTarget(t, 9999);
    for (const sw of [...g.interact.switches]) sw.onUse();
    if (s.survive) r.timer = Math.min(r.timer, 0.2);
    if (r.def.id === 'm10') r.data.hide = 99;
    const txt = typeof s.text === 'function' ? s.text(r) : s.text;
    if (!s.marker && /lose|lie low|wait|vanish|stay out|kill the engine|let the search|shake/i.test(txt)) {
      g.heat.floor = 0;
      g.heat.locked = false;
      g.heat.clear(true);
    }
    if (p.state === 'chute') {
      p.pos.y = g.world.groundAt(p.pos.x, p.pos.z, p.pos.y) + 2;
      return;
    }
    const mk = typeof s.marker === 'function' ? s.marker(r) : s.marker;
    if (!mk) return;
    for (const d of g.world.interacts) {
      if ((d.kind === 'elevator' || d.kind === 'ladder') && d.to && this.allowInteract(d.id) && Math.hypot(d.x - mk.x, d.z - mk.z) < 4 && Math.abs(d.y - (mk.y ?? d.y)) < 3 && !p.vehicle) {
        p.place(d.to.x, d.to.y, d.to.z);
        return;
      }
    }
    const y = mk.y ?? g.world.groundAt(mk.x, mk.z, 300);
    const phase = r.data.dbg % 6;
    if (phase < 3) {
      if (p.vehicle && phase === 0 && r.data.dbg > 6) p.forceExit();
      if (p.vehicle) {
        p.vehicle.x = mk.x;
        p.vehicle.z = mk.z;
        p.vehicle.y = y;
        p.vehicle.speed = p.vehicle.vx = p.vehicle.vz = 0;
      } else p.place(mk.x, y, mk.z);
    } else {
      if (!p.vehicle) {
        const own = [...r.cars.values()].find((v) => v.mode !== 'wreck' && v.mode !== 'heliAI' && !v.siren);
        p.enter(own ?? g.vehicles.spawn('suv', p.pos.x, p.pos.z, 0, { tag: 'mission', persistent: true }));
      }
      const v = p.vehicle!;
      v.x = mk.x;
      v.z = mk.z;
      v.y = y;
      v.speed = v.vx = v.vz = 0;
    }
  }

  /** Replay / abandon from menus. */
  startById(id: string) {
    const d = this.list.find((m) => m.id === id);
    if (!d) return;
    const g = this.g;
    g.fade(() => {
      if (d.id !== 'm01') {
        const y = d.where.y ?? g.world.groundAt(d.where.x, d.where.z, 300);
        g.player.revive(d.where.x + 6, y, d.where.z + 3);
      }
      this.start(d, true);
    });
  }
}

export type { Actor };
