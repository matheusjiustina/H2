// Keyboard / mouse input with pointer lock and per-frame edge detection.

const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  crouch: ['KeyC', 'ControlLeft'],
  interact: ['KeyE'],
  use: ['KeyF'],
  drop: ['KeyR'],
  stow: ['KeyQ'],
  inventory: ['Tab', 'KeyI'],
  map: ['KeyM'],
  notebook: ['KeyN'],
  debug: ['F2', 'Backquote'],
  hideHud: ['F1'],
  timeBack: ['BracketLeft'],
  timeFwd: ['BracketRight'],
};

export class Input {
  constructor(element) {
    this.el = element;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.mouseDown = [false, false, false];
    this.mousePressed = [false, false, false];
    this.mouseReleased = [false, false, false];
    this.locked = false;
    this.enabled = true;
    this.sensitivity = 1;
    this.invertY = false;
    this.onLockChange = null;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code === 'F1' || e.code === 'F2' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => { this.down.clear(); this.mouseDown = [false, false, false]; });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // ignore absurd spikes some browsers emit on lock
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button > 2) return;
      this.mouseDown[e.button] = true;
      this.mousePressed[e.button] = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button > 2) return;
      this.mouseDown[e.button] = false;
      this.mouseReleased[e.button] = true;
    });
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  lock() {
    if (this.locked) return;
    try {
      const p = this.el.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => this.el.requestPointerLock());
    } catch {
      this.el.requestPointerLock();
    }
  }

  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  isDown(action) { return BINDINGS[action].some((c) => this.down.has(c)); }
  wasPressed(action) { return BINDINGS[action].some((c) => this.pressed.has(c)); }
  wasReleased(action) { return BINDINGS[action].some((c) => this.released.has(c)); }

  axis() {
    const x = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    const y = (this.isDown('forward') ? 1 : 0) - (this.isDown('back') ? 1 : 0);
    return { x, y };
  }

  consumeMouse() {
    const s = 0.0022 * this.sensitivity;
    const dx = this.mouseDX * s, dy = this.mouseDY * s * (this.invertY ? -1 : 1);
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  /** Call at the end of every frame. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mousePressed = [false, false, false];
    this.mouseReleased = [false, false, false];
    this.wheel = 0;
  }
}
