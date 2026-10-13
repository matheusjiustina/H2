import { Group, Vector3 } from 'three';
import { LayoutBuilder } from './layout/LayoutBuilder';
import { Heightfield } from './terrain/Heightfield';
import { TerrainMesh } from './terrain/TerrainMesh';
import { Biomes, createBiomes } from './terrain/biomes';
import { CollisionWorld } from './Collision';
import { OverlayPainter } from './terrain/Overlay';
import { PLANET_RADIUS } from './constants';

/**
 * The physical planet: baked heightfield, terrain mesh, ground overlay and collision world.
 * Content builders (buildings, vegetation, NPCs) are layered on top by WorldContent.
 */
export class World {
  readonly root = new Group();
  readonly heightfield: Heightfield;
  readonly terrain: TerrainMesh;
  readonly collision: CollisionWorld;
  readonly biomes: Biomes;
  overlay: OverlayPainter | null = null;

  constructor(readonly layout: LayoutBuilder) {
    layout.finalizeTerrain();
    this.heightfield = new Heightfield((d) => layout.shape.height(d));
    this.biomes = createBiomes(layout);
    this.terrain = new TerrainMesh(this.heightfield, this.biomes.colorAt);
    this.root.add(this.terrain.group);
    this.collision = new CollisionWorld((d) => this.heightfield.heightAt(d));
  }

  /** Paints roads and ground art. Separate so quality settings can choose the resolution. */
  paintOverlay(size: number): OverlayPainter {
    const painter = new OverlayPainter(size);
    this.layout.paintOverlay(painter);
    this.overlay = painter;
    return painter;
  }

  groundHeight(d: Vector3): number {
    return this.heightfield.heightAt(d);
  }

  surfacePoint(d: Vector3, lift = 0, out = new Vector3()): Vector3 {
    const n = out.copy(d).normalize();
    const h = this.collision.ground(n).height;
    return n.multiplyScalar(PLANET_RADIUS + h + lift);
  }
}
