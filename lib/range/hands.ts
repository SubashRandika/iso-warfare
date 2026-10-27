// The shooter's hands in a two-handed pistol grip, in the weapon root's coordinates so they ride its recoil.
// Built as anatomy: metacarpal bones under the back of the hand, palm and heel pads, three jointed segments per
// finger with knuckles, thumbs with their fleshy base, all blended smoothly (lib/range/sdf.ts) so they read as hands.
// They wear fingerless tactical gloves: stretch fabric over the back, darker reinforced finger and thumb panels that
// stop at a hem halfway along the middle segment, a moulded knuckle guard, a velcro wrist strap with its pull tab and
// a neoprene cuff; bare fingertips with nails show beyond the hems. Ranger-green sleeves with fabric folds run back
// out of the view.
// The grip: the firing (right) hand's fingers wrap the front strap under the trigger guard, its index finger rests
// on the trigger (and presses it on each shot, `pull`), its thumb lies forward high on the left of the frame; the
// support hand wraps over the firing fingers, its thumb forward beneath the firing thumb. Real view only.
import * as THREE from 'three';
import { ellipsoid, meshSDF, roundCone, type Node } from './sdf';
import type { PistolGrip } from './types';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const H = 0.0016;                                            // mesh resolution, metres
enum R { Glove, Panel, Guard, Strap, Skin, Nail }

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

export function buildHands(G: PistolGrip) {
  const group = new THREE.Group(); group.visible = false;

  // ── the grip's frame: a down the grip, b forward across it (backstrap to front strap), x across (+x = the pistol's left) ──
  const X = V(1, 0, 0), D = G.down.clone().normalize(), F = new THREE.Vector3().crossVectors(D, X).normalize();
  const at = (a: number, b: number, x: number) => G.web.clone().addScaledVector(D, a).addScaledVector(F, b).addScaledVector(X, x);

  /** a finger or thumb through its joints (base, two middle joints, tip) with a radius at each; the glove runs to
   *  `glove` (in segments: 1.45 = 45 % along the second), then a hem, bare skin and a nail */
  function digit(P: THREE.Vector3[], r: number[], glove: number, hint: THREE.Vector3, padSeg = 0): Node {
    const kids: Node[] = [], hems: Node[] = [];
    const seg = (s: number, t0: number, t1: number, region: number, grow = 0) => {
      const a = P[s].clone().lerp(P[s + 1], t0), b = P[s].clone().lerp(P[s + 1], t1);
      kids.push(roundCone(a, b, THREE.MathUtils.lerp(r[s], r[s + 1], t0) + grow, THREE.MathUtils.lerp(r[s], r[s + 1], t1) + grow, region));
    };
    for (let s = 0; s < 3; s++) {
      const g0 = glove - s;
      if (g0 >= 1) seg(s, 0, 1, R.Panel, 0.0006);
      else if (g0 <= 0) seg(s, 0, 1, R.Skin);
      else {
        seg(s, 0, g0, R.Panel, 0.0006); seg(s, g0, 1, R.Skin);
        const q = P[s].clone().lerp(P[s + 1], g0), dir = P[s + 1].clone().sub(P[s]).normalize(), rq = THREE.MathUtils.lerp(r[s], r[s + 1], g0) + 0.0013;
        hems.push(roundCone(q.clone().addScaledVector(dir, -0.0022), q.clone().addScaledVector(dir, 0.0004), rq, rq, R.Panel));   // the hem
      }
    }
    // the back of the finger: knuckle bumps over the joints and the nail on the last segment
    const bend = P[2].clone().sub(P[1]).normalize().sub(P[1].clone().sub(P[0]).normalize());
    const back = (s: number) => {
      const dir = P[s + 1].clone().sub(P[s]).normalize();
      const b = bend.lengthSq() > 0.01 ? bend.clone().negate() : hint.clone();
      return b.addScaledVector(dir, -b.dot(dir)).normalize();
    };
    for (const s of [1, 2]) {
      const n = back(s), dir = P[s + 1].clone().sub(P[s]).normalize(), rr = r[s];
      kids.push(ellipsoid(P[s].clone().addScaledVector(n, rr * 0.22), dir, new THREE.Vector3().crossVectors(n, dir), n, [rr * 0.7, rr * 0.9, rr * 0.72], s < glove ? R.Panel : R.Skin));
    }
    { // the moulded pad over the knuckle segment
      const n = back(padSeg), dir = P[padSeg + 1].clone().sub(P[padSeg]).normalize(), len = P[padSeg].distanceTo(P[padSeg + 1]), rr = r[padSeg];
      hems.push(ellipsoid(P[padSeg].clone().lerp(P[padSeg + 1], 0.5).addScaledVector(n, rr * 0.86), dir, new THREE.Vector3().crossVectors(n, dir), n, [len * 0.3, rr * 0.62, rr * 0.3], R.Guard));
    }
    const n = back(2), dir = P[3].clone().sub(P[2]).normalize(), rm = (r[2] + r[3]) / 2;
    const finger: Node = { op: 'smin', k: 0.0034, kids };
    // the nail plate lies on the fingertip, just proud of the skin
    const nail = ellipsoid(P[2].clone().lerp(P[3], 0.62).addScaledVector(n, rm * 0.84), dir, new THREE.Vector3().crossVectors(n, dir), n, [rm * 0.82, rm * 0.62, rm * 0.22], R.Nail);
    return { op: 'smin', k: 0.0012, kids: [{ op: 'smin', k: 0.0009, kids: [finger, ...hems] }, nail] };
  }
  /** a wrist: glove, the velcro strap with its pull tab, the neoprene cuff */
  function wrist(c: THREE.Vector3, dir: THREE.Vector3, out: THREE.Vector3): Node {
    const p = (t: number) => c.clone().addScaledVector(dir, t);
    const o = out.clone().addScaledVector(dir, -out.dot(dir)).normalize(), side = new THREE.Vector3().crossVectors(dir, o).normalize();
    return {
      op: 'min', k: 0, kids: [
        { op: 'smin', k: 0.002, kids: [roundCone(p(-0.004), p(0.03), 0.0205, 0.0228, R.Glove), roundCone(p(0.048), p(0.064), 0.0246, 0.0262, R.Glove)] },
        { op: 'smin', k: 0.0015, kids: [roundCone(p(0.03), p(0.048), 0.0249, 0.0259, R.Strap), ellipsoid(p(0.039).addScaledVector(o, 0.0256), dir, side, o, [0.0078, 0.0092, 0.0021], R.Guard)] },
      ],
    };
  }
  /** the moulded guard across the knuckles, standing off the back of the hand */
  const guard = (a: THREE.Vector3, b: THREE.Vector3, out: THREE.Vector3) =>
    roundCone(a.clone().addScaledVector(out, 0.0078), b.clone().addScaledVector(out, 0.0075), 0.0052, 0.0047, R.Guard);

  // ═════ firing hand (right, on −x) ═════
  const rOut = V(-1, 0, 0);
  const rDir = V(-0.09, -0.2, -0.33).normalize();
  const rMcp = [at(-0.012, 0.036, -0.024), at(0.004, 0.040, -0.025), at(0.022, 0.040, -0.025), at(0.040, 0.037, -0.023)];
  const rCarpal = at(0.058, -0.012, -0.019);
  const rPalm: Node = {
    op: 'smin', k: 0.011, kids: [
      ellipsoid(at(0.03, 0.012, -0.021), D, F, X, [0.036, 0.03, 0.011], R.Glove),                       // palm under the back of the hand
      ellipsoid(at(0.055, -0.006, -0.02), D, F, X, [0.018, 0.016, 0.014], R.Glove),                     // heel
      ellipsoid(at(0.014, -0.011, -0.006), D, F, X, [0.019, 0.0095, 0.015], R.Glove),                   // the thumb's fleshy base, behind the backstrap
      ellipsoid(at(-0.002, -0.005, -0.007), D, F, X, [0.011, 0.0085, 0.011], R.Glove),                  // the web under the beavertail
      ...rMcp.map((m, i) => roundCone(m, at(0.04 + i * 0.007, -0.012 + i * 0.004, -0.022), 0.0092, 0.0082, R.Glove)),   // metacarpals
      roundCone(rMcp[0], rMcp[0].clone().addScaledVector(F, 0.002), 0.0096, 0.0096, R.Panel),           // the index knuckle the finger leaves
    ],
  };
  const rFingers = [0.004, 0.022, 0.040].map((a, i) => {
    const s = [1, 0.95, 0.8][i], m = rMcp[i + 1];
    const P = [m, at(a, 0.064, 0.004), at(a, 0.055, 0.026), at(a, 0.040, 0.034)].map(p => m.clone().lerp(p, s));
    return digit(P, [0.0088, 0.0081, 0.0074, 0.0064].map(r => r * (i === 2 ? 0.92 : 1)), 1.45, rOut);
  });
  const rThumb = digit([V(0.004, 0.076, -0.008), V(0.020, 0.090, 0.014), V(0.0232, 0.0948, 0.044), V(0.022, 0.0953, 0.067)], [0.011, 0.0098, 0.0089, 0.0077], 1.6, V(0.35, 1, 0).normalize(), 1);
  const rHand: Node = {
    op: 'smin', k: 0.004, kids: [
      { op: 'smin', k: 0.012, kids: [{ op: 'smin', k: 0.006, kids: [rPalm, wrist(rCarpal, rDir, rOut)] }, rThumb] },
      { op: 'min', k: 0, kids: rFingers },
      guard(rMcp[0], rMcp[3], rOut),
    ],
  };
  // the index finger, on its own hinge at the knuckle so it can press the trigger
  const tr = G.trigger, ri = rMcp[0], rPip = V(-G.frameHalf - 0.0093, tr.y - 0.0006, (ri.z + tr.z) / 2 + 0.012);
  const rIndex = digit([ri, rPip, V(-0.009, tr.y - 0.0006, tr.z + 0.0103), V(0.0006, tr.y - 0.0013, tr.z + 0.0113)], [0.0086, 0.0079, 0.0072, 0.0063], 1.45, V(0, 1, 0));

  // ═════ support hand (left, on +x), wrapping over the firing fingers ═════
  const lOut = V(1, 0, 0);
  const lDir = V(0.12, -0.2, -0.33).normalize();
  const lA = [0.0, 0.0175, 0.035, 0.051], lMcp = lA.map(a => at(a, 0.058, 0.040));
  const lCarpal = at(0.066, 0.02, 0.046);
  const lPalm: Node = {
    op: 'smin', k: 0.011, kids: [
      ellipsoid(at(0.032, 0.036, 0.042), D, F, X, [0.036, 0.032, 0.011], R.Glove),
      ellipsoid(at(0.058, 0.02, 0.044), D, F, X, [0.018, 0.016, 0.014], R.Glove),
      ellipsoid(at(0.01, 0.024, 0.038), D, F, X, [0.02, 0.016, 0.014], R.Glove),
      ...lMcp.map((m, i) => roundCone(m, at(0.05 + i * 0.006, 0.012 + i * 0.002, 0.046), 0.0092, 0.0082, R.Glove)),
    ],
  };
  const lFingers = lA.map((a, i) => {
    const s = [0.93, 1, 0.95, 0.8][i], m = lMcp[i];
    const P = [m, at(a, 0.083, 0.010), at(a, 0.077, -0.016), at(a, 0.063, -0.031)].map(p => m.clone().lerp(p, s));
    return digit(P, [0.0088, 0.0081, 0.0074, 0.0064].map(r => r * (i === 3 ? 0.92 : 1)), 1.45, lOut);
  });
  const lThumb = digit([V(0.036, 0.058, 0.03), V(0.032, 0.0735, 0.052), V(0.0295, 0.0792, 0.08), V(0.028, 0.0808, 0.103)], [0.0108, 0.0097, 0.0088, 0.0076], 1.6, V(0.45, 1, 0).normalize(), 1);
  const lHand: Node = {
    op: 'smin', k: 0.004, kids: [
      { op: 'smin', k: 0.012, kids: [{ op: 'smin', k: 0.006, kids: [lPalm, wrist(lCarpal, lDir, lOut)] }, lThumb] },
      { op: 'min', k: 0, kids: lFingers },
      guard(lMcp[0], lMcp[3], lOut),
    ],
  };

  // ── one material for the hands: colour, roughness, bump depth and skin sheen come per vertex from the region, so
  // glove, guard, strap, skin and nail blend across a soft edge instead of a stair-step of whole triangles ──
  const FINISH: Record<R, [number, number, number, number]> = {           // colour, roughness, bump, sheen
    [R.Glove]: [0x3a3c3f, 0.93, 1, 0], [R.Panel]: [0x2b2b2c, 0.8, 0.55, 0], [R.Guard]: [0x151516, 0.58, 0.2, 0],
    [R.Strap]: [0x6e5c46, 0.96, 1.6, 0], [R.Skin]: [0xbf8a6d, 0.5, 0.16, 1], [R.Nail]: [0xc99583, 0.42, 0, 0.6],
  };
  const finish = (g: THREE.BufferGeometry) => {
    const reg = g.getAttribute('region'), ao = g.getAttribute('ao'), p = g.getAttribute('position'), n = reg.count;
    const col = new Float32Array(n * 3), mat = new Float32Array(n * 3), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const rg = reg.getX(i) as R, [hex, rough, bump, sheen] = FINISH[rg];
      // wear: a slow mottling in the fabric (none on skin), then the contact shading
      const x = p.getX(i) * 260, y = p.getY(i) * 260, z = p.getZ(i) * 260;
      const wear = rg === R.Skin || rg === R.Nail ? 1 : 1 + 0.09 * Math.sin(x + Math.sin(y * 1.3)) * Math.sin(z * 0.8 + Math.sin(x * 0.7));
      c.setHex(hex).multiplyScalar(wear * ao.getX(i)); col.set([c.r, c.g, c.b], i * 3); mat.set([rough, bump, sheen], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aMat', new THREE.BufferAttribute(mat, 3));
    g.deleteAttribute('region'); g.deleteAttribute('ao');
    return g;
  };
  const tex = { weave: bumpTexture('weave') };
  const skinMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 1, bumpMap: tex.weave, bumpScale: 0.6, sheen: 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xff9c80) });
  skinMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aMat;\nvarying vec3 vMat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vMat;')
      .replace('#include <bumpmap_pars_fragment>', THREE.ShaderChunk.bumpmap_pars_fragment.replaceAll('bumpScale *', 'bumpScale * vMat.y *'))
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vMat.x;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_SHEEN\nmaterial.sheenColor *= vMat.z;\n#endif');
  };
  skinMat.customProgramCacheKey = () => 'range-hands';
  const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x4b4f3c, roughness: 0.97, bumpMap: tex.weave, bumpScale: 0.5, side: THREE.DoubleSide });
  const mats = [skinMat, sleeveMat];
  mats.forEach(m => { m.userData.realStyle = true; });

  const add = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = group) => {
    const o = new THREE.Mesh(g, m); o.raycast = () => {}; o.castShadow = o.receiveShadow = false; parent.add(o); return o;
  };
  // each hand is meshed in its own task, so building never holds the page for long; they appear as they finish
  const indexPivot = new THREE.Group(); indexPivot.position.copy(ri); group.add(indexPivot);
  let alive = true;
  const jobs = [
    () => add(finish(meshSDF(rIndex, H * 0.85)), skinMat, indexPivot).position.copy(ri).negate(),
    () => add(finish(meshSDF(rHand, H)), skinMat),
    () => add(finish(meshSDF(lHand, H)), skinMat),
  ];
  const next = () => { const j = jobs.shift(); if (!j || !alive) return; j(); setTimeout(next, 0); };
  setTimeout(next, 0);
  // the finger curls about the axis square to its own bend
  const curlAxis = new THREE.Vector3().crossVectors(rPip.clone().sub(ri), tr.clone().sub(rPip)).normalize();
  for (const [c, dir, seed] of [[rCarpal, rDir, 1.3], [lCarpal, lDir, 4.1]] as const) {
    add(sleeveGeometry(c.clone().addScaledVector(dir, 0.054), dir, 0.33, 0.0285, 0.046, seed), sleeveMat);
  }

  return {
    group,
    /** 0 = finger resting on the trigger, 1 = pressed through */
    pull(k: number) { indexPivot.quaternion.setFromAxisAngle(curlAxis, k * 0.11); },
    dispose() {
      alive = false;
      group.traverse(o => (o as THREE.Mesh).geometry?.dispose());
      mats.forEach(m => m.dispose()); Object.values(tex).forEach(t => t.dispose());
    },
  };
}
