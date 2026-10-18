// HUD, reticle and full-screen cards. Plain DOM over the canvas.

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      app: $('app'), hud: $('hud'), reticle: $('reticle'), hit: $('ret-hit'), ring: $('ret-ring'), reload: $('ret-reload'),
      hpFill: $('hp-fill'), hpGhost: $('hp-ghost'), hpText: $('hp-text'), deFill: $('de-fill'), deBar: $('de-bar'),
      campName: $('camp-name'), outlaws: $('outlaws'), bounty: $('bounty'), campNo: $('camp-no'),
      weaponName: $('weapon-name'), ammo: $('ammo'), slots: $('slots'), reloadHint: $('reload-hint'),
      vignette: $('vignette'), hurtDir: $('hurt-dir'), toast: $('toast'), hint: $('hint'),
      screens: { title: $('screen-title'), pause: $('screen-pause'), map: $('screen-map'), cleared: $('screen-cleared'), dead: $('screen-dead'), loading: $('screen-loading'), error: $('screen-error') },
      continueBtn: $('btn-continue'), continueInfo: $('continue-info'),
      clearedTitle: $('cleared-title'), clearedBody: $('cleared-body'), deadBody: $('dead-body'), deadTitle: $('dead-title'),
      errorBody: $('error-body'),
    };
    this.ammoKey = '';
    this.cylAngle = 0;
    this.lastAmmo = -1;
    this.hpGhost = 100;
    this.hurtT = 0;
    this.toastT = 0;
    this.hintT = 12;
  }

  bind(handlers) {
    const on = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    on('btn-start', handlers.newRun);
    on('btn-continue', handlers.continueRun);
    on('btn-resume', handlers.resume);
    on('btn-quit', handlers.quitToTitle);
    on('btn-next', handlers.nextCamp);
    on('btn-restart', handlers.newRun);
    on('btn-map-close', handlers.closeMap);
  }

  show(name) {
    for (const [k, el] of Object.entries(this.el.screens)) el.hidden = k !== name;
    const playing = name === null || name === 'cleared' || name === 'dead';
    this.el.hud.hidden = !playing;
    this.el.app.classList.toggle('in-menu', name !== null);
  }

  error(message) {
    this.el.errorBody.textContent = message;
    this.show('error');
  }

  setContinue(save) {
    this.el.continueBtn.hidden = !save;
    this.el.continueInfo.hidden = !save;
    if (save) this.el.continueInfo.textContent = `Camp ${save.camp + 1} · $${save.bounty} bounty · ${Math.round(save.hp)} HP`;
  }

  toast(text, seconds = 2.2) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this.toastT = seconds;
  }

  hitMarker(kill) {
    const h = this.el.hit;
    h.classList.remove('show', 'kill');
    void h.offsetWidth;
    h.classList.add('show');
    if (kill) h.classList.add('kill');
  }

  hurt(dirX, dirZ) {
    this.hurtT = 0.5;
    // Bullets come from the opposite of their travel direction. Screen up is world -Z.
    const deg = (Math.atan2(-dirX, dirZ) * 180) / Math.PI;
    this.el.hurtDir.style.setProperty('--angle', deg + 'deg');
    this.el.hurtDir.classList.remove('show');
    void this.el.hurtDir.offsetWidth;
    this.el.hurtDir.classList.add('show');
  }

  showCleared(info) {
    this.el.clearedTitle.textContent = `${info.name} cleared`;
    const rows = [
      ['Bounty collected', `$${info.earned}`],
      ['Run total', `$${info.total}`],
      ['Healed', `+${info.healed} HP`],
    ];
    if (info.unlock) rows.push(['New weapon', info.unlock]);
    this.el.clearedBody.innerHTML = rows.map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('');
    this.show('cleared');
  }

  showDead(stats) {
    const acc = stats.shots ? Math.round((stats.hits / stats.shots) * 100) : 0;
    const t = Math.floor(stats.time);
    const rows = [
      ['Camps cleared', stats.camp],
      ['Outlaws downed', stats.kills],
      ['Bounty earned', `$${stats.bounty}`],
      ['Accuracy', `${acc}%`],
      ['Time on the trail', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`],
    ];
    this.el.deadTitle.textContent = stats.camp === 0 ? 'Shot down at the first camp' : `Shot down after ${stats.camp} camp${stats.camp > 1 ? 's' : ''}`;
    this.el.deadBody.innerHTML = rows.map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('');
    this.show('dead');
  }

  buildAmmo(gun) {
    const def = gun.def;
    const key = def.key + gun.def.mag;
    if (key === this.ammoKey) return;
    this.ammoKey = key;
    const box = this.el.ammo;
    box.className = 'ammo ' + def.layout;
    box.innerHTML = '';
    for (let i = 0; i < def.mag; i++) {
      const d = document.createElement('i');
      if (def.layout === 'cylinder') {
        const a = (i / def.mag) * Math.PI * 2;
        d.style.left = `calc(50% + ${Math.sin(a) * 15}px)`;
        d.style.top = `calc(50% - ${Math.cos(a) * 15}px)`;
      }
      box.appendChild(d);
    }
    this.lastAmmo = -1;
    this.cylAngle = 0;
  }

  update(game, dt) {
    const p = game.player;
    const e = this.el;
    if (!p) return;

    // Health with threshold ticks and a trailing ghost bar.
    const hp = Math.max(0, p.hp);
    e.hpFill.style.width = hp + '%';
    this.hpGhost = hp > this.hpGhost ? hp : this.hpGhost + (hp - this.hpGhost) * Math.min(1, dt * 3);
    e.hpGhost.style.width = this.hpGhost + '%';
    e.hpText.textContent = Math.ceil(hp);
    e.hpFill.classList.toggle('low', hp <= 25);

    const de = game.deadEye;
    e.deFill.style.width = de.meter * 100 + '%';
    e.deBar.classList.toggle('active', de.active);
    e.deBar.classList.toggle('ready', de.meter >= 0.999 && !de.active);

    const alive = game.enemies.filter((b) => b.alive).length;
    e.campNo.textContent = `Camp ${game.run.camp + 1}`;
    e.campName.textContent = game.campName;
    e.outlaws.textContent = alive === 1 ? '1 outlaw left' : `${alive} outlaws left`;
    e.bounty.textContent = `$${game.run.bounty}`;

    // Weapon, ammo, slots.
    const gun = p.gun;
    this.buildAmmo(gun);
    e.weaponName.textContent = gun.def.name;
    const pips = e.ammo.children;
    if (gun.ammo !== this.lastAmmo) {
      if (gun.def.layout === 'cylinder' && this.lastAmmo > gun.ammo) this.cylAngle += 60 * (this.lastAmmo - gun.ammo);
      this.lastAmmo = gun.ammo;
      for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('spent', i >= gun.ammo);
      e.ammo.style.setProperty('--cyl', this.cylAngle + 'deg');
    }
    e.reloadHint.hidden = !(gun.ammo === 0 && !gun.reloading);
    const slotsKey = p.guns.map((g) => g.def.key).join() + p.gunIndex;
    if (slotsKey !== this.slotsKey) {
      this.slotsKey = slotsKey;
      e.slots.innerHTML = p.guns.map((g, i) => `<span class="${i === p.gunIndex ? 'on' : ''}"><kbd>${i + 1}</kbd>${g.def.name}</span>`).join('');
    }

    // Reticle follows the cursor; ring shows spread, arc shows reload.
    const m = game.input.mouse;
    e.reticle.style.transform = `translate(${m.x}px, ${m.y}px)`;
    const spread = 10 + gun.spreadDeg * 4.5;
    e.ring.style.width = e.ring.style.height = spread * 2 + 'px';
    const circ = 2 * Math.PI * 22;
    e.reload.style.strokeDasharray = `${circ}`;
    e.reload.style.strokeDashoffset = `${circ * (1 - gun.reloadProgress)}`;
    e.reload.style.opacity = gun.reloading ? 1 : 0;
    e.reticle.classList.toggle('empty', gun.ammo === 0);

    // Damage vignette.
    this.hurtT = Math.max(0, this.hurtT - dt);
    const low = hp <= 25 && p.alive ? 0.35 + Math.sin(game.realTime * 6) * 0.1 : 0;
    e.vignette.style.opacity = Math.max(this.hurtT * 1.4, low);

    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) e.toast.classList.remove('show'); }
    if (this.hintT > 0) { this.hintT -= dt; e.hint.classList.toggle('show', this.hintT > 0); }
  }
}
