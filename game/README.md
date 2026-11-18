# Everyone Against Trump

A satirical, fully 3D open-world action game that runs in the browser.
Parachute into **United States City**, get recognised by absolutely everybody, and run, drive, fly and
sail your way through an 18-mission campaign across eight districts.

Built with **Three.js + TypeScript + Vite**. Every model, texture, sign and sound is generated in code
at runtime — there are no external art or audio assets.

> This is parody. The public figures who appear are exaggerated cartoon characters in an invented story;
> nothing they say or do in the game is a claim about any real person or event.

## Run it

```bash
cd game
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5173`) in a current desktop browser with WebGL 2.

```bash
npm run build      # type-check + production bundle in game/dist
npm run preview    # serve the production bundle
npm run typecheck  # TypeScript only
```

The build is fully static (`game/dist`) and can be hosted on any static file server.

## Controls

| Input | On foot | In a vehicle |
|---|---|---|
| `WASD` | Move (steer the parachute) | Accelerate / brake / steer |
| Mouse | Look (click the game to capture the pointer) | Look around |
| `Shift` | Sprint (dive while parachuting) | — |
| `Space` | Jump, climb low obstacles, open parachute when falling | Handbrake · climb (helicopter) |
| `C` | Sneak | Descend (helicopter) |
| `Q` | Dodge roll | — |
| Left mouse | Punch combo · fire while aiming | — |
| Right mouse | Aim | — |
| `R` | Reload | — |
| `1` / `2` | Previous / next gear | — |
| `E` | Interact, enter vehicles | Get out (bail out of a flying helicopter) |
| `H` | — | Horn |
| `Tab` / `M` / `Esc` | Mission info / map / pause | same |

A standard gamepad also works (sticks, A jump, B dodge, X interact, RT attack/gas, LT aim/brake).

## What is in the game

- **One continuous city, eight districts:** Golden Downtown, Government District, Classic Suburbs,
  Freedom Harbor, Liberty Beach, Route 66 Desert, Wall Street Chaos and the American Outskirts, joined by
  a single drivable road network, a suspension bridge to Liberty Island and an underground service tunnel.
- **Reference-driven look:** low-poly geometry, toon shading, halftone shadows, an ink-outline post pass,
  illustrated clouds, cream comic-panel HUD.
- **The opening skydive** under an American-flag parachute, straight into Mission 01.
- **Heat system (0–6):** recognition by bystanders, real line-of-sight, last-known-position searches,
  police cruisers that path along the road graph, roadblocks, helicopters, faction mobs. Lose it by
  breaking contact, hiding (garages, tunnel, courtyards, cornfields), swapping vehicles unseen or
  riding the Metro.
- **Twelve vehicle types:** ten cars/bikes, a helicopter and a speedboat, plus ambient traffic that obeys
  signals and stops for crowds.
- **Crowds with behaviour:** civilians, fans, reporters, protesters, agitators, faction members, police,
  security and mercenaries, each on a small state machine and drawn with instancing.
- **Campaign:** 18 missions in three acts with checkpoints, rewards and three multi-phase boss encounters.
- **Free roam:** 52 hidden Golden Ts, races (car, boat, back-road), a helicopter ring course, delivery
  runs, survival and escape challenges, safehouses with a wardrobe of six outfits, Metro fast travel,
  random street events.
- **Systems:** day/night cycle, rain, save/load with corruption recovery, three graphics presets with
  adaptive resolution, procedural audio with separate volume controls.

## Project layout

```
game/src
  core/        input, save data, audio synth, math + RNG helpers
  render/      WebGL renderer + ink pass, toon materials, sky/weather, geometry builder, particles
  world/       layout + road graph, terrain, collision world, buildings/props, landmarks, districts/
  entities/    character rig, player, vehicles, NPC crowds
  systems/     camera, combat, heat (pursuit director), interaction, missions + mission data, activities
  ui/          HUD, minimap, menus, styles
```

The world is deterministic (seeded) and built at load: static geometry is merged into chunked meshes,
collision is a 2.5D solid system that supports ramps, rooftops, decks and underground spaces.

## Testing notes

`window.__game` exposes the running game. `__game.missions.debugSkip()` plays the current objective
"perfectly" (used by the automated campaign smoke test that walks all 18 missions).
