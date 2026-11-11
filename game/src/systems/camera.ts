import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/util';
import type { Game } from '../game';

const v = new THREE.Vector3();
const frustum = new THREE.Frustum();
const pm = new THREE.Matrix4();

export class CameraRig {
  yaw = Math.PI;
  pitch = 0.3;
  zoom = 1;
  shake = 0;
  private dist = 7;
  private idle = 0;
  private target = new THREE.Vector3();
  private inited = false;
  /** Cinematic override: fixed position + look target. */
  cine: { pos: THREE.Vector3; look: THREE.Vector3; fov?: number } | null = null;
  fov = 62;

  constructor(private g: Game) {}

  /** Unit direction the camera looks along on the ground plane. */
  get fx() {
    return Math.sin(this.yaw);
  }
  get fz() {
    return Math.cos(this.yaw);
  }

  snap() {
    this.inited = false;
  }

  sees(x: number, y: number, z: number): boolean {
    return frustum.containsPoint(v.set(x, y, z));
  }

  update(dt: number) {
    const g = this.g, cam = g.camera, p = g.player, inp = g.input;
    if (this.cine) {
      cam.position.lerp(this.cine.pos, 1 - Math.exp(-3 * dt));
      this.target.lerp(this.cine.look, 1 - Math.exp(-5 * dt));
      cam.lookAt(this.target);
      cam.fov = damp(cam.fov, this.cine.fov ?? 55, 4, dt);
      cam.updateProjectionMatrix();
      this.finish();
      return;
    }
    const look = inp.look(dt);
    const sens = 0.0026 * g.save.settings.sensitivity;
    if (look.x !== 0 || look.y !== 0) this.idle = 0;
    else this.idle += dt;
    this.yaw -= look.x * sens;
    this.pitch = clamp(this.pitch + look.y * sens * (g.save.settings.invertY ? -1 : 1), -0.55, 1.4);
    if (inp.wheel) this.zoom = clamp(this.zoom + inp.wheel * 0.12, 0.55, 1.9);

    const veh = p.vehicle;
    let wantDist = 5.6, height = 1.6, wantFov = 62, side = 0;
    if (p.state === 'chute') {
      wantDist = 13;
      height = 2.5;
      wantFov = 70;
    } else if (veh) {
      const sp = Math.abs(veh.speed);
      const c = veh.spec.cls;
      wantDist = c === 'heli' ? 16 : c === 'boat' ? 11 : c === 'bike' ? 6.5 : 7.6 + veh.spec.len * 0.35;
      height = c === 'heli' ? 3 : 1.9;
      wantFov = 64 + clamp(sp * 0.42, 0, 20);
      // drift back behind the vehicle when the player is not steering the camera
      if (this.idle > 1.1 && sp > 3) {
        this.yaw = dampAngle(this.yaw, veh.heading + (veh.speed < -1 ? Math.PI : 0), 2.2, dt);
        this.pitch = damp(this.pitch, c === 'heli' ? 0.34 : 0.24, 1.5, dt);
      }
    } else if (p.aiming) {
      wantDist = 2.7;
      height = 1.62;
      wantFov = 50;
      side = 0.62;
    } else if (p.sprinting) wantFov = 68;
    wantDist *= this.zoom;
    this.dist = damp(this.dist, wantDist, 6, dt);

    const px = veh ? veh.x : p.pos.x, py = (veh ? veh.y : p.pos.y) + height, pz = veh ? veh.z : p.pos.z;
    if (!this.inited) {
      this.target.set(px, py, pz);
      this.inited = true;
    }
    // follow tightly horizontally, a touch softer vertically (stairs, kerbs)
    this.target.x = damp(this.target.x, px, 26, dt);
    this.target.z = damp(this.target.z, pz, 26, dt);
    this.target.y = damp(this.target.y, py, 12, dt);
    const cp = Math.cos(this.pitch), sp2 = Math.sin(this.pitch);
    // right vector of the view = (-fz, fx)
    const tx = this.target.x + -this.fz * side, tz = this.target.z + this.fx * side, ty = this.target.y;
    let cx = tx - this.fx * cp * this.dist, cy = ty + sp2 * this.dist, cz = tz - this.fz * cp * this.dist;
    const clip = g.world.cameraClip(tx, ty, tz, cx, cy, cz);
    if (clip < 1) {
      cx = tx + (cx - tx) * clip;
      cy = ty + (cy - ty) * clip;
      cz = tz + (cz - tz) * clip;
    }
    if (this.shake > 0.001) {
      cx += (Math.random() - 0.5) * this.shake;
      cy += (Math.random() - 0.5) * this.shake;
      cz += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-6 * dt);
    }
    cam.position.set(cx, cy, cz);
    cam.lookAt(tx, ty + (p.aiming ? 0 : 0.2), tz);
    this.fov = damp(this.fov, wantFov, 5, dt);
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
    this.finish();
  }

  private finish() {
    const cam = this.g.camera;
    cam.updateMatrixWorld();
    pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pm);
  }
}
