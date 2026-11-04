// L115A3 Long Range Rifle (Accuracy International AWM, .338 Lapua Magnum): a bolt action that works (lift, back,
// eject, forward, down), a 5-round steel magazine, a safety at the rear of the action, a thumbhole stock whose butt folds
// forward along the left side, a cheek piece that rises, a monopod spike under the butt that screws down, a bipod that
// folds forward under the forend, a suppressor screwed over the brake, and a 5–25× scope whose elevation cap turns as
// the range dials it.
// Coordinates in metres: +z toward the muzzle, +y up, +x to the rifle's left; the bore axis is y = 0 and z = 0 is the
// back of the action. Like every small arm it floats raised above its mat.
// Stock, action, barrel, suppressor, magazine, scope and bipod are traced from a left-side photograph (1920 × 1080) at
// 0.839 mm per pixel both ways: the rifle's 1,300 mm from butt to muzzle over its 1,550 px (the scope then comes out a
// little long). Profiles are written in that photo's pixels (ix, iy) and converted by `px`; its muzzle points left, so
// z grows as ix falls, and what the photo shows is the +x side. The bolt handle and ejection port on the right follow
// a three-quarter view from that side.
// Accent (live) parts: the flashes. Real view: coyote-brown polymer stock, black-finished steel action, barrel,
// suppressor and scope, a bare steel magazine.
// Range (key G, Real view): the long-distance field outdoors (lib/range/field.ts), as for the Mk 22.
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

const CAP = 5;
const GY = 0.32;                                            // bore axis above the mat
const MAT = { w: 0.5, d: 1.74, cx: 0, cz: 0.42 };           // the bench mat under the rifle (both styles)
const BOLT_RUN = 0.108, BOLT_LIFT = -60 * DEG;              // the bolt's travel (a long magnum action) and its lift
const MAG_DROP = GY - 0.17;
const V0 = 936, DRAG = 0.00046;                             // .338 Lapua Magnum, 250 gr: muzzle velocity, drag

// ── the photograph's pixels → rifle metres (the muzzle points left: z grows as ix falls) ──
const PX = 0.839e-3, IX0 = 1450, IY0 = 422;                 // scale; the back of the action and the bore axis
const zx = (ix: number) => (IX0 - ix) * PX, yy = (iy: number) => (IY0 - iy) * PX;
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
const cylZ = (r: number, z0: number, z1: number, segs = 16, x = 0, y = 0) => { const g = new THREE.CylinderGeometry(r, r, Math.abs(z1 - z0), segs); g.rotateX(Math.PI / 2); g.translate(x, y, (z0 + z1) / 2); return g; };
const cylX = (r: number, x0: number, x1: number, y: number, z: number, segs = 16) => { const g = new THREE.CylinderGeometry(r, r, Math.abs(x1 - x0), segs); g.rotateZ(Math.PI / 2); g.translate((x0 + x1) / 2, y, z); return g; };
const cylY = (r: number, y0: number, y1: number, x: number, z: number, segs = 16) => new THREE.CylinderGeometry(r, r, Math.abs(y1 - y0), segs).translate(x, (y0 + y1) / 2, z);
const rbox = (w: number, h: number, d: number, x: number, y: number, z: number, r = Math.min(w, h, d) * 0.3) => new RoundedBoxGeometry(w, h, d, 2, r).translate(x, y, z);
const holeXY = (x: number, y: number, r: number) => { const p = new THREE.Path(); p.absarc(x, y, r, 0, Math.PI * 2, true); return p; };
const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, segs = 8) => {
  const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), segs);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
};

// ── side profiles, in the photo's pixels ──
/** the thumbhole: its front arc belongs to the grip, its rear arc to the folding butt */
const TH_FRONT: Cmd[] = [['L', 1545, 503], ['Q', 1500, 502, 1480, 525], ['Q', 1474, 552, 1505, 566], ['Q', 1530, 575, 1560, 573]];
const TH_REAR: Cmd[] = [['Q', 1592, 550, 1585, 524], ['Q', 1575, 503, 1545, 503]];
/** the fixed stock: forend, the bed under the action, trigger guard, grip, up to the folding joint */
const STOCK: Cmd[] = [['M', 870, 432], ['L', 1135, 432], ['L', 1135, 441], ['L', 1450, 441], ['L', 1545, 446], ...TH_FRONT, ['L', 1592, 600], ['L', 1500, 622], ['L', 1425, 622],
  ['Q', 1404, 615, 1402, 595], ['L', 1398, 560], ['L', 1395, 548], ['L', 1356, 548], ['L', 1356, 520], ['L', 1222, 520], ['L', 1222, 502], ['L', 872, 502], ['Q', 856, 500, 855, 480], ['L', 855, 452], ['Q', 856, 434, 870, 432]];
const GUARD_HOLE = rr(1372, 502, 1440, 542, 16);
/** the folding butt, behind the joint */
const BUTT: Cmd[] = [['M', 1545, 446], ['L', 1795, 442], ['L', 1795, 578], ['L', 1600, 603], ['L', 1592, 600], ['L', 1560, 573], ...TH_REAR];
const PAD = rr(1795, 445, 1895, 632, 12);
const CHEEK: Cmd[] = [['M', 1620, 442], ['L', 1620, 429], ['Q', 1622, 421, 1632, 421], ['L', 1785, 421], ['Q', 1795, 421, 1795, 430], ['L', 1795, 442]];
const TRIGGER: Cmd[] = [['M', 1412, 503], ['L', 1420, 503], ['Q', 1423, 528, 1412, 546], ['Q', 1407, 549, 1407, 543], ['Q', 1414, 527, 1412, 503]];
const MAG: Cmd[] = [['M', 1224, 448], ['L', 1354, 448], ['L', 1354, 572], ['L', 1226, 568]];
/** hex screws in the stock's sides */
const SCREWS: [number, number][] = [[905, 470], [1043, 471], [1203, 478], [1290, 486], [1338, 479], [1475, 490], [1584, 482], [1676, 489], [1782, 490], [1655, 553], [1500, 607], [1438, 594]];
const MAG_C = new THREE.Vector3(0, yy(540), zx(1290));
// ── the scope: its axis 61 mm over the bore, eyepiece to objective bell ──
const SY = yy(350), SZ0 = zx(1490), SZ1 = zx(940), TURRET_Z = zx(1237);
const SCOPE: OpticSight = { rear: new THREE.Vector3(0, SY, SZ0), front: new THREE.Vector3(0, SY, SZ1), relief: 0.09, zoom: [5, 25], reticle: 'mil' };
const RAIL_TOP = yy(396);

/** finishes for the Real view, by tag; untagged meshes get the coyote polymer */
function realMaterials() {
  const tex: THREE.Texture[] = [];
  const canvasTex = (n: number, draw: (x: CanvasRenderingContext2D, n: number) => void, rep: number) => {
    const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d')!, n);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.setScalar(rep); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
    tex.push(t); return t;
  };
  const grain = canvasTex(128, (x, n) => { const img = x.createImageData(n, n); for (let i = 0; i < img.data.length; i += 4) { const v = 110 + Math.random() * 34; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; } x.putImageData(img, 0, 0); }, 140);
  const brushed = canvasTex(256, (x, n) => { x.fillStyle = '#909090'; x.fillRect(0, 0, n, n); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${0.05 + Math.random() * 0.12})`; x.fillRect(0, Math.random() * n, n, 1); } }, 8);
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  const M = {
    stock: new THREE.MeshPhysicalMaterial({ color: 0x8c6a42, roughness: 0.82, bumpMap: grain, bumpScale: 0.3, sheen: 0.2, sheenRoughness: 0.8 }),
    black: std({ color: 0x1e1f20, metalness: 0.55, roughness: 0.42 }),
    action: new THREE.MeshPhysicalMaterial({ color: 0x232527, metalness: 0.7, roughness: 0.38, clearcoat: 0.15, clearcoatRoughness: 0.4 }),
    barrel: new THREE.MeshPhysicalMaterial({ color: 0x1c1d1e, metalness: 0.6, roughness: 0.4, clearcoat: 0.1 }),
    flute: std({ color: 0x0d0d0e, metalness: 0.4, roughness: 0.6 }),
    suppressor: std({ color: 0x232425, metalness: 0.4, roughness: 0.62, bumpMap: grain, bumpScale: 0.15 }),
    scope: new THREE.MeshPhysicalMaterial({ color: 0x18191a, metalness: 0.35, roughness: 0.48, clearcoat: 0.2, clearcoatRoughness: 0.5 }),
    magSteel: std({ color: 0x9da1a4, metalness: 0.9, roughness: 0.42, bumpMap: brushed, bumpScale: 0.2 }),
    rubber: std({ color: 0x141515, roughness: 0.95, bumpMap: grain, bumpScale: 0.4 }),
    poly: std({ color: 0x1b1c1d, roughness: 0.78 }),
    bolt: std({ color: 0x7e8286, metalness: 0.95, roughness: 0.3 }),
    steel: std({ color: 0xa8acb0, metalness: 1, roughness: 0.3 }),
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
  const bench = buildPlate(E, { ...MAT, grid: 0.01, ruler: true, shadow: [0.22, 1.35, 0, 0.42] });
  const { M: RM, tex: RTex } = realMaterials();
  const realOnly: THREE.Object3D[] = [], decalMats: THREE.Material[] = [];
  const realAdd = (parent: THREE.Object3D, geo: THREE.BufferGeometry, tag: string) => {
    const m = add(parent, geo, undefined, { real: tag, lines: false }); m.visible = false; realOnly.push(m); return m;
  };
  const CX = 0.026, BX = 0.022, AR = 0.0185;                  // half-widths: stock, butt; the action's radius

  // ═════ the stock: forend, action bed, trigger guard, thumbhole grip ═════
  const pStock = part('chassis', gun);
  add(pStock, across(profile(STOCK, [GUARD_HOLE]), -CX, CX, 0.003, 4));
  for (const k of SIDES) {
    lines(pStock, [[V(k * (CX + 0.0002), yy(446), zx(880)), V(k * (CX + 0.0002), yy(446), zx(1150))]]);                       // the forend's groove
    for (const [ix, iy] of SCREWS) if (ix < 1545) add(pStock, cylX(0.0042, k * CX, k * (CX + 0.0012), yy(iy), zx(ix), 6), undefined, { real: 'black' });
  }
  add(pStock, cylX(0.006, -CX - 0.004, CX + 0.004, yy(470), zx(870), 12), undefined, { real: 'black' });      // the front sling stud's cross bolt
  const pTrig = part('trigger', gun);
  const trig = hinge(pTrig, V(0, yy(503), zx(1416)), V(1, 0, 0), 'x');
  add(trig.inner, across(profile(TRIGGER), -0.003, 0.003, 0.0006, 3), undefined, { real: 'black' });
  add(pStock, rbox(0.012, 0.022, 0.008, 0, yy(530), zx(1362), 0.002), undefined, { real: 'black' });           // magazine catch, ahead of the guard

  // ═════ the action: a round receiver with a rail, the ejection port on the right, the bolt and its safety ═════
  const pAction = part('action', gun);
  add(pAction, turn([[0.012, zx(1010)], [0.016, zx(1010) - 0.004], [AR, zx(1030)], [AR, zx(1458)], [0.0175, zx(1462)], [0.006, zx(1462)]].map(([r, z]) => [r, z] as [number, number]).reverse(), 24), undefined, { real: 'action' });
  add(pAction, box(-0.0105, 0.0105, AR - 0.002, RAIL_TOP - 0.002, zx(1440), zx(1095)), undefined, { real: 'action' });
  { const g: THREE.BufferGeometry[] = []; for (let z = zx(1436); z < zx(1100); z += 0.01001) g.push(new THREE.BoxGeometry(0.021, 0.0028, 0.0052).translate(0, RAIL_TOP - 0.0006, z)); add(pAction, merge(g), undefined, { real: 'action', minLen: 0.002 }); }
  add(pAction, box(-0.004, 0.004, -AR - 0.012, -AR + 0.002, zx(1050), zx(1035)), undefined, { real: 'action' });       // recoil lug
  well(pAction, [V(-AR - 0.0002, -0.006, zx(1300)), V(-AR - 0.0002, -0.006, zx(1190)), V(-AR - 0.0002, 0.0095, zx(1190)), V(-AR - 0.0002, 0.0095, zx(1300))], V(-1, 0, 0));   // ejection port
  const pBolt = part('bolt', gun);
  const boltSlide = new THREE.Group(); pBolt.add(boltSlide);
  const boltLift = new THREE.Group(); boltSlide.add(boltLift);
  add(boltLift, cylZ(0.0098, zx(1165), zx(1400), 18), undefined, { real: 'bolt' });
  add(boltLift, turn([[0.004, zx(1468)], [0.0062, zx(1468)], [0.016, zx(1462)], [0.016, zx(1402)], [0.0098, zx(1398)]], 20), undefined, { real: 'black' });   // shroud
  { const root = V(-0.009, 0.004, zx(1420)), elbow = V(-0.03, -0.004, zx(1426)), knob = V(-0.05, yy(468), zx(1432));
    add(boltLift, merge([rod(root, elbow, 0.0055, 10), rod(elbow, knob, 0.005, 10)]), undefined, { real: 'action' });
    add(boltLift, new THREE.IcosahedronGeometry(0.0125, 1).translate(knob.x, knob.y, knob.z), undefined, { real: 'black' }); }
  const pSafe = part('safety', gun), SAF = V(-0.02, -0.004, zx(1446));
  const safeH = hinge(pSafe, SAF, V(1, 0, 0), 'x');
  add(safeH.inner, merge([cylX(0.0045, -0.017, -0.0215, SAF.y, SAF.z, 12), rbox(0.003, 0.004, 0.017, -0.0215, SAF.y, SAF.z + 0.008, 0.001)]), undefined, { real: 'black' });

  // ═════ the folding butt: its shell, cheek piece, pad and monopod, on a hinge at the left of the joint ═════
  const pButt = part('stock', gun), HINGE = V(CX + 0.006, 0, zx(1545));
  add(pStock, merge([cylY(0.0075, yy(505), yy(484), HINGE.x, HINGE.z, 12), cylY(0.0075, yy(482), yy(462), HINGE.x, HINGE.z, 12)]), undefined, { real: 'black' });
  const fold = new THREE.Group(); fold.position.copy(HINGE); pButt.add(fold);
  const buttG = new THREE.Group(); buttG.position.copy(HINGE).negate(); fold.add(buttG);
  add(buttG, across(profile(BUTT), -BX, BX, 0.003, 4));
  for (const k of SIDES) for (const [ix, iy] of SCREWS) if (ix >= 1545) add(buttG, cylX(0.0042, k * BX, k * (BX + 0.0012), yy(iy), zx(ix), 6), undefined, { real: 'black' });
  add(buttG, cylX(0.009, BX, BX + 0.002, yy(486), zx(1690), 8), undefined, { real: 'black' });                    // the butt's adjuster wheel
  const pPad = part('buttpad', buttG);
  add(pPad, across(profile(PAD), -0.024, 0.024, 0.004, 4), undefined, { real: 'rubber' });
  for (const k of SIDES) lines(pPad, [[V(k * 0.0242, yy(452), zx(1812)), V(k * 0.0242, yy(626), zx(1812))]]);
  const pCheek = part('cheek', buttG), cheekG = new THREE.Group(); pCheek.add(cheekG);
  add(cheekG, across(profile(CHEEK), -0.02, 0.02, 0.003, 3), undefined, { real: 'poly' });
  for (const ix of [1655, 1760]) add(cheekG, cylY(0.0035, yy(442) - 0.03, yy(442), 0, zx(ix), 10), undefined, { real: 'steel' });   // its posts, into the butt
  const pMono = part('monopod', buttG), MZ = zx(1748), MY = yy(578);
  add(pMono, cylY(0.0075, MY - 0.022, MY, 0, MZ, 12), undefined, { real: 'black' });
  const spike = new THREE.Group(); pMono.add(spike);
  add(spike, cylY(0.0048, MY - 0.07, MY - 0.01, 0, MZ, 10), undefined, { real: 'steel' });
  add(spike, turn([[0, -0.005], [0.016, -0.004], [0.018, 0], [0.016, 0.004], [0, 0.004]], 20).rotateX(-Math.PI / 2).translate(0, MY - 0.035, MZ), undefined, { real: 'black' });   // the knurled wheel
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; lines(spike, [[V(Math.cos(a) * 0.018, MY - 0.039, MZ + Math.sin(a) * 0.018), V(Math.cos(a) * 0.018, MY - 0.031, MZ + Math.sin(a) * 0.018)]]); }
  add(spike, turn([[0, -0.006], [0.012, -0.004], [0.013, 0.003], [0.006, 0.006]], 14).rotateX(-Math.PI / 2).translate(0, MY - 0.074, MZ), undefined, { real: 'rubber' });

  // ═════ the magazine and the round on top of it ═════
  const pMag = part('magazine', gun);
  add(pMag, across(profile(MAG), -0.019, 0.019, 0.0012, 2), undefined, { real: 'magSteel' });
  for (const k of SIDES) pMag.add(E.loopLine([V(k * 0.0192, yy(528), zx(1238)), V(k * 0.0192, yy(528), zx(1340)), V(k * 0.0192, yy(560), zx(1340)), V(k * 0.0192, yy(558), zx(1238))], E.mats.line));
  add(pMag, box(-0.021, 0.021, yy(575), yy(568), zx(1356), zx(1222)), undefined, { real: 'magSteel' });            // floor plate
  const caseLathe = [[0, -0.035], [0.00745, -0.035], [0.00745, -0.0337], [0.0066, -0.033], [0.0066, -0.032], [0.0074, -0.0312], [0.0071, 0.024], [0.0045, 0.0287], [0.0045, 0.0345], [0.0043, 0.0345], [0.0043, 0.031]] as [number, number][];
  const noseLathe = [[0.0043, 0.0345], [0.0043, 0.046], [0.003, 0.0545], [0.0012, 0.0585], [0, 0.0592]] as [number, number][];
  const topRound = new THREE.Group(); pMag.add(topRound);
  add(topRound, turn(caseLathe, 14), undefined, { real: 'brass' }); add(topRound, turn(noseLathe, 14), undefined, { real: 'copper' });
  topRound.position.set(0, yy(452), zx(1300));

  // ═════ barrel (fluted), brake, suppressor ═════
  const pBarrel = part('barrel', gun);
  add(pBarrel, turn([[0.0128, zx(1010)], [0.0118, zx(980)], [0.0105, zx(830)], [0.0094, zx(360)], [0.0094, zx(345)]].map(([r, z]) => [r, z] as [number, number]), 20), undefined, { real: 'barrel' });
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + Math.PI / 6, z0 = zx(825), z1 = zx(385), r0 = 0.0104, r1 = 0.0095;
    const p0 = V(Math.cos(a) * r0, Math.sin(a) * r0, z0), p1 = V(Math.cos(a) * r1, Math.sin(a) * r1, z1);
    lines(pBarrel, [[p0, p1]]);
    realAdd(pBarrel, rod(p0.clone().multiplyScalar(0.985).setZ(z0), p1.clone().multiplyScalar(0.985).setZ(z1), 0.002, 6), 'flute');
  }
  const pBrake = part('brake', gun), brakeZ0 = zx(345), brakeZ1 = zx(300);
  { const g = new THREE.CylinderGeometry(0.0138, 0.0138, brakeZ1 - brakeZ0, 6); g.rotateX(Math.PI / 2); g.translate(0, 0, (brakeZ0 + brakeZ1) / 2); add(pBrake, g, undefined, { real: 'black' }); }
  for (const k of SIDES) well(pBrake, [V(k * 0.0121, -0.005, brakeZ0 + 0.012), V(k * 0.0121, -0.005, brakeZ1 - 0.008), V(k * 0.0121, 0.005, brakeZ1 - 0.008), V(k * 0.0121, 0.005, brakeZ0 + 0.012)], V(k, 0, 0));
  { const b = new THREE.Mesh(new THREE.CircleGeometry(0.0048, 16), E.mats.recess); b.position.z = brakeZ1 + 0.0002; b.raycast = () => {}; pBrake.add(b); }
  const pSupp = part('suppressor', gun), suppG = new THREE.Group(); pSupp.add(suppG);
  const sz0 = zx(312), sz1 = zx(15);
  add(suppG, turn([[0.0145, sz0], [0.0256, sz0 + 0.002], [0.0256, zx(300)], [0.0247, zx(298)], [0.0247, sz1 - 0.006], [0.0228, sz1], [0.0065, sz1]], 24), undefined, { real: 'suppressor' });
  { const b = new THREE.Mesh(new THREE.CircleGeometry(0.0062, 16), E.mats.recess); b.position.z = sz1 + 0.0002; b.raycast = () => {}; suppG.add(b); }

  // ═════ the scope, its rings, turrets and glass ═════
  const pScope = part('scope', gun);
  add(pScope, turn([[0.0185, SZ0], [0.0215, SZ0 + 0.004], [0.0215, zx(1415)], [0.0205, zx(1410)], [0.0212, zx(1405)], [0.0212, zx(1378)], [0.017, zx(1370)],
    [0.017, zx(1095)], [0.0262, zx(1045)], [0.0285, zx(1035)], [0.0285, SZ1 + 0.004], [0.0272, SZ1]], 28, 0, SY), undefined, { real: 'scope' });
  { const g: THREE.BufferGeometry[] = []; for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; g.push(new THREE.BoxGeometry(0.003, 0.002, 0.02).translate(Math.cos(a) * 0.0214, SY + Math.sin(a) * 0.0214, zx(1392))); } add(pScope, merge(g), undefined, { real: 'scope', minLen: 0.002 }); }
  add(pScope, rbox(0.04, 0.038, 0.06, 0, SY, TURRET_Z, 0.008), undefined, { real: 'scope' });                     // turret saddle
  add(pScope, cylY(0.0175, SY + 0.018, SY + 0.036, 0, TURRET_Z, 20), undefined, { real: 'scope' });                // elevation turret
  const capG = new THREE.Group(); capG.position.set(0, 0, TURRET_Z); pScope.add(capG);
  add(capG, cylY(0.0185, SY + 0.036, SY + 0.06, 0, 0, 24), undefined, { real: 'black' });
  for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; lines(capG, [[V(Math.cos(a) * 0.0186, SY + 0.038, Math.sin(a) * 0.0186), V(Math.cos(a) * 0.0186, SY + 0.058, Math.sin(a) * 0.0186)]]); }
  add(capG, box(-0.001, 0.001, SY + 0.0601, SY + 0.0606, -0.0185, -0.011), undefined, { real: 'steel' });
  add(pScope, merge([cylX(0.016, 0.019, 0.026, SY, TURRET_Z, 20), cylX(0.027, 0.026, 0.033, SY, TURRET_Z, 28)]), undefined, { real: 'black' });     // side focus wheel (left)
  add(pScope, merge([cylX(0.0155, -0.019, -0.034, SY, TURRET_Z, 20), cylX(0.0175, -0.034, -0.043, SY, TURRET_Z, 24)]), undefined, { real: 'black' });  // windage (right)
  add(pScope, cylX(0.0125, 0.016, 0.027, SY, zx(1355), 18), undefined, { real: 'black' });                         // illumination knob
  for (const [z, r, back] of [[SZ0 + 0.0015, 0.0185, true], [SZ1 - 0.0015, 0.027, false]] as const) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(r, 28), E.mats.glass); w.position.set(0, SY, z); if (back) w.rotation.y = Math.PI;
    w.userData.real = 'glass'; w.raycast = () => {}; pScope.add(w);
  }
  const pMount = part('mount', gun);
  add(pMount, rbox(0.026, yy(380) - RAIL_TOP, zx(1165) - zx(1335), 0, (yy(380) + RAIL_TOP) / 2, (zx(1165) + zx(1335)) / 2, 0.003), undefined, { real: 'black' });
  for (const z of [zx(1185), zx(1315)]) {
    const s = new THREE.Shape([[-0.022, yy(382)], [0.022, yy(382)], [0.022, SY + 0.012], [0.015, SY + 0.023], [-0.015, SY + 0.023], [-0.022, SY + 0.012]].map(([a, b]) => new THREE.Vector2(a, b)));
    s.holes.push(holeXY(0, SY, 0.0172));
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0012, bevelSegments: 2 }); g.translate(0, 0, z - 0.011);
    add(pMount, g, undefined, { real: 'black' });
    for (const k of SIDES) for (const dz of [-0.005, 0.005]) add(pMount, cylX(0.0024, k * 0.0222, k * 0.025, SY + 0.016, z + dz, 8), undefined, { real: 'steel' });
  }

  // ═════ the bipod: a clamp on the forend's stud, two legs that fold forward ═════
  const pBip = part('bipod', gun), BIP = V(0, yy(540), zx(945));
  add(pBip, rbox(0.048, 0.03, 0.05, 0, yy(522), zx(945), 0.006), undefined, { real: 'black' });
  add(pBip, rbox(0.014, 0.02, 0.026, 0, yy(507), zx(955), 0.003), undefined, { real: 'black' });                // the stud adaptor
  add(pBip, cylX(0.011, 0.024, 0.044, yy(528), zx(905), 16), undefined, { real: 'black' });                         // its tension knob
  const legs: THREE.Group[] = [], legExt: THREE.Group[] = [];
  for (const k of SIDES) {
    const leg = new THREE.Group(); leg.position.set(k * 0.02, BIP.y, BIP.z); pBip.add(leg); legs.push(leg);
    add(leg, cylY(0.0068, -0.13, 0, 0, 0, 10), undefined, { real: 'black' });
    const ext = new THREE.Group(); ext.position.y = 0.06; leg.add(ext); legExt.push(ext);
    add(ext, cylY(0.005, -0.25, -0.12, 0, 0, 10), undefined, { real: 'black' });
    add(ext, turn([[0, -0.012], [0.011, -0.01], [0.012, 0.004], [0.007, 0.012]], 12).rotateX(-Math.PI / 2).translate(0, -0.258, 0), undefined, { real: 'rubber' });
    const coil: THREE.Vector3[] = []; for (let i = 0; i <= 80; i++) { const t = i / 80, a = t * Math.PI * 2 * 22; coil.push(V(Math.cos(a) * 0.0042 + k * 0.009, -0.01 - t * 0.12, Math.sin(a) * 0.0042 + 0.012)); }
    lines(leg, coil.slice(1).map((p, i) => [coil[i], p] as [THREE.Vector3, THREE.Vector3]).filter((_, i) => i % 4 === 0));
    realAdd(leg, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 200, 0.0008, 5), 'steel');
  }

  // ═════ Real view only: markings ═════
  {
    const decal = (parent: THREE.Object3D, w: number, h: number, at: THREE.Vector3, side: number, draw: (x: CanvasRenderingContext2D, W: number, H: number) => void) => {
      const W = 1024, H = Math.round(W * h / w), tex = decalTexture(W, H, x => draw(x, W, H)), mat = decalMaterial(tex, { roughness: 0.6, metalness: 0.1, alphaTest: 0.35 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateY(side * Math.PI / 2).translate(at.x, at.y, at.z), mat);
      m.visible = false; m.raycast = () => {}; parent.add(m); realOnly.push(m); decalMats.push(mat);
    };
    const font = (x: CanvasRenderingContext2D, size: number, col: string) => { x.font = `700 ${size}px Arial, Helvetica, sans-serif`; x.fillStyle = col; x.textBaseline = 'middle'; x.textAlign = 'center'; };
    decal(pStock, 0.07, 0.009, V(CX + 0.00015, yy(452), zx(1250)), 1, (x, W, H) => { font(x, Math.round(H * 0.72), '#2e2418'); x.fillText('L115A3 · CAL 8.59 MM', W / 2, H / 2); });
    decal(pStock, 0.024, 0.01, V(-CX - 0.00015, yy(452), zx(1440)), -1, (x, W, H) => { font(x, Math.round(H * 0.6), '#2e2418'); x.fillText('S       F', W / 2, H / 2); });
  }

  // ═════ muzzle flashes (accent glow; fireballs in the Real view) ═════
  const flashMat = E.glowMat();
  const coneGeo = (r: number, l: number) => { const g = new THREE.ConeGeometry(r, l, 7, 1, true); g.rotateX(-Math.PI / 2); g.translate(0, 0, l / 2); return g; };
  const flashMesh = new THREE.Mesh(coneGeo(0.03, 0.09), flashMat); flashMesh.raycast = () => {}; flashMesh.visible = false; gun.add(flashMesh);
  const portFlash = new THREE.Group(); gun.add(portFlash);
  for (const k of SIDES) { const m = new THREE.Mesh(coneGeo(0.02, 0.055), flashMat); m.rotation.y = k * Math.PI / 2 * 0.85; m.position.set(k * 0.012, 0, (brakeZ0 + brakeZ1) / 2); m.raycast = () => {}; portFlash.add(m); }
  portFlash.visible = false;
  const flashGlow = E.glowPoints([V(0, 0, 0)], 0.32); gun.add(flashGlow);
  const flashLight = new THREE.PointLight(E.accent.getHex(), 0, 1.8, 2); gun.add(flashLight); E.accentLights.push(flashLight);
  const muzzle = V(0, 0, sz1);
  const fireball = makePlume(gun, V(0, 0, brakeZ1), V(0, 0, 1), 0.06, 0.06, 0.18, 31);
  const portBalls = SIDES.map((k, i) => makePlume(gun, V(k * 0.012, 0, (brakeZ0 + brakeZ1) / 2), V(k, 0.1, -0.35).normalize(), 0.035, 0.035, 0.1, 32 + i));
  let realOn = false;

  // ═════ cases and live rounds thrown from the ejection port ═════
  type Brass = { g: THREE.Group; line: THREE.Group; real: THREE.Group; v: THREE.Vector3; spin: THREE.Vector3; rest: boolean; bounced: boolean };
  const brass: Brass[] = [];
  const caseReal = new THREE.LatheGeometry(caseLathe.map(([r, y]) => new THREE.Vector2(r, y)), 16), noseReal = new THREE.LatheGeometry(noseLathe.map(([r, y]) => new THREE.Vector2(r, y)), 16);
  const caseLine = new THREE.CylinderGeometry(0.0074, 0.0074, 0.07, 10), noseLine = new THREE.ConeGeometry(0.0043, 0.025, 10).translate(0, 0.047, 0);
  let inHand = false, trigDelay = 30, flashGain = 1, brassMax = 10;
  let hold: RangeHold | null = null;
  const ground = (x: number, z: number) => hold ? hold.ground(x, z) : 0;
  const drop = (b: Brass) => { b.g.removeFromParent(); b.line.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); };
  function eject(live: boolean) {
    if (brass.length >= brassMax) drop(brass.shift()!);
    const g = new THREE.Group(), line = new THREE.Group(), real = new THREE.Group(); g.add(line, real); E.scene.add(g);
    add(line, caseLine.clone()); if (live) add(line, noseLine.clone());
    const pieces: [THREE.BufferGeometry, THREE.Material][] = [[caseReal, RM.brass]]; if (live) pieces.push([noseReal, RM.copper]);
    for (const [geo, mat] of pieces) { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; real.add(m); }
    line.visible = !realOn; real.visible = realOn;
    gun.updateMatrixWorld();
    g.position.copy(gun.localToWorld(V(-AR - 0.008, 0.004, zx(1245))));
    g.rotation.set(0, 0, Math.PI / 2); g.quaternion.premultiply(gun.quaternion);
    const r = () => Math.random() - 0.5;
    brass.push({ g, line, real, v: V(-1.5 + r() * 0.4, 0.9 + r() * 0.3, -0.3 + r() * 0.3).applyQuaternion(gun.quaternion), spin: V(r() * 26, r() * 18, 20 + r() * 8), rest: false, bounced: false });
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
        snd.burst(0.18, 0.42, { type: 'lowpass', freq: 1000, attack: 0.002 }); snd.tone(70, 0.36, 0.3, { type: 'triangle', to: 36 });
        snd.burst(0.02, 0.32, { freq: 3000, q: 0.8 });                                  // the bullet's own crack
      } else {
        snd.burst(0.26, 1, { freq: 1600, q: 0.45, attack: 0.001 }); snd.burst(0.85, 0.65, { type: 'lowpass', freq: 180 });
        snd.tone(48, 0.6, 0.52, { type: 'triangle', to: 24 }); snd.burst(0.035, 0.7, { freq: 4400, q: 0.7 });
      }
    },
    lift() { snd.click(0, 0.55); snd.tone(650, 0.04, 0.05, { type: 'square' }); },
    back() { snd.burst(0.15, 0.1, { freq: 1400, q: 2 }); snd.click(0.13, 0.6); },
    forward() { snd.burst(0.11, 0.09, { freq: 1600, q: 2 }); snd.click(0.1, 0.7); },
    down() { snd.thunk(0); snd.click(0.005, 0.6); snd.tone(850, 0.04, 0.05, { type: 'square' }); },
    magOut() { snd.click(0, 1.0); snd.burst(0.05, 0.08, { freq: 900, q: 1.5, at: 0.04 }); },
    magIn() { snd.click(0.18, 0.75); snd.thunk(0.19); },
    safety() { snd.click(0, 1.3); snd.tone(2600, 0.02, 0.03, { type: 'square' }); },
    stock() { snd.click(0, 0.85); snd.thunk(0.02); },
    bipod() { snd.tone(1400, 0.08, 0.04, { type: 'sine', to: 900 }); snd.click(0.06, 1); },
    screw() { for (let i = 0; i < 5; i++) snd.click(i * 0.06, 1.4); },
    supp() { snd.burst(0.3, 0.05, { freq: 1100, q: 3 }); snd.click(0.3, 0.8); },
  };

  // ═════ state ═════
  const st = {
    rounds: CAP, chamber: false, spent: false, magIn: true, safe: true,
    folded: false, bipod: true, supp: true, mono: false, cheek: false, dial: 0,
    magT: 0, foldT: 0, bipT: 1, suppT: 1, safeT: 1, monoT: 0, cheekT: 0,
    cycle: null as null | { t0: number; did: number },
    shotAt: -1, trigAt: -1,
  };
  const busy = () => !!st.cycle;
  const BOLT_S = 0.76;

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
    monopod() { st.mono = !st.mono; sfx.screw(); },
    cheek() { st.cheek = !st.cheek; sfx.stock(); },
    suppressor() { if (st.suppT > 0 && st.suppT < 1) return; st.supp = !st.supp; sfx.supp(); },
    range() {},
    demo() {},
  } satisfies Record<string, () => void>;

  // ═════ the range ═════
  const rangeGun: RangeGun = {
    name: 'L115A3', calibre: '.338 Lapua Mag', root: gun, kind: 'rifle', site: 'field',
    sight: { rear: SCOPE.rear, front: SCOPE.front }, muzzle, relief: SCOPE.relief,
    optic: () => SCOPE,
    grip: { web: V(0, yy(512), zx(1478)), down: V(0, -0.95, 0.31).normalize(), length: 0.09, depth: 0.052, half: 0.016, trigger: V(0, yy(525), zx(1416)), thumbY: -0.014, frameHalf: CX, fingers: 0.03 },
    fore: { at: V(0, yy(467), zx(1080)), r: 0.034, dir: V(0, 0, 1) },
    hip: V(0.13, -0.19, -0.3),
    recoil: { rise: 2.6 * DEG, push: 0.03, cam: 0.55 * DEG },
    trigger() {
      if (busy()) return 'busy';
      const r = st.safe ? 'safe' : !st.chamber || st.spent ? 'click' : 'shot';
      act.fire();
      return r;
    },
    loud: () => st.supp ? 0.35 : 1,
    keys: [['U J', 'dial elevation'], ['N', 'dial the spotter’s elevation'], ['R', 'work the bolt'], ['C', 'stand / sit'], ['B', 'bipod']],
    ballistics: () => ({ v0: V0, k: DRAG, zero: 100 }),
    turret: { step: 0.1, max: 25, set(m) { st.dial = m; } },
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
    const idle = () => !busy() && [st.magT, st.foldT, st.suppT, st.monoT, st.cheekT].every(t => t === 0 || t === 1) && Math.abs(st.bipT - (st.bipod ? 1 : 0)) < 0.01;
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
      [() => act.monopod(), 900],
      [() => act.monopod(), 900],
      [() => act.cheek(), 800],
      [() => act.cheek(), 800],
      [() => act.bipod(), 900],
      [() => act.bipod(), 900],
      [() => act.stock(), 1300],
      [() => act.stock(), 1300],
      [() => act.suppressor(), 1500],
      [() => act.safety(), 500],
      [() => act.fire(), 900],                                                       // with the brake bare
      [() => act.bolt(), 900],
      [() => act.safety(), 500],
      [() => act.suppressor(), 1500],
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
    st.suppT = approach(st.suppT, st.supp ? 1 : 0, 0.9 * dt);
    st.safeT = approach(st.safeT, st.safe ? 1 : 0, 10 * dt);
    st.monoT = approach(st.monoT, st.mono ? 1 : 0, 1.4 * dt);
    st.cheekT = approach(st.cheekT, st.cheek ? 1 : 0, 2 * dt);

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
    safeH.set(st.safeT * 70 * DEG);
    pMag.position.y = -MAG_DROP * ease(st.magT); pMag.visible = st.magT < 0.999 || !inHand;
    fold.rotation.y = -Math.PI * ease(st.foldT);                   // forward along the left side
    cheekG.position.y = 0.018 * ease(st.cheekT);
    spike.position.y = -0.045 * ease(st.monoT); spike.rotation.y = st.monoT * Math.PI * 6;   // screwed down
    const b = ease(st.bipT);
    legs.forEach((l, i) => { l.rotation.set(THREE.MathUtils.lerp(-Math.PI / 2 + 0.06, -0.1, b), 0, (i ? -1 : 1) * 0.17 * b); });
    legExt.forEach(e => { e.position.y = approach(e.position.y, inHand && st.bipod ? 0 : 0.06, 0.25 * dt); });
    // the suppressor screws on over the brake: it comes in from the front, turning
    const s = ease(st.suppT);
    suppG.visible = st.suppT > 0.01; suppG.position.z = (1 - s) * 0.28; suppG.rotation.z = (1 - s) * Math.PI * 4;
    muzzle.set(0, 0, st.supp && st.suppT > 0.99 ? sz1 : brakeZ1);
    capG.rotation.y = -st.dial / 10 * Math.PI * 2;

    // flashes
    const fk = flashK(now), supp = st.supp && st.suppT > 0.99, k = supp ? 0.25 : 1;
    flashMesh.position.copy(muzzle); flashGlow.position.copy(muzzle).z += 0.02; flashLight.position.copy(muzzle).z += 0.08;
    flashMesh.visible = !realOn && fk > 0.04; flashMat.emissiveIntensity = 2.4 * fk * k; flashMesh.scale.setScalar((0.8 + fk * 0.7) * (supp ? 0.5 : 1));
    portFlash.visible = !realOn && !supp && fk > 0.04;
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
        if (!br.bounced && br.v.y < -0.4) { br.bounced = true; br.v.set(br.v.x * 0.3, -br.v.y * 0.22, br.v.z * 0.3); br.spin.multiplyScalar(0.3); snd.tone(2200, 0.09, 0.035); }
        else { br.rest = true; br.g.rotation.set(0, br.g.rotation.y, Math.PI / 2); snd.tone(2000, 0.06, 0.02); }
      }
    }
    for (const m of mags) {
      if (m.rest) continue;
      m.v.y -= 9.8 * dt; m.g.position.addScaledVector(m.v, dt); m.g.rotation.x += m.spin * dt;
      const gy = ground(m.g.position.x, m.g.position.z) + 0.02;
      if (m.g.position.y <= gy) { m.g.position.y = gy; m.rest = true; m.g.rotation.set(0, m.g.rotation.y, Math.PI / 2); snd.tone(900, 0.08, 0.05); snd.thunk(0); }
    }
  }

  function readout() {
    if (rng?.on) return 'long-distance range · point 3';
    const p: string[] = [];
    p.push(st.magIn ? `${st.rounds} in magazine` : 'magazine out');
    p.push(st.chamber ? (st.spent ? 'fired case in chamber' : 'round chambered') : 'chamber empty');
    p.push(st.safe ? 'safe' : 'fire');
    p.push(st.bipod ? 'bipod down' : 'bipod folded');
    if (st.mono) p.push('monopod down');
    if (st.supp) p.push('suppressed');
    if (st.folded) p.push('butt folded');
    return p.join(' · ');
  }

  const real: RealSpec = {
    focus: V(0, 0.15, 0.4), size: 1.5, hide: [bench.deck], bench: MAT,
    materials: { ...RM, body: RM.stock },
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
      fireball.set(fk * (supp ? 0.2 : 1), now); portBalls.forEach(p => p.set(supp ? 0 : fk * 0.8, now));
      flashLight.color.setHex(0xffa24a);
    },
  };

  if (arrive === 'range') setTimeout(() => act.range(), 0);

  return {
    pickRoot: gun, parts: K.parts, real,
    view: { target: V(0, 0.2, 0.4), dist: 2.5, min: 0.4, max: 7 },
    actions: act, passive: [],
    keyDown(k, e) { if (rng?.on) return rng.keyDown(k, e); return false; },
    keyUp(k) { if (rng?.on) rng.keyUp(k); },
    blur() { rng?.blur(); },
    hud: () => rng?.hud() ?? null,
    on: () => ({ range: !!rng?.on, demo: script.active, fire: st.shotAt > 0 && performance.now() - st.shotAt < 200, bolt: !!st.cycle, magazine: st.magIn, safety: !st.safe, stock: st.folded, bipod: st.bipod, monopod: st.mono, cheek: st.cheek, suppressor: st.supp }),
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
