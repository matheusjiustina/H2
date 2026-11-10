import { clamp } from './util';
import type { Settings } from './save';

type Wave = OscillatorType;

/**
 * Everything you hear is synthesised at runtime with WebAudio – no asset files,
 * so there is nothing to license and nothing that can fail to load.
 */
export class AudioSys {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noiseBuf!: AudioBuffer;
  private loops: Record<string, { gain: GainNode; osc?: OscillatorNode; filter?: BiquadFilterNode; lfo?: OscillatorNode }> = {};
  listener = { x: 0, z: 0 };
  private step = 0;
  private nextNote = 0;
  private last: Record<string, number> = {};
  musicMood = 0; // 0 calm, 1 chase

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.connect(this.master);
    this.music = c.createGain();
    this.music.connect(this.master);
    this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.loop('engine', 'sawtooth', 60, 400);
    this.loop('siren', 'square', 700, 1800);
    this.loop('rotor', 'noise', 0, 260);
    this.loop('wind', 'noise', 0, 700);
    this.loop('crowd', 'noise', 0, 900);
    this.loop('city', 'noise', 0, 180);
    // rotor chop + siren wail
    const chop = c.createOscillator();
    chop.frequency.value = 13;
    const cg = c.createGain();
    cg.gain.value = 0.5;
    chop.connect(cg).connect(this.loops.rotor.gain.gain);
    chop.start();
    const wail = c.createOscillator();
    wail.frequency.value = 0.9;
    const wg = c.createGain();
    wg.gain.value = 260;
    wail.connect(wg).connect(this.loops.siren.osc!.frequency);
    wail.start();
  }

  private loop(name: string, type: Wave | 'noise', freq: number, cutoff: number) {
    const c = this.ctx!;
    const gain = c.createGain();
    gain.gain.value = 0;
    const filter = c.createBiquadFilter();
    filter.type = name === 'crowd' ? 'bandpass' : 'lowpass';
    filter.frequency.value = cutoff;
    filter.connect(gain).connect(this.sfx);
    if (type === 'noise') {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      src.connect(filter);
      src.start();
      this.loops[name] = { gain, filter };
    } else {
      const osc = c.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.connect(filter);
      osc.start();
      this.loops[name] = { gain, osc, filter };
    }
  }

  applySettings(s: Settings) {
    if (!this.ctx) return;
    this.master.gain.value = s.master;
    this.sfx.gain.value = s.sfx;
    this.music.gain.value = s.music * 0.5;
  }

  setLoop(name: string, vol: number, freq?: number) {
    const l = this.loops[name];
    if (!l || !this.ctx) return;
    const t = this.ctx.currentTime;
    l.gain.gain.setTargetAtTime(vol, t, 0.08);
    if (freq !== undefined && l.osc && name !== 'siren') l.osc.frequency.setTargetAtTime(freq, t, 0.06);
  }

  silence() {
    for (const k of Object.keys(this.loops)) this.setLoop(k, 0);
  }

  private tone(type: Wave, f0: number, f1: number, dur: number, vol: number, delay = 0, dest: AudioNode = this.sfx) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, cutoff: number, type: BiquadFilterType = 'lowpass', delay = 0, sweep = 0) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loopStart = Math.random();
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(cutoff, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, cutoff + sweep), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }

  /** One-shot effect. With a position it is attenuated by distance to the listener. */
  play(name: string, vol = 1, x?: number, z?: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (x !== undefined && z !== undefined) {
      const d = Math.hypot(x - this.listener.x, z - this.listener.z);
      vol *= clamp(1 - d / 85, 0, 1) ** 1.6;
      if (vol < 0.02) return;
    }
    const now = this.ctx.currentTime;
    if (now - (this.last[name] ?? -1) < 0.035) return;
    this.last[name] = now;
    const v = vol * 0.5;
    switch (name) {
      case 'step': this.noise(0.05, v * 0.5, 900, 'bandpass'); break;
      case 'jump': this.tone('sine', 240, 420, 0.12, v * 0.5); break;
      case 'land': this.noise(0.14, v, 300); this.tone('sine', 110, 50, 0.14, v); break;
      case 'whoosh': this.noise(0.18, v * 0.6, 1400, 'bandpass', 0, -900); break;
      case 'punch': this.noise(0.07, v, 1100); this.tone('sine', 190, 70, 0.1, v); break;
      case 'punchBig': this.noise(0.12, v * 1.2, 800); this.tone('sine', 150, 45, 0.2, v * 1.3); break;
      case 'hit': case 'bonk': this.tone('triangle', 320, 120, 0.12, v); this.noise(0.05, v * 0.6, 1500); break;
      case 'ko': this.tone('square', 520, 130, 0.3, v * 0.5); this.tone('sine', 780, 1200, 0.18, v * 0.4, 0.05); break;
      case 'hurt': this.tone('sawtooth', 220, 90, 0.2, v * 0.6); this.noise(0.1, v * 0.5, 700); break;
      case 'pop': this.tone('square', 900, 260, 0.07, v * 0.5); this.noise(0.04, v * 0.5, 3000, 'highpass'); break;
      case 'thump': this.tone('sine', 140, 40, 0.3, v * 1.2); this.noise(0.15, v * 0.6, 500); break;
      case 'mega': this.tone('sawtooth', 300, 620, 0.3, v * 0.6); this.tone('sawtooth', 310, 640, 0.3, v * 0.5); this.noise(0.3, v * 0.5, 2000, 'bandpass'); break;
      case 'throw': this.noise(0.12, v * 0.5, 1800, 'bandpass', 0, 900); break;
      case 'splat': this.noise(0.1, v, 600); this.tone('sine', 200, 80, 0.08, v * 0.6); break;
      case 'clang': this.tone('square', 1300, 900, 0.16, v * 0.4); this.tone('triangle', 2100, 1700, 0.2, v * 0.3); break;
      case 'crash': this.noise(0.3, v * 1.2, 2200, 'lowpass', 0, -1800); this.tone('square', 150, 50, 0.2, v * 0.5); break;
      case 'boom': this.noise(0.7, v * 1.6, 900, 'lowpass', 0, -800); this.tone('sine', 90, 28, 0.6, v * 1.6); break;
      case 'horn': this.tone('square', 392, 392, 0.32, v * 0.35); this.tone('square', 494, 494, 0.32, v * 0.3); break;
      case 'door': this.noise(0.06, v * 0.7, 500); this.tone('sine', 120, 70, 0.08, v * 0.6); break;
      case 'reload': this.noise(0.04, v, 2500, 'highpass'); this.noise(0.05, v, 1800, 'highpass', 0.12); break;
      case 'empty': this.tone('square', 180, 160, 0.05, v * 0.4); break;
      case 'chute': this.noise(0.5, v, 500, 'lowpass', 0, 1500); break;
      case 'splash': this.noise(0.45, v, 1800, 'lowpass', 0, -1400); break;
      case 'alert': this.tone('square', 880, 880, 0.08, v * 0.4); this.tone('square', 1175, 1175, 0.12, v * 0.4, 0.09); break;
      case 'ui': this.tone('square', 660, 660, 0.05, v * 0.3); break;
      case 'uiBack': this.tone('square', 440, 330, 0.07, v * 0.3); break;
      case 'pickup': this.tone('square', 880, 880, 0.07, v * 0.35); this.tone('square', 1320, 1320, 0.12, v * 0.35, 0.07); break;
      case 'cash': this.tone('triangle', 1250, 1250, 0.06, v * 0.4); this.tone('triangle', 1660, 1660, 0.14, v * 0.4, 0.06); break;
      case 'heatUp': [0, 0.09, 0.18].forEach((d, i) => this.tone('sawtooth', 300 + i * 120, 320 + i * 120, 0.1, v * 0.4, d)); break;
      case 'heatDown': [0, 0.1].forEach((d, i) => this.tone('triangle', 620 - i * 160, 600 - i * 160, 0.14, v * 0.4, d)); break;
      case 'missionStart': [392, 494, 587].forEach((f, i) => this.tone('square', f, f, 0.14, v * 0.35, i * 0.11)); break;
      case 'objective': [660, 880].forEach((f, i) => this.tone('triangle', f, f, 0.1, v * 0.4, i * 0.08)); break;
      case 'missionDone': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone('square', f, f, i === 5 ? 0.5 : 0.13, v * 0.36, i * 0.12)); break;
      case 'fail': [392, 330, 262, 196].forEach((f, i) => this.tone('sawtooth', f, f * 0.97, 0.26, v * 0.36, i * 0.2)); break;
      case 'switch': this.tone('square', 220, 660, 0.18, v * 0.4); this.noise(0.05, v * 0.5, 3000, 'highpass', 0.16); break;
    }
  }

  /** Tiny generative chiptune: a bass line and lead that speed up during pursuits. */
  updateMusic(enabled: boolean) {
    if (!this.ctx || this.ctx.state !== 'running' || !enabled) return;
    const c = this.ctx;
    const tempo = this.musicMood > 0.5 ? 0.15 : 0.24;
    if (this.nextNote < c.currentTime) this.nextNote = c.currentTime + 0.05;
    while (this.nextNote < c.currentTime + 0.25) {
      const s = this.step++;
      const d = this.nextNote - c.currentTime;
      const chase = this.musicMood > 0.5;
      const roots = chase ? [110, 110, 131, 98] : [98, 131, 110, 147];
      const root = roots[Math.floor(s / 16) % 4];
      if (s % 4 === 0 || (chase && s % 4 === 2)) this.tone('triangle', root, root, tempo * 1.8, 0.2, d, this.music);
      if (s % 8 === 4) this.tone('triangle', root * 1.5, root * 1.5, tempo * 1.5, 0.12, d, this.music);
      const scale = [1, 1.2, 1.335, 1.5, 1.8, 2];
      const pat = chase ? [0, 3, 5, 3, 4, 2, 3, 1] : [0, -1, 2, -1, 3, -1, 2, -1, 4, -1, 3, -1, 1, -1, -1, -1];
      const k = pat[s % pat.length];
      if (k >= 0 && (chase || Math.floor(s / 32) % 2 === 1)) this.tone('square', root * 2 * scale[k], root * 2 * scale[k], tempo * 0.9, 0.05, d, this.music);
      if (chase && s % 2 === 0) {
        // hat
        const src = c.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = c.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 6000;
        const g = c.createGain();
        g.gain.setValueAtTime(0.05, this.nextNote);
        g.gain.exponentialRampToValueAtTime(0.001, this.nextNote + 0.04);
        src.connect(f).connect(g).connect(this.music);
        src.start(this.nextNote, Math.random());
        src.stop(this.nextNote + 0.05);
      }
      this.nextNote += tempo;
    }
  }
}
