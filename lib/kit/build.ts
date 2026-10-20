// Building blocks for any model: selectable parts, hairlined meshes, hinged sub-assemblies, primitives placed through
// the model's own coordinate frame, dark wells and canvas displays.
//
// `P(a, b, c)` maps the model's coordinates to three.js (+y up). Jets use (x, y, metres aft of the nose); a pistol can
// use plain metres. Primitives take their extents in the same coordinates, so a frame that mirrors an axis still works.
// `unit` scales the defaults that depend on size (shortest crease line kept), so a 20 cm pistol keeps its detail.
import * as THREE from 'three';
import type { Engine } from '../iso/engine';
import { Geo, merge } from '../iso/geo';

type V = THREE.Vector3;
export type Frame = (a: number, b: number, c: number) => V;
export interface Hinge { outer: THREE.Group; inner: THREE.Group; set(rad: number): void }
/** `real`: the material the realistic render style gives this mesh (see lib/real/materials.ts), e.g. 'strut' */
export interface MeshOpts { outline?: boolean; lines?: boolean; minLen?: number; real?: string }

export function makeKit(E: Engine, o: { P?: Frame; unit?: number; root?: THREE.Object3D } = {}) {
  const P: Frame = o.P ?? ((x, y, z) => new THREE.Vector3(x, y, z));
  const unit = o.unit ?? 1;
  const root = o.root ?? (() => { const g = new THREE.Group(); E.scene.add(g); return g; })();

  const parts: Record<string, THREE.Group> = {};
  /** a selectable part: clicking anything inside it selects `id` */
  const part = (id: string, parent: THREE.Object3D = root) => { const g = new THREE.Group(); g.userData.part = id; parent.add(g); parts[id] = g; return g; };
  /** a mesh with the silhouette shell and crease hairlines */
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material = E.mats.body, opts: MeshOpts = {}) => {
    const m = new THREE.Mesh(geo, mat);
    if (opts.real) m.userData.real = opts.real;
    if (opts.lines !== false) E.hairline(m, { outline: opts.outline, minLen: opts.minLen ?? 0.08 * unit });
    parent.add(m); return m;
  };
  /** a group that rotates about `axis` through `pivot`; meshes go in `inner`, in model coordinates */
  const hinge = (parent: THREE.Object3D, pivot: V, axis: V, keep: 'x' | 'y' | 'z'): Hinge => {
    const a = axis.clone().normalize(); if (a[keep] < 0) a.negate();
    const outer = new THREE.Group(); outer.position.copy(pivot); parent.add(outer);
    const inner = new THREE.Group(); inner.position.copy(pivot).negate(); outer.add(inner);
    return { outer, inner, set: rad => { outer.quaternion.setFromAxisAngle(a, rad); } };
  };
  const box = (a0: number, a1: number, b0: number, b1: number, c0: number, c1: number) => {
    const lo = P(a0, b0, c0), hi = P(a1, b1, c1);
    const g = new THREE.BoxGeometry(Math.abs(hi.x - lo.x), Math.abs(hi.y - lo.y), Math.abs(hi.z - lo.z));
    const c = lo.add(hi).multiplyScalar(0.5); g.translate(c.x, c.y, c.z); return g;
  };
  /** vertical cylinder from b0 to b1 at (a, c) */
  const cyl = (r: number, b0: number, b1: number, a: number, c: number, seg = 12) => {
    const g = new THREE.CylinderGeometry(r, r, Math.abs(b1 - b0), seg); const p = P(a, (b0 + b1) / 2, c); g.translate(p.x, p.y, p.z); return g;
  };
  /** wheel turning about x (tyre plus hub) */
  const wheel = (r: number, w: number, a: number, b: number, c: number) => {
    const t = new THREE.CylinderGeometry(r, r, w, 22); t.rotateZ(Math.PI / 2);
    const h = new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.05 * unit, 12); h.rotateZ(Math.PI / 2);
    const g = merge([t, h]); const p = P(a, b, c); g.translate(p.x, p.y, p.z); g.userData.real = 'tyre'; return g;
  };
  /** round bar between two three.js points */
  const brace = (a: V, b: V, r: number, seg = 8) => {
    const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), seg);
    g.translate(0, d.length() / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(a.x, a.y, a.z); return g;
  };
  /** flat dark panel (a well, port or opening) wound toward `facing` */
  const well = (parent: THREE.Object3D, pts: V[], facing: V, real?: string) => { const g = new Geo(); g.sheet(pts, facing); return add(parent, g.build(), E.mats.recess, { outline: false, lines: false, real }); };
  /** a canvas drawn on a plane at `at`, facing `normal` (screens, gauges, sights) */
  const display = (parent: THREE.Object3D, at: V, normal: V, w: number, h: number, px: [number, number] = [512, 192]) => {
    const canvas = document.createElement('canvas'); canvas.width = px[0]; canvas.height = px[1];
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    mesh.position.copy(at); mesh.lookAt(at.clone().add(normal)); parent.add(mesh);
    return { canvas, tex, mesh };
  };
  /** straight hairlines between point pairs, as one line object */
  const lines = (parent: THREE.Object3D, pairs: [V, V][], major = false) => {
    const arr: number[] = []; pairs.forEach(([a, b]) => arr.push(a.x, a.y, a.z, b.x, b.y, b.z));
    const l = E.fat(arr, major ? E.mats.major : E.mats.line); parent.add(l); return l;
  };

  return { P, unit, root, parts, part, add, hinge, box, cyl, wheel, brace, well, display, lines };
}

export type Kit = ReturnType<typeof makeKit>;
