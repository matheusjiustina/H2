// Persistent progress for the archipelago expansion: credits, flags, opened containers,
// relics, missions, cargo, inventory items and discovered places. Saved to localStorage
// (per browser); when storage is unavailable (private window, sandboxed embed) the game
// keeps working and the progress lasts for the session only.

const KEY = 'tidemark.progress.v1';
const VERSION = 1;

function fresh() {
  return {
    v: VERSION,
    credits: 0,
    flags: {}, // name -> true
    opened: {}, // container id -> time
    relics: {}, // relic id -> { at, where }
    missions: {}, // id -> { state, step, done: [] }
    tracked: null,
    claimed: {}, // reward keys already paid out
    items: {}, // expansion inventory items -> count
    cargo: { boat: null, plane: null }, // cargo id currently aboard
    places: {}, // discovered POI ids
    notes: [], // read note ids, in order
    chart: {}, // chart marks revealed
  };
}

export class Progress {
  constructor() {
    this.data = fresh();
    this.listeners = [];
    this._timer = null;
    this.persistent = false;
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      this.persistent = true;
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!d || d.v !== VERSION || typeof d !== 'object') return;
      // merge onto a fresh record so missing fields from older saves get defaults
      const base = fresh();
      for (const k of Object.keys(base)) if (d[k] !== undefined && typeof d[k] === typeof base[k]) base[k] = d[k];
      if (!Number.isFinite(base.credits) || base.credits < 0) base.credits = 0;
      if (!Array.isArray(base.notes)) base.notes = [];
      this.data = base;
    } catch { this.persistent = false; }
  }

  /** Write soon (coalesces bursts of changes). */
  save(now = false) {
    clearTimeout(this._timer);
    const write = () => {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); this.persistent = true; } catch { this.persistent = false; }
    };
    if (now) write(); else this._timer = setTimeout(write, 600);
  }

  reset() {
    this.data = fresh();
    this.save(true);
    this._emit('reset');
  }

  onChange(fn) { this.listeners.push(fn); }
  _emit(kind, id) { for (const l of this.listeners) l(kind, id); }

  // ------------------------------------------------------------------ flags
  has(flag) { return !!this.data.flags[flag]; }
  set(flag) {
    if (this.data.flags[flag]) return false;
    this.data.flags[flag] = true;
    this.save();
    this._emit('flag', flag);
    return true;
  }
  clear(flag) {
    if (!this.data.flags[flag]) return;
    delete this.data.flags[flag];
    this.save();
  }

  // ------------------------------------------------------------------ rewards
  /** Pay out a reward once per key. Returns false if this key was already claimed. */
  claim(key) {
    if (this.data.claimed[key]) return false;
    this.data.claimed[key] = Date.now();
    this.save();
    return true;
  }

  addCredits(n) {
    this.data.credits = Math.max(0, Math.round(this.data.credits + n));
    this.save();
    this._emit('credits');
  }

  // ------------------------------------------------------------------ relics / items / places
  hasRelic(id) { return !!this.data.relics[id]; }
  addRelic(id, where) {
    if (this.data.relics[id]) return false;
    this.data.relics[id] = { at: Date.now(), where };
    this.save(true);
    this._emit('relic', id);
    return true;
  }

  itemCount(id) { return this.data.items[id] || 0; }
  addItem(id, n = 1) {
    this.data.items[id] = Math.max(0, (this.data.items[id] || 0) + n);
    if (!this.data.items[id]) delete this.data.items[id];
    this.save();
  }

  open(id) {
    if (this.data.opened[id]) return false;
    this.data.opened[id] = Date.now();
    this.save(true);
    return true;
  }
  isOpen(id) { return !!this.data.opened[id]; }

  discover(id) {
    if (this.data.places[id]) return false;
    this.data.places[id] = true;
    this.save();
    return true;
  }

  readNote(id) {
    if (this.data.notes.includes(id)) return false;
    this.data.notes.push(id);
    this.save();
    return true;
  }
}
