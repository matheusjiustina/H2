import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { materials, glowSprite } from './materials.js';
import { textPlate } from './textures.js';
import { damp, Spring } from '../utils/math.js';

/**
 * Harvest Vault — a mini futuristic silo. Its glass window fills up
 * as you harvest; its LED ring flashes whenever a token arrives.
 */
export class Vault {
  constructor({ x, z }) {
    const M = materials();
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    this.body = new THREE.Group();
    this.group.add(this.body);

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.08, 40), M.darkMetal);
    pad.position.y = 0.04;
    pad.receiveShadow = true;
    this.group.add(pad);
    const padRing = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.012, 6, 60), M.led);
    padRing.rotation.x = Math.PI / 2;
    padRing.position.y = 0.085;
    this.group.add(padRing);
    this.padRing = padRing;

    const shell = new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.85, roughness: 0.28 });
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 1.2, 40, 1, true), shell);
    cyl.position.y = 0.68;
    cyl.castShadow = true;
    cyl.receiveShadow = true;
    this.body.add(cyl);
    const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.5, 0.14, 40), M.darkMetal);
    baseRing.position.y = 0.14;
    baseRing.castShadow = true;
    this.body.add(baseRing);

    // Dome cap
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), shell);
    dome.position.y = 1.28;
    dome.castShadow = true;
    this.body.add(dome);
    this.lid = new THREE.Group();
    this.lid.position.y = 1.66;
    this.body.add(this.lid);
    const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.1, 24), M.darkMetal);
    this.lid.add(intake);
    this.intakeGlowMat = new THREE.MeshBasicMaterial({ color: '#8ff5dc' });
    const intakeTop = new THREE.Mesh(new THREE.CircleGeometry(0.095, 24), this.intakeGlowMat);
    intakeTop.rotation.x = -Math.PI / 2;
    intakeTop.position.y = 0.051;
    this.lid.add(intakeTop);

    // Panel bands
    for (const y of [0.42, 0.98]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.435, 0.435, 0.05, 40), M.darkMetal);
      band.position.y = y;
      this.body.add(band);
    }

    // LED ring (flashes on receive)
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#8ff5dc' });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.018, 8, 64), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.28;
    this.body.add(ring);

    // Glass fill window (front) — grows with total harvests.
    const winGroup = new THREE.Group();
    winGroup.position.set(0, 0.7, 0);
    winGroup.rotation.y = 0.35;
    this.body.add(winGroup);
    const frame = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.62, 0.08, 2, 0.03), M.darkMetal);
    frame.position.z = 0.43;
    winGroup.add(frame);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.54), M.glass);
    glass.position.z = 0.475;
    winGroup.add(glass);
    this.fillMat = new THREE.MeshBasicMaterial({ color: '#7fe6c6', transparent: true, opacity: 0.85 });
    this.fill = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.52), this.fillMat);
    this.fill.geometry.translate(0, 0.26, 0);
    this.fill.position.set(0, -0.26, 0.472);
    this.fill.scale.y = 0.02;
    winGroup.add(this.fill);
    this.fillLevel = 0;
    this.fillTarget = 0;

    // Label plate
    const plate = textPlate('VAULT', { w: 256, h: 72, bg: '#0f1318', fg: '#dfe6ee', font: '700 40px "Space Grotesk", system-ui, sans-serif' });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.096), new THREE.MeshBasicMaterial({ map: plate.texture, toneMapped: false }));
    label.position.set(0, 0.3, 0);
    label.rotation.y = 0.35;
    const lp = new THREE.Group();
    lp.add(label);
    label.position.z = 0.475;
    lp.position.y = 0;
    this.body.add(lp);

    // Side pipe into the vault
    const pipe = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 24, Math.PI / 2), M.pipe);
    pipe.position.set(-0.42, 1.0, 0);
    pipe.rotation.set(0, Math.PI / 2, Math.PI);
    this.body.add(pipe);

    // Vertical light strips around the body.
    this.stripMat = new THREE.MeshBasicMaterial({ color: '#8ff5dc' });
    const stripGeo = new THREE.BoxGeometry(0.018, 0.42, 0.018);
    for (const a of [-0.9, 1.6, 2.6, 3.9]) {
      const st = new THREE.Mesh(stripGeo, this.stripMat);
      st.position.set(Math.sin(a) * 0.438, 0.7, Math.cos(a) * 0.438);
      this.body.add(st);
    }

    // Holographic rings hovering above the dome.
    this.holo = new THREE.Group();
    this.holo.position.y = 1.95;
    this.group.add(this.holo);
    this.holoMat = new THREE.MeshBasicMaterial({
      color: '#8ff5dc',
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.holoRings = [0.26, 0.19].map((r, i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 6, 64), this.holoMat);
      ring.rotation.x = Math.PI / 2 + (i ? -0.35 : 0.25);
      this.holo.add(ring);
      return ring;
    });

    this.glow = glowSprite('#8ff5dc', 1.6, 0);
    this.glow.position.y = 1.7;
    this.group.add(this.glow);

    this.hit = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.9, 12), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = 0.95;
    this.hit.userData.vault = this;
    this.group.add(this.hit);

    this.flash = 0;
    this.hover = false;
    this.squash = new Spring(260, 9, 1);
    this.lidPop = new Spring(260, 8, 0);
    this.baseColor = new THREE.Color('#8ff5dc');
    this.flashColor = new THREE.Color('#ffffff');
  }

  /** World position where tokens fly into. */
  intake(out) {
    return out.set(this.group.position.x, 1.75, this.group.position.z);
  }

  setTotal(total) {
    this.fillTarget = Math.min(1, total / 24);
  }

  receive(color) {
    this.flash = 1;
    this.flashColor.set(color);
    this.squash.kick(-2.4);
    this.lidPop.kick(1.8);
  }

  update(dt, t) {
    this.flash = Math.max(0, this.flash - dt * 1.8);
    const sq = this.squash.update(dt);
    this.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    this.lid.position.y = 1.66 + this.lidPop.update(dt) * 0.05;
    const idle = 0.55 + 0.15 * Math.sin(t * 1.6) + (this.hover ? 0.35 : 0);
    this.ringMat.color.copy(this.baseColor).lerp(this.flashColor, this.flash).multiplyScalar(idle + this.flash * 1.6);
    this.intakeGlowMat.color.copy(this.baseColor).lerp(this.flashColor, this.flash).multiplyScalar(0.6 + this.flash * 1.5);
    this.glow.material.color.copy(this.baseColor).lerp(this.flashColor, this.flash);
    this.glow.material.opacity = this.flash * 0.9 + (this.hover ? 0.18 : 0);
    this.stripMat.color.copy(this.ringMat.color).multiplyScalar(0.8);
    this.holoRings[0].rotation.z += dt * 0.7;
    this.holoRings[1].rotation.z -= dt * 1.1;
    this.holo.position.y = 1.95 + Math.sin(t * 1.4) * 0.03 + this.flash * 0.1;
    this.holo.scale.setScalar(1 + this.flash * 0.35);
    this.holoMat.color.copy(this.baseColor).lerp(this.flashColor, this.flash);
    this.holoMat.opacity = 0.32 + 0.1 * Math.sin(t * 2.3) + this.flash * 0.6 + (this.hover ? 0.2 : 0);
    this.fillLevel = damp(this.fillLevel, this.fillTarget, 3, dt);
    this.fill.scale.y = Math.max(0.03, this.fillLevel);
    this.fillMat.opacity = 0.65 + 0.2 * Math.sin(t * 2) + this.flash * 0.3;
  }
}
