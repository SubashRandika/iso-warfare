// The indoor range hall (Real view only): five shooting booths along the firing line, the weapon's own bench in the
// middle one (lane 3), painted block walls with acoustic panels above, overhead safety baffles between rows of LED
// troffers, a rubber-block backstop under a steel deflector with the range status light, floor lines every 5 m.
// The lights are emissive panels only: the stage's sun stands in for them from above (a change in the scene's light
// count would recompile every shader). Textures are drawn on canvases at load; static pieces are merged by material,
// so the whole hall is about twenty draws. Every surface a bullet can strike carries userData.surface.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { decalMaterial, decalTexture } from '../real/decals';
import { share } from '../real/textures';
import type { BenchSpec } from './types';

export type Surface = 'concrete' | 'fabric' | 'rubber' | 'steel' | 'wood' | 'paper' | 'dirt';

/** where everything is, from the bench the weapon lies on (lib/real/bench.ts builds it from the same spec) */
export function rangeLayout(b: BenchSpec) {
  const H = b.height ?? 0.9, BW = b.w + 0.8, BD = b.d + 0.36;
  const floor = -H, line = b.cz + BD / 2, lane = b.cx;
  return {
    floor, line, lane, laneW: 2, lanes: 5, mine: 3,
    bench: { x0: b.cx - BW / 2, x1: b.cx + BW / 2, z0: b.cz - BD / 2, z1: line },
    X0: lane - 6, X1: lane + 6, Z0: line - 5, Z1: line + 27.5, top: floor + 3.4,
    /** booth partitions run from here to just past the line */
    boothZ: Math.min(line - 1.1, b.cz - BD / 2 - 0.35),
  };
}
export type RangeLayout = ReturnType<typeof rangeLayout>;

type Rng = () => number;
const rng = (seed: number): Rng => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const canvas = (w: number, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return { c, x: c.getContext('2d', { willReadFrequently: true })! }; };
const tex = (c: HTMLCanvasElement, srgb: boolean) => {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
};
type RGBA = [number, number, number, number];
/** sprinkle n specks of colour (r, g, b, opacity: a function of the rng) over a canvas, straight into its pixels (tens of
 *  thousands of fillRects, each parsing a colour string, took a few hundred milliseconds) */
const speckle = (x: CanvasRenderingContext2D, W: number, H: number, n: number, r: Rng, col: (r: Rng) => RGBA, s = 2) => {
  const img = x.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < n; i++) {
    const [cr, cg, cb, a] = col(r), px = Math.floor(r() * W), py = Math.floor(r() * H);
    for (let v = py; v < Math.min(H, py + s); v++) for (let u = px; u < Math.min(W, px + s); u++) {
      const o = (v * W + u) * 4; d[o] += (cr - d[o]) * a; d[o + 1] += (cg - d[o + 1]) * a; d[o + 2] += (cb - d[o + 2]) * a;
    }
  }
  x.putImageData(img, 0, 0);
};

/** painted concrete block, running bond (one tile = 1.6 m square: four blocks across, eight courses) */
function blockTextures(r: Rng) {
  const N = 1024, bw = N / 4, bh = N / 8, m = 7, { c, x } = canvas(N), b = canvas(N);
  x.fillStyle = '#7b7f80'; x.fillRect(0, 0, N, N); b.x.fillStyle = '#000'; b.x.fillRect(0, 0, N, N);
  for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
    const ox = col * bw + (row % 2 ? bw / 2 : 0), oy = row * bh, v = 150 + r() * 16;
    x.fillStyle = `rgb(${v},${v + 2},${v + 2})`; x.fillRect(ox + m / 2, oy + m / 2, bw - m, bh - m);
    b.x.fillStyle = '#c8c8c8'; b.x.fillRect(ox + m / 2, oy + m / 2, bw - m, bh - m);
  }
  speckle(x, N, N, 26000, r, q => [90 + q() * 60, 90 + q() * 60, 92 + q() * 60, 0.35]);
  speckle(b.x, N, N, 30000, r, q => [q() < 0.5 ? 255 : 60, q() < 0.5 ? 255 : 60, q() < 0.5 ? 255 : 60, 0.22]);
  const g = x.createLinearGradient(0, 0, 0, N); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(40,36,30,0.12)');   // scuffs low down
  x.fillStyle = g; x.fillRect(0, 0, N, N);
  return { map: tex(c, true), bumpMap: tex(b.c, false) };
}
/** fabric-wrapped acoustic panels, 1.2 m wide, with dark joints between them (one tile = 2.4 m) */
function fabricTextures(r: Rng, base: [number, number, number]) {
  const N = 512, { c, x } = canvas(N), b = canvas(N);
  x.fillStyle = `rgb(${base.join(',')})`; x.fillRect(0, 0, N, N); b.x.fillStyle = '#808080'; b.x.fillRect(0, 0, N, N);
  speckle(x, N, N, 30000, r, q => { const v = (q() - 0.5) * 22; return [base[0] + v, base[1] + v, base[2] + v, 0.6]; }, 1);
  for (let y = 0; y < N; y += 2) { b.x.fillStyle = `rgba(255,255,255,${0.06 + r() * 0.06})`; b.x.fillRect(0, y, N, 1); }   // weave
  for (const k of [0, N / 2]) { x.fillStyle = 'rgba(10,10,12,0.85)'; x.fillRect(k - 2, 0, 4, N); b.x.fillStyle = '#000'; b.x.fillRect(k - 3, 0, 6, N); }
  return { map: tex(c, true), bumpMap: tex(b.c, false) };
}
/** rubber backstop blocks, 0.5 m, black granulate pocked by hits (one tile = 1 m) */
function rubberTextures(r: Rng) {
  const N = 512, { c, x } = canvas(N), b = canvas(N);
  x.fillStyle = '#1c1d1e'; x.fillRect(0, 0, N, N); b.x.fillStyle = '#909090'; b.x.fillRect(0, 0, N, N);
  speckle(x, N, N, 40000, r, q => { const v = 18 + q() * 30; return [v, v, v + 2, 0.8]; });
  speckle(b.x, N, N, 40000, r, q => { const v = q() * 255; return [v, v, v, 0.5]; });
  for (let i = 0; i < 70; i++) {                                         // bullet pocks
    const px = r() * N, py = r() * N, rr = 2 + r() * 5;
    x.fillStyle = 'rgba(5,5,5,0.9)'; x.beginPath(); x.arc(px, py, rr, 0, Math.PI * 2); x.fill();
    b.x.fillStyle = '#000'; b.x.beginPath(); b.x.arc(px, py, rr, 0, Math.PI * 2); b.x.fill();
  }
  for (const k of [0, N / 2]) for (const [ctx, col] of [[x, 'rgba(0,0,0,0.9)'], [b.x, '#000']] as const) { ctx.fillStyle = col; ctx.fillRect(k - 2, 0, 4, N); ctx.fillRect(0, k - 2, N, 4); }
  return { map: tex(c, true), bumpMap: tex(b.c, false) };
}
/** olive-drab painted steel with scuffs and bright chips where rounds have struck (one tile = 1 m) */
function steelTextures(r: Rng) {
  const N = 512, { c, x } = canvas(N), ro = canvas(N);
  x.fillStyle = '#4a4a35'; x.fillRect(0, 0, N, N); ro.x.fillStyle = '#b0b0b0'; ro.x.fillRect(0, 0, N, N);
  speckle(x, N, N, 16000, r, q => { const v = (q() - 0.5) * 26; return [74 + v, 74 + v, 53 + v, 0.5]; }, 3);
  for (let i = 0; i < 26; i++) {
    const px = r() * N, py = r() * N, rr = 1.2 + r() * 2.5;
    x.fillStyle = `rgba(${105 + r() * 30},${105 + r() * 30},${100 + r() * 30},0.85)`; x.beginPath(); x.arc(px, py, rr, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(95,95,92,0.3)'; x.beginPath(); x.arc(px, py, rr * 2.4, 0, Math.PI * 2); x.fill();   // lead splash
    ro.x.fillStyle = '#3c3c3c'; ro.x.beginPath(); ro.x.arc(px, py, rr, 0, Math.PI * 2); ro.x.fill();
  }
  return { map: tex(c, true), roughnessMap: tex(ro.c, false) };
}

/** planar UVs in world metres from each face's normal, `tile` metres per texture repeat */
function worldUV(g: THREE.BufferGeometry, tile: number) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [u, v] = ax >= ay && ax >= az ? [p.getZ(i), p.getY(i)] : ay >= az ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)];
    uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
  new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

/** the hall's textures, drawn once and shared by every hall (one per bench size) */
let hallTex: ReturnType<typeof drawHallTextures> | null = null;
function drawHallTextures() {
  const r = rng(29);
  return { block: share(blockTextures(r)), fabric: share(fabricTextures(r, [46, 49, 54])), booth: share(fabricTextures(r, [74, 80, 88])), rubber: share(rubberTextures(r)), steel: share(steelTextures(r)) };
}

export function buildChamber(L: RangeLayout) {
  const r = rng(31), group = new THREE.Group(); group.visible = false;
  const { floor: F, line, X0, X1, Z0, Z1, top } = L;
  const textures: THREE.Texture[] = [], mats: THREE.Material[] = [];        // this hall's own (its decals)
  const std = (o: THREE.MeshStandardMaterialParameters) => { const m = new THREE.MeshStandardMaterial(o); m.userData.realStyle = true; mats.push(m); return m; };
  const TX = hallTex ??= drawHallTextures();

  const M = {
    block: std({ ...TX.block, bumpScale: 1.4, roughness: 0.92 }),
    fabric: std({ ...TX.fabric, bumpScale: 0.6, roughness: 1 }),
    booth: std({ ...TX.booth, bumpScale: 0.5, roughness: 1 }),
    rubber: std({ ...TX.rubber, bumpScale: 2.2, roughness: 0.96 }),
    shield: std({ ...TX.steel, metalness: 0.45, roughness: 1 }),
    baffle: std({ color: 0x2f3236, metalness: 0.4, roughness: 0.72 }),
    ceiling: std({ color: 0x1d1f21, roughness: 0.96 }),
    alu: std({ color: 0xb4b9bd, metalness: 0.9, roughness: 0.34 }),
    counter: std({ color: 0x55595d, metalness: 0.1, roughness: 0.55 }),
    door: std({ color: 0x3b4146, metalness: 0.55, roughness: 0.5 }),
    yellow: std({ color: 0xd9a21b, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    white: std({ color: 0xdcdcd4, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  };
  const SURF = new Map<THREE.Material, Surface>([
    [M.block, 'concrete'], [M.fabric, 'fabric'], [M.booth, 'fabric'], [M.rubber, 'rubber'], [M.shield, 'steel'], [M.baffle, 'steel'],
    [M.ceiling, 'fabric'], [M.alu, 'steel'], [M.counter, 'wood'], [M.door, 'steel'], [M.yellow, 'concrete'], [M.white, 'concrete'],
  ]);
  const NO_SHADOW = new Set<THREE.Material>([M.ceiling, M.baffle, M.yellow, M.white]);
  // the lights: emissive only (brightness set per frame by the range)
  const lamp = (color: number) => std({ color: 0x111111, emissive: color, emissiveIntensity: 0, roughness: 0.4 });
  const L_ = { house: lamp(0xf4f1ea), flood: lamp(0xfff2dc), hot: lamp(0xff2a1a), cold: lamp(0x2bff6a), exit: lamp(0x2bff6a) };

  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry, tile = 0) => { if (tile) worldUV(g, tile); (bins.get(m) ?? bins.set(m, []).get(m)!).push(g); };

  // ── walls: block to 1.5 m, acoustic panels above; the back wall all block; a rubber backstop downrange ──
  const T = 0.2, mid = F + 1.5;
  for (const [a, b] of [[X0 - T, X0], [X1, X1 + T]]) { put(M.block, box(a, b, F, mid, Z0, Z1), 1.6); put(M.fabric, box(a, b, mid, top, Z0, Z1), 2.4); }
  put(M.block, box(X0, X1, F, top, Z0 - T, Z0), 1.6);
  put(M.rubber, box(X0, X1, F, top, Z1, Z1 + 0.6), 1);
  put(M.rubber, worldUV(new THREE.BoxGeometry(X1 - X0, 0.9, 1.6).rotateX(0.62).translate((X0 + X1) / 2, F + 0.32, Z1 - 0.5), 1));   // granulate berm at the foot
  put(M.baffle, new THREE.BoxGeometry(X1 - X0, 0.05, 2.2).rotateX(-0.5).translate((X0 + X1) / 2, top - 0.55, Z1 - 0.9));            // deflector over the backstop
  put(M.ceiling, box(X0 - T, X1 + T, top, top + 0.1, Z0 - T, Z1 + 0.6));

  // ── overhead safety baffles, every 4 m downrange, leaning so a high round strikes their face ──
  for (let z = line + 4; z < Z1 - 2; z += 4) put(M.baffle, new THREE.BoxGeometry(X1 - X0, 0.95, 0.06).rotateX(0.42).translate((X0 + X1) / 2, top - 0.5, z));
  // ── LED troffers across the hall (aluminium housing, lit lens) and floods aimed at the target line ──
  const lensGeo: THREE.BufferGeometry[] = [], floodGeo: THREE.BufferGeometry[] = [];
  for (const z of [line - 3.4, line - 1.2, line + 2, line + 6, line + 10, line + 14, line + 18, line + 22]) {
    put(M.alu, box(X0 + 0.5, X1 - 0.5, top - 0.06, top, z - 0.17, z + 0.17));
    lensGeo.push(box(X0 + 0.6, X1 - 0.6, top - 0.075, top - 0.06, z - 0.12, z + 0.12));
  }
  for (let i = 0; i < 5; i++) {
    const x = X0 + 1.6 + i * (X1 - X0 - 3.2) / 4, z = Z1 - 7;
    put(M.alu, new THREE.BoxGeometry(0.5, 0.26, 0.24).rotateX(0.5).translate(x, top - 0.45, z));
    put(M.alu, box(x - 0.02, x + 0.02, top - 0.4, top, z - 0.02, z + 0.02));
    floodGeo.push(new THREE.BoxGeometry(0.44, 0.2, 0.02).rotateX(0.5).translate(x, top - 0.45 - 0.06, z + 0.11));
  }

  // ── booths: partitions with aluminium trim either side of every lane, a counter in each (lane 3 is the bench) ──
  const zb = L.boothZ, zf = line + 0.15;
  for (let k = 0; k <= L.lanes; k++) {
    const x = L.lane + (k - L.lanes / 2) * L.laneW;
    put(M.booth, box(x - 0.03, x + 0.03, F + 0.25, F + 2.05, zb, zf), 2.4);
    put(M.alu, box(x - 0.035, x + 0.035, F + 2.05, F + 2.09, zb, zf));
    for (const z of [zb, zf]) put(M.alu, box(x - 0.035, x + 0.035, F, F + 2.09, z - 0.035, z + 0.035));
  }
  for (let i = 1; i <= L.lanes; i++) {
    if (i === L.mine) continue;
    const x = L.lane + (i - L.mine) * L.laneW, w = L.bench.x1 - L.bench.x0;
    put(M.counter, box(x - w / 2, x + w / 2, -0.045, 0, L.bench.z0, line));
    put(M.door, box(x - w / 2 + 0.02, x + w / 2 - 0.02, F + 0.12, -0.045, line - 0.05, line - 0.03));
  }

  // ── floor: the yellow firing line, white lines every 5 m, lane numbers and distances painted on ──
  const flat = (w: number, d: number, x: number, z: number) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, F + 0.002, z);
  put(M.yellow, flat(X1 - X0, 0.1, (X0 + X1) / 2, line + 0.22));
  for (let d = 5; d <= 25; d += 5) put(M.white, flat(X1 - X0 - 0.4, 0.05, (X0 + X1) / 2, line + d));
  const decals: THREE.Mesh[] = [];
  const paint = (text: string, w: number, h: number, place: (g: THREE.PlaneGeometry) => THREE.BufferGeometry, col = '#dcdcd4', font = 800) => {
    const t = decalTexture(512, Math.round(512 * h / w), x => {
      x.fillStyle = col; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = `${font} ${Math.round(512 * h / w * 0.82)}px "Arial Narrow", Impact, sans-serif`; x.fillText(text, 256, 512 * h / w * 0.54);
    });
    textures.push(t);
    const m = new THREE.Mesh(place(new THREE.PlaneGeometry(w, h)), decalMaterial(t, { roughness: 0.62, alphaTest: 0.35 })); mats.push(m.material as THREE.Material);
    m.raycast = () => {}; m.receiveShadow = true; group.add(m); decals.push(m);
  };
  for (let i = 1; i <= L.lanes; i++) paint(String(i), 0.5, 0.55, g => g.rotateX(-Math.PI / 2).translate(L.lane + (i - L.mine) * L.laneW, F + 0.003, line + 0.85));
  for (let d = 5; d <= 25; d += 5) for (const x of [X0 + 0.55, X1 - 0.55]) {
    paint(`${d}`, 0.5, 0.36, g => g.rotateX(-Math.PI / 2).translate(x, F + 0.003, line + d - 0.35));
    paint(`${d} M`, 0.42, 0.24, g => g.rotateY(x < L.lane ? Math.PI / 2 : -Math.PI / 2).translate(x < L.lane ? X0 + 0.004 : X1 - 0.004, F + 1.25, line + d), '#e9e9e2');
  }

  // ── back wall: a steel door with its exit sign, the protection notice and the range rules ──
  put(M.door, box(X0 + 1.2, X0 + 2.15, F, F + 2.1, Z0, Z0 + 0.05));
  put(M.alu, box(X0 + 2.0, X0 + 2.08, F + 1.0, F + 1.06, Z0 + 0.05, Z0 + 0.1));
  put(M.alu, box(X0 + 1.4, X0 + 1.95, F + 2.25, F + 2.45, Z0, Z0 + 0.08));
  const exitGeo = box(X0 + 1.43, X0 + 1.92, F + 2.28, F + 2.42, Z0 + 0.08, Z0 + 0.085);
  const board = (w: number, h: number, x: number, y: number, draw: (c: CanvasRenderingContext2D, W: number, H: number) => void) => {
    const W = 1024, H = Math.round(W * h / w), t = decalTexture(W, H, c => draw(c, W, H)); textures.push(t);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(x, y, Z0 + 0.012), decalMaterial(t, { roughness: 0.5, alphaTest: 0 }));
    mats.push(m.material as THREE.Material); m.raycast = () => {}; group.add(m);
  };
  board(1.3, 0.62, L.lane - 0.8, F + 1.7, (c, W, H) => {
    c.fillStyle = '#e8b51c'; c.fillRect(0, 0, W, H); c.fillStyle = '#141414'; c.fillRect(14, 14, W - 28, 112);
    c.fillStyle = '#e8b51c'; c.font = '800 84px "Arial Narrow", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('CAUTION', W / 2, 72);
    c.fillStyle = '#141414'; c.font = '800 70px "Arial Narrow", Impact, sans-serif';
    ['EYE AND EAR PROTECTION', 'MUST BE WORN', 'BEYOND THIS POINT'].forEach((s, i) => c.fillText(s, W / 2, 205 + i * 86));
  });
  board(1.0, 1.25, L.lane + 0.9, F + 1.55, (c, W, H) => {
    c.fillStyle = '#f0efe9'; c.fillRect(0, 0, W, H); c.fillStyle = '#9b1c16'; c.fillRect(0, 0, W, 150);
    c.fillStyle = '#fff'; c.font = '800 96px "Arial Narrow", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('RANGE RULES', W / 2, 78);
    c.fillStyle = '#1a1a1a'; c.textAlign = 'left'; c.font = '600 46px "Arial Narrow", Arial, sans-serif';
    // a rule per bullet; indented lines carry on the one above
    ['Treat every weapon as loaded.', 'Keep the muzzle downrange.', 'Finger off the trigger until', '  the sights are on target.', 'Know your target and what', '  lies beyond it.', 'Fire only on the line, only', '  when the range is hot.', 'Cease fire on any command.']
      .forEach((s, i) => c.fillText(s.startsWith(' ') ? `    ${s.trim()}` : `•  ${s}`, 60, 230 + i * 116));
  });

  // ── merge by material ──
  const colliders: THREE.Mesh[] = [];
  for (const [m, geos] of bins) {
    const g = mergeGeometries(geos); geos.forEach(x => x.dispose());
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = !NO_SHADOW.has(m); mesh.receiveShadow = true;
    mesh.userData.surface = SURF.get(m); group.add(mesh); colliders.push(mesh);
  }
  const lit = (geos: THREE.BufferGeometry[], m: THREE.Material) => { const mesh = new THREE.Mesh(mergeGeometries(geos), m); geos.forEach(x => x.dispose()); mesh.raycast = () => {}; group.add(mesh); return mesh; };
  lit(lensGeo, L_.house); lit(floodGeo, L_.flood); lit([exitGeo], L_.exit);
  // the range status light over the backstop: red while the range is hot, green while it is cold
  const status = new THREE.Group(); group.add(status);
  for (const [m, x] of [[L_.hot, -0.45], [L_.cold, 0.45]] as const) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 20).rotateX(Math.PI / 2).translate(L.lane + x, top - 1.25, Z1 - 0.04), m);
    s.raycast = () => {}; status.add(s);
  }
  const statusBox = new THREE.Mesh(box(L.lane - 0.75, L.lane + 0.75, top - 1.45, top - 1.05, Z1 - 0.02, Z1), M.door); statusBox.raycast = () => {}; status.add(statusBox);
  // the floor, for bullets only (the stage's concrete ground is what shows)
  const floorHit = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0).rotateX(-Math.PI / 2).translate((X0 + X1) / 2, F, (Z0 + Z1) / 2), M.white);
  floorHit.visible = false; floorHit.userData.surface = 'concrete'; group.add(floorHit); colliders.push(floorHit);

  return {
    group, colliders, lamps: L_, shield: M.shield, steelChip: M.alu,
    dispose() {
      group.traverse(o => (o as THREE.Mesh).geometry?.dispose());
      textures.forEach(t => t.dispose()); mats.forEach(m => m.dispose());
    },
  };
}
export type Chamber = ReturnType<typeof buildChamber>;
