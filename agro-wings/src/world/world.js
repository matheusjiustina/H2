// Assembles the static world: terrain, sky, crops, vegetation, structures, water.
import * as THREE from 'three';
// Must load before any material compiles: it extends the stock fog chunks.
import { Atmosphere } from './atmosphere.js';
import { TerrainData } from './terrainData.js';
import { createTerrain } from './terrain.js';
import { createRoads } from './roads.js';
import { createSky } from './sky.js';
import { createCrops } from './crops.js';
import { createCropPlants } from './cropPlants.js';
import { makeNoiseTexture } from '../core/textures.js';
import { createVegetation, makeTreeCollider } from './vegetation.js';
import { createStructures } from './structures.js';
import { createGrass } from './grass.js';
import { createFieldActivity } from './fieldActivity.js';
import { createWater } from './water.js';
import { createForestCrowns } from './forestCrowns.js';
import { freezeStatic } from './staticFreeze.js';
import { WorldStreaming } from './worldStreaming.js';
import { createExpansionScenery, expansionColliders } from './expansionScenery.js';
import { SERRA } from './activeMap.js';
import { createBananas } from './serraScenery.js';

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
    this.cropPlants = createCropPlants(this.scene, this.terrain, this.quality);
    this.vegetation = await step('Forest', () => createVegetation(this.terrain, this.quality));
    this.scene.add(this.vegetation.group);
    this.crowns = createForestCrowns(this.scene, this.terrain, this.vegetation.atlas, this.quality);
    this.grass = createGrass(this.terrain, this.quality, this.vegetation.atlas);
    this.scene.add(this.grass.group);
    this.structures = await step('Base', () => createStructures(this.terrain, this.scene));
    this.water = createWater(this.terrain, this.noise);
    this.scene.add(this.water);
    // World Expansion 2.0: the new regions' strips, sítios, fences, rocks and
    // waterfalls (streamed per region) and their colliders (plain boxes).
    this.expansion = createExpansionScenery(this.terrain, this.scene, this.structures.M, this.noise, this.quality);
    this.expansion.wind = this.visualWind;
    this.updaters.push(this.expansion);
    this.expColliders = expansionColliders(this.terrain);
    // Serra das Bananeiras: the banana plantations (instanced, streamed).
    if (SERRA) { this.bananas = createBananas(this.terrain, this.quality); this.scene.add(this.bananas.group); this.updaters.push(this.bananas); }
    this.treeHit = makeTreeCollider(this.vegetation);
    this.activity = createFieldActivity(this.scene, this.structures.M, this.terrain);
    // The harrowing tractor on T-08 (audio, older checks).
    const tr = this.activity.units[0];
    // Phase 3: static subtrees are skipped by the per-frame matrix update.
    for (const g of [this.terrainMesh.group, this.roads.group, this.vegetation.group, this.crops.group]) freezeStatic(g);
    this.streaming = new WorldStreaming(this, () => this.streamHints?.());
    this.farm = { root: tr.model.root, pose: (t) => tr.route.pose(tr.s0 + t * tr.K.speed) };
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
    for (const c of this.expColliders) if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && y < c.top) return c.name;
    return this.extraObstacle?.(x, y, z) ?? null;
  }

  // Highest thing within rad of (x, z), absolute metres: the ground and the
  // crop on it (sampled across the disc), trees, buildings and power-line
  // wires. Used to put a recovered aircraft back in the air clear of all of it.
  clearTopAt(x, z, rad) {
    const T = this.terrain;
    let top = -Infinity;
    for (const [dx, dz] of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad], [rad * 0.7, rad * 0.7], [-rad * 0.7, rad * 0.7], [rad * 0.7, -rad * 0.7], [-rad * 0.7, -rad * 0.7]]) {
      top = Math.max(top, T.surfaceTop ? T.surfaceTop(x + dx, z + dz) : T.heightAt(x + dx, z + dz));
    }
    top = Math.max(top, this.treeTopNear(x, z, rad));
    for (const c of this.structures.colliders) if (x > c.x0 - rad && x < c.x1 + rad && z > c.z0 - rad && z < c.z1 + rad) top = Math.max(top, c.top);
    for (const c of this.expColliders) if (x > c.x0 - rad && x < c.x1 + rad && z > c.z0 - rad && z < c.z1 + rad) top = Math.max(top, c.top);
    for (const w of this.structures.wires) {
      const [ax, ay, az] = w.a, [bx, by, bz] = w.b, dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if (Math.hypot(ax + dx * k - x, az + dz * k - z) < rad) top = Math.max(top, ay, by);
    }
    return top;
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
    this.cropPlants.setQuality(q);
    this.grass.setQuality(q);
    this.crowns.setQuality(q);
    for (const u of this.updaters) u.setQuality?.(q);
  }

  update(camera, focus, dt, time) {
    this.atmo.update(dt, camera, this.visualWind, time);
    this.sky.update(camera, focus, dt, time);
    this.terrainMesh.update?.(camera);
    this.streaming.update(camera.position, dt);
    this.cropPlants.update(camera.position, this.terrain.heightAt(camera.position.x, camera.position.z));
    this.crops.update(camera.position);
    this.vegetation.update(camera);
    this.crowns.update(camera, this.terrain.heightAt(camera.position.x, camera.position.z));
    this.grass.update(camera, time);
    for (const u of this.updaters) u.update?.(camera, focus, dt, time);
    this.activity.update(dt, time, camera, this.dust, this.mist);
  }
}

export { THREE };
