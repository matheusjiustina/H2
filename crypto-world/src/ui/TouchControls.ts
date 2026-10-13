import { Input } from '../core/Input';
import { el } from './UI';

/** Virtual joystick, touch camera rotation and contextual buttons for phones and tablets. */
export class TouchControls {
  readonly root = el('div', 'touch hidden');
  private knob = el('i');
  private joy = el('div', 'joy');
  private look = el('div', 'look-zone');
  private actBtn = el('button', 'tbtn act', 'TALK');
  private runBtn = el('button', 'tbtn', 'RUN');
  private jumpBtn = el('button', 'tbtn', 'JUMP');
  private joyId: number | null = null;
  private lookId: number | null = null;
  private lastLook = { x: 0, y: 0 };
  private center = { x: 0, y: 0 };
  enabled = false;

  constructor(parent: HTMLElement, private input: Input) {
    this.joy.appendChild(this.knob);
    const btns = el('div', 'touch-btns');
    btns.append(this.jumpBtn, this.runBtn, this.actBtn);
    this.root.append(this.look, this.joy, btns);
    parent.appendChild(this.root);

    this.joy.addEventListener('pointerdown', (e) => {
      this.joyId = e.pointerId;
      const r = this.joy.getBoundingClientRect();
      this.center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      this.joy.setPointerCapture(e.pointerId);
      this.moveJoy(e);
      input.lastDevice = 'touch';
    });
    this.joy.addEventListener('pointermove', (e) => e.pointerId === this.joyId && this.moveJoy(e));
    const endJoy = (e: PointerEvent) => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null;
      input.analogX = 0;
      input.analogY = 0;
      this.knob.style.transform = '';
    };
    this.joy.addEventListener('pointerup', endJoy);
    this.joy.addEventListener('pointercancel', endJoy);

    this.look.addEventListener('pointerdown', (e) => {
      this.lookId = e.pointerId;
      this.lastLook = { x: e.clientX, y: e.clientY };
      this.look.setPointerCapture(e.pointerId);
    });
    this.look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      input.addLook((e.clientX - this.lastLook.x) * 1.3, (e.clientY - this.lastLook.y) * 1.3);
      this.lastLook = { x: e.clientX, y: e.clientY };
    });
    const endLook = (e: PointerEvent) => e.pointerId === this.lookId && (this.lookId = null);
    this.look.addEventListener('pointerup', endLook);
    this.look.addEventListener('pointercancel', endLook);

    this.actBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      input.press('interact');
      input.press('confirm');
    });
    this.runBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      input.touchRun = !input.touchRun;
      this.runBtn.classList.toggle('on', input.touchRun);
    });
    this.jumpBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      input.press('jump');
    });
  }

  private moveJoy(e: PointerEvent): void {
    const dx = e.clientX - this.center.x;
    const dy = e.clientY - this.center.y;
    const max = 50;
    const len = Math.hypot(dx, dy);
    const k = len > max ? max / len : 1;
    this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    this.input.analogX = (dx * k) / max;
    this.input.analogY = (-dy * k) / max;
  }

  setVisible(on: boolean): void {
    this.enabled = on;
    this.root.classList.toggle('hidden', !on);
  }

  setAction(label: string | null): void {
    this.actBtn.textContent = label ?? '·';
    this.actBtn.style.opacity = label ? '1' : '0.45';
  }

  static isTouchDevice(): boolean {
    return 'ontouchstart' in window || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }
}
