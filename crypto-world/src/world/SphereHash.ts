import { Vector3 } from 'three';

/**
 * Uniform 3D grid hash used for spatial queries on the planet surface. Because every surface
 * point is a 3D position, a plain world-space grid works identically at the poles, seams and
 * equator — no special cases for cube faces or latitude singularities.
 */
export class SphereHash<T> {
  private cells = new Map<number, T[]>();
  constructor(private cellSize = 6) {}

  private key(ix: number, iy: number, iz: number): number {
    // 10 bits per axis with offset: supports coordinates up to ±(512 * cellSize).
    return ((ix + 512) << 20) | ((iy + 512) << 10) | (iz + 512);
  }

  insert(item: T, center: Vector3, radius: number): void {
    const s = this.cellSize;
    const x0 = Math.floor((center.x - radius) / s), x1 = Math.floor((center.x + radius) / s);
    const y0 = Math.floor((center.y - radius) / s), y1 = Math.floor((center.y + radius) / s);
    const z0 = Math.floor((center.z - radius) / s), z1 = Math.floor((center.z + radius) / s);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const k = this.key(x, y, z);
          let arr = this.cells.get(k);
          if (!arr) this.cells.set(k, (arr = []));
          arr.push(item);
        }
  }

  /** Collects unique items whose cells overlap the query sphere. */
  query(center: Vector3, radius: number, out: T[] = [], seen: Set<T> = new Set()): T[] {
    const s = this.cellSize;
    const x0 = Math.floor((center.x - radius) / s), x1 = Math.floor((center.x + radius) / s);
    const y0 = Math.floor((center.y - radius) / s), y1 = Math.floor((center.y + radius) / s);
    const z0 = Math.floor((center.z - radius) / s), z1 = Math.floor((center.z + radius) / s);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const arr = this.cells.get(this.key(x, y, z));
          if (!arr) continue;
          for (const it of arr) {
            if (!seen.has(it)) {
              seen.add(it);
              out.push(it);
            }
          }
        }
    return out;
  }

  clear(): void {
    this.cells.clear();
  }
}
