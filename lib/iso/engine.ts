// Iso-glow 3D engine: the hairline look of the iso-glow figures in real 3D.
// Ported from the iso-glow skill's gallery-3d shell: a dark (or pale) body, a 1 CSS px silhouette shell, crease
// hairlines in two tiers, accent-coloured light only on what is live, soft per-pixel glow points and light pools,
// a true isometric (orthographic) view, auto revolve, light/dark themes and an accent picker.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { Pass } from 'three/addons/postprocessing/Pass.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

import { ACCENTS, type AccentId, type Theme } from './accents';
export { ACCENTS, type AccentId, type Theme };

const THEMES = {
  dark: {
    bg: 0x121314, body: 0x1b1c1f, recess: 0x0b0c0d, pad: 0x18191b, lamp: 0x1a1d22, glass: 0x0b0d10, glassOp: 0.55,
    line: 0x6a7076, major: 0x4c5156, edge: 0x31353a,
    sky: 0xdde4ff, ground: 0x080808, hemi: 0.7, amb: 0, sun: 0.7, fill: 0.2, shadow: 0.7, fadeMin: 0.45,
  },
  light: {
    bg: 0xe9eaea, body: 0xf1f1f0, recess: 0xd2d5d6, pad: 0xf6f6f5, lamp: 0xd8dadb, glass: 0x9aa2a7, glassOp: 0.32,
    line: 0x5d6266, major: 0x8a8f93, edge: 0xb9bcbf,
    sky: 0xffffff, ground: 0xe6e6e6, hemi: 0.9, amb: 1.6, sun: 0.35, fill: 0.15, shadow: 0.16, fadeMin: 0.8,
  },
} as const;

export interface ViewSpec { target: THREE.Vector3; dir: THREE.Vector3; dist: () => number; min?: number; max?: number }
type Tick = (now: number, dt: number) => void;
/** a first-person view (a pilot's eye): the model places the head each frame, the viewer can look round from there */
export interface EyeSpec {
  fov: number; near: number; far: number;
  /** the head's world position and orientation this frame (looking down −z, as cameras do) */
  pose(pos: THREE.Vector3, quat: THREE.Quaternion): void;
  /** after the camera is placed, before the frame is drawn: for displays carried by the head */
  frame?(cam: THREE.PerspectiveCamera, dt: number): void;
  /** the engine left the view by itself (the iso view was asked for) */
  exit?(): void;
  /** game controls (a shooting range): the model turns the head itself, so the engine adds no look of its own */
  lock?: EyeLock;
}
/**
 * Mouse-look controls for a first-person view. The first click captures the pointer (pointer lock); then raw mouse
 * movement, buttons and the wheel go to the model, and clicks never pick parts. If the browser refuses the lock, a
 * drag looks instead and clicks still count as buttons.
 */
export interface EyeLock {
  /** mouse movement in CSS pixels */
  look(dx: number, dy: number): void;
  /** 0 left, 2 right */
  button(b: number, down: boolean): void;
  wheel?(dy: number): void;
  /** the pointer was captured or released (Escape releases it); `refused`: the browser won't capture it (drag looks) */
  locked?(on: boolean, refused?: boolean): void;
}
type Pick = (part: string | null, hit: THREE.Intersection | null) => void;

const NOISE = `float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`;
const MAJOR_ANGLE = 60, EDGE_ANGLE = 30;
const GROW = 0.55, STRAIGHT = 0.9;

export function createEngine(host: HTMLElement, init: { theme: Theme; accent: AccentId; spin: boolean }) {
  const size = () => ({ w: Math.max(1, host.clientWidth), h: Math.max(1, host.clientHeight) });
  let { w: vw, h: vh } = size();

  // ── renderer, scene, cameras ──
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(vw, vh);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';
  host.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(THEMES.dark.bg);
  const persp = new THREE.PerspectiveCamera(28, vw / vh, 0.1, 600);
  // true isometric: an orthographic camera, parallel edges stay parallel like the 2D iso figures
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 600);
  let orthoH = 10;
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = persp;
  // the first-person camera has its own projection, so the orbit camera keeps its place (and keeps tracking) meanwhile
  const eyeCam = new THREE.PerspectiveCamera(60, vw / vh, 0.1, 1000);
  let eye: EyeSpec | null = null;
  const controls = new OrbitControls(camera as THREE.Camera, renderer.domElement);
  controls.enableDamping = true;
  controls.zoomToCursor = true;                       // scroll toward what is under the pointer (cockpits, bays)
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 6;
  controls.maxDistance = 160;

  const hemi = new THREE.HemisphereLight(0xdde4ff, 0x080808, 0.7); scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, 0); scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 0.7); sun.position.set(14, 30, 22); scene.add(sun);
  const fill = new THREE.DirectionalLight(0x8899bb, 0.2); fill.position.set(-20, 8, -16); scene.add(fill);

  // composer: MSAA target + a dither pass so glows and pools stay smooth instead of banding
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(vw, vh, { samples: 4, type: THREE.HalfFloatType }));
  const renderPass = new RenderPass(scene, camera); composer.addPass(renderPass);
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; ${NOISE}
      void main() { vec4 c = texture2D(tDiffuse, vUv); c.rgb += (hash(gl_FragCoord.xy) - 0.5) / 255.0; gl_FragColor = c; }`,
  }));
  composer.setSize(vw, vh);

  // ── palette & materials ──
  let theme: Theme = init.theme;
  let accentId: AccentId = init.accent;
  const accent = new THREE.Color(ACCENTS.find(a => a.id === accentId)!.dark);
  const solid = { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 } as const;
  const bodyMat = new THREE.MeshStandardMaterial({ color: THEMES.dark.body, roughness: 0.9, metalness: 0.05, ...solid });
  const recessMat = new THREE.MeshStandardMaterial({ color: THEMES.dark.recess, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const padMat = new THREE.MeshBasicMaterial({ color: THEMES.dark.pad });
  // tinted see-through canopy glass: the lit cockpit shows through it; it never glows by itself
  const glassMat = new THREE.MeshStandardMaterial({ color: THEMES.dark.glass, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });

  const devRes = () => renderer.getDrawingBufferSize(new THREE.Vector2());
  const LINE_COL = new THREE.Color(THEMES.dark.line), MAJOR_COL = new THREE.Color(THEMES.dark.major), EDGE_COL = new THREE.Color(THEMES.dark.edge), BG_COL = new THREE.Color(THEMES.dark.bg);
  // lines are pulled slightly toward the camera so the surface they sit on never hides parts of them
  const lineOpts = { linewidth: 1, resolution: devRes(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 };
  const lineMat = new LineMaterial({ color: EDGE_COL, ...lineOpts });
  const majorMat = new LineMaterial({ color: MAJOR_COL, ...lineOpts });
  const accentLineMat = new LineMaterial({ color: accent.clone(), ...lineOpts });     // a selected part's folds
  const accentMinorMat = new LineMaterial({ color: accent.clone(), ...lineOpts });    // a selected part's detail
  const outlineShader = {
    vertexShader: `uniform float thickness; uniform vec2 res;
      void main() {
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec4 n = projectionMatrix * vec4(normalize(normalMatrix * normal), 0.0);
        vec2 d = length(n.xy) > 1e-5 ? normalize(n.xy) : vec2(0.0);
        p.xy += d * thickness * 2.0 / res * p.w;
        gl_Position = p;
      }`,
    fragmentShader: `uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }`,
    side: THREE.BackSide, polygonOffset: true, polygonOffsetFactor: 6, polygonOffsetUnits: 24,
  };
  const outlineMat = new THREE.ShaderMaterial({ uniforms: { color: { value: LINE_COL.clone() }, thickness: { value: 1 }, res: { value: devRes() } }, ...outlineShader });
  const outlineAccentMat = new THREE.ShaderMaterial({ uniforms: { color: { value: accent.clone() }, thickness: { value: 1.4 }, res: { value: devRes() } }, ...outlineShader });

  const accentMats: THREE.MeshStandardMaterial[] = [];
  const glowMat = (base: number = THEMES.dark.lamp) => {
    const m = new THREE.MeshStandardMaterial({ color: base, emissive: accent.clone(), emissiveIntensity: 0, roughness: 0.35 });
    accentMats.push(m); return m;
  };
  // screen content and lit bulbs that should read as flat accent
  const screenMats: THREE.MeshBasicMaterial[] = [];

  // lamp halos: one screen-facing point per lamp, shaded per pixel
  const glowMats: THREE.ShaderMaterial[] = [];
  function glowPoints(positions: THREE.Vector3[], sizeM: number) {
    const g = new THREE.BufferGeometry().setFromPoints(positions);
    const m = new THREE.ShaderMaterial({
      uniforms: { color: { value: accent.clone() }, intensity: { value: 0 }, size: { value: sizeM }, scale: { value: 1 }, light: { value: 0 }, ortho: { value: camera === ortho ? 1 : 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      vertexShader: `uniform float size, scale, ortho;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = ortho > 0.5 ? size * scale : size * scale / -mv.z;
          mv.xyz -= normalize(mv.xyz) * size * 0.5;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform vec3 color; uniform float intensity, light; ${NOISE}
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
          float halo = exp(-d * d * 9.0) * (1.0 - d);
          float core = 1.0 - smoothstep(0.05, 0.12, d);
          float a = (halo * 0.7 + core * 0.9) * intensity + (hash(gl_FragCoord.xy) - 0.5) / 255.0;
          vec3 c = mix(color, vec3(1.0), core * 0.6 * (1.0 - light));
          gl_FragColor = light > 0.5 ? vec4(c, clamp(a, 0.0, 1.0)) : vec4(c * max(a, 0.0), 1.0);
        }`,
    });
    m.visible = theme === 'dark';
    glowMats.push(m);
    const pts = new THREE.Points(g, m);
    pts.raycast = () => {};            // halos never catch clicks
    pts.frustumCulled = false;
    return pts;
  }
  // soft radial pool: light on the ground, or the aircraft's shadow
  const softGlows: THREE.ShaderMaterial[] = [];
  function softMat(color: number, additive: boolean) {
    const m = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: 0 } },
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false,
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 color; uniform float opacity; varying vec2 vUv; ${NOISE}
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.0, d); a *= a;
          a = a * opacity + (hash(gl_FragCoord.xy) - 0.5) / 255.0;
          gl_FragColor = vec4(color, max(a, 0.0));
        }`,
    });
    if (additive) { softGlows.push(m); m.userData.accent = true; m.visible = theme === 'dark'; }
    return m;
  }

  // ── lines ──
  const fat = (arr: number[], mat: LineMaterial = lineMat) => {
    const l = new LineSegments2(new LineSegmentsGeometry().setPositions(arr), mat);
    l.userData.baseMat = mat; l.raycast = () => {};
    return l;
  };
  const loopLine = (pts: THREE.Vector3[], mat: LineMaterial = majorMat, closed = true) => {
    const out: number[] = [];
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; out.push(a.x, a.y, a.z, b.x, b.y, b.z); }
    return fat(out, mat);
  };

  // silhouette shell on smoothed normals, so the outline stays continuous around sharp corners
  function addOutline(m: THREE.Mesh) {
    const src = new THREE.BufferGeometry().setAttribute('position', (m.geometry.attributes.position as THREE.BufferAttribute).clone());
    if (m.geometry.index) src.setIndex(m.geometry.index.clone());
    const g = mergeVertices(src, 1e-4); g.computeVertexNormals();
    const o = new THREE.Mesh(g, outlineMat); o.userData.outline = true; o.raycast = () => {};
    m.add(o);
  }

  // Crease lines that stay continuous: an edge sharper than the threshold starts a line, which then follows softer
  // neighbouring edges as long as it keeps going straight on. Tiny isolated fragments are dropped.
  type CreaseData = { p: THREE.BufferAttribute; edges: { a: number; b: number; ang: number; dir: THREE.Vector3; len: number }[]; byVert: Map<number, number[]> };
  function creaseInfo(geo: THREE.BufferGeometry): CreaseData {
    if (geo.userData.crease) return geo.userData.crease;
    const src = new THREE.BufferGeometry().setAttribute('position', geo.attributes.position);
    if (geo.index) src.setIndex(geo.index);
    const g = mergeVertices(src, 1e-4);
    const p = g.attributes.position as THREE.BufferAttribute, ix = g.index!.array, nV = p.count;
    const P = (i: number) => new THREE.Vector3().fromBufferAttribute(p, i);
    const faceN: (THREE.Vector3 | null)[] = [], edgeFaces = new Map<number, number[]>();
    for (let f = 0; f < ix.length / 3; f++) {
      const a = ix[3 * f], b = ix[3 * f + 1], c = ix[3 * f + 2];
      const n = new THREE.Vector3().crossVectors(P(b).sub(P(a)), P(c).sub(P(a)));
      faceN.push(n.lengthSq() > 1e-14 ? n.normalize() : null);
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        if (u === v) continue;
        const k = Math.min(u, v) * nV + Math.max(u, v);
        (edgeFaces.get(k) || edgeFaces.set(k, []).get(k)!).push(f);
      }
    }
    const edges: CreaseData['edges'] = [];
    for (const [k, fs] of edgeFaces) {
      const a = Math.floor(k / nV), b = k % nV;
      const ns = fs.map(f => faceN[f]).filter(Boolean) as THREE.Vector3[];
      let ang = 180;
      if (ns.length >= 2) { ang = 0; for (let i = 1; i < ns.length; i++) ang = Math.max(ang, THREE.MathUtils.radToDeg(ns[0].angleTo(ns[i]))); }
      else if (ns.length === 0) continue;
      const dir = P(b).sub(P(a)), len = dir.length();
      if (len > 0) edges.push({ a, b, ang, dir: dir.divideScalar(len), len });
    }
    const byVert = new Map<number, number[]>();
    edges.forEach((e, i) => { for (const v of [e.a, e.b]) (byVert.get(v) || byVert.set(v, []).get(v)!).push(i); });
    return (geo.userData.crease = { p, edges, byVert });
  }
  function creaseLines(geo: THREE.BufferGeometry, thr: number, minLen: number) {
    const { p, edges, byVert } = creaseInfo(geo), low = thr * GROW;
    const on = new Uint8Array(edges.length), queue: number[] = [];
    edges.forEach((e, i) => { if (e.ang >= thr) { on[i] = 1; queue.push(i); } });
    while (queue.length) {
      const i = queue.pop()!, e = edges[i];
      for (const [v, out] of [[e.a, -1], [e.b, 1]] as const) {
        for (const j of byVert.get(v)!) {
          if (on[j]) continue; const f = edges[j]; if (f.ang < low) continue;
          const d = f.dir.dot(e.dir) * (f.a === v ? 1 : -1) * out;
          if (d > STRAIGHT) { on[j] = 1; queue.push(j); }
        }
      }
    }
    const parent = new Map<number, number>();
    const find = (x: number): number => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
    edges.forEach((e, i) => { if (!on[i]) return; for (const v of [e.a, e.b]) if (!parent.has(v)) parent.set(v, v); parent.set(find(e.a), find(e.b)); });
    const total = new Map<number, number>();
    edges.forEach((e, i) => { if (on[i]) { const r = find(e.a); total.set(r, (total.get(r) || 0) + e.len); } });
    const out: number[] = [];
    edges.forEach((e, i) => { if (on[i] && total.get(find(e.a))! >= minLen) out.push(p.getX(e.a), p.getY(e.a), p.getZ(e.a), p.getX(e.b), p.getY(e.b), p.getZ(e.b)); });
    return out;
  }
  /** Give a mesh the silhouette shell and both crease tiers. */
  function hairline(m: THREE.Mesh, opts: { outline?: boolean; minLen?: number } = {}) {
    if (opts.outline !== false) addOutline(m);
    const minLen = opts.minLen ?? 0.08;
    const minor = creaseLines(m.geometry, EDGE_ANGLE, minLen), major = creaseLines(m.geometry, MAJOR_ANGLE, minLen);
    if (minor.length) m.add(fat(minor, lineMat));
    if (major.length) { const l = fat(major, majorMat); l.renderOrder = 1; m.add(l); }
    return m;
  }

  // a selected part shows its folds in the accent
  let highlighted: THREE.Object3D | null = null;
  function setLines(root: THREE.Object3D, on: boolean) {
    root.traverse(o => {
      if ((o as LineSegments2).isLineSegments2 && o.userData.baseMat) {
        const l = o as LineSegments2;
        l.material = on ? (o.userData.baseMat === lineMat ? accentMinorMat : accentLineMat) : o.userData.baseMat;
      } else if (o.userData.outline) (o as THREE.Mesh).material = on ? outlineAccentMat : outlineMat;
    });
  }
  function highlight(root: THREE.Object3D | null) {
    if (highlighted) setLines(highlighted, false);
    highlighted = root;
    if (root) setLines(root, true);
  }

  // ── theme & accent ──
  const themeHooks: ((t: Theme) => void)[] = [];
  const accentFillU = { value: 0 }, accentFilled = new WeakSet<THREE.Material>();
  // light theme: every material that can light up turns flat accent where it is lit (no glow there)
  function accentFill(root: THREE.Object3D) {
    root.traverse(o => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!m || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial || accentFilled.has(m) || m.emissive.getHex() === 0 || m.userData.realStyle) return;
      accentFilled.add(m);
      m.onBeforeCompile = sh => {
        sh.uniforms.uAccentFill = accentFillU; sh.uniforms.uAccentC = { value: accent };
        sh.fragmentShader = 'uniform float uAccentFill; uniform vec3 uAccentC;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
          'if ( uAccentFill > 0.5 ) { float am = max( uAccentC.r, max( uAccentC.g, uAccentC.b ) ); outgoingLight = mix( outgoingLight, uAccentC, clamp( max( emissive.r, max( emissive.g, emissive.b ) ) / ( 0.5 * am ), 0.0, 1.0 ) ); }\n#include <opaque_fragment>');
      };
      m.needsUpdate = true;
    });
  }
  const accentHex = () => { const a = ACCENTS.find(x => x.id === accentId)!; return theme === 'light' ? a.light : a.dark; };
  function applyAccent() {
    accent.set(accentHex());
    accentMats.forEach(m => m.emissive.copy(accent));
    glowMats.forEach(m => m.uniforms.color.value.copy(accent));
    softGlows.forEach(m => { if (m.userData.accent) m.uniforms.color.value.copy(accent); });
    accentLights.forEach(l => l.color.copy(accent));
    outlineAccentMat.uniforms.color.value.copy(accent);
    appliedKey = '';
    themeHooks.forEach(f => f(theme));
  }
  const accentLights: THREE.Light[] = [];
  function setAccent(id: AccentId) { accentId = id; applyAccent(); }
  function setTheme(t: Theme) {
    theme = t; const T = THEMES[t], light = t === 'light';
    accentFill(scene); accentFillU.value = light ? 1 : 0;
    (scene.background as THREE.Color).set(T.bg); BG_COL.set(T.bg);
    bodyMat.color.set(T.body); recessMat.color.set(T.recess); padMat.color.set(T.pad);
    glassMat.color.set(T.glass); glassMat.opacity = T.glassOp;
    accentMats.forEach(m => m.color.set(T.lamp));
    LINE_COL.set(T.line); MAJOR_COL.set(T.major); EDGE_COL.set(T.edge); appliedKey = '';
    hemi.color.set(T.sky); hemi.groundColor.set(T.ground); hemi.intensity = T.hemi; ambient.intensity = T.amb; sun.intensity = T.sun; fill.intensity = T.fill;
    glowMats.forEach(m => { m.uniforms.light.value = light ? 1 : 0; m.visible = !light; });   // light theme: no glow at all
    softGlows.forEach(m => { m.visible = !light; });
    applyAccent();
  }
  const shadowStrength = () => THEMES[theme].shadow;

  // lines stay 1 CSS px at every zoom; dimmed toward the background when zoomed far out
  let appliedKey = '';
  const fovK = () => 2 * Math.tan(THREE.MathUtils.degToRad(persp.fov / 2));
  function applyWeight() {
    const dist = camera.position.distanceTo(controls.target);
    const ppm = camera === ortho ? vh * ortho.zoom / orthoH : vh / (dist * fovK());
    const k = THREE.MathUtils.clamp((ppm / 40 - 0.35) / 0.65, 0, 1);
    const fm = THEMES[theme].fadeMin, fade = fm + (1 - fm) * k, dpr = renderer.getPixelRatio();
    const key = fade.toFixed(2) + '|' + dpr + '|' + theme + '|' + (camera === ortho) + '|' + accent.getHex();
    if (key === appliedKey) return; appliedKey = key;
    lineMat.linewidth = majorMat.linewidth = dpr; accentMinorMat.linewidth = dpr; accentLineMat.linewidth = 1.3 * dpr;
    lineMat.color.copy(BG_COL).lerp(EDGE_COL, fade);
    majorMat.color.copy(BG_COL).lerp(MAJOR_COL, fade);
    accentLineMat.color.copy(accent);
    accentMinorMat.color.copy(BG_COL).lerp(accent, 0.6);
    outlineMat.uniforms.thickness.value = dpr;              // 1 CSS px silhouette
    outlineAccentMat.uniforms.thickness.value = 1.3 * dpr;
    outlineMat.uniforms.color.value.copy(BG_COL).lerp(LINE_COL, fade);
  }

  // ── views: perspective orbit, true isometric snap, revolve ──
  let view: ViewSpec = { target: new THREE.Vector3(), dir: new THREE.Vector3(1, 1, 1).normalize(), dist: () => 30 };
  let camAnim: null | { from: THREE.Vector3; fromT: THREE.Vector3; t: number; zoom0?: number; spin: boolean } = null;
  function orthoFrustum() { const a = vw / vh; ortho.top = orthoH / 2; ortho.bottom = -orthoH / 2; ortho.left = -orthoH * a / 2; ortho.right = orthoH * a / 2; ortho.updateProjectionMatrix(); }
  function setOrtho(on: boolean, frameDist?: number) {
    if (on === (camera === ortho)) return;
    if (on) {
      orthoH = (frameDist || camera.position.distanceTo(controls.target)) * fovK();
      ortho.position.copy(camera.position); ortho.quaternion.copy(camera.quaternion); ortho.zoom = 1; orthoFrustum();
      camera = ortho;
    } else {
      const d = orthoH / fovK() / ortho.zoom;
      persp.position.copy(controls.target).add(ortho.position.clone().sub(controls.target).setLength(d));
      persp.quaternion.copy(ortho.quaternion); camera = persp;
    }
    controls.object = camera; renderPass.camera = eye ? eyeCam : camera; controls.update(); appliedKey = '';
    glowMats.forEach(m => { m.uniforms.ortho.value = on ? 1 : 0; });
    emit();
  }
  /** Iso view: snap to the true isometric angle in orthographic; again: back to perspective at the same angle. */
  function toggleIso() {
    if (eye) { const s = eye; setEye(null); s.exit?.(); }
    if (camera === ortho) { setOrtho(false); return; }
    camAnim = { from: camera.position.clone(), fromT: controls.target.clone(), t: 0, spin: controls.autoRotate };
    setSpin(false);
    setOrtho(true, view.dist());
    camAnim.from = camera.position.clone(); camAnim.zoom0 = ortho.zoom;
  }
  function setSpin(on: boolean) {
    if (camAnim) camAnim.spin = on;
    controls.autoRotate = on; controls.autoRotateSpeed = 1.2;
    emit();
  }
  /** move the orbit target and the camera together by `d` (to follow a moving model); the user keeps orbiting */
  function track(d: THREE.Vector3) {
    controls.target.add(d); persp.position.add(d); ortho.position.add(d); view.target.add(d);
    if (camAnim) { camAnim.from.add(d); camAnim.fromT.add(d); }
  }
  // ── first-person view: drag looks round from where the model puts the head (easing back after a pause), wheel zooms ──
  const look = { yaw: 0, pitch: 0, idle: 0, fov: 60, drag: null as null | { x: number; y: number } };
  const eyeQ = new THREE.Quaternion(), lookQ = new THREE.Quaternion(), lookE = new THREE.Euler(0, 0, 0, 'YXZ');
  let locked = false, lockRefused = false;
  function setEye(s: EyeSpec | null) {
    if (s === eye) return;
    if (locked && !s?.lock) document.exitPointerLock();
    eye = s; look.yaw = look.pitch = 0; look.drag = null; look.idle = 0;
    if (s) { look.fov = eyeCam.fov = s.fov; eyeCam.near = s.near; eyeCam.far = s.far; eyeCam.aspect = vw / vh; eyeCam.updateProjectionMatrix(); }
    controls.enabled = !s;
    renderPass.camera = s ? eyeCam : camera;
    emit();
  }
  function placeEye(dt: number) {
    const s = eye!;
    s.pose(eyeCam.position, eyeQ);
    if (s.lock) eyeCam.quaternion.copy(eyeQ);
    else {
      if (!look.drag && (look.idle += dt) > 2.5) { const k = Math.min(1, dt * 1.6); look.yaw -= look.yaw * k; look.pitch -= look.pitch * k; }
      lookQ.setFromEuler(lookE.set(look.pitch, look.yaw, 0));
      eyeCam.quaternion.copy(eyeQ).multiply(lookQ);
    }
    if (!s.lock && eyeCam.fov !== look.fov) { eyeCam.fov = look.fov; eyeCam.updateProjectionMatrix(); }   // (with game controls the model zooms)
    eyeCam.updateMatrixWorld();
    s.frame?.(eyeCam, dt);
  }
  const onEyeMove = (e: PointerEvent) => {
    if (eye?.lock) {
      const c = (v: number) => THREE.MathUtils.clamp(v, -240, 240);        // some browsers spike on the first move
      if (locked) eye.lock.look(c(e.movementX), c(e.movementY));
      else if (look.drag) { eye.lock.look(e.clientX - look.drag.x, e.clientY - look.drag.y); look.drag = { x: e.clientX, y: e.clientY }; }
      return;
    }
    if (!eye || !look.drag) return;
    const k = THREE.MathUtils.degToRad(look.fov) / vh;          // one pixel of drag turns the view by one pixel's angle
    look.yaw = THREE.MathUtils.clamp(look.yaw + (e.clientX - look.drag.x) * k, -2.4, 2.4);
    look.pitch = THREE.MathUtils.clamp(look.pitch + (e.clientY - look.drag.y) * k, -1.2, 1.3);
    look.drag = { x: e.clientX, y: e.clientY }; look.idle = 0;
  };
  const onEyeEnd = () => { look.drag = null; };
  const onWheel = (e: WheelEvent) => {
    if (!eye) return;
    e.preventDefault();
    if (eye.lock) { eye.lock.wheel?.(e.deltaY); return; }
    look.fov = THREE.MathUtils.clamp(look.fov * Math.exp(e.deltaY * 0.0012), 22, 85);
  };
  // pointer lock: buttons come as mouse events (pointer events skip a second button pressed while one is held)
  const canvas = renderer.domElement;
  const onLockChange = () => { locked = document.pointerLockElement === canvas; if (locked) lockRefused = false; eye?.lock?.locked?.(locked); };
  const onLockError = () => { lockRefused = true; eye?.lock?.locked?.(false, true); };
  let pressAt: [number, number] | null = null;                // without a lock a drag looks, so the left button fires on release
  const onMouseDown = (e: MouseEvent) => {
    if (!eye?.lock) return;
    e.preventDefault();
    // other buttons (aiming) act at once, captured or not; the left button fires only once the pointer is captured
    if (locked || e.button !== 0) eye.lock.button(e.button, true);
    if (locked) return;
    if (lockRefused) { if (e.button === 0) pressAt = [e.clientX, e.clientY]; return; }
    try { const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined; p?.catch?.(onLockError); } catch { onLockError(); }
  };
  const onMouseUp = (e: MouseEvent) => {
    if (!eye?.lock) return;
    if (pressAt && e.button === 0) { const p = pressAt; pressAt = null; if (Math.hypot(e.clientX - p[0], e.clientY - p[1]) <= 5) eye.lock.button(0, true); }
    eye.lock.button(e.button, false);
  };
  const onMenu = (e: Event) => { if (eye?.lock) e.preventDefault(); };
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('pointerlockerror', onLockError);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('contextmenu', onMenu);       // (while captured it may target the document)

  function setView(v: ViewSpec) {
    view = v;
    controls.minDistance = v.min ?? 6; controls.maxDistance = v.max ?? 160;
    // clip planes follow the model's size, so a pistol and a warship both keep depth precision
    const d = v.dist();
    persp.near = ortho.near = Math.max(0.002, d * 0.004); persp.far = ortho.far = d * 20;
    persp.updateProjectionMatrix(); ortho.updateProjectionMatrix();
    controls.target.copy(v.target);
    camera.position.copy(v.target).addScaledVector(v.dir, v.dist());
    if (camera === ortho) { orthoH = v.dist() * fovK(); ortho.zoom = 1; orthoFrustum(); }
    controls.update();
  }

  // ── picking: a click (not a drag) on a part ──
  let pickRoot: THREE.Object3D | null = null;
  const pickers: Pick[] = [];
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down: [number, number] | null = null;
  const shown = (o: THREE.Object3D | null) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  const onDown = (e: PointerEvent) => {
    down = [e.clientX, e.clientY];
    if (eye) {
      look.drag = { x: e.clientX, y: e.clientY }; look.idle = 0;
      if (!locked) try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* a locked or synthetic pointer */ }
    }
  };
  const onUp = (e: PointerEvent) => {
    if (eye?.lock) return;                                   // game controls: clicks are buttons, not picks
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || !pickRoot) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, eye ? eyeCam : camera);
    const hit = ray.intersectObject(pickRoot, true).find(h => (h.object as THREE.Mesh).isMesh && !h.object.userData.outline && shown(h.object)) || null;
    let o: THREE.Object3D | null = hit ? hit.object : null;
    while (o && !o.userData.part) o = o.parent;
    pickers.forEach(f => f(o ? o.userData.part : null, hit));
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointermove', onEyeMove);
  renderer.domElement.addEventListener('pointerup', onEyeEnd);
  renderer.domElement.addEventListener('pointercancel', onEyeEnd);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

  // ── change notifications (view state for the UI) ──
  const listeners: (() => void)[] = [];
  function emit() { listeners.forEach(f => f()); }

  // ── frame loop ──
  const ticks: Tick[] = [];
  const tmpV = new THREE.Vector2();
  const ease = (t: number) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  let last = performance.now(), raf = 0, alive = true;
  function frame(now: number) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ticks.forEach(f => f(now, dt));
    if (eye) placeEye(dt);
    else if (camAnim) {
      if (camAnim.t === 0) { controls.autoRotate = false; controls.enableDamping = false; }
      camAnim.t = Math.min(1, camAnim.t + dt / 0.8); const k = ease(camAnim.t);
      controls.target.lerpVectors(camAnim.fromT, view.target, k);
      camera.position.lerpVectors(camAnim.from, view.target.clone().addScaledVector(view.dir, view.dist()), k);
      if (camera === ortho && camAnim.zoom0 !== undefined) { ortho.zoom = THREE.MathUtils.lerp(camAnim.zoom0, 1, k); ortho.updateProjectionMatrix(); }
      if (camAnim.t >= 1) { controls.enableDamping = true; controls.autoRotate = camAnim.spin; camAnim = null; emit(); }
    }
    if (!eye) controls.update(dt);
    applyWeight();
    const bufH = renderer.getDrawingBufferSize(tmpV).y;
    const pxScale = eye ? bufH / (2 * Math.tan(THREE.MathUtils.degToRad(eyeCam.fov / 2))) : camera === ortho ? bufH * ortho.zoom / orthoH : bufH / fovK();
    glowMats.forEach(m => { m.uniforms.scale.value = pxScale; });
    composer.render();
    raf = requestAnimationFrame(frame);
  }

  const ro = new ResizeObserver(() => {
    ({ w: vw, h: vh } = size());
    persp.aspect = eyeCam.aspect = vw / vh; persp.updateProjectionMatrix(); eyeCam.updateProjectionMatrix(); orthoFrustum();
    renderer.setSize(vw, vh); composer.setSize(vw, vh);
    const r = devRes();
    outlineMat.uniforms.res.value.copy(r); outlineAccentMat.uniforms.res.value.copy(r);
    [lineMat, majorMat, accentLineMat, accentMinorMat].forEach(m => m.resolution.copy(r));
    appliedKey = '';
  });
  ro.observe(host);

  function start() { setTheme(theme); controls.autoRotate = init.spin; controls.autoRotateSpeed = 1.2; raf = requestAnimationFrame(frame); }

  function dispose() {
    alive = false; cancelAnimationFrame(raf); ro.disconnect();
    renderer.domElement.removeEventListener('pointerdown', onDown);
    renderer.domElement.removeEventListener('pointerup', onUp);
    renderer.domElement.removeEventListener('pointermove', onEyeMove);
    renderer.domElement.removeEventListener('pointerup', onEyeEnd);
    renderer.domElement.removeEventListener('pointercancel', onEyeEnd);
    renderer.domElement.removeEventListener('wheel', onWheel);
    document.removeEventListener('pointerlockchange', onLockChange);
    document.removeEventListener('pointerlockerror', onLockError);
    canvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('contextmenu', onMenu);
    if (locked) document.exitPointerLock();
    controls.dispose();
    scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = ([] as THREE.Material[]).concat((m.material as THREE.Material | THREE.Material[]) || []);
      mats.forEach(x => { Object.values(x as unknown as Record<string, unknown>).forEach(v => { if (v instanceof THREE.Texture) v.dispose(); }); x.dispose(); });
    });
    composer.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }

  return {
    scene, renderer, controls, composer,
    /** the scene lights, for render styles that relight it (lib/real) */
    lights: { hemi, ambient, sun, fill },
    /** line and outline materials a selected part wears */
    accentLineMats: new Set<THREE.Material>([accentLineMat, accentMinorMat, outlineAccentMat]),
    /** the camera the frame is drawn with (the first-person one while it is on) */
    get camera() { return eye ? eyeCam : camera; },
    /** the orbit camera, even while the first-person view is on */
    get orbitCamera() { return camera; },
    get eye() { return eye !== null; }, setEye,
    /** the pointer is captured for game controls */
    get locked() { return locked; },
    /** add a post pass before tone mapping (bloom and the like) */
    addPreOutputPass(p: Pass) { composer.insertPass(p, 1); },
    mats: { body: bodyMat, recess: recessMat, pad: padMat, glass: glassMat, line: lineMat, major: majorMat },
    glowMat, glowPoints, softMat, fat, loopLine, hairline, highlight, screenMats, accentLights,
    accent, themeHooks, shadowStrength,
    get theme() { return theme; }, get accentId() { return accentId; },
    get spin() { return controls.autoRotate; }, get iso() { return camera === ortho; },
    setTheme, setAccent, setSpin, toggleIso, setOrtho, setView, track,
    get view() { return view; },
    setPickRoot(o: THREE.Object3D) { pickRoot = o; },
    onPick(f: Pick) { pickers.push(f); },
    onTick(f: Tick) { ticks.push(f); },
    onChange(f: () => void) { listeners.push(f); },
    start, dispose,
  };
}

export type Engine = ReturnType<typeof createEngine>;
