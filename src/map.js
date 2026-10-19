// The life map shows travelled land. Bought maps add roads; jobs add search areas.
import { MAP_CELL, isDiscovered } from './life.js';
import { RIVER_MAX_X, RIVER_MIN_X, riverCenter } from './terrain.js';

const C = {
  paper: '#efdcbb', land: '#e8d0a8', unknown: '#bca17b', ink: '#1c130f', soft: '#725437',
  grid: 'rgba(28,19,15,0.08)', road: '#8c5a34', river: '#587784', riverBank: '#99734d',
  bounty: '#b4532e', cleared: '#5f713e', you: '#2f5d8a',
};
const TOWN_PLACES = ['Guns & Ammo', 'Doctor Finch', 'Sheriff', 'Maps & Trails', 'Clothier', 'The Last Drop', 'Livery Stable'];

export class MapView {
  constructor() {
    this.canvas = document.getElementById('map-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.title = document.getElementById('map-title');
    this.sub = document.getElementById('map-sub');
  }

  draw(game) {
    const life = game.run, world = life.world;
    if (!world) return;
    const cv = this.canvas, ctx = this.ctx;
    const size = Math.max(220, Math.floor(Math.min(cv.parentElement.clientWidth, innerHeight - 290)));
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cv.style.width = cv.style.height = size + 'px';
    cv.width = cv.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const H = world.half, pad = 14, span = size - pad * 2, k = span / (H * 2);
    const X = (x) => pad + (x + H) * k, Y = (z) => pad + (z + H) * k;
    const font = (weight = 600, px = 11) => `${weight} ${px}px 'Barlow Semi Condensed', 'Arial Narrow', sans-serif`;
    const label = (text, x, z, color = C.ink, offset = 15) => {
      ctx.font = font(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const width = ctx.measureText(text).width;
      const px = Math.max(pad + width / 2 + 2, Math.min(size - pad - width / 2 - 2, X(x)));
      const py = Math.max(pad + 8, Math.min(size - pad - 8, Y(z) + offset));
      ctx.lineWidth = 3; ctx.strokeStyle = C.paper; ctx.strokeText(text, px, py);
      ctx.fillStyle = color; ctx.fillText(text, px, py);
    };

    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = C.unknown; ctx.fillRect(pad, pad, span, span);
    ctx.save();
    ctx.beginPath(); ctx.rect(pad, pad, span, span); ctx.clip();

    // Survey cells are saved with the life, so reloading does not reveal new land.
    ctx.fillStyle = C.land;
    for (const key of Object.keys(life.discovered)) {
      const [cx, cz] = key.split(':').map(Number);
      ctx.fillRect(X(-H + cx * MAP_CELL), Y(-H + cz * MAP_CELL), MAP_CELL * k + 0.5, MAP_CELL * k + 0.5);
    }
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath();
    for (let v = -H; v <= H; v += 30) {
      ctx.moveTo(X(v), Y(-H)); ctx.lineTo(X(v), Y(H));
      ctx.moveTo(X(-H), Y(v)); ctx.lineTo(X(H), Y(v));
    }
    ctx.stroke();

    // The surveyed river uses the same curve as the world.
    const drawRiver = (color, width) => {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
      let drawing = false;
      for (let x = RIVER_MIN_X; x <= RIVER_MAX_X; x += 3) {
        const z = riverCenter(x), visible = life.hasMap || isDiscovered(life, x, z);
        if (!visible) { drawing = false; continue; }
        if (!drawing) { ctx.moveTo(X(x), Y(z)); drawing = true; } else ctx.lineTo(X(x), Y(z));
      }
      ctx.stroke();
    };
    drawRiver(C.riverBank, 5);
    drawRiver(C.river, 3);
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';

    // Roads are drawn only where travelled until the player buys a map.
    ctx.strokeStyle = C.road; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath();
    for (const road of world.roads) {
      const dx = road.to.x - road.from.x, dz = road.to.z - road.from.z;
      const steps = Math.ceil(Math.hypot(dx, dz) / 6);
      for (let i = 0; i < steps; i++) {
        const t = i / steps, next = (i + 1) / steps;
        const x = road.from.x + dx * t, z = road.from.z + dz * t;
        const nx = road.from.x + dx * next, nz = road.from.z + dz * next;
        if (!life.hasMap && (!isDiscovered(life, x, z) || !isDiscovered(life, nx, nz))) continue;
        ctx.moveTo(X(x), Y(z)); ctx.lineTo(X(nx), Y(nz));
      }
    }
    ctx.stroke(); ctx.setLineDash([]);

    let active = 0, proof = 0;
    for (const camp of world.camps) {
      const status = life.contracts[camp.id].status;
      if (status === 'proof') proof++;
      if (status !== 'active') continue;
      active++;
      // A lead gives a broad area, not the target's exact location.
      const x = Math.round(camp.x / 50) * 50, z = Math.round(camp.z / 50) * 50;
      ctx.beginPath(); ctx.arc(X(x), Y(z), 60 * k, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(180,83,46,0.10)'; ctx.fill();
      ctx.strokeStyle = C.bounty; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
      label(camp.targetName, x, z, C.bounty, -60 * k - 8);
    }

    // Camps appear after the player finds the land around them.
    for (const camp of world.camps) {
      if (!life.hasMap && !isDiscovered(life, camp.x, camp.z)) continue;
      const cleared = life.camps[camp.id]?.cleared;
      ctx.beginPath(); ctx.moveTo(X(camp.x), Y(camp.z) - 7);
      ctx.lineTo(X(camp.x) - 7, Y(camp.z) + 5); ctx.lineTo(X(camp.x) + 7, Y(camp.z) + 5); ctx.closePath();
      ctx.fillStyle = cleared ? C.cleared : C.bounty; ctx.fill();
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.stroke();
      label(`${camp.name}${cleared ? ' · cleared' : ''}`, camp.x, camp.z);
    }

    const town = world.town;
    ctx.fillStyle = 'rgba(239,220,187,0.35)'; ctx.beginPath();
    ctx.arc(X(town.x), Y(town.z), town.radius * k, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.ink; ctx.fillRect(X(town.x) - 6, Y(town.z) - 5, 12, 10);
    ctx.beginPath(); ctx.moveTo(X(town.x) - 8, Y(town.z) - 5);
    ctx.lineTo(X(town.x), Y(town.z) - 11); ctx.lineTo(X(town.x) + 8, Y(town.z) - 5); ctx.closePath(); ctx.fill();
    label('Town', town.x, town.z);

    const p = game.player;
    if (p?.alive) {
      const shown = life.interior?.outside ?? p;
      const px = X(shown.x), py = Y(shown.z), dx = Math.sin(p.yaw), dz = Math.cos(p.yaw), r = 7;
      ctx.beginPath(); ctx.moveTo(px + dx * r * 1.4, py + dz * r * 1.4);
      ctx.lineTo(px - dz * r * 0.8 - dx * r * 0.7, py + dx * r * 0.8 - dz * r * 0.7);
      ctx.lineTo(px + dz * r * 0.8 - dx * r * 0.7, py - dx * r * 0.8 - dz * r * 0.7); ctx.closePath();
      ctx.fillStyle = C.you; ctx.fill(); ctx.strokeStyle = C.paper; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(pad, pad, span, span);

    ctx.textAlign = 'center'; ctx.fillStyle = C.ink; ctx.font = `16px 'Rye', Georgia, serif`;
    ctx.fillText('N', size - pad - 16, pad + 25);
    ctx.beginPath(); ctx.moveTo(size - pad - 16, pad + 5);
    ctx.lineTo(size - pad - 20, pad + 11); ctx.lineTo(size - pad - 12, pad + 11); ctx.closePath(); ctx.fill();
    ctx.fillRect(pad + 10, size - pad - 15, 50 * k, 3);
    ctx.font = font(); ctx.textAlign = 'left'; ctx.fillText('50 m', pad + 16 + 50 * k, size - pad - 12);

    // Store names live on the map, so the buildings do not need large signs.
    const keyW = Math.min(210, span * 0.48), keyH = 106, keyX = pad + 8, keyY = pad + 8;
    ctx.fillStyle = 'rgba(239,220,187,0.94)'; ctx.fillRect(keyX, keyY, keyW, keyH);
    ctx.strokeStyle = C.soft; ctx.lineWidth = 1; ctx.strokeRect(keyX, keyY, keyW, keyH);
    ctx.fillStyle = C.ink; ctx.font = font(700, 12); ctx.textAlign = 'left'; ctx.fillText('MERCY CROSSING', keyX + 8, keyY + 16);
    ctx.font = font(600, 10);
    TOWN_PLACES.forEach((name, index) => {
      const column = index > 3 ? 1 : 0, row = column ? index - 4 : index;
      ctx.fillText(name, keyX + 8 + column * keyW * 0.52, keyY + 34 + row * 17);
    });

    const cells = Math.ceil(H * 2 / MAP_CELL) ** 2;
    const surveyed = Math.round(Object.keys(life.discovered).length / cells * 100);
    this.title.textContent = 'Frontier map';
    this.sub.textContent = `${surveyed}% explored · ${active} active ${active === 1 ? 'bounty' : 'bounties'}${proof ? ` · ${proof} ready to claim` : ''}`;
    cv.setAttribute('aria-label', `Frontier map. ${surveyed}% explored. ${active} active ${active === 1 ? 'bounty' : 'bounties'}. Blue arrow: your location. Blue line: river. Brown circles: bounty search areas.`);
  }
}
