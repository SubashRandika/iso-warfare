// Decals for the realistic style: insignia, numbers and markings painted on the skin. Each one is a fine grid laid
// onto the surface by a placement function, so it follows aerofoils and curved flanks, carrying a cut-out canvas
// texture. Decals start hidden: list them in RealSpec.only.real so they show in the Real view only.
import * as THREE from 'three';

/** a canvas texture drawn once by `draw` (transparent where nothing is painted) */
export function decalTexture(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** cut-out paint over the skin: alpha-tested, pulled toward the camera so it never fights the surface below */
export function decalMaterial(map: THREE.Texture, o: THREE.MeshStandardMaterialParameters = {}) {
  const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...o });
  m.userData.realStyle = true;
  return m;
}

/** a grid of n × n cells whose vertex (u, v) ∈ [−½, ½]² lands at place(u, v); v = +½ is the top of the texture */
export function layDecal(parent: THREE.Object3D, mat: THREE.Material, place: (u: number, v: number) => THREE.Vector3, n = 18) {
  const g = new THREE.PlaneGeometry(1, 1, n, n), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const q = place(p.getX(i), p.getY(i)); p.setXYZ(i, q.x, q.y, q.z); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.visible = false; m.raycast = () => {}; parent.add(m);
  return m;
}

/** half-thickness ratio of a slab profile ([chord fraction, ratio] pairs, as in iso/geo slab()) at chord fraction c */
export function profileAt(pr: [number, number][], c: number) {
  c = Math.min(1, Math.max(0, c)); let i = 0; while (i < pr.length - 2 && pr[i + 1][0] < c) i++;
  return THREE.MathUtils.lerp(pr[i][1], pr[i + 1][1], (c - pr[i][0]) / (pr[i + 1][0] - pr[i][0]));
}

/** a five-pointed star path, point up, centred at (cx, cy) */
export function starPath(x: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  x.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.382 : r; x.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a)); }
  x.closePath();
}
