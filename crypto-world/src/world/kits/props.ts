import { defineKit, KitCtx } from '../content/Kit';
import { GeoBuilder } from '../kit/GeoBuilder';
import { P } from './palette';

export function bench(g: GeoBuilder, color = P.wood, frame = P.ink): void {
  for (const x of [-0.75, 0.75]) {
    g.box(0.08, 0.42, 0.42, [x, 0.21, 0], frame);
    g.box(0.08, 0.5, 0.06, [x, 0.65, -0.2], frame);
  }
  for (let i = 0; i < 3; i++) g.box(1.75, 0.06, 0.13, [0, 0.45, -0.14 + i * 0.15], color);
  for (let i = 0; i < 2; i++) g.box(1.75, 0.12, 0.05, [0, 0.62 + i * 0.17, -0.22], color, { rot: [-0.15, 0, 0] });
}

defineKit('bench', (c) => {
  bench(c.g, c.params.color ?? P.wood);
  c.collider({ type: 'box', x: 0, z: -0.02, hx: 0.85, hz: 0.25, h: 0.5 });
  if (c.params.sit !== false) c.interact({ id: `${c.id}`, kind: 'sit', label: 'Sit', x: 0, y: 0.45, z: 0.1, heading: 0, radius: 1.6 });
});

defineKit('lamppost', (c) => {
  const h = c.params.height ?? 3.2;
  const col = c.params.color ?? P.ink;
  c.g.cyl(0.14, 0.18, 0.25, [0, 0.12, 0], col, { seg: 8 });
  c.g.cyl(0.05, 0.07, h, [0, h / 2, 0], col, { seg: 8 });
  c.g.cyl(0.22, 0.1, 0.12, [0, h + 0.05, 0], col, { seg: 8 });
  c.g.sphere(0.2, [0, h - 0.12, 0], '#fff3d0', { emissive: 1, scale: [1, 1.15, 1] });
  c.g.cone(0.3, 0.22, [0, h + 0.2, 0], col, { seg: 8 });
  c.lamp(0, h, 0, c.params.pool ?? 3.4);
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.15, h });
});

defineKit('streetlamp.double', (c) => {
  const h = 3.6;
  c.g.cyl(0.06, 0.08, h, [0, h / 2, 0], P.ink, { seg: 8 });
  c.g.box(1.6, 0.06, 0.06, [0, h, 0], P.ink);
  for (const x of [-0.75, 0.75]) {
    c.g.cyl(0.18, 0.08, 0.14, [x, h - 0.1, 0], P.ink, { seg: 8 });
    c.g.sphere(0.13, [x, h - 0.22, 0], '#fff3d0', { emissive: 1 });
    c.lamp(x, h, 0, 3);
  }
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.12, h });
});

defineKit('bin', (c) => {
  c.g.cyl(0.25, 0.22, 0.7, [0, 0.35, 0], c.params.color ?? P.deepTeal, { seg: 10 });
  c.g.cyl(0.27, 0.27, 0.06, [0, 0.72, 0], P.ink, { seg: 10 });
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.27, h: 0.75 });
});

defineKit('bollard', (c) => {
  c.g.cyl(0.1, 0.12, 0.6, [0, 0.3, 0], P.stoneDark, { seg: 8 });
  c.g.sphere(0.11, [0, 0.6, 0], P.stoneDark);
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.13, h: 0.65 });
});

defineKit('planter', (c) => {
  const w = c.params.w ?? 1.4;
  c.g.rbox(w, 0.55, w, 0.08, [0, 0.27, 0], c.params.color ?? P.stone);
  c.g.box(w - 0.15, 0.05, w - 0.15, [0, 0.53, 0], '#6b4f36');
  if (c.params.tree) {
    c.g.cyl(0.08, 0.1, 1.2, [0, 1.1, 0], P.woodDark);
    c.g.sphere(0.65, [0, 2.0, 0], P.leaf, { detail: 1, wind: 0.5 });
    c.g.sphere(0.45, [0.25, 2.35, 0.1], P.leafLight, { detail: 1, wind: 0.6 });
  } else {
    for (let i = 0; i < 5; i++) c.g.sphere(0.13, [c.rng.range(-w / 3, w / 3), 0.65, c.rng.range(-w / 3, w / 3)], c.rng.pick(['#f29db0', '#f6d55c', '#ffffff', '#b8a4f2']), { ws: 5, hs: 3, wind: 0.3 });
    c.g.sphere(0.35, [0, 0.6, 0], P.leaf, { detail: 1, scale: [1.4, 0.6, 1.4], wind: 0.2 });
  }
  c.collider({ type: 'box', x: 0, z: 0, hx: w / 2, hz: w / 2, h: c.params.tree ? 2.5 : 0.6 });
});

defineKit('fence', (c) => {
  const len = c.params.len ?? 4;
  const col = c.params.color ?? P.woodLight;
  const n = Math.max(2, Math.round(len / 0.9));
  for (let i = 0; i <= n; i++) c.g.box(0.08, 0.8, 0.08, [-len / 2 + (i * len) / n, 0.4, 0], col);
  c.g.box(len, 0.07, 0.05, [0, 0.55, 0], col);
  c.g.box(len, 0.07, 0.05, [0, 0.25, 0], col);
  if (c.params.collide !== false) c.collider({ type: 'box', x: 0, z: 0, hx: len / 2, hz: 0.1, h: 0.85 });
});

defineKit('railing', (c) => {
  const len = c.params.len ?? 4;
  const col = c.params.color ?? P.metalDark;
  const n = Math.max(2, Math.round(len / 1.2));
  for (let i = 0; i <= n; i++) c.g.cyl(0.035, 0.035, 0.95, [-len / 2 + (i * len) / n, 0.47, 0], col, { seg: 6 });
  c.g.box(len, 0.06, 0.06, [0, 0.95, 0], col);
  c.g.box(len, 0.04, 0.04, [0, 0.5, 0], col);
  c.collider({ type: 'box', x: 0, z: 0, hx: len / 2, hz: 0.08, h: 1 });
});

defineKit('signpost', (c) => {
  c.g.cyl(0.06, 0.07, 2.4, [0, 1.2, 0], P.woodDark, { seg: 6 });
  const arms: { text: string; rot: number }[] = c.params.arms ?? [];
  arms.forEach((a, i) => {
    const y = 2.1 - i * 0.38;
    c.g.pushT([0, y, 0], [0, a.rot, 0]);
    c.g.box(1.3, 0.28, 0.05, [0.62, 0, 0], P.woodLight);
    c.g.pop();
    const cs = Math.cos(a.rot), sn = Math.sin(a.rot);
    c.sign(0.62 * cs, y, -0.62 * sn, 1.2, 0.24, a.rot, { text: a.text, bg: '#c99e72', fg: '#3b2a1d', style: 'banner' }, { double: true, depth: 0.03 });
  });
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.12, h: 2.4 });
});

/** A message box: the planet's mailboxes, used for deliveries. */
defineKit('msgbox', (c) => {
  c.g.cyl(0.06, 0.07, 1.0, [0, 0.5, 0], P.ink, { seg: 6 });
  c.g.rbox(0.55, 0.45, 0.7, 0.1, [0, 1.15, 0], c.params.color ?? P.amber);
  c.g.cyl(0.275, 0.275, 0.7, [0, 1.37, 0], c.params.color ?? P.amber, { rot: [Math.PI / 2, 0, 0], seg: 12 });
  c.g.box(0.3, 0.04, 0.02, [0, 1.25, 0.36], P.ink);
  c.g.box(0.04, 0.3, 0.04, [0.3, 1.4, -0.15], P.red);
  c.g.box(0.18, 0.12, 0.04, [0.3, 1.6, -0.1], P.red);
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.35, h: 1.6 });
});

/** Public info terminal with an animated screen. */
defineKit('terminal', (c) => {
  const col = c.params.color ?? P.navy;
  c.g.rbox(0.7, 0.18, 0.5, 0.06, [0, 0.09, 0], P.stoneDark);
  c.g.rbox(0.42, 1.0, 0.3, 0.08, [0, 0.65, 0], col);
  c.g.rbox(0.9, 0.75, 0.22, 0.08, [0, 1.45, 0.02], col, { rot: [-0.18, 0, 0] });
  c.g.box(0.78, 0.6, 0.02, [0, 1.46, 0.12], '#0d141c', { rot: [-0.18, 0, 0] });
  c.g.box(0.9, 0.06, 0.24, [0, 1.86, 0.06], c.params.accent ?? P.amber, { emissive: 1.4, rot: [-0.18, 0, 0] });
  const tilt = -0.18;
  // Screen plane follows the tilt.
  c.screen(0, 1.46, 0.135 + Math.sin(-tilt) * 0, 0.74, 0.56, 0, c.params.screen ?? 'explorer', c.params.seed);
  c.collider({ type: 'box', x: 0, z: 0, hx: 0.45, hz: 0.25, h: 1.9 });
  if (c.params.label !== false) {
    c.interact({ id: c.params.iid ?? c.id, kind: c.params.kind ?? 'screen', label: c.params.label ?? 'Use terminal', x: 0, y: 1.2, z: 0.6, heading: Math.PI, radius: 1.9, data: { screen: c.params.screen ?? 'explorer', title: c.params.title ?? 'Public Terminal' } });
  }
});

defineKit('desk.computer', (c) => {
  // Desk with a monitor and keyboard; params.screen chooses the display.
  c.g.rbox(1.4, 0.06, 0.7, 0.02, [0, 0.75, 0], c.params.color ?? P.woodLight);
  for (const [x, z] of [[-0.62, -0.28], [0.62, -0.28], [-0.62, 0.28], [0.62, 0.28]]) c.g.box(0.06, 0.75, 0.06, [x, 0.375, z], P.metalDark);
  c.g.rbox(0.66, 0.44, 0.06, 0.03, [0, 1.12, -0.15], P.ink);
  c.g.box(0.06, 0.2, 0.06, [0, 0.88, -0.17], P.ink);
  c.g.box(0.5, 0.03, 0.18, [0, 0.79, 0.12], P.metal);
  c.g.cyl(0.05, 0.04, 0.1, [0.5, 0.83, 0.1], c.rng.pick([P.paper, P.amber, P.red]), { seg: 8 });
  c.screen(0, 1.12, -0.115, 0.58, 0.36, 0, c.params.screen ?? 'terminal', c.params.seed);
  if (c.params.collide !== false) c.collider({ type: 'box', x: 0, z: 0, hx: 0.72, hz: 0.38, h: 1.0 });
});

defineKit('crate', (c) => {
  const s = c.params.size ?? 0.8;
  const col = c.params.color ?? P.woodLight;
  c.g.box(s, s, s, [0, s / 2, 0], col);
  for (const y of [0.08, s - 0.08]) {
    c.g.box(s + 0.02, 0.08, s + 0.02, [0, y, 0], P.woodDark);
  }
  if (c.params.stack) c.g.box(s * 0.8, s * 0.8, s * 0.8, [0.05, s + s * 0.4, 0.03], col, { rot: [0, 0.4, 0] });
  c.collider({ type: 'box', x: 0, z: 0, hx: s / 2, hz: s / 2, h: c.params.stack ? s * 1.8 : s });
});

defineKit('barrel', (c) => {
  const col = c.params.color ?? P.deepTeal;
  c.g.cyl(0.32, 0.32, 0.9, [0, 0.45, 0], col, { seg: 12 });
  for (const y of [0.15, 0.75]) c.g.cyl(0.335, 0.335, 0.06, [0, y, 0], P.metalDark, { seg: 12 });
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.34, h: 0.9 });
});

export function tableSet(c: KitCtx, umbrella?: string): void {
  const g = c.g;
  g.cyl(0.42, 0.42, 0.05, [0, 0.74, 0], P.white, { seg: 14 });
  g.cyl(0.04, 0.04, 0.72, [0, 0.36, 0], P.ink, { seg: 6 });
  g.cyl(0.22, 0.22, 0.04, [0, 0.02, 0], P.ink, { seg: 10 });
  for (const a of [0, Math.PI]) {
    const x = Math.sin(a) * 0.75, z = Math.cos(a) * 0.75;
    g.pushT([x, 0, z], [0, a + Math.PI, 0]);
    g.rbox(0.42, 0.05, 0.4, 0.02, [0, 0.45, 0], P.teal);
    g.rbox(0.42, 0.42, 0.05, 0.02, [0, 0.68, -0.2], P.teal);
    for (const [lx, lz] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]]) g.box(0.035, 0.45, 0.035, [lx, 0.225, lz], P.ink);
    g.pop();
    c.interact({ id: `${c.id}.chair${a ? 2 : 1}`, kind: 'sit', label: 'Sit', x, y: 0.45, z, heading: a + Math.PI, radius: 1.0 });
  }
  if (umbrella) {
    g.cyl(0.03, 0.03, 1.6, [0, 1.5, 0], P.ink, { seg: 6 });
    g.cone(1.25, 0.5, [0, 2.45, 0], umbrella, { seg: 8 });
    g.cone(0.06, 0.12, [0, 2.76, 0], P.ink, { seg: 6 });
  }
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.5, h: 0.8 });
}

defineKit('table.set', (c) => tableSet(c, c.params.umbrella));

defineKit('fountain', (c) => {
  const r = c.params.r ?? 2.4;
  c.g.cyl(r, r + 0.1, 0.55, [0, 0.27, 0], P.stone, { seg: 28 });
  c.g.cyl(r - 0.25, r - 0.25, 0.1, [0, 0.5, 0], '#7cc8d8', { seg: 28, emissive: 0 });
  c.g.cyl(0.4, 0.5, 1.2, [0, 0.9, 0], P.stone, { seg: 14 });
  c.g.cyl(0.9, 0.6, 0.18, [0, 1.5, 0], P.stone, { seg: 16 });
  c.g.cyl(0.75, 0.75, 0.06, [0, 1.58, 0], '#7cc8d8', { seg: 16 });
  c.collider({ type: 'circle', x: 0, z: 0, r: r + 0.1, h: 0.6 });
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.9, h: 1.8 });
});

defineKit('bike', (c) => {
  const col = c.params.color ?? c.rng.pick([P.red, P.teal, P.amber, P.violet]);
  for (const x of [-0.5, 0.5]) c.g.torus(0.3, 0.035, [x, 0.33, 0], P.ink, { rot: [0, Math.PI / 2, 0] });
  c.g.box(0.95, 0.05, 0.05, [0, 0.45, 0], col, { rot: [0, 0, 0.2] });
  c.g.box(0.05, 0.4, 0.05, [-0.15, 0.5, 0], col);
  c.g.box(0.2, 0.05, 0.12, [-0.15, 0.72, 0], P.ink);
  c.g.box(0.05, 0.05, 0.4, [0.45, 0.78, 0], P.ink);
});

defineKit('bulletin', (c) => {
  for (const x of [-0.9, 0.9]) c.g.cyl(0.06, 0.06, 2.1, [x, 1.05, 0], P.woodDark, { seg: 6 });
  c.g.rbox(2.0, 1.2, 0.08, 0.04, [0, 1.35, 0], '#c69b6d');
  c.g.box(1.8, 1.0, 0.02, [0, 1.35, 0.05], '#d9b98e');
  c.g.gable(2.3, 0.35, 0.4, [0, 2.0, 0], P.terracotta);
  const notes = ['#fbf6ec', '#f3d58c', '#a6dcc3', '#e9a8a1', '#c9e2f1'];
  for (let i = 0; i < 7; i++) c.g.box(0.3, 0.35, 0.01, [c.rng.range(-0.7, 0.7), c.rng.range(1.0, 1.7), 0.065], c.rng.pick(notes), { rot: [0, 0, c.rng.range(-0.15, 0.15)] });
  c.collider({ type: 'box', x: 0, z: 0, hx: 1.0, hz: 0.15, h: 2.2 });
  if (c.params.label !== false) c.interact({ id: c.params.iid ?? c.id, kind: 'read', label: c.params.label ?? 'Read the board', x: 0, y: 1.3, z: 0.7, heading: Math.PI, radius: 1.9, data: { doc: c.params.doc ?? 'board.city' } });
});

defineKit('stall', (c) => {
  const w = c.params.w ?? 2.4;
  const col = c.params.color ?? P.red;
  const goods: string = c.params.goods ?? 'fruit';
  for (const [x, z] of [[-w / 2, -0.6], [w / 2, -0.6], [-w / 2, 0.6], [w / 2, 0.6]]) c.g.box(0.08, 2.2, 0.08, [x, 1.1, z], P.woodDark);
  c.g.rbox(w, 0.9, 1.0, 0.04, [0, 0.45, 0.2], P.woodLight);
  c.g.box(w + 0.1, 0.06, 1.1, [0, 0.92, 0.2], P.wood);
  // Striped canopy.
  const stripes = 6;
  for (let i = 0; i < stripes; i++) {
    c.g.box(w / stripes + 0.01, 0.06, 1.7, [-w / 2 + (i + 0.5) * (w / stripes), 2.25, 0.15], i % 2 ? P.white : col, { rot: [0.2, 0, 0] });
  }
  for (let i = 0; i < stripes; i++) c.g.box(w / stripes, 0.25, 0.02, [-w / 2 + (i + 0.5) * (w / stripes), 2.0, 0.98], i % 2 ? P.white : col);
  const g = c.g;
  if (goods === 'fruit') {
    for (let i = 0; i < 14; i++) g.sphere(0.1, [c.rng.range(-w / 2 + 0.2, w / 2 - 0.2), 1.02, c.rng.range(0, 0.5)], c.rng.pick(['#e8644a', '#f2b544', '#9cd06a', '#f29db0']), { ws: 6, hs: 4 });
  } else if (goods === 'gadgets') {
    for (let i = 0; i < 5; i++) g.rbox(0.3, 0.06, 0.2, 0.02, [-w / 2 + 0.35 + i * 0.42, 0.98, 0.3], c.rng.pick([P.ink, P.metal, P.amber]));
    g.rbox(0.4, 0.3, 0.05, 0.02, [0, 1.12, 0.05], P.ink);
  } else if (goods === 'coins') {
    for (let i = 0; i < 9; i++) g.cyl(0.12, 0.12, 0.04, [c.rng.range(-w / 2 + 0.2, w / 2 - 0.2), 0.97 + c.rng.next() * 0.06, c.rng.range(0, 0.5)], P.gold, { seg: 12 });
  } else if (goods === 'fish') {
    for (let i = 0; i < 6; i++) g.sphere(0.1, [-w / 2 + 0.3 + i * 0.35, 0.99, 0.3], '#9fb7c8', { scale: [2.2, 0.6, 0.8] });
  } else if (goods === 'books') {
    for (let i = 0; i < 8; i++) g.box(0.12, 0.3, 0.22, [-w / 2 + 0.3 + i * 0.25, 1.1, 0.35], c.rng.pick([P.red, P.teal, P.amber, P.violet, P.navy]));
  }
  if (c.params.sign) c.sign(0, 1.95, 1.0, w * 0.75, 0.32, 0, { text: c.params.sign, bg: P.paper, fg: P.ink, style: 'banner' });
  c.collider({ type: 'box', x: 0, z: 0.2, hx: w / 2 + 0.05, hz: 0.55, h: 2.3 });
  c.anchor('vendor', 0, 0, -0.6, Math.PI);
});

defineKit('umbrella', (c) => {
  const col = c.params.color ?? c.rng.pick([P.coral, P.teal, P.amber, P.violet]);
  c.g.cyl(0.03, 0.03, 2.1, [0, 1.05, 0], P.paper, { seg: 6, rot: [0.1, 0, 0] });
  c.g.cone(1.2, 0.45, [0, 2.15, 0.1], col, { seg: 8 });
  c.g.cone(1.21, 0.46, [0, 2.15, 0.1], P.white, { seg: 8, scale: [0.4, 1.02, 0.4] });
  if (c.params.towel) c.g.box(0.7, 0.02, 1.6, [0.6, 0.02, 0.4], c.params.towel);
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.1, h: 2 });
});

defineKit('flagpole', (c) => {
  c.g.cyl(0.05, 0.07, 6, [0, 3, 0], P.metal, { seg: 8 });
  c.g.sphere(0.1, [0, 6.05, 0], P.gold);
  const col = c.params.color ?? P.amber;
  for (let i = 0; i < 4; i++) c.g.box(0.4, 0.9, 0.03, [0.22 + i * 0.4, 5.4, 0], i % 2 ? col : P.white, { wind: 0.3 + i * 0.25 });
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.1, h: 6 });
});

defineKit('powerpole', (c) => {
  c.g.cyl(0.1, 0.13, 6.5, [0, 3.25, 0], P.woodDark, { seg: 7 });
  c.g.box(2, 0.12, 0.12, [0, 6.0, 0], P.woodDark);
  for (const x of [-0.85, 0, 0.85]) c.g.cyl(0.05, 0.06, 0.2, [x, 6.15, 0], '#d9e6ef', { seg: 6 });
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.15, h: 6.5 });
});

defineKit('statue', (c) => {
  c.g.rbox(1.4, 1.2, 1.4, 0.06, [0, 0.6, 0], P.stone);
  c.g.rbox(1.6, 0.15, 1.6, 0.04, [0, 1.25, 0], P.stoneDark);
  // Abstract figure holding up a block.
  c.g.cyl(0.25, 0.32, 1.4, [0, 2.0, 0], '#b8a37a');
  c.g.sphere(0.28, [0, 2.95, 0], '#b8a37a');
  c.g.box(0.12, 0.9, 0.12, [0.3, 3.1, 0], '#b8a37a', { rot: [0, 0, -0.3] });
  c.g.rbox(0.55, 0.55, 0.55, 0.05, [0.48, 3.75, 0], P.gold, { rot: [0.4, 0.6, 0.2] });
  c.collider({ type: 'box', x: 0, z: 0, hx: 0.8, hz: 0.8, h: 4 });
});

defineKit('hydrant', (c) => {
  c.g.cyl(0.13, 0.15, 0.55, [0, 0.27, 0], P.red, { seg: 10 });
  c.g.sphere(0.14, [0, 0.58, 0], P.red);
  c.g.cyl(0.05, 0.05, 0.38, [0, 0.38, 0], P.red, { seg: 6, rot: [0, 0, Math.PI / 2] });
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.18, h: 0.65 });
});
