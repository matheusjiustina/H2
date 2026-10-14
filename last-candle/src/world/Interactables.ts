import * as THREE from "three";
import type { Game } from "../core/Game";
import { bus } from "../core/EventBus";
import { fx } from "../core/rng";
import { Whiteboard } from "../systems/Whiteboard";
import { Interaction } from "../player/Interaction";
import type { Prop } from "../physics/Props";
import { rbox } from "./geometry";
import { L, SPOTS } from "./layout";
import { colorMat, materials } from "./materials";
import { labelTex } from "./textures";

export interface WorldState {
  fridgeOpen: boolean;
  fridgeAngle: number;
  fanOn: boolean;
  fanOsc: number;
  lampOn: boolean;
  lockerOpen: boolean;
  lockerAngle: number;
  serverOpen: boolean;
  serverAngle: number;
  doorOpenUntil: number;
  doorAngle: number;
  pc09Frozen: boolean;
}

/** Registers every interactive thing in the room with the interaction system. */
export function registerWorldInteractables(g: Game, ws: WorldState) {
  const it = g.interaction;
  const h = g.house;
  const hidden = new THREE.MeshBasicMaterial({ visible: false });

  // ------------------------------------------------------------------ stations
  for (const st of h.stations.values()) {
    const id = st.def.id;
    const label = () => {
      if (st.def.row === "mezz" && !g.progress.owns("mezz")) return null;
      if (g.npcSeatedAt(id)) return null;
      const reserved = g.reservedBy(id);
      if (reserved) return `${st.def.label} — ${reserved}'s seat`;
      const mine = g.progress.d.homeStation === id;
      return `Sit • ${st.def.label}${mine ? " (your station)" : ""}`;
    };
    it.add({
      id: `chair-${id}`,
      targets: [st.chairProxy],
      highlight: null,
      label,
      hint: () => (g.holding.held ? null : "LMB spin"),
      range: 2.0,
      proxy: true,
      onInteract: () => {
        if (g.reservedBy(id)) {
          bus.emit("toast", { text: "That's a regular's seat. Find a free PC — yours is PC 03." });
          return;
        }
        g.sitAt(st);
      },
    });
    it.add({
      id: `monitor-${id}`,
      targets: [st.monitorProxy],
      highlight: null,
      label: () => {
        if (id === "pc09" && ws.pc09Frozen) return "Reboot PC 09";
        if (g.npcSeatedAt(id) || g.reservedBy(id)) return null;
        if (st.def.row === "mezz" && !g.progress.owns("mezz")) return null;
        return `Use terminal • ${st.def.label}`;
      },
      range: 2.4,
      proxy: true,
      onInteract: () => {
        if (id === "pc09" && ws.pc09Frozen) {
          ws.pc09Frozen = false;
          g.audio.play("click", st.seatedEye());
          g.hands.play("press", 0.4);
          bus.emit("toast", { text: "PC 09 reboots with a heroic fan noise.", kind: "good" });
          g.taskProgress("reboot", 1);
          return;
        }
        g.sitAt(st);
      },
    });
  }

  // ------------------------------------------------------------------ fridge
  Interaction.ownMaterials(h.fridge.pivot);
  it.add({
    id: "fridge",
    targets: [h.fridge.door],
    highlight: h.fridge.pivot,
    label: () => {
      const held = g.holding.held;
      if (held?.def.kind === "crate") return "Restock the fridge";
      return ws.fridgeOpen ? "Close fridge" : "Open fridge";
    },
    range: 2.2,
    onInteract: () => {
      const held = g.holding.held;
      if (held?.def.kind === "crate") {
        g.holding.consume();
        g.props.despawn(held);
        g.restockFridge(true);
        g.taskProgress("restock", 1);
        return;
      }
      ws.fridgeOpen = !ws.fridgeOpen;
      g.audio.fridgeOpen = ws.fridgeOpen;
      g.audio.play("fridgeDoor", new THREE.Vector3(-2.6, 1.0, -3.6));
      g.hands.playLeft("reach", 0.45);
      g.physics.setTagEnabled("fridgeDoor", !ws.fridgeOpen);
      if (ws.fridgeOpen) bus.emit("fridge:opened", {});
    },
  });

  // ------------------------------------------------------------------ fan
  Interaction.ownMaterials(h.fan.root);
  it.add({
    id: "fan",
    targets: [h.fan.hit],
    highlight: h.fan.root,
    label: () => (ws.fanOn ? "Turn the fan off" : "Turn the fan on"),
    range: 2.0,
    onInteract: () => {
      ws.fanOn = !ws.fanOn;
      g.audio.fanOn = ws.fanOn;
      g.audio.play("fanToggle", h.fan.root.position);
      g.hands.play("press", 0.35);
      bus.emit("fan:toggled", { on: ws.fanOn });
    },
  });

  // ------------------------------------------------------------------ lamp
  it.add({
    id: "lamp",
    targets: [h.lamp.hit],
    highlight: null,
    label: () => (ws.lampOn ? "Turn the lamp off" : "Turn the lamp on"),
    range: 2.0,
    onInteract: () => {
      ws.lampOn = !ws.lampOn;
      g.audio.play("switch", h.lamp.hit.position);
      g.hands.play("press", 0.35);
      bus.emit("lamp:toggled", { on: ws.lampOn });
    },
  });

  // ------------------------------------------------------------------ whiteboard
  it.add({
    id: "whiteboard",
    targets: [h.whiteboard],
    highlight: null,
    label: () => {
      const wb = g.whiteboard;
      if (wb.wiping) return "Whiteboard";
      if (wb.playerStrokes) return "Wipe your corner";
      if (wb.hasTheory) return "Erase the Wizard's theory";
      return "Whiteboard";
    },
    hint: () => {
      if (g.holding.held?.def.use !== "draw") return "Grab a marker from the tray to draw in the guest corner";
      const uv = g.interaction.current?.uv;
      const inZone = !!uv && !!Whiteboard.toPlayerZone(uv.x, uv.y);
      return inZone ? "Hold LMB to draw" : "Draw in the GUEST CORNER (right side)";
    },
    range: 2.6,
    onInteract: () => {
      const wb = g.whiteboard;
      const theirs = !wb.playerStrokes && wb.hasTheory;
      if (wb.startWipe(wb.playerStrokes ? "p" : "w")) {
        g.hands.playLeft("wipe", 1.5);
        g.audio.play("wipe", h.whiteboard.position);
        bus.emit("player:boardWiped", {});
        g.taskProgress("wipe", 1);
        const wiz = g.npcs.get("wizard");
        if (theirs && wiz.present) {
          wiz.lookAtPlayer(3);
          wiz.sayText(fx.pick(["My theory! ...Fine. I'll draw a better one.", "That was peer-reviewed. By me.", "Erased? The pattern lives on. In here."]));
        }
      }
    },
  });

  // ------------------------------------------------------------------ printer
  Interaction.ownMaterials(h.printer.body);
  it.add({
    id: "printer",
    targets: [h.printer.hit],
    highlight: h.printer.body,
    label: () => {
      if (g.printJob) return "Printing…";
      const t = g.portfolio.lastClosedTrade();
      if (!t) return "Thermal printer — close a trade to print it";
      return `${g.progress.d.printed.includes(t.id) ? "Reprint" : "Print"} receipt • TRADE #${String(t.id).padStart(4, "0")}`;
    },
    range: 2.2,
    onInteract: () => g.printReceipt(),
  });

  // ------------------------------------------------------------------ mural
  it.add({
    id: "mural",
    targets: [h.mural],
    highlight: null,
    label: () => (g.holding.held?.def.kind === "receipt" ? "Pin receipt to the wall" : null),
    range: 2.4,
    onInteract: () => {
      const p = g.holding.held;
      const hit = g.interaction.current;
      if (p?.def.kind === "receipt" && hit) g.pinReceipt(p, hit.point);
    },
  });

  // ------------------------------------------------------------------ bell
  Interaction.ownMaterials(h.bell);
  it.add({
    id: "bell",
    targets: [h.bell],
    label: () => "Ring the bell",
    range: 2.0,
    onInteract: () => {
      g.audio.play("bell", h.bell.position);
      g.hands.play("press", 0.3);
      const owner = g.npcs.get("owner");
      owner.lookAtPlayer(3);
      g.progress.d.bellCount++;
      if (g.progress.d.bellCount === 5) {
        owner.sayText("I heard you the first time. And the fourth.");
        g.progress.findSecret("bell");
      } else if (g.progress.d.bellCount === 1) owner.sayText("Yeah? Talk to me.", true);
    },
  });

  // ------------------------------------------------------------------ notepad (paper balls)
  Interaction.ownMaterials(h.notepad);
  it.add({
    id: "notepad",
    targets: [h.notepad],
    label: () => (g.holding.held ? null : "Crumple a page"),
    range: 2.0,
    onInteract: () => {
      g.hands.play("crumple", 0.6);
      g.hands.playLeft("crumple", 0.6);
      g.audio.play("crumple");
      g.events.at(0.45, () => {
        if (g.holding.held) return;
        const p = g.props.spawn("paper", g.camera.getWorldPosition(new THREE.Vector3()));
        g.registerProp(p);
        g.holding.grab(p);
      });
    },
  });

  // ------------------------------------------------------------------ lost & found box on the counter
  const lf = new THREE.Group();
  lf.position.set(1.62, L.counter.h, -3.3);
  g.scene.add(lf);
  const m = materials();
  const lfBox = new THREE.Mesh(rbox(0.26, 0.14, 0.2, 0.01), m.cardboard.clone());
  lfBox.position.y = 0.07;
  lfBox.castShadow = true;
  lf.add(lfBox);
  const lfLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.05), new THREE.MeshBasicMaterial({ map: labelTex("LOST & FOUND", { w: 256, h: 64, fg: "#2a2520", bg: "#e7dfcb", size: 26 }) }));
  lfLabel.position.set(-0.131, 0.08, 0);
  lfLabel.rotation.y = -Math.PI / 2;
  lf.add(lfLabel);
  (lfBox.material as THREE.MeshStandardMaterial).userData.ownGlow = true;
  it.add({
    id: "lostfound",
    targets: [lfBox],
    label: () => (g.holding.held?.def.kind === "mouse" ? "Drop in lost & found" : null),
    range: 2.2,
    onInteract: () => {
      const p = g.holding.held;
      if (p?.def.kind !== "mouse") return;
      g.holding.consume();
      g.props.despawn(p);
      g.audio.play("thud", lf.position, 0.5);
      g.taskProgress("mice", 1);
    },
  });

  // ------------------------------------------------------------------ lockers
  for (const lk of h.lockers) {
    const mine = lk.index === 2;
    Interaction.ownMaterials(lk.door);
    it.add({
      id: `locker-${lk.index}`,
      targets: [lk.hit],
      highlight: lk.door,
      label: () => {
        if (!mine) return `Locker 0${lk.index + 1} — not yours`;
        if (!g.progress.owns("locker")) return "Locker 03 — rent it from the Owner";
        if (ws.lockerOpen && g.holding.held) return g.progress.d.stored.length >= 3 ? "Locker is full" : "Store in locker";
        if (ws.lockerOpen && g.progress.d.stored.length) return `Take from locker (${g.progress.d.stored.length})`;
        return ws.lockerOpen ? "Close locker" : "Open locker";
      },
      range: 2.0,
      onInteract: () => {
        if (!mine || !g.progress.owns("locker")) {
          g.audio.play("locker", lk.inside, 0.4);
          return;
        }
        const held = g.holding.held;
        if (ws.lockerOpen && held) {
          if (g.progress.d.stored.length >= 3) return;
          g.storeInLocker(held);
          return;
        }
        if (ws.lockerOpen && g.progress.d.stored.length) {
          g.takeFromLocker();
          return;
        }
        ws.lockerOpen = !ws.lockerOpen;
        g.audio.play("locker", lk.inside);
        g.hands.playLeft("reach", 0.4);
      },
    });
  }

  // ------------------------------------------------------------------ server room door
  Interaction.ownMaterials(h.serverDoor.pivot);
  it.add({
    id: "serverDoor",
    targets: [h.serverDoor.hit],
    highlight: null,
    label: () => (g.progress.d.rep >= 40 ? (ws.serverOpen ? "Close the server room" : "Open the server room") : "Server room — staff only"),
    range: 2.2,
    onInteract: () => {
      if (g.progress.d.rep < 40) {
        g.audio.play("locker", h.serverDoor.pivot.position, 0.5);
        bus.emit("toast", { text: "Locked. The Owner: “Earn it.” (Night Owl reputation)" });
        return;
      }
      ws.serverOpen = !ws.serverOpen;
      h.serverDoor.collider.enabled = !ws.serverOpen;
      g.physics.setTagEnabled("serverDoor", !ws.serverOpen);
      g.audio.play("door", h.serverDoor.pivot.position, 0.4);
      g.hands.playLeft("reach", 0.4);
    },
  });

  // ------------------------------------------------------------------ WC door (secret)
  it.add({
    id: "wc",
    targets: [h.wcDoor],
    label: () => "Knock",
    range: 2.0,
    onInteract: () => {
      g.audio.play("thud", h.wcDoor.position, 0.9);
      g.events.at(0.18, () => g.audio.play("thud", h.wcDoor.position, 0.9));
      g.hands.play("press", 0.3);
      g.progress.d.wcKnocks++;
      const lines = ["Occupied.", "Still occupied.", "Occupied since 2021."];
      const k = g.progress.d.wcKnocks;
      bus.emit("toast", { text: `A voice from inside: “${lines[Math.min(k - 1, 2)]}”` });
      if (k >= 3) g.progress.findSecret("wc");
    },
  });

  // ------------------------------------------------------------------ the last candle (secret)
  it.add({
    id: "candle",
    targets: [h.candle.hit],
    label: () => "A single lit candle",
    range: 2.0,
    onInteract: () => {
      bus.emit("toast", { text: "Someone keeps this lit every night. The last candle." });
      g.progress.findSecret("candle");
    },
  });

  // ------------------------------------------------------------------ sticker under the desk (secret)
  const stHit = new THREE.Mesh(rbox(0.3, 0.3, 0.12, 0), hidden);
  stHit.position.copy(h.sticker.position);
  g.scene.add(stHit);
  it.add({
    id: "sticker",
    targets: [stHit],
    label: () => "Read the sticker",
    range: 1.6,
    onInteract: () => {
      bus.emit("toast", { text: "“GM FROM UNDER THE DESK” — someone hid here once." });
      g.progress.findSecret("sticker");
    },
  });

  // ------------------------------------------------------------------ chain gate
  it.add({
    id: "chainGate",
    targets: h.chainGate.group.children.filter((c) => (c as THREE.Mesh).isMesh),
    highlight: null,
    label: () => (g.progress.owns("mezz") ? null : "Mezzanine — premium stations (ask the Owner)"),
    range: 2.4,
    onInteract: () => bus.emit("toast", { text: `Premium needs ${75} rep and 150 CR. The Owner handles it.` }),
  });

  // ------------------------------------------------------------------ entry door
  const doorHit = new THREE.Mesh(rbox(1.2, 2.3, 0.2, 0), hidden);
  doorHit.position.set((L.door.x0 + L.door.x1) / 2, 1.15, 0);
  g.scene.add(doorHit);
  it.add({
    id: "entryDoor",
    targets: [doorHit],
    label: () => "Leave?",
    range: 2.0,
    onInteract: () => bus.emit("toast", { text: "One more trade. Then we go home." }),
  });

  // ------------------------------------------------------------------ PC 09 frozen screen texture
  void colorMat;
  void SPOTS;
  void fx;
}

/** Interactable for a physical prop (pick up). */
export function propInteractable(g: Game, p: Prop) {
  g.interaction.add({
    id: `prop-${p.uid}`,
    targets: (() => {
      const out: THREE.Object3D[] = [];
      p.mesh.traverse((o) => (o as THREE.Mesh).isMesh && out.push(o));
      return out;
    })(),
    highlight: p.mesh,
    label: () => {
      if (g.holding.held) return null;
      if (p.state === "pinned") return "Take the receipt";
      if (p.state !== "free") return null;
      const n = p.data.empty ? `Empty ${p.def.kind === "chips" ? "bag" : p.def.kind === "can" ? "can" : p.def.kind}` : p.def.name;
      return `Pick up • ${n}`;
    },
    range: 2.1,
    priority: 1,
    onInteract: () => g.holding.grab(p),
  });
}
