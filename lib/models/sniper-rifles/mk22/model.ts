// Mk 22 Advanced Sniper Rifle: a bolt action that works (lift, back, eject, forward, down), a detachable 10-round
// magazine, an ambidextrous safety, a skeleton stock that folds to the right, a bipod that folds forward under the
// handguard, a muzzle brake that takes a suppressor sliding over it, a 5–25× scope whose elevation cap turns as the range
// dials it, and the rifle's party piece, a change of calibre: barrel, magazine and cartridge swap between .300 Norma
// Magnum, .338 Norma Magnum and 7.62×51 mm, each with its own barrel length, muzzle velocity and drag.
// Coordinates in metres: +z toward the muzzle, +y up, +x to the rifle's left; the bore axis is y = 0 and z = 0 is the
// back of the receiver (the stock hinge). Like every small arm it floats raised above its mat.
// Receiver, stock, grip, magazine, handguard, barrel, brake and bipod are traced from a right-side photograph
// (2600 × 601) at 0.50 mm per pixel both ways, from the top rail's 10.01 mm Picatinny slot pitch (20 px; the length
// comes out at 1,243 mm against the real rifle's 1,257 mm). Profiles are written in that photo's pixels (ix, iy) and
// converted by `px`; its muzzle points right, so z grows with ix. The scope and the suppressor follow a second photo,
// scaled from where the receiver and handguard sit in both.
// Accent (live) parts: the flashes. Real view: Flat Dark Earth Cerakote on the receivers, stock, barrel, scope and
// suppressor, black polymer furniture and magazine, a blackened brake, glass with an anti-reflection sheen.
// Range (key G, Real view): the long-distance field outdoors (lib/range/field.ts): seated at the bench on the bipod,
// through the scope's milliradian reticle, the turret dialled with U and J, steel out to 1000 m.
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

const CAP = 10;
const GY = 0.32;                                            // bore axis above the mat
const MAT = { w: 0.5, d: 1.62, cx: 0, cz: 0.5 };            // the bench mat under the rifle (both styles)
const BOLT_RUN = 0.1, BOLT_LIFT = -60 * DEG;                // the bolt's travel and its lift
const MAG_DROP = GY - 0.16;
/** the three calibres: the barrel's change of length from the .300's 26 in, the cartridge's size, its flight */
const CALS = {
  nm300: { short: '.300 Norma Mag', mark: 'CAL .300 NORMA MAG', inch: 26, dz: 0, size: 1, v0: 869, k: 0.000476 },
  nm338: { short: '.338 Norma Mag', mark: 'CAL .338 NORMA MAG', inch: 27, dz: 0.0254, size: 1.05, v0: 808, k: 0.000367 },
  nato: { short: '7.62×51 mm', mark: 'CAL 7.62 MM NATO', inch: 24, dz: -0.0508, size: 0.8, v0: 790, k: 0.00068 },
} as const;
type Cal = keyof typeof CALS;
const CAL_ORDER: Cal[] = ['nm300', 'nm338', 'nato'];

// ── the photograph's pixels → rifle metres ──
const PX = 0.5e-3, IX0 = 500, IY0 = 117;                    // scale; the back of the receiver and the bore axis
const zx = (ix: number) => (ix - IX0) * PX, yy = (iy: number) => (IY0 - iy) * PX;
type Cmd = ['M', number, number] | ['L', number, number] | ['Q', number, number, number, number];
const px = (cmds: Cmd[]): Cmd[] => cmds.map(c => c[0] === 'Q' ? ['Q', zx(c[1]), yy(c[2]), zx(c[3]), yy(c[4])] : [c[0], zx(c[1]), yy(c[2])]);
const trace = (p: THREE.Path, cmds: Cmd[]) => cmds.forEach(c => c[0] === 'M' ? p.moveTo(c[1], c[2]) : c[0] === 'L' ? p.lineTo(c[1], c[2]) : p.quadraticCurveTo(c[1], c[2], c[3], c[4]));
const profile = (cmds: Cmd[], holes: Cmd[][] = []) => {
  const s = new THREE.Shape(); trace(s, px(cmds));
  holes.forEach(h => { const p = new THREE.Path(); trace(p, px(h)); s.holes.push(p); });
  return s;
};
/** a rounded rectangle in photo pixels (x0, y0)–(x1, y1) */
const rr = (x0: number, y0: number, x1: number, y1: number, r: number): Cmd[] => [
  ['M', x0 + r, y0], ['L', x1 - r, y0], ['Q', x1, y0, x1, y0 + r], ['L', x1, y1 - r], ['Q', x1, y1, x1 - r, y1],
  ['L', x0 + r, y1], ['Q', x0, y1, x0, y1 - r], ['L', x0, y0 + r], ['Q', x0, y0, x0 + r, y0],
];
const across = (s: THREE.Shape, x0: number, x1: number, bevel = 0.001, segs = 1) => {
  const g = new THREE.ExtrudeGeometry(s, { depth: x1 - x0 - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: segs, curveSegments: 10 });
  g.rotateY(-Math.PI / 2); g.translate(x1 - bevel, 0, 0);
  return g;
};
const turn = (pts: [number, number][], segs: number, x = 0, y = 0) => {
  const g = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), segs);
  g.rotateX(Math.PI / 2); g.translate(x, y, 0); return g;
};
const cylZ = (r: number, z0: number, z1: number, segs = 16, x = 0, y = 0) => { const g = new THREE.CylinderGeometry(r, r, z1 - z0, segs); g.rotateX(Math.PI / 2); g.translate(x, y, (z0 + z1) / 2); return g; };
const cylX = (r: number, x0: number, x1: number, y: number, z: number, segs = 16) => { const g = new THREE.CylinderGeometry(r, r, Math.abs(x1 - x0), segs); g.rotateZ(Math.PI / 2); g.translate((x0 + x1) / 2, y, z); return g; };
const cylY = (r: number, y0: number, y1: number, x: number, z: number, segs = 16) => new THREE.CylinderGeometry(r, r, y1 - y0, segs).translate(x, (y0 + y1) / 2, z);
const rbox = (w: number, h: number, d: number, x: number, y: number, z: number, r = Math.min(w, h, d) * 0.3) => new RoundedBoxGeometry(w, h, d, 2, r).translate(x, y, z);
const holeXY = (x: number, y: number, r: number) => { const p = new THREE.Path(); p.absarc(x, y, r, 0, Math.PI * 2, true); return p; };
/** a cylinder between two points */
const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, segs = 8) => {
  const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), segs);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
};

// ── side profiles, in the photo's pixels ──
/** the stock's skeleton frame: a top member under the cheek piece, the hinge block, a lower loop, five windows */
const FRAME: Cmd[] = [['M', 138, 114], ['Q', 138, 106, 146, 106], ['L', 186, 106], ['L', 186, 118], ['L', 470, 118], ['L', 470, 108], ['L', 492, 108], ['L', 492, 226], ['L', 340, 226], ['Q', 330, 240, 334, 262], ['L', 338, 300], ['Q', 344, 322, 330, 340], ['Q', 318, 350, 300, 350], ['L', 150, 350], ['Q', 138, 350, 138, 338]];
const FRAME_HOLES: Cmd[][] = [rr(150, 112, 182, 132, 5), rr(158, 168, 216, 214, 10), [['M', 228, 136], ['L', 252, 136], ['Q', 264, 186, 292, 212], ['L', 234, 212], ['Q', 228, 212, 228, 205]],
  [['M', 322, 132], ['L', 414, 128], ['L', 330, 206], ['Q', 322, 208, 322, 200]], rr(204, 224, 300, 246, 10), rr(186, 300, 312, 340, 12)];
const RISER: Cmd[] = [['M', 180, 104], ['Q', 180, 94, 192, 94], ['L', 460, 94], ['Q', 472, 96, 470, 108], ['L', 466, 122], ['L', 300, 128], ['Q', 288, 170, 300, 212], ['L', 290, 222], ['Q', 262, 200, 250, 140], ['L', 200, 130], ['Q', 182, 128, 180, 116]];
const BUTT: Cmd[] = [['M', 42, 122], ['Q', 42, 106, 58, 106], ['L', 138, 106], ['L', 138, 350], ['L', 58, 350], ['Q', 42, 350, 42, 334]];
/** the receiver section of the upper; its right half has the bolt-handle raceway and the ejection port cut through */
const RECV: Cmd[] = [['M', 502, 92], ['Q', 502, 83, 512, 83], ['L', 712, 83], ['L', 734, 58], ['L', 1090, 58], ['L', 1090, 200], ['L', 502, 200]];
const RACEWAY = rr(508, 101, 782, 122, 8), PORT = rr(873, 92, 1072, 128, 8);
/** the handguard's side walls (hollow: the barrel shows through its slots) */
const HG_SIDE: Cmd[] = [['M', 1088, 58], ['L', 1948, 58], ['Q', 1956, 60, 1956, 70], ['L', 1936, 190], ['L', 1088, 190]];
const HG_SLOTS: Cmd[][] = [
  ...Array.from({ length: 12 }, (_, k) => rr(1296 + k * 53, 96, 1324 + k * 53, 104, 4)),
  ...Array.from({ length: 5 }, (_, k) => rr(1288 + k * 85, 124, 1346 + k * 85, 133, 4)),
  ...Array.from({ length: 12 }, (_, k) => rr(1262 + k * 53, 154, 1290 + k * 53, 162, 4)),
];
const LOWER: Cmd[] = [['M', 505, 200], ['L', 1088, 200], ['L', 1088, 256], ['L', 904, 256], ['Q', 884, 262, 876, 300], ['L', 860, 313], ['L', 728, 313], ['Q', 720, 313, 720, 305], ['L', 720, 248], ['L', 700, 240], ['L', 612, 214], ['L', 505, 214]];
const GUARD_HOLE = rr(740, 244, 840, 300, 8);
const GRIP: Cmd[] = [['M', 602, 212], ['L', 700, 240], ['Q', 718, 246, 718, 262], ['L', 717, 300], ['Q', 714, 330, 698, 352], ['L', 670, 392], ['Q', 660, 412, 657, 440], ['L', 612, 436], ['Q', 570, 424, 563, 404], ['Q', 566, 392, 580, 372], ['L', 598, 330], ['Q', 605, 300, 605, 270]];
const TRIGGER: Cmd[] = [['M', 746, 250], ['L', 756, 250], ['Q', 756, 276, 770, 296], ['Q', 771, 302, 765, 300], ['Q', 748, 282, 746, 250]];
const MAG: Cmd[] = [['M', 890, 212], ['L', 1078, 212], ['L', 1084, 330], ['Q', 1085, 344, 1072, 346], ['L', 902, 346], ['Q', 888, 346, 888, 333]];
const MAGREL: Cmd[] = [['M', 846, 300], ['L', 858, 296], ['L', 872, 326], ['L', 864, 330]];
/** lower-receiver panels and the upper's long recess, as outlines (and shallow recesses in the Real view) */
const PANELS: [number, number, number, number][] = [[880, 177, 935, 195], [946, 177, 1003, 195], [1014, 177, 1072, 195], [880, 205, 935, 245], [946, 205, 1003, 245], [1014, 205, 1072, 245], [1140, 117, 1280, 135]];
const MAG_C = new THREE.Vector3(0, yy(290), zx(985));
// ── the scope: its axis 85 mm over the bore, eyepiece to objective bell 389 mm (a 5–25×56 with a 35 mm tube) ──
const SY = 0.085, SZ0 = zx(670), SZ1 = zx(1448), TURRET_Z = zx(955);
const SCOPE: OpticSight = { rear: new THREE.Vector3(0, SY, SZ0), front: new THREE.Vector3(0, SY, SZ1), relief: 0.09, zoom: [5, 25], reticle: 'mil' };
const RAIL_TOP = yy(52);

/** finishes for the Real view, by tag; untagged meshes get the FDE Cerakote */
function realMaterials() {
  const tex: THREE.Texture[] = [];
  const canvasTex = (n: number, draw: (x: CanvasRenderingContext2D, n: number) => void, rep: number) => {
    const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d')!, n);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.setScalar(rep); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
    tex.push(t); return t;
  };
  const grain = canvasTex(128, (x, n) => { const img = x.createImageData(n, n); for (let i = 0; i < img.data.length; i += 4) { const v = 112 + Math.random() * 30; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; } x.putImageData(img, 0, 0); }, 150);
  // the grip's moulded texture: fine pebbling
  const pebble = canvasTex(64, (x, n) => { x.fillStyle = '#808080'; x.fillRect(0, 0, n, n); for (let i = 0; i < 260; i++) { x.fillStyle = Math.random() < 0.5 ? '#d8d8d8' : '#303030'; x.beginPath(); x.arc(Math.random() * n, Math.random() * n, 1 + Math.random() * 1.6, 0, Math.PI * 2); x.fill(); } }, 50);
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  const fdeP = { metalness: 0.2, roughness: 0.62, bumpMap: grain, bumpScale: 0.12, clearcoat: 0.06, clearcoatRoughness: 0.6 };
  const M = {
    fde: new THREE.MeshPhysicalMaterial({ color: 0x9c7d55, ...fdeP }),
    scopeFde: new THREE.MeshPhysicalMaterial({ color: 0x8f7a5c, ...fdeP, roughness: 0.55 }),
    barrel: new THREE.MeshPhysicalMaterial({ color: 0x96784f, ...fdeP, roughness: 0.5 }),
    flute: std({ color: 0x5e4a30, metalness: 0.3, roughness: 0.6 }),
    poly: std({ color: 0x1d1e1f, roughness: 0.78, bumpMap: grain, bumpScale: 0.25 }),
    grip: std({ color: 0x1b1c1d, roughness: 0.9, bumpMap: pebble, bumpScale: 0.6 }),
    rubber: std({ color: 0x151616, roughness: 0.95, bumpMap: grain, bumpScale: 0.4 }),
    black: std({ color: 0x202122, metalness: 0.55, roughness: 0.45 }),
    bolt: std({ color: 0x3a3c3e, metalness: 0.85, roughness: 0.35 }),
    steel: std({ color: 0xa8acb0, metalness: 1, roughness: 0.3 }),
    sight: std({ color: 0x18191a, metalness: 0.3, roughness: 0.72 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x06090c, metalness: 0.15, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.6, iridescenceIOR: 1.5, iridescenceThicknessRange: [360, 560] }),
    brass: std({ color: 0xc9a04c, metalness: 1, roughness: 0.26, side: THREE.DoubleSide }),
    copper: std({ color: 0xb86a40, metalness: 1, roughness: 0.3 }),
    dark: std({ color: 0x0e0e0f, roughness: 0.9, side: THREE.DoubleSide }),
  };
  return { M, tex };
}

const model: ModelFactory = ({ E, snd, script, say, style, def, open, arrive }) => {
  const K = makeKit(E, { unit: 0.08 });
  const { add, part, hinge, box, well, lines } = K;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const gun = K.root; gun.position.y = GY;
  const bench = buildPlate(E, { ...MAT, grid: 0.01, ruler: true, shadow: [0.22, 1.3, 0, 0.45] });
  const { M: RM, tex: RTex } = realMaterials();
  const realOnly: THREE.Object3D[] = [], decalMats: THREE.Material[] = [];
  const realAdd = (parent: THREE.Object3D, geo: THREE.BufferGeometry, tag: string) => {
    const m = add(parent, geo, undefined, { real: tag, lines: false }); m.visible = false; realOnly.push(m); return m;
  };
  const UX = 0.026, LX = 0.022, WALL = 0.0045;                // half-widths: upper and handguard, lower; handguard wall

  // ═════ upper receiver: two halves (the raceway and port in the right one), the hollow handguard, the top rail ═════
  const pUpper = part('upper', gun);
  add(pUpper, across(profile(RECV), 0, UX, 0.0016, 3));
  add(pUpper, across(profile(RECV, [RACEWAY, PORT]), -UX, 0, 0.0016, 3));
  for (const [ix0, iy0, ix1, iy1] of [[508, 101, 782, 122], [873, 92, 1072, 128]] as const)                  // the dark inside behind the cuts
    well(pUpper, [V(-0.0004, yy(iy1), zx(ix1)), V(-0.0004, yy(iy1), zx(ix0)), V(-0.0004, yy(iy0), zx(ix0)), V(-0.0004, yy(iy0), zx(ix1))], V(-1, 0, 0));
  for (const k of SIDES) add(pUpper, across(profile(HG_SIDE, HG_SLOTS), k > 0 ? UX - WALL : -UX, k > 0 ? UX : -UX + WALL, 0.0008, 2));
  add(pUpper, box(-UX, UX, yy(70), yy(58), zx(1088), zx(1946)));                                           // the handguard's top
  add(pUpper, box(-UX, UX, yy(190), yy(182), zx(1088), zx(1936)));                                         // and its floor
  { const s = new THREE.Shape([[-UX + WALL, yy(184)], [UX - WALL, yy(184)], [UX - WALL, yy(68)], [-UX + WALL, yy(68)]].map(([a, b]) => new THREE.Vector2(a, b)));
    s.holes.push(holeXY(0, 0, 0.0125)); const g = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false }); g.translate(0, 0, zx(1936) - 0.006); add(pUpper, g); }   // front bulkhead round the barrel
  { const g: THREE.BufferGeometry[] = [];
    for (let z = zx(737); z < zx(1946); z += 0.01001) g.push(new THREE.BoxGeometry(0.0212, 0.003, 0.0052).translate(0, RAIL_TOP - 0.0015, z));
    add(pUpper, merge(g), undefined, { minLen: 0.002 }); }
  // accessory rails: one on the right of the handguard (for a laser or a light), one underneath for the bipod
  for (const [x0, x1, y0, y1] of [[-UX - 0.009, -UX, yy(152), yy(108)], [-0.0106, 0.0106, yy(205), yy(190)]] as const) {
    const side = x1 <= -UX + 1e-6;
    add(pUpper, box(x0, x1, y0, y1, zx(1700), zx(1880)), undefined, { real: 'black' });
    const t: THREE.BufferGeometry[] = [];
    for (let z = zx(1706); z < zx(1876); z += 0.01001) t.push(side ? new THREE.BoxGeometry(0.003, y1 - y0 + 0.002, 0.0052).translate(x0 - 0.0012, (y0 + y1) / 2, z) : new THREE.BoxGeometry(x1 - x0 + 0.001, 0.003, 0.0052).translate(0, y0 - 0.0012, z));
    add(pUpper, merge(t), undefined, { real: 'black', minLen: 0.002 });
  }
  for (const ix of [1715, 1790, 1865]) add(pUpper, cylX(0.0032, -UX - 0.0105, -UX - 0.009, yy(130), zx(ix), 10), undefined, { real: 'steel' });
  for (const ix of [1155, 1215]) add(pUpper, cylX(0.0042, -UX - 0.0012, -UX, yy(170), zx(ix), 12), undefined, { real: 'black' });    // barrel clamp screws
  for (const [ix0, iy0, ix1, iy1] of PANELS) {
    const x = -(iy0 < 200 && ix0 > 1100 ? UX : iy0 < 200 ? UX : LX) - 0.0003;
    pUpper.add(E.loopLine([V(x, yy(iy0), zx(ix0)), V(x, yy(iy0), zx(ix1)), V(x, yy(iy1), zx(ix1)), V(x, yy(iy1), zx(ix0))], E.mats.line));
  }
  // the hinge knuckles the stock folds on (on the right, outboard)
  add(pUpper, merge([cylY(0.007, yy(212), yy(176), -0.042, zx(488), 12), cylY(0.007, yy(150), yy(112), -0.042, zx(488), 12)]), undefined, { real: 'black' });
  add(pUpper, box(-0.042, -UX + 0.002, yy(214), yy(110), zx(488) - 0.005, zx(500)));

  // ═════ lower receiver, trigger guard, magazine release ═════
  const pLower = part('lower', gun);
  add(pLower, across(profile(LOWER, [GUARD_HOLE]), -LX, LX, 0.0014, 3));
  add(pLower, across(profile(MAGREL), -0.006, 0.006, 0.0008, 2), undefined, { real: 'black' });

  // ═════ grip, trigger, safety (right side lever, its shaft through) ═════
  const pGrip = part('grip', gun);
  add(pGrip, across(profile(GRIP), -0.0145, 0.0145, 0.004, 4), undefined, { real: 'grip' });
  const pTrig = part('trigger', gun);
  const trig = hinge(pTrig, V(0, yy(250), zx(751)), V(1, 0, 0), 'x');
  add(trig.inner, across(profile(TRIGGER), -0.003, 0.003, 0.0006, 3), undefined, { real: 'black' });
  const pSafe = part('safety', gun), SAF = V(0, yy(210), zx(686));
  const safeH = hinge(pSafe, SAF, V(1, 0, 0), 'x');
  for (const k of SIDES) {
    const xs = k * (LX + 0.0002), xo = k * (LX + 0.0026);
    add(safeH.inner, merge([cylX(0.0045, xs, xo, SAF.y, SAF.z, 14), rbox(0.0024, 0.005, 0.02, (xs + xo) / 2, SAF.y, SAF.z - 0.011, 0.001)]), undefined, { real: 'black' });
  }

  // ═════ the bolt: body, shroud, handle and knob; it lifts about the bore and runs back in the receiver ═════
  const pBolt = part('bolt', gun);
  const boltSlide = new THREE.Group(); pBolt.add(boltSlide);
  const boltLift = new THREE.Group(); boltSlide.add(boltLift);
  add(boltLift, cylZ(0.0095, zx(700), zx(1072), 18), undefined, { real: 'bolt' });
  add(boltLift, turn([[0, zx(1072)], [0.0085, zx(1072)], [0.0095, zx(1066)]], 18), undefined, { real: 'bolt' });
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; add(boltLift, rbox(0.006, 0.006, 0.014, Math.cos(a) * 0.0098, Math.sin(a) * 0.0098, zx(1058), 0.0015), undefined, { real: 'bolt' }); }   // locking lugs
  { const root = V(-0.0092, 0.002, zx(792)), out = V(-0.033, -0.004, zx(800)), knob = V(-0.05, yy(247), zx(786));
    add(boltLift, merge([rod(root, out, 0.0052, 10), rod(out, knob, 0.0048, 10), rbox(0.014, 0.012, 0.016, -0.012, 0.002, zx(792), 0.003)]), undefined, { real: 'black' });
    add(boltLift, new THREE.IcosahedronGeometry(0.0115, 1).translate(knob.x, knob.y, knob.z), undefined, { real: 'black' }); }

  // ═════ the stock: frame, cheek piece, butt pad; it folds to the right on the hinge ═════
  const pStock = part('stock', gun), HINGE = V(-0.042, 0, zx(488));
  const fold = new THREE.Group(); fold.position.copy(HINGE); pStock.add(fold);
  const stockG = new THREE.Group(); stockG.position.copy(HINGE).negate(); fold.add(stockG);
  add(stockG, across(profile(FRAME, FRAME_HOLES), -0.016, 0.016, 0.003, 4));
  for (const [ix, iy] of [[165, 236], [256, 309], [400, 200]] as const) add(stockG, cylX(0.0055, -0.0175, 0.0175, yy(iy), zx(ix), 14), undefined, { real: 'black' });   // adjuster knobs and pins
  const pCheek = part('cheek', stockG);
  add(pCheek, across(profile(RISER), -0.018, 0.018, 0.003, 4), undefined, { real: 'poly' });
  const pButt = part('buttpad', stockG);
  add(pButt, across(profile(BUTT), -0.024, 0.024, 0.004, 4), undefined, { real: 'rubber' });
  for (const k of SIDES) lines(pButt, [[V(k * 0.0242, yy(112), zx(100)), V(k * 0.0242, yy(344), zx(100))]]);
  add(pButt, rbox(0.006, 0.03, 0.014, -0.024, yy(240), zx(120), 0.002), undefined, { real: 'black' });            // the length-of-pull button

  // ═════ magazine and the round on top of it ═════
  const pMag = part('magazine', gun);
  const magShell = new THREE.Group(); pMag.add(magShell);
  add(magShell, across(profile(MAG), -0.0185, 0.0185, 0.0018, 3), undefined, { real: 'poly' });
  { const g: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) g.push(new THREE.BoxGeometry(0.039, 0.003, 0.004).translate(0, yy(268 + i * 9), zx(1084) + 0.0005));   // the ribbed front
    add(magShell, merge(g), undefined, { real: 'poly', minLen: 0.002 }); }
  for (const k of SIDES) pMag.add(E.loopLine([V(k * 0.0187, yy(266), zx(905)), V(k * 0.0187, yy(266), zx(1060)), V(k * 0.0187, yy(330), zx(1062)), V(k * 0.0187, yy(330), zx(907))], E.mats.line));
  const caseLathe = (s: number) => ([[0, -0.032], [0.00675, -0.032], [0.00675, -0.0308], [0.006, -0.0302], [0.006, -0.0292], [0.00745, -0.0285], [0.00715, 0.0215], [0.0042, 0.0262], [0.0042, 0.032], [0.0039, 0.032], [0.0039, 0.028]] as [number, number][]).map(([r, y]) => [r * Math.min(1, 0.85 + s * 0.15), y * s] as [number, number]);
  const noseLathe = (s: number) => ([[0.0039, 0.032], [0.0039, 0.043], [0.0028, 0.055], [0.0012, 0.062], [0, 0.063]] as [number, number][]).map(([r, y]) => [r, y * s] as [number, number]);
  const topRound = new THREE.Group(); pMag.add(topRound);
  add(topRound, turn(caseLathe(1), 14), undefined, { real: 'brass' }); add(topRound, turn(noseLathe(1), 14), undefined, { real: 'copper' });
  topRound.position.set(0, yy(206), zx(968));

  // ═════ barrel (fluted), brake, suppressor: the barrel and its muzzle device move together for a calibre change ═════
  const pBarrel = part('barrel', gun);
  const barG = new THREE.Group(); pBarrel.add(barG);
  const BZ0 = zx(1080), BZ1 = zx(2440), BL = BZ1 - BZ0;          // breech to muzzle (the .300's 26 in, from the bolt face)
  const barScale = new THREE.Group(); barScale.position.z = BZ0; barG.add(barScale);
  add(barScale, turn([[0.0145, 0], [0.0145, zx(1180) - BZ0], [0.012, zx(1260) - BZ0], [0.0105, zx(1950) - BZ0], [0.0088, zx(2400) - BZ0], [0.0088, BL]], 20), undefined, { real: 'barrel' });
  for (let i = 0; i < 6; i++) {                                                              // flutes
    const a = i / 6 * Math.PI * 2 + Math.PI / 6, z0 = zx(1965) - BZ0, z1 = zx(2385) - BZ0;
    const r0 = 0.01025, r1 = 0.0089, p0 = V(Math.cos(a) * r0, Math.sin(a) * r0, z0), p1 = V(Math.cos(a) * r1, Math.sin(a) * r1, z1);
    lines(barScale, [[p0, p1]]);
    realAdd(barScale, rod(p0.clone().multiplyScalar(0.985).setZ(z0), p1.clone().multiplyScalar(0.985).setZ(z1), 0.0021, 6), 'flute');
  }
  const pBrake = part('brake', gun), devG = new THREE.Group(); pBrake.add(devG);
  const brakeZ0 = zx(2420), brakeZ1 = zx(2545);
  add(devG, turn([[0.0089, brakeZ0], [0.0148, brakeZ0 + 0.002], [0.0148, zx(2453)], [0.0135, zx(2457)], [0.0135, brakeZ1 - 0.002], [0.0125, brakeZ1], [0.0052, brakeZ1]], 20), undefined, { real: 'black' });
  for (const k of SIDES) for (const [a, b] of [[2474, 2500], [2511, 2536]] as const)                   // the side ports
    well(devG, [V(k * 0.0137, -0.007, zx(a)), V(k * 0.0137, -0.007, zx(b)), V(k * 0.0137, 0.007, zx(b)), V(k * 0.0137, 0.007, zx(a))], V(k, 0, 0));
  { const b = new THREE.Mesh(new THREE.CircleGeometry(0.0046, 16), E.mats.recess); b.position.z = brakeZ1 + 0.0002; b.raycast = () => {}; devG.add(b); }
  const pSupp = part('suppressor', gun), suppG = new THREE.Group(); pSupp.add(suppG);
  const SUPP_L = 0.245, sz0 = zx(2415), sz1 = sz0 + SUPP_L;
  add(suppG, turn([[0.0155, sz0], [0.0265, sz0 + 0.004], [0.0265, sz0 + 0.034], [0.0242, sz0 + 0.038], [0.0242, sz1 - 0.01], [0.0215, sz1], [0.0065, sz1]], 24), undefined, { real: 'fde' });
  { const g: THREE.BufferGeometry[] = []; for (const f of [0.3, 0.55, 0.8]) g.push(turn([[0.0242, sz0 + SUPP_L * f - 0.002], [0.0249, sz0 + SUPP_L * f], [0.0242, sz0 + SUPP_L * f + 0.002]], 24)); add(suppG, merge(g), undefined, { real: 'fde', minLen: 0.002 }); }
  { const b = new THREE.Mesh(new THREE.CircleGeometry(0.0062, 16), E.mats.recess); b.position.z = sz1 + 0.0002; b.raycast = () => {}; suppG.add(b); }
  suppG.visible = false;

  // ═════ the scope, its cantilever mount, turrets and glass ═════
  const pScope = part('scope', gun);
  add(pScope, turn([[0.0205, SZ0], [0.0228, SZ0 + 0.004], [0.0228, SZ0 + 0.046], [0.0198, SZ0 + 0.052], [0.0198, SZ0 + 0.06], [0.0206, SZ0 + 0.064], [0.0206, SZ0 + 0.088], [0.0175, SZ0 + 0.094],
    [0.0175, zx(1150)], [0.026, zx(1235)], [0.0322, zx(1300)], [0.033, zx(1310)], [0.033, SZ1 - 0.004], [0.0318, SZ1]], 28, 0, SY), undefined, { real: 'scopeFde' });
  { const g: THREE.BufferGeometry[] = []; for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; g.push(new THREE.BoxGeometry(0.003, 0.002, 0.02).translate(Math.cos(a) * 0.0208, SY + Math.sin(a) * 0.0208, SZ0 + 0.076)); } add(pScope, merge(g), undefined, { real: 'scopeFde', minLen: 0.002 }); }   // the power ring's ribs
  add(pScope, rbox(0.006, 0.014, 0.008, -0.022, SY + 0.004, SZ0 + 0.076, 0.002), undefined, { real: 'black' });   // its throw lever
  add(pScope, rbox(0.044, 0.04, 0.062, 0, SY, TURRET_Z, 0.008), undefined, { real: 'scopeFde' });                // the turret saddle
  add(pScope, cylY(0.0175, SY + 0.018, SY + 0.034, 0, TURRET_Z, 20), undefined, { real: 'scopeFde' });              // elevation turret body
  const capG = new THREE.Group(); capG.position.set(0, 0, TURRET_Z); pScope.add(capG);
  add(capG, cylY(0.0195, SY + 0.034, SY + 0.05, 0, 0, 24), undefined, { real: 'black' });
  for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; lines(capG, [[V(Math.cos(a) * 0.0196, SY + 0.036, Math.sin(a) * 0.0196), V(Math.cos(a) * 0.0196, SY + 0.048, Math.sin(a) * 0.0196)]]); }
  add(capG, box(-0.001, 0.001, SY + 0.0501, SY + 0.0506, -0.0195, -0.012), undefined, { real: 'steel' });           // its zero mark
  add(pScope, merge([cylX(0.0165, -0.02, -0.036, SY, TURRET_Z, 20), cylX(0.018, -0.036, -0.046, SY, TURRET_Z, 24)]), undefined, { real: 'black' });   // windage (right)
  add(pScope, merge([cylX(0.019, 0.02, 0.034, SY, TURRET_Z, 24), cylX(0.021, 0.034, 0.042, SY, TURRET_Z, 24)]), undefined, { real: 'black' });        // focus (left)
  for (const z of [SZ0 + 0.0015, SZ1 - 0.0015]) {
    const r = z < SZ1 - 0.1 ? 0.019 : 0.029, w = new THREE.Mesh(new THREE.CircleGeometry(r, 28), E.mats.glass);
    w.position.set(0, SY, z); if (z < SZ1 - 0.1) w.rotation.y = Math.PI; w.userData.real = 'glass'; w.raycast = () => {}; pScope.add(w);
  }
  const pMount = part('mount', gun);
  add(pMount, rbox(0.03, RAIL_TOP + 0.01 - RAIL_TOP + 0.006, zx(1100) - zx(820), 0, RAIL_TOP + 0.005, (zx(820) + zx(1100)) / 2, 0.003));
  for (const z of [zx(883), zx(1064)]) {
    const s = new THREE.Shape([[-0.024, RAIL_TOP + 0.008], [0.024, RAIL_TOP + 0.008], [0.024, SY + 0.012], [0.016, SY + 0.024], [-0.016, SY + 0.024], [-0.024, SY + 0.012]].map(([a, b]) => new THREE.Vector2(a, b)));
    s.holes.push(holeXY(0, SY, 0.0176));
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.017, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0012, bevelSegments: 2 }); g.translate(0, 0, z - 0.0085);
    add(pMount, g);
    for (const k of SIDES) add(pMount, cylX(0.0026, k * 0.0242, k * 0.027, SY + 0.016, z, 8), undefined, { real: 'steel' });
  }

  // ═════ the bipod: a clamp on the lower rail, two legs that fold forward ═════
  const pBip = part('bipod', gun), BIP = V(0, yy(236), zx(1795));
  add(pBip, rbox(0.05, 0.034, 0.062, 0, yy(222), zx(1790), 0.006), undefined, { real: 'black' });
  add(pBip, cylX(0.012, -0.027, -0.046, yy(240), zx(1745), 18), undefined, { real: 'black' });              // swivel tension knob
  const legs: THREE.Group[] = [], legExt: THREE.Group[] = [];
  for (const k of SIDES) {
    const leg = new THREE.Group(); leg.position.set(k * 0.02, BIP.y, BIP.z); pBip.add(leg); legs.push(leg);
    add(leg, cylY(0.0068, -0.13, 0, 0, 0, 10), undefined, { real: 'black' });
    const ext = new THREE.Group(); leg.add(ext); legExt.push(ext);                            // the inner leg telescopes out
    add(ext, cylY(0.005, -0.25, -0.12, 0, 0, 10), undefined, { real: 'black' });
    add(ext, turn([[0, -0.012], [0.011, -0.01], [0.012, 0.004], [0.007, 0.012]], 12).rotateX(-Math.PI / 2).translate(0, -0.258, 0), undefined, { real: 'rubber' });
    const coil: THREE.Vector3[] = []; for (let i = 0; i <= 80; i++) { const t = i / 80, a = t * Math.PI * 2 * 22; coil.push(V(Math.cos(a) * 0.0042 + k * 0.009, -0.01 - t * 0.12, Math.sin(a) * 0.0042 + 0.012)); }
    lines(leg, coil.slice(1).map((p, i) => [coil[i], p] as [THREE.Vector3, THREE.Vector3]).filter((_, i) => i % 4 === 0));
    realAdd(leg, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 200, 0.0008, 5), 'steel');
  }

  // ═════ Real view only: markings ═════
  const calDecal = (() => {
    const W = 1024, H = 128, tex = decalTexture(W, H, () => {}), mat = decalMaterial(tex, { roughness: 0.6, metalness: 0.1, alphaTest: 0.35 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.0094).rotateY(-Math.PI / 2).translate(-UX - 0.00015, yy(156), zx(985)), mat);
    m.visible = false; m.raycast = () => {}; pUpper.add(m); realOnly.push(m); decalMats.push(mat);
    return (text: string) => {
      const c = tex.image as HTMLCanvasElement, x = c.getContext('2d')!;
      x.clearRect(0, 0, W, H); x.font = '700 82px Arial, Helvetica, sans-serif'; x.fillStyle = '#e2ddd2'; x.textBaseline = 'middle'; x.textAlign = 'center'; x.fillText(text, W / 2, H / 2);
      tex.needsUpdate = true;
    };
  })();
  {
    const decal = (w: number, h: number, at: THREE.Vector3, side: number, draw: (x: CanvasRenderingContext2D, W: number, H: number) => void) => {
      const W = 1024, H = Math.round(W * h / w), tex = decalTexture(W, H, x => draw(x, W, H)), mat = decalMaterial(tex, { roughness: 0.6, metalness: 0.1, alphaTest: 0.35 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateY(side * Math.PI / 2).translate(at.x, at.y, at.z), mat);
      m.visible = false; m.raycast = () => {}; pUpper.add(m); realOnly.push(m); decalMats.push(mat);
    };
    const font = (x: CanvasRenderingContext2D, size: number, col: string) => { x.font = `700 ${size}px Arial, Helvetica, sans-serif`; x.fillStyle = col; x.textBaseline = 'middle'; x.textAlign = 'center'; };
    decal(0.064, 0.009, V(-UX - 0.00015, yy(126), zx(1210)), -1, (x, W, H) => { font(x, Math.round(H * 0.72), '#2a2116'); x.fillText('MK 22 MOD 0', W / 2, H / 2); });
    decal(0.03, 0.012, V(-LX - 0.00015, yy(196), zx(686)), -1, (x, W, H) => { font(x, Math.round(H * 0.55), '#e6e1d6'); x.fillText('S', W * 0.2, H * 0.5); x.fillText('F', W * 0.8, H * 0.5); });
  }

  // ═════ muzzle flashes: from the muzzle, and out of the brake's ports (accent glow; fireballs in the Real view) ═════
  const flashMat = E.glowMat();
  const coneGeo = (r: number, l: number) => { const g = new THREE.ConeGeometry(r, l, 7, 1, true); g.rotateX(-Math.PI / 2); g.translate(0, 0, l / 2); return g; };
  const flashMesh = new THREE.Mesh(coneGeo(0.03, 0.09), flashMat); flashMesh.raycast = () => {}; flashMesh.visible = false; gun.add(flashMesh);
  const portFlash = new THREE.Group(); gun.add(portFlash);
  for (const k of SIDES) { const m = new THREE.Mesh(coneGeo(0.022, 0.06), flashMat); m.rotation.y = k * Math.PI / 2 * 0.85; m.position.set(k * 0.014, 0, zx(2492)); m.raycast = () => {}; portFlash.add(m); }
  portFlash.visible = false;
  const flashGlow = E.glowPoints([V(0, 0, 0)], 0.32); gun.add(flashGlow);
  const flashLight = new THREE.PointLight(E.accent.getHex(), 0, 1.8, 2); gun.add(flashLight); E.accentLights.push(flashLight);
  const muzzle = V(0, 0, brakeZ1);
  const fireball = makePlume(gun, V(0, 0, brakeZ1), V(0, 0, 1), 0.06, 0.06, 0.18, 21);
  const portBalls = SIDES.map((k, i) => makePlume(gun, V(k * 0.014, 0, zx(2492)), V(k, 0.1, -0.35).normalize(), 0.035, 0.035, 0.1, 22 + i));
  let realOn = false;

  // ═════ cases and live rounds thrown from the ejection port ═════
  type Brass = { g: THREE.Group; line: THREE.Group; real: THREE.Group; v: THREE.Vector3; spin: THREE.Vector3; rest: boolean; bounced: boolean };
  const brass: Brass[] = [];
  const caseGeo = new Map<number, { real: THREE.BufferGeometry; nose: THREE.BufferGeometry; line: THREE.BufferGeometry; lineNose: THREE.BufferGeometry }>();
  const geosFor = (s: number) => {
    if (!caseGeo.has(s)) caseGeo.set(s, {
      real: new THREE.LatheGeometry(caseLathe(s).map(([r, y]) => new THREE.Vector2(r, y)), 16), nose: new THREE.LatheGeometry(noseLathe(s).map(([r, y]) => new THREE.Vector2(r, y)), 16),
      line: new THREE.CylinderGeometry(0.0072, 0.0072, 0.064 * s, 10), lineNose: new THREE.ConeGeometry(0.0039, 0.03 * s, 10).translate(0, 0.047 * s, 0),
    });
    return caseGeo.get(s)!;
  };
  let inHand = false, trigDelay = 30, flashGain = 1, brassMax = 10;
  let hold: RangeHold | null = null;
  const ground = (x: number, z: number) => hold ? hold.ground(x, z) : 0;
  const drop = (b: Brass) => { b.g.removeFromParent(); b.line.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); };
  function eject(live: boolean) {
    if (brass.length >= brassMax) drop(brass.shift()!);
    const G = geosFor(CALS[st.cal].size);
    const g = new THREE.Group(), line = new THREE.Group(), real = new THREE.Group(); g.add(line, real); E.scene.add(g);
    add(line, G.line.clone()); if (live) add(line, G.lineNose.clone());
    const pieces: [THREE.BufferGeometry, THREE.Material][] = [[G.real, RM.brass]]; if (live) pieces.push([G.nose, RM.copper]);
    for (const [geo, mat] of pieces) { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; real.add(m); }
    line.visible = !realOn; real.visible = realOn;
    gun.updateMatrixWorld();
    g.position.copy(gun.localToWorld(V(-UX - 0.006, yy(110), zx(960) - BOLT_RUN * 0.6)));
    g.rotation.set(0, 0, Math.PI / 2); g.quaternion.premultiply(gun.quaternion);
    const r = () => Math.random() - 0.5;
    brass.push({ g, line, real, v: V(-1.6 + r() * 0.4, 0.9 + r() * 0.3, -0.3 + r() * 0.3).applyQuaternion(gun.quaternion), spin: V(r() * 26, r() * 18, 20 + r() * 8), rest: false, bounced: false });
  }
  type DropMag = { g: THREE.Group; v: THREE.Vector3; spin: number; rest: boolean };
  const mags: DropMag[] = [];
  function dropMag() {
    if (mags.length >= 3) mags.shift()!.g.removeFromParent();
    gun.updateMatrixWorld(true);
    const g = new THREE.Group(), copy = pMag.clone(true);
    copy.traverse(o => { if ((o as THREE.Points).isPoints || (o as { isLineSegments2?: boolean }).isLineSegments2 || o.userData.outline) o.visible = false; });
    copy.position.set(0, 0, 0).sub(MAG_C); copy.visible = true; g.add(copy);
    g.position.copy(gun.localToWorld(MAG_C.clone())); g.quaternion.copy(gun.quaternion); E.scene.add(g);
    mags.push({ g, v: V(0, -1.2, 0).applyQuaternion(gun.quaternion), spin: (Math.random() - 0.5) * 4, rest: false });
  }

  // ═════ sound ═════
  const sfx = {
    shot(supp: boolean) {
      if (supp) {
        snd.burst(0.16, 0.4, { type: 'lowpass', freq: 1100, attack: 0.002 }); snd.tone(78, 0.32, 0.28, { type: 'triangle', to: 40 });
        snd.burst(0.02, 0.3, { freq: 3200, q: 0.8 });                                   // the bullet's own crack: still supersonic
      } else {
        snd.burst(0.24, 1, { freq: 1700, q: 0.45, attack: 0.001 }); snd.burst(0.8, 0.62, { type: 'lowpass', freq: 190 });
        snd.tone(52, 0.55, 0.5, { type: 'triangle', to: 26 }); snd.burst(0.035, 0.7, { freq: 4600, q: 0.7 });   // the brake's sharp blast
      }
    },
    lift() { snd.click(0, 0.55); snd.tone(700, 0.04, 0.05, { type: 'square' }); },
    back() { snd.burst(0.14, 0.1, { freq: 1500, q: 2 }); snd.click(0.12, 0.62); },
    forward() { snd.burst(0.1, 0.09, { freq: 1700, q: 2 }); snd.click(0.09, 0.7); },
    down() { snd.thunk(0); snd.click(0.005, 0.6); snd.tone(900, 0.04, 0.05, { type: 'square' }); },
    magOut() { snd.click(0, 1.0); snd.burst(0.05, 0.08, { freq: 900, q: 1.5, at: 0.04 }); },
    magIn() { snd.click(0.18, 0.75); snd.thunk(0.19); },
    safety() { snd.click(0, 1.3); snd.tone(2600, 0.02, 0.03, { type: 'square' }); },
    stock() { snd.click(0, 0.85); snd.thunk(0.02); },
    bipod() { snd.tone(1400, 0.08, 0.04, { type: 'sine', to: 900 }); snd.click(0.06, 1); },
    supp() { snd.burst(0.2, 0.06, { freq: 1200, q: 3 }); snd.click(0.2, 0.8); snd.thunk(0.22); },
    barrel() { snd.thunk(0); snd.burst(0.2, 0.08, { freq: 800, q: 1.4, at: 0.05 }); },
  };

  // ═════ state ═════
  const st = {
    rounds: CAP, chamber: false, spent: false, magIn: true, safe: true, cal: 'nm300' as Cal,
    folded: false, bipod: true, supp: false, dial: 0,
    magT: 0, foldT: 0, bipT: 1, suppT: 0, safeT: 1, calT: -1, calTo: 'nm300' as Cal,
    cycle: null as null | { t0: number; did: number },
    shotAt: -1, trigAt: -1,
  };
  const busy = () => !!st.cycle || st.calT >= 0;
  const BOLT_S = 0.72;                                                                          // a full working of the bolt

  const act = {
    fire() {
      if (busy()) return;
      st.trigAt = performance.now();
      if (st.safe) { snd.click(0, 0.6); return say('safe · S'); }
      if (!st.chamber || st.spent) { snd.click(0, 0.7); return say(st.spent ? 'click · work the bolt (R)' : 'click · chamber empty'); }
      st.spent = true; st.shotAt = performance.now() + trigDelay;
      setTimeout(() => sfx.shot(st.supp), trigDelay);
    },
    bolt() { if (busy()) return; st.cycle = { t0: performance.now(), did: 0 }; sfx.lift(); },
    magazine() {
      if ((st.magT > 0 && st.magT < 1) || busy()) return;
      st.magIn = !st.magIn;
      if (!st.magIn) { sfx.magOut(); if (inHand) dropMag(); }
      else { st.rounds = CAP; sfx.magIn(); }
    },
    safety() { st.safe = !st.safe; sfx.safety(); },
    stock() { if (st.foldT > 0 && st.foldT < 1) return; st.folded = !st.folded; sfx.stock(); },
    bipod() { st.bipod = !st.bipod; sfx.bipod(); },
    suppressor() { if (st.suppT > 0 && st.suppT < 1) return; st.supp = !st.supp; sfx.supp(); },
    calibre() {
      if (busy()) return;
      st.calTo = CAL_ORDER[(CAL_ORDER.indexOf(st.cal) + 1) % CAL_ORDER.length]; st.calT = performance.now(); sfx.barrel();
      say(`changing to ${CALS[st.calTo].short}`);
    },
    range() {},
    demo() {},
  } satisfies Record<string, () => void>;

  // ═════ the range ═════
  const rangeGun: RangeGun = {
    name: 'Mk 22', get calibre() { return CALS[st.cal].short; }, root: gun, kind: 'rifle', site: 'field',
    sight: { rear: SCOPE.rear, front: SCOPE.front }, muzzle, relief: SCOPE.relief,
    optic: () => SCOPE,
    grip: { web: V(0, yy(220), zx(610)), down: V(0, -0.973, -0.23).normalize(), length: 0.1, depth: 0.05, half: 0.0145, trigger: V(0, yy(262), zx(752)), thumbY: -0.012, frameHalf: LX, fingers: 0.028 },
    fore: { at: V(0, yy(124), zx(1380)), r: 0.034, dir: V(0, 0, 1) },
    hip: V(0.13, -0.19, -0.3),
    recoil: { rise: 2.4 * DEG, push: 0.028, cam: 0.5 * DEG },
    trigger() {
      if (busy()) return 'busy';
      const r = st.safe ? 'safe' : !st.chamber || st.spent ? 'click' : 'shot';
      act.fire();
      return r;
    },
    loud: () => st.supp ? 0.35 : 1,
    keys: [['U J', 'dial elevation'], ['N', 'dial the spotter’s elevation'], ['R', 'work the bolt'], ['C', 'stand / sit'], ['B', 'bipod']],
    ballistics: () => ({ v0: CALS[st.cal].v0, k: CALS[st.cal].k, zero: 100 }),
    turret: { step: 0.1, max: 20, set(m) { st.dial = m; } },
    bipod: () => st.bipod,
    bolt: true,
    magazine() { act.magazine(); },
    rack() { act.bolt(); },
    safety() { act.safety(); },
    night() {},
    state: () => ({ rounds: st.rounds, cap: CAP, chamber: st.chamber && !st.spent, magIn: st.magIn, safe: st.safe, locked: false, busy: busy() || (st.magT > 0 && st.magT < 1), night: false }),
    hold(on, o) {
      inHand = on; trigDelay = on ? 0 : 30; flashGain = on ? 24 : 1; flashLight.distance = on ? (o?.flash ?? 12) : 1.8; brassMax = on ? 30 : 10;
      hold = on && o ? o : null;
      if (on) { st.safe = true; if (st.folded) { st.folded = false; st.foldT = 0; } }
      else {
        gun.position.set(0, GY, 0); gun.quaternion.identity();
        brass.forEach(drop); brass.length = 0; mags.forEach(m => m.g.removeFromParent()); mags.length = 0;
        if (!st.magIn) { st.magIn = true; st.rounds = CAP; st.magT = 0; }
        st.safe = true; st.dial = 0;
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
    if (!realOn) { say('opening the long-distance range'); style(true); return; }
    openRange();
  };
  act.demo = () => {
    if (script.active) { script.stop(); return; }
    script.start();
    const { later, when } = script;
    const idle = () => !busy() && [st.magT, st.foldT, st.suppT].every(t => t === 0 || t === 1) && Math.abs(st.bipT - (st.bipod ? 1 : 0)) < 0.01;
    const steps: [() => void, number][] = [
      [() => { if (!st.safe) act.safety(); }, 500],
      [() => { if (st.magIn) act.magazine(); }, 700],
      [() => act.magazine(), 800],
      [() => act.bolt(), 900],
      [() => act.safety(), 600],
      [() => act.fire(), 900],
      [() => act.bolt(), 900],
      [() => act.fire(), 900],
      [() => act.bolt(), 900],
      [() => act.safety(), 600],
      [() => act.bipod(), 900],
      [() => act.bipod(), 900],
      [() => act.stock(), 1300],
      [() => act.stock(), 1300],
      [() => act.suppressor(), 1200],
      [() => act.safety(), 500],
      [() => act.fire(), 900],                                                         // a suppressed shot
      [() => act.bolt(), 900],
      [() => act.safety(), 500],
      [() => act.suppressor(), 1200],
      [() => act.calibre(), 600],
      [() => act.calibre(), 600],
      [() => act.calibre(), 600],
      [() => { script.end(); }, 0],
    ];
    const step = (i: number) => when(idle, () => { steps[i][0](); if (i + 1 < steps.length) later(steps[i][1], () => step(i + 1)); });
    step(0);
  };

  // ═════ per frame ═════
  const flashK = (now: number) => st.shotAt < 0 || now < st.shotAt ? 0 : Math.exp(-(now - st.shotAt) / 26);
  function tick(now: number, dt: number) {
    if (wantRange && realOn && !rng?.on) openRange();
    rng?.tick(now, dt);
    st.magT = approach(st.magT, st.magIn ? 0 : 1, (st.magIn ? 2.4 : 4.2) * dt);
    st.foldT = approach(st.foldT, st.folded ? 1 : 0, 1.6 * dt);
    st.bipT = approach(st.bipT, st.bipod ? 1 : 0, 3.2 * dt);
    st.suppT = approach(st.suppT, st.supp ? 1 : 0, 1.2 * dt);
    st.safeT = approach(st.safeT, st.safe ? 1 : 0, 10 * dt);

    // the bolt: up, back (out comes the case or round), forward (a round from the magazine), down
    let lift = 0, run = 0;
    const c = st.cycle;
    if (c) {
      const t = (now - c.t0) / 1000 / BOLT_S;
      lift = phase(t, 0, 0.16) * (1 - phase(t, 0.84, 1));
      run = phase(t, 0.18, 0.46) * (1 - phase(t, 0.54, 0.82));
      if (c.did === 0 && t > 0.2) { c.did = 1; sfx.back(); }
      if (c.did === 1 && t > 0.44) { c.did = 2; if (st.chamber) eject(!st.spent); st.chamber = false; st.spent = false; }
      if (c.did === 2 && t > 0.56) { c.did = 3; sfx.forward(); if (st.magIn && st.rounds > 0) { st.rounds--; st.chamber = true; } }
      if (c.did === 3 && t > 0.84) { c.did = 4; sfx.down(); }
      if (t >= 1) st.cycle = null;
    }
    boltLift.rotation.z = BOLT_LIFT * ease(lift);
    boltSlide.position.z = -BOLT_RUN * ease(run);
    topRound.visible = st.magIn && st.rounds > 0;

    // controls
    const tt = st.trigAt < 0 ? 1 : (now - st.trigAt) / 1000;
    trig.set((tt < 0.05 ? tt / 0.05 : clamp01(1 - (tt - 0.1) / 0.12)) * 9 * DEG);
    safeH.set(st.safeT * -90 * DEG);
    pMag.position.y = -MAG_DROP * ease(st.magT); pMag.visible = st.magT < 0.999 || !inHand;
    fold.rotation.y = Math.PI * ease(st.foldT);
    // bipod legs: down, splayed a little and feet forward; or folded forward along the handguard
    const b = ease(st.bipT);
    legs.forEach((l, i) => { l.rotation.set(THREE.MathUtils.lerp(-Math.PI / 2 + 0.06, -0.1, b), 0, (i ? -1 : 1) * 0.17 * b); });
    legExt.forEach(e => { e.position.y = approach(e.position.y, inHand && st.bipod ? 0 : 0.09, 0.25 * dt); });   // out to reach the bench on the range
    // the suppressor slides on from the front and turns onto the brake
    const s = ease(st.suppT);
    suppG.visible = st.suppT > 0.01; suppG.position.z = (1 - s) * 0.26; suppG.rotation.z = (1 - s) * 1.2;

    // calibre change: magazine out, the barrel slides forward out of the upper, swaps, back in, the new magazine in
    let barOut = 0;
    if (st.calT >= 0) {
      const t = (now - st.calT) / 1000 / 2.2;
      barOut = phase(t, 0.12, 0.42) * (1 - phase(t, 0.58, 0.88));
      pMag.position.y = Math.min(pMag.position.y, -MAG_DROP * (phase(t, 0, 0.12) * (1 - phase(t, 0.88, 1))));
      if (t > 0.5 && st.cal !== st.calTo) {
        st.cal = st.calTo; st.chamber = false; st.spent = false; st.rounds = CAP;
        const C = CALS[st.cal]; barScale.scale.z = (BL + C.dz) / BL; magShell.scale.z = 0.9 + C.size * 0.1; calDecal(C.mark);
        topRound.scale.set(1, 1, C.size);
      }
      if (t >= 1) { st.calT = -1; say(`${CALS[st.cal].short} · ${CALS[st.cal].inch} in barrel`); }
    }
    const dz = CALS[st.cal].dz;
    barG.position.z = barOut * 0.16; devG.position.z = dz + barOut * 0.16; suppG.position.z += dz + barOut * 0.16;
    muzzle.set(0, 0, (st.supp && st.suppT > 0.99 ? sz1 : brakeZ1) + dz);
    capG.rotation.y = -st.dial / 10 * Math.PI * 2;

    // flashes
    const fk = flashK(now), supp = st.supp && st.suppT > 0.99, k = supp ? 0.25 : 1;
    flashMesh.position.copy(muzzle); flashGlow.position.copy(muzzle).z += 0.02; flashLight.position.copy(muzzle).z += 0.08;
    flashMesh.visible = !realOn && fk > 0.04; flashMat.emissiveIntensity = 2.4 * fk * k; flashMesh.scale.setScalar((0.8 + fk * 0.7) * (supp ? 0.5 : 1));
    portFlash.visible = !realOn && !supp && fk > 0.04; portFlash.position.z = dz;
    flashGlow.material.uniforms.intensity.value = fk * 1.4 * k;
    flashLight.intensity = fk * flashGain * 1.4 * k;
    bench.shadowMat.uniforms.opacity.value = E.shadowStrength() * 0.8;

    // brass and dropped magazines
    for (const br of brass) {
      if (br.rest) continue;
      br.v.y -= 9.8 * dt; br.g.position.addScaledVector(br.v, dt);
      br.g.rotation.x += br.spin.x * dt; br.g.rotation.y += br.spin.y * dt; br.g.rotation.z += br.spin.z * dt;
      const gy = ground(br.g.position.x, br.g.position.z) + 0.0075;
      if (br.g.position.y <= gy) {
        br.g.position.y = gy;
        if (!br.bounced && br.v.y < -0.4) { br.bounced = true; br.v.set(br.v.x * 0.3, -br.v.y * 0.22, br.v.z * 0.3); br.spin.multiplyScalar(0.3); snd.tone(2300, 0.09, 0.035); }
        else { br.rest = true; br.g.rotation.set(0, br.g.rotation.y, Math.PI / 2); snd.tone(2100, 0.06, 0.02); }
      }
    }
    for (const m of mags) {
      if (m.rest) continue;
      m.v.y -= 9.8 * dt; m.g.position.addScaledVector(m.v, dt); m.g.rotation.x += m.spin * dt;
      const gy = ground(m.g.position.x, m.g.position.z) + 0.019;
      if (m.g.position.y <= gy) { m.g.position.y = gy; m.rest = true; m.g.rotation.set(0, m.g.rotation.y, Math.PI / 2); snd.thunk(0); }
    }
  }

  function readout() {
    if (rng?.on) return 'long-distance range · point 3';
    const p: string[] = [];
    p.push(st.magIn ? `${st.rounds} in magazine` : 'magazine out');
    p.push(st.chamber ? (st.spent ? 'fired case in chamber' : 'round chambered') : 'chamber empty');
    p.push(st.safe ? 'safe' : 'fire');
    p.push(CALS[st.cal].short.toLowerCase());
    p.push(st.bipod ? 'bipod down' : 'bipod folded');
    if (st.supp) p.push('suppressed');
    if (st.folded) p.push('stock folded');
    return p.join(' · ');
  }

  const real: RealSpec = {
    focus: V(0, 0.15, 0.45), size: 1.5, hide: [bench.deck], bench: MAT,
    materials: { ...RM, body: RM.fde },
    lamps: [],
    only: { line: [], real: realOnly },
    stage: () => rng?.stage() ?? null,
    onStyle(on) {
      realOn = on;
      if (on && !rng) openRange();
      if (!on) { wantRange = false; rng?.exit(); }
      for (const b of brass) { b.line.visible = !on; b.real.visible = on; }
      if (!on) { fireball.set(0, 0); portBalls.forEach(p => p.set(0, 0)); flashLight.color.copy(E.accent); }
    },
    tick(now) {
      const fk = flashK(now), supp = st.supp && st.suppT > 0.99;
      fireball.group.position.copy(muzzle);
      fireball.set(fk * (supp ? 0.2 : 1), now); portBalls.forEach((p, i) => { p.group.position.set(SIDES[i] * 0.014, 0, zx(2492) + CALS[st.cal].dz); p.set(supp ? 0 : fk * 0.8, now); });
      flashLight.color.setHex(0xffa24a);
    },
  };

  calDecal(CALS[st.cal].mark);
  if (arrive === 'range') setTimeout(() => act.range(), 0);

  return {
    pickRoot: gun, parts: K.parts, real,
    view: { target: V(0, 0.22, 0.42), dist: 2.4, min: 0.4, max: 7 },
    actions: act, passive: [],
    keyDown(k, e) { if (rng?.on) return rng.keyDown(k, e); return false; },
    keyUp(k) { if (rng?.on) rng.keyUp(k); },
    blur() { rng?.blur(); },
    hud: () => rng?.hud() ?? null,
    on: () => ({ range: !!rng?.on, demo: script.active, fire: st.shotAt > 0 && performance.now() - st.shotAt < 200, bolt: !!st.cycle, magazine: st.magIn, safety: !st.safe, stock: st.folded, bipod: st.bipod, suppressor: st.supp, calibre: st.calT >= 0 }),
    tick, readout,
    dispose() {
      rng?.dispose(); mags.forEach(m => m.g.removeFromParent());
      brass.forEach(drop);
      RTex.forEach(t => t.dispose()); Object.values(RM).forEach(m => m.dispose());
      decalMats.forEach(m => { (m as THREE.MeshStandardMaterial).map?.dispose(); m.dispose(); });
      caseGeo.forEach(g => Object.values(g).forEach(x => x.dispose()));
    },
  };
};

export default model;
