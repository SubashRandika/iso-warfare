// Chengdu J-20 ("Mighty Dragon") airframe, built from faceted lofts and aerofoil slabs in metres.
// Axes: +y up, +z forward. `s` is the distance aft of the nose tip, so P(x, y, s) puts a point on the aircraft.
// Side k = +1 is the port (left) side at +x, k = −1 the starboard side.
// A long canard-delta: chined forebody, caret intakes with a diverterless (DSI) bump, large all-moving canards on the
// intake tops, wing-root extensions, a cropped delta wing with slight anhedral, all-moving canted fins on the engine
// shoulders, two ventral fins, close-set engines with serrated nozzles and a drag-chute housing between them.
// Weapons: one wide ventral bay (four long-range missiles) and a side bay behind each intake whose trapeze swings a
// short-range missile out into the airflow; the refuelling probe folds out of the right side of the nose.
import * as THREE from 'three';
import type { Engine } from '../../../iso/engine';
import { Geo, loft, slab, rectRing, merge } from '../../../iso/geo';
import { makeKit, DEG, SIDES, PLATE, ease, clamp01 } from '../jet/kit';
import { buildApron } from '../../../stages/apron';
import type { Hinge, JetRig, JetState } from '../jet/types';
import { cockpitMaterials, cockpitMesh, consoleBox, ejectionSeat, glareshield, hud, instrumentPanel, sideStick, throttles } from '../jet/cockpit';
import { decalMaterial, decalTexture, layDecal, profileAt, starPath } from '../../../real/decals';

const NOSE_Z = 10.2;
const P = (x: number, y: number, s: number) => new THREE.Vector3(x, y, NOSE_Z - s);
const lerp = THREE.MathUtils.lerp;
const X = new THREE.Vector3(1, 0, 0), UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0), Z = new THREE.Vector3(0, 0, 1);

// ── fuselage stations ── s, yTop, upper deck (w, y), chine (w, y), lower side (w, y), belly (w, y)
// The chined nose widens behind the cockpit; from s 10 the body takes in the intake ducts and its chine is the wing
// root. Aft, the belly rises so the two engines bulge underneath, and the body narrows to the spine between the fins.
const FUS: number[][] = [
  [0.00, 2.05, 0.00, 2.05, 0.00, 2.05, 0.00, 2.05, 0.00, 2.05],
  [0.80, 2.22, 0.10, 2.20, 0.22, 2.07, 0.14, 1.95, 0.05, 1.91],
  [1.80, 2.40, 0.20, 2.37, 0.42, 2.11, 0.30, 1.83, 0.12, 1.77],
  [2.80, 2.56, 0.29, 2.52, 0.56, 2.15, 0.40, 1.73, 0.18, 1.66],
  [3.80, 2.68, 0.38, 2.63, 0.66, 2.19, 0.48, 1.65, 0.22, 1.57],
  [5.00, 2.76, 0.48, 2.70, 0.74, 2.23, 0.54, 1.59, 0.26, 1.51],
  [6.20, 2.80, 0.54, 2.74, 0.80, 2.27, 0.60, 1.57, 0.34, 1.49],
  [7.40, 2.82, 0.60, 2.76, 0.88, 2.31, 0.74, 1.57, 0.52, 1.49],
  [8.80, 2.84, 0.74, 2.78, 1.10, 2.36, 1.00, 1.58, 0.86, 1.48],
  [10.4, 2.84, 0.92, 2.78, 1.62, 2.40, 1.40, 1.62, 0.95, 1.50],
  [12.4, 2.82, 0.96, 2.76, 1.70, 2.40, 1.50, 1.64, 1.00, 1.52],
  [14.4, 2.78, 0.92, 2.72, 1.66, 2.38, 1.46, 1.66, 0.98, 1.54],
  [16.0, 2.70, 0.80, 2.64, 1.50, 2.34, 1.36, 1.72, 0.80, 1.66],
  [17.6, 2.58, 0.60, 2.52, 1.30, 2.26, 1.20, 1.84, 0.50, 1.90],
  [19.0, 2.46, 0.40, 2.42, 1.00, 2.20, 0.90, 2.00, 0.30, 2.08],
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

// ── intakes: s, centre (x, y), half-width, half-height, squareness; the ducts sink into the body by s 10 ──
const NAC: number[][] = [
  [5.9, 1.10, 1.98, 0.40, 0.46, 5],
  [7.0, 1.12, 1.98, 0.44, 0.48, 4.5],
  [8.8, 1.12, 1.98, 0.46, 0.48, 4],
  [10.2, 1.05, 1.98, 0.42, 0.44, 3.5],
];
/** 16 points on a superellipse around (k·cx, cy); `rake` moves each point aft by rake × its height above the centre */
const nacRing = (k: number, [s, cx, cy, hw, hh, e]: number[], rake = 0) => Array.from({ length: 16 }, (_, i) => {
  const a = (i + 0.5) / 16 * Math.PI * 2, c = Math.cos(a), n = Math.sin(a);
  const x = cx + hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / e), y = cy + hh * Math.sign(n) * Math.pow(Math.abs(n), 2 / e);
  return P(k * x, y, s + rake * (y - cy));
});
// ── engines: round bodies under the rear fuselage, then the nozzles ──
const NOZ_X = 0.8, NOZ_Y = 1.95;
const ENG = [[14.2, 0.44], [16.0, 0.55], [18.0, 0.56], [19.05, 0.55]];
const engRing = (k: number, s: number, r: number) => Array.from({ length: 16 }, (_, i) => { const a = (i + 0.5) / 16 * Math.PI * 2; return P(k * NOZ_X + r * Math.cos(a), NOZ_Y + r * Math.sin(a), s); });

// ── canards: all-moving, on top of the intakes, 48° leading edge ──
// (the pivot sits a little behind mid-chord and the root just clears the intake top, so a deflection rocks it in place)
const CR = 1.22, CT = 3.4, CY = 2.52, C_PIV = 9.3;
const cLE = (x: number) => 7.5 + (x - CR) * 1.11;
const cTE = (x: number) => lerp(9.85, 10.55, (x - CR) / (CT - CR));
const cT = (x: number) => lerp(0.12, 0.035, (x - CR) / (CT - CR));

// ── wing: cropped delta, 43° leading edge, slight anhedral ──
const WR = 1.3, WT = 6.45;
const wu = (x: number) => (x - WR) / (WT - WR);
const wLE = (x: number) => 10.12 + (x - WR) * 0.93;
const wTE = (x: number) => lerp(17.55, 16.6, wu(x));
const wY = (x: number) => 2.40 - (x - WR) * 0.03;
const wT = (x: number) => lerp(0.34, 0.07, wu(x));
const lefC = (x: number) => lerp(0.55, 0.28, wu(x));
const csC = (x: number) => lerp(1.1, 0.55, wu(x));
const FLAP_END = 4.0;

// ── all-moving vertical tails on the engine shoulders, canted outward ──
const FH = 2.25, CANT = 28 * DEG, FIN_X = 1.05, FIN_Y = 2.5, FIN_PIV = 17.2;
const fLE = (h: number) => 15.6 + h * 1.15;
const fTE = (h: number) => 18.9 + h * 0.25;
const fT = (h: number) => lerp(0.2, 0.06, h / FH);
// ── ventral fins under the engines, canted outward and down ──
const VH = 0.75, VCANT = 35 * DEG, V_X = 0.95, V_Y = 1.46;
const vLE = (h: number) => 16.8 + h * 1.1;
const vTE = (h: number) => 19.0 + h * 0.2;

const BOX_PROF: [number, number][] = [[0, 0.35], [0.4, 1], [1, 0.32]];
const LEF_PROF: [number, number][] = [[0, 0.03], [1, 0.35]];
const CS_PROF: [number, number][] = [[0, 0.32], [1, 0.03]];
const FULL_PROF: [number, number][] = [[0, 0.05], [0.4, 1], [1, 0.05]];

export function buildDragon(E: Engine): JetRig {
  const { recess, glass } = E.mats;
  const K = makeKit(E, NOSE_Z, 2.25);
  const { craft, parts, part, add, hinge, box, cyl, wheel, brace, well, missileGeo, launcher, seekerMat, seekerGlows, strip } = K;
  const stations = (a: number, b: number) => FUS.map(r => r[0]).filter(s => s >= a && s <= b);

  // ═════ airframe: fuselage, wing-root extensions, spine and drag-chute housing ═════
  const pAir = part('airframe');
  const fuseLine = add(pAir, loft(stations(2.8, 19.0).map(fusRing), { capEnd: true }).build());
  add(pAir, loft([rectRing(-0.3, 0.3, 2.05, 2.5, NOSE_Z - 19.0), rectRing(-0.24, 0.24, 2.12, 2.48, NOSE_Z - 19.9), rectRing(-0.2, 0.2, 2.16, 2.44, NOSE_Z - 20.3)], { capEnd: true }).build());
  for (const k of SIDES) {
    const at = (x: number, s: number) => P(k * x, 2.4, s);
    add(pAir, slab([{ le: at(1.0, 9.7), te: at(1.0, 11.6), t: 0.12 }, { le: at(1.9, wLE(1.9) - 0.04), te: at(1.9, wLE(1.9) + 0.5), t: 0.05 }], UP, [[0, 0.1], [0.5, 1], [1, 0.7]]).build());
  }
  { // panel seams across the spine (hairline detail)
    const seam: number[] = [];
    for (const s of [9.0, 12.4, 15.2]) { const f = fus(s); [[-f.wU, f.yU], [0, f.yT], [f.wU, f.yU]].reduce((a, b) => { const A = P(a[0], a[1] + 0.004, s), B = P(b[0], b[1] + 0.004, s); seam.push(A.x, A.y, A.z, B.x, B.y, B.z); return b; }); }
    pAir.add(E.fat(seam, E.mats.line));
  }

  // ═════ radome & the faceted EOTS window under the chin ═════
  const pNose = part('radome');
  add(pNose, loft(stations(0, 2.8).map(fusRing)).build());
  { const w = new THREE.SphereGeometry(0.12, 6, 3, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), c = P(0, bellyY(3.2) + 0.02, 3.2); w.translate(c.x, c.y, c.z); add(pNose, w, undefined, { real: 'seeker' }); }

  // ═════ canopy & cockpit ═════
  const pCan = part('canopy');
  const CAN = [[3.4, 0.06, 0.03], [3.9, 0.30, 0.28], [4.5, 0.44, 0.48], [5.1, 0.52, 0.60], [5.7, 0.55, 0.64], [6.3, 0.53, 0.58], [6.8, 0.46, 0.44], [7.3, 0.30, 0.18], [7.7, 0.15, 0.05]];
  const canAt = (s: number) => { let i = 0; while (i < CAN.length - 2 && CAN[i + 1][0] < s) i++; const a = CAN[i], b = CAN[i + 1], t = THREE.MathUtils.clamp((s - a[0]) / (b[0] - a[0]), 0, 1); return { w: lerp(a[1], b[1], t), h: lerp(a[2], b[2], t) }; };
  const NA = 16;
  const canRing = (s: number) => { const { w, h } = canAt(s); return Array.from({ length: NA + 1 }, (_, i) => { const th = Math.PI * i / NA, x = w * Math.cos(th); return P(x, topY(s, x) - 0.01 + h * Math.sin(th), s); }); };
  const canS = Array.from({ length: 23 }, (_, i) => 3.4 + (7.7 - 3.4) * i / 22);
  const canopyH = hinge(pCan, P(0, topY(7.8), 7.8), X, 'x');   // frameless, hinged at the rear
  add(canopyH.inner, loft(canS.map(canRing), { open: true, capEnd: true }).build(), glass, { outline: false }).renderOrder = 3;
  canopyH.inner.add(E.loopLine(canRing(7.35).map(p => p.clone().add(new THREE.Vector3(0, 0.006, 0))), E.mats.major, false));   // rear seal
  const tub = new Geo();
  const tubRings = Array.from({ length: 12 }, (_, i) => { const s = 4.0 + 3.5 * i / 11, w = canAt(s).w * 0.94; return [P(-w, topY(s, w) + 0.012, s), P(0, topY(s) + 0.012, s), P(w, topY(s, w) + 0.012, s)]; });
  for (let i = 0; i < tubRings.length - 1; i++) for (let j = 0; j < 2; j++) tub.quad(tubRings[i][j], tubRings[i][j + 1], tubRings[i + 1][j + 1], tubRings[i + 1][j], P(0, 0, 5.6));
  const lineCockpit = [
    add(pCan, tub.build(), recess, { outline: false }),
    add(pCan, merge([box(-0.24, 0.24, topY(6.3), 3.15, 6.05, 6.55), box(-0.17, 0.17, 3.15, 3.28, 6.32, 6.55)])),
    add(pCan, box(-0.3, 0.3, topY(4.65), 2.95, 4.45, 4.85)),
  ];
  const { screen, cockpitLight, mesh: screenMesh } = K.cockpitDisplay(pCan, P(0, 2.9, 4.89), new THREE.Vector3(0, 0.75, -0.66), 0.54, 0.2, P(0, 3.1, 5.4));
  pCan.add(E.loopLine([P(-0.14, 2.97, 4.72), P(0.14, 2.97, 4.72), P(0.14, 3.15, 4.8), P(-0.14, 3.15, 4.8)], E.mats.major));   // HUD combiner

  // ── Real view only: a true cockpit opening under the canopy with a tub and real furniture (as on the Su-57) ──
  const S0 = 3.5, S1 = 7.65, T0 = 4.55, T1 = 6.85, YF = 2.0;
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
  loft([S1, ...stations(S1 + 0.01, 19.0)].map(ring11), { capEnd: true, into: cutSkin });
  const fuseReal = add(pAir, cutSkin.build(), undefined, { lines: false });
  const ckpt = new THREE.Group(); pCan.add(ckpt);
  const CM = cockpitMaterials();
  const sill = (k: number, s: number, dy = -0.006) => P(k * hw(s), topY(s, hw(s)) + dy, s);
  const floorPt = (k: number, s: number) => P(k * hw(s) * 0.94, YF, s);
  { // tub: side walls, floor, front wall behind the panel, bulkhead behind the seat
    const g = new Geo(), ref = P(0, 2.4, 5.7), ts = span(T0, T1, 14);
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
  // seat at the F-22 seat's scale; a centre stick, a wide-angle HUD over large displays
  const seat = ejectionSeat(CM); seat.scale.setScalar(0.84); seat.position.copy(P(0, YF + 0.16, 6.15)); ckpt.add(seat);
  const panel = instrumentPanel(CM, screen.tex); panel.position.copy(P(0, 2.46, 4.85)); panel.rotation.x = 15 * DEG; ckpt.add(panel);
  const shield = glareshield(CM, 0.8, 0.34); shield.position.copy(P(0, 2.78, 4.77)); ckpt.add(shield);
  const hudSet = hud(CM); hudSet.group.position.copy(P(0, 2.835, 4.7)); ckpt.add(hudSet.group);
  for (const k of SIDES) { const c = consoleBox(CM, 0.2, 2.42 - YF, 1.1); c.position.copy(P(k * 0.37, (2.42 + YF) / 2, 5.95)); ckpt.add(c); }
  const stick = sideStick(CM, 0.42); stick.position.copy(P(0, YF, 5.6)); ckpt.add(stick);
  const thr = throttles(CM); thr.position.copy(P(0.37, 2.42, 5.95)); ckpt.add(thr);                   // left hand
  for (const k of SIDES) cockpitMesh(new THREE.BoxGeometry(0.07, 0.16, 0.03), CM.metal, ckpt, P(k * 0.13, YF + 0.1, 5.1), -0.3);   // rudder pedals
  fuseReal.visible = false; ckpt.visible = false;

  // ═════ caret intakes with the DSI bump inside each mouth ═════
  const pInt = part('intakes');
  for (const k of SIDES) {
    const lip = nacRing(k, NAC[0], -0.5);                             // raked: the upper lip leads
    add(pInt, loft([lip, ...NAC.slice(1).map(n => nacRing(k, n))], { capEnd: true }).build());
    const c = lip.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(lip.length);
    well(pInt, lip.map(p => p.clone().lerp(c, 0.07).add(new THREE.Vector3(0, 0, -0.25))), Z, 'intake');
    // the bump: a low blister on the fuselage side whose crest sits just inside the mouth
    const bump = new THREE.SphereGeometry(1, 12, 8), bc = P(k * 0.62, 1.98, 6.1);
    bump.scale(0.17, 0.3, 0.85); bump.translate(bc.x, bc.y, bc.z); add(pInt, bump);
  }

  // ═════ engines (bare metal aft of the fuselage skin) ═════
  const pEng = part('nozzles');
  for (const k of SIDES) add(pEng, loft(ENG.map(([s, r]) => engRing(k, s, r)), { capStart: true }).build());

  // ═════ canards ═════
  const pCnd = part('canards');
  const cnd: Record<number, Hinge> = {};
  for (const k of SIDES) {
    cnd[k] = hinge(pCnd, P(k * CR, CY, C_PIV), X, 'x');
    add(cnd[k].inner, slab([CR, CT].map(x => ({ le: P(k * x, CY, cLE(x)), te: P(k * x, CY, cTE(x)), t: cT(x) })), UP, FULL_PROF).build());
  }

  // ═════ wings, leading-edge flaps, flaperons, ailerons ═════
  const pWing = part('wings'), pLef = part('lef'), pFlap = part('flaperons'), pAil = part('ailerons');
  const lef: Record<number, Hinge> = {}, flap: Record<number, Hinge> = {}, ail: Record<number, Hinge> = {};
  for (const k of SIDES) {
    const n = new THREE.Vector3(-k * 0.03, 1, 0);
    const at = (x: number, s: number) => P(k * x, wY(x), s);
    const boxLE = (x: number) => at(x, wLE(x) + lefC(x)), boxTE = (x: number) => at(x, wTE(x) - csC(x));
    add(pWing, slab([WR, WT].map(x => ({ le: boxLE(x), te: boxTE(x), t: wT(x) })), n, BOX_PROF).build());
    lef[k] = hinge(pLef, boxLE(WR), boxLE(WT).sub(boxLE(WR)), 'x');
    add(lef[k].inner, slab([WR, WT].map(x => ({ le: at(x, wLE(x)), te: boxLE(x), t: wT(x) })), n, LEF_PROF).build(), undefined, { real: 'edge' });
    flap[k] = hinge(pFlap, boxTE(WR), boxTE(FLAP_END).sub(boxTE(WR)), 'x');
    add(flap[k].inner, slab([WR, FLAP_END].map(x => ({ le: boxTE(x), te: at(x, wTE(x)), t: wT(x) })), n, CS_PROF).build());
    ail[k] = hinge(pAil, boxTE(FLAP_END), boxTE(WT).sub(boxTE(FLAP_END)), 'x');
    add(ail[k].inner, slab([FLAP_END + 0.03, WT].map(x => ({ le: boxTE(x), te: at(x, wTE(x)), t: wT(x) })), n, CS_PROF).build());
  }

  // ═════ all-moving vertical tails, and the fixed ventral fins ═════
  const pFin = part('fins'), pVen = part('ventrals');
  const fin: Record<number, Hinge> = {};
  const finFrame = (k: number) => ({ v: new THREE.Vector3(k * Math.sin(CANT), Math.cos(CANT), 0), n: new THREE.Vector3(k * Math.cos(CANT), -Math.sin(CANT), 0) });
  for (const k of SIDES) {
    const { v, n } = finFrame(k);
    const pt = (h: number, s: number) => P(k * FIN_X, FIN_Y, s).addScaledVector(v, h);
    fin[k] = hinge(pFin, pt(0, FIN_PIV), v, 'y');
    add(fin[k].inner, slab([0, FH].map(h => ({ le: pt(h, fLE(h)), te: pt(h, fTE(h)), t: fT(h) })), n, FULL_PROF).build());
    const vv = new THREE.Vector3(k * Math.sin(VCANT), -Math.cos(VCANT), 0), vn = new THREE.Vector3(k * Math.cos(VCANT), Math.sin(VCANT), 0);
    const vp = (h: number, s: number) => P(k * V_X, V_Y, s).addScaledVector(vv, h);
    add(pVen, slab([0, VH].map(h => ({ le: vp(h, vLE(h)), te: vp(h, vTE(h)), t: lerp(0.1, 0.04, h / VH) })), vn, FULL_PROF).build());
  }

  // ═════ nozzles: a shroud, then serrated petals that open with thrust (scaled in pose) ═════
  const pNoz = pEng;
  const exit: Record<number, Hinge> = {};
  const tube = (k: number, s0: number, s1: number, r0: number, r1: number) => loft([engRing(k, s0, r0), engRing(k, s1, r1)]).build();
  for (const k of SIDES) {
    add(pNoz, tube(k, 19.0, 19.3, 0.555, 0.545), undefined, { real: 'metal' });
    exit[k] = hinge(pNoz, P(k * NOZ_X, NOZ_Y, 19.3), Z, 'z');
    add(exit[k].inner, tube(k, 19.3, 20.25, 0.545, 0.48), undefined, { real: 'metal' });
    well(exit[k].inner, engRing(k, 20.15, 0.47), new THREE.Vector3(0, 0, -1), 'exhaust');
    const d = (r: number, a: number, s: number) => P(k * NOZ_X + r * Math.cos(a), NOZ_Y + r * Math.sin(a), s);
    K.lines(exit[k].inner, Array.from({ length: 12 }, (_, i) => [d(0.548, i / 12 * Math.PI * 2, 19.31), d(0.483, i / 12 * Math.PI * 2, 20.0)] as [THREE.Vector3, THREE.Vector3]));
    // the sawtooth trailing edge of the petals
    exit[k].inner.add(E.loopLine(Array.from({ length: 24 }, (_, i) => { const a = i / 24 * Math.PI * 2; return d(0.482, a, i % 2 ? 20.0 : 20.27); }), E.mats.major));
  }

  // ═════ landing gear ═════
  const pNG = part('gearNose'), pMG = part('gearMain');
  // nose leg, retracting forward under the cockpit
  const NGS = 4.4, NGY = bellyY(NGS);
  const noseGear = hinge(pNG, P(0, NGY, NGS), X, 'x');
  add(noseGear.inner, merge([cyl(0.06, 0.58, NGY, 0, NGS), cyl(0.08, 0.34, 0.9, 0, NGS), box(-0.19, 0.19, 0.28, 0.34, NGS - 0.05, NGS + 0.05), brace(P(0, 0.6, NGS + 0.03), P(0, 1.05, NGS + 0.2), 0.026)]), undefined, { real: 'strut' });
  for (const x of [-0.16, 0.16]) wheel(noseGear.inner, 0.31, 0.17, x, 0.31, NGS);
  const taxiGlow = K.taxiLight(noseGear.inner, P(0, 0.95, NGS - 0.1));
  const noseDoor: Hinge[] = [];
  for (const k of SIDES) {
    const y = NGY - 0.006, h = hinge(pNG, P(k * 0.24, y, NGS), Z, 'z');
    add(h.inner, slab([{ le: P(k * 0.24, y, 3.8), te: P(k * 0.02, y, 3.8), t: 0.025 }, { le: P(k * 0.24, y, 5.2), te: P(k * 0.02, y, 5.2), t: 0.025 }], UP, PLATE).build());
    noseDoor.push(h);
  }
  const ngY = NGY - 0.002;
  well(pNG, [P(-0.24, ngY, 3.8), P(0.24, ngY, 3.8), P(0.24, ngY, 5.2), P(-0.24, ngY, 5.2)], DOWN, 'well');
  // main legs in the lower fuselage sides, folding forward
  const MGS = 12.6, MGY = 1.62, MGX = 1.4;
  const mainGear: Record<number, Hinge> = {}, mainDoor: Record<number, Hinge> = {};
  for (const k of SIDES) {
    const x = k * MGX;
    mainGear[k] = hinge(pMG, P(x, MGY, MGS), X, 'x');
    add(mainGear[k].inner, merge([cyl(0.08, 0.72, MGY, x, MGS), cyl(0.1, 0.43, 1.12, x, MGS), box(x - 0.2 * k - 0.04, x - 0.2 * k + 0.04, 0.39, 0.47, MGS - 0.05, MGS + 0.05), brace(P(x, 1.2, MGS), P(k * 1.15, 1.58, MGS - 0.5), 0.036)]), undefined, { real: 'strut' });
    wheel(mainGear[k].inner, 0.43, 0.3, x + k * 0.03, 0.43, MGS);
    const y = 1.585;
    mainDoor[k] = hinge(pMG, P(k * 1.52, y, MGS), Z, 'z');
    add(mainDoor[k].inner, slab([{ le: P(k * 1.52, y, 11.6), te: P(k * 1.02, y, 11.6), t: 0.025 }, { le: P(k * 1.52, y, 13.6), te: P(k * 1.02, y, 13.6), t: 0.025 }], UP, PLATE).build());
    well(pMG, [P(k * 1.02, y + 0.01, 11.6), P(k * 1.52, y + 0.01, 11.6), P(k * 1.52, y + 0.01, 13.6), P(k * 1.02, y + 0.01, 13.6)], DOWN, 'well');
  }

  // ═════ weapons bays: one wide ventral bay, one side bay behind each intake ═════
  const pBay = part('bayMain'), pSide = part('baySide');
  const B0 = 8.8, B1 = 12.8, BM = (B0 + B1) / 2, BW = 0.84;
  const bayDoor: Hinge[] = [];
  for (const k of SIDES) {
    const h = hinge(pBay, P(k * BW, bellyY(BM) - 0.006, BM), Z, 'z');
    add(h.inner, slab([B0, B1].map(s => ({ le: P(k * BW, bellyY(s) - 0.008, s), te: P(k * 0.02, bellyY(s) - 0.008, s), t: 0.025 })), UP, PLATE).build());
    bayDoor.push(h);
  }
  well(pBay, [P(-BW, bellyY(B0) - 0.003, B0), P(BW, bellyY(B0) - 0.003, B0), P(BW, bellyY(B1) - 0.003, B1), P(-BW, bellyY(B1) - 0.003, B1)], DOWN, 'bay');
  // four long-range missiles side by side; the inner pair drops further so the fins clear the outer pair
  const pl15 = missileGeo(3.9, 0.1, 0.2, true);
  const bayMissiles = [[0.22, 0.95], [-0.22, 0.95], [0.62, 0.72], [-0.62, 0.72]].map(([x, drop]) => launcher(pBay, pl15, P(x, bellyY(BM) + 0.22, BM), 3.9, drop, 0.05));
  const sideDoor: Record<number, Hinge> = {}, sideRack: Record<number, Hinge> = {};
  const pl10 = missileGeo(2.9, 0.064, 0.13, false);
  for (const k of SIDES) {
    const a = 8.55, b = 11.45, sm = (a + b) / 2, x = k * 1.5, yT = 2.12, yB = 1.66;
    sideDoor[k] = hinge(pSide, P(x, yT, sm), Z, 'z');
    add(sideDoor[k].inner, slab([{ le: P(x, yT, a), te: P(x, yT, b), t: 0.025 }, { le: P(x, yB, a), te: P(x, yB, b), t: 0.025 }], new THREE.Vector3(k, 0, 0), PLATE).build());
    well(pSide, [P(k * 1.486, yT, a), P(k * 1.486, yT, b), P(k * 1.486, yB, b), P(k * 1.486, yB, a)], new THREE.Vector3(k, 0, 0), 'bay');
    // trapeze: swings the short-range missile out of the bay so its seeker can lock on before launch
    const piv = P(k * 1.28, 2.18, sm), mPos = P(k * 1.3, 1.84, sm);
    sideRack[k] = hinge(pSide, piv, Z, 'z');
    const mg = pl10.clone(); mg.translate(mPos.x, mPos.y, mPos.z);
    add(sideRack[k].inner, mg);
    K.seeker(sideRack[k].inner, mPos.clone().add(new THREE.Vector3(0, 0, 2.9 * 0.47)), 0.035);
    add(sideRack[k].inner, brace(piv, mPos.clone().add(new THREE.Vector3(0, 0.07, 0)), 0.025), undefined, { real: 'strut' });
  }

  // ═════ refuelling probe: folds out of the right side of the nose ═════
  const pRef = part('refuel');
  const piv = P(-0.42, 2.58, 3.9), tip = P(-0.92, 2.62, 2.4);
  const probe = hinge(pRef, piv, UP, 'y');
  { const d = tip.clone().sub(piv), len = d.length(), q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
    const shaft = new THREE.CylinderGeometry(0.045, 0.05, len, 10).translate(0, len / 2, 0).applyQuaternion(q).translate(piv.x, piv.y, piv.z);
    const nib = new THREE.CylinderGeometry(0.075, 0.06, 0.15, 10).applyQuaternion(q).translate(tip.x, tip.y, tip.z);
    add(probe.inner, merge([shaft, nib]), undefined, { real: 'strut' }); }

  // ═════ lights: formation strips, position lights, beacons ═════
  for (const k of SIDES) {
    const face = (s: number) => { const f = fus(s); return P(k * lerp(f.wC, f.wL, 0.22), lerp(f.yC, f.yL, 0.22), s); };
    const fo = (s: number) => { const f = fus(s); return new THREE.Vector3(k * (f.yC - f.yL), -(f.wC - f.wL), 0); };
    const side = (s: number) => { const f = fus(s); return new THREE.Vector3(k * (f.wL - f.wC), f.yL - f.yC, 0); };
    strip(face(2.0), face(3.0), side(2.5), fo(2.5));
    strip(face(15.0), face(16.6), side(15.8), fo(15.8));
    const tx = WT - 0.1;
    strip(P(k * tx, wY(tx) + wT(tx) * 0.3, wLE(tx) + 0.35), P(k * tx, wY(tx) + wT(tx) * 0.3, wTE(tx) - 0.25), X, UP, 0.03);
  }
  const navPos = SIDES.map(k => P(k * (WT - 0.02), wY(WT), wLE(WT) + 0.12));
  const { stripGlow, navGlow, beaconGlow } = K.finishLights(navPos, [P(0, topY(12.0) + 0.05, 12.0), P(0, bellyY(14.8) - 0.05, 14.8)]);

  // ═════ Real view only: light edge bands, low-visibility insignia, a nose number ═════
  const decals: THREE.Mesh[] = [];
  const INK = '#555c62';
  const insTex = decalTexture(512, 256, x => {                        // star with "八一" and a bar each side, outlines only
    x.strokeStyle = INK; x.fillStyle = INK; x.lineWidth = 9; x.lineJoin = 'miter';
    x.strokeRect(16, 100, 150, 56); x.strokeRect(346, 100, 150, 56);
    starPath(x, 256, 128, 118); x.stroke();
    x.font = '700 64px "Microsoft YaHei", "SimHei", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('八一', 256, 136);
  });
  const numTex = decalTexture(512, 160, x => {                        // nose number, dark grey
    x.font = '700 120px "Arial Narrow", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = INK; x.fillText('20011', 256, 84);
  });
  const insMat = decalMaterial(insTex), numMat = decalMaterial(numTex);
  const edgeMat = decalMaterial(decalTexture(4, 4, x => { x.fillStyle = '#d6d9da'; x.fillRect(0, 0, 4, 4); }), { metalness: 0.3, roughness: 0.38 });
  const decal = (parent: THREE.Object3D, mat: THREE.Material, place: (u: number, v: number) => THREE.Vector3, n?: number) => { decals.push(layDecal(parent, mat, place, n)); };
  const band = (parent: THREE.Object3D, at: (a: number, b: number) => THREE.Vector3) => decal(parent, edgeMat, (u, v) => at(u + 0.5, v + 0.5), 12);
  const prof = profileAt, EB = 0.22;
  for (const k of SIDES) {
    const { v, n } = finFrame(k);
    for (const side of [1, -1]) {
      // canard: leading edge, trailing edge and tip
      const cAt = (x: number, s: number) => P(k * x, CY + side * (cT(x) / 2 * prof(FULL_PROF, (s - cLE(x)) / (cTE(x) - cLE(x))) + 0.004), s);
      band(cnd[k].inner, (a, b) => { const x = lerp(CR + 0.05, CT, a); return cAt(x, cLE(x) + EB * b); });
      band(cnd[k].inner, (a, b) => { const x = lerp(CR + 0.05, CT, a); return cAt(x, cTE(x) - EB * 0.8 * b); });
      band(cnd[k].inner, (a, b) => { const x = CT - EB * a; return cAt(x, lerp(cLE(x), cTE(x), b)); });
      // wing: trailing edges of the flaperon and aileron, and the tip (the leading-edge flap is painted 'edge')
      const csAt = (x: number, s: number) => { const h = wTE(x) - csC(x); return P(k * x, wY(x) + side * (wT(x) / 2 * prof(CS_PROF, (s - h) / csC(x)) + 0.004), s); };
      const boxAt = (x: number, s: number, lift = 0.004) => { const le = wLE(x) + lefC(x), te = wTE(x) - csC(x); return P(k * x, wY(x) + side * (wT(x) / 2 * prof(BOX_PROF, (s - le) / (te - le)) + lift), s); };
      band(flap[k].inner, (a, b) => { const x = lerp(WR + 0.02, FLAP_END - 0.02, a); return csAt(x, wTE(x) - 0.2 * b); });
      band(ail[k].inner, (a, b) => { const x = lerp(FLAP_END + 0.05, WT, a); return csAt(x, wTE(x) - 0.2 * b); });
      band(pWing, (a, b) => { const x = WT - EB * a; return boxAt(x, lerp(wLE(x) + lefC(x), wTE(x) - csC(x), b)); });
      // fin: leading edge, trailing edge, tip
      const finAt = (h: number, s: number) => P(k * FIN_X, FIN_Y, s).addScaledVector(v, h).addScaledVector(n, side * (fT(h) / 2 * prof(FULL_PROF, (s - fLE(h)) / (fTE(h) - fLE(h))) + 0.004));
      band(fin[k].inner, (a, b) => { const h = FH * a; return finAt(h, fLE(h) + EB * b); });
      band(fin[k].inner, (a, b) => { const h = FH * a; return finAt(h, fTE(h) - EB * 0.8 * b); });
      band(fin[k].inner, (a, b) => { const h = FH - EB * 0.8 * a; return finAt(h, lerp(fLE(h), fTE(h), b)); });
      // insignia near the wingtip: on top of the left wing and under the right wing
      if (side === k) { const wx = 5.0, ws = lerp(wLE(wx) + lefC(wx), wTE(wx) - csC(wx), 0.45); decal(pWing, insMat, (u, w) => boxAt(wx - k * u * 1.6, ws - w * 0.8, 0.006)); }
    }
    // insignia on the outer face of each fin (turns with it)
    const finSide = (h: number, s: number) => P(k * FIN_X, FIN_Y, s).addScaledVector(v, h).addScaledVector(n, fT(h) / 2 * prof(FULL_PROF, (s - fLE(h)) / (fTE(h) - fLE(h))) + 0.006);
    const fh = 1.1, fs = lerp(fLE(fh), fTE(fh), 0.5);
    decal(fin[k].inner, insMat, (u, w) => finSide(fh + w * 0.6, fs + k * u * 1.2));
    // nose number on the flank ahead of the canopy, reading toward the tail on the left side
    const flank = (s: number, f: number) => { const q = fus(s); const a = new THREE.Vector2(q.wC, q.yC), b = new THREE.Vector2(q.wU, q.yU), m = a.clone().lerp(b, f);
      const out = new THREE.Vector3(k * (q.yU - q.yC), q.wC - q.wU, 0).normalize(); return P(k * m.x, m.y, s).addScaledVector(out, 0.005); };
    decal(pAir, numMat, (u, w) => flank(3.0 + k * u * 1.1, 0.45 + w * 0.5), 10);
  }

  const apron = buildApron(E, { noseZ: NOSE_Z, length: 20.4, halfSpan: WT, noseGearS: NGS });
  const gearLegs = [noseGear.outer, mainGear[1].outer, mainGear[-1].outer];

  function pose(st: JetState, _now: number, wig: (id: string) => number) {
    // control surfaces (degrees). Canards: leading edge up positive; wing surfaces: trailing edge down positive.
    // With no tailplane, the canards and the wing's trailing edges share pitch; there is no airbrake panel either:
    // for the speed brake the canards tilt nose down, the ailerons rise, the flaperons drop and the fins splay apart.
    const ground = st.gearT * (1 - clamp01(st.alt / 2));
    const lefDeg = 14 * ground + 10 * st.checkLef + 12 * wig('lef');
    for (const s of SIDES) {
      // modest travel, as on the aircraft: canards up to 12° leading edge up but only about 5° down (more would bury the
      // leading edge in the intake top), a few degrees apart for roll; fins ±10° for yaw
      const cn0 = st.p * 12 + s * st.r * 4 - 12 * st.brakeT + 12 * wig('canards'), cn = cn0 < 0 ? cn0 * 0.42 : cn0;
      const ai = s * st.r * 22 - st.p * 8 - 20 * st.brakeT + 22 * s * wig('ailerons');
      const fl = s * st.r * 12 - st.p * 10 + 12 * ground + 25 * st.brakeT + 20 * s * wig('flaperons');
      const fn = st.y * 10 - s * 12 * st.brakeT + 12 * wig('fins');
      cnd[s].set(-cn * DEG); lef[s].set(lefDeg * DEG); flap[s].set(-fl * DEG); ail[s].set(-ai * DEG); fin[s].set(fn * DEG);
      const open = 1 + 0.03 * st.rpm + 0.11 * st.abT; exit[s].outer.scale.set(open, open, 1);
    }
    // gear and doors
    const g = ease(st.gearT), gd = ease(st.gearDoorT);
    noseGear.set(-(1 - g) * 100 * DEG);
    for (const s of SIDES) { mainGear[s].set(-(1 - g) * 82 * DEG); mainDoor[s].set(s * 95 * DEG * gd); }
    gearLegs.forEach(o => { o.visible = st.gearT > 0.002; });
    noseDoor.forEach((h, i) => h.set(SIDES[i] * 88 * DEG * gd));
    // bays: doors first, then the launchers push the missiles out; the side trapezes swing out
    const bd = ease(clamp01(st.bayMainT / 0.45)), bm = ease(clamp01((st.bayMainT - 0.45) / 0.55));
    bayDoor.forEach((h, i) => h.set(SIDES[i] * 102 * DEG * bd));
    bayMissiles.forEach(m => { m.g.position.y = m.y0 - m.drop * bm; m.rail.scale.y = 0.15 + m.drop * bm; });
    const sd = ease(clamp01(st.baySideT / 0.5)), sm = ease(clamp01((st.baySideT - 0.4) / 0.6));
    for (const s of SIDES) { sideDoor[s].set(s * 110 * DEG * sd); sideRack[s].set(s * 70 * DEG * sm); }
    seekerMat.emissiveIntensity = bm > 0.98 || sm > 0.98 ? 1.6 : 0;
    seekerGlows.forEach((gl, i) => { gl.material.uniforms.intensity.value = (i < bayMissiles.length ? bm : sm) > 0.98 ? 0.8 : 0; });
    canopyH.set(-38 * DEG * ease(st.canopyT));
    probe.set(19 * DEG * (1 - ease(st.refuelT)));
  }

  return {
    craft, cgY: 2.25, parts, screen, pose, altMax: 3.8, engines: 2, stage: apron.deck,
    // realistic style: light grey with large soft medium-grey patches, light grey bands on every edge, bare metal
    // nozzles, low-visibility insignia; the plumes leave the serrated nozzles
    real: {
      skin: { light: '#a9b0b5', dark: '#767e85', camo: 0.95, panel: 3.4, metalness: 0.3, roughness: 0.45, scale: 1.5, edge: '#d6d9da' },
      focus: P(0, 1.9, 10.2), size: 21, stopZ: NOSE_Z - (NGS - 0.55),
      nozzles: SIDES.map(k => ({ parent: pNoz, at: P(k * NOZ_X, NOZ_Y, 20.3), w: 0.92, h: 0.92 })),
      only: { line: [fuseLine, ...lineCockpit, screenMesh], real: [fuseReal, ckpt, ...decals] },
      power: k => hudSet.setPower(k),
    },
    view: { target: P(0, 2.0, 10.2), dist: 36, min: 2.5 },
    lights: { ...K.mats, padLightMat: apron.padLightMat, stripGlow, navGlow, beaconGlow, taxiGlow, padGlow: apron.padGlow, shadowMat: apron.shadowMat, taxiPoolMat: apron.taxiPoolMat, cockpitLight },
  };
}
