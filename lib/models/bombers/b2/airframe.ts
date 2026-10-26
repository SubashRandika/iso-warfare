// Northrop Grumman B-2 Spirit airframe: a tailless flying wing, lofted span-station by span-station, in metres.
// Axes: +y up, +z forward. `s` is the distance aft of the nose apex, so P(x, y, s) puts a point on the aircraft.
// Side k = +1 is the port (left) side at +x, k = −1 the starboard side.
// Planform: 33° leading edges and the sawtooth "double W" trailing edge, every segment of it parallel to one of the
// leading edges: the outer panels keep a constant chord of about 4 m, so the tips reach back level with the tail.
// 52.4 m span, 21 m long, about 478 m² of wing. On top: the cockpit crown, a broad engine hump per side with its
// intake, ending in the exhaust slot over a tiled trough. The crown and humps fade into the wing, as on the aircraft. Control: three elevons and a split drag rudder per side
// and the gust-load-alleviation surface (the "beaver tail") on the centre line.
import * as THREE from 'three';
import type { Engine } from '../../../iso/engine';
import { Geo, loft, slab, merge } from '../../../iso/geo';
import { makeKit, DEG, SIDES, ease, clamp01 } from '../../fighters/jet/kit';
import { buildApron } from '../../../stages/apron';
import { store, type Hinge, type JetRig, type JetState, type Store } from '../../fighters/jet/types';
import { decalMaterial, decalTexture, layDecal, lowVisStarAndBar } from '../../../real/decals';

const NOSE_Z = 10.5;
const P = (x: number, y: number, s: number) => new THREE.Vector3(x, y, NOSE_Z - s);
const lerp = THREE.MathUtils.lerp;
const X = new THREE.Vector3(1, 0, 0), UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0), Z = new THREE.Vector3(0, 0, 1);
/** piecewise-linear table lookup */
const tab = (t: number[][], v: number) => { let i = 0; while (i < t.length - 2 && t[i + 1][0] < v) i++; const a = t[i], b = t[i + 1]; return lerp(a[1], b[1], THREE.MathUtils.clamp((v - a[0]) / (b[0] - a[0]), 0, 1)); };

// ── planform ──
const SWEEP = Math.tan(33 * DEG);
const TIP = 26.2;
const LE = (x: number) => SWEEP * Math.abs(x);
// trailing-edge vertices: tail point, inner notch, outer point, outer notch, tip
const NOTCH_IN = 6.0, POINT = 8.5, NOTCH_OUT = 15.6;
const S_IN = 21.0 - SWEEP * NOTCH_IN, S_PT = S_IN + SWEEP * (POINT - NOTCH_IN), S_OUT = S_PT - SWEEP * (NOTCH_OUT - POINT);
const TE_PTS = [[0, 21.0], [NOTCH_IN, S_IN], [POINT, S_PT], [NOTCH_OUT, S_OUT], [TIP, S_OUT + SWEEP * (TIP - NOTCH_OUT)]];
const TE = (x: number) => tab(TE_PTS, Math.abs(x));
// control surfaces cut out of the trailing edge: the beaver tail on the centre line, elevons and drag rudders outboard
// (the inboard elevon on the forward-running segment, two more and the drag rudder on the outer panel)
const GLAS_S = 19.6, CS0 = 8.8, ELEVONS = [[8.8, 15.45], [15.75, 19.9], [20.0, 23.8]], RUDDER = [23.9, 26.0];
const csC = (x: number) => lerp(1.6, 1.15, THREE.MathUtils.clamp((Math.abs(x) - CS0) / (26 - CS0), 0, 1));
const TEmain = (x: number) => { const a = Math.abs(x); return a >= CS0 ? TE(a) - csC(a) : Math.min(TE(a), GLAS_S); };
// ── thickness: a thick centre body thinning to the tips, more of it above the chord line than below ──
const yMid = (x: number) => 3.25 - 0.012 * Math.abs(x);
const T_TAB = [[0, 1.9], [3, 1.75], [NOTCH_IN, 1.3], [POINT, 1.0], [NOTCH_OUT, 0.42], [TIP, 0.24]];
const thick = (x: number) => tab(T_TAB, Math.abs(x));
const UPPER = 0.64, LOWER = 0.36;
const HP = [[0, 0], [0.02, 0.35], [0.08, 0.65], [0.25, 0.95], [0.4, 1], [0.6, 0.85], [0.85, 0.4], [1, 0.04]];
/** half-thickness ratio along the chord; cut trailing edges (where a control surface hinges) stay blunt */
const hp = (c: number, blunt: boolean) => { const v = tab(HP, THREE.MathUtils.clamp(c, 0, 1)); return blunt && c > 0.85 ? Math.max(v, lerp(0.4, 0.16, (c - 0.85) / 0.15)) : v; };
const isCut = (x: number) => Math.abs(x) >= CS0;
const chordC = (x: number, s: number) => (s - LE(x)) / (TEmain(x) - LE(x));
const yTop = (x: number, s: number) => yMid(x) + UPPER * thick(x) * hp(chordC(x, s), isCut(x));
const yBot = (x: number, s: number) => yMid(x) - LOWER * thick(x) * hp(chordC(x, s), isCut(x));
const CHORD_C = [0, 0.01, 0.03, 0.06, 0.1, 0.16, 0.24, 0.33, 0.43, 0.54, 0.66, 0.78, 0.89, 1];
const STATIONS = [0, 1, 2.16, 3, 4.5, NOTCH_IN, 7.2, POINT, CS0, 10.5, 12.5, 14, NOTCH_OUT, 18, 21, 24, TIP];

// ── cockpit crown: s, half-width, height above the wing; the cross-section (1 − u²)^1.4 meets the wing tangentially ──
const CROWN = [[0.9, 0.2, 0.02], [2.0, 1.2, 0.34], [3.2, 1.7, 0.66], [4.4, 1.9, 0.78], [5.8, 1.9, 0.7], [7.5, 1.7, 0.45], [9.2, 1.3, 0.2], [10.8, 0.7, 0.02]];
const CROWN_S0 = CROWN[0][0], CROWN_S1 = CROWN[CROWN.length - 1][0];
const bell = (u: number, e: number) => Math.pow(Math.max(0, 1 - u * u), e);
// ── engine humps (two F118s side by side under each): s, half-width, height above the wing; the intake at the front,
// the exhaust slot at the back ──
const HUMP_X = 4.2, HUMP = [[5.8, 1.45, 0.72], [6.8, 1.8, 0.7], [9.0, 2.0, 0.62], [11.5, 1.95, 0.5], [13.6, 1.8, 0.36]];
/** cross-section exponent: a full, tall intake mouth at the front, blending into the wing further aft */
const humpE = (s: number) => lerp(0.65, 1.3, THREE.MathUtils.clamp((s - HUMP[0][0]) / 2.6, 0, 1));
const HUMP_S0 = HUMP[0][0], HUMP_S1 = HUMP[HUMP.length - 1][0];

const CS_PROF: [number, number][] = [[0, 1], [1, 0.15]];
const PLATE: [number, number][] = [[0, 1], [1, 1]];

export function buildSpirit(E: Engine): JetRig {
  const { glass } = E.mats;
  const K = makeKit(E, NOSE_Z, 3.2);
  const { craft, parts, part, add, hinge, cyl, wheel, brace, well, missileGeo, strip } = K;

  // ═════ the wing: centre body and outer wings, one airfoil section per span station ═════
  const ring = (x: number) => {
    const sL = LE(x), sT = TEmain(x), t = thick(x), y0 = yMid(x), cut = isCut(x);
    const top = CHORD_C.map(c => P(x, y0 + UPPER * t * hp(c, cut), lerp(sL, sT, c)));
    const bot = CHORD_C.slice(1, -1).reverse().map(c => P(x, y0 - LOWER * t * hp(c, cut), lerp(sL, sT, c)));
    return [...top, ...bot];
  };
  const pAir = part('airframe'), pWing = part('wings');
  const centre = [...STATIONS.filter(v => v <= NOTCH_IN).slice(1).reverse().map(v => -v), ...STATIONS.filter(v => v <= NOTCH_IN)];
  add(pAir, loft(centre.map(ring)).build());
  for (const k of SIDES) {
    const outer = STATIONS.filter(v => v >= NOTCH_IN).map(v => k * v);
    add(pWing, loft(outer.map(ring), { capEnd: true }).build());
  }

  // ═════ cockpit crown, windscreen panels and the crew hatch ═════
  const pCan = part('canopy');
  const crownAt = (s: number) => ({ w: tab(CROWN.map(r => [r[0], r[1]]), s), h: tab(CROWN.map(r => [r[0], r[2]]), s) });
  const crownPt = (u: number, s: number, lift = 0) => { const { w, h } = crownAt(s), x = u * w; return P(x, yTop(x, s) - 0.05 + h * bell(u, 1.4) + lift, s); };
  const crownS = Array.from({ length: 21 }, (_, i) => CROWN_S0 + (CROWN_S1 - CROWN_S0) * i / 20);
  add(pCan, loft(crownS.map(s => Array.from({ length: 13 }, (_, i) => crownPt(Math.cos(Math.PI * i / 12), s))), { open: true }).build());
  // four windscreen panels: two large ones in front, a smaller one each side
  const pane = (u0: number, u1: number, s0: number, s1: number) => {
    const pts = [crownPt(u0, s0, 0.012), crownPt(u1, s0, 0.012), crownPt(u1, s1, 0.012), crownPt(u0, s1, 0.012)];
    const g = new Geo(); g.sheet(pts, crownPt((u0 + u1) / 2, (s0 + s1) / 2, 1).sub(crownPt((u0 + u1) / 2, (s0 + s1) / 2)));
    add(pCan, g.build(), glass, { outline: false, lines: false }).renderOrder = 3;
    pCan.add(E.loopLine(pts.map(p => p.clone().add(new THREE.Vector3(0, 0.004, 0))), E.mats.major));
  };
  for (const k of SIDES) { pane(k * 0.04, k * 0.5, 2.5, 3.7); pane(k * 0.54, k * 0.76, 2.85, 4.25); }
  // the cockpit display sits under the crown (it lights the readout screen; the crew area itself is not modelled)
  const { screen, cockpitLight } = K.cockpitDisplay(pCan, P(0, 4.5, 3.9), new THREE.Vector3(0, 0.6, -0.8), 0.6, 0.22, P(0, 4.7, 4.4));
  // crew hatch under the cockpit: hinged at its front edge, it swings down with the boarding ladder on its inside
  const HS0 = 6.2, HS1 = 7.6, hy = (s: number) => yBot(0, s) - 0.006;
  const hatch = hinge(pCan, P(0, hy(HS0), HS0), X, 'x');
  add(hatch.inner, slab([HS0, HS1].map(s => ({ le: P(-0.42, hy(s), s), te: P(0.42, hy(s), s), t: 0.03 })), UP, PLATE).build());
  add(hatch.inner, merge([0.25, 0.5, 0.75].flatMap(f => { const s = lerp(HS0, HS1, f); return [new THREE.BoxGeometry(0.6, 0.03, 0.03).translate(0, hy(s) + 0.05, NOSE_Z - s)]; })), undefined, { real: 'strut' });
  well(pCan, [P(-0.42, hy(HS0) + 0.004, HS0), P(0.42, hy(HS0) + 0.004, HS0), P(0.42, hy(HS1) + 0.004, HS1), P(-0.42, hy(HS1) + 0.004, HS1)], DOWN, 'well');

  // ═════ engine humps with their intakes, the exhaust slots and the troughs behind them ═════
  const pInt = part('intakes'), pNoz = part('nozzles');
  const humpAt = (s: number) => ({ w: tab(HUMP.map(r => [r[0], r[1]]), s), h: tab(HUMP.map(r => [r[0], r[2]]), s) });
  const troughs: { x0: number; x1: number }[] = [];
  for (const k of SIDES) {
    const hpt = (u: number, s: number) => { const { w, h } = humpAt(s), x = k * HUMP_X + u * w; return P(x, yTop(x, s) - 0.06 + h * bell(u, humpE(s)), s); };
    const hs = Array.from({ length: 15 }, (_, i) => HUMP_S0 + (HUMP_S1 - HUMP_S0) * i / 14);
    const arc = (s: number) => Array.from({ length: 15 }, (_, i) => hpt(-Math.cos(Math.PI * i / 14), s));
    add(pInt, loft(hs.map(arc), { open: true, capStart: true, capEnd: true }).build());
    // intake: a dark mouth with a sawtooth lip, slightly inside the front of the hump
    const inset = (pts: THREE.Vector3[], dz: number) => { const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pts.length); return pts.map(p => p.clone().lerp(c, 0.08).add(new THREE.Vector3(0, -0.02, dz))); };
    well(pInt, inset(arc(HUMP_S0).slice(1, -1), -0.03), Z, 'intake');
    const zig: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) { const u = -1 + 2 * i / 12; zig.push(hpt(u * 0.96, HUMP_S0 + (i % 2 ? 0.35 : 0)).add(new THREE.Vector3(0, 0.01, 0))); }
    pInt.add(E.loopLine(zig, E.mats.major, false));
    // exhaust: the slot across the back of the hump, then the trough (the aft deck) out to the trailing edge
    well(pNoz, inset(arc(HUMP_S1).slice(1, -1), 0.03), Z.clone().negate(), 'intake');
    const w1 = humpAt(HUMP_S1).w * 0.92, x0 = k * (HUMP_X - w1), x1 = k * (HUMP_X + w1);
    K.lines(pNoz, [x0, x1].map(x => [P(x, yTop(x, HUMP_S1) + 0.02, HUMP_S1), P(x, yTop(x, TE(x) - 0.05) + 0.02, TE(x) - 0.05)] as [THREE.Vector3, THREE.Vector3]), true);
    troughs.push({ x0, x1 });
  }

  // ═════ elevons, split drag rudders, the beaver tail ═════
  const pElev = part('elevons'), pRud = part('rudders'), pGlas = part('glas');
  const elev: Hinge[][] = [], rudU: Record<number, Hinge> = {}, rudL: Record<number, Hinge> = {};
  for (const k of SIDES) {
    const hingePt = (x: number) => P(k * x, yMid(x), TEmain(x));
    const row: Hinge[] = [];
    for (const [a, b] of ELEVONS) {
      const h = hinge(pElev, hingePt(a), hingePt(b).sub(hingePt(a)), 'x');
      add(h.inner, slab([a, b].map(x => ({ le: hingePt(x), te: P(k * x, yMid(x), TE(x)), t: thick(x) * 0.16 * 0.8 })), UP, CS_PROF).build());
      row.push(h);
    }
    elev.push(row);
    // drag rudder: upper and lower halves that open like a clam
    const [a, b] = RUDDER;
    for (const side of [1, -1]) {
      const yo = (x: number) => side * thick(x) * 0.035;
      const h = hinge(pRud, P(k * a, yMid(a) + yo(a), TEmain(a)), P(k * b, yMid(b) + yo(b), TEmain(b)).sub(P(k * a, yMid(a) + yo(a), TEmain(a))), 'x');
      add(h.inner, slab([a, b].map(x => ({ le: P(k * x, yMid(x) + yo(x), TEmain(x)), te: P(k * x, yMid(x) + side * 0.004, TE(x)), t: thick(x) * 0.06 })), UP, CS_PROF).build());
      if (side > 0) rudU[k] = h; else rudL[k] = h;
    }
  }
  const glasW = (21.0 - GLAS_S) / SWEEP;
  const glas = hinge(pGlas, P(0, yMid(0), GLAS_S), X, 'x');
  add(glas.inner, slab([-glasW, 0, glasW].map(x => ({ le: P(x, yMid(x), GLAS_S), te: P(x, yMid(x), Math.max(GLAS_S + 0.02, TE(x))), t: 0.12 })), UP, CS_PROF).build());

  // ═════ landing gear ═════
  const pNG = part('gearNose'), pMG = part('gearMain');
  // twin-wheel nose leg ahead of the bays, retracting forward
  const NGS = 5.2, NGY = yBot(0, NGS);
  const noseGear = hinge(pNG, P(0, NGY, NGS), X, 'x');
  add(noseGear.inner, merge([cyl(0.08, 0.95, NGY, 0, NGS), cyl(0.11, 0.42, 1.4, 0, NGS), new THREE.BoxGeometry(0.5, 0.08, 0.12).translate(0, 0.42, NOSE_Z - NGS), brace(P(0, 0.95, NGS + 0.03), P(0, 1.8, NGS + 0.35), 0.035)]), undefined, { real: 'strut' });
  for (const x of [-0.24, 0.24]) wheel(noseGear.inner, 0.42, 0.24, x, 0.42, NGS);
  const taxiGlow = K.taxiLight(noseGear.inner, P(0, 1.5, NGS - 0.14));
  const noseDoor: Hinge[] = [];
  for (const k of SIDES) {
    const y = NGY - 0.006, h = hinge(pNG, P(k * 0.36, y, NGS), Z, 'z');
    add(h.inner, slab([4.4, 6.0].map(s => ({ le: P(k * 0.36, y, s), te: P(k * 0.02, y, s), t: 0.03 })), UP, PLATE).build());
    noseDoor.push(h);
  }
  well(pNG, [P(-0.36, NGY - 0.002, 4.4), P(0.36, NGY - 0.002, 4.4), P(0.36, NGY - 0.002, 6.0), P(-0.36, NGY - 0.002, 6.0)], DOWN, 'well');
  // four-wheel main bogies under the inner wings, folding forward
  const MGS = 11.5, MGX = 6.1;
  const mainGear: Record<number, Hinge> = {}, mainDoor: Record<number, Hinge> = {};
  for (const k of SIDES) {
    const x = k * MGX, top = yBot(MGX, MGS);
    mainGear[k] = hinge(pMG, P(x, top, MGS), X, 'x');
    add(mainGear[k].inner, merge([cyl(0.12, 1.2, top, x, MGS), cyl(0.15, 0.85, 1.6, x, MGS), new THREE.BoxGeometry(0.16, 0.16, 1.7).translate(x, 0.85, NOSE_Z - MGS),
      brace(P(x, 1.5, MGS), P(x, top - 0.05, MGS - 0.9), 0.05)]), undefined, { real: 'strut' });
    for (const dx of [-0.36, 0.36]) for (const ds of [-0.72, 0.72]) wheel(mainGear[k].inner, 0.52, 0.32, x + dx, 0.52, MGS + ds);
    const y = top - 0.008;
    mainDoor[k] = hinge(pMG, P(k * (MGX + 0.75), y, MGS), Z, 'z');
    add(mainDoor[k].inner, slab([MGS - 1.6, MGS + 1.4].map(s => ({ le: P(k * (MGX + 0.75), y, s), te: P(k * (MGX - 0.75), y, s), t: 0.03 })), UP, PLATE).build());
    well(pMG, [P(k * (MGX - 0.75), y + 0.004, MGS - 1.6), P(k * (MGX + 0.75), y + 0.004, MGS - 1.6), P(k * (MGX + 0.75), y + 0.004, MGS + 1.4), P(k * (MGX - 0.75), y + 0.004, MGS + 1.4)], DOWN, 'well');
  }

  // ═════ two bomb bays side by side, each with a rotary launcher of eight weapons ═════
  const pBay = part('bayMain');
  const B0 = 7.6, B1 = 12.6, BM = (B0 + B1) / 2;
  const bayDoor: { h: Hinge; sign: number }[] = [];
  const bomb = missileGeo(3.9, 0.21, 0.3, false);
  const launchers: THREE.Group[] = [], bombs: Store[] = [];
  for (const k of SIDES) {
    const xi = k * 0.3, xo = k * 2.3, xc = k * 1.3;
    const by = (x: number, s: number) => yBot(x, s) - 0.008;
    for (const [hx, ex, sign] of [[xi, xc, -k], [xo, xc, k]] as const) {
      const h = hinge(pBay, P(hx, by(hx, BM), BM), Z, 'z');
      add(h.inner, slab([B0, B1].map(s => ({ le: P(hx, by(hx, s), s), te: P(ex, by(ex, s), s), t: 0.03 })), UP, PLATE).build());
      bayDoor.push({ h, sign });
    }
    well(pBay, [P(xi, yBot(xi, B0) - 0.003, B0), P(xo, yBot(xo, B0) - 0.003, B0), P(xo, yBot(xo, B1) - 0.003, B1), P(xi, yBot(xi, B1) - 0.003, B1)], DOWN, 'bay');
    const rot = new THREE.Group(); rot.position.copy(P(xc, 3.45, BM)); pBay.add(rot);
    add(rot, new THREE.CylinderGeometry(0.17, 0.17, 4.1, 10).rotateX(Math.PI / 2), undefined, { real: 'strut' });
    for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2, g = bomb.clone(); g.translate(0.55 * Math.cos(a), 0.55 * Math.sin(a), 0); bombs.push(store('bomb', add(rot, g), 'main')); }
    rot.userData.y0 = rot.position.y; launchers.push(rot);
  }

  // ═════ refuelling receptacle behind the cockpit ═════
  const pRef = part('refuel');
  const R0 = 10.9, R1 = 11.8, ry = (s: number, x = 0) => yTop(x, s) + 0.004;
  const refuelDoor = hinge(pRef, P(0, ry(R1), R1), X, 'x');
  add(refuelDoor.inner, slab([R0, R1].map(s => ({ le: P(-0.2, ry(s, 0.2) + 0.012, s), te: P(0.2, ry(s, 0.2) + 0.012, s), t: 0.02 })), UP, [[0, 1], [0.5, 1.6], [1, 1]]).build());
  well(pRef, [P(-0.2, ry(R0) - 0.001, R0), P(0.2, ry(R0) - 0.001, R0), P(0.2, ry(R1) - 0.001, R1), P(-0.2, ry(R1) - 0.001, R1)], UP);

  // ═════ lights: wingtip formation strips, position lights, beacons ═════
  for (const k of SIDES) { const x = TIP - 0.9; strip(P(k * x, yTop(x, LE(x) + 0.4) + 0.01, LE(x) + 0.3), P(k * x, yTop(x, TEmain(x) - 0.2) + 0.01, TEmain(x) - 0.15), X, UP, 0.04); }
  const navPos = SIDES.map(k => P(k * (TIP - 0.05), yMid(TIP), LE(TIP) + 0.15));
  const { stripGlow, navGlow, beaconGlow } = K.finishLights(navPos, [P(0, yTop(0, 12.8) + 0.05, 12.8), P(0, yBot(0, 14.0) - 0.05, 14.0)]);

  // ═════ Real view only: the light grey seams, the tiled troughs, the star-and-bar ═════
  const decals: THREE.Mesh[] = [];
  const flat = (hex: string, o: THREE.MeshStandardMaterialParameters = {}) => decalMaterial(decalTexture(4, 4, x => { x.fillStyle = hex; x.fillRect(0, 0, 4, 4); }), o);
  // the edge treatments are outlined in light grey: a line behind each leading edge, one ahead of the elevons, and a
  // sawtooth ahead of each intake. Each is a thin ribbon laid on the skin along a polyline of (x, s) points.
  const seamMat = flat('#8b9094', { roughness: 0.55 });
  const seam = (parent: THREE.Object3D, pts: [number, number][], side: number, w = 0.09) => {
    const at = (x: number, s: number) => P(x, side > 0 ? yTop(x, s) + 0.008 : yBot(x, s) - 0.008, s);
    const pos: number[] = [], idx: number[] = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, as] = pts[i], [bx, bs] = pts[i + 1], len = Math.hypot(bx - ax, bs - as), n = Math.max(1, Math.ceil(len / 0.6));
      const nx = -(bs - as) / len * w / 2, ns = (bx - ax) / len * w / 2;
      for (let j = 0; j <= n; j++) {
        const x = lerp(ax, bx, j / n), s = lerp(as, bs, j / n), v = pos.length / 3;
        for (const q of [at(x + nx, s + ns), at(x - nx, s - ns)]) pos.push(q.x, q.y, q.z);
        if (j) idx.push(v - 2, v - 1, v, v - 1, v + 1, v);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, seamMat); m.visible = false; m.raycast = () => {}; parent.add(m); decals.push(m);
  };
  const tipX = TIP - 0.35, hingeLine = (x: number) => TEmain(x) - 0.3;
  for (const k of SIDES) {
    const kx = (pts: [number, number][]) => pts.map(([x, s]) => [k * x, s] as [number, number]);
    for (const side of [1, -1]) {
      seam(pWing, kx([[tipX, LE(tipX) + 1.0], [7.6, LE(7.6) + 1.0], [6.7, LE(7.6) + 1.0 + SWEEP * 0.9]]), side);
      seam(pWing, kx([[tipX, hingeLine(tipX)], [NOTCH_OUT, hingeLine(NOTCH_OUT)], [CS0, hingeLine(CS0)], [7.6, hingeLine(CS0) - SWEEP * 1.2]]), side);
    }
    seam(pAir, kx(Array.from({ length: 7 }, (_, i) => [HUMP_X - 2.1 + i * 0.7, HUMP_S0 - 0.2 - (i % 2 ? 0.55 : 0)] as [number, number])), 1);
  }
  // the aft decks behind the exhausts are lined with lighter, heat-resistant tiles
  const tileMat = flat('#77766f', { roughness: 0.85, metalness: 0.05 });
  for (const { x0, x1 } of troughs) decals.push(layDecal(pNoz, tileMat, (u, v) => { const x = lerp(x0, x1, u + 0.5), s = lerp(TE(x) - 0.06, HUMP_S1 + 0.02, v + 0.5); return P(x, yTop(x, s) + 0.01, s); }, 10));
  // low-visibility star-and-bar on the upper left wing and under the right wing, near the tip
  const insMat = decalMaterial(lowVisStarAndBar('#2c3135'));
  for (const k of SIDES) {
    const wx = 20.6, ws = lerp(LE(wx) + 1.0, hingeLine(wx), 0.5), side = k;
    decals.push(layDecal(pWing, insMat, (u, w) => { const x = wx - k * u * 2.1, s = ws - w * 1.05; return P(k * x, (side > 0 ? yTop(x, s) + 0.006 : yBot(x, s) - 0.006), s); }));
  }

  const apron = buildApron(E, { noseZ: NOSE_Z, length: 21, halfSpan: TIP, noseGearS: NGS });
  const gearLegs = [noseGear.outer, mainGear[1].outer, mainGear[-1].outer];

  function pose(st: JetState, _now: number, wig: (id: string) => number) {
    // elevons: pitch together, roll apart (trailing edge down positive); the drag rudders open for yaw on one side
    // and on both sides as the speed brake; the beaver tail trims pitch and answers gusts
    SIDES.forEach((k, i) => {
      const def = -st.p * 15 + k * st.r * 18 + 18 * k * wig('elevons');
      elev[i].forEach((h, j) => h.set(-(def * (0.8 + 0.1 * j)) * DEG));
      const open = 4 + 35 * st.brakeT + 30 * Math.max(0, -k * st.y) + 24 * wig('rudders');
      rudU[k].set(open * DEG); rudL[k].set(-open * DEG);
    });
    glas.set(-(-st.p * 10 + 12 * st.checkLef + 15 * wig('glas')) * DEG);
    // gear and doors
    const g = ease(st.gearT), gd = ease(st.gearDoorT);
    noseGear.set(-(1 - g) * 95 * DEG);
    for (const k of SIDES) { mainGear[k].set(-(1 - g) * 85 * DEG); mainDoor[k].set(k * 95 * DEG * gd); }
    gearLegs.forEach(o => { o.visible = st.gearT > 0.002; });
    noseDoor.forEach((h, i) => h.set(SIDES[i] * 88 * DEG * gd));
    // bays: the doors swing down, then each rotary launcher lowers and turns to present a weapon
    const bd = ease(clamp01(st.bayMainT / 0.45)), bm = ease(clamp01((st.bayMainT - 0.45) / 0.55));
    bayDoor.forEach(({ h, sign }) => h.set(sign * 100 * DEG * bd));
    launchers.forEach((r, i) => { r.position.y = r.userData.y0 - 0.75 * bm; r.rotation.z = (i ? -1 : 1) * bm * Math.PI / 8; });
    hatch.set(-70 * DEG * ease(st.canopyT));            // negative: the panel aft of the front hinge swings down
    refuelDoor.set(-62 * DEG * ease(st.refuelT));
  }

  return {
    stores: bombs,
    craft, cgY: 3.2, parts, screen, pose, altMax: 4.5, engines: 4, stage: apron.deck,
    // realistic style: the even dark grey of the B-2's coating, faint panels. No plumes: the troughs spread and cool
    // the exhaust so it shows neither flame nor glow.
    real: {
      skin: { light: '#4b5157', dark: '#43494e', camo: 0.25, panel: 4, metalness: 0.15, roughness: 0.6, tone: 0.45, seam: 0.5 },
      focus: P(0, 2.4, 10.5), size: 54, stopZ: NOSE_Z - (NGS - 0.55),
      nozzles: [],
      only: { line: [], real: decals },
    },
    view: { target: P(0, 2.6, 11), dist: 78, min: 4 },
    lights: { ...K.mats, padLightMat: apron.padLightMat, stripGlow, navGlow, beaconGlow, taxiGlow, padGlow: apron.padGlow, shadowMat: apron.shadowMat, taxiPoolMat: apron.taxiPoolMat, cockpitLight },
  };
}
