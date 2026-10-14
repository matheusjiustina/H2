import * as THREE from "three";
import { fx } from "../core/rng";
import { FONT_HAND } from "../world/textures";

export interface Stroke {
  c: string; // color
  w: number; // width (px)
  pts: number[]; // x,y pairs in 0..1 board space
}

const W = 1024;
const H = 788;

/**
 * Drawable whiteboard backed by a canvas texture. Strokes are kept (capped) so
 * the drawing survives saves; erasing is a gradual wipe.
 */
export class Whiteboard {
  readonly canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  strokes: Stroke[] = [];
  private current: Stroke | null = null;
  private dirty = true;
  private wipe = -1;
  private wizard: { pts: [number, number][]; i: number; stroke: Stroke | null; t: number } | null = null;
  ink = 0; // amount drawn (for "board is full" logic)

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

  /** uv: hit uv on the board plane (0..1). */
  begin(u: number, v: number, color = "#1b1b1b") {
    this.current = { c: color, w: 7, pts: [u, 1 - v] };
    this.strokes.push(this.current);
    this.capStrokes();
    this.dirty = true;
  }

  extend(u: number, v: number) {
    if (!this.current) return;
    const p = this.current.pts;
    const lx = p[p.length - 2];
    const ly = p[p.length - 1];
    const d = Math.hypot(u - lx, 1 - v - ly);
    if (d < 0.004) return;
    if (d > 0.25) {
      // jumped (aim left the board): start a new stroke
      this.begin(u, v, this.current.c);
      return;
    }
    p.push(u, 1 - v);
    this.ink += d;
    this.dirty = true;
  }

  end() {
    this.current = null;
  }

  get drawing() {
    return !!this.current;
  }

  startWipe() {
    if (!this.strokes.length) return false;
    this.wipe = 0;
    this.current = null;
    this.wizard = null;
    return true;
  }

  private capStrokes() {
    let total = 0;
    for (const s of this.strokes) total += s.pts.length;
    while (total > 6000 && this.strokes.length > 1) {
      total -= this.strokes[0].pts.length;
      this.strokes.shift();
    }
  }

  /** The Chart Wizard draws a "pattern": triangles inside triangles plus a label. */
  wizardDraw(dt: number) {
    if (!this.wizard) {
      const cx = fx.range(0.25, 0.75);
      const cy = fx.range(0.3, 0.65);
      const s = fx.range(0.12, 0.2);
      const pts: [number, number][] = [];
      const tri = (x: number, y: number, r: number) => {
        pts.push([x - r, y + r * 0.8], [x + r, y + r * 0.8], [x, y - r * 0.9], [x - r, y + r * 0.8], [NaN, NaN]);
      };
      tri(cx, cy, s);
      tri(cx, cy + s * 0.25, s * 0.5);
      tri(cx + s * 1.3, cy - s * 0.4, s * 0.35);
      // trend line
      pts.push([cx - s * 1.6, cy + s * 1.1], [cx + s * 1.9, cy - s * 0.9], [NaN, NaN]);
      this.wizard = { pts, i: 0, stroke: null, t: 0 };
    }
    const wz = this.wizard;
    wz.t += dt;
    while (wz.t > 0.06 && wz.i < wz.pts.length) {
      wz.t -= 0.06;
      const [x, y] = wz.pts[wz.i++];
      if (Number.isNaN(x)) {
        wz.stroke = null;
        continue;
      }
      if (!wz.stroke) {
        wz.stroke = { c: "#2b4fa8", w: 6, pts: [x, y] };
        this.strokes.push(wz.stroke);
        this.capStrokes();
      } else {
        // interpolate for a hand-drawn line
        const p = wz.stroke.pts;
        const lx = p[p.length - 2];
        const ly = p[p.length - 1];
        for (let k = 1; k <= 6; k++) {
          const t = k / 6;
          p.push(lx + (x - lx) * t + fx.range(-0.002, 0.002), ly + (y - ly) * t + fx.range(-0.002, 0.002));
        }
        this.ink += Math.hypot(x - lx, y - ly);
      }
      this.dirty = true;
    }
    if (wz.i >= wz.pts.length) this.wizard = null;
  }

  update(dt: number) {
    if (this.wipe >= 0) {
      this.wipe += dt / 1.6;
      this.dirty = true;
      if (this.wipe >= 1) {
        this.strokes = [];
        this.ink = 0;
        this.wipe = -1;
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
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of this.strokes) {
      if (s.pts.length < 2) continue;
      ctx.strokeStyle = s.c;
      ctx.lineWidth = s.w;
      ctx.beginPath();
      ctx.moveTo(s.pts[0] * W, s.pts[1] * H);
      if (s.pts.length === 2) ctx.lineTo(s.pts[0] * W + 0.5, s.pts[1] * H + 0.5);
      for (let i = 2; i < s.pts.length; i += 2) ctx.lineTo(s.pts[i] * W, s.pts[i + 1] * H);
      ctx.stroke();
    }
    if (this.wipe >= 0) {
      // eraser sweep from left to right
      const x = this.wipe * W * 1.2;
      ctx.fillStyle = "#f1f1ec";
      ctx.fillRect(0, 0, x, H);
      ctx.fillStyle = "rgba(160,170,180,0.18)";
      ctx.fillRect(x - 40, 0, 40, H);
    }
    this.texture.needsUpdate = true;
  }

  serialize(): Stroke[] {
    return this.strokes.map((s) => ({ c: s.c, w: s.w, pts: s.pts.map((p) => Math.round(p * 1000) / 1000) }));
  }

  restore(s: Stroke[] | undefined) {
    if (!Array.isArray(s)) return;
    this.strokes = s.filter((x) => Array.isArray(x.pts));
    this.dirty = true;
  }
}
