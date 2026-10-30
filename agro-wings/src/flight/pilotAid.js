// Pilot aids (Settings → Assistance → On): small helps between the player's
// keys and the controls. They never limit an angle, never hold an attitude,
// never move a control the player is not moving and never fly the aircraft:
// the physics is the same with them on or off, and a full key still gives
// full travel in the air. They act after the raw control mapping
// (Assist / HeliAssist in 'off').
//   Airplane: pedal  — on the ground the pedal comes in progressively, with
//                      less travel as the speed builds (take-off and landing
//                      roll), plus a light yaw damper against ground loops;
//             smooth — expo on stick and roll (fine near the centre, full at
//                      the stop);
//             coord  — a little rudder against the sideslip in the air;
//             cues   — warnings: the minimum speed for the weight and bank,
//                      not enough energy to finish a climb (game.warnings).
//   Helicopter: torque — the anti-torque pedal the shaft torque needs, fed
//                        forward (detailed rotor model; the power model has
//                        no torque to hold);
//               sas    — rate damper on pitch, roll and yaw (the aircraft
//                        still drifts and still needs the pilot: it only
//                        slows the divergence down);
//               smooth — expo on the cyclic;
//               cues   — warnings: drift over the ground in a hover, ground
//                        effect.
import { clamp } from '../core/math.js';

export const PLANE_AIDS = ['pedal', 'smooth', 'coord', 'cues'];
export const HELI_AIDS = ['torque', 'sas', 'smooth', 'cues'];
export const allAids = (keys) => Object.fromEntries(keys.map((k) => [k, true]));

const G = 9.81, RHO = 1.225;
// Expo: slope (1 − k) at the centre, 1 at the stop.
export const expo = (x, k) => (1 - k) * x + k * x * x * x;

// Airplane. `cmd` is what Assist 'off' just mapped to the surfaces.
export function planeAid(fm, cmd, aid) {
  const o = fm.out;
  const flying = !o.onGround && o.agl > 0.8;
  if (flying) {
    if (aid.smooth) {
      fm.elevator = clamp(expo(cmd.pitch, 0.45), -1, 1);
      fm.aileron = clamp(expo(cmd.roll, 0.4), -1, 1);
    }
    if (aid.coord) fm.rudder = clamp(fm.rudder + o.beta * 1.6 + fm.omega.y * 0.3, -1, 1);
  } else if (o.onGround && aid.pedal) {
    // Full pedal at a walk, half of it from ~45 m/s (the rudder has all the
    // authority it needs there; the tailwheel's own steering is unchanged).
    const k = clamp(1 - Math.max(0, o.groundSpeed - 5) / 40, 0.5, 1);
    fm.rudder = clamp(expo(cmd.yaw, 0.5) * k + fm.omega.y * 0.7, -1, 1);
  }
}

// Minimum flying speed (m/s) for the present weight, flaps and load factor.
export function minSpeed(fm, n = 1) {
  const A = fm.A;
  const clMax = A.CL0 + A.CLa * A.alphaStall + A.CLflap * fm.flaps;
  return Math.sqrt((2 * fm.mass * G * Math.max(1, n)) / (RHO * A.wingArea * Math.max(0.3, clMax)));
}

// Rate damper gains (control travel per rad/s).
export const SAS = { lon: 1.0, lat: 0.8, yaw: 0.4 };

// Helicopter. `cmd` is what HeliAssist 'off' just mapped to the controls.
export function heliAid(fm, cmd, aid, assist) {
  const o = fm.out;
  if (aid.smooth) {
    fm.cyclicLon = clamp(-expo(cmd.pitch, 0.4) * 0.85, -1, 1);
    fm.cyclicLat = clamp(expo(cmd.roll, 0.4) * 0.85, -1, 1);
  }
  const T = fm.A.aidTrim;
  if (aid.torque && T && fm.powerModel !== 'power' && fm.shaftTorque > 0) {
    // Centred pedal and cyclic sit at the hover trim for the torque now
    // being drawn (fading in with it: nothing with the lever down).
    const w = clamp(fm.shaftTorque / T.q0, 0, 1);
    fm.pedal = clamp(fm.pedal + (T.ped[0] + T.ped[1] * fm.shaftTorque) * w, -1, 1);
    fm.cyclicLat = clamp(fm.cyclicLat + T.lat * w, -1, 1);
  }
  if (aid.sas && !o.onGround) {
    fm.cyclicLon = clamp(fm.cyclicLon - fm.omega.x * SAS.lon, -1, 1);
    fm.cyclicLat = clamp(fm.cyclicLat - fm.omega.z * SAS.lat, -1, 1);
    fm.pedal = clamp(fm.pedal + fm.omega.y * SAS.yaw, -1, 1);
  }
}
