// The realistic render style: a physical sky (with clouds) that also lights the scene and fills its reflections, a
// sun with soft shadows, a concrete apron with painted markings, fog to the horizon, ACES tone mapping and bloom.
// Switching it on swaps every hairline material in the model for a physically based one (by tag), smooths the
// faceted normals except at real creases, hides the hairlines and glow halos, and keeps lamps lit in their real
// colours. Switching off restores the hairline scene exactly. Loaded on demand by the host (lib/core/host.ts).
// Aircraft stand on the apron; small arms get a shooting bench (lib/real/bench.ts). Sun distance, shadow depth and
// bias and the fog all scale with the model's size, so a pistol and a fighter both get crisp shadows and a horizon.
//
// Light theme = midday, dark theme = dusk. A model can light an indoor set instead (RealSpec.stage: the shooting range).
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Engine } from '../iso/engine';
import type { LampColor, RealSpec, StageOverride } from './types';
import { concreteTextures, skinTexture } from './textures';
import { LAMP_RGB, realMaterials, type RealMaterials, type RealTag } from './materials';
import { buildBench } from './bench';

const CREASE = 38 * Math.PI / 180;

// bloomT: the glow's threshold, just above the brightest sky (the midday horizon is about 3.5 before exposure), so only
// flames, flashes and lamps glow; a sky above it would haze everything in front of it
const TIMES = {
  day: { el: 40, az: 68, turbidity: 3.5, rayleigh: 1.1, mie: 0.004, g: 0.8, clouds: 0.32, sun: 3.0, sunCol: 0xfff3e2, exposure: 0.5, fog: 0xc4d0dc, fogD: 0.0028, bloom: 0.18, bloomT: 4.6, env: 0.32 },
  dusk: { el: 9, az: 62, turbidity: 7, rayleigh: 2.6, mie: 0.006, g: 0.9, clouds: 0.45, sun: 2.4, sunCol: 0xffad6b, exposure: 0.7, fog: 0x8f8582, fogD: 0.0032, bloom: 0.5, bloomT: 3.2, env: 0.55 },
};

type Swap = { mesh: THREE.Mesh; orig: THREE.Material | THREE.Material[]; real: THREE.Material; flatN?: THREE.BufferAttribute; smoothN?: THREE.BufferAttribute };
/** a plain grey skin for the shared library when the model brings its own materials (no panel texture needed) */
const PLAIN = { light: '#808080', dark: '#808080', camo: 0, panel: 4, metalness: 0.3, roughness: 0.5 };

export function createRealism(E: Engine, spec: RealSpec, root: THREE.Object3D) {
  const tex = skinTexture(spec.skin ? 2048 : 64);
  const M = realMaterials(tex, spec.skin ?? PLAIN), own = spec.materials ?? {};
  Object.values(own).forEach(m => { m.userData.realStyle = true; });
  const lampMats: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial, number][] = [];
  const S = spec.size, focus = spec.focus.clone();
  const SUN = S * 12, FOG = Math.max(1, 16 / S);                    // sun distance; fog density gain for small models

  // ── world: sky, ground, markings ──
  const world = new THREE.Group(); world.visible = false; E.scene.add(world);
  const sky = new Sky(); sky.scale.setScalar(4000); sky.raycast = () => {}; world.add(sky);
  const conc = concreteTextures(), TILE = 20, G = Math.max(1600, S * 60);   // wide enough for a circuit
  for (const t of [conc.map, conc.roughnessMap, conc.bumpMap]) t.repeat.set(G / TILE, G / TILE);
  const groundMat = new THREE.MeshStandardMaterial({ map: conc.map, roughnessMap: conc.roughnessMap, bumpMap: conc.bumpMap, bumpScale: 1.2, roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(G, G).rotateX(-Math.PI / 2), groundMat);
  ground.position.set(focus.x, 0, focus.z); ground.receiveShadow = true; ground.raycast = () => {}; world.add(ground);
  const bench = spec.bench ? buildBench(spec.bench) : null;
  if (bench) { world.add(bench.group); ground.position.y = bench.floorY; }
  const paint = new THREE.MeshStandardMaterial({ color: 0xd9a21b, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const edge = new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const strip = (w: number, d: number, x: number, z: number, m: THREE.Material, y = 0.004) => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), m); s.position.set(x, y, z); s.receiveShadow = true; s.raycast = () => {}; world.add(s);
  };
  if (spec.markings) {
    const rw = spec.markings.runway, L = rw ? S * 1.6 : S * 9;
    strip(0.32, L, 0, focus.z, edge, 0.003); strip(0.16, L, 0, focus.z, paint);                       // taxi line, black-edged
    strip(S * 0.24, 0.5, 0, spec.markings.stopZ, edge, 0.003); strip(S * 0.22, 0.32, 0, spec.markings.stopZ, paint);   // stop bar
    if (rw) {                                          // runway: edge lines, dashed centre line, threshold bars, aiming points
      const white = new THREE.MeshStandardMaterial({ color: 0xe6e6df, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const k = rw.w / 45, len = rw.z1 - rw.z0, mid = (rw.z0 + rw.z1) / 2;
      for (const x of [-1, 1]) strip(0.9 * k, len, x * (rw.w / 2 - 0.6 * k), mid, white, 0.0035);
      for (let z = rw.z0 + 60 * k; z < rw.z1 - 60 * k; z += 50 * k) if (Math.abs(z - focus.z) > S * 0.9) strip(0.9 * k, 30 * k, 0, z, white, 0.0035);
      for (const [z, dir] of [[rw.z0, 1], [rw.z1, -1]]) {
        for (let i = 0; i < 8; i++) for (const sx of [-1, 1]) strip(1.8 * k, 30 * k, sx * (3 * k + i * 2.6 * k), z + dir * 21 * k, white, 0.0035);
        for (const sx of [-1, 1]) strip(10 * k, 45 * k, sx * 7 * k, z + dir * 310 * k * Math.min(1, len / (900 * k)), white, 0.0035);
      }
      white.userData.realStyle = true;
    }
  }

  // ── sun & environment ──
  const sun = E.lights.sun, sun0 = { pos: sun.position.clone(), col: sun.color.clone() };
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  /** the shadow box: half-size h around the aim point, the sun `dist` away */
  const shadowBox = (h: number, dist: number, nb: number) => {
    sc.left = sc.bottom = -h; sc.right = sc.top = h; sc.near = Math.max(0.01, dist - h * 3); sc.far = dist + h * 3; sc.updateProjectionMatrix();
    sun.shadow.normalBias = nb;
  };
  sun.shadow.bias = -0.0002; sun.shadow.radius = 3;
  let indoor: StageOverride | null = null, sunDist = SUN;
  E.scene.add(sun.target);
  const pmrem = new THREE.PMREMGenerator(E.renderer);
  const envScene = new THREE.Scene(), envSky = new Sky(); envSky.scale.setScalar(50); envScene.add(envSky);
  let envRT: THREE.WebGLRenderTarget | null = null, envKey = '', roomRT: THREE.WebGLRenderTarget | null = null;
  const roomEnv = () => { if (!roomRT) { const room = new RoomEnvironment(); roomRT = pmrem.fromScene(room, 0.04); room.dispose(); } return roomRT; };
  if (spec.stage) roomEnv();                         // made with the rest of the view, not as the indoor set comes on
  const bloom = new UnrealBloomPass(new THREE.Vector2(E.renderer.domElement.width, E.renderer.domElement.height), 0.3, 0.45, 3.0);
  bloom.enabled = false; E.addPreOutputPass(bloom);
  // a soft ramp over the threshold, and a cap on what feeds the glow: a sun disc in frame is thousands of times brighter
  // than anything else and would otherwise wash the whole frame white
  (bloom.highPassUniforms as Record<string, THREE.IUniform>).smoothWidth.value = 1.2;
  const hp = bloom.materialHighPassFilter;
  hp.fragmentShader = hp.fragmentShader.replace('gl_FragColor = mix( outputColor, texel, alpha );', 'gl_FragColor = min( mix( outputColor, texel, alpha ), vec4( 16.0 ) );');
  hp.needsUpdate = true;

  const sunDir = new THREE.Vector3(0, 1, 0), aimAt = new THREE.Vector3();
  /** the sun and its shadow box sit over the focus, or over the followed object as it moves */
  function aimSun() {
    if (indoor) aimAt.copy(indoor.sun.focus);
    else if (spec.follow) { spec.follow.getWorldPosition(aimAt); aimAt.y = focus.y; } else aimAt.copy(focus);
    sun.position.copy(aimAt).addScaledVector(sunDir, sunDist); sun.target.position.copy(aimAt); sun.target.updateMatrixWorld();
  }
  /** an indoor set: a lit room's reflections, no sky, the sun overhead as the house lights */
  function applyIndoor(o: StageOverride) {
    const s = E.scene;
    sky.visible = o.sky;
    s.environment = o.env === 'room' ? roomEnv().texture : envRT?.texture ?? null; s.environmentIntensity = o.envI;
    s.fog = o.fog ? new THREE.FogExp2(o.fog.color, o.fog.density) : null;
    E.renderer.toneMapping = THREE.ACESFilmicToneMapping; E.renderer.toneMappingExposure = o.exposure;
    E.lights.hemi.intensity = 0; E.lights.ambient.intensity = 0; E.lights.fill.intensity = 0;
    sun.color.set(o.sun.color); sun.intensity = o.sun.intensity; sun.castShadow = true;
    sunDir.copy(o.sun.dir).normalize(); sunDist = o.sun.size * 2.5;
    shadowBox(o.sun.size, sunDist, o.sun.size * 0.0012); aimSun();
    bloom.strength = o.bloom; bloom.threshold = o.bloomT;
  }
  function applyTime() {
    indoor = spec.stage?.() ?? null;
    if (indoor) { if (!envRT) { envSky.material.uniforms.cloudCoverage.value = 0; envRT = pmrem.fromScene(envScene, 0.02); envKey = E.theme; } applyIndoor(indoor); return; }
    sky.visible = true; sunDist = SUN; shadowBox(S * 1.4, SUN, S * 0.0018);
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
    s.fog = new THREE.FogExp2(T.fog, T.fogD * FOG);
    E.renderer.toneMapping = THREE.ACESFilmicToneMapping; E.renderer.toneMappingExposure = T.exposure;
    E.lights.hemi.intensity = 0; E.lights.ambient.intensity = 0; E.lights.fill.intensity = 0;
    sun.color.set(T.sunCol); sun.intensity = T.sun; sun.castShadow = true;
    sunDir.copy(dir); aimSun();
    bloom.strength = T.bloom; bloom.threshold = T.bloomT;
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
  /** the model's own material for a tag first, then the shared library; untagged hairline materials by kind */
  const realOf = (m: THREE.Mesh): THREE.Material | null => {
    const t = (m.userData.real ?? m.geometry.userData.real) as string | undefined;
    if (t && own[t]) return own[t];
    if (t && t in M) return M[t as RealTag];
    const o = m.material as THREE.Material;
    if (o === E.mats.body) return own.body ?? M.skin;
    if (o === E.mats.recess) return own.recess ?? M.recess;
    if (o === E.mats.glass) return own.canopy ?? M.canopy;
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
      else real = realOf(m);
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
    if (v) {
      E.renderer.shadowMap.enabled = true; E.renderer.shadowMap.type = THREE.PCFShadowMap; applyTime();
      void E.warm();                              // compile the swapped-in materials off the main thread first
    }
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
    if ((spec.stage?.() ?? null) !== indoor) applyTime();
    sky.material.uniforms.time.value = now / 1000;
    for (const o of hairs) {                        // only a selected part keeps its accent outline
      const mat = (o as THREE.Mesh).material as THREE.Material;
      o.visible = !(o as THREE.Points).isPoints && E.accentLineMats.has(mat);
    }
    for (const [src, r, gain] of lampMats) r.emissiveIntensity = src.emissiveIntensity * gain;
    if (spec.follow) aimSun();
    spec.tick?.(now, M);
  });

  return {
    set,
    get on() { return on; },
    dispose() {
      if (on) set(false);
      for (const h of hairs) h.visible = true;
      // the skin and concrete textures are shared for the session (lib/real/textures.ts)
      bench?.dispose();
      Object.values(M).forEach(m => m.dispose());
      lampMats.forEach(([, r]) => r.dispose());
      envRT?.dispose(); roomRT?.dispose(); pmrem.dispose(); bloom.dispose();
      envSky.geometry.dispose(); envSky.material.dispose();
    },
  };
}

export type Realism = ReturnType<typeof createRealism>;
export type { RealMaterials };
