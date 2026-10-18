# Dust & Iron

A western game with one life, a safe town, and a continuous desert region. Built with Three.js, Rapier, and plain JavaScript modules.

Play at [dustiron.vercel.app](https://dustiron.vercel.app/).

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
| Switch weapon | 1 2 3 or Q |
| Camera zoom | Mouse wheel |
| Talk or use a shop | E or Enter |
| Use a bandage | H |
| Map | M or Tab (pauses the fight) |
| Pause | Esc |
| Mute | N |
| Tuning panel | ` (backquote) |

## How a run works

- Start in Mercy Crossing with a revolver, 24 spare rounds, one bandage, and no money.
- Talk to Martha or Silas for bounties. Each job has a fixed target in one of three camps. Targets wear a red hat with a gold band.
- Travel to a camp, collect proof from the target, and return to the sheriff for payment. You can leave a fight at any time. Each bounty pays once.
- Buy guns, ammo, bandages, treatment, a coat, and a map in town. Ammo is finite. Camp completion gives no free healing or guns.
- Town is safe. Guns are put away there. If you have too little ammo and money, the sheriff offers town work for 12 revolver rounds.
- Travel reveals land. Bought maps show roads and camp landmarks. Bounties show search areas. Unknown enemies are not shown on the world map.
- Camps stay clear for this life. The current region is 420 m across. Camp difficulty comes from its location.
- Saves keep your position, health, supplies, jobs, map, enemy deaths, damaged cover, and bullets in flight. Reloading does not restore supplies or reset camps.
- Death ends the life at once. The next life has a new land layout and no earned money, gear, jobs, or map progress. Saves use browser storage on this device.
- A living save from the original prototype moves to town once, with its money, guns, and health. The old record is kept until death. It cannot restore a dead life.

## Current scope

This is the first town and frontier build. Shops use menus at their doors. The saloon and stable have buildings, but drinks, blackjack, horses, interiors, a larger streamed world, and town crime are later work.

## Checks

```sh
npm test
npm run build
npm run single
```

Tests cover life resets, map discovery, transactions, single bounty payments, saved combat state, finite reloads, and camp navigation. Use Chrome to check movement, aiming, menus, and visual changes.

## Code map

```
src/
  main.js         boot and the fixed 60 Hz loop (time scale, interpolation)
  game.js         life loop, saving, Dead Eye, hit-stop, explosions
  life.js         seeded world data, inventory, jobs, map discovery, purchases
  storage.js      versioned browser saves, death records, old-save migration
  frontier.js     town buildings, walking civilians, roads, and desert
  encounters.js   camp placement, local path grids, and combat snapshots
  town-actions.js talks, shops, and bounty menus
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
  map.js          world map (M): explored land, roads, landmarks, and jobs
tools/bundle.mjs  builds dist-single/ without npm
```
