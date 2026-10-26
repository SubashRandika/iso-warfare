// The demo's strike: on the circuit's downwind leg the jet shows what it was built to do, with the weapons it carries.
// A range of generic targets appears beside the leg (hardened shelters, bunkers, a radar site, fuel tanks) and, for
// jets with air-to-air missiles, target drones flying head-on (a large support aircraft for the J-20).
//   aam     radar missiles are rammed down out of the main bay by the launcher, fall clear for a moment, light their
//           motors and climb a little before homing on the drones                                     ("fox three")
//   srm     a heat-seeker fires straight off its side-bay trapeze and pulls hard onto the closest drone  ("fox two")
//   bomb    guided bombs are pushed clear of the bay and glide onto the targets                        ("bombs away")
//   cruise  stand-off missiles drop clear, fly ahead low and dive onto distant targets                  ("rifle")
// Missiles home by proportional navigation and burst on a proximity fuze, tested along each frame's whole path, so a
// fast missile can't step through its target between frames. The real store meshes leave the jet (detached into the
// scene, flown, put back after landing), so they keep their look in both styles.
// Hairline view: accent trails, motor glows, flashes and shock rings. Real view: rocket plumes, continuous motor smoke,
// fireballs, sparks, dust and smoke columns (lib/real/smoke.ts), and a flash of light; the boom arrives later the
// farther it is. Hits leave rubble and fires.
// The real view's materials are compiled when it is switched on, and the flash lights are always in the scene (only
// their brightness changes), so no explosion changes the light count and stalls the frame recompiling shaders.
import * as THREE from 'three';
import type { Engine } from '../../../iso/engine';
import type { Sound } from '../../../core/sound';
import { makeKit } from '../../../kit/build';
import { makePlume } from '../../../real/plume';
import { createParticles } from '../../../real/smoke';
import type { Circuit } from './circuit';
import type { JetRig, Store } from './types';

const ss = (t: number) => { const x = THREE.MathUtils.clamp(t, 0, 1); return x * x * (3 - 2 * x); };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = Math.random;
const dirR = () => V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
type Pts = ReturnType<Engine['glowPoints']>;
type Plume = ReturnType<typeof makePlume>;

export interface Target { at: THREE.Vector3; intact: THREE.Group; rubble: THREE.Group; fire: Pts; hit: boolean; size: number }
export interface Drone { g: THREE.Group; p: THREE.Vector3; v: THREE.Vector3; big: boolean; alive: boolean; engaged: boolean; falling: boolean; spin: THREE.Vector3 }
export interface Shot {
  s: Store; pivot: THREE.Group; f0: THREE.Vector3; p: THREE.Vector3; v: THREE.Vector3; t: number; len: number;
  drone?: Drone; target?: Target; aim: THREE.Vector3; bez?: THREE.Vector3[]; dur: number;
  ign: number; lit: boolean; plume: Plume | null; tail: THREE.Vector3 | null;
  trail: THREE.Line; pts: Float32Array; n: number; motor: Pts; done: boolean;
}
interface Boom { line: THREE.Group; glow: Pts; ring: THREE.Object3D; t: number; size: number; on: boolean }

export function createStrike(E: Engine, R: JetRig, C: Circuit, snd: Sound, say: (m: string) => void) {
  const u = C.u, VC = C.VC, G = 9.8 * u, stores = R.stores ?? [];
  const root = new THREE.Group(); root.visible = false; E.scene.add(root);       // targets and drones: shown for the run
  const fx = new THREE.Group(); E.scene.add(fx);                                  // weapons in flight, explosions, smoke
  const K = makeKit(E, { root, unit: u });
  let real = false;

  // ── materials: the hairline body material in the line view, these in the real one ──
  const std = (color: number, roughness = 0.9, metalness = 0.05) => { const m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); m.userData.realStyle = true; return m; };
  const RM = { concrete: std(0x9d988c, 0.95), char: std(0x241f1c, 1), olive: std(0x4c5a3b, 0.8, 0.1), steel: std(0xa3a8aa, 0.45, 0.6), drone: std(0xd9d6cc, 0.5, 0.1), dark: std(0x1e2123, 0.7, 0.2) };
  const duals: { m: THREE.Mesh; real: THREE.Material; line: THREE.Material }[] = [];
  const mk = (parent: THREE.Object3D, geo: THREE.BufferGeometry, rm: THREE.Material) => { const m = K.add(parent, geo); duals.push({ m, real: rm, line: m.material as THREE.Material }); return m; };
  const box = (w: number, h: number, d: number, x = 0, y = h / 2, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

  // ── the track: the downwind leg the jet flies the strike on ──
  const [dw0, dw1] = C.marks.downwind, dwLen = dw1 - dw0;
  const trackPt = (s: number) => { const q = C.at(s); return V(q.x, q.alt + R.cgY, q.z); };
  const trackDir = (s: number) => { const q = C.at(s); return V(Math.sin(q.psi), 0, Math.cos(q.psi)); };
  const side = (s: number) => { const d = trackDir(s); return V(d.z, 0, -d.x); };   // to the right of the track
  const ground = (s: number, off: number) => trackPt(s).setY(0).addScaledVector(side(s), off);

  // ── what this jet will do ──
  const by = (k: Store['kind']) => stores.filter(x => x.kind === k);
  const aam = by('aam'), srm = by('srm'), bombs = by('bomb'), cruise = by('cruise').slice(0, 10);
  const nAir = Math.min(2, aam.length) + (srm.length ? 1 : 0);
  const nGround = bombs.length ? Math.min(6, Math.max(2, Math.ceil(bombs.length / 2.5))) : cruise.length ? Math.min(6, cruise.length) : 0;
  const B0 = dw0 + 30 * u, LEAD = 150 * u, SPACING = 26 * u;                      // bomb run: first release, lead, target spacing
  const groundS = (j: number) => bombs.length ? B0 + LEAD + j * SPACING : dw0 + 0.55 * dwLen + j * 30 * u;
  const groundOff = (j: number) => bombs.length ? (j % 2 ? 1 : -1) * (6 + 5 * (j % 3)) * u : (j % 2 ? 1 : -1) * (30 + 9 * (j % 3)) * u;

  // ── targets: generic structures, each with an intact and a destroyed version ──
  const targets: Target[] = [];
  const build = [
    (g: THREE.Group, k: number) => {                                    // hardened shelter: an arched hangar with a dark door
      const arch = new THREE.Shape(); for (let i = 0; i <= 10; i++) { const a = Math.PI * i / 10; arch[i ? 'lineTo' : 'moveTo'](6 * k * Math.cos(a), 5 * k * Math.sin(a)); }
      mk(g, new THREE.ExtrudeGeometry(arch, { depth: 16 * k, bevelEnabled: false }).translate(0, 0, -8 * k), RM.concrete);
      mk(g, box(8 * k, 3.8 * k, 0.2 * k, 0, 1.9 * k, 8.05 * k), RM.dark);
    },
    (g: THREE.Group, k: number) => { mk(g, box(14 * k, 3 * k, 10 * k), RM.concrete); mk(g, box(6 * k, 1.6 * k, 4 * k, -2 * k, 3.8 * k), RM.concrete); },   // bunker
    (g: THREE.Group, k: number) => {                                    // radar site: cabin, mast and a tilted dish
      mk(g, box(5 * k, 3 * k, 4 * k), RM.olive); mk(g, new THREE.CylinderGeometry(0.3 * k, 0.4 * k, 6 * k, 8).translate(3.5 * k, 3 * k, 0), RM.steel);
      mk(g, new THREE.CylinderGeometry(3 * k, 3 * k, 0.35 * k, 12).rotateX(1.1).translate(3.5 * k, 6.6 * k, 0), RM.olive);
    },
    (g: THREE.Group, k: number) => { for (const x of [-4, 4]) mk(g, new THREE.CylinderGeometry(3.4 * k, 3.4 * k, 5 * k, 14).translate(x * k, 2.5 * k, 0), RM.steel); },   // fuel tanks
  ];
  const rubble = (g: THREE.Group, k: number, seed: number) => {
    let r = seed * 9301 + 49297; const rn = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
    for (let i = 0; i < 7; i++) {
      const m = mk(g, box((2 + rn() * 5) * k, (0.6 + rn() * 1.8) * k, (2 + rn() * 5) * k), RM.char);
      m.position.set((rn() - 0.5) * 12 * k, 0, (rn() - 0.5) * 12 * k); m.rotation.set((rn() - 0.5) * 0.5, rn() * 3, (rn() - 0.5) * 0.5);
    }
  };
  for (let j = 0; j < nGround; j++) {
    const at = ground(groundS(j), groundOff(j)), k = u * (bombs.length ? 1 : 1.2);
    const intact = new THREE.Group(), rub = new THREE.Group(); intact.position.copy(at); rub.position.copy(at);
    intact.rotation.y = rub.rotation.y = Math.atan2(trackDir(groundS(j)).x, trackDir(groundS(j)).z) + (j % 2 ? 0.3 : -0.2);
    build[j % build.length](intact, k); rubble(rub, k, j + 1); rub.visible = false; root.add(intact, rub);
    const fire = E.glowPoints([at.clone().setY(1.5 * k)], 2.2); fire.visible = false; root.add(fire);
    targets.push({ at, intact, rubble: rub, fire, hit: false, size: k });
  }

  // ── drones: target drones flying head-on; for the J-20 the first is a large early-warning aircraft ──
  const drones: Drone[] = [];
  const buildDrone = (big: boolean) => {
    const g = new THREE.Group(), k = u * (big ? 3.6 : 1);
    mk(g, new THREE.CylinderGeometry(0.42 * k, 0.42 * k, 6.5 * k, 8).rotateX(Math.PI / 2), RM.drone);
    mk(g, new THREE.ConeGeometry(0.42 * k, 1.4 * k, 8).rotateX(Math.PI / 2).translate(0, 0, 3.95 * k), RM.drone);
    const tip = big ? 8 * k : 2.6 * k;
    for (const sx of [1, -1]) {                                        // each wing drawn on its own side (no mirrored scale)
      const wing = new THREE.Shape(), pts = [[0, 1.2 * k], [tip, big ? 0 : -1.6 * k], [tip, big ? -1.2 * k : -2.3 * k], [0, -1.4 * k]];
      (sx > 0 ? pts : pts.slice().reverse()).forEach(([x, y], i) => wing[i ? 'lineTo' : 'moveTo'](sx * x, y));
      mk(g, new THREE.ExtrudeGeometry(wing, { depth: 0.12 * k, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.06 * k, 0), RM.drone);
    }
    mk(g, box(0.1 * k, 1.4 * k, 1.4 * k, 0, 0.3 * k, -2.6 * k), RM.drone);
    if (big) { mk(g, new THREE.CylinderGeometry(2.2 * k * 0.5, 2.2 * k * 0.5, 0.25 * k, 16).translate(0, 1.3 * k, -0.5 * k), RM.dark); mk(g, box(0.15 * k, 0.8 * k, 0.6 * k, 0, 0.6 * k, -0.5 * k), RM.dark); }
    g.visible = false; root.add(g); return g;
  };
  for (let i = 0; i < nAir; i++) {
    const big = i === 0 && R.airTarget === 'awacs';
    drones.push({ g: buildDrone(big), p: V(), v: V(), big, alive: true, engaged: false, falling: false, spin: V() });
  }

  // ── smoke and fire (real view), drifting on a light wind ──
  const PX = createParticles(E, 16000, 3000); PX.group.visible = false; fx.add(PX.group);
  const wind = V(1.4 * u, 0, 0.7 * u);
  const WHITE = [0.86, 0.85, 0.83] as const, BLACK = [0.035, 0.032, 0.03] as const, SOOT = [0.07, 0.065, 0.06] as const, DUST = [0.5, 0.45, 0.37] as const;
  const HOT = [6.5, 2.9, 0.75] as const, EMBER = [0.7, 0.09, 0.015] as const;
  /** a fireball: hot gas thrown out and cooling, sparks and fragments falling, then dark smoke rolling up (and dust) */
  function burst(at: THREE.Vector3, size: number, air: boolean) {
    PX.fire.emit(at, { s0: size * 0.6, s1: size * 1.1, life: 0.16, c: [14, 10, 6], drag: 0 });   // the white-hot flash
    for (let i = 0; i < (air ? 40 : 52); i++) {
      const d = dirR(); if (!air) d.y = Math.abs(d.y) * 0.9 + 0.15;
      PX.fire.emit(at.clone().addScaledVector(d, size * 0.15 * rnd()), { v: d.clone().multiplyScalar(size * (1.6 + 2.8 * rnd())), s0: size * 0.28, s1: size * (0.5 + 0.4 * rnd()), life: 0.4 + 0.65 * rnd(), c: HOT, c1: EMBER, drag: 3.2, rise: size * 0.7 });
    }
    for (let i = 0; i < 22; i++) {                                     // sparks and fragments, thrown out and falling
      const d = dirR(); if (!air) d.y = Math.abs(d.y) + 0.3;
      PX.fire.emit(at, { v: d.multiplyScalar(size * (4 + 5 * rnd())), s0: size * 0.07, s1: size * 0.03, life: 0.7 + 0.9 * rnd(), c: [6, 3.2, 1.1], c1: [1.2, 0.25, 0.05], drag: 0.9, rise: -G });
    }
    for (let i = 0; i < (air ? 22 : 30); i++) {                        // smoke born inside the fireball, rolling up and out
      const d = dirR(); if (!air) d.y = Math.abs(d.y) * 0.7 + 0.2;
      PX.smoke.emit(at.clone().addScaledVector(d, size * 0.3 * rnd()), { v: d.clone().multiplyScalar(size * (0.5 + 0.9 * rnd())), s0: size * 0.45, s1: size * (1.3 + 0.9 * rnd()), life: 5 + 4 * rnd(), c: air ? BLACK : SOOT, a: 1.5, drag: 1.3, rise: size * 0.06, age: 0.1 * rnd() });
    }
    if (!air) for (let i = 0; i < 16; i++) {                           // a ring of dust pushed out along the ground
      const a = i / 16 * Math.PI * 2 + rnd() * 0.3, d = V(Math.cos(a), 0.12, Math.sin(a));
      PX.smoke.emit(at.clone().addScaledVector(d, size * 0.2), { v: d.multiplyScalar(size * (1.8 + 1.2 * rnd())), s0: size * 0.4, s1: size * (1.4 + 0.6 * rnd()), life: 4 + 2.5 * rnd(), c: DUST, a: 0.7, drag: 1.8, rise: size * 0.02 });
    }
  }

  // ── explosions: hairline flash and shock ring; the light flash is one of two lights that never leave the scene ──
  const booms: Boom[] = Array.from({ length: 14 }, () => {
    const line = new THREE.Group(), glow = E.glowPoints([V()], 3.2); line.add(glow);
    const ring: number[] = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, b = (i + 1) / 24 * Math.PI * 2; ring.push(Math.cos(a), 0.05, Math.sin(a), Math.cos(b), 0.05, Math.sin(b)); }
    const ringO = E.fat(ring, E.mats.major); line.add(ringO);
    line.visible = false; fx.add(line);
    return { line, glow, ring: ringO, t: 0, size: 1, on: false };
  });
  const flashes = [0, 1].map(() => { const l = new THREE.PointLight(0xff8a3c, 0, 0, 2); fx.add(l); return { l, owner: null as Boom | null }; });
  let nextBoom = 0, nextFlash = 0;
  function explode(at: THREE.Vector3, size: number, air: boolean) {
    const b = booms[nextBoom]; nextBoom = (nextBoom + 1) % booms.length;
    b.on = true; b.t = 0; b.size = size; b.line.position.copy(at);
    const f = flashes[nextFlash]; nextFlash = (nextFlash + 1) % flashes.length; f.owner = b; f.l.position.copy(at);
    if (real) burst(at, size, air);
    // the boom: louder and later the farther it is from the camera
    const d = at.distanceTo(E.camera.position), delay = d / 340, g = 1 / (1 + d / (120 * u));
    snd.burst(2.4, 0.55 * g, { freq: 90, type: 'lowpass', q: 0.7, attack: 0.008, at: delay });
    snd.burst(0.5, 0.22 * g, { freq: 1100, q: 0.6, at: delay });
    snd.tone(52, 1.4, 0.25 * g, { type: 'sine', to: 28, at: delay });
  }

  // ── weapons in flight ──
  const shots: Shot[] = [];
  const saved = new Map<THREE.Object3D, { parent: THREE.Object3D; p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>();
  const fwd = V(), vel = V(), down = V();
  // a plume of each kind built up front, so its shader is compiled with the rest when the real view comes on
  const protoPlume = makePlume(fx, V(0, -1000, 0), V(0, -1, 0), 0.1, 0.1, 1, 0, 'ab');
  function release(s: Store, opts: { drone?: Drone; target?: Target; aim?: THREE.Vector3 }) {
    const o = s.obj; saved.set(o, { parent: o.parent!, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() });
    o.updateWorldMatrix(true, true);
    const bb = new THREE.Box3().setFromObject(o), centre = bb.getCenter(V()), size = bb.getSize(V());
    const len = Math.abs(size.x * fwd.x) + Math.abs(size.y * fwd.y) + Math.abs(size.z * fwd.z);
    const pivot = new THREE.Group(); pivot.position.copy(centre); fx.add(pivot); pivot.updateMatrixWorld(); pivot.attach(o);
    const pts = new Float32Array(64 * 3); for (let i = 0; i < 64; i++) pts.set([centre.x, centre.y, centre.z], i * 3);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const lm = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.8 }); lm.color = E.accent;          // follows the accent
    const trail = new THREE.Line(lg, lm); trail.frustumCulled = false; trail.visible = false; fx.add(trail);
    const motor = E.glowPoints([V()], 1.6); motor.visible = false; fx.add(motor);
    // the rocket plume leaves the tail, along the body (the pivot turns the missile and its plume together)
    const plume = s.kind === 'bomb' ? null : makePlume(pivot, fwd.clone().multiplyScalar(-len * 0.5), fwd.clone().negate(), len * 0.05, len * 0.05, len * (s.kind === 'cruise' ? 0.3 : 0.85), rnd() * 10, 'ab');
    // ejector launchers and racks push the store down and clear of the jet before anything else happens; a
    // heat-seeker on its trapeze is already out in the airflow and fires straight off the rail
    const v0 = vel.clone(); if (s.bay !== 'side') v0.addScaledVector(down, (s.kind === 'aam' ? 7.5 : 5) * u);
    const aim = opts.aim ?? opts.target?.at.clone() ?? centre.clone();
    const ign = s.kind === 'srm' ? 0 : s.kind === 'aam' ? 0.32 : s.kind === 'cruise' ? 0.8 : Infinity;
    const sh: Shot = { s, pivot, f0: fwd.clone(), p: centre.clone(), v: v0, t: 0, len, drone: opts.drone, target: opts.target, aim, dur: 0, ign, lit: false, plume, tail: null, trail, pts, n: 0, motor, done: false };
    if (s.kind === 'bomb') {                                               // falls forward onto its aim point, steering a little
      const h = Math.hypot(aim.x - centre.x, aim.z - centre.z); sh.dur = THREE.MathUtils.clamp(h / (0.85 * VC), 1.2, 3);
      sh.bez = [centre.clone(), centre.clone().addScaledVector(v0, sh.dur * 0.55), aim.clone()];
    }
    shots.push(sh);
    snd.thunk();                                                           // the ejector's bang
  }
  function ignite(sh: Shot) {
    sh.lit = true;
    snd.burst(1.6, 0.18, { freq: 1300, q: 0.5, attack: 0.03 }); snd.burst(1.2, 0.2, { freq: 160, type: 'lowpass', q: 0.6, attack: 0.02 });
    if (real) {                                                             // the light-off cloud around the tail
      const tail = sh.p.clone().addScaledVector(sh.f0, -sh.len * 0.5);
      for (let i = 0; i < (sh.s.bay === 'side' ? 14 : 8); i++) PX.smoke.emit(tail.clone().addScaledVector(dirR(), sh.len * 0.1), { v: dirR().multiplyScalar(4 * u).addScaledVector(sh.v, 0.85), s0: sh.len * 0.25, s1: sh.len * (0.9 + 0.5 * rnd()), life: 2.5 + 1.5 * rnd(), c: WHITE, a: 0.6, drag: 2.5, rise: 0.2 * u });
      PX.fire.emit(tail, { v: sh.v.clone(), s0: sh.len * 0.3, s1: sh.len * 0.6, life: 0.18, c: [9, 6, 3], drag: 0 });
    }
    sh.tail = null;
  }
  function land(sh: Shot, fuzed = false) {                                  // the weapon has hit (or self-destructed)
    sh.done = true; sh.pivot.visible = false; sh.trail.visible = false; sh.motor.visible = false; sh.plume?.set(0, 0);
    if (sh.drone && sh.drone.alive && fuzed) {
      sh.drone.alive = false; sh.drone.falling = true; sh.drone.spin.set(1.5 + rnd(), 0.4, 2 + rnd());
      sh.drone.v.multiplyScalar(0.7).addScaledVector(sh.v, 0.06);
      explode(sh.p, (sh.drone.big ? 14 : 7) * u, true);
      kills++; say(`splash ${['one', 'two', 'three', 'four'][kills - 1] ?? kills}`);
    } else if (sh.target) {
      explode(sh.aim, (sh.s.kind === 'cruise' ? 13 : bombs.length > 8 ? 12 : 9) * u, false);
      const t = sh.target; if (!t.hit) { t.hit = true; t.intact.visible = false; t.rubble.visible = true; hits++; if (hits === targets.length) say(`${hits} targets destroyed`); }
    } else explode(sh.p, 5 * u, true);
  }
  const fuze = (d: Drone) => (d.big ? 12 : 5) * u;                          // proximity fuze radius
  let kills = 0, hits = 0;

  // ── the plan, fired as the jet flies the leg ──
  const bombRel = bombs.map((_, i) => B0 + (bombs.length > 1 ? i * (Math.max(1, nGround - 1) * SPACING) / (bombs.length - 1) : 0));
  const cruiseRel = cruise.map((_, i) => dw0 + 15 * u + i * 16 * u);
  let fired = new Set<Store>(), lastMainS = -1, srmAt = -1, started = false, said = new Set<string>();
  const once = (k: string, m: string) => { if (!said.has(k)) { said.add(k); say(m); } };
  const mainNeeded = [...aam, ...bombs, ...cruise].some(x => x.bay === 'main');
  const lastRelease = Math.max(dw0 + 60 * u, ...bombRel, ...cruise.filter(x => x.bay === 'main').map(x => cruiseRel[cruise.indexOf(x)]));

  function begin() {
    started = true; root.visible = true;
    drones.forEach((d, i) => {
      const s0 = dw0 + (d.big ? 0.95 : 0.8 + 0.06 * i) * dwLen;
      d.p.copy(trackPt(s0)).addScaledVector(side(s0), (i % 2 ? 1 : -1) * (d.big ? 30 : 16 + 8 * i) * u).add(V(0, (d.big ? 14 : 3 + 2 * i) * u, 0));
      d.v.copy(trackDir(s0)).multiplyScalar(-(d.big ? 0.45 : 0.7) * VC);
      d.alive = true; d.engaged = false; d.falling = false; d.g.visible = true; d.g.rotation.set(0, 0, 0);
    });
  }

  /** which bays the strike wants open at circuit position s */
  function bays(s: number) {
    // the main bay stays open while a radar missile still has a drone to wait for
    const waiting = aam.some(x => !fired.has(x)) && drones.some((d, i) => d.alive && !d.engaged && !(srm.length && i === drones.length - 1));
    const main = mainNeeded && s > dw0 - 0.3 * (dw0 - C.marks.turn) && (s < Math.max(lastRelease, lastMainS) + 70 * u || (waiting && s < dw1));
    // the side bay opens once the strike is under way and the heat-seeker's drone is getting close
    const near = drones.length && srm.length ? drones[drones.length - 1] : null;
    const sideOpen = started && (!!near && near.alive && !said.has('fox2') && near.p.distanceTo(trackPt(s)) < 330 * u || (srmAt >= 0 && s < srmAt + 90 * u));
    return { main: !!main, side: sideOpen };
  }

  const p0 = V(), q0 = V(), q1 = V(), tmp = V(), a = V(), dir = V();
  /** guidance: proportional navigation onto a drone (with a short loft after a radar missile lights), or a low run
   *  toward a ground aim point and a dive onto it; lateral acceleration only, limited to what the missile can pull */
  function steer(sh: Shot, dt: number) {
    const k = sh.s.kind, sp = sh.v.length();
    dir.copy(sh.v).divideScalar(Math.max(sp, 1e-6));
    a.set(0, 0, 0);
    if (sh.drone) {
      const Rv = tmp.copy(sh.drone.p).sub(sh.p), r2 = Math.max(Rv.lengthSq(), 1e-6);
      const Vr = q0.copy(sh.drone.v).sub(sh.v), Om = q1.copy(Rv).cross(Vr).divideScalar(r2), Rh = Rv.normalize();
      const Vc = Math.max(-Rh.dot(Vr), sp * 0.5);
      a.copy(Om).cross(Rh).multiplyScalar(4 * Vc);
      const off = dir.angleTo(Rh);                                          // far off the nose (just off the rail): pull round
      if (off > 0.3) a.addScaledVector(q0.copy(Rh).addScaledVector(dir, -Rh.dot(dir)).normalize(), 30 * G * Math.min(1, off));
      if (k === 'aam' && sh.t - sh.ign < 0.9) a.y += 3 * G;                 // loft: climb a little while the motor boosts
    } else {
      const h = Math.hypot(sh.aim.x - sh.p.x, sh.aim.z - sh.p.z);
      const goal = h > 90 * u ? tmp.set(sh.aim.x, Math.max(10 * u, sh.p.y - 4 * u), sh.aim.z) : tmp.copy(sh.aim);
      const want = goal.sub(sh.p).normalize();
      a.copy(want).addScaledVector(dir, -want.dot(dir)).multiplyScalar(sp * 2.4);
    }
    a.addScaledVector(dir, -a.dot(dir));
    const aMax = (k === 'srm' ? 55 : k === 'aam' ? 38 : 8) * G;
    if (a.lengthSq() > aMax * aMax) a.setLength(aMax);
    const top = k === 'cruise' ? 2.3 * VC : 4.2 * VC, thrust = k === 'cruise' ? 1.2 * VC : 3.4 * VC;
    sh.v.addScaledVector(a, dt).setLength(Math.min(top, sp + thrust * dt));
  }

  /** one frame: s is the circuit position (−1 when the jet is not flying it); bay positions gate the releases */
  function update(now: number, dt: number, s: number, bayMainT: number, baySideT: number) {
    clock = now;
    R.craft.getWorldDirection(fwd); vel.copy(fwd).multiplyScalar(s >= 0 ? C.speed(s) : 0);
    down.set(0, -1, 0).applyQuaternion(R.craft.getWorldQuaternion(new THREE.Quaternion()));
    const jet = R.craft.position;
    if (s >= C.marks.liftoff && s < dw1) root.visible = true;          // the range is in view from lift-off
    if (s >= dw0 && !started && s < dw1) begin();
    if (started && s >= dw0 && s <= dw1) {
      const mainOpen = bayMainT > 0.98, sideOpen = baySideT > 0.98, ready = (x: Store) => x.bay === 'none' || (x.bay === 'main' ? mainOpen : sideOpen);
      // radar missiles: one at each far drone once it is in range
      drones.forEach((d, i) => {
        if (!d.alive || d.engaged || (srm.length && i === drones.length - 1)) return;
        const m = aam.find(x => !fired.has(x) && ready(x));
        if (m && d.p.distanceTo(jet) < (d.big ? 650 : 440) * u) { d.engaged = true; fired.add(m); release(m, { drone: d }); lastMainS = s; once('fox3', 'fox three'); }
      });
      const near = srm.length ? drones[drones.length - 1] : null;
      if (near && near.alive && !near.engaged) {
        const m = srm.find(x => !fired.has(x) && ready(x));
        if (m && near.p.distanceTo(jet) < 210 * u) { near.engaged = true; fired.add(m); release(m, { drone: near }); srmAt = s; once('fox2', 'fox two'); }
      }
      bombs.forEach((b, i) => {
        if (fired.has(b) || s < bombRel[i] || !ready(b)) return;
        const tj = targets[Math.round(i * (targets.length - 1) / Math.max(1, bombs.length - 1))];
        fired.add(b); release(b, { target: tj, aim: tj.at.clone().add(V((rnd() - 0.5) * 4 * u, 0, (rnd() - 0.5) * 4 * u)) });
        lastMainS = Math.max(lastMainS, s); once('bombs', 'bombs away');
      });
      cruise.forEach((c, i) => {
        if (fired.has(c) || s < cruiseRel[i] || !ready(c)) return;
        const tj = targets[i % targets.length];
        fired.add(c); release(c, { target: tj }); once('rifle', 'rifle');
      });
    }

    // drones: fly on; a hit one tumbles down burning, trailing black smoke, and bursts on the ground
    for (const d of drones) {
      if (!d.g.visible) continue;
      if (d.falling) {
        d.v.y -= G * dt; d.g.rotation.x += d.spin.x * dt; d.g.rotation.z += d.spin.z * dt;
        if (real) {
          const k = d.big ? 2.2 : 1;
          PX.smoke.emit(d.p, { v: dirR().multiplyScalar(1.5 * u), s0: 1.2 * u * k, s1: 6 * u * k, life: 5 + 2 * rnd(), c: BLACK, a: 0.8, drag: 1, rise: 0.4 * u });
          PX.fire.emit(d.p, { v: dirR().multiplyScalar(2 * u), s0: 1.6 * u * k, s1: 0.6 * u * k, life: 0.35 + 0.3 * rnd(), c: HOT, c1: EMBER, drag: 2 });
        }
      }
      d.p.addScaledVector(d.v, dt); d.g.position.copy(d.p);
      if (!d.falling) d.g.lookAt(tmp.copy(d.p).add(d.v));
      if (d.falling && d.p.y < 0.5) { d.g.visible = false; explode(d.p.clone().setY(0.5), (d.big ? 10 : 5) * u, false); }
      if (!d.falling && d.p.distanceTo(jet) > 1500 * u) d.g.visible = false;
    }

    // weapons
    for (const sh of shots) {
      if (sh.done) continue;
      sh.t += dt;
      const k = sh.s.kind;
      p0.copy(sh.p);
      if (k === 'bomb') {
        const t = Math.min(1, sh.t / sh.dur), [A, B, Cc] = sh.bez!, it = 1 - t;
        sh.p.set(0, 0, 0).addScaledVector(A, it * it).addScaledVector(B, 2 * it * t).addScaledVector(Cc, t * t);
        sh.v.copy(B).sub(A).multiplyScalar(2 * it).addScaledVector(tmp.copy(Cc).sub(B), 2 * t);
        if (t >= 1) { land(sh); continue; }
      } else {
        if (!sh.lit && sh.t >= sh.ign) ignite(sh);
        if (!sh.lit) sh.v.y -= G * dt;                                     // falls clear, nose level, before the motor lights
        else steer(sh, dt);
        sh.p.addScaledVector(sh.v, dt);
        // proximity fuze: the closest approach to the drone anywhere along this frame's path, in the drone's frame
        if (sh.drone && sh.lit && sh.drone.alive) {
          q0.copy(p0).sub(sh.drone.p).addScaledVector(sh.drone.v, dt); q1.copy(sh.p).sub(sh.drone.p);
          const seg = tmp.copy(q1).sub(q0), L2 = seg.lengthSq(), tc = L2 > 0 ? THREE.MathUtils.clamp(-q0.dot(seg) / L2, 0, 1) : 1;
          if (q0.addScaledVector(seg, tc).length() < fuze(sh.drone)) { sh.p.lerpVectors(p0, sh.p, tc); land(sh, true); continue; }
        }
        if ((sh.target && (sh.p.y < sh.aim.y + 1.2 * u || sh.p.distanceTo(sh.aim) < 3 * u)) || sh.t > 9 || (sh.drone && !sh.drone.alive && sh.t > 1)) { land(sh); continue; }
      }
      sh.pivot.position.copy(sh.p);
      // nose level while it falls clear; then it points where it flies
      const look = !sh.lit && k !== 'bomb' ? sh.f0 : dir.copy(sh.v).normalize();
      sh.pivot.quaternion.setFromUnitVectors(sh.f0, look.lengthSq() > 0.5 ? look : sh.f0);
      if (k === 'bomb') continue;
      // motor: plume and smoke trail (real), accent glow and trail line (hairline)
      const nozzle = tmp.copy(sh.p).addScaledVector(look, -sh.len * 0.5);
      if (sh.plume) sh.plume.set(real && sh.lit ? (sh.t - sh.ign < 0.15 ? 1.3 : 1) : 0, now);
      if (real && sh.lit) {
        // smoke laid every metre or so along the path since the last frame, aged so the line is even
        // (puffs start wider than their spacing, so the trail is one unbroken ribbon that widens and thins behind)
        const from = sh.tail ?? nozzle, gap = from.distanceTo(nozzle), step = 0.5 * u, n = Math.min(120, Math.floor(gap / step));
        for (let i = 1; i <= n; i++) {
          const f = i / n, at = q0.copy(from).lerp(nozzle, f);
          PX.smoke.emit(at, { v: dirR().multiplyScalar(0.8 * u).addScaledVector(sh.v, 0.04), s0: 1.4 * u, s1: (k === 'cruise' ? 2.2 : 3.8) * u, life: (k === 'cruise' ? 2 : 3.6) + 0.8 * rnd(), c: WHITE, a: k === 'cruise' ? 0.16 : k === 'aam' ? 0.3 : 0.36, drag: 1.6, rise: 0.12 * u, age: (1 - f) * dt });
        }
        if (n > 0 || !sh.tail) sh.tail = (sh.tail ?? V()).copy(n > 0 ? nozzle : from);
        PX.fire.emit(nozzle, { v: q0.copy(sh.v).multiplyScalar(0.92), s0: sh.len * 0.16, s1: sh.len * 0.08, life: 0.06, c: [7, 5, 2.6], drag: 0 });
      }
      sh.motor.visible = !real && sh.lit; sh.motor.position.copy(nozzle); sh.motor.material.uniforms.intensity.value = 1.2;
      sh.pts.copyWithin(3, 0, 63 * 3); sh.pts.set([sh.p.x, sh.p.y, sh.p.z], 0); sh.n = Math.min(64, sh.n + 1);
      sh.trail.geometry.attributes.position.needsUpdate = true; sh.trail.geometry.setDrawRange(0, sh.n); sh.trail.visible = !real && sh.lit;
    }

    // explosions: hairline flash and ring; the light flash follows the newest burst
    for (const b of booms) {
      if (!b.on) continue;
      b.t += dt; const t = b.t, s0 = b.size;
      b.line.visible = !real && t < 1.2;
      b.glow.material.uniforms.intensity.value = 2 * Math.max(0, 1 - t / 0.9);
      b.ring.scale.setScalar(s0 * (0.3 + 2.4 * ss(t / 0.75))); b.ring.visible = t < 0.75;
      if (t > 1.2) { b.on = false; b.line.visible = false; }
    }
    for (const f of flashes) { const b = f.owner; f.l.intensity = real && b && b.t < 0.6 ? 900 * u * u * (b.size / (7 * u)) * Math.pow(1 - b.t / 0.6, 2) : 0; }

    // fires on destroyed targets: a flickering accent glow, or flames under a column of black smoke
    for (const t of targets) {
      const f = t.hit && root.visible, fl = 0.75 + 0.25 * Math.sin(now * 0.021 + t.at.x) * Math.sin(now * 0.013 + t.at.z);
      t.fire.visible = f && !real; t.fire.material.uniforms.intensity.value = 0.9 * fl;
      if (!f || !real) continue;
      const k = t.size;
      for (let i = 0; i < 2; i++) if (rnd() < dt * 22) PX.fire.emit(tmp.copy(t.at).add(V((rnd() - 0.5) * 6 * k, 0.6 * k, (rnd() - 0.5) * 6 * k)), { v: V(0, 3.5 * k, 0), s0: 2.6 * k, s1: 0.9 * k, life: 0.55 + 0.4 * rnd(), c: [5, 2.3, 0.7], c1: EMBER, drag: 0.5, rise: 3 * k });
      if (rnd() < dt * 7) PX.smoke.emit(tmp.copy(t.at).add(V((rnd() - 0.5) * 3 * k, 4 * k, (rnd() - 0.5) * 3 * k)), { v: V(0, 3 * k, 0), s0: 3 * k, s1: 13 * k, life: 9 + 3 * rnd(), c: BLACK, a: 0.75, drag: 0.25, rise: 0.25 * k });
    }

    // smoke and fire
    PX.group.visible = real;
    if (real) PX.update(dt, wind);
  }

  /** after landing (or when the demo stops): weapons back on the jet, the range cleared */
  function reset() {
    for (const sh of shots) {
      const o = sh.s.obj, sv = saved.get(o)!;
      sv.parent.add(o); o.position.copy(sv.p); o.quaternion.copy(sv.q); o.scale.copy(sv.s);
      sh.plume?.group.traverse(x => { const m = x as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
      fx.remove(sh.pivot, sh.trail, sh.motor); sh.trail.geometry.dispose(); (sh.trail.material as THREE.Material).dispose();
    }
    shots.length = 0; saved.clear(); held = null; fired = new Set(); said = new Set(); kills = hits = 0; started = false; lastMainS = srmAt = -1;
    root.visible = false; drones.forEach(d => { d.g.visible = false; });
    targets.forEach(t => { t.hit = false; t.intact.visible = true; t.rubble.visible = false; t.fire.visible = false; });
    booms.forEach(b => { b.on = false; b.line.visible = false; });
    flashes.forEach(f => { f.owner = null; f.l.intensity = 0; });
    PX.clear();
  }

  /** compile every material the strike can show, as the real view will draw it, so nothing compiles mid-fight */
  function warm() {
    const r = E.renderer, shown: THREE.Object3D[] = [];
    for (const g of [root, fx]) g.traverse(o => { if (!o.visible) { shown.push(o); o.visible = true; } });
    const prev = r.getRenderTarget(); r.setRenderTarget(E.composer.readBuffer);
    try { r.compileAsync(E.scene, E.camera).catch(() => {}); } catch { /* a compile problem shows up as a normal draw later */ }
    r.setRenderTarget(prev);
    shown.forEach(o => { o.visible = false; });
  }

  /** the line / real switch for everything the strike owns */
  function setReal(on: boolean) {
    real = on;
    for (const d of duals) { d.m.material = on ? d.real : d.line; d.m.castShadow = d.m.receiveShadow = on; }
    root.traverse(o => { if ((o as { isLineSegments2?: boolean }).isLineSegments2 || o.userData.outline) o.visible = !on; });
    if (!on) { PX.clear(); PX.group.visible = false; shots.forEach(sh => sh.plume?.set(0, 0)); }
    else { protoPlume.set(1, 0); warm(); protoPlume.set(0, 0); }
  }

  // ── what the pilot's view reads ──
  let clock = 0, held: { at: THREE.Vector3; t: number } | null = null;
  /** where a pilot would be looking: the newest weapon's target until it hits and a moment after (the burst), else the
   *  nearest live drone ahead; false when there is nothing to watch */
  function focus(out: THREE.Vector3) {
    if (!started) return false;
    for (let i = shots.length - 1; i >= 0; i--) {
      const sh = shots[i]; if (sh.done) continue;
      out.copy(sh.drone ? sh.drone.p : sh.aim); held = { at: out.clone(), t: clock }; return true;
    }
    if (held && clock - held.t < 1600) { out.copy(held.at); return true; }
    const jet = R.craft.position; R.craft.getWorldDirection(fwd);
    let best: Drone | null = null, bd = 600 * u;
    for (const d of drones) { if (!d.alive || !d.g.visible) continue; const r = d.p.distanceTo(jet); if (r < bd && tmp.copy(d.p).sub(jet).dot(fwd) > 0) { bd = r; best = d; } }
    if (best) { out.copy(best.p); return true; }
    return false;
  }
  /** weapons still aboard, by kind */
  const remaining = () => ({ aam: aam.filter(x => !fired.has(x)).length, srm: srm.filter(x => !fired.has(x)).length, bomb: bombs.filter(x => !fired.has(x)).length, cruise: cruise.filter(x => !fired.has(x)).length });

  return {
    begin, bays, update, reset, setReal, focus, remaining, get active() { return started; },
    /** the run as the pilot's head-up display shows it */
    contacts: { drones: drones as readonly Drone[], targets: targets as readonly Target[], shots: shots as readonly Shot[] },
  };
}
export type Strike = ReturnType<typeof createStrike>;
