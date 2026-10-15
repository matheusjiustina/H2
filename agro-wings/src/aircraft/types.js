// Aircraft registry. Every system that depends on the airframe (physics,
// model, panel, spray boom, crew service points, cameras, audio, load sheet)
// reads it from the active aircraft's type, so a new aircraft is one entry
// here plus its config, model and panel.
import { FLIGHT, FLIGHT_AT502, SPRAY, SPRAY_AT502, GAME } from '../config.js';
import { createAircraftModel, createContactShadow, wingY } from './model.js';
import { createPanel } from './panel.js';
import { createAirTractorModel, AT_SHADOW, atWingY } from './atModel.js';
import { createTurbinePanel } from './atPanel.js';

export const AIRCRAFT_TYPES = {
  ipanema: {
    id: 'ipanema',
    slot: '01',
    label: 'Original',
    reg: 'PR-AGW',
    name: 'EMB-202A Ipanema',
    engineName: 'Lycoming IO-540 · 320 hp (ethanol)',
    summary: '900 L hopper · 260 L fuel · 1,800 kg MTOW',
    flight: FLIGHT,
    spray: { swath: SPRAY.swath, flow: SPRAY.flow, boom: [4.7, -0.3, -0.95] },
    // Lowest working points (wheel, boom ends) for the spray height.
    work: [[0, -1.25, 0.75], [4.9, -0.22, -0.95], [-4.9, -0.22, -0.95]],
    collide: [[0, 0.05, 3.3], [5.9, 0.1, -0.1], [-5.9, 0.1, -0.1], [0, 1.75, -4.0], [0, 0.2, -4.3], [0, -1.2, 0.75], [0, 1.3, 0]],
    wire: [[0, 0.05, 3.3], [5.9, 0.1, -0.1], [-5.9, 0.1, -0.1], [0, 1.75, -4.0], [0, -1.2, 0.75], [2.9, -0.4, 0], [-2.9, -0.4, 0]],
    smoke: [-0.5, -0.3, 2.0],
    wash: [0, -1.0, -2],
    anim: { elev: 0.35, rud: 0.42, ail: 0.33, flap: 0.52, pedalZ: 0.42, disc: [380, 900], wash: [1500, 2600], vib: [1500, 2700] },
    vspeeds: { vs0: 48, vs1: 55, vfe: 95, vne: 140 },
    camera: { dist: 12.5, height: 3.7, orbit: 19 },
    audio: { profile: 'piston', blades: 3 },
    fuel: { name: 'ethanol', price: GAME.fuelPrice },
    loads: { free: { fuel: 220, hopper: 500 }, boot: 120 },
    loadSheet: { bankKt: 90, roll: [140, 1303, 2.9] },
    service: {
      rates: { fuel: 4.5, liquid: 14 },
      local: { A: [6.7, -2.0], B: [4.0, -1.6], F: [2.4, -1.45], P: [1.45, -1.5] },
      keepOut: { wing: [6.0, -1.0, 0.95], wingY, fus: [0.62, -0.75, 0.9, -4.3, 3.2], stab: [1.95, 0.2, 0.5, -4.25, -3.2] },
      veto: 9,
    },
    stub: { eye: [0, 0.98, -0.42], fuelFiller: [2.4, -0.2, -0.4], hopperPort: [0.6, -0.35, -1.05] },
    // Body-frame boxes [x0, x1, y0, y1, z0, z1] another aircraft can hit.
    bounds: [
      [-0.6, 0.6, -0.75, 1.4, -4.4, 3.4], [-6.1, 6.1, -0.8, 0.5, -0.9, 0.9], [-0.1, 0.1, 0.3, 1.9, -4.4, -2.9],
      [-1.95, 1.95, 0.2, 0.5, -4.3, -3.2], [-1.6, 1.6, -1.45, -0.6, 0.4, 1.1], [-1.1, 1.1, -1.1, 1.15, 3.0, 3.35],
    ],
    shadow: undefined,
    createModel: (panel, opts) => createAircraftModel(panel, opts),
    createPanel: () => createPanel(),
    createShadow: () => createContactShadow(),
  },

  at502: {
    id: 'at502',
    slot: '02',
    label: 'Air Tractor',
    reg: 'PR-AWT',
    name: 'Air Tractor AT-502B',
    engineName: 'P&WC PT6A-34AG turboprop · 750 shp',
    summary: '1,893 L hopper · 643 L fuel · 4,264 kg MTOW',
    flight: FLIGHT_AT502,
    spray: { swath: SPRAY_AT502.swath, flow: SPRAY_AT502.flow, boom: [7.0, -0.45, -1.26] },
    work: [[0, -1.45, 0.95], [7.1, -0.45, -1.3], [-7.1, -0.45, -1.3]],
    collide: [[0, 0.3, 4.3], [7.95, -0.1, -0.3], [-7.95, -0.1, -0.3], [0, 2.3, -5.45], [0, 0.3, -5.6], [0, -1.45, 0.95], [0, 1.6, -1.0], [2.75, 0.42, -5.55], [-2.75, 0.42, -5.55]],
    wire: [[0, 0.3, 4.3], [7.95, -0.1, -0.3], [-7.95, -0.1, -0.3], [0, 2.3, -5.45], [0, -1.45, 0.95], [3.9, -0.4, -0.3], [-3.9, -0.4, -0.3], [0, 1.6, -1.0]],
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
      keepOut: { wing: [8.0, -1.3, 0.6], wingY: atWingY, fus: [0.66, -0.9, 1.0, -5.6, 4.3], stab: [2.8, 0.25, 0.6, -5.95, -5.0] },
      veto: 11,
    },
    stub: { eye: [0, 1.3, -0.92], fuelFiller: [2.1, -0.35, -0.55], hopperPort: [0.62, -0.55, -1.5] },
    bounds: [
      [-0.62, 0.62, -0.9, 1.66, -5.7, 4.45], [-7.95, 7.95, -0.9, 0.1, -1.4, 0.6], [-0.12, 0.12, 0.6, 2.4, -5.8, -4.4],
      [-2.8, 2.8, 0.3, 0.55, -6.0, -4.9], [-1.8, 1.8, -1.65, -0.8, 0.6, 1.3], [-1.42, 1.42, -1.12, 1.72, 3.85, 4.1],
    ],
    createModel: (panel, opts) => createAirTractorModel(panel, opts),
    createPanel: () => createTurbinePanel(),
    createShadow: () => createContactShadow(AT_SHADOW),
  },
};

export const AIRCRAFT_ORDER = ['ipanema', 'at502'];
export const aircraftType = (id) => AIRCRAFT_TYPES[id] ?? AIRCRAFT_TYPES.ipanema;
