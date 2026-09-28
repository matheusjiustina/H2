import * as THREE from 'three';
import { glowTexture, beamTexture, coinFace } from './textures.js';
import { Particles } from './particles.js';
import { ease } from '../utils/math.js';

/**
 * Short-lived visual effects: light rings on the soil, flashes, beams,
 * the falling seed capsule and the harvest token. All pooled and cheap.
 */
export class Fx {
  constructor(scene, tweens) {
    this.scene = scene;
    this.tweens = tweens;
    this.glow = new Particles(700, { additive: true });
    this.dirt = new Particles(220, { additive: false });
    scene.add(this.glow.points, this.dirt.points);

    this.ringGeo = new THREE.RingGeometry(0.86, 1, 56);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.ringPool = [];
    this.spritePool = [];
    this.beamGeo = new THREE.CylinderGeometry(0.6, 0.75, 1, 24, 1, true);
    this.beamGeo.translate(0, 0.5, 0);
    this.coinGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.06, 48);
    this.coinGeo.rotateX(Math.PI / 2);
    this.coinRimGeo = new THREE.TorusGeometry(0.305, 0.022, 8, 48);
    this.coinFaceGeo = new THREE.CircleGeometry(0.296, 48);
    this.coinFaces = new Map();
  }

  setScale(hPx, fov) {
    this.glow.setScale(hPx, fov);
    this.dirt.setScale(hPx, fov);
  }

  update(dt) {
    this.glow.update(dt);
    this.dirt.update(dt);
  }

  /* ------------------------------------------------------ primitives */

  _ring() {
    let m = this.ringPool.find((r) => !r.visible);
    if (!m) {
      m = new THREE.Mesh(
        this.ringGeo,
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      );
      m.renderOrder = 6;
      this.scene.add(m);
      this.ringPool.push(m);
    }
    m.visible = true;
    return m;
  }

  ring(pos, color, { radius = 1, dur = 0.8, y = 0.31, opacity = 0.8 } = {}) {
    const m = this._ring();
    m.material.color.set(color);
    m.position.set(pos.x, y, pos.z);
    this.tweens.add({
      dur,
      update: (k) => {
        const s = 0.1 + ease.outCubic(k) * radius;
        m.scale.set(s, 1, s);
        m.material.opacity = opacity * (1 - ease.inQuad(k));
      },
      done: () => (m.visible = false),
    });
    return m;
  }

  /** A thin light ring that travels up through a plant. */
  scan(base, height, color, { dur = 0.9, radius = 0.32 } = {}) {
    const m = this._ring();
    m.material.color.set(color);
    m.material.opacity = 0;
    m.position.copy(base);
    this.tweens.add({
      dur,
      update: (k) => {
        const e = ease.inOutSine(k);
        m.position.y = base.y + e * height;
        const s = radius * (1 - e * 0.55);
        m.scale.set(s, 1, s);
        m.material.opacity = Math.sin(k * Math.PI) * 0.9;
      },
      done: () => (m.visible = false),
    });
  }

  flash(pos, color, { size = 1.5, dur = 0.5, opacity = 1 } = {}) {
    let s = this.spritePool.find((p) => !p.visible);
    if (!s) {
      s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      s.renderOrder = 12;
      this.scene.add(s);
      this.spritePool.push(s);
    }
    s.visible = true;
    s.material.color.set(color);
    s.position.copy(pos);
    this.tweens.add({
      dur,
      update: (k) => {
        s.scale.setScalar(size * (0.5 + ease.outCubic(k) * 0.7));
        s.material.opacity = opacity * (1 - k) * (k < 0.15 ? k / 0.15 : 1);
      },
      done: () => (s.visible = false),
    });
  }

  beam(pos, color, { height = 3.2, dur = 0.9, opacity = 0.5 } = {}) {
    const mat = new THREE.MeshBasicMaterial({
      map: beamTexture(),
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const m = new THREE.Mesh(this.beamGeo, mat);
    m.position.set(pos.x, 0.3, pos.z);
    m.scale.set(0.45, height, 0.45);
    m.renderOrder = 8;
    this.scene.add(m);
    this.tweens.add({
      dur,
      update: (k) => {
        mat.opacity = opacity * Math.sin(k * Math.PI);
        const w = 0.45 - k * 0.25;
        m.scale.set(w, height, w);
      },
      done: () => {
        this.scene.remove(m);
        mat.dispose();
      },
    });
  }

  /* ------------------------------------------------- seed drop sequence */

  /**
   * Capsule falls onto the plot → soft impact → particles → ring of light.
   * Timeline (s): 0 fall · 0.62 impact · 0.85 hand-off to the plant's own seed.
   */
  dropSeed(plot, stock, onImpact) {
    const pos = plot.group.position;
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.075, 0.1, 6, 12),
      new THREE.MeshStandardMaterial({ color: stock.color, metalness: 0.7, roughness: 0.25, emissive: stock.color, emissiveIntensity: 0.25 }),
    );
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.079, 0.079, 0.022, 16), new THREE.MeshBasicMaterial({ color: stock.accent }));
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: stock.accent, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    halo.scale.setScalar(0.7);
    body.castShadow = true;
    g.add(body, band, halo);
    g.rotation.z = 0.25;
    this.scene.add(g);
    const startY = 3.6;
    const landY = 0.4;
    this.beam(pos, stock.color, { height: 3.4, dur: 0.9, opacity: 0.22 });

    this.tweens.add({
      dur: 0.62,
      update: (k) => {
        const e = ease.inCubic(k);
        g.position.set(pos.x, startY + (landY - startY) * e, pos.z);
        g.rotation.y = k * 4;
        g.scale.set(1 - k * 0.1, 1 + k * 0.25, 1 - k * 0.1);
        if (Math.random() < 0.6) {
          this.glow.emit({ pos: g.position, count: 1, color: stock.accent, speed: 0.05, life: 0.45, size: 0.05, up: 0.2 });
        }
      },
      done: () => {
        onImpact?.();
        const p = new THREE.Vector3(pos.x, 0.34, pos.z);
        this.glow.emit({ pos: p, count: 26, color: [stock.color, stock.accent, '#ffffff'], speed: 1.5, up: 0.9, spread: 1, life: 0.8, size: 0.07, gravity: 2.6, drag: 2.2 });
        this.dirt.emit({ pos: p, count: 18, color: ['#3a2c20', '#2a2019', '#4a3a2b'], speed: 1.4, up: 1.2, spread: 0.9, life: 0.9, size: 0.06, gravity: 6, drag: 1.2, floorY: 0.31, alpha: 0.95 });
        this.ring(pos, stock.color, { radius: 0.85, dur: 0.9, opacity: 0.9 });
        this.tweens.add({ delay: 0.12, dur: 0.001, done: () => this.ring(pos, '#ffffff', { radius: 0.55, dur: 0.7, opacity: 0.4 }) });
        this.flash(p, stock.accent, { size: 1.4, dur: 0.45 });
        // squash & settle, then disappear into the plant's own seed part
        this.tweens.add({
          dur: 0.26,
          update: (k) => {
            const s = Math.sin(k * Math.PI);
            g.position.y = landY - 0.3 * ease.outCubic(k) + 0.0;
            g.scale.set(1 + s * 0.25, 1 - s * 0.3, 1 + s * 0.25);
            halo.material.opacity = 1 - k;
          },
          done: () => {
            this.scene.remove(g);
            body.geometry.dispose();
            body.material.dispose();
            band.geometry.dispose();
            band.material.dispose();
            halo.material.dispose();
          },
        });
      },
    });
  }

  /* --------------------------------------------------- harvest token */

  coinTexture(stock) {
    if (!this.coinFaces.has(stock.id)) this.coinFaces.set(stock.id, coinFace(stock.id, stock.ui[0], stock.ui[1]));
    return this.coinFaces.get(stock.id);
  }

  /** Creates the floating [TICKER] coin. Caller animates it. */
  token(stock) {
    const g = new THREE.Group();
    const face = this.coinTexture(stock);
    const sideMat = new THREE.MeshStandardMaterial({ color: stock.ui[0], metalness: 0.9, roughness: 0.25 });
    const faceMat = new THREE.MeshStandardMaterial({ map: face, emissiveMap: face, emissive: '#ffffff', emissiveIntensity: 0.55, metalness: 0.3, roughness: 0.35 });
    const coin = new THREE.Mesh(this.coinGeo, sideMat);
    // Separate front/back faces so the ticker reads correctly from both sides.
    const front = new THREE.Mesh(this.coinFaceGeo, faceMat);
    front.position.z = 0.031;
    const back = new THREE.Mesh(this.coinFaceGeo, faceMat);
    back.position.z = -0.031;
    back.rotation.y = Math.PI;
    coin.add(front, back);
    const rim = new THREE.Mesh(this.coinRimGeo, new THREE.MeshBasicMaterial({ color: stock.accent }));
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: stock.accent, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    halo.scale.setScalar(1.7);
    halo.renderOrder = 11;
    g.add(halo, coin, rim);
    g.userData.dispose = () => {
      sideMat.dispose();
      faceMat.dispose();
      rim.material.dispose();
      halo.material.dispose();
    };
    g.userData.halo = halo;
    this.scene.add(g);
    return g;
  }
}
