import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  InstancedMesh,
  MeshToonMaterial,
  Matrix4,
  Mesh,
  Points,
  Quaternion,
  Scene,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { Rng } from '../core/math/random';
import { damp } from '../core/math/sphere';
import { createWorldMaterial, getToonGradient } from '../render/materials';
import { HorizonCuller } from '../render/Culling';
import { PLANET_RADIUS } from './constants';
import { GeoBuilder } from './kit/GeoBuilder';
import type { RegionId } from './layout/LayoutBuilder';
import type { World } from './World';
import type { Interactable } from '../gameplay/WorldProps';

/**
 * Ambient life: drifting clouds, bird flocks, butterflies, night fireflies and two pettable
 * critters. Everything here is decoration and never affects gameplay state, so it can be simplified
 * or disabled per quality level without changing how the game plays.
 */

const R = PLANET_RADIUS;
const _m = new Matrix4();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _s = new Vector3();
const _p = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const ZERO = new Matrix4().makeScale(0, 0, 0);

function frameAt(up: Vector3, forward: Vector3, out: Quaternion): Quaternion {
  const f = _a.copy(forward).addScaledVector(up, -forward.dot(up)).normalize();
  const r = _b.crossVectors(up, f).normalize();
  return out.setFromRotationMatrix(_m.makeBasis(r, up, f));
}

/** A tangent-frame helper: any two orthonormal tangents at a surface direction. */
function tangents(dir: Vector3): [Vector3, Vector3] {
  const ref = Math.abs(dir.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const e = new Vector3().crossVectors(ref, dir).normalize();
  const n = new Vector3().crossVectors(dir, e).normalize();
  return [e, n];
}

interface Flock {
  center: Vector3;
  e: Vector3;
  n: Vector3;
  radius: number;
  height: number;
  speed: number;
  start: number;
  count: number;
  glide: boolean;
  wobble: number;
}

interface Butterfly {
  home: Vector3;
  e: Vector3;
  n: Vector3;
  phase: number;
  speed: number;
}

type CritterKind = 'dog' | 'cat';

interface Critter {
  id: string;
  name: string;
  kind: CritterKind;
  root: Group;
  body: Mesh;
  head: Mesh;
  tail: Mesh;
  legs: Mesh[];
  dir: Vector3;
  facing: Vector3;
  feet: number;
  home: Vector3[];
  target: number;
  wait: number;
  speed: number;
  gait: number;
  mood: 'idle' | 'walk' | 'follow' | 'happy' | 'sleep';
  moodT: number;
  interact: Interactable;
}

export class Life {
  readonly group = new Group();
  readonly interactables: Interactable[] = [];
  private clouds: Mesh;
  private cloudAxis = new Vector3(0.25, 1, 0.12).normalize();
  private birdBody: InstancedMesh;
  private birdWingL: InstancedMesh;
  private birdWingR: InstancedMesh;
  private flocks: Flock[] = [];
  private flyBody: InstancedMesh;
  private flyWingL: InstancedMesh;
  private flyWingR: InstancedMesh;
  private butterflies: Butterfly[] = [];
  private fireflies: Points;
  private fireMat: ShaderMaterial;
  private critters: Critter[] = [];
  private hearts: { sprite: Sprite; t: number; base: Vector3; up: Vector3 }[] = [];
  private heartMat: SpriteMaterial;
  private rng = new Rng(7781);
  /** Called for critter and gull voices. */
  onSound: (kind: 'bark' | 'meow' | 'gull') => void = () => undefined;
  private gullTimer = 6;

  constructor(private world: World, scene: Scene, private culler: HorizonCuller) {
    this.group.name = 'life';
    scene.add(this.group);
    const mat = createWorldMaterial({ vertexColors: true, name: 'life' });

    // ---- Clouds: one merged mesh orbiting slowly around a tilted axis ------------------------------
    const cg = new GeoBuilder();
    const rng = this.rng;
    for (let i = 0; i < 16; i++) {
      // Even-ish spread (golden spiral) so the sky never clumps.
      const yv = 1 - ((i + 0.5) / 16) * 2;
      const rr = Math.sqrt(1 - yv * yv);
      const th = i * 2.399963 + rng.range(-0.3, 0.3);
      const dir = new Vector3(Math.cos(th) * rr, yv, Math.sin(th) * rr).normalize();
      const [e, n] = tangents(dir);
      const alt = R + rng.range(26, 32);
      const center = dir.clone().multiplyScalar(alt);
      const puffs = 5 + Math.floor(rng.range(0, 3));
      const len = rng.range(9, 14);
      for (let k = 0; k < puffs; k++) {
        const t = k / (puffs - 1) - 0.5;
        const r = rng.range(3.2, 4.6) * (1 - Math.abs(t) * 0.75);
        const p = center.clone().addScaledVector(e, t * len).addScaledVector(n, rng.range(-1.2, 1.2)).addScaledVector(dir, r * 0.25);
        cg.sphere(r, [p.x, p.y, p.z], '#ffffff', { detail: 1 });
      }
      // Flat-ish base so clouds read as clouds from below and from orbit.
      cg.sphere(len * 0.42, [center.x, center.y, center.z], '#f3f6fa', { detail: 1, scale: [1.45, 0.42, 1.0] });
    }
    // Clouds get their own soft material: lifted shadow side, no camera dither, fogged like the sky.
    const cloudMat = new MeshToonMaterial({ vertexColors: true, gradientMap: getToonGradient(), emissive: new Color('#b9c8da'), emissiveIntensity: 0.55 });
    this.clouds = new Mesh(cg.toGeometry(), cloudMat);
    this.clouds.name = 'clouds';
    this.clouds.frustumCulled = false;
    this.group.add(this.clouds);

    // ---- Birds: instanced bodies and wings -----------------------------------------------------------
    const body = new GeoBuilder();
    body.sphere(0.13, [0, 0, 0], '#ffffff', { ws: 8, hs: 6, scale: [0.8, 0.7, 1.8] });
    body.sphere(0.085, [0, 0.06, 0.22], '#ffffff', { ws: 8, hs: 6 });
    body.cone(0.035, 0.09, [0, 0.05, 0.33], '#f0b04a', { seg: 5, rot: [Math.PI / 2, 0, 0] });
    body.box(0.16, 0.02, 0.14, [0, 0.01, -0.26], '#ffffff');
    const wing = (s: number) => {
      const w = new GeoBuilder();
      w.box(0.42, 0.02, 0.17, [s * 0.23, 0, 0], '#ffffff');
      w.box(0.22, 0.02, 0.1, [s * 0.52, 0, -0.03], '#d9dde3');
      return w.toGeometry();
    };
    const flockDefs: [RegionId, number, number, number, number, number, number, string, boolean][] = [
      // region, x, y, radius, height, count, speed, colour, glide
      ['coast', 6, -16, 9, 9, 7, 3.2, '#f6f7f9', true],
      ['coast', -10, 6, 6, 7, 4, 2.8, '#eceff3', true],
      ['hills', 0, 0, 8, 7.5, 5, 4.0, '#8a6a48', false],
      ['woods', 0, 0, 7, 10, 5, 3.6, '#5b4a3a', false],
      ['city', 0, 0, 6, 8, 4, 3.4, '#9aa3ad', false],
      ['heights', 0, 6, 10, 14, 3, 3.0, '#2a2430', true],
    ];
    const total = flockDefs.reduce((a, f) => a + f[5], 0);
    this.birdBody = new InstancedMesh(body.toGeometry(), mat, total);
    this.birdWingL = new InstancedMesh(wing(-1), mat, total);
    this.birdWingR = new InstancedMesh(wing(1), mat, total);
    let start = 0;
    for (const [region, x, y, radius, height, count, speed, col, glide] of flockDefs) {
      const center = world.layout.get(region).frame.basis(x, y, 0).pos.clone().normalize();
      const [e, n] = tangents(center);
      this.flocks.push({ center, e, n, radius, height: height + world.groundHeight(center), speed, start, count, glide, wobble: rng.range(0, 6) });
      const c = new Color(col);
      for (let i = 0; i < count; i++) {
        for (const m of [this.birdBody, this.birdWingL, this.birdWingR]) m.setColorAt(start + i, c);
      }
      start += count;
    }
    for (const m of [this.birdBody, this.birdWingL, this.birdWingR]) {
      m.frustumCulled = false;
      m.castShadow = true;
      this.group.add(m);
    }

    // ---- Butterflies ---------------------------------------------------------------------------------
    const fwing = (s: number) => {
      const w = new GeoBuilder();
      w.box(0.16, 0.006, 0.13, [s * 0.085, 0, 0.03], '#ffffff');
      w.box(0.11, 0.006, 0.09, [s * 0.065, 0, -0.07], '#ffffff');
      return w.toGeometry();
    };
    const fbody = new GeoBuilder();
    fbody.box(0.025, 0.025, 0.16, [0, 0, 0], '#2a2430');
    const homes: [RegionId, number, number, number][] = [
      ['hills', -12, 4.6, 4],
      ['hills', -6.8, -7.5, 3],
      ['city', -4.5, 11.2, 3],
      ['city', 4.2, 11.3, 2],
      ['woods', 12, 3.5, 3],
      ['woods', 1, -10.5, 2],
      ['south', 0, 0, 3],
    ];
    const palette = ['#f0b04a', '#e8823a', '#6aa9e0', '#f4efe6', '#e98fb0', '#9d6fc9'];
    for (const [region, x, y, n] of homes) {
      for (let i = 0; i < n; i++) {
        const b = world.layout.get(region).frame.basis(x + rng.range(-1.5, 1.5), y + rng.range(-1.5, 1.5), 0);
        const home = b.pos.clone().normalize();
        const [e, nn] = tangents(home);
        this.butterflies.push({ home, e, n: nn, phase: rng.range(0, 100), speed: rng.range(0.7, 1.2) });
      }
    }
    const nb = this.butterflies.length;
    this.flyBody = new InstancedMesh(fbody.toGeometry(), mat, nb);
    this.flyWingL = new InstancedMesh(fwing(-1), mat, nb);
    this.flyWingR = new InstancedMesh(fwing(1), mat, nb);
    for (let i = 0; i < nb; i++) {
      const c = new Color(palette[i % palette.length]);
      this.flyWingL.setColorAt(i, c);
      this.flyWingR.setColorAt(i, c);
      this.flyBody.setColorAt(i, new Color('#ffffff'));
    }
    for (const m of [this.flyBody, this.flyWingL, this.flyWingR]) {
      m.frustumCulled = false;
      this.group.add(m);
    }

    // ---- Fireflies (night only) ----------------------------------------------------------------------
    const spots: [RegionId, number, number, number, number][] = [
      ['woods', 0, 0, 16, 34],
      ['hills', -10, 2, 10, 14],
      ['south', 0, 0, 10, 12],
      ['city', 0, -40, 8, 10],
    ];
    const fpos: number[] = [];
    const fseed: number[] = [];
    for (const [region, x, y, spread, n] of spots) {
      for (let i = 0; i < n; i++) {
        const b = world.layout.get(region).frame.basis(x + rng.range(-spread, spread), y + rng.range(-spread, spread), 0);
        const d = b.pos.clone().normalize();
        const g = world.groundHeight(d);
        if (g < -0.4) continue;
        const p = d.multiplyScalar(R + g + rng.range(0.4, 2.2));
        fpos.push(p.x, p.y, p.z);
        fseed.push(rng.range(0, 100));
      }
    }
    const fg = new BufferGeometry();
    fg.setAttribute('position', new BufferAttribute(new Float32Array(fpos), 3));
    fg.setAttribute('aSeed', new BufferAttribute(new Float32Array(fseed), 1));
    this.fireMat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uScale: { value: 720 } },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        uniform float uNight;
        uniform float uScale;
        varying float vGlow;
        void main() {
          vec3 p = position;
          vec3 up = normalize(p);
          vec3 e = normalize(cross(abs(up.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0), up));
          vec3 n = cross(up, e);
          float t = uTime * 0.5 + aSeed;
          p += e * sin(t * 0.9) * 0.9 + n * cos(t * 0.7) * 0.9 + up * sin(t * 1.3) * 0.35;
          vGlow = uNight * (0.45 + 0.55 * pow(0.5 + 0.5 * sin(uTime * 2.3 + aSeed * 3.1), 3.0));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uScale * 0.45 / -mv.z;
        }`,
      fragmentShader: /* glsl */ `
        varying float vGlow;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.0, d);
          a = a * a * vGlow;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(0.85, 1.0, 0.45) * a * 2.2, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.fireflies = new Points(fg, this.fireMat);
    this.fireflies.frustumCulled = false;
    this.group.add(this.fireflies);

    // ---- Critters --------------------------------------------------------------------------------------
    const heart = document.createElement('canvas');
    heart.width = heart.height = 64;
    const hc = heart.getContext('2d')!;
    hc.fillStyle = '#e8566a';
    hc.beginPath();
    hc.moveTo(32, 54);
    hc.bezierCurveTo(4, 34, 8, 8, 32, 20);
    hc.bezierCurveTo(56, 8, 60, 34, 32, 54);
    hc.fill();
    hc.lineWidth = 4;
    hc.strokeStyle = '#fff4ec';
    hc.stroke();
    this.heartMat = new SpriteMaterial({ map: new CanvasTexture(heart), transparent: true, depthWrite: false });

    this.critters.push(
      this.makeCritter('critter.dog', 'HODL', 'dog', mat, 'hills', [[-16.5, 2.5], [-14.6, 8.9], [-18.6, 4.6], [-10.5, -1.5], [-8.5, -6]]),
      this.makeCritter('critter.cat', 'LEDGER', 'cat', mat, 'city', [[11.2, 4.3], [6.8, -3.9], [3.4, -7.4], [-2.6, -7.6]]),
    );
  }

  private makeCritter(id: string, name: string, kind: CritterKind, mat: any, region: RegionId, points: [number, number][]): Critter {
    const root = new Group();
    root.name = id;
    const part = (build: (g: GeoBuilder) => void) => {
      const g = new GeoBuilder();
      build(g);
      const m = new Mesh(g.toGeometry(), mat);
      m.castShadow = true;
      return m;
    };
    const dog = kind === 'dog';
    const fur = dog ? '#c98b4a' : '#e0873e';
    const light = dog ? '#f3e2c7' : '#f4efe6';
    const s = dog ? 1 : 0.8;
    const body = part((g) => {
      g.sphere(0.2 * s, [0, 0, 0], fur, { ws: 10, hs: 8, scale: [0.85, 0.8, 1.5] });
      g.sphere(0.12 * s, [0, -0.06 * s, 0.1 * s], light, { ws: 8, hs: 6, scale: [0.9, 0.7, 1.4] });
    });
    body.position.y = 0.36 * s;
    const head = part((g) => {
      g.sphere(0.15 * s, [0, 0, 0], fur, { ws: 10, hs: 8 });
      g.sphere(0.07 * s, [0, -0.04 * s, 0.13 * s], light, { ws: 8, hs: 6, scale: [1, 0.8, 1.2] });
      g.sphere(0.028 * s, [0, -0.01 * s, 0.2 * s], '#2a2430', { ws: 6, hs: 4 });
      for (const x of [-1, 1]) {
        g.sphere(0.026 * s, [x * 0.062 * s, 0.045 * s, 0.135 * s], '#1d1a1a', { ws: 6, hs: 4 });
        if (dog) g.sphere(0.07 * s, [x * 0.12 * s, 0.02 * s, -0.02 * s], '#8f5a2e', { ws: 8, hs: 6, scale: [0.45, 1.3, 0.8], rot: [0, 0, x * 0.3] });
        else g.cone(0.06 * s, 0.11 * s, [x * 0.08 * s, 0.13 * s, 0], fur, { seg: 4 });
      }
    });
    head.position.set(0, 0.52 * s, 0.27 * s);
    const tail = part((g) => {
      g.cyl(0.03 * s, 0.018 * s, 0.26 * s, [0, 0.13 * s, 0], dog ? light : fur, { seg: 6 });
    });
    tail.position.set(0, 0.42 * s, -0.2 * s);
    tail.rotation.x = -0.9;
    const legs: Mesh[] = [];
    for (const [x, z] of [[-0.1, 0.17], [0.1, 0.17], [-0.1, -0.17], [0.1, -0.17]]) {
      const leg = part((g) => g.cyl(0.04 * s, 0.035 * s, 0.3 * s, [0, -0.15 * s, 0], fur, { seg: 6 }));
      leg.position.set(x * s, 0.3 * s, z * s);
      legs.push(leg);
    }
    root.add(body, head, tail, ...legs);
    this.group.add(root);
    const frame = this.world.layout.get(region).frame;
    const home = points.map(([x, y]) => frame.basis(x, y, 0).pos.clone().normalize());
    const dir = home[0].clone();
    const facing = tangents(dir)[0];
    const interact: Interactable = {
      id,
      kind: 'pet',
      label: `Pet ${name}`,
      pos: dir.clone().multiplyScalar(R),
      up: dir.clone(),
      forward: facing.clone(),
      radius: 1.6,
      data: { critter: id },
      enabled: () => true,
    };
    this.interactables.push(interact);
    const c: Critter = {
      id, name, kind, root, body, head, tail, legs, dir, facing, feet: this.world.groundHeight(dir), home, target: 0, wait: 2,
      speed: 0, gait: 0, mood: kind === 'cat' ? 'sleep' : 'idle', moodT: 0, interact,
    };
    this.culler.add(root, dir.clone().multiplyScalar(R), 1.2);
    return c;
  }

  /** The player petted a critter: a happy reaction, a voice and a little heart. */
  pet(id: string): string | null {
    const c = this.critters.find((x) => x.id === id);
    if (!c) return null;
    c.mood = 'happy';
    c.moodT = 2.4;
    this.onSound(c.kind === 'dog' ? 'bark' : 'meow');
    const sprite = new Sprite(this.heartMat);
    sprite.scale.setScalar(0.3);
    this.group.add(sprite);
    this.hearts.push({ sprite, t: 0, base: c.dir.clone().multiplyScalar(R + c.feet + (c.kind === 'dog' ? 0.85 : 0.65)), up: c.dir.clone() });
    return c.name;
  }

  /** Firefly sprites are sized in pixels, so they follow the drawing-buffer height. */
  setViewportHeight(px: number): void {
    this.fireMat.uniforms.uScale.value = px;
  }

  update(dt: number, time: number, night: number, player: Vector3, camera: Vector3, quality: 'low' | 'medium' | 'high'): void {
    // Clouds drift; at night they dim slightly through the shared world lighting.
    this.clouds.quaternion.multiply(_q.setFromAxisAngle(this.cloudAxis, dt * 0.004));
    this.clouds.updateMatrix();

    // Birds.
    const occ = this.culler.occluderRadius;
    for (const f of this.flocks) {
      const centerPos = _c.copy(f.center).multiplyScalar(R + f.height);
      const visible = HorizonCuller.isAboveHorizon(camera, centerPos, f.radius + 4, occ) && !(quality === 'low' && f.count < 4);
      for (let i = 0; i < f.count; i++) {
        const k = f.start + i;
        if (!visible) {
          this.birdBody.setMatrixAt(k, ZERO);
          this.birdWingL.setMatrixAt(k, ZERO);
          this.birdWingR.setMatrixAt(k, ZERO);
          continue;
        }
        const ph = (i / f.count) * Math.PI * 2 + i * 0.37;
        const rad = f.radius * (0.75 + 0.25 * Math.sin(i * 1.7 + time * 0.1));
        const ang = ph + (time * f.speed) / f.radius;
        const h = f.height + Math.sin(time * 0.6 + i * 2.1 + f.wobble) * 0.8 + (i % 3) * 0.6;
        const pos = _p.copy(f.center).multiplyScalar(R + h).addScaledVector(f.e, Math.cos(ang) * rad).addScaledVector(f.n, Math.sin(ang) * rad);
        const up = _s.copy(pos).normalize();
        const fwd = _a.copy(f.e).multiplyScalar(-Math.sin(ang)).addScaledVector(f.n, Math.cos(ang));
        frameAt(up, fwd, _q2);
        // Banking into the turn.
        _q2.multiply(_q.setFromAxisAngle(_b.set(0, 0, 1), -0.35));
        const flapPhase = time * (f.glide ? 7 : 13) + i * 1.3;
        const flapping = f.glide ? Math.max(0, Math.sin(time * 0.5 + i)) : 1;
        const flap = Math.sin(flapPhase) * (0.15 + 0.6 * flapping);
        const sc = f.glide ? 1.25 : 0.8;
        _s.setScalar(sc);
        this.birdBody.setMatrixAt(k, _m.compose(pos, _q2, _s));
        this.birdWingL.setMatrixAt(k, _m.compose(pos, _q.copy(_q2).multiply(_q.clone().setFromAxisAngle(_b.set(0, 0, 1), flap)), _s));
        this.birdWingR.setMatrixAt(k, _m.compose(pos, _q.copy(_q2).multiply(_q.clone().setFromAxisAngle(_b.set(0, 0, 1), -flap)), _s));
      }
    }
    this.birdBody.instanceMatrix.needsUpdate = true;
    this.birdWingL.instanceMatrix.needsUpdate = true;
    this.birdWingR.instanceMatrix.needsUpdate = true;

    // Gulls call now and then when the player is near the shore.
    this.gullTimer -= dt;
    if (this.gullTimer <= 0) {
      this.gullTimer = 7 + Math.random() * 9;
      const gulls = this.flocks[0];
      if (night < 0.5 && player.distanceTo(_c.copy(gulls.center).multiplyScalar(R)) < 30) this.onSound('gull');
    }

    // Butterflies (daytime).
    const day = night < 0.55;
    for (let i = 0; i < this.butterflies.length; i++) {
      const b = this.butterflies[i];
      const homePos = _c.copy(b.home).multiplyScalar(R);
      if (!day || !HorizonCuller.isAboveHorizon(camera, homePos, 4, occ) || camera.distanceTo(homePos) > 40) {
        this.flyBody.setMatrixAt(i, ZERO);
        this.flyWingL.setMatrixAt(i, ZERO);
        this.flyWingR.setMatrixAt(i, ZERO);
        continue;
      }
      const t = time * b.speed + b.phase;
      const g = this.world.groundHeight(b.home);
      const pos = _p
        .copy(b.home)
        .multiplyScalar(R + g + 0.7 + 0.35 * Math.sin(t * 1.7))
        .addScaledVector(b.e, Math.sin(t * 0.8) * 1.4 + Math.sin(t * 2.1) * 0.25)
        .addScaledVector(b.n, Math.cos(t * 0.6) * 1.4);
      const up = _s.copy(pos).normalize();
      const fwd = _a.copy(b.e).multiplyScalar(Math.cos(t * 0.8) * 0.8).addScaledVector(b.n, -Math.sin(t * 0.6) * 0.6);
      if (fwd.lengthSq() < 1e-4) fwd.copy(b.e);
      frameAt(up, fwd, _q2);
      const flap = 0.2 + Math.abs(Math.sin(t * 16)) * 1.1;
      _s.setScalar(1);
      this.flyBody.setMatrixAt(i, _m.compose(pos, _q2, _s));
      this.flyWingL.setMatrixAt(i, _m.compose(pos, _q.copy(_q2).multiply(_q.clone().setFromAxisAngle(_b.set(0, 0, 1), flap)), _s));
      this.flyWingR.setMatrixAt(i, _m.compose(pos, _q.copy(_q2).multiply(_q.clone().setFromAxisAngle(_b.set(0, 0, 1), -flap)), _s));
    }
    this.flyBody.instanceMatrix.needsUpdate = true;
    this.flyWingL.instanceMatrix.needsUpdate = true;
    this.flyWingR.instanceMatrix.needsUpdate = true;

    // Fireflies.
    this.fireMat.uniforms.uTime.value = time;
    this.fireMat.uniforms.uNight.value = Math.max(0, (night - 0.35) / 0.65);
    this.fireflies.visible = night > 0.35;

    // Critters.
    for (const c of this.critters) this.updateCritter(c, dt, time, player);

    // Hearts float up and fade.
    for (let i = this.hearts.length - 1; i >= 0; i--) {
      const h = this.hearts[i];
      h.t += dt;
      h.sprite.position.copy(h.base).addScaledVector(h.up, h.t * 0.6);
      h.sprite.material.opacity = Math.max(0, 1 - h.t / 1.4);
      h.sprite.scale.setScalar(0.25 + h.t * 0.12);
      if (h.t > 1.4) {
        this.group.remove(h.sprite);
        this.hearts.splice(i, 1);
      }
    }
  }

  private updateCritter(c: Critter, dt: number, time: number, player: Vector3): void {
    const here = _c.copy(c.dir).multiplyScalar(R + c.feet);
    const toPlayer = player.distanceTo(here);
    c.moodT -= dt;
    const dog = c.kind === 'dog';

    // Decide where to go.
    let goal: Vector3 | null = null;
    let want = 0;
    if (c.mood === 'happy') {
      if (c.moodT <= 0) c.mood = 'idle';
      this.faceToward(c, player, dt, 6);
    } else if (dog && toPlayer < 7 && toPlayer > 1.7 && c.home[0].angleTo(player.clone().normalize()) * R < 26) {
      c.mood = 'follow';
      goal = player;
      want = toPlayer > 3.5 ? 2.6 : 1.3;
    } else if (dog && toPlayer <= 1.7) {
      c.mood = 'idle';
      this.faceToward(c, player, dt, 4);
    } else {
      if (c.mood === 'follow') c.mood = 'idle';
      c.wait -= dt;
      const tgt = c.home[c.target];
      const dist = c.dir.angleTo(tgt) * R;
      if (c.wait > 0) {
        if (!dog && c.wait > 4 && c.mood !== 'sleep' && c.target === 0) c.mood = 'sleep';
        if (!dog && toPlayer < 1.4 && c.mood === 'sleep') c.mood = 'idle';
      } else if (dist > 0.3) {
        if (c.mood === 'sleep') c.mood = 'idle';
        goal = _b.copy(tgt).multiplyScalar(R);
        want = dog ? 1.4 : 0.7;
      } else {
        c.target = (c.target + 1 + Math.floor(Math.random() * (c.home.length - 1))) % c.home.length;
        c.wait = dog ? 3 + Math.random() * 5 : 6 + Math.random() * 10;
      }
    }

    c.speed += (want - c.speed) * damp(4, dt);
    if (goal && c.speed > 0.05) {
      const t = _a.copy(goal).normalize().sub(c.dir);
      t.addScaledVector(c.dir, -t.dot(c.dir));
      if (t.lengthSq() > 1e-10) c.facing.lerp(t.normalize(), damp(5, dt)).addScaledVector(c.dir, -c.facing.dot(c.dir)).normalize();
      const axis = _a.crossVectors(c.dir, c.facing).normalize();
      c.dir.applyAxisAngle(axis, (c.speed * dt) / R).normalize();
      this.world.collision.resolve(c.dir, c.feet, 0.25, 0.6);
      c.facing.addScaledVector(c.dir, -c.facing.dot(c.dir)).normalize();
    }
    const g = this.world.collision.ground(c.dir, c.feet);
    c.feet += (g.height - c.feet) * Math.min(1, dt * 12);

    // Pose.
    c.gait += c.speed * dt * (dog ? 9 : 11);
    const sw = Math.min(1, c.speed / 0.6);
    c.legs.forEach((leg, i) => (leg.rotation.x = Math.sin(c.gait + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.7 * sw));
    const s = dog ? 1 : 0.8;
    const sleeping = c.mood === 'sleep';
    const happy = c.mood === 'happy';
    const sitting = !sleeping && c.speed < 0.1 && (happy || dog);
    c.body.position.y = (sleeping ? 0.18 : sitting ? 0.32 : 0.36) * s + Math.abs(Math.sin(c.gait)) * 0.02 * sw;
    c.body.rotation.x = sitting ? -0.35 : 0;
    c.body.scale.set(1, sleeping ? 0.75 : 1, sleeping ? 0.8 : 1);
    c.head.position.set(0, (sleeping ? 0.24 : sitting ? 0.6 : 0.52) * s, (sleeping ? 0.2 : 0.27) * s);
    c.head.rotation.x = sleeping ? 0.5 : happy ? -0.25 + Math.sin(time * 9) * 0.08 : Math.sin(time * 0.7) * 0.08;
    c.head.rotation.y = sleeping ? 0.6 : Math.sin(time * 0.43 + (dog ? 0 : 2)) * 0.3 * (1 - sw);
    for (const leg of c.legs) leg.visible = !sleeping;
    const wag = dog ? (happy || c.mood === 'follow' ? 18 : 6) : happy ? 4 : 1.5;
    c.tail.rotation.z = Math.sin(time * wag) * (dog ? 0.6 : 0.25);
    c.tail.rotation.x = sleeping ? -1.6 : dog ? -0.9 : happy ? -0.2 : -0.6;
    c.tail.position.y = (sleeping ? 0.2 : 0.42) * s;

    const pos = _p.copy(c.dir).multiplyScalar(R + c.feet);
    c.root.position.copy(pos);
    frameAt(c.dir, c.facing, c.root.quaternion);
    c.interact.pos.copy(c.dir).multiplyScalar(R + c.feet + 0.4);
    c.interact.up.copy(c.dir);
    c.interact.forward.copy(c.facing).negate();
    this.culler.move(c.root, pos);
  }

  private faceToward(c: Critter, p: Vector3, dt: number, rate: number): void {
    const t = _a.copy(p).normalize().sub(c.dir);
    t.addScaledVector(c.dir, -t.dot(c.dir));
    if (t.lengthSq() < 1e-10) return;
    c.facing.lerp(t.normalize(), damp(rate, dt)).addScaledVector(c.dir, -c.facing.dot(c.dir)).normalize();
  }
}
