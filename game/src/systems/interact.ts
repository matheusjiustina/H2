import * as THREE from 'three';
import { dist2 } from '../core/util';
import { MeshBuilder } from '../render/geo';
import { M } from '../render/materials';
import type { InteractDef } from '../world/world';
import type { Game } from '../game';

export interface Switch {
  id: string;
  tag: string;
  x: number;
  y: number;
  z: number;
  r: number;
  label: string;
  /** Seconds the key must be held. */
  hold: number;
  onUse: () => void;
  progress: number;
  mesh: THREE.Mesh | null;
  lamp: THREE.Mesh | null;
  visible: boolean;
}

let terminalGeo: THREE.BufferGeometry | null = null;
function terminal() {
  if (!terminalGeo) {
    const b = new MeshBuilder();
    b.box(0, 0.55, 0, 0.7, 1.1, 0.5, 0x3a3d55, 0, 0);
    b.box(0, 1.2, 0.05, 0.8, 0.3, 0.6, 0xf2c230, 0, 0);
    for (let k = 0; k < 3; k++) b.box(-0.24 + k * 0.24, 0.4, 0.26, 0.12, 0.5, 0.02, 0x1d1a2e, 0, 0);
    terminalGeo = b.build();
  }
  return terminalGeo;
}

export class Interact {
  switches: Switch[] = [];
  group = new THREE.Group();
  prompt: { label: string; progress: number } | null = null;
  private cool = 0;

  constructor(private g: Game) {}

  add(o: { id: string; tag?: string; x: number; y: number; z: number; r?: number; label: string; hold?: number; onUse: () => void; prop?: boolean }): Switch {
    this.remove(o.id);
    const s: Switch = { id: o.id, tag: o.tag ?? 'mission', x: o.x, y: o.y, z: o.z, r: o.r ?? 2.4, label: o.label, hold: o.hold ?? 0, onUse: o.onUse, progress: 0, mesh: null, lamp: null, visible: true };
    if (o.prop !== false) {
      s.mesh = new THREE.Mesh(terminal(), M.actor);
      s.mesh.position.set(o.x, o.y, o.z);
      s.mesh.castShadow = true;
      s.lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0x3fe070 }));
      s.lamp.position.set(o.x, o.y + 1.65, o.z);
      this.group.add(s.mesh, s.lamp);
      this.g.world.addBox(o.x, o.z, 0.7, 0.5, o.y - 0.2, o.y + 1.3, 0, { dynamic: true, tag: 'sw:' + o.id, cam: false });
    }
    this.switches.push(s);
    return s;
  }

  remove(id: string) {
    const i = this.switches.findIndex((s) => s.id === id);
    if (i < 0) return;
    const s = this.switches[i];
    if (s.mesh) this.group.remove(s.mesh);
    if (s.lamp) this.group.remove(s.lamp);
    const w = this.g.world;
    const solid = w.dyn.find((d) => d.tag === 'sw:' + id);
    if (solid) w.removeDyn(solid);
    this.switches.splice(i, 1);
  }

  clear(tag: string) {
    for (const s of [...this.switches]) if (s.tag === tag) this.remove(s.id);
  }

  has(id: string) {
    return this.switches.some((s) => s.id === id);
  }

  private useWorld(d: InteractDef) {
    const g = this.g, p = g.player;
    switch (d.kind) {
      case 'elevator':
      case 'ladder':
        if (!g.missions.allowInteract(d.id)) {
          g.hud.toast('Locked right now', 'warn');
          return;
        }
        g.fade(() => {
          p.place(d.to!.x, d.to!.y, d.to!.z, p.heading);
          g.audio.play('door', 0.6);
        });
        break;
      case 'safehouse':
        if (g.heat.level >= 3 && g.heat.visible) {
          g.hud.toast('They can see you! Lose your pursuers first.', 'warn');
          return;
        }
        if (g.missions.active && !g.missions.allowSafehouse()) {
          g.hud.toast('No time to rest — finish the mission!', 'warn');
          return;
        }
        p.heal(100);
        g.heat.clear();
        g.save.pos = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
        g.store.save();
        g.audio.play('pickup', 0.6);
        g.menus.wardrobe();
        break;
      case 'metro':
        g.menus.metro(d.data ?? '');
        break;
      case 'shop':
        if (p.health >= p.maxHealth) g.hud.toast('You are already feeling tremendous.');
        else if (g.save.cash < 15) g.hud.toast('Not enough cash ($15)', 'warn');
        else {
          g.addCash(-15);
          p.heal(60);
          g.audio.play('pickup', 0.6);
          g.fx.text(p.pos.x, p.pos.y + 2.2, p.pos.z, 'YUM!', 'good');
        }
        break;
      case 'dock':
        g.hud.toast('Speedboats are moored here — hop in with E');
        break;
      case 'info':
        g.say('PLAQUE', d.data ?? '');
        break;
      case 'garage':
        break;
    }
  }

  update(dt: number) {
    const g = this.g, p = g.player, inp = g.input;
    this.cool -= dt;
    this.prompt = null;
    for (const s of this.switches) if (s.lamp) s.lamp.visible = Math.floor(g.time * 3) % 2 === 0;
    if (p.state === 'down' || p.state === 'frozen' || p.state === 'chute' || p.state === 'climb') return;
    // --- leaving a vehicle
    if (p.vehicle) {
      const v = p.vehicle;
      const air = v.spec.cls === 'heli' && !v.landed;
      this.prompt = { label: air ? 'Bail out (parachute)' : 'Exit vehicle', progress: 0 };
      if (inp.hit('interact') && this.cool <= 0) {
        this.cool = 0.4;
        if (!p.exit()) g.hud.toast(Math.abs(v.speed) > 9 ? 'Slow down first!' : 'No room to get out', 'warn');
      }
      // mission switches can still be used from a vehicle (drive-up markers) – none need it
      return;
    }
    // --- mission switches take priority
    let best: Switch | null = null;
    let bd = Infinity;
    for (const s of this.switches) {
      if (!s.visible || Math.abs(s.y - p.pos.y) > 3) continue;
      const d2 = dist2(s.x, s.z, p.pos.x, p.pos.z);
      if (d2 < s.r * s.r && d2 < bd) {
        bd = d2;
        best = s;
      }
    }
    for (const s of this.switches) if (s !== best) s.progress = Math.max(0, s.progress - dt * 2);
    if (best) {
      this.prompt = { label: best.label, progress: best.hold > 0 ? best.progress / best.hold : 0 };
      if (best.hold > 0) {
        if (inp.down('interact')) {
          best.progress += dt;
          if (best.progress >= best.hold) {
            best.progress = 0;
            g.audio.play('switch', 0.7);
            best.onUse();
          }
        } else best.progress = Math.max(0, best.progress - dt * 2);
      } else if (inp.hit('interact') && this.cool <= 0) {
        this.cool = 0.4;
        g.audio.play('switch', 0.6);
        best.onUse();
      }
      return;
    }
    // --- vehicles
    const v = g.vehicles.nearest(p.pos.x, p.pos.y, p.pos.z, p.state === 'swim' ? 4.5 : 3.2);
    // --- fixed world interactions
    let wi: InteractDef | null = null;
    let wd = Infinity;
    for (const d of g.world.interacts) {
      if (Math.abs(d.y - p.pos.y) > 2.5) continue;
      const d2 = dist2(d.x, d.z, p.pos.x, p.pos.z);
      if (d2 < d.r * d.r && d2 < wd) {
        wd = d2;
        wi = d;
      }
    }
    if (wi && (!v || wd < 4)) {
      this.prompt = { label: wi.label, progress: 0 };
      if (inp.hit('interact') && this.cool <= 0) {
        this.cool = 0.5;
        this.useWorld(wi);
      }
      return;
    }
    if (v) {
      const stolen = v.mode === 'traffic' || v.mode === 'flee' || v.mode === 'dazed';
      this.prompt = { label: `${stolen ? 'Commandeer' : 'Enter'} ${v.spec.name}`, progress: 0 };
      if (inp.hit('interact') && this.cool <= 0) {
        this.cool = 0.4;
        p.enter(v);
      }
    }
  }
}
