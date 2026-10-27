// Aircraft registry. Every system that depends on the airframe (physics,
// model, panel, spray boom, crew service points, cameras, audio, load sheet)
// reads it from the active aircraft's type, so a new aircraft is one entry
// here plus its config, model and panel.
import { FLIGHT, FLIGHT_AT502, FLIGHT_R44, FLIGHT_M18, FLIGHT_T510G, FLIGHT_B206, FLIGHT_E203, SPRAY, SPRAY_AT502, SPRAY_M18, SPRAY_T510G, SPRAY_E203, GAME } from '../config.js';
import { createAircraftModel, createContactShadow, wingY } from './model.js';
import { createPanel } from './panel.js';
import { createAirTractorModel, AT_SHADOW, atWingY } from './atModel.js';
import { createTurbinePanel } from './atPanel.js';
import { createR44Model, R44_SHADOW } from './r44Model.js';
import { createR44Panel } from './r44Panel.js';
import { createDromaderModel, M18_SHADOW, m18WingY } from './dromaderModel.js';
import { createDromaderPanel } from './dromaderPanel.js';
import { createThrushModel, T510_SHADOW, thWingY } from './thrushModel.js';
import { createThrushPanel } from './thrushPanel.js';
import { createB206Model, B206_SHADOW, B206_KIT } from './b206Model.js';
import { createB206Panel } from './b206Panel.js';
import { createE203Model, E203_SHADOW, e203WingY } from './e203Model.js';
import { BASE } from '../world/layout.js';
import { t } from '../i18n/index.js';

const R44_ROTOR = FLIGHT_R44.rotor.radius;
const B206_ROTOR = FLIGHT_B206.rotor.radius;

export const AIRCRAFT_TYPES = {
  ipanema: {
    id: 'ipanema',
    slot: '01',
    get label() { return t('Original'); },
    reg: 'PR-AGW',
    name: 'EMB-202A Ipanema',
    get engineName() { return t('Lycoming IO-540 · 320 hp (ethanol)'); },
    get summary() { return t('900 L hopper · 260 L fuel · 1,800 kg MTOW'); },
    flight: FLIGHT,
    spray: { swath: SPRAY.swath, flow: SPRAY.flow, boom: [4.7, -0.08, -0.95] },
    // Lowest working points (wheel, boom ends) for the spray height.
    work: [[0, -1.25, 0.75], [4.9, 0.0, -0.95], [-4.9, 0.0, -0.95]],
    collide: [[0, 0.2, 2.75], [5.9, 0.32, -0.1], [-5.9, 0.32, -0.1], [0, 1.38, -4.3], [0, -0.25, -4.2], [0, -1.2, 0.75], [0, 1.12, -1.1]],
    wire: [[0, 0.2, 2.75], [5.9, 0.32, -0.1], [-5.9, 0.32, -0.1], [0, 1.38, -4.3], [0, -1.2, 0.75], [2.9, -0.18, 0], [-2.9, -0.18, 0]],
    smoke: [-0.47, -0.15, 1.55],
    wash: [0, -1.0, -2],
    anim: { elev: 0.35, rud: 0.42, ail: 0.33, flap: 0.52, pedalZ: 0.42, disc: [380, 900], wash: [1500, 2600], vib: [1500, 2700] },
    vspeeds: { vs0: 48, vs1: 55, vfe: 95, vne: 140 },
    camera: { dist: 12.5, height: 3.7, orbit: 19 },
    audio: { profile: 'ipanema', blades: 2 },
    fuel: { get name() { return t('ethanol'); }, price: GAME.fuelPrice },
    loads: { free: { fuel: 220, hopper: 500 }, boot: 120 },
    loadSheet: { bankKt: 90, roll: [140, 1303, 2.9] },
    service: {
      rates: { fuel: 4.5, liquid: 14 },
      local: { A: [6.7, -2.0], B: [4.0, -1.6], F: [2.4, -1.45], P: [1.45, -1.5] },
      keepOut: { wing: [6.0, -1.0, 0.95], wingY, fus: [0.56, -0.45, 1.15, -4.7, 2.8], stab: [1.95, 0.05, 0.25, -4.3, -3.4] },
      veto: 9,
    },
    stub: { eye: [0, 1.02, -1.12], fuelFiller: [2.4, 0.0, -0.4], hopperPort: [0.56, -0.12, -1.1] },
    // Body-frame boxes [x0, x1, y0, y1, z0, z1] another aircraft can hit.
    bounds: [
      [-0.56, 0.56, -0.45, 1.15, -4.7, 2.8], [-6.1, 6.1, -0.58, 0.72, -0.9, 0.9], [-0.1, 0.1, 0.35, 1.42, -4.7, -3.3],
      [-1.95, 1.95, 0.05, 0.25, -4.3, -3.4], [-1.6, 1.6, -1.45, -0.38, 0.4, 1.1], [-1.1, 1.1, -0.9, 1.3, 2.3, 2.8],
    ],
    shadow: undefined,
    createModel: (panel, opts) => createAircraftModel(panel, opts),
    createPanel: (opts) => createPanel(opts),
    createShadow: () => createContactShadow(),
  },

  at502: {
    id: 'at502',
    slot: '02',
    label: 'Air Tractor',
    reg: 'PR-AWT',
    name: 'Air Tractor AT-502B',
    get engineName() { return t('P&WC PT6A-34AG turboprop · 750 shp'); },
    get summary() { return t('1,893 L hopper · 643 L fuel · 4,264 kg MTOW'); },
    flight: FLIGHT_AT502,
    spray: { swath: SPRAY_AT502.swath, flow: SPRAY_AT502.flow, boom: [7.0, -0.45, -1.26] },
    work: [[0, -1.45, 0.95], [7.1, -0.45, -1.3], [-7.1, -0.45, -1.3]],
    collide: [[0, 0.3, 4.3], [7.95, 0.15, -0.3], [-7.95, 0.15, -0.3], [0, 2.3, -5.45], [0, 0.3, -5.6], [0, -1.45, 0.95], [0, 1.85, -1.0], [2.75, 0.42, -5.55], [-2.75, 0.42, -5.55]],
    wire: [[0, 0.3, 4.3], [7.95, 0.15, -0.3], [-7.95, 0.15, -0.3], [0, 2.3, -5.45], [0, -1.45, 0.95], [3.9, -0.15, -0.3], [-3.9, -0.15, -0.3], [0, 1.85, -1.0]],
    smoke: [-0.55, 0.1, 3.2],
    wash: [0, -1.2, -2.6],
    anim: { elev: 0.38, rud: 0.4, ail: 0.36, flap: 0.5, pedalZ: 0.0, disc: [500, 1050], wash: [1600, 2200], vib: [1100, 2200] },
    vspeeds: { vs0: 59, vs1: 71, vfe: 120, vne: 155 },
    camera: { dist: 15.5, height: 4.4, orbit: 23 },
    audio: { profile: 'turboprop', blades: 3 },
    fuel: { name: 'Jet-A', price: GAME.fuelPrice * 1.35 },
    loads: { free: { fuel: 420, hopper: 1100 }, boot: 300 },
    loadSheet: { bankKt: 110, roll: [189, 2672, 2.0] },
    service: {
      // Larger couplers: 2" fuel nozzle, 3" hopper quick-fill.
      rates: { fuel: 7, liquid: 26 },
      local: { A: [8.7, -2.4], B: [5.0, -2.1], F: [2.1, -1.65], P: [1.3, -2.05] },
      keepOut: { wing: [8.0, -1.3, 0.6], wingY: atWingY, fus: [0.66, -0.65, 1.3, -5.6, 4.3], stab: [2.8, 0.25, 0.6, -5.95, -5.0] },
      veto: 11,
    },
    stub: { eye: [0, 1.55, -0.92], fuelFiller: [2.1, -0.1, -0.55], hopperPort: [0.67, -0.17, -1.5] },
    bounds: [
      [-0.62, 0.62, -0.75, 1.91, -5.7, 4.45], [-7.95, 7.95, -0.65, 0.35, -1.4, 0.6], [-0.12, 0.12, 0.6, 2.4, -5.8, -4.4],
      [-2.8, 2.8, 0.3, 0.55, -6.0, -4.9], [-1.8, 1.8, -1.65, -0.8, 0.6, 1.3], [-1.42, 1.42, -1.12, 1.72, 3.85, 4.1],
    ],
    createModel: (panel, opts) => createAirTractorModel(panel, opts),
    createPanel: (opts) => createTurbinePanel(opts),
    createShadow: () => createContactShadow(AT_SHADOW),
  },

  // Classic radial: PZL M-18B Dromader (FLIGHT_M18: the fixed-wing model's
  // radial / constant-speed prop branch). Fictional registration.
  m18: {
    id: 'm18',
    slot: '04',
    label: 'Dromader',
    reg: 'PR-DMD',
    name: 'PZL M-18B Dromader',
    get role() { return t('Classic Radial Agricultural Aircraft'); },
    get engineName() { return t('PZL-Kalisz ASz-62IR radial · 980 hp'); },
    get summary() { return t('2,500 L hopper · 712 L fuel · 5,300 kg MTOW'); },
    flight: FLIGHT_M18,
    spray: { swath: SPRAY_M18.swath, flow: SPRAY_M18.flow, boom: [7.1, -0.76, -1.26] },
    work: [[0, -1.92, 1.2], [7.2, -0.78, -1.27], [-7.2, -0.78, -1.27]],
    collide: [[0, 0.4, 3.35], [8.9, -0.17, 0.0], [-8.9, -0.17, 0.0], [0, 2.29, -5.5], [0, 0.55, -6.2], [0, -1.92, 1.2], [0, 1.7, -1.8], [2.95, 0.59, -5.3], [-2.95, 0.59, -5.3]],
    wire: [[0, 0.4, 3.35], [8.9, -0.17, 0.0], [-8.9, -0.17, 0.0], [0, 2.29, -5.5], [0, -1.92, 1.2], [4.4, -0.45, -0.3], [-4.4, -0.45, -0.3], [0, 1.7, -1.8]],
    smoke: [-0.7, -0.47, 0.95], // exhaust stack outlet (right side)
    wash: [0, -1.3, -2.8],
    anim: { elev: 0.38, rud: 0.4, ail: 0.36, flap: 0.5, pedalZ: -0.8, propGear: FLIGHT_M18.radial.gear, disc: [420, 1000], wash: [1300, 2100], vib: [800, 2200] },
    vspeeds: { vs0: 58, vs1: 66, vfe: 100, vne: 138 },
    camera: { dist: 17.5, height: 4.8, orbit: 26, cockpitPitch: -0.2 },
    audio: { profile: 'radial', blades: 4, propGear: FLIGHT_M18.radial.gear },
    fuel: { name: 'avgas 100LL', price: GAME.fuelPrice * 1.6 },
    loads: { free: { fuel: 450, hopper: 1300 }, boot: 350 },
    loadSheet: { bankKt: 100, roll: [139, 3011, 2.0] },
    service: {
      // 2" fuel nozzle, 3" hopper quick-fill on the left side behind the wing.
      rates: { fuel: 7, liquid: 28 },
      local: { A: [10.0, -2.9], B: [6.0, -2.7], F: [4.0, -2.3], P: [1.4, -2.45] },
      keepOut: { wing: [8.9, -1.9, 0.8], wingY: m18WingY, fus: [0.72, -1.1, 1.72, -6.25, 2.95], stab: [2.95, 0.48, 0.69, -6.2, -4.5] },
      veto: 12,
    },
    stub: { eye: [0, 1.42, -1.72], fuelFiller: [4.0, -0.46, -0.09], hopperPort: [0.62, -0.25, -2.05] },
    bounds: [
      [-0.72, 0.72, -1.1, 1.72, -5.6, 2.95], [-8.9, 8.9, -1.0, 0.0, -1.9, 0.8], [-0.12, 0.12, 0.55, 2.32, -6.25, -4.5],
      [-2.95, 2.95, 0.48, 0.69, -6.2, -4.5], [-1.95, 1.95, -1.92, -0.9, 0.7, 1.45], [-1.65, 1.65, -1.2, 2.1, 2.9, 3.4],
    ],
    createModel: (panel, opts) => createDromaderModel(panel, opts),
    createPanel: (opts) => createDromaderPanel(opts),
    createShadow: () => createContactShadow(M18_SHADOW),
  },

  // Turboprop: Thrush 510G (FLIGHT_T510G: the turbine branch with the GE
  // H80's own figures). Fictional registration.
  thrush: {
    id: 'thrush',
    slot: '05',
    label: 'Thrush',
    reg: 'PR-TSH',
    name: 'Thrush 510G',
    get role() { return t('Turboprop Agricultural Aircraft'); },
    get engineName() { return t('GE H80 turboprop · 800 shp'); },
    get summary() { return t('1,930 L hopper · 863 L fuel · 4,763 kg MTOW'); },
    flight: FLIGHT_T510G,
    spray: { swath: SPRAY_T510G.swath, flow: SPRAY_T510G.flow, boom: [6.5, -0.41, -1.67] },
    work: [[0, -1.45, 1.0], [6.6, -0.45, -1.7], [-6.6, -0.45, -1.7]],
    collide: [[0, 0.3, 4.3], [7.3, 0.02, -0.25], [-7.3, 0.02, -0.25], [0, 2.36, -4.4], [0, 0.55, -5.4], [0, -1.45, 1.0], [0, 1.86, -0.5], [2.7, 0.68, -4.8], [-2.7, 0.68, -4.8]],
    wire: [[0, 0.3, 4.3], [7.3, 0.02, -0.25], [-7.3, 0.02, -0.25], [0, 2.36, -4.4], [0, -1.45, 1.0], [3.6, -0.3, -1.7], [-3.6, -0.3, -1.7], [0, 1.86, -0.5]],
    smoke: [-0.5, 0.3, 3.18], // right exhaust stack
    wash: [0, -1.2, -2.5],
    anim: { elev: 0.38, rud: 0.4, ail: 0.36, flap: 0.5, pedalZ: 0.48, disc: [500, 1000], wash: [1500, 2000], vib: [1100, 2080] },
    vspeeds: { vs0: 52, vs1: 66, vfe: 110, vne: 164 },
    // Own cockpit view: eye from thrushGeom.js, a slightly shallower look
    // down than the default (the panel sits low under the tall windshield).
    camera: { dist: 15, height: 4.3, orbit: 22, cockpitPitch: -0.2, cockpitFov: 68 },
    audio: { profile: 'h80', blades: 4 },
    fuel: { name: 'Jet-A', price: GAME.fuelPrice * 1.35 },
    loads: { free: { fuel: 450, hopper: 1150 }, boot: 300 },
    loadSheet: { bankKt: 110, roll: [148, 2617, 2.0] },
    service: {
      rates: { fuel: 7, liquid: 27 },
      local: { A: [8.2, -2.6], B: [4.8, -2.2], F: [2.3, -1.6], P: [1.4, -1.9] },
      keepOut: { wing: [7.3, -1.65, 0.75], wingY: thWingY, fus: [0.62, -0.5, 1.86, -5.4, 4.3], stab: [2.75, 0.6, 0.78, -5.5, -4.25] },
      veto: 11,
    },
    stub: { eye: [0, 1.57, -0.44], fuelFiller: [2.3, 0.05, -0.35], hopperPort: [0.62, -0.12, -1.6] },
    bounds: [
      [-0.62, 0.62, -0.5, 1.88, -5.45, 4.35], [-7.3, 7.3, -0.5, 0.25, -1.75, 0.8], [-0.12, 0.12, 0.7, 2.4, -5.55, -3.4],
      [-2.75, 2.75, 0.6, 0.8, -5.5, -4.25], [-1.8, 1.8, -1.65, -0.8, 0.6, 1.4], [-1.32, 1.32, -1.0, 1.6, 3.8, 4.0],
    ],
    createModel: (panel, opts) => createThrushModel(panel, opts),
    createPanel: (opts) => createThrushPanel(opts),
    createShadow: () => createContactShadow(T510_SHADOW),
  },

  // Rotary wing: flown by Helicopter (src/aircraft/helicopter.js) with its
  // own physics (HeliModel); everything the game, crew, sprayer, GPS and
  // cameras need comes from the same fields as the airplanes.
  r44: {
    id: 'r44',
    kind: 'heli',
    slot: '03',
    label: 'Robinson R44',
    reg: 'PR-AGH',
    get name() { return t('Robinson R44 Raven II · Agricultural'); },
    get role() { return t('Rotary-Wing Agricultural Aircraft'); },
    get engineName() { return t('Lycoming IO-540-AE1A5 · 245 hp take-off / 205 hp MCP'); },
    get summary() { return t('250 L spray tank · 176 L fuel · 1,134 kg MTOW'); },
    flight: FLIGHT_R44,
    // 8 m boom under the nose (80 % of the rotor diameter), engine-driven
    // pump: 1.3 L/s gives the contracts' 40 L/ha at 13 m × 25 m/s (≈ 50 kt).
    spray: { swath: 13, flow: 1.3, boom: [4.0, -1.16, 0.6], pump: 'engine' },
    work: [[1.09, -1.38, 0], [-1.09, -1.38, 0], [4.0, -1.2, 0.6], [-4.0, -1.2, 0.6]],
    collide: [[0, -0.2, 2.5], [0, 0.8, 0.4], [0, 1.9, 0], [0, 1.25, -6.35], [0.32, 0.6, -6.0], [0, -0.34, -5.98], [4.0, -1.16, 0.6], [-4.0, -1.16, 0.6], [0, -0.9, 0]],
    wire: [[0, -0.2, 2.5], [0, 1.9, 0], [0, 1.25, -6.35], [0.32, 0.6, -6.0], [4.0, -1.16, 0.6], [-4.0, -1.16, 0.6], [1.09, -1.38, 1.2], [-1.09, -1.38, 1.2]],
    smoke: [0, 0.0, -1.3],
    wash: [0, -1.2, -1],
    anim: { vib: [1500, 2700] },
    vspeeds: { vne: 130 },
    camera: { dist: 14, height: 3.9, orbit: 17, noseOnly: true, cockpitPitch: -0.36, cockpitFov: 64 },
    // Control layer: helicopter controls -> the game's (rebindable) actions,
    // and the labels the Controls screen shows for them (null: not used).
    controls: {
      cyclicForward: 'pitchDown', cyclicAft: 'pitchUp', cyclicLeft: 'rollLeft', cyclicRight: 'rollRight',
      pedalLeft: 'yawLeft', pedalRight: 'yawRight', collectiveUp: 'throttleUp', collectiveDown: 'throttleDown',
      trimAft: 'trimUp', trimForward: 'trimDown', engine: 'engine',
      labels: {
        get pitchDown() { return t('Cyclic forward'); }, get pitchUp() { return t('Cyclic aft'); },
        get rollLeft() { return t('Cyclic left'); }, get rollRight() { return t('Cyclic right'); },
        get yawLeft() { return t('Pedal left (nose left)'); }, get yawRight() { return t('Pedal right (nose right)'); },
        get throttleUp() { return t('Collective up'); }, get throttleDown() { return t('Collective down'); },
        get trimUp() { return t('Cyclic trim aft'); }, get trimDown() { return t('Cyclic trim forward'); },
        get engine() { return t('Engine (hold start, collective down / tap stop)'); },
        brakes: null, flapsUp: null, flapsDown: null,
      },
    },
    audio: { profile: 'heli', blades: 2 },
    fuel: { name: 'avgas 100LL', price: GAME.fuelPrice * 1.6 },
    loads: { free: { fuel: 110, hopper: 150 }, boot: 70 },
    loadSheet: { heli: true },
    service: {
      rates: { fuel: 2.5, liquid: 6 },
      // Walk in from outside the boom tip, aft of it; fuel filler on the
      // upper aft body, tank coupler on the tank side by the skid.
      local: { A: [5.4, -1.9], B: [2.0, -1.5], F: [1.05, -0.95], P: [1.4, -0.55] },
      keepOut: { wing: [4.1, 0.5, 0.7], wingY: () => -1.16, fus: [0.7, -0.9, 1.15, -2.2, 2.55], stab: [0.65, 0.45, 0.6, -5.25, -4.75] },
      veto: 7.5,
      standGap: 3.0, // truck parks well clear of the (stopped) rotor disc
    },
    servicePad: BASE.helipad,
    stub: { eye: [-0.29, 0.44, 1.18], fuelFiller: [0.44, 0.56, -0.86], hopperPort: [0.53, -1.0, -0.42] },
    // Airframe boxes plus the rotor disc (the disc is overhead: people walk
    // under it, vehicles do not).
    bounds: [
      [-0.7, 0.7, -0.9, 1.15, -2.2, 2.55], [-0.22, 0.22, 0.2, 0.8, -6.15, -2.2], [-0.05, 0.4, -0.35, 1.35, -6.75, -5.25],
      [-0.65, 0.65, 0.45, 0.6, -5.25, -4.75], [-1.15, 1.15, -1.38, -0.85, -1.4, 1.7], [-4.05, 4.05, -1.24, -1.08, 0.5, 0.7],
      [-R44_ROTOR, R44_ROTOR, 1.45, 1.9, -R44_ROTOR, R44_ROTOR],
    ],
    overhead: 1.2, // boxes starting above this body height are walked under
    createModel: (panel, opts) => createR44Model(panel, opts),
    createPanel: (opts) => createR44Panel(opts),
    createShadow: () => createContactShadow(R44_SHADOW),
  },
};

// Bell 206B-3 JetRanger III with the Simplex 4900 spray kit: the second
// helicopter (FLIGHT_B206: the shared helicopter model with its own figures
// and the turboshaft branch); same controls as the R44, its own helipad.
AIRCRAFT_TYPES.b206 = {
  id: 'b206',
  kind: 'heli',
  slot: '06',
  label: 'Bell 206B',
  reg: 'PR-AGJ',
  get name() { return t('Bell 206B JetRanger — Agricultural'); },
  get role() { return t('Turbine Rotary-Wing Agricultural Aircraft'); },
  get engineName() { return t('Rolls-Royce 250-C20J turboshaft · 317 shp take-off (transmission)'); },
  get summary() { return t('530 L Simplex tank · 344 L fuel · 1,451 kg MTOW'); },
  flight: FLIGHT_B206,
  // Simplex 4900: 10.7 m boom (95 % of the rotor diameter), 44 nozzles;
  // 18 m swath (the kit's 15–21 m); 1.8 L/s gives the contracts' 40 L/ha at
  // 25 m/s (≈ 50 kt; the kit is placarded to 100 mph).
  spray: { swath: 18, flow: 1.8, boom: [B206_KIT.boom.half, B206_KIT.boom.y, B206_KIT.boom.z], pump: 'engine' },
  work: [[0.96, -1.28, 0], [-0.96, -1.28, 0], [5.35, -1.0, 0.82], [-5.35, -1.0, 0.82]],
  collide: [[0, -0.3, 2.65], [0, 0.8, 0.5], [0, 1.75, 0], [0, 1.5, -6.62], [0.33, 0.6, -6.15], [0, -0.26, -6.2], [5.35, -0.98, 0.82], [-5.35, -0.98, 0.82], [0, -1.1, 0]],
  wire: [[0, -0.3, 2.65], [0, 1.75, 0], [0, 1.5, -6.62], [0.33, 0.6, -6.15], [5.35, -0.98, 0.82], [-5.35, -0.98, 0.82], [0.96, -1.28, 1.2], [-0.96, -1.28, 1.2]],
  smoke: [0.2, 1.17, -1.56], // exhaust stacks on the roof
  wash: [0, -1.2, -1],
  anim: { vib: [1500, 2700] },
  vspeeds: { vne: 122 },
  camera: { dist: 15, height: 4.2, orbit: 19, noseOnly: true, cockpitPitch: -0.3, cockpitFov: 66 },
  controls: AIRCRAFT_TYPES.r44.controls,
  audio: { profile: 'c20', blades: 2 },
  fuel: { name: 'Jet-A', price: GAME.fuelPrice * 1.35 },
  loads: { free: { fuel: 200, hopper: 250 }, boot: 120 },
  loadSheet: { heli: true },
  service: {
    rates: { fuel: 5, liquid: 10 },
    // Walk in from outside the boom tip; fuel filler on the aft body side,
    // tank coupler at the aft end of the belly tank.
    local: { A: [6.4, -1.4], B: [2.3, -1.6], F: [1.0, -0.9], P: [1.25, -0.6] },
    keepOut: { wing: [5.4, 0.72, 0.92], wingY: () => B206_KIT.boom.y, fus: [0.66, -0.81, 1.2, -2.2, 2.7], stab: [1.0, 0.25, 0.75, -4.7, -4.05] },
    veto: 8,
    standGap: 3.0,
  },
  servicePad: BASE.helipad2,
  padKey: 'helipad2',
  stub: { eye: [-0.34, 0.43, 1.13], fuelFiller: [0.56, 0.2, -0.85], hopperPort: [0.54, -0.93, -0.55] },
  bounds: [
    [-0.66, 0.66, -0.81, 1.2, -2.2, 2.7], [-0.23, 0.23, 0.15, 0.62, -6.1, -2.2], [-0.05, 0.42, -0.26, 1.55, -6.8, -5.5],
    [-1.0, 1.0, 0.25, 0.75, -4.7, -4.05], [-1.0, 1.0, -1.28, -0.75, -1.5, 1.75], [-5.4, 5.4, -1.04, -0.84, 0.72, 0.92],
    [-B206_ROTOR, B206_ROTOR, 1.4, 1.9, -B206_ROTOR, B206_ROTOR],
  ],
  overhead: 1.25,
  createModel: (panel, opts) => createB206Model(panel, opts),
  createPanel: (opts) => createB206Panel(opts),
  createShadow: () => createContactShadow(B206_SHADOW),
};

// Embraer EMB-203 Ipanema (FLIGHT_E203: its own figures on the piston +
// constant-speed branch). Fictional registration. The exterior is the 203's
// own model; the cockpit is provisional (the EMB-202A panel on a plain
// board) until the 203's cockpit is built.
AIRCRAFT_TYPES.e203 = {
  id: 'e203',
  slot: '07',
  label: 'Ipanema 203',
  reg: 'PR-IPB',
  name: 'Embraer Ipanema 203',
  get role() { return t('Ethanol Agricultural Aircraft · winglets'); },
  get engineName() { return t('Lycoming IO-540-K1J5 · 320 hp (ethanol) · Hartzell 3-blade'); },
  get summary() { return t('1,050 L hopper · 292 L ethanol · 13.30 m span · 1,900 kg MTOW'); },
  flight: FLIGHT_E203,
  spray: { swath: SPRAY_E203.swath, flow: SPRAY_E203.flow, boom: [5.4, -0.23, -1.12] },
  work: [[0, -1.57, 0.62], [5.5, -0.33, -1.15], [-5.5, -0.33, -1.15]],
  collide: [[0, 0.15, 2.53], [6.65, 0.83, -1.2], [-6.65, 0.83, -1.2], [6.42, 0.25, -0.4], [-6.42, 0.25, -0.4], [0, 1.13, -4.94], [0, -0.42, -4.9], [0, -1.5, 0.62], [0, 1.04, -1.5]],
  wire: [[0, 0.15, 2.53], [6.65, 0.83, -1.2], [-6.65, 0.83, -1.2], [0, 1.13, -4.94], [0, -1.5, 0.62], [3.3, -0.2, -0.4], [-3.3, -0.2, -0.4], [0, 1.04, -1.5]],
  smoke: [-0.36, -0.44, 1.14],
  wash: [0, -1.0, -2],
  anim: { elev: 0.35, rud: 0.42, ail: 0.33, flap: 0.52, pedalZ: -0.53, disc: [380, 900], wash: [1500, 2600], vib: [1500, 2700] },
  vspeeds: { vs0: 48, vs1: 56, vfe: 95, vne: 140 },
  camera: { dist: 13.5, height: 3.9, orbit: 20, cockpitPitch: -0.15, cockpitFov: 70 },
  // The EMB-202A's IO-540 sound, with the 203's three-blade prop.
  audio: { profile: 'ipanema', blades: 3, cfg: { blades: 3, propDiameter: 2.18 } },
  fuel: { get name() { return t('ethanol'); }, price: GAME.fuelPrice },
  loads: { free: { fuel: 230, hopper: 450 }, boot: 130 },
  loadSheet: { bankKt: 90, roll: [244, 1400, 2.25] },
  service: {
    rates: { fuel: 4.5, liquid: 15 },
    local: { A: [7.5, -2.2], B: [4.4, -1.9], F: [2.3, -1.6], P: [1.15, -1.55] },
    keepOut: { wing: [6.7, -1.45, 0.6], wingY: e203WingY, fus: [0.56, -0.6, 1.06, -5.5, 2.55], stab: [2.12, -0.36, -0.2, -5.0, -4.0] },
    veto: 9,
  },
  stub: { eye: [0, 0.8, -1.45], fuelFiller: [2.3, -0.02, -0.17], hopperPort: [0.51, -0.26, -0.75] },
  bounds: [
    [-0.56, 0.56, -0.6, 1.06, -5.5, 2.55], [-6.65, 6.65, -0.56, 0.85, -1.3, 0.45], [-0.08, 0.08, 0.4, 1.14, -5.48, -4.05],
    [-2.12, 2.12, -0.36, -0.2, -5.0, -4.0], [-1.3, 1.3, -1.57, -0.44, 0.15, 1.0], [-1.1, 1.1, -0.94, 1.24, 2.15, 2.28],
  ],
  createModel: (panel, opts) => createE203Model(panel, opts),
  createPanel: (opts) => createPanel(opts),
  createShadow: () => createContactShadow(E203_SHADOW),
};

export const AIRCRAFT_ORDER = ['ipanema', 'at502', 'r44', 'm18', 'thrush', 'b206', 'e203'];
export const aircraftType = (id) => AIRCRAFT_TYPES[id] ?? AIRCRAFT_TYPES.ipanema;

// Registrations: each type keeps its factory marks as `reg0`; `reg` reads the
// player's choice. Brazilian civil marks only — a national prefix (PP, PR,
// PS, PT, PU), a hyphen and three letters, not starting with Q and not one
// of the reserved distress/ATC groups.
export const REG_PREFIXES = ['PP', 'PR', 'PS', 'PT', 'PU'];
const REG_RESERVED = new Set(['SOS', 'XXX', 'PAN', 'TTT', 'VFR', 'IFR', 'VMC', 'IMC']);
const REGS = {};
for (const ty of Object.values(AIRCRAFT_TYPES)) {
  const r0 = ty.reg;
  Object.defineProperty(ty, 'reg0', { value: r0 });
  Object.defineProperty(ty, 'reg', { get: () => REGS[ty.id] ?? r0, configurable: true, enumerable: true });
}
// 'pr agx' / 'PRAGX' / 'PR-AGX' → 'PR-AGX'; null when the marks are not valid.
export function normalizeReg(s) {
  const l = String(s ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  if (l.length !== 5) return null;
  const p = l.slice(0, 2), x = l.slice(2);
  if (!REG_PREFIXES.includes(p) || x[0] === 'Q' || REG_RESERVED.has(x)) return null;
  return `${p}-${x}`;
}
// Marks in use by another aircraft of the fleet (each must be unique).
export const regTaken = (id, reg) => Object.values(AIRCRAFT_TYPES).some((ty) => ty.id !== id && ty.reg === reg);
// Sets (or, with a falsy/default value, clears) a type's marks; returns the
// marks now in force, or null when refused.
export function setRegistration(id, reg) {
  const ty = AIRCRAFT_TYPES[id];
  if (!ty) return null;
  if (!reg) { delete REGS[id]; return ty.reg; }
  const r = normalizeReg(reg);
  if (!r || regTaken(id, r)) return null;
  if (r === ty.reg0) delete REGS[id]; else REGS[id] = r;
  return ty.reg;
}

// Product the MTOW leaves at a given fuel load (kg of liquid ≈ L): the
// hopper's volume is not its payload.
export const productLimit = (A, fuelL) => Math.max(0, (A.mtow - A.emptyMass - (A.agKitMass ?? 0) - A.pilotMass - fuelL * A.fuelDensity) / A.liquidDensity);
