import { Vector3 } from 'three';
import { LayoutBuilder, ll, ROAD_STYLES } from '../layout/LayoutBuilder';
import { defineKit } from '../content/Kit';
import { PLANET_RADIUS } from '../constants';
import { geodesicStep } from '../../core/math/sphere';
import { P } from '../kits/palette';

defineKit('clearing', (c) => {
  // Invisible zero-height collider: keeps vegetation away without blocking anyone.
  c.collider({ type: 'circle', x: 0, z: 0, r: c.params.r ?? 4, h: 0 });
});

defineKit('anchor', (c) => {
  c.anchor('here', 0, c.params.y ?? 0, 0, 0);
});

defineKit('milestone', (c) => {
  const g = c.g;
  g.rbox(0.5, 0.9, 0.3, 0.06, [0, 0.45, 0], '#cfc5b3');
  g.box(0.52, 0.12, 0.32, [0, 0.95, 0], P.amber);
  c.sign(0, 0.5, 0.155, 0.4, 0.45, 0, { text: c.params.text ?? 'B1', bg: '#cfc5b3', fg: P.ink, style: 'plaque', accent: '#a99c86' });
  c.collider({ type: 'box', x: 0, z: 0, hx: 0.25, hz: 0.15, h: 1.0 });
});

/**
 * Whitepaper Woods (north pole), Cold Storage (south pole) and everything along The Chain between
 * districts: relay pylons, milestones, trails, a few benches and message boxes.
 */
export function layoutWilds(L: LayoutBuilder): void {
  const S = ROAD_STYLES;
  const W = L.get('woods').frame;
  const So = L.get('south').frame;
  const C = L.get('city').frame;

  // ---- Trails ------------------------------------------------------------------------------------
  L.road('trail.city-woods', [C.dir(0, 31), C.dir(0, 38), ll(38, 1), ll(50, 4), W.dir(-2, -24), W.dir(0, -12)], S.trail);
  L.road('trail.woods-hub', [ll(60, 18), W.dir(6, -14), W.dir(0, -12), W.dir(-6, -14), ll(64, -8)], S.trail);
  L.road('trail.woods-grotto', [W.dir(0, -12), W.dir(-3, -4), W.dir(-6, 2.5)], S.trail);
  L.road('trail.woods-desk', [W.dir(0, -12), W.dir(6, -6), W.dir(11, 1.5)], S.trail);
  L.road('trail.woods-pole', [W.dir(-3, -4), W.dir(-2, 6), W.dir(0, 16), ll(88, 30), ll(90, 0)], S.trail);
  L.road('trail.woods-camp', [W.dir(-6, -14), W.dir(-11, -9)], S.trail);
  L.road('trail.south', [ll(3.5, -98), ll(-14, -92), ll(-32, -82), ll(-48, -72), ll(-62, -60), So.dir(2, -14), So.dir(1, -5.5)], S.snowpath);
  L.road('trail.pond-south', [C.dir(-20, -50), ll(-46, -24), ll(-60, -34), ll(-70, -44), So.dir(-12, 6), So.dir(-4, 2)], S.snowpath);

  // ---- Whitepaper Woods ------------------------------------------------------------------------------
  L.place('woods', 'grotto', -7.2, 6.4, 200, {}, { id: 'woods.grotto', pad: { hx: 0, hz: 0, round: 5.5, falloff: 3 } });
  L.place('woods', 'clearing', 12, 3.5, 0, { r: 4.5 });
  L.place('woods', 'dev.desk', 12, 3.5, 210, {}, { id: 'woods.devdesk', pad: { hx: 1.5, hz: 1.5 } });
  L.place('woods', 'clearing', -12.4, -8.6, 0, { r: 5 });
  L.place('woods', 'camp', -12.4, -8.6, 40, {}, { id: 'woods.camp', pad: { hx: 3.5, hz: 3.5 } });
  L.place('woods', 'listening.post', 7.5, -16.5, 200, { iid: 'woods.listening.post', title: 'Listening Post — Whitepaper Woods', sign: 'POST 2' }, { id: 'woods.post', pad: { hx: 1.5, hz: 1.5 } });
  L.place('woods', 'clearing', 1, -10.5, 0, { r: 3.5 });
  L.place('woods', 'signpost', 1.6, -10.4, 0, { arms: [{ text: 'GROTTO', rot: Math.PI / 2 + 0.6 }, { text: 'NORTH POLE', rot: Math.PI / 2 + 0.2 }, { text: 'CHAIN CITY', rot: -Math.PI / 2 }, { text: "ALPHA'S CAMP", rot: Math.PI + 0.4 }] });
  L.place('woods', 'bench', -1.2, -9.4, 30, {}, { id: 'woods.bench' });
  const pole = new Vector3(0, 1, 0);
  L.placements.push({ id: 'woods.pole', kind: 'pole.marker', region: 'woods', pos: pole, xAxis: new Vector3(1, 0, 0), up: pole.clone(), forward: new Vector3(0, 0, 1), params: { iid: 'woods.pole', doc: 'pole.north' } });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    L.place('woods', 'mushroom', 15 + Math.cos(a) * 1.6, -8 + Math.sin(a) * 1.6, i * 30, { color: i % 2 ? '#d9584a' : '#f0b04a' });
  }

  // ---- Cold Storage ----------------------------------------------------------------------------------
  L.place('south', 'vault', 0, 0, 20, {}, { id: 'south.vault', pad: { hx: 0, hz: 0, round: 5.5, falloff: 3 } });
  L.place('south', 'igloo', -9, 5, 120, {}, { id: 'south.igloo', pad: { hx: 0, hz: 0, round: 3 } });
  L.place('south', 'snowman', 5.5, 6.5, 210, {}, { id: 'south.snowman' });
  L.place('south', 'signpost', 3, -6, 0, { arms: [{ text: 'COLD STORAGE', rot: Math.PI / 2 }, { text: 'THE CHAIN', rot: -Math.PI / 2 + 0.3 }] });
  L.place('south', 'bench', -2.5, -6.5, 160, {}, { id: 'south.bench' });

  // ---- Relay pylons along The Chain (one between each pair of districts) ---------------------------------
  const ring = L.roads.find((r) => r.id === 'the-chain')!;
  const pylons: { lon: number; id: string; iid?: string }[] = [
    { lon: 36, id: 'pylon.cityhills' },
    { lon: 104, id: 'pylon.hillscoast' },
    { lon: 177, id: 'pylon.coastmining' },
    { lon: -110, id: 'pylon.miningheights' },
    { lon: -42, id: 'pylon.heightscity', iid: 'wilds.pylon.west' },
  ];
  for (const p of pylons) {
    // Find the ring sample closest in longitude, then step 4.5 units to its north side.
    let best = ring.points[0], bestD = Infinity;
    for (const q of ring.points) {
      const lon = (Math.atan2(q.x, q.z) * 180) / Math.PI;
      const d = Math.abs(((lon - p.lon + 540) % 360) - 180);
      if (d < bestD) { bestD = d; best = q; }
    }
    const { pos, xAxis, forward } = sideOf(best, ring.points, 4.6);
    L.placements.push({ id: p.id, kind: 'relay.pylon', region: 'wilds', pos, xAxis, up: pos.clone(), forward, params: { iid: p.iid, sign: 'CHAIN RELAY', prompt: 'Reboot the relay pylon', title: 'Chain Relay — West Link' } });
    L.pads.push({ center: pos, xAxis, zAxis: forward, hx: 0.9, hz: 0.9, falloff: 1.5, priority: 2 });
  }

  // ---- Milestones every ~40 units ---------------------------------------------------------------------
  let n = 1;
  for (let i = 20; i < ring.points.length - 10; i += 40) {
    const { pos, xAxis, forward } = sideOf(ring.points[i], ring.points, -3.4);
    L.placements.push({ kind: 'milestone', region: 'wilds', pos, xAxis, up: pos.clone(), forward, params: { text: `B${n}` } });
    n++;
  }

  // ---- A listening post on Node Heights (for the hidden-signal mission) ----------------------------------
  L.place('heights', 'listening.post', -8, -1.5, 160, { iid: 'heights.listening.post', title: 'Listening Post — Node Heights', sign: 'POST 1' }, { id: 'heights.post', pad: { hx: 1.5, hz: 1.5 } });

  // ---- Anchors for collectible block fragments (placed by gameplay) -----------------------------------------
  L.place('hills', 'anchor', 11, 1.6, 0, {}, { id: 'frag.hills' });
  L.place('coast', 'anchor', 15.4, -33.0, 0, {}, { id: 'frag.coast' });
  L.place('mining', 'anchor', 6.5, 7.8, 0, { y: 2.3 }, { id: 'frag.mining' });
  // Heights and city fragments use kit anchors (institute roof, library steps).
}

/** Position `offset` units to the side of a ring sample (positive = left of travel direction). */
function sideOf(p: Vector3, pts: Vector3[], offset: number): { pos: Vector3; xAxis: Vector3; forward: Vector3 } {
  const i = pts.indexOf(p);
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  const t = b.clone().sub(a);
  t.addScaledVector(p, -t.dot(p)).normalize();
  const side = new Vector3().crossVectors(p, t).normalize();
  const pos = geodesicStep(p, side.clone().multiplyScalar(Math.sign(offset) || 1), Math.abs(offset), PLANET_RADIUS);
  // Face the road.
  const forward = side.clone().multiplyScalar(-Math.sign(offset) || -1);
  forward.addScaledVector(pos, -forward.dot(pos)).normalize();
  const xAxis = new Vector3().crossVectors(pos, forward).normalize();
  return { pos, xAxis, forward };
}
