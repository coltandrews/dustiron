// Camp state stays separate from the scene. Each camp has a small local path grid.
import { NavGrid } from './nav.js';
import { generateAmbush, generateCamp } from './level.js';
import { Prop } from './props.js';
import { Bandit } from './enemy.js';
import { campDecor } from './camp-decor.js';
import { showGun } from './character.js';
import { teleport } from './enemy-captive.js';

const ENEMY_FIELDS = ['hp', 'x', 'z', 'yaw', 'ammo', 'reloadT', 'cooldown', 'knows', 'canSee',
  'lastSeenX', 'lastSeenZ', 'lastSeenT', 'state', 'stateT', 'aimT', 'aimYaw', 'burstLeft', 'burstT',
  'homeX', 'homeZ', 'wanderX', 'wanderZ', 'wanderT', 'peekX', 'peekZ', 'fleeing', 'unseenT',
  'stimX', 'stimZ', 'perceptT', 'spottedX', 'spottedZ', 'spottedT', 'vx', 'vz', 'kx', 'kz', 'surrendered', 'captive'];

/** Every camp and ambush site in the world, in a fixed order. */
export function campList(world) {
  return [...world.camps, ...(world.ambushes ?? [])];
}

export function buildEncounters(game) {
  return campList(game.run.world).map((camp, index) => buildEncounter(game, camp, index));
}

/**
 * Builds one camp: props, outlaws and its path grid. Saved state in
 * game.run.camps restores damage and dead outlaws. Layouts come from the
 * world seed, so every player of a shared world sees the same camp.
 */
export function buildEncounter(game, camp, index, decorate = true) {
  const seed = game.run.world.seed ?? game.run.seed;
  game.run.camps[camp.id] ??= {};
  const saved = game.run.camps[camp.id];
  saved.cleared ??= false;
  const layout = camp.ambush ? generateAmbush(seed + index * 7717) : generateCamp(seed + index * 104729, camp.difficulty);
  const encounter = { ...camp, index, enemies: [], props: [], nav: new NavGrid(32, 0.5, 0.45, camp) };
  if (decorate && game.levelGroup && !camp.ambush) encounter.decor = campDecor(game, camp, layout, seed + index * 104729);
  const oldProps = new Map((saved.props ?? []).map((p) => [p.id, p]));
  layout.props.forEach((spec, i) => {
    const id = `${camp.id}:prop:${i}`, old = oldProps.get(id);
    if (old?.alive === false) return;
    // Forest camps keep their layout but leave out the desert cactus.
    if (camp.home === 'pine' && spec.kind === 'cactus') return;
    const p = new Prop(game, spec.kind, { ...spec, x: spec.x + camp.x, z: spec.z + camp.z });
    p.id = id;
    if (old) {
      if (Number.isFinite(old.hp)) p.hp = old.hp;
      p.fuse = old.fuse ?? -1;
      if (old.looted !== undefined) p.setLooted(old.looted, true);
      if (p.body && old.body) {
        p.body.setTranslation(old.body.position, true);
        p.body.setRotation(old.body.rotation, true);
        p.body.setLinvel(old.body.velocity, true);
        p.body.setAngvel(old.body.angularVelocity, true);
        p.physObj.capture();
        p.physObj.prevP.copy(p.physObj.currP);
        p.physObj.prevQ.copy(p.physObj.currQ);
        p.physObj.render(1);
      }
    }
    encounter.props.push(p);
  });
  const oldEnemies = new Map((saved.enemies ?? []).map((e) => [e.id, e]));
  layout.enemies.forEach((spec, i) => {
    const target = i === 0 && !camp.ambush;
    const id = target ? camp.targetId : `${camp.id}:outlaw:${i}`, old = oldEnemies.get(id);
    if (old?.alive === false) return;
    const e = new Bandit(game, spec.type, spec.x + camp.x, spec.z + camp.z, camp.difficulty, encounter, target);
    e.id = id;
    e.campId = camp.id;
    if (target) {
      // The marked outlaw wears a red hat. Its identity stays fixed for this life.
      e.model.root.userData.targetName = camp.targetName;
    }
    if (old) {
      for (const key of ENEMY_FIELDS) if (old[key] !== undefined) e[key] = old[key];
      e.px = e.x; e.pz = e.z; e.prevYaw = e.yaw;
      e.body.setTranslation({ x: e.x, y: e.bodyY, z: e.z }, true);
      // A cover point is tied to a live prop. Find a new point after loading.
      if (['hold', 'peek', 'toCover', 'flank'].includes(e.state)) e.state = 'toCover';
      if (e.state === 'aim' || e.state === 'burst') { e.token = true; game.tokens.holders.add(e); }
      if (e.surrendered) { showGun(e.model, null); e.setState(e.captive ? 'captive' : 'surrender'); e.state = e.captive ? 'captive' : 'surrender'; }
      if (e.captive && game.player) teleport(e, game.player.x - 1.5, game.player.z - 1.5);
    }
    encounter.enemies.push(e);
  });
  encounter.nav.setStatic(encounter.props.filter((p) => !p.dynamic).map((p) => p.footprint()));
  encounter.nav.rebuild(encounter.props.filter((p) => p.dynamic).map((p) => p.footprint()));
  return encounter;
}

/** Removes a camp's outlaws and props from the scene and physics (the camp dressing stays). */
export function disposeEncounter(game, encounter) {
  for (const e of encounter.enemies) {
    if (e.token) e.releaseToken();
    if (game.flanker === e) game.flanker = null;
    if (e.body) { game.physics.removeBody(e.body); e.body = null; }
    e.alive = false;
    game.levelGroup?.remove(e.model.root);
    if (e.aimLine) { game.levelGroup?.remove(e.aimLine); e.aimLine.material.dispose(); }
  }
  for (const p of encounter.props) if (p.alive) { p.alive = false; p.remove(); }
  encounter.enemies = [];
  encounter.props = [];
}

export function captureEncounters(game) {
  for (const camp of game.encounters) {
    const saved = game.run.camps[camp.id];
    const enemies = new Map((saved.enemies ?? []).map((e) => [e.id, e]));
    const props = new Map((saved.props ?? []).map((p) => [p.id, p]));
    for (const e of camp.enemies) {
      const data = { id: e.id, alive: e.alive };
      for (const key of ENEMY_FIELDS) data[key] = e[key];
      enemies.set(e.id, data);
    }
    for (const p of camp.props) {
      const data = { id: p.id, alive: p.alive, hp: Number.isFinite(p.hp) ? p.hp : null, fuse: p.fuse, x: p.x, z: p.z, ry: p.ry };
      if (p.kind === 'supply') data.looted = p.looted;
      if (p.body) data.body = {
        position: { ...p.body.translation() }, rotation: { ...p.body.rotation() },
        velocity: { ...p.body.linvel() }, angularVelocity: { ...p.body.angvel() },
      };
      props.set(p.id, data);
    }
    saved.enemies = [...enemies.values()];
    saved.props = [...props.values()];
  }
}

export function rebuildCampNav(encounters) {
  for (const camp of encounters) {
    camp.nav.setStatic(camp.props.filter((p) => p.alive && !p.dynamic).map((p) => p.footprint()));
    camp.nav.rebuild(camp.props.filter((p) => p.alive && p.dynamic).map((p) => p.footprint()));
  }
}
