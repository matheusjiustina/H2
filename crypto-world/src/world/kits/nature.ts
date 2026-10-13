import { Color } from 'three';
import { defineKit, KitCtx } from '../content/Kit';
import { P } from './palette';

/** Slight per-instance hue/brightness jitter so repeated plants never look cloned. */
export function jitter(hex: string, rng: KitCtx['rng'], amount = 0.06): Color {
  const c = new Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL((hsl.h + rng.range(-amount, amount) * 0.3 + 1) % 1, Math.min(1, Math.max(0, hsl.s + rng.range(-amount, amount))), Math.min(1, Math.max(0, hsl.l + rng.range(-amount, amount))));
  return c;
}

const LEAVES = {
  round: [P.leaf, P.leafLight, '#7dbb58', '#5f9f45'],
  autumn: ['#e2a33f', '#d9784a', '#efc25a', '#c9663e'],
  blossom: ['#f3b6c3', '#f7cdd6', '#eaa0b4', '#fbe0e6'],
  dark: [P.leafDark, '#467f39', '#3f7434'],
  coast: ['#7fbf6a', '#9ccc6c', '#6aa95a'],
};

defineKit('tree.round', (c) => {
  // Broadleaf tree drawn as a layered canopy: a big crown of overlapping clumps with a few
  // forked branches showing underneath, like a background painter's tree.
  const s = c.params.scale ?? c.rng.range(0.85, 1.25);
  const pal = LEAVES[(c.params.leaves as keyof typeof LEAVES) ?? 'round'];
  const h = 1.7 * s;
  const bark = jitter(P.woodDark, c.rng, 0.04);
  c.g.cyl(0.13 * s, 0.22 * s, h, [0, h / 2, 0], bark);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + c.rng.next();
    c.g.cyl(0.04 * s, 0.08 * s, 0.9 * s, [Math.cos(a) * 0.28 * s, h + 0.25 * s, Math.sin(a) * 0.28 * s], bark, { seg: 5, rot: [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7] });
  }
  const base = c.rng.pick(pal);
  const clumps = c.rng.int(5, 7);
  for (let i = 0; i < clumps; i++) {
    const a = (i / clumps) * Math.PI * 2 + c.rng.next() * 0.8;
    const ring = i === 0 ? 0 : c.rng.range(0.45, 0.8) * s;
    const r = (i === 0 ? 0.85 : c.rng.range(0.5, 0.72)) * s;
    const y = h + (i === 0 ? 0.85 : c.rng.range(0.25, 1.05)) * s;
    const col = jitter(i % 3 === 2 ? c.rng.pick(pal) : base, c.rng, 0.05).offsetHSL(0, 0, i === 0 ? 0.02 : (y - h) * 0.03);
    c.g.sphere(r, [Math.cos(a) * ring, y, Math.sin(a) * ring], col, { detail: 1, wind: 0.55, scale: [1, 0.82, 1] });
  }
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.28 * s, h: 3 * s });
});

defineKit('tree.tall', (c) => {
  // Tall, slender tree with its foliage gathered in tufts high up (hillside and woodland edges).
  const s = c.params.scale ?? c.rng.range(0.9, 1.25);
  const h = c.rng.range(3.4, 4.6) * s;
  const lean = c.rng.range(-0.08, 0.08);
  const bark = jitter('#6b5446', c.rng, 0.04);
  c.g.cyl(0.08 * s, 0.17 * s, h, [Math.sin(lean) * h * 0.5, h / 2, 0], bark, { seg: 7, rot: [0, 0, -lean] });
  const top = [Math.sin(lean) * h, h, 0] as const;
  const greens = ['#4f8f4a', '#5c9c50', '#467f42', '#6aa85a'];
  const tufts = c.rng.int(4, 6);
  for (let i = 0; i < tufts; i++) {
    const a = c.rng.next() * Math.PI * 2;
    const y = top[1] - c.rng.range(0, 1.4) * s;
    const out = c.rng.range(0.2, 0.75) * s * (1 - (top[1] - y) / (2.2 * s));
    const r = c.rng.range(0.42, 0.62) * s;
    if (i > 0) c.g.cyl(0.025 * s, 0.045 * s, out + 0.2, [top[0] + Math.cos(a) * out * 0.5, y - 0.15 * s, Math.sin(a) * out * 0.5], bark, { seg: 4, rot: [Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1] });
    c.g.sphere(r, [top[0] + Math.cos(a) * out, y + 0.1 * s, Math.sin(a) * out], jitter(c.rng.pick(greens), c.rng, 0.05), { detail: 1, wind: 0.75, scale: [1.15, 0.75, 1.15] });
  }
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.2 * s, h: h });
});

defineKit('tree.pine', (c) => {
  const s = c.params.scale ?? c.rng.range(0.85, 1.3);
  const snowy = !!c.params.snow;
  const trunkH = 0.9 * s;
  c.g.cyl(0.12 * s, 0.18 * s, trunkH, [0, trunkH / 2, 0], jitter(P.woodDark, c.rng, 0.04));
  const tiers = 4;
  const base = jitter(snowy ? '#4f8a62' : c.rng.pick(['#3f8355', '#4a9160', '#3a7a4f']), c.rng, 0.05);
  for (let i = 0; i < tiers; i++) {
    const r = (1.2 - i * 0.24) * s;
    const hh = (1.15 - i * 0.12) * s;
    const y = trunkH + i * 0.62 * s + hh / 2;
    c.g.cone(r, hh, [0, y, 0], base.clone().offsetHSL(0, 0, i * 0.03), { seg: 7, flat: true, wind: 0.25 + i * 0.15 });
    if (snowy) c.g.cone(r * 0.62, hh * 0.42, [0, y + hh * 0.3, 0], P.snow, { seg: 7, flat: true, wind: 0.25 + i * 0.15 });
  }
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.26 * s, h: 3.5 * s });
});

defineKit('tree.birch', (c) => {
  const s = c.params.scale ?? c.rng.range(0.9, 1.2);
  const h = 2.4 * s;
  c.g.cyl(0.09 * s, 0.12 * s, h, [0, h / 2, 0], '#ece8df');
  for (let i = 0; i < 4; i++) c.g.box(0.2 * s, 0.05 * s, 0.2 * s, [0, 0.4 * s + i * 0.45 * s, 0], '#3b3a37', { rot: [0, c.rng.next() * 3, 0], scale: [0.9, 1, 0.9] });
  for (let i = 0; i < 3; i++) {
    c.g.sphere(0.55 * s, [c.rng.range(-0.3, 0.3) * s, h + i * 0.45 * s - 0.2 * s, c.rng.range(-0.3, 0.3) * s], jitter(c.rng.pick(['#a9cf63', '#bcd96f', '#94c25a']), c.rng), {
      detail: 1,
      wind: 0.7,
      scale: [1, 1.3, 1],
    });
  }
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.2 * s, h: 3 * s });
});

defineKit('tree.palm', (c) => {
  const s = c.params.scale ?? c.rng.range(0.9, 1.25);
  const segs = 6;
  const lean = c.rng.range(0.05, 0.12);
  let x = 0, y = 0;
  for (let i = 0; i < segs; i++) {
    const hh = 0.5 * s;
    c.g.cyl(0.13 * s - i * 0.008, 0.16 * s - i * 0.008, hh, [x, y + hh / 2, 0], i % 2 ? '#b58b5e' : '#a37b51', { rot: [0, 0, -lean * (i + 1) * 0.5] });
    x += Math.sin(lean * (i + 1) * 0.5) * hh;
    y += hh * 0.98;
  }
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2;
    c.g.cone(0.32 * s, 1.9 * s, [x + Math.cos(a) * 0.8 * s, y - 0.15 * s, Math.sin(a) * 0.8 * s], jitter('#5fa84e', c.rng, 0.05), {
      seg: 4,
      flat: true,
      wind: 0.9,
      rot: [0, Math.PI - a, Math.PI / 2 + 0.35],
      scale: [0.25, 1, 1],
    });
  }
  c.g.sphere(0.18 * s, [x, y, 0], '#7a5a3a', { detail: 0, flat: true });
  c.collider({ type: 'circle', x: 0, z: 0, r: 0.22 * s, h: 3.5 * s });
});

defineKit('bush', (c) => {
  const s = c.params.scale ?? c.rng.range(0.6, 1.1);
  const pal = c.params.flowers ? ['#6aa84f', '#78b55a'] : [P.leaf, P.leafDark, '#7dbb58'];
  const n = c.rng.int(2, 3);
  for (let i = 0; i < n; i++) {
    c.g.sphere(0.5 * s, [c.rng.range(-0.35, 0.35) * s, 0.35 * s, c.rng.range(-0.35, 0.35) * s], jitter(c.rng.pick(pal), c.rng), { detail: 1, wind: 0.25, scale: [1.1, 0.8, 1.1] });
  }
  if (c.params.flowers) {
    const fc = c.params.flowers as string;
    for (let i = 0; i < 6; i++) c.g.sphere(0.08 * s, [c.rng.range(-0.5, 0.5) * s, 0.6 * s + c.rng.range(0, 0.2) * s, c.rng.range(-0.5, 0.5) * s], fc, { ws: 5, hs: 3, wind: 0.3 });
  }
});

defineKit('rock', (c) => {
  const s = c.params.scale ?? c.rng.range(0.5, 1.4);
  const col = c.params.color ?? c.rng.pick([P.stone, '#b2a999', '#a59c8f']);
  c.g.sphere(0.7 * s, [0, 0.15 * s, 0], jitter(col, c.rng, 0.04), {
    detail: 0,
    flat: true,
    rot: [c.rng.next() * 3, c.rng.next() * 3, c.rng.next() * 3],
    scale: [c.rng.range(0.9, 1.4), c.rng.range(0.55, 0.85), c.rng.range(0.9, 1.3)],
  });
  if (c.params.snow) c.g.sphere(0.55 * s, [0, 0.45 * s, 0], P.snow, { detail: 0, flat: true, scale: [1.1, 0.35, 1] });
  if (s > 0.8 && !c.params.noCollide) c.collider({ type: 'circle', x: 0, z: 0, r: 0.75 * s, h: 1.1 * s });
});

defineKit('grass.tuft', (c) => {
  const n = c.params.blades ?? 3;
  const col = c.params.color ?? '#7fb653';
  const h = c.params.height ?? c.rng.range(0.28, 0.5);
  for (let i = 0; i < n; i++) {
    const a = c.rng.next() * Math.PI * 2;
    c.grass.cone(0.045, h * c.rng.range(0.7, 1.1), [Math.cos(a) * 0.08, h / 2, Math.sin(a) * 0.08], jitter(col, c.rng, 0.06), {
      seg: 3,
      open: true,
      wind: 0.6,
      windByHeight: h,
      rot: [c.rng.range(-0.25, 0.25), c.rng.next() * 3, c.rng.range(-0.25, 0.25)],
    });
  }
});

defineKit('flower', (c) => {
  const col = c.params.color ?? c.rng.pick(['#f6d55c', '#f29db0', '#ffffff', '#b8a4f2', '#f28f6b']);
  const h = c.rng.range(0.25, 0.4);
  c.grass.cyl(0.015, 0.02, h, [0, h / 2, 0], '#5d9a45', { seg: 3, open: true, wind: 0.7, windByHeight: h });
  c.grass.sphere(0.07, [0, h, 0], col, { ws: 5, hs: 3, wind: 0.8 });
});

defineKit('reeds', (c) => {
  for (let i = 0; i < 6; i++) {
    const h = c.rng.range(0.7, 1.2);
    c.grass.cyl(0.02, 0.03, h, [c.rng.range(-0.3, 0.3), h / 2, c.rng.range(-0.3, 0.3)], '#8aa457', { seg: 3, wind: 0.9, windByHeight: h });
  }
});

defineKit('mushroom', (c) => {
  const s = c.rng.range(0.6, 1.1);
  c.g.cyl(0.05 * s, 0.06 * s, 0.18 * s, [0, 0.09 * s, 0], P.paper);
  c.g.sphere(0.13 * s, [0, 0.2 * s, 0], c.params.color ?? '#d9584a', { ws: 7, hs: 4, scale: [1, 0.55, 1] });
});

defineKit('grass.clump', (c) => {
  // Tall meadow grass: a fan of long blades, the kind that frames paths in a painted landscape.
  const n = c.rng.int(7, 11);
  const col = c.params.color ?? '#6fa44c';
  const h = c.rng.range(0.55, 0.95);
  for (let i = 0; i < n; i++) {
    const a = c.rng.next() * Math.PI * 2;
    const bh = h * c.rng.range(0.6, 1.1);
    c.grass.cone(0.05, bh, [Math.cos(a) * 0.12, bh / 2, Math.sin(a) * 0.12], jitter(col, c.rng, 0.07), {
      seg: 3,
      open: true,
      wind: 0.8,
      windByHeight: bh,
      rot: [Math.cos(a) * c.rng.range(0.15, 0.45), c.rng.next() * 3, Math.sin(a) * c.rng.range(0.15, 0.45)],
    });
  }
});

defineKit('fern', (c) => {
  const col = c.params.color ?? '#4f8f4a';
  const fronds = c.rng.int(5, 7);
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + c.rng.next() * 0.4;
    c.grass.cone(0.12, 0.7, [Math.cos(a) * 0.28, 0.22, Math.sin(a) * 0.28], jitter(col, c.rng, 0.06), {
      seg: 4,
      flat: true,
      wind: 0.5,
      windByHeight: 0.4,
      rot: [0, Math.PI / 2 - a, Math.PI / 2 - 0.55],
      scale: [0.35, 1, 1],
    });
  }
});

defineKit('wildflowers', (c) => {
  // A small patch of flowers in one or two colours with leafy stems.
  const cols = [c.params.color ?? c.rng.pick(['#f6d55c', '#f29db0', '#ffffff', '#b8a4f2', '#f28f6b']), c.rng.pick(['#ffffff', '#f6d55c'])];
  const n = c.rng.int(5, 9);
  for (let i = 0; i < n; i++) {
    const x = c.rng.range(-0.45, 0.45), z = c.rng.range(-0.45, 0.45);
    const h = c.rng.range(0.22, 0.45);
    c.grass.cyl(0.012, 0.018, h, [x, h / 2, z], '#5d9a45', { seg: 3, open: true, wind: 0.7, windByHeight: h });
    c.grass.sphere(c.rng.range(0.05, 0.08), [x, h, z], cols[i % 3 === 0 ? 1 : 0], { ws: 5, hs: 3, wind: 0.8, scale: [1, 0.6, 1] });
  }
});
