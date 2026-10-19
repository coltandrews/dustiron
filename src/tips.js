// Teaches through play: one short prompt at a time, shown only until the
// player has done the thing once. Done tips are saved with the life.

const TIPS = [
  { id: 'move', text: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to walk', when: () => true },
  { id: 'talk', text: 'Walk up to someone and press <kbd>E</kbd> to talk', when: (g) => g.run.tips.move },
  { id: 'journal', text: '<kbd>J</kbd> opens your journal: jobs and supplies', when: (g) => Object.values(g.run.quests).some((q) => q.status !== 'offered') },
  { id: 'map', text: '<kbd>M</kbd> opens your map', when: (g) => g.run.tips.journal },
  { id: 'shoot', text: 'Click to shoot. Stand still a moment for a steadier first shot', when: (g) => !g.inTown() },
  { id: 'reload', text: '<kbd>R</kbd> reloads one round at a time. Click to stop and fire', when: (g) => g.run.tips.shoot && g.player.gun.ammo < g.player.gun.def.mag },
  { id: 'roll', text: '<kbd>Space</kbd> rolls you out of a shot', when: (g) => g.enemies.some((e) => e.alive && e.knows && Math.hypot(e.x - g.player.x, e.z - g.player.z) < 25) },
  { id: 'heal', text: '<kbd>H</kbd> wraps a bandage. A hard hit stops it', when: (g) => g.player.hp < 60 && g.run.items.bandage > 0 },
  { id: 'sneak', text: '<kbd>C</kbd> to walk quietly. Watchers see you from closer', when: (g) => g.run.tips.shoot && !g.inTown() && g.enemies.some((e) => e.alive && !e.knows && Math.hypot(e.x - g.player.x, e.z - g.player.z) < 40) },
];

export class Tips {
  constructor(game) { this.game = game; this.current = null; }

  /** Marks a tip done because the player used that control. */
  done(id) {
    const run = this.game.run;
    if (!run || run.tips[id]) return;
    run.tips[id] = true;
    if (this.current === id) this.current = null;
  }

  tick() {
    const g = this.game;
    if (!g.run || !g.player?.alive || g.state !== 'playing') return;
    if (this.current && !g.run.tips[this.current]) return;
    const next = TIPS.find((tip) => !g.run.tips[tip.id] && tip.when(g));
    this.current = next?.id ?? null;
    g.ui.setTip(next?.text ?? '');
  }
}
