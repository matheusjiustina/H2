import * as THREE from "three";
import type { Game } from "../core/Game";
import { bus } from "../core/EventBus";
import { fx } from "../core/rng";
import { fmtPct } from "../market/format";
import type { Npc } from "../npc/Npc";
import { ARRIVAL, LAST_CALL } from "./NightClock";

interface Scheduled {
  at: number;
  fn: () => void;
}

/**
 * Event director: turns market moves, player actions and the night clock into
 * small, staggered scenes. Global cooldowns keep the room from overreacting.
 */
export class EventDirector {
  private queue: Scheduled[] = [];
  private bigCd = 40;
  private bigActive = 0;
  lastCallDone = false;
  arrivalDone = false;
  debateDone = false;
  private debateAt = 0;
  private rainT = 300;
  private peekCd = 0;
  private commentCd = 0;
  walkTimer = 0;
  private challengeLineCd = 0;

  constructor(private g: Game) {
    bus.on("trade:filled", ({ trade }) => this.onPlayerTrade(trade.side, trade.realizedPnl, trade.symbol, trade.costOfSold ?? 0));
    bus.on("receipt:pinned", ({ tradeId }) => this.onPinned(tradeId));
    bus.on("player:hitNpc", ({ npcId, speed }) => this.onHitNpc(npcId, speed));
    bus.on("chair:spun", () => this.onSpin());
  }

  resetNight() {
    this.lastCallDone = false;
    this.arrivalDone = false;
    this.debateDone = false;
    this.debateAt = fx.range(150, 240); // minute of day
    this.bigCd = 40;
    this.queue = [];
    this.courierBusy = false;
    if (this.deliveryQueue.length) {
      this.courierBusy = true;
      this.at(6, () => this.courierRun());
    }
  }

  at(delay: number, fn: () => void) {
    this.queue.push({ at: this.g.time + delay, fn });
  }

  update(dt: number) {
    const g = this.g;
    const now = g.time;
    this.bigCd -= dt;
    this.bigActive -= dt;
    this.peekCd -= dt;
    this.commentCd -= dt;
    this.challengeLineCd -= dt;
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].at <= now) {
        const s = this.queue.splice(i, 1)[0];
        i--;
        try {
          s.fn();
        } catch (e) {
          console.error("[events]", e);
        }
      }
    }
    const minute = g.clock.minuteOfDay;
    // regular arrival
    if (!this.arrivalDone && minute >= ARRIVAL && g.intro.stage === "done") {
      this.arrivalDone = true;
      this.arrival();
    }
    // last call
    if (!this.lastCallDone && minute >= LAST_CALL) {
      this.lastCallDone = true;
      this.lastCall();
    }
    // whiteboard debate
    if (!this.debateDone && minute >= this.debateAt && g.intro.stage === "done") {
      const wiz = g.npcs.get("wizard");
      const tb = g.npcs.get("topbuyer");
      if (wiz.seated && tb.seated && wiz.free && tb.free && !this.lastCallDone) {
        this.debateDone = true;
        this.debate(wiz, tb);
      }
    }
    // rain changes
    this.rainT -= dt;
    if (this.rainT <= 0) {
      this.rainT = fx.range(240, 480);
      const target = fx.pick([0.35, 0.6, 0.8, 1.0, 0.5]);
      const heavier = target > g.outside.intensity + 0.15;
      g.outside.setTargetIntensity(target);
      bus.emit("rain:changed", { intensity: target });
      if (heavier) {
        const n = g.npcs.nearestTo(g.player.pos, (x) => x.free);
        if (n) g.npcs.cascade(n, null, "rain", 4, {}, true);
        if (target > 0.85) this.at(6, () => g.outside.lightning());
      }
    }
    // "take a walk" goal: away from terminals while holding a position
    if (g.portfolio.allPositions().length > 0 && g.player.mode === "walk") {
      this.walkTimer += dt;
      if (this.walkTimer >= 180) g.progress.completeGoal("walk");
    }
  }

  // ------------------------------------------------------------- THE BIG CANDLE

  onBigMove(assetId: string, dir: 1 | -1, pct: number) {
    const g = this.g;
    if (this.bigCd > 0 || g.intro.stage !== "done" || this.lastCallDone) return;
    this.bigCd = fx.range(90, 140);
    this.bigActive = 12;
    const cfg = g.market.config(assetId);
    const sym = cfg.symbol;
    const up = dir > 0;
    const present = g.npcs.present().filter((n) => n.id !== "owner" && n.mode !== "walk");
    if (!present.length) return;
    // 1) a soft ping at a terminal of someone watching/holding it
    const holders = present.filter((n) => n.pos?.assetId === assetId);
    const noticer = holders[0] ?? fx.pick(present);
    const st = noticer.station;
    const pingPos = st ? st.seatedEye() : new THREE.Vector3(noticer.x, 1.2, noticer.z);
    g.audio.play("ping", pingPos, 0.7);
    // 2) the noticer reacts first
    g.npcs.cascade(noticer, "leanIn", "bigNotice", 0.7, { sym });
    // 3) the big screen catches it, someone else turns to look
    this.at(1.4, () => g.screens.focusBig(assetId, `BIG CANDLE • ${sym} ${fmtPct(pct, 1)}`, up, g.time));
    const others = present.filter((n) => n !== noticer).sort(() => fx.next() - 0.5);
    others.slice(0, 2).forEach((n, i) => {
      this.at(1.8 + i * 1.1, () => n.lookAt(g.house.bigScreen.getWorldPosition(new THREE.Vector3()), 4 + i));
    });
    // 4) holders react to their own result, a non-holder comments
    holders.forEach((n, i) => {
      g.npcs.cascade(n, up ? (n.profile.energy > 0.6 ? "celebrate" : "fistPump") : n.profile.energy > 0.6 ? "headInHands" : "mutter", up ? "bigHolderUp" : "bigHolderDown", 3 + i * 1.3, { sym });
    });
    const commenter = others.find((n) => !holders.includes(n));
    if (commenter) g.npcs.cascade(commenter, "shrug", "bigOther", 4.5 + holders.length * 1.2, { sym });
    // owner remarks from the counter now and then
    if (fx.chance(0.4)) g.npcs.cascade(g.npcs.get("owner"), null, fx.chance(0.5) ? "bigNotice" : "bigOther", 7, { sym });
    // the player's own position matters too
    const mine = g.portfolio.position(assetId);
    if (mine) bus.emit("toast", { text: `${sym} is moving — you hold it.`, kind: up ? "good" : "bad" });
  }

  // ------------------------------------------------------------- player trades

  private onPlayerTrade(side: "BUY" | "SELL", pnl: number | null, sym: string, cost: number) {
    const g = this.g;
    const tb = g.npcs.get("topbuyer");
    const seatId = g.playerStationId();
    if (side === "BUY") {
      // Top Buyer peeks over the divider if he's the neighbor
      if (tb.seated && tb.free && this.peekCd <= 0 && seatId && Math.abs(Number(seatId.slice(2)) - 4) === 1) {
        this.peekCd = 70;
        tb.lookAtPlayer(3);
        g.npcs.cascade(tb, "leanIn", "playerBuy", 1.2, { sym });
      }
      return;
    }
    if (pnl === null || this.commentCd > 0) return;
    this.commentCd = 40;
    const pct = cost > 0 ? pnl / cost : 0;
    const near = g.npcs.nearestTo(g.player.pos, (n) => n.free && n.id !== "courier");
    if (near) g.npcs.cascade(near, pct >= 0 ? "nod" : "shrug", pct >= 0 ? "playerWin" : "playerLoss", 1.5);
  }

  // ------------------------------------------------------------- PRINTER FLEX

  onPrinted(win: boolean) {
    const g = this.g;
    const owner = g.npcs.get("owner");
    owner.lookAtPlayer(3);
    if (fx.chance(0.6)) g.npcs.cascade(owner, "nod", win ? "playerWin" : "playerLoss", 1.6);
  }

  private onPinned(tradeId: number) {
    const g = this.g;
    const t = g.portfolio.trade(tradeId);
    const win = (t?.realizedPnl ?? 0) >= 0;
    const mural = g.house.mural.getWorldPosition(new THREE.Vector3());
    const watchers = g.npcs.present().filter((n) => n.free).sort((a, b) => (a.x - mural.x) ** 2 + (a.z - mural.z) ** 2 - ((b.x - mural.x) ** 2 + (b.z - mural.z) ** 2));
    watchers.slice(0, 2).forEach((n, i) => {
      this.at(0.6 + i * 1.4, () => n.lookAt(mural, 3));
      g.npcs.cascade(n, i === 0 ? "nod" : null, win ? "flexWin" : "flexLoss", 1.2 + i * 1.6);
    });
  }

  // ------------------------------------------------------------- LAST CALL

  private lastCall() {
    const g = this.g;
    bus.emit("night:lastCall", { night: g.clock.night });
    const owner = g.npcs.get("owner");
    owner.busyEvent = 20;
    // lights dip briefly like the owner flicking the switch
    g.flickerLights(1.2);
    owner.goTo("counterFront", () => {
      owner.play("wave", 2);
      owner.say("lastCall", {}, false, true);
      this.at(8, () => owner.goHomeOwner());
    });
    // regulars comment on their positions, one by one
    const regs = g.npcs.present().filter((n) => n.id !== "owner" && n.id !== "courier");
    regs.forEach((n, i) => {
      const pv = n.positionVars();
      const delay = 5 + i * 3.2;
      if (pv) {
        const up = pv.pnl >= 0;
        g.npcs.cascade(n, up ? "nod" : "shrug", up ? "ownUp" : "ownDown", delay, { sym: pv.sym, pct: pv.pct });
      } else g.npcs.cascade(n, null, "lastCall", delay);
    });
    bus.emit("toast", { text: "LAST CALL — the night ends at 05:00. Positions stay open.", kind: "info" });
  }

  // ------------------------------------------------------------- arrivals, debate, deliveries

  private arrival() {
    const g = this.g;
    const ns = g.npcs.get("nightshift");
    if (ns.present) return;
    ns.placeAt("doorOut", Math.PI);
    g.openEntryDoor(3.5);
    g.audio.play("door", new THREE.Vector3(0.2, 2.2, -0.3), 0.8);
    ns.busyEvent = 14;
    ns.goTo("entry", () => {
      ns.play("shakeOff", 1.8);
      this.at(1.9, () => {
        ns.say("arrive", {}, false);
        ns.play("wave", 1.6);
        const owner = g.npcs.get("owner");
        owner.lookAt(new THREE.Vector3(ns.x, 1.6, ns.z), 3);
        g.npcs.cascade(owner, "nod", null, 1.2);
        this.at(2.5, () => ns.goSit());
      });
    });
  }

  private debate(wiz: Npc, tb: Npc) {
    wiz.busyEvent = 30;
    tb.busyEvent = 30;
    wiz.startSpot("whiteboard", "wbStand", Math.PI / 2, 16, () => wiz.goSit());
    this.at(5, () =>
      tb.startSpot("mural", "wbApproach", Math.PI / 2, 12, () => {
        tb.goSit();
      }),
    );
    this.at(11, () => {
      tb.sayText(fx.pick(["Is that a triangle or a tent?", "Okay but when do I buy?", "That's just a pizza slice, man."]));
      tb.play("point", 2);
    });
    this.at(14, () => wiz.sayText(fx.pick(["It's a pennant inside a wedge. Obviously.", "The triangle needs one more triangle.", "Patience. The pattern is still loading."])));
    this.at(17, () => tb.sayText(fx.pick(["I'll wait for confirmation.", "Cool cool. I'm buying whatever's up.", "Got it. No idea. Thanks."]), true));
  }

  private deliveryQueue: { id: string; done: () => void }[] = [];
  private courierBusy = false;

  /** Courier brings purchased upgrades to the counter (one trip carries everything queued). */
  delivery(id: string, done: () => void) {
    this.deliveryQueue.push({ id, done });
    if (!this.courierBusy) {
      this.courierBusy = true;
      this.at(fx.range(8, 12), () => this.courierRun());
    }
  }

  private courierRun() {
    const g = this.g;
    const c = g.npcs.get("courier");
    c.placeAt("doorOut", Math.PI);
    g.openEntryDoor(3);
    g.audio.play("door", new THREE.Vector3(0.2, 2.2, -0.3), 0.8);
    c.goTo("counterFront", () => {
      c.say("arrive");
      c.play("showReceipt", 1.6);
      this.at(1.8, () => {
        const batch = this.deliveryQueue.splice(0);
        for (const d of batch) d.done();
        const owner = g.npcs.get("owner");
        owner.sayText(batch.length > 1 ? "Your stuff's here. Boxes on the counter." : "Your stuff's here. Box is on the counter.");
        owner.play("nod");
        c.goTo("doorOut", () => {
          g.openEntryDoor(2.5);
          this.at(1.5, () => {
            c.hide();
            this.courierBusy = false;
            if (this.deliveryQueue.length) {
              this.courierBusy = true;
              this.at(6, () => this.courierRun());
            }
          });
        });
      });
    });
  }

  private onHitNpc(npcId: string, speed: number) {
    const g = this.g;
    const n = g.npcs.get(npcId);
    if (!n.present || speed < 1.2) return;
    n.annoyed = 4;
    n.lookAtPlayer(3);
    n.play("startled");
    g.npcs.cascade(n, null, "hit", 0.5);
    if (npcId !== "owner" && fx.chance(0.5)) {
      const owner = g.npcs.get("owner");
      g.npcs.cascade(owner, null, "hit", 2.2);
    }
  }

  private onSpin() {
    const g = this.g;
    if (this.commentCd > 0) return;
    this.commentCd = 30;
    const n = g.npcs.nearestTo(g.player.pos, (x) => x.free);
    if (n && fx.chance(0.6)) g.npcs.cascade(n, null, "spin", 0.8);
  }

  /** Lurker's challenge line when the player enters the hall. */
  challengeNudge() {
    if (this.challengeLineCd > 0) return;
    this.challengeLineCd = 60;
  }
}
