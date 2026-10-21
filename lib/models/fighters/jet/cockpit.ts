// Cockpit furniture for the realistic style: ejection seat, instrument panel with live displays (three displays and a
// HUD, or one panoramic display), glareshield, side consoles, side-stick, throttles and rudder pedals. Plain three.js meshes in physically based materials with
// small procedural textures; they are shown only in the Real view (the hairline view keeps its simple cockpit).
// Local axes of every piece: x to the pilot's left (+x = port), y up, z forward.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

type Mat = THREE.Material;
const DEG = Math.PI / 180;

const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return { c, x: c.getContext('2d')! }; };
const tex = (c: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };

/** console tops: rows of push buttons, toggles and knobs with stencilled labels, a few lit annunciators */
function consoleTexture() {
  const { c, x } = canvas(512, 512);
  x.fillStyle = '#2b2e31'; x.fillRect(0, 0, 512, 512);
  let seed = 5; const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let row = 0; row < 6; row++) {
    const y0 = 14 + row * 84;
    x.strokeStyle = '#3a3e42'; x.lineWidth = 2; x.strokeRect(10, y0, 492, 74);                       // panel module
    x.fillStyle = '#8c9196'; x.fillRect(18, y0 + 6, 60 + r() * 60, 4);                                  // label
    const kind = row % 3;
    for (let i = 0; i < 7; i++) {
      const cx = 40 + i * 66, cy = y0 + 44;
      if (kind === 0) { x.fillStyle = '#16181a'; x.fillRect(cx - 18, cy - 14, 36, 28); x.fillStyle = r() > 0.7 ? '#4fd36a' : '#3b3f43'; x.fillRect(cx - 14, cy - 10, 28, 8); }
      else if (kind === 1) { x.fillStyle = '#121314'; x.beginPath(); x.arc(cx, cy, 13, 0, 7); x.fill(); x.fillStyle = '#b9bec3'; x.fillRect(cx - 2, cy - 16, 4, 14); }
      else { x.fillStyle = '#0f1011'; x.beginPath(); x.arc(cx, cy, 16, 0, 7); x.fill(); x.strokeStyle = '#6a6f74'; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + 10 * Math.cos(r() * 6), cy + 10 * Math.sin(r() * 6)); x.stroke(); }
      x.fillStyle = '#7d8287'; x.fillRect(cx - 12, cy + 20, 24, 3);
    }
  }
  return tex(c);
}

/** display bezel: frame with five soft keys per side around a black screen well */
function bezelTexture() {
  const { c, x } = canvas(256, 256);
  x.fillStyle = '#26292c'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#050606'; x.fillRect(34, 34, 188, 188);
  x.fillStyle = '#44484c';
  for (let i = 0; i < 5; i++) {
    const t = 52 + i * 38;
    x.fillRect(t - 12, 8, 24, 18); x.fillRect(t - 12, 230, 24, 18); x.fillRect(8, t - 9, 18, 18); x.fillRect(230, t - 9, 18, 18);
  }
  x.fillStyle = '#9aa0a5'; for (let i = 0; i < 5; i++) { const t = 52 + i * 38; x.fillRect(t - 6, 15, 12, 3); x.fillRect(t - 6, 237, 12, 3); }
  return tex(c);
}

/** integrated control panel: a keypad under the HUD */
function keypadTexture() {
  const { c, x } = canvas(256, 160);
  x.fillStyle = '#26292c'; x.fillRect(0, 0, 256, 160);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) {
    x.fillStyle = '#3d4145'; x.fillRect(12 + i * 40, 12 + j * 36, 32, 28);
    x.fillStyle = '#c8cdd2'; x.fillRect(22 + i * 40, 24 + j * 36, 12, 3);
  }
  return tex(c);
}

/** up-front display: amber/green text rows */
function ufdTexture() {
  const { c, x } = canvas(128, 96);
  x.fillStyle = '#040505'; x.fillRect(0, 0, 128, 96);
  x.fillStyle = '#5fe07a';
  for (let j = 0; j < 6; j++) { x.fillRect(8, 8 + j * 14, 20 + ((j * 37) % 70), 5); x.fillRect(96, 8 + j * 14, 22, 5); }
  return tex(c);
}

/** HUD symbology (green, drawn on black for additive blending): flight-path marker, pitch ladder, tapes */
function hudTexture() {
  const { c, x } = canvas(256, 220);
  x.fillStyle = '#000'; x.fillRect(0, 0, 256, 220);
  x.strokeStyle = '#46ff7a'; x.fillStyle = '#46ff7a'; x.lineWidth = 3;
  x.beginPath(); x.arc(128, 110, 9, 0, 7); x.stroke();
  x.beginPath(); x.moveTo(100, 110); x.lineTo(119, 110); x.moveTo(137, 110); x.lineTo(156, 110); x.moveTo(128, 101); x.lineTo(128, 90); x.stroke();
  for (const d of [-50, 50]) { x.beginPath(); x.moveTo(80, 110 + d); x.lineTo(110, 110 + d); x.moveTo(146, 110 + d); x.lineTo(176, 110 + d); x.stroke(); }
  x.lineWidth = 2;
  x.strokeRect(14, 96, 40, 26); x.strokeRect(202, 96, 40, 26);
  for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(60 + i * 17, 12); x.lineTo(60 + i * 17, i % 2 ? 20 : 26); x.stroke(); }
  return tex(c);
}

function stripeTexture() {
  const { c, x } = canvas(128, 16);
  for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? '#141414' : '#e8b41c'; x.beginPath(); x.moveTo(i * 8, 0); x.lineTo(i * 8 + 8, 0); x.lineTo(i * 8 + 16, 16); x.lineTo(i * 8 + 8, 16); x.fill(); }
  const t = tex(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1); return t;
}

export function cockpitMaterials() {
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ envMapIntensity: 0.45, ...o });
  const m = {
    frame: std({ color: 0x323436, roughness: 0.55, metalness: 0.35 }),
    cushion: std({ color: 0x383d30, roughness: 0.96 }),
    pad: std({ color: 0x4d5143, roughness: 0.92 }),
    strap: std({ color: 0x6d6946, roughness: 0.88 }),
    panel: std({ color: 0x35383b, roughness: 0.72, metalness: 0.1 }),
    console: std({ map: consoleTexture(), roughness: 0.72 }),
    bezel: std({ map: bezelTexture(), roughness: 0.6 }),
    keypad: std({ map: keypadTexture(), roughness: 0.6 }),
    shield: std({ color: 0x141516, roughness: 0.95, side: THREE.DoubleSide }),
    tub: std({ color: 0x45484b, roughness: 0.88, side: THREE.DoubleSide }),
    rubber: std({ color: 0x0e0e0e, roughness: 0.9 }),
    handle: std({ map: stripeTexture(), roughness: 0.5 }),
    metal: std({ color: 0x8c8f92, roughness: 0.32, metalness: 0.85 }),
    grip: std({ color: 0x1b1c1d, roughness: 0.82 }),
    knob: std({ color: 0xd9d8d0, roughness: 0.45 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xa8d8b4, transparent: true, opacity: 0.22, roughness: 0.02, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide }),
    ufd: new THREE.MeshBasicMaterial({ map: ufdTexture(), toneMapped: false }),
    hud: new THREE.MeshBasicMaterial({ map: hudTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  };
  Object.values(m).forEach(x => { x.userData.realStyle = true; });
  return m;
}
export type CockpitMats = ReturnType<typeof cockpitMaterials>;

/** a mesh that casts and takes shadows */
function solid(geo: THREE.BufferGeometry, mat: Mat | Mat[], parent: THREE.Object3D, at?: THREE.Vector3, rx = 0) {
  const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true;
  if (at) m.position.copy(at); m.rotation.x = rx; parent.add(m); return m;
}
const rbox = (w: number, h: number, d: number, r: number) => r > 0 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** a plane facing aft (−z), texture reading correctly from the pilot's seat */
const aftPlane = (w: number, h: number) => new THREE.PlaneGeometry(w, h).rotateY(Math.PI);

/** ejection seat (ACES II class), origin at the top centre of the seat cushion; the back reclines aft */
export function ejectionSeat(M: CockpitMats, recline = 18 * DEG) {
  const g = new THREE.Group();
  const up = V(0, Math.cos(recline), -Math.sin(recline)), fwd = V(0, Math.sin(recline), Math.cos(recline));
  const back = (t: number, out: number, x = 0) => V(x, 0.05, -0.23).addScaledVector(up, t).addScaledVector(fwd, out);
  // bucket, survival kit, cushion
  solid(rbox(0.48, 0.2, 0.46, 0.02), M.frame, g, V(0, -0.115, 0));
  for (const k of [1, -1]) solid(rbox(0.03, 0.27, 0.47, 0.008), M.frame, g, V(k * 0.245, -0.01, 0));
  solid(rbox(0.43, 0.07, 0.42, 0.028), M.cushion, g, V(0, 0.0, 0.01));
  // back: parachute container, side rails, cushion, harness
  solid(rbox(0.48, 0.94, 0.15, 0.045), M.frame, g, back(0.47, -0.105), -recline);
  for (const k of [1, -1]) solid(rbox(0.035, 0.9, 0.07, 0.01), M.frame, g, back(0.45, -0.02, k * 0.235), -recline);
  solid(rbox(0.36, 0.64, 0.075, 0.034), M.cushion, g, back(0.37, 0.02), -recline);
  for (const k of [1, -1]) {                       // side bolsters, turned in toward the pilot
    const b = solid(rbox(0.06, 0.6, 0.1, 0.028), M.cushion, g, back(0.36, 0.04, k * 0.2), -recline); b.rotation.order = 'YXZ'; b.rotation.y = -k * 0.32;
    const p = solid(rbox(0.06, 0.07, 0.4, 0.028), M.cushion, g, V(k * 0.2, 0.025, 0.01)); p.rotation.z = k * 0.35;
  }
  for (const k of [1, -1]) solid(rbox(0.048, 0.52, 0.012, 0.004), M.strap, g, back(0.42, 0.064, k * 0.1), -recline);
  solid(rbox(0.42, 0.05, 0.012, 0.004), M.strap, g, back(0.08, 0.064), -recline);
  // headrest with its pad and head box
  solid(rbox(0.3, 0.27, 0.2, 0.06), M.frame, g, back(0.99, -0.04), -recline);
  for (const k of [1, -1]) { const w = solid(rbox(0.05, 0.22, 0.12, 0.022), M.frame, g, back(0.98, 0.05, k * 0.13), -recline); w.rotation.order = 'YXZ'; w.rotation.y = -k * 0.4; }
  solid(rbox(0.2, 0.16, 0.045, 0.02), M.pad, g, back(0.97, 0.075), -recline);
  solid(rbox(0.32, 0.05, 0.22, 0.024), M.frame, g, back(1.14, -0.045), -recline);
  // catapult rails behind the back
  for (const k of [1, -1]) solid(new THREE.BoxGeometry(0.026, 1.02, 0.03), M.metal, g, back(0.52, -0.2, k * 0.17), -recline);
  // ejection handle between the knees: a yellow-and-black striped loop
  const loop = new THREE.TorusGeometry(0.06, 0.011, 10, 28, Math.PI);
  solid(loop, M.handle, g, V(0, -0.02, 0.235), -0.5);
  return g;
}

/**
 * Instrument panel: three bezelled colour displays (live, from `screen`: its canvas holds three panes side by side),
 * two up-front displays and the keypad. Origin at the middle of the face; the face looks aft (−z).
 */
export function instrumentPanel(M: CockpitMats, screen: THREE.Texture, w = 0.86, h = 0.48) {
  const g = new THREE.Group();
  solid(rbox(w, h, 0.09, 0.02), M.panel, g, V(0, 0, 0.045));
  const live = new THREE.MeshBasicMaterial({ map: screen, toneMapped: false }); live.userData.realStyle = true;
  const show = (pane: number, x: number, y: number, s: number) => {
    const bz = new THREE.Mesh(aftPlane(s * 1.36, s * 1.36), M.bezel); bz.position.set(x, y, -0.002); bz.receiveShadow = true; g.add(bz);
    const geo = aftPlane(s, s), uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (pane + uv.getX(i)) / 3);
    const sc = new THREE.Mesh(geo, live); sc.position.set(x, y, -0.004); g.add(sc);
  };
  show(1, 0, -0.07, 0.19);                         // primary display: attitude
  show(0, w * 0.29, -0.04, 0.15);                  // left: engines
  show(2, -w * 0.29, -0.04, 0.15);                 // right: gear and stores
  for (const k of [1, -1]) {
    const f = new THREE.Mesh(aftPlane(0.11, 0.08), M.ufd); f.position.set(k * 0.135, 0.165, -0.004); g.add(f);
    solid(new THREE.BoxGeometry(0.13, 0.1, 0.012), M.frame, g, V(k * 0.135, 0.165, -0.002));
  }
  const kp = new THREE.Mesh(aftPlane(0.12, 0.075), M.keypad); kp.position.set(0, 0.168, -0.004); g.add(kp);
  return g;
}

/**
 * Panel for a cockpit without a HUD (F-35): one panoramic touchscreen across the panel showing the whole `screen`
 * canvas, a small standby display under it between two switch panels, and the wheel-shaped gear handle on the left.
 * Origin at the middle of the face; the face looks aft (−z).
 */
export function panoramicPanel(M: CockpitMats, screen: THREE.Texture, w = 0.62, h = 0.36, sw = 0.5, sh = 0.19) {
  const g = new THREE.Group();
  solid(rbox(w, h, 0.09, 0.02), M.panel, g, V(0, 0, 0.045));
  const y = h / 2 - sh / 2 - 0.03;
  solid(rbox(sw + 0.028, sh + 0.028, 0.02, 0.006), M.frame, g, V(0, y, -0.004));
  const live = new THREE.MeshBasicMaterial({ map: screen, toneMapped: false }); live.userData.realStyle = true;
  const sc = new THREE.Mesh(aftPlane(sw, sh), live); sc.position.set(0, y, -0.017); g.add(sc);
  const y2 = y - sh / 2 - 0.065;
  const sb = new THREE.Mesh(aftPlane(0.075, 0.06), M.ufd); sb.position.set(0, y2, -0.004); g.add(sb);
  solid(new THREE.BoxGeometry(0.09, 0.075, 0.012), M.frame, g, V(0, y2, -0.002));
  for (const k of [1, -1]) { const kp = new THREE.Mesh(aftPlane(0.12, 0.075), M.keypad); kp.position.set(k * 0.12, y2, -0.004); g.add(kp); }
  solid(new THREE.BoxGeometry(0.012, 0.012, 0.07), M.metal, g, V(w * 0.38, y2, -0.035));
  solid(new THREE.CylinderGeometry(0.024, 0.024, 0.018, 14).rotateX(Math.PI / 2), M.knob, g, V(w * 0.38, y2, -0.075));
  return g;
}

/** HUD on the glareshield: two posts, a top bar, the combiner glass and its symbology (lit with power) */
export function hud(M: CockpitMats) {
  const g = new THREE.Group();
  for (const k of [1, -1]) solid(new THREE.BoxGeometry(0.014, 0.15, 0.018), M.frame, g, V(k * 0.1, 0.075, 0));
  solid(new THREE.BoxGeometry(0.214, 0.014, 0.036), M.frame, g, V(0, 0.152, -0.012));
  solid(rbox(0.24, 0.04, 0.13, 0.015), M.frame, g, V(0, 0.006, 0.04));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.15), M.glass); glass.position.set(0, 0.08, -0.014); glass.rotation.x = -20 * DEG; glass.renderOrder = 4; g.add(glass);
  const sym = new THREE.Mesh(aftPlane(0.18, 0.14), M.hud); sym.position.set(0, 0.08, -0.018); sym.rotation.x = -20 * DEG; sym.renderOrder = 5; g.add(sym);
  return { group: g, setPower(k: number) { M.hud.opacity = k; } };
}

/** anti-glare glareshield hood over the instrument panel */
export function glareshield(M: CockpitMats, w: number, d: number, rise = 0.06) {
  // a thin shell arched across the panel (axis fore-aft, edges at y = 0) with a rolled lip toward the pilot
  const a = 0.6, R = (w / 2) / Math.sin(a), k = rise / (R * (1 - Math.cos(a)));
  const shape = (g: THREE.BufferGeometry) => g.translate(0, -R * Math.cos(a), 0).scale(1, k, 1);
  const shell = new THREE.CylinderGeometry(R, R, d, 40, 1, true, -a, 2 * a).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(shape(shell), M.shield); m.castShadow = m.receiveShadow = true;
  const lip = new THREE.TorusGeometry(R, 0.012, 8, 40, 2 * a).rotateZ(Math.PI / 2 - a).translate(0, 0, -d / 2);
  const l = new THREE.Mesh(shape(lip), M.shield); l.castShadow = true; m.add(l);
  return m;
}

/** side-stick: boot, shaft and grip with trigger and hat switch */
export function sideStick(M: CockpitMats) {
  const g = new THREE.Group();
  solid(new THREE.CylinderGeometry(0.03, 0.045, 0.04, 16), M.rubber, g, V(0, 0.02, 0));
  solid(new THREE.CylinderGeometry(0.011, 0.011, 0.12, 10), M.metal, g, V(0, 0.09, 0.006), 0.12);
  solid(rbox(0.046, 0.11, 0.058, 0.02), M.grip, g, V(0, 0.185, 0.02), 0.12);
  solid(new THREE.BoxGeometry(0.012, 0.03, 0.012), M.metal, g, V(0, 0.17, 0.052), 0.3);
  solid(new THREE.CylinderGeometry(0.008, 0.008, 0.01, 10), M.frame, g, V(0, 0.244, 0.028));
  return g;
}

/** throttles in their quadrant: twin levers, or one (n = 1) for a single-engine jet */
export function throttles(M: CockpitMats, n = 2) {
  const g = new THREE.Group();
  solid(rbox(0.09, 0.03, 0.2, 0.008), M.frame, g, V(0, 0.015, 0));
  for (const k of n > 1 ? [1, -1] : [0]) {
    solid(new THREE.BoxGeometry(0.014, 0.1, 0.02), M.metal, g, V(k * 0.018, 0.07, 0.02), 0.35);
    solid(rbox(n > 1 ? 0.045 : 0.056, 0.06, 0.07, 0.018), M.grip, g, V(k * 0.024, 0.13, 0.045), 0.2);
  }
  return g;
}

/** a side console: dark box whose top carries the switch panels */
export function consoleBox(M: CockpitMats, w: number, h: number, d: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [M.panel, M.panel, M.console, M.panel, M.panel, M.panel]);
  m.castShadow = m.receiveShadow = true;
  return m;
}

export { solid as cockpitMesh };
