// A flight deck for the pilot's view of an aircraft whose crew stations aren't otherwise modelled (the bombers): the
// inside of the skin with the windows left open, bulkheads and a floor, built from the airframe's own surface so the
// openings line up with the window panes outside. It is drawn only from the seat, so it needs no outside finish.
import * as THREE from 'three';
import type { CockpitMats } from './cockpit';

/** grid lines from a to b at most `step` apart, through every edge in `edges` that falls inside */
export function gridLines(a: number, b: number, step: number, edges: number[]) {
  const set = [a, b, ...edges.filter(e => e > a && e < b)].sort((p, q) => p - q), out: number[] = [];
  for (let i = 0; i < set.length - 1; i++) {
    const n = Math.max(1, Math.ceil((set[i + 1] - set[i]) / step));
    for (let j = 0; j < n; j++) out.push(set[i] + (set[i + 1] - set[i]) * j / n);
  }
  out.push(b);
  return out.filter((v, i) => i === 0 || v - out[i - 1] > 1e-6);
}

/**
 * The inside of a surface pt(u, v) over a grid, with window rectangles [u0, u1, v0, v1] left open (a cell is left out
 * when its centre is inside one, or when `cut` says so). Faces wind so the normal is (∂p/∂u) × (∂p/∂v).
 */
export function shellWithWindows(pt: (u: number, v: number) => THREE.Vector3, us: number[], vs: number[], holes: [number, number, number, number][], cut?: (u: number, v: number) => boolean) {
  const pos: number[] = [];
  const push = (...ps: THREE.Vector3[]) => ps.forEach(p => pos.push(p.x, p.y, p.z));
  for (let i = 0; i < us.length - 1; i++) for (let j = 0; j < vs.length - 1; j++) {
    const uc = (us[i] + us[i + 1]) / 2, vc = (vs[j] + vs[j + 1]) / 2;
    if (cut?.(uc, vc) || holes.some(([u0, u1, v0, v1]) => uc > Math.min(u0, u1) && uc < Math.max(u0, u1) && vc > Math.min(v0, v1) && vc < Math.max(v0, v1))) continue;
    const a = pt(us[i], vs[j]), b = pt(us[i + 1], vs[j]), c = pt(us[i + 1], vs[j + 1]), d = pt(us[i], vs[j + 1]);
    push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}

/** a closed outline filled as a fan from its centroid (bulkheads, floors): fine for outlines that are star-shaped about it */
export function fan(pts: THREE.Vector3[]) {
  const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pts.length), pos: number[] = [];
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; pos.push(c.x, c.y, c.z, a.x, a.y, a.z, b.x, b.y, b.z); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}

/** a control yoke: a column from the floor and a ram's-horn wheel facing the pilot (aft, −z); origin on the floor */
export function yoke(M: CockpitMats, h = 0.72) {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; g.add(o); return o; };
  add(new THREE.BoxGeometry(0.08, 0.06, 0.16), M.frame, 0, 0.03, 0);                                   // floor boot
  add(new THREE.CylinderGeometry(0.03, 0.035, h, 10), M.frame, 0, h / 2, 0.02, -0.18);                // column, leaning aft
  const top = new THREE.Vector3(0, h, -0.04);
  add(new THREE.BoxGeometry(0.05, 0.05, 0.12), M.frame, top.x, top.y, top.z - 0.04);                  // hub
  const horn = new THREE.TorusGeometry(0.15, 0.016, 8, 24, Math.PI * 1.1);                              // grips round the bottom
  add(horn.rotateZ(Math.PI * 0.95), M.grip, top.x, top.y + 0.02, top.z - 0.11);
  add(new THREE.BoxGeometry(0.3, 0.035, 0.03), M.grip, top.x, top.y + 0.02, top.z - 0.11);              // cross bar
  return g;
}
