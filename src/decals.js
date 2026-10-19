// Soft ground decals: roads, trails, river banks and color washes. Each strip
// fades to zero alpha at its edges (and optionally at its ends), so paths blend
// into the sand instead of reading as painted bands.
import * as THREE from 'three';

export const DECAL = new THREE.MeshLambertMaterial({
  vertexColors: true, transparent: true, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});

const _c = new THREE.Color();

function hash(n) { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }

/** Resamples a polyline at a fixed spacing so long segments still get edge noise. */
export function resample(points, spacing = 1.2) {
  const out = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], length = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.round(length / spacing));
    for (let k = 1; k <= steps; k++) out.push({ x: a.x + (b.x - a.x) * k / steps, z: a.z + (b.z - a.z) * k / steps });
  }
  return out;
}

/**
 * Builds a strip along `points`. `profile` lists [offset across (-1..1), alpha]
 * pairs, `width(t)` gives the full width, `color(t, across, i)` the color.
 * `fade` shortens alpha over that many meters at each end (0 keeps hard ends).
 */
export function strip(points, { width, profile, color, y = 0.02, fade = 0, wobble = 0, seed = 1, opacity = 1 }) {
  const n = points.length, cols = profile.length;
  const lengths = [0];
  for (let i = 1; i < n; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  const total = lengths[n - 1] || 1;
  const pos = new Float32Array(n * cols * 3), col = new Float32Array(n * cols * 4), nor = new Float32Array(n * cols * 3);
  for (let i = 0; i < n; i++) {
    const before = points[Math.max(0, i - 1)], after = points[Math.min(n - 1, i + 1)];
    const dx = after.x - before.x, dz = after.z - before.z, len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len, t = lengths[i] / total;
    const half = (typeof width === 'function' ? width(t) : width) / 2;
    const endFade = fade > 0 ? Math.min(1, lengths[i] / fade, (total - lengths[i]) / fade) : 1;
    const ease = endFade * endFade * (3 - 2 * endFade);
    for (let j = 0; j < cols; j++) {
      const [across, alpha] = profile[j];
      // Edges wander a little so the strip never looks ruled.
      const edge = Math.abs(across) > 0.6 ? 1 + (hash(seed + i * 7.3 + j * 13.1) - 0.5) * wobble : 1;
      const o = across * half * edge, k = (i * cols + j);
      pos[k * 3] = points[i].x + nx * o; pos[k * 3 + 1] = y; pos[k * 3 + 2] = points[i].z + nz * o;
      nor[k * 3 + 1] = 1;
      _c.set(color(t, across, i));
      col[k * 4] = _c.r; col[k * 4 + 1] = _c.g; col[k * 4 + 2] = _c.b; col[k * 4 + 3] = alpha * ease * opacity;
    }
  }
  const index = [];
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < cols - 1; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
    index.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, DECAL);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}

/** A soft round blot of color, for worn ground, stains and shade under props. */
export function blot(x, z, rx, rz, color, alpha, y = 0.016, rot = 0, segments = 12) {
  const pos = [0, y, 0], col = [], nor = [0, 1, 0], index = [];
  _c.set(color);
  col.push(_c.r, _c.g, _c.b, alpha);
  for (let i = 0; i < segments; i++) {
    const a = i / segments * Math.PI * 2, wob = 1 + (hash(x * 3 + z * 7 + i) - 0.5) * 0.3;
    const px = Math.cos(a) * rx * wob, pz = Math.sin(a) * rz * wob;
    pos.push(px * Math.cos(rot) - pz * Math.sin(rot), y, px * Math.sin(rot) + pz * Math.cos(rot));
    col.push(_c.r, _c.g, _c.b, 0); nor.push(0, 1, 0);
    index.push(0, 1 + ((i + 1) % segments), 1 + i);
  }
  return { pos, col, nor, index, x, z };
}

/** Merges many blots into one decal mesh. */
export function blotMesh(blots) {
  const pos = [], col = [], nor = [], index = [];
  for (const b of blots) {
    const base = pos.length / 3;
    for (let i = 0; i < b.pos.length; i += 3) pos.push(b.pos[i] + b.x, b.pos[i + 1], b.pos[i + 2] + b.z);
    col.push(...b.col); nor.push(...b.nor);
    for (const k of b.index) index.push(k + base);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, DECAL);
  mesh.receiveShadow = true;
  return mesh;
}

/** Road look: wide faint wash, packed center, two darker ruts. */
export function road(points, width, { ruts = true, fade = 6, seed = 1, base = 0xb07548, wash = 0xc28b58, rut = 0x93603d, y = 0.02 } = {}) {
  const group = new THREE.Group();
  const w = typeof width === 'function' ? width : () => width;
  group.add(strip(points, {
    width: (t) => w(t) * 1.9, y, fade: fade * 1.4, seed, wobble: 0.35,
    profile: [[-1, 0], [-0.55, 0.32], [0, 0.42], [0.55, 0.32], [1, 0]],
    color: () => wash,
  }));
  group.add(strip(points, {
    width: w, y: y + 0.002, fade, seed: seed + 5, wobble: 0.28,
    profile: [[-1, 0], [-0.62, 0.78], [-0.2, 0.9], [0.2, 0.9], [0.62, 0.78], [1, 0]],
    color: (t, across, i) => (Math.round(i / 3) % 3 === 0 ? 0xb8804e : base),
  }));
  if (ruts) {
    const offset = (side) => points.map((p, i) => {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
      const track = Math.min(1.3, w(i / (points.length - 1)) * 0.2);
      return { x: p.x - dz / len * track * side, z: p.z + dx / len * track * side };
    });
    for (const side of [-1, 1]) group.add(strip(offset(side), {
      width: 0.5, y: y + 0.004, fade: fade * 1.6, seed: seed + side * 3,
      profile: [[-1, 0], [0, 0.5], [1, 0]], color: () => rut,
    }));
  }
  return group;
}
