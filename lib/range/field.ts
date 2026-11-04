// The long-distance range outdoors (Real view only), for precision rifles: a covered firing line on a concrete pad with
// five benches (the weapon's own in the middle one), a mown lane running out over gently rolling grass that rises
// toward a backstop hill beyond 1000 m, tree lines down both sides, distance boards every 100 m, wind flags at 150, 450
// and 750 m, and a line of hanging steel plates from 100 to 1000 m, each in front of its own earth berm with its distance
// on a board beside it. A plate swings and rings when it is struck and keeps the grey lead splash on its white paint;
// the plate the spotter calls carries a lit orange marker above its frame.
// The terrain is a height function sampled on a grid that is fine near the line and coarse far away; bullets meet the
// ground through `groundY` (the same grid, interpolated), not by raycasting its hundred thousand triangles. Static
// pieces are merged by material and the trees are two instanced draws, so the whole field is about thirty draws.
// The sky, the sun and the haze come from the stage (StageOverride.time); like the hall, nothing here is a light.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { decalMaterial, decalTexture } from '../real/decals';
import { share } from '../real/textures';
import type { RangeLayout, Surface } from './chamber';
import type { ShotZone } from './hud';
import type { Target } from './targets';

/** the steel line: distance from the line and offset across from the lane's centre (spread so that no plate stands in
 *  line behind a nearer plate or its berm) */
export const STEEL: readonly [number, number][] = [[100, -4], [200, 6], [300, -9], [400, 11], [500, -14], [600, 16], [700, -7], [800, 19], [900, -21], [1000, 4]];
const FLAGS = [150, 450, 750];

type Rng = () => number;
const rng = (seed: number): Rng => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const canvas = (w: number, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return { c, x: c.getContext('2d', { willReadFrequently: true })! }; };
const tex = (c: HTMLCanvasElement, srgb = true, rep = true) => {
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};
const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
  new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

/** grass (blades over a mown base, greyish so the terrain's vertex colours give the hue), concrete, the shelter's
 *  corrugated roof: drawn once for the session */
let fieldTex: ReturnType<typeof drawFieldTextures> | null = null;
function drawFieldTextures() {
  const r = rng(53);
  const grass = (() => {
    const N = 512, { c, x } = canvas(N);
    x.fillStyle = '#b4b6a8'; x.fillRect(0, 0, N, N);
    for (let i = 0; i < 26000; i++) {
      const v = r(), px = r() * N, py = r() * N, l = 3 + r() * 9, a = (r() - 0.5) * 0.9;
      x.strokeStyle = v < 0.5 ? `rgba(70,74,52,${0.25 + r() * 0.3})` : `rgba(226,230,206,${0.2 + r() * 0.25})`; x.lineWidth = 1 + r();
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.sin(a) * l, py - Math.cos(a) * l); x.stroke();
    }
    return tex(c);
  })();
  const concrete = (() => {
    const N = 512, { c, x } = canvas(N);
    x.fillStyle = '#9d9b95'; x.fillRect(0, 0, N, N);
    for (let i = 0; i < 30000; i++) { const v = 120 + r() * 70; x.fillStyle = `rgba(${v},${v - 2},${v - 6},0.35)`; x.fillRect(r() * N, r() * N, 2, 2); }
    x.strokeStyle = 'rgba(60,58,54,0.55)'; x.lineWidth = 3; x.strokeRect(0, 0, N, N);       // expansion joints, every 4 m
    return tex(c);
  })();
  const roof = (() => {
    const N = 256, { c, x } = canvas(N);
    for (let i = 0; i < N; i++) { const v = 150 + 60 * Math.sin(i / N * Math.PI * 2 * 8); x.fillStyle = `rgb(${v},${v + 2},${v + 4})`; x.fillRect(i, 0, 1, N); }
    return tex(c, false);
  })();
  return share({ grass, concrete, roof });
}

/** a distance board's face: black numbers on white, a black border */
function boardTexture(text: string) {
  return decalTexture(256, 128, x => {
    x.fillStyle = '#f2f1ea'; x.fillRect(0, 0, 256, 128); x.strokeStyle = '#151515'; x.lineWidth = 8; x.strokeRect(4, 4, 248, 120);
    x.fillStyle = '#151515'; x.font = '800 92px "Arial Narrow", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 70);
  });
}

export function buildField(L: RangeLayout) {
  const r = rng(71), group = new THREE.Group(); group.visible = false;
  const { floor: F, line, lane } = L;
  const textures: THREE.Texture[] = [], mats: THREE.Material[] = [];
  const std = (o: THREE.MeshStandardMaterialParameters) => { const m = new THREE.MeshStandardMaterial(o); m.userData.realStyle = true; mats.push(m); return m; };
  const TX = fieldTex ??= drawFieldTextures();

  // ── the ground: a height function (metres above the pad), sampled on a graded grid ──
  const berms = STEEL.map(([d, o]) => ({ x: lane + o, z: line + d + 5, h: 1.7 + d * 0.0013, rx: 4.6 + d * 0.004, rz: 2.8 }));
  const height = (x: number, z: number) => {
    const dz = z - line, dx = x - lane, ax = Math.abs(dx);
    let h = sstep(15, 1100, dz) * 13;                                                // the lane rises gently toward the far steel
    h += 0.45 * Math.sin(x * 0.045 + dz * 0.011) * Math.sin(dz * 0.019 + 0.7) * sstep(8, 60, dz);
    h += sstep(70, 320, ax) * (17 + 9 * Math.sin(dz * 0.0045 + dx * 0.002 + 1));     // hills on both sides
    h += sstep(1040, 1190, dz) * 44 * (1 - 0.35 * sstep(150, 420, ax));                 // the backstop hill
    h += sstep(-12, -90, dz) * 7;                                                     // rising ground behind the line
    for (const b of berms) { const u = (x - b.x) / b.rx, v = (z - b.z) / b.rz, q = u * u + v * v; if (q < 9) h += b.h * Math.exp(-q); }
    // the pad and the ground round it are flat
    return h * Math.max(sstep(1.5, 10, dz), sstep(-11, -20, dz), sstep(17, 26, ax));
  };
  const xs: number[] = [], zs: number[] = [];
  for (let x = 0; x <= 760; x += 0.6 + x * 0.06) { xs.push(lane + x); if (x) xs.unshift(lane - x); }
  const zset = new Set<number>();
  for (let d = -260; d <= 1500; d += 0.6 + Math.abs(d) * 0.02) zset.add(Math.round((line + d) * 100) / 100);
  for (const b of berms) for (let k = -14; k <= 22; k += 1.6) zset.add(Math.round((b.z + k) * 100) / 100);   // the berms, finely
  zs.push(...[...zset].sort((a, b) => a - b));
  const NX = xs.length, NZ = zs.length, H = new Float32Array(NX * NZ);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) H[j * NX + i] = height(xs[i], zs[j]);
  const find = (a: number[], v: number) => { let lo = 0, hi = a.length - 2; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m] <= v) lo = m; else hi = m - 1; } return Math.max(0, Math.min(a.length - 2, lo)); };
  /** the ground's height under (x, z), as the terrain mesh has it */
  const groundY = (x: number, z: number) => {
    const i = find(xs, x), j = find(zs, z), u = THREE.MathUtils.clamp((x - xs[i]) / (xs[i + 1] - xs[i]), 0, 1), v = THREE.MathUtils.clamp((z - zs[j]) / (zs[j + 1] - zs[j]), 0, 1);
    const h = (ii: number, jj: number) => H[jj * NX + ii];
    return F + (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
  };
  {
    const pos = new Float32Array(NX * NZ * 3), col = new Float32Array(NX * NZ * 3), uv = new Float32Array(NX * NZ * 2);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i, x = xs[i], z = zs[j], dz = z - line, ax = Math.abs(x - lane);
      pos.set([x, F + H[k], z], k * 3); uv.set([x / 3, z / 3], k * 2);
      // grass that varies in patches, the mown lane lighter, earth on the berms and the backstop's face, drier far hills
      const n = 0.5 + 0.5 * Math.sin(x * 0.11 + Math.sin(z * 0.05) * 3) * Math.sin(z * 0.083 + x * 0.02);
      let cr = 0.3 + n * 0.07, cg = 0.36 + n * 0.08, cb = 0.17 + n * 0.03;
      const mown = (1 - sstep(24, 34, ax)) * sstep(2, 6, dz) * (1 - sstep(1050, 1080, dz));
      cr += mown * 0.06; cg += mown * 0.07; cb += mown * 0.03;
      let earth = 0;
      for (const b of berms) { const u = (x - b.x) / b.rx, v = (z - b.z) / b.rz; earth = Math.max(earth, Math.exp(-(u * u + v * v) * 0.9)); }
      earth = Math.max(earth * 0.9, sstep(1050, 1090, dz) * (1 - sstep(1110, 1150, dz)) * (1 - sstep(60, 140, ax)) * 0.85);
      cr += (0.44 - cr) * earth; cg += (0.35 - cg) * earth; cb += (0.24 - cb) * earth;
      const dry = sstep(120, 400, ax) * 0.5; cr += (0.42 - cr) * dry; cg += (0.4 - cg) * dry; cb += (0.24 - cb) * dry;
      col.set([cr, cg, cb], k * 3);
    }
    const idx: number[] = [];
    for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) { const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const ground = new THREE.Mesh(g, std({ map: TX.grass, vertexColors: true, roughness: 1 }));
    ground.receiveShadow = true; ground.raycast = () => {}; group.add(ground);
  }

  const M = {
    concrete: std({ map: TX.concrete, roughness: 0.94 }),
    steel: std({ color: 0x4b4e50, metalness: 0.6, roughness: 0.55 }),
    roof: std({ color: 0x8e9498, metalness: 0.7, roughness: 0.45, bumpMap: TX.roof, bumpScale: 3 }),
    beam: std({ color: 0x5c6165, metalness: 0.5, roughness: 0.55 }),
    wood: std({ color: 0x8f7556, roughness: 0.85 }),
    post: std({ color: 0x6e5b44, roughness: 0.9 }),
    frame: std({ color: 0x2c2e30, metalness: 0.55, roughness: 0.6 }),
    pole: std({ color: 0xc8cbcc, metalness: 0.8, roughness: 0.35 }),
    yellow: std({ color: 0xd9a21b, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  };
  const SURF = new Map<THREE.Material, Surface>([[M.concrete, 'concrete'], [M.steel, 'steel'], [M.roof, 'steel'], [M.beam, 'steel'], [M.wood, 'wood'], [M.post, 'wood'], [M.frame, 'steel'], [M.pole, 'steel'], [M.yellow, 'concrete']]);
  const lamp = (color: number) => std({ color: 0x111111, emissive: color, emissiveIntensity: 0, roughness: 0.4 });
  const lamps = { house: lamp(0xf4f1ea), flood: lamp(0xfff2dc), hot: lamp(0xff2a1a), cold: lamp(0x2bff6a), exit: lamp(0x2bff6a) };
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => { (bins.get(m) ?? bins.set(m, []).get(m)!).push(g); };

  // ── the firing line: a concrete pad, five benches under a sloping steel roof, the yellow line in front ──
  const X0 = lane - 15, X1 = lane + 15, PZ0 = line - 9, PZ1 = line + 1.4;
  { const g = box(X0, X1, F - 0.25, F + 0.015, PZ0, PZ1), p = g.attributes.position, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) u.setXY(i, p.getX(i) / 4, p.getZ(i) / 4);
    put(M.concrete, g); }
  put(M.yellow, new THREE.PlaneGeometry(X1 - X0, 0.1).rotateX(-Math.PI / 2).translate(lane, F + 0.017, line + 0.3));
  const RZ0 = line - 8.6, RZ1 = line + 1.7, yb = F + 3.15, yf = F + 2.8, slope = Math.atan2(yb - yf, RZ1 - RZ0);
  { const g = new THREE.BoxGeometry(X1 - X0 + 0.6, 0.035, Math.hypot(RZ1 - RZ0, yb - yf)), u = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < p.count; i++) u.setXY(i, p.getX(i) / 2, p.getZ(i) / 2);
    g.rotateX(slope).translate(lane, (yb + yf) / 2 + 0.02, (RZ0 + RZ1) / 2); put(M.roof, g); }
  for (const [z, y] of [[RZ0 + 0.3, yb - 0.02], [line - 3.6, (yb + yf) / 2], [RZ1 - 0.35, yf + 0.02]] as const) put(M.beam, box(X0, X1, y - 0.22, y, z - 0.08, z + 0.08));
  for (const x of [X0 + 0.2, lane - 9, lane - 3.1, lane + 3.1, lane + 9, X1 - 0.2]) for (const [z, y] of [[RZ0 + 0.3, yb], [RZ1 - 0.35, yf]] as const) put(M.steel, box(x - 0.06, x + 0.06, F, y, z - 0.06, z + 0.06));
  const lightGeo: THREE.BufferGeometry[] = [];
  for (const z of [line - 6, line - 2.4]) { const y = THREE.MathUtils.lerp(yb, yf, (z - RZ0) / (RZ1 - RZ0)) - 0.06; put(M.beam, box(X0 + 1, X1 - 1, y - 0.05, y, z - 0.1, z + 0.1)); lightGeo.push(box(X0 + 1.1, X1 - 1.1, y - 0.065, y - 0.05, z - 0.07, z + 0.07)); }
  const bw = L.bench.x1 - L.bench.x0;
  for (let i = 1; i <= L.lanes; i++) {
    if (i === L.mine) continue;
    const x = lane + (i - L.mine) * L.laneW;
    put(M.wood, box(x - bw / 2, x + bw / 2, -0.05, 0, L.bench.z0, line));
    for (const sx of [-1, 1]) for (const z of [L.bench.z0 + 0.08, line - 0.08]) put(M.wood, box(x + sx * (bw / 2 - 0.08) - 0.04, x + sx * (bw / 2 - 0.08) + 0.04, F, -0.05, z - 0.04, z + 0.04));
    put(M.wood, box(x - 0.25, x + 0.25, F + 0.42, F + 0.47, L.bench.z0 - 0.75, L.bench.z0 - 0.35));             // the stool behind it
    put(M.wood, box(x - 0.05, x + 0.05, F, F + 0.42, L.bench.z0 - 0.6, L.bench.z0 - 0.5));
  }
  put(M.wood, box(lane - 0.25, lane + 0.25, F + 0.42, F + 0.47, L.bench.z0 - 0.75, L.bench.z0 - 0.35));
  put(M.wood, box(lane - 0.05, lane + 0.05, F, F + 0.42, L.bench.z0 - 0.6, L.bench.z0 - 0.5));
  // the range-hot flag pole beside the line, and the status lights on the front beam
  const poleX = X1 + 2, poleZ = line + 2.5;
  put(M.pole, new THREE.CylinderGeometry(0.045, 0.06, 7.5, 10).translate(poleX, F + 3.75, poleZ));
  const status = new THREE.Group(); group.add(status);
  for (const [m, y] of [[lamps.hot, 0.12], [lamps.cold, 0]] as const) {                  // on the right-hand front post
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 16).rotateX(Math.PI / 2).translate(lane + 9, F + 2.1 + y, RZ1 - 0.42), m); s.raycast = () => {}; status.add(s);
  }

  // ── distance boards down the left of the lane, every 100 m ──
  const boardTex = new Map<number, THREE.Texture>(), boardMats = new Map<number, THREE.Material>();
  const boardMat = (d: number) => {
    if (!boardMats.has(d)) { const t = boardTexture(String(d)); textures.push(t); boardTex.set(d, t); const m = decalMaterial(t, { roughness: 0.7, alphaTest: 0, polygonOffsetFactor: -4, polygonOffsetUnits: -16 }); m.side = THREE.FrontSide; mats.push(m); boardMats.set(d, m); }
    return boardMats.get(d)!;
  };
  const board = (d: number, x: number, z: number, hgt: number, lift: number) => {
    const w = hgt * 2, y0 = groundY(x, z) + lift;
    for (const sx of [-1, 1]) put(M.post, box(x + sx * w * 0.38 - 0.05, x + sx * w * 0.38 + 0.05, y0 - lift - 0.3, y0 + hgt * 0.5, z + 0.03, z + 0.12));
    put(M.wood, box(x - w / 2, x + w / 2, y0 - hgt / 2, y0 + hgt / 2, z, z + 0.03));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.96, hgt * 0.94).rotateY(Math.PI).translate(x, y0, z - 0.01), boardMat(d));
    face.raycast = () => {}; group.add(face);
  };
  for (let d = 100; d <= 1000; d += 100) board(d, lane - 26 - d * 0.012, line + d, 0.7 + d * 0.0011, 1.1);

  // ── wind flags: a pole and a red-and-yellow flag that streams with the wind ──
  const flagTex = (() => { const { c, x } = canvas(128, 64); x.fillStyle = '#d0281c'; x.fillRect(0, 0, 128, 64); x.fillStyle = '#f2c018'; x.beginPath(); x.moveTo(0, 64); x.lineTo(128, 0); x.lineTo(128, 64); x.fill(); return tex(c, true, false); })();
  textures.push(flagTex);
  const flagMat = std({ map: flagTex, roughness: 0.85, side: THREE.DoubleSide });
  const flags: { g: THREE.Group; geo: THREE.BufferGeometry; base: Float32Array; len: number; ph: number }[] = [];
  const flag = (x: number, z: number, hgt: number, len: number, wd: number, m: THREE.Material) => {
    const y = groundY(x, z);
    put(M.pole, new THREE.CylinderGeometry(0.035, 0.05, hgt, 8).translate(x, y + hgt / 2, z));
    const geo = new THREE.PlaneGeometry(len, wd, 12, 4).translate(len / 2, -wd / 2, 0);
    const g = new THREE.Group(); g.position.set(x, y + hgt - 0.05, z); group.add(g);
    const mesh = new THREE.Mesh(geo, m); mesh.castShadow = false; mesh.raycast = () => {}; g.add(mesh);
    flags.push({ g, geo, base: (geo.attributes.position.array as Float32Array).slice(), len, ph: r() * 10 });
  };
  for (const d of FLAGS) flag(lane - 18 - d * 0.01, line + d, 6, 1.5 + d * 0.002, 0.9 + d * 0.0012, flagMat);
  const hotMat = std({ color: 0xc81e14, roughness: 0.85, side: THREE.DoubleSide });
  flag(poleX, poleZ, 7.5, 1.2, 0.8, hotMat);

  // ── trees: two tree lines and the woods behind the backstop hill (instanced trunks and crowns) ──
  {
    const spots: [number, number, number][] = [];
    while (spots.length < 460) {
      const side = r() < 0.5 ? -1 : 1, x = lane + side * (46 + r() ** 1.6 * 300), z = line - 70 + r() * 1480;
      const dz = z - line;
      if (dz > 1030 && dz < 1150 && Math.abs(x - lane) < 160) continue;          // the backstop's face stays bare
      spots.push([x, z, 5 + r() * 7]);
    }
    for (let i = 0; i < 80; i++) spots.push([lane + (r() - 0.5) * 520, line + 1160 + r() * 260, 6 + r() * 6]);
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1, 6).translate(0, 0.5, 0), crownGeo = new THREE.IcosahedronGeometry(1, 1);
    const trunks = new THREE.InstancedMesh(trunkGeo, std({ color: 0x4a3a2a, roughness: 0.95 }), spots.length);
    const crowns = new THREE.InstancedMesh(crownGeo, std({ color: 0xffffff, roughness: 0.9 }), spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    spots.forEach(([x, z, h], i) => {
      const y = groundY(x, z) - 0.2;
      m.compose(p.set(x, y, z), q.identity(), s.set(1 + h * 0.04, h * 0.55, 1 + h * 0.04)); trunks.setMatrixAt(i, m);
      const w = h * (0.32 + r() * 0.14);
      m.compose(p.set(x, y + h * 0.62, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6), s.set(w, h * 0.46, w * (0.85 + r() * 0.3))); crowns.setMatrixAt(i, m);
      crowns.setColorAt(i, c.setRGB(0.14 + r() * 0.08, 0.22 + r() * 0.1, 0.09 + r() * 0.05));
    });
    for (const t of [trunks, crowns]) { t.raycast = () => {}; t.receiveShadow = true; group.add(t); }
  }

  // ── merge by material ──
  const colliders: THREE.Mesh[] = [];
  for (const [m, geos] of bins) {
    const g = mergeGeometries(geos); geos.forEach(x => x.dispose());
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = m !== M.yellow; mesh.receiveShadow = true;
    mesh.userData.surface = SURF.get(m); group.add(mesh); colliders.push(mesh);
  }
  { const mesh = new THREE.Mesh(mergeGeometries(lightGeo), lamps.house); lightGeo.forEach(x => x.dispose()); mesh.raycast = () => {}; group.add(mesh); }

  /** the flags stream downwind, droop in a light wind and ripple faster in a strong one */
  function tick(now: number, wind: THREE.Vector3) {
    const sp = Math.hypot(wind.x, wind.z), yaw = Math.atan2(-wind.z, wind.x), droop = (1 - Math.min(1, sp / 7)) * 1.15;
    for (const f of flags) {
      f.g.rotation.set(0, yaw, -droop);
      const a = f.geo.attributes.position.array as Float32Array, b = f.base;
      for (let i = 0; i < a.length; i += 3) {
        const u = b[i] / f.len;
        a[i] = b[i]; a[i + 1] = b[i + 1] - u * u * 0.08 * droop;
        a[i + 2] = Math.sin(u * 7 - now * (2 + sp * 1.4) + f.ph) * 0.07 * u * (0.4 + sp * 0.12);
      }
      f.geo.attributes.position.needsUpdate = true; f.geo.computeVertexNormals();
    }
  }

  const T = buildSteel(L, groundY, mats, textures, boardMat);

  const hall = {
    group, colliders, lamps, shield: M.frame, steelChip: M.pole,
    dispose() {
      group.traverse(o => { (o as THREE.Mesh).geometry?.dispose(); });
      textures.forEach(t => t.dispose()); mats.forEach(m => m.dispose());
    },
  };
  return { hall, T, groundY, tick, far: 1500 };
}

/** the steel line: a white plate hung by two chains from a frame in front of each berm, the called plate's marker above */
function buildSteel(L: RangeLayout, groundY: (x: number, z: number) => number, mats: THREE.Material[], textures: THREE.Texture[], boardMat: (d: number) => THREE.Material) {
  const group = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x2c2e30, metalness: 0.55, roughness: 0.6 });
  const chain = new THREE.MeshStandardMaterial({ color: 0x77797a, metalness: 0.9, roughness: 0.4 });
  const back = new THREE.MeshStandardMaterial({ color: 0x5a5c5a, metalness: 0.5, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8 });
  const marker = new THREE.MeshStandardMaterial({ color: 0x221100, emissive: 0xff6a10, emissiveIntensity: 3, roughness: 0.5 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6e5b44, roughness: 0.9 });
  [frame, chain, back, marker, wood].forEach(m => { m.userData.realStyle = true; mats.push(m); });
  const PX = 600;                                                     // canvas pixels per metre of plate
  const geos: THREE.BufferGeometry[] = [];
  const swing = new Map<Target, { t0: number; amp: number }>();
  const centre = new Map<Target, THREE.Vector3>();
  type Plate = { w: number; h: number; shape: THREE.Shape };
  const plateOf = (d: number): Plate => {
    if (d <= 300) { const rr = 0.2 + d * 0.0001, s = new THREE.Shape(); s.absarc(0, 0, rr, 0, Math.PI * 2, false); return { w: rr * 2, h: rr * 2, shape: s }; }
    if (d <= 700) {                                                   // a full-size silhouette, larger the farther it stands
      const k = 0.9 + d / 1500, w = 0.46 * k, h = 0.76 * k, hw = w / 2, s = new THREE.Shape();
      const pts: [number, number][] = [[-0.6, -0.5], [0.6, -0.5], [1, -0.32], [1, 0.12], [0.62, 0.26], [0.3, 0.26], [0.3, 0.5], [-0.3, 0.5], [-0.3, 0.26], [-0.62, 0.26], [-1, 0.12], [-1, -0.32]];
      pts.forEach(([u, v], i) => i ? s.lineTo(u * hw, v * h) : s.moveTo(u * hw, v * h)); s.closePath();
      return { w, h, shape: s };
    }
    const k = d / 900, w = 0.6 * k, h = 0.9 * k, s = new THREE.Shape();
    s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.closePath();
    return { w, h, shape: s };
  };
  /** clean white paint, a little grime toward the edges */
  const paint = (c: CanvasRenderingContext2D, W: number, Hh: number) => {
    c.fillStyle = '#efeee8'; c.fillRect(0, 0, W, Hh);
    const g = c.createRadialGradient(W / 2, Hh / 2, Math.min(W, Hh) * 0.2, W / 2, Hh / 2, Math.max(W, Hh) * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(70,64,52,0.22)'); c.fillStyle = g; c.fillRect(0, 0, W, Hh);
  };

  const list: Target[] = STEEL.map(([dist, dx], i) => {
    const P = plateOf(dist), x = L.lane + dx, z = L.line + dist, y0 = groundY(x, z);
    const chainLen = 0.35, bottom = 0.75 + dist * 0.0004, top = y0 + bottom + P.h + chainLen, half = P.w / 2 + 0.3;
    // the frame: two posts and a crossbar, braced at the foot
    for (const sx of [-1, 1]) {
      geos.push(box(x + sx * half - 0.045, x + sx * half + 0.045, y0 - 0.3, top + 0.06, z - 0.045, z + 0.045));
      geos.push(box(x + sx * half - 0.03, x + sx * half + 0.03, y0, y0 + 0.06, z - 0.45, z + 0.45));
    }
    geos.push(box(x - half - 0.08, x + half + 0.08, top - 0.03, top + 0.06, z - 0.05, z + 0.05));
    const hinge = new THREE.Group(); hinge.position.set(x, top - 0.03, z); group.add(hinge);
    for (const sx of [-1, 1]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.012, chainLen, 0.012).translate(sx * P.w * 0.3, -chainLen / 2, 0), chain); c.raycast = () => {}; hinge.add(c); }
    // the plate: painted front (a canvas that keeps its splashes), steel back
    const W = Math.max(64, Math.round(P.w * PX)), Hh = Math.max(64, Math.round(P.h * PX)), cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
    const ctx = cv.getContext('2d')!; paint(ctx, W, Hh);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; textures.push(t);
    // (pulled forward in depth: 300 m and more away, a centimetre is far below the depth buffer's resolution)
    const fm = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16 }); fm.userData.realStyle = true; mats.push(fm);
    const front = new THREE.ShapeGeometry(P.shape, 24);
    { const p = front.attributes.position, uv = front.attributes.uv; for (let k = 0; k < p.count; k++) uv.setXY(k, p.getX(k) / P.w + 0.5, p.getY(k) / P.h + 0.5); }
    front.rotateY(Math.PI).translate(0, -chainLen - P.h / 2, -0.012);
    const face = new THREE.Mesh(front, fm); face.castShadow = face.receiveShadow = true; hinge.add(face);
    const slab = new THREE.Mesh(new THREE.ExtrudeGeometry(P.shape, { depth: 0.012, bevelEnabled: false, curveSegments: 24 }).translate(0, -chainLen - P.h / 2, -0.006), back);
    slab.castShadow = true; slab.raycast = () => {}; hinge.add(slab);
    // the called marker over the crossbar, and the distance board beside the frame
    const mk = new THREE.Mesh(new THREE.BoxGeometry(half * 2 * 0.8, 0.12 + dist * 0.00028, 0.04).translate(x, top + 0.2 + dist * 0.00014, z), marker);
    mk.visible = false; mk.raycast = () => {}; group.add(mk);
    const bh = 0.5 + dist * 0.0011, bx = x + Math.sign(dx || 1) * (half + 0.6 + bh), by = groundY(bx, z) + 0.45 + bh / 2;
    for (const sx of [-1, 1]) geos.push(box(bx + sx * bh * 0.7 - 0.04, bx + sx * bh * 0.7 + 0.04, by - bh / 2 - 0.75, by - bh / 2 + 0.05, z + 0.02, z + 0.1));
    const bb = new THREE.Mesh(box(bx - bh, bx + bh, by - bh / 2, by + bh / 2, z, z + 0.03), wood); bb.castShadow = true; bb.userData.surface = 'wood'; group.add(bb);
    const bf = new THREE.Mesh(new THREE.PlaneGeometry(bh * 1.92, bh * 0.94).rotateY(Math.PI).translate(bx, by, z - 0.01), boardMat(dist)); bf.raycast = () => {}; group.add(bf);
    const tg: Target = { i, dist, x, z, kind: 'hostile', state: 'down', t0: 0, upAt: 0, until: 0, hits: 0, hinge, face, tex: t, ctx };
    face.userData.target = tg; face.userData.marker = mk; face.userData.plate = P;
    centre.set(tg, new THREE.Vector3(x, top - 0.03 - chainLen - P.h / 2, z));
    return tg;
  });
  const frameMesh = new THREE.Mesh(mergeGeometries(geos), frame); geos.forEach(g => g.dispose());
  frameMesh.castShadow = frameMesh.receiveShadow = true; frameMesh.userData.surface = 'steel'; group.add(frameMesh);

  /** call a plate: its marker lights, and it stays called until `until` (seconds, Infinity for free practice) */
  function pop(t: Target, _kind: 'hostile' | 'ns', now: number, until: number) {
    t.kind = 'hostile'; t.state = 'up'; t.t0 = now; t.upAt = now; t.until = until; t.hits = 0;
    (t.face.userData.marker as THREE.Mesh).visible = true;
  }
  function drop(t: Target, now: number) { if (t.state === 'down') return; t.state = 'down'; t.t0 = now; (t.face.userData.marker as THREE.Mesh).visible = false; }
  /** a strike: a grey lead splash where it landed, and the plate swings on its chains */
  const local = new THREE.Vector3();
  function hit(t: Target, point: THREE.Vector3): ShotZone {
    const P = t.face.userData.plate as Plate;
    t.face.worldToLocal(local.copy(point));
    const u = -local.x / P.w + 0.5, v = (local.y + 0.35 + P.h / 2) / P.h;    // (the face is turned to the line)
    const c = t.ctx, W = c.canvas.width, Hh = c.canvas.height, cx = u * W, cy = (1 - v) * Hh, rr = Math.max(5, 0.03 * PX);
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, rr * 2.2);
    g.addColorStop(0, 'rgba(70,72,74,0.95)'); g.addColorStop(0.35, 'rgba(110,112,112,0.8)'); g.addColorStop(1, 'rgba(150,150,148,0)');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, rr * 2.2, 0, Math.PI * 2); c.fill();
    for (let k = 0; k < 9; k++) { const a = Math.random() * Math.PI * 2, l = rr * (1.4 + Math.random() * 2.2); c.strokeStyle = 'rgba(90,92,92,0.7)'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); c.stroke(); }
    t.tex.needsUpdate = true; t.hits++;
    swing.set(t, { t0: performance.now() / 1000, amp: 0.32 + Math.random() * 0.12 });
    return 'S';
  }
  function tick(now: number) {
    for (const t of list) {
      const s = swing.get(t);
      if (!s) continue;
      const k = now - s.t0;
      if (k > 6) { swing.delete(t); t.hinge.rotation.x = 0; continue; }
      t.hinge.rotation.x = s.amp * Math.exp(-k * 0.9) * Math.sin(k * 3.6);   // back on its chains, and swinging home
    }
  }
  return {
    group, list, pop, drop, hit, tick,
    /** every plate can be struck: called or not, they always hang there */
    exposed: (_t: Target) => true,
    colliders: (() => { const c: THREE.Object3D[] = []; group.traverse(o => { if ((o as THREE.Mesh).isMesh && (o.userData.surface || o.userData.target)) c.push(o); }); return c; })(),
    /** a plate's centre, for the spotter's call on a miss */
    centre: (t: Target) => centre.get(t)!,
    reset() {
      for (const t of list) { t.state = 'down'; (t.face.userData.marker as THREE.Mesh).visible = false; t.hinge.rotation.x = 0; paint(t.ctx, t.ctx.canvas.width, t.ctx.canvas.height); t.tex.needsUpdate = true; }
      swing.clear();
    },
    dispose() { group.traverse(o => { (o as THREE.Mesh).geometry?.dispose(); }); },
  };
}
export type Field = ReturnType<typeof buildField>;
