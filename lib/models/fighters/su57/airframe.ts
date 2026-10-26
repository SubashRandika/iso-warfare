// Sukhoi Su-57 (NATO "Felon") airframe, built from faceted lofts and aerofoil slabs in metres.
// Axes: +y up, +z forward. `s` is the distance aft of the nose tip, so P(x, y, s) puts a point on the aircraft.
// Side k = +1 is the port (left) side at +x, k = −1 the starboard side.
// What sets it apart from the F-22 here: LEVCONs (movable wing-root extensions), nacelles set far apart with a tunnel
// between them for two tandem weapons bays, all-moving vertical tails, round thrust-vectoring nozzles, a tail sting,
// the IRST ball ahead of the windscreen and a refuelling probe on the left of the nose.
import * as THREE from 'three';
import type { Engine } from '../../../iso/engine';
import { Geo, loft, slab, rectRing, merge } from '../../../iso/geo';
import { makeKit, DEG, SIDES, PLATE, ease, clamp01 } from '../jet/kit';
import { buildApron } from '../../../stages/apron';
import { store, type Hinge, type JetRig, type JetState } from '../jet/types';
import { cockpitMaterials, cockpitMesh, consoleBox, ejectionSeat, glareshield, hud, instrumentPanel, sideStick, throttles } from '../jet/cockpit';
import { decalMaterial, decalTexture, layDecal, profileAt, starPath } from '../../../real/decals';

const NOSE_Z = 10.05;
const P = (x: number, y: number, s: number) => new THREE.Vector3(x, y, NOSE_Z - s);
const lerp = THREE.MathUtils.lerp;
const X = new THREE.Vector3(1, 0, 0), UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0), Z = new THREE.Vector3(0, 0, 1);

// ── fuselage stations ── s, yTop, upper deck (w, y), chine (w, y), lower side (w, y), belly (w, y)
// The chined forebody widens behind the cockpit into a flat lifting body; its chine runs straight along the LEVCON
// roots into the wing. From s 8.8 the belly is the roof of the tunnel between the nacelles; behind the wing the body
// narrows to a central beam, leaving the tops of the bare engine bays exposed.
const FUS: number[][] = [
  [0.00, 2.22, 0.00, 2.22, 0.00, 2.22, 0.00, 2.22, 0.00, 2.22],
  [0.70, 2.36, 0.09, 2.34, 0.20, 2.24, 0.13, 2.12, 0.05, 2.08],
  [1.70, 2.53, 0.20, 2.50, 0.42, 2.26, 0.30, 1.98, 0.12, 1.92],
  [2.80, 2.70, 0.31, 2.65, 0.58, 2.28, 0.42, 1.85, 0.18, 1.78],
  [3.80, 2.80, 0.40, 2.74, 0.70, 2.30, 0.50, 1.76, 0.23, 1.68],
  [5.00, 2.88, 0.48, 2.80, 0.80, 2.32, 0.58, 1.68, 0.28, 1.60],
  [6.20, 2.94, 0.56, 2.84, 0.92, 2.34, 0.64, 1.64, 0.36, 1.58],
  [7.40, 2.98, 0.70, 2.86, 1.20, 2.36, 0.68, 1.66, 0.50, 1.62],
  [8.80, 3.00, 0.92, 2.86, 1.60, 2.37, 0.74, 1.78, 0.70, 1.70],
  [10.4, 2.98, 1.10, 2.84, 2.20, 2.38, 0.74, 1.78, 0.70, 1.70],
  [12.4, 2.92, 1.14, 2.80, 2.22, 2.36, 0.74, 1.78, 0.70, 1.70],
  [14.4, 2.86, 1.08, 2.74, 2.18, 2.34, 0.74, 1.78, 0.70, 1.71],
  [16.2, 2.72, 0.60, 2.62, 1.00, 2.28, 0.66, 1.80, 0.56, 1.74],
  [17.6, 2.54, 0.36, 2.48, 0.62, 2.22, 0.44, 1.84, 0.30, 1.78],
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

// ── nacelles: s, centre (x, y), half-width, half-height, squareness (2 round … 6 nearly square) ──
// Boxy, raked intakes under the LEVCONs become round engine bays; the inner walls are the sides of the tunnel.
const NAC: number[][] = [
  [6.50, 1.38, 1.62, 0.62, 0.56, 6],
  [7.60, 1.38, 1.62, 0.64, 0.57, 5],
  [10.5, 1.38, 1.62, 0.64, 0.58, 4],
  [13.0, 1.36, 1.62, 0.62, 0.58, 3],
  [15.5, 1.33, 1.63, 0.60, 0.58, 2.4],
  [17.45, 1.30, 1.63, 0.58, 0.58, 2],
];
const NAC_SPLIT = [15.0, 1.336, 1.628, 0.604, 0.58, 2.52];   // where the painted nacelle meets the bare engine bay
const NOZ_X = 1.30, NOZ_Y = 1.63;
/** 16 points on a superellipse around (k·cx, cy); `rake` moves each point aft by rake × its height above the centre */
const nacRing = (k: number, [s, cx, cy, hw, hh, e]: number[], rake = 0) => Array.from({ length: 16 }, (_, i) => {
  const a = (i + 0.5) / 16 * Math.PI * 2, c = Math.cos(a), n = Math.sin(a);
  const x = cx + hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / e), y = cy + hh * Math.sign(n) * Math.pow(Math.abs(n), 2 / e);
  return P(k * x, y, s + rake * (y - cy));
});
const nozRing = (k: number, s: number, r: number) => Array.from({ length: 16 }, (_, i) => { const a = (i + 0.5) / 16 * Math.PI * 2; return P(k * NOZ_X + r * Math.cos(a), NOZ_Y + r * Math.sin(a), s); });

// ── wing: 48° leading-edge sweep, nearly straight trailing edge ──
const WR = 2.2, WT = 7.05;
const wu = (x: number) => (x - WR) / (WT - WR);
const wLE = (x: number) => 9.6 + (x - WR) * 1.11;
const wTE = (x: number) => lerp(16.9, 16.25, wu(x));
const wY = (x: number) => 2.36 - (x - WR) * 0.04;
const wT = (x: number) => lerp(0.34, 0.08, wu(x));
const lefC = (x: number) => lerp(0.65, 0.3, wu(x));
const csC = (x: number) => lerp(1.25, 0.55, wu(x));
const FLAP_END = 4.5;

// ── LEVCON: a triangle along the chine from the intake to the wing root, pivoting on its rear edge ──
// (its rear corner sits on the wing's leading edge, its inner edge on the chine)
const LEV_Y = 2.37, LEV_TIP: [number, number] = [0.9, 6.15], LEV_IN: [number, number] = [1.9, 9.77], LEV_OUT: [number, number] = [2.35, 9.77];

// ── all-moving vertical tails on the tail booms, canted outward ──
const FH = 2.6, CANT = 26 * DEG, FIN_X = 2.05, FIN_Y = 2.12, FIN_PIV = 15.9;
const fLE = (h: number) => 14.6 + h * 0.8;
const fTE = (h: number) => 17.9 - h * 0.12;
const fT = (h: number) => lerp(0.2, 0.07, h / FH);

// ── stabilators on the booms ──
const SR = 2.05, ST = 4.7, SY = 1.95;
const sLE = (x: number) => 17.0 + (x - SR) * 0.75;
const sTE = (x: number) => 19.9 - (x - SR) * 0.06;
const sT = (x: number) => lerp(0.17, 0.05, (x - SR) / (ST - SR));

const BOX_PROF: [number, number][] = [[0, 0.35], [0.4, 1], [1, 0.32]];
const LEF_PROF: [number, number][] = [[0, 0.03], [1, 0.35]];
const CS_PROF: [number, number][] = [[0, 0.32], [1, 0.03]];
const FULL_PROF: [number, number][] = [[0, 0.05], [0.4, 1], [1, 0.05]];

export function buildFelon(E: Engine): JetRig {
  const { recess, glass } = E.mats;
  const K = makeKit(E, NOSE_Z, 2.3);
  const { craft, parts, part, add, hinge, box, cyl, wheel, brace, well, missileGeo, launcher, seekerMat, seekerGlows, strip } = K;
  const stations = (a: number, b: number) => FUS.map(r => r[0]).filter(s => s >= a && s <= b);

  // ═════ airframe: lifting body, tail booms, sting ═════
  const pAir = part('airframe');
  const fuseLine = add(pAir, loft(stations(2.8, 17.6).map(fusRing), { capEnd: true }).build());
  for (const k of SIDES) {
    const c = k * SR, ring = (s: number, hw: number, hh: number) => [P(c, SY + hh, s), P(c + hw, SY, s), P(c, SY - hh, s), P(c - hw, SY, s)];
    add(pAir, loft([ring(14.8, 0.02, 0.02), ring(15.8, 0.17, 0.2), ring(19.4, 0.16, 0.18), ring(19.9, 0.05, 0.06)], { capStart: true, capEnd: true }).build());
  }
  add(pAir, loft([rectRing(-0.34, 0.34, 1.78, 2.44, NOSE_Z - 16.6), rectRing(-0.26, 0.26, 1.86, 2.32, NOSE_Z - 19.0), rectRing(-0.09, 0.09, 2.0, 2.16, NOSE_Z - 20.1)], { capEnd: true }).build());
  { // panel seams across the spine (hairline detail)
    const seam: number[] = [];
    for (const s of [9.2, 12.6, 15.4]) { const f = fus(s); [[-f.wU, f.yU], [0, f.yT], [f.wU, f.yU]].reduce((a, b) => { const A = P(a[0], a[1] + 0.004, s), B = P(b[0], b[1] + 0.004, s); seam.push(A.x, A.y, A.z, B.x, B.y, B.z); return b; }); }
    pAir.add(E.fat(seam, E.mats.line));
  }

  // ═════ radome & IRST ball (ahead of the windscreen, offset to the right) ═════
  const pNose = part('radome');
  add(pNose, loft(stations(0, 2.8).map(fusRing)).build(), undefined, { real: 'radome' });
  { const ball = new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), c = P(-0.2, topY(3.3, 0.2) - 0.01, 3.3); ball.translate(c.x, c.y, c.z); add(pNose, ball, undefined, { real: 'seeker' }); }

  // ═════ canopy & cockpit ═════
  const pCan = part('canopy');
  const CAN = [[3.7, 0.06, 0.03], [4.2, 0.30, 0.30], [4.8, 0.45, 0.50], [5.4, 0.53, 0.62], [6.0, 0.56, 0.66], [6.6, 0.54, 0.60], [7.1, 0.47, 0.46], [7.6, 0.30, 0.18], [8.0, 0.16, 0.05]];
  const canAt = (s: number) => { let i = 0; while (i < CAN.length - 2 && CAN[i + 1][0] < s) i++; const a = CAN[i], b = CAN[i + 1], t = THREE.MathUtils.clamp((s - a[0]) / (b[0] - a[0]), 0, 1); return { w: lerp(a[1], b[1], t), h: lerp(a[2], b[2], t) }; };
  const NA = 16;
  const canRing = (s: number) => { const { w, h } = canAt(s); return Array.from({ length: NA + 1 }, (_, i) => { const th = Math.PI * i / NA, x = w * Math.cos(th); return P(x, topY(s, x) - 0.01 + h * Math.sin(th), s); }); };
  const canS = Array.from({ length: 23 }, (_, i) => 3.7 + (8.0 - 3.7) * i / 22);
  const canopyH = hinge(pCan, P(0, topY(8.1), 8.1), X, 'x');   // hinged at the rear
  add(canopyH.inner, loft(canS.map(canRing), { open: true, capEnd: true }).build(), glass, { outline: false }).renderOrder = 3;
  canopyH.inner.add(E.loopLine(canRing(7.65).map(p => p.clone().add(new THREE.Vector3(0, 0.006, 0))), E.mats.major, false));   // rear bow
  const tub = new Geo();
  const tubRings = Array.from({ length: 12 }, (_, i) => { const s = 4.3 + 3.6 * i / 11, w = canAt(s).w * 0.94; return [P(-w, topY(s, w) + 0.012, s), P(0, topY(s) + 0.012, s), P(w, topY(s, w) + 0.012, s)]; });
  for (let i = 0; i < tubRings.length - 1; i++) for (let j = 0; j < 2; j++) tub.quad(tubRings[i][j], tubRings[i][j + 1], tubRings[i + 1][j + 1], tubRings[i + 1][j], P(0, 0, 5.9));
  const lineCockpit = [
    add(pCan, tub.build(), recess, { outline: false }),
    add(pCan, merge([box(-0.24, 0.24, topY(6.6), 3.3, 6.35, 6.85), box(-0.17, 0.17, 3.3, 3.43, 6.62, 6.85)])),
    add(pCan, box(-0.3, 0.3, topY(4.95), 3.1, 4.75, 5.15)),
  ];
  const { screen, cockpitLight, mesh: screenMesh } = K.cockpitDisplay(pCan, P(0, 3.03, 5.19), new THREE.Vector3(0, 0.75, -0.66), 0.54, 0.2, P(0, 3.25, 5.7));
  pCan.add(E.loopLine([P(-0.14, 3.11, 5.02), P(0.14, 3.11, 5.02), P(0.14, 3.29, 5.10), P(-0.14, 3.29, 5.10)], E.mats.major));   // HUD combiner

  // ── Real view only: a true cockpit opening under the canopy with a tub and real furniture (as on the F-22) ──
  const S0 = 3.8, S1 = 7.95, T0 = 4.85, T1 = 7.15, YF = 2.15;
  const hw = (s: number) => s <= S0 || s >= S1 ? 0 : 0.9 * canAt(s).w * Math.pow(Math.sin(Math.PI * (s - S0) / (S1 - S0)), 0.25);
  const ring11 = (s: number) => {
    const f = fus(s), h = hw(s);
    return [P(h, topY(s, h), s), P(f.wU, f.yU, s), P(f.wC, f.yC, s), P(f.wL, f.yL, s), P(f.wB, f.yB, s), P(0, f.yB, s),
      P(-f.wB, f.yB, s), P(-f.wL, f.yL, s), P(-f.wC, f.yC, s), P(-f.wU, f.yU, s), P(-h, topY(s, h), s)];
  };
  const span = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
  const cutSkin = new Geo();
  loft([2.8, S0].map(ring11), { into: cutSkin });
  loft(span(S0, S1, 26).map(ring11), { open: true, into: cutSkin });
  loft([S1, ...stations(S1 + 0.01, 17.6)].map(ring11), { capEnd: true, into: cutSkin });
  const fuseReal = add(pAir, cutSkin.build(), undefined, { lines: false });
  const ckpt = new THREE.Group(); pCan.add(ckpt);
  const CM = cockpitMaterials();
  const sill = (k: number, s: number, dy = -0.006) => P(k * hw(s), topY(s, hw(s)) + dy, s);
  const floorPt = (k: number, s: number) => P(k * hw(s) * 0.94, YF, s);
  { // tub: side walls, floor, front wall behind the panel, bulkhead behind the seat
    const g = new Geo(), ref = P(0, 2.55, 6.0), ts = span(T0, T1, 14);
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
  // K-36D-5 class seat at the F-22 seat's scale; centre stick between the knees, as in the Su-27 family
  const seat = ejectionSeat(CM); seat.scale.setScalar(0.84); seat.position.copy(P(0, YF + 0.16, 6.4)); ckpt.add(seat);
  const panel = instrumentPanel(CM, screen.tex); panel.position.copy(P(0, 2.6, 5.15)); panel.rotation.x = 15 * DEG; ckpt.add(panel);
  const shield = glareshield(CM, 0.8, 0.34); shield.position.copy(P(0, 2.92, 5.07)); ckpt.add(shield);
  const hudSet = hud(CM); hudSet.group.position.copy(P(0, 2.975, 5.0)); ckpt.add(hudSet.group);
  for (const k of SIDES) { const c = consoleBox(CM, 0.2, 2.57 - YF, 1.1); c.position.copy(P(k * 0.37, (2.57 + YF) / 2, 6.2)); ckpt.add(c); }
  const stick = sideStick(CM, 0.42); stick.position.copy(P(0, YF, 5.85)); ckpt.add(stick);
  const thr = throttles(CM); thr.position.copy(P(0.37, 2.57, 6.2)); ckpt.add(thr);                  // left hand
  for (const k of SIDES) cockpitMesh(new THREE.BoxGeometry(0.07, 0.16, 0.03), CM.metal, ckpt, P(k * 0.13, YF + 0.1, 5.4), -0.3);   // rudder pedals
  fuseReal.visible = false; ckpt.visible = false;

  // ═════ nacelles and intakes ═════
  const pInt = part('intakes');
  for (const k of SIDES) {
    const lip = nacRing(k, NAC[0], 0.43);                             // the lower lip juts forward
    add(pInt, loft([lip, ...NAC.slice(1, 4).map(n => nacRing(k, n)), nacRing(k, NAC_SPLIT)]).build());
    add(pInt, loft([NAC_SPLIT, NAC[4], NAC[5]].map(n => nacRing(k, n)), { capEnd: true }).build(), undefined, { real: 'metal' });
    const c = lip.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(lip.length);
    well(pInt, lip.map(p => p.clone().lerp(c, 0.07).add(new THREE.Vector3(0, 0, -0.25))), Z, 'intake');
  }

  // ═════ LEVCONs ═════
  const pLev = part('levcon');
  const lev: Record<number, Hinge> = {};
  for (const k of SIDES) {
    const at = ([x, s]: [number, number]) => P(k * x, LEV_Y, s);
    lev[k] = hinge(pLev, at(LEV_IN), at(LEV_OUT).sub(at(LEV_IN)), 'x');
    add(lev[k].inner, slab([{ le: at([LEV_TIP[0] - 0.03, LEV_TIP[1]]), te: at([LEV_IN[0] - 0.03, LEV_IN[1]]), t: 0.12 }, { le: at([LEV_OUT[0] - 0.04, LEV_OUT[1] - 0.22]), te: at(LEV_OUT), t: 0.07 }], UP, [[0, 0.1], [0.5, 1], [1, 0.7]]).build());
  }

  // ═════ wings, leading-edge flaps, flaperons, ailerons ═════
  const pWing = part('wings'), pLef = part('lef'), pFlap = part('flaperons'), pAil = part('ailerons');
  const lef: Record<number, Hinge> = {}, flap: Record<number, Hinge> = {}, ail: Record<number, Hinge> = {};
  for (const k of SIDES) {
    const n = new THREE.Vector3(k * 0.04, 1, 0);
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

  // ═════ all-moving vertical tails: each whole fin turns on a canted spigot ═════
  const pFin = part('fins');
  const fin: Record<number, Hinge> = {};
  for (const k of SIDES) {
    const v = new THREE.Vector3(k * Math.sin(CANT), Math.cos(CANT), 0), n = new THREE.Vector3(k * Math.cos(CANT), -Math.sin(CANT), 0);
    const pt = (h: number, s: number) => P(k * FIN_X, FIN_Y, s).addScaledVector(v, h);
    fin[k] = hinge(pFin, pt(0, FIN_PIV), v, 'y');
    add(fin[k].inner, slab([0, FH].map(h => ({ le: pt(h, fLE(h)), te: pt(h, fTE(h)), t: fT(h) })), n, FULL_PROF).build());
  }

  // ═════ stabilators ═════
  const pStab = part('stabs');
  const stab: Record<number, Hinge> = {};
  for (const k of SIDES) {
    stab[k] = hinge(pStab, P(k * SR, SY, 18.3), X, 'x');
    add(stab[k].inner, slab([SR, ST].map(x => ({ le: P(k * x, SY, sLE(x)), te: P(k * x, SY, sTE(x)), t: sT(x) })), UP, FULL_PROF).build());
  }

  // ═════ thrust-vectoring nozzles: each swivels on its shroud; the petals open with thrust (scaled in pose) ═════
  const pNoz = part('nozzles');
  const vec: Record<number, Hinge> = {}, exit: Record<number, Hinge> = {};
  const tube = (k: number, s0: number, s1: number, r0: number, r1: number) => loft([nozRing(k, s0, r0), nozRing(k, s1, r1)]).build();
  for (const k of SIDES) {
    add(pNoz, tube(k, 17.4, 17.8, 0.585, 0.575), undefined, { real: 'metal' });
    vec[k] = hinge(pNoz, P(k * NOZ_X, NOZ_Y, 17.75), X, 'x');
    add(vec[k].inner, tube(k, 17.75, 18.55, 0.575, 0.53), undefined, { real: 'metal' });
    exit[k] = hinge(vec[k].inner, P(k * NOZ_X, NOZ_Y, 18.55), Z, 'z');
    add(exit[k].inner, tube(k, 18.55, 19.05, 0.53, 0.48), undefined, { real: 'metal' });
    well(exit[k].inner, nozRing(k, 18.95, 0.47), new THREE.Vector3(0, 0, -1), 'exhaust');
    K.lines(exit[k].inner, Array.from({ length: 8 }, (_, i) => {         // petal seams
      const a = i / 8 * Math.PI * 2, d = (r: number, s: number) => P(k * NOZ_X + r * Math.cos(a), NOZ_Y + r * Math.sin(a), s);
      return [d(0.533, 18.56), d(0.483, 19.04)] as [THREE.Vector3, THREE.Vector3];
    }));
  }

  // ═════ landing gear ═════
  const pNG = part('gearNose'), pMG = part('gearMain');
  // twin-wheel nose leg, retracting forward under the cockpit
  const NGS = 6.6, NGY = bellyY(NGS);
  const noseGear = hinge(pNG, P(0, NGY, NGS), X, 'x');
  add(noseGear.inner, merge([cyl(0.06, 0.62, NGY, 0, NGS), cyl(0.08, 0.36, 0.95, 0, NGS), box(-0.2, 0.2, 0.3, 0.36, NGS - 0.05, NGS + 0.05), brace(P(0, 0.62, NGS + 0.03), P(0, 1.1, NGS + 0.2), 0.026)]), undefined, { real: 'strut' });
  for (const x of [-0.17, 0.17]) wheel(noseGear.inner, 0.33, 0.18, x, 0.33, NGS);
  const taxiGlow = K.taxiLight(noseGear.inner, P(0, 1.0, NGS - 0.1));
  const noseDoor: Hinge[] = [];
  for (const k of SIDES) {
    const y = NGY - 0.006, h = hinge(pNG, P(k * 0.26, y, NGS), Z, 'z');
    add(h.inner, slab([{ le: P(k * 0.26, y, 5.9), te: P(k * 0.02, y, 5.9), t: 0.025 }, { le: P(k * 0.26, y, 7.3), te: P(k * 0.02, y, 7.3), t: 0.025 }], UP, PLATE).build());
    noseDoor.push(h);
  }
  const ngY = NGY - 0.002;
  well(pNG, [P(-0.26, ngY, 5.9), P(0.26, ngY, 5.9), P(0.26, ngY, 7.3), P(-0.26, ngY, 7.3)], DOWN, 'well');
  // main legs outboard of the nacelles, folding forward into the wing roots
  const MGS = 12.8, MGY = 2.1, MGX = 2.18;
  const mainGear: Record<number, Hinge> = {}, mainDoor: Record<number, Hinge> = {};
  for (const k of SIDES) {
    const x = k * MGX;
    mainGear[k] = hinge(pMG, P(x, MGY, MGS), X, 'x');
    add(mainGear[k].inner, merge([cyl(0.08, 0.72, MGY, x, MGS), cyl(0.1, 0.43, 1.15, x, MGS), box(x - 0.2 * k - 0.04, x - 0.2 * k + 0.04, 0.39, 0.47, MGS - 0.05, MGS + 0.05), brace(P(x, 1.3, MGS), P(k * 1.95, 2.05, MGS - 0.5), 0.036)]), undefined, { real: 'strut' });
    wheel(mainGear[k].inner, 0.43, 0.3, x + k * 0.03, 0.43, MGS);
    const y = 2.17;
    mainDoor[k] = hinge(pMG, P(k * 2.55, y, MGS), Z, 'z');
    add(mainDoor[k].inner, slab([{ le: P(k * 2.55, y, 10.6), te: P(k * 2.0, y, 10.6), t: 0.025 }, { le: P(k * 2.55, y, 13.2), te: P(k * 2.0, y, 13.2), t: 0.025 }], UP, PLATE).build());
    well(pMG, [P(k * 2.0, y + 0.01, 10.6), P(k * 2.55, y + 0.01, 10.6), P(k * 2.55, y + 0.01, 13.2), P(k * 2.0, y + 0.01, 13.2)], DOWN, 'well');
  }

  // ═════ weapons bays: two in tandem in the tunnel, one in each wing-root bulge ═════
  const pBay = part('bayMain'), pSide = part('baySide');
  const BAYS = [[8.6, 12.4], [12.6, 16.3]];
  const bayDoor: Hinge[] = [];
  for (const [s0, s1] of BAYS) {
    const sm = (s0 + s1) / 2;
    for (const k of SIDES) {
      const h = hinge(pBay, P(k * 0.72, bellyY(sm) - 0.006, sm), Z, 'z');
      add(h.inner, slab([s0, s1].map(s => ({ le: P(k * 0.72, bellyY(s) - 0.008, s), te: P(k * 0.02, bellyY(s) - 0.008, s), t: 0.025 })), UP, PLATE).build());
      bayDoor.push(h);
    }
    well(pBay, [P(-0.72, bellyY(s0) - 0.003, s0), P(0.72, bellyY(s0) - 0.003, s0), P(0.72, bellyY(s1) - 0.003, s1), P(-0.72, bellyY(s1) - 0.003, s1)], DOWN, 'bay');
  }
  const r77 = missileGeo(3.6, 0.1, 0.17, true), kab = missileGeo(3.1, 0.17, 0.15, false);
  // launchers push each store below the open doors, clear of the tunnel walls: two medium-range missiles in the front
  // bay and two guided bombs in the rear one (no seeker glow on the bombs)
  const bayMissiles = BAYS.flatMap(([s0, s1], b) => [0.3, -0.3].map(x => launcher(pBay, b ? kab : r77, P(x, bellyY((s0 + s1) / 2) + (b ? 0.26 : 0.2), (s0 + s1) / 2), b ? 3.1 : 3.6, 0.78, b ? 0 : 0.05)));
  const bayGlows = seekerGlows.length;
  const sideDoor: Record<number, Hinge> = {}, sideRack: Record<number, Hinge> = {};
  const srms: THREE.Group[] = [];                                  // each heat-seeker with its seeker: what is released
  const r74 = missileGeo(2.9, 0.064, 0.13, false);
  for (const k of SIDES) {
    const a = 8.2, b = 10.6, sm = (a + b) / 2, x = k * 2.04, yT = 1.86, yB = 1.36;
    sideDoor[k] = hinge(pSide, P(x, yT, sm), Z, 'z');
    add(sideDoor[k].inner, slab([{ le: P(x, yT, a), te: P(x, yT, b), t: 0.025 }, { le: P(x, yB, a), te: P(x, yB, b), t: 0.025 }], new THREE.Vector3(k, 0, 0), PLATE).build());
    well(pSide, [P(k * 2.026, yT, a), P(k * 2.026, yT, b), P(k * 2.026, yB, b), P(k * 2.026, yB, a)], new THREE.Vector3(k, 0, 0), 'bay');
    // trapeze: swings the short-range missile out of the bulge
    const piv = P(k * 1.82, 1.92, sm), mPos = P(k * 1.8, 1.52, sm);
    sideRack[k] = hinge(pSide, piv, Z, 'z');
    const mg = r74.clone(); mg.translate(mPos.x, mPos.y, mPos.z);
    const srm = new THREE.Group(); sideRack[k].inner.add(srm); srms.push(srm);
    add(srm, mg);
    K.seeker(srm, mPos.clone().add(new THREE.Vector3(0, 0, 2.9 * 0.47)), 0.035);
    add(sideRack[k].inner, brace(piv, mPos.clone().add(new THREE.Vector3(0, 0.07, 0)), 0.025), undefined, { real: 'strut' });
  }

  // ═════ refuelling probe: folds out of the left side of the nose ═════
  const pRef = part('refuel');
  const piv = P(0.4, 2.48, 4.4), tip = P(0.93, 2.52, 2.8);
  const probe = hinge(pRef, piv, UP, 'y');
  { const d = tip.clone().sub(piv), len = d.length(), q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
    const shaft = new THREE.CylinderGeometry(0.045, 0.05, len, 10).translate(0, len / 2, 0).applyQuaternion(q).translate(piv.x, piv.y, piv.z);
    const nib = new THREE.CylinderGeometry(0.075, 0.06, 0.15, 10).applyQuaternion(q).translate(tip.x, tip.y, tip.z);
    add(probe.inner, merge([shaft, nib]), undefined, { real: 'strut' }); }

  // ═════ lights: formation strips, position lights, beacons ═════
  for (const k of SIDES) {
    const face = (s: number) => { const f = fus(s); return P(k * lerp(f.wC, f.wL, 0.22), lerp(f.yC, f.yL, 0.22), s); };
    const fo = (s: number) => { const f = fus(s); return new THREE.Vector3(k * (f.yC - f.yL), -(f.wC - f.wL), 0); };
    const f25 = fus(2.5);
    strip(face(2.0), face(3.0), new THREE.Vector3(k * (f25.wL - f25.wC), f25.yL - f25.yC, 0), fo(2.5));
    const tx = WT - 0.1;
    strip(P(k * tx, wY(tx) + wT(tx) * 0.3, wLE(tx) + 0.35), P(k * tx, wY(tx) + wT(tx) * 0.3, wTE(tx) - 0.25), X, UP, 0.03);
    strip(P(k * (SR + 0.17), SY, 16.4), P(k * (SR + 0.17), SY, 18.8), UP, new THREE.Vector3(k, 0, 0), 0.03);
  }
  const navPos = SIDES.map(k => P(k * (WT - 0.02), wY(WT), wLE(WT) + 0.12));
  const { stripGlow, navGlow, beaconGlow } = K.finishLights(navPos, [P(0, topY(12.0) + 0.05, 12.0), P(0, bellyY(16.8) - 0.05, 16.8)]);

  // ═════ Real view only: red stars on the wings and fins, a side number on the nose ═════
  const decals: THREE.Mesh[] = [];
  const starTex = decalTexture(256, 256, x => {                       // red star, white border, thin red outline
    for (const [r, c] of [[124, '#a3121a'], [114, '#ecebe6'], [96, '#b8141d']] as const) { x.fillStyle = c; starPath(x, 128, 128, r); x.fill(); }
  });
  const numTex = decalTexture(512, 160, x => {                        // side number: pale blue outline digits
    x.font = '700 132px "Arial Narrow", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineJoin = 'round'; x.strokeStyle = '#1e3a55'; x.lineWidth = 14; x.strokeText('057', 256, 84);
    x.strokeStyle = '#9fd0ee'; x.lineWidth = 7; x.strokeText('057', 256, 84);
  });
  const starMat = decalMaterial(starTex), numMat = decalMaterial(numTex);
  const decal = (parent: THREE.Object3D, mat: THREE.Material, place: (u: number, v: number) => THREE.Vector3, n?: number) => { decals.push(layDecal(parent, mat, place, n)); };
  const prof = profileAt;
  for (const k of SIDES) {
    // upper wing, near the tip: star point toward the nose
    const wingTop = (x: number, s: number) => { const le = wLE(x) + lefC(x), te = wTE(x) - csC(x); return P(k * x, wY(x) + wT(x) / 2 * prof(BOX_PROF, (s - le) / (te - le)) + 0.004, s); };
    const wx = 5.4, ws = lerp(wLE(wx) + lefC(wx), wTE(wx) - csC(wx), 0.45);
    decal(pWing, starMat, (u, v) => wingTop(wx - k * u * 1.0, ws - v * 1.0));
    // outer face of each all-moving fin (turns with it)
    const v = new THREE.Vector3(k * Math.sin(CANT), Math.cos(CANT), 0), n = new THREE.Vector3(k * Math.cos(CANT), -Math.sin(CANT), 0);
    const finSide = (h: number, s: number) => P(k * FIN_X, FIN_Y, s).addScaledVector(v, h).addScaledVector(n, fT(h) / 2 * prof(FULL_PROF, (s - fLE(h)) / (fTE(h) - fLE(h))) + 0.004);
    const fh = 1.15, fs = lerp(fLE(fh), fTE(fh), 0.5);
    decal(fin[k].inner, starMat, (u, w) => finSide(fh + w * 0.75, fs + k * u * 0.75));
    // side number on the upper flank under the canopy, reading toward the tail on the left side
    const flank = (s: number, f: number) => { const q = fus(s); const a = new THREE.Vector2(q.wC, q.yC), b = new THREE.Vector2(q.wU, q.yU), m = a.clone().lerp(b, f);
      const out = new THREE.Vector3(k * (q.yU - q.yC), q.wC - q.wU, 0).normalize(); return P(k * m.x, m.y, s).addScaledVector(out, 0.005); };
    decal(pAir, numMat, (u, w) => flank(5.55 + k * u * 1.1, 0.5 + w * 0.5), 10);
  }

  const apron = buildApron(E, { noseZ: NOSE_Z, length: 20.1, halfSpan: WT, noseGearS: NGS });
  const gearLegs = [noseGear.outer, mainGear[1].outer, mainGear[-1].outer];

  function pose(st: JetState, _now: number, wig: (id: string) => number) {
    // control surfaces (degrees, trailing edge down positive); LEVCONs droop their leading edges on the ground
    const ground = st.gearT * (1 - clamp01(st.alt / 2));
    const lefDeg = 14 * ground + 10 * st.checkLef + 12 * wig('lef');
    const levDeg = 12 * ground + 16 * st.checkLef + 18 * wig('levcon') - 6 * st.p * (1 - ground);
    for (const s of SIDES) {
      const ai = s * st.r * 22 - 20 * st.brakeT + 22 * s * wig('ailerons');
      const fl = s * st.r * 12 + 12 * ground + 25 * st.brakeT + 20 * s * wig('flaperons');
      const sb = -st.p * 20 + s * st.r * 7 + 16 * wig('stabs');
      const fn = st.y * 18 - s * 25 * st.brakeT + 22 * wig('fins');   // the speed brake splays the fins apart
      lef[s].set(lefDeg * DEG); lev[s].set(levDeg * DEG); flap[s].set(-fl * DEG); ail[s].set(-ai * DEG); stab[s].set(-sb * DEG); fin[s].set(fn * DEG);
      // thrust vectoring: both nozzles follow the stick in pitch and split for roll; petals open with thrust
      vec[s].set((st.p * 14 - s * st.r * 8) * DEG);
      const open = 1 + 0.03 * st.rpm + 0.11 * st.abT; exit[s].outer.scale.set(open, open, 1);
    }
    // gear and doors
    const g = ease(st.gearT), gd = ease(st.gearDoorT);
    noseGear.set(-(1 - g) * 100 * DEG);
    for (const s of SIDES) { mainGear[s].set(-(1 - g) * 82 * DEG); mainDoor[s].set(s * 95 * DEG * gd); }
    gearLegs.forEach(o => { o.visible = st.gearT > 0.002; });
    noseDoor.forEach((h, i) => h.set(SIDES[i] * 88 * DEG * gd));
    // bays: doors first, then the launchers push the missiles out
    const bd = ease(clamp01(st.bayMainT / 0.45)), bm = ease(clamp01((st.bayMainT - 0.45) / 0.55));
    bayDoor.forEach((h, i) => h.set(SIDES[i % 2] * 102 * DEG * bd));
    bayMissiles.forEach(m => { m.g.position.y = m.y0 - m.drop * bm; m.rail.scale.y = 0.15 + m.drop * bm; });
    const sd = ease(clamp01(st.baySideT / 0.5)), sm = ease(clamp01((st.baySideT - 0.4) / 0.6));
    for (const s of SIDES) { sideDoor[s].set(s * 110 * DEG * sd); sideRack[s].set(s * 70 * DEG * sm); }
    seekerMat.emissiveIntensity = bm > 0.98 || sm > 0.98 ? 1.6 : 0;
    seekerGlows.forEach((gl, i) => { gl.material.uniforms.intensity.value = (i < bayGlows ? bm : sm) > 0.98 ? 0.8 : 0; });
    canopyH.set(-38 * DEG * ease(st.canopyT));
    probe.set(-19 * DEG * (1 - ease(st.refuelT)));
  }

  return {
    stores: [...bayMissiles.map((m, i) => store(i < 2 ? 'aam' : 'bomb', m.store, 'main')), ...srms.map(o => store('srm', o, 'side'))],
    craft, cgY: 2.3, parts, screen, pose, altMax: 3.8, engines: 2, stage: apron.deck,
    // realistic style: pixel camouflage (light grey with dark blue-grey blocks, a darker spine), light radome, bare
    // metal engine bays and nozzles, red stars; the plumes leave the vectoring nozzles and turn with them
    real: {
      skin: { light: '#c3c8cb', dark: '#4e5b67', camo: 1, panel: 3.4, metalness: 0.32, roughness: 0.42, pixel: 0.4, core: 0.6, scale: 0.65 },
      focus: P(0, 1.7, 10.0), size: 21, stopZ: NOSE_Z - (NGS - 0.55),
      nozzles: SIDES.map(k => ({ parent: vec[k].inner, at: P(k * NOZ_X, NOZ_Y, 19.1), w: 0.95, h: 0.95 })),
      only: { line: [fuseLine, ...lineCockpit, screenMesh], real: [fuseReal, ckpt, ...decals] },
      power: k => hudSet.setPower(k),
    },
    view: { target: P(0, 2.0, 10.0), dist: 36, min: 2.5 },
    lights: { ...K.mats, padLightMat: apron.padLightMat, stripGlow, navGlow, beaconGlow, taxiGlow, padGlow: apron.padGlow, shadowMat: apron.shadowMat, taxiPoolMat: apron.taxiPoolMat, cockpitLight },
  };
}
