// Survey map of the current camp, drawn on a 2D canvas. M opens it and
// pauses the fight. Outlaws only appear once you've had eyes on them.

const C = {
  paper: '#efdcbb', wash: '#e8d0a8', ink: '#1c130f', inkSoft: '#5b4434', grid: 'rgba(28,19,15,0.09)',
  cover: '#d9bf92', wood: '#8c5a34', rust: '#b4532e', blood: '#b3291f', green: '#5f7d3d',
  rock: '#b98563', fire: '#f2a23c', ember: '#e8762e', you: '#2f5d8a',
};

const SEEN_NOW = 0.6;      // seconds: counts as "in sight"
const SEEN_MEMORY = 25;    // seconds: last-known marker fades out after this

export class MapView {
  constructor() {
    this.canvas = document.getElementById('map-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.title = document.getElementById('map-title');
    this.sub = document.getElementById('map-sub');
  }

  draw(game) {
    const cv = this.canvas, ctx = this.ctx;
    const wrap = cv.parentElement;
    const size = Math.max(220, Math.floor(Math.min(wrap.clientWidth, innerHeight - 270)));
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cv.style.width = cv.style.height = size + 'px';
    cv.width = cv.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const H = game.arenaHalf;
    const pad = 16;
    const k = (size - pad * 2) / (H * 2);
    const X = (x) => pad + (x + H) * k;
    const Y = (z) => pad + (z + H) * k;

    // Ground, grid, border.
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = C.wash;
    ctx.fillRect(X(-H), Y(-H), H * 2 * k, H * 2 * k);
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let v = -H + 4; v < H; v += 4) {
      ctx.moveTo(X(v), Y(-H)); ctx.lineTo(X(v), Y(H));
      ctx.moveTo(X(-H), Y(v)); ctx.lineTo(X(H), Y(v));
    }
    ctx.stroke();

    // Cliff hachures on the north, west and east edges.
    ctx.strokeStyle = C.inkSoft;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const tick = 7;
    for (let v = -H; v <= H; v += 1.2) {
      ctx.moveTo(X(v), Y(-H)); ctx.lineTo(X(v), Y(-H) - tick);
      ctx.moveTo(X(-H), Y(v)); ctx.lineTo(X(-H) - tick, Y(v));
      ctx.moveTo(X(H), Y(v)); ctx.lineTo(X(H) + tick, Y(v));
    }
    ctx.stroke();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(X(-H), Y(-H), H * 2 * k, H * 2 * k);

    // Props.
    const rect = (x, z, hx, hz, ry, fill, stroke = C.ink, lw = 1.2) => {
      ctx.save();
      ctx.translate(X(x), Y(z));
      ctx.rotate(-ry);
      ctx.fillStyle = fill;
      ctx.fillRect(-hx * k, -hz * k, hx * 2 * k, hz * 2 * k);
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.strokeRect(-hx * k, -hz * k, hx * 2 * k, hz * 2 * k); }
      ctx.restore();
    };
    const circle = (x, z, r, fill, stroke = C.ink, lw = 1.2) => {
      ctx.beginPath();
      ctx.arc(X(x), Y(z), Math.max(1.5, r * k), 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
    };

    for (const p of game.props) {
      if (!p.alive) continue;
      const x = p.x, z = p.z;
      switch (p.kind) {
        case 'crate': rect(x, z, 0.55, 0.55, p.yaw(), C.cover); break;
        case 'barrel': circle(x, z, 0.42, C.wood); break;
        case 'tnt': {
          // Starburst so explosives never read as an outlaw marker.
          const r0 = Math.max(4, 0.75 * k), r1 = r0 * 0.5;
          ctx.beginPath();
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2, r = i % 2 ? r1 : r0;
            ctx[i ? 'lineTo' : 'moveTo'](X(x) + Math.cos(a) * r, Y(z) + Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fillStyle = C.fire; ctx.fill();
          ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.stroke();
          break;
        }
        case 'fence': rect(x, z, 1.1, 0.07, p.ry, C.ink, null); break;
        case 'wagon': rect(x, z, 1.05, 1.6, p.ry, C.cover, C.ink, 1.6); break;
        case 'tent': {
          rect(x, z, 1.25, 1.25, p.ry, '#f1e2c4', C.ink, 1.4);
          ctx.save();
          ctx.translate(X(x), Y(z)); ctx.rotate(-p.ry);
          ctx.strokeStyle = C.inkSoft; ctx.lineWidth = 1;
          const s = 1.25 * k;
          ctx.beginPath(); ctx.moveTo(-s, -s); ctx.lineTo(s, s); ctx.moveTo(s, -s); ctx.lineTo(-s, s); ctx.stroke();
          ctx.restore();
          break;
        }
        case 'rock': circle(x, z, p.radius, C.rock, C.inkSoft, 1); break;
        case 'cactus': circle(x, z, 0.32, C.green, null); break;
        case 'campfire':
          circle(x, z, 1.6, 'rgba(240,138,58,0.16)', null);
          circle(x, z, 0.7, C.ember, C.ink, 1.2);
          break;
      }
    }

    // Fallen outlaws.
    ctx.strokeStyle = C.inkSoft;
    ctx.lineWidth = 1.6;
    for (const e of game.enemies) {
      if (e.alive || !e.corpse) continue;
      const m = e.corpse.mesh.position, s = 4;
      ctx.beginPath();
      ctx.moveTo(X(m.x) - s, Y(m.z) - s); ctx.lineTo(X(m.x) + s, Y(m.z) + s);
      ctx.moveTo(X(m.x) + s, Y(m.z) - s); ctx.lineTo(X(m.x) - s, Y(m.z) + s);
      ctx.stroke();
    }

    // Outlaws you have spotted.
    let inSight = 0, remembered = 0;
    ctx.font = `700 ${Math.max(9, Math.round(k * 0.9))}px 'Barlow Semi Condensed', 'Arial Narrow', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const e of game.enemies) {
      if (!e.alive) continue;
      const age = game.time - e.spottedT;
      if (age < SEEN_NOW) {
        inSight++;
        circle(e.x, e.z, 0.95, null, C.paper, 3);
        circle(e.x, e.z, 0.7, C.blood, C.ink, 1.4);
        ctx.strokeStyle = C.blood; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(X(e.x), Y(e.z));
        ctx.lineTo(X(e.x + Math.sin(e.yaw) * 1.3), Y(e.z + Math.cos(e.yaw) * 1.3));
        ctx.stroke();
      } else if (age < SEEN_MEMORY) {
        remembered++;
        ctx.globalAlpha = Math.max(0.35, 1 - age / SEEN_MEMORY);
        ctx.setLineDash([3, 3]);
        circle(e.spottedX, e.spottedZ, 0.6, 'rgba(179,41,31,0.12)', C.blood, 1.4);
        ctx.setLineDash([]);
        ctx.fillStyle = C.blood;
        ctx.fillText('?', X(e.spottedX), Y(e.spottedZ) + 0.5);
        ctx.globalAlpha = 1;
      }
    }

    // You.
    const P = game.player;
    if (P && P.alive) {
      const px = X(P.x), pz = Y(P.z), r = Math.max(7, k * 0.75);
      const dx = Math.sin(P.yaw), dz = Math.cos(P.yaw);
      ctx.beginPath();
      ctx.moveTo(px + dx * r * 1.4, pz + dz * r * 1.4);
      ctx.lineTo(px - dz * r * 0.8 - dx * r * 0.7, pz + dx * r * 0.8 - dz * r * 0.7);
      ctx.lineTo(px + dz * r * 0.8 - dx * r * 0.7, pz - dx * r * 0.8 - dz * r * 0.7);
      ctx.closePath();
      ctx.fillStyle = C.you; ctx.fill();
      ctx.strokeStyle = C.paper; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = `700 11px 'Barlow Semi Condensed', 'Arial Narrow', sans-serif`;
      ctx.fillStyle = C.you;
      ctx.fillText('YOU', px, pz + r * 2.1);
    }

    // Compass and scale bar.
    ctx.fillStyle = C.ink;
    ctx.font = `16px 'Rye', Georgia, serif`;
    ctx.fillText('N', X(H) - 14, Y(-H) + 22);
    ctx.beginPath();
    ctx.moveTo(X(H) - 14, Y(-H) + 6); ctx.lineTo(X(H) - 19, Y(-H) + 12); ctx.lineTo(X(H) - 9, Y(-H) + 12);
    ctx.closePath(); ctx.fill();
    const bx = X(-H) + 10, by = Y(H) - 12;
    ctx.fillRect(bx, by, 5 * k, 3);
    ctx.font = `600 11px 'Barlow Semi Condensed', 'Arial Narrow', sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('5 m', bx + 5 * k + 6, by + 2);

    const alive = game.enemies.filter((e) => e.alive).length;
    const unknown = alive - inSight - remembered;
    this.title.textContent = game.campName;
    const parts = [`Camp ${game.run.camp + 1}`, alive === 1 ? '1 outlaw left' : `${alive} outlaws left`];
    if (unknown > 0) parts.push(`${unknown} unaccounted for`);
    this.sub.textContent = parts.join(' · ');
  }
}
