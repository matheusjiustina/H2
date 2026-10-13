import { defineKit } from '../content/Kit';
import { GeoBuilder } from '../kit/GeoBuilder';
import { P } from './palette';
import { bench } from './props';

/** Log wall: stacked horizontal logs along X of length `len`. */
function logWall(g: GeoBuilder, len: number, h: number, x: number, z: number, rotY: number, col = P.wood): void {
  const n = Math.round(h / 0.32);
  g.pushT([x, 0, z], [0, rotY, 0]);
  for (let i = 0; i < n; i++) {
    g.cyl(0.17, 0.17, len + 0.3, [0, 0.17 + i * 0.32, 0], i % 2 ? col : P.woodLight, { rot: [0, 0, Math.PI / 2], seg: 7 });
  }
  g.pop();
}

defineKit('cabin', (c) => {
  const g = c.g;
  const w = 6, d = 5, h = 2.9;
  g.rbox(w + 1.2, 0.5, d + 3.2, 0.05, [0, -0.1, 0.9], P.stoneDark);
  logWall(g, w, h, 0, -d / 2, 0);
  logWall(g, w, h, 0, d / 2, 0);
  logWall(g, d, h, -w / 2, 0, Math.PI / 2, P.woodLight);
  logWall(g, d, h, w / 2, 0, Math.PI / 2, P.woodLight);
  g.box(w - 0.2, h, d - 0.2, [0, h / 2, 0], P.woodDark);
  // Door and windows on the front (+z).
  g.box(1.1, 2.0, 0.12, [-1.2, 1.0, d / 2 + 0.18], P.woodDark);
  g.box(1.25, 0.12, 0.16, [-1.2, 2.06, d / 2 + 0.18], P.woodLight);
  g.sphere(0.06, [-0.85, 1.0, d / 2 + 0.26], P.gold, { ws: 6, hs: 4 });
  for (const x of [1.3]) {
    g.box(1.2, 0.95, 0.14, [x, 1.55, d / 2 + 0.16], P.woodLight);
    g.box(1.0, 0.75, 0.06, [x, 1.55, d / 2 + 0.2], P.glass, { emissive: 0.95 });
    g.box(0.06, 0.75, 0.08, [x, 1.55, d / 2 + 0.22], P.woodLight);
  }
  for (const s of [-1, 1]) {
    g.box(0.14, 0.9, 1.0, [s * (w / 2 + 0.18), 1.55, 0], P.woodLight);
    g.box(0.06, 0.7, 0.8, [s * (w / 2 + 0.22), 1.55, 0], P.glass, { emissive: s > 0 ? 0.9 : 0 });
  }
  // Roof with deep overhang over the porch.
  g.pushT([0, h, 0.6]);
  g.gable(w + 0.4, 1.9, d + 1.2, [0, 0, 0], P.wood);
  const ang = Math.atan2(1.9, (w + 0.4) / 2);
  const L = Math.hypot((w + 0.4) / 2, 1.9) + 0.5;
  for (const s of [-1, 1]) g.box(L, 0.18, d + 3.4, [s * ((w + 0.4) / 4 + 0.08), 0.95 + 0.12, 1.0], '#6d4f3a', { rot: [0, 0, -s * ang] });
  g.pop();
  // Porch deck + posts + railing.
  g.box(w + 0.6, 0.18, 2.2, [0, 0.28, d / 2 + 1.1], P.woodLight);
  for (const x of [-w / 2, w / 2]) g.cyl(0.1, 0.1, 2.6, [x, 1.55, d / 2 + 2.05], P.woodDark, { seg: 6 });
  g.box(w, 0.08, 0.08, [0, 1.0, d / 2 + 2.1], P.woodDark);
  // Chimney.
  g.box(0.7, 2.6, 0.7, [w / 2 - 1.0, h + 1.0, -0.8], P.stone);
  g.box(0.85, 0.15, 0.85, [w / 2 - 1.0, h + 2.35, -0.8], P.stoneDark);
  // Porch clutter: old computers waiting for repair, archive boxes, lantern.
  g.rbox(0.55, 0.45, 0.5, 0.04, [1.9, 0.62, d / 2 + 0.9], '#d6ccb4');
  g.box(0.4, 0.3, 0.02, [1.9, 0.64, d / 2 + 1.16], '#20303c', { emissive: 1.3 });
  g.box(0.25, 0.55, 0.5, [2.45, 0.65, d / 2 + 0.9], '#d6ccb4');
  for (let i = 0; i < 3; i++) g.box(0.5, 0.35, 0.4, [-2.4 + (i % 2) * 0.1, 0.55 + i * 0.36, d / 2 + 0.7], i % 2 ? '#c9a77a' : '#b8946a');
  g.cyl(0.1, 0.12, 0.3, [0.2, 0.52, d / 2 + 1.9], P.ink, { seg: 6 });
  g.sphere(0.1, [0.2, 0.72, d / 2 + 1.9], '#ffd27f', { emissive: 1.7, ws: 6, hs: 4 });
  c.collider({ type: 'box', x: 0, z: 0, hx: w / 2 + 0.25, hz: d / 2 + 0.25, h: h + 1.9, camera: true });
  c.surface({ x: 0, z: d / 2 + 1.1, hx: w / 2 + 0.3, hz: 1.1, y0: 0.37, y1: 0.37, material: 'wood' });
  for (const x of [-w / 2, w / 2]) c.collider({ type: 'circle', x, z: d / 2 + 2.05, r: 0.12, h: 2.6 });
  c.anchor('porch', 0.4, 0.37, d / 2 + 1.2, 0);
  c.anchor('desk', -1.6, 0.37, d / 2 + 1.0, 0);
  c.interact({ id: 'hills.cabin.archive', kind: 'read', label: 'Browse the archive boxes', x: -2.4, y: 0.8, z: d / 2 + 1.3, heading: Math.PI, radius: 1.5, data: { doc: 'cabin.archive' } });
});

defineKit('windmill', (c) => {
  const g = c.g;
  g.cyl(0.9, 1.4, 6, [0, 3, 0], P.paper, { seg: 8 });
  g.cone(1.3, 1.6, [0, 6.8, 0], P.brick, { seg: 8 });
  g.box(0.9, 1.6, 0.1, [0, 0.8, 1.3], P.woodDark, { rot: [-0.1, 0, 0] });
  c.spin(
    (s) => {
      s.cyl(0.2, 0.2, 0.5, [0, 0, 0.2], P.woodDark, { rot: [Math.PI / 2, 0, 0], seg: 8 });
      for (let i = 0; i < 4; i++) {
        s.pushT([0, 0, 0.45], [0, 0, (i * Math.PI) / 2]);
        s.box(0.12, 3.2, 0.06, [0, 1.7, 0], P.woodDark);
        s.box(0.7, 2.6, 0.03, [0.38, 1.9, 0], P.paper);
        s.pop();
      }
    },
    [0, 5.7, 1.3],
    [0, 0, 1],
    0.7,
  );
  c.collider({ type: 'circle', x: 0, z: 0, r: 1.35, h: 7 });
});

defineKit('observatory', (c) => {
  const g = c.g;
  const r = 3.1;
  g.cyl(r + 0.4, r + 0.6, 0.5, [0, 0, 0], P.stoneDark, { seg: 24 });
  g.cyl(r, r, 4.2, [0, 2.3, 0], P.paper, { seg: 24 });
  g.cyl(r + 0.12, r + 0.12, 0.3, [0, 4.4, 0], P.stone, { seg: 24 });
  // Rotating dome with an observation slit.
  c.spin(
    (s) => {
      s.sphere(r, [0, 0, 0], '#cfd9e2', { ws: 24, hs: 10, scale: [1, 0.9, 1] });
      s.box(1.0, 3.0, r * 2.05, [0, 1.0, 0], P.navy, { rot: [0.55, 0, 0], scale: [1, 1, 0.5] });
      s.cyl(0.35, 0.45, 2.6, [0, 1.4, 1.3], P.metalDark, { rot: [0.95, 0, 0], seg: 10 });
    },
    [0, 4.55, 0],
    [0, 1, 0],
    0.05,
  );
  // Door, windows, steps.
  g.box(1.2, 2.2, 0.3, [0, 1.35, r - 0.05], P.navy);
  g.box(1.45, 0.15, 0.4, [0, 2.5, r + 0.05], P.stone);
  g.rbox(2.2, 0.25, 1.4, 0.04, [0, 0.12, r + 0.7], P.stone);
  for (const a of [-1.0, 1.0, 2.2, -2.2]) {
    g.pushT([Math.sin(a) * (r + 0.02), 2.8, Math.cos(a) * (r + 0.02)], [0, a, 0]);
    g.cyl(0.32, 0.32, 0.12, [0, 0, 0], P.stone, { rot: [Math.PI / 2, 0, 0], seg: 12 });
    g.cyl(0.24, 0.24, 0.08, [0, 0, 0.04], P.glass, { rot: [Math.PI / 2, 0, 0], seg: 12, emissive: 0.9 });
    g.pop();
  }
  c.sign(0, 3.55, r + 0.2, 2.6, 0.4, 0, { text: 'LUNA OBSERVATORY', bg: P.navy, fg: P.paper, style: 'banner' });
  // Radio console and small antenna array beside the dome.
  const cx = r + 1.8, cz = 1.2, th = -0.6;
  const rot = (x: number, z: number): [number, number] => [cx + x * Math.cos(th) + z * Math.sin(th), cz - x * Math.sin(th) + z * Math.cos(th)];
  g.pushT([cx, 0, cz], [0, th, 0]);
  g.rbox(1.6, 1.0, 0.7, 0.05, [0, 0.5, 0], P.slate);
  g.box(1.3, 0.75, 0.08, [0, 1.38, -0.1], P.ink);
  g.cyl(0.04, 0.05, 3.2, [0.5, 1.6, -0.4], P.metal, { seg: 6 });
  for (let i = 0; i < 3; i++) g.box(0.9 - i * 0.2, 0.03, 0.03, [0.5, 2.4 + i * 0.35, -0.4], P.metal);
  g.sphere(0.07, [0.5, 3.25, -0.4], P.red, { emissive: 1.9, ws: 6, hs: 4 });
  g.pop();
  const [sx, sz] = rot(0, -0.05);
  c.screen(sx, 1.38, sz, 1.18, 0.64, th, 'signal', 'observatory', 1);
  const [ix, iz] = rot(0, 1.0);
  c.anchor('console', ix, 0, iz, th + Math.PI);
  c.interact({ id: 'hills.observatory.console', kind: 'screen', label: 'Use the radio console', x: ix, y: 1.2, z: iz, heading: th + Math.PI, radius: 1.8, data: { screen: 'signal', title: 'Observatory Radio — 21.0 MHz' } });
  c.collider({ type: 'circle', x: 0, z: 0, r: r + 0.3, h: 7 });
  c.collider({ type: 'box', x: cx, z: cz, hx: 0.85, hz: 0.45, h: 1.8, rot: th });
  c.anchor('door', 0, 0, r + 1.6, 0);
});

/** The Genesis Stone memorial with its four dial pillars (an environmental puzzle). */
defineKit('memorial', (c) => {
  const g = c.g;
  g.cyl(4.2, 4.4, 0.25, [0, 0.05, 0], P.stone, { seg: 32 });
  g.cyl(3.4, 3.4, 0.08, [0, 0.2, 0], '#cbbfac', { seg: 32 });
  // Monolith.
  g.rbox(1.5, 3.6, 0.7, 0.12, [0, 2.0, 0], '#7d7468');
  g.rbox(1.7, 0.3, 0.9, 0.06, [0, 0.35, 0], P.stoneDark);
  g.box(1.1, 1.2, 0.05, [0, 2.2, 0.36], '#a2988b');
  c.sign(0, 2.25, 0.39, 1.05, 1.15, 0, { text: 'GENESIS', sub: 'block 0 · the first message', bg: '#a2988b', fg: '#3c362e', style: 'plaque', accent: '#c9b98f' });
  g.box(0.9, 0.12, 0.12, [0, 3.95, 0], P.gold, { emissive: 1.1 });
  c.collider({ type: 'box', x: 0, z: 0, hx: 0.85, hz: 0.45, h: 3.9, camera: false });
  c.interact({ id: 'hills.memorial', kind: 'read', label: 'Read the Genesis Stone', x: 0, y: 1.5, z: 1.4, heading: Math.PI, radius: 2.0, data: { doc: 'memorial.genesis' } });
  // Four dial pillars on an arc behind the stone.
  for (let i = 0; i < 4; i++) {
    const a = Math.PI + (i - 1.5) * 0.55;
    const x = Math.sin(a) * 3.0, z = Math.cos(a) * 3.0;
    g.cyl(0.32, 0.38, 1.1, [x, 0.55, z], '#8f867a', { seg: 8 });
    g.cyl(0.36, 0.36, 0.1, [x, 1.15, z], P.stoneDark, { seg: 8 });
    c.anchor(`dial${i}`, x, 1.22, z, a + Math.PI);
    c.collider({ type: 'circle', x, z, r: 0.4, h: 1.3 });
    c.interact({ id: `hills.dial.${i}`, kind: 'dial', label: 'Turn the dial', x: x * 0.82, y: 1.0, z: z * 0.82, heading: a + Math.PI, radius: 1.3, data: { dial: i } });
  }
  c.anchor('beacon', 0, 4.4, 0);
  c.anchor('visitor', 1.6, 0.25, 2.2, Math.PI);
});

defineKit('shack.miner', (c) => {
  const g = c.g;
  g.rbox(4.2, 2.5, 3.4, 0.06, [0, 1.25, 0], '#b78f62');
  for (let i = 0; i < 8; i++) g.box(0.06, 2.5, 0.05, [-1.9 + i * 0.54, 1.25, 1.72], P.woodDark);
  g.box(4.8, 0.15, 4.4, [0, 2.65, 0.3], P.slate, { rot: [0.12, 0, 0] });
  g.box(0.9, 1.9, 0.08, [-1.1, 0.95, 1.74], P.woodDark);
  g.box(1.0, 0.7, 0.08, [0.9, 1.5, 1.74], P.glass, { emissive: 0.9 });
  // Porch with the old rig and a rocking chair.
  g.box(4.4, 0.15, 1.6, [0, 0.1, 2.5], P.woodLight);
  g.rbox(0.5, 1.0, 0.9, 0.05, [1.4, 0.68, 2.4], '#d6ccb4');
  g.box(0.05, 0.12, 0.6, [1.66, 1.0, 2.4], '#2b2b2b');
  g.sphere(0.04, [1.66, 0.75, 2.75], '#58d6a0', { emissive: 1.8, ws: 6, hs: 4 });
  g.pushT([-0.6, 0.18, 2.6], [0, 0.4, 0]);
  g.box(0.6, 0.06, 0.55, [0, 0.45, 0], P.woodDark);
  g.box(0.6, 0.7, 0.06, [0, 0.82, -0.26], P.woodDark, { rot: [-0.2, 0, 0] });
  g.torus(0.45, 0.03, [0, 0.1, 0], P.woodDark, { rot: [0, Math.PI / 2, 0], arc: Math.PI * 0.6 });
  g.pop();
  c.sign(0.9, 2.15, 1.76, 1.4, 0.3, 0, { text: "SAT'S PLACE", bg: P.woodLight, fg: P.ink, style: 'banner' });
  c.collider({ type: 'box', x: 0, z: 0, hx: 2.15, hz: 1.75, h: 2.8, camera: true });
  c.collider({ type: 'box', x: 1.4, z: 2.4, hx: 0.3, hz: 0.5, h: 1.2 });
  c.anchor('chair', -0.6, 0.18, 2.6, 0.4);
  c.interact({ id: 'hills.sat.rig', kind: 'inspect', label: 'Inspect the old mining rig', x: 1.4, y: 0.9, z: 3.3, heading: Math.PI, radius: 1.5, data: { doc: 'sat.rig' } });
});

/** A ring of decommissioned server cabinets — "Server Henge". */
defineKit('server.henge', (c) => {
  const g = c.g;
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * 4.2, z = Math.sin(a) * 4.2;
    const tall = i % 3 !== 0;
    g.pushT([x, 0, z], [0, -a + Math.PI / 2, c.rng.range(-0.08, 0.08)]);
    g.rbox(0.9, tall ? 2.6 : 1.8, 0.8, 0.05, [0, tall ? 1.3 : 0.9, 0], '#9aa0a6');
    for (let k = 0; k < (tall ? 6 : 4); k++) {
      g.box(0.7, 0.06, 0.02, [0, 0.4 + k * 0.35, 0.41], P.metalDark);
      g.sphere(0.03, [0.28, 0.45 + k * 0.35, 0.42], k % 2 ? '#58d6a0' : '#f0b04a', { emissive: c.rng.chance(0.5) ? 1.6 : 0, ws: 4, hs: 3 });
    }
    g.box(1.0, 0.12, 0.9, [0, tall ? 2.66 : 1.86, 0], P.metalDark);
    g.pop();
    if (i % 3 === 1) {
      const b = ((i + 0.5) / n) * Math.PI * 2;
      g.pushT([Math.cos(b) * 4.2, 2.75, Math.sin(b) * 4.2], [0, -b + Math.PI / 2, 0]);
      g.rbox(2.0, 0.3, 0.7, 0.05, [0, 0, 0], '#9aa0a6');
      g.pop();
    }
    c.collider({ type: 'circle', x, z, r: 0.6, h: tall ? 2.6 : 1.8 });
  }
  g.cyl(0.6, 0.7, 0.6, [0, 0.3, 0], P.stone, { seg: 10 });
  g.rbox(0.6, 0.35, 0.45, 0.04, [0, 0.78, 0], '#e0d7c2');
  g.box(0.42, 0.24, 0.02, [0, 0.8, 0.23], '#20303c', { emissive: 1.2 });
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.7, h: 1 });
  c.anchor('center', 0, 0, 1.4, Math.PI);
  c.interact({ id: 'hills.henge.terminal', kind: 'read', label: 'Read the ancient terminal', x: 0, y: 0.8, z: 1.2, heading: Math.PI, radius: 1.5, data: { doc: 'henge.terminal' } });
});

defineKit('lookout', (c) => {
  const g = c.g;
  bench(g, P.woodLight);
  for (let i = -2; i <= 2; i++) g.box(0.08, 1.0, 0.08, [i * 1.2, 0.5, 1.4], P.woodDark);
  g.box(5, 0.08, 0.08, [0, 1.0, 1.4], P.woodDark);
  g.box(5, 0.06, 0.06, [0, 0.55, 1.4], P.woodDark);
  c.collider({ type: 'box', x: 0, z: 1.4, hx: 2.5, hz: 0.1, h: 1.05 });
  c.collider({ type: 'box', x: 0, z: 0, hx: 0.85, hz: 0.25, h: 0.5 });
  // Coin-free binocular viewer.
  g.cyl(0.08, 0.1, 1.2, [2.0, 0.6, 0.7], P.navy, { seg: 8 });
  g.rbox(0.5, 0.3, 0.35, 0.08, [2.0, 1.35, 0.75], P.navy, { rot: [0.2, 0, 0] });
  for (const x of [-0.12, 0.12]) g.cyl(0.07, 0.07, 0.25, [2.0 + x, 1.38, 0.95], P.ink, { rot: [Math.PI / 2 + 0.2, 0, 0], seg: 8 });
  c.collider({ type: 'circle', x: 2.0, z: 0.7, r: 0.3, h: 1.5 });
  c.interact({ id: c.params.iid ?? c.id, kind: 'view', label: 'Look through the viewer', x: 2.0, y: 1.2, z: 0.1, heading: 0, radius: 1.4, data: { doc: c.params.doc ?? 'lookout.halving' } });
  c.interact({ id: `${c.id}.bench`, kind: 'sit', label: 'Sit and enjoy the view', x: 0, y: 0.45, z: -0.05, heading: 0, radius: 1.4 });
  if (c.params.sign) c.sign(-2.4, 1.3, 1.4, 1.6, 0.42, 0, { text: c.params.sign, bg: P.woodLight, fg: P.ink, style: 'banner' }, { double: true, depth: 0.06 });
});

defineKit('gate.arch', (c) => {
  const g = c.g;
  const w = c.params.w ?? 4.4;
  for (const x of [-w / 2, w / 2]) {
    g.cyl(0.18, 0.22, 3.6, [x, 1.8, 0], P.woodDark, { seg: 8 });
    g.rbox(0.6, 0.4, 0.6, 0.05, [x, 0.2, 0], P.stone);
    c.collider({ type: 'circle', x, z: 0, r: 0.3, h: 3.6 });
  }
  g.box(w + 0.8, 0.3, 0.3, [0, 3.5, 0], P.woodDark);
  g.box(w + 0.4, 0.75, 0.12, [0, 3.0, 0], P.woodLight);
  c.sign(0, 3.0, 0, w, 0.62, 0, { text: c.params.text ?? 'WELCOME', sub: c.params.sub, bg: c.params.bg ?? P.woodLight, fg: c.params.fg ?? P.ink, style: 'banner' }, { double: true, depth: 0.065 });
  for (let i = 0; i < 6; i++) g.sphere(0.12, [-w / 2 + i * (w / 5), 3.72, 0], c.rng.pick(['#f29db0', '#f6d55c', '#ffffff']), { ws: 6, hs: 4, wind: 0.2 });
});

defineKit('picnic', (c) => {
  const g = c.g;
  g.box(2.0, 0.08, 0.8, [0, 0.78, 0], P.woodLight);
  for (const s of [-1, 1]) {
    g.box(2.0, 0.06, 0.3, [0, 0.45, s * 0.65], P.woodLight);
    for (const x of [-0.8, 0.8]) g.box(0.08, 0.8, 0.08, [x, 0.4, s * 0.3], P.woodDark, { rot: [s * 0.3, 0, 0] });
  }
  g.rbox(0.5, 0.25, 0.35, 0.05, [0.4, 0.95, 0], '#c94c43');
  g.cyl(0.05, 0.05, 0.22, [-0.4, 0.93, 0.1], '#f3e6cf', { seg: 6 });
  c.collider({ type: 'box', x: 0, z: 0, hx: 1.05, hz: 0.85, h: 0.85 });
  c.interact({ id: `${c.id}.seat`, kind: 'sit', label: 'Sit', x: 0, y: 0.45, z: 0.65, heading: Math.PI, radius: 1.2 });
});

defineKit('garden', (c) => {
  const g = c.g;
  const w = c.params.w ?? 4, d = c.params.d ?? 3;
  for (let i = 0; i < 4; i++) g.box(w - 0.4, 0.15, 0.4, [0, 0.08, -d / 2 + 0.5 + i * ((d - 0.8) / 3)], '#6b4f36');
  for (let i = 0; i < 16; i++) g.sphere(0.16, [c.rng.range(-w / 2 + 0.4, w / 2 - 0.4), 0.25, -d / 2 + 0.5 + (i % 4) * ((d - 0.8) / 3)], c.rng.pick([P.leaf, '#e8644a', P.leafLight, '#f2b544']), { ws: 6, hs: 4, wind: 0.2 });
  for (const s of [-1, 1]) {
    for (let i = 0; i <= 5; i++) g.box(0.06, 0.7, 0.06, [-w / 2 + (i * w) / 5, 0.35, s * d / 2], P.woodLight);
    g.box(w, 0.05, 0.04, [0, 0.55, s * d / 2], P.woodLight);
  }
  c.collider({ type: 'box', x: 0, z: 0, hx: w / 2, hz: d / 2, h: 0.7 });
});
