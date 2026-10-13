# CRYPTO WORLD — THE LIVING CHAIN

A small, complete 3D browser game set on a tiny spherical planet where blockchain culture has become a whole
world. You arrive as a new **Messenger**. You meet the residents, carry messages between five connected
regions and help bring the "living chain" back online. Every market, price, wallet and transaction in the
game is **simulated and fictional**.

Built with **Three.js + TypeScript + Vite**. All geometry, textures, characters, animation, music and
sound effects are generated in code. The only third-party assets are two open-licensed fonts
(Fredoka and Nunito, via `@fontsource`).

## Quick start

```bash
cd crypto-world
npm install          # .npmrc sets legacy-peer-deps
npm run dev          # http://localhost:5173
npm run build        # type-check + production bundle in dist/
npm run preview      # serve the production bundle (http://localhost:4173)
npm test             # unit tests (vitest)
```

The browser QA scripts need a running server (`npm run dev`, or set `URL=` to a preview) and Playwright's
Chromium:

| Script | What it checks |
| --- | --- |
| `npm run playtest` (`scripts/playtest.mjs`) | Boot, title screen, PLAY, HUD, every mission target exists in the world, 17 residents on the surface, a keyboard-driven dialogue, the journal, a full lap of the planet, saving. |
| `node scripts/storybot.mjs` | Plays **all 12 missions** in the real world: it walks up to each target, presses interact, answers dialogue and closes panels, then plays through the finale and credits. |
| `node scripts/secretbot.mjs` | Finds and reveals all 7 secrets through normal interactions (including the dial puzzle). Dev server only. |
| `node scripts/perfstats.mjs` | Draw calls, triangles and culling counts at representative viewpoints. |
| `node scripts/views.mjs <dir>` / `talkshots.mjs` / `lifeshots.mjs` / `mobileshots.mjs` | Screenshots of regions, dialogue framing, ambient life, and the phone layout. |

## Controls

| Action | Keyboard / mouse | Gamepad | Touch |
| --- | --- | --- | --- |
| Move | WASD / arrows | Left stick | Virtual joystick |
| Run | Shift (hold) | RT or L3 | RUN toggle |
| Camera | Drag mouse, wheel to zoom | Right stick | Drag on the right side of the screen |
| Interact / talk / advance | E or Enter | A | TALK / USE button, tap the dialogue box |
| Jump | Space | Y | JUMP |
| Dialogue choices | 1–4, or ↑/↓ + E | D-pad ↑/↓ + A | Tap a choice |
| Skip dialogue | Space or the Skip button | B | Skip button |
| Journal | Tab or J | Back / Select | Journal icon |
| Pause / settings | Esc | Start | Gear icon |
| Performance overlay | F3 or ` | — | Settings toggle |

## What is in the game

- **A real planet.** It has a radius of 70 m, and running around it takes about 75 seconds. Gravity always
  points to the planet's centre. Movement follows geodesics, with parallel transport of velocity, facing
  and camera heading, so you can walk in any direction (poles included) and come back to where you started.
  The horizon reveals buildings and landmarks naturally as you crest the curve.
- **Five main regions plus wilds, with no loading screens.** *Chain City* has Consensus Square, the First
  Block sculpture, the Merkle Library, the Relay Office, Mempool Market, NovaLabs and a café.
  *Genesis Hills* has a cabin archive, a windmill, the observatory, the Genesis Stone and a server henge.
  *Degen Coast* has a pier and lighthouse, a gallery and Fork's workshop. *Mining District* has data
  halls, a GPU farm, cooling towers, catwalks and Old Faithful. *Node Heights* has a plateau, antennas, a
  checkpoint and the control centre. The wilds are Whitepaper Woods and the southern snowfield. The ring
  road **The Chain** connects all of them.
- **17 residents** with distinct looks, voices (pitch-shifted blips), biographies, relationships, daily
  routines (work, sit, chat with each other, wander, watch) and context-aware conversations. They face you,
  look at you and react while you talk.
- **12 missions** (M01–M12): deliveries, investigations across terminals, a code-review puzzle, collecting
  lost blocks, repairing relays, an old mining rig, tracing a repeating signal, a community message,
  activating a station and the five-beacon finale with credits. You can keep exploring afterwards.
- **Simulated crypto screens**: animated, seeded charts, order books, explorers, contract code, a relay
  map and signal scopes. Every one is marked `SIM`.
- **7 curated secrets**: a rooftop, the miners' sticky notes, a carved mural, the first computer, an
  abandoned desk, a vault keypad, and the Genesis Stone dials.
- **A living environment**: a day/night cycle with sun and moon, lit windows and streetlights, wind in the
  grass and trees, water with shoreline foam, drifting clouds, gull and songbird flocks, butterflies by
  day, fireflies at night, and two pettable critters: **HODL** the dog in Genesis Hills and **LEDGER** the
  café cat.
- **The player character**: a procedurally built, skinned character with a locomotion blend (idle, walk,
  run, turn lean, stop), jump and landing, sitting, look-at and blinking. Action poses include interact,
  inspect, receive, deliver, read, type, wave and think. A wardrobe in Settings changes the jacket, bag,
  hat, hair and skin.
- **UI**: a title screen (PLAY / SETTINGS) that flies down from orbit into the game. There is a minimal
  HUD with a mission tracker, direction arrow and distance, and an interaction prompt. Dialogue has a
  typewriter effect, names and titles, choices and skip. The journal covers missions, residents,
  discoveries and the bag. Notices queue so at most two are on screen.
- **Audio**: a generative WebAudio soundtrack (day and night chord sets), ambient layers mixed by region
  (wind, ocean, city, machines, birds, crickets), surface-dependent footsteps, voices, UI sounds, chimes
  and critter calls. Master, music, ambience and effects each have their own volume.
- **Saving**: versioned local saves (v2, with migration from v1). Saves are validated and sanitised;
  corrupt data is quarantined, and the game falls back to a new game instead of crashing. The game
  autosaves every 20 s and when the tab is hidden.

## Architecture

```
src/
  core/        Game (orchestrator, modes: loading → title → fly-in → play/dialogue/panel → finale), Input, math (sphere, noise, rng)
  world/       World, Collision, SphereHash, layout (regions, roads, placements), terrain (heightfield, mesh, overlay, roads, biomes),
               kits (buildings and props by region), content (kit instancing, clustering, atlases, decals), Life (ambient life)
  render/      toon world material, sky, lighting/time of day, water, horizon culling, screen and sign atlases
  player/      PlayerController (kinematic, spherical), CameraController
  characters/  procedural rig, appearance, animator, avatar
  npc/         NPC routines, movement, talk state, markers
  gameplay/    GameState (missions, conditions, effects, events), dialogue runner, world props, save system
  data/        NPCs, missions, dialogue, documents and secrets (data only)
  ui/          DOM UI (title, HUD, dialogue, modals), journal, settings and wardrobe, touch controls
  audio/       procedural AudioEngine
```

Key techniques:

- **One heightfield for physics and rendering.** The terrain is baked once on an equal-angle cube sphere
  (6 × 128²). The mesh and `heightAt()` use the same triangle split, so the feet touch exactly the ground
  you see. Roads are separate ribbon meshes on top. Soft paths come from a gnomonic cube-map overlay, in
  which great circles are straight lines.
- **Collisions on a sphere.** Circle and oriented-box colliders and ramped walk surfaces (decks, stairs,
  catwalks) live in local tangent frames. A spatial hash on the sphere answers queries, and the camera
  casts rays against tall boxes and cylinders.
- **Kits bent onto the planet.** Props are authored on a flat plane. Each vertex is mapped to the
  sphere under its footprint, with verticals that stay rigid near the origin and turn radial far out.
  Long structures such as the pier follow the curvature, buildings keep parallel walls, and visuals
  match their colliders.
- **Illustrated rendering.** The scene renders off-screen, then an ink pass draws hand-inked
  contours from the depth buffer alone. It catches silhouettes and creases, colours each line from
  the paint underneath, and thins lines with distance. Surfaces use a two-tone cel ramp with cool,
  hue-shifted shadows. The ground is painted in flat patches with inked borders, specks and cliff
  strata, and paths are crisp shapes with drawn edges. Canopies get leafy shading and drawn leaf
  contours. The sky has painted two-tone cloud banks, measured from the planet's visible limb. Water
  uses flat depth bands with contour lines, ripple strokes and a scalloped foam line. On Low quality
  the drawn texturing is skipped.
- **Batching and culling.** Kits are merged per 16 m cluster into a few meshes: solid, grass, GPU-animated
  (spin/bob), signs, screens and light pools. A conservative **horizon culler** hides anything behind the
  planet, and grass also fades out with distance. Birds and butterflies are instanced and fireflies are
  one point cloud. Signs and screens share two canvas atlases.
- **Camera.** It follows the player with a transported heading, a smoothed local up, gentle auto-follow
  and wall pull-in that rises above the player. Props between the lens and the player dissolve with a
  screen-door dither. Dialogue uses an over-the-shoulder shot chosen once per conversation by
  ray-testing the real geometry, so the speaker's face is visible.
- **Adaptive quality.** Quality settings are `auto`, `low`, `medium` and `high`. They change pixel ratio,
  shadows, overlay resolution and vegetation density, never gameplay. Auto mode lowers the pixel ratio
  when frames are slow and raises it again when they recover.
- **Data-driven gameplay.** Missions, conversations, conditions and effects are plain data. Object
  conversations drive manual objectives such as terminals, pylons and puzzles. NPC standing spots
  automatically keep clear of interaction points.

## Testing and verification

- **Unit tests: 31 across 5 files** (`npm test`).
  - Sphere math: lat/lon round trip, geodesic arc length, full circumference, log map, transport, frames at the poles.
  - Save system: round trip, v1 migration, rejection of malformed data, sanitising, quarantine of corrupt data, throwing storage, settings merge.
  - Collision: push-out, low versus tall walls, ramps and step-up, camera rays against boxes and cylinders.
  - World: terrain determinism, the heightfield matching the mesh, regions on dry land, the ring road above water, a full great-circle walk, walking over a pole, jumping under radial gravity.
  - Story: all 12 missions through the real data, manual objectives, wrong answers, content integrity.
- **Browser checks** (headless Chromium, software WebGL):
  - `playtest`: all checks pass on both the dev server and the production build.
  - `storybot`: all 12 missions complete in the 3D world, and the finale reaches the credits with no page errors.
  - `secretbot`: 7/7 secrets.
- **Render statistics** from `perfstats` on the production build at 1280×720. Triangle counts include the
  shadow pass.

  | View | Draw calls | Triangles |
  | --- | --- | --- |
  | City square | 180 | 336k |
  | Hills | 175 | 218k |
  | Coast pier | 108 | 140k |
  | Mining | 161 | 163k |
  | Heights | 143 | 158k |
  | Woods | 126 | 172k |

  The world builds in about 2.5–3 s, and the JS heap is about 80 MB.

## Reference analysis (honest note)

The brief named [messenger.abeto.co](https://messenger.abeto.co/) as the quality reference. I could not
inspect it directly from this environment, so I have not claimed any first-hand findings about it.
Published coverage describes it as follows:

- A free 2025 browser game by Abeto (Vicente Lucendo and Michael Sungaila), built on WebGL/Three.js.
- You play a courier on a planet so small the curvature is visible a few metres ahead and you can cross it
  in minutes.
- It has a bright storybook/low-poly look, funny NPC dialogue, and runs on phones.

I used those qualities as targets: visible curvature, dense hand-placed detail, warm characterful
dialogue and phone support. CRYPTO WORLD's setting, characters, story, art and code are all original,
and no assets were copied.

Sources:

- [Messenger (video game) — Wikipedia](https://en.wikipedia.org/wiki/Messenger_(video_game))
- [Aftermath — "You Could Play Messenger Right Now"](https://aftermath.site/messenger-browser-game-abeto/)
- [80.lv — Deliver mail on a tiny colorful planet](https://80.lv/articles/deliver-mail-on-tiny-colorful-planet-in-this-relaxing-web-game)
- [Fortcade — Messenger](https://fortcade.com/game/messenger/)
- [WebGPU.com showcase — Messenger](https://www.webgpu.com/showcase/messenger/)
- [GIGAZINE — Messenger browser game](https://gigazine.net/gsc_news/en/20250929-messenger-browser-game)
- [bo3.gg — Messenger](https://bo3.gg/games/articles/messenger-abeto-co-crafted-interactive-experiences-the-free-browser-game-you-can-finish-in-15-minutes)

## Known limitations

- **Performance was measured only with a software renderer** (headless Chromium + SwiftShader). Draw-call and
  triangle counts are reliable, but real-GPU frame rates (desktop or phones) were not measured. The
  adaptive pixel ratio is the safety net.
- **Mobile was tested through device emulation** (iPhone 13 landscape viewport with touch). It has not been
  tested on physical phones.
- **Audio was verified to run without errors**, but nobody has listened to it in this environment. The mix
  levels are hand-set and may need tuning by ear.
- Headless screenshots occasionally capture a blank frame right after a long synchronous script step. This
  is a capture-timing artifact of the software renderer: the next frame and `readPixels` are correct. The
  QA scripts take a second capture where it matters.
- There is no multiplayer, no real blockchain connectivity, and no real market data, by design.
