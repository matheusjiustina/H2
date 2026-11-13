// Service point registry (Badeco 2.0): per aircraft and per service, where
// the badeco connects and how he gets there — measured on each model, never
// one generic point for every type. Positions are aircraft-local (body
// frame: x = left, y = up, z = forward; the service side mirrors x), so they
// follow the aircraft wherever it is parked.
//
//   port   — the connection: the model's own fuelFiller (wing / tank filler
//            cap) or hopperPort (hopper quick-fill coupler); the hose ends
//            here and the cap is opened here.
//   stand  — the ground point he works from (the type's service.local F / P).
//   ladder — only where the port is out of reach from the ground (measured,
//            parked on the pad: Ag-Cat filler 3.01 m — top of the upper wing
//            centre section; Fire Boss filler 2.81 m and coupler 2.74 m — on
//            the floats). A step ladder is set up at `base` (local ground
//            point, clear of wings, floats, struts and prop); he climbs to
//            `top` m and either reaches up to the port from the top step,
//            or (Fire Boss) steps onto the wing walkway and walks `onWing`
//            to the port, kneeling there.
// Anything above REACH with no entry of its own gets a ladder at its stand
// point, top step so that the hands reach the port.
export const REACH = 1.95; // m: hands of a standing badeco reaching up

const OVERRIDES = {
  // Fire Boss on Wipline floats: ladder behind the wing trailing edge
  // (z −1.47), outboard of the float (which ends at x 2.67), top step at the
  // wing; on the wing to the filler (2.6, −0.55) or to the hopper coupler on
  // the fuselage side behind the wing root (0.64, −2.0).
  at802f: {
    fuel: { ladder: { base: [3.2, -2.35], wing: true, onWing: [[3.15, -1.3], [2.95, -0.98]] } },
    liquid: { ladder: { base: [3.2, -2.35], wing: true, onWing: [[3.15, -1.3], [1.7, -1.32], [1.08, -1.38]] } },
  },
  // Ag-Cat: the filler is on top of the upper wing centre section, over the
  // fuselage; ladder beside the forward fuselage, ahead of the lower wing's
  // leading edge (z 0.14), reaching up and in from the top step.
  agcat: {
    fuel: { ladder: { base: [1.3, 0.62] } },
  },
};

// Plan for one service on the current aircraft. portH: the port's height
// above the ground as parked (m). Returns { port, stand, ladder|null }.
export function servicePlan(ac, kind, portH) {
  const m = ac.model, local = ac.type.service.local;
  const port = (kind === 'fuel' ? m.fuelFiller : m.hopperPort).clone();
  const stand = kind === 'fuel' ? local.F : local.P;
  const o = OVERRIDES[ac.type.id]?.[kind];
  let ladder = null;
  if (o?.ladder) {
    const L = o.ladder;
    // Wing walkway: the top step at the wing (port 0.13 above the skin);
    // reaching up from the top step: hands at the port.
    const top = L.wing ? portH - 0.14 : Math.max(0.5, portH - REACH);
    ladder = { base: L.base, top, wing: !!L.wing, onWing: L.onWing ?? null };
  } else if (portH > REACH) {
    ladder = { base: stand, top: Math.max(0.5, portH - REACH), wing: false, onWing: null };
  }
  return { port, stand, ladder };
}

// Every type's plan as parked (tests, report): heights from the model.
export function needsLadder(ac, kind, portH) { return !!servicePlan(ac, kind, portH).ladder; }
