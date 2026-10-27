// The shooting range: a first-person practice lane for any small arm (Real view only). The weapon leaves its bench
// for the shooter's hands and the camera becomes the shooter's eye (E.setEye with pointer-lock game controls).
//
//   mouse look · left button fires · right button (or Z) aims down the sights · wheel zooms while aiming
//   W A S D walk the bay behind the line · C kneel · Shift holds the breath (steadies the sights for a few seconds)
//   R reloads (magazine out, a full one in, slide released) · X safety · Space starts the drill · Escape leaves
//
// The bullet leaves the muzzle along the sights, zeroed at 15 m, so it goes where the sights point: aimed, the front
// post sits in the rear notch on the screen's centre and the wobble of the hold moves the sights (and the shot); from
// the hip the sights converge on the centre at 9 m. Free practice stands one target up at a time until it is hit; the
// drill (45 s after a shot-timer beep) pops targets at random across 5–25 m for shorter and shorter exposures, a few
// of them no-shoots, and scores the hits (A 5, C 3, D 1, no-shoot −10).
// Performance: everything is built on first use and compiled while the shooter steps up to the line; no lights are
// added (the stage lights the hall from its sun and a room environment); one ray per shot; holes are one instanced draw.
import * as THREE from 'three';
import type { Engine, EyeSpec } from '../iso/engine';
import type { Sound } from '../core/sound';
import type { StageOverride } from '../real/types';
import { createParticles } from '../real/smoke';
import { buildChamber, rangeLayout, type Surface } from './chamber';
import { createTargets, POINTS, type Target } from './targets';
import { buildHands } from './hands';
import type { RangeHud, RangeResult, ShotRecord, ShotZone } from './hud';
import type { BenchSpec, RangeGun } from './types';

const DRILL = 45, ZERO = 15, HIP_CONVERGE = 9;
const EYE = 1.62, KNEEL = 1.06;
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

export function createRange(E: Engine, snd: Sound, gun: RangeGun, bench: BenchSpec) {
  const L = rangeLayout(bench);
  const hall = buildChamber(L);
  const T = createTargets(L, hall.shield);
  const hands = buildHands(gun.grip); gun.root.add(hands.group);
  const fx = createParticles(E, 900, 320);
  const holes = createHoles(240);
  const root = new THREE.Group(); root.visible = false; root.add(hall.group, T.group, fx.group, holes.mesh); hall.group.visible = true;
  E.scene.add(root);
  const colliders: THREE.Object3D[] = [...hall.colliders, ...T.colliders];
  const ray = new THREE.Raycaster(); ray.far = 80;

  // ── lighting: house lights up (light theme), or a low-light range lit by the muzzle flash (dark theme) ──
  const focus = new THREE.Vector3(L.lane, L.floor, L.line + 10);
  const BRIGHT: StageOverride = { sky: false, env: 'room', envI: 0.45, exposure: 0.95, fog: { color: 0x2c2d2e, density: 0.011 }, bloom: 0.2, bloomT: 2.6,
    sun: { dir: new THREE.Vector3(0.18, 1, -0.5), intensity: 2.3, color: 0xfff3e6, focus, size: 19 } };
  // low light: only the floods over the target line are left on, dimmed; the hall falls away into the dark
  const LOW: StageOverride = { sky: false, env: 'room', envI: 0.05, exposure: 1.2, fog: { color: 0x07080a, density: 0.016 }, bloom: 0.6, bloomT: 1.4,
    sun: { dir: new THREE.Vector3(-0.1, 1, 0.45), intensity: 0.32, color: 0xb4c2e0, focus, size: 19 } };
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

  // ── weapon poses in camera space (x right, y up, −z ahead) ──
  const rearL = gun.sight.rear, frontL = gun.sight.front;
  const qLevel = new THREE.Quaternion().setFromUnitVectors(frontL.clone().sub(rearL).normalize(), new THREE.Vector3(0, 0, 1));
  const qAds = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI).multiply(qLevel);
  const pAds = new THREE.Vector3(0, 0, -gun.relief).sub(rearL.clone().applyQuaternion(qAds));
  const hipRear = new THREE.Vector3(0.115, -0.125, -gun.relief * 0.8);
  const qHip = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, -HIP_CONVERGE).sub(hipRear).normalize()).multiply(qAds);
  const pHip = hipRear.clone().sub(rearL.clone().applyQuaternion(qHip));

  // entry: the eye walks from the orbit view to the line while the weapon comes up off the bench
  let entryT0 = 0, entering = false;
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
      const len = Math.floor(c.sampleRate * 1.3), ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch); let lp = 0;
        for (let i = 0; i < len; i++) { const t = i / c.sampleRate; lp += (Math.random() * 2 - 1 - lp) * 0.35; d[i] = lp * Math.exp(-t * 4.2) * (t < 0.004 ? t / 0.004 : 1); }
        for (const [ms, g] of [[9, 0.8], [17, 0.6], [26, 0.5], [41, 0.35], [63, 0.25]]) d[Math.floor(ms / 1000 * c.sampleRate) + ch * 7] += g;   // walls, ceiling, booths
      }
      const conv = c.createConvolver(); conv.buffer = ir;
      roomIn = c.createGain(); const wet = c.createGain(); wet.gain.value = 0.5;
      roomIn.connect(conv).connect(wet).connect(snd.out);
    }
    return roomIn;
  }
  function roomShot() {
    const bus = roomBus(), c = snd.audio; if (!bus || !c) return;
    const t = c.currentTime, src = snd.noise(0.5), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.value = 3600;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.2, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    src.connect(f).connect(g).connect(bus); src.start(t); src.stop(t + 0.4);
    snd.tone(64, 0.42, 0.24, { type: 'sine', to: 32 });     // the hall's boom
  }
  const att = (d: number) => 1 / (1 + d / 9);
  const beep = () => { snd.tone(3000, 0.32, 0.075, { type: 'square' }); snd.tone(3000, 0.32, 0.04, { type: 'sine' }); };

  // ── the target line ──
  const groundAt = (x: number, z: number) => {
    const i = Math.round((x - L.lane) / L.laneW), cx = L.lane + i * L.laneW, hw = (L.bench.x1 - L.bench.x0) / 2;
    const z0 = i === 0 ? L.bench.z0 : L.line - 0.62;
    return Math.abs(i) <= 2 && Math.abs(x - cx) < hw && z > z0 && z < L.line ? 0 : L.floor;
  };
  function popOne(kind: 'hostile' | 'ns', until: number) {
    const free = T.list.filter(t => t.state === 'down' && t.i !== lastPopped);
    if (!free.length) return;
    const t = free[Math.floor(Math.random() * free.length)];
    T.pop(t, kind, sec, until); lastPopped = t.i;
    if (kind === 'hostile' && phase === 'live') stats.presented++;
    const a = att(t.dist + 2);                                // the lifter's motor and its stop
    snd.tone(150, 0.26, 0.03 * a, { type: 'sawtooth', to: 230 }); snd.click(0.3, 0.5);
  }
  function standing() { return T.list.filter(t => t.state !== 'down'); }

  function startDrill() {
    if (phase === 'setup' || reload?.ready) return;
    T.list.forEach(t => T.drop(t, sec));
    Object.assign(stats, { score: 0, shots: 0, hits: 0, presented: 0, noShoot: 0, zones: { A: 0, C: 0, D: 0 }, reactions: [] });
    shots = []; shotN = 0; result = null; phase = 'standby'; call('Shooter ready?');
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
      reaction: r.length ? Math.round(r.reduce((a, b) => a + b, 0) / r.length * 100) / 100 : 0,
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
    if (r === 'shot') shot();
    else if (r === 'safe') call('Safety on · X');
    else if (r === 'locked') call('Slide locked · R');
    else if (r === 'click') call(gun.state().rounds > 0 && gun.state().magIn ? 'Rack it · R' : 'Empty · R');
  }
  function shot() {
    gun.root.updateMatrixWorld(true);
    const rw = gun.root.localToWorld(tmpA.copy(rearL)), fw = gun.root.localToWorld(tmpB.copy(frontL)), mw = gun.root.localToWorld(tmpC.copy(gun.muzzle));
    const sd = fw.sub(rw).normalize();
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
    // recoil: the muzzle flips and the gun drives back into the hands; the eye follows a little and recovers most of it
    const r = 0.85 + Math.random() * 0.3, hip = 1 + (1 - aimK) * 0.35;
    kick.vRise += gun.recoil.rise * 30 * r * hip; kick.vPush += gun.recoil.push * 30 * r;
    kick.cam += 0.85 * DEG * r * hip; me.yaw += (Math.random() - 0.5) * 0.3 * DEG; me.pitch += 0.12 * DEG * r;
    roomShot();
    // a wisp of powder smoke from the muzzle
    for (let i = 0; i < 3; i++) fx.smoke.emit(mw.clone().addScaledVector(dir, 0.02 + i * 0.03), { v: dir.clone().multiplyScalar(0.6 + i * 0.3).add(new THREE.Vector3(0, 0.1, 0)), s0: 0.03, s1: 0.3, life: 1.5 + Math.random(), c: [0.72, 0.72, 0.7], a: 0.22, drag: 2.4, rise: 0.22 });
  }
  function struck(t: Target, zone: ShotZone) {
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
    const a = att(d), delay = d / 370 + d / 343;
    const dust = (c: readonly [number, number, number], k: number, size: number) => {
      for (let i = 0; i < k; i++) fx.smoke.emit(p.clone().addScaledVector(n, 0.02), { v: n.clone().multiplyScalar(0.5 + Math.random() * 0.8).add(rnd().multiplyScalar(0.5)), s0: size * 0.3, s1: size * (1 + Math.random()), life: 0.7 + Math.random() * 0.8, c, a: 0.75, drag: 3.2, rise: 0.04 });
    };
    if (s === 'steel') {
      const out = dir.clone().reflect(n);
      for (let i = 0; i < 10; i++) fx.fire.emit(p.clone(), { v: out.clone().multiplyScalar(2 + Math.random() * 4).add(rnd().multiplyScalar(3)), s0: 0.022, s1: 0.006, life: 0.1 + Math.random() * 0.16, c: [9, 5.5, 2.2], c1: [2, 0.4, 0.05], drag: 2, rise: -9 });
      dust([0.5, 0.5, 0.48], 2, 0.12);
      snd.tone(2100 + Math.random() * 700, 0.9, 0.11 * a, { at: delay }); snd.tone(3500, 0.45, 0.04 * a, { at: delay }); snd.burst(0.03, 0.12 * a, { freq: 4000, at: delay });
    } else if (s === 'rubber') { dust([0.1, 0.1, 0.1], 3, 0.16); snd.burst(0.05, 0.08 * a, { type: 'lowpass', freq: 500, at: delay }); }
    else if (s === 'paper') { dust([0.55, 0.43, 0.3], 2, 0.06); }
    else if (s === 'concrete') { dust([0.56, 0.56, 0.54], 5, 0.22); snd.burst(0.04, 0.14 * a, { freq: 2500, q: 0.7, at: delay }); }
    else { dust([0.3, 0.3, 0.3], 3, 0.12); snd.burst(0.04, 0.08 * a, { freq: 1200, at: delay }); }
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
    const h = THREE.MathUtils.lerp(EYE, KNEEL, smooth(me.kneel)), sp = Math.min(1, me.vel.length() / 2);
    pos.set(me.pos.x + Math.cos(me.bob) * 0.012 * sp, L.floor + h + Math.abs(Math.sin(me.bob)) * 0.018 * sp, me.pos.z);
    quat.setFromEuler(eyeEuler.set(me.pitch + kick.cam - reloadK() * 0.12, me.yaw + Math.PI, 0));
  }
  const gp = new THREE.Vector3(), gq = new THREE.Quaternion(), dq = new THREE.Quaternion(), de = new THREE.Euler(0, 0, 0, 'YXZ'), pivot = new THREE.Vector3();
  function handPose(cam: THREE.Camera) {
    const k = smooth(aimK);
    gp.lerpVectors(pHip, pAds, k); gq.slerpQuaternions(qHip, qAds, k);
    // the hold's wobble and breathing, the recoil flip and the reload tilt, all about the grip
    const steady = holding ? 0.2 : 1, sp = Math.min(1, me.vel.length() / 2);
    const A = 0.0021 * (k > 0.5 ? 1 : 1.8) * steady * (gasp > 0 ? 2.4 : 1) * (1 + sp * 2.5) * (1 - me.kneel * 0.35);
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

  const eyeSpec: EyeSpec = {
    fov: FOV, near: 0.02, far: 120,
    pose(pos, quat) {
      shooterEye(eyePos, eyeQ);
      if (entering) {
        const k = smooth(clamp((sec - entryT0) / 1.1, 0, 1));
        pos.lerpVectors(from.eye, eyePos, k); quat.slerpQuaternions(from.eyeQ, eyeQ, k);
      } else { pos.copy(eyePos); quat.copy(eyeQ); }
    },
    frame(cam) {
      const f = THREE.MathUtils.lerp(FOV, aimFov, smooth(aimK));
      if (Math.abs(cam.fov - f) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); }
      handPose(cam);
      const pt = sec - pullAt; hands.pull(pullAt < 0 ? 0 : pt < 0.035 ? pt / 0.035 : Math.max(0, 1 - (pt - 0.05) / 0.12));
      if (entering) {
        const k = smooth(clamp((sec - entryT0 - 0.25) / 0.9, 0, 1));
        gun.root.position.lerpVectors(from.gun, gun.root.position, k); gun.root.quaternion.slerpQuaternions(from.gunQ, gun.root.quaternion, k);
        hands.group.visible = k > 0.7;
      }
      gun.root.updateMatrixWorld(true);
    },
    exit() { exit(true); },
    lock: {
      look(dx, dy) {
        if (!on || entering) return;
        const k = 0.0021 * (E.camera as THREE.PerspectiveCamera).fov / FOV;
        me.yaw -= dx * k; me.pitch = clamp(me.pitch - dy * k, -1.35, 1.35);
      },
      button(b, down) {
        if (b === 0 && down) fire();
        if (b !== 2) return;
        const t = performance.now() / 1000;
        if (down) { rmbAt = t; rmbWas = aimToggle; aimHeld = true; return; }
        aimHeld = false;
        aimToggle = t - rmbAt < 0.3 ? !rmbWas : false;        // a tap flips the aim; letting go of a hold ends it
      },
      wheel(dy) { if (aimK > 0.5) aimFov = clamp(aimFov * Math.exp(dy * 0.0011), 30, 58); },
      locked(v, no) { captured = v; if (no) refused = true; if (!v) { keys.clear(); aimHeld = false; } },
    },
  };

  function clampPos(p: THREE.Vector3, prevZ: number) {
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
    if (entering && sec - entryT0 > 1.35) entering = false;

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

    // the drill
    T.tick(sec);
    for (const t of T.list) if (t.state === 'up' && sec > t.until) T.drop(t, sec);
    if (phase === 'free') {
      if (!standing().length && sec >= nextPop) { popOne('hostile', Infinity); nextPop = sec + 0.8; }
      if (standing().length) nextPop = Math.max(nextPop, sec + 0.8);
    } else if (phase === 'standby' && sec >= beepAt) {
      beep(); phase = 'live'; liveAt = lastShot = sec; nextPop = sec + 0.35; call('');
    } else if (phase === 'live') {
      const el = sec - liveAt, prog = el / DRILL;
      if (el >= DRILL) endDrill();
      else {
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
    hall.lamps.house.emissiveIntensity = lo ? 0.25 : 4.5;
    hall.lamps.flood.emissiveIntensity = lo ? 1.2 : 8;
    hall.lamps.exit.emissiveIntensity = 3.2;
    hall.lamps.hot.emissiveIntensity = hot ? 7 : 0.25;
    hall.lamps.cold.emissiveIntensity = hot ? 0.25 : 5;
    fx.update(dt, wind);
  }
  const wind = new THREE.Vector3(0, 0.02, 0.06);              // the range's ventilation draws smoke downrange

  // ── in and out ──
  let on = false;
  function warm() {
    const r = E.renderer, prev = r.getRenderTarget(); r.setRenderTarget(E.composer.readBuffer);
    try { r.compileAsync(E.scene, E.camera).catch(() => {}); } catch { /* compiles on first draw instead */ }
    r.setRenderTarget(prev);
  }
  function enter() {
    if (on) return;
    on = true; phase = 'setup'; entering = true; entryT0 = sec = performance.now() / 1000;
    from.eye.copy(E.orbitCamera.position); from.eyeQ.copy(E.orbitCamera.quaternion);
    from.gun.copy(gun.root.position); from.gunQ.copy(gun.root.quaternion);
    me.pos.set(L.lane, 0, L.bench.z0 - 0.24); me.yaw = 0; me.pitch = -0.05; me.vel.set(0, 0, 0); me.kneel = 0; me.kneelOn = false;
    aimK = 0; aimToggle = aimHeld = false; breath = 1; gasp = 0; Object.assign(kick, { rise: 0, vRise: 0, push: 0, vPush: 0, cam: 0 });
    shots = []; shotN = 0; result = null; lastShot = sec; called = { seq: called.seq + 1, text: 'Load and make ready' };
    root.visible = true; T.reset();
    gun.hold(true, { ground: groundAt, flash: 14 });
    shadows.length = 0;
    gun.root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { shadows.push([m, m.castShadow, m.receiveShadow]); m.receiveShadow = false; } });
    hands.group.visible = false;
    E.setEye(eyeSpec);
    warm();
    if (low() && !gun.state().night) gun.night();
    startReload(true);
  }
  function exit(byEngine = false) {
    if (!on) return;
    on = false;
    if (!byEngine) E.setEye(null);
    root.visible = false; hands.group.visible = false;
    for (const [m, c, r] of shadows) { m.castShadow = c; m.receiveShadow = r; }
    reload = null; timers.length = 0; keys.clear(); aimHeld = aimToggle = false;
    gun.hold(false);
    T.reset(); fx.clear(); holes.clear(); phase = 'setup';
  }

  const SKIP = new Set(['e', 'p', 'd', 'w', 'a', 's', 'f', 'r', 'z', 'x', 'c']);
  return {
    get on() { return on; },
    enter, exit, tick,
    /** keys while on the range; anything not listed falls through to the host (N night sights, T light, H, I, M) */
    keyDown(k: string, e: KeyboardEvent): boolean {
      if (!on) return false;
      if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift'].includes(k)) { keys.add(k); return true; }
      if (e.repeat) return SKIP.has(k) || k === 'space';
      if (k === 'f') fire();
      else if (k === 'r' || k === 'e') startReload();
      else if (k === 'z') aimToggle = !aimToggle;
      else if (k === 'x') { gun.safety(); call(gun.state().safe ? 'Safe' : 'Fire'); }
      else if (k === 'c') me.kneelOn = !me.kneelOn;
      else if (k === 'space' || k === 'Enter') { if (phase === 'free' || phase === 'done') startDrill(); else if (phase === 'live' || phase === 'standby') endDrill(); }
      else if (k === 'Escape') exit();
      else return SKIP.has(k);
      return true;
    },
    keyUp(k: string) { keys.delete(k); },
    blur() { keys.clear(); aimHeld = false; },
    /** the stage lights the hall from this while the range is on */
    stage(): StageOverride | null { return on ? (low() ? LOW : BRIGHT) : null; },
    hud(): RangeHud | null {
      if (!on) return null;
      const s = gun.state();
      return {
        kind: 'range', lane: L.mine, gun: gun.name, calibre: gun.calibre, phase, locked: captured || refused, lowLight: low(),
        time: phase === 'live' ? Math.max(0, Math.ceil((DRILL - (sec - liveAt)) * 10) / 10) : DRILL, par: DRILL,
        score: stats.score, shots: stats.shots, hits: stats.hits, presented: stats.presented, noShoot: stats.noShoot,
        rounds: s.rounds, cap: s.cap, chamber: s.chamber, magIn: s.magIn, safe: s.safe, slideLocked: s.locked, reloading: !!reload,
        aiming: aimK > 0.5, breath: holding || gasp > 0 || breath < 1 ? Math.round(breath * 20) / 20 : null,
        shotsList: shots.slice(-8), hit, call: called, result,
      };
    },
    dispose() {
      exit();
      root.removeFromParent(); hall.dispose(); T.dispose(); hands.group.removeFromParent(); hands.dispose(); fx.dispose(); holes.dispose();
    },
  };
}
export type Range = ReturnType<typeof createRange>;
