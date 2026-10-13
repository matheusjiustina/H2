import { BufferAttribute, BufferGeometry, CanvasTexture, Mesh, SRGBColorSpace, Vector3 } from 'three';
import { geodesicStep } from '../../core/math/sphere';
import { PLANET_RADIUS } from '../constants';
import { createWorldMaterial } from '../../render/materials';

/**
 * A square of ground artwork (plaza paving, mosaics, painted markings) as a mesh that hugs the
 * terrain. Its canvas is drawn in world units with the origin at the centre, +x along `xDir` and
 * +y along `yDir`. Pixels outside the art should be left transparent.
 */
export function buildGroundDecal(
  center: Vector3,
  xDir: Vector3,
  yDir: Vector3,
  half: number,
  draw: (ctx: CanvasRenderingContext2D, half: number) => void,
  groundAt: (d: Vector3) => number,
  res = 1024,
  segments = 32,
): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = res;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(res / 2, res / 2);
  ctx.scale(res / (2 * half), -res / (2 * half)); // +y up in art space
  draw(ctx, half);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;

  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const t = new Vector3();
  for (let j = 0; j <= segments; j++) {
    for (let i = 0; i <= segments; i++) {
      const u = i / segments, v = j / segments;
      const x = (u - 0.5) * 2 * half, y = (v - 0.5) * 2 * half;
      const dist = Math.hypot(x, y);
      let d = center.clone();
      if (dist > 1e-6) {
        t.copy(xDir).multiplyScalar(x / dist).addScaledVector(yDir, y / dist);
        d = geodesicStep(center, t, dist, PLANET_RADIUS);
      }
      const r = PLANET_RADIUS + groundAt(d) + 0.025;
      pos.push(d.x * r, d.y * r, d.z * r);
      nor.push(d.x, d.y, d.z);
      uv.push(u, v);
      col.push(1, 1, 1);
    }
  }
  const S = segments + 1;
  for (let j = 0; j < segments; j++)
    for (let i = 0; i < segments; i++) {
      const a = i + j * S, b = a + 1, c = a + S + 1, e = a + S;
      idx.push(a, b, c, a, c, e);
    }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  geo.setIndex(idx);
  // Ensure outward winding.
  const p0 = new Vector3().fromArray(pos, 0), p1 = new Vector3().fromArray(pos, 3), p2 = new Vector3().fromArray(pos, (S + 1) * 3);
  const n = new Vector3().crossVectors(p1.clone().sub(p0), p2.clone().sub(p0));
  if (n.dot(p0) < 0) {
    for (let k = 0; k < idx.length; k += 3) {
      const tmp = idx[k + 1];
      idx[k + 1] = idx[k + 2];
      idx[k + 2] = tmp;
    }
    geo.setIndex(idx);
  }
  geo.computeBoundingSphere();
  // Every decal shares one shader program; only the texture differs.
  const src = createWorldMaterial({ vertexColors: true, groundNoise: true, transparent: true, name: 'decal' });
  const mat = src.clone();
  mat.onBeforeCompile = src.onBeforeCompile;
  mat.customProgramCacheKey = src.customProgramCacheKey;
  mat.map = tex;
  mat.transparent = true;
  mat.depthWrite = false;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -3;
  mat.polygonOffsetUnits = -6;
  const mesh = new Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  mesh.matrixAutoUpdate = false;
  return mesh;
}
