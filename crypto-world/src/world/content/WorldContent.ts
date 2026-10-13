import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { Rng, hashString } from '../../core/math/random';
import { PLANET_RADIUS } from '../constants';
import { GeoBuilder } from '../kit/GeoBuilder';
import { Placement } from '../layout/LayoutBuilder';
import { World } from '../World';
import { HorizonCuller } from '../../render/Culling';
import { createWorldMaterial, getToonGradient, worldUniforms } from '../../render/materials';
import { ScreenAtlas, SignAtlas } from '../../render/Atlases';
import { getKit, KitCtx, KitInteract, Vec3 } from './Kit';

const CELL = 16;

class QuadAccum {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  quad(c: Vector3, ax: Vector3, ay: Vector3, n: Vector3, u0: number, v0: number, u1: number, v1: number): void {
    const b = this.pos.length / 3;
    const corners: [number, number, number, number][] = [
      [-1, -1, u0, v0],
      [1, -1, u1, v0],
      [1, 1, u1, v1],
      [-1, 1, u0, v1],
    ];
    for (const [sx, sy, u, v] of corners) {
      this.pos.push(c.x + ax.x * sx + ay.x * sy, c.y + ax.y * sx + ay.y * sy, c.z + ax.z * sx + ay.z * sy);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(u, v);
    }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  geometry(): BufferGeometry | null {
    if (!this.idx.length) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** Geometry with per-vertex animation parameters (GPU spin / bob). */
class AnimAccum {
  g = new GeoBuilder();
  pivot: number[] = [];
  spin: number[] = [];
  bob: number[] = [];
  add(local: GeoBuilder, m: Matrix4, pivotLocal: Vec3, axisLocal: Vec3, speed: number, bob: [number, number, number, number]): void {
    const before = this.g.vertexCount;
    this.g.push(m).merge(local).pop();
    const n = this.g.vertexCount - before;
    const p = new Vector3(...pivotLocal).applyMatrix4(m);
    const a = new Vector3(...axisLocal).transformDirection(m);
    for (let i = 0; i < n; i++) {
      this.pivot.push(p.x, p.y, p.z);
      this.spin.push(a.x, a.y, a.z, speed);
      this.bob.push(...bob);
    }
  }
  geometry(): BufferGeometry | null {
    if (this.g.isEmpty()) return null;
    const geo = this.g.toGeometry();
    geo.setAttribute('aPivot', new BufferAttribute(new Float32Array(this.pivot), 3));
    geo.setAttribute('aSpin', new BufferAttribute(new Float32Array(this.spin), 4));
    geo.setAttribute('aBob', new BufferAttribute(new Float32Array(this.bob), 4));
    return geo;
  }
}

class Cluster {
  solid = new GeoBuilder();
  grass = new GeoBuilder();
  anim = new AnimAccum();
  signs = new QuadAccum();
  screens = new QuadAccum();
  pools = new QuadAccum();
}

export interface Anchor {
  pos: Vector3;
  up: Vector3;
  forward: Vector3;
}

export interface WorldInteract extends KitInteract {
  pos: Vector3;
  up: Vector3;
  forward: Vector3;
}

/**
 * Turns layout placements into batched meshes. Geometry is merged per 16-unit spatial cluster so
 * each visible neighbourhood costs a handful of draw calls, and whole clusters are culled when they
 * sink below the horizon.
 */
export class WorldContent {
  readonly group = new Group();
  readonly anchors = new Map<string, Anchor>();
  readonly interacts: WorldInteract[] = [];
  readonly signAtlas = new SignAtlas();
  readonly screenAtlas = new ScreenAtlas();
  private clusters = new Map<string, Cluster>();
  private signMat: MeshToonMaterial;
  private screenMat: MeshBasicMaterial;
  private poolMat: MeshBasicMaterial;
  stats = { placements: 0, colliders: 0, vertices: 0, meshes: 0 };
  readonly kindVerts = new Map<string, number>();
  readonly kindCount = new Map<string, number>();

  constructor(private world: World, private culler: HorizonCuller) {
    this.group.name = 'content';
    this.signMat = new MeshToonMaterial({ map: this.signAtlas.texture, gradientMap: getToonGradient(), emissiveMap: this.signAtlas.texture });
    this.signMat.emissive.setRGB(0, 0, 0);
    this.signMat.polygonOffset = true;
    this.signMat.polygonOffsetFactor = -1;
    this.signMat.polygonOffsetUnits = -2;
    this.screenMat = new MeshBasicMaterial({ map: this.screenAtlas.texture, toneMapped: false });
    this.screenMat.polygonOffset = true;
    this.screenMat.polygonOffsetFactor = -1;
    this.screenMat.polygonOffsetUnits = -2;
    this.poolMat = new MeshBasicMaterial({
      map: radialTexture(),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      color: '#ffcf86',
      opacity: 0,
      toneMapped: false,
    });
    this.poolMat.polygonOffset = true;
    this.poolMat.polygonOffsetFactor = -4;
    this.poolMat.polygonOffsetUnits = -8;
  }

  private cluster(p: Vector3): Cluster {
    const k = `${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)},${Math.floor(p.z / CELL)}`;
    let c = this.clusters.get(k);
    if (!c) this.clusters.set(k, (c = new Cluster()));
    return c;
  }

  /** Builds a layout placement on the ground. */
  place(p: Placement): void {
    const n = p.pos.clone().normalize();
    let base = p.base ?? this.world.collision.ground(n).height;
    base -= p.params.sink ?? 0;
    this.instantiate(p.kind, n, p.xAxis, p.forward, base, p.params, p.id ?? `${p.kind}@${n.x.toFixed(4)},${n.y.toFixed(4)},${n.z.toFixed(4)}`);
    this.stats.placements++;
  }

  /**
   * Runs a kit at a surface position. `dir` is the unit up at the placement; `xAxis`/`forward` are
   * tangent axes; `base` is the ground height relative to PLANET_RADIUS.
   */
  instantiate(kind: string, dir: Vector3, xAxis: Vector3, forward: Vector3, base: number, params: Record<string, any>, id: string): void {
    const kit = getKit(kind);
    const up = dir.clone().normalize();
    const origin = up.clone().multiplyScalar(PLANET_RADIUS + base);
    const m = new Matrix4().makeBasis(xAxis, up, forward).setPosition(origin);
    const cluster = this.cluster(origin);
    const local = new GeoBuilder();
    const grass = new GeoBuilder();
    const world = this.world;
    const toWorld = (x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(m);
    const dirAt = (x: number, z: number) => toWorld(x, 0, z).normalize();
    const rotAxes = (rot = 0) => {
      const c = Math.cos(rot), s = Math.sin(rot);
      const ax = xAxis.clone().multiplyScalar(c).addScaledVector(forward, -s);
      const az = forward.clone().multiplyScalar(c).addScaledVector(xAxis, s);
      return { ax, az };
    };
    const rng = new Rng(hashString(id));

    const ctx: KitCtx = {
      g: local,
      grass,
      rng,
      params,
      id,
      up,
      spin: (build, pivot, axis, speed) => {
        const b = new GeoBuilder();
        build(b);
        cluster.anim.add(b, m, pivot, axis, speed, [0, 0, 0, 0]);
      },
      bob: (build, amplitude, speed) => {
        const b = new GeoBuilder();
        build(b);
        cluster.anim.add(b, m, [0, 0, 0], [0, 0, 1], 0, [amplitude, speed, rng.range(0, 6.28), amplitude * 0.12]);
      },
      collider: (c) => {
        const center = dirAt(c.x, c.z);
        const y0 = c.y0 ?? 0;
        if (c.type === 'circle') {
          world.collision.add({ kind: 'circle', center, radius: c.r, base: base + y0, top: base + y0 + c.h, tag: c.tag });
        } else {
          const { ax, az } = rotAxes(c.rot);
          const tx = ax.clone().addScaledVector(center, -ax.dot(center)).normalize();
          const tz = az.clone().addScaledVector(center, -az.dot(center)).normalize();
          world.collision.add({ kind: 'box', center, xAxis: tx, zAxis: tz, hx: c.hx, hz: c.hz, base: base + y0, top: base + y0 + c.h, blocksCamera: c.camera ?? c.h > 2.2, tag: c.tag });
        }
        this.stats.colliders++;
      },
      surface: (s) => {
        const center = dirAt(s.x, s.z);
        const { ax, az } = rotAxes(s.rot);
        world.collision.addSurface({
          center,
          xAxis: ax.addScaledVector(center, -ax.dot(center)).normalize(),
          zAxis: az.addScaledVector(center, -az.dot(center)).normalize(),
          hx: s.hx,
          hz: s.hz,
          h0: base + s.y0,
          h1: base + s.y1,
          material: s.material ?? 'wood',
        });
      },
      screen: (x, y, z, w, h, rotY, kind, seed, span) => {
        const uv = this.screenAtlas.allocate(kind, seed ?? '', span ?? 1);
        const { ax: rx, az: fz } = rotAxes(rotY);
        const c = toWorld(x, y, z).addScaledVector(fz, 0.004);
        cluster.screens.quad(c, rx.multiplyScalar(w / 2), up.clone().multiplyScalar(h / 2), fz, uv.u0, uv.v0, uv.u1, uv.v1);
      },
      sign: (x, y, z, w, h, rotY, spec, opts) => {
        const uv = this.signAtlas.add({ ...spec, width: w, height: h });
        const { ax: rx, az: fz } = rotAxes(rotY);
        let ay = up.clone();
        if (opts?.tiltX) {
          // Tilt back (for ground-standing plaques).
          ay = up.clone().multiplyScalar(Math.cos(opts.tiltX)).addScaledVector(fz, -Math.sin(opts.tiltX));
          fz.copy(fz.clone().multiplyScalar(Math.cos(opts.tiltX)).addScaledVector(up, Math.sin(opts.tiltX)));
        }
        const depth = (opts?.depth ?? 0) + 0.006;
        const c = toWorld(x, y, z).addScaledVector(fz, depth);
        cluster.signs.quad(c, rx.clone().multiplyScalar(w / 2), ay.clone().multiplyScalar(h / 2), fz, uv.u0, uv.v0, uv.u1, uv.v1);
        if (opts?.double) {
          const c2 = toWorld(x, y, z).addScaledVector(fz, -depth);
          cluster.signs.quad(c2, rx.clone().multiplyScalar(-w / 2), ay.clone().multiplyScalar(h / 2), fz.clone().negate(), uv.u0, uv.v0, uv.u1, uv.v1);
        }
      },
      lamp: (x, y, z, radius = 3) => {
        const ground = toWorld(x, 0, z);
        const gd = ground.clone().normalize();
        const gh = world.collision.ground(gd, base + y).height;
        const c = gd.clone().multiplyScalar(PLANET_RADIUS + gh + 0.05);
        const e = new Vector3().crossVectors(gd, forward).normalize();
        const f = new Vector3().crossVectors(e, gd).normalize();
        cluster.pools.quad(c, e.multiplyScalar(radius), f.multiplyScalar(radius), gd, 0, 0, 1, 1);
      },
      anchor: (name, x, y, z, headingRad = 0) => {
        const { az } = rotAxes(headingRad);
        this.anchors.set(`${id}.${name}`, { pos: toWorld(x, y, z), up: up.clone(), forward: az });
      },
      interact: (spec) => {
        const { az } = rotAxes(spec.heading ?? 0);
        this.interacts.push({ ...spec, pos: toWorld(spec.x, spec.y, spec.z), up: up.clone(), forward: az });
      },
    };
    kit(ctx);
    this.kindVerts.set(kind, (this.kindVerts.get(kind) ?? 0) + local.vertexCount + grass.vertexCount);
    this.kindCount.set(kind, (this.kindCount.get(kind) ?? 0) + 1);
    if (!local.isEmpty()) cluster.solid.push(m).merge(local).pop();
    if (!grass.isEmpty()) cluster.grass.push(m).merge(grass).pop();
  }

  /** Converts clusters into meshes and registers them with the culler. */
  finalize(): void {
    const solidMat = createWorldMaterial({ vertexColors: true, emissiveAttr: true, windAttr: true, name: 'solid' });
    const grassMat = createWorldMaterial({ vertexColors: true, windAttr: true, distanceFade: 42, name: 'grass' });
    const animMat = createAnimMaterial();
    for (const c of this.clusters.values()) {
      const add = (geo: BufferGeometry | null, mat: any, opts: { cast?: boolean; receive?: boolean; maxDist?: number; order?: number } = {}) => {
        if (!geo) return;
        const mesh = new Mesh(geo, mat);
        mesh.matrixAutoUpdate = false;
        mesh.castShadow = opts.cast ?? false;
        mesh.receiveShadow = opts.receive ?? true;
        if (opts.order) mesh.renderOrder = opts.order;
        this.group.add(mesh);
        this.culler.addStatic(mesh, opts.maxDist ?? Infinity);
        this.stats.vertices += geo.getAttribute('position').count;
        this.stats.meshes++;
      };
      add(c.solid.isEmpty() ? null : c.solid.toGeometry(), solidMat, { cast: true });
      add(c.grass.isEmpty() ? null : c.grass.toGeometry(), grassMat, { maxDist: 46 });
      add(c.anim.geometry(), animMat, { cast: true });
      add(c.signs.geometry(), this.signMat);
      add(c.screens.geometry(), this.screenMat, { receive: false });
      add(c.pools.geometry(), this.poolMat, { receive: false, maxDist: 90, order: 3 });
    }
    this.clusters.clear();
  }

  update(dt: number, night: number): void {
    this.screenAtlas.update(dt);
    this.poolMat.opacity = Math.max(0, (night - 0.25) / 0.75) * 0.55;
    this.signMat.emissive.setScalar(night * 0.32);
    this.screenMat.color.setScalar(0.85 + night * 0.25);
  }
}

function radialTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** World material variant whose vertices spin / bob on the GPU (fans, dishes, boats). */
function createAnimMaterial() {
  const src = createWorldMaterial({ vertexColors: true, emissiveAttr: true, name: 'anim-base' });
  const mat = src.clone();
  const base = src.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    base.call(mat, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 aPivot;
attribute vec4 aSpin;
attribute vec4 aBob;
vec3 cwRot(vec3 p, vec3 k, float a){ return p*cos(a) + cross(k,p)*sin(a) + k*dot(k,p)*(1.0-cos(a)); }
`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
float cwAng = uTime * aSpin.w + aBob.w * sin(uTime * aBob.y + aBob.z);
objectNormal = cwRot(objectNormal, aSpin.xyz, cwAng);
`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
transformed = aPivot + cwRot(transformed - aPivot, aSpin.xyz, cwAng);
transformed += normalize(aPivot + vec3(1e-5)) * aBob.x * sin(uTime * aBob.y + aBob.z + 1.3);
`,
      );
  };
  mat.customProgramCacheKey = () => 'anim-world';
  return mat;
}

export { worldUniforms };
