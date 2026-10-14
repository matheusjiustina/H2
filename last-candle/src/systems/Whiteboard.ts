import * as THREE from "three";
import { fx } from "../core/rng";
import { FONT_HAND } from "../world/textures";

export interface Stroke {
  c: string; // color
  w: number; // width (px), or font size for text
  pts: number[]; // x,y pairs in 0..1 board space (x right, y down)
  /** Who drew it: the Chart Wizard's theory ("w") or the player ("p"). Missing on old saves. */
  o?: "w" | "p";
  /** Handwritten note drawn at pts[0], pts[1]. */
  txt?: string;
  rot?: number;
}

const W = 1024;
const H = 788;
const WIZ_INK = "#2b4fa8";
const WIZ_RED = "#b8322a";

/** The player's bounded drawing area (board space) and the Wizard's theory area. */
export const PLAYER_ZONE = { x0: 0.655, x1: 0.975, y0: 0.08, y1: 0.95 };
export const THEORY_ZONE = { x0: 0.02, x1: 0.62 };

type Step = { line: [number, number][]; c?: string; w?: number } | { text: string; x: number; y: number; size: number; rot?: number; c?: string };

const tri = (x: number, y: number, r: number): [number, number][] => [
  [x - r, y + r * 0.8],
  [x + r, y + r * 0.8],
  [x, y - r * 0.9],
  [x - r, y + r * 0.8],
];

/** A long, over-confident curved arrow with a head. */
function bigArrow(x0: number, y0: number, x1: number, y1: number, bend: number): Step[] {
  const pts: [number, number][] = [];
  const mx = (x0 + x1) / 2 + bend;
  const my = (y0 + y1) / 2 + bend * 0.6;
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    pts.push([a * x0 + b * mx + c * x1, a * y0 + b * my + c * y1]);
  }
  const [px, py] = pts[pts.length - 3];
  const ang = Math.atan2(y1 - py, x1 - px);
  const head = 0.045;
  const h1: [number, number] = [x1 - Math.cos(ang - 0.5) * head, y1 - Math.sin(ang - 0.5) * head];
  const h2: [number, number] = [x1 - Math.cos(ang + 0.5) * head, y1 - Math.sin(ang + 0.5) * head];
  return [{ line: pts, c: WIZ_RED, w: 9 }, { line: [h1, [x1, y1], h2], c: WIZ_RED, w: 9 }];
}

/** Original, absurd chart "theories". Humor only — they never say anything about the market. */
function theory(n: number): Step[] {
  const kind = n % 4;
  const title = (name: string): Step => ({ text: `THEORY #${n}: ${name}`, x: 0.05, y: 0.1, size: 34 });
  const foot: Step = { text: fx.pick(["* not advice. not even a chart.", "* simulated. like my confidence.", "* do not trade this. do not ask."]), x: 0.05, y: 0.94, size: 22 };
  if (kind === 1) {
    const s: Step[] = [title("THE TRIPLE PENNANT")];
    s.push({ line: tri(0.27, 0.52, 0.16) }, { line: tri(0.27, 0.56, 0.085) }, { line: tri(0.27, 0.585, 0.038) });
    s.push({ text: "needs 1 more Δ", x: 0.4, y: 0.66, size: 26, rot: -0.08 }, { line: [[0.4, 0.65], [0.3, 0.6]] });
    s.push(...bigArrow(0.1, 0.84, 0.57, 0.17, 0.12));
    s.push({ text: "MOON??", x: 0.44, y: 0.26, size: 34, rot: -0.25, c: WIZ_RED });
    s.push(foot);
    return s;
  }
  if (kind === 2) {
    const s: Step[] = [title("INVERTED TEAPOT")];
    const body: [number, number][] = [];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI + (i / 12) * Math.PI;
      body.push([0.28 + Math.cos(a) * 0.15, 0.36 - Math.sin(a) * 0.17]);
    }
    body.push([0.13, 0.36]);
    s.push({ line: body }, { line: [[0.43, 0.42], [0.52, 0.44], [0.52, 0.56], [0.41, 0.5]] }, { line: [[0.13, 0.4], [0.06, 0.58], [0.1, 0.6]] });
    s.push({ text: "pour = pump?", x: 0.08, y: 0.7, size: 28, rot: 0.05 });
    s.push(...bigArrow(0.22, 0.6, 0.55, 0.78, -0.14));
    s.push({ text: "bullish OR bearish (confirmed)", x: 0.18, y: 0.86, size: 24, c: WIZ_RED });
    s.push(foot);
    return s;
  }
  if (kind === 3) {
    const s: Step[] = [title("THE WICK SPIRAL")];
    const candles = [
      [0.1, 0.55, 0.65],
      [0.17, 0.5, 0.6],
      [0.24, 0.42, 0.56],
      [0.31, 0.46, 0.53],
    ];
    for (const [x, top, bot] of candles) {
      s.push({ line: [[x - 0.018, top], [x + 0.018, top], [x + 0.018, bot], [x - 0.018, bot], [x - 0.018, top]] });
      s.push({ line: [[x, top - 0.06], [x, top]] });
    }
    const sp: [number, number][] = [];
    for (let i = 0; i <= 22; i++) {
      const a = i * 0.55;
      const r = 0.012 + i * 0.006;
      sp.push([0.44 + Math.cos(a) * r, 0.42 + Math.sin(a) * r * 1.2]);
    }
    s.push({ line: sp });
    s.push(...bigArrow(0.44, 0.42, 0.58, 0.14, 0.1));
    s.push({ text: "→ DESTINY", x: 0.36, y: 0.2, size: 28, rot: -0.12, c: WIZ_RED }, { text: "fib-ish. do not zoom out.", x: 0.07, y: 0.78, size: 24 });
    s.push(foot);
    return s;
  }
  const s: Step[] = [title("HEAD, SHOULDERS, KNEES & TOES")];
  const path: [number, number][] = [
    [0.05, 0.7],
    [0.11, 0.5],
    [0.16, 0.62],
    [0.24, 0.32],
    [0.32, 0.62],
    [0.37, 0.5],
    [0.42, 0.66],
    [0.46, 0.6],
    [0.5, 0.72],
    [0.53, 0.69],
    [0.56, 0.76],
  ];
  s.push({ line: path });
  s.push({ text: "head", x: 0.21, y: 0.27, size: 24 }, { text: "shoulders", x: 0.06, y: 0.44, size: 22 }, { text: "knees", x: 0.4, y: 0.57, size: 22 }, { text: "toes", x: 0.5, y: 0.82, size: 22 });
  s.push(...bigArrow(0.56, 0.76, 0.6, 0.2, 0.1));
  s.push({ text: "???", x: 0.53, y: 0.17, size: 36, c: WIZ_RED });
  s.push(foot);
  return s;
}

function annotation(): Step[] {
  const x = fx.range(0.08, 0.42);
  const y = fx.range(0.2, 0.8);
  const notes = ["+1 triangle", "still loading…", "confirmed?", "see? SEE?", "(I was early)", "this part is important", "pattern within pattern"];
  return [{ line: tri(x + 0.08, y - 0.06, fx.range(0.025, 0.045)) }, { text: fx.pick(notes), x, y, size: 26, rot: fx.range(-0.12, 0.12) }];
}

interface WizJob {
  steps: Step[];
  i: number;
  k: number; // progress within the step (vertex or char)
  t: number;
  stroke: Stroke | null;
}

/**
 * Drawable whiteboard backed by a canvas texture. The Chart Wizard owns the
 * left part (his current theory); the player draws in a bounded corner on the
 * right. Both persist in the save until erased or (for the Wizard) replaced.
 */
export class Whiteboard {
  readonly canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  strokes: Stroke[] = [];
  private current: Stroke | null = null;
  private dirty = true;
  private wipe: { t: number; x0: number; x1: number; owner: "w" | "p" | "all" } | null = null;
  private job: WizJob | null = null;
  ink = 0; // amount drawn by the player (for "board is full" logic)
  theoryNo = 0;

  constructor(mesh: THREE.Mesh) {
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.map = this.texture;
    mat.color.set("#ffffff");
    mat.needsUpdate = true;
    this.redraw();
  }

  /** Board-space point (from the hit uv) if it lies in the player's corner. */
  static toPlayerZone(u: number, v: number): [number, number] | null {
    const x = u;
    const y = 1 - v;
    const z = PLAYER_ZONE;
    return x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1 ? [x, y] : null;
  }

  get playerStrokes(): number {
    return this.strokes.filter((s) => s.o === "p").length;
  }

  get hasTheory(): boolean {
    return this.strokes.some((s) => s.o === "w");
  }

  /** uv: hit uv on the board plane (0..1). Returns false outside the player's corner. */
  begin(u: number, v: number, color = "#1b1b1b"): boolean {
    const p = Whiteboard.toPlayerZone(u, v);
    if (!p || this.wipe) return false;
    this.current = { c: color, w: 7, pts: [p[0], p[1]], o: "p" };
    this.strokes.push(this.current);
    this.capStrokes();
    this.dirty = true;
    return true;
  }

  extend(u: number, v: number) {
    if (!this.current) return;
    const q = Whiteboard.toPlayerZone(u, v);
    if (!q) {
      // left the corner: lift the marker
      this.current = null;
      return;
    }
    const p = this.current.pts;
    const lx = p[p.length - 2];
    const ly = p[p.length - 1];
    const d = Math.hypot(q[0] - lx, q[1] - ly);
    if (d < 0.004) return;
    if (d > 0.25) {
      this.begin(u, v, this.current.c);
      return;
    }
    p.push(q[0], q[1]);
    this.ink += d;
    this.dirty = true;
  }

  end() {
    this.current = null;
  }

  get drawing() {
    return !!this.current;
  }

  get wiping() {
    return !!this.wipe;
  }

  /** Erase the player's corner, the Wizard's theory, or everything. */
  startWipe(owner: "w" | "p" | "all" = "all") {
    const has = owner === "all" ? this.strokes.length > 0 : this.strokes.some((s) => s.o === owner);
    if (!has || this.wipe) return false;
    const z = owner === "p" ? [PLAYER_ZONE.x0 - 0.02, 1] : owner === "w" ? [0, THEORY_ZONE.x1 + 0.02] : [0, 1];
    this.wipe = { t: 0, x0: z[0], x1: z[1], owner };
    this.current = null;
    if (owner !== "p") this.job = null;
    return true;
  }

  private capStrokes() {
    let total = 0;
    for (const s of this.strokes) if (s.o === "p") total += s.pts.length;
    while (total > 6000) {
      const i = this.strokes.findIndex((s) => s.o === "p");
      if (i < 0 || this.strokes[i] === this.current) break;
      total -= this.strokes[i].pts.length;
      this.strokes.splice(i, 1);
    }
  }

  /** The Wizard steps up to the board: a new theory, or one more note on the current one. */
  beginWizardVisit() {
    if (this.job) return; // still finishing the last one
    const replace = !this.hasTheory || fx.chance(0.5);
    if (replace) {
      this.theoryNo++;
      const steps = theory(this.theoryNo);
      if (this.hasTheory) this.startWipe("w");
      this.job = { steps, i: 0, k: 0, t: -0.4, stroke: null };
    } else this.job = { steps: annotation(), i: 0, k: 0, t: 0, stroke: null };
  }

  /** Called every frame while the Wizard is at the board; true while there is still something to draw. */
  wizardDraw(dt: number): boolean {
    const job = this.job;
    if (!job) return false;
    if (this.wipe) return true; // erasing his old theory first
    job.t += dt;
    while (job.t > 0.055 && job.i < job.steps.length) {
      job.t -= 0.055;
      const st = job.steps[job.i];
      if ("line" in st) {
        const [x, y] = st.line[job.k];
        if (!job.stroke) {
          job.stroke = { c: st.c ?? WIZ_INK, w: st.w ?? 6, pts: [x, y], o: "w" };
          this.strokes.push(job.stroke);
        } else {
          // interpolate for a hand-drawn line
          const p = job.stroke.pts;
          const lx = p[p.length - 2];
          const ly = p[p.length - 1];
          for (let k = 1; k <= 5; k++) {
            const t = k / 5;
            p.push(lx + (x - lx) * t + fx.range(-0.0018, 0.0018), ly + (y - ly) * t + fx.range(-0.0018, 0.0018));
          }
        }
        job.k++;
        if (job.k >= st.line.length) {
          job.i++;
          job.k = 0;
          job.stroke = null;
        }
      } else {
        // handwriting: two letters per beat
        if (!job.stroke) {
          job.stroke = { c: st.c ?? WIZ_INK, w: st.size, pts: [st.x, st.y], o: "w", txt: "", rot: st.rot ?? 0 };
          this.strokes.push(job.stroke);
        }
        job.k = Math.min(st.text.length, job.k + 2);
        job.stroke.txt = st.text.slice(0, job.k);
        if (job.k >= st.text.length) {
          job.i++;
          job.k = 0;
          job.stroke = null;
        }
      }
      this.dirty = true;
    }
    if (job.i >= job.steps.length) this.job = null;
    return !!this.job;
  }

  update(dt: number) {
    if (this.wipe) {
      this.wipe.t += dt / 1.4;
      this.dirty = true;
      if (this.wipe.t >= 1) {
        const o = this.wipe.owner;
        this.strokes = o === "all" ? [] : this.strokes.filter((s) => s.o !== o);
        if (o !== "w") this.ink = 0;
        this.wipe = null;
      }
    }
    if (this.dirty) {
      this.redraw();
      this.dirty = false;
    }
  }

  private redraw() {
    const ctx = this.ctx;
    ctx.fillStyle = "#f1f1ec";
    ctx.fillRect(0, 0, W, H);
    // faint ghosting of old marker
    ctx.fillStyle = "rgba(120,130,150,0.05)";
    ctx.font = `400 120px ${FONT_HAND}`;
    ctx.fillText("HODL?", 80, 220);
    // the player's corner: a taped-off frame
    const z = PLAYER_ZONE;
    ctx.save();
    ctx.setLineDash([14, 10]);
    ctx.strokeStyle = "rgba(60,60,70,0.28)";
    ctx.lineWidth = 3;
    ctx.strokeRect(z.x0 * W, z.y0 * H, (z.x1 - z.x0) * W, (z.y1 - z.y0) * H);
    ctx.restore();
    ctx.fillStyle = "rgba(60,60,70,0.4)";
    ctx.font = `400 26px ${FONT_HAND}`;
    ctx.fillText("GUEST CORNER", z.x0 * W + 14, z.y0 * H - 12);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.textBaseline = "alphabetic";
    for (const s of this.strokes) {
      if (s.txt !== undefined) {
        ctx.save();
        ctx.translate(s.pts[0] * W, s.pts[1] * H);
        ctx.rotate(s.rot ?? 0);
        ctx.fillStyle = s.c;
        ctx.font = `400 ${s.w}px ${FONT_HAND}`;
        ctx.fillText(s.txt, 0, 0);
        ctx.restore();
        continue;
      }
      if (s.pts.length < 2) continue;
      ctx.strokeStyle = s.c;
      ctx.lineWidth = s.w;
      ctx.beginPath();
      ctx.moveTo(s.pts[0] * W, s.pts[1] * H);
      if (s.pts.length === 2) ctx.lineTo(s.pts[0] * W + 0.5, s.pts[1] * H + 0.5);
      for (let i = 2; i < s.pts.length; i += 2) ctx.lineTo(s.pts[i] * W, s.pts[i + 1] * H);
      ctx.stroke();
    }
    if (this.wipe) {
      // eraser sweep across the region being wiped
      const w = this.wipe;
      const x0 = w.x0 * W;
      const x = x0 + w.t * (w.x1 - w.x0) * W * 1.15;
      ctx.fillStyle = "#f1f1ec";
      ctx.fillRect(x0, 0, Math.min(x, w.x1 * W) - x0, H);
      ctx.fillStyle = "rgba(160,170,180,0.18)";
      ctx.fillRect(x - 40, 0, 40, H);
      if (w.owner === "w") {
        // keep the guest corner frame intact
        ctx.save();
        ctx.setLineDash([14, 10]);
        ctx.strokeStyle = "rgba(60,60,70,0.28)";
        ctx.lineWidth = 3;
        ctx.strokeRect(z.x0 * W, z.y0 * H, (z.x1 - z.x0) * W, (z.y1 - z.y0) * H);
        ctx.restore();
      }
    }
    this.texture.needsUpdate = true;
  }

  serialize(): Stroke[] {
    return this.strokes.map((s) => {
      const o: Stroke = { c: s.c, w: s.w, pts: s.pts.map((p) => Math.round(p * 1000) / 1000) };
      if (s.o) o.o = s.o;
      if (s.txt !== undefined) {
        o.txt = s.txt;
        o.rot = Math.round((s.rot ?? 0) * 1000) / 1000;
      }
      return o;
    });
  }

  restore(s: Stroke[] | undefined) {
    this.job = null;
    this.wipe = null;
    if (!Array.isArray(s)) return;
    // older saves had no owner: blue lines were the Wizard's
    this.strokes = s.filter((x) => Array.isArray(x.pts)).map((x) => ({ ...x, o: x.o ?? (x.c === WIZ_INK ? "w" : "p") }));
    this.theoryNo = 0;
    for (const x of this.strokes) {
      const m = x.txt?.match(/THEORY #(\d+)/);
      if (m) this.theoryNo = Math.max(this.theoryNo, Number(m[1]));
    }
    this.dirty = true;
  }
}
