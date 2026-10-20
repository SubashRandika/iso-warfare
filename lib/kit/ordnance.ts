// Missiles, bombs and their seeker heads: shared by aircraft weapons bays, missile displays and launchers.
import * as THREE from 'three';
import type { Engine } from '../iso/engine';
import { merge } from '../iso/geo';
import type { GlowPoints } from '../core/types';

/** missile or bomb along +z, centred on the origin. Octagonal body: 45° facets give it lengthwise hairlines. */
export function missileGeo(len: number, r: number, fin: number, mid: boolean) {
  const ps: THREE.BufferGeometry[] = [];
  const b = new THREE.CylinderGeometry(r, r, len * 0.86, 8, 1, false, Math.PI / 8); b.rotateX(Math.PI / 2); b.translate(0, 0, -len * 0.07); ps.push(b);
  const nc = new THREE.ConeGeometry(r, len * 0.14, 8, 1, false, Math.PI / 8); nc.rotateX(Math.PI / 2); nc.translate(0, 0, len * 0.43); ps.push(nc);
  const fins = (span: number, chord: number, z: number) => {
    for (let i = 0; i < 4; i++) { const f = new THREE.BoxGeometry(span, 0.01, chord); f.translate(r + span / 2, 0, z); f.rotateZ(Math.PI / 4 + i * Math.PI / 2); ps.push(f); }
  };
  fins(fin, Math.max(0.24, r * 2.2), -len * 0.45);
  if (mid) fins(fin * 0.7, 0.3, len * 0.02);
  const g = merge(ps); g.userData.real = 'store'; return g;
}

/** seeker heads that light up (accent) when armed; one material and glow list for the whole model */
export function makeSeekers(E: Engine) {
  const mat = E.glowMat(), glows: GlowPoints[] = [];
  const seeker = (parent: THREE.Object3D, at: THREE.Vector3, r: number) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10), mat); m.position.copy(at); m.userData.real = 'seeker'; parent.add(m);
    const g = E.glowPoints([at.clone().add(new THREE.Vector3(0, 0, r))], 0.55); parent.add(g); glows.push(g);
    return g;
  };
  /** light every seeker in the list by how far its store is out (0..1) */
  const arm = (k: number) => { mat.emissiveIntensity = 1.6 * k; };
  return { mat, glows, seeker, arm };
}
