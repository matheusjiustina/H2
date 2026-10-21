// Foliage atlas and card-built plants. Crowns are clouds of small alpha-tested
// leaf-cluster cards with "spherized" normals (each card lit as part of the
// crown's volume, not as a flat plane), on a tapered trunk with branches.
// Everything (leaves, flowers, fronds, bark, grass) lives in one 5x5 atlas so
// every plant variant is one geometry / one material / one instanced draw.
import * as THREE from 'three';
import { ATMO_U } from './atmosphere.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { rng } from '../core/math.js';

export const TILES = {
  broad: [0, 1, 2, 3], fine: [4, 5], euca: [6, 7], ipe: 8, palm: 9, bark: 10,
  grass: 11, dry: 12, mango: 13, shrub: 14, barkLight: 15,
  ipeRoxo: 16, feather: 17, cerrado: 18, deadLeaf: 19, redFlush: 20, barkRough: 21,
};
const N = 5;
const TS = 256; // tile size in px

// UV rectangle of a tile (canvas textures are flipped: row 0 is the top).
export function tileRect(t, inset = 3 / (TS * N)) {
  const i = t % N, j = Math.floor(t / N);
  return [i / N + inset, 1 - (j + 1) / N + inset, (i + 1) / N - inset, 1 - j / N - inset];
}

const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

function leaf(g, x, y, len, wid, ang, col, rib) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.45, -wid, len, 0);
  g.quadraticCurveTo(len * 0.45, wid, 0, 0);
  g.fill();
  if (rib) {
    g.strokeStyle = rib; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(len * 0.05, 0); g.lineTo(len * 0.85, 0); g.stroke();
  }
  g.restore();
}

// Leaf cluster seen from any side: twigs from the base, leaves dense toward
// the rim; back leaves darker, front leaves lighter (depth inside the card).
function cluster(g, ox, oy, r, o) {
  const S = TS, cx = ox + S / 2, cy = oy + S * 0.55;
  const R = S * 0.42;
  g.lineCap = 'round';
  // Shaded core: the inside of a leaf mass reads solid, not see-through.
  if (o.core) {
    for (let i = 0; i < 34; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R * 0.52;
      g.fillStyle = hsl(o.hue + (r() - 0.5) * 8, o.sat - 4, o.light * o.core + r() * 3);
      g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.9, R * (0.16 + r() * 0.14), 0, Math.PI * 2); g.fill();
    }
  }
  // twigs
  for (let i = 0; i < o.twigs; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.6;
    const len = R * (0.6 + r() * 0.45);
    g.strokeStyle = o.twig; g.lineWidth = 1.2 + r() * 1.4;
    g.beginPath(); g.moveTo(cx + (r() - 0.5) * 10, oy + S * 0.96);
    g.quadraticCurveTo(cx + Math.cos(a) * len * 0.4, cy + Math.sin(a) * len * 0.3, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    g.stroke();
  }
  for (let pass = 0; pass < 3; pass++) {
    const n = o.n * (pass === 2 ? 0.5 : 1);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), o.rim) * R;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.9;
      const ang = a + (r() - 0.5) * 1.6 + (o.droop ? Math.PI / 2 * o.droop : 0);
      const L = o.len * (0.7 + r() * 0.6), W = o.wid * (0.7 + r() * 0.6);
      const l = o.light + pass * o.pass + (r() - 0.5) * o.lv - (y - oy) / S * 6;
      leaf(g, x, y, L, W, ang, hsl(o.hue + (r() - 0.5) * o.hv, o.sat + (r() - 0.5) * 10, l), pass === 2 && L > 14 ? hsl(o.hue, o.sat - 10, l + 10, 0.6) : null);
    }
  }
}

export function makeFoliageAtlas() {
  const c = canvas(TS * N, TS * N);
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const at0 = (t) => [(t % N) * TS, Math.floor(t / N) * TS];
  // Every tile is clipped to itself so mip levels never bleed between tiles.
  let clipped = false;
  const at = (t) => {
    if (clipped) g.restore();
    const [x, y] = at0(t);
    g.save(); g.beginPath(); g.rect(x + 2, y + 2, TS - 4, TS - 4); g.clip();
    clipped = true;
    return [x, y];
  };
  const r = rng(4711);
  // Broadleaf clusters (cerrado / mata trees), four tones.
  const broad = [
    { hue: 88, sat: 40, light: 25 }, { hue: 96, sat: 36, light: 28 },
    { hue: 80, sat: 42, light: 27 }, { hue: 104, sat: 32, light: 23 },
  ];
  TILES.broad.forEach((t, i) => {
    const [x, y] = at(t);
    cluster(g, x, y, r, { ...broad[i], n: 470, rim: 0.6, len: 16, wid: 6, hv: 12, lv: 8, pass: 6, twigs: 7, twig: '#3b2a1c', core: 0.6 });
  });
  // Fine pinnate leaves (angico / leguminous cerrado trees): airy.
  TILES.fine.forEach((t, i) => {
    const [x, y] = at(t);
    cluster(g, x, y, r, { hue: 80 + i * 10, sat: 40, light: 29, n: 1500, rim: 0.55, len: 7, wid: 2.6, hv: 10, lv: 9, pass: 5, twigs: 10, twig: '#4a3626', core: 0.55 });
  });
  // Eucalyptus: long narrow drooping grey-green leaves.
  TILES.euca.forEach((t, i) => {
    const [x, y] = at(t);
    cluster(g, x, y, r, { hue: 95 + i * 14, sat: 18, light: 33, n: 420, rim: 0.55, len: 24, wid: 3.6, hv: 10, lv: 9, pass: 5, twigs: 9, twig: '#6b5a48', droop: 0.6, core: 0.6 });
  });
  // Ipê-amarelo in bloom: yellow trumpet clusters over a few leaves.
  {
    const [x, y] = at(TILES.ipe);
    cluster(g, x, y, r, { hue: 90, sat: 30, light: 20, n: 140, rim: 0.5, len: 12, wid: 4.5, hv: 10, lv: 6, pass: 4, twigs: 7, twig: '#4a3626', core: 0.7 });
    for (let i = 0; i < 1100; i++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.5) * TS * 0.42;
      const px = x + TS / 2 + Math.cos(a) * d, py = y + TS * 0.55 + Math.sin(a) * d * 0.9;
      g.fillStyle = hsl(46 + r() * 8, 88, 50 + r() * 16);
      g.beginPath(); g.ellipse(px, py, 3 + r() * 3, 2.2 + r() * 2, r() * Math.PI, 0, Math.PI * 2); g.fill();
    }
  }
  // Buriti fan frond: radiating segments on a petiole.
  {
    const [x, y] = at(TILES.palm);
    const cx = x + TS / 2, cy = y + TS * 0.62;
    g.strokeStyle = '#5c5a2a'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(cx, y + TS - 4); g.lineTo(cx, cy); g.stroke();
    for (let i = 0; i < 46; i++) {
      const a = -Math.PI + 0.15 + (i / 45) * (Math.PI - 0.3);
      const len = TS * (0.36 + r() * 0.08);
      const ex = cx + Math.cos(a) * len, ey = cy + Math.sin(a) * len * 0.92 + len * 0.15 * Math.abs(Math.cos(a));
      g.strokeStyle = hsl(78 + r() * 18, 35 + r() * 12, 22 + r() * 12); g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo((cx + ex) / 2, (cy + ey) / 2 - 8, ex, ey); g.stroke();
    }
  }
  // Bark: grey-brown with vertical fissures (opaque).
  const bark = (t, base, dark, light) => {
    const [x, y] = at(t);
    g.fillStyle = base; g.fillRect(x, y, TS, TS);
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = r() < 0.6 ? dark : light; g.lineWidth = 1 + r() * 2.5; g.globalAlpha = 0.35 + r() * 0.4;
      const px = x + r() * TS, py = y + r() * TS, len = 10 + r() * 40;
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + (r() - 0.5) * 4, py + len); g.stroke();
    }
    g.globalAlpha = 1;
  };
  bark(TILES.bark, '#5a4a3c', '#2c221a', '#7d6c5a');
  bark(TILES.barkLight, '#b9b2a2', '#7a7062', '#ddd6c8');
  // Grass tufts: green and dry (braquiária, capim seco).
  const tuft = (t, hue, sat, light, seeds) => {
    const [x, y] = at(t);
    for (let i = 0; i < 70; i++) {
      const bx = x + TS * (0.1 + r() * 0.8), len = TS * (0.45 + r() * 0.45);
      const lean = (r() - 0.5) * TS * 0.5;
      g.strokeStyle = hsl(hue + (r() - 0.5) * 16, sat + (r() - 0.5) * 12, light + (r() - 0.5) * 12 + (i / 70) * 6);
      g.lineWidth = 2 + r() * 2.2;
      g.beginPath(); g.moveTo(bx, y + TS - 2);
      g.quadraticCurveTo(bx + lean * 0.3, y + TS - len * 0.6, bx + lean, y + TS - len);
      g.stroke();
      if (seeds && r() < 0.25) {
        g.fillStyle = hsl(40, 30, 55);
        g.beginPath(); g.ellipse(bx + lean, y + TS - len, 2, 6, 0.3, 0, Math.PI * 2); g.fill();
      }
    }
  };
  tuft(TILES.grass, 78, 34, 30, true);
  tuft(TILES.dry, 46, 32, 52, true);
  // Mangueira (mango): large dark glossy leaves, dense.
  {
    const [x, y] = at(TILES.mango);
    cluster(g, x, y, r, { hue: 108, sat: 36, light: 19, n: 380, rim: 0.55, len: 24, wid: 7, hv: 10, lv: 6, pass: 5, twigs: 5, twig: '#3b2a1c', core: 0.6 });
  }
  // Shrub: small mixed leaves, very dense.
  {
    const [x, y] = at(TILES.shrub);
    cluster(g, x, y, r, { hue: 80, sat: 34, light: 27, n: 1200, rim: 0.5, len: 9, wid: 3.4, hv: 18, lv: 10, pass: 5, twigs: 6, twig: '#4a3626', core: 0.55 });
  }
  // Ipê-roxo in bloom: lilac-pink trumpet clusters, almost leafless.
  {
    const [x, y] = at(TILES.ipeRoxo);
    cluster(g, x, y, r, { hue: 95, sat: 26, light: 19, n: 90, rim: 0.5, len: 11, wid: 4, hv: 10, lv: 6, pass: 4, twigs: 9, twig: '#4a3626', core: 0 });
    for (let i = 0; i < 1300; i++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.55) * TS * 0.42;
      const px = x + TS / 2 + Math.cos(a) * d, py = y + TS * 0.55 + Math.sin(a) * d * 0.9;
      g.fillStyle = hsl(312 + r() * 18, 42 + r() * 14, 52 + r() * 18);
      g.beginPath(); g.ellipse(px, py, 3 + r() * 3, 2.2 + r() * 2, r() * Math.PI, 0, Math.PI * 2); g.fill();
    }
  }
  // Macaúba / feather palm frond: a curved rachis with fine pinnae on both sides.
  {
    const [x, y] = at(TILES.feather);
    const x0 = x + TS * 0.5, y0 = y + TS - 6;
    const pts = [];
    for (let i = 0; i <= 40; i++) { const k = i / 40; pts.push([x0 + Math.sin(k * 1.2) * TS * 0.08, y0 - k * TS * 0.9]); }
    for (let i = 2; i < pts.length; i++) {
      const [px, py] = pts[i], k = i / 40;
      const len = TS * 0.28 * Math.sin(Math.PI * Math.min(1, k * 1.05)) + 6;
      for (const sd of [-1, 1]) {
        g.strokeStyle = hsl(84 + r() * 16, 34 + r() * 10, 22 + r() * 12);
        g.lineWidth = 1.6 + r();
        g.beginPath(); g.moveTo(px, py);
        g.quadraticCurveTo(px + sd * len * 0.5, py - 4, px + sd * len, py + len * 0.35 + r() * 6);
        g.stroke();
      }
    }
    g.strokeStyle = '#6a6232'; g.lineWidth = 3;
    g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
  }
  // Cerrado trees (pequi, lixeira, barbatimão): big leathery leaves, olive to yellowish.
  {
    const [x, y] = at(TILES.cerrado);
    cluster(g, x, y, r, { hue: 72, sat: 34, light: 29, n: 260, rim: 0.55, len: 22, wid: 10, hv: 16, lv: 9, pass: 5, twigs: 8, twig: '#3b2a1c', core: 0.55 });
  }
  // Dry-season / dead foliage: brown, sparse, many bare twigs.
  {
    const [x, y] = at(TILES.deadLeaf);
    cluster(g, x, y, r, { hue: 30, sat: 26, light: 30, n: 120, rim: 0.6, len: 12, wid: 5, hv: 14, lv: 10, pass: 4, twigs: 16, twig: '#4f3f30', core: 0 });
  }
  // Red new flush (copaíba, jatobá in spring).
  {
    const [x, y] = at(TILES.redFlush);
    cluster(g, x, y, r, { hue: 18, sat: 28, light: 28, n: 420, rim: 0.6, len: 14, wid: 5, hv: 16, lv: 8, pass: 5, twigs: 7, twig: '#3b2a1c', core: 0.6 });
  }
  bark(TILES.barkRough, '#4a3c30', '#211810', '#6e5a48');
  if (clipped) g.restore();
  const t = canvasTexture(c);
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------------------
// Geometry accumulator for card plants.
export class PlantBuilder {
  constructor(seed = 1) {
    this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.idx = [];
    this.r = rng(seed);
  }

  get count() { return this.pos.length / 3; }

  // One quad centred at c, facing f (unit), size w x h; vertex normals n
  // (spherized: outward from the crown centre, tilted up).
  card(c, f, w, h, rect, color, n, roll = 0) {
    const up = Math.abs(f.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, f).normalize();
    const vup = new THREE.Vector3().crossVectors(f, right).normalize();
    if (roll) { right.applyAxisAngle(f, roll); vup.applyAxisAngle(f, roll); }
    const flip = this.r() < 0.5;
    const [u0, v0, u1, v1] = rect;
    const b = this.count;
    const corners = [[-1, -1, flip ? u1 : u0, v0], [1, -1, flip ? u0 : u1, v0], [1, 1, flip ? u0 : u1, v1], [-1, 1, flip ? u1 : u0, v1]];
    for (const [sx, sy, u, v] of corners) {
      this.pos.push(c.x + right.x * sx * w / 2 + vup.x * sy * h / 2, c.y + right.y * sx * w / 2 + vup.y * sy * h / 2, c.z + right.z * sx * w / 2 + vup.z * sy * h / 2);
      // Bend the normal a little toward each corner: the card reads as a
      // curved patch of the crown rather than a flat plane.
      const nn = new THREE.Vector3(n.x + right.x * sx * 0.25 + vup.x * sy * 0.2, n.y + right.y * sx * 0.25 + vup.y * sy * 0.2, n.z + right.z * sx * 0.25 + vup.z * sy * 0.2).normalize();
      this.nrm.push(nn.x, nn.y, nn.z);
      this.uv.push(u, v);
      this.col.push(color.r, color.g, color.b);
    }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }

  // Tapered cylinder between two points, bark-mapped.
  limb(a, b, r0, r1, sides, rect, color) {
    const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b);
    const axis = Bv.clone().sub(A);
    const len = axis.length();
    axis.normalize();
    const tmp = Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(axis, tmp).normalize();
    const w = new THREE.Vector3().crossVectors(axis, u).normalize();
    const [u0, v0, u1, v1] = rect;
    const base = this.count;
    const vRep = Math.min(1, len / 6);
    for (let k = 0; k <= 1; k++) {
      const P = k ? Bv : A, rr = k ? r1 : r0;
      for (let i = 0; i <= sides; i++) {
        const t = (i / sides) * Math.PI * 2;
        const d = u.clone().multiplyScalar(Math.cos(t)).addScaledVector(w, Math.sin(t));
        this.pos.push(P.x + d.x * rr, P.y + d.y * rr, P.z + d.z * rr);
        this.nrm.push(d.x, d.y, d.z);
        this.uv.push(u0 + (u1 - u0) * (i / sides), v0 + (v1 - v0) * (k ? vRep : 0));
        const ao = k ? 1 : 0.8;
        this.col.push(color.r * ao, color.g * ao, color.b * ao);
      }
    }
    const n = sides + 1;
    for (let i = 0; i < sides; i++) this.idx.push(base + i, base + n + i, base + i + 1, base + i + 1, base + n + i, base + n + i + 1);
  }

  // A crown clump: n cards scattered in an ellipsoid, denser at the shell.
  clump(cx, cy, cz, rx, ry, rz, n, size, tiles, tint, crownY0, crownY1) {
    const r = this.r;
    const C = new THREE.Vector3(cx, cy, cz);
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1 + 0.25, r() * 2 - 1);
      if (d.lengthSq() < 1e-4) d.set(0, 1, 0);
      d.normalize();
      const rr = 0.5 + 0.5 * Math.sqrt(r());
      const p = new THREE.Vector3(cx + d.x * rx * rr, cy + d.y * ry * rr, cz + d.z * rz * rr);
      const f = d.clone().multiplyScalar(0.6).add(new THREE.Vector3(r() - 0.5, (r() - 0.5) * 0.6, r() - 0.5)).normalize();
      const nrm = p.clone().sub(C).normalize().multiplyScalar(0.85).add(new THREE.Vector3(0, 0.45, 0)).normalize();
      // Ambient occlusion: darker low in the crown and toward its core.
      const hy = Math.min(1, Math.max(0, (p.y - crownY0) / Math.max(0.1, crownY1 - crownY0)));
      const ao = (0.55 + 0.45 * hy) * (0.7 + 0.3 * rr);
      const k = ao * (0.88 + r() * 0.24);
      const s = size * (0.75 + r() * 0.5);
      const tile = Array.isArray(tiles) ? tiles[Math.floor(r() * tiles.length)] : tiles;
      this.card(p, f, s, s, tileRect(tile), new THREE.Color(tint.r * k, tint.g * k, tint.b * k), nrm, (r() - 0.5) * 1.2);
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// Shared material: alpha-tested cards, both faces lit with the crown normal
// (no back-face flip: a card's back is the same piece of crown).
export function foliageMaterial(atlas) {
  const m = new THREE.MeshStandardMaterial({
    map: atlas, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true,
    roughness: 0.82, metalness: 0, alphaToCoverage: true,
  });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = ATMO_U.time;
    s.uniforms.uWind = ATMO_U.wind;
    // Wind sway (instanced plants only): the crown bends downwind with gusts
    // that travel across the stand, leaves flutter a little.
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec4 uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        {
          vec3 ipF = instanceMatrix[3].xyz;
          vec2 wdF = normalize((transpose(mat3(instanceMatrix)) * vec3(uWind.x, 0.0, uWind.y)).xz + 1e-5);
          float hF = max(transformed.y - 1.0, 0.0);
          float phF = dot(ipF.xz, uWind.xy) * 0.03 - uTime * (0.9 + uWind.z * 0.12);
          float gF = 0.6 + 0.4 * sin(phF) + 0.15 * sin(uTime * 1.7 + ipF.x * 0.2);
          float aF = (0.002 + 0.0012 * uWind.z) * (0.5 + 0.7 * uWind.w);
          transformed.xz += wdF * aF * hF * hF * gF / (1.0 + hF * 0.08);
          transformed += 0.012 * (0.3 + 0.1 * uWind.z) * step(1.5, transformed.y)
            * sin(uTime * 5.3 + dot(position, vec3(2.1, 1.7, 2.9))) * vec3(1.0, 0.4, 1.0);
        }
        #endif`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <normal_fragment_begin>',
        THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
      // Mipmaps average leaf alpha toward the gaps; boost alpha with the mip
      // level so far crowns stay full instead of thinning to twigs.
      .replace('#include <alphatest_fragment>', `
        vec2 mdx = dFdx(vMapUv * 1280.0), mdy = dFdy(vMapUv * 1280.0);
        float mlod = 0.5 * log2(min(dot(mdx, mdx), dot(mdy, mdy)));
        diffuseColor.a *= 1.0 + clamp(mlod, 0.0, 6.0) * 0.32;
        #include <alphatest_fragment>`);
  };
  m.customProgramCacheKey = () => 'foliage-v3';
  return m;
}

// ---------------------------------------------------------------------------
// Plant recipes. hi = near detail, lo = far (fewer, bigger cards).
const C = (r, g, b) => new THREE.Color(r, g, b);
const BARK = C(0.85, 0.85, 0.85);

// Broad irregular crown on a forked trunk: cerrado / mata trees.
export function broadTree(hi, seed, o = {}) {
  const B = new PlantBuilder(seed);
  const r = B.r;
  const H = (o.height ?? 1) * (4.2 + r() * 1.6); // trunk to first fork
  const spread = (o.spread ?? 1);
  const tint = o.tint ?? C(1, 1, 1);
  const tiles = o.tiles ?? TILES.broad;
  const lean = (r() - 0.5) * 0.6;
  const top = [lean, H, (r() - 0.5) * 0.4];
  B.limb([0, -0.3, 0], top, 0.32 * (o.girth ?? 1), 0.22 * (o.girth ?? 1), hi ? 7 : 4, tileRect(o.barkTile ?? TILES.bark), BARK);
  const nClumps = hi ? 4 + Math.floor(r() * 3) : 3;
  const clumps = [];
  for (let i = 0; i < nClumps; i++) {
    const a = (i / nClumps) * Math.PI * 2 + r() * 0.8;
    const d = (i === 0 ? 0.3 : 1.6 + r() * 1.6) * spread;
    const cy = H + 1.6 + r() * 2.2 * (o.height ?? 1);
    clumps.push([top[0] + Math.cos(a) * d, cy, top[2] + Math.sin(a) * d]);
  }
  const crownY0 = H + 0.2, crownY1 = H + 5.5 * (o.height ?? 1);
  for (const c of clumps) {
    if (hi) B.limb(top, [c[0] * 0.8, c[1] - 0.8, c[2] * 0.8], 0.16, 0.06, 4, tileRect(o.barkTile ?? TILES.bark), BARK);
    const rad = (2.0 + r() * 1.0) * spread;
    B.clump(c[0], c[1], c[2], rad, rad * 0.62, rad, hi ? 40 : 7, hi ? 1.6 : 3.8, tiles, tint, crownY0, crownY1);
  }
  return B.geometry();
}

// Mangueira / shade tree: dense dome down to low branches.
export function mangoTree(hi, seed) {
  const B = new PlantBuilder(seed);
  const r = B.r;
  const H = 2.4 + r() * 0.6;
  B.limb([0, -0.3, 0], [0.2, H, 0], 0.42, 0.32, hi ? 8 : 4, tileRect(TILES.bark), BARK);
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2;
    if (hi) B.limb([0.2, H, 0], [Math.cos(a) * 2.2, H + 2.2, Math.sin(a) * 2.2], 0.2, 0.1, 5, tileRect(TILES.bark), BARK);
  }
  const n = hi ? 150 : 26;
  B.clump(0, H + 3.6, 0, 5.2, 3.4, 5.2, n, hi ? 2.0 : 4.0, [TILES.mango, TILES.broad[3]], C(1, 1, 1), H + 0.4, H + 7);
  return B.geometry();
}

// Ipê-amarelo in bloom: open crown of yellow flower clusters.
export function ipeTree(hi, seed, tile = TILES.ipe) {
  const B = new PlantBuilder(seed);
  const r = B.r;
  const H = 4.5 + r();
  B.limb([0, -0.3, 0], [0.3, H, 0.1], 0.26, 0.18, hi ? 6 : 4, tileRect(TILES.bark), BARK);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r() * 0.5;
    const c = [Math.cos(a) * 2.0, H + 2.2 + r() * 1.5, Math.sin(a) * 2.0];
    if (hi) B.limb([0.3, H, 0.1], [c[0] * 0.8, c[1] - 0.5, c[2] * 0.8], 0.12, 0.05, 4, tileRect(TILES.bark), BARK);
    B.clump(c[0], c[1], c[2], 2.0, 1.4, 2.0, hi ? 22 : 6, hi ? 1.8 : 3.4, tile, C(1, 1, 1), H, H + 5);
  }
  return B.geometry();
}

// Eucalyptus: tall straight pale trunk, narrow crown high up.
export function eucalyptusTree(hi, seed) {
  const B = new PlantBuilder(seed);
  const r = B.r;
  const H = 21 + r() * 6;
  B.limb([0, -0.3, 0], [(r() - 0.5) * 0.6, H, (r() - 0.5) * 0.6], 0.24, 0.1, hi ? 6 : 3, tileRect(TILES.barkLight), BARK);
  const n = hi ? 5 : 3;
  for (let i = 0; i < n; i++) {
    const y = H * (0.55 + (i / n) * 0.45);
    const a = r() * Math.PI * 2, d = 0.6 + r() * 0.9;
    B.clump(Math.cos(a) * d, y, Math.sin(a) * d, 1.8, 2.6, 1.8, hi ? 16 : 4, hi ? 1.9 : 3.6, TILES.euca, C(1, 1, 1), H * 0.5, H + 2);
  }
  return B.geometry();
}

// Buriti palm: smooth column, fan fronds radiating from the crown.
export function buritiPalm(hi, seed) {
  const B = new PlantBuilder(seed);
  const r = B.r;
  const H = 11 + r() * 5;
  B.limb([0, -0.3, 0], [0, H, 0], 0.32, 0.27, hi ? 7 : 4, tileRect(TILES.bark), C(0.95, 0.92, 0.85));
  const n = hi ? 16 : 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.3;
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const droop = -0.2 + r() * 0.9;
    const c = new THREE.Vector3(out.x * 2.1, H + 0.6 + droop * 1.4, out.z * 2.1);
    const f = new THREE.Vector3(-out.z, 0, out.x); // fan faces sideways
    const k = 0.8 + r() * 0.3;
    B.card(c, f, 4.4, 3.6, tileRect(TILES.palm), C(k, k, k), new THREE.Vector3(out.x * 0.6, 0.8, out.z * 0.6).normalize(), Math.atan2(droop, 1));
  }
  return B.geometry();
}

// Low shrub (cerrado bush / fence-line scrub).
export function shrub(hi, seed, tiles = [TILES.shrub, TILES.fine[0]], tint = C(1, 1, 1)) {
  const B = new PlantBuilder(seed);
  B.clump(0, 0.75, 0, 1.4, 0.8, 1.4, hi ? 18 : 6, hi ? 1.2 : 2.0, tiles, tint, 0, 1.6);
  return B.geometry();
}

// Cerrado tree (pequi, lixeira): short crooked trunk with thick rough bark,
// a few twisted limbs and a sparse, open crown of big leathery leaves.
export function cerradoTree(hi, seed, o = {}) {
  const B = new PlantBuilder(seed);
  const r = B.r;
  const bark = tileRect(TILES.barkRough);
  let p = [0, -0.3, 0];
  const segs = 3, H = 2.2 + r() * 1.2;
  for (let i = 0; i < segs; i++) {
    const q = [p[0] + (r() - 0.5) * 0.9, p[1] + H / segs, p[2] + (r() - 0.5) * 0.9];
    B.limb(p, q, 0.24 - i * 0.04, 0.2 - i * 0.04, hi ? 6 : 4, bark, BARK);
    p = q;
  }
  const n = hi ? 4 + Math.floor(r() * 2) : 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.9, d = 1.2 + r() * 1.6;
    const tip = [p[0] + Math.cos(a) * d, p[1] + 0.8 + r() * 1.6, p[2] + Math.sin(a) * d];
    B.limb(p, tip, 0.13, 0.05, hi ? 4 : 3, bark, BARK);
    const rad = 1.1 + r() * 0.7;
    B.clump(tip[0], tip[1] + 0.3, tip[2], rad, rad * 0.6, rad, hi ? 16 : 5, hi ? 1.5 : 3.0, o.tiles ?? [TILES.cerrado, TILES.cerrado, TILES.fine[1]], o.tint ?? C(1, 1, 1), H, H + 3.5);
  }
  return B.geometry();
}

// Macaúba: slender, slightly curved palm with a rough stem and a round crown
// of arching feather fronds.
export function macaubaPalm(hi, seed) {
  const B = new PlantBuilder(seed);
  const r = B.r;
  const H = 8 + r() * 4, bend = (r() - 0.5) * 1.2;
  const mid = [bend * 0.4, H * 0.5, 0], top = [bend, H, 0];
  B.limb([0, -0.3, 0], mid, 0.26, 0.22, hi ? 7 : 4, tileRect(TILES.barkRough), BARK);
  B.limb(mid, top, 0.22, 0.2, hi ? 7 : 4, tileRect(TILES.barkRough), BARK);
  const n = hi ? 18 : 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.3;
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const up = 0.2 + r() * 0.9; // upper fronds stand, lower ones arch down
    const c = new THREE.Vector3(top[0] + out.x * 2.2, H + 0.2 + (up - 0.5) * 1.6, top[2] + out.z * 2.2);
    // The card's long side runs out along the frond.
    const f = new THREE.Vector3(-out.z, 0.35, out.x).normalize();
    const k = 0.8 + r() * 0.35;
    B.card(c, f, 1.8, 5.2, tileRect(TILES.feather), C(k, k, k * 0.95), new THREE.Vector3(out.x * 0.5, 0.85, out.z * 0.5).normalize(), Math.PI / 2 + (up - 0.6) * 0.9);
  }
  return B.geometry();
}

// Dead tree (snag) in a pasture: bare grey limbs, a few dry leaves left.
export function deadTree(hi, seed) {
  const B = new PlantBuilder(seed);
  const r = B.r;
  const bark = tileRect(TILES.barkLight);
  const H = 4.5 + r() * 2.5;
  const top = [(r() - 0.5) * 0.6, H, (r() - 0.5) * 0.6];
  B.limb([0, -0.3, 0], top, 0.3, 0.18, hi ? 6 : 4, bark, C(0.75, 0.72, 0.68));
  const n = hi ? 5 : 3;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = 1.6 + r() * 2.2;
    const tip = [top[0] + Math.cos(a) * d, H + 1 + r() * 2.5, top[2] + Math.sin(a) * d];
    const from = [top[0] * 0.8, H * (0.75 + r() * 0.25), top[2] * 0.8];
    B.limb(from, tip, 0.11, 0.03, hi ? 4 : 3, bark, C(0.75, 0.72, 0.68));
    if (r() < 0.5) B.clump(tip[0], tip[1], tip[2], 0.9, 0.6, 0.9, hi ? 6 : 2, hi ? 1.4 : 2.6, TILES.deadLeaf, C(1, 1, 1), H, H + 4);
  }
  return B.geometry();
}

// Grass tuft: three crossed upright cards (green or dry).
export function grassTuft(tile, seed, w = 0.9, h = 0.6) {
  const B = new PlantBuilder(seed);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI + B.r() * 0.4;
    const f = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    B.card(new THREE.Vector3(0, h / 2 - 0.02, 0), f, w, h, tileRect(tile), C(1, 1, 1), new THREE.Vector3(0, 1, 0).addScaledVector(f, 0.25).normalize());
  }
  return B.geometry();
}

// Native forest canopy seen from above (tileable): packed crowns, each lit on
// top and shaded at its rim, gaps in deep shadow, the odd flowering crown.
// Forest canopy seen from above: packed tree crowns, each a mass of leaf
// clusters lit from the sun side with a shadowed flank, deep shade in the
// gaps between crowns, and the natural mix of a cerrado/amazon-edge mata —
// mostly greens, some yellow-olive and reddish new leaves, a few greyish
// crowns and, rarely, a muted flowering ipê. Tiles seamlessly (wrap-drawn);
// the luminance doubles as the canopy's bump map.
export function makeCanopyTexture() {
  const S = 1024;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const r = rng(909);
  g.fillStyle = '#0b1307';
  g.fillRect(0, 0, S, S);
  const wrap = (x, y, rad, fn) => {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      if (x + ox + rad < 0 || x + ox - rad > S || y + oy + rad < 0 || y + oy - rad > S) continue;
      fn(x + ox, y + oy);
    }
  };
  const blob = (x, y, rad, col) => {
    g.fillStyle = col;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  };
  // Crown palette: [hue, sat, light, weight].
  const PAL = [
    [92, 34, 22, 26], [104, 30, 19, 20], [84, 38, 25, 18], [112, 26, 17, 12],
    [74, 40, 27, 8], [60, 38, 30, 4], // yellow-olive
    [28, 26, 24, 3], // reddish new leaves
    [80, 10, 30, 3], // greyish (dry season / dead branches)
    [318, 18, 40, 0.35], [48, 52, 42, 0.3], // flowering ipê-roxo / amarelo (rare, muted)
  ];
  const tot = PAL.reduce((a, p) => a + p[3], 0);
  const pick = () => { let k = r() * tot; for (const p of PAL) { k -= p[3]; if (k <= 0) return p; } return PAL[0]; };
  // Crowns on a jittered grid (no overlaps at the centres, overlapping edges).
  const G = 11, cellPx = S / G;
  const crowns = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    crowns.push({ x: (i + 0.15 + r() * 0.7) * cellPx, y: (j + 0.15 + r() * 0.7) * cellPx, rad: cellPx * (0.42 + r() * 0.34), p: pick() });
    if (r() < 0.45) crowns.push({ x: (i + r()) * cellPx, y: (j + r()) * cellPx, rad: cellPx * (0.22 + r() * 0.16), p: pick() });
  }
  // Big crowns first, small ones on top (emergent / understory gaps).
  crowns.sort((a, b) => b.rad - a.rad);
  const sun = [-0.55, -0.62]; // light from the upper left
  for (const cr of crowns) {
    const [h, sa, li] = cr.p;
    const flower = h > 300 || (h === 48 && sa > 50);
    wrap(cr.x, cr.y, cr.rad * 1.25, (cx, cy) => {
      // Shade cast into the gap (lower right).
      const sh = g.createRadialGradient(cx + cr.rad * 0.25, cy + cr.rad * 0.3, cr.rad * 0.5, cx + cr.rad * 0.25, cy + cr.rad * 0.3, cr.rad * 1.15);
      sh.addColorStop(0, 'rgba(0,0,0,0.55)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sh; g.beginPath(); g.arc(cx + cr.rad * 0.25, cy + cr.rad * 0.3, cr.rad * 1.15, 0, Math.PI * 2); g.fill();
      // Body of the crown.
      blob(cx, cy, cr.rad * 0.92, hsl(h, sa, li * 0.7));
      // Leaf clusters: lighter toward the sun, darker on the far flank.
      const n = Math.round(18 + cr.rad * 0.9);
      for (let k = 0; k < n; k++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * cr.rad * 0.88;
        const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d;
        const lit = -((px - cx) * sun[0] + (py - cy) * sun[1]) / cr.rad; // -1 .. 1
        const lr = cr.rad * (0.14 + r() * 0.14) * (flower ? 0.8 : 1);
        const L = li * (0.85 + 0.45 * lit + (r() - 0.5) * 0.3);
        const grd = g.createRadialGradient(px - lr * 0.3, py - lr * 0.35, lr * 0.1, px, py, lr);
        grd.addColorStop(0, hsl(h + (r() - 0.5) * 8, sa, Math.min(70, L + 8)));
        grd.addColorStop(0.7, hsl(h + (r() - 0.5) * 8, sa, L));
        grd.addColorStop(1, hsl(h, sa, L * 0.5, 0));
        g.fillStyle = grd; g.beginPath(); g.arc(px, py, lr, 0, Math.PI * 2); g.fill();
      }
      // Flowering crowns keep some green leaves showing through.
      if (flower) for (let k = 0; k < 14; k++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * cr.rad * 0.8;
        blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, cr.rad * 0.12, hsl(95, 30, 20, 0.8));
      }
    });
  }
  // Leaf-scale speckle so the canopy holds up at low altitude.
  for (let i = 0; i < 26000; i++) {
    g.fillStyle = r() < 0.55 ? 'rgba(0,0,0,0.2)' : 'rgba(200,230,150,0.09)';
    g.fillRect(r() * S, r() * S, 1 + r() * 2.5, 1 + r() * 2.5);
  }
  const t = canvasTexture(c, { repeat: true });
  t.anisotropy = 8;
  return t;
}
