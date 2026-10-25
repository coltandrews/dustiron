// The online parts of the interface: joining from the title, the rider count,
// chat, calling someone out for a duel, and answering a call. Also swaps in a
// new life when the server deals one.
import { Net, forgetIdentity, savedIdentity } from './net.js';
import { DUEL_MODES, DUEL_WAGERS, DUEL_RANGE } from './protocol.js';
import { ChatBox } from './chat.js';
import { DICE_WAGERS } from './poker-dice.js';

const FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

const MODE_NAMES = { blood: 'First blood', death: 'To the death' };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function el(tag, cls, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

export class NetUI {
  constructor(game) {
    this.game = game;
    this.lines = [];
    this.ask = null;
    this.duelCount = -1;
    game.netUI = this;
    this.buildTitle();
    this.buildHud();
    addEventListener('keydown', (e) => this.key(e), true);
  }

  // ---------- title ----------

  buildTitle() {
    const menu = document.querySelector('.title-menu');
    if (!menu) return;
    this.joinBox = el('div', 'online-join');
    menu.appendChild(this.joinBox);
    this.drawJoin();
  }

  /**
   * A returning rider gets one button with their name on it. Someone new (or
   * someone starting a different rider) types a name first.
   */
  drawJoin(message = '') {
    const box = this.joinBox, { name, token } = savedIdentity(), known = !!(token && name);
    box.innerHTML = `
      ${known ? `
        <p class="join-who">Welcome back, <b>${esc(name)}</b>.</p>
        <button id="btn-online" class="btn primary" type="button">Continue as ${esc(name)}</button>
        <button id="btn-new-rider" class="btn link-btn" type="button">Start a different rider</button>`
      : `
        <label class="online-name"><span>Name</span><input id="online-name" maxlength="16" autocomplete="nickname" spellcheck="false" placeholder="Your rider's name"></label>
        <button id="btn-online" class="btn primary" type="button">Spawn in</button>`}
      <p class="fine">One shared frontier, up to 20 riders. Towns are safe unless you agree to a duel. One life.</p>
      <p class="online-status" id="online-status" aria-live="polite"></p>`;
    this.nameInput = box.querySelector('#online-name');
    this.status = box.querySelector('#online-status');
    this.status.textContent = message;
    box.querySelector('#btn-online').addEventListener('click', () => this.join());
    this.nameInput?.addEventListener('keydown', (e) => { if (e.code === 'Enter') { e.preventDefault(); this.join(); } });
    box.querySelector('#btn-new-rider')?.addEventListener('click', () => {
      if (!this.confirmNew) {
        this.confirmNew = true;
        this.status.textContent = `${name} stays on the server, but this browser will forget them. Click again to start someone new.`;
        return;
      }
      this.confirmNew = false;
      forgetIdentity();
      this.drawJoin();
      this.nameInput?.focus();
    });
  }

  async join() {
    const g = this.game;
    if (this.joining || g.net) return;
    g.audio.unlock();
    g.audio.play('uiClick', { bus: 'ui' });
    const saved = savedIdentity();
    const name = this.nameInput ? this.nameInput.value.trim() : saved.name;
    if (!saved.token && (!name || name.length < 2)) { this.status.textContent = 'Pick a name of 2 to 16 letters.'; return; }
    this.joining = true;
    this.status.textContent = 'Riding out… a sleeping server takes a few seconds to wake.';
    const net = new Net(g);
    try {
      const welcome = await net.connect(name);
      this.start(net, welcome);
      this.drawJoin();
    } catch (e) {
      net.close();
      // A token the server no longer knows was forgotten by net.js; show the name form again.
      this.drawJoin(e.message);
    } finally {
      this.joining = false;
    }
  }

  start(net, welcome) {
    const g = this.game;
    g.net = net;
    this.chat?.show(true);
    net.on('chat', (m) => this.chat?.receive(m));
    net.on('life', (m) => this.onLife(m));
    net.on('duelAsk', (m) => this.onAsk(m));
    net.on('duel', (m) => this.onDuel(m));
    net.on('diceAsk', (m) => this.onDiceAsk(m));
    net.on('dice', (m) => this.onDice(m));
    net.on('disconnect', () => this.lost());
    g.continueRun({ ...welcome.life, camps: welcome.camps ?? {} });
    this.renderRoster();
    if (welcome.ended) this.chat?.system(`Your last rider fell with $${welcome.ended.bounty}. This is a new life.`);
    this.chat?.system(`Welcome to the frontier, ${welcome.name}. Enter to chat (/s say · /y yell · /g world · /w name whisper). G near a rider to duel or play dice.`);
    g.ui.toast(`Welcome to the frontier, ${welcome.name}.`, 4);
  }

  onLife(m) {
    const g = this.game;
    const fresh = { ...m.life, camps: m.camps ?? {} };
    g.continueRun(fresh);
    if (m.fresh) g.ui.toast('A new rider comes to Mercy Crossing.', 4);
    else g.ui.toast('The server could not accept that change. Your last good save is back.', 6);
  }

  lost() {
    const g = this.game;
    if (!g.net) return;
    g.net = null;
    g.unload();
    g.state = 'title';
    g.ui.show('title');
    this.drawJoin('Lost the connection to the server.');
    this.hide();
  }

  // ---------- HUD ----------

  buildHud() {
    const hud = document.getElementById('hud');
    if (!hud) return;
    this.rosterEl = el('div', 'online-roster');
    this.banner = el('div', 'duel-banner');
    this.banner.hidden = true;
    this.offer = el('div', 'duel-offer panel');
    this.offer.hidden = true;
    let tags = document.getElementById('rider-tags');
    if (!tags) { tags = el('div'); tags.id = 'rider-tags'; document.getElementById('app').appendChild(tags); }
    hud.append(this.rosterEl, this.banner, this.offer);
    this.chat = new ChatBox(this.game, hud, tags);
  }

  hide() {
    for (const n of [this.rosterEl, this.banner, this.offer]) if (n) n.textContent = '';
    if (this.offer) this.offer.hidden = true;
    if (this.banner) this.banner.hidden = true;
    this.chat?.show(false);
  }

  renderRoster() {
    const net = this.game.net;
    if (!net || !this.rosterEl) return;
    const names = [...net.roster.values()].map((r) => esc(r.name));
    this.rosterEl.innerHTML = `<b>${net.roster.size}/20 riders</b> · ${net.ping} ms<div class="roster-names">${names.join(' · ')}</div>`;
  }

  // ---------- duels ----------

  /** Calls out the nearest rider in reach. */
  openOffer() {
    const g = this.game, p = g.player;
    if (!p?.alive || g.net.duel) return;
    const room = g.frontier?.inside ? g.run.interior?.id ?? '' : '';
    const near = g.netWorld.remote.near(p.x, p.z, DUEL_RANGE, room).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (!near) { g.ui.toast('Nobody close enough to call out.', 2.5); return; }
    this.offerTo = near.id;
    this.offerGame = g.inTown() ? 'dice' : 'duel';
    this.offerMode = 'blood';
    this.offerWager = this.offerGame === 'dice' ? DICE_WAGERS[0] : 0;
    this.drawOffer(near.name);
  }

  drawOffer(name) {
    const dice = this.offerGame === 'dice';
    const games = [['duel', 'Duel'], ['dice', 'Poker dice']].map(([k, label]) => `<button class="btn ${k === this.offerGame ? 'primary' : ''}" data-game="${k}" type="button">${label}</button>`).join('');
    const modes = dice ? '' : Object.keys(DUEL_MODES).map((m) => `<button class="btn ${m === this.offerMode ? 'primary' : ''}" data-mode="${m}" type="button">${MODE_NAMES[m]}</button>`).join('');
    const wagers = (dice ? DICE_WAGERS : DUEL_WAGERS).map((w) => `<button class="btn ${w === this.offerWager ? 'primary' : ''}" data-wager="${w}" type="button">${w ? `$${w}` : 'No bet'}</button>`).join('');
    const note = dice ? 'Five dice each, best poker hand takes the pot. Stand close, in town.'
      : this.offerMode === 'death' ? 'Whoever falls loses that life for good.' : 'The first rider hurt badly loses. Nobody dies.';
    this.offer.innerHTML = `<h3>${dice ? 'Dice with' : 'Call out'} ${esc(name)}</h3>
      <div class="actions">${games}</div>
      <p class="fine">${note}</p>
      ${modes ? `<div class="actions">${modes}</div>` : ''}<div class="actions">${wagers}</div>
      <div class="actions"><button class="btn primary" data-send type="button">${dice ? 'Offer the game' : 'Send the challenge'}</button><button class="btn" data-cancel type="button">Never mind</button></div>`;
    this.offer.hidden = false;
    this.offer.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      e.stopPropagation();
      this.game.audio.play('uiClick', { bus: 'ui' });
      if (b.dataset.game) { this.offerGame = b.dataset.game; this.offerWager = b.dataset.game === 'dice' ? DICE_WAGERS[0] : 0; this.drawOffer(name); }
      else if (b.dataset.mode) { this.offerMode = b.dataset.mode; this.drawOffer(name); }
      else if (b.dataset.wager) { this.offerWager = Number(b.dataset.wager); this.drawOffer(name); }
      else if (b.hasAttribute('data-send')) {
        if (this.offerGame === 'dice') this.game.net.act('dice', { to: this.offerTo, wager: this.offerWager });
        else { this.game.net.act('duel', { to: this.offerTo, mode: this.offerMode, wager: this.offerWager }); this.game.ui.toast(`You call out ${name}.`, 3); }
        this.offer.hidden = true;
      } else this.offer.hidden = true;
    };
  }

  onDiceAsk(m) {
    this.ask = { kind: 'dice', from: m.from, until: performance.now() + m.s * 1000 };
    this.showBanner(`<b>${esc(m.name)}</b> offers a game of poker dice · $${m.wager} each<br><kbd>Y</kbd> play · <kbd>X</kbd> pass`);
    this.game.audio.play('chips', { bus: 'ui', vol: 0.7 });
  }

  onDice(m) {
    const net = this.game.net, me = net.id, other = m.a === me ? m.b : m.a;
    const row = (id, label) => `<div class="dice-row"><span>${esc(label)}</span><span class="dice-faces">${m.rolls[id].map((d) => FACES[d]).join('')}</span><span>${esc(m.hands[id])}</span></div>`;
    const verdict = !m.winner ? 'A tie. Stakes returned.' : m.winner === me ? `You win $${m.wager * 2}.` : `${esc(m.names[other])} takes the pot.`;
    this.showBanner(`${row(me, 'You')}${row(other, m.names[other])}<div class="dice-verdict">${verdict}</div>`, 6);
    const a = this.game.audio;
    for (let i = 0; i < 5; i++) a.play('card', { bus: 'ui', vol: 0.5, delay: i * 0.08, pitch: 0.6 });
    if (m.winner === me) a.play('coin', { bus: 'ui', vol: 0.7, delay: 0.5 });
  }

  onAsk(m) {
    this.ask = { kind: 'duel', from: m.from, until: performance.now() + m.s * 1000 };
    this.showBanner(`<b>${esc(m.name)}</b> calls you out · ${MODE_NAMES[m.mode] ?? m.mode}${m.wager ? ` · $${m.wager} each` : ''}<br><kbd>Y</kbd> accept · <kbd>X</kbd> refuse`);
    this.game.audio.play('quillNote', { bus: 'ui', vol: 0.8 });
  }

  answer(yes) {
    if (!this.ask) return;
    this.game.net.act(this.ask.kind === 'dice' ? 'diceAnswer' : 'duelAnswer', { from: this.ask.from, yes });
    this.ask = null;
    this.banner.hidden = true;
  }

  onDuel(m) {
    const g = this.game, net = g.net;
    if (m.phase === 'start') {
      const other = m.names[m.a === net.id ? m.b : m.a] ?? 'a rider';
      this.duelCount = m.count;
      this.duelOther = other;
      this.showBanner(`Duel with <b>${esc(other)}</b> · ${MODE_NAMES[m.mode]}${m.wager ? ` · $${m.wager * 2} pot` : ''}<div class="duel-count">${Math.ceil(m.count)}</div>`);
      g.audio.cue?.('duel');
    } else if (m.phase === 'draw') {
      this.duelCount = -1;
      this.showBanner('<div class="duel-count draw">Draw!</div>', 1.2);
      g.audio.play('uiClick', { bus: 'ui', pitch: 1.6 });
    } else if (m.phase === 'end') {
      this.duelCount = -1;
      const won = m.winner === net.id;
      const text = !m.winner ? 'The duel is off.' : won ? 'You win the duel.' : 'You lose the duel.';
      this.showBanner(`<b>${text}</b>${m.reason ? `<div class="fine">${esc(m.reason)}</div>` : ''}`, 3);
    }
  }

  showBanner(html, seconds = 0) {
    this.banner.innerHTML = html;
    this.banner.hidden = false;
    this.bannerUntil = seconds ? performance.now() + seconds * 1000 : 0;
  }

  // ---------- input and per-frame ----------

  key(e) {
    const g = this.game;
    if (!g.net || e.repeat) return;
    if (this.chat?.typing) return;
    if (g.state !== 'playing' || e.target?.closest?.('input, textarea')) return;
    if (e.code === 'KeyT' || e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); e.stopPropagation(); this.chat?.open(); }
    else if (e.code === 'Slash') { e.preventDefault(); e.stopPropagation(); this.chat?.open('/'); }
    else if (e.code === 'KeyG') { e.stopPropagation(); this.openOffer(); }
    else if (e.code === 'KeyY' && this.ask) { e.stopPropagation(); this.answer(true); }
    else if (e.code === 'KeyX' && this.ask) { e.stopPropagation(); this.answer(false); }
    else if (e.code === 'Escape' && !this.offer.hidden) { e.stopPropagation(); this.offer.hidden = true; }
  }

  update(dt) {
    const g = this.game;
    if (!g.net) return;
    const now = performance.now();
    if (this.ask && now > this.ask.until) { this.ask = null; this.banner.hidden = true; }
    if (this.duelCount > 0) {
      this.duelCount -= dt;
      const n = this.banner.querySelector('.duel-count');
      if (n) n.textContent = String(Math.max(1, Math.ceil(this.duelCount)));
    }
    if (this.bannerUntil && now > this.bannerUntil) { this.bannerUntil = 0; this.banner.hidden = true; }
    this.rosterT = (this.rosterT ?? 0) - dt;
    if (this.rosterT <= 0) { this.rosterT = 2; this.renderRoster(); }
    this.chat?.update();
  }
}
