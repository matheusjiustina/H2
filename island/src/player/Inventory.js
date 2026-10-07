// Item definitions + inventory state.

export const ITEMS = {
  lantern: { name: 'Storm lantern', desc: 'Kerosene, half full. Sooty on one side of the glass.', pose: 'lantern', hold: true, world: true, use: 'Light / snuff' },
  flashlight: { name: 'Flashlight', desc: 'Rubber armoured, two fresh cells.', pose: 'grip', hold: true, world: true, use: 'Switch on / off' },
  compass: { name: 'Brass compass', desc: 'Liquid filled. The needle still settles true north.', pose: 'palmUp', hold: true, world: true },
  camera: { name: 'Field camera', desc: 'Hold right mouse to frame a shot, F or left click to take it.', pose: 'camera', hold: true, world: true, aim: true, use: 'Take photo' },
  binoculars: { name: 'Binoculars', desc: '8×32 field glasses. Hold right mouse to look.', pose: 'bino', hold: true, aim: true },
  mug: { name: 'Enamel mug', desc: 'Camp coffee, gone cold hours ago.', pose: 'mug', hold: true, world: true, use: 'Drink' },
  pebble: { name: 'Smooth pebbles', desc: 'Flat beach stones. F or left click to throw — low and fast to skip.', pose: 'palmUp', hold: true, stack: true, use: 'Throw' },
  map: { name: 'Survey chart', desc: 'Hand drawn chart of the island and lagoon. Press M to study.', world: true, ui: 'map' },
  notebook: { name: 'Field notebook', desc: 'Survey notes and observations. Press N to read.', world: true, ui: 'notebook' },
  shell: { name: 'Rare shells', desc: 'Collected along the shores. There are twelve to find.', stack: true },
};

export class Inventory {
  constructor(game) {
    this.game = game;
    this.counts = {};
    this.equipped = null;
    this.photos = [];
    this.listeners = [];
  }

  has(id) { return (this.counts[id] || 0) > 0; }
  count(id) { return this.counts[id] || 0; }

  add(id, n = 1, { equip = true } = {}) {
    this.counts[id] = (this.counts[id] || 0) + n;
    const def = ITEMS[id];
    if (equip && def && def.hold && (!this.equipped || id !== 'shell')) this.equip(id);
    this._changed();
  }

  remove(id, n = 1) {
    this.counts[id] = Math.max(0, (this.counts[id] || 0) - n);
    if (!this.counts[id]) {
      delete this.counts[id];
      if (this.equipped === id) this.unequip();
    }
    this._changed();
  }

  equip(id) {
    if (!this.has(id) || !ITEMS[id]?.hold) return;
    if (this.equipped === id) return;
    this.equipped = id;
    this.game.tools?.equip(id);
    this._changed();
  }

  unequip() {
    if (!this.equipped) return;
    this.game.tools?.unequip(this.equipped);
    this.equipped = null;
    this._changed();
  }

  get equippedDef() { return this.equipped ? ITEMS[this.equipped] : null; }

  list() { return Object.keys(this.counts).map((id) => ({ id, count: this.counts[id], ...ITEMS[id] })); }

  onChange(fn) { this.listeners.push(fn); }
  _changed() { for (const l of this.listeners) l(this); }
}
