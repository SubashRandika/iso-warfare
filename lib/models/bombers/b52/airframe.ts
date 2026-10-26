// Boeing B-52H Stratofortress airframe, built from faceted lofts and aerofoil slabs in metres.
// Axes: +y up, +z forward. `s` is the distance aft of the nose tip, so P(x, y, s) puts a point on the aircraft.
// Side k = +1 is the port (left) side at +x, k = −1 the starboard side.
// A long slab-sided fuselage with the stepped cockpit glazing and two chin sensor turrets; a high, 35°-swept wing that
// droops on the ground, eight TF33 turbofans in four paired pods on pylons, external tanks near the tips, a tall fin
// with a narrow rudder and stabilisers with elevators. Bicycle main gear on four two-wheel trucks under the fuselage,
// outrigger wheels near the wingtips. No ailerons: spoilers on top of the wing roll it, and act as air brakes; large
// Fowler flaps slide aft and down, showing the zinc-chromate primer in the coves. A bomb bay with a rotary launcher
// between the gear, and cruise missiles on the inboard pylons.
import * as THREE from 'three';
import type { Engine } from '../../../iso/engine';
import { Geo, loft, slab, merge } from '../../../iso/geo';
import { makeKit, DEG, SIDES, PLATE, ease, clamp01 } from '../../fighters/jet/kit';
import { buildApron } from '../../../stages/apron';
import { store, type Hinge, type JetRig, type JetState, type Store } from '../../fighters/jet/types';
import { decalMaterial, decalTexture, layDecal, lowVisStarAndBar, profileAt } from '../../../real/decals';

const NOSE_Z = 24.25;
const P = (x: number, y: number, s: number) => new THREE.Vector3(x, y, NOSE_Z - s);
const lerp = THREE.MathUtils.lerp;
const X = new THREE.Vector3(1, 0, 0), UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0), Z = new THREE.Vector3(0, 0, 1);
/** piecewise-linear table lookup on the first column */
const tab = (t: number[][], v: number, j: number) => { let i = 0; while (i < t.length - 2 && t[i + 1][0] < v) i++; const a = t[i], b = t[i + 1]; return lerp(a[j], b[j], THREE.MathUtils.clamp((v - a[0]) / (b[0] - a[0]), 0, 1)); };

// ── fuselage: s, centre height, half-width, half-height, squareness (2 round … 3+ slab-sided) ──
// A round nose, the full slab-sided section from the cockpit back, and an upswept tail under the fin.
const FUS = [
  [0.0, 3.30, 0.04, 0.04, 2.0],
  [0.5, 3.28, 0.52, 0.50, 2.1],
  [1.4, 3.30, 0.92, 0.95, 2.3],
  [2.8, 3.38, 1.22, 1.35, 2.6],
  [4.4, 3.45, 1.38, 1.68, 2.8],
  [6.2, 3.42, 1.45, 1.86, 3.0],
  [9.0, 3.40, 1.46, 1.92, 3.2],
  [32.0, 3.40, 1.46, 1.92, 3.2],
  [37.0, 3.60, 1.32, 1.72, 3.0],
  [42.0, 3.92, 1.02, 1.36, 2.8],
  [46.0, 4.18, 0.62, 0.86, 2.5],
  [48.5, 4.30, 0.16, 0.26, 2.0],
];
// loft stations: close together round the nose and the tail, sparse along the parallel section
const STATIONS = [0, 0.5, 1.4, 2.1, 2.8, 3.6, 4.4, 5.3, 6.2, 7.6, 9, 20.5, 32, 34.5, 37, 39.5, 42, 44, 46, 47.3, 48.5];
const fus = (s: number) => ({ cy: tab(FUS, s, 1), hw: tab(FUS, s, 2), hh: tab(FUS, s, 3), e: tab(FUS, s, 4) });
const NF = 24;
/** a point on the fuselage at angle a (0 = port side, π/2 = top), pushed out by `lift` along the surface normal */
const fusPt = (s: number, a: number, lift = 0) => {
  const at = (q: number) => { const { cy, hw, hh, e } = fus(s), c = Math.cos(q), n = Math.sin(q); return new THREE.Vector2(hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / e), cy + hh * Math.sign(n) * Math.pow(Math.abs(n), 2 / e)); };
  const p = at(a), t = at(a + 0.01).sub(at(a - 0.01)), n = new THREE.Vector2(t.y, -t.x).normalize();
  return P(p.x + n.x * lift, p.y + n.y * lift, s);
};
const fusRing = (s: number) => Array.from({ length: NF }, (_, i) => fusPt(s, i / NF * Math.PI * 2));
const topY = (s: number) => fus(s).cy + fus(s).hh;
const bellyY = (s: number) => fus(s).cy - fus(s).hh;

// ── wing: 35° sweep, high on the fuselage, drooping toward the tips as it does on the ground with fuel aboard ──
const WR = 0.9, WT = 28.2;
const wu = (x: number) => (x - WR) / (WT - WR);
const wLE = (x: number) => 15.0 + (x - 1.5) * 0.754;
const wTE = (x: number) => lerp(25.6, 38.1, wu(x));
const wY = (x: number) => 5.12 - 0.06 * (x - WR);
const wT = (x: number) => lerp(1.2, 0.3, wu(x));
// Fowler flaps, inboard and outboard of the inner engine pylon; spoilers on top ahead of them
const FLAPS = [[1.6, 11.4], [12.0, 19.5]], FLAP_END = 19.5, SPOILERS = [[6.0, 11.2], [12.4, 19.0]];
const flapC = (x: number) => lerp(2.4, 1.5, (x - WR) / (FLAP_END - WR));
const hingeS = (x: number) => wTE(x) - flapC(x);
const BOX_PROF: [number, number][] = [[0, 0.25], [0.1, 0.7], [0.35, 1], [1, 0.4]];
const OUT_PROF: [number, number][] = [[0, 0.25], [0.1, 0.7], [0.35, 1], [1, 0.05]];
const CS_PROF: [number, number][] = [[0, 0.4], [1, 0.05]];
const FULL_PROF: [number, number][] = [[0, 0.1], [0.35, 1], [1, 0.05]];
/** upper (side 1) or lower (−1) surface of the wing at |x|, s */
const wingSurf = (x: number, s: number, side: number, lift = 0) => {
  const a = Math.abs(x), inner = a <= FLAP_END, te = inner ? hingeS(a) : wTE(a), c = (s - wLE(a)) / (te - wLE(a));
  return P(x, wY(a) + side * (wT(a) / 2 * profileAt(inner ? BOX_PROF : OUT_PROF, c) + lift), s);
};

// ── engine pods: two TF33s side by side under each pylon, the intakes well ahead of the leading edge ──
const PODS = [8.6, 16.9], POD_DX = 0.78;
const podS0 = (x: number) => wLE(x) - 3.6;
const podY = (x: number) => wY(x) - 1.95;
const NAC = [[0, 0.66], [0.35, 0.74], [1.2, 0.76], [3.4, 0.72], [4.6, 0.6]];
const CORE = [[4.5, 0.42], [5.5, 0.34], [6.0, 0.08]];
const ringAt = (cx: number, cy: number, s: number, r: number, n = 16) => Array.from({ length: n }, (_, i) => { const a = (i + 0.5) / n * Math.PI * 2; return P(cx + r * Math.cos(a), cy + r * Math.sin(a), s); });

// ── fin and rudder; stabilisers and elevators ──
const FIN_Y0 = 5.0, FH = 7.4;
const fLE = (h: number) => 36.0 + h * 0.84;
const fTE = (h: number) => 46.5 - h * 0.07;
const fT = (h: number) => lerp(0.75, 0.22, h / FH);
const RUD = [0.6, 7.1], RUD_C = 1.0;
const SY = 4.35, SR = 0.6, ST = 7.95;
const sLE = (x: number) => 40.6 + (x - SR) * 0.70;
const sTE = (x: number) => lerp(46.6, 47.6, (x - SR) / (ST - SR));
const sT = (x: number) => lerp(0.55, 0.16, (x - SR) / (ST - SR));
const elevC = (x: number) => lerp(1.1, 0.6, (x - SR) / (ST - SR));

export function buildStratofortress(E: Engine): JetRig {
  const { glass } = E.mats;
  const K = makeKit(E, NOSE_Z, 3.4);
  const { craft, parts, part, add, hinge, cyl, wheel, brace, well, missileGeo, strip } = K;

  // ═════ fuselage, with the cockpit glazing and the two chin turrets ═════
  const pAir = part('airframe');
  add(pAir, loft(STATIONS.map(fusRing), { capEnd: true }).build());
  const pCan = part('canopy');
  // windows: windscreen, eyebrows and side windows of the pilots' upper deck, mirrored (angle π/2 is the top)
  const pane = (s0: number, s1: number, a0: number, a1: number) => {
    const g = new Geo(), n = 3;
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
      const sa = lerp(s0, s1, j / 2), sb = lerp(s0, s1, (j + 1) / 2), aa = lerp(a0, a1, i / n), ab = lerp(a0, a1, (i + 1) / n);
      const pts = [fusPt(sa, aa, 0.015), fusPt(sa, ab, 0.015), fusPt(sb, ab, 0.015), fusPt(sb, aa, 0.015)];
      g.sheet(pts, fusPt((sa + sb) / 2, (aa + ab) / 2, 1).sub(fusPt((sa + sb) / 2, (aa + ab) / 2)));
    }
    add(pCan, g.build(), glass, { outline: false, lines: false, real: 'seeker' });
    pCan.add(E.loopLine([fusPt(s0, a0, 0.02), fusPt(s0, a1, 0.02), fusPt(s1, a1, 0.02), fusPt(s1, a0, 0.02)], E.mats.major));
  };
  for (const k of SIDES) {
    const A = (a: number) => k > 0 ? a : Math.PI - a;
    const pn = (s0: number, s1: number, a0: number, a1: number) => pane(s0, s1, Math.min(A(a0), A(a1)), Math.max(A(a0), A(a1)));
    pn(3.35, 4.25, 1.06, 1.3); pn(3.35, 4.25, 1.34, 1.54);         // windscreen
    pn(4.35, 5.0, 1.12, 1.44);                                      // eyebrow
    pn(4.35, 5.3, 0.74, 1.04); pn(5.4, 6.2, 0.66, 0.96);            // side windows
  }
  // the cockpit display sits inside the nose (it lights the readout screen; the crew stations are not modelled)
  const { screen, cockpitLight } = K.cockpitDisplay(pCan, P(0, 4.3, 4.8), new THREE.Vector3(0, 0.6, -0.8), 0.6, 0.22, P(0, 4.5, 5.2));
  // crew entry hatch under the forward fuselage, left of centre: hinged at its front edge, it swings down
  const HS0 = 8.6, HS1 = 9.8, hy = (s: number) => bellyY(s) - 0.006;
  const hatch = hinge(pCan, P(-0.42, hy(HS0), HS0), X, 'x');
  add(hatch.inner, slab([HS0, HS1].map(s => ({ le: P(-0.78, hy(s), s), te: P(-0.06, hy(s), s), t: 0.04 })), UP, PLATE).build());
  add(hatch.inner, merge([0.3, 0.6].map(f => new THREE.BoxGeometry(0.5, 0.03, 0.03).translate(-0.42, hy(lerp(HS0, HS1, f)) + 0.05, NOSE_Z - lerp(HS0, HS1, f)))), undefined, { real: 'strut' });
  well(pCan, [P(-0.78, hy(HS0) + 0.004, HS0), P(-0.06, hy(HS0) + 0.004, HS0), P(-0.06, hy(HS1) + 0.004, HS1), P(-0.78, hy(HS1) + 0.004, HS1)], DOWN, 'well');
  // two electro-optical viewing system turrets under the nose
  const pEvs = part('evs');
  for (const k of SIDES) { const t = new THREE.SphereGeometry(0.3, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), c = P(k * 0.48, bellyY(2.7) + 0.12, 2.7); t.translate(c.x, c.y, c.z); add(pEvs, t); }

  // ═════ wings: the box (to the flap hinge inboard, full chord outboard), flaps, spoilers ═════
  const pWing = part('wings'), pFlap = part('flaps'), pSpo = part('spoilers');
  const flaps: { h: Hinge; p0: THREE.Vector3 }[] = [], spoilers: Record<number, Hinge[]> = { 1: [], [-1]: [] };
  for (const k of SIDES) {
    const at = (x: number, s: number) => P(k * x, wY(x), s);
    const n = new THREE.Vector3(k * 0.06, 1, 0);
    add(pWing, slab([WR, FLAP_END].map(x => ({ le: at(x, wLE(x)), te: at(x, hingeS(x)), t: wT(x) })), n, BOX_PROF).build());
    add(pWing, slab([FLAP_END, WT].map(x => ({ le: at(x, wLE(x)), te: at(x, wTE(x)), t: wT(x) })), n, OUT_PROF).build());
    for (const [x0, x1] of FLAPS) {
      const h = hinge(pFlap, at(x0, hingeS(x0)), at(x1, hingeS(x1)).sub(at(x0, hingeS(x0))), 'x');
      add(h.inner, slab([x0, x1].map(x => ({ le: at(x, hingeS(x)), te: at(x, wTE(x)), t: wT(x) })), n, CS_PROF).build());
      flaps.push({ h, p0: h.outer.position.clone() });
      // the cove: the back of the wing box, yellow primer, seen only once the flap has run aft
      well(pFlap, [x0, x1, x1, x0].map((x, i) => P(k * x, wY(x) + (i < 2 ? -1 : 1) * wT(x) / 2 * 0.38, hingeS(x) + 0.012)), Z.clone().negate(), 'primer');
    }
    for (const [x0, x1] of SPOILERS) {
      const sp = (x: number, d: number) => wingSurf(k * x, hingeS(x) - d, 1, 0.012);
      const h = hinge(pSpo, sp(x0, 1.5), sp(x1, 1.5).sub(sp(x0, 1.5)), 'x');
      add(h.inner, slab([x0, x1].map(x => ({ le: sp(x, 1.5), te: sp(x, 0.25), t: 0.04 })), UP, PLATE).build());
      spoilers[k].push(h);
    }
  }

  // ═════ eight engines in four paired pods ═════
  const pEng = part('engines');
  const nozzles: { parent: THREE.Object3D; at: THREE.Vector3; w: number; h: number }[] = [];
  for (const k of SIDES) for (const px of PODS) {
    const s0 = podS0(px), cy = podY(px);
    for (const dx of [-POD_DX, POD_DX]) {
      const cx = k * px + dx;
      add(pEng, loft(NAC.map(([ds, r]) => ringAt(cx, cy, s0 + ds, r))).build());
      add(pEng, loft(CORE.map(([ds, r]) => ringAt(cx, cy, s0 + ds, r)), { capEnd: true }).build(), undefined, { real: 'metal' });
      add(pEng, loft([ringAt(cx, cy, s0 - 0.02, 0.62), ringAt(cx, cy, s0 + 0.12, 0.69)]).build(), undefined, { real: 'metal' });   // bare intake lip
      well(pEng, ringAt(cx, cy, s0 + 0.3, 0.64), Z, 'intake');
      const sp = new THREE.ConeGeometry(0.22, 0.5, 12).rotateX(Math.PI / 2), spc = P(cx, cy, s0 + 0.12); sp.translate(spc.x, spc.y, spc.z);
      add(pEng, sp, undefined, { real: 'metal' });                                                                                    // spinner
      well(pEng, ringAt(cx, cy, s0 + 4.58, 0.58), Z.clone().negate(), 'intake');                                                      // fan exit
      nozzles.push({ parent: pEng, at: P(cx, cy, s0 + 5.6), w: 0.5, h: 0.5 });
    }
    // pylon: from the top of the pod up and back to the underside of the wing
    const yTop = cy + 0.62, yWing = wY(px) - wT(px) / 2 * 0.6;
    add(pEng, slab([{ le: P(k * px, yTop, s0 + 0.9), te: P(k * px, yTop, s0 + 4.8), t: 0.32 }, { le: P(k * px, yWing, wLE(px) - 0.3), te: P(k * px, yWing, wLE(px) + 3.0), t: 0.32 }], X, FULL_PROF).build());
  }

  // ═════ external tanks near the tips; cruise missiles on the inboard pylons ═════
  const pTank = part('tanks');
  for (const k of SIDES) {
    const tx = 24.2, ty = wY(tx) - wT(tx) / 2 * 0.6 - 0.7, R = [[30.0, 0.05], [30.8, 0.32], [32.0, 0.48], [36.0, 0.48], [37.0, 0.3], [37.6, 0.05]];
    add(pTank, loft(R.map(([s, r]) => ringAt(k * tx, ty, s, r, 14)), { capStart: true, capEnd: true }).build());
    add(pTank, slab([{ le: P(k * tx, ty + 0.4, 32.4), te: P(k * tx, ty + 0.4, 35.4), t: 0.16 }, { le: P(k * tx, wY(tx) - 0.08, 32.6), te: P(k * tx, wY(tx) - 0.08, 35.2), t: 0.16 }], X, FULL_PROF).build());
  }
  const pPyl = part('pylons');
  const cruise = missileGeo(4.3, 0.22, 0.36, true), stores: Store[] = [];
  for (const k of SIDES) {
    const px = 4.6, yW = wY(px) - wT(px) / 2 * 0.65, yB = yW - 0.85;
    add(pPyl, slab([{ le: P(k * px, yB, 16.2), te: P(k * px, yB, 20.6), t: 0.28 }, { le: P(k * px, yW, 16.8), te: P(k * px, yW, 21.0), t: 0.28 }], X, FULL_PROF).build());
    add(pPyl, new THREE.BoxGeometry(1.0, 0.18, 4.6).translate(k * px, yB - 0.08, NOSE_Z - 18.5));                          // stores beam
    for (const [dx, dy] of [[-0.36, -0.42], [0.36, -0.42], [0, -0.92]]) { const g = cruise.clone(); g.translate(k * px + dx, yB + dy, NOSE_Z - 18.4); stores.push(store('cruise', add(pPyl, g), 'none')); }
  }

  // ═════ fin and rudder; stabilisers and elevators ═════
  const pFin = part('fin'), pRud = part('rudder'), pStab = part('stabs'), pElev = part('elevators');
  const finPt = (h: number, s: number) => P(0, FIN_Y0 + h, s);
  const rudS = (h: number) => fTE(h) - RUD_C;
  add(pFin, slab([0, FH].map(h => ({ le: finPt(h, fLE(h)), te: finPt(h, rudS(h)), t: fT(h) })), X, FULL_PROF).build());
  for (const [h0, h1] of [[0, RUD[0]], [RUD[1], FH]]) add(pFin, slab([h0, h1].map(h => ({ le: finPt(h, rudS(h)), te: finPt(h, fTE(h)), t: fT(h) * 0.4 })), X, CS_PROF).build());
  const rudder = hinge(pRud, finPt(RUD[0], rudS(RUD[0])), finPt(RUD[1], rudS(RUD[1])).sub(finPt(RUD[0], rudS(RUD[0]))), 'y');
  add(rudder.inner, slab(RUD.map(h => ({ le: finPt(h, rudS(h)), te: finPt(h, fTE(h)), t: fT(h) * 0.4 })), X, CS_PROF).build());
  const stab: Record<number, Hinge> = {}, elev: Record<number, Hinge> = {};
  for (const k of SIDES) {
    const st = (x: number, s: number) => P(k * x, SY, s), hs = (x: number) => sTE(x) - elevC(x);
    stab[k] = hinge(pStab, st(SR, 44.0), X, 'x');
    add(stab[k].inner, slab([SR, ST].map(x => ({ le: st(x, sLE(x)), te: st(x, hs(x)), t: sT(x) })), UP, [[0, 0.1], [0.35, 1], [1, 0.4]]).build());
    elev[k] = hinge(stab[k].inner, st(1.1, hs(1.1)), st(ST, hs(ST)).sub(st(1.1, hs(1.1))), 'x');
    add(elev[k].inner, slab([1.1, ST].map(x => ({ le: st(x, hs(x)), te: st(x, sTE(x)), t: sT(x) })), UP, CS_PROF).build());
  }

  // ═════ landing gear: four two-wheel trucks under the fuselage, outriggers near the tips ═════
  const pMG = part('gearMain'), pOut = part('outriggers');
  const TRUCKS = [12.6, 28.6], TX = 0.95;
  const trucks: Hinge[] = [], gearDoor: { h: Hinge; k: number }[] = [];
  for (const ts of TRUCKS) {
    const by = bellyY(ts);
    for (const k of SIDES) {
      const x = k * TX, h = hinge(pMG, P(x, by, ts), X, 'x');
      add(h.inner, merge([cyl(0.12, 0.85, by, x, ts), cyl(0.16, 0.56, 1.05, x, ts), new THREE.BoxGeometry(0.95, 0.14, 0.24).translate(x, 0.56, NOSE_Z - ts),
        brace(P(x, 0.9, ts), P(x, by - 0.02, ts + 1.0), 0.05)]), undefined, { real: 'strut' });
      for (const dx of [-0.34, 0.34]) wheel(h.inner, 0.56, 0.32, x + dx, 0.56, ts);
      trucks.push(h);
      const d = hinge(pMG, P(k * 1.42, by - 0.006, ts), Z, 'z');
      add(d.inner, slab([ts - 1.4, ts + 1.4].map(s => ({ le: P(k * 1.42, by - 0.008, s), te: P(k * 0.05, by - 0.008, s), t: 0.03 })), UP, PLATE).build());
      gearDoor.push({ h: d, k });
    }
    well(pMG, [P(-1.42, by + 0.004, ts - 1.4), P(1.42, by + 0.004, ts - 1.4), P(1.42, by + 0.004, ts + 1.4), P(-1.42, by + 0.004, ts + 1.4)], DOWN, 'well');
  }
  const taxiGlow = K.taxiLight(trucks[0].inner, P(TX - 0.3, 1.1, TRUCKS[0] - 0.2));
  const OX = 22.6, OS = 33.2;
  const outrig: Record<number, Hinge> = {};
  for (const k of SIDES) {
    const top = wY(OX) - wT(OX) / 2 * 0.6, x = k * OX;
    outrig[k] = hinge(pOut, P(x, top, OS), Z, 'z');
    add(outrig[k].inner, merge([cyl(0.07, 0.42, top, x, OS), cyl(0.09, 0.42, 1.2, x, OS), new THREE.BoxGeometry(0.42, 0.1, 0.12).translate(x, 0.42, NOSE_Z - OS),
      brace(P(x, 1.4, OS), P(x, top - 0.02, OS + 0.9), 0.04)]), undefined, { real: 'strut' });
    for (const dx of [-0.17, 0.17]) wheel(outrig[k].inner, 0.42, 0.22, x + dx, 0.42, OS);
    well(pOut, [P(x - 0.3, top - 0.004, OS - 0.7), P(x + 0.3, top - 0.004, OS - 0.7), P(x + 0.3, top - 0.004, OS + 0.7), P(x - 0.3, top - 0.004, OS + 0.7)], DOWN, 'well');
  }

  // ═════ bomb bay between the gear, with a rotary launcher of eight weapons ═════
  const pBay = part('bayMain');
  const B0 = 16.4, B1 = 24.9, BM = (B0 + B1) / 2, BW = 1.05;
  const bayDoor: Hinge[] = [];
  for (const k of SIDES) {
    const h = hinge(pBay, P(k * BW, bellyY(BM) - 0.006, BM), Z, 'z');
    add(h.inner, slab([B0, B1].map(s => ({ le: P(k * BW, bellyY(s) - 0.008, s), te: P(k * 0.02, bellyY(s) - 0.008, s), t: 0.03 })), UP, PLATE).build());
    bayDoor.push(h);
  }
  well(pBay, [P(-BW, bellyY(B0) - 0.003, B0), P(BW, bellyY(B0) - 0.003, B0), P(BW, bellyY(B1) - 0.003, B1), P(-BW, bellyY(B1) - 0.003, B1)], DOWN, 'bay');
  const rot = new THREE.Group(); rot.position.copy(P(0, bellyY(BM) + 1.1, BM)); pBay.add(rot);
  add(rot, new THREE.CylinderGeometry(0.22, 0.22, 7.6, 10).rotateX(Math.PI / 2), undefined, { real: 'strut' });
  const alcm = missileGeo(6.3, 0.28, 0.4, false);
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2, g = alcm.clone(); g.translate(0.78 * Math.cos(a), 0.78 * Math.sin(a), 0); stores.push(store('cruise', add(rot, g), 'main')); }
  const rotY0 = rot.position.y;

  // ═════ refuelling receptacle on top, behind the cockpit ═════
  const pRef = part('refuel');
  const R0 = 7.4, R1 = 8.4, ry = (s: number) => topY(s) + 0.004;
  const refuelDoor = hinge(pRef, P(0, ry(R1), R1), X, 'x');
  add(refuelDoor.inner, slab([R0, R1].map(s => ({ le: P(-0.25, ry(s) + 0.012, s), te: P(0.25, ry(s) + 0.012, s), t: 0.02 })), UP, [[0, 1], [0.5, 1.6], [1, 1]]).build());
  well(pRef, [P(-0.25, ry(R0) - 0.001, R0), P(0.25, ry(R0) - 0.001, R0), P(0.25, ry(R1) - 0.001, R1), P(-0.25, ry(R1) - 0.001, R1)], UP);

  // ═════ lights: formation strips on the rear fuselage and wingtips, position lights, beacons ═════
  for (const k of SIDES) {
    const side = (s: number) => fusPt(s, k > 0 ? 0.25 : Math.PI - 0.25, 0);
    strip(side(36.5), side(39.5), UP, new THREE.Vector3(k, 0, 0));
    const tx = WT - 0.4;
    strip(P(k * tx, wY(tx) + wT(tx) * 0.4, wLE(tx) + 0.4), P(k * tx, wY(tx) + wT(tx) * 0.4, wTE(tx) - 0.4), X, UP, 0.05);
  }
  const navPos = SIDES.map(k => P(k * (WT - 0.05), wY(WT), wLE(WT) + 0.2));
  const { stripGlow, navGlow, beaconGlow } = K.finishLights(navPos, [P(0, topY(20.0) + 0.06, 20.0), P(0, bellyY(30.5) - 0.06, 30.5)]);

  // ═════ Real view only: tail code and fin band, low-visibility insignia ═════
  const decals: THREE.Mesh[] = [];
  const INK = '#2f3437';
  const codeTex = decalTexture(512, 512, x => {
    x.fillStyle = INK; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '700 250px "Arial Narrow", Arial, sans-serif'; x.fillText('LA', 256, 200);
    x.font = '700 96px "Arial Narrow", Arial, sans-serif'; x.fillText('60-011', 256, 420);
  });
  const bandMat = decalMaterial(decalTexture(4, 4, x => { x.fillStyle = '#b3242a'; x.fillRect(0, 0, 4, 4); }), { roughness: 0.5 });
  const codeMat = decalMaterial(codeTex), insMat = decalMaterial(lowVisStarAndBar('#3a3f43'));
  const decal = (parent: THREE.Object3D, mat: THREE.Material, place: (u: number, v: number) => THREE.Vector3, n?: number) => { decals.push(layDecal(parent, mat, place, n)); };
  for (const side of [1, -1]) {
    const finSide = (h: number, s: number) => { const c = (s - fLE(h)) / (fTE(h) - fLE(h)); return P(side * (fT(h) / 2 * profileAt(FULL_PROF, Math.min(1, c / ((rudS(h) - fLE(h)) / (fTE(h) - fLE(h))))) + 0.006), FIN_Y0 + h, s); };
    // red band across the top of the fin, the tail code and serial below it (reading toward the tail on the left side)
    decal(pFin, bandMat, (u, v) => { const h = lerp(FH - 0.6, FH - 0.04, v + 0.5); return finSide(h, lerp(fLE(h) + 0.05, rudS(h) - 0.05, u + 0.5)); }, 12);
    decal(pFin, codeMat, (u, v) => { const h = 4.6 + v * 2.2, sc = lerp(fLE(4.6), rudS(4.6), 0.55); return finSide(h, sc + side * u * 2.2); }, 12);
    // star-and-bar on the rear fuselage side
    decal(pAir, insMat, (u, v) => fusPt(31.5 + side * u * 2.4, side > 0 ? 0.12 + v * 0.62 : Math.PI - 0.12 - v * 0.62, 0.008), 10);
  }
  for (const k of SIDES) {   // upper left wing, under the right wing
    const wx = 20.8, ws = lerp(wLE(wx), wTE(wx), 0.45);
    decal(pWing, insMat, (u, w) => wingSurf(k * (wx - k * u * 2.6), ws - w * 1.3, k, 0.008));
  }

  const apron = buildApron(E, { noseZ: NOSE_Z, length: 48.5, halfSpan: WT, noseGearS: TRUCKS[0] });
  const gearLegs = [...trucks.map(t => t.outer), outrig[1].outer, outrig[-1].outer];
  const AFT = new THREE.Vector3(0, -0.12, -1).normalize();

  function pose(st: JetState, _now: number, wig: (id: string) => number) {
    const ground = st.gearT * (1 - clamp01(st.alt / 2));
    // Fowler flaps: out for take-off and landing (on the ground with the engines running), for the check, on a click
    const f = clamp01(ground * clamp01(st.rpm / 0.5) + 0.7 * Math.abs(st.checkLef) + 0.9 * Math.abs(wig('flaps')));
    flaps.forEach(({ h, p0 }) => { h.outer.position.copy(p0).addScaledVector(AFT, 1.3 * ease(f)); h.set(-30 * DEG * ease(f)); });
    // spoilers: up on the side the jet rolls toward, on both sides as air brakes
    for (const k of SIDES) {
      const up = Math.max(0, -k * st.r) * 40 + 50 * st.brakeT + 35 * Math.abs(wig('spoilers'));
      spoilers[k].forEach(h => h.set(Math.min(60, up) * DEG));
      // elevators: trailing edge up for nose up; the stabiliser trims a little the same way
      elev[k].set((st.p * 20 + 18 * wig('elevators')) * DEG);
      stab[k].set((st.p * 3 + 4 * wig('stabs')) * DEG);
    }
    rudder.set((st.y * 20 + 22 * wig('rudder')) * DEG);
    // gear: the trucks fold forward into the fuselage, the outriggers fold inboard into the wing
    const g = ease(st.gearT), gd = ease(st.gearDoorT);
    trucks.forEach(t => t.set(-(1 - g) * 90 * DEG));
    gearDoor.forEach(({ h, k }) => h.set(k * 95 * DEG * gd));
    for (const k of SIDES) outrig[k].set(-k * (1 - g) * 90 * DEG);
    gearLegs.forEach(o => { o.visible = st.gearT > 0.002; });
    // bomb bay: the doors swing open, then the launcher lowers and turns to present a weapon
    const bd = ease(clamp01(st.bayMainT / 0.45)), bm = ease(clamp01((st.bayMainT - 0.45) / 0.55));
    bayDoor.forEach((h, i) => h.set(SIDES[i] * 100 * DEG * bd));
    rot.position.y = rotY0 - 0.95 * bm; rot.rotation.z = bm * Math.PI / 8;
    hatch.set(-70 * DEG * ease(st.canopyT));
    refuelDoor.set(-62 * DEG * ease(st.refuelT));
  }

  return {
    stores,
    craft, cgY: 3.4, parts, screen, pose, altMax: 6, engines: 8, stage: apron.deck,
    // realistic style: overall gunship grey, faint panels; dry exhaust from the eight engines
    real: {
      skin: { light: '#7b8186', dark: '#70767b', camo: 0.2, panel: 3.0, metalness: 0.25, roughness: 0.55, tone: 0.7, seam: 0.8 },
      focus: P(0, 3.5, 24), size: 60, stopZ: NOSE_Z - (TRUCKS[0] - 0.55),
      nozzles, only: { line: [], real: decals },
    },
    view: { target: P(0, 4.0, 24), dist: 92, min: 5 },
    lights: { ...K.mats, padLightMat: apron.padLightMat, stripGlow, navGlow, beaconGlow, taxiGlow, padGlow: apron.padGlow, shadowMat: apron.shadowMat, taxiPoolMat: apron.taxiPoolMat, cockpitLight },
  };
}
