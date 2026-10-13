import {
  AdditiveBlending,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { WorldContent, WorldInteract } from '../world/content/WorldContent';
import { World } from '../world/World';
import { GeoBuilder } from '../world/kit/GeoBuilder';
import { createWorldMaterial } from '../render/materials';
import { orientQuat } from '../world/RegionFrame';
import { PLANET_RADIUS } from '../world/constants';
import { HorizonCuller } from '../render/Culling';

export interface Interactable {
  id: string;
  kind: string;
  label: string;
  pos: Vector3; // world position the player should be near
  up: Vector3;
  forward: Vector3;
  radius: number;
  data?: Record<string, any>;
  enabled: () => boolean;
}

function glowTexture(color: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

const FRAGMENTS: { id: string; anchor: string; lift: number }[] = [
  { id: 'frag.hills', anchor: 'frag.hills.here', lift: 1.1 },
  { id: 'frag.coast', anchor: 'frag.coast.here', lift: 1.0 },
  { id: 'frag.mining', anchor: 'frag.mining.here', lift: 1.0 },
  { id: 'frag.heights', anchor: 'heights.institute.roof', lift: 1.1 },
  { id: 'frag.city', anchor: 'city.library.steps', lift: 1.0 },
];

const BEACONS: { id: string; top: string; spot: string; label: string }[] = [
  { id: 'beacon.city', top: 'city.sculpture.beacon', spot: 'city.sculpture.beacon', label: 'Touch the City Beacon' },
  { id: 'beacon.hills', top: 'hills.memorial.beacon', spot: 'hills.memorial.visitor', label: 'Touch the Hills Beacon' },
  { id: 'beacon.coast', top: 'coast.pier.beacon', spot: 'coast.pier.end', label: 'Touch the Coast Beacon' },
  { id: 'beacon.mining', top: 'mining.hall.bay', spot: 'mining.hall.bay', label: 'Touch the Mining Beacon' },
  { id: 'beacon.heights', top: 'heights.tower.n.top', spot: 'heights.tower.n.base', label: 'Touch the Heights Beacon' },
];

/**
 * Mission-driven objects that change with the story: recoverable blocks, district beacons,
 * Old Faithful, the gallery artwork, Station 5's status light, relay pylon orbs and the dial puzzle.
 */
export class WorldProps {
  readonly group = new Group();
  readonly interactables: Interactable[] = [];
  private fragments = new Map<string, Object3D>();
  private beacons = new Map<string, { beam: Mesh; orb: Mesh; glow: Sprite; lit: boolean; t: number }>();
  private oldFaithfulFans: Object3D[] = [];
  private oldFaithfulOn = false;
  private galleryArt: Mesh | null = null;
  private stationLight: Mesh | null = null;
  private pylonOrbs = new Map<string, Mesh>();
  private dials: { obj: Object3D; value: number; target: number; angle: number }[] = [];
  private time = 0;
  private glowMat: SpriteMaterial;
  private orbOff = new MeshBasicMaterial({ color: '#5b6672', toneMapped: false });
  private orbOn = new MeshBasicMaterial({ color: '#ffd27f', toneMapped: false });
  pulse: { t: number; sprites: Sprite[]; ring: Vector3[] } | null = null;

  constructor(
    private world: World,
    private content: WorldContent,
    scene: Scene,
    private culler: HorizonCuller,
    private isCollected: (id: string) => boolean,
  ) {
    this.group.name = 'world-props';
    scene.add(this.group);
    this.glowMat = new SpriteMaterial({ map: glowTexture('rgba(255,190,90,0.8)'), blending: AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
    // Static kit interactables become interactables too.
    for (const it of content.interacts) this.addStatic(it);
    this.buildFragments();
    this.buildBeacons();
    this.buildOldFaithful();
    this.buildGalleryArt();
    this.buildStationLight();
    this.buildPylons();
    this.buildDials();
  }

  private addStatic(it: WorldInteract): void {
    this.interactables.push({ id: it.id, kind: it.kind, label: it.label, pos: it.pos, up: it.up, forward: it.forward, radius: it.radius ?? 1.8, data: it.data, enabled: () => true });
  }

  private anchor(name: string) {
    const a = this.content.anchors.get(name);
    if (!a) console.warn('Missing anchor', name);
    return a;
  }

  private place(obj: Object3D, pos: Vector3, forward?: Vector3): void {
    const up = pos.clone().normalize();
    const f = (forward ?? new Vector3(0, 1, 0)).clone();
    f.addScaledVector(up, -f.dot(up));
    if (f.lengthSq() < 1e-6) f.set(1, 0, 0).addScaledVector(up, -up.x);
    obj.quaternion.copy(orientQuat(up, f.normalize()));
    obj.position.copy(pos);
    this.group.add(obj);
  }

  // ---------------------------------------------------------------- Lost blocks
  private buildFragments(): void {
    const mat = createWorldMaterial({ vertexColors: true, emissiveAttr: true, name: 'solid' });
    const g = new GeoBuilder();
    g.rbox(0.42, 0.42, 0.42, 0.06, [0, 0, 0], '#f0b04a', { emissive: 1.5 });
    g.rbox(0.46, 0.08, 0.46, 0.03, [0, 0.12, 0], '#fbe7b0', { emissive: 1.8 });
    const geo = g.toGeometry();
    for (const f of FRAGMENTS) {
      const a = this.anchor(f.anchor);
      if (!a) continue;
      const pos = a.pos.clone().addScaledVector(a.up, f.lift);
      const holder = new Group();
      const cube = new Mesh(geo, mat);
      cube.castShadow = true;
      holder.add(cube);
      const glow = new Sprite(this.glowMat);
      glow.scale.setScalar(1.6);
      holder.add(glow);
      this.place(holder, pos, a.forward);
      this.fragments.set(f.id, holder);
      this.culler.add(holder, pos, 1.2);
      this.interactables.push({
        id: f.id, kind: 'fragment', label: 'Pick up the lost block', pos, up: a.up, forward: a.forward, radius: 1.9,
        enabled: () => !this.isCollected(f.id),
      });
    }
  }

  hideFragment(id: string): void {
    const f = this.fragments.get(id);
    if (f) {
      f.visible = false;
      this.culler.remove(f);
    }
  }

  fragmentPositions(): { id: string; pos: Vector3 }[] {
    return [...this.fragments.entries()].filter(([id]) => !this.isCollected(id)).map(([id, o]) => ({ id, pos: o.position }));
  }

  // ---------------------------------------------------------------- Beacons
  private buildBeacons(): void {
    const beamGeo = new CylinderGeometry(0.55, 0.9, 1, 16, 1, true);
    beamGeo.translate(0, 0.5, 0);
    for (const b of BEACONS) {
      const top = this.anchor(b.top);
      const spot = this.anchor(b.spot);
      if (!top || !spot) continue;
      const holder = new Group();
      const beam = new Mesh(beamGeo, new MeshBasicMaterial({ color: '#ffc861', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
      beam.scale.set(1, 60, 1);
      beam.visible = false;
      const orb = new Mesh(new SphereGeometry(0.32, 16, 12), this.orbOff);
      orb.position.y = 0.35;
      const glow = new Sprite(this.glowMat.clone());
      glow.scale.setScalar(0.1);
      glow.position.y = 0.35;
      holder.add(beam, orb, glow);
      this.place(holder, top.pos.clone(), top.forward);
      this.beacons.set(b.id, { beam, orb, glow, lit: false, t: 0 });
      this.culler.add(holder, top.pos.clone().addScaledVector(top.up, 30), 32);
      const ipos = b.id === 'beacon.city' ? spot.pos.clone().normalize().multiplyScalar(PLANET_RADIUS + this.world.groundHeight(spot.pos)) : spot.pos.clone();
      if (b.id === 'beacon.city') {
        // Stand on the plaza just in front of the sculpture's basin.
        const fwd = spot.forward.clone();
        const dir = ipos.clone().normalize();
        const p = dir.clone().addScaledVector(fwd, 4.0 / PLANET_RADIUS).normalize();
        ipos.copy(p.multiplyScalar(PLANET_RADIUS + this.world.groundHeight(p)));
      }
      this.interactables.push({ id: b.id, kind: 'beacon', label: b.label, pos: ipos, up: spot.up, forward: spot.forward, radius: 2.6, enabled: () => true });
    }
  }

  setBeaconLit(id: string, lit: boolean, instant = false): void {
    const b = this.beacons.get(id);
    if (!b || b.lit === lit) return;
    b.lit = lit;
    b.t = instant ? 1 : 0;
    b.beam.visible = lit;
    b.orb.material = lit ? this.orbOn : this.orbOff;
  }

  beaconPositions(): { id: string; pos: Vector3 }[] {
    return this.interactables.filter((i) => i.kind === 'beacon' && !this.beacons.get(i.id)?.lit).map((i) => ({ id: i.id, pos: i.pos }));
  }

  // ---------------------------------------------------------------- Old Faithful
  private buildOldFaithful(): void {
    const a = this.anchor('mining.bay.machine');
    if (!a) return;
    const holder = new Group();
    const mat = createWorldMaterial({ vertexColors: true, emissiveAttr: true, name: 'solid' });
    const g = new GeoBuilder();
    g.rbox(1.6, 1.4, 1.0, 0.06, [0, 0.7, 0], '#c9b48a');
    g.rbox(1.62, 0.18, 1.02, 0.04, [0, 1.42, 0], '#7a5234');
    g.box(1.2, 0.2, 0.05, [0, 1.1, 0.51], '#2b2b2b');
    for (let i = 0; i < 4; i++) g.box(0.08, 0.08, 0.02, [-0.45 + i * 0.3, 1.1, 0.535], i < 2 ? '#58d6a0' : '#f0727a', { emissive: 1.8 });
    g.box(0.12, 0.5, 0.12, [0.82, 0.8, 0.2], '#d9584a');
    g.sphere(0.1, [0.82, 1.1, 0.2], '#d9584a');
    for (const x of [-0.42, 0.42]) {
      g.cyl(0.3, 0.3, 0.1, [x, 0.55, 0.5], '#5b6672', { rot: [Math.PI / 2, 0, 0], seg: 14 });
    }
    const body = new Mesh(g.toGeometry(), mat);
    body.castShadow = true;
    holder.add(body);
    for (const x of [-0.42, 0.42]) {
      const fg = new GeoBuilder();
      for (let k = 0; k < 5; k++) fg.box(0.24, 0.04, 0.09, [0.12, 0, 0], '#9aa6b2', { rot: [0, 0, (k / 5) * Math.PI * 2] });
      fg.cyl(0.06, 0.06, 0.05, [0, 0, 0], '#2f3542', { rot: [Math.PI / 2, 0, 0], seg: 8 });
      const fan = new Mesh(fg.toGeometry(), mat);
      fan.position.set(x, 0.55, 0.57);
      holder.add(fan);
      this.oldFaithfulFans.push(fan);
    }
    this.place(holder, a.pos.clone(), a.forward);
    this.culler.add(holder, a.pos.clone(), 2);
    this.world.collision.add({ kind: 'box', center: a.pos.clone().normalize(), xAxis: new Vector3().crossVectors(a.up, a.forward).normalize(), zAxis: a.forward.clone(), hx: 0.85, hz: 0.55, base: this.world.groundHeight(a.pos), top: this.world.groundHeight(a.pos) + 1.5 });
    const ipos = a.pos.clone().normalize().addScaledVector(a.forward, 1.3 / PLANET_RADIUS).normalize();
    ipos.multiplyScalar(PLANET_RADIUS + this.world.groundHeight(ipos));
    this.interactables.push({ id: 'mining.oldfaithful', kind: 'object', label: 'Look at Old Faithful', pos: ipos, up: a.up, forward: a.forward, radius: 1.9, enabled: () => true });
  }

  setOldFaithful(on: boolean): void {
    this.oldFaithfulOn = on;
  }

  // ---------------------------------------------------------------- Gallery artwork
  private buildGalleryArt(): void {
    const a = this.anchor('coast.gallery.display');
    if (!a) return;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    // "Sunset.png": a pixel sunset over the sea.
    const px = 16, n = 16;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        let col = y < 6 ? ['#f6d55c', '#f2b544', '#ef8a6f', '#e8644a', '#c94f6d', '#8a5a7c'][y] : y < 9 ? '#ffd27f' : ['#4f9ea3', '#3f8590', '#2f6c78', '#2a5d6e', '#24506a', '#1f4560', '#1b3b55'][Math.min(6, y - 9)];
        const dx = x - 7.5, dy = y - 7.5;
        if (dx * dx + dy * dy < 9 && y <= 8) col = '#fff3c4';
        if (y >= 9 && (x + y) % 5 === 0) col = '#9fd3e8';
        ctx.fillStyle = col;
        ctx.fillRect(x * px, y * px, px, px);
      }
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    tex.magFilter = 1003; // Nearest
    const holder = new Group();
    const frame = new Mesh(new PlaneGeometry(1.5, 1.5), new MeshBasicMaterial({ color: '#2a2430' }));
    frame.position.set(0, 1.55, -0.01);
    const art = new Mesh(new PlaneGeometry(1.3, 1.3), new MeshBasicMaterial({ map: tex, toneMapped: false }));
    art.position.set(0, 1.55, 0);
    const easel = new Mesh(new CylinderGeometry(0.05, 0.08, 1.0, 8), new MeshBasicMaterial({ color: '#2a2430' }));
    easel.position.set(0, 0.5, -0.05);
    holder.add(frame, art, easel);
    // Face the gallery visitor (anchor forward points away from the building).
    this.place(holder, a.pos.clone(), a.forward.clone().negate());
    holder.visible = false;
    this.galleryArt = art;
    (this.galleryArt as any).holder = holder;
    this.culler.add(holder, a.pos.clone(), 2);
  }

  setGalleryArt(on: boolean): void {
    if (this.galleryArt) ((this.galleryArt as any).holder as Group).visible = on;
  }

  // ---------------------------------------------------------------- Station 5
  private buildStationLight(): void {
    const a = this.anchor('heights.station.beacon');
    if (!a) return;
    const light = new Mesh(new SphereGeometry(0.28, 12, 10), new MeshBasicMaterial({ color: '#f0727a', toneMapped: false }));
    this.place(light, a.pos.clone(), a.forward);
    this.stationLight = light;
  }

  setStationOnline(on: boolean): void {
    if (this.stationLight) (this.stationLight.material as MeshBasicMaterial).color.set(on ? '#58d6a0' : '#f0727a');
  }

  // ---------------------------------------------------------------- Relay pylons
  private buildPylons(): void {
    for (const id of ['pylon.cityhills', 'pylon.hillscoast', 'pylon.coastmining', 'pylon.miningheights', 'pylon.heightscity']) {
      const a = this.anchor(`${id}.orb`);
      if (!a) continue;
      const orb = new Mesh(new SphereGeometry(0.4, 14, 10), this.orbOff);
      this.place(orb, a.pos.clone(), a.forward);
      this.pylonOrbs.set(id, orb);
    }
  }

  setPylon(id: string, on: boolean): void {
    const o = this.pylonOrbs.get(id);
    if (o) o.material = on ? this.orbOn : this.orbOff;
  }

  // ---------------------------------------------------------------- Dial puzzle
  private buildDials(): void {
    const mat = new MeshBasicMaterial({ map: this.dialTexture(), toneMapped: false, transparent: true });
    for (let i = 0; i < 4; i++) {
      const a = this.anchor(`hills.memorial.dial${i}`);
      if (!a) continue;
      const disc = new Mesh(new CylinderGeometry(0.33, 0.33, 0.06, 20), [new MeshBasicMaterial({ color: '#8f867a' }), mat, new MeshBasicMaterial({ color: '#8f867a' })]);
      const holder = new Group();
      holder.add(disc);
      this.place(holder, a.pos.clone(), a.forward);
      this.dials.push({ obj: disc, value: 0, target: 0, angle: 0 });
    }
  }

  private dialTexture(): CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#b3aa9b';
    ctx.beginPath(); ctx.arc(128, 128, 126, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3c362e';
    ctx.font = '700 34px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let d = 0; d < 10; d++) {
      const a = (d / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.save();
      ctx.translate(128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillText(String(d), 0, 0);
      ctx.restore();
    }
    ctx.fillStyle = '#f0b04a';
    ctx.beginPath(); ctx.arc(128, 128, 20, 0, Math.PI * 2); ctx.fill();
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }

  setDials(values: number[]): void {
    values.forEach((v, i) => {
      const d = this.dials[i];
      if (!d) return;
      d.value = v;
      d.target = (-v / 10) * Math.PI * 2;
    });
  }

  // ---------------------------------------------------------------- Ring pulse (finale)
  startPulse(ring: Vector3[]): void {
    const sprites: Sprite[] = [];
    for (let i = 0; i < 3; i++) {
      const s = new Sprite(this.glowMat.clone());
      s.scale.setScalar(3.2);
      this.group.add(s);
      sprites.push(s);
    }
    this.pulse = { t: 0, sprites, ring };
  }

  update(dt: number, night: number): void {
    this.time += dt;
    for (const [id, f] of this.fragments) {
      if (!f.visible) continue;
      const cube = f.children[0];
      cube.rotation.y += dt * 0.9;
      cube.position.y = Math.sin(this.time * 2 + id.length) * 0.08;
    }
    for (const b of this.beacons.values()) {
      if (!b.lit) continue;
      b.t = Math.min(1, b.t + dt * 0.6);
      const m = b.beam.material as MeshBasicMaterial;
      m.opacity = (0.22 + 0.06 * Math.sin(this.time * 2.5)) * b.t * (0.6 + night * 0.6);
      b.beam.scale.set(1 + 0.05 * Math.sin(this.time * 3), 60 * b.t, 1 + 0.05 * Math.sin(this.time * 3));
      b.glow.scale.setScalar(2.4 * b.t);
    }
    if (this.oldFaithfulOn) for (const f of this.oldFaithfulFans) f.rotation.z += dt * 14;
    for (const d of this.dials) {
      // Rotate the shortest way toward the target.
      let diff = d.target - d.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      d.angle += diff * Math.min(1, dt * 10);
      d.obj.rotation.y = d.angle;
    }
    if (this.stationLight) this.stationLight.scale.setScalar(1 + 0.15 * Math.sin(this.time * 5));
    if (this.pulse) {
      const p = this.pulse;
      p.t += dt;
      const n = p.ring.length;
      p.sprites.forEach((s, i) => {
        const k = ((p.t * 34 + (i * n) / 3) % n + n) % n;
        const a = p.ring[Math.floor(k)], b = p.ring[(Math.floor(k) + 1) % n];
        const v = a.clone().lerp(b, k % 1).normalize();
        s.position.copy(v.multiplyScalar(PLANET_RADIUS + this.world.groundHeight(v) + 1.4));
      });
    }
  }
}
