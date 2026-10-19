// Reads keyboard and mouse into the game's intent once per frame, and opens
// menus. Riding, sneaking, the journal and interactions start here.
import { T } from './tuning.js';

export function updateIntent(game) {
  const g = game, inp = g.input, it = g.intent;
  if (g.state === 'interaction') {
    if (inp.pressed('pause')) g.townActions.close();
    return;
  }
  if (g.state === 'journal') {
    if (inp.pressed('journal') || inp.pressed('pause')) g.closeJournal();
    return;
  }
  if (g.state === 'map' && (inp.pressed('map') || inp.pressed('pause'))) { g.closeMap(); return; }
  if (g.state === 'playing' && inp.pressed('map')) { g.openMap(); g.tips.done('map'); return; }
  if (g.state === 'playing' && inp.pressed('journal')) { g.openJournal(); g.tips.done('journal'); return; }
  if (inp.pressed('pause') && (g.state === 'playing' || g.state === 'paused')) g.pause(g.state === 'playing');
  if (g.state !== 'playing' && g.state !== 'dying') {
    it.fireHeld = false;
    return;
  }
  const p = g.player;
  if (g.state === 'playing' && g.horse?.mounted) {
    const dismountHeld = inp.held('interact');
    if (g.horse.updateDismount(dismountHeld, g.realTime)) return;
    if (dismountHeld) {
      it.move = { x: 0, z: 0 };
      it.fireHeld = false;
      g.sprintHeld = false;
      return;
    }
  }
  if (g.state === 'playing' && inp.pressed('interact')) {
    if (g.townActions.nearest()) { g.townActions.open(); g.tips.done('talk'); return; }
    if (g.lootNearest()) return;
  }
  if (g.state === 'playing' && inp.pressed('bandage')) g.useBandage();
  if (g.state === 'playing' && inp.pressed('mount') && g.horse) {
    if (g.horse.mounted) g.ui.toast('Hold E to get off');
    else if (Math.hypot(g.horse.x - p.x, g.horse.z - p.z) < 2.6) g.horse.mount();
    else g.ui.toast('Walk up to your horse first, or whistle with V');
  }
  if (g.state === 'playing' && inp.pressed('whistle')) {
    if (g.horse) g.horse.whistle();
    else g.ui.toast('You have no horse. The livery rents them.');
  }
  if (inp.pressed('sneak') && p) {
    p.sneaking = !p.sneaking;
    g.ui.toast(p.sneaking ? 'Walking quietly' : 'Walking normally', 1.2);
    g.tips.done('sneak');
  }
  it.move = inp.moveAxis();
  if (p?.sneaking) it.move = { x: it.move.x * 0.45, z: it.move.z * 0.45 };
  if (it.move.x || it.move.z) g.tips.done('move');
  g.rig.place(0);
  const aim = g.rig.projectCursor(inp.mouse.ndcX, inp.mouse.ndcY);
  if (aim) { g.aimPoint.copy(aim); it.aim = g.aimPoint; }
  it.fireHeld = inp.fireHeld;
  if (inp.firePressed) { it.firePressed = true; if (!g.inTown()) g.tips.done('shoot'); }
  if (inp.pressed('reload')) { it.reload = true; g.tips.done('reload'); }
  if (inp.pressed('dodge')) { it.dodgeUntil = g.realTime + T.dodge.buffer; g.tips.done('roll'); }
  if (p) {
    for (let i = 0; i < 5; i++) if (inp.pressed(`weapon${i + 1}`)) it.switchTo = i;
    if (inp.pressed('nextWeapon')) it.switchTo = (p.gunIndex + 1) % p.guns.length;
    const w = inp.takeWheel();
    if (w) g.rig.zoom(w);
  }

  // Shift sprints a horse; on foot it holds Dead Eye, which drains in real time.
  const mounted = g.horse?.mounted;
  g.sprintHeld = mounted && inp.held('deadEye');
  const de = g.deadEye;
  const want = !mounted && inp.held('deadEye') && g.state === 'playing' && p && p.alive && !g.inTown();
  if (want && !de.active && de.meter >= T.deadEye.minToStart) g.setDeadEye(true);
  if (de.active && !want) g.setDeadEye(false);
}
