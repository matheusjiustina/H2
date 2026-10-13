import { defineKit } from '../content/Kit';
import { GeoBuilder } from '../kit/GeoBuilder';
import { building } from './buildings';
import { P } from './palette';
import { tableSet } from './props';

/** Long wooden pier on piles with a lighthouse at the end. Local +z points out to sea. */
defineKit('pier', (c) => {
  const g = c.g;
  const len = c.params.len ?? 22;
  const w = 2.6;
  const deck = 0.0;
  const piles = Math.round(len / 2.2);
  g.box(w, 0.22, len, [0, deck - 0.11, len / 2], P.woodLight);
  for (let i = 0; i < len / 0.5; i++) g.box(w, 0.02, 0.04, [0, deck + 0.005, 0.25 + i * 0.5], P.wood);
  for (let i = 0; i <= piles; i++) {
    for (const x of [-w / 2 + 0.15, w / 2 - 0.15]) g.cyl(0.14, 0.16, 4, [x, deck - 2.1, (i * len) / piles], P.woodDark, { seg: 7 });
  }
  // Railings with posts and lamps.
  for (const s of [-1, 1]) {
    for (let i = 0; i <= piles; i++) g.box(0.1, 1.0, 0.1, [s * (w / 2 - 0.05), deck + 0.5, (i * len) / piles], P.woodDark);
    g.box(0.08, 0.08, len, [s * (w / 2 - 0.05), deck + 1.0, len / 2], P.woodDark);
    g.box(0.06, 0.06, len, [s * (w / 2 - 0.05), deck + 0.55, len / 2], P.woodDark);
    c.collider({ type: 'box', x: s * (w / 2 - 0.05), z: len / 2 + 1, hx: 0.1, hz: len / 2 - 1, h: 1.05, y0: deck - 0.5 });
  }
  for (let i = 1; i < 4; i++) {
    const z = (i * len) / 4;
    g.cyl(0.05, 0.06, 2.6, [w / 2 - 0.05, deck + 1.3, z], P.ink, { seg: 6 });
    g.sphere(0.15, [w / 2 - 0.05, deck + 2.65, z], '#fff3d0', { emissive: 1, ws: 8, hs: 6 });
    c.lamp(w / 2 - 0.05, deck + 2.6, z, 2.6);
  }
  c.surface({ x: 0, z: len / 2, hx: w / 2, hz: len / 2 + 0.3, y0: deck, y1: deck, material: 'wood' });
  // End platform.
  const ez = len + 2.6;
  g.box(6.4, 0.25, 5.6, [0, deck - 0.12, ez], P.woodLight);
  for (const [x, z] of [[-3, -2.6], [3, -2.6], [-3, 2.6], [3, 2.6], [0, 2.6], [-3, 0], [3, 0]]) g.cyl(0.18, 0.2, 4, [x, deck - 2.1, ez + z], P.woodDark, { seg: 7 });
  c.surface({ x: 0, z: ez, hx: 3.2, hz: 2.8, y0: deck, y1: deck, material: 'wood' });
  for (const [x, z, hx, hz] of [[-3.15, ez, 0.08, 2.8], [3.15, ez, 0.08, 2.8], [0, ez + 2.75, 3.2, 0.08], [-2.1, ez - 2.75, 1.05, 0.08], [2.1, ez - 2.75, 1.05, 0.08]] as [number, number, number, number][]) {
    c.collider({ type: 'box', x, z, hx, hz, h: 1.05, y0: deck - 0.5 });
    g.box(hx * 2 + 0.05, 0.08, hz * 2 + 0.05, [x, deck + 1.0, z], P.woodDark);
    g.box(hx * 2 + 0.05, 0.06, hz * 2 + 0.05, [x, deck + 0.55, z], P.woodDark);
  }
  // Lighthouse.
  const lz = ez + 0.8;
  g.cyl(1.3, 1.6, 0.5, [-1.2, deck + 0.25, lz], P.stone, { seg: 16 });
  const bands = 6;
  for (let i = 0; i < bands; i++) g.cyl(1.25 - i * 0.07, 1.3 - i * 0.07, 1.2, [-1.2, deck + 1.1 + i * 1.2, lz], i % 2 ? P.red : P.paper, { seg: 16 });
  const top = deck + 0.5 + bands * 1.2;
  g.cyl(1.2, 1.2, 0.2, [-1.2, top + 0.1, lz], P.ink, { seg: 16 });
  g.cyl(0.75, 0.75, 1.0, [-1.2, top + 0.7, lz], '#fff1c6', { seg: 12, emissive: 1.3 });
  g.cone(0.95, 0.8, [-1.2, top + 1.6, lz], P.red, { seg: 12 });
  g.box(0.8, 1.6, 0.1, [-1.2, deck + 1.1, lz + 1.38], P.navy);
  c.spin((s) => {
    s.box(0.25, 0.25, 3.4, [0, 0, 0], '#fff6d8', { emissive: 1.9 });
  }, [-1.2, top + 0.7, lz], [0, 1, 0], 1.2);
  c.collider({ type: 'circle', x: -1.2, z: lz, r: 1.65, h: top + 2 });
  c.anchor('beacon', -1.2, top + 2.2, lz);
  c.anchor('end', 1.4, deck, ez + 1.0, 0);
  c.anchor('mid', 0, deck, len * 0.5, Math.PI);
  c.interact({ id: 'coast.pier.bench', kind: 'sit', label: 'Sit on the pier edge', x: 1.6, y: deck + 0.05, z: ez + 2.2, heading: 0, radius: 1.2 });
  c.interact({ id: 'coast.lighthouse.door', kind: 'read', label: 'Read the lighthouse log', x: -1.2, y: 1.0, z: lz + 2.0, heading: Math.PI, radius: 1.4, data: { doc: 'lighthouse.log' } });
});

defineKit('boat', (c) => {
  const col = c.params.color ?? c.rng.pick([P.red, P.teal, P.amber, P.paper, P.navy]);
  const len = c.params.len ?? c.rng.range(3.2, 4.4);
  c.bob((b) => {
    b.sphere(1, [0, 0.15, 0], col, { ws: 12, hs: 6, scale: [0.85, 0.5, len / 2] });
    b.box(1.5, 0.12, len * 0.92, [0, 0.42, 0], P.woodLight);
    b.box(1.0, 0.25, 0.25, [0, 0.55, -0.2], P.woodDark);
    if (c.params.sail) {
      b.cyl(0.05, 0.05, 3.4, [0, 2.0, 0.3], P.woodDark, { seg: 6 });
      b.prism([[0, 0], [0, 1.7], [1.3, 0]], 0.03, [0.02, 0.6, 0.3], P.paper, { rot: [0, Math.PI / 2, 0] });
    } else {
      b.rbox(0.9, 0.7, 1.0, 0.08, [0, 0.85, len * 0.18], P.paper);
      b.box(0.8, 0.3, 0.05, [0, 1.0, len * 0.18 + 0.5], P.glass, { emissive: 0.7 });
    }
  }, 0.12, 1.1);
  c.collider({ type: 'box', x: 0, z: 0, hx: 0.9, hz: len / 2, h: 1.4, y0: -0.5 });
});

defineKit('beach.hut', (c) => {
  const g = c.g;
  const col = c.params.wall ?? c.rng.pick([P.mint, P.rose, P.butter, P.powder, P.lavender, P.peach]);
  const w = 3.2, d = 3.0, h = 2.5, lift = 0.6;
  for (const [x, z] of [[-1.4, -1.3], [1.4, -1.3], [-1.4, 1.3], [1.4, 1.3]]) g.box(0.16, lift + 0.4, 0.16, [x, (lift + 0.4) / 2 - 0.3, z], P.woodDark);
  g.box(w + 0.3, 0.15, d + 1.2, [0, lift, 0.5], P.woodLight);
  for (let i = 0; i < 9; i++) g.box(w / 9 - 0.02, h, d, [-w / 2 + (i + 0.5) * (w / 9), lift + h / 2, 0], i % 2 ? col : P.paper);
  g.box(0.9, 1.8, 0.08, [0, lift + 0.95, d / 2 + 0.03], P.woodDark);
  g.pushT([0, lift + h, 0]);
  g.gable(w + 0.2, 1.1, d + 0.4, [0, 0, 0], col);
  const ang = Math.atan2(1.1, (w + 0.2) / 2);
  for (const s of [-1, 1]) g.box(Math.hypot((w + 0.2) / 2, 1.1) + 0.3, 0.1, d + 0.9, [s * ((w + 0.2) / 4 + 0.05), 0.6, 0.15], c.params.roof ?? P.paper, { rot: [0, 0, -s * ang] });
  g.pop();
  for (let i = 0; i < 3; i++) g.box(1.0, 0.12, 0.3, [0, lift - 0.2 - i * 0.2, d / 2 + 1.2 + i * 0.3], P.woodLight);
  c.collider({ type: 'box', x: 0, z: 0, hx: w / 2 + 0.1, hz: d / 2 + 0.1, h: lift + h + 1.1, camera: true });
  if (c.params.sign) c.sign(0, lift + h + 0.45, d / 2 + 0.25, 2.0, 0.4, 0, { text: c.params.sign, bg: P.paper, fg: P.ink, style: 'banner' });
  c.anchor('door', 0, 0, d / 2 + 2.2, 0);
});

defineKit('gallery', (c) => {
  const g = c.g;
  const w = 9, d = 6.5, h = 4.6;
  g.rbox(w + 0.4, 0.8, d + 0.4, 0.05, [0, -0.25, 0], P.stoneDark);
  g.rbox(w, h, d, 0.06, [0, h / 2 + 0.1, 0], P.paper);
  // Cantilevered roof slab and glass front.
  g.rbox(w + 1.6, 0.4, d + 1.2, 0.05, [0, h + 0.3, 0.5], P.white);
  g.box(w - 1.2, h - 0.6, 0.08, [0, h / 2 + 0.1, d / 2 + 0.02], P.glass, { emissive: 0.75 });
  for (let i = 0; i <= 4; i++) g.box(0.1, h - 0.6, 0.12, [-(w - 1.2) / 2 + (i * (w - 1.2)) / 4, h / 2 + 0.1, d / 2 + 0.04], P.ink);
  // Artworks visible behind glass + one outside.
  for (let i = 0; i < 3; i++) {
    g.box(1.6, 1.6, 0.1, [-2.6 + i * 2.6, 2.5, -d / 2 + 0.6], P.ink);
    c.screen(-2.6 + i * 2.6, 2.5, -d / 2 + 0.66, 1.4, 1.4, 0, 'gallery', `gallery-${i}`, 1);
  }
  g.box(0.1, 0.12, 0.1, [0, 0, 0], P.ink);
  c.sign(0, h + 0.3, d / 2 + 1.12, 5.4, 0.36, 0, { text: 'FLOOR PRICE GALLERY', bg: P.white, fg: P.ink, style: 'banner' });
  // Plinth with the "Diamond Hand" sculpture.
  g.rbox(1.2, 1.0, 1.2, 0.05, [3.6, 0.5, d / 2 + 2.4], P.white);
  g.sphere(0.45, [3.6, 1.45, d / 2 + 2.4], '#9fd3e8', { detail: 0, flat: true, emissive: 1.15 });
  for (let i = 0; i < 4; i++) g.box(0.12, 0.45, 0.12, [3.3 + i * 0.2, 1.95, d / 2 + 2.4], '#9fd3e8', { emissive: 1.15, rot: [0, 0, (i - 1.5) * 0.12] });
  c.collider({ type: 'box', x: 3.6, z: d / 2 + 2.4, hx: 0.6, hz: 0.6, h: 2.2 });
  c.collider({ type: 'box', x: 0, z: 0, hx: w / 2 + 0.2, hz: d / 2 + 0.2, h: h + 0.6, camera: true });
  c.anchor('door', -3.4, 0, d / 2 + 1.0, 0);
  c.anchor('display', 0, 0, d / 2 + 1.4, Math.PI);
  c.interact({ id: 'coast.gallery.display', kind: 'mission', label: 'Examine the empty display', x: 1.2, y: 1.4, z: d / 2 + 1.0, heading: Math.PI, radius: 1.8, data: { title: 'Floor Price Gallery' } });
  c.interact({ id: 'coast.gallery.sculpture', kind: 'read', label: 'Read the sculpture label', x: 3.6, y: 1.0, z: d / 2 + 3.4, heading: Math.PI, radius: 1.4, data: { doc: 'gallery.sculpture' } });
});

defineKit('cafe.shack', (c) => {
  const g = c.g;
  const w = 5.5, d = 4;
  building(c, { w, d, floors: 1, floorH: 2.8, wall: P.mint, trim: P.paper, roof: 'shed', roofColor: P.teal, base: P.woodDark, windows: { style: 'square', per: 2, lit: 0.8, sides: true }, door: { x: -1.8, color: P.amber }, shopfront: { color: P.woodDark, w: 2.4 }, awning: P.coral,
    sign: { text: 'THE SHILL SHACK', sub: 'smoothies · rumours · alpha', bg: P.coral, fg: P.paper, icon: 'cup', accent: P.butter, w: 3.8, h: 0.6, y: 3.3 } });
  // Counter with stools out front.
  g.rbox(3.0, 1.0, 0.6, 0.05, [0.6, 0.5, d / 2 + 1.0], P.woodLight);
  for (let i = 0; i < 3; i++) {
    g.cyl(0.22, 0.22, 0.08, [-0.4 + i * 1.0, 0.7, d / 2 + 1.75], P.coral, { seg: 10 });
    g.cyl(0.04, 0.04, 0.7, [-0.4 + i * 1.0, 0.35, d / 2 + 1.75], P.ink, { seg: 6 });
    c.interact({ id: `${c.id}.stool${i}`, kind: 'sit', label: 'Sit', x: -0.4 + i * 1.0, y: 0.7, z: d / 2 + 1.75, heading: Math.PI, radius: 0.9 });
  }
  c.collider({ type: 'box', x: 0.6, z: d / 2 + 1.0, hx: 1.55, hz: 0.35, h: 1.05 });
  // Surfboards leaning on the wall.
  for (let i = 0; i < 3; i++) g.sphere(1, [w / 2 + 0.25, 1.3, -1 + i * 0.75], [P.amber, P.teal, P.coral][i], { ws: 8, hs: 6, scale: [0.08, 1.2, 0.3], rot: [0, 0, -0.18] });
  c.anchor('counter', 0.6, 0, d / 2 + 0.4, 0);
});

defineKit('seawall', (c) => {
  const g = c.g;
  const len = c.params.len ?? 10;
  g.rbox(len, 1.8, 0.6, 0.06, [0, 0.9, 0], '#d9cdb6');
  g.box(len + 0.2, 0.2, 0.75, [0, 1.9, 0], P.stone);
  c.sign(0, 0.95, 0.31, len - 0.4, 1.5, 0, { text: c.params.text ?? 'WAGMI', sub: c.params.sub ?? 'a mural by MEME', bg: c.params.bg ?? '#7fc3d9', fg: P.paper, style: 'board', icon: c.params.icon, accent: P.butter });
  c.collider({ type: 'box', x: 0, z: 0, hx: len / 2, hz: 0.35, h: 2 });
  c.anchor('front', len * 0.25, 0, 1.4, Math.PI);
  c.interact({ id: c.params.iid ?? c.id, kind: 'read', label: 'Look at the mural', x: 0, y: 1, z: 1.3, heading: Math.PI, radius: 2.2, data: { doc: c.params.doc ?? 'mural.wagmi' } });
});

defineKit('workshop.fork', (c) => {
  const g = c.g;
  building(c, { w: 5, d: 4.4, floors: 1, floorH: 3.0, wall: '#c9b48a', trim: P.woodDark, roof: 'shed', roofColor: P.metalDark, base: P.woodDark, windows: { style: 'porthole', per: 2, lit: 0.9 }, door: { x: 1.2, color: P.teal },
    sign: { text: 'FORK & SPOON LABS', sub: 'experimental · unaudited · fun', bg: P.ink, fg: P.butter, icon: 'gear', accent: P.butter, w: 3.6, h: 0.6, y: 3.0 } });
  // The contraption: a bathtub computer-boat with propellers and an antenna.
  g.pushT([-3.6, 0, 1.2], [0, 0.4, 0]);
  g.sphere(1, [0, 0.55, 0], P.paper, { ws: 12, hs: 6, scale: [0.8, 0.5, 1.5] });
  g.rbox(0.7, 0.55, 0.5, 0.05, [0, 1.1, -0.3], '#d6ccb4');
  g.box(0.5, 0.35, 0.02, [0, 1.12, -0.04], '#20303c', { emissive: 1.4 });
  g.cyl(0.03, 0.04, 2.4, [0.3, 2.0, 0.6], P.metal, { seg: 6 });
  g.sphere(0.08, [0.3, 3.2, 0.6], P.amber, { emissive: 1.9, ws: 6, hs: 4 });
  g.pop();
  for (const [px, pz, sp] of [[-4.5, -0.2, 3], [-2.8, 2.6, -4]] as [number, number, number][]) {
    c.spin((s) => {
      s.box(1.2, 0.05, 0.16, [0, 0, 0], P.coral);
      s.box(0.16, 0.05, 1.2, [0, 0, 0], P.coral);
    }, [px, 1.9, pz], [0, 1, 0], sp);
    g.cyl(0.04, 0.04, 1.9, [px, 0.95, pz], P.metalDark, { seg: 6 });
  }
  c.collider({ type: 'circle', x: -3.6, z: 1.2, r: 1.4, h: 1.5 });
  c.anchor('bench', -1.5, 0, 3.4, Math.PI);
  c.interact({ id: 'coast.fork.contraption', kind: 'mission', label: 'Poke the contraption', x: -2.6, y: 1.0, z: 2.6, heading: Math.PI + 0.6, radius: 1.7, data: { title: "Fork's Contraption" } });
});

defineKit('lifeguard', (c) => {
  const g = c.g;
  for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) g.box(0.12, 2.2, 0.12, [x, 1.1, z], P.paper, { rot: [z * 0.08, 0, -x * 0.08] });
  g.box(2.0, 0.15, 2.0, [0, 2.2, 0], P.paper);
  g.rbox(1.8, 1.3, 1.6, 0.05, [0, 2.95, -0.1], P.red);
  g.box(1.9, 0.12, 1.9, [0, 3.65, 0], P.paper);
  for (let i = 0; i < 6; i++) g.box(0.7, 0.08, 0.25, [0, 0.3 + i * 0.35, 1.0 + i * 0.12], P.woodLight, { rot: [0.3, 0, 0] });
  c.collider({ type: 'box', x: 0, z: 0, hx: 1.0, hz: 1.0, h: 3.7 });
});

defineKit('volleyball', (c) => {
  const g = c.g;
  for (const x of [-3.2, 3.2]) {
    g.cyl(0.06, 0.06, 2.6, [x, 1.3, 0], P.paper, { seg: 6 });
    c.collider({ type: 'circle', x, z: 0, r: 0.1, h: 2.6 });
  }
  for (let i = 0; i < 6; i++) g.box(6.4, 0.02, 0.02, [0, 1.6 + i * 0.16, 0], P.ink);
  g.box(6.4, 0.08, 0.04, [0, 2.45, 0], P.paper);
  g.sphere(0.2, [1.4, 0.2, 1.6], P.butter, { ws: 8, hs: 6 });
});

defineKit('chest', (c) => {
  const g = c.g;
  g.rbox(0.9, 0.5, 0.6, 0.05, [0, 0.25, 0], P.woodDark);
  g.cyl(0.3, 0.3, 0.9, [0, 0.5, 0], P.wood, { rot: [0, 0, Math.PI / 2], seg: 10, scale: [1, 1, 1] });
  g.box(0.95, 0.08, 0.65, [0, 0.5, 0], P.gold);
  g.box(0.16, 0.2, 0.05, [0, 0.45, 0.32], P.gold);
  c.collider({ type: 'box', x: 0, z: 0, hx: 0.5, hz: 0.35, h: 0.8 });
});

defineKit('towel', (c) => {
  const col = c.params.color ?? c.rng.pick([P.coral, P.teal, P.butter, P.lavender]);
  for (let i = 0; i < 5; i++) c.g.box(0.8, 0.02, 0.36, [0, 0.02, -0.72 + i * 0.36], i % 2 ? P.paper : col);
});

defineKit('shell', (c) => {
  c.g.sphere(0.12, [0, 0.03, 0], c.rng.pick(['#f6e7d6', '#f3c9b8', '#e8d6f0']), { ws: 6, hs: 3, scale: [1, 0.4, 1.2] });
});

export function smallTable(c: Parameters<typeof tableSet>[0]): void {
  tableSet(c, c.params.umbrella);
}

export function hull(g: GeoBuilder, len: number, col: string): void {
  g.sphere(1, [0, 0.15, 0], col, { ws: 12, hs: 6, scale: [0.85, 0.5, len / 2] });
}
