// Pop-up targets: a cardboard silhouette on two laths, hinged on a lifter behind an angled steel guard. Down, it lies
// flat behind the guard (low enough that the guard hides it from the line); up, it stands facing the shooter.
// Hostiles are tan with perforated scoring zones (A 5, C 3, D 1, the scheme practical-shooting targets use); a
// no-shoot is white with open hands (−10 when hit). Each face is a canvas: hits punch holes into it and a new
// exposure gets a fresh face. One hit knocks a target down, as on a qualification range.
import * as THREE from 'three';
import type { RangeLayout } from './chamber';
import type { ShotZone } from './hud';

const W = 0.46, H = 0.76;                     // face, metres
const PX = 900;                               // canvas pixels per metre
const HINGE_Y = 0.12, HINGE_Z = 0.42, LATH = 0.75, GUARD_H = 0.55;
/** the silhouette, x across, y up from the bottom of the face */
const OUTLINE: [number, number][] = [
  [-0.13, 0], [0.13, 0], [0.23, 0.1], [0.23, 0.47], [0.15, 0.575], [0.045, 0.575], [0.045, 0.6], [0.075, 0.6], [0.075, 0.74], [0.06, 0.76],
  [-0.06, 0.76], [-0.075, 0.74], [-0.075, 0.6], [-0.045, 0.6], [-0.045, 0.575], [-0.15, 0.575], [-0.23, 0.47], [-0.23, 0.1],
];
/** distance (m from the line) and offset across the hall from the lane's centre */
const STATIONS: [number, number][] = [[5, -2.1], [5, 1.9], [7, 0.2], [10, -3.3], [10, 1.3], [12, -1.0], [15, 3.2], [15, -2.5], [20, 0.5], [25, -1.7], [25, 2.5]];

export function zoneAt(x: number, y: number): ShotZone {
  const ax = Math.abs(x);
  if (y >= 0.6) return ax < 0.05 && y > 0.64 && y < 0.73 ? 'A' : 'C';
  if (ax < 0.075 && y > 0.27 && y < 0.55) return 'A';
  if (ax < 0.14 && y > 0.1 && y < 0.565) return 'C';
  return 'D';
}
export const POINTS: Record<ShotZone, number> = { A: 5, C: 3, D: 1, M: 0, NS: -10, S: 0 };

const easeOutBack = (t: number) => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };

function outlinePath(x: CanvasRenderingContext2D, px: (u: number) => number, py: (v: number) => number) {
  x.beginPath(); OUTLINE.forEach(([u, v], i) => i ? x.lineTo(px(u), py(v)) : x.moveTo(px(u), py(v))); x.closePath();
}
/** the clean face of a hostile or a no-shoot, drawn once and copied onto each target's canvas */
function faceArt(kind: 'hostile' | 'ns') {
  const cw = Math.round(W * PX), ch = Math.round(H * PX), c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const x = c.getContext('2d')!, px = (u: number) => (u + W / 2) * PX, py = (v: number) => (H - v) * PX;
  let s = kind === 'ns' ? 5 : 3; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  x.fillStyle = kind === 'ns' ? '#e9e7e0' : '#b8946a'; x.fillRect(0, 0, cw, ch);
  for (let i = 0; i < 9000; i++) {                                    // board fibre
    const v = rnd(); x.fillStyle = kind === 'ns' ? `rgba(150,150,140,${v * 0.12})` : `rgba(${v < 0.5 ? '90,64,38' : '220,190,150'},${0.1 + v * 0.1})`;
    x.fillRect(rnd() * cw, rnd() * ch, 1 + rnd() * 3, 1);
  }
  if (kind === 'hostile') {                                           // perforated zone lines and their letters
    x.strokeStyle = 'rgba(80,56,32,0.75)'; x.lineWidth = 3; x.setLineDash([9, 7]);
    x.strokeRect(px(-0.075), py(0.55), 0.15 * PX, 0.28 * PX);
    x.strokeRect(px(-0.05), py(0.73), 0.1 * PX, 0.09 * PX);
    x.strokeRect(px(-0.14), py(0.565), 0.28 * PX, 0.465 * PX);
    x.setLineDash([]); x.fillStyle = 'rgba(80,56,32,0.8)'; x.font = '700 22px "Arial Narrow", Arial, sans-serif'; x.textAlign = 'center';
    x.fillText('A', px(0), py(0.53)); x.fillText('C', px(0), py(0.13)); x.fillText('D', px(0.185), py(0.3)); x.fillText('D', px(-0.185), py(0.3));
  } else {                                                            // open hands: the universal no-shoot
    x.strokeStyle = '#151515'; x.lineWidth = 9; x.lineJoin = 'round'; x.lineCap = 'round';
    for (const k of [-1, 1]) {
      const cx = px(k * 0.1), cy = py(0.34), sc = PX / 1000;
      x.beginPath(); x.roundRect(cx - 34 * sc, cy - 10 * sc, 68 * sc, 82 * sc, 18 * sc); x.stroke();
      for (let f = 0; f < 4; f++) { const fx = cx - 27 * sc + f * 18 * sc; x.beginPath(); x.moveTo(fx, cy - 10 * sc); x.lineTo(fx, cy - (52 + (f === 1 || f === 2 ? 14 : 0)) * sc); x.stroke(); }
      x.beginPath(); x.moveTo(cx - k * 34 * sc, cy + 22 * sc); x.lineTo(cx - k * 62 * sc, cy - 6 * sc); x.stroke();
    }
    x.fillStyle = '#151515'; x.font = '800 30px "Arial Narrow", Impact, sans-serif'; x.textAlign = 'center'; x.fillText('NO SHOOT', px(0), py(0.1));
  }
  x.strokeStyle = kind === 'ns' ? 'rgba(60,60,60,0.6)' : 'rgba(70,48,28,0.8)'; x.lineWidth = 5; outlinePath(x, px, py); x.stroke();
  return c;
}

type State = 'down' | 'rising' | 'up' | 'falling';
export interface Target {
  i: number; dist: number; x: number; z: number;
  kind: 'hostile' | 'ns';
  state: State; t0: number; upAt: number; until: number; hits: number;
  hinge: THREE.Group; face: THREE.Mesh; tex: THREE.CanvasTexture; ctx: CanvasRenderingContext2D;
}

export function createTargets(L: RangeLayout, shieldMat: THREE.Material) {
  const group = new THREE.Group();
  const art = { hostile: faceArt('hostile'), ns: faceArt('ns') };
  const shape = new THREE.Shape(OUTLINE.map(([u, v]) => new THREE.Vector2(u, v)));
  const frontGeo = new THREE.ShapeGeometry(shape);
  { const p = frontGeo.attributes.position, uv = frontGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + W / 2) / W, p.getY(i) / H); }
  frontGeo.rotateY(Math.PI).translate(0, LATH, -0.002);             // faces −z, toward the line
  const backGeo = new THREE.ShapeGeometry(shape).translate(0, LATH, 0.002);
  const board = new THREE.MeshStandardMaterial({ color: 0x8c6c48, roughness: 0.95 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 0.9 });
  const mech = new THREE.MeshStandardMaterial({ color: 0x2a2d30, metalness: 0.5, roughness: 0.6 });
  const mats: THREE.Material[] = [board, wood, mech];
  mats.forEach(m => { m.userData.realStyle = true; });
  const lathGeo = new THREE.BoxGeometry(0.025, LATH + 0.1, 0.02).translate(0, (LATH + 0.1) / 2, 0.012);
  // the guard: a steel wedge whose face leans back toward the target
  const guardGeo = (() => {
    const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.34, 0), new THREE.Vector2(0.34, GUARD_H), new THREE.Vector2(0.2, GUARD_H)]);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.8, bevelEnabled: false }); g.rotateY(-Math.PI / 2).translate(0.4, 0, 0);
    // UVs in metres for the painted steel
    const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) + p.getZ(i), p.getY(i));
    return g;
  })();
  const mechGeo = new THREE.BoxGeometry(0.34, HINGE_Y, 0.3).translate(0, HINGE_Y / 2, HINGE_Z + 0.05);

  const list: Target[] = STATIONS.map(([dist, dx], i) => {
    const st = new THREE.Group(); st.position.set(L.lane + dx, L.floor, L.line + dist); group.add(st);
    const guard = new THREE.Mesh(guardGeo, shieldMat); guard.castShadow = guard.receiveShadow = true; guard.userData.surface = 'steel'; st.add(guard);
    const box = new THREE.Mesh(mechGeo, mech); box.castShadow = box.receiveShadow = true; box.userData.surface = 'steel'; st.add(box);
    const hinge = new THREE.Group(); hinge.position.set(0, HINGE_Y, HINGE_Z); hinge.rotation.x = Math.PI / 2; st.add(hinge);
    for (const x of [-0.12, 0.12]) { const l = new THREE.Mesh(lathGeo, wood); l.position.x = x; l.castShadow = true; l.userData.surface = 'wood'; hinge.add(l); }
    const c = document.createElement('canvas'); c.width = art.hostile.width; c.height = art.hostile.height;
    const ctx = c.getContext('2d')!; ctx.drawImage(art.hostile, 0, 0);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const fm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }); fm.userData.realStyle = true; mats.push(fm);
    const face = new THREE.Mesh(frontGeo, fm); face.castShadow = face.receiveShadow = true; hinge.add(face);
    const back = new THREE.Mesh(backGeo, board); back.castShadow = true; back.raycast = () => {}; hinge.add(back);
    const t: Target = { i, dist, x: st.position.x, z: st.position.z, kind: 'hostile', state: 'down', t0: 0, upAt: 0, until: 0, hits: 0, hinge, face, tex, ctx };
    face.userData.target = t;
    return t;
  });

  /** stand a target up with a fresh face; it stays until `until` (seconds, Infinity for free practice) */
  function pop(t: Target, kind: 'hostile' | 'ns', now: number, until: number) {
    t.kind = kind; t.state = 'rising'; t.t0 = now; t.upAt = now + 0.32; t.until = until; t.hits = 0;
    t.ctx.drawImage(art[kind], 0, 0); t.tex.needsUpdate = true;
  }
  function drop(t: Target, now: number) { if (t.state === 'down' || t.state === 'falling') return; t.state = 'falling'; t.t0 = now; }
  /** where on the face a world point is, and the zone and the hole it leaves */
  const local = new THREE.Vector3();
  function hit(t: Target, point: THREE.Vector3): ShotZone {
    t.face.worldToLocal(local.copy(point));
    const x = -local.x, y = local.y - LATH;                           // face coordinates (the geometry is turned to face the line)
    const c = t.ctx, cx = (x + W / 2) * PX, cy = (H - y) * PX;
    c.fillStyle = 'rgba(235,225,205,0.55)'; c.beginPath(); c.arc(cx, cy, 6.5, 0, Math.PI * 2); c.fill();   // torn fibre round the hole
    c.fillStyle = '#0d0b09'; c.beginPath(); c.arc(cx, cy, 4.2, 0, Math.PI * 2); c.fill();
    t.tex.needsUpdate = true; t.hits++;
    return t.kind === 'ns' ? 'NS' : zoneAt(x, y);
  }

  function tick(now: number) {
    for (const t of list) {
      let a = Math.PI / 2;
      if (t.state === 'rising') {
        const k = (now - t.t0) / 0.32;
        if (k >= 1) { t.state = 'up'; a = 0; } else a = Math.PI / 2 * (1 - easeOutBack(Math.max(0, k)));
      } else if (t.state === 'up') {
        const w = now - t.upAt; a = w < 0.6 ? Math.sin(w * 28) * 0.05 * Math.exp(-w * 7) : 0;   // settles on its stop
      } else if (t.state === 'falling') {
        const k = (now - t.t0) / 0.26;
        if (k >= 1) { t.state = 'down'; } else a = Math.PI / 2 * k * k;
      }
      t.hinge.rotation.x = a;
    }
  }
  /** a target that can be struck: standing, or nearly */
  const exposed = (t: Target) => t.state === 'up' || (t.state === 'rising' && t.hinge.rotation.x < 0.5);

  return {
    group, list, pop, drop, hit, tick, exposed,
    /** everything a bullet can strike on the target line (faces, laths, guards, lifters) */
    colliders: (() => { const c: THREE.Object3D[] = []; group.traverse(o => { if ((o as THREE.Mesh).isMesh && (o.userData.surface || o.userData.target)) c.push(o); }); return c; })(),
    reset() { list.forEach(t => { t.state = 'down'; t.hinge.rotation.x = Math.PI / 2; }); },
    dispose() {
      [frontGeo, backGeo, lathGeo, guardGeo, mechGeo].forEach(g => g.dispose());
      list.forEach(t => t.tex.dispose()); mats.forEach(m => m.dispose());
    },
  };
}
export type Targets = ReturnType<typeof createTargets>;
