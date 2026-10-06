import * as THREE from 'three';
import { LAYER } from '../core/Shared.js';
import { rng, lerp, smoothstep, damp } from '../utils/MathUtils.js';
import { CAMP, PIER } from '../world/Layout.js';
import {
  woodBox, woodCylinder, place, merge, ropeGeometry, buildTable, buildChair, buildCrate, buildLantern, buildRadio,
  buildCompass, buildCamera, buildFlashlight, buildMug, buildNotebook, buildMapSheet, buildBackpack, buildBarrel,
  buildJerryCan, buildRopeCoil, buildCot, buildFirePit, buildSign,
} from './PropFactory.js';
import { GeoBuilder } from '../vegetation/PlantGeometry.js';
import { batchStatic } from '../utils/StaticBatch.js';

const DECK_Y = CAMP.deck.y;

function staticMesh(geo, mat, layer = LAYER.WORLD, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  m.layers.set(layer);
  return m;
}

function setLayer(obj, layer) { obj.traverse((o) => o.layers.set(layer)); }

/** Canvas tarp with sag between rafters; aWind marks the loose regions for the cloth wind shader. */
function buildTarp(x0, x1, z0, z1, yFront, yBack, rafters, sag = 0.14) {
  const nx = 30, nz = 22;
  const b = new GeoBuilder();
  const r = rng(77);
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const u = i / nx, v = j / nz;
      const x = lerp(x0, x1, u), z = lerp(z0, z1, v);
      let y = lerp(yFront, yBack, v);
      // distance to nearest rafter (support lines along z)
      let dr = Infinity;
      for (const rx of rafters) dr = Math.min(dr, Math.abs(x - rx));
      const span = (x1 - x0) / (rafters.length - 1);
      const s = Math.min(1, dr / (span * 0.5));
      const edgeV = Math.min(v, 1 - v) * 2;
      y -= sag * Math.sin(s * Math.PI * 0.5) * (0.5 + 0.5 * Math.min(1, edgeV * 3));
      // overhang edges droop
      const ov = Math.max(0, x0 + 0.35 - x, x - (x1 - 0.35));
      y -= ov * 0.5;
      const front = Math.max(0, 0.12 - v) * 2.5;
      y -= front * 0.6;
      y += Math.sin(x * 9 + z * 3) * 0.006 + (r() - 0.5) * 0.004;
      const loose = Math.max(s * 0.5, ov * 2, front * 3);
      b.v(new THREE.Vector3(x, y, z), new THREE.Vector3(0, 1, 0), u * (x1 - x0) / 1.4, v * (z1 - z0) / 1.4, [1, 1, 1], [0, Math.min(1, loose), u * 3 + v, 0]);
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      b.quad(a, a + nx + 1, a + nx + 2, a + 1);
    }
  }
  const g = b.build();
  g.computeVertexNormals();
  return g;
}

/** Hanging cloth (towel / shirt) on a line. */
function buildHangingCloth(w, h, seed) {
  const b = new GeoBuilder();
  const nx = 6, ny = 8;
  const r = rng(seed);
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const u = i / nx, v = j / ny;
      const x = (u - 0.5) * w;
      const y = -v * h;
      const z = Math.sin(u * 7 + seed) * 0.015 * v + (r() - 0.5) * 0.004;
      b.v(new THREE.Vector3(x, y, z), new THREE.Vector3(0, 0, 1), u, v, [1, 1, 1], [0, v, seed * 0.1 + u * 0.3, 0]);
    }
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; b.quad(a, a + 1, a + nx + 2, a + nx + 1); }
  const g = b.build();
  g.computeVertexNormals();
  return g;
}

export class Camp {
  constructor({ scene, terrainData, materials, collision, interaction }) {
    this.scene = scene;
    this.td = terrainData;
    this.M = materials;
    this.collision = collision;
    this.interaction = interaction;
    this.group = new THREE.Group();
    this.group.name = 'camp';
    scene.add(this.group);
    this.items = {}; // world representations of pickable items
    this.state = { crateOpen: false, lanternLit: false, radioOn: false, fireLit: false, flashOn: false, backpackSearched: false, radioStation: 0 };
    this.time = 0;
    this._buildDeck();
    this._buildShelter();
    this._buildPier();
    this._buildLights();
    this._buildProps();
    this._buildSurroundings();
    // merge everything static into a handful of draw calls
    const keep = this.interaction.items.map((it) => it.object);
    keep.push(this.crate.group, this.pierLantern.group, this.radio.group);
    this.batchInfo = batchStatic(this.group, keep);
  }

  // ------------------------------------------------------------------ structures
  _buildDeck() {
    const { x, z, w, d } = CAMP.deck;
    const td = this.td;
    const planks = [];
    const n = Math.floor(w / 0.152);
    for (let i = 0; i < n; i++) {
      const px = x - w / 2 + 0.076 + i * 0.152;
      // some rows are two shorter boards
      if (i % 5 === 2) {
        const split = 1.4 + (i % 3) * 0.9;
        planks.push(place(woodBox(split - 0.006, 0.035, 0.14, { seed: i * 3 }), px, DECK_Y - 0.0175 + (i % 2) * 0.002, z - d / 2 + split / 2, 0, Math.PI / 2));
        planks.push(place(woodBox(d - split - 0.006, 0.035, 0.14, { seed: i * 3 + 1 }), px, DECK_Y - 0.0175, z - d / 2 + split + (d - split) / 2, 0, Math.PI / 2));
      } else {
        planks.push(place(woodBox(d, 0.035, 0.14, { seed: i * 3 + 2 }), px, DECK_Y - 0.0175 + ((i * 7) % 3) * 0.0012, z, 0, Math.PI / 2, (i % 4 - 1.5) * 0.002));
      }
    }
    // joists
    for (const jz of [z - d / 2 + 0.1, z - d / 6, z + d / 6, z + d / 2 - 0.1]) planks.push(place(woodBox(w + 0.1, 0.14, 0.1, { seed: jz * 10 }), x, DECK_Y - 0.035 - 0.07, jz));
    // support posts
    for (const sx of [-w / 2 + 0.1, -w / 6, w / 6, w / 2 - 0.1]) {
      for (const jz of [z - d / 2 + 0.1, z, z + d / 2 - 0.1]) {
        const gy = td.heightAt(x + sx, jz) - 0.4;
        const top = DECK_Y - 0.035 - 0.14;
        const len = top - gy;
        planks.push(place(woodBox(len, 0.12, 0.12, { seed: sx * 13 + jz }), x + sx, gy + len / 2, jz, 0, 0, Math.PI / 2));
      }
    }
    // front steps
    const stepZ = z - d / 2;
    planks.push(place(woodBox(1.8, 0.035, 0.32, { seed: 900 }), x, DECK_Y - 0.19, stepZ - 0.2));
    planks.push(place(woodBox(1.8, 0.035, 0.32, { seed: 901 }), x, DECK_Y - 0.36, stepZ - 0.55));
    planks.push(place(woodBox(0.5, 0.06, 0.06, { seed: 902 }), x - 0.85, DECK_Y - 0.3, stepZ - 0.35, 0.6, Math.PI / 2));
    planks.push(place(woodBox(0.5, 0.06, 0.06, { seed: 903 }), x + 0.85, DECK_Y - 0.3, stepZ - 0.35, 0.6, Math.PI / 2));
    this.group.add(staticMesh(merge(planks), this.M.wood));
    this.collision.addBox({ x, y: DECK_Y - 0.2, z, hx: w / 2, hy: 0.2, hz: d / 2, walkable: true, surface: 'wood', solid: false });
    this.collision.addBox({ x, y: DECK_Y - 0.19 - 0.1, z: stepZ - 0.2, hx: 0.9, hy: 0.1, hz: 0.16, walkable: true, surface: 'wood', solid: false });
    this.collision.addBox({ x, y: DECK_Y - 0.36 - 0.1, z: stepZ - 0.55, hx: 0.9, hy: 0.1, hz: 0.16, walkable: true, surface: 'wood', solid: false });
  }

  _buildShelter() {
    const M = this.M;
    const parts = [];
    const fy = DECK_Y + 2.35, by = DECK_Y + 1.95;
    const posts = [[-3.45, 1.75, fy], [3.45, 1.75, fy], [-3.45, 6.75, by], [3.45, 6.75, by], [0, 6.75, by]];
    for (const [px, pz, top] of posts) {
      const len = top - DECK_Y + 0.05;
      parts.push(place(woodCylinder(0.075, 0.065, len, { seed: px * 3 + pz, radial: 9 }), px, DECK_Y + len / 2 - 0.02, pz));
      this.collision.addCylinder({ x: px, z: pz, r: 0.09, y0: DECK_Y - 0.5, y1: top, surface: 'wood' });
    }
    // beams
    parts.push(place(woodCylinder(0.06, 0.06, 7.3, { seed: 501, radial: 8 }), 0, fy - 0.02, 1.75, 0, 0, Math.PI / 2));
    parts.push(place(woodCylinder(0.06, 0.06, 7.3, { seed: 502, radial: 8 }), 0, by - 0.02, 6.75, 0, 0, Math.PI / 2));
    // rafters (sloped)
    const rafters = [-3.45, -1.15, 1.15, 3.45];
    for (const rx of rafters) {
      const a = new THREE.Vector3(rx, fy + 0.05, 1.3), bb = new THREE.Vector3(rx, by + 0.05, 7.2);
      const len = a.distanceTo(bb);
      const geo = woodCylinder(0.045, 0.045, len, { seed: rx * 7, radial: 7 });
      const m = new THREE.Matrix4().lookAt(a, bb, new THREE.Vector3(0, 1, 0));
      geo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      geo.applyMatrix4(m);
      geo.translate((a.x + bb.x) / 2, (a.y + bb.y) / 2, (a.z + bb.z) / 2);
      parts.push(geo);
    }
    this.group.add(staticMesh(merge(parts), M.wood));
    // tarp roof
    const tarp = buildTarp(-3.95, 3.95, 1.15, 7.35, fy + 0.13, by + 0.12, rafters, 0.13);
    const tm = staticMesh(tarp, M.canvas);
    this.group.add(tm);
    this.tarp = tm;
    // back wall: hanging tarp
    const wall = new THREE.PlaneGeometry(6.8, 1.6, 12, 6);
    const wp = wall.attributes.position;
    for (let i = 0; i < wp.count; i++) wp.setZ(i, Math.sin(wp.getX(i) * 3) * 0.04 + Math.sin(wp.getY(i) * 4) * 0.02);
    wall.computeVertexNormals();
    const wallMesh = staticMesh(place(wall, 0, DECK_Y + 1.05, 6.86), M.canvasStatic);
    this.group.add(wallMesh);
    this.collision.addBox({ x: 0, y: DECK_Y + 1.0, z: 6.9, hx: 3.5, hy: 1.0, hz: 0.06, surface: 'cloth' });
    // rolled side flap
    const roll = staticMesh(place(new THREE.CylinderGeometry(0.08, 0.08, 4.8, 10), -3.5, fy - 0.25, 4.3, Math.PI / 2, 0, 0), M.canvasStatic);
    this.group.add(roll);
    // guy ropes to stakes
    const ropes = [];
    for (const sx of [-1, 1]) {
      const a = new THREE.Vector3(sx * 3.95, fy + 0.05, 1.18);
      const gx = sx * 5.2, gz = 0.2;
      const bb = new THREE.Vector3(gx, this.td.heightAt(gx, gz) + 0.15, gz);
      ropes.push(ropeGeometry(a, bb, 0.05, 0.008));
      ropes.push(place(woodCylinder(0.025, 0.02, 0.35, { radial: 5 }), gx, bb.y, gz, 0.3 * sx, 0, 0.25 * sx));
    }
    this.group.add(staticMesh(merge(ropes), M.rope));
    this.shelterBox = { x0: -3.95, x1: 3.95, z0: 1.15, z1: 7.35, y0: DECK_Y - 0.1, y1: fy + 0.2 };
  }

  _buildPier() {
    const M = this.M;
    const td = this.td;
    const { x, zStart, zEnd, width, endWidth, endDepth } = PIER;
    const y = 1.14;
    const parts = [];
    const posts = [];
    const r = rng(404);
    let i = 0;
    for (let z = zStart; z > zEnd + endDepth; z -= 0.2) {
      const missing = r() < 0.025;
      if (!missing) parts.push(place(woodBox(width + (r() - 0.5) * 0.06, 0.04, 0.18, { seed: i++ }), x + (r() - 0.5) * 0.03, y - 0.02 + (r() - 0.5) * 0.008, z - 0.1, 0, (r() - 0.5) * 0.03, (r() - 0.5) * 0.02));
    }
    // end platform
    for (let z = zEnd + endDepth; z > zEnd; z -= 0.2) parts.push(place(woodBox(endWidth + (r() - 0.5) * 0.05, 0.04, 0.18, { seed: i++ }), x, y - 0.02, z - 0.1, 0, (r() - 0.5) * 0.02));
    // stringers
    const len = zStart - (zEnd + endDepth);
    for (const sx of [-width / 2 + 0.12, 0, width / 2 - 0.12]) parts.push(place(woodBox(len, 0.12, 0.08, { seed: sx * 9 + 3 }), x + sx, y - 0.1, (zStart + zEnd + endDepth) / 2, 0, Math.PI / 2));
    for (const sx of [-endWidth / 2 + 0.12, -0.7, 0.7, endWidth / 2 - 0.12]) parts.push(place(woodBox(endDepth, 0.12, 0.08, { seed: sx * 5 }), x + sx, y - 0.1, zEnd + endDepth / 2, 0, Math.PI / 2));
    // posts
    const postAt = (px, pz, above = 0) => {
      const gy = td.heightAt(px, pz) - 0.6;
      const top = y - 0.04 + above;
      const l = top - gy;
      posts.push(place(woodCylinder(0.11, 0.1, l, { seed: px * 11 + pz, radial: 9 }), px, gy + l / 2, pz));
      if (above > 0) this.collision.addCylinder({ x: px, z: pz, r: 0.14, y0: y - 0.2, y1: top, surface: 'wood' });
    };
    let k = 0;
    for (let z = zStart - 1.2; z > zEnd + endDepth; z -= 2.6) {
      const tall = k % 4 === 0 ? 0.55 : 0;
      postAt(x - width / 2 - 0.05, z, tall);
      postAt(x + width / 2 + 0.05, z, tall);
      // cross brace below deck
      const gyL = td.heightAt(x - width / 2, z);
      posts.push(place(woodBox(Math.hypot(width, (y - 0.3) - (gyL + 0.2)), 0.05, 0.12, { seed: z * 3 }), x, (y - 0.3 + gyL + 0.2) / 2, z, 0, 0, Math.atan2((y - 0.3) - (gyL + 0.2), width) * (k % 2 ? 1 : -1)));
      k++;
    }
    for (const [px, pz] of [[x - endWidth / 2, zEnd + 0.1], [x + endWidth / 2, zEnd + 0.1], [x - endWidth / 2, zEnd + endDepth], [x + endWidth / 2, zEnd + endDepth]]) postAt(px, pz, 0.7);
    this.group.add(staticMesh(merge(parts), M.wood));
    this.group.add(staticMesh(merge(posts), M.woodDark));
    // ladder at the end
    const lad = [];
    for (const sx of [-0.22, 0.22]) lad.push(place(woodBox(2.2, 0.06, 0.06, { seed: sx * 7 }), x - 0.9 + sx, y - 1.0, zEnd - 0.05, 0, 0, Math.PI / 2));
    for (let s = 0; s < 6; s++) lad.push(place(woodBox(0.5, 0.04, 0.05, { seed: s + 40 }), x - 0.9, y - 0.15 - s * 0.35, zEnd - 0.05));
    this.group.add(staticMesh(merge(lad), M.woodDark));
    // lamp post at the end
    const lamp = new THREE.Group();
    lamp.add(staticMesh(place(woodCylinder(0.07, 0.06, 2.4, { radial: 8 }), 0, 1.2, 0), M.woodDark));
    lamp.add(staticMesh(place(woodBox(0.6, 0.06, 0.06, { seed: 7 }), 0.27, 2.32, 0), M.woodDark));
    const pl = buildLantern(M);
    pl.group.position.set(0.5, 1.98, 0);
    lamp.add(pl.group);
    lamp.position.set(x + endWidth / 2 - 0.2, y, zEnd + 0.2);
    this.group.add(lamp);
    this.pierLantern = pl;
    this.collision.addCylinder({ x: lamp.position.x, z: lamp.position.z, r: 0.1, y0: y - 0.2, y1: y + 2.4, surface: 'wood' });
    // collision: walkable pier deck
    this.collision.addBox({ x, y: y - 0.15, z: (zStart + zEnd + endDepth) / 2, hx: width / 2 + 0.05, hy: 0.15, hz: len / 2, walkable: true, surface: 'wood', solid: false });
    this.collision.addBox({ x, y: y - 0.15, z: zEnd + endDepth / 2, hx: endWidth / 2, hy: 0.15, hz: endDepth / 2, walkable: true, surface: 'wood', solid: false });
    this.pierY = y;
    // bollard ropes (mooring) handled by the boat
    this.mooring = new THREE.Vector3(x + endWidth / 2 - 0.05, y + 0.6, zEnd + endDepth - 0.05);
  }

  _buildLights() {
    // fixed light set (intensity animated, never toggled) to avoid shader recompiles
    this.lanternLight = new THREE.PointLight(0xffb36b, 0, 9, 1.8);
    this.lanternLight.layers.enableAll();
    this.fireLight = new THREE.PointLight(0xff8a3c, 0, 14, 1.6);
    this.fireLight.layers.enableAll();
    this.fireLight.castShadow = false;
    this.fireLight.shadow.mapSize.set(512, 512);
    this.fireLight.shadow.camera.near = 0.2;
    this.fireLight.shadow.camera.far = 12;
    this.fireLight.shadow.bias = -0.002;
    this.flashlight = new THREE.SpotLight(0xfff1dc, 0, 32, 0.38, 0.45, 1.5);
    this.flashlight.layers.enableAll();
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(512, 512);
    this.flashlight.shadow.camera.near = 0.2;
    this.flashlight.shadow.camera.far = 30;
    this.flashlight.shadow.bias = -0.0015;
    this.scene.add(this.fireLight, this.flashlight, this.flashlight.target);
  }

  _addItem(id, built, pos, rotY = 0) {
    const g = built.group;
    g.position.copy(pos);
    g.rotation.y = rotY;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = o.castShadow !== false; o.receiveShadow = true; } });
    setLayer(g, LAYER.DETAIL);
    this.group.add(g);
    this.items[id] = { ...built, group: g, home: pos.clone(), homeRot: rotY };
    return g;
  }

  _buildProps() {
    const M = this.M;
    const I = this.interaction;
    const top = DECK_Y;
    const v = (x, y, z) => new THREE.Vector3(x, y, z);

    // table + chair
    const table = buildTable(M);
    table.position.set(1.75, top, 5.25);
    setLayer(table, LAYER.DETAIL);
    this.group.add(table);
    const tableTop = top + table.userData.top;
    this.tableTop = tableTop;
    this.collision.addBox({ x: 1.75, y: top + 0.38, z: 5.25, hx: 0.8, hy: 0.38, hz: 0.41, surface: 'wood' });
    const chair = buildChair(M);
    chair.position.set(1.65, top, 4.3);
    chair.rotation.y = Math.PI + 0.15;
    setLayer(chair, LAYER.DETAIL);
    this.group.add(chair);
    this.collision.addBox({ x: 1.65, y: top + 0.4, z: 4.3, hx: 0.25, hy: 0.4, hz: 0.25, surface: 'cloth' });

    // items on the table
    this._addItem('lantern', buildLantern(M), v(2.42, tableTop, 5.5), 0.4);
    this._addItem('compass', buildCompass(M), v(1.08, tableTop, 4.98), 0.3);
    this._addItem('notebook', buildNotebook(M), v(1.08, tableTop, 5.42), 0.25);
    this._addItem('mug', buildMug(M), v(2.3, tableTop, 4.98), 1.2);
    this._addItem('camera', buildCamera(M), v(1.98, tableTop, 4.97), -0.35);
    this.mapTexture = this._drawMapTexture();
    this._addItem('map', buildMapSheet(this.mapTexture), v(1.62, tableTop, 5.32), 0.06);

    // radio on a small crate
    const small = buildCrate(M, 0.46, 0.38, 0.38, 77);
    small.group.position.set(3.05, top, 5.95);
    small.group.rotation.y = -0.2;
    setLayer(small.group, LAYER.DETAIL);
    this.group.add(small.group);
    this.collision.addBox({ x: 3.05, y: top + 0.19, z: 5.95, hx: 0.24, hy: 0.19, hz: 0.2, yaw: -0.2, surface: 'wood' });
    const radio = buildRadio(M);
    radio.group.position.set(3.05, top + 0.38, 5.95);
    radio.group.rotation.y = -0.45;
    setLayer(radio.group, LAYER.DETAIL);
    this.group.add(radio.group);
    this.radio = radio;

    // storage crate with hinged lid
    const crate = buildCrate(M, 0.92, 0.56, 0.56, 5);
    crate.group.position.set(-2.55, top, 6.15);
    crate.group.rotation.y = 0.04;
    setLayer(crate.group, LAYER.DETAIL);
    this.group.add(crate.group);
    this.crate = crate;
    this.crateAngle = 0;
    this.crateVel = 0;
    this.collision.addBox({ x: -2.55, y: top + 0.28, z: 6.15, hx: 0.46, hy: 0.28, hz: 0.28, yaw: 0.04, surface: 'wood' });
    // contents
    const coil = buildRopeCoil(M, 0.14, 5);
    coil.position.set(0.2, 0.025, 0.02);
    crate.group.add(coil);
    setLayer(coil, LAYER.DETAIL);
    const fl = buildFlashlight(M);
    const flPos = v(-2.75, top + 0.03, 6.13);
    this._addItem('flashlight', fl, flPos, Math.PI / 2 + 0.2);
    this.items.flashlight.group.visible = true;

    // backpack, cot, jerry can, rope
    const pack = buildBackpack(M);
    pack.group.position.set(-3.0, top, 4.35);
    pack.group.rotation.y = Math.PI / 2 - 0.3;
    pack.group.rotation.z = 0.12;
    setLayer(pack.group, LAYER.DETAIL);
    this.group.add(pack.group);
    this.backpack = pack;
    const cot = buildCot(M);
    cot.position.set(-0.45, top, 6.15);
    setLayer(cot, LAYER.DETAIL);
    this.group.add(cot);
    this.cot = cot;
    this.collision.addBox({ x: -0.45, y: top + 0.25, z: 6.15, hx: 0.95, hy: 0.25, hz: 0.36, surface: 'cloth' });
    const can = buildJerryCan(M);
    can.position.set(-3.15, top, 2.05);
    can.rotation.y = 0.5;
    setLayer(can, LAYER.DETAIL);
    this.group.add(can);
    const rope = buildRopeCoil(M, 0.22, 7);
    rope.position.set(3.0, top, 2.1);
    setLayer(rope, LAYER.DETAIL);
    this.group.add(rope);

    // ---------------------------------------------------------------- interactables
    const it = (object, opts) => I.add({ object, ...opts });
    this.crateIt = it(crate.group, {
      name: 'crate',
      interactionLabel: () => (this.state.crateOpen ? 'Close' : 'Open'),
      onInteract: (game) => {
        this.state.crateOpen = !this.state.crateOpen;
        game.audio?.play(this.state.crateOpen ? 'creakOpen' : 'creakClose', { position: crate.group.position });
        game.rig?.play('reach', { target: crate.group.position.clone().add(new THREE.Vector3(0, 0.6, 0.25)), duration: 0.55 });
      },
    });
    const flIt = it(this.items.flashlight.group, {
      name: 'flashlight', interactionLabel: 'Take', interactionDistance: 2.2,
      onInteract: (game) => game.pickUp('flashlight'),
    });
    this.items.flashlight.interactable = flIt;
    this.items.lantern.interactable = it(this.items.lantern.group, {
      name: 'lantern', interactionLabel: 'Take',
      secondaryLabel: () => (this.state.lanternLit ? 'Snuff' : 'Light'),
      onInteract: (game) => game.pickUp('lantern'),
      onSecondary: (game) => { this.state.lanternLit = !this.state.lanternLit; game.audio?.play(this.state.lanternLit ? 'ignite' : 'snuff', { position: this.items.lantern.group.position }); game.rig?.play('reach', { target: this.items.lantern.group.getWorldPosition(new THREE.Vector3()), duration: 0.45 }); },
    });
    this.items.compass.interactable = it(this.items.compass.group, { name: 'compass', interactionLabel: 'Take', onInteract: (game) => game.pickUp('compass') });
    this.items.camera.interactable = it(this.items.camera.group, { name: 'camera', interactionLabel: 'Take', onInteract: (game) => game.pickUp('camera') });
    this.items.mug.interactable = it(this.items.mug.group, {
      name: 'mug', interactionLabel: 'Take', secondaryLabel: 'Drink',
      onInteract: (game) => game.pickUp('mug'),
      onSecondary: (game) => { game.rig?.play('reach', { target: this.items.mug.group.position.clone(), duration: 0.45 }); game.toast('Cold coffee. Strong enough to strip paint.'); },
    });
    this.items.notebook.interactable = it(this.items.notebook.group, {
      name: 'notebook', interactionLabel: 'Read', secondaryLabel: 'Take',
      onInteract: (game) => game.ui.openNotebook(),
      onSecondary: (game) => game.pickUp('notebook'),
    });
    this.items.map.interactable = it(this.items.map.group, {
      name: 'map', interactionLabel: 'Study', secondaryLabel: 'Take',
      onInteract: (game) => game.inspectMap(this.items.map.group),
      onSecondary: (game) => game.pickUp('map'),
    });
    it(radio.group, {
      name: 'radio',
      interactionLabel: () => (this.state.radioOn ? 'Turn off' : 'Turn on'),
      secondaryLabel: () => (this.state.radioOn ? 'Tune' : null),
      onInteract: (game) => { this.state.radioOn = !this.state.radioOn; game.audio?.setRadio(this.state.radioOn, this.state.radioStation, radio.group.position); game.audio?.play('click', { position: radio.group.position }); game.rig?.play('reach', { target: radio.group.position.clone().add(new THREE.Vector3(0, 0.1, 0)), duration: 0.45 }); },
      onSecondary: (game) => { this.state.radioStation = (this.state.radioStation + 1) % 3; game.audio?.setRadio(true, this.state.radioStation, radio.group.position, true); game.rig?.play('reach', { target: radio.group.position.clone().add(new THREE.Vector3(0, 0.1, 0)), duration: 0.45 }); },
    });
    it(pack.group, {
      name: 'backpack',
      interactionLabel: () => (this.state.backpackSearched ? 'Search (empty)' : 'Search'),
      onInteract: (game) => {
        game.rig?.play('grab', { target: pack.group.position.clone().add(new THREE.Vector3(0, 0.4, 0)), duration: 0.7 });
        game.audio?.play('cloth', { position: pack.group.position });
        if (!this.state.backpackSearched) {
          this.state.backpackSearched = true;
          game.inventory.add('binoculars');
          game.toast('Found binoculars. Hold right mouse to look through them.');
        } else game.toast('Spare socks and a half-eaten ration bar.');
      },
    });
    it(cot, {
      name: 'cot', interactionLabel: 'Rest until…',
      onInteract: (game) => game.rest(),
    });
  }

  _buildSurroundings() {
    const M = this.M;
    const td = this.td;
    const ground = (x, z) => td.heightAt(x, z);
    // fire pit
    const fp = buildFirePit(M);
    const fx = -3.2, fz = -2.8;
    fp.group.position.set(fx, ground(fx, fz) - 0.02, fz);
    setLayer(fp.group, LAYER.DETAIL);
    this.group.add(fp.group);
    this.firePit = fp;
    this.firePos = new THREE.Vector3(fx, ground(fx, fz) + 0.35, fz);
    this.fireLight.position.copy(this.firePos).add(new THREE.Vector3(0, 0.4, 0));
    this.interaction.add({
      object: fp.group, name: 'fire',
      interactionLabel: () => (this.state.fireLit ? 'Put out the fire' : 'Light the fire'),
      onInteract: (game) => {
        this.state.fireLit = !this.state.fireLit;
        game.audio?.play(this.state.fireLit ? 'ignite' : 'snuff', { position: this.firePos });
        game.audio?.setFire(this.state.fireLit, this.firePos);
        game.rig?.play('reach', { target: this.firePos, duration: 0.6 });
      },
    });
    // log benches
    const logs = [];
    logs.push(place(woodCylinder(0.2, 0.19, 1.8, { seed: 1, radial: 10 }), fx - 1.9, ground(fx - 1.9, fz + 0.6) + 0.16, fz + 0.6, 0, 0.3, Math.PI / 2));
    logs.push(place(woodCylinder(0.18, 0.17, 1.6, { seed: 2, radial: 10 }), fx + 0.4, ground(fx + 0.4, fz - 2.0) + 0.14, fz - 2.0, 0, -0.2, Math.PI / 2));
    this.group.add(staticMesh(merge(logs), M.woodDark, LAYER.DETAIL));
    this.collision.addBox({ x: fx - 1.9, y: ground(fx - 1.9, fz + 0.6) + 0.16, z: fz + 0.6, hx: 0.9, hy: 0.2, hz: 0.2, yaw: 0.3, walkable: true, surface: 'wood' });
    this.collision.addBox({ x: fx + 0.4, y: ground(fx + 0.4, fz - 2.0) + 0.14, z: fz - 2.0, hx: 0.8, hy: 0.18, hz: 0.18, yaw: -0.2, walkable: true, surface: 'wood' });

    // barrels
    for (const [bx, bz, lying, rot] of [[4.7, 2.2, false, 0.2], [5.35, 3.15, false, 1.1], [5.1, 4.55, true, 0.7]]) {
      const b = buildBarrel(M, lying);
      b.position.set(bx, ground(bx, bz) - 0.03, bz);
      b.rotation.y = rot;
      setLayer(b, LAYER.DETAIL);
      this.group.add(b);
      if (lying) this.collision.addBox({ x: bx, y: ground(bx, bz) + 0.29, z: bz, hx: 0.44, hy: 0.29, hz: 0.29, yaw: rot, surface: 'metal' });
      else this.collision.addCylinder({ x: bx, z: bz, r: 0.3, y0: ground(bx, bz) - 0.5, y1: ground(bx, bz) + 0.88, surface: 'metal' });
    }
    // old crates near the pier start
    const crates = [];
    const cps = [[5.4, -4.3, 0.2, 0], [5.55, -3.6, -0.1, 0], [5.45, -3.95, 0.5, 0.58]];
    cps.forEach(([cx, cz, rot, dy], k) => {
      const c = buildCrate(M, 0.7, 0.55, 0.55, 300 + k);
      c.group.position.set(cx, ground(cx, cz) + dy - 0.02, cz);
      c.group.rotation.y = rot;
      setLayer(c.group, LAYER.DETAIL);
      this.group.add(c.group);
      crates.push(c);
    });
    this.collision.addBox({ x: 5.5, y: ground(5.5, -3.95) + 0.5, z: -3.95, hx: 0.4, hy: 0.6, hz: 0.75, surface: 'wood' });

    // clothesline between the back right post and a palm
    const a = new THREE.Vector3(3.45, DECK_Y + 1.8, 6.75), b = new THREE.Vector3(5.45, DECK_Y + 2.0, 7.55);
    this.group.add(staticMesh(ropeGeometry(a, b, 0.12, 0.006), M.rope, LAYER.DETAIL, false));
    const towel = staticMesh(buildHangingCloth(0.5, 0.75, 3), M.cloth, LAYER.DETAIL);
    const mid = new THREE.Vector3().lerpVectors(a, b, 0.38);
    towel.position.set(mid.x, mid.y - 0.1, mid.z);
    towel.lookAt(towel.position.clone().add(new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x)));
    this.group.add(towel);
    const shirt = staticMesh(buildHangingCloth(0.55, 0.62, 7), M.canvas, LAYER.DETAIL);
    const mid2 = new THREE.Vector3().lerpVectors(a, b, 0.72);
    shirt.position.set(mid2.x, mid2.y - 0.1, mid2.z);
    shirt.quaternion.copy(towel.quaternion);
    this.group.add(shirt);

    // sign at the trailhead
    const sign = buildSign(M, 'FALLS  ↑\nLOOKOUT  →');
    sign.position.set(3.6, ground(3.6, 12.2), 12.2);
    sign.rotation.y = Math.PI + 0.25;
    setLayer(sign, LAYER.DETAIL);
    this.group.add(sign);
    this.collision.addCylinder({ x: 3.6, z: 12.2, r: 0.08, y0: ground(3.6, 12.2) - 1, y1: ground(3.6, 12.2) + 1.6, surface: 'wood' });
    this.interaction.add({ object: sign, name: 'sign', interactionLabel: 'Read', onInteract: (game) => game.toast('Hand-painted: the falls are up the valley path, the lookout along the eastern ridge.') });
  }

  _drawMapTexture() {
    const W = 1024, H = 768;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const td = this.td;
    // paper
    ctx.fillStyle = '#eadfc4';
    ctx.fillRect(0, 0, W, H);
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const x0 = -470, x1 = 470, z0 = -380, z1 = 470;
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const wx = lerp(x0, x1, px / W), wz = lerp(z0, z1, py / H);
        const h = td.heightAt(wx, wz);
        const i = (py * W + px) * 4;
        let r = 234, g = 223, b = 196;
        if (h < 0) {
          const depth = -h;
          const t = Math.min(1, depth / 14);
          r = lerp(170, 120, t); g = lerp(210, 160, t); b = lerp(205, 175, t);
        } else {
          const t = Math.min(1, h / 120);
          r = lerp(214, 160, t); g = lerp(206, 150, t); b = lerp(160, 120, t);
          if (h < 2.2) { r = 232; g = 214; b = 170; }
        }
        // contour lines
        if (h > 0 && Math.floor(h / 10) !== Math.floor(td.heightAt(wx + 1.0, wz) / 10)) { r *= 0.72; g *= 0.68; b *= 0.62; }
        const n = (Math.sin(px * 0.31) * Math.cos(py * 0.27) + Math.sin(px * 0.05 + py * 0.07)) * 3;
        d[i] = r + n; d[i + 1] = g + n; d[i + 2] = b + n; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const toPx = (x, z) => [((x - x0) / (x1 - x0)) * W, ((z - z0) / (z1 - z0)) * H];
    // coastline ink
    ctx.strokeStyle = 'rgba(60,45,30,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    td.coastPoly.forEach(([x, z], i) => { const [px, py] = toPx(x, z); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
    ctx.closePath();
    ctx.stroke();
    // reef
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = 'rgba(70,90,100,0.8)';
    ctx.beginPath();
    td.reefLine.forEach(([x, z], i) => { const [px, py] = toPx(x, z); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
    ctx.stroke();
    // paths
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(120,40,30,0.85)';
    ctx.lineWidth = 2;
    for (const p of td.pathLines) {
      ctx.beginPath();
      p.pts.forEach(([x, z], i) => { const [px, py] = toPx(x, z); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // labels
    ctx.fillStyle = 'rgba(50,38,28,0.9)';
    ctx.font = 'italic 22px Georgia';
    const label = (t, x, z, size = 22) => { ctx.font = `italic ${size}px Georgia`; const [px, py] = toPx(x, z); ctx.fillText(t, px, py); };
    label('the lagoon', -120, -170, 28);
    label('reef', -330, -290, 20);
    label('channel', 80, -372, 18);
    label('islet', 150, -225, 18);
    label('falls', -95, 185, 20);
    label('lookout', 200, -60, 18);
    label('camp ×', -12, 22, 20);
    label('pier', 14, -52, 16);
    label('driftwood pt.', -330, -15, 16);
    ctx.font = '26px Georgia';
    ctx.fillText('SURVEY CHART — LAGOON STATION', 40, 50);
    // compass rose
    ctx.save();
    ctx.translate(W - 90, 90);
    ctx.strokeStyle = 'rgba(60,45,30,0.9)';
    ctx.beginPath(); ctx.moveTo(0, -50); ctx.lineTo(10, 0); ctx.lineTo(0, 50); ctx.lineTo(-10, 0); ctx.closePath(); ctx.stroke();
    ctx.font = 'bold 18px Georgia'; ctx.textAlign = 'center'; ctx.fillText('N', 0, -58);
    ctx.restore();
    // stains + folds
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(150,110,60,${0.04 + Math.random() * 0.05})`;
      ctx.beginPath(); ctx.arc(Math.random() * W, Math.random() * H, 30 + Math.random() * 70, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.mapCanvas = c;
    this.mapBounds = { x0, x1, z0, z1 };
    return tex;
  }

  /** Per-frame animation: crate lid spring, lights, flame flicker, fire. */
  update(dt, game) {
    this.time += dt;
    // crate lid: damped spring towards the target angle around its hinge
    const target = this.state.crateOpen ? -1.95 : 0;
    const k = 60, c = 9;
    const acc = (target - this.crateAngle) * k - this.crateVel * c;
    this.crateVel += acc * dt;
    this.crateAngle += this.crateVel * dt;
    if (!this.state.crateOpen && this.crateAngle > 0) { this.crateAngle = 0; this.crateVel = -this.crateVel * 0.25; }
    this.crate.pivot.rotation.x = this.crateAngle;
    if (this.items.flashlight.interactable) this.items.flashlight.interactable.enabled = this.state.crateOpen && !game.inventory.has('flashlight');

    const flick = 0.85 + Math.sin(this.time * 17) * 0.06 + Math.sin(this.time * 31 + 1.3) * 0.05 + Math.sin(this.time * 7.3) * 0.04;
    // lantern
    const lan = this.items.lantern;
    const lit = this.state.lanternLit;
    this.lanternLight.intensity = damp(this.lanternLight.intensity, lit ? 2.6 * flick : 0, 12, dt);
    lan.flame.visible = lit;
    if (lit) lan.flame.scale.set(1, 0.85 + flick * 0.25, 1);
    if (game.inventory?.equipped !== 'lantern') {
      lan.group.updateWorldMatrix(true, false);
      this.lanternLight.position.setFromMatrixPosition(lan.group.matrixWorld).add(new THREE.Vector3(0, 0.16, 0));
      if (this.lanternLight.parent !== this.scene) this.scene.add(this.lanternLight);
    }
    // pier lamp glows at night
    const night = game.timeOfDay.night;
    this.pierLantern.flame.visible = night > 0.4;
    // fire
    const fire = this.state.fireLit;
    const ff = 0.8 + Math.sin(this.time * 11) * 0.12 + Math.sin(this.time * 23 + 2) * 0.08 + Math.sin(this.time * 3.1) * 0.06;
    this.fireLight.intensity = damp(this.fireLight.intensity, fire ? 9 * ff : 0, 3, dt);
    this.firePit.embers.material.emissiveIntensity = damp(this.firePit.embers.material.emissiveIntensity, fire ? 2.5 * ff : (this.fireLight.intensity > 0.1 ? 0.6 : 0), 2, dt);
    // radio LED
    this.radio.led.material.color.setRGB(this.state.radioOn ? 3 : 0.2, this.state.radioOn ? 0.6 : 0.05, 0.02);
  }
}
