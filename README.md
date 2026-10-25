# Dust & Iron

A western with one life: two towns, a desert and a pine forest, outlaw camps, a gang boss, hunting, saloons and dice, in one shared online world for up to 20 people. Pick a name and spawn in; next time, continue as that rider. Built with Three.js, Rapier, and plain JavaScript modules.

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

## Ride online

The game server is plain Node (22 or newer) with no extra packages. It serves the game and runs the shared world: outlaws, camps, health, duels and money moved between riders.

**Try it on your own machine:**

```sh
npm install          # three and rapier, which the server also uses
npm run server       # http://localhost:8080
```

Open http://localhost:8080 in two browser windows (one private window works), type a name in each under **Ride online**, and you will see each other in Mercy Crossing. The world is saved in `data/world.json`.

`?server=wss://example.com` on the page URL points a statically hosted copy (Vercel, `dist-single`) at a server elsewhere.

**Online rules**

- One persistent world everyone shares. Each rider still has one life: death is permanent and the next life starts fresh in Mercy Crossing.
- Towns and shop rooms are safe. Outside town, riders can shoot each other.
- Press **G** near another rider to call them out. A duel can be to first blood (nobody dies) or to the death, with an optional wager held by the server. In town, G also offers a game of **poker dice** for a stake.
- **Enter** opens chat, in an MMO-style chat frame at the lower left with All, World and Whispers tabs. Say (nearby, shown in a speech bubble over your head), `/y` yell, `/g` world, `/w Name` whisper, `/r` reply; click a name to whisper. The rider list and ping are under the money.
- Camps cleared by anyone come back after twelve minutes. Everyone near a kill gets quest credit.
- Animals are shared too: the server runs the herds, so everyone sees the same deer and the same wolves, and a carcass can be skinned once. Horses left standing show for everyone nearby.

**Deploy to Cloudflare (one shared world, sleeps when nobody plays, about $5–7 a month):**

Needs the Workers Paid plan ($5/month), which includes Containers. The Worker serves the game page from Cloudflare's edge, and starts the game server container only when someone rides online; the server shuts itself down after 15 minutes with nobody online. The world is saved in the Worker's Durable Object storage, so it survives sleep and redeploys.

From GitHub (no Docker needed on your machine): in the Cloudflare dashboard, **Workers & Pages → Create → Import a repository**, pick this repo and branch, then set
- Build command: `npm run build:web`
- Deploy command: `npx wrangler deploy`

From your own machine (needs Docker Desktop running):

```sh
npx wrangler login
npm run deploy
```

The game is then at `https://dustiron.<your-subdomain>.workers.dev`. The first rider after a quiet spell waits a few seconds while the server wakes. `instance_type` in `wrangler.jsonc` sets the server size (`basic` is 1/4 CPU and 1 GiB; `standard-1` doubles the CPU if the world lags).

**Deploy to Fly.io (sleeps when nobody plays, about $3–5 a month):**

```sh
fly launch --no-deploy --copy-config     # pick an app name; keep fly.toml
fly volumes create dustiron_data --size 1
fly deploy
```

The machine stops when nobody is connected and starts again on the next visit (a few seconds). The world file lives on the volume, so it survives restarts and deploys.

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
| Smoke a cigarette or cigar | B |
| Chat (online) | Enter or T; `/s` say, `/y` yell, `/g` world, `/w Name` whisper, `/r` reply |
| Duel or dice with a rider (online) | G, then Y / X to answer |
| Map | M or Tab (pauses the fight) |
| Pause | Esc |
| Mute | N |
| Frame rate readout | I |
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

## The frontier

- The land is 840 m across. Mercy Crossing sits by the river in the desert; Pine Hollow is a logging town in the forest to the northwest, up the stage road.
- Eleven outlaw camps and four roadside ambushes. Camps farther out are harder. Pine Hollow's deputy posts bounties for the forest camps.
- **The Iron Gang:** Deputy Hale's quest line runs from the burned sawmill to Kell's lieutenant and Iron Jack Kell himself, a boss in an iron-plated coat who gets faster and angrier at half health. Gang captains are tougher than any leader.
- **Pine Hollow** has its own saloon (the Timber Wolf, with blackjack), trading post, deputy's office and doctor, each with a room inside.
- **Hunting:** rabbits and pronghorn in the desert; deer, elk, boar and wolf packs in the pines. Shoot, then press E to skin. Hank Morrow and Otto the trapper buy skins. Otto's quest line ends with Old Scar, the great bear.
- **Saloons:** beer and whiskey make you sway, walk crooked and blur the world, but fill Dead Eye. Cigarettes and cigars (B) restore Dead Eye and steady your aim for a while. Blackjack at the Last Drop.
- **Day and night:** a day lasts twenty minutes. Nights are dark (carry on by lantern light) and outlaws see less far. Rain rolls through, mostly over the forest.

## Current scope

Horses belong to their rider: others see them standing or ridden but cannot mount them. A browser tab in the background stops sending its rider's position (browsers pause hidden pages), so that rider stands still for everyone else until the tab comes back.

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
  wilds.js        desert and forest scenery, merged per chunk
  town-pine.js    Pine Hollow
  wildlife.js     animal simulation (browser offline, server online)
  hunting.js      animal models, skinning, online puppets
  vices.js        drink and tobacco effects
  sky.js          day, night and rain
  net.js          browser side of the server connection
  net-world.js    server-run outlaws, props and events in the browser
  net-ui.js       joining, chat, duels and dice
  remote-players.js other riders
  protocol.js     message shapes shared with the server
server/
  index.js        HTTP + WebSocket server, game loop, saving
  hub.js          accounts, sessions, authority over health and money
  sim.js          the shared world: camps and outlaws, headless
  duels.js dice.js  rider-versus-rider games
  store.js        world.json on disk
  ws.js           dependency-free WebSocket
tools/bundle.mjs  builds dist-single/ without npm
```
