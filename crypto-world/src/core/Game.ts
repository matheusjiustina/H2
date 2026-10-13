import { Mesh, Object3D, PCFShadowMap, PerspectiveCamera, Quaternion, Raycaster, Scene, SRGBColorSpace, Sprite, Vector3, WebGLRenderer } from 'three';
import { Input } from './Input';
import '../world/kits/index';
import { buildLayout } from '../world/regions/index';
import { World } from '../world/World';
import { WorldContent } from '../world/content/WorldContent';
import { buildGroundDecal } from '../world/content/GroundDecal';
import { scatterVegetation } from '../world/regions/vegetation';
import { buildRoadMeshes } from '../world/terrain/RoadMesh';
import { PlayerController } from '../player/PlayerController';
import { CameraController, CameraPose } from '../player/CameraController';
import { HorizonCuller } from '../render/Culling';
import { Lighting } from '../render/Lighting';
import { Water } from '../render/Water';
import { worldUniforms } from '../render/materials';
import { screenState, ScreenKind } from '../render/ScreenContent';
import { PLANET_RADIUS } from '../world/constants';
import { Avatar, PLAYER_LOOK } from '../characters/Avatar';
import { Appearance } from '../characters/Appearance';
import { NpcManager, Npc } from '../npc/NpcManager';
import { npcById } from '../data/npcs';
import { GameState, GameEvent } from '../gameplay/GameState';
import { DialogueRunner, pickConversation } from '../gameplay/Dialogue';
import { Interactable, WorldProps } from '../gameplay/WorldProps';
import { SaveSystem, Settings, Cosmetics, DEFAULT_COSMETICS } from '../gameplay/SaveSystem';
import { MISSIONS, ITEMS } from '../data/missions';
import { CONVERSATIONS, OBJECT_SPEAKERS } from '../data/dialogue';
import { DOCS, SECRETS } from '../data/docs';
import { UI } from '../ui/UI';
import { buildJournal } from '../ui/Journal';
import { buildSettings } from '../ui/SettingsPanel';
import { TouchControls } from '../ui/TouchControls';
import { AudioEngine } from '../audio/AudioEngine';
import { damp, smoothstep } from './math/sphere';
import type { Conversation } from '../gameplay/types';

type Mode = 'loading' | 'title' | 'flyin' | 'play' | 'dialogue' | 'panel' | 'cinematic' | 'credits';
interface DialogueShot {
  back: number;
  lateral: number;
  lift: number;
  side: number;
}

type Focus = { kind: 'npc'; npc: Npc } | { kind: 'object'; it: Interactable } | null;

const frame = () => new Promise<void>((r) => setTimeout(r, 0));
const REGION_SUB: Record<string, [string, string]> = {
  city: ['Chain City', 'where every block meets'],
  hills: ['Genesis Hills', 'where it all began'],
  coast: ['Degen Coast', 'sun, sand and questionable trades'],
  mining: ['Mining District', 'the hum that never sleeps'],
  heights: ['Node Heights', 'listening to the whole network'],
  woods: ['Whitepaper Woods', 'nine pages, one forest'],
  south: ['Cold Storage', 'kept offline, kept safe'],
};
const PLACES: Record<string, { anchor: string; radius: number }> = {
  'heights.station': { anchor: 'heights.station.console', radius: 9 },
};
const DIAL_CODE = [0, 3, 0, 1];
const CARRIED = ['archived-message', 'pixel-artwork', 'quiet-storm', 'relay-crystal'];

/**
 * The game: owns the renderer and every system, and runs the frame loop.
 * World construction is asynchronous so the title screen can show progress.
 */
export class Game {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(50, 1, 0.1, 900);
  readonly input: Input;
  readonly ui: UI;
  readonly touch: TouchControls;
  readonly audio = new AudioEngine();
  readonly saves = new SaveSystem();
  readonly culler = new HorizonCuller();
  settings: Settings;
  cosmetics: Cosmetics = { ...DEFAULT_COSMETICS };
  state = new GameState(MISSIONS);

  world!: World;
  content!: WorldContent;
  water!: Water;
  lighting!: Lighting;
  npcs!: NpcManager;
  props!: WorldProps;
  player!: PlayerController;
  cam!: CameraController;
  avatar!: Avatar;

  mode: Mode = 'loading';
  private last = performance.now();
  private elapsed = 0;
  private lastFeet = new Vector3();
  private dialogue: { runner: DialogueRunner; npc: Npc | null; objectId: string | null; pendingSecret: string | null; pendingAfter: (() => void) | null; shot: DialogueShot | null } | null = null;
  private focus: Focus = null;
  private sitting: { pos: Vector3; facing: Vector3 } | null = null;
  private targetMarker!: Sprite;
  private dials = [0, 0, 0, 0];
  private currentRegion = '';
  private regionShownAt: Record<string, number> = {};
  private saveTimer = 0;
  private orbitT = 0;
  private titleDir = new Vector3(0, 0, 1);
  private flyT = 0;
  private cinematic: { t: number; from: CameraPose; stage: number } | null = null;
  private perfOn = false;
  private frameMs = 16;
  private pixelRatio = 1;
  private prCap = 2;
  private slowTimer = 0;
  private fastTimer = 0;
  private voicePitch = 1;
  private voiceObject = false;
  private voiceAcc = 0;
  ready = false;
  private ray = new Raycaster();
  private occluders: Object3D[] | null = null;

  constructor(private container: HTMLElement) {
    this.settings = this.saves.loadSettings();
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    this.input = new Input(this.renderer.domElement);
    this.ui = new UI(container);
    this.touch = new TouchControls(this.ui.root, this.input);
    this.applyQualityCaps();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    (window as any).__game = this;
    this.wireUI();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.saveNow();
        this.audio.suspend(true);
      } else this.audio.suspend(false);
    });
    window.addEventListener('pagehide', () => this.saveNow());
  }

  // ======================================================================== Build
  async build(): Promise<void> {
    const ui = this.ui;
    const q = this.effectiveQuality();
    ui.setLoading(0.03);
    await frame();
    const layout = buildLayout();
    ui.setLoading(0.08);
    await frame();
    this.world = new World(layout);
    this.scene.add(this.world.root);
    for (const c of this.world.terrain.chunks) this.culler.addStatic(c);
    ui.setLoading(0.28);
    await frame();
    const roads = buildRoadMeshes(layout.roads, (d) => this.world.groundHeight(d));
    for (const m of roads.children) this.culler.addStatic(m as Mesh);
    this.scene.add(roads);
    const overlay = this.world.paintOverlay(q === 'low' ? 512 : 1024).build(this.renderer.capabilities.getMaxAnisotropy());
    worldUniforms.uOverlay.value = overlay;
    worldUniforms.uOverlayOn.value = 1;
    ui.setLoading(0.38);
    await frame();
    this.content = new WorldContent(this.world, this.culler);
    const P = layout.placements;
    for (let i = 0; i < P.length; i++) {
      this.content.place(P[i]);
      if (i % 40 === 39) {
        ui.setLoading(0.38 + 0.27 * (i / P.length));
        await frame();
      }
    }
    ui.setLoading(0.66);
    await frame();
    scatterVegetation(this.world, this.content, q);
    ui.setLoading(0.78);
    await frame();
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
    ui.setLoading(0.86);
    await frame();
    this.lighting = new Lighting(this.scene, this.shadowSize(q));
    this.renderer.shadowMap.enabled = q !== 'low';
    this.player = new PlayerController(this.world.collision, (d) => this.world.biomes.materialAt(d), {
      onLand: (impact) => impact > 3 && this.audio.land(),
      onJump: () => this.audio.jump(),
    });
    this.cam = new CameraController(this.camera, this.world.collision, (d) => this.world.groundHeight(d));
    this.npcs = new NpcManager(this.world, this.content, this.scene, this.culler);
    this.props = new WorldProps(this.world, this.content, this.scene, this.culler, (id) => this.state.hasCollected(id));
    this.npcs.setReserved(this.props.interactables.filter((i) => i.kind !== 'sit').map((i) => i.pos));
    this.rebuildAvatar();
    this.targetMarker = new Sprite(this.npcs.markerMaterial('target'));
    this.targetMarker.scale.set(0.5, 0.5, 1);
    this.targetMarker.visible = false;
    this.scene.add(this.targetMarker);
    this.applySettings();
    ui.setLoading(0.95);
    await frame();
    this.loadOrNew(false);
    this.renderer.compile(this.scene, this.camera);
    ui.setLoading(1);
    this.ready = true;
    this.mode = 'title';
    this.ui.showTitleMenu(this.saves.hasSave());
    console.log('World ready', this.content.stats);
  }

  private effectiveQuality(): 'low' | 'medium' | 'high' {
    if (this.settings.quality !== 'auto') return this.settings.quality;
    return TouchControls.isTouchDevice() ? 'medium' : 'high';
  }

  private shadowSize(q: string): number {
    return q === 'low' ? 0 : q === 'medium' ? 1024 : 2048;
  }

  private applyQualityCaps(): void {
    const q = this.effectiveQuality();
    this.prCap = Math.min(window.devicePixelRatio || 1, q === 'low' ? 1 : q === 'medium' ? 1.5 : 2);
    this.pixelRatio = this.prCap;
    this.renderer.setPixelRatio(this.pixelRatio);
    if (this.lighting) {
      this.lighting.setShadows(this.shadowSize(q));
      this.renderer.shadowMap.enabled = q !== 'low';
    }
    if (this.content) this.content.screenAtlas.refreshHz = q === 'low' ? 4 : 8;
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private rebuildAvatar(): void {
    const look: Appearance = {
      ...PLAYER_LOOK,
      top: this.cosmetics.jacket,
      bag: this.cosmetics.bag,
      bagColor: this.cosmetics.bagColor,
      hat: this.cosmetics.hat,
      hatColor: this.cosmetics.hatColor,
      hairStyle: this.cosmetics.hairStyle,
      hair: this.cosmetics.hair,
      skin: this.cosmetics.skin,
    };
    const old = this.avatar;
    this.avatar = new Avatar(look);
    if (old) {
      this.avatar.group.position.copy(old.group.position);
      this.avatar.group.quaternion.copy(old.group.quaternion);
      this.scene.remove(old.group);
      old.dispose();
    }
    this.avatar.anim.onStep = () => this.audio.footstep(this.player.surface, this.input.running());
    this.scene.add(this.avatar.group);
  }

  // ======================================================================== Save / load
  private loadOrNew(forceNew: boolean): void {
    const save = forceNew ? null : this.saves.load();
    if (this.saves.lastError) console.warn(this.saves.lastError);
    this.state = new GameState(MISSIONS, save?.state);
    this.state.on((e) => this.onGameEvent(e));
    const city = this.world.layout.get('city').frame;
    if (save) {
      this.cosmetics = { ...save.cosmetics };
      this.rebuildAvatar();
      const dir = new Vector3(...save.player.dir).normalize();
      this.player.teleport(dir, new Vector3(...save.player.facing));
      this.lighting.time = save.time;
      this.dials = [...save.dials];
    } else {
      const b = city.basis(-5.0, -13.6, -8);
      this.player.teleport(b.pos, b.forward);
      this.lighting.time = 0.31;
      this.dials = [0, 0, 0, 0];
    }
    this.titleDir.copy(this.player.dir);
    this.lighting.resetFrame(this.player.dir);
    this.cam.reset(this.followTarget(0));
    this.npcs.snapAll(this.lighting.time * 24);
    this.syncWorldToState(true);
    this.props.setDials(this.dials);
    this.currentRegion = this.world.biomes.regionAt(this.player.dir).id;
  }

  saveNow(): void {
    if (!this.ready || this.mode === 'title' || this.mode === 'loading') return;
    const p = this.player;
    this.state.data.night = this.lighting.night > 0.5;
    this.saves.save({
      state: this.state.data,
      player: { dir: p.dir.toArray() as [number, number, number], facing: p.facing.toArray() as [number, number, number] },
      time: this.lighting.time,
      cosmetics: this.cosmetics,
      dials: this.dials,
    });
  }

  /** Makes the world reflect story progress (after loading or any change). */
  private syncWorldToState(instant = false): void {
    const s = this.state;
    for (const id of ['frag.hills', 'frag.coast', 'frag.mining', 'frag.heights', 'frag.city']) if (s.hasCollected(id)) this.props.hideFragment(id);
    for (const id of ['beacon.city', 'beacon.hills', 'beacon.coast', 'beacon.mining', 'beacon.heights']) this.props.setBeaconLit(id, s.hasCollected(id), instant);
    this.props.setOldFaithful(s.status('m08') === 'done');
    this.props.setGalleryArt(s.status('m06') === 'done');
    this.props.setStationOnline(s.status('m11') === 'done');
    const pylonW = s.status('m07') === 'done' || (s.status('m07') === 'active' && s.progress('m07').objective > 0);
    this.props.setPylon('pylon.heightscity', pylonW);
    const living = s.status('m12') === 'done';
    if (living) for (const id of ['pylon.cityhills', 'pylon.hillscoast', 'pylon.coastmining', 'pylon.miningheights', 'pylon.heightscity']) this.props.setPylon(id, true);
    screenState.relayLinks = [1, 1, s.status('m11') === 'done' ? 1 : 0, 1, s.status('m07') === 'done' ? 1 : 0];
    screenState.congestion = s.status('m07') === 'done' ? 0.25 : s.status('m03') === 'done' ? 0.55 : 0.85;
    if (living && !this.props.pulse) this.props.startPulse(this.ringPoints());
  }

  private ringPoints(): Vector3[] {
    return this.world.layout.roads.find((r) => r.id === 'the-chain')!.points;
  }

  // ======================================================================== UI wiring
  private wireUI(): void {
    const ui = this.ui;
    ui.onPlay = () => this.beginPlay(false);
    ui.onNewGame = () => this.beginPlay(true);
    ui.onOpenSettings = () => this.openSettings();
    ui.onOpenJournal = () => this.openJournal();
    ui.onDialogueAdvance = () => this.advanceDialogue();
    ui.onDialogueChoice = (i) => this.chooseDialogue(i);
    ui.onDialogueSkip = () => this.skipDialogue();
    ui.onModalClosed = (kind) => {
      this.audio.ui('close');
      if (this.mode === 'panel') this.mode = 'play';
      if (kind === 'settings') this.saves.saveSettings(this.settings);
      this.avatar?.anim.stop();
    };
  }

  private applySettings(): void {
    const s = this.settings;
    this.input.sensitivity = s.sensitivity;
    this.input.invertY = s.invertY;
    if (this.cam) this.cam.autoFollow = s.autoFollow;
    this.audio.setVolumes({ master: s.master, music: s.music, ambience: s.ambience, sfx: s.sfx });
    this.perfOn = s.showFps;
    if (this.lighting) this.lighting.dayLength = s.dayLength === 'slow' ? 32 * 60 : s.dayLength === 'fast' ? 6 * 60 : 16 * 60;
  }

  private openSettings(): void {
    this.audio.ui('open');
    const inGame = this.mode !== 'title' && this.mode !== 'loading';
    if (inGame && (this.mode === 'play' || this.mode === 'panel')) this.mode = 'panel';
    this.ui.openCustom('settings', (card) =>
      buildSettings(card, {
        settings: this.settings,
        cosmetics: this.cosmetics,
        inGame,
        onChange: (s) => {
          const qChanged = s.quality !== this.settings.quality;
          this.settings = s;
          this.applySettings();
          if (qChanged) this.applyQualityCaps();
          this.saves.saveSettings(s);
        },
        onCosmetics: (c) => {
          this.cosmetics = c;
          if (this.ready) this.rebuildAvatar();
          this.saveNow();
        },
        onReset: () => {
          this.saves.clear();
          location.reload();
        },
        onResume: () => this.ui.closeModal(),
      }),
    );
  }

  private openJournal(): void {
    if (this.mode !== 'play' && this.mode !== 'panel') return;
    if (this.ui.modalKind === 'journal') {
      this.ui.closeModal();
      return;
    }
    this.audio.ui('open');
    this.mode = 'panel';
    this.ui.openCustom('journal', (card) =>
      buildJournal(card, this.state, (id) => {
        this.state.data.tracked = id;
        this.audio.ui('select');
      }),
    );
  }

  // ======================================================================== Title → play
  private beginPlay(newGame: boolean): void {
    this.audio.start();
    this.applySettings();
    if (newGame) {
      this.saves.clear();
      this.loadOrNew(true);
    }
    const first = !this.state.data.flags['game-started'];
    this.ui.hideTitle();
    this.mode = 'flyin';
    this.flyT = 0;
    // Start from the current orbit pose and blend down into the follow camera.
    const pose = this.orbitPose();
    this.cam.reset(this.followTarget(0));
    this.cam.setSpecial(pose, 50);
    this.cam.update(0.016, this.followTarget(0), null);
    this.cam.setSpecial(null, 0.75);
    this.touch.setVisible(TouchControls.isTouchDevice());
    if (first) {
      setTimeout(() => {
        this.ui.toast('Chain City', 'Welcome, Messenger', 'The morning shuttle drops you off beside Consensus Square.', true, 5200);
        this.state.apply([{ setFlag: 'game-started' }, { startMission: 'm01' }]);
      }, 2600);
    } else {
      setTimeout(() => this.ui.toast('Welcome back', 'The Living Chain', 'Your journal is right where you left it.'), 2200);
    }
  }

  private orbitPose(): CameraPose {
    const up = this.titleDir.clone().normalize();
    const ref = Math.abs(up.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    const e = new Vector3().crossVectors(ref, up).normalize();
    const n = new Vector3().crossVectors(up, e).normalize();
    const a = this.orbitT * 0.06;
    const tang = e.clone().multiplyScalar(Math.cos(a)).addScaledVector(n, Math.sin(a));
    const position = up.clone().multiplyScalar(150).addScaledVector(tang, 135);
    const look = up.clone().multiplyScalar(PLANET_RADIUS * 0.55).addScaledVector(tang, 10);
    const camUp = up.clone().addScaledVector(tang, -0.7).normalize();
    return { position, look, up: camUp };
  }

  private followTarget(dt: number) {
    return {
      dir: this.player.dir,
      feetPos: this.player.visualPosition(),
      velocity: this.player.velocity,
      facing: this.player.facing,
      frameQuat: dt > 0 ? this.player.frameQuat : new Quaternion(),
      speed: this.player.speed,
      running: this.input.running(),
    };
  }

  start(): void {
    const loop = () => {
      requestAnimationFrame(loop);
      const now = performance.now();
      const raw = (now - this.last) / 1000;
      const dt = Math.min(0.05, raw);
      this.last = now;
      if (!this.ready) return;
      this.tick(dt);
      this.renderer.render(this.scene, this.camera);
      this.trackPerformance(raw * 1000);
    };
    requestAnimationFrame(loop);
  }

  // ======================================================================== Frame
  tick(dt: number): void {
    this.elapsed += dt;
    worldUniforms.uTime.value = this.elapsed;
    this.input.pollGamepad(dt);
    this.handleGlobalKeys();

    const free = this.mode === 'play' && this.ui.modalKind === 'none';
    // ---- Player ---------------------------------------------------------------------------------
    let wish = new Vector3();
    let run = false;
    if (free && !this.sitting) {
      wish = this.wishVector();
      run = this.input.running();
    }
    if (this.sitting && free) {
      const m = this.input.move();
      if (Math.hypot(m.x, m.y) > 0.3 || this.input.consume('jump')) this.standUp();
    }
    this.player.frozen = !free || !!this.sitting;
    this.player.dynamics = this.npcs.bodies();
    this.player.update(dt, wish, run, free && !this.sitting && this.input.consume('jump'));
    if (this.sitting) {
      this.player.dir.lerp(this.sitting.pos.clone().normalize(), damp(10, dt)).normalize();
      this.player.facing.lerp(this.sitting.facing, damp(10, dt)).addScaledVector(this.player.dir, -this.player.facing.dot(this.player.dir)).normalize();
    }
    if (this.mode === 'dialogue' && this.dialogue?.npc) this.facePlayerToward(this.dialogue.npc.position, dt);

    const feet = this.player.visualPosition();
    const moved = this.lastFeet.distanceTo(feet);
    this.lastFeet.copy(feet);
    this.avatar.place(feet, this.player.dir, this.player.facing, dt);
    const a = this.avatar.anim;
    a.speed = this.player.speed;
    a.grounded = this.player.grounded;
    a.turnRate = this.player.turnRate;
    a.sitting = !!this.sitting;
    a.holding = this.mode === 'play' && !this.sitting && this.state.data.inventory.some((i) => CARRIED.includes(i)) ? 'envelope' : null;
    if (!a.holding) for (const p of ['envelope'] as const) if (!a.currentAction) this.avatar.rig.showProp(p, false);
    a.update(dt, this.player.grounded ? Math.min(moved, 1) : 0);
    worldUniforms.uPlayerPos.value.copy(feet);

    // ---- Camera -------------------------------------------------------------------------------
    if (this.mode === 'title' || this.mode === 'loading') {
      this.orbitT += dt;
      const p = this.orbitPose();
      this.camera.position.copy(p.position);
      this.camera.up.copy(p.up);
      this.camera.lookAt(p.look);
      this.lighting.fogScale = 4;
    } else {
      if (this.mode === 'flyin') {
        this.flyT += dt;
        this.lighting.fogScale = 1 + 3 * (1 - smoothstep(0.3, 3.2, this.flyT));
        if (this.flyT > 3.6) {
          this.mode = 'play';
          this.ui.showHud(true);
          this.lighting.fogScale = 1;
        }
      }
      if (this.mode === 'cinematic') this.updateCinematic(dt);
      else if (this.mode === 'dialogue') this.cam.setSpecial(this.dialoguePose(), 2.4);
      this.cam.update(dt, this.followTarget(dt), free ? this.input : null);
    }

    // ---- World ----------------------------------------------------------------------------------
    const hours = this.lighting.time * 24;
    const titleLike = this.mode === 'title' || this.mode === 'loading';
    this.lighting.update(dt, titleLike ? this.titleDir : this.player.dir, this.player.frameQuat, titleLike ? this.titleDir.clone().multiplyScalar(PLANET_RADIUS) : feet, this.camera.position);
    this.state.data.night = this.lighting.night > 0.5;
    this.water.update(dt, this.lighting.sunDir, this.lighting.sun.color, this.lighting.night);
    this.content.update(dt, this.lighting.night);
    this.npcs.update(dt, hours, this.player.visualPosition(), this.camera.position, this.mode !== 'play');
    this.props.update(dt, this.lighting.night);
    this.culler.update(this.camera.position);
    this.updateMarkers();

    // ---- Gameplay -----------------------------------------------------------------------------
    if (this.mode === 'play') {
      this.updateInteraction();
      this.checkReach();
      this.checkRegion();
      this.saveTimer += dt;
      if (this.saveTimer > 20) {
        this.saveTimer = 0;
        this.saveNow();
      }
    } else if (this.mode !== 'dialogue') this.ui.setPrompt(null);
    if (this.mode === 'dialogue') this.handleDialogueKeys();
    if (this.mode === 'panel' && this.ui.modalKind !== 'settings' && this.ui.modalKind !== 'journal' && (this.input.consume('interact') || this.input.consume('confirm'))) this.ui.closeModal();
    if (this.mode === 'panel' && this.ui.modalKind === 'none') this.mode = 'play';

    this.updateHud();
    this.ui.update(dt, 55 * this.settings.textSpeed);
    this.audio.setAmbience(this.ambienceMix());
    this.input.endFrame(dt);
  }

  private handleGlobalKeys(): void {
    const inp = this.input;
    if (inp.consume('perf')) {
      this.perfOn = !this.perfOn;
      this.settings.showFps = this.perfOn;
    }
    if (inp.consume('pause')) {
      if (this.ui.modalKind !== 'none') this.ui.closeModal();
      else if (this.mode === 'play' || this.mode === 'title') this.openSettings();
    }
    if (inp.consume('journal')) this.openJournal();
  }

  private wishVector(): Vector3 {
    const m = this.input.move();
    const up = this.player.dir;
    const fwd = this.cam.heading.clone().addScaledVector(up, -this.cam.heading.dot(up)).normalize();
    const right = new Vector3().crossVectors(fwd, up).normalize();
    return new Vector3().addScaledVector(fwd, m.y).addScaledVector(right, m.x);
  }

  private facePlayerToward(p: Vector3, dt: number): void {
    const up = this.player.dir;
    const t = p.clone().normalize().sub(up);
    t.addScaledVector(up, -t.dot(up));
    if (t.lengthSq() < 1e-10) return;
    this.player.facing.lerp(t.normalize(), damp(6, dt)).addScaledVector(up, -this.player.facing.dot(up)).normalize();
  }

  // ======================================================================== Interaction
  private updateInteraction(): void {
    const pos = this.player.visualPosition();
    const up = this.player.dir;
    const facing = this.player.facing;
    let bestScore = Infinity;
    let best: Focus = null;
    const consider = (target: Vector3, radius: number, f: Focus) => {
      const d = target.clone().sub(pos);
      const vertical = d.dot(up);
      if (vertical > 2.6 || vertical < -1.2) return;
      const horiz = d.addScaledVector(up, -vertical);
      const dist = horiz.length();
      if (dist > radius) return;
      const facingDot = dist > 0.01 ? horiz.normalize().dot(facing) : 1;
      if (facingDot < -0.35 && dist > 1.1) return;
      // Residents win ties against the props they stand next to (kiosks, terminals, benches).
      const score = dist - facingDot * 0.8 - (f?.kind === 'npc' ? 0.9 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    };
    for (const n of this.npcs.npcs) {
      if (!n.avatar.group.visible) continue;
      consider(n.position, n.talkRadius, { kind: 'npc', npc: n });
    }
    for (const it of this.props.interactables) {
      if (!it.enabled()) continue;
      // A seat a resident is using is not offered.
      if (it.kind === 'sit' && this.npcs.npcs.some((n) => n.sitting && n.position.distanceTo(it.pos) < 1.2)) continue;
      consider(it.pos, it.radius, { kind: 'object', it });
    }
    this.focus = best;
    let label: string | null = null;
    const f = this.focus as Focus;
    if (this.sitting) label = 'Stand up';
    else if (f?.kind === 'npc') label = `Talk to ${f.npc.def.name}`;
    else if (f?.kind === 'object') label = f.it.label;
    this.ui.setPrompt(label, this.input.lastDevice === 'gamepad' ? 'A' : 'E');
    this.touch.setAction(label ? (f?.kind === 'npc' ? 'TALK' : this.sitting ? 'STAND' : 'USE') : null);
    if (this.input.consume('interact')) {
      if (this.sitting) this.standUp();
      else if (f) this.activate(f);
    }
  }

  private activate(f: NonNullable<Focus>): void {
    this.audio.ui('select');
    if (f.kind === 'npc') return this.startNpcDialogue(f.npc);
    const it = f.it;
    // Objects with conversations (terminals, pylons, beacons, puzzles) speak first.
    const conv = pickConversation(CONVERSATIONS, it.id, this.state);
    if (conv) {
      this.avatar.anim.play('interact');
      this.startDialogue(conv, null, it.id);
      return;
    }
    switch (it.kind) {
      case 'sit':
        this.sitDown(it);
        return;
      case 'read':
      case 'inspect':
      case 'view': {
        const doc = DOCS[it.data?.doc];
        this.avatar.anim.play(it.kind === 'read' ? 'read' : it.kind === 'view' ? 'think' : 'inspect', true);
        if (doc) this.openPanel(() => this.ui.openDoc(doc, it.kind === 'view' ? 'Viewpoint' : ''));
        this.state.onInteract(it.id);
        break;
      }
      case 'screen':
        this.avatar.anim.play('type', true);
        this.openPanel(() => this.ui.openScreen((it.data?.screen ?? 'explorer') as ScreenKind, it.data?.title ?? 'Terminal'));
        this.state.onInteract(it.id);
        break;
      case 'secret':
        this.avatar.anim.play('inspect');
        this.revealSecret(it.data?.secret);
        this.state.onInteract(it.id);
        break;
      case 'dial':
        this.turnDial(it.data?.dial ?? 0);
        return;
      case 'fragment':
        this.avatar.anim.play('receive');
        this.state.collect(it.id);
        this.props.hideFragment(it.id);
        break;
      default:
        this.avatar.anim.play('interact');
        this.state.onInteract(it.id);
    }
  }

  private openPanel(open: () => void): void {
    this.audio.ui('open');
    this.mode = 'panel';
    open();
  }

  private sitDown(it: Interactable): void {
    const floor = it.pos.clone().normalize();
    this.sitting = { pos: floor.multiplyScalar(PLANET_RADIUS + this.world.groundHeight(floor)), facing: it.forward.clone() };
    this.player.velocity.set(0, 0, 0);
  }

  private standUp(): void {
    if (!this.sitting) return;
    const step = this.sitting.facing.clone();
    this.sitting = null;
    const d = this.player.dir.clone().addScaledVector(step, 0.55 / PLANET_RADIUS).normalize();
    this.player.teleport(d, step);
  }

  private turnDial(i: number): void {
    this.avatar.anim.play('interact');
    this.dials[i] = (this.dials[i] + 1) % 10;
    this.props.setDials(this.dials);
    this.audio.ui('tick');
    this.ui.toast('Genesis Stone', `Dials: ${this.dials.join(' · ')}`, '', false, 1600);
    if (this.dials.every((v, k) => v === DIAL_CODE[k]) && !this.state.data.secrets.includes('genesis-dials')) setTimeout(() => this.revealSecret('genesis-dials'), 600);
  }

  private revealSecret(id: string | undefined): void {
    if (!id || !SECRETS[id]) return;
    this.state.discover(id);
    const n = this.state.data.secrets.length;
    this.openPanel(() => this.ui.openSecret(SECRETS[id], n, Object.keys(SECRETS).length));
  }

  // ======================================================================== Dialogue
  private startNpcDialogue(npc: Npc): void {
    const conv = pickConversation(CONVERSATIONS, npc.def.id, this.state);
    if (!conv) return;
    npc.beginTalk(this.avatar.rig.bones.head.getWorldPosition(new Vector3()));
    this.startDialogue(conv, npc, null);
  }

  private startDialogue(conv: Conversation, npc: Npc | null, objectId: string | null): void {
    this.mode = 'dialogue';
    this.ui.setPrompt(null);
    const runner = new DialogueRunner(conv, this.state);
    this.dialogue = { runner, npc, objectId, pendingSecret: null, pendingAfter: null, shot: null };
    this.audio.ui('open');
    this.showCurrentLine();
  }

  private showCurrentLine(): void {
    const d = this.dialogue;
    if (!d) return;
    const cur = d.runner.current();
    if (!cur) return this.endDialogue();
    const speakerId = cur.speaker;
    let name = speakerId;
    let subtitle: string | undefined;
    let kind: 'npc' | 'player' | 'object' = 'npc';
    if (speakerId === 'player') {
      name = 'You';
      subtitle = 'Messenger';
      kind = 'player';
      this.avatar.anim.play(cur.line.playerAnim ?? 'talk');
    } else {
      const def = npcById(speakerId);
      if (def) {
        name = def.name;
        subtitle = def.title;
        if (d.npc) d.npc.avatar.anim.play(cur.line.anim ?? 'talk');
      } else {
        name = OBJECT_SPEAKERS[speakerId] ?? 'TERMINAL';
        kind = 'object';
      }
    }
    this.voicePitch = speakerId === 'player' ? 1.05 : npcById(speakerId)?.voice.pitch ?? 1;
    this.voiceObject = kind === 'object';
    this.voiceAcc = 0;
    this.ui.showDialogue({ speaker: name, subtitle, kind, text: cur.text, choices: cur.choices });
  }

  private handleDialogueKeys(): void {
    const inp = this.input;
    if (!this.ui.typingDone) {
      this.voiceAcc += 1;
      if (this.voiceAcc % 5 === 1) this.audio.voice(this.voicePitch, this.voiceObject);
    }
    for (const [act, n] of [['c1', 1], ['c2', 2], ['c3', 3], ['c4', 4]] as const) {
      if (inp.consume(act)) {
        const idx = this.ui.choiceByNumber(n);
        if (idx !== null && this.ui.typingDone) this.chooseDialogue(idx);
      }
    }
    if (this.ui.hasChoices && this.ui.typingDone) {
      if (inp.consume('up')) {
        this.ui.moveChoice(-1);
        this.audio.ui('select');
      }
      if (inp.consume('down')) {
        this.ui.moveChoice(1);
        this.audio.ui('select');
      }
    }
    // E/Enter raise both 'interact' and 'confirm'; consume all of them so one press = one step.
    const a = inp.consume('interact');
    const b = inp.consume('skip');
    const c = inp.consume('confirm');
    if (a || b || c) this.advanceDialogue();
  }

  private advanceDialogue(): void {
    const d = this.dialogue;
    if (!d) return;
    if (!this.ui.typingDone) {
      this.ui.completeTyping();
      return;
    }
    if (this.ui.hasChoices) {
      const sel = this.ui.selectedChoice;
      if (sel !== null) this.chooseDialogue(sel);
      return;
    }
    d.runner.next();
    this.audio.ui('tick');
    if (d.runner.done) this.endDialogue();
    else this.showCurrentLine();
  }

  private chooseDialogue(i: number): void {
    const d = this.dialogue;
    if (!d) return;
    this.audio.ui('confirm');
    d.runner.next(i);
    if (d.runner.done) this.endDialogue();
    else this.showCurrentLine();
  }

  /** Fast-forwards to the next choice or the end of the conversation. */
  private skipDialogue(): void {
    const d = this.dialogue;
    if (!d) return;
    let guard = 0;
    while (!d.runner.done && guard++ < 60) {
      const cur = d.runner.current();
      if (!cur || cur.choices.length) break;
      d.runner.next();
    }
    if (d.runner.done) this.endDialogue();
    else {
      this.showCurrentLine();
      this.ui.completeTyping();
    }
  }

  private endDialogue(): void {
    const d = this.dialogue;
    if (!d) return;
    this.dialogue = null;
    this.ui.hideDialogue();
    this.cam.setSpecial(null, 2.2);
    this.mode = 'play';
    if (d.npc) {
      d.npc.endTalk();
      this.state.onTalked(d.npc.def.id);
    }
    if (d.objectId) this.state.onInteract(d.objectId);
    this.avatar.anim.stop();
    this.syncWorldToState();
    this.saveNow();
    if (d.pendingSecret) this.revealSecret(d.pendingSecret);
    d.pendingAfter?.();
  }

  /** Geometry of the current conversation: both heads, the line between them and its sideways axis. */
  private dialogueFrame() {
    const d = this.dialogue;
    const head = this.avatar.rig.bones.head.getWorldPosition(new Vector3());
    const up = this.player.dir.clone();
    let other: Vector3;
    if (d?.npc) other = d.npc.headPosition();
    else if (d?.objectId) {
      const it = this.props.interactables.find((x) => x.id === d.objectId);
      other = it ? it.pos.clone().addScaledVector(up, 0.5) : head.clone().addScaledVector(this.player.facing, 2);
    } else other = head.clone().addScaledVector(this.player.facing, 2);
    const line = other.clone().sub(head);
    line.addScaledVector(up, -line.dot(up));
    const sep = Math.max(0.8, line.length());
    line.normalize();
    const side = new Vector3().crossVectors(up, line).normalize();
    return { head, other, up, line, sep, side, isObject: !d?.npc };
  }

  private shotPosition(f: ReturnType<Game['dialogueFrame']>, s: DialogueShot): Vector3 {
    return f.head.clone().addScaledVector(f.line, -s.back).addScaledVector(f.side, s.lateral * s.side).addScaledVector(f.up, s.lift);
  }

  /**
   * Chooses the conversation's camera once: an over-the-shoulder shot whose path to the player is
   * free of walls and whose view of the speaker's face is not hidden by props, foliage or terrain.
   * Candidates are tested against the real rendered geometry, so this runs once per conversation.
   */
  private chooseDialogueShot(): DialogueShot {
    const f = this.dialogueFrame();
    const prefer = f.side.dot(this.camera.position.clone().sub(f.head)) >= 0 ? 1 : -1;
    const base: [number, number, number][] = f.isObject
      ? [[2.3, 1.25, 0.75], [1.7, 0.9, 0.95], [2.6, 0.4, 1.4]]
      : [[1.45 + f.sep * 0.1, 1.0, 0.3], [1.45 + f.sep * 0.1, 1.05, 0.8], [1.1, 0.85, 0.35], [2.2, 1.6, 0.65], [0.8, 0.7, 0.42], [2.0, 0.45, 1.3]];
    const blocked = (a: Vector3, b: Vector3, margin: number) => this.sightBlocked(a, b, margin);
    let best: DialogueShot | null = null;
    let bestScore = -1;
    for (const [back, lateral, lift] of base)
      for (const side of [prefer, -prefer]) {
        const shot: DialogueShot = { back, lateral, lift, side };
        const pos = this.shotPosition(f, shot);
        const camFrac = this.world.collision.raycast(f.head, pos);
        const clearCam = camFrac >= 0.999 && !blocked(f.head, pos, 0);
        const clearSight = !blocked(pos, f.other, 0.35);
        const score = (clearSight ? 2 : 0) + (clearCam ? 1 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = shot;
          if (score === 3) return shot;
        }
      }
    return best!;
  }

  /** True when rendered world geometry (props, buildings, foliage, terrain) lies between a and b. */
  sightBlocked(a: Vector3, b: Vector3, margin = 0): boolean {
    const dir = b.clone().sub(a);
    const len = dir.length();
    this.ray.set(a, dir.normalize());
    this.ray.near = 0.05;
    this.ray.far = Math.max(0.1, len - margin);
    this.occluders ??= [...this.content.group.children, ...this.world.terrain.chunks];
    return this.ray.intersectObjects(this.occluders, false).length > 0;
  }

  private dialoguePose(): CameraPose {
    const d = this.dialogue;
    const f = this.dialogueFrame();
    if (d && !d.shot) d.shot = this.chooseDialogueShot();
    const shot = d?.shot ?? { back: 1.6, lateral: 1, lift: 0.3, side: 1 };
    const look = f.isObject ? f.head.clone().lerp(f.other, 0.6).addScaledVector(f.up, -0.1) : f.head.clone().lerp(f.other, 0.78).addScaledVector(f.up, 0.02);
    let position = this.shotPosition(f, shot);
    // Still respect walls every frame (characters keep turning and settling during a conversation).
    const frac = this.world.collision.raycast(f.head, position);
    if (frac < 0.999) position = f.head.clone().lerp(position, Math.max(0.3, frac - 0.08));
    const pd = position.clone().normalize();
    const minR = PLANET_RADIUS + this.world.groundHeight(pd) + 0.6;
    if (position.length() < minR) position.copy(pd.multiplyScalar(minR));
    return { position, look, up: f.up };
  }

  // ======================================================================== Events
  private onGameEvent(e: GameEvent): void {
    const ui = this.ui;
    switch (e.type) {
      case 'mission-available':
        ui.toast('New request', e.mission.title, `${npcById(e.mission.giver)?.name} would like your help.`);
        break;
      case 'mission-start':
        this.audio.chime('mission-start');
        ui.toast(`Mission ${String(e.mission.number).padStart(2, '0')}`, e.mission.title, e.mission.summary, true, 4600);
        break;
      case 'objective': {
        const next = e.mission.objectives[e.index + 1];
        if (next) {
          this.audio.chime('objective');
          ui.toast('Objective complete', e.mission.objectives[e.index].text, `Next: ${next.text}`);
        }
        break;
      }
      case 'mission-complete':
        this.audio.chime('mission-complete');
        ui.toast('Mission complete', e.mission.title, e.mission.completeText, true, 5200);
        break;
      case 'item-get':
        this.audio.chime('item');
        ui.toast('Added to your bag', ITEMS[e.item]?.name ?? e.item);
        this.avatar.anim.play('receive');
        break;
      case 'item-lose':
        this.avatar.anim.play('deliver');
        break;
      case 'secret':
        this.audio.chime('secret');
        ui.toast('Discovery', SECRETS[e.id]?.title ?? e.id, `${this.state.data.secrets.length} of ${Object.keys(SECRETS).length} found`);
        if (this.dialogue) this.dialogue.pendingSecret = e.id;
        break;
      case 'fragment':
        if (e.id.startsWith('frag.')) {
          this.audio.chime('item');
          ui.toast('Lost block recovered', `${this.state.countCollected('frag.')} of 5`, 'Return them to Genesis at the Merkle Library.');
          this.props.hideFragment(e.id);
        } else if (e.id.startsWith('beacon.')) {
          this.audio.chime('beacon');
          this.props.setBeaconLit(e.id, true);
          ui.toast('Beacon lit', `${this.state.countCollected('beacon.')} of 5`, 'The Chain is waking up.');
        }
        break;
      case 'custom':
        if (e.name === 'finale') {
          if (this.dialogue) this.dialogue.pendingAfter = () => this.startFinale();
          else this.startFinale();
        }
        if (e.name === 'oldfaithful-start') this.props.setOldFaithful(true);
        if (e.name === 'station-online') this.props.setStationOnline(true);
        if (e.name === 'pylon-rebooted') this.props.setPylon('pylon.heightscity', true);
        break;
      default:
        break;
    }
    this.saveTimer = 15;
  }

  // ======================================================================== HUD & markers
  private targetPosition(): { pos: Vector3 | null; title: string; text: string } | null {
    const s = this.state;
    let id = s.data.tracked;
    if (!id || s.status(id) !== 'active') id = s.activeMissions()[0]?.id ?? null;
    if (!id) {
      const offer = MISSIONS.find((m) => s.status(m.id) === 'available');
      if (!offer) return null;
      const npc = this.npcs.byId(offer.giver);
      return { pos: npc ? npc.position.clone() : null, title: 'New request', text: `Talk to ${npc?.def.name} — ${offer.title}` };
    }
    const m = s.mission(id);
    const o = s.currentObjective(id);
    if (!o) return null;
    let text = o.text;
    let pos: Vector3 | null = null;
    if (o.type === 'collect') {
      text += ` (${Math.min(o.count ?? 1, s.countCollected(o.target))}/${o.count})`;
      const list = o.target === 'frag.' ? this.props.fragmentPositions() : this.props.beaconPositions();
      const here = this.player.visualPosition();
      list.sort((x, y) => x.pos.distanceTo(here) - y.pos.distanceTo(here));
      pos = list[0]?.pos.clone() ?? null;
    } else if (o.marker) {
      const [kind, ref] = o.marker.split(':');
      if (kind === 'npc') pos = this.npcs.byId(ref)?.position.clone() ?? null;
      else if (kind === 'interact') pos = this.props.interactables.find((i) => i.id === ref)?.pos.clone() ?? null;
      else if (kind === 'anchor') pos = this.content.anchors.get(ref)?.pos.clone() ?? null;
    }
    return { pos, title: `${String(m.number).padStart(2, '0')} · ${m.title}`, text };
  }

  private updateHud(): void {
    if (this.mode !== 'play' && this.mode !== 'panel') {
      if (this.mode === 'dialogue' || this.mode === 'cinematic' || this.mode === 'credits') this.ui.setTracker(null);
      this.targetMarker.visible = false;
      return;
    }
    const t = this.targetPosition();
    if (!t) {
      this.ui.setTracker(null);
      this.targetMarker.visible = false;
    } else {
      let dist: number | null = null;
      let angle: number | null = null;
      let here = false;
      if (t.pos) {
        const p = this.player.dir;
        const tp = t.pos.clone().normalize();
        dist = Math.acos(Math.min(1, p.dot(tp))) * PLANET_RADIUS;
        here = dist < 3.5;
        const tangent = tp.clone().addScaledVector(p, -tp.dot(p));
        if (tangent.lengthSq() > 1e-10) {
          tangent.normalize();
          const fwd = this.cam.heading.clone().addScaledVector(p, -this.cam.heading.dot(p)).normalize();
          const right = new Vector3().crossVectors(fwd, p).normalize();
          angle = Math.atan2(tangent.dot(right), tangent.dot(fwd));
        }
        const isNpc = this.npcs.npcs.some((n) => n.position.distanceTo(t.pos!) < 0.01);
        this.targetMarker.visible = !isNpc && dist < 40;
        this.targetMarker.position.copy(t.pos).addScaledVector(tp, 2.3 + Math.sin(this.elapsed * 3) * 0.12);
      } else this.targetMarker.visible = false;
      this.ui.setTracker({ mission: t.title, objective: t.text, dist, angle, here });
    }
    this.ui.setClock(this.lighting.clock);
  }

  private updateMarkers(): void {
    for (const n of this.npcs.npcs) {
      const id = n.def.id;
      n.marker = this.state.offersFrom(id).length ? 'new' : this.state.isObjectiveTarget(id) ? 'target' : null;
    }
  }

  private checkReach(): void {
    for (const m of this.state.activeMissions()) {
      const o = this.state.currentObjective(m.id);
      if (!o || o.type !== 'reach') continue;
      const place = PLACES[o.target];
      const anchor = place && this.content.anchors.get(place.anchor);
      if (anchor && anchor.pos.distanceTo(this.player.visualPosition()) < place.radius) this.state.onReach(o.target);
    }
  }

  private checkRegion(): void {
    const r = this.world.biomes.regionAt(this.player.dir);
    if (r.id === this.currentRegion || r.weight < 0.55) return;
    this.currentRegion = r.id;
    const info = REGION_SUB[r.id];
    if (!info) return;
    const lastShown = this.regionShownAt[r.id] ?? -999;
    if (this.elapsed - lastShown > 90) {
      this.regionShownAt[r.id] = this.elapsed;
      this.ui.regionBanner(info[0], info[1]);
    }
  }

  private ambienceMix() {
    const d = this.player.dir;
    const near = (id: string) => {
      const reg = this.world.layout.regions.get(id as any);
      if (!reg) return 0;
      const dist = Math.acos(Math.min(1, d.dot(reg.frame.center))) * PLANET_RADIUS;
      return 1 - smoothstep(reg.radius * 0.5, reg.radius * 1.4, dist);
    };
    const h = this.world.groundHeight(d);
    const nearSea = 1 - smoothstep(0.2, 2.5, h + 0.5);
    return {
      wind: Math.max(near('heights'), near('south'), 0.3),
      ocean: Math.max(near('coast'), nearSea) * 0.9,
      city: near('city'),
      machines: near('mining'),
      birds: Math.max(near('hills'), near('woods'), 0.25),
      night: this.lighting.night,
    };
  }

  // ======================================================================== Finale
  private startFinale(): void {
    this.mode = 'cinematic';
    this.ui.showHud(false);
    this.audio.chime('finale');
    this.audio.setIntensity(1);
    this.cinematic = { t: 0, from: { position: this.camera.position.clone(), look: this.player.visualPosition(), up: this.player.dir.clone() }, stage: 0 };
    screenState.relayLinks = [1, 1, 1, 1, 1];
    const ids = ['pylon.heightscity', 'pylon.cityhills', 'pylon.hillscoast', 'pylon.coastmining', 'pylon.miningheights'];
    ids.forEach((id, i) =>
      setTimeout(() => {
        this.props.setPylon(id, true);
        this.audio.chime('objective');
      }, 1200 + i * 900),
    );
    if (!this.props.pulse) this.props.startPulse(this.ringPoints());
  }

  private updateCinematic(dt: number): void {
    const c = this.cinematic;
    if (!c) return;
    c.t += dt;
    const up = this.player.dir.clone();
    const ref = Math.abs(up.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    const e = new Vector3().crossVectors(ref, up).normalize();
    const n = new Vector3().crossVectors(up, e).normalize();
    const k = smoothstep(0, 9, c.t);
    const ang = c.t * 0.08;
    const tang = e.clone().multiplyScalar(Math.cos(ang)).addScaledVector(n, Math.sin(ang));
    const far = up.clone().multiplyScalar(120).addScaledVector(tang, 120);
    const pos = c.from.position.clone().lerp(far, k);
    const look = this.player.visualPosition().lerp(up.clone().multiplyScalar(PLANET_RADIUS * 0.4), k);
    this.cam.setSpecial({ position: pos, look, up: up.clone().addScaledVector(tang, -0.6 * k).normalize() }, 3);
    this.lighting.fogScale = 1 + 3 * k;
    if (c.t > 10 && c.stage === 0) {
      c.stage = 1;
      this.mode = 'credits';
      this.ui.showCredits(
        [
          'Five beacons burn. The relays sync. Block 1,000,000 is signed — and the whole planet remembers itself.',
          'Every resident you met is a link. Every delivery you made is a block. You walked the Chain until it was whole.',
          'Thank you for playing CRYPTO WORLD.',
        ],
        () => {
          this.cinematic = null;
          this.cam.setSpecial(null, 0.7);
          this.mode = 'flyin';
          this.flyT = 0;
          this.audio.setIntensity(0);
          this.saveNow();
        },
      );
    }
  }

  // ======================================================================== Performance
  private trackPerformance(ms: number): void {
    this.frameMs += (ms - this.frameMs) * 0.05;
    if (this.settings.quality === 'auto' && this.mode === 'play') {
      if (this.frameMs > 24) {
        this.slowTimer += ms / 1000;
        this.fastTimer = 0;
        if (this.slowTimer > 2 && this.pixelRatio > 0.6) {
          this.pixelRatio = Math.max(0.6, this.pixelRatio - 0.15);
          this.renderer.setPixelRatio(this.pixelRatio);
          this.slowTimer = 0;
        }
      } else if (this.frameMs < 14) {
        this.fastTimer += ms / 1000;
        this.slowTimer = 0;
        if (this.fastTimer > 4 && this.pixelRatio < this.prCap) {
          this.pixelRatio = Math.min(this.prCap, this.pixelRatio + 0.1);
          this.renderer.setPixelRatio(this.pixelRatio);
          this.fastTimer = 0;
        }
      }
    }
    if (this.perfOn) {
      const info = this.renderer.info;
      const mem = (performance as any).memory;
      this.ui.setPerf(
        `FPS ${(1000 / this.frameMs).toFixed(0)}  (${this.frameMs.toFixed(1)} ms)\n` +
          `draw calls ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k\n` +
          `geometries ${info.memory.geometries}  textures ${info.memory.textures}\n` +
          `visible ${this.culler.visibleCount}/${this.culler.count}  px ratio ${this.pixelRatio.toFixed(2)}` +
          (mem ? `\nheap ${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB` : ''),
      );
    } else this.ui.setPerf(null);
  }

  // ======================================================================== Debug / automation
  teleportTo(region: string, x: number, y: number, headingDeg = 0): void {
    const f = this.world.layout.get(region as any).frame;
    const b = f.basis(x, y, headingDeg);
    this.player.teleport(b.pos, b.forward);
    this.cam.reset(this.followTarget(0));
    this.lighting.resetFrame(this.player.dir);
  }

  /** Skips the title for automated tests. */
  skipTitle(): void {
    this.ui.hideTitle();
    this.ui.showHud(true);
    this.mode = 'play';
    this.lighting.fogScale = 1;
    this.cam.setSpecial(null, 50);
    if (!this.state.data.flags['game-started']) this.state.apply([{ setFlag: 'game-started' }, { startMission: 'm01' }]);
  }

  simulate(seconds: number, dt = 1 / 60): void {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) this.tick(dt);
  }

  debugState() {
    const p = this.player;
    return { dir: p.dir.toArray(), feet: p.feet, speed: p.speed, radius: PLANET_RADIUS + p.feet, grounded: p.grounded, mode: this.mode };
  }
}
