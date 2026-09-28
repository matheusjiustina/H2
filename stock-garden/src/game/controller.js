import * as THREE from 'three';
import { Plot } from '../world/plot.js';
import { Vault } from '../world/vault.js';
import { Fx } from '../world/fx.js';
import { createEnvironment } from '../world/environment.js';
import { createMotes } from '../world/particles.js';
import { createPlant } from '../plants/index.js';
import { STOCK_MAP } from '../config/stocks.js';
import { LAYOUT, PLOT_POSITIONS } from '../config/game.js';
import { sfx } from '../services/audio.js';
import { damp, ease, rand } from '../utils/math.js';

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const PS = LAYOUT.plantScale;

/**
 * Glue between state (store), the 3D world and the DOM UI.
 * The whole game loop is: SELECT → PLANT → GROW → HARVEST → COLLECT → again.
 */
export class GameController {
  constructor({ stage, store, tweens, ui }) {
    this.stage = stage;
    this.store = store;
    this.tweens = tweens;
    this.ui = ui;
    this.ready = false; // input enabled after the intro
    this.hovered = null;

    const scene = stage.scene;
    this.env = createEnvironment();
    scene.add(this.env.group);

    this.plots = PLOT_POSITIONS.map((p, i) => {
      const plot = new Plot(i, p);
      scene.add(plot.group);
      return plot;
    });
    this.vault = new Vault(LAYOUT.vault);
    scene.add(this.vault.group);
    this.vault.setTotal(store.state.total);
    this.vault.fillLevel = this.vault.fillTarget;

    this.fx = new Fx(scene, tweens);
    this.motes = createMotes(70);
    scene.add(this.motes);

    this.views = this.plots.map((plot, i) => ({
      i,
      plot,
      plant: null,
      mode: 'empty',
      lastStage: -1,
      anchorY: 0.75,
      sparkTimer: rand(0, 0.4),
      moteTimer: rand(0, 1),
      mistTimer: rand(1, 3),
      scanTimer: rand(0.5, 1.5),
      frozenGrowT: 0,
    }));

    // Restore plants that were growing before a reload (no animation replay).
    this.views.forEach((v) => {
      const p = store.state.plots[v.i];
      if (!p.stockId) return;
      this.spawnPlant(v, p.stockId, p.seed);
      const g = store.growth(v.i);
      v.lastStage = g.stage;
      v.mode = g.ready ? 'ready' : 'growing';
      v.plot.ready = g.ready;
    });

    this.setupFit();
    this.bindInput();
    stage.onResizeCb = (w, h) => this.onResize(w, h);
    this.onResize(stage.size.w, stage.size.h);
    stage.onUpdate((dt, t) => this.update(dt, t));
  }

  /* ------------------------------------------------------------ setup */

  setupFit() {
    const pts = [];
    const S = LAYOUT.plotSize / 2;
    for (const p of PLOT_POSITIONS) {
      for (const [dx, dz] of [
        [-S, -S],
        [S, -S],
        [-S, S],
        [S, S],
      ]) {
        pts.push(new THREE.Vector3(p.x + dx, 0, p.z + dz));
        pts.push(new THREE.Vector3(p.x + dx * 0.4, 2.3, p.z + dz * 0.4));
      }
    }
    const { x, z } = LAYOUT.vault;
    pts.push(new THREE.Vector3(x, 2.0, z), new THREE.Vector3(x + 0.6, 0, z + 0.6), new THREE.Vector3(x - 0.6, 0, z + 0.6));
    this.stage.fitPointsPortrait = pts;
    const wide = [...pts];
    for (const [sx, sz] of [
      [-5.3, -3.7],
      [5.3, -3.7],
      [-5.3, 3.7],
      [5.3, 3.7],
    ]) {
      wide.push(new THREE.Vector3(sx, 0, sz), new THREE.Vector3(sx * 0.9, -0.8, sz * 0.9));
    }
    wide.push(new THREE.Vector3(-3.45, 2.8, -2.75), new THREE.Vector3(3.45, 2.8, -2.75));
    this.stage.setFitPoints(wide);
  }

  onResize(w, h) {
    const pxH = h * this.stage.renderer.getPixelRatio();
    this.fx.setScale(pxH, this.stage.camera.fov);
    this.motes.material.uniforms.uScale.value = pxH / (2 * Math.tan((this.stage.camera.fov * Math.PI) / 360));
    if (this.ui.picker.isOpen) {
      const i = this.ui.picker.plot;
      if (this.ui.picker.isSheet()) this.frameForSheet(i);
      else this.ui.picker.position(this.pickerAnchor(i));
    }
  }

  hitTargets() {
    const out = [this.vault.hit];
    for (const v of this.views) {
      out.push(v.plot.hit);
      if (v.plant) out.push(v.plot.plantHit);
    }
    return out;
  }

  bindInput() {
    const canvas = this.stage.canvas;
    let down = null;
    this.pendingHover = null;
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') this.pendingHover = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerleave', () => {
      this.pendingHover = null;
      this.setHover(null);
    });
    canvas.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 700;
      down = null;
      if (moved > 12 || !quick) return;
      const hit = this.stage.pick(e.clientX, e.clientY, this.hitTargets());
      if (!hit) return;
      if (hit.object.userData.plot) this.tapPlot(hit.object.userData.plot.index);
      else if (hit.object.userData.vault) this.openVault();
    });
  }

  /* ---------------------------------------------------------- hover */

  setHover(target) {
    if (this.hovered === target) return;
    const prev = this.hovered;
    if (prev?.plot) {
      prev.plot.hover = false;
      this.ui.markers.setHover(prev.plot.index, false);
    }
    if (prev?.vault) prev.vault.hover = false;
    this.hovered = target;
    if (target?.plot) {
      target.plot.hover = true;
      this.ui.markers.setHover(target.plot.index, true);
      this.views[target.plot.index].plant?.poke(0.45);
    }
    if (target?.vault) target.vault.hover = true;
    this.stage.container.classList.toggle('pointer', !!target);
  }

  hoverPlotFromMarker(i, on) {
    if (!this.ready) return;
    this.setHover(on ? { plot: this.plots[i] } : null);
  }

  /* ---------------------------------------------------------- actions */

  tapPlot(i) {
    if (!this.ready) return;
    const v = this.views[i];
    if (this.ui.vault.isOpen) return;
    if (v.mode === 'empty') this.openPicker(i);
    else if (v.mode === 'growing') this.pokeGrowing(v);
    else if (v.mode === 'ready') this.harvest(v);
  }

  pickerAnchor(i) {
    const plot = this.plots[i];
    const a = this.stage.project(v1.set(plot.group.position.x, 0.95, plot.group.position.z));
    const b = this.stage.project(v2.set(plot.group.position.x, 0.0, plot.group.position.z + LAYOUT.plotSize / 2));
    return { x: a.x, y: a.y, yBelow: b.y + 6 };
  }

  frameForSheet(i) {
    const plot = this.plots[i];
    const h = this.stage.size.h;
    const sheetH = 260;
    // Undo current extra offset to get the plot's natural screen position.
    const p = this.stage.project(v1.set(plot.group.position.x, 0.8, plot.group.position.z));
    const naturalY = p.y + this.stage.rig.extraOffsetY;
    const limit = h - sheetH - 70;
    this.stage.rig.extraOffsetYTarget = Math.max(0, naturalY - limit);
  }

  openPicker(i) {
    const plot = this.plots[i];
    plot.selected = true;
    plot.tap();
    this.fx.ring(plot.group.position, '#8ff5dc', { radius: 0.7, dur: 0.6, opacity: 0.6 });
    sfx.play('uiOpen');
    if (this.ui.picker.isSheet()) this.frameForSheet(i);
    this.ui.picker.open(i, this.pickerAnchor(i));
    this.ui.hud.hint(null);
  }

  onPickerClosed(i, picked) {
    if (i == null) return;
    this.plots[i].selected = false;
    this.stage.rig.extraOffsetYTarget = 0;
    if (!picked) {
      sfx.play('uiClose');
      if (!this.store.state.onboarded) this.ui.hud.hint('PICK A PLOT TO START');
    }
  }

  plant(i, stockId) {
    const v = this.views[i];
    if (v.mode !== 'empty') return;
    const firstEver = !this.store.state.onboarded;
    if (!this.store.plant(i, stockId)) return;
    const stock = STOCK_MAP[stockId];
    const p = this.store.state.plots[i];
    sfx.play('plant');
    v.mode = 'dropping';
    this.ui.markers.setState(i, 'busy');
    this.spawnPlant(v, stockId, p.seed);
    v.lastStage = 0;
    if (firstEver) this.refreshMarkers(true);

    this.fx.dropSeed(v.plot, stock, () => {
      sfx.play('seedImpact');
      v.plot.impact();
      v.plot.setStock(stock);
      this.popSign(v.plot);
      this.stage.rig.shake = 0.03;
    });
    this.tweens.wait(0.9, () => {
      if (v.mode === 'dropping') v.mode = 'growing';
    });
  }

  popSign(plot) {
    this.tweens.add({
      dur: 0.5,
      update: (k) => plot.plate.scale.setScalar(0.4 + 0.6 * ease.outBack(k, 2.4)),
    });
  }

  spawnPlant(v, stockId, seed) {
    const plant = createPlant(stockId, seed);
    v.plant = plant;
    v.plot.plantHost.add(plant.root);
    v.plot.setStock(STOCK_MAP[stockId]);
    plant.root.traverse((o) => {
      if (o.isMesh) o.receiveShadow = false;
    });
  }

  pokeGrowing(v) {
    const plant = v.plant;
    if (!plant) return;
    plant.poke(1.1);
    plant.bounce(0.5);
    v.plot.tap();
    sfx.play('poke');
    this.ui.markers.tick(v.i);
    const stock = plant.stock;
    const h = plant.heightAt(this.store.growth(v.i).elapsed) * PS;
    const pos = v1.set(v.plot.group.position.x, LAYOUT.soilY + h * 0.6, v.plot.group.position.z);
    this.fx.glow.emit({ pos, count: 10, radius: 0.2, color: [stock.color, stock.accent], speed: 0.6, up: 0.8, life: 0.8, size: 0.05, gravity: -0.2, drag: 2 });
  }

  onStageUp(v, stage) {
    const plant = v.plant;
    const stock = plant.stock;
    const base = v.plot.group.position;
    const h = plant.heights[stage] * PS;
    sfx.play('stageUp', { rate: 0.9 + stage * 0.08 });
    plant.bounce(0.35);
    plant.poke(0.35);
    v.plot.soilBump.kick(-2.5);
    this.fx.scan(new THREE.Vector3(base.x, LAYOUT.soilY + 0.02, base.z), h, stock.accent, { dur: 1.0, radius: 0.35 });
    this.fx.flash(v1.set(base.x, LAYOUT.soilY + h * 0.5, base.z), stock.accent, { size: 1.1 + stage * 0.2, dur: 0.6, opacity: 0.6 });
    this.fx.glow.emit({
      pos: v1.set(base.x, LAYOUT.soilY + 0.03, base.z),
      count: 12 + stage * 4,
      radius: 0.45,
      flatY: 0.05,
      color: [stock.color, stock.accent],
      speed: 0.5,
      up: 1,
      spread: 0.4,
      life: 1.3,
      size: 0.055,
      gravity: -0.15,
      drag: 1.2,
    });
    this.fx.dirt.emit({
      pos: v1.set(base.x, LAYOUT.soilY + 0.02, base.z),
      count: 8,
      radius: 0.18,
      color: ['#3a2c20', '#2a2019'],
      speed: 0.9,
      up: 1.2,
      spread: 0.8,
      life: 0.7,
      size: 0.045,
      gravity: 5,
      floorY: 0.305,
    });
  }

  onReady(v) {
    const plant = v.plant;
    const stock = plant.stock;
    const base = v.plot.group.position;
    v.mode = 'ready';
    v.plot.ready = true;
    sfx.play('ready');
    plant.bounce(0.6);
    const h = plant.heights[4] * PS;
    this.fx.scan(new THREE.Vector3(base.x, LAYOUT.soilY, base.z), h + 0.15, '#ffffff', { dur: 1.1, radius: 0.4 });
    this.tweens.wait(0.25, () => this.fx.scan(new THREE.Vector3(base.x, LAYOUT.soilY, base.z), h + 0.1, stock.accent, { dur: 1.1, radius: 0.34 }));
    this.fx.ring(base, stock.color, { radius: 0.95, dur: 1.0, opacity: 0.7 });
    this.fx.glow.emit({
      pos: v1.set(base.x, LAYOUT.soilY + h * 0.7, base.z),
      count: 26,
      radius: 0.35,
      color: [stock.color, stock.accent, '#ffffff'],
      speed: 0.7,
      up: 0.6,
      life: 1.2,
      size: 0.06,
      gravity: -0.1,
      drag: 1.8,
    });
    if (this.store.state.total === 0) this.ui.hud.hint('TAP TO HARVEST');
  }

  harvest(v) {
    const plant = v.plant;
    const g = this.store.growth(v.i);
    if (!plant || !g?.ready) return;
    const stockId = this.store.harvest(v.i);
    if (!stockId) return;
    const stock = STOCK_MAP[stockId];
    v.mode = 'harvesting';
    v.frozenGrowT = g.elapsed;
    v.plot.ready = false;
    this.ui.markers.setState(v.i, 'busy');
    this.ui.hud.hint(null);
    sfx.play('harvest');

    const base = v.plot.group.position.clone();
    const h = plant.heights[4] * PS;
    const mid = new THREE.Vector3(base.x, LAYOUT.soilY + h * 0.55, base.z);
    const focus = new THREE.Vector3(base.x, LAYOUT.soilY + h * 0.6, base.z);

    // 1 · reaction: micro zoom, squash, leaves shake, burst.
    this.stage.focusOn(focus, 1);
    this.tweens.wait(0.85, () => this.stage.focusOn(focus, 0));
    plant.bounce(1.3);
    plant.poke(1.6);
    v.plot.tap();
    v.plot.impact();
    this.fx.flash(mid, stock.accent, { size: 2.4, dur: 0.55, opacity: 0.9 });
    this.fx.ring(base, stock.color, { radius: 1.05, dur: 0.8, opacity: 0.9 });
    this.fx.glow.emit({
      pos: mid,
      count: 44,
      radius: 0.25,
      color: [stock.color, stock.accent, '#ffffff'],
      speed: 2.2,
      up: 0.6,
      spread: 1,
      life: 0.9,
      size: 0.065,
      gravity: 2,
      drag: 2.4,
    });

    // 2 · the token appears and rises, particles converge into it.
    const token = this.fx.token(stock);
    token.position.copy(mid);
    token.scale.setScalar(0.001);
    const riseFrom = mid.y;
    const riseTo = LAYOUT.soilY + h + 0.6;
    // End the spin with the coin face turned toward the camera.
    const cam = this.stage.camera.position;
    const faceYaw = Math.atan2(cam.x - base.x, cam.z - base.z);
    sfx.play('tokenRise');
    this.tweens.add({
      dur: 0.62,
      update: (k) => {
        token.position.y = riseFrom + (riseTo - riseFrom) * ease.outCubic(k);
        token.scale.setScalar(Math.max(0.001, ease.outBack(Math.min(1, k * 1.7), 2)));
        token.rotation.y = faceYaw - (1 - ease.outCubic(k)) * Math.PI * 4;
        token.rotation.z = Math.sin(k * Math.PI) * 0.12;
      },
    });
    this.tweens.wait(0.08, () => {
      this.fx.glow.emit({
        pos: v1.set(base.x, riseTo - 0.15, base.z),
        count: 36,
        radius: 0.95,
        color: [stock.accent, '#ffffff', stock.color],
        speed: 0.15,
        up: 0,
        life: 0.55,
        size: 0.055,
        pull: 30,
        drag: 4.5,
        targetRef: token.position,
        fadeIn: 0.15,
      });
    });

    // 3 · the plant sinks back into the soil; the plot is free again.
    this.tweens.add({
      delay: 0.18,
      dur: 0.5,
      update: (k) => (plant.out = k),
      done: () => {
        plant.dispose();
        if (v.plant === plant) v.plant = null;
        v.plot.setStock(null);
        v.mode = 'empty';
        v.lastStage = -1;
        this.fx.dirt.emit({ pos: v1.set(base.x, LAYOUT.soilY + 0.02, base.z), count: 10, radius: 0.2, color: ['#3a2c20', '#2a2019'], speed: 0.8, up: 1, life: 0.6, size: 0.045, gravity: 5, floorY: 0.305 });
      },
    });

    // 4 · flight into the Harvest Vault.
    const p0 = new THREE.Vector3();
    const p2 = this.vault.intake(new THREE.Vector3());
    const p1 = new THREE.Vector3();
    this.tweens.add({
      delay: 0.66,
      dur: 0.58,
      update: (k) => {
        if (k === 0 || p0.lengthSq() === 0) {
          p0.copy(token.position);
          p1.copy(p0).lerp(p2, 0.5);
          p1.y = Math.max(p0.y, p2.y) + 1.1;
        }
        const e = ease.inOutCubic(k);
        const a = 1 - e;
        token.position.set(
          a * a * p0.x + 2 * a * e * p1.x + e * e * p2.x,
          a * a * p0.y + 2 * a * e * p1.y + e * e * p2.y,
          a * a * p0.z + 2 * a * e * p1.z + e * e * p2.z,
        );
        token.scale.setScalar(1 - 0.65 * ease.inCubic(k));
        token.rotation.y = faceYaw + ease.inCubic(k) * Math.PI * 3;
        this.fx.glow.emit({ pos: token.position, count: 2, radius: 0.06, color: [stock.accent, '#ffffff'], speed: 0.1, life: 0.45, size: 0.05, drag: 3 });
      },
      done: () => {
        token.removeFromParent();
        token.userData.dispose();
        this.vault.receive(stock.accent);
        this.vault.setTotal(this.store.state.total);
        this.fx.flash(p2, stock.accent, { size: 1.6, dur: 0.5 });
        this.fx.glow.emit({ pos: p2, count: 18, color: [stock.accent, '#ffffff'], speed: 1.2, up: 1, life: 0.6, size: 0.05, gravity: 2, drag: 2.5 });
        this.ui.hud.setCount(this.store.state.total, { bump: true, color: stock.ui[0] });
        sfx.play('vault');
      },
    });
  }

  openVault() {
    if (!this.ready) return;
    this.ui.picker.close();
    this.vault.squash.kick(-1.2);
    this.ui.vault.open(this.store.state);
    sfx.play('uiOpen');
  }

  /* ---------------------------------------------------------- intro */

  prepareIntro() {
    this.stage.rig.intro = 0;
    this.plots.forEach((p) => (p.lit = 0));
  }

  playIntro() {
    this.tweens.add({ dur: 2.6, update: (k) => (this.stage.rig.intro = k) });
    this.plots.forEach((p, i) => {
      // Light the plots up one by one.
      this.tweens.wait(0.9 + i * 0.16, () => {
        p.litTarget = 1;
        p.glowBoost = 0.8;
        this.fx.ring(p.group.position, '#8ff5dc', { radius: 0.8, dur: 0.8, opacity: 0.45 });
      });
    });
    this.tweens.wait(1.4, () => this.ui.hud.show());
    this.tweens.wait(2.1, () => {
      this.ready = true;
      this.refreshMarkers();
      this.ui.markers.show();
    });
    this.tweens.wait(2.6, () => {
      const anyPlant = this.store.state.plots.some((p) => p.stockId);
      if (!this.store.state.onboarded || !anyPlant) this.ui.hud.hint('PICK A PLOT TO START');
    });
  }

  refreshMarkers(force = false) {
    const onboarded = this.store.state.onboarded;
    this.views.forEach((v) => {
      if (force) this.ui.markers.setState(v.i, 'busy');
      this.syncMarker(v, onboarded);
    });
  }

  syncMarker(v, onboarded = this.store.state.onboarded) {
    const firstPlot = LAYOUT.firstPlot;
    v.plot.highlight = !onboarded && v.i === firstPlot && v.mode === 'empty';
    if (v.mode === 'empty') {
      this.ui.markers.setState(v.i, 'empty', { first: !onboarded && v.i === firstPlot, quiet: !onboarded && v.i !== firstPlot });
    } else if (v.mode === 'growing') {
      this.ui.markers.setState(v.i, 'growing', { color: v.plant.stock.color });
    } else if (v.mode === 'ready') {
      this.ui.markers.setState(v.i, 'ready', { color: v.plant.stock.ui[0] });
    } else {
      this.ui.markers.setState(v.i, 'busy');
    }
  }

  /* ---------------------------------------------------------- frame */

  update(dt, t) {
    this.tweens.update(dt);
    if (this.pendingHover && this.ready && !this.ui.picker.isOpen && !this.ui.vault.isOpen) {
      const hit = this.stage.pick(this.pendingHover.x, this.pendingHover.y, this.hitTargets());
      this.pendingHover = null;
      if (!hit) this.setHover(null);
      else if (hit.object.userData.plot) this.setHover({ plot: hit.object.userData.plot });
      else this.setHover({ vault: hit.object.userData.vault });
    }

    const now = Date.now();
    for (const v of this.views) {
      v.plot.update(dt, t);
      const plant = v.plant;
      let anchorH = 0.35;
      if (plant) {
        const g = v.mode === 'harvesting' ? null : this.store.growth(v.i, now);
        const growT = g ? g.elapsed : v.frozenGrowT;
        const stage = g ? g.stage : 4;
        plant.update(dt, t, growT, { t, dt, growT, stage, ready: g?.ready });
        if (g && (v.mode === 'growing' || v.mode === 'dropping')) {
          if (stage > v.lastStage && v.lastStage >= 0 && stage < 4) this.onStageUp(v, stage);
          v.lastStage = Math.max(v.lastStage, stage);
          if (g.ready && v.mode === 'growing') this.onReady(v);
          this.ui.markers.setProgress(v.i, g.progress, stage);
          this.ambientGrowth(v, dt, stage);
        } else if (v.mode === 'ready') {
          this.ambientReady(v, dt);
        }
        anchorH = plant.heightAt(growT) * PS + (v.mode === 'ready' ? 0.45 : 0.36);
      }
      if (this.ready) this.syncMarker(v);
      v.anchorY = damp(v.anchorY, LAYOUT.soilY + anchorH, 6, dt);
      const p = this.stage.project(v1.set(v.plot.group.position.x, v.anchorY, v.plot.group.position.z));
      this.ui.markers.place(v.i, p.x, p.y);
    }

    this.vault.update(dt, t);
    this.env.update(dt, t);
    this.fx.update(dt);
    this.motes.material.uniforms.uTime.value = t;
  }

  /** Tiny continuous life while growing: motes from the soil, mist from the nozzles. */
  ambientGrowth(v, dt, stage) {
    const stock = v.plant.stock;
    const base = v.plot.group.position;
    v.moteTimer -= dt;
    if (v.moteTimer <= 0) {
      v.moteTimer = rand(0.35, 0.8);
      this.fx.glow.emit({
        pos: v1.set(base.x, LAYOUT.soilY + 0.03, base.z),
        count: 1,
        radius: 0.55,
        flatY: 0.03,
        color: [stock.color, stock.accent],
        speed: 0.12,
        up: 1,
        spread: 0.3,
        life: 2.2,
        size: 0.045,
        gravity: -0.08,
        drag: 0.6,
        alpha: 0.75,
      });
    }
    v.mistTimer -= dt;
    if (v.mistTimer <= 0 && stage >= 1) {
      v.mistTimer = rand(2.2, 3.6);
      for (const n of v.plot.nozzles) {
        n.getWorldPosition(v2);
        v2.y += 0.06;
        const dir = v1.set(base.x - v2.x, 0, base.z - v2.z).normalize();
        this.fx.glow.emit({
          pos: v2,
          count: 4,
          radius: 0.02,
          color: ['#bdefff', '#8fd8ff'],
          speed: 0.25,
          velocity: { x: dir.x * 0.9, y: 0.9, z: dir.z * 0.9 },
          life: 0.8,
          size: 0.035,
          gravity: 4.5,
          drag: 0.4,
          floorY: LAYOUT.soilY + 0.01,
          alpha: 0.9,
        });
      }
    }
  }

  ambientReady(v, dt) {
    const plant = v.plant;
    const stock = plant.stock;
    v.sparkTimer -= dt;
    if (v.sparkTimer <= 0 && plant.sparkPoints.length) {
      v.sparkTimer = rand(0.25, 0.5);
      const sp = plant.sparkPoints[(Math.random() * plant.sparkPoints.length) | 0];
      sp.getWorldPosition(v2);
      this.fx.glow.emit({ pos: v2, count: 1, radius: 0.1, color: [stock.accent, '#ffffff'], speed: 0.2, up: 1, life: 1.1, size: 0.05, gravity: -0.25, drag: 1 });
    }
    v.scanTimer -= dt;
    if (v.scanTimer <= 0) {
      v.scanTimer = rand(2.4, 3.2);
      const base = v.plot.group.position;
      this.fx.scan(new THREE.Vector3(base.x, LAYOUT.soilY, base.z), plant.heights[4] * PS, stock.accent, { dur: 1.3, radius: 0.34 });
    }
  }
}
