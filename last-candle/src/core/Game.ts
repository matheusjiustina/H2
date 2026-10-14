import * as CANNON from "cannon-es";
import * as THREE from "three";
import { ASSETS } from "../market/assets";
import { fmtUsd, fmtClock, fmtPct } from "../market/format";
import { MarketEngine } from "../market/MarketEngine";
import { Portfolio } from "../market/Portfolio";
import { NAME_COLORS } from "../npc/dialogue";
import type { Npc } from "../npc/Npc";
import { NpcManager } from "../npc/NpcManager";
import { Physics } from "../physics/Physics";
import { PropManager, type Prop, type PropKind } from "../physics/Props";
import { Hands } from "../player/Hands";
import { Holding } from "../player/Holding";
import { Interaction } from "../player/Interaction";
import { Player } from "../player/Player";
import { Audio } from "../systems/Audio";
import { EventDirector } from "../systems/Events";
import { NIGHT_END, NIGHT_START, NightClock } from "../systems/NightClock";
import { BASE_LOADOUT, CONSUMABLES, Progression, SECRETS, TASKS, UPGRADES, freshProgress } from "../systems/Progression";
import { npcReceipt, receiptFromTrade, receiptTexture } from "../systems/Receipts";
import { Whiteboard } from "../systems/Whiteboard";
import { Screens } from "../terminal/Screens";
import { Terminal, type OrderOutcome } from "../terminal/Terminal";
import { UI, type DialogOption } from "../ui/UI";
import { CollisionWorld } from "../world/Collision";
import { rbox } from "../world/geometry";
import { propInteractable, registerWorldInteractables, type WorldState } from "../world/Interactables";
import { buildLanHouse, type LanHouseHandles } from "../world/LanHouse";
import { L, SPOTS } from "../world/layout";
import { materials } from "../world/materials";
import { Outside } from "../world/Outside";
import type { StationVisual } from "../world/Station";
import { canvas as mkCanvas, drawCandleMark, labelTex, setMaxAnisotropy, toTexture } from "../world/textures";
import { bus } from "./EventBus";
import { Input } from "./Input";
import { clamp, damp } from "./math";
import { fx } from "./rng";
import { SaveStore, type SaveData, type SavedProp } from "./Save";
import { Settings, type SettingsData } from "./Settings";

type GameState = "title" | "play" | "paused" | "summary";
type IntroStage = "title" | "arrive" | "findpc" | "firsttrade" | "walk" | "done";

const tmpV = new THREE.Vector3();

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  readonly settings = new Settings();
  readonly collision = new CollisionWorld();
  readonly physics = new Physics();
  readonly ui: UI;
  readonly audio = new Audio();
  readonly progress = new Progression();
  house!: LanHouseHandles;
  outside!: Outside;
  player!: Player;
  hands!: Hands;
  interaction!: Interaction;
  holding!: Holding;
  props!: PropManager;
  market!: MarketEngine;
  portfolio!: Portfolio;
  clock!: NightClock;
  terminal!: Terminal;
  screens!: Screens;
  npcs!: NpcManager;
  whiteboard!: Whiteboard;
  events!: EventDirector;
  readonly ws: WorldState = {
    fridgeOpen: false,
    fridgeAngle: 0,
    fanOn: false,
    fanOsc: 0,
    lampOn: true,
    lockerOpen: false,
    lockerAngle: 0,
    serverOpen: false,
    serverAngle: 0,
    doorOpenUntil: 0,
    doorAngle: 0,
    pc09Frozen: false,
  };
  state: GameState = "title";
  readonly intro = { stage: "title" as IntroStage, t: 0 };
  time = 0;
  private last = performance.now();
  seat: StationVisual | null = null;
  terminalStation: StationVisual | null = null;
  private ray = new THREE.Raycaster();
  private dialogNpc: Npc | null = null;
  private dialogT = 0;
  private screensT = 0;
  private saveT = 0;
  private ledT = 0;
  private flicker = 0;
  private fpsAcc = { t: 0, n: 0, v: 60 };
  private pinnedMeshes: Prop[] = [];
  private deliveryBoxes = new Map<string, THREE.Mesh>();
  private frozenTex: THREE.CanvasTexture | null = null;
  private sessionWarned = 0;
  private titleT = 0;
  private lastCandleMinute = -1;
  private nightStats = { equityStart: 1000, realizedStart: 0, repStart: 0, tradesStart: 0 };
  private bigScreenPos = new THREE.Vector3();

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly uiRoot: HTMLDivElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.autoClear = false;
    setMaxAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    this.camera = new THREE.PerspectiveCamera(this.settings.data.fov, 1, 0.05, 80);
    this.scene.background = new THREE.Color("#0b0c10");
    this.input = new Input(canvas);
    this.ui = new UI(uiRoot);
    this.build();
    this.applySettings(this.settings.data, true);
    this.settings.onChange((s) => this.applySettings(s, false));
    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.wireBus();
  }

  // =================================================================== build

  private build() {
    this.house = buildLanHouse(this.scene, this.collision);
    this.physics.addStatic(this.house.physicsBoxes);
    this.outside = new Outside(this.scene, this.house.lights.street, this.house.lights.car);
    this.player = new Player(this.camera, this.collision);
    this.player.onFootstep = () => this.audio.play("step", undefined, 0.5);
    this.hands = new Hands(this.settings.data.fov);
    this.interaction = new Interaction(this.collision);
    this.holding = new Holding(this);
    this.props = new PropManager(this.physics, this.scene);
    this.physics.onImpact = (body, other, speed) => this.onImpact(body, other, speed);

    this.market = new MarketEngine(20261013);
    this.portfolio = new Portfolio(1000);
    this.clock = new NightClock(this.market);
    this.market.labelProvider = () => this.clock.label();
    this.market.onBigMove = (m) => this.events?.onBigMove(m.assetId, m.direction, m.pct);
    this.market.onCandle = () => this.onCandle();

    this.screens = new Screens(this.market);
    this.screens.clock = () => ({ minute: this.clock.minuteOfDay, night: this.clock.night });
    this.screens.timerRows = () => this.timerRows();
    this.house.bigScreen.material.map = this.screens.big.tex;
    this.house.bigScreen.material.needsUpdate = true;
    this.house.timerScreen.material.map = this.screens.timers.tex;
    this.house.timerScreen.material.needsUpdate = true;
    this.house.bigScreen.getWorldPosition(this.bigScreenPos);

    this.terminal = new Terminal({
      market: this.market,
      portfolio: this.portfolio,
      stationLabel: () => this.terminalStation?.def.label ?? "PC 03",
      clockMinute: () => this.clock.minuteOfDay,
      night: () => this.clock.night,
      session: () => this.sessionInfo(),
      goals: () => this.progress.goalsView(),
      credits: () => this.progress.d.credits,
      rep: () => ({ value: this.progress.d.rep, title: this.progress.title }),
      buy: (id, usd) => this.trade(id, "BUY", usd),
      sell: (id, usd) => this.trade(id, "SELL", usd),
      sellAll: (id) => this.trade(id, "SELLALL", 0),
      coach: () => this.coachLine(),
      crt: () => this.terminalStation?.monitorKind === "crt",
      wide: () => this.terminalStation?.monitorKind === "lcdWide",
      printed: (id) => this.progress.d.printed.includes(id),
      onClick: () => this.audio.play(this.progress.d.loadout.keyboard === "mech" && this.terminalStation?.def.id === this.progress.d.homeStation ? "keyMech" : "click"),
    });

    this.whiteboard = new Whiteboard(this.house.whiteboard);
    this.npcs = new NpcManager(
      {
        market: this.market,
        stations: this.house.stations,
        scene: this.scene,
        time: () => this.time,
        playerHead: () => this.camera.getWorldPosition(new THREE.Vector3()),
        playerFeet: () => this.player.pos,
        playerSeatedAt: () => this.seat?.def.id ?? null,
        sfx: (name, pos, vol) => this.audio.play(name, pos, vol),
        onWizardDraw: (_n, dt) => this.whiteboard.wizardDraw(dt),
        onNpcTrade: (n, side, pnl) => this.onNpcTrade(n, side, pnl),
        onNpcPrintFlex: (n) => this.npcPrintFlex(n),
        onNpcDrinkDone: (n) => this.npcLeftCan(n),
        bigScreen: this.bigScreenPos,
      },
      this.collision,
      this.physics.world,
    );
    this.npcs.onSpeak = (npc, text, quiet, loud) => {
      const head = npc.rig.headAnchor.getWorldPosition(new THREE.Vector3());
      this.audio.voice(text, npc.profile.voice, head, quiet);
      const d = head.distanceTo(this.camera.position);
      if (loud || (!quiet && d < 7 && npc === this.dialogNpc)) this.ui.showSubtitle(npc.name, NAME_COLORS[npc.id] ?? "#ddd", text, this.time, 4 + text.length * 0.03);
      if (npc === this.dialogNpc) this.ui.updateDialogText(text);
    };
    // NPC talk targets: invisible capsules that follow each rig
    for (const n of this.npcs.npcs) {
      const proxy = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 8), new THREE.MeshBasicMaterial({ visible: false }));
      proxy.position.set(0, 0.95, 0);
      n.rig.j.hips.add(proxy);
      proxy.position.set(0, 0.2, 0);
      this.interaction.add({
        id: `npc-${n.id}`,
        targets: [proxy],
        highlight: null,
        label: () => (!n.present || n.id === "courier" ? null : this.holding.held?.def.kind === "receipt" ? `Show receipt • ${n.name}` : `Talk • ${n.name}`),
        range: 2.4,
        priority: 2,
        onInteract: () => this.talkTo(n),
      });
    }
    this.events = new EventDirector(this);
    registerWorldInteractables(this, this.ws);
    this.progress.onLoadoutChange = (lo) => {
      const st = this.house.stations.get(this.progress.d.homeStation);
      st?.applyLoadout(lo);
      this.refreshScreens(true);
    };
  }

  private wireBus() {
    bus.on("toast", ({ text, kind }) => {
      this.ui.toast(text, kind ?? "info");
      this.audio.play(kind === "rep" ? "rep" : kind === "good" ? "credits" : "toast", undefined, 0.6);
    });
    bus.on("trade:filled", ({ trade }) => {
      this.progress.d.stats.trades++;
      this.progress.d.tradesTonight++;
      if (!this.progress.d.firstTradeDone) {
        this.progress.d.firstTradeDone = true;
        this.progress.addRep(5, "First trade");
        this.progress.addCredits(5, "First trade");
      } else if (this.progress.d.repFromTradesTonight < 8) {
        this.progress.d.repFromTradesTonight++;
        this.progress.addRep(1, "Trade");
      }
      if (trade.side === "SELL") {
        this.progress.completeGoal("close");
        if (this.progress.d.tradesTonight <= 20) this.progress.addCredits(1, "Closed trade");
        const r = trade.realizedPnl ?? 0;
        this.progress.d.stats.bestTrade = Math.max(this.progress.d.stats.bestTrade, r);
        this.progress.d.stats.worstTrade = Math.min(this.progress.d.stats.worstTrade, r);
        this.events.walkTimer = this.portfolio.allPositions().length ? this.events.walkTimer : 0;
      }
      if (this.intro.stage === "firsttrade" && trade.side === "BUY") this.intro.stage = "walk";
      this.save();
    });
    bus.on("player:drank", () => this.progress.completeGoal("drink"));
    bus.on("player:boardWiped", () => undefined);
    bus.on("bin:scored", ({ fromLine }) => {
      this.progress.completeGoal("bin");
      this.audio.play("score", new THREE.Vector3(SPOTS.bin.x, 0.6, SPOTS.bin.z), 0.6);
      if (fromLine) {
        bus.emit("toast", { text: "Three-pointer from behind the tape!", kind: "good" });
        this.progress.findSecret("rimshot");
        if (this.progress.d.challenge === "active") {
          this.progress.d.challenge = "done";
          this.progress.addRep(8, "Lurker's challenge");
          const lk = this.npcs.get("lurker");
          if (lk.present) lk.sayText("Hm. Not bad.", false);
        }
      }
    });
    bus.on("chair:spun", () => this.progress.completeGoal("spin"));
    window.addEventListener("beforeunload", () => this.save());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.save();
        if (this.state === "play") this.pause();
      }
    });
    this.input.onLockChange = (locked) => {
      if (locked) return;
      if (this.state !== "play") return;
      if (this.ui.panelOpen) return;
      if (this.player.mode === "terminal" || this.player.mode === "tween") return;
      if (this.player.mode === "seated") {
        this.enterTerminal();
        return;
      }
      this.pause();
    };
  }

  // =================================================================== settings & sizing

  applySettings(s: SettingsData, first: boolean) {
    const key = this.house.lights.key;
    const sh = s.shadows;
    const wasEnabled = this.renderer.shadowMap.enabled;
    this.renderer.shadowMap.enabled = sh !== "off";
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    key.castShadow = sh !== "off";
    const size = sh === "high" ? 2048 : 1024;
    if (key.shadow.mapSize.x !== size) {
      key.shadow.mapSize.set(size, size);
      key.shadow.map?.dispose();
      key.shadow.map = null;
    }
    if (!first && wasEnabled !== this.renderer.shadowMap.enabled) {
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (!m) return;
        (Array.isArray(m) ? m : [m]).forEach((mm) => (mm.needsUpdate = true));
      });
    }
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.hands?.setFov(s.fov, this.camera.aspect);
    this.audio.setVolume(s.volume, s.ambience);
    if (!first) this.resize();
    this.ui.setFps(s.showFps ? this.fpsAcc.v : null);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75) * this.settings.data.renderScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.hands.setFov(this.settings.data.fov, this.camera.aspect);
    if (this.player.mode === "terminal" && this.seat) this.player.setTerminalPose(this.terminalPose(this.seat));
  }

  // =================================================================== lifecycle

  start() {
    if (window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window) {
      this.ui.enableTouch();
      this.input.touchActive = true;
      this.ui.onTouchButton = (code, down) => this.touchButton(code, down);
    }
    this.canvas.addEventListener("click", () => {
      if (this.state === "play" && (this.player.mode === "walk" || this.player.mode === "seated") && !this.ui.panelOpen) this.input.requestLock();
    });
    // initial world so the title screen has something to look at
    this.newWorld();
    this.showTitle();
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      try {
        this.frame(dt);
      } catch (e) {
        console.error(e);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private showTitle() {
    this.state = "title";
    const save = SaveStore.load();
    const logo = mkCanvas(144, 192);
    drawCandleMark(logo[1], 72, 112, 150);
    this.ui.openPanel(
      "title",
      `<div class="logo"><canvas width="144" height="192"></canvas><div><h1>LAST<br>CANDLE</h1><div class="sub">DEGEN LAN HOUSE • OPEN 24H</div></div></div>
       <div class="tag">“One more trade. Then we go home.”</div>
       <p>A rainy night, a LAN house that never closes, five simulated tokens and a room full of regulars who react to every candle. Trade, wander, throw paper balls, upgrade your station.</p>
       <div class="actions">
         ${save ? `<button class="primary" data-act="continue">Continue • Night ${save.clock.night}</button><button data-act="new">New game</button>` : `<button class="primary" data-act="new">Enter the LAN house</button>`}
         <button data-act="settings">Settings</button>
       </div>
       <div class="controls">
         <b>WASD</b><span>walk (Shift to hurry)</span><b>Mouse</b><span>look</span><b>E</b><span>interact • sit • pick up • place</span>
         <b>LMB</b><span>use item • hold to throw • draw</span><b>RMB</b><span>inspect item</span><b>R / Q</b><span>rotate / drop item</span>
         <b>Esc</b><span>leave terminal • pause</span><b>Terminal</b><span>mouse clicks • 1-5 tokens • B buy • S sell • X sell all</span>
       </div>
       <div class="legal">SIMULATED MARKET • VIRTUAL FUNDS. Token names are used as placeholders; no real prices, contracts, logos or integrations. Nothing here is financial advice.</div>`,
      (root) => {
        const c = root.querySelector("canvas") as HTMLCanvasElement;
        c.getContext("2d")!.drawImage(logo[0], 0, 0);
        root.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((b) =>
          b.addEventListener("click", () => {
            const a = b.dataset.act;
            if (a === "continue") this.begin(true);
            else if (a === "new") {
              if (save && !confirm("Start over? Your current progress will be replaced.")) return;
              SaveStore.clear();
              this.begin(false);
            } else if (a === "settings") this.openSettings(() => this.showTitle());
          }),
        );
      },
    );
  }

  /** Reset the simulation to a fresh first night (used by New game and as title backdrop). */
  private newWorld() {
    // fresh market with a time-based seed so each new game differs
    this.market.reset((Date.now() ^ 0x9e3779b9) >>> 0);
    this.market.warmup(NIGHT_START);
    this.portfolio.restore(new Portfolio(1000).serialize());
    this.progress.d = freshProgress();
    this.clock.startNight(1);
    this.progress.rollGoals(1);
    for (const st of this.house.stations.values()) st.applyLoadout({ ...BASE_LOADOUT, monitor: st.def.monitor });
    this.house.stations.get("pc03")!.applyLoadout(this.progress.d.loadout);
    for (const p of [...this.props.props]) {
      this.interaction.remove(`prop-${p.uid}`);
      this.props.despawn(p);
    }
    this.pinnedMeshes = [];
    this.spawnDefaultProps();
    this.whiteboard.restore([]);
    this.resetNpcsForNight(true);
    this.events.resetNight();
    this.player.teleport(SPOTS.playerStart.x, SPOTS.playerStart.z, SPOTS.playerStart.yaw);
    this.terminalStation = this.house.stations.get("pc03")!;
    this.applyMezz();
    this.refreshScreens(true);
    this.nightStats = { equityStart: 1000, realizedStart: 0, repStart: 0, tradesStart: 0 };
  }

  private begin(load: boolean) {
    this.ui.closePanel();
    this.audio.init();
    this.audio.setVolume(this.settings.data.volume, this.settings.data.ambience);
    let loaded = false;
    if (load) {
      const d = SaveStore.load();
      if (d) loaded = this.restore(d);
    }
    if (!loaded) {
      this.newWorld();
      this.intro.stage = "arrive";
      this.intro.t = 0;
    }
    this.state = "play";
    this.ui.fadeTo(1, 0);
    setTimeout(() => this.ui.fadeTo(0, 1200), 60);
    this.input.requestLock();
    if (loaded) {
      bus.emit("toast", { text: `Welcome back. Night ${this.clock.night}, ${fmtClock(this.clock.minuteOfDay)}. The market resumes exactly where it paused.` });
    }
  }

  pause() {
    if (this.state !== "play") return;
    this.state = "paused";
    this.input.exitLock();
    this.audio.suspend(true);
    this.save();
    this.ui.openPanel(
      "pause",
      `<h2>Paused</h2><p>The simulated market is paused too — nothing moves while you're away.</p>
       <h3>Tonight</h3>
       <div class="kv"><span>Night</span><span>${this.clock.night} • ${fmtClock(this.clock.minuteOfDay)}</span><span>Equity</span><span>${fmtUsd(this.portfolio.equity((id) => this.market.quote(id)))}</span><span>Reputation</span><span>${this.progress.d.rep} • ${this.progress.title}</span><span>Secrets</span><span>${this.progress.d.secrets.length}/${Object.keys(SECRETS).length}</span></div>
       ${this.goalsHtml()}
       <div class="actions"><button class="primary" data-act="resume">Resume</button><button data-act="settings">Settings</button><button data-act="title">Save & title screen</button><button class="danger" data-act="reset">Reset save</button></div>`,
      (root) => {
        root.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((b) =>
          b.addEventListener("click", () => {
            const a = b.dataset.act;
            if (a === "resume") this.resume();
            else if (a === "settings") this.openSettings(() => this.pauseReopen());
            else if (a === "title") {
              this.save();
              this.ui.closePanel();
              this.audio.suspend(false);
              this.standUpInstant();
              this.showTitle();
            } else if (a === "reset") {
              if (!confirm("Delete your save and start a brand-new first night?")) return;
              SaveStore.clear();
              this.ui.closePanel();
              this.audio.suspend(false);
              this.standUpInstant();
              this.begin(false);
            }
          }),
        );
      },
    );
  }

  private pauseReopen() {
    this.state = "play";
    this.pause();
  }

  resume() {
    this.ui.closePanel();
    this.state = "play";
    this.audio.suspend(false);
    if (this.player.mode !== "terminal") this.input.requestLock();
  }

  private openSettings(back: () => void) {
    this.ui.openPanel("settings", `<h2>Settings</h2>${this.ui.settingsHtml(this.settings.data)}<div class="actions"><button class="primary" data-act="back">Back</button></div>`, (root) => {
      this.ui.bindSettings(root, (k, v) => this.settings.set(k, v as never));
      root.querySelector("[data-act=back]")!.addEventListener("click", () => back());
    });
  }

  private goalsHtml(): string {
    const g = this.progress.goalsView();
    const task = this.progress.d.activeTask ? TASKS.find((t) => t.id === this.progress.d.activeTask!.id) : null;
    return `<h3>Night goals</h3>${g.map((x) => `<p>${x.done ? "■" : "□"} ${x.text}</p>`).join("")}${task ? `<h3>Job for the Owner</h3><p>${task.title} — ${task.desc}</p>` : ""}`;
  }

  // =================================================================== frame

  private skipRender = false;

  /** Test helper: advance the whole game by `seconds` without rendering (headless CI is slow). */
  debugSimulate(seconds: number, step = 1 / 30) {
    this.skipRender = true;
    const n = Math.ceil(seconds / step);
    for (let i = 0; i < n; i++) this.frame(step);
    this.skipRender = false;
  }

  frame(dt: number) {
    if (this.state === "title") {
      this.titleT += dt;
      const t = this.titleT * 0.05;
      this.camera.position.set(-0.8 + Math.sin(t) * 0.6, 1.9 + Math.sin(t * 1.3) * 0.1, -1.2 - (Math.sin(t * 0.7) * 0.5 + 0.5) * 1.5);
      this.camera.lookAt(0.2 + Math.sin(t * 0.8), 1.2, -10);
      this.outside.update(dt);
      this.worldAnim(dt);
      this.renderFrame();
      this.input.endFrame();
      return;
    }
    if (this.state !== "play") {
      this.renderFrame();
      this.input.endFrame();
      return;
    }
    this.time += dt;
    const inp = this.input;
    if (this.ui.touchMode) {
      inp.mouseDX += this.ui.touchLook.dx;
      inp.mouseDY += this.ui.touchLook.dy;
      this.ui.touchLook.dx = this.ui.touchLook.dy = 0;
      inp.touchMove.x = this.ui.touchStick.x;
      inp.touchMove.y = this.ui.touchStick.y;
    }

    // --------------------------------------------------- simulation
    this.market.advance(dt);
    this.screens.update(dt, this.time);
    const allowMove = !this.ui.panelOpen && !this.hands.inspecting && this.intro.stage !== "title";
    const mode = this.player.mode;
    // drag-look fallback: Esc pauses
    if ((inp.dragLook || this.ui.touchMode) && inp.pressed("Escape") && mode === "walk" && !this.ui.panelOpen) this.pause();

    this.player.update(dt, inp, this.settings.data, allowMove);
    // fresh world matrices so this frame's raycasts match what will be drawn
    this.scene.updateMatrixWorld();
    if (mode === "walk") this.walkInput(dt);
    else if (mode === "terminal") this.terminalInput();
    else if (mode === "seated") this.seatedInput();
    else this.ui.setPrompt(null);
    if (this.player.mode !== "terminal") this.ui.centerHint(null);

    this.hands.visibleIdle = false;
    this.hands.update(dt, inp.mouseDX, inp.mouseDY, mode === "walk" ? this.player.speed : 0, this.time);
    this.hands.camera.position.set(0, 0, 0);

    this.physics.step(dt);
    this.props.update(dt);
    this.propRules(dt);
    this.npcs.update(dt, this.time, this.camera.position);
    this.events.update(dt);
    this.whiteboard.update(dt);
    this.updateIntro(dt);
    this.worldAnim(dt);
    this.outside.update(dt);
    if (this.outside.flashing > 0.95) this.audio.play("thunder", new THREE.Vector3(0, 6, 8), 0.8);
    this.audio.rainIntensity = this.outside.intensity;
    this.audio.update(this.camera);

    // long terminal sessions: Night Shift suggests a walk (once per night)
    if (this.player.mode === "terminal") {
      this.terminalT += dt;
      const ns = this.npcs.get("nightshift");
      if (this.terminalT > 300 && !this.walkNudged && ns.present && ns.free) {
        this.walkNudged = true;
        ns.lookAtPlayer(4);
        ns.sayText("Take a walk. Your position will still be there.", false, true);
      }
    } else this.terminalT = 0;

    // terminal redraw cadence: crisp when used, lazy otherwise
    this.terminal.active = this.player.mode === "terminal";
    this.terminal.update(this.time, this.player.mode === "terminal" ? 12 : 2);
    this.screensT += dt;
    if (this.screensT > 0.5) {
      this.screensT = 0;
      this.refreshScreens(false);
    }
    this.saveT += dt;
    if (this.saveT > 30) {
      this.saveT = 0;
      this.save();
    }
    this.updateHud(dt);
    this.ui.tick(this.time);
    this.renderFrame();
    inp.endFrame();
  }

  private shadowFrame = 0;
  private terminalT = 0;
  walkNudged = false;

  private renderFrame() {
    if (this.skipRender) return;
    const r = this.renderer;
    // shadows: every frame on high, every other frame on low
    this.shadowFrame++;
    if (this.settings.data.shadows === "high" || this.shadowFrame % 2 === 0) r.shadowMap.needsUpdate = true;
    r.clear();
    r.render(this.scene, this.camera);
    if (this.state === "play" && (this.player.mode === "walk" || this.player.mode === "tween")) {
      r.clearDepth();
      r.render(this.hands.scene, this.hands.camera);
    }
    this.fpsAcc.t += 1 / 60;
    this.fpsAcc.n++;
    const now = performance.now();
    if (!this.fpsT) this.fpsT = now;
    if (now - this.fpsT > 500) {
      this.fpsAcc.v = (this.fpsAcc.n * 1000) / (now - this.fpsT);
      this.fpsAcc.n = 0;
      this.fpsT = now;
      if (this.settings.data.showFps) this.ui.setFps(this.fpsAcc.v);
    }
  }
  private fpsT = 0;

  // =================================================================== walk mode input

  private walkInput(dt: number) {
    const inp = this.input;
    const it = this.interaction;
    if (!this.ui.panelOpen) it.update(this.camera, this.time);
    const cur = it.current;
    const held = this.holding.held;

    // whiteboard drawing with the marker
    const aimingBoard = !!cur && cur.it.id === "whiteboard" && held?.def.use === "draw";
    if (aimingBoard && inp.lmb && cur?.uv) {
      if (!this.whiteboard.drawing) {
        this.whiteboard.begin(cur.uv.x, cur.uv.y, String(held!.data.color ?? "#1b1b1b"));
        this.progress.completeGoal("draw");
        bus.emit("player:drew", {});
      } else this.whiteboard.extend(cur.uv.x, cur.uv.y);
      this.hands.drawing = true;
      this.audio.play("marker", cur.point, 0.6);
    } else if (this.whiteboard.drawing) {
      this.whiteboard.end();
      this.hands.drawing = false;
    } else this.hands.drawing = false;

    this.holding.update(dt, aimingBoard);

    // prompts
    if (this.ui.dialogOpen) {
      this.ui.setPrompt(null);
    } else if (cur) {
      this.ui.setPrompt(cur.it.label(), cur.it.hint?.() ?? (held ? this.heldHint() : null));
    } else if (held) {
      this.ui.setPrompt(this.holding.label, this.heldHint(), "LMB");
    } else this.ui.setPrompt(null);
    this.ui.setCrosshair(cur ? "active" : "dot");

    // E
    if (inp.pressed("KeyE") && !this.ui.panelOpen) {
      if (this.ui.dialogOpen && this.dialogNpc) this.closeDialog();
      else if (cur) cur.it.onInteract?.();
      else if (held) this.holding.placeOrDrop();
    }
    // LMB on an empty chair spins it
    if (!held && (inp.lmbDown || inp.dragClick) && cur && cur.it.id.startsWith("chair-")) {
      const st = this.house.stations.get(cur.it.id.slice(6));
      if (st && !this.npcSeatedAt(st.def.id)) {
        st.chairSpin += (fx.chance(0.5) ? 1 : -1) * fx.range(5, 8);
        this.audio.play("spin", st.seatedEye(), 0.6);
        this.hands.play("press", 0.3);
        bus.emit("chair:spun", {});
      }
    }
    // dialog choices
    if (this.ui.dialogOpen) {
      ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"].forEach((k, i) => {
        if (inp.pressed(k)) this.ui.chooseDialog(i);
      });
      this.dialogT += dt;
      if (this.dialogNpc) {
        const d = Math.hypot(this.dialogNpc.x - this.player.pos.x, this.dialogNpc.z - this.player.pos.z);
        if (d > 3.4 || this.dialogT > 40) this.closeDialog();
        else this.dialogNpc.lookAtPlayer(0.5);
      }
    }
    // quick goals peek
    if (inp.pressed("Tab")) {
      const g = this.progress.goalsView();
      this.ui.toast(`Night goals: ${g.map((x) => (x.done ? "■ " : "□ ") + x.text).join("  ")}`);
    }
  }

  private heldHint(): string {
    const h = this.holding.held;
    if (!h) return "";
    const use = h.def.use;
    const useText = use === "drink" ? "LMB drink" : use === "eat" ? "LMB eat" : use === "squeak" ? "LMB squeak" : use === "draw" ? "LMB draw on board" : use === "show" ? "LMB show" : use === "throw" ? "LMB toss" : "";
    return [useText, "hold LMB throw", "E place", "R rotate", "RMB inspect"].filter(Boolean).join(" • ");
  }

  // =================================================================== seating & terminal

  playerStationId(): string | null {
    return this.seat?.def.id ?? null;
  }

  /** Regulars keep their seats even while away from them. */
  reservedBy(stationId: string): string | null {
    for (const n of this.npcs.npcs) {
      if (n.profile.station === stationId && stationId !== this.progress.d.homeStation) return n.name.replace("The ", "");
    }
    return null;
  }

  npcSeatedAt(stationId: string): Npc | null {
    for (const n of this.npcs.npcs) {
      if (n.station?.def.id === stationId && (n.mode === "seated" || n.mode === "sitting" || n.mode === "standing")) return n;
    }
    return null;
  }

  private terminalPose(st: StationVisual) {
    const v = st.terminalView(this.camera.fov, this.camera.aspect);
    return Player.poseLookAt(v.pos, v.target);
  }

  sitAt(st: StationVisual) {
    if (this.player.mode !== "walk" || this.npcSeatedAt(st.def.id) || this.reservedBy(st.def.id)) return;
    if (this.holding.held) this.holding.placeOrDrop();
    this.closeDialog();
    this.seat = st;
    st.chairSpin = 0;
    st.chairYaw = 0;
    this.terminalStation = st;
    this.terminal.setResolution(st.screenPixelSize());
    this.terminal.update(this.time, 1000);
    this.refreshScreens(true);
    this.audio.play("chair", st.seatedEye(), 0.7);
    const eye = st.seatedEye();
    const seatPose = Player.poseYawPitch(eye, st.facing, -0.2);
    this.player.tweenTo(seatPose, 0.45, () => this.enterTerminal());
    this.ui.setPrompt(null);
    this.ui.setCrosshair("hidden");
    bus.emit("player:sat", { stationId: st.def.id });
    if (this.intro.stage === "findpc" || this.intro.stage === "arrive") this.intro.stage = "firsttrade";
    this.events.walkTimer = 0;
  }

  enterTerminal() {
    const st = this.seat;
    if (!st) return;
    this.input.exitLock();
    const pose = this.terminalPose(st);
    this.player.tweenTo(pose, 0.35, () => {
      this.player.enterTerminal(pose);
      bus.emit("player:terminalOpen", { stationId: st.def.id });
    });
    this.ui.centerHint(null);
  }

  private leanBack() {
    const st = this.seat;
    if (!st) return;
    const pose = Player.poseYawPitch(st.seatedEye(), st.facing, -0.1);
    this.player.tweenTo(pose, 0.35, () => {
      this.player.yaw = st.facing;
      this.player.pitch = -0.1;
      this.player.enterSeated(st.seatedEye(), st.facing);
      this.input.requestLock();
    });
    this.terminal.pointerLeave();
  }

  standUp() {
    const st = this.seat;
    if (!st) return;
    this.terminal.pointerLeave();
    this.ui.centerHint(null);
    // pick a free spot behind the chair (never inside furniture or a person)
    const base = new THREE.Vector3(st.def.stand[0], st.def.chair[1], st.def.stand[1]);
    const candidates = [base, base.clone().add(new THREE.Vector3(0, 0, 0.6)), base.clone().add(new THREE.Vector3(0, 0, -0.6))];
    let spot = base;
    for (const c of candidates) {
      if (this.collision.isFree(c.x, c.z, this.player.radius, c.y)) {
        spot = c;
        break;
      }
    }
    const yaw = st.facing + Math.PI;
    const eye = new THREE.Vector3(spot.x, spot.y + this.player.eyeHeight, spot.z);
    this.player.tweenTo(Player.poseYawPitch(eye, yaw, -0.05), 0.5, () => {
      this.player.standAt(spot.x, spot.z, spot.y, yaw);
      this.player.pitch = -0.05;
      this.input.requestLock();
    });
    this.audio.play("chair", st.seatedEye(), 0.6);
    this.seat = null;
    this.ui.setCrosshair("dot");
    bus.emit("player:stood", { stationId: st.def.id });
    if (this.intro.stage === "walk") this.finishIntro();
  }

  private standUpInstant() {
    if (!this.seat) return;
    const st = this.seat;
    this.player.standAt(st.def.stand[0], st.def.stand[1], st.def.chair[1], st.facing + Math.PI);
    this.seat = null;
  }

  private terminalInput() {
    const inp = this.input;
    const st = this.seat;
    if (!st) return;
    this.ui.setPrompt(null);
    this.ui.setCrosshair("hidden");
    this.ui.centerHint(this.ui.touchMode ? null : "<span class='key'>Esc</span> stand up &nbsp; <span class='key'>Space</span> lean back &amp; look around");
    // cursor → screen uv
    const ndc = new THREE.Vector2((inp.cx / window.innerWidth) * 2 - 1, -(inp.cy / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hit = this.ray.intersectObject(st.screen, false)[0];
    if (hit?.uv) this.terminal.pointer(hit.uv.x, hit.uv.y);
    else this.terminal.pointerLeave();
    if (inp.lmbDown && hit) {
      this.terminal.click();
      this.terminal.update(this.time, 1000);
    }
    if (inp.wheel) {
      this.terminal.key(inp.wheel < 0 ? "Equal" : "Minus");
      this.terminal.update(this.time, 1000);
    }
    for (const code of inp.pressedKeys()) {
      if (this.terminal.key(code)) {
        this.audio.play("key", undefined, 0.6);
        this.terminal.update(this.time, 1000);
        continue;
      }
      if (code === "Escape" || code === "KeyQ") {
        this.ui.centerHint(null);
        this.standUp();
        return;
      }
      if (code === "Space") {
        this.ui.centerHint(null);
        this.leanBack();
        return;
      }
    }
  }

  private seatedInput() {
    const inp = this.input;
    this.ui.setCrosshair("dot");
    this.ui.setPrompt("Use the terminal", "Space / Q stand up");
    if (inp.pressed("KeyE") || inp.lmbDown || inp.dragClick) this.enterTerminal();
    else if (inp.pressed("Space") || inp.pressed("KeyQ")) this.standUp();
  }

  // =================================================================== trading

  private trade(assetId: string, side: "BUY" | "SELL" | "SELLALL", usd: number): OrderOutcome {
    const cfg = this.market.config(assetId);
    const meta = { symbol: cfg.symbol, minute: this.market.minute, label: this.clock.minuteOfDay, night: this.clock.night, station: this.terminalStation?.def.label ?? "PC 03" };
    const q = this.market.quote(assetId);
    const closeOnly = this.sessionInfo().closeOnly;
    let r;
    if (side === "BUY") {
      if (closeOnly) r = { ok: false as const, reason: "Session expired. You can still close positions. Extend time at the counter." };
      else r = this.portfolio.buy(assetId, usd, q, meta);
    } else if (side === "SELL") r = this.portfolio.sellNotional(assetId, usd, q, meta);
    else {
      const pos = this.portfolio.position(assetId);
      r = pos ? this.portfolio.sell(assetId, pos.qty, q, meta) : { ok: false as const, reason: `You don't hold any ${cfg.symbol}.` };
    }
    if (!r.ok) {
      this.audio.play("reject", undefined, 0.6);
      bus.emit("trade:rejected", { reason: r.reason });
      return { ok: false, message: r.reason };
    }
    const t = r.trade;
    this.audio.play(t.side === "BUY" ? "buy" : "sell", undefined, 0.7);
    bus.emit("trade:filled", { trade: t });
    if (t.side === "BUY") return { ok: true, message: `Bought ${t.qty.toFixed(t.qty > 100 ? 0 : 3)} ${t.symbol} @ ${t.price.toFixed(cfg.decimals)} • fee ${fmtUsd(t.fee)}` };
    const pnl = t.realizedPnl ?? 0;
    return { ok: true, message: `Sold ${t.symbol} @ ${t.price.toFixed(cfg.decimals)} • realized ${fmtUsd(pnl, true)}. Print it at the counter.` };
  }

  private sessionInfo(): { text: string; low: boolean; closeOnly: boolean } {
    const d = this.progress.d;
    if (d.nightPass) return { text: "NIGHT PASS", low: false, closeOnly: false };
    const m = Math.max(0, d.sessionMin);
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return { text: `SESSION ${h}:${String(mm).padStart(2, "0")}`, low: m <= 15, closeOnly: m <= 0 };
  }

  private coachLine(): string | null {
    const s = this.intro.stage;
    if (s === "firsttrade") return "Pick a token on the left • set a size • press BUY";
    if (s === "walk") return "Positions keep running while you walk around • Esc to stand up";
    return null;
  }

  private onCandle() {
    const minute = this.clock.minuteOfDay;
    if (minute === this.lastCandleMinute) return;
    this.lastCandleMinute = minute;
    if (this.state !== "play") return;
    // session time ticks per in-game minute
    const d = this.progress.d;
    if (!d.nightPass && this.intro.stage === "done") {
      d.sessionMin = Math.max(0, d.sessionMin - 1);
      if (d.sessionMin === 15 && this.sessionWarned !== 15) {
        this.sessionWarned = 15;
        bus.emit("toast", { text: "15 minutes of PC time left. The Owner sells more (5 CR/h)." });
      }
      if (d.sessionMin === 0 && this.sessionWarned !== 0) {
        this.sessionWarned = 0;
        bus.emit("toast", { text: "Session expired: close-only mode. Your positions stay open.", kind: "bad" });
        const owner = this.npcs.get("owner");
        owner.sayText("Your time's up, champ. Positions stay. Want another hour?");
      }
    }
    if (minute >= NIGHT_END && !this.clock.ended) {
      this.clock.ended = true;
      this.endNight();
    }
  }

  // =================================================================== NPC dialog

  talkTo(n: Npc) {
    if (!n.present) return;
    if (this.holding.held?.def.kind === "receipt") {
      this.holding.use();
      return;
    }
    this.dialogNpc = n;
    this.dialogT = 0;
    n.lookAtPlayer(8);
    n.play("talk", 2);
    const d = this.progress.d;
    if (!d.talkedTonight.includes(n.id) && n.id !== "courier") {
      d.talkedTonight.push(n.id);
      this.progress.addRep(2, `Talked to ${n.name}`);
      bus.emit("player:talked", { npcId: n.id });
      if (d.talkedTonight.filter((x) => x !== "owner").length >= 3) this.progress.completeGoal("talk3");
    }
    if (n.id === "owner") return this.ownerDialog(n);
    const greet = n.line(d.talkedTonight.length && n.talkedTonight ? "idle" : "greet") ?? "...";
    n.talkedTonight = true;
    n.sayText(greet);
    const opts: DialogOption[] = [
      {
        label: "How's your trade going?",
        action: () => {
          const pv = n.positionVars();
          if (!pv) n.say("noPos");
          else n.say(pv.pnl > 0.01 ? "ownUp" : pv.pnl < -0.01 ? "ownDown" : "flat", { sym: pv.sym, pct: pv.pct });
          n.play(pv && pv.pnl < 0 ? "shrug" : "nod");
        },
      },
      { label: "Any advice?", action: () => n.say("idle") },
    ];
    if (n.id === "lurker" && (d.challenge === null || d.challenge === "offered")) {
      opts.push({
        label: "Got a challenge for me?",
        action: () => {
          d.challenge = "active";
          n.sayText("Paper ball. Bin by the counter. From behind the tape. Crumple a page at your desk.");
          bus.emit("toast", { text: "Challenge: sink a paper ball in the bin from behind the 3 PTS tape." });
        },
      });
    }
    opts.push({ label: "See you.", action: () => this.closeDialog(true) });
    this.ui.showDialog(n.name, NAME_COLORS[n.id] ?? "#ddd", greet, opts);
  }

  private ownerDialog(n: Npc) {
    const d = this.progress.d;
    const broke = this.portfolio.equity((id) => this.market.quote(id)) < 100;
    const line = broke && d.floatsTonight < 2 ? n.line("broke") ?? "" : n.line("greet") ?? "";
    n.sayText(line);
    const task = d.activeTask ? TASKS.find((t) => t.id === d.activeTask!.id) : null;
    const opts: DialogOption[] = [
      { label: "What's for sale?", action: () => this.openShop() },
      {
        label: task ? `About that job (${task.title})…` : "Got any work?",
        action: () => this.offerTask(n),
      },
      {
        label: `One more hour (5 CR)`,
        disabled: d.nightPass || d.credits < 5,
        action: () => this.buyConsumable("hour"),
      },
      { label: "See you.", action: () => this.closeDialog(true) },
    ];
    this.ui.showDialog(n.name, NAME_COLORS.owner, line, opts);
  }

  closeDialog(sayBye = false) {
    if (!this.dialogNpc) {
      this.ui.hideDialog();
      return;
    }
    if (sayBye) this.dialogNpc.say("bye");
    this.dialogNpc = null;
    this.ui.hideDialog();
  }

  // =================================================================== shop & tasks

  private openShop() {
    this.input.exitLock();
    const render = () => {
      const d = this.progress.d;
      const items = UPGRADES.map((u) => {
        const c = this.progress.canBuy(u);
        const owned = this.progress.owns(u.id);
        const pending = d.pendingDeliveries.includes(u.id);
        return `<div class="shop-item"><div><b>${u.name}</b><br><small>${u.blurb}</small></div><div style="text-align:right"><div class="price">${u.cost} CR${u.rep ? ` • ${u.rep} REP` : ""}</div>${
          owned ? `<small class="good">Owned</small>` : pending ? `<small>On its way…</small>` : `<button data-buy="${u.id}" ${c.ok ? "" : "disabled"}>${c.ok ? "Buy" : c.why}</button>`
        }</div></div>`;
      }).join("");
      const cons = CONSUMABLES.map(
        (c) => `<div class="shop-item"><div><b>${c.name}</b><br><small>${c.id === "hour" ? "Adds 60 minutes of PC time." : "Unlimited PC time until 05:00."}</small></div><div style="text-align:right"><div class="price">${c.cost} CR</div><button data-cons="${c.id}" ${d.credits < c.cost || d.nightPass ? "disabled" : ""}>Buy</button></div></div>`,
      ).join("");
      this.ui.openPanel(
        "shop",
        `<h2>The Owner's price list</h2><p>You have <b style="color:var(--accent)">◆ ${d.credits} CR</b> and ${d.rep} reputation (${this.progress.title}). Upgrades change your station — none of them predict prices.</p><h3>Station & extras</h3>${items}<h3>PC time</h3>${cons}<div class="actions"><button class="primary" data-act="close">Done</button></div>`,
        (root) => {
          root.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach((b) => b.addEventListener("click", () => {
            this.buyUpgrade(b.dataset.buy!);
            render();
          }));
          root.querySelectorAll<HTMLButtonElement>("[data-cons]").forEach((b) => b.addEventListener("click", () => {
            this.buyConsumable(b.dataset.cons!);
            render();
          }));
          root.querySelector("[data-act=close]")!.addEventListener("click", () => {
            this.ui.closePanel();
            this.input.requestLock();
          });
        },
      );
    };
    render();
  }

  private buyUpgrade(id: string) {
    const u = UPGRADES.find((x) => x.id === id);
    if (!u) return;
    const c = this.progress.canBuy(u);
    if (!c.ok || !this.progress.spend(u.cost)) return;
    this.audio.play("credits");
    const owner = this.npcs.get("owner");
    if (u.kind === "station") {
      this.progress.d.pendingDeliveries.push(u.id);
      owner.sayText("Ordered. Courier's usually quick, even in this rain.");
      this.events.delivery(u.id, () => this.spawnDeliveryBox(u.id));
      bus.emit("toast", { text: `${u.name} ordered. Delivery on its way.` });
    } else if (u.id === "locker") {
      this.progress.install("locker");
      owner.sayText("Locker 03, down the hallway. Don't store food in it.");
      bus.emit("toast", { text: "Locker 03 is yours (hallway, right side).", kind: "good" });
    } else if (u.id === "mezz") {
      this.progress.install("mezz");
      this.applyMezz();
      owner.sayText("Upstairs is yours. MZ 1. Take the chain off yourself, it's just decorative anyway.");
      bus.emit("toast", { text: "Mezzanine unlocked — MZ 1 is your new home station. Your upgrades moved with you.", kind: "good" });
    }
    this.save();
  }

  private buyConsumable(id: string) {
    const d = this.progress.d;
    const c = CONSUMABLES.find((x) => x.id === id);
    if (!c || d.nightPass || !this.progress.spend(c.cost)) return;
    if (id === "hour") d.sessionMin += 60;
    else d.nightPass = true;
    this.sessionWarned = -1;
    this.audio.play("credits");
    bus.emit("toast", { text: id === "hour" ? "+1 hour of PC time." : "Night pass active until 05:00.", kind: "good" });
    if (this.dialogNpc?.id === "owner") this.dialogNpc.sayText("Clock's running. Enjoy.");
  }

  private offerTask(n: Npc) {
    const d = this.progress.d;
    if (d.activeTask) {
      const t = TASKS.find((x) => x.id === d.activeTask!.id)!;
      n.sayText(`Still waiting on that: ${t.desc}`);
      return;
    }
    const options = TASKS.filter((t) => (t.id === "wipe" ? this.whiteboard.strokes.length > 0 : true));
    const t = fx.pick(options);
    d.activeTask = { id: t.id, progress: 0 };
    n.sayText(`${t.desc} Pays ${t.reward} CR${this.portfolio.cash < 100 ? ", plus a float" : ""}.`);
    this.setupTask(t.id);
    bus.emit("toast", { text: `Job: ${t.title}` });
  }

  private setupTask(id: string) {
    if (id === "restock") {
      const p = this.props.spawn("crate", new THREE.Vector3(1.75, 0.2, -9.55), { data: { task: true } });
      this.registerProp(p);
    } else if (id === "mice") {
      const spots = [
        [-2.9, 0.8, -6.0],
        [2.9, 0.8, -8.0],
        [-0.6, 0.05, -11.6],
        [-2.95, 0.8, -12.0],
        [0.4, 0.05, -5.0],
      ];
      fx.pick([0, 1]);
      for (const s of spots.sort(() => fx.next() - 0.5).slice(0, 3)) {
        const p = this.props.spawn("mouse", new THREE.Vector3(s[0], s[1], s[2]), { data: { task: true } });
        this.registerProp(p);
      }
    } else if (id === "trash") {
      for (let i = 0; i < 3; i++) {
        const p = this.props.spawn("trash", new THREE.Vector3(fx.range(-1.0, 1.0), 0.1, fx.range(-12, -4.5)), { data: { task: true } });
        this.registerProp(p);
      }
    } else if (id === "reboot") {
      this.ws.pc09Frozen = true;
      this.refreshScreens(true);
    }
  }

  taskProgress(id: string, n: number) {
    const d = this.progress.d;
    if (!d.activeTask || d.activeTask.id !== id) return;
    d.activeTask.progress += n;
    const need = id === "mice" || id === "trash" ? 3 : 1;
    if (d.activeTask.progress < need) {
      bus.emit("toast", { text: `${TASKS.find((t) => t.id === id)!.title}: ${d.activeTask.progress}/${need}` });
      return;
    }
    const t = TASKS.find((x) => x.id === id)!;
    d.activeTask = null;
    d.tasksDone++;
    this.progress.addCredits(t.reward, t.title);
    this.progress.addRep(t.rep, "Helped the Owner");
    this.progress.completeGoal("job");
    if (this.portfolio.cash < 100 && d.floatsTonight < 2) {
      d.floatsTonight++;
      this.portfolio.receiveFloat(250);
      bus.emit("toast", { text: "The Owner spots you a $250 float. (Virtual funds, tracked separately.)", kind: "good" });
    }
    const owner = this.npcs.get("owner");
    owner.sayText(fx.pick(["Appreciated. Seriously.", "Look at you, employee of the month.", "Good. Now go lose it responsibly."]));
    this.save();
  }

  // =================================================================== deliveries & mezzanine

  private spawnDeliveryBox(id: string) {
    const m = materials();
    const box = new THREE.Mesh(rbox(0.32, 0.2, 0.3, 0.015), m.cardboard.clone());
    (box.material as THREE.MeshStandardMaterial).userData.ownGlow = true;
    const spot = this.house.deliveryBoxSpot.clone();
    const n = this.deliveryBoxes.size;
    box.position.set(spot.x, spot.y, spot.z - n * 0.36);
    box.rotation.y = fx.range(-0.15, 0.15);
    box.castShadow = true;
    this.scene.add(box);
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.06), new THREE.MeshBasicMaterial({ map: labelTex("FRAGILE • PC 03", { w: 256, h: 64, fg: "#2a2520", bg: "#e7dfcb", size: 24 }) }));
    lbl.position.set(-0.161, 0.03, 0);
    lbl.rotation.y = -Math.PI / 2;
    box.add(lbl);
    this.deliveryBoxes.set(id, box);
    const u = UPGRADES.find((x) => x.id === id)!;
    this.interaction.add({
      id: `delivery-${id}`,
      targets: [box],
      label: () => `Install ${u.name} at ${this.house.stations.get(this.progress.d.homeStation)!.def.label}`,
      range: 2.2,
      onInteract: () => {
        this.ui.fadeTo(1, 250);
        this.events.at(0.3, () => {
          this.progress.install(id);
          box.removeFromParent();
          this.deliveryBoxes.delete(id);
          this.interaction.remove(`delivery-${id}`);
          this.audio.play("thud", undefined, 0.6);
          this.ui.fadeTo(0, 500);
          bus.emit("toast", { text: `Installed: ${u.name}. Go take a look.`, kind: "good" });
          this.progress.addRep(2, "Upgraded station");
          this.save();
        });
      },
    });
  }

  private applyMezz() {
    const on = this.progress.owns("mezz");
    const g = this.house.chainGate;
    g.group.visible = !on;
    g.collider.enabled = !on;
    if (on && this.progress.d.homeStation !== "mz1") {
      const old = this.house.stations.get(this.progress.d.homeStation)!;
      old.applyLoadout({ ...BASE_LOADOUT, monitor: old.def.monitor });
      this.progress.d.homeStation = "mz1";
    }
    const home = this.house.stations.get(this.progress.d.homeStation)!;
    home.applyLoadout({ ...this.progress.d.loadout, monitor: this.progress.d.homeStation === "mz1" && this.progress.d.loadout.monitor === "crt" ? "lcdWide" : this.progress.d.loadout.monitor });
    if (this.progress.d.homeStation === "mz1") this.terminalStation = home;
  }

  // =================================================================== receipts

  printReceipt() {
    const t = this.portfolio.lastClosedTrade();
    if (!t) {
      bus.emit("toast", { text: "Nothing to print yet. Close a trade first." });
      return;
    }
    this.hands.play("press", 0.35);
    const slot = this.house.printer.slot.clone();
    this.audio.play("printer", slot);
    this.events.at(1.3, () => {
      const tex = receiptTexture(receiptFromTrade(t, this.market.config(t.assetId).decimals));
      const p = this.props.spawn("receipt", slot.clone().add(new THREE.Vector3(-0.06, 0.02, 0)), { data: { tradeId: t.id, texture: tex } });
      p.body.velocity.set(-0.6, 0.4, 0);
      p.home = null;
      this.registerProp(p);
      if (!this.progress.d.printed.includes(t.id)) this.progress.d.printed.push(t.id);
      this.progress.completeGoal("print");
      bus.emit("receipt:printed", { tradeId: t.id });
      this.events.onPrinted((t.realizedPnl ?? 0) >= 0);
    });
  }

  pinReceipt(p: Prop, point: THREE.Vector3) {
    const mural = this.house.mural;
    mural.updateMatrixWorld(true);
    const local = mural.worldToLocal(point.clone());
    const u = clamp(local.x / 1.2 + 0.5, 0.06, 0.94);
    const v = clamp(local.y / 0.9 + 0.5, 0.12, 0.88);
    const rot = fx.range(-0.15, 0.15);
    this.holding.consume();
    this.attachToMural(p, u, v, rot);
    this.progress.d.pinned.push({ tradeId: Number(p.data.tradeId ?? 0), u, v, rot });
    this.audio.play("tick", point);
    this.hands.play("press", 0.3);
    bus.emit("receipt:pinned", { tradeId: Number(p.data.tradeId ?? 0) });
    this.progress.completeGoal("pin");
    if (!this.progress.d.pinned.slice(0, -1).some((x) => !x.npc)) this.progress.addRep(3, "Wall of receipts");
    this.save();
  }

  private attachToMural(p: Prop, u: number, v: number, rot: number) {
    const mural = this.house.mural;
    p.state = "pinned";
    this.physics.suspend(p.body);
    mural.add(p.mesh);
    p.mesh.position.set((u - 0.5) * 1.2, (v - 0.5) * 0.9, 0.022);
    p.mesh.rotation.set(Math.PI / 2, 0, 0);
    p.mesh.rotateY(rot);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshStandardMaterial({ color: "#c0392b", roughness: 0.4 }));
    pin.position.set(0, 0.006, -0.065);
    pin.userData.pin = true;
    p.mesh.add(pin);
    this.pinnedMeshes.push(p);
    // keep the wall tidy: oldest NPC receipts go first
    const pins = this.progress.d.pinned;
    while (this.pinnedMeshes.length > 16) {
      const old = this.pinnedMeshes.find((x) => x.data.npc) ?? this.pinnedMeshes[0];
      this.pinnedMeshes.splice(this.pinnedMeshes.indexOf(old), 1);
      const i = pins.findIndex((x) => (old.data.npc ? x.npc === old.data.npc && x.text === old.data.text : x.tradeId === old.data.tradeId));
      if (i >= 0) pins.splice(i, 1);
      this.interaction.remove(`prop-${old.uid}`);
      old.mesh.removeFromParent();
      this.props.despawn(old);
    }
  }

  unpinReceipt(p: Prop) {
    const pins = this.progress.d.pinned;
    const i = pins.findIndex((x) => (p.data.npc ? x.npc === p.data.npc && x.text === p.data.text : x.tradeId === p.data.tradeId));
    if (i >= 0) pins.splice(i, 1);
    this.pinnedMeshes = this.pinnedMeshes.filter((x) => x !== p);
    p.mesh.children.filter((c) => c.userData.pin).forEach((c) => c.removeFromParent());
    p.mesh.removeFromParent();
    this.props.group.add(p.mesh);
    p.state = "free";
  }

  private npcPrintFlex(n: Npc) {
    const sym = n.realizedSymbol ?? "DELTA";
    const info = npcReceipt(n.name, sym, n.realizedPct);
    const tex = receiptTexture(info);
    const p = this.props.spawn("receipt", new THREE.Vector3(1.5, 1.4, -13.5), { data: { npc: n.id, text: `${sym}|${n.realizedPct.toFixed(4)}`, texture: tex } });
    this.registerProp(p);
    const u = fx.range(0.12, 0.88);
    const v = fx.range(0.2, 0.8);
    const rot = fx.range(-0.2, 0.2);
    this.attachToMural(p, u, v, rot);
    this.progress.d.pinned.push({ tradeId: 0, u, v, rot, npc: n.id, text: `${sym}|${n.realizedPct.toFixed(4)}` });
    this.audio.play("tick", new THREE.Vector3(1.55, 1.4, -13.9));
  }

  // =================================================================== NPC hooks

  private onNpcTrade(n: Npc, side: "BUY" | "SELL", pnl: number) {
    if (side === "SELL") {
      if (n.lastSymbol) n.realizedSymbol = n.lastSymbol;
      const win = pnl >= 0;
      this.npcs.cascade(n, win ? (n.profile.energy > 0.6 ? "celebrate" : "nod") : n.profile.energy > 0.6 ? "headInHands" : "mutter", win ? "closeWin" : "closeLoss", 0.4, {}, n.profile.energy < 0.4);
      if (win && pnl > 0.02 && n.id === "topbuyer" && fx.chance(0.7)) {
        this.events.at(5, () => n.free && n.seated && n.doActivity("printFlex"));
      } else if (!win && fx.chance(0.4)) {
        this.events.at(6, () => n.free && n.seated && n.doActivity("fridge"));
      }
    } else if (n.pos) n.lastSymbol = this.market.config(n.pos.assetId).symbol;
  }

  private npcLeftCan(n: Npc) {
    // sometimes the empty can ends up on their desk (fuel for the cleanup job)
    const st = n.station;
    if (!st || !fx.chance(0.5)) return;
    if (this.props.props.filter((p) => p.def.kind === "can" && p.data.npc).length >= 4) return;
    const pos = st.toWorld(fx.range(-0.5, 0.5), L.deskH + 0.08, -0.55);
    const p = this.props.spawn("can", pos, { data: { npc: n.id, empty: true }, sleep: false });
    p.uses = 0;
    this.registerProp(p);
  }

  // =================================================================== props

  registerProp(p: Prop) {
    propInteractable(this, p);
  }

  private spawnDefaultProps() {
    const home = this.house.stations.get("pc03")!;
    const add = (kind: PropKind, pos: THREE.Vector3, data: Record<string, unknown> = {}, yaw = 0) => {
      const p = this.props.spawn(kind, pos, { home: true, data, sleep: true, quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw) });
      this.registerProp(p);
      return p;
    };
    add("cup", home.toWorld(0.42, L.deskH + 0.055, -0.62), {}, 1.2);
    add("mascot", home.toWorld(-0.32, L.deskH + 0.075, -0.92), {}, home.facing + Math.PI);
    add("marker", new THREE.Vector3(SPOTS.whiteboard.x + 0.06, SPOTS.whiteboard.y - 0.5 + 0.0, SPOTS.whiteboard.z - 0.3), { color: "#1b1b1b" });
    add("marker", new THREE.Vector3(SPOTS.whiteboard.x + 0.06, SPOTS.whiteboard.y - 0.5 + 0.0, SPOTS.whiteboard.z + 0.2), { color: "#2b4fa8" });
    add("chips", new THREE.Vector3(1.56, L.counter.h + 0.12, -2.72), {}, 0.3);
    add("chips", new THREE.Vector3(1.66, L.counter.h + 0.15, -2.8), {}, -0.4);
    add("chips", new THREE.Vector3(-2.2, 0.48, -1.45), {}, 0.8);
    add("cup", new THREE.Vector3(-1.85, 0.5, -1.4), {}, 2);
    this.restockFridge(false);
  }

  restockFridge(full: boolean) {
    const spots = this.house.fridge.canSpots;
    const inside = this.props.props.filter((p) => p.def.kind === "can" && p.data.fromFridge && p.state === "free" && p.body.position.x < -2.45 && p.body.position.z < -3.2 && p.body.position.z > -4.05);
    const want = full ? spots.length : 6;
    for (let i = 0; i < spots.length && inside.length < want; i++) {
      const s = spots[i];
      if (inside.some((p) => Math.hypot(p.body.position.x - s.x, p.body.position.y - s.y, p.body.position.z - s.z) < 0.08)) continue;
      const p = this.props.spawn("can", s.clone(), { data: { fromFridge: true }, sleep: true });
      this.registerProp(p);
      inside.push(p);
    }
    if (full) bus.emit("toast", { text: "Fridge restocked. Cold Overnight for everyone.", kind: "good" });
  }

  storeInLocker(p: Prop) {
    const d = this.progress.d;
    this.holding.consume();
    const entry = JSON.stringify({ kind: p.def.kind, tradeId: p.data.tradeId ?? null, color: p.data.color ?? null, uses: p.uses });
    d.stored.push(entry);
    this.interaction.remove(`prop-${p.uid}`);
    p.mesh.removeFromParent();
    this.props.despawn(p);
    this.audio.play("locker", this.house.lockers[2].inside, 0.5);
    bus.emit("toast", { text: `Stored in locker 03 (${d.stored.length}/3).` });
    this.save();
  }

  takeFromLocker() {
    const d = this.progress.d;
    const raw = d.stored.pop();
    if (!raw) return;
    const e = JSON.parse(raw) as { kind: PropKind; tradeId: number | null; color: string | null; uses: number };
    const data: Record<string, unknown> = {};
    if (e.tradeId) {
      const t = this.portfolio.trade(e.tradeId);
      if (t) data.texture = receiptTexture(receiptFromTrade(t, this.market.config(t.assetId).decimals));
      data.tradeId = e.tradeId;
    }
    if (e.color) data.color = e.color;
    const p = this.props.spawn(e.kind, this.camera.getWorldPosition(new THREE.Vector3()), { data });
    p.uses = e.uses;
    this.registerProp(p);
    this.holding.grab(p);
  }

  private onImpact(body: CANNON.Body, other: CANNON.Body, speed: number) {
    const p = (body as unknown as { prop?: Prop }).prop;
    if (!p) return;
    const pos = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
    const vol = Math.min(1, speed / 5);
    if (p.def.kind === "paper" || p.def.kind === "receipt" || p.def.kind === "trash") this.audio.play("tick", pos, vol * 0.4);
    else this.audio.play(p.def.mass > 0.2 ? "thud" : "tick", pos, vol);
    const npcId = (other as unknown as { npcId?: string }).npcId;
    if (npcId && p.thrownByPlayer && this.time - p.thrownAt < 3) {
      p.thrownByPlayer = false;
      bus.emit("player:hitNpc", { npcId, propKind: p.def.kind, speed });
    }
    // throwing things near the counter annoys the owner
    if (p.thrownByPlayer && this.time - p.thrownAt < 3 && pos.x > 1.2 && pos.z > -3.6 && speed > 3) {
      p.thrownByPlayer = false;
      const owner = this.npcs.get("owner");
      if (fx.chance(0.5)) this.npcs.cascade(owner, null, "hit", 0.5);
    }
  }

  /** Bin scoring, fan wind, cleanup. */
  private propRules(dt: number) {
    const bin = this.house.bin;
    for (const p of this.props.props) {
      if (p.state !== "free") continue;
      const b = p.body;
      // bin
      if (!p.binScored) {
        const dx = b.position.x - bin.pos.x;
        const dz = b.position.z - bin.pos.z;
        if (dx * dx + dz * dz < (bin.radius - 0.02) ** 2 && b.position.y < bin.height - 0.02 && b.position.y > 0) {
          p.binScored = true;
          const fromLine = p.thrownByPlayer && p.thrownFromZ <= SPOTS.binLineZ && this.time - p.thrownAt < 8;
          bus.emit("bin:scored", { propKind: p.def.kind, fromLine });
          if (p.data.task && p.def.kind === "trash") this.taskProgress("trash", 1);
          else if ((p.data.empty || p.def.kind === "paper") && this.progress.d.activeTask?.id === "trash") this.taskProgress("trash", 1);
          const pp = p;
          this.events.at(1.6, () => {
            if (pp.state !== "free") return;
            if (pp.home) this.props.respawnHome(pp);
            else {
              this.interaction.remove(`prop-${pp.uid}`);
              this.props.despawn(pp);
            }
          });
        }
      }
      // standing fan pushes light things around
      if (this.ws.fanOn && p.def.mass < 0.1) {
        const fan = this.house.fan;
        const fp = fan.head.getWorldPosition(tmpV);
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(fan.head.getWorldQuaternion(new THREE.Quaternion()));
        const to = new THREE.Vector3(b.position.x - fp.x, b.position.y - fp.y, b.position.z - fp.z);
        const d = to.length();
        if (d < 3 && d > 0.05) {
          const cos = to.dot(dir) / d;
          if (cos > 0.8) {
            const f = (1 - d / 3) * 0.06 * (cos - 0.8) * 5;
            b.wakeUp();
            b.applyForce(new CANNON.Vec3(dir.x * f, 0.01 * f, dir.z * f));
          }
        }
      }
    }
    void dt;
  }

  // =================================================================== world animation

  openEntryDoor(sec: number) {
    this.ws.doorOpenUntil = this.time + sec;
  }

  flickerLights(sec: number) {
    this.flicker = sec;
  }

  private worldAnim(dt: number) {
    const h = this.house;
    const ws = this.ws;
    // fridge door
    ws.fridgeAngle += ((ws.fridgeOpen ? -1.75 : 0) - ws.fridgeAngle) * damp(7, dt);
    h.fridge.pivot.rotation.y = ws.fridgeAngle;
    const fl = h.fridge.light.material as THREE.MeshStandardMaterial;
    fl.emissiveIntensity += ((ws.fridgeOpen ? 1.1 : 0.12) - fl.emissiveIntensity) * damp(6, dt);
    // fan
    if (ws.fanOn) {
      h.fan.rotor.rotation.z += dt * 22;
      ws.fanOsc += dt * 0.6;
      h.fan.head.rotation.y = Math.sin(ws.fanOsc) * 0.75;
    } else {
      h.fan.rotor.rotation.z += dt * 0.5 * 0;
    }
    // lamp
    const lampTarget = ws.lampOn ? 2.6 : 0;
    h.lamp.light.intensity += (lampTarget - h.lamp.light.intensity) * damp(12, dt);
    (h.lamp.bulb.material as THREE.MeshStandardMaterial).emissiveIntensity = ws.lampOn ? 2.2 : 0.05;
    // lockers
    ws.lockerAngle += ((ws.lockerOpen ? 1.6 : 0) - ws.lockerAngle) * damp(7, dt);
    h.lockers[2].door.rotation.y = -ws.lockerAngle;
    // server door
    ws.serverAngle += ((ws.serverOpen ? -1.4 : 0) - ws.serverAngle) * damp(5, dt);
    h.serverDoor.pivot.rotation.y = ws.serverAngle;
    // entry door (swings outward)
    const open = this.time < ws.doorOpenUntil;
    ws.doorAngle += ((open ? -1.2 : 0) - ws.doorAngle) * damp(5, dt);
    h.entryDoor.rotation.y = -ws.doorAngle;
    // station fans + chair spin
    for (const st of h.stations.values()) st.update(dt, this.time);
    // candle flicker
    const c = h.candle;
    const fk = 0.85 + Math.sin(this.time * 13) * 0.08 + Math.sin(this.time * 31) * 0.05;
    c.flame.scale.set(1, fk, 1);
    c.light.intensity = 0.55 * fk;
    // fluorescent: rare flicker + last-call dip
    const flu = h.lights.flicker[0];
    let fv = 1;
    if (Math.sin(this.time * 0.37) > 0.995) fv = Math.random() > 0.5 ? 0.2 : 1;
    flu.intensity = 3.0 * fv;
    if (this.flicker > 0) {
      this.flicker -= dt;
      const on = Math.floor(this.flicker * 8) % 2 === 0;
      for (const l of h.lights.all) if (l instanceof THREE.PointLight && l !== h.lights.car) l.visible = on;
      if (this.flicker <= 0) for (const l of h.lights.all) l.visible = true;
    }
    // server rack LEDs
    this.ledT += dt;
    if (this.ledT > 0.2) {
      this.ledT = 0;
      const { ctx, tex } = h.rackLeds;
      for (let y = 8; y < 504; y += 24) {
        for (let x = 0; x < 6; x++) {
          const on = Math.random() > 0.35;
          ctx.fillStyle = on ? (Math.random() > 0.85 ? "#ffb020" : "#3dff8a") : "#0b2a16";
          ctx.fillRect(14 + x * 8, y + 8, 4, 4);
        }
        ctx.fillStyle = Math.random() > 0.9 ? "#ff3b30" : "#1a1d21";
        ctx.fillRect(100, y + 7, 6, 6);
      }
      tex.needsUpdate = true;
    }
  }

  // =================================================================== screens

  refreshScreens(force: boolean) {
    const h = this.house;
    for (const st of h.stations.values()) {
      let tex: THREE.Texture | null = this.screens.saver.tex;
      const npc = this.npcSeatedAt(st.def.id);
      if (st === this.terminalStation) tex = this.terminal.texture;
      else if (st.def.id === "pc09" && this.ws.pc09Frozen) tex = this.frozenTexture();
      else if (npc) {
        const asset = npc.pos?.assetId ?? npc.profile.favorites[0] ?? ASSETS[0].id;
        tex = this.screens.mini.get(asset)?.tex ?? tex;
      } else if (st.def.id === this.progress.d.homeStation) tex = this.screens.mini.get(this.terminal.selected)?.tex ?? tex;
      if (force || st.screen.material.map !== tex) st.setScreenTexture(tex);
      if (st.screen2) st.setSecondTexture(this.screens.overview.tex);
    }
  }

  private frozenTexture(): THREE.Texture {
    if (this.frozenTex) return this.frozenTex;
    const [c, ctx] = mkCanvas(320, 240);
    ctx.fillStyle = "#1d3fa8";
    ctx.fillRect(0, 0, 320, 240);
    ctx.fillStyle = "#fff";
    ctx.font = "600 22px monospace";
    ctx.fillText(":(", 24, 60);
    ctx.font = "500 15px monospace";
    ctx.fillText("PC 09 froze again.", 24, 100);
    ctx.fillText("Have you tried E?", 24, 126);
    this.frozenTex = toTexture(c);
    return this.frozenTex;
  }

  private timerRows() {
    const rows: { label: string; who: string; time: string }[] = [];
    for (const st of this.house.stations.values()) {
      if (st.def.row === "mezz" && !this.progress.owns("mezz")) continue;
      const npc = this.npcSeatedAt(st.def.id);
      const mine = st.def.id === this.progress.d.homeStation;
      const s = this.sessionInfo();
      rows.push({
        label: st.def.label.replace(" ", ""),
        who: mine ? "YOU" : npc ? npc.name.replace("The ", "").toUpperCase() : "—",
        time: mine ? (this.progress.d.nightPass ? "PASS" : s.text.replace("SESSION ", "")) : npc ? "NIGHT" : "",
      });
    }
    return rows;
  }

  // =================================================================== intro & HUD

  private updateIntro(dt: number) {
    const s = this.intro;
    if (s.stage === "arrive") {
      s.t += dt;
      const owner = this.npcs.get("owner");
      owner.lookAtPlayer(1);
      if (s.t > 1.2 && s.t - dt <= 1.2) {
        owner.play("wave", 1.4);
        owner.sayText("First night? PC 03 still works.", false, true);
      }
      if (s.t > 3.2 && s.t - dt <= 3.2) {
        bus.emit("toast", { text: "+$1,000 virtual funds • +20 CR • 2h session on PC 03", kind: "good" });
        s.stage = "findpc";
      }
    }
  }

  private finishIntro() {
    if (this.intro.stage === "done") return;
    this.intro.stage = "done";
    this.progress.d.introDone = true;
    this.progress.addRep(5, "Settled in");
    this.events.at(3, () => bus.emit("toast", { text: "Tonight's goals are in the terminal (NIGHT GOALS tab) — or press Tab." }));
    const ns = this.npcs.get("nightshift");
    if (!ns.present) this.events.at(30, () => undefined);
  }

  private objectiveText(): string | null {
    const s = this.intro.stage;
    if (s === "arrive" || s === "findpc") return "Find PC 03 — left row, third seat. Press E to sit.";
    if (s === "firsttrade") return "Make your first trade.";
    if (s === "walk") return "Stand up (Esc). Your position keeps running.";
    const d = this.progress.d;
    if (d.activeTask) {
      const t = TASKS.find((x) => x.id === d.activeTask!.id)!;
      const need = t.id === "mice" || t.id === "trash" ? ` (${d.activeTask.progress}/3)` : "";
      return `Job: ${t.desc}${need}`;
    }
    if (d.challenge === "active") return "Challenge: paper ball in the bin from behind the 3 PTS tape.";
    if (this.deliveryBoxes.size) return "A delivery is waiting by the counter — press E on a box to install it.";
    return null;
  }

  private updateHud(dt: number) {
    void dt;
    const d = this.progress.d;
    const s = this.sessionInfo();
    const eq = this.portfolio.equity((id) => this.market.quote(id));
    const showHud = this.player.mode !== "terminal" && this.intro.stage !== "title";
    this.ui.setHud({
      credits: d.credits,
      rep: d.rep,
      title: this.progress.title,
      clock: fmtClock(this.clock.minuteOfDay),
      night: this.clock.night,
      session: this.intro.stage === "done" ? s.text : null,
      sessionLow: s.low,
      cash: `${fmtUsd(eq)} eq`,
      show: showHud,
    });
    this.ui.setObjective(this.player.mode === "terminal" ? null : this.objectiveText());
    this.ui.setTouchVisible(this.player.mode === "walk");
  }

  // =================================================================== night cycle

  private endNight() {
    this.state = "summary";
    this.standUpInstant();
    this.closeDialog();
    if (this.holding.held) this.holding.drop();
    this.input.exitLock();
    const eq = this.portfolio.equity((id) => this.market.quote(id));
    const realizedTonight = this.portfolio.realizedTotal - this.nightStats.realizedStart;
    const n = this.clock.night;
    const goals = this.progress.goalsView();
    this.ui.fadeTo(0.85, 1200);
    this.ui.openPanel(
      "summary",
      `<h2>Night ${n} is over</h2><p>05:00. The rain eases a little. Somebody finally goes home. Not you, though — you'll be back.</p>
      <div class="kv">
        <span>Trades tonight</span><span>${this.progress.d.tradesTonight}</span>
        <span>Realized tonight</span><span class="${realizedTonight >= 0 ? "good" : "bad"}">${fmtUsd(realizedTonight, true)}</span>
        <span>Equity (virtual)</span><span>${fmtUsd(eq)} (${fmtPct(eq / Math.max(1, this.nightStats.equityStart) - 1)})</span>
        <span>Open positions</span><span>${this.portfolio.allPositions().length}</span>
        <span>Reputation</span><span>${this.progress.d.rep} • ${this.progress.title} (+${this.progress.d.rep - this.nightStats.repStart})</span>
        <span>Credits</span><span>◆ ${this.progress.d.credits} CR</span>
      </div>
      <h3>Goals</h3>${goals.map((x) => `<p>${x.done ? "■" : "□"} ${x.text}</p>`).join("")}
      <p>Open positions stay open. The simulation only runs while the LAN house is open — prices continue exactly where they stopped.</p>
      <div class="actions"><button class="primary" data-act="next">Start night ${n + 1}</button></div>`,
      (root) =>
        root.querySelector("[data-act=next]")!.addEventListener("click", () => {
          this.ui.closePanel();
          this.startNextNight();
        }),
    );
    this.save();
  }

  private startNextNight() {
    const n = this.clock.night + 1;
    this.clock.startNight(n);
    this.progress.newNight(n);
    this.events.resetNight();
    this.walkNudged = false;
    this.resetNpcsForNight(false);
    this.player.teleport(SPOTS.playerStart.x, SPOTS.playerStart.z, SPOTS.playerStart.yaw);
    this.nightStats = { equityStart: this.portfolio.equity((id) => this.market.quote(id)), realizedStart: this.portfolio.realizedTotal, repStart: this.progress.d.rep, tradesStart: 0 };
    this.restockFridge(false);
    this.state = "play";
    this.ui.fadeTo(0, 1400);
    this.input.requestLock();
    const owner = this.npcs.get("owner");
    this.events.at(1.2, () => owner.sayText(fx.pick(["Back again? Of course you are.", "Night two... or whatever number. Same PC?", "Rain's back. So are you."]), false, true));
    bus.emit("toast", { text: `Night ${n} • first hour on the house. New goals in the terminal.` });
    this.save();
  }

  private resetNpcsForNight(first: boolean) {
    for (const n of this.npcs.npcs) {
      n.hide();
      n.mood = 0;
      n.talkedTonight = false;
      if (first) {
        n.pos = null;
        n.realizedPct = 0;
      }
    }
    this.npcs.get("owner").placeAt("ownerSpot", Math.PI / 2);
    for (const id of ["topbuyer", "lurker", "wizard"]) this.npcs.get(id).placeSeated();
    // the owner's ancient Cashcat bag
    const owner = this.npcs.get("owner");
    if (!owner.pos) {
      const q = this.market.quote("cashcat");
      owner.pos = { assetId: "cashcat", qty: 300, entry: q.ask * 1.35, openedTick: this.market.tick - 1e6 };
    }
  }

  // =================================================================== save / load

  save() {
    if (this.state === "title" || this.intro.stage === "title") return;
    const props: SavedProp[] = [];
    for (const p of this.props.props) {
      if (p.state === "held" || p.state === "gone" || p.state === "pinned") continue;
      if (p.def.kind === "receipt" && !p.data.tradeId) continue;
      if (p.data.task) continue;
      const b = p.body;
      const data: SavedProp["data"] = {};
      for (const k of ["tradeId", "fromFridge", "empty", "color", "npc"]) {
        const v = p.data[k];
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") data[k] = v;
      }
      props.push({
        kind: p.def.kind,
        p: [b.position.x, b.position.y, b.position.z],
        q: [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w],
        state: "free",
        uses: p.uses,
        data,
        home: p.home ? [p.home.x, p.home.y, p.home.z] : null,
        hq: p.home ? [p.homeQuat.x, p.homeQuat.y, p.homeQuat.z, p.homeQuat.w] : null,
      });
    }
    // a held item is saved where the player stands, so nothing is lost
    if (this.holding.held) {
      const p = this.holding.held;
      const f = this.player.pos;
      props.push({ kind: p.def.kind, p: [f.x, f.y + 0.3, f.z], q: [0, 0, 0, 1], state: "free", uses: p.uses, data: { ...(p.data.tradeId ? { tradeId: Number(p.data.tradeId) } : {}), ...(p.data.color ? { color: String(p.data.color) } : {}) }, home: p.home ? [p.home.x, p.home.y, p.home.z] : null, hq: null });
    }
    const seatStation = this.seat;
    const pf = seatStation ? { x: seatStation.def.stand[0], y: seatStation.def.chair[1], z: seatStation.def.stand[1], yaw: seatStation.facing + Math.PI } : { x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z, yaw: this.player.yaw };
    const data: SaveData = {
      v: 1,
      savedAt: Date.now(),
      market: this.market.serialize(),
      portfolio: this.portfolio.serialize(),
      progress: this.progress.d,
      clock: this.clock.serialize(),
      player: pf,
      props,
      whiteboard: this.whiteboard.serialize(),
      npcs: this.npcs.npcs.map((n) => ({ id: n.id, pos: n.pos, mood: n.mood, realizedPct: n.realizedPct, present: n.present })),
      world: { fan: this.ws.fanOn, lamp: this.ws.lampOn, rain: this.outside.intensity },
      events: { lastCallDone: this.events.lastCallDone, arrivalDone: this.events.arrivalDone, debateDone: this.events.debateDone },
    };
    SaveStore.write(data);
  }

  private restore(d: SaveData): boolean {
    try {
      if (!this.market.restore(d.market)) return false;
      if (!this.portfolio.restore(d.portfolio)) return false;
      this.progress.d = { ...freshProgress(), ...d.progress, loadout: { ...BASE_LOADOUT, ...d.progress.loadout } };
      this.clock.restore(d.clock);
      this.lastCandleMinute = this.clock.minuteOfDay;
      // stations
      for (const st of this.house.stations.values()) st.applyLoadout({ ...BASE_LOADOUT, monitor: st.def.monitor });
      this.applyMezz();
      this.house.stations.get(this.progress.d.homeStation)!.applyLoadout(this.progress.d.homeStation === "mz1" && this.progress.d.loadout.monitor === "crt" ? { ...this.progress.d.loadout, monitor: "lcdWide" } : this.progress.d.loadout);
      this.terminalStation = this.house.stations.get(this.progress.d.homeStation)!;
      // props
      for (const p of [...this.props.props]) {
        this.interaction.remove(`prop-${p.uid}`);
        p.mesh.removeFromParent();
        this.props.despawn(p);
      }
      this.pinnedMeshes = [];
      for (const sp of d.props ?? []) {
        const data: Record<string, unknown> = { ...sp.data };
        if (sp.kind === "receipt" && sp.data.tradeId) {
          const t = this.portfolio.trade(Number(sp.data.tradeId));
          if (!t) continue;
          data.texture = receiptTexture(receiptFromTrade(t, this.market.config(t.assetId).decimals));
        }
        const p = this.props.spawn(sp.kind, new THREE.Vector3(...sp.p), { quat: new THREE.Quaternion(...sp.q), data, sleep: true });
        p.uses = sp.uses;
        if (sp.home) {
          p.home = new THREE.Vector3(...sp.home);
          if (sp.hq) p.homeQuat = new THREE.Quaternion(...sp.hq);
        }
        this.registerProp(p);
      }
      // ensure the persistent desk/board items exist even in older saves
      if (!this.props.props.some((p) => p.def.kind === "marker")) this.spawnDefaultProps();
      this.restockFridge(false);
      // pinned receipts
      const pins = [...this.progress.d.pinned];
      this.progress.d.pinned = [];
      for (const pin of pins) {
        let tex: THREE.Texture | null = null;
        const data: Record<string, unknown> = {};
        if (pin.npc && pin.text) {
          const [sym, pct] = pin.text.split("|");
          tex = receiptTexture(npcReceipt(this.npcs.get(pin.npc).name, sym, Number(pct)));
          data.npc = pin.npc;
          data.text = pin.text;
        } else {
          const t = this.portfolio.trade(pin.tradeId);
          if (!t) continue;
          tex = receiptTexture(receiptFromTrade(t, this.market.config(t.assetId).decimals));
          data.tradeId = t.id;
        }
        data.texture = tex;
        const p = this.props.spawn("receipt", new THREE.Vector3(1.5, 1.4, -13.5), { data });
        this.registerProp(p);
        this.attachToMural(p, pin.u, pin.v, pin.rot);
        this.progress.d.pinned.push(pin);
      }
      this.whiteboard.restore(d.whiteboard);
      // npcs
      this.resetNpcsForNight(false);
      for (const sn of d.npcs ?? []) {
        const n = this.npcs.byId.get(sn.id);
        if (!n) continue;
        n.pos = sn.pos;
        n.mood = sn.mood;
        n.realizedPct = sn.realizedPct;
        if (sn.id === "nightshift" && sn.present) n.placeSeated();
      }
      // world
      this.ws.fanOn = d.world?.fan ?? false;
      this.audio.fanOn = this.ws.fanOn;
      this.ws.lampOn = d.world?.lamp ?? true;
      this.outside.setTargetIntensity(d.world?.rain ?? 0.7);
      this.events.resetNight();
      this.events.lastCallDone = d.events?.lastCallDone ?? false;
      this.events.arrivalDone = d.events?.arrivalDone ?? false;
      this.events.debateDone = d.events?.debateDone ?? false;
      // player
      const pl = d.player;
      const free = this.collision.isFree(pl.x, pl.z, this.player.radius, pl.y);
      if (free) this.player.teleport(pl.x, pl.z, pl.yaw, pl.y);
      else this.player.teleport(SPOTS.playerStart.x, SPOTS.playerStart.z, SPOTS.playerStart.yaw);
      // pending deliveries arrive right away on load
      for (const id of [...this.progress.d.pendingDeliveries]) this.spawnDeliveryBox(id);
      this.intro.stage = this.progress.d.introDone ? "done" : this.progress.d.firstTradeDone ? "walk" : "findpc";
      this.nightStats = { equityStart: this.portfolio.equity((id) => this.market.quote(id)), realizedStart: this.portfolio.realizedTotal, repStart: this.progress.d.rep, tradesStart: 0 };
      this.refreshScreens(true);
      return true;
    } catch (e) {
      console.error("[save] restore failed, starting fresh", e);
      return false;
    }
  }

  // =================================================================== touch

  private touchButton(code: string, down: boolean) {
    const inp = this.input;
    if (code === "Mouse0") {
      if (down) {
        inp.lmb = true;
        inp.lmbDown = true;
      } else {
        inp.lmb = false;
        inp.lmbUp = true;
      }
    } else if (code === "Mouse2") {
      inp.rmb = down;
    } else if (down) {
      if (code === "Escape") {
        if (this.player.mode === "terminal") this.standUp();
        else this.pause();
      } else inp.tap(code);
    }
  }

  /** Test helper: stand somewhere and look at a point (walk mode). */
  debugLook(x: number, z: number, tx: number, ty: number, tz: number) {
    this.player.mode = "walk";
    this.player.teleport(x, z, 0);
    const eye = new THREE.Vector3(x, this.player.eyeHeight, z);
    const d = new THREE.Vector3(tx, ty, tz).sub(eye);
    this.player.yaw = Math.atan2(-d.x, -d.z);
    this.player.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    this.debugSimulate(0.1);
  }

  /** Debug helper for automated screenshots. */
  debugView(x: number, y: number, z: number, yaw: number, pitch: number) {
    this.player.mode = "frozen";
    this.camera.position.set(x, y, z);
    this.camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
  }
}
