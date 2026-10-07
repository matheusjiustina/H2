import * as THREE from 'three';
import { GENERATORS, footstep } from './ProceduralSounds.js';
import { clamp, smoothstep, lerp } from '../utils/MathUtils.js';
import { WATERFALL } from '../world/Layout.js';

const SR = 22050;
const LOOPS = ['ocean', 'shore', 'wind', 'rain', 'tarpRain', 'storm', 'jungle', 'night', 'underwater'];
const SURFACES = ['sand', 'grass', 'leaves', 'dirt', 'rock', 'wood', 'metal', 'cloth', 'water', 'swim', 'terrain'];

/**
 * Web Audio graph: master -> compressor; ambience / sfx / music buses with an
 * underwater low-pass; layered ambience mixed from player position, weather, time
 * and water depth; HRTF spatial one-shots and positional loops.
 */
export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.buffers = {};
    this.layers = {};
    this.ready = false;
    this.birdTimer = 2;
    this.gullTimer = 8;
    this._v = new THREE.Vector3();
    this._f = new THREE.Vector3();
    this.radio = null;
    this.fire = null;
    this.engine = null;
    this.waterfall = null;
    settings.onChange(() => this.applyVolumes());
  }

  /** Must be called from a user gesture. */
  async unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    this.master.connect(comp).connect(ctx.destination);
    this.uwFilter = ctx.createBiquadFilter();
    this.uwFilter.type = 'lowpass';
    this.uwFilter.frequency.value = 20000;
    this.uwFilter.Q.value = 0.5;
    this.uwFilter.connect(this.master);
    this.amb = ctx.createGain(); this.amb.connect(this.uwFilter);
    this.sfx = ctx.createGain(); this.sfx.connect(this.uwFilter);
    this.music = ctx.createGain(); this.music.connect(this.uwFilter);
    this.applyVolumes();
    await this._loadManifest();
    // generate procedural placeholders progressively so the main thread stays responsive
    const gen = async (name, fn) => {
      if (this.buffers[name]) return;
      const data = fn(SR);
      const b = ctx.createBuffer(1, data.length, SR);
      b.copyToChannel(data, 0);
      this.buffers[name] = b;
      await new Promise((r) => setTimeout(r, 0));
    };
    for (const name of LOOPS) await gen(name, GENERATORS[name]);
    this._startAmbience();
    for (const name of Object.keys(GENERATORS)) if (!LOOPS.includes(name)) await gen(name, GENERATORS[name]);
    for (const s of SURFACES) for (let k = 0; k < 4; k++) await gen(`step_${s}_${k}`, (sr) => footstep(sr, s, k + 1));
    this.ready = true;
    this._startPositional();
  }

  async _loadManifest() {
    // Optional recorded assets: public/sounds/manifest.json -> { "name": "file.ogg" }
    // opened straight from disk (file://) there is nothing to fetch: procedural sounds only
    if (location.protocol === 'file:') return;
    try {
      const res = await fetch('./sounds/manifest.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const map = await res.json();
      await Promise.all(Object.entries(map).filter(([name, file]) => !name.startsWith('_') && typeof file === 'string' && file).map(async ([name, file]) => {
        try {
          const ab = await (await fetch(`./sounds/${file}`)).arrayBuffer();
          this.buffers[name] = await this.ctx.decodeAudioData(ab);
        } catch { /* keep procedural fallback */ }
      }));
    } catch { /* no manifest: procedural sounds only */ }
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings.values;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.master, t, 0.1);
    this.amb.gain.setTargetAtTime(s.ambience, t, 0.1);
    this.sfx.gain.setTargetAtTime(s.effects, t, 0.1);
    this.music.gain.setTargetAtTime(s.music, t, 0.1);
  }

  _loop(name, dest, { gain = 0, rate = 1, filter = null } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.buffers[name];
    src.loop = true;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    let node = src;
    let f = null;
    if (filter) {
      f = ctx.createBiquadFilter();
      f.type = filter.type; f.frequency.value = filter.freq; f.Q.value = filter.q || 0.7;
      node.connect(f); node = f;
    }
    node.connect(g).connect(dest);
    src.start(ctx.currentTime + Math.random() * 0.1, Math.random() * (src.buffer.duration - 0.1));
    return { src, gain: g, filter: f };
  }

  _startAmbience() {
    for (const name of LOOPS) {
      const filter = name === 'wind' ? { type: 'bandpass', freq: 500, q: 0.8 } : null;
      this.layers[name] = this._loop(name, this.amb, { filter });
    }
  }

  _panner(position, ref = 3, rolloff = 1.2) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = rolloff;
    p.maxDistance = 400;
    if (position) { p.positionX.value = position.x; p.positionY.value = position.y; p.positionZ.value = position.z; }
    return p;
  }

  _startPositional() {
    const ctx = this.ctx;
    // waterfall
    const wp = this._panner(new THREE.Vector3(WATERFALL.x, WATERFALL.poolLevel + 6, WATERFALL.z + 12), 8, 1.1);
    wp.connect(this.amb);
    this.waterfall = this._loop('waterfall', wp, { gain: 0.9 });
    // fire (silent until lit)
    this.firePanner = this._panner(null, 2, 1.4);
    this.firePanner.connect(this.sfx);
    this.fire = this._loop('fire', this.firePanner, { gain: 0 });
    // engine
    this.enginePanner = this._panner(null, 3, 1.2);
    this.enginePanner.connect(this.sfx);
    this.engine = this._loop('engine', this.enginePanner, { gain: 0 });
    // seaplane: radial engine (positional), airflow and stall horn (heard in the cabin)
    this.planePanner = this._panner(null, 6, 1.0);
    this.planePanner.maxDistance = 2500;
    this.planePanner.connect(this.sfx);
    this.planeEngine = this._loop('radial', this.planePanner, { gain: 0, filter: { type: 'lowpass', freq: 2400 } });
    this.planeAir = this._loop('wind', this.sfx, { gain: 0, filter: { type: 'bandpass', freq: 900, q: 0.6 } });
    this.planeHorn = this._loop('stallHorn', this.sfx, { gain: 0 });
    if (this._pendingFire) this.setFire(...this._pendingFire);
    if (this._pendingRadio) this.setRadio(...this._pendingRadio);
  }

  play(name, { position = null, volume = 1, rate = 1, bus = 'sfx' } = {}) {
    if (!this.ctx || !this.buffers[name]) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.buffers[name];
    src.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g);
    const dest = bus === 'amb' ? this.amb : this.sfx;
    if (position) {
      const p = this._panner(position, 2.5, 1.1);
      g.connect(p).connect(dest);
    } else g.connect(dest);
    src.start();
  }

  step(surface, volume = 0.6) {
    const k = Math.floor(Math.random() * 4);
    const name = `step_${SURFACES.includes(surface) ? surface : 'terrain'}_${k}`;
    this.play(name, { volume, rate: 0.9 + Math.random() * 0.2 });
  }

  thunder(distance, intensity) {
    if (!this.ctx || !this.buffers.thunder) return;
    const vol = clamp(1.4 - distance / 2600, 0.25, 1.2) * intensity;
    this.play('thunder', { volume: vol, rate: 0.8 + Math.random() * 0.3, bus: 'amb' });
  }

  setRadio(on, station = 0, position = null, retune = false) {
    if (!this.ctx || !this.ready) { this._pendingRadio = [on, station, position, retune]; return; }
    const ctx = this.ctx;
    if (this.radio) {
      const r = this.radio;
      r.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      r.staticGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      setTimeout(() => { try { r.src.stop(); r.st.stop(); } catch { /* already stopped */ } }, 400);
      this.radio = null;
    }
    if (!on) return;
    const p = this._panner(position, 1.5, 1.4);
    p.connect(this.music);
    const prog = this._loop(`radio${station}`, p, { gain: 0 });
    const st = this._loop('static', p, { gain: 0 });
    const t = ctx.currentTime;
    // tune-in sweep: static first, then the programme
    st.gain.gain.setValueAtTime(0.5, t);
    st.gain.gain.setTargetAtTime(station === 1 ? 0.18 : 0.06, t + (retune ? 0.6 : 0.3), 0.2);
    prog.gain.gain.setTargetAtTime(station === 1 ? 0.6 : 0.85, t + (retune ? 0.6 : 0.3), 0.3);
    this.radio = { src: prog.src, gain: prog.gain, st: st.src, staticGain: st.gain };
  }

  setFire(on, position) {
    if (!this.ctx || !this.fire) { this._pendingFire = [on, position]; return; }
    const t = this.ctx.currentTime;
    if (position) { this.firePanner.positionX.value = position.x; this.firePanner.positionY.value = position.y; this.firePanner.positionZ.value = position.z; }
    this.fire.gain.gain.setTargetAtTime(on ? 0.9 : 0, t, on ? 1.2 : 0.6);
  }

  /**
   * Seaplane audio. rpm drives pitch and loudness of the radial; airspeed (m/s) the rush of air;
   * inside = listener is in the cabin (muffled engine, louder airflow).
   */
  setPlane({ rpm = 0, airspeed = 0, stall = 0, inside = false, position }) {
    if (!this.planeEngine) return;
    const t = this.ctx.currentTime;
    if (position) { this.planePanner.positionX.value = position.x; this.planePanner.positionY.value = position.y; this.planePanner.positionZ.value = position.z; }
    const run = Math.min(1, rpm / 500);
    this.planeEngine.gain.gain.setTargetAtTime(run * (0.35 + Math.min(1, rpm / 2300) * 0.75), t, 0.12);
    this.planeEngine.src.playbackRate.setTargetAtTime(Math.max(0.2, rpm / 1080), t, 0.08);
    if (this.planeEngine.filter) this.planeEngine.filter.frequency.setTargetAtTime(inside ? 900 : 2600, t, 0.1);
    const air = Math.min(1, airspeed / 70);
    this.planeAir.gain.gain.setTargetAtTime(air * air * (inside ? 0.55 : 0.9), t, 0.2);
    this.planeAir.src.playbackRate.setTargetAtTime(0.7 + air * 0.9, t, 0.2);
    this.planeHorn.gain.gain.setTargetAtTime(stall > 0.5 ? 0.35 : 0, t, 0.04);
  }

  setEngine(level, position) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    this.enginePanner.positionX.value = position.x; this.enginePanner.positionY.value = position.y; this.enginePanner.positionZ.value = position.z;
    this.engine.gain.gain.setTargetAtTime(level > 0 ? 0.25 + level * 0.55 : 0, t, 0.15);
    this.engine.src.playbackRate.setTargetAtTime(0.75 + level * 0.9, t, 0.2);
  }

  /** Per-frame ambience mix. */
  update(dt, game) {
    if (!this.ctx || !this.layers.ocean) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const cam = game.camera;
    const L = ctx.listener;
    cam.getWorldDirection(this._f);
    if (L.positionX) {
      L.positionX.setTargetAtTime(cam.position.x, t, 0.02); L.positionY.setTargetAtTime(cam.position.y, t, 0.02); L.positionZ.setTargetAtTime(cam.position.z, t, 0.02);
      L.forwardX.setTargetAtTime(this._f.x, t, 0.02); L.forwardY.setTargetAtTime(this._f.y, t, 0.02); L.forwardZ.setTargetAtTime(this._f.z, t, 0.02);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(cam.position.x, cam.position.y, cam.position.z);
      L.setOrientation(this._f.x, this._f.y, this._f.z, 0, 1, 0);
    }

    const td = game.terrainData;
    const p = cam.position;
    const shore = Math.abs(td.shoreAt(p.x, p.z));
    const reef = td._sample(td.reefDist, p.x, p.z);
    const coast = td.coastAt(p.x, p.z);
    const splat = td.splatAt(p.x, p.z, this._splat || (this._splat = {}));
    const canopy = splat.canopy;
    const w = game.weather;
    const tod = game.timeOfDay;
    const day = 1 - tod.night;
    const uw = game.U.uUnderwater.value > 0.5;
    const height = Math.max(0, p.y - td.heightAt(p.x, p.z));
    const inland = smoothstep(30, 140, coast);
    const shelter = game.camp && game.camp.shelterBox;
    const underRoof = shelter && p.x > shelter.x0 && p.x < shelter.x1 && p.z > shelter.z0 && p.z < shelter.z1 && p.y > shelter.y0 && p.y < shelter.y1 + 1;

    const set = (name, v, tc = 0.4) => this.layers[name] && this.layers[name].gain.gain.setTargetAtTime(uw && name !== 'underwater' ? v * 0.35 : v, t, tc);
    const shoreWave = 1 - smoothstep(2, 55, shore);
    set('shore', shoreWave * 0.85 * (1 - inland * 0.8));
    set('ocean', (0.12 + 0.55 * (1 - smoothstep(40, 420, reef))) * (1 - inland * 0.7) * (0.8 + w.p.waves * 0.2));
    const windAmt = 0.06 + w.p.wind * 0.55 + smoothstep(15, 60, p.y) * 0.25;
    set('wind', windAmt * (1 - canopy * 0.4));
    if (this.layers.wind.filter) this.layers.wind.filter.frequency.setTargetAtTime(380 + w.p.wind * 700 + Math.sin(t * 0.3) * 120, t, 0.5);
    set('rain', (w.rain || 0) * (underRoof ? 0.45 : 0.9));
    set('tarpRain', (w.rain || 0) * (underRoof ? 1.0 : 0.15 * (1 - smoothstep(4, 20, Math.hypot(p.x, p.z - 4)))));
    set('storm', clamp((w.p.rain - 0.55) * 2, 0, 1) * 0.8);
    const jungle = clamp(canopy * 0.8 + inland * 0.5, 0, 1);
    set('jungle', day * (0.15 + jungle * 0.6) * (1 - (w.rain || 0) * 0.6));
    set('night', tod.night * (0.25 + jungle * 0.55) * (1 - (w.rain || 0) * 0.7));
    set('underwater', uw ? 0.9 : 0, 0.15);
    this.uwFilter.frequency.setTargetAtTime(uw ? 520 : 20000, t, 0.12);

    // birds during the day (dawn chorus louder), gulls near the coast
    this.birdTimer -= dt;
    const dawn = Math.exp(-((tod.hour - 6.4) ** 2) / 1.2) + Math.exp(-((tod.hour - 18) ** 2) / 1.5) * 0.6;
    if (this.birdTimer <= 0 && this.ready) {
      const activity = day * (0.3 + jungle * 0.7 + dawn) * (1 - (w.rain || 0));
      this.birdTimer = 1.2 + Math.random() * (6 / Math.max(0.15, activity));
      if (activity > 0.1 && !uw) {
        const a = Math.random() * Math.PI * 2, d = 15 + Math.random() * 45;
        const pos = new THREE.Vector3(p.x + Math.cos(a) * d, p.y + 4 + Math.random() * 10, p.z + Math.sin(a) * d);
        this.play(`bird${1 + Math.floor(Math.random() * 4)}`, { position: pos, volume: 0.35 + Math.random() * 0.35, rate: 0.9 + Math.random() * 0.25, bus: 'amb' });
      }
    }
    this.gullTimer -= dt;
    if (this.gullTimer <= 0 && this.ready) {
      this.gullTimer = 9 + Math.random() * 20;
      if (day > 0.5 && inland < 0.5 && !uw && (w.rain || 0) < 0.3) {
        const a = Math.random() * Math.PI * 2;
        this.play('gull', { position: new THREE.Vector3(p.x + Math.cos(a) * 60, p.y + 25, p.z + Math.sin(a) * 60), volume: 0.5, bus: 'amb' });
      }
    }
  }
}
