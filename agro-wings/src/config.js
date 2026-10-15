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

  // Engine & propeller (300 hp class, ethanol).
  staticThrust: 5300,
  maxPower: 224e3,
  propEfficiency: 0.74,
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
  low: { pixelRatio: 0.75, shadow: 1024, shadowRange: 120, cropRadius: 160, treeNear: 350, clouds: 18, nearPlants: false },
  medium: { pixelRatio: 1, shadow: 2048, shadowRange: 170, cropRadius: 240, treeNear: 550, clouds: 30, nearPlants: true },
  high: { pixelRatio: 1.5, shadow: 4096, shadowRange: 220, cropRadius: 320, treeNear: 800, clouds: 44, nearPlants: true },
};

export const UNITS = { altOffsetM: 320 }; // field elevation above MSL for the altimeter
