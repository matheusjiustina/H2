// AGRO WINGS — game shell: boot, main loop, modes, job flow, prompts, warnings.
import * as THREE from 'three';
import { World } from '../world/world.js';
import { QUALITY, GAME, SPRAY } from '../config.js';
import { AIRCRAFT_ORDER } from '../aircraft/types.js';
import { Input } from '../core/input.js';
import { ParticlePool } from '../core/particles.js';
import { Aircraft } from '../aircraft/aircraft.js';
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
import { BASE, POWERLINE, CONTRACT_FIELDS } from '../world/layout.js';
import { smoothstep } from '../core/math.js';
import { Autopilot } from './autopilot.js';

const SETTINGS = 'agrowings.settings.v1';

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
    this.settings = { quality: 'medium', assist: 'normal', wind: 1, volume: 0.8, showFps: false, aircraft: 'ipanema' };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS) || '{}')); } catch { /* defaults */ }
    const q = new URLSearchParams(location.search).get('q');
    if (q && QUALITY[q]) this.settings.quality = q;
  }

  createRenderer() {
    const ctx = this.canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance', stencil: false });
    if (!ctx) throw new Error('WebGL2 is not available on this device.');
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
    this.world = new World(this.renderer, this.scene, this.quality);
    await this.world.build((label) => {
      si = Math.max(si, steps.indexOf(label) + 1);
      this.screens.setLoading(si / (steps.length + 2), label);
    });
    this.screens.setLoading(0.85, 'Aircraft');
    await new Promise((r) => setTimeout(r, 0));
    // Both aircraft live in the world; the one not selected waits parked.
    this.fleet = {};
    for (const id of AIRCRAFT_ORDER) {
      const ac = new Aircraft(this, { type: id });
      ac.fm.fuel = ac.type.loads.boot; ac.fm.hopper = 0; ac.fm.updateMass();
      this.fleet[id] = ac;
    }
    this.rig = new CameraRig(this.camera);
    this.sprayer = new Sprayer(this);
    this.guidance = new Guidance(this);
    this.overlay = new CoverageOverlay(this);
    this.service = new GroundService(this);
    this.mist = new ParticlePool(SPRAY.maxParticles[this.settings.quality], { renderOrder: 22 });
    this.dust = new ParticlePool(1500, { renderOrder: 21 });
    this.scene.add(this.mist.points, this.dust.points);
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
    this.screens.setLoading(1, 'Ready');
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
  setSetting(k, v) {
    this.settings[k] = v;
    try { localStorage.setItem(SETTINGS, JSON.stringify(this.settings)); } catch { /* ignore */ }
    if (k === 'quality') {
      this.quality = QUALITY[v];
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.quality.pixelRatio);
      this.world.setQuality(this.quality);
      this.mist.limit = Math.min(this.mist.max, SPRAY.maxParticles[v]);
      this.resize();
    }
    if (k === 'volume') this.audio.setVolume(v);
  }

  // Debug/validation: fly the current job hands-off through the normal inputs.
  startAutopilot(plan = 'contract') {
    this.autopilot = new Autopilot(this);
    this.autopilot.engage(plan);
    return this.autopilot;
  }

  // Make `id` the flown aircraft (placed on the pad, inputs and spray hooked
  // up); every other aircraft is parked and becomes an obstacle.
  _activate(id) {
    const next = this.fleet[id];
    for (const ac of Object.values(this.fleet)) {
      if (ac === next) continue;
      ac.onSimStep = null; ac.onEvent = null;
      ac.park(BASE.parking);
    }
    this.aircraft = next;
    this.aircraftId = id;
    next.parked = false;
    next.onSimStep = (h) => this.sprayer.step(h);
    next.onEvent = (e) => this._acEvent(e);
    next.placeAtPad();
    next.stuck = false;
    this.world.extraObstacle = (x, y, z) => {
      for (const ac of Object.values(this.fleet)) if (ac !== this.aircraft && ac.hitTest(x, y, z)) return `parked ${ac.type.reg}`;
      return null;
    };
  }

  // Aircraft selection (title screen). Fuel, hopper and damage stay with
  // each aircraft; the chosen one is towed to the pad.
  selectAircraft(id) {
    if (!this.fleet[id] || id === this.aircraftId) return;
    if (this.service.busy()) this.service.abort('Aircraft change — service stopped.');
    this.sprayer.on = false;
    this._activate(id);
    this.setSetting('aircraft', id);
    if (this.job) this.guidance.setJob(this.job);
    this.rig.setMode(this.rig.mode, this.aircraft);
    if (this.rig.mode === 'orbit') this.rig.orbit.dist = this.aircraft.type.camera.orbit;
    this.audio?.play('ui');
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
        this.toast(`Free flight in ${this.aircraft.type.reg}: tanks loaded. Hold Q to start the engine.`);
        break;
      case 'freeAir':
        this._enterPlay('free');
        this.setJob(null);
        this.aircraft.repair();
        { const L = this.aircraft.type.loads.free; this.aircraft.fm.fuel = L.fuel; this.aircraft.fm.hopper = L.hopper; }
        this.aircraft.placeAirborne(-200, -280, Math.PI / 2, 120, 48 * (this.aircraft.A.assistSpeedScale ?? 1));
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
    this.guidance.setJob(job);
    this.sprayer.setTargets(job ? job.coverages : []);
    this.overlay.setVisible(this.overlay.visible && !!job, job ? job.coverages : []);
    this.resultShown = false;
  }

  selectContract(id) {
    const job = this.career.job(id);
    this.setJob(job);
    this.screens.close();
    if (!this.service.inZone()) {
      this.toast(`Job accepted: ${job.c.title}. Fly back to the pad for loading.`);
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
    this.toast(`Service complete: +${Math.round(loaded.fuel)} L fuel, +${Math.round(loaded.liquid)} L liquid. Aircraft released.`);
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
    this.career.history.push({ id: job.c.id, total: r.total, coverage: r.coverage, stars: r.stars, t: Date.now() });
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
    this.sprayer.on = false;
    if (this.service.busy()) this.service.abort('Aircraft reset — service stopped.');
    if (where === 'runway') this.aircraft.placeOnRunway('west');
    else this.aircraft.placeAtPad();
    this.aircraft.stuck = false;
    this.rig.initialized = false;
    this.toast(where === 'runway' ? 'Aircraft placed on runway 09.' : 'Aircraft towed back to the pad.');
  }

  recover() {
    const ac = this.aircraft;
    ac.repair();
    ac.fm.hopper = 0;
    ac.placeAtPad();
    this.sprayer.on = false;
    this.rig.initialized = false;
    this.career.save();
  }

  _acEvent(e) {
    if (e.kind === 'crash') {
      this.sprayer.on = false;
      const cost = 6000;
      this.career.money -= cost;
      this.rig.shake = 1;
      setTimeout(() => this.screens.crash(e.reason, cost), 2200);
    }
    if (e.kind === 'engineStart' && this.job) this.job.started = true;
  }

  // ------------------------------------------------------------------ frame
  frame() {
    const now = performance.now();
    const rawDt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.frozen) { if (!this.noRender) this.render(); return; }
    this.tick(rawDt);
    this.render();
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
    if (this.playing) {
      if (input.wasPressed('pause')) {
        if (modal) this.screens.close(); else this.screens.pause();
      } else if (!modal || modal === 'map') {
        if (input.wasPressed('map')) { if (modal === 'map') this.screens.close(); else this.screens.map(); }
      }
      if (!modal) {
        if (input.wasPressed('jobs') && this.mode === 'career') this.screens.board();
        if (input.wasPressed('help')) this.screens.help();
      }
    }
    const paused = this.playing && (modal === 'pause' || modal === 'settings' || modal === 'help');
    const dt = paused ? 0 : rawDt;
    this.controlsLocked = !!modal && modal !== 'map';
    const mouse = input.consumeMouse();
    const ac = this.aircraft;

    if (this.playing && !this.controlsLocked) this._playInput(input);
    this.service.fast = this.playing && input.down.has('KeyT') ? 5 : 1;

    if (dt > 0) {
      if (this.playing) {
        ac.update(dt, input, { mouse, assist: this.settings.assist, windScale: this.settings.wind, cameraMode: this.cameraMode });
      } else {
        ac.update(dt, { ...input, isDown: () => false, wasPressed: () => false, virtual: { active: false } }, { mouse: { buttons: 0, dx: 0, dy: 0, wheel: 0 }, assist: 'normal', windScale: this.settings.wind, cameraMode: 'orbit' });
      }
      this.sprayer.emit(dt);
      this.mist.update(dt, ac.windVec, (x, z) => ac.env.top(x, z));
      this.dust.update(dt, ac.windVec, (x, z) => ac.env.ground(x, z));
      this.guidance.update(dt);
      this.overlay.update(this.job ? this.job.coverages : []);
      this.service.update(dt);
      this.world.structures.update(dt, this.time, ac.windVec);
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
      this.rig.update(pdt, ac, this.playing && !this.controlsLocked ? mouse : { buttons: 0, dx: 0, dy: 0, wheel: 0 }, this.world.terrain);
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
      if (!this.job) this.toast('Coverage view needs an active job.');
      this.overlay.setVisible(v && !!this.job, this.job ? this.job.coverages : []);
      if (this.job) this.toast(v ? 'Coverage overlay on (red = not covered, green = good, purple = overlap).' : 'Coverage overlay off.');
    }
    if (input.wasPressed('interact')) this._interact();
    if (input.wasPressed('reset')) {
      if (ac.state === 'crashed') return;
      this.resetAircraft('pad');
    }
  }

  _atPadStopped() {
    const fm = this.aircraft.fm;
    return this.service.inZone() && fm.engine === 'off' && fm.out.groundSpeed < 0.3 && this.aircraft.state === 'ok';
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
    if (ac.state === 'crashed' || this.screens.open) return this.hud.setPrompt(null);
    if (ac.stuck) return this.hud.setPrompt(`Aircraft stuck — ${k('reset')} tow back to the pad`, () => this.resetAircraft('pad'));
    if (this._atPadStopped() && !this.service.busy()) {
      if (this.mode === 'career') {
        if (!this.job) return this.hud.setPrompt(`${k('interact')} Service orders`, () => this._interact());
        if (this.job.complete()) return this.hud.setPrompt(`${k('interact')} Hand in the job`, () => this._interact());
        return this.hud.setPrompt(`${k('interact')} Load sheet — call the badeco`, () => this._interact());
      }
      return this.hud.setPrompt(`${k('interact')} Service (fuel &amp; liquid)`, () => this._interact());
    }
    if (fm.engine === 'off' && fm.out.onGround && !this.service.busy()) return this.hud.setPrompt(`Hold ${k('engine')} to start the engine`);
    if (fm.engine === 'running' && fm.out.onGround && this.service.inZone() && fm.out.groundSpeed < 0.3 && (this.job || this.mode === 'free')) {
      return this.hud.setPrompt(`Tap ${k('engine')} to shut down for service`);
    }
    this.hud.setPrompt(null);
  }

  warnings() {
    const out = [];
    const ac = this.aircraft;
    if (!this.playing || ac.state !== 'ok') return out;
    const t = ac.telemetry();
    const fm = ac.fm, o = fm.out;
    if (t.stall > 0.5 && !o.onGround) out.push({ text: 'Stall', cls: 'blink' });
    if (!o.onGround && o.agl < 6 && o.vs < -3.5) out.push({ text: 'Sink rate — pull up', cls: 'blink' });
    if (t.ias > ac.type.vspeeds.vne) out.push({ text: 'Overspeed', cls: 'amber' });
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
          if (d < 220 && (dx * f.x + dz * f.z) / d > 0.6) { out.push({ text: 'Wires ahead', cls: 'amber blink' }); i = 99; break; }
        }
      }
    }
    if (this.sprayer.on && !o.onGround) {
      const hh = t.hgt;
      if (hh < 1.5) out.push({ text: `Too low ${hh.toFixed(1)} m`, cls: 'blink' });
      else if (hh > 8) out.push({ text: `Too high to spray (${hh.toFixed(0)} m)`, cls: 'amber' });
      if (this.job && !this._overTarget()) out.push({ text: 'Spraying off target', cls: 'amber' });
    }
    if (this.sprayer.on && o.onGround) out.push({ text: 'Spray on the ground', cls: 'amber' });
    if (t.fuel < ac.A.fuelCapacity * 0.12 && fm.engine === 'running') out.push({ text: 'Low fuel', cls: 'amber' });
    if (t.damage > 50) out.push({ text: `Damage ${Math.round(t.damage)}%`, cls: 'amber' });
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
      ambience: (1 - smoothstep(150, 700, baseD)) * (this.camera.position.y < 80 ? 1 : 0.3),
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
