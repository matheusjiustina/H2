# AGRO WINGS

Agricultural aviation on a Mato Grosso farm (Fazenda Boa Esperança, fictional).
Three.js + Vite, everything procedural (no external assets), built into a
single self-contained `dist/index.html`.

Three aircraft share the world and are chosen on the title screen:
**AIRCRAFT 01 · Original** — the EMB-202A Ipanema (PR-AGW),
**AIRCRAFT 02 · Air Tractor** — an AT-502B turboprop (PR-AWT), and
**AIRCRAFT 03 · Robinson R44** — an R44 Raven II helicopter in an
agricultural configuration (PR-AGH, "Rotary-Wing Agricultural Aircraft").
The airplanes not selected wait parked on the west apron; the helicopter
waits on its own pad at the east end of the apron.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/index.html (single file)
npm test           # flight (all three aircraft) + spray validation (Node)
```

URL option: `?q=low|medium|high` forces a graphics preset (otherwise the
first run measures the frame time on the title screen and steps the preset
down or up once; a manual choice in Settings turns that off).

Settings → Environment: time of day (dawn, morning, midday, golden hour,
dusk) and weather (clear, partly cloudy, overcast, light rain, morning mist).
Weather and time of day are visual and audio only — the flight model's wind
is the Wind setting, as before. Settings → Cockpit shake: off / low / normal.

## Gameplay loop

Service orders (3 contracts) → load sheet (fuel / application liquid) → the
badeco services the aircraft on the pad → engine start → taxi → take-off →
spray passes → return → landing → taxi to the pad → shut down → results and
payment in Cr$ → next order. Partial work can be handed in; landing for a
reload keeps the coverage (also saved in `localStorage`). Free flight mode
starts on the pad or airborne.

Contracts (`src/game/contracts.js`):

| id | Talhão | Crop | Area | Challenge |
| --- | --- | --- | --- | --- |
| soy | T-07 | soybean 0.8 m | 18.4 ha | wide, flat, beside the strip — learn the circuit |
| corn | T-12 | corn 2.4 m | 16.1 ha | tall canopy on a swell, tree line along the south edge, power line past the east end |
| cotton | T-03A + T-03B | cotton 1.2 m | 13.8 ha | two fields split by the creek — valve off over the gap |

Evaluation: useful coverage (dose ≥ 0.7 of target), uniformity (1 − CV of
dose), gaps, overlap (dose > 1.5), waste (off-target + drift/evaporation +
over-application) and aircraft condition (repairs).

## Controls

Flight keys come in two schemes for every aircraft — Settings → Flying →
**Flight keys** picks one (the choice is saved; the default is the numpad
scheme). Everything else is the same in both.

| Action | Numpad scheme (default) | Classic scheme (Tidemark layout) |
| --- | --- | --- |
| Stick forward / back (R44: cyclic) | Num 8 / Num 5 | W / S (↑ ↓) |
| Roll left / right (R44: cyclic) | Num 4 / Num 6 | A / D (← →) — also steer on the ground |
| Rudder left / right (R44: pedals) | Q / E | Z / X |
| Engine | hold I to start, tap I to stop | hold Q to start, tap Q to stop |

| Action | Keys (both schemes) |
| --- | --- |
| Power (R44: collective) | Shift / Ctrl (R / F), mouse wheel |
| Brakes (differential with rudder) | Space |
| Flaps | G (up) / B (down) |
| Trim | [ / ] (Page Up / Page Down) |
| Spray valve | C (Enter) |
| Cockpit / chase | V |
| Free external camera | O |
| Service / interact | E |
| Map / coverage overlay / contracts | M / K / J |
| Minimap: farm map ↔ GPS guidance page | N (or click the minimap) |
| Reset aircraft | Backspace |
| Speed up ground service | hold T |

In the numpad scheme Q and E are the rudder, so the engine moves to I (a
tap on Q, a rudder input, must not shut the engine down). E is also the
service key: it only acts at the pad with the engine off, where the rudder
does nothing. The two schemes are separate sets of bindings, so rebinding a
numpad key never takes a key away from the classic ones, and the other way
round.

All bindings are rebindable in Settings. Mouse: left-drag looks, right-drag
is a virtual stick. Gamepad: left stick, triggers = power, bumpers = rudder,
A = spray, B = brakes. Touch devices get a stick, a power slider and buttons.

## Flight model

`src/flight/flightModel.js` is a port of the Tidemark floatplane model: same
lift/drag/stall blending, stability derivatives, prop wash on the tail,
engine torque and p-factor, ground effect and gyroscopic terms, and the same
assist control law (`src/flight/assist.js`, modes off / normal / high) and
input shaping rates. Changes for an agricultural taildragger:

- spring/damper main gear and steerable tailwheel, rolling resistance per
  surface, brakes (differential with rudder), small ground irregularities;
- engine: Lycoming IO-540 on ethanol as on the EMB-202A, 320 hp (the
  alcohol engine gives ~7 % more than the 300 hp avgas one); fixed climb-pitch
  prop: static thrust fades toward pitch speed, windmill drag at idle (gives
  a real glide). Measured: ~990 ft/min at 1,800 kg and 70 kt (published
  930 ft/min for the 300 hp engine), ~124 kt top speed (published 121 kt);
- stall-warning vane: the horn sounds ~4° before the critical angle, so a
  hard pull or an over-steep loaded turn is heard before the wing quits;
- fuel burn and starvation; crop-canopy drag and crop strikes.

- mass, inertia and CG change with fuel and hopper load; MTOW 1,800 kg as on
  the EMB-202 (the load sheet warns above it and shows the steepest bank
  the wing can hold level at 90 kt for that load);
- stalled in a turn, the slower inner wing drops and roll damping is lost.

The simulation runs at a fixed 120 Hz with an accumulator and render
interpolation. All tuning values live in `src/config.js`.

### Assist and the balão

`src/flight/assist.js` (mode *normal*) is tuned for agricultural flying:

- rate command with expo: fine control near centre, full stick rolls
  ~75°/s and pitches ~26°/s; no bank limit below 80° while the stick is held.
  The elevator gets a feed-forward of what the commanded pitch rate needs
  (the pitch damping), the way a pilot's hand moves the stick at once: full
  back stick reaches the commanded rate in ~0.3 s and ~1.9 g in 0.5 s at
  90 kt (before, the loop only reached ~75 % of the rate and the g took over
  a second, which made pull-outs from the balão feel heavy);
- stick released: flight-path hold. In a bank the assist asks for the load
  factor n = cos γ / cos φ that keeps the climb or descent, but never more
  than the wing can give at that speed and weight. Beyond that the nose
  falls and the aircraft descends — the real energy trade of a steep turn.
  A level turn settles at the bank the wing can sustain; a climbing aircraft
  (top of the balão) keeps up to 75°; a held climb flattens as speed bleeds;
- stall protection anticipates the alpha trend and the path rotation
  (α̇ = q − γ̇), g protection at +3.8 / −1 g.

The balão at the end of each pass is flown as in the field: valve off, pull
up (~2.2–2.5 g, +25–40 m), turn ~45° away, bank 60–75° back toward the next
swath at the slow top, let the nose fall and dive back to 3 m. The HUD's
LOAD readout shows the g. Measured with the test pilot (`npm test`): 60°
bank in 1.1 s, 45° turns hold height within ~7 m, a balão with 560 L tops
out ~29 m above the pass and ends above it, never stalling.

## Tests

`npm test` runs `test/flight.test.mjs` (PR-AGW), `test/at502.test.mjs`
(AT-502B), `test/r44.test.mjs` (R44) and `test/spray.test.mjs` (Node).
Browser checks (need `npm run build && npx vite preview --port 4173`):

- `node test/e2e.mjs soy out/` — full contract flown by the test autopilot
  (`src/game/autopilot.js`) through the normal player inputs only;
- `node test/keys.mjs out/` — the numpad and classic key schemes with real
  key codes on all three aircraft (stick, roll, rudder, power, engine
  hold/tap), the HUD / Controls / Settings screens and rebinding;
- `node test/e2e_ui.mjs out/` — service interruption, crash + recovery,
  stuck reset, key rebinding, tutorial, mobile layout;
- `node test/perf.mjs` — per-view tick/render time, draw calls, triangles;
- `node test/profile.mjs <low|medium|high> <ipanema|at502|r44>` — load time,
  GPU object counts, JS heap, tick and frame avg/p95/p99 per view;
- `node test/envviews.mjs out/ [times] [weathers] [views]` — renders per
  time of day × weather; `node test/atmo_transition.mjs` — gradual blends;
- `node test/truck.mjs out/ [dx dz headingDeg]` — service truck cycle with
  timings, closest approach to the aircraft and loads;
- `node test/gpsview.mjs out/` — HUD GPS page and the cockpit unit;
- `AC=r44 node test/e2e.mjs soy out/` — the contract flown by the
  helicopter test autopilot (`src/game/heliAutopilot.js`);
  `node test/r44flight.mjs out/` — the R44 picked on the title screen and
  flown with the keyboard (start, spool-up, lift-off, hover, pedal turn,
  forward flight) with screenshots; `AC=r44 node test/truck.mjs out/ dx dz
  hdg` — service at the helipad.

### Measured in this container (Chromium + SwiftShader, 1280×720)

The container has no GPU, so render times are only the CPU cost of handing
frames to a software rasteriser and say nothing about real FPS. Game logic
time and scene complexity carry over to real hardware:

| preset | view | logic ms/frame | draw calls | triangles |
| --- | --- | --- | --- | --- |
| low | parked on the pad (chase) | 1.38 | 426 | 668k |
| low | spraying soy at 4 m (chase) | 2.58 | 369 | 574k |
| low | cockpit over corn | 2.60 | 361 | 931k |
| low | 400 m AGL | 2.25 | 327 | 489k |
| medium | spraying soy at 4 m | 4.01 | 379 | 582k |
| medium | cockpit over corn | 3.38 | 378 | 1054k |
| high | parked on the pad | 1.40 | 427 | 696k |
| high | spraying soy at 4 m | 3.91 | 381 | 585k |
| high | cockpit over corn | 3.81 | 378 | 1057k |

The logic column averages only 8 frames and moves by ±1 ms between runs of
the same build. Averaged over 600 frames while flying at spray speed over
pasture and over the soy (grass streaming and crop rows included), a tick
costs 0.6–0.7 ms on both low and high presets, the same as before the
world upgrade (0.5–0.8 ms). The detailed aircraft and world together cost
about 80 draw calls and 130k triangles more than the first build (parked on
the pad: 343 → 426 calls, 541k → 668k triangles).

SwiftShader stalls for 80–110 s on one frame when the spray mist first
appears and once in the 400 m view (no new WebGL program is linked; the
software rasteriser builds its pipelines then). The build before the
aircraft overhaul stalls on the same frames, so they are not a cost of the
new model.

With two aircraft (this build): flying the PR-AGW with the parked AT in
view on the pad costs 459 calls / 721k triangles (low; 435 / 655k before);
views where the parked aircraft is not on screen are unchanged (369 calls
spraying, 361 in the cockpit, 327 at 400 m). Flying the AT: 382 / 370 / 339
calls in those views, +11 to +13 over the PR-AGW. Logic averaged over 600
frames: PR-AGW 0.34–0.70 ms, AT 0.37–0.78 ms (it flies 28 % faster, so
grass cells stream in more often). The parked aircraft is not simulated,
its cockpit and pilot are hidden and it is not drawn beyond 1.2 km.

FPS on a real GPU was not measured here; the in-game counter (Settings →
Show FPS) reports fps, draw calls and triangles live.

### Validation runs (final build)

- `npm test`: 24/24 (flight model incl. braked pivot, aileron authority,
  pitch response, loaded pull-out, steep turns and the balão; spray
  deposition).
- `node test/worldviews.mjs`: world look-dev from the apron, strip, crops,
  forest, creek, HQ, the air, chase and cockpit (before/after compared).
- `node test/e2e_ui.mjs`: 15/15 (badeco service, abort and veto, crash,
  stuck reset, rebinding, tutorial, touch layout).
- `node test/e2e.mjs soy`: full contract in the browser through the player
  inputs — service, taxi, take-off, 12 passes, landing, taxi-in, second
  service, second sortie, 90 % coverage, results and payment.
- Look-dev renders (`test/planeviews.mjs`): livery, stripes, PR-AGW and the
  flag unchanged from every angle; ailerons, flaps, elevator and rudder
  deflect on their hinges; the propeller goes from blades to disc with rpm.
- `REFILL=1 node test/apsim.mjs soy|corn|cotton 4500`: all three contracts in
  Node with the farm-HQ and base colliders, one reload each (560/520/500 L
  loads within MTOW), 90 % coverage, no hard landing, parked at the pad.

Air Tractor expansion (this build):

- `npm test`: 35/35 — the PR-AGW suite unchanged, 10 AT-502B checks
  against published figures, and an AT spray pass (flat 0.88 dose plateau
  over a 30 m swath).
- `AC=at502 node test/e2e.mjs soy`: the whole contract in the browser with
  the AT through the player inputs — crew service (+1,178 L), PT6 start,
  taxi, take-off, passes, landing, taxi-in, park — 90 % in one sortie.
  `node test/e2e.mjs soy` (PR-AGW): two sorties, 90 %, as before.
- `node test/e2e_ui.mjs`: 15/15.
- `AC=at502 REFILL=1 node test/apsim.mjs soy 2400`: 90 % in one load, parked
  at the pad (the Node sim needed a no-op canvas since the world upgrade).
- PR-AGW unchanged: seeded trajectory identical to the previous build;
  model geometry and materials identical (117 meshes, 218,895 vertices).
- Look-dev of the AT from the front, sides, rear, above, under, close-ups
  and the cockpit (`LOOKDEV_VIEWS` + `selectAircraft('at502')`).

## World

The farm layout, strip, roads, fields and colliders are unchanged
(`src/world/layout.js`, `terrainData.js`); everything below is how the
world is drawn, built for perceived realism at low cost.

- **Trees** (`foliage.js`, `vegetation.js`): every plant is a cloud of
  alpha-tested leaf-cluster cards around a tapered trunk with branches, with
  "spherized" normals so a crown lights as a volume. One procedural 4×4 atlas
  (1024²) holds broadleaf and fine (leguminous) clusters, eucalyptus, ipê in
  bloom, buriti fronds, mango, shrub, two barks and two grass tufts, so each
  variant is one geometry, one material and one instanced draw per 500 m
  cell (two LODs: ~400 tris near, ~50 far). Alpha is boosted with the mip
  level so far crowns stay full. Species: mata/cerrado broadleaves, mango
  shade trees, ipê-amarelo, eucalyptus windbreaks, buriti palms by the
  creek, shrubby forest borders, scrub on road verges, cupinzeiros (termite
  mounds) in the pasture. The original trees and their colliders keep their
  exact positions; the extra detail uses its own random stream.
- **Grass** (`grass.js`): instanced green and dry tufts in 16 m cells
  streamed around the camera on pasture and verges only (2 draws), swaying
  in the wind and shrinking into the ground at the edge of the radius (45 /
  60 / 75 m by preset); off above 120 m.
- **Crops** (`crops.js`): canopy textures with individual plants, closed
  rows and straw in the inter-row; from the air the ground sprayer's
  tramlines (two wheel tracks every 27 m) and the headlands, where rows run
  across and the turning track shows; near the ground the rows under the
  tramlines are missing, so the tracks are real gaps.
- **Ground** (`terrain.js`): olive braquiária with dry patches instead of a
  flat green, muted red latosol, carreadores with wheel tracks and a rank
  verge, farm roads with ruts and grass between them; a tileable
  micro-detail texture (pebbles, dry-soil cracks, grass clumps) adds colour
  break-up and a ~2 cm bump close up and fades out with distance so nothing
  tiles from the air. The strip is compacted laterite with two darker wheel
  tracks, worn turn-arounds, tyre scuffs and grass creeping in at the edges;
  the apron has taxi tracks, a worn pad and oil stains by the fuel tank.
- **Base and farm** (`vehicles.js`, `structures.js`): double-cab support
  pickup with a tank in the bed, cab-over tanker with walkway, rail, domes,
  ladder and valve cabinet, IBC totes and drum pallets at the chemical
  store, an office container, a fire point; at the farm HQ a tractor, a
  combine with its platform and a self-propelled sprayer. Vehicles are
  extruded side profiles, rounded boxes and lathed tyres merged into the
  static per-material meshes, so they add no draw calls of their own.

`node test/worldviews.mjs <dir> [view,...]` renders the world look-dev views
(apron, service area, strip, low passes over each crop, forest, creek, HQ,
aerial, chase while spraying, cockpit).

## Aircraft

Modelled on the EMB-202 Ipanema (own registration PR-AGW): orange with navy
stripes and the Brazilian flag on the fin, dark anti-glare hopper deck,
raised cabin, tall tubular main gear, 3-blade prop, booms with nozzles on
drop tubes and a wind-driven pump. The cockpit follows a real Ipanema panel:
light grey, warning lamps, round gauges, switch rows, a guidance GPS in a
black bezel, lightbar at the centre post and a hopper sight window that
shows the live liquid level.

The model (`src/aircraft/model.js`) is purely visual: the flight model, gear
contact points, colliders and mass in `src/config.js` do not read it (it only
reads the gear points to place the wheels), so the look can change without
changing how the aircraft flies.

- **Fuselage**: stations interpolated along Catmull-Rom splines and lofted
  as superellipse rings (separate upper/lower roundness), so the cowling,
  cabin and tail cone are single smooth surfaces; the turtle deck is part of
  the aft loft rather than a separate box.
- **Livery**: side-projected 2048×1024 canvas with a matching bump map, so
  panel seams, rivet rows, inspection doors, louvres and the orange-peel of
  the paint are in relief; stripes, PR-AGW, AGRO WINGS and the flag are drawn
  in the same places as before.
- **Wings and tail**: real airfoil sections, Hoerner wingtips, ailerons,
  flaps, elevator and rudder hinged at their spars (with trim tabs), panel
  and rib lines in relief, walkway, fuel cap, hinge brackets, pitot,
  navigation lights.
- **Cabin**: curved windshield, tubular frame with joints, door handles and
  hinges, headliner; inside, a tubular cage, rounded seat with harness,
  gauge bezels with depth, pedals, stick with grip and trigger, throttle and
  prop levers; the pilot wears a flight suit (collar, zip, chest pockets),
  a four-point harness, a flight helmet with visor housing, tinted visor,
  boom mic and the filtered-air hose ag pilots use, a kneeboard on the right
  thigh, and has gloved hands on the stick and throttle (static parts merged
  per material).
- **Gear**: lathed tyres with sidewall and tread bump, hubs with bolts and
  valve stems, brake discs and calipers, A-frame legs with fittings and
  brake lines; leaf-spring tailwheel with fork.
- **Propeller**: three twisted blades (pitch angle from radius) with yellow
  tips, fading into a translucent disc with blade-shadow lobes as rpm rises,
  driven by the engine rpm as before.
- **Materials and light**: physical paint with a light clearcoat and its own
  environment reflection, metal, rubber and glass; ambient occlusion baked
  into vertex colours; a soft contact shadow under the aircraft near the
  ground; shadow normal offset scaled to the shadow texel size so the
  aircraft keeps its fine self-shadowing.
- **Cost**: parts are merged per material; nozzles, bolts, hinge brackets
  and other small fittings sit in a level-of-detail group dropped
  beyond 80 m.

`node test/planeviews.mjs <dir> [view,...]` renders the look-dev angles
(exterior close-ups, low sun, against the sun, cockpit); `LOOKDEV_VIEWS`
points it at a JSON list of custom views, each with an optional `post`
snippet (e.g. deflect the control surfaces) run before the render.

## Aircraft 02 — Air Tractor AT-502B (PR-AWT)

A second, independent aircraft. The Ipanema keeps its paint, registration,
configuration and flight model: its trajectory is bit-identical to the
previous build (seeded comparison) and its model's 117 meshes have the same
geometry, normals, UVs, vertex colours and materials (checksum in the
browser).

**Reference.** The uploaded video is game footage of a yellow Air Tractor
(blue cheat line with white pinstripes, blue fin and rudder, blue wingtip
bands, three-blade prop with a silver spinner, booms under the trailing edge,
spring-steel gear with white hubs, framed canopy, dark panel with round
gauges, stick with a red button); its features match the AT-502B. The
YouTube link could not be opened from this environment. The reference's
registration is not used.

**Published figures used** (Air Tractor AT-502B spec sheet, dealer and
operator data, Wikipedia AT-500 family):

| | |
| --- | --- |
| Engine | P&WC PT6A-34AG, 750 shp flat-rated, prop 2,200 rpm |
| Propeller | Hartzell 3-blade constant speed, 2.82 m |
| Span / wing area | 15.85 m (52 ft) / 29.0 m² (312 ft²) |
| Empty / max take-off | ≈ 2,073 kg (4,570 lb) / 4,264 kg (9,400 lb) |
| Hopper / fuel | 1,893 L (500 US gal) / 643 L (170 US gal) |
| Stall at 8,000 lb | 71 kt flaps up, 59 kt flaps down |
| Climb at 9,400 lb | 870 ft/min |
| Working speed | 120–145 mph |

Derived here (not published): CLmax 1.50/2.18 from the stall speeds; CD0
0.058 and Oswald 0.80 so the climb and a 75 %-power cruise of 134 kt at
8,000 ft come out of one polar; inertias scaled from mass and size; static
thrust ≈ 12.5 kN (figure of merit 0.64); fuel flow from ~0.6 lb/shp/h. No
speed multipliers: every number above enters the same equations as the
Ipanema's (`FLIGHT_AT502` in `src/config.js`).

**PT6A model** (`FlightModel._turbine`, `_propThrust`): the power lever
schedules gas-generator speed Ng, reached within the fuel control's
acceleration limits (≈ 3.7 s from idle to 90 % torque, the turbine lag a
pilot feels); shaft power follows Ng and is flat-rated; the constant-speed
prop governs 2,200 rpm and sits on its fine stop at low power, where the
windmilling disc makes drag; on the ground at idle the prop goes into beta.
Thrust comes from actuator-disc momentum theory with losses. Start: starter
to ~17 % Ng, light-off at 3.2 s (ITT peak, whoosh), ground idle 53 % Ng /
1,150 rpm at ~12 s. Shutdown: the spools run down over ~15 s and the prop
feathers. Torque (ft·lb), ITT, Ng, Np and fuel flow drive the cockpit gauges.

**Measured** (`node --test test/at502.test.mjs`):

| check | result | published |
| --- | --- | --- |
| climb, 9,400 lb, 95 kt | 847 ft/min | 870 ft/min |
| 1 g stall, 8,000 lb, flaps up | 73 kt | 71 kt |
| full power level, 8,000 lb | 139 kt IAS, 255 L/h | — |
| 62 % power lever | 113 kt (working speed) | 104–126 kt |
| ground roll 2,672 / 4,264 kg | 188 / 485 m | — |
| spool-up idle → 90 % torque | 3.7 s | — |
| roll to 60° (1,000 L) | 1.2 s | — |
| balão with 1,200 L | no stall, +44 m | — |
| landing with beta + brakes | 0.5 m/s touchdown, 261 m roll | — |

Spray: a 14 m boom with 50 nozzles; swath 30 m (scaled from the real ~21 m
the same way as the Ipanema's) and 6.4 L/s, the same 40 L/ha dose at a
117 kt working speed. A full hopper covers the soybean contract in one
sortie (Node autopilot: 90 % coverage, single load).

**Model** (`src/aircraft/atModel.js`, shared helpers from `model.js`):
lofted fuselage with the long PT6 cowling, matte anti-glare strip, chin
intake with screen, oval exhaust stacks with soot, big hopper lid, open
cabin under a framed canopy (curved windshield, doors, tinted roof),
wire cutter and deflector cable to the fin; constant-chord cantilever wing
with large flaps and long ailerons on their hinges, blue tip caps, nav and
strobe lights, landing lights, walkway and tank caps; booms on streamlined
hangers with check valves and nozzles; fan-driven pump; spring-steel main
gear (flexes with the suspension), white hubs, brakes; steerable tailwheel;
strut-braced tailplane, fin and slanted-hinge rudder, beacon. The polished
spinner carries three twisted blades that feather when the engine is
stopped, come out of feather in the start, and coarsen with speed. Cockpit:
dark panel with airspeed, attitude, altimeter, turn coordinator, heading,
VSI, torque, ITT, Ng, prop rpm, fuel, fuel flow, oil, hopper, flaps,
annunciators (BETA, START, GEN, CHIP…), the guidance GPS, flow monitor,
lightbar, hopper sight gauge; PT6 quadrant (power, prop and condition
levers). The seated pilot is the same model as the Ipanema's, laid into
this cockpit with the hands on the stick and power lever.

**Architecture.** `src/aircraft/types.js` is the registry: each type
carries its flight profile, model and panel factories, spray boom, crew
service points, collision bounds, cameras, audio profile and loads. Every
system reads the active aircraft (`game.aircraft`); the game keeps a fleet,
parks the other aircraft (settled on its springs, pilot out, an obstacle for
the flown one, not drawn beyond 1.2 km) and swaps on selection. Per-type:
load sheet, HUD bars, crew service (rates and walking points), guidance
swath spacing, chase/orbit cameras, cockpit vibration, overspeed and
low-fuel warnings, and audio (`profile: 'turboprop'`: compressor whine and
gas-generator hum from Ng, exhaust roar with power, prop buzz from Np,
light-off whoosh). Key bindings are unchanged.

## Realism 4.0 (atmosphere, farm operations, GPS)

Added on top of the existing game without touching the flight model, the
assist, the aircraft configurations, liveries, controls, save data,
missions, map coordinates or runway (`git diff checkpoint-before-realism-4
-- src/flight` is empty; `src/config.js` only gained `rainDrops` per preset).

**Atmosphere** (`src/world/atmosphere.js`, `sky.js`). Five times of day
(dawn, morning, midday, golden hour, dusk) × five weather presets (clear,
partly cloudy, overcast, light rain, morning mist), chosen in Settings and
saved. Each preset drives the Preetham sky, the sun's direction, colour,
intensity and shadow strength, the hemisphere light, the haze colour and
density, exposure, the cumulus cover (whole clouds fade in/out), an
overcast deck with horizon haze (one sky-dome draw), exponential height
mist that settles in the low ground (added to three's stock fog chunks
once, so no extra shader programs), GPU rain streaks (one instanced draw,
motion-blurred along the drop's speed relative to the eye, faded near the
eye so no drops appear inside the cabin), wet ground (darker, glossier
soil and roads; soaks in ~40 s, dries in ~2 min) and the ambience (rain,
breeze, birds, insects). Changes blend over ~5 s; the sky lighting (PMREM)
is re-baked once when the blend settles. Morning + partly cloudy reproduces
the previous look (mean pixel difference 0.2–1.8/255 in the same views; the
rest is the truck's new bay and the wind sway).

Weather is visual and audio only. The *visual* wind is the flight model's
own mean wind (`windAt`, same scale setting) mirrored into one shared
uniform that sways grass, trees (crowns bend downwind with travelling
gusts, leaves flutter), crop rows and canopy (wind waves), and slants the
rain. No aerodynamic wind solver was added and the physics never reads it.

**Service truck** (`src/crew/truck.js`, `planner.js`). The support tanker
(calda + fuel, rear reels, pump, amber beacon, brake/reverse lights,
headlights in low light, "BADECO · APOIO AGRÍCOLA") waits in a bay by the
crew post. On a service request it drives to a stand off the service-side
wingtip, facing aft with its reels level with the wing leading edge:
hybrid A* over (x, z, heading) with forward and reverse arcs at a 9.2 m
turning radius (the truck's lock is 0.6 rad on a 5.3 m wheelbase), around
the static colliders and every aircraft's footprint (+0.8 m), the truck
checked as a chain of circles. The search is spread over frames (3 ms each,
no hitch). Driving: kinematic bicycle model, rate-limited steering, pure
pursuit, accel/brake limits, corner and stop-distance speed limits, a
straight lead-in to the stand, live look-ahead braking for aircraft and
the badeco; wheels spin and steer, the body pitches and rolls. The badeco
walks to its reels along grid-A* paths around the truck and the aircraft,
runs the hoses as before, the truck backs out and returns to its bay
(either heading), and the aircraft is released once it is clear. If no
stand is reachable the station hoses are used, as before. The truck is an
obstacle for the aircraft and vetoes engine start while beside it.
Measured (`test/truck.mjs`): arrives in 24–32 s, parks within 0.25 m / 1°
of the stand, closest approach to an aircraft 0.88–1.35 m, standard and
off-centre parking (4 m, 60°; −5 m, 120° on the other side) for both
aircraft.

**Hangar.** Portal frames and purlins, corrugated inner lining, concrete
floor that darkens with depth (sky light cut by the roof), safety lines,
tool chest, wing trestles, spare hopper, parts pallet, ladder, drums on a
spill tray; four corrugated sliding door leaves on two top tracks (one
instanced draw) that close at dusk and open when an aircraft comes near;
high-bay lamps with light pools on the floor (no real lights). Colliders
are now the walls, roof and equipment, so an aircraft can taxi in when
the doors are open. Grass no longer grows through the slab.

**Farm activity.** A tractor with a disc harrow works the fallow T-08 lane
by lane with headland turns, raising dust; its pose is a function of time,
so updates are throttled with distance (every frame < 500 m, 8 Hz to
1.2 km, hidden beyond 800 m) and it costs nothing far away.

**Vehicles.** Shared materials; wheels are two instanced meshes per
vehicle; only the big parts cast shadows; small parts (lenses, reels,
decals, beacon) are hidden beyond 220 m and the whole vehicle beyond
800–900 m.

**GPS and scoring.** The guidance unit records the flight track (where the
boom was spraying in yellow) and shows heading, ground speed, cross-track
error, spray state and flow, progress, remaining area and overlap, all from
live state. The same page is available on the HUD minimap (N or a click).
Results add flight time, sorties and work rate (ha/h) to coverage, gaps,
overlap, uniformity and waste. The spray plume is finer and more
translucent (smaller growth, lower opacity, lit by the scene light).

**Cockpit and pilot.** Settings → Cockpit shake (off / low / normal) scales
the engine/ground vibration and the g head-sink. The pilot's head (exterior
views) looks into turns, along the boom on spray passes and out of the side
while taxiing, and dips under g.

**Audio.** Rain (muffled in the cabin), the truck's diesel with distance,
the tractor drone near T-08, tools and ratchets near the hangar, gustier
breeze, fewer birds in rain; aircraft audio unchanged.

**Performance manager.** First run only: the title screen's frame time
picks the preset (steps down under ~33 fps, up over ~80 fps); a manual
choice turns it off; `?q=` forces a preset. Settings → Show FPS now shows
frame-time average and p95, draw calls, triangles and the preset.

**Measured** (`test/profile.mjs`, SwiftShader, 960×540; tick = game logic
ms/frame over 120 ticks; "before" is the build tagged
`checkpoint-before-realism-4`, default morning / partly cloudy):

| preset · aircraft | view | tick avg (p95) before → after | draw calls | triangles |
| --- | --- | --- | --- | --- |
| low · PR-AGW | pad (chase) | 0.36 (0.5) → 0.57 (0.8) | 463 → 486 | 738k → 737k |
| low · PR-AGW | spraying soy, 4 m | 1.22 (2.7) → 0.84 (1.6) | 370 → 378 | 550k → 545k |
| low · PR-AGW | cockpit over corn | 0.82 (1.9) → 0.76 (1.5) | 362 → 362 | 912k → 912k |
| low · PR-AGW | 400 m AGL | 0.50 (0.6) → 0.66 (1.1) | 323 → 329 | 478k → 478k |
| high · PR-AGW | pad | 0.57 (0.7) → 0.52 (0.7) | 464 → 487 | 766k → 764k |
| high · PR-AGW | spraying soy | 1.74 (5.8) → 1.17 (2.3) | 398 → 408 | 572k → 569k |
| high · PR-AGW | cockpit over corn | 1.09 (2.0) → 1.49 (5.0) | 389 → 389 | 924k → 924k |
| high · AT-502B | pad | 0.53 (0.9) → 0.86 (1.8) | 476 → 504 | 784k → 785k |
| high · AT-502B | spraying soy | 1.99 (4.7) → 1.15 (1.9) | 400 → 410 | 568k → 573k |
| high · AT-502B | cockpit over corn | 1.40 (3.9) → 1.08 (2.2) | 392 → 392 | 952k → 952k |

Tick differences of a few tenths of a millisecond either way are run-to-run
noise in this container. Load to first frame: 19.5 → 19.3 s (low),
23.0 → 23.5 s (high), 22.2 → 21.7 s (AT). GPU objects: +17–28 geometries,
+1–2 textures, +6–8 shader programs (cloud deck, rain, hangar shading,
instanced wheels, sprites); JS heap 124–145 → 138–156 MB. The extra draw
calls on the pad are the truck and the hangar seen up close; in flight
they are the far tractor and the hangar slab (+6 to +10); the cockpit view
is unchanged. Sky-light re-bake on a weather/time change: ~40 ms in
SwiftShader, once per change. Truck route search: ~120–370 ms of CPU in
total in this container, spread at 3 ms per frame.

**Validation (this build).** `npm test` 35/35. `node test/e2e.mjs soy`
(PR-AGW): two sorties with the truck servicing, 90 %, 2★ (as before).
`AC=at502 node test/e2e.mjs soy`: one sortie, 90 %, 1★ / Cr$ 5,093 (the
pre-change build gave 2★ / Cr$ 4,993 on the same run: the AT sits at the
2★ uniformity/waste threshold and the truck's drive shifts when the passes
are flown, i.e. the gust phase; deposition, contracts and autopilot code
are unchanged). `node test/e2e_ui.mjs` 16/16 (one check now waits for the
truck to arrive; one new check: truck parked at its stand).
`node test/atmo_transition.mjs`: rain, dusk and back to morning blend over
~5–20 s, one sky re-bake each, no errors. Renders of all five times of day
and five weathers from the apron, the air and the chase camera; the
default look compared pixel-by-pixel with the previous build.

**Known limits.** Time of day is a preset, not a running clock; there is
no night (dusk is the darkest). Rain has no splashes or drops on the
windscreen; puddles are not modelled (the ground just gets wet). The
overcast deck is a sky-dome layer, not volumetric. The truck cannot reach
every possible parking pose inside the pad circle; then the fixed station
hoses are used as before. Only one farm vehicle works the fields. Real-GPU
frame times were not measured (no GPU here); use Settings → Show FPS.

## Aircraft 03 — Robinson R44 Raven II, agricultural (PR-AGH)

The third aircraft and the first rotary-wing one, added as a separate
aircraft: the airplanes keep their models, configurations and flight
solver (`src/flight/flightModel.js`, `src/flight/assist.js` and
`src/aircraft/aircraft.js` are not modified). The game creates a
`Helicopter` (`src/aircraft/helicopter.js`) for types with `kind: 'heli'`
and an `Aircraft` for the others; both expose the same interface, so the
crew, truck, sprayer, GPS, HUD, cameras, missions and save data work with
either. Title screen: AIRCRAFT 03 · ROBINSON R44 — "Rotary-Wing
Agricultural Aircraft".

**Tropical Island source.** The request was to reuse the Tropical Island
helicopter simulation where its source is accessible. It is not: this
environment can reach only the H2 repository, which has no Tropical Island
code. Nothing was imported from it. The helicopter model below was written
for this game from standard rotorcraft theory.

**References.** The two uploaded videos are game footage of a red R44 mod
on a gravel H pad (walk-around, start-up, hover, cockpit). They were used
for the overall look (red paint, gravel pad with a painted H, pedestal
console, T-bar cyclic). The mod's 800 L tank is not used.

**Published figures used** (R44 Raven II): two-blade main rotor, 33 ft
(10.06 m) diameter, turning counter-clockwise seen from above; two-blade
58 in (1.47 m) tail rotor with the advancing blade at the bottom; 100 % =
400 rotor rpm / 2,665 engine rpm, power-on limits 101–102 %, green 90–108 %,
low-rpm horn at 97 %; MTOW 2,500 lb (1,134 kg), empty ~1,505 lb (683 kg);
Lycoming IO-540-AE1A5 derated to 245 hp take-off (5 min) and 205 hp
continuous; fuel 29.5 + 17.0 US gal usable (176 L); length 38 ft 3 in,
height 10 ft 9 in; cruise 109–117 kt, Vne 130 kt; hover ceilings IGE /
OGE ~8,950 / ~7,500 ft. Sources: Robinson's R44 Raven II page and POH
(as quoted by POH study cards), Wikipedia, Vertipedia, AOPA, Aensa, Plane
& Pilot. Robinson's own site and Wikipedia could not be fetched from this
container; the figures were cross-checked in search results.
**Estimates** (marked as such in `FLIGHT_R44`, chosen to reproduce the
published performance): blade chord, rotor inertia, Lock number, airframe
inertias and drag areas, tail-rotor arm, chord and pitch range, skid tread
and spring rates, the ag kit's mass.

**Agricultural kit.** No crewed R44 ag kit with a published capacity was
found (the 110 US gal figure that turns up belongs to the unmanned R44
Sprayhawk). The game uses a 250 L virtual tank — what fits under the MTOW
with an 85 kg pilot, the ag kit (42 kg, estimate) and ~80 L of fuel; full
fuel and a full tank is over the MTOW and the load sheet says so. Belly
tank between the cross tubes, engine-driven pump (it works in the hover,
unlike the airplanes' wind-driven pumps), 8 m boom under the nose (80 % of
the rotor diameter, kept inside the rotor wake) with 28 nozzles on drops,
13 m swath and 1.3 L/s (the contracts' 40 L/ha at ~50 kt). The rotor
downwash pushes the droplets down at low speed (shorter fall time, less
drift); at working speed the wake trails behind the boom.

**Flight model** (`src/flight/heliModel.js`, 120 Hz):
- main rotor: blade-element thrust with momentum inflow solved each step
  (translational lift, climb and descent), ground effect after Cheeseman
  and Bennett (induced velocity × (1 − (R/4z)²), canopy counts half),
  vortex-ring thrust loss with buffet when descending into the wake at low
  speed, profile + induced power, H-force;
- teetering rotor: no hub moment; the tip-path plane follows the cyclic
  with a first-order flapping lag (τ = 16/(γΩ)), flaps back with speed
  and lags the body rates (damping), so control is only the tilt of the
  thrust vector;
- rotor speed from the rotor inertia: a governed, density-limited piston
  engine drives it through a belt clutch and a sprag clutch; over-pitching
  droops it (LOW RPM horn below 97 %), with the collective down in a
  descent it autorotates; the engine response has a lag;
- start-up as on the R44 (compressed): crank, catch, clutch engagement
  with the rotor spinning up from rest, warm-up, then the governor brings
  the rotor to 101.5 % and holds it; shut-down: the rotor runs down on its
  own inertia, the rotor brake is applied below 40 %;
- tail rotor on the gear train (6.065:1), its own inflow, thrust and
  power; shaft-torque reaction on the cabin (hover needs left pedal, the
  reaction reverses in autorotation);
- fuselage drag per axis, fin and stabiliser terms, quadratic yaw damping
  of the tail cone and fins;
- four skid contacts with spring/damper and stick/slip friction (no wheels:
  it does not roll), hard landing and skid collapse limits;
- never-touch points: rotor tips (tilted disc, coning or droop), tail rotor,
  stinger, nose, tank, boom ends; rotor tips against trees, buildings,
  parked aircraft, the truck and the wires.

**Controls.** Numpad 8 / 5 / 4 / 6 move the cyclic forward / aft / left /
right, Q / E are the anti-torque pedals, Shift / Ctrl (or R / F, the wheel,
the gamepad triggers, the touch slider) raise and lower the collective, I
starts (hold, collective down) and stops (tap) the engine; Settings → Flying
→ Flight keys switches to the classic keys (W/S/A/D, Z/X, Q). The governor
replaces a twist-grip throttle. Settings → Assist: **off** — raw controls
(unstable in the hover, as the real aircraft); **normal** — attitude
command / hold, heading hold (kept on the skids while the collective is
up, so the anti-torque pedal isn't dropped at touchdown), turn
coordination above ~35 kt; **high** — plus vertical-speed command / height
hold on the collective (never drooping the rotor below the green, and
easing the descent to ~0.5 m/s at touchdown), a hover hold with the stick
centred below ~55 kt and a speed hold above. The assists only move the
controls; the physics is the same.

**Checked against the published figures** (`test/r44.test.mjs`): hover at
1,134 kg OGE 204 hp (≤ 245 hp take-off), IGE at a 2 ft skid height
189 hp — the gap matches the published IGE/OGE ceilings; the load sheet's
trimmed estimate matches both flown values; level flight 109 kt at 195 hp
(published cruise 109–117 kt); climb at MTOW with 205 hp 1,153 ft/min
(published max ~1,000 ft/min); autorotation with the rotor at 105–109 %;
over-pitch at MTOW droops below 97 %; start to governed rpm with the skids
still; pedal turns and heading hold; forward, backward and sideways
translations; vertical lift-off, hover hold, landing on the skids.

**Model** (`src/aircraft/r44Model.js`, visual only). One lofted cabin
bubble cut exactly along the window outlines (two-piece windshield with a
centre post and the compass, four door windows with the swept rear upper
corner), rubber seals along every outline, a dark inner skin, door seams,
hinges and handles, landing lights; mast fairing; aft body with the open
engine bay (flat-six with finned cylinders, cooling scroll, exhaust,
muffler and tailpipe, steel tube frame); riveted tail cone; swept upper
fin, lower fin with the stinger, horizontal stabiliser, tail-rotor guard;
skid tubes on arched cross tubes with wear shoes; side-projected livery
(red, graphite belly, pinstripes, AGRO WINGS, PR-AGH, flag, placards) with
a bump map. Main rotor: mast, swashplate, teetering hub, pitch links, two
blades with twist and root doublers; coning at speed, droop at rest,
collective pitch, tip-path-plane tilt from the simulation. Tail rotor on
the left with red-tipped blades.

**Rotor blur.** Each rotor has a ring in its tip-path plane drawn with the
lit standard material, whose alpha is the blade coverage smeared over one
frame's exposure behind each blade (rotor speed × exposure, in radians),
plus a faint persistence of the swept disc. Stopped or slow, the solid
blades carry the look; as the rotor speeds up they fade and the smeared
sectors take over — never a permanently opaque disc. The tail rotor blurs
to a light disc at its higher speed.

**Cockpit** (`src/aircraft/r44Panel.js`): pedestal console with a live
pod — caution/warning lights (CLUTCH, ALT, OIL, MR/TR CHIP, LOW FUEL,
LOW RPM, STARTER, GOV OFF, ROTOR BRK, SPRAY), airspeed, attitude,
altimeter, the dual tachometer (rotor "R" and engine "E" needles),
manifold pressure, heading, VSI, turn/slip, oil pressure and temperature,
CHT, ammeter, fuel, ag tank, flow/height/rotor readout — and the lower
pedestal (guidance GPS, COM/XPDR, switch row). Guidance lightbar on the
pod. T-bar cyclic, collective with twist grip and the pedals move with the
simulation; the seated pilot (right seat, helmet) has the right hand on
the cyclic grip and the left on the collective (the forearm turns at the
elbow, the lever follows the hand), and looks down and out near the
ground and along the boom when spraying. The exact R44 instrument
arrangement varies between aircraft and is not claimed.

**Cameras and sound.** The chase camera follows the nose (a helicopter
flies sideways and backwards); the cockpit view adds a two-per-rev shake
in phase with the rotor, strongest through translational lift, at high
speed and in settling with power (Settings → Cockpit shake scales or
removes it). Audio profile `heli`: piston engine from engine rpm, the
starter and the engine catching, main-rotor blade passage as noise pulses
at 2/rev (chop and a low "whop", blade slap in descents), tail-rotor buzz
and main-gearbox whine — all from the rotor speed, so they spin up through
the clutch and run down after shut-down — with the cabin muffling and the
low-rpm horn.

**Farm integration.** Helipad at the east end of the apron (gravel, H and
touchdown circle; the runway, service pad and taxi route are unchanged).
The helicopter is serviced there: the crew waits until the rotor has
stopped; the truck parks ≥ 3 m clear of the stopped disc on either side
(its route search now also covers the grass east and north of the apron,
and tries both sides). When the helicopter is flown, both airplanes wait
on the west apron. Warnings: low rotor rpm, rotor overspeed, engine out
(autorotate), settling with power. HUD: rotor % in place of G. The test
autopilot (`src/game/heliAutopilot.js`) flies through the player's inputs
with the high assist: service, start, lift-off, transit, passes with
hover turnarounds at the field ends, return over obstacles, landing on
the H, shut-down, rotor run-down and the next service.

### Validation (R44 build)

All runs below are on the final build (`npm run build`, `vite preview`),
Chromium + SwiftShader in this container.

| # | check | evidence |
| --- | --- | --- |
| 1 | PR-AGW behaves exactly as before | seeded trajectory fingerprint (take-off, pull-up, turn, wind on) identical, byte for byte, to the commit before the R44 work; `flightModel.js`, `assist.js`, `aircraft.js` and `FLIGHT` untouched; `node test/e2e.mjs soy`: full contract, two sorties, 90 %, 2★, Cr$ 5,396 |
| 2 | Air Tractor functional | same fingerprint test with `FLIGHT_AT`: identical; `AC=at502 node test/e2e.mjs soy`: 90 % in one sortie, 2★, Cr$ 4,967 |
| 3 | R44 spawns correctly | `test/r44flight.mjs`: card 03 selects it; parked on the helipad at (-323, -48), heading 090, four skids on the ground, rotor STOPPED |
| 4 | main and tail rotors | counter-clockwise main rotor seen from above, advancing tail blade at the bottom, measured in the browser; solid blades at rest, short blur at ~25 %, blur disc with the blades faded at 100 %, solid again after the run-down |
| 5 | vertical take-off | off the skids 2.1 s after raising the collective, 3 m 0.9 s later, 0.5 m drift |
| 6 | stable hover | 20 s hands-off hover (high assist): 0.6 m drift, height within 0.04 m, rotor 101.5 % |
| 7 | translations | 10 m/s forward and backward, 14.6 / 11.0 m/s sideways left / right, climb +7 m and descent −7.6 m on the collective |
| 8 | yaw | left pedal −75° in 2 s then heading held (0.0° in 6 s); right pedal +91° |
| 9 | skids on the ground | landing from 52 kt: four skids, 0.82 m/s touchdown, no damage, skid heights −0.02 m; the test autopilot's seven landings in the contract run all ended on the H |
| 10 | cameras | chase behind the nose, cockpit at the pilot's eye (pilot hidden), orbit around |
| 11 | instruments read the simulation | panel data equals the model's rotor %, engine %, MAP, fuel, tank, altitude and heading; rotor state STOPPED / STARTING / NORMAL / SHUTDOWN shown on the pod |
| 12 | virtual ag application | `AC=r44 node test/e2e.mjs soy`: the whole soybean contract flown through the player inputs with the high assist — seven sorties (service, start, spool-up, lift-off, passes with hover turnarounds, return, landing on the H, shut-down, run-down), 90 % coverage, 2★, Cr$ 5,293, no damage |
| 13 | ag GPS with the helicopter | the same run: passes flown on the guidance lines, with the lightbar, the HUD and cockpit GPS and the coverage map driven by the helicopter's 13 m swath |
| 14 | ground servicing | 7 services at the helipad in that run, all by the truck (no "could not reach the stand"); `AC=r44 node test/truck.mjs` at four headings: truck at the stand in ~35 s, 1.0–1.7 m clear of the stopped rotor disc, crew walks around the boom |
| 15 | aircraft selection | title screen 01 / 02 / 03, choice saved; `node test/e2e_ui.mjs`: 16/16 |
| 16 | no critical regressions | `npm test`: 44/44 (PR-AGW and AT suites unchanged, 9 R44 checks); no page errors in any browser run (the only console error is the preview server's missing favicon, also present before) |
| 17 | browser performance | `test/profile.mjs` against the build before the R44 work, below |

**Key schemes** (`node test/keys.mjs`, 22/22): on the PR-AGW, the AT-502B
and the R44, the numpad scheme is the default and the classic keys are
dead in it (and the other way round); Q does not start the engine and a
tap on Q (rudder) does not stop it in the numpad scheme, I does both; Shift
and Ctrl move the power in both; the HUD, Controls and Settings screens
name the keys of the scheme in use; the choice is saved; rebinding a
numpad key leaves the classic keys alone. `node test/r44flight.mjs` (22/22)
and `node test/e2e_ui.mjs` (16/16) were run again with the numpad default.
The flight solvers are untouched (the seeded trajectories above are still
identical).

**Performance** (`test/profile.mjs low`, 600 ticks per view; build before
the R44 work → this build; SwiftShader, so render times are only the CPU
cost of a software rasteriser):

| flying | view | logic ms/tick (avg / p95) | draw calls | triangles |
| --- | --- | --- | --- | --- |
| PR-AGW | parked on the pad (R44 parked in view) | 0.39 / 0.6 → 0.39 / 0.7 | 486 → 540 | 737k → 835k |
| PR-AGW | spraying soy at 4 m | 0.70 / 1.5 → 0.72 / 1.5 | 342 → 352 | 509k → 517k |
| PR-AGW | cockpit over corn | 0.57 / 1.2 → 0.58 / 1.1 | 331 → 330 | 868k → 870k |
| PR-AGW | 400 m AGL | 0.57 / 0.9 → 0.49 / 0.6 | 318 → 318 | 471k → 471k |
| R44 | on the helipad | 0.37 / 0.7 | 473 | 865k |
| R44 | spraying soy at 4 m | 0.54 / 1.2 | 340 | 670k |
| R44 | cockpit over corn | 0.62 / 1.8 | 314 | 1047k |
| R44 | 400 m AGL | 0.23 / 0.4 | 304 | 603k |

On average the helicopter's simulation (120 Hz rotor, inflow, skids)
costs no more per tick than the airplanes'. In the airplanes' views the
additions are the parked R44 and the helipad: beyond 40 m the R44's cabin,
glass and inner skin switch to a coarse version (same window cuts) and the
fine detail is dropped, so it costs 51k triangles there (125k at full
resolution). The rotor blur is one ring mesh per rotor (a standard
material with a small shader patch), not a particle system. Sustained
software-raster time per frame on the pad (once the frame queue has
filled): 1.50–1.57 s before, 1.61–1.63 s flying the PR-AGW now,
1.66–1.71 s flying the R44. Start-up in this container 18.7 → 21.1 s, JS
heap 142 → 173 MB, GPU geometries 525 → 554, textures 37 → 41. FPS on a
real GPU was not measured.

**Known limits.** No mast bumping or dynamic rollover beyond what the
four skid contacts produce; the governor is always on (no twist-grip
throttle or governor-off flying); the rotor brake is applied automatically
below 40 % during the run-down; the 250 L tank is a game figure (no crewed
R44 ag kit with a published capacity was found); the instrument layout is
representative, not a copy of a particular aircraft; the lone tree east of
the helipad stands in the departure path — the test autopilot routes
around it, players must too. Browser end-to-end runs are not bit-for-bit
repeatable because the truck's route search has a per-frame time budget.
FPS on a real GPU was not measured.
