// Synthesized audio (Web Audio): engine (6-cyl firing frequency from rpm),
// propeller buzz at blade-pass frequency, wind, wheel rumble, spray hiss,
// stall horn, starter, one-shots, and a quiet rural ambience at the base
// (cicadas, birds, breeze). Nothing is loaded from files.
import { clamp, smoothstep } from '../core/math.js';

function noiseBuffer(ctx, seconds = 2, color = 'white') {
  const n = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else if (color === 'pink') { last = 0.97 * last + 0.03 * w; d[i] = (last * 4 + w * 0.3) * 0.6; }
    else d[i] = w;
  }
  return b;
}

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.volume = 0.8;
  }

  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp).connect(ctx.destination);
    this.white = noiseBuffer(ctx, 2, 'white');
    this.brown = noiseBuffer(ctx, 3, 'brown');
    this.pink = noiseBuffer(ctx, 2, 'pink');

    // Cockpit muffling filter for the aircraft bus.
    this.acBus = ctx.createGain();
    this.acTone = ctx.createBiquadFilter();
    this.acTone.type = 'lowpass';
    this.acTone.frequency.value = 6000;
    this.acBus.connect(this.acTone).connect(this.master);

    // Engine: harmonic-rich periodic wave at firing frequency + half-order sub.
    const real = new Float32Array(24), imag = new Float32Array(24);
    for (let k = 1; k < 24; k++) imag[k] = (k % 2 ? 1 : 0.6) / Math.pow(k, 1.15) * (k === 2 ? 1.4 : 1);
    const wave = ctx.createPeriodicWave(real, imag);
    this.eng = ctx.createOscillator();
    this.eng.setPeriodicWave(wave);
    this.engSub = ctx.createOscillator();
    this.engSub.type = 'triangle';
    this.engLP = ctx.createBiquadFilter();
    this.engLP.type = 'lowpass';
    this.engLP.Q.value = 0.8;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.55;
    this.eng.connect(this.engLP);
    this.engSub.connect(subGain).connect(this.engLP);
    this.engLP.connect(this.engGain).connect(this.acBus);
    // Mechanical clatter: noise amplitude-modulated at the firing frequency.
    this.clat = this._noise(this.white);
    this.clatBP = ctx.createBiquadFilter();
    this.clatBP.type = 'bandpass'; this.clatBP.frequency.value = 900; this.clatBP.Q.value = 0.9;
    this.clatAM = ctx.createGain();
    this.clatAM.gain.value = 0;
    this.clatMod = ctx.createOscillator();
    this.clatMod.type = 'square';
    const modDepth = ctx.createGain();
    modDepth.gain.value = 0.5;
    this.clatMod.connect(modDepth).connect(this.clatAM.gain);
    this.clatGain = ctx.createGain();
    this.clatGain.gain.value = 0;
    this.clat.connect(this.clatBP).connect(this.clatAM).connect(this.clatGain).connect(this.acBus);
    // Propeller buzz at blade-pass frequency.
    this.prop = ctx.createOscillator();
    this.prop.type = 'sawtooth';
    this.propBP = ctx.createBiquadFilter();
    this.propBP.type = 'bandpass'; this.propBP.Q.value = 0.7;
    this.propGain = ctx.createGain();
    this.propGain.gain.value = 0;
    this.prop.connect(this.propBP).connect(this.propGain).connect(this.acBus);
    this.propNoise = this._noise(this.pink);
    this.propNBP = ctx.createBiquadFilter();
    this.propNBP.type = 'bandpass'; this.propNBP.frequency.value = 300; this.propNBP.Q.value = 0.6;
    this.propNGain = ctx.createGain();
    this.propNGain.gain.value = 0;
    this.propNoise.connect(this.propNBP).connect(this.propNGain).connect(this.acBus);
    // Starter whine
    this.starter = ctx.createOscillator();
    this.starter.type = 'sawtooth';
    this.starterGain = ctx.createGain();
    this.starterGain.gain.value = 0;
    const stLP = ctx.createBiquadFilter();
    stLP.type = 'lowpass'; stLP.frequency.value = 1200;
    this.starter.connect(stLP).connect(this.starterGain).connect(this.acBus);
    // Wind
    this.wind = this._noise(this.white);
    this.windBP = ctx.createBiquadFilter();
    this.windBP.type = 'bandpass'; this.windBP.Q.value = 0.5;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.wind.connect(this.windBP).connect(this.windGain).connect(this.master);
    // Wheels rolling
    this.roll = this._noise(this.brown);
    this.rollLP = ctx.createBiquadFilter();
    this.rollLP.type = 'lowpass'; this.rollLP.frequency.value = 180;
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    this.roll.connect(this.rollLP).connect(this.rollGain).connect(this.master);
    // Spray hiss
    this.spray = this._noise(this.white);
    const sprayHP = ctx.createBiquadFilter();
    sprayHP.type = 'highpass'; sprayHP.frequency.value = 2600;
    this.sprayGain = ctx.createGain();
    this.sprayGain.gain.value = 0;
    this.spray.connect(sprayHP).connect(this.sprayGain).connect(this.master);
    // Stall horn
    this.horn = ctx.createOscillator();
    this.horn.type = 'square'; this.horn.frequency.value = 430;
    this.hornGain = ctx.createGain();
    this.hornGain.gain.value = 0;
    const hornLP = ctx.createBiquadFilter();
    hornLP.type = 'lowpass'; hornLP.frequency.value = 1800;
    this.horn.connect(hornLP).connect(this.hornGain).connect(this.master);
    // Service pump hum
    this.pump = ctx.createOscillator();
    this.pump.type = 'triangle'; this.pump.frequency.value = 98;
    this.pumpGain = ctx.createGain();
    this.pumpGain.gain.value = 0;
    this.pump.connect(this.pumpGain).connect(this.master);
    this.flow = this._noise(this.pink);
    const flowBP = ctx.createBiquadFilter();
    flowBP.type = 'bandpass'; flowBP.frequency.value = 600; flowBP.Q.value = 1.4;
    this.flowGain = ctx.createGain();
    this.flowGain.gain.value = 0;
    this.flow.connect(flowBP).connect(this.flowGain).connect(this.master);
    // Ambience: breeze + cicadas (AM high band)
    this.amb = ctx.createGain();
    this.amb.gain.value = 0;
    this.amb.connect(this.master);
    const breeze = this._noise(this.pink);
    const bLP = ctx.createBiquadFilter();
    bLP.type = 'lowpass'; bLP.frequency.value = 500;
    const bG = ctx.createGain(); bG.gain.value = 0.12;
    breeze.connect(bLP).connect(bG).connect(this.amb);
    const cic = this._noise(this.white);
    const cBP = ctx.createBiquadFilter();
    cBP.type = 'bandpass'; cBP.frequency.value = 5200; cBP.Q.value = 6;
    this.cicAM = ctx.createGain();
    this.cicAM.gain.value = 0;
    const cicMod = ctx.createOscillator();
    cicMod.frequency.value = 62;
    const cicDepth = ctx.createGain();
    cicDepth.gain.value = 0.5;
    cicMod.connect(cicDepth).connect(this.cicAM.gain);
    this.cicGain = ctx.createGain();
    this.cicGain.gain.value = 0;
    cic.connect(cBP).connect(this.cicAM).connect(this.cicGain).connect(this.amb);
    for (const o of [this.eng, this.engSub, this.clatMod, this.prop, this.starter, this.horn, this.pump, cicMod]) o.start();
    this.birdT = 2;
    this.cicT = 0;
    this.cicOn = false;
    this.ready = true;
  }

  _noise(buf) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start(0, Math.random() * buf.duration);
    return s;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; }

  // Continuous aircraft + environment state, once per frame.
  update(dt, s) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const k = 0.06;
    const rpm = s.rpm;
    const run = s.engine === 'running' || s.engine === 'cranking';
    const fire = Math.max(1, (rpm / 60) * 3);
    const on = smoothstep(150, 500, rpm) * (run ? 1 : 0.15);
    const load = clamp(s.throttle, 0, 1);
    this.eng.frequency.setTargetAtTime(fire, t, 0.04);
    this.engSub.frequency.setTargetAtTime(fire / 2, t, 0.04);
    this.engLP.frequency.setTargetAtTime(220 + 1200 * load + rpm * 0.35, t, 0.08);
    const dist = s.listenerDist ?? 0;
    const att = s.inside ? 1 : 1 / (1 + dist / 40);
    this.engGain.gain.setTargetAtTime(on * (0.16 + 0.22 * load) * att * (s.rough ? 0.8 + Math.random() * 0.4 : 1), t, k);
    this.clatMod.frequency.setTargetAtTime(fire, t, 0.04);
    this.clatBP.frequency.setTargetAtTime(600 + rpm * 0.4, t, 0.1);
    this.clatGain.gain.setTargetAtTime(on * (0.05 + 0.06 * load) * att, t, k);
    const bpf = Math.max(1, (rpm / 60) * 2);
    this.prop.frequency.setTargetAtTime(bpf, t, 0.04);
    this.propBP.frequency.setTargetAtTime(bpf * 3, t, 0.05);
    const pr = smoothstep(300, 2700, rpm);
    this.propGain.gain.setTargetAtTime(pr * (s.inside ? 0.04 : 0.12) * att * (0.6 + 0.6 * load), t, k);
    this.propNBP.frequency.setTargetAtTime(150 + rpm * 0.25, t, 0.1);
    this.propNGain.gain.setTargetAtTime(pr * pr * (s.inside ? 0.08 : 0.2) * att, t, k);
    this.starterGain.gain.setTargetAtTime(s.engine === 'cranking' ? 0.08 : 0, t, 0.05);
    this.starter.frequency.setTargetAtTime(s.engine === 'cranking' ? 160 + rpm * 0.6 : 120, t, 0.2);
    this.acTone.frequency.setTargetAtTime(s.inside ? 1500 : 7000, t, 0.1);
    this.acBus.gain.setTargetAtTime(s.inside ? 1.5 : 1.1, t, 0.2);
    // Wind
    const v = clamp(s.airspeed / 60, 0, 1.4);
    this.windBP.frequency.setTargetAtTime(300 + v * 900, t, 0.2);
    this.windGain.gain.setTargetAtTime(v * v * (s.inside ? 0.12 : 0.22) * (s.attached ? 1 : 0.5), t, 0.2);
    // Wheels
    const r = s.onGround ? clamp(s.groundSpeed / 25, 0, 1) : 0;
    this.rollGain.gain.setTargetAtTime(r * (s.surface === 'runway' ? 0.25 : 0.45) * att, t, 0.08);
    this.rollLP.frequency.setTargetAtTime(90 + r * 220, t, 0.1);
    // Spray + stall horn
    this.sprayGain.gain.setTargetAtTime(s.spraying ? 0.035 * att : 0, t, 0.15);
    this.hornGain.gain.setTargetAtTime(s.stall > 0.5 ? 0.05 : 0, t, 0.03);
    // Service pump
    this.pumpGain.gain.setTargetAtTime(s.pumpOn ? 0.05 * s.serviceAtt : 0, t, 0.3);
    this.flowGain.gain.setTargetAtTime(s.pumpOn ? 0.06 * s.serviceAtt : 0, t, 0.3);
    // Ambience near the base, ducked by the engine.
    const ambT = s.ambience * (1 - 0.7 * on);
    this.amb.gain.setTargetAtTime(ambT * 0.9, t, 0.6);
    this.cicT -= dt;
    if (this.cicT <= 0) {
      this.cicOn = !this.cicOn;
      this.cicT = this.cicOn ? 3 + Math.random() * 5 : 4 + Math.random() * 9;
      this.cicGain.gain.setTargetAtTime(this.cicOn ? 0.05 : 0, t, this.cicOn ? 1.2 : 0.6);
    }
    this.birdT -= dt;
    if (this.birdT <= 0 && ambT > 0.15) {
      this.birdT = 1.5 + Math.random() * 6;
      this._bird(ambT);
    }
  }

  _bird(level) {
    const ctx = this.ctx, t = ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2200 + Math.random() * 1800;
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const g = ctx.createGain();
      const st = t + i * (0.09 + Math.random() * 0.08);
      o.frequency.setValueAtTime(base * (1 + Math.random() * 0.3), st);
      o.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.6), st + 0.07);
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.025 * level, st + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.08);
      o.connect(g).connect(this.amb);
      o.start(st);
      o.stop(st + 0.1);
    }
  }

  play(name, { volume = 1 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this.master;
    const burst = (dur, freq, q, gain, type = 'bandpass', buf = this.white) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain * volume, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(out);
      s.start(t, Math.random());
      s.stop(t + dur + 0.05);
    };
    const tone = (dur, f0, f1, gain, type = 'sine', delay = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      o.frequency.setValueAtTime(f0, t + delay);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + delay + dur);
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.linearRampToValueAtTime(gain * volume, t + delay + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      o.connect(g).connect(out);
      o.start(t + delay);
      o.stop(t + delay + dur + 0.05);
    };
    switch (name) {
      case 'click': burst(0.04, 3000, 2, 0.15); break;
      case 'ui': tone(0.06, 900, 1200, 0.04); break;
      case 'valve': burst(0.05, 2500, 2, 0.12); burst(0.35, 4000, 0.7, 0.05, 'highpass'); break;
      case 'thump': tone(0.25, 90, 40, 0.35); burst(0.15, 200, 1, 0.2, 'lowpass', this.brown); break;
      case 'clank': for (const f of [820, 1370, 2210]) tone(0.25, f, f * 0.98, 0.05, 'triangle'); break;
      case 'reel': for (let i = 0; i < 8; i++) tone(0.03, 1800, 1500, 0.03, 'square', i * 0.06); break;
      case 'starter': break;
      case 'crash':
        burst(1.6, 400, 0.4, 0.9, 'lowpass', this.brown);
        burst(0.9, 1800, 0.6, 0.5);
        for (const f of [300, 520, 870]) tone(0.8, f, f * 0.6, 0.15, 'sawtooth');
        break;
      case 'success': tone(0.18, 660, 660, 0.06); tone(0.25, 880, 880, 0.06, 'sine', 0.15); break;
      case 'warn': tone(0.12, 520, 520, 0.05, 'square'); break;
      default: break;
    }
  }
}
