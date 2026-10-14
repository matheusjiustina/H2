/**
 * Keyboard / mouse / pointer-lock / touch input with per-frame edge detection.
 * If pointer lock is unavailable (embedded iframes etc.) it falls back to
 * drag-to-look so the game is still fully playable.
 */
export class Input {
  readonly keys = new Set<string>();
  private down = new Set<string>();
  private up = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  lmb = false;
  rmb = false;
  lmbDown = false;
  lmbUp = false;
  rmbDown = false;
  rmbUp = false;
  /** Cursor position in CSS pixels relative to the canvas. */
  cx = 0;
  cy = 0;
  locked = false;
  lockFailed = false;
  /** When true, mouse moves are used for look even without lock (drag mode). */
  dragLook = false;
  private dragging = false;
  private dragMoved = 0;
  /** A click that happened in drag-look mode without moving (treated as "use"). */
  dragClick = false;
  onLockChange: ((locked: boolean) => void) | null = null;
  /** Touch: virtual stick and buttons. */
  touchMove = { x: 0, y: 0 };
  touchActive = false;
  private lockRequestedAt = 0;

  constructor(private el: HTMLElement) {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) {
        if (this.shouldPrevent(e)) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      this.down.add(e.code);
      if (this.shouldPrevent(e)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      this.up.add(e.code);
    });
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.lmb = this.rmb = false;
    });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("mousedown", (e) => {
      this.updateCursor(e);
      if (e.button === 0) {
        this.lmb = true;
        this.lmbDown = true;
        if (this.dragLook && !this.locked) {
          this.dragging = true;
          this.dragMoved = 0;
        }
      } else if (e.button === 2) {
        this.rmb = true;
        this.rmbDown = true;
      }
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) {
        if (this.lmb) this.lmbUp = true;
        this.lmb = false;
        if (this.dragging && this.dragMoved < 6) this.dragClick = true;
        this.dragging = false;
      } else if (e.button === 2) {
        if (this.rmb) this.rmbUp = true;
        this.rmb = false;
      }
    });
    window.addEventListener("mousemove", (e) => {
      this.updateCursor(e);
      if (this.locked) {
        // ignore absurd spikes some browsers emit right after locking
        if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      } else if (this.dragging) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
        this.dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
      }
    });
    el.addEventListener(
      "wheel",
      (e) => {
        this.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.el;
      if (this.locked) {
        this.lockFailed = false;
        this.dragLook = false;
      }
      this.onLockChange?.(this.locked);
    });
    document.addEventListener("pointerlockerror", () => {
      this.lockFailed = true;
      this.dragLook = true;
    });
  }

  private shouldPrevent(e: KeyboardEvent) {
    return ["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code) && !(e.target instanceof HTMLInputElement);
  }

  private updateCursor(e: MouseEvent) {
    const r = this.el.getBoundingClientRect();
    this.cx = e.clientX - r.left;
    this.cy = e.clientY - r.top;
  }

  requestLock() {
    if (this.locked || this.touchActive) return;
    const now = performance.now();
    // browsers refuse a re-lock right after Esc; avoid error spam
    if (now - this.lockRequestedAt < 250) return;
    this.lockRequestedAt = now;
    try {
      const p = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          this.lockFailed = true;
          this.dragLook = true;
        });
      }
    } catch {
      this.lockFailed = true;
      this.dragLook = true;
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  pressed(code: string): boolean {
    return this.down.has(code);
  }

  released(code: string): boolean {
    return this.up.has(code);
  }

  /** Keys that went down this frame (in order of arrival is not guaranteed). */
  pressedKeys(): string[] {
    return [...this.down];
  }

  held(code: string): boolean {
    return this.keys.has(code);
  }

  /** Simulate a key press from touch UI. */
  tap(code: string) {
    this.down.add(code);
  }

  endFrame() {
    this.down.clear();
    this.up.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.lmbDown = this.lmbUp = this.rmbDown = this.rmbUp = false;
    this.dragClick = false;
  }
}
