// Synthesized audio (Web Audio): piston engine (6-cyl firing frequency from
// rpm; or the Dromader's nine-cylinder radial with its uneven idle, pops,
// coughs on start and inertia-starter whine) or PT6 turboprop (compressor whine and gas-generator hum from Ng,
// exhaust roar with power, light-off whoosh), propeller buzz at blade-pass
// frequency; for the helicopter, main-rotor blade passage (2/rev noise
// pulses and low "whop", blade slap in descents), tail-rotor buzz and the
// main-gearbox whine, all from the simulated rotor speed; wind, wheel rumble,
// spray hiss,
// stall horn, starter, one-shots, and a quiet rural ambience at the base
// (cicadas, birds, breeze). The Ipanema has its own layered engine model
// (ipanemaEngine.js). Nothing is loaded from files.
import { clamp, smoothstep } from '../core/math.js';
import { IpanemaEngineSound } from './ipanemaEngine.js';

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
    // Radial lope: two slow, unrelated modulators on the engine level make the
    // nine-cylinder idle uneven.
    this.lopeDepth = ctx.createGain();
    this.lopeDepth.gain.value = 0;
    this.lopeDepth.connect(this.engGain.gain);
    this.lope = ctx.createOscillator(); this.lope.type = 'sine'; this.lope.frequency.value = 4;
    this.lope2 = ctx.createOscillator(); this.lope2.type = 'triangle'; this.lope2.frequency.value = 1.3;
    const l2 = ctx.createGain(); l2.gain.value = 0.7;
    this.lope.connect(this.lopeDepth);
    this.lope2.connect(l2).connect(this.lopeDepth);
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
    // Turboprop: compressor whine (two tones from Ng), gas-generator hum,
    // exhaust roar.
    this.tWhine = ctx.createOscillator(); this.tWhine.type = 'sine';
    this.tWhine2 = ctx.createOscillator(); this.tWhine2.type = 'sine';
    this.tWhineGain = ctx.createGain(); this.tWhineGain.gain.value = 0;
    this.tWhine2Gain = ctx.createGain(); this.tWhine2Gain.gain.value = 0;
    this.tWhine.connect(this.tWhineGain).connect(this.acBus);
    this.tWhine2.connect(this.tWhine2Gain).connect(this.acBus);
    this.tHum = ctx.createOscillator(); this.tHum.type = 'triangle';
    const humLP = ctx.createBiquadFilter(); humLP.type = 'lowpass'; humLP.frequency.value = 600;
    this.tHumGain = ctx.createGain(); this.tHumGain.gain.value = 0;
    this.tHum.connect(humLP).connect(this.tHumGain).connect(this.acBus);
    this.tRoar = this._noise(this.pink);
    this.tRoarBP = ctx.createBiquadFilter(); this.tRoarBP.type = 'bandpass'; this.tRoarBP.Q.value = 0.6;
    this.tRoarGain = ctx.createGain(); this.tRoarGain.gain.value = 0;
    this.tRoar.connect(this.tRoarBP).connect(this.tRoarGain).connect(this.acBus);
    // Helicopter rotor: one pulse-train modulator at the main-rotor blade
    // passage frequency drives a mid band (blade "chop"/slap) and a low band
    // ("whop"); tail rotor buzz; gearbox whine.
    {
      const N = 24, re = new Float32Array(N), im = new Float32Array(N), duty = 0.16;
      for (let k = 1; k < N; k++) re[k] = (2 * Math.sin(Math.PI * k * duty)) / (Math.PI * k);
      this.hMod = ctx.createOscillator();
      this.hMod.setPeriodicWave(ctx.createPeriodicWave(re, im));
      this.hMod.frequency.value = 1;
      this.hChop = this._noise(this.pink);
      this.hChopBP = ctx.createBiquadFilter(); this.hChopBP.type = 'bandpass'; this.hChopBP.frequency.value = 260; this.hChopBP.Q.value = 0.8;
      this.hChopAM = ctx.createGain(); this.hChopAM.gain.value = 0;
      this.hChopGain = ctx.createGain(); this.hChopGain.gain.value = 0;
      this.hChop.connect(this.hChopBP).connect(this.hChopAM).connect(this.hChopGain).connect(this.acBus);
      this.hWop = this._noise(this.brown);
      this.hWopLP = ctx.createBiquadFilter(); this.hWopLP.type = 'lowpass'; this.hWopLP.frequency.value = 150;
      this.hWopAM = ctx.createGain(); this.hWopAM.gain.value = 0;
      this.hWopGain = ctx.createGain(); this.hWopGain.gain.value = 0;
      this.hWop.connect(this.hWopLP).connect(this.hWopAM).connect(this.hWopGain).connect(this.acBus);
      this.hMod.connect(this.hChopAM.gain);
      this.hMod.connect(this.hWopAM.gain);
      this.hTail = ctx.createOscillator(); this.hTail.type = 'sawtooth';
      this.hTailBP = ctx.createBiquadFilter(); this.hTailBP.type = 'bandpass'; this.hTailBP.Q.value = 1.1;
      this.hTailGain = ctx.createGain(); this.hTailGain.gain.value = 0;
      this.hTail.connect(this.hTailBP).connect(this.hTailGain).connect(this.acBus);
      this.hWhine = ctx.createOscillator(); this.hWhine.type = 'sine';
      this.hWhineGain = ctx.createGain(); this.hWhineGain.gain.value = 0;
      this.hWhine.connect(this.hWhineGain).connect(this.acBus);
    }
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
    this.breezeGain = bG;
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
    // Rain: fine hiss + softer patter; through a low-pass that closes in the cabin.
    this.rainLP = ctx.createBiquadFilter();
    this.rainLP.type = 'lowpass'; this.rainLP.frequency.value = 9000;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    this.rainLP.connect(this.rainGain).connect(this.master);
    const rh = this._noise(this.white);
    const rhHP = ctx.createBiquadFilter(); rhHP.type = 'highpass'; rhHP.frequency.value = 2400;
    const rhG = ctx.createGain(); rhG.gain.value = 0.5;
    rh.connect(rhHP).connect(rhG).connect(this.rainLP);
    const rp = this._noise(this.pink);
    const rpBP = ctx.createBiquadFilter(); rpBP.type = 'bandpass'; rpBP.frequency.value = 1100; rpBP.Q.value = 0.7;
    rp.connect(rpBP).connect(this.rainLP);
    // Service truck diesel: firing pulse train + rumble, low-passed, spatialised by distance.
    this.truckOsc = ctx.createOscillator(); this.truckOsc.type = 'sawtooth'; this.truckOsc.frequency.value = 38;
    this.truckSub = ctx.createOscillator(); this.truckSub.type = 'square'; this.truckSub.frequency.value = 19;
    this.truckLP = ctx.createBiquadFilter(); this.truckLP.type = 'lowpass'; this.truckLP.frequency.value = 320; this.truckLP.Q.value = 1.2;
    this.truckGain = ctx.createGain(); this.truckGain.gain.value = 0;
    const tsG = ctx.createGain(); tsG.gain.value = 0.5;
    this.truckOsc.connect(this.truckLP);
    this.truckSub.connect(tsG).connect(this.truckLP);
    this.truckLP.connect(this.truckGain).connect(this.master);
    // Distant farm tractor: a lower, steadier diesel drone.
    this.tracOsc = ctx.createOscillator(); this.tracOsc.type = 'sawtooth'; this.tracOsc.frequency.value = 29;
    this.tracLP = ctx.createBiquadFilter(); this.tracLP.type = 'lowpass'; this.tracLP.frequency.value = 220;
    this.tracGain = ctx.createGain(); this.tracGain.gain.value = 0;
    this.tracOsc.connect(this.tracLP).connect(this.tracGain).connect(this.master);
    this.hangarT = 3;
    // The Ipanema's own layered engine (src/audio/ipanemaEngine.js), on the
    // same context; silent unless the Ipanema is flown.
    this.ipa = new IpanemaEngineSound(ctx, this.master, { white: this.white, pink: this.pink, brown: this.brown });
    for (const o of [this.eng, this.engSub, this.clatMod, this.prop, this.starter, this.horn, this.pump, cicMod, this.tWhine, this.tWhine2, this.tHum, this.truckOsc, this.truckSub, this.tracOsc, this.hMod, this.hTail, this.hWhine, this.lope, this.lope2]) o.start();
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
    // GE H80 (Thrush 510G): the same turboprop layers with its own tones —
    // a higher compressor whine (two axial stages ahead of the centrifugal),
    // a brighter exhaust roar and the four-blade prop's blade-pass.
    const h80 = s.profile === 'h80';
    // Bell 206 (Allison 250-C20J turboshaft): the turbine layers (a sharper,
    // higher whine from the centrifugal compressor, a softer roar from the
    // upturned exhausts on the roof) under the helicopter rotor layers.
    const c20 = s.profile === 'c20';
    const turbo = s.profile === 'turboprop' || h80 || c20;
    const heli = s.profile === 'heli' || c20;
    // Radial (ASz-62IR): nine cylinders, 4.5 firings per crank revolution,
    // deeper exhaust, geared four-blade prop.
    const radial = s.profile === 'radial';
    const fire = Math.max(1, (rpm / 60) * (radial ? 4.5 : 3));
    const on = turbo ? smoothstep(3, 30, s.ng ?? 0) : smoothstep(150, 500, rpm) * (run ? 1 : 0.15);
    const load = clamp(turbo ? s.power ?? 0 : s.throttle, 0, 1);
    // The Ipanema has its own engine sound; the generic piston layers stay
    // for the other piston aircraft.
    const ipa = s.profile === 'ipanema';
    this.ipa.update(dt, s.ipa, ipa);
    const piston = turbo || ipa ? 0 : 1;
    this.eng.frequency.setTargetAtTime(fire, t, 0.04);
    this.engSub.frequency.setTargetAtTime(fire / 2, t, 0.04);
    this.engLP.frequency.setTargetAtTime(radial ? 150 + 800 * load + rpm * 0.28 : 220 + 1200 * load + rpm * 0.35, t, 0.08);
    const dist = s.listenerDist ?? 0;
    const att = s.inside ? 1 : 1 / (1 + dist / 40);
    // The R44's engine sits behind the cabin under the rotor: a little quieter
    // than the airplanes' (the rotor dominates outside).
    const engK = heli ? 0.75 : 1;
    const crankChug = radial && s.engine === 'cranking' ? 0.07 : 0;
    this.engGain.gain.setTargetAtTime((piston * on * (radial ? 0.2 + 0.26 * load : 0.16 + 0.22 * load) * engK * (s.rough ? 0.8 + Math.random() * 0.4 : 1) + crankChug) * att, t, k);
    if (radial) {
      this.lope.frequency.setTargetAtTime(Math.max(1, rpm / 120), t, 0.1);
      this.lopeDepth.gain.setTargetAtTime(on * (1 - smoothstep(600, 1500, rpm)) * 0.07 * att, t, 0.1);
      // Idle pops and the crackle of a closed throttle at high rpm.
      const chop = (this._lastThr ?? s.throttle) - s.throttle > 0.02 && rpm > 1400;
      if (s.engine === 'running' && ((rpm < 900 && Math.random() < dt * 0.7) || (chop && Math.random() < 0.5))) this.play('pop', { volume: att * (chop ? 0.9 : 0.6) });
    } else this.lopeDepth.gain.setTargetAtTime(0, t, 0.1);
    this._lastThr = s.throttle;
    this.clatMod.frequency.setTargetAtTime(fire, t, 0.04);
    this.clatBP.frequency.setTargetAtTime(600 + rpm * 0.4, t, 0.1);
    this.clatGain.gain.setTargetAtTime(piston * on * (0.05 + 0.06 * load) * att, t, k);
    // PT6: the whine follows the gas generator, the roar follows power.
    const ng = s.ng ?? 0;
    this.tWhine.frequency.setTargetAtTime(c20 ? 2400 + ng * 64 : h80 ? 1850 + ng * 66 : 1500 + ng * 58, t, 0.08);
    this.tWhine2.frequency.setTargetAtTime(c20 ? 420 + ng * 30 : h80 ? 360 + ng * 27 : 280 + ng * 24, t, 0.08);
    this.tHum.frequency.setTargetAtTime(Math.max(20, ng * (c20 ? 4.2 : h80 ? 3.7 : 3.2)), t, 0.08);
    this.tWhineGain.gain.setTargetAtTime(turbo ? on * (s.inside ? 0.006 : 0.011 + 0.008 * load) * att : 0, t, k);
    this.tWhine2Gain.gain.setTargetAtTime(turbo ? on * (0.008 + 0.006 * load) * att : 0, t, k);
    this.tHumGain.gain.setTargetAtTime(turbo ? on * (0.05 + 0.04 * load) * att * (s.rough ? 0.8 + Math.random() * 0.4 : 1) : 0, t, k);
    this.tRoarBP.frequency.setTargetAtTime((h80 ? 460 : 380) + load * (h80 ? 1050 : 900), t, 0.1);
    this.tRoarGain.gain.setTargetAtTime(turbo ? on * (0.03 + 0.2 * load) * att * (c20 ? 0.55 : 1) : 0, t, k);
    const bpf = Math.max(1, ((rpm * (s.propGear ?? 1)) / 60) * (turbo || radial ? s.blades ?? 3 : 2));
    this.prop.frequency.setTargetAtTime(bpf, t, 0.04);
    this.propBP.frequency.setTargetAtTime(bpf * 3, t, 0.05);
    const pr = turbo ? smoothstep(250, 2200, rpm) : smoothstep(300, 2700, rpm);
    // A turboprop's prop gets much louder as the governor loads the blades.
    const pl = turbo ? 0.35 + 1.1 * load : 0.6 + 0.6 * load;
    this.propGain.gain.setTargetAtTime(heli || ipa ? 0 : pr * (s.inside ? 0.04 : 0.12) * att * pl, t, k);
    this.propNBP.frequency.setTargetAtTime(150 + rpm * 0.25, t, 0.1);
    this.propNGain.gain.setTargetAtTime(heli || ipa ? 0 : pr * pr * (s.inside ? 0.08 : 0.2) * att * (turbo ? 0.6 + 0.8 * load : 1), t, k);
    // Helicopter rotor system (follows the rotor, not the engine: it keeps
    // turning after shutdown and spins up slowly through the clutch).
    {
      const nr = clamp((s.rotorPct ?? 0) / 100, 0, 1.2);
      const lvl = heli ? smoothstep(0.02, 0.55, nr) * (0.35 + 0.65 * Math.min(1, nr)) : 0;
      const bpf = Math.max(0.3, ((s.rotorRpm ?? 0) / 60) * (s.blades ?? 2));
      const coll = clamp(s.collective ?? 0, 0, 1);
      // Blade slap: descending at moderate speed into the blades' own vortices,
      // and in settling with power.
      const bvi = clamp(smoothstep(-0.8, -3.5, s.vs ?? 0) * smoothstep(10, 22, s.airspeed) * (1 - smoothstep(40, 60, s.airspeed)) + (s.vrs ?? 0), 0, 1);
      const hAtt = s.inside ? 1 : 1 / (1 + dist / 70);
      this.hMod.frequency.setTargetAtTime(bpf, t, 0.05);
      this.hChopBP.frequency.setTargetAtTime(180 + 260 * coll + 500 * bvi, t, 0.1);
      this.hChopGain.gain.setTargetAtTime(lvl * (0.07 + 0.16 * coll + 0.3 * bvi) * hAtt * (s.inside ? 0.55 : 1), t, k);
      this.hWopGain.gain.setTargetAtTime(lvl * (0.22 + 0.25 * coll) * hAtt * (s.inside ? 0.8 : 1), t, k);
      const tf = Math.max(1, ((s.rotorRpm ?? 0) / 60) * (s.tailGear ?? 6) * 2);
      this.hTail.frequency.setTargetAtTime(tf, t, 0.05);
      this.hTailBP.frequency.setTargetAtTime(tf * 3.5, t, 0.08);
      this.hTailGain.gain.setTargetAtTime(lvl * nr * (s.inside ? 0.008 : 0.03 + 0.02 * coll) * hAtt, t, k);
      this.hWhine.frequency.setTargetAtTime(Math.max(30, (s.rotorRpm ?? 0) * 4.1), t, 0.08);
      this.hWhineGain.gain.setTargetAtTime(lvl * (s.inside ? 0.007 : 0.0025) * hAtt, t, k);
    }
    // The radial's inertia starter: a flywheel whine that rises as it spins up.
    this.starterGain.gain.setTargetAtTime(s.engine === 'cranking' && !turbo && !ipa ? (radial ? 0.06 : 0.08) : 0, t, 0.05);
    this.starter.frequency.setTargetAtTime(s.engine === 'cranking' ? (radial ? 380 + rpm * 2.6 : 160 + rpm * 0.6) : 120, t, radial ? 0.6 : 0.2);
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
    // Service truck (diesel): revs with its throttle, fades with distance.
    const tk = s.truck;
    if (tk) {
      const f = 34 + 46 * tk.rev;
      this.truckOsc.frequency.setTargetAtTime(f, t, 0.15);
      this.truckSub.frequency.setTargetAtTime(f / 2, t, 0.15);
      this.truckLP.frequency.setTargetAtTime(240 + 520 * tk.load, t, 0.2);
      this.truckGain.gain.setTargetAtTime(tk.on ? (0.035 + 0.05 * tk.load) * tk.att * (s.inside ? 0.45 : 1) : 0, t, 0.25);
    }
    // Tractor working the fallow field, heard from the ground nearby.
    const trac = s.tractor ?? 0;
    this.tracOsc.frequency.setTargetAtTime(29 + 2.5 * Math.sin(t * 0.7), t, 0.3);
    this.tracGain.gain.setTargetAtTime(0.05 * trac * (s.inside ? 0.4 : 1), t, 0.5);
    // Hangar: now and then a tool, a ratchet, a dropped part.
    if ((s.hangar ?? 0) > 0.05) {
      this.hangarT -= dt;
      if (this.hangarT <= 0) {
        this.hangarT = 2.5 + Math.random() * 6;
        this.play(Math.random() < 0.55 ? 'ratchet' : 'clank', { volume: 0.5 * s.hangar });
      }
    }
    // Weather (visual-only settings): rain bed, fewer birds, more breeze in gusty weather.
    const W = s.weather ?? { rain: 0, birds: 1, insects: 1, gust: 1 };
    this.rainLP.frequency.setTargetAtTime(s.inside ? 1600 : 9000, t, 0.3);
    this.rainGain.gain.setTargetAtTime(W.rain * (s.inside ? 0.05 : 0.075), t, 1.0);
    this.breezeGain.gain.setTargetAtTime(0.12 * (0.5 + 0.6 * W.gust), t, 1.0);
    // Ambience near the base, ducked by the engine.
    const ambT = s.ambience * (1 - 0.7 * on);
    this.amb.gain.setTargetAtTime(ambT * 0.9, t, 0.6);
    this.cicT -= dt;
    if (this.cicT <= 0) {
      this.cicOn = !this.cicOn;
      this.cicT = this.cicOn ? 3 + Math.random() * 5 : 4 + Math.random() * 9;
      this.cicGain.gain.setTargetAtTime(this.cicOn ? 0.05 * W.insects : 0, t, this.cicOn ? 1.2 : 0.6);
    }
    this.birdT -= dt;
    if (this.birdT <= 0 && ambT > 0.15) {
      this.birdT = (1.5 + Math.random() * 6) / Math.max(0.05, W.birds);
      if (Math.random() < W.birds) this._bird(ambT);
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
      case 'ratchet': for (let i = 0; i < 5 + Math.floor(Math.random() * 4); i++) tone(0.018, 2600, 2300, 0.03, 'square', i * 0.085); break;
      case 'starter': break;
      case 'catch':
        // Piston engine catching: a few uneven firing pops, then it runs.
        for (const [d, f] of [[0, 70], [0.14, 62], [0.24, 75], [0.31, 68], [0.37, 80]]) tone(0.11, f, f * 0.6, 0.22, 'sawtooth', d);
        burst(0.5, 160, 0.7, 0.18, 'lowpass', this.brown);
        break;
      case 'cough':
        // One cylinder firing on its own: a bang and a low thud.
        tone(0.2, 58, 34, 0.32, 'sawtooth');
        burst(0.45, 130, 0.7, 0.32, 'lowpass', this.brown);
        break;
      case 'catchRadial':
        // The radial catching: a ragged string of bangs settling into a rumble.
        for (const [d, f] of [[0, 52], [0.08, 61], [0.19, 48], [0.24, 66], [0.33, 55], [0.41, 70], [0.46, 58], [0.53, 74], [0.6, 62]]) tone(0.12, f, f * 0.55, 0.24, 'sawtooth', d);
        burst(1.1, 150, 0.7, 0.28, 'lowpass', this.brown);
        break;
      case 'pop':
        burst(0.08, 260, 0.8, 0.14, 'lowpass', this.brown);
        tone(0.06, 85, 50, 0.07, 'sawtooth');
        break;
      case 'lightoff': {
        // Fuel lights in the combustor: a soft rising whoosh.
        const sN = ctx.createBufferSource();
        sN.buffer = this.pink;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.Q.value = 0.7;
        f.frequency.setValueAtTime(180, t);
        f.frequency.exponentialRampToValueAtTime(1400, t + 1.4);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25 * volume, t + 0.35);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
        sN.connect(f).connect(g).connect(this.acBus);
        sN.start(t, Math.random());
        sN.stop(t + 2.5);
        break;
      }
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
