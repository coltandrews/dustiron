// Online chat, in the style of an MMO chat frame: a log in the lower left that
// keeps its history, colored channels, slash commands, tabs, and speech
// bubbles over the heads of riders who talk nearby.
//
//   Enter or T     open the chat line (/ opens it with a slash)
//   /s  /say       nearby riders (default)       /y  /yell   everyone within shouting range
//   /g  /world     everyone on the server        /w Name     whisper    /r  reply
import { cleanChat } from './protocol.js';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const HISTORY = 200;
const TABS = { all: 'All', world: 'World', whisper: 'Whispers' };
const CHANNEL_LABEL = { say: 'Say', yell: 'Yell', world: 'World', whisper: 'Whisper' };
const _v = { x: 0, y: 0, z: 0 };

export class ChatBox {
  constructor(game, hud, tagLayer) {
    this.game = game;
    this.lines = [];
    this.tab = 'all';
    this.channel = 'say';
    this.whisperTo = null;
    this.replyTo = null;
    this.bubbles = new Map();
    this.lastActivity = 0;
    this.tagLayer = tagLayer;
    this.frame = document.createElement('div');
    this.frame.className = 'chat-frame';
    this.frame.hidden = true;
    this.frame.innerHTML = `
      <div class="chat-tabs">${Object.entries(TABS).map(([k, v]) => `<button type="button" data-tab="${k}" class="${k === 'all' ? 'on' : ''}">${v}</button>`).join('')}</div>
      <div class="chat-lines" role="log" aria-live="polite"></div>
      <form class="chat-entry" hidden><span class="chat-channel"></span><input maxlength="140" autocomplete="off" spellcheck="false" aria-label="Chat message"></form>`;
    hud.appendChild(this.frame);
    this.list = this.frame.querySelector('.chat-lines');
    this.form = this.frame.querySelector('.chat-entry');
    this.input = this.form.querySelector('input');
    this.label = this.form.querySelector('.chat-channel');
    this.frame.querySelector('.chat-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.tab = b.dataset.tab;
      for (const x of this.frame.querySelectorAll('.chat-tabs button')) x.classList.toggle('on', x === b);
      this.render(true);
    });
    // Clicking a name starts a whisper to that rider.
    this.list.addEventListener('click', (e) => {
      const name = e.target.closest('[data-name]')?.dataset.name;
      if (name && name !== this.game.net?.name) this.open(`/w ${name} `);
    });
    this.form.addEventListener('submit', (e) => { e.preventDefault(); this.send(); });
    this.input.addEventListener('input', () => this.parseLive());
    this.input.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
      e.stopPropagation();
    });
  }

  get typing() { return document.activeElement === this.input; }

  show(on) {
    this.frame.hidden = !on;
    if (!on) { this.close(); this.lines = []; this.render(true); this.clearBubbles(); }
  }

  // ---------- incoming ----------

  /** A chat message from the server: {ch, from, name, text, to}. System lines have no sender. */
  receive(m) {
    const ch = m.from ? (m.ch ?? 'world') : 'system';
    const me = this.game.net?.id;
    if (ch === 'whisper' && m.from !== me) this.replyTo = m.name;
    this.add({ ch, from: m.from, name: m.name, to: m.to, text: m.text, mine: m.from === me });
    if ((ch === 'say' || ch === 'yell') && m.from) this.bubble(m.from, m.text, ch === 'yell');
    if (ch === 'whisper' && m.from !== me) this.game.audio.play('quillNote', { bus: 'ui', vol: 0.5, pitch: 1.4 });
  }

  /** A line written here, not sent by the server. */
  system(text) { this.add({ ch: 'system', text }); }

  add(line) {
    line.t = performance.now();
    this.lines.push(line);
    if (this.lines.length > HISTORY) this.lines.shift();
    this.lastActivity = line.t;
    this.render();
  }

  format(l) {
    const who = (name) => `<span class="chat-name" data-name="${esc(name)}">[${esc(name)}]</span>`;
    switch (l.ch) {
      case 'say': return `${who(l.name)} says: ${esc(l.text)}`;
      case 'yell': return `${who(l.name)} yells: ${esc(l.text.toUpperCase())}`;
      case 'world': return `[World] ${who(l.name)}: ${esc(l.text)}`;
      case 'whisper': return l.mine ? `To ${who(l.to)}: ${esc(l.text)}` : `${who(l.name)} whispers: ${esc(l.text)}`;
      default: return esc(l.text);
    }
  }

  render(force = false) {
    const shown = this.lines.filter((l) => this.tab === 'all' || l.ch === this.tab || (this.tab === 'world' && l.ch === 'system'));
    const atBottom = force || this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 30;
    this.list.innerHTML = shown.map((l) => `<div class="chat-line ch-${l.ch}">${this.format(l)}</div>`).join('');
    if (atBottom) this.list.scrollTop = this.list.scrollHeight;
  }

  // ---------- typing ----------

  open(prefill = '') {
    if (!this.game.net) return;
    this.form.hidden = false;
    this.frame.classList.add('active');
    this.input.value = prefill;
    this.game.input.clear();
    this.parseLive();
    setTimeout(() => { this.input.focus(); this.input.setSelectionRange(this.input.value.length, this.input.value.length); }, 0);
  }

  close() {
    this.form.hidden = true;
    this.frame.classList.remove('active');
    this.input.blur();
    this.game.input?.clear();
  }

  /** Switches channel as soon as a command is typed, like "/y " or "/w Rae ". */
  parseLive() {
    const v = this.input.value;
    const m = v.match(/^\/(s|say|y|yell|g|world|1|r|reply)\s/i) || v.match(/^\/(w|whisper|tell)\s+(\S+)\s/i);
    if (m) {
      const cmd = m[1].toLowerCase();
      if (cmd === 'w' || cmd === 'whisper' || cmd === 'tell') { this.channel = 'whisper'; this.whisperTo = m[2]; }
      else if (cmd === 'r' || cmd === 'reply') { if (this.replyTo) { this.channel = 'whisper'; this.whisperTo = this.replyTo; } }
      else this.channel = { s: 'say', say: 'say', y: 'yell', yell: 'yell', g: 'world', world: 'world', 1: 'world' }[cmd];
      this.input.value = v.slice(m[0].length);
    }
    this.label.textContent = this.channel === 'whisper' ? `To ${this.whisperTo}:` : `${CHANNEL_LABEL[this.channel]}:`;
    this.form.dataset.ch = this.channel;
  }

  send() {
    const text = cleanChat(this.input.value);
    const net = this.game.net;
    if (text && net) {
      if (text === '/help') this.system('Chat: /s say (nearby) · /y yell · /g world · /w Name whisper · /r reply. Click a name to whisper.');
      else net.send({ t: 'chat', ch: this.channel, to: this.channel === 'whisper' ? this.whisperTo : undefined, text });
    }
    this.close();
  }

  // ---------- speech bubbles ----------

  bubble(id, text, yell) {
    if (!this.tagLayer) return;
    let b = this.bubbles.get(id);
    if (!b) {
      b = { el: document.createElement('div') };
      b.el.className = 'chat-bubble';
      this.tagLayer.appendChild(b.el);
      this.bubbles.set(id, b);
    }
    b.el.classList.toggle('yell', yell);
    b.el.textContent = yell ? text.toUpperCase() : text;
    b.until = performance.now() + 5000 + text.length * 60;
  }

  clearBubbles() {
    for (const b of this.bubbles.values()) b.el.remove();
    this.bubbles.clear();
  }

  /** Keeps each bubble over its speaker's head; called every frame. */
  update() {
    const g = this.game, now = performance.now();
    this.frame.classList.toggle('idle', !this.typing && now - this.lastActivity > 30000);
    if (!this.bubbles.size) return;
    const camera = g.rig?.camera, w = innerWidth, h = innerHeight, me = g.net?.id;
    const myRoom = g.frontier?.inside ? g.run?.interior?.id ?? '' : '';
    for (const [id, b] of this.bubbles) {
      if (now > b.until) { b.el.remove(); this.bubbles.delete(id); continue; }
      let pos = null, mounted = false;
      if (id === me && g.player?.alive) { pos = g.player.model.root.position; mounted = !!g.horse?.mounted; }
      else {
        const r = g.netWorld?.remote.get(id);
        if (r && r.alive && !r.stale && r.room === myRoom) { pos = r.model.root.position; mounted = !!(r.flags & 4); }
      }
      if (!pos || !camera) { b.el.hidden = true; continue; }
      _v.x = pos.x; _v.y = (mounted ? 3.6 : 2.5) + 0.55; _v.z = pos.z;
      const v = camera.position.clone().set(_v.x, _v.y, _v.z).project(camera);
      const on = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      b.el.hidden = !on;
      if (on) b.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
      b.el.style.opacity = String(Math.min(1, (b.until - now) / 600));
    }
  }
}
