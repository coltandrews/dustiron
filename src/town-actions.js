// Town menus use the same saved life as combat. Each purchase is saved at once.
import { CATALOGUE, purchase, acceptContract, claimContracts, work } from './life.js';
import { blackjackText, hitBlackjack, standBlackjack, startBlackjack } from './blackjack.js';

const stock = {
  guns: ['ammo', 'shotgun', 'rifle'], doctor: ['heal', 'bandage'], maps: ['map'], clothes: ['coat'], saloon: ['drink'],
};
const sayings = {
  clara: 'The doctor sells bandages. Press H to use one on the trail. You have one life, so come back before it is too late.',
  elias: 'Travel fills in your map. The map seller can mark roads and camp landmarks. Press M to see your map.',
  nora: 'Martha and Silas know who is wanted. Look for the red hat at a camp. Take the proof to the sheriff for payment.',
};

export class TownActions {
  constructor(game) { this.game = game; this.current = null; }

  nearest() {
    const g = this.game;
    if (!g.player?.alive || !g.inTown() || !g.frontier) return null;
    let best = null, distance = 3;
    for (const point of g.frontier.interactions()) {
      const d = Math.hypot(point.x - g.player.x, point.z - g.player.z);
      const range = point.kind === 'seat' ? 1.15 : 3;
      if (d < range && d < distance) { best = point; distance = d; }
    }
    return best;
  }

  hint() {
    const point = this.nearest();
    return point ? `E · ${point.kind === 'seat' ? 'Sit down' : point.kind === 'blackjack' ? 'Play blackjack' : point.name ? 'Talk to ' + point.name : point.label}` : '';
  }

  open() {
    const point = this.nearest();
    if (!point) return;
    if (point.kind === 'seat') {
      if (this.game.frontier.sit(point)) this.game.ui.toast('Press a movement key to stand.');
      return;
    }
    this.current = point;
    const g = this.game;
    g.state = 'interaction';
    g.setDeadEye(false);
    g.input.clear();
    g.intent.fireHeld = g.intent.firePressed = false;
    g.save();
    this.draw();
  }

  close() {
    this.current = null;
    this.game.state = 'playing';
    this.game.input.clear();
    this.game.ui.show(null);
  }

  draw(message = '') {
    const g = this.game, life = g.run, point = this.current;
    let text = '', actions = [];
    if (point.kind === 'blackjack') {
      text = blackjackText(life);
      if (message && !text.includes(message)) text = `${message}\n${text}`;
      actions = life.blackjack.phase === 'playing'
        ? [{ id: 'blackjack:hit', label: 'Hit' }, { id: 'blackjack:stand', label: 'Stand' }]
        : [{ id: 'blackjack:deal', label: 'Deal a hand · $5', disabled: life.bounty < 5 }];
    } else if (stock[point.kind]) {
      text = point.kind === 'guns' ? `You have $${life.bounty}. Ammo is for your selected ${g.player.gun.def.name.toLowerCase()}. Use 1–3 or Q before you enter to select a gun.`
        : point.kind === 'clothes' ? `The trail coat changes your clothes. It gives no extra armor. You have $${life.bounty}.`
          : point.kind === 'saloon' ? `A whiskey restores some Dead Eye focus. You have $${life.bounty}.`
          : `You have $${life.bounty}.`;
      actions = stock[point.kind].map((id) => {
        const item = CATALOGUE[id];
        const owned = life.unlocked.includes(id) || (id === 'coat' && life.coat) || (id === 'map' && life.hasMap);
        return { id: `buy:${id}`, itemId: id, label: `${item.name} · $${item.price}${owned ? ' · Owned' : ''}`,
          disabled: owned || life.bounty < item.price || (id === 'heal' && life.hp >= 100) };
      });
    } else if (point.kind === 'bounty') {
      const camps = point.id === 'martha' ? life.world.camps.slice(0, 2) : life.world.camps.slice(2);
      text = 'These outlaws wear red hats with a gold band. Search the marked areas on your map. Kill the target, then take the proof to the sheriff.';
      for (const camp of camps) {
        const status = life.contracts[camp.id].status;
        const direction = `${camp.z < 0 ? 'north' : 'south'}${camp.x < 0 ? 'west' : 'east'}`;
        text += `\n${camp.targetName} — ${camp.name}, ${direction} of town. Wanted for wagon robbery. Reward: $${camp.reward}.`;
        actions.push({ id: `accept:${camp.id}`, label: status === 'offered' ? `Accept: ${camp.targetName} · $${camp.reward}`
          : `${camp.targetName} · ${status === 'active' ? 'In progress' : status === 'proof' ? 'Ready for payment' : 'Paid'}`, disabled: status !== 'offered' });
      }
    } else if (point.kind === 'sheriff') {
      text = life.world.camps.map((camp) => {
        const status = life.contracts[camp.id].status;
        return `${camp.targetName}: ${status === 'offered' ? 'Ask the townspeople' : status === 'active' ? 'Find the target' : status === 'proof' ? 'Proof ready' : 'Paid'}`;
      }).join('\n');
      const ready = Object.values(life.contracts).some((c) => c.status === 'proof');
      actions = [{ id: 'claim', label: 'Claim bounty payments', disabled: !ready }, { id: 'work', label: 'Town work for emergency ammo' }];
      if (Object.values(life.contracts).every((c) => c.status === 'paid')) text += '\nAll three bounties are paid. This region is clear. You can keep this life and explore.';
    } else if (point.kind === 'stable') {
      text = 'The stable hand keeps trail horses and tack here. The horses are still being trained for the open range.';
    } else text = sayings[point.id] ?? 'Stay safe out there. Return to town for supplies.';
    g.ui.showInteraction({
      title: point.label ?? point.name,
      text: point.kind === 'blackjack' || !message ? text : `${message}\n\n${text}`,
      actions,
      mode: point.kind,
    }, (id) => this.act(id));
  }

  act(id) {
    if (id === 'close') { this.close(); return; }
    const g = this.game;
    if (!this.current || g.state !== 'interaction') return;
    g.capturePlayer();
    const beforeBounty = g.run.bounty;
    let result;
    if (id.startsWith('buy:') && stock[this.current.kind]?.includes(id.slice(4))) result = purchase(g.run, id.slice(4));
    else if (id === 'blackjack:deal' && this.current.kind === 'blackjack') result = startBlackjack(g.run);
    else if (id === 'blackjack:hit' && this.current.kind === 'blackjack') result = hitBlackjack(g.run);
    else if (id === 'blackjack:stand' && this.current.kind === 'blackjack') result = standBlackjack(g.run);
    else if (id.startsWith('accept:') && this.current.kind === 'bounty') result = acceptContract(g.run, id.slice(7));
    else if (id === 'claim' && this.current.kind === 'sheriff') result = claimContracts(g.run);
    else if (id === 'work' && this.current.kind === 'sheriff') result = work(g.run);
    if (!result) return;
    if (result.ok) {
      if (id === 'buy:drink') g.deadEye.meter = g.run.deadEye;
      g.player.refreshInventory(g.run);
      g.save();
      if (!id.startsWith('blackjack:') || g.run.bounty > beforeBounty) g.audio.play('coin', { bus: 'ui', vol: 0.6 });
    }
    this.draw(result.message);
  }
}
