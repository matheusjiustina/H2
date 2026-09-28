import * as THREE from 'three';
import { GROWTH } from '../config/game.js';
import { clamp, ease, lerp, mulberry32, Spring } from '../utils/math.js';
import { glowSprite } from '../world/materials.js';

/**
 * PlantRig — a plant is a set of parts, each one appearing at a given
 * growth stage with its own animation ("grow", "unfold", "pop", "bud"...).
 * Everything is a pure function of the time since planting, so a plant
 * restored after a page reload looks exactly right instantly.
 */
export class PlantRig {
  constructor(stock, seed = 1) {
    this.stock = stock;
    this.rng = mulberry32(seed);
    this.root = new THREE.Group();
    this.squashGroup = new THREE.Group();
    this.sway = new THREE.Group();
    this.root.add(this.squashGroup);
    this.squashGroup.add(this.sway);

    this.parts = [];
    this.fx = [];
    this.heights = [0.14, 0.32, 0.8, 1.25, 1.45];
    this.phase = this.rng() * 10;
    this.wiggleX = new Spring(110, 5.5);
    this.wiggleZ = new Spring(110, 5.5);
    this.squash = new Spring(260, 11, 1);
    this.out = 0;

    this.readyGlow = glowSprite(stock.accent, 1.4, 0);
    this.readyGlow.position.y = 1.0;
    this.sway.add(this.readyGlow);
    this.sparkPoints = [];
    this.ownedMaterials = new Set();
  }

  mat(color, opts = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, ...opts });
    this.ownedMaterials.add(m);
    return m;
  }

  basic(color, opts = {}) {
    const m = new THREE.MeshBasicMaterial({ color, ...opts });
    this.ownedMaterials.add(m);
    return m;
  }

  mesh(geo, material, { shadow = true } = {}) {
    const m = new THREE.Mesh(geo, material);
    // Tiny parts don't need a shadow pass (saves draw calls on mobile).
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    m.castShadow = shadow && geo.boundingSphere.radius > 0.07;
    return m;
  }

  /**
   * Register an animated part.
   * opts: { parent, stage, delay, dur, kind, full, fullDelay, hide, hideDelay, closed, flutter }
   */
  part(obj, opts = {}) {
    const parent = opts.parent ?? this.sway;
    parent.add(obj);
    const p = {
      obj,
      stage: opts.stage ?? 0,
      delay: opts.delay ?? 0,
      dur: opts.dur ?? 1.1,
      kind: opts.kind ?? 'pop',
      full: opts.full ?? null,
      fullDelay: opts.fullDelay ?? 0,
      hide: opts.hide ?? null,
      hideDelay: opts.hideDelay ?? 0,
      closed: opts.closed ?? -1.35,
      flutter: opts.flutter ?? 1,
      sink: opts.sink ?? 0,
      budScale: opts.budScale ?? 0.4,
      phase: this.rng() * Math.PI * 2,
      baseScale: obj.scale.clone(),
      baseRot: obj.rotation.clone(),
      basePos: obj.position.clone(),
    };
    obj.visible = false;
    this.parts.push(p);
    return obj;
  }

  /**
   * Leaf on a pivot: yaw around the stem, open tilt, attached at height y.
   * `anim` are part() options (stage, delay...). Returns the leaf mesh.
   */
  leaf(geo, material, { y = 0, yaw = 0, tilt = -0.35, x = 0, z = 0, roll = 0, parent } = {}, anim = {}) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.rotation.y = yaw;
    pivot.rotation.z = roll;
    (parent ?? this.sway).add(pivot);
    const m = this.mesh(geo, material);
    m.rotation.x = tilt;
    this.part(m, { kind: 'unfold', ...anim, parent: pivot });
    return m;
  }

  onFrame(fn) {
    this.fx.push(fn);
  }

  heightAt(growT) {
    const S = GROWTH.stageStarts;
    let i = 0;
    for (let k = 0; k < S.length; k++) if (growT >= S[k]) i = k;
    const k = ease.outCubic(clamp((growT - S[i]) / 1.4));
    return lerp(this.heights[Math.max(0, i - 1)], this.heights[i], k);
  }

  poke(strength = 1) {
    const a = this.rng() * Math.PI * 2;
    this.wiggleX.kick(Math.cos(a) * 1.6 * strength);
    this.wiggleZ.kick(Math.sin(a) * 1.6 * strength);
  }

  bounce(strength = 1) {
    this.squash.kick(-3.2 * strength);
  }

  update(dt, t, growT, ctx) {
    const S = GROWTH.stageStarts;
    const wx = this.wiggleX.update(dt);
    const wz = this.wiggleZ.update(dt);
    const sq = this.squash.update(dt);
    const agitation = Math.min(1, Math.abs(this.wiggleX.v) + Math.abs(this.wiggleZ.v)) * 0.35;

    // Gentle wind + wiggle.
    const wind = 0.022 + agitation * 0.02;
    this.sway.rotation.z = Math.sin(t * 0.9 + this.phase) * wind + wx * 0.12;
    this.sway.rotation.x = Math.sin(t * 0.7 + this.phase * 1.3) * wind * 0.8 + wz * 0.12;
    this.squashGroup.scale.set(1 / Math.sqrt(Math.max(0.3, sq)), sq, 1 / Math.sqrt(Math.max(0.3, sq)));

    for (const p of this.parts) {
      const o = p.obj;
      const a = clamp((growT - S[p.stage] - p.delay) / p.dur);
      let hf = 1;
      if (p.hide != null) {
        const h = clamp((growT - S[p.hide] - p.hideDelay) / 0.6);
        hf = 1 - ease.inCubic(h);
      }
      if (a <= 0 || hf <= 0.001) {
        o.visible = false;
        continue;
      }
      o.visible = true;
      const bs = p.baseScale;
      switch (p.kind) {
        case 'grow': {
          const sy = ease.outBack(a, 1.1);
          const sxz = ease.outCubic(Math.min(1, a * 1.3));
          o.scale.set(bs.x * sxz * hf, bs.y * Math.max(0.001, sy) * hf, bs.z * sxz * hf);
          break;
        }
        case 'unfold': {
          const s = ease.outCubic(Math.min(1, a * 1.5));
          const open = ease.outBack(a, 1.8);
          o.scale.set(bs.x * s * hf, bs.y * s * hf, bs.z * s * hf);
          const flutter = Math.sin(t * 1.9 + p.phase) * 0.045 * p.flutter * (1 + agitation * 4);
          o.rotation.x = lerp(p.closed, p.baseRot.x, open) + flutter;
          break;
        }
        case 'bud': {
          const b = p.full != null ? clamp((growT - S[p.full] - p.fullDelay) / p.dur) : 0;
          const s = p.budScale * ease.outBack(a, 1.6) + (1 - p.budScale) * ease.outElastic(b);
          o.scale.set(bs.x * s * hf, bs.y * s * hf, bs.z * s * hf);
          break;
        }
        case 'sink': {
          o.scale.set(bs.x * hf, bs.y * hf, bs.z * hf);
          o.position.y = p.basePos.y - p.sink * ease.inOutCubic(clamp((growT - S[p.stage] - p.delay - 0.25) / 1.4));
          break;
        }
        case 'static': {
          o.scale.set(bs.x * hf, bs.y * hf, bs.z * hf);
          break;
        }
        default: {
          // pop
          const s = Math.max(0, ease.outElastic(a));
          o.scale.set(bs.x * s * hf, bs.y * s * hf, bs.z * s * hf);
        }
      }
    }

    // Ready glow
    const readyT = growT - S[4];
    const rg = this.readyGlow;
    if (readyT > 0) {
      rg.visible = true;
      rg.position.y = this.heights[4] * 0.62;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + this.phase);
      rg.material.opacity = Math.min(1, readyT * 1.5) * (0.28 + pulse * 0.18);
      rg.scale.setScalar(1.3 + pulse * 0.2);
    } else {
      rg.visible = false;
    }

    ctx.readyT = readyT;
    ctx.agitation = agitation;
    for (const fn of this.fx) fn(ctx);

    // Harvest exit
    if (this.out > 0) {
      const k = ease.inBack(clamp(this.out), 2.2);
      const s = Math.max(0.0001, 1 - k);
      this.root.scale.setScalar(s);
      this.root.rotation.y = this.out * 1.2;
    }
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh && !o.userData.sharedGeo) o.geometry?.dispose();
      if (o.isPoints) o.geometry?.dispose();
    });
    this.ownedMaterials.forEach((m) => m.dispose());
    this.readyGlow.material.dispose();
    this.root.removeFromParent();
  }
}

/* ---------------------------------------------------------------- geometry */

const PROFILES = {
  ellipse: (u) => Math.sin(Math.PI * Math.pow(u, 0.85)),
  blade: (u) => Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05)), 0.7) * (1 - u * 0.55),
  round: (u) => Math.pow(Math.sin(Math.PI * u), 0.55),
  diamond: (u) => (u < 0.38 ? u / 0.38 : (1 - u) / 0.62),
  petal: (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.65)), 0.8),
};

/** Leaf strip along +Z from the pivot, V-folded along the midrib. */
export function leafGeometry(len, width, { segs = 7, bend = 0.12, fold = 0.3, profile = 'ellipse' } = {}) {
  const prof = PROFILES[profile] ?? PROFILES.ellipse;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const z = u * len;
    const hw = (width / 2) * Math.max(0, prof(u));
    const y = -bend * len * u * u;
    pos.push(-hw, y - fold * hw, z, 0, y, z, hw, y - fold * hw, z);
    uv.push(0.5 - hw / width, u, 0.5, u, 0.5 + hw / width, u);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 3;
    const b = a + 3;
    idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Tapered stem with its base at the origin. */
export function stemGeometry(h, rBottom, rTop, radial = 8) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, radial, 1);
  g.translate(0, h / 2, 0);
  return g;
}

/** Tube along points, base at first point. */
export function tubeGeometry(points, radius, { segs = 24, radial = 7, closed = false, curve = 'smooth' } = {}) {
  const v = points.map((p) => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2])));
  let path;
  if (curve === 'sharp') {
    path = new THREE.CurvePath();
    for (let i = 0; i < v.length - 1; i++) path.add(new THREE.LineCurve3(v[i], v[i + 1]));
  } else {
    path = new THREE.CatmullRomCurve3(v, closed, 'centripetal');
  }
  const g = new THREE.TubeGeometry(path, segs, radius, radial, closed);
  g.userData.path = path;
  return g;
}

/* ------------------------------------------------------- shared early stages */

/** Stage 0: the seed capsule that landed; slowly sinks into the soil. */
export function addSeed(rig, { color, accent }) {
  const body = rig.mat(color, { metalness: 0.7, roughness: 0.25 });
  const band = rig.basic(accent);
  const g = new THREE.Group();
  const cap = rig.mesh(new THREE.CapsuleGeometry(0.075, 0.1, 6, 12), body);
  const ring = rig.mesh(new THREE.CylinderGeometry(0.079, 0.079, 0.022, 16), band, { shadow: false });
  g.add(cap, ring);
  g.position.y = 0.1;
  g.rotation.z = 0.25;
  rig.part(g, { stage: 0, delay: 0.85, kind: 'sink', sink: 0.09, hide: 1, hideDelay: 0 });
  const glow = glowSprite(accent, 0.5, 0.5);
  glow.position.y = 0.06;
  rig.part(glow, { stage: 0, delay: 0.9, kind: 'static', hide: 1, hideDelay: 0.1 });
  rig.onFrame(({ t, growT }) => {
    if (glow.visible) glow.material.opacity = 0.25 + 0.2 * Math.sin(t * 3.2) + (growT < 1.6 ? 0.4 : 0);
  });
}

/** Stage 1: a tiny sprout with two seed leaves. Fades when the real plant takes over. */
export function addSprout(rig, { stem = '#6d9c5a', leaf = '#8fcf6f', hideAt = 2, emissive } = {}) {
  const stemMat = rig.mat(stem, { roughness: 0.6 });
  const leafMat = rig.mat(leaf, {
    roughness: 0.55,
    side: THREE.DoubleSide,
    emissive: emissive ?? '#000000',
    emissiveIntensity: emissive ? 0.35 : 0,
  });
  const s = rig.mesh(stemGeometry(0.26, 0.016, 0.011, 6), stemMat);
  rig.part(s, { stage: 1, delay: 0, dur: 0.9, kind: 'grow', hide: hideAt, hideDelay: 0.6 });
  const g = leafGeometry(0.15, 0.1, { profile: 'round', bend: 0.05, fold: 0.2 });
  for (let i = 0; i < 2; i++) {
    rig.leaf(
      g,
      leafMat,
      { y: 0.24, yaw: i * Math.PI + 0.3, tilt: -0.25 },
      { stage: 1, delay: 0.35 + i * 0.12, dur: 1.1, hide: hideAt, hideDelay: 0.6 + i * 0.1 },
    );
  }
}
