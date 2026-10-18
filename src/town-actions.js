// Town menus use the same saved life as combat. Each purchase is saved at once.
import { CATALOGUE, purchase, acceptContract, claimContracts, work } from './life.js';

const stock = {
  guns: ['ammo', 'shotgun', 'rifle'], doctor: ['heal', 'bandage'], maps: ['map'], clothes: ['coat'],
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
    for (const point of [...g.frontier.sites, ...g.frontier.npcs]) {
      const d = Math.hypot(point.x - g.player.x, point.z - g.player.z);
      if (d < distance) { best = point; distance = d; }
    }
    return best;
  }

  hint() {
    const point = this.nearest();
    return point ? `E · ${point.name ? 'Talk to ' + point.name : point.label}` : '';
  }

  open() {
    const point = this.nearest();
    if (!point) return;
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
    if (stock[point.kind]) {
      text = point.kind === 'guns' ? `You have $${life.bounty}. Ammo is for your selected ${g.player.gun.def.name.toLowerCase()}. Use 1–3 or Q before you enter to select a gun.`
        : point.kind === 'clothes' ? `The trail coat changes your clothes. It gives no extra armor. You have $${life.bounty}.`
          : `You have $${life.bounty}.`;
      actions = stock[point.kind].map((id) => {
        const item = CATALOGUE[id];
        const owned = life.unlocked.includes(id) || (id === 'coat' && life.coat) || (id === 'map' && life.hasMap);
        return { id: `buy:${id}`, label: `${item.name} · $${item.price}${owned ? ' · Owned' : ''}`,
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
    } else if (point.kind === 'saloon') {
      text = 'The Last Drop is the town meeting place. Drinks and blackjack will open in a later build. Talk to Silas near the south end of the street for a bounty.';
    } else if (point.kind === 'stable') {
      text = 'The stable is here for the next part of the frontier. Horses are not for sale in this build. Travel on foot for now.';
    } else text = sayings[point.id] ?? 'Stay safe out there. Return to town for supplies.';
    g.ui.showInteraction({ title: point.label ?? point.name, text: message ? `${message}\n\n${text}` : text, actions }, (id) => this.act(id));
  }

  act(id) {
    if (id === 'close') { this.close(); return; }
    const g = this.game;
    if (!this.current || g.state !== 'interaction') return;
    g.capturePlayer();
    let result;
    if (id.startsWith('buy:') && stock[this.current.kind]?.includes(id.slice(4))) result = purchase(g.run, id.slice(4));
    else if (id.startsWith('accept:') && this.current.kind === 'bounty') result = acceptContract(g.run, id.slice(7));
    else if (id === 'claim' && this.current.kind === 'sheriff') result = claimContracts(g.run);
    else if (id === 'work' && this.current.kind === 'sheriff') result = work(g.run);
    if (!result) return;
    if (result.ok) {
      g.player.refreshInventory(g.run);
      g.save();
      g.audio.play('coin', { bus: 'ui', vol: 0.6 });
    }
    this.draw(result.message);
  }
}
