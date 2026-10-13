import { BufferAttribute, BufferGeometry, Color, Group, Mesh, Sphere, Vector3 } from 'three';
import { PLANET_RADIUS, TERRAIN_CHUNKS } from '../constants';
import { gridDir, Heightfield } from './Heightfield';
import { createWorldMaterial } from '../../render/materials';

export type TerrainColorFn = (dir: Vector3, height: number, normal: Vector3, out: Color) => void;

/**
 * Renders the baked heightfield as 6 × TERRAIN_CHUNKS² chunks. Each chunk is its own mesh with a
 * tight bounding sphere so the culling system can drop chunks hidden beyond the planet's horizon.
 */
export class TerrainMesh {
  readonly group = new Group();
  readonly chunks: Mesh[] = [];

  constructor(hf: Heightfield, colorFn: TerrainColorFn) {
    const N = hf.N;
    const C = N / TERRAIN_CHUNKS;
    const material = createWorldMaterial({ vertexColors: true, terrain: true, name: 'terrain' });
    // Shared index buffer: every chunk has the same (C+1)² vertex layout.
    const idx = new Uint16Array(C * C * 6);
    let k = 0;
    for (let j = 0; j < C; j++)
      for (let i = 0; i < C; i++) {
        const a = i + j * (C + 1);
        const b = a + 1;
        const c = a + (C + 1) + 1;
        const d = a + (C + 1);
        idx[k++] = a; idx[k++] = b; idx[k++] = c;
        idx[k++] = a; idx[k++] = c; idx[k++] = d;
      }
    const index = new BufferAttribute(idx, 1);
    const dir = new Vector3();
    const nrm = new Vector3();
    const col = new Color();
    const S = N + 1;

    for (let face = 0; face < 6; face++) {
      const normals = hf.normals[face];
      for (let cj = 0; cj < TERRAIN_CHUNKS; cj++) {
        for (let ci = 0; ci < TERRAIN_CHUNKS; ci++) {
          const V = (C + 1) * (C + 1);
          const pos = new Float32Array(V * 3);
          const nor = new Float32Array(V * 3);
          const colr = new Float32Array(V * 3);
          let v = 0;
          for (let j = 0; j <= C; j++) {
            for (let i = 0; i <= C; i++) {
              const gi = ci * C + i;
              const gj = cj * C + j;
              gridDir(face, gi, gj, N, dir);
              const h = hf.vertexHeight(face, gi, gj);
              const r = PLANET_RADIUS + h;
              pos[v * 3] = dir.x * r;
              pos[v * 3 + 1] = dir.y * r;
              pos[v * 3 + 2] = dir.z * r;
              const nk = (gi + gj * S) * 3;
              nrm.set(normals[nk], normals[nk + 1], normals[nk + 2]);
              nor[v * 3] = nrm.x;
              nor[v * 3 + 1] = nrm.y;
              nor[v * 3 + 2] = nrm.z;
              colorFn(dir, h, nrm, col);
              colr[v * 3] = col.r;
              colr[v * 3 + 1] = col.g;
              colr[v * 3 + 2] = col.b;
              v++;
            }
          }
          const geo = new BufferGeometry();
          geo.setAttribute('position', new BufferAttribute(pos, 3));
          geo.setAttribute('normal', new BufferAttribute(nor, 3));
          geo.setAttribute('color', new BufferAttribute(colr, 3));
          geo.setIndex(index);
          geo.computeBoundingSphere();
          geo.boundingSphere = geo.boundingSphere ?? new Sphere();
          const mesh = new Mesh(geo, material);
          mesh.name = `terrain-${face}-${ci}-${cj}`;
          mesh.receiveShadow = true;
          mesh.matrixAutoUpdate = false;
          this.chunks.push(mesh);
          this.group.add(mesh);
        }
      }
    }
  }
}
