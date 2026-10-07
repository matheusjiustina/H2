import * as THREE from 'three';
import { LAYER } from '../core/Shared.js';
import { patchMaterial } from '../core/MaterialPatch.js';
import { rng, smoothstep } from '../utils/MathUtils.js';
import { woodCylinder, woodBox, place, merge, buildSign } from './PropFactory.js';
import { VIEWPOINT, POIS } from '../world/Layout.js';
import { GeoBuilder } from '../vegetation/PlantGeometry.js';

function driftwoodGeometry(seed) {
  const r = rng(seed);
  const parts = [];
  const len = 1.6 + r() * 2.6;
  parts.push(place(woodCylinder(0.13 + r() * 0.08, 0.06, len, { seed, radial: 8, tint: [1.4, 1.36, 1.28] }), 0, 0, 0, 0, 0, Math.PI / 2));
  for (let k = 0; k < 3; k++) {
    const bl = 0.4 + r() * 0.8;
    const b = woodCylinder(0.04, 0.015, bl, { seed: seed + k, radial: 5, tint: [1.35, 1.3, 1.22] });
    place(b, (r() - 0.5) * len * 0.7, 0.05, 0, 0, r() * 6, 0.6 + r() * 0.8);
    parts.push(b);
  }
  // root ball on one end
  const root = new THREE.IcosahedronGeometry(0.28, 1);
  const p = root.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.7 + r() * 0.6), p.getY(i) * (0.7 + r() * 0.6), p.getZ(i) * (0.7 + r() * 0.6));
  root.computeVertexNormals();
  place(root, len * 0.5, 0.02, 0);
  const col = new Float32Array(root.attributes.position.count * 3).fill(1.25);
  root.setAttribute('color', new THREE.BufferAttribute(col, 3));
  parts.push(root);
  return merge(parts);
}

function frondLitter() {
  const b = new GeoBuilder();
  const segs = 6;
  const L = 3.2;
  const spine = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    spine.push(new THREE.Vector3(t * L, 0.05 + Math.sin(t * Math.PI) * 0.12, Math.sin(t * 2.5) * 0.2));
  }
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const hw = Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + t)), 0.6) * 0.55;
    for (const s of [-1, 0, 1]) {
      const p = spine[i].clone().add(new THREE.Vector3(0, s === 0 ? 0.04 : -0.02, s * hw));
      b.v(p, new THREE.Vector3(0, 1, 0), t, (s + 1) / 2, [1.5, 1.05, 0.6], [0, 0, 0, 0]);
    }
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k < 2; k++) { const a = i * 3 + k; b.quad(a, a + 3, a + 4, a + 1); }
  return b.build();
}

/** Intentionally placed environmental details: driftwood, coconuts and fronds under palms, a wreck, lookout furniture. */
export class Props {
  constructor({ scene, terrainData, materials, collision, vegetation, textures, interaction }) {
    this.td = terrainData;
    this.group = new THREE.Group();
    this.group.name = 'props';
    scene.add(this.group);
    const M = materials;
    const r = rng(777);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();

    // ---------------------------------------------------------------- driftwood along the high-tide line
    const driftMat = new THREE.MeshStandardMaterial({ map: textures.barkTree, roughness: 0.95, vertexColors: true, color: 0xb9b2a6 });
    patchMaterial(driftMat, { wet: 1, key: 'drift' });
    const driftGeos = [driftwoodGeometry(1), driftwoodGeometry(2), driftwoodGeometry(3)];
    const driftSpots = [];
    for (const [x, z] of terrainData.coastPoly) {
      if (r() > 0.32) continue;
      const nx = x + (r() - 0.5) * 6, nz = z + (r() - 0.5) * 6;
      // move inland onto the dry sand line
      const gx = terrainData.coastAt(nx + 1, nz) - terrainData.coastAt(nx - 1, nz), gz = terrainData.coastAt(nx, nz + 1) - terrainData.coastAt(nx, nz - 1);
      const gl = Math.hypot(gx, gz) || 1;
      const k = 7 + r() * 5;
      const px = nx + (gx / gl) * k, pz = nz + (gz / gl) * k;
      if (Math.hypot(px, pz - 4) < 20) continue;
      const h = terrainData.heightAt(px, pz);
      if (h < 0.5 || h > 3.5) continue;
      driftSpots.push([px, h, pz]);
    }
    // a heap at driftwood point
    for (let i = 0; i < 9; i++) driftSpots.push([-296 + (r() - 0.5) * 16, null, -40 + (r() - 0.5) * 10]);
    driftGeos.forEach((g, gi) => {
      const list = driftSpots.filter((_, i) => i % 3 === gi);
      const mesh = new THREE.InstancedMesh(g, driftMat, list.length);
      list.forEach(([x, y, z], i) => {
        const yy = y ?? terrainData.heightAt(x, z);
        e.set((r() - 0.5) * 0.15, r() * 6.28, (r() - 0.5) * 0.15);
        q.setFromEuler(e);
        const sc = 0.8 + r() * 0.6;
        m4.compose(p.set(x, yy + 0.06, z), q, s.set(sc, sc, sc));
        mesh.setMatrixAt(i, m4);
        if (sc > 1.0) collision.addBox({ x, y: yy + 0.15, z, hx: 1.2 * sc, hy: 0.2, hz: 0.2, yaw: e.y, walkable: true, surface: 'wood' });
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.layers.set(LAYER.DETAIL);
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    });

    // ---------------------------------------------------------------- coconuts + dead fronds under palms
    const palms = vegetation.getInstances('palm');
    const coconutGeo = new THREE.SphereGeometry(0.12, 7, 5);
    coconutGeo.scale(1, 0.85, 1.1);
    const cocoList = [], frondList = [];
    for (const o of palms) {
      const dist = Math.hypot(o.x, o.z);
      if (dist > 330) continue;
      const lean = 2 * o.scale;
      const cx = o.x + Math.cos(o.rot) * lean, cz = o.z - Math.sin(o.rot) * lean;
      const n = r() < 0.6 ? 1 + Math.floor(r() * 2) : 0;
      for (let k = 0; k < n; k++) {
        const x = cx + (r() - 0.5) * 3, z = cz + (r() - 0.5) * 3;
        if (terrainData.heightAt(x, z) < 0.4) continue;
        cocoList.push([x, z]);
      }
      if (r() < 0.55) frondList.push([o.x + (r() - 0.5) * 3, o.z + (r() - 0.5) * 3, r() * 6.28]);
    }
    const coco = new THREE.InstancedMesh(coconutGeo, M.coconut, cocoList.length);
    cocoList.forEach(([x, z], i) => {
      e.set(r() * 3, r() * 6, r() * 3);
      q.setFromEuler(e);
      m4.compose(p.set(x, terrainData.heightAt(x, z) + 0.08, z), q, s.setScalar(0.85 + r() * 0.3));
      coco.setMatrixAt(i, m4);
      coco.setColorAt(i, new THREE.Color().setHSL(0.07 + r() * 0.05, 0.4 + r() * 0.2, 0.18 + r() * 0.15));
    });
    coco.castShadow = true; coco.receiveShadow = true;
    coco.layers.set(LAYER.DETAIL);
    coco.computeBoundingSphere();
    this.group.add(coco);
    const frondMat = new THREE.MeshStandardMaterial({ map: vegetation.leafTextures.palm, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.85 });
    patchMaterial(frondMat, { wet: 0.8, foliage: true, key: 'frondLitter' });
    const fronds = new THREE.InstancedMesh(frondLitter(), frondMat, frondList.length);
    frondList.forEach(([x, z, rot], i) => {
      q.setFromEuler(e.set(0, rot, 0));
      m4.compose(p.set(x, terrainData.heightAt(x, z), z), q, s.setScalar(0.8 + r() * 0.4));
      fronds.setMatrixAt(i, m4);
    });
    fronds.receiveShadow = true;
    fronds.castShadow = true;
    fronds.layers.set(LAYER.DETAIL);
    fronds.computeBoundingSphere();
    this.group.add(fronds);

    // ---------------------------------------------------------------- beached wreck
    const wreck = POIS.find((o) => o.id === 'wreck');
    const ribs = [];
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const half = 1.4 * Math.sin(Math.PI * (0.15 + t * 0.75));
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-half, 1.3, 0), new THREE.Vector3(0, -0.6, 0), new THREE.Vector3(half, 1.3 - (i % 3) * 0.35, 0));
      const g = new THREE.TubeGeometry(curve, 10, 0.07, 5, false);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 2, uv.getY(k) * 0.3);
      g.translate(0, 0, -3 + t * 6);
      ribs.push(g);
    }
    ribs.push(place(woodBox(6.4, 0.18, 0.2, { seed: 5 }), 0, -0.45, 0, 0, Math.PI / 2));
    ribs.push(place(woodBox(3.2, 0.04, 0.25, { seed: 6 }), 0.9, 0.5, -1.2, 0.3, Math.PI / 2 + 0.1, 0.4));
    ribs.push(place(woodBox(2.6, 0.04, 0.22, { seed: 7 }), -1.0, 0.4, 0.8, -0.2, Math.PI / 2 - 0.1, -0.5));
    const wreckMesh = new THREE.Mesh(merge(ribs), M.woodDark);
    wreckMesh.position.set(wreck.x, terrainData.heightAt(wreck.x, wreck.z) - 0.35, wreck.z);
    wreckMesh.rotation.set(0.12, 0.6, 0.18);
    wreckMesh.castShadow = true;
    wreckMesh.receiveShadow = true;
    wreckMesh.layers.set(LAYER.WORLD);
    this.group.add(wreckMesh);
    collision.addBox({ x: wreck.x, y: wreckMesh.position.y + 0.6, z: wreck.z, hx: 1.3, hy: 0.8, hz: 3, yaw: 0.6, surface: 'wood' });

    // ---------------------------------------------------------------- lookout: bench, cairn, sign
    const vy = terrainData.heightAt(VIEWPOINT.x, VIEWPOINT.z);
    const bench = merge([
      place(woodBox(1.8, 0.06, 0.4, { seed: 31 }), 0, 0.45, 0),
      place(woodBox(0.45, 0.08, 0.08, { seed: 32 }), -0.75, 0.22, 0, 0, 0, Math.PI / 2),
      place(woodBox(0.45, 0.08, 0.08, { seed: 33 }), 0.75, 0.22, 0, 0, 0, Math.PI / 2),
    ]);
    const benchMesh = new THREE.Mesh(bench, M.woodDark);
    benchMesh.position.set(VIEWPOINT.x - 1.5, terrainData.heightAt(VIEWPOINT.x - 1.5, VIEWPOINT.z + 2), VIEWPOINT.z + 2);
    benchMesh.rotation.y = -0.6;
    benchMesh.castShadow = true;
    benchMesh.receiveShadow = true;
    benchMesh.layers.set(LAYER.DETAIL);
    this.group.add(benchMesh);
    collision.addBox({ x: benchMesh.position.x, y: benchMesh.position.y + 0.25, z: benchMesh.position.z, hx: 0.9, hy: 0.25, hz: 0.22, yaw: -0.6, walkable: true, surface: 'wood' });
    const cairn = [];
    for (let i = 0; i < 7; i++) {
      const g = new THREE.IcosahedronGeometry(0.22 - i * 0.022, 1);
      g.scale(1.2, 0.6, 1);
      g.translate((r() - 0.5) * 0.06, 0.1 + i * 0.16, (r() - 0.5) * 0.06);
      const col = new Float32Array(g.attributes.position.count * 3).fill(0.85);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      cairn.push(g);
    }
    const cairnMesh = new THREE.Mesh(merge(cairn), M.stone);
    cairnMesh.position.set(VIEWPOINT.x + 1.5, vy, VIEWPOINT.z - 1.0);
    cairnMesh.castShadow = true;
    cairnMesh.layers.set(LAYER.DETAIL);
    this.group.add(cairnMesh);
    const sign = buildSign(M, 'LOOKOUT\nreef line N');
    sign.position.set(VIEWPOINT.x + 2.5, terrainData.heightAt(VIEWPOINT.x + 2.5, VIEWPOINT.z + 3), VIEWPOINT.z + 3);
    sign.rotation.y = 2.4;
    sign.traverse((o) => o.layers.set(LAYER.DETAIL));
    this.group.add(sign);

    // ---------------------------------------------------------------- survey pillar on the ridge overlook
    const over = POIS.find((o) => o.id === 'overlook');
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.2, 8), M.ceramic);
    pillar.position.set(over.x, terrainData.heightAt(over.x, over.z) + 0.55, over.z);
    pillar.castShadow = true;
    pillar.layers.set(LAYER.DETAIL);
    this.group.add(pillar);
    collision.addCylinder({ x: over.x, z: over.z, r: 0.3, y0: pillar.position.y - 1, y1: pillar.position.y + 0.6, surface: 'rock' });
    interaction.add({ object: pillar, name: 'pillar', interactionLabel: 'Read plaque', onInteract: (g) => g.toast('Survey station 3 — triangulation pillar. Elevation scratched out, a date long faded.') });

    // ---------------------------------------------------------------- path marker stakes with rags
    const stakes = [];
    for (const path of terrainData.pathLines) {
      for (let i = 6; i < path.pts.length; i += 9) {
        const [x, z] = path.pts[i];
        const ox = x + 1.4, oz = z;
        const y = terrainData.heightAt(ox, oz);
        stakes.push(place(woodCylinder(0.03, 0.025, 1.1, { seed: i, radial: 5 }), ox, y + 0.45, oz, (r() - 0.5) * 0.1, 0, (r() - 0.5) * 0.1));
      }
    }
    if (stakes.length) {
      const sm = new THREE.Mesh(merge(stakes), M.woodDark);
      sm.castShadow = true;
      sm.layers.set(LAYER.DETAIL);
      this.group.add(sm);
    }
  }
}
