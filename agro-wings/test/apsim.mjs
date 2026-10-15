// Headless autopilot simulation (Node): debug the test pilot quickly.
import * as THREE from 'three';
import { getTerrain } from './harness.mjs';
import { Aircraft } from '../src/aircraft/aircraft.js';
import { Autopilot } from '../src/game/autopilot.js';
import { Sprayer } from '../src/spray/sprayer.js';
import { Guidance } from '../src/spray/guidance.js';
import { Job, CONTRACTS } from '../src/game/contracts.js';
import { createVegetation, makeTreeCollider } from '../src/world/vegetation.js';
import { POWERLINE } from '../src/world/layout.js';
import { QUALITY } from '../src/config.js';

let obstacles = null;
function buildObstacles(terrain) {
  if (obstacles) return obstacles;
  const veg = createVegetation(terrain, QUALITY.low);
  const hit = makeTreeCollider(veg);
  const wires = [];
  const pts = POWERLINE.points.map(([x, z]) => ({ x, z, y: terrain.heightAt(x, z) }));
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    for (let k = 0; k < 12; k++) {
      const t0 = k / 12, t1 = (k + 1) / 12;
      const y = (t) => a.y + (b.y - a.y) * t + POWERLINE.height - 0.1 - POWERLINE.sag * 4 * t * (1 - t);
      wires.push({ a: [a.x + (b.x - a.x) * t0, y(t0), a.z + (b.z - a.z) * t0], b: [a.x + (b.x - a.x) * t1, y(t1), a.z + (b.z - a.z) * t1] });
    }
  }
  obstacles = {
    obstacleAt: (x, y, z) => { const th = terrain.heightAt(x, z); return y - th > 40 ? null : hit(x, y, z, th); },
    wireDistance: (x, y, z) => {
      let best = 1e9;
      for (const w of wires) {
        const [ax, ay, az] = w.a, [bx, by, bz] = w.b;
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        let t = ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / (dx * dx + dy * dy + dz * dz);
        t = Math.max(0, Math.min(1, t));
        best = Math.min(best, Math.hypot(ax + dx * t - x, ay + dy * t - y, az + dz * t - z));
      }
      return best;
    },
  };
  return obstacles;
}

export function makeGame(contractId = 'soy') {
  const terrain = getTerrain();
  const virtual = { active: true, pitch: 0, roll: 0, yaw: 0, throttle: null, brake: false, engine: false };
  const game = {
    world: { terrain, ...buildObstacles(terrain) },
    scene: { add() {} },
    toasts: [],
    toast(m) { this.toasts.push(m); },
    audio: null,
    input: { virtual, isDown: () => false, wasPressed: () => false, gamepad: null },
    service: { busy: () => false, inZone: () => false },
    controlsLocked: false,
  };
  game.aircraft = new Aircraft(game, { headless: true });
  game.sprayer = new Sprayer(game);
  game.guidance = new Guidance(game);
  game.job = new Job(CONTRACTS.find((c) => c.id === contractId));
  game.guidance.setJob(game.job);
  game.sprayer.setTargets(game.job.coverages);
  game.aircraft.onSimStep = (h) => game.sprayer.step(h);
  game.requestService = () => {};
  return game;
}

export function run(game, seconds, { log = 10, dt = 1 / 60, startPhase = 'lineup' } = {}) {
  const ap = new Autopilot(game);
  ap.engage('contract');
  const ac = game.aircraft;
  ac.placeOnRunway('west');
  ac.fm.engine = 'running'; ac.fm.rpm = 800;
  ac.fm.fuel = 160; ac.fm.hopper = +(process.env.HOP ?? game.job.c.recommended.liquid);
  ap.set(startPhase);
  let next = 0;
  const mouse = { buttons: 0, dx: 0, dy: 0, wheel: 0 };
  for (let t = 0; t < seconds; t += dt) {
    ap.update(dt);
    ac.update(dt, game.input, { mouse, assist: 'normal', windScale: 1, cameraMode: 'chase' });
    game.guidance.update(dt);
    if (t >= next) {
      next += log;
      const fm = ac.fm, o = fm.out, s = game.job.stats();
      console.log(`${t.toFixed(0).padStart(4)} ${String(ap.phase).padEnd(8)} x${fm.pos.x.toFixed(0).padStart(6)} z${fm.pos.z.toFixed(0).padStart(6)} agl ${o.agl.toFixed(1).padStart(5)} hgt ${ac.workHeight().toFixed(1).padStart(5)} ${(o.airspeed * 1.944).toFixed(0)}kt bank ${(ap.att.bank * 57.3).toFixed(0).padStart(4)} spray ${game.sprayer.on ? 'ON ' : 'off'} hop ${fm.hopper.toFixed(0).padStart(4)} cov ${(s.coverage * 100).toFixed(1)}% pass ${ap.pass ? ap.pass.k : '-'} dir ${ap.passDir ?? ''} ${ac.state}`);
    }
    if (ap.phase === 'service' && process.env.REFILL && !game.job.complete()) {
      // Stand-in for the badeco in the Node sim: reload, then carry on.
      ac.fm.fuel = 160; ac.fm.hopper = game.job.c.recommended.liquid; ac.fm.updateMass();
      game.job.sorties++;
      console.log(`---- reload at t=${t.toFixed(0)} (coverage ${(game.job.stats().coverage * 100).toFixed(1)}%)`);
      ap.set('start');
    }
    if (ac.state !== 'ok' || ap.phase === 'done' || (ap.phase === 'service' && !process.env.REFILL) || (ap.phase === 'service' && game.job.complete())) break;
  }
  return ap;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const g = makeGame(process.argv[2] || 'soy');
  const ap = run(g, +(process.argv[3] || 300), { log: +(process.argv[4] || 10) });
  console.log(ap.log.map((l) => `${l.t}:${l.phase}`).join(' '));
  const ac = g.aircraft;
  console.log('final', ac.state, ac.crashReason || '', 'pos', ac.fm.pos.x.toFixed(0), ac.fm.pos.y.toFixed(1), ac.fm.pos.z.toFixed(0), 'cov', (g.job.stats().coverage * 100).toFixed(1));
  console.log(g.toasts.slice(-10));
}
void THREE;
