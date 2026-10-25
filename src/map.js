// The life map shows travelled land. Major waterways stay visible as reference.
import { MAP_CELL, isDiscovered } from './life.js';
import { BRIDGES, RIVER_MAX_X, RIVER_MIN_X, forestAt, pineRoadPoints, riverCenter, riverTangent } from './terrain.js';
import { townsOf } from './towns.js';

const C = {
  paper: '#efdcbb', land: '#e8d0a8', unknown: '#bca17b', ink: '#1c130f', soft: '#725437',
  grid: 'rgba(28,19,15,0.08)', river: '#587784', riverBank: '#99734d',
  bounty: '#b4532e', cleared: '#5f713e', you: '#2f5d8a',
};
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
      const green = forestAt(-H + (cx + 0.5) * MAP_CELL, -H + (cz + 0.5) * MAP_CELL);
      ctx.fillStyle = green > 0.5 ? '#a9b47e' : green > 0.2 ? '#cfc794' : C.land;
      ctx.fillRect(X(-H + cx * MAP_CELL), Y(-H + cz * MAP_CELL), MAP_CELL * k + 0.5, MAP_CELL * k + 0.5);
    }
    // The stage road to Pine Hollow.
    ctx.strokeStyle = 'rgba(114,84,55,0.75)'; ctx.lineWidth = 2; ctx.setLineDash([5, 3]); ctx.beginPath();
    pineRoadPoints().forEach((pt, i) => (i ? ctx.lineTo(X(pt.x), Y(pt.z)) : ctx.moveTo(X(pt.x), Y(pt.z))));
    ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath();
    for (let v = -H; v <= H; v += 30) {
      ctx.moveTo(X(v), Y(-H)); ctx.lineTo(X(v), Y(H));
      ctx.moveTo(X(-H), Y(v)); ctx.lineTo(X(H), Y(v));
    }
    ctx.stroke();

    // The river uses the same curve as the world and continues beyond both map edges.
    const drawRiver = (color, width) => {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
      for (let x = RIVER_MIN_X; x <= RIVER_MAX_X; x += 3) {
        const z = riverCenter(x);
        if (x === RIVER_MIN_X) ctx.moveTo(X(x), Y(z)); else ctx.lineTo(X(x), Y(z));
      }
      ctx.stroke();
    };
    drawRiver(C.riverBank, 5);
    drawRiver(C.river, 3);
    // Short crossbars mark the three bridge crossings.
    ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath();
    for (const bridge of BRIDGES) {
      const angle = riverTangent(bridge.x), nx = -Math.sin(angle), nz = Math.cos(angle), reach = 7;
      ctx.moveTo(X(bridge.x - nx * reach), Y(riverCenter(bridge.x) - nz * reach));
      ctx.lineTo(X(bridge.x + nx * reach), Y(riverCenter(bridge.x) + nz * reach));
    }
    ctx.stroke();
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';

    // Active jobs show a broad search area, never the exact place. A bought lead narrows it.
    let active = 0, proof = 0;
    for (const def of game.questDefs) {
      const st = life.quests[def.id];
      if (st.status === 'complete') proof++;
      if (st.status !== 'active') continue;
      active++;
      const area = st.lead && def.leadArea ? def.leadArea : def.area;
      ctx.beginPath(); ctx.arc(X(area.x), Y(area.z), area.r * k, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(180,83,46,0.10)'; ctx.fill();
      ctx.strokeStyle = C.bounty; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
      label(def.title.replace('Wanted: ', ''), area.x, area.z, C.bounty, -area.r * k - 8);
    }

    // Known places: found by travel, bought maps (landmarks only) or heard as rumors.
    for (const site of world.sites ?? []) {
      const state = life.known[site.id], landmark = site.kind === 'landmark' || site.kind === 'tree';
      if (!state && !(life.gear.map && landmark)) continue;
      if (state === 'rumor') {
        ctx.beginPath(); ctx.arc(X(site.x), Y(site.z), 22 * k, 0, Math.PI * 2);
        ctx.strokeStyle = C.soft; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
        label(`${site.name}?`, site.x, site.z, C.soft, 0);
        continue;
      }
      ctx.fillStyle = landmark ? C.soft : C.ink;
      ctx.beginPath(); ctx.arc(X(site.x), Y(site.z), landmark ? 4 : 3, 0, Math.PI * 2); ctx.fill();
      label(state === 'looted' ? `${site.name} · empty` : site.name, site.x, site.z, C.soft, 11);
    }
    if (life.marker) {
      const mx = X(life.marker.x), my = Y(life.marker.z);
      ctx.strokeStyle = C.you; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(mx - 6, my - 6); ctx.lineTo(mx + 6, my + 6); ctx.moveTo(mx + 6, my - 6); ctx.lineTo(mx - 6, my + 6); ctx.stroke();
    }

    // Camps appear after the player finds the land around them.
    for (const camp of world.camps) {
      if (!life.gear.map && !isDiscovered(life, camp.x, camp.z)) continue;
      const cleared = life.camps[camp.id]?.cleared;
      ctx.beginPath(); ctx.moveTo(X(camp.x), Y(camp.z) - 7);
      ctx.lineTo(X(camp.x) - 7, Y(camp.z) + 5); ctx.lineTo(X(camp.x) + 7, Y(camp.z) + 5); ctx.closePath();
      ctx.fillStyle = cleared ? C.cleared : C.bounty; ctx.fill();
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.stroke();
      label(`${camp.name}${cleared ? ' · cleared' : ''}`, camp.x, camp.z);
    }
    for (const camp of world.ambushes ?? []) {
      if (!life.camps[camp.id]?.cleared) continue;
      label(`${camp.name} · ambush cleared`, camp.x, camp.z, C.cleared);
    }

    for (const town of townsOf(world)) {
      ctx.fillStyle = 'rgba(239,220,187,0.35)'; ctx.beginPath(); ctx.arc(X(town.x), Y(town.z), town.radius * k, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.ink; ctx.fillRect(X(town.x) - 6, Y(town.z) - 5, 12, 10);
      ctx.beginPath(); ctx.moveTo(X(town.x) - 8, Y(town.z) - 5);
      ctx.lineTo(X(town.x), Y(town.z) - 11); ctx.lineTo(X(town.x) + 8, Y(town.z) - 5); ctx.closePath(); ctx.fill();
      label(town.name ?? 'Town', town.x, town.z);
    }
    // Other riders on a shared server.
    for (const rider of game.netWorld?.remote.riders.values() ?? []) {
      if (!rider.alive || rider.room) continue;
      ctx.fillStyle = '#6a3f8a'; ctx.beginPath(); ctx.arc(X(rider.x), Y(rider.z), 3.5, 0, Math.PI * 2); ctx.fill();
      label(rider.name, rider.x, rider.z, '#6a3f8a', -10);
    }

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

    const cells = Math.ceil(H * 2 / MAP_CELL) ** 2;
    const surveyed = Math.round(Object.keys(life.discovered).length / cells * 100);
    this.title.textContent = 'Frontier map';
    // Clicking the map sets or clears your own marker.
    if (!this.bound) {
      this.bound = true;
      cv.addEventListener('click', (event) => {
        const r = cv.getBoundingClientRect(), g = this.game, l = g?.run;
        if (!l) return;
        const half = l.world.half, sz = r.width, sp = sz - 28, kk = sp / (half * 2);
        const x = (event.clientX - r.left - 14) / kk - half, z = (event.clientY - r.top - 14) / kk - half;
        if (Math.abs(x) > half || Math.abs(z) > half) return;
        l.marker = l.marker && Math.hypot(l.marker.x - x, l.marker.z - z) < 12 ? null : { x: Math.round(x), z: Math.round(z) };
        this.draw(g);
      });
    }
    this.game = game;
    this.sub.textContent = `${surveyed}% explored · ${active} active ${active === 1 ? 'bounty' : 'bounties'}${proof ? ` · ${proof} ready to claim` : ''}`;
    cv.setAttribute('aria-label', `Frontier map. ${surveyed}% explored. ${active} active ${active === 1 ? 'bounty' : 'bounties'}. Blue arrow: your location. Blue line: river. Brown circles: bounty search areas.`);
  }
}
