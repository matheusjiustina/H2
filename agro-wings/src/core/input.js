// Keyboard / mouse / gamepad / touch input with rebindable actions.
// Default bindings keep the Tidemark aircraft mapping where it exists.

// Flight keys come in two schemes (Settings → Flying → Flight keys), for
// every aircraft: 'numpad' (the default: Num 8 / 5 stick forward / back,
// Num 4 / 6 roll left / right, Q / E rudder or pedals, I engine) and
// 'classic' (the Tidemark layout: W/S/A/D, Z/X, Q engine). The code asks
// for the generic actions (pitchDown, yawLeft, engine…); the scheme says
// which bound action each one reads. Power (Shift / Ctrl, R / F), brakes,
// flaps, trim, camera… are the same in both.
//
// `scope` keeps key conflicts apart: a 'classic' action and a 'num' action
// may share a key (only one of the two is live at a time); actions without a
// scope are used by both schemes and conflict with everything. `shares`
// names an intended overlap: Q / E are the rudder in the numpad scheme and
// still the engine / service keys, which only act with the engine off.
export const ACTIONS = {
  pitchDown: { label: 'Pitch down (stick forward)', keys: ['KeyW', 'ArrowUp'], scope: 'classic' },
  pitchUp: { label: 'Pitch up (stick back)', keys: ['KeyS', 'ArrowDown'], scope: 'classic' },
  rollLeft: { label: 'Roll left', keys: ['KeyA', 'ArrowLeft'], scope: 'classic' },
  rollRight: { label: 'Roll right', keys: ['KeyD', 'ArrowRight'], scope: 'classic' },
  yawLeft: { label: 'Rudder left / steer', keys: ['KeyZ'], scope: 'classic' },
  yawRight: { label: 'Rudder right / steer', keys: ['KeyX'], scope: 'classic' },
  throttleUp: { label: 'Power up', keys: ['KeyR', 'ShiftLeft'] },
  throttleDown: { label: 'Power down', keys: ['KeyF', 'ControlLeft'] },
  brakes: { label: 'Brakes (hold)', keys: ['Space'] },
  flapsUp: { label: 'Flaps up', keys: ['KeyG'] },
  flapsDown: { label: 'Flaps down', keys: ['KeyB'] },
  trimUp: { label: 'Trim nose up', keys: ['BracketRight', 'PageUp'] },
  trimDown: { label: 'Trim nose down', keys: ['BracketLeft', 'PageDown'] },
  spray: { label: 'Spray on / off', keys: ['KeyC', 'Enter'] },
  engine: { label: 'Engine (hold start / tap stop)', keys: ['KeyQ'], scope: 'classic' },
  camera: { label: 'Cockpit / chase camera', keys: ['KeyV'] },
  orbit: { label: 'Free external camera', keys: ['KeyO'] },
  interact: { label: 'Interact / service', keys: ['KeyE'], shares: ['nYawRight'] },
  map: { label: 'Map', keys: ['KeyM'] },
  coverage: { label: 'Coverage overlay', keys: ['KeyK'] },
  gps: { label: 'Minimap: map / GPS guidance', keys: ['KeyN'] },
  jobs: { label: 'Contracts', keys: ['KeyJ'] },
  reset: { label: 'Reset aircraft', keys: ['Backspace'] },
  help: { label: 'Controls help', keys: ['KeyH'] },
  pause: { label: 'Pause / menu', keys: ['Escape', 'KeyP'] },
  // Numpad scheme.
  nPitchDown: { label: 'Stick / cyclic forward (go forward)', keys: ['Numpad8'], scope: 'num' },
  nPitchUp: { label: 'Stick / cyclic back (brake, go backward)', keys: ['Numpad5'], scope: 'num' },
  nRollLeft: { label: 'Roll / cyclic left', keys: ['Numpad4'], scope: 'num' },
  nRollRight: { label: 'Roll / cyclic right', keys: ['Numpad6'], scope: 'num' },
  nYawLeft: { label: 'Rudder / pedal left', keys: ['KeyQ'], scope: 'num' },
  nYawRight: { label: 'Rudder / pedal right', keys: ['KeyE'], scope: 'num', shares: ['interact'] },
  nEngine: { label: 'Engine (hold start / tap stop)', keys: ['KeyI'], scope: 'num' },
};

export const KEY_SCHEMES = {
  numpad: { pitchDown: 'nPitchDown', pitchUp: 'nPitchUp', rollLeft: 'nRollLeft', rollRight: 'nRollRight', yawLeft: 'nYawLeft', yawRight: 'nYawRight', engine: 'nEngine' },
  classic: {},
};
export const DEFAULT_KEY_SCHEME = 'numpad';

const STORE = 'agrowings.keys.v1';

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
        const cb = this.capture;
        this.capture = null;
        cb(e.code);
        return;
      }
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace', 'PageUp', 'PageDown'].includes(e.code) || e.code.startsWith('Numpad')) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => { this.down.clear(); this.mouse.buttons = 0; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
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
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (s) for (const k of Object.keys(this.bindings)) if (Array.isArray(s[k])) this.bindings[k] = s[k];
    } catch { /* storage unavailable */ }
  }
  save() {
    try { localStorage.setItem(STORE, JSON.stringify(this.bindings)); } catch { /* ignore */ }
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

  isDown(a) { return this.enabled && this.keysOf(a).some((c) => this.down.has(c)); }
  wasPressed(a) { return this.enabled && this.keysOf(a).some((c) => this.pressed.has(c)); }
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
  return code.replace(/^Numpad/, 'Num ').replace(/^Key/, '').replace(/^Digit/, '').replace('Arrow', '').replace('Left', ' L').replace('Right', ' R')
    .replace('Bracket R', ']').replace('Bracket L', '[').replace('Control', 'Ctrl').replace('Backspace', '⌫').replace('Escape', 'Esc');
}
