// AGRO WINGS — game shell: boot, main loop, modes, job flow, prompts, warnings.
import * as THREE from 'three';
import { World } from '../world/world.js';
import { GAME } from '../config.js';
import { AircraftAssets } from '../aircraft/assetManager.js';
import { Lifecycle } from '../core/lifecycle.js';
import { PerfManager } from '../core/perfManager.js';
import { PROFILES } from '../core/perfProfiles.js';
import { AIRCRAFT_ORDER, aircraftType, setRegistration } from '../aircraft/types.js';
import { Input, KEY_SCHEMES, DEFAULT_KEY_SCHEME, keyLabel } from '../core/input.js';
import { ParticlePool } from '../core/particles.js';
import { Aircraft } from '../aircraft/aircraft.js';
import { Helicopter } from '../aircraft/helicopter.js';
import { CameraRig, EYE_RANGE } from '../aircraft/cameras.js';
import { Sprayer } from '../spray/sprayer.js';
import { Guidance } from '../spray/guidance.js';
import { CoverageOverlay } from '../spray/overlay.js';
import { GroundService } from '../crew/service.js';
import { GameAudio } from '../audio/audio.js';
import { ipanemaAudioState } from '../audio/ipanemaEngine.js';
import { HUD } from '../ui/hud.js';
import { Screens, money } from '../ui/screens.js';
import { TouchControls } from '../ui/touch.js';
import { Showroom } from '../ui/showroom.js';
import { Career } from './contracts.js';
import { Tutorial } from './tutorial.js';
import { ReplayManager } from './replay.js';
import { WeatherCycle } from '../world/weatherCycle.js';
import { GroundMarks } from '../world/groundMarks.js';
import { BASE, POWERLINE, CONTRACT_FIELDS, MAIN_SITE, SITES, nearestSite, siteById, stripAllows } from '../world/layout.js';
import { smoothstep } from '../core/math.js';
import { Autopilot } from './autopilot.js';
import { HeliAutopilot } from './heliAutopilot.js';
import { allAids, PLANE_AIDS, HELI_AIDS, minSpeed } from '../flight/pilotAid.js';
import { windAt } from '../flight/env.js';
import { FlightModel } from '../flight/flightModel.js';
import { t } from '../i18n/index.js';
import { aircraftUnlocked } from './expansions.js';
import { FireField } from '../world/fires.js';
import { WaterFx } from '../world/waterFx.js';
import { FireJobs } from './fireJobs.js';

const SETTINGS = 'agrowings.settings.v1';
const GPS_PAGE_NAMES = { map: 'MAP', dest: 'DESTINATION', mission: 'MISSION', cov: 'COVERAGE' };

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
    this.settings = { quality: 'medium', assist: 'off', wind: 1, volume: 0.8, showFps: false, aircraft: 'ipanema', keyScheme: DEFAULT_KEY_SCHEME, heliAssist: 'off', heliModel: 'power', aidPlane: allAids(PLANE_AIDS), aidHeli: allAids(HELI_AIDS), assistV: 2, b206Livery: 0, b206Kit: true, m18Livery: 0, e203Livery: 0, a188Livery: 0, r44Livery: 1, eyeHeight: 0, touchMode: 'stick', tiltSens: 1, touchStrip: true, regs: {}, timeOfDay: 'morning', weather: 'partly', hudGps: false, shake: 1, qualityAuto: true, autoChecked: false, profile: null, fpsLimit: 0, autoLast: null };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS) || '{}')); } catch { /* defaults */ }
    // Assistance is off or on (the old Normal / High control laws are gone
    // from the settings): older saves start without assistance.
    if (this.settings.assistV !== 2) Object.assign(this.settings, { assist: 'off', heliAssist: 'off', assistV: 2 });
    for (const k of ['assist', 'heliAssist']) if (this.settings[k] !== 'on') this.settings[k] = 'off';
    this.settings.aidPlane = { ...allAids(PLANE_AIDS), ...this.settings.aidPlane };
    this.settings.aidHeli = { ...allAids(HELI_AIDS), ...this.settings.aidHeli };
    // Graphics profile (Adaptive Performance System): settings, ?q= and old
    // saves are resolved here; the renderer-dependent part runs in boot().
    this.perf = new PerfManager(this);
    this.qualityForced = this.perf.forced;
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
    this.quality = this.perf.quality;
    this.renderer = this.createRenderer();
    this.perf.init(); // capabilities, starting profile, pixel ratio (Ultra Original: min(dpr, 2) × 1.5 as before)
    this.quality = this.perf.quality;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 30000);
    this.input = new Input(this.canvas);
    this._applyKeyScheme();
    this.world = new World(this.renderer, this.scene, this.quality);
    await this.world.build((label) => {
      si = Math.max(si, steps.indexOf(label) + 1);
      this.screens.setLoading(si / (steps.length + 2), t(label));
    });
    this.world.streamHints = () => ({ site: this.site, job: this.job });
    this.marks = new GroundMarks(this.scene, this.world.terrain);
    this.weatherCycle = new WeatherCycle(this);
    this._startWeather(true);
    this.screens.setLoading(0.85, t('Aircraft'));
    await new Promise((r) => setTimeout(r, 0));
    // Both aircraft live in the world; the one not selected waits parked.
    this.fleet = {};
    // The player's registration marks, before the liveries are painted.
    for (const [id, r] of Object.entries(this.settings.regs ?? {})) if (!setRegistration(id, r)) delete this.settings.regs[id];
    for (const id of AIRCRAFT_ORDER) {
      // Each aircraft gets its own controller and physics by kind.
      const ac = aircraftType(id).kind === 'heli' ? new Helicopter(this, { type: id }) : new Aircraft(this, { type: id });
      ac.fm.fuel = ac.type.loads.boot; ac.fm.hopper = 0; ac.fm.updateMass();
      this.fleet[id] = ac;
    }
    this._applyAircraftOptions();
    this.assets = new AircraftAssets(this);
    this.assets.register();
    this.rig = new CameraRig(this.camera);
    this.rig.shakeScale = this.settings.shake;
    this.rig.eyeHeight = Math.max(-EYE_RANGE, Math.min(EYE_RANGE, +this.settings.eyeHeight || 0));
    this.settings.eyeHeight = this.rig.eyeHeight;
    this.sprayer = new Sprayer(this);
    this.guidance = new Guidance(this);
    this.replay = new ReplayManager(this);
    this.overlay = new CoverageOverlay(this);
    this.service = new GroundService(this);
    this.mist = new ParticlePool(PROFILES.ultra.particles, { renderOrder: 22 }); // capacity of the largest profile; the limit follows the profile
    this.dust = new ParticlePool(1500, { renderOrder: 21 });
    this.scene.add(this.mist.points, this.dust.points);
    this.world.dust = this.dust;
    this.world.mist = this.mist;
    // Fire-suppression test scenario (active while the Fire Boss is flown).
    this.fires = new FireField(this.scene, this.world.terrain);
    this.waterFx = new WaterFx(this.scene); // splash, spray and wake of the amphibians
    this.waterFx.setQuality(this.perf.profile.particles);
    this.fires.setQuality?.(this.perf.profile.particles);
    this.fireJobs = new FireJobs(this); // fire-fighting service orders (Fire Boss)
    this.mist.limit = this.perf.profile.particles;
    this.audio = new GameAudio();
    this.audio.setVolume(this.settings.volume);
    this.career = new Career();
    this.career.onSave = () => this._resumePoint();
    this.hud = new HUD(this, this.uiRoot);
    this.touch = new TouchControls(this, this.uiRoot);
    this.tutorial = new Tutorial(this);
    // A premium aircraft that is not unlocked never starts as the flown one.
    const start = this.fleet[this.settings.aircraft] && aircraftUnlocked(aircraftType(this.settings.aircraft)) ? this.settings.aircraft : AIRCRAFT_ORDER[0];
    this._activate(start);
    this.canStartEngine = () => this.service.engineVeto();
    this.lifecycle = new Lifecycle(this); // visibility, orientation / resize, WebGL context loss, audio interruptions
    const startAudio = () => this.audio.start();
    window.addEventListener('pointerdown', startAudio);
    // A click (no drag) in the cockpit view: switches and soft keys the
    // aircraft's cockpit can pick (the Bell 206's GPS keys).
    this.canvas.addEventListener('pointerdown', (e) => { this._click = { x: e.clientX, y: e.clientY }; });
    this.canvas.addEventListener('pointerup', (e) => {
      const c = this._click;
      this._click = null;
      if (!c || Math.hypot(e.clientX - c.x, e.clientY - c.y) > 6 || this.cameraMode !== 'cockpit') return;
      this.cockpitClick(e.clientX, e.clientY);
    });
    window.addEventListener('keydown', startAudio);
    this.resize();
    this.screens.setLoading(1, t('Ready'));
    this.showroom = new Showroom(this);
    this.showroom.enter();
    this.screens.hideLoading();
    this.screens.showTitle(true);
    this.last = performance.now();
    this.saveT = 0;
    this.statT = 0;
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.perf?.refreshRatio(); // the pixel-count ceiling follows the window; Ultra Original: no change
    this.renderer.setSize(w, h, false);
    if (this.showroom?.active) this.showroom.goal.dist = this.showroom._fitDist(this.showroom.id);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const ph = h * this.renderer.getPixelRatio();
    this.mist?.setScale(ph, 62);
    this.fires?.setScale(ph, 62);
    this.waterFx?.setScale(ph, 62);
    this.dust?.setScale(ph, 62);
  }

  // ------------------------------------------------------------------ settings
  setSetting(k, v, auto = false) {
    this.settings[k] = v;
    if (k === 'quality' && !auto) this.settings.qualityAuto = false;
    if (k === 'profile' || (k === 'quality' && !auto)) this.perf.setProfile(v); // updates settings.profile / quality
    if (k === 'fpsLimit') this.perf.setFpsLimit(v);
    try { localStorage.setItem(SETTINGS, JSON.stringify(this.settings)); } catch { /* ignore */ }
    if (k === 'keyScheme') this._applyKeyScheme();
    if (k === 'touchMode') this.touch?.applySettings();
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
    // Premium expansions: refused here, not only hidden in the UI.
    if (!aircraftUnlocked(aircraftType(id))) id = AIRCRAFT_ORDER.find((k) => aircraftUnlocked(aircraftType(k)));
    const next = this.fleet[id];
    // Parked spots: the helicopter waits on its pad; the airplanes take the
    // west apron spots in order.
    const spots = [BASE.parking, BASE.parking2, BASE.parking3, BASE.parking4, BASE.parking5, BASE.parking6];
    const idOf = (a) => Object.keys(this.fleet).find((k) => this.fleet[k] === a);
    this.assets?.thaw(id);
    for (const ac of Object.values(this.fleet)) {
      if (ac === next) continue;
      this.assets?.thaw(idOf(ac)); // re-parked below: the baked copy is rebuilt
      ac.onSimStep = null; ac.onEvent = null;
      // The AT-802s (18 m span) have their own spots on the grass west of
      // the apron; everyone else keeps the apron spots in order.
      // One helipad: the R44 waits on it while an airplane is flown; the
      // other helicopter (or both, when one of them is flown) is kept in
      // the hangar.
      ac.park(ac.kind === 'heli' ? (ac.type.id === 'r44' && next.kind !== 'heli' ? ac.type.servicePad : BASE.heliHangar) : BASE[ac.type.parkSpot] ?? spots.shift());
    }
    for (const ac of Object.values(this.fleet)) if (ac !== next) this.assets?.freeze(idOf(ac));
    this.aircraft = next;
    this.aircraftId = id;
    next.parked = false;
    // A parked aircraft far from the camera was hidden (distance cull):
    // the one now flown is always drawn.
    next.model.root.visible = true;
    if (next.contactShadow) next.contactShadow.visible = true;
    next.onSimStep = (h) => this.sprayer.step(h);
    next.onEvent = (e) => this._acEvent(e);
    next.placeAtPad();
    next.stuck = false;
    this.perf?.hold(3); // loading a new aircraft is not a performance signal
    this.fires?.setActive(!!next.water);
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

  // Cockpit click at a screen point: hands the ray to the cockpit.
  cockpitClick(cx, cy) {
    const pick = this.aircraft.model.inst?.pick;
    if (!pick) return null;
    const r = this.canvas.getBoundingClientRect();
    (this._ray ??= new THREE.Raycaster()).setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.camera);
    const page = pick(this._ray);
    if (page) this.audio?.play('click');
    return page;
  }

  // Aircraft options (title-screen card): paint schemes (M-18, EMB-203,
  // R44, Bell 206) and the Bell 206's spray kit. Removing the kit drains the
  // tank and drops its mass and drag.
  _applyAircraftOptions() {
    this.fleet?.m18?.model.setLivery?.(this.settings.m18Livery ?? 0);
    this.fleet?.e203?.model.setLivery?.(this.settings.e203Livery ?? 0);
    this.fleet?.a188?.model.setLivery?.(this.settings.a188Livery ?? 0);
    this.fleet?.r44?.model.setLivery?.(this.settings.r44Livery ?? 0);
    const b = this.fleet?.b206;
    if (!b) return;
    b.model.setLivery?.(this.settings.b206Livery ?? 0);
    const on = this.settings.b206Kit !== false;
    b.model.setKit?.(on);
    b.fm.kitOn = on;
    if (!on) { b.fm.hopper = 0; if (this.aircraft === b) this.sprayer.on = false; }
    b.fm.updateMass();
    this.assets?.refreshAll();
  }
  // Registration marks of one aircraft (Settings): only the letters change —
  // the livery canvas and the panel placard are redrawn, nothing else.
  // Returns the marks in force, or null when refused (invalid or in use).
  setRegistration(id, reg) {
    const r = setRegistration(id, reg);
    if (!r) return null;
    const regs = { ...(this.settings.regs ?? {}) };
    if (r === aircraftType(id).reg0) delete regs[id]; else regs[id] = r;
    this.setSetting('regs', regs);
    const ac = this.fleet?.[id];
    ac?.model.setReg?.(r);
    ac?.panel.setReg?.(r);
    this.assets?.refresh(id);
    return r;
  }
  setAircraftOption(k, v) {
    this.setSetting(k, v);
    this._applyAircraftOptions();
    const id = { b206Livery: 'b206', b206Kit: 'b206', m18Livery: 'm18', e203Livery: 'e203', a188Livery: 'a188', r44Livery: 'r44' }[k];
    if (id) this.showroom?.invalidate(id);
    this.audio?.play('ui');
  }

  // Aircraft selection (title screen). Fuel, hopper and damage stay with
  // each aircraft; the chosen one is towed to the pad.
  selectAircraft(id) {
    if (!this.fleet[id] || id === this.aircraftId) return;
    if (this._outro || this._camFly) this._endOutro();
    if (!aircraftUnlocked(aircraftType(id))) {
      this.toast(t('{0}: premium expansion — locked.', aircraftType(id).name));
      this.audio?.play('ui');
      return false;
    }
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

  // On the ground and stopped at a farm office (the main base's hangar or a
  // farm strip's service area): the site, else null. Requests are accepted
  // there, so one job follows another without a flight back to the base.
  officeSite() {
    const fm = this.aircraft.fm;
    if (!fm.out.onGround || fm.out.groundSpeed >= 0.5) return null;
    for (const s of SITES) if (Math.hypot(fm.pos.x - s.hangar.x, fm.pos.z - s.hangar.z) < 260) return s;
    return null;
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

  // The course chosen on the map: a marker and a line on every map.
  setWaypoint(p) {
    this.waypoint = p ? { x: p.x, z: p.z } : null;
    if (p) { const a = this.aircraft.fm.pos, d = Math.hypot(p.x - a.x, p.z - a.z); this.toast(t('Course set: {0}', d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`)); }
    this.hud.miniT = 0;
  }
  // Reached: within 80 m of the marker.
  _waypointUpdate() {
    const w = this.waypoint, a = this.aircraft?.fm.pos;
    if (w && a && Math.hypot(w.x - a.x, w.z - a.z) < 80) { this.waypoint = null; this.toast(t('Course reached')); }
  }
  // Touch camera pill: free = the orbit camera (O), fixed = the chase view.
  setTouchCamera(free) {
    if (free === (this.cameraMode === 'orbit')) return;
    this.cameraMode = free ? 'orbit' : 'chase';
    this.rig.setMode(this.cameraMode, this.aircraft);
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
      case 'continue': this.continueJob(); break;
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
      case 'title': {
        this.screens.close();
        this.screens._clearImpact?.();
        this.playing = false;
        this.mode = 'title';
        this.hud.show(false);
        this.screens.showTitle(true);
        this.career.save();
        const ac = this.aircraft, o = ac.fm.out;
        if (ac.state === 'crashed') { this._toBase(); this.showroom.enter(); } // no wreck (nor report) on the title screen
        else if (!o.onGround || o.groundSpeed > 3) this._startOutro();
        else this.showroom.enter();
        break;
      }
      default: break;
    }
  }

  // Back to the title screen in flight: the flight goes on behind the menu
  // for a few seconds as a cinematic shot — the aircraft glides on its
  // course, kinematic (no physics, nothing to crash into: it eases up over
  // whatever is ahead) — then the camera flies back to the base, where the
  // selected aircraft stands parked for the normal menu.
  _startOutro() {
    const ac = this.aircraft, fm = ac.fm;
    this.sprayer.on = false;
    this.service.resetAll();
    const v = new THREE.Vector3(fm.vel.x, 0, fm.vel.z);
    if (ac.kind !== 'heli' && v.length() < 25) v.setLength(25);
    if (this.cameraMode === 'cockpit' || this.rig.mode === 'cockpit') { this.cameraMode = 'chase'; this.rig.setMode('chase', ac); }
    this._outro = { t: 0, dur: 3.5, vel: v, y: fm.pos.y, fly: null };
  }

  // One frame of the cinematic glide (in place of the aircraft's update).
  _outroGlide(dt) {
    const ac = this.aircraft, fm = ac.fm, o = this._outro, W = this.world;
    fm.pos.x += o.vel.x * dt; fm.pos.z += o.vel.z * dt;
    const ax = fm.pos.x + o.vel.x * 2, az = fm.pos.z + o.vel.z * 2;
    const want = Math.max(o.y, W.clearTopAt(fm.pos.x, fm.pos.z, 14) + 14, W.clearTopAt(ax, az, 14) + 14);
    fm.pos.y += (want - fm.pos.y) * (1 - Math.exp(-2 * dt));
    o.y = Math.max(o.y, fm.pos.y - 2);
    // Wings level, nose along the course.
    if (o.vel.lengthSq() > 1) {
      const lvl = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(o.vel.x, o.vel.z), 0, 'YXZ'));
      fm.quat.slerp(lvl, 1 - Math.exp(-1.2 * dt));
    }
    fm.omega?.set?.(0, 0, 0);
    ac.prevPos.copy(fm.pos); ac.prevQuat.copy(fm.quat);
    ac.rPos.copy(fm.pos); ac.rQuat.copy(fm.quat);
    ac._sync();
    if (!ac.headless) ac._animate?.(dt);
  }

  // The aircraft back at the base, repaired, engine off, as at start-up.
  _toBase() {
    const ac = this.aircraft;
    this._loadAtCrash = null;
    this._crashInfo = null;
    this._crashCam = null;
    this.sprayer.on = false;
    this.service.resetAll();
    ac.repair();
    ac.placeAtPad();
    ac.repair();
    ac.stuck = false;
    if (this.cameraMode !== 'chase') this.cameraMode = 'chase';
    this.rig.initialized = false;
  }

  // End of the glide: the camera's pose now, the aircraft to the base, the
  // showroom framing, and a flight of the camera between the two.
  _outroToBase() {
    const cam = this.camera;
    const from = { p: cam.position.clone(), q: cam.quaternion.clone() };
    this._outro = null;
    this._toBase();
    this.showroom.enter();
    this._camFly = { t: 0, dur: 2.8, from };
  }

  // Applied after the rig has placed the camera for this frame.
  _camFlyStep(dt) {
    const f = this._camFly, cam = this.camera;
    f.t += dt;
    const k = Math.min(1, f.t / f.dur), e = k * k * (3 - 2 * k);
    const to = cam.position.clone(), d = f.from.p.distanceTo(to);
    cam.position.lerpVectors(f.from.p, to, e);
    cam.position.y += Math.sin(Math.PI * e) * Math.min(140, 25 + d * 0.12);
    // Eyes on the aircraft at the base on the way: from the flight's view
    // to looking at it, then into the showroom framing at the end.
    const rigQ = cam.quaternion.clone();
    const look = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(cam.position, this.aircraft.rPos, new THREE.Vector3(0, 1, 0)));
    const sm = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
    cam.quaternion.copy(f.from.q).slerp(look, sm(0, 0.3, k)).slerp(rigQ, sm(0.72, 1, k));
    cam.updateMatrixWorld();
    if (k >= 1) this._camFly = null;
  }

  // Any choice in the menu while the shot runs: straight to the base.
  _endOutro() {
    if (this._outro) { this._outro = null; this._toBase(); this.showroom.enter(); }
    this._camFly = null;
  }

  _enterPlay(mode) {
    this._endOutro();
    this.mode = mode;
    this.playing = true;
    this.showroom?.leave();
    this.screens.showTitle(false);
    this.hud.show(true);
    if (this.rig.mode === 'orbit') { this.rig.setMode('chase', this.aircraft); this.cameraMode = 'chase'; }
    this.canvas.focus();
  }

  setJob(job) {
    // A spray contract with the Bell 206 refits its spray kit.
    if (job && this.aircraft?.type.id === 'b206' && this.settings.b206Kit === false) {
      this.setSetting('b206Kit', true);
      this._applyAircraftOptions();
      this.toast(t('Spray kit fitted for the contract.'));
    }
    this.job = job;
    this.replay.begin(job);
    this.world.activity?.setExcluded(job ? job.fields.map((f) => f.name) : []);
    this.guidance.setJob(job);
    this.sprayer.setTargets(job ? job.coverages : []);
    this.overlay.setVisible(this.overlay.visible && !!job, job ? job.coverages : []);
    this.resultShown = false;
  }

  // What 'Continue where you left off' restores: the contract in hand (with
  // its coverage, saved per job), the aircraft and its load. Recorded on
  // every save while a career job is under way; cleared when it is handed in.
  _resumePoint() {
    const j = this.job, ac = this.aircraft;
    if (this.mode !== 'career' || !j || !ac) return undefined;
    if (!j.started && j.sprayed < 1) return undefined;
    const fm = ac.fm;
    const prev = this.career.resume;
    // A crash or an empty aircraft keeps the last good load.
    if (ac.state === 'crashed') return prev?.job === j.c.id ? prev : undefined;
    return { job: j.c.id, ac: this.aircraftId, fuel: Math.round(fm.fuel * 10) / 10, hopper: Math.round(fm.hopper * 10) / 10, t: Date.now() };
  }

  resumeInfo() {
    const r = this.career.resume;
    if (!r) return null;
    const job = this.career.jobs[r.job];
    if (!job) return null;
    return { ...r, job, pct: Math.round(job.stats().coverage * 100) };
  }

  // Back to the job: same aircraft and load, at the strip nearest its
  // fields (one that takes this aircraft), coverage as it was.
  continueJob() {
    const info = this.resumeInfo();
    if (!info) return;
    if (info.ac && info.ac !== this.aircraftId && this.fleet[info.ac] && aircraftUnlocked(aircraftType(info.ac))) this.selectAircraft(info.ac);
    this._enterPlay('career');
    const job = info.job;
    this.setJob(job);
    job.started = true;
    if (job.c.school) this.tutorial.start(job.c.id);
    let cx = 0, cz = 0;
    for (const f of job.fields) { cx += (f.x0 + f.x1) / 2; cz += (f.z0 + f.z1) / 2; }
    cx /= job.fields.length; cz /= job.fields.length;
    const ok = SITES.filter((s) => s.main || stripAllows(s.farm, this.aircraftId));
    let site = MAIN_SITE, best = Infinity;
    for (const s of ok) { const d = Math.hypot(s.pad.x - cx, s.pad.z - cz); if (d < best) { best = d; site = s; } }
    this.sprayer.on = false;
    this.service.resetAll();
    this.service.setSite(site);
    const ac = this.aircraft;
    ac.repair();
    ac.fm.fuel = Math.min(info.fuel, ac.A.fuelCapacity);
    ac.fm.hopper = Math.min(info.hopper, ac.A.hopperCapacity ?? info.hopper);
    ac.fm.updateMass?.();
    ac.placeAtPad(site);
    ac.stuck = false;
    this.rig.initialized = false;
    this.toast(t('Continuing {0}: {1}% sprayed, {2} L in the hopper, {3} L of fuel — at {4}.', job.c.title, info.pct, Math.round(ac.fm.hopper), Math.round(ac.fm.fuel), site.main ? t('the main base') : site.farm.name));
    this.career.save();
  }

  selectContract(id) {
    const job = this.career.job(id);
    const farm = job.c.farm ? siteById(job.c.farm) : null;
    // A short or narrow strip only takes the aircraft it is cleared for.
    if (farm && !stripAllows(farm.farm, this.aircraftId)) {
      this.toast(t('{0} does not take the {1}: change aircraft at the main base.', farm.farm.name, this.aircraft.type.reg));
      return;
    }
    this.setJob(job);
    this.screens.close();
    // Flight school: the guide starts with the job, every time it is flown.
    if (job.c.school) this.tutorial.start(job.c.id);
    else if (this.tutorial.active && this.tutorial.kind !== 'general') { this.tutorial.active = false; this.hud.setTutorial(null); }
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
      if (this.mode === 'career' && !this.career.tutorialDone && !this.tutorial.active && !this.job?.c.school) this.tutorial.start();
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
    if (this.career.resume?.job === job.c.id) this.career.resume = null;
    this.setJob(null);
    this.career.save();
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
    const cp = where === 'here' ? this._crashInfo : null;
    const toRunway = where === 'runway' && ac.kind !== 'heli';
    ac.fm.fuel = load.fuel;
    ac.fm.hopper = toRunway || cp ? load.hopper : 0;
    ac.fm.updateMass?.();
    let agl = 0;
    if (cp) agl = this._placeAtCheckpoint(ac, cp);
    else if (toRunway) ac.placeOnRunway('west'); else ac.placeAtPad();
    ac.repair();
    ac.stuck = false;
    this._crashInfo = null;
    this.screens._clearImpact?.();
    if (this._crashCam) {
      this.cameraMode = this._crashCam.prev === 'orbit' ? 'chase' : this._crashCam.prev;
      this.rig.setMode(this.cameraMode, ac);
      this._crashCam = null;
    }
    this.rig.initialized = false;
    this.career.save();
    this.toast(cp ? t('{0} repaired — flying again from where it came down: {1} m above the ground, heading {2}°.', ac.type.reg, Math.round(agl), String(Math.round(((cp.heading * 180) / Math.PI + 360) % 360)).padStart(3, '0'))
      : toRunway ? t('{0} repaired — on runway 09, ready to start.', ac.type.reg) : t('{0} repaired — at the base, ready to start.', ac.type.reg));
  }

  // Back in the air at the crash point, heading where it was going, level,
  // at a working speed, clear of everything on the way: the highest ground,
  // crop, tree, building or wire within the span (+12 m) along 120 m behind
  // to 900 m ahead, plus 30 m (never under 40 m above the ground). Not
  // higher than that: the job goes on from there.
  _placeAtCheckpoint(ac, cp) {
    const W = this.world, fx = Math.sin(cp.heading), fz = Math.cos(cp.heading);
    const half = Math.max(4, ...(ac.type.bounds ?? []).map((b) => Math.max(Math.abs(b[0]), Math.abs(b[1]), Math.abs(b[4]), Math.abs(b[5]))));
    const rad = half + 12;
    let top = -Infinity;
    for (let s = -120; s <= 900; s += 20) top = Math.max(top, W.clearTopAt(cp.x + fx * s, cp.z + fz * s, rad));
    const g = W.terrain.heightAt(cp.x, cp.z);
    const agl = Math.max(top + 30, g + 40) - g; // room for a beginner to settle in
    const vs = ac.type.vspeeds ?? {};
    // A working speed (≈ 1.35 Vs1), level and trimmed for it.
    const speed = ac.kind === 'heli' ? 22 : Math.max(36, (vs.vs1 ?? vs.vs0 ?? 55) * 1.35 * 0.5144);
    if (ac.placeAirborneLevel) ac.placeAirborneLevel(cp.x, cp.z, cp.heading, agl, speed);
    else ac.placeAirborne(cp.x, cp.z, cp.heading, agl, speed);
    return agl;
  }

  _acEvent(e) {
    if (e.kind === 'crash' && !this.playing) {
      // Not flying (title screen): no bill, no report — back to the base.
      this._toBase();
      if (this.showroom && !this.showroom.active) this.showroom.enter();
      return;
    }
    if (e.kind === 'crash') {
      this._loadAtCrash = { fuel: this.aircraft.fm.fuel, hopper: this.aircraft.fm.hopper };
      this.sprayer.on = false;
      const ac = this.aircraft, fm = ac.fm, v = fm.vel, hs = Math.hypot(v.x, v.z);
      const cost = GAME.crashCost;
      this.career.money -= cost;
      // The checkpoint: where it came down and where it was going (the
      // flight path, or the nose when it was barely moving).
      this._crashInfo = {
        x: fm.pos.x, z: fm.pos.z, heading: hs > 8 ? Math.atan2(v.x, v.z) : fm.heading(),
        speed: v.length(), fuel: fm.fuel, hopper: fm.hopper, cost, reason: e.reason, time: this.weatherCycle?.time ?? null,
      };
      this.rig.shake = 1;
      // Cinematic: a slow orbit round the wreck behind the report.
      if (!this._crashCam) this._crashCam = { prev: this.cameraMode };
      this.cameraMode = 'orbit';
      this.rig.setMode('orbit', ac);
      Object.assign(this.rig.orbit, { dist: Math.max(16, 1.7 * Math.max(...(ac.type.bounds ?? [[8]]).map((b) => Math.abs(b[0])))), pitch: 0.3 });
      this.screens.impact();
      setTimeout(() => { if (this.playing && this.aircraft.state === 'crashed') this.screens.crash(crashText(e.reason), this._crashInfo); }, 2200);
    }
    if (e.kind === 'engineStart' && this.job) this.job.started = true;
  }

  // ------------------------------------------------------------------ frame
  frame() {
    const now = performance.now();
    if (this.lifecycle?.suspended) { this.last = now; return; } // WebGL context lost: nothing to draw, nothing to integrate
    if (this.perf.gate(now)) return; // optional FPS cap: skip this callback, keep `last`
    const dtMs = now - this.last;
    this.frameMs[this.frameN++ % this.frameMs.length] = dtMs;
    const rawDt = Math.min(0.1, dtMs / 1000);
    this.last = now;
    this.perf.update(now, dtMs);
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

    if (dt > 0 && this._crashCam && ac.state === 'crashed' && this.rig.mode === 'orbit' && !(mouse.buttons & 1)) this.rig.orbit.yaw += dt * 0.16;
    if (dt > 0) {
      if (this._outro) {
        this._outroGlide(dt);
        if ((this._outro.t += dt) >= this._outro.dur) this._outroToBase();
      } else if (this.playing) {
        ac.update(dt, input, { mouse, ...this._controlLaw(ac), heliModel: this.settings.heliModel, windScale: this.settings.wind, cameraMode: this.cameraMode });
      } else {
        ac.update(dt, { ...input, isDown: () => false, wasPressed: () => false, virtual: { active: false } }, { mouse: { buttons: 0, dx: 0, dy: 0, wheel: 0 }, assist: 'normal', windScale: this.settings.wind, cameraMode: 'orbit' });
      }
      this.sprayer.emit(dt);
      this.mist.update(dt, ac.windVec, (x, z) => ac.env.top(x, z));
      this.dust.update(dt, ac.windVec, (x, z) => ac.env.ground(x, z));
      this.fires?.update(dt, ac.windVec);
      this.waterFx?.update(dt, ac, this.camera.position);
      this.fireJobs?.update();
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
      // Menu: the showroom eases the orbit camera onto the aircraft on show
      // (no automatic spin); the player can drag / wheel it.
      const menuCam = !this.playing && !this.replay.active && !modal && this.showroom?.active;
      if (menuCam) this.showroom.update(pdt, mouse);
      if (this.replay.active) this.replay.update(pdt, mouse);
      else {
        const live = this.playing && !this.controlsLocked;
        // Head look / zoom keys ride along with the mouse.
        const ax = (a, b) => (input.isDown(a) ? 1 : 0) - (input.isDown(b) ? 1 : 0);
        const eye = live && this.rig.mode === 'cockpit' ? ax('eyeUp', 'eyeDown') : 0;
        if (live) mouse.keys = { x: ax('lookRight', 'lookLeft'), y: ax('lookUp', 'lookDown'), zoom: ax('zoomOut', 'zoomIn'), reset: input.wasPressed('lookReset'), eye };
        this.rig.update(pdt, !this.playing && this.showroom?.active ? this.showroom.target : ac, live || menuCam ? mouse : { buttons: 0, dx: 0, dy: 0, wheel: 0 }, this.world.terrain);
        if (this._camFly) this._camFlyStep(pdt);
        // The eye height is kept once the keys are let go.
        if (!eye && this.rig.eyeHeight !== this.settings.eyeHeight) {
          const v = (this.rig.eyeHeight = Math.round(this.rig.eyeHeight * 1000) / 1000), cm = Math.round(v * 100);
          this.setSetting('eyeHeight', v);
          if (this.playing) this.toast(t('Pilot eye height: {0} cm', `${cm > 0 ? '+' : ''}${cm}`));
        }
      }
      // Parked aircraft: drawn only within 1.2 km (a few pixels beyond that).
      // The flown aircraft is never culled (it may have been hidden while
      // it waited parked far away).
      if (!this.replay.active) ac.model.root.visible = true;
      for (const p of this._parked) {
        if (p === ac) continue;
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
      this._waypointUpdate();
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
      // The Fire Boss has no booms: the key works its drop door.
      if (ac.state === 'ok') { if (ac.water) ac.water.toggleDrop(); else this.sprayer.toggle(); }
    }
    if (ac.water && ac.state === 'ok') {
      if (input.wasPressed('gear')) ac.water.toggleGear();
      if (input.wasPressed('scoop')) ac.water.toggleProbes();
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
    if (input.wasPressed('gps')) {
      // In the Bell 206's cockpit the key steps the AGROWINGS NAV pages.
      if (this.cameraMode === 'cockpit' && ac.panel.nextPage) { ac.panel.nextPage(); this.toast(t('GPS: {0}', t(GPS_PAGE_NAMES[ac.panel.page]))); }
      else this.hud.toggleGps();
    }
    if (input.wasPressed('reset')) {
      if (ac.state === 'crashed') { if (this.screens.open !== 'crash') this.screens.crash(crashText(ac.crashReason ?? 'Crashed'), this._crashInfo); return; }
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
      // At a farm strip the local office lists that region's requests.
      if (!this.job) return this.site.main ? this.screens.board() : this.screens.office('requests');
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
    if (ac.state === 'crashed') return this.hud.setPrompt(t('{0} Recover the aircraft (runway / base)', k('reset')), () => this.screens.crash(crashText(ac.crashReason ?? 'Crashed'), this._crashInfo));
    if (ac.stuck) return this.hud.setPrompt(t('Aircraft stuck — {0} tow back to the pad', k('reset')), () => this.resetAircraft('pad'));
    if (this._atPadStopped() && !this.service.busy()) {
      if (this.mode === 'career') {
        if (!this.job) return this.hud.setPrompt(this.site.main ? t('{0} Service orders · {1} Office computer', k('interact'), k('office')) : t('{0} Farm office — requests', k('interact')), () => this._interact());
        if (this.job.complete()) return this.hud.setPrompt(t('{0} Hand in the job', k('interact')), () => this._interact());
        return this.hud.setPrompt(t('{0} Load sheet — call the badeco', k('interact')), () => this._interact());
      }
      return this.hud.setPrompt(t('{0} Service (fuel &amp; liquid)', k('interact')), () => this._interact());
    }
    if (this.mode === 'career' && fm.engine === 'off' && !this._rotorTurning() && this.officeSite() && !this.service.busy()) return this.hud.setPrompt(t('{0} Office computer (requests from other farms)', k('office')), () => this.screens.office());
    if (fm.engine === 'off' && this._rotorTurning() && fm.out.onGround) return this.hud.setPrompt(t('Rotor running down ({0} %) — crew waits for it to stop', Math.round(fm.out.rotorPct)));
    const pw = ac.kind === 'heli' && fm.powerModel === 'power';
    if (fm.engine === 'off' && fm.out.onGround && !this.service.busy()) return this.hud.setPrompt(ac.kind === 'heli' ? t(pw ? 'Power down, hold {0} to start' : 'Collective down, hold {0} to start', k('engine')) : t('Hold {0} to start the engine', k('engine')));
    if (fm.engine === 'running' && fm.out.onGround && this.service.inZone() && fm.out.groundSpeed < 0.3 && (this.job || this.mode === 'free')) {
      return this.hud.setPrompt(ac.kind === 'heli' ? t(pw ? 'Power down — tap {0} to shut down for service' : 'Collective down — tap {0} to shut down for service', k('engine')) : t('Tap {0} to shut down for service', k('engine')));
    }
    this.hud.setPrompt(null);
  }

  // The player flies the raw controls, with the pilot aids when assistance
  // is on; only the test autopilot uses the full control laws ('normal' for
  // the airplanes, 'auto' for the helicopters).
  _controlLaw(ac) {
    const heli = ac.kind === 'heli', s = this.settings;
    const auto = this.autopilot?.phase && this.autopilot.phase !== 'done' && (heli ? this.autopilot instanceof HeliAutopilot : this.autopilot instanceof Autopilot);
    if (auto) return { assist: heli ? 'auto' : 'normal', aid: null };
    const on = (heli ? s.heliAssist : s.assist) === 'on';
    return { assist: 'off', aid: on ? (heli ? s.aidHeli : s.aidPlane) : null };
  }
  assistOn(ac = this.aircraft) { return !!this._controlLaw(ac).aid; }
  // Assistance cues (warnings only; nothing is flown for the pilot).
  _aidCues(ac) {
    const fm = ac.fm, o = fm.out, KT = 1.94384, out = [];
    const att = FlightModel.attitude(fm, (this._cueAtt ??= {}));
    if (ac.kind === 'heli') {
      // Drift over the ground in a hover, in the pilot's frame.
      const hdg = fm.heading(), fx = Math.sin(hdg), fz = Math.cos(hdg);
      const vf = fm.vel.x * fx + fm.vel.z * fz, vl = fm.vel.x * fz - fm.vel.z * fx;
      const v = Math.hypot(vf, vl);
      if (o.agl < 15 && v > 0.8 && v < 6) {
        const dir = Math.abs(vf) >= Math.abs(vl) ? (vf > 0 ? t('forward') : t('back')) : (vl > 0 ? t('left') : t('right'));
        out.push({ text: t('Drifting {0} kt {1}', Math.round(v * KT), dir), cls: 'amber' });
      }
      if (o.agl < fm.A.rotor.radius * 1.2 && v < 8) out.push({ text: t('Ground effect — less power to hover'), cls: '' });
      return out;
    }
    // Minimum flying speed for this weight and bank (a level turn needs
    // 1 / cos φ of the weight), and the energy left in a climb.
    const n = 1 / Math.max(0.2, Math.cos(att.bank));
    const vmin = minSpeed(fm, n);
    if (o.stall <= 0.5 && o.airspeed < vmin * 1.12) out.push({ text: t('Slow for the weight — {0} kt minimum: lower the nose', Math.round(vmin * KT)), cls: 'amber blink' });
    else if (att.pitch > 0.3 && fm.vel.y > 0 && o.airspeed < minSpeed(fm, 1) * 1.45) out.push({ text: t('Speed running out in the climb — ease the nose down'), cls: 'amber' });
    return out;
  }

  warnings() {
    const out = [];
    const ac = this.aircraft;
    if (!this.playing || ac.state !== 'ok') return out;
    const tm = ac.telemetry();
    const fm = ac.fm, o = fm.out;
    if (tm.stall > 0.5 && !o.onGround) out.push({ text: t('Stall'), cls: 'blink' });
    if (ac.water) out.push(...this._waterStatus(ac));
    if (this._controlLaw(ac).aid?.cues && !o.onGround && o.agl > 1.5) out.push(...this._aidCues(ac));
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

  // Fire Boss: gear position against the surface below, scoop and drop
  // state, water on board and the nearest test fire.
  _waterStatus(ac) {
    const out = [], fm = ac.fm, o = fm.out, ws = ac.water;
    const wl = ac.env.water(fm.pos.x, fm.pos.z);
    const overWater = wl > -1e8;
    if (!o.onGround && o.agl < 60) {
      if (overWater && fm.gearDown > 0.02) out.push({ text: t('GEAR DOWN — water landing!'), cls: 'blink' });
      else if (!overWater && fm.gearDown < 0.98) out.push({ text: t('GEAR UP — runway landing!'), cls: 'blink' });
    }
    if (fm.gearDown > 0.02 && fm.gearDown < 0.98) out.push({ text: t('Gear in transit'), cls: 'amber' });
    const L = Math.round(fm.hopper);
    if (ws.scooping) out.push({ text: t('Scooping {0} L / {1} L', L, Math.round(ws.scoopLimit())), cls: 'amber' });
    else if (ws.probesCmd) out.push({ text: o.onWater ? t('Probes down — {0}–{1} kt, wings level, gear up', Math.round(fm.A.firefight.scoopMin * 1.944), Math.round(fm.A.firefight.scoopMax * 1.944)) : t('Probes down'), cls: 'amber' });
    if (ws.dropping) out.push({ text: t('Dropping — {0} L left', L), cls: 'amber' });
    if (ws.overload) out.push({ text: t('Too heavy for a water take-off ({0} kg > {1} kg)', Math.round(fm.mass), fm.A.mtowWater), cls: 'blink' });
    // The nearest spot only while a fire-fighting order is accepted (the
    // fires may burn without one; they are not announced then).
    const nf = this.fireJobs?.nearest(fm.pos);
    if (nf && !o.onGround) out.push({ text: t('Fire {0}: {1} m, {2}° · {3} %', nf.fire.id, Math.round(nf.dist), String(Math.round(nf.bearing)).padStart(3, '0'), Math.round(nf.fire.intensity * 100)), cls: '' });
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
      profile: ac.type.audio.profile, blades: ac.type.audio.blades, propGear: ac.type.audio.propGear ?? 1, ng: fm.ng, power: ac.A.turbine || ac.A.radial ? fm.shaftPower / ac.A.maxPower : fm.throttle, itt: fm.itt,
      rotorPct: fm.out.rotorPct ?? 0, rotorRpm: fm.rotorRpm ?? 0, tailGear: ac.A.tailRotor?.gear ?? 0, vs: o.vs, collective: fm.collective ?? 0, vrs: o.vrs ?? 0,
      ambience: (1 - smoothstep(150, 700, baseD)) * (this.camera.position.y < 80 ? 1 : 0.3),
      weather: this.world.atmo.audioLevels(),
      tractor: this.world.farm.root.visible ? 1 / (1 + this.camera.position.distanceTo(this.world.farm.root.position) / 25) * (this.camera.position.distanceTo(this.world.farm.root.position) < 500 ? 1 : 0) : 0,
      hangar: Math.max(0, 1 - Math.hypot(this.camera.position.x - BASE.hangar.x, this.camera.position.z - BASE.hangar.z) / 45) * (this.cameraMode === 'cockpit' && ac.fm.engine === 'running' ? 0.3 : 1),
      truck: this.service.truck?.audioState(this.camera.position),
      ipa: ac.type.audio.profile === 'ipanema'
        ? ipanemaAudioState({ fm, acPos: ac.rPos, camPos: this.camera.position, camInv: this.camera.matrixWorldInverse.elements, inside: this.cameraMode === 'cockpit' && this.playing, dt, cfg: ac.type.audio.cfg })
        : null,
    });
  }

  render() {
    const r = this.renderer;
    r.autoClear = false;
    this.showroom?.beforeRender(); // menu card thumbnails (a corner the frame then draws over)
    r.clear();
    r.render(this.world.sky.skyScene, this.camera);
    r.clearDepth();
    r.render(this.scene, this.camera);
  }
}

export { money, GAME, CONTRACT_FIELDS };
