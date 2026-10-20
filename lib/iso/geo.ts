// Faceted solids for hairline figures: lofts through cross-section rings and thin aerofoil slabs.
// Every triangle is wound to face away from a reference point inside the solid, so normals (and the silhouette
// shell built from them) always point outward.
import * as THREE from 'three';

type V = THREE.Vector3;
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpN = new THREE.Vector3(), tmpM = new THREE.Vector3();

export const centroid = (pts: V[]) => pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pts.length);

export class Geo {
  pos: number[] = [];
  tri(a: V, b: V, c: V, ref: V) {
    tmpN.crossVectors(tmpA.subVectors(b, a), tmpB.subVectors(c, a));
    if (tmpN.lengthSq() < 1e-12) return;                        // drop degenerate faces (pointed noses, sharp edges)
    tmpM.copy(a).add(b).add(c).divideScalar(3).sub(ref);
    if (tmpN.dot(tmpM) < 0) [b, c] = [c, b];
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  quad(a: V, b: V, c: V, d: V, ref: V) { this.tri(a, b, c, ref); this.tri(a, c, d, ref); }
  /** Fan a (roughly planar, convex) polygon; ref is a point on the inside. */
  cap(pts: V[], ref: V) { const c = centroid(pts); for (let i = 0; i < pts.length; i++) this.tri(c, pts[i], pts[(i + 1) % pts.length], ref); }
  /** One-sided polygon (no inside): wound toward `up`. */
  sheet(pts: V[], up: V) { const c = centroid(pts), ref = c.clone().sub(up); for (let i = 0; i < pts.length; i++) this.tri(c, pts[i], pts[(i + 1) % pts.length], ref); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/** Loft through closed rings (all rings have the same point count). */
export function loft(rings: V[][], opts: { capStart?: boolean; capEnd?: boolean; open?: boolean; into?: Geo } = {}) {
  const g = opts.into ?? new Geo();
  const cs = rings.map(centroid);
  for (let i = 0; i < rings.length - 1; i++) {
    const r0 = rings[i], r1 = rings[i + 1], ref = cs[i].clone().add(cs[i + 1]).multiplyScalar(0.5);
    const n = opts.open ? r0.length - 1 : r0.length;
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % r0.length;
      g.quad(r0[j], r0[k], r1[k], r1[j], ref);
    }
  }
  if (opts.capStart) g.cap(rings[0], cs[Math.min(1, cs.length - 1)]);
  if (opts.capEnd) g.cap(rings[rings.length - 1], cs[Math.max(0, cs.length - 2)]);
  return g;
}

/**
 * Thin aerofoil slab through chords. Each chord runs le → te with thickness t (metres) measured along `normal`.
 * `prof` is the upper half-profile as [chord fraction, half-thickness ratio]; the lower half mirrors it.
 */
export function slab(chords: { le: V; te: V; t: number }[], normal: V, prof: [number, number][], opts: { caps?: [boolean, boolean]; into?: Geo } = {}) {
  const n = normal.clone().normalize();
  const rings = chords.map(({ le, te, t }) => {
    const top = prof.map(([c, h]) => le.clone().lerp(te, c).addScaledVector(n, h * t / 2));
    const bot = prof.slice().reverse().map(([c, h]) => le.clone().lerp(te, c).addScaledVector(n, -h * t / 2));
    return [...top, ...bot];
  });
  const [c0, c1] = opts.caps ?? [true, true];
  return loft(rings, { capStart: c0, capEnd: c1, into: opts.into });
}

/** Rectangle ring around a centre line point: [x0, x1] × [y0, y1] at depth z. */
export const rectRing = (x0: number, x1: number, y0: number, y1: number, z: number) =>
  [new THREE.Vector3(x0, y1, z), new THREE.Vector3(x1, y1, z), new THREE.Vector3(x1, y0, z), new THREE.Vector3(x0, y0, z)];

/** Lightweight merge of several built geometries (position only). */
export function merge(geos: THREE.BufferGeometry[]) {
  const pos: number[] = [];
  for (const g of geos) {
    const src = g.index ? g.toNonIndexed() : g;
    const p = src.attributes.position;
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.computeVertexNormals();
  out.computeBoundingSphere();
  return out;
}
