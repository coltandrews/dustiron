// Conversations, shops and world interactions. Every choice goes through the
// pure rules in items.js, quests.js and life.js, then the life is saved.
import { work, rumorOrder } from './life.js';
import { CATALOGUE, SHOPS, buy, cannotBuy, priceOf } from './items.js';
import { BETS, blackjackText, hitBlackjack, standBlackjack, startBlackjack } from './blackjack.js';
import { accept, NPCS, quest, sellMedicine, turnIn } from './quests.js';
import { KEEPER_NPC, ROLES, greeting, offerText, rumorLine } from './dialogue.js';
import { lootSite, readGrave, takeMedicine } from './progress.js';
import { captivePoint, restrain } from './enemy-captive.js';

const SHOP_OF = { guns: 'guns', doctor: 'doctor', mae: 'saloon', clothes: 'clothes', maps: 'maps', stable: 'stable', juan: 'merchant' };
const LEAD_PRICE = 5, RUMOR_PRICE = 3;

/** The NPC id behind an interaction point, or null for objects. */
export function npcOf(point) {
  if (!point) return null;
  if (point.npc) return point.npc;
  if (point.id?.endsWith('-keeper')) return KEEPER_NPC[point.kind];
  if (['martha', 'silas', 'clara', 'nora'].includes(point.id)) return point.id;
  return null;
}

export class TownActions {
  constructor(game) { this.game = game; this.current = null; this.view = null; }

  points() {
    const g = this.game, list = [];
    if (g.frontier && g.inTown()) list.push(...g.frontier.interactions());
    if (!g.frontier?.inside) {
      if (g.worldPoints) list.push(...g.worldPoints.interactions());
      for (const e of g.enemies) { const p = captivePoint(e); if (p) list.push(p); }
      const horse = g.horse?.point();
      if (horse) list.push(horse);
    }
    return list;
  }

  nearest() {
    const g = this.game;
    if (!g.player?.alive || !g.frontier) return null;
    let best = null, distance = 3.2;
    for (const point of this.points()) {
      if (point.kind === 'door' && g.horse?.mounted) continue;
      const d = Math.hypot(point.x - g.player.x, point.z - g.player.z);
      const range = point.kind === 'seat' ? 1.15 : point.kind === 'door' ? 2.2 : point.kind === 'mount' ? 2.6 : 2.6;
      if (d < range && d < distance) { best = point; distance = d; }
    }
    return best;
  }

  hint() {
    const point = this.nearest();
    if (!point) return '';
    if (point.kind === 'door') return 'Press [E] to Enter';
    if (point.kind === 'seat') return 'E · Sit down';
    if (point.kind === 'blackjack') return 'E · Play blackjack';
    if (point.kind === 'mount') return `F · ${point.label}`;
    const name = point.name ?? (npcOf(point) ? NPCS[npcOf(point)] : null);
    return `E · ${name ? 'Talk to ' + name : point.label}`;
  }

  open() {
    const g = this.game, point = this.nearest();
    if (!point) return;
    if (point.kind === 'door') {
      if (g.frontier.enter(point.siteId)) { g.input.clear(); g.save(); }
      return;
    }
    if (point.kind === 'seat') { if (g.frontier.sit(point)) g.ui.toast('Press a movement key to stand.'); return; }
    if (point.kind === 'mount') { g.horse.mount(); return; }
    const quick = { cache: lootSite, loot: lootSite, medicine: takeMedicine };
    if (quick[point.kind]) { g.ui.questNote(quick[point.kind](g, point)); g.audio.play('coin', { bus: 'ui', vol: 0.6 }); g.save(); return; }
    if (point.kind === 'grave') { g.ui.toast(readGrave(g, point), 7); g.save(); return; }
    if (point.kind === 'proof') {
      g.worldPoints.remove(point);
      g.questEvent({ type: 'proof', targetId: point.enemy.id });
      if (!g.questDefs.some((q) => q.targetId === point.enemy.id && g.run.quests[q.id].status !== 'offered')) g.ui.questNote('You take the red hat. The sheriff pays for proof like this.');
      return;
    }
    if (point.kind === 'restrain') { if (restrain(point.enemy)) g.save(); return; }
    this.current = point;
    this.view = null;
    g.state = 'interaction';
    g.setDeadEye(false);
    g.input.clear();
    g.intent.fireHeld = g.intent.firePressed = false;
    g.save();
    this.draw();
  }

  close() {
    this.current = null;
    this.view = null;
    this.game.state = 'playing';
    this.game.input.clear();
    this.game.ui.show(null);
  }

  shopActions(shop) {
    const life = this.game.run;
    return (SHOPS[shop] ?? []).map((id) => {
      const item = CATALOGUE[id], reason = cannotBuy(life, id, shop);
      return { id: `buy:${id}`, itemId: id.startsWith('ammo') ? 'ammo' : id, label: `${item.name} · $${priceOf(id, shop)}`, detail: reason ?? item.text, disabled: !!reason };
    });
  }

  draw(message = '') {
    const g = this.game, life = g.run, point = this.current, defs = g.questDefs;
    if (point.kind === 'blackjack') return this.drawBlackjack(message);
    const npc = npcOf(point), shop = SHOP_OF[npc];
    let text = '', actions = [];
    if (this.view?.offer) {
      const def = quest(defs, this.view.offer);
      text = offerText(life, def);
      actions = [{ id: `accept:${def.id}`, label: 'Take the job' }, { id: 'back', label: 'Not now' }];
    } else if (this.view?.posters) {
      text = defs.filter((d) => d.type === 'bounty').map((d) => `${d.title.replace('Wanted: ', '')} · ${d.threat} threat · ${d.want === 'either' ? 'dead or alive' : d.want} · $${d.reward.money}${d.want === 'either' ? ` ($${d.aliveReward} alive)` : ''} · ${statusWord(life.quests[d.id].status)}`).join('\n');
      actions = defs.filter((d) => d.type === 'bounty' && life.quests[d.id].status === 'offered').map((d) => ({ id: `offer:${d.id}`, label: `Read: ${d.title.replace('Wanted: ', '')}` }));
      actions.push({ id: 'back', label: 'Step back from the board' });
    } else {
      text = npc ? greeting(life, defs, npc) : point.label ?? '';
      if (npc && !life.met[npc]) life.met[npc] = true;
      for (const def of defs) {
        const s = life.quests[def.id].status;
        if (def.turnIn === npc && s === 'complete') {
          const pay = def.type === 'bounty' && life.quests[def.id].alive ? def.aliveReward : def.reward.money + (def.type === 'traveler' && life.quests[def.id].choice === 'bandage' ? def.bonus : 0);
          actions.push({ id: `turnin:${def.id}`, label: `Collect pay: ${def.title.replace('Wanted: ', '')} · $${pay}` });
        }
        if (def.giver === npc && s === 'offered' && def.type !== 'bounty') actions.push({ id: `offer:${def.id}`, label: `Ask about work: ${def.title}` });
      }
      if (npc === 'sheriff') {
        actions.push({ id: 'posters', label: 'Read the wanted board' });
        actions.push({ id: 'work', label: 'Ask for a day of town work' });
      }
      if (npc === 'martha') {
        for (const def of defs) {
          const s = life.quests[def.id];
          if (def.type === 'bounty' && s.status === 'active' && !s.lead) actions.push({ id: `lead:${def.id}`, label: `Buy a lead on ${def.title.replace('Wanted: ', '')} · $${LEAD_PRICE}`, disabled: life.bounty < LEAD_PRICE });
        }
      }
      if (npc === 'mae') {
        const next = rumorOrder(life).find((place) => !life.rumors.includes(place.id));
        if (next) actions.push({ id: 'rumor', label: `Pay for a rumor · $${RUMOR_PRICE}`, disabled: life.bounty < RUMOR_PRICE });
      }
      if (npc === 'eli' && life.quests.traveler?.status === 'active') {
        actions.push({ id: 'eli:bandage', label: 'Bind his leg with a bandage', disabled: !life.items.bandage });
        actions.push({ id: 'eli:letter', label: 'Take his letter to Clara' });
      }
      if (npc === 'amos' && life.quests.delivery?.parcel && life.quests.delivery.status === 'active') actions.push({ id: 'amos:parcel', label: 'Hand over Nora\'s parcel' });
      if (npc === 'juan' && life.quests.medicine?.carrying && life.quests.medicine.status === 'complete') actions.push({ id: 'sell-medicine', label: 'Sell him the medicine chest · $40' });
      if (shop) actions.push(...this.shopActions(shop));
    }
    if (message) text = `${message}\n\n${text}`;
    g.ui.showInteraction({
      title: point.name ?? point.label ?? NPCS[npc] ?? '', eyebrow: ROLES[npc] ?? 'Town resident',
      text: `${text}${shop ? `\n\nYou have $${life.bounty}.` : ''}`, actions, mode: shop ? 'shop' : 'talk',
    }, (id) => this.act(id));
  }

  drawBlackjack(message) {
    const life = this.game.run;
    let text = blackjackText(life);
    if (message && !text.includes(message)) text = `${message}\n${text}`;
    const actions = life.blackjack.phase === 'playing'
      ? [{ id: 'blackjack:hit', label: 'Hit' }, { id: 'blackjack:stand', label: 'Stand' }]
      : BETS.map((bet) => ({ id: `blackjack:deal:${bet}`, label: `Deal · bet $${bet}`, disabled: life.bounty < bet }));
    this.game.ui.showInteraction({ title: 'Blackjack', eyebrow: 'The Last Drop · table limit $20', text: `${text}\nYou have $${life.bounty}.`, actions, mode: 'blackjack' }, (id) => this.act(id));
  }

  act(id) {
    if (id === 'close') { this.close(); return; }
    const g = this.game, life = g.run, defs = g.questDefs;
    if (!this.current || g.state !== 'interaction') return;
    g.capturePlayer();
    const npc = npcOf(this.current), shop = SHOP_OF[npc];
    let result = null;
    if (id === 'back') { this.view = null; this.draw(); return; }
    if (id === 'posters') { this.view = { posters: true }; this.draw(); return; }
    if (id.startsWith('offer:')) { this.view = { offer: id.slice(6) }; this.draw(); return; }
    if (id.startsWith('accept:')) {
      result = accept(life, defs, id.slice(7)); this.view = null;
      if (result.ok) { g.ui.questNote(result.message); g.audio.play('reloadDone', { bus: 'ui', vol: 0.8, pitch: 1.3 }); }
    } else if (id.startsWith('turnin:')) result = turnIn(life, defs, id.slice(7), npc);
    else if (id.startsWith('buy:') && shop) {
      const item = id.slice(4);
      result = buy(life, item, shop);
      if (result.ok && CATALOGUE[item].kind === 'horse') g.spawnHorse();
    } else if (id === 'work' && npc === 'sheriff') result = work(life);
    else if (id.startsWith('lead:') && npc === 'martha') {
      const def = quest(defs, id.slice(5)), s = life.quests[def.id];
      if (life.bounty < LEAD_PRICE) result = { ok: false, message: `You need $${LEAD_PRICE}.` };
      else { life.bounty -= LEAD_PRICE; s.lead = true; result = { ok: true, message: `"${def.title.replace('Wanted: ', '')}? Look closer in — I marked it on your map."` }; }
    } else if (id === 'rumor' && npc === 'mae') {
      const next = rumorOrder(life).find((place) => !life.rumors.includes(place.id));
      if (!next || life.bounty < RUMOR_PRICE) result = { ok: false, message: 'Nothing new tonight.' };
      else {
        life.bounty -= RUMOR_PRICE; life.rumors.push(next.id);
        if (next.kind && !life.known[next.id]) life.known[next.id] = 'rumor';
        result = { ok: true, message: rumorLine(next) };
      }
    } else if (id.startsWith('eli:')) {
      const choice = id.slice(4);
      if (choice === 'bandage') { life.items.bandage--; }
      g.questEvent({ type: 'talk', npc: 'eli', choice });
      if (choice === 'bandage') { life.known[this.current.site.id] = 'helped'; g.worldPoints.removeNpc('eli'); this.close(); g.save(); return; }
      result = { ok: true, message: 'He presses a folded letter into your hand.' };
    } else if (id === 'amos:parcel') { g.questEvent({ type: 'talk', npc: 'amos' }); result = { ok: true, message: 'Amos takes the parcel and nods. "Tell Nora thanks."' }; }
    else if (id === 'sell-medicine') result = sellMedicine(life, defs);
    else if (id.startsWith('blackjack:') && this.current.kind === 'blackjack') {
      const [, move, bet] = id.split(':');
      result = move === 'deal' ? startBlackjack(life, Number(bet)) : move === 'hit' ? hitBlackjack(life) : standBlackjack(life);
    }
    if (!result) return;
    if (result.ok) {
      g.player.refreshInventory(life);
      g.save();
      if (id.startsWith('buy:') || id.startsWith('turnin:')) g.audio.play('coin', { bus: 'ui', vol: 0.7 });
      if (id.startsWith('turnin:')) g.ui.questNote(result.message);
    }
    this.draw(result.message);
  }
}

function statusWord(status) {
  return { offered: 'open', active: 'you are on it', complete: 'ready to collect', turnedIn: 'paid', failed: 'closed' }[status];
}

