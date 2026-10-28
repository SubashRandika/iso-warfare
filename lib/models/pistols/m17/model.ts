// M17 (SIG Sauer P320): a working magazine, slide, trigger, safety, slide stop and takedown.
// Coordinates in metres: +z toward the muzzle, +y up, +x to the pistol's left (three.js is right-handed:
// the ejection port is on the -x side). Like every small arm it floats raised
// above the floor with no stand: the grip's base is GY above the mat, so a dropped magazine falls onto the mat and
// spent cases land beside it. A field-stripped slide floats clear in front of the frame.
// The side profiles are traced from a left-side photograph at 0.251 mm per pixel (203 mm overall): a 24 mm slide, a
// grip about 51 mm front to back raked about 13°, and rounded edges (fine steps, so no crease lines along them).
// Accent (live) parts: the tritium sight dots and the muzzle flash.
// Real view: coyote-tan slide and grip module and coyote-anodised controls and trigger, as issued; the black chamber
// hood in the ejection port with its calibre engraved, the extractor, the stainless serial plate and the moulded
// markings, a crowned barrel, chequering on the guard; moulded, bead-blasted and stippled finishes; brass cases.
// Range (key G, Real view): the pistol is taken up in gloved hands on lane 3 of an indoor range (lib/range/), where
// this file supplies the sights, the grip and the mechanics and the range does the shooting, targets and drill.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { ModelFactory } from '../../../core/types';
import { approach, clamp01, DEG, ease, phase, SIDES } from '../../../core/anim';
import { loft, merge } from '../../../iso/geo';
import { makeKit } from '../../../kit/build';
import { buildPlate } from '../../../stages/plate';
import { makePlume } from '../../../real/plume';
import { decalMaterial, decalTexture } from '../../../real/decals';
import type { RealSpec } from '../../../real/types';
import type { RangeGun } from '../../../range/types';
import type { Range } from '../../../range/range';

const CAP = 17;
const SLIDE_BACK = 0.034, LOCK_BACK = 0.03, STRIP_FWD = 0.205;
const RAKE = 13 * DEG;
const MAG_DIR = new THREE.Vector3(0, -Math.cos(RAKE), -Math.sin(RAKE));   // down the grip axis
const GY = 0.135;                                         // grip base above the mat
const MAG_DROP = (GY - 0.005) / Math.cos(RAKE);           // until the base pad meets the mat
const MAT = { w: 0.72, d: 0.44, cx: -0.08, cz: 0.09 };   // the bench mat under the pistol (both styles)
const SB = 0.104, ST = 0.127, SW = 0.0125, SR = 0.0042;  // slide: bottom, top, half-width, radius of its top corners
const BY = 0.1135;                                        // bore axis
const FW = 0.0122, GW = 0.0135;                           // half-widths: frame (dust cover, guard, tang) and grip

type Cmd = ['M', number, number] | ['L', number, number] | ['Q', number, number, number, number];
const trace = (p: THREE.Path, cmds: Cmd[]) => cmds.forEach(c => c[0] === 'M' ? p.moveTo(c[1], c[2]) : c[0] === 'L' ? p.lineTo(c[1], c[2]) : p.quadraticCurveTo(c[1], c[2], c[3], c[4]));
/** a side profile in (z, y) with optional holes */
const profile = (cmds: Cmd[], holes: Cmd[][] = []) => {
  const s = new THREE.Shape(); trace(s, cmds);
  holes.forEach(h => { const p = new THREE.Path(); trace(p, h); s.holes.push(p); });
  return s;
};
/** extrude a (z, y) profile across x0..x1 with every edge rounded by `bevel` in `segs` steps; the outline stays put */
const across = (s: THREE.Shape, x0: number, x1: number, bevel = 0.0008, segs = 1) => {
  const g = new THREE.ExtrudeGeometry(s, { depth: x1 - x0 - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: segs, curveSegments: 8 });
  g.rotateY(-Math.PI / 2); g.translate(x1 - bevel, 0, 0);
  return g;
};

// ── side profiles (z, y) ──
/** frame: dust cover over the accessory rail, squared trigger guard, tang and beavertail (the grip is separate) */
const FRAME: Cmd[] = [
  ['M', 0.1726, SB], ['L', 0.1726, 0.0876], ['Q', 0.1726, 0.0833, 0.1690, 0.0833],   // rounded nose of the dust cover
  ['L', 0.1174, 0.0833], ['Q', 0.1157, 0.0833, 0.1157, 0.0815],                       // underside, into the guard
  ['L', 0.1150, 0.0610], ['Q', 0.1146, 0.0572, 0.1105, 0.0572],                       // squared guard front, rounded toe
  ['L', 0.0640, 0.0577], ['Q', 0.0590, 0.0580, 0.0571, 0.0546],                       // guard bottom, undercut at the grip
  ['L', 0.0073, 0.0637], ['L', 0.0073, 0.0732],                                       // (inside the grip)
  ['Q', 0.0068, 0.0790, 0.0020, 0.0830], ['L', -0.0058, 0.0905],                      // under the beavertail
  ['Q', -0.0076, 0.0925, -0.0060, 0.0948], ['Q', 0.0030, 0.0965, 0.0068, 0.1010],     // beavertail tip and top
  ['L', 0.0081, SB],
];
const GUARD: Cmd[] = [
  ['M', 0.1093, 0.0790], ['L', 0.1093, 0.0650], ['Q', 0.1093, 0.0617, 0.1060, 0.0617], ['L', 0.0690, 0.0617],
  ['Q', 0.0628, 0.0620, 0.0626, 0.0680], ['L', 0.0626, 0.0735], ['Q', 0.0630, 0.0798, 0.0690, 0.0798],
  ['L', 0.1085, 0.0798], ['Q', 0.1093, 0.0798, 0.1093, 0.0790],
];
/** grip: front strap, rounded toe and heel, backstrap with its palm swell, top edge under the controls */
const GRIP: Cmd[] = [
  ['M', 0.0571, 0.0560], ['Q', 0.0538, 0.0400, 0.0500, 0.0140], ['L', 0.0478, 0.0050], ['Q', 0.0472, 0, 0.0445, 0],
  ['L', 0.0010, 0], ['Q', -0.0022, 0, -0.0020, 0.0040], ['Q', -0.0018, 0.0300, 0.0040, 0.0500], ['L', 0.0068, 0.0660],
  ['Q', 0.0300, 0.0675, 0.0460, 0.0630], ['Q', 0.0560, 0.0600, 0.0571, 0.0560],
];
/** the stippled panel on each side of the grip */
const PANEL: Cmd[] = [
  ['M', 0.0450, 0.0578], ['L', 0.0118, 0.0613], ['Q', 0.0098, 0.0615, 0.0095, 0.0595], ['L', 0.0030, 0.0085],
  ['Q', 0.0028, 0.0064, 0.0050, 0.0063], ['L', 0.0410, 0.0055], ['Q', 0.0432, 0.0055, 0.0434, 0.0076],
  ['L', 0.0472, 0.0555], ['Q', 0.0474, 0.0577, 0.0450, 0.0578],
];
/** as on the M17: the finger sits in front of the blade and pulls it back, so the front face is concave; the blade
 *  bulges back toward the grip and its tip curls forward toward the muzzle */
const TRIGGER: Cmd[] = [
  ['M', 0.0800, 0.084], ['L', 0.0858, 0.084],
  ['Q', 0.0730, 0.0720, 0.0890, 0.0632],       // front (finger) face, concave toward the muzzle
  ['Q', 0.0895, 0.0618, 0.0880, 0.0620],       // rounded tip, curling forward
  ['Q', 0.0690, 0.0700, 0.0800, 0.084],        // rear edge, bulging toward the grip
];
/** takedown lever: a paddle above the front of the guard, pivoting at its rear end */
const TAKEDOWN: Cmd[] = [
  ['M', 0.0840, 0.1030], ['L', 0.1060, 0.1025], ['Q', 0.1088, 0.1022, 0.1088, 0.0995], ['Q', 0.1088, 0.0968, 0.1060, 0.0965],
  ['L', 0.0840, 0.0962], ['Q', 0.0808, 0.0962, 0.0808, 0.0996], ['Q', 0.0808, 0.1030, 0.0840, 0.1030],
];
/** slide stop: a short lever at the top of the frame, its thumb pad toward the rear */
const CATCH: Cmd[] = [
  ['M', 0.0555, 0.1030], ['L', 0.0505, 0.1044], ['L', 0.0397, 0.1044], ['Q', 0.0386, 0.1044, 0.0386, 0.1030],
  ['L', 0.0388, 0.1004], ['Q', 0.0391, 0.0995, 0.0405, 0.0995], ['L', 0.0540, 0.1002], ['Q', 0.0562, 0.1010, 0.0555, 0.1030],
];
/** thumb safety: a round pivot boss and a paddle sweeping up and back beside the slide */
const SAFETY: Cmd[] = [
  ['M', 0.0325, 0.0984], ['Q', 0.0325, 0.0948, 0.0290, 0.0948], ['Q', 0.0255, 0.0948, 0.0240, 0.0975], ['L', 0.0192, 0.1030],
  ['Q', 0.0178, 0.1052, 0.0192, 0.1066], ['Q', 0.0205, 0.1074, 0.0222, 0.1062], ['L', 0.0278, 0.1018], ['Q', 0.0325, 0.1018, 0.0325, 0.0984],
];
const BASE_PAD: Cmd[] = [['M', -0.0008, -0.005], ['L', 0.0450, -0.005], ['Q', 0.0462, -0.005, 0.0462, -0.0036], ['L', 0.0460, 0], ['L', -0.0006, 0], ['L', -0.0008, -0.005]];
/** cocking serrations, front and rear: where each groove meets the bottom of the band; the tops lean back */
const SER_REAR = Array.from({ length: 9 }, (_, i) => 0.054 - i * 0.004), SER_FRONT = Array.from({ length: 7 }, (_, i) => 0.181 - i * 0.004);
const SER_Y0 = 0.1065, SER_Y1 = 0.1215, SER_LEAN = 0.0065;

/** finishes for the Real view, by tag; untagged meshes get `blackSteel` */
function realMaterials() {
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  // grip stippling: a tileable field of raised and sunken dots (bump only), about half a millimetre each
  const n = 128, c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d')!; x.fillStyle = '#808080'; x.fillRect(0, 0, n, n);
  for (let i = 0; i < 900; i++) {
    const v = Math.random() < 0.55 ? 205 : 45, px = Math.random() * n, py = Math.random() * n, r = 1.2 + Math.random() * 1.6;
    x.fillStyle = `rgb(${v},${v},${v})`;
    for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) { x.beginPath(); x.arc(px + ox, py + oy, r, 0, Math.PI * 2); x.fill(); }
  }
  const stip = new THREE.CanvasTexture(c); stip.wrapS = stip.wrapT = THREE.RepeatWrapping; stip.repeat.set(40, 40); stip.colorSpace = THREE.NoColorSpace;
  // fine grain for the moulded polymer and the bead-blasted coating: soft value noise, a few hundredths of a mm
  const grain = (() => {
    const g = document.createElement('canvas'); g.width = g.height = 128;
    const y = g.getContext('2d')!, img = y.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) { const v = 118 + Math.random() * 20; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    y.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(g); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(220, 220); t.colorSpace = THREE.NoColorSpace;
    return t;
  })();
  return {
    // the grip module is a shade lighter and pinker than the slide's coating, as on the issued pistol
    polymer: std({ color: 0x9a7953, roughness: 0.78, bumpMap: grain, bumpScale: 0.25 }),
    stipple: std({ color: 0x92734f, roughness: 0.92, bumpMap: stip, bumpScale: 0.9, side: THREE.DoubleSide }),
    groove: std({ color: 0x3b3226, roughness: 0.9, side: THREE.DoubleSide }),
    slide: new THREE.MeshPhysicalMaterial({ color: 0x8a6a40, metalness: 0.35, roughness: 0.5, bumpMap: grain, bumpScale: 0.15, clearcoat: 0.1, clearcoatRoughness: 0.6 }),   // coyote PVD
    coyote: std({ color: 0x7e6340, metalness: 0.6, roughness: 0.4 }),                     // anodised controls and trigger
    hood: std({ color: 0x1b1c1e, metalness: 0.6, roughness: 0.42, side: THREE.DoubleSide }),   // nitrided chamber hood
    barrel: std({ color: 0x6a573f, metalness: 0.75, roughness: 0.34 }),
    steel: std({ color: 0xb4b8bb, metalness: 1, roughness: 0.3 }),                          // stainless chassis
    blackSteel: std({ color: 0x17181a, metalness: 0.55, roughness: 0.5 }),
    blackPoly: std({ color: 0x151617, roughness: 0.82 }),
    brass: std({ color: 0xc9a04c, metalness: 1, roughness: 0.26, side: THREE.DoubleSide }),
    copper: std({ color: 0xb86a40, metalness: 1, roughness: 0.3 }),
  };
}

const model: ModelFactory = ({ E, snd, script, say, style, def, open, arrive }) => {
  const K = makeKit(E, { unit: 0.02 });
  const { add, part, hinge, box, well, lines } = K;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const gun = K.root; gun.position.y = GY;                // raised, no stand
  const bench = buildPlate(E, { ...MAT, grid: 0.01, ruler: true, shadow: [0.16, 0.34, -0.01, 0.1] });
  const RM = realMaterials();
  const rbox = (w: number, h: number, d: number, x: number, y: number, z: number) => new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.3).translate(x, y, z);

  // ═════ frame (grip module) ═════
  const pFrame = part('frame', gun);
  add(pFrame, across(profile(FRAME, [GUARD]), -FW, FW, 0.0012, 4), undefined, { real: 'polymer' });
  add(pFrame, across(profile(GRIP), -GW, GW, 0.0022, 4), undefined, { real: 'polymer' });
  const panel = profile(PANEL);
  for (const k of SIDES) {                                        // grip panels, accessory-rail groove and its slots
    const xg = k * (GW + 0.0003), xf = k * (FW + 0.0003);
    pFrame.add(E.loopLine(panel.getPoints(4).map(p => V(xg, p.y, p.x)), E.mats.line));
    lines(pFrame, [[V(xf, 0.0951, 0.1185), V(xf, 0.0951, 0.1700)]]);
    for (const z of [0.1676, 0.1588, 0.15]) well(pFrame, [V(xf, 0.0848, z - 0.0015), V(xf, 0.0848, z + 0.0015), V(xf, 0.087, z + 0.0015), V(xf, 0.087, z - 0.0015)], V(k, 0, 0));
  }
  // fire control unit: the steel chassis on top of the frame, seen once the slide is off
  const pFcu = part('chassis', gun);
  add(pFcu, box(-0.0105, 0.0105, SB, SB + 0.0035, 0.014, 0.168), undefined, { real: 'steel' });
  for (const k of SIDES) for (const [z0, z1] of [[0.02, 0.05], [0.135, 0.165]]) add(pFcu, box(k > 0 ? 0.0085 : -0.0115, k > 0 ? 0.0115 : -0.0085, SB + 0.0035, SB + 0.0065, z0, z1), undefined, { real: 'steel' });

  // ═════ trigger, safety, slide stop, takedown lever, magazine release ═════
  const pTrig = part('trigger', gun);
  const trig = hinge(pTrig, V(0, 0.083, 0.0829), V(1, 0, 0), 'x');
  add(trig.inner, across(profile(TRIGGER), -0.003, 0.003, 0.0006, 4), undefined, { real: 'coyote' });
  const pSafe = part('safety', gun), safeH: ReturnType<typeof hinge>[] = [];
  const pStop = part('slideStop', gun), stopG = new THREE.Group(); pStop.add(stopG);
  const pTake = part('takedown', gun), takeH: ReturnType<typeof hinge>[] = [];
  /** a lever plate `t` thick standing on the frame side at |x| = x0 */
  const lever = (cmds: Cmd[], k: number, x0: number, t: number) => across(profile(cmds), k > 0 ? x0 : -x0 - t, k > 0 ? x0 + t : -x0, 0.0005, 4);
  for (const k of SIDES) {                                        // safety and slide stop on both sides, takedown on the left
    const h = hinge(pSafe, V(k * 0.0126, 0.0984, 0.0290), V(1, 0, 0), 'x'); safeH.push(h);
    add(h.inner, lever(SAFETY, k, 0.0126, 0.0022), undefined, { real: 'coyote' });
    add(stopG, lever(CATCH, k, FW, 0.0017), undefined, { real: 'coyote' });
    if (k > 0) { const t = hinge(pTake, V(FW, 0.0996, 0.0840), V(1, 0, 0), 'x'); takeH.push(t); add(t.inner, lever(TAKEDOWN, k, FW, 0.0021), undefined, { real: 'coyote' }); }
  }
  // magazine release behind the trigger guard (left side): part of the magazine for clicks, but fixed to the frame
  const rel = new THREE.Group(); rel.userData.part = 'magazine'; gun.add(rel);
  add(rel, rbox(0.002, 0.0086, 0.0082, FW + 0.0008, 0.0626, 0.0575), undefined, { real: 'coyote' });

  // ═════ slide, barrel, sights ═════
  const slideG = new THREE.Group(); gun.add(slideG);
  const pSlide = part('slide', slideG);
  /** slide section: flat bottom on the frame rails, straight sides, top corners rounded in four steps */
  const ring = (z: number, top = ST, w = SW, r = SR) => {
    const pts = [V(-w, SB, z), V(w, SB, z)];
    for (let i = 0; i <= 4; i++) { const a = i / 8 * Math.PI; pts.push(V(w - r + r * Math.cos(a), top - r + r * Math.sin(a), z)); }
    for (let i = 0; i <= 4; i++) { const a = (4 + i) / 8 * Math.PI; pts.push(V(-w + r + r * Math.cos(a), top - r + r * Math.sin(a), z)); }
    return pts;
  };
  // the nose is sculpted: ahead of the front serrations the top corners open into a broad bevel down to the muzzle
  const slideGeo = loft([ring(0.0086, ST - 0.0012, SW - 0.0005), ring(0.0112), ring(0.1835), ring(0.1875, ST - 0.0003, SW - 0.0002, 0.0058), ring(0.1905, ST - 0.0008, SW - 0.0006, 0.0075),
    ring(0.194, ST - 0.0018, SW - 0.0009, 0.0072), ring(0.196, ST - 0.0048, SW - 0.0016, 0.005)], { capStart: true, capEnd: true }).build();
  add(pSlide, slideGeo, undefined, { real: 'slide' });
  { // ejection port (right side): a dark opening wrapping from the top over the rounded corner and down the side
    const o = 0.00008, path = [V(0.003, ST + o, 0), V(-SW + SR, ST + o, 0)];
    for (let i = 1; i <= 4; i++) { const a = Math.PI / 2 + i / 8 * Math.PI; path.push(V(-SW + SR + (SR + o) * Math.cos(a), ST - SR + (SR + o) * Math.sin(a), 0)); }
    path.push(V(-SW - o, 0.1095, 0));
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      well(pSlide, [V(a.x, a.y, 0.081), V(b.x, b.y, 0.081), V(b.x, b.y, 0.113), V(a.x, a.y, 0.113)], V(b.y - a.y, a.x - b.x, 0));
    }
  }
  pSlide.add(E.loopLine([V(-0.0075, ST + 0.0002, 0.028), V(0.0075, ST + 0.0002, 0.028), V(0.0075, ST + 0.0002, 0.070), V(-0.0075, ST + 0.0002, 0.070)], E.mats.line));   // optic cover plate
  lines(pSlide, SIDES.flatMap(k => [...SER_REAR, ...SER_FRONT].map(z => [V(k * (SW + 0.00006), SER_Y0, z), V(k * (SW + 0.00006), SER_Y1, z - SER_LEAN)] as [THREE.Vector3, THREE.Vector3])));
  const pBarrel = part('barrel', slideG);
  { const b = new THREE.CylinderGeometry(0.0068, 0.0068, 0.1195, 16); b.rotateX(Math.PI / 2); b.translate(0, BY, 0.13875); add(pBarrel, b, undefined, { real: 'barrel' });
    const bore = new THREE.Mesh(new THREE.CircleGeometry(0.0044, 20), E.mats.recess); bore.position.set(0, BY, 0.1986); pBarrel.add(bore); }
  // recoil spring and guide rod under the slide nose, in front of the dust cover (it rides with the slide and hides
  // inside the dust cover as the slide recoils)
  { const g = new THREE.CylinderGeometry(0.0061, 0.0061, 0.0225, 16); g.rotateX(Math.PI / 2); g.translate(0, 0.0968, 0.1843); add(pSlide, g, undefined, { real: 'barrel' });
    const cup = new THREE.Mesh(new THREE.CircleGeometry(0.0026, 16), E.mats.recess); cup.position.set(0, 0.0968, 0.1957); pSlide.add(cup); }
  const pSights = part('sights', slideG);
  add(pSights, merge([rbox(0.017, 0.0028, 0.0115, 0, 0.1284, 0.01955), ...SIDES.map(k => rbox(0.0067, 0.0065, 0.0115, k * 0.00515, 0.13025, 0.01955))]), undefined, { real: 'blackSteel' });
  add(pSights, rbox(0.0032, 0.0055, 0.005, 0, 0.1293, 0.1885), undefined, { real: 'blackSteel' });
  const tritMat = E.glowMat(), dots = [V(-0.00515, 0.1315, 0.0136), V(0.00515, 0.1315, 0.0136), V(0, 0.1305, 0.1858)];
  dots.forEach(p => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.0011, 12, 8), tritMat); m.position.copy(p); pSights.add(m); });
  const tritGlow = E.glowPoints(dots.map(p => p.clone().add(V(0, 0, -0.0008))), 0.011); pSights.add(tritGlow);

  // ═════ magazine ═════
  const pMag = part('magazine', gun);
  const lean = Math.tan(RAKE) * 0.086;
  add(pMag, across(profile([['M', 0.002, 0], ['L', 0.039, 0], ['L', 0.039 + lean, 0.086], ['L', 0.002 + lean, 0.086], ['L', 0.002, 0]]), -0.0105, 0.0105, 0.0005), undefined, { real: 'blackSteel' });
  add(pMag, across(profile(BASE_PAD), -0.0125, 0.0125, 0.001, 4), undefined, { real: 'polymer' });
  const topRound = new THREE.Group(); pMag.add(topRound);
  const roundGeo = (() => {
    const c = new THREE.CylinderGeometry(0.0049, 0.0049, 0.019, 12); c.rotateX(Math.PI / 2); c.translate(0, 0, -0.0045);
    const n = new THREE.SphereGeometry(0.0045, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2); n.rotateX(Math.PI / 2); n.translate(0, 0, 0.005);
    return [c, n];
  })();
  roundGeo.forEach((g, i) => { const m = add(topRound, g.clone(), undefined, { real: i ? 'copper' : 'brass' }); m.position.set(0, 0.0895, 0.0225 + lean); m.rotation.x = RAKE; });

  // ═════ Real view only: grip stippling, serration ridges, optic cover plate, accessory-rail groove ═════
  // (the hairline view draws these as lines)
  const realOnly: THREE.Object3D[] = [], decalMats: THREE.Material[] = [];
  const realAdd = (parent: THREE.Object3D, geo: THREE.BufferGeometry, tag: string) => {
    const m = add(parent, geo, undefined, { real: tag, lines: false }); m.visible = false; realOnly.push(m); return m;
  };
  for (const k of SIDES) {
    realAdd(pFrame, new THREE.ShapeGeometry(panel, 4).rotateY(-Math.PI / 2).translate(k * (GW + 0.00025), 0, 0), 'stipple');
    realAdd(pFrame, new THREE.PlaneGeometry(0.0515, 0.0016).rotateY(k * Math.PI / 2).translate(k * (FW + 0.00025), 0.0951, 0.14425), 'groove');
  }
  { const ridges: THREE.BufferGeometry[] = [], len = Math.hypot(SER_Y1 - SER_Y0, SER_LEAN), tilt = Math.atan2(SER_LEAN, SER_Y1 - SER_Y0);
    for (const k of SIDES) for (const grooves of [SER_REAR, SER_FRONT]) for (let i = 0; i < grooves.length - 1; i++)
      ridges.push(new THREE.BoxGeometry(0.0006, len, 0.0017).rotateX(-tilt).translate(k * 0.01268, (SER_Y0 + SER_Y1) / 2, grooves[i] - 0.002 - SER_LEAN / 2));
    realAdd(pSlide, merge(ridges), 'slide');
    const screws = [0.034, 0.064].map(z => new THREE.CylinderGeometry(0.0013, 0.0013, 0.0012, 10).translate(0, ST + 0.0011, z));
    realAdd(pSlide, merge([box(-0.0075, 0.0075, ST, ST + 0.0009, 0.028, 0.070), ...screws]), 'blackSteel'); }

  // ═════ Real view only: what the photographs show up close ═════
  {
    // the chamber hood in the ejection port: black, flush with the slide, its calibre engraved on the side
    const o = 0.00016, path = [V(0.0028, ST + o, 0), V(-SW + SR, ST + o, 0)];
    for (let i = 1; i <= 4; i++) { const a = Math.PI / 2 + i / 8 * Math.PI; path.push(V(-SW + SR + (SR + o) * Math.cos(a), ST - SR + (SR + o) * Math.sin(a), 0)); }
    path.push(V(-SW - o, 0.1097, 0));
    const hood = new THREE.BufferGeometry(), pos: number[] = [], z0 = 0.0818, z1 = 0.1122;
    for (let i = 0; i < path.length - 1; i++) { const a = path[i], b = path[i + 1]; pos.push(a.x, a.y, z0, b.x, b.y, z0, b.x, b.y, z1, a.x, a.y, z0, b.x, b.y, z1, a.x, a.y, z1); }
    hood.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hood.computeVertexNormals();
    realAdd(pSlide, hood, 'hood');
    // the extractor behind the port, on the right side of the slide
    realAdd(pSlide, rbox(0.0007, 0.0034, 0.0118, -SW - 0.00015, 0.1172, 0.0752), 'steel');
    // the rear plate over the striker
    realAdd(pSlide, rbox(0.0168, 0.0122, 0.0009, 0, 0.1132, 0.0084), 'blackSteel');
    // barrel crown: the polished ring round the bore
    realAdd(pBarrel, new THREE.RingGeometry(0.0044, 0.0063, 24).translate(0, BY, 0.19856), 'steel');
    // chequering across the front of the trigger guard
    realAdd(pFrame, merge(Array.from({ length: 6 }, (_, i) => new THREE.BoxGeometry(2 * FW - 0.002, 0.0007, 0.0006).translate(0, 0.0626 + i * 0.0016, 0.1156))), 'polymer');
    // the takedown lever's axle on the right side, and the stainless serial plate set into the frame
    realAdd(pFrame, new THREE.CylinderGeometry(0.0034, 0.0034, 0.0008, 24).rotateZ(Math.PI / 2).translate(-FW - 0.0003, 0.0936, 0.098), 'coyote');
    realAdd(pFrame, rbox(0.0007, 0.0042, 0.0165, -FW - 0.0002, 0.0951, 0.0545), 'steel');
    // engravings and moulded lettering (no maker's logo)
    const decal = (parent: THREE.Object3D, w: number, h: number, at: THREE.Vector3, side: number, draw: (x: CanvasRenderingContext2D) => void, px = 1024, o: THREE.MeshStandardMaterialParameters = {}) => {
      const tex = decalTexture(px, Math.round(px * h / w), draw), mat = decalMaterial(tex, { roughness: 0.6, metalness: 0.2, ...o });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateY(side * Math.PI / 2).translate(at.x, at.y, at.z), mat);
      m.visible = false; m.raycast = () => {}; parent.add(m); realOnly.push(m); decalMats.push(mat);
    };
    const font = (x: CanvasRenderingContext2D, size: number, col: string, weight = 600, style = '') => { x.font = `${style} ${weight} ${size}px ui-monospace, Consolas, monospace`; x.fillStyle = col; x.textBaseline = 'middle'; };
    decal(pSlide, 0.026, 0.0062, V(-SW - 0.0003, 0.1158, 0.0975), -1, x => { font(x, 150, '#b9bcbe'); x.fillText('9mm x 19', 30, 128); });
    decal(pFrame, 0.025, 0.0028, V(-FW - 0.0003, 0.0946, 0.0775), -1, x => { font(x, 86, '#5f4c34', 700, 'italic'); x.fillText('NEWINGTON, NH, USA', 8, 58); }, 1024, { alphaTest: 0.4 });
    decal(pFrame, 0.0158, 0.0036, V(-FW - 0.00062, 0.0951, 0.0545), -1, x => {
      font(x, 96, '#2a2c2e'); x.fillText('M17 0A1417', 22, 118);
      let seed = 17; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) if (i === 0 || j === 11 || rnd() > 0.5) x.fillRect(760 + i * 17, 26 + j * 17, 15, 15);   // a data-matrix code
    });
    decal(pFrame, 0.022, 0.0026, V(FW + 0.0003, 0.0946, 0.0775), 1, x => { font(x, 90, '#5f4c34', 700); x.fillText('M17  9mm x 19', 8, 60); }, 1024, { alphaTest: 0.4 });
    // grooves across the slide stop's thumb pad and the safety paddle
    for (const k of SIDES) {
      realAdd(stopG, merge([0, 1, 2, 3].map(i => new THREE.BoxGeometry(0.0004, 0.0006, 0.0007).translate(k * (FW + 0.0019), 0.1037 - i * 0.0011, 0.0412))), 'coyote');
      realAdd(safeH[k > 0 ? 0 : 1].inner, merge([0, 1, 2].map(i => new THREE.BoxGeometry(0.0004, 0.0006, 0.0024).rotateX(-0.75).translate(k * (0.0126 + 0.0024), 0.1032 - i * 0.0012, 0.0216 + i * 0.001))), 'coyote');
    }
  }

  // ═════ muzzle flash: accent glow, a flat accent star in the light theme, and a flash of real light ═════
  // (Real view: an additive fireball instead of the glow, and the light turns warm)
  const flashMat = E.glowMat();
  const flashMesh = new THREE.Mesh((() => { const g = new THREE.ConeGeometry(0.012, 0.03, 6, 1, true); g.rotateX(-Math.PI / 2); g.translate(0, BY, 0.215); return g; })(), flashMat);
  flashMesh.raycast = () => {}; flashMesh.visible = false; gun.add(flashMesh);
  const flashGlow = E.glowPoints([V(0, BY, 0.212)], 0.16); gun.add(flashGlow);
  const flashLight = new THREE.PointLight(E.accent.getHex(), 0, 0.9, 2); flashLight.position.set(0, BY + 0.009, 0.23); gun.add(flashLight); E.accentLights.push(flashLight);
  const fireball = makePlume(gun, V(0, BY, 0.199), V(0, 0, 1), 0.03, 0.03, 0.09, 3);
  let realOn = false, relAt = -1;
  // in the hands on the range: no trigger take-up delay, the flash lights the hall, cases and magazines fall to the floor
  let inHand = false, trigDelay = 50, flashGain = 1.2, brassMax = 12;
  let ground = (_x: number, _z: number) => 0;

  // ═════ cases and live rounds thrown from the ejection port ═════
  // Each one carries a hairline version and a real one (lathe-turned case with its extractor groove, copper bullet).
  type Brass = { g: THREE.Group; line: THREE.Group; real: THREE.Group; v: THREE.Vector3; spin: THREE.Vector3; rest: boolean; bounced: boolean };
  const brass: Brass[] = [], CASE_R = 0.0049;
  const caseGeo = new THREE.CylinderGeometry(CASE_R, CASE_R, 0.019, 12);
  const noseGeo = (() => { const n = new THREE.SphereGeometry(0.0045, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2); n.translate(0, 0.0095, 0); return n; })();
  const lathe = (pts: [number, number][]) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 18);
  const caseReal = lathe([[0, -0.0095], [0.0047, -0.0095], [0.0049, -0.0093], [0.0049, -0.0085], [0.0042, -0.0081], [0.0042, -0.0074], [0.0049, -0.007], [0.00485, 0.0095], [0.0045, 0.0095], [0.0045, 0.002]]);
  const noseReal = lathe([[0.0045, 0.009], [0.00452, 0.0125], [0.0041, 0.0152], [0.0032, 0.0174], [0.0018, 0.0189], [0, 0.0195]]);
  const drop = (b: Brass) => { b.g.removeFromParent(); b.g.traverse(o => (o as THREE.Mesh).geometry?.dispose()); };
  function eject(live: boolean) {
    if (brass.length >= brassMax) drop(brass.shift()!);
    const g = new THREE.Group(), line = new THREE.Group(), real = new THREE.Group(); g.add(line, real); E.scene.add(g);
    add(line, caseGeo.clone()); if (live) add(line, noseGeo.clone());
    const pieces: [THREE.BufferGeometry, THREE.Material][] = [[caseReal, RM.brass]]; if (live) pieces.push([noseReal, RM.copper]);
    for (const [geo, mat] of pieces) { const m = new THREE.Mesh(geo.clone(), mat); m.castShadow = m.receiveShadow = true; real.add(m); }
    line.visible = !realOn; real.visible = realOn;
    gun.updateMatrixWorld();
    g.position.copy(gun.localToWorld(V(-0.009, 0.1205, 0.097 + slideZ)));
    g.rotation.set(0, 0, Math.PI / 2);
    const r = () => Math.random() - 0.5;
    const v = V(-0.42 + r() * 0.16, 0.9 + r() * 0.25, -0.2 + r() * 0.15).applyQuaternion(gun.quaternion);   // thrown to the pistol's right
    g.quaternion.premultiply(gun.quaternion);
    brass.push({ g, line, real, v, spin: V(r() * 30, r() * 20, 18 + r() * 10), rest: false, bounced: false });
  }

  // ═════ magazines dropped in the hands: a copy of the magazine falls to the floor (the last three stay) ═════
  type Mag = { g: THREE.Group; v: THREE.Vector3; spin: number; rest: boolean };
  const mags: Mag[] = [], MAG_C = V(0, 0.045, 0.025);
  function dropMag() {
    if (mags.length >= 3) mags.shift()!.g.removeFromParent();
    gun.updateMatrixWorld(true);
    const g = new THREE.Group(), copy = pMag.clone(true);
    copy.traverse(o => { if ((o as THREE.Points).isPoints || (o as { isLineSegments2?: boolean }).isLineSegments2 || o.userData.outline) o.visible = false; });
    copy.position.set(0, 0, 0).sub(MAG_C); copy.visible = true; g.add(copy);
    g.position.copy(gun.localToWorld(MAG_C.clone())); g.quaternion.copy(gun.quaternion); E.scene.add(g);
    mags.push({ g, v: MAG_DIR.clone().applyQuaternion(gun.quaternion).multiplyScalar(1.2), spin: (Math.random() - 0.5) * 6, rest: false });
  }

  // ═════ the range: what the shooting lane needs from this pistol ═════
  const rangeGun: RangeGun = {
    name: 'M17', calibre: '9×19 mm', root: gun,
    // tops of the rear sight's two blades and of the front post, along the line of the tritium dots
    sight: { rear: V(0, 0.1335, 0.0139), front: V(0, 0.13205, 0.1885) },
    muzzle: V(0, BY, 0.2), relief: 0.52,
    grip: { web: V(0, 0.0655, 0.0072), down: MAG_DIR.clone(), length: 0.062, depth: 0.05, half: GW, trigger: V(0, 0.0718, 0.0802), thumbY: 0.091, frameHalf: FW },
    // carried out in the firing hand, low and right, the forearm running back to the corner of the view
    hip: V(0.15, -0.112, -0.35),
    recoil: { rise: 7 * DEG, push: 0.018 },
    trigger() {
      if (busy() || st.stripped) return 'busy';
      const r = st.safe ? 'safe' : st.locked ? 'locked' : !st.chamber ? 'click' : 'shot';
      if (r !== 'locked') act.fire();
      return r;
    },
    magazine() { act.magazine(); },
    rack() { act.rack(); },
    safety() { act.safety(); },
    night() { act.night(); },
    state: () => ({ rounds: st.rounds, cap: CAP, chamber: st.chamber, magIn: st.magIn, safe: st.safe, locked: st.locked, busy: busy() || (st.magT > 0 && st.magT < 1), night: st.night }),
    hold(on, o) {
      inHand = on; trigDelay = on ? 0 : 50; flashGain = on ? 30 : 1.2; flashLight.distance = on ? (o?.flash ?? 12) : 0.9; brassMax = on ? 40 : 12;
      ground = on && o ? o.ground : () => 0;
      if (!on) {                                              // back on the bench, the floor swept
        gun.position.set(0, GY, 0); gun.quaternion.identity();
        brass.forEach(drop); brass.length = 0; mags.forEach(m => m.g.removeFromParent()); mags.length = 0;
        if (!st.magIn) { st.magIn = true; st.rounds = CAP; st.magT = 0; }
        st.safe = true; st.safeT = 1;                         // made safe as it leaves the line
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

  // ═════ state ═════
  const st = {
    rounds: CAP, chamber: false, magIn: true, safe: true, night: false, stripped: false, locked: false,
    magT: 0, stripT: 0, safeT: 1, trigT: 0, stopT: 0,
    cycle: null as null | { kind: 'shot' | 'rack' | 'release'; t0: number; back: boolean; done: boolean; lock: boolean },
    shotAt: -1, trigAt: -1,
  };
  let slideZ = 0;
  const busy = () => !!st.cycle || (st.stripT > 0 && st.stripT < 1);

  /** the slide reached the rear: throw out what was in the chamber */
  function atRear(kind: 'shot' | 'rack' | 'release') {
    if (kind === 'shot') eject(false);
    else if (kind === 'rack' && st.chamber) eject(true);
    st.chamber = false;
    snd.click(0, 0.9);
  }
  /** on the way forward: feed from the magazine, or lock back on an empty one */
  function feed(): boolean {
    if (st.magIn && st.rounds > 0) { st.rounds--; st.chamber = true; return false; }
    return st.magIn;                              // an empty magazine's follower lifts the slide stop
  }

  const act = {
    fire() {
      if (st.stripped || st.stripT > 0) return say('reassemble first');
      if (busy()) return;
      st.trigAt = performance.now();
      if (st.safe) { snd.click(0, 0.6); return say('safety on'); }
      if (st.locked) return say('slide locked back');
      if (!st.chamber) { snd.click(0, 0.7); return say('click · chamber empty'); }
      st.cycle = { kind: 'shot', t0: performance.now() + trigDelay, back: false, done: false, lock: false };
    },
    rack() {
      if (st.stripped || st.stripT > 0) return say('reassemble first');
      if (busy()) return;
      st.cycle = { kind: st.locked ? 'release' : 'rack', t0: performance.now(), back: false, done: false, lock: false };
      snd.click(0, 1.1);
    },
    magazine() {
      if (st.stripped) return say('reassemble first');
      if (st.magT > 0 && st.magT < 1) return;
      st.magIn = !st.magIn;
      if (!st.magIn) { relAt = performance.now(); if (inHand) dropMag(); }
      if (st.magIn) { st.rounds = CAP; snd.click(0.28, 0.8); snd.thunk(0.3); }
      else { snd.click(0, 1.2); snd.tone(260, 0.09, 0.1, { type: 'triangle', at: 0.3 }); }
    },
    safety() { st.safe = !st.safe; snd.click(0, 1.35); },
    night() { st.night = !st.night; snd.button(); },
    strip() {
      if (busy()) return;
      if (!st.stripped) {
        if (st.magIn) return say('drop the magazine first');
        if (st.chamber) return say('clear the chamber first (rack it)');
        st.locked = false;
      }
      st.stripped = !st.stripped; snd.click(0, 0.8); snd.click(0.5, 1);
    },
    range() {
      if (rng?.on) { wantRange = false; rng.exit(); return; }
      if (st.stripped || st.stripT > 0) return say('reassemble first');
      wantRange = true;
      if (!realOn) { say('opening the range'); style(true); return; }   // goes on once the real view is up (tick)
      openRange();
    },
    demo() {
      if (script.active) { script.stop(); return; }
      script.start();
      const { later, when } = script;
      const idle = () => !busy() && (st.magT === 0 || st.magT === 1);
      // each step waits for the pistol to settle (frames can be slow or throttled), then pauses a beat
      const steps: [() => void, number][] = [
        [() => { if (st.stripped) act.strip(); }, 300],
        [() => { if (!st.safe) act.safety(); if (st.magIn) act.magazine(); }, 700],
        [() => act.magazine(), 700],
        [() => act.rack(), 600],
        [() => act.safety(), 600],
        [() => act.fire(), 450], [() => act.fire(), 450], [() => act.fire(), 700],
        [() => { act.safety(); script.end(); }, 0],
      ];
      const step = (i: number) => when(idle, () => { steps[i][0](); if (i + 1 < steps.length) later(steps[i][1], () => step(i + 1)); });
      if (!st.night) act.night();
      step(0);
    },
  } satisfies Record<string, () => void>;

  // ═════ per frame ═════
  const flashK = (now: number) => st.shotAt < 0 ? 0 : Math.exp(-Math.max(0, now - st.shotAt) / 28) * (now >= st.shotAt ? 1 : 0);
  function tick(now: number, dt: number) {
    if (wantRange && realOn && !rng?.on) openRange();
    rng?.tick(now, dt);
    st.magT = approach(st.magT, st.magIn ? 0 : 1, (st.magIn ? 2.6 : 4) * dt);
    st.stripT = approach(st.stripT, st.stripped ? 1 : 0, 0.9 * dt);
    st.safeT = approach(st.safeT, st.safe ? 1 : 0, 9 * dt);
    st.stopT = approach(st.stopT, st.locked ? 1 : 0, 12 * dt);

    // slide: recoil or a hand rack, then home (or locked back), or off the frame when stripped
    let z = st.locked ? -LOCK_BACK : 0;
    const c = st.cycle;
    if (c) {
      const t = (now - c.t0) / 1000;
      const [tb, tf] = c.kind === 'shot' ? [0.022, 0.07] : c.kind === 'rack' ? [0.18, 0.16] : [0.06, 0.1];
      if (t >= 0) {
        if (c.kind === 'shot' && st.shotAt < c.t0) {   // the round goes off
          st.shotAt = c.t0;
          snd.burst(0.2, 0.55, { freq: 1700, q: 0.6 }); snd.burst(0.4, 0.4, { type: 'lowpass', freq: 320 }); snd.tone(95, 0.22, 0.25, { type: 'triangle', to: 40 });
        }
        const from = c.kind === 'release' ? -LOCK_BACK : 0;
        if (t < tb) z = THREE.MathUtils.lerp(from, -SLIDE_BACK, c.kind === 'shot' ? t / tb : ease(t / tb));
        else {
          if (!c.back) { c.back = true; atRear(c.kind); c.lock = feed(); }
          const f = clamp01((t - tb) / tf), home = c.lock ? -LOCK_BACK : 0;
          z = THREE.MathUtils.lerp(-SLIDE_BACK, home, c.kind === 'shot' ? f : ease(f));
          if (f >= 1) { st.locked = c.lock; st.cycle = null; snd.click(0, c.lock ? 0.8 : 1); }
        }
      } else z = st.locked ? -LOCK_BACK : 0;
    }
    z += STRIP_FWD * phase(st.stripT, 0.25, 1);
    slideZ = z;
    slideG.position.set(0, 0.006 * phase(st.stripT, 0.85, 1), z);

    // trigger, safety levers, slide stop, takedown lever
    const tt = st.trigAt < 0 ? 1 : (now - st.trigAt) / 1000;
    trig.set((tt < 0.05 ? tt / 0.05 : clamp01(1 - (tt - 0.08) / 0.12)) * 13 * DEG);
    safeH.forEach(h => h.set(-(1 - st.safeT) * 16 * DEG));
    stopG.position.y = st.stopT * 0.0028;
    takeH.forEach(h => h.set(phase(st.stripT, 0, 0.25) * 90 * DEG));   // front swings down

    // magazine: falls down the grip axis onto the mat; loads back in and slows as it seats
    pMag.position.copy(MAG_DIR).multiplyScalar(MAG_DROP * st.magT * st.magT);
    pMag.visible = !inHand || st.magIn;
    for (const m of mags) {
      if (m.rest) continue;
      m.v.y -= 9.8 * dt; m.g.position.addScaledVector(m.v, dt); m.g.rotation.x += m.spin * dt;
      const gy = ground(m.g.position.x, m.g.position.z) + 0.0125;
      if (m.g.position.y <= gy) { m.g.position.y = gy; m.rest = true; m.g.rotation.set(0, m.g.rotation.y, Math.PI / 2); snd.tone(900, 0.06, 0.05); snd.tone(2400, 0.05, 0.03); }
    }
    rel.position.x = relAt < 0 ? 0 : -0.0012 * Math.max(0, 1 - (now - relAt) / 180);   // release pressed in
    topRound.visible = st.rounds > 0;

    // lights
    tritMat.emissiveIntensity = st.night ? 1.8 : 0;
    tritGlow.material.uniforms.intensity.value = st.night ? 0.95 : 0;
    const fk = flashK(now);
    flashMesh.visible = !realOn && fk > 0.04; flashMat.emissiveIntensity = 2.4 * fk; flashMesh.scale.setScalar(0.7 + fk * 0.6);
    flashGlow.material.uniforms.intensity.value = fk * 1.4;
    flashLight.intensity = fk * flashGain;

    bench.shadowMat.uniforms.opacity.value = E.shadowStrength() * 0.8;

    // brass: thrown, tumbling, one small bounce, then at rest on its side on the mat (the last 12 stay)
    for (const b of brass) {
      if (b.rest) continue;
      b.v.y -= 9.8 * dt;
      b.g.position.addScaledVector(b.v, dt);
      b.g.rotation.x += b.spin.x * dt; b.g.rotation.y += b.spin.y * dt; b.g.rotation.z += b.spin.z * dt;
      const gy = ground(b.g.position.x, b.g.position.z) + CASE_R;
      if (b.g.position.y <= gy) {
        b.g.position.y = gy;
        if (!b.bounced && b.v.y < -0.4) { b.bounced = true; b.v.set(b.v.x * 0.35, -b.v.y * 0.25, b.v.z * 0.35); b.spin.multiplyScalar(0.3); snd.tone(3300, 0.07, 0.03); snd.tone(4300, 0.05, 0.02); }
        else { b.rest = true; b.g.rotation.set(0, b.g.rotation.y, Math.PI / 2); snd.tone(3000, 0.05, 0.015); }
      }
    }
  }

  function readout() {
    if (rng?.on) return 'range · lane 3';
    const p: string[] = [];
    p.push(st.magIn ? `${st.rounds} in magazine` : 'magazine out');
    p.push(st.chamber ? 'round chambered' : 'chamber empty');
    p.push(st.stripped || st.stripT > 0 ? (st.stripT >= 1 ? 'field-stripped' : 'stripping') : st.locked ? 'slide locked back' : st.safe ? 'safe' : 'fire');
    if (st.night) p.push('tritium');
    return p.join(' · ');
  }

  // realistic style: on a shooting bench under the sky; tritium glows green, the flash is a short fireball
  const real: RealSpec = {
    focus: V(-0.05, 0.06, 0.09), size: 0.32, hide: [bench.deck], bench: MAT,
    materials: { ...RM, body: RM.blackSteel },
    lamps: [[tritMat, 'green']],
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
    view: { target: V(0.06, 0.15, 0.08), dist: 0.74, min: 0.2, max: 3 },
    actions: act, passive: ['night'],
    keyDown: (k, e) => rng?.keyDown(k, e) ?? false,
    keyUp: k => rng?.keyUp(k),
    blur: () => rng?.blur(),
    hud: () => rng?.hud() ?? null,
    on: () => ({ range: !!rng?.on, demo: script.active, fire: !!st.cycle && st.cycle.kind === 'shot', rack: st.locked, magazine: st.magIn, safety: st.safe, night: st.night, strip: st.stripped }),
    tick, readout,
    dispose() {
      rng?.dispose(); mags.forEach(m => m.g.removeFromParent());
      brass.forEach(drop);
      RM.stipple.bumpMap?.dispose(); RM.polymer.bumpMap?.dispose(); Object.values(RM).forEach(m => m.dispose());
      decalMats.forEach(m => { (m as THREE.MeshStandardMaterial).map?.dispose(); m.dispose(); });
      [caseReal, noseReal].forEach(g => g.dispose());
    },
  };
};

export default model;
