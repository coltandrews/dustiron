// Renderer, scene, light rig and the shadow box that follows the player.
import * as THREE from 'three';
import { T } from './tuning.js';

export const SKY = 0xe9b886;

export function createRenderContext(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, T.render.maxPixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.id = 'game-canvas';
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 48, 105);

  const hemi = new THREE.HemisphereLight(0xffdfad, 0x65412f, 1.18);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffefd1, 2.7);
  sun.castShadow = true;
  const span = T.render.shadowSpan;
  sun.shadow.mapSize.set(T.render.shadowMapSize, T.render.shadowMapSize);
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 80 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  const sunOffset = new THREE.Vector3(-14, 26, 9);
  const texel = (span * 2) / T.render.shadowMapSize;

  const flash = new THREE.PointLight(0xffc070, 0, 9, 1.6);
  scene.add(flash);

  function focusShadow(x, z) {
    // Snap to shadow texels so shadows don't shimmer as the camera moves.
    const sx = Math.round(x / texel) * texel, sz = Math.round(z / texel) * texel;
    sun.target.position.set(sx, 0, sz);
    sun.position.set(sx + sunOffset.x, sunOffset.y, sz + sunOffset.z);
  }

  function resize(camera) {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px';
    renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return { renderer, scene, sun, hemi, flash, focusShadow, resize };
}
