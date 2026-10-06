import * as THREE from 'three';
import { Renderer } from './Renderer.js';
import { Input } from './Input.js';
import { Settings, VEGETATION, WATER, POST } from './Settings.js';
import { U, LAYER } from './Shared.js';
import { TextureBaker } from '../utils/TextureBaker.js';
import { PerformanceMonitor } from '../utils/PerformanceMonitor.js';
import { bakeTextures } from '../world/Textures.js';
import { TerrainData } from '../world/TerrainData.js';
import { Terrain } from '../world/Terrain.js';
import { Sky } from '../world/Sky.js';
import { CloudBillboards } from '../world/CloudBillboards.js';
import { TimeOfDay } from '../world/TimeOfDay.js';
import { Weather } from '../world/Weather.js';
import { Atmosphere } from '../world/Atmosphere.js';
import { Ocean } from '../world/Ocean.js';
import { Rocks } from '../world/Rocks.js';
import { DistantScenery } from '../world/DistantScenery.js';
import { Waterfall } from '../world/Waterfall.js';
import { WaterRipples } from '../effects/WaterRipples.js';
import { Particles } from '../effects/Particles.js';
import { Rain } from '../effects/Rain.js';
import { Footprints } from '../effects/Footprints.js';
import { CollisionWorld } from '../player/Collision.js';
import { PlayerController } from '../player/PlayerController.js';
import { FirstPersonRig } from '../player/FirstPersonRig.js';
import { InteractionSystem } from '../player/InteractionSystem.js';
import { Inventory, ITEMS } from '../player/Inventory.js';
import { Tools } from '../player/Tools.js';
import { SPAWN } from '../world/Layout.js';
import { VegetationManager } from '../vegetation/VegetationManager.js';
import { GrassSystem } from '../vegetation/GrassSystem.js';
import { createPropMaterials } from '../environment/PropMaterials.js';
import { Camp } from '../environment/Camp.js';
import { Props } from '../environment/Props.js';
import { Pebbles } from '../environment/Pebbles.js';
import { Wildlife } from '../environment/Wildlife.js';
import { Collectibles } from '../environment/Collectibles.js';
import { Boat } from '../vehicles/Boat.js';
import { AudioManager } from '../audio/AudioManager.js';
import { UI } from '../ui/UI.js';

const params = new URLSearchParams(location.search);

/**
 * Top level game object: owns every system and the single central update loop.
 */
export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.state = 'loading'; // loading | title | playing | paused | menu
    this.time = 0;
    this.clock = performance.now();
    this.settings = new Settings();
    this.systems = [];
    this.journal = [];
    this.U = U;
    this.perf = new PerformanceMonitor();
    this.autostart = params.has('autostart');
  }

  async init() {
    const progress = (p, label) => this._progress(p, label);
    progress(0.02, 'Preparing renderer');
    this.renderer = new Renderer(this.canvas);
    this.input = new Input(this.canvas);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.get('fov'), 1, 0.08, 6000);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    await this._yield();

    progress(0.06, 'Baking materials');
    const baker = new TextureBaker(this.renderer.renderer);
    this.textures = bakeTextures(baker, this.settings.get('vegetation') === 'low' ? 'low' : 'high');
    U.uNoiseTex.value = this.textures.noise;
    U.uCausticsTex.value = this.textures.caustics;
    this.materials = createPropMaterials(this.textures);
    await this._yield();

    progress(0.14, 'Shaping the island');
    this.terrainData = new TerrainData();
    await this.terrainData.generate((p) => progress(0.14 + p * 0.22, 'Shaping the island'));
    U.uTerrainData.value = this.terrainData.dataTexture;
    U.uTerrainSplatB.value = this.terrainData.splatBTexture;
    U.uTerrainUV.value.copy(this.terrainData.uvTransform);

    progress(0.38, 'Raising terrain');
    this.terrain = new Terrain(this.terrainData, this.textures);
    this.scene.add(this.terrain.group);
    this.sky = new Sky();
    this.scene.add(this.sky.mesh);
    this.clouds = new CloudBillboards(this.scene);
    this.timeOfDay = new TimeOfDay(params.has('time') ? parseFloat(params.get('time')) : 9.7);
    this.weather = new Weather();
    if (params.has('weather')) { this.weather.set(params.get('weather'), true); this.weather.auto = false; }
    this.atmosphere = new Atmosphere({ renderer: this.renderer, scene: this.scene, sky: this.sky, time: this.timeOfDay, weather: this.weather });
    this.distant = new DistantScenery(this.scene, this.textures);
    await this._yield();

    progress(0.44, 'Filling the lagoon');
    const wq = WATER[this.settings.get('water')] || WATER.high;
    this.ripples = new WaterRipples(this.renderer.renderer, { size: wq.ripples });
    this.ocean = new Ocean({ terrainData: this.terrainData, textures: this.textures, ripples: this.ripples, quality: wq.grid });
    this.scene.add(this.ocean.mesh);
    this.collision = new CollisionWorld(this.terrainData);
    this.particles = new Particles(this.scene, 1);
    this.particles.ocean = this.ocean;
    this.rain = new Rain(this.scene, this.settings.get('vegetation'));
    this.footprints = new Footprints(this.scene);
    await this._yield();

    progress(0.5, 'Placing rocks');
    this.rocks = new Rocks({ scene: this.scene, terrainData: this.terrainData, textures: this.textures, collision: this.collision });
    this.waterfall = new Waterfall({ scene: this.scene, terrainData: this.terrainData, textures: this.textures, ripples: this.ripples });
    await this._yield();

    progress(0.56, 'Growing the jungle');
    this.vegetationQuality = VEGETATION[this.settings.get('vegetation')] || VEGETATION.high;
    this.vegetation = new VegetationManager({ terrainData: this.terrainData, textures: this.textures, collision: this.collision, quality: this.vegetationQuality });
    await this._yield();
    this.vegetation.place((p) => progress(0.56 + p * 0.14, 'Growing the jungle'));
    await this._yield();
    this.vegetation.build();
    this.scene.add(this.vegetation.group);
    this.grass = new GrassSystem({ terrainData: this.terrainData, quality: this.vegetationQuality });
    this.scene.add(this.grass.group);
    await this._yield();

    progress(0.74, 'Setting up camp');
    this.interaction = new InteractionSystem(this);
    this.inventory = new Inventory(this);
    this.audio = new AudioManager(this.settings);
    this.camp = new Camp({ scene: this.scene, terrainData: this.terrainData, materials: this.materials, collision: this.collision, interaction: this.interaction });
    this.props = new Props({ scene: this.scene, terrainData: this.terrainData, materials: this.materials, collision: this.collision, vegetation: this.vegetation, textures: this.textures, interaction: this.interaction });
    this.rig = new FirstPersonRig(this.camera);
    this.tools = new Tools(this);
    this.pebbles = new Pebbles({ scene: this.scene, materials: this.materials, terrainData: this.terrainData, ocean: this.ocean, collision: this.collision, particles: this.particles, ripples: this.ripples, interaction: this.interaction, audio: this.audio });
    this.boat = new Boat({ scene: this.scene, materials: this.materials, textures: this.textures, ocean: this.ocean, terrainData: this.terrainData, collision: this.collision, particles: this.particles, ripples: this.ripples, interaction: this.interaction, camp: this.camp });
    this.wildlife = new Wildlife({ scene: this.scene, terrainData: this.terrainData, ocean: this.ocean });
    this.collectibles = new Collectibles({ scene: this.scene, materials: this.materials, terrainData: this.terrainData, interaction: this.interaction, game: this });
    this.weather.onThunder = (d, i) => this.audio.thunder(d, i);
    await this._yield();

    this.player = new PlayerController({ camera: this.camera, input: this.input, collision: this.collision, terrain: this.terrainData, ocean: this.ocean });
    this._wirePlayer();
    const pos = params.get('pos');
    if (pos) {
      const [x, z, yaw, pitch] = pos.split(',').map(Number);
      this.player.spawn(x, z, yaw || 0, pitch || 0);
    } else this.player.spawn(SPAWN.x, SPAWN.z, SPAWN.yaw, SPAWN.pitch);

    this.ui = new UI(this, this.uiRoot);
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing' && !this.ui.open) this.pause();
    };
    this.systems.push(this.terrain, this.vegetation, this.grass, this.camp, this.rocks, this.waterfall, this.props);

    this.applySettings();
    this.settings.onChange(() => this.applySettings());
    window.addEventListener('resize', () => this._resize());
    this._resize();

    progress(0.96, 'Warming up shaders');
    await this._yield();
    this.player._updateCamera(0);
    this.camera.updateMatrixWorld();
    for (const s of this.systems) if (s.update) s.update(0, this);
    this.atmosphere.update(0, this.camera);
    this.atmosphere.updateEnvironment();
    try {
      if (this.renderer.renderer.compileAsync) await this.renderer.renderer.compileAsync(this.scene, this.camera);
      else this.renderer.renderer.compile(this.scene, this.camera);
    } catch { /* compile is only a warm-up */ }
    progress(1, 'Ready');
    this.uiRoot.querySelector('.loading')?.remove();
    this.setState(this.autostart ? 'playing' : 'title');
    if (params.has('item')) for (const id of params.get('item').split(',')) this.inventory.add(id);
    this.clock = performance.now();
    requestAnimationFrame((t) => this._frame(t));
  }

  _wirePlayer() {
    const p = this.player;
    p.onStep = (surface, pos, side, speed) => {
      const vol = 0.25 + speed * 0.45;
      this.audio.step(surface, vol);
      if (surface === 'sand') this.footprints.add(pos.x, pos.z, p.yaw, side, this.time);
      if (surface === 'water' && Math.random() < 0.6) this.particles.spray(pos.x, this.ocean.heightAt(pos.x, pos.z), pos.z, p.vel.x * 0.3, 0.6, p.vel.z * 0.3, 2);
    };
    p.onLand = (surface, intensity) => this.audio.step(surface, 0.5 + intensity * 0.5);
    p.onSplash = (x, z, s) => this.ripples.addDrop(x, z, 0.5, s);
    let boundaryCool = 0;
    p.onBoundary = () => {
      const now = performance.now();
      if (now - boundaryCool > 15000) { boundaryCool = now; this.toast('The current pushes back towards the island.'); }
    };
  }

  _progress(p, label) {
    let el = this.uiRoot.querySelector('.loading');
    if (!el) {
      el = document.createElement('div');
      el.className = 'loading';
      el.innerHTML = '<div class="loading-title">TIDEMARK</div><div class="loading-bar"><span></span></div><div class="loading-label"></div>';
      this.uiRoot.appendChild(el);
    }
    el.querySelector('.loading-bar span').style.width = `${Math.round(p * 100)}%`;
    el.querySelector('.loading-label').textContent = label;
  }

  _yield() { return new Promise((r) => setTimeout(r, 0)); }

  _resize() {
    this.renderer.resize();
    this.camera.aspect = this.renderer.size.x / this.renderer.size.y;
    this.camera.updateProjectionMatrix();
  }

  applySettings() {
    const s = this.settings.values;
    const post = POST[s.post] || POST.high;
    const water = WATER[s.water] || WATER.high;
    this.renderer.applySettings({
      renderScale: s.renderScale, ssao: post.ssao, bloom: post.bloom, fxaa: post.fxaa, sharpen: post.sharpen,
      reflections: water.reflections, reflectionScale: water.reflectionScale,
    });
    this.atmosphere.setShadowQuality(s.shadows);
    this.ocean.setQuality(water.grid);
    this.ripples.resize(water.ripples);
    this.input.sensitivity = s.sensitivity;
    this.input.invertY = s.invertY;
    this.camera.fov = s.fov;
    if (this.tools) this.tools.baseFov = s.fov;
    this.camera.updateProjectionMatrix();
    this.vegetationQuality = VEGETATION[s.vegetation] || VEGETATION.high;
    this.particles.quality = s.vegetation === 'low' ? 0.5 : s.vegetation === 'medium' ? 0.75 : 1;
    for (const sys of this.systems) if (sys.applySettings) sys.applySettings(s, this);
    this._resize();
  }

  // ------------------------------------------------------------------ flow
  setState(s) {
    this.state = s;
    this.ui?.setState(s);
  }

  start() {
    if (this.state !== 'title') return;
    this.audio.unlock();
    this.input.lock();
    this.setState('playing');
    setTimeout(() => this.toast('Look around. E to interact with things that catch your eye.'), 1500);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.input.unlock();
    this.setState('paused');
  }

  resume() {
    this.ui.closeAll(false);
    this.input.lock();
    this.audio.unlock();
    this.setState('playing');
  }

  restart() {
    this.ui.closeAll(false);
    if (this.boat.occupied) this.boat.exit(this);
    this.player.spawn(SPAWN.x, SPAWN.z, SPAWN.yaw, SPAWN.pitch);
    this.setTime(9.7);
    this.weather.set('CLEAR', true);
    this.weather.wetness = 0;
    this.resume();
  }

  setMenuOpen(open) {
    if (open) {
      this.state = 'menu';
      this.input.unlock();
    } else {
      this.state = 'playing';
      this.input.lock();
    }
    this.ui.hud.classList.toggle('show', !open);
  }

  toast(text) { this.ui?.toast(text); }

  // ------------------------------------------------------------------ actions
  pickUp(id) {
    const item = this.camp.items[id];
    if (!item) return;
    const target = item.group.getWorldPosition(new THREE.Vector3());
    this.rig.play('grab', {
      target, duration: 0.55,
      onPeak: () => {
        item.group.visible = false;
        if (item.interactable) item.interactable.enabled = false;
        this.inventory.add(id);
        if (!ITEMS[id].hold) this.toast(`${ITEMS[id].name} added. ${ITEMS[id].desc}`);
        this.audio.play(id === 'lantern' || id === 'mug' ? 'knock' : 'cloth', { volume: 0.4 });
      },
    });
  }

  putDown() {
    const id = this.inventory.equipped;
    const item = this.camp.items[id];
    if (!id || !item) {
      if (id) this.toast('Nowhere to put that down — Q to stow it.');
      return;
    }
    // march along the view ray for a surface within reach
    const cam = this.camera;
    const dir = cam.getWorldDirection(new THREE.Vector3());
    let spot = null;
    for (let d = 0.4; d <= 2.6; d += 0.05) {
      const p = cam.position.clone().addScaledVector(dir, d);
      const g = this.collision.ground(p.x, p.z, p.y + 0.02, 0);
      if (p.y <= g.y + 0.02) { spot = new THREE.Vector3(p.x, g.y, p.z); break; }
    }
    if (!spot) {
      const p = this.player.pos.clone().add(new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(0.7));
      const g = this.collision.ground(p.x, p.z, this.player.pos.y + 0.5, 0);
      spot = new THREE.Vector3(p.x, g.y, p.z);
    }
    if (this.ocean.heightAt(spot.x, spot.z) > spot.y + 0.02) { this.toast('Better not drop that in the water.'); return; }
    this.rig.play('reach', {
      target: spot.clone(), duration: 0.5,
      onPeak: () => {
        this.inventory.remove(id);
        item.group.position.copy(spot);
        item.group.rotation.set(0, this.player.yaw + Math.PI, 0);
        item.group.visible = true;
        item.group.traverse((o) => { if (o.isMesh || o.isGroup) o.layers.set(LAYER.DETAIL); });
        if (item.interactable) item.interactable.enabled = true;
        this.audio.play('knock', { position: spot, volume: 0.35 });
      },
    });
  }

  inspectMap() { this.ui.openMap(); }

  async rest() {
    if (this.state !== 'playing') return;
    const h = this.timeOfDay.hour;
    const target = h >= 5 && h < 16 ? 17.1 : 6.3;
    this.state = 'menu';
    this.ui.setFade(1);
    await new Promise((r) => setTimeout(r, 900));
    this.setTime(target);
    if (this.weather.state === 'STORM') this.weather.set('CLOUDY', true);
    await new Promise((r) => setTimeout(r, 500));
    this.ui.setFade(0);
    this.state = 'playing';
    this.toast(target > 12 ? 'You doze through the heat of the day.' : 'You sleep to the sound of the surf.');
  }

  _handleInput() {
    const inp = this.input;
    if (inp.wasPressed('debug')) this.ui.toggleDebug();
    if (inp.wasPressed('hideHud')) this.ui.root.classList.toggle('hide-hud');
    if (this.state === 'menu') {
      if (inp.wasPressed('inventory') && this.ui.open === 'inv') this.ui.closeAll();
      else if (inp.wasPressed('notebook') && this.ui.open === 'note') this.ui.closeAll();
      else if (inp.wasPressed('map') && this.ui.open === 'map') this.ui.closeAll();
      return;
    }
    if (this.state !== 'playing') return;
    if (inp.wasPressed('timeBack')) this.setTime(this.timeOfDay.hour - 1);
    if (inp.wasPressed('timeFwd')) this.setTime(this.timeOfDay.hour + 1);
    if (this.player.mode === 'boat') return; // the boat handles its own input
    if (inp.wasPressed('interact')) this.interaction.trigger('primary');
    if (inp.wasPressed('use')) { if (!this.interaction.trigger('secondary')) this.tools.use(); }
    if (inp.mousePressed[0] && (inp.locked || this.autostart)) this.tools.use();
    if (inp.wasPressed('drop')) this.putDown();
    if (inp.wasPressed('stow')) this.inventory.unequip();
    if (inp.wasPressed('inventory')) this.ui.openInventory();
    if (inp.wasPressed('map')) { if (this.inventory.has('map')) this.ui.openMap(); else this.toast('The survey chart is on the camp table.'); }
    if (inp.wasPressed('notebook')) { if (this.inventory.has('notebook')) this.ui.openNotebook(); else this.toast('The field notebook is on the camp table.'); }
    // number keys equip items quickly
    const order = ['lantern', 'flashlight', 'compass', 'camera', 'binoculars', 'mug', 'pebble'];
    for (let i = 0; i < 7; i++) if (inp.pressed.has(`Digit${i + 1}`) && this.inventory.has(order[i])) this.inventory.equip(order[i]);
  }

  _frame(now) {
    requestAnimationFrame((t) => this._frame(t));
    let dt = (now - this.clock) / 1000;
    this.clock = now;
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 0.1);
    this.perf.begin(now);
    this.update(dt);
    this.render();
    this.perf.end(performance.now());
    this.input.endFrame();
  }

  update(dt) {
    this._handleInput();
    const playing = this.state === 'playing';
    const simDt = this.state === 'paused' || this.state === 'menu' ? 0 : dt;
    this.time += simDt;
    U.uTime.value = this.time;

    this.timeOfDay.update(simDt);
    this.weather.update(simDt);

    if (playing && this.player.mode !== 'boat') {
      this.player.look(dt, this.input.locked || this.autostart);
      this.player.update(dt);
    } else if (this.state === 'title') {
      this.player._updateCamera(dt);
      this.camera.rotation.y = SPAWN.yaw + Math.sin(this.time * 0.05) * 0.06;
    } else if (this.state !== 'playing') {
      this.input.consumeMouse();
    }
    this.boat.update(simDt, this);
    U.uPlayerPos.value.copy(this.player.pos);
    this.camera.updateMatrixWorld();

    this.atmosphere.update(simDt, this.camera);
    this.ocean.update(this.camera, this.weather.p.waves, this.weather.p.wind);
    this.ripples.update(simDt, this.camera.position.x, this.camera.position.z);
    this.sky.update(this.camera);
    this.clouds.update(simDt, this.camera);
    this.distant.update(this.camera);

    const cp = this.camera.position;
    this.waterYAtCamera = this.ocean.heightAt(cp.x, cp.z);
    U.uUnderwater.value = cp.y < this.waterYAtCamera - 0.02 ? 1 : 0;

    this.interaction.update(simDt, this);
    for (const sys of this.systems) if (sys.update) sys.update(simDt, this);
    this.pebbles.update(simDt, this);
    this.wildlife.update(simDt, this);
    this.collectibles.update(simDt, this);
    this.tools.update(dt);
    this.rig.update(dt, this);
    this.particles.update(simDt);
    this.rain.update();
    if (this.camp.state.fireLit) this.particles.fire(this.camp.firePos, 1, simDt);
    this.audio.update(dt, this);
    this.ui.update(dt);
  }

  render() {
    this.renderer.render({ scene: this.scene, camera: this.camera, water: this.ocean, waterYAtCamera: this.waterYAtCamera, time: this.time });
    if (this.tools.photoPending) {
      this.tools.photoPending = false;
      const url = this.renderer.snapshot(420);
      const caption = `${this.timeOfDay.clock} · ${this.weather.label.toLowerCase()}`;
      this.inventory.photos.push({ url, caption });
      this.ui.photoFlash();
      this.toast('Photograph taken. See it in the inventory (Tab).');
    }
  }

  // ------------------------------------------------------------- debug helpers
  setTime(h) { this.timeOfDay.setHour(h); this.atmosphere.update(0, this.camera); this.atmosphere.updateEnvironment(); }
  setWeather(w, instant = true) { this.weather.set(w, instant); }
  lookAt(x, y, z) {
    const e = this.camera.position;
    this.player.yaw = Math.atan2(-(x - e.x), -(z - e.z));
    this.player.pitch = Math.atan2(y - e.y, Math.hypot(x - e.x, z - e.z));
    this.player._updateCamera(0);
    this.camera.updateMatrixWorld();
  }

  teleport(x, z, yaw = this.player.yaw, pitch = 0) { if (this.boat.occupied) this.boat.exit(this); this.player.spawn(x, z, yaw, pitch); }
}
