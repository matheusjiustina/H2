import * as CANNON from "cannon-es";
import * as THREE from "three";
import { fx } from "../core/rng";
import type { CollisionWorld } from "../world/Collision";
import { FONT_UI } from "../world/textures";
import type { LineKey } from "./dialogue";
import { NAME_COLORS } from "./dialogue";
import { NavGraph } from "./Nav";
import { Npc, type NpcHost, type NpcProfile, type Overlay } from "./Npc";

export const PROFILES: NpcProfile[] = [
  {
    id: "owner",
    station: null,
    strategy: "bag",
    favorites: ["cashcat"],
    voice: 0.8,
    energy: 0.5,
    routine: [
      { kind: "wipe", weight: 3 },
      { kind: "timers", weight: 2 },
      { kind: "rounds", weight: 1.2 },
    ],
  },
  {
    id: "topbuyer",
    station: "pc04",
    strategy: "late",
    favorites: ["hookr", "stonkbonker"],
    voice: 1.25,
    energy: 1,
    routine: [
      { kind: "fridge", weight: 3 },
      { kind: "counter", weight: 1.5 },
      { kind: "bigView", weight: 1.5 },
    ],
  },
  {
    id: "lurker",
    station: "pc06",
    strategy: "quiet",
    favorites: ["delta"],
    voice: 0.95,
    energy: 0.2,
    routine: [
      { kind: "serverWindow", weight: 2 },
      { kind: "window", weight: 1 },
      { kind: "mural", weight: 1 },
    ],
  },
  {
    id: "wizard",
    station: "pc08",
    strategy: "pattern",
    favorites: ["pons", "delta", "cashcat"],
    voice: 1.1,
    energy: 0.75,
    routine: [
      { kind: "whiteboard", weight: 4 },
      { kind: "fridge", weight: 1 },
      { kind: "bigView", weight: 1 },
    ],
  },
  {
    id: "nightshift",
    station: "pc02",
    strategy: "hodl",
    favorites: ["pons", "delta"],
    voice: 0.7,
    energy: 0.45,
    routine: [
      { kind: "window", weight: 2 },
      { kind: "couch", weight: 2 },
      { kind: "fridge", weight: 1.5 },
    ],
  },
  {
    id: "courier",
    station: null,
    strategy: null,
    favorites: [],
    voice: 1.0,
    energy: 0.6,
    routine: [],
  },
];

interface Bubble {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  until: number;
  npc: Npc;
  quiet: boolean;
}

interface ReactionReq {
  npc: Npc;
  kind: Overlay;
  line: LineKey | null;
  priority: number;
  at: number;
  vars?: Record<string, string>;
  cascade?: boolean;
  quiet?: boolean;
}

/**
 * Owns the NPCs, their speech bubbles and the reaction scheduler that keeps
 * reactions spaced out, limited and never all at once.
 */
export class NpcManager {
  readonly nav = new NavGraph();
  readonly npcs: Npc[] = [];
  readonly byId = new Map<string, Npc>();
  private bubbles = new Map<string, Bubble>();
  private queue: ReactionReq[] = [];
  private lastReactionStart = -99;
  private marketT = 0;
  readonly bodies = new Map<string, CANNON.Body>();
  onSpeak: ((npc: Npc, text: string, quiet: boolean, loud: boolean) => void) | null = null;

  constructor(
    private host: Omit<NpcHost, "nav" | "requestReaction" | "say" | "circle">,
    private collision: CollisionWorld,
    private world: CANNON.World,
  ) {
    const fullHost: NpcHost = {
      ...host,
      nav: this.nav,
      requestReaction: (npc, kind, line, priority) => this.request({ npc, kind, line, priority, at: host.time() }),
      say: (npc, text, quiet, loud) => this.showBubble(npc, text, !!quiet, !!loud),
      circle: (npc) => this.collision.addCircle({ x: 0, z: 0, r: 0.3, minY: 0, maxY: 1.8, enabled: false, tag: `npc-${npc.profile.id}` }),
    };
    for (const p of PROFILES) {
      const n = new Npc(p, fullHost);
      this.npcs.push(n);
      this.byId.set(p.id, n);
      // kinematic body so thrown props bounce off people
      const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
      b.addShape(new CANNON.Box(new CANNON.Vec3(0.2, 0.32, 0.16)), new CANNON.Vec3(0, 0.0, 0));
      b.addShape(new CANNON.Sphere(0.18), new CANNON.Vec3(0, 0.55, 0));
      (b as unknown as { npcId: string }).npcId = p.id;
      this.bodies.set(p.id, b);
    }
  }

  get(id: string): Npc {
    return this.byId.get(id)!;
  }

  present(): Npc[] {
    return this.npcs.filter((n) => n.present && n.id !== "courier");
  }

  /** Queue a reaction. The scheduler decides when (or whether) it plays. */
  request(r: ReactionReq) {
    if (!r.cascade && r.npc.reactCd > 0) return;
    if (this.queue.some((q) => q.npc === r.npc)) return;
    this.queue.push(r);
  }

  /** Immediate-ish scripted reaction used by events (bypasses cooldown, still staggered by `delay`). */
  cascade(npc: Npc, kind: Overlay | null, line: LineKey | null, delay: number, vars?: Record<string, string>, quiet = false) {
    this.queue.push({ npc, kind: kind ?? "nod", line, priority: 10, at: this.host.time() + delay, vars, cascade: true, quiet });
    if (!kind) this.queue[this.queue.length - 1].kind = "type";
  }

  private runQueue(now: number) {
    const active = this.npcs.filter((n) => n.overlay && n.overlay.kind !== "type" && n.overlay.kind !== "wipe" && n.overlay.kind !== "draw").length;
    this.queue = this.queue.filter((q) => (q.cascade ? now - q.at < 12 : now - q.at < 6));
    this.queue.sort((a, b) => b.priority - a.priority);
    for (let i = 0; i < this.queue.length; i++) {
      const q = this.queue[i];
      if (q.at > now) continue;
      if (!q.npc.present || q.npc.mode === "sitting" || q.npc.mode === "standing") continue;
      if (!q.cascade) {
        if (active >= 2 || now - this.lastReactionStart < 2.5) continue;
        if (q.npc.overlay) continue;
      }
      // play it
      if (q.kind !== "type") q.npc.play(q.kind);
      if (q.line) {
        const pv = q.npc.positionVars();
        q.npc.say(q.line, { sym: pv?.sym ?? "", pct: pv?.pct ?? "", ...(q.vars ?? {}) }, q.quiet || q.line.startsWith("mutter"));
      }
      q.npc.reactCd = q.cascade ? 12 : fx.range(30, 60);
      this.lastReactionStart = now;
      this.queue.splice(i, 1);
      i--;
      if (!q.cascade) break;
    }
  }

  // ------------------------------------------------------------- speech bubbles

  private showBubble(npc: Npc, text: string, quiet: boolean, loud: boolean) {
    let b = this.bubbles.get(npc.id);
    if (!b) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 160;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      sprite.renderOrder = 10;
      sprite.center.set(0.5, 0);
      this.host.scene.add(sprite);
      b = { sprite, canvas, tex, until: 0, npc, quiet };
      this.bubbles.set(npc.id, b);
    }
    b.quiet = quiet;
    const ctx = b.canvas.getContext("2d")!;
    const W = b.canvas.width;
    const H = b.canvas.height;
    ctx.clearRect(0, 0, W, H);
    const size = quiet ? 26 : 30;
    ctx.font = `${quiet ? "italic 500" : "600"} ${size}px ${FONT_UI}`;
    // wrap into up to 3 lines
    const words = text.split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(t).width > W - 60 && cur) {
        lines.push(cur);
        cur = w;
      } else cur = t;
    }
    if (cur) lines.push(cur);
    const shown = lines.slice(0, 3);
    const lh = size * 1.18;
    const boxW = Math.min(W - 8, Math.max(...shown.map((l) => ctx.measureText(l).width)) + 44);
    const boxH = shown.length * lh + 26;
    const x0 = (W - boxW) / 2;
    const y0 = H - boxH - 18;
    ctx.fillStyle = quiet ? "rgba(30,30,32,0.72)" : "rgba(246,240,228,0.95)";
    ctx.beginPath();
    ctx.roundRect(x0, y0, boxW, boxH, 18);
    ctx.fill();
    // tail
    ctx.beginPath();
    ctx.moveTo(W / 2 - 12, y0 + boxH - 1);
    ctx.lineTo(W / 2, H - 2);
    ctx.lineTo(W / 2 + 12, y0 + boxH - 1);
    ctx.fill();
    ctx.fillStyle = NAME_COLORS[npc.id] ?? "#d9a441";
    ctx.fillRect(x0 + 12, y0 + 12, 5, boxH - 24);
    ctx.fillStyle = quiet ? "#cfc8b8" : "#1d1a16";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    shown.forEach((l, i) => ctx.fillText(l, x0 + 28, y0 + 13 + i * lh));
    b.tex.needsUpdate = true;
    const dur = Math.min(6.5, 1.8 + text.length * 0.055);
    b.until = this.host.time() + dur;
    const scale = quiet ? 0.85 : 1;
    b.sprite.scale.set(1.15 * scale, (1.15 * scale * H) / W, 1);
    this.onSpeak?.(npc, text, quiet, loud);
  }

  private updateBubbles(now: number, camPos: THREE.Vector3) {
    for (const b of this.bubbles.values()) {
      const vis = b.until > now && b.npc.present;
      const mat = b.sprite.material as THREE.SpriteMaterial;
      if (!vis) {
        mat.opacity = Math.max(0, mat.opacity - 0.08);
        b.sprite.visible = mat.opacity > 0.01;
        continue;
      }
      const p = b.npc.rig.headAnchor.getWorldPosition(new THREE.Vector3());
      p.y += 0.06;
      b.sprite.position.copy(p);
      const d = p.distanceTo(camPos);
      // occluded by walls? (cheap AABB test on occluders)
      const dir = p.clone().sub(camPos).normalize();
      const occ = this.collision.occlusion(camPos.x, camPos.y, camPos.z, dir.x, dir.y, dir.z, d);
      const fade = occ < d - 0.3 ? 0 : d > 11 ? 0 : d > 8 ? 1 - (d - 8) / 3 : 1;
      mat.opacity += (fade * (b.quiet ? 0.85 : 1) - mat.opacity) * 0.2;
      b.sprite.visible = mat.opacity > 0.02;
      // keep apparent size readable with distance, but not huge up close
      const s = Math.max(0.6, Math.min(1.4, d * 0.22)) * (b.quiet ? 0.85 : 1);
      b.sprite.scale.set(1.15 * s, (1.15 * s * 160) / 512, 1);
    }
  }

  // ------------------------------------------------------------- frame

  update(dt: number, now: number, camPos: THREE.Vector3) {
    this.marketT += dt;
    if (this.marketT >= 1) {
      for (const n of this.npcs) n.thinkMarket(this.marketT);
      this.marketT = 0;
    }
    for (const n of this.npcs) {
      n.thinkRoutine(dt);
      if (n.busyEvent > 0) n.busyEvent -= dt;
      n.update(dt, now);
      // body sync
      const b = this.bodies.get(n.id)!;
      if (n.present) {
        if (!this.world.bodies.includes(b)) this.world.addBody(b);
        const p = n.rig.j.hips.getWorldPosition(new THREE.Vector3());
        b.position.set(p.x, p.y + 0.15, p.z);
        b.quaternion.setFromEuler(0, n.yaw, 0);
      } else if (this.world.bodies.includes(b)) this.world.removeBody(b);
    }
    this.runQueue(now);
    this.updateBubbles(now, camPos);
  }

  /** NPC nearest the given point that is present, optionally filtered. */
  nearestTo(p: THREE.Vector3, filter?: (n: Npc) => boolean): Npc | null {
    let best: Npc | null = null;
    let bd = Infinity;
    for (const n of this.present()) {
      if (filter && !filter(n)) continue;
      const d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2;
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }
}
