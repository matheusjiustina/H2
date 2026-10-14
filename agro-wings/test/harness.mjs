// Headless flight harness: real terrain + flight model + assist, fixed 120 Hz.
import { Vector3 } from 'three';
import { FlightModel } from '../src/flight/flightModel.js';
import { Assist } from '../src/flight/assist.js';
import { createFlightEnv, windAt } from '../src/flight/env.js';
import { TerrainData } from '../src/world/terrainData.js';
import { FLIGHT } from '../src/config.js';

globalThis.performance ??= { now: () => Date.now() };

let terrainSingleton = null;
export function getTerrain() {
  terrainSingleton ??= new TerrainData();
  return terrainSingleton;
}

export function makeSim({ wind = true, hopper = 0, fuel = 200 } = {}) {
  const terrain = getTerrain();
  const env = createFlightEnv(terrain);
  const fm = new FlightModel();
  fm.fuel = fuel;
  fm.hopper = hopper;
  fm.updateMass();
  const assist = new Assist();
  const sim = {
    terrain, env, fm, assist, t: 0, wind,
    step(n = 1, cmd = { pitch: 0, roll: 0, yaw: 0 }, mode = 'normal') {
      for (let i = 0; i < n; i++) {
        if (sim.wind) windAt(env.wind, sim.t, fm.pos, fm.out.agl);
        else env.wind.set(0, 0, 0);
        assist.update(fm, cmd, mode, FLIGHT.sim.dt);
        fm.step(FLIGHT.sim.dt, env);
        sim.events.push(...fm.events);
        sim.t += FLIGHT.sim.dt;
      }
    },
    events: [],
    att() { return FlightModel.attitude(fm, {}); },
  };
  return sim;
}

export const deg = (r) => (r * 180) / Math.PI;
export { Vector3 };
