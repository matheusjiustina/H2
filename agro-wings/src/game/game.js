// AGRO WINGS — game shell: boot, main loop, modes, job flow, prompts, warnings.
import * as THREE from 'three';
import { World } from '../world/world.js';
import { QUALITY, GAME, SPRAY } from '../config.js';
import { AIRCRAFT_ORDER, aircraftType } from '../aircraft/types.js';
import { Input, KEY_SCHEMES, DEFAULT_KEY_SCHEME, keyLabel } from '../core/input.js';
import { ParticlePool } from '../core/particles.js';
import { Aircraft } from '../aircraft/aircraft.js';
import { Helicopter } from '../aircraft/helicopter.js';
import { CameraRig } from '../aircraft/cameras.js';
import { Sprayer } from '../spray/sprayer.js';
import { Guidance } from '../spray/guidance.js';
import { CoverageOverlay } from '../spray/overlay.js';
import { GroundService } from '../crew/service.js';
import { GameAudio } from '../audio/audio.js';
import { HUD } from '../ui/hud.js';
import { Screens, money } from '../ui/screens.js';
import { TouchControls } from '../ui/touch.js';
import { Career } from './contracts.js';
import { Tutorial } from './tutorial.js';
import { ReplayManager } from './replay.js';
import { WeatherCycle } from '../world/weatherCycle.js';
import { GroundMarks } from '../world/groundMarks.js';
import { BASE, POWERLINE, CONTRACT_FIELDS, MAIN_SITE, SITES, nearestSite, siteById } from '../world/layout.js';
import { smoothstep } from '../core/math.js';
import { Autopilot } from './autopilot.js';
import { HeliAutopilot } from './heliAutopilot.js';
import { windAt } from '../flight/env.js';
import { t } from '../i18n/index.js';

const SETTINGS = 'agrowings.settings.v1';

// Crash reasons stay in English on the aircraft (tests and logs read them);
// they are translated here, when shown.
function crashText(reason) {
  const m = /^(Hit|Main rotor struck the) parked (.+)$/.exec(reason);
  return m ? t(`${m[1]} parked {0}`, m[2]) : t(reason);
}

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.time = 0;
    this.frames = 0;
    this.playing = false;
    this.paused = false;
    this.mode = 'title';
    this.job = null;
    this.cameraMode = 'chase';
    this.settings = { quality: 'medium', assist: 'normal', wind: 1, volume: 0.8, showFps: false, aircraft: 'ipanema', keyScheme: DEFAULT_KEY_SCHEME, heliAssist: 'high', heliModel: 'power', timeOfDay: 'morning', weather: 'partly', hudGps: false, shake: 1, qualityAuto: true, autoChecked: false };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS) || '{}')); } catch { /* defaults */ }
    const q = new URLSearchParams(location.search).get('q');
    if (q && QUALITY[q]) { this.settings.quality = q; this.qualityForced = true; }
    // Frame-time history (ms) for the FPS overlay and the auto quality check.
    this.frameMs = new Float32Array(240);
    this.frameN = 0;
  }

  createRenderer() {
    const ctx = this.canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance', stencil: false });
    if (!ctx) throw new Error(t('WebGL2 is not available on this device.'));
    const clip = !!ctx.getExtension('EXT_clip_control');
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, context: ctx, antialias: true, reversedDepthBuffer: clip, logarithmicDepthBuffer: !clip });
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.95;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.depthMode = clip ? 'reversed' : 'log';
    return r;
  }

  async boot() {
    this.screens = new Screens(this, this.uiRoot);
    const steps = ['Terrain', 'Ground', 'Sky', 'Crops', 'Forest', 'Base'];
    let si = 0;
    this.quality = QUALITY[this.settings.quality];
    this.renderer = this.createRenderer();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.quality.pixelRatio);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 30000);
    this.input = new Input(this.canvas);
    this._applyKeyScheme();
    this.world = new World(this.renderer, this.scene, this.quality);
    await this.world.build((label) => {
      si = Math.max(si, steps.indexOf(label) + 1);
      this.screens.setLoading(si / (steps.length + 2), t(label));
    });
    this.marks = new GroundMarks(this.scene, this.world.terrain);
    this.weatherCycle = new WeatherCycle(this);
    this._startWeather(true);
    this.screens.setLoading(0.85, t('Aircraft'));
    await new Promise((r) => setTimeout(r, 0));
    // Both aircraft live in the world; the one not selected waits parked.
    this.fleet = {};
    for (const id of AIRCRAFT_ORDER) {
      // Each aircraft gets its own controller and physics by kind.
      const ac = aircraftType(id).kind === 'heli' ? new Helicopter(this, { type: id }) : new Aircraft(this, { type: id });
      ac.fm.fuel = ac.type.loads.boot; ac.fm.hopper = 0; ac.fm.updateMass();
      this.fleet[id] = ac;
    }
    this.rig = new CameraRig(this.camera);
    this.rig.shakeScale = this.settings.shake;
    this.sprayer = new Sprayer(this);
    this.guidance = new Guidance(this);
    this.replay = new ReplayManager(this);
    this.overlay = new CoverageOverlay(this);
    this.service = new GroundService(this);
    this.mist = new ParticlePool(SPRAY.maxParticles[this.settings.quality], { renderOrder: 22 });
    this.dust = new ParticlePool(1500, { renderOrder: 21 });
    this.scene.add(this.mist.points, this.dust.points);
    this.world.dust = this.dust;
    this.world.mist = this.mist;
    this.mist.limit = SPRAY.maxParticles[this.settings.quality];
    this.audio = new GameAudio();
    this.audio.setVolume(this.settings.volume);
    this.career = new Career();
    this.hud = new HUD(this, this.uiRoot);
    this.touch = new TouchControls(this, this.uiRoot);
    this.tutorial = new Tutorial(this);
    this._activate(this.fleet[this.settings.aircraft] ? this.settings.aircraft : AIRCRAFT_ORDER[0]);
    this.canStartEngine = () => this.service.engineVeto();
    window.addEventListener('resize', () => this.resize());
    const startAudio = () => this.audio.start();
    window.addEventListener('pointerdown', startAudio);
    window.addEventListener('keydown', startAudio);
    this.resize();
    this.screens.setLoading(1, t('Ready'));
    this.rig.setMode('orbit', this.aircraft);
    this.rig.orbit.dist = this.aircraft.type.camera.orbit;
    this.rig.orbit.pitch = 0.16;
    this.screens.hideLoading();
    this.screens.showTitle(true);
    this.last = performance.now();
    this.saveT = 0;
    this.statT = 0;
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const ph = h * this.renderer.getPixelRatio();
    this.mist?.setScale(ph, 62);
    this.dust?.setScale(ph, 62);
  }

  // ------------------------------------------------------------------ settings
  setSetting(k, v, auto = false) {
    this.settings[k] = v;
    if (k === 'quality' && !auto) this.settings.qualityAuto = false;
    try { localStorage.setItem(SETTINGS, JSON.stringify(this.settings)); } catch { /* ignore */ }
    if (k === 'quality') {
      this.quality = QUALITY[v];
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.quality.pixelRatio);
      this.world.setQuality(this.quality);
      this.mist.limit = Math.min(this.mist.max, SPRAY.maxParticles[v]);
      this.resize();
    }
    if (k === 'keyScheme') this._applyKeyScheme();
    if (k === 'volume') this.audio.setVolume(v);
    if (k === 'shake') this.rig.shakeScale = v;
    // Visual/audio only: the flight model's wind is not touched by weather.
    if (k === 'timeOfDay' || k === 'weather') this._startWeather(false);
  }

  // Sky state from the settings: a fixed preset, or 'dynamic' weather /
  // 'flow' (passing) time of day run by the weather cycle.
  _startWeather(instant) {
    const s = this.settings, c = this.weatherCycle;
    const cur = this.world.atmo;
    const weather = s.weather === 'dynamic' ? (c.dynamic ? c.weather : cur.weatherId) : s.weather;
    const time = s.timeOfDay === 'flow' ? (c.flow ? c.time : cur.timeId) : s.timeOfDay;
    c.start({ weather, time, dynamic: s.weather === 'dynamic', flow: s.timeOfDay === 'flow' });
    cur.set(c.time, c.weather, instant);
  }

  // Current time of day and weather (what the farms' requests are judged by).
  envNow() { return { time: this.weatherCycle.time, weather: this.weatherCycle.weather }; }

  // Debug/validation: fly the current job hands-off through the normal inputs.
  startAutopilot(plan = 'contract') {
    this.autopilot = this.aircraft.kind === 'heli' ? new HeliAutopilot(this) : new Autopilot(this);
    this.autopilot.engage(plan);
    return this.autopilot;
  }

  // Make `id` the flown aircraft (placed on the pad, inputs and spray hooked
  // up); every other aircraft is parked and becomes an obstacle.
  _activate(id) {
    const next = this.fleet[id];
    // Parked spots: the helicopter waits on its pad; the airplanes take the
    // west apron spots in order.
    const spots = [BASE.parking, BASE.parking2];
    for (const ac of Object.values(this.fleet)) {
      if (ac === next) continue;
      ac.onSimStep = null; ac.onEvent = null;
      ac.park(ac.kind === 'heli' ? ac.type.servicePad : spots.shift());
    }
    this.aircraft = next;
    this.aircraftId = id;
    next.parked = false;
    next.onSimStep = (h) => this.sprayer.step(h);
    next.onEvent = (e) => this._acEvent(e);
    next.placeAtPad();
    next.stuck = false;
    this._parked = Object.values(this.fleet).filter((ac) => ac !== next);
    this.world.extraObstacle = (x, y, z) => {
      for (const ac of Object.values(this.fleet)) if (ac !== this.aircraft && ac.hitTest(x, y, z)) return `parked ${ac.type.reg}`;
      if (this.service?.truck.hitTest(x, y, z)) return 'service truck';
      return null;
    };
  }

  // Flight key scheme (numpad / classic) onto the input, for every aircraft.
  _applyKeyScheme() {
    this.input?.setAlias(KEY_SCHEMES[this.settings.keyScheme] ?? KEY_SCHEMES[DEFAULT_KEY_SCHEME]);
  }

  // Aircraft selection (title screen). Fuel, hopper and damage stay with
  // each aircraft; the chosen one is towed to the pad.
  selectAircraft(id) {
    if (!this.fleet[id] || id === this.aircraftId) return;
    if (this.service.busy()) this.service.abort(t('Aircraft change — service stopped.'));
    this.sprayer.on = false;
    this._activate(id);
    this.setSetting('aircraft', id);
    if (this.job) this.guidance.setJob(this.job);
    this.rig.setMode(this.rig.mode, this.aircraft);
    if (this.rig.mode === 'orbit') this.rig.orbit.dist = this.aircraft.type.camera.orbit;
    this.audio?.play('ui');
  }

  // On the ground and stopped at the main base (office computer: accept
  // secondary requests, change aircraft).
  atMainBase() {
    const fm = this.aircraft.fm;
    return Math.hypot(fm.pos.x - BASE.hangar.x, fm.pos.z - BASE.hangar.z) < 260 && fm.out.onGround && fm.out.groundSpeed < 0.5;
  }

  // Service area the ground crew works in (main base or a secondary farm).
  get site() { return this.service?.site ?? MAIN_SITE; }
  get sites() { return SITES; }

  // The crew moves to the service area the aircraft arrives at (each farm
  // has its own truck and badeco; only the nearest one is simulated).
  _followSite(dt) {
    this._siteT = (this._siteT ?? 0) - dt;
    if (this._siteT > 0) return;
    this._siteT = 0.5;
    const p = this.aircraft.fm.pos;
    const { site, dist } = nearestSite(p.x, p.z);
    if (site === this.service.site || dist > 900 || this.service.busy()) return;
    this.service.setSite(site);
    if (!site.main && this.playing) this.toast(t('{0}: the local service truck is waiting at the pad.', site.farm.name));
  }

  toast(msg) { this.toastLog = this.toastLog || []; this.toastLog.push(msg); this.hud?.toast(msg); }
  crewMessage(msg) { void msg; }
  charge(amount) { this.career.money -= amount; }

  // ------------------------------------------------------------------ flow
  menuAction(a) {
    this.audio.start();
    switch (a) {
      case 'career':
        this._enterPlay('career');
        this.screens.board();
        break;
      case 'free':
        this._enterPlay('free');
        this.setJob(null);
        this.aircraft.placeAtPad();
        this.aircraft.repair();
        { const L = this.aircraft.type.loads.free; this.aircraft.fm.fuel = L.fuel; this.aircraft.fm.hopper = L.hopper; this.aircraft.fm.updateMass(); }
        this.toast(t('Free flight in {0}: tanks loaded. Hold {1} to start the engine.', this.aircraft.type.reg, keyLabel(this.input.keysOf('engine')[0])));
        break;
      case 'freeAir':
        this._enterPlay('free');
        this.setJob(null);
        this.aircraft.repair();
        { const L = this.aircraft.type.loads.free; this.aircraft.fm.fuel = L.fuel; this.aircraft.fm.hopper = L.hopper; }
        this.aircraft.placeAirborne(-200, -280, Math.PI / 2, 120, this.aircraft.kind === 'heli' ? 30 : 48 * (this.aircraft.A.assistSpeedScale ?? 1));
        this.rig.setMode('chase', this.aircraft);
        this.cameraMode = 'chase';
        break;
      case 'settings': this.screens.settings(); break;
      case 'help': this.screens.help(); break;
      case 'map': this.screens.map(); break;
      case 'board': this.screens.board(); break;
      case 'resetPad': this.screens.close(); this.resetAircraft('pad'); break;
      case 'resetRwy': this.screens.close(); this.resetAircraft('runway'); break;
      case 'title':
        this.screens.close();
        this.playing = false;
        this.mode = 'title';
        this.hud.show(false);
        this.screens.showTitle(true);
        this.rig.setMode('orbit', this.aircraft);
        this.career.save();
        break;
      default: break;
    }
  }

  _enterPlay(mode) {
    this.mode = mode;
    this.playing = true;
    this.screens.showTitle(false);
    this.hud.show(true);
    if (this.rig.mode === 'orbit') { this.rig.setMode('chase', this.aircraft); this.cameraMode = 'chase'; }
    this.canvas.focus();
  }

  setJob(job) {
    this.job = job;
    this.replay.begin(job);
    this.world.activity?.setExcluded(job ? job.fields.map((f) => f.name) : []);
    this.guidance.setJob(job);
    this.sprayer.setTargets(job ? job.coverages : []);
    this.overlay.setVisible(this.overlay.visible && !!job, job ? job.coverages : []);
    this.resultShown = false;
  }

  selectContract(id) {
    const job = this.career.job(id);
    this.setJob(job);
    this.screens.close();
    const farm = job.c.farm ? siteById(job.c.farm) : null;
    if (farm && this.site !== farm) {
      const p = this.aircraft.fm.pos;
      const km = Math.hypot(farm.pad.x - p.x, farm.pad.z - p.z) / 1000;
      const brg = Math.round(((Math.atan2(farm.pad.x - p.x, -(farm.pad.z - p.z)) * 180) / Math.PI + 360) % 360);
      this.toast(t('Request accepted: {0}. Fly to {1} ({2} km, heading {3}°) — the local truck loads you there.', job.c.title, farm.farm.name, km.toFixed(1), String(brg).padStart(3, '0')));
      return;
    }
    if (!this.service.inZone()) {
      this.toast(t('Job accepted: {0}. Fly back to the pad for loading.', job.c.title));
      return;
    }
    this.screens.loadSheet(job);
  }

  requestService(fuel, liquid) {
    if (this.service.request(fuel, liquid)) {
      if (this.job) this.job.started = true;
      if (this.mode === 'career' && !this.career.tutorialDone && !this.tutorial.active) this.tutorial.start();
    }
  }

  onServiceStart() { this.sprayer.on = false; }
  onServiceDone(loaded) {
    this.toast(t('Service complete: +{0} L fuel, +{1} L liquid. Aircraft released.', Math.round(loaded.fuel), Math.round(loaded.liquid)));
    if (this.job && loaded.liquid > 0) this.job.sorties++;
    this.audio.play('success');
    this.career.save();
  }

  handIn() {
    const job = this.job;
    if (!job) return;
    // Pull totals from the sprayer into the job before evaluating.
    const r = job.evaluate(this.aircraft.damage);
    this.career.money += r.total;
    this.lastRecord = this.career.record(job, r, this.aircraft, this.replay.finish(job));
    this.replay.attach(this.lastRecord.n);
    if (r.done) {
      const prev = this.career.completed[job.c.id];
      this.career.completed[job.c.id] = { stars: Math.max(r.stars, prev?.stars || 0) };
    }
    this.aircraft.repair();
    this.screens.results(r, job);
    job.reset();
    this.career.save();
    this.setJob(null);
  }

  resetAircraft(where) {
    // A crashed (or written-off) aircraft comes back repaired: placed with
    // 100 % damage it would fail again at once.
    if (this.aircraft.state === 'crashed' || this.aircraft.damage >= 100) return this.recover(where);
    this.sprayer.on = false;
    if (this.service.busy()) this.service.abort(t('Aircraft reset — service stopped.'));
    if (where === 'runway') this.aircraft.placeOnRunway('west');
    else this.aircraft.placeAtPad();
    this.aircraft.stuck = false;
    this.rig.initialized = false;
    this.toast(where === 'runway' ? t('Aircraft placed on runway 09.') : t('Aircraft towed back to the pad.'));
  }

  // After a crash: back to the runway or the base, repaired as new (the
  // recovery cost was charged at the crash). To the runway it keeps the load
  // it had (fuel and hopper, as the badeco left them) and flies on; to the
  // base the hopper is emptied and the badeco loads it again.
  recover(where = 'pad') {
    const ac = this.aircraft;
    const load = this._loadAtCrash ?? { fuel: ac.fm.fuel, hopper: ac.fm.hopper };
    this._loadAtCrash = null;
    this.screens.close();
    this.sprayer.on = false;
    this.service.resetAll();
    ac.repair();
    const toRunway = where === 'runway' && ac.kind !== 'heli';
    ac.fm.fuel = load.fuel;
    ac.fm.hopper = toRunway ? load.hopper : 0;
    ac.fm.updateMass?.();
    if (toRunway) ac.placeOnRunway('west'); else ac.placeAtPad();
    ac.repair();
    ac.stuck = false;
    this.rig.initialized = false;
    this.career.save();
    this.toast(where === 'runway' && ac.kind !== 'heli' ? t('{0} repaired — on runway 09, ready to start.', ac.type.reg) : t('{0} repaired — at the base, ready to start.', ac.type.reg));
  }

  _acEvent(e) {
    if (e.kind === 'crash') {
      this._loadAtCrash = { fuel: this.aircraft.fm.fuel, hopper: this.aircraft.fm.hopper };
      this.sprayer.on = false;
      const cost = 6000;
      this.career.money -= cost;
      this.rig.shake = 1;
      setTimeout(() => this.screens.crash(crashText(e.reason), cost), 2200);
    }
    if (e.kind === 'engineStart' && this.job) this.job.started = true;
  }

  // ------------------------------------------------------------------ frame
  frame() {
    const now = performance.now();
    this.frameMs[this.frameN++ % this.frameMs.length] = now - this.last;
    const rawDt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this._autoQuality(now);
    if (this.frozen) { if (!this.noRender) this.render(); return; }
    this.tick(rawDt);
    this.render();
  }

  // Frame-time statistics over the last n frames: { avg, p95 } in ms.
  frameStats(n = 120) {
    const k = Math.min(n, this.frameN, this.frameMs.length);
    if (!k) return { avg: 0, p95: 0 };
    const a = [];
    for (let i = 1; i <= k; i++) a.push(this.frameMs[(this.frameN - i + this.frameMs.length * 4) % this.frameMs.length]);
    a.sort((x, y) => x - y);
    return { avg: a.reduce((s, v) => s + v, 0) / k, p95: a[Math.min(k - 1, Math.floor(k * 0.95))] };
  }

  // First run only: measure the frame time on the title screen and pick the
  // preset that keeps the game smooth on this machine (the player can change
  // it in Settings; a manual choice turns this off for good).
  _autoQuality(now) {
    const s = this.settings;
    if (!s.qualityAuto || s.autoChecked || this.qualityForced) return;
    this._aqT0 ??= now;
    const el = now - this._aqT0;
    if (el < 2500) { this._aqN0 = this.frameN; return; }
    if (el < 8000) return;
    const st = this.frameStats(Math.max(30, this.frameN - this._aqN0));
    const order = ['low', 'medium', 'high'];
    let i = order.indexOf(s.quality);
    if (st.avg > 30 && i > 0) i--; // under ~33 fps: step down
    else if (st.avg < 12 && st.p95 < 18 && i < 2) i++; // comfortably over 80 fps: step up
    s.autoChecked = true;
    this.autoQualityResult = { ...st, from: s.quality, to: order[i] };
    if (order[i] !== s.quality) {
      this.setSetting('quality', order[i], true);
      this.toast(t('Graphics set to {0} for this device (change it in Settings).', t({ low: 'Low', medium: 'Medium', high: 'High' }[order[i]])));
    } else this.setSetting('autoChecked', true);
  }

  // Run the game logic without rendering (automated validation / fast-forward).
  simulate(seconds, dt = 1 / 60, each) {
    let t = 0;
    while (t < seconds) {
      this.tick(dt, true);
      t += dt;
      if (each && each(t) === false) break;
    }
    return t;
  }

  tick(rawDt, headless = false) {
    this.time += rawDt;
    this.frames++;
    const input = this.input;
    input.pollGamepad();
    this.autopilot?.update(rawDt);
    const modal = this.screens.open;
    // Global keys
    if (this.playing && !this.replay.active) {
      if (input.wasPressed('pause')) {
        if (modal === 'crash') { /* the crash screen needs a choice */ } else if (modal) this.screens.close(); else this.screens.pause();
      } else if (!modal || modal === 'map') {
        if (input.wasPressed('map')) { if (modal === 'map') this.screens.close(); else this.screens.map(); }
      }
      if (!modal) {
        if (input.wasPressed('jobs') && this.mode === 'career') this.screens.board();
        if (input.wasPressed('office') && this.mode === 'career') this.screens.office();
        if (input.wasPressed('help')) this.screens.help();
        if (input.wasPressed('replay') && this.replay.latest() >= 0) this.replay.play(this.replay.latest());
      }
    }
    const paused = (this.playing && (modal === 'pause' || modal === 'settings' || modal === 'help' || modal === 'office')) || this.replay.active;
    const dt = paused ? 0 : rawDt;
    this.controlsLocked = (!!modal && modal !== 'map') || this.replay.active;
    const mouse = input.consumeMouse();
    const ac = this.aircraft;

    if (this.playing && !this.controlsLocked) this._playInput(input);
    this.service.fast = this.playing && input.down.has('KeyT') ? 5 : 1;

    if (dt > 0) {
      if (this.playing) {
        ac.update(dt, input, { mouse, assist: ac.kind === 'heli' ? this.settings.heliAssist : this.settings.assist, heliModel: this.settings.heliModel, windScale: this.settings.wind, cameraMode: this.cameraMode });
      } else {
        ac.update(dt, { ...input, isDown: () => false, wasPressed: () => false, virtual: { active: false } }, { mouse: { buttons: 0, dx: 0, dy: 0, wheel: 0 }, assist: 'normal', windScale: this.settings.wind, cameraMode: 'orbit' });
      }
      this.sprayer.emit(dt);
      this.mist.update(dt, ac.windVec, (x, z) => ac.env.top(x, z));
      this.dust.update(dt, ac.windVec, (x, z) => ac.env.ground(x, z));
      this.guidance.update(dt);
      if (this.playing) this.replay.record(dt);
      if (this.playing && this.weatherCycle.update(dt)) this.world.atmo.set(this.weatherCycle.time, this.weatherCycle.weather);
      this.overlay.update(this.job ? this.job.coverages : []);
      this.service.update(dt);
      this._followSite(dt);
      this.world.structures.update(dt, this.time, ac.windVec, { acPos: ac.fm.pos, light: this.world.atmo.cur.light ?? 1, cam: this.camera.position });
      if (this.job && !ac.fm.out.onGround) this.job.flightTime += dt;
      this.statT -= dt;
      if (this.job && this.statT <= 0) {
        this.statT = 0.25;
        this._syncJobTotals();
        this.jobStats = this.job.stats();
      }
      this.tutorial.update(dt);
      this._autoResults();
    }
    // Presentation (camera, streaming, audio, HUD). Headless fast-forward
    // only refreshes it occasionally.
    this._presT = (this._presT || 0) + rawDt;
    if (!headless || this._presT > 0.5) {
      const pdt = headless ? this._presT : rawDt;
      this._presT = 0;
      if (!this.playing) this.rig.orbit.yaw += pdt * 0.06;
      if (this.replay.active) this.replay.update(pdt, mouse);
      else this.rig.update(pdt, ac, this.playing && !this.controlsLocked ? mouse : { buttons: 0, dx: 0, dy: 0, wheel: 0 }, this.world.terrain);
      // Parked aircraft: drawn only within 1.2 km (a few pixels beyond that).
      for (const p of this._parked) {
        const d = this.camera.position.distanceTo(p.rPos);
        p.model.root.visible = d < 1200;
        if (p.contactShadow) p.contactShadow.visible = d < 400;
      }
      this.service.cull(this.camera.position);
      this.marks.update(pdt, this.camera);
      // Visual wind for vegetation/rain = the aircraft's mean wind (no turbulence).
      windAt(this.world.visualWind, ac.simTime ?? this.time, null, 10, this.settings.wind);
      this.world.atmo.cameraInside = this.rig.mode === 'cockpit';
      this.world.update(this.camera, ac.rPos, pdt, this.time);
      if (!headless) this._audio(rawDt);
      if (this.playing) this._prompts();
      this.hud.update(pdt);
      this.touch.update();
    }
    this.saveT -= rawDt;
    if (this.saveT <= 0 && this.playing) { this.saveT = 15; this.career.save(); }
    input.endFrame();
    void headless;
  }

  _playInput(input) {
    const ac = this.aircraft;
    if (input.wasPressed('spray')) {
      if (ac.state === 'ok') this.sprayer.toggle();
    }
    if (input.wasPressed('camera')) {
      this.cameraMode = this.cameraMode === 'cockpit' ? 'chase' : 'cockpit';
      this.rig.setMode(this.cameraMode, ac);
    }
    if (input.wasPressed('orbit')) {
      this.cameraMode = this.cameraMode === 'orbit' ? 'chase' : 'orbit';
      this.rig.setMode(this.cameraMode, ac);
    }
    if (input.wasPressed('coverage')) {
      const v = !this.overlay.visible;
      if (!this.job) this.toast(t('Coverage view needs an active job.'));
      this.overlay.setVisible(v && !!this.job, this.job ? this.job.coverages : []);
      if (this.job) this.toast(v ? t('Coverage overlay on (red = not covered, green = good, purple = overlap).') : t('Coverage overlay off.'));
    }
    if (input.wasPressed('interact')) this._interact();
    if (input.wasPressed('gps')) this.hud.toggleGps();
    if (input.wasPressed('reset')) {
      if (ac.state === 'crashed') { if (this.screens.open !== 'crash') this.screens.crash(crashText(ac.crashReason ?? 'Crashed'), 0); return; }
      this.resetAircraft('pad');
    }
  }

  _atPadStopped() {
    const ac = this.aircraft, fm = ac.fm;
    return this.service.inZone() && fm.engine === 'off' && fm.out.groundSpeed < 0.3 && ac.state === 'ok' && !this._rotorTurning();
  }

  // Helicopter: the crew does not approach until the main rotor has stopped.
  _rotorTurning() {
    const ac = this.aircraft;
    return ac.kind === 'heli' && ac.fm.out.rotorPct > 0.5;
  }

  _interact() {
    if (!this._atPadStopped() || this.service.busy()) return;
    if (this.mode === 'career') {
      if (!this.job) return this.screens.board();
      if (this.job.complete()) return this.handIn();
      return this.screens.loadSheet(this.job);
    }
    this.screens.loadSheet(null);
  }

  _autoResults() {
    if (!this.job || this.resultShown || !this.job.complete()) return;
    if (this._atPadStopped() && !this.service.busy() && !this.screens.open) {
      this.resultShown = true;
      this.handIn();
    }
  }

  _syncJobTotals() {
    // Sprayer totals are cumulative since the job was set; mirror them into the job.
    const sp = this.sprayer;
    const j = this.job;
    if (!this._lastSp || this._lastJob !== j) { this._lastSp = { s: sp.sprayed, o: sp.offTarget, l: sp.lost }; this._lastJob = j; }
    j.sprayed += sp.sprayed - this._lastSp.s;
    j.offTarget += sp.offTarget - this._lastSp.o;
    j.lost += sp.lost - this._lastSp.l;
    this._lastSp = { s: sp.sprayed, o: sp.offTarget, l: sp.lost };
  }

  _prompts() {
    const ac = this.aircraft, fm = ac.fm;
    const k = (a) => this.hud.key(a);
    if (this.screens.open) return this.hud.setPrompt(null);
    if (ac.state === 'crashed') return this.hud.setPrompt(t('{0} Recover the aircraft (runway / base)', k('reset')), () => this.screens.crash(crashText(ac.crashReason ?? 'Crashed'), 0));
    if (ac.stuck) return this.hud.setPrompt(t('Aircraft stuck — {0} tow back to the pad', k('reset')), () => this.resetAircraft('pad'));
    if (this._atPadStopped() && !this.service.busy()) {
      if (this.mode === 'career') {
        if (!this.job) return this.hud.setPrompt(this.site.main ? t('{0} Service orders · {1} Office computer', k('interact'), k('office')) : t('{0} Service orders', k('interact')), () => this._interact());
        if (this.job.complete()) return this.hud.setPrompt(t('{0} Hand in the job', k('interact')), () => this._interact());
        return this.hud.setPrompt(t('{0} Load sheet — call the badeco', k('interact')), () => this._interact());
      }
      return this.hud.setPrompt(t('{0} Service (fuel &amp; liquid)', k('interact')), () => this._interact());
    }
    if (this.mode === 'career' && fm.engine === 'off' && !this._rotorTurning() && this.atMainBase() && !this.service.busy()) return this.hud.setPrompt(t('{0} Office computer (requests from other farms)', k('office')), () => this.screens.office());
    if (fm.engine === 'off' && this._rotorTurning() && fm.out.onGround) return this.hud.setPrompt(t('Rotor running down ({0} %) — crew waits for it to stop', Math.round(fm.out.rotorPct)));
    const pw = ac.kind === 'heli' && fm.powerModel === 'power';
    if (fm.engine === 'off' && fm.out.onGround && !this.service.busy()) return this.hud.setPrompt(ac.kind === 'heli' ? t(pw ? 'Power down, hold {0} to start' : 'Collective down, hold {0} to start', k('engine')) : t('Hold {0} to start the engine', k('engine')));
    if (fm.engine === 'running' && fm.out.onGround && this.service.inZone() && fm.out.groundSpeed < 0.3 && (this.job || this.mode === 'free')) {
      return this.hud.setPrompt(ac.kind === 'heli' ? t(pw ? 'Power down — tap {0} to shut down for service' : 'Collective down — tap {0} to shut down for service', k('engine')) : t('Tap {0} to shut down for service', k('engine')));
    }
    this.hud.setPrompt(null);
  }

  warnings() {
    const out = [];
    const ac = this.aircraft;
    if (!this.playing || ac.state !== 'ok') return out;
    const tm = ac.telemetry();
    const fm = ac.fm, o = fm.out;
    if (tm.stall > 0.5 && !o.onGround) out.push({ text: t('Stall'), cls: 'blink' });
    if (ac.kind === 'heli') {
      if (o.lowRotor) out.push({ text: t('Low rotor RPM {0} % — lower collective', Math.round(o.rotorPct)), cls: 'blink' });
      else if (fm.engine === 'running' && o.rotorPct > 108) out.push({ text: t('Rotor overspeed {0} %', Math.round(o.rotorPct)), cls: 'amber' });
      if (fm.engine !== 'running' && !o.onGround && o.rotorPct > 5) out.push({ text: t('Engine out — autorotate'), cls: 'blink' });
      if (o.vrs > 0.3) out.push({ text: t('Settling with power — forward speed'), cls: 'amber blink' });
    }
    if (!o.onGround && o.agl < 6 && o.vs < -3.5) out.push({ text: ac.kind === 'heli' ? (fm.powerModel === 'power' ? t('Sink rate — more power') : t('Sink rate — collective')) : t('Sink rate — pull up'), cls: 'blink' });
    if (tm.ias > ac.type.vspeeds.vne) out.push({ text: t('Overspeed'), cls: 'amber' });
    if (!o.onGround && o.agl < 30) {
      // Power line ahead?
      const f = ac.forward();
      const p = fm.pos;
      const pts = POWERLINE.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        for (let s = 0; s <= 1; s += 0.25) {
          const x = ax + (bx - ax) * s, z = az + (bz - az) * s;
          const dx = x - p.x, dz = z - p.z;
          const d = Math.hypot(dx, dz);
          if (d < 220 && (dx * f.x + dz * f.z) / d > 0.6) { out.push({ text: t('Wires ahead'), cls: 'amber blink' }); i = 99; break; }
        }
      }
    }
    if (this.sprayer.on && !o.onGround) {
      const hh = tm.hgt;
      if (hh < 1.5) out.push({ text: t('Too low {0} m', hh.toFixed(1)), cls: 'blink' });
      else if (hh > 8) out.push({ text: t('Too high to spray ({0} m)', hh.toFixed(0)), cls: 'amber' });
      if (this.job && !this._overTarget()) out.push({ text: t('Spraying off target'), cls: 'amber' });
    }
    if (this.sprayer.on && o.onGround) out.push({ text: t('Spray on the ground'), cls: 'amber' });
    if (tm.fuel < ac.A.fuelCapacity * 0.12 && fm.engine === 'running') out.push({ text: t('Low fuel'), cls: 'amber' });
    if (tm.damage > 50) out.push({ text: t('Damage {0}%', Math.round(tm.damage)), cls: 'amber' });
    return out;
  }

  _overTarget() {
    const p = this.aircraft.fm.pos;
    return this.job.fields.some((f) => p.x > f.x0 - 15 && p.x < f.x1 + 15 && p.z > f.z0 - 15 && p.z < f.z1 + 15);
  }

  _audio(dt) {
    const ac = this.aircraft, fm = ac.fm, o = fm.out;
    const camD = this.camera.position.distanceTo(ac.rPos);
    const baseD = Math.hypot(this.camera.position.x - BASE.pad.x, this.camera.position.z - BASE.pad.z);
    const svcD = this.camera.position.distanceTo(this.service.badeco.pos);
    this.audio.update(dt, {
      rpm: fm.rpm, engine: fm.engine, throttle: fm.throttle, airspeed: o.airspeed, groundSpeed: o.groundSpeed,
      onGround: o.onGround, surface: o.surface, stall: this.playing ? Math.max(o.stall, o.stallWarn) : 0, spraying: this.sprayer.on && this.sprayer.flowNow > 0,
      inside: this.cameraMode === 'cockpit' && this.playing, attached: this.cameraMode !== 'orbit', listenerDist: this.cameraMode === 'cockpit' ? 0 : Math.max(0, camD - 12),
      rough: ac.damage > 55, pumpOn: this.service.pumpOn, serviceAtt: 1 / (1 + svcD / 15),
      profile: ac.type.audio.profile, blades: ac.type.audio.blades, ng: fm.ng, power: ac.A.turbine ? fm.shaftPower / ac.A.maxPower : fm.throttle, itt: fm.itt,
      rotorPct: fm.out.rotorPct ?? 0, rotorRpm: fm.rotorRpm ?? 0, tailGear: ac.A.tailRotor?.gear ?? 0, vs: o.vs, collective: fm.collective ?? 0, vrs: o.vrs ?? 0,
      ambience: (1 - smoothstep(150, 700, baseD)) * (this.camera.position.y < 80 ? 1 : 0.3),
      weather: this.world.atmo.audioLevels(),
      tractor: this.world.farm.root.visible ? 1 / (1 + this.camera.position.distanceTo(this.world.farm.root.position) / 25) * (this.camera.position.distanceTo(this.world.farm.root.position) < 500 ? 1 : 0) : 0,
      hangar: Math.max(0, 1 - Math.hypot(this.camera.position.x - BASE.hangar.x, this.camera.position.z - BASE.hangar.z) / 45) * (this.cameraMode === 'cockpit' && ac.fm.engine === 'running' ? 0.3 : 1),
      truck: this.service.truck?.audioState(this.camera.position),
    });
  }

  render() {
    const r = this.renderer;
    r.autoClear = false;
    r.clear();
    r.render(this.world.sky.skyScene, this.camera);
    r.clearDepth();
    r.render(this.scene, this.camera);
  }
}

export { money, GAME, CONTRACT_FIELDS };
