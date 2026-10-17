// Node harness for the helicopter model: flat ground, optional wind.
import { Vector3 } from 'three';
import { HeliModel } from '../src/flight/heliModel.js';
import { FLIGHT_R44 } from '../src/config.js';

export function makeEnv({ ground = 0, crop = 0, wind = [0, 0, 0] } = {}) {
  return {
    wind: new Vector3(...wind),
    ground: () => ground,
    normal: (x, z, out) => { out.x = 0; out.y = 1; out.z = 0; return out; },
    surface: () => 'dirt',
    cropHeight: () => crop,
    top: () => ground + crop,
  };
}

export function makeHeli({ fuel = 80, hopper = 0, engineOn = false, alt = 0, heading = 0, speed = 0 } = {}) {
  const fm = new HeliModel(FLIGHT_R44);
  fm.fuel = fuel; fm.hopper = hopper; fm.updateMass();
  const env = makeEnv();
  if (engineOn) fm.reset(new Vector3(0, alt, 0), heading, { engineOn: true, speed });
  else fm.settleOnGround(0, 0, heading, env);
  fm.fuel = fuel; fm.hopper = hopper; fm.updateMass();
  return { fm, env };
}

export const DT = FLIGHT_R44.sim.dt;
export const pitchOf = (fm) => { const f = new Vector3(0, 0, 1).applyQuaternion(fm.quat); return Math.asin(f.y); };
export const bankOf = (fm) => { const l = new Vector3(1, 0, 0).applyQuaternion(fm.quat); return Math.asin(l.y); };
