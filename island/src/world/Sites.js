import * as THREE from 'three';
import { buildCrate, buildBarrel, buildFirePit, buildJerryCan, buildRopeCoil, woodBox, woodCylinder, place, merge, ropeGeometry } from '../environment/PropFactory.js';
import { PADS } from './Archipelago.js';
import {
  SiteBuilder, siteMaterials, buildDock, buildHut, buildMast, buildContainer, buildTank, buildSolarPanel, buildTerminal,
  buildPowerBox, stonePillar, stoneBlock, buildCave, buildPontoon, box, cylY, rod, corrugated, makeLed, makeScreen, LED,
} from './SiteKit.js';
import { rng } from '../utils/MathUtils.js';
import { LAYER } from '../core/Shared.js';

const padLevel = (id) => PADS.find((p) => p.id === id).level;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * The man-made places of the archipelago: the ridge radio station on the main island,
 * the Forgotten Outpost, Smuggler's Cove, Relic Island's ruins and cave, Airstrip Island,
 * plus the harbour ledger on the camp pier. Builds geometry and colliders and exposes
 * named anchors (positions, live meshes) that the gameplay layer hooks interactions to.
 * Detailed content switches off with distance; masts stay visible as landmarks.
 */
export class Sites {
  constructor({ scene, terrainData, materials, collision, rocksMaterial, ocean }) {
    this.td = terrainData;
    this.collision = collision;
    this.ocean = ocean;
    this.M = siteMaterials(materials);
    this.PM = materials;
    this.rockMat = rocksMaterial;
    this.root = new THREE.Group();
    this.root.name = 'sites';
    scene.add(this.root);
    this.anchors = {};
    this.sites = [];
    this.lights = []; // { mesh, mode } beacons that blink
    this.buoys = [];

    this._station();
    this._outpost();
    this._cove();
    this._relic();
    this._airstrip();
    this._mainIsland();
    this._offshore();
  }

  _site(id, x, z, yaw, { level = null, activation = 650 } = {}) {
    const y = level ?? this.td.heightAt(x, z);
    const b = new SiteBuilder({ id, x, y, z, yaw, collision: this.collision, parent: this.root, M: this.M, terrain: this.td });
    b.activation = activation;
    this.sites.push(b);
    return b;
  }

  _done(b) {
    b.finish();
    Object.assign(this.anchors, Object.fromEntries(Object.entries(b.anchors).map(([k, v]) => [`${b.id}.${k}`, v])));
  }

  /** Crate prop (decorative) in local space. */
  _crate(b, lx, lz, { yaw = 0, y = null, w = 0.9, h = 0.56, d = 0.56, seed = 5, collide = true } = {}) {
    const c = buildCrate(this.PM, w, h, d, seed);
    const gy = y ?? b.groundLocal(lx, lz);
    b.mesh(c.group, lx, gy, lz, yaw);
    if (collide) b.box(lx, gy + h / 2, lz, w / 2, h / 2, d / 2, { yaw, walkable: true });
    return c;
  }

  _barrel(b, lx, lz, { lying = false, yaw = 0, y = null } = {}) {
    const g = buildBarrel(this.PM, lying);
    const gy = y ?? b.groundLocal(lx, lz);
    b.mesh(g, lx, gy, lz, yaw);
    if (lying) b.box(lx, gy + 0.29, lz, 0.44, 0.29, 0.29, { yaw, surface: 'metal' });
    else b.cyl(lx, lz, 0.3, gy, gy + 0.88, 'metal');
  }

  _cable(b, a, c, sag = 0.4) { b.geo(ropeGeometry(a, c, sag, 0.012, 12), this.PM.metalBlack, { cast: false }); }

  // ================================================================ ridge radio station
  _station() {
    const pad = PADS.find((p) => p.id === 'station');
    // local +z faces the path coming up from the overlook
    const b = this._site('station', pad.x, pad.z, -2.48, { level: padLevel('station') });
    const hut = buildHut(b, { x: 0, z: 0.6, yaw: 0, w: 4.4, d: 3.4, h: 2.45, door: { side: 'front', at: -1.0, width: 0.95 }, windows: [{ side: 'front', at: 1.1, width: 1.0 }, { side: 'left', at: 0.3, width: 0.9 }, { side: 'back', at: -0.6, width: 0.8, broken: true }], seed: 11, doorOpen: 1.35 });
    const fh = hut.floorH;
    // terminal against the back wall, facing the door
    const term = buildTerminal(b, { x: 0.55, z: -0.35, y: fh, yaw: 0 });
    b.anchor('terminal', 0.55, fh + 1.0, 0.1, { screen: term.screen, leds: term.leds, yaw: 0 });
    b.anchor('logbook', 1.05, fh + 0.8, 0.0);
    const logbook = new THREE.Mesh(merge([box(0.26, 0.035, 0.34, 0, 0.0175, 0), box(0.24, 0.006, 0.32, 0.01, 0.038, 0)]), this.PM.leather);
    b.mesh(logbook, 1.05, fh + 0.785, 0.02, 0.25);
    this.anchors['station.logbookMesh'] = logbook;
    // chair, shelves, a radio set, a coffee can
    const chair = merge([box(0.45, 0.04, 0.45, 0, 0.46, 0), box(0.45, 0.5, 0.04, 0, 0.72, -0.2), box(0.04, 0.46, 0.04, -0.2, 0.23, -0.2), box(0.04, 0.46, 0.04, 0.2, 0.23, -0.2), box(0.04, 0.46, 0.04, -0.2, 0.23, 0.2), box(0.04, 0.46, 0.04, 0.2, 0.23, 0.2)]);
    b.geo(place(chair, 0.4, fh, 0.55, 0, Math.PI + 0.3), this.M.woodDark);
    b.geo(place(merge([box(1.2, 0.03, 0.35, 0, 0.9, 0), box(1.2, 0.03, 0.35, 0, 1.4, 0), box(0.03, 1.5, 0.35, -0.6, 0.75, 0), box(0.03, 1.5, 0.35, 0.6, 0.75, 0)]), -1.45, fh, -1.2), this.M.woodDark);
    b.box(-1.45, fh + 0.75, -1.2, 0.62, 0.75, 0.2);
    for (let i = 0; i < 4; i++) b.geo(place(box(0.22, 0.28, 0.2, 0, 0, 0), -1.85 + i * 0.27, fh + 1.06, -1.2), i % 2 ? this.M.cabinet : this.M.olive);
    // power distribution box outside, by the corner
    const pb = buildPowerBox(b, { x: -3.0, z: 1.9, y: b.groundLocal(-3.0, 1.9), yaw: 0.3 });
    b.anchor('powerBox', -3.0, b.groundLocal(-3.0, 1.9) + 1.25, 1.95, { leds: pb.leds });
    // conduit from the box into the hut and from the mast
    const g0 = b.groundLocal(-3, 1.9);
    this._cable(b, V(-3.0, g0 + 1.2, 1.75), V(-2.2, fh + 2.0, 1.2), 0.3);
    // the mast behind the hut
    const mg = b.groundLocal(2.4, -5.2);
    const mast = buildMast(b, { x: 2.4, z: -5.2, y: mg, height: 18, base: 1.05, top: 0.42, seed: 3 });
    b.anchor('mast', 2.4, mg + 1, -5.2, { light: mast.light });
    this._cable(b, V(2.4, mg + 2.2, -5.0), V(1.4, fh + 2.2, -1.1), 0.6);
    // status light over the door
    const lamp = makeLed(LED.off, 0.04);
    b.mesh(lamp, -1.0, fh + 2.2, 2.4);
    b.anchor('doorLamp', -1.0, fh + 2.2, 2.4, { led: lamp });
    // generator crate and fuel
    this._crate(b, -3.4, -0.6, { yaw: 0.2, w: 1.1, h: 0.7, d: 0.7, seed: 31 });
    this._barrel(b, -3.6, -1.7, {});
    this._barrel(b, 3.3, 1.8, { lying: true, yaw: 0.9 });
    const sign = makeScreen(0.8, 0.3, 256);
    sign.draw((g, W, H) => { g.fillStyle = '#8b7a5a'; g.fillRect(0, 0, W, H); g.fillStyle = '#20180f'; g.font = 'bold 34px Georgia'; g.textAlign = 'center'; g.fillText('RIDGE STATION', W / 2, H / 2 + 6); g.font = '18px Georgia'; g.fillText('island net · node 0', W / 2, H / 2 + 34); });
    sign.mesh.material = new THREE.MeshStandardMaterial({ map: sign.mesh.material.map, roughness: 0.9 });
    b.mesh(sign.mesh, 1.2, fh + 2.05, 2.36);
    this._done(b);
  }

  // ================================================================ the forgotten outpost
  _outpost() {
    const pad = PADS.find((p) => p.id === 'outpostHut');
    const b = this._site('outpost', pad.x, pad.z, 1.03, { level: padLevel('outpostHut') });
    const hut = buildHut(b, { x: 0, z: 0, yaw: 0, w: 4.0, d: 3.4, h: 2.4, door: { side: 'front', at: 0.9, width: 0.95 }, windows: [{ side: 'left', at: 0, width: 0.9, broken: true }, { side: 'back', at: 0.6, width: 0.8 }], seed: 23, doorOpen: 0.7 });
    const fh = hut.floorH;
    const term = buildTerminal(b, { x: -0.6, z: -1.05, y: fh, yaw: 0 });
    b.anchor('terminal', -0.6, fh + 1.0, -0.6, { screen: term.screen, leds: term.leds });
    b.anchor('log', -1.15, fh + 0.8, -1.05);
    const log = new THREE.Mesh(merge([box(0.24, 0.03, 0.32, 0, 0.015, 0), box(0.22, 0.005, 0.3, 0, 0.033, 0)]), this.PM.paper);
    b.mesh(log, -1.2, fh + 0.785, -0.95, -0.3);
    this.anchors['outpost.logMesh'] = log;
    // a rug over the trapdoor, and the trapdoor itself (live: it lifts)
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), this.PM.cloth);
    rug.rotation.x = -Math.PI / 2;
    b.mesh(rug, 0.7, fh + 0.012, 0.35);
    rug.castShadow = false;
    const hatchPivot = new THREE.Group();
    const hatch = new THREE.Mesh(merge([woodBox(0.8, 0.04, 0.7, { seed: 61 }), place(box(0.12, 0.02, 0.03, 0, 0, 0), 0, 0.03, 0.25)]), this.M.woodDark);
    hatch.position.set(0.4, 0.02, 0.35);
    hatch.castShadow = true;
    hatchPivot.add(hatch);
    b.mesh(hatchPivot, 0.3, fh + 0.0, 0.0);
    hatchPivot.visible = false; // revealed when the rug is moved
    b.anchor('hatch', 0.7, fh + 0.05, 0.35, { pivot: hatchPivot, rug });
    b.anchor('vault', 0.7, fh - 0.62, 0.35, { yaw: 0.35 });
    // cavity under the floor (dark box seen when the hatch is open)
    b.geo(place(merge([box(0.78, 0.02, 0.68, 0, -0.66, 0), box(0.02, 0.66, 0.68, -0.39, -0.33, 0), box(0.02, 0.66, 0.68, 0.39, -0.33, 0), box(0.78, 0.66, 0.02, 0, -0.33, -0.34), box(0.78, 0.66, 0.02, 0, -0.33, 0.34)]), 0.7, fh, 0.35), this.M.concrete, { cast: false });
    // solar panels: one tilted, one fallen and cracked
    buildSolarPanel(b, { x: 3.4, z: -1.6, y: b.groundLocal(3.4, -1.6), yaw: -0.3 });
    buildSolarPanel(b, { x: 3.6, z: 0.9, y: b.groundLocal(3.6, 0.9), yaw: -0.5, cracked: true, fallen: true });
    this._cable(b, V(3.3, b.groundLocal(3.4, -1.6) + 0.8, -1.4), V(2.05, fh + 1.6, -1.0), 0.4);
    // dock to the north-east
    const [d0x, d0z] = b.local(-563, -532), [d1x, d1z] = b.local(-547, -514);
    const dockY = 1.05 - b.y;
    const dock = buildDock(b, { x0: d0x, z0: d0z, x1: d1x, z1: d1z, width: 2.2, deckY: dockY, seed: 7, ground: (lx, lz) => b.terrainLocal(lx, lz) });
    b.anchor('dockEnd', d1x - dock.ux * 1.2, dockY + 0.6, d1z - dock.uz * 1.2);
    b.anchor('dockUnload', d1x - dock.ux * 3, dockY, d1z - dock.uz * 3);
    // crates and drums by the landing
    const [cx0, cz0] = b.local(-566, -538);
    this._crate(b, cx0 + 1.2, cz0 - 0.4, { yaw: 0.3, seed: 41 });
    this._crate(b, cx0 + 1.4, cz0 + 0.5, { yaw: 0.1, seed: 43, w: 0.7, h: 0.5, d: 0.5 });
    this._barrel(b, cx0 - 0.8, cz0 + 1.6, {});
    this._barrel(b, cx0 - 1.6, cz0 + 1.0, { lying: true, yaw: 1.2 });
    this._done(b);

    // the mast on the knoll behind the hut: a landmark, visible from far away
    const mp = PADS.find((p) => p.id === 'outpostMast');
    const m = this._site('outpostMast', mp.x, mp.z, 0.4, { level: padLevel('outpostMast'), activation: 4000 });
    const mast = buildMast(m, { x: 0, z: 0, y: 0, height: 22, base: 1.2, top: 0.45, seed: 8 });
    // empty bracket where the transmitter belongs; the module appears when installed
    m.geo(merge([box(0.5, 0.06, 0.4, 0.75, 2.6, 0), box(0.06, 0.4, 0.4, 0.98, 2.4, 0)]), this.M.steel);
    const tx = new THREE.Mesh(merge([box(0.42, 0.34, 0.32, 0, 0.17, 0), box(0.06, 0.12, 0.06, 0.12, 0.4, 0)]), this.M.cabinet);
    tx.visible = false;
    m.mesh(tx, 0.72, 2.63, 0);
    const txLed = makeLed(LED.off, 0.02);
    m.mesh(txLed, 0.72, 2.85, 0.17);
    m.anchor('base', 0.6, 1.2, 0.8, { light: mast.light, module: tx, led: txLed });
    this._done(m);
  }

  // ================================================================ smuggler's cove
  _cove() {
    const pad = PADS.find((p) => p.id === 'coveShelter');
    const b = this._site('cove', pad.x, pad.z, -1.78, { level: padLevel('coveShelter') });
    const r = rng(77);
    // concrete slab and an open-sided cargo shelter (posts, beams, corrugated roof)
    b.geo(place(box(8.6, 0.2, 5.6, 0, 0, 0), 0, 0.0, 0), this.M.concrete);
    b.box(0, 0.0, 0, 4.3, 0.1, 2.8, { walkable: true, surface: 'stone' });
    for (const sx of [-4, 0, 4]) for (const sz of [-2.5, 2.5]) {
      b.geo(place(woodBox(0.18, 3.0, 0.18, { seed: sx * 3 + sz }), sx, 1.5, sz), this.M.woodDark);
      b.cyl(sx, sz, 0.14, 0, 3);
    }
    for (const sz of [-2.5, 2.5]) b.geo(place(woodBox(8.4, 0.2, 0.14, { seed: 12 + sz }), 0, 2.95, sz), this.M.woodDark);
    const roof = corrugated(9.2, 6.4, { ribs: 0.09 });
    roof.rotateX(-0.1);
    b.geo(place(roof, 0, 3.15, 0), this.M.galv);
    b.box(0, 3.1, 0, 4.6, 0.08, 3.2, {});
    // back wall of planks
    b.geo(place(woodBox(8.2, 1.8, 0.08, { seed: 4 }), 0, 1.0, -2.6), this.M.wood);
    b.box(0, 1.0, -2.6, 4.1, 0.9, 0.06);
    // workbench with the cove radio
    const term = buildTerminal(b, { x: -1.8, z: -1.9, y: 0.1, yaw: 0 });
    b.anchor('radio', -1.8, 1.1, -1.5, { screen: term.screen, leds: term.leds });
    // the note pinned to a post (shown after the delivery)
    const note = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), this.PM.paper);
    note.visible = false;
    b.mesh(note, 0.0, 1.5, -2.41);
    b.anchor('note', 0.0, 1.5, -2.3, { mesh: note });
    // stacked crates, sacks, rope
    this._crate(b, 2.2, -1.6, { yaw: 0.05, seed: 51, w: 1.1, h: 0.7, d: 0.8 });
    this._crate(b, 2.25, -1.6, { yaw: -0.1, seed: 52, y: 0.8, w: 0.9, h: 0.56, d: 0.6, collide: false });
    this._crate(b, 3.4, -1.4, { yaw: 0.4, seed: 53 });
    const coil = buildRopeCoil(this.PM, 0.3, 9);
    b.mesh(coil, 1.0, 0.1, 1.2);
    this._barrel(b, -3.4, -1.7, {});
    this._barrel(b, -3.5, -0.9, {});
    // delivery drop point at the shelter edge
    b.anchor('drop', 0.0, 0.1, 2.0);

    // loading dock into the cove
    const [d0x, d0z] = b.local(624, -398), [d1x, d1z] = b.local(605, -419);
    const dockY = 1.1 - b.y;
    const dock = buildDock(b, { x0: d0x, z0: d0z, x1: d1x, z1: d1z, width: 2.4, deckY: dockY, seed: 13, ground: (lx, lz) => b.terrainLocal(lx, lz) });
    b.anchor('dockEnd', d1x - dock.ux * 1.5, dockY + 0.6, d1z - dock.uz * 1.5);
    b.anchor('dockUnload', d1x - dock.ux * 3.5, dockY, d1z - dock.uz * 3.5);
    // the missing container, washed up at the water's edge beside the dock
    const [mx, mz] = b.local(601.5, -404.5);
    const lost = buildCrate(this.PM, 1.0, 0.62, 0.66, 99);
    const lg = Math.max(b.terrainLocal(mx, mz), -b.y - 0.25);
    b.mesh(lost.group, mx, lg - 0.05, mz, 0.7);
    lost.group.rotation.z = 0.12;
    b.anchor('missing', mx, lg + 0.3, mz, { mesh: lost.group });
    this._done(b);

    // container yard up the slope
    const yp = PADS.find((p) => p.id === 'coveYard');
    const y = this._site('coveYard', yp.x, yp.z, -1.2, { level: padLevel('coveYard') });
    y.geo(place(box(14, 0.3, 9, 0, -0.1, 0), 0, 0, 0), this.M.concrete);
    y.box(0, -0.1, 0, 7, 0.15, 4.5, { walkable: true, surface: 'stone' });
    buildContainer(y, { x: -2.4, z: -2.2, y: 0.05, yaw: 0.04, mat: this.M.boxGreen, seed: 1 });
    buildContainer(y, { x: -2.3, z: -2.2, y: 2.68, yaw: -0.03, mat: this.M.boxBlue, seed: 2, collide: false });
    y.box(-2.3, 2.68 + 1.3, -2.2, 3.03, 1.3, 1.22, { surface: 'metal' });
    buildContainer(y, { x: 1.0, z: 2.1, y: 0.05, yaw: -0.12, mat: this.M.boxRed, seed: 3, open: 0.85 });
    // hard case inside the open container
    y.anchor('containerCase', 1.4, 0.15, 2.05, { yaw: -0.12 + Math.PI / 2 });
    this._barrel(y, 4.6, -1.6, {});
    this._barrel(y, 5.2, -0.9, { lying: true, yaw: 0.4 });
    this._crate(y, 4.8, 1.4, { yaw: 0.3, seed: 57 });
    this._done(y);

    // secret storage: a tarp-covered box in the cleft at the end of the narrow trail
    const s = this._site('coveSecret', 731.6, -400.6, -0.4, { activation: 400 });
    const tarp = new THREE.PlaneGeometry(1.8, 1.4, 8, 6);
    const tp = tarp.attributes.position;
    for (let i = 0; i < tp.count; i++) tp.setZ(i, -0.25 * (1 - Math.abs(tp.getX(i)) / 0.9) * (1 - Math.abs(tp.getY(i)) / 0.7) + r() * 0.03);
    tarp.computeVertexNormals();
    tarp.rotateX(-Math.PI / 2);
    const tarpMesh = new THREE.Mesh(tarp, this.PM.olive);
    tarpMesh.material = this.PM.olive;
    s.mesh(tarpMesh, 0, 0.62, 0);
    s.anchor('tarp', 0, 0.6, 0, { mesh: tarpMesh });
    this._done(s);
  }

  // ================================================================ relic island
  _relic() {
    const pad = PADS.find((p) => p.id === 'relicRuins');
    const b = this._site('relic', pad.x, pad.z, 0.3, { level: padLevel('relicRuins') });
    const r = rng(303);
    // ring of weathered pillars, some fallen
    const N = 9;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const px = Math.cos(a) * 6.2, pz = Math.sin(a) * 6.2;
      const broken = i === 2 || i === 6;
      const fallen = i === 4;
      const h = broken ? 1.3 + r() : 2.8 + r() * 0.5;
      if (fallen) {
        const g = stonePillar(2.9, 0.34, 40 + i);
        g.rotateZ(Math.PI / 2 - 0.05);
        b.geo(place(g, px + 1.2, 0.35, pz, 0, a + 1.3), this.M.ancient);
        b.box(px + 1.2 * Math.cos(a + 1.3), 0.35, pz - 1.2 * Math.sin(a + 1.3), 1.45, 0.35, 0.35, { yaw: a + 1.3, surface: 'rock' });
      } else {
        b.geo(place(stonePillar(h, 0.36, 40 + i, broken), px, -0.1, pz, 0, r() * 3), this.M.ancient);
        b.cyl(px, pz, 0.38, -0.2, h);
        if (!broken && i % 3 === 0) b.geo(place(stoneBlock(1.2, 0.3, 0.7, 60 + i), px, h - 0.05, pz, 0, a + Math.PI / 2), this.M.ancient);
      }
    }
    // central platform with steps
    b.geo(place(stoneBlock(4.2, 0.55, 4.2, 70), 0, 0.2, 0), this.M.ancient);
    b.box(0, 0.22, 0, 2.1, 0.26, 2.1, { walkable: true, surface: 'rock' });
    for (let k = 0; k < 2; k++) {
      b.geo(place(stoneBlock(1.6, 0.18, 0.5, 80 + k), 0, 0.02 + k * 0.17, 2.4 - k * 0.32), this.M.ancient);
      b.box(0, 0.02 + k * 0.17, 2.4 - k * 0.32, 0.8, 0.09, 0.25, { walkable: true, surface: 'rock' });
    }
    // node pedestal with an empty crystal cradle
    b.geo(place(stoneBlock(0.7, 1.0, 0.7, 90), 0, 0.98, 0), this.M.ancient);
    b.geo(place(merge([cylY(0.16, 0.14, 0.08, 0, 0, 0, 10), rod(V(-0.12, 0.04, 0), V(-0.05, 0.22, 0), 0.012), rod(V(0.12, 0.04, 0), V(0.05, 0.22, 0), 0.012)]), 0, 1.5, 0), this.PM.brass);
    const nodeLight = makeLed(LED.off, 0.05);
    b.mesh(nodeLight, 0, 1.68, 0);
    b.anchor('node', 0, 1.4, 0, { led: nodeLight });
    b.cyl(0, 0, 0.42, 0.4, 1.5);
    // carved glyph stone (clue)
    const glyph = makeScreen(0.9, 0.6, 256);
    glyph.draw((g, W, H) => {
      g.fillStyle = '#7d776a'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(40,36,30,0.85)'; g.lineWidth = 3;
      const hex = (cx, cy, rr) => { g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.stroke(); };
      for (let row = 0; row < 3; row++) for (let col = 0; col < 7; col++) hex(22 + col * 36 + (row % 2) * 18, 30 + row * 32, 13);
      g.lineWidth = 5;
      hex(40, 140, 16); g.beginPath(); g.moveTo(62, 140); g.lineTo(96, 140); g.lineTo(88, 132); g.moveTo(96, 140); g.lineTo(88, 148); g.stroke();
      hex(120, 140, 16); g.beginPath(); g.moveTo(142, 140); g.lineTo(176, 140); g.lineTo(168, 132); g.moveTo(176, 140); g.lineTo(168, 148); g.stroke();
      g.beginPath(); g.arc(205, 140, 16, 0, Math.PI * 2); g.stroke();
    });
    glyph.mesh.material = new THREE.MeshStandardMaterial({ map: glyph.mesh.material.map, roughness: 0.95 });
    b.geo(place(stoneBlock(1.3, 1.0, 0.45, 95), 3.2, 0.42, -2.6, 0, -0.6), this.M.ancient);
    b.box(3.2, 0.42, -2.6, 0.65, 0.5, 0.25, { yaw: -0.6, surface: 'rock' });
    glyph.mesh.position.set(3.2 + Math.sin(-0.6) * 0.235, 0.55, -2.6 + Math.cos(-0.6) * 0.235);
    glyph.mesh.rotation.y = -0.6;
    b.group.add(glyph.mesh);
    b.anchor('glyph', 3.2, 0.6, -2.3);
    // scattered blocks
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2, d = 8 + r() * 5;
      b.geo(place(stoneBlock(0.6 + r() * 0.6, 0.35 + r() * 0.3, 0.5 + r() * 0.4, 100 + i), Math.cos(a) * d, b.groundLocal(Math.cos(a) * d, Math.sin(a) * d) + 0.1, Math.sin(a) * d, r() * 0.2, r() * 3), this.M.ancient);
    }
    this._done(b);

    // observation point: a stone tower base with steps, the vault slab at its foot
    const sp = PADS.find((p) => p.id === 'relicSummit');
    const t = this._site('relicTower', sp.x, sp.z, 0.9, { level: padLevel('relicSummit'), activation: 900 });
    const TH = 3.0;
    // solid tower base (walkable top)
    t.geo(place(stoneBlock(4.4, TH, 4.4, 120), 0, TH / 2 - 0.2, 0), this.M.ancient);
    t.box(0, TH / 2 - 0.2, 0, 2.2, TH / 2, 2.2, { walkable: true, surface: 'rock' });
    // parapet blocks around the top, open at the stair head
    for (let i = 0; i < 12; i++) {
      const side = Math.floor(i / 3), k = (i % 3) - 1;
      if (side === 0 && k === 1) continue;
      const along = k * 1.35;
      const [px, pz] = [[along, 2.05], [2.05, along], [along, -2.05], [-2.05, along]][side];
      t.geo(place(stoneBlock(side % 2 ? 0.35 : 1.0, 0.55, side % 2 ? 1.0 : 0.35, 130 + i), px, TH - 0.2 + 0.28, pz), this.M.ancient);
      t.box(px, TH - 0.2 + 0.28, pz, side % 2 ? 0.18 : 0.5, 0.28, side % 2 ? 0.5 : 0.18, { surface: 'rock' });
    }
    // steps up the +z side (east)
    const nSteps = 8;
    for (let k = 0; k < nSteps; k++) {
      const yy = (k + 1) * (TH / nSteps) - 0.2;
      const zz = 2.2 + 3.0 - k * (3.0 / nSteps);
      t.geo(place(stoneBlock(1.3, 0.22, 0.42, 140 + k), 1.35, yy - 0.11, zz), this.M.ancient);
      t.box(1.35, yy - 0.11, zz, 0.65, 0.11, 0.21, { walkable: true, surface: 'rock' });
      t.geo(place(stoneBlock(0.3, yy + 0.2, 0.42, 150 + k), 2.05, yy / 2 - 0.1, zz), this.M.ancient);
    }
    t.anchor('top', 0, TH, 0);
    // the vault: a stone slab in front of the tower (slides aside), a chamber below
    const slab = new THREE.Mesh(stoneBlock(1.5, 0.22, 1.1, 170), this.M.ancient);
    slab.castShadow = true; slab.receiveShadow = true;
    t.mesh(slab, -1.0, 0.05, 3.4);
    t.box(-1.0, 0.05, 3.4, 0.75, 0.11, 0.55, { walkable: true, surface: 'rock' });
    t.geo(place(merge([box(1.3, 0.04, 0.9, 0, -0.85, 0), box(0.06, 0.9, 0.9, -0.64, -0.42, 0), box(0.06, 0.9, 0.9, 0.64, -0.42, 0), box(1.3, 0.9, 0.06, 0, -0.42, -0.44), box(1.3, 0.9, 0.06, 0, -0.42, 0.44)]), -1.0, 0.0, 3.4), this.M.ancient, { cast: false });
    t.anchor('slab', -1.0, 0.2, 3.4, { mesh: slab });
    t.anchor('vault', -1.0, -0.82, 3.4, { yaw: 0.9 });
    this._done(t);

    // the cave on the hillside, mouth facing the path from the north
    const cp = PADS.find((p) => p.id === 'relicCave');
    const c = this._site('relicCave', cp.x, cp.z, 0, { level: padLevel('relicCave'), activation: 500 });
    // mouth on the cave's local +z, turned to face the path coming up from the ruins
    const caveYaw = -0.39;
    buildCave(c, { x: 0, z: 0, y: 0, yaw: caveYaw, R: 5.4, H: 4.2, mouth: 1.4, material: this.rockMat, seed: 11 });
    // a stone ledge at the back (opposite the mouth) with the crystal on it
    const ledgeAng = caveYaw;
    const lx = -Math.sin(caveYaw) * 3.4, lz = -Math.cos(caveYaw) * 3.4;
    c.geo(place(stoneBlock(1.2, 0.8, 0.6, 180), lx, 0.4, lz, 0, ledgeAng), this.M.ancient);
    c.box(lx, 0.4, lz, 0.6, 0.4, 0.3, { yaw: ledgeAng, surface: 'rock' });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), new THREE.MeshStandardMaterial({ color: 0xc9e6ee, roughness: 0.1, metalness: 0.1, emissive: 0x5a8fa0, emissiveIntensity: 0.6, transparent: true, opacity: 0.88 }));
    crystal.scale.set(0.6, 1.8, 0.6);
    crystal.castShadow = false;
    c.mesh(crystal, lx, 0.92, lz);
    const cradle = new THREE.Mesh(merge([cylY(0.08, 0.07, 0.05, 0, 0, 0, 8), rod(V(-0.06, 0.02, 0), V(-0.03, 0.12, 0), 0.008), rod(V(0.06, 0.02, 0), V(0.03, 0.12, 0), 0.008)]), this.PM.brass);
    c.mesh(cradle, lx, 0.82, lz);
    c.anchor('crystal', lx, 0.95, lz, { mesh: crystal, cradle });
    this._done(c);
  }

  // ================================================================ airstrip island
  _airstrip() {
    const pad = PADS.find((p) => p.id === 'stripShelter');
    const b = this._site('airstrip', pad.x, pad.z, -2.88, { level: padLevel('stripShelter') });
    const hut = buildHut(b, { x: 0, z: 0, yaw: 0, w: 5.0, d: 3.6, h: 2.5, door: { side: 'front', at: -1.4, width: 1.0 }, windows: [{ side: 'front', at: 0.9, width: 1.2 }, { side: 'right', at: 0, width: 1.0 }, { side: 'back', at: 0, width: 1.4 }], seed: 37, roof: 'galv', doorOpen: 1.5 });
    const fh = hut.floorH;
    const term = buildTerminal(b, { x: 1.2, z: -1.15, y: fh, yaw: 0 });
    b.anchor('radio', 1.2, fh + 1.0, -0.7, { screen: term.screen, leds: term.leds });
    // workbench with the transmitter module on it
    b.geo(place(merge([box(1.4, 0.05, 0.6, 0, 0.82, 0), box(0.06, 0.8, 0.06, -0.62, 0.4, -0.24), box(0.06, 0.8, 0.06, 0.62, 0.4, -0.24), box(0.06, 0.8, 0.06, -0.62, 0.4, 0.24), box(0.06, 0.8, 0.06, 0.62, 0.4, 0.24)]), -1.75, fh, -0.5, 0, Math.PI / 2), this.M.woodDark);
    b.box(-1.75, fh + 0.42, -0.5, 0.3, 0.42, 0.7);
    const module = new THREE.Mesh(merge([box(0.42, 0.34, 0.32, 0, 0.17, 0), box(0.06, 0.12, 0.06, 0.12, 0.4, 0)]), this.M.cabinet);
    b.mesh(module, -1.75, fh + 0.85, -0.6, 0.2);
    b.anchor('transmitter', -1.75, fh + 1.0, -0.6, { mesh: module });
    // the locker (encrypted container goes here) and a cot
    b.anchor('locker', -0.4, fh, -1.2, { yaw: 0 });
    const cot = new THREE.Mesh(merge([box(1.9, 0.05, 0.7, 0, 0.42, 0), box(0.04, 0.42, 0.04, -0.9, 0.21, -0.3), box(0.04, 0.42, 0.04, 0.9, 0.21, -0.3), box(0.04, 0.42, 0.04, -0.9, 0.21, 0.3), box(0.04, 0.42, 0.04, 0.9, 0.21, 0.3)]), this.PM.olive);
    b.mesh(cot, 0.9, fh, 1.15);
    b.box(0.9, fh + 0.22, 1.15, 0.95, 0.22, 0.35, { walkable: true, surface: 'cloth' });
    // notice pinned by the door
    const notice = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), this.PM.paper);
    b.mesh(notice, -2.4, fh + 1.45, 1.71);
    b.anchor('notice', -2.4, fh + 1.45, 1.5);
    // delivery point (medical supplies) inside the door
    b.anchor('drop', -1.4, fh, 1.0);
    // floating dock from the beach into the bay
    const [p0x, p0z] = b.local(138, 818), [p1x, p1z] = b.local(138, 793);
    const pg = new THREE.Group();
    b.group.add(pg);
    const pontoonY = -b.y; // world water level, in local y
    const pb = new SiteBuilder({ id: 'stripDock', x: b.x, y: 0, z: b.z, yaw: b.yaw, collision: this.collision, parent: this.root, M: this.M, terrain: this.td });
    pb.activation = 900;
    this.sites.push(pb);
    const pt = buildPontoon(pb, { x0: p0x, z0: p0z, x1: p1x, z1: p1z, width: 2.2, seed: 9 });
    // ramp from the beach onto the pontoon
    const rampY = Math.max(0.35, this.td.heightAt(138, 820) + 0.05);
    void rampY; void pontoonY;
    pb.anchor('end', p1x + Math.sin(pt.ang) * -1.2, 0.8, p1z + Math.cos(pt.ang) * -1.2);
    // wind sock at the shore end
    const sockX = p0x + 2.4, sockZ = p0z + 0.5;
    const sockG = pb.terrainLocal(sockX, sockZ);
    pb.geo(rod(V(sockX, sockG, sockZ), V(sockX, sockG + 5.5, sockZ), 0.04, 6), this.M.galv);
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, 1.2, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xd8632a, roughness: 0.8, side: THREE.DoubleSide }));
    sock.geometry.rotateZ(Math.PI / 2);
    sock.geometry.translate(0.65, 0, 0);
    pb.mesh(sock, sockX, sockG + 5.4, sockZ);
    this.windSock = sock;
    this._done(pb);
    this._done(b);

    // fuel store: two tanks, a shed, drums
    const fp = PADS.find((p) => p.id === 'stripFuel');
    const f = this._site('stripFuel', fp.x, fp.z, 0.1, { level: padLevel('stripFuel') });
    f.geo(place(box(10, 0.25, 7, 0, -0.08, 0), 0, 0, 0), this.M.concrete);
    f.box(0, -0.08, 0, 5, 0.13, 3.5, { walkable: true, surface: 'stone' });
    buildTank(f, { x: -1.5, z: -1.6, y: 0.05, yaw: 0, len: 4.4, r: 0.9 });
    buildTank(f, { x: -1.5, z: 1.4, y: 0.05, yaw: 0, len: 4.0, r: 0.8 });
    const shed = buildHut(f, { x: 3.4, z: 0.2, yaw: -Math.PI / 2, w: 2.4, d: 2.0, h: 2.1, door: { side: 'front', at: 0, width: 0.85 }, windows: [], seed: 47, doorOpen: 1.0 });
    void shed;
    for (let i = 0; i < 4; i++) this._barrel(f, 1.5 + (i % 2) * 0.62, -2.6 + Math.floor(i / 2) * 0.62, {});
    const jc = buildJerryCan(this.PM);
    f.mesh(jc, 1.4, 0.05, 2.6, 0.4);
    f.anchor('locker', 2.6, 0.05, 2.3);
    this._done(f);

    // radio beacon on the rise to the east
    const bx = 236, bz = 849;
    const bc = this._site('stripBeacon', bx, bz, 0.3, { activation: 3000 });
    bc.geo(cylY(0.6, 0.55, 0.4, 0, 0.1, 0, 10), this.M.concrete);
    bc.geo(rod(V(0, 0, 0), V(0, 12, 0), 0.09, 8), this.M.galv);
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI * 2 / 3;
      const gx = Math.cos(a) * 5.5, gz = Math.sin(a) * 5.5;
      bc.geo(ropeGeometry(V(0, 9, 0), V(gx, bc.terrainLocal(gx, gz) + 0.2, gz), 0.1, 0.008, 8), this.PM.metalBlack, { cast: false });
    }
    bc.cyl(0, 0, 0.5, -0.2, 12, 'metal');
    const bLight = makeLed(LED.off, 0.12);
    bc.mesh(bLight, 0, 12.15, 0);
    // battery box with the power switch and the housing for the fragment
    bc.geo(place(box(0.7, 0.9, 0.5, 0, 0.45, 0), 1.2, 0, 0.8, 0, 0.3), this.M.cabinet);
    bc.box(1.2, 0.45, 0.8, 0.35, 0.45, 0.25, { yaw: 0.3, surface: 'metal' });
    const swLed = makeLed(LED.off, 0.02);
    bc.mesh(swLed, 1.2 + Math.sin(0.3) * 0.26, 0.82, 0.8 + Math.cos(0.3) * 0.26);
    bc.anchor('switch', 1.2 + Math.sin(0.3) * 0.3, 0.6, 0.8 + Math.cos(0.3) * 0.3, { light: bLight, led: swLed });
    buildSolarPanel(bc, { x: -1.4, z: 0.9, y: bc.groundLocal(-1.4, 0.9), yaw: 2.6 });
    this.lights.push({ mesh: bLight, on: false, period: 2.2 });
    this._done(bc);

    // the expedition's last camp on the south beach
    const ep = PADS.find((p) => p.id === 'stripCamp');
    const e = this._site('stripCamp', ep.x, ep.z, 0.6, { level: padLevel('stripCamp'), activation: 450 });
    const tent = new THREE.PlaneGeometry(2.6, 2.2, 10, 8);
    const tpos = tent.attributes.position;
    const rr = rng(88);
    for (let i = 0; i < tpos.count; i++) { const x = tpos.getX(i), yv = tpos.getY(i); tpos.setZ(i, Math.max(0.05, 0.9 * (1 - Math.abs(x) / 1.3) * (0.5 + 0.5 * (1 - Math.abs(yv) / 1.1)) - (x > 0.2 ? 0.55 : 0) + rr() * 0.06)); }
    tent.rotateX(-Math.PI / 2);
    tent.computeVertexNormals();
    const tentMesh = new THREE.Mesh(tent, this.PM.canvasStatic);
    e.mesh(tentMesh, 0, 0.02, 0);
    e.box(-0.4, 0.4, 0, 0.8, 0.4, 1.0, { surface: 'cloth' });
    const fire = buildFirePit(this.PM, 17);
    e.mesh(fire.group, 2.8, e.groundLocal(2.8, 1.5), 1.5);
    const pack = buildCrate(this.PM, 0.5, 0.35, 0.35, 71);
    e.mesh(pack.group, 1.5, e.groundLocal(1.5, -1.6), -1.6, 0.6);
    const journal = new THREE.Mesh(merge([box(0.2, 0.025, 0.26, 0, 0.012, 0)]), this.PM.leather);
    e.mesh(journal, 1.55, e.groundLocal(1.55, -1.6) + 0.36, -1.6, 0.2);
    e.anchor('journal', 1.55, e.groundLocal(1.55, -1.6) + 0.4, -1.6, { mesh: journal });
    this._barrel(e, -2.2, 1.8, { lying: true, yaw: 0.3 });
    this._done(e);

    // marker buoys along the landing lane in the bay
    const rb = rng(5);
    for (let i = 0; i < 6; i++) {
      const x = 70 + i * 36, z = 772 + (rb() - 0.5) * 6;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), this.M.buoy);
      m.scale.set(1, 0.85, 1);
      m.castShadow = true;
      this.root.add(m);
      this.buoys.push({ mesh: m, x, z, ph: rb() * 6 });
    }
  }

  // ================================================================ main island additions
  _mainIsland() {
    // harbour ledger: a notice board beside the pier root
    const b = this._site('pier', 5.4, -11.6, Math.PI / 2 + 0.25, { activation: 300 });
    const gy = 0;
    b.geo(merge([place(woodCylinder(0.06, 0.055, 1.9, { seed: 3, radial: 8 }), -0.55, 0.95, 0), place(woodCylinder(0.06, 0.055, 1.9, { seed: 4, radial: 8 }), 0.55, 0.95, 0)]), this.M.woodDark);
    b.cyl(-0.55, 0, 0.07, gy - 0.5, 1.9); b.cyl(0.55, 0, 0.07, gy - 0.5, 1.9);
    const board = makeScreen(1.2, 0.8, 512);
    board.draw((g, W, H) => {
      g.fillStyle = '#7d6648'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(40,28,18,${0.05 + Math.random() * 0.08})`; g.fillRect(0, Math.random() * H, W, 1 + Math.random() * 2); }
      g.fillStyle = '#efe6d2'; g.fillRect(30, 60, 200, 240); g.fillRect(270, 50, 210, 150); g.fillRect(290, 220, 170, 110);
      g.fillStyle = '#2a2016'; g.font = 'bold 30px Georgia'; g.textAlign = 'center'; g.fillText('HARBOUR LEDGER', W / 2, 38);
      g.font = '15px Georgia'; g.textAlign = 'left';
      ['Deliveries', 'by skiff', '', 'Charters', 'by air'].forEach((l, i) => g.fillText(l, 45, 95 + i * 24));
      for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(40,30,20,0.5)'; g.fillRect(285, 75 + i * 20, 170 - i * 18, 3); }
    });
    board.mesh.material = new THREE.MeshStandardMaterial({ map: board.mesh.material.map, roughness: 0.9 });
    const frame = new THREE.Mesh(woodBox(1.32, 0.92, 0.05, { seed: 9 }), this.M.woodDark);
    b.mesh(frame, 0, 1.45, -0.03);
    b.mesh(board.mesh, 0, 1.45, 0.0);
    b.box(0, 1.45, 0, 0.66, 0.46, 0.05);
    b.anchor('board', 0, 1.45, 0.3);
    this._done(b);
    this.anchors['main.board'] = this.anchors['pier.board'];
  }

  // ================================================================ offshore markers
  _offshore() {
    // a marker float over the Lost Sandbar
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.7, 10), this.M.buoy);
    m.castShadow = true;
    this.root.add(m);
    this.buoys.push({ mesh: m, x: -322, z: -646, ph: 1.3, tall: true });
  }

  // ================================================================ per frame
  update(dt, game) {
    const cam = game.camera.position;
    for (const s of this.sites) {
      const d = Math.hypot(s.x - cam.x, s.z - cam.z);
      const vis = d < s.activation;
      if (s.group.visible !== vis) s.group.visible = vis;
    }
    const t = game.time;
    for (const l of this.lights) {
      if (!l.on) continue;
      const blink = (t % l.period) < 0.18;
      l.mesh.material.color.copy(blink ? LED.red : LED.off);
    }
    for (const bu of this.buoys) {
      if (Math.hypot(bu.x - cam.x, bu.z - cam.z) > 900) { bu.mesh.visible = false; continue; }
      bu.mesh.visible = true;
      const h = this.ocean.heightAt(bu.x, bu.z);
      bu.mesh.position.set(bu.x, h + (bu.tall ? 0.2 : 0.08), bu.z);
      bu.mesh.rotation.set(Math.sin(t * 1.1 + bu.ph) * 0.12, 0, Math.cos(t * 0.9 + bu.ph) * 0.12);
    }
    if (this.windSock) this.windSock.rotation.y = Math.atan2(-game.U.uWind.value.y, game.U.uWind.value.x) - this.sites.find((s) => s.id === 'stripDock').yaw;
  }

  /** Switch a blinking beacon light on/off. */
  setBlink(mesh, on, period = 2.0) {
    let l = this.lights.find((q) => q.mesh === mesh);
    if (!l) this.lights.push((l = { mesh, on, period }));
    l.on = on;
    l.period = period;
    if (!on) mesh.material.color.copy(LED.off);
  }
}
