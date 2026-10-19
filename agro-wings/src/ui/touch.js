// Touch controls: left virtual stick (pitch/roll), right power slider, and a
// few buttons kept to the screen edges so the view ahead stays clear.
import { h } from './hud.js';
import { t } from '../i18n/index.js';

export class TouchControls {
  constructor(game, root) {
    this.game = game;
    this.active = false;
    this.el = h(`<div class="touch">
      <div class="t-stick"><div class="t-knob"></div></div>
      <div class="t-rud"><button class="tb small" data-hold="yawL">◀ ${t('R')}</button><button class="tb small" data-hold="yawR">${t('R')} ▶</button></div>
      <div class="t-thr"><span style="height:0%"></span></div>
      <div class="t-btns">
        <button class="tb" data-tap="spray">${t('SPRAY')}</button><button class="tb" data-hold="brake">${t('BRAKE')}</button>
        <button class="tb" data-hold="engine">${t('ENG')}</button><button class="tb" data-tap="camera">${t('CAM')}</button>
        <button class="tb small" data-tap="flapsDown">FLP+</button><button class="tb small" data-tap="flapsUp">FLP−</button>
      </div>
      <div class="t-top"><button class="tb small" data-tap="interact">E</button><button class="tb small" data-tap="map">${t('MAP')}</button><button class="tb small" data-tap="pause">II</button></div>
    </div>`);
    root.appendChild(this.el);
    const input = game.input;
    const v = input.virtual;
    v.brake = false; v.engine = false;
    const stick = this.el.querySelector('.t-stick'), knob = this.el.querySelector('.t-knob');
    let sid = null;
    const setStick = (e) => {
      const r = stick.getBoundingClientRect();
      let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      knob.style.transform = `translate(${x * 40}px, ${y * 40}px)`;
      v.roll = x;
      v.pitch = y; // drag down = stick back = nose up
    };
    stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; stick.setPointerCapture(e.pointerId); setStick(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) setStick(e); });
    const endStick = (e) => { if (e.pointerId !== sid) return; sid = null; v.roll = 0; v.pitch = 0; knob.style.transform = ''; };
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);
    const thr = this.el.querySelector('.t-thr'), thrBar = thr.querySelector('span');
    let tid = null;
    const setThr = (e) => {
      const r = thr.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
      v.throttle = t;
      thrBar.style.height = `${t * 100}%`;
    };
    thr.addEventListener('pointerdown', (e) => { tid = e.pointerId; thr.setPointerCapture(e.pointerId); setThr(e); });
    thr.addEventListener('pointermove', (e) => { if (e.pointerId === tid) setThr(e); });
    thr.addEventListener('pointerup', (e) => { if (e.pointerId === tid) { tid = null; v.throttle = null; } });
    for (const b of this.el.querySelectorAll('[data-hold]')) {
      const k = b.dataset.hold;
      const set = (on) => {
        b.classList.toggle('down', on);
        if (k === 'brake') v.brake = on;
        if (k === 'engine') v.engine = on;
        if (k === 'yawL') v.yaw = on ? -1 : 0;
        if (k === 'yawR') v.yaw = on ? 1 : 0;
      };
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); set(true); });
      b.addEventListener('pointerup', () => set(false));
      b.addEventListener('pointercancel', () => set(false));
    }
    for (const b of this.el.querySelectorAll('[data-tap]')) {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        input.pressAction(b.dataset.tap);
        setTimeout(() => input.releaseAction(b.dataset.tap), 60);
      });
    }
    window.addEventListener('touchstart', () => this.enable(), { once: true, passive: true });
    if (matchMedia('(pointer: coarse)').matches) this.enable();
  }

  enable() {
    if (this.active) return;
    this.active = true;
    this.game.input.virtual.active = true;
    this.el.classList.add('on');
    this.game.uiRoot.classList.add('touch-mode');
  }

  update() {
    if (!this.active) return;
    const fm = this.game.aircraft?.fm;
    const v = this.game.input.virtual;
    // The right slider is the throttle in the airplanes, the collective in the helicopter.
    const ac = this.game.aircraft;
    const lev = ac?.kind === 'heli' ? ac.lever : fm?.throttle;
    if (fm && (v.throttle === null || v.throttle === undefined)) this.el.querySelector('.t-thr span').style.height = `${lev * 100}%`;
    this.el.querySelector('[data-tap=spray]').classList.toggle('on', !!this.game.sprayer?.on);
    this.el.classList.toggle('hidden', !this.game.playing);
    this.el.style.display = this.game.playing ? '' : 'none';
  }
}
