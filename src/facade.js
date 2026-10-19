// Shared facade parts used by street buildings and back-lot buildings.
import { PAL } from './models.js';

export function window(s, x, y, z, color = 0x49666a, w = 1.3, h = 1.5) {
  s.box(w + 0.22, h + 0.2, 0.12, PAL.woodDark, x, y, z);
  s.box(w, h, 0.14, color, x, y, z + 0.04);
  s.box(0.06, h, 0.18, PAL.woodLight, x, y, z + 0.08);
  s.box(w, 0.06, 0.18, PAL.woodLight, x, y + h * 0.1, z + 0.08);
  s.box(w + 0.4, 0.12, 0.3, PAL.woodLight, x, y - h / 2 - 0.12, z + 0.12);
  s.box(w + 0.34, 0.14, 0.16, PAL.woodDark, x, y + h / 2 + 0.16, z + 0.06);
}
