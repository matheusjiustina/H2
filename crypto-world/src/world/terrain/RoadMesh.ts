import { BufferAttribute, BufferGeometry, Color, Group, Mesh, Vector3 } from 'three';
import { geodesicStep } from '../../core/math/sphere';
import { PLANET_RADIUS } from '../constants';
import { RoadDef } from '../layout/LayoutBuilder';
import { OverlayPainter } from './Overlay';
import { createWorldMaterial } from '../../render/materials';

const CHUNK = 24; // samples per mesh chunk — keeps bounding spheres tight for horizon culling

/**
 * Paved roads are real geometry: ribbons whose vertices sit exactly on the baked ground, lifted a
 * few centimetres, so edges and lane markings stay crisp at any camera distance.
 */
export function buildRoadMeshes(roads: RoadDef[], groundAt: (d: Vector3) => number): Group {
  const group = new Group();
  group.name = 'roads';
  const mat = createWorldMaterial({ vertexColors: true, groundNoise: true, name: 'road' });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -4;

  for (const road of roads) {
    if (!isPaved(road)) continue;
    const pts = road.points;
    const { left: el, right: er } = road.style.edge ? OverlayPainter.edges(pts, road.style.edge.width) : { left: [], right: [] };
    const { left: sl, right: sr } = OverlayPainter.edges(pts, road.style.width);
    const edgeCol = new Color(road.style.edge?.color ?? road.style.color);
    const surfCol = new Color(road.style.color);

    for (let start = 0; start < pts.length - 1; start += CHUNK) {
      const end = Math.min(pts.length - 1, start + CHUNK);
      const pos: number[] = [];
      const nor: number[] = [];
      const col: number[] = [];
      const idx: number[] = [];
      const strip = (L: Vector3[], C: Vector3[], R: Vector3[], lift: number, color: Color) => {
        const base = pos.length / 3;
        for (let i = start; i <= end; i++) {
          for (const v of [L[i], C[i], R[i]]) {
            const h = groundAt(v);
            const r = PLANET_RADIUS + h + lift;
            pos.push(v.x * r, v.y * r, v.z * r);
            nor.push(v.x, v.y, v.z);
            col.push(color.r, color.g, color.b);
          }
        }
        const rows = end - start;
        for (let i = 0; i < rows; i++) {
          const a = base + i * 3;
          const b = a + 3;
          // Two quads across the width (left-centre, centre-right).
          idx.push(a, a + 1, b + 1, a, b + 1, b);
          idx.push(a + 1, a + 2, b + 2, a + 1, b + 2, b + 1);
        }
      };
      const lb = (road.style.layer ?? 1) * 0.035;
      if (road.style.edge) strip(el, pts, er, lb + 0.03, edgeCol);
      strip(sl, pts, sr, lb + 0.05, surfCol);
      // Fix winding: make triangles face outward.
      fixWinding(pos, idx);
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
      geo.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
      geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const mesh = new Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }

    if (road.style.center) {
      const c = road.style.center;
      const dashCol = new Color(c.color);
      const pos: number[] = [];
      const nor: number[] = [];
      const col: number[] = [];
      const idx: number[] = [];
      let acc = 0;
      let on = true;
      const tan = new Vector3();
      const side = new Vector3();
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const seg = a.distanceTo(b) * PLANET_RADIUS;
        if (on) {
          tan.subVectors(b, a).normalize();
          side.crossVectors(a, tan).normalize();
          const base = pos.length / 3;
          for (const p of [a, b]) {
            for (const s of [-1, 1]) {
              const v = geodesicStep(p, side.clone().multiplyScalar(s), c.width / 2, PLANET_RADIUS);
              const r = PLANET_RADIUS + groundAt(v) + (road.style.layer ?? 1) * 0.035 + 0.075;
              pos.push(v.x * r, v.y * r, v.z * r);
              nor.push(v.x, v.y, v.z);
              col.push(dashCol.r, dashCol.g, dashCol.b);
            }
          }
          idx.push(base, base + 1, base + 3, base, base + 3, base + 2);
        }
        acc += seg;
        if (acc >= (on ? c.dash : c.gap)) {
          acc = 0;
          on = !on;
        }
      }
      if (idx.length) {
        fixWinding(pos, idx);
        // Dashes are split into chunks for culling.
        const triCount = idx.length / 3;
        const per = 60;
        for (let t0 = 0; t0 < triCount; t0 += per) {
          const sub = idx.slice(t0 * 3, Math.min(triCount, t0 + per) * 3);
          const used = [...new Set(sub)].sort((x, y) => x - y);
          const remap = new Map(used.map((v, i) => [v, i]));
          const p2: number[] = [], n2: number[] = [], c2: number[] = [];
          for (const v of used) {
            p2.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
            n2.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);
            c2.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]);
          }
          const geo = new BufferGeometry();
          geo.setAttribute('position', new BufferAttribute(new Float32Array(p2), 3));
          geo.setAttribute('normal', new BufferAttribute(new Float32Array(n2), 3));
          geo.setAttribute('color', new BufferAttribute(new Float32Array(c2), 3));
          geo.setIndex(sub.map((v) => remap.get(v)!));
          geo.computeBoundingSphere();
          const mesh = new Mesh(geo, mat);
          mesh.receiveShadow = true;
          mesh.matrixAutoUpdate = false;
          group.add(mesh);
        }
      }
    }
  }
  return group;
}

/** Ensures each triangle's normal points away from the planet centre. */
function fixWinding(pos: number[], idx: number[]): void {
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    a.fromArray(pos, idx[i] * 3);
    b.fromArray(pos, idx[i + 1] * 3);
    c.fromArray(pos, idx[i + 2] * 3);
    n.crossVectors(b.clone().sub(a), c.clone().sub(a));
    if (n.dot(a) < 0) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
}

export function isPaved(road: RoadDef): boolean {
  return road.style.material === 'stone' || road.style.material === 'metal' || road.style.material === 'wood';
}
