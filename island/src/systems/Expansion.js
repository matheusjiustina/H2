import * as THREE from 'three';
import { Progress } from './Progress.js';
import { RELICS, EXPANSION_ITEMS, CONTAINERS, NOTES, PLACES, MISSIONS, MISSION_ORDER, FREQUENCIES, NODE_ORDER } from './Content.js';
import { buildContainerModel, buildCargoCase } from '../environment/ContainerModels.js';
import { ITEMS } from '../player/Inventory.js';
import { LED } from '../world/SiteKit.js';
import { ExpansionUI } from '../ui/ExpansionUI.js';

Object.assign(ITEMS, EXPANSION_ITEMS);

const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const V3 = () => new THREE.Vector3();
const hidden = new THREE.MeshBasicMaterial({ visible: false });

/**
 * The archipelago expansion's gameplay layer: treasure containers, clues, relics, the
 * Signal Lost puzzles at the radio station, cargo runs by skiff and seaplane and the
 * mission engine, all saved through Progress. It hooks into the existing systems:
 * interactions, inventory, toasts, the boat, the seaplane and the player.
 */
export class Expansion {
  constructor(game) {
    this.g = game;
    this.P = new Progress();
    this.A = { ...game.sites.anchors, ...game.wreck.anchors };
    this.places = {};
    for (const [k, v] of Object.entries(PLACES)) this.places[k] = { ...v };
    this._placesFromAnchors();
    this.anims = [];
    this.containers = new Map();
    this.spots = [];
    this.cargo = {}; // cargo id -> { def, mission, pickup, aboard }
    this.ui = new ExpansionUI(game, this);
    this._tick = 0;
    this._lastDiscovered = 0;

    this._buildContainers();
    this._buildSpots();
    this._buildCargo();
    this._initMissions();
    this._restore();
  }

  // ================================================================ places
  _placesFromAnchors() {
    const map = {
      stationBox: 'station.powerBox', stationTerminal: 'station.terminal', coveRadio: 'cove.radio', coveDock: 'cove.dockEnd',
      outpostDock: 'outpost.dockEnd', outpostHut: 'outpost.terminal', outpostMast: 'outpostMast.base', stripShelter: 'airstrip.drop',
      stripBeacon: 'stripBeacon.switch', stripCamp: 'stripCamp.journal', stripDock: 'stripDock.end', relicRuins: 'relic.node',
      relicSummit: 'relicTower.slab', relicCave: 'relicCave.crystal', pierBoard: 'pier.board', wreck: 'wreck.centre',
    };
    for (const [place, anchor] of Object.entries(map)) {
      const a = this.A[anchor];
      if (!a) continue;
      const p = this.places[place];
      p.x = a.pos.x; p.z = a.pos.z; p.y = a.pos.y;
    }
  }

  placePos(id, out = V3()) {
    const p = this.places[id];
    if (!p) return null;
    return out.set(p.x, p.y ?? this.g.collision.ground(p.x, p.z, 1e4).y + 1, p.z);
  }

  // ================================================================ helpers
  flag(f) { return this.P.has(f); }
  setFlag(f) { if (this.P.set(f)) this._missionsDirty = true; }

  addItem(id, n = 1) {
    this.g.inventory.add(id, n, { equip: false });
    this.P.addItem(id, n);
    this._missionsDirty = true;
  }

  removeItem(id, n = 1) {
    this.g.inventory.remove(id, n);
    this.P.addItem(id, -n);
  }

  itemCount(id) { return this.g.inventory.count(id); }

  /** Show a clue/log/transmission and remember it. */
  readNote(id, { show = true } = {}) {
    const n = NOTES[id];
    if (!n) return;
    const first = this.P.readNote(id);
    this.setFlag(`note.${id}`);
    if (show) this.ui.showNote(n, first);
    if (first) this._onNote(id);
  }

  _onNote(id) {
    // some clues mark the chart
    const marks = { sandbarCoords: 'sandbar', transmission2: 'outpost', fragmentsJoined: 'vault', operatorLog: 'outpostVault', expeditionJournal: 'stripCamp', researchNote: 'stripCamp', wreckChart: 'coveRadio' };
    if (marks[id]) { this.P.data.chart[marks[id]] = true; this.P.save(); }
    if (id === 'navLog' && !this.itemCount('navLog')) this.addItem('navLog');
  }

  /** Pay out a reward once (credits, relic, items, note). Returns a description for the reveal card. */
  award(key, { credits = 0, relic = null, items = null, note = null, where = '' } = {}) {
    if (!this.P.claim(key)) return null;
    const out = { credits, relic, items: [], note };
    if (credits) this.P.addCredits(credits);
    if (relic && RELICS[relic]) {
      if (this.P.addRelic(relic, where || RELICS[relic].where)) out.relicNew = true;
    }
    if (items) for (const [id, n] of Object.entries(items)) { this.addItem(id, n); out.items.push({ id, n, name: ITEMS[id]?.name || id }); }
    return out;
  }

  /** A clickable, invisible pick box parented to an anchor's group. */
  addSpot(anchorName, opts) {
    const a = typeof anchorName === 'string' ? this.A[anchorName] : anchorName;
    if (!a) { console.warn('missing anchor', anchorName); return null; }
    const size = opts.size || [0.6, 0.6, 0.6];
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), hidden);
    if (a.parent && a.local) { m.position.copy(a.local); a.parent.add(m); } else { m.position.copy(a.pos); this.g.scene.add(m); }
    if (opts.offset) m.position.add(new THREE.Vector3(...opts.offset));
    m.updateMatrixWorld(true);
    const it = this.g.interaction.add({ object: m, name: opts.name || anchorName, interactionDistance: opts.distance || 2.6, interactionLabel: opts.label, onInteract: opts.onInteract, priority: opts.priority ?? 1, boxPadding: 0.05 });
    this.spots.push(it);
    return it;
  }

  animate(duration, fn, done) { this.anims.push({ t: 0, duration, fn, done }); }

  // ================================================================ containers
  _buildContainers() {
    const g = this.g;
    for (const [id, def] of Object.entries(CONTAINERS)) {
      const model = buildContainerModel(def.tier, g.materials);
      const a = def.anchor ? this.A[def.anchor] : null;
      if (def.anchor && !a) { console.warn('container anchor missing', id); continue; }
      const root = model.group;
      if (a) {
        root.position.copy(a.local);
        root.rotation.y = a.localYaw || 0;
        a.parent.add(root);
      } else {
        const y = g.collision.ground(def.x, def.z, 1e4).y;
        root.position.set(def.x, y, def.z);
        root.rotation.y = def.yaw || 0;
        g.scene.add(root);
      }
      const baseY = root.position.y;
      if (def.buried) { root.position.y -= model.size[1] * 0.7; root.rotation.z = 0.18; }
      root.updateWorldMatrix(true, true);
      // a walkable lid so it is a solid object in the world (not the hidden/buried ones)
      if (!def.buried && !def.hidden) {
        const wp = root.getWorldPosition(V3());
        const [sx, sy, sz] = model.size;
        g.collision.addBox({ x: wp.x, y: wp.y + sy / 2, z: wp.z, hx: sx / 2, hy: sy / 2, hz: sz / 2, yaw: (a ? a.yaw : def.yaw || 0), walkable: true, surface: def.tier === 'supply' ? 'wood' : 'metal' });
      }
      const c = { id, def, model, root, baseY, open: false };
      c.it = g.interaction.add({
        object: root, name: `container:${id}`, interactionDistance: 2.6, priority: 2, boxPadding: 0.08,
        interactionLabel: () => this._containerLabel(c),
        onInteract: () => this._useContainer(c),
      });
      this.containers.set(id, c);
    }
  }

  _containerLabel(c) {
    const { def } = c;
    if (c.open || this.P.isOpen(c.id)) return null;
    if (def.hidden && !this.flag(def.hidden)) return null;
    if (def.buried && !this.flag(`dug.${c.id}`)) return 'Dig out the buried container';
    if (c.id === 'coveSecret' && !this.flag('cove.tarp')) return 'Pull back the tarp';
    const n = def.name.toLowerCase();
    const what = n.startsWith('the ') ? n : `the ${n}`;
    if (def.code && !this.flag(`code.${c.id}`)) return `Unlock ${what}`;
    return `Open ${what}`;
  }

  _useContainer(c) {
    const { def } = c;
    const g = this.g;
    if (c.open || this.P.isOpen(c.id) || c.busy) return;
    if (def.hidden && !this.flag(def.hidden)) return;
    if (def.buried && !this.flag(`dug.${c.id}`)) {
      c.busy = true;
      g.audio?.play('thudSand', { position: c.root.getWorldPosition(V3()), volume: 0.8 });
      const p0 = c.root.position.y, r0 = c.root.rotation.z;
      this.animate(1.4, (t) => { c.root.position.y = p0 + (c.baseY - p0) * ease(t); c.root.rotation.z = r0 * (1 - ease(t)); }, () => { c.busy = false; this.setFlag(`dug.${c.id}`); });
      g.particles?.sandPuff?.(c.root.getWorldPosition(V3()).x, c.baseY, c.root.getWorldPosition(V3()).z, 1.5);
      return;
    }
    if (c.id === 'coveSecret' && !this.flag('cove.tarp')) {
      const tarp = this.A['coveSecret.tarp']?.mesh;
      if (tarp) { const y0 = tarp.position.y; this.animate(0.8, (t) => { tarp.position.y = y0 + ease(t) * 0.1; tarp.rotation.z = ease(t) * 1.3; tarp.position.x = ease(t) * 1.0; }); }
      this.setFlag('cove.tarp');
      g.audio?.play('cloth', { volume: 0.6 });
      return;
    }
    if (def.code && !this.flag(`code.${c.id}`)) {
      this.ui.keypad({
        title: def.name, digits: def.code.length,
        hint: def.codeHint && this.flag(`note.${def.codeHint}`) ? 'You have read something about this combination.' : 'A keypad. Somewhere there is a note with the combination.',
        note: def.codeHint && this.flag(`note.${def.codeHint}`) ? NOTES[def.codeHint] : null,
        onSubmit: (code) => {
          if (code !== def.code) return false;
          this.setFlag(`code.${c.id}`);
          if (c.model.led) c.model.led.material.color.copy(LED.green);
          g.audio?.play('click', { volume: 0.7 });
          setTimeout(() => this._openContainer(c), 350);
          return true;
        },
      });
      return;
    }
    this._openContainer(c);
  }

  _openContainer(c) {
    const g = this.g;
    if (c.open) return;
    c.open = true;
    this.P.open(c.id);
    const pos = c.root.getWorldPosition(V3());
    g.audio?.play(c.def.tier === 'supply' ? 'creakOpen' : 'knock', { position: pos, volume: 0.8 });
    g.audio?.play('click', { position: pos, volume: 0.5 });
    const piv = c.model.pivot;
    this.animate(1.0, (t) => { piv.rotation.x = -ease(t) * (c.def.tier === 'vault' ? 1.75 : 1.95); });
    g.particles?.dust?.(pos.x, pos.y + 0.4, pos.z);
    setTimeout(() => {
      const d = c.def.contents || {};
      const res = this.award(`container.${c.id}`, { credits: d.credits || 0, relic: d.relic || null, items: d.items || null, where: RELICS[d.relic]?.where });
      this.setFlag(`container.${c.id}`);
      if (c.def.flag) this.setFlag(c.def.flag);
      if (res) this.ui.reveal({ title: c.def.name, ...res });
      if (c.def.note) setTimeout(() => this.readNote(c.def.note, { show: c.id !== 'finalVault' && !this.ui.isBusy() }), 1800);
      if (c.id === 'finalVault') setTimeout(() => this._finale(), 4200);
    }, 700);
  }

  // ================================================================ site interactions
  _buildSpots() {
    const A = this.A, g = this.g;
    // ---------------- ridge station
    this.addSpot('station.powerBox', {
      size: [0.8, 0.9, 0.5], label: () => (this.flag('station.power') ? null : 'Open the breaker panel'),
      onInteract: () => {
        if (this.flag('station.power')) return;
        this.ui.breaker({ onSolved: () => { this.setFlag('station.power'); this._stationVisuals(); g.audio?.play('click', { volume: 0.8 }); g.toast('Power restored. The terminal hums awake.'); } });
      },
    });
    this.addSpot('station.terminal', { size: [0.9, 0.7, 0.6], label: () => (this.flag('station.power') ? 'Use the terminal' : 'Terminal (no power)'), onInteract: () => this._stationTerminal() });
    this.addSpot('station.logbook', { size: [0.4, 0.2, 0.4], priority: 3, label: 'Read the station logbook', onInteract: () => this.readNote('stationLog') });
    // ---------------- outpost
    this.addSpot('outpost.log', { size: [0.4, 0.2, 0.4], priority: 3, label: 'Read the operator’s log', onInteract: () => this.readNote('operatorLog') });
    this.addSpot('outpost.terminal', { size: [0.9, 0.7, 0.6], label: 'Use the radio console', onInteract: () => this._outpostTerminal() });
    this.addSpot('outpost.hatch', {
      size: [1.4, 0.2, 1.0], priority: 1,
      label: () => (!this.flag('outpost.rug') ? 'Move the rug' : !this.flag('outpost.hatchOpen') ? 'Lift the trapdoor' : null),
      onInteract: () => {
        const a = A['outpost.hatch'];
        if (!this.flag('outpost.rug')) {
          this.setFlag('outpost.rug');
          const rug = a.rug; const x0 = rug.position.x;
          this.animate(0.7, (t) => { rug.position.x = x0 - ease(t) * 1.1; });
          a.pivot.visible = true;
          g.audio?.play('cloth', { volume: 0.5 });
        } else if (!this.flag('outpost.hatchOpen')) {
          this.setFlag('outpost.hatchOpen');
          this.animate(0.9, (t) => { a.pivot.rotation.z = ease(t) * 1.75; });
          g.audio?.play('creakOpen', { volume: 0.7 });
        }
      },
    });
    this.addSpot('outpostMast.base', { size: [1.2, 1.6, 1.2], label: () => (this.flag('outpost.online') ? null : 'Inspect the transmitter bracket'), onInteract: () => this._installTransmitter() });
    // ---------------- cove
    this.addSpot('cove.radio', { size: [0.9, 0.7, 0.6], label: 'Use the cove radio', onInteract: () => this._coveRadio() });
    this.addSpot('cove.note', { size: [0.35, 0.4, 0.2], priority: 3, label: () => (this.flag('cargo.supplyCase.delivered') ? 'Read the note' : null), onInteract: () => { if (this.flag('cargo.supplyCase.delivered')) this.readNote('smugglerNote'); } });
    // ---------------- relic island
    this.addSpot('relic.glyph', { size: [1.2, 1.0, 0.8], label: 'Study the carved stone', onInteract: () => this.readNote('relicGlyph') });
    this.addSpot('relic.node', { size: [0.8, 1.0, 0.8], label: () => (this.flag('relic.node') ? null : 'Examine the copper cradle'), onInteract: () => this._relicNode() });
    this.addSpot('relicCave.crystal', { size: [0.5, 0.5, 0.5], priority: 3, label: () => (this.flag('pickup.crystal') ? null : 'Take the crystal'), onInteract: () => this._takeCrystal() });
    this.addSpot('relicTower.slab', { size: [1.6, 0.4, 1.2], label: () => (this.flag('relic.slabOpen') ? null : 'Examine the stone slab'), onInteract: () => this._slab() });
    // ---------------- airstrip island
    this.addSpot('airstrip.transmitter', { size: [0.5, 0.4, 0.4], priority: 3, label: () => (this.flag('pickup.transmitter') ? null : 'Take the transmitter module'), onInteract: () => this._takeTransmitter() });
    this.addSpot('airstrip.notice', { size: [0.4, 0.5, 0.2], priority: 3, label: 'Read the notice', onInteract: () => this.readNote('researchNote') });
    this.addSpot('airstrip.radio', { size: [0.9, 0.7, 0.6], label: 'Use the shelter radio', onInteract: () => this._screenOnly('airstrip.radio', ['RESEARCH SHELTER', 'expedition overdue', this.flag('beacon.power') ? 'south beacon: ONLINE' : 'south beacon: dark']) });
    this.addSpot('stripBeacon.switch', {
      size: [0.8, 1.0, 0.6],
      label: () => (!this.flag('beacon.power') ? 'Switch the beacon on' : !this.flag('beacon.fragment') ? 'Open the beacon housing' : null),
      onInteract: () => {
        if (!this.flag('beacon.power')) {
          this.setFlag('beacon.power'); this._beaconVisuals(); g.audio?.play('click', { volume: 0.8 });
          g.toast('The beacon blinks into life.');
        } else if (!this.flag('beacon.fragment')) {
          this.setFlag('beacon.fragment');
          const res = this.award('beacon.fragment', { items: { signalFragment: 1 } });
          if (res) this.ui.reveal({ title: 'Beacon housing', ...res });
          setTimeout(() => this.readNote('beaconLog', { show: !this.ui.isBusy() }), 1500);
        }
      },
    });
    this.addSpot('stripCamp.journal', { size: [0.4, 0.3, 0.4], priority: 3, label: 'Read the expedition journal', onInteract: () => { this.readNote('expeditionJournal'); if (!this.itemCount('expeditionNotes')) this.addItem('expeditionNotes'); } });
    // ---------------- the wreck
    this.addSpot('wreck.chart', { size: [0.8, 0.3, 1.2], label: 'Study the damaged chart', onInteract: () => this.readNote('wreckChart') });
    this.addSpot('wreck.log', { size: [0.4, 0.25, 0.4], priority: 3, label: 'Take the navigation log', onInteract: () => this.readNote('navLog') });
    this.addSpot('wreck.panel', { size: [0.3, 0.75, 0.95], label: () => (this.flag('wreck.panelOpen') ? null : 'Examine the framed chart'), onInteract: () => this._wreckPanel() });
    // ---------------- the harbour ledger on the camp pier
    this.addSpot('pier.board', { size: [1.4, 1.0, 0.4], label: 'Read the harbour ledger', onInteract: () => this.ui.board() });
  }

  _screen(anchor, lines, color = '#9fd6a4') {
    const a = this.A[anchor];
    if (!a?.screen) return;
    a.screen.draw((g, W, H) => {
      g.fillStyle = '#040806'; g.fillRect(0, 0, W, H);
      g.fillStyle = color; g.font = `${Math.round(H / 9)}px monospace`;
      lines.forEach((l, i) => g.fillText(l, W * 0.06, H * 0.2 + i * H * 0.15));
      g.fillStyle = 'rgba(255,255,255,0.04)';
      for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    });
  }

  _screenOnly(anchor, lines) { this._screen(anchor, lines); this.g.audio?.play('click', { volume: 0.4 }); this.g.toast(lines.slice(1).join(' · ')); }

  _leds(anchor, colors) {
    const a = this.A[anchor];
    if (!a?.leds) return;
    a.leds.forEach((l, i) => l.material.color.copy(LED[colors[i] || 'off']));
  }

  _stationVisuals() {
    const on = this.flag('station.power');
    this._leds('station.powerBox', on ? ['red', 'green', 'green', 'green'] : []);
    this._leds('station.terminal', on ? ['green', 'amber', 'green'] : []);
    const lamp = this.A['station.doorLamp']?.led;
    if (lamp) lamp.material.color.copy(on ? LED.white : LED.off);
    const mast = this.A['station.mast']?.light;
    if (mast) this.g.sites.setBlink(mast, on, 1.6);
    if (!on) { this._screen('station.terminal', []); return; }
    const nodes = [this.flag('outpost.online'), this.flag('beacon.power'), this.flag('relic.node')].filter(Boolean).length;
    this._screen('station.terminal', ['ISLAND NET · NODE 0', this.flag('station.tuned1') ? 'carrier 147.30 locked' : 'no carrier', `nodes online ${nodes}/3`, this.flag('station.linked') ? 'NETWORK RESTORED' : this.flag('station.fragments') ? 'vault message: decoded' : '']);
  }

  _beaconVisuals() {
    const a = this.A['stripBeacon.switch'];
    const on = this.flag('beacon.power');
    if (a) { a.led.material.color.copy(on ? LED.green : LED.off); this.g.sites.setBlink(a.light, on, 2.4); }
  }

  _outpostVisuals() {
    const a = this.A['outpostMast.base'];
    const on = this.flag('outpost.online');
    if (!a) return;
    a.module.visible = on;
    a.led.material.color.copy(on ? LED.green : LED.off);
    this.g.sites.setBlink(a.light, on, 2.0);
    this._screen('outpost.terminal', on ? ['OUTPOST NODE', 'transmitter OK', 'NODE ONLINE'] : ['OUTPOST NODE', 'transmitter missing', 'node dark'], on ? '#9fd6a4' : '#d6a46a');
    this._leds('outpost.terminal', on ? ['green', 'green', 'amber'] : ['red']);
  }

  _stationTerminal() {
    const g = this.g;
    if (!this.flag('station.power')) { g.toast('Dead. The breaker panel outside is open to the weather.'); return; }
    const ui = this.ui;
    const opts = [];
    if (!this.flag('station.tuned1')) opts.push({ label: 'Tune the receiver', run: () => ui.tuner({ title: 'Receiver', target: FREQUENCIES.tune1, hint: 'The logbook mentions the island carrier.', onSolved: () => { this.setFlag('station.tuned1'); this._stationVisuals(); this.readNote('transmission1'); } }) });
    else if (this._missionState('s2') === 'active' && !this.flag('station.tuned2')) opts.push({ label: 'Search for another signal', run: () => ui.tuner({ title: 'Receiver — sweep', target: FREQUENCIES.tune2, hint: 'Something faint between 150 and 153.', onSolved: () => { this.setFlag('station.tuned2'); this._stationVisuals(); this.readNote('transmission2'); } }) });
    if (this.itemCount('signalFragment') >= 3 && !this.flag('station.fragments')) opts.push({ label: 'Reassemble the signal fragments', run: () => ui.fragments({ onSolved: () => { this.setFlag('station.fragments'); this._stationVisuals(); this.readNote('fragmentsJoined'); } }) });
    if (this.flag('station.fragments') && !this.flag('station.linked')) opts.push({
      label: 'Link the nodes', run: () => ui.nodes({
        status: { outpost: this.flag('outpost.online'), beacon: this.flag('beacon.power'), stones: this.flag('relic.node') }, order: NODE_ORDER,
        onSolved: () => { this.setFlag('station.linked'); this._stationVisuals(); g.toast('All three nodes answer. Somewhere on Relic Island, stone grinds on stone.'); g.audio?.play('thunder', { volume: 0.25, rate: 1.6 }); },
      }),
    });
    const heard = ['transmission1', 'transmission2', 'transmission3'].filter((n) => this.P.data.notes.includes(n));
    for (const n of heard) opts.push({ label: `Replay ${NOTES[n].title.toLowerCase()}`, run: () => this.readNote(n) });
    if (!opts.length) opts.push({ label: 'Check the network status', run: () => this._stationVisuals() });
    ui.menu({ title: 'Ridge station terminal', items: opts });
  }

  _outpostTerminal() {
    this._outpostVisuals();
    if (this.flag('outpost.online')) { this.readNote('transmission3'); return; }
    this.g.toast('The console is live on battery, but the mast has no transmitter.');
  }

  _installTransmitter() {
    const g = this.g;
    if (this.flag('outpost.online')) return;
    if (!this.flag('cargo.commsKit.delivered')) { g.toast('The bracket is empty and the cabling is gone. The mast needs new communication equipment first.'); return; }
    if (!this.itemCount('transmitter')) { g.toast('Cabling done. The transmitter bracket is still empty.'); return; }
    this.removeItem('transmitter');
    this.setFlag('outpost.online');
    this._outpostVisuals();
    g.audio?.play('click', { volume: 0.9 });
    g.toast('Transmitter installed. The outpost node comes online.');
    setTimeout(() => this.readNote('transmission3', { show: !this.ui.isBusy() }), 1500);
  }

  _coveRadio() {
    const g = this.g;
    if (this.itemCount('navLog') && !this.flag('note.accessCode')) {
      this.ui.cipher({ cipher: 'JGMFHO', key: 5, onSolved: () => { this.readNote('accessCode'); if (!this.itemCount('accessCode')) this.addItem('accessCode'); } });
      return;
    }
    this._screen('cove.radio', ['COVE RADIO', 'cipher wheel ready', this.flag('note.accessCode') ? 'last: 417029' : '']);
    g.toast(this.flag('note.accessCode') ? 'The cipher wheel still shows 4 1 7 0 2 9.' : 'An old set with a cipher wheel bolted beside it. Nothing to decode yet.');
  }

  _relicNode() {
    const g = this.g;
    if (this.flag('relic.node')) return;
    if (!this.P.hasRelic('signalCrystal')) { g.toast('An empty copper cradle on the stone. Something small and crystalline sat here once.'); return; }
    this.setFlag('relic.node');
    const a = this.A['relic.node'];
    a.led.material.color.set(0.6, 1.4, 2.2);
    g.audio?.play('click', { volume: 0.6, rate: 0.7 });
    g.toast('The crystal settles into the cradle and the stones begin to hum. The old node is awake.');
  }

  _takeCrystal() {
    if (this.flag('pickup.crystal')) return;
    const a = this.A['relicCave.crystal'];
    this.setFlag('pickup.crystal');
    a.mesh.visible = false;
    const res = this.award('pickup.crystal', { relic: 'signalCrystal', credits: 60 });
    if (res) this.ui.reveal({ title: 'A crystal on a stone ledge', ...res });
    this.g.audio?.play('pebble', { volume: 0.6, rate: 1.4 });
  }

  _slab() {
    const g = this.g;
    if (this.flag('relic.slabOpen')) return;
    if (!this.flag('station.linked')) { g.toast(this.flag('station.fragments') ? 'Fitted tight. Link the nodes at the ridge station first.' : 'A heavy slab, fitted tight against the tower’s foot. It will not move.'); return; }
    this.setFlag('relic.slabOpen');
    const a = this.A['relicTower.slab'];
    const x0 = a.mesh.position.x;
    g.audio?.play('thudSand', { volume: 1, rate: 0.6 });
    this.animate(2.2, (t) => { a.mesh.position.x = x0 + ease(t) * 1.3; a.mesh.position.y = 0.05 + Math.sin(Math.PI * Math.min(1, t)) * 0.06; });
  }

  _takeTransmitter() {
    if (this.flag('pickup.transmitter')) return;
    this.setFlag('pickup.transmitter');
    this.A['airstrip.transmitter'].mesh.visible = false;
    this.addItem('transmitter');
    this.g.toast('Transmitter module recovered.');
    this.g.audio?.play('click', { volume: 0.6 });
  }

  _wreckPanel() {
    const g = this.g;
    if (this.flag('wreck.panelOpen')) return;
    const known = this.flag('note.accessCode');
    this.ui.keypad({
      title: 'Behind the framed chart', digits: 6,
      hint: known ? 'A six-digit keypad hidden behind the frame.' : 'A keypad hidden behind the frame. The ship’s log may explain it.',
      note: known ? NOTES.accessCode : null,
      onSubmit: (code) => {
        if (code !== '417029') return false;
        this.setFlag('wreck.panelOpen');
        const a = this.A['wreck.panel'];
        g.audio?.play('creakOpen', { volume: 0.6, rate: 1.3 });
        const r0 = a.pivot.rotation.y;
        this.animate(1.4, (t) => { a.pivot.rotation.y = r0 + ease(t) * 1.75; });
        g.toast('The frame swings out on hidden hinges.');
        return true;
      },
    });
  }

  // ================================================================ cargo
  _buildCargo() {
    const g = this.g;
    const pierY = (x, z) => g.collision.ground(x, z, 5).y;
    for (const [mid, m] of Object.entries(MISSIONS)) {
      if (!m.cargo) continue;
      const cd = m.cargo;
      const kind = cd.id === 'medCase' ? 'med' : cd.id === 'commsKit' ? 'equipment' : 'case';
      const pickup = cd.id === 'missingCrate' ? null : buildCargoCase(g.materials, kind);
      if (pickup) {
        const [px, pz] = cd.vehicle === 'plane' ? [6.95, -33.6] : [8.25, -43.4];
        pickup.position.set(px, pierY(px, pz), pz);
        pickup.rotation.y = 0.3;
        pickup.visible = false;
        g.scene.add(pickup);
      }
      const aboard = buildCargoCase(g.materials, kind);
      aboard.visible = false;
      const c = { id: cd.id, def: cd, mission: mid, pickup, aboard };
      if (cd.vehicle === 'boat') { aboard.position.set(0, 0.28, 0.35); g.boat.hull.add(aboard); } else { aboard.position.set(0, 0.62, -0.95); g.seaplane.model.root.add(aboard); }
      // load from the pier (or the washed-up crate at the cove)
      const loadObj = pickup || this.A['cove.missing'].mesh;
      c.loadIt = g.interaction.add({
        object: loadObj, name: `cargo:${cd.id}`, interactionDistance: 3.0, priority: 2,
        interactionLabel: () => this._loadLabel(c),
        onInteract: () => this._load(c),
      });
      c.unloadIt = g.interaction.add({
        object: aboard, name: `cargoAboard:${cd.id}`, interactionDistance: 3.6, priority: 2,
        interactionLabel: () => this._unloadLabel(c),
        onInteract: () => this._unload(c),
      });
      this.cargo[cd.id] = c;
    }
    // a delivery drop for cargo carried by hand (the medical supplies at the shelter)
    this.addSpot('airstrip.drop', { size: [1.0, 1.0, 1.0], label: () => (this.itemCount('medCase') ? 'Deliver the medical supplies' : null), onInteract: () => this._deliverCarried('medCase') });
    ITEMS.medCase = { name: 'Medical supplies', desc: 'A case of medical supplies for the research shelter on Airstrip Island.' };
  }

  _vehicle(c) { return c.def.vehicle === 'boat' ? this.g.boat : this.g.seaplane; }
  _vehiclePos(c) { return c.def.vehicle === 'boat' ? this.g.boat.pos : this.g.seaplane.fm.pos; }
  _vehicleSpeed(c) { const v = this._vehicle(c); return c.def.vehicle === 'boat' ? v.vel.length() : Math.hypot(v.fm.vel.x, v.fm.vel.z); }

  _loadLabel(c) {
    if (this._missionState(c.mission) !== 'active') return null;
    if (this.flag(`cargo.${c.id}.loaded`) || this.flag(`cargo.${c.id}.delivered`)) return null;
    if (c.id === 'missingCrate' && !this.flag('cargo.missingCrate.found')) return 'Check the washed-up container';
    return c.def.vehicle === 'boat' ? `Load the ${c.def.label.toLowerCase()} into the skiff` : `Load the ${c.def.label.toLowerCase()} into the seaplane`;
  }

  _load(c) {
    const g = this.g;
    if (!this._loadLabel(c)) return;
    if (c.id === 'missingCrate' && !this.flag('cargo.missingCrate.found')) { this.setFlag('cargo.missingCrate.found'); g.toast('The missing container, half full of sand but sealed. Bring the skiff alongside to load it.'); return; }
    const veh = this._vehicle(c);
    const src = (c.pickup || this.A['cove.missing'].mesh).getWorldPosition(V3());
    const vp = this._vehiclePos(c);
    if (veh.occupied || (c.def.vehicle === 'plane' && veh.broken) || Math.hypot(vp.x - src.x, vp.z - src.z) > 16) {
      g.toast(c.def.vehicle === 'boat' ? 'Bring the skiff alongside first.' : 'The seaplane needs to be moored here first.');
      return;
    }
    if (this.P.data.cargo[c.def.vehicle]) { g.toast('There is already cargo aboard.'); return; }
    this.P.data.cargo[c.def.vehicle] = c.id;
    this.setFlag(`cargo.${c.id}.loaded`);
    this._cargoVisuals();
    g.audio?.play('knock', { volume: 0.7 });
    g.toast(`${c.def.label} loaded.`);
  }

  _unloadLabel(c) {
    if (this.P.data.cargo[c.def.vehicle] !== c.id) return null;
    if (this._vehicle(c).occupied) return null;
    return this._atDestination(c) ? `Unload the ${c.def.label.toLowerCase()}` : null;
  }

  _atDestination(c) {
    const vp = this._vehiclePos(c);
    const dest = c.def.vehicle === 'plane' ? this.places.stripLanding : this.places[c.def.to];
    const r = c.def.vehicle === 'plane' ? dest.r : Math.max(16, dest.r);
    return Math.hypot(vp.x - dest.x, vp.z - dest.z) < r && this._vehicleSpeed(c) < 1.5;
  }

  _unload(c) {
    const g = this.g;
    if (!this._unloadLabel(c)) return;
    this.P.data.cargo[c.def.vehicle] = null;
    this.P.save();
    if (c.def.vehicle === 'plane') {
      // carried by hand to the shelter
      this.addItem(c.id);
      this.setFlag(`cargo.${c.id}.unloaded`);
      g.toast(`${c.def.label} unloaded. Carry them to the research shelter.`);
    } else {
      this.setFlag(`cargo.${c.id}.delivered`);
      g.toast(`${c.def.label} delivered.`);
      this._dropAt(c);
    }
    this._cargoVisuals();
    g.audio?.play('knock', { volume: 0.7 });
  }

  _deliverCarried(id) {
    if (!this.itemCount(id)) return;
    this.removeItem(id);
    this.setFlag(`cargo.${id}.delivered`);
    this.g.toast('Medical supplies delivered.');
    const c = this.cargo[id];
    if (c) this._dropAt(c);
  }

  /** Leave a delivered crate at the destination as a visible record. */
  _dropAt(c) {
    const anchors = { coveDock: 'cove.drop', outpostDock: 'outpost.dockUnload', homePier: null, stripShelter: 'airstrip.drop' };
    const name = anchors[c.def.to];
    if (!c.dropped) {
      c.dropped = buildCargoCase(this.g.materials, c.id === 'medCase' ? 'med' : c.id === 'commsKit' ? 'equipment' : 'case');
      const a = name ? this.A[name] : null;
      if (a) { c.dropped.position.copy(a.local); a.parent.add(c.dropped); } else { c.dropped.position.set(8.4, this.g.collision.ground(8.4, -41, 5).y, -41); this.g.scene.add(c.dropped); }
    }
  }

  _cargoVisuals() {
    for (const c of Object.values(this.cargo)) {
      const state = this._missionState(c.mission);
      const loaded = this.flag(`cargo.${c.id}.loaded`), delivered = this.flag(`cargo.${c.id}.delivered`);
      const aboard = this.P.data.cargo[c.def.vehicle] === c.id;
      if (c.pickup) c.pickup.visible = state === 'active' && !loaded && !delivered;
      c.aboard.visible = aboard;
      if (c.id === 'missingCrate') this.A['cove.missing'].mesh.visible = !loaded && !delivered;
    }
  }

  // ================================================================ missions
  _initMissions() {
    const M = this.P.data.missions;
    for (const id of Object.keys(MISSIONS)) if (!M[id]) M[id] = { state: 'locked', step: 0 };
    if (M.s1.state === 'locked') this._activate('s1', { quiet: true });
    this._missionsDirty = true;
  }

  _missionState(id) { return this.P.data.missions[id]?.state || 'locked'; }

  _unlock(id) {
    const m = this.P.data.missions[id];
    if (!m || m.state !== 'locked') return;
    m.state = 'available';
    const def = MISSIONS[id];
    if (def.kind === 'story' || def.giver === 'auto' || def.giver === 'station' || def.giver === 'clue' || def.giver === 'discover') this._activate(id);
    else this.g.toast(`New ${def.kind === 'plane' ? 'charter' : 'job'} on the harbour ledger: ${def.title}`);
    this.P.save();
  }

  _activate(id, { quiet = false, track = false } = {}) {
    const m = this.P.data.missions[id];
    if (!m || m.state === 'active' || m.state === 'completed') return;
    m.state = 'active';
    m.step = 0;
    // follow the new mission when asked to, for the story, or when nothing else is followed
    if (track || MISSIONS[id].kind === 'story' || !this.trackedStep()) this.P.data.tracked = id;
    this.P.save();
    this._cargoVisuals();
    if (!quiet) this.ui.missionStarted(MISSIONS[id]);
  }

  accept(id) {
    if (this._missionState(id) === 'failed') { this.restart(id); return; }
    if (this._missionState(id) !== 'available') return;
    this._activate(id, { track: true });
  }

  track(id) { if (this._missionState(id) === 'active') { this.P.data.tracked = id; this.P.save(); } }

  /** Restart a mission from its first step: cargo goes back to its pickup, nothing else is lost. */
  restart(id) {
    const def = MISSIONS[id];
    const m = this.P.data.missions[id];
    if (!def || !m || m.state === 'completed') return;
    if (def.cargo) {
      const cid = def.cargo.id;
      for (const f of ['loaded', 'delivered', 'unloaded', 'found']) this.P.clear(`cargo.${cid}.${f}`);
      for (const v of ['boat', 'plane']) if (this.P.data.cargo[v] === cid) this.P.data.cargo[v] = null;
      if (this.itemCount(cid)) this.removeItem(cid, this.itemCount(cid));
    }
    m.state = 'active';
    m.step = 0;
    this.P.data.tracked = id;
    this.P.save();
    this._cargoVisuals();
    this.g.toast(`Restarted: ${def.title}`);
  }

  fail(id, why) {
    const m = this.P.data.missions[id];
    if (!m || m.state !== 'active') return;
    m.state = 'failed';
    this.P.save();
    this.g.toast(`Mission failed: ${MISSIONS[id].title}. ${why} Restart it from the harbour ledger or the journal (J).`);
  }

  _stepDone(step) {
    const g = this.g;
    switch (step.type) {
      case 'flag': return this.flag(step.flag);
      case 'items': return this.itemCount(step.item) >= step.count;
      case 'reach': {
        const p = this.places[step.at];
        if (step.vehicle === 'plane' && g.player.mode !== 'plane') return false;
        const pos = g.player.mode === 'plane' ? g.seaplane.fm.pos : g.player.mode === 'boat' ? g.boat.pos : g.player.pos;
        return Math.hypot(pos.x - p.x, pos.z - p.z) < p.r;
      }
      case 'dock': {
        const p = this.places[step.at];
        return Math.hypot(g.boat.pos.x - p.x, g.boat.pos.z - p.z) < Math.max(16, p.r) && g.boat.vel.length() < 1.2;
      }
      case 'land': {
        const p = this.places[step.at];
        const fm = g.seaplane.fm;
        return !g.seaplane.broken && fm.out.onWater && Math.hypot(fm.pos.x - p.x, fm.pos.z - p.z) < p.r && Math.hypot(fm.vel.x, fm.vel.z) < 5;
      }
      case 'spot': {
        const p = this.places[step.at];
        const fm = g.seaplane.fm;
        const ok = g.player.mode === 'plane' && !fm.out.onWater && fm.pos.y - (p.y ?? 0) > (step.alt || 60) && Math.hypot(fm.pos.x - p.x, fm.pos.z - p.z) < 160;
        if (ok) this.setFlag(`spot.${step.at}`);
        return this.flag(`spot.${step.at}`);
      }
      default: return false;
    }
  }

  _updateMissions() {
    const M = this.P.data.missions;
    // missions that open up on their own
    for (const [id, def] of Object.entries(MISSIONS)) {
      const m = M[id];
      if (m.state !== 'locked') continue;
      if (def.requiresFlag && this.flag(def.requiresFlag)) this._unlock(id);
      if (def.giver === 'discover') {
        const p = this.places[def.discoverAt];
        const pos = this.g.player.mode === 'boat' ? this.g.boat.pos : this.g.player.mode === 'plane' ? this.g.seaplane.fm.pos : this.g.player.pos;
        if (Math.hypot(pos.x - p.x, pos.z - p.z) < 140) this._unlock(id);
      }
    }
    for (const id of MISSION_ORDER) {
      const m = M[id], def = MISSIONS[id];
      if (m.state !== 'active') continue;
      let guard = 0;
      while (m.step < def.steps.length && this._stepDone(def.steps[m.step]) && guard++ < 8) {
        m.step++;
        this.P.save();
        if (m.step < def.steps.length) this.ui.objective(def, def.steps[m.step]);
      }
      if (m.step >= def.steps.length) this._complete(id);
    }
  }

  _complete(id) {
    const m = this.P.data.missions[id], def = MISSIONS[id];
    m.state = 'completed';
    const res = this.award(`mission.${id}`, { ...(def.reward || {}) });
    if (this.P.data.tracked === id) this.P.data.tracked = null;
    this.ui.missionComplete(def, res);
    for (const u of def.unlocks || []) this._unlock(u);
    if (!this.trackedStep()) this.P.data.tracked = MISSION_ORDER.find((k) => this._missionState(k) === 'active') || null;
    this.P.save(true);
  }

  trackedStep() {
    const id = this.P.data.tracked;
    if (!id || this._missionState(id) !== 'active') return null;
    const def = MISSIONS[id], m = this.P.data.missions[id];
    const step = def.steps[m.step];
    if (!step) return null;
    return { id, def, step, index: m.step };
  }

  _finale() {
    this.readNote('finalLore', { show: false });
    this.ui.finale();
  }

  // ================================================================ save / restore
  _restore() {
    const g = this.g;
    // inventory items, discovered places
    for (const [id, n] of Object.entries(this.P.data.items)) if (n > 0) g.inventory.add(id, n, { equip: false });
    for (const id of Object.keys(this.P.data.places)) { g.collectibles.discovered.add(id); g.ui.discovered.add(id); }
    // opened containers and dug ones
    for (const [id, c] of this.containers) {
      if (this.flag(`dug.${id}`) || this.P.isOpen(id)) { c.root.position.y = c.baseY; c.root.rotation.z = 0; }
      if (this.P.isOpen(id)) { c.open = true; c.model.pivot.rotation.x = c.def.tier === 'vault' ? -1.75 : -1.95; }
      if (this.flag(`code.${id}`) && c.model.led) c.model.led.material.color.copy(LED.green);
    }
    // world state
    const A = this.A;
    if (this.flag('outpost.rug')) { A['outpost.hatch'].rug.position.x -= 1.1; A['outpost.hatch'].pivot.visible = true; }
    if (this.flag('outpost.hatchOpen')) A['outpost.hatch'].pivot.rotation.z = 1.75;
    if (this.flag('cove.tarp')) { const t = A['coveSecret.tarp'].mesh; t.position.y += 0.1; t.position.x += 1.0; t.rotation.z = 1.3; }
    if (this.flag('pickup.crystal')) A['relicCave.crystal'].mesh.visible = false;
    if (this.flag('pickup.transmitter')) A['airstrip.transmitter'].mesh.visible = false;
    if (this.flag('relic.node')) A['relic.node'].led.material.color.set(0.6, 1.4, 2.2);
    if (this.flag('relic.slabOpen')) A['relicTower.slab'].mesh.position.x += 1.3;
    if (this.flag('wreck.panelOpen')) A['wreck.panel'].pivot.rotation.y += 1.75;
    if (this.flag('cargo.supplyCase.delivered')) A['cove.note'].mesh.visible = true;
    for (const c of Object.values(this.cargo)) if (this.flag(`cargo.${c.id}.delivered`)) this._dropAt(c);
    this._stationVisuals();
    this._beaconVisuals();
    this._outpostVisuals();
    this._screen('cove.radio', ['COVE RADIO', 'cipher wheel ready']);
    this._screen('airstrip.radio', ['RESEARCH SHELTER', 'expedition overdue']);
    this._cargoVisuals();
  }

  /** Clear the expansion progress (journal → reset). Reloads the page. */
  resetProgress() { this.P.reset(); location.reload(); }

  // ================================================================ per frame
  update(dt, realDt = dt) {
    const g = this.g;
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt / a.duration;
      a.fn(Math.min(1, a.t));
      if (a.t >= 1) { this.anims.splice(i, 1); a.done?.(); }
    }
    // the smuggler's note appears once the case has been delivered
    if (this.flag('cargo.supplyCase.delivered') && !this.A['cove.note'].mesh.visible) this.A['cove.note'].mesh.visible = true;
    // plane cargo is lost with the seaplane
    const pc = this.P.data.cargo.plane;
    if (pc && g.seaplane.broken) {
      const c = this.cargo[pc];
      this.P.data.cargo.plane = null;
      this.P.clear(`cargo.${pc}.loaded`);
      this._cargoVisuals();
      if (c) this.fail(c.mission, 'The cargo went down with the seaplane.');
    }
    // a flag just changed (an interaction, a puzzle): advance missions now, even behind a panel
    if (this._missionsDirty) { this._missionsDirty = false; this._updateMissions(); }
    this._tick -= dt;
    if (this._tick <= 0) {
      this._tick = 0.25;
      // the first transmission is introduced a few seconds into a new game
      if (!this.flag('intro') && this._missionState('s1') === 'active') {
        this._introT = (this._introT || 0) + 0.25;
        if (this._introT > 4) { this.setFlag('intro'); this.ui.missionStarted(MISSIONS.s1); }
      }
      this._updateMissions();
      // remember newly discovered places
      const d = g.collectibles.discovered;
      if (d.size !== this._lastDiscovered) { this._lastDiscovered = d.size; for (const id of d) this.P.discover(id); }
      this.ui.refreshTracker();
    }
    this.ui.update(realDt);
  }
}
