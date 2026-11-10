import { clamp } from './util';

export type Action =
  | 'sprint'
  | 'jump'
  | 'interact'
  | 'context'
  | 'attack'
  | 'aim'
  | 'reload'
  | 'dodge'
  | 'crouch'
  | 'mission'
  | 'map'
  | 'pause'
  | 'horn'
  | 'next'
  | 'prev'
  | 'descend';

const KEYMAP: Record<Action, string[]> = {
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  interact: ['KeyE'],
  context: ['KeyF'],
  attack: [],
  aim: [],
  reload: ['KeyR'],
  dodge: ['KeyQ'],
  crouch: ['KeyC', 'ControlLeft'],
  mission: ['Tab'],
  map: ['KeyM'],
  pause: ['Escape', 'KeyP'],
  horn: ['KeyH'],
  next: ['Digit2', 'BracketRight'],
  prev: ['Digit1', 'BracketLeft'],
  descend: ['ControlLeft', 'KeyC'],
};

// Standard gamepad mapping → actions
const PADMAP: Partial<Record<Action, number[]>> = {
  jump: [0],
  dodge: [1],
  interact: [2],
  context: [3],
  crouch: [4, 10],
  sprint: [5, 11],
  aim: [6],
  attack: [7],
  map: [8],
  pause: [9],
  prev: [14],
  next: [15],
  reload: [13],
  horn: [12],
  descend: [4],
};

export class Input {
  keys = new Set<string>();
  private pressedKeys = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  private mouse = [false, false, false];
  private mousePressed = [false, false, false];
  locked = false;
  /** When false (menus open) gameplay input reads as idle. */
  enabled = true;
  private padPrev: boolean[] = [];
  private padNow: boolean[] = [];
  private padAxes = [0, 0, 0, 0];
  padActive = false;
  /** Set by automated tests / touch to inject input. */
  virtualMove = { x: 0, y: 0, active: false };
  private dragging = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) this.pressedKeys.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse = [false, false, false];
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button < 3) {
        this.mouse[e.button] = true;
        this.mousePressed[e.button] = true;
      }
      this.dragging = true;
      if (!this.locked && this.enabled) this.requestLock();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button < 3) this.mouse[e.button] = false;
      this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.locked || this.dragging) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    canvas.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* pointer lock unavailable – drag-to-look fallback is used */
    }
  }
  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp: Gamepad | null = null;
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') { gp = p; break; }
    this.padPrev = this.padNow;
    this.padNow = [];
    if (!gp) {
      this.padAxes = [0, 0, 0, 0];
      return;
    }
    for (let i = 0; i < gp.buttons.length; i++) this.padNow[i] = gp.buttons[i].pressed || gp.buttons[i].value > 0.4;
    const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
    this.padAxes = [dz(gp.axes[0] || 0), dz(gp.axes[1] || 0), dz(gp.axes[2] || 0), dz(gp.axes[3] || 0)];
    if (this.padNow.some(Boolean) || this.padAxes.some((a) => a !== 0)) this.padActive = true;
  }

  private padDown(a: Action) {
    const b = PADMAP[a];
    return !!b && b.some((i) => this.padNow[i]);
  }
  private padPressed(a: Action) {
    const b = PADMAP[a];
    return !!b && b.some((i) => this.padNow[i] && !this.padPrev[i]);
  }

  /** Held state. */
  down(a: Action): boolean {
    if (!this.enabled) return false;
    if (a === 'attack' && this.mouse[0]) return true;
    if (a === 'aim' && this.mouse[2]) return true;
    return KEYMAP[a].some((k) => this.keys.has(k)) || this.padDown(a);
  }
  /** True only on the frame the action was pressed. */
  hit(a: Action): boolean {
    if (!this.enabled) return false;
    if (a === 'attack' && this.mousePressed[0]) return true;
    if (a === 'aim' && this.mousePressed[2]) return true;
    return KEYMAP[a].some((k) => this.pressedKeys.has(k)) || this.padPressed(a);
  }
  /** Raw (ignores `enabled`) – used by menus. */
  rawHit(code: string) {
    return this.pressedKeys.has(code);
  }
  rawPadHit(a: Action) {
    return this.padPressed(a);
  }
  anyKey() {
    return this.pressedKeys.size > 0 || this.mousePressed[0];
  }

  /** Movement axes: x = right, y = forward. */
  move(): { x: number; y: number } {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    x += this.padAxes[0];
    y -= this.padAxes[1];
    if (this.virtualMove.active) {
      x += this.virtualMove.x;
      y += this.virtualMove.y;
    }
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    return { x, y };
  }
  /** Vehicle throttle (-1..1) – W/S or triggers. */
  throttle(): number {
    if (!this.enabled) return 0;
    let t = this.move().y;
    if (this.padNow[7]) t += 1;
    if (this.padNow[6]) t -= 1;
    return clamp(t, -1, 1);
  }
  look(dt: number): { x: number; y: number } {
    if (!this.enabled) return { x: 0, y: 0 };
    return {
      x: this.mouseDX + this.padAxes[2] * 900 * dt,
      y: this.mouseDY + this.padAxes[3] * 600 * dt,
    };
  }

  endFrame() {
    this.pressedKeys.clear();
    this.mousePressed = [false, false, false];
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
