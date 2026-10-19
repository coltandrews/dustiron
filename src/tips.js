// Control use stays in the save for compatibility with existing lives.

export class Tips {
  constructor(game) { this.game = game; }

  /** Marks a tip done because the player used that control. */
  done(id) {
    const run = this.game.run;
    if (!run || run.tips[id]) return;
    run.tips[id] = true;
  }
}
