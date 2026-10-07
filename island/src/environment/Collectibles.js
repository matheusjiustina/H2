import * as THREE from 'three';
import { LAYER } from '../core/Shared.js';
import { POIS, ISLET } from '../world/Layout.js';

// Twelve rare shells placed by hand along the shores.
const SHELLS = [
  [ISLET.x + 4, ISLET.z - 12], [ISLET.x - 18, ISLET.z + 8], [-292, -46], [-305, -30], [-160, -27], [-60, -22.5],
  [44, -25], [128, -36], [204, -86], [-80, 196], [96, -170], [-30, -24],
];

function shellGeometry() {
  // conch-like spiral
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    pts.push(new THREE.Vector2(Math.sin(t * Math.PI) * (0.05 * (1 - t * 0.5)) + 0.004, t * 0.11 - 0.02));
  }
  const g = new THREE.LatheGeometry(pts, 14);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const ridge = 1 + 0.12 * Math.sin(a * 9 + y * 60);
    p.setX(i, p.getX(i) * ridge);
    p.setZ(i, p.getZ(i) * ridge);
  }
  g.rotateZ(Math.PI / 2.3);
  g.computeVertexNormals();
  return g;
}

/** Shells to collect + points of interest that trigger discoveries and journal notes. */
export class Collectibles {
  constructor({ scene, materials, terrainData, interaction, game }) {
    this.game = game;
    this.shells = [];
    const geo = shellGeometry();
    const tints = [0xf3d9c4, 0xf6ead8, 0xe8b9a0, 0xf2cfa8, 0xffffff, 0xe3c7d8];
    SHELLS.forEach(([x, z], i) => {
      const mat = materials.shell.clone();
      mat.color.set(tints[i % tints.length]);
      mat.onBeforeCompile = materials.shell.onBeforeCompile;
      mat.customProgramCacheKey = materials.shell.customProgramCacheKey;
      const m = new THREE.Mesh(geo, mat);
      const y = terrainData.heightAt(x, z);
      m.position.set(x, y + 0.025, z);
      m.rotation.set(Math.random() * 0.4, Math.random() * 6.28, 0.2);
      m.castShadow = false; // too small to matter, saves 24 shadow draws
      m.layers.set(LAYER.DETAIL);
      scene.add(m);
      const it = interaction.add({
        object: m, name: 'shell', interactionLabel: 'Collect shell', interactionDistance: 3.0, boxPadding: 0.18, priority: 1,
        onInteract: (g) => {
          g.rig.play('grab', { target: m.position.clone(), duration: 0.6, onPeak: () => {
            scene.remove(m);
            interaction.remove(it);
            g.inventory.add('shell', 1, { equip: false });
            const n = g.inventory.count('shell');
            g.audio?.play('pebble', { volume: 0.7 });
            if (n >= 12) g.ui.discover('All twelve shells', 'Collection complete');
            else g.toast(`Rare shell — ${n} of 12`);
          } });
        },
      });
      this.shells.push({ mesh: m, it });
    });
    this.discovered = new Set();
    this.timer = 0;
  }

  update(dt, game) {
    // glint: shells catch the light now and then
    const t = game.time;
    for (const s of this.shells) s.mesh.material.emissive && s.mesh.material.emissive.setScalar(Math.max(0, Math.sin(t * 2 + s.mesh.position.x) - 0.95) * 4);
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    const p = game.player.pos;
    for (const poi of POIS) {
      if (this.discovered.has(poi.id)) continue;
      if (Math.hypot(p.x - poi.x, p.z - poi.z) < poi.radius) {
        this.discovered.add(poi.id);
        game.ui.discovered.add(poi.id);
        if (poi.id !== 'camp') {
          game.ui.discover(poi.name);
          game.journal.push({ title: poi.name, text: JOURNAL_NOTES[poi.id] || 'Noted on the chart.' });
          game.audio?.play('bird2', { volume: 0.25, rate: 0.6 });
        }
      }
    }
  }
}

const JOURNAL_NOTES = {
  pier: 'The pier boards are soft at the seaward end. The skiff is tied off at the platform — fuel for a few hours of sounding.',
  islet: 'A lone stand of palms on a sandbar. At low sun the water around it turns the colour of bottle glass.',
  reef: 'Surf breaks white along the reef crest. Outside it the bottom falls away into deep blue in a few metres.',
  channel: 'The channel through the reef is deep and dark — a road out to open water.',
  waterfall: 'Hidden falls at the head of the valley. The pool is cold and clear; ferns everywhere.',
  viewpoint: 'From the headland the whole lagoon lies open: the reef line, the islet, the camp a speck on the beach.',
  westpoint: 'Bleached driftwood piled on the rocks of the western point. Good place for shells.',
  overlook: 'A gap in the canopy on the ridge path. The mountain rises behind in steps of dark rock.',
  wreck: 'The bones of an old wooden boat, half buried in sand. Someone came here before us.',
};
