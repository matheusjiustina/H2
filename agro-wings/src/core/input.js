// Keyboard / mouse / gamepad / touch input with rebindable actions.
// Default bindings keep the Tidemark aircraft mapping where it exists.

export const ACTIONS = {
  pitchDown: { label: 'Pitch down (stick forward)', keys: ['KeyW', 'ArrowUp'] },
  pitchUp: { label: 'Pitch up (stick back)', keys: ['KeyS', 'ArrowDown'] },
  rollLeft: { label: 'Roll left', keys: ['KeyA', 'ArrowLeft'] },
  rollRight: { label: 'Roll right', keys: ['KeyD', 'ArrowRight'] },
  yawLeft: { label: 'Rudder left / steer', keys: ['KeyZ'] },
  yawRight: { label: 'Rudder right / steer', keys: ['KeyX'] },
  throttleUp: { label: 'Power up', keys: ['KeyR', 'ShiftLeft'] },
  throttleDown: { label: 'Power down', keys: ['KeyF', 'ControlLeft'] },
  brakes: { label: 'Brakes (hold)', keys: ['Space'] },
  flapsUp: { label: 'Flaps up', keys: ['KeyG'] },
  flapsDown: { label: 'Flaps down', keys: ['KeyB'] },
  trimUp: { label: 'Trim nose up', keys: ['BracketRight', 'PageUp'] },
  trimDown: { label: 'Trim nose down', keys: ['BracketLeft', 'PageDown'] },
  spray: { label: 'Spray on / off', keys: ['KeyC', 'Enter'] },
  engine: { label: 'Engine (hold start / tap stop)', keys: ['KeyQ'] },
  camera: { label: 'Cockpit / chase camera', keys: ['KeyV'] },
  orbit: { label: 'Free external camera', keys: ['KeyO'] },
  interact: { label: 'Interact / service', keys: ['KeyE'] },
  map: { label: 'Map', keys: ['KeyM'] },
  coverage: { label: 'Coverage overlay', keys: ['KeyK'] },
  jobs: { label: 'Contracts', keys: ['KeyJ'] },
  reset: { label: 'Reset aircraft', keys: ['Backspace'] },
  help: { label: 'Controls help', keys: ['KeyH'] },
  pause: { label: 'Pause / menu', keys: ['Escape', 'KeyP'] },
};

const STORE = 'agrowings.keys.v1';

export class Input {
  constructor(el) {
    this.el = el;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.bindings = {};
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
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace', 'PageUp', 'PageDown'].includes(e.code)) e.preventDefault();
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
        // Remove the key from other actions, then make it the primary key.
        for (const k of Object.keys(this.bindings)) this.bindings[k] = this.bindings[k].filter((c) => c !== code);
        this.bindings[action] = [code, ...this.bindings[action].filter((c) => c !== code)].slice(0, 2);
        this.save();
      }
      cb?.();
    };
  }

  isDown(a) { return this.enabled && this.bindings[a].some((c) => this.down.has(c)); }
  wasPressed(a) { return this.enabled && this.bindings[a].some((c) => this.pressed.has(c)); }
  wasReleased(a) { return this.bindings[a].some((c) => this.released.has(c)); }
  press(code) { if (!this.down.has(code)) this.pressed.add(code); this.down.add(code); }
  release(code) { this.down.delete(code); this.released.add(code); }
  pressAction(a) { this.press(this.bindings[a][0]); }
  releaseAction(a) { this.release(this.bindings[a][0]); }

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
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('Arrow', '').replace('Left', ' L').replace('Right', ' R')
    .replace('Bracket R', ']').replace('Bracket L', '[').replace('Control', 'Ctrl').replace('Backspace', '⌫').replace('Escape', 'Esc');
}
