// Keyboard and mouse state. Keys are read by event.code so any layout works.

export const BINDINGS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  dodge: ['Space'],
  deadEye: ['ShiftLeft', 'ShiftRight'],
  reload: ['KeyR'],
  interact: ['KeyE', 'Enter'],
  nextWeapon: ['KeyQ'],
  weapon1: ['Digit1'],
  weapon2: ['Digit2'],
  weapon3: ['Digit3'],
  pause: ['Escape', 'KeyP'],
  debug: ['Backquote'],
};

const BLOCK_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

export class Input {
  constructor(target) {
    this.target = target;
    this.down = new Set();
    this.edges = new Set(); // codes pressed since last endFrame()
    this.mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0, inside: false };
    this.fireHeld = false;
    this.firePressed = false;
    this.wheel = 0;
    this.lastActivity = performance.now();

    addEventListener('keydown', (e) => {
      if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
      if (!e.repeat) this.edges.add(e.code);
      this.down.add(e.code);
      this.lastActivity = performance.now();
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });

    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener('pointerdown', (e) => {
      if (e.button === 0) { this.fireHeld = true; this.firePressed = true; }
      this.updatePointer(e);
    });
    addEventListener('pointerup', (e) => { if (e.button === 0) this.fireHeld = false; });
    addEventListener('pointermove', (e) => this.updatePointer(e));
    target.addEventListener('pointerleave', () => { this.mouse.inside = false; });
    target.addEventListener('pointerenter', () => { this.mouse.inside = true; });
    target.addEventListener('wheel', (e) => { e.preventDefault(); this.wheel += Math.sign(e.deltaY); }, { passive: false });
  }

  updatePointer(e) {
    const r = this.target.getBoundingClientRect();
    this.mouse.x = e.clientX - r.left;
    this.mouse.y = e.clientY - r.top;
    this.mouse.ndcX = (this.mouse.x / r.width) * 2 - 1;
    this.mouse.ndcY = -(this.mouse.y / r.height) * 2 + 1;
    this.mouse.inside = true;
  }

  held(action) {
    for (const code of BINDINGS[action]) if (this.down.has(code)) return true;
    return false;
  }

  pressed(action) {
    for (const code of BINDINGS[action]) if (this.edges.has(code)) return true;
    return false;
  }

  moveAxis() {
    let x = 0, z = 0;
    if (this.held('left')) x -= 1;
    if (this.held('right')) x += 1;
    if (this.held('up')) z -= 1;
    if (this.held('down')) z += 1;
    const len = Math.hypot(x, z);
    return len > 0 ? { x: x / len, z: z / len } : { x: 0, z: 0 };
  }

  takeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  endFrame() {
    this.edges.clear();
    this.firePressed = false;
  }

  clear() {
    this.down.clear();
    this.edges.clear();
    this.fireHeld = false;
    this.firePressed = false;
  }
}
