// Jet building blocks on top of the shared kit: the craft groups (attitude acts about the centre of gravity),
// stores on extending launchers, formation light strips, position lights, the taxi light and the cockpit display.
// Coordinates: +y up, +z forward, `s` metres aft of the nose tip.
import * as THREE from 'three';
import type { Engine } from '../../../iso/engine';
import { Geo } from '../../../iso/geo';
import { makeKit as makeBaseKit } from '../../../kit/build';
import { missileGeo, makeSeekers } from '../../../kit/ordnance';

export { DEG, SIDES, ease, clamp01, phase } from '../../../core/anim';
type V = THREE.Vector3;
export const PLATE: [number, number][] = [[0, 1], [1, 1]];

export function makeKit(E: Engine, noseZ: number, cgY: number) {
  const craft = new THREE.Group(); craft.position.y = cgY;
  const air = new THREE.Group(); air.position.y = -cgY; craft.add(air);
  E.scene.add(craft);
  const K = makeBaseKit(E, { P: (x, y, s) => new THREE.Vector3(x, y, noseZ - s), root: air });
  const { add } = K;

  // seeker heads light up (accent) once a launcher has the store out in the airflow, armed
  const S = makeSeekers(E);
  /** a store on an extending launcher arm, stowed at `at`; returns what pose() moves */
  const launcher = (parent: THREE.Object3D, geo: THREE.BufferGeometry, at: V, len: number, drop: number, seekerR: number) => {
    const g = new THREE.Group(); g.position.copy(at); parent.add(g);
    add(g, geo);
    const glow = seekerR > 0 ? S.seeker(g, new THREE.Vector3(0, 0, len * 0.47), seekerR) : null;
    const railGeo = new THREE.BoxGeometry(0.05, 1, Math.min(1.3, len * 0.4)); railGeo.translate(0, 0.5, 0);
    const rail = add(g, railGeo, undefined, { real: 'strut' });
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
    const pl = K.part('lights');
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
    const { canvas, tex, mesh } = K.display(parent, at, normal, w, h);
    const cockpitLight = new THREE.PointLight(E.accent.getHex(), 0, 1.9, 2);
    cockpitLight.position.copy(lightAt); parent.add(cockpitLight); E.accentLights.push(cockpitLight);
    return { screen: { canvas, tex }, cockpitLight, mesh };
  };

  return {
    ...K, craft, air, missileGeo, seeker: S.seeker, seekerMat: S.mat, seekerGlows: S.glows, launcher,
    strip, finishLights, taxiLight, cockpitDisplay, mats: { stripMat, navMat, beaconMat, taxiMat },
  };
}

export type JetKit = ReturnType<typeof makeKit>;
