// Procedural textures for the realistic style, drawn on canvases at load (nothing is downloaded).
//
// skinTexture(): one tileable RGBA data texture for aircraft skin, sampled in object space (no UVs needed):
//   R  panel-line height (1 = flush skin, 0 = bottom of a recessed seam), sawtooth edges on some panels
//   G  per-panel tone, the patchwork of slightly different greys a stealth coating shows
//   B  grime: soft streaks running aft and low-frequency blotches
// concreteTextures(): colour, roughness and bump for an apron of 5 m slabs (one tile = 4 × 4 slabs).
import * as THREE from 'three';

type Rng = () => number;
const rng = (seed: number): Rng => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

/** tileable value noise, `cells` lattice cells across the tile */
function tileNoise(n: number, cells: number, r: Rng, octaves = 4) {
  const out = new Float32Array(n * n);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const c = cells << o, lat = Float32Array.from({ length: c * c }, r);
    const at = (i: number, j: number) => lat[((j % c + c) % c) * c + ((i % c + c) % c)];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const fx = x / n * c, fy = y / n * c, i = Math.floor(fx), j = Math.floor(fy);
      const u = fx - i, v = fy - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
      const a = at(i, j) + (at(i + 1, j) - at(i, j)) * su, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * su;
      out[y * n + x] += (a + (b - a) * sv) * amp;
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

const canvas = (n: number) => { const c = document.createElement('canvas'); c.width = c.height = n; return { c, x: c.getContext('2d', { willReadFrequently: true })! }; };

export function skinTexture(n = 2048, seed = 22) {
  const r = rng(seed);
  // ── panel layout: recursive splits of the tile, so every seam meets another seam like a real skin ──
  type Box = { x: number; y: number; w: number; h: number };
  const panels: Box[] = [];
  const split = (b: Box, depth: number) => {
    const small = Math.min(b.w, b.h) < n * 0.07;
    if (depth > 5 || small || (depth > 2 && r() < 0.22)) { panels.push(b); return; }
    const vertical = b.w > b.h * 1.3 ? true : b.h > b.w * 1.3 ? false : r() < 0.5, t = 0.3 + r() * 0.4;
    if (vertical) { const w = Math.round(b.w * t); split({ ...b, w }, depth + 1); split({ ...b, x: b.x + w, w: b.w - w }, depth + 1); }
    else { const h = Math.round(b.h * t); split({ ...b, h }, depth + 1); split({ ...b, y: b.y + h, h: b.h - h }, depth + 1); }
  };
  split({ x: 0, y: 0, w: n, h: n }, 0);

  // G: panel tones
  const tone = canvas(n);
  tone.x.fillStyle = '#808080'; tone.x.fillRect(0, 0, n, n);
  for (const p of panels) { const v = Math.round(128 + (r() - 0.5) * 46); tone.x.fillStyle = `rgb(${v},${v},${v})`; tone.x.fillRect(p.x, p.y, p.w, p.h); }

  // R: seams. Straight for most panels; access doors get sawtooth edges (the stealth signature)
  const seam = canvas(n);
  seam.x.fillStyle = '#fff'; seam.x.fillRect(0, 0, n, n);
  seam.x.strokeStyle = '#000'; seam.x.lineJoin = 'miter';
  const lw = Math.max(2, n / 620);
  const zig = (x0: number, y0: number, x1: number, y1: number, tooth: number) => {
    const L = Math.hypot(x1 - x0, y1 - y0), k = Math.max(2, Math.round(L / tooth)), dx = (x1 - x0) / L, dy = (y1 - y0) / L;
    seam.x.moveTo(x0, y0);
    for (let i = 1; i <= k; i++) { const t = (i - 0.5) / k * L, a = i / k * L; seam.x.lineTo(x0 + dx * t - dy * tooth * 0.45, y0 + dy * t + dx * tooth * 0.45); seam.x.lineTo(x0 + dx * a, y0 + dy * a); }
  };
  seam.x.lineWidth = lw; seam.x.beginPath();
  for (const p of panels) seam.x.rect(p.x, p.y, p.w, p.h);
  seam.x.stroke();
  // a few inset doors with sawtooth fore and aft edges, and small fastener rows along some seams
  seam.x.lineWidth = lw * 0.9;
  for (const p of panels) {
    if (p.w < n * 0.09 || p.h < n * 0.07 || r() > 0.42) continue;
    const m = Math.min(p.w, p.h) * 0.16, x0 = p.x + m, y0 = p.y + m, x1 = p.x + p.w - m, y1 = p.y + p.h - m, tooth = Math.max(10, (y1 - y0) / 5);
    seam.x.beginPath();
    zig(x0, y0, x0, y1, tooth); seam.x.lineTo(x1, y1); zig(x1, y1, x1, y0, tooth); seam.x.lineTo(x0, y0);
    seam.x.stroke();
  }
  seam.x.fillStyle = '#000';
  for (const p of panels) {
    if (r() > 0.3) continue;
    const step = n / 170, y = p.y + n * 0.006;
    for (let x = p.x + step; x < p.x + p.w - step; x += step) { seam.x.beginPath(); seam.x.arc(x, y, lw * 0.55, 0, Math.PI * 2); seam.x.fill(); }
  }

  // B: grime. Low-frequency blotches plus streaks pulled along the texture's v axis
  const m = 256, noise = tileNoise(m, 4, r, 5), streak = tileNoise(m, 3, r, 3);
  const grime = canvas(m), gd = grime.x.createImageData(m, m);
  for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
    let s = 0; for (let k = 0; k < 10; k++) s += streak[((y + k * 3) % m) * m + ((x * 7) % m)];   // smear along y
    const v = Math.min(1, Math.max(0, 0.55 * noise[y * m + x] + 0.45 * s / 10));
    const o = (y * m + x) * 4; gd.data[o] = gd.data[o + 1] = gd.data[o + 2] = v * 255; gd.data[o + 3] = 255;
  }
  grime.x.putImageData(gd, 0, 0);
  const big = canvas(n); big.x.imageSmoothingQuality = 'high'; big.x.drawImage(grime.c, 0, 0, n, n);

  // pack R, G, B
  const out = canvas(n), od = out.x.createImageData(n, n);
  const S = seam.x.getImageData(0, 0, n, n).data, T = tone.x.getImageData(0, 0, n, n).data, B = big.x.getImageData(0, 0, n, n).data;
  for (let i = 0; i < n * n; i++) { const o = i * 4; od.data[o] = S[o]; od.data[o + 1] = T[o]; od.data[o + 2] = B[o]; od.data[o + 3] = 255; }
  out.x.putImageData(od, 0, 0);
  const tex = new THREE.CanvasTexture(out.c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 8;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function concreteTextures(n = 2048, seed = 7) {
  const r = rng(seed);
  // low-frequency mottling at 256 px, smoothed up to full size by the canvas (fast); speckle per pixel from the rng
  const m = 256, low = tileNoise(m, 8, r, 5), lc = canvas(m), ld = lc.x.createImageData(m, m);
  for (let i = 0; i < m * m; i++) { const o = i * 4; ld.data[o] = ld.data[o + 1] = ld.data[o + 2] = low[i] * 255; ld.data[o + 3] = 255; }
  lc.x.putImageData(ld, 0, 0);
  const up = canvas(n); up.x.imageSmoothingQuality = 'high'; up.x.drawImage(lc.c, 0, 0, n, n);
  const noise = up.x.getImageData(0, 0, n, n).data;
  const col = canvas(n), rough = canvas(n), bump = canvas(n);
  const cd = col.x.createImageData(n, n), rd = rough.x.createImageData(n, n), bd = bump.x.createImageData(n, n);
  const slab = n / 4, joint = Math.max(2, n / 700);
  const slabTone = Array.from({ length: 16 }, () => (r() - 0.5) * 0.07);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, o = i * 4, nz = noise[o] / 255, f = r();
    const sx = Math.floor(x / slab), sy = Math.floor(y / slab);
    const jx = Math.min(x % slab, slab - (x % slab)), jy = Math.min(y % slab, slab - (y % slab));
    const inJoint = jx < joint || jy < joint;
    const speck = f > 0.93 ? -0.07 : f < 0.04 ? 0.04 : 0;
    let v = 0.62 + slabTone[sy * 4 + sx] + (nz - 0.5) * 0.14 + speck;
    if (inJoint) v *= 0.42;
    const c = Math.max(0, Math.min(1, v)) * 255;
    cd.data[o] = c; cd.data[o + 1] = c * 0.985; cd.data[o + 2] = c * 0.95; cd.data[o + 3] = 255;
    rd.data[o] = rd.data[o + 1] = rd.data[o + 2] = Math.max(0, Math.min(1, 0.82 + (nz - 0.5) * 0.2)) * 255; rd.data[o + 3] = 255;
    bd.data[o] = bd.data[o + 1] = bd.data[o + 2] = inJoint ? 0 : (0.6 + f * 0.4) * 255; bd.data[o + 3] = 255;
  }
  col.x.putImageData(cd, 0, 0); rough.x.putImageData(rd, 0, 0); bump.x.putImageData(bd, 0, 0);
  // oil drips and tyre scuffs: darker, glossier
  for (let k = 0; k < 14; k++) {
    const x = r() * n, y = r() * n, rad = n * (0.006 + r() * 0.02);
    for (const [ctx, colr] of [[col.x, 'rgba(30,28,26,'], [rough.x, 'rgba(40,40,40,']] as const) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, colr + (0.12 + r() * 0.14) + ')'); g.addColorStop(1, colr + '0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rad, rad * (0.4 + r() * 0.6), r() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
  }
  col.x.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    const x = r() * n, y = r() * n, a = (r() - 0.5) * 0.3, L = n * (0.2 + r() * 0.3), w = n * 0.006;
    col.x.strokeStyle = `rgba(25,24,23,${0.05 + r() * 0.05})`; col.x.lineWidth = w;
    for (const off of [0]) { col.x.beginPath(); col.x.moveTo(x + off, y); col.x.quadraticCurveTo(x + off + Math.sin(a) * L * 0.5, y + L * 0.5, x + off + Math.sin(a) * L, y + L); col.x.stroke(); }
  }
  const mk = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
  };
  return { map: mk(col.c, true), roughnessMap: mk(rough.c, false), bumpMap: mk(bump.c, false) };
}
