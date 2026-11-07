// Ipanema EMB-202A engine sound: Lycoming IO-540 (six cylinders, horizontally
// opposed, four-stroke) driving a two-blade fixed-pitch Hartzell, synthesized
// in layers that follow the flight model rather than one loop re-pitched:
//
//   A starter      — heavy starter-motor growl (~85–120 Hz) and a low thump per
//                    compression stroke (the weight of the reference start sits
//                    at 46–60 and 80–130 Hz), the whine (~850 Hz) and gear rasp
//                    above it, at the cranking speed the simulation reports
//   B catch        — the first individual firings, scheduled one by one from
//                    the rpm as the engine catches, then a short level flare and
//                    the odd misfire while it settles
//   C/D/E core     — three harmonic spectra on the engine-cycle frequency
//                    (rpm/120, so the 1/2-order roughness of a six is there),
//                    crossfaded by rpm and load: low idle (firing order and its
//                    2nd/3rd harmonics, lumpy), mid (rounder), high power
//                    (dense upper orders); plus exhaust blat (noise gated by the
//                    firing pulses) and the open-throttle rasp
//   F propeller    — blade-pass tone (rpm/30), blade-pass-modulated whoosh and
//                    the tip-speed rasp that grows as the 2.2 m blades near
//                    Mach 0.9 at 2700 rpm; heard much more outside
//   G cabin        — a separate path: low shelf + airframe resonance, two
//                    low-passes (the firewall and canopy take the highs) and a
//                    structural buzz; the exterior path has an air-absorption
//                    low-pass and a PannerNode with distance attenuation and a
//                    mild Doppler shift.
//
// Calibrated against three recordings (start-up, take-off, pattern pass):
// idle firing peak ~33 Hz with harmonics at 67/100/199 Hz (≈650 rpm), take-off
// firing order dominant with strong 4th/5th/6th shaft orders and 1/2 orders, a
// 1–4 kHz band that rises with power, starter whine ~850 Hz with compression
// pulses. All synthesized: nothing from the videos is embedded.
//
// The sound never decides when the engine runs: the state machine below reads
// the flight model's engine state and rpm (which also spin the propeller), so
// start, catch and shutdown stay in step with the gauge and the animation.

const C_SOUND = 343;
const TAU = 0.05;

export const IPA = Object.freeze({
  OFF: 'off',
  START_REQUESTED: 'start_requested',
  STARTER_ACTIVE: 'starter_active',
  CATCH: 'catch',
  IDLE_STABILIZATION: 'idle_stabilization',
  RUNNING: 'running',
  SHUTDOWN: 'shutdown',
});

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, v) => {
  const x = clamp((v - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};

// Deterministic pseudo-random (spectra and catch pattern are the same every
// run; only the noise buffers differ).
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Harmonic spectrum on the cycle frequency: `peaks` maps harmonic index to
// amplitude; every other index gets a small, slightly irregular floor (the six
// cylinders are not identical), rolling off with `tilt`.
function spectrum(ctx, peaks, { n = 64, floor = 0.08, tilt = 1.1, seed = 1 } = {}) {
  const r = rng(seed);
  const re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    const a = (peaks[k] ?? floor * (0.6 + 0.8 * r()) * Math.pow(6 / Math.max(k, 6), tilt));
    const ph = r() * Math.PI * 2;
    re[k] = a * Math.cos(ph);
    im[k] = a * Math.sin(ph);
  }
  return ctx.createPeriodicWave(re, im, { disableNormalization: false });
}

// Narrow pulse train (duty 0..1), unipolar-ish: used to gate noise at the
// firing or blade-pass rate.
function pulseWave(ctx, duty, n = 32) {
  const re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k++) re[k] = (2 * Math.sin(Math.PI * k * duty)) / (Math.PI * k);
  return ctx.createPeriodicWave(re, im);
}

// Per-engine constants (EMB-202A data in the flight model; the prop diameter
// gives the tip speed).
const DEF = { idleRpm: 650, maxRpm: 2700, propDiameter: 2.2, blades: 2 };

export class IpanemaEngineSound {
  constructor(ctx, out, noise, cfg = {}) {
    this.ctx = ctx;
    this.cfg = { ...DEF, ...cfg };
    this.state = IPA.OFF;
    this.stateT = 0;
    this.prevEngine = 'off';
    this.inside = false;
    this.mixIn = 0;
    this.thr = 0;
    this.lastThr = 0;
    this.stableT = 0;
    this.firePhase = 0;
    this.catchN = 0;
    this.r = rng(9);
    this.oneShots = new Set();
    this.nodes = [];
    this.sources = [];
    this.active = false;
    this.dop = 1;
    this._build(out, noise);
  }

  // ------------------------------------------------------------------ graph
  _g(v = 0) { const g = this.ctx.createGain(); g.gain.value = v; this.nodes.push(g); return g; }
  _f(type, freq, q = 0.707, gain = 0) {
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q; f.gain.value = gain;
    this.nodes.push(f);
    return f;
  }
  _osc(wave, type = 'sine') {
    const o = this.ctx.createOscillator();
    if (wave) o.setPeriodicWave(wave); else o.type = type;
    this.sources.push(o);
    return o;
  }
  _noise(buf) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = true;
    this.sources.push(s);
    s._offset = Math.random() * buf.duration;
    return s;
  }

  _build(out, { white, pink, brown }) {
    const ctx = this.ctx;
    // Output paths --------------------------------------------------------
    this.out = this._g(1);
    this.out.connect(out);
    // Exterior: high-pass (no DC/rumble below the firing order), air
    // absorption low-pass, then the panner.
    this.extIn = this._g(1);
    const extHP = this._f('highpass', 40, 0.7);
    this.extAir = this._f('lowpass', 15000, 0.5);
    this.extShelf = this._f('highshelf', 2500, 0.7, 2);
    this.extGain = this._g(0);
    this.panner = ctx.createPanner();
    Object.assign(this.panner, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 12, rolloffFactor: 0.3, maxDistance: 20000 });
    this.nodes.push(this.panner);
    this._setPos(this.panner, 0, 0, -12);
    this.extIn.connect(extHP).connect(this.extShelf).connect(this.extAir).connect(this.extGain).connect(this.panner).connect(this.out);
    // Cabin: the engine is a metre ahead of the panel behind a firewall; the
    // airframe boosts the low orders and resonates near 95 Hz, the highs are
    // taken by the firewall, the cowl and the canopy.
    this.intIn = this._g(1);
    const cabLow = this._f('lowshelf', 160, 0.7, 5);
    const cabRes = this._f('peaking', 95, 1.3, 4);
    const cabLP = this._f('lowpass', 2000, 0.6);
    const cabLP2 = this._f('lowpass', 4500, 0.7);
    const cabHi = this._f('highshelf', 3000, 0.7, -7);
    this.intGain = this._g(0);
    this.intIn.connect(cabLow).connect(cabRes).connect(cabLP).connect(cabLP2).connect(cabHi).connect(this.intGain).connect(this.out);

    // Sums feeding both paths: engine (core + exhaust + mechanical + catch),
    // propeller (prop layers reach the cabin much weaker), starter.
    this.engBus = this._g(1);
    this.misfire = this._g(1);
    this.flare = this._g(0);
    this.engBus.connect(this.misfire).connect(this.flare);
    this.flare.connect(this.extIn);
    this.flare.connect(this.intIn);
    this.propBus = this._g(1);
    this.propExt = this._g(1);
    this.propInt = this._g(0.4);
    this.propBus.connect(this.propExt).connect(this.extIn);
    this.propBus.connect(this.propInt).connect(this.intIn);
    this.stBus = this._g(0.45); // the start is about half the settled idle level (reference)
    this.stBus.connect(this.extIn);
    const stIntK = this._g(1.3); // the starter is right behind the panel
    this.stBus.connect(stIntK).connect(this.intIn);

    // C/D/E core: three spectra on the cycle frequency ---------------------
    // Harmonic k of the cycle frequency is order k/2 of the crankshaft; the
    // firing order of a six is k = 6.
    const W = [
      // C low idle: firing order + 2nd/3rd (≈33/67/100 Hz at 650 rpm), a
      // strong 1/2-order lump and uneven neighbours.
      spectrum(ctx, { 1: 0.04, 2: 0.1, 3: 0.14, 4: 0.06, 5: 0.08, 6: 0.55, 7: 0.2, 9: 0.28, 12: 0.85, 15: 0.3, 18: 0.75, 21: 0.25, 24: 0.55, 27: 0.4, 30: 0.4, 33: 0.25, 36: 0.45, 42: 0.3, 48: 0.25 }, { n: 200, floor: 0.14, tilt: 0.8, seed: 3 }),
      // D mid: rounder, the firing order with 2× and 3×, fewer lumps.
      spectrum(ctx, { 2: 0.16, 3: 0.14, 6: 1, 8: 0.22, 9: 0.2, 10: 0.18, 12: 0.72, 18: 0.48, 24: 0.4, 30: 0.26, 36: 0.22 }, { n: 128, floor: 0.08, tilt: 0.95, seed: 5 }),
      // E high power: take-off spectrum (firing ≈135 Hz, 4/4.5/5/6 shaft
      // orders strong) and a dense upper series for the bark.
      spectrum(ctx, { 2: 0.04, 3: 0.06, 4: 0.05, 5: 0.08, 6: 1, 8: 0.62, 9: 0.4, 10: 0.45, 12: 0.8, 14: 0.3, 15: 0.32, 16: 0.3, 18: 0.55, 20: 0.3, 24: 0.45, 30: 0.32, 36: 0.3, 42: 0.22, 48: 0.2 }, { n: 96, floor: 0.15, tilt: 0.6, seed: 7 }),
    ];
    this.core = W.map((w) => this._osc(w));
    this.coreG = this.core.map(() => this._g(0));
    this.coreLP = this._f('lowpass', 400, 0.9);
    this.coreLevel = this._g(0);
    this.core.forEach((o, i) => o.connect(this.coreG[i]).connect(this.coreLP));
    this.coreLP.connect(this.coreLevel).connect(this.engBus);
    // Cylinder-to-cylinder irregularity: slow noise on pitch (cents) and level.
    const jit = this._noise(brown);
    const jitLP = this._f('lowpass', 9, 0.5);
    this.jitPitch = this._g(0);
    this.jitAmp = this._g(0);
    jit.connect(jitLP);
    jitLP.connect(this.jitPitch);
    jitLP.connect(this.jitAmp).connect(this.coreLevel.gain);
    for (const o of this.core) this.jitPitch.connect(o.detune);

    // Firing-pulse gate shared by exhaust, rasp and mechanical layers.
    this.firePulse = this._osc(pulseWave(ctx, 0.3, 12));
    this.tick = this._osc(pulseWave(ctx, 0.12, 14));
    // Exhaust blat: pink noise, band-passed, gated by the firing pulses.
    const ex = this._noise(white);
    this.exBP = this._f('bandpass', 320, 0.6);
    this.exAM = this._g(0.4);
    this.exDepth = this._g(0.6);
    this.firePulse.connect(this.exDepth).connect(this.exAM.gain);
    this.exGain = this._g(0);
    ex.connect(this.exBP).connect(this.exAM).connect(this.exGain).connect(this.engBus);
    // Open-throttle rasp (1.5–4 kHz band that grows on take-off).
    const rs = this._noise(white);
    this.rsBP = this._f('bandpass', 2400, 0.6);
    this.rsAM = this._g(0.5);
    const rsDepth = this._g(0.5);
    this.firePulse.connect(rsDepth).connect(this.rsAM.gain);
    this.rsGain = this._g(0);
    rs.connect(this.rsBP).connect(this.rsAM).connect(this.rsGain).connect(this.engBus);
    // Valve train / tappets: a light tick, mostly heard at idle and inside.
    const mk = this._noise(white);
    const mkBP = this._f('bandpass', 3300, 2.2);
    this.mkAM = this._g(0);
    this.tick.connect(this.mkAM.gain);
    this.mkGain = this._g(0);
    mk.connect(mkBP).connect(this.mkAM).connect(this.mkGain).connect(this.engBus);

    // F propeller ---------------------------------------------------------
    const pr = new Float32Array(16), pi = new Float32Array(16);
    for (let k = 1; k < 16; k++) pi[k] = 1 / Math.pow(k, 1.5);
    this.prop = this._osc(ctx.createPeriodicWave(pr, pi));
    this.propLP = this._f('lowpass', 400, 0.7);
    this.propTone = this._g(0);
    this.prop.connect(this.propLP).connect(this.propTone).connect(this.propBus);
    this.bladePulse = this._osc(pulseWave(ctx, 0.35, 10));
    const pw = this._noise(pink);
    this.pwBP = this._f('bandpass', 700, 0.6);
    this.pwAM = this._g(0.55);
    const pwDepth = this._g(0.45);
    this.bladePulse.connect(pwDepth).connect(this.pwAM.gain);
    this.pwGain = this._g(0);
    pw.connect(this.pwBP).connect(this.pwAM).connect(this.pwGain).connect(this.propBus);
    const tip = this._noise(white);
    this.tipHP = this._f('highpass', 1800, 0.7);
    const tipLP = this._f('lowpass', 4000, 0.7);
    this.tipAM = this._g(0.5);
    const tipDepth = this._g(0.5);
    this.bladePulse.connect(tipDepth).connect(this.tipAM.gain);
    this.tipGain = this._g(0);
    tip.connect(this.tipHP).connect(tipLP).connect(this.tipAM).connect(this.tipGain).connect(this.propBus);

    // A starter -----------------------------------------------------------
    this.stOsc = this._osc(null, 'sawtooth');
    this.stOsc.frequency.value = 850;
    this.stMesh = this._osc(null, 'sine');
    this.stMesh.frequency.value = 1700;
    const stBP = this._f('bandpass', 1100, 0.6);
    const meshG = this._g(0.25);
    this.stAM = this._g(0.7);
    this.comp = this._osc(pulseWave(ctx, 0.45, 12));
    this.comp.frequency.value = 5;
    const compAM = this._g(0.3);
    this.comp.connect(compAM).connect(this.stAM.gain);
    // Under each compression stroke the motor slows: pitch dips with the load.
    this.compPitch = this._g(-45);
    this.comp.connect(this.compPitch).connect(this.stOsc.frequency);
    this.stOsc.connect(stBP);
    this.stMesh.connect(meshG).connect(stBP);
    this.stGain = this._g(0);
    stBP.connect(this.stAM).connect(this.stGain).connect(this.stBus);
    const stN = this._noise(white);
    const stNBP = this._f('bandpass', 2200, 0.5);
    this.stNGain = this._g(0);
    stN.connect(stNBP).connect(this.stNGain).connect(this.stAM);
    // The engine being turned over: air pumped through the cylinders, a dull
    // chug per compression stroke.
    const ch = this._noise(brown);
    const chLP = this._f('lowpass', 320, 0.8);
    this.chAM = this._g(0);
    this.comp.connect(this.chAM.gain);
    this.chGain = this._g(0);
    ch.connect(chLP).connect(this.chAM).connect(this.chGain).connect(this.stBus);
    // The body of the start (the reference has its weight at 46–60 Hz and
    // 80–130 Hz): the heavy starter motor and Bendix growl, pitch sagging on
    // each compression, and a low thump as each cylinder is pushed over.
    this.stLow = this._osc(null, 'sawtooth');
    this.stLow.frequency.value = 110;
    this.stLowPitch = this._g(0);
    this.comp.connect(this.stLowPitch).connect(this.stLow.frequency);
    const stLowLP = this._f('lowpass', 420, 0.9);
    const stLowAM = this._g(0.75);
    const stLowDepth = this._g(0.25);
    this.comp.connect(stLowDepth).connect(stLowAM.gain);
    this.stLowGain = this._g(0);
    this.stLow.connect(stLowLP).connect(stLowAM).connect(this.stLowGain).connect(this.stBus);
    this.thump = this._osc(null, 'triangle');
    this.thump.frequency.value = 52;
    const thAM = this._g(0.5);
    const thDepth = this._g(0.5);
    this.comp.connect(thDepth).connect(thAM.gain);
    this.thGain = this._g(0);
    this.thump.connect(thAM).connect(this.thGain).connect(this.stBus);

    // G cabin-only: airframe buzz at the firing order.
    const bz = this._noise(brown);
    this.bzBP = this._f('bandpass', 180, 2.5);
    this.bzAM = this._g(0.4);
    const bzDepth = this._g(0.6);
    this.firePulse.connect(bzDepth).connect(this.bzAM.gain);
    this.bzGain = this._g(0);
    bz.connect(this.bzBP).connect(this.bzAM).connect(this.bzGain).connect(this.intGain);

    for (const s of this.sources) s.start(0, s._offset ?? 0);
  }

  _setPos(p, x, y, z) {
    if (p.positionX) {
      const t = this.ctx.currentTime;
      p.positionX.setTargetAtTime(x, t, 0.03); p.positionY.setTargetAtTime(y, t, 0.03); p.positionZ.setTargetAtTime(z, t, 0.03);
    } else p.setPosition(x, y, z);
  }

  // ------------------------------------------------------------------ state
  _to(st) {
    if (this.state === st) return;
    if (st === IPA.SHUTDOWN && this.state !== IPA.START_REQUESTED && this.state !== IPA.STARTER_ACTIVE) this._cough = true;
    this.state = st; this.stateT = 0;
  }

  _machine(dt, a) {
    const { engine, rpm } = a;
    const prev = this.prevEngine;
    this.prevEngine = engine;
    this.stateT += dt;
    if (engine === 'cranking') {
      if (prev !== 'cranking') this._to(IPA.START_REQUESTED);
      // The starter has engaged once the crank is actually turning.
      if (this.state === IPA.START_REQUESTED && rpm > 60) this._to(IPA.STARTER_ACTIVE);
      return;
    }
    if (engine === 'running') {
      if (prev === 'cranking') { this._to(IPA.CATCH); this.catchN = 0; this.firePhase = 0; return; }
      // Spawned already running (e.g. placed in the air).
      if (this.state === IPA.OFF || this.state === IPA.SHUTDOWN) { this._to(rpm > 400 ? IPA.RUNNING : IPA.CATCH); return; }
      const idle = this.cfg.idleRpm;
      if (this.state === IPA.CATCH && rpm > 0.88 * idle) this._to(IPA.IDLE_STABILIZATION);
      if (this.state === IPA.IDLE_STABILIZATION) {
        // Settled once the rpm has stopped moving for a while.
        const d = Math.abs(rpm - (this._lastRpm ?? rpm)) / Math.max(dt, 1e-3);
        this.stableT = d < 40 ? this.stableT + dt : 0;
        if (this.stableT > 1.6 || rpm > idle * 1.35) this._to(IPA.RUNNING);
      }
      return;
    }
    // engine off
    if (prev === 'running' || prev === 'cranking') this._to(IPA.SHUTDOWN);
    if (this.state === IPA.SHUTDOWN && rpm < 40) {
      // The crank rocks back on a compression stroke as it stops.
      this._bang(this.ctx.currentTime + 0.02, 0.12, 0.05);
      this._to(IPA.OFF);
    }
    if (this.state !== IPA.SHUTDOWN && this.state !== IPA.OFF) this._to(IPA.OFF);
  }

  // One firing of a single cylinder (catch, misfire recovery, afterfire):
  // a low thump and a short crack, through the engine bus.
  _bang(when, level, bright = 0.5) {
    const ctx = this.ctx;
    if (this.oneShots.size > 24) return;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    const f0 = 40 + 14 * this.r();
    o.frequency.setValueAtTime(f0 * this.dop, when);
    o.frequency.exponentialRampToValueAtTime(24, when + 0.2);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, when);
    og.gain.linearRampToValueAtTime(0.7 * level, when + 0.005);
    og.gain.exponentialRampToValueAtTime(0.0001, when + 0.24);
    const n = ctx.createBufferSource();
    n.buffer = this._bangBuf ??= (() => {
      const len = Math.floor(ctx.sampleRate * 0.25), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.03));
      return b;
    })();
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = 260 + 1400 * bright; nf.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.value = 0.55 * level;
    o.connect(og).connect(this.engBus);
    n.connect(nf).connect(ng).connect(this.engBus);
    o.start(when); o.stop(when + 0.28);
    n.start(when); n.stop(when + 0.25);
    const rec = { o, n, nodes: [og, nf, ng] };
    this.oneShots.add(rec);
    n.onended = () => {
      for (const x of [o, n, ...rec.nodes]) x.disconnect();
      this.oneShots.delete(rec);
    };
  }

  _killOneShots() {
    for (const rec of this.oneShots) {
      try { rec.o.stop(); rec.n.stop(); } catch { /* not started yet */ }
      for (const x of [rec.o, rec.n, ...rec.nodes]) x.disconnect();
    }
    this.oneShots.clear();
  }

  // a: IpanemaAudioState (see ipanemaAudioState below). active=false when
  // another aircraft is flown: everything fades out and the machine resets.
  update(dt, a, active = true) {
    const t = this.ctx.currentTime;
    if (!active || !a) {
      if (this.active) {
        this.active = false;
        this._killOneShots();
        for (const g of [this.extGain, this.intGain, this.coreLevel, this.exGain, this.rsGain, this.mkGain, this.propTone, this.pwGain, this.tipGain, this.stGain, this.stNGain, this.chGain, this.bzGain, this.flare]) {
          g.gain.cancelScheduledValues(t);
          g.gain.setTargetAtTime(0, t, 0.06);
        }
        this.state = IPA.OFF; this.prevEngine = 'off'; this.stateT = 0;
      }
      return;
    }
    if (!this.active) { this.active = true; this.prevEngine = a.engine === 'cranking' ? 'off' : a.engine; this.state = IPA.OFF; }
    // Per-aircraft constants (the EMB-203's three-blade prop).
    if (a.cfg !== this._cfgSrc) { this._cfgSrc = a.cfg; this.cfg = { ...DEF, ...(a.cfg ?? {}) }; }
    this._machine(dt, a);
    const st = this.state, cfg = this.cfg;
    const rpm = Math.max(0, a.rpm);
    this.thr += (clamp(a.throttle, 0, 1) - this.thr) * Math.min(1, dt / 0.12);
    const L = this.thr;
    const n = clamp((rpm - cfg.idleRpm) / (cfg.maxRpm - cfg.idleRpm), 0, 1.1);

    // Doppler: radial speed of the aircraft relative to the listener
    // (positive = approaching), kept mild (×0.6) and clamped.
    const vr = a.inside ? 0 : clamp(a.closing ?? 0, -90, 90);
    const dopT = clamp(1 + 0.6 * (C_SOUND / (C_SOUND - vr) - 1), 0.9, 1.1);
    this.dop += (dopT - this.dop) * Math.min(1, dt * 6);
    const dop = this.dop;

    const firing = st === IPA.CATCH || st === IPA.IDLE_STABILIZATION || st === IPA.RUNNING;
    const cyc = Math.max(0.5, rpm / 120) * dop;
    const fire = cyc * 6;
    for (const o of this.core) o.frequency.setTargetAtTime(cyc, t, TAU);
    this.firePulse.frequency.setTargetAtTime(fire, t, TAU);
    this.tick.frequency.setTargetAtTime(fire, t, TAU);
    const bpf = Math.max(0.5, (rpm / 60) * cfg.blades) * dop;
    this.prop.frequency.setTargetAtTime(bpf, t, TAU);
    this.bladePulse.frequency.setTargetAtTime(bpf, t, TAU);

    // Layer crossfade (equal power) over rpm, high layer weighted by load.
    let wi = 1 - sstep(0.04, 0.42, n);
    let wh = sstep(0.4, 0.92, n) * (0.35 + 0.65 * L);
    let wm = Math.max(0, 1 - wi - sstep(0.4, 0.92, n) * 0.85) + 0.15 * (1 - wi);
    const norm = 1 / Math.max(0.3, Math.hypot(wi, wm, wh));
    wi *= norm; wm *= norm; wh *= norm;
    this.coreG[0].gain.setTargetAtTime(wi, t, 0.12);
    this.coreG[1].gain.setTargetAtTime(wm, t, 0.12);
    this.coreG[2].gain.setTargetAtTime(wh, t, 0.12);

    // Catch: firings scheduled one at a time from the rpm, sparse and uneven
    // at first, then the continuous layers take over as the rpm comes up.
    let catchP = 1;
    if (st === IPA.CATCH || st === IPA.IDLE_STABILIZATION) {
      const p = clamp((rpm - 260) / (cfg.idleRpm - 260), 0, 1);
      catchP = st === IPA.CATCH ? 0.12 + 0.88 * Math.pow(p, 0.8) : 1;
      if (st === IPA.CATCH) {
        this.firePhase += (rpm / 20) * dt;
        while (this.firePhase >= 1) {
          this.firePhase -= 1;
          const hitP = 0.35 + 0.5 * p;
          if (this.r() < hitP) {
            this._bang(t + 0.01 + this.r() * 0.012, (0.55 + 0.45 * this.r()) * (1 - 0.6 * p), 0.15);
            this.catchN++;
          }
        }
      }
    }
    // Level envelope: a flare as it catches (the start video peaks ~1.4× the
    // settled idle level), misfires while it stabilizes.
    let flare = 1;
    if (st === IPA.CATCH) flare = 0.9 + 0.4 * sstep(0, 0.5, this.stateT);
    else if (st === IPA.IDLE_STABILIZATION) {
      flare = 1 + 0.3 * Math.exp(-this.stateT / 0.8);
      if (this.r() < dt * 3 * Math.exp(-this.stateT / 1.2)) {
        const m = this.misfire.gain;
        m.cancelScheduledValues(t);
        m.setValueAtTime(1, t);
        m.linearRampToValueAtTime(0.45, t + 0.02);
        m.linearRampToValueAtTime(1, t + 0.09);
      }
    }
    // Afterfire: throttle chopped at high rpm (diving, end of a pass).
    if (st === IPA.RUNNING && this.lastThr - L > 0.012 && rpm > 1900 && this.r() < dt * 8) this._bang(t + 0.02, 0.35, 0.8);
    this.lastThr = L;
    const live = firing ? sstep(180, 420, rpm) * catchP : 0;
    // Shutdown: the fuel stops — a last cough, then only the mechanical spin.
    if (this._cough) { this._cough = false; if (rpm > 300) this._bang(t + 0.04, 0.4, 0.3); }
    this.flare.gain.setTargetAtTime(flare, t, 0.08);

    // Core level and tone.
    const rough = a.rough ? 1 : 0;
    const coreAmp = live * (0.15 + 0.11 * L + 0.07 * n) * (1 + 0.25 * rough);
    this.coreLevel.gain.setTargetAtTime(coreAmp, t, firing ? 0.05 : 0.12);
    this.coreLP.frequency.setTargetAtTime((950 + 700 * L + rpm * 0.3) * dop, t, 0.1);
    this.jitPitch.gain.setTargetAtTime((st === IPA.RUNNING ? 6 + 10 * (1 - n) : 22) + 30 * rough, t, 0.2);
    this.jitAmp.gain.setTargetAtTime(coreAmp * (0.25 + 0.35 * (1 - n) + 0.6 * rough), t, 0.2);
    // Exhaust blat and rasp.
    this.exBP.frequency.setTargetAtTime((520 + 1000 * L * (0.4 + 0.6 * n) + rpm * 0.06) * dop, t, 0.1);
    this.exDepth.gain.setTargetAtTime(0.7 - 0.35 * n, t, 0.1);
    this.exGain.gain.setTargetAtTime(live * (0.2 + 0.08 * L) * (0.8 + 0.2 * n), t, 0.08);
    this.rsBP.frequency.setTargetAtTime((1600 + 1400 * n) * dop, t, 0.1);
    this.rsGain.gain.setTargetAtTime(live * (0.05 * L + 0.12 * L * L * n), t, 0.1);
    const spin = sstep(60, 400, rpm);
    this.mkGain.gain.setTargetAtTime(spin * (firing ? 0.02 + 0.015 * (1 - n) : 0.008), t, 0.1);

    // Propeller: tone with rpm and load; whoosh grows ~rpm³; tip rasp from
    // the tip Mach number.
    const rr = rpm / cfg.maxRpm;
    const tipMach = (Math.PI * cfg.propDiameter * rpm) / 60 / C_SOUND;
    this.propLP.frequency.setTargetAtTime((bpf * 3.2 + 120), t, 0.1);
    this.propTone.gain.setTargetAtTime(spin * (0.015 + 0.03 * rr * rr) * (0.6 + 0.4 * L), t, 0.08);
    this.pwBP.frequency.setTargetAtTime((350 + 900 * rr) * dop, t, 0.1);
    this.pwGain.gain.setTargetAtTime(spin * (0.015 + 0.13 * rr * rr * rr) * (0.5 + 0.5 * L), t, 0.08);
    this.tipHP.frequency.setTargetAtTime(1700 * dop, t, 0.2);
    this.tipGain.gain.setTargetAtTime(0.14 * sstep(0.6, 0.92, tipMach) * (0.4 + 0.6 * L), t, 0.08);

    // Starter: whine at ~850 Hz (higher while it spins up), compression chug
    // at three strokes per crank revolution of the simulated cranking rpm.
    const cranking = st === IPA.START_REQUESTED || st === IPA.STARTER_ACTIVE;
    this.comp.frequency.setTargetAtTime(Math.max(1, (rpm / 60) * 3), t, 0.05);
    if (cranking) {
      const eng = st === IPA.STARTER_ACTIVE ? 1 : 0.6;
      this.stOsc.frequency.setTargetAtTime(560 + 300 * sstep(0, 260, rpm), t, 0.12);
      this.stMesh.frequency.setTargetAtTime(1120 + 600 * sstep(0, 260, rpm), t, 0.12);
      const turn = sstep(10, 120, rpm);
      this.stGain.gain.setTargetAtTime(0.13 * eng, t, 0.04);
      this.stNGain.gain.setTargetAtTime(0.65 * eng, t, 0.05);
      this.chGain.gain.setTargetAtTime(0.22 * turn, t, 0.08);
      this.compPitch.gain.setTargetAtTime(-20, t, 0.1);
      this.stLow.frequency.setTargetAtTime(85 + 35 * sstep(0, 260, rpm), t, 0.15);
      this.stLowPitch.gain.setTargetAtTime(-14, t, 0.1);
      this.stLowGain.gain.setTargetAtTime(0.2 * eng, t, 0.05);
      this.thGain.gain.setTargetAtTime(0.16 * turn, t, 0.06);
    } else {
      // Disengaged: the unloaded motor freewheels up for an instant, then
      // spins down.
      if (this._wasCranking) {
        this.stOsc.frequency.cancelScheduledValues(t);
        this.stOsc.frequency.setValueAtTime(this.stOsc.frequency.value, t);
        this.stOsc.frequency.linearRampToValueAtTime(1000, t + 0.12);
        this.stOsc.frequency.setTargetAtTime(300, t + 0.12, 0.35);
        this.stGain.gain.cancelScheduledValues(t);
        this.stGain.gain.setValueAtTime(this.stGain.gain.value, t);
        this.stGain.gain.setTargetAtTime(0, t + 0.1, 0.25);
      }
      this.stNGain.gain.setTargetAtTime(0, t, 0.06);
      this.chGain.gain.setTargetAtTime(0, t, 0.06);
      this.stLowGain.gain.setTargetAtTime(0, t, 0.12);
      this.thGain.gain.setTargetAtTime(0, t, 0.05);
      this.stLowPitch.gain.setTargetAtTime(0, t, 0.1);
      this.compPitch.gain.setTargetAtTime(0, t, 0.1);
    }
    this._wasCranking = cranking;

    // Cabin buzz.
    this.bzBP.frequency.setTargetAtTime(150 + rpm * 0.05, t, 0.2);
    this.bzGain.gain.setTargetAtTime(live * (0.04 + 0.05 * L), t, 0.1);

    // Inside/outside crossfade (the sources never restart).
    this.inside = !!a.inside;
    const dist = Math.max(0, a.dist ?? 0);
    this.intGain.gain.setTargetAtTime(this.inside ? 0.65 : 0, t, 0.25);
    this.extGain.gain.setTargetAtTime(this.inside ? 0 : 1.4, t, 0.25);
    this.propInt.gain.setTargetAtTime(0.4, t, 0.2);
    // Air absorption: highs fade with distance.
    this.extAir.frequency.setTargetAtTime(clamp(16000 / (1 + dist / 260), 2200, 16000), t, 0.2);
    if (a.rel) this._setPos(this.panner, a.rel[0], a.rel[1], a.rel[2]);
    this._lastRpm = rpm;
  }

  // Disconnect everything (the AudioContext itself is shared and stays).
  dispose() {
    this._killOneShots();
    for (const s of this.sources) { try { s.stop(); } catch { /* already stopped */ } s.disconnect(); }
    for (const nd of this.nodes) nd.disconnect();
    this.sources = []; this.nodes = [];
  }
}

// Adapter: flight model + camera -> the sound's inputs. `camPos` and
// `camInv` (the camera's world-inverse matrix elements) place the emitter in
// listener space for the panner; the closing speed for the Doppler shift
// comes from the aircraft and camera velocities.
const _prevCam = { x: 0, y: 0, z: 0, ok: false, vx: 0, vy: 0, vz: 0 };
export function ipanemaAudioState({ fm, acPos, camPos, camInv, inside, dt, cfg }) {
  const e = camInv;
  let rel = null, closing = 0, dist = 0;
  if (acPos && camPos) {
    const x = acPos.x, y = acPos.y, z = acPos.z;
    if (e) rel = [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]];
    const dx = x - camPos.x, dy = y - camPos.y, dz = z - camPos.z;
    dist = Math.hypot(dx, dy, dz);
    if (_prevCam.ok && dt > 0) {
      const k = Math.min(1, dt * 5);
      _prevCam.vx += ((camPos.x - _prevCam.x) / dt - _prevCam.vx) * k;
      _prevCam.vy += ((camPos.y - _prevCam.y) / dt - _prevCam.vy) * k;
      _prevCam.vz += ((camPos.z - _prevCam.z) / dt - _prevCam.vz) * k;
    }
    Object.assign(_prevCam, { x: camPos.x, y: camPos.y, z: camPos.z, ok: true });
    if (dist > 1 && fm.vel) {
      const rvx = fm.vel.x - _prevCam.vx, rvy = fm.vel.y - _prevCam.vy, rvz = fm.vel.z - _prevCam.vz;
      closing = -(rvx * dx + rvy * dy + rvz * dz) / dist;
    }
  }
  return {
    engine: fm.engine,
    rpm: fm.rpm,
    throttle: fm.throttle,
    // Constant-speed prop (EMB-203): the rpm is governed, so the load is the
    // shaft power; fixed pitch (EMB-202A): it follows the rpm.
    power: fm.engine === 'running' ? (fm.A?.radial ? clamp(fm.shaftPower / fm.A.maxPower, 0, 1) : Math.pow(clamp(fm.rpm / (fm.A?.maxRpm ?? 2700), 0, 1.1), 1.5)) : 0,
    cfg,
    inside: !!inside,
    rel, dist: Math.max(0, dist - 3), closing,
  };
}
