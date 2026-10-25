// The journal (J): jobs with their current step, and carried supplies with
// a Use button. Plain DOM inside the shared panel style.
import { NPCS, objective, direction } from './quests.js';
import { AMMO, CATALOGUE, EFFECTS, ammoMax, effectActive, useItem } from './items.js';

const ORDER = { complete: 0, active: 1, failed: 2, turnedIn: 3 };
const USABLE = ['meal', 'coffee', 'beer', 'whiskey', 'cigarette', 'cigar', 'oil', 'feed'];

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function jobCard(life, def) {
  const s = life.quests[def.id], card = el('article', `job job-${s.status}`);
  card.append(el('h3', '', def.title));
  card.append(el('p', 'job-step', objective(life, def)));
  const pay = def.type === 'bounty' && def.want === 'either' ? `$${def.reward.money} dead · $${def.aliveReward} alive` : `$${s.paid ?? def.reward.money}`;
  const facts = [['Pay', pay], ['Area', `${direction(def.area.x, def.area.z)} of town${s.lead ? ' (lead bought)' : ''}`], ['Turn in', NPCS[def.turnIn]]];
  if (def.fail) facts.push(['Watch for', def.fail]);
  const dl = el('dl', 'job-facts');
  for (const [k, v] of facts) { const row = el('div'); row.append(el('dt', '', k), el('dd', '', v)); dl.append(row); }
  card.append(dl);
  return card;
}

export function renderJournal(ui, game, tab = ui.journalTab ?? 'jobs') {
  ui.journalTab = tab;
  const life = game.run, box = ui.el.journal;
  box.replaceChildren();
  for (const button of ui.el.journalTabs.querySelectorAll('button')) button.classList.toggle('primary', button.dataset.tab === tab);
  if (tab === 'jobs') {
    const jobs = game.questDefs.filter((d) => life.quests[d.id].status !== 'offered')
      .sort((a, b) => ORDER[life.quests[a.id].status] - ORDER[life.quests[b.id].status]);
    if (!jobs.length) box.append(el('p', 'lede', 'No jobs yet.'));
    for (const def of jobs) box.append(jobCard(life, def));
    return;
  }
  const list = el('div', 'supplies');
  const row = (name, value, action) => {
    const r = el('div', 'supply');
    r.append(el('span', 'supply-name', name), el('span', 'supply-value', value));
    if (action) r.append(action);
    list.append(r);
  };
  row('Money', `$${life.bounty}`);
  for (const [type, info] of Object.entries(AMMO)) if (life.ammo[type] || life.unlocked.some((k) => game.player.guns.find((g) => g.def.key === k)?.def.ammoType === type)) row(info.name, `${life.ammo[type]} / ${ammoMax(life, type)}`);
  row('Bandages', `${life.items.bandage} · press H`);
  for (const id of USABLE) {
    const count = life.items[id] ?? 0;
    if (!count) continue;
    const use = el('button', 'btn', 'Use');
    use.type = 'button';
    use.addEventListener('click', (event) => {
      event.stopPropagation();
      const fight = game.player.sinceHit < 5 || game.enemies.some((e) => e.alive && e.knows && Math.hypot(e.x - game.player.x, e.z - game.player.z) < 30);
      const res = useItem(life, id, { inFight: fight });
      if (res.ok) {
        if (['whiskey', 'beer', 'cigarette', 'cigar'].includes(id)) game.deadEye.meter = life.deadEye;
        if (id === 'oil') game.player.refreshInventory(life);
        if (id === 'feed' && game.horse) game.horse.data.stamina = game.horse.breed.stamina;
        game.save();
      }
      ui.questNote(res.message);
      renderJournal(ui, game, 'supplies');
    });
    row(`${CATALOGUE[id].name} ×${count}`, CATALOGUE[id].text, use);
  }
  for (const [id, info] of Object.entries(EFFECTS)) if (effectActive(life, id)) row(info.name, `${Math.ceil((life.effects[id] - life.time) / 60)} min left`);
  const gear = Object.entries(life.gear).filter(([, has]) => has).map(([k]) => CATALOGUE[k].name);
  row('Gear', gear.length ? gear.join(', ') : 'None');
  if (game.horse) row('Horse', `${game.horse.name} · stamina ${Math.round(game.horse.data.stamina * 100)}%`);
  for (const gun of game.player.guns) row(gun.def.name, `${Math.round(gun.condition * 100)}% clean`);
  box.append(list);
}
