// Assembles the static world: terrain, sky, crops, vegetation, structures, water.
import * as THREE from 'three';
// Must load before any material compiles: it extends the stock fog chunks.
import { Atmosphere } from './atmosphere.js';
import { TerrainData } from './terrainData.js';
import { createTerrain } from './terrain.js';
import { createRoads } from './roads.js';
import { createSky } from './sky.js';
import { createCrops } from './crops.js';
import { makeNoiseTexture } from '../core/textures.js';
import { createVegetation, makeTreeCollider } from './vegetation.js';
import { createStructures } from './structures.js';
import { createGrass } from './grass.js';
import { createFarmLife } from './farmlife.js';

export class World {
  constructor(renderer, scene, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.quality = quality;
    this.updaters = [];
  }

  async build(progress = () => {}) {
    const step = async (label, fn) => {
      progress(label);
      await new Promise((r) => setTimeout(r, 0));
      return fn();
    };
    this.noise = await step('Terrain', () => makeNoiseTexture(256));
    this.terrain = await step('Terrain', () => new TerrainData());
    this.terrainMesh = await step('Ground', () => createTerrain(this.terrain, this.noise));
    this.scene.add(this.terrainMesh.group);
    this.roads = createRoads(this.terrain);
    this.scene.add(this.roads.group);
    this.sky = await step('Sky', () => createSky(this.renderer, this.scene, this.quality));
    this.atmo = new Atmosphere({ renderer: this.renderer, scene: this.scene, sky: this.sky, terrain: this.terrain, quality: this.quality });
    this.visualWind = new THREE.Vector3(0, 0, 3);
    this.crops = await step('Crops', () => createCrops(this.terrain, this.quality));
    this.scene.add(this.crops.group);
    this.vegetation = await step('Forest', () => createVegetation(this.terrain, this.quality));
    this.scene.add(this.vegetation.group);
    this.grass = createGrass(this.terrain, this.quality, this.vegetation.atlas);
    this.scene.add(this.grass.group);
    this.structures = await step('Base', () => createStructures(this.terrain, this.scene));
    this.treeHit = makeTreeCollider(this.vegetation);
    this.farm = createFarmLife(this.scene, this.structures.M, this.terrain);
  }

  // Obstacle query for the aircraft: trees, buildings, wires. Returns a name or null.
  obstacleAt(x, y, z) {
    const th = this.terrain.heightAt(x, z);
    if (y - th > 40) return null;
    const t = this.treeHit(x, y, z, th);
    if (t) return t;
    for (const c of this.structures.colliders) {
      if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && y < c.top && !(y < c.bottom)) return c.name;
    }
    return this.extraObstacle?.(x, y, z) ?? null;
  }

  // Highest tree top near (x, z), metres (-Infinity where there is none).
  treeTopNear(x, z, rad) {
    return this.treeHit.topNear(x, z, rad, this.terrain.heightAt(x, z));
  }

  // Distance from a point to the nearest power-line wire (m).
  wireDistance(x, y, z) {
    let best = 1e9;
    for (const w of this.structures.wires) {
      const [ax, ay, az] = w.a, [bx, by, bz] = w.b;
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const l2 = dx * dx + dy * dy + dz * dz;
      let t = ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / l2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(ax + dx * t - x, ay + dy * t - y, az + dz * t - z);
      if (d < best) best = d;
    }
    return best;
  }

  setQuality(q) {
    this.quality = q;
    this.sky.setQuality(q);
    this.atmo.setQuality(q);
    this.crops.setQuality(q);
    this.grass.setQuality(q);
    for (const u of this.updaters) u.setQuality?.(q);
  }

  update(camera, focus, dt, time) {
    this.atmo.update(dt, camera, this.visualWind, time);
    this.sky.update(camera, focus, dt, time);
    this.crops.update(camera.position);
    this.vegetation.update(camera);
    this.grass.update(camera, time);
    for (const u of this.updaters) u.update?.(camera, focus, dt, time);
    this.farm.update(dt, time, camera, this.dust);
  }
}

export { THREE };
