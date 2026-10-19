// HUD, reticle and full-screen cards. Plain DOM over the canvas.
import * as THREE from 'three';
import { cardName, handValue } from './blackjack.js';
import { renderJournal } from './ui-journal.js';

const $ = (id) => document.getElementById(id);

const shopItemArt = {
  ammo: `<svg viewBox="0 0 88 58" role="img" aria-label="Ammunition"><g transform="rotate(-10 44 29)"><path d="M22 43V17h9v26zM39 43V13h9v30zM56 43V18h9v25z" fill="#b7742f" stroke="#2c1b12" stroke-width="2"/><path d="M22 17l4.5-8 4.5 8M39 13l4.5-8 4.5 8M56 18l4.5-8 4.5 8" fill="#d8b35e" stroke="#2c1b12" stroke-width="2"/><path d="M19 43h15v6H19zM36 43h15v6H36zM53 43h15v6H53z" fill="#d5a24d" stroke="#2c1b12" stroke-width="2"/></g></svg>`,
  shotgun: `<svg viewBox="0 0 88 58" role="img" aria-label="Shotgun"><g transform="rotate(-13 44 29)" stroke="#251710" stroke-width="2" stroke-linejoin="round"><path d="M8 35l23-8 34 1v7l-35 1-13 11H7l7-8z" fill="#7d4728"/><path d="M31 25h44v5H31zM32 32h43v5H31z" fill="#343231"/><path d="M69 24h12v14H69z" fill="#b58b45"/><path d="M30 29l10 2-9 6-8-3z" fill="#a66a37"/></g></svg>`,
  rifle: `<svg viewBox="0 0 88 58" role="img" aria-label="Rifle"><g transform="rotate(-11 44 29)" stroke="#251710" stroke-width="2" stroke-linejoin="round"><path d="M6 35l26-10 29 4v7l-30-1-15 11H6l8-8z" fill="#a86631"/><path d="M31 26h50v6H31z" fill="#333332"/><path d="M43 21h18v6H43z" fill="#c19b4c"/><path d="M48 37l5 10h-8l-4-11z" fill="#6a3b25"/></g></svg>`,
  bandage: `<svg viewBox="0 0 88 58" role="img" aria-label="Bandage"><g stroke="#3b2a1d" stroke-width="2"><ellipse cx="32" cy="30" rx="19" ry="20" fill="#ead8ae"/><ellipse cx="32" cy="30" rx="8" ry="9" fill="#9e7147"/><path d="M32 10h27c10 0 16 8 16 18v17H32c11-5 12-27 0-35z" fill="#d5bd8d"/><path d="M50 11v34M62 13v32" fill="none" stroke="#b58e5c"/><path d="M31 21c6 2 7 14 0 18" fill="none" stroke="#f3e5c3" stroke-width="3"/></g></svg>`,
  heal: `<svg viewBox="0 0 88 58" role="img" aria-label="Doctor treatment"><g stroke="#2f2018" stroke-width="2" stroke-linejoin="round"><path d="M17 24h54l5 27H12z" fill="#78543b"/><path d="M28 24v-7c0-6 4-9 9-9h14c6 0 9 3 9 9v7h-8v-6c0-2-1-3-3-3H39c-2 0-3 1-3 3v6z" fill="#3e3029"/><path d="M12 33h64v7H12z" fill="#9d744c"/><path d="M39 27h10v18H39zM35 31h18v10H35z" fill="#d9c28e" stroke="#633128"/></g></svg>`,
  map: `<svg viewBox="0 0 88 58" role="img" aria-label="Trail map"><g stroke="#38261b" stroke-width="2" stroke-linejoin="round"><path d="M13 13l19-6 23 7 20-6v38l-20 6-23-7-19 6z" fill="#dec58f"/><path d="M32 7v38M55 14v38" fill="none" stroke="#a47746"/><path d="M20 39c11-16 18 3 27-13S66 14 70 18" fill="none" stroke="#9e3c2c" stroke-width="3" stroke-dasharray="4 3"/><path d="M62 31l4-7 4 7-4 3z" fill="#496953"/><circle cx="23" cy="22" r="3" fill="#bd8c3d"/></g></svg>`,
  coat: `<svg viewBox="0 0 88 58" role="img" aria-label="Trail coat"><g stroke="#2b1b16" stroke-width="2" stroke-linejoin="round"><path d="M31 9l13 6 13-6 13 11-9 12-5-4 5 25H27l5-25-5 4-9-12z" fill="#765369"/><path d="M36 12l8 3-6 10 6 27M52 12l-8 3 6 10-6 27" fill="#a97b8e"/><path d="M33 34h8v7h-9M55 34h-8v7h9" fill="#523a48"/><circle cx="44" cy="29" r="2" fill="#d1a44d"/></g></svg>`,
  drink: `<svg viewBox="0 0 88 58" role="img" aria-label="Whiskey"><g stroke="#2c1a12" stroke-width="2" stroke-linejoin="round"><path d="M24 8h18v8l-4 7v28H16V23l4-7V8z" fill="#81512f"/><path d="M20 29h14v14H20z" fill="#d2b574"/><path d="M22 8h18v7H22z" fill="#c39a4a"/><path d="M52 27h24l-3 22H55z" fill="#d9b45c" fill-opacity=".65"/><path d="M55 35h18l-2 14H57z" fill="#bd6b2f"/><path d="M51 27h26" stroke="#e8d2a4" stroke-width="3"/></g></svg>`,
};

shopItemArt.heavy = `<svg viewBox="0 0 88 58" role="img" aria-label="Heavy revolver"><g stroke="#251710" stroke-width="2" stroke-linejoin="round"><path d="M28 22h42v8H28z" fill="#343231"/><circle cx="33" cy="30" r="8" fill="#4a4644"/><path d="M24 30l10 2-6 18h-9z" fill="#5c3422"/><path d="M66 18h4v4h-4z" fill="#c19b4c"/></g></svg>`;
shopItemArt.horse = `<svg viewBox="0 0 88 58" role="img" aria-label="Horse"><g stroke="#251710" stroke-width="2" stroke-linejoin="round"><path d="M18 26c4-6 30-7 38-2l10-12 8 4-4 12-6 2-4 22h-6l-2-14H30l-3 14h-6l-1-16c-3-2-4-6-2-10z" fill="#7a4a2e"/><path d="M60 13l6 0 4 6" fill="none" stroke="#2a1a12" stroke-width="3"/><path d="M34 24h14v6H34z" fill="#9a6337"/></g></svg>`;
shopItemArt.meal = `<svg viewBox="0 0 88 58" role="img" aria-label="Hot meal"><g stroke="#2c1a12" stroke-width="2"><ellipse cx="44" cy="38" rx="26" ry="9" fill="#cbb48a"/><ellipse cx="44" cy="35" rx="18" ry="6" fill="#8a4a2a"/><path d="M36 22c2-4-2-6 0-10M46 22c2-4-2-6 0-10" fill="none" stroke="#e8d8b8"/></g></svg>`;
const artAlias = { repeater: 'rifle', rifle: 'rifle', whiskey: 'drink', coffee: 'drink', oil: 'drink', rent: 'horse', feed: 'meal', belt: 'ammo' };

function makeShopItemArt(itemId) {
  itemId = shopItemArt[itemId] ? itemId : artAlias[itemId];
  if (!shopItemArt[itemId]) return null;
  const art = document.createElement('span');
  art.className = 'choice-art';
  art.innerHTML = shopItemArt[itemId];
  art.setAttribute('aria-hidden', 'true');
  return art;
}

export class UI {
  constructor() {
    this.el = {
      app: $('app'), hud: $('hud'), reticle: $('reticle'), hit: $('ret-hit'), ring: $('ret-ring'), reload: $('ret-reload'),
      hpFill: $('hp-fill'), hpGhost: $('hp-ghost'), hpText: $('hp-text'), deFill: $('de-fill'), deBar: $('de-bar'),
      campName: $('camp-name'), bounty: $('bounty'),
      weaponName: $('weapon-name'), ammo: $('ammo'), reserve: $('reserve-ammo'), bandages: $('bandages'), slots: $('slots'), reloadHint: $('reload-hint'),
      vignette: $('vignette'), hurtDir: $('hurt-dir'), toast: $('toast'), hint: $('hint'), interactionHint: $('interaction-hint'),
      screens: { journal: $('screen-journal'), title: $('screen-title'), pause: $('screen-pause'), map: $('screen-map'), interaction: $('screen-interaction'), dead: $('screen-dead'), loading: $('screen-loading'), error: $('screen-error') },
      continueBtn: $('btn-continue'), continueInfo: $('continue-info'),
      interactionTitle: $('interaction-title'), interactionText: $('interaction-text'), interactionActions: $('interaction-actions'),
      deadBody: $('dead-body'), deadTitle: $('dead-title'),
      errorBody: $('error-body'),
      saveStatus: $('save-status'),
      notes: $('notes'), tip: $('tip'), tracker: $('tracker'),
      journal: $('journal-body'), journalTabs: $('journal-tabs'),
    };
    this.ammoKey = '';
    this.cylAngle = 0;
    this.lastAmmo = -1;
    this.hpGhost = 100;
    this.hurtT = 0;
    this.toastT = 0;
    this.hintT = 12;
    this.doorPoint = new THREE.Vector3();
    this.el.screens.interaction.addEventListener('keydown', (event) => {
      if (event.code === 'Space' || event.code === 'Enter') { event.stopPropagation(); return; }
      if (/^Digit[1-9]$/.test(event.code)) {
        event.preventDefault();
        event.stopPropagation();
        const choice = this.el.interactionActions.querySelectorAll('button')[Number(event.code.at(-1)) - 1];
        choice?.click();
        return;
      }
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
    const playing = name === null || name === 'interaction' || name === 'dead' || name === 'journal';
    this.el.hud.hidden = !playing;
    this.el.app.classList.toggle('in-menu', name !== null);
    const interactionMode = name === 'interaction' ? this.el.screens.interaction.dataset.mode : '';
    this.el.app.classList.toggle('blackjack-open', interactionMode === 'blackjack');
    this.el.app.classList.toggle('talk-open', interactionMode === 'talk');
    this.el.app.classList.toggle('shop-open', interactionMode === 'shop');
  }

  error(message) {
    this.el.errorBody.textContent = message;
    this.show('error');
  }

  showJournal(game) {
    renderJournal(this, game);
    if (!this.journalBound) {
      this.journalBound = true;
      for (const button of this.el.journalTabs.querySelectorAll('button')) button.addEventListener('click', (e) => { e.stopPropagation(); renderJournal(this, game, button.dataset.tab); });
      document.getElementById('btn-journal-close').addEventListener('click', (e) => { e.stopPropagation(); game.closeJournal(); });
    }
    this.show('journal');
  }

  setContinue(save) {
    this.el.continueBtn.hidden = !save;
    this.el.continueInfo.hidden = !save;
    if (save) this.el.continueInfo.textContent = `$${save.bounty} · ${Math.round(save.hp)} HP · ${save.camp} camps cleared`;
  }

  setSaveStatus(ok) {
    this.el.saveStatus.textContent = ok ? 'Game saved.' : 'Save failed. Keep this tab open.';
  }

  toast(text, seconds = 2.2) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this.toastT = seconds;
  }

  /** Short story beats: quest steps, discoveries, rewards. */
  questNote(text) {
    if (!text) return;
    const box = this.el.notes;
    if (!box) { this.toast(text, 3.5); return; }
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = text;
    box.prepend(note);
    while (box.children.length > 3) box.lastChild.remove();
    setTimeout(() => note.classList.add('gone'), 5200);
    setTimeout(() => note.remove(), 5800);
  }

  setTip(html) {
    if (!this.el.tip || this.tipHtml === html) return;
    this.tipHtml = html;
    this.el.tip.innerHTML = html;
    this.el.tip.hidden = !html;
  }

  emptyClick() {
    const r = this.el.reticle;
    r.classList.remove('dry'); void r.offsetWidth; r.classList.add('dry');
  }

  hitMarker(kill, head = false) {
    this.el.hit.classList.toggle('head', head);
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

  showInteraction({ title, text, speech = '', detail = '', actions = [], mode = 'talk', blackjack = null }, onAction) {
    const screen = this.el.screens.interaction;
    if (this.dealerTimer) { clearTimeout(this.dealerTimer); this.dealerTimer = null; }
    screen.classList.remove('dealer-resolving');
    this.blackjackAnimationMs = 0;
    screen.dataset.mode = mode;
    screen.dataset.phase = blackjack?.state?.phase ?? '';
    const shopModes = ['shop'];
    screen.classList.toggle('shop-dialogue', shopModes.includes(mode));
    this.el.interactionTitle.textContent = title;
    this.renderInteractionText(text, mode, blackjack, speech, detail);
    const box = this.el.interactionActions;
    const focusedId = document.activeElement?.dataset.action;
    let preferredFocus = null;
    box.replaceChildren();
    const menuActions = [...actions.filter((item) => item.id !== 'close'), {
      id: 'close', label: mode === 'blackjack' ? 'Leave the table' : shopModes.includes(mode) ? 'Leave shop' : 'Goodbye',
    }];
    for (const [index, action] of menuActions.entries()) {
      const button = document.createElement('button');
      button.type = 'button';
      const betChip = action.id.startsWith('blackjack:deal:');
      button.className = `btn${action.id.startsWith('blackjack:') ? ' table-action' : ''}${betChip ? ' bet-chip' : ''}${action.id === 'close' ? ' interaction-close' : ''}`;
      if (mode === 'talk' && action.id !== 'close') button.classList.add('talk-choice');
      if (mode === 'shop' && action.id === 'back') button.classList.add('shop-back');
      if (action.itemId) button.classList.add('shop-choice');
      const label = document.createElement('span');
      label.className = 'choice-text';
      const name = document.createElement('span');
      name.className = 'choice-name';
      name.textContent = action.label;
      label.append(name);
      if (action.price) {
        const price = document.createElement('span');
        price.className = 'choice-price';
        price.textContent = action.price;
        label.append(price);
      }
      if (action.detail) {
        const detail = document.createElement('small');
        detail.className = 'choice-detail';
        detail.textContent = action.detail;
        label.append(detail);
      }
      const art = makeShopItemArt(action.itemId);
      if (mode !== 'blackjack' || action.id === 'close') {
        const key = document.createElement('span');
        key.className = 'choice-key';
        key.textContent = action.id === 'close' ? 'Esc' : String(index + 1);
        button.append(key);
      }
      button.append(...(art ? [art] : []), label);
      button.dataset.action = action.id;
      button.disabled = Boolean(action.disabled);
      if (!button.disabled && action.id === focusedId) preferredFocus = button;
      button.addEventListener('click', (event) => { event.stopPropagation(); onAction(action.id); });
      box.appendChild(button);
    }
    const dealerResolving = mode === 'blackjack' && this.blackjackAnimationMs > 0;
    if (dealerResolving) {
      screen.classList.add('dealer-resolving');
      for (const button of box.querySelectorAll('button:not(.interaction-close):not(:disabled)')) {
        button.disabled = true;
        button.dataset.dealerLock = 'true';
      }
    }
    this.show('interaction');
    if (!dealerResolving) (preferredFocus || box.querySelector('button:not(:disabled)'))?.focus();
    else this.dealerTimer = setTimeout(() => {
      this.dealerTimer = null;
      if (screen.hidden || screen.dataset.mode !== 'blackjack' || screen.dataset.phase !== 'done') return;
      screen.classList.remove('dealer-resolving');
      for (const button of box.querySelectorAll('[data-dealer-lock]')) {
        button.disabled = false;
        delete button.dataset.dealerLock;
      }
      box.querySelector('.bet-chip:not(:disabled)')?.focus();
    }, this.blackjackAnimationMs);
  }

  renderInteractionText(text, mode, blackjack = null, speech = '', detail = '') {
    const box = this.el.interactionText;
    box.replaceChildren();
    if (mode !== 'blackjack') {
      if (speech) {
        const quote = document.createElement('q');
        quote.className = 'npc-speech';
        quote.textContent = speech;
        box.appendChild(quote);
      }
      const plainText = detail || text;
      if (plainText) {
        const copy = document.createElement('p');
        copy.className = speech ? 'conversation-detail' : 'interaction-copy';
        copy.textContent = plainText;
        box.appendChild(copy);
      }
      return;
    }
    this.renderBlackjackTable(box, blackjack?.state, blackjack?.balance, text);
  }

  renderBlackjackTable(box, state, balance, message = '') {
    if (!state) return;
    const board = document.createElement('div');
    board.className = 'blackjack-board';
    const outcome = state.outcome || (/blackjack/i.test(state.result) && /win/i.test(state.result) ? 'blackjack'
      : /push|both have/i.test(state.result) ? 'push'
        : /you win|dealer bust/i.test(state.result) ? 'win'
          : state.phase === 'done' ? 'lose' : '');
    board.dataset.outcome = outcome;
    const previous = this.blackjackRender?.hand === state.hand ? this.blackjackRender : null;
    const dealerResolving = previous?.phase === 'playing' && state.phase === 'done';
    const previousDealerCount = previous?.counts?.dealer ?? state.dealer.length;
    const dealerDraws = dealerResolving ? Math.max(0, state.dealer.length - previousDealerCount) : 0;
    const holeDelay = 420, drawDelay = 1080, drawStep = 760;
    const resultDelay = dealerResolving
      ? dealerDraws ? drawDelay + (dealerDraws - 1) * drawStep + 620 : holeDelay + 720
      : 0;
    this.blackjackAnimationMs = dealerResolving ? resultDelay + 420 : 0;
    const suits = ['♠', '♥', '♣', '♦'];
    const suitUses = new Map();

    const makeCard = (rank, index, hidden, previousCount, key) => {
      const card = document.createElement('i');
      const suitIndex = suitUses.get(rank) ?? 0;
      suitUses.set(rank, suitIndex + 1);
      const suit = suits[suitIndex];
      const classes = ['playing-card'];
      if (hidden) classes.push('hidden-card');
      else if (['♥', '♦'].includes(suit)) classes.push('red-card');
      if (key === 'dealer' && dealerResolving) {
        if (index === 1 && index < previousCount) {
          classes.push('dealer-hole-reveal');
          card.style.setProperty('--dealer-delay', `${holeDelay}ms`);
        } else if (index >= previousCount) {
          classes.push('dealer-draw');
          card.style.setProperty('--dealer-delay', `${drawDelay + (index - previousCount) * drawStep}ms`);
        }
      } else if (index >= previousCount) classes.push('deal-card');
      card.className = classes.join(' ');
      if (!hidden) {
        const value = document.createElement('b');
        value.textContent = cardName(rank);
        const mark = document.createElement('span');
        mark.textContent = suit;
        card.append(value, mark);
      }
      return card;
    };

    const makeHand = (ownerText, cardsInHand, key, hidden = false, active = false) => {
      const row = document.createElement('div');
      row.className = `hand-row ${key === 'dealer' ? 'dealer-hand' : 'player-hand'}${active ? ' active-hand' : ''}`;
      const owner = document.createElement('span');
      owner.className = 'hand-owner';
      owner.textContent = ownerText;
      const cards = document.createElement('span');
      cards.className = 'playing-cards';
      const previousCount = previous?.counts?.[key] ?? 0;
      for (const [index, rank] of cardsInHand.entries()) {
        cards.appendChild(makeCard(rank, index, hidden && index > 0, previousCount, key));
      }
      const score = document.createElement('b');
      score.className = `hand-score${key === 'dealer' && dealerResolving ? ' dealer-score-reveal' : ''}`;
      if (key === 'dealer' && dealerResolving) score.style.setProperty('--dealer-result-delay', `${resultDelay}ms`);
      score.textContent = hidden ? '?' : handValue(cardsInHand);
      row.append(owner, cards, score);
      return row;
    };

    const tableTop = document.createElement('div');
    tableTop.className = 'blackjack-table-top';
    tableTop.innerHTML = `<span>Cash <b>$${balance}</b></span><strong>Blackjack pays 3 to 2</strong><span>Bet <b>$${state.phase === 'idle' ? 0 : state.bet + (state.splitBet || 0)}</b></span>`;
    board.appendChild(tableTop);

    if (state.phase === 'idle') {
      const prompt = document.createElement('p');
      prompt.className = 'bet-prompt';
      prompt.textContent = 'Place your bet';
      board.appendChild(prompt);
    } else {
      board.appendChild(makeHand('Dealer', state.dealer, 'dealer', state.phase === 'playing'));
      const hands = document.createElement('div');
      hands.className = `player-hands${state.split ? ' split-hands' : ''}`;
      hands.appendChild(makeHand(state.split ? 'Hand 1' : 'Your hand', state.player, 'player', false, state.phase === 'playing' && state.activeHand === 0));
      if (state.split) hands.appendChild(makeHand('Hand 2', state.split, 'split', false, state.phase === 'playing' && state.activeHand === 1));
      board.appendChild(hands);
    }

    if (state.phase === 'done') {
      const result = document.createElement('div');
      const net = Number.isFinite(state.net) ? state.net : null;
      result.className = `blackjack-result result-${outcome || 'mixed'}${dealerResolving ? ' dealer-result-reveal' : ''}`;
      if (dealerResolving) result.style.setProperty('--dealer-result-delay', `${resultDelay}ms`);
      const resultText = outcome === 'blackjack' ? 'BLACKJACK'
        : outcome === 'win' ? `YOU WIN${net === null ? '' : ` +$${net}`}`
          : outcome === 'lose' ? `YOU LOSE${net === null ? '' : ` $${Math.abs(net)}`}`
            : outcome === 'push' ? 'PUSH' : net === null ? 'HAND OVER' : `SPLIT ${net >= 0 ? '+' : '-'}$${Math.abs(net)}`;
      result.textContent = resultText;
      board.appendChild(result);
    } else if (message && !['Cards dealt.', 'Card dealt.', 'Hand split.', 'Second hand.'].includes(message)) {
      const notice = document.createElement('p');
      notice.className = 'table-notice';
      notice.textContent = message;
      board.appendChild(notice);
    }
    box.appendChild(board);
    this.blackjackRender = {
      hand: state.hand,
      phase: state.phase,
      counts: { dealer: state.dealer.length, player: state.player.length, split: state.split?.length ?? 0 },
    };
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
    e.campName.textContent = game.locationName;
    e.bounty.textContent = `$${game.run.bounty}`;
    const b = game.run.items.bandage;
    e.bandages.textContent = p.bandaging ? `Wrapping a bandage… ${Math.round(p.bandageT / 1.6 * 100)}%` : `${b} bandage${b === 1 ? '' : 's'} · H`;
    const tracker = game.trackerHtml?.() ?? '';
    if (e.tracker && tracker !== this.trackerHtml) { this.trackerHtml = tracker; e.tracker.innerHTML = tracker; }
    e.interactionHint.textContent = game.interactionHint || '';
    const doorEntry = game.interactionHint === 'Press [E] to Enter';
    e.interactionHint.classList.toggle('door-entry', doorEntry);
    if (doorEntry) {
      const door = game.townActions.nearest();
      const projected = door ? this.doorPoint.set(door.x, 1.35, door.z).project(game.rig.camera) : null;
      if (projected) {
        e.interactionHint.style.left = `${(projected.x + 1) * 50}%`;
        e.interactionHint.style.top = `${(1 - projected.y) * 50}%`;
      }
    } else {
      e.interactionHint.style.left = '';
      e.interactionHint.style.top = '';
    }
    e.interactionHint.hidden = !game.interactionHint || game.state !== 'playing';

    // Weapon, ammo, slots.
    const gun = p.gun;
    this.buildAmmo(gun);
    e.weaponName.textContent = gun.def.name;
    e.reserve.textContent = `${gun.ammo} loaded · ${gun.reserve} spare${gun.condition < 0.85 ? ' · needs oil' : ''}`;
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
      e.slots.hidden = p.guns.length < 2;
    }

    // Reticle follows the cursor; ring shows spread, arc shows reload.
    const m = game.input.mouse;
    e.reticle.style.transform = `translate(${m.x}px, ${m.y}px)`;
    const spread = 10 + p.aimSpread() * 4.5 + p.recoil * 8;
    e.ring.style.width = e.ring.style.height = spread * 2 + 'px';
    const circ = 2 * Math.PI * 22;
    e.reload.style.strokeDasharray = `${circ}`;
    e.reload.style.strokeDashoffset = `${circ * (1 - gun.reloadProgress)}`;
    e.reload.style.opacity = gun.reloading ? 1 : 0;
    e.reticle.classList.toggle('empty', gun.ammo === 0);
    e.reticle.classList.toggle('town-reticle', inTown);
    e.reticle.hidden = false;

    // Damage vignette.
    this.hurtT = Math.max(0, this.hurtT - dt);
    const low = hp <= 25 && p.alive ? 0.35 + Math.sin(game.realTime * 6) * 0.1 : 0;
    e.vignette.style.opacity = Math.max(this.hurtT * 1.4, low);

    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) e.toast.classList.remove('show'); }
    if (this.hintT > 0) { this.hintT -= dt; e.hint.classList.toggle('show', this.hintT > 0); }
  }
}
