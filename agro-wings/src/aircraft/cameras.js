// Cameras: damped chase (Tidemark-style follow, tuned to show the ground
// ahead and ride smoothly through turns), cockpit with engine/terrain
// vibration and head look, and a free external orbit camera.
import * as THREE from 'three';
import { clamp, damp, smoothstep } from '../core/math.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const Y = new THREE.Vector3(0, 1, 0);
const FLIP = new THREE.Quaternion().setFromAxisAngle(Y, Math.PI);

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'chase';
    this.chasePos = new THREE.Vector3();
    this.chaseLook = new THREE.Vector3();
    this.chaseDir = new THREE.Vector3(0, 0, 1);
    this.chaseOffset = new THREE.Vector3(0, 3.7, -12.5);
    this.chaseLookOffset = new THREE.Vector3(0, -0.4, 20);
    this.look = { yaw: 0, pitch: -0.3 };
    this.chaseOff = { yaw: 0, pitch: 0 };
    this.orbit = { yaw: 2.3, pitch: 0.22, dist: 16 };
    // Scroll zoom (1 = default view): cockpit field of view / head position,
    // chase distance.
    this.zoom = { cockpit: 1, chase: 1 };
    this.shake = 0;
    this.initialized = false;
  }

  setMode(m, aircraft) {
    this.mode = m;
    if (m === 'cockpit') { this.look.yaw = 0; this.look.pitch = -0.3; }
    if (m === 'orbit' && aircraft) {
      const f = aircraft.forward(_v);
      this.orbit.yaw = Math.atan2(f.x, f.z) + Math.PI * 0.75;
    }
    this.initialized = false;
  }

  update(dt, ac, mouse, terrain) {
    const cam = this.camera;
    const pos = ac.rPos, quat = ac.rQuat, fm = ac.fm, o = fm.out;
    const C = ac.type?.camera ?? { dist: 12.5, height: 3.7 };
    const vib = ac.type?.anim.vib ?? [1500, 2700];
    ac.model.pilot.visible = this.mode !== 'cockpit';
    ac.model.cockpit.visible = true;
    const dragLook = mouse.buttons & 1;
    if (mouse.wheel) {
      // Scroll up zooms in, down zooms out (limited).
      if (this.mode === 'cockpit') this.zoom.cockpit = clamp(this.zoom.cockpit * (1 + mouse.wheel * 0.1), 0.35, 1.12);
      else if (this.mode === 'chase') this.zoom.chase = clamp(this.zoom.chase * (1 + mouse.wheel * 0.1), 0.6, 1.4);
    }
    if (this.mode === 'cockpit') {
      if (dragLook) {
        this.look.yaw = clamp(this.look.yaw - mouse.dx * 1.6, -2.6, 2.6);
        this.look.pitch = clamp(this.look.pitch - mouse.dy * 1.6, -1.1, 0.9);
      }
      // Vibration: engine (rpm) + ground roughness; g-load sinks the head.
      const eng = fm.rpm > 300 ? 0.0009 + 0.0008 * smoothstep(vib[0], vib[1], fm.rpm) * (ac.A?.turbine ? 0.5 : 1) : 0;
      const ground = o.onGround ? 0.004 * smoothstep(1, 25, o.groundSpeed) * (o.surface === 'runway' ? 0.6 : 1) : 0;
      // Engine/ground vibration and the g head-sink scale with the player's
      // "Cockpit shake" setting (0 = off); the crash jolt always plays.
      const ks = this.shakeScale ?? 1;
      const amp = (eng + ground) * ks + this.shake * 0.02;
      _v.copy(ac.model.eye);
      if (ac.kind === 'heli') {
        // Two-per-rev shake of the teetering rotor: strongest through
        // translational lift (~15–25 kt), rising again at high speed and in
        // settling with power; follows the real rotor phase.
        const pct = o.rotorPct / 100, kt = o.airspeed * 1.943844;
        const etl = Math.exp(-((kt - 20) ** 2) / 50);
        const hv = pct > 0.2 ? (0.0005 + 0.0018 * etl + 0.0014 * smoothstep(85, 125, kt) + 0.0012 * (o.vrs ?? 0)) * Math.min(1, pct) * (o.onGround ? 0.5 : 1) : 0;
        const ph = fm.rotorAngle * 2;
        _v.y += Math.sin(ph) * hv * ks;
        _v.x += Math.sin(ph + 1.3) * hv * 0.6 * ks;
      }
      _v.y -= clamp((o.gLoad - 1) * 0.02, -0.04, 0.05) * Math.min(1, ks * 1.5);
      _v.x += (Math.random() - 0.5) * amp;
      _v.y += (Math.random() - 0.5) * amp;
      cam.position.copy(_v.applyQuaternion(quat).add(pos));
      cam.quaternion.copy(quat).multiply(FLIP);
      _e.set(this.look.pitch, this.look.yaw, 0, 'YXZ');
      cam.quaternion.multiply(_q.setFromEuler(_e));
      this._fov(70 * this.zoom.cockpit, dt);
    } else if (this.mode === 'chase') {
      const fwd = _v.set(0, 0, 1).applyQuaternion(quat);
      // Follow the flight path when flying (shows where you are going),
      // the nose when slow/on the ground.
      const vel = fm.vel;
      const sp = vel.length();
      // A helicopter flies sideways and backwards: follow the nose.
      const w = C.noseOnly ? 0 : smoothstep(8, 25, sp) * (o.onGround ? 0.3 : 1);
      _v2.copy(fwd);
      if (sp > 1) _v2.lerp(_v.copy(vel).divideScalar(sp), w * 0.7);
      _v2.y *= 0.55;
      _v2.normalize();
      if (!this.initialized) this.chaseDir.copy(_v2);
      this.chaseDir.lerp(_v2, 1 - Math.exp(-3.2 * dt)).normalize();
      if (dragLook) {
        this.chaseOff.yaw -= mouse.dx * 1.6;
        this.chaseOff.pitch = clamp(this.chaseOff.pitch + mouse.dy * 1.2, -0.5, 0.9);
      } else {
        this.chaseOff.yaw = damp(this.chaseOff.yaw, 0, 1.5, dt);
        this.chaseOff.pitch = damp(this.chaseOff.pitch, 0, 1.5, dt);
      }
      _v.copy(this.chaseDir).applyAxisAngle(Y, this.chaseOff.yaw);
      // Smooth the camera offset relative to the aircraft (not its world
      // position), so the camera does not fall behind at spraying speed.
      const dist = (C.dist + smoothstep(30, 60, sp) * 1.5) * this.zoom.chase;
      const off = _v2.copy(_v).multiplyScalar(-dist);
      off.y += C.height * this.zoom.chase + this.chaseOff.pitch * 8;
      if (!this.initialized) this.chaseOffset.copy(off);
      else this.chaseOffset.lerp(off, 1 - Math.exp(-5 * dt));
      this.chasePos.copy(pos).add(this.chaseOffset);
      // Look well ahead of the aircraft so the ground in front stays in view.
      const lookOff = _v.copy(this.chaseDir).multiplyScalar(20);
      lookOff.y -= 0.4;
      if (!this.initialized) this.chaseLookOffset.copy(lookOff);
      else this.chaseLookOffset.lerp(lookOff, 1 - Math.exp(-8 * dt));
      this.chaseLook.copy(pos).add(this.chaseLookOffset);
      this._ground(terrain);
      cam.position.copy(this.chasePos);
      cam.up.copy(Y);
      cam.lookAt(this.chaseLook);
      this._fov(62, dt);
    } else {
      if (dragLook) {
        this.orbit.yaw -= mouse.dx * 1.8;
        this.orbit.pitch = clamp(this.orbit.pitch + mouse.dy * 1.4, -0.15, 1.4);
      }
      if (mouse.wheel) this.orbit.dist = clamp(this.orbit.dist * (1 + mouse.wheel * 0.1), 6, 90);
      const e = this.orbit;
      this.chasePos.set(Math.sin(e.yaw) * Math.cos(e.pitch), Math.sin(e.pitch), Math.cos(e.yaw) * Math.cos(e.pitch)).multiplyScalar(e.dist).add(pos);
      this.chasePos.y += 0.8;
      this._ground(terrain);
      cam.position.copy(this.chasePos);
      cam.up.copy(Y);
      cam.lookAt(_v.copy(pos).add(_v2.set(0, 0.6, 0)));
      this._fov(55, dt);
    }
    this.initialized = true;
    this.shake = Math.max(0, this.shake - dt * 2);
    cam.near = this.mode === 'cockpit' ? 0.05 : 0.3;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  _ground(terrain) {
    const g = terrain.heightAt(this.chasePos.x, this.chasePos.z) + 1.2;
    if (this.chasePos.y < g) this.chasePos.y = g;
  }

  _fov(target, dt) {
    this.camera.fov = damp(this.camera.fov, target, 6, dt);
  }
}
