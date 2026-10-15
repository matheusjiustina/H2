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
  // tubular mains as on the Ipanema: ~11° three-point attitude.
  gear: [
    { name: 'mainL', p: [1.35, -1.43, 0.75], k: 95000, c: 9500, travel: 0.2, radius: 0.32, steer: false },
    { name: 'mainR', p: [-1.35, -1.43, 0.75], k: 95000, c: 9500, travel: 0.2, radius: 0.32, steer: false },
    { name: 'tail', p: [0, -0.42, -4.55], k: 28000, c: 2400, travel: 0.12, radius: 0.13, steer: true },
  ],
  rollingResistance: { runway: 0.035, dirt: 0.05, grass: 0.075, crop: 0.16 },
  brakeMu: 0.38,
  lateralMu: 0.75,
  tailSteer: 0.42, // rad at walking speed, fades with speed
  groundBump: { runway: 0.012, dirt: 0.025, grass: 0.04, crop: 0.05 },

  // Points that must never touch anything (crash / damage detection).
  hard: [
    { name: 'wingtipL', p: [5.85, 0.05, -0.05] },
    { name: 'wingtipR', p: [-5.85, 0.05, -0.05] },
    // Booms hang under the trailing edge and follow the 6° dihedral.
    { name: 'boomL', p: [4.9, -0.22, -0.95] },
    { name: 'boomR', p: [-4.9, -0.22, -0.95] },
    { name: 'prop', p: [0, -1.05, 3.05] },
    { name: 'spinner', p: [0, 0.05, 3.35] },
    { name: 'belly', p: [0, -0.72, 0.4] },
    { name: 'tail', p: [0, 0.15, -4.25] },
    { name: 'fin', p: [0, 1.75, -4.0] },
    { name: 'stabL', p: [1.8, 0.35, -3.75] },
    { name: 'stabR', p: [-1.8, 0.35, -3.75] },
    { name: 'roof', p: [0, 1.35, 0.1] },
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
    { name: 'wingtipL', p: [7.95, -0.12, -0.3] },
    { name: 'wingtipR', p: [-7.95, -0.12, -0.3] },
    { name: 'boomL', p: [7.0, -0.42, -1.22] },
    { name: 'boomR', p: [-7.0, -0.42, -1.22] },
    { name: 'prop', p: [0, -1.12, 3.92] },
    { name: 'spinner', p: [0, 0.3, 4.32] },
    { name: 'belly', p: [0, -0.86, 0.45] },
    { name: 'tail', p: [0, 0.18, -5.62] },
    { name: 'fin', p: [0, 2.35, -5.45] },
    { name: 'stabL', p: [2.75, 0.42, -5.55] },
    { name: 'stabR', p: [-2.75, 0.42, -5.55] },
    { name: 'roof', p: [0, 1.66, -1.0] },
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
  low: { pixelRatio: 0.75, shadow: 1024, shadowRange: 120, cropRadius: 160, treeNear: 350, clouds: 18, nearPlants: false, grassRadius: 45, grassDensity: 0.5 },
  medium: { pixelRatio: 1, shadow: 2048, shadowRange: 170, cropRadius: 240, treeNear: 550, clouds: 30, nearPlants: true, grassRadius: 60, grassDensity: 0.8 },
  high: { pixelRatio: 1.5, shadow: 4096, shadowRange: 220, cropRadius: 320, treeNear: 800, clouds: 44, nearPlants: true, grassRadius: 75, grassDensity: 1 },
};

export const UNITS = { altOffsetM: 320 }; // field elevation above MSL for the altimeter
