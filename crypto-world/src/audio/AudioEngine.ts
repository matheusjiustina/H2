import type { SurfaceMaterial } from '../world/Collision';

export interface AmbienceMix {
  wind: number;
  ocean: number;
  city: number;
  machines: number;
  birds: number;
  night: number;
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// Ambient harmony. The music has no beat and no melody: a low drone on a slowly wandering root,
// long overlapping "clouds" of open voicings, and the odd distant bell tone. Roots move every
// ~40 s; everything fades in and out over many seconds.
const DAY_ROOTS = [50, 43, 47, 45]; // D, G, B, A
const NIGHT_ROOTS = [45, 41, 40, 43]; // A, F, E, G
const DAY_COLOURS = [0, 7, 12, 14, 16, 19, 23, 26]; // root, 5th, octave, 9th, 3rd, 5th, maj7, 9th
const NIGHT_COLOURS = [0, 7, 10, 12, 14, 15, 19, 22]; // minor colours: b7, 9th, b3

/**
 * Procedural sound: every note and noise is synthesised at runtime, so the soundtrack is original
 * and weighs nothing to download. Buses: music, ambience and effects, each with its own volume.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private amb!: GainNode;
  private sfx!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private brownBuf!: AudioBuffer;
  private layers: Record<'wind' | 'ocean' | 'city' | 'machines', GainNode> = {} as any;
  private nextSectionAt = 0;
  private sectionIndex = 0;
  private root = 50;
  private nextSwellAt = 0;
  private nextBellAt = 0;
  private drone: { oscs: OscillatorNode[]; gain: GainNode } | null = null;
  private scheduler = 0;
  private night = 0;
  private birdsLevel = 0;
  private cricketLevel = 0;
  private nextBirdAt = 0;
  private nextCricketAt = 0;
  private volumes = { master: 0.8, music: 0.35, ambience: 0.7, sfx: 0.8 };
  private intensity = 0; // music swells during big moments
  started = false;

  /** Must be called from a user gesture. */
  start(): void {
    if (this.started) {
      this.ctx?.resume();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.connect(this.master);
    this.music = ctx.createGain();
    this.amb = ctx.createGain();
    this.sfx = ctx.createGain();
    this.music.connect(comp);
    this.amb.connect(comp);
    this.sfx.connect(comp);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(4.6, 2.2);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.9;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(comp);
    this.noiseBuf = this.makeNoise(false);
    this.brownBuf = this.makeNoise(true);
    this.buildAmbience();
    this.applyVolumes();
    this.started = true;
    this.nextSectionAt = ctx.currentTime + 0.5;
    this.nextSwellAt = ctx.currentTime + 1.5;
    this.nextBellAt = ctx.currentTime + 9;
    this.scheduler = window.setInterval(() => this.schedule(), 120);
  }

  dispose(): void {
    clearInterval(this.scheduler);
    this.ctx?.close();
  }

  setVolumes(v: { master: number; music: number; ambience: number; sfx: number }): void {
    this.volumes = { ...v };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.1);
    this.music.gain.setTargetAtTime(this.volumes.music * 0.3, t, 0.1);
    this.amb.gain.setTargetAtTime(this.volumes.ambience * 0.6, t, 0.1);
    this.sfx.gain.setTargetAtTime(this.volumes.sfx * 0.7, t, 0.1);
  }

  suspend(on: boolean): void {
    if (!this.ctx) return;
    if (on) this.ctx.suspend();
    else this.ctx.resume();
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private makeNoise(brown: boolean): AudioBuffer {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  private loopNoise(brown: boolean): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = brown ? this.brownBuf : this.noiseBuf;
    s.loop = true;
    s.start();
    return s;
  }

  private lfo(freq: number, depth: number, target: AudioParam): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g);
    g.connect(target);
    o.start();
  }

  private buildAmbience(): void {
    const ctx = this.ctx!;
    // Wind.
    {
      const src = this.loopNoise(false);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 420;
      bp.Q.value = 0.6;
      this.lfo(0.07, 180, bp.frequency);
      const g = ctx.createGain();
      g.gain.value = 0;
      const sway = ctx.createGain();
      sway.gain.value = 0.6;
      this.lfo(0.11, 0.35, sway.gain);
      src.connect(bp).connect(sway).connect(g).connect(this.amb);
      this.layers.wind = g;
    }
    // Ocean: brown noise with slow swells.
    {
      const src = this.loopNoise(true);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      this.lfo(0.13, 300, lp.frequency);
      const swell = ctx.createGain();
      swell.gain.value = 0.55;
      this.lfo(0.14, 0.45, swell.gain);
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(lp).connect(swell).connect(g).connect(this.amb);
      this.layers.ocean = g;
    }
    // City murmur.
    {
      const src = this.loopNoise(true);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 600;
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(bp).connect(g).connect(this.amb);
      this.layers.city = g;
    }
    // Machinery hum and fan whoosh.
    {
      const g = ctx.createGain();
      g.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      for (const [f, a] of [[55, 0.25], [110, 0.12], [165, 0.05]] as [number, number][]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        const og = ctx.createGain();
        og.gain.value = a;
        o.connect(og).connect(lp);
        o.start();
      }
      const fan = this.loopNoise(false);
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 1800;
      hp.Q.value = 0.4;
      const fg = ctx.createGain();
      fg.gain.value = 0.18;
      fan.connect(hp).connect(fg).connect(g);
      const trem = ctx.createGain();
      trem.gain.value = 0.8;
      this.lfo(3.1, 0.12, trem.gain);
      lp.connect(trem).connect(g);
      g.connect(this.amb);
      this.layers.machines = g;
    }
  }

  /** Called every frame with how much of each ambience the player should hear. */
  setAmbience(mix: AmbienceMix): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const k = 0.6;
    this.layers.wind.gain.setTargetAtTime(0.1 + mix.wind * 0.25, t, k);
    this.layers.ocean.gain.setTargetAtTime(mix.ocean * 0.55, t, k);
    this.layers.city.gain.setTargetAtTime(mix.city * 0.12 * (1 - mix.night * 0.6), t, k);
    this.layers.machines.gain.setTargetAtTime(mix.machines * 0.22, t, k);
    this.birdsLevel = mix.birds * (1 - mix.night);
    this.cricketLevel = mix.night * (0.4 + mix.birds * 0.6);
    this.night = mix.night;
  }

  setIntensity(v: number): void {
    this.intensity = v;
  }

  // ---------------------------------------------------------------- Music
  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const ahead = now + 0.4;
    // After a suspend (hidden tab) don't try to catch up on missed events all at once.
    if (this.nextSectionAt < now - 1) this.nextSectionAt = now + 0.1;
    if (this.nextSwellAt < now - 1) this.nextSwellAt = now + 0.1;
    if (this.nextBellAt < now - 1) this.nextBellAt = now + 2;
    const night = this.night > 0.5;
    if (this.nextSectionAt < ahead) {
      const roots = night ? NIGHT_ROOTS : DAY_ROOTS;
      this.root = roots[this.sectionIndex % roots.length];
      this.sectionIndex++;
      this.setDrone(this.root, this.nextSectionAt);
      this.nextSectionAt += 36 + Math.random() * 10;
    }
    if (this.nextSwellAt < ahead) {
      this.swell(this.nextSwellAt, night);
      this.nextSwellAt += 13 + Math.random() * 7;
    }
    if (this.nextBellAt < ahead) {
      if (Math.random() < 0.55 + this.intensity * 0.3) this.bell(this.nextBellAt, night);
      this.nextBellAt += 9 + Math.random() * 12;
    }
    // Ambient critters.
    if (ctx.currentTime > this.nextBirdAt) {
      if (this.birdsLevel > 0.05 && Math.random() < this.birdsLevel) this.bird();
      this.nextBirdAt = ctx.currentTime + 1.2 + Math.random() * 3;
    }
    if (ctx.currentTime > this.nextCricketAt) {
      if (this.cricketLevel > 0.1) this.cricket();
      this.nextCricketAt = ctx.currentTime + 0.8 + Math.random() * 1.6;
    }
  }

  /** Low drone on the current root: crossfades to the new root over ~10 s. */
  private setDrone(root: number, t: number): void {
    const ctx = this.ctx!;
    if (this.drone) {
      const old = this.drone;
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + 10);
      for (const o of old.oscs) o.stop(t + 10.5);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.036, t + 10);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    g.connect(lp);
    lp.connect(this.music);
    lp.connect(this.reverbSend);
    const oscs: OscillatorNode[] = [];
    for (const [n, type, det, lvl] of [[root - 12, 'sine', 0, 1], [root, 'triangle', -4, 0.45], [root + 7, 'sine', 3, 0.3]] as [number, OscillatorType, number, number][]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = midi(n);
      o.detune.value = det;
      const og = ctx.createGain();
      og.gain.value = lvl;
      o.connect(og).connect(g);
      o.start(t);
      oscs.push(o);
    }
    this.drone = { oscs, gain: g };
  }

  /** A slow cloud of three open-voiced notes that blooms and dissolves over ~25 s. */
  private swell(t: number, night: boolean): void {
    const ctx = this.ctx!;
    const colours = night ? NIGHT_COLOURS : DAY_COLOURS;
    const picks = new Set<number>();
    while (picks.size < 3) picks.add(colours[1 + Math.floor(Math.random() * (colours.length - 1))]);
    const dur = 22 + Math.random() * 8;
    const g = ctx.createGain();
    const peak = 0.03 * (1 + this.intensity * 0.4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + dur * 0.38);
    g.gain.linearRampToValueAtTime(peak * 0.8, t + dur * 0.62);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    const lo = night ? 320 : 420;
    const hi = (night ? 900 : 1300) * (1 + this.intensity * 0.5);
    lp.frequency.setValueAtTime(lo, t);
    lp.frequency.linearRampToValueAtTime(hi, t + dur * 0.45);
    lp.frequency.linearRampToValueAtTime(lo, t + dur);
    lp.Q.value = 0.4;
    g.connect(lp);
    lp.connect(this.music);
    const send = ctx.createGain();
    send.gain.value = 1.2;
    lp.connect(send).connect(this.reverbSend);
    for (const c of picks) {
      for (const det of [-7, 5]) {
        const o = ctx.createOscillator();
        o.type = det < 0 ? 'triangle' : 'sine';
        o.frequency.value = midi(this.root + 12 + c);
        o.detune.value = det;
        // A very slow vibrato keeps long notes from sounding static.
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.07 + Math.random() * 0.08;
        const lg = ctx.createGain();
        lg.gain.value = 4;
        lfo.connect(lg).connect(o.detune);
        o.connect(g);
        o.start(t);
        lfo.start(t);
        o.stop(t + dur + 0.2);
        lfo.stop(t + dur + 0.2);
      }
    }
  }

  /** A distant glassy tone, soft attack and a long tail in the reverb. */
  private bell(t: number, night: boolean): void {
    const ctx = this.ctx!;
    const colours = night ? NIGHT_COLOURS : DAY_COLOURS;
    const n = this.root + 24 + colours[2 + Math.floor(Math.random() * (colours.length - 2))];
    const f = midi(n);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.018, t + 1.6);
    g.gain.exponentialRampToValueAtTime(0.0004, t + 8);
    for (const [mul, lvl] of [[1, 1], [2.01, 0.18], [3.0, 0.06]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mul;
      const og = ctx.createGain();
      og.gain.value = lvl;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 8.2);
    }
    g.connect(this.music);
    const send = ctx.createGain();
    send.gain.value = 2.2;
    g.connect(send).connect(this.reverbSend);
  }

  private bird(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.05;
    const base = 2200 + Math.random() * 1800;
    const notes = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const st = t + i * (0.09 + Math.random() * 0.05);
      o.frequency.setValueAtTime(base, st);
      o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.4), st + 0.06);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.02 * this.birdsLevel, st + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.08);
      o.connect(g).connect(this.amb);
      g.connect(this.reverbSend);
      o.start(st);
      o.stop(st + 0.1);
    }
  }

  private cricket(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.05;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.frequency.value = 4400 + Math.random() * 200;
      const g = ctx.createGain();
      const st = t + i * 0.07;
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.006 * this.cricketLevel, st + 0.01);
      g.gain.linearRampToValueAtTime(0, st + 0.045);
      o.connect(g).connect(this.amb);
      o.start(st);
      o.stop(st + 0.06);
    }
  }

  // ---------------------------------------------------------------- Effects
  private noiseHit(t: number, dur: number, filter: BiquadFilterType, freq: number, q: number, vol: number, dest: AudioNode = this.sfx): void {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 3);
    s.stop(t + dur + 0.02);
  }

  private tone(freq: number, t: number, dur: number, vol: number, type: OscillatorType = 'sine', glideTo?: number, reverb = 0.3): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    if (reverb) {
      const s = ctx.createGain();
      s.gain.value = reverb;
      g.connect(s).connect(this.reverbSend);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  footstep(surface: SurfaceMaterial, running: boolean): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const v = running ? 0.22 : 0.15;
    switch (surface) {
      case 'grass': this.noiseHit(t, 0.09, 'lowpass', 900, 0.7, v * 0.8); break;
      case 'dirt': this.noiseHit(t, 0.08, 'lowpass', 700, 0.9, v); break;
      case 'stone': this.noiseHit(t, 0.045, 'bandpass', 2400, 1.2, v * 0.9); this.noiseHit(t, 0.03, 'lowpass', 400, 1, v * 0.6); break;
      case 'sand': this.noiseHit(t, 0.14, 'lowpass', 1600, 0.5, v * 0.7); break;
      case 'snow': this.noiseHit(t, 0.13, 'bandpass', 1300, 0.9, v * 0.9); break;
      case 'wood': this.tone(150 + Math.random() * 30, t, 0.09, v * 0.7, 'sine', 110, 0); this.noiseHit(t, 0.04, 'bandpass', 1500, 1, v * 0.5); break;
      case 'metal': this.tone(880 + Math.random() * 120, t, 0.12, v * 0.25, 'triangle', undefined, 0.1); this.noiseHit(t, 0.05, 'bandpass', 3200, 2, v * 0.6); break;
    }
  }

  land(): void {
    if (!this.ctx) return;
    this.noiseHit(this.ctx.currentTime, 0.16, 'lowpass', 500, 0.8, 0.25);
  }

  jump(): void {
    if (!this.ctx) return;
    this.noiseHit(this.ctx.currentTime, 0.08, 'bandpass', 1200, 0.8, 0.1);
  }

  /** Dialogue voice blip: each resident has their own pitch. */
  voice(pitch: number, object = false): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    if (object) {
      this.tone(900 + Math.random() * 300, t, 0.035, 0.035, 'square', undefined, 0);
      return;
    }
    const base = 230 * pitch * (0.9 + Math.random() * 0.25);
    this.tone(base, t, 0.07, 0.07, 'triangle', base * (0.9 + Math.random() * 0.25), 0.05);
  }

  /** Small animal voices, synthesised to sit with the toy-like art. */
  critter(kind: 'bark' | 'meow' | 'gull'): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.01;
    switch (kind) {
      case 'bark':
        for (const k of [0, 0.17]) {
          this.tone(430, t + k, 0.11, 0.08, 'sawtooth', 250, 0.15);
          this.noiseHit(t + k, 0.07, 'bandpass', 900, 1.4, 0.1);
        }
        break;
      case 'meow':
        this.tone(600, t, 0.24, 0.045, 'triangle', 900, 0.2);
        this.tone(900, t + 0.22, 0.34, 0.04, 'triangle', 520, 0.25);
        break;
      case 'gull':
        for (const k of [0, 0.24, 0.44]) this.tone(1500, t + k, 0.18, 0.018, 'triangle', 1000, 0.5);
        break;
    }
  }

  ui(kind: 'select' | 'confirm' | 'open' | 'close' | 'tick'): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    switch (kind) {
      case 'select': this.tone(660, t, 0.06, 0.05, 'sine'); break;
      case 'confirm': this.tone(784, t, 0.08, 0.06); this.tone(1046, t + 0.06, 0.12, 0.05); break;
      case 'open': this.tone(523, t, 0.1, 0.05); this.tone(784, t + 0.05, 0.14, 0.045); break;
      case 'close': this.tone(784, t, 0.08, 0.04); this.tone(523, t + 0.05, 0.12, 0.04); break;
      case 'tick': this.tone(1318, t, 0.05, 0.03); break;
    }
  }

  chime(kind: 'mission-start' | 'objective' | 'mission-complete' | 'item' | 'secret' | 'beacon' | 'finale'): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.02;
    const arp = (notes: number[], step: number, vol: number, dur = 1.2, type: OscillatorType = 'sine') =>
      notes.forEach((n, i) => this.tone(midi(n), t + i * step, dur, vol, type, undefined, 0.6));
    switch (kind) {
      case 'mission-start': arp([67, 71, 74], 0.09, 0.06); break;
      case 'objective': arp([74, 79], 0.08, 0.05, 0.8); break;
      case 'mission-complete': arp([62, 66, 69, 74, 78, 81], 0.1, 0.06, 1.8, 'triangle'); break;
      case 'item': arp([79, 83, 86], 0.06, 0.05, 0.9); break;
      case 'secret': arp([72, 76, 79, 84, 88], 0.11, 0.05, 2.2, 'triangle'); this.noiseHit(t, 1.2, 'highpass', 6000, 0.5, 0.03); break;
      case 'beacon': this.tone(110, t, 3, 0.12, 'sawtooth', 220, 0.8); arp([62, 69, 74, 81], 0.25, 0.05, 2.5); break;
      case 'finale': arp([50, 57, 62, 66, 69, 74, 78, 81, 86], 0.18, 0.06, 4, 'triangle'); break;
    }
  }
}
