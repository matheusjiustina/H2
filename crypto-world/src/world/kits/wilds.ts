import { defineKit } from '../content/Kit';
import { P } from './palette';
import { lattice } from './heights';

/**
 * Whitepaper Grotto: a hollow ringed by towering boulders, open to the sky, entered through a
 * narrow gap. Inside: a history mural carved into the stone and a Genesis-era computer.
 */
defineKit('grotto', (c) => {
  const g = c.g;
  const R = 4.6;
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.32) continue; // entrance gap at +z... (a≈0 → +x)
    const x = Math.sin(a) * R, z = Math.cos(a) * R;
    if (z > R * 0.9) continue; // entrance at +z
    const h = 4 + c.rng.range(0, 2.5);
    g.sphere(1.0, [x, h * 0.45, z], c.rng.pick(['#9d9588', '#8f877b', '#a8a092']), {
      detail: 0, flat: true, scale: [1.5, h * 0.55, 1.4], rot: [c.rng.range(-0.15, 0.15), a, c.rng.range(-0.15, 0.15)],
    });
    g.sphere(0.8, [x * 1.08, h * 0.95, z * 1.08], c.rng.pick(['#9d9588', '#b3ab9d']), { detail: 0, flat: true, scale: [1.3, 0.6, 1.2], rot: [0, a * 2, 0] });
    c.collider({ type: 'box', x, z, hx: 1.2, hz: 1.2, h, rot: a, camera: true });
  }
  // Moss and ferns on the floor.
  for (let i = 0; i < 10; i++) c.grass.cone(0.12, 0.5, [c.rng.range(-2.5, 2.5), 0.25, c.rng.range(-2.5, 1.5)], '#5f8f45', { seg: 3, open: true, wind: 0.3, windByHeight: 0.5 });
  // History mural: a flat carved slab at the back.
  g.box(4.2, 2.6, 0.4, [0, 1.5, -R + 0.9], '#b9b1a3');
  c.sign(0, 1.55, -R + 1.11, 3.9, 2.3, 0, { text: 'THE CHAIN REMEMBERS', sub: 'genesis · pizza · halvings · forks · merges', bg: '#b9b1a3', fg: '#4a4237', style: 'plaque', accent: '#8a7f6d', icon: 'chain' });
  c.collider({ type: 'box', x: 0, z: -R + 0.9, hx: 2.1, hz: 0.25, h: 2.8 });
  c.interact({ id: 'secret.mural', kind: 'secret', label: 'Study the carved mural', x: 0, y: 1.4, z: -R + 2.2, heading: Math.PI, radius: 1.8, data: { secret: 'mural' } });
  // Genesis-era computer on a stone shelf.
  g.rbox(1.4, 0.8, 0.8, 0.05, [-2.2, 0.4, -1.4], '#8f877b');
  g.rbox(0.7, 0.55, 0.6, 0.06, [-2.2, 1.1, -1.4], '#e2d8c0');
  g.box(0.5, 0.38, 0.02, [-2.2 + 0.0, 1.12, -1.1], '#203a2a', { emissive: 1.6 });
  g.box(0.6, 0.05, 0.25, [-2.2, 0.83, -0.95], '#d6ccb4');
  c.collider({ type: 'box', x: -2.2, z: -1.4, hx: 0.75, hz: 0.45, h: 1.4 });
  c.interact({ id: 'secret.genesis-computer', kind: 'secret', label: 'Boot the ancient computer', x: -2.0, y: 1.0, z: -0.2, heading: Math.PI, radius: 1.5, data: { secret: 'genesis-computer' } });
  c.anchor('inside', 0, 0, 0, 0);
  c.anchor('entrance', 0, 0, R + 1.5, 0);
});

defineKit('dev.desk', (c) => {
  const g = c.g;
  g.rbox(1.5, 0.06, 0.75, 0.02, [0, 0.75, 0], '#8b6f4e');
  for (const [x, z] of [[-0.66, -0.3], [0.66, -0.3], [-0.66, 0.3], [0.66, 0.3]]) g.box(0.06, 0.75, 0.06, [x, 0.375, z], '#6b5236');
  // Open laptop, cold coffee, energy-drink pyramid, sticky notes, a hoodie on the chair.
  g.box(0.5, 0.02, 0.34, [0, 0.79, 0.1], '#9aa3ad');
  g.box(0.5, 0.34, 0.02, [0, 0.96, -0.08], '#9aa3ad', { rot: [-0.2, 0, 0] });
  c.screen(0, 0.96, -0.065, 0.44, 0.28, 0, 'terminal', 'devdesk', 1);
  g.cyl(0.05, 0.045, 0.1, [0.5, 0.83, 0.15], P.paper, { seg: 8 });
  for (let i = 0; i < 6; i++) g.cyl(0.035, 0.035, 0.12, [-0.55 + (i % 3) * 0.08 + (i >= 3 ? 0.04 : 0), 0.84 + (i >= 3 ? 0.12 : 0), -0.2], i % 2 ? '#58d6a0' : '#f0b04a', { seg: 6 });
  for (let i = 0; i < 5; i++) g.box(0.1, 0.1, 0.005, [-0.18 + i * 0.09, 1.08 + (i % 2) * 0.05, -0.1], c.rng.pick(['#f6d55c', '#a6dcc3', '#f29db0']), { rot: [-0.2, 0, c.rng.range(-0.3, 0.3)] });
  g.pushT([0, 0, 0.75], [0, Math.PI + 0.3, 0]);
  g.box(0.5, 0.06, 0.5, [0, 0.5, 0], '#3b444f');
  g.box(0.5, 0.6, 0.06, [0, 0.82, -0.24], '#3b444f');
  g.cyl(0.04, 0.04, 0.5, [0, 0.25, 0], P.ink, { seg: 6 });
  g.rbox(0.48, 0.3, 0.2, 0.08, [0, 0.95, -0.2], '#6a5acd');
  g.pop();
  c.collider({ type: 'box', x: 0, z: 0, hx: 0.78, hz: 0.4, h: 1.1 });
  c.interact({ id: 'secret.devdesk', kind: 'secret', label: 'Look at the abandoned desk', x: 0.3, y: 1.0, z: -0.95, heading: 0, radius: 1.5, data: { secret: 'devdesk' } });
});

defineKit('camp', (c) => {
  const g = c.g;
  // Tent.
  g.pushT([-1.8, 0, -0.6], [0, 0.3, 0]);
  g.gable(2.4, 1.8, 2.8, [0, 0, 0], '#e07a4f');
  g.gable(0.9, 1.0, 0.05, [0, 0, 1.42], '#5b3a2a');
  g.pop();
  c.collider({ type: 'box', x: -1.8, z: -0.6, hx: 1.3, hz: 1.5, h: 1.9, rot: 0.3 });
  // Campfire with flickering flame (bob).
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    g.sphere(0.18, [1.4 + Math.cos(a) * 0.55, 0.1, 1.0 + Math.sin(a) * 0.55], '#8f877b', { detail: 0, flat: true });
  }
  for (let i = 0; i < 3; i++) g.cyl(0.07, 0.07, 0.9, [1.4, 0.15, 1.0], '#6b4a30', { rot: [0, (i / 3) * Math.PI, Math.PI / 2], seg: 6 });
  c.bob((b) => {
    b.cone(0.28, 0.7, [1.4, 0.5, 1.0], '#ffb347', { seg: 6, emissive: 1.9 });
    b.cone(0.16, 0.45, [1.4, 0.45, 1.0], '#fff1a8', { seg: 6, emissive: 2.0 });
  }, 0.04, 9);
  c.lamp(1.4, 0.4, 1.0, 3.2);
  c.collider({ type: 'circle', x: 1.4, z: 1.0, r: 0.75, h: 0.6 });
  // Log seats.
  for (const [x, z, r] of [[1.4, 2.6, 0], [3.0, 1.0, Math.PI / 2]] as [number, number, number][]) {
    g.cyl(0.25, 0.25, 1.4, [x, 0.25, z], '#7a5234', { rot: [0, r, Math.PI / 2], seg: 8 });
    c.collider({ type: 'box', x, z, hx: r ? 0.3 : 0.7, hz: r ? 0.7 : 0.3, h: 0.5 });
    c.interact({ id: `${c.id}.log${x}`, kind: 'sit', label: 'Sit by the fire', x, y: 0.5, z, heading: Math.atan2(1.4 - x, 1.0 - z), radius: 1.2 });
  }
  // Map board, backpack, telescope.
  g.box(1.3, 0.9, 0.06, [0.2, 1.3, -1.9], '#d9b98e');
  g.box(0.06, 1.8, 0.06, [-0.4, 0.9, -1.9], '#6b4a30');
  g.box(0.06, 1.8, 0.06, [0.8, 0.9, -1.9], '#6b4a30');
  c.sign(0.2, 1.3, -1.86, 1.2, 0.8, 0, { text: 'MAP', sub: 'X = abandoned stuff', bg: '#e8d5ae', fg: '#6b4a30', style: 'chalk' });
  g.rbox(0.45, 0.6, 0.3, 0.1, [-0.4, 0.3, 1.6], '#4f7a5a');
  g.cyl(0.03, 0.04, 1.2, [2.6, 0.6, -0.8], P.ink, { seg: 6 });
  g.cyl(0.08, 0.06, 0.7, [2.6, 1.25, -0.6], P.paper, { rot: [1.1, 0, 0], seg: 8 });
  c.collider({ type: 'box', x: 0.2, z: -1.9, hx: 0.7, hz: 0.1, h: 1.8 });
  c.anchor('alpha', 2.2, 0, 2.2, Math.PI * 1.25);
  c.interact({ id: 'woods.camp.map', kind: 'read', label: "Read Alpha's map", x: 0.2, y: 1.2, z: -1.0, heading: Math.PI, radius: 1.5, data: { doc: 'camp.map' } });
});

defineKit('listening.post', (c) => {
  const g = c.g;
  g.rbox(1.6, 0.4, 1.6, 0.05, [0, 0.2, 0], '#8e8578');
  lattice(g, 5, 1.2, 0.4, '#9aa6b2');
  g.sphere(0.7, [0, 5.4, 0.3], P.paper, { scale: [1, 1, 0.35], rot: [0.7, 0, 0] });
  g.sphere(0.1, [0, 6.1, 0], P.red, { emissive: 2, ws: 6, hs: 4 });
  g.rbox(0.9, 1.0, 0.5, 0.05, [0, 0.7, 0.95], '#7f8d9a');
  g.box(0.7, 0.4, 0.02, [0, 0.95, 1.21], '#0d141c');
  c.screen(0, 0.95, 1.225, 0.64, 0.36, 0, 'signal', 'post', 1);
  c.collider({ type: 'box', x: 0, z: 0.3, hx: 0.85, hz: 1.0, h: 5.5 });
  c.interact({ id: c.params.iid ?? c.id, kind: 'mission', label: 'Tune the listening post', x: 0, y: 1.0, z: 1.9, heading: Math.PI, radius: 1.6, data: { screen: 'signal', title: c.params.title ?? 'Listening Post' } });
  if (c.params.sign) c.sign(0, 0.35, 1.215, 0.8, 0.2, 0, { text: c.params.sign, bg: '#f0b04a', fg: P.ink, style: 'banner' });
});

defineKit('vault', (c) => {
  const g = c.g;
  // Snow mound with a steel door.
  g.sphere(1, [0, 0, -1.4], P.snow, { ws: 16, hs: 8, scale: [5, 3.4, 4] });
  g.sphere(1, [-2.6, 0.2, -2.4], '#e8eef2', { ws: 12, hs: 6, scale: [2.4, 2.2, 2.2] });
  g.rbox(3.0, 3.0, 1.4, 0.1, [0, 1.5, 1.8], '#c9d3db');
  g.cyl(1.15, 1.15, 0.3, [0, 1.5, 2.55], '#8e9aa6', { rot: [Math.PI / 2, 0, 0], seg: 24 });
  g.cyl(0.95, 0.95, 0.12, [0, 1.5, 2.72], '#aab6c2', { rot: [Math.PI / 2, 0, 0], seg: 24 });
  for (let i = 0; i < 6; i++) g.box(0.12, 0.7, 0.1, [Math.cos((i / 6) * Math.PI * 2) * 0.45, 1.5 + Math.sin((i / 6) * Math.PI * 2) * 0.45, 2.8], '#5b6672', { rot: [0, 0, (i / 6) * Math.PI * 2] });
  g.cyl(0.18, 0.18, 0.2, [0, 1.5, 2.85], '#5b6672', { rot: [Math.PI / 2, 0, 0], seg: 12 });
  g.rbox(0.4, 0.55, 0.12, 0.04, [1.3, 1.4, 2.6], '#3b444f');
  g.box(0.3, 0.2, 0.02, [1.3, 1.52, 2.67], '#203a2a', { emissive: 1.5 });
  c.sign(0, 3.3, 2.52, 2.8, 0.42, 0, { text: 'COLD STORAGE', sub: 'kept offline · kept safe', bg: '#5b6672', fg: P.paper, style: 'banner' });
  c.collider({ type: 'circle', x: 0, z: -1.4, r: 4.2, h: 3.4 });
  c.collider({ type: 'box', x: 0, z: 1.8, hx: 1.6, hz: 0.8, h: 3.1 });
  c.interact({ id: 'secret.vault', kind: 'secret', label: 'Try the vault keypad', x: 1.1, y: 1.3, z: 3.6, heading: Math.PI, radius: 1.6, data: { secret: 'vault' } });
});

defineKit('igloo', (c) => {
  const g = c.g;
  g.sphere(1, [0, 0, 0], P.snow, { ws: 16, hs: 8, scale: [2.2, 1.9, 2.2] });
  for (let i = 0; i < 4; i++) g.torus(2.2 - i * 0.18, 0.025, [0, 0.4 + i * 0.4, 0], '#d7e3ea', { rot: [Math.PI / 2, 0, 0] });
  g.cyl(0.8, 0.8, 1.6, [0, 0.6, 2.2], P.snow, { rot: [Math.PI / 2, 0, 0], seg: 12 });
  g.cyl(0.55, 0.55, 0.1, [0, 0.6, 3.02], '#2b3a4a', { rot: [Math.PI / 2, 0, 0], seg: 12 });
  c.collider({ type: 'circle', x: 0, z: 0, r: 2.2, h: 2 });
  c.collider({ type: 'box', x: 0, z: 2.2, hx: 0.85, hz: 0.8, h: 1.4 });
});

defineKit('snowman', (c) => {
  const g = c.g;
  g.sphere(0.65, [0, 0.55, 0], P.snow, { ws: 12, hs: 8 });
  g.sphere(0.48, [0, 1.4, 0], P.snow, { ws: 12, hs: 8 });
  g.sphere(0.34, [0, 2.05, 0], P.snow, { ws: 12, hs: 8 });
  g.cone(0.06, 0.3, [0, 2.07, 0.45], '#e8823a', { rot: [Math.PI / 2, 0, 0], seg: 6 });
  for (const x of [-0.12, 0.12]) g.sphere(0.04, [x, 2.15, 0.3], P.ink, { ws: 5, hs: 3 });
  g.cyl(0.26, 0.26, 0.3, [0, 2.45, 0], P.ink, { seg: 10 });
  g.cyl(0.4, 0.4, 0.04, [0, 2.31, 0], P.ink, { seg: 10 });
  g.cyl(0.36, 0.36, 0.12, [0, 1.75, 0], P.red, { seg: 10 });
  // A tiny hardware wallet, held proudly.
  g.box(0.04, 0.7, 0.04, [0.55, 1.5, 0.1], '#6b4a30', { rot: [0, 0, -0.9] });
  g.rbox(0.18, 0.28, 0.05, 0.02, [0.85, 1.72, 0.12], P.ink);
  g.box(0.12, 0.08, 0.01, [0.85, 1.76, 0.15], '#58d6a0', { emissive: 1.6 });
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.65, h: 2.6 });
  c.interact({ id: 'south.snowman', kind: 'read', label: 'Say hello to the snowman', x: 0, y: 1.2, z: 1.3, heading: Math.PI, radius: 1.5, data: { doc: 'snowman' } });
});
