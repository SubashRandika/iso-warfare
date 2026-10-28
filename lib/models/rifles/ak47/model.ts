// AK-47 assault rifle, shown in its AKM form (the 1959 modernisation: stamped receiver, laminated wood): a working
// rock-in magazine, a bolt carrier with its long-stroke gas piston and the reciprocating charging handle on the right,
// the long selector lever (safe up, automatic in the middle, single shots at the bottom), and a field strip that takes
// the dust cover, recoil spring and bolt carrier out and lays them beside the rifle.
// Coordinates in metres: +z toward the muzzle, +y up, +x to the rifle's left; the bore axis is y = 0 and z = 0 is the
// back of the receiver. Like every small arm it floats raised above its mat with no stand.
// The side profiles are traced from a right-side photograph (800 × 533): 719 px from muzzle to buttplate for the
// AKM's 880 mm, so 1.224 mm per pixel both ways (the receiver comes out 70 mm tall and the magazine 250 mm along its
// curve, as they should). Profiles below are written in that photo's pixels (ix, iy) and converted by `px`.
// The receiver is open: two stamped walls and a floor with the ejection port and handle slot notched into the top of
// the right wall, so with the dust cover off the carrier lifts out of a real channel. Accent (live) part: the flash.
// Real view: blued sheet steel, varnished laminated birch with its layered grain, a plum phenolic grip, a ribbed steel
// magazine, a chromed bolt carrier, stamped selector markings (АВ automatic, ОД single), lacquered steel cases.
// Range (key G, Real view): shouldered on lane 3 of the indoor range (lib/range/) on the iron sights, automatic fire
// while the trigger is held.
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
import type { RangeGun } from '../../../range/types';
import type { Range } from '../../../range/range';

const CAP = 30;
const GY = 0.3;                                             // bore axis above the mat
const MAT = { w: 0.5, d: 1.2, cx: 0, cz: 0.21 };            // the bench mat under the rifle (both styles)
const BACK = 0.085;                                         // bolt carrier travel
const MAG_DROP = GY - 0.2;                                  // until the magazine meets the mat
type Mode = 'safe' | 'auto' | 'semi';
const MODES: Mode[] = ['safe', 'auto', 'semi'];             // the lever's notches, top to bottom
const SEL_DEG = { safe: 0, auto: 2.8, semi: 5.6 };          // the lever turns down about its rear pivot

// ── the photograph's pixels → rifle metres ──
const PX = 1.224e-3, IX0 = 570, IY0 = 219.5;                // scale; the back of the receiver and the bore axis
const zx = (ix: number) => (IX0 - ix) * PX, yy = (iy: number) => (IY0 - iy) * PX;
type Cmd = ['M', number, number] | ['L', number, number] | ['Q', number, number, number, number];
const px = (cmds: Cmd[]): Cmd[] => cmds.map(c => c[0] === 'Q' ? ['Q', zx(c[1]), yy(c[2]), zx(c[3]), yy(c[4])] : [c[0], zx(c[1]), yy(c[2])]);
const trace = (p: THREE.Path, cmds: Cmd[]) => cmds.forEach(c => c[0] === 'M' ? p.moveTo(c[1], c[2]) : c[0] === 'L' ? p.lineTo(c[1], c[2]) : p.quadraticCurveTo(c[1], c[2], c[3], c[4]));
/** a side profile in (z, y), from photo pixels, with optional holes (pixel paths or ready-made paths in metres) */
const profile = (cmds: Cmd[], holes: (Cmd[] | THREE.Path)[] = []) => {
  const s = new THREE.Shape(); trace(s, px(cmds));
  holes.forEach(h => { if (h instanceof THREE.Path) s.holes.push(h); else { const p = new THREE.Path(); trace(p, px(h)); s.holes.push(p); } });
  return s;
};
/** extrude a (z, y) profile across x0..x1 with every edge rounded by `bevel` in `segs` steps; the outline stays put */
const across = (s: THREE.Shape, x0: number, x1: number, bevel = 0.001, segs = 1) => {
  const g = new THREE.ExtrudeGeometry(s, { depth: x1 - x0 - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: segs, curveSegments: 10 });
  g.rotateY(-Math.PI / 2); g.translate(x1 - bevel, 0, 0);
  return g;
};
/** a ring of (radius, z) points turned about the z axis at (x, y) */
const turn = (pts: [number, number][], segs: number, x = 0, y = 0) => {
  const g = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), segs);
  g.rotateX(Math.PI / 2); g.translate(x, y, 0); return g;
};
const cylZ = (r: number, z0: number, z1: number, segs = 16, x = 0, y = 0) => { const g = new THREE.CylinderGeometry(r, r, z1 - z0, segs); g.rotateX(Math.PI / 2); g.translate(x, y, (z0 + z1) / 2); return g; };
const cylX = (r: number, x0: number, x1: number, y: number, z: number, segs = 16) => { const g = new THREE.CylinderGeometry(r, r, Math.abs(x1 - x0), segs); g.rotateZ(Math.PI / 2); g.translate((x0 + x1) / 2, y, z); return g; };
const rbox = (w: number, h: number, d: number, x: number, y: number, z: number, r = Math.min(w, h, d) * 0.3) => new RoundedBoxGeometry(w, h, d, 2, r).translate(x, y, z);
const roundHole = (z: number, y: number, r: number) => { const p = new THREE.Path(); p.absarc(z, y, r, 0, Math.PI * 2, true); return p; };

// ── side profiles, in the photo's pixels ──
/** a receiver wall: the left one whole; the right one with the ejection port and the handle's slot along its top */
const WALL_L: Cmd[] = [['M', 352, 205], ['L', 566, 205], ['L', 570, 214], ['L', 570, 246], ['L', 352, 243]];
const WALL_R: Cmd[] = [['M', 352, 205], ['L', 359.2, 205], ['L', 359.2, 216.2], ['L', 447.5, 216.2], ['L', 447.5, 205], ['L', 566, 205], ['L', 570, 214], ['L', 570, 246], ['L', 352, 243]];
const DUST: Cmd[] = [['M', 372, 205], ['L', 372, 193], ['Q', 372, 188, 377, 188], ['L', 540, 188.5], ['Q', 553, 190, 561, 200], ['Q', 566, 206, 566, 213], ['L', 560, 213], ['L', 556, 205]];
const RSB: Cmd[] = [['M', 316, 222], ['L', 316, 185], ['Q', 316, 180, 321, 180], ['L', 334, 180], ['L', 372, 187], ['L', 372, 222]];
const LEAF: Cmd[] = [['M', 334, 182.5], ['L', 371.5, 178], ['L', 371.5, 176.5], ['L', 366, 176.8], ['L', 334, 180.8]];
const UPPER_HG: Cmd[] = [['M', 222, 205], ['L', 222, 193], ['Q', 222, 185, 231, 185], ['L', 312, 185], ['Q', 316, 185, 316, 189], ['L', 316, 205]];
const LOWER_HG: Cmd[] = [['M', 222, 208], ['L', 352, 208], ['L', 352, 245], ['Q', 345, 246.5, 338, 243], ['L', 300, 239], ['L', 250, 235], ['Q', 226, 233, 222, 230]];
const GAS_BLOCK: Cmd[] = [['M', 156, 224], ['L', 156, 214], ['Q', 160, 206, 166, 201], ['L', 170, 201], ['L', 170, 191], ['L', 152, 190], ['Q', 144, 191, 141, 197], ['L', 141, 224]];
const TOWER: Cmd[] = [['M', 89, 225], ['L', 89, 213], ['L', 81, 190], ['L', 63, 190], ['L', 61, 200], ['L', 61, 225]];
const EAR: Cmd[] = [['M', 81, 190], ['L', 77, 178], ['L', 64, 178], ['L', 63, 190]];
const STOCK: Cmd[] = [['M', 570, 215], ['L', 598, 222], ['Q', 612, 222.5, 624, 216], ['L', 752, 218.5], ['Q', 756, 219, 755.5, 222], ['L', 751, 294], ['L', 742, 294.5], ['L', 630, 257.5], ['Q', 615, 252, 605, 250], ['L', 570, 249]];
const BUTTPLATE: Cmd[] = [['M', 752, 218.5], ['L', 757, 219], ['Q', 760, 220, 759.5, 223], ['L', 755.5, 296.5], ['L', 750.5, 296], ['L', 751, 294], ['L', 755.5, 222], ['Q', 756, 219, 752, 218.5]];
/** pistol grip, raked about 16°, a little fuller at the base */
const GRIP: Cmd[] = [['M', 502, 246], ['L', 553, 246], ['L', 551, 253], ['Q', 558, 288, 565, 320], ['Q', 567, 329, 560, 331], ['L', 541, 335.5], ['Q', 533, 337, 532, 330], ['Q', 521, 290, 510, 258], ['Q', 507, 250, 502, 246]];
const GUARD: Cmd[] = [['M', 461, 245], ['L', 503, 245], ['L', 503, 277], ['L', 468, 277], ['Q', 461, 277, 461, 270]];
const GUARD_HOLE: Cmd[] = [['M', 465, 247], ['L', 500, 247], ['L', 500, 274], ['L', 469, 274], ['Q', 465, 274, 465, 270]];
const PADDLE: Cmd[] = [['M', 449, 246], ['L', 461, 246], ['L', 461, 252], ['L', 458, 275], ['Q', 455, 278, 452, 275], ['L', 449, 252]];
const TRIGGER: Cmd[] = [['M', 489, 245], ['L', 496, 245], ['Q', 490, 255, 494, 266], ['Q', 494, 270, 490, 268], ['Q', 484, 258, 489, 245]];
/** the selector lever on the right: a long blade from its pivot at the back, a thumb tab at its front */
const LEVER: Cmd[] = [['M', 553, 222], ['Q', 554, 231, 546, 231], ['L', 470, 216.5], ['L', 446, 216.5], ['Q', 440, 216.5, 440, 211], ['L', 440, 204.5], ['L', 450, 204.5], ['L', 470, 208], ['L', 546, 217.5], ['Q', 552, 216.5, 553, 222]];
/** the curved magazine: the front and rear edges arc forward toward the base */
const MAG: Cmd[] = [['M', 394, 236], ['L', 447, 236], ['L', 446.5, 252], ['Q', 440, 300, 415, 330], ['Q', 395, 358, 371, 384], ['L', 366, 386], ['L', 336, 348], ['Q', 360, 330, 375, 308], ['Q', 391, 280, 393, 255]];
const FLOOR: Cmd[] = [['M', 332, 347], ['L', 338, 343.5], ['L', 373, 385], ['L', 367.5, 390]];
const MAG_PIVOT = new THREE.Vector3(0, yy(240), zx(394));  // the magazine rocks about its front lug

/** finishes for the Real view, by tag; untagged meshes get the blued steel */
function realMaterials() {
  const tex: THREE.Texture[] = [];
  const canvasTex = (w: number, h: number, draw: (x: CanvasRenderingContext2D, w: number, h: number) => void, rep: number, srgb = false) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!, w, h);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.setScalar(rep); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8;
    tex.push(t); return t;
  };
  const noise = (lo: number, span: number) => (x: CanvasRenderingContext2D, w: number, h: number) => {
    const img = x.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) { const v = lo + Math.random() * span; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    x.putImageData(img, 0, 0);
  };
  const grain = canvasTex(128, 128, noise(116, 24), 160);
  // laminated birch, stained and varnished: thin plies (bands across the stock) whose edges wander, with fine grain
  // along them; u runs along the rifle (the profile faces carry UVs in metres), one tile is 0.25 m
  const woodDraw = (bump: boolean) => (x: CanvasRenderingContext2D, w: number, h: number) => {
    const img = x.createImageData(w, h), plies = 40, seed = 3.7;
    const streak = Float32Array.from({ length: h }, () => Math.random());   // per-row grain, so streaks run along u
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const u = i / w, v = j / h;
      const wob = 0.0035 * Math.sin(u * Math.PI * 2 * 2 + seed) + 0.0015 * Math.sin(u * Math.PI * 2 * 5 + v * 7);
      const t = ((v + wob) * plies) % 1, ply = Math.floor((v + wob) * plies);
      const edge = Math.exp(-((t - 0.5) ** 2) / 0.0016);              // the thin glue line between plies, a little darker
      const tone = 0.9 + 0.1 * Math.sin(ply * 12.9898 + seed);         // each ply a slightly different shade
      const jj = (j + Math.round(6 * Math.sin(u * 9 + v * 3))) & (h - 1);
      const fine = 0.94 + 0.07 * (streak[jj] - 0.5) + 0.02 * Math.sin(u * 60 + v * 40) + (Math.random() - 0.5) * 0.025;
      const k = tone * fine * (1 - 0.2 * edge), o = (j * w + i) * 4;
      if (bump) { const g = 128 + 90 * (fine - 0.94) - 30 * edge; img.data[o] = img.data[o + 1] = img.data[o + 2] = g; }
      else { img.data[o] = 156 * k; img.data[o + 1] = 64 * k; img.data[o + 2] = 27 * k; }
      img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  };
  const wood = canvasTex(512, 512, woodDraw(false), 4, true), woodBump = canvasTex(512, 512, woodDraw(true), 4);
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  const M = {
    blued: new THREE.MeshPhysicalMaterial({ color: 0x1f2022, metalness: 0.5, roughness: 0.5, bumpMap: grain, bumpScale: 0.1, clearcoat: 0.18, clearcoatRoughness: 0.5 }),
    barrel: std({ color: 0x1a1b1d, metalness: 0.7, roughness: 0.36 }),
    sight: std({ color: 0x151617, metalness: 0.35, roughness: 0.72 }),                         // sights left matt, no glare
    wood: new THREE.MeshPhysicalMaterial({ map: wood, roughness: 0.46, bumpMap: woodBump, bumpScale: 0.25, clearcoat: 0.55, clearcoatRoughness: 0.32 }),
    bakelite: new THREE.MeshPhysicalMaterial({ color: 0x4a2822, roughness: 0.48, bumpMap: grain, bumpScale: 0.15, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
    magSteel: std({ color: 0x232427, metalness: 0.55, roughness: 0.46, bumpMap: grain, bumpScale: 0.12 }),
    chrome: std({ color: 0xbcc0c4, metalness: 1, roughness: 0.22 }),
    steel: std({ color: 0x9fa3a6, metalness: 1, roughness: 0.34 }),
    caseSteel: std({ color: 0x67603c, metalness: 0.65, roughness: 0.34, side: THREE.DoubleSide }),   // lacquered steel case
    copper: std({ color: 0xa8673f, metalness: 1, roughness: 0.32 }),
    dark: std({ color: 0x111112, roughness: 0.9, side: THREE.DoubleSide }),
  };
  return { M, tex };
}

const model: ModelFactory = ({ E, snd, script, say, style, def, open, arrive }) => {
  const K = makeKit(E, { unit: 0.05 });
  const { add, part, hinge, box, well, lines } = K;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const gun = K.root; gun.position.y = GY;
  const bench = buildPlate(E, { ...MAT, grid: 0.01, ruler: true, shadow: [0.22, 1.1, 0, 0.21] });
  const { M: RM, tex: RTex } = realMaterials();
  const realOnly: THREE.Object3D[] = [], decalMats: THREE.Material[] = [];
  /** detail that only shows in the Real view (the hairline view draws it as lines or leaves it out) */
  const realAdd = (parent: THREE.Object3D, geo: THREE.BufferGeometry, tag: string) => {
    const m = add(parent, geo, undefined, { real: tag, lines: false }); m.visible = false; realOnly.push(m); return m;
  };
  const WT = 0.0012, WX = 0.0142;                           // receiver wall thickness, outer half-width

  // ═════ receiver: two stamped walls and a floor round the trunnions; the action's channel open at the top ═════
  const pRec = part('receiver', gun);
  add(pRec, across(profile(WALL_L), WX - WT, WX, 0.0003, 1));
  add(pRec, across(profile(WALL_R), -WX, -WX + WT, 0.0003, 1));
  // floor: under the front trunnion, between the magazine well and the trigger, and behind the trigger group
  for (const [z0, z1] of [[0.218, 0.266], [0.102, 0.152], [0.0, 0.056]] as const) add(pRec, box(-WX, WX, -0.0318 + z0 * 0.012, -0.0306 + z0 * 0.012, z0, z1));
  add(pRec, box(-WX + WT, WX - WT, -0.0298, 0.004, 0.235, 0.2665));                   // front trunnion
  add(pRec, box(-WX + WT, WX - WT, -0.0318, 0.0177, 0.0, 0.03));                      // rear trunnion
  well(pRec, [V(-WX + WT, -0.0262, 0.03), V(WX - WT, -0.0262, 0.03), V(WX - WT, -0.0262, 0.235), V(-WX + WT, -0.0262, 0.235)], V(0, 1, 0));   // inside the channel
  add(pRec, rbox(0.011, 0.024, 0.014, 0, -0.014, 0.072, 0.002), undefined, { real: 'steel' });   // the hammer, seen with the cover off
  for (const z of [0.064, 0.09]) add(pRec, cylX(0.0022, -WX - 0.0004, WX + 0.0004, -0.022, z, 10), undefined, { real: 'steel' });   // hammer and trigger pins
  // the magazine well's mouth in the floor
  well(pRec, [V(-WX, -0.031, 0.152), V(WX, -0.031, 0.152), V(WX, -0.0298, 0.218), V(-WX, -0.0298, 0.218)], V(0, -1, 0));

  // ═════ dust cover: stamped, ribbed along the top; it lifts off first in a field strip ═════
  const pCover = part('dustCover', gun), coverG = new THREE.Group(); pCover.add(coverG);
  add(coverG, across(profile(DUST), -0.0156, 0.0156, 0.0042, 4));
  for (const k of SIDES) lines(coverG, [[V(k * 0.006, yy(187.6), zx(380)), V(k * 0.006, yy(188.2), zx(535))]]);   // the strengthening ribs
  realAdd(coverG, merge(SIDES.map(k => rbox(0.0026, 0.0012, zx(380) - zx(535), k * 0.006, yy(188) + 0.0003, (zx(380) + zx(535)) / 2, 0.0005))), 'blued');

  // ═════ recoil spring and its guide, behind the carrier; the guide's tab locks the cover at the back ═════
  const springG = new THREE.Group(); springG.userData.part = 'dustCover'; gun.add(springG);
  add(springG, cylZ(0.0019, 0.012, 0.128, 8, 0, 0.012), undefined, { real: 'steel' });
  {
    const coils = 22, pts: THREE.Vector3[] = [];
    for (let i = 0; i <= coils * 16; i++) { const t = i / (coils * 16), a = t * coils * Math.PI * 2; pts.push(V(Math.cos(a) * 0.0042, 0.012 + Math.sin(a) * 0.0042, 0.016 + t * 0.108)); }
    add(springG, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), coils * 16, 0.0006, 5), undefined, { real: 'steel', lines: false });
  }
  add(springG, box(-0.0075, 0.0075, 0.0045, 0.0185, 0.004, 0.016), undefined, { real: 'blued' });   // rear plate
  add(springG, box(-0.003, 0.003, 0.0185, 0.0198, 0.0045, 0.0095), undefined, { real: 'sight' });   // the tab through the cover

  // ═════ bolt carrier: chromed, its gas piston fixed in front, the charging handle on the right ═════
  const pCarrier = part('carrier', gun), carrier = new THREE.Group(); pCarrier.add(carrier);
  add(carrier, rbox(0.0204, 0.0185, 0.13, 0, 0.0128, 0.19, 0.003), undefined, { real: 'chrome' });
  add(carrier, box(-0.006, 0.006, 0.014, 0.034, 0.25, 0.288), undefined, { real: 'chrome' });       // the piston's root
  add(carrier, cylZ(0.0045, 0.288, 0.5, 14, 0, yy(196)), undefined, { real: 'chrome' });            // piston (inside the gas tube)
  add(carrier, cylZ(0.0072, 0.2, 0.235, 16), undefined, { real: 'steel' });                          // the bolt
  for (const k of SIDES) add(carrier, box(k * 0.0045, k * 0.0082, -0.003, 0.003, 0.229, 0.235), undefined, { real: 'steel' });   // its locking lugs
  add(carrier, box(-0.0225, -0.0102, 0.0095, 0.0165, 0.238, 0.252), undefined, { real: 'chrome' }); // handle stem, out through the slot
  add(carrier, cylX(0.0048, -0.0215, -0.031, 0.013, 0.245, 14), undefined, { real: 'chrome' });     // and its knob

  // ═════ selector lever on the right, pivoting at the back ═════
  const pSel = part('selector', gun);
  const sel = hinge(pSel, V(-WX, yy(224), zx(548)), V(1, 0, 0), 'x');
  add(sel.inner, across(profile(LEVER), -WX - 0.0019, -WX - 0.0001, 0.0004, 1), undefined, { real: 'blued' });
  add(sel.inner, box(-WX - 0.0062, -WX - 0.0012, yy(213.5), yy(207), zx(447), zx(441)), undefined, { real: 'blued' });   // thumb tab
  add(sel.inner, cylX(0.0055, -WX - 0.0025, -WX, yy(224), zx(548), 16), undefined, { real: 'blued' });                     // pivot boss

  // ═════ trigger, guard, magazine catch ═════
  const pTrig = part('trigger', gun);
  const trig = hinge(pTrig, V(0, yy(246), zx(493)), V(1, 0, 0), 'x');
  add(trig.inner, across(profile(TRIGGER), -0.003, 0.003, 0.0006, 3), undefined, { real: 'blued' });
  add(pRec, across(profile(GUARD, [GUARD_HOLE]), -0.0045, 0.0045, 0.0008, 2));
  const pRel = part('magRelease', gun);
  const paddle = hinge(pRel, V(0, yy(247), zx(455)), V(1, 0, 0), 'x');
  add(paddle.inner, across(profile(PADDLE), -0.007, 0.007, 0.0008, 2), undefined, { real: 'blued' });

  // ═════ pistol grip ═════
  const pGrip = part('grip', gun);
  add(pGrip, across(profile(GRIP), -0.0135, 0.0135, 0.0042, 4), undefined, { real: 'bakelite' });
  for (const k of SIDES) for (let i = 0; i < 6; i++) {                                                // moulded ribs down each side
    const t = (i + 0.5) / 6, top = V(k * 0.0136, yy(262), zx(514 + t * 36)), bot = V(k * 0.0136, yy(322), zx(538 + t * 24));
    lines(pGrip, [[top, bot]]);
    realAdd(pGrip, new THREE.TubeGeometry(new THREE.LineCurve3(top, bot), 1, 0.0007, 6), 'bakelite');
  }

  // ═════ front of the action: rear sight block and leaf, gas tube, handguards ═════
  const pRear = part('rearSight', gun);
  add(pRear, across(profile(RSB), -0.0115, 0.0115, 0.0018, 3), undefined, { real: 'sight' });
  add(pRear, across(profile(LEAF), -0.0065, 0.0065, 0.0005, 1), undefined, { real: 'sight' });
  for (const k of SIDES) add(pRear, box(k * 0.0014, k * 0.0065, yy(177), yy(175.2), zx(371.5), zx(368)), undefined, { real: 'sight' });   // the notch between two ears
  add(pRear, box(-0.0079, 0.0079, yy(183.2), yy(178.6), zx(354), zx(348)), undefined, { real: 'sight' });   // range slider
  const pHand = part('handguard', gun);
  add(pHand, cylZ(0.0062, zx(316), zx(157), 14, 0, yy(196)));                                                 // gas tube
  add(pHand, across(profile(UPPER_HG), -0.0135, 0.0135, 0.0058, 4), undefined, { real: 'wood' });
  add(pHand, across(profile(LOWER_HG), -0.021, 0.021, 0.0065, 4), undefined, { real: 'wood' });
  for (const k of SIDES) lines(pHand, [[V(k * 0.0212, yy(219), zx(232)), V(k * 0.0212, yy(221), zx(344))]]);   // the palm swell's edge
  add(pHand, rbox(0.032, 0.032, 0.011, 0, -0.0008, zx(219.5), 0.003));                                        // handguard retainer

  // ═════ barrel, gas block, front sight, bayonet lug, cleaning rod ═════
  const pBarrel = part('barrel', gun);
  add(pBarrel, cylZ(0.0076, 0.266, 0.432, 18), undefined, { real: 'barrel' });
  add(pBarrel, cylZ(0.0068, 0.432, 0.628, 18), undefined, { real: 'barrel' });
  add(pBarrel, turn([[0.0068, 0.627], [0.0073, 0.628], [0.0073, 0.642], [0.0058, 0.65], [0.0038, 0.65]], 18), undefined, { real: 'barrel' });   // muzzle nut
  add(pBarrel, across(profile(GAS_BLOCK), -0.0095, 0.0095, 0.0018, 3));
  add(pBarrel, box(-0.004, 0.004, yy(236), yy(224), zx(150), zx(141)));                                     // bayonet lug
  const bore = new THREE.Mesh(new THREE.CircleGeometry(0.0039, 16), E.mats.recess); bore.position.set(0, 0, 0.6502); bore.raycast = () => {}; pBarrel.add(bore);
  const pFront = part('frontSight', gun);
  add(pFront, across(profile(TOWER, [roundHole(zx(72), yy(205), 0.0032)]), -0.0065, 0.0065, 0.0012, 2));
  for (const k of SIDES) add(pFront, across(profile(EAR), k > 0 ? 0.0032 : -0.0065, k > 0 ? 0.0065 : -0.0032, 0.0006, 1), undefined, { real: 'sight' });   // the hood's ears
  add(pFront, cylZ(0.0112, zx(89), zx(61), 18));                                                            // its collar round the barrel
  { const post = new THREE.CylinderGeometry(0.0011, 0.0013, yy(181) - yy(190), 8); post.translate(0, (yy(181) + yy(190)) / 2, zx(70)); add(pFront, post, undefined, { real: 'sight' }); }
  const pRod = part('cleaningRod', gun);
  add(pRod, cylZ(0.0027, 0.2, zx(84), 10, 0, yy(230)), undefined, { real: 'blued' });
  add(pRod, cylZ(0.0045, zx(84), zx(80), 12, 0, yy(230)), undefined, { real: 'blued' });
  const IRON = { rear: V(0, yy(177), zx(370)), front: V(0, yy(181), zx(70)) };   // the notch's bottom, the post's tip

  // ═════ stock and buttplate, rear sling swivel ═════
  const pStock = part('stock', gun);
  add(pStock, across(profile(STOCK), -0.0175, 0.0175, 0.0048, 4), undefined, { real: 'wood' });
  add(pStock, across(profile(BUTTPLATE), -0.0182, 0.0182, 0.0012, 2), undefined, { real: 'blued' });
  add(pStock, box(-0.0072, 0.0072, yy(218), yy(214.5), -0.034, 0.0), undefined, { real: 'sight' });                                      // the receiver's tang along the top
  add(pStock, box(-0.0035, 0.0035, yy(296), yy(291.5), zx(726), zx(712)), undefined, { real: 'blued' });  // sling swivel base
  { const ring = new THREE.TorusGeometry(0.0062, 0.0011, 6, 18); ring.rotateY(Math.PI / 2); ring.translate(0, yy(301), zx(719)); add(pStock, ring, undefined, { real: 'blued' }); }

  // ═════ magazine: 30-round steel, ribbed along its curve, rocks about its front lug ═════
  const pMag = part('magazine', gun);
  const magPivot = new THREE.Group(); magPivot.position.copy(MAG_PIVOT); pMag.add(magPivot);
  const magG = new THREE.Group(); magG.position.copy(MAG_PIVOT).negate(); magPivot.add(magG);
  add(magG, across(profile(MAG), -0.014, 0.014, 0.0014, 3), undefined, { real: 'magSteel' });
  add(magG, across(profile(FLOOR), -0.0155, 0.0155, 0.0012, 2), undefined, { real: 'magSteel' });
  {
    // ribs follow the curve: points between the front and rear edges at fixed fractions across the magazine
    const q = (a: number[], c: number[], b: number[]) => new THREE.QuadraticBezierCurve(new THREE.Vector2(zx(a[0]), yy(a[1])), new THREE.Vector2(zx(c[0]), yy(c[1])), new THREE.Vector2(zx(b[0]), yy(b[1])));
    const front = new THREE.CurvePath<THREE.Vector2>(); front.add(q([393, 255], [391, 280], [375, 308])); front.add(q([375, 308], [360, 330], [339, 346]));
    const rear = new THREE.CurvePath<THREE.Vector2>(); rear.add(q([446.5, 252], [440, 300], [415, 330])); rear.add(q([415, 330], [395, 358], [370, 382]));
    const F = front.getSpacedPoints(24), R = rear.getSpacedPoints(24);
    for (const k of SIDES) for (const f of [0.2, 0.36, 0.52, 0.68, 0.84]) {
      const pts = F.map((p, i) => V(k * 0.0141, p.y + (R[i].y - p.y) * f, p.x + (R[i].x - p.x) * f));
      for (let i = 0; i < pts.length - 1; i++) lines(magG, [[pts[i], pts[i + 1]]]);
      realAdd(magG, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.0011, 6), 'magSteel');
    }
  }
  const topRound = new THREE.Group(); magG.add(topRound);
  const caseLathe = [[0, -0.0195], [0.0056, -0.0195], [0.0057, -0.0184], [0.005, -0.0176], [0.005, -0.0166], [0.0056, -0.016], [0.0055, 0.0095], [0.0046, 0.0135], [0.0043, 0.0195], [0.004, 0.0195], [0.004, 0.015]] as [number, number][];
  const noseLathe = [[0.004, 0.0195], [0.004, 0.026], [0.0032, 0.033], [0.0014, 0.0365], [0, 0.037]] as [number, number][];
  { const c = turn(caseLathe, 14), n = turn(noseLathe, 14); c.translate(0, yy(240.5), zx(424)); n.translate(0, yy(240.5), zx(424)); add(topRound, c, undefined, { real: 'caseSteel' }); add(topRound, n, undefined, { real: 'copper' }); }

  // ═════ Real view only: rivets, the magazine-well dimple, stamped markings ═════
  {
    const dome = (r: number) => new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const rivets: THREE.BufferGeometry[] = [];
    for (const k of SIDES) for (const [ix, iy, r] of [[360, 219, 0.0021], [375, 219, 0.0021], [400, 231, 0.0017], [548, 229, 0.0021], [556, 236, 0.0021], [540, 238, 0.0021], [522, 233, 0.0019], [507, 238, 0.0019]] as const) {
      rivets.push(dome(r).rotateZ(-k * Math.PI / 2).translate(k * WX, yy(iy), zx(ix)));
    }
    realAdd(pRec, merge(rivets), 'blued');
    for (const k of SIDES) {                                                    // the dimple that guides the magazine
      const d = new THREE.CircleGeometry(1, 20); d.scale(0.0026, 0.01, 1); d.rotateZ(Math.PI / 2); d.rotateY(k * Math.PI / 2); d.translate(k * (WX + 0.0002), yy(234), zx(422));
      realAdd(pRec, d, 'dark');
    }
    const decal = (parent: THREE.Object3D, w: number, h: number, at: THREE.Vector3, side: number, draw: (x: CanvasRenderingContext2D, W: number, H: number) => void, o: THREE.MeshStandardMaterialParameters = {}) => {
      const W = 1024, H = Math.round(W * h / w), tex = decalTexture(W, H, x => draw(x, W, H)), mat = decalMaterial(tex, { roughness: 0.55, metalness: 0.4, alphaTest: 0.35, ...o });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateY(side * Math.PI / 2).translate(at.x, at.y, at.z), mat);
      m.visible = false; m.raycast = () => {}; parent.add(m); realOnly.push(m); decalMats.push(mat);
      return m;
    };
    const font = (x: CanvasRenderingContext2D, size: number, col: string, weight = 700) => { x.font = `${weight} ${size}px "Arial Narrow", Arial, sans-serif`; x.fillStyle = col; x.textBaseline = 'middle'; x.textAlign = 'center'; };
    // the selector's notches, stamped into the right wall behind the lever's tab: АВ (automatic), ОД (single)
    decal(pRec, 0.012, 0.012, V(-WX - 0.00015, yy(217.5), zx(456)), -1, (x, W, H) => {
      font(x, 330, '#8f8a80'); x.fillText('АВ', W / 2, H * 0.3); x.fillText('ОД', W / 2, H * 0.78);
    }, { roughness: 0.7 });
    // serial number and year on the left of the rear trunnion
    decal(pRec, 0.034, 0.011, V(WX + 0.00015, yy(231), zx(530)), 1, (x, W, H) => { font(x, 210, '#8f8a80'); x.fillText('ЕН 1458', W / 2, H * 0.3); font(x, 190, '#8f8a80'); x.fillText('1974', W / 2, H * 0.78); }, { roughness: 0.7 });
    // the rear sight's range scale along the leaf's top
    const leafTop = decal(pRear, 0.036, 0.0055, V(0, 0, 0), 1, (x, W, H) => {
      font(x, 110, '#77736b'); ['П', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].forEach((t, i) => x.fillText(t, W * (0.05 + i * 0.09), H / 2));
    });
    leafTop.geometry.dispose();
    const slope = Math.atan2(yy(178) - yy(182.5), zx(371.5) - zx(334));
    leafTop.geometry = new THREE.PlaneGeometry(0.0055, 0.034).rotateX(-Math.PI / 2).rotateX(-slope).translate(0, (yy(178) + yy(182.5)) / 2 + 0.0006, (zx(371.5) + zx(334)) / 2 - 0.002);
  }

  // ═════ muzzle flash: accent glow, and in the Real view a fireball ═════
  const flashMat = E.glowMat();
  const flashMesh = new THREE.Mesh((() => { const g = new THREE.ConeGeometry(0.03, 0.09, 7, 1, true); g.rotateX(-Math.PI / 2); g.translate(0, 0, 0.045); return g; })(), flashMat);
  flashMesh.raycast = () => {}; flashMesh.visible = false; flashMesh.position.z = 0.65; gun.add(flashMesh);
  const flashGlow = E.glowPoints([V(0, 0, 0.66)], 0.32); gun.add(flashGlow);
  const flashLight = new THREE.PointLight(E.accent.getHex(), 0, 1.6, 2); flashLight.position.set(0, 0.01, 0.7); gun.add(flashLight); E.accentLights.push(flashLight);
  const fireball = makePlume(gun, V(0, 0, 0.65), V(0, 0, 1), 0.08, 0.08, 0.24, 7);
  let realOn = false;
  const muzzle = V(0, 0, 0.65);

  // ═════ cases and live rounds thrown from the ejection port ═════
  type Brass = { g: THREE.Group; line: THREE.Group; real: THREE.Group; v: THREE.Vector3; spin: THREE.Vector3; rest: boolean; bounced: boolean };
  const brass: Brass[] = [], CASE_R = 0.0056;
  const caseReal = new THREE.LatheGeometry(caseLathe.map(([r, y]) => new THREE.Vector2(r, y)), 16), noseReal = new THREE.LatheGeometry(noseLathe.map(([r, y]) => new THREE.Vector2(r, y)), 16);
  const caseLine = new THREE.CylinderGeometry(CASE_R, CASE_R, 0.039, 10), noseLine = new THREE.ConeGeometry(0.004, 0.0175, 10).translate(0, 0.028, 0);
  let inHand = false, trigDelay = 30, flashGain = 1, brassMax = 14;
  let ground = (_x: number, _z: number) => 0;
  const drop = (b: Brass) => { b.g.removeFromParent(); b.g.traverse(o => { const m = o as THREE.Mesh; if (m.geometry && m.geometry !== caseReal && m.geometry !== noseReal) m.geometry.dispose(); }); };
  function eject(live: boolean) {
    if (brass.length >= brassMax) drop(brass.shift()!);
    const g = new THREE.Group(), line = new THREE.Group(), real = new THREE.Group(); g.add(line, real); E.scene.add(g);
    add(line, caseLine.clone()); if (live) add(line, noseLine.clone());
    const pieces: [THREE.BufferGeometry, THREE.Material][] = [[caseReal, RM.caseSteel]]; if (live) pieces.push([noseReal, RM.copper]);
    for (const [geo, mat] of pieces) { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; real.add(m); }
    line.visible = !realOn; real.visible = realOn;
    gun.updateMatrixWorld();
    g.position.copy(gun.localToWorld(V(-0.017, 0.011, 0.2 + carrierZ * 0.3)));
    g.rotation.set(0, 0, Math.PI / 2); g.quaternion.premultiply(gun.quaternion);
    const r = () => Math.random() - 0.5;
    const v = V(-2.1 + r() * 0.6, 0.9 + r() * 0.3, 0.4 + r() * 0.3).applyQuaternion(gun.quaternion);   // thrown hard to the right
    brass.push({ g, line, real, v, spin: V(r() * 30, r() * 20, 22 + r() * 10), rest: false, bounced: false });
  }

  // ═════ magazines dropped in the hands: a copy falls to the floor (the last three stay) ═════
  type DropMag = { g: THREE.Group; v: THREE.Vector3; spin: number; rest: boolean };
  const mags: DropMag[] = [], MAG_C = V(0, -0.1, zx(400));
  function dropMag() {
    if (mags.length >= 3) mags.shift()!.g.removeFromParent();
    gun.updateMatrixWorld(true);
    const g = new THREE.Group(), copy = pMag.clone(true);
    copy.traverse(o => { if ((o as THREE.Points).isPoints || (o as { isLineSegments2?: boolean }).isLineSegments2 || o.userData.outline) o.visible = false; });
    copy.position.set(0, 0, 0).sub(MAG_C); copy.visible = true; g.add(copy);
    g.position.copy(gun.localToWorld(MAG_C.clone())); g.quaternion.copy(gun.quaternion); E.scene.add(g);
    mags.push({ g, v: V(0, -1.2, 0.3).applyQuaternion(gun.quaternion), spin: (Math.random() - 0.5) * 5, rest: false });
  }

  // ═════ sound: the 7.62×39's crack and boom, the heavy steel carrier, the famously loud selector ═════
  const sfx = {
    shot() {
      snd.burst(0.22, 0.95, { freq: 1700, q: 0.42, attack: 0.001 }); snd.burst(0.7, 0.6, { type: 'lowpass', freq: 210 });
      snd.tone(52, 0.48, 0.45, { type: 'triangle', to: 28 }); snd.burst(0.03, 0.5, { freq: 4600, q: 0.7 });
      snd.click(0.035, 0.48); snd.tone(300, 0.05, 0.06, { type: 'square', at: 0.04 }); snd.tone(170, 0.07, 0.06, { type: 'triangle', at: 0.045 });   // carrier and bolt slamming home
    },
    rackBack() { snd.burst(0.12, 0.12, { freq: 1300, q: 2 }); snd.click(0, 0.55); snd.tone(240, 0.05, 0.05, { type: 'square' }); },
    home() { snd.click(0, 0.45); snd.thunk(0.004); snd.tone(620, 0.06, 0.07, { type: 'square' }); snd.tone(1250, 0.04, 0.03, { type: 'square', at: 0.006 }); },
    magOut() { snd.click(0, 0.9); snd.tone(900, 0.05, 0.05, { type: 'square', at: 0.03 }); snd.burst(0.08, 0.07, { freq: 700, q: 1.4, at: 0.05 }); },
    magIn() { snd.click(0, 0.7); snd.click(0.2, 0.85); snd.thunk(0.21); snd.tone(1500, 0.04, 0.06, { type: 'square', at: 0.22 }); },
    selector() { snd.click(0, 1.0); snd.tone(1900, 0.03, 0.08, { type: 'square' }); snd.tone(600, 0.05, 0.06, { type: 'triangle' }); },
    cover() { snd.click(0, 0.8); snd.tone(420, 0.06, 0.05, { type: 'triangle', at: 0.02 }); },
    spring() { snd.burst(0.14, 0.05, { freq: 3200, q: 3 }); snd.tone(1800, 0.12, 0.02, { type: 'sawtooth', to: 2600 }); },
    lift() { snd.click(0, 0.6); snd.tone(330, 0.05, 0.04, { type: 'square' }); },
  };

  // ═════ state ═════
  const st = {
    rounds: CAP, chamber: false, magIn: true, mode: 'safe' as Mode, stripped: false,
    magT: 0, selT: 0, stripT: 0,
    cycle: null as null | { kind: 'shot' | 'rack'; t0: number; back: boolean },
    shotAt: -1, trigAt: -1, holdUntil: -1, held: false, relAt: -1,
  };
  let carrierZ = 0;
  const busy = () => !!st.cycle;
  const assembled = () => !st.stripped && st.stripT === 0;

  function atRear(kind: 'shot' | 'rack') {
    if (kind === 'shot') eject(false);
    else if (st.chamber) eject(true);
    st.chamber = false;
  }
  /** strip a round off the magazine into the chamber (no hold-open: an empty magazine leaves the chamber empty) */
  function feed() { if (st.magIn && st.magT === 0 && st.rounds > 0) { st.rounds--; st.chamber = true; } }

  const act = {
    fire() {
      if (busy()) return;
      if (!assembled()) return say('reassemble first · K');
      st.trigAt = performance.now();
      if (st.mode === 'safe') { snd.click(0, 0.6); return say('safe · S selector'); }
      if (!st.chamber) { snd.click(0, 0.7); return say('click · chamber empty'); }
      st.cycle = { kind: 'shot', t0: performance.now() + trigDelay, back: false };
      if (st.mode === 'auto' && !inHand) st.holdUntil = Math.max(st.holdUntil, performance.now() + 280);   // a clicked button: a short burst
    },
    rack() {
      if (busy()) return;
      if (!assembled()) return say('reassemble first · K');
      st.cycle = { kind: 'rack', t0: performance.now(), back: false };
      sfx.rackBack();
    },
    magazine() {
      if (st.magT > 0 && st.magT < 1) return;
      st.magIn = !st.magIn;
      if (!st.magIn) { st.relAt = performance.now(); sfx.magOut(); if (inHand) dropMag(); }
      else { st.rounds = CAP; sfx.magIn(); }
    },
    selector() { st.mode = MODES[(MODES.indexOf(st.mode) + 1) % 3]; sfx.selector(); },
    strip() {
      if (inHand) return;
      if (st.stripT > 0 && st.stripT < 1) return;
      if (!st.stripped) {
        if (busy()) return;
        if (st.magIn) return say('magazine out first · E');
        if (st.chamber) return say('clear the chamber first · R');
      }
      st.stripped = !st.stripped;
    },
    range() {},
    demo() {},
  } satisfies Record<string, () => void>;

  // ═════ the range: what the shooting lane needs from this rifle ═════
  const rangeGun: RangeGun = {
    name: 'AK-47', calibre: '7.62×39 mm', root: gun, kind: 'rifle',
    sight: IRON, muzzle, relief: 0.36,                     // the cheek well back on the comb, looking over the dust cover
    grip: { web: V(0, yy(251), zx(551)), down: V(0, -0.961, -0.276), length: 0.1, depth: 0.045, half: 0.0135, trigger: V(0, yy(258), zx(488)), thumbY: -0.012, frameHalf: WX, fingers: 0.022 },
    fore: { at: V(0, yy(224), zx(300)), r: 0.022, dir: V(0, 0, 1) },
    hip: V(0.175, -0.15, -0.31),                           // low and right, the rifle running out of the corner of the view
    recoil: { rise: 3 * DEG, push: 0.028, cam: 0.62 * DEG },
    trigger() {
      if (busy()) return 'busy';
      const r = st.mode === 'safe' ? 'safe' : !st.chamber ? 'click' : 'shot';
      act.fire();
      return r;
    },
    auto: () => st.mode === 'auto',
    loud: () => 1,
    magazine() { act.magazine(); },
    rack() { act.rack(); },
    safety() { act.selector(); },
    night() {},
    state: () => ({ rounds: st.rounds, cap: CAP, chamber: st.chamber, magIn: st.magIn, safe: st.mode === 'safe', locked: false, busy: busy() || (st.magT > 0 && st.magT < 1), night: false, mode: st.mode }),
    hold(on, o) {
      inHand = on; trigDelay = on ? 0 : 30; flashGain = on ? 24 : 1; flashLight.distance = on ? (o?.flash ?? 12) : 1.6; brassMax = on ? 50 : 14;
      ground = on && o ? o.ground : () => 0;
      if (on) { st.stripped = false; st.stripT = 0; st.holdUntil = -1; st.held = false; st.mode = 'semi'; }   // taken up ready for single shots
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
    if (!assembled()) return say('reassemble first · K');
    wantRange = true;
    if (!realOn) { say('opening the range'); style(true); return; }
    openRange();
  };
  act.demo = () => {
    if (script.active) { script.stop(); return; }
    script.start();
    const { later, when } = script;
    const idle = () => !busy() && (st.magT === 0 || st.magT === 1) && (st.stripT === 0 || st.stripT === 1) && performance.now() > st.holdUntil;
    const setMode = (m: Mode) => { while (st.mode !== m) act.selector(); };
    const steps: [() => void, number][] = [
      [() => { if (st.stripped) act.strip(); }, 400],
      [() => { setMode('safe'); if (st.magIn) act.magazine(); }, 700],
      [() => act.magazine(), 800],
      [() => act.rack(), 700],
      [() => setMode('semi'), 700],
      [() => act.fire(), 380], [() => act.fire(), 380], [() => act.fire(), 700],
      [() => setMode('auto'), 700],
      [() => { st.holdUntil = performance.now() + 600; act.fire(); }, 1000],
      [() => setMode('safe'), 700],
      [() => act.magazine(), 700],
      [() => act.rack(), 900],
      [() => act.strip(), 2400],
      [() => act.strip(), 2000],
      [() => { act.magazine(); script.end(); }, 0],
    ];
    const step = (i: number) => when(idle, () => { steps[i][0](); if (i + 1 < steps.length) later(steps[i][1], () => step(i + 1)); });
    step(0);
  };

  // ═════ per frame ═════
  const flashK = (now: number) => st.shotAt < 0 || now < st.shotAt ? 0 : Math.exp(-(now - st.shotAt) / 24);
  const coverOff = V(0.075, 0.012, -0.03), springOff = V(0.075, -0.035, 0.07), carrierOff = V(0.13, 0.005, -0.12);
  function tick(now: number, dt: number) {
    if (wantRange && realOn && !rng?.on) openRange();
    rng?.tick(now, dt);
    st.magT = approach(st.magT, st.magIn ? 0 : 1, (st.magIn ? 2.2 : 3.6) * dt);
    st.selT = approach(st.selT, SEL_DEG[st.mode], 40 * dt);
    const s0 = st.stripT; st.stripT = approach(st.stripT, st.stripped ? 1 : 0, 0.55 * dt);
    for (const [at, f] of [[0.04, sfx.cover], [0.36, sfx.spring], [0.62, sfx.lift]] as const) if ((s0 < at) !== (st.stripT < at)) f();

    // automatic fire: keep cycling while the trigger is held
    if (!inHand && st.mode === 'auto' && (st.held || now < st.holdUntil) && !busy() && st.chamber) {
      st.cycle = { kind: 'shot', t0: now, back: false };
    }

    // bolt carrier (and the handle on it): recoil or a hand rack, then home
    let z = 0;
    const c = st.cycle;
    if (c) {
      const t = (now - c.t0) / 1000;
      const [tb, tf] = c.kind === 'shot' ? [0.034, 0.058] : [0.18, 0.13];
      if (t >= 0) {
        if (c.kind === 'shot' && st.shotAt < c.t0) { st.shotAt = c.t0; sfx.shot(); }
        if (t < tb) z = -BACK * (c.kind === 'shot' ? t / tb : ease(t / tb));
        else {
          if (!c.back) { c.back = true; atRear(c.kind); feed(); }
          const f = clamp01((t - tb) / tf);
          z = -BACK * (1 - (c.kind === 'shot' ? f : ease(f)));
          if (f >= 1) { st.cycle = null; if (c.kind === 'rack') sfx.home(); }
        }
      }
    }
    carrierZ = z;

    // field strip: the cover lifts off its guide, the spring comes out, the carrier goes back, up and out
    const s = st.stripT;
    const cv = phase(s, 0, 0.32), sp = phase(s, 0.28, 0.58), cb = phase(s, 0.52, 0.72), co = phase(s, 0.7, 1);
    coverG.position.set(coverOff.x * phase(s, 0.12, 0.32), 0.03 * Math.sin(Math.PI * cv) + coverOff.y * cv, coverOff.z * cv);
    coverG.rotation.x = -0.25 * Math.sin(Math.PI * phase(s, 0, 0.2));
    springG.position.set(springOff.x * phase(s, 0.38, 0.58), 0.035 * Math.sin(Math.PI * sp) + springOff.y * sp, -0.03 * phase(s, 0.28, 0.4) + springOff.z * phase(s, 0.4, 0.58));
    carrier.position.set(carrierOff.x * co, 0.03 * Math.sin(Math.PI * co) + carrierOff.y * co, z - BACK * cb + (carrierOff.z + BACK) * co);

    // controls
    const tt = st.trigAt < 0 ? 1 : (now - st.trigAt) / 1000, firing = st.shotAt > 0 && now - st.shotAt < 90;
    trig.set((tt < 0.05 ? tt / 0.05 : firing || (st.held && st.mode === 'auto') ? 1 : clamp01(1 - (tt - 0.08) / 0.12)) * 10 * DEG);
    sel.set(st.selT * DEG);
    const rt = st.relAt < 0 ? 1 : (now - st.relAt) / 1000;
    paddle.set(-(rt < 0.08 ? rt / 0.08 : clamp01(1 - (rt - 0.15) / 0.12)) * 12 * DEG);
    // magazine: rocks forward about its front lug, then drops away (and back up, in and rocked home)
    const m = st.magT;
    magPivot.rotation.x = -22 * DEG * phase(m, 0, 0.35);
    magPivot.position.y = MAG_PIVOT.y - MAG_DROP * phase(m, 0.35, 1) ** 2;
    pMag.visible = !inHand || st.magIn;
    topRound.visible = st.rounds > 0;

    // the flash: a short tongue of flame and a burst of light
    const fk = flashK(now);
    flashMesh.visible = !realOn && fk > 0.04; flashMat.emissiveIntensity = 2.6 * fk; flashMesh.scale.setScalar(0.8 + fk * 0.7);
    flashGlow.material.uniforms.intensity.value = fk * 1.5;
    flashLight.intensity = fk * flashGain * 1.4;
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
        if (!b.bounced && b.v.y < -0.4) { b.bounced = true; b.v.set(b.v.x * 0.32, -b.v.y * 0.24, b.v.z * 0.32); b.spin.multiplyScalar(0.3); snd.tone(1900, 0.07, 0.03); snd.tone(2900, 0.05, 0.02); }
        else { b.rest = true; b.g.rotation.set(0, b.g.rotation.y, Math.PI / 2); snd.tone(1800, 0.05, 0.015); }
      }
    }
    for (const mg of mags) {
      if (mg.rest) continue;
      mg.v.y -= 9.8 * dt; mg.g.position.addScaledVector(mg.v, dt); mg.g.rotation.x += mg.spin * dt;
      const gy = ground(mg.g.position.x, mg.g.position.z) + 0.015;
      if (mg.g.position.y <= gy) { mg.g.position.y = gy; mg.rest = true; mg.g.rotation.set(0, mg.g.rotation.y, Math.PI / 2); snd.tone(520, 0.08, 0.06); snd.thunk(0); }
    }
  }

  function readout() {
    if (rng?.on) return 'range · lane 3';
    if (st.stripped || st.stripT > 0) return st.stripT === 1 ? 'field stripped · cover, spring, carrier out' : 'stripping';
    const p: string[] = [];
    p.push(st.magIn ? `${st.rounds} in magazine` : 'magazine out');
    p.push(st.chamber ? 'round chambered' : 'chamber empty');
    p.push(st.mode === 'safe' ? 'safe' : st.mode === 'auto' ? 'automatic' : 'single shots');
    return p.join(' · ');
  }

  // realistic style: on a shooting bench under the sky
  const real: RealSpec = {
    focus: V(0, 0.15, 0.2), size: 1.05, hide: [bench.deck], bench: MAT,
    materials: { ...RM, body: RM.blued },
    only: { line: [], real: realOnly },
    stage: () => rng?.stage() ?? null,
    onStyle(on) {
      realOn = on;
      if (on && !rng) openRange();                     // build the range now, so taking the line is instant
      if (!on) { wantRange = false; rng?.exit(); }
      for (const b of brass) { b.line.visible = !on; b.real.visible = on; }
      if (!on) { fireball.set(0, 0); flashLight.color.copy(E.accent); }
    },
    tick(now) { fireball.set(flashK(now), now); flashLight.color.setHex(0xffa24a); },
  };

  if (arrive === 'range') setTimeout(() => act.range(), 0);   // changed to on the range: straight onto the line

  return {
    pickRoot: gun, parts: K.parts, real,
    view: { target: V(0, 0.2, 0.2), dist: 1.8, min: 0.35, max: 6 },
    actions: act, passive: [],
    keyDown(k, e) {
      if (rng?.on) return rng.keyDown(k, e);
      if (k === 'f') { if (!e.repeat) { st.held = true; act.fire(); } return true; }
      return false;
    },
    keyUp(k) { if (rng?.on) rng.keyUp(k); if (k === 'f') st.held = false; },
    blur() { rng?.blur(); st.held = false; },
    hud: () => rng?.hud() ?? null,
    on: () => ({ range: !!rng?.on, demo: script.active, fire: !!st.cycle && st.cycle.kind === 'shot', rack: !!st.cycle && st.cycle.kind === 'rack', magazine: st.magIn, selector: st.mode !== 'safe', strip: st.stripped }),
    tick, readout,
    dispose() {
      rng?.dispose(); mags.forEach(mg => mg.g.removeFromParent());
      brass.forEach(drop);
      RTex.forEach(t => t.dispose()); Object.values(RM).forEach(mt => mt.dispose());
      decalMats.forEach(mt => { (mt as THREE.MeshStandardMaterial).map?.dispose(); mt.dispose(); });
      [caseReal, noseReal, caseLine, noseLine].forEach(g => g.dispose());
    },
  };
};

export default model;
