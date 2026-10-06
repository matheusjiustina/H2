import * as THREE from 'three';

/**
 * Anything the player can interact with. The same contract is used by every
 * interactive object in the world (camp props, pebbles, shells, the boat...).
 */
export class Interactable {
  constructor(opts) {
    this.name = '';
    this.object = null; // Object3D used for the ray test (its bounding box)
    this.interactionDistance = 2.5;
    this.interactionLabel = 'Interact';
    this.secondaryLabel = null;
    this.enabled = true;
    this.onInteract = null; // (game) => void
    this.onSecondary = null; // (game) => void
    this.boxPadding = 0.04;
    this.hint = null; // optional reach target (world point) for the hand animation
    Object.assign(this, opts);
    this._box = new THREE.Box3();
  }

  label(game) { return typeof this.interactionLabel === 'function' ? this.interactionLabel(game) : this.interactionLabel; }
  label2(game) { return typeof this.secondaryLabel === 'function' ? this.secondaryLabel(game) : this.secondaryLabel; }

  worldBox() {
    this._box.setFromObject(this.object);
    if (this.boxPadding) this._box.expandByScalar(this.boxPadding);
    return this._box;
  }
}

/** Camera-centred ray picking of interactables + prompt state. */
export class InteractionSystem {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.focus = null;
    this.ray = new THREE.Ray();
    this._hit = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this.hitPoint = new THREE.Vector3();
    this.blocked = false;
  }

  add(it) {
    if (!(it instanceof Interactable)) it = new Interactable(it);
    this.items.push(it);
    return it;
  }

  remove(it) {
    const i = this.items.indexOf(it);
    if (i >= 0) this.items.splice(i, 1);
    if (this.focus === it) this.focus = null;
  }

  update(dt, game) {
    this.focus = null;
    if (game.state !== 'playing' || this.blocked || game.player.mode === 'locked') return;
    const cam = game.camera;
    cam.getWorldDirection(this._dir);
    this.ray.set(cam.position, this._dir);
    let best = null, bestD = Infinity;
    const cp = cam.position;
    for (const it of this.items) {
      if (!it.enabled || !it.object || !it.object.visible) continue;
      // cheap reject using the object position
      it.object.getWorldPosition(this._hit);
      if (this._hit.distanceToSquared(cp) > (it.interactionDistance + 3) ** 2) continue;
      const box = it.worldBox();
      const hit = this.ray.intersectBox(box, this._hit);
      if (!hit) continue;
      const d = hit.distanceTo(cp);
      if (d > it.interactionDistance || d >= bestD) continue;
      best = it;
      bestD = d;
      this.hitPoint.copy(hit);
    }
    // occlusion by solid world geometry (crate walls etc. are fine; terrain blocks)
    if (best) {
      const steps = Math.ceil(bestD / 0.25);
      for (let i = 1; i < steps; i++) {
        const p = this.ray.at((i / steps) * bestD, this._hit);
        if (game.terrainData.heightAt(p.x, p.z) > p.y + 0.05) { best = null; break; }
      }
    }
    this.focus = best;
  }

  /** Called by the game when E / F are pressed. Returns true if consumed. */
  trigger(kind) {
    const f = this.focus;
    if (!f) return false;
    if (kind === 'primary' && f.onInteract) { f.onInteract(this.game, f); return true; }
    if (kind === 'secondary' && f.onSecondary && f.label2(this.game)) { f.onSecondary(this.game, f); return true; }
    return false;
  }
}
