import * as CANNON from "cannon-es";
import * as THREE from "three";
import { fx } from "../core/rng";
import type { CollisionWorld } from "../world/Collision";
import { FONT_UI } from "../world/textures";
import type { LineKey } from "./dialogue";
import { NAME_COLORS } from "./dialogue";
import { NavGraph } from "./Nav";
import { Npc, type NpcHost, type NpcProfile, type Overlay, type SocialEvent } from "./Npc";

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
  /** Look at this first and only react a moment later (the Lurker always does). */
  look?: () => THREE.Vector3;
  looked?: boolean;
}

interface PendingLine {
  npc: Npc;
  text: string;
  quiet: boolean;
  loud: boolean;
  expires: number;
}

/** Variations so the same body reaction isn't repeated back to back. */
const ALT: Partial<Record<Overlay, Overlay[]>> = {
  celebrate: ["fistPump", "leanIn"],
  fistPump: ["celebrate", "leanIn"],
  leanIn: ["fistPump", "nod"],
  headInHands: ["facepalm", "sigh"],
  facepalm: ["headInHands", "sigh"],
  mutter: ["sigh", "shrug"],
  sigh: ["mutter", "shrug"],
  shrug: ["nod", "mutter"],
  nod: ["smile", "shrug"],
  smile: ["nod"],
};
/** Characters who never do the big version of a reaction. */
const SUBDUED: Partial<Record<Overlay, Overlay>> = { celebrate: "smile", fistPump: "nod", headInHands: "sigh", facepalm: "sigh", explain: "nod", leanIn: "nod" };

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
  /** NPC the player is talking to (their lines always go through; nearby chatter waits). */
  dialogNpc: Npc | null = null;
  private floorUntil = 0;
  private floorNpc: Npc | null = null;
  private pending: PendingLine[] = [];
  private recentText = new Map<string, number>();
  private recentKinds: Overlay[] = [];
  private starts: number[] = [];

  constructor(
    private host: Omit<NpcHost, "nav" | "requestReaction" | "say" | "circle" | "glanceTarget" | "social">,
    private collision: CollisionWorld,
    private world: CANNON.World,
  ) {
    const fullHost: NpcHost = {
      ...host,
      nav: this.nav,
      requestReaction: (npc, kind, line, priority) => this.request({ npc, kind, line, priority, at: host.time() }),
      say: (npc, text, quiet, loud) => this.speak(npc, text, !!quiet, !!loud),
      glanceTarget: (npc) => this.glanceTarget(npc),
      social: (npc, ev, vars) => this.social(npc, ev, vars),
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

  private dist2Player(n: Npc): number {
    const p = this.host.playerFeet();
    return (n.x - p.x) ** 2 + (n.z - p.z) ** 2;
  }

  /** Pick a body reaction that fits the character and wasn't just used. */
  private vary(npc: Npc, kind: Overlay): Overlay {
    let k = kind;
    if (npc.profile.energy < 0.3 && SUBDUED[k]) k = SUBDUED[k]!;
    const recent = this.recentKinds.slice(-2);
    if (recent.includes(k) && ALT[k]) {
      const alts = ALT[k]!.filter((a) => !recent.includes(a) && !(npc.profile.energy < 0.3 && SUBDUED[a]));
      if (alts.length) k = fx.pick(alts);
    }
    return k;
  }

  /** Immediate-ish scripted reaction used by events (bypasses cooldown, still staggered by `delay`). */
  cascade(npc: Npc, kind: Overlay | null, line: LineKey | null, delay: number, vars?: Record<string, string>, quiet = false) {
    this.queue.push({ npc, kind: kind ?? "nod", line, priority: 10, at: this.host.time() + delay, vars, cascade: true, quiet });
    if (!kind) this.queue[this.queue.length - 1].kind = "type";
  }

  private runQueue(now: number) {
    const active = this.npcs.filter((n) => n.overlay && !n.overlay.ambient && n.overlay.kind !== "type" && n.overlay.kind !== "wipe" && n.overlay.kind !== "draw").length;
    this.queue = this.queue.filter((q) => (q.cascade ? now - q.at < 12 : now - q.at < 6));
    this.starts = this.starts.filter((t) => now - t < 40);
    // closer to the player first
    const score = (q: ReactionReq) => q.priority + 3 * Math.max(0, 1 - Math.sqrt(this.dist2Player(q.npc)) / 12);
    this.queue.sort((a, b) => score(b) - score(a));
    for (let i = 0; i < this.queue.length; i++) {
      const q = this.queue[i];
      if (q.at > now) continue;
      if (!q.npc.present || q.npc.mode === "sitting" || q.npc.mode === "standing" || q.npc.convo) continue;
      if (!q.cascade) {
        if (active >= 2 || now - this.lastReactionStart < 2.5) continue;
        if (q.npc.overlay && !q.npc.overlay.ambient) continue;
        if (this.starts.length >= 4) continue; // the room isn't a stadium
      }
      // observe first, react a beat later
      if (q.look && !q.looked) {
        q.looked = true;
        q.npc.lookAt(q.look(), 3.6, true);
        q.at = now + (q.npc.id === "lurker" ? 2.2 : 1.1);
        continue;
      }
      const far = this.dist2Player(q.npc) > 100;
      if (q.kind !== "type") {
        const k = this.vary(q.npc, q.kind);
        q.npc.play(k);
        this.recentKinds.push(k);
        if (this.recentKinds.length > 6) this.recentKinds.shift();
      }
      if (q.line) {
        const pv = q.npc.positionVars();
        q.npc.say(q.line, { sym: pv?.sym ?? "", pct: pv?.pct ?? "", ...(q.vars ?? {}) }, q.quiet || far || q.line.startsWith("mutter"));
      }
      q.npc.reactCd = q.cascade ? 12 : fx.range(30, 60);
      this.lastReactionStart = now;
      this.starts.push(now);
      this.queue.splice(i, 1);
      i--;
      if (!q.cascade) break;
    }
  }

  // ------------------------------------------------------------- social layer

  /** Present, seated or standing neighbors of an NPC, nearest first. */
  private neighbors(of: Npc, radius: number, filter: (n: Npc) => boolean = (n) => n.free): Npc[] {
    return this.present()
      .filter((n) => n !== of && filter(n) && Math.hypot(n.x - of.x, n.z - of.z) <= radius)
      .sort((a, b) => Math.hypot(a.x - of.x, a.z - of.z) - Math.hypot(b.x - of.x, b.z - of.z));
  }

  private headOf(n: Npc): () => THREE.Vector3 {
    return () => n.rig.headWorld(new THREE.Vector3());
  }

  /**
   * React to something that really happened to an NPC's simulated position.
   * One neighbor may look over (and maybe comment); another one stays focused.
   */
  social(actor: Npc, ev: SocialEvent, vars: Record<string, string>) {
    const now = this.host.time();
    const id = actor.id;
    const say = (n: Npc, kind: Overlay, line: LineKey | null, delay: number, prio: number, look?: () => THREE.Vector3, quiet = false) => {
      // running gags need air: a comment line is reused at most every 4 minutes per character
      const gag = line === "unplug" || line === "announcement" || line === "unrealized" || line === "neighborWin" || line === "neighborLoss" || line === "earlyWin";
      if (gag && line && n.saidWithin(line, 240)) line = null;
      if (!line && n !== actor && kind === "type") return;
      this.queue.push({ npc: n, kind, line, priority: prio, at: now + delay, vars, cascade: true, look, quiet });
    };
    const nb = this.neighbors(actor, 4.4);
    // whoever is about as close gets to be the one who looks over
    const d0 = nb.length ? Math.hypot(nb[0].x - actor.x, nb[0].z - actor.z) : 0;
    const close = nb.filter((n) => Math.hypot(n.x - actor.x, n.z - actor.z) < d0 + 0.6);
    const watcher = close.length ? fx.pick(close) : null;
    const focused = nb.find((n) => n !== watcher) ?? null;
    switch (ev) {
      case "buy":
        if (fx.chance(actor.profile.energy)) say(actor, "type", "buy", 0.3, 1, undefined, actor.profile.energy < 0.5);
        break;
      case "closeWin": {
        const kind: Overlay = id === "topbuyer" ? "celebrate" : id === "wizard" ? "explain" : id === "lurker" ? "smile" : "nod";
        say(actor, kind, "closeWin", 0.4, 4, undefined, actor.profile.energy < 0.4);
        if (watcher && fx.chance(0.75)) {
          watcher.lookAt(actor.rig.headWorld(new THREE.Vector3()), 3, true);
          const wpv = watcher.positionVars();
          if (fx.chance(0.55)) {
            const key: LineKey = wpv && wpv.pnl < -0.01 ? "unrealized" : id === "topbuyer" && fx.chance(0.5) ? "unplug" : "neighborWin";
            say(watcher, key === "unrealized" ? "sigh" : "nod", key, 2.6, 3, this.headOf(actor), watcher.id === "lurker");
          }
        }
        if (focused) focused.typing = 4; // someone always keeps their head down
        break;
      }
      case "closeLoss": {
        const kind: Overlay = id === "topbuyer" ? "headInHands" : id === "wizard" ? "shrug" : "sigh";
        const hasVow = id === "topbuyer" || id === "nightshift";
        const line: LineKey = hasVow ? (actor.vowed ? "lastTradeAgain" : "lastTrade") : "closeLoss";
        if (hasVow) actor.vowed = true;
        say(actor, kind, line, 0.4, 4, undefined, actor.profile.energy < 0.4);
        if (watcher && fx.chance(0.6)) {
          watcher.lookAt(actor.rig.headWorld(new THREE.Vector3()), 2.5, true);
          if (fx.chance(0.4)) say(watcher, "shrug", "neighborLoss", 2.8, 2, this.headOf(actor), watcher.id === "lurker");
        }
        if (focused) focused.typing = 4;
        break;
      }
      case "earlyWin":
        say(actor, "celebrate", "earlyWin", 0.2, 4);
        if (watcher && fx.chance(0.6)) say(watcher, "type", "unplug", 2.4, 3, this.headOf(actor), watcher.id === "lurker");
        break;
      case "deflate":
        say(actor, "deflate", "deflate", 0.2, 3, undefined, true);
        break;
      case "boughtTop": {
        say(actor, "pushBack", null, 0.2, 3);
        const w = this.neighbors(actor, 5.5, (n) => n.present && n.mode !== "walk" && !n.convo)[0];
        if (w) say(w, "type", "announcement", 2.2, 3, this.headOf(actor), w.id === "lurker");
        break;
      }
    }
  }

  /** Something worth a casual look: whoever is being loud nearby, the player, the big screen. */
  glanceTarget(npc: Npc): THREE.Vector3 | null {
    const now = this.host.time();
    const opts: { p: THREE.Vector3; w: number }[] = [];
    for (const o of this.present()) {
      if (o === npc) continue;
      const d = Math.hypot(o.x - npc.x, o.z - npc.z);
      if (d > 4.6) continue;
      const loud = (o.overlay && !o.overlay.ambient) || o.talkUntil > now ? 4 : 1;
      opts.push({ p: o.rig.headWorld(new THREE.Vector3()), w: loud * (npc.id === "lurker" ? 1.6 : 1) });
    }
    if (this.dist2Player(npc) < 25) opts.push({ p: this.host.playerHead(), w: npc.id === "lurker" ? 2 : 1.2 });
    opts.push({ p: this.host.bigScreen.clone(), w: npc.id === "topbuyer" ? 2.5 : 0.6 });
    let total = 0;
    for (const o of opts) total += o.w;
    let r = fx.next() * total;
    for (const o of opts) {
      r -= o.w;
      if (r <= 0) return o.p;
    }
    return null;
  }

  // ------------------------------------------------------------- speech floor

  private floorBusy(npc: Npc, now: number): boolean {
    if (this.dialogNpc && npc !== this.dialogNpc && this.dist2Player(npc) < 49) return true;
    return now < this.floorUntil && this.floorNpc !== npc;
  }

  /** One voice at a time: lines wait for the floor, identical lines don't repeat for a while. */
  private speak(npc: Npc, text: string, quiet: boolean, loud: boolean) {
    const now = this.host.time();
    const priority = loud || npc === this.dialogNpc;
    if (!priority) {
      const last = this.recentText.get(text);
      if (last !== undefined && now - last < 150) return;
      if (this.floorBusy(npc, now)) {
        if (!this.pending.some((p) => p.npc === npc)) this.pending.push({ npc, text, quiet, loud, expires: now + (quiet ? 4 : 7) });
        return;
      }
    }
    this.startLine(npc, text, quiet, loud, now);
  }

  private startLine(npc: Npc, text: string, quiet: boolean, loud: boolean, now: number) {
    this.showBubble(npc, text, quiet, loud);
    npc.markTalking(text);
    this.recentText.set(text, now);
    const hold = quiet ? 1.2 : Math.min(4.5, 1.3 + text.length * 0.05);
    if (now + hold > this.floorUntil || this.floorNpc === npc) {
      this.floorUntil = now + hold;
      this.floorNpc = npc;
    }
  }

  private runPending(now: number) {
    this.pending = this.pending.filter((p) => p.expires > now && p.npc.present);
    const p = this.pending.find((x) => !this.floorBusy(x.npc, now));
    if (!p) return;
    this.pending.splice(this.pending.indexOf(p), 1);
    this.startLine(p.npc, p.text, p.quiet, p.loud, now);
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
    this.runPending(now);
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
