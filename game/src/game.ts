import * as THREE from 'three';
import { AudioSys } from './core/audio';
import { Input } from './core/input';
import { SaveStore } from './core/save';
import { clamp, dist2 } from './core/util';
import { Fx } from './render/fx';
import { shared } from './render/materials';
import { Renderer } from './render/renderer';
import { Atmosphere } from './render/sky';
import { buildWorld } from './world/build';
import { Dynamic } from './world/dynamic';
import { P, SLAB_Y } from './world/layout';
import type { World } from './world/world';
import { Npcs } from './entities/npcs';
import { Player } from './entities/player';
import { Vehicles } from './entities/vehicles';
import { Activities } from './systems/activities';
import { CameraRig } from './systems/camera';
import { Combat } from './systems/combat';
import { Heat } from './systems/heat';
import { Interact } from './systems/interact';
import { MISSIONS } from './systems/missionData';
import { Missions } from './systems/missions';
import { Hud } from './ui/hud';
import { Menus } from './ui/menus';

export type GameState = 'menu' | 'play' | 'pause';

export class Game {
  renderer: Renderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, 1, 0.4, 2600);
  input: Input;
  store = new SaveStore();
  audio = new AudioSys();
  atmo: Atmosphere;
  world: World;
  dyn: Dynamic;
  fx: Fx;
  player: Player;
  cam: CameraRig;
  vehicles: Vehicles;
  npcs: Npcs;
  combat: Combat;
  heat: Heat;
  interact: Interact;
  missions: Missions;
  activities: Activities;
  hud: Hud;
  menus: Menus;
  state: GameState = 'menu';
  freeRoam = false;
  time = 0;
  frame = 0;
  private last = performance.now();
  private fading = false;
  private cullT = 0;
  private saveT = 30;
  private menuAngle = 0;
  private focus = new THREE.Vector3();
  private wasLocked = false;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.store.load();
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    this.world = buildWorld();
    this.scene.add(this.world.group);
    this.atmo = new Atmosphere(this.scene);
    this.dyn = new Dynamic(this.world);
    this.scene.add(this.dyn.group);
    this.fx = new Fx(this.scene, ui);
    this.hud = new Hud(this, ui);
    this.menus = new Menus(this, ui);
    this.cam = new CameraRig(this);
    this.player = new Player(this);
    this.vehicles = new Vehicles(this);
    this.npcs = new Npcs(this);
    this.combat = new Combat(this);
    this.heat = new Heat(this);
    this.interact = new Interact(this);
    this.missions = new Missions(this);
    this.missions.list = MISSIONS;
    this.activities = new Activities(this);
    this.scene.add(this.vehicles.group, this.npcs.group, this.combat.group, this.interact.group, this.activities.group);
    this.applySettings();
    this.missions.applyWorldState();
    if (this.store.recovered) this.hud.toast('Save data was unreadable and has been reset', 'warn');

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (!locked && this.wasLocked && this.state === 'play') this.pause();
      this.wasLocked = locked;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'play') this.pause();
    });
    window.addEventListener('pointerdown', () => this.audio.unlock(), { once: false });
    window.addEventListener('keydown', () => this.audio.unlock());
    window.addEventListener('beforeunload', () => this.store.save());
    this.toMainMenu(true);
    requestAnimationFrame(() => this.loop());
  }

  get save() {
    return this.store.data;
  }

  // ------------------------------------------------------------------ helpers used across systems
  addCash(n: number, reason = '') {
    this.save.cash = Math.max(0, this.save.cash + Math.round(n));
    if (n > 0 && reason) {
      this.hud.toast(`+$${Math.round(n)} — ${reason}`, 'good');
      this.audio.play('cash', 0.5);
    }
  }
  say(who: string, text: string) {
    this.hud.say(who, text);
  }
  /** Fade to black, run the callback, fade back in. */
  fade(cb: () => void) {
    if (this.fading) {
      cb();
      return;
    }
    this.fading = true;
    this.hud.fade(true);
    setTimeout(() => {
      try {
        cb();
      } finally {
        this.cam.snap();
        setTimeout(() => {
          this.hud.fade(false);
          this.fading = false;
        }, 120);
      }
    }, 320);
  }
  nearestSafehouse(): { x: number; y: number; z: number } {
    const p = this.player.pos;
    let best = { x: P.safeSuburb.x, y: SLAB_Y, z: P.safeSuburb.z + 9 };
    let bd = Infinity;
    for (const d of this.world.interacts) {
      if (d.kind !== 'safehouse') continue;
      const dd = dist2(d.x, d.z, p.x, p.z);
      if (dd < bd) {
        bd = dd;
        best = { x: d.x, y: d.y, z: d.z + 1.5 };
      }
    }
    return best;
  }

  applySettings() {
    const s = this.save.settings;
    if (this.renderer.quality !== s.quality) this.renderer.setQuality(s.quality);
    const pr = this.renderer.preset;
    this.npcs.density = pr.npc;
    this.vehicles.density = pr.traffic;
    this.fx.density = pr.particles;
    this.audio.applySettings(s);
  }

  // ------------------------------------------------------------------ state changes
  setState(s: GameState) {
    this.state = s;
    this.input.enabled = s === 'play';
    this.hud.show(s === 'play');
    if (s !== 'play') {
      this.input.exitLock();
      this.audio.silence();
    }
  }

  private resetWorld() {
    this.missions.stop();
    this.activities.stop();
    this.vehicles.reset();
    this.npcs.reset();
    this.combat.reset();
    this.heat.reset();
    this.fx.clear();
    this.interact.clear('mission');
    this.cam.cine = null;
    this.atmo.timeOverride = null;
    this.atmo.weatherOverride = null;
    this.missions.applyWorldState();
    this.player.health = this.player.maxHealth;
    this.player.setOutfit(this.save.outfit);
  }

  beginPlay(lock = true) {
    this.menus.close();
    this.setState('play');
    this.last = performance.now();
    this.audio.unlock();
    this.audio.applySettings(this.save.settings);
    if (lock) this.input.requestLock();
  }

  newGame() {
    this.store.reset();
    this.save.started = true;
    this.freeRoam = false;
    this.resetWorld();
    this.atmo.time = 10.5;
    this.beginPlay();
    this.missions.start(MISSIONS[0]);
    this.store.save();
  }

  continueGame() {
    this.freeRoam = false;
    this.resetWorld();
    if (this.save.mission === 0) {
      this.beginPlay();
      this.missions.start(MISSIONS[0]);
      return;
    }
    this.spawnSaved();
    this.beginPlay();
  }

  startFreeRoam() {
    this.freeRoam = true;
    this.resetWorld();
    this.spawnSaved();
    this.beginPlay();
    this.hud.toast('Free roam — no campaign missions, challenges are marked in blue', 'good');
  }

  private spawnSaved() {
    const s = this.save.pos;
    if (s && !this.world.inside(s.x, s.y + 1, s.z)) this.player.revive(s.x, this.world.groundAt(s.x, s.z, s.y + 1), s.z);
    else {
      this.player.pos.set(P.safeSuburb.x, 0, P.safeSuburb.z);
      const h = this.nearestSafehouse();
      this.player.revive(h.x, h.y, h.z);
    }
    this.player.invuln = 2;
  }

  pause() {
    if (this.state !== 'play') return;
    this.setState('pause');
    this.menus.pause();
  }
  resume() {
    this.menus.close();
    this.setState('play');
    this.last = performance.now();
    this.input.requestLock();
  }
  toMainMenu(first = false) {
    if (!first) {
      if (!this.missions.active && this.player.state !== 'down' && this.save.started) this.save.pos = { x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z };
      this.store.save();
      this.resetWorld();
    }
    this.setState('menu');
    this.player.place(P.square.x + 14, SLAB_Y, P.square.z + 30, Math.PI);
    this.player.freeze(true);
    this.cam.cine = { pos: new THREE.Vector3(-200, 60, 200), look: new THREE.Vector3(P.tower.x, 55, P.tower.z), fov: 52 };
    this.camera.position.copy(this.cam.cine.pos);
    this.menus.main();
  }

  // ------------------------------------------------------------------ main loop
  private hotkeys() {
    const inp = this.input;
    if (this.state === 'play') {
      if (inp.rawHit('Escape') || inp.rawHit('KeyP') || inp.rawPadHit('pause')) this.pause();
      else if (inp.rawHit('Tab')) {
        this.setState('pause');
        this.menus.info(() => this.resume());
      } else if (inp.rawHit('KeyM') || inp.rawPadHit('map')) {
        this.setState('pause');
        this.menus.map(() => this.resume());
      }
    } else if (this.state === 'pause') {
      if ((this.menus.screen === 'map' && inp.rawHit('KeyM')) || (this.menus.screen === 'info' && inp.rawHit('Tab')) || (this.menus.screen === 'pause' && inp.rawHit('KeyP'))) this.resume();
    }
  }

  private sounds() {
    const a = this.audio, p = this.player, v = p.vehicle;
    a.listener.x = p.pos.x;
    a.listener.z = p.pos.z;
    if (v && v.spec.cls !== 'heli') a.setLoop('engine', 0.05 + clamp(Math.abs(v.speed) / v.spec.maxSpeed, 0, 1) * 0.1, (v.spec.cls === 'bike' ? 80 : v.spec.cls === 'boat' ? 48 : 58) + Math.abs(v.speed) * 5.5);
    else a.setLoop('engine', 0);
    let rotor = v && v.spec.cls === 'heli' ? v.rotorSpeed * 0.3 : 0;
    let siren = 0;
    for (const o of this.vehicles.list) {
      const d = Math.sqrt(dist2(o.x, o.z, p.pos.x, p.pos.z));
      if (o.siren) siren = Math.max(siren, clamp(1 - d / 130, 0, 1) * 0.06);
      if (o.mode === 'heliAI') rotor = Math.max(rotor, clamp(1 - d / 150, 0, 1) * 0.22);
    }
    a.setLoop('rotor', rotor);
    a.setLoop('siren', siren);
    const sp = v ? Math.abs(v.speed) : 0;
    a.setLoop('wind', p.state === 'chute' ? 0.22 : clamp(sp / 60, 0, 1) * 0.12 + this.atmo.wet * 0.1);
    let crowd = 0;
    for (const c of this.npcs.crowds) crowd = Math.max(crowd, clamp(1 - Math.sqrt(dist2(c.x, c.z, p.pos.x, p.pos.z)) / 55, 0, 1));
    a.setLoop('crowd', crowd * 0.16 * (0.75 + Math.sin(this.time * 5) * 0.25));
    const d = this.world.district(p.pos.x, p.pos.z);
    a.setLoop('city', d === 'downtown' || d === 'wallstreet' ? 0.07 : d === 'desert' || d === 'outskirts' || d === 'ocean' ? 0.02 : 0.045);
    a.musicMood = this.heat.level >= 3 ? 1 : 0;
    a.updateMusic(this.save.settings.music > 0.01);
  }

  private loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    const inp = this.input;
    inp.pollGamepad();
    this.hotkeys();
    const r = this.renderer;
    this.camera.aspect = r.width / r.height;

    if (this.state === 'play') {
      this.time += dt;
      this.frame++;
      this.player.update(dt);
      this.vehicles.update(dt);
      this.npcs.update(dt);
      this.combat.update(dt);
      this.heat.update(dt);
      this.interact.update(dt);
      this.missions.update(dt);
      this.activities.update(dt);
      this.cam.update(dt);
      this.fx.update(dt, this.camera, r.width, r.height);
      this.hud.update(dt);
      this.sounds();
      this.saveT -= dt;
      if (this.saveT <= 0) {
        this.saveT = 45;
        if (!this.missions.active && !this.activities.active && this.player.state === 'foot' && this.heat.level === 0) this.save.pos = { x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z };
        this.store.save();
      }
    } else if (this.state === 'menu') {
      // attract mode: the city carries on behind the menu
      this.time += dt;
      this.frame++;
      this.menuAngle += dt * 0.05;
      const c = this.cam.cine;
      if (c) c.pos.set(P.tower.x + Math.cos(this.menuAngle) * 210, 70 + Math.sin(this.menuAngle * 0.7) * 18, P.tower.z + 60 + Math.sin(this.menuAngle) * 210);
      this.player.update(dt);
      this.vehicles.update(dt);
      this.npcs.update(dt);
      this.cam.update(dt);
      this.fx.update(dt, this.camera, r.width, r.height);
    }
    r.flash = Math.max(0, r.flash - dt * 1.6);
    r.desat = this.atmo.wet * 0.22 + (this.player.state === 'down' ? 0.6 : 0);
    this.focus.copy(this.state === 'menu' ? this.cam.cine!.look : this.player.pos);
    this.atmo.update(this.state === 'pause' ? 0 : dt, this.camera, this.focus, this.save.settings, r.preset);
    shared.sunK.value = this.atmo.sunK();
    this.world.waterMat.uniforms.uTime.value = this.time;
    const n = this.atmo.night;
    (this.world.waterMat.uniforms.uTint.value as THREE.Color).setRGB(1 - n * 0.62, 1 - n * 0.55, 1 - n * 0.35);
    this.world.signs.material.color.setScalar(1 - n * 0.28);
    this.dyn.update(this.time, dt, n, r.preset.particles > 0.5);
    this.cullT -= dt;
    if (this.cullT <= 0) {
      this.cullT = 0.2;
      this.world.cull(this.camera.position.x, this.camera.position.z, r.preset.drawDist + 60 + Math.max(0, this.camera.position.y - 30) * 2.5);
    }
    r.render(this.scene, this.camera, dt);
    inp.endFrame();
  }
}
