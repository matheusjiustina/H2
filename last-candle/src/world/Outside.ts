import * as THREE from "three";
import { fx } from "../core/rng";
import { cyl, plane, rbox } from "./geometry";
import { L } from "./layout";
import { colorMat, materials } from "./materials";
import * as T from "./textures";

/**
 * The rainy street outside the glass: backdrop, sidewalk, falling rain,
 * droplets on the glass, an occasional passing car and lightning.
 */
export class Outside {
  readonly group = new THREE.Group();
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private rainVel: Float32Array;
  private readonly N = 1400;
  private glass: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private car: THREE.Group;
  private carT = -1;
  private nextCar = 18;
  private flash = 0;
  private nextFlash = 40;
  intensity = 0.7; // 0..1
  private targetIntensity = 0.7;

  constructor(
    scene: THREE.Scene,
    private streetLight: THREE.SpotLight,
    private carLight: THREE.PointLight,
  ) {
    scene.add(this.group);
    const m = materials();
    // backdrop (far facade across the street)
    const back = new THREE.Mesh(plane(34, 17), new THREE.MeshBasicMaterial({ map: T.streetTex(), toneMapped: true, color: "#9a9aa0" }));
    back.position.set(0, 5.2, 14);
    back.rotation.y = Math.PI;
    this.group.add(back);
    // sidewalk + curb + road
    const sidewalk = new THREE.Mesh(rbox(30, 0.12, 3.0, 0.01), colorMat("#3a3a3c", 0.35, 0.1));
    sidewalk.position.set(0, -0.06, 1.5);
    sidewalk.receiveShadow = true;
    this.group.add(sidewalk);
    const road = new THREE.Mesh(plane(30, 11), new THREE.MeshStandardMaterial({ color: "#141518", roughness: 0.18, metalness: 0.2 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.12, 8.5);
    this.group.add(road);
    const curb = new THREE.Mesh(rbox(30, 0.14, 0.18, 0.02), colorMat("#55555a", 0.6));
    curb.position.set(0, -0.06, 3.0);
    this.group.add(curb);
    // street lamp
    const pole = new THREE.Mesh(cyl(0.06, 0.08, 5.4, 10), m.darkGrey);
    pole.position.set(-1.5, 2.6, 5.0);
    this.group.add(pole);
    const arm = new THREE.Mesh(rbox(0.08, 0.08, 0.9, 0.02), m.darkGrey);
    arm.position.set(-1.5, 5.25, 5.4);
    this.group.add(arm);
    const head = new THREE.Mesh(rbox(0.35, 0.12, 0.5, 0.04), m.darkGrey);
    head.position.set(-1.5, 5.2, 5.8);
    this.group.add(head);
    const glow = new THREE.Mesh(plane(0.3, 0.42), new THREE.MeshBasicMaterial({ color: "#ffb060", toneMapped: false }));
    glow.rotation.x = Math.PI / 2;
    glow.position.set(-1.5, 5.13, 5.8);
    this.group.add(glow);
    // parked scooter silhouette
    const scooter = new THREE.Group();
    scooter.position.set(2.6, 0, 2.2);
    const body = new THREE.Mesh(rbox(0.3, 0.45, 1.2, 0.12), colorMat("#5a2f2a", 0.4));
    body.position.y = 0.45;
    scooter.add(body);
    for (const z of [-0.5, 0.5]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.07, 8, 16), m.rubber);
      wheel.position.set(0, 0.2, z);
      wheel.rotation.y = Math.PI / 2;
      scooter.add(wheel);
    }
    this.group.add(scooter);

    // rain streaks
    this.rainPos = new Float32Array(this.N * 6);
    this.rainVel = new Float32Array(this.N);
    for (let i = 0; i < this.N; i++) this.spawnDrop(i, true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: "#aab4c4", transparent: true, opacity: 0.38 }));
    this.rain.frustumCulled = false;
    this.group.add(this.rain);

    // droplets running down the inside view of the glass
    const tex = T.rainGlassTex();
    this.glass = new THREE.Mesh(plane(L.halfW * 2, 2.8), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.6, depthWrite: false }));
    this.glass.position.set(0, 1.85, 0.03);
    this.glass.rotation.y = Math.PI;
    this.glass.renderOrder = 4;
    this.group.add(this.glass);

    // passing car
    this.car = new THREE.Group();
    const carBody = new THREE.Mesh(rbox(4.0, 0.7, 1.7, 0.2), colorMat("#1c1d22", 0.3, 0.4));
    carBody.position.y = 0.55;
    this.car.add(carBody);
    const cabin = new THREE.Mesh(rbox(2.0, 0.55, 1.5, 0.2), colorMat("#121317", 0.2, 0.3));
    cabin.position.set(-0.2, 1.1, 0);
    this.car.add(cabin);
    for (const z of [-0.6, 0.6]) {
      const hl = new THREE.Mesh(plane(0.25, 0.12), new THREE.MeshBasicMaterial({ color: "#f4f6ff", toneMapped: false, side: THREE.DoubleSide }));
      hl.position.set(2.01, 0.6, z);
      hl.rotation.y = Math.PI / 2;
      this.car.add(hl);
      const tl = new THREE.Mesh(plane(0.2, 0.1), new THREE.MeshBasicMaterial({ color: "#ff2a1a", toneMapped: false, side: THREE.DoubleSide }));
      tl.position.set(-2.01, 0.65, z);
      tl.rotation.y = Math.PI / 2;
      this.car.add(tl);
    }
    this.car.position.set(-30, 0, 6.5);
    this.group.add(this.car);
  }

  private spawnDrop(i: number, anywhere: boolean) {
    const x = fx.range(-9, 9);
    const z = fx.range(0.35, 10);
    const y = anywhere ? fx.range(-0.1, 7) : fx.range(6, 7.5);
    const len = fx.range(0.25, 0.45);
    const o = i * 6;
    this.rainPos[o] = x;
    this.rainPos[o + 1] = y;
    this.rainPos[o + 2] = z;
    this.rainPos[o + 3] = x + 0.04;
    this.rainPos[o + 4] = y - len;
    this.rainPos[o + 5] = z;
    this.rainVel[i] = fx.range(7, 10);
  }

  setTargetIntensity(v: number) {
    this.targetIntensity = Math.min(1, Math.max(0.15, v));
  }

  /** Short lightning flash (used for heavy rain). */
  lightning() {
    this.flash = 1;
  }

  update(dt: number) {
    this.intensity += (this.targetIntensity - this.intensity) * Math.min(1, dt * 0.15);
    const active = Math.floor(this.N * (0.25 + 0.75 * this.intensity));
    const p = this.rainPos;
    for (let i = 0; i < this.N; i++) {
      const o = i * 6;
      if (i >= active) {
        p[o + 1] = -50;
        p[o + 4] = -50;
        continue;
      }
      if (p[o + 1] < -40) this.spawnDrop(i, false);
      const dy = this.rainVel[i] * dt * (0.8 + this.intensity * 0.4);
      p[o + 1] -= dy;
      p[o + 4] -= dy;
      p[o] += dt * 0.25;
      p[o + 3] += dt * 0.25;
      if (p[o + 4] < -0.1) this.spawnDrop(i, false);
    }
    (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.rain.material as THREE.LineBasicMaterial).opacity = 0.18 + 0.3 * this.intensity;
    const map = this.glass.material.map!;
    map.offset.y -= dt * 0.012 * (0.5 + this.intensity);
    this.glass.material.opacity = 0.25 + 0.45 * this.intensity;

    // car pass
    this.nextCar -= dt;
    if (this.carT < 0 && this.nextCar <= 0) {
      this.carT = 0;
      this.nextCar = fx.range(35, 70);
    }
    if (this.carT >= 0) {
      this.carT += dt;
      const x = -18 + this.carT * 9;
      this.car.position.x = x;
      this.carLight.position.set(x + 2.5, 0.9, 5.5);
      const near = Math.max(0, 1 - Math.abs(x + 1) / 9);
      this.carLight.intensity = 18 * near;
      if (x > 18) {
        this.carT = -1;
        this.carLight.intensity = 0;
      }
    }

    // lightning when it pours
    this.nextFlash -= dt;
    if (this.intensity > 0.85 && this.nextFlash <= 0) {
      this.nextFlash = fx.range(25, 60);
      this.flash = 1;
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 3.5);
      const f = this.flash > 0.6 ? 1 : this.flash > 0.4 ? 0.2 : this.flash > 0.2 ? 0.8 : this.flash;
      this.streetLight.color.setRGB(1, 0.62 + f * 0.38, 0.29 + f * 0.71);
      this.streetLight.intensity = 22 + f * 140;
    } else {
      this.streetLight.color.set("#ff9f4a");
      this.streetLight.intensity = 22;
    }
  }

  /** True during the brightest part of a flash — used to trigger thunder audio. */
  get flashing(): number {
    return this.flash;
  }
}
