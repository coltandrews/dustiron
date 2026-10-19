// Town menus use the same saved life as combat. Each purchase is saved at once.
import { CATALOGUE, purchase, acceptContract, claimContracts, work } from './life.js';
import { blackjackText, hitBlackjack, standBlackjack, startBlackjack } from './blackjack.js';

const stock = {
  guns: ['ammo', 'shotgun', 'rifle'], doctor: ['heal', 'bandage'], maps: ['map'], clothes: ['coat'], saloon: ['drink'],
};
const sayings = {
  clara: 'Doctor Finch keeps bandages ready for the trail. Press H when you need one. You have one life, so come back before it is too late.',
  elias: 'Travel fills in your map. The map seller can mark roads and camp landmarks. Press M to see your map.',
  nora: 'Martha and Silas hear every bad name that comes through town. Ask them about work. Look for a red hat at the camps, then take the proof to Sheriff Boone.',
};

export class TownActions {
  constructor(game) { this.game = game; this.current = null; }

  nearest() {
    const g = this.game;
    if (!g.player?.alive || !g.inTown() || !g.frontier) return null;
    let best = null, distance = 3;
    for (const point of g.frontier.interactions()) {
      const d = Math.hypot(point.x - g.player.x, point.z - g.player.z);
      const range = point.kind === 'seat' ? 1.15 : point.kind === 'door' ? 2.2 : 3;
      if (d < range && d < distance) { best = point; distance = d; }
    }
    return best;
  }

  hint() {
    const point = this.nearest();
    if (!point) return '';
    if (point.kind === 'door') return 'Press [E] to Enter';
    return `E · ${point.kind === 'seat' ? 'Sit down' : point.kind === 'blackjack' ? 'Play blackjack' : point.name ? 'Talk to ' + point.name : point.label}`;
  }

  open() {
    const point = this.nearest();
    if (!point) return;
    if (point.kind === 'door') {
      if (this.game.frontier.enter(point.siteId)) {
        this.game.input.clear();
        this.game.save();
      }
      return;
    }
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
      text = point.kind === 'guns' ? `Heading out again? I can load your ${g.player.gun.def.name.toLowerCase()} or sell you a better gun. Choose your weapon with 1–3 or Q before you come to my counter. You have $${life.bounty}.`
        : point.kind === 'doctor' ? `Let me have a look at you. I can treat your wounds or sell you a clean bandage for the trail. You have $${life.bounty}.`
          : point.kind === 'maps' ? `The open land is easy to get lost in. This map shows the roads and the places that matter. You have $${life.bounty}.`
            : point.kind === 'clothes' ? `That dust will ruin a good shirt. This trail coat will change your clothes, but it will not stop a bullet. You have $${life.bounty}.`
              : point.kind === 'saloon' ? `You look like the trail took something out of you. A whiskey will steady your focus. You have $${life.bounty}.`
                : `What can I get for you? You have $${life.bounty}.`;
      actions = stock[point.kind].map((id) => {
        const item = CATALOGUE[id];
        const owned = life.unlocked.includes(id) || (id === 'coat' && life.coat) || (id === 'map' && life.hasMap);
        return { id: `buy:${id}`, itemId: id, label: `${item.name} · $${item.price}${owned ? ' · Owned' : ''}`,
          disabled: owned || life.bounty < item.price || (id === 'heal' && life.hp >= 100) };
      });
    } else if (point.kind === 'bounty') {
      const camps = point.id === 'martha' ? life.world.camps.slice(0, 2) : life.world.camps.slice(2);
      text = point.id === 'martha'
        ? 'Keep your voice down. I know two men who are wanted. They wear red hats with a gold band. Search the marked areas, then take proof to Sheriff Boone.'
        : 'I heard about an outlaw camp beyond town. The wanted man wears a red hat with a gold band. Bring proof to Sheriff Boone if you finish the job.';
      for (const camp of camps) {
        const status = life.contracts[camp.id].status;
        const direction = `${camp.z < 0 ? 'north' : 'south'}${camp.x < 0 ? 'west' : 'east'}`;
        text += `\n${camp.targetName} — ${camp.name}, ${direction} of town. Wanted for wagon robbery. Reward: $${camp.reward}.`;
        actions.push({ id: `accept:${camp.id}`, label: status === 'offered' ? `Accept: ${camp.targetName} · $${camp.reward}`
          : `${camp.targetName} · ${status === 'active' ? 'In progress' : status === 'proof' ? 'Ready for payment' : 'Paid'}`, disabled: status !== 'offered' });
      }
    } else if (point.kind === 'sheriff') {
      text = `If you have proof, set it on my desk. I pay for finished work, not stories.\n\n${life.world.camps.map((camp) => {
        const status = life.contracts[camp.id].status;
        return `${camp.targetName}: ${status === 'offered' ? 'Ask the townspeople' : status === 'active' ? 'Find the target' : status === 'proof' ? 'Proof ready' : 'Paid'}`;
      }).join('\n')}`;
      const ready = Object.values(life.contracts).some((c) => c.status === 'proof');
      actions = [{ id: 'claim', label: 'Claim bounty payments', disabled: !ready }, { id: 'work', label: 'Town work for emergency ammo' }];
      if (Object.values(life.contracts).every((c) => c.status === 'paid')) text += '\nAll three bounties are paid. This region is clear. You can keep this life and explore.';
    } else if (point.kind === 'stable') {
      text = 'These horses are not ready for the open range yet. Come back when I have one that will carry you through gunfire.';
    } else text = sayings[point.id] ?? 'The road gets quiet after sundown. Keep your gun clean and come back in one piece.';
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
