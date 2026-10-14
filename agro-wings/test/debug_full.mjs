import { makeSim, deg } from './harness.mjs';
import { KT } from '../src/core/math.js';
const sim = makeSim({ hopper: 900, fuel: 200 });
const { fm } = sim;
fm.settleOnGround(-385, 0, Math.PI / 2, sim.env);
sim.step(240);
fm.engine = 'running'; fm.rpm = 900; fm.flapsCmd = fm.flaps = 1 / 3;
const cmd = { pitch: 0, roll: 0, yaw: 0 };
for (let i = 0; i < 120 * 40; i++) {
  fm.throttle = Math.min(1, fm.throttle + 0.55 / 120);
  const hdgErr = Math.PI / 2 - fm.heading();
  cmd.yaw = Math.max(-1, Math.min(1, -hdgErr * 3 + fm.omega.y * 1.5));
  const v = fm.out.airspeed;
  if (v < 14) cmd.pitch = 0; else if (v < 31) cmd.pitch = -0.15; else cmd.pitch = 0.35;
  sim.step(1, cmd);
  if (i % 120 === 0) {
    const a = sim.att();
    console.log(`t=${(i/120).toFixed(0)} x=${fm.pos.x.toFixed(0)} z=${fm.pos.z.toFixed(1)} v=${(v*KT).toFixed(0)}kt thr=${fm.out.thrust.toFixed(0)} pitch=${deg(a.pitch).toFixed(1)} hdg=${deg(fm.heading()).toFixed(1)} agl=${fm.out.agl.toFixed(2)} wheels=${fm.out.wheelsOnGround} surf=${fm.out.surface} crop=${fm.out.cropDepth.toFixed(2)} rud=${fm.rudder.toFixed(2)} elev=${fm.elevator.toFixed(2)}`);
  }
}
