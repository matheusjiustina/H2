import { defineKit } from '../content/Kit';
import { GeoBuilder } from '../kit/GeoBuilder';
import { building } from './buildings';
import { rack } from './mining';
import { P } from './palette';

const STEEL = '#9aa6b2';
const STEEL_DARK = '#5b6672';

/** Lattice antenna tower with a blinking aircraft light. */
export function lattice(g: GeoBuilder, h: number, base: number, top: number, col = STEEL): void {
  const legs: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const lean = (base - top) / 2;
  for (const [sx, sz] of legs) {
    const ang = Math.atan2(lean, h);
    g.box(0.1, Math.hypot(h, lean), 0.1, [sx * (base + top) / 4, h / 2, sz * (base + top) / 4], col, { rot: [sz * ang, 0, -sx * ang] });
  }
  const levels = Math.round(h / 1.6);
  for (let i = 0; i <= levels; i++) {
    const y = (i / levels) * h;
    const half = base / 2 - (base - top) / 2 * (y / h);
    for (const s of [-1, 1]) {
      g.box(half * 2, 0.06, 0.06, [0, y, s * half], col);
      g.box(0.06, 0.06, half * 2, [s * half, y, 0], col);
    }
    if (i < levels) {
      const y2 = ((i + 1) / levels) * h;
      const half2 = base / 2 - (base - top) / 2 * (y2 / h);
      const L = Math.hypot(half + half2, y2 - y);
      const a = Math.atan2(y2 - y, half + half2);
      for (const s of [-1, 1]) {
        g.box(L, 0.04, 0.04, [0, (y + y2) / 2, s * (half + half2) / 2], col, { rot: [0, 0, a * (i % 2 ? 1 : -1)] });
        g.box(0.04, 0.04, L, [s * (half + half2) / 2, (y + y2) / 2, 0], col, { rot: [a * (i % 2 ? 1 : -1), 0, 0] });
      }
    }
  }
}

defineKit('antenna.tower', (c) => {
  const g = c.g;
  const h = c.params.h ?? 13;
  g.rbox(2.6, 0.4, 2.6, 0.05, [0, 0.2, 0], P.stoneDark);
  lattice(g, h, 2.2, 0.6);
  g.cyl(0.05, 0.05, 2.4, [0, h + 1.2, 0], STEEL_DARK, { seg: 6 });
  for (let i = 0; i < 3; i++) g.box(0.9 - i * 0.2, 0.05, 0.05, [0, h + 0.5 + i * 0.6, 0], STEEL_DARK);
  g.sphere(0.16, [0, h + 2.5, 0], P.red, { emissive: 2, ws: 8, hs: 6 });
  g.sphere(0.1, [0, h * 0.55, 0.62], P.red, { emissive: 1.8, ws: 6, hs: 4 });
  for (const s of [-1, 1]) g.cyl(0.32, 0.32, 0.16, [s * 0.5, h * 0.8, 0], P.paper, { rot: [0, 0, Math.PI / 2], seg: 12 });
  c.collider({ type: 'box', x: 0, z: 0, hx: 1.25, hz: 1.25, h: h + 2 });
  c.anchor('top', 0, h + 2.9, 0);
  c.anchor('base', 0, 0, 2.0, Math.PI);
});

defineKit('institute', (c) => {
  const g = c.g;
  const w = 10, d = 7;
  const r = building(c, {
    w, d, floors: 2, floorH: 3.0, wall: P.paper, trim: P.deepTeal, roof: 'none', base: P.stoneDark, cornice: true,
    windows: { style: 'wide', per: 4, lit: 0.7, frame: P.deepTeal }, door: { x: -2.8, color: P.deepTeal, double: true, canopy: P.deepTeal },
    sign: { text: 'INSTITUTE OF DISTRIBUTED SYSTEMS', sub: 'research · listening · consensus', bg: P.deepTeal, fg: P.paper, icon: 'antenna', accent: P.butter, w: 6.2, h: 0.75, y: 2.7 },
  });
  const top = r.H + 0.1;
  g.box(w + 0.1, 0.2, d + 0.1, [0, top + 0.1, 0], P.stone);
  c.surface({ x: 0, z: 0, hx: w / 2, hz: d / 2, y0: top + 0.2, y1: top + 0.2, material: 'stone' });
  // Glass railings with a stair gap at +x / -z.
  for (const [x, z, hx, hz] of [[0, d / 2 - 0.05, w / 2, 0.06], [0, -d / 2 + 0.05, w / 2 - 1.3, 0.06], [-(w / 2 - 0.05), 0, 0.06, d / 2]] as [number, number, number, number][]) {
    g.box(hx * 2, 0.9, hz * 2 + 0.02, [x - (z < 0 ? 1.3 : 0), top + 0.65, z], '#bfe3f1', { emissive: 0 });
    g.box(hx * 2 + 0.04, 0.06, hz * 2 + 0.06, [x - (z < 0 ? 1.3 : 0), top + 1.12, z], P.deepTeal);
    c.collider({ type: 'box', x: x - (z < 0 ? 1.3 : 0), z, hx, hz: Math.max(hz, 0.08), h: 1.1, y0: top + 0.2 });
  }
  g.box(0.12, 0.9, d, [w / 2 - 0.05, top + 0.65, 0], '#bfe3f1');
  g.box(0.12, 0.06, d, [w / 2 - 0.05, top + 1.12, 0], P.deepTeal);
  c.collider({ type: 'box', x: w / 2 - 0.05, z: 0, hx: 0.08, hz: d / 2, h: 1.1, y0: top + 0.2 });
  // Outdoor stairs along the back (-z) side, rising toward +x.
  const run = 6.4, sz = -d / 2 - 0.8;
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const y = ((i + 1) / steps) * (top + 0.2);
    g.box(run / steps + 0.02, 0.16, 1.4, [w / 2 - run + ((i + 0.5) * run) / steps, y - 0.08, sz], P.stone);
  }
  c.surface({ x: w / 2 - run / 2, z: sz, hx: 0.7, hz: run / 2, y0: 0, y1: top + 0.2, rot: Math.PI / 2, material: 'stone' });
  c.surface({ x: w / 2 - 0.7, z: -d / 2 + 0.2, hx: 0.8, hz: 1.2, y0: top + 0.2, y1: top + 0.2, material: 'stone' });
  c.collider({ type: 'box', x: w / 2 - run / 2, z: sz - 0.75, hx: run / 2, hz: 0.06, h: top + 1.2 });
  g.box(run, 0.06, 0.06, [w / 2 - run / 2, top / 2 + 1.0, sz - 0.72], P.deepTeal, { rot: [0, 0, Math.atan2(top, run)] });
  // Rooftop telescope and benches.
  g.cyl(0.08, 0.12, 1.1, [-2.5, top + 0.75, 1.2], STEEL_DARK, { seg: 8 });
  g.cyl(0.18, 0.14, 1.4, [-2.5, top + 1.45, 1.6], P.paper, { rot: [1.0, 0, 0], seg: 10 });
  c.collider({ type: 'circle', x: -2.5, z: 1.2, r: 0.35, h: 1.6, y0: top + 0.2 });
  c.interact({ id: 'heights.institute.telescope', kind: 'view', label: 'Look through the telescope', x: -2.5, y: top + 1.0, z: 0.4, heading: 0, radius: 1.4, data: { doc: 'institute.telescope' } });
  g.pushT([1.8, top + 0.2, 1.6], [0, Math.PI, 0]);
  for (const x of [-0.75, 0.75]) g.box(0.08, 0.42, 0.42, [x, 0.21, 0], P.ink);
  g.box(1.75, 0.08, 0.45, [0, 0.45, 0], P.woodLight);
  g.pop();
  c.interact({ id: 'heights.institute.roofbench', kind: 'sit', label: 'Sit on the rooftop bench', x: 1.8, y: top + 0.65, z: 1.6, heading: Math.PI, radius: 1.3 });
  c.anchor('roof', 0, top + 0.2, 0);
  c.anchor('door', -2.8, 0, d / 2 + 1.2, 0);
});

defineKit('comm.station', (c) => {
  const g = c.g;
  building(c, { w: 6, d: 4.6, floors: 1, floorH: 3.0, wall: '#dfe4e8', trim: STEEL_DARK, roof: 'flat', base: P.stoneDark, windows: { style: 'porthole', per: 2, lit: 0.6 }, door: { x: 1.6, color: STEEL_DARK },
    sign: { text: 'COMMS STATION 5', sub: 'the fifth link of the chain', bg: STEEL_DARK, fg: P.paper, icon: 'antenna', accent: P.amber, w: 3.6, h: 0.62, y: 2.6 } });
  // Dish on a pedestal beside the station.
  const px = -5.2, pz = 0.6;
  g.cyl(0.9, 1.2, 0.6, [px, 0.3, pz], P.stoneDark, { seg: 12 });
  g.cyl(0.35, 0.45, 3.0, [px, 2.0, pz], STEEL, { seg: 10 });
  c.spin((s) => {
    s.pushT([0, 0, 0], [0.6, 0, 0]);
    s.lathe([[0.05, 0], [1.2, 0.25], [2.2, 0.75], [2.4, 0.95]], [0, 0, 0], P.paper, { seg: 20 });
    s.cyl(0.05, 0.05, 1.6, [0, 1.0, 0], STEEL_DARK, { seg: 6 });
    s.sphere(0.16, [0, 1.8, 0], STEEL_DARK, { ws: 8, hs: 6 });
    s.pop();
  }, [px, 3.6, pz], [0, 1, 0], 0.12);
  c.collider({ type: 'circle', x: px, z: pz, r: 1.3, h: 4 });
  // Console under an awning.
  g.rbox(1.4, 1.0, 0.6, 0.05, [-2.2, 0.5, 3.0], '#7f8d9a');
  g.box(1.1, 0.7, 0.06, [-2.2, 1.35, 2.85], P.ink);
  c.screen(-2.2, 1.35, 2.89, 1.0, 0.62, 0, 'relaymap', 'station', 1);
  c.collider({ type: 'box', x: -2.2, z: 3.0, hx: 0.75, hz: 0.35, h: 1.7 });
  c.anchor('console', -2.2, 0, 4.0, Math.PI);
  c.anchor('beacon', px, 6.4, pz);
  c.interact({ id: 'heights.station.console', kind: 'mission', label: 'Inspect the station console', x: -2.2, y: 1.2, z: 3.9, heading: Math.PI, radius: 1.7, data: { screen: 'relaymap', title: 'Comms Station 5' } });
  c.interact({ id: 'heights.station.socket', kind: 'mission', label: 'Check the empty socket', x: px + 1.2, y: 0.8, z: pz + 1.2, heading: Math.PI + 0.8, radius: 1.5, data: { title: 'Dish pedestal' } });
});

defineKit('control.center', (c) => {
  const g = c.g;
  const w = 9, d = 6, h = 3.6;
  g.rbox(w + 0.4, 0.8, d + 0.4, 0.05, [0, -0.25, 0], P.stoneDark);
  g.rbox(w, h, d, 0.08, [0, h / 2 + 0.1, -0.3], '#e7ecef');
  // Curved glass front.
  g.cyl(d * 0.62, d * 0.62, h - 0.3, [0, h / 2 + 0.05, 0.2], P.glass, { seg: 24, open: true, scale: [w / (d * 1.24), 1, 0.55], emissive: 0.8 });
  g.cyl(d * 0.64, d * 0.64, 0.3, [0, h + 0.05, 0.2], P.paper, { seg: 24, scale: [w / (d * 1.24), 1, 0.57] });
  g.rbox(w + 1.4, 0.3, d + 1.6, 0.06, [0, h + 0.3, 0], P.paper);
  for (let i = 0; i < 3; i++) {
    g.box(1.6, 1.0, 0.1, [-2.4 + i * 2.4, 2.0, -d / 2 + 0.5], P.ink);
    c.screen(-2.4 + i * 2.4, 2.0, -d / 2 + 0.56, 1.45, 0.88, 0, (['network', 'relaymap', 'explorer'] as const)[i], `control-${i}`, 1);
  }
  g.rbox(5, 0.9, 0.9, 0.05, [0, 0.45, 0.4], '#c9d3db');
  c.sign(0, h + 0.3, d / 2 + 0.82, 4.8, 0.32, 0, { text: 'CONSENSUS CONTROL', bg: P.paper, fg: P.navy, style: 'banner' });
  c.collider({ type: 'box', x: 0, z: 0, hx: w / 2 + 0.1, hz: d / 2 + 0.5, h: h + 0.5, camera: true });
  c.anchor('front', 0, 0, d / 2 + 1.6, 0);
  c.interact({ id: 'heights.control.screens', kind: 'screen', label: 'Watch the network map', x: 2.6, y: 1.4, z: d / 2 + 1.3, heading: Math.PI, radius: 1.8, data: { screen: 'relaymap', title: 'Consensus Control — The Chain' } });
  c.interact({ id: 'heights.control.final', kind: 'mission', label: 'Approach the master console', x: -2.4, y: 1.4, z: d / 2 + 1.3, heading: Math.PI, radius: 1.8, data: { title: 'Master Console' } });
});

defineKit('checkpoint', (c) => {
  const g = c.g;
  g.rbox(2.0, 2.6, 1.8, 0.06, [0, 1.3, 0], P.paper);
  g.box(1.6, 0.9, 0.06, [0, 1.7, 0.92], P.glass, { emissive: 0.9 });
  g.box(2.4, 0.18, 2.2, [0, 2.7, 0], P.navy);
  g.box(0.3, 1.1, 0.3, [1.4, 0.55, 1.2], '#e8b84a');
  for (let i = 0; i < 6; i++) g.box(0.55, 0.12, 0.12, [1.4 - 0.35 + 0.2, 1.25 + i * 0.55, 1.2], i % 2 ? P.red : P.paper, { rot: [0, 0, 0] });
  c.sign(0, 2.25, 0.93, 1.8, 0.3, 0, { text: 'VALIDATOR CHECKPOINT', bg: P.navy, fg: P.paper, style: 'banner' });
  c.collider({ type: 'box', x: 0, z: 0, hx: 1.05, hz: 0.95, h: 2.8, camera: true });
  c.collider({ type: 'circle', x: 1.4, z: 1.2, r: 0.25, h: 4.5 });
  c.anchor('guard', -0.2, 0, 1.6, 0);
  c.interact({ id: 'heights.checkpoint.sign', kind: 'read', label: 'Read the checkpoint rules', x: -0.9, y: 1.2, z: 1.5, heading: Math.PI, radius: 1.4, data: { doc: 'checkpoint.rules' } });
});

defineKit('lab', (c) => {
  const g = c.g;
  building(c, { w: 7, d: 5.5, floors: 1, floorH: 3.4, wall: '#e9eef2', trim: P.violet, roof: 'flat', rooftop: 'ac', base: P.stoneDark, windows: { style: 'wide', per: 2, lit: 0.9, sides: false }, door: { x: 2.2, color: P.violet }, shopfront: { color: P.violet, w: 3.2 },
    sign: { text: 'INFRASTRUCTURE LAB', sub: 'nodes · validators · coffee', bg: P.violet, fg: P.paper, icon: 'gear', accent: P.butter, w: 4.2, h: 0.62, y: 3.0 } });
  for (let i = 0; i < 3; i++) rack(g, -1.8 + i * 1.0, 1.4, 0, c.rng, 2.0);
});

defineKit('pole.marker', (c) => {
  const g = c.g;
  g.cyl(0.12, 0.12, 3.2, [0, 1.6, 0], P.paper, { seg: 10 });
  for (let i = 0; i < 6; i++) g.cyl(0.125, 0.125, 0.25, [0, 0.4 + i * 0.5, 0], P.red, { seg: 10 });
  g.sphere(0.3, [0, 3.35, 0], P.amber, { ws: 10, hs: 8, emissive: 1.2 });
  c.sign(0, 2.2, 0, 1.6, 0.42, 0, { text: c.params.text ?? 'TRUE NORTH', sub: c.params.sub ?? 'every direction is south', bg: P.paper, fg: P.ink, style: 'banner' }, { double: true, depth: 0.14 });
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.2, h: 3.4 });
  c.interact({ id: c.params.iid ?? c.id, kind: 'read', label: 'Read the marker', x: 0, y: 1.2, z: 1.0, heading: Math.PI, radius: 1.6, data: { doc: c.params.doc ?? 'pole.north' } });
});
