/**
 * Small, fast, seedable PRNG (sfc32). The full state is four 32-bit ints so it
 * can be saved and restored exactly — the market depends on this to resume
 * coherently after a reload.
 */
export type RngState = [number, number, number, number];

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  private spare: number | null = null;

  constructor(seed: number | RngState = 0x5eed) {
    if (Array.isArray(seed)) {
      [this.a, this.b, this.c, this.d] = seed;
    } else {
      this.a = 0x9e3779b9;
      this.b = 0x243f6a88;
      this.c = 0xb7e15162;
      this.d = seed >>> 0;
      for (let i = 0; i < 16; i++) this.next();
    }
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length) % items.length];
  }

  /** Standard normal via Box–Muller (cached pair). */
  normal(): number {
    if (this.spare !== null) {
      const s = this.spare;
      this.spare = null;
      return s;
    }
    let u = 0;
    let v = 0;
    while (u <= 1e-12) u = this.next();
    v = this.next();
    const mag = Math.sqrt(-2 * Math.log(u));
    this.spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  }

  getState(): RngState {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }

  /** Cached second gaussian from Box–Muller; saved so a restored stream is bit-identical. */
  get spareNormal(): number | null {
    return this.spare;
  }

  setState(s: RngState, spare: number | null = null): void {
    [this.a, this.b, this.c, this.d] = s;
    this.spare = spare;
  }
}

/** Non-deterministic helper RNG for cosmetic things (animation jitter etc.). */
export const fx = new Rng((Date.now() ^ 0xa5a5a5) >>> 0);
