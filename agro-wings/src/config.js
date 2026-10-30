// AGRO WINGS — central tuning file.
// Flight values started from the Tidemark floatplane model (same equations,
// same control laws) and were rescaled for a ~1.8 t low-wing agricultural
// taildragger with an Ipanema-like footprint. Everything that changes the
// feel of the game lives here so it can be adjusted without touching systems.

export const FLIGHT = {
  sim: { dt: 1 / 120, maxSubsteps: 12 },

  // Geometry & mass (body frame: +Z nose, +Y up, +X left wing).
  emptyMass: 1060, // airframe + oil
  mtow: 1800, // EMB-202 class maximum take-off mass (agricultural category)
  pilotMass: 85,
  wingArea: 19.9,
  span: 11.7,
  chord: 1.7,
  oswald: 0.8,
  // Inertia about pitch (X), yaw (Y), roll (Z) for the empty aircraft, kg·m².
  // Chosen so roll/pitch time constants sit close to Tidemark's (scaled by S·b²).
  inertiaEmpty: [2750, 3900, 2600],

  // Aerodynamics — coefficient names follow the Tidemark model.
  CL0: 0.3, CLa: 4.8, alphaStall: 0.27, alphaStallNeg: -0.21,
  CD0: 0.052, // booms, wire cutters and pump add drag over a clean airframe
  CDflap: 0.05, CLflap: 0.7,
  Cm0: 0.045, CmaWB: 0.25, CmaTail: -1.3, Cmq: -14, Cmde: 0.44, Cmflap: -0.05,
  Clb: -0.09, Clp: -0.5, Clr: 0.11, Clda: 0.085,
  Cnb: 0.085, Cnr: -0.17, Cndr: 0.08, Cnda: -0.012,
  CYb: -0.6, CYdr: 0.12,

  // Engine & propeller: EMB-202A Lycoming IO-540 on ethanol, 320 hp (the
  // alcohol engine gives ~7 % more than the 300 hp avgas one); climb-pitch
  // fixed prop, 2.2 m.
  staticThrust: 5600,
  maxPower: 239e3,
  propEfficiency: 0.72, // climb prop: less efficient at cruise speeds
  propRadius: 1.1,
  propPitchSpeed: 95, // m/s at max rpm (fixed-pitch prop advance limit)
  idleRpm: 650,
  maxRpm: 2700,
  fuelFlowFull: 105 / 3600, // L/s at full power (ethanol burns more than avgas)
  fuelBurnScale: 2.5, // gameplay compression so fuel planning matters on short flights
  fuelDensity: 0.79,

  // Tanks.
  fuelCapacity: 260, // L, two wing tanks
  hopperCapacity: 900, // L
  liquidDensity: 1.0,
  hopperOffsetZ: 0.25, // hopper centroid ahead of CG (m) — slightly nose-heavy when full
  fuelTankSpanY: 2.4, // lateral arm of wing tanks (adds roll inertia)

  // Landing gear (contact points at full extension, body frame). Tall
  // spring mains; the tailwheel on its spring under the tail cone, ahead
  // of the rudder: ~7° three-point attitude (side photos of the type).
  gear: [
    { name: 'mainL', p: [1.35, -1.43, 0.75], k: 95000, c: 9500, travel: 0.2, radius: 0.32, steer: false },
    { name: 'mainR', p: [-1.35, -1.43, 0.75], k: 95000, c: 9500, travel: 0.2, radius: 0.32, steer: false },
    { name: 'tail', p: [0, -0.82, -4.3], k: 28000, c: 2400, travel: 0.12, radius: 0.13, steer: true },
  ],
  rollingResistance: { runway: 0.035, dirt: 0.05, grass: 0.075, crop: 0.16 },
  brakeMu: 0.38,
  lateralMu: 0.75,
  tailSteer: 0.42, // rad at walking speed, fades with speed
  groundBump: { runway: 0.012, dirt: 0.025, grass: 0.04, crop: 0.05 },

  // Points that must never touch anything (crash / damage detection).
  hard: [
    { name: 'wingtipL', p: [5.85, 0.27, -0.05] },
    { name: 'wingtipR', p: [-5.85, 0.27, -0.05] },
    // Booms hang under the trailing edge and follow the 6° dihedral.
    { name: 'boomL', p: [4.9, 0.0, -0.95] },
    { name: 'boomR', p: [-4.9, 0.0, -0.95] },
    { name: 'prop', p: [0, -0.87, 2.37] },
    { name: 'spinner', p: [0, 0.2, 2.75] },
    { name: 'belly', p: [0, -0.45, 0.4] },
    { name: 'tail', p: [0, -0.3, -4.2] },
    { name: 'fin', p: [0, 1.38, -4.3] },
    { name: 'stabL', p: [1.8, 0.16, -3.8] },
    { name: 'stabR', p: [-1.8, 0.16, -3.8] },
    { name: 'roof', p: [0, 1.31, -1.1] },
  ],

  // Damage thresholds (m/s at contact).
  hardLandingVs: 2.6,
  crashVs: 5.0,

  // Geometry the shared systems need (CG to the main-wheel bottom, wing).
  wheelPoint: [0, -1.25, 0.75],
  aglOffset: 1.25,
  wingDrop: 0.55,
};

// ---------------------------------------------------------------------------
// Air Tractor AT-502B (second aircraft, own registration PR-AWT).
// Published figures used (Air Tractor / dealer spec sheets, Wikipedia AT-500
// family): P&WC PT6A-34AG 750 shp at 2,200 prop rpm; Hartzell 3-blade
// constant-speed prop, 2.82 m; span 52 ft (15.85 m); wing area 312 ft²
// (29.0 m²); empty ≈ 4,570 lb (2,073 kg); max take-off 9,400 lb (4,264 kg);
// hopper 500 US gal (1,893 L); fuel 170 US gal (643 L); stall 71 kt flaps up
// / 59 kt flaps down at 8,000 lb; climb 870 ft/min at 9,400 lb; working
// speed 120–145 mph.
// Derived here (not published): CLmax 1.50 / 2.18 from those stall speeds;
// CD0 0.058 with e 0.80 so that the 870 ft/min climb at 9,400 lb (sea level)
// and a 75 %-power cruise of 134 kt at 8,000 ft both come out of the same
// polar; inertias scaled from mass and size; static thrust ≈ 12.5 kN from
// momentum theory (figure of merit 0.64); fuel flow from a PT6A-34 specific
// consumption of ~0.6 lb/shp/h.
export const FLIGHT_AT502 = {
  ...FLIGHT,
  emptyMass: 2073,
  mtow: 4264,
  pilotMass: 85,
  wingArea: 29.0,
  span: 15.85,
  chord: 1.83,
  oswald: 0.8,
  inertiaEmpty: [9000, 12500, 8500],

  CL0: 0.28, CLa: 5.0, alphaStall: 0.244, alphaStallNeg: -0.2,
  CD0: 0.058,
  CDflap: 0.06, CLflap: 0.85,
  Cm0: 0.04, CmaWB: 0.25, CmaTail: -1.4, Cmq: -16, Cmde: 0.46, Cmflap: -0.06,
  Clb: -0.085, Clp: -0.52, Clr: 0.11, Clda: 0.08,
  Cnb: 0.09, Cnr: -0.18, Cndr: 0.075, Cnda: -0.012,
  CYb: -0.6, CYdr: 0.12,

  engineType: 'turboprop',
  maxPower: 559e3, // 750 shp, flat rated
  propRadius: 1.41,
  maxRpm: 2200, // governed prop rpm
  idleRpm: 1150, // prop on the fine stop at ground idle
  turbine: {
    idleNg: 53, maxNg: 101.5, // gas generator %
    accel: 14, decel: 22, // Ng %/s limits
    idleFrac: 0.022, // shaft power at ground idle
    lightoff: 3.2, // s of starter before fuel is introduced
    govFrac: 0.3, // power fraction at which the governor holds 2,200 rpm
    betaDrag: 2600, // N of braking thrust in beta (power lever at idle, on the ground)
    etaStatic: 0.64, // static figure of merit (≈ 12.5 kN static at 750 shp)
    etaCruise: 0.85, // propulsive efficiency of the constant-speed prop in climb/cruise
    discDrag: 0.1, // windmilling disc drag on the fine-pitch stop (flight idle)
    maxTorque: 1790, // ft·lb at 750 shp / 2,200 rpm
    flatSigma: 0.78, // density ratio down to which 750 shp is available
  },
  fuelFlowFull: 255 / 3600, // L/s at max power (Jet-A)
  fuelFlowIdle: 60 / 3600,
  fuelBurnScale: 2.5,
  fuelDensity: 0.8,

  fuelCapacity: 643,
  hopperCapacity: 1893,
  liquidDensity: 1.0,
  hopperOffsetZ: 0.3,
  fuelTankSpanY: 2.9,

  // Spring-steel main gear and a steerable tailwheel; ~10° three-point attitude.
  gear: [
    { name: 'mainL', p: [1.45, -1.62, 0.95], k: 190000, c: 19000, travel: 0.24, radius: 0.37, steer: false },
    { name: 'mainR', p: [-1.45, -1.62, 0.95], k: 190000, c: 19000, travel: 0.24, radius: 0.37, steer: false },
    { name: 'tail', p: [0, -0.48, -5.45], k: 52000, c: 4600, travel: 0.14, radius: 0.16, steer: true },
  ],
  brakeMu: 0.4,
  tailSteer: 0.36,

  hard: [
    { name: 'wingtipL', p: [7.95, 0.13, -0.3] },
    { name: 'wingtipR', p: [-7.95, 0.13, -0.3] },
    { name: 'boomL', p: [7.0, -0.17, -1.22] },
    { name: 'boomR', p: [-7.0, -0.17, -1.22] },
    { name: 'prop', p: [0, -1.12, 3.92] },
    { name: 'spinner', p: [0, 0.3, 4.32] },
    { name: 'belly', p: [0, -0.72, 0.45] },
    { name: 'tail', p: [0, 0.18, -5.62] },
    { name: 'fin', p: [0, 2.35, -5.45] },
    { name: 'stabL', p: [2.75, 0.42, -5.55] },
    { name: 'stabR', p: [-2.75, 0.42, -5.55] },
    { name: 'roof', p: [0, 1.91, -1.0] },
  ],
  hardLandingVs: 3.0,
  crashVs: 5.5,

  wheelPoint: [0, -1.45, 0.95],
  aglOffset: 1.45,
  wingDrop: 0.6,
  // The assist's rate loops act through a heavier, larger airframe.
  assistGain: { pitch: 2.0, roll: 1.5 },
  assistSpeedScale: 1.28, // stall speed ratio to the PR-AGW at max weight
};

export const SPRAY_AT502 = {
  // Longer boom (≈ 14 m) and bigger pump: a swath scaled from the AT-502's
  // real ~21 m the same way as the PR-AGW's, and the flow that gives the same
  // dose as the PR-AGW at a 60 m/s (117 kt) working speed.
  swath: 30,
  flow: 6.4,
};

// ---------------------------------------------------------------------------
// PZL-Mielec M-18B Dromader (third airplane, fictional registration PR-DMD).
// Published figures used (Jane's via Wikipedia, flugzeuginfo, PZL data
// sheets): span 17.70 m; length 9.47 m; height 3.70 m; wing area 40.0 m²;
// empty 2,710 kg; maximum take-off 5,300 kg (agricultural, restricted
// category); PZL-Kalisz ASz-62IR-M18 nine-cylinder supercharged radial,
// 980 hp (731 kW) for take-off at 2,200 rpm, 0.687 reduction gear to a
// four-blade constant-speed propeller; hopper 2,500 L (2,200 kg dry);
// fuel 712 L (≈ 510 kg avgas); stall 108 km/h (58 kt) flaps down; initial
// climb ≈ 1,100 ft/min; working speed 160–190 km/h.
// Estimated for the game (not published, or sources disagree): the
// propeller diameter (3.3 m), CLmax 1.49 clean / 2.06 with flaps from the
// stall speeds, CD0 0.075 with e 0.76 (radial cowl, struts, booms, spreader
// fairing) so that the climb and a ≈ 130 kt full-power level speed come out
// of one polar, inertias scaled from mass and size (the heavy radial far
// forward raises the pitch and yaw inertia), static thrust from momentum
// theory (figure of merit 0.62), fuel flow from a radial's ≈ 0.6 lb/hp/h at
// take-off power, the governed rpm schedule, manifold pressure and engine
// temperatures. Hopper volume is not payload: with full fuel and pilot the
// MTOW leaves ≈ 2,000 kg for the hopper.
export const FLIGHT_M18 = {
  ...FLIGHT,
  emptyMass: 2710,
  mtow: 5300,
  pilotMass: 85,
  wingArea: 40.0,
  span: 17.7,
  chord: 2.33, // mean aerodynamic chord (2.6 m centre section, 1.7 m tips)
  oswald: 0.76,
  inertiaEmpty: [14500, 20500, 15000],

  CL0: 0.32, CLa: 5.0, alphaStall: 0.235, alphaStallNeg: -0.2,
  CD0: 0.075,
  CDflap: 0.075, CLflap: 0.64,
  Cm0: 0.04, CmaWB: 0.24, CmaTail: -1.45, Cmq: -17, Cmde: 0.47, Cmflap: -0.065,
  Clb: -0.085, Clp: -0.52, Clr: 0.11, Clda: 0.074,
  Cnb: 0.09, Cnr: -0.18, Cndr: 0.074, Cnda: -0.013,
  CYb: -0.6, CYdr: 0.12,

  engineType: 'radial',
  maxPower: 731e3, // 980 hp take-off (supercharged: held to the altitudes flown here)
  propRadius: 1.65,
  maxRpm: 2200, // crankshaft rpm, governed at take-off power (prop 1,511 rpm)
  idleRpm: 560,
  radial: {
    gear: 0.687, // propeller / crankshaft speed
    crank: 3.2, // s of starter before the cylinders catch
    crankRpm: 150, // the inertia starter turns the big prop over slowly
    govThrottle: 0.32, // throttle above which the governor holds the rpm
    mpIdle: 13, mpMax: 41.3, mpAmbient: 29.6, // manifold pressure, inHg (1,050 mmHg take-off boost)
    idleFrac: 0.025, // shaft power at idle
    govFrac: 0.3, // power fraction at which the blades leave the fine stop
    etaStatic: 0.62, // static figure of merit of the four-blade prop
    etaCruise: 0.8, // propulsive efficiency in climb / cruise
    discDrag: 0.13, // windmilling disc drag on the fine stop (power off)
    spool: 0.9, // s: rpm response of the governed prop
  },
  fuelFlowFull: 330 / 3600, // L/s at take-off power (avgas, rich)
  fuelFlowIdle: 24 / 3600,
  fuelBurnScale: 2.5,
  fuelDensity: 0.72,

  fuelCapacity: 712, // L, two outer-wing tanks
  hopperCapacity: 2500,
  liquidDensity: 1.0,
  hopperOffsetZ: 0.1, // the hopper sits over the CG, ahead of the cabin
  fuelTankSpanY: 4.0,

  // Oleo main legs from the wing centre section, ahead of the wing, and a
  // steerable tailwheel on a long oleo; ≈ 9.5° three-point attitude (as in
  // photographs of parked M-18Bs).
  gear: [
    { name: 'mainL', p: [1.74, -1.92, 1.2], k: 300000, c: 30000, travel: 0.26, radius: 0.42, steer: false },
    { name: 'mainR', p: [-1.74, -1.92, 1.2], k: 300000, c: 30000, travel: 0.26, radius: 0.42, steer: false },
    { name: 'tail', p: [0, -0.93, -4.65], k: 80000, c: 7000, travel: 0.16, radius: 0.18, steer: true },
  ],
  brakeMu: 0.4,
  tailSteer: 0.34,

  hard: [
    { name: 'wingtipL', p: [8.9, -0.17, 0.0] },
    { name: 'wingtipR', p: [-8.9, -0.17, 0.0] },
    { name: 'boomL', p: [7.1, -0.66, -1.24] },
    { name: 'boomR', p: [-7.1, -0.66, -1.24] },
    { name: 'prop', p: [0, -1.25, 3.0] },
    { name: 'spinner', p: [0, 0.4, 3.35] },
    { name: 'belly', p: [0, -1.08, 0.3] },
    { name: 'tail', p: [0, 0.3, -5.6] },
    { name: 'fin', p: [0, 2.29, -5.5] },
    { name: 'stabL', p: [2.9, 0.55, -5.2] },
    { name: 'stabR', p: [-2.9, 0.55, -5.2] },
    { name: 'roof', p: [0, 1.7, -1.8] },
  ],
  hardLandingVs: 3.1,
  crashVs: 5.6,

  wheelPoint: [0, -1.92, 1.2],
  aglOffset: 1.92,
  wingDrop: 0.72,
  assistGain: { pitch: 2.2, roll: 1.7 },
  assistSpeedScale: 1.25, // stall speed ratio to the PR-AGW at max weight
};

export const SPRAY_M18 = {
  // 15 m boom: a swath scaled from the Dromader's real ≈ 25 m the same way
  // as the others', and the flow that gives the PR-AGW's dose at a 50 m/s
  // (97 kt) working speed.
  swath: 32,
  flow: 5.6,
};

// ---------------------------------------------------------------------------
// Thrush 510G (fifth aircraft, fictional registration PR-TSH).
// Reference figures (Thrush Aircraft / dealer spec sheets, as given for the
// game): length 9.85 m; span 14.48 m; height 2.84 m; GE H80 turboprop
// 800 shp; Hartzell four-blade constant-speed prop, ≈ 2.62 m; empty
// ≈ 2,132 kg; maximum take-off 4,763 kg; hopper 1,930 L; fuel 863 L; working
// speed 145–241 km/h (78–130 kt); cruise ≈ 256 km/h at 55 % power; stall
// ≈ 89 km/h (48 kt, flaps down at a light weight); VNE ≈ 303 km/h (164 kt).
// Estimated for the game (not published, or not given): wing area 34.4 m²
// (the 510 family's 370 ft²); CLmax 1.57 clean / 2.3 with flaps so that the
// 48 kt flaps-down stall falls at ≈ 3,000 kg; CD0 0.045 with e 0.8 — the
// 256 km/h cruise is a clean-airframe figure, with booms, nozzles, wire
// cutter and spreader brackets the 55 % level speed comes out near 215 km/h;
// inertias scaled from the AT-502B by mass and span (shorter span: less roll
// inertia); the GE H80's quicker spool (faster Ng acceleration than the
// PT6A-34AG), its 2,080 prop rpm, a 0.6 lb/shp/h fuel flow; static thrust
// from momentum theory (figure of merit 0.66). Hopper volume is not payload:
// with full fuel and pilot the MTOW leaves ≈ 1,850 kg for the hopper.
export const FLIGHT_T510G = {
  ...FLIGHT,
  emptyMass: 2132,
  mtow: 4763,
  pilotMass: 85,
  wingArea: 34.4,
  span: 14.48,
  chord: 2.37,
  oswald: 0.8,
  inertiaEmpty: [8800, 11500, 7100],

  CL0: 0.3, CLa: 5.0, alphaStall: 0.255, alphaStallNeg: -0.2,
  CD0: 0.045,
  CDflap: 0.065, CLflap: 0.9,
  Cm0: 0.04, CmaWB: 0.25, CmaTail: -1.45, Cmq: -16, Cmde: 0.47, Cmflap: -0.065,
  Clb: -0.085, Clp: -0.5, Clr: 0.11, Clda: 0.082,
  Cnb: 0.09, Cnr: -0.18, Cndr: 0.078, Cnda: -0.012,
  CYb: -0.6, CYdr: 0.12,

  engineType: 'turboprop',
  maxPower: 597e3, // 800 shp
  propRadius: 1.31,
  maxRpm: 2080, // governed prop rpm (H80 output speed)
  idleRpm: 1100, // prop on the fine stop at ground idle
  turbine: {
    idleNg: 56, maxNg: 100.5, // gas generator %
    accel: 19, decel: 26, // Ng %/s: the H80 spools up quicker than a PT6A-34
    idleFrac: 0.022,
    lightoff: 2.6, // s of starter before fuel is introduced
    govFrac: 0.3,
    betaDrag: 2800,
    etaStatic: 0.66, // ≈ 13.8 kN static at 800 shp
    etaCruise: 0.85,
    discDrag: 0.1,
    maxTorque: 2020, // ft·lb at 800 shp / 2,080 rpm
    flatSigma: 0.72, // density ratio down to which 800 shp is available
  },
  fuelFlowFull: 272 / 3600, // L/s at max power (Jet-A, ≈ 0.6 lb/shp/h)
  fuelFlowIdle: 62 / 3600,
  fuelBurnScale: 2.5,
  fuelDensity: 0.8,

  fuelCapacity: 863,
  hopperCapacity: 1930,
  liquidDensity: 1.0,
  hopperOffsetZ: 0.35, // the hopper sits ahead of the cabin, over the wing's leading edge
  fuelTankSpanY: 2.7,

  // Tubular main legs with a drag brace, big 29×11 tyres well ahead of the
  // wing; a steerable tailwheel on a long spring under the upswept tail
  // cone: ≈ 10° three-point attitude (side photographs of parked 510Gs).
  gear: [
    { name: 'mainL', p: [1.45, -1.6, 1.0], k: 200000, c: 20000, travel: 0.24, radius: 0.37, steer: false },
    { name: 'mainR', p: [-1.45, -1.6, 1.0], k: 200000, c: 20000, travel: 0.24, radius: 0.37, steer: false },
    { name: 'tail', p: [0, -0.52, -5.12], k: 55000, c: 4800, travel: 0.14, radius: 0.15, steer: true },
  ],
  brakeMu: 0.4,
  tailSteer: 0.36,

  hard: [
    { name: 'wingtipL', p: [7.3, 0.02, -0.25] },
    { name: 'wingtipR', p: [-7.3, 0.02, -0.25] },
    { name: 'boomL', p: [6.5, -0.5, -1.72] },
    { name: 'boomR', p: [-6.5, -0.5, -1.72] },
    { name: 'prop', p: [0, -1.01, 3.82] },
    { name: 'spinner', p: [0, 0.3, 4.3] },
    { name: 'belly', p: [0, -0.62, 0.6] },
    { name: 'tail', p: [0, 0.5, -5.55] },
    { name: 'fin', p: [0, 2.32, -4.9] },
    { name: 'stabL', p: [2.65, 0.92, -4.95] },
    { name: 'stabR', p: [-2.65, 0.92, -4.95] },
    { name: 'roof', p: [0, 1.88, -0.5] },
  ],
  hardLandingVs: 3.0,
  crashVs: 5.5,

  wheelPoint: [0, -1.45, 1.0],
  aglOffset: 1.45,
  wingDrop: 0.5,
  assistGain: { pitch: 2.0, roll: 1.55 },
  assistSpeedScale: 1.22, // stall speed ratio to the PR-AGW at max weight
};

export const SPRAY_T510G = {
  // ≈ 13 m boom: a swath scaled the same way as the others', and the flow
  // that gives the PR-AGW's dose at a 58 m/s (113 kt) working speed.
  swath: 30,
  flow: 6.3,
};

// ---------------------------------------------------------------------------
// Embraer EMB-203 Ipanema (seventh aircraft, fictional registration PR-IPB).
// Published figures used (Embraer product page for the 203, as given for the
// game): span 13.30 m (with the winglets); length 8.00 m; height 2.43 m;
// Lycoming IO-540-K1J5 adapted to ethanol, 320 hp at 2,700 rpm; Hartzell
// three-blade constant-speed propeller (the 86 in / 2.18 m variant); maximum
// take-off mass 1,900 kg (reference); fuel 292 L of ethanol; hopper volume
// 1,050 L. Volume is not payload: with the pilot and full fuel the MTOW
// leaves ≈ 490 kg for the product, and the load sheet shows that limit.
// Estimated for the game (not published, or not given): equipped empty mass
// 1,090 kg; wing area 22.2 m² (≈ 13.0 m of panel span × the 1.71 m chord);
// 6.5° dihedral; the winglets as a higher span efficiency (e 0.84) rather
// than a separate force; CLa from the aspect ratio (7.6); CD0 0.054 (booms,
// nozzles, pump, wire cutter, winglets); inertias scaled from the EMB-202A's
// by mass, span and length; the piston + constant-speed branch of the flight
// model (direct drive, normally aspirated: manifold pressure from the field
// ambient down to idle); static figure of merit 0.7 for the three-blade
// Hartzell; ethanol flow ≈ 115 L/h at take-off power. V-speeds on the
// gauges: stall speeds from this polar, VFE / VNE as the EMB-202A's.
export const FLIGHT_E203 = {
  ...FLIGHT,
  emptyMass: 1090,
  mtow: 1900,
  pilotMass: 85,
  wingArea: 22.2,
  span: 13.3,
  chord: 1.71,
  oswald: 0.84,
  inertiaEmpty: [3300, 4700, 3450],

  CL0: 0.3, CLa: 5.0, alphaStall: 0.27, alphaStallNeg: -0.21,
  CD0: 0.054,
  CDflap: 0.05, CLflap: 0.7,
  Cm0: 0.045, CmaWB: 0.25, CmaTail: -1.32, Cmq: -14.5, Cmde: 0.44, Cmflap: -0.05,
  Clb: -0.095, Clp: -0.52, Clr: 0.11, Clda: 0.082,
  Cnb: 0.086, Cnr: -0.17, Cndr: 0.08, Cnda: -0.012,
  CYb: -0.6, CYdr: 0.12,

  engineType: 'piston-cs',
  maxPower: 238.6e3, // 320 hp
  propRadius: 1.09, // Hartzell 86 in
  maxRpm: 2700,
  idleRpm: 650,
  // The flight model's piston / constant-speed branch (A.radial): here a
  // direct-drive, normally aspirated flat six.
  radial: {
    gear: 1.0,
    crank: 1.4, // s of starter before it fires
    crankRpm: 280,
    govThrottle: 0.36,
    mpIdle: 12, mpMax: 28.3, mpAmbient: 28.8, // inHg at the 320 m field
    idleFrac: 0.03,
    govFrac: 0.32,
    etaStatic: 0.7,
    etaCruise: 0.82,
    discDrag: 0.1,
    spool: 0.6,
  },
  fuelFlowFull: 115 / 3600, // L/s of ethanol at take-off power
  fuelFlowIdle: 12 / 3600,
  fuelBurnScale: 2.5,
  fuelDensity: 0.79,

  fuelCapacity: 292,
  hopperCapacity: 1050,
  liquidDensity: 1.0,
  hopperOffsetZ: 0.3, // hopper between the firewall and the cabin, ahead of the CG
  fuelTankSpanY: 2.6,
  // Recommended loads are cut to what the MTOW allows (see the load sheet).
  loadByWeight: true,

  // Tubular V main legs from the lower fuselage ahead of the wing, a short
  // spring tailwheel just under the rudder: the tail sits low, the 203
  // three-point about 7° nose-up (PS-SAR on the grass; it was ≈ 3°).
  gear: [
    { name: 'mainL', p: [1.08, -1.57, 0.62], k: 100000, c: 10000, travel: 0.2, radius: 0.32, steer: false },
    { name: 'mainR', p: [-1.08, -1.57, 0.62], k: 100000, c: 10000, travel: 0.2, radius: 0.32, steer: false },
    { name: 'tail', p: [0, -0.85, -5.0], k: 30000, c: 2600, travel: 0.13, radius: 0.13, steer: true },
  ],
  tailSteer: 0.42,

  hard: [
    { name: 'wingtipL', p: [6.42, 0.25, -0.4] },
    { name: 'wingtipR', p: [-6.42, 0.25, -0.4] },
    { name: 'wingletL', p: [6.65, 0.83, -1.2] },
    { name: 'wingletR', p: [-6.65, 0.83, -1.2] },
    { name: 'boomL', p: [5.5, -0.05, -1.2] },
    { name: 'boomR', p: [-5.5, -0.05, -1.2] },
    { name: 'prop', p: [0, -0.94, 2.3] },
    { name: 'spinner', p: [0, 0.15, 2.53] },
    { name: 'belly', p: [0, -0.62, 0.3] },
    { name: 'tail', p: [0, -0.45, -4.9] },
    { name: 'fin', p: [0, 1.12, -5.0] },
    { name: 'stabL', p: [2.1, -0.3, -4.6] },
    { name: 'stabR', p: [-2.1, -0.3, -4.6] },
    { name: 'roof', p: [0, 1.04, -1.5] },
  ],
  hardLandingVs: 2.6,
  crashVs: 5.0,

  wheelPoint: [0, -1.57, 0.62],
  aglOffset: 1.57,
  wingDrop: 0.45,
  assistSpeedScale: 0.97,
};

export const SPRAY_E203 = {
  // ≈ 11 m boom (5 hangers a side): the PR-AGW's swath scaled by the boom
  // span, and the flow that gives its dose at the same working speed.
  swath: 27,
  flow: 4.4,
};

export const ASSIST = {
  modes: ['off', 'normal', 'high'],
  default: 'normal',
};

export const WIND = {
  dirFrom: 80 * (Math.PI / 180), // compass degrees the wind blows FROM (east-ish)
  speed: 3.2, // m/s mean
  gust: 0.9, // m/s amplitude of slow gusts
  turbulence: 0.35, // low-level mechanical turbulence (m/s)
};

export const SPRAY = {
  // Ideal swath at the ideal height. Real Ipanema swaths are ~15–18 m; a wider
  // swath keeps a full contract in the 8–12 minute range.
  swath: 24,
  boomHalfSpan: 4.7,
  idealHeight: [2.5, 4.5], // m above crop canopy
  flow: 3.9, // L/s pump output with the valve open (≈ 40 L/ha at 24 m × 46 m/s)
  targetRate: 40, // L/ha that counts as a correct dose
  doseGood: [0.7, 1.5], // normalized dose window
  fallSpeed: 2.6, // m/s droplet settling (drives drift time)
  driftFactor: 0.65,
  cell: 2, // coverage grid resolution (m)
  maxParticles: { low: 1800, medium: 3500, high: 6000 },
};

export const GAME = {
  currency: 'Cr$',
  startMoney: 25000,
  fuelPrice: 6.2, // per litre
  liquidPrice: 3.5,
  repairPerDamage: 180,
  completeCoverage: 0.9,
};

export const QUALITY = {
  low: { pixelRatio: 0.75, shadow: 1024, shadowRange: 120, cropRadius: 160, cropPlantRadius: 14, cropShadows: false, treeNear: 350, crownRadius: 260, clouds: 18, nearPlants: false, grassRadius: 45, grassDensity: 0.5, rainDrops: 1200 },
  medium: { pixelRatio: 1, shadow: 2048, shadowRange: 170, cropRadius: 240, cropPlantRadius: 24, cropShadows: false, treeNear: 550, crownRadius: 380, clouds: 30, nearPlants: true, grassRadius: 60, grassDensity: 0.8, rainDrops: 2500 },
  high: { pixelRatio: 1.5, shadow: 4096, shadowRange: 220, cropRadius: 320, cropPlantRadius: 34, cropShadows: true, treeNear: 800, crownRadius: 520, clouds: 44, nearPlants: true, grassRadius: 75, grassDensity: 1, rainDrops: 4000 },
};

export const UNITS = { altOffsetM: 320 }; // field elevation above MSL for the altimeter

// ---------------------------------------------------------------------------
// Robinson R44 Raven II, agricultural configuration (rotary wing; flown by
// src/flight/heliModel.js — the fixed-wing FLIGHT/FLIGHT_AT502 are untouched).
// Published figures (Robinson spec sheet / POH as quoted by AOPA, Aensa,
// Vertipedia and POH study material): 2 main blades, 33 ft (10.06 m) rotor,
// counter-clockwise seen from above; 58 in (1.47 m) 2-blade tail rotor with
// the advancing blade at the bottom; 100 % = 400 main-rotor rpm / 2665 engine
// rpm, power-on limits 101–102 %, green 90–108 %; MTOW 2,500 lb (1,134 kg);
// empty ~1,505 lb (683 kg); Lycoming IO-540-AE1A5 derated to 245 hp take-off
// (5 min) / 205 hp continuous; fuel 29.5 + 17.0 US gal usable (176 L);
// overall length 38 ft 3 in, height 10 ft 9 in.
// Estimates (not published; chosen to match the published performance and
// flagged as such): blade chord, rotor inertia, Lock number, airframe
// inertias, equivalent flat-plate drag area, tail-rotor arm and chord, skid
// tread, the ag kit's weight and the 250 L virtual tank (what fits under the
// MTOW with pilot and ~80 L of fuel — not a certified Robinson option).
export const FLIGHT_R44 = {
  // Pilot aid only (Assistance → torque compensation, detailed rotor model):
  // the hover trim measured on this model — pedal = ped[0] + ped[1]·Q (shaft
  // torque, N·m) and the left cyclic against the tail rotor's drift.
  aidTrim: { ped: [0.184, -0.000199], lat: -0.33, q0: 2300 },
  kind: 'heli',
  sim: { dt: 1 / 120, maxSubsteps: 12 },
  emptyMass: 683, // standard empty weight incl. oil and avionics
  agKitMass: 42, // estimate: belly tank, pump, booms, plumbing
  pilotMass: 85,
  mtow: 1134,
  inertia: [1650, 1450, 620], // pitch (X), yaw (Y), roll (Z), kg·m² — estimates
  cgLateral: -0.05, // pilot flies from the right seat (m, + = left)
  // Main rotor.
  rotor: {
    blades: 2, radius: 5.03, chord: 0.254, liftSlope: 5.73, cd0: 0.011,
    rpm100: 400, govPct: 101.5, inertia: 520, lock: 4.5,
    hubHeight: 1.67, hubZ: 0, // above / ahead of the CG (m)
    pitchMin: 0.0, pitchMax: 0.245, // collective blade pitch at 75 % R (rad)
    cyclicLon: 0.17, cyclicLat: 0.14, // disc tilt authority (rad)
    precone: 0.04,
  },
  tailRotor: {
    radius: 0.737, chord: 0.13, gear: 6.065, arm: 6.0, height: 0.6,
    pitchMin: -0.11, pitchMax: 0.26, // full right .. full left pedal (rad) — estimate
  },
  // Engine (piston, governed).
  engine: { ratedKW: 182.7, mcpKW: 152.9, idlePct: 62, rpm100: 2665, lagS: 0.08, crankS: 1.2, transEff: 0.94 },
  fuelCapacity: 176, // L usable (main 112 + aux 64)
  fuelDensity: 0.72, // avgas
  fuelPerKWh: 0.4, // L per kWh (≈ 60 L/h at 150 kW, ~16 US gal/h)
  fuelBurnScale: 2.5, // same gameplay compression as the airplanes
  hopperCapacity: 250, // L, virtual ag tank (see note above)
  liquidDensity: 1.0,
  // Airframe aerodynamics (equivalent areas, m²).
  dragArea: [5.5, 3.2, 0.6], // side (X), vertical (Y), frontal (Z) — frontal tuned to ~110 kt at MCP
  finYaw: 0.9, stabPitch: 0.55, // weathercock / pitch-stability coefficients (m³)
  // Skids: four contact points (body frame, m), spring/damper per point.
  skids: [[1.09, -1.38, 1.22], [1.09, -1.38, -1.12], [-1.09, -1.38, 1.22], [-1.09, -1.38, -1.12]],
  skidK: 110000, skidC: 7000, skidMu: 0.45,
  hardLandingVs: 1.8, crashVs: 3.6,
  // Never-touch points: main-rotor tips (disc edge), tail rotor, stinger, nose, belly.
  vne: 130, // kt (published Vne at low altitude)
  // Power model (the default 'power' handling, see heliModel.js): one power
  // lever, the vertical part of the thrust in proportion to it. Tuned to the R44's figures: hover at
  // the MTOW at 70 % power out of ground effect (62 % on the skids), about
  // 54 % / 48 % light; full power at the MTOW climbs ~1,000 ft/min; ~110 kt
  // at the assist's nose-down limit.
  power: {
    maxThrust: 15890, // N at 100 % (sea level, out of ground effect)
    lagS: 0.1, // power response to the lever
    climbDamp: 0.8, // 1/s: rotor inflow damping of vertical speed
    // Extra damping of slow vertical motion (saturating at holdV m/s): the
    // aircraft stops and holds where the power is set instead of drifting
    // on, while the steady climb at full power stays about the same.
    holdDamp: 1.0, holdV: 0.45,
    glideDamp: 0.14, glideSat: 8, // 1/s: rotor damping of slow horizontal motion, saturating at glideSat m/s (fades out by ~115 kt)
    spoolS: 1.4, // rotor run-up time constant once the engine runs (~6 s to speed)
    yawMoment: 4500, yawDamp: 2500, // N·m per unit pedal; N·m per rad/s
    etl: 0.1, // translational lift: thrust gain from ~8 to ~27 kt (cruise at about the hover power)
    vLoss: 0.45, vLossFrom: 50, vLossTo: 75, // thrust lost towards Vne (m/s): top speed ~130 kt at full power
    dragFrontal: 2.4, // m², replaces dragArea[2] in this model
  },
};

// ---------------------------------------------------------------------------
// Bell 206B-3 JetRanger III, agricultural configuration (rotary wing; flown
// by the same src/flight/heliModel.js as the R44, with its own figures and
// the turboshaft branch of the engine). FLIGHT_R44 is untouched.
// Published figures (Bell 206B-3 spec sheets / type data as quoted by Global
// Air, helis.com, Jetav): 2 main blades, 33 ft 4 in (10.16 m) rotor, 13 in
// chord, counter-clockwise seen from above, 394 rpm at 100 % N2; 5 ft 5 in
// (1.65 m) 2-blade tail rotor on the left of the fin; MTOW 3,200 lb
// (1,451 kg); Rolls-Royce (Allison) 250-C20J, 420 shp thermodynamic, the
// transmission limiting it to 317 shp for take-off (torque 100 %, 5 min)
// and 270 shp continuous (85 %); 91 US gal (344 L) of Jet-A; N1 ground idle
// 62–64 %. Agricultural kit: DART / Simplex Aerospace Model 4900 for the
// Bell 206A/B — belly-mounted carbon-glass tank, 530 L (140 US gal), mid-
// ship booms 35 ft (11 m) at 95 % of the rotor diameter, system 185 lb
// (84 kg).
// Estimates (not published; chosen to give the published performance and
// flagged as such): empty weight of this airframe, blade and tail-rotor
// inertias, Lock number, airframe inertias, drag areas, tail-rotor arm and
// height, skid geometry, the power-model constants. With pilot, the kit and
// 120 L of fuel the 530 L tank is over the MTOW when full (as in service: it
// is filled to what the day's weight allows — the load sheet shows it).
export const FLIGHT_B206 = {
  kind: 'heli',
  aidTrim: { ped: [0.0139, -0.0000696], lat: -0.43, q0: 2870 }, // see FLIGHT_R44
  sim: { dt: 1 / 120, maxSubsteps: 12 },
  emptyMass: 771, // equipped empty (1,700 lb) incl. unusable fuel and oil — estimate
  agKitMass: 84, // Simplex 4900, published
  pilotMass: 85,
  mtow: 1451,
  inertia: [2900, 2650, 900], // pitch, yaw, roll (kg·m²) — estimates (long boom, heavier cabin than the R44)
  cgLateral: -0.04, // pilot in the right seat
  rotor: {
    blades: 2, radius: 5.08, chord: 0.33, liftSlope: 5.73, cd0: 0.0105,
    rpm100: 394, govPct: 100, inertia: 1050, lock: 5.2,
    hubHeight: 1.55, hubZ: 0,
    pitchMin: 0.0, pitchMax: 0.24,
    cyclicLon: 0.16, cyclicLat: 0.13,
    precone: 0.035,
  },
  tailRotor: {
    radius: 0.826, chord: 0.135, gear: 6.47, arm: 6.15, height: 0.98, x: 0.33,
    pitchMin: -0.12, pitchMax: 0.27,
  },
  // Turboshaft: rpm100 is the N2 output shaft at 100 %; ratedKW / mcpKW the
  // transmission limits (torque 100 % / 85 %). The power answers more slowly
  // than the R44's piston (gas-producer spool), the start is longer.
  engine: {
    turbine: true, ratedKW: 236.4, mcpKW: 201.3, idlePct: 63, rpm100: 6016, lagS: 0.35, crankS: 6.0, transEff: 0.95,
    n1Idle: 63, n1Max: 101, totIdle: 430, totMax: 810, lightOff: 0.45, // light-off at this fraction of the crank
    idleNr: 0.66, idleS: 2.5, // rotor model: N2 held at ground idle this long before the throttle opens
  },
  fuelCapacity: 344, // L (91 US gal)
  fuelDensity: 0.8, // Jet-A
  fuelPerKWh: 0.5, // L per kWh (≈ 100 L/h at 200 kW, ~26 US gal/h)
  fuelBurnScale: 2.5,
  hopperCapacity: 530, // L, Simplex 4900 belly tank
  kitDrag: 0.3, // m² of the frontal drag area that comes off with the spray kit
  liquidDensity: 1.0,
  dragArea: [7.2, 4.2, 0.85],
  finYaw: 1.5, stabPitch: 0.95, // larger fin and a horizontal stabiliser on the boom
  // Skid tread 1.92 m (6 ft 3.5 in); contact points at the cross-tube saddles.
  skids: [[0.96, -1.28, 1.15], [0.96, -1.28, -1.2], [-0.96, -1.28, 1.15], [-0.96, -1.28, -1.2]],
  skidK: 140000, skidC: 9500, skidMu: 0.45,
  hardLandingVs: 1.8, crashVs: 3.6,
  vne: 122, // kt at low altitude; the kit's own placard limits spraying speed (see type)
  // Never-touch points: tail rotor (added from tailRotor), tail skid,
  // nose, tank, boom tips.
  hard: [
    { name: 'stinger', p: [0, -0.15, -6.35] },
    { name: 'nose', p: [0, -0.55, 2.55] },
    { name: 'tank', p: [0, -1.1, 0.02], kit: true },
    { name: 'boomL', p: [5.35, -1.0, 0.82], kit: true },
    { name: 'boomR', p: [-5.35, -1.0, 0.82], kit: true },
  ],
  // Power model: heavier per unit of power than the R44 — hover at the MTOW
  // at about 82 % out of ground effect, ~1,000 ft/min at full power there,
  // slower power and yaw response, top speed about the Vne.
  power: {
    maxThrust: 18000,
    lagS: 0.3, // turbine: the power follows the lever a little later
    climbDamp: 0.33,
    holdDamp: 1.0, holdV: 0.45,
    glideDamp: 0.11, glideSat: 8,
    spoolS: 2.2, // rotor run-up after light-off (heavier rotor than the R44)
    yawMoment: 7600, yawDamp: 5000,
    etl: 0.1,
    vLoss: 0.45, vLossFrom: 56, vLossTo: 75,
    dragFrontal: 2.5, // m², airframe plus the tank and booms
  },
};
