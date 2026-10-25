// Conversations, shops and world interactions. Every choice goes through the
// pure rules in items.js, quests.js and life.js, then the life is saved.
import { work, rumorOrder } from './life.js';
import { CATALOGUE, SHOPS, buy, cannotBuy, priceOf } from './items.js';
import {
  BETS, canDoubleBlackjack, canSplitBlackjack, doubleBlackjack, hitBlackjack, splitBlackjack, standBlackjack, startBlackjack,
} from './blackjack.js';
import { accept, bringStep, NPCS, quest, sellMedicine, turnIn } from './quests.js';
import { PELTS, CATALOGUE as ITEMS } from './items.js';
import { drink } from './vices.js';
import { KEEPER_NPC, greeting, offerText, rumorLine } from './dialogue.js';
import { lootSite, readGrave, takeMedicine } from './progress.js';
import { captivePoint, restrain } from './enemy-captive.js';

const SHOP_OF = { guns: 'guns', doctor: 'doctor', mae: 'saloon', clothes: 'clothes', maps: 'maps', stable: 'stable', juan: 'merchant', ruby: 'pineSaloon', hank: 'trading', lacey: 'pineDoctor' };
const PELT_BUYERS = new Set(['hank', 'otto']);
const BARKEEPS = new Set(['mae', 'ruby']);
const BROWSE_LABEL = {
  guns: 'Show me your weapons',
  doctor: 'I need medicine',
  saloon: 'What do you have?',
  clothes: 'Show me your clothing',
  maps: 'Show me your maps',
  stable: 'Show me the horses',
  merchant: 'Show me your goods',
  pineSaloon: 'What are you pouring?',
  trading: 'Let me see the shelves',
  pineDoctor: 'I need patching up',
};
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
  constructor(game) { this.game = game; this.current = null; this.view = null; this.cameraDistance = null; this.nearbyKey = null; }

  pointKey(point) { return point ? `${point.kind}:${point.id}` : null; }

  pointRange(point) {
    if (['seat', 'blackjack'].includes(point.kind)) return 1.15;
    if (point.kind === 'door') return 2.2;
    // Shopkeepers stand behind a counter, so their prompt reaches across it.
    if (point.id?.endsWith('-keeper')) return 3.1;
    if (point.kind === 'npc' || npcOf(point)) return 1.2;
    return 2.6;
  }

  points() {
    const g = this.game, list = [];
    if (g.frontier && g.inTown()) list.push(...g.frontier.interactions());
    if (!g.frontier?.inside) {
      if (g.worldPoints) list.push(...g.worldPoints.interactions());
      for (const e of g.enemies) { const p = captivePoint(e); if (p) list.push(p); }
      const horse = g.horse?.point();
      if (horse) list.push(horse);
      if (g.wildlife) list.push(...g.wildlife.points());
    }
    return list;
  }

  nearest() {
    const g = this.game;
    if (!g.player?.alive || !g.frontier) { this.nearbyKey = null; return null; }
    const points = this.points().filter((point) => !(point.kind === 'door' && g.horse?.mounted));
    if (this.nearbyKey) {
      const held = points.find((point) => this.pointKey(point) === this.nearbyKey);
      if (held) {
        const distance = Math.hypot(held.x - g.player.x, held.z - g.player.z);
        const margin = (held.kind === 'npc' || npcOf(held)) && !held.id?.endsWith('-keeper') ? 0.1 : 0.45;
        if (distance < this.pointRange(held) + margin) return held;
      }
      this.nearbyKey = null;
    }
    let best = null, distance = 3.2;
    for (const point of points) {
      const d = Math.hypot(point.x - g.player.x, point.z - g.player.z);
      const range = this.pointRange(point);
      if (d < range && d < distance) { best = point; distance = d; }
    }
    this.nearbyKey = this.pointKey(best);
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
    if (point.kind === 'skin') { g.wildlife.skin(point); return; }
    if (point.kind === 'proof') {
      g.worldPoints.remove(point);
      g.questEvent({ type: 'proof', targetId: point.enemy.id });
      if (!g.questDefs.some((q) => q.targetId === point.enemy.id && g.run.quests[q.id].status !== 'offered')) g.ui.questNote('You take the red hat. The sheriff pays for proof like this.');
      return;
    }
    if (point.kind === 'restrain') {
      if (g.net) g.net.act('restrain', { id: point.enemy.id });
      else if (restrain(point.enemy)) g.save();
      return;
    }
    this.current = point;
    this.view = null;
    this.cameraDistance = g.rig.targetDistance;
    if (point.kind === 'blackjack') {
      g.frontier.sit(point);
      g.rig.targetDistance = 14;
    } else {
      g.rig.targetDistance = 16;
      g.frontier.setCameraFocus?.({ x: (g.player.x + point.x) / 2, z: (g.player.z + point.z) / 2 });
    }
    g.state = 'interaction';
    g.setDeadEye(false);
    g.input.clear();
    g.intent.fireHeld = g.intent.firePressed = false;
    g.save();
    this.draw();
  }

  close() {
    this.game.frontier.setCameraFocus?.(null);
    if (this.cameraDistance !== null) {
      this.game.rig.targetDistance = this.cameraDistance;
      this.cameraDistance = null;
    }
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
      return {
        id: `buy:${id}`,
        itemId: id.startsWith('ammo') ? 'ammo' : id,
        label: item.name,
        price: `$${priceOf(id, shop)}`,
        detail: reason ?? item.text,
        disabled: !!reason,
      };
    });
  }

  draw(feedback = null) {
    const g = this.game, life = g.run, point = this.current, defs = g.questDefs;
    const message = typeof feedback === 'string' ? feedback : feedback?.text ?? '';
    const spokenFeedback = typeof feedback === 'object' && feedback?.spoken;
    if (point.kind === 'blackjack') return this.drawBlackjack(message);
    const npc = npcOf(point), shop = SHOP_OF[npc];
    let text = '', speech = '', detail = '', actions = [];
    const browsing = Boolean(this.view?.shop && shop);
    if (browsing) {
      const result = message.replace(/\.$/, '');
      text = result ? `${result} · $${life.bounty} left` : `$${life.bounty}`;
      actions = [...this.shopActions(shop), { id: 'back', label: 'Back to conversation' }];
    } else if (this.view?.offer) {
      const def = quest(defs, this.view.offer);
      text = offerText(life, def);
      actions = [{ id: `accept:${def.id}`, label: 'Take the job' }, { id: 'back', label: 'Not now' }];
    } else if (this.view?.posters) {
      text = defs.filter((d) => d.type === 'bounty' && d.giver === npc).map((d) => `${d.title.replace('Wanted: ', '')} · ${d.threat} threat · ${d.want === 'either' ? 'dead or alive' : d.want} · $${d.reward.money}${d.want === 'either' ? ` ($${d.aliveReward} alive)` : ''} · ${statusWord(life.quests[d.id].status)}`).join('\n');
      actions = defs.filter((d) => d.type === 'bounty' && d.giver === npc && life.quests[d.id].status === 'offered').map((d) => ({ id: `offer:${d.id}`, label: `Read: ${d.title.replace('Wanted: ', '')}` }));
      actions.push({ id: 'back', label: 'Step back from the board' });
    } else {
      if (npc) {
        const conversation = greeting(life, defs, npc);
        speech = spokenFeedback ? message : conversation.speech;
        detail = spokenFeedback ? '' : message || conversation.detail;
      } else text = point.label ?? '';
      if (npc && !life.met[npc]) life.met[npc] = true;
      for (const def of defs) {
        const s = life.quests[def.id].status;
        if (def.turnIn === npc && s === 'complete') {
          const pay = def.type === 'bounty' && life.quests[def.id].alive ? def.aliveReward : def.reward.money + (def.type === 'traveler' && life.quests[def.id].choice === 'bandage' ? def.bonus : 0);
          actions.push({ id: `turnin:${def.id}`, label: `Collect pay: ${def.title.replace('Wanted: ', '')} · $${pay}` });
        }
        if (def.giver === npc && s === 'offered' && def.type !== 'bounty') actions.push({ id: `offer:${def.id}`, label: `Ask about work: ${def.title}` });
      }
      if (npc === 'sheriff' || npc === 'hale') actions.push({ id: 'posters', label: 'Read the wanted board' });
      if (npc === 'sheriff') actions.push({ id: 'work', label: 'Ask for a day of town work' });
      if (BARKEEPS.has(npc)) {
        actions.push({ id: 'drink:beer', label: `Have a beer at the bar · $${ITEMS.beer.price}`, disabled: life.bounty < ITEMS.beer.price });
        actions.push({ id: 'drink:whiskey', label: `Knock back a whiskey · $${ITEMS.whiskey.price}`, disabled: life.bounty < ITEMS.whiskey.price });
      }
      if (PELT_BUYERS.has(npc)) {
        const worth = Object.entries(PELTS).reduce((sum, [id, p]) => sum + (life.items[id] ?? 0) * p.price, 0);
        if (worth) actions.push({ id: 'sell-pelts', label: `Sell your hides and pelts · $${worth}` });
      }
      for (const def of defs) {
        const s = life.quests[def.id], step = def.steps?.[s.step ?? 0];
        if (def.type === 'chain' && def.turnIn === npc && s.status === 'active' && step?.kind === 'bring') {
          actions.push({ id: `bring:${def.id}`, label: `Hand over ${step.count} ${PELTS[step.item].name.toLowerCase()}s (${life.items[step.item] ?? 0} carried)`, disabled: (life.items[step.item] ?? 0) < step.count });
        }
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
      if (shop) actions.push({ id: 'browse', label: BROWSE_LABEL[shop] });
    }
    if (message && !browsing && !npc) text = `${message}\n\n${text}`;
    g.ui.showInteraction({
      title: point.name ?? point.label ?? NPCS[npc] ?? '',
      text,
      speech,
      detail,
      actions,
      mode: browsing ? 'shop' : 'talk',
    }, (id) => this.act(id));
  }

  drawBlackjack(message) {
    const life = this.game.run;
    const actions = life.blackjack.phase === 'playing'
      ? [
        { id: 'blackjack:hit', label: 'Hit' },
        { id: 'blackjack:stand', label: 'Stand' },
        { id: 'blackjack:double', label: 'Double', disabled: !canDoubleBlackjack(life) },
        { id: 'blackjack:split', label: 'Split', disabled: !canSplitBlackjack(life) },
      ]
      : BETS.map((bet) => ({ id: `blackjack:deal:${bet}`, label: `$${bet}`, disabled: life.bounty < bet }));
    this.game.ui.showInteraction({
      title: 'Blackjack', text: message, actions, mode: 'blackjack',
      blackjack: { state: life.blackjack, balance: life.bounty },
    }, (id) => this.act(id));
  }

  act(id) {
    if (id === 'close') { this.close(); return; }
    const g = this.game, life = g.run, defs = g.questDefs;
    if (!this.current || g.state !== 'interaction') return;
    g.capturePlayer();
    const npc = npcOf(this.current), shop = SHOP_OF[npc];
    let result = null, resultIsSpeech = false;
    if (id === 'back') { this.view = null; this.draw(); return; }
    if (id === 'browse' && shop) { this.view = { shop: true }; this.draw(); return; }
    if (id === 'posters') { this.view = { posters: true }; this.draw(); return; }
    if (id.startsWith('offer:')) { this.view = { offer: id.slice(6) }; this.draw(); return; }
    if (id.startsWith('accept:')) {
      result = accept(life, defs, id.slice(7)); this.view = null;
      if (result.ok) { g.ui.questNote(result.message); g.audio.play('quillNote', { bus: 'ui', vol: 0.8 }); }
    } else if (id.startsWith('turnin:')) result = turnIn(life, defs, id.slice(7), npc);
    else if (id.startsWith('buy:') && shop) {
      const item = id.slice(4);
      result = buy(life, item, shop);
      if (result.ok && CATALOGUE[item].kind === 'horse') g.spawnHorse();
      if (result.ok && item === 'heal') g.net?.act('heal', { src: 'treat' });
    } else if (id === 'work' && npc === 'sheriff') result = work(life);
    else if (id.startsWith('lead:') && npc === 'martha') {
      resultIsSpeech = true;
      const def = quest(defs, id.slice(5)), s = life.quests[def.id];
      if (life.bounty < LEAD_PRICE) result = { ok: false, message: `You need $${LEAD_PRICE}.` };
      else { life.bounty -= LEAD_PRICE; s.lead = true; result = { ok: true, message: `${def.title.replace('Wanted: ', '')}? Look closer in — I marked it on your map.` }; }
    } else if (id === 'rumor' && npc === 'mae') {
      resultIsSpeech = true;
      const next = rumorOrder(life).find((place) => !life.rumors.includes(place.id));
      if (!next || life.bounty < RUMOR_PRICE) result = { ok: false, message: 'Nothing new tonight.' };
      else {
        life.bounty -= RUMOR_PRICE; life.rumors.push(next.id);
        if (next.kind && !life.known[next.id]) life.known[next.id] = 'rumor';
        result = { ok: true, message: rumorLine(next) };
      }
    } else if (id.startsWith('eli:')) {
      resultIsSpeech = true;
      const choice = id.slice(4);
      if (choice === 'bandage') { life.items.bandage--; }
      g.questEvent({ type: 'talk', npc: 'eli', choice });
      if (choice === 'bandage') { life.known[this.current.site.id] = 'helped'; g.worldPoints.removeNpc('eli'); this.close(); g.save(); return; }
      result = { ok: true, message: 'Take this letter to Clara. Please.' };
    } else if (id === 'amos:parcel') { resultIsSpeech = true; g.questEvent({ type: 'talk', npc: 'amos' }); result = { ok: true, message: 'Tell Nora thanks.' }; }
    else if (id === 'sell-medicine') result = sellMedicine(life, defs);
    else if (id.startsWith('drink:') && BARKEEPS.has(npc)) {
      const what = id.slice(6), price = ITEMS[what].price;
      if (life.bounty < price) result = { ok: false, message: `You need $${price}.` };
      else { life.bounty -= price; life.items[what] = (life.items[what] ?? 0) + 1; result = drink(g, what); resultIsSpeech = false; }
    } else if (id === 'sell-pelts' && PELT_BUYERS.has(npc)) {
      let paid = 0;
      for (const [pid, p] of Object.entries(PELTS)) { paid += (life.items[pid] ?? 0) * p.price; life.items[pid] = 0; }
      life.bounty += paid;
      result = { ok: paid > 0, message: paid ? `Paid $${paid} for your skins.` : 'You have nothing to sell.' };
      if (paid) g.audio.play('coin', { bus: 'ui', vol: 0.7 });
    } else if (id.startsWith('bring:')) { resultIsSpeech = true; result = bringStep(life, defs, id.slice(6)); }
    else if (id.startsWith('blackjack:') && this.current.kind === 'blackjack') {
      const [, move, bet] = id.split(':');
      const moves = { hit: hitBlackjack, stand: standBlackjack, double: doubleBlackjack, split: splitBlackjack };
      result = move === 'deal' ? startBlackjack(life, Number(bet)) : moves[move]?.(life);
    }
    if (!result) return;
    if (!result.ok) g.audio.play('uiClick', { bus: 'ui', vol: 0.5, pitch: 0.7 });
    if (result.ok) {
      g.player.refreshInventory(life);
      g.save();
      if (id.startsWith('buy:')) g.audio.play('register', { bus: 'ui', vol: 0.6 });
      if (id.startsWith('turnin:')) { g.audio.play('coin', { bus: 'ui', vol: 0.7 }); g.audio.cue('reward'); }
      if (id.startsWith('blackjack:')) this.blackjackSound(id.split(':')[1], life.blackjack);
      if (id.startsWith('turnin:')) g.ui.questNote(result.message);
    }
    const alreadyShown = result.ok && (id.startsWith('accept:') || id.startsWith('turnin:'));
    this.draw(alreadyShown ? null : { text: result.message, spoken: resultIsSpeech });
  }

  /** Cards on the felt, then chips or a groan when the hand settles. */
  blackjackSound(move, state) {
    const a = this.game.audio;
    if (move === 'deal') { for (let i = 0; i < 4; i++) a.play('card', { bus: 'ui', vol: 0.6, delay: i * 0.12 }); a.play('chips', { bus: 'ui', vol: 0.5 }); }
    else a.play('card', { bus: 'ui', vol: 0.6 });
    if (state.phase !== 'done') return;
    if (state.outcome === 'win' || state.outcome === 'blackjack') { a.play('chips', { bus: 'ui', vol: 0.7, delay: 0.35 }); a.play('coin', { bus: 'ui', vol: 0.6, delay: 0.45 }); }
    else if (state.outcome === 'lose') a.play('lose', { bus: 'ui', vol: 0.6, delay: 0.3 });
  }
}

function statusWord(status) {
  return { offered: 'open', active: 'you are on it', complete: 'ready to collect', turnedIn: 'paid', failed: 'closed' }[status];
}

