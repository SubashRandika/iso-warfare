// M17 (SIG Sauer P320): a working magazine, slide, trigger, safety, slide stop and takedown.
// Coordinates in metres: +z toward the muzzle, +y up, +x to the pistol's left (three.js is right-handed:
// the ejection port is on the -x side). Like every small arm it floats raised
// above the floor with no stand: the grip's base is GY above the mat, so a dropped magazine falls onto the mat and
// spent cases land beside it. A field-stripped slide floats clear in front of the frame.
// Accent (live) parts: the tritium sight dots and the muzzle flash.
import * as THREE from 'three';
import type { ModelFactory } from '../../../core/types';
import { approach, clamp01, DEG, ease, phase, SIDES } from '../../../core/anim';
import { loft } from '../../../iso/geo';
import { makeKit } from '../../../kit/build';
import { buildPlate } from '../../../stages/plate';

const CAP = 17;
const SLIDE_BACK = 0.034, LOCK_BACK = 0.03, STRIP_FWD = 0.205;
const MAG_DIR = new THREE.Vector3(0, -0.951, -0.309);   // down the grip axis (18° rake)
const GY = 0.135;                                         // grip base above the mat
const MAG_DROP = (GY - 0.011) / 0.951;                   // until the base plate meets the mat

type Cmd = ['M', number, number] | ['L', number, number] | ['Q', number, number, number, number];
const trace = (p: THREE.Path, cmds: Cmd[]) => cmds.forEach(c => c[0] === 'M' ? p.moveTo(c[1], c[2]) : c[0] === 'L' ? p.lineTo(c[1], c[2]) : p.quadraticCurveTo(c[1], c[2], c[3], c[4]));
/** a side profile in (z, y) with optional holes */
const profile = (cmds: Cmd[], holes: Cmd[][] = []) => {
  const s = new THREE.Shape(); trace(s, cmds);
  holes.forEach(h => { const p = new THREE.Path(); trace(p, h); s.holes.push(p); });
  return s;
};
/** extrude a (z, y) profile across x0..x1, with a small chamfer on every edge */
const across = (s: THREE.Shape, x0: number, x1: number, bevel = 0.0008) => {
  const g = new THREE.ExtrudeGeometry(s, { depth: x1 - x0 - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 });
  g.rotateY(-Math.PI / 2); g.translate(x1 - bevel, 0, 0);
  return g;
};

const model: ModelFactory = ({ E, snd, script, say }) => {
  const K = makeKit(E, { unit: 0.02 });
  const { add, part, hinge, box, well, lines } = K;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const gun = K.root; gun.position.y = GY;                // raised, no stand
  const bench = buildPlate(E, { w: 0.72, d: 0.44, cx: -0.08, cz: 0.09, grid: 0.01, ruler: true, shadow: [0.16, 0.34, -0.01, 0.1] });


  // ═════ frame (grip module) ═════
  const pFrame = part('frame', gun);
  const FW = 0.0135;
  add(pFrame, across(profile([
    ['M', -0.007, 0.094], ['L', 0.190, 0.094], ['L', 0.192, 0.089], ['L', 0.190, 0.079], ['L', 0.134, 0.079],
    ['Q', 0.131, 0.050, 0.110, 0.045], ['Q', 0.088, 0.043, 0.074, 0.056],
    ['L', 0.0545, 0.002], ['Q', 0.054, 0, 0.050, 0], ['L', -0.008, 0], ['Q', -0.012, 0, -0.011, 0.004],
    ['L', 0.008, 0.064], ['Q', 0.011, 0.080, -0.010, 0.088], ['L', -0.007, 0.094],
  ], [[['M', 0.084, 0.072], ['L', 0.124, 0.072], ['Q', 0.124, 0.054, 0.108, 0.052], ['Q', 0.092, 0.051, 0.084, 0.060], ['L', 0.084, 0.072]]]), -FW, FW));
  for (const k of SIDES) {                                        // grip texture panels and the accessory-rail groove
    const x = k * (FW + 0.0003), ring = (pts: [number, number][]) => pts.map(([z, y]) => V(x, y, z));
    const loop = (pts: [number, number][]) => { const r = ring(pts); pFrame.add(E.loopLine(r, E.mats.line)); };
    loop([[-0.002, 0.010], [0.050, 0.010], [0.062, 0.048], [0.010, 0.054]]);
    loop([[0.004, 0.016], [0.045, 0.016], [0.054, 0.043], [0.013, 0.048]]);
    lines(pFrame, [[V(x, 0.0835, 0.137), V(x, 0.0835, 0.188)]]);
  }
  // fire control unit: the steel chassis on top of the frame, seen once the slide is off
  const pFcu = part('chassis', gun);
  add(pFcu, box(-0.0105, 0.0105, 0.094, 0.0985, 0.016, 0.184));
  for (const k of SIDES) for (const [z0, z1] of [[0.02, 0.05], [0.15, 0.18]]) add(pFcu, box(k > 0 ? 0.0085 : -0.0115, k > 0 ? 0.0115 : -0.0085, 0.0985, 0.1015, z0, z1));

  // ═════ trigger, safety, slide stop, takedown lever ═════
  const pTrig = part('trigger', gun);
  // as on the M17: the finger sits in front of the blade and pulls it back, so the front face is concave; the blade
  // bulges back toward the grip and its tip curls forward toward the muzzle
  const trig = hinge(pTrig, V(0, 0.074, 0.1015), V(1, 0, 0), 'x');
  add(trig.inner, across(profile([
    ['M', 0.0985, 0.075], ['L', 0.1045, 0.075],
    ['Q', 0.0960, 0.065, 0.1035, 0.0555],        // front (finger) face, concave toward the muzzle
    ['Q', 0.1015, 0.0535, 0.0985, 0.0552],       // rounded tip, curling forward
    ['Q', 0.0915, 0.0655, 0.0985, 0.075],        // rear edge, bulging toward the grip
  ]), -0.003, 0.003, 0.0005));
  const pSafe = part('safety', gun), safeH: ReturnType<typeof hinge>[] = [];
  const pStop = part('slideStop', gun), stopG = new THREE.Group(); pStop.add(stopG);
  const pTake = part('takedown', gun), takeH: ReturnType<typeof hinge>[] = [];
  for (const k of SIDES) {
    const xo = k * FW, xs = k * (FW + 0.0018), lo = Math.min(xo, xs), hi = Math.max(xo, xs);
    const h = hinge(pSafe, V(xo, 0.086, 0.020), V(1, 0, 0), 'x'); safeH.push(h);
    add(h.inner, box(lo, hi, 0.0832, 0.0888, 0.003, 0.024));
    add(stopG, box(lo, hi, 0.0862, 0.0912, 0.086, 0.113));
    add(stopG, box(lo, hi, 0.0912, 0.0935, 0.104, 0.113));
    if (k > 0) { const t = hinge(pTake, V(xo, 0.086, 0.133), V(1, 0, 0), 'x'); takeH.push(t); add(t.inner, box(lo, hi, 0.0825, 0.0895, 0.124, 0.142)); }
  }

  // ═════ slide, barrel, sights ═════
  const slideG = new THREE.Group(); gun.add(slideG);
  const pSlide = part('slide', slideG);
  const SB = 0.094;
  const ring = (z: number, top: number, w: number, c: number) => [V(-w, SB, z), V(w, SB, z), V(w, top - c, z), V(w - c, top, z), V(-w + c, top, z), V(-w, top - c, z)];
  const slideGeo = loft([ring(0.005, 0.127, 0.0125, 0.0042), ring(0.178, 0.127, 0.0125, 0.0042), ring(0.196, 0.119, 0.0115, 0.0042)], { capStart: true, capEnd: true }).build();
  add(pSlide, slideGeo);
  well(pSlide, [V(0.003, 0.1271, 0.104), V(-0.0083, 0.1271, 0.104), V(-0.0083, 0.1271, 0.146), V(0.003, 0.1271, 0.146)], V(0, 1, 0));       // ejection port (right side)
  well(pSlide, [V(-0.01256, 0.110, 0.104), V(-0.01256, 0.1228, 0.104), V(-0.01256, 0.1228, 0.146), V(-0.01256, 0.110, 0.146)], V(-1, 0, 0));
  pSlide.add(E.loopLine([V(-0.0075, 0.1272, 0.03), V(0.0075, 0.1272, 0.03), V(0.0075, 0.1272, 0.075), V(-0.0075, 0.1272, 0.075)], E.mats.line));   // optic cover plate
  { const ser: [THREE.Vector3, THREE.Vector3][] = [];
    for (const k of SIDES) {
      const x = k * 0.01256;
      for (let z = 0.010; z <= 0.0401; z += 0.004) ser.push([V(x, 0.099, z), V(x, 0.1215, z)]);
      for (let z = 0.150; z <= 0.1741; z += 0.004) ser.push([V(x, 0.099, z), V(x, 0.1215, z)]);
    }
    lines(pSlide, ser);
  }
  const pBarrel = part('barrel', slideG);
  { const b = new THREE.CylinderGeometry(0.0068, 0.0068, 0.158, 16); b.rotateX(Math.PI / 2); b.translate(0, 0.111, 0.1188); add(pBarrel, b);
    const bore = new THREE.Mesh(new THREE.CircleGeometry(0.0044, 20), E.mats.recess); bore.position.set(0, 0.111, 0.1979); pBarrel.add(bore); }
  const pSights = part('sights', slideG);
  add(pSights, box(-0.0085, 0.0085, 0.127, 0.130, 0.009, 0.021));
  for (const k of SIDES) add(pSights, box(k > 0 ? 0.0018 : -0.0085, k > 0 ? 0.0085 : -0.0018, 0.130, 0.1345, 0.009, 0.021));
  add(pSights, box(-0.0016, 0.0016, 0.127, 0.1345, 0.170, 0.178));
  const tritMat = E.glowMat(), dots = [V(-0.0045, 0.1316, 0.0088), V(0.0045, 0.1316, 0.0088), V(0, 0.1318, 0.1698)];
  dots.forEach(p => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.0011, 12, 8), tritMat); m.position.copy(p); pSights.add(m); });
  const tritGlow = E.glowPoints(dots.map(p => p.clone().add(V(0, 0, -0.0008))), 0.011); pSights.add(tritGlow);

  // ═════ magazine ═════
  const pMag = part('magazine', gun);
  add(pMag, across(profile([['M', 0.002, 0], ['L', 0.040, 0], ['L', 0.068, 0.086], ['L', 0.030, 0.086], ['L', 0.002, 0]]), -0.0105, 0.0105, 0.0005));
  add(pMag, across(profile([['M', -0.006, -0.011], ['L', 0.047, -0.011], ['L', 0.046, 0], ['L', -0.005, 0], ['L', -0.006, -0.011]]), -0.0125, 0.0125, 0.0006));
  const topRound = new THREE.Group(); pMag.add(topRound);
  const roundGeo = (() => {
    const c = new THREE.CylinderGeometry(0.0049, 0.0049, 0.019, 12); c.rotateX(Math.PI / 2); c.translate(0, 0, -0.0045);
    const n = new THREE.SphereGeometry(0.0045, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2); n.rotateX(Math.PI / 2); n.translate(0, 0, 0.005);
    return [c, n];
  })();
  roundGeo.forEach(g => { const m = add(topRound, g.clone()); m.position.set(0, 0.0895, 0.052); m.rotation.x = 18 * DEG; });

  // ═════ muzzle flash: accent glow, a flat accent star in the light theme, and a flash of real light ═════
  const flashMat = E.glowMat();
  const flashMesh = new THREE.Mesh((() => { const g = new THREE.ConeGeometry(0.012, 0.03, 6, 1, true); g.rotateX(-Math.PI / 2); g.translate(0, 0.111, 0.215); return g; })(), flashMat);
  flashMesh.raycast = () => {}; flashMesh.visible = false; gun.add(flashMesh);
  const flashGlow = E.glowPoints([V(0, 0.111, 0.212)], 0.16); gun.add(flashGlow);
  const flashLight = new THREE.PointLight(E.accent.getHex(), 0, 0.9, 2); flashLight.position.set(0, 0.12, 0.23); gun.add(flashLight); E.accentLights.push(flashLight);

  // ═════ cases and live rounds thrown from the ejection port ═════
  type Brass = { g: THREE.Group; v: THREE.Vector3; spin: THREE.Vector3; rest: boolean; bounced: boolean };
  const brass: Brass[] = [], CASE_R = 0.0049;
  const caseGeo = new THREE.CylinderGeometry(CASE_R, CASE_R, 0.019, 12);
  const noseGeo = (() => { const n = new THREE.SphereGeometry(0.0045, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2); n.translate(0, 0.0095, 0); return n; })();
  const drop = (b: Brass) => { b.g.removeFromParent(); b.g.traverse(o => (o as THREE.Mesh).geometry?.dispose()); };
  function eject(live: boolean) {
    if (brass.length >= 12) drop(brass.shift()!);
    const g = new THREE.Group(); E.scene.add(g);
    add(g, caseGeo.clone()); if (live) add(g, noseGeo.clone());
    gun.updateMatrixWorld();
    g.position.copy(gun.localToWorld(V(-0.009, 0.121, 0.125 + slideZ)));
    g.rotation.set(0, 0, Math.PI / 2);
    const r = () => Math.random() - 0.5;
    brass.push({ g, v: V(-0.42 + r() * 0.16, 0.9 + r() * 0.25, -0.2 + r() * 0.15), spin: V(r() * 30, r() * 20, 18 + r() * 10), rest: false, bounced: false });
  }

  // ═════ state ═════
  const st = {
    rounds: CAP, chamber: false, magIn: true, safe: true, night: false, stripped: false, locked: false,
    magT: 0, stripT: 0, safeT: 1, trigT: 0, stopT: 0,
    cycle: null as null | { kind: 'shot' | 'rack' | 'release'; t0: number; back: boolean; done: boolean; lock: boolean },
    shotAt: -1, trigAt: -1,
  };
  let slideZ = 0;
  const busy = () => !!st.cycle || (st.stripT > 0 && st.stripT < 1);

  /** the slide reached the rear: throw out what was in the chamber */
  function atRear(kind: 'shot' | 'rack' | 'release') {
    if (kind === 'shot') eject(false);
    else if (kind === 'rack' && st.chamber) eject(true);
    st.chamber = false;
    snd.click(0, 0.9);
  }
  /** on the way forward: feed from the magazine, or lock back on an empty one */
  function feed(): boolean {
    if (st.magIn && st.rounds > 0) { st.rounds--; st.chamber = true; return false; }
    return st.magIn;                              // an empty magazine's follower lifts the slide stop
  }

  const act = {
    fire() {
      if (st.stripped || st.stripT > 0) return say('reassemble first');
      if (busy()) return;
      st.trigAt = performance.now();
      if (st.safe) { snd.click(0, 0.6); return say('safety on'); }
      if (st.locked) return say('slide locked back');
      if (!st.chamber) { snd.click(0, 0.7); return say('click · chamber empty'); }
      st.cycle = { kind: 'shot', t0: performance.now() + 50, back: false, done: false, lock: false };
    },
    rack() {
      if (st.stripped || st.stripT > 0) return say('reassemble first');
      if (busy()) return;
      st.cycle = { kind: st.locked ? 'release' : 'rack', t0: performance.now(), back: false, done: false, lock: false };
      snd.click(0, 1.1);
    },
    magazine() {
      if (st.stripped) return say('reassemble first');
      if (st.magT > 0 && st.magT < 1) return;
      st.magIn = !st.magIn;
      if (st.magIn) { st.rounds = CAP; snd.click(0.28, 0.8); snd.thunk(0.3); }
      else { snd.click(0, 1.2); snd.tone(260, 0.09, 0.1, { type: 'triangle', at: 0.3 }); }
    },
    safety() { st.safe = !st.safe; snd.click(0, 1.35); },
    night() { st.night = !st.night; snd.button(); },
    strip() {
      if (busy()) return;
      if (!st.stripped) {
        if (st.magIn) return say('drop the magazine first');
        if (st.chamber) return say('clear the chamber first (rack it)');
        st.locked = false;
      }
      st.stripped = !st.stripped; snd.click(0, 0.8); snd.click(0.5, 1);
    },
    demo() {
      if (script.active) { script.stop(); return; }
      script.start();
      const { later, when } = script;
      const idle = () => !busy() && (st.magT === 0 || st.magT === 1);
      // each step waits for the pistol to settle (frames can be slow or throttled), then pauses a beat
      const steps: [() => void, number][] = [
        [() => { if (st.stripped) act.strip(); }, 300],
        [() => { if (!st.safe) act.safety(); if (st.magIn) act.magazine(); }, 700],
        [() => act.magazine(), 700],
        [() => act.rack(), 600],
        [() => act.safety(), 600],
        [() => act.fire(), 450], [() => act.fire(), 450], [() => act.fire(), 700],
        [() => { act.safety(); script.end(); }, 0],
      ];
      const step = (i: number) => when(idle, () => { steps[i][0](); if (i + 1 < steps.length) later(steps[i][1], () => step(i + 1)); });
      if (!st.night) act.night();
      step(0);
    },
  } satisfies Record<string, () => void>;

  // ═════ per frame ═════
  const flashK = (now: number) => st.shotAt < 0 ? 0 : Math.exp(-Math.max(0, now - st.shotAt) / 28) * (now >= st.shotAt ? 1 : 0);
  function tick(now: number, dt: number) {
    st.magT = approach(st.magT, st.magIn ? 0 : 1, (st.magIn ? 2.6 : 4) * dt);
    st.stripT = approach(st.stripT, st.stripped ? 1 : 0, 0.9 * dt);
    st.safeT = approach(st.safeT, st.safe ? 1 : 0, 9 * dt);
    st.stopT = approach(st.stopT, st.locked ? 1 : 0, 12 * dt);

    // slide: recoil or a hand rack, then home (or locked back), or off the frame when stripped
    let z = st.locked ? -LOCK_BACK : 0;
    const c = st.cycle;
    if (c) {
      const t = (now - c.t0) / 1000;
      const [tb, tf] = c.kind === 'shot' ? [0.022, 0.07] : c.kind === 'rack' ? [0.18, 0.16] : [0.06, 0.1];
      if (t >= 0) {
        if (c.kind === 'shot' && st.shotAt < c.t0) {   // the round goes off
          st.shotAt = c.t0;
          snd.burst(0.2, 0.55, { freq: 1700, q: 0.6 }); snd.burst(0.4, 0.4, { type: 'lowpass', freq: 320 }); snd.tone(95, 0.22, 0.25, { type: 'triangle', to: 40 });
        }
        const from = c.kind === 'release' ? -LOCK_BACK : 0;
        if (t < tb) z = THREE.MathUtils.lerp(from, -SLIDE_BACK, c.kind === 'shot' ? t / tb : ease(t / tb));
        else {
          if (!c.back) { c.back = true; atRear(c.kind); c.lock = feed(); }
          const f = clamp01((t - tb) / tf), home = c.lock ? -LOCK_BACK : 0;
          z = THREE.MathUtils.lerp(-SLIDE_BACK, home, c.kind === 'shot' ? f : ease(f));
          if (f >= 1) { st.locked = c.lock; st.cycle = null; snd.click(0, c.lock ? 0.8 : 1); }
        }
      } else z = st.locked ? -LOCK_BACK : 0;
    }
    z += STRIP_FWD * phase(st.stripT, 0.25, 1);
    slideZ = z;
    slideG.position.set(0, 0.006 * phase(st.stripT, 0.85, 1), z);

    // trigger, safety levers, slide stop, takedown lever
    const tt = st.trigAt < 0 ? 1 : (now - st.trigAt) / 1000;
    trig.set((tt < 0.05 ? tt / 0.05 : clamp01(1 - (tt - 0.08) / 0.12)) * 13 * DEG);
    safeH.forEach(h => h.set(-(1 - st.safeT) * 16 * DEG));
    stopG.position.y = st.stopT * 0.0028;
    takeH.forEach(h => h.set(-phase(st.stripT, 0, 0.25) * 90 * DEG));

    // magazine: falls down the grip axis onto the mat; loads back in and slows as it seats
    pMag.position.copy(MAG_DIR).multiplyScalar(MAG_DROP * st.magT * st.magT);
    topRound.visible = st.rounds > 0;

    // lights
    tritMat.emissiveIntensity = st.night ? 1.8 : 0;
    tritGlow.material.uniforms.intensity.value = st.night ? 0.95 : 0;
    const fk = flashK(now);
    flashMesh.visible = fk > 0.04; flashMat.emissiveIntensity = 2.4 * fk; flashMesh.scale.setScalar(0.7 + fk * 0.6);
    flashGlow.material.uniforms.intensity.value = fk * 1.4;
    flashLight.intensity = fk * 1.2;

    bench.shadowMat.uniforms.opacity.value = E.shadowStrength() * 0.8;

    // brass: thrown, tumbling, one small bounce, then at rest on its side on the mat (the last 12 stay)
    for (const b of brass) {
      if (b.rest) continue;
      b.v.y -= 9.8 * dt;
      b.g.position.addScaledVector(b.v, dt);
      b.g.rotation.x += b.spin.x * dt; b.g.rotation.y += b.spin.y * dt; b.g.rotation.z += b.spin.z * dt;
      if (b.g.position.y <= CASE_R) {
        b.g.position.y = CASE_R;
        if (!b.bounced && b.v.y < -0.4) { b.bounced = true; b.v.set(b.v.x * 0.35, -b.v.y * 0.25, b.v.z * 0.35); b.spin.multiplyScalar(0.3); snd.tone(3300, 0.07, 0.03); snd.tone(4300, 0.05, 0.02); }
        else { b.rest = true; b.g.rotation.set(0, b.g.rotation.y, Math.PI / 2); snd.tone(3000, 0.05, 0.015); }
      }
    }
  }

  function readout() {
    const p: string[] = [];
    p.push(st.magIn ? `${st.rounds} in magazine` : 'magazine out');
    p.push(st.chamber ? 'round chambered' : 'chamber empty');
    p.push(st.stripped || st.stripT > 0 ? (st.stripT >= 1 ? 'field-stripped' : 'stripping') : st.locked ? 'slide locked back' : st.safe ? 'safe' : 'fire');
    if (st.night) p.push('tritium');
    return p.join(' · ');
  }

  return {
    pickRoot: gun, parts: K.parts,
    view: { target: V(0.06, 0.15, 0.08), dist: 0.74, min: 0.2, max: 3 },
    actions: act, passive: ['night'],
    on: () => ({ demo: script.active, fire: !!st.cycle && st.cycle.kind === 'shot', rack: st.locked, magazine: st.magIn, safety: st.safe, night: st.night, strip: st.stripped }),
    tick, readout,
    dispose() { brass.forEach(drop); },
  };
};

export default model;
