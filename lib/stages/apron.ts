// The apron the jet parks on: plate, taxi line, stop bar, wing-walk box, tie-down rings, edge lights,
// the jet's soft shadow and the taxi light's pool. It stays on the ground when the jet lifts off.
import * as THREE from 'three';
import type { Engine } from '../iso/engine';

const lerp = THREE.MathUtils.lerp;

export function buildApron(E: Engine, o: { noseZ: number; length: number; halfSpan: number; noseGearS: number }) {
  const deck = new THREE.Group(); E.scene.add(deck);
  const DW = Math.max(30, Math.ceil(o.halfSpan * 2 + 10)), DD = Math.max(40, Math.ceil(o.length + 20)), DZ = 0;   // grows for big jets
  { const b = new THREE.Mesh(new THREE.BoxGeometry(DW, 0.12, DD), E.mats.pad); b.position.set(0, -0.065, DZ); b.raycast = () => {}; deck.add(b);
    b.add(E.fat(Array.from(new THREE.EdgesGeometry(b.geometry, 30).attributes.position.array as Float32Array), E.mats.major)); }
  const ln: number[] = [], dl: number[] = [];
  const seg = (arr: number[], x0: number, z0: number, x1: number, z1: number) => arr.push(x0, 0.004, z0, x1, 0.004, z1);
  seg(ln, 0, DZ + DD / 2 - 0.4, 0, DZ - DD / 2 + 0.4);                                      // taxi line
  const stopZ = o.noseZ - (o.noseGearS - 0.55); seg(ln, -1.2, stopZ, 1.2, stopZ);            // stop bar ahead of the nose wheel
  for (const x of [-0.25, 0.25]) seg(ln, x, stopZ + 0.4, x, stopZ + 3.5);
  const bx = o.halfSpan + 0.8, bz0 = o.noseZ + 0.8, bz1 = o.noseZ - o.length - 0.9;           // dashed wing-walk box
  const dash = (x0: number, z0: number, x1: number, z1: number) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / 1.2); for (let i = 0; i < n; i++) { const a = i / n, b = (i + 0.55) / n; seg(dl, lerp(x0, x1, a), lerp(z0, z1, a), lerp(x0, x1, b), lerp(z0, z1, b)); } };
  dash(-bx, bz0, bx, bz0); dash(bx, bz0, bx, bz1); dash(bx, bz1, -bx, bz1); dash(-bx, bz1, -bx, bz0);
  for (let x = -(Math.floor(DW / 8) * 4 - 3); x <= DW / 2 - 3; x += 4) for (let z = DZ - (DD / 2 - 4); z <= DZ + DD / 2 - 4; z += 4) {           // tie-down rings outside the box
    if (Math.abs(x) < bx + 1 && z < bz0 + 1 && z > bz1 - 1) continue;
    for (let i = 0; i < 16; i++) { const t0 = i / 16 * Math.PI * 2, t1 = (i + 1) / 16 * Math.PI * 2; seg(dl, x + 0.16 * Math.cos(t0), z + 0.16 * Math.sin(t0), x + 0.16 * Math.cos(t1), z + 0.16 * Math.sin(t1)); }
  }
  deck.add(E.fat(ln, E.mats.major), E.fat(dl, E.mats.line));
  const padLightMat = E.glowMat(), padPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 9; i++) { const z = DZ - DD / 2 + 0.5 + (DD - 1) * i / 9; padPts.push(new THREE.Vector3(-DW / 2 + 0.5, 0.05, z), new THREE.Vector3(DW / 2 - 0.5, 0.05, z)); }
  for (let i = 1; i < 8; i++) { const x = -DW / 2 + 0.5 + (DW - 1) * i / 8; padPts.push(new THREE.Vector3(x, 0.05, DZ - DD / 2 + 0.5), new THREE.Vector3(x, 0.05, DZ + DD / 2 - 0.5)); }
  for (let z = DZ + DD / 2 - 1.5; z > o.noseZ + 1; z -= 2.5) padPts.push(new THREE.Vector3(0, 0.03, z));   // centre-line lights ahead
  const lampGeo = new THREE.SphereGeometry(0.06, 16, 10);
  padPts.forEach(p => { const m = new THREE.Mesh(lampGeo, padLightMat); m.position.copy(p); deck.add(m); });
  const padGlow = E.glowPoints(padPts.map(p => p.clone().setY(0.07)), 1.2); deck.add(padGlow);
  const flat = (w: number, d: number, mat: THREE.Material, x: number, z: number, y = 0.01) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.raycast = () => {}; deck.add(m); return m; };
  const shadowMat = E.softMat(0x000000, false), taxiPoolMat = E.softMat(0xffffff, true);
  flat(o.halfSpan * 1.45, o.length * 1.1, shadowMat, 0, o.noseZ - o.length / 2);
  flat(4.2, 8, taxiPoolMat, 0, o.noseZ + 3.6, 0.02);
  return { deck, padLightMat, padGlow, shadowMat, taxiPoolMat };
}
