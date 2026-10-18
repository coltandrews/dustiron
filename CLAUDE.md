# Dust & Iron: notes for Claude

Top-down western shooter. Plain JavaScript ES modules, Three.js r186 (`WebGLRenderer`), Rapier 0.19.3 (`@dimforge/rapier3d-compat`). No framework, no TypeScript.

## Rules

- All feel numbers go in `src/tuning.js`. Weapons are data in `src/weapons.js`; bandit types are data in `src/enemy.js`.
- The sim ticks at a fixed 60 Hz in `main.js`. Gameplay code takes `dt` from `tick()`. Real-time effects (camera shake, particles, UI) run in `frame()`. Dead Eye and hit-stop work by scaling sim time, so never read `performance.now()` inside gameplay.
- Characters are kinematic capsules moved with Rapier's character controller at a fixed height. Only props, debris and corpses are dynamic bodies.
- Collision groups live in `physics.js` (`GROUPS`). Player shots are ray casts; enemy bullets are visible projectiles in `projectiles.js`.
- No allocations in per-frame paths: reuse vectors, pool effects.
- Models are built in code (`models.js`) as vertex-colored, flat-shaded geometry sharing `MAT.solid`.
- Keep files under about 300 lines; edit one file per change where possible.
- `index.html` has an import map so the game also runs without a bundler. After changing `src/`, run `node tools/bundle.mjs` to refresh `dist-single/`.

## Testing

`dist-single/dustiron.html` runs from any static server. `window.dustiron` exposes the game object in the console (for example `dustiron.player.hp = 100`).
