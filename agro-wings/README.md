# AGRO WINGS

Agricultural aviation on a Mato Grosso farm (Fazenda Boa Esperança, fictional).
Three.js + Vite, everything procedural (no external assets), built into a
single self-contained `dist/index.html`.

Two aircraft share the world and are chosen on the title screen:
**AIRCRAFT 01 · Original** — the EMB-202A Ipanema (PR-AGW), and
**AIRCRAFT 02 · Air Tractor** — an AT-502B turboprop (PR-AWT). The one not
selected waits parked on the west apron.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/index.html (single file)
npm test           # flight (both aircraft) + spray validation (Node)
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

## Controls (Tidemark aircraft mapping kept)

| Action | Keys |
| --- | --- |
| Pitch | W / S (↑ ↓) |
| Roll | A / D (← →) — also steer on the ground |
| Rudder / tailwheel | Z / X |
| Power | R / F (Shift / Ctrl), mouse wheel |
| Brakes (differential with rudder) | Space |
| Flaps | G (up) / B (down) |
| Trim | [ / ] |
| Engine | hold Q to start, tap Q to stop |
| Spray valve | C (Enter) |
| Cockpit / chase | V |
| Free external camera | O |
| Service / interact | E |
| Map / coverage overlay / contracts | M / K / J |
| Minimap: farm map ↔ GPS guidance page | N (or click the minimap) |
| Reset aircraft | Backspace |
| Speed up ground service | hold T |

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
(AT-502B) and `test/spray.test.mjs` (Node).
Browser checks (need `npm run build && npx vite preview --port 4173`):

- `node test/e2e.mjs soy out/` — full contract flown by the test autopilot
  (`src/game/autopilot.js`) through the normal player inputs only;
- `node test/e2e_ui.mjs out/` — service interruption, crash + recovery,
  stuck reset, key rebinding, tutorial, mobile layout;
- `node test/perf.mjs` — per-view tick/render time, draw calls, triangles;
- `node test/profile.mjs <low|medium|high> <ipanema|at502>` — load time,
  GPU object counts, JS heap, tick and frame avg/p95/p99 per view;
- `node test/envviews.mjs out/ [times] [weathers] [views]` — renders per
  time of day × weather; `node test/atmo_transition.mjs` — gradual blends;
- `node test/truck.mjs out/ [dx dz headingDeg]` — service truck cycle with
  timings, closest approach to the aircraft and loads;
- `node test/gpsview.mjs out/` — HUD GPS page and the cockpit unit.

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
