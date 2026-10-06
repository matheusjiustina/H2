import * as THREE from 'three';
import { ITEMS } from './Inventory.js';
import { buildLantern, buildFlashlight, buildCompass, buildCamera, buildMug } from '../environment/PropFactory.js';
import { buildBinoculars } from '../environment/PropFactory.js';
import { damp, clamp } from '../utils/MathUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const E = (x, y, z) => new THREE.Euler(x, y, z, 'YXZ');

// camera-space hold offsets relative to the right wrist
const OFFSETS = {
  lantern: { pos: V(-0.03, -0.31, -0.075), rot: E(0, 0.3, 0) },
  flashlight: { pos: V(-0.02, -0.035, -0.02), rot: E(0.04, Math.PI, 0) },
  compass: { pos: V(0.005, 0.012, -0.075), rot: E(0.35, 0, 0) },
  camera: { pos: V(-0.085, 0.015, -0.035), rot: E(0, Math.PI, 0) },
  binoculars: { pos: V(-0.055, 0.015, -0.04), rot: E(0, 0, 0) },
  mug: { pos: V(-0.03, -0.075, -0.06), rot: E(0, -1.2, 0) },
  pebble: { pos: V(0.0, 0.012, -0.07), rot: E(0.3, 0.4, 0.1) },
};

/** Behaviour + view models of hand-held items. */
export class Tools {
  constructor(game) {
    this.game = game;
    this.models = {};
    this.aim = 0;
    this.baseFov = game.camera.fov;
    this.photoPending = false;
    this.flash = 0;
    this.flashlightOn = false;
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
  }

  _model(id) {
    if (this.models[id]) return this.models[id];
    const M = this.game.materials;
    let built;
    switch (id) {
      case 'lantern': built = buildLantern(M); break;
      case 'flashlight': built = buildFlashlight(M); break;
      case 'compass': built = buildCompass(M); break;
      case 'camera': built = buildCamera(M); break;
      case 'binoculars': built = buildBinoculars(M); break;
      case 'mug': built = buildMug(M); break;
      case 'pebble': {
        const g = new THREE.Group();
        const geo = new THREE.SphereGeometry(0.028, 12, 8);
        geo.scale(1.25, 0.55, 1);
        g.add(new THREE.Mesh(geo, M.pebble));
        built = { group: g };
        break;
      }
      default: return null;
    }
    this.models[id] = built;
    return built;
  }

  equip(id) {
    const m = this._model(id);
    if (!m) { this.game.rig.release(); return; }
    this.game.rig.hold(m.group, OFFSETS[id] || {});
    if (id === 'lantern') {
      const light = this.game.camp.lanternLight;
      m.group.add(light);
      light.position.set(0, 0.16, 0);
    }
    this.game.audio?.play('cloth');
  }

  unequip(id) {
    const rig = this.game.rig;
    rig.release();
    if (id === 'lantern') {
      const camp = this.game.camp;
      this.game.scene.add(camp.lanternLight);
    }
    if (id === 'flashlight') this.flashlightOn = false;
  }

  /** Primary use (F / left click). */
  use() {
    const g = this.game;
    const id = g.inventory.equipped;
    if (!id || g.rig.busy) return;
    const camp = g.camp;
    switch (id) {
      case 'lantern':
        camp.state.lanternLit = !camp.state.lanternLit;
        g.audio?.play(camp.state.lanternLit ? 'ignite' : 'snuff');
        g.rig.play('use', { duration: 0.2 });
        break;
      case 'flashlight':
        this.flashlightOn = !this.flashlightOn;
        g.audio?.play('click');
        g.rig.play('use', { duration: 0.15 });
        break;
      case 'camera':
        this.photoPending = true;
        this.flash = 1;
        g.audio?.play('shutter');
        break;
      case 'mug':
        g.rig.play('drink', { duration: 1.6, onPeak: () => { g.audio?.play('sip'); } });
        break;
      case 'pebble':
        g.rig.play('throw', {
          duration: 0.55,
          onPeak: () => {
            if (!g.inventory.has('pebble')) return;
            const cam = g.camera;
            const dir = cam.getWorldDirection(new THREE.Vector3());
            const origin = cam.position.clone().addScaledVector(dir, 0.4).add(new THREE.Vector3(0, -0.12, 0)).addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x).normalize(), 0.15);
            const speed = 15.5;
            const vel = dir.multiplyScalar(speed).add(new THREE.Vector3(0, 2.2, 0)).add(g.player.vel.clone().multiplyScalar(0.6));
            g.pebbles.throw(origin, vel);
            g.inventory.remove('pebble');
            g.audio?.play('whoosh');
          },
        });
        break;
      default:
        break;
    }
  }

  update(dt) {
    const g = this.game;
    const inv = g.inventory;
    const id = inv.equipped;
    const def = id ? ITEMS[id] : null;
    const aiming = !!(def && def.aim && g.input.mouseDown[2] && g.state === 'playing');
    this.aim = damp(this.aim, aiming ? 1 : 0, 9, dt);
    const targetFov = id === 'binoculars' ? 13 : id === 'camera' ? 42 : this.baseFov;
    const fov = this.baseFov + (targetFov - this.baseFov) * this.aim + g.player.fovKick * 3;
    if (Math.abs(g.camera.fov - fov) > 0.01) { g.camera.fov = fov; g.camera.updateProjectionMatrix(); }
    g.rig.visible = this.aim < 0.9;
    g.ui?.setAimOverlay(this.aim > 0.6 ? id : null);
    g.input.sensitivity = g.settings.get('sensitivity') * (1 - this.aim * (id === 'binoculars' ? 0.8 : 0.4));

    // compass needle points to world north (-Z)
    if (id === 'compass') {
      const m = this.models.compass;
      if (m) {
        m.group.getWorldQuaternion(this._q);
        const yaw = new THREE.Euler().setFromQuaternion(this._q, 'YXZ').y;
        m.needle.rotation.y = damp(m.needle.rotation.y, -yaw + Math.sin(g.time * 3) * 0.02, 6, dt);
      }
    }
    // lantern flame on the view model
    if (this.models.lantern) {
      const lit = g.camp.state.lanternLit;
      this.models.lantern.flame.visible = lit;
      if (lit) this.models.lantern.flame.scale.set(1, 0.9 + Math.sin(g.time * 19) * 0.12, 1);
    }
    // flashlight beam follows the view
    const fl = g.camp.flashlight;
    const on = id === 'flashlight' && this.flashlightOn;
    fl.intensity = damp(fl.intensity, on ? 38 : 0, 20, dt);
    if (this.flash > 0) {
      // camera flash: brief strong burst through the flashlight cone
      fl.intensity = Math.max(fl.intensity, this.flash * 120);
      this.flash = Math.max(0, this.flash - dt * 9);
    }
    // keep the spot shadow pass nearly free while the beam is off (light count stays fixed)
    fl.distance = fl.intensity > 0.01 ? 32 : 0.05;
    if (fl.intensity > 0.01) {
      const cam = g.camera;
      const dir = cam.getWorldDirection(this._v);
      fl.position.copy(cam.position).addScaledVector(dir, 0.25).add(new THREE.Vector3(0, -0.12, 0));
      fl.target.position.copy(cam.position).addScaledVector(dir, 10);
      fl.target.updateMatrixWorld();
    }
    if (this.models.flashlight) this.models.flashlight.lensMat.color.setScalar(on ? 6 : 0.25);
  }
}
