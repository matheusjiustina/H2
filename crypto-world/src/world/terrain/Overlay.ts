import { CubeTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, Vector3 } from 'three';
import { geodesicStep, tangentFrame } from '../../core/math/sphere';
import { PLANET_RADIUS } from '../constants';

/**
 * Paints roads, plazas, paths and ground artwork into a cube map that the terrain shader samples by
 * direction. Faces follow the WebGL cube-map convention, and the gnomonic projection used by cube
 * maps maps great-circle arcs to straight lines, so a road drawn as a polygon stays crisp and exact.
 */

type Pt = { x: number; y: number };

function projectFace(face: number, d: Vector3, size: number): Pt | null {
  let ma: number, sc: number, tc: number;
  switch (face) {
    case 0: ma = d.x; sc = -d.z; tc = -d.y; break;
    case 1: ma = -d.x; sc = d.z; tc = -d.y; break;
    case 2: ma = d.y; sc = d.x; tc = d.z; break;
    case 3: ma = -d.y; sc = d.x; tc = -d.z; break;
    case 4: ma = d.z; sc = d.x; tc = -d.y; break;
    default: ma = -d.z; sc = -d.x; tc = -d.y; break;
  }
  const len = d.length();
  if (ma / len < 0.08) return null;
  return { x: ((sc / ma + 1) / 2) * size, y: ((tc / ma + 1) / 2) * size };
}

export class OverlayPainter {
  readonly canvases: HTMLCanvasElement[] = [];
  private ctxs: CanvasRenderingContext2D[] = [];

  constructor(readonly size: number) {
    for (let i = 0; i < 6; i++) {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, size, size);
      this.canvases.push(c);
      this.ctxs.push(ctx);
    }
  }

  /** Fills a closed polygon of unit directions. Split per face into runs of projectable points. */
  fillPolygon(points: Vector3[], color: string): void {
    for (let f = 0; f < 6; f++) {
      const proj = points.map((p) => projectFace(f, p, this.size));
      if (proj.some((p) => p === null)) {
        continue;
      }
      const pts = proj as Pt[];
      if (!this.onCanvas(pts)) continue;
      const ctx = this.ctxs[f];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fill();
    }
  }

  private onCanvas(pts: Pt[]): boolean {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return maxX >= 0 && maxY >= 0 && minX <= this.size && minY <= this.size;
  }

  /** Offsets a polyline sideways on the sphere: returns left and right edges. */
  static edges(points: Vector3[], width: number): { left: Vector3[]; right: Vector3[] } {
    const left: Vector3[] = [];
    const right: Vector3[] = [];
    const t = new Vector3();
    const s = new Vector3();
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const a = points[Math.max(0, i - 1)];
      const b = points[Math.min(points.length - 1, i + 1)];
      t.copy(b).sub(a);
      t.addScaledVector(p, -t.dot(p)).normalize();
      s.crossVectors(p, t).normalize();
      left.push(geodesicStep(p, s, width / 2, PLANET_RADIUS));
      right.push(geodesicStep(p, s.clone().negate(), width / 2, PLANET_RADIUS));
    }
    return { left, right };
  }

  /** Draws a ribbon (road, path) of constant width along a polyline, split into face-local runs. */
  ribbon(points: Vector3[], width: number, color: string, closed = false): void {
    const pts = closed ? [...points, points[0], points[1]] : points;
    const { left, right } = OverlayPainter.edges(pts, width);
    for (let f = 0; f < 6; f++) {
      const ctx = this.ctxs[f];
      let run: { l: Pt; r: Pt }[] = [];
      const flush = () => {
        if (run.length >= 2) {
          const all = run.flatMap((q) => [q.l, q.r]);
          if (this.onCanvas(all)) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(run[0].l.x, run[0].l.y);
            for (let i = 1; i < run.length; i++) ctx.lineTo(run[i].l.x, run[i].l.y);
            for (let i = run.length - 1; i >= 0; i--) ctx.lineTo(run[i].r.x, run[i].r.y);
            ctx.closePath();
            ctx.fill();
          }
        }
        run = [];
      };
      for (let i = 0; i < pts.length; i++) {
        const l = projectFace(f, left[i], this.size);
        const r = projectFace(f, right[i], this.size);
        if (l && r) run.push({ l, r });
        else flush();
      }
      flush();
    }
  }

  /** Dashed centre line along a polyline. */
  dashes(points: Vector3[], width: number, dash: number, gap: number, color: string): void {
    // Walk along the polyline by arc length, emitting short ribbons.
    let acc = 0;
    let on = true;
    let cur: Vector3[] = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const seg = points[i - 1].distanceTo(points[i]) * PLANET_RADIUS;
      acc += seg;
      cur.push(points[i]);
      const limit = on ? dash : gap;
      if (acc >= limit) {
        if (on && cur.length >= 2) this.ribbon(cur, width, color);
        on = !on;
        acc = 0;
        cur = [points[i]];
      }
    }
  }

  disc(center: Vector3, radius: number, color: string, segments = 48): void {
    this.fillPolygon(OverlayPainter.circle(center, radius, segments), color);
  }

  ring(center: Vector3, r0: number, r1: number, color: string, segments = 64): void {
    const outer = OverlayPainter.circle(center, r1, segments);
    for (let f = 0; f < 6; f++) {
      const po = outer.map((p) => projectFace(f, p, this.size));
      const inner = OverlayPainter.circle(center, r0, segments).map((p) => projectFace(f, p, this.size));
      if (po.some((p) => !p) || inner.some((p) => !p)) continue;
      const ctx = this.ctxs[f];
      ctx.fillStyle = color;
      ctx.beginPath();
      (po as Pt[]).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      const inn = (inner as Pt[]).slice().reverse();
      inn.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill('evenodd');
    }
  }

  static circle(center: Vector3, radius: number, segments = 48): Vector3[] {
    const e = new Vector3();
    const n = new Vector3();
    tangentFrame(center, e, n);
    const out: Vector3[] = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const t = e.clone().multiplyScalar(Math.cos(a)).addScaledVector(n, Math.sin(a));
      out.push(geodesicStep(center, t, radius, PLANET_RADIUS));
    }
    return out;
  }

  /**
   * Draws arbitrary canvas artwork onto the ground. `draw` receives a context whose units are world
   * units, origin at `center`, +x along `xDir`, +y along `yDir` (pass south as yDir for upright text
   * when viewed with north at the top of the screen).
   */
  decal(center: Vector3, xDir: Vector3, yDir: Vector3, halfExtent: number, draw: (ctx: CanvasRenderingContext2D) => void): void {
    const px = geodesicStep(center, xDir, 1, PLANET_RADIUS);
    const py = geodesicStep(center, yDir, 1, PLANET_RADIUS);
    for (let f = 0; f < 6; f++) {
      const c = projectFace(f, center, this.size);
      const a = projectFace(f, px, this.size);
      const b = projectFace(f, py, this.size);
      if (!c || !a || !b) continue;
      const ex = (a.x - c.x), ey = (a.y - c.y);
      const fx = (b.x - c.x), fy = (b.y - c.y);
      const reach = halfExtent * Math.max(Math.hypot(ex, ey), Math.hypot(fx, fy));
      if (c.x + reach < 0 || c.y + reach < 0 || c.x - reach > this.size || c.y - reach > this.size) continue;
      const ctx = this.ctxs[f];
      ctx.save();
      ctx.setTransform(ex, ey, fx, fy, c.x, c.y);
      draw(ctx);
      ctx.restore();
    }
  }

  build(anisotropy = 4): CubeTexture {
    const tex = new CubeTexture(this.canvases);
    tex.colorSpace = SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.magFilter = LinearFilter;
    tex.anisotropy = anisotropy;
    // Premultiplied so mip filtering at road edges never bleeds dark fringes.
    tex.premultiplyAlpha = true;
    tex.needsUpdate = true;
    return tex;
  }
}
