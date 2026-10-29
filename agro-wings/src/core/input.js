// Keyboard / mouse / gamepad / touch input with rebindable actions.
// Default bindings keep the Tidemark aircraft mapping where it exists.
import { t } from '../i18n/index.js';

// Flight keys come in two schemes (Settings → Flying → Flight keys), for
// every aircraft: 'numpad' (the default: Num 8 / 5 stick forward / back,
// Num 4 / 6 roll left / right, Q / E rudder or pedals) and 'classic' (the
// Tidemark layout: W/S/A/D, Z/X). The engine is F in both. The code asks
// for the generic actions (pitchDown, yawLeft, engine…); the scheme says
// which bound action each one reads. Power (Shift / Ctrl, R), engine (F), brakes,
// flaps, trim, camera… are the same in both.
//
// `scope` keeps key conflicts apart: a 'classic' action and a 'num' action
// may share a key (only one of the two is live at a time); actions without a
// scope are used by both schemes and conflict with everything. `shares`
// names an intended overlap: E is the right rudder in the numpad scheme and
// still the service key, which only acts with the engine off.
//
// A binding may be a chord, 'Shift+ArrowUp' (either Shift key, then the
// key). While a bound chord is held its keys count for the chord only, so
// Shift + Up raises the pilot's eye without adding power (Shift) or, in the
// classic scheme, pushing the stick (Up).
export const ACTIONS = {
  pitchDown: { get label() { return t('Pitch down (stick forward)'); }, keys: ['KeyW', 'ArrowUp'], scope: 'classic' },
  pitchUp: { get label() { return t('Pitch up (stick back)'); }, keys: ['KeyS', 'ArrowDown'], scope: 'classic' },
  rollLeft: { get label() { return t('Roll left'); }, keys: ['KeyA', 'ArrowLeft'], scope: 'classic' },
  rollRight: { get label() { return t('Roll right'); }, keys: ['KeyD', 'ArrowRight'], scope: 'classic' },
  yawLeft: { get label() { return t('Rudder left / steer'); }, keys: ['KeyZ'], scope: 'classic' },
  yawRight: { get label() { return t('Rudder right / steer'); }, keys: ['KeyX'], scope: 'classic' },
  throttleUp: { get label() { return t('Power up'); }, keys: ['KeyR', 'ShiftLeft'] },
  throttleDown: { get label() { return t('Power down'); }, keys: ['ControlLeft'] },
  brakes: { get label() { return t('Brakes (hold)'); }, keys: ['Space'] },
  flapsUp: { get label() { return t('Flaps up'); }, keys: ['KeyG'] },
  flapsDown: { get label() { return t('Flaps down'); }, keys: ['KeyB'] },
  trimUp: { get label() { return t('Trim nose up'); }, keys: ['BracketRight', 'PageUp'] },
  trimDown: { get label() { return t('Trim nose down'); }, keys: ['BracketLeft', 'PageDown'] },
  spray: { get label() { return t('Spray on / off'); }, keys: ['KeyC', 'Enter'] },
  engine: { get label() { return t('Engine (hold start / tap stop)'); }, keys: ['KeyF'] },
  camera: { get label() { return t('Cockpit / chase camera'); }, keys: ['KeyV'] },
  orbit: { get label() { return t('Free external camera'); }, keys: ['KeyO'] },
  // Head look and zoom (cockpit; the chase camera swings round the same way).
  lookLeft: { get label() { return t('Look left'); }, keys: ['Numpad7'] },
  lookRight: { get label() { return t('Look right'); }, keys: ['Numpad9'] },
  lookUp: { get label() { return t('Look up'); }, keys: ['NumpadDivide'] },
  lookDown: { get label() { return t('Look down'); }, keys: ['Numpad2'] },
  lookReset: { get label() { return t('Default view'); }, keys: ['Numpad0', 'Home'] },
  zoomIn: { get label() { return t('Zoom in'); }, keys: ['NumpadAdd', 'Equal'] },
  zoomOut: { get label() { return t('Zoom out'); }, keys: ['NumpadSubtract', 'Minus'] },
  eyeUp: { get label() { return t('Pilot eye higher (taller pilot)'); }, keys: ['Shift+ArrowUp'] },
  eyeDown: { get label() { return t('Pilot eye lower (shorter pilot)'); }, keys: ['Shift+ArrowDown'] },
  interact: { get label() { return t('Interact / service'); }, keys: ['KeyE'], shares: ['nYawRight'] },
  map: { get label() { return t('Map'); }, keys: ['KeyM'] },
  coverage: { get label() { return t('Coverage overlay'); }, keys: ['KeyK'] },
  gps: { get label() { return t('Minimap: map / GPS guidance'); }, keys: ['KeyN'] },
  jobs: { get label() { return t('Contracts'); }, keys: ['KeyJ'] },
  office: { get label() { return t('Hangar office computer'); }, keys: ['KeyI'] },
  replay: { get label() { return t('Replay of the last operation'); }, keys: ['KeyL'] },
  reset: { get label() { return t('Reset aircraft'); }, keys: ['Backspace'] },
  help: { get label() { return t('Controls help'); }, keys: ['KeyH'] },
  pause: { get label() { return t('Pause / menu'); }, keys: ['Escape', 'KeyP'] },
  // Numpad scheme.
  nPitchDown: { get label() { return t('Stick / cyclic forward (go forward)'); }, keys: ['Numpad8'], scope: 'num' },
  nPitchUp: { get label() { return t('Stick / cyclic back (brake, go backward)'); }, keys: ['Numpad5'], scope: 'num' },
  nRollLeft: { get label() { return t('Roll / cyclic left'); }, keys: ['Numpad4'], scope: 'num' },
  nRollRight: { get label() { return t('Roll / cyclic right'); }, keys: ['Numpad6'], scope: 'num' },
  nYawLeft: { get label() { return t('Rudder / pedal left'); }, keys: ['KeyQ'], scope: 'num' },
  nYawRight: { get label() { return t('Rudder / pedal right'); }, keys: ['KeyE'], scope: 'num', shares: ['interact'] },
};

export const KEY_SCHEMES = {
  numpad: { pitchDown: 'nPitchDown', pitchUp: 'nPitchUp', rollLeft: 'nRollLeft', rollRight: 'nRollRight', yawLeft: 'nYawLeft', yawRight: 'nYawRight' },
  classic: {},
};
export const DEFAULT_KEY_SCHEME = 'numpad';

// Chords: 'Mod+Code' -> [modifier keys, code]; null for a plain key code.
const MODS = { Shift: ['ShiftLeft', 'ShiftRight'], Ctrl: ['ControlLeft', 'ControlRight'], Alt: ['AltLeft', 'AltRight'] };
const MOD_OF = { ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt' };
export function chordOf(code) {
  const i = code.indexOf('+');
  return i > 0 && MODS[code.slice(0, i)] ? [MODS[code.slice(0, i)], code.slice(i + 1)] : null;
}
// A plain key that is part of a bound chord being held counts for the
// chord only.
const inChord = (code, down, chords) => chords.some(([mods, k]) => (k === code || mods.includes(code)) && down.has(k) && mods.some((m) => down.has(m)));
// Is the binding `code` held, given the keys down and the chords bound?
// (A chord pressed as one code, as the touch buttons do, counts too.)
export function keyHeld(code, down, chords) {
  const c = chordOf(code);
  if (c) return down.has(code) || (c[0].some((m) => down.has(m)) && down.has(c[1]));
  return down.has(code) && !inChord(code, down, chords);
}
// Did the binding `code` go down this frame? (A key tapped within one frame
// is no longer down but still counts.)
export function keyPressed(code, pressed, down, chords) {
  const c = chordOf(code);
  if (c) return pressed.has(code) || (pressed.has(c[1]) && c[0].some((m) => down.has(m) || pressed.has(m)));
  return pressed.has(code) && !inChord(code, down, chords);
}

const STORE = 'agrowings.keys.v1';
const BIND_REV = 2; // bumped when saved bindings need a clean-up on load

// Bindings saved by older builds: the engine was on Q (and power down on F),
// and a rebind kept the old key as the second one, so Q could still start
// or cut the engine. Q is the left rudder only, F is the engine only.
export function migrateBindings(b) {
  for (const k of Object.keys(b)) {
    if (k !== 'nYawLeft' && k !== 'yawLeft') b[k] = b[k].filter((c) => c !== 'KeyQ');
    if (k !== 'engine') b[k] = b[k].filter((c) => c !== 'KeyF');
  }
  b.engine = ['KeyF', ...b.engine.filter((c) => c !== 'KeyF')].slice(0, 2);
  // An action left without keys gets its default ones back.
  for (const k of Object.keys(b)) if (!b[k].length) b[k] = ACTIONS[k].keys.slice();
  return b;
}

export class Input {
  constructor(el) {
    this.el = el;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.bindings = {};
    this.alias = {}; // generic action -> bound action (key scheme)
    for (const [k, a] of Object.entries(ACTIONS)) this.bindings[k] = a.keys.slice();
    this.load();
    this.mouse = { dx: 0, dy: 0, wheel: 0, buttons: 0 };
    this.virtual = { pitch: 0, roll: 0, yaw: 0, throttle: null, active: false };
    this.capture = null;
    this.enabled = true;
    this.gamepad = null;

    window.addEventListener('keydown', (e) => {
      if (this.capture) {
        e.preventDefault();
        // A modifier alone is taken on its release (it may start a chord).
        if (MOD_OF[e.code]) { this._capMod = e.code; return; }
        const mod = e.shiftKey ? 'Shift' : e.ctrlKey ? 'Ctrl' : e.altKey ? 'Alt' : null;
        const cb = this.capture;
        this.capture = null;
        this._capMod = null;
        cb(mod && e.code !== 'Escape' ? `${mod}+${e.code}` : e.code);
        return;
      }
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace', 'PageUp', 'PageDown'].includes(e.code) || e.code.startsWith('Numpad')) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      if (this.capture && this._capMod === e.code) {
        const cb = this.capture;
        this.capture = null;
        this._capMod = null;
        cb(e.code);
      }
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => { this.down.clear(); this.mouse.buttons = 0; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // Touch: one finger dragged on the view (the touch controls are their
    // own elements over it) looks around like the mouse; a double tap
    // brings the default view back.
    let touchId = null, tx = 0, ty = 0, lastTap = 0;
    const touchEnd = (e) => {
      if (e.pointerId !== touchId) return;
      touchId = null;
      this.mouse.buttons &= ~1;
      this.release(this.keysOf('lookReset')[0]);
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || touchId !== null || this.touchLook === false) return;
      touchId = e.pointerId; tx = e.clientX; ty = e.clientY;
      this.mouse.buttons |= 1;
      const now = performance.now();
      if (now - lastTap < 320) this.press(this.keysOf('lookReset')[0]);
      lastTap = now;
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== touchId) return;
      this.mouse.dx += (e.clientX - tx) * 0.0035;
      this.mouse.dy += (e.clientY - ty) * 0.0035;
      tx = e.clientX; ty = e.clientY;
    });
    el.addEventListener('pointerup', touchEnd);
    el.addEventListener('pointercancel', touchEnd);
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      this.mouse.buttons |= 1 << e.button;
      el.setPointerCapture?.(e.pointerId);
      el.focus();
    });
    el.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      this.mouse.buttons &= ~(1 << e.button);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      if (this.mouse.buttons) {
        this.mouse.dx += e.movementX * 0.0035;
        this.mouse.dy += e.movementY * 0.0035;
      }
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.mouse.wheel += Math.sign(e.deltaY);
    }, { passive: false });
  }

  load() {
    this._chords = null;
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (s) {
        for (const k of Object.keys(this.bindings)) if (Array.isArray(s[k])) this.bindings[k] = s[k];
        if ((s._rev ?? 0) < BIND_REV) { migrateBindings(this.bindings); this.save(); }
      }
    } catch { /* storage unavailable */ }
  }
  save() {
    this._chords = null;
    try { localStorage.setItem(STORE, JSON.stringify({ ...this.bindings, _rev: BIND_REV })); } catch { /* ignore */ }
  }
  resetBindings() {
    for (const [k, a] of Object.entries(ACTIONS)) this.bindings[k] = a.keys.slice();
    this.save();
  }
  rebind(action, cb) {
    this.capture = (code) => {
      if (code !== 'Escape') {
        // Remove the key from the actions it would clash with, then make it
        // the primary key. 'air' and 'heli' actions never clash with each
        // other (only one of the two sets is live at a time).
        const A = ACTIONS[action], sa = A.scope;
        for (const k of Object.keys(this.bindings)) {
          const sk = ACTIONS[k].scope;
          if (A.shares?.includes(k) || ACTIONS[k].shares?.includes(action)) continue;
          if (!sa || !sk || sa === sk) this.bindings[k] = this.bindings[k].filter((c) => c !== code);
        }
        this.bindings[action] = [code, ...this.bindings[action].filter((c) => c !== code)].slice(0, 2);
        this.save();
      }
      cb?.();
    };
  }

  // Key scheme (see KEY_SCHEMES): which bound action each generic action
  // reads. Empty: the actions read themselves (classic).
  setAlias(map) { this.alias = map || {}; }
  keysOf(a) { return this.bindings[this.alias[a] ?? a] ?? []; }
  // The chords bound to any action (dropped by save / load, which every
  // change of the bindings goes through).
  get chords() { return (this._chords ??= Object.values(this.bindings).flat().map(chordOf).filter(Boolean)); }

  isDown(a) { return this.enabled && this.keysOf(a).some((c) => keyHeld(c, this.down, this.chords)); }
  wasPressed(a) { return this.enabled && this.keysOf(a).some((c) => keyPressed(c, this.pressed, this.down, this.chords)); }
  wasReleased(a) { return this.keysOf(a).some((c) => this.released.has(c)); }
  press(code) { if (!this.down.has(code)) this.pressed.add(code); this.down.add(code); }
  release(code) { this.down.delete(code); this.released.add(code); }
  pressAction(a) { this.press(this.keysOf(a)[0]); }
  releaseAction(a) { this.release(this.keysOf(a)[0]); }

  consumeMouse() {
    const m = { dx: this.mouse.dx, dy: this.mouse.dy, wheel: this.mouse.wheel, buttons: this.mouse.buttons };
    this.mouse.dx = this.mouse.dy = 0;
    this.mouse.wheel = 0;
    return m;
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && Array.from(pads).find((x) => x && x.connected);
    if (!p) { this.gamepad = null; return; }
    const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v);
    const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    const prev = this.gamepad?.btn || [];
    const btn = p.buttons.map((x) => x.pressed);
    this.gamepad = {
      roll: dz(p.axes[0] || 0), pitch: dz(p.axes[1] || 0),
      lookX: dz(p.axes[2] || 0), lookY: dz(p.axes[3] || 0),
      throttleUp: p.buttons[7]?.value || 0, throttleDown: p.buttons[6]?.value || 0,
      yaw: (b(5) ? 1 : 0) - (b(4) ? 1 : 0),
      btn,
      edge: (i) => btn[i] && !prev[i],
    };
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }
}

export function keyLabel(code) {
  if (!code) return '—';
  const c = chordOf(code);
  if (c) return `${code.slice(0, code.indexOf('+'))} + ${keyLabel(c[1])}`;
  return code.replace(/^Numpad/, 'Num ').replace(/^Key/, '').replace(/^Digit/, '').replace('Arrow', '').replace('Left', ' L').replace('Right', ' R')
    .replace('Bracket R', ']').replace('Bracket L', '[').replace('Control', 'Ctrl').replace('Backspace', '⌫').replace('Escape', 'Esc')
    .replace('Divide', '÷').replace('Multiply', '×').replace('Add', '+').replace('Subtract', '−').replace('Equal', '=').replace('Minus', '-');
}
