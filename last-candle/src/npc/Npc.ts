import * as THREE from "three";
import { clamp, damp, wrapAngle } from "../core/math";
import { fx } from "../core/rng";
import type { MarketEngine } from "../market/MarketEngine";
import type { DynCircle } from "../world/Collision";
import type { StationVisual } from "../world/Station";
import { CharacterRig, LOOKS, type Pose } from "./CharacterRig";
import { LINES, NAMES, type LineKey } from "./dialogue";
import type { NavGraph } from "./Nav";

export type Strategy = "late" | "quiet" | "pattern" | "hodl" | "bag" | null;

export type Overlay =
  | "leanIn"
  | "celebrate"
  | "fistPump"
  | "headInHands"
  | "facepalm"
  | "mutter"
  | "shrug"
  | "nod"
  | "talk"
  | "drink"
  | "stretch"
  | "startled"
  | "showReceipt"
  | "wave"
  | "shakeOff"
  | "point"
  | "wipe"
  | "draw"
  | "type";

export interface SimPosition {
  assetId: string;
  qty: number;
  entry: number;
  openedTick: number;
}

export interface NpcProfile {
  id: string;
  station: string | null;
  strategy: Strategy;
  favorites: string[];
  voice: number; // pitch multiplier
  routine: { kind: SpotKind; weight: number }[];
  /** Overall expressiveness 0..1 (Lurker low, Top Buyer high). */
  energy: number;
}

export type SpotKind = "fridge" | "window" | "whiteboard" | "couch" | "serverWindow" | "bigView" | "counter" | "mural" | "rounds" | "wipe" | "timers" | "printFlex";

export interface NpcHost {
  market: MarketEngine;
  nav: NavGraph;
  stations: Map<string, StationVisual>;
  scene: THREE.Scene;
  time(): number;
  playerHead(): THREE.Vector3;
  playerFeet(): THREE.Vector3;
  playerSeatedAt(): string | null;
  say(npc: Npc, text: string, quiet?: boolean, loud?: boolean): void;
  sfx(name: string, pos: THREE.Vector3, vol?: number): void;
  onWizardDraw(npc: Npc, dt: number): void;
  onNpcTrade(npc: Npc, side: "BUY" | "SELL", pnlPct: number): void;
  onNpcPrintFlex(npc: Npc): void;
  onNpcDrinkDone(npc: Npc): void;
  requestReaction(npc: Npc, kind: Overlay, line: LineKey | null, priority: number): void;
  bigScreen: THREE.Vector3;
  circle(npc: Npc): DynCircle;
}

const WALK_SPEED = 1.15;
const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();

type Mode = "away" | "walk" | "spot" | "sitting" | "seated" | "standing";

/**
 * A regular at the LAN house: routine, simulated position on the shared
 * market, mood, look-at, reactions and speech.
 */
export class Npc {
  readonly rig: CharacterRig;
  readonly name: string;
  mode: Mode = "away";
  x = 0;
  z = 0;
  yaw = 0;
  private path: { x: number; z: number; id: string }[] = [];
  private navAt = "";
  private onArrive: (() => void) | null = null;
  private spot: { kind: SpotKind; t: number; dur: number; yaw: number | null; onEnd?: () => void } | null = null;
  overlay: { kind: Overlay; t: number; dur: number } | null = null;
  private lookTarget: THREE.Vector3 | null = null;
  private lookUntil = 0;
  private lookPlayerUntil = 0;
  talkUntil = 0;
  mood = 0;
  pos: SimPosition | null = null;
  realizedPct = 0;
  private lastBand = 0;
  private bandPeak = 0;
  reactCd = 10;
  private activityCd = 30;
  private tradeCd = 20;
  private typing = 0;
  private walkPhase = 0;
  private transition: { from: THREE.Vector3; to: THREE.Vector3; fromYaw: number; toYaw: number; t: number; dur: number; then: () => void } | null = null;
  private seatBlend = 0;
  private waitT = 0;
  private propInHand: THREE.Object3D | null = null;
  private used = new Map<LineKey, number>();
  readonly circle: DynCircle;
  /** When >0 the NPC was recently hit and is annoyed at the player. */
  annoyed = 0;
  private chairTarget = 0;
  talkedTonight = false;
  busyEvent = 0;
  /** Symbol of the last position opened / closed (for receipts). */
  lastSymbol: string | null = null;
  realizedSymbol: string | null = null;

  constructor(
    readonly profile: NpcProfile,
    private host: NpcHost,
  ) {
    this.rig = new CharacterRig(LOOKS[profile.id]);
    this.name = NAMES[profile.id] ?? profile.id;
    this.rig.root.visible = false;
    host.scene.add(this.rig.root);
    this.circle = host.circle(this);
    this.rig.root.traverse((o) => (o.userData.npcId = profile.id));
  }

  get id() {
    return this.profile.id;
  }

  get station(): StationVisual | null {
    return this.profile.station ? this.host.stations.get(this.profile.station) ?? null : null;
  }

  get present() {
    return this.mode !== "away";
  }

  get seated() {
    return this.mode === "seated";
  }

  get free(): boolean {
    return this.present && !this.overlay && this.mode !== "sitting" && this.mode !== "standing" && this.busyEvent <= 0;
  }

  /** Pick a line for a context, avoiding immediate repeats. */
  line(key: LineKey, vars: Record<string, string> = {}): string | null {
    const list = LINES[this.profile.id]?.[key];
    if (!list || !list.length) return null;
    const last = this.used.get(key) ?? -1;
    let i = fx.int(0, list.length - 1);
    if (list.length > 1 && i === last) i = (i + 1) % list.length;
    this.used.set(key, i);
    return list[i].replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  }

  say(key: LineKey, vars: Record<string, string> = {}, quiet = false, loud = false): boolean {
    const t = this.line(key, vars);
    if (!t) return false;
    this.host.say(this, t, quiet, loud);
    this.talkUntil = this.host.time() + Math.min(4, 0.8 + t.length * 0.045);
    return true;
  }

  sayText(t: string, quiet = false, loud = false) {
    this.host.say(this, t, quiet, loud);
    this.talkUntil = this.host.time() + Math.min(4, 0.8 + t.length * 0.045);
  }

  // ------------------------------------------------------------- placement

  /** Instantly seat at home station (night start / load). */
  placeSeated() {
    const st = this.station;
    if (!st) return;
    this.mode = "seated";
    this.rig.root.visible = true;
    st.swivel.add(this.rig.root);
    this.rig.root.position.set(0, -0.47, 0.06);
    this.rig.root.rotation.set(0, 0, 0);
    this.seatBlend = 1;
    this.x = st.def.chair[0];
    this.z = st.def.chair[2];
    this.yaw = st.def.facing;
    this.navAt = `stand-${st.def.id}`;
    this.circle.enabled = false;
  }

  placeAt(nodeId: string, yaw: number) {
    const n = this.host.nav.nodes.get(nodeId)!;
    this.detach();
    this.mode = "spot";
    this.spot = { kind: "counter", t: 0, dur: 1e9, yaw };
    this.x = n.x;
    this.z = n.z;
    this.yaw = yaw;
    this.navAt = nodeId;
    this.rig.root.visible = true;
    this.seatBlend = 0;
    this.circle.enabled = true;
    this.syncRoot();
  }

  hide() {
    this.detach();
    this.mode = "away";
    this.rig.root.visible = false;
    this.circle.enabled = false;
    this.path = [];
    this.spot = null;
    this.overlay = null;
  }

  private detach() {
    if (this.rig.root.parent !== this.host.scene) {
      this.host.scene.attach(this.rig.root);
    }
  }

  private syncRoot() {
    if (this.rig.root.parent !== this.host.scene) return;
    this.rig.root.position.set(this.x, 0, this.z);
    this.rig.root.rotation.set(0, this.yaw, 0);
  }

  // ------------------------------------------------------------- movement

  goTo(nodeId: string, then?: () => void) {
    const from = this.navAt || this.host.nav.nearest(this.x, this.z).id;
    this.path = this.host.nav.path(from, nodeId);
    this.onArrive = then ?? null;
    if (!this.path.length) {
      this.navAt = nodeId;
      this.onArrive = null;
      then?.();
      return;
    }
    this.mode = "walk";
    this.circle.enabled = true;
  }

  /** Stand up from the chair, then call `then`. */
  standUp(then: () => void) {
    const st = this.station;
    if (this.mode !== "seated" || !st) {
      then();
      return;
    }
    this.detach();
    const from = this.rig.root.position.clone();
    const to = new THREE.Vector3(st.def.stand[0], 0, st.def.stand[1]);
    this.mode = "standing";
    this.transition = { from, to, fromYaw: this.rig.root.rotation.y, toYaw: st.def.facing + Math.PI, t: 0, dur: 0.75, then };
    this.chairTarget = 0;
    this.host.sfx("chair", from, 0.5);
  }

  /** Walk home and sit down. */
  goSit() {
    const st = this.station;
    if (!st) return;
    this.goTo(`stand-${st.def.id}`, () => {
      this.detach();
      const from = new THREE.Vector3(this.x, 0, this.z);
      st.swivel.updateMatrixWorld(true);
      const seat = new THREE.Vector3(0, -0.47, 0.06).applyMatrix4(st.swivel.matrixWorld);
      seat.y = 0;
      this.mode = "sitting";
      this.circle.enabled = false;
      this.transition = {
        from,
        to: seat,
        fromYaw: this.yaw,
        toYaw: st.def.facing + st.chairYaw,
        t: 0,
        dur: 0.8,
        then: () => {
          this.mode = "seated";
          st.swivel.attach(this.rig.root);
          this.rig.root.position.set(0, -0.47, 0.06);
          this.rig.root.rotation.set(0, 0, 0);
          this.x = st.def.chair[0];
          this.z = st.def.chair[2];
          this.yaw = st.def.facing;
        },
      };
      this.host.sfx("chair", from, 0.5);
    });
  }

  /** Go to a spot and stay there for a while doing something. */
  startSpot(kind: SpotKind, node: string, yaw: number | null, dur: number, onEnd?: () => void) {
    const begin = () =>
      this.goTo(node, () => {
        this.mode = "spot";
        this.spot = { kind, t: 0, dur, yaw, onEnd };
      });
    if (this.mode === "seated") this.standUp(begin);
    else begin();
  }

  lookAt(p: THREE.Vector3 | null, dur = 3) {
    this.lookTarget = p ? p.clone() : null;
    this.lookUntil = this.host.time() + dur;
  }

  lookAtPlayer(dur = 4) {
    this.lookPlayerUntil = this.host.time() + dur;
  }

  play(kind: Overlay, dur?: number) {
    const d: Record<Overlay, number> = {
      leanIn: 4,
      celebrate: 2.4,
      fistPump: 1.4,
      headInHands: 3.2,
      facepalm: 2.2,
      mutter: 2.2,
      shrug: 1.6,
      nod: 1.2,
      talk: 2.5,
      drink: 2.2,
      stretch: 3,
      startled: 0.9,
      showReceipt: 3.2,
      wave: 1.6,
      shakeOff: 1.8,
      point: 2.2,
      wipe: 4,
      draw: 3,
      type: 2,
    };
    this.overlay = { kind, t: 0, dur: dur ?? d[kind] };
    if (kind === "drink" || kind === "showReceipt") this.attachHandProp(kind);
  }

  private attachHandProp(kind: Overlay) {
    this.dropHandProp();
    let mesh: THREE.Object3D;
    if (kind === "drink") {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 12), new THREE.MeshStandardMaterial({ color: "#24365e", roughness: 0.4, metalness: 0.4 }));
      mesh.position.set(0, -0.02, -0.02);
    } else {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.16, 0.003), new THREE.MeshStandardMaterial({ color: "#f3efe4", roughness: 0.9 }));
      mesh.position.set(0, -0.06, -0.05);
    }
    this.rig.handR.add(mesh);
    this.propInHand = mesh;
  }

  private dropHandProp() {
    if (this.propInHand) {
      this.propInHand.removeFromParent();
      this.propInHand = null;
    }
  }

  // ------------------------------------------------------------- market brain

  /** Called ~once per second. Simulated trading + reaction triggers. */
  thinkMarket(dt: number) {
    if (!this.present) return;
    const m = this.host.market;
    this.reactCd -= dt;
    this.tradeCd -= dt;
    if (this.pos) {
      const q = m.quote(this.pos.assetId);
      const pnl = (q.bid * 0.999) / (this.pos.entry * 1.001) - 1;
      this.mood += (clamp(pnl * 14, -1, 1) - this.mood) * Math.min(1, dt * 0.25);
      const band = clamp(Math.trunc(pnl / 0.025), -3, 3);
      if (band !== this.lastBand) {
        const rising = band > this.lastBand;
        this.lastBand = band;
        const sym = m.config(this.pos.assetId).symbol;
        const pct = `${(Math.abs(pnl) * 100).toFixed(1)}%`;
        if (band >= 1 && rising && band > this.bandPeak) {
          this.bandPeak = band;
          this.host.requestReaction(this, band >= 2 ? "fistPump" : "leanIn", band >= 2 ? "ownUp" : "mutterUp", 1 + band * 0.5);
          void sym;
          void pct;
        } else if (band <= -1 && !rising) {
          this.host.requestReaction(this, band <= -2 ? "headInHands" : "mutter", band <= -2 ? "ownDown" : "mutterDown", 1 + Math.abs(band) * 0.5);
        }
      }
    } else {
      this.mood += (this.realizedPct * 6 - this.mood) * Math.min(1, dt * 0.05);
    }
    this.mood = clamp(this.mood, -1, 1);

    if (this.tradeCd <= 0 && this.mode === "seated" && !this.overlay) {
      this.tradeCd = fx.range(20, 45);
      this.decideTrade();
    }
  }

  private decideTrade() {
    const m = this.host.market;
    const s = this.profile.strategy;
    if (!s) return;
    const ids = m.assetIds;
    if (!this.pos) {
      let pick: string | null = null;
      if (s === "late") {
        // buys only after it's "obvious"
        let best = 0.02;
        for (const id of ids) {
          const r = m.recentReturn(id, 8);
          if (r > best) {
            best = r;
            pick = id;
          }
        }
      } else if (s === "quiet") {
        if (fx.chance(0.35)) {
          let worst = -0.025;
          for (const id of ids) {
            const r = m.recentReturn(id, 15);
            if (r < worst) {
              worst = r;
              pick = id;
            }
          }
        }
      } else if (s === "pattern") {
        if (fx.chance(0.4)) pick = fx.pick(this.profile.favorites);
      } else if (s === "hodl") {
        if (fx.chance(0.3)) pick = fx.pick(this.profile.favorites);
      } else if (s === "bag") {
        pick = this.profile.favorites[0];
      }
      if (pick) {
        const q = m.quote(pick);
        this.pos = { assetId: pick, qty: 100 / q.ask, entry: q.ask, openedTick: m.tick };
        this.lastBand = 0;
        this.bandPeak = 0;
        this.typing = 2.5;
        this.host.onNpcTrade(this, "BUY", 0);
        if (fx.chance(this.profile.energy)) this.say("buy", { sym: m.config(pick).symbol }, this.profile.energy < 0.5);
      }
    } else {
      const q = m.quote(this.pos.assetId);
      const pnl = (q.bid * 0.999) / (this.pos.entry * 1.001) - 1;
      const heldMin = (m.tick - this.pos.openedTick) / 40;
      let sell = false;
      if (s === "late") sell = pnl < -0.04 || pnl > 0.03 || heldMin > 25;
      else if (s === "quiet") sell = pnl > 0.02 || pnl < -0.06;
      else if (s === "pattern") sell = heldMin > fx.range(8, 20) || Math.abs(pnl) > 0.05;
      else if (s === "hodl") sell = pnl > 0.08 && fx.chance(0.3);
      else if (s === "bag") sell = false;
      if (sell) this.closePosition(pnl);
    }
  }

  closePosition(pnl: number) {
    this.pos = null;
    this.realizedPct = pnl;
    this.lastBand = 0;
    this.typing = 1.5;
    this.host.onNpcTrade(this, "SELL", pnl);
  }

  /** Describe current position for dialogue. */
  positionVars(): { sym: string; pct: string; pnl: number } | null {
    if (!this.pos) return null;
    const m = this.host.market;
    const q = m.quote(this.pos.assetId);
    const pnl = (q.bid * 0.999) / (this.pos.entry * 1.001) - 1;
    return { sym: m.config(this.pos.assetId).symbol, pct: `${(Math.abs(pnl) * 100).toFixed(1)}%`, pnl };
  }

  // ------------------------------------------------------------- routine

  thinkRoutine(dt: number) {
    if (!this.present || this.busyEvent > 0) return;
    this.activityCd -= dt;
    if (this.activityCd > 0 || this.overlay || this.talkUntil > this.host.time()) return;
    if (this.mode !== "seated" && !(this.mode === "spot" && this.id === "owner")) return;
    this.activityCd = fx.range(35, 90);
    const r = this.profile.routine;
    if (!r.length) return;
    // mostly stay put
    if (fx.chance(this.id === "owner" ? 0.35 : 0.5)) {
      if (this.seated && fx.chance(0.3)) this.play("stretch");
      return;
    }
    const total = r.reduce((a, b) => a + b.weight, 0);
    let pick = fx.next() * total;
    let kind: SpotKind = r[0].kind;
    for (const it of r) {
      pick -= it.weight;
      if (pick <= 0) {
        kind = it.kind;
        break;
      }
    }
    this.doActivity(kind);
  }

  doActivity(kind: SpotKind) {
    const back = () => (this.station ? this.goSit() : this.goHomeOwner());
    switch (kind) {
      case "fridge":
        this.startSpot("fridge", "fridgeFront", Math.PI / 2, 3.2, back);
        break;
      case "window":
        this.startSpot("window", "window", 0, fx.range(10, 18), back);
        break;
      case "whiteboard":
        this.startSpot("whiteboard", "wbStand", Math.PI / 2, fx.range(12, 20), back);
        break;
      case "couch":
        this.startSpot("couch", "couch", Math.PI, fx.range(15, 30), back);
        break;
      case "serverWindow":
        this.startSpot("serverWindow", "serverWindow", 0, fx.range(8, 14), back);
        break;
      case "bigView":
        this.startSpot("bigView", "bigView", 0, fx.range(6, 10), back);
        break;
      case "counter":
        this.startSpot("counter", "counterFront", -Math.PI / 2, fx.range(6, 10), back);
        break;
      case "mural":
        this.startSpot("mural", "muralStand", 0, fx.range(5, 8), back);
        break;
      case "printFlex":
        this.startSpot("counter", "counterFront", -Math.PI / 2, 3, () => {
          this.startSpot("printFlex", "muralStand", 0, 3.5, back);
        });
        break;
      case "rounds":
        this.goTo("a-12.9", () => {
          this.mode = "spot";
          this.spot = { kind: "rounds", t: 0, dur: 3, yaw: 0, onEnd: () => this.goHomeOwner() };
        });
        break;
      case "wipe":
        this.play("wipe", 5);
        break;
      case "timers":
        this.lookAt(new THREE.Vector3(1.7, 1.2, -1.95), 4);
        break;
    }
  }

  goHomeOwner() {
    this.goTo("ownerSpot", () => {
      this.mode = "spot";
      this.spot = { kind: "counter", t: 0, dur: 1e9, yaw: Math.PI / 2 };
    });
  }

  // ------------------------------------------------------------- update

  update(dt: number, time: number) {
    if (!this.present) return;
    const rig = this.rig;
    rig.resetTarget();
    const T = rig.target;
    const st = this.station;

    // ---- movement / transitions
    if (this.mode === "walk") this.walk(dt);
    else if ((this.mode === "sitting" || this.mode === "standing") && this.transition) {
      const tr = this.transition;
      tr.t += dt / tr.dur;
      const k = Math.min(1, tr.t);
      const e = k * k * (3 - 2 * k);
      const p = tr.from.clone().lerp(tr.to, e);
      this.rig.root.position.set(p.x, 0, p.z);
      this.rig.root.rotation.y = tr.fromYaw + wrapAngle(tr.toYaw - tr.fromYaw) * e;
      this.seatBlend = this.mode === "sitting" ? e : 1 - e;
      this.x = p.x;
      this.z = p.z;
      this.yaw = this.rig.root.rotation.y;
      if (k >= 1) {
        this.transition = null;
        if (this.mode === "standing") {
          this.mode = "spot";
          this.spot = { kind: "counter", t: 0, dur: 0.01, yaw: null };
          this.navAt = st ? `stand-${st.def.id}` : this.navAt;
          this.circle.enabled = true;
        }
        tr.then();
      }
    } else if (this.mode === "spot" && this.spot) {
      const sp = this.spot;
      sp.t += dt;
      if (sp.yaw !== null) this.yaw += wrapAngle(sp.yaw - this.yaw) * damp(6, dt);
      this.syncRoot();
      this.spotBehaviour(sp.kind, sp.t, dt);
      if (sp.t >= sp.dur && !this.overlay) {
        this.spot = null;
        this.mode = "spot";
        const end = sp.onEnd;
        if (end) end();
        else this.spot = { kind: "counter", t: 0, dur: 1e9, yaw: null };
      }
    }
    if (this.mode === "seated") this.seatBlend = 1;

    // ---- chair swivel toward look target when seated
    if (this.mode === "seated" && st) {
      st.chairYaw += (this.chairTarget - st.chairYaw) * damp(3, dt);
    }

    // ---- base pose
    const sb = this.seatBlend;
    if (sb > 0.01) {
      const seatHip = 0.56;
      T.hipsY = (seatHip - rig.hipHeight) * sb;
      T.hipLX = 1.45 * sb;
      T.hipRX = 1.45 * sb;
      T.knLX = 1.5 * sb;
      T.knRX = 1.5 * sb;
      T.hipLZ = -0.08 * sb;
      T.hipRZ = 0.08 * sb;
      T.spineX = 0.08 * sb;
      T.shLX = 0.35 * sb;
      T.shRX = 0.35 * sb;
      T.elLX = 0.9 * sb;
      T.elRX = 0.9 * sb;
    }
    if (this.mode === "walk") {
      const ph = this.walkPhase;
      const sw = Math.sin(ph);
      T.hipLX = sw * 0.5;
      T.hipRX = -sw * 0.5;
      T.knLX = Math.max(0, -Math.cos(ph)) * 0.7 + 0.1;
      T.knRX = Math.max(0, Math.cos(ph)) * 0.7 + 0.1;
      T.shLX = -sw * 0.4;
      T.shRX = sw * 0.4;
      T.elLX = 0.35;
      T.elRX = 0.35;
      T.hipsY = -Math.abs(Math.cos(ph)) * 0.025;
      T.spineY = sw * 0.06;
      T.spineX = 0.05;
    } else if (sb < 0.5) {
      // idle standing: weight shift
      T.hipsZ = Math.sin(time * 0.7 + this.x) * 0.01;
      T.spineZ = Math.sin(time * 0.5 + this.z) * 0.02;
    }

    // ---- typing when seated & idle
    this.typing -= dt;
    const turned = !!st && Math.abs(st.chairYaw) > 0.55;
    const seatedIdle = this.mode === "seated" && !this.overlay && !turned;
    if (this.mode === "seated" && !this.overlay && turned) {
      // swiveled away from the desk: hands on the knees, leaning back a bit
      T.spineX = -0.05;
      T.shLX = 0.55;
      T.shRX = 0.55;
      T.elLX = 0.6;
      T.elRX = 0.6;
      T.shLZ = -0.05;
      T.shRZ = 0.05;
      T.gripL = 0.2;
      T.gripR = 0.2;
    }
    if (seatedIdle) {
      const tp = this.typing > 0 || (Math.sin(time * 0.31 + this.x * 3) > 0.35 && this.profile.energy > 0.3);
      // lean toward the screen, hands at the keyboard
      T.spineX = 0.18;
      T.shLX = 0.95;
      T.shRX = 0.95;
      T.elLX = 0.75;
      T.elRX = 0.75;
      T.shLZ = 0.12;
      T.shRZ = -0.12;
      T.wrLX = -0.2;
      T.wrRX = -0.2;
      if (tp) {
        T.wrLX += Math.sin(time * 17 + 1) * 0.12;
        T.wrRX += Math.sin(time * 15) * 0.12;
        T.gripL = 0.5 + Math.sin(time * 19) * 0.3;
        T.gripR = 0.5 + Math.sin(time * 21 + 2) * 0.3;
      } else {
        // right hand on the mouse
        T.shRZ = -0.02;
        T.wrRX = -0.1 + Math.sin(time * 2.1) * 0.05;
      }
      T.headX = -0.15;
      if (this.id === "lurker") {
        T.spineX = 0.32;
        T.headX = 0.05;
      }
    }

    // ---- spot-specific poses
    if (this.mode === "spot" && this.spot) {
      const k = this.spot.kind;
      if (k === "couch") {
        T.hipsY = (0.5 - rig.hipHeight);
        T.hipLX = 1.4;
        T.hipRX = 1.4;
        T.knLX = 1.3;
        T.knRX = 1.3;
        T.spineX = -0.15;
        T.headX = -0.05;
        T.shLZ = -0.3;
        T.shRZ = 0.3;
      } else if (k === "window" || k === "serverWindow" || k === "bigView" || k === "mural") {
        T.shLX = 0.2;
        T.shRX = 0.2;
        T.shLZ = 0.25;
        T.shRZ = -0.25;
        T.elLX = 1.2;
        T.elRX = 1.2; // arms crossed-ish
        T.headX = k === "bigView" ? 0.12 : 0;
      }
    }

    // ---- reaction overlay
    if (this.overlay) {
      const o = this.overlay;
      o.t += dt;
      const k = Math.min(1, o.t / o.dur);
      const env = Math.min(1, o.t / 0.25, (o.dur - o.t) / 0.35);
      this.applyOverlay(o.kind, k, env, time, T);
      if (o.t >= o.dur) {
        if (o.kind === "drink") this.host.onNpcDrinkDone(this);
        this.overlay = null;
        this.dropHandProp();
      }
    }

    // ---- face: mood baseline
    const mood = this.mood;
    if (!this.overlay || this.overlay.kind === "type") {
      T.mouth = 0.1 + mood * 0.55;
      T.browL = T.browR = mood < -0.3 ? 0.25 : mood > 0.5 ? -0.05 : 0;
      T.browY = mood > 0.4 ? 0.4 : 0;
    }
    if (this.id === "owner") T.lid = Math.max(T.lid, 0.42);
    if (this.id === "nightshift") T.lid = Math.max(T.lid, 0.32);
    if (this.id === "lurker") T.lid = Math.max(T.lid, 0.28);
    if (this.annoyed > 0) {
      this.annoyed -= dt;
      T.browL = T.browR = -0.35;
      T.mouth = -0.4;
    }
    // talking mouth flap
    if (this.talkUntil > time) {
      T.mouthOpen = Math.max(T.mouthOpen, (Math.sin(time * 18) * 0.5 + 0.5) * 0.6);
      T.headX += Math.sin(time * 7) * 0.03;
    }

    // ---- look at
    let target: THREE.Vector3 | null = null;
    if (this.lookPlayerUntil > time || this.talkUntil > time + 0.5) target = this.host.playerHead();
    else if (this.lookTarget && this.lookUntil > time) target = this.lookTarget;
    this.chairTarget = 0;
    if (target) this.applyLook(target, T, dt);
    else {
      // glance around occasionally
      T.eyeX = Math.sin(time * 0.37 + this.z) * 0.25;
      T.eyeY = Math.sin(time * 0.23 + this.x) * 0.1;
    }

    rig.update(dt, time);

    // keep collision circle in sync
    this.circle.x = this.x;
    this.circle.z = this.z;
  }

  private applyLook(target: THREE.Vector3, T: Pose, dt: number) {
    this.rig.root.updateMatrixWorld(true);
    tmpM.copy(this.rig.root.matrixWorld).invert();
    tmpV.copy(target).applyMatrix4(tmpM);
    const head = this.rig.j.head;
    const headLocalY = this.rig.hipHeight + T.hipsY + 0.75;
    void head;
    let yaw = Math.atan2(-tmpV.x, -tmpV.z);
    const dist = Math.hypot(tmpV.x, tmpV.z);
    const pitch = Math.atan2(tmpV.y - headLocalY, Math.max(0.2, dist));
    if (this.mode === "seated") {
      // swivel the chair for big turns
      const st = this.station;
      if (st && Math.abs(yaw) > 0.7) {
        this.chairTarget = clamp(st.chairYaw + yaw * 0.7, -2.2, 2.2);
      } else if (st) this.chairTarget = st.chairYaw;
    } else if (this.mode === "spot" && Math.abs(yaw) > 1.2 && this.spot) {
      // turn the body when standing
      this.yaw += clamp(yaw, -1, 1) * damp(3, dt);
    }
    yaw = clamp(yaw, -1.1, 1.1);
    T.headY = yaw * 0.75;
    T.spineY += yaw * 0.25;
    T.headX = clamp(pitch, -0.5, 0.5);
    T.eyeX = clamp(-yaw * 0.35, -0.6, 0.6);
    T.eyeY = clamp(pitch * 0.6, -0.5, 0.5);
  }

  private applyOverlay(kind: Overlay, k: number, env: number, time: number, T: Pose) {
    const e = env;
    switch (kind) {
      case "leanIn":
        T.spineX += 0.35 * e;
        T.headX -= 0.1 * e;
        T.lid = 0;
        T.browY = 0.8 * e;
        T.mouthOpen = 0.35 * e;
        T.mouth = 0.3;
        break;
      case "celebrate": {
        const b = Math.abs(Math.sin(k * Math.PI * 4));
        T.shLX = 2.8 * e;
        T.shRX = 2.8 * e;
        T.shLZ = -0.35 * e;
        T.shRZ = 0.35 * e;
        T.elLX = 0.4;
        T.elRX = 0.4;
        T.gripL = 1;
        T.gripR = 1;
        T.spineX -= 0.15 * e;
        T.hipsY += b * 0.04 * e * (this.seatBlend > 0.5 ? 0.5 : 1);
        T.mouthOpen = 0.9 * e;
        T.mouth = 0.9;
        T.browY = 1;
        T.lid = 0;
        T.headX = 0.25 * e;
        break;
      }
      case "fistPump": {
        const pump = Math.sin(k * Math.PI * 3);
        T.shRX = (1.5 + pump * 0.4) * e;
        T.shRZ = 0.3 * e;
        T.elRX = 1.9 * e;
        T.gripR = 1;
        T.mouth = 0.8;
        T.mouthOpen = 0.4 * e;
        T.browY = 0.6;
        break;
      }
      case "headInHands":
        T.shLX = 2.3 * e;
        T.shRX = 2.3 * e;
        T.shLZ = -0.55 * e;
        T.shRZ = 0.55 * e;
        T.elLX = 2.25 * e;
        T.elRX = 2.25 * e;
        T.headX = -0.15 * e;
        T.spineX += 0.15 * e;
        T.mouth = -0.7;
        T.mouthOpen = 0.25 * e;
        T.browL = T.browR = 0.5;
        T.lid = 0.1;
        break;
      case "facepalm":
        T.shRX = 2.0 * e;
        T.shRZ = -0.25 * e;
        T.elRX = 2.4 * e;
        T.headX = -0.3 * e;
        T.mouth = -0.5;
        T.browL = T.browR = 0.4;
        break;
      case "mutter":
        T.headY += Math.sin(time * 5) * 0.12 * e;
        T.headX = -0.1 * e;
        T.mouth = -0.45;
        T.mouthOpen = (Math.sin(time * 14) * 0.5 + 0.5) * 0.25 * e;
        T.browL = T.browR = -0.2;
        break;
      case "shrug":
        T.shLZ = -0.6 * e;
        T.shRZ = 0.6 * e;
        T.elLX = 1.5 * e;
        T.elRX = 1.5 * e;
        T.headZ = 0.15 * e;
        T.browY = 0.6;
        T.mouth = -0.1;
        break;
      case "nod":
        T.headX = Math.sin(k * Math.PI * 4) * 0.2 * e;
        break;
      case "talk":
        T.shRX = (0.6 + Math.sin(time * 3) * 0.2) * e;
        T.elRX = 1.2 * e;
        T.shRZ = 0.2 * e;
        T.gripR = 0.2;
        break;
      case "drink": {
        const up = Math.sin(k * Math.PI);
        T.shRX = 1.6 * up + 0.3;
        T.shRZ = 0.25 * up;
        T.elRX = 2.3 * up + 0.3;
        T.headX = 0.35 * up;
        T.gripR = 0.9;
        break;
      }
      case "stretch":
        T.shLX = 3.0 * e;
        T.shRX = 3.0 * e;
        T.elLX = 0.6 * e;
        T.elRX = 0.6 * e;
        T.spineX -= 0.25 * e;
        T.headX = 0.3 * e;
        T.mouthOpen = 0.7 * Math.sin(k * Math.PI);
        T.lid = 0.8 * Math.sin(k * Math.PI);
        break;
      case "startled":
        T.shLX = 1.2 * e;
        T.shRX = 1.2 * e;
        T.elLX = 1.8 * e;
        T.elRX = 1.8 * e;
        T.spineX -= 0.2 * e;
        T.lid = 0;
        T.browY = 1;
        T.mouthOpen = 0.6 * e;
        break;
      case "showReceipt":
        T.shRX = 1.5 * e;
        T.shRZ = 0.15 * e;
        T.elRX = 0.4 * e;
        T.wrRX = -0.6;
        T.mouth = 0.7;
        T.browY = 0.5;
        break;
      case "wave":
        T.shRX = 2.6 * e;
        T.shRZ = 0.5 * e;
        T.elRX = 0.5 + Math.sin(time * 10) * 0.4;
        T.gripR = 0;
        T.mouth = 0.6;
        break;
      case "shakeOff":
        T.spineY += Math.sin(time * 22) * 0.12 * e;
        T.shLZ = -0.4 * e;
        T.shRZ = 0.4 * e;
        T.headZ = Math.sin(time * 20) * 0.1 * e;
        T.lid = 0.6;
        break;
      case "point":
        T.shRX = 1.55 * e;
        T.shRZ = 0.1 * e;
        T.elRX = 0.15;
        T.gripR = 0.8;
        break;
      case "wipe":
        T.shRX = 1.1 * e;
        T.elRX = 1.0 * e;
        T.shRZ = (0.3 + Math.sin(time * 4) * 0.25) * e;
        T.spineX += 0.2 * e;
        T.headX = -0.4 * e;
        break;
      case "draw":
        T.shRX = (2.0 + Math.sin(time * 3.1) * 0.25) * e;
        T.shRZ = (0.2 + Math.sin(time * 2.3) * 0.3) * e;
        T.elRX = 0.7 * e;
        T.gripR = 0.9;
        T.headX = 0.05;
        break;
      case "type":
        break;
    }
  }

  private spotBehaviour(kind: SpotKind, t: number, _dt: number) {
    void _dt;
    if (kind === "fridge" && t > 0.4 && t < 0.5 && !this.overlay) {
      this.play("drink", 2.4);
      this.host.sfx("canOpen", new THREE.Vector3(this.x, 1.2, this.z), 0.7);
      if (fx.chance(0.5)) this.say("fridge", {}, true);
    }
    if (kind === "whiteboard") {
      if (!this.overlay && t > 0.5) this.play("draw", 3);
      this.host.onWizardDraw(this, _dt);
      if (t > 1 && t - _dt <= 1) {
        const pf = this.host.playerFeet();
        // asks for board space if the player is hogging it
        if (Math.hypot(pf.x - this.x, pf.z - this.z) < 2.2) {
          this.lookAtPlayer(2.5);
          this.sayText("Mind if I borrow some board space? The pattern is forming.");
        } else this.say("board", {}, false);
      }
    }
    if (kind === "window" && t > 2 && t < 2.05 && fx.chance(0.5)) this.say("rain", {}, true);
    if (kind === "bigView") this.lookAt(this.host.bigScreen, 1);
    if (kind === "printFlex" && t > 0.3 && t < 0.35) {
      this.play("showReceipt", 2.5);
      this.host.onNpcPrintFlex(this);
    }
    if (kind === "mural") this.lookAt(new THREE.Vector3(1.55, 1.45, -13.9), 1);
    if (kind === "serverWindow") this.lookAt(new THREE.Vector3(0, 1.4, -20), 1);
  }

  private walk(dt: number) {
    const tgt = this.path[0];
    if (!tgt) {
      this.mode = "spot";
      this.spot = { kind: "counter", t: 0, dur: 0.01, yaw: null };
      const cb = this.onArrive;
      this.onArrive = null;
      cb?.();
      return;
    }
    const dx = tgt.x - this.x;
    const dz = tgt.z - this.z;
    const d = Math.hypot(dx, dz);
    // wait politely if the player stands right in the way
    const pf = this.host.playerFeet();
    const toP = Math.hypot(pf.x - this.x, pf.z - this.z);
    const ahead = d > 0.01 ? ((pf.x - this.x) * dx + (pf.z - this.z) * dz) / d : 0;
    if (toP < 0.75 && ahead > 0.1 && this.waitT < 2.2) {
      this.waitT += dt;
      if (this.waitT > 1.0 && this.waitT - dt <= 1.0) this.sayText(fx.pick(["'Scuse me.", "Coming through.", "Sorry, just—"]), true);
      this.syncRoot();
      return;
    }
    if (toP > 1.2) this.waitT = 0;
    const step = WALK_SPEED * dt;
    const desiredYaw = Math.atan2(-dx, -dz);
    this.yaw += wrapAngle(desiredYaw - this.yaw) * damp(8, dt);
    if (d <= step) {
      this.x = tgt.x;
      this.z = tgt.z;
      this.navAt = tgt.id;
      this.path.shift();
    } else {
      this.x += (dx / d) * step;
      this.z += (dz / d) * step;
    }
    this.walkPhase += step * 4.6;
    this.syncRoot();
  }
}
