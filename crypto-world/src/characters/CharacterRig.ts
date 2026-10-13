import { Bone, BufferAttribute, Group, Skeleton, SkinnedMesh, Sphere, Vector3 } from 'three';
import { GeoBuilder } from '../world/kit/GeoBuilder';
import { createWorldMaterial } from '../render/materials';
import { Appearance } from './Appearance';

export const BONE_NAMES = [
  'root', 'hips', 'spine', 'head', 'eyes',
  'shL', 'elL', 'shR', 'elR',
  'hipL', 'knL', 'hipR', 'knR',
  'propEnvelope', 'propPhone', 'propTool', 'propCup', 'propBrush', 'propBook',
] as const;
export type BoneName = (typeof BONE_NAMES)[number];
export type PropName = 'envelope' | 'phone' | 'tool' | 'cup' | 'brush' | 'book';

const PARENT: Partial<Record<BoneName, BoneName>> = {
  hips: 'root', spine: 'hips', head: 'spine', eyes: 'head',
  shL: 'spine', elL: 'shL', shR: 'spine', elR: 'shR',
  hipL: 'hips', knL: 'hipL', hipR: 'hips', knR: 'hipR',
  propEnvelope: 'elR', propPhone: 'elR', propTool: 'elR', propCup: 'elR', propBrush: 'elR', propBook: 'elL',
};

const INK = '#2a2430';

/**
 * A stylised character built procedurally as ONE skinned mesh with rigid bone weights, so each
 * character costs a single draw call (plus its shadow). The skeleton exposes joints for the
 * procedural animator, eyes that can blink, and hand-held props that appear on demand.
 */
export class CharacterRig {
  readonly group = new Group();
  readonly mesh: SkinnedMesh;
  readonly bones = {} as Record<BoneName, Bone>;
  readonly bind = {} as Record<BoneName, Vector3>;
  readonly height: number;
  readonly legLength: number;
  readonly scale: number;

  constructor(readonly look: Appearance) {
    const H = look.height ?? 1;
    const B = look.build ?? 1;
    this.scale = H;
    this.height = 1.55 * H;
    const leg = 0.58 * H;
    this.legLength = leg;

    // ---- Bind-pose joint positions (mesh space, character faces +Z, +X is its left) ----------
    const P: Record<BoneName, Vector3> = {
      root: new Vector3(0, 0, 0),
      hips: new Vector3(0, leg, 0),
      spine: new Vector3(0, leg + 0.1 * H, 0),
      head: new Vector3(0, leg + 0.48 * H, 0),
      eyes: new Vector3(0, leg + 0.7 * H, 0.2),
      shL: new Vector3(0.2 * B, leg + 0.4 * H, 0),
      elL: new Vector3(0.21 * B, leg + 0.19 * H, 0),
      shR: new Vector3(-0.2 * B, leg + 0.4 * H, 0),
      elR: new Vector3(-0.21 * B, leg + 0.19 * H, 0),
      hipL: new Vector3(0.095 * B, leg - 0.02, 0),
      knL: new Vector3(0.095 * B, leg * 0.5, 0),
      hipR: new Vector3(-0.095 * B, leg - 0.02, 0),
      knR: new Vector3(-0.095 * B, leg * 0.5, 0),
      propEnvelope: new Vector3(-0.21 * B, leg - 0.03 * H, 0.06),
      propPhone: new Vector3(-0.21 * B, leg - 0.03 * H, 0.06),
      propTool: new Vector3(-0.21 * B, leg - 0.03 * H, 0.06),
      propCup: new Vector3(-0.21 * B, leg - 0.03 * H, 0.06),
      propBrush: new Vector3(-0.21 * B, leg - 0.03 * H, 0.06),
      propBook: new Vector3(0.21 * B, leg - 0.03 * H, 0.06),
    };
    Object.assign(this.bind, P);

    // ---- Geometry per bone ----------------------------------------------------------------------
    const parts = {} as Record<BoneName, GeoBuilder>;
    for (const n of BONE_NAMES) parts[n] = new GeoBuilder();
    const L = look;
    const skin = L.skin;
    const longSleeves = !['tee', 'apron', 'vest', 'overalls'].includes(L.topStyle);
    const sleeve = longSleeves ? L.top : skin;
    const sleeveUpper = L.topStyle === 'vest' || L.topStyle === 'overalls' ? (L.topAccent ?? '#f4efe6') : L.top;
    const shirt = L.topAccent ?? '#f4efe6';

    // Legs.
    for (const side of [1, -1] as const) {
      const hip = side > 0 ? parts.hipL : parts.hipR;
      const knee = side > 0 ? parts.knL : parts.knR;
      const x = 0.095 * B * side;
      hip.cyl(0.072 * B, 0.07 * B, leg * 0.52, [x, leg * 0.74, 0], L.bottom, { seg: 10 });
      hip.sphere(0.074 * B, [x, leg - 0.02, 0], L.bottom, { ws: 8, hs: 6 });
      const shinCol = L.shorts ? skin : L.bottom;
      knee.cyl(0.064 * B, 0.06 * B, leg * 0.42, [x, leg * 0.3, 0], shinCol, { seg: 10 });
      knee.sphere(0.066 * B, [x, leg * 0.5, 0], L.shorts ? skin : L.bottom, { ws: 8, hs: 6 });
      if (L.shorts) knee.cyl(0.07 * B, 0.07 * B, 0.04, [x, leg * 0.12, 0], '#f4efe6', { seg: 10 });
      knee.rbox(0.14 * B, 0.1, 0.25, 0.04, [x, 0.05, 0.045], L.shoes);
      knee.box(0.15 * B, 0.025, 0.26, [x, 0.012, 0.045], '#f1ebe0');
    }

    // Pelvis.
    const hips = parts.hips;
    hips.rbox(0.3 * B, 0.17 * H, 0.2, 0.06, [0, leg + 0.03, 0], L.bottom);
    hips.box(0.31 * B, 0.035, 0.21, [0, leg + 0.1 * H, 0], '#3a3336');

    // Torso.
    const sp = parts.spine;
    const ty = leg + 0.1 * H;
    const th = 0.34 * H;
    const tw = 0.34 * B;
    const tcol = ['jacket', 'vest', 'overalls', 'coat', 'labcoat'].includes(L.topStyle) ? shirt : L.top;
    sp.rbox(tw, th, 0.22 * B, 0.08, [0, ty + th / 2, 0], tcol);
    sp.sphere(0.06, [0, ty + th + 0.02, 0], skin, { ws: 8, hs: 6, scale: [1, 1.2, 1] });
    switch (L.topStyle) {
      case 'hoodie':
        sp.sphere(0.16, [0, ty + th - 0.02, -0.11], L.top, { ws: 10, hs: 6, scale: [1.2, 0.7, 0.8] });
        sp.rbox(0.2 * B, 0.09, 0.02, 0.02, [0, ty + 0.1, 0.112 * B], L.topAccent ?? L.top);
        for (const s of [-1, 1]) sp.box(0.012, 0.09, 0.012, [s * 0.04, ty + th - 0.1, 0.115 * B], '#f4efe6');
        break;
      case 'jacket':
      case 'coat':
      case 'labcoat':
        for (const s of [-1, 1]) sp.rbox(tw * 0.42, th, 0.23 * B, 0.06, [s * tw * 0.3, ty + th / 2, 0.002], L.top);
        for (const s of [-1, 1]) sp.box(0.07, 0.11, 0.02, [s * 0.08, ty + th - 0.06, 0.115 * B], L.top, { rot: [0.2, 0, s * 0.5] });
        if (L.topStyle !== 'jacket') hips.rbox(0.33 * B, 0.2 * H, 0.23 * B, 0.05, [0, leg - 0.02, 0], L.top);
        if (L.topStyle === 'labcoat') for (const s of [-1, 1]) sp.box(0.06, 0.05, 0.01, [s * 0.1, ty + 0.12, 0.117 * B], '#c9d3db');
        break;
      case 'apron':
        sp.box(tw * 0.75, th * 0.85, 0.01, [0, ty + th * 0.45, 0.112 * B], L.topAccent ?? '#e9e2d4');
        hips.box(0.28 * B, 0.22, 0.01, [0, leg - 0.03, 0.105 * B], L.topAccent ?? '#e9e2d4');
        break;
      case 'vest':
        for (const s of [-1, 1]) sp.rbox(tw * 0.4, th * 0.9, 0.23 * B, 0.05, [s * tw * 0.32, ty + th * 0.47, 0.002], L.top);
        break;
      case 'overalls':
        sp.box(tw * 0.62, th * 0.6, 0.01, [0, ty + th * 0.3, 0.112 * B], L.bottom);
        for (const s of [-1, 1]) sp.box(0.04, th * 0.5, 0.01, [s * 0.09, ty + th * 0.72, 0.112 * B], L.bottom);
        break;
      case 'sweater':
        sp.torus(0.07, 0.025, [0, ty + th, 0], L.topAccent ?? L.top, { rot: [Math.PI / 2, 0, 0] });
        sp.box(tw + 0.005, 0.04, 0.225 * B, [0, ty + th * 0.55, 0], L.topAccent ?? '#f4efe6');
        break;
      case 'shirt':
        for (const s of [-1, 1]) sp.box(0.07, 0.04, 0.02, [s * 0.05, ty + th - 0.02, 0.105 * B], L.topAccent ?? '#f4efe6', { rot: [0.3, 0, s * 0.4] });
        for (let i = 0; i < 3; i++) sp.sphere(0.01, [0, ty + 0.06 + i * 0.09, 0.113 * B], '#e9e2d4', { ws: 4, hs: 3 });
        break;
      default:
        break;
    }

    // Arms.
    for (const side of [1, -1] as const) {
      const sh = side > 0 ? parts.shL : parts.shR;
      const el = side > 0 ? parts.elL : parts.elR;
      const x = 0.205 * B * side;
      const sy = leg + 0.4 * H;
      sh.sphere(0.07 * B, [x - side * 0.01, sy, 0], sleeveUpper, { ws: 8, hs: 6 });
      sh.cyl(0.058, 0.054, 0.22 * H, [x, sy - 0.11 * H, 0], sleeveUpper, { seg: 8 });
      const ey = leg + 0.19 * H;
      el.sphere(0.054, [x, ey, 0], longSleeves ? sleeve : skin, { ws: 8, hs: 6 });
      el.cyl(0.052, 0.046, 0.17 * H, [x, ey - 0.09 * H, 0], longSleeves ? sleeve : skin, { seg: 8 });
      if (longSleeves) el.cyl(0.053, 0.053, 0.03, [x, ey - 0.17 * H, 0], L.topAccent ?? sleeve, { seg: 8 });
      el.sphere(0.06, [x, ey - 0.22 * H, 0.005], skin, { ws: 8, hs: 6, scale: [0.9, 1.05, 0.95] });
    }

    // Head.
    const hd = parts.head;
    const hy = leg + 0.72 * H;
    const hr = 0.255 * Math.sqrt(H);
    hd.sphere(hr, [0, hy, 0], skin, { ws: 16, hs: 12, scale: [1.0, 0.96, 0.94] });
    for (const s of [-1, 1]) hd.sphere(0.055, [s * hr * 0.98, hy - 0.01, -0.01], skin, { ws: 6, hs: 4, scale: [0.6, 1, 0.9] });
    hd.sphere(0.03, [0, hy - 0.04, hr * 0.93], skin, { ws: 6, hs: 4 });
    // Smile.
    hd.torus(0.042, 0.011, [0, hy - 0.085, hr * 0.86], INK, { arc: Math.PI * 0.8, rot: [0.25, 0, Math.PI + Math.PI * 0.1] });
    if (L.blush !== false) for (const s of [-1, 1]) hd.sphere(0.04, [s * 0.12, hy - 0.06, hr * 0.8], '#f2a0a0', { ws: 6, hs: 4, scale: [1, 0.55, 0.3] });
    if (L.freckles) for (let i = 0; i < 6; i++) hd.sphere(0.008, [(i % 3 - 1) * 0.025 + (i < 3 ? -0.12 : 0.12), hy - 0.035 - (i % 2) * 0.012, hr * 0.86], '#b9785a', { ws: 4, hs: 3 });
    // Brows.
    const browY = hy + 0.075;
    const browStyle = L.brows ?? 'normal';
    for (const s of [-1, 1]) {
      const tilt = browStyle === 'worried' ? s * 0.25 : browStyle === 'arched' ? -s * 0.2 : 0;
      hd.rbox(0.07, browStyle === 'thick' ? 0.025 : 0.016, 0.02, 0.006, [s * 0.085, browY, hr * 0.9], L.hair === '#e8e1d6' ? '#bdb6ac' : L.hair, { rot: [0, 0, tilt] });
    }
    // Facial hair.
    if (L.beard) hd.sphere(hr * 0.78, [0, hy - 0.12, 0.06], L.beard, { ws: 12, hs: 8, scale: [1.0, 0.62, 0.95] });
    if (L.mustache) hd.rbox(0.11, 0.03, 0.03, 0.012, [0, hy - 0.065, hr * 0.92], L.mustache);
    hair(hd, L, hy, hr);
    hat(hd, L, hy, hr);
    glasses(hd, L, hy, hr);

    // Eyes (own bone so they can blink).
    const ey = parts.eyes;
    for (const s of [-1, 1]) {
      ey.sphere(0.042, [s * 0.088, hy + 0.012, hr * 0.86], L.eye ?? INK, { ws: 8, hs: 6, scale: [0.8, 1.15, 0.5] });
      ey.sphere(0.012, [s * 0.088 + 0.012, hy + 0.03, hr * 0.885], '#ffffff', { ws: 4, hs: 3 });
    }

    // Bags and accessories.
    const bagCol = L.bagColor ?? '#c9663e';
    if (L.bag === 'messenger' || L.bag === 'satchel') {
      sp.box(0.04, 0.5 * H, 0.012, [0, ty + th * 0.5, 0.114 * B], '#3b2d26', { rot: [0, 0, 0.72] });
      sp.box(0.04, 0.5 * H, 0.012, [0, ty + th * 0.5, -0.114 * B], '#3b2d26', { rot: [0, 0, -0.72] });
      const big = L.bag === 'messenger';
      hips.rbox(big ? 0.1 : 0.08, big ? 0.24 : 0.16, big ? 0.3 : 0.18, 0.04, [-0.21 * B, leg + 0.04, 0.02], bagCol);
      hips.box(0.105, 0.11, big ? 0.31 : 0.19, [-0.215 * B, leg + 0.12, 0.02], '#3b2d26');
      if (big) hips.sphere(0.025, [-0.27 * B, leg + 0.09, 0.08], '#f0b04a', { ws: 6, hs: 4, emissive: 1.4 });
    } else if (L.bag === 'backpack') {
      sp.rbox(0.28 * B, 0.32 * H, 0.14, 0.05, [0, ty + th * 0.5, -0.17 * B], bagCol);
      sp.rbox(0.2 * B, 0.12, 0.05, 0.03, [0, ty + th * 0.32, -0.25 * B], '#3b2d26');
      for (const s of [-1, 1]) sp.box(0.035, th * 0.9, 0.02, [s * 0.09, ty + th * 0.5, 0.113 * B], '#3b2d26');
    }
    const acc = L.accessoryColor ?? '#d9584a';
    switch (L.accessory) {
      case 'scarf':
        sp.torus(0.085, 0.04, [0, ty + th - 0.01, 0.01], acc, { rot: [Math.PI / 2, 0, 0] });
        sp.rbox(0.07, 0.18, 0.03, 0.02, [0.05, ty + th - 0.12, 0.11 * B], acc);
        break;
      case 'tie':
        sp.box(0.04, 0.2, 0.012, [0, ty + th - 0.12, 0.114 * B], acc);
        break;
      case 'bowtie':
        sp.box(0.09, 0.035, 0.02, [0, ty + th - 0.03, 0.115 * B], acc);
        break;
      case 'badge':
        sp.rbox(0.06, 0.08, 0.012, 0.01, [0.08, ty + th - 0.1, 0.115 * B], acc);
        break;
      case 'necklace':
        sp.torus(0.08, 0.008, [0, ty + th - 0.02, 0.04], '#e3c06a', { rot: [Math.PI / 2 + 0.6, 0, 0] });
        sp.cyl(0.025, 0.025, 0.008, [0, ty + th - 0.11, 0.116 * B], '#f0b04a', { rot: [Math.PI / 2, 0, 0], seg: 10, emissive: 1.2 });
        break;
      case 'toolbelt':
        hips.box(0.33 * B, 0.05, 0.23, [0, leg + 0.06, 0], '#6b4a30');
        for (const s of [-1, 1]) hips.rbox(0.08, 0.1, 0.06, 0.02, [s * 0.11, leg + 0.0, 0.11], '#8a6a48');
        break;
      case 'camera':
        sp.box(0.03, 0.35, 0.01, [0.06, ty + th * 0.6, 0.113 * B], INK, { rot: [0, 0, -0.3] });
        sp.rbox(0.11, 0.07, 0.05, 0.015, [0, ty + th * 0.35, 0.13 * B], INK);
        sp.cyl(0.022, 0.022, 0.03, [0, ty + th * 0.35, 0.165 * B], '#7b8794', { rot: [Math.PI / 2, 0, 0], seg: 8 });
        break;
    }

    // Hand props (hidden until used).
    const hand = new Vector3(-0.21 * B, leg - 0.03 * H, 0.06);
    parts.propEnvelope.rbox(0.2, 0.13, 0.02, 0.01, [hand.x, hand.y + 0.02, hand.z + 0.02], '#fbe7b0', { emissive: 1.25 });
    parts.propEnvelope.box(0.16, 0.012, 0.022, [hand.x, hand.y + 0.05, hand.z + 0.022], '#d9584a', { rot: [0, 0, 0.35] });
    parts.propPhone.rbox(0.07, 0.13, 0.015, 0.01, [hand.x, hand.y + 0.03, hand.z + 0.02], '#2a2f38');
    parts.propPhone.box(0.06, 0.11, 0.004, [hand.x, hand.y + 0.03, hand.z + 0.029], '#7cc8ff', { emissive: 1.6 });
    parts.propTool.box(0.03, 0.26, 0.03, [hand.x, hand.y + 0.08, hand.z], '#9aa6b2');
    parts.propTool.torus(0.035, 0.013, [hand.x, hand.y + 0.22, hand.z], '#9aa6b2', { arc: Math.PI * 1.4 });
    parts.propCup.cyl(0.04, 0.034, 0.09, [hand.x, hand.y + 0.03, hand.z + 0.02], '#f4efe6', { seg: 10 });
    parts.propCup.cyl(0.042, 0.042, 0.02, [hand.x, hand.y + 0.08, hand.z + 0.02], '#7a4d2c', { seg: 10 });
    parts.propBrush.cyl(0.012, 0.014, 0.28, [hand.x, hand.y + 0.06, hand.z + 0.03], '#c99e72', { seg: 6, rot: [0.5, 0, 0] });
    parts.propBrush.cone(0.02, 0.06, [hand.x, hand.y + 0.18, hand.z + 0.1], '#e8644a', { seg: 6, rot: [0.5, 0, 0] });
    const bh = new Vector3(0.21 * B, leg - 0.03 * H, 0.06);
    parts.propBook.rbox(0.03, 0.2, 0.15, 0.01, [bh.x, bh.y + 0.04, bh.z + 0.02], '#4f9ea3');

    // ---- Merge with rigid skin weights -----------------------------------------------------------
    const all = new GeoBuilder();
    const skinIdx: number[] = [];
    BONE_NAMES.forEach((n, i) => {
      const before = all.vertexCount;
      if (!parts[n].isEmpty()) all.merge(parts[n]);
      for (let k = before; k < all.vertexCount; k++) skinIdx.push(i, 0, 0, 0);
    });
    const geo = all.toGeometry();
    geo.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(skinIdx), 4));
    const w = new Float32Array((skinIdx.length / 4) * 4);
    for (let i = 0; i < w.length; i += 4) w[i] = 1;
    geo.setAttribute('skinWeight', new BufferAttribute(w, 4));
    geo.boundingSphere = new Sphere(new Vector3(0, this.height / 2, 0), this.height * 0.9);

    // ---- Skeleton ------------------------------------------------------------------------------------
    const bones: Bone[] = [];
    for (const n of BONE_NAMES) {
      const b = new Bone();
      b.name = n;
      this.bones[n] = b;
      bones.push(b);
    }
    for (const n of BONE_NAMES) {
      const parent = PARENT[n];
      const b = this.bones[n];
      if (parent) {
        this.bones[parent].add(b);
        b.position.copy(P[n]).sub(P[parent]);
      } else b.position.copy(P[n]);
    }
    const mat = createWorldMaterial({ vertexColors: true, emissiveAttr: true, windAttr: true, name: 'solid' });
    this.mesh = new SkinnedMesh(geo, mat);
    this.mesh.add(this.bones.root);
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new Skeleton(bones));
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = true;
    this.group.add(this.mesh);
    for (const p of ['envelope', 'phone', 'tool', 'cup', 'brush', 'book'] as PropName[]) this.showProp(p, false);
  }

  showProp(p: PropName, on: boolean): void {
    const b = this.bones[('prop' + p[0].toUpperCase() + p.slice(1)) as BoneName];
    b.scale.setScalar(on ? 1 : 0.0001);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.skeleton.dispose();
  }
}

function hair(g: GeoBuilder, L: Appearance, hy: number, hr: number): void {
  const c = L.hair;
  const style = L.hairStyle;
  if (style === 'bald') return;
  // Hair shell sits high and slightly back so it frames the face without covering the eyes.
  const cap = (scaleY = 0.8, back = -0.06) => g.sphere(hr * 1.06, [0, hy + 0.075, back], c, { ws: 14, hs: 10, scale: [1.03, scaleY, 0.98] });
  switch (style) {
    case 'short':
      cap();
      for (let i = 0; i < 4; i++) g.sphere(0.07, [-0.12 + i * 0.08, hy + 0.16, hr * 0.74], c, { ws: 6, hs: 4, scale: [1, 0.55, 0.7] });
      break;
    case 'swoop':
      cap();
      g.sphere(0.13, [0.06, hy + 0.17, hr * 0.66], c, { ws: 10, hs: 6, scale: [1.6, 0.55, 0.8], rot: [0, 0, -0.3] });
      break;
    case 'bob':
      cap(0.9, -0.02);
      for (const s of [-1, 1]) g.sphere(0.12, [s * hr * 0.88, hy - 0.04, -0.01], c, { ws: 10, hs: 8, scale: [0.6, 1.3, 1.05] });
      g.sphere(hr * 0.98, [0, hy - 0.02, -0.08], c, { ws: 12, hs: 8, scale: [1.02, 0.95, 0.85] });
      for (let i = 0; i < 5; i++) g.sphere(0.06, [-0.14 + i * 0.07, hy + 0.155, hr * 0.76], c, { ws: 6, hs: 4, scale: [1, 0.55, 0.7] });
      break;
    case 'bun':
      cap();
      g.sphere(0.11, [0, hy + hr * 0.95, -0.08], c, { ws: 10, hs: 8 });
      break;
    case 'ponytail':
      cap();
      g.sphere(0.06, [0, hy + 0.06, -hr * 1.0], c, { ws: 6, hs: 4 });
      g.cyl(0.05, 0.03, 0.28, [0, hy - 0.08, -hr * 1.08], c, { seg: 8, rot: [0.2, 0, 0] });
      break;
    case 'pigtails':
      cap();
      for (const s of [-1, 1]) {
        g.sphere(0.05, [s * hr * 0.95, hy + 0.04, -0.06], c, { ws: 6, hs: 4 });
        g.cyl(0.045, 0.025, 0.24, [s * hr * 1.08, hy - 0.08, -0.06], c, { seg: 8, rot: [0, 0, s * 0.3] });
      }
      break;
    case 'spiky':
      cap(0.8);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        g.cone(0.07, 0.18, [Math.cos(a) * 0.12, hy + 0.2, Math.sin(a) * 0.1 - 0.02], c, { seg: 5, rot: [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6] });
      }
      g.cone(0.08, 0.22, [0, hy + 0.27, -0.02], c, { seg: 5 });
      break;
    case 'long':
      cap(0.9, -0.02);
      g.rbox(hr * 1.9, 0.42, 0.14, 0.06, [0, hy - 0.12, -hr * 0.62], c);
      for (const s of [-1, 1]) g.rbox(0.07, 0.3, 0.12, 0.03, [s * hr * 0.92, hy - 0.08, 0.02], c);
      break;
    case 'mohawk':
      for (let i = 0; i < 5; i++) g.rbox(0.06, 0.14 - Math.abs(i - 2) * 0.015, 0.09, 0.02, [0, hy + hr * 0.92 + 0.03, 0.14 - i * 0.08], c, { rot: [0.3 - i * 0.15, 0, 0] });
      break;
    case 'curly':
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = i % 2 ? 0.18 : 0.12;
        g.sphere(0.075, [Math.cos(a) * r, hy + 0.17 + (i % 3) * 0.02, Math.sin(a) * r - 0.04], c, { ws: 6, hs: 4 });
      }
      cap(0.75);
      break;
    case 'afro':
      // Big and round, but set high and back so the face stays readable from any angle.
      g.sphere(hr * 1.24, [0, hy + 0.13, -hr * 0.4], c, { ws: 14, hs: 10, scale: [1.08, 0.98, 0.92] });
      break;
  }
}

function hat(g: GeoBuilder, L: Appearance, hy: number, hr: number): void {
  const style = L.hat ?? 'none';
  const c = L.hatColor ?? '#d9584a';
  const top = hy + hr * 0.75;
  switch (style) {
    case 'cap':
      g.sphere(hr * 1.08, [0, hy + 0.1, -0.03], c, { ws: 14, hs: 8, scale: [1.03, 0.68, 1.0] });
      g.cyl(0.16, 0.16, 0.025, [0, hy + 0.135, hr * 0.92], c, { seg: 14, scale: [1, 1, 0.7], rot: [0.12, 0, 0] });
      g.sphere(0.022, [0, hy + hr * 0.88, 0], '#f4efe6', { ws: 6, hs: 4 });
      break;
    case 'flatcap':
      g.sphere(hr * 1.1, [0, hy + 0.1, 0.02], c, { ws: 14, hs: 8, scale: [1.05, 0.55, 1.08] });
      g.cyl(0.12, 0.12, 0.02, [0, top - 0.04, hr * 0.85], c, { seg: 12, scale: [1.2, 1, 0.6] });
      break;
    case 'beanie':
      g.sphere(hr * 1.08, [0, hy + 0.11, -0.03], c, { ws: 14, hs: 8, scale: [1.03, 0.78, 1.0] });
      g.torus(hr * 0.99, 0.04, [0, hy + 0.1, -0.02], L.hatColor ? '#f4efe6' : c, { rot: [Math.PI / 2, 0, 0] });
      g.sphere(0.07, [0, hy + hr * 1.0, -0.02], '#f4efe6', { ws: 8, hs: 6 });
      break;
    case 'hardhat':
      g.sphere(hr * 1.1, [0, hy + 0.11, -0.02], c, { ws: 14, hs: 8, scale: [1, 0.72, 1.02] });
      g.cyl(hr * 1.2, hr * 1.25, 0.03, [0, hy + 0.11, 0.02], c, { seg: 16 });
      g.box(0.04, 0.05, hr * 1.9, [0, hy + hr * 0.82, 0], c);
      break;
    case 'beret':
      g.sphere(hr * 1.02, [0.04, top + 0.0, 0], c, { ws: 14, hs: 6, scale: [1.1, 0.35, 1.05], rot: [0, 0, -0.2] });
      g.cyl(0.01, 0.01, 0.05, [0.04, top + 0.09, 0], c, { seg: 6 });
      break;
    case 'bucket':
      g.cyl(hr * 0.85, hr * 1.0, 0.16, [0, top, 0], c, { seg: 16 });
      g.cyl(hr * 1.35, hr * 1.4, 0.025, [0, top - 0.08, 0], c, { seg: 16 });
      break;
    case 'tophat':
      g.cyl(hr * 0.7, hr * 0.72, 0.3, [0, top + 0.12, 0], c, { seg: 16 });
      g.cyl(hr * 1.15, hr * 1.15, 0.025, [0, top - 0.03, 0], c, { seg: 16 });
      g.cyl(hr * 0.73, hr * 0.73, 0.06, [0, top + 0.0, 0], '#d9584a', { seg: 16 });
      break;
    case 'headband':
      g.torus(hr * 1.0, 0.025, [0, hy + 0.1, 0], c, { rot: [Math.PI / 2, 0, 0] });
      break;
    case 'visor':
      g.torus(hr * 1.0, 0.025, [0, hy + 0.1, 0], c, { rot: [Math.PI / 2, 0, 0] });
      g.cyl(0.14, 0.14, 0.02, [0, hy + 0.1, hr * 0.9], c, { seg: 12, scale: [1, 1, 0.6] });
      break;
    case 'headphones':
      g.torus(hr * 1.05, 0.022, [0, hy + 0.03, 0], c, { arc: Math.PI });
      for (const s of [-1, 1]) g.cyl(0.07, 0.07, 0.06, [s * hr * 1.02, hy, 0], c, { rot: [0, 0, Math.PI / 2], seg: 12 });
      break;
    default:
      break;
  }
}

function glasses(g: GeoBuilder, L: Appearance, hy: number, hr: number): void {
  const style = L.glasses ?? 'none';
  const c = L.glassesColor ?? '#2a2430';
  const y = hy + 0.015;
  const z = hr * 0.93;
  switch (style) {
    case 'round':
      for (const s of [-1, 1]) g.torus(0.05, 0.009, [s * 0.088, y, z], c);
      g.box(0.05, 0.01, 0.01, [0, y + 0.01, z], c);
      break;
    case 'square':
      for (const s of [-1, 1]) {
        g.box(0.1, 0.012, 0.012, [s * 0.088, y + 0.04, z], c);
        g.box(0.1, 0.012, 0.012, [s * 0.088, y - 0.035, z], c);
        g.box(0.012, 0.085, 0.012, [s * 0.088 + 0.05, y, z], c);
        g.box(0.012, 0.085, 0.012, [s * 0.088 - 0.05, y, z], c);
      }
      g.box(0.05, 0.01, 0.01, [0, y + 0.01, z], c);
      break;
    case 'shades':
      for (const s of [-1, 1]) g.rbox(0.1, 0.06, 0.012, 0.01, [s * 0.085, y, z + 0.008], '#1a1d24');
      g.box(0.22, 0.012, 0.012, [0, y + 0.03, z], c);
      break;
    case 'goggles':
      g.torus(hr * 1.0, 0.02, [0, hy + 0.12, 0], '#3b2d26', { rot: [Math.PI / 2 - 0.25, 0, 0] });
      for (const s of [-1, 1]) g.cyl(0.05, 0.05, 0.05, [s * 0.075, hy + 0.17, hr * 0.85], c, { rot: [Math.PI / 2 - 0.5, 0, 0], seg: 12 });
      break;
  }
}
