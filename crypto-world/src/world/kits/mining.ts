import { defineKit } from '../content/Kit';
import { GeoBuilder } from '../kit/GeoBuilder';
import { P } from './palette';

const STEEL = '#8e9aa6';
const STEEL_DARK = '#5b6672';
const HAZARD = '#f0b04a';

/** Server rack with blinking status LEDs (emissive). */
export function rack(g: GeoBuilder, x: number, z: number, rot: number, rng: { chance(p: number): boolean }, h = 2.2): void {
  g.pushT([x, 0, z], [0, rot, 0]);
  g.rbox(0.9, h, 1.0, 0.04, [0, h / 2, 0], '#2c333c');
  for (let i = 0; i < 8; i++) {
    g.box(0.78, 0.18, 0.02, [0, 0.25 + i * (h - 0.4) / 8, 0.51], '#3b444f');
    g.box(0.05, 0.05, 0.02, [0.3, 0.25 + i * (h - 0.4) / 8, 0.525], rng.chance(0.7) ? '#58d6a0' : '#f0b04a', { emissive: rng.chance(0.75) ? 1.9 : 0 });
    g.box(0.05, 0.05, 0.02, [0.2, 0.25 + i * (h - 0.4) / 8, 0.525], '#7cc8ff', { emissive: rng.chance(0.5) ? 1.6 : 0 });
  }
  g.pop();
}

defineKit('datacenter', (c) => {
  const g = c.g;
  const w = c.params.w ?? 12, d = c.params.d ?? 8, h = c.params.h ?? 6.4;
  g.rbox(w + 0.4, 0.9, d + 0.4, 0.05, [0, -0.3, 0], P.stoneDark);
  g.box(w, h, d, [0, h / 2, 0], c.params.wall ?? '#c9cdd1');
  // Corrugated ribs.
  for (const side of [-1, 1]) {
    for (let i = 0; i <= Math.round(w / 0.6); i++) g.box(0.08, h, 0.06, [-w / 2 + i * 0.6, h / 2, side * (d / 2 + 0.02)], '#b6bbc1');
    for (let i = 0; i <= Math.round(d / 0.6); i++) g.box(0.06, h, 0.08, [side * (w / 2 + 0.02), h / 2, -d / 2 + i * 0.6], '#b6bbc1');
  }
  g.box(w + 0.3, 0.3, d + 0.3, [0, h + 0.15, 0], STEEL_DARK);
  g.box(w + 0.32, 0.25, 0.1, [0, 1.0, d / 2 + 0.06], HAZARD);
  // Open loading bay revealing glowing racks.
  g.box(4.6, 3.6, 0.1, [-2.2, 1.8, d / 2 + 0.03], '#151b22');
  for (let i = 0; i < 4; i++) rack(g, -3.8 + i * 1.05, d / 2 - 1.0, 0, c.rng, 2.4);
  g.box(5.0, 0.3, 0.3, [-2.2, 3.75, d / 2 + 0.12], HAZARD);
  for (let i = 0; i < 10; i++) g.box(0.46, 0.12, 0.05, [-4.45 + i * 0.5, 3.75, d / 2 + 0.28], i % 2 ? P.ink : HAZARD);
  // Roof fans.
  const cols = Math.max(2, Math.floor(w / 3.2)), rows = 2;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const fx = -w / 2 + (i + 0.5) * (w / cols), fz = -d / 4 + j * (d / 2);
      g.cyl(1.05, 1.05, 0.6, [fx, h + 0.55, fz], STEEL, { seg: 14, open: true });
      g.cyl(1.0, 1.0, 0.05, [fx, h + 0.32, fz], '#2c333c', { seg: 14 });
      g.box(2.1, 0.06, 0.08, [fx, h + 0.86, fz], STEEL_DARK);
      c.spin((s) => {
        for (let k = 0; k < 5; k++) s.box(0.85, 0.04, 0.26, [0.45, 0, 0], STEEL, { rot: [0.35, (k / 5) * Math.PI * 2, 0] });
        s.cyl(0.18, 0.18, 0.15, [0, 0, 0], STEEL_DARK, { seg: 8 });
      }, [fx, h + 0.62, fz], [0, 1, 0], 7 + c.rng.range(-1, 1.5));
    }
  // Side vents and cable tray.
  for (let i = 0; i < 4; i++) g.box(1.4, 0.9, 0.2, [w / 2 + 0.1, 2 + (i % 2) * 1.6, -2.4 + Math.floor(i / 2) * 3.2], '#9aa3ad', { rot: [0, Math.PI / 2, 0] });
  g.box(0.4, 0.15, d + 2, [-w / 2 - 0.4, 4.6, 0], STEEL_DARK);
  for (let i = 0; i < 5; i++) g.box(0.1, 4.6, 0.1, [-w / 2 - 0.4, 2.3, -d / 2 + i * (d / 4)], STEEL_DARK);
  // Screens & sign.
  g.box(2.6, 1.6, 0.15, [3.4, 3.2, d / 2 + 0.08], P.ink);
  c.screen(3.4, 3.2, d / 2 + 0.16, 2.4, 1.4, 0, 'hashrate', c.id, 1);
  g.box(1.6, 1.2, 0.15, [3.4, 1.5, d / 2 + 0.08], P.ink);
  c.screen(3.4, 1.5, d / 2 + 0.16, 1.4, 1.0, 0, 'monitor', c.id, 1);
  if (c.params.sign) c.sign(0, h - 0.8, d / 2 + 0.1, Math.min(7, w - 1), 0.9, 0, { text: c.params.sign, sub: c.params.sub, bg: P.ink, fg: HAZARD, icon: 'pick', accent: HAZARD, style: 'plaque' });
  c.collider({ type: 'box', x: 0, z: 0, hx: w / 2 + 0.25, hz: d / 2 + 0.1, h: h + 1, camera: true });
  c.anchor('bay', -2.2, 0, d / 2 + 1.6, 0);
  c.anchor('screens', 3.4, 0, d / 2 + 1.4, Math.PI);
  c.interact({ id: `${c.id}.screens`, kind: 'screen', label: 'Read the hashrate board', x: 3.4, y: 1.4, z: d / 2 + 1.1, heading: Math.PI, radius: 1.7, data: { screen: 'hashrate', title: 'Hashrate Hall — Live Board (simulated)' } });
});

defineKit('gpu.farm', (c) => {
  const g = c.g;
  const w = c.params.w ?? 10, d = c.params.d ?? 7;
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, -d / 2], [0, d / 2]]) {
    g.box(0.25, 3.6, 0.25, [x, 1.8, z], STEEL_DARK);
    c.collider({ type: 'circle', x, z, r: 0.2, h: 3.6 });
  }
  g.box(w + 1, 0.2, d + 1, [0, 3.7, 0], STEEL, { rot: [0.05, 0, 0] });
  g.box(w + 1.02, 0.25, 0.08, [0, 3.62, d / 2 + 0.5], HAZARD);
  // Three rows of open-frame rigs, each card with two spinning fans.
  for (let r = 0; r < 3; r++) {
    const z = -d / 2 + 1.4 + r * ((d - 2.8) / 2);
    g.box(w - 2, 0.08, 0.6, [0, 0.9, z], STEEL_DARK);
    g.box(w - 2, 0.08, 0.6, [0, 1.8, z], STEEL_DARK);
    for (const x of [-(w - 2) / 2, (w - 2) / 2]) g.box(0.08, 2.0, 0.6, [x, 1.0, z], STEEL_DARK);
    for (let i = 0; i < 6; i++) {
      const x = -(w - 2) / 2 + 0.7 + i * ((w - 3.4) / 5);
      for (const yy of [1.2, 2.1]) {
        g.box(0.9, 0.5, 0.12, [x, yy, z], '#2c333c');
        g.box(0.92, 0.05, 0.14, [x, yy + 0.27, z], c.rng.pick(['#58d6a0', '#7cc8ff', '#b49cff']), { emissive: 1.5 });
        for (const fx of [-0.22, 0.22]) {
          c.spin((s) => {
            s.box(0.34, 0.02, 0.07, [0, 0, 0], STEEL);
            s.box(0.07, 0.02, 0.34, [0, 0, 0], STEEL);
          }, [x + fx, yy, z + 0.08], [0, 0, 1], 9 + c.rng.range(-2, 3));
        }
      }
    }
    c.collider({ type: 'box', x: 0, z, hx: (w - 2) / 2, hz: 0.35, h: 2.4 });
  }
  g.box(1.5, 1.2, 0.12, [w / 2 - 1.2, 1.5, d / 2 + 0.3], P.ink);
  c.screen(w / 2 - 1.2, 1.5, d / 2 + 0.37, 1.3, 1.0, 0, 'monitor', 'farm', 1);
  if (c.params.sign) c.sign(0, 3.3, d / 2 + 0.56, 4.6, 0.4, 0, { text: c.params.sign, bg: P.ink, fg: HAZARD, style: 'banner' });
  c.anchor('aisle', 0, 0, d / 2 + 0.8, Math.PI);
});

defineKit('cooling.tower', (c) => {
  const g = c.g;
  const h = c.params.h ?? 7;
  g.lathe([[2.4, 0], [2.2, h * 0.25], [1.6, h * 0.65], [1.7, h * 0.9], [1.9, h]], [0, 0, 0], '#d7dbe0', { seg: 20 });
  g.lathe([[1.75, h], [1.6, h * 0.92], [1.5, h * 0.7]], [0, 0, 0], '#9aa3ad', { seg: 20 });
  for (let i = 0; i < 3; i++) g.cyl(2.25 - i * 0.12, 2.25 - i * 0.12, 0.12, [0, 0.8 + i * 1.6, 0], '#c3c8ce', { seg: 20 });
  // Steam puffs (gently bobbing).
  c.bob((b) => {
    for (let i = 0; i < 4; i++) b.sphere(0.9 + i * 0.25, [Math.sin(i) * 0.4, h + 0.9 + i * 0.9, Math.cos(i * 1.3) * 0.3], '#f3f6f8', { detail: 1, scale: [1, 0.7, 1] });
  }, 0.25, 0.6);
  c.collider({ type: 'circle', x: 0, z: 0, r: 2.4, h });
});

defineKit('transformer', (c) => {
  const g = c.g;
  g.rbox(2.2, 2.0, 1.6, 0.05, [0, 1.0, 0], '#7d8a7a');
  for (let i = 0; i < 7; i++) g.box(0.06, 1.6, 2.0, [-0.9 + i * 0.3, 1.0, 0], '#6c7869');
  for (const x of [-0.6, 0, 0.6]) {
    g.cyl(0.12, 0.16, 0.8, [x, 2.4, 0], '#c9d3db', { seg: 8 });
    g.cyl(0.18, 0.18, 0.06, [x, 2.2, 0], '#c9d3db', { seg: 8 });
    g.cyl(0.18, 0.18, 0.06, [x, 2.5, 0], '#c9d3db', { seg: 8 });
  }
  c.sign(0, 1.3, 0.82, 0.9, 0.5, 0, { text: '⚡ HIGH VOLTAGE', bg: HAZARD, fg: P.ink, style: 'banner' });
  c.collider({ type: 'box', x: 0, z: 0, hx: 1.2, hz: 1.0, h: 2.8 });
});

defineKit('repair.bay', (c) => {
  const g = c.g;
  const w = 7.2, d = 6, h = 3.8;
  g.rbox(w + 0.4, 0.8, d + 0.4, 0.05, [0, -0.3, 0], P.stoneDark);
  g.box(w, h, 0.3, [0, h / 2, -d / 2], '#c98d5a');
  for (const s of [-1, 1]) g.box(0.3, h, d, [s * w / 2, h / 2, 0], '#c98d5a');
  g.box(w + 0.6, 0.3, d + 0.8, [0, h + 0.15, 0.2], STEEL_DARK, { rot: [-0.05, 0, 0] });
  g.box(w + 0.62, 0.35, 0.1, [0, h - 0.2, d / 2 + 0.55], HAZARD);
  g.box(w, 0.06, d, [0, 0.05, 0], '#8e8c86');
  // Workbench, pegboard, tools.
  g.rbox(3.4, 0.12, 1.0, 0.03, [-1.4, 0.95, -d / 2 + 0.8], P.woodLight);
  for (const x of [-3, 0.2]) g.box(0.1, 0.95, 0.9, [x, 0.48, -d / 2 + 0.8], STEEL_DARK);
  g.box(3.6, 1.6, 0.06, [-1.4, 2.0, -d / 2 + 0.2], '#d8c39c');
  for (let i = 0; i < 9; i++) g.box(0.08, c.rng.range(0.3, 0.6), 0.06, [-2.9 + i * 0.36, 2.1, -d / 2 + 0.25], c.rng.pick([P.red, STEEL, P.ink, HAZARD]));
  g.rbox(0.5, 0.4, 0.45, 0.04, [-2.4, 1.22, -d / 2 + 0.8], '#d6ccb4');
  g.box(0.36, 0.24, 0.02, [-2.4, 1.24, -d / 2 + 1.03], '#20303c', { emissive: 1.3 });
  // Tool chest and tyres.
  g.rbox(1.0, 1.1, 0.6, 0.04, [w / 2 - 0.9, 0.55, -d / 2 + 0.7], P.red);
  for (let i = 0; i < 4; i++) g.box(0.9, 0.04, 0.02, [w / 2 - 0.9, 0.3 + i * 0.25, -d / 2 + 1.01], P.ink);
  c.sign(0, h - 0.2, d / 2 + 0.62, 4.4, 0.3, 0, { text: "HASH'S REPAIR BAY", bg: HAZARD, fg: P.ink, style: 'banner' });
  c.collider({ type: 'box', x: 0, z: -d / 2, hx: w / 2, hz: 0.2, h, camera: true });
  for (const s of [-1, 1]) c.collider({ type: 'box', x: s * w / 2, z: 0, hx: 0.2, hz: d / 2, h, camera: true });
  c.collider({ type: 'box', x: -1.4, z: -d / 2 + 0.8, hx: 1.8, hz: 0.55, h: 1.0 });
  c.collider({ type: 'box', x: w / 2 - 0.9, z: -d / 2 + 0.7, hx: 0.55, hz: 0.35, h: 1.1 });
  c.anchor('machine', 1.6, 0, -0.6, 0);
  c.anchor('bench', -1.4, 0, -d / 2 + 1.8, Math.PI);
  c.anchor('front', 0, 0, d / 2 + 1.5, Math.PI);
});

/** Elevated metal catwalk with stairs at both ends — an industrial pathway you can walk along. */
defineKit('catwalk', (c) => {
  const g = c.g;
  const len = c.params.len ?? 8, h = c.params.h ?? 2.2, w = 1.4;
  const stair = h * 1.6;
  g.box(w, 0.12, len, [0, h, 0], STEEL);
  for (let i = 0; i < len / 0.3; i++) g.box(w, 0.02, 0.04, [0, h + 0.07, -len / 2 + i * 0.3], STEEL_DARK);
  for (const zz of [-len / 2 + 0.2, 0, len / 2 - 0.2]) for (const s of [-1, 1]) g.box(0.1, h, 0.1, [s * (w / 2 - 0.05), h / 2, zz], STEEL_DARK);
  for (const s of [-1, 1]) {
    g.box(0.06, 0.06, len, [s * (w / 2 - 0.03), h + 1.0, 0], HAZARD);
    for (let i = 0; i <= 6; i++) g.box(0.05, 1.0, 0.05, [s * (w / 2 - 0.03), h + 0.5, -len / 2 + (i * len) / 6], STEEL_DARK);
    c.collider({ type: 'box', x: s * (w / 2 - 0.03), z: 0, hx: 0.06, hz: len / 2, h: 1.05, y0: h });
  }
  c.surface({ x: 0, z: 0, hx: w / 2, hz: len / 2, y0: h + 0.08, y1: h + 0.08, material: 'metal' });
  for (const end of [-1, 1]) {
    const zc = end * (len / 2 + stair / 2);
    const steps = Math.round(h / 0.2);
    for (let i = 0; i < steps; i++) {
      const t = (i + 1) / steps;
      g.box(w, 0.08, stair / steps + 0.02, [0, t * h, end * (len / 2 + stair - (i + 0.5) * (stair / steps))], STEEL);
    }
    for (const s of [-1, 1]) g.box(0.05, 0.05, Math.hypot(stair, h), [s * (w / 2 - 0.03), h / 2 + 0.95, zc], HAZARD, { rot: [end * Math.atan2(h, stair), 0, 0] });
    c.surface({ x: 0, z: zc, hx: w / 2, hz: stair / 2, y0: end > 0 ? h + 0.08 : 0, y1: end > 0 ? 0 : h + 0.08, material: 'metal' });
    for (const s of [-1, 1]) c.collider({ type: 'box', x: s * (w / 2 + 0.03), z: zc, hx: 0.06, hz: stair / 2, h: h + 1 });
  }
  // Underside: block walking beneath the high middle section.
  c.collider({ type: 'box', x: 0, z: 0, hx: w / 2, hz: len / 2, h: h - 0.1 });
});

defineKit('relay.panel', (c) => {
  const g = c.g;
  g.rbox(1.4, 2.0, 0.6, 0.05, [0, 1.0, 0], '#7f8d9a');
  g.box(1.1, 0.7, 0.04, [0, 1.35, 0.31], '#0d141c');
  c.screen(0, 1.35, 0.335, 1.0, 0.6, 0, 'network', 'relaypanel', 1);
  for (let i = 0; i < 4; i++) g.sphere(0.05, [-0.45 + i * 0.3, 0.75, 0.32], i < 2 ? '#58d6a0' : '#f0727a', { emissive: 1.8, ws: 6, hs: 4 });
  g.box(1.5, 0.1, 0.7, [0, 2.05, 0.05], STEEL_DARK);
  g.cyl(0.04, 0.04, 1.6, [0.5, 2.85, -0.1], STEEL, { seg: 6 });
  c.sign(0, 0.35, 0.32, 1.0, 0.25, 0, { text: c.params.label ?? 'RELAY PANEL', bg: HAZARD, fg: P.ink, style: 'banner' });
  c.collider({ type: 'box', x: 0, z: 0, hx: 0.75, hz: 0.35, h: 2.1 });
  c.interact({ id: c.params.iid ?? c.id, kind: 'mission', label: c.params.prompt ?? 'Open the relay panel', x: 0, y: 1.2, z: 1.0, heading: Math.PI, radius: 1.7, data: { screen: 'network', title: c.params.title ?? 'Relay Panel' } });
});

/** A relay pylon along The Chain — slim mast with a ring and an orb (lit when connected). */
defineKit('relay.pylon', (c) => {
  const g = c.g;
  g.rbox(1.2, 0.4, 1.2, 0.05, [0, 0.2, 0], P.stoneDark);
  g.cyl(0.12, 0.2, 5.2, [0, 2.8, 0], STEEL, { seg: 8 });
  g.torus(0.7, 0.06, [0, 4.8, 0], STEEL_DARK, { rot: [Math.PI / 2, 0, 0] });
  g.rbox(0.7, 0.9, 0.35, 0.05, [0, 1.3, 0.25], '#7f8d9a');
  g.box(0.5, 0.35, 0.02, [0, 1.45, 0.43], '#0d141c');
  c.screen(0, 1.45, 0.445, 0.46, 0.3, 0, 'status', 'pylon', 1);
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.6, h: 5.4 });
  c.anchor('orb', 0, 5.6, 0);
  if (c.params.iid) c.interact({ id: c.params.iid, kind: 'mission', label: c.params.prompt ?? 'Reboot the relay pylon', x: 0, y: 1.2, z: 1.1, heading: Math.PI, radius: 1.6, data: { title: c.params.title ?? 'Relay Pylon' } });
  if (c.params.sign) c.sign(0, 0.75, 0.43, 0.7, 0.22, 0, { text: c.params.sign, bg: HAZARD, fg: P.ink, style: 'banner' });
});

defineKit('forklift', (c) => {
  const g = c.g;
  g.rbox(1.3, 0.7, 2.0, 0.08, [0, 0.6, 0], HAZARD);
  g.box(1.1, 1.1, 0.06, [0, 1.6, 0.3], P.ink);
  for (const x of [-0.5, 0.5]) g.box(0.08, 1.4, 0.08, [x, 1.65, -0.6], P.ink);
  g.box(1.2, 0.08, 1.2, [0, 2.35, -0.15], P.ink);
  for (const x of [-0.45, 0.45]) g.box(0.08, 2.4, 0.12, [x, 1.2, 1.05], STEEL_DARK);
  for (const x of [-0.35, 0.35]) g.box(0.12, 0.05, 1.1, [x, 0.25, 1.55], STEEL_DARK);
  for (const [x, z] of [[-0.68, 0.6], [0.68, 0.6], [-0.68, -0.6], [0.68, -0.6]]) g.cyl(0.28, 0.28, 0.2, [x, 0.28, z], P.rubber, { rot: [0, 0, Math.PI / 2], seg: 10 });
  c.collider({ type: 'box', x: 0, z: 0.3, hx: 0.75, hz: 1.4, h: 2.4 });
});

defineKit('spool', (c) => {
  const g = c.g;
  g.cyl(0.6, 0.6, 0.12, [0, 0.6, -0.35], P.woodLight, { rot: [Math.PI / 2, 0, 0], seg: 12 });
  g.cyl(0.6, 0.6, 0.12, [0, 0.6, 0.35], P.woodLight, { rot: [Math.PI / 2, 0, 0], seg: 12 });
  g.cyl(0.42, 0.42, 0.6, [0, 0.6, 0], c.params.color ?? '#2f6c78', { rot: [Math.PI / 2, 0, 0], seg: 12 });
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.6, h: 1.2 });
});

defineKit('fence.chain', (c) => {
  const g = c.g;
  const len = c.params.len ?? 6;
  const n = Math.max(2, Math.round(len / 2));
  for (let i = 0; i <= n; i++) g.cyl(0.05, 0.05, 1.9, [-len / 2 + (i * len) / n, 0.95, 0], STEEL_DARK, { seg: 6 });
  g.box(len, 1.6, 0.02, [0, 1.0, 0], '#a7b0b9', { emissive: 0 });
  g.box(len, 0.05, 0.05, [0, 1.85, 0], STEEL_DARK);
  c.collider({ type: 'box', x: 0, z: 0, hx: len / 2, hz: 0.1, h: 1.9 });
});

defineKit('desk.secret', (c) => {
  const g = c.g;
  g.rbox(1.4, 0.06, 0.7, 0.02, [0, 0.75, 0], '#7a7f86');
  for (const [x, z] of [[-0.62, -0.28], [0.62, -0.28], [-0.62, 0.28], [0.62, 0.28]]) g.box(0.06, 0.75, 0.06, [x, 0.375, z], STEEL_DARK);
  g.rbox(0.6, 0.42, 0.06, 0.03, [0, 1.1, -0.15], P.ink);
  c.screen(0, 1.1, -0.115, 0.54, 0.34, 0, 'terminal', 'secret-desk', 1);
  for (let i = 0; i < 6; i++) g.box(0.12, 0.12, 0.005, [-0.28 + (i % 3) * 0.28, 1.35 - Math.floor(i / 3) * 0.16, -0.11], c.rng.pick(['#f6d55c', '#a6dcc3', '#f29db0']), { rot: [0, 0, c.rng.range(-0.2, 0.2)] });
  g.cyl(0.05, 0.045, 0.1, [0.5, 0.83, 0.1], P.paper, { seg: 8 });
  c.collider({ type: 'box', x: 0, z: 0, hx: 0.72, hz: 0.38, h: 1.0 });
  c.interact({ id: c.params.iid ?? c.id, kind: 'secret', label: c.params.label ?? 'Read the sticky notes', x: 0, y: 1.0, z: 0.85, heading: Math.PI, radius: 1.4, data: { secret: c.params.secret ?? 'devnotes' } });
});
