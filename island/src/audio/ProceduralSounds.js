// TEMPORARY PROCEDURAL SOUND ASSETS
// ---------------------------------
// Every sound in the game is synthesised here so the project runs without any
// audio files. To replace one with a recorded asset, drop a file into
// public/sounds/<name>.ogg (or .mp3) and list it in public/sounds/manifest.json —
// the AudioManager prefers files from the manifest and falls back to these.

const TAU = Math.PI * 2;

function rand(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

class Biquad {
  constructor(type, freq, q, sr) { this.set(type, freq, q, sr); this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  set(type, freq, q, sr) {
    const w = (TAU * freq) / sr, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; } else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; } else { b0 = a; b1 = 0; b2 = -a; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  p(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

function normalize(d, peak = 0.9) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m;
  return d;
}

/** Crossfade the tail into the head so a buffer loops seamlessly. */
function makeLoop(d, sr, fade = 0.5) {
  const n = Math.floor(fade * sr);
  const out = new Float32Array(d.length - n);
  out.set(d.subarray(0, d.length - n));
  for (let i = 0; i < n; i++) {
    const t = i / n;
    out[i] = d[i] * t + d[d.length - n + i] * (1 - t);
  }
  return out;
}

function brown(n, seed) {
  const r = rand(seed);
  const d = new Float32Array(n);
  let v = 0;
  for (let i = 0; i < n; i++) { v = (v + r() * 0.02) * 0.998; d[i] = v; }
  return normalize(d);
}

function pink(n, seed) {
  const r = rand(seed);
  const d = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = r();
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
  }
  return normalize(d);
}

function env(i, n, a, r) {
  const t = i / n;
  return Math.min(1, t / a) * Math.min(1, (1 - t) / r);
}

// ----------------------------------------------------------------------------- loops
export const GENERATORS = {
  ocean(sr) {
    const n = sr * 12;
    const b = brown(n + sr, 11);
    const p = pink(n + sr, 12);
    const lp = new Biquad('lp', 420, 0.6, sr);
    const d = new Float32Array(n + sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const swell = 0.55 + 0.45 * Math.sin(t * TAU / 6 + Math.sin(t * 0.7) * 0.6) ** 2;
      d[i] = lp.p(b[i] * 0.8 + p[i] * 0.25) * swell;
    }
    return makeLoop(normalize(d, 0.7), sr, 1);
  },
  shore(sr) {
    const n = sr * 16;
    const p = pink(n + sr, 21);
    const w = rand(22);
    const lp = new Biquad('lp', 2400, 0.7, sr), hp = new Biquad('hp', 180, 0.7, sr);
    const fz = new Biquad('hp', 4000, 0.7, sr);
    const d = new Float32Array(n + sr);
    // four wave washes of differing length
    const waves = [[0.0, 3.6], [4.1, 3.2], [7.9, 4.0], [12.3, 3.3]];
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      let e = 0.08;
      for (const [s, l] of waves) {
        const k = (t - s) / l;
        if (k > 0 && k < 1) e += Math.sin(k * Math.PI) ** 1.6 * (k < 0.35 ? k / 0.35 : 1);
      }
      const x = hp.p(lp.p(p[i])) * e;
      const fizz = fz.p(w()) * e * e * 0.25;
      d[i] = x + fizz;
    }
    return makeLoop(normalize(d, 0.8), sr, 1);
  },
  wind(sr) {
    const n = sr * 10;
    return makeLoop(pink(n + sr, 31), sr, 1);
  },
  rain(sr) {
    const n = sr * 6;
    const r = rand(41);
    const hp = new Biquad('hp', 900, 0.5, sr), lp = new Biquad('lp', 9000, 0.5, sr);
    const d = new Float32Array(n + sr);
    for (let i = 0; i < d.length; i++) d[i] = lp.p(hp.p(r())) * 0.55;
    // droplet ticks
    for (let k = 0; k < 900; k++) {
      const at = Math.floor(((r() + 1) / 2) * (d.length - 400));
      const f = 2500 + ((r() + 1) / 2) * 4000;
      const a = 0.3 + ((r() + 1) / 2) * 0.5;
      for (let i = 0; i < 300; i++) d[at + i] += Math.sin((i / sr) * TAU * f) * Math.exp(-i / 40) * a;
    }
    return makeLoop(normalize(d, 0.7), sr, 0.5);
  },
  tarpRain(sr) {
    const n = sr * 5;
    const r = rand(42);
    const d = new Float32Array(n + sr);
    const lp = new Biquad('lp', 1800, 0.7, sr);
    for (let i = 0; i < d.length; i++) d[i] = lp.p(r()) * 0.2;
    for (let k = 0; k < 1500; k++) {
      const at = Math.floor(((r() + 1) / 2) * (d.length - 800));
      const f = 300 + ((r() + 1) / 2) * 500;
      const a = 0.2 + ((r() + 1) / 2) * 0.6;
      for (let i = 0; i < 700; i++) d[at + i] += Math.sin((i / sr) * TAU * f) * Math.exp(-i / 120) * a;
    }
    return makeLoop(normalize(d, 0.75), sr, 0.5);
  },
  storm(sr) {
    const n = sr * 12;
    const b = brown(n + sr, 51);
    const lp = new Biquad('lp', 160, 0.7, sr);
    const d = new Float32Array(n + sr);
    for (let i = 0; i < d.length; i++) d[i] = lp.p(b[i]) * (0.6 + 0.4 * Math.sin((i / sr) * 0.7) ** 2);
    return makeLoop(normalize(d, 0.8), sr, 1);
  },
  jungle(sr) {
    // daytime insect bed + leaf rustle
    const n = sr * 10;
    const p = pink(n + sr, 61);
    const bp = new Biquad('bp', 5200, 2.5, sr), bp2 = new Biquad('bp', 3400, 4, sr), lp = new Biquad('lp', 900, 0.5, sr);
    const r = rand(62);
    const d = new Float32Array(n + sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const cic = (0.5 + 0.5 * Math.sin(t * TAU * 38)) * (0.55 + 0.45 * Math.sin(t * TAU * 0.13)) ** 2;
      d[i] = bp.p(r()) * cic * 0.5 + bp2.p(r()) * 0.12 * (0.5 + 0.5 * Math.sin(t * TAU * 0.07)) + lp.p(p[i]) * 0.35;
    }
    return makeLoop(normalize(d, 0.7), sr, 1);
  },
  night(sr) {
    // crickets + frogs
    const n = sr * 8;
    const d = new Float32Array(n + sr);
    const r = rand(71);
    for (let c = 0; c < 9; c++) {
      const f = 4200 + c * 230 + r() * 100;
      const rate = 14 + r() * 6;
      const ph = r() * 10;
      const amp = 0.15 + ((r() + 1) / 2) * 0.2;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const chirp = Math.max(0, Math.sin(TAU * rate * t + ph)) ** 6 * (Math.sin(TAU * 0.4 * t + ph) > -0.3 ? 1 : 0);
        d[i] += Math.sin(TAU * f * t) * chirp * amp;
      }
    }
    for (let k = 0; k < 18; k++) {
      const at = Math.floor(((r() + 1) / 2) * (d.length - sr * 0.4));
      const f = 140 + ((r() + 1) / 2) * 120;
      for (let i = 0; i < sr * 0.25; i++) {
        const t = i / sr;
        d[at + i] += Math.sin(TAU * f * t + Math.sin(TAU * 30 * t) * 2) * Math.sin(Math.PI * t / 0.25) * 0.25;
      }
    }
    return makeLoop(normalize(d, 0.6), sr, 0.8);
  },
  underwater(sr) {
    const n = sr * 8;
    const b = brown(n + sr, 81);
    const lp = new Biquad('lp', 260, 0.7, sr);
    const d = new Float32Array(n + sr);
    const r = rand(82);
    for (let i = 0; i < d.length; i++) d[i] = lp.p(b[i]) * 0.8;
    for (let k = 0; k < 40; k++) {
      const at = Math.floor(((r() + 1) / 2) * (d.length - 3000));
      let f = 500 + ((r() + 1) / 2) * 900;
      for (let i = 0; i < 2500; i++) { f *= 1.0004; d[at + i] += Math.sin((i / sr) * TAU * f) * Math.exp(-i / 500) * 0.2; }
    }
    return makeLoop(normalize(d, 0.7), sr, 0.8);
  },
  fire(sr) {
    const n = sr * 6;
    const r = rand(91);
    const lp = new Biquad('lp', 600, 0.6, sr);
    const d = new Float32Array(n + sr);
    for (let i = 0; i < d.length; i++) d[i] = lp.p(r()) * 0.35;
    for (let k = 0; k < 500; k++) {
      const at = Math.floor(((r() + 1) / 2) * (d.length - 200));
      const a = ((r() + 1) / 2) ** 3;
      for (let i = 0; i < 120; i++) d[at + i] += r() * Math.exp(-i / 18) * a;
    }
    return makeLoop(normalize(d, 0.8), sr, 0.5);
  },
  waterfall(sr) {
    const n = sr * 8;
    const p = pink(n + sr, 101);
    const r = rand(102);
    const lp = new Biquad('lp', 3000, 0.5, sr);
    const d = new Float32Array(n + sr);
    for (let i = 0; i < d.length; i++) d[i] = lp.p(p[i] * 0.7 + r() * 0.3);
    return makeLoop(normalize(d, 0.8), sr, 1);
  },
  engine(sr) {
    const n = sr * 2;
    const d = new Float32Array(n);
    const r = rand(111);
    const lp = new Biquad('lp', 900, 1.2, sr);
    // firing pulses at 46 Hz with harmonics + mechanical noise
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const ph = (t * 46) % 1;
      const pulse = Math.exp(-ph * 9) - 0.12;
      d[i] = lp.p(pulse * 0.8 + Math.sin(TAU * 92 * t) * 0.15 + r() * 0.08);
    }
    return normalize(d, 0.8);
  },
  static(sr) {
    const n = sr * 4;
    const r = rand(121);
    const bp = new Biquad('bp', 2200, 0.7, sr);
    const d = new Float32Array(n + sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = bp.p(r()) * (0.6 + 0.4 * Math.sin(t * TAU * 0.9) ** 2) + (Math.random() < 0.0008 ? r() * 3 : 0);
    }
    return makeLoop(normalize(d, 0.6), sr, 0.5);
  },

  // ---------------------------------------------------------------------------- radio programmes
  radio0(sr) { return radioTune(sr, { seed: 5, bpm: 92, scale: [0, 2, 4, 7, 9], root: 220, chords: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], pluck: 0.996 }); },
  radio1(sr) {
    // shortwave weather bulletin: beeps + carrier warble
    const n = sr * 16;
    const d = new Float32Array(n);
    const pattern = '·· ·- -·· ·· --- / ·-- · ·- - ···· · ·-·';
    let t = 0.4;
    for (const ch of pattern) {
      const dur = ch === '-' ? 0.27 : ch === '·' ? 0.09 : 0.18;
      if (ch === '-' || ch === '·') {
        for (let i = 0; i < dur * sr; i++) d[Math.floor(t * sr) + i] += Math.sin(TAU * 760 * (i / sr)) * 0.5;
      }
      t += dur + 0.09;
    }
    for (let i = 0; i < n; i++) d[i] += Math.sin(TAU * (90 + Math.sin(i / sr * 3) * 20) * (i / sr)) * 0.04;
    return normalize(d, 0.6);
  },
  radio2(sr) { return radioTune(sr, { seed: 9, bpm: 74, scale: [0, 3, 5, 7, 10], root: 196, chords: [[0, 3, 7], [5, 8, 12], [3, 7, 10], [7, 10, 14]], pluck: 0.998, bell: true }); },

  // ---------------------------------------------------------------------------- one shots
  splash(sr) {
    const n = Math.floor(sr * 0.9);
    const r = rand(201);
    const d = new Float32Array(n);
    const bp = new Biquad('bp', 1500, 0.8, sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      bp.set('bp', 3000 * Math.exp(-t * 3) + 400, 0.8, sr);
      d[i] = bp.p(r()) * Math.exp(-t * 6) * (t < 0.01 ? t / 0.01 : 1);
      // bloop
      d[i] += Math.sin(TAU * (520 + 900 * Math.exp(-t * 30)) * t) * Math.exp(-t * 18) * 0.5;
    }
    return normalize(d);
  },
  skip(sr) {
    const n = Math.floor(sr * 0.25);
    const r = rand(202);
    const d = new Float32Array(n);
    const hp = new Biquad('hp', 1200, 0.7, sr);
    for (let i = 0; i < n; i++) { const t = i / sr; d[i] = hp.p(r()) * Math.exp(-t * 28) + Math.sin(TAU * 1300 * t) * Math.exp(-t * 40) * 0.4; }
    return normalize(d, 0.7);
  },
  click(sr) {
    const n = Math.floor(sr * 0.08);
    const d = new Float32Array(n);
    const r = rand(203);
    for (let i = 0; i < n; i++) { const t = i / sr; d[i] = (r() * 0.6 + Math.sin(TAU * 2400 * t)) * Math.exp(-t * 120); }
    return normalize(d, 0.6);
  },
  creakOpen(sr) { return creak(sr, 0.9, 204, 1); },
  creakClose(sr) {
    const d = creak(sr, 0.5, 205, -1);
    const thud = Math.floor(sr * 0.42);
    for (let i = 0; i < sr * 0.15 && thud + i < d.length; i++) { const t = i / sr; d[thud + i] += Math.sin(TAU * 90 * t) * Math.exp(-t * 30) * 1.5; }
    return normalize(d);
  },
  ignite(sr) {
    const n = Math.floor(sr * 0.8);
    const r = rand(206);
    const d = new Float32Array(n);
    const bp = new Biquad('bp', 900, 0.6, sr);
    for (let i = 0; i < n; i++) { const t = i / sr; d[i] = bp.p(r()) * Math.sin(Math.PI * Math.min(1, t / 0.6)) * (0.4 + 0.6 * Math.exp(-t * 3)); }
    return normalize(d, 0.7);
  },
  snuff(sr) {
    const n = Math.floor(sr * 0.35);
    const r = rand(207);
    const d = new Float32Array(n);
    const hp = new Biquad('hp', 600, 0.6, sr);
    for (let i = 0; i < n; i++) { const t = i / sr; d[i] = hp.p(r()) * Math.exp(-t * 9) * Math.min(1, t / 0.02); }
    return normalize(d, 0.6);
  },
  shutter(sr) {
    const n = Math.floor(sr * 0.25);
    const r = rand(208);
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      d[i] = r() * (Math.exp(-t * 200) + Math.exp(-Math.max(0, t - 0.09) * 160) * (t > 0.09 ? 1 : 0)) + Math.sin(TAU * 1800 * t) * Math.exp(-t * 90) * 0.3;
    }
    return normalize(d, 0.7);
  },
  sip(sr) {
    const n = Math.floor(sr * 0.5);
    const r = rand(209);
    const d = new Float32Array(n);
    const bp = new Biquad('bp', 1200, 2, sr);
    for (let i = 0; i < n; i++) { const t = i / sr; d[i] = bp.p(r()) * Math.sin(Math.PI * t / 0.5) ** 2; }
    return normalize(d, 0.4);
  },
  cloth(sr) {
    const n = Math.floor(sr * 0.35);
    const r = rand(210);
    const d = new Float32Array(n);
    const bp = new Biquad('bp', 2500, 0.5, sr);
    for (let i = 0; i < n; i++) { const t = i / sr; d[i] = bp.p(r()) * Math.sin(Math.PI * t / 0.35) * (0.6 + 0.4 * Math.sin(t * 60)); }
    return normalize(d, 0.4);
  },
  pebble(sr) {
    const n = Math.floor(sr * 0.15);
    const d = new Float32Array(n);
    for (let k = 0; k < 2; k++) {
      const at = Math.floor(k * sr * 0.05);
      for (let i = 0; i < sr * 0.08 && at + i < n; i++) { const t = i / sr; d[at + i] += Math.sin(TAU * (2800 + k * 600) * t) * Math.exp(-t * 90); }
    }
    return normalize(d, 0.6);
  },
  knock(sr) {
    const n = Math.floor(sr * 0.2);
    const d = new Float32Array(n);
    const r = rand(211);
    for (let i = 0; i < n; i++) { const t = i / sr; d[i] = (Math.sin(TAU * 420 * t) + Math.sin(TAU * 1100 * t) * 0.5 + r() * 0.3) * Math.exp(-t * 45); }
    return normalize(d, 0.6);
  },
  thudSand(sr) {
    const n = Math.floor(sr * 0.15);
    const d = new Float32Array(n);
    const r = rand(212);
    const lp = new Biquad('lp', 700, 0.6, sr);
    for (let i = 0; i < n; i++) { const t = i / sr; d[i] = lp.p(r()) * Math.exp(-t * 40); }
    return normalize(d, 0.5);
  },
  whoosh(sr) {
    const n = Math.floor(sr * 0.35);
    const d = new Float32Array(n);
    const r = rand(213);
    const bp = new Biquad('bp', 800, 1, sr);
    for (let i = 0; i < n; i++) { const t = i / sr; bp.set('bp', 500 + 2000 * Math.sin(Math.PI * t / 0.35), 1, sr); d[i] = bp.p(r()) * Math.sin(Math.PI * t / 0.35) ** 2; }
    return normalize(d, 0.45);
  },
  thunder(sr) {
    const n = sr * 7;
    const b = brown(n, 214 + Math.floor(Math.random() * 1000));
    const r = rand(215);
    const lp = new Biquad('lp', 280, 0.6, sr);
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const crack = t < 0.4 ? r() * Math.exp(-t * 12) * 0.6 : 0;
      const roll = Math.exp(-t * 0.6) * (0.6 + 0.4 * Math.sin(t * 5.3 + Math.sin(t * 1.7) * 3) ** 2);
      d[i] = lp.p(b[i] * roll) + crack;
    }
    return normalize(d, 0.95);
  },
  bird1(sr) { return chirp(sr, 301, [[2900, 3600, 0.08], [3700, 2600, 0.07], [3000, 4100, 0.06]]); },
  bird2(sr) { return chirp(sr, 302, [[1800, 2400, 0.18], [2400, 1900, 0.22]]); },
  bird3(sr) { return chirp(sr, 303, [[4200, 4800, 0.04], [4200, 4800, 0.04], [4200, 4800, 0.04], [4400, 3800, 0.09]]); },
  bird4(sr) { return chirp(sr, 304, [[1200, 1500, 0.25], [1500, 1000, 0.35]], 0.15); },
  gull(sr) {
    const n = Math.floor(sr * 0.9);
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = 1500 + 700 * Math.sin(Math.PI * Math.min(1, t / 0.3)) - 600 * Math.max(0, t - 0.3);
      d[i] = (Math.sin(TAU * f * t) + 0.4 * Math.sin(TAU * f * 2 * t) + 0.2 * Math.sin(TAU * f * 3 * t)) * Math.sin(Math.PI * t / 0.9) * (0.7 + 0.3 * Math.sin(t * 70));
    }
    return normalize(d, 0.5);
  },
};

function creak(sr, dur, seed, dir) {
  const n = Math.floor(sr * dur);
  const d = new Float32Array(n);
  const r = rand(seed);
  const bp = new Biquad('bp', 600, 6, sr);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 70 + 40 * Math.sin(t * 9 * dir) + r() * 10;
    ph += f / sr;
    const pulse = (ph % 1) < 0.08 ? 1 : 0;
    bp.set('bp', 500 + 300 * Math.sin(t * 4), 6, sr);
    d[i] = bp.p(pulse + r() * 0.1) * Math.sin(Math.PI * t / dur);
  }
  return normalize(d, 0.55);
}

function chirp(sr, seed, notes, gap = 0.04) {
  const total = notes.reduce((a, nn) => a + nn[2] + gap, 0.05);
  const n = Math.floor(sr * total);
  const d = new Float32Array(n);
  let t0 = 0.02;
  for (const [f0, f1, dur] of notes) {
    let ph = 0;
    for (let i = 0; i < dur * sr; i++) {
      const k = i / (dur * sr);
      const f = f0 + (f1 - f0) * k;
      ph += f / sr;
      const idx = Math.floor(t0 * sr) + i;
      if (idx < n) d[idx] += Math.sin(TAU * ph + Math.sin(TAU * ph * 0.02) * 0.5) * Math.sin(Math.PI * k) ** 0.7;
    }
    t0 += dur + gap;
  }
  return normalize(d, 0.6);
}

function radioTune(sr, { seed, bpm, scale, root, chords, pluck, bell }) {
  const beat = 60 / bpm;
  const bars = 8;
  const n = Math.floor(sr * beat * 4 * bars);
  const d = new Float32Array(n);
  const r = rand(seed);
  const note = (semi) => root * Math.pow(2, semi / 12);
  const ks = (freq, at, dur, amp) => {
    const N = Math.max(2, Math.floor(sr / freq));
    const buf = new Float32Array(N);
    for (let i = 0; i < N; i++) buf[i] = r();
    let idx = 0;
    const start = Math.floor(at * sr);
    for (let i = 0; i < dur * sr && start + i < n; i++) {
      const nxt = (idx + 1) % N;
      const v = (buf[idx] + buf[nxt]) * 0.5 * pluck;
      buf[idx] = v;
      idx = nxt;
      d[start + i] += v * amp;
    }
  };
  const tone = (freq, at, dur, amp) => {
    const start = Math.floor(at * sr);
    for (let i = 0; i < dur * sr && start + i < n; i++) {
      const t = i / sr;
      d[start + i] += (Math.sin(TAU * freq * t) + 0.3 * Math.sin(TAU * freq * 2.76 * t) * Math.exp(-t * 6)) * Math.exp(-t * 2.2) * amp;
    }
  };
  for (let bar = 0; bar < bars; bar++) {
    const ch = chords[bar % chords.length];
    const t0 = bar * beat * 4;
    // strummed chord on beats 1 and 3, off-beat chops
    for (const b of [0, 1.5, 2, 3.5]) ch.forEach((s, k) => ks(note(s - 12), t0 + b * beat + k * 0.012, beat * 1.6, 0.18));
    // bass
    ks(note(ch[0] - 24), t0, beat * 2, 0.35);
    ks(note(ch[0] - 24 + 7), t0 + beat * 2, beat * 2, 0.3);
    // melody
    for (let s = 0; s < 8; s++) {
      if (r() < 0.35) continue;
      const deg = scale[Math.floor(((r() + 1) / 2) * scale.length)];
      const oct = r() > 0.6 ? 12 : 0;
      if (bell) tone(note(deg + oct), t0 + s * beat * 0.5, beat, 0.12);
      else ks(note(deg + oct), t0 + s * beat * 0.5, beat, 0.22);
    }
    // shaker
    for (let s = 0; s < 8; s++) {
      const at = Math.floor((t0 + s * beat * 0.5) * sr);
      for (let i = 0; i < sr * 0.05 && at + i < n; i++) d[at + i] += r() * Math.exp(-i / (sr * 0.012)) * (s % 2 ? 0.05 : 0.08);
    }
  }
  // radio speaker band limit
  const hp = new Biquad('hp', 280, 0.7, sr), lp = new Biquad('lp', 3200, 0.7, sr);
  for (let i = 0; i < n; i++) d[i] = lp.p(hp.p(d[i]));
  return normalize(d, 0.75);
}

/** Footstep variants per surface. */
export function footstep(sr, surface, seed) {
  const r = rand(seed * 977 + surface.length * 31);
  const n = Math.floor(sr * 0.22);
  const d = new Float32Array(n);
  const cfg = {
    sand: { f: 900, q: 0.6, decay: 22, grain: 0.8, tone: 0 },
    grass: { f: 2600, q: 0.7, decay: 18, grain: 0.6, tone: 0 },
    leaves: { f: 3200, q: 0.8, decay: 14, grain: 1.0, tone: 0 },
    dirt: { f: 600, q: 0.7, decay: 26, grain: 0.4, tone: 0.2 },
    rock: { f: 1800, q: 1.2, decay: 40, grain: 0.3, tone: 0.5 },
    wood: { f: 300, q: 1.5, decay: 30, grain: 0.15, tone: 1.0 },
    metal: { f: 900, q: 4, decay: 20, grain: 0.1, tone: 0.8 },
    cloth: { f: 1500, q: 0.6, decay: 30, grain: 0.3, tone: 0 },
    water: { f: 1400, q: 0.7, decay: 9, grain: 1.0, tone: 0 },
    swim: { f: 700, q: 0.6, decay: 5, grain: 1.0, tone: 0 },
    terrain: { f: 900, q: 0.6, decay: 22, grain: 0.7, tone: 0 },
  }[surface] || { f: 900, q: 0.6, decay: 22, grain: 0.7, tone: 0 };
  const bp = new Biquad('bp', cfg.f * (0.85 + r() * 0.15), cfg.q, sr);
  const lp = new Biquad('lp', 400, 0.7, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const e = Math.exp(-t * cfg.decay) * Math.min(1, t / 0.004);
    const grain = r() * (0.6 + 0.4 * Math.sin(t * 900 + r()));
    d[i] = bp.p(grain) * e * cfg.grain + lp.p(r()) * e * 0.6 + Math.sin(TAU * (110 + cfg.f * 0.1) * t) * Math.exp(-t * cfg.decay * 1.5) * cfg.tone * 0.5;
  }
  return normalize(d, 0.7);
}
