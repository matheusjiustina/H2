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

// Chord progressions (MIDI notes). Day: warm major colours; night: softer, open voicings.
const DAY_CHORDS = [
  [50, 57, 62, 66, 69], // Dmaj9-ish
  [47, 54, 59, 62, 66], // Bm7
  [43, 50, 55, 59, 62], // Gmaj7
  [45, 52, 57, 61, 64], // A6
];
const NIGHT_CHORDS = [
  [45, 52, 57, 60, 64], // Am9
  [41, 48, 53, 57, 60], // Fmaj7
  [43, 50, 55, 58, 62], // Gm
  [40, 47, 52, 55, 59], // Em7
];
const DAY_SCALE = [62, 64, 66, 69, 71, 74, 76, 78, 81];
const NIGHT_SCALE = [57, 60, 62, 64, 67, 69, 72, 74];

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
  private delay!: DelayNode;
  private noiseBuf!: AudioBuffer;
  private brownBuf!: AudioBuffer;
  private layers: Record<'wind' | 'ocean' | 'city' | 'machines', GainNode> = {} as any;
  private nextChordAt = 0;
  private chordIndex = 0;
  private nextNoteAt = 0;
  private scheduler = 0;
  private night = 0;
  private birdsLevel = 0;
  private cricketLevel = 0;
  private nextBirdAt = 0;
  private nextCricketAt = 0;
  private volumes = { master: 0.8, music: 0.55, ambience: 0.7, sfx: 0.8 };
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
    this.reverb.buffer = this.makeImpulse(3.2, 2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.9;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(comp);
    this.delay = ctx.createDelay(1.5);
    this.delay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 2400;
    this.delay.connect(dl);
    dl.connect(fb);
    fb.connect(this.delay);
    dl.connect(this.reverbSend);
    dl.connect(this.music);
    this.noiseBuf = this.makeNoise(false);
    this.brownBuf = this.makeNoise(true);
    this.buildAmbience();
    this.applyVolumes();
    this.started = true;
    this.nextChordAt = ctx.currentTime + 0.5;
    this.nextNoteAt = ctx.currentTime + 2;
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
    this.music.gain.setTargetAtTime(this.volumes.music * 0.5, t, 0.1);
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
    const ahead = ctx.currentTime + 0.4;
    const night = this.night > 0.5;
    const chords = night ? NIGHT_CHORDS : DAY_CHORDS;
    while (this.nextChordAt < ahead) {
      const chord = chords[this.chordIndex % chords.length];
      this.pad(chord, this.nextChordAt, 9.6);
      this.bass(chord[0] - 12, this.nextChordAt, 9.6);
      this.chordIndex++;
      this.nextChordAt += 9.6;
    }
    while (this.nextNoteAt < ahead) {
      const scale = night ? NIGHT_SCALE : DAY_SCALE;
      const density = night ? 0.35 : 0.55 + this.intensity * 0.3;
      if (Math.random() < density) {
        const n = scale[Math.floor(Math.random() * scale.length)];
        this.pluck(midi(n), this.nextNoteAt, 0.06 + Math.random() * 0.04);
        if (Math.random() < 0.25) this.pluck(midi(n + (Math.random() < 0.5 ? 7 : 12)), this.nextNoteAt + 0.3, 0.035);
      }
      this.nextNoteAt += [0.6, 0.6, 1.2, 0.9, 1.8][Math.floor(Math.random() * 5)];
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

  private pad(chord: number[], t: number, dur: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.045, t + 2.5);
    g.gain.setValueAtTime(0.045, t + dur - 2);
    g.gain.linearRampToValueAtTime(0, t + dur + 1.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = this.night > 0.5 ? 900 : 1500;
    g.connect(lp);
    lp.connect(this.music);
    lp.connect(this.reverbSend);
    for (const n of chord.slice(1)) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = midi(n);
        o.detune.value = det;
        o.connect(g);
        o.start(t);
        o.stop(t + dur + 2);
      }
    }
  }

  private bass(n: number, t: number, dur: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = midi(n);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 1.2);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(this.music);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  private pluck(freq: number, t: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = freq * 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 1.8);
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.music);
    g.connect(this.delay);
    g.connect(this.reverbSend);
    o.start(t);
    o2.start(t);
    o.stop(t + 2);
    o2.stop(t + 2);
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
