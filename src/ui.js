// HUD, reticle and full-screen cards. Plain DOM over the canvas.

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      app: $('app'), hud: $('hud'), reticle: $('reticle'), hit: $('ret-hit'), ring: $('ret-ring'), reload: $('ret-reload'),
      hpFill: $('hp-fill'), hpGhost: $('hp-ghost'), hpText: $('hp-text'), deFill: $('de-fill'), deBar: $('de-bar'),
      campName: $('camp-name'), outlaws: $('outlaws'), bounty: $('bounty'), campNo: $('camp-no'),
      weaponName: $('weapon-name'), ammo: $('ammo'), reserve: $('reserve-ammo'), bandages: $('bandages'), slots: $('slots'), reloadHint: $('reload-hint'),
      vignette: $('vignette'), hurtDir: $('hurt-dir'), toast: $('toast'), hint: $('hint'), interactionHint: $('interaction-hint'),
      screens: { title: $('screen-title'), pause: $('screen-pause'), map: $('screen-map'), interaction: $('screen-interaction'), dead: $('screen-dead'), loading: $('screen-loading'), error: $('screen-error') },
      continueBtn: $('btn-continue'), continueInfo: $('continue-info'),
      interactionTitle: $('interaction-title'), interactionText: $('interaction-text'), interactionActions: $('interaction-actions'),
      deadBody: $('dead-body'), deadTitle: $('dead-title'),
      errorBody: $('error-body'),
      saveStatus: $('save-status'),
    };
    this.ammoKey = '';
    this.cylAngle = 0;
    this.lastAmmo = -1;
    this.hpGhost = 100;
    this.hurtT = 0;
    this.toastT = 0;
    this.hintT = 12;
    this.el.screens.interaction.addEventListener('keydown', (event) => {
      if (event.code === 'Space' || event.code === 'Enter') { event.stopPropagation(); return; }
      if (event.code !== 'Tab') return;
      event.preventDefault();
      event.stopPropagation();
      const buttons = [...this.el.interactionActions.querySelectorAll('button:not(:disabled)')];
      if (!buttons.length) return;
      const step = event.shiftKey ? -1 : 1;
      const index = buttons.indexOf(document.activeElement);
      buttons[(index + step + buttons.length) % buttons.length].focus();
    });
  }

  bind(handlers) {
    const on = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    on('btn-start', handlers.newRun);
    on('btn-continue', handlers.continueRun);
    on('btn-resume', handlers.resume);
    on('btn-quit', handlers.quitToTitle);
    on('btn-restart', handlers.newRun);
    on('btn-map-close', handlers.closeMap);
  }

  show(name) {
    for (const [k, el] of Object.entries(this.el.screens)) el.hidden = k !== name;
    const playing = name === null || name === 'interaction' || name === 'dead';
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
    if (save) this.el.continueInfo.textContent = `$${save.bounty} · ${Math.round(save.hp)} HP · ${save.camp} camps cleared`;
  }

  setSaveStatus(ok) {
    this.el.saveStatus.textContent = ok ? 'Your life is saved. You can return to this position with your current supplies and progress.'
      : 'Save failed. Keep this tab open. Browser storage is blocked, full, or changed in another tab.';
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

  showInteraction({ title, text, actions = [] }, onAction) {
    this.el.interactionTitle.textContent = title;
    this.el.interactionText.textContent = text;
    const box = this.el.interactionActions;
    const focusedId = document.activeElement?.dataset.action;
    let preferredFocus = null;
    box.replaceChildren();
    for (const action of [...actions.filter((item) => item.id !== 'close'), { id: 'close', label: 'Continue' }]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `btn${action.id === 'close' ? ' interaction-close' : ''}`;
      button.textContent = action.label;
      button.dataset.action = action.id;
      button.disabled = Boolean(action.disabled);
      if (!button.disabled && action.id === focusedId) preferredFocus = button;
      button.addEventListener('click', (event) => { event.stopPropagation(); onAction(action.id); });
      box.appendChild(button);
    }
    this.show('interaction');
    (preferredFocus || box.querySelector('button:not(:disabled)'))?.focus();
  }

  showDead(stats) {
    const acc = stats.shots ? Math.round((stats.hits / stats.shots) * 100) : 0;
    const t = Math.floor(stats.time);
    const rows = [
      ['Camps cleared', stats.camp],
      ['Outlaws downed', stats.kills],
      ['Money at death', `$${stats.bounty}`],
      ['Accuracy', `${acc}%`],
      ['Time on the trail', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`],
    ];
    this.el.deadTitle.textContent = 'Your life has ended';
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

    const inTown = game.inTown();
    e.campNo.textContent = inTown ? 'Safe town' : 'The frontier';
    e.campName.textContent = game.locationName;
    e.outlaws.textContent = inTown ? 'Weapons holstered' : 'Return to town for payment';
    e.bounty.textContent = `$${game.run.bounty}`;
    e.bandages.textContent = `${game.run.bandages} bandage${game.run.bandages === 1 ? '' : 's'} · H`;
    e.interactionHint.textContent = game.interactionHint || '';
    e.interactionHint.hidden = !game.interactionHint || game.state !== 'playing';

    // Weapon, ammo, slots.
    const gun = p.gun;
    this.buildAmmo(gun);
    e.weaponName.textContent = gun.def.name;
    e.reserve.textContent = `${gun.ammo} loaded · ${gun.reserve} spare`;
    const pips = e.ammo.children;
    if (gun.ammo !== this.lastAmmo) {
      if (gun.def.layout === 'cylinder' && this.lastAmmo > gun.ammo) this.cylAngle += 60 * (this.lastAmmo - gun.ammo);
      this.lastAmmo = gun.ammo;
      for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('spent', i >= gun.ammo);
      e.ammo.style.setProperty('--cyl', this.cylAngle + 'deg');
    }
    e.reloadHint.hidden = !(gun.ammo === 0 && !gun.reloading);
    e.reloadHint.textContent = gun.reserve ? 'Press R to reload' : 'No spare rounds. Buy more in town.';
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
    e.reticle.hidden = inTown;

    // Damage vignette.
    this.hurtT = Math.max(0, this.hurtT - dt);
    const low = hp <= 25 && p.alive ? 0.35 + Math.sin(game.realTime * 6) * 0.1 : 0;
    e.vignette.style.opacity = Math.max(this.hurtT * 1.4, low);

    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) e.toast.classList.remove('show'); }
    if (this.hintT > 0) { this.hintT -= dt; e.hint.classList.toggle('show', this.hintT > 0); }
  }
}
