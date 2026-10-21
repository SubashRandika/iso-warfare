// Small-arms setting for the realistic style: a shooting bench (weathered plank top on four legs) carrying a rubber
// cleaning mat printed with the same centimetre grid and ruler as the hairline plate (lib/stages/plate.ts).
// The mat's top is at y = 0, so cases and magazines that land on the hairline plate land on it too.
// Textures are drawn on canvases at load; nothing is downloaded.
import * as THREE from 'three';

type Rng = () => number;
const rng = (seed: number): Rng => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return { c, x: c.getContext('2d')! }; };
const tex = (c: HTMLCanvasElement, srgb = true) => {
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; return t;
};

/** the printed mat: charcoal rubber, a 1 cm grid (every fifth line stronger), a ruler with numbers along the front */
function matTexture(w: number, d: number, G: number, r: Rng) {
  const W = 2048, H = Math.round(W * d / w), k = W / w;          // pixels per metre
  const { c, x } = canvas(W, H);
  x.fillStyle = '#25292b'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) { const v = 30 + r() * 22; x.fillStyle = `rgba(${v},${v + 3},${v + 4},0.5)`; x.fillRect(r() * W, r() * H, 2, 2); }   // rubber grain
  const px = (m: number) => (m + w / 2) * k, pz = (m: number) => (m + d / 2) * k;          // mat-local metres → canvas (top = back, −z)
  const m = 2 * G, x0 = -w / 2 + m, x1 = w / 2 - m, z0 = -d / 2 + m, z1 = d / 2 - 5 * G, eps = G * 1e-3;
  const line = (a: [number, number], b: [number, number], major: boolean) => {
    x.strokeStyle = major ? 'rgba(214,220,216,0.55)' : 'rgba(190,198,194,0.24)'; x.lineWidth = major ? 3 : 2;
    x.beginPath(); x.moveTo(px(a[0]), pz(a[1])); x.lineTo(px(b[0]), pz(b[1])); x.stroke();
  };
  for (let i = 0; ; i++) { const gx = x0 + i * G; if (gx > x1 + eps) break; line([gx, z0], [gx, z1], i % 5 === 0); }
  for (let i = 0; ; i++) { const gz = z0 + i * G; if (gz > z1 + eps) break; line([x0, gz], [x1, gz], i % 5 === 0); }
  const rz = d / 2 - 1.2 * G;
  x.fillStyle = 'rgba(220,226,222,0.7)'; x.font = `600 ${Math.round(0.75 * G * k)}px ui-monospace, Menlo, Consolas, monospace`; x.textAlign = 'center'; x.textBaseline = 'bottom';
  for (let i = 0; ; i++) {
    const gx = x0 + i * G; if (gx > x1 + eps) break;
    const l = (i % 10 === 0 ? 2 : i % 5 === 0 ? 1.4 : 0.8) * G; line([gx, rz], [gx, rz - l], i % 5 === 0);
    if (i % 10 === 0 && i > 0) x.fillText(String(i), px(gx) + 0.45 * G * k, pz(rz - 1.25 * G));
  }
  line([x0, rz], [x1, rz], true);
  x.strokeStyle = 'rgba(200,206,202,0.3)'; x.lineWidth = 4; x.strokeRect(px(-w / 2 + G * 0.6), pz(-d / 2 + G * 0.6), (w - 1.2 * G) * k, (d - 1.2 * G) * k);   // printed border
  return tex(c);
}

/** weathered pine planks running along x, with grain, a few knots and grey sun-bleaching */
function woodTexture(planks: number, r: Rng) {
  const W = 2048, H = 1024, { c, x } = canvas(W, H), ph = H / planks;
  for (let p = 0; p < planks; p++) {
    const y0 = p * ph, base = 112 + r() * 26;
    x.fillStyle = `rgb(${base},${base * 0.8},${base * 0.58})`; x.fillRect(0, y0, W, ph);
    for (let g = 0; g < 70; g++) {                                   // grain: long, gently wavy strokes
      const y = y0 + r() * ph, a = 0.05 + r() * 0.12, amp = 2 + r() * 5, f = 0.002 + r() * 0.004, ph0 = r() * 6;
      x.strokeStyle = r() < 0.5 ? `rgba(70,45,25,${a})` : `rgba(210,180,140,${a * 0.7})`; x.lineWidth = 1 + r() * 2.5;
      x.beginPath(); for (let u = 0; u <= W; u += 32) x.lineTo(u, y + Math.sin(u * f + ph0) * amp); x.stroke();
    }
    for (let n = 0; n < 2; n++) {                                    // knots
      if (r() < 0.35) continue;
      const kx = r() * W, ky = y0 + ph * (0.25 + r() * 0.5), rx = 10 + r() * 16;
      const gr = x.createRadialGradient(kx, ky, 0, kx, ky, rx * 2.2); gr.addColorStop(0, 'rgba(60,36,18,0.8)'); gr.addColorStop(0.4, 'rgba(80,50,26,0.35)'); gr.addColorStop(1, 'rgba(80,50,26,0)');
      x.fillStyle = gr; x.beginPath(); x.ellipse(kx, ky, rx * 2.2, rx * 1.1, 0, 0, Math.PI * 2); x.fill();
    }
    x.fillStyle = 'rgba(25,18,12,0.85)'; x.fillRect(0, y0, W, 3);    // gap between planks
  }
  const bleach = x.createLinearGradient(0, 0, W, H); bleach.addColorStop(0, 'rgba(150,150,145,0.22)'); bleach.addColorStop(0.6, 'rgba(150,150,145,0.08)'); bleach.addColorStop(1, 'rgba(150,150,145,0.18)');
  x.fillStyle = bleach; x.fillRect(0, 0, W, H);
  return tex(c);
}

export function buildBench(o: { w: number; d: number; cx: number; cz: number; height?: number }, grid = 0.01) {
  const r = rng(11), H = o.height ?? 0.9, T = 0.003;              // mat thickness
  const BW = o.w + 0.8, BD = o.d + 0.36, BT = 0.045, g = new THREE.Group();
  const matMap = matTexture(o.w, o.d, grid, r), woodMap = woodTexture(5, r);
  const rubber = new THREE.MeshStandardMaterial({ color: 0x232628, roughness: 0.95 });
  const printed = new THREE.MeshStandardMaterial({ map: matMap, roughness: 0.9 });
  const wood = new THREE.MeshStandardMaterial({ map: woodMap, roughness: 0.82 });
  const legWood = new THREE.MeshStandardMaterial({ map: woodMap, color: 0xb8aa98, roughness: 0.85 });
  const mats = [rubber, printed, wood, legWood];
  mats.forEach(m => { m.userData.realStyle = true; });
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, cast = true) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; m.raycast = () => {}; g.add(m); return m;
  };
  mesh(new THREE.BoxGeometry(o.w, T - 0.0003, o.d), rubber, o.cx, -T / 2 - 0.00015, o.cz, false);
  mesh(new THREE.PlaneGeometry(o.w, o.d).rotateX(-Math.PI / 2), printed, o.cx, 0, o.cz, false);
  const top = new THREE.BoxGeometry(BW, BT, BD);
  mesh(top, wood, o.cx, -T - BT / 2, o.cz);
  const legH = H - T - BT, legGeo = new THREE.BoxGeometry(0.07, legH, 0.07);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(legGeo, legWood, o.cx + sx * (BW / 2 - 0.08), -T - BT - legH / 2, o.cz + sz * (BD / 2 - 0.07));
  const rail = new THREE.BoxGeometry(BW - 0.16, 0.06, 0.03);         // a stretcher between the legs at each end
  for (const sz of [-1, 1]) mesh(rail, legWood, o.cx, -H + 0.22, o.cz + sz * (BD / 2 - 0.07));
  return {
    group: g, floorY: -H,
    dispose() {
      g.traverse(c => (c as THREE.Mesh).geometry?.dispose());
      [matMap, woodMap].forEach(t => t.dispose()); mats.forEach(m => m.dispose());
    },
  };
}
