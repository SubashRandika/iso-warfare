// The shooting range: a first-person practice lane for any small arm (Real view only). The weapon leaves its bench
// for the shooter's hands and the camera becomes the shooter's eye (E.setEye with pointer-lock game controls).
//
//   mouse look · left button fires · right button (or Z) aims down the sights · wheel zooms while aiming
//   W A S D walk the bay behind the line · C kneel · Shift holds the breath (steadies the sights for a few seconds)
//   R reloads (magazine out, a full one in, slide released) · X safety · Space starts the drill · Escape leaves
//   1, 2 … change weapon (the next weapon opens straight onto the line) · Q back to the last one
//
// The bullet leaves the muzzle along the sights, zeroed at 15 m, so it goes where the sights point: aimed, the front
// post sits in the rear notch on the screen's centre and the wobble of the hold moves the sights (and the shot); from
// the hip the sights converge on the centre at 9 m. A pistol is carried out in the firing hand alone and the support
// hand comes up to wrap it as it is aimed. A rifle is shouldered, its support hand on the handguard; with an
// optic fitted, aiming ends looking through it: the view magnifies (the wheel sets the power) behind the scope's
// picture (a shader: the tube's black, the eyebox's dark rim, a second-focal-plane reticle with an illuminated
// horseshoe and dot), which rides on the optic's own axis, so sway and recoil move the reticle and the shot together.
// On automatic it keeps firing while the trigger is held. Free practice stands one target up at a time until it is hit; the
// drill (45 s after a shot-timer beep) pops targets at random across 5–25 m for shorter and shorter exposures, a few
// of them no-shoots, and scores the hits (A 5, C 3, D 1, no-shoot −10).
// A precision rifle (RangeGun.site 'field') is taken to the long-distance range outdoors instead (lib/range/field.ts):
// steel from 100 to 1000 m under the real sky, seated at the bench with the bipod rested. There the round flies: it
// leaves at the cartridge's muzzle velocity, slows with drag, drops, drifts with the wind (which the flags show), and lands
// after its time of flight; the scope is zeroed at 100 m and its turret dials elevation (U, J, N) in milliradians, the
// reticle's marks are milliradians at every power. The spotter calls the plate to shoot, and a hit (with the ring of the
// steel coming back late) or where a miss went, in milliradians. The drill calls random plates for two minutes and
// scores a hit by its distance (a point per 100 m).
// Performance: the range is built as soon as the real view is up and its shaders compile off the main thread while
// the weapon still lies on its bench; taking the line waits for that rather than stall on a compile. The hall and
// targets (per bench size) and the hands (per weapon, meshed a little each frame) are kept for the session, and the renderer
// is too (lib/iso/engine.ts), so changing weapon rebuilds almost nothing. No lights are added (the stage lights the
// hall from its sun and a room environment); one ray per shot; holes are one instanced draw.
import * as THREE from 'three';
import type { Engine, EyeSpec } from '../iso/engine';
import type { Sound } from '../core/sound';
import type { StageOverride } from '../real/types';
import { createParticles } from '../real/smoke';
import { buildChamber, rangeLayout, type Chamber, type Surface } from './chamber';
import { buildField, type Field } from './field';
import { createTargets, POINTS, type Target, type Targets } from './targets';
import { buildHands } from './hands';
import type { RangeHud, RangeResult, ShotRecord, ShotZone } from './hud';
import type { BenchSpec, RangeGun } from './types';
import { MODELS } from '../catalog';

const DRILL = 45, DRILL_FIELD = 120, ZERO = 15, HIP_CONVERGE = 9;
const EYE = 1.62, KNEEL = 1.06, SEATED = 1.32;
const FOV = 70, FOV_AIM = 50;
const DEG = Math.PI / 180;
const clamp = THREE.MathUtils.clamp;
const smooth = (t: number) => t * t * (3 - 2 * t);
const win = (t: number, a: number, b: number, c: number, d: number) => smooth(clamp((t - a) / (b - a), 0, 1)) * (1 - smooth(clamp((t - c) / (d - c), 0, 1)));

/** bullet holes on walls, guards and the backstop: one instanced draw, the oldest reused */
function createHoles(max: number) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d')!, g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(8,8,8,1)'); g.addColorStop(0.22, 'rgba(10,10,10,1)'); g.addColorStop(0.32, 'rgba(40,38,36,0.75)'); g.addColorStop(1, 'rgba(60,58,56,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  mat.userData.realStyle = true;
  const geo = new THREE.PlaneGeometry(1, 1), mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.count = 0; mesh.frustumCulled = false; mesh.raycast = () => {}; mesh.renderOrder = 2;
  let n = 0;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), roll = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
  return {
    mesh,
    add(at: THREE.Vector3, normal: THREE.Vector3, size: number) {
      q.setFromUnitVectors(Z, normal).multiply(roll.setFromAxisAngle(Z, Math.random() * Math.PI * 2));
      m.compose(p.copy(at).addScaledVector(normal, 0.0015), q, s.setScalar(size));
      mesh.setMatrixAt(n % max, m); n++; mesh.count = Math.min(n, max); mesh.instanceMatrix.needsUpdate = true;
    },
    clear() { n = 0; mesh.count = 0; },
    dispose() { geo.dispose(); mat.dispose(); tex.dispose(); },
  };
}

/** the hall (or the field) and its targets for each bench size: built once and kept for the session */
type Site = Pick<Chamber, 'group' | 'colliders' | 'lamps' | 'dispose'>;
const kits = new Map<string, { hall: Site; T: Targets; field: Field | null }>();
/** the weapons that have a range, in the catalogue's order (keys 1, 2 …) */
const WEAPONS = MODELS.filter(m => m.actions.some(a => a.id === 'range')).map(m => ({ id: m.id, name: m.tab }));
/** where the shooter stood, handed from one weapon to the next on a weapon change (x from the lane's centre, z from
 *  the bench's back edge: each weapon has its own bench, so the halls differ a little) */
let carry: { from: string; to: string; at: number; x: number; z: number; yaw: number; pitch: number; kneel: boolean } | null = null;
let lastWeapon: string | null = null;
/** how a weapon's range changes weapon: its own catalogue id, and the viewer's way of opening another model */
export interface RangeNav { id: string; open(id: string): void }

export function createRange(E: Engine, snd: Sound, gun: RangeGun, bench: BenchSpec, nav?: RangeNav) {
  const site = gun.site ?? 'hall', L = rangeLayout(bench), kitKey = [site, bench.w, bench.d, bench.cx, bench.cz, bench.height ?? 0.9].join();
  let kit = kits.get(kitKey);
  if (!kit) {
    if (site === 'field') { const f = buildField(L); kit = { hall: f.hall, T: f.T, field: f }; }
    else { const hall = buildChamber(L); kit = { hall, T: createTargets(L, hall.shield), field: null }; }
    kits.set(kitKey, kit);
  }
  const { hall, T } = kit, field = kit.field, drill = field ? DRILL_FIELD : DRILL;
  const hands = buildHands(gun.name, gun.grip, gun.kind === 'rifle' ? gun.fore : undefined); gun.root.add(hands.group);
  const fx = createParticles(E, 900, 320);
  const holes = createHoles(240);
  const root = new THREE.Group(); root.visible = false; root.add(hall.group, T.group, fx.group, holes.mesh); hall.group.visible = true;
  E.scene.add(root);
  const colliders: THREE.Object3D[] = [...hall.colliders, ...T.colliders];
  // ready once the hands are meshed and every shader the range draws has compiled (off the main thread, while the
  // weapon still lies on its bench): taking the line waits for that instead of stalling on a compile
  let ready = false, wantIn = false, dead = false;
  void hands.ready.then(() => Promise.all([E.warm(root, false), E.warm(hands.group, false)])).then(() => {
    if (dead) return;
    ready = true;
    if (wantIn) { wantIn = false; enter(); }
  });
  const ray = new THREE.Raycaster(); ray.far = field ? field.far : 80;

  // ── lighting: house lights up (light theme), or a low-light range lit by the muzzle flash (dark theme) ──
  const focus = new THREE.Vector3(L.lane, L.floor, L.line + 10);
  // the glow threshold sits above every lamp in the hall, so only muzzle flashes and sparks glow: the troffers bloomed
  // into a white haze over the whole hall
  const BRIGHT: StageOverride = { sky: false, env: 'room', envI: 0.45, exposure: 0.95, fog: { color: 0x2c2d2e, density: 0.008 }, bloom: 0.12, bloomT: 5,
    sun: { dir: new THREE.Vector3(0.18, 1, -0.5), intensity: 2.3, color: 0xfff3e6, focus, size: 19 } };
  // low light: only the floods over the target line are left on, dimmed; the hall falls away into the dark
  const LOW: StageOverride = { sky: false, env: 'room', envI: 0.05, exposure: 1.2, fog: { color: 0x07080a, density: 0.016 }, bloom: 0.3, bloomT: 4,
    sun: { dir: new THREE.Vector3(-0.1, 1, 0.45), intensity: 0.32, color: 0xb4c2e0, focus, size: 19 } };
  // outdoors: the sky at midday (light theme) or at dusk (dark), the stage's concrete swapped for the field's own ground,
  // and a thin haze that leaves the 1000 m steel clear
  const FIELD_DAY: StageOverride = { sky: true, env: 'sky', envI: 0, exposure: 0, fog: { color: 0xc6d0da, density: 0.00042 }, bloom: 0, bloomT: 0,
    sun: { dir: new THREE.Vector3(0, 1, 0), intensity: 0, color: 0xffffff, focus: new THREE.Vector3(L.lane, L.floor, L.line - 2), size: 16 }, time: 'day', ground: false };
  const FIELD_DUSK: StageOverride = { ...FIELD_DAY, fog: { color: 0x9a8b82, density: 0.0006 }, time: 'dusk' };
  const low = () => E.theme !== 'light';

  // ── the shooter ──
  const me = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, kneel: 0, kneelOn: false, vel: new THREE.Vector3(), bob: 0 };
  const keys = new Set<string>();
  // right button: a quick click toggles the aim and keeps it (like Z); held, it aims until released
  let aimHeld = false, aimToggle = false, aimK = 0, aimFov = FOV_AIM, rmbAt = 0, rmbWas = false;
  let breath = 1, holding = false, gasp = 0;                // breath held: 5 s of steady sights, then a gasp
  const kick = { rise: 0, vRise: 0, push: 0, vPush: 0, cam: 0 };
  let reload: null | { t0: number; did: number; ready: boolean } = null;
  let pullAt = -1;                                           // the index finger presses the trigger
  let captured = false, refused = false;
  let sec = 0;
  // the field: the scope's elevation turret (mrad), the wind (m/s across the range, + from the shooter's left), the
  // farthest hit
  let dial = 0, windBase = 0, longest = 0;
  const windF = new THREE.Vector3();

  // ── weapon poses in camera space (x right, y up, −z ahead), from whichever sight is in use (irons or the optic) ──
  const P = { rear: gun.sight.rear, front: gun.sight.front, optic: false, holo: false, ring: false, mil: false, zoom: [1, 1] as [number, number], qAds: new THREE.Quaternion(), pAds: new THREE.Vector3(), qHip: new THREE.Quaternion(), pHip: new THREE.Vector3() };
  let poseKey = '';
  function sightPoses() {
    const o = gun.optic?.() ?? null, key = o ? `${o.kind ?? 'scope'}:${o.rear.z.toFixed(4)}` : 'irons';
    if (key === poseKey) return P;
    poseKey = key;
    P.rear = o ? o.rear : gun.sight.rear; P.front = o ? o.front : gun.sight.front; P.optic = !!o; P.zoom = o ? o.zoom : [1, 1];
    P.holo = o?.kind === 'holo'; P.ring = o?.reticle === 'holo'; P.mil = o?.reticle === 'mil';
    power = clamp(power, P.zoom[0], P.zoom[1]);
    const relief = o ? o.relief : gun.relief;
    const qLevel = new THREE.Quaternion().setFromUnitVectors(P.front.clone().sub(P.rear).normalize(), new THREE.Vector3(0, 0, 1));
    P.qAds.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI).multiply(qLevel);
    P.pAds.set(0, 0, -relief).sub(P.rear.clone().applyQuaternion(P.qAds));
    const hipRear = gun.hip?.clone() ?? new THREE.Vector3(0.115, -0.125, -gun.relief * 0.8);
    P.qHip.setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, -HIP_CONVERGE).sub(hipRear).normalize()).multiply(P.qAds);
    P.pHip.copy(hipRear).sub(P.rear.clone().applyQuaternion(P.qHip));
    return P;
  }
  // ── the scope's picture: drawn straight in clip space over everything, centred where the optic's axis points; for a
  // holographic sight only its ring and dot (uTube 0), sized by uRet (on screen a reticle grows with the power) ──
  let power = 4, scoped = false;
  const scopeMat = new THREE.ShaderMaterial({
    uniforms: { uAspect: { value: 1 }, uC: { value: new THREE.Vector2() }, uR: { value: 0.47 }, uIllum: { value: 3 }, uTube: { value: 1 }, uRing: { value: 0 }, uRet: { value: 1 }, uMil: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `uniform float uAspect, uR, uIllum, uTube, uRing, uRet, uMil; uniform vec2 uC; varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5 - uC) * vec2(uAspect, 1.0);
        float r = length(p), inside = uTube > 0.5 ? smoothstep(uR, uR - 0.01, r) : 1.0;
        float rim = smoothstep(uR * 0.7, uR, r) * 0.6 * uTube;                       // the eyebox's dark edge
        float px = fwidth(p.x) * 1.2;
        float cross = uTube * (1.0 - uRing) * step(uMil, 0.0);                        // a scope's own crosshair
        float thick = cross * (step(abs(p.y), 0.0055) * step(uR * 0.42, abs(p.x)) + step(abs(p.x), 0.0055) * step(uR * 0.42, -p.y));
        float fine = cross * ((1.0 - smoothstep(0.0, px, abs(p.y))) * step(abs(p.x), uR * 0.42) * step(0.04, abs(p.x))
                   + (1.0 - smoothstep(0.0, px, abs(p.x))) * step(-p.y, uR * 0.42) * step(0.04, -p.y));
        float rr = 0.03 * uRet, w = max(0.0012 * uRet, px);
        float shoe = (1.0 - smoothstep(w, w + px, abs(r - rr))) * mix(step(-0.016 * uRet, p.y), 1.0, uRing) * step(uMil, 0.0);   // horseshoe open below, or a whole ring
        // a first-focal-plane milliradian grid (uMil: one milliradian in screen heights): fine stadia through the centre,
        // a mark every mil (longer every fifth), half-mil marks below for holdover, heavy posts beyond ten mils
        float grid = 0.0;
        if (uMil > 0.0) {
          float ax = abs(p.x), ay = abs(p.y), lim = uMil * 10.0;
          float stadia = (1.0 - smoothstep(0.0, px, ay)) * step(ax, uR) + (1.0 - smoothstep(0.0, px, ax)) * step(ay, uR);
          float posts = step(ay, 0.0035) * step(lim, ax) + step(ax, 0.0035) * step(lim, ay);
          float mx = abs(fract(p.x / uMil + 0.5) - 0.5) * uMil, my = abs(fract(p.y / uMil + 0.5) - 0.5) * uMil;
          float fx = step(abs(fract(p.x / (uMil * 5.0) + 0.5) - 0.5), 0.1), fy = step(abs(fract(p.y / (uMil * 5.0) + 0.5) - 0.5), 0.1);
          float tx = (1.0 - smoothstep(0.0, px * 1.3, mx)) * step(ay, uMil * mix(0.18, 0.4, fx)) * step(ax, lim);
          float ty = (1.0 - smoothstep(0.0, px * 1.3, my)) * step(ax, uMil * mix(0.18, 0.4, fy)) * step(ay, lim);
          float hy = abs(fract(p.y / (uMil * 0.5) + 0.5) - 0.5) * uMil * 0.5;
          float th = (1.0 - smoothstep(0.0, px, hy)) * step(ax, uMil * 0.09) * step(p.y, 0.0) * step(ay, lim);
          grid = clamp(stadia + posts + tx + ty + th, 0.0, 1.0);
        }
        float dotc = 1.0 - smoothstep(0.0022 * min(uRet, 1.0), 0.0022 * min(uRet, 1.0) + px, r);
        float black = clamp(thick + fine + grid, 0.0, 1.0) * inside, red = clamp(shoe + dotc, 0.0, 1.0) * inside;
        float a = uTube > 0.5 ? max(max(1.0 - inside, rim * inside), max(black, red)) : red;
        vec3 col = vec3(1.0, 0.03, 0.015) * uIllum * red;
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  });
  scopeMat.userData.realStyle = true;
  const scopeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), scopeMat);
  scopeQuad.frustumCulled = false; scopeQuad.renderOrder = 999; scopeQuad.visible = false; scopeQuad.raycast = () => {}; root.add(scopeQuad);
  /** in the scope the rifle and hands are not drawn (they are behind the eyepiece): their meshes move to layer 1 */
  function setScoped(v: boolean) {
    if (v === scoped) return;
    scoped = v; scopeQuad.visible = v;
    gun.root.traverse(o => { if ((o as THREE.Mesh).isMesh) o.layers.set(v ? 1 : 0); });
  }
  const scopeFov = () => 2 * Math.atan(Math.tan(FOV_AIM / 2 * DEG) / power) / DEG;
  let trigHeld = false;

  // entry: the eye walks from the orbit view to the line while the weapon comes up off the bench
  let entryT0 = 0, entering = false, swapIn = false;
  let leaving: { id: string; t0: number } | null = null;     // lowering this weapon before changing to another
  const from = { eye: new THREE.Vector3(), eyeQ: new THREE.Quaternion(), gun: new THREE.Vector3(), gunQ: new THREE.Quaternion() };
  const shadows: [THREE.Mesh, boolean, boolean][] = [];

  // ── drill state ──
  type Phase = RangeHud['phase'];
  let phase: Phase = 'setup';
  const stats = { score: 0, shots: 0, hits: 0, presented: 0, noShoot: 0, zones: { A: 0, C: 0, D: 0 }, reactions: [] as number[] };
  let shots: ShotRecord[] = [], shotN = 0, lastShot = 0, beepAt = 0, liveAt = 0, nextPop = 0, lastPopped = -1;
  let hit = { seq: 0, zone: 'M' as ShotZone }, called = { seq: 0, text: '' }, result: RangeResult | null = null;
  const call = (text: string) => { called = { seq: called.seq + 1, text }; };
  const bestKey = `iso-warfare-range-best-${gun.name}`;
  const loadBest = () => { try { return Number(localStorage.getItem(bestKey)) || 0; } catch { return 0; } };

  // ── sound: an indoor room tail under the weapon's own report, the shot timer, hits ──
  let roomIn: GainNode | null = null;
  function roomBus() {
    const c = snd.audio; if (!c || !snd.out || !snd.enabled) return null;
    if (!roomIn) {
      const len = Math.floor(c.sampleRate * (field ? 3.2 : 1.3)), ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch); let lp = 0;
        if (field) {                                       // outdoors: no room, only echoes off the shelter, the trees and the hills
          for (const [ms, g, w] of [[38, 0.35, 0.02], [420, 0.2, 0.09], [1150, 0.14, 0.16], [2100, 0.08, 0.24]]) {
            const o = Math.floor(ms / 1000 * c.sampleRate) + ch * 211;
            for (let i = 0; i < w * c.sampleRate && o + i < len; i++) { lp += (Math.random() * 2 - 1 - lp) * 0.08; d[o + i] += lp * g * 3 * Math.exp(-i / c.sampleRate / (w * 0.4)); }
          }
        } else {
          for (let i = 0; i < len; i++) { const t = i / c.sampleRate; lp += (Math.random() * 2 - 1 - lp) * 0.35; d[i] = lp * Math.exp(-t * 4.2) * (t < 0.004 ? t / 0.004 : 1); }
          for (const [ms, g] of [[9, 0.8], [17, 0.6], [26, 0.5], [41, 0.35], [63, 0.25]]) d[Math.floor(ms / 1000 * c.sampleRate) + ch * 7] += g;   // walls, ceiling, booths
        }
      }
      const conv = c.createConvolver(); conv.buffer = ir;
      roomIn = c.createGain(); const wet = c.createGain(); wet.gain.value = 0.5;
      roomIn.connect(conv).connect(wet).connect(snd.out);
    }
    return roomIn;
  }
  function roomShot(loud: number) {
    const bus = roomBus(), c = snd.audio; if (!bus || !c) return;
    const t = c.currentTime, src = snd.noise(0.5), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.value = 3600;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.2 * loud, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    src.connect(f).connect(g).connect(bus); src.start(t); src.stop(t + 0.4);
    if (!field) snd.tone(64, 0.42, 0.24 * loud, { type: 'sine', to: 32 });     // the hall's boom
  }
  const att = (d: number) => field ? 1 / (1 + d / 160) : 1 / (1 + d / 9);
  const beep = () => { snd.tone(3000, 0.32, 0.075, { type: 'square' }); snd.tone(3000, 0.32, 0.04, { type: 'sine' }); };

  // ── the target line ──
  const groundAt = (x: number, z: number) => {
    const i = Math.round((x - L.lane) / L.laneW), cx = L.lane + i * L.laneW, hw = (L.bench.x1 - L.bench.x0) / 2;
    const z0 = L.bench.z0;
    return Math.abs(i) <= 2 && Math.abs(x - cx) < hw && z > z0 && z < L.line ? 0 : L.floor;
  };
  function popOne(kind: 'hostile' | 'ns', until: number) {
    const free = T.list.filter(t => t.state === 'down' && t.i !== lastPopped);
    if (!free.length) return;
    // the field's free practice works out along the line, 100 m at a time; otherwise any target at random
    const t = field && phase === 'free' ? T.list[(lastPopped + 1) % T.list.length] : free[Math.floor(Math.random() * free.length)];
    T.pop(t, kind, sec, until); lastPopped = t.i;
    if (kind === 'hostile' && phase === 'live') stats.presented++;
    if (field) { call(`Target · ${t.dist} m · dial ${dopeFor(t.dist).elev.toFixed(1)}`); return; }
    const a = att(t.dist + 2);                                // the lifter's motor and its stop
    snd.tone(150, 0.26, 0.03 * a, { type: 'sawtooth', to: 230 }); snd.click(0.3, 0.5);
  }
  function standing() { return T.list.filter(t => t.state !== 'down'); }

  function startDrill() {
    if (phase === 'setup' || reload?.ready) return;
    T.list.forEach(t => T.drop(t, sec));
    Object.assign(stats, { score: 0, shots: 0, hits: 0, presented: 0, noShoot: 0, zones: { A: 0, C: 0, D: 0 }, reactions: [] });
    shots = []; shotN = 0; result = null; longest = 0; phase = 'standby'; call('Shooter ready?');
    beepAt = sec + 2.2 + Math.random() * 1.6;
    later(1.1, () => { if (phase === 'standby') call('Standby'); });
  }
  function endDrill() {
    phase = 'done'; T.list.forEach(t => T.drop(t, sec)); call('Cease fire');
    const best = loadBest(), newBest = stats.score > best && stats.shots > 0;
    if (newBest) try { localStorage.setItem(bestKey, String(stats.score)); } catch { /* private mode */ }
    const r = stats.reactions;
    result = {
      score: stats.score, best: Math.max(best, stats.score), newBest, shots: stats.shots, hits: stats.hits, presented: stats.presented, noShoot: stats.noShoot,
      zones: { ...stats.zones }, accuracy: stats.shots ? Math.round(stats.hits / stats.shots * 100) : 0,
      reaction: r.length ? Math.round(r.reduce((a, b) => a + b, 0) / r.length * 100) / 100 : 0, longest,
    };
    snd.chime(true);
  }
  const timers: [number, () => void][] = [];
  const later = (s: number, f: () => void) => { timers.push([sec + s, f]); };

  // ── shooting ──
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), nrm = new THREE.Vector3();
  function fire() {
    if (!on || phase === 'setup' || entering) return;
    if (reload) return;
    const r = gun.trigger();
    if (r !== 'busy') pullAt = sec;
    if (r !== 'shot' && r !== 'busy') trigHeld = false;          // an empty or safe weapon stops an automatic burst
    if (r === 'shot') shot();
    else if (r === 'safe') call(gun.state().mode ? 'Safe · X selector' : 'Safety on · X');
    else if (r === 'locked') call(gun.kind === 'rifle' ? 'Bolt locked · R' : 'Slide locked · R');
    else if (r === 'click') call(gun.state().rounds > 0 && gun.state().magIn ? (gun.bolt ? 'Work the bolt · R' : 'Rack it · R') : 'Empty · R');
  }
  function shot() {
    gun.root.updateMatrixWorld(true);
    const S = sightPoses(), rw = gun.root.localToWorld(tmpA.copy(S.rear)), fw = gun.root.localToWorld(tmpB.copy(S.front)), mw = gun.root.localToWorld(tmpC.copy(gun.muzzle));
    const sd = fw.sub(rw).normalize();
    if (field) { const m = mw.clone(), d = sd.clone(); flight(m.clone(), d.clone(), S); afterShot(m, d); return; }
    const dir = rw.addScaledVector(sd, ZERO).sub(mw).normalize();
    // mechanical spread (about 2 MOA), more from the hip and on the move
    const spread = 0.0006 + (1 - aimK) * 0.0035 + Math.min(1, me.vel.length() / 2) * 0.004;
    dir.x += (Math.random() - 0.5) * 2 * spread; dir.y += (Math.random() - 0.5) * 2 * spread; dir.z += (Math.random() - 0.5) * 2 * spread; dir.normalize();
    ray.set(mw, dir);
    const h = ray.intersectObjects(colliders, false).find(i => { const t = i.object.userData.target as Target | undefined; return !t || T.exposed(t); });
    let zone: ShotZone = 'M', dist = 0;
    if (h) {
      dist = Math.round(h.point.distanceTo(mw));
      nrm.copy(h.face?.normal ?? dir.clone().negate()).transformDirection(h.object.matrixWorld);
      if (nrm.dot(dir) > 0) nrm.negate();
      const t = h.object.userData.target as Target | undefined;
      if (t) { zone = T.hit(t, h.point); struck(t, zone); impact(h.point, nrm, dir, 'paper', h.distance); }
      else {
        const s = (h.object.userData.surface ?? 'concrete') as Surface;
        if (s === 'steel') zone = 'S';
        impact(h.point, nrm, dir, s, h.distance);
        holes.add(h.point, nrm, s === 'steel' ? 0.02 : s === 'rubber' ? 0.016 : 0.022);
      }
      if (zone !== 'M') hit = { seq: hit.seq + 1, zone };
    }
    const scoring = phase === 'live';
    if (scoring) stats.shots++;
    shots.push({ n: ++shotN, split: Math.round((sec - lastShot) * 100) / 100, zone, dist }); if (shots.length > 40) shots.shift();
    lastShot = sec;
    afterShot(mw, dir);
  }
  function afterShot(mw: THREE.Vector3, dir: THREE.Vector3) {
    // recoil: the muzzle flips and the gun drives back into the hands; the eye follows a little and recovers most of it
    const r = 0.85 + Math.random() * 0.3, hip = 1 + (1 - aimK) * 0.35;
    kick.vRise += gun.recoil.rise * 30 * r * hip; kick.vPush += gun.recoil.push * 30 * r;
    // what stays after the kick: a pistol or rifle held in the hands ends up off its aim, but a rifle rested on a bipod
    // settles back almost where it was (left as it was, it climbed about 2 mils a shot and missed the next plate)
    const stays = field ? (gun.bipod?.() && me.kneel < 0.2 ? 0.04 : 0.35) : 1;
    kick.cam += (gun.recoil.cam ?? 0.85 * DEG) * r * hip; me.yaw += (Math.random() - 0.5) * 0.3 * DEG * stays; me.pitch += 0.12 * DEG * r * stays;
    roomShot(gun.loud?.() ?? 1);
    // a wisp of powder smoke from the muzzle
    for (let i = 0; i < 3; i++) fx.smoke.emit(mw.clone().addScaledVector(dir, 0.02 + i * 0.03), { v: dir.clone().multiplyScalar(0.6 + i * 0.3).add(new THREE.Vector3(0, 0.1, 0)), s0: 0.03, s1: 0.3, life: 1.5 + Math.random(), c: [0.72, 0.72, 0.7], a: 0.22, drag: 2.4, rise: 0.22 });
  }
  function struck(t: Target, zone: ShotZone) {
    if (field) {                                               // a plate: the called one counts, and the next is called
      if (t.state !== 'up') return;
      t.until = sec + 0.7;
      if (phase !== 'live') return;
      stats.score += Math.round(t.dist / 100); stats.hits++; longest = Math.max(longest, t.dist);
      stats.reactions.push(Math.max(0, sec - t.upAt));
      return;
    }
    t.until = sec + 0.12;                                      // knocked down a moment after the hit
    const a = att(t.dist), delay = t.dist / 370 + t.dist / 343;
    snd.burst(0.05, 0.2 * a, { freq: 700, q: 1.1, at: delay }); snd.tone(170, 0.07, 0.07 * a, { type: 'triangle', at: delay });
    if (phase !== 'live') return;
    stats.score += POINTS[zone];
    if (zone === 'NS') { stats.noShoot++; call('No-shoot · −10'); }
    else { stats.hits++; if (zone === 'A' || zone === 'C' || zone === 'D') stats.zones[zone]++; if (t.hits === 1) stats.reactions.push(Math.max(0, sec - t.upAt)); }
  }
  /** dust, chips and sparks where a round strikes, and the sound coming back from there */
  function impact(p: THREE.Vector3, n: THREE.Vector3, dir: THREE.Vector3, s: Surface, d: number) {
    const rnd = () => new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    // on the field the round has already flown (this runs when it lands): only the sound's own way back is late, and the
    // dust and sparks grow with the distance so that they read in the scope
    const a = att(d), delay = field ? d / 343 : d / 370 + d / 343, big = field ? 1 + d / 140 : 1;
    const dust = (c: readonly [number, number, number], k: number, size: number) => {
      for (let i = 0; i < k; i++) fx.smoke.emit(p.clone().addScaledVector(n, 0.02 * big), { v: n.clone().multiplyScalar(0.5 + Math.random() * 0.8).add(rnd().multiplyScalar(0.5)).multiplyScalar(Math.sqrt(big)), s0: size * 0.3 * big, s1: size * (1 + Math.random()) * big, life: 0.7 + Math.random() * 0.8 + (big - 1) * 0.12, c, a: 0.75, drag: 3.2, rise: 0.04 });
    };
    if (s === 'steel') {
      const out = dir.clone().reflect(n);
      for (let i = 0; i < 10; i++) fx.fire.emit(p.clone(), { v: out.clone().multiplyScalar(2 + Math.random() * 4).add(rnd().multiplyScalar(3)), s0: 0.022 * big, s1: 0.006 * big, life: 0.1 + Math.random() * 0.16, c: [9, 5.5, 2.2], c1: [2, 0.4, 0.05], drag: 2, rise: -9 });
      dust([0.5, 0.5, 0.48], 2, 0.12);
      snd.tone(2100 + Math.random() * 700, field ? 1.4 : 0.9, 0.11 * a, { at: delay }); snd.tone(3500, 0.45, 0.04 * a, { at: delay }); snd.burst(0.03, 0.12 * a, { freq: 4000, at: delay });
    } else if (s === 'rubber') { dust([0.1, 0.1, 0.1], 3, 0.16); snd.burst(0.05, 0.08 * a, { type: 'lowpass', freq: 500, at: delay }); }
    else if (s === 'dirt') { dust([0.42, 0.36, 0.28], 6, 0.3); }
    else if (s === 'paper') { dust([0.55, 0.43, 0.3], 2, 0.06); }
    else if (s === 'concrete') { dust([0.56, 0.56, 0.54], 5, 0.22); snd.burst(0.04, 0.14 * a, { freq: 2500, q: 0.7, at: delay }); }
    else { dust([0.3, 0.3, 0.3], 3, 0.12); snd.burst(0.04, 0.08 * a, { freq: 1200, at: delay }); }
  }

  // ── the field: the round's flight (drag, gravity, the wind), stepped until it meets the ground, a plate or a structure ──
  const G = 9.81, STEP = 0.004;
  const fa = new THREE.Vector3(), fv = new THREE.Vector3(), fp = new THREE.Vector3(), fq = new THREE.Vector3(), rel = new THREE.Vector3();
  /** the bore's angle above the line of sight that puts the round back on it at the zero distance (h: sight over bore) */
  function zeroAngle(v0: number, k: number, zero: number, h: number) {
    let x = 0, y = 0, vx = v0, vy = 0;
    while (x < zero) { const sp = Math.hypot(vx, vy); vx += -k * sp * vx * STEP; vy += (-k * sp * vy - G) * STEP; x += vx * STEP; y += vy * STEP; }
    return (h - y) / zero;
  }
  /** the spotter's data for a distance: the elevation to dial (mrad over the zero) and the hold for the wind as it blows
   *  now (mrad, + to the left: into a wind from the left); the flight time behind the hold is cached per distance */
  const dopes = new Map<string, { elev: number; tof: number }>();
  function dopeFor(D: number) {
    const B = gun.ballistics?.() ?? { v0: 850, k: 0.0005, zero: 100 }, key = `${B.v0}:${B.k}:${B.zero}:${D}`, h = sightPoses().rear.y - gun.muzzle.y;
    let d = dopes.get(key);
    if (!d) {
      let x = 0, vx = B.v0, t = 0;
      while (x < D) { vx += -B.k * vx * vx * STEP; x += vx * STEP; t += STEP; }
      d = { elev: Math.max(0, (zeroAngle(B.v0, B.k, D, h) - zeroAngle(B.v0, B.k, B.zero, h)) * 1000), tof: t };
      dopes.set(key, d);
    }
    // the wind drifts the round by its speed times the flight's lag behind a flight in a vacuum
    const drift = windF.x * (d.tof - D / B.v0);
    return { elev: d.elev, hold: -drift / D * 1000 };
  }
  function flight(mw: THREE.Vector3, sd: THREE.Vector3, S: ReturnType<typeof sightPoses>) {
    const B = gun.ballistics?.() ?? { v0: 850, k: 0.0005, zero: 100 };
    const up = tmpA.set(0, 1, 0).transformDirection(gun.root.matrixWorld), side = tmpB.set(1, 0, 0).transformDirection(gun.root.matrixWorld);
    const lift = zeroAngle(B.v0, B.k, B.zero, S.rear.y - gun.muzzle.y) + dial / 1000;
    // the rifle and cartridge's own dispersion (about half a minute of angle), more off the rest and on the move
    const spread = 0.00008 + (1 - aimK) * 0.003 + Math.min(1, me.vel.length() / 2) * 0.004;
    const dir = sd.addScaledVector(up, lift + (Math.random() - 0.5) * 2 * spread).addScaledVector(side, (Math.random() - 0.5) * 2 * spread).normalize();
    const called = T.list.find(t => t.state === 'up') ?? null;
    fp.copy(mw); fv.copy(dir).multiplyScalar(B.v0);
    let t = 0, cross: THREE.Vector3 | null = null;
    let land: null | { at: THREE.Vector3; n: THREE.Vector3; s: Surface; target: Target | null; t: number } = null;
    while (t < 3.4 && !land) {
      rel.copy(fv).sub(windF); const sp = rel.length();
      fa.copy(rel).multiplyScalar(-B.k * sp); fa.y -= G;
      fv.addScaledVector(fa, STEP); fq.copy(fp).addScaledVector(fv, STEP); t += STEP;
      if (called && !cross && fp.z < called.z && fq.z >= called.z) cross = fp.clone().lerp(fq, (called.z - fp.z) / (fq.z - fp.z));
      const seg = fq.distanceTo(fp);
      ray.set(fp, tmpC.copy(fq).sub(fp).divideScalar(seg)); ray.far = seg;
      const h = ray.intersectObjects(colliders, false).find(i => { const tg = i.object.userData.target as Target | undefined; return !tg || T.exposed(tg); });
      if (h) {
        const n = (h.face?.normal ?? tmpC.clone().negate()).clone().transformDirection(h.object.matrixWorld); if (n.dot(fv) > 0) n.negate();
        const tg = (h.object.userData.target as Target | undefined) ?? null;
        land = { at: h.point.clone(), n, s: tg ? 'steel' : (h.object.userData.surface ?? 'concrete') as Surface, target: tg, t: t - STEP + STEP * h.distance / seg };
      } else if (fq.y <= field!.groundY(fq.x, fq.z)) {
        let a = 0, b = 1;                                      // where the segment meets the ground
        for (let i = 0; i < 8; i++) { const m = (a + b) / 2, q = fp.clone().lerp(fq, m); if (q.y <= field!.groundY(q.x, q.z)) b = m; else a = m; }
        const at = fp.clone().lerp(fq, b); at.y = field!.groundY(at.x, at.z);
        land = { at, n: new THREE.Vector3(0, 1, 0), s: 'dirt', target: null, t: t - STEP + STEP * b };
      }
      fp.copy(fq);
    }
    const scoring = phase === 'live', split = Math.round((sec - lastShot) * 100) / 100, n = ++shotN;
    if (scoring) stats.shots++;
    lastShot = sec;
    const bullet = fv.clone().normalize();
    later(land ? land.t : 2, () => {
      let zone: ShotZone = 'M', dist = 0;
      if (land) {
        dist = Math.round(land.at.distanceTo(mw));
        impact(land.at, land.n, bullet, land.s, dist);
        if (land.target) { zone = T.hit(land.target, land.at); struck(land.target, zone); hit = { seq: hit.seq + 1, zone }; }
        else if (land.s !== 'dirt') holes.add(land.at, land.n, 0.02);
      }
      shots.push({ n, split, zone, dist }); if (shots.length > 40) shots.shift();
      // the spotter: a hit on the called plate (or another), or where the round went past the called one, in mils
      if (land?.target) call(land.target === called ? `Hit · ${land.target.dist} m` : `Hit · the ${land.target.dist} m plate`);
      else if (called && cross) {
        const c = (T as Targets & { centre?(t: Target): THREE.Vector3 }).centre?.(called) ?? new THREE.Vector3(called.x, cross.y, called.z);
        const my = (cross.y - c.y) / called.dist * 1000, mx = (cross.x - c.x) / called.dist * 1000;
        const parts = [Math.abs(my) >= 0.1 ? `${Math.abs(my).toFixed(1)} ${my > 0 ? 'high' : 'low'}` : '', Math.abs(mx) >= 0.1 ? `${Math.abs(mx).toFixed(1)} ${mx > 0 ? 'left' : 'right'}` : ''].filter(Boolean);
        call(`Miss · ${parts.join(' · ') || 'edge'} (mil)`);
      } else if (called && land) call(`Miss · short, ${dist} m`);
      else if (!land) call('Miss · over');
    });
  }

  // ── projectiles the weapon flies itself (a 40 mm grenade): what a segment of its path meets, and its burst ──
  const castRay = new THREE.Raycaster();
  function cast(from: THREE.Vector3, to: THREE.Vector3) {
    const dir = to.clone().sub(from), len = dir.length();
    if (len < 1e-6) return null;
    castRay.set(from, dir.divideScalar(len)); castRay.far = len;
    const h = castRay.intersectObjects(colliders, false).find(i => { const t = i.object.userData.target as Target | undefined; return !t || T.exposed(t); });
    if (!h) return null;
    const n = (h.face?.normal ?? dir.clone().negate()).clone().transformDirection(h.object.matrixWorld);
    if (n.dot(dir) > 0) n.negate();
    return { point: h.point.clone(), normal: n };
  }
  /** a grenade bursting: fire and smoke, a scorch, the crack and the hall's boom (late by the distance), targets near
   *  it knocked flat (scored as C hits, a no-shoot as a no-shoot) */
  function blast(at: THREE.Vector3, surface: THREE.Vector3) {
    const rnd = () => new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    // the cloud throws out of the surface and back toward the line (off the berm's slope it would bury itself in the back
    // wall), then billows up where it burst, over the target shield (thrown hard, it vanished behind the baffles)
    const back = eyePos.clone().sub(at).setY(0).normalize();
    const n = surface.clone().addScaledVector(back, 0.7).add(new THREE.Vector3(0, 0.4, 0)).normalize();
    for (let i = 0; i < 44; i++) fx.fire.emit(at.clone().addScaledVector(n, 0.15), { v: n.clone().multiplyScalar(1 + Math.random() * 2.5).add(rnd().multiplyScalar(4)), s0: 0.6, s1: 0.15, life: 0.14 + Math.random() * 0.3, c: [9, 5.5, 2.2], c1: [2, 0.4, 0.05], drag: 4, rise: 1 });
    for (let i = 0; i < 56; i++) fx.smoke.emit(at.clone().addScaledVector(back, 0.8 + Math.random() * 0.8).add(rnd().multiplyScalar(0.5)).add(new THREE.Vector3(0, 0.4 + Math.random() * 1.6, 0)), { v: n.clone().multiplyScalar(0.4 + Math.random() * 1.2).add(rnd().multiplyScalar(0.9)).add(new THREE.Vector3(0, 0.8, 0)), s0: 0.7, s1: 2.6 + Math.random() * 1.6, life: 2.5 + Math.random() * 2, c: [0.95, 0.9, 0.84], a: 0.85, drag: 2.2, rise: 0.3 });
    holes.add(at, surface, 0.32);
    const d = at.distanceTo(eyePos), a = att(d), delay = d / 343;
    snd.burst(0.6, 1.0 * a, { type: 'lowpass', freq: 650, at: delay }); snd.burst(0.07, 0.75 * a, { freq: 2600, q: 0.6, at: delay });
    snd.tone(42, 1.0, 0.55 * a, { type: 'sine', to: 22, at: delay });
    roomShot(1.5);
    kick.cam += 0.5 * DEG;
    const tp = new THREE.Vector3();
    for (const t of T.list) if (T.exposed(t) && t.hinge.getWorldPosition(tp) && Math.hypot(tp.x - at.x, tp.z - at.z) < 3.2) struck(t, t.kind === 'ns' ? 'NS' : 'C');
  }

  // ── reload: magazine out, a full one in, slide released (or racked); entering the lane loads and makes ready ──
  function startReload(ready = false) {
    if (reload || entering && !ready) return;
    const s = gun.state();
    if (!ready && s.magIn && s.rounds === s.cap && s.chamber) return;
    reload = { t0: sec, did: 0, ready };
    if (!ready) call('Reload');
  }
  function stepReload() {
    if (!reload) return;
    const t = sec - reload.t0, s = gun.state();
    if (reload.did === 0 && t > 0.2) { reload.did = 1; if (s.magIn && (s.rounds < s.cap || !reload.ready)) gun.magazine(); }
    if (reload.did === 1 && t > 0.85 && !s.busy) { reload.did = 2; if (!gun.state().magIn) gun.magazine(); }
    if (reload.did === 2 && t > 1.3 && !s.busy) { reload.did = 3; if (s.locked || !s.chamber) gun.rack(); }
    if (reload.did === 3 && t > 1.75 && !s.busy) {
      if (reload.ready) { if (gun.state().safe) gun.safety(); phase = 'free'; call('Free practice'); nextPop = sec + 0.6; }
      reload = null;
    }
  }
  const reloadK = () => reload ? win(sec - reload.t0, 0, 0.3, 1.45, 1.8) : 0;

  // ── the eye and the weapon in the hands ──
  const eyePos = new THREE.Vector3(), eyeEuler = new THREE.Euler(0, 0, 0, 'YXZ'), eyeQ = new THREE.Quaternion();
  function shooterEye(pos: THREE.Vector3, quat: THREE.Quaternion) {
    const h = field ? THREE.MathUtils.lerp(SEATED, EYE, smooth(me.kneel)) : THREE.MathUtils.lerp(EYE, KNEEL, smooth(me.kneel)), sp = Math.min(1, me.vel.length() / 2);
    pos.set(me.pos.x + Math.cos(me.bob) * 0.012 * sp, L.floor + h + Math.abs(Math.sin(me.bob)) * 0.018 * sp, me.pos.z);
    quat.setFromEuler(eyeEuler.set(me.pitch + kick.cam - reloadK() * 0.12, me.yaw + Math.PI, 0));
  }
  const gp = new THREE.Vector3(), gq = new THREE.Quaternion(), dq = new THREE.Quaternion(), de = new THREE.Euler(0, 0, 0, 'YXZ'), pivot = new THREE.Vector3();
  function handPose(cam: THREE.Camera) {
    const k = smooth(aimK), S = sightPoses();
    gp.lerpVectors(S.pHip, S.pAds, k); gq.slerpQuaternions(S.qHip, S.qAds, k);
    // the hold's wobble and breathing, the recoil flip and the reload tilt, all about the grip
    const steady = holding ? 0.2 : 1, sp = Math.min(1, me.vel.length() / 2);
    const rested = field && gun.bipod?.() && me.kneel < 0.2 && sp < 0.1 ? 0.14 : 1;   // seated, the bipod on the bench
    const A = 0.0021 * (k > 0.5 ? 1 : 1.8) * steady * rested * (gasp > 0 ? 2.4 : 1) * (1 + sp * 2.5) * (1 - (field ? 0 : me.kneel * 0.35));
    const sYaw = A * (Math.sin(sec * 0.9) * 0.6 + Math.sin(sec * 2.3 + 1) * 0.3 + Math.sin(sec * 5.3) * 0.1);
    const sPitch = A * (Math.sin(sec * 1.27 + 0.5) * 0.6 + Math.sin(sec * 0.53) * 0.4) + (holding ? 0 : Math.sin(sec * 1.6) * A * 0.6);
    const rk = smooth(reloadK());
    pivot.copy(gun.grip.web).applyQuaternion(gq).add(gp);
    dq.setFromEuler(de.set(kick.rise + sPitch + rk * 0.42, sYaw + rk * 0.25, rk * 0.62));
    gp.sub(pivot).applyQuaternion(dq).add(pivot);
    gq.premultiply(dq);
    gp.z += kick.push + rk * 0.14; gp.y -= rk * 0.07; gp.x -= rk * 0.03;
    gp.x += Math.sin(me.bob) * 0.008 * sp; gp.y += Math.abs(Math.cos(me.bob)) * 0.01 * sp;
    gun.root.position.copy(gp); cam.localToWorld(gun.root.position);
    gun.root.quaternion.copy(cam.quaternion).multiply(gq);
  }

  /** the weapon dropped below the view and tipped down, k = 0 (in the hands) … 1 (out of sight) */
  function lower(cam: THREE.Camera, k: number) {
    const e = smooth(clamp(k, 0, 1));
    gun.root.position.add(tmpA.set(0.05 * e, -0.34 * e, 0.08 * e).applyQuaternion(cam.quaternion));
    gun.root.quaternion.premultiply(dq.setFromAxisAngle(tmpB.set(1, 0, 0).applyQuaternion(cam.quaternion), -0.9 * e));
  }
  /** lower this weapon and change to another (on the line, not mid-entry) */
  function swapTo(id: string | undefined) {
    if (!nav || !id || id === nav.id || leaving || entering) return;
    leaving = { id, t0: sec }; aimHeld = aimToggle = trigHeld = false; reload = null;
    snd.click(0, 0.45);
  }

  // ── a laser aiming module: its dot lands on whatever the beam meets (walls, targets, the floor) ──
  const laserDot = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d')!, g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.6, 9, 1.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    mat.userData.realStyle = true;
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 16), mat); m.visible = false; m.raycast = () => {}; m.renderOrder = 3; root.add(m);
    return { m, dispose() { m.geometry.dispose(); mat.dispose(); tex.dispose(); } };
  })();
  const laserRay = new THREE.Raycaster(); laserRay.far = 60;
  function aimLaser() {
    const l = on && !entering ? gun.laser?.() ?? null : null;
    laserDot.m.visible = false;
    if (!l) return;
    const from = gun.root.localToWorld(tmpA.copy(l.from)), dir = tmpB.copy(l.dir).transformDirection(gun.root.matrixWorld);
    laserRay.set(from, dir);
    const h = laserRay.intersectObjects(colliders, false).find(i => { const t = i.object.userData.target as Target | undefined; return !t || T.exposed(t); });
    if (!h) return;
    nrm.copy(h.face?.normal ?? dir.clone().negate()).transformDirection(h.object.matrixWorld); if (nrm.dot(dir) > 0) nrm.negate();
    laserDot.m.position.copy(h.point).addScaledVector(nrm, 0.003);
    laserDot.m.lookAt(tmpC.copy(laserDot.m.position).add(nrm));
    laserDot.m.scale.setScalar(0.005 + h.distance * 0.0016);         // (a little larger than life, so it reads at 25 m)
    laserDot.m.visible = true;
  }

  const eyeSpec: EyeSpec = {
    fov: FOV, near: field ? 0.08 : 0.02, far: field ? 4500 : 120,
    pose(pos, quat) {
      shooterEye(eyePos, eyeQ);
      if (entering && !swapIn) {
        const k = smooth(clamp((sec - entryT0) / 1.1, 0, 1));
        pos.lerpVectors(from.eye, eyePos, k); quat.slerpQuaternions(from.eyeQ, eyeQ, k);
      } else { pos.copy(eyePos); quat.copy(eyeQ); }
    },
    frame(cam) {
      const S = sightPoses();
      setScoped(S.optic && !S.holo && aimK > 0.93 && !entering);
      const holoOn = S.holo && aimK > 0.6 && !entering;           // looking over a holographic sight: its reticle only
      scopeQuad.visible = scoped || holoOn;
      scopeMat.uniforms.uTube.value = scoped ? 1 : 0; scopeMat.uniforms.uRing.value = S.ring ? 1 : 0;
      scopeMat.uniforms.uRet.value = S.ring ? 0.45 * (scoped ? power : 1) : 1;
      const f = scoped ? scopeFov() : THREE.MathUtils.lerp(FOV, S.optic ? FOV_AIM : aimFov, smooth(aimK));
      if (Math.abs(cam.fov - f) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); }
      scopeMat.uniforms.uMil.value = S.mil && scoped ? 0.001 / (2 * Math.tan(cam.fov / 2 * DEG)) : 0;
      handPose(cam);
      if (scopeQuad.visible) {                         // the picture rides on where the optic's axis points
        gun.root.updateMatrixWorld(true);
        const a = gun.root.localToWorld(tmpA.copy(S.rear)), b = gun.root.localToWorld(tmpB.copy(S.front));
        const far = b.sub(a).normalize().multiplyScalar(60).add(a).project(cam);
        scopeMat.uniforms.uC.value.set(far.x * 0.5, far.y * 0.5);
        scopeMat.uniforms.uAspect.value = cam.aspect;
        scopeMat.uniforms.uIllum.value = low() ? 1.1 : 1.9;
      }
      const pt = sec - pullAt; hands.pull(pullAt < 0 ? 0 : pt < 0.035 ? pt / 0.035 : Math.max(0, 1 - (pt - 0.05) / 0.12));
      // a pistol is carried out in the firing hand; the support hand comes up and wraps it as it is aimed
      if (gun.kind !== 'rifle') {
        const away = 1 - smooth(clamp(aimK / 0.6, 0, 1));
        hands.support.position.set(0.05, -0.2, -0.24).multiplyScalar(away);
        hands.support.rotation.set(-0.7 * away, 0, 0.3 * away);
        hands.support.visible = away < 0.98;
      }
      // (visibility is set every frame: a long frame can end the entry before the frame that would have shown them)
      hands.group.visible = true;
      if (entering && swapIn) lower(cam, 1 - (sec - entryT0) / 0.45);
      else if (entering) {
        const k = smooth(clamp((sec - entryT0 - 0.25) / 0.9, 0, 1));
        gun.root.position.lerpVectors(from.gun, gun.root.position, k); gun.root.quaternion.slerpQuaternions(from.gunQ, gun.root.quaternion, k);
        hands.group.visible = k > 0.7;
      }
      if (leaving) lower(cam, (sec - leaving.t0) / 0.3);
      gun.root.updateMatrixWorld(true);
      aimLaser();
    },
    exit() { exit(true); },
    lock: {
      look(dx, dy) {
        if (!on || entering) return;
        const k = 0.0021 * (E.camera as THREE.PerspectiveCamera).fov / FOV;
        me.yaw -= dx * k; me.pitch = clamp(me.pitch - dy * k, -1.35, 1.35);
      },
      button(b, down) {
        if (b === 0) { trigHeld = down; if (down) fire(); }
        if (b !== 2) return;
        const t = performance.now() / 1000;
        if (down) { rmbAt = t; rmbWas = aimToggle; aimHeld = true; return; }
        aimHeld = false;
        aimToggle = t - rmbAt < 0.3 ? !rmbWas : false;        // a tap flips the aim; letting go of a hold ends it
      },
      wheel(dy) {
        if (aimK <= 0.5) return;
        if (sightPoses().optic) power = clamp(power * Math.exp(-dy * 0.0012), P.zoom[0], P.zoom[1]);   // the optic's power ring
        else aimFov = clamp(aimFov * Math.exp(dy * 0.0011), 30, 58);
      },
      locked(v, no) { captured = v; if (no) refused = true; if (!v) { keys.clear(); aimHeld = false; trigHeld = false; } },
    },
  };

  function clampPos(p: THREE.Vector3, prevZ: number) {
    if (field) { p.x = clamp(p.x, L.lane - 9, L.lane + 9); p.z = clamp(p.z, L.line - 8.4, L.bench.z0 - 0.22); return; }
    p.x = clamp(p.x, L.X0 + 0.35, L.X1 - 0.35); p.z = clamp(p.z, L.Z0 + 0.35, L.bench.z0 - 0.22);
    const i = clamp(Math.round((p.x - L.lane) / L.laneW), -2, 2), cx = L.lane + i * L.laneW, lim = L.laneW / 2 - 0.34;
    if (p.z > L.boothZ - 0.3 && Math.abs(p.x - cx) > lim) {
      if (prevZ <= L.boothZ - 0.3) p.z = L.boothZ - 0.3;            // walking into a partition's end: stop
      else p.x = clamp(p.x, cx - lim, cx + lim);                       // inside a booth: its walls
    }
  }

  // ── per frame ──
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3();
  function tick(now: number, dt: number) {
    sec = now / 1000;
    if (!on) return;
    for (let i = timers.length - 1; i >= 0; i--) if (sec >= timers[i][0]) { const f = timers[i][1]; timers.splice(i, 1); f(); }
    if (entering && sec - entryT0 > (swapIn ? 0.55 : 1.35)) entering = false;
    if (leaving && sec - leaving.t0 > 0.3) {                   // lowered: hand over to the next weapon
      const id = leaving.id; leaving = null;
      carry = { from: nav!.id, to: id, at: performance.now(), x: me.pos.x - L.lane, z: me.pos.z - L.bench.z0, yaw: me.yaw, pitch: me.pitch, kneel: me.kneelOn };
      lastWeapon = nav!.id; nav!.open(id);
    }

    // walking and kneeling
    fwd.set(Math.sin(me.yaw), 0, Math.cos(me.yaw)); right.set(-Math.cos(me.yaw), 0, Math.sin(me.yaw));
    const f = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0), s = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    wish.set(0, 0, 0).addScaledVector(fwd, f).addScaledVector(right, s);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar((aimK > 0.5 ? 1.1 : 2.1) * (me.kneelOn ? 0.55 : 1));
    me.vel.lerp(wish, 1 - Math.exp(-dt * (wish.lengthSq() ? 9 : 12)));
    const pz = me.pos.z; me.pos.addScaledVector(me.vel, dt); clampPos(me.pos, pz);
    me.bob += me.vel.length() * dt * 5.2;
    me.kneel = THREE.MathUtils.clamp(me.kneel + (me.kneelOn ? dt : -dt) * 3.5, 0, 1);
    // keyboard look (arrows), for a trackpad
    const ak = 1.3 * dt * (E.camera as THREE.PerspectiveCamera).fov / FOV;
    if (keys.has('ArrowLeft')) me.yaw += ak; if (keys.has('ArrowRight')) me.yaw -= ak;
    if (keys.has('ArrowUp')) me.pitch = Math.min(1.35, me.pitch + ak); if (keys.has('ArrowDown')) me.pitch = Math.max(-1.35, me.pitch - ak);

    // aim, breath
    const aiming = (aimHeld || aimToggle) && !reload && !entering;
    aimK = clamp(aimK + (aiming ? dt : -dt) * 5.5, 0, 1);
    if (!aiming) aimFov = FOV_AIM;
    holding = keys.has('Shift') && aimK > 0.5 && gasp <= 0 && breath > 0;
    if (holding) { breath -= dt / 5; if (breath <= 0) { breath = 0; gasp = 2.2; snd.burst(0.5, 0.05, { type: 'lowpass', freq: 700 }); } }
    else { gasp = Math.max(0, gasp - dt); breath = Math.min(1, breath + dt / 3); }

    // recoil springs (sub-stepped: frames can be long)
    for (let i = 0, n = Math.ceil(dt / 0.008), h = dt / n; i < n; i++) {
      kick.vRise += (-340 * kick.rise - 30 * kick.vRise) * h; kick.rise += kick.vRise * h;
      kick.vPush += (-420 * kick.push - 36 * kick.vPush) * h; kick.push += kick.vPush * h;
    }
    kick.cam *= Math.exp(-dt * 7.5);
    stepReload();
    if (trigHeld && gun.auto?.() && !reload && !entering) fire();   // automatic: the next round as soon as the action is back

    // the drill
    T.tick(sec);
    for (const t of T.list) if (t.state === 'up' && sec > t.until) T.drop(t, sec);
    if (phase === 'free') {
      if (!standing().length && sec >= nextPop) { popOne('hostile', Infinity); nextPop = sec + (field ? 1.6 : 0.8); }
      if (standing().length) nextPop = Math.max(nextPop, sec + (field ? 1.6 : 0.8));
    } else if (phase === 'standby' && sec >= beepAt) {
      beep(); phase = 'live'; liveAt = lastShot = sec; nextPop = sec + 0.35; call('');
    } else if (phase === 'live') {
      const el = sec - liveAt, prog = el / drill;
      if (el >= drill) endDrill();
      else if (field) {                                       // one plate at a time, 20 s to hit it
        if (!standing().length && sec >= nextPop) { popOne('hostile', sec + 20); nextPop = sec + 1.2; }
        if (standing().length) nextPop = Math.max(nextPop, sec + 1.2);
      } else {
        const up = standing(), max = prog < 0.3 ? 1 : prog < 0.65 ? 2 : 3;
        if (up.length < max && sec >= nextPop) {
          const ns = up.some(t => t.kind === 'hostile') && Math.random() < 0.2;
          const pick = T.list.find(t => t.state === 'down' && t.i !== lastPopped);
          const exposure = ns ? 2.4 : THREE.MathUtils.lerp(3.4, 1.9, prog) + (pick ? pick.dist * 0.03 : 0);
          popOne(ns ? 'ns' : 'hostile', sec + 0.32 + exposure);
          nextPop = sec + 0.45 + Math.random() * 0.9;
        }
      }
    }

    // lights: the house lights (or not), the status light over the backstop
    const lo = low(), hot = phase === 'live' || phase === 'standby';
    if (field) {                                              // a gusting crosswind, shown by the flags
      const w = windBase * (1 + 0.28 * Math.sin(sec * 0.13) + 0.14 * Math.sin(sec * 0.41 + 1.3));
      windF.set(-w, 0.02, 0.4 * Math.sin(sec * 0.07));
      field.tick(sec, windF);
    }
    hall.lamps.house.emissiveIntensity = field ? (lo ? 1.4 : 0) : lo ? 0.25 : 2.4;
    hall.lamps.flood.emissiveIntensity = lo ? 1.2 : 3.2;
    hall.lamps.exit.emissiveIntensity = 2.2;
    hall.lamps.hot.emissiveIntensity = hot ? 3.6 : 0.25;
    hall.lamps.cold.emissiveIntensity = hot ? 0.25 : 3;
    fx.update(dt, field ? windF : wind);
  }
  const wind = new THREE.Vector3(0, 0.02, 0.06);              // the range's ventilation draws smoke downrange

  // ── in and out ──
  let on = false;
  function enter() {
    if (on || dead) return;
    if (!ready) { wantIn = true; return; }                     // goes on as soon as the range has compiled
    const c = carry && carry.to === nav?.id && performance.now() - carry.at < 15000 ? carry : null; carry = null;
    on = true; phase = 'setup'; entering = true; swapIn = !!c; leaving = null; entryT0 = sec = performance.now() / 1000;
    from.eye.copy(E.orbitCamera.position); from.eyeQ.copy(E.orbitCamera.quaternion);
    from.gun.copy(gun.root.position); from.gunQ.copy(gun.root.quaternion);
    me.pos.set(L.lane, 0, L.bench.z0 - 0.24); me.yaw = 0; me.pitch = field ? 0.004 : -0.05; me.vel.set(0, 0, 0); me.kneel = 0; me.kneelOn = false;
    if (c) { me.pos.set(L.lane + c.x, 0, L.bench.z0 + c.z); clampPos(me.pos, me.pos.z); me.yaw = c.yaw; me.pitch = c.pitch; me.kneelOn = c.kneel; me.kneel = c.kneel ? 1 : 0; }
    aimK = 0; aimToggle = aimHeld = false; breath = 1; gasp = 0; Object.assign(kick, { rise: 0, vRise: 0, push: 0, vPush: 0, cam: 0 });
    if (field) { windBase = (1.2 + Math.random() * 4) * (Math.random() < 0.5 ? -1 : 1); dial = 0; gun.turret?.set(0); }
    shots = []; shotN = 0; result = null; lastShot = sec; called = { seq: called.seq + 1, text: 'Load and make ready' };
    root.visible = true; T.reset();
    gun.hold(true, { ground: groundAt, flash: 14, cast, blast });
    shadows.length = 0;
    gun.root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { shadows.push([m, m.castShadow, m.receiveShadow]); m.receiveShadow = false; } });
    hands.group.visible = false;
    E.setEye(eyeSpec);
    void E.warm();                                             // anything not compiled yet (frames hold meanwhile)
    if (low() && !gun.state().night) gun.night();
    startReload(true);
  }
  function exit(byEngine = false) {
    wantIn = false;
    if (!on) return;
    on = false;
    if (!byEngine && carry?.from !== nav?.id) E.setEye(null);   // (handing over: the pointer stays captured)
    root.visible = false; hands.group.visible = false;
    for (const [m, c, r] of shadows) { m.castShadow = c; m.receiveShadow = r; }
    reload = null; leaving = null; timers.length = 0; keys.clear(); aimHeld = aimToggle = trigHeld = false;
    setScoped(false); poseKey = '';
    gun.hold(false);
    T.reset(); fx.clear(); holes.clear(); phase = 'setup';
  }

  const SKIP = new Set(['e', 'p', 'd', 'w', 'a', 's', 'f', 'r', 'z', 'x', 'c', 'q']);
  /** a bolt gun with rounds left: R only works the bolt */
  const boltOnly = () => { const s = gun.state(); return s.magIn && s.rounds > 0 && !s.chamber && !s.busy && !reload; };
  return {
    get on() { return on; },
    enter, exit, tick,
    /** keys while on the range; anything not listed falls through to the host (N night sights, T light, H, I, M) */
    keyDown(k: string, e: KeyboardEvent): boolean {
      if (!on) return false;
      if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift'].includes(k)) { keys.add(k); return true; }
      const tu = gun.turret;
      if (tu && (k === 'u' || k === 'j' || k === 'n')) {          // the elevation turret, a click at a time (held, it runs)
        const was = dial;
        const want = (() => { const c = T.list.find(t => t.state === 'up'); return c ? clamp(Math.round(dopeFor(c.dist).elev / tu.step) * tu.step, 0, tu.max) : 0; })();
        dial = k === 'n' ? (Math.abs(dial - want) < 1e-6 ? 0 : want) : clamp(Math.round((dial + (k === 'u' ? tu.step : -tu.step)) / tu.step) * tu.step, 0, tu.max);
        if (dial !== was) { tu.set(dial); snd.click(0, k === 'n' ? 0.7 : 1.6); }
        return true;
      }
      if (e.repeat) return SKIP.has(k) || k === 'space';
      if (k === 'f') { trigHeld = true; fire(); }
      else if (k === 'r' && gun.bolt && boltOnly()) gun.rack();
      else if (k === 'r' || k === 'e') startReload();
      else if (k === 'z') aimToggle = !aimToggle;
      else if (k === 'x') { gun.safety(); const m = gun.state().mode; call(m ? m[0].toUpperCase() + m.slice(1) : gun.state().safe ? 'Safe' : 'Fire'); }
      else if (k === 'c') me.kneelOn = !me.kneelOn;
      else if (/^[1-9]$/.test(k)) swapTo(WEAPONS[+k - 1]?.id);
      else if (k === 'q') swapTo(lastWeapon && lastWeapon !== nav?.id ? lastWeapon : WEAPONS[(WEAPONS.findIndex(w => w.id === nav?.id) + 1) % WEAPONS.length]?.id);
      else if (k === 'space' || k === 'Enter') { if (phase === 'free' || phase === 'done') startDrill(); else if (phase === 'live' || phase === 'standby') endDrill(); }
      else if (k === 'Escape') exit();
      else return SKIP.has(k);
      return true;
    },
    keyUp(k: string) { keys.delete(k); if (k === 'f') trigHeld = false; },
    blur() { keys.clear(); aimHeld = false; trigHeld = false; },
    /** the stage lights the hall from this while the range is on */
    stage(): StageOverride | null { return on ? field ? (low() ? FIELD_DUSK : FIELD_DAY) : low() ? LOW : BRIGHT : null; },
    hud(): RangeHud | null {
      if (!on) return null;
      const s = gun.state();
      return {
        kind: 'range', lane: L.mine, gun: gun.name, calibre: gun.calibre, phase, locked: captured || refused, lowLight: low(),
        time: phase === 'live' ? Math.max(0, Math.ceil((drill - (sec - liveAt)) * 10) / 10) : drill, par: drill,
        score: stats.score, shots: stats.shots, hits: stats.hits, presented: stats.presented, noShoot: stats.noShoot,
        rounds: s.rounds, cap: s.cap, chamber: s.chamber, magIn: s.magIn, safe: s.safe, slideLocked: s.locked, reloading: !!reload,
        aiming: aimK > 0.5, mode: s.mode ?? null, power: scoped ? Math.round(power * 10) / 10 : null, breath: holding || gasp > 0 || breath < 1 ? Math.round(breath * 20) / 20 : null,
        shotsList: shots.slice(-8), hit, call: called, result,
        weapons: nav && WEAPONS.length > 1 ? WEAPONS.map((w, i) => ({ key: String(i + 1), name: w.name, on: w.id === nav.id })) : [],
        keys: gun.keys ?? [],
        site,
        dope: field ? (() => {
          const c = T.list.find(t => t.state === 'up'), d = c ? dopeFor(c.dist) : null;
          return { elev: Math.round(dial * 10) / 10, wind: Math.round(windF.x * -10) / 10, dist: c?.dist ?? null, need: d ? Math.round(d.elev * 10) / 10 : null, hold: d ? Math.round(d.hold * 10) / 10 : null };
        })() : null,
      };
    },
    /** waiting for the range to finish compiling before it goes on */
    get pending() { return wantIn; },
    dispose() {
      exit(); dead = true;
      // the hall and targets stay built for the next weapon (kits); so do the hands' meshes (lib/range/hands.ts)
      root.removeFromParent(); hands.dispose(); fx.dispose(); holes.dispose(); scopeMat.dispose(); scopeQuad.geometry.dispose(); laserDot.dispose();
    },
  };
}
export type Range = ReturnType<typeof createRange>;
