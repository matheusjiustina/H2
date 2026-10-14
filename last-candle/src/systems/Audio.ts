import * as THREE from "three";

/**
 * Fully procedural WebAudio: ambience layers (rain, fans, fridge, servers)
 * and short one-shots. Nothing loud, nothing constant except the room tone.
 */
export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private rainGain!: GainNode;
  private rainFilter!: BiquadFilterNode;
  private fridgeGain!: GainNode;
  private fanGain!: GainNode;
  private roomGain!: GainNode;
  private serverGain!: GainNode;
  private listenerPos = new THREE.Vector3();
  private lastPlay = new Map<string, number>();
  volume = 0.8;
  ambience = 0.8;
  private fridgePos = new THREE.Vector3(-2.85, 1, -3.6);
  private serverPos = new THREE.Vector3(0, 1.2, -19.8);
  private fanPos = new THREE.Vector3(-0.95, 1.1, -3.05);
  fridgeOpen = false;
  fanOn = false;
  rainIntensity = 0.7;

  init() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = this.ambience;
    this.ambBus.connect(this.master);
    // shared noise buffer (2s pink-ish)
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
    }
    // rain bed
    const rain = this.loopNoise();
    this.rainFilter = ctx.createBiquadFilter();
    this.rainFilter.type = "bandpass";
    this.rainFilter.frequency.value = 1400;
    this.rainFilter.Q.value = 0.5;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0.0;
    rain.connect(this.rainFilter).connect(this.rainGain).connect(this.ambBus);
    // room tone / PC fans
    const room = this.loopNoise();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 320;
    this.roomGain = ctx.createGain();
    this.roomGain.gain.value = 0.18;
    room.connect(lp).connect(this.roomGain).connect(this.ambBus);
    const hum = ctx.createOscillator();
    hum.frequency.value = 120;
    const humG = ctx.createGain();
    humG.gain.value = 0.006;
    hum.connect(humG).connect(this.ambBus);
    hum.start();
    // fridge hum
    const fr = ctx.createOscillator();
    fr.type = "triangle";
    fr.frequency.value = 58;
    this.fridgeGain = ctx.createGain();
    this.fridgeGain.gain.value = 0;
    fr.connect(this.fridgeGain).connect(this.ambBus);
    fr.start();
    // server room whirr
    const sv = this.loopNoise();
    const sbp = ctx.createBiquadFilter();
    sbp.type = "bandpass";
    sbp.frequency.value = 700;
    sbp.Q.value = 2;
    this.serverGain = ctx.createGain();
    this.serverGain.gain.value = 0;
    sv.connect(sbp).connect(this.serverGain).connect(this.ambBus);
    // standing fan
    const fan = this.loopNoise();
    const flp = ctx.createBiquadFilter();
    flp.type = "lowpass";
    flp.frequency.value = 600;
    this.fanGain = ctx.createGain();
    this.fanGain.gain.value = 0;
    fan.connect(flp).connect(this.fanGain).connect(this.ambBus);
  }

  private loopNoise(): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.loopStart = Math.random();
    src.start(0, Math.random() * 1.5);
    return src;
  }

  setVolume(v: number, amb: number) {
    this.volume = v;
    this.ambience = amb;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
    this.ambBus.gain.setTargetAtTime(amb, this.ctx.currentTime, 0.1);
  }

  suspend(on: boolean) {
    if (!this.ctx) return;
    if (on) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  /** Per-frame ambience mix based on where the listener is. */
  update(cam: THREE.Camera) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    cam.getWorldPosition(this.listenerPos);
    const p = this.listenerPos;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const L = this.ctx.listener;
    if (L.positionX) {
      L.positionX.setTargetAtTime(p.x, t, 0.05);
      L.positionY.setTargetAtTime(p.y, t, 0.05);
      L.positionZ.setTargetAtTime(p.z, t, 0.05);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.05);
      L.forwardY.setTargetAtTime(fwd.y, t, 0.05);
      L.forwardZ.setTargetAtTime(fwd.z, t, 0.05);
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    }
    const frontDist = Math.max(0, -p.z);
    const rainNear = 1 / (1 + frontDist * 0.22);
    this.rainGain.gain.setTargetAtTime((0.05 + 0.32 * this.rainIntensity) * (0.35 + 0.65 * rainNear), t, 0.3);
    this.rainFilter.frequency.setTargetAtTime(900 + this.rainIntensity * 1200, t, 0.5);
    const fd = p.distanceTo(this.fridgePos);
    this.fridgeGain.gain.setTargetAtTime((this.fridgeOpen ? 0.06 : 0.022) / (1 + fd * 0.6), t, 0.2);
    const sd = p.distanceTo(this.serverPos);
    this.serverGain.gain.setTargetAtTime(0.09 / (1 + sd * 0.45), t, 0.3);
    const fnd = p.distanceTo(this.fanPos);
    this.fanGain.gain.setTargetAtTime(this.fanOn ? 0.12 / (1 + fnd * 0.5) : 0, t, 0.3);
  }

  private throttle(key: string, ms: number): boolean {
    const now = performance.now();
    const last = this.lastPlay.get(key) ?? 0;
    if (now - last < ms) return false;
    this.lastPlay.set(key, now);
    return true;
  }

  /** Route a voice through a panner if a world position is given. */
  private out(pos?: THREE.Vector3, vol = 1): AudioNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = vol;
    if (pos) {
      const pan = ctx.createPanner();
      pan.panningModel = "equalpower";
      pan.distanceModel = "inverse";
      pan.refDistance = 1.2;
      pan.rolloffFactor = 1.3;
      pan.positionX.value = pos.x;
      pan.positionY.value = pos.y;
      pan.positionZ.value = pos.z;
      g.connect(pan).connect(this.sfxBus);
    } else g.connect(this.sfxBus);
    return g;
  }

  private noiseBurst(dest: AudioNode, dur: number, type: BiquadFilterType, freq: number, q = 1, attack = 0.002, gain = 0.5, start = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private tone(dest: AudioNode, freq: number, dur: number, type: OscillatorType = "sine", gain = 0.3, start = 0, slideTo?: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + start;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name: string, pos?: THREE.Vector3, vol = 1) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const o = (v = 1) => this.out(pos, v * vol);
    switch (name) {
      case "click":
        if (!this.throttle("click", 30)) return;
        this.noiseBurst(o(0.5), 0.04, "bandpass", 3500, 2, 0.001, 0.6);
        break;
      case "key":
        if (!this.throttle("key" + (pos ? pos.x.toFixed(1) : ""), 60)) return;
        this.noiseBurst(o(0.25), 0.03, "bandpass", 2800 + Math.random() * 1500, 3, 0.001, 0.5);
        break;
      case "keyMech":
        this.noiseBurst(o(0.45), 0.05, "bandpass", 2000 + Math.random() * 800, 2, 0.001, 0.6);
        this.tone(o(0.08), 1800, 0.02, "square", 0.2);
        break;
      case "buy":
        this.tone(o(0.25), 660, 0.09, "triangle", 0.4);
        this.tone(o(0.25), 990, 0.14, "triangle", 0.4, 0.07);
        break;
      case "sell":
        this.tone(o(0.25), 990, 0.09, "triangle", 0.4);
        this.tone(o(0.25), 660, 0.16, "triangle", 0.4, 0.07);
        break;
      case "reject":
        this.tone(o(0.2), 180, 0.18, "square", 0.25, 0, 140);
        break;
      case "ping":
        this.tone(o(0.22), 1320, 1.0, "sine", 0.3);
        this.tone(o(0.12), 2640, 0.6, "sine", 0.2);
        break;
      case "chair":
        if (!this.throttle("chair", 250)) return;
        this.tone(o(0.06), 520 + Math.random() * 200, 0.28, "sawtooth", 0.15, 0, 820);
        this.noiseBurst(o(0.15), 0.15, "lowpass", 400, 1, 0.01, 0.4);
        break;
      case "spin":
        this.tone(o(0.05), 300, 0.5, "sawtooth", 0.12, 0, 420);
        break;
      case "printer": {
        const out = o(0.35);
        for (let i = 0; i < 14; i++) this.noiseBurst(out, 0.06, "bandpass", 2600, 4, 0.002, 0.35, i * 0.1);
        this.tone(out, 95, 1.4, "sawtooth", 0.05);
        break;
      }
      case "thud":
        if (!this.throttle("thud", 50)) return;
        this.noiseBurst(o(0.6), 0.12, "lowpass", 380, 1, 0.002, 0.7);
        break;
      case "tick":
        if (!this.throttle("tick", 40)) return;
        this.noiseBurst(o(0.4), 0.05, "bandpass", 1800, 1.5, 0.001, 0.5);
        break;
      case "canOpen":
        this.noiseBurst(o(0.5), 0.05, "highpass", 2000, 1, 0.001, 0.8);
        this.noiseBurst(o(0.3), 0.35, "highpass", 4000, 0.7, 0.01, 0.4, 0.03);
        break;
      case "sip":
        this.noiseBurst(o(0.4), 0.18, "lowpass", 500, 3, 0.03, 0.5);
        this.tone(o(0.12), 180, 0.15, "sine", 0.3, 0.05, 120);
        break;
      case "crunch":
        for (let i = 0; i < 5; i++) this.noiseBurst(o(0.4), 0.04, "bandpass", 1500 + Math.random() * 2500, 1, 0.001, 0.5, i * 0.05 + Math.random() * 0.02);
        break;
      case "crumple":
        for (let i = 0; i < 8; i++) this.noiseBurst(o(0.3), 0.05, "highpass", 2500 + Math.random() * 3000, 1, 0.001, 0.4, i * 0.05);
        break;
      case "squeak":
        this.tone(o(0.25), 900, 0.18, "sine", 0.4, 0, 1500);
        this.tone(o(0.2), 1500, 0.14, "sine", 0.3, 0.16, 1100);
        break;
      case "marker":
        if (!this.throttle("marker", 120)) return;
        this.noiseBurst(o(0.08), 0.1, "bandpass", 5000, 6, 0.01, 0.3);
        break;
      case "wipe":
        this.noiseBurst(o(0.3), 0.5, "bandpass", 1200, 0.8, 0.1, 0.4);
        break;
      case "door":
        this.tone(o(0.25), 880, 0.6, "sine", 0.3);
        this.tone(o(0.25), 698, 0.8, "sine", 0.3, 0.25);
        break;
      case "bell":
        this.tone(o(0.4), 1760, 1.2, "sine", 0.35);
        this.tone(o(0.2), 3520, 0.6, "sine", 0.15);
        break;
      case "thunder": {
        const out = o(0.8);
        this.noiseBurst(out, 3.2, "lowpass", 140, 0.7, 0.3, 0.9);
        this.noiseBurst(out, 1.2, "lowpass", 260, 0.7, 0.05, 0.5, 0.2);
        break;
      }
      case "step":
        this.noiseBurst(o(0.18), 0.08, "lowpass", 260, 1, 0.003, 0.5);
        break;
      case "toast":
        this.tone(o(0.12), 880, 0.08, "sine", 0.25);
        break;
      case "rep":
        this.tone(o(0.14), 523, 0.3, "sine", 0.25);
        this.tone(o(0.14), 659, 0.3, "sine", 0.22, 0.06);
        this.tone(o(0.14), 784, 0.4, "sine", 0.2, 0.12);
        break;
      case "credits":
        this.tone(o(0.12), 1046, 0.12, "triangle", 0.25);
        this.tone(o(0.12), 1568, 0.18, "triangle", 0.2, 0.08);
        break;
      case "fanToggle":
        this.noiseBurst(o(0.3), 0.08, "bandpass", 1000, 2, 0.001, 0.5);
        break;
      case "switch":
        this.noiseBurst(o(0.4), 0.03, "bandpass", 2500, 3, 0.001, 0.8);
        break;
      case "fridgeDoor":
        this.noiseBurst(o(0.3), 0.25, "lowpass", 600, 1, 0.01, 0.6);
        break;
      case "locker":
        this.tone(o(0.12), 240, 0.2, "square", 0.15, 0, 180);
        this.noiseBurst(o(0.3), 0.12, "bandpass", 900, 2, 0.002, 0.6);
        break;
      case "swoosh":
        this.noiseBurst(o(0.25), 0.22, "bandpass", 900, 0.8, 0.05, 0.5);
        break;
      case "score":
        this.tone(o(0.2), 784, 0.12, "triangle", 0.3);
        this.tone(o(0.2), 1046, 0.12, "triangle", 0.3, 0.1);
        this.tone(o(0.2), 1318, 0.25, "triangle", 0.3, 0.2);
        break;
    }
  }

  /** Gibberish voice blips for NPC speech (quiet). */
  voice(text: string, pitch: number, pos: THREE.Vector3, quiet: boolean) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const out = this.out(pos, quiet ? 0.05 : 0.09);
    const n = Math.min(14, Math.max(3, Math.floor(text.length / 5)));
    for (let i = 0; i < n; i++) {
      const f = (140 + Math.random() * 90) * pitch * (quiet ? 0.9 : 1);
      this.tone(out, f, 0.07, "triangle", 0.5, i * 0.085 + Math.random() * 0.02, f * (0.85 + Math.random() * 0.3));
    }
  }
}
