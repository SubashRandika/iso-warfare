// The shooter's hands, in the weapon root's coordinates so they ride its recoil (shapes: lib/range/handshape.ts).
// Ranger-green sleeves with fabric folds run back from each wrist out of the view. The support hand and its sleeve
// are a group of their own, so the range can bring that hand up to the weapon or take it away (a pistol is carried
// in one hand until it is aimed).
// Speed: the hands are meshed the first time a weapon's range is built, a few milliseconds a frame (the range is built
// in the background as the real view comes on), and kept for the session (per weapon); their materials are shared and
// never disposed, so their shaders stay compiled from one weapon to the next.
// Real view only.
import * as THREE from 'three';
import { handMeshes, type HandMeshes, type MeshData } from './handshape';
import type { ForeGrip, PistolGrip } from './types';
import { share } from '../real/textures';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** grey noise or a weave, tiled per centimetre (the hand meshes carry 1 UV unit per cm) */
function bumpTexture(kind: 'weave' | 'noise') {
  const n = kind === 'weave' ? 32 : 64, c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d')!, img = x.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const px = i % n, py = Math.floor(i / n);
    let v = 128;
    if (kind === 'weave') v = 128 + 50 * Math.sin(px / n * Math.PI * 16) * Math.sin(py / n * Math.PI * 16) + (Math.random() - 0.5) * 30;
    else v = 60 + Math.random() * 140;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  t.repeat.setScalar(kind === 'weave' ? 3 : 2);
  return t;
}

/** a cloth sleeve round an axis: tapering, folded, bunched toward the wrist, with a rolled hem */
function sleeveGeometry(a: THREE.Vector3, dir: THREE.Vector3, len: number, r0: number, r1: number, seed: number) {
  const N = 30, S = 28, u = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)).normalize(), w = new THREE.Vector3().crossVectors(dir, u);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= N; j++) {
    const t = j / N, r = THREE.MathUtils.lerp(r0, r1, t) * (1 + 0.07 * Math.max(0, 1 - t * 18)), bunch = t < 0.3 ? 0.07 * Math.sin(t * 46) ** 2 * (1 - t / 0.3) : 0;
    for (let i = 0; i <= S; i++) {
      const th = i / S * Math.PI * 2;
      const k = 1 + 0.05 * Math.sin(3 * th + seed + t * 7) * (0.35 + 0.65 * (1 - t)) + 0.03 * Math.sin(5 * th - t * 13 + seed * 2) + bunch * (0.6 + 0.4 * Math.sin(2 * th + seed));
      const p = a.clone().addScaledVector(dir, len * t).addScaledVector(u, Math.cos(th) * r * k).addScaledVector(w, Math.sin(th) * r * k * 0.92);
      pos.push(p.x, p.y, p.z); uv.push(i / S * 6, t * len * 70);
    }
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < S; i++) { const q = j * (S + 1) + i; idx.push(q, q + S + 1, q + 1, q + 1, q + S + 1, q + S + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function geometry(m: MeshData) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.position, 3)); g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(m.color, 3));
  g.setAttribute('aMat', new THREE.BufferAttribute(m.aMat, 3)); g.setIndex(new THREE.BufferAttribute(m.index, 1));
  g.computeBoundingSphere();
  return g;
}

// ── one material for the hands: colour, roughness, bump depth and skin sheen come per vertex (aMat), plus the sleeves'
// cloth; shared by every weapon's hands for the session ──
let shared: { skin: THREE.MeshPhysicalMaterial; sleeve: THREE.MeshStandardMaterial; placeholder: THREE.BufferGeometry } | null = null;
function materials() {
  if (shared) return shared;
  const weave = share(bumpTexture('weave'));
  const skin = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 1, bumpMap: weave, bumpScale: 0.6, sheen: 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xff9c80) });
  skin.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aMat;\nvarying vec3 vMat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vMat;')
      .replace('#include <bumpmap_pars_fragment>', THREE.ShaderChunk.bumpmap_pars_fragment.replaceAll('bumpScale *', 'bumpScale * vMat.y *'))
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vMat.x;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_SHEEN\nmaterial.sheenColor *= vMat.z;\n#endif');
  };
  skin.customProgramCacheKey = () => 'range-hands';
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x4b4f3c, roughness: 0.97, bumpMap: weave, bumpScale: 0.5, side: THREE.DoubleSide });
  [skin, sleeve].forEach(m => { m.userData.realStyle = true; });
  // a degenerate triangle with the hand meshes' attributes: it stands in while they are meshed, so their shader can be
  // compiled with everything else
  const z = (n: number) => new Float32Array(3 * n);
  const placeholder = geometry({ position: z(3), normal: z(3), uv: new Float32Array(6), color: z(3), aMat: z(3), index: new Uint32Array([0, 1, 2]) });
  return shared = { skin, sleeve, placeholder };
}

// ── meshing: spread over frames, a few milliseconds each, once per weapon ──
type Built = { index: THREE.BufferGeometry; firing: THREE.BufferGeometry; support: THREE.BufferGeometry; firingSleeve: THREE.BufferGeometry; supportSleeve: THREE.BufferGeometry; knuckle: THREE.Vector3; curl: THREE.Vector3 };
const built = new Map<string, Promise<Built>>();
/** run a generator a slice at a time, one slice per frame (a timer stands in where frames are throttled) */
function sliced<T>(g: Generator<void, T>, budget = 6): Promise<T> {
  return new Promise(res => {
    let queued = false;
    const step = () => {
      if (!queued) return; queued = false;
      const t0 = performance.now();
      for (;;) { const r = g.next(); if (r.done) return res(r.value); if (performance.now() - t0 > budget) break; }
      next();
    };
    const next = () => { queued = true; requestAnimationFrame(step); setTimeout(step, 50); };
    next();
  });
}
const mesh = (G: PistolGrip, fore?: ForeGrip) => sliced(handMeshes(G, fore));
function build(key: string, G: PistolGrip, fore?: ForeGrip) {
  let b = built.get(key);
  if (!b) {
    b = mesh(G, fore).then(h => {
      const v = (p: number[]) => V(p[0], p[1], p[2]);
      const sleeve = ([c, d]: HandMeshes['firingWrist'], seed: number) => { const dir = v(d); return sleeveGeometry(v(c).addScaledVector(dir, 0.054), dir, 0.33, 0.0285, 0.046, seed); };
      return {
        index: geometry(h.index), firing: geometry(h.firing), support: geometry(h.support),
        firingSleeve: sleeve(h.firingWrist, 1.3), supportSleeve: sleeve(h.supportWrist, 4.1), knuckle: v(h.knuckle), curl: v(h.curl),
      };
    });
    built.set(key, b);
  }
  return b;
}

/** the hands for one weapon (`key` names it: its meshes are kept under that name) */
export function buildHands(key: string, G: PistolGrip, fore?: ForeGrip) {
  const M = materials();
  const group = new THREE.Group(); group.visible = false;
  const support = new THREE.Group(); group.add(support);
  const indexPivot = new THREE.Group(); group.add(indexPivot);
  const add = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D) => {
    const o = new THREE.Mesh(g, m); o.raycast = () => {}; o.castShadow = o.receiveShadow = false; parent.add(o); return o;
  };
  const stand = add(M.placeholder, M.skin, group);
  add(M.placeholder, M.sleeve, stand);
  const curl = V(1, 0, 0);
  let alive = true;
  const ready = build(key, G, fore).then(b => {
    if (!alive) return;
    stand.removeFromParent();
    indexPivot.position.copy(b.knuckle); curl.copy(b.curl);
    add(b.index, M.skin, indexPivot).position.copy(b.knuckle).negate();
    add(b.firing, M.skin, group); add(b.firingSleeve, M.sleeve, group);
    add(b.support, M.skin, support); add(b.supportSleeve, M.sleeve, support);
  });

  return {
    group,
    /** the support hand and its sleeve */
    support,
    /** settles once the meshes are in */
    ready,
    /** 0 = finger resting on the trigger, 1 = pressed through */
    pull(k: number) { indexPivot.quaternion.setFromAxisAngle(curl, k * 0.11); },
    /** the meshes and materials are kept for the session; this only stops a pending build from landing */
    dispose() { alive = false; group.removeFromParent(); },
  };
}
