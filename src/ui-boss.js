// A health bar across the top of the screen while a boss or gang captain is
// fighting the player, with the name from the wanted poster.
const RANGE = 45;

export class BossBar {
  constructor() {
    this.el = null;
    this.shown = null;
  }

  build() {
    const hud = globalThis.document?.getElementById?.('hud');
    if (!hud) return false;
    const el = document.createElement('div');
    if (typeof el.querySelector !== 'function') return false;
    this.el = el;
    this.el.className = 'boss-bar';
    this.el.hidden = true;
    this.el.innerHTML = '<div class="boss-name"></div><div class="boss-track"><div class="boss-fill"></div></div>';
    this.name = this.el.querySelector('.boss-name');
    this.fill = this.el.querySelector('.boss-fill');
    hud.appendChild(this.el);
    return true;
  }

  update(game) {
    if (!this.el && !this.build()) return;
    const p = game.player;
    let boss = null;
    if (p?.alive && !game.frontier?.inside) {
      for (const e of game.enemies) {
        if (!e.alive || !(e.def.boss || e.def.armor) || !e.knows) continue;
        if (Math.hypot(e.x - p.x, e.z - p.z) < RANGE) { boss = e; if (e.def.boss) break; }
      }
    }
    this.el.hidden = !boss;
    if (!boss) { this.shown = null; return; }
    if (this.shown !== boss) {
      this.shown = boss;
      const title = boss.def.boss ? 'Leader of the Iron Gang' : 'Gang captain';
      this.name.innerHTML = `<b>${boss.encounter.targetName ?? 'Outlaw'}</b> <span>${title}</span>`;
    }
    this.fill.style.width = `${Math.max(0, Math.min(1, boss.hp / boss.maxHp)) * 100}%`;
    this.el.classList.toggle('enraged', !!boss.enraged);
  }
}
