// BADECO service truck: the farm's support tanker (calda + fuel) waits in its
// bay by the crew post. When the aircraft is parked for service it drives to
// a loading stand off the service-side wingtip, the badeco runs the hoses
// from its rear reels, then it backs out and returns to the bay.
//
// Driving: kinematic bicycle model (rear-axle reference, 5.3 m wheelbase,
// 0.6 rad steering lock, rate-limited steering), pure-pursuit path tracking
// with accel/brake limits and corner/stop speed limits. Paths come from the
// hybrid A* planner (forward + reverse arcs) around the static colliders and
// the aircraft footprints, so it never drives through an aircraft; a live
// look-ahead check brakes it if anything is in the way anyway.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tanker, wheelGeometry, wheelSet, PartCollector, vehicleLod } from '../world/vehicles.js';
import { makeSoftDot, makeLabel } from '../core/textures.js';
import { ApronPlanner } from './planner.js';
import { BASE } from '../world/layout.js';
import { clamp, damp } from '../core/math.js';

export const TRUCK = {
  wheelBase: 5.275, // steer axle to tandem centre
  axleZ: -2.175, // rear-axle reference in the model frame (tandem centre)
  maxSteer: 0.6,
  steerRate: 0.9, // rad/s
  turnRadius: 9.2, // planning radius (> 5.275 / tan 0.6 = 7.7 m)
  vMax: 4.2, vRev: 1.5, accel: 0.9, brake: 2.2, latAcc: 1.1,
  // Footprint: circles along the heading from the rear axle (covers the
  // 2.46 m wide, 8.2 m long body with margin).
  circles: [-0.6, 1.4, 3.4, 5.4], radius: 1.62,
  rear: -1.55, front: 6.48, halfWidth: 1.25, height: 3.5,
  // Bay by the crew post (rear-axle pose), facing west or east.
  home: { x: BASE.truck.x, z: BASE.truck.z, yaw: BASE.truck.heading },
  lead: 10, // straight lead-in to the loading stand, m
};

// Apron plus the grass east and north of it (room to turn at the helipad).
const PLAN_BOUNDS = { x0: -402, x1: -280, z0: -110, z1: -28 };
const _e = new THREE.Euler();

function buildTruckModel(Mworld) {
  // Own light materials (the world's lens/amber/tail materials are shared by
  // every static vehicle and must not light up with this one).
  const M = { ...Mworld };
  M.lens = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.3, emissive: 0xfff1d6, emissiveIntensity: 0 });
  M.tailLens = new THREE.MeshStandardMaterial({ color: 0x9c1a14, roughness: 0.35, emissive: 0xff2010, emissiveIntensity: 0 });
  M.amber = new THREE.MeshStandardMaterial({ color: 0xff7a14, roughness: 0.4, emissive: 0xff8a1a, emissiveIntensity: 0 });
  const root = new THREE.Group();
  root.name = 'serviceTruck';
  const body = new THREE.Group();
  root.add(body);
  const C = new PartCollector();
  const lay = tanker(C, M, 0, 0, 0, 0, { dynamic: true });
  // Rear reels: fuel (black hose, left) and calda (blue hose, right), pump.
  const reelGeo = new THREE.TorusGeometry(0.3, 0.075, 8, 18);
  const reelZ = lay.rearZ + 0.42;
  const reels = { fuel: new THREE.Vector3(0.78, 1.25, reelZ - 0.1), mix: new THREE.Vector3(-0.78, 1.25, reelZ - 0.1) };
  for (const [k, p] of Object.entries(reels)) {
    C.addRaw(reelGeo.clone().rotateY(Math.PI / 2).translate(p.x, p.y, p.z + 0.08), k === 'fuel' ? M.hoseBlack : M.blueDark);
  }
  C.addRaw(new THREE.BoxGeometry(0.42, 0.38, 0.32).translate(0, 0.88, reelZ - 0.05), M.red); // pump
  // Beacon on the cab roof, side decals.
  C.addRaw(new THREE.CylinderGeometry(0.08, 0.1, 0.08, 10).translate(0, lay.cabTop + 0.02, 3.6), M.plasticBlack);
  const detail = C.build(body, [M.paintWhite, M.alu, M.plasticBlack]);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.13, 12), M.amber);
  beacon.position.set(0, lay.cabTop + 0.13, 3.6);
  body.add(beacon);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeSoftDot(), color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  glow.scale.setScalar(1.6);
  glow.position.copy(beacon.position);
  body.add(glow);
  const decal = new THREE.MeshStandardMaterial({ map: makeLabel('BADECO · APOIO AGRÍCOLA', { w: 1024, h: 128, bg: '#c9cdd0', fg: '#1f4f2a', font: 'bold 64px Arial' }), roughness: 0.35, metalness: 0.4 });
  const decals = new THREE.Mesh(mergeGeometries([-1, 1].map((s) => new THREE.PlaneGeometry(3.4, 0.42).rotateY(s * Math.PI / 2).translate(s * 1.185, 2.42, -1.0))), decal);
  body.add(decals);
  detail.push(decals, beacon, glow);
  // Wheels: one vertex-coloured geometry per axle type, one mesh each.
  const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.15 });
  const setWheels = wheelSet(root, lay.wheels, wheelGeometry(0.5, 0.3, false), wheelGeometry(0.5, 0.28, true), wheelMat);
  setWheels(0, 0);
  return { root, body, setWheels, beacon, glow, reels, M, reelZ, detail };
}

export class ServiceTruck {
  constructor(game) {
    this.game = game;
    const world = game.world;
    this.model = buildTruckModel(world.structures.M);
    game.scene.add(this.model.root);
    const statics = world.structures.colliders
      .filter((c) => c.x1 > PLAN_BOUNDS.x0 && c.x0 < PLAN_BOUNDS.x1 && c.z1 > PLAN_BOUNDS.z0 && c.z0 < PLAN_BOUNDS.z1)
      .map((c) => ({ x0: c.x0 - 0.3, x1: c.x1 + 0.3, z0: c.z0 - 0.3, z1: c.z1 + 0.3 }));
    const cp = BASE.crewPost, pad = BASE.pad;
    statics.push({ x0: cp.x - 2.3, x1: cp.x + 2.3, z0: cp.z - 1.7, z1: cp.z + 1.7 }); // crew shade
    statics.push({ x0: pad.x + 8.6, x1: pad.x + 9.4, z0: pad.z - 0.8, z1: pad.z + 0.8 }); // stop board
    // Small props the truck used to drive over: the pad's corner tyres, the
    // drums by the mixing station, the extinguisher stand at the fuel slab.
    for (const [dx, dz] of [[-7, -6], [7, -6], [-7, 6], [7, 6]]) statics.push({ x0: pad.x + dx - 0.6, x1: pad.x + dx + 0.6, z0: pad.z + dz - 0.6, z1: pad.z + dz + 0.6 });
    const mt = BASE.mixTank, ft = BASE.fuelTank;
    statics.push({ x0: mt.x + 2.2, x1: mt.x + 4.9, z0: mt.z - 2.2, z1: mt.z + 0.8 }); // drums
    statics.push({ x0: ft.x - 5.4, x1: ft.x - 3.8, z0: ft.z + 0.9, z1: ft.z + 2.5 }); // extinguisher
    this.planner = new ApronPlanner(PLAN_BOUNDS, statics);
    // State: rear-axle pose, speed, steering.
    const h = TRUCK.home;
    this.x = h.x; this.z = h.z; this.yaw = h.yaw;
    this.v = 0; this.steer = 0; this.acc = 0;
    this.state = 'home'; // home | driving | parked | blocked
    this.purpose = null; // 'stand' | 'home'
    this.path = null;
    this.idx = 0;
    this.wheelAngle = 0;
    this.pitch = 0; this.roll = 0;
    this.engineOn = false;
    this.engineT = 0;
    this.beaconOn = false;
    this.blockedT = 0;
    this.lights = 0;
    this._place();
  }

  // Straight back into the bay (crash recovery), engine off.
  resetHome() {
    const h = TRUCK.home;
    this.x = h.x; this.z = h.z; this.yaw = h.yaw;
    this.v = 0; this.steer = 0; this.acc = 0;
    this.state = 'home'; this.purpose = 'home'; this.job = null; this.path = null; this.planFailed = false;
    this.engineOn = false; this.beaconOn = false; this.blockedT = 0;
    this._place();
  }

  get atHome() { return this.state === 'home'; }
  get parkedAtStand() { return this.state === 'parked' && this.purpose === 'stand'; }

  // Ground rectangles of the aircraft (yaw only) for planning.
  // walk: the badeco walks under overhead boxes (a stopped rotor disc).
  _aircraftRects(margin = 0.8, walk = false) {
    const out = [];
    for (const ac of Object.values(this.game.fleet || {})) {
      const yaw = ac.fm.heading();
      const c = Math.cos(yaw), s = Math.sin(yaw);
      for (const [x0, x1, y0, , z0, z1] of ac.type.bounds) {
        if (walk && y0 > (ac.type.overhead ?? 1e9)) continue;
        const lx = (x0 + x1) / 2, lz = (z0 + z1) / 2;
        // Body +X -> (cos yaw, -sin yaw); +Z -> (sin yaw, cos yaw).
        out.push({ cx: ac.fm.pos.x + lx * c + lz * s, cz: ac.fm.pos.z - lx * s + lz * c, hx: (x1 - x0) / 2 + margin, hz: (z1 - z0) / 2 + margin, yaw });
      }
    }
    return out;
  }

  // Loading stand for the aircraft: off the service-side wingtip, truck facing
  // aft, its rear (reels) level with the wing leading edge.
  standFor(ac, side, lzRear = 0.6) {
    const yaw = ac.fm.heading();
    const half = Math.max(...ac.type.bounds.map((b) => Math.max(Math.abs(b[0]), Math.abs(b[1]))));
    // Gap from the widest part (wing tip, or the rotor disc of a helicopter).
    const lx = side * (half + TRUCK.halfWidth + (ac.type.service.standGap ?? 1.45));
    // lzRear: truck rear bumper, aircraft frame (+Z forward).
    const az = lzRear + TRUCK.rear; // its rear axle is 1.55 m further aft
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const tyaw = yaw + Math.PI;
    return { x: ac.fm.pos.x + lx * c + az * s, z: ac.fm.pos.z - lx * s + az * c, yaw: Math.atan2(Math.sin(tyaw), Math.cos(tyaw)) };
  }

  _rectKey(margin) {
    return margin + ':' + Object.values(this.game.fleet || {}).map((ac) => `${ac.fm.pos.x.toFixed(1)},${ac.fm.pos.z.toFixed(1)},${ac.fm.heading().toFixed(2)}`).join(';');
  }

  // A second clearance grid over the same area for the badeco's walks.
  makeWalkPlanner() { return new ApronPlanner(PLAN_BOUNDS, this.planner.staticBoxes); }

  // Look for a loading stand: preferred side first, then the other side and
  // stands a little further aft/forward. The search runs over the next frames
  // (a few ms each); returns false at once if no stand is even clear.
  dispatch(ac, side) {
    this.planner.build(this._aircraftRects(), this._rectKey(0.8));
    const cands = [];
    for (const sd of [side, -side]) {
      for (const lzRear of [0.6, -2.0, 2.4]) {
        const S = this.standFor(ac, sd, lzRear);
        const fx = Math.sin(S.yaw), fz = Math.cos(S.yaw);
        let ok = true;
        // Stand, lead-in and its midpoint must be clear before searching.
        for (const t of [0, 0.5, 1]) if (!this.planner.poseFree(S.x - fx * TRUCK.lead * t, S.z - fz * TRUCK.lead * t, S.yaw, TRUCK.circles, TRUCK.radius)) ok = false;
        if (ok) cands.push({ S, Q: { x: S.x - fx * TRUCK.lead, z: S.z - fz * TRUCK.lead, yaw: S.yaw }, side: sd });
      }
    }
    if (!cands.length) return false;
    this.planFailed = false;
    // Helicopter: the stands are well off the rotor disc on either side;
    // try the other side early (one side can need a long three-point turn).
    const pick = ac.kind === 'heli'
      ? [cands.find((c) => c.side === side), cands.find((c) => c.side !== side), cands.filter((c) => c.side === side)[1]].filter(Boolean)
      : cands.slice(0, 3);
    this.job = { purpose: 'stand', cands: pick, i: 0, it: null, best: null, maxNodes: ac.kind === 'heli' ? 90000 : 40000 };
    this.state = 'planning';
    this.engineOn = true;
    this.beaconOn = true;
    return true;
  }

  // Back out and return to the bay, entered facing either way (both straight
  // lead-ins are searched, the shorter drive wins).
  recall() {
    if (this.state === 'home' || this.job?.purpose === 'home') return;
    const h = TRUCK.home;
    // Still in the bay (e.g. aborted while planning): just stay.
    if (Math.hypot(this.x - h.x, this.z - h.z) < 1 && Math.abs(Math.sin(this.yaw - h.yaw)) < 0.2) {
      this.job = null; this.state = 'home'; this.purpose = 'home'; this.v = 0;
      return;
    }
    this.planner.build(this._aircraftRects(), this._rectKey(0.8));
    const cands = [h.yaw, h.yaw + Math.PI].map((yaw) => {
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      return { S: { x: h.x, z: h.z, yaw }, Q: { x: h.x - fx * 7, z: h.z - fz * 7, yaw } };
    });
    this.job = { purpose: 'home', cands, i: 0, it: null, best: null, all: true, maxNodes: 30000 };
    this.state = 'planning';
    this.engineOn = true;
    this.beaconOn = true;
  }

  _plan(budgetMs) {
    const J = this.job;
    // Come to a stop before planning from here.
    if (Math.abs(this.v) > 0.05) return;
    while (budgetMs > 0 && J.i < J.cands.length) {
      const c = J.cands[J.i];
      J.it ??= this.planner.vehicleSearch(this._pose(), c.Q, TRUCK, { maxNodes: J.maxNodes });
      const t0 = performance.now();
      const r = J.it.step(budgetMs);
      budgetMs -= performance.now() - t0;
      if (!r.done) return;
      J.it = null;
      J.i++;
      if (r.path) {
        appendStraight(r.path, c.S);
        if (!J.best || r.path[r.path.length - 1].s < J.best.path[J.best.path.length - 1].s) J.best = { path: r.path, c };
        if (!J.all) break; // stands are in order of preference
      }
    }
    if (J.best && (!J.all || J.i >= J.cands.length)) {
      this.job = null;
      if (J.purpose === 'stand') { this.stand = J.best.c.S; this.standSide = J.best.c.side; }
      this._start(J.best.path, J.purpose);
    } else if (J.i >= J.cands.length) {
      this.job = null;
      if (J.purpose === 'stand') { this.planFailed = true; this.state = 'home'; } else { this.state = 'blocked'; this.purpose = 'home'; this.blockedT = 0; }
    }
  }

  _pose() { return { x: this.x, z: this.z, yaw: this.yaw }; }

  _start(path, purpose) {
    this.path = path;
    this.purpose = purpose;
    this.idx = 0;
    this.seg = 0;
    this.state = 'driving';
    this.engineOn = true;
    this.beaconOn = true;
    this.blockedT = 0;
    // Cumulative length; direction changes split the path into legs.
    let s = 0;
    path[0].s = 0;
    for (let i = 1; i < path.length; i++) {
      s += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
      path[i].s = s;
    }
    this.legs = splitLegs(path);
    this.leg = 0;
  }

  // Distance-based queries for the service and the aircraft collision.
  hitTest(x, y, z) {
    if (y - this.model.root.position.y > TRUCK.height + 0.2) return false;
    const dx = x - this.x, dz = z - this.z;
    if (dx * dx + dz * dz > 100) return false;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const lz = dx * s + dz * c, lx = dx * c - dz * s;
    return Math.abs(lx) < TRUCK.halfWidth + 0.05 && lz > TRUCK.rear - 0.05 && lz < TRUCK.front + 0.05;
  }

  // Ground clearance helper for walking around the parked truck.
  rectDistance(x, z) {
    const dx = x - this.x, dz = z - this.z;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const lz = dx * s + dz * c, lx = dx * c - dz * s;
    const ox = Math.max(0, Math.abs(lx) - TRUCK.halfWidth);
    const oz = Math.max(0, TRUCK.rear - lz, lz - TRUCK.front);
    return Math.hypot(ox, oz);
  }

  reelWorld(kind, out) { return this.model.root.localToWorld(out.copy(this.model.reels[kind])); }
  // Where the badeco stands to take a hose: behind the rear bumper.
  reelAccess(kind) {
    const r = this.model.reels[kind];
    return this.model.root.localToWorld(new THREE.Vector3(r.x, 0, this.model.reelZ - 1.0));
  }

  audioState(cam) {
    const d = Math.hypot(cam.x - this.x, cam.y - 1.5, cam.z - this.z);
    return { on: this.engineOn, rev: clamp(Math.abs(this.v) / TRUCK.vMax * 0.7 + Math.max(0, this.acc) * 0.3, 0, 1), load: clamp(Math.abs(this.acc) / TRUCK.accel, 0, 1), att: 1 / (1 + d / 12) };
  }

  update(dt) {
    if (this.state === 'driving') this._drive(dt);
    else {
      if (this.state === 'planning') this._plan(this.planBudget ?? 3);
      this.v = damp(this.v, 0, 6, dt);
      this.acc = 0;
      if (this.state === 'blocked') {
        this.blockedT += dt;
        if (this.blockedT > 2 && this.purpose === 'home') { this.blockedT = 0; this.recall(); }
      }
    }
    // Engine idles a few seconds after parking at home, then shuts off.
    if (this.state === 'home') { this.engineT += dt; if (this.engineT > 4) { this.engineOn = false; this.beaconOn = false; } } else this.engineT = 0;
    this._animate(dt);
    this._place();
  }

  _drive(dt) {
    const leg = this.legs[this.leg];
    const P = this.path;
    const dir = P[leg.end].dir;
    // Nearest point on this leg, searching forward.
    let best = this.idx, bd = Infinity;
    for (let i = Math.max(leg.start, this.idx); i <= Math.min(leg.end, this.idx + 12); i++) {
      const d = (P[i].x - this.x) ** 2 + (P[i].z - this.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    this.idx = best;
    // Distance left on this leg, measured along the leg's final direction near
    // its end (negative once past it).
    const E = P[leg.end];
    const ex = Math.sin(E.yaw) * dir, ez = Math.cos(E.yaw) * dir;
    const proj = (E.x - this.x) * ex + (E.z - this.z) * ez;
    const remaining = P[leg.end].s - P[best].s > 3 ? P[leg.end].s - P[best].s : proj;
    // Pure pursuit target.
    const Ld = Math.max(2.8, Math.abs(this.v) * 1.1 + 2.2);
    let ti = best;
    while (ti < leg.end && P[ti].s - P[best].s < Ld) ti++;
    let tx = P[ti].x, tz = P[ti].z;
    if (ti === leg.end) {
      // Extend past the end along the final heading so the approach stays straight.
      const ext = Ld - (P[leg.end].s - P[best].s);
      tx += Math.sin(P[leg.end].yaw) * dir * Math.max(0, ext);
      tz += Math.cos(P[leg.end].yaw) * dir * Math.max(0, ext);
    }
    const motionYaw = dir > 0 ? this.yaw : this.yaw + Math.PI;
    let alpha = Math.atan2(tx - this.x, tz - this.z) - motionYaw;
    alpha = Math.atan2(Math.sin(alpha), Math.cos(alpha));
    const dist = Math.max(1, Math.hypot(tx - this.x, tz - this.z));
    const kappa = (2 * Math.sin(alpha)) / dist; // curvature of the motion path
    const want = clamp(Math.atan(kappa * TRUCK.wheelBase) * dir, -TRUCK.maxSteer, TRUCK.maxSteer);
    this.steer += clamp(want - this.steer, -TRUCK.steerRate * dt, TRUCK.steerRate * dt);
    // Speed: limit, corners, stopping distance at the end of the leg.
    const vmax = dir > 0 ? TRUCK.vMax : TRUCK.vRev;
    const kAbs = Math.abs(Math.tan(this.steer)) / TRUCK.wheelBase;
    let vt = Math.min(vmax, Math.sqrt(TRUCK.latAcc / Math.max(kAbs, 1e-3)), Math.sqrt(2 * 0.9 * Math.max(0, remaining - 0.05)));
    // Live look-ahead: brake for anything in the way (aircraft, crew).
    if (this._obstructed(dir)) { vt = 0; this.blockedT += dt; } else this.blockedT = 0;
    const sp = Math.abs(this.v);
    const a = clamp((vt - sp) * 2.5, -TRUCK.brake, TRUCK.accel);
    const nsp = Math.max(0, sp + a * dt);
    this.acc = (nsp - sp) / Math.max(dt, 1e-4);
    this.v = nsp * dir;
    // Kinematic bicycle (rear axle reference).
    const ds = this.v * dt;
    const ym = this.yaw + (ds * Math.tan(this.steer)) / TRUCK.wheelBase * 0.5;
    this.x += Math.sin(ym) * ds;
    this.z += Math.cos(ym) * ds;
    this.yaw += (ds * Math.tan(this.steer)) / TRUCK.wheelBase;
    this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
    // Leg finished: at (or just past) its end and nearly stopped.
    if (remaining < 0.15 && nsp < 0.4) {
      this.v = 0;
      if (this.leg < this.legs.length - 1) { this.leg++; this.idx = this.legs[this.leg].start; return; }
      this.state = this.purpose === 'home' ? 'home' : 'parked';
      this.steer = damp(this.steer, 0, 2, dt);
    }
    if (this.blockedT > 8) { this.state = 'blocked'; this.blockedT = 0; }
  }

  _obstructed(dir) {
    const look = 1.0 + Math.abs(this.v) * 0.9;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const edge = dir > 0 ? TRUCK.front + look : TRUCK.rear - look;
    const ex = this.x + s * edge, ez = this.z + c * edge;
    for (const ox of [-TRUCK.halfWidth, 0, TRUCK.halfWidth]) {
      const px = ex + c * ox, pz = ez - s * ox;
      for (const ac of Object.values(this.game.fleet || {})) {
        for (const y of [0.6, 1.4, 2.3]) if (ac.hitTest(px, (ac.fm.pos.y - ac.fm.out.agl) + y, pz)) return true;
      }
      const b = this.game.service?.badeco?.pos;
      if (b && Math.hypot(b.x - px, b.z - pz) < 1.0) return true;
    }
    return false;
  }

  _animate(dt) {
    const m = this.model;
    if (this.v !== 0 || this._lastSteer !== this.steer) {
      this.wheelAngle += (this.v * dt) / 0.5;
      m.setWheels(this.wheelAngle, this.steer * 0.95);
      this._lastSteer = this.steer;
    }
    // Body pitch with accel/brake, roll in turns (suspension).
    const lat = this.v * this.v * Math.tan(this.steer) / TRUCK.wheelBase;
    this.pitch = damp(this.pitch, clamp(-this.acc * 0.006 * Math.sign(this.v || 1), -0.02, 0.02), 4, dt);
    this.roll = damp(this.roll, clamp(-lat * 0.012, -0.03, 0.03), 4, dt);
    m.body.rotation.set(this.pitch, 0, this.roll);
    // Beacon (rotating amber: double flash ~1.3 Hz), brake/reverse lights, headlights in low light.
    const t = this.game.time;
    const ph = (t * 1.3) % 1;
    const flash = this.beaconOn ? Math.max(0, Math.cos(ph * Math.PI * 2)) ** 6 : 0;
    m.M.amber.emissiveIntensity = this.beaconOn ? 0.6 + 3.2 * flash : 0;
    m.glow.material.opacity = flash * 0.85;
    const braking = this.state === 'driving' && (this.acc < -0.3 || Math.abs(this.v) < 0.05);
    m.M.tailLens.emissiveIntensity = this.engineOn ? (braking ? 2.4 : 0.5) : 0;
    const dark = this.game.world.atmo?.cur.light ?? 1;
    m.M.lens.emissiveIntensity = this.engineOn && dark < 0.8 ? 1.6 : 0;
  }

  _place() {
    const m = this.model;
    // Model origin sits 2.175 m ahead of the rear axle.
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const ox = this.x - fx * TRUCK.axleZ, oz = this.z - fz * TRUCK.axleZ;
    const H = this.game.world.terrain;
    const hF = H.heightAt(ox + fx * 3, oz + fz * 3), hR = H.heightAt(ox - fx * 2, oz - fz * 2);
    m.root.position.set(ox, (hF + hR) / 2, oz);
    _e.set(-Math.atan2(hF - hR, 5), this.yaw, 0, 'YXZ');
    m.root.quaternion.setFromEuler(_e);
    m.root.updateMatrixWorld(true);
  }

  // Far away: skip drawing (it is a few pixels beyond ~900 m).
  cull(cam) {
    vehicleLod(this.model.root, this.model.detail, cam, 220, 900, this.model.setWheels.meshes);
  }
}

// Straight forward lead-in from the end of a planned path to an exact pose.
function appendStraight(p, S) {
  const last = p[p.length - 1];
  const n = Math.ceil(Math.hypot(S.x - last.x, S.z - last.z) / 0.5);
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    p.push({ x: last.x + (S.x - last.x) * t, z: last.z + (S.z - last.z) * t, yaw: S.yaw, dir: 1 });
  }
  p[p.length - 1].s = s + Math.hypot(S.x - last.x, S.z - last.z);
}

function splitLegs(path) {
  const legs = [];
  let start = 0;
  for (let i = 1; i < path.length; i++) {
    const last = i === path.length - 1;
    if (last || path[i + 1].dir !== path[i].dir) {
      legs.push({ start, end: i });
      start = i;
    }
  }
  if (!legs.length) legs.push({ start: 0, end: path.length - 1 });
  return legs;
}
