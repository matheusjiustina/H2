import { defineKit } from '../content/Kit';
import { building } from './buildings';
import { bench } from './props';
import { P } from './palette';

/** "The First Block" — the hovering, slowly turning cube at the heart of Consensus Square. */
defineKit('sculpture.block', (c) => {
  const g = c.g;
  g.cyl(3.0, 3.15, 0.5, [0, 0.25, 0], P.stone, { seg: 32 });
  g.cyl(2.7, 2.7, 0.08, [0, 0.47, 0], '#86cfdc', { seg: 32 });
  g.cyl(1.1, 1.3, 1.0, [0, 0.6, 0], P.stoneDark, { seg: 16 });
  g.cyl(0.9, 1.0, 0.3, [0, 1.25, 0], P.stone, { seg: 16 });
  // Ring of small glowing nodes on the plinth.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.sphere(0.09, [Math.cos(a) * 0.95, 1.42, Math.sin(a) * 0.95], i % 2 ? P.amber : P.lavender, { emissive: 1.6 });
  }
  c.spin(
    (s) => {
      // A cube of eight blocks balanced on its corner.
      s.pushT([0, 0, 0], [0.6155, 0, Math.PI / 4]);
      for (const x of [-0.42, 0.42]) for (const y of [-0.42, 0.42]) for (const z of [-0.42, 0.42]) {
        const gold = (x > 0 ? 1 : 0) ^ (y > 0 ? 1 : 0) ^ (z > 0 ? 1 : 0);
        s.rbox(0.78, 0.78, 0.78, 0.08, [x, y, z], gold ? P.amber : P.paper, { emissive: gold ? 1.15 : 0 });
      }
      s.pop();
    },
    [0, 3.1, 0],
    [0, 1, 0],
    0.35,
  );
  c.collider({ type: 'circle', x: 0, z: 0, r: 3.15, h: 0.55 });
  c.collider({ type: 'circle', x: 0, z: 0, r: 1.3, h: 4.5 });
  c.interact({ id: 'city.sculpture', kind: 'read', label: 'Read the plaque', x: 0, y: 1, z: 3.6, heading: Math.PI, radius: 2.2, data: { doc: 'plaque.firstblock' } });
  c.anchor('beacon', 0, 4.6, 0);
});

defineKit('tower.consensus', (c) => {
  const g = c.g;
  const t1 = building(c, { w: 7, d: 7, floors: 4, floorH: 2.8, glass: true, trim: P.paper, roof: 'none', door: { color: P.ink, double: true, canopy: P.ink }, base: P.stoneDark, windows: { lit: 0.55 } });
  g.pushT([0, t1.H + 0.1, 0]);
  g.rbox(7.3, 0.35, 7.3, 0.05, [0, 0.1, 0], P.paper);
  g.rbox(5.4, 7.2, 5.4, 0.06, [0, 3.7, 0], P.glassDark);
  for (let f = 0; f < 3; f++) g.box(5.6, 0.16, 5.6, [0, 0.4 + f * 2.4, 0], P.paper);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      g.box(0.07, 7.2, 0.07, [-2.7 + i * 1.35, 3.7, s * 2.72], P.paper);
      g.box(0.07, 7.2, 0.07, [s * 2.72, 3.7, -2.7 + i * 1.35], P.paper);
    }
    for (let f = 0; f < 3; f++)
      for (let i = 0; i < 4; i++) {
        const lit = c.rng.chance(0.5) ? 0.85 : 0;
        g.box(1.2, 2.1, 0.02, [-2.03 + i * 1.35, 1.6 + f * 2.4, s * 2.71], P.glass, { emissive: lit });
        g.box(0.02, 2.1, 1.2, [s * 2.71, 1.6 + f * 2.4, -2.03 + i * 1.35], P.glass, { emissive: c.rng.chance(0.5) ? 0.85 : 0 });
      }
  }
  // Crown.
  g.rbox(5.8, 0.4, 5.8, 0.06, [0, 7.4, 0], P.paper);
  g.rbox(3.6, 2.4, 3.6, 0.08, [0, 8.8, 0], P.navy);
  g.cone(2.2, 2.4, [0, 11.2, 0], P.navy, { seg: 4, rot: [0, Math.PI / 4, 0], flat: true });
  g.cyl(0.06, 0.08, 3.5, [0, 14.0, 0], P.metal, { seg: 6 });
  g.sphere(0.16, [0, 15.8, 0], P.red, { emissive: 1.9 });
  g.pop();
  c.spin(
    (s) => s.rbox(0.9, 0.9, 0.9, 0.08, [0, 0, 0], P.amber, { emissive: 1.3, rot: [0.6, 0, 0.78] }),
    [0, t1.H + 0.1 + 13.0, 0],
    [0, 1, 0],
    0.5,
  );
  // Facade ticker and sign.
  g.box(6.6, 1.1, 0.16, [0, t1.H - 0.9, 3.58], P.ink);
  c.screen(0, t1.H - 0.9, 3.67, 6.3, 0.9, 0, 'ticker', 'tower', 2);
  c.sign(0, t1.H + 2.7, 2.82, 4.2, 0.8, 0, { text: 'CONSENSUS TOWER', bg: P.navy, fg: P.paper, accent: P.amber, style: 'plaque' });
  c.collider({ type: 'box', x: 0, z: 0, hx: 3.7, hz: 3.7, h: t1.H + 12, camera: true });
});

defineKit('bank', (c) => {
  const g = c.g;
  const w = c.params.w ?? 7, d = c.params.d ?? 6;
  building(c, {
    w, d, floors: 2, floorH: 3.0, wall: P.paper, trim: P.stone, roof: 'flat', base: P.stoneDark,
    windows: { style: 'tall', per: 3, lit: 0.4 }, door: { color: P.woodDark, double: true }, cornice: true,
  });
  // Portico.
  const pz = d / 2 + 1.1;
  g.rbox(w - 0.6, 0.35, 2.4, 0.04, [0, 0.17, d / 2 + 1.0], P.stone);
  for (let i = 0; i < 4; i++) {
    const x = -2.4 + i * 1.6;
    g.cyl(0.26, 0.3, 4.8, [x, 2.75, pz], P.paper, { seg: 14 });
    g.box(0.75, 0.25, 0.75, [x, 5.25, pz], P.stone);
    g.box(0.75, 0.2, 0.75, [x, 0.42, pz], P.stone);
  }
  g.box(w - 0.4, 0.5, 2.6, [0, 5.6, d / 2 + 1.1], P.stone);
  g.pushT([0, 5.85, d / 2 + 1.1], [0, Math.PI / 2, 0]);
  g.gable(2.6, 1.1, w - 0.4, [0, 0, 0], P.paper);
  g.pop();
  g.cyl(0.5, 0.5, 0.08, [0, 6.35, d / 2 + 2.42], P.gold, { rot: [Math.PI / 2, 0, 0], seg: 20 });
  c.sign(0, 6.35, d / 2 + 2.47, 0.8, 0.8, 0, { text: '', bg: P.gold, fg: P.paper, icon: 'btc', style: 'round', accent: P.paper });
  c.sign(0, 4.85, d / 2 + 2.3, 4.2, 0.55, 0, { text: c.params.name ?? 'NONCE & SONS', sub: 'Savings since Block 0', bg: P.stone, fg: P.ink, style: 'plaque', accent: P.gold });
  c.collider({ type: 'box', x: 0, z: d / 2 + 1.1, hx: w / 2 - 0.3, hz: 1.0, h: 6.2, y0: 0.4, camera: true });
  for (let i = 0; i < 4; i++) c.collider({ type: 'circle', x: -2.4 + i * 1.6, z: pz, r: 0.32, h: 5.4 });
});

defineKit('library', (c) => {
  const g = c.g;
  const w = 9, d = 6.5;
  building(c, {
    w, d, floors: 2, floorH: 3.1, wall: '#efe2c8', trim: P.paper, roof: 'dome', roofColor: P.deepTeal, base: P.stoneDark,
    windows: { style: 'arch', per: 4, lit: 0.7 }, door: { color: P.woodDark, double: true }, cornice: true,
  });
  g.rbox(w + 0.4, 0.3, 2.0, 0.04, [0, 0.15, d / 2 + 1.0], P.stone);
  g.rbox(w - 1, 0.3, 1.3, 0.04, [0, 0.45, d / 2 + 0.75], P.stone);
  for (let i = 0; i < 6; i++) {
    const x = -3.75 + i * 1.5;
    if (Math.abs(x) < 0.8) continue;
    g.cyl(0.22, 0.25, 5.4, [x, 3.0, d / 2 + 0.6], P.paper, { seg: 12 });
  }
  g.box(w, 0.45, 1.2, [0, 5.9, d / 2 + 0.6], P.stone);
  c.sign(0, 5.25, d / 2 + 1.22, 4.6, 0.7, 0, { text: 'MERKLE LIBRARY', sub: 'Every record, verified', bg: P.deepTeal, fg: P.paper, icon: 'book', accent: P.gold, style: 'plaque' });
  for (let i = 0; i < 6; i++) {
    const x = -3.75 + i * 1.5;
    if (Math.abs(x) < 0.8) continue;
    c.collider({ type: 'circle', x, z: d / 2 + 0.6, r: 0.28, h: 5.5 });
  }
  c.anchor('desk', 2.6, 0, d / 2 + 2.2, Math.PI);
  c.anchor('steps', -2.0, 0.3, d / 2 + 2.0, 0);
});

defineKit('relay.office', (c) => {
  const g = c.g;
  const r = building(c, {
    w: 6, d: 5, floors: 2, wall: P.powder, trim: P.paper, roof: 'flat', base: P.stoneDark,
    windows: { style: 'wide', per: 2, lit: 0.7 }, door: { x: -1.4, color: P.amber, canopy: P.navy },
    sign: { text: 'RELAY OFFICE', sub: 'Messages delivered, block by block', bg: P.navy, fg: P.paper, icon: 'antenna', accent: P.amber, w: 4.2, h: 0.75 },
  });
  // Lattice mast with dish.
  const top = r.top;
  for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) g.box(0.08, 5, 0.08, [1.5 + x * (1 - 0.3), top + 2.5, -0.8 + z * (1 - 0.3)], P.metal, { rot: [z * 0.05, 0, -x * 0.05] });
  for (let i = 0; i < 6; i++) {
    g.box(0.85, 0.05, 0.05, [1.5, top + 0.5 + i * 0.85, -0.8 + 0.38], P.metal);
    g.box(0.85, 0.05, 0.05, [1.5, top + 0.5 + i * 0.85, -0.8 - 0.38], P.metal);
  }
  g.sphere(0.12, [1.5, top + 5.2, -0.8], P.red, { emissive: 1.9 });
  c.spin(
    (s) => {
      s.sphere(0.9, [0, 0, 0.25], P.paper, { scale: [1, 1, 0.3] });
      s.cyl(0.04, 0.04, 0.8, [0, 0, 0.6], P.metal, { rot: [Math.PI / 2, 0, 0], seg: 6 });
    },
    [1.5, top + 4.0, -0.8],
    [0, 1, 0],
    0.25,
  );
  g.box(2.2, 1.4, 0.15, [1.3, 1.6, 2.58], P.ink);
  c.screen(1.3, 1.6, 2.66, 2.0, 1.2, 0, 'relaymap', 'relay', 1);
  c.anchor('inside', -1.4, 0, 3.2, Math.PI);
});

defineKit('cafe', (c) => {
  const g = c.g;
  building(c, {
    w: 7, d: 6, floors: 2, wall: P.butter, trim: P.paper, roof: 'gable', roofColor: P.brick, roofAxis: 'x', base: P.stoneDark,
    windows: { style: 'square', per: 3, shutters: P.teal, lit: 0.8 }, door: { x: 2.4, color: P.teal },
    shopfront: { color: P.woodDark, w: 3.6 }, awning: P.teal, chimney: true, flowerbox: '#f29db0',
    sign: { text: 'PROOF OF BREW', sub: 'coffee · rumours · consensus', bg: P.woodDark, fg: P.paper, icon: 'cup', accent: P.amber, w: 4.6, h: 0.75, y: 3.45 },
  });
  // Chalk menu board by the door.
  g.box(0.9, 1.3, 0.08, [3.7, 0.9, 3.4], P.woodDark, { rot: [-0.25, 0, 0] });
  c.screen(3.7, 0.95, 3.46, 0.78, 1.0, 0, 'menu', 'brew', 1);
  c.collider({ type: 'box', x: 3.7, z: 3.4, hx: 0.5, hz: 0.25, h: 1.4 });
  // Counter visible through the shop window.
  g.rbox(3.2, 1.0, 0.8, 0.05, [-0.4, 0.5, 2.2], P.wood);
  g.box(0.5, 0.6, 0.4, [-1.4, 1.3, 2.2], P.metal);
  c.anchor('counter', -0.6, 0, 3.6, 0);
  c.interact({ id: 'city.cafe.machine', kind: 'inspect', label: 'Look at the espresso machine', x: -1.4, y: 1.2, z: 3.4, heading: Math.PI, radius: 1.6, data: { doc: 'cafe.machine' } });
});

defineKit('repair.shop', (c) => {
  const g = c.g;
  building(c, {
    w: 5.5, d: 5, floors: 2, wall: P.sage, trim: P.paper, roof: 'shed', roofColor: P.slate, base: P.stoneDark,
    windows: { style: 'square', per: 2, lit: 0.6 }, door: { x: 1.6, color: P.amber }, shopfront: { color: P.ink, w: 2.6 }, awning: P.amber,
    sign: { text: 'BLOCK & MORTAR', sub: 'repairs · upgrades · no questions', bg: P.ink, fg: P.amber, icon: 'gear', accent: P.amber, w: 4.0, h: 0.7, y: 3.4 },
  });
  // Old monitors stacked outside on a table.
  g.rbox(1.8, 0.06, 0.7, 0.02, [-1.6, 0.8, 3.3], P.woodLight);
  for (const [x, z] of [[-0.75, -0.25], [0.75, -0.25], [-0.75, 0.25], [0.75, 0.25]]) g.box(0.06, 0.8, 0.06, [-1.6 + x, 0.4, 3.3 + z], P.metalDark);
  for (let i = 0; i < 3; i++) {
    g.rbox(0.5, 0.42, 0.45, 0.04, [-2.2 + i * 0.6, 1.05, 3.25], '#d8d0bd');
    g.box(0.36, 0.28, 0.02, [-2.2 + i * 0.6, 1.07, 3.48], '#20303c', { emissive: i === 1 ? 1.5 : 0 });
  }
  c.collider({ type: 'box', x: -1.6, z: 3.3, hx: 0.95, hz: 0.4, h: 1.3 });
});

defineKit('gas.station', (c) => {
  const g = c.g;
  // Canopy on four pillars.
  for (const [x, z] of [[-3, -1.5], [3, -1.5], [-3, 1.5], [3, 1.5]]) {
    g.cyl(0.18, 0.2, 3.6, [x, 1.8, z], P.paper, { seg: 10 });
    c.collider({ type: 'circle', x, z, r: 0.22, h: 3.6 });
  }
  g.rbox(8, 0.6, 4.6, 0.1, [0, 3.85, 0], P.paper);
  g.box(8.05, 0.25, 4.65, [0, 3.6, 0], P.amber, { emissive: 1.25 });
  for (let i = 0; i < 6; i++) g.sphere(0.12, [-2.5 + i, 3.5, 0], '#fff3d0', { emissive: 1.0 });
  c.sign(0, 3.85, 2.33, 5, 0.55, 0, { text: 'GAS STATION', sub: 'network fees, paid with a smile', bg: P.paper, fg: P.ink, icon: 'fuel', accent: P.amber, style: 'banner' });
  c.sign(0, 3.85, -2.33, 5, 0.55, Math.PI, { text: 'GAS STATION', sub: 'network fees, paid with a smile', bg: P.paper, fg: P.ink, icon: 'fuel', accent: P.amber, style: 'banner' });
  // Fee "pumps" — mempool monitors.
  for (const x of [-1.6, 1.6]) {
    g.rbox(0.8, 1.6, 0.6, 0.08, [x, 0.8, 0], P.red);
    g.box(0.66, 0.56, 0.02, [x, 1.15, 0.31], '#0d141c');
    c.screen(x, 1.15, 0.325, 0.6, 0.5, 0, 'mempool', 'gas', 1);
    g.cyl(0.04, 0.04, 0.9, [x + 0.48, 0.9, 0], P.ink, { seg: 6 });
    c.collider({ type: 'box', x, z: 0, hx: 0.45, hz: 0.35, h: 1.6 });
  }
  // Booth.
  g.pushT([0, 0, -4.2]);
  g.rbox(3.4, 2.8, 2.6, 0.08, [0, 1.4, 0], P.cream);
  g.box(3.6, 0.2, 2.8, [0, 2.9, 0], P.amber);
  g.box(2.2, 1.0, 0.06, [0, 1.6, 1.31], P.glass, { emissive: 0.9 });
  g.box(2.4, 0.12, 0.4, [0, 1.05, 1.45], P.woodDark);
  g.pop();
  c.collider({ type: 'box', x: 0, z: -4.2, hx: 1.75, hz: 1.35, h: 3, camera: true });
  // Big fee board.
  g.box(0.12, 4.6, 0.12, [4.6, 2.3, 1.8], P.ink);
  g.box(1.9, 1.5, 0.15, [4.6, 4.3, 1.8], P.ink);
  c.screen(4.6, 4.3, 1.88, 1.7, 1.3, 0, 'mempool', 'gasboard', 1);
  c.collider({ type: 'circle', x: 4.6, z: 1.8, r: 0.15, h: 5 });
  c.anchor('booth', 0, 0, -2.4, 0);
  c.anchor('pump', -1.6, 0, 1.2, Math.PI);
  c.interact({ id: 'city.gas.monitor', kind: 'screen', label: 'Check the mempool monitor', x: 1.6, y: 1.1, z: 0.9, heading: Math.PI, radius: 1.7, data: { screen: 'mempool', title: 'Mempool Monitor' } });
});

defineKit('bus.stop', (c) => {
  const g = c.g;
  for (const x of [-1.6, 1.6]) g.box(0.1, 2.5, 0.1, [x, 1.25, -0.6], P.ink);
  g.box(3.6, 0.12, 1.6, [0, 2.55, -0.1], P.navy, { rot: [-0.08, 0, 0] });
  g.box(3.2, 1.8, 0.05, [0, 1.3, -0.62], P.glass, { emissive: 0.4 });
  bench(g, P.amber, P.ink);
  g.box(0.08, 2.9, 0.08, [2.1, 1.45, 0.4], P.ink);
  c.sign(2.1, 2.65, 0.4, 0.75, 0.75, 0, { text: '', bg: P.amber, fg: P.ink, icon: 'chain', style: 'round', accent: P.ink }, { double: true, depth: 0.03 });
  c.sign(0, 2.25, -0.58, 2.6, 0.38, 0, { text: 'ARRIVALS · CHAIN CITY', bg: P.navy, fg: P.paper, style: 'banner' });
  c.collider({ type: 'box', x: 0, z: -0.6, hx: 1.7, hz: 0.12, h: 2.6 });
  c.collider({ type: 'box', x: 0, z: 0, hx: 0.9, hz: 0.25, h: 0.5 });
  c.interact({ id: 'city.busstop.bench', kind: 'sit', label: 'Sit', x: 0, y: 0.45, z: 0.1, heading: 0, radius: 1.4 });
  c.interact({ id: 'city.busstop.timetable', kind: 'read', label: 'Read the timetable', x: 2.1, y: 1.4, z: 0.9, heading: Math.PI, radius: 1.4, data: { doc: 'busstop.timetable' } });
});

defineKit('dex.kiosk', (c) => {
  const g = c.g;
  g.rbox(3.2, 1.05, 1.4, 0.06, [0, 0.52, 0], P.navy);
  g.box(3.3, 0.08, 1.5, [0, 1.08, 0], P.paper);
  for (const x of [-1.5, 1.5]) g.box(0.1, 2.7, 0.1, [x, 1.35, -0.6], P.ink);
  g.rbox(3.6, 0.25, 2.0, 0.06, [0, 2.8, -0.1], P.amber);
  g.box(3.4, 1.0, 0.1, [0, 1.85, -0.62], P.ink);
  c.screen(-1.05, 1.85, -0.56, 1.0, 0.85, 0, 'dex', 'dex', 1);
  c.screen(0, 1.85, -0.56, 1.0, 0.85, 0, 'candles', 'dex', 1);
  c.screen(1.05, 1.85, -0.56, 1.0, 0.85, 0, 'candles2', 'dex', 1);
  c.sign(0, 2.8, 0.91, 3.2, 0.3, 0, { text: 'DEX · LEARN MODE · ALL TRADES SIMULATED', bg: P.amber, fg: P.ink, style: 'banner' });
  c.collider({ type: 'box', x: 0, z: -0.1, hx: 1.7, hz: 0.8, h: 2.9 });
  c.anchor('keeper', 0, 0, -1.2, Math.PI * 0);
  c.interact({ id: 'city.dex.screen', kind: 'screen', label: 'Watch the simulated order book', x: 0.9, y: 1.2, z: 1.0, heading: Math.PI, radius: 1.6, data: { screen: 'dex', title: 'DEX — Learn Mode (simulated)' } });
});

defineKit('billboard', (c) => {
  const g = c.g;
  const w = c.params.w ?? 5, h = c.params.h ?? 2.6, y = c.params.y ?? 4.2;
  for (const x of [-w * 0.35, w * 0.35]) {
    g.box(0.2, y, 0.2, [x, y / 2, 0], P.metalDark);
    c.collider({ type: 'circle', x, z: 0, r: 0.2, h: y });
  }
  g.rbox(w + 0.3, h + 0.3, 0.3, 0.06, [0, y + h / 2, 0], P.ink);
  if (c.params.screen) c.screen(0, y + h / 2, 0.16, w, h, 0, c.params.screen, c.params.seed ?? c.id, c.params.span ?? 2);
  if (c.params.text) c.sign(0, y + h / 2, 0.16, w, h, 0, { text: c.params.text, sub: c.params.sub, bg: c.params.bg ?? P.amber, fg: c.params.fg ?? P.ink, style: 'board', icon: c.params.icon });
  if (c.params.back) c.sign(0, y + h / 2, -0.16, w, h, Math.PI, { text: c.params.back, sub: c.params.backSub, bg: c.params.bg ?? P.amber, fg: c.params.fg ?? P.ink, style: 'board' });
  g.box(w * 0.8, 0.08, 0.5, [0, y + h + 0.25, 0.2], P.ink);
  for (let i = 0; i < 3; i++) g.sphere(0.08, [-w * 0.3 + i * w * 0.3, y + h + 0.2, 0.45], '#fff3d0', { emissive: 1 });
});

defineKit('loft.pixel', (c) => {
  const g = c.g;
  building(c, {
    w: 6.5, d: 5.5, floors: 2, floorH: 3.0, wall: P.lavender, trim: P.paper, roof: 'shed', roofColor: P.plum, base: P.stoneDark,
    windows: { style: 'wide', per: 2, lit: 0.8 }, door: { x: 2.0, color: P.coral },
    sign: { text: 'PIXEL LOFT', sub: 'art · weirdness · open studio', bg: P.plum, fg: P.paper, icon: 'art', accent: P.butter, w: 3.6, h: 0.7, y: 2.7 },
  });
  g.box(2.4, 2.4, 0.15, [-1.4, 4.4, 2.8], P.ink);
  c.screen(-1.4, 4.4, 2.88, 2.2, 2.2, 0, 'art', 'pixel-loft', 1);
  // Easel outside.
  g.pushT([-1.9, 0, 3.8], [0, 0.4, 0]);
  g.box(0.06, 1.7, 0.06, [-0.35, 0.85, 0], P.woodLight, { rot: [0, 0, 0.12] });
  g.box(0.06, 1.7, 0.06, [0.35, 0.85, 0], P.woodLight, { rot: [0, 0, -0.12] });
  g.box(0.06, 1.6, 0.06, [0, 0.8, -0.35], P.woodLight, { rot: [-0.25, 0, 0] });
  g.box(0.9, 0.7, 0.04, [0, 1.25, 0.05], P.paper);
  g.pop();
  c.screen(-1.9 + 0.02, 1.25, 3.86, 0.8, 0.6, 0.4, 'art', 'easel', 1);
  c.collider({ type: 'circle', x: -1.9, z: 3.8, r: 0.45, h: 1.7 });
  c.anchor('easel', -1.9, 0, 4.7, Math.PI);
});

/** A low building whose roof terrace is reachable by an outdoor staircase (hides a secret). */
defineKit('rooftop.terrace', (c) => {
  const g = c.g;
  const w = 6, d = 5;
  const r = building(c, {
    w, d, floors: 1, floorH: 3.0, wall: P.peach, trim: P.paper, roof: 'none', base: P.stoneDark, cornice: true,
    windows: { style: 'square', per: 2, lit: 0.5 }, door: { x: -1.2, color: P.navy },
    sign: c.params.sign,
  });
  const top = r.H + 0.1;
  g.box(w + 0.1, 0.2, d + 0.1, [0, top + 0.1, 0], P.stone);
  // Roof walk surface + railings.
  c.surface({ x: 0, z: 0, hx: w / 2, hz: d / 2, y0: top + 0.2, y1: top + 0.2, material: 'stone' });
  for (const s of [-1, 1]) {
    g.box(w, 0.08, 0.08, [0, top + 1.15, s * (d / 2 - 0.05)], P.ink);
    g.box(0.08, 0.08, d, [s * (w / 2 - 0.05), top + 1.15, 0], P.ink);
    for (let i = 0; i <= 6; i++) {
      g.box(0.05, 0.95, 0.05, [-w / 2 + (i * w) / 6, top + 0.68, s * (d / 2 - 0.05)], P.ink);
    }
    c.collider({ type: 'box', x: 0, z: s * (d / 2 - 0.05), hx: w / 2, hz: 0.08, h: 1.0, y0: top + 0.2 });
  }
  // Right side railing has a gap where the stairs arrive.
  c.collider({ type: 'box', x: -(w / 2 - 0.05), z: 0, hx: 0.08, hz: d / 2, h: 1.0, y0: top + 0.2 });
  for (let i = 0; i <= 6; i++) g.box(0.05, 0.95, 0.05, [-(w / 2 - 0.05), top + 0.68, -d / 2 + (i * d) / 6], P.ink);
  c.collider({ type: 'box', x: w / 2 - 0.05, z: -d / 4 - 0.3, hx: 0.08, hz: d / 4 - 0.3, h: 1.0, y0: top + 0.2 });
  // Outdoor staircase along the +x side, rising toward +z.
  const sx = w / 2 + 0.75;
  const steps = 12;
  const run = d + 0.6;
  for (let i = 0; i < steps; i++) {
    const y = ((i + 1) / steps) * (top + 0.2);
    g.box(1.3, 0.16, run / steps + 0.02, [sx, y - 0.08, -d / 2 - 0.3 + ((i + 0.5) * run) / steps], P.stone);
  }
  g.box(0.08, top + 1.2, 0.08, [sx + 0.68, (top + 1.2) / 2, d / 2 + 0.25], P.ink);
  g.box(0.06, 0.06, Math.hypot(run, top), [sx + 0.68, top / 2 + 1.0, 0], P.ink, { rot: [-Math.atan2(top, run), 0, 0] });
  c.surface({ x: sx, z: 0, hx: 0.65, hz: run / 2, y0: 0.0, y1: top + 0.2, rot: 0, material: 'stone' });
  c.surface({ x: sx - 0.1, z: d / 2 + 0.15, hx: 0.75, hz: 0.45, y0: top + 0.2, y1: top + 0.2, material: 'stone' });
  c.collider({ type: 'box', x: sx + 0.72, z: 0, hx: 0.06, hz: run / 2, h: top + 1.2 });
  // Terrace furniture.
  g.pushT([-1.2, top + 0.2, 0.6]);
  g.cyl(0.4, 0.4, 0.05, [0, 0.72, 0], P.white, { seg: 12 });
  g.cyl(0.04, 0.04, 0.72, [0, 0.36, 0], P.ink, { seg: 6 });
  g.pop();
  if (c.params.pizza) {
    // Two pizza boxes — a famous trade.
    g.rbox(0.62, 0.08, 0.62, 0.02, [-1.2, top + 0.2 + 0.79, 0.6], '#e3c79a');
    g.rbox(0.62, 0.08, 0.62, 0.02, [-1.15, top + 0.2 + 0.87, 0.62], '#e3c79a', { rot: [0, 0.3, 0] });
    g.box(0.3, 0.02, 0.1, [-1.15, top + 0.2 + 0.92, 0.62], P.red, { rot: [0, 0.3, 0] });
    c.interact({ id: 'secret.pizza', kind: 'secret', label: 'Inspect the pizza boxes', x: -1.2, y: top + 1.0, z: 0.6, heading: 0, radius: 1.6, data: { secret: 'pizza' } });
  }
  c.anchor('roof', 0, top + 0.2, 0);
});

defineKit('flowerbed', (c) => {
  const w = c.params.w ?? 3, d = c.params.d ?? 1.2;
  c.g.rbox(w, 0.3, d, 0.08, [0, 0.15, 0], P.stone);
  c.g.box(w - 0.2, 0.06, d - 0.2, [0, 0.3, 0], '#6b4f36');
  const cols = c.params.colors ?? ['#f29db0', '#f6d55c', '#ffffff', '#b8a4f2'];
  for (let i = 0; i < Math.round(w * d * 4); i++) {
    c.g.sphere(0.1, [c.rng.range(-w / 2 + 0.2, w / 2 - 0.2), 0.42, c.rng.range(-d / 2 + 0.2, d / 2 - 0.2)], c.rng.pick(cols), { ws: 5, hs: 3, wind: 0.3 });
  }
  for (let i = 0; i < Math.round(w); i++) c.g.sphere(0.3, [c.rng.range(-w / 2 + 0.3, w / 2 - 0.3), 0.4, c.rng.range(-d / 4, d / 4)], P.leaf, { detail: 1, scale: [1.2, 0.6, 1], wind: 0.2 });
  c.collider({ type: 'box', x: 0, z: 0, hx: w / 2, hz: d / 2, h: 0.5 });
});
