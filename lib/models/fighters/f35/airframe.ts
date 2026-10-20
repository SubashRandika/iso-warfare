// F-35B Lightning II airframe (the STOVL version), built from faceted lofts and aerofoil slabs in metres.
// Axes: +y up, +z forward. `s` is the distance aft of the nose tip. Side k = +1 is port (+x), k = −1 starboard.
import * as THREE from 'three';
import type { Engine } from '../../../iso/engine';
import { Geo, loft, slab, merge } from '../../../iso/geo';
import { makeKit, DEG, SIDES, PLATE, ease, clamp01, phase } from '../jet/kit';
import { buildApron } from '../../../stages/apron';
import type { Hinge, JetRig, JetState } from '../jet/types';

type V = THREE.Vector3;
const NOSE_Z = 7.8;
const P = (x: number, y: number, s: number) => new THREE.Vector3(x, y, NOSE_Z - s);
const lerp = THREE.MathUtils.lerp;

// ── fuselage stations ── s, yTop, upper deck (w, y), chine (w, y), lower side (w, y), belly (w, y)
const FUS: number[][] = [
  [0.00, 1.85, 0.00, 1.85, 0.00, 1.85, 0.00, 1.85, 0.00, 1.85],
  [0.50, 2.00, 0.08, 1.97, 0.18, 1.86, 0.12, 1.75, 0.04, 1.71],
  [1.30, 2.18, 0.18, 2.13, 0.36, 1.88, 0.26, 1.60, 0.10, 1.54],
  [2.20, 2.34, 0.28, 2.28, 0.52, 1.90, 0.38, 1.46, 0.16, 1.39],
  [2.80, 2.42, 0.34, 2.35, 0.60, 1.91, 0.44, 1.39, 0.19, 1.32],
  [4.00, 2.52, 0.44, 2.44, 0.74, 1.94, 0.56, 1.28, 0.26, 1.20],
  [5.00, 2.56, 0.54, 2.47, 0.88, 1.96, 0.70, 1.22, 0.50, 1.14],
  [6.30, 2.62, 0.80, 2.52, 1.24, 1.98, 0.96, 1.16, 0.74, 1.10],
  [8.00, 2.68, 1.00, 2.58, 1.42, 2.00, 1.10, 1.12, 0.80, 1.08],
  [10.0, 2.62, 1.06, 2.54, 1.46, 2.00, 1.14, 1.14, 0.84, 1.10],
  [12.0, 2.52, 1.00, 2.44, 1.38, 1.98, 1.10, 1.24, 0.80, 1.20],
  [13.6, 2.36, 0.80, 2.30, 1.10, 1.96, 0.90, 1.42, 0.62, 1.38],
  [14.4, 2.24, 0.58, 2.20, 0.76, 1.92, 0.62, 1.56, 0.45, 1.52],
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
const topY = (s: number, x = 0) => { const f = fus(s); return f.yT + (f.yU - f.yT) * Math.min(1, Math.abs(x) / Math.max(f.wU, 1e-3)); };
const bellyY = (s: number) => fus(s).yB;

// ── diverterless inlet ducts: top-outer, top-inner, bottom-inner, bottom-outer ──
const NAC: number[][] = [
  [6.3, 1.30, 1.97, 0.76, 1.99, 0.72, 1.11, 1.18, 1.10],
  [8.0, 1.34, 1.99, 0.82, 2.00, 0.80, 1.08, 1.20, 1.08],
  [10.0, 1.24, 1.99, 0.90, 2.00, 0.88, 1.10, 1.12, 1.10],
  [11.2, 1.02, 1.95, 0.90, 1.96, 0.90, 1.22, 0.98, 1.22],
];

// ── wing: trapezoid with a forward-swept trailing edge; flaperon inboard, fixed tip outboard ──
const WR = 1.2, WT = 5.35, FL0 = 1.5, FL1 = 4.3;
const wu = (x: number) => (x - WR) / (WT - WR);
const wLE = (x: number) => 7.25 + (x - WR) * 0.68;
const wTE = (x: number) => lerp(12.9, 11.5, wu(x));
const wY = (x: number) => 1.98 - (x - WR) * 0.03;
const wT = (x: number) => lerp(0.26, 0.07, wu(x));
const lefC = (x: number) => lerp(0.5, 0.26, wu(x));
const csC = (x: number) => lerp(1.0, 0.7, (x - FL0) / (FL1 - FL0));

// ── canted fins ──
const FH = 2.1, CANT = 22 * DEG, FIN_X = 1.0, FIN_Y = 2.4;
const fLE = (h: number) => 11.0 + h * 0.75;
const fTE = (h: number) => 13.9 - h * 0.25;
const fT = (h: number) => lerp(0.16, 0.06, h / FH);

// ── horizontal tails on short booms ──
const SR = 1.15, ST = 3.35, SY = 1.82;
const sLE = (x: number) => 12.7 + (x - SR) * 0.72;
const sTE = (x: number) => 15.5 - (x - SR) * 0.2;
const sT = (x: number) => lerp(0.15, 0.05, (x - SR) / (ST - SR));

const NY = 1.86;     // nozzle centre line height
const BOX_PROF: [number, number][] = [[0, 0.35], [0.4, 1], [1, 0.32]];
const FULL_BOX: [number, number][] = [[0, 0.35], [0.4, 1], [1, 0.05]];
const LEF_PROF: [number, number][] = [[0, 0.03], [1, 0.35]];
const CS_PROF: [number, number][] = [[0, 0.32], [1, 0.03]];
const FULL_PROF: [number, number][] = [[0, 0.05], [0.4, 1], [1, 0.05]];

export function buildLightning(E: Engine): JetRig {
  const { recess, glass } = E.mats;
  const K = makeKit(E, NOSE_Z, 1.9);
  const { craft, parts, part, add, hinge, box, cyl, wheel, brace, well, missileGeo, launcher, seekerMat, seekerGlows, strip } = K;
  const up = new THREE.Vector3(0, 1, 0), down = new THREE.Vector3(0, -1, 0), X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
  const stations = (a: number, b: number) => FUS.map(r => r[0]).filter(s => s >= a && s <= b);

  // ═════ airframe: fuselage and tail booms ═════
  const pAir = part('airframe');
  add(pAir, loft(stations(2.8, 14.4).map(fusRing), { capEnd: true }).build());
  for (const k of SIDES) {
    const c = k * 1.08, ring = (s: number, hw: number, hh: number) => [P(c, SY + hh, s), P(c + hw, SY, s), P(c, SY - hh, s), P(c - hw, SY, s)];
    add(pAir, loft([ring(12.4, 0.02, 0.02), ring(13.2, 0.14, 0.18), ring(15.2, 0.14, 0.16), ring(15.6, 0.04, 0.05)], { capStart: true, capEnd: true }).build());
  }
  { // panel seams across the spine
    const seam: number[] = [];
    for (const s of [9.3, 10.9, 12.4]) { const f = fus(s); [[-f.wU, f.yU], [0, f.yT], [f.wU, f.yU]].reduce((a, b) => { const A = P(a[0], a[1] + 0.004, s), B = P(b[0], b[1] + 0.004, s); seam.push(A.x, A.y, A.z, B.x, B.y, B.z); return b; }); }
    pAir.add(E.fat(seam, E.mats.line));
  }

  // ═════ radome & chin sensor window ═════
  const pNose = part('radome');
  add(pNose, loft(stations(0, 2.8).map(fusRing)).build());
  { const eots = new THREE.ConeGeometry(0.13, 0.11, 8, 1, false, Math.PI / 8); eots.rotateX(Math.PI); const c = P(0, bellyY(1.9) - 0.035, 1.9); eots.translate(c.x, c.y, c.z); add(pNose, eots); }

  // ═════ canopy (hinged at the front) & cockpit ═════
  const pCan = part('canopy');
  const CAN = [[2.9, 0.06, 0.03], [3.4, 0.30, 0.30], [3.9, 0.44, 0.48], [4.5, 0.51, 0.60], [5.1, 0.52, 0.62], [5.6, 0.47, 0.50], [6.0, 0.36, 0.30], [6.35, 0.22, 0.10]];
  const canAt = (s: number) => { let i = 0; while (i < CAN.length - 2 && CAN[i + 1][0] < s) i++; const a = CAN[i], b = CAN[i + 1], t = THREE.MathUtils.clamp((s - a[0]) / (b[0] - a[0]), 0, 1); return { w: lerp(a[1], b[1], t), h: lerp(a[2], b[2], t) }; };
  const NA = 16;
  const canRing = (s: number) => { const { w, h } = canAt(s); return Array.from({ length: NA + 1 }, (_, i) => { const th = Math.PI * i / NA, x = w * Math.cos(th); return P(x, topY(s, x) - 0.01 + h * Math.sin(th), s); }); };
  const canS = Array.from({ length: 21 }, (_, i) => 2.9 + (6.35 - 2.9) * i / 20);
  const canopyH = hinge(pCan, P(0, topY(2.85), 2.85), X, 'x');
  add(canopyH.inner, loft(canS.map(canRing), { open: true, capEnd: true }).build(), glass, { outline: false }).renderOrder = 3;
  canopyH.inner.add(E.loopLine(canS.map(s => canRing(s)[0]).concat(canS.slice().reverse().map(s => canRing(s)[NA])).map(p => p.add(new THREE.Vector3(0, 0.008, 0))), E.mats.major));   // frame rail
  const tub = new Geo();
  const tubRings = Array.from({ length: 11 }, (_, i) => { const s = 3.4 + 2.7 * i / 10, w = canAt(s).w * 0.94; return [P(-w, topY(s, w) + 0.012, s), P(0, topY(s) + 0.012, s), P(w, topY(s, w) + 0.012, s)]; });
  for (let i = 0; i < tubRings.length - 1; i++) for (let j = 0; j < 2; j++) tub.quad(tubRings[i][j], tubRings[i][j + 1], tubRings[i + 1][j + 1], tubRings[i + 1][j], P(0, 0, 4.7));
  add(pCan, tub.build(), recess, { outline: false });
  add(pCan, merge([box(-0.23, 0.23, topY(5.1), 2.98, 4.85, 5.35), box(-0.16, 0.16, 2.98, 3.07, 5.1, 5.35)]));
  add(pCan, box(-0.26, 0.26, topY(3.75), 2.74, 3.55, 3.95));
  // one panoramic display, no head-up display (the helmet does that job)
  const { screen, cockpitLight } = K.cockpitDisplay(pCan, P(0, 2.71, 3.98), new THREE.Vector3(0, 0.7, -0.7), 0.48, 0.17, P(0, 2.9, 4.4));

  // ═════ diverterless inlets: swept lips, ducts and the bump ahead of each ═════
  const pInt = part('intakes');
  for (const k of SIDES) {
    const lip = [P(k * 1.22, 1.93, 4.85), P(k * 0.72, 1.95, 5.15), P(k * 0.68, 1.15, 5.55), P(k * 1.08, 1.13, 5.25)];
    const rings = [lip, ...NAC.map(n => [P(k * n[1], n[2], n[0]), P(k * n[3], n[4], n[0]), P(k * n[5], n[6], n[0]), P(k * n[7], n[8], n[0])])];
    add(pInt, loft(rings, { capEnd: true }).build());
    const c = lip.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(4);
    well(pInt, lip.map(p => p.clone().lerp(c, 0.07).add(new THREE.Vector3(0, 0, -0.16))), Z);
    const bump = (s: number, o: number, w: number) => [P(k * (0.7 + 0.02 * w), 1.56 + 0.3 * w, s), P(k * (0.7 + o), 1.56, s), P(k * (0.7 - 0.02 * w), 1.56 - 0.31 * w, s), P(k * 0.6, 1.56, s)];
    add(pInt, loft([bump(4.0, 0, 0.05), bump(4.75, 0.17, 1), bump(5.4, 0.1, 1.05)], { capEnd: true }).build());
  }

  // ═════ wings: box, leading-edge flaps, flaperons ═════
  const pWing = part('wings'), pLef = part('lef'), pFlap = part('flaperons');
  const lef: Record<number, Hinge> = {}, flap: Record<number, Hinge> = {};
  for (const k of SIDES) {
    const n = new THREE.Vector3(k * 0.03, 1, 0);
    const at = (x: number, s: number) => P(k * x, wY(x), s);
    const boxLE = (x: number) => at(x, wLE(x) + lefC(x)), boxTE = (x: number) => at(x, wTE(x) - csC(x));
    const g = new Geo();
    slab([WR, FL0].map(x => ({ le: boxLE(x), te: at(x, wTE(x)), t: wT(x) })), n, FULL_BOX, { into: g });
    slab([FL0, FL1].map(x => ({ le: boxLE(x), te: boxTE(x), t: wT(x) })), n, BOX_PROF, { into: g });
    slab([FL1, WT].map(x => ({ le: boxLE(x), te: at(x, wTE(x)), t: wT(x) })), n, FULL_BOX, { into: g });
    add(pWing, g.build());
    lef[k] = hinge(pLef, boxLE(WR), boxLE(WT).sub(boxLE(WR)), 'x');
    add(lef[k].inner, slab([WR, WT].map(x => ({ le: at(x, wLE(x)), te: boxLE(x), t: wT(x) })), n, LEF_PROF).build());
    flap[k] = hinge(pFlap, boxTE(FL0), boxTE(FL1).sub(boxTE(FL0)), 'x');
    add(flap[k].inner, slab([FL0 + 0.02, FL1 - 0.02].map(x => ({ le: boxTE(x), te: at(x, wTE(x)), t: wT(x) })), n, CS_PROF).build());
  }

  // ═════ vertical tails and rudders ═════
  const pFin = part('fins'), pRud = part('rudders');
  const rud: Record<number, Hinge> = {};
  const R0 = 0.25, R1 = 1.75, RC = 0.7;
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

  // ═════ horizontal tails ═════
  const pStab = part('stabs');
  const stab: Record<number, Hinge> = {};
  for (const k of SIDES) {
    stab[k] = hinge(pStab, P(k * SR, SY, 13.9), X, 'x');
    add(stab[k].inner, slab([SR, ST].map(x => ({ le: P(k * x, SY, sLE(x)), te: P(k * x, SY, sTE(x)), t: sT(x) })), up, FULL_PROF).build());
  }

  // ═════ three-bearing swivel nozzle: three ring segments that each turn 30°, bending the exhaust straight down ═════
  const pNoz = part('nozzle');
  const tube = (s0: number, s1: number, r0: number, r1: number, n = 16) => {
    const ring = (s: number, r: number) => Array.from({ length: n }, (_, i) => { const a = (i + 0.5) / n * Math.PI * 2; return P(r * Math.cos(a), NY + r * Math.sin(a), s); });
    return loft([ring(s0, r0), ring(s1, r1)]).build();
  };
  add(pNoz, tube(13.7, 14.2, 0.62, 0.6));
  const seg1 = hinge(pNoz, P(0, NY, 14.15), X, 'x');
  add(seg1.inner, tube(14.15, 14.62, 0.6, 0.58));
  const seg2 = hinge(seg1.inner, P(0, NY, 14.6), X, 'x');
  add(seg2.inner, tube(14.58, 15.05, 0.58, 0.56));
  const seg3 = hinge(seg2.inner, P(0, NY, 15.02), X, 'x');
  add(seg3.inner, tube(15.0, 15.55, 0.56, 0.5));
  well(seg3.inner, Array.from({ length: 16 }, (_, i) => { const a = (i + 0.5) / 16 * Math.PI * 2; return P(0.49 * Math.cos(a), NY + 0.49 * Math.sin(a), 15.45); }), new THREE.Vector3(0, 0, -1));
  { // serrated trailing edge of the nozzle, drawn as a zig-zag hairline
    const zz: V[] = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2, r = 0.5; zz.push(P(r * Math.cos(a), NY + r * Math.sin(a), 15.55 - (i % 2) * 0.07)); }
    seg3.inner.add(E.loopLine(zz, E.mats.major, false));
  }

  // ═════ STOVL lift system: lift fan, its doors, auxiliary inlets, roll posts ═════
  const pLift = part('liftFan'), pRoll = part('rollPosts');
  const LF0 = 6.5, LF1 = 8.0, LFW = 0.46;
  well(pLift, [P(-LFW, topY(LF0, LFW) + 0.003, LF0), P(LFW, topY(LF0, LFW) + 0.003, LF0), P(LFW, topY(LF1, LFW) + 0.003, LF1), P(-LFW, topY(LF1, LFW) + 0.003, LF1)], up);
  const fanC = P(0, topY(7.25) + 0.006, 7.25), fan = new THREE.Group(); fan.position.copy(fanC); pLift.add(fan);
  { const blades: number[] = [], ring: V[] = [];
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; blades.push(0.08 * Math.cos(a), 0, 0.08 * Math.sin(a), 0.38 * Math.cos(a + 0.25), 0, 0.38 * Math.sin(a + 0.25)); }
    for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; ring.push(new THREE.Vector3(0.39 * Math.cos(a), 0, 0.39 * Math.sin(a))); }
    fan.add(E.fat(blades, E.mats.major), E.loopLine(ring, E.mats.major)); }
  const liftDoor = hinge(pLift, P(0, topY(LF1) + 0.004, LF1), X, 'x');   // hinged at its rear edge
  add(liftDoor.inner, slab([LF0, LF1].map(s => ({ le: P(-LFW, topY(s, LFW) + 0.014, s), te: P(LFW, topY(s, LFW) + 0.014, s), t: 0.02 })), up, [[0, 1], [0.5, 1.8], [1, 1]]).build());
  const auxDoor: Hinge[] = [];
  for (const k of SIDES) {
    const a0 = 8.15, a1 = 8.85, x0 = 0.1, x1 = 0.48;
    well(pLift, [P(k * x0, topY(a0, x0) + 0.003, a0), P(k * x1, topY(a0, x1) + 0.003, a0), P(k * x1, topY(a1, x1) + 0.003, a1), P(k * x0, topY(a1, x0) + 0.003, a1)], up);
    const h = hinge(pLift, P(k * (x0 + x1) / 2, topY(a1, 0.3) + 0.004, a1), X, 'x');
    add(h.inner, slab([a0, a1].map(s => ({ le: P(k * x0, topY(s, x0) + 0.012, s), te: P(k * x1, topY(s, x1) + 0.012, s), t: 0.02 })), up, PLATE).build());
    auxDoor.push(h);
  }
  const lowDoor: Hinge[] = [];
  for (const k of SIDES) {
    const l0 = 6.4, l1 = 7.7, y = bellyY(7) - 0.008;
    const h = hinge(pLift, P(k * 0.42, y, 7), Z, 'z');
    add(h.inner, slab([l0, l1].map(s => ({ le: P(k * 0.42, y, s), te: P(k * 0.02, y, s), t: 0.025 })), up, PLATE).build());
    lowDoor.push(h);
  }
  well(pLift, [P(-0.42, bellyY(7) - 0.003, 6.4), P(0.42, bellyY(7) - 0.003, 6.4), P(0.42, bellyY(7) - 0.003, 7.7), P(-0.42, bellyY(7) - 0.003, 7.7)], down);
  const rollDoor: Hinge[] = [];
  for (const k of SIDES) {
    const x0 = 2.5, x1 = 2.85, r0 = 9.5, r1 = 10.1, y = wY(2.7) - 0.1;
    well(pRoll, [P(k * x0, y + 0.005, r0), P(k * x1, y + 0.005, r0), P(k * x1, y + 0.005, r1), P(k * x0, y + 0.005, r1)], down);
    const h = hinge(pRoll, P(k * x1, y, (r0 + r1) / 2), Z, 'z');
    add(h.inner, slab([r0, r1].map(s => ({ le: P(k * x1, y - 0.01, s), te: P(k * x0, y - 0.01, s), t: 0.02 })), up, PLATE).build());
    rollDoor.push(h);
  }

  // ═════ landing gear ═════
  const pNG = part('gearNose'), pMG = part('gearMain');
  const NGS = 3.6, NGY = bellyY(NGS);
  const noseGear = hinge(pNG, P(0, NGY, NGS), X, 'x');
  add(noseGear.inner, merge([cyl(0.05, 0.55, NGY, 0, NGS), cyl(0.068, 0.32, 0.76, 0, NGS), box(-0.12, 0.12, 0.29, 0.35, NGS - 0.05, NGS + 0.05), brace(P(0, 0.55, NGS + 0.03), P(0, 0.9, NGS + 0.15), 0.022)]));
  add(noseGear.inner, wheel(0.32, 0.18, 0, 0.32, NGS));
  const taxiGlow = K.taxiLight(noseGear.inner, P(0, 0.88, NGS - 0.08));
  const noseDoor: Hinge[] = [];
  for (const k of SIDES) {
    const y = NGY - 0.006, h = hinge(pNG, P(k * 0.22, y, NGS), Z, 'z');
    add(h.inner, slab([3.0, 4.3].map(s => ({ le: P(k * 0.22, y, s), te: P(k * 0.02, y, s), t: 0.025 })), up, PLATE).build());
    noseDoor.push(h);
  }
  well(pNG, [P(-0.22, NGY - 0.002, 3.0), P(0.22, NGY - 0.002, 3.0), P(0.22, NGY - 0.002, 4.3), P(-0.22, NGY - 0.002, 4.3)], down);
  const MGS = 9.2, MGY = 1.84;
  const mainGear: Record<number, Hinge> = {}, mainDoor: Record<number, Hinge> = {};
  for (const k of SIDES) {
    const x = k * 1.55;
    mainGear[k] = hinge(pMG, P(x, MGY, MGS), X, 'x');
    add(mainGear[k].inner, merge([cyl(0.07, 0.62, MGY, x, MGS), cyl(0.088, 0.36, 0.95, x, MGS), box(x - 0.18 * k - 0.04, x - 0.18 * k + 0.04, 0.33, 0.4, MGS - 0.05, MGS + 0.05), brace(P(x, 1.12, MGS), P(k * 1.22, 1.78, MGS - 0.45), 0.032)]));
    add(mainGear[k].inner, wheel(0.36, 0.26, x + k * 0.02, 0.36, MGS));
    const y = 1.85;
    mainDoor[k] = hinge(pMG, P(k * 1.85, y, MGS), Z, 'z');
    add(mainDoor[k].inner, slab([8.2, 10.2].map(s => ({ le: P(k * 1.85, y, s), te: P(k * 1.3, y, s), t: 0.025 })), up, PLATE).build());
    well(pMG, [P(k * 1.3, y + 0.01, 8.2), P(k * 1.85, y + 0.01, 8.2), P(k * 1.85, y + 0.01, 10.2), P(k * 1.3, y + 0.01, 10.2)], down);
  }

  // ═════ weapons bays: two bays, each with an inboard and an outboard door ═════
  const pBay = part('bayMain');
  const b0 = 7.9, b1 = 11.1, bm = (b0 + b1) / 2;
  const inDoor: Hinge[] = [], outDoor: Hinge[] = [];
  for (const k of SIDES) {
    const y = (s: number) => bellyY(s) - 0.008;
    const hi = hinge(pBay, P(k * 0.08, y(bm), bm), Z, 'z');
    add(hi.inner, slab([b0, b1].map(s => ({ le: P(k * 0.08, y(s), s), te: P(k * 0.385, y(s), s), t: 0.025 })), up, PLATE).build());
    const ho = hinge(pBay, P(k * 0.7, y(bm), bm), Z, 'z');
    add(ho.inner, slab([b0, b1].map(s => ({ le: P(k * 0.7, y(s), s), te: P(k * 0.395, y(s), s), t: 0.025 })), up, PLATE).build());
    inDoor.push(hi); outDoor.push(ho);
    well(pBay, [P(k * 0.08, bellyY(b0) - 0.003, b0), P(k * 0.7, bellyY(b0) - 0.003, b0), P(k * 0.7, bellyY(b1) - 0.003, b1), P(k * 0.08, bellyY(b1) - 0.003, b1)], down);
  }
  const amraam = missileGeo(3.0, 0.085, 0.15, true), bomb = missileGeo(2.8, 0.16, 0.2, false);
  const stores = [
    ...SIDES.map(k => launcher(pBay, amraam, P(k * 0.55, bellyY(bm) + 0.22, bm), 3.0, 0.88, 0.042)),
    ...SIDES.map(k => launcher(pBay, bomb, P(k * 0.24, bellyY(bm) + 0.26, bm), 2.8, 0.64, 0)),
  ];

  // ═════ refuelling probe: folds out of the starboard forward fuselage ═════
  const pRef = part('refuel');
  const piv = P(-0.5, 2.25, 4.4), tip = P(-1.05, 2.3, 2.9);
  const probe = hinge(pRef, piv, up, 'y');
  const pd = tip.clone().sub(piv), probeGeo = new THREE.CylinderGeometry(0.045, 0.05, pd.length(), 10);
  probeGeo.translate(0, pd.length() / 2, 0); probeGeo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, pd.clone().normalize())); probeGeo.translate(piv.x, piv.y, piv.z);
  const nib = new THREE.CylinderGeometry(0.075, 0.06, 0.14, 10); nib.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, pd.clone().normalize())); nib.translate(tip.x, tip.y, tip.z);
  add(probe.inner, merge([probeGeo, nib]));

  // ═════ lights ═════
  for (const k of SIDES) {
    const face = (s: number) => { const f = fus(s); return P(k * lerp(f.wC, f.wL, 0.22), lerp(f.yC, f.yL, 0.22), s); };
    const f2 = fus(2.2);
    strip(face(1.7), face(2.6), new THREE.Vector3(k * (f2.wL - f2.wC), f2.yL - f2.yC, 0), new THREE.Vector3(k * (f2.yC - f2.yL), -(f2.wC - f2.wL), 0));
    const tx = WT - 0.08;
    strip(P(k * tx, wY(tx) + wT(tx) * 0.3, wLE(tx) + 0.4), P(k * tx, wY(tx) + wT(tx) * 0.3, wTE(tx) - 0.3), X, up, 0.03);
    const v = new THREE.Vector3(k * Math.sin(CANT), Math.cos(CANT), 0), n = new THREE.Vector3(k * Math.cos(CANT), -Math.sin(CANT), 0);
    const fh = 1.85, fp = (s: number) => P(k * FIN_X, FIN_Y, s).addScaledVector(v, fh).addScaledVector(n, fT(fh) * 0.4);
    strip(fp(fLE(fh) + 0.2), fp(fTE(fh) - 0.15), v, n);
    strip(P(k * 1.23, SY, 13.4), P(k * 1.23, SY, 14.6), up, new THREE.Vector3(k, 0, 0), 0.03);
  }
  const navPos = SIDES.map(k => P(k * (WT - 0.02), wY(WT), wLE(WT) + 0.12));
  const { stripGlow, navGlow, beaconGlow } = K.finishLights(navPos, [P(0, topY(9.6) + 0.05, 9.6), P(0, bellyY(12) - 0.05, 12)]);

  const apron = buildApron(E, { noseZ: NOSE_Z, length: 15.6, halfSpan: WT, noseGearS: NGS });
  const gearLegs = [noseGear.outer, mainGear[1].outer, mainGear[-1].outer];
  let fanAngle = 0, lastNow = 0;

  function pose(st: JetState, now: number, wig: (id: string) => number) {
    const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0; lastNow = now;
    const ground = st.gearT * (1 - clamp01(st.alt / 2)), t = st.stovlT;
    // control surfaces (degrees, trailing edge down positive); flaperons and flaps droop for the hover
    const lefDeg = 12 * ground + 8 * t + 10 * st.checkLef + 12 * wig('lef');
    for (const s of SIDES) {
      const fl = s * st.r * 16 + 10 * ground + 15 * t - 30 * st.brakeT + 20 * s * wig('flaperons');
      const sb = -st.p * 20 + s * st.r * 8 + 16 * wig('stabs');
      const rd = st.y * 25 - s * 25 * st.brakeT + 24 * wig('rudders');
      lef[s].set(lefDeg * DEG); flap[s].set(-fl * DEG); stab[s].set(-sb * DEG); rud[s].set(rd * DEG);
    }
    // STOVL conversion: lift-fan door, auxiliary inlets, fan exit doors, roll posts, then the nozzle swivels down
    liftDoor.set(-105 * DEG * phase(t, 0, 0.45));
    auxDoor.forEach(h => h.set(-38 * DEG * phase(t, 0.15, 0.5)));
    lowDoor.forEach((h, i) => h.set(SIDES[i] * 82 * DEG * phase(t, 0.25, 0.6)));
    rollDoor.forEach((h, i) => h.set(SIDES[i] * 80 * DEG * phase(t, 0.3, 0.65)));
    const sw = -30 * DEG * phase(t, 0.4, 1);
    seg1.set(sw); seg2.set(sw); seg3.set(sw);
    fan.visible = t > 0.02;
    fanAngle += dt * st.rpm * phase(t, 0.2, 0.7) * 14; fan.rotation.y = fanAngle;
    // gear and doors
    const g = ease(st.gearT), gd = ease(st.gearDoorT);
    noseGear.set(-(1 - g) * 100 * DEG);
    for (const s of SIDES) { mainGear[s].set(-(1 - g) * 72 * DEG); mainDoor[s].set(s * 95 * DEG * gd); }
    gearLegs.forEach(o => { o.visible = st.gearT > 0.002; });
    noseDoor.forEach((h, i) => h.set(SIDES[i] * 88 * DEG * gd));
    // bays: inboard and outboard doors swing down, then the launchers push the stores out
    const bd = ease(clamp01(st.bayMainT / 0.45)), bx = ease(clamp01((st.bayMainT - 0.45) / 0.55));
    inDoor.forEach((h, i) => h.set(-SIDES[i] * 100 * DEG * bd));
    outDoor.forEach((h, i) => h.set(SIDES[i] * 100 * DEG * bd));
    stores.forEach(m => { m.g.position.y = m.y0 - m.drop * bx; m.rail.scale.y = 0.15 + m.drop * bx; });
    seekerMat.emissiveIntensity = bx > 0.98 ? 1.6 : 0;
    seekerGlows.forEach(gl => { gl.material.uniforms.intensity.value = bx > 0.98 ? 0.8 : 0; });
    canopyH.set(42 * DEG * ease(st.canopyT));
    probe.set(27 * DEG * (1 - ease(st.refuelT)));
  }

  return {
    craft, cgY: 1.9, parts, screen, pose, altMax: 3.4, hoverAlt: 2.8, engines: 1,
    view: { target: P(0, 1.7, 7.8), dist: 28 },
    lights: { ...K.mats, padLightMat: apron.padLightMat, stripGlow, navGlow, beaconGlow, taxiGlow, padGlow: apron.padGlow, shadowMat: apron.shadowMat, taxiPoolMat: apron.taxiPoolMat, cockpitLight },
  };
}
