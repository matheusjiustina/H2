// On-screen controls for touch devices. They feed the same Input state as the
// keyboard and mouse: a virtual stick drives movement, dragging on the right half
// turns the camera, and buttons press the same key codes.

const BUTTONS = [
  { id: 'jump', code: 'Space', label: 'Jump' },
  { id: 'interact', code: 'KeyE', label: 'E' },
  { id: 'use', code: 'KeyF', label: 'F' },
  { id: 'dive', code: 'KeyC', label: 'Dive' },
  // seaplane
  { id: 'thrUp', code: 'KeyR', label: 'Thr +', plane: true },
  { id: 'thrDown', code: 'KeyF', label: 'Thr \u2212', plane: true },
  { id: 'flaps', code: 'FlapsCycle', label: 'Flaps', plane: true },
  { id: 'start', code: 'KeyQ', label: 'Start', plane: true },
  { id: 'view', code: 'KeyV', label: 'View', plane: true },
  { id: 'exit', code: 'KeyE', label: 'Exit', plane: true },
];

export class TouchControls {
  constructor(game, root) {
    this.game = game;
    this.input = game.input;
    this.active = false;
    this.el = document.createElement('div');
    this.el.className = 'touch interactive';
    this.el.innerHTML = `
      <div class="touch-look"></div>
      <div class="touch-move"><div class="touch-stick"><div class="touch-knob"></div></div></div>
      <div class="touch-buttons">${BUTTONS.map((b) => `<button type="button" class="touch-btn" data-id="${b.id}"${b.plane ? " hidden" : ""}>${b.label}</button>`).join('')}</div>
      <div class="touch-top">
        <button type="button" class="touch-btn small" data-act="inventory">Bag</button>
        <button type="button" class="touch-btn small" data-act="pause">II</button>
      </div>`;
    root.append(this.el);
    this.stick = this.el.querySelector('.touch-stick');
    this.knob = this.el.querySelector('.touch-knob');
    this.moveTouch = null;
    this.lookTouch = null;
    this._bind();
    // phones and tablets get the controls straight away; touch laptops once the screen is touched
    if (matchMedia('(pointer: coarse)').matches) this.show();
    else window.addEventListener('touchstart', () => this.show(), { passive: true, once: true });
  }

  show() {
    if (this.active) return;
    this.active = true;
    this.el.classList.add('on');
    this.game.ui.root.classList.add('touch-mode');
  }

  _bind() {
    const move = this.el.querySelector('.touch-move');
    const look = this.el.querySelector('.touch-look');
    const R = 52; // stick travel in px

    move.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.moveTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
      this.stick.style.left = `${t.clientX}px`;
      this.stick.style.top = `${t.clientY}px`;
      this.stick.classList.add('held');
      this.input.virtualAxis = { x: 0, y: 0 };
    }, { passive: false });

    look.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
    }, { passive: false });

    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (this.moveTouch && t.identifier === this.moveTouch.id) {
          e.preventDefault();
          let dx = t.clientX - this.moveTouch.x, dy = t.clientY - this.moveTouch.y;
          const len = Math.hypot(dx, dy);
          if (len > R) { dx *= R / len; dy *= R / len; }
          this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
          this.input.virtualAxis = { x: dx / R, y: -dy / R };
          // push the stick to the rim to sprint
          if (this.game.player.mode !== 'plane') {
            if (len > R * 1.15) this.input.pressCode('ShiftLeft');
            else if (this.input.down.has('ShiftLeft')) this.input.releaseCode('ShiftLeft');
          }
        } else if (this.lookTouch && t.identifier === this.lookTouch.id) {
          e.preventDefault();
          this.input.addLook((t.clientX - this.lookTouch.x) * 2.2, (t.clientY - this.lookTouch.y) * 2.2);
          this.lookTouch.x = t.clientX;
          this.lookTouch.y = t.clientY;
        }
      }
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (this.moveTouch && t.identifier === this.moveTouch.id) {
          this.moveTouch = null;
          this.input.virtualAxis = null;
          this.input.releaseCode('ShiftLeft');
          this.knob.style.transform = '';
          this.stick.classList.remove('held');
        }
        if (this.lookTouch && t.identifier === this.lookTouch.id) this.lookTouch = null;
      }
    };
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);

    for (const btn of this.el.querySelectorAll('.touch-btn[data-id]')) {
      const def = BUTTONS.find((b) => b.id === btn.dataset.id);
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); this.input.pressCode(def.code); btn.classList.add('down'); }, { passive: false });
      const up = () => { this.input.releaseCode(def.code); btn.classList.remove('down'); };
      btn.addEventListener('touchend', up);
      btn.addEventListener('touchcancel', up);
    }
    this.el.querySelector('[data-act=pause]').addEventListener('click', () => this.game.pause());
    this.el.querySelector('[data-act=inventory]').addEventListener('click', () => {
      if (this.game.state === 'playing') this.input.pressCode('Tab');
      setTimeout(() => this.input.releaseCode('Tab'), 50);
    });
  }

  /** Keep only the buttons that mean something right now. */
  update() {
    if (!this.active) return;
    const g = this.game;
    const playing = g.state === 'playing';
    this.el.classList.toggle('hidden', !playing);
    if (!playing) return;
    const swim = g.player.mode === 'swim';
    const boat = g.player.mode === 'boat';
    const plane = g.player.mode === 'plane';
    this._toggle('dive', swim);
    this._toggle('jump', !boat && !plane);
    this._toggle('interact', !plane && (!!g.interaction.focus || boat));
    this._toggle('use', !plane && (!!(g.inventory.equippedDef && g.inventory.equippedDef.use) || !!(g.interaction.focus && g.interaction.focus.label2(g))));
    for (const b of BUTTONS) if (b.plane) this._toggle(b.id, plane);
  }

  _toggle(id, on) {
    const b = this.el.querySelector(`.touch-btn[data-id=${id}]`);
    if (b && b.hidden === on) b.hidden = !on;
  }
}
