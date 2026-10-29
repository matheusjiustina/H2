// Touch controls, kept to the screen edges so the view ahead stays clear.
// Three layouts for the flight controls (Settings → Flying → Touch controls),
// the same buttons and look in all of them; only how pitch and roll are
// given changes, through the same virtual input:
//   stick   virtual stick, bottom left
//   tilt    the phone's tilt (device orientation), no stick
//   buttons four arrow buttons, no stick and no tilt
// Rudder, power slider (right edge, middle), spray, brakes, engine, camera,
// flaps, service, map and pause are the same in all three. The camera pill
// is the camera: fixed (the default) is the chase / cockpit view that a
// dragged finger looks around, free is the orbit camera (the O key on a PC):
// drag to place it, pinch to zoom.
import { h } from './hud.js';
import { t } from '../i18n/index.js';

export class TouchControls {
  constructor(game, root) {
    this.game = game;
    this.active = false;
    this.dpad = { x: 0, y: 0 };
    this.mode = 'stick';
    this.el = h(`<div class="touch">
      <div class="t-stick"><div class="t-knob"></div></div>
      <div class="t-dpad"><button class="tb small" data-hold="pitchDn">▲</button><button class="tb small" data-hold="rollL">◀</button><button class="tb small" data-hold="rollR">▶</button><button class="tb small" data-hold="pitchUp">▼</button></div>
      <button class="t-tilt" data-tilt><b>${t('TILT')}</b><i><u></u></i><em>${t('recentre')}</em></button>
      <div class="t-rud"><button class="tb small" data-hold="yawL">◀ ${t('R')}</button><button class="tb small" data-hold="yawR">${t('R')} ▶</button></div>
      <div class="t-thr"><span style="height:0%"></span></div>
      <div class="t-btns">
        <button class="tb" data-tap="spray">${t('SPRAY')}</button><button class="tb" data-hold="brake">${t('BRAKE')}</button>
        <button class="tb" data-hold="engine">${t('ENG')}</button><button class="tb" data-tap="camera">${t('CAM')}</button>
        <button class="tb small" data-tap="flapsDown">FLP+</button><button class="tb small" data-tap="flapsUp">FLP−</button>
      </div>
      <div class="t-top"><div class="t-look"><button data-look="1">${t('FREE')}</button><button data-look="0">${t('FIXED')}</button></div><button class="tb small" data-tap="interact">E</button><button class="tb small" data-tap="map">${t('MAP')}</button><button class="tb small" data-tap="pause">II</button></div>
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
        // Arrow buttons (buttons layout): full deflection while held.
        if (k === 'rollL') this.dpad.x = on ? -1 : (this.dpad.x < 0 ? 0 : this.dpad.x);
        if (k === 'rollR') this.dpad.x = on ? 1 : (this.dpad.x > 0 ? 0 : this.dpad.x);
        if (k === 'pitchDn') this.dpad.y = on ? -1 : (this.dpad.y < 0 ? 0 : this.dpad.y);
        if (k === 'pitchUp') this.dpad.y = on ? 1 : (this.dpad.y > 0 ? 0 : this.dpad.y);
        if (this.mode === 'buttons') { v.roll = this.dpad.x; v.pitch = this.dpad.y; }
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
    // Free / fixed camera: a finger dragged on the view looks around or not.
    for (const b of this.el.querySelectorAll('[data-look]')) b.addEventListener('pointerdown', (e) => { e.preventDefault(); game.setTouchCamera(b.dataset.look === '1'); this.syncCamera(); });
    this.tiltBtn = this.el.querySelector('[data-tilt]');
    this.tiltBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.startTilt(true); });
    this.neutral = null;
    this.tilt = { x: 0, y: 0 };
    this.applySettings();
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

  syncCamera() {
    const free = this.game.cameraMode === 'orbit';
    for (const b of this.el.querySelectorAll('[data-look]')) b.classList.toggle('on', (b.dataset.look === '1') === free);
  }

  // Layout and camera choice from the settings.
  applySettings() {
    const s = this.game.settings;
    const mode = ['stick', 'tilt', 'buttons'].includes(s.touchMode) ? s.touchMode : 'stick';
    const v = this.game.input.virtual;
    if (mode !== this.mode) { v.roll = 0; v.pitch = 0; this.dpad.x = this.dpad.y = 0; }
    this.mode = mode;
    for (const m of ['stick', 'tilt', 'buttons']) this.el.classList.toggle(`m-${m}`, m === mode);
    if (mode === 'tilt') this.startTilt(false); else this.stopTilt();
  }

  // Tilt: the phone's orientation relative to the pose when the mode was
  // chosen (or "recentre" was tapped). iOS asks for permission, which needs
  // a tap.
  async startTilt(fromTap) {
    this.neutral = null;
    if (this._tiltOn) { this._setTiltState('on'); return; }
    if (typeof DeviceOrientationEvent === 'undefined') { this._setTiltState('none'); return; }
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      if (!fromTap && !this._asked) { this._setTiltState('ask'); return; }
      try { if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') { this._setTiltState('none'); return; } } catch { this._setTiltState('ask'); return; }
    }
    this._asked = true;
    this._onTilt ??= (e) => {
      if (e.beta === null || e.gamma === null) return;
      if (!this._gotTilt && this._tiltOn) this._setTiltState('on');
      this._gotTilt = true;
      const a = ((screen.orientation?.angle ?? window.orientation ?? 90) + 360) % 360;
      // Roll: the phone turned like a steering wheel; pitch: its top edge
      // toward you = stick back. Signs per screen rotation.
      let roll, pitch;
      if (a === 90) { roll = e.beta; pitch = -e.gamma; } else if (a === 270) { roll = -e.beta; pitch = e.gamma; } else if (a === 180) { roll = -e.gamma; pitch = -e.beta; } else { roll = e.gamma; pitch = e.beta; }
      const cur = { roll, pitch };
      if (!this.neutral) this.neutral = cur;
      const f = (d) => { d = Math.abs(d) < 3 ? 0 : d - Math.sign(d) * 3; return Math.max(-1, Math.min(1, d / 22)); };
      this.tilt.x = f(cur.roll - this.neutral.roll);
      this.tilt.y = f(cur.pitch - this.neutral.pitch);
    };
    window.addEventListener('deviceorientation', this._onTilt);
    this._tiltOn = true;
    this._setTiltState('on');
  }

  stopTilt() {
    if (this._tiltOn) window.removeEventListener('deviceorientation', this._onTilt);
    this._tiltOn = false;
    this.tilt.x = this.tilt.y = 0;
  }

  _setTiltState(st) {
    this.tiltState = st;
    this.tiltBtn.dataset.state = st;
    this.tiltBtn.querySelector('em').textContent = st === 'on' ? t('recentre') : st === 'ask' ? t('tap to enable') : t('no sensor');
  }

  update() {
    if (!this.active) return;
    // Tilt is zeroed to the pose the phone is held in when the flight starts,
    // and reported as missing when the sensor never answers.
    this.syncCamera();
    if (this.game.playing && !this._wasPlaying) this.neutral = null;
    this._wasPlaying = this.game.playing;
    if (this.mode === 'tilt') {
      if (this._tiltOn && this.tiltState === 'on' && !this._gotTilt && (this._tiltT = (this._tiltT || 0) + 1) > 240) this._setTiltState('none');
      const v = this.game.input.virtual;
      v.roll = this.tilt.x; v.pitch = this.tilt.y;
      this.tiltBtn.querySelector('u').style.transform = `translate(${this.tilt.x * 36}px, 0)`;
    }
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
