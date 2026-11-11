import * as THREE from 'three';
import { clamp, lerp, Rect } from '../core/util';
import { RNG } from '../core/rng';
import { ChunkMesh, Geo } from '../render/geo';
import { M, PAL, toonColor } from '../render/materials';
import { BOUNDS, DistrictId, districtAt, POI, SEA, Zone } from './layout';
import { RoadNet } from './roads';
import { Terrain } from './terrain';
import { Signs } from './signs';

export interface Solid {
  x: number;
  z: number;
  hw: number;
  hd: number;
  rot: number;
  cs: number;
  sn: number;
  y0: number;
  y1: number;
  /** 0 = flat top, 1 = top slopes along local x, 2 = along local z. */
  ramp: 0 | 1 | 2;
  ya: number;
  yb: number;
  on: boolean;
  stamp: number;
  tag: string;
  /** Blocks the camera. */
  cam: boolean;
}

export interface SolidOpts {
  tag?: string;
  cam?: boolean;
  ramp?: { axis: 'x' | 'z'; ya: number; yb: number };
  dynamic?: boolean;
}

export interface InteractDef {
  id: string;
  kind: 'elevator' | 'metro' | 'safehouse' | 'ladder' | 'shop' | 'dock' | 'garage' | 'info';
  x: number;
  y: number;
  z: number;
  r: number;
  label: string;
  /** Destination for elevators / ladders. */
  to?: { x: number; y: number; z: number };
  data?: string;
}

export interface ParkSpot {
  x: number;
  z: number;
  rot: number;
  y?: number;
  kind?: string;
  id?: string;
}

const CELL = 16;
const keyOf = (ix: number, iz: number) => (ix + 512) * 2048 + (iz + 512);

export class World {
  group = new THREE.Group();
  roads = new RoadNet();
  terrain = new Terrain(this.roads);
  geo = new Geo(120);
  signs = new Signs();
  rng = new RNG(20261110);
  chunks: ChunkMesh[] = [];
  private hash = new Map<number, Solid[]>();
  dyn: Solid[] = [];
  private stamp = 1;
  /** Normal of the last collision resolved by collide(). */
  hitNx = 0;
  hitNz = 0;

  zones: Zone[] = [];
  interacts: InteractDef[] = [];
  lamps: number[] = [];
  parkSpots: ParkSpot[] = [];
  protestSites: { x: number; z: number; r: number; d: DistrictId }[] = [];
  collectSpots: POI[] = [];
  guardPosts: { x: number; z: number; rot: number; kind: string }[] = [];
  /** Per-frame animated world pieces (ferris wheel, windmills, tickers…). */
  animated: ((t: number, dt: number) => void)[] = [];
  flags: { x: number; y: number; z: number; rot: number; s: number }[] = [];
  billboards: { x: number; y: number; z: number; rot: number; w: number; h: number; ad: number; lit: boolean }[] = [];
  waterMat!: THREE.ShaderMaterial;
  ferris: { x: number; y: number; z: number; r: number } | null = null;
  windmills: { x: number; y: number; z: number; rot: number }[] = [];
  railLines: { x0: number; x1: number; z: number }[] = [];
  gates = new Map<string, { solid: Solid; mesh: THREE.Mesh; open: boolean }>();
  tris = 0;

  // ------------------------------------------------------------------ solids
  addBox(x: number, z: number, w: number, d: number, y0: number, y1: number, rot = 0, o: SolidOpts = {}): Solid {
    const s: Solid = {
      x, z, hw: w / 2, hd: d / 2, rot, cs: Math.cos(rot), sn: Math.sin(rot), y0, y1,
      ramp: o.ramp ? (o.ramp.axis === 'x' ? 1 : 2) : 0,
      ya: o.ramp ? o.ramp.ya : y1, yb: o.ramp ? o.ramp.yb : y1,
      on: true, stamp: 0, tag: o.tag ?? '', cam: o.cam ?? true,
    };
    if (o.ramp) s.y1 = Math.max(o.ramp.ya, o.ramp.yb);
    if (o.dynamic) {
      this.dyn.push(s);
      return s;
    }
    const ex = Math.abs(s.hw * s.cs) + Math.abs(s.hd * s.sn);
    const ez = Math.abs(s.hw * s.sn) + Math.abs(s.hd * s.cs);
    const x0 = Math.floor((x - ex) / CELL), x1 = Math.floor((x + ex) / CELL);
    const z0 = Math.floor((z - ez) / CELL), z1 = Math.floor((z + ez) / CELL);
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const k = keyOf(ix, iz);
        let a = this.hash.get(k);
        if (!a) this.hash.set(k, (a = []));
        a.push(s);
      }
    return s;
  }
  /** Axis-aligned helper taking a rect. */
  addRect(r: Rect, y0: number, y1: number, o: SolidOpts = {}) {
    return this.addBox((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, r.z1 - r.z0, y0, y1, 0, o);
  }
  removeDyn(s: Solid) {
    const i = this.dyn.indexOf(s);
    if (i >= 0) this.dyn.splice(i, 1);
  }

  /** Every static solid once (minimap footprints). */
  allSolids(): Solid[] {
    const set = new Set<Solid>();
    for (const arr of this.hash.values()) for (const s of arr) set.add(s);
    return [...set];
  }

  private topAt(s: Solid, lx: number, lz: number): number {
    if (s.ramp === 0) return s.y1;
    const t = s.ramp === 1 ? (lx + s.hw) / (2 * s.hw) : (lz + s.hd) / (2 * s.hd);
    return lerp(s.ya, s.yb, clamp(t, 0, 1));
  }

  /** Height of the surface to stand on at (x,z) for something whose feet are at y. */
  groundAt(x: number, z: number, y: number, step = 0.55): number {
    const th = this.terrain.h(x, z);
    let g = Terrain.inHole(x, z) || (y < th - 1.2 && Terrain.inUnder(x, z)) ? -200 : th;
    const lim = y + step;
    const scan = (arr: Solid[]) => {
      for (const s of arr) {
        if (!s.on || s.y0 > lim) continue;
        const dx = x - s.x, dz = z - s.z;
        const lx = dx * s.cs - dz * s.sn, lz = dx * s.sn + dz * s.cs;
        if (lx < -s.hw || lx > s.hw || lz < -s.hd || lz > s.hd) continue;
        const top = this.topAt(s, lx, lz);
        if (top <= lim && top > g) g = top;
      }
    };
    const a = this.hash.get(keyOf(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (a) scan(a);
    if (this.dyn.length) scan(this.dyn);
    return g;
  }

  /** Push a circle (radius r, feet y, height h) out of solids. Mutates pos. Returns true on contact. */
  collide(pos: { x: number; z: number }, r: number, y: number, h: number, step = 0.55): boolean {
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      const st = ++this.stamp;
      let moved = false;
      const test = (s: Solid) => {
        if (s.stamp === st || !s.on) return;
        s.stamp = st;
        if (s.y0 >= y + h - 0.05) return;
        const dx = pos.x - s.x, dz = pos.z - s.z;
        const lx = dx * s.cs - dz * s.sn, lz = dx * s.sn + dz * s.cs;
        const qx = clamp(lx, -s.hw, s.hw), qz = clamp(lz, -s.hd, s.hd);
        const ex = lx - qx, ez = lz - qz;
        const d2 = ex * ex + ez * ez;
        if (d2 >= r * r) return;
        if (this.topAt(s, qx, qz) <= y + step) return;
        let px: number, pz: number, nx: number, nz: number;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          nx = ex / d;
          nz = ez / d;
          px = nx * (r - d);
          pz = nz * (r - d);
        } else {
          const fx = s.hw - Math.abs(lx), fz = s.hd - Math.abs(lz);
          if (fx < fz) {
            nx = lx < 0 ? -1 : 1;
            nz = 0;
            px = nx * (fx + r);
            pz = 0;
          } else {
            nx = 0;
            nz = lz < 0 ? -1 : 1;
            px = 0;
            pz = nz * (fz + r);
          }
        }
        pos.x += px * s.cs + pz * s.sn;
        pos.z += -px * s.sn + pz * s.cs;
        this.hitNx = nx * s.cs + nz * s.sn;
        this.hitNz = -nx * s.sn + nz * s.cs;
        hit = moved = true;
      };
      const x0 = Math.floor((pos.x - r) / CELL), x1 = Math.floor((pos.x + r) / CELL);
      const z0 = Math.floor((pos.z - r) / CELL), z1 = Math.floor((pos.z + r) / CELL);
      for (let ix = x0; ix <= x1; ix++)
        for (let iz = z0; iz <= z1; iz++) {
          const a = this.hash.get(keyOf(ix, iz));
          if (a) for (const s of a) test(s);
        }
      for (const s of this.dyn) test(s);
      if (!moved) break;
    }
    return hit;
  }

  /** Is the point inside any solid? (camera, bullets, line of sight) */
  inside(x: number, y: number, z: number, camOnly = false, pad = 0): boolean {
    const scan = (arr: Solid[]) => {
      for (const s of arr) {
        if (!s.on || (camOnly && !s.cam) || y <= s.y0 - pad) continue;
        const dx = x - s.x, dz = z - s.z;
        const lx = dx * s.cs - dz * s.sn, lz = dx * s.sn + dz * s.cs;
        if (lx < -s.hw - pad || lx > s.hw + pad || lz < -s.hd - pad || lz > s.hd + pad) continue;
        if (y < this.topAt(s, lx, lz) + pad) return true;
      }
      return false;
    };
    const a = this.hash.get(keyOf(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (a && scan(a)) return true;
    return this.dyn.length > 0 && scan(this.dyn);
  }

  private underground(x: number, y: number, z: number): boolean {
    const th = this.terrain.h(x, z);
    if (y >= th - 0.05) return false;
    if (Terrain.inHole(x, z)) return false;
    if (Terrain.inUnder(x, z) && y < th - 0.9) return false;
    return true;
  }

  /** Clear line between two points? */
  los(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, by - ay, bz - az);
    const n = Math.ceil(d / 2.2);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      if (this.inside(x, y, z) || this.underground(x, y, z)) return false;
    }
    return true;
  }

  /** March a ray; returns distance to first obstruction (or max). */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number, step = 0.6): number {
    for (let t = step; t < max; t += step) {
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      if (this.inside(x, y, z) || this.underground(x, y, z)) return t - step * 0.5;
    }
    return max;
  }

  /** Fraction (0..1) of the way from target to desired camera position that is unobstructed. */
  cameraClip(tx: number, ty: number, tz: number, cx: number, cy: number, cz: number): number {
    const N = 16;
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      const x = tx + (cx - tx) * t, y = ty + (cy - ty) * t, z = tz + (cz - tz) * t;
      if (this.inside(x, y, z, true, 0.3) || this.underground(x, y - 0.35, z)) return Math.max(0.06, (i - 1) / N);
    }
    return 1;
  }

  /** Is there a roof / deck above this point? (hiding from helicopters, staying dry) */
  roofAbove(x: number, z: number, y: number): boolean {
    if (y < -1.5 && Terrain.inUnder(x, z)) return true;
    const a = this.hash.get(keyOf(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!a) return false;
    for (const s of a) {
      if (!s.on || s.y0 < y + 1.6) continue;
      const dx = x - s.x, dz = z - s.z;
      const lx = dx * s.cs - dz * s.sn, lz = dx * s.sn + dz * s.cs;
      if (lx >= -s.hw && lx <= s.hw && lz >= -s.hd && lz <= s.hd) return true;
    }
    return false;
  }

  waterAt(x: number, z: number): boolean {
    return this.terrain.h(x, z) < SEA - 0.25;
  }
  district(x: number, z: number): DistrictId {
    return districtAt(x, z);
  }
  zoneAt(x: number, z: number, kind: Zone['kind']): Zone | null {
    for (const zn of this.zones) if (zn.kind === kind && x >= zn.rect.x0 && x <= zn.rect.x1 && z >= zn.rect.z0 && z <= zn.rect.z1) return zn;
    return null;
  }
  clampBounds(p: { x: number; z: number }) {
    p.x = clamp(p.x, BOUNDS.x0, BOUNDS.x1);
    p.z = clamp(p.z, BOUNDS.z0, BOUNDS.z1);
  }

  /** A barrier that missions can open and close (lockdown gates, the tunnel door…). */
  addGate(id: string, x: number, z: number, w: number, d: number, y0: number, y1: number, rot: number, color: number, open = true) {
    const solid = this.addBox(x, z, w, d, y0, y1, rot, { dynamic: true, tag: 'gate' });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, y1 - y0, d), toonColor(color));
    mesh.position.set(x, (y0 + y1) / 2, z);
    mesh.rotation.y = rot;
    mesh.castShadow = true;
    this.group.add(mesh);
    this.gates.set(id, { solid, mesh, open });
    this.setGate(id, open);
  }
  setGate(id: string, open: boolean) {
    const g = this.gates.get(id);
    if (!g) return;
    g.open = open;
    g.solid.on = !open;
    g.mesh.visible = !open;
  }

  // ------------------------------------------------------------------ build
  finish() {
    this.roads.emit(this.geo);
    this.terrain.emit(this.geo);
    this.chunks = this.geo.build(this.group, { world: M.world, flat: M.world, road: M.road, decal: M.decal, glow: M.glow });
    this.tris = this.geo.tris;
    this.group.add(this.signs.build());
    this.buildWater();
  }

  private buildWater() {
    this.waterMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uTime: { value: 0 }, uColor: { value: new THREE.Color(PAL.water) }, uLight: { value: new THREE.Color(0xa8dfe6) }, uTint: { value: new THREE.Color(1, 1, 1) } },
      ]),
      fog: true,
      vertexShader: /* glsl */ `
        varying vec3 vW;
        #include <fog_pars_vertex>
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vW = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uColor; uniform vec3 uLight; uniform vec3 uTint;
        varying vec3 vW;
        #include <fog_pars_fragment>
        void main() {
          float a = sin(vW.x * 0.07 + sin(vW.z * 0.045 + uTime * 0.5) * 2.2 + uTime * 0.7);
          float b = sin(vW.z * 0.19 + sin(vW.x * 0.06 - uTime * 0.4) * 1.7 - uTime * 0.9);
          float band = smoothstep(0.9, 0.93, a * b) + smoothstep(0.985, 0.995, a) * 0.6;
          vec3 col = mix(uColor, uLight, clamp(band, 0.0, 1.0)) * uTint;
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }`,
    });
    const g = new THREE.PlaneGeometry(4400, 2200).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, this.waterMat);
    m.position.set(0, SEA, 336 + 1100);
    this.group.add(m);
  }

  /** Distance-cull world chunks. */
  cull(cx: number, cz: number, dist: number) {
    for (const c of this.chunks) {
      const d = Math.hypot(c.cx - cx, c.cz - cz) - c.r;
      c.mesh.visible = d < dist;
    }
  }
}
