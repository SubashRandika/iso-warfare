// F-22 Raptor airframe, built from faceted lofts and aerofoil slabs in metres.
// Axes: +y up, +z forward. `s` is the distance aft of the nose tip, so P(x, y, s) puts a point on the aircraft.
// Side k = +1 is the port (left) side at +x, k = −1 the starboard side.
import * as THREE from 'three';
import type { Engine } from '../../../iso/engine';
import { Geo, loft, slab, rectRing, merge } from '../../../iso/geo';
import { makeKit, DEG, SIDES, PLATE, ease, clamp01 } from '../jet/kit';
import { buildApron } from '../../../stages/apron';
import type { Hinge, JetRig, JetState } from '../jet/types';
import { cockpitMaterials, cockpitMesh, consoleBox, ejectionSeat, glareshield, hud, instrumentPanel, sideStick, throttles } from '../jet/cockpit';

type V = THREE.Vector3;
const NOSE_Z = 9.45;
const P = (x: number, y: number, s: number) => new THREE.Vector3(x, y, NOSE_Z - s);
const lerp = THREE.MathUtils.lerp;

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
const FH = 2.65, CANT = 28 * DEG, FIN_X = 1.2, FIN_Y = 2.74;
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

export function buildRaptor(E: Engine): JetRig {
  const { recess, glass } = E.mats;
  const K = makeKit(E, NOSE_Z, 2.2);
  const { craft, parts, part, add, hinge, box, cyl, wheel, brace, well, missileGeo, launcher, seekerMat, seekerGlows, strip } = K;

  // ═════ airframe: fuselage, booms, stinger ═════
  const pAir = part('airframe');
  const stations = (a: number, b: number) => FUS.map(r => r[0]).filter(s => s >= a && s <= b);
  const fuseLine = add(pAir, loft(stations(3.2, 17.4).map(fusRing), { capEnd: true }).build());
  for (const k of SIDES) {
    const c = k * 1.62, ring = (s: number, hw: number, hh: number) => [P(c, SY + hh, s), P(c + hw, SY, s), P(c, SY - hh, s), P(c - hw, SY, s)];
    add(pAir, loft([ring(14.6, 0.02, 0.02), ring(15.6, 0.16, 0.22), ring(18.2, 0.16, 0.2), ring(18.8, 0.04, 0.05)], { capStart: true, capEnd: true }).build());
  }
  add(pAir, loft([rectRing(-0.2, 0.2, 2.0, 2.55, NOSE_Z - 17.2), rectRing(-0.16, 0.16, 2.08, 2.42, NOSE_Z - 18.0), rectRing(-0.06, 0.06, 2.18, 2.3, NOSE_Z - 18.45)], { capEnd: true }).build());
  { // panel seams on the spine (hairline detail)
    const seam: number[] = [];
    for (const s of [8.9, 12.1, 14.9]) { const f = fus(s); [[-f.wU, f.yU], [0, f.yT], [f.wU, f.yU]].reduce((a, b) => { const A = P(a[0], a[1] + 0.004, s), B = P(b[0], b[1] + 0.004, s); seam.push(A.x, A.y, A.z, B.x, B.y, B.z); return b; }); }
    pAir.add(E.fat(seam, E.mats.line));
  }

  // ═════ radome & forebody ═════
  add(part('radome'), loft(stations(0, 3.2).map(fusRing)).build());

  // ═════ canopy & cockpit ═════
  const pCan = part('canopy');
  const CAN = [[3.3, 0.06, 0.03], [3.8, 0.30, 0.30], [4.4, 0.45, 0.50], [5.0, 0.53, 0.62], [5.6, 0.56, 0.66], [6.2, 0.54, 0.61], [6.8, 0.48, 0.50], [7.3, 0.38, 0.34], [7.8, 0.25, 0.14]];
  const canAt = (s: number) => { let i = 0; while (i < CAN.length - 2 && CAN[i + 1][0] < s) i++; const a = CAN[i], b = CAN[i + 1], t = THREE.MathUtils.clamp((s - a[0]) / (b[0] - a[0]), 0, 1); return { w: lerp(a[1], b[1], t), h: lerp(a[2], b[2], t) }; };
  const NA = 16;
  const canRing = (s: number) => { const { w, h } = canAt(s); return Array.from({ length: NA + 1 }, (_, i) => { const th = Math.PI * i / NA, x = w * Math.cos(th); return P(x, topY(s, x) - 0.01 + h * Math.sin(th), s); }); };
  const canS = Array.from({ length: 23 }, (_, i) => 3.3 + (7.8 - 3.3) * i / 22);
  const canopyH = hinge(pCan, P(0, topY(7.9), 7.9), new THREE.Vector3(1, 0, 0), 'x');   // hinged at the rear
  add(canopyH.inner, loft(canS.map(canRing), { open: true, capEnd: true }).build(), glass, { outline: false }).renderOrder = 3;
  canopyH.inner.add(E.loopLine(canRing(7.45).map(p => p.clone().add(new THREE.Vector3(0, 0.006, 0))), E.mats.major, false));   // rear bow
  // cockpit tub, seat, coaming, display and HUD frame
  const tub = new Geo();
  const tubRings = Array.from({ length: 12 }, (_, i) => { const s = 3.9 + 3.7 * i / 11, w = canAt(s).w * 0.94; return [P(-w, topY(s, w) + 0.012, s), P(0, topY(s) + 0.012, s), P(w, topY(s, w) + 0.012, s)]; });
  for (let i = 0; i < tubRings.length - 1; i++) for (let j = 0; j < 2; j++) tub.quad(tubRings[i][j], tubRings[i][j + 1], tubRings[i + 1][j + 1], tubRings[i + 1][j], P(0, 0, 5.5));
  const lineCockpit = [
    add(pCan, tub.build(), recess, { outline: false }),
    add(pCan, merge([box(-0.24, 0.24, topY(6.3), 3.2, 6.05, 6.55), box(-0.17, 0.17, 3.2, 3.33, 6.32, 6.55)])),
    add(pCan, box(-0.3, 0.3, topY(4.55), 2.97, 4.35, 4.75)),
  ];
  const { screen, cockpitLight, mesh: screenMesh } = K.cockpitDisplay(pCan, P(0, 2.9, 4.79), new THREE.Vector3(0, 0.75, -0.66), 0.54, 0.2, P(0, 3.1, 5.3));
  pCan.add(E.loopLine([P(-0.14, 2.98, 4.62), P(0.14, 2.98, 4.62), P(0.14, 3.16, 4.70), P(-0.14, 3.16, 4.70)], E.mats.major));   // HUD combiner

  // ── Real view only: the fuselage gets a true cockpit opening under the canopy, with a tub and real furniture ──
  // The opening follows the canopy footprint and closes to a point fore and aft, so the skin rings stay continuous.
  const S0 = 3.4, S1 = 7.75, T0 = 4.45, T1 = 6.75, YF = 2.02;
  const hw = (s: number) => s <= S0 || s >= S1 ? 0 : 0.9 * canAt(s).w * Math.pow(Math.sin(Math.PI * (s - S0) / (S1 - S0)), 0.25);
  const ring11 = (s: number) => {
    const f = fus(s), h = hw(s);
    return [P(h, topY(s, h), s), P(f.wU, f.yU, s), P(f.wC, f.yC, s), P(f.wL, f.yL, s), P(f.wB, f.yB, s), P(0, f.yB, s),
      P(-f.wB, f.yB, s), P(-f.wL, f.yL, s), P(-f.wC, f.yC, s), P(-f.wU, f.yU, s), P(-h, topY(s, h), s)];
  };
  const span = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
  const cutSkin = new Geo();
  loft([3.2, S0].map(ring11), { into: cutSkin });
  loft(span(S0, S1, 26).map(ring11), { open: true, into: cutSkin });
  loft([S1, ...stations(8.3, 17.4)].map(ring11), { capEnd: true, into: cutSkin });
  const fuseReal = add(pAir, cutSkin.build(), undefined, { lines: false });
  const ckpt = new THREE.Group(); pCan.add(ckpt);
  const CM = cockpitMaterials();
  const sill = (k: number, s: number, dy = -0.006) => P(k * hw(s), topY(s, hw(s)) + dy, s);
  const floorPt = (k: number, s: number) => P(k * hw(s) * 0.94, YF, s);
  { // tub: side walls, floor, front wall behind the panel, bulkhead behind the seat
    const g = new Geo(), ref = P(0, 2.4, 5.6), ts = span(T0, T1, 14);
    for (let i = 0; i < ts.length - 1; i++) {
      const a = ts[i], b = ts[i + 1];
      for (const k of SIDES) g.quad(sill(k, a), sill(k, b), floorPt(k, b), floorPt(k, a), ref);
      g.quad(floorPt(1, a), floorPt(1, b), floorPt(-1, b), floorPt(-1, a), ref);
    }
    for (const s of [T0, T1]) g.quad(sill(1, s), sill(-1, s), floorPt(-1, s), floorPt(1, s), ref);
    cockpitMesh(g.build(), CM.tub, ckpt);
  }
  const deck = (a: number, b: number, m: THREE.Material) => {        // flush covers fore and aft of the tub
    const g = new Geo(), ss = span(a, b, 12);
    for (let i = 0; i < ss.length - 1; i++) g.quad(sill(1, ss[i], -0.004), sill(1, ss[i + 1], -0.004), sill(-1, ss[i + 1], -0.004), sill(-1, ss[i], -0.004), P(0, 0, (a + b) / 2));
    cockpitMesh(g.build(), m, ckpt);
  };
  deck(S0, T0, CM.panel); deck(T1, S1, CM.tub);
  for (const k of SIDES) {                                            // canopy seals along the sills
    const curve = new THREE.CatmullRomCurve3(span(T0 - 0.35, S1 - 0.2, 24).map(s => sill(k, s, 0.004)));
    cockpitMesh(new THREE.TubeGeometry(curve, 72, 0.013, 8), CM.rubber, ckpt);
  }
  // ACES II proportions: about 0.95 m from cushion to headrest top, so the head box clears the closed canopy
  const seat = ejectionSeat(CM); seat.scale.setScalar(0.84); seat.position.copy(P(0, 2.18, 6.0)); ckpt.add(seat);
  const panel = instrumentPanel(CM, screen.tex); panel.position.copy(P(0, 2.47, 4.74)); panel.rotation.x = 15 * DEG; ckpt.add(panel);
  const shield = glareshield(CM, 0.8, 0.34); shield.position.copy(P(0, 2.79, 4.66)); ckpt.add(shield);
  const hudSet = hud(CM); hudSet.group.position.copy(P(0, 2.845, 4.6)); ckpt.add(hudSet.group);
  for (const k of SIDES) { const c = consoleBox(CM, 0.2, 2.42 - YF, 1.1); c.position.copy(P(k * 0.37, (2.42 + YF) / 2, 5.8)); ckpt.add(c); }
  const stick = sideStick(CM); stick.position.copy(P(-0.37, 2.42, 5.62)); ckpt.add(stick);           // right hand (−x)
  const thr = throttles(CM); thr.position.copy(P(0.37, 2.42, 5.8)); ckpt.add(thr);                  // left hand
  for (const k of SIDES) cockpitMesh(new THREE.BoxGeometry(0.07, 0.16, 0.03), CM.metal, ckpt, P(k * 0.13, 2.12, 4.98), -0.3);   // rudder pedals
  fuseReal.visible = false; ckpt.visible = false;

  // ═════ caret intakes ═════
  const pInt = part('intakes');
  for (const k of SIDES) {
    const lip = [P(k * 1.50, 2.13, 5.6), P(k * 0.80, 2.17, 6.05), P(k * 0.78, 1.20, 6.6), P(k * 1.30, 1.20, 6.25)];
    const rings = [lip, ...NAC.map(n => [P(k * n[1], n[2], n[0]), P(k * n[3], n[4], n[0]), P(k * n[5], n[6], n[0]), P(k * n[7], n[8], n[0])])];
    add(pInt, loft(rings, { capEnd: true }).build());
    const c = lip.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(4);
    well(pInt, lip.map(p => p.clone().lerp(c, 0.07).add(new THREE.Vector3(0, 0, -0.16))), new THREE.Vector3(0, 0, 1), 'intake');
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
    add(pNoz, loft([rectRing(c - 0.58, c + 0.58, 1.66, 2.62, NOSE_Z - 16.4), rectRing(c - 0.58, c + 0.58, 1.70, 2.60, NOSE_Z - 17.3), rectRing(c - 0.54, c + 0.54, 1.80, 2.48, NOSE_Z - 17.95)]).build(), undefined, { real: 'nozzle' });
    well(pNoz, rectRing(c - 0.52, c + 0.52, 1.82, 2.46, NOSE_Z - 17.9), new THREE.Vector3(0, 0, -1), 'exhaust');
    nozU[k] = hinge(pNoz, P(c, 2.46, 17.95), new THREE.Vector3(1, 0, 0), 'x');
    add(nozU[k].inner, slab([c - 0.5, c + 0.5].map(x => ({ le: P(x, 2.45, 17.95), te: P(x, 2.37, 18.78), t: 0.09 })), new THREE.Vector3(0, 1, 0), [[0, 0.9], [1, 0.15]]).build(), undefined, { real: 'nozzle' });
    nozL[k] = hinge(pNoz, P(c, 1.82, 17.95), new THREE.Vector3(1, 0, 0), 'x');
    add(nozL[k].inner, slab([c - 0.5, c + 0.5].map(x => ({ le: P(x, 1.83, 17.95), te: P(x, 1.91, 18.78), t: 0.09 })), new THREE.Vector3(0, 1, 0), [[0, 0.9], [1, 0.15]]).build(), undefined, { real: 'nozzle' });
    for (const sx of [-1, 1]) {
      const x = c + sx * 0.555;
      add(pNoz, slab([{ le: P(x, 1.78, 17.9), te: P(x, 1.78, 18.5), t: 0.05 }, { le: P(x, 2.50, 17.9), te: P(x, 2.50, 18.78), t: 0.05 }], new THREE.Vector3(1, 0, 0), PLATE).build(), undefined, { real: 'nozzle' });
    }
  }

  // ═════ landing gear ═════
  const pNG = part('gearNose'), pMG = part('gearMain');
  // nose leg (retracts forward)
  const NGS = 4.6;
  const noseGear = hinge(pNG, P(0, 1.45, NGS), new THREE.Vector3(1, 0, 0), 'x');
  add(noseGear.inner, merge([cyl(0.055, 0.62, 1.45, 0, NGS), cyl(0.075, 0.36, 0.86, 0, NGS), box(-0.14, 0.14, 0.33, 0.39, NGS - 0.06, NGS + 0.06), brace(P(0, 0.62, NGS + 0.03), P(0, 1.0, NGS + 0.16), 0.025)]), undefined, { real: 'strut' });
  add(noseGear.inner, wheel(0.36, 0.2, 0, 0.36, NGS));
  const taxiGlow = K.taxiLight(noseGear.inner, P(0, 1.0, NGS - 0.09));
  const noseDoor: Hinge[] = [];
  for (const k of SIDES) {
    const y = bellyY(NGS) - 0.006, h = hinge(pNG, P(k * 0.25, y, 4.6), new THREE.Vector3(0, 0, 1), 'z');
    add(h.inner, slab([{ le: P(k * 0.25, y, 3.95), te: P(k * 0.02, y, 3.95), t: 0.025 }, { le: P(k * 0.25, y, 5.25), te: P(k * 0.02, y, 5.25), t: 0.025 }], new THREE.Vector3(0, 1, 0), PLATE).build());
    noseDoor.push(h);
  }
  const ngY = bellyY(NGS) - 0.002;
  well(pNG, [P(-0.25, ngY, 3.95), P(0.25, ngY, 3.95), P(0.25, ngY, 5.25), P(-0.25, ngY, 5.25)], new THREE.Vector3(0, -1, 0), 'well');
  // main legs (fold forward under the wing roots)
  const MGS = 11.6, MGY = 2.1;
  const mainGear: Record<number, Hinge> = {}, mainDoor: Record<number, Hinge> = {};
  for (const k of SIDES) {
    const x = k * 1.62;
    mainGear[k] = hinge(pMG, P(x, MGY, MGS), new THREE.Vector3(1, 0, 0), 'x');
    add(mainGear[k].inner, merge([cyl(0.075, 0.7, MGY, x, MGS), cyl(0.095, 0.42, 1.05, x, MGS), box(x - 0.2 * k - 0.04, x - 0.2 * k + 0.04, 0.38, 0.46, MGS - 0.05, MGS + 0.05), brace(P(x, 1.25, MGS), P(k * 1.32, 2.0, MGS - 0.5), 0.035)]), undefined, { real: 'strut' });
    add(mainGear[k].inner, wheel(0.42, 0.28, x + k * 0.02, 0.42, MGS));
    const y = 2.115;
    mainDoor[k] = hinge(pMG, P(k * 1.9, y, MGS), new THREE.Vector3(0, 0, 1), 'z');
    add(mainDoor[k].inner, slab([{ le: P(k * 1.9, y, 10.3), te: P(k * 1.38, y, 10.3), t: 0.025 }, { le: P(k * 1.9, y, 12.5), te: P(k * 1.38, y, 12.5), t: 0.025 }], new THREE.Vector3(0, 1, 0), PLATE).build());
    well(pMG, [P(k * 1.38, y + 0.01, 10.3), P(k * 1.9, y + 0.01, 10.3), P(k * 1.9, y + 0.01, 12.5), P(k * 1.38, y + 0.01, 12.5)], new THREE.Vector3(0, -1, 0), 'well');
  }

  // ═════ weapons bays ═════
  const pBay = part('bayMain'), pSide = part('baySide');
  const s0 = 6.9, s1 = 10.6;
  const bayDoor: Hinge[] = [];
  for (const k of SIDES) {
    const h = hinge(pBay, P(k * 0.75, bellyY(8.75) - 0.006, 8.75), new THREE.Vector3(0, 0, 1), 'z');
    add(h.inner, slab([s0, s1].map(s => ({ le: P(k * 0.75, bellyY(s) - 0.008, s), te: P(k * 0.02, bellyY(s) - 0.008, s), t: 0.025 })), new THREE.Vector3(0, 1, 0), PLATE).build());
    bayDoor.push(h);
  }
  well(pBay, [P(-0.75, bellyY(s0) - 0.003, s0), P(0.75, bellyY(s0) - 0.003, s0), P(0.75, bellyY(s1) - 0.003, s1), P(-0.75, bellyY(s1) - 0.003, s1)], new THREE.Vector3(0, -1, 0), 'bay');
  const amraam = missileGeo(3.5, 0.09, 0.16, true);
  // LAU-142/A launchers: each arm extends to push its missile below the open doors
  const bayMissiles = ([[0.22, 0.8], [-0.22, 0.8], [0.53, 1.04], [-0.53, 1.04]] as const)
    .map(([x, drop]) => launcher(pBay, amraam, P(x, bellyY(8.75) + 0.2, 8.75), 3.5, drop, 0.045));
  const sideDoor: Record<number, Hinge> = {}, sideRack: Record<number, Hinge> = {};
  const sidewinder = missileGeo(2.9, 0.064, 0.13, false);
  for (const k of SIDES) {
    const a = 7.4, b = 10.0, f0 = 0.12, f1 = 0.86;
    const wn = (s: number) => { const t = wallPt(k, s, 0), u = wallPt(k, s, 1); const d = u.sub(t); return new THREE.Vector3(-d.y, d.x, 0).normalize().multiplyScalar(k); };
    const off = (p: V, s: number, d: number) => p.addScaledVector(wn(s), d);
    sideDoor[k] = hinge(pSide, off(wallPt(k, a, f0), a, 0.02), off(wallPt(k, b, f0), b, 0.02).sub(off(wallPt(k, a, f0), a, 0.02)), 'z');
    add(sideDoor[k].inner, slab([{ le: off(wallPt(k, a, f0), a, 0.02), te: off(wallPt(k, b, f0), b, 0.02), t: 0.025 }, { le: off(wallPt(k, a, f1), a, 0.02), te: off(wallPt(k, b, f1), b, 0.02), t: 0.025 }], wn(8.7), PLATE).build());
    well(pSide, [a, b, b, a].map((s, i) => off(wallPt(k, s, i < 2 ? f0 : f1), s, 0.006)), wn(8.7), 'bay');
    // trapeze: swings the Sidewinder out of the wall
    const piv = off(wallPt(k, 8.7, 0.08), 8.7, -0.12);
    sideRack[k] = hinge(pSide, piv, new THREE.Vector3(0, 0, 1), 'z');
    const down = wallPt(k, 8.7, 1).sub(wallPt(k, 8.7, 0)).normalize(), inward = wn(8.7).negate();
    const mPos = piv.clone().addScaledVector(down, 0.62).addScaledVector(inward, 0.1);
    const mg = sidewinder.clone(); mg.translate(mPos.x, mPos.y, mPos.z);
    add(sideRack[k].inner, mg);
    K.seeker(sideRack[k].inner, mPos.clone().add(new THREE.Vector3(0, 0, 2.9 * 0.47)), 0.035);
    add(sideRack[k].inner, brace(piv, mPos.clone().addScaledVector(down, -0.07), 0.025), undefined, { real: 'strut' });
  }

  // ═════ refuelling receptacle door ═════
  const pRef = part('refuel');
  const refuelDoor = hinge(pRef, P(0, topY(10.5) + 0.004, 10.5), new THREE.Vector3(1, 0, 0), 'x');
  add(refuelDoor.inner, slab([9.6, 10.5].map(s => ({ le: P(-0.17, topY(s, 0.17) + 0.012, s), te: P(0.17, topY(s, 0.17) + 0.012, s), t: 0.02 })), new THREE.Vector3(0, 1, 0), [[0, 1], [0.5, 1.6], [1, 1]]).build());
  well(pRef, [P(-0.17, topY(9.6) + 0.003, 9.6), P(0.17, topY(9.6) + 0.003, 9.6), P(0.17, topY(10.5) + 0.003, 10.5), P(-0.17, topY(10.5) + 0.003, 10.5)], new THREE.Vector3(0, 1, 0));

  // ═════ lights: formation strips, position lights, beacons ═════
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
  const navPos = SIDES.map(k => P(k * (WT - 0.02), wY(WT), wLE(WT) + 0.12));
  const { stripGlow, navGlow, beaconGlow } = K.finishLights(navPos, [P(0, topY(11.4) + 0.05, 11.4), P(0, bellyY(12.8) - 0.05, 12.8)]);

  const apron = buildApron(E, { noseZ: NOSE_Z, length: 18.9, halfSpan: WT, noseGearS: NGS });
  const gearLegs = [noseGear.outer, mainGear[1].outer, mainGear[-1].outer];

  function pose(st: JetState, _now: number, wig: (id: string) => number) {
    // control surfaces (degrees, trailing edge down positive)
    const ground = st.gearT * (1 - clamp01(st.alt / 2));
    const lefDeg = 14 * ground + 10 * st.checkLef + 12 * wig('lef');
    for (const s of SIDES) {
      const ai = s * st.r * 22 + 25 * st.brakeT + 22 * s * wig('ailerons');
      const fl = s * st.r * 14 + 12 * ground - 35 * st.brakeT + 20 * s * wig('flaperons');
      const sb = -st.p * 20 + s * st.r * 7 + 16 * wig('stabs');
      const rd = st.y * 25 - s * 28 * st.brakeT + 24 * wig('rudders');
      lef[s].set(lefDeg * DEG); flap[s].set(-fl * DEG); ail[s].set(-ai * DEG); stab[s].set(-sb * DEG); rud[s].set(rd * DEG);
      // 2D nozzles: both flaps vector together for pitch and open apart with thrust and afterburner
      const vec = st.p * 20, open = 3 + st.rpm * 5 + st.abT * 11;
      nozU[s].set((vec + open) * DEG); nozL[s].set((vec - open) * DEG);
    }
    // gear and doors
    const g = ease(st.gearT), gd = ease(st.gearDoorT);
    noseGear.set(-(1 - g) * 100 * DEG);
    for (const s of SIDES) { mainGear[s].set(-(1 - g) * 72 * DEG); mainDoor[s].set(s * 95 * DEG * gd); }
    gearLegs.forEach(o => { o.visible = st.gearT > 0.002; });
    noseDoor.forEach((h, i) => h.set(SIDES[i] * 88 * DEG * gd));
    // bays: doors first, then the launchers push the missiles out
    const bd = ease(clamp01(st.bayMainT / 0.45)), bm = ease(clamp01((st.bayMainT - 0.45) / 0.55));
    bayDoor.forEach((h, i) => h.set(SIDES[i] * 102 * DEG * bd));
    bayMissiles.forEach(m => { m.g.position.y = m.y0 - m.drop * bm; m.rail.scale.y = 0.15 + m.drop * bm; });
    const sd = ease(clamp01(st.baySideT / 0.5)), sm = ease(clamp01((st.baySideT - 0.4) / 0.6));
    for (const s of SIDES) { sideDoor[s].set(s * 112 * DEG * sd); sideRack[s].set(s * 62 * DEG * sm); }
    seekerMat.emissiveIntensity = bm > 0.98 || sm > 0.98 ? 1.6 : 0;
    seekerGlows.forEach((gl, i) => { gl.material.uniforms.intensity.value = (i < 4 ? bm : sm) > 0.98 ? 0.8 : 0; });
    canopyH.set(-38 * DEG * ease(st.canopyT));
    refuelDoor.set(-62 * DEG * ease(st.refuelT));
  }

  return {
    craft, cgY: 2.2, parts, screen, pose, altMax: 3.6, engines: 2, stage: apron.deck,
    // realistic style: two-tone grey RAM coating with a silvery sheen; plumes leave the 2D nozzles
    real: {
      skin: { light: '#737a7e', dark: '#565c60', camo: 0.9, panel: 3.2, metalness: 0.3, roughness: 0.44 },
      focus: P(0, 1.6, 9.6), size: 19, stopZ: NOSE_Z - (NGS - 0.55),
      nozzles: SIDES.map(k => ({ parent: pNoz, at: P(k * 0.8, 2.14, 18.82), w: 1.0, h: 0.5 })),
      only: { line: [fuseLine, ...lineCockpit, screenMesh], real: [fuseReal, ckpt] },
      power: k => hudSet.setPower(k),
    },
    view: { target: P(0, 1.9, 9.6), dist: 33, min: 2.5 },
    lights: { ...K.mats, padLightMat: apron.padLightMat, stripGlow, navGlow, beaconGlow, taxiGlow, padGlow: apron.padGlow, shadowMat: apron.shadowMat, taxiPoolMat: apron.taxiPoolMat, cockpitLight },
  };
}
