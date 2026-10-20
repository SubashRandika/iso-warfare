// F-22 Raptor airframe, built from faceted lofts and aerofoil slabs in metres.
// Axes: +y up, +z forward. `s` is the distance aft of the nose tip, so P(x, y, s) puts a point on the aircraft.
// Side k = +1 is the port (left) side at +x, k = −1 the starboard side.
import * as THREE from 'three';
import type { Engine } from '../iso/engine';
import { Geo, loft, slab, rectRing, merge } from '../iso/geo';
import type { PartId } from './parts';

type V = THREE.Vector3;
const NOSE_Z = 9.45;
export const P = (x: number, y: number, s: number) => new THREE.Vector3(x, y, NOSE_Z - s);
const lerp = THREE.MathUtils.lerp, DEG = Math.PI / 180;
const SIDES = [1, -1] as const;

export interface Hinge { outer: THREE.Group; inner: THREE.Group; set(rad: number): void }

// ── fuselage stations ── s, yTop, upper deck (w, y), chine (w, y), lower side (w, y), belly (w, y)
const FUS: number[][] = [
  [0.00, 2.05, 0.00, 2.05, 0.00, 2.05, 0.00, 2.05, 0.00, 2.05],
  [0.55, 2.20, 0.09, 2.17, 0.20, 2.06, 0.13, 1.95, 0.05, 1.91],
  [1.40, 2.39, 0.20, 2.34, 0.40, 2.08, 0.28, 1.81, 0.11, 1.75],
  [2.40, 2.56, 0.30, 2.50, 0.56, 2.11, 0.40, 1.67, 0.17, 1.60],
  [3.20, 2.66, 0.38, 2.60, 0.66, 2.13, 0.48, 1.59, 0.21, 1.51],
  [4.20, 2.74, 0.47, 2.66, 0.77, 2.16, 0.57, 1.50, 0.26, 1.42],
  [5.40, 2.79, 0.55, 2.70, 0.87, 2.19, 0.64, 1.43, 0.30, 1.36],
  [6.60, 2.85, 0.61, 2.74, 0.95, 2.23, 0.80, 1.40, 0.70, 1.27],
  [8.30, 2.95, 0.92, 2.84, 1.30, 2.27, 0.84, 1.34, 0.78, 1.25],
  [10.5, 2.97, 1.08, 2.88, 1.45, 2.30, 0.92, 1.32, 0.80, 1.23],
  [12.5, 2.95, 1.14, 2.86, 1.52, 2.31, 1.04, 1.34, 0.86, 1.25],
  [14.5, 2.90, 1.16, 2.80, 1.56, 2.31, 1.24, 1.42, 0.98, 1.32],
  [16.0, 2.82, 1.12, 2.72, 1.54, 2.30, 1.34, 1.56, 1.06, 1.44],
  [17.4, 2.70, 1.04, 2.62, 1.44, 2.28, 1.30, 1.70, 1.05, 1.58],
];
function fus(s: number) {
  let i = 0; while (i < FUS.length - 2 && FUS[i + 1][0] < s) i++;
  const a = FUS[i], b = FUS[i + 1], t = THREE.MathUtils.clamp((s - a[0]) / (b[0] - a[0]), 0, 1);
  const r = a.map((v, j) => lerp(v, b[j], t));
  return { yT: r[1], wU: r[2], yU: r[3], wC: r[4], yC: r[5], wL: r[6], yL: r[7], wB: r[8], yB: r[9] };
}
const fusRing = (s: number) => {
  const f = fus(s);
  return ([[0, f.yT], [f.wU, f.yU], [f.wC, f.yC], [f.wL, f.yL], [f.wB, f.yB], [0, f.yB], [-f.wB, f.yB], [-f.wL, f.yL], [-f.wC, f.yC], [-f.wU, f.yU]] as const)
    .map(([x, y]) => P(x, y, s));
};
/** height of the upper fuselage surface at |x| (between the centre line and the upper deck edge) */
const topY = (s: number, x = 0) => { const f = fus(s); return f.yT + (f.yU - f.yT) * Math.min(1, Math.abs(x) / Math.max(f.wU, 1e-3)); };
const bellyY = (s: number) => fus(s).yB;

// ── intake nacelles: top-outer, top-inner, bottom-inner, bottom-outer ──
const NAC: number[][] = [
  [7.2, 1.54, 2.17, 0.80, 2.20, 0.78, 1.19, 1.32, 1.19],
  [8.9, 1.56, 2.20, 0.82, 2.24, 0.80, 1.19, 1.33, 1.19],
  [10.8, 1.50, 2.22, 0.86, 2.26, 0.84, 1.20, 1.30, 1.20],
  [12.4, 1.38, 2.24, 0.92, 2.27, 0.90, 1.24, 1.22, 1.24],
  [13.4, 1.18, 2.20, 0.95, 2.22, 0.95, 1.42, 1.10, 1.42],
];
function nacAt(s: number) {
  let i = 0; while (i < NAC.length - 2 && NAC[i + 1][0] < s) i++;
  const a = NAC[i], b = NAC[i + 1], t = THREE.MathUtils.clamp((s - a[0]) / (b[0] - a[0]), 0, 1);
  return a.map((v, j) => lerp(v, b[j], t));
}
/** a point on the nacelle's outer wall: f = 0 at the top edge, 1 at the bottom edge */
const wallPt = (k: number, s: number, f: number) => { const n = nacAt(s); return P(k * lerp(n[1], n[7], f), lerp(n[2], n[8], f), s); };

// ── wing ──
const WR = 1.42, WT = 6.78;
const wu = (x: number) => (x - WR) / (WT - WR);
const wLE = (x: number) => 8.3 + (x - 1.0) * 0.9;
const wTE = (x: number) => lerp(16.55, 15.2, wu(x));
const wY = (x: number) => 2.27 - (x - WR) * 0.057;
const wT = (x: number) => lerp(0.30, 0.07, wu(x));
const lefC = (x: number) => lerp(0.62, 0.30, wu(x));
const csC = (x: number) => lerp(1.30, 0.62, wu(x));
const FLAP_END = 3.9;

// ── fins ──
const FH = 2.85, CANT = 28 * DEG, FIN_X = 1.2, FIN_Y = 2.74;
const fLE = (h: number) => 13.3 + h * 0.42;
const fTE = (h: number) => 17.2 - h * 0.40;
const fT = (h: number) => lerp(0.20, 0.07, h / FH);

// ── stabilators ──
const SR = 1.70, ST = 4.42, SY = 2.0;
const sLE = (x: number) => 16.0 + (x - SR) * 0.72;
const sTE = (x: number) => 19.0 - (x - SR) * 0.18;
const sT = (x: number) => lerp(0.17, 0.05, (x - SR) / (ST - SR));

const BOX_PROF: [number, number][] = [[0, 0.35], [0.4, 1], [1, 0.32]];
const LEF_PROF: [number, number][] = [[0, 0.03], [1, 0.35]];
const CS_PROF: [number, number][] = [[0, 0.32], [1, 0.03]];
const FULL_PROF: [number, number][] = [[0, 0.05], [0.4, 1], [1, 0.05]];
const PLATE: [number, number][] = [[0, 1], [1, 1]];

export function buildRaptor(E: Engine) {
  const { body, recess, glass } = E.mats;
  const craft = new THREE.Group();           // altitude, bank and pitch act here, about the centre of gravity
  craft.position.y = 2.2;
  const air = new THREE.Group(); air.position.y = -2.2; craft.add(air);
  E.scene.add(craft);

  const parts = {} as Record<PartId, THREE.Group>;
  const part = (id: PartId) => { const g = new THREE.Group(); g.userData.part = id; air.add(g); parts[id] = g; return g; };
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material = body, opts: { outline?: boolean; lines?: boolean; minLen?: number } = {}) => {
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

  // ═════ airframe: fuselage, spine, booms, stinger ═════
  const pAir = part('airframe');
  const stations = (a: number, b: number) => FUS.map(r => r[0]).filter(s => s >= a && s <= b);
  add(pAir, loft(stations(3.2, 17.4).map(fusRing), { capEnd: true }).build());
  for (const k of SIDES) {
    const c = k * 1.62, ring = (s: number, hw: number, hh: number) => [P(c, SY + hh, s), P(c + hw, SY, s), P(c, SY - hh, s), P(c - hw, SY, s)];
    add(pAir, loft([ring(14.6, 0.02, 0.02), ring(15.6, 0.16, 0.22), ring(18.2, 0.16, 0.2), ring(18.8, 0.04, 0.05)], { capStart: true, capEnd: true }).build());
  }
  add(pAir, loft([rectRing(-0.2, 0.2, 2.0, 2.55, NOSE_Z - 17.2), rectRing(-0.16, 0.16, 2.08, 2.42, NOSE_Z - 18.0), rectRing(-0.06, 0.06, 2.18, 2.3, NOSE_Z - 18.45)], { capEnd: true }).build());
  // panel seams on the spine (hairline detail)
  {
    const seam: number[] = [];
    for (const s of [8.9, 12.1, 14.9]) { const f = fus(s); [[-f.wU, f.yU], [0, f.yT], [f.wU, f.yU]].reduce((a, b) => { const A = P(a[0], a[1] + 0.004, s), B = P(b[0], b[1] + 0.004, s); seam.push(A.x, A.y, A.z, B.x, B.y, B.z); return b; }); }
    pAir.add(E.fat(seam, E.mats.line));
  }

  // ═════ radome & forebody ═════
  const pNose = part('radome');
  add(pNose, loft(stations(0, 3.2).map(fusRing)).build());

  // ═════ canopy & cockpit ═════
  const pCan = part('canopy');
  const CAN = [[3.3, 0.06, 0.03], [3.8, 0.30, 0.30], [4.4, 0.45, 0.50], [5.0, 0.53, 0.62], [5.6, 0.56, 0.66], [6.2, 0.54, 0.61], [6.8, 0.48, 0.50], [7.3, 0.38, 0.34], [7.8, 0.25, 0.14]];
  const canAt = (s: number) => { let i = 0; while (i < CAN.length - 2 && CAN[i + 1][0] < s) i++; const a = CAN[i], b = CAN[i + 1], t = THREE.MathUtils.clamp((s - a[0]) / (b[0] - a[0]), 0, 1); return { w: lerp(a[1], b[1], t), h: lerp(a[2], b[2], t) }; };
  const NA = 16;
  const canRing = (s: number) => { const { w, h } = canAt(s); return Array.from({ length: NA + 1 }, (_, i) => { const th = Math.PI * i / NA, x = w * Math.cos(th); return P(x, topY(s, x) - 0.01 + h * Math.sin(th), s); }); };
  const canS = Array.from({ length: 23 }, (_, i) => 3.3 + (7.8 - 3.3) * i / 22);
  const canopyH = hinge(pCan, P(0, topY(7.9), 7.9), new THREE.Vector3(1, 0, 0), 'x');
  const canGeo = loft(canS.map(canRing), { open: true, capEnd: true }).build();
  const canMesh = add(canopyH.inner, canGeo, glass, { outline: false });
  canMesh.renderOrder = 3;
  { // the canopy's rear bow
    const bow = canRing(7.45).map(p => p.clone().add(new THREE.Vector3(0, 0.006, 0)));
    canopyH.inner.add(E.loopLine(bow, E.mats.major, false));
  }
  // cockpit tub, seat, coaming, display and HUD frame
  const tub = new Geo();
  const tubRings = Array.from({ length: 12 }, (_, i) => { const s = 3.9 + 3.7 * i / 11, w = canAt(s).w * 0.94; return [P(-w, topY(s, w) + 0.012, s), P(0, topY(s) + 0.012, s), P(w, topY(s, w) + 0.012, s)]; });
  for (let i = 0; i < tubRings.length - 1; i++) for (let j = 0; j < 2; j++) tub.quad(tubRings[i][j], tubRings[i][j + 1], tubRings[i + 1][j + 1], tubRings[i + 1][j], P(0, 0, 5.5));
  add(pCan, tub.build(), recess, { outline: false });
  const box = (x0: number, x1: number, y0: number, y1: number, s0: number, s1: number) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, s1 - s0); const c = P((x0 + x1) / 2, (y0 + y1) / 2, (s0 + s1) / 2); g.translate(c.x, c.y, c.z); return g;
  };
  add(pCan, merge([box(-0.24, 0.24, topY(6.3), 3.2, 6.05, 6.55), box(-0.17, 0.17, 3.2, 3.33, 6.32, 6.55)]));
  add(pCan, box(-0.3, 0.3, topY(4.55), 2.97, 4.35, 4.75));
  const scrCanvas = document.createElement('canvas'); scrCanvas.width = 512; scrCanvas.height = 192;
  const scrTex = new THREE.CanvasTexture(scrCanvas); scrTex.colorSpace = THREE.SRGBColorSpace; scrTex.anisotropy = 4;
  const scrMat = new THREE.MeshBasicMaterial({ map: scrTex, toneMapped: false });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.2), scrMat);
  scr.position.copy(P(0, 2.9, 4.79)); scr.lookAt(scr.position.clone().add(new THREE.Vector3(0, 0.75, -0.66)));
  pCan.add(scr);
  pCan.add(E.loopLine([P(-0.14, 2.98, 4.62), P(0.14, 2.98, 4.62), P(0.14, 3.16, 4.70), P(-0.14, 3.16, 4.70)], E.mats.major));
  const cockpitLight = new THREE.PointLight(E.accent.getHex(), 0, 1.9, 2);
  cockpitLight.position.copy(P(0, 3.1, 5.3)); pCan.add(cockpitLight); E.accentLights.push(cockpitLight);

  // ═════ caret intakes ═════
  const pInt = part('intakes');
  for (const k of SIDES) {
    const lip = [P(k * 1.50, 2.13, 5.6), P(k * 0.80, 2.17, 6.05), P(k * 0.78, 1.20, 6.6), P(k * 1.30, 1.20, 6.25)];
    const rings = [lip, ...NAC.map(n => [P(k * n[1], n[2], n[0]), P(k * n[3], n[4], n[0]), P(k * n[5], n[6], n[0]), P(k * n[7], n[8], n[0])])];
    add(pInt, loft(rings, { capEnd: true }).build());
    const c = lip.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(4);
    const mouth = new Geo(); mouth.sheet(lip.map(p => p.clone().lerp(c, 0.07).add(new THREE.Vector3(0, 0, -0.16))), new THREE.Vector3(0, 0, 1));
    add(pInt, mouth.build(), recess, { outline: false, lines: false });
  }

  // ═════ wings, leading-edge flaps, flaperons, ailerons ═════
  const pWing = part('wings'), pLef = part('lef'), pFlap = part('flaperons'), pAil = part('ailerons');
  const lef: Record<number, Hinge> = {}, flap: Record<number, Hinge> = {}, ail: Record<number, Hinge> = {};
  for (const k of SIDES) {
    const n = new THREE.Vector3(k * 0.057, 1, 0);
    const at = (x: number, s: number) => P(k * x, wY(x), s);
    const boxLE = (x: number) => at(x, wLE(x) + lefC(x)), boxTE = (x: number) => at(x, wTE(x) - csC(x));
    add(pWing, slab([WR, WT].map(x => ({ le: boxLE(x), te: boxTE(x), t: wT(x) })), n, BOX_PROF).build());
    lef[k] = hinge(pLef, boxLE(WR), boxLE(WT).sub(boxLE(WR)), 'x');
    add(lef[k].inner, slab([WR, WT].map(x => ({ le: at(x, wLE(x)), te: boxLE(x), t: wT(x) })), n, LEF_PROF).build());
    flap[k] = hinge(pFlap, boxTE(WR), boxTE(FLAP_END).sub(boxTE(WR)), 'x');
    add(flap[k].inner, slab([WR, FLAP_END].map(x => ({ le: boxTE(x), te: at(x, wTE(x)), t: wT(x) })), n, CS_PROF).build());
    ail[k] = hinge(pAil, boxTE(FLAP_END), boxTE(WT).sub(boxTE(FLAP_END)), 'x');
    add(ail[k].inner, slab([FLAP_END + 0.03, WT].map(x => ({ le: boxTE(x), te: at(x, wTE(x)), t: wT(x) })), n, CS_PROF).build());
  }

  // ═════ vertical tails and rudders ═════
  const pFin = part('fins'), pRud = part('rudders');
  const rud: Record<number, Hinge> = {};
  const R0 = 0.4, R1 = 2.25, RC = 0.7;
  for (const k of SIDES) {
    const v = new THREE.Vector3(k * Math.sin(CANT), Math.cos(CANT), 0), n = new THREE.Vector3(k * Math.cos(CANT), -Math.sin(CANT), 0);
    const pt = (h: number, s: number) => P(k * FIN_X, FIN_Y, s).addScaledVector(v, h);
    const full = (h: number) => ({ le: pt(h, fLE(h)), te: pt(h, fTE(h)), t: fT(h) });
    const boxTE = (h: number) => pt(h, lerp(fLE(h), fTE(h), RC));
    const g = new Geo();
    slab([full(0), full(R0)], n, FULL_PROF, { into: g });
    slab([R0, R1].map(h => ({ le: pt(h, fLE(h)), te: boxTE(h), t: fT(h) })), n, [[0, 0.05], [0.4 / RC, 1], [1, 0.5]], { into: g });
    slab([full(R1), full(FH)], n, FULL_PROF, { into: g });
    add(pFin, g.build());
    rud[k] = hinge(pRud, boxTE(R0), boxTE(R1).sub(boxTE(R0)), 'y');
    add(rud[k].inner, slab([R0 + 0.02, R1 - 0.02].map(h => ({ le: boxTE(h), te: pt(h, fTE(h)), t: fT(h) })), n, [[0, 0.5], [1, 0.03]]).build());
  }

  // ═════ stabilators ═════
  const pStab = part('stabs');
  const stab: Record<number, Hinge> = {};
  for (const k of SIDES) {
    stab[k] = hinge(pStab, P(k * SR, SY, 17.3), new THREE.Vector3(1, 0, 0), 'x');
    add(stab[k].inner, slab([SR, ST].map(x => ({ le: P(k * x, SY, sLE(x)), te: P(k * x, SY, sTE(x)), t: sT(x) })), new THREE.Vector3(0, 1, 0), FULL_PROF).build());
  }

  // ═════ nozzles: housings, vectoring flaps, sidewalls ═════
  const pNoz = part('nozzles');
  const nozU: Record<number, Hinge> = {}, nozL: Record<number, Hinge> = {};
  for (const k of SIDES) {
    const c = k * 0.8;
    add(pNoz, loft([rectRing(c - 0.58, c + 0.58, 1.66, 2.62, NOSE_Z - 16.4), rectRing(c - 0.58, c + 0.58, 1.70, 2.60, NOSE_Z - 17.3), rectRing(c - 0.54, c + 0.54, 1.80, 2.48, NOSE_Z - 17.95)]).build());
    const hole = new Geo(); hole.sheet(rectRing(c - 0.52, c + 0.52, 1.82, 2.46, NOSE_Z - 17.9), new THREE.Vector3(0, 0, -1));
    add(pNoz, hole.build(), recess, { outline: false, lines: false });
    nozU[k] = hinge(pNoz, P(c, 2.46, 17.95), new THREE.Vector3(1, 0, 0), 'x');
    add(nozU[k].inner, slab([c - 0.5, c + 0.5].map(x => ({ le: P(x, 2.45, 17.95), te: P(x, 2.37, 18.78), t: 0.09 })), new THREE.Vector3(0, 1, 0), [[0, 0.9], [1, 0.15]]).build());
    nozL[k] = hinge(pNoz, P(c, 1.82, 17.95), new THREE.Vector3(1, 0, 0), 'x');
    add(nozL[k].inner, slab([c - 0.5, c + 0.5].map(x => ({ le: P(x, 1.83, 17.95), te: P(x, 1.91, 18.78), t: 0.09 })), new THREE.Vector3(0, 1, 0), [[0, 0.9], [1, 0.15]]).build());
    for (const sx of [-1, 1]) {
      const x = c + sx * 0.555;
      add(pNoz, slab([{ le: P(x, 1.78, 17.9), te: P(x, 1.78, 18.5), t: 0.05 }, { le: P(x, 2.50, 17.9), te: P(x, 2.50, 18.78), t: 0.05 }], new THREE.Vector3(1, 0, 0), PLATE).build());
    }
  }

  // ═════ landing gear ═════
  const pNG = part('gearNose'), pMG = part('gearMain');
  const cyl = (r: number, y0: number, y1: number, x: number, s: number, seg = 12) => { const g = new THREE.CylinderGeometry(r, r, y1 - y0, seg); const c = P(x, (y0 + y1) / 2, s); g.translate(c.x, c.y, c.z); return g; };
  const wheel = (r: number, w: number, x: number, y: number, s: number) => {
    const t = new THREE.CylinderGeometry(r, r, w, 22); t.rotateZ(Math.PI / 2);
    const h = new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.05, 12); h.rotateZ(Math.PI / 2);
    const g = merge([t, h]); const c = P(x, y, s); g.translate(c.x, c.y, c.z); return g;
  };
  const brace = (a: V, b: V, r: number) => { const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), 8); g.translate(0, d.length() / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(a.x, a.y, a.z); return g; };
  // nose leg (retracts forward)
  const NGS = 4.6;
  const noseGear = hinge(pNG, P(0, 1.45, NGS), new THREE.Vector3(1, 0, 0), 'x');
  add(noseGear.inner, merge([cyl(0.055, 0.62, 1.45, 0, NGS), cyl(0.075, 0.36, 0.86, 0, NGS), box(-0.14, 0.14, 0.33, 0.39, NGS - 0.06, NGS + 0.06), brace(P(0, 0.62, NGS + 0.03), P(0, 1.0, NGS + 0.16), 0.025)]));
  add(noseGear.inner, wheel(0.36, 0.2, 0, 0.36, NGS));
  const taxiMat = E.glowMat();
  const taxiBulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 12), taxiMat); taxiBulb.position.copy(P(0, 1.0, NGS - 0.09)); noseGear.inner.add(taxiBulb);
  const taxiGlow = E.glowPoints([P(0, 1.0, NGS - 0.12)], 0.9); noseGear.inner.add(taxiGlow);
  const noseDoor: Hinge[] = [];
  for (const k of SIDES) {
    const y = bellyY(NGS) - 0.006;
    noseDoor.push(hinge(pNG, P(k * 0.25, y, 4.6), new THREE.Vector3(0, 0, 1), 'z'));
    add(noseDoor[noseDoor.length - 1].inner, slab([{ le: P(k * 0.25, y, 3.95), te: P(k * 0.02, y, 3.95), t: 0.025 }, { le: P(k * 0.25, y, 5.25), te: P(k * 0.02, y, 5.25), t: 0.025 }], new THREE.Vector3(0, 1, 0), PLATE).build());
  }
  const ngY = bellyY(NGS) - 0.002, ngWell = new Geo();
  ngWell.sheet([P(-0.25, ngY, 3.95), P(0.25, ngY, 3.95), P(0.25, ngY, 5.25), P(-0.25, ngY, 5.25)], new THREE.Vector3(0, -1, 0));
  add(pNG, ngWell.build(), recess, { outline: false, lines: false });
  // main legs (fold forward under the wing roots)
  const MGS = 11.6, MGY = 2.1;
  const mainGear: Record<number, Hinge> = {}, mainDoor: Record<number, Hinge> = {};
  for (const k of SIDES) {
    const x = k * 1.62;
    mainGear[k] = hinge(pMG, P(x, MGY, MGS), new THREE.Vector3(1, 0, 0), 'x');
    add(mainGear[k].inner, merge([cyl(0.075, 0.7, MGY, x, MGS), cyl(0.095, 0.42, 1.05, x, MGS), box(x - 0.2 * k - 0.04, x - 0.2 * k + 0.04, 0.38, 0.46, MGS - 0.05, MGS + 0.05), brace(P(x, 1.25, MGS), P(k * 1.32, 2.0, MGS - 0.5), 0.035)]));
    add(mainGear[k].inner, wheel(0.42, 0.28, x + k * 0.02, 0.42, MGS));
    const y = 2.115;
    mainDoor[k] = hinge(pMG, P(k * 1.9, y, MGS), new THREE.Vector3(0, 0, 1), 'z');
    add(mainDoor[k].inner, slab([{ le: P(k * 1.9, y, 10.3), te: P(k * 1.38, y, 10.3), t: 0.025 }, { le: P(k * 1.9, y, 12.5), te: P(k * 1.38, y, 12.5), t: 0.025 }], new THREE.Vector3(0, 1, 0), PLATE).build());
    const well = new Geo(); well.sheet([P(k * 1.38, y + 0.01, 10.3), P(k * 1.9, y + 0.01, 10.3), P(k * 1.9, y + 0.01, 12.5), P(k * 1.38, y + 0.01, 12.5)], new THREE.Vector3(0, -1, 0));
    add(pMG, well.build(), recess, { outline: false, lines: false });
  }

  // ═════ weapons bays ═════
  const pBay = part('bayMain'), pSide = part('baySide');
  const missileGeo = (len: number, r: number, fin: number, mid: boolean) => {
    const parts: THREE.BufferGeometry[] = [];
    // octagonal body: 45° facets are sharper than the crease threshold, so hairlines run the length of each missile
    // (a smooth cylinder has no creases and reads as transparent against the dark panel)
    const b = new THREE.CylinderGeometry(r, r, len * 0.86, 8, 1, false, Math.PI / 8); b.rotateX(Math.PI / 2); b.translate(0, 0, -len * 0.07); parts.push(b);
    const nc = new THREE.ConeGeometry(r, len * 0.14, 8, 1, false, Math.PI / 8); nc.rotateX(Math.PI / 2); nc.translate(0, 0, len * 0.43); parts.push(nc);
    const fins = (span: number, chord: number, z: number) => { for (let i = 0; i < 4; i++) { const f = new THREE.BoxGeometry(span, 0.01, chord); f.translate(r + span / 2, 0, z); f.rotateZ(Math.PI / 4 + i * Math.PI / 2); parts.push(f); } };
    fins(fin, 0.24, -len * 0.45);
    if (mid) fins(fin * 0.7, 0.3, len * 0.02);
    return merge(parts);
  };
  const s0 = 6.9, s1 = 10.6;
  const bayDoor: Hinge[] = [];
  for (const k of SIDES) {
    const h = hinge(pBay, P(k * 0.75, bellyY(8.75) - 0.006, 8.75), new THREE.Vector3(0, 0, 1), 'z');
    add(h.inner, slab([s0, s1].map(s => ({ le: P(k * 0.75, bellyY(s) - 0.008, s), te: P(k * 0.02, bellyY(s) - 0.008, s), t: 0.025 })), new THREE.Vector3(0, 1, 0), PLATE).build());
    bayDoor.push(h);
  }
  const bayWell = new Geo(); bayWell.sheet([P(-0.75, bellyY(s0) - 0.003, s0), P(0.75, bellyY(s0) - 0.003, s0), P(0.75, bellyY(s1) - 0.003, s1), P(-0.75, bellyY(s1) - 0.003, s1)], new THREE.Vector3(0, -1, 0));
  add(pBay, bayWell.build(), recess, { outline: false, lines: false });
  // seeker heads light up (accent) once a launcher has the missile out in the airflow, armed
  const seekerMat = E.glowMat(), seekerGlows: ReturnType<Engine['glowPoints']>[] = [];
  const seeker = (parent: THREE.Object3D, at: V, r: number) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10), seekerMat); m.position.copy(at); parent.add(m);
    const g = E.glowPoints([at.clone().add(new THREE.Vector3(0, 0, r))], 0.55); parent.add(g); seekerGlows.push(g);
  };
  const amraam = missileGeo(3.5, 0.09, 0.16, true);
  const bayMissiles: { g: THREE.Group; drop: number; rail: THREE.Mesh }[] = [];
  // LAU-142/A launchers: each arm extends to push its missile below the open doors
  for (const [x, drop] of [[0.22, 0.8], [-0.22, 0.8], [0.53, 1.04], [-0.53, 1.04]] as const) {
    const g = new THREE.Group(); g.position.copy(P(x, bellyY(8.75) + 0.2, 8.75)); pBay.add(g);
    add(g, amraam);
    seeker(g, new THREE.Vector3(0, 0, 3.5 * 0.47), 0.045);
    const railGeo = new THREE.BoxGeometry(0.05, 1, 1.3); railGeo.translate(0, 0.5, 0);
    const rail = add(g, railGeo);
    bayMissiles.push({ g, drop, rail });
  }
  const sideDoor: Record<number, Hinge> = {}, sideRack: Record<number, Hinge> = {};
  const sidewinder = missileGeo(2.9, 0.064, 0.13, false);
  for (const k of SIDES) {
    const a = 7.4, b = 10.0, f0 = 0.12, f1 = 0.86;
    const wn = (s: number) => { const t = wallPt(k, s, 0), u = wallPt(k, s, 1); const d = u.sub(t); return new THREE.Vector3(-d.y, d.x, 0).normalize().multiplyScalar(k); };
    const off = (p: V, s: number, d: number) => p.addScaledVector(wn(s), d);
    sideDoor[k] = hinge(pSide, off(wallPt(k, a, f0), a, 0.02), off(wallPt(k, b, f0), b, 0.02).sub(off(wallPt(k, a, f0), a, 0.02)), 'z');
    add(sideDoor[k].inner, slab([{ le: off(wallPt(k, a, f0), a, 0.02), te: off(wallPt(k, b, f0), b, 0.02), t: 0.025 }, { le: off(wallPt(k, a, f1), a, 0.02), te: off(wallPt(k, b, f1), b, 0.02), t: 0.025 }], wn(8.7), PLATE).build());
    const well = new Geo(); well.sheet([a, b, b, a].map((s, i) => off(wallPt(k, s, i < 2 ? f0 : f1), s, 0.006)), wn(8.7));
    add(pSide, well.build(), recess, { outline: false, lines: false });
    // trapeze: swings the Sidewinder out of the wall
    const piv = off(wallPt(k, 8.7, 0.08), 8.7, -0.12);
    sideRack[k] = hinge(pSide, piv, new THREE.Vector3(0, 0, 1), 'z');
    const down = wallPt(k, 8.7, 1).sub(wallPt(k, 8.7, 0)).normalize(), inward = wn(8.7).negate();
    const mPos = piv.clone().addScaledVector(down, 0.62).addScaledVector(inward, 0.1);
    const mg = sidewinder.clone(); mg.translate(mPos.x, mPos.y, mPos.z);
    add(sideRack[k].inner, mg);
    seeker(sideRack[k].inner, mPos.clone().add(new THREE.Vector3(0, 0, 2.9 * 0.47)), 0.035);
    add(sideRack[k].inner, brace(piv, mPos.clone().addScaledVector(down, -0.07), 0.025));
  }

  // ═════ refuelling receptacle door ═════
  const pRef = part('refuel');
  const refuelDoor = hinge(pRef, P(0, topY(10.5) + 0.004, 10.5), new THREE.Vector3(1, 0, 0), 'x');
  add(refuelDoor.inner, slab([9.6, 10.5].map(s => ({ le: P(-0.17, topY(s, 0.17) + 0.012, s), te: P(0.17, topY(s, 0.17) + 0.012, s), t: 0.02 })), new THREE.Vector3(0, 1, 0), [[0, 1], [0.5, 1.6], [1, 1]]).build());
  const refWell = new Geo(); refWell.sheet([P(-0.17, topY(9.6) + 0.003, 9.6), P(0.17, topY(9.6) + 0.003, 9.6), P(0.17, topY(10.5) + 0.003, 10.5), P(-0.17, topY(10.5) + 0.003, 10.5)], new THREE.Vector3(0, 1, 0));
  add(pRef, refWell.build(), recess, { outline: false, lines: false });

  // ═════ lights: formation strips, position lights, beacons ═════
  const pLights = part('lights');
  const stripMat = E.glowMat(), navMat = E.glowMat(), beaconMat = E.glowMat();
  const strips = new Geo(), stripPts: V[] = [];
  const strip = (a: V, b: V, side: V, out: V, w = 0.035) => {
    const sd = side.clone().normalize().multiplyScalar(w), o = out.clone().normalize().multiplyScalar(0.012);
    strips.sheet([a.clone().add(sd).add(o), b.clone().add(sd).add(o), b.clone().sub(sd).add(o), a.clone().sub(sd).add(o)], out);
    for (let i = 0; i <= 2; i++) stripPts.push(a.clone().lerp(b, 0.15 + 0.35 * i).add(o));
  };
  for (const k of SIDES) {
    const face = (s: number) => { const f = fus(s); return P(k * lerp(f.wC, f.wL, 0.22), lerp(f.yC, f.yL, 0.22), s); };
    const fo = (s: number) => { const f = fus(s); return new THREE.Vector3(k * (f.yC - f.yL), -(f.wC - f.wL), 0); };
    const f25 = fus(2.5);
    strip(face(2.0), face(3.0), new THREE.Vector3(k * (f25.wL - f25.wC), f25.yL - f25.yC, 0), fo(2.5));
    const tx = WT - 0.1;
    strip(P(k * tx, wY(tx) + wT(tx) * 0.3, wLE(tx) + 0.6), P(k * tx, wY(tx) + wT(tx) * 0.3, wTE(tx) - 0.3), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), 0.03);
    const v = new THREE.Vector3(k * Math.sin(CANT), Math.cos(CANT), 0), n = new THREE.Vector3(k * Math.cos(CANT), -Math.sin(CANT), 0);
    const fh = 2.5, fp = (s: number) => P(k * FIN_X, FIN_Y, s).addScaledVector(v, fh).addScaledVector(n, fT(fh) * 0.4);
    strip(fp(fLE(fh) + 0.35), fp(fTE(fh) - 0.25), v, n);
    strip(P(k * 1.79, SY, 16.3), P(k * 1.79, SY, 17.6), new THREE.Vector3(0, 1, 0), new THREE.Vector3(k, 0, 0), 0.03);
  }
  add(pLights, strips.build(), stripMat, { outline: false, lines: false });
  const stripGlow = E.glowPoints(stripPts, 0.32); pLights.add(stripGlow);
  const navPos = SIDES.map(k => P(k * (WT - 0.02), wY(WT), wLE(WT) + 0.12));
  navPos.forEach(p => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 12), navMat); m.position.copy(p); pLights.add(m); });
  const navGlow = E.glowPoints(navPos, 1.0); pLights.add(navGlow);
  const beaconPos = [P(0, topY(11.4) + 0.05, 11.4), P(0, bellyY(12.8) - 0.05, 12.8)];
  beaconPos.forEach(p => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 20), beaconMat); m.position.copy(p); pLights.add(m); });
  const beaconGlow = E.glowPoints(beaconPos, 1.5); pLights.add(beaconGlow);

  // ═════ apron (stays on the ground) ═════
  const deck = new THREE.Group(); E.scene.add(deck);
  const DW = 30, DD = 40, DZ = NOSE_Z - 9.45;
  { const b = new THREE.Mesh(new THREE.BoxGeometry(DW, 0.12, DD), E.mats.pad); b.position.set(0, -0.065, DZ); deck.add(b);
    b.add(E.fat(Array.from(new THREE.EdgesGeometry(b.geometry, 30).attributes.position.array as Float32Array), E.mats.major)); }
  const ln: number[] = [], dl: number[] = [];
  const seg = (arr: number[], x0: number, z0: number, x1: number, z1: number) => arr.push(x0, 0.004, z0, x1, 0.004, z1);
  seg(ln, 0, DZ + DD / 2 - 0.4, 0, DZ - DD / 2 + 0.4);                              // taxi line
  const stopZ = NOSE_Z - (NGS - 0.55); seg(ln, -1.2, stopZ, 1.2, stopZ);              // stop bar ahead of the nose wheel
  for (const x of [-0.25, 0.25]) seg(ln, x, stopZ + 0.4, x, stopZ + 3.5);
  const bx = 7.6, bz0 = NOSE_Z + 0.8, bz1 = NOSE_Z - 19.8;                            // dashed wing-walk box
  const dash = (x0: number, z0: number, x1: number, z1: number) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / 1.2); for (let i = 0; i < n; i++) { const a = i / n, b = (i + 0.55) / n; seg(dl, lerp(x0, x1, a), lerp(z0, z1, a), lerp(x0, x1, b), lerp(z0, z1, b)); } };
  dash(-bx, bz0, bx, bz0); dash(bx, bz0, bx, bz1); dash(bx, bz1, -bx, bz1); dash(-bx, bz1, -bx, bz0);
  for (let x = -12; x <= 12; x += 4) for (let z = DZ - 16; z <= DZ + 16; z += 4) {     // tie-down rings outside the box
    if (Math.abs(x) < bx + 1 && z < bz0 + 1 && z > bz1 - 1) continue;
    for (let i = 0; i < 16; i++) { const t0 = i / 16 * Math.PI * 2, t1 = (i + 1) / 16 * Math.PI * 2; seg(dl, x + 0.16 * Math.cos(t0), z + 0.16 * Math.sin(t0), x + 0.16 * Math.cos(t1), z + 0.16 * Math.sin(t1)); }
  }
  deck.add(E.fat(ln, E.mats.major), E.fat(dl, E.mats.line));
  const padLightMat = E.glowMat(), padPts: V[] = [];
  for (let i = 0; i <= 9; i++) { const z = DZ - DD / 2 + 0.5 + (DD - 1) * i / 9; padPts.push(new THREE.Vector3(-DW / 2 + 0.5, 0.05, z), new THREE.Vector3(DW / 2 - 0.5, 0.05, z)); }
  for (let i = 1; i < 8; i++) { const x = -DW / 2 + 0.5 + (DW - 1) * i / 8; padPts.push(new THREE.Vector3(x, 0.05, DZ - DD / 2 + 0.5), new THREE.Vector3(x, 0.05, DZ + DD / 2 - 0.5)); }
  for (let z = DZ + DD / 2 - 1.5; z > NOSE_Z + 1; z -= 2.5) padPts.push(new THREE.Vector3(0, 0.03, z));        // centre-line lights ahead
  const lampGeo = new THREE.SphereGeometry(0.06, 16, 10);
  padPts.forEach(p => { const m = new THREE.Mesh(lampGeo, padLightMat); m.position.copy(p); deck.add(m); });
  const padGlow = E.glowPoints(padPts.map(p => p.clone().setY(0.07)), 1.2); deck.add(padGlow);
  const flat = (w: number, d: number, mat: THREE.Material, x: number, z: number, y = 0.01) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.raycast = () => {}; deck.add(m); return m; };
  const shadowMat = E.softMat(0x000000, false), taxiPoolMat = E.softMat(0xffffff, true);
  flat(10, 21, shadowMat, 0, NOSE_Z - 9.6);
  flat(4.2, 8, taxiPoolMat, 0, NOSE_Z + 3.6, 0.02);

  E.setPickRoot(air);
  return {
    craft, air, parts, deck,
    lef, flap, ail, rud, stab, nozU, nozL,
    canopyH, refuelDoor, noseGear, noseDoor, mainGear, mainDoor, bayDoor, bayMissiles, sideDoor, sideRack, seekerMat, seekerGlows,
    gearLegs: [noseGear.outer, mainGear[1].outer, mainGear[-1].outer],
    lights: { stripMat, navMat, beaconMat, taxiMat, padLightMat, stripGlow, navGlow, beaconGlow, taxiGlow, padGlow, shadowMat, taxiPoolMat, cockpitLight },
    screen: { canvas: scrCanvas, tex: scrTex },
  };
}

export type Raptor = ReturnType<typeof buildRaptor>;
export { DEG };
