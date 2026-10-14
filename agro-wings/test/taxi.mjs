import { makeSim, deg } from './harness.mjs';
const sim = makeSim({ hopper: 800, fuel: 160, wind: true });
const { fm } = sim;
fm.settleOnGround(-352, -64, Math.PI / 2, sim.env);
fm.engine = 'running'; fm.rpm = 700; fm.parkBrake = false;
sim.step(120);
for (const yaw of [1, -1]) {
  fm.settleOnGround(-352, -64, Math.PI / 2, sim.env); fm.engine = 'running'; fm.rpm = 700;
  const h0 = fm.heading();
  for (let i = 0; i < 120 * 8; i++) { fm.throttle = 0.35; sim.step(1, { pitch: 0.4, roll: 0, yaw }); }
  console.log(`yaw ${yaw}: heading change ${deg(fm.heading() - h0).toFixed(0)}° (positive = left), speed ${fm.out.groundSpeed.toFixed(1)} m/s, pos ${fm.pos.x.toFixed(0)},${fm.pos.z.toFixed(0)}`);
}
