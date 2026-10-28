// The shapes of the shooter's hands, as signed-distance trees meshed by lib/range/sdf.ts. Pure computation, as a
// generator that yields every few milliseconds, so lib/range/hands.ts spreads it over frames (the page never waits on
// it) and turns the arrays it returns into meshes. Coordinates are the weapon root's (+z toward the muzzle, +y up, +x the weapon's left).
//
// Built as anatomy: metacarpal bones under the back of the hand, palm and heel pads, three jointed segments per finger
// with knuckles, thumbs with their fleshy base, all blended smoothly so they read as hands. They wear fingerless
// tactical gloves: stretch fabric over the back, darker reinforced finger and thumb panels that stop at a hem halfway
// along the middle segment, a moulded knuckle guard, a velcro wrist strap with its pull tab and a neoprene cuff; bare
// fingertips with nails show beyond the hems.
// The grip: the firing (right) hand's fingers wrap the front strap under the trigger guard, its index finger rests on
// the trigger, its thumb lies forward high on the left of the frame. On a pistol the support hand wraps over the
// firing fingers, its thumb forward beneath the firing thumb; on a rifle it holds the handguard from underneath,
// fingers curled up its right side, thumb along its left.
import * as THREE from 'three';
import { ellipsoid, meshSteps, roundCone, type Node } from './sdf';
import type { ForeGrip, PistolGrip } from './types';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const H = 0.0016;                                            // mesh resolution, metres
enum R { Glove, Panel, Guard, Strap, Skin, Nail }

/** one meshed piece, ready for a BufferGeometry: `aMat` is roughness, bump depth and skin sheen per vertex */
export interface MeshData { position: Float32Array; normal: Float32Array; uv: Float32Array; color: Float32Array; aMat: Float32Array; index: Uint32Array }
type P3 = [number, number, number];
export interface HandMeshes {
  index: MeshData; firing: MeshData; support: MeshData;
  /** the index finger's knuckle (its hinge) and the axis it curls about */
  knuckle: P3; curl: P3;
  /** each wrist: where the forearm starts and the way it runs (for the sleeves) */
  firingWrist: [P3, P3]; supportWrist: [P3, P3];
}

// ── finishes: colour, roughness, bump, sheen per region, so glove, guard, strap, skin and nail blend across a soft
// edge instead of a stair-step of whole triangles ──
const FINISH: Record<R, [number, number, number, number]> = {
  [R.Glove]: [0x3a3c3f, 0.93, 1, 0], [R.Panel]: [0x2b2b2c, 0.8, 0.55, 0], [R.Guard]: [0x151516, 0.58, 0.2, 0],
  [R.Strap]: [0x6e5c46, 0.96, 1.6, 0], [R.Skin]: [0xbf8a6d, 0.5, 0.16, 1], [R.Nail]: [0xc99583, 0.42, 0, 0.6],
};
function toData(g: THREE.BufferGeometry): MeshData {
  const reg = g.getAttribute('region'), ao = g.getAttribute('ao'), p = g.getAttribute('position'), n = reg.count;
  const color = new Float32Array(n * 3), aMat = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const rg = reg.getX(i) as R, [hex, rough, bump, sheen] = FINISH[rg];
    // wear: a slow mottling in the fabric (none on skin), then the contact shading
    const x = p.getX(i) * 260, y = p.getY(i) * 260, z = p.getZ(i) * 260;
    const wear = rg === R.Skin || rg === R.Nail ? 1 : 1 + 0.09 * Math.sin(x + Math.sin(y * 1.3)) * Math.sin(z * 0.8 + Math.sin(x * 0.7));
    c.setHex(hex).multiplyScalar(wear * ao.getX(i)); color.set([c.r, c.g, c.b], i * 3); aMat.set([rough, bump, sheen], i * 3);
  }
  const arr = (name: string) => new Float32Array((g.getAttribute(name) as THREE.BufferAttribute).array);
  return { position: arr('position'), normal: arr('normal'), uv: arr('uv'), color, aMat, index: new Uint32Array(g.getIndex()!.array) };
}

export function* handMeshes(G: PistolGrip, fore?: ForeGrip): Generator<void, HandMeshes> {
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
  const a0 = G.fingers ?? 0.004, sh = a0 - 0.004;
  const rMcp = [at(-0.012, 0.036, -0.024), at(0.004 + sh, 0.040, -0.025), at(0.022 + sh, 0.040, -0.025), at(0.040 + sh, 0.037, -0.023)];
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
  const rFingers = [a0, a0 + 0.018, a0 + 0.036].map((a, i) => {
    const s = [1, 0.95, 0.8][i], m = rMcp[i + 1];
    const P = [m, at(a, 0.064, 0.004), at(a, 0.055, 0.026), at(a, 0.040, 0.034)].map(p => m.clone().lerp(p, s));
    return digit(P, [0.0088, 0.0081, 0.0074, 0.0064].map(r => r * (i === 2 ? 0.92 : 1)), 1.45, rOut);
  });
  const fh = G.frameHalf, ty = G.thumbY, wz = G.web.z;
  const rThumb = digit([G.web.clone().add(V(0.004, 0.0105, -0.0152)), V(fh + 0.0078, ty - 0.001, wz + 0.0068), V(fh + 0.011, ty + 0.0038, wz + 0.0368), V(fh + 0.0098, ty + 0.0043, wz + 0.0598)], [0.011, 0.0098, 0.0089, 0.0077], 1.6, V(0.35, 1, 0).normalize(), 1);
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
  // the finger curls about the axis square to its own bend
  const curl = new THREE.Vector3().crossVectors(rPip.clone().sub(ri), tr.clone().sub(rPip)).normalize();

  // ═════ support hand (left, on +x) ═════
  const support = fore ? rifleSupport(fore) : pistolSupport();
  function pistolSupport() {                          // wrapping over the firing fingers
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
    return { node: lHand, carpal: lCarpal, dir: lDir };
  }
  /** under a rifle's handguard: palm beneath it, fingers curled up its right side, thumb forward along its left */
  function rifleSupport(Fg: ForeGrip) {
    const c = Fg.at, r = Fg.r, Z = V(0, 0, 1);
    const ring = (deg: number, rr: number, dz: number) => { const a = deg * Math.PI / 180; return V(c.x + rr * Math.cos(a), c.y + rr * Math.sin(a), c.z + dz); };
    const radial = (deg: number) => { const a = deg * Math.PI / 180; return V(Math.cos(a), Math.sin(a), 0); };
    const tangent = (deg: number) => { const a = deg * Math.PI / 180; return V(-Math.sin(a), Math.cos(a), 0); };
    const pad = (deg: number, rr: number, dz: number, radii: [number, number, number]) => ellipsoid(ring(deg, rr, dz), Z, tangent(deg), radial(deg), radii, R.Glove);
    const dzs = [0.026, 0.008, -0.01, -0.027], mcp = dzs.map(dz => ring(235, r + 0.0105, dz));
    const carpal = ring(298, r + 0.029, -0.05), dir = V(0.42, -0.4, -0.81).normalize();   // the forearm runs back toward the shooter
    const palm: Node = {
      op: 'smin', k: 0.011, kids: [
        pad(268, r + 0.015, 0, [0.04, 0.028, 0.0115]),              // palm under the handguard
        pad(282, r + 0.021, -0.032, [0.02, 0.017, 0.014]),          // heel
        pad(306, r + 0.018, -0.012, [0.022, 0.016, 0.014]),         // the thumb's fleshy base
        ...mcp.map((m, i) => roundCone(m, ring(294, r + 0.024, -0.036 + i * 0.004), 0.0092, 0.0082, R.Glove)),
      ],
    };
    const fingers = dzs.map((dz, i) => {
      const s = [0.95, 1, 0.95, 0.8][i], m = mcp[i];
      const P = [m, ring(184, r + 0.0098, dz + 0.003), ring(152, r + 0.0093, dz + 0.003), ring(130, r + 0.0088, dz + 0.001)].map(p => m.clone().lerp(p, s));
      return digit(P, [0.0088, 0.0081, 0.0074, 0.0064].map(q => q * (i === 3 ? 0.92 : 1)), 1.45, radial(160));
    });
    const thumb = digit([ring(306, r + 0.02, -0.012), ring(338, r + 0.0145, 0.008), ring(358, r + 0.0112, 0.036), ring(8, r + 0.0106, 0.058)], [0.0108, 0.0097, 0.0088, 0.0076], 1.6, radial(10), 1);
    const node: Node = {
      op: 'smin', k: 0.004, kids: [
        { op: 'smin', k: 0.012, kids: [{ op: 'smin', k: 0.006, kids: [palm, wrist(carpal, dir, radial(298))] }, thumb] },
        { op: 'min', k: 0, kids: fingers },
        guard(mcp[0], mcp[3], radial(235)),
      ],
    };
    return { node, carpal, dir };
  }

  const p3 = (v: THREE.Vector3): P3 => [v.x, v.y, v.z];
  return {
    index: toData(yield* meshSteps(rIndex, H * 0.85)), firing: toData(yield* meshSteps(rHand, H)), support: toData(yield* meshSteps(support.node, H)),
    knuckle: p3(ri), curl: p3(curl),
    firingWrist: [p3(rCarpal), p3(rDir)], supportWrist: [p3(support.carpal), p3(support.dir)],
  };
}

