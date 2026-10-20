// The realistic render style: a physical sky (with clouds) that also lights the scene and fills its reflections, a
// sun with soft shadows, a concrete apron with painted markings, fog to the horizon, ACES tone mapping and bloom.
// Switching it on swaps every hairline material in the model for a physically based one (by tag), smooths the
// faceted normals except at real creases, hides the hairlines and glow halos, and keeps lamps lit in their real
// colours. Switching off restores the hairline scene exactly. Loaded on demand by the host (lib/core/host.ts).
//
// Light theme = midday, dark theme = dusk.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Engine } from '../iso/engine';
import type { LampColor, RealSpec } from './types';
import { concreteTextures, skinTexture } from './textures';
import { LAMP_RGB, realMaterials, type RealMaterials, type RealTag } from './materials';

const CREASE = 38 * Math.PI / 180;

const TIMES = {
  day: { el: 40, az: 68, turbidity: 3.5, rayleigh: 1.1, mie: 0.004, g: 0.8, clouds: 0.32, sun: 3.0, sunCol: 0xfff3e2, exposure: 0.5, fog: 0xc4d0dc, fogD: 0.0028, bloom: 0.18, env: 0.32 },
  dusk: { el: 9, az: 62, turbidity: 7, rayleigh: 2.6, mie: 0.006, g: 0.9, clouds: 0.45, sun: 2.4, sunCol: 0xffad6b, exposure: 0.7, fog: 0x8f8582, fogD: 0.0032, bloom: 0.5, env: 0.55 },
};

type Swap = { mesh: THREE.Mesh; orig: THREE.Material | THREE.Material[]; real: THREE.Material; flatN?: THREE.BufferAttribute; smoothN?: THREE.BufferAttribute };

export function createRealism(E: Engine, spec: RealSpec, root: THREE.Object3D) {
  const tex = skinTexture();
  const M = realMaterials(tex, spec.skin);
  const lampMats: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial, number][] = [];
  const S = spec.size, focus = spec.focus.clone();

  // ── world: sky, ground, markings ──
  const world = new THREE.Group(); world.visible = false; E.scene.add(world);
  const sky = new Sky(); sky.scale.setScalar(4000); sky.raycast = () => {}; world.add(sky);
  const conc = concreteTextures(), TILE = 20, G = Math.max(600, S * 40);
  for (const t of [conc.map, conc.roughnessMap, conc.bumpMap]) t.repeat.set(G / TILE, G / TILE);
  const groundMat = new THREE.MeshStandardMaterial({ map: conc.map, roughnessMap: conc.roughnessMap, bumpMap: conc.bumpMap, bumpScale: 1.2, roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(G, G).rotateX(-Math.PI / 2), groundMat);
  ground.position.set(focus.x, 0, focus.z); ground.receiveShadow = true; ground.raycast = () => {}; world.add(ground);
  const paint = new THREE.MeshStandardMaterial({ color: 0xd9a21b, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const edge = new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const strip = (w: number, d: number, x: number, z: number, m: THREE.Material, y = 0.004) => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), m); s.position.set(x, y, z); s.receiveShadow = true; s.raycast = () => {}; world.add(s);
  };
  if (spec.markings) {
    const L = S * 9;
    strip(0.32, L, 0, focus.z, edge, 0.003); strip(0.16, L, 0, focus.z, paint);                       // taxi line, black-edged
    strip(S * 0.24, 0.5, 0, spec.markings.stopZ, edge, 0.003); strip(S * 0.22, 0.32, 0, spec.markings.stopZ, paint);   // stop bar
  }

  // ── sun & environment ──
  const sun = E.lights.sun, sun0 = { pos: sun.position.clone(), col: sun.color.clone() };
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = sc.bottom = -S * 1.4; sc.right = sc.top = S * 1.4; sc.near = 1; sc.far = 600; sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.035; sun.shadow.radius = 3;
  E.scene.add(sun.target);
  const pmrem = new THREE.PMREMGenerator(E.renderer);
  const envScene = new THREE.Scene(), envSky = new Sky(); envSky.scale.setScalar(50); envScene.add(envSky);
  let envRT: THREE.WebGLRenderTarget | null = null, envKey = '';
  const bloom = new UnrealBloomPass(new THREE.Vector2(E.renderer.domElement.width, E.renderer.domElement.height), 0.3, 0.45, 3.0);
  bloom.enabled = false; E.addPreOutputPass(bloom);

  function applyTime() {
    const T = E.theme === 'light' ? TIMES.day : TIMES.dusk, key = E.theme;
    const el = THREE.MathUtils.degToRad(T.el), az = THREE.MathUtils.degToRad(T.az);
    const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    for (const s of [sky, envSky]) {
      const u = s.material.uniforms;
      u.turbidity.value = T.turbidity; u.rayleigh.value = T.rayleigh; u.mieCoefficient.value = T.mie; u.mieDirectionalG.value = T.g;
      u.sunPosition.value.copy(dir); u.cloudCoverage.value = T.clouds;
    }
    if (envKey !== key) {
      envKey = key; envRT?.dispose();
      envSky.material.uniforms.cloudCoverage.value = 0;           // clouds in reflections only add noise
      envRT = pmrem.fromScene(envScene, 0.02);
    }
    const s = E.scene;
    s.environment = envRT!.texture; s.environmentIntensity = T.env;   // the background colour stays: the sky draws over it
    s.fog = new THREE.FogExp2(T.fog, T.fogD);
    E.renderer.toneMapping = THREE.ACESFilmicToneMapping; E.renderer.toneMappingExposure = T.exposure;
    E.lights.hemi.intensity = 0; E.lights.ambient.intensity = 0; E.lights.fill.intensity = 0;
    sun.color.set(T.sunCol); sun.intensity = T.sun; sun.castShadow = true;
    sun.position.copy(focus).addScaledVector(dir, 220); sun.target.position.copy(focus); sun.target.updateMatrixWorld();
    bloom.strength = T.bloom;
  }

  // ── material swaps ──
  const swaps: Swap[] = [];
  const hairs: THREE.Object3D[] = [];              // hairlines, outline shells and glow halos
  const lampOf = new Map(spec.lamps ?? []);
  const lampMat = (src: THREE.MeshStandardMaterial, c: LampColor, x: number) => {
    const col = c === 'nav' ? (x >= 0 ? 'red' : 'green') : c;
    let hit = lampMats.find(([s, r]) => s === src && r.userData.col === col);
    if (!hit) {
      const r = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: LAMP_RGB[col], emissiveIntensity: 0, roughness: 0.3 });
      r.userData.col = col; r.userData.realStyle = true; hit = [src, r, col === 'white' ? 5 : 7]; lampMats.push(hit);
    }
    return hit[1];
  };
  const tagOf = (m: THREE.Mesh): RealTag | null => {
    const t = (m.userData.real ?? m.geometry.userData.real) as RealTag | undefined;
    if (t && t in M) return t;
    const o = m.material as THREE.Material;
    if (o === E.mats.body) return 'skin';
    if (o === E.mats.recess) return 'recess';
    if (o === E.mats.glass) return 'canopy';
    return null;
  };
  function collect() {
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if ((o as THREE.Points).isPoints || (o as { isLineSegments2?: boolean }).isLineSegments2 || o.userData.outline) { hairs.push(o); return; }
      const m = o as THREE.Mesh;
      if (!m.isMesh || o.userData.plume !== undefined) return;
      const orig = m.material as THREE.MeshStandardMaterial;
      let real: THREE.Material | null = null;
      const lc = lampOf.get(orig);
      if (lc) real = lampMat(orig, lc, m.position.x);
      else { const t = tagOf(m); if (t) real = M[t]; }
      if (!real) return;                          // screens and anything unknown keep their material
      const sw: Swap = { mesh: m, orig: m.material, real };
      const g = m.geometry;
      if (!g.index && real !== M.canopy && !lc) {
        if (!g.userData.smoothN) {
          const c = toCreasedNormals(g, CREASE);
          if (c.attributes.position.count === g.attributes.position.count) { g.userData.flatN = g.attributes.normal; g.userData.smoothN = c.attributes.normal; }
          c.dispose();
        }
        sw.flatN = g.userData.flatN; sw.smoothN = g.userData.smoothN;
      }
      swaps.push(sw);
    });
  }
  collect();

  let on = false;
  const glowWas = new Map<THREE.Object3D, boolean>();
  function set(v: boolean) {
    if (v === on) return;
    on = v;
    for (const s of swaps) {
      s.mesh.material = v ? s.real : s.orig;
      if (s.smoothN) s.mesh.geometry.setAttribute('normal', v ? s.smoothN : s.flatN!);
      const glassy = s.real === M.canopy || lampMats.some(l => l[1] === s.real);
      s.mesh.castShadow = v && !glassy; s.mesh.receiveShadow = v && !glassy;
    }
    world.visible = v;
    for (const o of spec.only?.line ?? []) o.visible = !v;
    for (const o of spec.only?.real ?? []) o.visible = v;
    for (const o of spec.hide ?? []) { if (v) glowWas.set(o, o.visible); o.visible = v ? false : glowWas.get(o) ?? true; }
    bloom.enabled = v;
    if (v) { E.renderer.shadowMap.enabled = true; E.renderer.shadowMap.type = THREE.PCFShadowMap; applyTime(); }
    else {
      for (const h of hairs) h.visible = true;
      sun.castShadow = false;
      E.scene.environment = null; E.scene.fog = null;
      E.renderer.toneMapping = THREE.NoToneMapping; E.renderer.toneMappingExposure = 1;
      sun.position.copy(sun0.pos); sun.color.copy(sun0.col);
      E.setTheme(E.theme);                          // restores background, lights and hairline colours
    }
    spec.onStyle?.(v);
  }
  E.themeHooks.push(() => { if (on) applyTime(); });

  E.onTick(now => {
    if (!on) return;
    sky.material.uniforms.time.value = now / 1000;
    for (const o of hairs) {                        // only a selected part keeps its accent outline
      const mat = (o as THREE.Mesh).material as THREE.Material;
      o.visible = !(o as THREE.Points).isPoints && E.accentLineMats.has(mat);
    }
    for (const [src, r, gain] of lampMats) r.emissiveIntensity = src.emissiveIntensity * gain;
    spec.tick?.(now, M);
  });

  return {
    set,
    get on() { return on; },
    dispose() {
      if (on) set(false);
      for (const h of hairs) h.visible = true;
      [tex, conc.map, conc.roughnessMap, conc.bumpMap].forEach(t => t.dispose());
      Object.values(M).forEach(m => m.dispose());
      lampMats.forEach(([, r]) => r.dispose());
      envRT?.dispose(); pmrem.dispose(); bloom.dispose();
      envSky.geometry.dispose(); envSky.material.dispose();
    },
  };
}

export type Realism = ReturnType<typeof createRealism>;
export type { RealMaterials };
