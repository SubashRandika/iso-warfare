// Smoke and fire for the realistic style, drawn as soft camera-facing puffs: instanced quads, one draw per layer.
// Smoke is lit by the sun through a rounded pseudo-normal per puff and fades into the fog; fire is additive and bright
// enough to bloom. Each puff grows fast and then slowly, is slowed by the air (drag), rises or falls, drifts with the
// wind and fades out, so puffs laid closely along a missile's path read as one continuous, widening trail.
// The puff texture (four variants) is drawn at load from layered value noise; nothing is downloaded.
import * as THREE from 'three';
import type { Engine } from '../iso/engine';

export interface PuffSpec {
  /** initial velocity, m/s */
  v?: THREE.Vector3;
  /** diameter at birth and at the end of its life, m */
  s0: number; s1: number;
  /** seconds */
  life: number;
  /** smoke: albedo; fire: emitted colour (HDR) at birth */
  c: readonly [number, number, number];
  /** colour at the end of its life (fire cools from yellow-white to dark red); default `c` */
  c1?: readonly [number, number, number];
  /** opacity at birth, default 1 */
  a?: number;
  /** air drag, 1/s */
  drag?: number;
  /** vertical acceleration, m/s²: positive rises (hot gas), negative falls (fragments) */
  rise?: number;
  /** start part-way through its life, seconds (spreads the puffs laid in one frame along the path) */
  age?: number;
}

const F = 22;   // floats per particle: p3 v3 age life s0 s1 a rot spin c0(3) c1(3) drag rise tile

/** four soft, lumpy puffs in a 2×2 atlas: alpha is density, red is a detail value for the shading */
/** shared for the session: every particle system draws the same puffs */
let puff: THREE.CanvasTexture | null = null;
const puffTexture = () => puff ??= Object.assign(drawPuffs(), { userData: { shared: true } });
function drawPuffs() {
  const N = 128, W = N * 2, img = new ImageData(W, W);
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const G = 32, grid = Array.from({ length: G * G }, rnd);
  const vn = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const g = (i: number, j: number) => grid[((j % G + G) % G) * G + ((i % G + G) % G)];
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(g(xi, yi), g(xi + 1, yi), sx), THREE.MathUtils.lerp(g(xi, yi + 1), g(xi + 1, yi + 1), sx), sy);
  };
  const fbm = (x: number, y: number) => 0.5 * vn(x, y) + 0.3 * vn(x * 2.1, y * 2.1) + 0.2 * vn(x * 4.3, y * 4.3);
  for (let t = 0; t < 4; t++) {
    const blobs = Array.from({ length: 9 }, () => { const a = rnd() * Math.PI * 2, r = rnd() * 0.28; return [Math.cos(a) * r, Math.sin(a) * r, 0.3 + rnd() * 0.16]; });
    const ox = (t % 2) * N, oy = Math.floor(t / 2) * N, off = t * 9.7;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1;
      let d = 0;
      for (const [bx, by, br] of blobs) { const q = ((u - bx) ** 2 + (v - by) ** 2) / (br * br); d += Math.exp(-q * 1.6); }
      const n = fbm(u * 3 + off, v * 3 + off);
      // density saturates gently (no flat plateau) and falls away from the middle, so a puff has no visible rim
      const edge = Math.pow(1 - THREE.MathUtils.smoothstep(Math.hypot(u, v), 0.1, 1), 1.6);
      const a = THREE.MathUtils.clamp((1 - Math.exp(-d * 1.1)) * (0.55 + 0.8 * n) * edge, 0, 1);
      const i = ((oy + y) * W + ox + x) * 4;
      img.data[i] = 255 * THREE.MathUtils.clamp(0.35 + n * 0.9, 0, 1); img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = 255 * a;
    }
  }
  const c = document.createElement('canvas'); c.width = c.height = W; c.getContext('2d')!.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.NoColorSpace; tex.premultiplyAlpha = false;
  return tex;
}

const VERT = /* glsl */`
attribute vec3 iPos; attribute vec4 iA; attribute vec3 iC;
varying vec2 vUv; varying vec2 vQ; varying float vAlpha; varying vec3 vCol;
#include <fog_pars_vertex>
void main() {
  float c = cos(iA.z), s = sin(iA.z);
  vec2 q = position.xy;
  vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
  mvPosition.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y) * iA.x;
  gl_Position = projectionMatrix * mvPosition;
  // a puff the eye is inside (the pilot's view through a smoke column) fades out and is dropped before it is
  // rasterised: one screen-filling translucent quad per puff would cost far more than the whole scene
  float near = smoothstep(0.5, 1.5, -mvPosition.z / max(iA.x, 1e-3));
  if (near < 0.01) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  vUv = (uv + vec2(mod(iA.w, 2.0), floor(iA.w / 2.0))) * 0.5;
  vQ = q * 2.0; vAlpha = iA.y * near; vCol = iC;
  #include <fog_vertex>
}`;
const SMOKE_FRAG = /* glsl */`
uniform sampler2D uMap; uniform vec3 uSunV, uSunC, uAmb;
varying vec2 vUv; varying vec2 vQ; varying float vAlpha; varying vec3 vCol;
#include <fog_pars_fragment>
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vAlpha;
  if (a < 0.003) discard;
  vec3 n = normalize(vec3(vQ, sqrt(max(0.05, 1.0 - dot(vQ, vQ)))));
  float ndl = clamp(dot(n, uSunV) * 0.6 + 0.4, 0.0, 1.0);          // wrapped: light soaks into the puff
  vec3 col = vCol * (uAmb + uSunC * ndl) * (0.7 + 0.45 * t.r);
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}`;
const FIRE_FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec2 vUv; varying vec2 vQ; varying float vAlpha; varying vec3 vCol;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vAlpha * (0.55 + 0.6 * t.r);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol, a);
}`;

function layer(map: THREE.Texture, max: number, fire: boolean) {
  const d = new Float32Array(max * F);
  let n = 0;
  const base = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index; geo.setAttribute('position', base.getAttribute('position')); geo.setAttribute('uv', base.getAttribute('uv'));
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const iA = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const iC = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', iPos); geo.setAttribute('iA', iA); geo.setAttribute('iC', iC); geo.instanceCount = 0;
  const uniforms = fire ? { uMap: { value: map } }
    : THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: map }, uSunV: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.5, 0.5, 0.5) } }]);
  if (!fire) uniforms.uMap.value = map;                             // merge clones textures' holders; keep the one map
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: fire ? FIRE_FRAG : SMOKE_FRAG, uniforms, fog: !fire,
    transparent: true, depthWrite: false, blending: fire ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  mat.userData.realStyle = true;
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.raycast = () => {}; mesh.renderOrder = fire ? 8 : 7;

  function emit(p: THREE.Vector3, s: PuffSpec) {
    if (n >= max) return;
    const o = n * F, c1 = s.c1 ?? s.c, v = s.v;
    d[o] = p.x; d[o + 1] = p.y; d[o + 2] = p.z;
    d[o + 3] = v ? v.x : 0; d[o + 4] = v ? v.y : 0; d[o + 5] = v ? v.z : 0;
    d[o + 6] = s.age ?? 0; d[o + 7] = s.life; d[o + 8] = s.s0; d[o + 9] = s.s1; d[o + 10] = s.a ?? 1;
    d[o + 11] = Math.random() * Math.PI * 2; d[o + 12] = (Math.random() - 0.5) * 0.8;
    d[o + 13] = s.c[0]; d[o + 14] = s.c[1]; d[o + 15] = s.c[2]; d[o + 16] = c1[0]; d[o + 17] = c1[1]; d[o + 18] = c1[2];
    d[o + 19] = s.drag ?? 0; d[o + 20] = s.rise ?? 0; d[o + 21] = Math.floor(Math.random() * 4);
    n++;
  }
  function update(dt: number, wind: THREE.Vector3) {
    const P = iPos.array as Float32Array, A = iA.array as Float32Array, C = iC.array as Float32Array;
    for (let i = 0; i < n;) {
      const o = i * F;
      d[o + 6] += dt;
      if (d[o + 6] >= d[o + 7]) { n--; if (i !== n) d.copyWithin(o, n * F, n * F + F); continue; }   // the last one takes its slot
      const k = Math.exp(-d[o + 19] * dt);
      d[o + 3] *= k; d[o + 4] = d[o + 4] * k + d[o + 20] * dt; d[o + 5] *= k;
      d[o] += (d[o + 3] + wind.x) * dt; d[o + 1] += (d[o + 4] + wind.y) * dt; d[o + 2] += (d[o + 5] + wind.z) * dt;
      d[o + 11] += d[o + 12] * dt;
      const t = d[o + 6] / d[o + 7], grow = 1 - (1 - t) * (1 - t);
      const fade = fire ? Math.pow(1 - t, 1.3) : Math.min(1, t / 0.035) * Math.pow(1 - t, 1.5);
      P[i * 3] = d[o]; P[i * 3 + 1] = d[o + 1]; P[i * 3 + 2] = d[o + 2];
      A[i * 4] = d[o + 8] + (d[o + 9] - d[o + 8]) * grow; A[i * 4 + 1] = d[o + 10] * fade; A[i * 4 + 2] = d[o + 11]; A[i * 4 + 3] = d[o + 21];
      const ct = fire ? Math.sqrt(t) : t;
      C[i * 3] = d[o + 13] + (d[o + 16] - d[o + 13]) * ct; C[i * 3 + 1] = d[o + 14] + (d[o + 17] - d[o + 14]) * ct; C[i * 3 + 2] = d[o + 15] + (d[o + 18] - d[o + 15]) * ct;
      i++;
    }
    geo.instanceCount = n;
    iPos.needsUpdate = iA.needsUpdate = iC.needsUpdate = true;
  }
  return { mesh, mat, emit, update, clear() { n = 0; geo.instanceCount = 0; }, get count() { return n; }, dispose() { geo.dispose(); base.dispose(); mat.dispose(); } };
}

/** a smoke layer (lit, fogged) and a fire layer (additive) in one group; call update() every frame */
export function createParticles(E: Engine, maxSmoke = 7000, maxFire = 2500) {
  const map = puffTexture();
  const smoke = layer(map, maxSmoke, false), fire = layer(map, maxFire, true);
  const group = new THREE.Group(); group.add(smoke.mesh, fire.mesh);
  const sunV = new THREE.Vector3(), U = smoke.mat.uniforms;
  return {
    group, smoke, fire,
    update(dt: number, wind: THREE.Vector3) {
      smoke.update(dt, wind); fire.update(dt, wind);
      // smoke takes the sun's direction and colour and the sky's light (the fog colour is the horizon sky)
      const sun = E.lights.sun, cam = E.camera;
      sunV.copy(sun.position).sub(sun.target.position).normalize().transformDirection(cam.matrixWorldInverse);
      U.uSunV.value.copy(sunV);
      (U.uSunC.value as THREE.Color).copy(sun.color).multiplyScalar(sun.intensity * 0.55);
      const fog = E.scene.fog as THREE.FogExp2 | null;
      (U.uAmb.value as THREE.Color).copy(fog ? fog.color : new THREE.Color(0.6, 0.62, 0.66)).multiplyScalar(0.85);
    },
    clear() { smoke.clear(); fire.clear(); },
    dispose() { smoke.dispose(); fire.dispose(); },
  };
}
export type Particles = ReturnType<typeof createParticles>;
