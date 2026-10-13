import {
  Mesh,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { Input } from './Input';
import '../world/kits/index';
import { buildLayout } from '../world/regions/index';
import { WorldContent } from '../world/content/WorldContent';
import { buildGroundDecal } from '../world/content/GroundDecal';
import { scatterVegetation } from '../world/regions/vegetation';
import { HorizonCuller } from '../render/Culling';
import { Lighting } from '../render/Lighting';
import { Water } from '../render/Water';
import { World } from '../world/World';
import { PlayerController } from '../player/PlayerController';
import { CameraController } from '../player/CameraController';
import { worldUniforms } from '../render/materials';
import { Avatar, PLAYER_LOOK } from '../characters/Avatar';
import { PLANET_RADIUS } from '../world/constants';
import { buildRoadMeshes } from '../world/terrain/RoadMesh';

export class Game {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(50, 1, 0.1, 600);
  readonly input: Input;
  readonly world: World;
  readonly player: PlayerController;
  readonly cam: CameraController;
  readonly culler = new HorizonCuller();
  readonly content: WorldContent;
  readonly water: Water;
  readonly lighting: Lighting;
  readonly avatar: Avatar;
  private last = performance.now();
  private lastFeet = new Vector3();
  private elapsed = 0;

  constructor(private container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    container.appendChild(this.renderer.domElement);
    this.input = new Input(this.renderer.domElement);

    const t0 = performance.now();
    const layout = buildLayout();
    this.world = new World(layout);
    this.scene.add(this.world.root);
    for (const c of this.world.terrain.chunks) this.culler.addStatic(c);
    const roads = buildRoadMeshes(layout.roads, (d) => this.world.groundHeight(d));
    for (const m of roads.children) this.culler.addStatic(m as Mesh);
    this.scene.add(roads);
    const overlay = this.world.paintOverlay(1024).build(this.renderer.capabilities.getMaxAnisotropy());
    worldUniforms.uOverlay.value = overlay;
    worldUniforms.uOverlayOn.value = 1;

    this.content = new WorldContent(this.world, this.culler);
    for (const p of layout.placements) this.content.place(p);
    scatterVegetation(this.world, this.content, 'high');
    this.content.finalize();
    this.scene.add(this.content.group);
    for (const d of layout.decals) {
      const m = buildGroundDecal(d.center, d.xDir, d.yDir, d.half, d.draw, (dd) => this.world.collision.ground(dd).height, d.res);
      this.culler.addStatic(m);
      this.scene.add(m);
    }
    this.water = new Water(this.world.heightfield);
    for (const m of this.water.group.children) this.culler.addStatic(m as Mesh);
    this.scene.add(this.water.group);
    this.lighting = new Lighting(this.scene, 2048);
    console.log(`World built in ${(performance.now() - t0).toFixed(0)} ms`, this.content.stats, 'culler items', this.culler.count);

    this.player = new PlayerController(this.world.collision, (d) => this.world.biomes.materialAt(d));
    const spawnDir = layout.get('city').frame.dir(-6, -15.5);
    this.player.teleport(spawnDir, layout.get('city').frame.north.clone());
    this.lighting.resetFrame(this.player.dir);
    this.cam = new CameraController(this.camera, this.world.collision, (d) => this.world.groundHeight(d));

    this.avatar = new Avatar(PLAYER_LOOK);
    this.scene.add(this.avatar.group);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    (window as any).__game = this;
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    const loop = () => {
      requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt);
      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(loop);
  }

  /** Movement intent in world space from camera-relative input. */
  private wishVector(): Vector3 {
    const m = this.input.move();
    const up = this.player.dir;
    const fwd = this.cam.heading.clone().addScaledVector(up, -this.cam.heading.dot(up)).normalize();
    const right = new Vector3().crossVectors(fwd, up).normalize();
    return new Vector3().addScaledVector(fwd, m.y).addScaledVector(right, m.x);
  }

  tick(dt: number): void {
    this.elapsed += dt;
    worldUniforms.uTime.value = this.elapsed;
    this.input.pollGamepad(dt);
    const wish = this.wishVector();
    const run = this.input.running();
    this.player.update(dt, wish, run, this.input.consume('jump'));

    const feet = this.player.visualPosition();
    this.cam.update(dt, {
      dir: this.player.dir,
      feetPos: feet,
      velocity: this.player.velocity,
      facing: this.player.facing,
      frameQuat: this.player.frameQuat,
      speed: this.player.speed,
      running: run,
    }, this.input);

    const moved = this.lastFeet.distanceTo(feet);
    this.lastFeet.copy(feet);
    this.avatar.place(feet, this.player.dir, this.player.facing, dt);
    const a = this.avatar.anim;
    a.speed = this.player.speed;
    a.grounded = this.player.grounded;
    a.turnRate = this.player.turnRate;
    a.update(dt, this.player.grounded ? Math.min(moved, 1) : 0);
    worldUniforms.uPlayerPos.value.copy(feet);

    this.lighting.update(dt, this.player.dir, this.player.frameQuat, feet, this.camera.position);
    this.water.update(dt, this.lighting.sunDir, this.lighting.sun.color, this.lighting.night);
    this.content.update(dt, this.lighting.night);
    this.culler.update(this.camera.position);

    this.input.endFrame(dt);
  }

  /** Runs the simulation without rendering (automated tests). */
  simulate(seconds: number, dt = 1 / 60): void {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) this.tick(dt);
  }

  /** Debug: teleport to region-local coordinates. */
  teleportTo(region: string, x: number, y: number, headingDeg = 0): void {
    const f = this.world.layout.get(region as any).frame;
    const b = f.basis(x, y, headingDeg);
    this.player.teleport(b.pos, b.forward);
    this.cam.reset({ dir: this.player.dir, feetPos: this.player.visualPosition(), velocity: this.player.velocity, facing: this.player.facing, frameQuat: this.player.frameQuat, speed: 0, running: false });
    this.lighting.resetFrame(this.player.dir);
  }

  /** Debug helpers for automated play-testing. */
  debugState() {
    const p = this.player;
    return { dir: p.dir.toArray(), feet: p.feet, speed: p.speed, radius: PLANET_RADIUS + p.feet, grounded: p.grounded };
  }
}
