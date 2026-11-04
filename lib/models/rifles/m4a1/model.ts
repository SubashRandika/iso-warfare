// M4A1 carbine with an M203 grenade launcher: a working magazine, bolt carrier seen through the ejection port, sprung
// port cover, rear T charging handle, forward assist, bolt catch with hold-open, selector (safe, semi, auto), a
// collapsible stock, the A-frame front sight, a detachable carry handle with the A2 rear sight (swapped for a holographic
// sight), and the M203 under the barrel: its barrel slides forward to load a 40 mm round, it fires with a thump, and on
// the range the grenade flies, arms after 14 m and bursts where it lands.
// Coordinates in metres: +z toward the muzzle, +y up, +x to the carbine's left; the bore axis is y = 0 and z = 0 is the
// back of the receivers. Like every small arm it floats raised above its mat.
// Receiver, stock, grip, magazine and carry handle are traced from a right-side photograph (1300 × 664) that is not
// square-scaled: across it is 0.575 mm per pixel (the 30-round magazine's 63.5 mm depth), down it is 0.60 mm (the sights'
// 66 mm above the bore). Profiles are written in that photo's pixels (ix, iy) and converted by `px`; its muzzle points
// right, so z grows with ix. Its barrel is a short one, so the front (carbine-length handguards, 14.5 in barrel with the
// launcher step, birdcage) follows the M4A1's dimensions, and the M203 follows a three-quarter photo.
// Accent (live) parts: the sight's reticle, the flashes. Real view: anodised aluminium, phosphated steel, polymer
// furniture, an aluminium magazine, an olive-drab 40 mm round with its gold band; brass 5.56 mm cases.
// Range (key G, Real view): shouldered on lane 3 (lib/range/), on the carry handle's aperture or the holographic sight;
// automatic fire while the trigger is held; N loads the launcher and B fires it, also on the line.
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
import type { OpticSight, RangeGun, RangeHold } from '../../../range/types';
import type { Range } from '../../../range/range';

const CAP = 30;
const GY = 0.3;                                             // bore axis above the mat
const MAT = { w: 0.5, d: 1.26, cx: 0, cz: 0.2 };            // the bench mat under the carbine (both styles)
const BACK = 0.082, LOCK = 0.062;                           // bolt carrier travel, and where it locks back on empty
const MAG_DROP = GY - 0.2;
const STOCK_RUN = 0.08;                                     // the stock's travel on the buffer tube (757 → 838 mm)
type Mode = 'safe' | 'semi' | 'auto';
const MODES: Mode[] = ['safe', 'semi', 'auto'];

// ── the photograph's pixels → carbine metres ──
const PXX = 0.575e-3, PXY = 0.6e-3, IX0 = 352, IY0 = 180;  // scales; the back of the receivers and the bore axis
const zx = (ix: number) => (ix - IX0) * PXX, yy = (iy: number) => (IY0 - iy) * PXY;
type Cmd = ['M', number, number] | ['L', number, number] | ['Q', number, number, number, number];
const px = (cmds: Cmd[]): Cmd[] => cmds.map(c => c[0] === 'Q' ? ['Q', zx(c[1]), yy(c[2]), zx(c[3]), yy(c[4])] : [c[0], zx(c[1]), yy(c[2])]);
const trace = (p: THREE.Path, cmds: Cmd[]) => cmds.forEach(c => c[0] === 'M' ? p.moveTo(c[1], c[2]) : c[0] === 'L' ? p.lineTo(c[1], c[2]) : p.quadraticCurveTo(c[1], c[2], c[3], c[4]));
const profile = (cmds: Cmd[], holes: Cmd[][] = []) => {
  const s = new THREE.Shape(); trace(s, px(cmds));
  holes.forEach(h => { const p = new THREE.Path(); trace(p, px(h)); s.holes.push(p); });
  return s;
};
const shape = (cmds: Cmd[]) => { const s = new THREE.Shape(); trace(s, cmds); return s; };
const across = (s: THREE.Shape, x0: number, x1: number, bevel = 0.001, segs = 1) => {
  const g = new THREE.ExtrudeGeometry(s, { depth: x1 - x0 - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: segs, curveSegments: 10 });
  g.rotateY(-Math.PI / 2); g.translate(x1 - bevel, 0, 0);
  return g;
};
const along = (s: THREE.Shape, z0: number, z1: number, bevel = 0, segs = 1) => {
  const g = new THREE.ExtrudeGeometry(s, { depth: z1 - z0 - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: segs, curveSegments: 14 });
  g.translate(0, 0, z0 + bevel); return g;
};
const turn = (pts: [number, number][], segs: number, x = 0, y = 0) => {
  const g = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), segs);
  g.rotateX(Math.PI / 2); g.translate(x, y, 0); return g;
};
const cylZ = (r: number, z0: number, z1: number, segs = 16, x = 0, y = 0) => { const g = new THREE.CylinderGeometry(r, r, z1 - z0, segs); g.rotateX(Math.PI / 2); g.translate(x, y, (z0 + z1) / 2); return g; };
const cylX = (r: number, x0: number, x1: number, y: number, z: number, segs = 16) => { const g = new THREE.CylinderGeometry(r, r, Math.abs(x1 - x0), segs); g.rotateZ(Math.PI / 2); g.translate((x0 + x1) / 2, y, z); return g; };
const rbox = (w: number, h: number, d: number, x: number, y: number, z: number, r = Math.min(w, h, d) * 0.3) => new RoundedBoxGeometry(w, h, d, 2, r).translate(x, y, z);
const holeXY = (x: number, y: number, r: number) => { const p = new THREE.Path(); p.absarc(x, y, r, 0, Math.PI * 2, true); return p; };
/** an oval of half-width a, half-height b round (0, yc), as points (for the handguards) */
const oval = (a: number, b: number, yc: number, n = 28) => Array.from({ length: n }, (_, i) => { const t = i / n * Math.PI * 2, c = Math.cos(t), s = Math.sin(t); return new THREE.Vector2(a * Math.sign(c) * Math.abs(c) ** 0.8, yc + b * Math.sign(s) * Math.abs(s) ** 0.8); });

// ── side profiles, in the photo's pixels ──
const UPPER: Cmd[] = [['M', 352, 200], ['L', 352, 138], ['Q', 352, 128, 362, 128], ['L', 715, 128], ['L', 715, 200]];
const PORT: Cmd[] = [['M', 548, 152], ['L', 700, 152], ['L', 700, 185], ['L', 548, 185]];
const LOWER: Cmd[] = [['M', 352, 200], ['L', 714, 200], ['L', 714, 222], ['L', 706, 226], ['L', 706, 302], ['L', 565, 323], ['L', 560, 272], ['L', 380, 271], ['Q', 362, 268, 356, 258], ['L', 352, 250]];
/** trigger guard: from the grip's front up top, under the trigger, up into the magazine well's back (joined at both ends) */
const GUARD: Cmd[] = [['M', 453, 266], ['L', 464, 266], ['L', 464, 321], ['Q', 464, 324, 468, 324], ['L', 558, 324], ['L', 558, 312], ['L', 569, 312], ['L', 569, 331], ['L', 460, 331], ['Q', 453, 331, 453, 325]];
const TRIGGER: Cmd[] = [['M', 488, 272], ['L', 496, 272], ['Q', 495, 300, 508, 318], ['Q', 508, 323, 503, 322], ['Q', 486, 302, 488, 272]];
/** the A2 grip: a finger swell on its front, raked back */
const GRIP: Cmd[] = [['M', 372, 270], ['L', 455, 268], ['L', 452, 334], ['Q', 446, 345, 444, 352], ['Q', 441, 365, 439, 373], ['Q', 432, 390, 426, 400], ['L', 400, 440], ['Q', 397, 452, 388, 451], ['L', 298, 435], ['Q', 288, 432, 293, 425], ['L', 330, 371], ['L', 357, 330], ['L', 372, 300], ['Q', 378, 284, 372, 270]];
const GRIP_PANEL: Cmd[] = [['M', 352, 348], ['Q', 380, 344, 428, 356], ['Q', 424, 380, 406, 416], ['Q', 362, 424, 320, 416], ['Q', 334, 382, 352, 348]];
/** the aluminium magazine, nearly straight, curving at the bottom; its top rides up inside the well */
const MAG: Cmd[] = [['M', 575, 215], ['L', 702, 215], ['L', 704, 315], ['Q', 716, 410, 731, 497], ['L', 733, 505], ['L', 617, 532], ['Q', 598, 430, 572, 318]];
const FLOOR: Cmd[] = [['M', 612, 528], ['L', 735, 499], ['L', 737, 507], ['L', 615, 537]];
const CATCH: Cmd[] = [['M', 545, 205], ['L', 566, 207], ['L', 566, 235], ['Q', 562, 242, 555, 238], ['L', 546, 222]];
/** the collapsible stock, drawn closed (as photographed), with the sling slot through its toe */
const STOCK: Cmd[] = [['M', 36, 146], ['L', 325, 146], ['L', 325, 228], ['L', 262, 228], ['L', 262, 275], ['L', 178, 272], ['L', 120, 296], ['L', 42, 328], ['Q', 30, 330, 29, 318], ['L', 28, 150], ['Q', 28, 146, 36, 146]];
const STOCK_SLOT: Cmd[] = [['M', 54, 226], ['L', 104, 226], ['Q', 108, 226, 108, 231], ['Q', 108, 236, 104, 236], ['L', 54, 236], ['Q', 50, 236, 50, 231], ['Q', 50, 226, 54, 226]];
const STOCK_LOOP: Cmd[] = [['M', 46, 148], ['L', 46, 133], ['Q', 46, 128, 51, 128], ['L', 111, 128], ['Q', 116, 128, 116, 133], ['L', 116, 148]];
const LOOP_HOLE: Cmd[] = [['M', 54, 135], ['L', 108, 135], ['L', 108, 143], ['L', 54, 143]];
const BUTT: Cmd[] = [['M', 24, 142], ['L', 32, 142], ['L', 32, 330], ['Q', 27, 336, 24, 326]];
const LEVER: Cmd[] = [['M', 120, 296], ['L', 142, 287], ['L', 144, 292], ['L', 127, 318], ['Q', 120, 321, 118, 313]];
/** the carry handle: the arch from the rear sight's tower to its front leg, the rail clamp under it, the tower */
const ARCH: Cmd[] = [['M', 470, 46], ['L', 692, 70], ['Q', 712, 74, 714, 92], ['L', 714, 118], ['L', 698, 118], ['L', 698, 96], ['Q', 698, 86, 690, 84], ['L', 506, 82], ['L', 470, 80]];
/** the floor of the sighting groove down the handle's top, below the sight line */
const GROOVE: Cmd[] = [['M', 470, 74], ['L', 700, 74], ['Q', 714, 77, 714, 92], ['L', 714, 118], ['L', 698, 118], ['L', 698, 96], ['Q', 698, 86, 690, 84], ['L', 506, 82], ['L', 470, 80]];
const CLAMP: Cmd[] = [['M', 405, 128], ['L', 714, 128], ['L', 714, 118], ['L', 405, 118]];
const TOWER: Cmd[] = [['M', 405, 118], ['L', 405, 82], ['L', 497, 82], ['L', 497, 118]];
const EARS: Cmd[] = [['M', 405, 82], ['L', 405, 72], ['Q', 408, 50, 430, 47], ['L', 472, 46], ['L', 497, 82]];
/** the A-frame front sight on the gas block: the frame below its ears, with the triangular window */
const AFRAME: Cmd[] = [['M', 1068, 182], ['L', 1117, 80], ['L', 1150, 80], ['L', 1150, 175], ['L', 1143, 182]];
const AWINDOW: Cmd[] = [['M', 1094, 170], ['L', 1123, 104], ['L', 1134, 104], ['L', 1134, 170]];
const AEARS: Cmd[] = [['M', 1117, 80], ['L', 1122, 62], ['Q', 1128, 55, 1138, 56], ['Q', 1150, 58, 1150, 70], ['L', 1150, 80]];
const SELECTOR: Cmd[] = [['M', -0.004, -0.004], ['L', 0.012, -0.0026], ['Q', 0.0175, 0, 0.012, 0.0026], ['L', -0.004, 0.004], ['Q', -0.0065, 0, -0.004, -0.004]];
const MAG_C = new THREE.Vector3(0, -0.1, zx(650));
const AX = yy(68);                                          // the sights' axis: carry-handle aperture and front post tip
// ── the M203 under the barrel ──
const GL = { y: -0.058, r: 0.0245, bore: 0.0205, z0: 0.296, z1: 0.52, open: 0.118, w: 0.0255 };   // barrel axis, radii, closed extent, travel

/** finishes for the Real view, by tag; untagged meshes get the anodised aluminium */
function realMaterials() {
  const tex: THREE.Texture[] = [];
  const canvasTex = (n: number, draw: (x: CanvasRenderingContext2D, n: number) => void, rep: number) => {
    const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d')!, n);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.setScalar(rep); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
    tex.push(t); return t;
  };
  const grain = canvasTex(128, (x, n) => { const img = x.createImageData(n, n); for (let i = 0; i < img.data.length; i += 4) { const v = 116 + Math.random() * 24; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; } x.putImageData(img, 0, 0); }, 160);
  // the A2 grip's checkering: a fine diamond grid
  const check = canvasTex(64, (x, n) => { x.fillStyle = '#5a5a5a'; x.fillRect(0, 0, n, n); x.strokeStyle = '#d0d0d0'; x.lineWidth = 2; for (let i = -n; i < 2 * n; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + n, n); x.stroke(); x.beginPath(); x.moveTo(i, n); x.lineTo(i + n, 0); x.stroke(); } }, 40);
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  const M = {
    anod: new THREE.MeshPhysicalMaterial({ color: 0x27292b, metalness: 0.25, roughness: 0.62, bumpMap: grain, bumpScale: 0.1, clearcoat: 0.08, clearcoatRoughness: 0.6 }),
    poly: std({ color: 0x1e1f21, roughness: 0.78, bumpMap: grain, bumpScale: 0.25 }),
    checker: std({ color: 0x1c1d1f, roughness: 0.9, bumpMap: check, bumpScale: 0.7, side: THREE.DoubleSide }),
    rubber: std({ color: 0x18191a, roughness: 0.95, bumpMap: grain, bumpScale: 0.4 }),
    magAl: std({ color: 0x2b2d30, metalness: 0.5, roughness: 0.48, bumpMap: grain, bumpScale: 0.1 }),
    phosphate: std({ color: 0x2c2d2f, metalness: 0.5, roughness: 0.58 }),
    carrier: std({ color: 0x313235, metalness: 0.75, roughness: 0.38 }),
    bolt: std({ color: 0x8c9094, metalness: 1, roughness: 0.32 }),
    sight: std({ color: 0x18191a, metalness: 0.3, roughness: 0.72 }),
    optic: new THREE.MeshPhysicalMaterial({ color: 0x1f2022, metalness: 0.35, roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.5 }),
    launcher: new THREE.MeshPhysicalMaterial({ color: 0x2a2c2b, metalness: 0.3, roughness: 0.58, bumpMap: grain, bumpScale: 0.1, clearcoat: 0.08 }),
    od: std({ color: 0x4b5034, metalness: 0.2, roughness: 0.55 }),
    gold: std({ color: 0xc8a24a, metalness: 0.9, roughness: 0.3 }),
    alu: std({ color: 0xa9adb1, metalness: 1, roughness: 0.34 }),
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
  const bench = buildPlate(E, { ...MAT, grid: 0.01, ruler: true, shadow: [0.22, 1.1, 0, 0.2] });
  const { M: RM, tex: RTex } = realMaterials();
  const realOnly: THREE.Object3D[] = [], decalMats: THREE.Material[] = [];
  const realAdd = (parent: THREE.Object3D, geo: THREE.BufferGeometry, tag: string) => {
    const m = add(parent, geo, undefined, { real: tag, lines: false }); m.visible = false; realOnly.push(m); return m;
  };
  const UX = 0.0118, LX = 0.0115;                           // half-widths: upper, lower
  const RAIL_TOP = yy(118), RAIL_BASE = yy(124);

  // ═════ lower receiver, trigger guard, pins ═════
  const pLower = part('lower', gun);
  add(pLower, across(profile(LOWER), -LX, LX, 0.0012, 3));
  add(pLower, across(profile(GUARD), -0.0055, 0.0055, 0.0011, 2));
  well(pLower, [V(-0.0108, yy(323) - 0.0004, zx(566)), V(0.0108, yy(323) - 0.0004, zx(566)), V(0.0108, yy(302) - 0.0004, zx(704)), V(-0.0108, yy(302) - 0.0004, zx(704))], V(0, -1, -0.15));   // the well's mouth
  for (const [ix, iy] of [[690, 212], [402, 220]] as const) add(pLower, cylX(0.003, -LX - 0.0005, LX + 0.0005, yy(iy), zx(ix), 12), undefined, { real: 'steel' });   // pivot and takedown pins
  for (const ix of [478, 505]) add(pLower, cylX(0.0022, -LX - 0.0003, LX + 0.0003, yy(244), zx(ix), 10), undefined, { real: 'steel' });   // hammer and trigger pins

  // ═════ A2 grip ═════
  const pGrip = part('grip', gun);
  add(pGrip, across(profile(GRIP), -0.0135, 0.0135, 0.0035, 4), undefined, { real: 'poly' });
  const gp = profile(GRIP_PANEL);
  for (const k of SIDES) {
    pGrip.add(E.loopLine(gp.getPoints(4).map(p => V(k * 0.0136, p.y, p.x)), E.mats.line));
    realAdd(pGrip, new THREE.ShapeGeometry(gp, 4).rotateY(-Math.PI / 2).translate(k * 0.01365, 0, 0), 'checker');
  }

  // ═════ trigger, selector (left; its shaft end on the right), bolt catch (left), magazine release (right) ═════
  const pTrig = part('trigger', gun);
  const trig = hinge(pTrig, V(0, yy(272), zx(492)), V(1, 0, 0), 'x');
  add(trig.inner, across(profile(TRIGGER), -0.003, 0.003, 0.0006, 3), undefined, { real: 'phosphate' });
  const pSel = part('selector', gun), SEL = V(0, yy(240), zx(438));
  const selH = hinge(pSel, SEL, V(1, 0, 0), 'x');
  { const g = across(shape(SELECTOR), LX, LX + 0.0024, 0.0005, 2); g.translate(0, SEL.y, SEL.z); add(selH.inner, g, undefined, { real: 'phosphate' });
    add(selH.inner, cylX(0.0045, LX, LX + 0.0012, SEL.y, SEL.z, 16), undefined, { real: 'phosphate' }); }
  add(pSel, cylX(0.0038, -LX - 0.0008, -LX, SEL.y, SEL.z, 14), undefined, { real: 'phosphate' });
  const pCatch = part('boltCatch', gun), catchG = new THREE.Group(); pCatch.add(catchG);
  add(catchG, across(profile(CATCH), LX - 0.0001, LX + 0.0016, 0.0004, 1), undefined, { real: 'phosphate' });
  const rel = new THREE.Group(); rel.userData.part = 'magazine'; gun.add(rel);
  add(rel, cylX(0.0042, -LX, -LX - 0.0032, yy(240), zx(563), 12), undefined, { real: 'phosphate' });
  add(pLower, cylX(0.0062, -LX, -LX - 0.0015, yy(240), zx(563), 16));                                 // the fence round it

  // ═════ upper receiver: two halves, the ejection port cut through the right one only ═════
  const pUpper = part('upper', gun);
  add(pUpper, across(profile(UPPER), 0, UX, 0.0014, 3));
  add(pUpper, across(profile(UPPER, [PORT]), -UX, 0, 0.0014, 3));
  well(pUpper, [V(-0.0002, yy(184.5), zx(699)), V(-0.0002, yy(184.5), zx(549)), V(-0.0002, yy(152.5), zx(549)), V(-0.0002, yy(152.5), zx(699))], V(-1, 0, 0));
  for (const [iy, f] of [[184, 1], [153, -1]] as const) well(pUpper, [V(-UX + 0.0003, yy(iy), zx(699)), V(-UX + 0.0003, yy(iy), zx(549)), V(-0.0003, yy(iy), zx(549)), V(-0.0003, yy(iy), zx(699))], V(0, f, 0));
  add(pUpper, rbox(0.004, 0.018, 0.012, -UX - 0.0015, yy(150), zx(524), 0.0015));                       // brass deflector behind the port
  const carrier = new THREE.Group(); pUpper.add(carrier);
  add(carrier, merge([box(-0.0096, 0.0092, yy(185) + 0.0012, yy(152) - 0.0012, 0.01, zx(700) + 0.004), box(-0.0101, -0.0096, yy(172), yy(162), 0.03, zx(695))]), undefined, { real: 'carrier', minLen: 0.004 });
  add(carrier, cylZ(0.0075, zx(700) + 0.004, zx(712), 14), undefined, { real: 'bolt' });
  add(carrier, cylX(0.0026, -0.0102, -0.0086, yy(168), zx(640), 10), undefined, { real: 'steel' });
  const pCover = part('portCover', gun);
  const cover = hinge(pCover, V(-UX - 0.0004, yy(185), 0), V(0, 0, 1), 'z');
  add(cover.inner, box(-UX - 0.0012, -UX - 0.0004, yy(185), yy(152.5), zx(549), zx(700)), undefined, { real: 'phosphate' });
  // forward assist on the right, angled down to the back, its plunger cap at the rear
  const pFA = part('forwardAssist', gun), faG = new THREE.Group(); pFA.add(faG);
  { const a = V(-0.0142, yy(170), zx(395)), b = V(-0.0142, yy(158), zx(440)), mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b), tilt = Math.atan2(b.y - a.y, b.z - a.z);
    const body = cylZ(0.0062, -len / 2, len / 2, 16).rotateX(-tilt).translate(mid.x, mid.y, mid.z);
    add(pUpper, merge([body, box(-0.0145, -UX + 0.0004, a.y - 0.004, b.y + 0.004, a.z, b.z)]));
    add(faG, cylZ(0.0072, -0.003, 0.002, 18).rotateX(-tilt).translate(a.x, a.y, a.z), undefined, { real: 'phosphate' }); }
  // the T charging handle at the back of the upper, under the rear sight
  const pCharge = part('charging', gun), chargeG = new THREE.Group(); pCharge.add(chargeG);
  add(chargeG, merge([box(-0.0038, 0.0038, yy(138), yy(129), -0.012, 0.012), box(-0.0205, 0.0205, yy(139), yy(130), -0.016, -0.006)]), undefined, { real: 'phosphate' });
  add(chargeG, rbox(0.007, 0.011, 0.009, 0.019, yy(134.5), -0.011, 0.0025), undefined, { real: 'phosphate' });   // the latch (left)

  // ═════ the flat-top's rail: a dovetail base with teeth every 10 mm ═════
  {
    const s = new THREE.Shape([[-0.0094, yy(128)], [0.0094, yy(128)], [0.0106, RAIL_BASE - 0.0012], [0.0106, RAIL_BASE + 0.0006], [0.0094, RAIL_BASE + 0.0018], [-0.0094, RAIL_BASE + 0.0018], [-0.0106, RAIL_BASE + 0.0006], [-0.0106, RAIL_BASE - 0.0012]].map(([a, b]) => new THREE.Vector2(a, b)));
    add(pUpper, along(s, zx(362), zx(714)));
    const g: THREE.BufferGeometry[] = [];
    for (let z = zx(366); z < zx(712); z += 0.01001) g.push(new THREE.BoxGeometry(0.0188, RAIL_TOP - RAIL_BASE - 0.0018, 0.0052).translate(0, (RAIL_TOP + RAIL_BASE + 0.0018) / 2, z));
    add(pUpper, merge(g), undefined, { minLen: 0.002 });
  }

  // ═════ barrel nut and delta ring, the ribbed carbine handguards, the handguard cap ═════
  const pHand = part('handguard', gun);
  const HZ0 = zx(760), HZ1 = zx(1055), HYC = yy(175), HA = 0.0285, HB = 0.031;
  add(pHand, turn([[0.0128, zx(715)], [0.0215, zx(715)], [0.0215, zx(722)], [0.0275, zx(728)], [0.0318, zx(742)], [0.0318, zx(756)], [0.029, zx(760)], [0.0128, zx(760)]], 24, 0, HYC));   // barrel nut, delta ring
  {
    const body = new THREE.Shape(oval(HA, HB, HYC)); body.holes.push(holeXY(0, 0, 0.0115));
    add(pHand, along(body, HZ0, HZ1, 0.002, 2), undefined, { real: 'poly' });
    const ribs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 16; i++) {                                                                   // raised ribs round each half
      const z = HZ0 + 0.012 + i * (HZ1 - HZ0 - 0.024) / 15, ring = new THREE.Shape(oval(HA + 0.0011, HB + 0.0011, HYC)); ring.holes.push(new THREE.Path(oval(HA - 0.001, HB - 0.001, HYC).reverse()));
      ribs.push(along(ring, z - 0.0021, z + 0.0021));
    }
    add(pHand, merge(ribs), undefined, { real: 'poly', minLen: 0.003 });
    for (const k of SIDES) lines(pHand, [[V(k * HA, HYC, HZ0 + 0.003), V(k * HA, HYC, HZ1 - 0.003)]]);   // where the two halves meet
    add(pHand, turn([[0.0098, HZ1], [0.027, HZ1], [0.0262, HZ1 + 0.005], [0.0175, HZ1 + 0.009], [0.0098, HZ1 + 0.009]], 22, 0, HYC));   // handguard cap
  }

  // ═════ barrel (with the launcher step), gas block and A-frame front sight, birdcage flash hider ═════
  const pBarrel = part('barrel', gun);
  const FS0 = zx(1071), FS1 = zx(1143), MZ = 0.555;
  add(pBarrel, cylZ(0.0095, 0.17, FS1, 18), undefined, { real: 'phosphate' });
  add(pBarrel, turn([[0.0095, FS1], [0.0085, FS1 + 0.004], [0.0085, FS1 + 0.018], [0.0072, FS1 + 0.02], [0.0072, FS1 + 0.036], [0.0085, FS1 + 0.038], [0.0085, MZ]], 18), undefined, { real: 'phosphate' });
  add(pBarrel, turn([[0.0085, MZ], [0.0108, MZ + 0.002], [0.011, MZ + 0.006], [0.011, MZ + 0.042], [0.0104, MZ + 0.045], [0.0052, MZ + 0.045]], 20), undefined, { real: 'phosphate' });
  for (const a of [90, 30, 150, -30, -150].map(d => d * DEG)) {                                      // the birdcage's slots (none underneath)
    const c = Math.cos(a) * 0.0111, sn = Math.sin(a) * 0.0111;
    well(pBarrel, [V(c, sn, MZ + 0.012), V(c, sn, MZ + 0.036), V(c * 1.0001, sn * 1.0001 + 0.0001, MZ + 0.036), V(c, sn + 0.0001, MZ + 0.012)], V(Math.cos(a), Math.sin(a), 0));
    lines(pBarrel, [[V(c, sn, MZ + 0.012), V(c, sn, MZ + 0.036)]]);
  }
  const bore = new THREE.Mesh(new THREE.CircleGeometry(0.0047, 16), E.mats.recess); bore.position.set(0, 0, MZ + 0.0452); bore.raycast = () => {}; pBarrel.add(bore);
  const pFront = part('frontSight', gun);
  add(pFront, box(-0.0105, 0.0105, yy(212), yy(172), FS0, FS1));
  add(pFront, across(profile(AFRAME, [AWINDOW]), -0.0065, 0.0065, 0.0012, 2));
  for (const k of SIDES) add(pFront, across(profile(AEARS), k > 0 ? 0.0024 : -0.0065, k > 0 ? 0.0065 : -0.0024, 0.0006, 1), undefined, { real: 'sight' });
  add(pFront, box(-0.0011, 0.0011, yy(82), AX, zx(1136) - 0.0011, zx(1136) + 0.0011), undefined, { real: 'sight' });   // the post
  add(pFront, box(-0.004, 0.004, yy(232), yy(210), zx(1120), zx(1145)));                                              // bayonet lug
  { const ring = new THREE.TorusGeometry(0.0055, 0.0012, 6, 16); ring.translate(0, yy(224), zx(1086)); add(pFront, ring, undefined, { real: 'steel' }); }   // sling swivel

  // ═════ carry handle with the A2 rear sight; swapped for a holographic sight ═════
  const pCarry = part('carryHandle', gun), carryG = new THREE.Group(); pCarry.add(carryG);
  for (const k of SIDES) add(carryG, across(profile(ARCH), k > 0 ? 0.0032 : -0.0105, k > 0 ? 0.0105 : -0.0032, 0.0016, 3));   // the arch's two walls either side of the groove
  add(carryG, across(profile(GROOVE), -0.0036, 0.0036, 0.0008, 1));
  add(carryG, across(profile(CLAMP), -0.0115, 0.0115, 0.0012, 2));
  add(carryG, across(profile(TOWER), -0.0115, 0.0115, 0.0016, 2));
  for (const k of SIDES) add(carryG, across(profile(EARS), k > 0 ? 0.004 : -0.0115, k > 0 ? 0.0115 : -0.004, 0.0012, 2));   // ears round the aperture
  { const ring = new THREE.Shape(); ring.absarc(0, AX, 0.0056, 0, Math.PI * 2, false); ring.holes.push(holeXY(0, AX, 0.0029));
    const stem = new THREE.Shape([[-0.0025, yy(82)], [0.0025, yy(82)], [0.0025, AX - 0.004], [-0.0025, AX - 0.004]].map(([a, b]) => new THREE.Vector2(a, b)));
    add(carryG, merge([along(ring, zx(432) - 0.0014, zx(432) + 0.0014), along(stem, zx(432) - 0.0014, zx(432) + 0.0014)]), undefined, { real: 'sight' }); }   // the flip aperture
  add(carryG, cylX(0.0058, -0.0115, -0.0172, yy(62), zx(437), 18), undefined, { real: 'phosphate' });   // windage knob (right)
  add(carryG, cylX(0.0062, -0.0118, 0.0118, yy(100), zx(432), 20), undefined, { real: 'phosphate' });  // elevation drum
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; lines(carryG, [[V(-0.0118, yy(100) + Math.sin(a) * 0.0063, zx(432) + Math.cos(a) * 0.0063), V(0.0118, yy(100) + Math.sin(a) * 0.0063, zx(432) + Math.cos(a) * 0.0063)]]); }
  for (const ix of [525, 655]) { add(carryG, cylX(0.0028, 0.0115, 0.017, yy(123), zx(ix), 10), undefined, { real: 'steel' }); add(carryG, cylX(0.0058, 0.017, 0.0205, yy(123), zx(ix), 16), undefined, { real: 'phosphate' }); }   // thumb screws
  const IRON = { rear: V(0, AX, zx(432)), front: V(0, AX - 0.0002, zx(1136)) };

  const pOptic = part('optic', gun), opticG = new THREE.Group(); pOptic.add(opticG);
  const HZ = { r: 0.118, f: 0.168 };
  add(opticG, rbox(0.032, AX - 0.019 - RAIL_TOP, 0.095, 0, (RAIL_TOP + AX - 0.019) / 2, 0.144, 0.004), undefined, { real: 'optic' });
  add(opticG, box(-0.0125, 0.0125, RAIL_TOP - 0.004, RAIL_TOP + 0.001, 0.106, 0.182), undefined, { real: 'optic' });
  for (const k of SIDES) add(opticG, rbox(0.0028, 0.041, 0.054, k * 0.0186, AX + 0.001, (HZ.r + HZ.f) / 2, 0.001), undefined, { real: 'optic' });
  add(opticG, rbox(0.04, 0.0028, 0.054, 0, AX + 0.0218, (HZ.r + HZ.f) / 2, 0.001), undefined, { real: 'optic' });
  for (const z of [HZ.r, HZ.f]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.034, 0.034), E.mats.glass); w.position.set(0, AX, z); w.userData.real = 'window'; w.raycast = () => {}; opticG.add(w);
    add(opticG, merge([box(-0.0175, 0.0175, AX - 0.0185, AX - 0.016, z - 0.002, z + 0.002), box(-0.0175, 0.0175, AX + 0.016, AX + 0.0185, z - 0.002, z + 0.002)]), undefined, { real: 'optic' });
  }
  for (const x of [0.008, -0.008]) add(opticG, rbox(0.007, 0.006, 0.006, x, AX - 0.024, 0.1, 0.002), undefined, { real: 'dark' });
  const reticleMat = E.glowMat();
  const reticle = new THREE.Mesh(merge([new THREE.TorusGeometry(0.0055, 0.0004, 6, 28), new THREE.CircleGeometry(0.0007, 10)]), reticleMat);
  reticle.position.set(0, AX, HZ.f - 0.004); reticle.raycast = () => {}; opticG.add(reticle);
  const reticleGlow = E.glowPoints([V(0, AX, HZ.f - 0.004)], 0.01); opticG.add(reticleGlow);
  const HOLO: OpticSight = { rear: V(0, AX, HZ.r), front: V(0, AX, HZ.f), relief: 0.24, zoom: [1, 1], kind: 'holo', reticle: 'holo' };

  // ═════ M203: receiver with its trigger, the rail mount, the barrel that slides forward to load ═════
  const pGL = part('launcher', gun);
  add(pGL, box(-0.012, 0.012, HYC - HB - 0.007, HYC - HB + 0.002, 0.25, 0.39), undefined, { real: 'launcher' });   // mount under the handguard
  // the receiver: a flat-sided housing round the breech, reaching back to just ahead of the magazine, its back corner rounded
  const GLR: Cmd[] = [['M', 0.207, -0.0295], ['L', GL.z0, -0.0295], ['L', GL.z0, -0.0885], ['L', 0.228, -0.0885], ['Q', 0.208, -0.0885, 0.207, -0.068]];
  const glBody = shape(GLR);
  add(pGL, across(glBody, -GL.w, GL.w, 0.0022, 3), undefined, { real: 'launcher' });
  for (const k of SIDES) {                                                                         // the pressed panel on each side, the barrel latch (left)
    pGL.add(E.loopLine([V(k * (GL.w + 0.0002), -0.036, 0.224), V(k * (GL.w + 0.0002), -0.036, GL.z0 - 0.008), V(k * (GL.w + 0.0002), -0.08, GL.z0 - 0.008), V(k * (GL.w + 0.0002), -0.08, 0.232), V(k * (GL.w + 0.0002), -0.07, 0.224)], E.mats.line));
  }
  add(pGL, rbox(0.004, 0.011, 0.016, GL.w + 0.0015, -0.048, 0.276, 0.0015), undefined, { real: 'phosphate' });
  // its trigger, under the back of the receiver, and the large guard loop round it
  const GLT: Cmd[] = [['M', 0.221, -0.0885], ['L', 0.229, -0.0885], ['Q', 0.229, -0.1, 0.222, -0.108], ['Q', 0.217, -0.111, 0.216, -0.106], ['Q', 0.222, -0.098, 0.221, -0.0885]];
  add(pGL, across(shape(GLT), -0.0032, 0.0032, 0.0007, 2), undefined, { real: 'phosphate' });
  { const g = shape([['M', 0.252, -0.0885], ['L', 0.252, -0.112], ['Q', 0.252, -0.121, 0.243, -0.121], ['L', 0.219, -0.121], ['Q', 0.21, -0.121, 0.21, -0.112], ['L', 0.21, -0.094], ['L', 0.2145, -0.094], ['L', 0.2145, -0.111], ['Q', 0.2145, -0.1165, 0.22, -0.1165], ['L', 0.242, -0.1165], ['Q', 0.2475, -0.1165, 0.2475, -0.111], ['L', 0.2475, -0.0885]]);
    add(pGL, across(g, -0.0045, 0.0045, 0.0008, 2), undefined, { real: 'launcher' }); }
  const glBarrel = new THREE.Group(); pGL.add(glBarrel);
  add(glBarrel, turn([[GL.bore, GL.z0], [GL.r, GL.z0], [GL.r, GL.z1 - 0.004], [GL.r - 0.002, GL.z1], [GL.bore, GL.z1]], 28, 0, GL.y), undefined, { real: 'launcher' });
  { const ribs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) { const z = GL.z0 + 0.04 + i * 0.019; ribs.push(turn([[GL.r, z - 0.003], [GL.r + 0.0018, z - 0.0015], [GL.r + 0.0018, z + 0.0015], [GL.r, z + 0.003]], 28, 0, GL.y)); }
    add(glBarrel, merge(ribs), undefined, { real: 'launcher', minLen: 0.003 }); }
  { const b = new THREE.Mesh(new THREE.RingGeometry(GL.bore * 0.6, GL.bore, 24), E.mats.recess); b.position.set(0, GL.y, GL.z1 + 0.0002); b.raycast = () => {}; glBarrel.add(b);
    const back = new THREE.Mesh(new THREE.CircleGeometry(GL.bore * 0.6, 20), E.mats.recess); back.position.set(0, GL.y, GL.z1 - 0.02); back.raycast = () => {}; glBarrel.add(back); }
  // the 40 mm round: an aluminium case, the olive-drab projectile with its gold band
  const shellLathe = [[0, 0.0], [0.0198, 0.0], [0.02, 0.008], [0.02, 0.028], [0.017, 0.044], [0.011, 0.054], [0.004, 0.059], [0, 0.06]] as [number, number][];
  const caseLathe40 = [[0.006, -0.045], [0.0212, -0.045], [0.0212, -0.004], [0.0198, 0.0]] as [number, number][];
  const round = new THREE.Group(); round.visible = false; pGL.add(round);
  add(round, turn(caseLathe40, 22), undefined, { real: 'alu' });
  add(round, turn(shellLathe, 22), undefined, { real: 'od' });
  add(round, cylZ(0.02035, 0.006, 0.011, 22), undefined, { real: 'gold', lines: false });
  const CHAMBER = V(0, GL.y, GL.z0 + 0.046);                                                          // where a loaded round sits (its case mouth)

  // ═════ buffer tube and the collapsible stock ═════
  const pStock = part('stock', gun);
  add(pStock, cylZ(0.0185, -0.016, -0.002, 22, 0, yy(173)), undefined, { real: 'phosphate' });          // end plate and castle nut
  add(pStock, cylZ(0.016, -0.215, -0.016, 22, 0, yy(173)), undefined, { real: 'anod' });               // buffer tube
  const slide = new THREE.Group(); pStock.add(slide);
  add(slide, across(profile(STOCK, [STOCK_SLOT]), -0.0175, 0.0175, 0.0035, 4), undefined, { real: 'poly' });
  add(slide, across(profile(STOCK_LOOP, [LOOP_HOLE]), -0.009, 0.009, 0.0015, 2), undefined, { real: 'poly' });
  add(slide, across(profile(BUTT), -0.0195, 0.0195, 0.0025, 3), undefined, { real: 'rubber' });
  add(slide, across(profile(LEVER), -0.006, 0.006, 0.0012, 2), undefined, { real: 'poly' });
  add(slide, cylZ(0.0035, 0, 0.001, 10), undefined, { lines: false, real: 'dark' }).visible = false;
  { const pin = new THREE.CylinderGeometry(0.0034, 0.0034, yy(270) - yy(288), 12); pin.translate(0, (yy(270) + yy(288)) / 2, zx(215)); add(slide, pin, undefined, { real: 'steel' }); }   // the lock pin under the tube
  for (const k of SIDES) lines(slide, [[V(k * 0.0176, yy(200), zx(40)), V(k * 0.0176, yy(200), zx(320))]]);   // the housing's edge

  // ═════ magazine ═════
  const pMag = part('magazine', gun);
  add(pMag, across(profile(MAG), -0.0118, 0.0118, 0.0013, 3), undefined, { real: 'magAl' });
  add(pMag, across(profile(FLOOR), -0.0132, 0.0132, 0.0013, 2), undefined, { real: 'magAl' });
  for (const k of SIDES) for (const f of [0.3, 0.55, 0.8]) {                                           // the pressed ribs down each side
    const top = [575 + (702 - 575) * f, 330], mid = [585 + (712 - 585) * f, 420], bot = [600 + (728 - 600) * f, 505];
    const pts = [top, mid, bot].map(([a, b]) => V(k * 0.0119, yy(b), zx(a)));
    lines(pMag, [[pts[0], pts[1]], [pts[1], pts[2]]]);
    realAdd(pMag, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.0011, 6), 'magAl');
  }
  const topRound = new THREE.Group(); pMag.add(topRound);
  const caseLathe = [[0, -0.0225], [0.0048, -0.0225], [0.0048, -0.0213], [0.0042, -0.0205], [0.0042, -0.0195], [0.0048, -0.019], [0.0047, 0.0145], [0.0032, 0.0175], [0.0032, 0.0225], [0.0029, 0.0225], [0.0029, 0.019]] as [number, number][];
  const noseLathe = [[0.0029, 0.0225], [0.0029, 0.028], [0.0022, 0.0335], [0.0009, 0.037], [0, 0.0375]] as [number, number][];
  { const c = turn(caseLathe, 14), n = turn(noseLathe, 14); c.translate(0, yy(212), zx(640)); n.translate(0, yy(212), zx(640)); add(topRound, c, undefined, { real: 'brass' }); add(topRound, n, undefined, { real: 'copper' }); }

  // ═════ Real view only: markings ═════
  {
    const decal = (parent: THREE.Object3D, w: number, h: number, at: THREE.Vector3, side: number, draw: (x: CanvasRenderingContext2D, W: number, H: number) => void, o: THREE.MeshStandardMaterialParameters = {}) => {
      const W = 1024, H = Math.round(W * h / w), tex = decalTexture(W, H, x => draw(x, W, H)), mat = decalMaterial(tex, { roughness: 0.6, metalness: 0.1, alphaTest: 0.35, ...o });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateY(side * Math.PI / 2).translate(at.x, at.y, at.z), mat);
      m.visible = false; m.raycast = () => {}; parent.add(m); realOnly.push(m); decalMats.push(mat);
    };
    const font = (x: CanvasRenderingContext2D, size: number, col: string, weight = 700) => { x.font = `${weight} ${size}px Arial, Helvetica, sans-serif`; x.fillStyle = col; x.textBaseline = 'middle'; x.textAlign = 'center'; };
    decal(pLower, 0.05, 0.022, V(LX + 0.00015, yy(262), zx(640)), 1, (x, W, H) => { font(x, Math.round(H * 0.26), '#d4d4d0'); x.fillText('M4A1 CARBINE', W / 2, H * 0.24); x.fillText('CAL 5.56 MM', W / 2, H * 0.52); font(x, Math.round(H * 0.2), '#d4d4d0', 600); x.fillText('W 1994-0431', W / 2, H * 0.8); });
    decal(pLower, 0.064, 0.04, V(LX + 0.00015, SEL.y + 0.002, SEL.z), 1, (x, W, H) => {                  // each word beyond the lever's tip
      font(x, Math.round(H * 0.13), '#e4e4e0'); x.fillText('SAFE', W * 0.12, H * 0.5); x.fillText('SEMI', W * 0.5, H * 0.08); x.fillText('AUTO', W * 0.88, H * 0.5);
    }, { alphaTest: 0.3 });
    decal(pLower, 0.036, 0.008, V(-LX - 0.00015, yy(255), zx(438)), -1, (x, W, H) => { font(x, Math.round(H * 0.7), '#cfcfcb', 600); x.fillText('AUTO        SAFE', W / 2, H / 2); }, { alphaTest: 0.3 });
    decal(pGL, 0.05, 0.016, V(GL.w + 0.00015, -0.058, 0.258), 1, (x, W, H) => { font(x, Math.round(H * 0.42), '#d4d4d0'); x.fillText('M203', W / 2, H * 0.32); font(x, Math.round(H * 0.32), '#d4d4d0', 600); x.fillText('40 MM', W / 2, H * 0.76); });
    realAdd(round, cylZ(0.02005, 0.03, 0.034, 22), 'gold');                                             // the fuze's yellow ring
  }

  // ═════ muzzle flashes: the carbine's (accent glow; a fireball in the Real view) and the launcher's ═════
  const flashMat = E.glowMat();
  const flashMesh = new THREE.Mesh((() => { const g = new THREE.ConeGeometry(0.024, 0.065, 7, 1, true); g.rotateX(-Math.PI / 2); g.translate(0, 0, 0.032); return g; })(), flashMat);
  flashMesh.raycast = () => {}; flashMesh.visible = false; flashMesh.position.z = MZ + 0.045; gun.add(flashMesh);
  const flashGlow = E.glowPoints([V(0, 0, MZ + 0.055)], 0.28); gun.add(flashGlow);
  const flashLight = new THREE.PointLight(E.accent.getHex(), 0, 1.6, 2); flashLight.position.set(0, 0.01, MZ + 0.09); gun.add(flashLight); E.accentLights.push(flashLight);
  const fireball = makePlume(gun, V(0, 0, MZ + 0.045), V(0, 0, 1), 0.05, 0.05, 0.15, 11);
  const glPlume = makePlume(gun, V(0, GL.y, GL.z1), V(0, 0, 1), 0.06, 0.06, 0.12, 12, 'dry');
  let realOn = false;
  const muzzle = V(0, 0, MZ + 0.045);

  // ═════ cases and live rounds thrown from the ejection port; spent 40 mm cases dropped from the launcher ═════
  type Brass = { g: THREE.Group; line: THREE.Group; real: THREE.Group; v: THREE.Vector3; spin: THREE.Vector3; rest: boolean; bounced: boolean; r: number };
  const brass: Brass[] = [], CASE_R = 0.0048;
  const caseReal = new THREE.LatheGeometry(caseLathe.map(([r, y]) => new THREE.Vector2(r, y)), 16), noseReal = new THREE.LatheGeometry(noseLathe.map(([r, y]) => new THREE.Vector2(r, y)), 16);
  const caseLine = new THREE.CylinderGeometry(CASE_R, CASE_R, 0.045, 10), noseLine = new THREE.ConeGeometry(0.0029, 0.015, 10).translate(0, 0.03, 0);
  const glCaseReal = new THREE.LatheGeometry(caseLathe40.map(([r, y]) => new THREE.Vector2(r, y)), 20), glCaseLine = new THREE.CylinderGeometry(0.0212, 0.0212, 0.045, 12);
  let inHand = false, trigDelay = 30, flashGain = 1, brassMax = 14;
  let hold: RangeHold | null = null;
  const ground = (x: number, z: number) => hold ? hold.ground(x, z) : 0;
  const drop = (b: Brass) => { b.g.removeFromParent(); b.g.traverse(o => { const m = o as THREE.Mesh; if (m.geometry && m.geometry !== caseReal && m.geometry !== noseReal && m.geometry !== glCaseReal) m.geometry.dispose(); }); };
  function throwCase(kind: 'case' | 'live' | 'gl', at: THREE.Vector3, v: THREE.Vector3) {
    if (brass.length >= brassMax) drop(brass.shift()!);
    const g = new THREE.Group(), line = new THREE.Group(), real = new THREE.Group(); g.add(line, real); E.scene.add(g);
    if (kind === 'gl') add(line, glCaseLine.clone()); else { add(line, caseLine.clone()); if (kind === 'live') add(line, noseLine.clone()); }
    const pieces: [THREE.BufferGeometry, THREE.Material][] = kind === 'gl' ? [[glCaseReal, RM.alu]] : [[caseReal, RM.brass]];
    if (kind === 'live') pieces.push([noseReal, RM.copper]);
    for (const [geo, mat] of pieces) { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; real.add(m); }
    line.visible = !realOn; real.visible = realOn;
    gun.updateMatrixWorld();
    g.position.copy(gun.localToWorld(at.clone()));
    g.rotation.set(0, 0, Math.PI / 2); g.quaternion.premultiply(gun.quaternion);
    const r = () => Math.random() - 0.5;
    brass.push({ g, line, real, v: v.applyQuaternion(gun.quaternion), spin: V(r() * 30, r() * 20, 22 + r() * 10), rest: false, bounced: false, r: kind === 'gl' ? 0.021 : CASE_R });
  }
  const eject = (live: boolean) => { const r = () => Math.random() - 0.5; throwCase(live ? 'live' : 'case', V(-0.014, yy(168), zx(625) + carrierZ * 0.2), V(-1.7 + r() * 0.5, 0.7 + r() * 0.3, -0.15 + r() * 0.3)); };

  // ═════ magazines dropped in the hands ═════
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

  // ═════ grenades in flight: arm after 14 m, burst where they land (on the range), a dud before that ═════
  type Grenade = { g: THREE.Group; v: THREE.Vector3; p: THREE.Vector3; travelled: number; t: number; dud: boolean };
  const grenades: Grenade[] = [];
  const shellGeo = turn(shellLathe, 18);
  const ARM = 14, GL_SPEED = 76, GL_ELEV = 1.2 * DEG;                                                 // arming distance, muzzle velocity, its elevation over the sight line (on target at ~20 m)
  function launch() {
    gun.updateMatrixWorld(true);
    const g = new THREE.Group(), m = new THREE.Mesh(shellGeo, RM.od); g.add(m); E.scene.add(g);
    const p = gun.localToWorld(V(0, GL.y, GL.z1));
    const v = V(0, Math.sin(GL_ELEV), Math.cos(GL_ELEV)).transformDirection(gun.matrixWorld).multiplyScalar(GL_SPEED);
    g.position.copy(p); g.quaternion.copy(gun.quaternion);
    grenades.push({ g, v, p: p.clone(), travelled: 0, t: 0, dud: false });
  }

  // ═════ sound ═════
  const sfx = {
    shot() {
      snd.burst(0.17, 0.9, { freq: 2600, q: 0.5, attack: 0.001 }); snd.burst(0.5, 0.5, { type: 'lowpass', freq: 260 });
      snd.tone(70, 0.36, 0.36, { type: 'triangle', to: 36 }); snd.burst(0.02, 0.5, { freq: 5800, q: 0.7 });
      snd.click(0.03, 0.75); snd.tone(1150, 0.13, 0.022, { type: 'sine', to: 1500, at: 0.035 });       // bolt home, the buffer spring's twang
    },
    rackBack() { snd.burst(0.12, 0.1, { freq: 1800, q: 2.2 }); snd.click(0, 0.7); snd.tone(1200, 0.1, 0.02, { type: 'sine', to: 1500 }); },
    home() { snd.click(0, 0.55); snd.thunk(0.005); snd.tone(900, 0.05, 0.06, { type: 'square' }); snd.tone(1300, 0.12, 0.025, { type: 'sine', to: 1600, at: 0.01 }); },
    magOut() { snd.click(0, 1.15); snd.burst(0.05, 0.08, { freq: 950, q: 1.5, at: 0.04 }); },
    magIn() { snd.click(0.18, 0.8); snd.thunk(0.19); snd.tone(2000, 0.03, 0.05, { type: 'square', at: 0.22 }); },
    selector() { snd.click(0, 1.2); snd.tone(2900, 0.02, 0.03, { type: 'square' }); },
    cover() { snd.tone(2400, 0.02, 0.04, { type: 'square' }); snd.click(0.01, 1.3); },
    stock() { snd.click(0, 1.05); snd.click(0.05, 0.95); },
    mount() { snd.thunk(0); snd.click(0.04, 0.85); snd.click(0.12, 0.9); },
    assist() { snd.thunk(0); snd.click(0.01, 0.6); snd.tone(500, 0.04, 0.05, { type: 'square', at: 0.01 }); },
    thump() { snd.tone(95, 0.2, 0.5, { type: 'sine', to: 48 }); snd.burst(0.14, 0.4, { type: 'lowpass', freq: 420 }); snd.click(0.002, 0.45); },   // the M203's report
    glOpen() { snd.click(0, 0.5); snd.burst(0.08, 0.06, { freq: 800, q: 1.4 }); snd.tone(300, 0.06, 0.05, { type: 'square', at: 0.05 }); },
    glClose() { snd.thunk(0); snd.click(0.01, 0.55); },
    glSeat() { snd.burst(0.06, 0.05, { freq: 1100, q: 1.6 }); snd.tone(420, 0.05, 0.04, { type: 'triangle', at: 0.03 }); },
    dud() { snd.thunk(0); snd.tone(240, 0.12, 0.08, { type: 'triangle' }); },
  };

  // ═════ state ═════
  const st = {
    rounds: CAP, chamber: false, magIn: true, mode: 'safe' as Mode, locked: false, coverOpen: false,
    ext: 0.5, holo: false, magT: 0, extT: 0.5, swapT: 0, selT: 0, catchT: 0, coverT: 0,
    cycle: null as null | { kind: 'shot' | 'rack' | 'release'; t0: number; back: boolean; lock: boolean },
    shotAt: -1, trigAt: -1, holdUntil: -1, held: false, faAt: -1,
    gl: { loaded: true, spent: false, loading: -1, glShotAt: -1, inserted: false },
  };
  let carrierZ = 0, relAt = -1;
  const busy = () => !!st.cycle;

  function atRear(kind: 'shot' | 'rack' | 'release') {
    if (kind === 'shot') eject(false);
    else if (kind === 'rack' && st.chamber) eject(true);
    st.chamber = false;
  }
  function feed(): boolean {
    if (st.magIn && st.rounds > 0) { st.rounds--; st.chamber = true; return false; }
    return st.magIn;
  }
  const startCycle = (kind: 'shot' | 'rack' | 'release', t0: number) => { st.cycle = { kind, t0, back: false, lock: false }; if (!st.coverOpen) { st.coverOpen = true; sfx.cover(); } };
  const LOAD_S = 1.7;                                                                               // seconds to open, load and close the launcher

  const act = {
    fire() {
      if (busy()) return;
      st.trigAt = performance.now();
      if (st.mode === 'safe') { snd.click(0, 0.6); return say('safe · S selector'); }
      if (st.locked) return say('bolt locked back');
      if (!st.chamber) { snd.click(0, 0.7); return say('click · chamber empty'); }
      startCycle('shot', performance.now() + trigDelay);
      if (st.mode === 'auto' && !inHand) st.holdUntil = Math.max(st.holdUntil, performance.now() + 240);
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
    stock() { st.ext = st.ext > 0.4 ? 0 : 1; },
    optic() { if (st.swapT > 0 && st.swapT < 1) return; st.holo = !st.holo; sfx.mount(); },
    assist() { st.faAt = performance.now(); sfx.assist(); if (!busy() && !st.locked) say(st.chamber ? 'bolt home' : 'bolt forward on an empty chamber'); },
    cover() {
      if (!st.coverOpen) return say('the cover is shut');
      if (busy() || st.locked) return say('the bolt must be forward');
      st.coverOpen = false; sfx.cover();
    },
    load() {
      if (st.gl.loading >= 0) return;
      if (st.gl.loaded) return say('M203 loaded · B fires it');
      st.gl.loading = performance.now(); st.gl.inserted = false; sfx.glOpen();
    },
    launch() {
      if (st.gl.loading >= 0) return;
      if (!st.gl.loaded) { snd.click(0, 0.5); return say(st.gl.spent ? 'M203 empty · N reloads' : 'M203 empty · N loads'); }
      st.gl.loaded = false; st.gl.spent = true; st.gl.glShotAt = performance.now(); sfx.thump(); launch();
      if (!inHand) say('40 mm away');
    },
    range() {},
    demo() {},
  } satisfies Record<string, () => void>;

  // ═════ the range ═════
  const rangeGun: RangeGun = {
    name: 'M4A1', calibre: '5.56×45 mm', root: gun, kind: 'rifle',
    sight: IRON, muzzle, relief: 0.085,
    optic: () => st.holo && st.swapT > 0.99 ? HOLO : null,
    grip: { web: V(0, yy(276), zx(372)), down: V(0, -0.89, -0.45).normalize(), length: 0.1, depth: 0.048, half: 0.0135, trigger: V(0, yy(290), zx(492)), thumbY: -0.012, frameHalf: LX, fingers: 0.024 },
    fore: { at: V(0, GL.y, 0.41), r: GL.r + 0.002, dir: V(0, 0, 1) },                                // the support hand holds the launcher's barrel
    hip: V(0.185, -0.136, -0.104),
    recoil: { rise: 2.1 * DEG, push: 0.02, cam: 0.42 * DEG },
    trigger() {
      if (busy()) return 'busy';
      const r = st.mode === 'safe' ? 'safe' : st.locked ? 'locked' : !st.chamber ? 'click' : 'shot';
      if (r !== 'locked') act.fire();
      return r;
    },
    auto: () => st.mode === 'auto',
    loud: () => 1,
    keys: [['N', 'load the M203'], ['B', 'fire the M203'], ['O', 'holo / carry handle']],
    magazine() { act.magazine(); },
    rack() { act.rack(); },
    safety() { act.selector(); },
    night() {},
    state: () => ({ rounds: st.rounds, cap: CAP, chamber: st.chamber, magIn: st.magIn, safe: st.mode === 'safe', locked: st.locked, busy: busy() || (st.magT > 0 && st.magT < 1), night: false, mode: st.mode }),
    hold(on, o) {
      inHand = on; trigDelay = on ? 0 : 30; flashGain = on ? 24 : 1; flashLight.distance = on ? (o?.flash ?? 12) : 1.6; brassMax = on ? 50 : 14;
      hold = on && o ? o : null;
      if (on) { st.ext = 0.6; st.holdUntil = -1; st.held = false; st.mode = 'safe'; }
      else {
        gun.position.set(0, GY, 0); gun.quaternion.identity();
        brass.forEach(drop); brass.length = 0; mags.forEach(m => m.g.removeFromParent()); mags.length = 0;
        grenades.forEach(g => g.g.removeFromParent()); grenades.length = 0;
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
    const idle = () => !busy() && st.extT === st.ext && st.gl.loading < 0 && [st.magT, st.swapT].every(t => t === 0 || t === 1) && performance.now() > st.holdUntil;
    const setMode = (m: Mode) => { while (st.mode !== m) act.selector(); };
    const steps: [() => void, number][] = [
      [() => { if (st.holo) act.optic(); setMode('safe'); }, 600],
      [() => { if (st.magIn) act.magazine(); }, 700],
      [() => act.magazine(), 800],
      [() => act.rack(), 800],
      [() => setMode('semi'), 600],
      [() => act.fire(), 360], [() => act.fire(), 360], [() => act.fire(), 700],
      [() => setMode('auto'), 600],
      [() => { st.holdUntil = performance.now() + 450; act.fire(); }, 900],
      [() => setMode('safe'), 600],
      [() => { if (!st.gl.loaded) act.load(); }, 600],
      [() => act.launch(), 900],
      [() => act.load(), 900],
      [() => act.optic(), 1400],
      [() => act.optic(), 1400],
      [() => act.stock(), 900],
      [() => act.stock(), 900],
      [() => { act.cover(); script.end(); }, 0],
    ];
    const step = (i: number) => when(idle, () => { steps[i][0](); if (i + 1 < steps.length) later(steps[i][1], () => step(i + 1)); });
    step(0);
  };

  // ═════ per frame ═════
  const flashK = (now: number) => st.shotAt < 0 || now < st.shotAt ? 0 : Math.exp(-(now - st.shotAt) / 22);
  const glFlashK = (now: number) => st.gl.glShotAt < 0 ? 0 : Math.exp(-(now - st.gl.glShotAt) / 40);
  const tmp = V(0, 0, 0);
  function tick(now: number, dt: number) {
    if (wantRange && realOn && !rng?.on) openRange();
    rng?.tick(now, dt);
    st.magT = approach(st.magT, st.magIn ? 0 : 1, (st.magIn ? 2.4 : 4.2) * dt);
    const e0 = st.extT; st.extT = approach(st.extT, st.ext, 1.8 * dt);
    if (Math.floor(e0 * 4) !== Math.floor(st.extT * 4)) sfx.stock();
    st.swapT = approach(st.swapT, st.holo ? 1 : 0, 1.1 * dt);
    st.selT = approach(st.selT, MODES.indexOf(st.mode), 9 * dt);
    st.catchT = approach(st.catchT, st.locked ? 1 : 0, 12 * dt);
    st.coverT = approach(st.coverT, st.coverOpen ? 1 : 0, (st.coverOpen ? 14 : 6) * dt);

    if (!inHand && st.mode === 'auto' && (st.held || now < st.holdUntil) && !busy() && st.chamber && !st.locked) startCycle('shot', now);

    // bolt carrier
    let z = st.locked ? -LOCK : 0;
    const c = st.cycle;
    if (c) {
      const t = (now - c.t0) / 1000;
      const [tb, tf] = c.kind === 'shot' ? [0.024, 0.046] : c.kind === 'rack' ? [0.17, 0.15] : [0.0, 0.07];
      if (t >= 0) {
        if (c.kind === 'shot' && st.shotAt < c.t0) { st.shotAt = c.t0; sfx.shot(); }
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
    chargeG.position.z = c && c.kind === 'rack' ? z * 1.02 : 0;
    cover.set(st.coverT * 105 * DEG);

    // controls
    const tt = st.trigAt < 0 ? 1 : (now - st.trigAt) / 1000, firing = st.shotAt > 0 && now - st.shotAt < 90;
    trig.set((tt < 0.05 ? tt / 0.05 : firing || (st.held && st.mode === 'auto') ? 1 : clamp01(1 - (tt - 0.08) / 0.12)) * 11 * DEG);
    selH.set(-st.selT * 90 * DEG);
    catchG.position.y = st.catchT * 0.0028;
    rel.position.x = relAt < 0 ? 0 : 0.0012 * Math.max(0, 1 - (now - relAt) / 180);
    const fa = st.faAt < 0 ? 1 : (now - st.faAt) / 1000;
    faG.position.set(0, 0.0012, 0.0045).multiplyScalar(fa < 0.06 ? fa / 0.06 : clamp01(1 - (fa - 0.06) / 0.12));
    slide.position.z = -STOCK_RUN * st.extT;
    // the carry handle lifts off and the holographic sight comes down onto the rail in its place (or back)
    const s = st.swapT, off = phase(s, 0, 0.5), on = phase(s, 0.5, 1);
    carryG.position.y = off * 0.1; carryG.visible = s < 0.5;
    opticG.position.y = (1 - on) * 0.1; opticG.visible = s > 0.5;
    const lit = st.holo && s > 0.99;
    reticleMat.emissiveIntensity = lit && !inHand ? 1.6 : 0; reticle.visible = !inHand;
    reticleGlow.material.uniforms.intensity.value = lit && !inHand ? 0.5 : 0;

    // the launcher: open (the barrel slides forward, a spent case falls), the round goes in, it closes
    let gOpen = 0;
    if (st.gl.loading >= 0) {
      const t = (now - st.gl.loading) / 1000 / LOAD_S;
      gOpen = phase(t, 0, 0.22) * (1 - phase(t, 0.72, 0.92));
      if (st.gl.spent && t > 0.24) { st.gl.spent = false; const r = () => Math.random() - 0.5; throwCase('gl', V(0, GL.y - 0.01, GL.z0 + 0.03), V(r() * 0.3, -0.4, -0.2)); sfx.glSeat(); }
      if (!st.gl.inserted && t > 0.62) { st.gl.inserted = true; sfx.glSeat(); }
      if (t >= 1) { st.gl.loading = -1; st.gl.loaded = true; sfx.glClose(); say('M203 loaded'); }
      round.visible = t > 0.3;
      const ins = phase(t, 0.3, 0.62);                                                            // in from the left, into the open breech
      round.position.set((1 - ins) * 0.07, (1 - ins) * -0.01, 0);
    } else { round.visible = st.gl.loaded || st.gl.spent; round.position.set(0, 0, 0); }
    round.position.add(CHAMBER);
    glBarrel.position.z = GL.open * gOpen;
    const shell = !st.gl.spent || st.gl.loading >= 0;                                            // a spent case has no projectile
    round.children.forEach((o, i) => { if (i > 0) o.visible = shell && (i < 3 || realOn); });

    // flashes
    const fk = flashK(now);
    flashMesh.visible = !realOn && fk > 0.04; flashMat.emissiveIntensity = 2.4 * fk; flashMesh.scale.setScalar(0.8 + fk * 0.7);
    flashGlow.material.uniforms.intensity.value = fk * 1.4;
    flashLight.intensity = (fk + glFlashK(now) * 0.6) * flashGain * 1.3;
    bench.shadowMat.uniforms.opacity.value = E.shadowStrength() * 0.8;

    // grenades: ballistic, each frame's segment tested against the hall; arm at 14 m
    for (let i = grenades.length - 1; i >= 0; i--) {
      const gr = grenades[i];
      gr.t += dt;
      const prev = gr.p.clone();
      gr.v.y -= 9.8 * dt; gr.p.addScaledVector(gr.v, dt);
      gr.g.position.copy(gr.p); gr.g.lookAt(tmp.copy(gr.p).add(gr.v));
      const seg = gr.p.distanceTo(prev);
      const hit = hold ? hold.cast(prev, gr.p) : null;
      if (hit) {
        gr.travelled += prev.distanceTo(hit.point);
        if (gr.travelled >= ARM) hold!.blast(hit.point, hit.normal);
        else { sfx.dud(); say('dud · inside its 14 m arming distance'); }
        gr.g.removeFromParent(); grenades.splice(i, 1); continue;
      }
      gr.travelled += seg;
      if (gr.t > (hold ? 3 : 0.5)) { gr.g.removeFromParent(); grenades.splice(i, 1); }
    }

    // brass: thrown, tumbling, one bounce, then at rest on its side
    for (const b of brass) {
      if (b.rest) continue;
      b.v.y -= 9.8 * dt;
      b.g.position.addScaledVector(b.v, dt);
      b.g.rotation.x += b.spin.x * dt; b.g.rotation.y += b.spin.y * dt; b.g.rotation.z += b.spin.z * dt;
      const gy = ground(b.g.position.x, b.g.position.z) + b.r;
      if (b.g.position.y <= gy) {
        b.g.position.y = gy;
        if (!b.bounced && b.v.y < -0.4) { b.bounced = true; b.v.set(b.v.x * 0.32, -b.v.y * 0.24, b.v.z * 0.32); b.spin.multiplyScalar(0.3); snd.tone(b.r > 0.01 ? 900 : 2700, 0.08, 0.03); }
        else { b.rest = true; b.g.rotation.set(0, b.g.rotation.y, Math.PI / 2); snd.tone(b.r > 0.01 ? 800 : 2500, 0.05, 0.015); }
      }
    }
    for (const m of mags) {
      if (m.rest) continue;
      m.v.y -= 9.8 * dt; m.g.position.addScaledVector(m.v, dt); m.g.rotation.x += m.spin * dt;
      const gy = ground(m.g.position.x, m.g.position.z) + 0.0125;
      if (m.g.position.y <= gy) { m.g.position.y = gy; m.rest = true; m.g.rotation.set(0, m.g.rotation.y, Math.PI / 2); snd.tone(760, 0.07, 0.05); snd.thunk(0); }
    }
  }

  function readout() {
    if (rng?.on) return 'range · lane 3';
    const p: string[] = [];
    p.push(st.magIn ? `${st.rounds} in magazine` : 'magazine out');
    p.push(st.chamber ? 'round chambered' : 'chamber empty');
    p.push(st.locked ? 'bolt locked back' : st.mode);
    p.push(st.holo ? 'holo sight' : 'carry handle');
    p.push(st.gl.loading >= 0 ? 'm203 loading' : st.gl.loaded ? 'm203 loaded' : 'm203 empty');
    return p.join(' · ');
  }

  const real: RealSpec = {
    focus: V(0, 0.15, 0.2), size: 1.05, hide: [bench.deck], bench: MAT,
    materials: { ...RM, body: RM.anod },
    lamps: [[reticleMat, 'red']],
    only: { line: [], real: realOnly },
    stage: () => rng?.stage() ?? null,
    onStyle(on) {
      realOn = on;
      if (on && !rng) openRange();
      if (!on) { wantRange = false; rng?.exit(); }
      for (const b of brass) { b.line.visible = !on; b.real.visible = on; }
      if (!on) { fireball.set(0, 0); glPlume.set(0, 0); flashLight.color.copy(E.accent); }
    },
    tick(now) { fireball.set(flashK(now), now); glPlume.set(glFlashK(now), now); flashLight.color.setHex(0xffa24a); },
  };

  if (arrive === 'range') setTimeout(() => act.range(), 0);

  return {
    pickRoot: gun, parts: K.parts, real,
    view: { target: V(0, 0.19, 0.19), dist: 1.8, min: 0.35, max: 6 },
    actions: act, passive: [],
    keyDown(k, e) {
      if (rng?.on) return rng.keyDown(k, e);
      if (k === 'f') { if (!e.repeat) { st.held = true; act.fire(); } return true; }
      return false;
    },
    keyUp(k) { if (rng?.on) rng.keyUp(k); if (k === 'f') st.held = false; },
    blur() { rng?.blur(); st.held = false; },
    hud: () => rng?.hud() ?? null,
    on: () => ({ range: !!rng?.on, demo: script.active, fire: !!st.cycle && st.cycle.kind === 'shot', rack: st.locked, magazine: st.magIn, selector: st.mode !== 'safe', stock: st.ext > 0.4, optic: st.holo, load: st.gl.loaded, launch: st.gl.glShotAt > 0 && performance.now() - st.gl.glShotAt < 300 }),
    tick, readout,
    dispose() {
      rng?.dispose(); mags.forEach(m => m.g.removeFromParent()); grenades.forEach(g => g.g.removeFromParent());
      brass.forEach(drop);
      RTex.forEach(t => t.dispose()); Object.values(RM).forEach(m => m.dispose());
      decalMats.forEach(m => { (m as THREE.MeshStandardMaterial).map?.dispose(); m.dispose(); });
      [caseReal, noseReal, caseLine, noseLine, glCaseReal, glCaseLine, shellGeo].forEach(g => g.dispose());
    },
  };
};

export default model;
