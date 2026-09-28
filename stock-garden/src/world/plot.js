import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { materials } from './materials.js';
import { textPlate, glowTexture } from './textures.js';
import { LAYOUT } from '../config/game.js';
import { damp, Spring } from '../utils/math.js';

const S = LAYOUT.plotSize;
let shared = null;

function sharedGeo() {
  if (shared) return shared;
  const off = S / 2 - 0.06;
  const rimX = new RoundedBoxGeometry(S, 0.09, 0.12, 2, 0.03);
  const rimZ = new RoundedBoxGeometry(0.12, 0.09, S - 0.24, 2, 0.03);
  const rims = [];
  for (const sz of [-1, 1]) {
    rims.push(rimX.clone().translate(0, 0.3, sz * off), rimZ.clone().translate(sz * off, 0.3, 0));
  }
  shared = {
    base: new RoundedBoxGeometry(S, 0.26, S, 3, 0.06),
    rimFrame: mergeGeometries(rims),
    soil: new THREE.BoxGeometry(S - 0.24, 0.06, S - 0.24),
    led: new THREE.BoxGeometry(S * 0.5, 0.022, 0.012),
    plate: new RoundedBoxGeometry(0.42, 0.15, 0.03, 2, 0.012),
    plateFace: new THREE.PlaneGeometry(0.39, 0.125),
    nozzle: new THREE.CylinderGeometry(0.02, 0.028, 0.12, 8),
    glowPlane: new THREE.PlaneGeometry(S * 1.05, S * 1.05),
    hit: new THREE.BoxGeometry(S, 0.5, S),
    plantHit: new THREE.BoxGeometry(1.0, 2.0, 1.0),
  };
  return shared;
}

/**
 * One planter bed: metal base, soil, LED strip, a little sign, irrigation nozzles.
 * The plant (if any) lives in `this.plantHost` at soil level.
 */
export class Plot {
  constructor(index, { x, z }) {
    const g = sharedGeo();
    const M = materials();
    this.index = index;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    this.bed = new THREE.Group();
    this.group.add(this.bed);

    const base = new THREE.Mesh(g.base, M.bed);
    base.position.y = 0.13;
    base.castShadow = true;
    base.receiveShadow = true;
    this.bed.add(base);

    const rim = new THREE.Mesh(g.rimFrame, M.rim);
    rim.castShadow = true;
    rim.receiveShadow = true;
    this.bed.add(rim);

    this.soil = new THREE.Mesh(g.soil, M.soil);
    this.soil.position.y = 0.27;
    this.soil.receiveShadow = true;
    this.bed.add(this.soil);

    // LED strip on the front face — dim idle, brighter on hover, stock colour when planted.
    this.ledMat = new THREE.MeshBasicMaterial({ color: '#2b5f57', transparent: true, opacity: 1 });
    const led = new THREE.Mesh(g.led, this.ledMat);
    led.position.set(0.22, 0.16, S / 2 + 0.002);
    this.bed.add(led);
    const ledBack = led.clone();
    ledBack.rotation.y = Math.PI / 2;
    ledBack.position.set(S / 2 + 0.002, 0.16, 0);
    ledBack.scale.x = 1.2;
    this.bed.add(ledBack);

    // Soft light pooled on the soil (hover / selection / ready).
    this.soilGlowMat = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: '#9ff5e0',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const soilGlow = new THREE.Mesh(g.glowPlane, this.soilGlowMat);
    soilGlow.rotation.x = -Math.PI / 2;
    soilGlow.position.y = 0.305;
    soilGlow.renderOrder = 4;
    this.bed.add(soilGlow);

    // Name plate on the front of the planter.
    const plate = new THREE.Mesh(g.plate, M.darkMetal);
    plate.position.set(-S / 2 + 0.34, 0.15, S / 2 + 0.012);
    this.bed.add(plate);
    this.sign = textPlate('—', { w: 256, h: 88, fg: '#58616d' });
    const face = new THREE.Mesh(g.plateFace, new THREE.MeshBasicMaterial({ map: this.sign.texture, toneMapped: false }));
    face.position.set(0, 0, 0.0161);
    plate.add(face);
    this.plate = plate;

    // Irrigation nozzles on the back corners.
    this.nozzles = [];
    for (const sx of [-1, 1]) {
      const n = new THREE.Mesh(g.nozzle, M.pipe);
      n.position.set(sx * (S / 2 - 0.14), 0.4, -S / 2 + 0.06);
      n.rotation.x = 0.5;
      this.group.add(n);
      this.nozzles.push(n);
    }

    // Invisible hit volumes for pointer picking: the bed itself, plus a
    // slimmer column around the plant (only pickable while something grows),
    // so a tall plant in front doesn't steal clicks meant for the bed behind.
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hit = new THREE.Mesh(g.hit, hitMat);
    this.hit.position.y = 0.2;
    this.hit.userData.plot = this;
    this.group.add(this.hit);
    this.plantHit = new THREE.Mesh(g.plantHit, hitMat);
    this.plantHit.position.y = 1.3;
    this.plantHit.userData.plot = this;
    this.group.add(this.plantHit);

    this.plantHost = new THREE.Group();
    this.plantHost.position.y = LAYOUT.soilY;
    this.plantHost.scale.setScalar(LAYOUT.plantScale);
    this.group.add(this.plantHost);

    this.hover = false;
    this.selected = false;
    this.highlight = false;
    this.lit = 0; // intro light-up 0..1
    this.litTarget = 0;
    this.ledColor = new THREE.Color('#8ff5dc');
    this.ledIdle = new THREE.Color('#2b5f57');
    this.readyPulse = 0;
    this.press = new Spring(300, 14, 0);
    this.soilBump = new Spring(380, 10, 1);
    this.glowBoost = 0;
    this._tmp = new THREE.Color();
    this.ready = false;
  }

  setStock(stock) {
    if (stock) {
      this.ledColor.set(stock.color);
      this.sign.draw(stock.id, '#eef2f6', stock.color);
      this.soilGlowMat.color.set(stock.color);
    } else {
      this.ledColor.set('#8ff5dc');
      this.sign.draw('—', '#58616d', null);
      this.soilGlowMat.color.set('#9ff5e0');
    }
  }

  tap() {
    this.press.kick(-2.2);
    this.glowBoost = 1;
  }

  impact() {
    this.soilBump.kick(-5);
    this.press.kick(-1.2);
  }

  update(dt, t) {
    this.lit = damp(this.lit, this.litTarget, 6, dt);
    this.glowBoost = Math.max(0, this.glowBoost - dt * 1.6);
    const y = this.press.update(dt);
    const hoverLift = this.hover ? 0.025 : 0;
    this.bed.position.y = damp(this.bed.position.y, hoverLift, 12, dt) + y * 0.02;
    this.soil.scale.y = this.soilBump.update(dt);

    // LED
    let intensity = 0.25 + (this.hover ? 0.5 : 0) + (this.selected ? 0.6 : 0) + this.glowBoost * 0.6;
    if (this.highlight) intensity += 0.35 + 0.35 * Math.sin(t * 3.2);
    if (this.ready) intensity += 0.35 + 0.3 * Math.sin(t * 3.6);
    intensity *= this.lit;
    this._tmp.copy(this.ledIdle).lerp(this.ledColor, Math.min(1, intensity));
    this.ledMat.color.copy(this._tmp).multiplyScalar(0.35 + Math.min(1.4, intensity));

    // Soil glow
    let glow = (this.hover ? 0.18 : 0) + (this.selected ? 0.35 : 0) + this.glowBoost * 0.45;
    if (this.highlight) glow += 0.16 + 0.12 * Math.sin(t * 3.2);
    if (this.ready) glow += 0.14 + 0.1 * Math.sin(t * 3.6);
    this.soilGlowMat.opacity = damp(this.soilGlowMat.opacity, glow * this.lit, 10, dt);
  }

  worldTop(out, height = 0) {
    return out.set(this.group.position.x, LAYOUT.soilY + height, this.group.position.z);
  }
}

