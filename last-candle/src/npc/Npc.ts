import * as THREE from "three";
import { clamp, damp, wrapAngle } from "../core/math";
import { fx } from "../core/rng";
import type { MarketEngine } from "../market/MarketEngine";
import type { DynCircle } from "../world/Collision";
import { L } from "../world/layout";
import { DESK_FRONT, type StationVisual } from "../world/Station";
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
  | "type"
  | "sigh"
  | "explain"
  | "pushBack"
  | "deflate"
  | "smile";

/** Things that happen to an NPC's own simulated position; the social layer decides who reacts. */
export type SocialEvent = "buy" | "closeWin" | "closeLoss" | "earlyWin" | "deflate" | "boughtTop";

export interface SimPosition {
  assetId: string;
  qty: number;
  entry: number;
  openedTick: number;
  /** Asset return over the candles right before the buy (a chase when large). */
  chased?: number;
  celebrated?: boolean;
  deflated?: boolean;
  pushedBack?: boolean;
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
  /** Advance the Wizard's drawing; true while there is still something to draw. */
  onWizardDraw(npc: Npc, dt: number): boolean;
  onWizardVisit(npc: Npc): void;
  onNpcTrade(npc: Npc, side: "BUY" | "SELL", pnlPct: number): void;
  onNpcPrintFlex(npc: Npc): void;
  onNpcDrinkDone(npc: Npc): void;
  requestReaction(npc: Npc, kind: Overlay, line: LineKey | null, priority: number): void;
  /** Something worth looking at for a casual glance (a neighbor, the player, the big screen). */
  glanceTarget(npc: Npc): THREE.Vector3 | null;
  social(npc: Npc, ev: SocialEvent, vars: Record<string, string>): void;
  bigScreen: THREE.Vector3;
  circle(npc: Npc): DynCircle;
}

const WALK_SPEED = 1.15;

/** Seated micro-activities: picked one after another with damped transitions between them. */
type SeatAct = "type" | "mouse" | "read" | "glance" | "fidget" | "leanBack" | "explain" | "sip" | "sigh";
const ACTS: Record<string, Partial<Record<SeatAct, number>>> = {
  topbuyer: { type: 3, mouse: 2, glance: 3, fidget: 3, sip: 1 },
  lurker: { type: 2, mouse: 3, read: 3, glance: 1.5, sip: 0.6 },
  wizard: { type: 2, mouse: 2, read: 1, explain: 2.5, glance: 1, sip: 1 },
  nightshift: { type: 1.5, mouse: 1.5, read: 2, leanBack: 2.5, sip: 2 },
  default: { type: 3, mouse: 2, read: 1, glance: 1, sip: 1 },
};
const ACT_DUR: Record<SeatAct, [number, number]> = {
  type: [3, 7],
  mouse: [3, 6],
  read: [4, 8],
  glance: [1.6, 3],
  fidget: [3, 6],
  leanBack: [6, 11],
  explain: [2.8, 3.8],
  sip: [2.4, 2.4],
  sigh: [2.6, 2.6],
};

interface Posture {
  lean: number; // spine toward the screen
  head: number;
  slide: number; // chair rolled back (m)
  tilt: number; // chair tipped forward (rad)
  typeSpeed: number;
  /** How big gestures get (Owner and Lurker economical, Wizard and Top Buyer large). */
  gesture: number;
  /** Body animation speed (Lurker slow and discreet, Top Buyer jittery). */
  speed: number;
}
const POSTURE: Record<string, Posture> = {
  owner: { lean: 0.15, head: 0, slide: 0, tilt: 0, typeSpeed: 0.8, gesture: 0.6, speed: 0.8 },
  topbuyer: { lean: 0.36, head: 0.05, slide: 0, tilt: 0.08, typeSpeed: 1.3, gesture: 1.15, speed: 1.3 },
  lurker: { lean: 0.32, head: 0.18, slide: 0, tilt: 0.03, typeSpeed: 0.85, gesture: 0.55, speed: 0.6 },
  wizard: { lean: 0.14, head: 0, slide: 0.03, tilt: 0, typeSpeed: 1.1, gesture: 1.2, speed: 1.05 },
  nightshift: { lean: 0.0, head: 0.04, slide: 0.1, tilt: -0.06, typeSpeed: 0.6, gesture: 0.8, speed: 0.8 },
  default: { lean: 0.18, head: 0, slide: 0, tilt: 0, typeSpeed: 1, gesture: 1, speed: 1 },
};

/** Resting face per character: lids, mouth, brow height. */
const FACE: Record<string, { lid: number; mouth: number; browY: number }> = {
  owner: { lid: 0.3, mouth: -0.05, browY: 0 },
  topbuyer: { lid: 0.04, mouth: 0.15, browY: 0.35 },
  lurker: { lid: 0.24, mouth: 0, browY: -0.1 },
  wizard: { lid: 0.06, mouth: 0.3, browY: 0.45 },
  nightshift: { lid: 0.24, mouth: 0.3, browY: 0 },
  courier: { lid: 0.12, mouth: 0.2, browY: 0 },
};

function stdMat(color: string, rough = 0.6, metal = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

/** Each regular's own drink: Night Shift's reusable tumbler, the Wizard's mug, cans for the rest. */
function makeCup(id: string): THREE.Object3D {
  const g = new THREE.Group();
  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, x = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, 0);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  if (id === "nightshift") {
    part(new THREE.CylinderGeometry(0.035, 0.03, 0.16, 16), stdMat("#9aa1a6", 0.35, 0.6), 0.08);
    part(new THREE.CylinderGeometry(0.0365, 0.0365, 0.028, 16), stdMat("#c9822e", 0.5), 0.172);
    part(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8), stdMat("#2c2a27", 0.7), 0.192, 0.012);
    part(new THREE.CylinderGeometry(0.0335, 0.033, 0.022, 16), stdMat("#2c2a27", 0.8), 0.05);
  } else if (id === "wizard") {
    part(new THREE.CylinderGeometry(0.04, 0.037, 0.095, 16), stdMat("#e8e2d0", 0.5), 0.0475);
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.007, 6, 12), stdMat("#e8e2d0", 0.5));
    h.position.set(0.045, 0.05, 0);
    g.add(h);
    const tri = new THREE.Mesh(new THREE.CircleGeometry(0.018, 3), new THREE.MeshBasicMaterial({ color: "#2b4fa8" }));
    tri.position.set(0, 0.05, -0.0395);
    tri.rotation.set(0, Math.PI, Math.PI / 2);
    g.add(tri);
  } else {
    const c = id === "topbuyer" ? "#cde03a" : id === "lurker" ? "#2a2d33" : "#b8452f";
    part(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 14), stdMat(c, 0.35, 0.5), 0.06);
    part(new THREE.CylinderGeometry(0.029, 0.033, 0.008, 14), stdMat("#c8c8c8", 0.3, 0.8), 0.124);
  }
  return g;
}

function makeMarker(): THREE.Object3D {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.1, 8), stdMat("#f2efe6", 0.5));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.035, 8), stdMat("#2b4fa8", 0.5));
  cap.position.y = 0.06;
  g.add(body, cap);
  return g;
}
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
  overlay: { kind: Overlay; t: number; dur: number; ambient: boolean } | null = null;
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
  typing = 0;
  private walkPhase = 0;
  private transition: { from: THREE.Vector3; mid?: THREE.Vector3; to: THREE.Vector3; fromYaw: number; toYaw: number; t: number; dur: number; then: () => void } | null = null;
  private seatBlend = 0;
  private waitT = 0;
  private propInHand: THREE.Object3D | null = null;
  private used = new Map<LineKey, number>();
  private keyAt = new Map<LineKey, number>();
  readonly circle: DynCircle;
  /** When >0 the NPC was recently hit and is annoyed at the player. */
  annoyed = 0;
  private chairTarget = 0;
  talkedTonight = false;
  busyEvent = 0;
  /** Symbol of the last position opened / closed (for receipts). */
  lastSymbol: string | null = null;
  realizedSymbol: string | null = null;
  private act: { kind: SeatAct; t: number; dur: number } = { kind: "type", t: 0, dur: 4 };
  private cup: THREE.Object3D | null = null;
  private cupInHand = false;
  private marker: THREE.Object3D | null = null;
  private carryingCan = false;
  private standPush = 0;
  private softLook = false;
  /** Already swore off trading tonight ("That was my last trade. Again."). */
  vowed = false;
  /** Chair turned toward the player for a conversation. */
  convo = false;
  private explained = false;
  /** After a chat: turn back to the screen even while finishing a sentence. */
  private turnAwayUntil = 0;
  private timers: { at: number; fn: () => void }[] = [];
  private readonly posture: Posture;

  constructor(
    readonly profile: NpcProfile,
    private host: NpcHost,
  ) {
    this.rig = new CharacterRig(LOOKS[profile.id]);
    this.name = NAMES[profile.id] ?? profile.id;
    this.rig.root.visible = false;
    host.scene.add(this.rig.root);
    this.circle = host.circle(this);
    this.posture = POSTURE[profile.id] ?? POSTURE.default;
    this.rig.speed = this.posture.speed;
    if (profile.station && profile.id !== "owner") this.cup = makeCup(profile.id);
    if (profile.id === "wizard") {
      this.marker = makeMarker();
      this.marker.position.set(0, -0.04, -0.035);
      this.marker.rotation.set(0, 0, Math.PI / 2 - 0.3);
      this.rig.handR.add(this.marker);
    }
    this.rig.root.traverse((o) => (o.userData.npcId = profile.id));
  }

  /** Hands on the keys right now (for the nearby-keyboard audio layer). */
  get typingNow(): boolean {
    if (this.mode !== "seated" || (this.overlay && !this.overlay.ambient) || this.convo) return false;
    return this.typing > 0 || this.act.kind === "type" || this.act.kind === "fidget";
  }

  /** Why this NPC can't chat right now (walking, mid-task), or null when they can. */
  busyReason(): "walking" | "busy" | null {
    if (this.mode === "walk" || this.mode === "sitting" || this.mode === "standing") return "walking";
    if (this.busyEvent > 0) return "busy";
    if (this.overlay && !this.overlay.ambient && (this.overlay.kind === "draw" || this.overlay.kind === "wipe" || this.overlay.kind === "showReceipt")) return "busy";
    if (this.mode === "spot" && this.spot && (this.spot.kind === "whiteboard" || this.spot.kind === "printFlex")) return "busy";
    return null;
  }

  /** THE CHAIR TURN: swivel round to face the player for a chat. */
  beginConvo() {
    this.turnAwayUntil = 0;
    if (this.overlay?.ambient) {
      if (this.cupInHand) this.cupHome();
      this.overlay = null;
    }
    this.convo = this.mode === "seated";
    this.lookPlayerUntil = this.host.time() + 3;
  }

  /** ...then back to the screen. */
  endConvo() {
    if (!this.convo) return;
    this.convo = false;
    this.lookPlayerUntil = 0;
    this.lookTarget = null;
    this.turnAwayUntil = this.host.time() + 5;
    this.act = { kind: "type", t: 0, dur: fx.range(3, 6) };
    if (fx.chance(0.6)) this.after(0.2, () => this.say("chairBack", {}, true));
  }

  /** Run something after a delay (game time), unless the NPC leaves first. */
  after(sec: number, fn: () => void) {
    this.timers.push({ at: this.host.time() + sec, fn });
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
    return this.present && (!this.overlay || this.overlay.ambient) && this.mode !== "sitting" && this.mode !== "standing" && this.busyEvent <= 0 && !this.convo;
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
    this.keyAt.set(key, this.host.time());
    this.host.say(this, t, quiet, loud);
    return true;
  }

  /** Used this kind of line in the last `sec` seconds (keeps running gags from wearing out). */
  saidWithin(key: LineKey, sec: number): boolean {
    const t = this.keyAt.get(key);
    return t !== undefined && this.host.time() - t < sec;
  }

  sayText(t: string, quiet = false, loud = false) {
    this.host.say(this, t, quiet, loud);
  }

  /** Called by the speech layer when a line actually starts (mouth flap + facing). */
  markTalking(text: string) {
    this.talkUntil = this.host.time() + Math.min(4, 0.8 + text.length * 0.045);
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
    st.chairSlide = st.slideTarget = this.posture.slide;
    st.chairTilt = st.tiltTarget = this.posture.tilt;
    this.cupHome();
  }

  /** The personal cup lives on the desk, left of the keyboard. */
  private cupHome() {
    const st = this.station;
    if (!this.cup || !st) return;
    st.root.add(this.cup);
    this.cup.position.set(-0.47, L.deskH, -(DESK_FRONT + 0.17));
    this.cup.rotation.set(0, 0.5, 0);
    this.cupInHand = false;
  }

  private cupToHand() {
    if (!this.cup) return;
    this.rig.handR.add(this.cup);
    this.cup.position.set(0.0, -0.02, -0.035);
    this.cup.rotation.set(0, 0, Math.PI);
    this.cup.scale.setScalar(1);
    this.cupInHand = true;
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
    this.timers = [];
    this.convo = false;
    if (this.cupInHand) this.cupHome();
    this.dropHandProp();
    this.carryingCan = false;
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
    if (this.cupInHand) this.cupHome();
    this.convo = false;
    this.detach();
    const from = this.rig.root.position.clone();
    from.y = 0;
    const back = st.toWorldDir(0, 0, 1);
    const mid = from.clone().addScaledVector(back, 0.22);
    const to = new THREE.Vector3(st.def.stand[0], 0, st.def.stand[1]);
    this.mode = "standing";
    this.transition = { from, mid, to, fromYaw: this.rig.root.rotation.y, toYaw: st.def.facing + Math.PI, t: 0, dur: 1.15, then };
    this.chairTarget = 0;
    st.slideTarget = 0.24; // people leave the chair pushed out
    st.tiltTarget = 0;
    this.host.sfx("chair", from, 0.5);
  }

  /** Walk home and sit down. */
  goSit() {
    const st = this.station;
    if (!st) return;
    this.goTo(`stand-${st.def.id}`, () => {
      this.detach();
      const from = new THREE.Vector3(this.x, 0, this.z);
      // pull the chair out first; the seat target is where it will be
      st.slideTarget = 0.24;
      st.tiltTarget = 0;
      st.chairSpin = 0;
      const seat = st.toWorld(0, 0, Math.max(st.chairSlide, 0.2) + 0.06);
      seat.y = 0;
      this.mode = "sitting";
      this.circle.enabled = false;
      this.transition = {
        from,
        to: seat,
        fromYaw: this.yaw,
        toYaw: st.def.facing + st.chairYaw,
        t: 0,
        dur: 0.95,
        then: () => {
          this.mode = "seated";
          st.swivel.attach(this.rig.root);
          this.rig.root.position.set(0, -0.47, 0.06);
          this.rig.root.rotation.set(0, 0, 0);
          this.x = st.def.chair[0];
          this.z = st.def.chair[2];
          this.yaw = st.def.facing;
          // scoot in
          st.slideTarget = this.posture.slide;
          st.tiltTarget = this.posture.tilt;
          if (this.carryingCan) {
            this.carryingCan = false;
            this.dropHandProp();
            this.host.onNpcDrinkDone(this);
          }
          this.act = { kind: "type", t: 0, dur: fx.range(2, 4) };
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

  lookAt(p: THREE.Vector3 | null, dur = 3, soft = false) {
    this.lookTarget = p ? p.clone() : null;
    this.lookUntil = this.host.time() + dur;
    this.softLook = soft;
  }

  lookAtPlayer(dur = 4) {
    this.lookPlayerUntil = this.host.time() + dur;
  }

  play(kind: Overlay, dur?: number, ambient = false) {
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
      sigh: 2.6,
      explain: 3.4,
      pushBack: 6.5,
      deflate: 2.6,
      smile: 1.8,
    };
    if (this.cupInHand) this.cupHome();
    this.overlay = { kind, t: 0, dur: dur ?? d[kind], ambient };
    if (kind === "drink" && this.mode === "seated" && this.cup) this.cupToHand();
    else if (kind === "drink" || kind === "showReceipt") this.attachHandProp(kind);
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
      const sym0 = m.config(this.pos.assetId).symbol;
      // Top Buyer celebrates the first green tick... and deflates when it turns
      if (this.id === "topbuyer" && !this.pos.celebrated && pnl > 0.006) {
        this.pos.celebrated = true;
        this.host.social(this, "earlyWin", { sym: sym0 });
      } else if (this.pos.celebrated && !this.pos.deflated && pnl < -0.004) {
        this.pos.deflated = true;
        this.host.social(this, "deflate", { sym: sym0 });
      }
      // bought after a run-up and it's red: roll the chair back and stare at it
      if ((this.pos.chased ?? 0) > 0.02 && !this.pos.pushedBack && pnl < -0.015) {
        this.pos.pushedBack = true;
        this.host.social(this, "boughtTop", { sym: sym0 });
      }
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
        this.pos = { assetId: pick, qty: 100 / q.ask, entry: q.ask, openedTick: m.tick, chased: m.recentReturn(pick, 8) };
        this.lastBand = 0;
        this.bandPeak = 0;
        this.typing = 2.5;
        this.host.onNpcTrade(this, "BUY", 0);
        this.host.social(this, "buy", { sym: m.config(pick).symbol });
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
    const sym = this.pos ? this.host.market.config(this.pos.assetId).symbol : "";
    this.pos = null;
    this.realizedPct = pnl;
    this.lastBand = 0;
    this.typing = 1.5;
    this.host.onNpcTrade(this, "SELL", pnl);
    this.host.social(this, pnl >= 0 ? "closeWin" : "closeLoss", { sym, pct: `${(Math.abs(pnl) * 100).toFixed(1)}%` });
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
      if (this.seated && fx.chance(0.3)) this.play("stretch", undefined, true);
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
    const P = this.posture;

    for (let i = 0; i < this.timers.length; i++) {
      if (this.timers[i].at <= time) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        i--;
        fn();
      }
    }

    // ---- resting face (personality + mood); overlays override below
    const F = FACE[this.id] ?? FACE.courier;
    const mood = this.mood;
    T.lid = F.lid;
    T.mouth = F.mouth + mood * 0.5;
    T.browL = T.browR = this.rig.look.brow.tilt + (mood < -0.3 ? 0.25 : 0);
    T.browY = F.browY + (mood > 0.4 ? 0.3 : 0);

    // ---- movement / transitions
    this.standPush = 0;
    if (this.mode === "walk") this.walk(dt);
    else if ((this.mode === "sitting" || this.mode === "standing") && this.transition) {
      const tr = this.transition;
      tr.t += dt / tr.dur;
      const k = Math.min(1, tr.t);
      let e: number;
      const p = new THREE.Vector3();
      if (this.mode === "standing") {
        // push off while the chair rolls back, then rise and step out to the aisle
        const k1 = Math.min(1, k / 0.3);
        const k2 = clamp((k - 0.3) / 0.7, 0, 1);
        e = k2 * k2 * (3 - 2 * k2);
        const mid = tr.mid ?? tr.from;
        if (k < 0.3) p.copy(tr.from).lerp(mid, k1 * k1 * (3 - 2 * k1));
        else p.copy(mid).lerp(tr.to, e);
        this.seatBlend = 1 - e;
        this.standPush = Math.sin(Math.min(1, k / 0.75) * Math.PI);
      } else {
        e = k * k * (3 - 2 * k);
        p.copy(tr.from).lerp(tr.to, e);
        this.seatBlend = e;
        this.standPush = Math.sin(k * Math.PI) * 0.7;
      }
      this.rig.root.position.set(p.x, 0, p.z);
      this.rig.root.rotation.y = tr.fromYaw + wrapAngle(tr.toYaw - tr.fromYaw) * e;
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
      if (sp.t >= sp.dur && (!this.overlay || this.overlay.ambient)) {
        this.spot = null;
        this.mode = "spot";
        const end = sp.onEnd;
        if (end) end();
        else this.spot = { kind: "counter", t: 0, dur: 1e9, yaw: null };
      }
    }
    if (this.mode === "seated") this.seatBlend = 1;

    // ---- chair: swivel toward look target, roll/tilt with the posture
    const turned = !!st && Math.abs(st.chairYaw) > 0.55;
    const seatedIdle = this.mode === "seated" && !this.overlay && !turned;
    if (this.mode === "seated" && st) {
      st.chairYaw += (this.chairTarget - st.chairYaw) * damp(this.convo ? 2.2 : 3, dt);
      let slide = P.slide;
      let tilt = P.tilt;
      if (this.overlay?.kind === "pushBack") {
        slide = 0.5;
        tilt = -0.04;
      } else if (seatedIdle && this.act.kind === "leanBack") {
        slide += 0.06;
        tilt = -0.1;
      } else if (turned) {
        tilt = -0.03;
        slide = Math.max(slide, 0.08);
      }
      st.slideTarget = slide;
      st.tiltTarget = tilt;
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
    if (this.standPush > 0) {
      // lean forward and push with the hands on the knees to get up / sit down
      const s2 = this.standPush;
      T.spineX += 0.45 * s2;
      T.shLX += (0.75 - T.shLX) * s2;
      T.shRX += (0.75 - T.shRX) * s2;
      T.elLX += (0.3 - T.elLX) * s2;
      T.elRX += (0.3 - T.elRX) * s2;
      T.shLZ = 0.1 * s2;
      T.shRZ = -0.1 * s2;
      T.headX -= 0.15 * s2;
    }
    if (this.mode === "walk") {
      const ph = this.walkPhase;
      const sw = Math.sin(ph);
      T.hipLX = sw * 0.5;
      T.hipRX = -sw * 0.5;
      T.knLX = Math.max(0, -Math.cos(ph)) * 0.7 + 0.1;
      T.knRX = Math.max(0, Math.cos(ph)) * 0.7 + 0.1;
      T.shLX = -sw * 0.4 * P.gesture;
      T.shRX = sw * 0.4 * P.gesture;
      T.elLX = 0.35;
      T.elRX = 0.35;
      T.hipsY = -Math.abs(Math.cos(ph)) * 0.025;
      T.spineY = sw * 0.06;
      T.spineX = 0.05 + (this.id === "lurker" ? 0.12 : this.id === "topbuyer" ? 0.06 : 0);
      if (this.id === "nightshift" || this.id === "lurker") {
        // hands in the hoodie pocket
        T.shLX = 0.25;
        T.shRX = 0.25;
        T.elLX = 1.2;
        T.elRX = 1.2;
        T.shLZ = 0.32;
        T.shRZ = -0.32;
      }
    } else if (sb < 0.5) {
      // idle standing: weight shift
      T.hipsZ = Math.sin(time * 0.7 + this.x) * 0.01;
      T.spineZ = Math.sin(time * 0.5 + this.z) * 0.02;
    }

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
      if (this.convo && this.talkUntil > time) {
        // talking hand, sized by personality
        T.shRX = (0.75 + Math.sin(time * 3) * 0.15 * P.gesture) * 1;
        T.elRX = 1.1;
        T.gripR = this.id === "wizard" ? 1 : 0.2;
        T.pointR = this.id === "wizard" ? 1 : 0;
      }
    }
    this.typing -= dt;
    if (seatedIdle) this.seatedAct(dt, time, T);

    // ---- spot-specific poses
    if (this.mode === "spot" && this.spot) {
      const k = this.spot.kind;
      if (k === "couch") {
        T.hipsY = 0.5 - rig.hipHeight;
        T.hipLX = 1.4;
        T.hipRX = 1.4;
        T.knLX = 1.3;
        T.knRX = 1.3;
        T.spineX = -0.15;
        T.headX = -0.05;
        T.shLZ = -0.3;
        T.shRZ = 0.3;
      } else if (k === "window" || k === "serverWindow" || k === "bigView" || k === "mural" || (k === "counter" && this.id === "owner")) {
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
      this.applyOverlay(o.kind, k, Math.max(0, env) * (o.kind === "drink" || o.kind === "draw" || o.kind === "wipe" ? 1 : P.gesture), time, T);
      if (o.t >= o.dur) {
        this.overlay = null;
        if (o.kind === "drink") {
          if (this.cupInHand) this.cupHome();
          else if (this.mode !== "seated" && this.propInHand) this.carryingCan = true; // walks back with the can
          else this.dropHandProp();
        } else if (!this.carryingCan) this.dropHandProp();
      }
    }

    if (this.annoyed > 0) {
      this.annoyed -= dt;
      T.browL = T.browR = -0.35;
      T.mouth = -0.4;
    }
    // talking mouth flap
    if (this.talkUntil > time) {
      T.mouthOpen = Math.max(T.mouthOpen, (Math.sin(time * 18) * 0.5 + 0.5) * 0.6);
      T.headX += Math.sin(time * 7) * 0.03 * P.gesture;
    }

    // ---- look at
    let target: THREE.Vector3 | null = null;
    let soft = false;
    if (this.lookPlayerUntil > time || (this.talkUntil > time + 0.5 && time > this.turnAwayUntil) || this.convo) target = this.host.playerHead();
    else if (this.lookTarget && this.lookUntil > time) {
      target = this.lookTarget;
      soft = this.softLook;
    }
    this.chairTarget = 0;
    if (target) this.applyLook(target, T, dt, soft);
    else {
      // glance around occasionally (Top Buyer's eyes never rest when he holds something)
      const darting = this.id === "topbuyer" && this.pos ? 2.6 : 1;
      T.eyeX = Math.sin(time * 0.37 * darting + this.z) * 0.25 * darting;
      T.eyeY = Math.sin(time * 0.23 + this.x) * 0.1;
    }

    // Chart Wizard holds his marker unless his hands are on the keyboard/mouse or a cup
    if (this.marker) {
      const handsBusy = seatedIdle && (this.typing > 0 || this.act.kind === "type" || this.act.kind === "mouse" || this.act.kind === "read");
      this.marker.visible = !handsBusy && !this.cupInHand && !this.propInHand;
      if (rig.earMarker) rig.earMarker.visible = !this.marker.visible;
    }

    rig.update(dt, time);

    // keep collision circle in sync
    this.circle.x = this.x;
    this.circle.z = this.z;
  }

  /** Seated at the desk with nothing else going on: cycle through small activities. */
  private seatedAct(dt: number, time: number, T: Pose) {
    const P = this.posture;
    const a = this.act;
    a.t += dt;
    if (a.t >= a.dur) this.nextAct();
    const kind: SeatAct = this.typing > 0 ? "type" : this.act.kind;
    // lean toward the screen, hands at the keyboard
    T.spineX = P.lean;
    T.shLX = 0.95;
    T.shRX = 0.95;
    T.elLX = 0.75;
    T.elRX = 0.75;
    T.shLZ = 0.12;
    T.shRZ = -0.12;
    T.wrLX = -0.2;
    T.wrRX = -0.2;
    T.headX = -0.15 + P.head;
    switch (kind) {
      case "type": {
        const sp = P.typeSpeed;
        T.wrLX += Math.sin(time * 17 * sp + 1) * 0.12;
        T.wrRX += Math.sin(time * 15 * sp) * 0.12;
        T.gripL = 0.5 + Math.sin(time * 19 * sp) * 0.3;
        T.gripR = 0.5 + Math.sin(time * 21 * sp + 2) * 0.3;
        T.headX += Math.sin(time * 1.3) * 0.02;
        break;
      }
      case "mouse":
        // right hand on the mouse, small moves; left hand rests on the keys
        T.shRZ = -0.02;
        T.shRY = Math.sin(time * 1.7) * 0.05;
        T.wrRX = -0.1 + Math.sin(time * 2.1) * 0.05;
        T.gripL = 0.2;
        T.eyeX = Math.sin(time * 1.1) * 0.2;
        break;
      case "read":
        // sitting back a little, scrolling
        T.spineX = P.lean - 0.14;
        T.shLX = 0.6;
        T.elLX = 1.1;
        T.shLZ = 0.05;
        T.gripL = 0.1;
        T.shRZ = -0.02;
        T.pointR = Math.sin(time * 4) > 0.85 ? 0.7 : 0.3;
        T.headX = -0.2 + P.head;
        break;
      case "glance":
        T.shRZ = -0.02;
        T.gripL = 0.25;
        T.gripR = 0.35;
        break;
      case "fidget":
        // leg bouncing and finger drumming: Top Buyer can't sit still
        T.hipLX += Math.sin(time * 16) * 0.035;
        T.knLX += Math.sin(time * 16) * 0.035;
        T.gripL = 0.3 + Math.max(0, Math.sin(time * 11)) * 0.6;
        T.eyeX = Math.sin(time * 2.9) * 0.45;
        T.spineX += 0.06;
        T.browL = T.browR = 0.2;
        break;
      case "leanBack":
        // hands laced behind the head, chair rolled back
        T.spineX = -0.2;
        T.shLX = 2.55;
        T.shRX = 2.55;
        T.shLZ = -0.7;
        T.shRZ = 0.7;
        T.elLX = 2.25;
        T.elRX = 2.25;
        T.gripL = 0.6;
        T.gripR = 0.6;
        T.headX = 0.1;
        T.mouth = 0.35;
        T.lid = 0.35;
        break;
      case "explain":
        // Chart Wizard lecturing his own monitor with the marker
        T.spineX = P.lean + 0.06;
        T.shRX = 1.3 + Math.sin(time * 3.2) * 0.14;
        T.shRZ = -0.05 + Math.sin(time * 2.1) * 0.12;
        T.elRX = 0.5;
        T.pointR = 1;
        T.gripR = 1;
        T.shLX = 0.7;
        T.elLX = 1.2;
        T.gripL = 0;
        T.headX = Math.sin(time * 5) * 0.06;
        T.browY = 0.9;
        T.lid = 0;
        T.mouthOpen = (Math.sin(time * 13) * 0.5 + 0.5) * 0.25;
        break;
      default:
        break;
    }
  }

  private nextAct() {
    const w: Partial<Record<SeatAct, number>> = { ...(ACTS[this.id] ?? ACTS.default) };
    if (this.mood < -0.3) w.sigh = (w.sigh ?? 0) + 1.5;
    if (this.id === "topbuyer" && this.pos) w.fidget = (w.fidget ?? 0) + 2;
    if (!this.cup) w.sip = 0;
    w[this.act.kind] = (w[this.act.kind] ?? 0) * 0.25;
    let total = 0;
    for (const v of Object.values(w)) total += v ?? 0;
    let r = fx.next() * total;
    let kind: SeatAct = "type";
    for (const [k, v] of Object.entries(w)) {
      r -= v ?? 0;
      if (r <= 0) {
        kind = k as SeatAct;
        break;
      }
    }
    const [a, b] = ACT_DUR[kind];
    this.act = { kind, t: 0, dur: fx.range(a, b) };
    if (kind === "glance") {
      const tgt = this.host.glanceTarget(this);
      if (tgt) this.lookAt(tgt, this.act.dur, true);
      else this.act.kind = "mouse";
    } else if (kind === "sip") {
      this.play("drink", 2.4, true);
      this.host.sfx("sip", this.rig.headWorld(), 0.25);
    } else if (kind === "sigh") {
      this.play("sigh", 2.6, true);
      this.host.sfx("sigh", this.rig.headWorld(), 0.4);
    } else if (kind === "explain" && fx.chance(0.25)) {
      this.say("explain", {}, true);
    }
  }

  private applyLook(target: THREE.Vector3, T: Pose, dt: number, soft = false) {
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
      const st = this.station;
      if (st && this.convo) {
        // conversation: turn the whole chair toward the player
        this.chairTarget = Math.abs(yaw) > 0.12 ? clamp(st.chairYaw + yaw, -2.2, 2.2) : st.chairYaw;
      } else if (st && !soft && Math.abs(yaw) > 0.7) {
        // swivel the chair for big turns
        this.chairTarget = clamp(st.chairYaw + yaw * 0.7, -2.2, 2.2);
      } else if (st) this.chairTarget = soft ? 0 : st.chairYaw;
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
      case "sigh": {
        // breathe in (chest up, head back), then let it all out
        const inh = k < 0.4 ? Math.sin((k / 0.4) * Math.PI * 0.5) : 1 - (k - 0.4) / 0.6;
        const exh = k < 0.4 ? 0 : Math.sin(((k - 0.4) / 0.6) * Math.PI);
        T.spineX += (-0.1 * inh + 0.16 * exh) * e;
        T.headX += (0.2 * inh - 0.22 * exh) * e;
        T.shLZ -= 0.15 * inh * e;
        T.shRZ += 0.15 * inh * e;
        T.lid = Math.max(T.lid, 0.55 * exh);
        T.mouthOpen = 0.22 * exh;
        T.browL = T.browR = 0.32;
        T.mouth = -0.2;
        break;
      }
      case "explain":
        // big lecturing gestures: pointing with the marker, open palm, nodding
        T.shRX = (1.9 + Math.sin(time * 3.4) * 0.35) * e;
        T.shRZ = (0.2 + Math.sin(time * 2.2) * 0.25) * e;
        T.elRX = 0.45 * e;
        T.pointR = e;
        T.gripR = 1;
        T.shLX = (0.9 + Math.sin(time * 2.6 + 1) * 0.3) * e;
        T.shLZ = -0.45 * e;
        T.elLX = 1.0 * e;
        T.gripL = 0;
        T.headX = Math.sin(time * 4.5) * 0.08;
        T.headZ = Math.sin(time * 1.7) * 0.08;
        T.spineY += Math.sin(time * 1.4) * 0.1 * e;
        T.browY = 1;
        T.lid = 0;
        T.mouth = 0.7;
        T.mouthOpen = (Math.sin(time * 15) * 0.5 + 0.5) * 0.45 * e;
        break;
      case "pushBack":
        // slowly rolls the chair back and just stares at the screen
        T.spineX = -0.16 * e + T.spineX * (1 - e);
        T.shLX = 0.35;
        T.shRX = 0.35;
        T.elLX = 0.75;
        T.elRX = 0.75;
        T.shLZ = 0.15;
        T.shRZ = -0.15;
        T.gripL = 0.4;
        T.gripR = 0.4;
        T.headX = -0.08;
        T.lid = 0.35;
        T.mouth = -0.35;
        T.browL = T.browR = 0.4;
        T.eyeY = -0.1;
        break;
      case "deflate": {
        // the celebration arms come down slowly; shoulders slump
        const up = 1 - k;
        T.shLX = 0.3 + 2.2 * up * up * e;
        T.shRX = 0.3 + 2.2 * up * up * e;
        T.shLZ = -0.3 * up * e;
        T.shRZ = 0.3 * up * e;
        T.spineX += 0.25 * k * e;
        T.headX = -0.25 * k;
        T.mouth = 0.6 - 1.1 * k;
        T.browL = T.browR = 0.4 * k;
        T.browY = 0.6 * up;
        T.mouthOpen = 0.4 * up * e;
        break;
      }
      case "smile":
        T.mouth = 0.7;
        T.lid = 0.3;
        T.headZ = 0.06 * e;
        T.headX += 0.05 * e;
        T.browY = 0.2;
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
      // THE WHITEBOARD THEORY: draw it, then step back and explain it with great enthusiasm
      if (t > 0.5 && t - _dt <= 0.5) {
        this.host.onWizardVisit(this);
        this.explained = false;
      }
      if (t > 0.5) {
        const drawing = (!this.overlay || this.overlay.kind === "draw") && this.host.onWizardDraw(this, _dt);
        if (drawing && !this.overlay) this.play("draw", 3);
        else if (!drawing && !this.explained && (!this.overlay || this.overlay.kind === "draw")) {
          this.explained = true;
          this.play("explain", 3.6);
          if (this.talkUntil < this.host.time()) this.say("board", {}, false);
        }
      }
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
