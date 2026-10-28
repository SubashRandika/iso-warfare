// M8 carbine (SIG MCX-SPEAR, the Army's XM7): a working magazine, bolt carrier, side charging handle, three-position
// selector (safe, semi, auto), bolt catch, folding stock, removable suppressor and a fitted low-power variable optic
// whose removal raises folding iron sights.
// Coordinates in metres: +z toward the muzzle, +y up, +x to the rifle's left; the bore axis is y = 0. Like every
// small arm it floats raised above its mat with no stand (the magazine's base GY − 0.195 above it), so a dropped
// magazine falls onto the mat and spent cases land beside it.
// The side profiles are traced from a side photograph (474 × 338, both rifles): 376 px from butt to suppressor tip.
// That photo is not square-scaled: across it is 2.6 mm per pixel (the 330 mm barrel and handguard), down it is
// 2.15 mm per pixel (the 6.8 mm magazine, the suppressor's diameter, the grip), giving 0.98 m overall with the
// suppressor. Details (controls, the brass-coloured bolt carrier, the scope and mount) follow a three-quarter photo.
// The handguard is eight panels with real M-LOK slots and lightening cuts, so the barrel, gas block and piston tube
// show through. Accent (live) parts: the illuminated reticle and the muzzle flash.
// Real view: coyote Cerakote aluminium, FDE polymer with stippled grip panels, black anodised controls, a nitrided
// barrel, a gold-tone bolt carrier, an anodised scope with coated lenses, a suppressor discoloured toward the muzzle,
// laser-engraved markings; brass 6.8 mm cases.
// Range (key G, Real view): the rifle is shouldered on lane 3 of the indoor range (lib/range/), looking through the
// optic (magnified, wheel sets the power) or the iron sights, with full-auto fire while the trigger is held.
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

const CAP = 20;
const GY = 0.3;                                             // bore axis above the mat
const MAT = { w: 0.5, d: 1.26, cx: 0, cz: 0.225 };          // the bench mat under the rifle (both styles)
const BACK = 0.072, LOCK = 0.06;                            // bolt carrier travel, and where it locks back on empty
const MAG_DROP = GY - 0.2;                                  // until the base plate meets the mat
const AX = 0.083;                                           // optic axis above the bore (a 1.54 in mount on the rail)
const RAIL = 0.044;                                         // top of the rail's teeth
const HG = { z0: 0.252, z1: 0.528, yc: 0.0055, a: 0.026, b: 0.0275, c: 0.0095, t: 0.0026 };   // handguard octagon
type Mode = 'safe' | 'semi' | 'auto';
const MODES: Mode[] = ['safe', 'semi', 'auto'];

type Cmd = ['M', number, number] | ['L', number, number] | ['Q', number, number, number, number];
const trace = (p: THREE.Path, cmds: Cmd[]) => cmds.forEach(c => c[0] === 'M' ? p.moveTo(c[1], c[2]) : c[0] === 'L' ? p.lineTo(c[1], c[2]) : p.quadraticCurveTo(c[1], c[2], c[3], c[4]));
/** a side profile in (z, y) with optional holes */
const profile = (cmds: Cmd[], holes: (Cmd[] | THREE.Path)[] = []) => {
  const s = new THREE.Shape(); trace(s, cmds);
  holes.forEach(h => { if (h instanceof THREE.Path) s.holes.push(h); else { const p = new THREE.Path(); trace(p, h); s.holes.push(p); } });
  return s;
};
/** extrude a (z, y) profile across x0..x1 with every edge rounded by `bevel` in `segs` steps; the outline stays put */
const across = (s: THREE.Shape, x0: number, x1: number, bevel = 0.001, segs = 1) => {
  const g = new THREE.ExtrudeGeometry(s, { depth: x1 - x0 - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: segs, curveSegments: 8 });
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
/** a hole: a stadium (an M-LOK slot) in a panel's (u, v) plane */
const slot = (uc: number, vc: number, len: number, wid: number) => {
  const r = wid / 2, a = uc - len / 2 + r, b = uc + len / 2 - r, p = new THREE.Path();
  p.moveTo(a, vc - r); p.lineTo(b, vc - r); p.absarc(b, vc, r, -Math.PI / 2, Math.PI / 2, false); p.lineTo(a, vc + r); p.absarc(a, vc, r, Math.PI / 2, Math.PI * 1.5, false);
  return p;
};
const roundHole = (uc: number, vc: number, r: number) => { const p = new THREE.Path(); p.absarc(uc, vc, r, 0, Math.PI * 2, true); return p; };
const slant = (u0: number, v0: number, v1: number, w: number, lean: number) => { const p = new THREE.Path(); p.moveTo(u0, v0); p.lineTo(u0 + w, v0); p.lineTo(u0 + w + lean, v1); p.lineTo(u0 + lean, v1); p.closePath(); return p; };

// ── side profiles (z, y), from the photograph ──
const LOWER: Cmd[] = [['M', -0.028, -0.016], ['L', 0.148, -0.016], ['L', 0.148, -0.05], ['L', 0.082, -0.05], ['L', 0.04, -0.048], ['L', 0.012, -0.034], ['L', -0.02, -0.032], ['Q', -0.028, -0.031, -0.028, -0.024]];
const MAGWELL: Cmd[] = [['M', 0.144, -0.016], ['L', 0.25, -0.016], ['L', 0.25, -0.034], ['L', 0.246, -0.06], ['Q', 0.245, -0.066, 0.24, -0.067], ['L', 0.153, -0.077], ['Q', 0.146, -0.078, 0.146, -0.071], ['L', 0.144, -0.05]];
const UPPER: Cmd[] = [['M', -0.028, -0.016], ['L', 0.254, -0.016], ['L', 0.254, 0.033], ['L', -0.022, 0.033], ['Q', -0.028, 0.033, -0.028, 0.027]];
const PORT: Cmd[] = [['M', 0.078, -0.006], ['L', 0.165, -0.006], ['L', 0.165, 0.018], ['L', 0.078, 0.018]];
/** pistol grip, raked about 24°, its front with a shallow finger groove */
const GRIP: Cmd[] = [
  ['M', 0.036, -0.046], ['L', 0.031, -0.061], ['Q', 0.022, -0.075, 0.012, -0.092], ['Q', 0.002, -0.11, 0.001, -0.121], ['Q', 0.001, -0.13, 0.01, -0.132],
  ['L', 0.054, -0.139], ['Q', 0.062, -0.14, 0.062, -0.13], ['L', 0.062, -0.116], ['Q', 0.064, -0.104, 0.069, -0.094], ['Q', 0.073, -0.084, 0.074, -0.075], ['L', 0.078, -0.048],
];
/** the stippled panel on each side of the grip */
const GRIP_PANEL: Cmd[] = [['M', 0.03, -0.068], ['Q', 0.02, -0.084, 0.012, -0.1], ['Q', 0.007, -0.112, 0.012, -0.124], ['L', 0.05, -0.13], ['Q', 0.056, -0.13, 0.056, -0.122], ['L', 0.057, -0.106], ['Q', 0.06, -0.09, 0.064, -0.076], ['L', 0.064, -0.07]];
const GUARD: Cmd[] = [['M', 0.07, -0.049], ['L', 0.15, -0.049], ['L', 0.15, -0.077], ['L', 0.078, -0.077], ['Q', 0.072, -0.077, 0.07, -0.07]];
const GUARD_HOLE: Cmd[] = [['M', 0.08, -0.05], ['L', 0.144, -0.05], ['L', 0.144, -0.069], ['L', 0.083, -0.069], ['Q', 0.08, -0.069, 0.08, -0.066]];
/** trigger: a curved blade, its face toward the muzzle */
const TRIGGER: Cmd[] = [['M', 0.1, -0.049], ['L', 0.107, -0.049], ['Q', 0.1, -0.058, 0.106, -0.067], ['Q', 0.107, -0.069, 0.104, -0.068], ['Q', 0.096, -0.06, 0.1, -0.049]];
/** stock: butt, cheek line, the slim arm to the folding hinge (drawn in rifle coordinates, extended and unfolded) */
const STOCK: Cmd[] = [
  ['M', -0.247, 0.031], ['L', -0.11, 0.031], ['L', -0.098, 0.028], ['L', -0.046, 0.027], ['L', -0.046, 0.004], ['L', -0.072, 0.001], ['Q', -0.088, -0.003, -0.098, -0.016],
  ['Q', -0.106, -0.026, -0.125, -0.027], ['L', -0.19, -0.03], ['Q', -0.212, -0.034, -0.224, -0.052], ['L', -0.236, -0.067], ['L', -0.247, -0.067],
];
const STOCK_SLOT: Cmd[] = [['M', -0.236, -0.018], ['L', -0.225, -0.018], ['L', -0.223, -0.044], ['L', -0.234, -0.044]];
const BUTTPAD: Cmd[] = [['M', -0.262, 0.03], ['Q', -0.262, 0.034, -0.258, 0.034], ['L', -0.246, 0.034], ['L', -0.246, -0.069], ['L', -0.257, -0.069], ['Q', -0.262, -0.069, -0.262, -0.063]];
const MAG: Cmd[] = [['M', 0.154, -0.016], ['L', 0.239, -0.016], ['L', 0.242, -0.186], ['L', 0.152, -0.186]];
const BASEPLATE: Cmd[] = [['M', 0.149, -0.185], ['L', 0.246, -0.185], ['L', 0.246, -0.19], ['Q', 0.246, -0.196, 0.24, -0.196], ['L', 0.155, -0.196], ['Q', 0.149, -0.196, 0.149, -0.19]];
const SELECTOR: Cmd[] = [['M', -0.004, -0.004], ['L', 0.012, -0.0026], ['Q', 0.0175, 0, 0.012, 0.0026], ['L', -0.004, 0.004], ['Q', -0.0065, 0, -0.004, -0.004]];
const CATCH: Cmd[] = [['M', 0.127, -0.03], ['L', 0.143, -0.025], ['Q', 0.146, -0.026, 0.145, -0.03], ['L', 0.144, -0.036], ['L', 0.13, -0.04], ['Q', 0.126, -0.038, 0.127, -0.03]];

/** finishes for the Real view, by tag; untagged meshes get the coyote Cerakote */
function realMaterials() {
  const tex: THREE.Texture[] = [];
  const canvasTex = (n: number, draw: (x: CanvasRenderingContext2D, n: number) => void, rep: number, srgb = false) => {
    const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d')!, n);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.setScalar(rep); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8;
    tex.push(t); return t;
  };
  const noise = (lo: number, span: number) => (x: CanvasRenderingContext2D, n: number) => {
    const img = x.createImageData(n, n);
    for (let i = 0; i < img.data.length; i += 4) { const v = lo + Math.random() * span; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    x.putImageData(img, 0, 0);
  };
  const grain = canvasTex(128, noise(116, 24), 160);
  const stip = canvasTex(128, (x, n) => {
    x.fillStyle = '#808080'; x.fillRect(0, 0, n, n);
    for (let i = 0; i < 1000; i++) {
      const v = Math.random() < 0.55 ? 210 : 40, px = Math.random() * n, py = Math.random() * n, r = 1.2 + Math.random() * 1.8;
      x.fillStyle = `rgb(${v},${v},${v})`;
      for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) { x.beginPath(); x.arc(px + ox, py + oy, r, 0, Math.PI * 2); x.fill(); }
    }
  }, 30);
  // fine straight knurling for the power ring and turret caps (u runs round the part)
  const knurl = canvasTex(64, (x, n) => { for (let i = 0; i < n; i++) { const v = i % 4 < 2 ? 210 : 50; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(i, 0, 1, n); } }, 1);
  knurl.repeat.set(20, 1);
  // the suppressor's Cerakote: speckled, darkening and browning toward the hot front end (v runs rear → front)
  const supp = canvasTex(256, (x, n) => {
    const g = x.createLinearGradient(0, n, 0, 0); g.addColorStop(0, '#9b7d5b'); g.addColorStop(0.55, '#977756'); g.addColorStop(0.85, '#7d6045'); g.addColorStop(1, '#5c4635');
    x.fillStyle = g; x.fillRect(0, 0, n, n);
    for (let i = 0; i < 5000; i++) { const v = Math.random(); x.fillStyle = `rgba(${v < 0.5 ? '40,30,22' : '200,175,140'},${0.05 + Math.random() * 0.07})`; x.fillRect(Math.random() * n, Math.random() * n, 1.5, 1.5); }
  }, 1, true);
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  const M = {
    cerakote: new THREE.MeshPhysicalMaterial({ color: 0x8a6d4e, metalness: 0.22, roughness: 0.56, bumpMap: grain, bumpScale: 0.12, clearcoat: 0.08, clearcoatRoughness: 0.7 }),
    polymer: std({ color: 0x8b7455, roughness: 0.74, bumpMap: grain, bumpScale: 0.3 }),
    stockPoly: std({ color: 0x9a8566, roughness: 0.78, bumpMap: grain, bumpScale: 0.3 }),
    gripPoly: std({ color: 0x7a5c3f, roughness: 0.72, bumpMap: grain, bumpScale: 0.3 }),
    magPoly: std({ color: 0x7c6a4e, roughness: 0.8, bumpMap: grain, bumpScale: 0.35 }),
    stipple: std({ color: 0x735538, roughness: 0.92, bumpMap: stip, bumpScale: 0.9, side: THREE.DoubleSide }),
    rubber: std({ color: 0x3b342c, roughness: 0.95, bumpMap: stip, bumpScale: 0.6 }),
    black: std({ color: 0x1c1c1e, metalness: 0.5, roughness: 0.42 }),
    nitride: std({ color: 0x232325, metalness: 0.7, roughness: 0.38 }),
    brake: std({ color: 0x1f1f20, metalness: 0.3, roughness: 0.62, bumpMap: grain, bumpScale: 0.1 }),
    supp: std({ map: supp, metalness: 0.18, roughness: 0.62, bumpMap: grain, bumpScale: 0.15 }),
    carrier: std({ color: 0x9c7a44, metalness: 1, roughness: 0.38 }),
    scope: new THREE.MeshPhysicalMaterial({ color: 0x6e5a44, metalness: 0.45, roughness: 0.42, clearcoat: 0.2, clearcoatRoughness: 0.5 }),
    mount: std({ color: 0x5e5a4d, metalness: 0.5, roughness: 0.46 }),
    knurl: std({ color: 0x2c2824, roughness: 0.82, bumpMap: knurl, bumpScale: 1.2 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x06090c, metalness: 0.15, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.55, iridescenceIOR: 1.5, iridescenceThicknessRange: [360, 560] }),
    steel: std({ color: 0xb4b8bb, metalness: 1, roughness: 0.3 }),
    brass: std({ color: 0xc9a04c, metalness: 1, roughness: 0.26, side: THREE.DoubleSide }),
    copper: std({ color: 0xb86a40, metalness: 1, roughness: 0.3 }),
    groove: std({ color: 0x3b3226, roughness: 0.9, side: THREE.DoubleSide }),
  };
  return { M, tex };
}

const model: ModelFactory = ({ E, snd, script, say, style, def, open, arrive }) => {
  const K = makeKit(E, { unit: 0.05 });
  const { add, part, hinge, box, well, lines } = K;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const gun = K.root; gun.position.y = GY;
  const bench = buildPlate(E, { ...MAT, grid: 0.01, ruler: true, shadow: [0.22, 1.1, 0, 0.22] });
  const { M: RM, tex: RTex } = realMaterials();
  const realOnly: THREE.Object3D[] = [], decalMats: THREE.Material[] = [];
  /** detail that only shows in the Real view (the hairline view draws it as lines or leaves it out) */
  const realAdd = (parent: THREE.Object3D, geo: THREE.BufferGeometry, tag: string) => {
    const m = add(parent, geo, undefined, { real: tag, lines: false }); m.visible = false; realOnly.push(m); return m;
  };

  // ═════ lower receiver: trigger group housing, magazine well, guard ═════
  const pLower = part('lower', gun);
  add(pLower, across(profile(LOWER), -0.0115, 0.0115, 0.0012, 3));
  add(pLower, across(profile(MAGWELL), -0.0165, 0.0165, 0.0015, 3));
  add(pLower, across(profile(GUARD, [GUARD_HOLE]), -0.0085, 0.0085, 0.0012, 3));
  well(pLower, [V(-0.0136, -0.0765, 0.153), V(0.0136, -0.0765, 0.153), V(0.0136, -0.0675, 0.24), V(-0.0136, -0.0675, 0.24)], V(0, -1, 0.1));   // the magazine well's mouth
  // rear of the lower, where the stock hinge block sits; QD sling cup on the left
  add(pLower, rbox(0.03, 0.036, 0.02, 0, 0.006, -0.037, 0.003), undefined, { real: 'black' });
  add(pLower, cylX(0.0055, 0.015, 0.018, 0.006, -0.037, 12), undefined, { real: 'black' });

  // ═════ pistol grip ═════
  const pGrip = part('grip', gun);
  add(pGrip, across(profile(GRIP), -0.0145, 0.0145, 0.0026, 4), undefined, { real: 'gripPoly' });
  const gripPanel = profile(GRIP_PANEL);
  for (const k of SIDES) {
    pGrip.add(E.loopLine(gripPanel.getPoints(4).map(p => V(k * 0.0148, p.y, p.x)), E.mats.line));
    realAdd(pGrip, new THREE.ShapeGeometry(gripPanel, 4).rotateY(-Math.PI / 2).translate(k * 0.01485, 0, 0), 'stipple');
  }

  // ═════ trigger, selector, bolt catch, magazine release ═════
  const pTrig = part('trigger', gun);
  const trig = hinge(pTrig, V(0, -0.049, 0.103), V(1, 0, 0), 'x');
  add(trig.inner, across(profile(TRIGGER), -0.003, 0.003, 0.0006, 3), undefined, { real: 'black' });
  const pSel = part('selector', gun), selH: ReturnType<typeof hinge>[] = [];
  for (const k of SIDES) {
    const h = hinge(pSel, V(0, -0.027, 0.024), V(1, 0, 0), 'x'); selH.push(h);
    const x0 = 0.0115, t = k > 0 ? 0.0024 : 0.0016;
    const lever = profile(SELECTOR.map(c => c[0] === 'Q' ? ['Q', c[1] * (k > 0 ? 1 : 0.7), c[2], c[3] * (k > 0 ? 1 : 0.7), c[4]] : [c[0], c[1] * (k > 0 ? 1 : 0.7), c[2]]) as Cmd[]);
    const g = across(lever, k > 0 ? x0 : -x0 - t, k > 0 ? x0 + t : -x0, 0.0005, 2); g.translate(0, -0.027, 0.024);
    add(h.inner, g, undefined, { real: 'black' });
    add(h.inner, cylX(0.0045, k * x0, k * (x0 + 0.0012), -0.027, 0.024, 16), undefined, { real: 'black' });
  }
  const pCatch = part('boltCatch', gun), catchG = new THREE.Group(); pCatch.add(catchG);
  add(catchG, across(profile(CATCH), 0.0115, 0.0135, 0.0005, 2), undefined, { real: 'black' });
  const rel = new THREE.Group(); rel.userData.part = 'magazine'; gun.add(rel);
  add(rel, cylX(0.0042, -0.0115, -0.0148, -0.034, 0.137, 12), undefined, { real: 'black' });
  add(pLower, cylX(0.0062, -0.0115, -0.0128, -0.034, 0.137, 16));                                  // the fence round it
  for (const z of [0.064, 0.1]) add(pLower, cylX(0.0024, -0.0121, 0.0121, -0.039, z, 10), undefined, { real: 'steel' });   // hammer and trigger pins
  for (const k of SIDES) add(pLower, cylX(0.0068, k * 0.0115, k * 0.0121, -0.027, 0.024, 20));     // boss round the selector

  // ═════ upper receiver: body, ejection port and bolt carrier, side charging handle, rear handle ═════
  const pUpper = part('upper', gun);
  // the ejection port is a real opening (the profile's hole runs right through; a plate closes the left side), so the
  // bolt carrier shows set back inside it and travels behind it
  add(pUpper, across(profile(UPPER, [PORT]), -0.016, 0.016, 0.0016, 3));
  add(pUpper, box(0.0124, 0.0161, -0.0068, 0.0188, 0.0772, 0.1658));
  well(pUpper, [V(0.0122, -0.0062, 0.0782), V(0.0122, -0.0062, 0.1648), V(0.0122, 0.0178, 0.1648), V(0.0122, 0.0178, 0.0782)], V(-1, 0, 0));
  for (const [y, f] of [[-0.0058, 1], [0.0176, -1]] as const) well(pUpper, [V(-0.0158, y, 0.079), V(-0.0158, y, 0.164), V(0.012, y, 0.164), V(0.012, y, 0.079)], V(0, f, 0));
  add(pUpper, rbox(0.004, 0.018, 0.016, -0.0175, 0.015, 0.068, 0.0015));                          // brass deflector behind the port
  const carrier = new THREE.Group(); pUpper.add(carrier);
  add(carrier, merge([box(-0.0118, 0.0105, -0.0052, 0.0168, 0.02, 0.148), box(-0.0122, -0.0118, 0.0025, 0.0085, 0.06, 0.13)]), undefined, { real: 'carrier', minLen: 0.004 });
  add(carrier, cylZ(0.0083, 0.148, 0.1665, 14, 0, 0.0058), undefined, { real: 'nitride' });     // the bolt head
  add(carrier, cylX(0.0027, -0.0124, -0.0108, 0.011, 0.123, 10), undefined, { real: 'steel' });  // cam pin
  // side charging handle on the left: a slot in the receiver and the handle riding in it
  well(pUpper, [V(0.01605, 0.01, 0.125), V(0.01605, 0.01, 0.248), V(0.01605, 0.019, 0.248), V(0.01605, 0.019, 0.125)], V(1, 0, 0));
  const pCharge = part('charging', gun), chargeG = new THREE.Group(); pCharge.add(chargeG);
  add(chargeG, rbox(0.016, 0.009, 0.013, 0.0235, 0.0145, 0.238, 0.003), undefined, { real: 'black' });
  add(chargeG, box(0.016, 0.0175, 0.0115, 0.0175, 0.233, 0.243), undefined, { real: 'black' });
  // the rear charging handle's latch wings under the eyepiece
  add(pUpper, merge([box(-0.022, 0.022, 0.021, 0.027, -0.04, -0.032), box(-0.004, 0.004, 0.021, 0.027, -0.032, -0.026)]), undefined, { real: 'black' });

  // ═════ the Picatinny rail along the top of receiver and handguard: a dovetail base with teeth every 10 mm ═════
  const railBase = (() => {
    const s = new THREE.Shape([V(-0.0094, 0.033, 0), V(0.0094, 0.033, 0), V(0.0106, 0.0355, 0), V(0.0106, 0.0375, 0), V(0.0094, 0.0392, 0), V(-0.0094, 0.0392, 0), V(-0.0106, 0.0375, 0), V(-0.0106, 0.0355, 0)].map(p => new THREE.Vector2(p.x, p.y)));
    return new THREE.ExtrudeGeometry(s, { depth: 0.553, bevelEnabled: false }).translate(0, 0, -0.026);
  })();
  add(pUpper, railBase);
  const lugs: THREE.BufferGeometry[] = [];
  for (let z = -0.0235; z < 0.526; z += 0.01) lugs.push(new THREE.BoxGeometry(0.0188, 0.0048, 0.0049).translate(0, RAIL - 0.0024, z));
  add(pUpper, merge(lugs), undefined, { minLen: 0.002 });

  // ═════ handguard: eight panels round an octagon, with M-LOK slots and lightening cuts through them ═════
  const pHand = part('handguard', gun);
  const L = HG.z1 - HG.z0, side = 2 * (HG.b - HG.c), flat = 2 * (HG.a - HG.c), cham = Math.SQRT2 * HG.c;
  const chamR = (HG.a + HG.b - HG.c) / Math.SQRT2;
  /** a flat panel L long, W wide, with holes in its (u along the rifle, v across) plane, laid on the octagon face whose
   *  outward normal points at angle phi (0 = the rifle's left, 90° = up) */
  const panel = (W: number, R: number, phi: number, holes: THREE.Path[]) => {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(L, 0); s.lineTo(L, W); s.lineTo(0, W); s.closePath(); s.holes.push(...holes);
    const g = new THREE.ExtrudeGeometry(s, { depth: HG.t, bevelEnabled: false, curveSegments: 6 });
    g.applyMatrix4(new THREE.Matrix4().set(0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));   // (u, v, depth) → (z, y, −x)
    g.rotateZ(phi);
    const n = V(Math.cos(phi), Math.sin(phi), 0), tg = V(-Math.sin(phi), Math.cos(phi), 0);
    g.translate(n.x * R + tg.x * -W / 2, HG.yc + n.y * R + tg.y * -W / 2, HG.z0);
    return g;
  };
  const mlok = (W: number, n: number, step: number, u0: number) => Array.from({ length: n }, (_, i) => slot(u0 + i * step, W / 2, 0.032, 0.0072));
  for (const [phi, flip] of [[0, false], [Math.PI, true]] as const) {
    const v = (y: number) => flip ? side - y : y;                    // the right panel is turned over: mirror its rows
    const holes = [
      ...Array.from({ length: 6 }, (_, i) => slot(0.026 + i * 0.042, v(0.0265), 0.032, 0.0072)),
      ...Array.from({ length: 9 }, (_, i) => flip ? slant(0.022 + i * 0.027, side - 0.017, side - 0.004, 0.0095, -0.0045) : slant(0.022 + i * 0.027, 0.004, 0.017, 0.0095, 0.0045)),
    ];
    add(pHand, panel(side, HG.a, phi, holes));
  }
  for (const phi of [Math.PI / 4, Math.PI * 3 / 4]) add(pHand, panel(cham, chamR, phi, Array.from({ length: 9 }, (_, i) => roundHole(0.03 + i * 0.027, cham / 2, 0.0026))));
  for (const phi of [-Math.PI / 4, -Math.PI * 3 / 4]) add(pHand, panel(cham, chamR, phi, mlok(cham, 5, 0.048, 0.042)));
  add(pHand, panel(flat, HG.b, Math.PI / 2, []));
  add(pHand, panel(flat, HG.b, -Math.PI / 2, mlok(flat, 6, 0.042, 0.03)));
  { // end plates: round the receiver at the back, round the barrel at the front
    const oct = (o: number) => { const a = HG.a + o, b = HG.b + o, c = HG.c; return [[-a + c, b], [a - c, b], [a, b - c], [a, -b + c], [a - c, -b], [-a + c, -b], [-a, -b + c], [-a, b - c]].map(([x, y]) => new THREE.Vector2(x, y + HG.yc)); };
    const rear = new THREE.Shape(oct(0)); const rh = new THREE.Path(); rh.moveTo(-0.016, -0.016); rh.lineTo(0.016, -0.016); rh.lineTo(0.016, 0.033); rh.lineTo(-0.016, 0.033); rh.closePath(); rear.holes.push(rh);
    add(pHand, new THREE.ExtrudeGeometry(rear, { depth: 0.006, bevelEnabled: false }).translate(0, 0, HG.z0 - 0.002));
    const front = new THREE.Shape(oct(0.0004)); front.holes.push(roundHole(0, HG.yc - 0.0055, 0.0145));
    add(pHand, new THREE.ExtrudeGeometry(front, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0012, bevelOffset: -0.0012, bevelSegments: 2, curveSegments: 16 }).translate(0, 0, HG.z1 - 0.008));
  }
  add(pHand, cylX(0.0055, HG.a, HG.a + 0.003, -0.003, HG.z1 - 0.025, 12), undefined, { real: 'black' });   // QD sling cup, front left

  // ═════ barrel, gas block and piston tube (seen through the handguard), muzzle brake ═════
  const pBarrel = part('barrel', gun);
  add(pBarrel, cylZ(0.0095, 0.2, 0.552, 18), undefined, { real: 'nitride' });
  add(pBarrel, rbox(0.026, 0.036, 0.026, 0, 0.006, 0.44, 0.004), undefined, { real: 'nitride' });           // gas block
  add(pBarrel, cylZ(0.0062, 0.255, 0.428, 12, 0, 0.0185), undefined, { real: 'nitride' });                 // piston tube
  const brake = new THREE.Group(); pBarrel.add(brake);
  add(brake, turn([[0.0098, 0.548], [0.017, 0.548], [0.0172, 0.552], [0.0172, 0.588], [0.0158, 0.593], [0.006, 0.593]], 20), undefined, { real: 'brake' });
  for (const k of [1, -1]) for (const z of [0.566, 0.578]) well(brake, [V(k * 0.0174, -0.004, z - 0.004), V(k * 0.0174, -0.004, z + 0.004), V(k * 0.0174, 0.006, z + 0.004), V(k * 0.0174, 0.006, z - 0.004)], V(k, 0, 0));   // ports
  const bore = new THREE.Mesh(new THREE.CircleGeometry(0.0042, 16), E.mats.recess); bore.position.set(0, 0, 0.5932); bore.raycast = () => {}; brake.add(bore);

  // ═════ suppressor: black locking collar, Cerakoted body, front cap with its vents ═════
  const pSupp = part('suppressor', gun), suppG = new THREE.Group(); pSupp.add(suppG);
  add(suppG, turn([[0.0172, 0.546], [0.0195, 0.548], [0.0199, 0.551], [0.0199, 0.592], [0.0196, 0.598]], 24), undefined, { real: 'brake' });
  const suppBody = turn([[0.0196, 0.597], [0.0214, 0.6], [0.0214, 0.706], [0.0211, 0.712], [0.0188, 0.7175], [0.004, 0.718]], 28);
  add(suppG, suppBody, undefined, { real: 'supp' });
  lines(suppG, Array.from({ length: 12 }, (_, i) => { const a = i / 12 * Math.PI * 2, c = Math.cos(a) * 0.0201, s = Math.sin(a) * 0.0201; return [V(c, s, 0.553), V(c, s, 0.589)] as [THREE.Vector3, THREE.Vector3]; }));   // grip flutes on the collar
  const suppBore = new THREE.Mesh(new THREE.CircleGeometry(0.0055, 16), E.mats.recess); suppBore.position.set(0, 0, 0.7182); suppBore.raycast = () => {}; suppG.add(suppBore);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, h = new THREE.Mesh(new THREE.CircleGeometry(0.0017, 10), E.mats.recess); h.position.set(Math.cos(a) * 0.0125, Math.sin(a) * 0.0125, 0.7181); h.raycast = () => {}; suppG.add(h); }

  // ═════ stock: folds to the left on a hinge at the rear of the receiver ═════
  const pStock = part('stock', gun);
  const fold = hinge(pStock, V(0.022, 0.012, -0.046), V(0, 1, 0), 'y');
  add(fold.inner, across(profile(STOCK, [STOCK_SLOT]), -0.019, 0.019, 0.0024, 4), undefined, { real: 'stockPoly' });
  add(fold.inner, across(profile(BUTTPAD), -0.0215, 0.0215, 0.0025, 4), undefined, { real: 'rubber' });
  add(fold.inner, cylX(0.0055, 0.019, 0.0215, -0.012, -0.205, 12), undefined, { real: 'black' });         // QD cup in the stock
  add(fold.inner, rbox(0.01, 0.03, 0.012, 0.017, 0.012, -0.05, 0.002), undefined, { real: 'black' });      // hinge knuckle
  for (const k of SIDES) lines(fold.inner, [[V(k * 0.0192, 0.02, -0.21), V(k * 0.0192, 0.02, -0.12)], [V(k * 0.0192, -0.02, -0.2), V(k * 0.0192, -0.02, -0.13)]]);   // the cheek-rest panel's edges

  // ═════ magazine: 20-round polymer, ribbed low on its sides, the top round showing ═════
  const pMag = part('magazine', gun);
  add(pMag, across(profile(MAG), -0.0134, 0.0134, 0.0012, 3), undefined, { real: 'magPoly' });
  add(pMag, across(profile(BASEPLATE), -0.0158, 0.0158, 0.0015, 3), undefined, { real: 'magPoly' });
  { const ribs: THREE.BufferGeometry[] = [];
    for (const k of SIDES) for (let i = 0; i < 6; i++) ribs.push(new THREE.BoxGeometry(0.0012, 0.0018, 0.074).translate(k * 0.0138, -0.153 - i * 0.0052, 0.197));
    add(pMag, merge(ribs), undefined, { real: 'magPoly', minLen: 0.004 });
    for (const k of SIDES) well(pMag, [V(k * 0.01345, -0.04, 0.229), V(k * 0.01345, -0.04, 0.234), V(k * 0.01345, -0.132, 0.235), V(k * 0.01345, -0.132, 0.23)], V(k, 0, 0));   // witness window
  }
  const topRound = new THREE.Group(); pMag.add(topRound);
  const caseLathe = [[0, -0.0255], [0.0059, -0.0255], [0.006, -0.024], [0.0052, -0.0225], [0.0052, -0.021], [0.006, -0.0205], [0.0059, 0.012], [0.004, 0.0175], [0.0037, 0.0255], [0.0034, 0.0255], [0.0034, 0.02]] as [number, number][];
  const noseLathe = [[0.0036, 0.025], [0.0036, 0.033], [0.0028, 0.041], [0.0012, 0.0475], [0, 0.048]] as [number, number][];
  { const c = turn(caseLathe, 14), n = turn(noseLathe, 14); c.translate(0, -0.011, 0.185); n.translate(0, -0.011, 0.185); add(topRound, c, undefined, { real: 'brass' }); add(topRound, n, undefined, { real: 'copper' }); }

  // ═════ folding iron sights: rear aperture and front post, flat under the optic, standing when it comes off ═════
  const pSights = part('sights', gun);
  add(pSights, box(-0.0105, 0.0105, RAIL, RAIL + 0.008, -0.01, 0.024), undefined, { real: 'black' });
  add(pSights, box(-0.0105, 0.0105, RAIL, RAIL + 0.008, 0.49, 0.522), undefined, { real: 'black' });
  const rearLeaf = hinge(pSights, V(0, RAIL + 0.008, 0.004), V(1, 0, 0), 'x');
  { const s = new THREE.Shape(); s.moveTo(-0.0095, 0); s.lineTo(0.0095, 0); s.lineTo(0.0095, 0.024); s.lineTo(0.004, 0.027); s.lineTo(-0.004, 0.027); s.lineTo(-0.0095, 0.024); s.closePath();
    s.holes.push(roundHole(0, 0.018, 0.0019));
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: false, curveSegments: 12 }); g.translate(0, RAIL + 0.008, 0.002);
    add(rearLeaf.inner, g, undefined, { real: 'black' }); }
  const frontLeaf = hinge(pSights, V(0, RAIL + 0.008, 0.506), V(1, 0, 0), 'x');
  { const s = new THREE.Shape(); s.moveTo(-0.0095, 0); s.lineTo(0.0095, 0); s.lineTo(0.0095, 0.024); s.lineTo(0.0058, 0.024); s.lineTo(0.0058, 0.006); s.lineTo(-0.0058, 0.006); s.lineTo(-0.0058, 0.024); s.lineTo(-0.0095, 0.024); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: false }); g.translate(0, RAIL + 0.008, 0.504);
    add(frontLeaf.inner, merge([g, new THREE.BoxGeometry(0.0022, 0.012, 0.0022).translate(0, RAIL + 0.008 + 0.0115, 0.506)]), undefined, { real: 'black' }); }
  const IRON = { rear: V(0, RAIL + 0.026, 0.004), front: V(0, RAIL + 0.0255, 0.506) };   // aperture centre, post tip (standing)

  // ═════ optic: a 1–6× scope on a cantilever mount, coated lenses, illuminated reticle ═════
  const pOptic = part('optic', gun), opticG = new THREE.Group(); pOptic.add(opticG);
  add(opticG, turn([[0.0186, -0.0452], [0.0214, -0.044], [0.0216, -0.018], [0.0208, -0.012], [0.0204, -0.004]], 32, 0, AX), undefined, { real: 'scope' });    // eyepiece
  add(opticG, turn([[0.0204, -0.004], [0.0208, -0.002], [0.0208, 0.019], [0.0204, 0.021]], 32, 0, AX), undefined, { real: 'knurl' });                          // power ring
  add(opticG, turn([[0.0204, 0.021], [0.0192, 0.024], [0.0151, 0.031], [0.0151, 0.176], [0.0157, 0.183], [0.0166, 0.204], [0.0166, 0.214], [0.0158, 0.2172]], 32, 0, AX), undefined, { real: 'scope' });
  add(opticG, rbox(0.032, 0.03, 0.038, 0, AX, 0.106, 0.006), undefined, { real: 'scope' });                 // turret saddle
  { const t = new THREE.CylinderGeometry(0.0118, 0.0118, 0.016, 24); t.translate(0, AX + 0.023, 0.106); add(opticG, t, undefined, { real: 'knurl' });         // elevation
    const w = new THREE.CylinderGeometry(0.0118, 0.0118, 0.016, 24); w.rotateZ(Math.PI / 2); w.translate(-0.023, AX, 0.106); add(opticG, w, undefined, { real: 'knurl' });   // windage
    const il = new THREE.CylinderGeometry(0.0105, 0.0105, 0.012, 20); il.rotateZ(Math.PI / 2); il.translate(0.021, AX, 0.106); add(opticG, il, undefined, { real: 'scope' });   // illumination
    add(opticG, rbox(0.004, 0.016, 0.009, 0, AX + 0.026, 0.009, 0.0015), undefined, { real: 'scope' }); }   // throw lever on the power ring
  for (const z of [0.052, 0.152]) {                                        // rings and the cantilever arm down to the rail
    add(opticG, turn([[0.0151, z - 0.0085], [0.0172, z - 0.0085], [0.0172, z + 0.0085], [0.0151, z + 0.0085]], 28, 0, AX), undefined, { real: 'mount' });
    add(opticG, box(-0.0095, 0.0095, RAIL + 0.002, AX - 0.012, z - 0.0085, z + 0.0085), undefined, { real: 'mount' });
  }
  add(opticG, box(-0.0125, 0.0125, RAIL - 0.004, RAIL + 0.008, 0.07, 0.172), undefined, { real: 'mount' });   // base clamped on the rail
  for (const z of [0.09, 0.15]) add(opticG, rbox(0.006, 0.01, 0.018, -0.0155, RAIL + 0.001, z, 0.002), undefined, { real: 'black' });   // throw levers
  const eyeGlass = new THREE.Mesh(new THREE.CircleGeometry(0.0165, 28), E.mats.glass); eyeGlass.position.set(0, AX, -0.0446); eyeGlass.rotation.y = Math.PI; eyeGlass.userData.real = 'glass'; opticG.add(eyeGlass);
  const objGlass = new THREE.Mesh(new THREE.CircleGeometry(0.0125, 28), E.mats.glass); objGlass.position.set(0, AX, 0.2168); objGlass.userData.real = 'glass'; opticG.add(objGlass);
  const reticleMat = E.glowMat();
  const reticle = new THREE.Mesh(new THREE.SphereGeometry(0.0011, 10, 8), reticleMat); reticle.position.set(0, AX, -0.0438); reticle.raycast = () => {}; opticG.add(reticle);
  const reticleGlow = E.glowPoints([V(0, AX, -0.0452)], 0.012); opticG.add(reticleGlow);
  for (const z of [0.0, 0.004, 0.008, 0.012, 0.016]) lines(opticG, Array.from({ length: 16 }, (_, i) => { const a = i / 16 * Math.PI * 2; return [V(Math.cos(a) * 0.0209, AX + Math.sin(a) * 0.0209, z), V(Math.cos(a) * 0.0209, AX + Math.sin(a) * 0.0209, z + 0.002)] as [THREE.Vector3, THREE.Vector3]; }));   // the power ring's knurling
  const OPTIC = { rear: V(0, AX, -0.0452), front: V(0, AX, 0.2172) };

  // ═════ Real view only: markings and textures the photographs show ═════
  {
    const decal = (parent: THREE.Object3D, w: number, h: number, at: THREE.Vector3, side: number, draw: (x: CanvasRenderingContext2D, W: number, H: number) => void, o: THREE.MeshStandardMaterialParameters = {}) => {
      const W = 1024, H = Math.round(W * h / w), tex = decalTexture(W, H, x => draw(x, W, H)), mat = decalMaterial(tex, { roughness: 0.6, metalness: 0.1, alphaTest: 0.35, ...o });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateY(side * Math.PI / 2).translate(at.x, at.y, at.z), mat);
      m.visible = false; m.raycast = () => {}; parent.add(m); realOnly.push(m); decalMats.push(mat);
    };
    const font = (x: CanvasRenderingContext2D, size: number, col: string, weight = 700) => { x.font = `${weight} ${size}px ui-monospace, Consolas, monospace`; x.fillStyle = col; x.textBaseline = 'middle'; x.textAlign = 'center'; };
    // selector markings round the left pivot: SAFE forward, SEMI up, AUTO back
    decal(pLower, 0.034, 0.03, V(0.01165, -0.025, 0.024), 1, (x, W, H) => {
      font(x, 92, '#e8e2d4'); const cx = W / 2, cy = H * 0.62;
      x.fillText('SAFE', cx - 330, cy); x.fillText('SEMI', cx, cy - 300); x.fillText('AUTO', cx + 330, cy);
      x.strokeStyle = '#e8e2d4'; x.lineWidth = 10; for (const a of [Math.PI, -Math.PI / 2, 0]) { x.beginPath(); x.moveTo(cx + Math.cos(a) * 130, cy + Math.sin(a) * 130); x.lineTo(cx + Math.cos(a) * 190, cy + Math.sin(a) * 190); x.stroke(); }
    });
    decal(pLower, 0.07, 0.016, V(-0.01665, -0.044, 0.198), -1, (x, W, H) => { font(x, 84, '#3a2f22'); x.fillText('M8 · CAL 6.8 X 51', W / 2, H * 0.32); font(x, 70, '#3a2f22'); x.fillText('20A0817', W / 2, H * 0.78); }, { roughness: 0.8 });
    decal(pUpper, 0.03, 0.006, V(-0.0161, 0.026, 0.02), -1, (x, W, H) => { font(x, 140, '#2c241b'); x.fillText('6.8 X 51', W / 2, H / 2); }, { roughness: 0.8 });
    // rail slot numbers along the left of the rail base
    decal(pUpper, 0.5, 0.0022, V(0.01065, 0.0365, 0.25), 1, (x, W) => { font(x, 30, '#e8e2d4'); for (let i = 0; i < 25; i++) x.fillText(String(i * 2 + 1), W * (0.98 - i / 25 * 0.98) - 6, 34); }, { alphaTest: 0.3 });
    // scope: magnification numbers round the power ring, a turret scale, the illumination dial
    decal(opticG, 0.02, 0.006, V(0.0212, AX + 0.004, 0.008), 1, (x, W, H) => { font(x, 110, '#d8d0c0'); ['1', '2', '3', '4', '6'].forEach((t, i) => x.fillText(t, W * (0.88 - i * 0.19), H / 2)); });
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.0112, 24).rotateX(-Math.PI / 2).translate(0, AX + 0.0311, 0.106), decalMaterial(decalTexture(256, 256, x => {
      x.strokeStyle = '#d8d0c0'; x.lineWidth = 5; for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2, r0 = i % 5 ? 108 : 92; x.beginPath(); x.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); x.lineTo(128 + Math.cos(a) * 122, 128 + Math.sin(a) * 122); x.stroke(); }
      x.fillStyle = '#d8d0c0'; x.font = '700 46px ui-monospace, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('UP', 128, 128);
    }), { alphaTest: 0.3 }));
    cap.visible = false; cap.raycast = () => {}; opticG.add(cap); realOnly.push(cap); decalMats.push(cap.material as THREE.Material);
    decal(suppG, 0.035, 0.007, V(0.02155, 0, 0.66), 1, (x, W, H) => { font(x, 120, '#3c2c1e'); x.fillText('6.8 MM', W / 2, H / 2); }, { roughness: 0.8, alphaTest: 0.25 });
    // grooves across the bolt catch and the selector paddle
    realAdd(catchG, merge([0, 1, 2].map(i => new THREE.BoxGeometry(0.0006, 0.0008, 0.002).translate(0.0137, -0.031 - i * 0.002, 0.139))), 'black');
  }

  // ═════ muzzle flash: accent glow, and in the Real view a fireball (a big one off the brake, a small one off the can) ═════
  const flashMat = E.glowMat();
  const flashMesh = new THREE.Mesh((() => { const g = new THREE.ConeGeometry(0.026, 0.07, 7, 1, true); g.rotateX(-Math.PI / 2); g.translate(0, 0, 0.035); return g; })(), flashMat);
  flashMesh.raycast = () => {}; flashMesh.visible = false; gun.add(flashMesh);
  const flashGlow = E.glowPoints([V(0, 0, 0)], 0.3); gun.add(flashGlow);
  const flashLight = new THREE.PointLight(E.accent.getHex(), 0, 1.6, 2); gun.add(flashLight); E.accentLights.push(flashLight);
  const fbBrake = makePlume(gun, V(0, 0, 0.593), V(0, 0, 1), 0.07, 0.07, 0.2, 5);
  const fbSupp = makePlume(gun, V(0, 0, 0.718), V(0, 0, 1), 0.025, 0.025, 0.05, 6, 'dry');
  let realOn = false;
  const muzzle = V(0, 0, 0.718);                            // where rounds and flame leave (the brake or the can)

  // ═════ cases and live rounds thrown from the ejection port ═════
  type Brass = { g: THREE.Group; line: THREE.Group; real: THREE.Group; v: THREE.Vector3; spin: THREE.Vector3; rest: boolean; bounced: boolean };
  const brass: Brass[] = [], CASE_R = 0.006;
  const caseReal = new THREE.LatheGeometry(caseLathe.map(([r, y]) => new THREE.Vector2(r, y)), 16), noseReal = new THREE.LatheGeometry(noseLathe.map(([r, y]) => new THREE.Vector2(r, y)), 16);
  const caseLine = new THREE.CylinderGeometry(CASE_R, CASE_R, 0.051, 10), noseLine = new THREE.ConeGeometry(0.0036, 0.023, 10).translate(0, 0.037, 0);
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
    g.position.copy(gun.localToWorld(V(-0.017, 0.006, 0.13 + carrierZ * 0.2)));
    g.rotation.set(0, 0, Math.PI / 2); g.quaternion.premultiply(gun.quaternion);
    const r = () => Math.random() - 0.5;
    const v = V(-1.6 + r() * 0.5, 0.75 + r() * 0.3, 0.35 + r() * 0.3).applyQuaternion(gun.quaternion);   // out to the right and a little forward
    brass.push({ g, line, real, v, spin: V(r() * 30, r() * 20, 22 + r() * 10), rest: false, bounced: false });
  }

  // ═════ magazines dropped in the hands: a copy falls to the floor (the last three stay) ═════
  type DropMag = { g: THREE.Group; v: THREE.Vector3; spin: number; rest: boolean };
  const mags: DropMag[] = [], MAG_C = V(0, -0.1, 0.197);
  function dropMag() {
    if (mags.length >= 3) mags.shift()!.g.removeFromParent();
    gun.updateMatrixWorld(true);
    const g = new THREE.Group(), copy = pMag.clone(true);
    copy.traverse(o => { if ((o as THREE.Points).isPoints || (o as { isLineSegments2?: boolean }).isLineSegments2 || o.userData.outline) o.visible = false; });
    copy.position.set(0, 0, 0).sub(MAG_C); copy.visible = true; g.add(copy);
    g.position.copy(gun.localToWorld(MAG_C.clone())); g.quaternion.copy(gun.quaternion); E.scene.add(g);
    mags.push({ g, v: V(0, -1.3, 0).applyQuaternion(gun.quaternion), spin: (Math.random() - 0.5) * 5, rest: false });
  }

  // ═════ sound: a supersonic crack and boom, or the suppressor's thump; the action's metal on metal ═════
  const sfx = {
    shot(supp: boolean) {
      if (supp) {
        snd.burst(0.11, 0.34, { type: 'lowpass', freq: 950, attack: 0.002 }); snd.burst(0.045, 0.16, { freq: 2600, q: 1.2 });
        snd.tone(78, 0.2, 0.22, { type: 'sine', to: 42 }); snd.tone(1480, 0.07, 0.03, { type: 'triangle', at: 0.004 });   // the can's ring
        snd.burst(0.02, 0.2, { freq: 4800, q: 0.8, at: 0.003 });                                                         // the bullet's crack
      } else {
        snd.burst(0.2, 0.85, { freq: 2100, q: 0.45, attack: 0.001 }); snd.burst(0.6, 0.55, { type: 'lowpass', freq: 240 });
        snd.tone(58, 0.42, 0.4, { type: 'triangle', to: 30 }); snd.burst(0.025, 0.45, { freq: 5200, q: 0.7 });
      }
      snd.click(0.03, 0.6); snd.tone(380, 0.04, supp ? 0.07 : 0.04, { type: 'square', at: 0.034 });   // the carrier slamming home
    },
    rackBack() { snd.burst(0.13, 0.1, { freq: 1700, q: 2.2 }); snd.click(0, 0.66); },
    home() { snd.click(0, 0.52); snd.thunk(0.005); snd.tone(820, 0.05, 0.06, { type: 'square' }); },
    magOut() { snd.click(0, 1.1); snd.burst(0.06, 0.08, { freq: 900, q: 1.5, at: 0.04 }); },
    magIn() { snd.click(0.2, 0.75); snd.thunk(0.21); snd.tone(1900, 0.03, 0.05, { type: 'square', at: 0.24 }); },
    selector() { snd.click(0, 1.25); snd.tone(3100, 0.02, 0.03, { type: 'square' }); },
    fold() { snd.click(0, 0.9); snd.tone(240, 0.08, 0.06, { type: 'triangle' }); },
    latch() { snd.click(0, 1.05); snd.thunk(0.01); },
    ratchet() { snd.tone(2700 + Math.random() * 300, 0.018, 0.035, { type: 'square' }); },
    mount() { snd.thunk(0); snd.click(0.04, 0.8); snd.click(0.12, 0.85); },
    flip() { snd.click(0, 1.4); },
  };

  // ═════ state ═════
  const st = {
    rounds: CAP, chamber: false, magIn: true, mode: 'safe' as Mode, locked: false,
    folded: false, optic: true, supp: true,
    magT: 0, foldT: 0, opticT: 1, suppT: 1, selT: 0, catchT: 0,
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

  const act = {
    fire() {
      if (busy()) return;
      st.trigAt = performance.now();
      if (st.mode === 'safe') { snd.click(0, 0.6); return say('safe · S selector'); }
      if (st.locked) return say('bolt locked back');
      if (!st.chamber) { snd.click(0, 0.7); return say('click · chamber empty'); }
      if (st.suppT > 0.01 && st.suppT < 0.99) return say('suppressor half on');
      st.cycle = { kind: 'shot', t0: performance.now() + trigDelay, back: false, lock: false };
      if (st.mode === 'auto' && !inHand) st.holdUntil = Math.max(st.holdUntil, performance.now() + 260);   // a clicked button: a short burst
    },
    rack() {
      if (busy()) return;
      st.cycle = { kind: st.locked ? 'release' : 'rack', t0: performance.now(), back: false, lock: false };
      sfx.rackBack();
    },
    release() {
      if (!st.locked) return say(st.magIn ? 'bolt already forward' : 'bolt forward');
      if (busy()) return;
      st.cycle = { kind: 'release', t0: performance.now(), back: false, lock: false };
    },
    magazine() {
      if (st.magT > 0 && st.magT < 1) return;
      st.magIn = !st.magIn;
      if (!st.magIn) { relAt = performance.now(); sfx.magOut(); if (inHand) dropMag(); }
      else { st.rounds = CAP; sfx.magIn(); }
    },
    selector() { st.mode = MODES[(MODES.indexOf(st.mode) + 1) % 3]; sfx.selector(); },
    stock() { if (st.foldT > 0 && st.foldT < 1) return; st.folded = !st.folded; sfx.fold(); },
    optic() { if (st.opticT > 0 && st.opticT < 1) return; st.optic = !st.optic; sfx.mount(); },
    suppressor() { if (st.suppT > 0 && st.suppT < 1) return; if (busy()) return; st.supp = !st.supp; snd.click(0, 0.9); },
    range() {},
    demo() {},
  } satisfies Record<string, () => void>;

  // ═════ the range: what the shooting lane needs from this rifle ═════
  const rangeGun: RangeGun = {
    name: 'M8', calibre: '6.8×51 mm', root: gun, kind: 'rifle',
    sight: IRON, muzzle, relief: 0.09,
    optic: () => st.optic && st.opticT > 0.99 ? { rear: OPTIC.rear, front: OPTIC.front, relief: 0.088, zoom: [1, 6] } : null,
    grip: { web: V(0, -0.044, 0.033), down: V(0, -0.911, -0.412), length: 0.082, depth: 0.047, half: 0.0145, trigger: V(0, -0.059, 0.104), thumbY: -0.021, frameHalf: 0.0118, fingers: 0.02 },
    fore: { at: V(0, HG.yc, 0.315), r: 0.03, dir: V(0, 0, 1) },
    hip: V(0.185, -0.118, -0.075),   // low and right, close in: the rifle runs out of the corner of the view
    recoil: { rise: 2.6 * DEG, push: 0.026, cam: 0.55 * DEG },
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
      if (on) { st.folded = false; st.foldT = 0; st.holdUntil = -1; st.held = false; st.mode = 'safe'; }
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
    const idle = () => !busy() && (st.magT === 0 || st.magT === 1) && (st.foldT === 0 || st.foldT === 1) && (st.suppT === 0 || st.suppT === 1) && (st.opticT === 0 || st.opticT === 1) && performance.now() > st.holdUntil;
    const setMode = (m: Mode) => { while (st.mode !== m) act.selector(); };
    const steps: [() => void, number][] = [
      [() => { if (st.folded) act.stock(); if (!st.supp) act.suppressor(); if (!st.optic) act.optic(); setMode('safe'); }, 500],
      [() => { if (st.magIn) act.magazine(); }, 700],
      [() => act.magazine(), 800],
      [() => act.rack(), 700],
      [() => setMode('semi'), 600],
      [() => act.fire(), 380], [() => act.fire(), 380], [() => act.fire(), 700],
      [() => setMode('auto'), 600],
      [() => { st.holdUntil = performance.now() + 520; act.fire(); }, 900],
      [() => setMode('safe'), 600],
      [() => act.stock(), 1100],
      [() => { act.stock(); script.end(); }, 0],
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
    const f0 = st.foldT; st.foldT = approach(st.foldT, st.folded ? 1 : 0, 2.4 * dt);
    if ((f0 < 1 && st.foldT === 1) || (f0 > 0 && st.foldT === 0)) sfx.latch();
    const o0 = st.opticT; st.opticT = approach(st.opticT, st.optic ? 1 : 0, 2.2 * dt);
    if ((o0 > 0.35) !== (st.opticT > 0.35)) sfx.flip();
    st.suppT = approach(st.suppT, st.supp ? 1 : 0, 0.9 * dt);
    const turnNow = Math.floor((1 - st.suppT) * 24); if (st.suppT > 0 && st.suppT < 1 && turnNow !== lastTurn) sfx.ratchet(); lastTurn = turnNow;
    st.selT = approach(st.selT, MODES.indexOf(st.mode), 9 * dt);
    st.catchT = approach(st.catchT, st.locked ? 1 : 0, 12 * dt);

    // automatic fire: keep cycling while the trigger is held
    if (!inHand && st.mode === 'auto' && (st.held || now < st.holdUntil) && !busy() && st.chamber && !st.locked) {
      st.cycle = { kind: 'shot', t0: now, back: false, lock: false };
    }

    // bolt carrier: recoil or a hand rack, then home (or locked back on an empty magazine)
    let z = st.locked ? -LOCK : 0;
    const c = st.cycle;
    if (c) {
      const t = (now - c.t0) / 1000;
      const [tb, tf] = c.kind === 'shot' ? [0.026, 0.05] : c.kind === 'rack' ? [0.17, 0.15] : [0.0, 0.07];
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
    chargeG.position.z = c && c.kind === 'rack' ? z * 1.1 : 0;               // the side handle only moves when worked by hand

    // controls
    const tt = st.trigAt < 0 ? 1 : (now - st.trigAt) / 1000, firing = st.shotAt > 0 && now - st.shotAt < 90;
    trig.set((tt < 0.05 ? tt / 0.05 : firing || (st.held && st.mode === 'auto') ? 1 : clamp01(1 - (tt - 0.08) / 0.12)) * 11 * DEG);
    selH.forEach(h => h.set(-st.selT * 90 * DEG));
    catchG.position.y = st.catchT * 0.0025; catchG.rotation.x = 0;
    rel.position.x = relAt < 0 ? 0 : 0.0012 * Math.max(0, 1 - (now - relAt) / 180);
    fold.set(-Math.PI * ease(st.foldT));
    // optic lifts off its rail; the iron sights stand up once it is clear
    const oe = ease(st.opticT);
    opticG.position.y = (1 - oe) * 0.09; opticG.visible = st.opticT > 0.01;
    const up = 1 - phase(st.opticT, 0.35, 1);
    rearLeaf.set((1 - up) * 90 * DEG); frontLeaf.set(-(1 - up) * 90 * DEG);
    reticleMat.emissiveIntensity = st.optic && st.opticT > 0.99 ? 1.6 : 0;
    reticleGlow.material.uniforms.intensity.value = st.optic && st.opticT > 0.99 ? 0.6 : 0;
    // suppressor: unscrews in turns, then slides off forward (and back on)
    const off = 1 - st.suppT;
    suppG.rotation.z = -phase(off, 0, 0.7) * Math.PI * 5;
    suppG.position.z = phase(off, 0, 0.7) * 0.012 + phase(off, 0.7, 1) * 0.11;
    suppG.visible = st.suppT > 0.02;
    muzzle.z = st.supp ? 0.718 : 0.593;
    // magazine: drops straight down onto the mat, loads back up and seats
    pMag.position.y = -MAG_DROP * st.magT * st.magT;
    pMag.visible = !inHand || st.magIn;
    topRound.visible = st.rounds > 0;

    // the flash: a long tongue of flame off the brake, hardly anything out of the can
    const fk = flashK(now), sup = suppressed();
    const fz = sup ? 0.718 : 0.593;
    flashMesh.position.z = fz; flashGlow.position.z = fz + 0.01; flashLight.position.set(0, 0.01, fz + 0.05);
    flashMesh.visible = !realOn && fk > 0.04; flashMat.emissiveIntensity = (sup ? 0.8 : 2.6) * fk; flashMesh.scale.setScalar((sup ? 0.35 : 0.8) + fk * (sup ? 0.2 : 0.7));
    flashGlow.material.uniforms.intensity.value = fk * (sup ? 0.35 : 1.5);
    flashLight.intensity = fk * flashGain * (sup ? 0.3 : 1.4);
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
        if (!b.bounced && b.v.y < -0.4) { b.bounced = true; b.v.set(b.v.x * 0.32, -b.v.y * 0.24, b.v.z * 0.32); b.spin.multiplyScalar(0.3); snd.tone(2500, 0.08, 0.03); snd.tone(3600, 0.06, 0.02); }
        else { b.rest = true; b.g.rotation.set(0, b.g.rotation.y, Math.PI / 2); snd.tone(2300, 0.05, 0.015); }
      }
    }
    for (const m of mags) {
      if (m.rest) continue;
      m.v.y -= 9.8 * dt; m.g.position.addScaledVector(m.v, dt); m.g.rotation.x += m.spin * dt;
      const gy = ground(m.g.position.x, m.g.position.z) + 0.016;
      if (m.g.position.y <= gy) { m.g.position.y = gy; m.rest = true; m.g.rotation.set(0, m.g.rotation.y, Math.PI / 2); snd.tone(700, 0.07, 0.05); snd.thunk(0); }
    }
  }

  function readout() {
    if (rng?.on) return 'range · lane 3';
    const p: string[] = [];
    p.push(st.magIn ? `${st.rounds} in magazine` : 'magazine out');
    p.push(st.chamber ? 'round chambered' : 'chamber empty');
    p.push(st.locked ? 'bolt locked back' : st.mode);
    if (st.supp) p.push('suppressed');
    if (st.folded) p.push('stock folded');
    p.push(st.optic ? 'optic' : 'iron sights');
    return p.join(' · ');
  }

  // realistic style: on a shooting bench under the sky
  const real: RealSpec = {
    focus: V(0, 0.15, 0.22), size: 1.1, hide: [bench.deck], bench: MAT,
    materials: { ...RM, body: RM.cerakote },
    lamps: [[reticleMat, 'red']],
    only: { line: [], real: realOnly },
    stage: () => rng?.stage() ?? null,
    onStyle(on) {
      realOn = on;
      if (on && !rng) openRange();                     // build the range now, so taking the line is instant
      if (!on) { wantRange = false; rng?.exit(); }
      for (const b of brass) { b.line.visible = !on; b.real.visible = on; }
      if (!on) { fbBrake.set(0, 0); fbSupp.set(0, 0); flashLight.color.copy(E.accent); }
    },
    tick(now) {
      const k = flashK(now), sup = suppressed();
      fbBrake.set(sup ? 0 : k, now); fbSupp.set(sup ? k * 0.5 : 0, now);
      flashLight.color.setHex(0xffa24a);
    },
  };

  if (arrive === 'range') setTimeout(() => act.range(), 0);   // changed to on the range: straight onto the line

  return {
    pickRoot: gun, parts: K.parts, real,
    view: { target: V(0, 0.2, 0.2), dist: 1.9, min: 0.35, max: 6 },
    actions: act, passive: [],
    keyDown(k, e) {
      if (rng?.on) return rng.keyDown(k, e);
      if (k === 'f') { if (!e.repeat) { st.held = true; act.fire(); } return true; }
      return false;
    },
    keyUp(k) { if (rng?.on) rng.keyUp(k); if (k === 'f') st.held = false; },
    blur() { rng?.blur(); st.held = false; },
    hud: () => rng?.hud() ?? null,
    on: () => ({ range: !!rng?.on, demo: script.active, fire: !!st.cycle && st.cycle.kind === 'shot', rack: st.locked, magazine: st.magIn, selector: st.mode !== 'safe', stock: st.folded, optic: st.optic, suppressor: st.supp }),
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
