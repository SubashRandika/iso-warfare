// HK416 assault rifle (the 11-inch HK416 F-C): a working magazine, bolt carrier seen through the ejection port, a
// spring-loaded port cover that pops open when the bolt moves, the rear T charging handle, bolt catch with hold-open,
// ambidextrous 90° selector (safe, semi, auto), a telescoping stock, flip-up iron sights, a holographic sight with a
// flip-to-side 3× magnifier, a rail-mounted aiming laser and a screw-on suppressor.
// Coordinates in metres: +z toward the muzzle, +y up, +x to the rifle's left; the bore axis is y = 0 and z = 0 is the
// back of the receivers (where the buffer tube starts). Like every small arm it floats raised above its mat.
// The side profiles are traced from a left-side photograph (1300 × 949) whose scale comes from the Picatinny rail:
// its slots repeat every 17.05 px and are 10.01 mm apart by standard, so 0.587 mm per pixel both ways (the grip comes
// out 105 mm, the whole rifle 0.73 m with the stock nearly closed, as for an 11-inch HK416). Profiles are written in that
// photo's pixels (ix, iy) and converted by `px`. The attachments (sight, magnifier, laser, suppressor) follow a
// three-quarter render of the rifle. Accent (live) parts: the sight's reticle, the laser's emitter, the flash.
// Real view: hard-anodised aluminium, polymer furniture with stippled grip panels, a ribbed rubber butt pad, a black
// steel magazine, a bare steel flash hider, coated optics glass; brass 5.56 mm cases.
// Range (key G, Real view): shouldered on lane 3 of the indoor range (lib/range/), aimed over the holographic sight
// (its ring and dot drawn on the optic's axis), through the magnifier (3×), or on the irons; the laser's dot lands on
// whatever it points at; automatic fire while the trigger is held.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { ModelFactory } from '../../../core/types';
import { approach, clamp01, DEG, ease, phase, SIDES } from '../../../core/anim';
import { merge } from '../../../iso/geo';
import { makeKit } from '../../../kit/build';
import { buildPlate } from '../../../stages/plate';
import { makePlume } from '../../../real/plume';
import { decalMaterial, decalTexture } from '../../../real/decals';
import type { RealSpec } from '../../../real/types';
import type { OpticSight, RangeGun } from '../../../range/types';
import type { Range } from '../../../range/range';

const CAP = 30;
const GY = 0.3;                                             // bore axis above the mat
const MAT = { w: 0.5, d: 1.24, cx: 0, cz: 0.18 };           // the bench mat under the rifle (both styles)
const BACK = 0.082, LOCK = 0.062;                           // bolt carrier travel, and where it locks back on empty
const MAG_DROP = GY - 0.2;                                  // until the magazine meets the mat
const STOCK_RUN = 0.07;                                     // the stock's travel along the buffer tube
const AX = 0.0745;                                          // the sights' axis above the bore (a co-witness height)
type Mode = 'safe' | 'semi' | 'auto';
const MODES: Mode[] = ['safe', 'semi', 'auto'];

// ── the photograph's pixels → rifle metres ──
const PX = 0.587e-3, IX0 = 880, IY0 = 268;                  // scale; the back of the receivers and the bore axis
const zx = (ix: number) => (IX0 - ix) * PX, yy = (iy: number) => (IY0 - iy) * PX;
type Cmd = ['M', number, number] | ['L', number, number] | ['Q', number, number, number, number];
const px = (cmds: Cmd[]): Cmd[] => cmds.map(c => c[0] === 'Q' ? ['Q', zx(c[1]), yy(c[2]), zx(c[3]), yy(c[4])] : [c[0], zx(c[1]), yy(c[2])]);
const trace = (p: THREE.Path, cmds: Cmd[]) => cmds.forEach(c => c[0] === 'M' ? p.moveTo(c[1], c[2]) : c[0] === 'L' ? p.lineTo(c[1], c[2]) : p.quadraticCurveTo(c[1], c[2], c[3], c[4]));
/** a side profile in (z, y), from photo pixels, with optional holes (pixel paths) */
const profile = (cmds: Cmd[], holes: Cmd[][] = []) => {
  const s = new THREE.Shape(); trace(s, px(cmds));
  holes.forEach(h => { const p = new THREE.Path(); trace(p, px(h)); s.holes.push(p); });
  return s;
};
/** a profile in metres (relative shapes such as the selector lever) */
const shape = (cmds: Cmd[]) => { const s = new THREE.Shape(); trace(s, cmds); return s; };
/** extrude a (z, y) profile across x0..x1 with every edge rounded by `bevel` in `segs` steps; the outline stays put */
const across = (s: THREE.Shape, x0: number, x1: number, bevel = 0.001, segs = 1) => {
  const g = new THREE.ExtrudeGeometry(s, { depth: x1 - x0 - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: segs, curveSegments: 10 });
  g.rotateY(-Math.PI / 2); g.translate(x1 - bevel, 0, 0);
  return g;
};
/** extrude an (x, y) cross-section along z from z0 to z1 */
const along = (s: THREE.Shape, z0: number, z1: number, bevel = 0, segs = 1) => {
  const g = new THREE.ExtrudeGeometry(s, { depth: z1 - z0 - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: segs, curveSegments: 12 });
  g.translate(0, 0, z0 + bevel); return g;
};
/** a ring of (radius, z) points turned about the z axis at (x, y) */
const turn = (pts: [number, number][], segs: number, x = 0, y = 0) => {
  const g = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), segs);
  g.rotateX(Math.PI / 2); g.translate(x, y, 0); return g;
};
const cylZ = (r: number, z0: number, z1: number, segs = 16, x = 0, y = 0) => { const g = new THREE.CylinderGeometry(r, r, z1 - z0, segs); g.rotateX(Math.PI / 2); g.translate(x, y, (z0 + z1) / 2); return g; };
const cylX = (r: number, x0: number, x1: number, y: number, z: number, segs = 16) => { const g = new THREE.CylinderGeometry(r, r, Math.abs(x1 - x0), segs); g.rotateZ(Math.PI / 2); g.translate((x0 + x1) / 2, y, z); return g; };
const rbox = (w: number, h: number, d: number, x: number, y: number, z: number, r = Math.min(w, h, d) * 0.3) => new RoundedBoxGeometry(w, h, d, 2, r).translate(x, y, z);
const holeXY = (x: number, y: number, r: number) => { const p = new THREE.Path(); p.absarc(x, y, r, 0, Math.PI * 2, true); return p; };

// ── side profiles, in the photo's pixels ──
const UPPER: Cmd[] = [['M', 548, 216], ['L', 855, 216], ['Q', 878, 218, 878, 240], ['L', 878, 293], ['L', 548, 293]];
const PORT: Cmd[] = [['M', 650, 247], ['L', 754, 247], ['L', 754, 278], ['L', 650, 278]];
const MAGWELL: Cmd[] = [['M', 562, 293], ['L', 697, 293], ['L', 697, 400], ['L', 690, 403], ['L', 578, 383], ['Q', 571, 381, 571, 374], ['L', 566, 300]];
const LIP: Cmd[] = [['M', 574, 368], ['L', 697, 388], ['L', 697, 401], ['L', 690, 403], ['L', 578, 383], ['Q', 572, 382, 572, 376]];
const LOWER: Cmd[] = [['M', 695, 293], ['L', 878, 293], ['L', 878, 322], ['Q', 872, 340, 852, 345], ['L', 800, 352], ['L', 695, 356]];
/** the trigger guard: a loop from the magazine well's back, under the trigger and up the grip's front into the receiver */
const GUARD: Cmd[] = [['M', 697, 392], ['Q', 706, 414, 736, 414], ['L', 772, 414], ['Q', 795, 413, 806, 396], ['L', 812, 352], ['L', 802, 352], ['L', 797, 388], ['Q', 789, 405, 770, 406], ['L', 738, 406], ['Q', 712, 406, 704, 392]];
const TRIGGER: Cmd[] = [['M', 751, 354], ['L', 760, 354], ['Q', 754, 374, 762, 392], ['Q', 762, 398, 757, 396], ['Q', 747, 378, 751, 354]];
/** the grip, raked about 12°, fuller at the base */
const GRIP: Cmd[] = [['M', 800, 345], ['L', 866, 330], ['Q', 880, 325, 886, 336], ['Q', 898, 380, 908, 430], ['Q', 918, 480, 925, 512], ['Q', 927, 524, 918, 526], ['L', 842, 529], ['Q', 832, 530, 831, 520], ['Q', 826, 470, 818, 420], ['Q', 810, 380, 800, 345]];
const GRIP_PANEL: Cmd[] = [['M', 832, 410], ['Q', 848, 400, 880, 398], ['Q', 895, 430, 905, 485], ['Q', 890, 500, 850, 505], ['Q', 840, 460, 832, 410]];
/** the steel magazine, a slight forward curve; its top rides up inside the well */
const MAG: Cmd[] = [['M', 592, 300], ['L', 690, 300], ['L', 694, 398], ['Q', 684, 470, 668, 505], ['Q', 652, 550, 639, 600], ['L', 546, 556], ['Q', 566, 505, 578, 470], ['Q', 594, 425, 600, 380]];
const FLOOR: Cmd[] = [['M', 542, 553], ['L', 549, 548], ['L', 643, 595], ['L', 637, 605]];
const CATCH: Cmd[] = [['M', 688, 268], ['L', 714, 272], ['Q', 718, 276, 716, 282], ['L', 712, 306], ['Q', 708, 312, 702, 308], ['L', 690, 290], ['Q', 684, 280, 688, 268]];
/** the stock, drawn closed (as photographed); it slides back on the buffer tube */
const STOCK: Cmd[] = [['M', 940, 232], ['L', 1222, 224], ['Q', 1232, 224, 1236, 230], ['L', 1256, 233], ['L', 1260, 430], ['Q', 1259, 441, 1248, 444], ['L', 1205, 444], ['L', 1080, 352], ['L', 1000, 344], ['Q', 960, 338, 942, 306]];
const BUTTPAD: Cmd[] = [['M', 1236, 226], ['L', 1262, 232], ['Q', 1268, 234, 1268, 240], ['L', 1268, 428], ['Q', 1268, 442, 1256, 446], ['L', 1236, 446]];
/** selector lever, in metres about its pivot (pointing forward = safe) */
const SELECTOR: Cmd[] = [['M', -0.004, -0.004], ['L', 0.012, -0.0026], ['Q', 0.0175, 0, 0.012, 0.0026], ['L', -0.004, 0.004], ['Q', -0.0065, 0, -0.004, -0.004]];
const MAG_C = new THREE.Vector3(0, -0.1, zx(620));

/** finishes for the Real view, by tag; untagged meshes get the anodised aluminium */
function realMaterials() {
  const tex: THREE.Texture[] = [];
  const canvasTex = (n: number, draw: (x: CanvasRenderingContext2D, n: number) => void, rep: number) => {
    const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d')!, n);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.setScalar(rep); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
    tex.push(t); return t;
  };
  const grain = canvasTex(128, (x, n) => { const img = x.createImageData(n, n); for (let i = 0; i < img.data.length; i += 4) { const v = 116 + Math.random() * 24; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; } x.putImageData(img, 0, 0); }, 160);
  const stip = canvasTex(128, (x, n) => {
    x.fillStyle = '#808080'; x.fillRect(0, 0, n, n);
    for (let i = 0; i < 1100; i++) {
      const v = Math.random() < 0.55 ? 215 : 40, px0 = Math.random() * n, py0 = Math.random() * n, r = 1 + Math.random() * 1.6;
      x.fillStyle = `rgb(${v},${v},${v})`;
      for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) { x.beginPath(); x.arc(px0 + ox, py0 + oy, r, 0, Math.PI * 2); x.fill(); }
    }
  }, 34);
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  const M = {
    anod: new THREE.MeshPhysicalMaterial({ color: 0x26272a, metalness: 0.25, roughness: 0.64, bumpMap: grain, bumpScale: 0.1, clearcoat: 0.1, clearcoatRoughness: 0.6 }),
    poly: std({ color: 0x1f2022, roughness: 0.78, bumpMap: grain, bumpScale: 0.25 }),
    stipple: std({ color: 0x1c1d1f, roughness: 0.95, bumpMap: stip, bumpScale: 0.9, side: THREE.DoubleSide }),
    rubber: std({ color: 0x18191a, roughness: 0.95, bumpMap: stip, bumpScale: 0.4 }),
    magSteel: std({ color: 0x1c1d1f, metalness: 0.45, roughness: 0.5, bumpMap: grain, bumpScale: 0.1 }),
    phosphate: std({ color: 0x2b2c2e, metalness: 0.55, roughness: 0.55 }),
    bare: std({ color: 0x8a8e92, metalness: 0.9, roughness: 0.42 }),
    carrier: std({ color: 0x313235, metalness: 0.75, roughness: 0.38 }),
    bolt: std({ color: 0x8c9094, metalness: 1, roughness: 0.32 }),
    supp: std({ color: 0x212224, metalness: 0.3, roughness: 0.62, bumpMap: grain, bumpScale: 0.15 }),
    sight: std({ color: 0x18191a, metalness: 0.3, roughness: 0.7 }),
    optic: new THREE.MeshPhysicalMaterial({ color: 0x1f2022, metalness: 0.35, roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.5 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x06090c, metalness: 0.15, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.55, iridescenceIOR: 1.5, iridescenceThicknessRange: [360, 560] }),
    window: new THREE.MeshPhysicalMaterial({ color: 0xaecbd2, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.16, depthWrite: false, clearcoat: 1, iridescence: 0.5, side: THREE.DoubleSide }),
    steel: std({ color: 0xb4b8bb, metalness: 1, roughness: 0.3 }),
    brass: std({ color: 0xc9a04c, metalness: 1, roughness: 0.26, side: THREE.DoubleSide }),
    copper: std({ color: 0xb86a40, metalness: 1, roughness: 0.3 }),
    dark: std({ color: 0x0e0e0f, roughness: 0.9, side: THREE.DoubleSide }),
  };
  return { M, tex };
}

const model: ModelFactory = ({ E, snd, script, say, style, def, open, arrive }) => {
  const K = makeKit(E, { unit: 0.05 });
  const { add, part, hinge, box, well, lines } = K;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const gun = K.root; gun.position.y = GY;
  const bench = buildPlate(E, { ...MAT, grid: 0.01, ruler: true, shadow: [0.22, 1.1, 0, 0.18] });
  const { M: RM, tex: RTex } = realMaterials();
  const realOnly: THREE.Object3D[] = [], decalMats: THREE.Material[] = [];
  const realAdd = (parent: THREE.Object3D, geo: THREE.BufferGeometry, tag: string) => {
    const m = add(parent, geo, undefined, { real: tag, lines: false }); m.visible = false; realOnly.push(m); return m;
  };
  const UX = 0.0118, LX = 0.0112;                           // half-widths: upper, lower
  const RAIL_TOP = yy(206), RAIL_BASE = yy(214);            // the top rail's teeth and its base

  // ═════ lower receiver: magazine well with its flared lip, trigger housing, guard ═════
  const pLower = part('lower', gun);
  add(pLower, across(profile(MAGWELL), -0.0135, 0.0135, 0.0014, 3));
  add(pLower, across(profile(LIP), -0.0158, 0.0158, 0.0016, 3));
  add(pLower, across(profile(LOWER), -LX, LX, 0.0012, 3));
  add(pLower, across(profile(GUARD), -0.006, 0.006, 0.0012, 2));
  well(pLower, [V(-0.0125, yy(386), zx(576)), V(0.0125, yy(386), zx(576)), V(0.0125, yy(402), zx(692)), V(-0.0125, yy(402), zx(692))], V(0, -1, 0.15));   // the well's mouth
  for (const [ix, iy] of [[568, 300], [852, 302]] as const) add(pLower, cylX(0.003, -0.0137, 0.0137, yy(iy), zx(ix), 12), undefined, { real: 'steel' });   // pivot and takedown pins
  for (const z of [zx(745), zx(770)]) add(pLower, cylX(0.0022, -LX - 0.0003, LX + 0.0003, yy(330), z, 10), undefined, { real: 'steel' });   // hammer and trigger pins

  // ═════ pistol grip ═════
  const pGrip = part('grip', gun);
  add(pGrip, across(profile(GRIP), -0.014, 0.014, 0.0035, 4), undefined, { real: 'poly' });
  const gp = profile(GRIP_PANEL);
  for (const k of SIDES) {
    pGrip.add(E.loopLine(gp.getPoints(4).map(p => V(k * 0.0141, p.y, p.x)), E.mats.line));
    realAdd(pGrip, new THREE.ShapeGeometry(gp, 4).rotateY(-Math.PI / 2).translate(k * 0.01415, 0, 0), 'stipple');
  }

  // ═════ trigger, selector (both sides), bolt catch (left), magazine release (right) ═════
  const pTrig = part('trigger', gun);
  const trig = hinge(pTrig, V(0, yy(354), zx(756)), V(1, 0, 0), 'x');
  add(trig.inner, across(profile(TRIGGER), -0.003, 0.003, 0.0006, 3), undefined, { real: 'phosphate' });
  const pSel = part('selector', gun), selH: ReturnType<typeof hinge>[] = [];
  const SEL = V(0, yy(322), zx(806));
  for (const k of SIDES) {
    const h = hinge(pSel, SEL, V(1, 0, 0), 'x'); selH.push(h);
    const t = k > 0 ? 0.0024 : 0.0018, s = k > 0 ? 1 : 0.75;
    const g = across(shape(SELECTOR.map(c => c[0] === 'Q' ? ['Q', c[1] * s, c[2], c[3] * s, c[4]] : [c[0], c[1] * s, c[2]]) as Cmd[]), k > 0 ? LX : -LX - t, k > 0 ? LX + t : -LX, 0.0005, 2);
    g.translate(0, SEL.y, SEL.z); add(h.inner, g, undefined, { real: 'phosphate' });
    add(h.inner, cylX(0.0045, k * LX, k * (LX + 0.0012), SEL.y, SEL.z, 16), undefined, { real: 'phosphate' });
  }
  const pCatch = part('boltCatch', gun), catchG = new THREE.Group(); pCatch.add(catchG);
  add(pLower, box(LX - 0.0002, UX + 0.0001, yy(314), yy(292), zx(722), zx(688)));                       // the boss it pivots in
  add(catchG, across(profile(CATCH), UX + 0.0001, UX + 0.0017, 0.0004, 1), undefined, { real: 'phosphate' });
  const rel = new THREE.Group(); rel.userData.part = 'magazine'; gun.add(rel);
  add(rel, cylX(0.0042, -0.0135, -0.0168, yy(315), zx(702), 12), undefined, { real: 'phosphate' });
  add(pLower, cylX(0.0062, -0.0135, -0.015, yy(315), zx(702), 16));                                   // the fence round it

  // ═════ upper receiver: two halves, the ejection port cut through the right one only, the carrier inside it ═════
  const pUpper = part('upper', gun);
  add(pUpper, across(profile(UPPER), 0, UX, 0.0014, 3));                                                 // left half, whole
  add(pUpper, across(profile(UPPER, [PORT]), -UX, 0, 0.0014, 3));                                        // right half, the port through it
  well(pUpper, [V(-0.0002, yy(278.5), zx(754)), V(-0.0002, yy(278.5), zx(650)), V(-0.0002, yy(246.5), zx(650)), V(-0.0002, yy(246.5), zx(754))], V(-1, 0, 0));
  for (const [iy, f] of [[278, 1], [247, -1]] as const) well(pUpper, [V(-UX + 0.0003, yy(iy), zx(754)), V(-UX + 0.0003, yy(iy), zx(650)), V(-0.0003, yy(iy), zx(650)), V(-0.0003, yy(iy), zx(754))], V(0, f, 0));
  add(pUpper, rbox(0.004, 0.017, 0.012, -UX - 0.0015, yy(254), zx(764), 0.0015));                      // brass deflector behind the port
  const carrier = new THREE.Group(); pUpper.add(carrier);
  add(carrier, merge([box(-0.0096, 0.0092, yy(279) + 0.0012, yy(247) - 0.0012, 0.01, zx(650) + 0.004), box(-0.0101, -0.0096, yy(262), yy(252), 0.03, zx(655))]), undefined, { real: 'carrier', minLen: 0.004 });
  add(carrier, cylZ(0.0075, zx(650) + 0.004, zx(640), 14, 0, 0), undefined, { real: 'bolt' });          // bolt head
  add(carrier, cylX(0.0026, -0.0102, -0.0086, yy(258), zx(690), 10), undefined, { real: 'steel' });    // cam pin
  // ejection port cover: hinged along the port's bottom edge, shut until the bolt first moves
  const pCover = part('portCover', gun);
  const cover = hinge(pCover, V(-UX - 0.0004, yy(279), 0), V(0, 0, 1), 'z');
  add(cover.inner, box(-UX - 0.0012, -UX - 0.0004, yy(279), yy(246.5), zx(755), zx(649)), undefined, { real: 'phosphate' });
  for (let i = 0; i < 4; i++) realAdd(cover.inner, new THREE.BoxGeometry(0.0006, 0.0034, 0.0012).translate(-UX - 0.0015, yy(262), zx(700) + (i - 1.5) * 0.004), 'phosphate');   // its grip ribs
  // the T charging handle at the back of the upper, under the rail
  const pCharge = part('charging', gun), chargeG = new THREE.Group(); pCharge.add(chargeG);
  add(chargeG, merge([box(-0.0038, 0.0038, yy(227), yy(217), -0.012, 0.012), box(-0.0205, 0.0205, yy(228), yy(218), -0.016, -0.006)]), undefined, { real: 'phosphate' });
  add(chargeG, merge(SIDES.map(k => rbox(0.007, 0.012, 0.009, k * 0.019, yy(223), -0.011, 0.0025))), undefined, { real: 'phosphate' });   // latch wings

  // ═════ the top rail along upper and handguard: a dovetail base with teeth every 10 mm ═════
  const railBase = (() => {
    const s = new THREE.Shape([[-0.0094, yy(216)], [0.0094, yy(216)], [0.0106, RAIL_BASE - 0.0012], [0.0106, RAIL_BASE + 0.0006], [0.0094, RAIL_BASE + 0.0018], [-0.0094, RAIL_BASE + 0.0018], [-0.0106, RAIL_BASE + 0.0006], [-0.0106, RAIL_BASE - 0.0012]].map(([a, b]) => new THREE.Vector2(a, b)));
    return along(s, 0.004, zx(140));
  })();
  const pUpRail = part('upper', gun); add(pUpRail, railBase);
  const teeth = (z0: number, z1: number, at: (z: number) => THREE.BufferGeometry) => { const g: THREE.BufferGeometry[] = []; for (let z = z0; z < z1; z += 0.01001) g.push(at(z)); return merge(g); };
  add(pUpRail, teeth(0.008, zx(144), z => new THREE.BoxGeometry(0.0188, RAIL_TOP - RAIL_BASE - 0.0018, 0.0052).translate(0, (RAIL_TOP + RAIL_BASE + 0.0018) / 2, z)), undefined, { minLen: 0.002 });

  // ═════ handguard: an octagonal quad rail, rails on the sides and below, vent slots, slot numbers ═════
  const pHand = part('handguard', gun);
  const HZ0 = zx(548), HZ1 = zx(140), HYC = (yy(214) + yy(312)) / 2, HH = (yy(214) - yy(312)) / 2, HW = 0.024, HC = 0.009;
  {
    const s = new THREE.Shape([[-HW + HC, HYC + HH], [HW - HC, HYC + HH], [HW, HYC + HH - HC], [HW, HYC - HH + HC], [HW - HC, HYC - HH], [-HW + HC, HYC - HH], [-HW, HYC - HH + HC], [-HW, HYC + HH - HC]].map(([a, b]) => new THREE.Vector2(a, b)));
    s.holes.push(holeXY(0, HYC - 0.004, 0.0105));                                                     // the barrel's bore through it
    add(pHand, along(s, HZ0, HZ1, 0.0015, 2));
    const sideY0 = yy(292), sideY1 = yy(250), botY = HYC - HH;
    for (const k of SIDES) {                                                                         // side rails
      add(pHand, box(k > 0 ? HW : -HW - 0.003, k > 0 ? HW + 0.003 : -HW, sideY0, sideY1, HZ0 + 0.01, HZ1 - 0.004));
      add(pHand, teeth(HZ0 + 0.014, HZ1 - 0.008, z => new THREE.BoxGeometry(0.0026, sideY1 - sideY0 - 0.003, 0.0052).translate(k * (HW + 0.0043), (sideY0 + sideY1) / 2, z)), undefined, { minLen: 0.002 });
      for (const [a, b] of [[182, 244], [274, 328], [356, 412], [440, 470]] as const) for (const yv of [yy(246.5), yy(300)]) {   // vent slots above and below the side rail
        well(pHand, [V(k * (HW + 0.0002), yv - 0.0016, zx(b)), V(k * (HW + 0.0002), yv - 0.0016, zx(a)), V(k * (HW + 0.0002), yv + 0.0016, zx(a)), V(k * (HW + 0.0002), yv + 0.0016, zx(b))], V(k, 0, 0));
      }
    }
    add(pHand, box(-0.0094, 0.0094, botY - 0.0018, botY, HZ0 + 0.01, HZ1 - 0.004));                  // bottom rail
    add(pHand, teeth(HZ0 + 0.014, HZ1 - 0.008, z => new THREE.BoxGeometry(0.0188, 0.0026, 0.0052).translate(0, botY - 0.0031, z)), undefined, { minLen: 0.002 });
    add(pHand, cylX(0.0028, -HW - 0.0005, HW + 0.0005, yy(300), zx(512), 10), undefined, { real: 'steel' });   // the handguard's cross bolt
  }

  // ═════ barrel, gas block, flash hider ═════
  const pBarrel = part('barrel', gun);
  add(pBarrel, cylZ(0.0072, 0.17, zx(112), 18), undefined, { real: 'phosphate' });
  add(pBarrel, cylZ(0.0098, zx(112), zx(78), 18), undefined, { real: 'bare' });                       // the flash hider's collar
  add(pBarrel, turn([[0.0098, zx(78)], [0.0099, zx(78) + 0.001], [0.0099, zx(18)], [0.0092, zx(16)], [0.0055, zx(16)]], 18), undefined, { real: 'bare' });
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, c = Math.cos(a) * 0.0101, sn = Math.sin(a) * 0.0101; well(pBarrel, [V(c, sn, zx(70)), V(c, sn, zx(22)), V(c * 1.0001, sn * 1.0001 + 0.0001, zx(22)), V(c, sn + 0.0001, zx(70))], V(Math.cos(a), Math.sin(a), 0)); lines(pBarrel, [[V(c, sn, zx(70)), V(c, sn, zx(22))]]); }
  const bore = new THREE.Mesh(new THREE.CircleGeometry(0.0045, 16), E.mats.recess); bore.position.set(0, 0, zx(16) + 0.0002); bore.raycast = () => {}; pBarrel.add(bore);

  // ═════ flip-up iron sights: hooded front post on the handguard rail, rear aperture on the receiver ═════
  const pSights = part('sights', gun);
  add(pSights, box(-0.011, 0.011, RAIL_TOP, yy(187), zx(224), zx(163)), undefined, { real: 'sight' });
  add(pSights, box(-0.011, 0.011, RAIL_TOP, yy(205), zx(818), zx(778)), undefined, { real: 'sight' });
  const frontLeaf = hinge(pSights, V(0, yy(187), zx(191)), V(1, 0, 0), 'x');
  { const s = new THREE.Shape(); s.moveTo(-0.0045, yy(187)); s.lineTo(0.0045, yy(187)); s.lineTo(0.0045, AX + 0.002); s.absarc(0, AX + 0.002, 0.0045, 0, Math.PI, false); s.closePath();
    s.holes.push(holeXY(0, AX + 0.0018, 0.003));
    add(frontLeaf.inner, merge([along(s, zx(191) - 0.0015, zx(191) + 0.0015), new THREE.BoxGeometry(0.0013, AX - yy(187) - 0.004, 0.0013).translate(0, (yy(187) + 0.004 + AX) / 2 - 0.0005, zx(191))]), undefined, { real: 'sight' }); }
  const rearLeaf = hinge(pSights, V(0, yy(205), zx(805)), V(1, 0, 0), 'x');
  { // a ring round the large (5.6 mm) aperture on a slim stem, between two thin protective ears: through it the eye sees
    // the front post framed by a ring, not a plate with a pinhole
    const ring = new THREE.Shape(); ring.absarc(0, AX, 0.0058, 0, Math.PI * 2, false); ring.holes.push(holeXY(0, AX, 0.0028));
    const stem = new THREE.Shape([[-0.0028, yy(205)], [0.0028, yy(205)], [0.0028, AX - 0.0052], [-0.0028, AX - 0.0052]].map(([a, b]) => new THREE.Vector2(a, b)));
    const z0 = zx(805) - 0.0016, z1 = zx(805) + 0.0016;
    add(rearLeaf.inner, merge([along(ring, z0, z1), along(stem, z0, z1), ...SIDES.map(k => new THREE.BoxGeometry(0.0013, AX + 0.0062 - yy(205), 0.009).translate(k * 0.0084, (AX + 0.0062 + yy(205)) / 2, zx(805)))]), undefined, { real: 'sight' }); }
  const IRON = { rear: V(0, AX, zx(805)), front: V(0, AX - 0.0003, zx(191)) };   // the aperture's centre, the post's tip

  // ═════ holographic sight: a battery housing on the rail, the hood and its two windows, a lit ring and dot ═════
  const HZ = { r: 0.152, f: 0.203 };                                           // rear and front windows
  const pOptic = part('optic', gun), opticG = new THREE.Group(); pOptic.add(opticG);
  add(opticG, rbox(0.032, AX - 0.019 - RAIL_TOP, 0.095, 0, (RAIL_TOP + AX - 0.019) / 2, 0.1775, 0.004), undefined, { real: 'optic' });   // housing
  add(opticG, box(-0.0125, 0.0125, RAIL_TOP - 0.004, RAIL_TOP + 0.001, 0.14, 0.215), undefined, { real: 'optic' });                       // clamp on the rail
  for (const k of SIDES) add(opticG, rbox(0.0028, 0.041, 0.054, k * 0.0186, AX + 0.001, (HZ.r + HZ.f) / 2, 0.001), undefined, { real: 'optic' });   // the hood's sides
  add(opticG, rbox(0.04, 0.0028, 0.054, 0, AX + 0.0218, (HZ.r + HZ.f) / 2, 0.001), undefined, { real: 'optic' });                         // and top
  for (const z of [HZ.r, HZ.f]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.034, 0.034), E.mats.glass); w.position.set(0, AX, z); w.userData.real = 'window'; w.raycast = () => {}; opticG.add(w);
    add(opticG, merge([box(-0.0175, 0.0175, AX - 0.0185, AX - 0.016, z - 0.002, z + 0.002), box(-0.0175, 0.0175, AX + 0.016, AX + 0.0185, z - 0.002, z + 0.002)]), undefined, { real: 'optic' });   // window frames
  }
  for (const [x, z] of [[0.008, 0.134], [-0.008, 0.134]] as const) add(opticG, rbox(0.007, 0.006, 0.006, x, AX - 0.024, z, 0.002), undefined, { real: 'dark' });   // buttons at the back
  add(opticG, cylX(0.006, 0.016, 0.022, AX - 0.03, 0.2, 14), undefined, { real: 'optic' });             // battery cap
  const reticleMat = E.glowMat();
  const reticle = new THREE.Mesh(merge([new THREE.TorusGeometry(0.0055, 0.0004, 6, 28), new THREE.CircleGeometry(0.0007, 10)]), reticleMat);
  reticle.position.set(0, AX, HZ.f - 0.004); reticle.raycast = () => {}; opticG.add(reticle);
  const reticleGlow = E.glowPoints([V(0, AX, HZ.f - 0.004)], 0.01); opticG.add(reticleGlow);
  const HOLO: OpticSight = { rear: V(0, AX, HZ.r), front: V(0, AX, HZ.f), relief: 0.26, zoom: [1, 1], kind: 'holo', reticle: 'holo' };

  // ═════ 3× magnifier behind it, on a flip-to-side mount pivoting on its left ═════
  const pMagn = part('magnifier', gun), magnBase = new THREE.Group(); pMagn.add(magnBase);
  const flip = hinge(magnBase, V(0.017, RAIL_TOP + 0.009, 0), V(0, 0, 1), 'z');
  add(magnBase, box(-0.0125, 0.0125, RAIL_TOP - 0.004, RAIL_TOP + 0.003, 0.074, 0.112), undefined, { real: 'optic' });           // clamp
  add(magnBase, rbox(0.01, 0.014, 0.034, 0.016, RAIL_TOP + 0.009, 0.093, 0.002), undefined, { real: 'optic' });                  // the pivot block
  add(flip.inner, turn([[0.0168, 0.058], [0.0192, 0.06], [0.0192, 0.078], [0.0172, 0.081], [0.0172, 0.112], [0.0182, 0.116], [0.0182, 0.126], [0.0172, 0.128]], 28, 0, AX), undefined, { real: 'optic' });
  add(flip.inner, rbox(0.022, AX - RAIL_TOP - 0.022, 0.03, 0.006, (AX + RAIL_TOP + 0.003) / 2 - 0.004, 0.093, 0.003), undefined, { real: 'optic' });   // the arm down to the pivot
  for (const [r, z, flipY] of [[0.0158, 0.0581, true], [0.0158, 0.1279, false]] as const) {
    const l = new THREE.Mesh(new THREE.CircleGeometry(r, 26), E.mats.glass); l.position.set(0, AX, z); if (flipY) l.rotation.y = Math.PI; l.userData.real = 'glass'; l.raycast = () => {}; flip.inner.add(l);
  }
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; lines(flip.inner, [[V(Math.cos(a) * 0.0193, AX + Math.sin(a) * 0.0193, 0.061), V(Math.cos(a) * 0.0193, AX + Math.sin(a) * 0.0193, 0.077)]]); }   // the eyepiece's grip
  const MAGNIFIED: OpticSight = { rear: V(0, AX, 0.058), front: V(0, AX, HZ.f), relief: 0.075, zoom: [3, 3], kind: 'scope', reticle: 'holo' };

  // ═════ laser aiming module on the right rail, toward the muzzle ═════
  const pLaser = part('laser', gun);
  const LZ0 = zx(330), LZ1 = zx(190), LX0 = -HW - 0.004;
  add(pLaser, rbox(0.024, 0.036, LZ1 - LZ0, LX0 - 0.012, HYC + 0.001, (LZ0 + LZ1) / 2, 0.004), undefined, { real: 'poly' });
  add(pLaser, box(LX0, -HW - 0.0028, HYC - 0.012, HYC + 0.012, LZ0 + 0.01, LZ1 - 0.01), undefined, { real: 'poly' });            // rail clamp
  for (const y of [HYC + 0.008, HYC - 0.007]) add(pLaser, cylZ(0.0055, LZ1, LZ1 + 0.005, 16, LX0 - 0.012, y), undefined, { real: 'poly' });   // the two aperture rings
  const laserMat = E.glowMat();
  const emitter = new THREE.Mesh(new THREE.CircleGeometry(0.0034, 16), laserMat); emitter.position.set(LX0 - 0.012, HYC + 0.008, LZ1 + 0.0052); emitter.raycast = () => {}; pLaser.add(emitter);
  const ir = new THREE.Mesh(new THREE.CircleGeometry(0.0034, 16), E.mats.glass); ir.position.set(LX0 - 0.012, HYC - 0.007, LZ1 + 0.0052); ir.userData.real = 'glass'; ir.raycast = () => {}; pLaser.add(ir);
  const laserGlow = E.glowPoints([V(LX0 - 0.012, HYC + 0.008, LZ1 + 0.006)], 0.02); pLaser.add(laserGlow);
  add(pLaser, rbox(0.012, 0.006, 0.012, LX0 - 0.012, HYC + 0.021, LZ0 + 0.012, 0.002), undefined, { real: 'dark' });            // the switch on top
  // zeroed: the beam crosses the line of sight 25 m out
  const LASER_FROM = V(LX0 - 0.012, HYC + 0.008, LZ1 + 0.006), LASER_DIR = V(0, AX, 25).sub(LASER_FROM).normalize();

  // ═════ suppressor: screws over the flash hider ═════
  const pSupp = part('suppressor', gun), suppG = new THREE.Group(); pSupp.add(suppG);
  add(suppG, turn([[0.0108, zx(80)], [0.0172, zx(80) + 0.002], [0.019, zx(80) + 0.008], [0.019, 0.64], [0.0182, 0.646], [0.0055, 0.6465]], 28), undefined, { real: 'supp' });
  lines(suppG, Array.from({ length: 10 }, (_, i) => { const a = i / 10 * Math.PI * 2, c = Math.cos(a) * 0.0192, sn = Math.sin(a) * 0.0192; return [V(c, sn, 0.49), V(c, sn, 0.52)] as [THREE.Vector3, THREE.Vector3]; }));   // flutes at its back
  for (const z of [0.56, 0.6]) for (const k of SIDES) well(suppG, [V(k * 0.0191, -0.0012, z - 0.012), V(k * 0.0191, -0.0012, z + 0.012), V(k * 0.0191, 0.0012, z + 0.012), V(k * 0.0191, 0.0012, z - 0.012)], V(k, 0, 0));   // slots
  const suppBore = new THREE.Mesh(new THREE.CircleGeometry(0.005, 16), E.mats.recess); suppBore.position.set(0, 0, 0.6467); suppBore.raycast = () => {}; suppG.add(suppBore);

  // ═════ buffer tube and the telescoping stock ═════
  const pStock = part('stock', gun);
  add(pStock, cylZ(0.0178, -0.012, 0.0, 22, 0, yy(264.5)), undefined, { real: 'phosphate' });          // end plate and castle nut
  add(pStock, cylZ(0.0162, zx(1221), -0.012, 22, 0, yy(264.5)), undefined, { real: 'anod' });          // buffer tube
  const slide = new THREE.Group(); pStock.add(slide);
  add(slide, across(profile(STOCK), -0.019, 0.019, 0.004, 4), undefined, { real: 'poly' });
  add(slide, across(profile(BUTTPAD), -0.0205, 0.0205, 0.003, 3), undefined, { real: 'rubber' });
  for (let i = 0; i < 9; i++) realAdd(slide, new THREE.BoxGeometry(0.039, 0.0035, 0.0028).translate(0, yy(250 + i * 21), zx(1268) - 0.0012), 'rubber');   // the pad's ribs
  { const ring = new THREE.TorusGeometry(0.0055, 0.0012, 6, 16); ring.rotateY(Math.PI / 2); ring.translate(0, yy(215), zx(1217)); add(slide, ring, undefined, { real: 'phosphate' }); }   // sling loop
  for (const k of SIDES) lines(slide, [[V(k * 0.0191, yy(355), zx(1085)), V(k * 0.0191, yy(436), zx(1195))], [V(k * 0.0191, yy(345), zx(1095)), V(k * 0.0191, yy(426), zx(1205))]]);   // the ribbed cheek panel's edges
  add(slide, rbox(0.012, 0.01, 0.02, 0, yy(340), zx(990), 0.003), undefined, { real: 'poly' });         // the release lever under the front

  // ═════ magazine ═════
  const pMag = part('magazine', gun);
  add(pMag, across(profile(MAG), -0.0125, 0.0125, 0.0013, 3), undefined, { real: 'magSteel' });
  add(pMag, across(profile(FLOOR), -0.0145, 0.0145, 0.0013, 2), undefined, { real: 'magSteel' });
  for (const k of SIDES) for (const f of [0.35, 0.65]) {                                                // two pressed ribs down each side
    const pts = [[600, 420], [586, 470], [566, 520]].map(([a, b], i) => { const rx = [688, 670, 650][i]; return V(k * 0.0127, yy(b + (i === 0 ? 0 : 0)), zx(a + (rx - a) * f)); });
    lines(pMag, [[pts[0], pts[1]], [pts[1], pts[2]]]);
    realAdd(pMag, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.0012, 6), 'magSteel');
  }
  const topRound = new THREE.Group(); pMag.add(topRound);
  const caseLathe = [[0, -0.0225], [0.0048, -0.0225], [0.0048, -0.0213], [0.0042, -0.0205], [0.0042, -0.0195], [0.0048, -0.019], [0.0047, 0.0145], [0.0032, 0.0175], [0.0032, 0.0225], [0.0029, 0.0225], [0.0029, 0.019]] as [number, number][];
  const noseLathe = [[0.0029, 0.0225], [0.0029, 0.028], [0.0022, 0.0335], [0.0009, 0.037], [0, 0.0375]] as [number, number][];
  { const c = turn(caseLathe, 14), n = turn(noseLathe, 14); c.translate(0, yy(297), zx(645)); n.translate(0, yy(297), zx(645)); add(topRound, c, undefined, { real: 'brass' }); add(topRound, n, undefined, { real: 'copper' }); }

  // ═════ Real view only: markings and slot numbers ═════
  {
    const decal = (parent: THREE.Object3D, w: number, h: number, at: THREE.Vector3, side: number, draw: (x: CanvasRenderingContext2D, W: number, H: number) => void, o: THREE.MeshStandardMaterialParameters = {}) => {
      const W = 1024, H = Math.round(W * h / w), tex = decalTexture(W, H, x => draw(x, W, H)), mat = decalMaterial(tex, { roughness: 0.6, metalness: 0.1, alphaTest: 0.35, ...o });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateY(side * Math.PI / 2).translate(at.x, at.y, at.z), mat);
      m.visible = false; m.raycast = () => {}; parent.add(m); realOnly.push(m); decalMats.push(mat);
    };
    const font = (x: CanvasRenderingContext2D, size: number, col: string, weight = 700) => { x.font = `${weight} ${size}px Arial, Helvetica, sans-serif`; x.fillStyle = col; x.textBaseline = 'middle'; x.textAlign = 'center'; };
    // model and calibre on the left of the magazine well, as on the photographed rifle
    decal(pLower, 0.042, 0.016, V(0.01355, yy(357), zx(628)), 1, (x, W, H) => { font(x, 200, '#d8d8d4'); x.fillText('HK416 F-C', W / 2, H * 0.3); font(x, 150, '#d8d8d4', 600); x.fillText('5,56 x 45 mm', W / 2, H * 0.78); });
    decal(pUpper, 0.04, 0.006, V(UX + 0.00015, yy(234), zx(700)), 1, (x, W, H) => { font(x, 120, '#c8c8c4'); x.fillText('HK416 F-C      416-0429', W / 2, H / 2); });
    // selector pictograms round the left pivot: safe forward, single shot up, automatic back (red for the live ones)
    decal(pLower, 0.03, 0.026, V(LX + 0.00015, SEL.y + 0.002, SEL.z), 1, (x, W, H) => {
      const cx = W / 2, cy = H * 0.6, bullet = (bx: number, by: number, col: string) => { x.fillStyle = col; x.beginPath(); x.moveTo(bx - 34, by + 16); x.lineTo(bx + 20, by + 16); x.quadraticCurveTo(bx + 46, by, bx + 20, by - 16); x.lineTo(bx - 34, by - 16); x.closePath(); x.fill(); };
      x.fillStyle = '#d8d8d4'; x.fillRect(cx - 420, cy - 50, 150, 100); bullet(cx - 345, cy, '#26272a'); x.strokeStyle = '#26272a'; x.lineWidth = 14; x.beginPath(); x.moveTo(cx - 400, cy - 40); x.lineTo(cx - 290, cy + 40); x.stroke();   // safe
      x.fillStyle = '#c4161c'; x.fillRect(cx - 75, cy - 360, 150, 100); bullet(cx, cy - 310, '#f0f0ec');                                                                                   // single
      x.fillStyle = '#c4161c'; x.fillRect(cx + 260, cy - 50, 200, 100); for (const d of [-55, 0, 55]) bullet(cx + 360 + d * 0.6, cy + d * 0.45, '#f0f0ec');                         // automatic
    }, { alphaTest: 0.3 });
    // slot numbers along the left side rail, every second slot
    decal(pHand, zx(166) - zx(530), 0.006, V(HW + 0.0058, yy(271), (zx(166) + zx(530)) / 2), 1, (x, W, H) => {
      font(x, Math.round(H * 0.72), '#c8c8c4', 600); for (let i = 0; i < 11; i++) x.fillText(String(38 - i * 2), W * (0.03 + i * 0.094), H / 2);
    }, { alphaTest: 0.3 });
  }

  // ═════ muzzle flash: accent glow, and in the Real view a fireball (big off the flash hider, small out of the can) ═════
  const flashMat = E.glowMat();
  const flashMesh = new THREE.Mesh((() => { const g = new THREE.ConeGeometry(0.024, 0.065, 7, 1, true); g.rotateX(-Math.PI / 2); g.translate(0, 0, 0.032); return g; })(), flashMat);
  flashMesh.raycast = () => {}; flashMesh.visible = false; gun.add(flashMesh);
  const flashGlow = E.glowPoints([V(0, 0, 0)], 0.28); gun.add(flashGlow);
  const flashLight = new THREE.PointLight(E.accent.getHex(), 0, 1.6, 2); gun.add(flashLight); E.accentLights.push(flashLight);
  const fbBare = makePlume(gun, V(0, 0, zx(16)), V(0, 0, 1), 0.06, 0.06, 0.18, 8);
  const fbSupp = makePlume(gun, V(0, 0, 0.6465), V(0, 0, 1), 0.024, 0.024, 0.045, 9, 'dry');
  let realOn = false;
  const muzzle = V(0, 0, 0.6465);

  // ═════ cases and live rounds thrown from the ejection port ═════
  type Brass = { g: THREE.Group; line: THREE.Group; real: THREE.Group; v: THREE.Vector3; spin: THREE.Vector3; rest: boolean; bounced: boolean };
  const brass: Brass[] = [], CASE_R = 0.0048;
  const caseReal = new THREE.LatheGeometry(caseLathe.map(([r, y]) => new THREE.Vector2(r, y)), 16), noseReal = new THREE.LatheGeometry(noseLathe.map(([r, y]) => new THREE.Vector2(r, y)), 16);
  const caseLine = new THREE.CylinderGeometry(CASE_R, CASE_R, 0.045, 10), noseLine = new THREE.ConeGeometry(0.0029, 0.015, 10).translate(0, 0.03, 0);
  let inHand = false, trigDelay = 30, flashGain = 1, brassMax = 14;
  let ground = (_x: number, _z: number) => 0;
  const drop = (b: Brass) => { b.g.removeFromParent(); b.g.traverse(o => { const m = o as THREE.Mesh; if (m.geometry && m.geometry !== caseReal && m.geometry !== noseReal) m.geometry.dispose(); }); };
  function eject(live: boolean) {
    if (brass.length >= brassMax) drop(brass.shift()!);
    const g = new THREE.Group(), line = new THREE.Group(), real = new THREE.Group(); g.add(line, real); E.scene.add(g);
    add(line, caseLine.clone()); if (live) add(line, noseLine.clone());
    const pieces: [THREE.BufferGeometry, THREE.Material][] = [[caseReal, RM.brass]]; if (live) pieces.push([noseReal, RM.copper]);
    for (const [geo, mat] of pieces) { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; real.add(m); }
    line.visible = !realOn; real.visible = realOn;
    gun.updateMatrixWorld();
    g.position.copy(gun.localToWorld(V(-0.014, yy(262), zx(700) + carrierZ * 0.2)));
    g.rotation.set(0, 0, Math.PI / 2); g.quaternion.premultiply(gun.quaternion);
    const r = () => Math.random() - 0.5;
    const v = V(-1.7 + r() * 0.5, 0.7 + r() * 0.3, -0.15 + r() * 0.3).applyQuaternion(gun.quaternion);   // out to the right, a little back (off the deflector)
    brass.push({ g, line, real, v, spin: V(r() * 30, r() * 20, 22 + r() * 10), rest: false, bounced: false });
  }

  // ═════ magazines dropped in the hands: a copy falls to the floor (the last three stay) ═════
  type DropMag = { g: THREE.Group; v: THREE.Vector3; spin: number; rest: boolean };
  const mags: DropMag[] = [];
  function dropMag() {
    if (mags.length >= 3) mags.shift()!.g.removeFromParent();
    gun.updateMatrixWorld(true);
    const g = new THREE.Group(), copy = pMag.clone(true);
    copy.traverse(o => { if ((o as THREE.Points).isPoints || (o as { isLineSegments2?: boolean }).isLineSegments2 || o.userData.outline) o.visible = false; });
    copy.position.set(0, 0, 0).sub(MAG_C); copy.visible = true; g.add(copy);
    g.position.copy(gun.localToWorld(MAG_C.clone())); g.quaternion.copy(gun.quaternion); E.scene.add(g);
    mags.push({ g, v: V(0, -1.3, 0).applyQuaternion(gun.quaternion), spin: (Math.random() - 0.5) * 5, rest: false });
  }

  // ═════ sound: the 5.56's sharp crack, or the can's thump; the buffer spring's ring; the action and accessories ═════
  const sfx = {
    shot(supp: boolean) {
      if (supp) {
        snd.burst(0.1, 0.32, { type: 'lowpass', freq: 1100, attack: 0.002 }); snd.burst(0.04, 0.15, { freq: 2900, q: 1.2 });
        snd.tone(82, 0.18, 0.2, { type: 'sine', to: 44 }); snd.burst(0.018, 0.2, { freq: 5200, q: 0.8, at: 0.003 });
      } else {
        snd.burst(0.17, 0.9, { freq: 2600, q: 0.5, attack: 0.001 }); snd.burst(0.5, 0.5, { type: 'lowpass', freq: 260 });
        snd.tone(70, 0.36, 0.36, { type: 'triangle', to: 36 }); snd.burst(0.02, 0.5, { freq: 5800, q: 0.7 });
      }
      snd.click(0.03, 0.75); snd.tone(1150, 0.13, supp ? 0.035 : 0.022, { type: 'sine', to: 1500, at: 0.035 });   // the bolt home and the buffer spring's twang
    },
    rackBack() { snd.burst(0.12, 0.1, { freq: 1800, q: 2.2 }); snd.click(0, 0.7); snd.tone(1200, 0.1, 0.02, { type: 'sine', to: 1500 }); },
    home() { snd.click(0, 0.55); snd.thunk(0.005); snd.tone(900, 0.05, 0.06, { type: 'square' }); snd.tone(1300, 0.12, 0.025, { type: 'sine', to: 1600, at: 0.01 }); },
    magOut() { snd.click(0, 1.15); snd.burst(0.05, 0.08, { freq: 950, q: 1.5, at: 0.04 }); },
    magIn() { snd.click(0.18, 0.8); snd.thunk(0.19); snd.tone(2000, 0.03, 0.05, { type: 'square', at: 0.22 }); },
    selector() { snd.click(0, 1.2); snd.tone(2900, 0.02, 0.03, { type: 'square' }); },
    cover() { snd.tone(2400, 0.02, 0.04, { type: 'square' }); snd.click(0.01, 1.3); },
    stock() { for (let i = 0; i < 2; i++) snd.click(i * 0.05, 1.05 - i * 0.1); },
    mount() { snd.thunk(0); snd.click(0.04, 0.85); snd.click(0.12, 0.9); },
    flip() { snd.click(0, 1.3); snd.tone(700, 0.04, 0.05, { type: 'triangle', at: 0.012 }); },
    laser(on: boolean) { snd.tone(on ? 2300 : 1700, 0.03, 0.03, { type: 'square' }); },
    ratchet() { snd.tone(2600 + Math.random() * 300, 0.016, 0.03, { type: 'square' }); },
  };

  // ═════ state ═════
  const st = {
    rounds: CAP, chamber: false, magIn: true, mode: 'safe' as Mode, locked: false, coverOpen: false,
    ext: 0.6, optic: true, magnified: true, laser: false, supp: false,
    magT: 0, extT: 0.6, opticT: 1, flipT: 1, suppT: 0, selT: 0, catchT: 0, coverT: 0,
    cycle: null as null | { kind: 'shot' | 'rack' | 'release'; t0: number; back: boolean; lock: boolean },
    shotAt: -1, trigAt: -1, holdUntil: -1, held: false,
  };
  let carrierZ = 0, relAt = -1, lastTurn = 0;
  const busy = () => !!st.cycle;
  const suppressed = () => st.supp && st.suppT > 0.99;

  function atRear(kind: 'shot' | 'rack' | 'release') {
    if (kind === 'shot') eject(false);
    else if (kind === 'rack' && st.chamber) eject(true);
    st.chamber = false;
  }
  function feed(): boolean {
    if (st.magIn && st.rounds > 0) { st.rounds--; st.chamber = true; return false; }
    return st.magIn;                                       // an empty magazine's follower lifts the bolt catch
  }
  const startCycle = (kind: 'shot' | 'rack' | 'release', t0: number) => { st.cycle = { kind, t0, back: false, lock: false }; if (!st.coverOpen) { st.coverOpen = true; sfx.cover(); } };

  const act = {
    fire() {
      if (busy()) return;
      st.trigAt = performance.now();
      if (st.mode === 'safe') { snd.click(0, 0.6); return say('safe · S selector'); }
      if (st.locked) return say('bolt locked back');
      if (!st.chamber) { snd.click(0, 0.7); return say('click · chamber empty'); }
      if (st.suppT > 0.01 && st.suppT < 0.99) return say('suppressor half on');
      startCycle('shot', performance.now() + trigDelay);
      if (st.mode === 'auto' && !inHand) st.holdUntil = Math.max(st.holdUntil, performance.now() + 240);   // a clicked button: a short burst
    },
    rack() { if (busy()) return; startCycle(st.locked ? 'release' : 'rack', performance.now()); sfx.rackBack(); },
    release() {
      if (!st.locked) return say(st.magIn ? 'bolt already forward' : 'bolt forward');
      if (busy()) return;
      startCycle('release', performance.now());
    },
    magazine() {
      if (st.magT > 0 && st.magT < 1) return;
      st.magIn = !st.magIn;
      if (!st.magIn) { relAt = performance.now(); sfx.magOut(); if (inHand) dropMag(); }
      else { st.rounds = CAP; sfx.magIn(); }
    },
    selector() { st.mode = MODES[(MODES.indexOf(st.mode) + 1) % 3]; sfx.selector(); },
    stock() { st.ext = st.ext > 0.5 ? 0 : 1; },
    optic() {
      if (st.opticT > 0 && st.opticT < 1) return;
      st.optic = !st.optic; if (!st.optic) st.magnified = false; sfx.mount();
    },
    magnifier() {
      if (!st.optic || st.opticT < 1) return say('fit the holo sight first · O');
      if (st.flipT > 0 && st.flipT < 1) return;
      st.magnified = !st.magnified; sfx.flip();
    },
    laser() { st.laser = !st.laser; sfx.laser(st.laser); },
    suppressor() { if (st.suppT > 0 && st.suppT < 1) return; if (busy()) return; st.supp = !st.supp; snd.click(0, 0.9); },
    cover() {
      if (!st.coverOpen) return say('the cover is shut');
      if (busy() || st.locked) return say('the bolt must be forward');
      st.coverOpen = false; sfx.cover();
    },
    range() {},
    demo() {},
  } satisfies Record<string, () => void>;

  // ═════ the range: what the shooting lane needs from this rifle ═════
  const rangeGun: RangeGun = {
    name: 'HK416', calibre: '5.56×45 mm', root: gun, kind: 'rifle',
    sight: IRON, muzzle, relief: 0.1,
    optic: () => !st.optic || st.opticT < 0.99 ? null : st.magnified && st.flipT > 0.99 ? MAGNIFIED : HOLO,
    laser: () => st.laser ? { from: LASER_FROM, dir: LASER_DIR } : null,
    grip: { web: V(0, yy(333), zx(868)), down: V(0, -0.976, -0.216), length: 0.1, depth: 0.046, half: 0.014, trigger: V(0, yy(375), zx(754)), thumbY: -0.012, frameHalf: LX, fingers: 0.026 },
    fore: { at: V(0, HYC, zx(400)), r: 0.031, dir: V(0, 0, 1) },
    hip: V(0.185, -0.129, -0.102),   // the iron rear sight's place in view: low and right, close in
    recoil: { rise: 2.1 * DEG, push: 0.02, cam: 0.42 * DEG },
    trigger() {
      if (busy()) return 'busy';
      const r = st.mode === 'safe' ? 'safe' : st.locked ? 'locked' : !st.chamber ? 'click' : 'shot';
      if (r !== 'locked') act.fire();
      return r;
    },
    auto: () => st.mode === 'auto',
    loud: () => suppressed() ? 0.32 : 1,
    magazine() { act.magazine(); },
    rack() { act.rack(); },
    safety() { act.selector(); },
    night() {},
    state: () => ({ rounds: st.rounds, cap: CAP, chamber: st.chamber, magIn: st.magIn, safe: st.mode === 'safe', locked: st.locked, busy: busy() || (st.magT > 0 && st.magT < 1), night: false, mode: st.mode }),
    hold(on, o) {
      inHand = on; trigDelay = on ? 0 : 30; flashGain = on ? 24 : 1; flashLight.distance = on ? (o?.flash ?? 12) : 1.6; brassMax = on ? 50 : 14;
      ground = on && o ? o.ground : () => 0;
      if (on) { st.ext = 0.6; st.magnified = false; st.holdUntil = -1; st.held = false; st.mode = 'safe'; }   // on the line: the sight unmagnified (V flips it in)
      else {                                                     // back on the bench, the floor swept, made safe
        gun.position.set(0, GY, 0); gun.quaternion.identity();
        brass.forEach(drop); brass.length = 0; mags.forEach(m => m.g.removeFromParent()); mags.length = 0;
        if (!st.magIn) { st.magIn = true; st.rounds = CAP; st.magT = 0; }
        st.mode = 'safe';
      }
    },
  };
  let rng: Range | null = null, wantRange = false, loadingRange = false;
  function openRange() {
    if (rng) { wantRange = false; rng.enter(); return; }
    if (loadingRange) return;
    loadingRange = true;
    import('../../../range/range').then(({ createRange }) => {
      loadingRange = false;
      rng ??= createRange(E, snd, rangeGun, MAT, { id: def.id, open: id => open(id, 'range') });
      if (wantRange && realOn) rng.enter();
      wantRange = false;
    }).catch(err => { loadingRange = false; wantRange = false; console.error(err); say('the range failed to load'); });
  }
  act.range = () => {
    if (rng?.on) { wantRange = false; rng.exit(); return; }
    wantRange = true;
    if (!realOn) { say('opening the range'); style(true); return; }
    openRange();
  };
  act.demo = () => {
    if (script.active) { script.stop(); return; }
    script.start();
    const { later, when } = script;
    const idle = () => !busy() && st.extT === st.ext && [st.magT, st.opticT, st.flipT, st.suppT].every(t => t === 0 || t === 1) && performance.now() > st.holdUntil;
    const setMode = (m: Mode) => { while (st.mode !== m) act.selector(); };
    const steps: [() => void, number][] = [
      [() => { if (!st.optic) act.optic(); if (st.magnified) act.magnifier(); if (st.laser) act.laser(); setMode('safe'); }, 600],
      [() => { if (st.magIn) act.magazine(); }, 700],
      [() => act.magazine(), 800],
      [() => act.rack(), 800],
      [() => setMode('semi'), 600],
      [() => act.fire(), 360], [() => act.fire(), 360], [() => act.fire(), 700],
      [() => setMode('auto'), 600],
      [() => { st.holdUntil = performance.now() + 450; act.fire(); }, 900],
      [() => setMode('safe'), 600],
      [() => act.laser(), 900],
      [() => act.magnifier(), 1100],
      [() => act.magnifier(), 1000],
      [() => act.laser(), 600],
      [() => act.stock(), 900],
      [() => act.stock(), 900],
      [() => { act.cover(); script.end(); }, 0],
    ];
    const step = (i: number) => when(idle, () => { steps[i][0](); if (i + 1 < steps.length) later(steps[i][1], () => step(i + 1)); });
    step(0);
  };

  // ═════ per frame ═════
  const flashK = (now: number) => st.shotAt < 0 || now < st.shotAt ? 0 : Math.exp(-(now - st.shotAt) / 22);
  function tick(now: number, dt: number) {
    if (wantRange && realOn && !rng?.on) openRange();
    rng?.tick(now, dt);
    st.magT = approach(st.magT, st.magIn ? 0 : 1, (st.magIn ? 2.4 : 4.2) * dt);
    const e0 = st.extT; st.extT = approach(st.extT, st.ext, 1.8 * dt);
    if (Math.floor(e0 * 5) !== Math.floor(st.extT * 5)) sfx.stock();                              // a click at each position
    const o0 = st.opticT; st.opticT = approach(st.opticT, st.optic ? 1 : 0, 2.2 * dt);
    if ((o0 > 0.35) !== (st.opticT > 0.35)) sfx.flip();
    st.flipT = approach(st.flipT, st.magnified ? 1 : 0, 4 * dt);
    st.suppT = approach(st.suppT, st.supp ? 1 : 0, 0.9 * dt);
    const turnNow = Math.floor((1 - st.suppT) * 24); if (st.suppT > 0 && st.suppT < 1 && turnNow !== lastTurn) sfx.ratchet(); lastTurn = turnNow;
    st.selT = approach(st.selT, MODES.indexOf(st.mode), 9 * dt);
    st.catchT = approach(st.catchT, st.locked ? 1 : 0, 12 * dt);
    st.coverT = approach(st.coverT, st.coverOpen ? 1 : 0, (st.coverOpen ? 14 : 6) * dt);

    // automatic fire: keep cycling while the trigger is held
    if (!inHand && st.mode === 'auto' && (st.held || now < st.holdUntil) && !busy() && st.chamber && !st.locked) startCycle('shot', now);

    // bolt carrier: recoil or a hand rack, then home (or locked back on an empty magazine)
    let z = st.locked ? -LOCK : 0;
    const c = st.cycle;
    if (c) {
      const t = (now - c.t0) / 1000;
      const [tb, tf] = c.kind === 'shot' ? [0.024, 0.046] : c.kind === 'rack' ? [0.17, 0.15] : [0.0, 0.07];
      if (t >= 0) {
        if (c.kind === 'shot' && st.shotAt < c.t0) { st.shotAt = c.t0; sfx.shot(suppressed()); }
        const from = c.kind === 'release' ? -LOCK : 0;
        if (t < tb) z = THREE.MathUtils.lerp(from, -BACK, c.kind === 'shot' ? t / tb : ease(t / tb));
        else {
          if (!c.back) { c.back = true; atRear(c.kind); c.lock = feed(); }
          const f = clamp01((t - tb) / tf), home = c.lock ? -LOCK : 0;
          z = THREE.MathUtils.lerp(c.kind === 'release' ? -LOCK : -BACK, home, c.kind === 'shot' ? f : ease(f));
          if (f >= 1) { st.locked = c.lock; st.cycle = null; if (c.kind !== 'shot') sfx.home(); }
        }
      } else z = st.locked ? -LOCK : 0;
    }
    carrierZ = z;
    carrier.position.z = z;
    chargeG.position.z = c && c.kind === 'rack' ? z * 1.02 : 0;               // the T handle only moves when worked by hand
    cover.set(st.coverT * 105 * DEG);                                        // swings down and out to the right

    // controls
    const tt = st.trigAt < 0 ? 1 : (now - st.trigAt) / 1000, firing = st.shotAt > 0 && now - st.shotAt < 90;
    trig.set((tt < 0.05 ? tt / 0.05 : firing || (st.held && st.mode === 'auto') ? 1 : clamp01(1 - (tt - 0.08) / 0.12)) * 11 * DEG);
    selH.forEach(h => h.set(-st.selT * 90 * DEG));
    catchG.position.y = st.catchT * 0.0028;
    rel.position.x = relAt < 0 ? 0 : 0.0012 * Math.max(0, 1 - (now - relAt) / 180);
    slide.position.z = -STOCK_RUN * st.extT;
    // the sight lifts off the rail with its magnifier; the irons fold flat under it and stand once it is clear
    const oe = ease(st.opticT);
    for (const g of [opticG, magnBase]) { g.position.y = (1 - oe) * 0.09; g.visible = st.opticT > 0.01; }
    const up = 1 - phase(st.opticT, 0.35, 1);
    rearLeaf.set((1 - up) * 90 * DEG); frontLeaf.set(-(1 - up) * 90 * DEG);
    flip.set(-(1 - ease(st.flipT)) * 90 * DEG);                                  // flipped aside to the left, or in behind the sight
    const lit = st.optic && st.opticT > 0.99;
    reticleMat.emissiveIntensity = lit && !inHand ? 1.6 : 0; reticle.visible = !inHand;
    reticleGlow.material.uniforms.intensity.value = lit && !inHand ? 0.5 : 0;
    laserMat.emissiveIntensity = st.laser ? 1.8 : 0;
    laserGlow.material.uniforms.intensity.value = st.laser ? 0.7 : 0;
    // suppressor: screws on in turns, sliding back over the flash hider
    const off = 1 - st.suppT;
    suppG.rotation.z = -phase(off, 0, 0.7) * Math.PI * 5;
    suppG.position.z = phase(off, 0, 0.7) * 0.012 + phase(off, 0.7, 1) * 0.12;
    suppG.visible = st.suppT > 0.02;
    muzzle.z = st.supp ? 0.6465 : zx(16);
    // magazine: drops straight down onto the mat, loads back up and seats
    pMag.position.y = -MAG_DROP * st.magT * st.magT;
    pMag.visible = !inHand || st.magIn;
    topRound.visible = st.rounds > 0;

    // the flash
    const fk = flashK(now), sup = suppressed(), fz = sup ? 0.6465 : zx(16);
    flashMesh.position.z = fz; flashGlow.position.z = fz + 0.01; flashLight.position.set(0, 0.01, fz + 0.05);
    flashMesh.visible = !realOn && fk > 0.04; flashMat.emissiveIntensity = (sup ? 0.8 : 2.4) * fk; flashMesh.scale.setScalar((sup ? 0.35 : 0.8) + fk * (sup ? 0.2 : 0.7));
    flashGlow.material.uniforms.intensity.value = fk * (sup ? 0.35 : 1.4);
    flashLight.intensity = fk * flashGain * (sup ? 0.3 : 1.3);
    bench.shadowMat.uniforms.opacity.value = E.shadowStrength() * 0.8;

    // brass: thrown, tumbling, one bounce, then at rest on its side
    for (const b of brass) {
      if (b.rest) continue;
      b.v.y -= 9.8 * dt;
      b.g.position.addScaledVector(b.v, dt);
      b.g.rotation.x += b.spin.x * dt; b.g.rotation.y += b.spin.y * dt; b.g.rotation.z += b.spin.z * dt;
      const gy = ground(b.g.position.x, b.g.position.z) + CASE_R;
      if (b.g.position.y <= gy) {
        b.g.position.y = gy;
        if (!b.bounced && b.v.y < -0.4) { b.bounced = true; b.v.set(b.v.x * 0.32, -b.v.y * 0.24, b.v.z * 0.32); b.spin.multiplyScalar(0.3); snd.tone(2700, 0.08, 0.03); snd.tone(3900, 0.06, 0.02); }
        else { b.rest = true; b.g.rotation.set(0, b.g.rotation.y, Math.PI / 2); snd.tone(2500, 0.05, 0.015); }
      }
    }
    for (const m of mags) {
      if (m.rest) continue;
      m.v.y -= 9.8 * dt; m.g.position.addScaledVector(m.v, dt); m.g.rotation.x += m.spin * dt;
      const gy = ground(m.g.position.x, m.g.position.z) + 0.0135;
      if (m.g.position.y <= gy) { m.g.position.y = gy; m.rest = true; m.g.rotation.set(0, m.g.rotation.y, Math.PI / 2); snd.tone(620, 0.07, 0.05); snd.thunk(0); }
    }
  }

  function readout() {
    if (rng?.on) return 'range · lane 3';
    const p: string[] = [];
    p.push(st.magIn ? `${st.rounds} in magazine` : 'magazine out');
    p.push(st.chamber ? 'round chambered' : 'chamber empty');
    p.push(st.locked ? 'bolt locked back' : st.mode);
    p.push(st.optic ? (st.magnified ? 'holo + 3×' : 'holo sight') : 'iron sights');
    if (st.laser) p.push('laser on');
    if (st.supp) p.push('suppressed');
    return p.join(' · ');
  }

  // realistic style: on a shooting bench under the sky
  const real: RealSpec = {
    focus: V(0, 0.15, 0.18), size: 1.05, hide: [bench.deck], bench: MAT,
    materials: { ...RM, body: RM.anod },
    lamps: [[reticleMat, 'red'], [laserMat, 'green']],
    only: { line: [], real: realOnly },
    stage: () => rng?.stage() ?? null,
    onStyle(on) {
      realOn = on;
      if (on && !rng) openRange();                     // build the range now, so taking the line is instant
      if (!on) { wantRange = false; rng?.exit(); }
      for (const b of brass) { b.line.visible = !on; b.real.visible = on; }
      if (!on) { fbBare.set(0, 0); fbSupp.set(0, 0); flashLight.color.copy(E.accent); }
    },
    tick(now) {
      const k = flashK(now), sup = suppressed();
      fbBare.set(sup ? 0 : k, now); fbSupp.set(sup ? k * 0.5 : 0, now);
      flashLight.color.setHex(0xffa24a);
    },
  };

  if (arrive === 'range') setTimeout(() => act.range(), 0);   // changed to on the range: straight onto the line

  return {
    pickRoot: gun, parts: K.parts, real,
    view: { target: V(0, 0.2, 0.17), dist: 1.75, min: 0.35, max: 6 },
    actions: act, passive: ['laser'],
    keyDown(k, e) {
      if (rng?.on) return rng.keyDown(k, e);
      if (k === 'f') { if (!e.repeat) { st.held = true; act.fire(); } return true; }
      return false;
    },
    keyUp(k) { if (rng?.on) rng.keyUp(k); if (k === 'f') st.held = false; },
    blur() { rng?.blur(); st.held = false; },
    hud: () => rng?.hud() ?? null,
    on: () => ({ range: !!rng?.on, demo: script.active, fire: !!st.cycle && st.cycle.kind === 'shot', rack: st.locked, magazine: st.magIn, selector: st.mode !== 'safe', stock: st.ext > 0.5, optic: st.optic, magnifier: st.magnified, laser: st.laser, suppressor: st.supp }),
    tick, readout,
    dispose() {
      rng?.dispose(); mags.forEach(m => m.g.removeFromParent());
      brass.forEach(drop);
      RTex.forEach(t => t.dispose()); Object.values(RM).forEach(m => m.dispose());
      decalMats.forEach(m => { (m as THREE.MeshStandardMaterial).map?.dispose(); m.dispose(); });
      [caseReal, noseReal, caseLine, noseLine].forEach(g => g.dispose());
    },
  };
};

export default model;
