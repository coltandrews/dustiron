# Dust & Iron

A top-down western shooter prototype: clear bandit camps for bounty, one life per run. Built with Three.js (rendering), Rapier (physics) and plain JavaScript modules.

## Play

**Fastest (no install):** open `dist-single/dustiron.html` through any local static server, for example:

```sh
npx serve dist-single      # then open the URL it prints
# or
python3 -m http.server -d dist-single 8080
```

Three.js and Rapier load from the jsDelivr CDN, so you need an internet connection.

**Development (hot reload):**

```sh
npm install
npm run dev
```

After editing anything in `src/`, rebuild the single-file version with `npm run single`.

## Controls

| Action | Key |
| --- | --- |
| Move | W A S D |
| Aim | Mouse or trackpad |
| Shoot | Left click (hold for repeat fire) |
| Dodge roll | Space (brief invulnerability) |
| Reload | R |
| Dead Eye | Hold Shift (slow motion, needs meter) |
| Switch weapon | 1 2 3, Q, or mouse wheel |
| Map | M or Tab (pauses the fight) |
| Pause | Esc |
| Mute | N |
| Tuning panel | ` (backquote) |

## How a run works

- Each camp is generated from the run's seed: tents around a campfire, crate and barrel cover, wagons, fences, explosive barrels.
- Clear every outlaw to collect the bounty. You heal 50 HP between camps.
- Clearing camp 1 unlocks the shotgun; camp 2 unlocks the rifle. Camps get more bandits, including rushers and sharpshooters.
- The map (M) shows the camp layout and only the outlaws you've had line of sight to. Bandits you've lost track of show as a fading "last seen" marker; muzzle flashes reveal shooters.
- Death is permanent. The save is deleted the moment you die. Closing the tab keeps your run and restarts the current camp's fight with your current health.

## Code map

```
src/
  main.js         boot and the fixed 60 Hz loop (time scale, interpolation)
  game.js         run state, camps, saving, Dead Eye, hit-stop, explosions
  tuning.js       every feel number in one place
  input.js        keyboard and mouse state
  camera.js       angled follow camera, look-ahead, trauma shake
  render.js       renderer, lights, shadow box that follows the player
  physics.js      Rapier world, collision groups, ray casts, interpolation
  player.js       movement, dodge roll, shooting, health and regen
  weapons.js      weapon data and the shared gun state machine
  enemy.js        bandit types, perception and the AI state machine
  cover.js        cover-point scoring
  nav.js          0.5 m grid A* with path smoothing
  props.js        crates, barrels, explosive barrels, fences, debris
  projectiles.js  visible enemy bullets
  level.js        seeded camp layouts and scenery
  models.js       code-built low-poly models
  character.js    procedural animation and corpses
  fx.js           pooled particles, tracers, light flashes
  audio.js        synthesized sound effects (no audio files)
  ui.js           HUD, reticle, cards
  map.js          survey map (M): props, you, outlaws you've spotted
tools/bundle.mjs  builds dist-single/ without npm
```
