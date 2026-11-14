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
    this.walk = { x: 0, y: 0 };
    this.mode = 'stick';
    this.el = h(`<div class="touch">
      <div class="t-stick"><div class="t-knob"></div></div>
      <div class="t-dpad"><button class="tb small" data-hold="pitchDn">▲</button><button class="tb small" data-hold="rollL">◀</button><button class="tb small" data-hold="rollR">▶</button><button class="tb small" data-hold="pitchUp">▼</button></div>
      <button class="t-tilt" data-tilt><b>${t('TILT')}</b><i><u></u></i><em>${t('recentre')}</em></button>
      <div class="t-rud"><button class="tb tiny" data-hold="yawL" aria-label="${t('Rudder left / steer')}">L</button><button class="tb tiny" data-hold="yawR" aria-label="${t('Rudder right / steer')}">R</button></div>
      <div class="t-thr"><span style="height:0%"></span><i class="rev-zone"><b>REV</b></i><em class="rev-fill" style="height:0%"></em></div>
      <div class="t-btns">
        <button class="tb" data-tap="spray">${t('SPRAY')}</button><button class="tb" data-hold="engine">${t('ENG')}</button><button class="tb" data-hold="brake">${t('BRAKE')}</button>
      </div>
      <div class="t-fb"><button class="tb tiny" data-tap="gear" aria-label="${t('Gear up / down (amphibian)')}">${t('GEAR')}</button><button class="tb tiny" data-tap="scoop" aria-label="${t('Scoop probes up / down (Fire Boss)')}">${t('SCOOP')}</button></div>
      <div class="t-flaps"><button class="tb pill" data-tap="flapsDown">FLP+</button><button class="tb pill" data-tap="flapsUp">FLP−</button></div>
      <div class="t-trim"><button class="tb pill" data-hold="trimUp">TRIM+</button><button class="tb pill" data-hold="trimDown">TRIM−</button></div>
      <button class="t-strip" aria-label="${t('Show / hide the readouts')}"></button>
      <div class="t-top"><div class="t-look"><button data-look="1">${t('FREE')}</button><button data-look="0">${t('FIXED')}</button></div><button class="tb small cam" data-tap="camera" aria-label="${t('CAM')}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></button><button class="tb small" data-tap="map">${t('MAP')}</button><button class="tb small" data-tap="pause">II</button></div>
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
      this.walk.x = x; this.walk.y = y; // walking joystick when on foot
      if (this.game.freeRoam?.active) return;
      v.roll = x;
      v.pitch = y; // drag down = stick back = nose up
    };
    // Held for a while, the stick turns more transparent (the view behind it
    // matters more than the ring once the thumb is on it).
    let fade = null;
    stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; stick.setPointerCapture(e.pointerId); setStick(e); clearTimeout(fade); fade = setTimeout(() => stick.classList.add('faded'), 1500); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) setStick(e); });
    const endStick = (e) => { if (e.pointerId !== sid) return; clearTimeout(fade); stick.classList.remove('faded'); sid = null; this.walk.x = this.walk.y = 0; v.roll = 0; v.pitch = 0; knob.style.transform = ''; };
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);
    const thr = this.el.querySelector('.t-thr'), thrBar = thr.querySelector('span');
    let tid = null;
    // With reverse available (turboprop, a wheel on the ground) the lowest
    // REV_K of the slider is the reverse range: dragging below the idle mark
    // runs the lever back into reverse, deeper = more reverse.
    const REV_K = 0.22;
    const revFill = thr.querySelector('.rev-fill');
    const setThr = (e) => {
      const r = thr.getBoundingClientRect();
      const y = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
      const revOk = thr.classList.contains('rev-ok');
      if (revOk && y < REV_K) {
        v.throttle = 0; v.reverse = (REV_K - y) / REV_K;
        thrBar.style.height = '0%'; revFill.style.height = `${v.reverse * REV_K * 100}%`;
      } else {
        const t = revOk ? (y - REV_K) / (1 - REV_K) : y;
        v.throttle = t; v.reverse = 0;
        thrBar.style.height = `${t * (revOk ? (1 - REV_K) : 1) * 100}%`; revFill.style.height = '0%';
      }
    };
    thr.addEventListener('pointerdown', (e) => { tid = e.pointerId; thr.setPointerCapture(e.pointerId); setThr(e); });
    thr.addEventListener('pointermove', (e) => { if (e.pointerId === tid) setThr(e); });
    // Released, the lever stays where it was left (forward or in reverse).
    thr.addEventListener('pointerup', (e) => { if (e.pointerId === tid) { tid = null; v.throttle = null; v.reverse = null; } });
    for (const b of this.el.querySelectorAll('[data-hold]')) {
      const k = b.dataset.hold;
      const set = (on) => {
        b.classList.toggle('down', on);
        if (k === 'brake') v.brake = on;
        if (k === 'engine') v.engine = on;
        if (k === 'yawL') v.yaw = on ? -1 : 0;
        if (k === 'yawR') v.yaw = on ? 1 : 0;
        if (k === 'trimUp' || k === 'trimDown') input[on ? 'pressAction' : 'releaseAction'](k);
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
    // Small button beside the readout strip: hides it / brings it back.
    this.stripBtn = this.el.querySelector('.t-strip');
    this.stripBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); game.setSetting('touchStrip', game.settings.touchStrip === false); this.applySettings(); });
    this.tiltBtn = this.el.querySelector('[data-tilt]');
    this.tiltBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.startTilt(true); });
    this.neutral = null;
    this.tilt = { x: 0, y: 0 };
    // Turning the phone changes which axis is which: the neutral pose is taken again.
    screen.orientation?.addEventListener?.('change', () => { this.neutral = null; });
    window.addEventListener('orientationchange', () => { this.neutral = null; });
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
    this._eff = null; // class set again in update()
    for (const m of ['stick', 'tilt', 'buttons']) this.el.classList.toggle(`m-${m}`, m === mode);
    const strip = s.touchStrip !== false;
    this.game.uiRoot.classList.toggle('strip-off', !strip);
    this.stripBtn.textContent = strip ? '›' : '‹';
    this.stripBtn.classList.toggle('off', !strip);
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
      // 22° from the neutral pose is full deflection at Normal; the setting scales that range (input only, not the physics).
      const span = 22 / Math.max(0.4, Math.min(2.5, +this.game.settings.tiltSens || 1));
      const f = (d) => { d = Math.abs(d) < 3 ? 0 : d - Math.sign(d) * 3; return Math.max(-1, Math.min(1, d / span)); };
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
    // In flight the buttons turn more transparent (not hidden).
    this.el.classList.toggle('flying', !!this.game.aircraft && !this.game.aircraft.fm.out.onGround);
    // Keep the little button just right of the strip (or centred when it is hidden).
    if ((this._pl = (this._pl || 0) + 1) % 20 === 0 || this._pl === 1) {
      const ro = this.game.uiRoot.querySelector('.readouts'), r = ro?.getBoundingClientRect();
      this.stripBtn.style.left = r && r.width ? `${r.right + 6}px` : '';
    }
    if (this.game.playing && !this._wasPlaying) this.neutral = null;
    this._wasPlaying = this.game.playing;
    // Tilt without a usable sensor (none, permission refused, or never answering) falls back to the
    // virtual stick, so the flight is never left without pitch and roll.
    const eff = this.mode === 'tilt' && this.tiltState === 'none' ? 'stick' : this.mode;
    if (eff !== this._eff) {
      for (const m of ['stick', 'tilt', 'buttons']) this.el.classList.toggle(`m-${m}`, m === eff);
      if (eff === 'stick' && this.mode === 'tilt' && this.game.playing) this.game.toast?.(t('Tilt sensor unavailable: using the virtual stick.'));
      this._eff = eff;
    }
    if (this.mode === 'tilt') {
      if (this._tiltOn && this.tiltState === 'on' && !this._gotTilt && (this._tiltT = (this._tiltT || 0) + 1) > 240) this._setTiltState('none');
    }
    if (eff === 'tilt') {
      const v = this.game.input.virtual;
      v.roll = this.tilt.x; v.pitch = this.tilt.y;
      this.tiltBtn.querySelector('u').style.transform = `translate(${this.tilt.x * 36}px, 0)`;
    }
    const fm = this.game.aircraft?.fm;
    const v = this.game.input.virtual;
    // The right slider is the throttle in the airplanes, the collective in the helicopter.
    const ac = this.game.aircraft;
    const lev = ac?.kind === 'heli' ? ac.lever : fm?.throttle;
    const thrEl = (this.thrEl ??= this.el.querySelector('.t-thr'));
    const revOk = ac?.kind !== 'heli' && !!ac?.reverseOk;
    thrEl.classList.toggle('rev-ok', revOk);
    if (fm && (v.throttle === null || v.throttle === undefined)) {
      const k = revOk ? 0.22 : 0;
      thrEl.querySelector('span').style.height = `${lev * (1 - k) * 100}%`;
      thrEl.querySelector('.rev-fill').style.height = `${(fm.reverse ?? 0) * k * 100}%`;
    }
    this.el.querySelector('[data-tap=spray]').classList.toggle('on', !!this.game.sprayer?.on);
    // Fire Boss only, and only in the air: gear and scoop-probe buttons (the U and T keys on a PC).
    const ws = this.game.aircraft?.water;
    this.fbEl ??= this.el.querySelector('.t-fb');
    // The scoop button stays while the Fire Boss is flying OR afloat (probes are switched on / off on the water);
    // the gear button only in the air.
    const air = !!fm && !fm.out.onGround, afloat = !!fm && !!fm.out.onWater;
    this.fbEl.classList.toggle('show', !!ws && (air || afloat));
    this.fbEl.querySelector('[data-tap=gear]').style.display = air || !afloat ? '' : 'none';
    if (ws && fm) {
      this.fbEl.querySelector('[data-tap=gear]').classList.toggle('on', !!fm.gearCmd);
      this.fbEl.querySelector('[data-tap=scoop]').classList.toggle('on', !!ws.probesCmd);
    }
    // On foot: only the stick (as the walking joystick) and the top bar stay.
    this.el.classList.toggle('on-foot', !!this.game.freeRoam?.active);
    this.el.classList.toggle('hidden', !this.game.playing);
    this.el.style.display = this.game.playing ? '' : 'none';
  }
}
