// Building blocks every airframe uses: the craft groups, selectable parts, hinged sub-assemblies, gear, stores,
// light strips and the cockpit display. Coordinates: +y up, +z forward, `s` metres aft of the nose tip.
import * as THREE from 'three';
import type { Engine } from '../iso/engine';
import { Geo, merge } from '../iso/geo';
import type { GlowPoints, Hinge } from './types';

type V = THREE.Vector3;
export const DEG = Math.PI / 180;
export const SIDES = [1, -1] as const;
export const ease = (t: number) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** eased 0..1 progress of t through the window [a, b] */
export const phase = (t: number, a: number, b: number) => ease(clamp01((t - a) / (b - a)));
export const PLATE: [number, number][] = [[0, 1], [1, 1]];

export function makeKit(E: Engine, noseZ: number, cgY: number) {
  const P = (x: number, y: number, s: number) => new THREE.Vector3(x, y, noseZ - s);
  const craft = new THREE.Group(); craft.position.y = cgY;
  const air = new THREE.Group(); air.position.y = -cgY; craft.add(air);
  E.scene.add(craft);
  E.setPickRoot(air);

  const parts: Record<string, THREE.Group> = {};
  const part = (id: string) => { const g = new THREE.Group(); g.userData.part = id; air.add(g); parts[id] = g; return g; };
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material = E.mats.body, opts: { outline?: boolean; lines?: boolean; minLen?: number } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    if (opts.lines !== false) E.hairline(m, opts);
    parent.add(m); return m;
  };
  /** a group that rotates about `axis` through `pivot`; meshes go in `inner` in aircraft coordinates */
  const hinge = (parent: THREE.Object3D, pivot: V, axis: V, keep: 'x' | 'y' | 'z'): Hinge => {
    const a = axis.clone().normalize(); if (a[keep] < 0) a.negate();
    const outer = new THREE.Group(); outer.position.copy(pivot); parent.add(outer);
    const inner = new THREE.Group(); inner.position.copy(pivot).negate(); outer.add(inner);
    return { outer, inner, set: rad => { outer.quaternion.setFromAxisAngle(a, rad); } };
  };
  const box = (x0: number, x1: number, y0: number, y1: number, s0: number, s1: number) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, s1 - s0); const c = P((x0 + x1) / 2, (y0 + y1) / 2, (s0 + s1) / 2); g.translate(c.x, c.y, c.z); return g;
  };
  const cyl = (r: number, y0: number, y1: number, x: number, s: number, seg = 12) => { const g = new THREE.CylinderGeometry(r, r, y1 - y0, seg); const c = P(x, (y0 + y1) / 2, s); g.translate(c.x, c.y, c.z); return g; };
  const wheel = (r: number, w: number, x: number, y: number, s: number) => {
    const t = new THREE.CylinderGeometry(r, r, w, 22); t.rotateZ(Math.PI / 2);
    const h = new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.05, 12); h.rotateZ(Math.PI / 2);
    const g = merge([t, h]); const c = P(x, y, s); g.translate(c.x, c.y, c.z); return g;
  };
  const brace = (a: V, b: V, r: number) => { const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), 8); g.translate(0, d.length() / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(a.x, a.y, a.z); return g; };
  /** flat dark panel (a well or opening) wound toward `facing` */
  const well = (parent: THREE.Object3D, pts: V[], facing: V) => { const g = new Geo(); g.sheet(pts, facing); return add(parent, g.build(), E.mats.recess, { outline: false, lines: false }); };

  /** missile or bomb along +z, centred on the origin. Octagonal body: 45° facets give it lengthwise hairlines. */
  const missileGeo = (len: number, r: number, fin: number, mid: boolean) => {
    const ps: THREE.BufferGeometry[] = [];
    const b = new THREE.CylinderGeometry(r, r, len * 0.86, 8, 1, false, Math.PI / 8); b.rotateX(Math.PI / 2); b.translate(0, 0, -len * 0.07); ps.push(b);
    const nc = new THREE.ConeGeometry(r, len * 0.14, 8, 1, false, Math.PI / 8); nc.rotateX(Math.PI / 2); nc.translate(0, 0, len * 0.43); ps.push(nc);
    const fins = (span: number, chord: number, z: number) => { for (let i = 0; i < 4; i++) { const f = new THREE.BoxGeometry(span, 0.01, chord); f.translate(r + span / 2, 0, z); f.rotateZ(Math.PI / 4 + i * Math.PI / 2); ps.push(f); } };
    fins(fin, Math.max(0.24, r * 2.2), -len * 0.45);
    if (mid) fins(fin * 0.7, 0.3, len * 0.02);
    return merge(ps);
  };
  // seeker heads light up (accent) once a launcher has the store out in the airflow, armed
  const seekerMat = E.glowMat(), seekerGlows: GlowPoints[] = [];
  const seeker = (parent: THREE.Object3D, at: V, r: number) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10), seekerMat); m.position.copy(at); parent.add(m);
    const g = E.glowPoints([at.clone().add(new THREE.Vector3(0, 0, r))], 0.55); parent.add(g); seekerGlows.push(g);
    return g;
  };
  /** a store on an extending launcher arm, stowed at `at`; returns what pose() moves */
  const launcher = (parent: THREE.Object3D, geo: THREE.BufferGeometry, at: V, len: number, drop: number, seekerR: number) => {
    const g = new THREE.Group(); g.position.copy(at); parent.add(g);
    add(g, geo);
    const glow = seekerR > 0 ? seeker(g, new THREE.Vector3(0, 0, len * 0.47), seekerR) : null;
    const railGeo = new THREE.BoxGeometry(0.05, 1, Math.min(1.3, len * 0.4)); railGeo.translate(0, 0.5, 0);
    const rail = add(g, railGeo);
    return { g, rail, drop, y0: at.y, glow };
  };

  // light strips: thin emissive bands a hair off the skin, with a few glow points each
  const stripMat = E.glowMat(), navMat = E.glowMat(), beaconMat = E.glowMat(), taxiMat = E.glowMat();
  const strips = new Geo(), stripPts: V[] = [];
  const strip = (a: V, b: V, side: V, out: V, w = 0.035) => {
    const sd = side.clone().normalize().multiplyScalar(w), o = out.clone().normalize().multiplyScalar(0.012);
    strips.sheet([a.clone().add(sd).add(o), b.clone().add(sd).add(o), b.clone().sub(sd).add(o), a.clone().sub(sd).add(o)], out);
    for (let i = 0; i <= 2; i++) stripPts.push(a.clone().lerp(b, 0.15 + 0.35 * i).add(o));
  };
  /** after all strips: the formation strips, wingtip position lights and beacons as one lights part */
  const finishLights = (navPos: V[], beaconPos: V[]) => {
    const pl = part('lights');
    add(pl, strips.build(), stripMat, { outline: false, lines: false });
    const stripGlow = E.glowPoints(stripPts, 0.32); pl.add(stripGlow);
    navPos.forEach(p => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 12), navMat); m.position.copy(p); pl.add(m); });
    const navGlow = E.glowPoints(navPos, 1.0); pl.add(navGlow);
    beaconPos.forEach(p => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 20), beaconMat); m.position.copy(p); pl.add(m); });
    const beaconGlow = E.glowPoints(beaconPos, 1.5); pl.add(beaconGlow);
    return { stripGlow, navGlow, beaconGlow };
  };
  /** taxi light on a nose-gear leg (moves with it) */
  const taxiLight = (parent: THREE.Object3D, at: V) => {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 12), taxiMat); bulb.position.copy(at); parent.add(bulb);
    const glow = E.glowPoints([at.clone().add(new THREE.Vector3(0, 0, 0.03))], 0.9); parent.add(glow);
    return glow;
  };
  /** cockpit display: a canvas on a plane at `at`, facing `normal`; plus the cockpit light */
  const cockpitDisplay = (parent: THREE.Object3D, at: V, normal: V, w: number, h: number, lightAt: V) => {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 192;
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    m.position.copy(at); m.lookAt(at.clone().add(normal)); parent.add(m);
    const cockpitLight = new THREE.PointLight(E.accent.getHex(), 0, 1.9, 2);
    cockpitLight.position.copy(lightAt); parent.add(cockpitLight); E.accentLights.push(cockpitLight);
    return { screen: { canvas, tex }, cockpitLight };
  };

  return {
    P, craft, air, parts, part, add, hinge, box, cyl, wheel, brace, well, missileGeo, seeker, seekerMat, seekerGlows, launcher,
    strip, finishLights, taxiLight, cockpitDisplay, mats: { stripMat, navMat, beaconMat, taxiMat },
  };
}

export type Kit = ReturnType<typeof makeKit>;
