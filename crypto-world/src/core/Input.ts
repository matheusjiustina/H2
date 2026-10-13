/**
 * Unified input: keyboard, mouse drag camera, wheel zoom, touch (fed by TouchControls) and gamepad.
 * Edge-triggered actions are consumed once per frame via `consume*` helpers.
 */

export type Action = 'interact' | 'jump' | 'journal' | 'pause' | 'perf' | 'skip' | 'confirm';

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<Action>();
  lookDX = 0;
  lookDY = 0;
  zoomDelta = 0;
  /** Analog move from touch joystick / gamepad (overrides keys when non-zero). */
  analogX = 0;
  analogY = 0;
  touchRun = false;
  enabled = true;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  lastDevice: 'keyboard' | 'touch' | 'gamepad' = 'keyboard';
  private gamepadPrev: boolean[] = [];
  /** Seconds since any camera input; the camera uses this to decide when to auto-follow. */
  idleLookTime = 100;
  sensitivity = 1;
  invertY = false;

  constructor(canvas: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', () => (this.dragging = false));
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    this.lastDevice = 'keyboard';
    const k = e.code;
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
    if (!e.repeat) {
      if (k === 'KeyE' || k === 'Enter') this.pressed.add('interact');
      if (k === 'Space') {
        this.pressed.add('jump');
        this.pressed.add('skip');
      }
      if (k === 'Enter' || k === 'KeyE') this.pressed.add('confirm');
      if (k === 'Tab' || k === 'KeyJ') this.pressed.add('journal');
      if (k === 'Escape') this.pressed.add('pause');
      if (k === 'F3' || k === 'Backquote') {
        e.preventDefault();
        this.pressed.add('perf');
      }
    }
    this.keys.add(k);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent) => {
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.dragging || !this.enabled) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.addLook(dx, dy);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomDelta += Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 60);
  };

  addLook(dx: number, dy: number): void {
    this.lookDX += dx * this.sensitivity;
    this.lookDY += dy * this.sensitivity * (this.invertY ? -1 : 1);
    if (Math.abs(dx) + Math.abs(dy) > 0.5) this.idleLookTime = 0;
  }

  press(a: Action): void {
    this.pressed.add(a);
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Movement vector in camera space: x = right, y = forward. Magnitude ≤ 1. */
  move(): { x: number; y: number } {
    if (!this.enabled) return { x: 0, y: 0 };
    if (Math.abs(this.analogX) > 0.05 || Math.abs(this.analogY) > 0.05) {
      return { x: this.analogX, y: this.analogY };
    }
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }

  running(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchRun;
  }

  consume(a: Action): boolean {
    if (this.pressed.has(a)) {
      this.pressed.delete(a);
      return true;
    }
    return false;
  }

  /** Called at the end of every frame. */
  endFrame(dt: number): void {
    this.lookDX = 0;
    this.lookDY = 0;
    this.zoomDelta = 0;
    this.pressed.clear();
    this.idleLookTime += dt;
  }

  pollGamepad(dt: number): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && pads[0];
    if (!gp) return;
    const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
    const lx = dz(gp.axes[0] ?? 0), ly = dz(gp.axes[1] ?? 0);
    const rx = dz(gp.axes[2] ?? 0), ry = dz(gp.axes[3] ?? 0);
    if (lx || ly || rx || ry) this.lastDevice = 'gamepad';
    if (this.lastDevice === 'gamepad') {
      this.analogX = lx;
      this.analogY = -ly;
      this.touchRun = !!gp.buttons[10]?.pressed || !!gp.buttons[7]?.pressed;
    }
    if (rx || ry) this.addLook(rx * 600 * dt, ry * 400 * dt);
    const map: [number, Action][] = [[0, 'interact'], [0, 'confirm'], [1, 'skip'], [3, 'jump'], [9, 'pause'], [8, 'journal']];
    map.forEach(([b, a]) => {
      const down = !!gp.buttons[b]?.pressed;
      if (down && !this.gamepadPrev[b]) this.pressed.add(a);
    });
    this.gamepadPrev = gp.buttons.map((b) => b.pressed);
  }
}
