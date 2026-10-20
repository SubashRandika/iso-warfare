// A ground plate for anything that isn't parked on an apron: a hairline grid (every fifth line stronger), an optional
// ruler along the front edge and a soft shadow under the model. Sizes in metres; the plate is centred on (cx, cz).
// Small arms: { grid: 0.01, ruler: true } is a bench mat in centimetres. A tank: { w: 16, d: 20, grid: 0.5 }.
import * as THREE from 'three';
import type { Engine } from '../iso/engine';

export function buildPlate(E: Engine, o: { w: number; d: number; cx?: number; cz?: number; grid?: number; ruler?: boolean; shadow: [number, number, number, number] }) {
  const deck = new THREE.Group(); E.scene.add(deck);
  const cx = o.cx ?? 0, cz = o.cz ?? 0, G = o.grid ?? 0.01, T = G * 0.8, y = G * 0.04, m = G * 2;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(o.w, T, o.d), E.mats.pad);
  plate.position.set(cx, -T / 2, cz); plate.raycast = () => {}; deck.add(plate);
  plate.add(E.fat(Array.from(new THREE.EdgesGeometry(plate.geometry, 30).attributes.position.array as Float32Array), E.mats.major));

  const minor: number[] = [], major: number[] = [];
  const x0 = cx - o.w / 2 + m, x1 = cx + o.w / 2 - m, z0 = cz - o.d / 2 + m, z1 = cz + o.d / 2 - (o.ruler ? 5 * G : m);
  const seg = (arr: number[], ax: number, az: number, bx: number, bz: number) => arr.push(ax, y, az, bx, y, bz);
  const eps = G * 1e-3;
  for (let i = 0; ; i++) { const x = x0 + i * G; if (x > x1 + eps) break; seg(i % 5 ? minor : major, x, z0, x, z1); }
  for (let i = 0; ; i++) { const z = z0 + i * G; if (z > z1 + eps) break; seg(i % 5 ? minor : major, x0, z, x1, z); }
  // ruler: a tick per grid step along the front edge, longer every 5 and 10
  if (o.ruler) {
    const rz = cz + o.d / 2 - 1.2 * G;
    for (let i = 0; ; i++) { const x = x0 + i * G; if (x > x1 + eps) break; const l = (i % 10 === 0 ? 2 : i % 5 === 0 ? 1.4 : 0.8) * G; seg(i % 5 ? minor : major, x, rz, x, rz - l); }
    seg(major, x0, rz, x1, rz);
  }
  const gm = E.fat(minor, E.mats.line), gM = E.fat(major, E.mats.major);
  gm.renderOrder = gM.renderOrder = 1; deck.add(gm, gM);

  const [sw, sd, sx, sz] = o.shadow;
  const shadowMat = E.softMat(0x000000, false);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(sw, sd), shadowMat);
  sh.rotation.x = -Math.PI / 2; sh.position.set(sx, y * 2, sz); sh.raycast = () => {}; deck.add(sh);
  return { deck, shadowMat };
}
