// Organic shapes from signed distance fields: rounded cones (bones, finger segments) and oriented ellipsoids (palm
// pads), joined with smooth unions so they flow into each other like flesh over bone, then polygonised once with
// surface nets. Every primitive carries a material region (glove, skin, nail…); each vertex takes the region of the
// primitive nearest it, so one material can blend finishes across the surface without stair-stepped edges, and an
// ambient-occlusion value sampled from the field just off the surface (darker in creases).
// Speed: every group and primitive is skipped outside its bounding box, and the fine grid is only evaluated, meshed
// and stitched inside coarse cells the surface can pass through (a few per cent of the box).
import * as THREE from 'three';

type P3 = [number, number, number];
const BIG = 0.02;                                   // "far outside" for points beyond a primitive's box

export interface Prim {
  region: number;
  lo: P3; hi: P3;
  d(x: number, y: number, z: number): number;
}
/** a tree of primitives: hard unions keep fingers apart, smooth unions blend bone into palm */
export type Node = Prim | { op: 'min' | 'smin'; k: number; kids: Node[]; lo?: P3; hi?: P3 };

const isPrim = (n: Node): n is Prim => 'd' in n;
const smin = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

/** a cone with spherical ends: radius r1 at a, r2 at b (Inigo Quilez's exact round cone) */
export function roundCone(a: THREE.Vector3, b: THREE.Vector3, r1: number, r2: number, region: number, pad = 0.004): Prim {
  const bx = b.x - a.x, by = b.y - a.y, bz = b.z - a.z, l2 = bx * bx + by * by + bz * bz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  return {
    region,
    lo: [Math.min(a.x - r1, b.x - r2) - pad, Math.min(a.y - r1, b.y - r2) - pad, Math.min(a.z - r1, b.z - r2) - pad],
    hi: [Math.max(a.x + r1, b.x + r2) + pad, Math.max(a.y + r1, b.y + r2) + pad, Math.max(a.z + r1, b.z + r2) + pad],
    d(x, y, z) {
      const px = x - a.x, py = y - a.y, pz = z - a.z, yy = px * bx + py * by + pz * bz, zz = yy - l2;
      const qx = px * l2 - bx * yy, qy = py * l2 - by * yy, qz = pz * l2 - bz * yy, x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * l2, z2 = zz * zz * l2, k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    },
  };
}

/** an ellipsoid centred at c with semi-axes r along the unit axes u, v, w (a close approximation of the distance) */
export function ellipsoid(c: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, w: THREE.Vector3, r: P3, region: number, pad = 0.004): Prim {
  const ext = (i: 0 | 1 | 2) => Math.abs(u.getComponent(i)) * r[0] + Math.abs(v.getComponent(i)) * r[1] + Math.abs(w.getComponent(i)) * r[2] + pad;
  return {
    region,
    lo: [c.x - ext(0), c.y - ext(1), c.z - ext(2)], hi: [c.x + ext(0), c.y + ext(1), c.z + ext(2)],
    d(x, y, z) {
      const px = x - c.x, py = y - c.y, pz = z - c.z;
      const a = (px * u.x + py * u.y + pz * u.z) / r[0], b = (px * v.x + py * v.y + pz * v.z) / r[1], e = (px * w.x + py * w.y + pz * w.z) / r[2];
      const k0 = Math.sqrt(a * a + b * b + e * e), k1 = Math.sqrt((a / r[0]) ** 2 + (b / r[1]) ** 2 + (e / r[2]) ** 2);
      return k1 < 1e-9 ? -Math.min(...r) : k0 * (k0 - 1) / k1;
    },
  };
}

function evalNode(n: Node, x: number, y: number, z: number): number {
  // a whole group is skipped when the point is outside its box (bounds() sets the boxes before meshing)
  if (x < n.lo![0] || y < n.lo![1] || z < n.lo![2] || x > n.hi![0] || y > n.hi![1] || z > n.hi![2]) return BIG;
  if (isPrim(n)) return n.d(x, y, z);
  let d = evalNode(n.kids[0], x, y, z);
  for (let i = 1; i < n.kids.length; i++) { const e = evalNode(n.kids[i], x, y, z); d = n.op === 'min' ? Math.min(d, e) : smin(d, e, n.k); }
  return d;
}
function bounds(n: Node): void {
  if (isPrim(n)) return;
  n.kids.forEach(bounds);
  n.lo = [0, 1, 2].map(i => Math.min(...n.kids.map(k => k.lo![i]))) as P3;
  n.hi = [0, 1, 2].map(i => Math.max(...n.kids.map(k => k.hi![i]))) as P3;
}
function leaves(n: Node, out: Prim[] = []): Prim[] { if (isPrim(n)) out.push(n); else n.kids.forEach(k => leaves(k, out)); return out; }

/** polygonise the tree's surface at grid spacing h; each vertex carries its region in the `region` attribute */
export function meshSDF(root: Node, h: number) {
  bounds(root);
  const prims = leaves(root);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p.lo[i]); hi[i] = Math.max(hi[i], p.hi[i]); }
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 2, ny = Math.ceil((hi[1] - lo[1]) / h) + 2, nz = Math.ceil((hi[2] - lo[2]) / h) + 2;
  const ox = lo[0] - h * 0.5, oy = lo[1] - h * 0.5, oz = lo[2] - h * 0.5;
  const F = new Float32Array(nx * ny * nz), at = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  // coarse first (every 4th point): only coarse cells the surface can pass through ("hot") are evaluated finely,
  // meshed and stitched; the rest of the box is never visited
  const c = 4, cx = Math.ceil((nx - 1) / c) + 1, cy = Math.ceil((ny - 1) / c) + 1, cz = Math.ceil((nz - 1) / c) + 1;
  const Gc = new Float32Array(cx * cy * cz), gat = (i: number, j: number, k: number) => i + cx * (j + cy * k);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) Gc[gat(i, j, k)] = evalNode(root, ox + i * c * h, oy + j * c * h, oz + k * c * h);
  const near = c * h * 1.05;                                   // more than the half-diagonal of a coarse cell
  const hot: number[] = [], done = new Uint8Array(nx * ny * nz);
  for (let K = 0; K < cz - 1; K++) for (let J = 0; J < cy - 1; J++) for (let I = 0; I < cx - 1; I++) {
    let h8 = false;
    for (let q = 0; q < 8 && !h8; q++) h8 = Math.abs(Gc[gat(I + (q & 1), J + ((q >> 1) & 1), K + (q >> 2))]) < near;
    if (!h8) continue;
    hot.push(I, J, K);
    for (let k = K * c; k <= Math.min(nz - 1, K * c + c); k++) for (let j = J * c; j <= Math.min(ny - 1, J * c + c); j++) for (let i = I * c; i <= Math.min(nx - 1, I * c + c); i++) {
      const q = at(i, j, k); if (done[q]) continue; done[q] = 1; F[q] = evalNode(root, ox + i * h, oy + j * h, oz + k * h);
    }
  }
  /** every fine cell (or grid point) of the hot coarse cells */
  const eachHot = (f: (i: number, j: number, k: number) => void) => {
    for (let n = 0; n < hot.length; n += 3) {
      const I = hot[n] * c, J = hot[n + 1] * c, K = hot[n + 2] * c;
      for (let k = K; k < Math.min(nz - 1, K + c); k++) for (let j = J; j < Math.min(ny - 1, J + c); j++) for (let i = I; i < Math.min(nx - 1, I + c); i++) f(i, j, k);
    }
  };

  // one vertex per cell the surface passes through, at the mean of its edge crossings
  const cell = new Int32Array(nx * ny * nz).fill(-1), pos: number[] = [];
  const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  eachHot((i, j, k) => {
    let mask = 0;
    for (let q = 0; q < 8; q++) { v[q] = F[at(i + C[q][0], j + C[q][1], k + C[q][2])]; if (v[q] < 0) mask |= 1 << q; }
    if (mask === 0 || mask === 255) return;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      sx += C[a][0] + (C[b][0] - C[a][0]) * t; sy += C[a][1] + (C[b][1] - C[a][1]) * t; sz += C[a][2] + (C[b][2] - C[a][2]) * t; n++;
    }
    cell[at(i, j, k)] = pos.length / 3;
    pos.push(ox + (i + sx / n) * h, oy + (j + sy / n) * h, oz + (k + sz / n) * h);
  });
  // a quad round every grid edge the surface crosses
  const tris: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) tris.push(a, c, b, a, d, c); else tris.push(a, b, c, a, c, d);
  };
  eachHot((i, j, k) => {
    if (i < 1 || j < 1 || k < 1) return;
    const s = F[at(i, j, k)] < 0;
    if (s !== (F[at(i + 1, j, k)] < 0)) quad(cell[at(i, j - 1, k - 1)], cell[at(i, j, k - 1)], cell[at(i, j, k)], cell[at(i, j - 1, k)], !s);
    if (s !== (F[at(i, j + 1, k)] < 0)) quad(cell[at(i - 1, j, k - 1)], cell[at(i - 1, j, k)], cell[at(i, j, k)], cell[at(i, j, k - 1)], !s);
    if (s !== (F[at(i, j, k + 1)] < 0)) quad(cell[at(i - 1, j - 1, k)], cell[at(i, j - 1, k)], cell[at(i, j, k)], cell[at(i - 1, j, k)], !s);
  });

  // settle each vertex onto the true surface, take its normal from the field, and its region from the nearest primitive
  const nv = pos.length / 3, nrm = new Float32Array(nv * 3), reg = new Uint8Array(nv), ao = new Float32Array(nv), e = h * 0.35;
  const f = (x: number, y: number, z: number) => evalNode(root, x, y, z);
  for (let q = 0; q < nv; q++) {
    let x = pos[q * 3], y = pos[q * 3 + 1], z = pos[q * 3 + 2];
    const d = f(x, y, z), gx = f(x + e, y, z) - d, gy = f(x, y + e, z) - d, gz = f(x, y, z + e) - d;
    const gl = Math.hypot(gx, gy, gz) || 1;
    x -= d * gx / gl; y -= d * gy / gl; z -= d * gz / gl;
    nrm[q * 3] = gx / gl; nrm[q * 3 + 1] = gy / gl; nrm[q * 3 + 2] = gz / gl;
    pos[q * 3] = x; pos[q * 3 + 1] = y; pos[q * 3 + 2] = z;
    let best = Infinity, r = 0;
    for (const p of prims) {
      if (x < p.lo[0] || y < p.lo[1] || z < p.lo[2] || x > p.hi[0] || y > p.hi[1] || z > p.hi[2]) continue;
      const d = Math.abs(p.d(x, y, z)); if (d < best) { best = d; r = p.region; }
    }
    reg[q] = r;
    // contact shading: how much of the space just off the surface the shape itself fills (creases, under the thumb)
    let occ = 0;
    for (let i = 1; i <= 4; i++) { const t = i * 0.0024; occ += (t - f(x + nrm[q * 3] * t, y + nrm[q * 3 + 1] * t, z + nrm[q * 3 + 2] * t)) / (1 << i); }
    ao[q] = Math.min(1, Math.max(0.3, 1 - occ * 60));
  }
  // triangles, each turned to face out (the field's gradient says which way that is)
  const index: number[] = [];
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const wx = pos[c * 3] - pos[a * 3], wy = pos[c * 3 + 1] - pos[a * 3 + 1], wz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
    const out = fx * (nrm[a * 3] + nrm[b * 3] + nrm[c * 3]) + fy * (nrm[a * 3 + 1] + nrm[b * 3 + 1] + nrm[c * 3 + 1]) + fz * (nrm[a * 3 + 2] + nrm[b * 3 + 2] + nrm[c * 3 + 2]) >= 0;
    if (out) index.push(a, b, c); else index.push(a, c, b);
  }
  // box-projected UVs, 1 unit per centimetre, for fabric, leather and skin detail
  const uv = new Float32Array(nv * 2);
  for (let q = 0; q < nv; q++) {
    const ax = Math.abs(nrm[q * 3]), ay = Math.abs(nrm[q * 3 + 1]), az = Math.abs(nrm[q * 3 + 2]);
    const [s, t] = ax >= ay && ax >= az ? [pos[q * 3 + 2], pos[q * 3 + 1]] : ay >= az ? [pos[q * 3], pos[q * 3 + 2]] : [pos[q * 3], pos[q * 3 + 1]];
    uv[q * 2] = s * 100; uv[q * 2 + 1] = t * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('region', new THREE.BufferAttribute(reg, 1));
  g.setAttribute('ao', new THREE.BufferAttribute(ao, 1));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}
