// Boot and the fixed-timestep loop: the sim ticks at 60 Hz scaled by Dead
// Eye, hit-stop and slow-mo; rendering interpolates between ticks.
import { T } from './tuning.js';
import { initPhysics } from './physics.js';
import { createRenderContext } from './render.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { Game, loadSave } from './game.js';

async function openDebug(game) {
  if (game.gui) { game.gui.show(game.gui._hidden); return; }
  try {
    const { default: GUI } = await import('lil-gui');
    const gui = (game.gui = new GUI({ title: 'Tuning' }));
    for (const [group, values] of Object.entries(T)) {
      const f = gui.addFolder(group);
      for (const key of Object.keys(values)) if (typeof values[key] === 'number') f.add(values, key);
      f.close();
    }
  } catch (e) {
    console.warn('Tuning panel unavailable', e);
  }
}

async function boot() {
  const ui = new UI();
  ui.show('loading');
  try {
    await initPhysics();
  } catch (e) {
    ui.error(`Physics failed to load (${e && e.message ? e.message : e}). Reload the page. If it keeps failing, try a current Chrome, Edge, Firefox or Safari.`);
    return;
  }
  const app = document.getElementById('app');
  const render = createRenderContext(app);
  const rig = new CameraRig();
  const input = new Input(render.renderer.domElement);
  const audio = new Audio();
  const game = new Game({ render, rig, input, audio, ui });
  window.dustiron = game;

  const resize = () => { render.resize(rig.camera); if (game.state === 'map') game.mapView.draw(game); };
  resize();
  addEventListener('resize', resize);

  ui.bind({
    newRun: () => { audio.unlock(); audio.play('uiClick', { bus: 'ui' }); game.newRun(); },
    continueRun: () => { audio.unlock(); audio.play('uiClick', { bus: 'ui' }); const s = loadSave(); if (s) game.continueRun(s); else game.newRun(); },
    resume: () => game.pause(false),
    closeMap: () => game.closeMap(),
    quitToTitle: () => game.quitToTitle(),
  });
  ui.setContinue(loadSave());
  ui.show('title');

  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (game.state === 'dead' && (e.code === 'KeyR' || e.code === 'Enter')) { audio.unlock(); game.newRun(); }
    else if (game.state === 'title' && e.code === 'Enter') { audio.unlock(); const s = loadSave(); if (s) game.continueRun(s); else game.newRun(); }
    else if (e.code === 'KeyN') audio.setMuted(!audio.muted);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) game.pause(true); });
  addEventListener('blur', () => game.pause(true));
  addEventListener('pagehide', () => game.save());

  const step = 1 / T.sim.hz;
  let acc = 0;
  let last = performance.now();
  let failed = false;
  render.renderer.setAnimationLoop((now) => {
    if (failed) return;
    try {
      let dt = (now - last) / 1000;
      last = now;
      dt = Math.min(Math.max(dt, 0), T.sim.maxFrame);
      if (input.pressed('debug')) openDebug(game);
      game.updateIntent();
      const scale = game.timeScale();
      if (scale > 0) {
        acc += dt * scale;
        let n = 0;
        while (acc >= step && n < T.sim.maxTicksPerFrame) {
          game.tick(step, step / scale);
          acc -= step;
          n++;
        }
        if (n === T.sim.maxTicksPerFrame) acc = 0;
      }
      game.frame(dt, acc / step);
      input.endFrame();
    } catch (e) {
      failed = true;
      console.error(e);
      ui.error(`Something broke: ${e && e.message ? e.message : e}`);
    }
  });
}

boot();
