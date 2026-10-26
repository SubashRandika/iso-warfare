// The demo's flight: a left-hand circuit from the parking spot and back to it, on a runway along +z.
// Take-off roll (accelerating from rest), rotation, lift-off and climb, a banked 180° turn onto the downwind leg,
// another onto final, a glide with a flare, touchdown and a roll-out that stops exactly where it began.
// Everything scales with `u` (the airframe's size relative to a fighter), so a bomber takes a longer run at higher
// speed and every jet takes about the same time. Positions are in metres from the parking spot (x left, z forward).
import * as THREE from 'three';

const ss = (t: number) => { const x = THREE.MathUtils.clamp(t, 0, 1); return x * x * (3 - 2 * x); };

export interface CircuitPoint { x: number; z: number; psi: number; alt: number; pitch: number; bank: number }

export function circuit(u: number) {
  const ROLL = 150 * u, LIFT = 50 * u, CLIMB = 170 * u, OUT = 60 * u, R = 95 * u, GLIDE = 330 * u, RO = 140 * u, H = 28 * u;
  const VR = 38 * u, VC = 85 * u, VA = 46 * u;                    // rotation, circuit and approach speeds (m/s)
  const Lout = ROLL + LIFT + CLIMB + OUT, Lback = GLIDE + RO, ARC = Math.PI * R;
  // legs: upwind, turn, downwind, turn, final; each starts at (x, z) heading psi (0 = +z, π/2 = +x, i.e. left)
  const legs = [
    { s: 0, len: Lout, arc: false, x: 0, z: 0, psi: 0 },
    { s: Lout, len: ARC, arc: true, x: 0, z: Lout, psi: 0 },
    { s: Lout + ARC, len: Lout + Lback, arc: false, x: 2 * R, z: Lout, psi: Math.PI },
    { s: 2 * Lout + Lback + ARC, len: ARC, arc: true, x: 2 * R, z: -Lback, psi: Math.PI },
    { s: 2 * Lout + Lback + 2 * ARC, len: Lback, arc: false, x: 0, z: -Lback, psi: 2 * Math.PI },
  ];
  const length = legs[4].s + Lback;
  const liftoff = ROLL + LIFT, climbed = liftoff + CLIMB, glide = legs[4].s, touchdown = length - RO;

  const alt = (s: number) => s < liftoff ? 0 : s < climbed ? H * ss((s - liftoff) / CLIMB) : s < glide ? H : s < touchdown ? H * (1 - ss((s - glide) / GLIDE)) : 0;
  /** left bank in degrees (negative): rolled in and out over the first and last fifth of each turn */
  const bank = (s: number) => {
    for (const l of [legs[1], legs[3]]) if (s > l.s && s < l.s + l.len) return -28 * Math.min(1, (s - l.s) / (0.2 * l.len), (l.s + l.len - s) / (0.2 * l.len));
    return 0;
  };
  // big jets rotate less: a B-52 lifts off almost level, a fighter rotates about 7°
  const rk = Math.min(1, 1.6 / (u + 0.6));
  const rotation = (s: number) => rk * (s < ROLL ? 0 : s < liftoff ? 7 * ss((s - ROLL) / LIFT) : 7 * (1 - ss((s - liftoff) / (80 * u))));
  const flare = (s: number) => rk * (s < touchdown - 60 * u ? 0 : s < touchdown ? 6 * ss((s - touchdown + 60 * u) / (60 * u)) : 6 * (1 - ss((s - touchdown) / (30 * u))));

  function at(s: number): CircuitPoint {
    let l = legs[0]; for (const g of legs) if (s >= g.s) l = g;
    const d = Math.min(s - l.s, l.len);
    let x: number, z: number, psi: number;
    if (l.arc) {                                       // left turn: centre on the left of the heading
      const cx = l.x + R * Math.cos(l.psi), cz = l.z - R * Math.sin(l.psi);
      psi = l.psi + d / R; x = cx - R * Math.cos(psi); z = cz + R * Math.sin(psi);
    } else { psi = l.psi; x = l.x + Math.sin(psi) * d; z = l.z + Math.cos(psi) * d; }
    const a = alt(s), gamma = THREE.MathUtils.radToDeg(Math.atan((alt(s + u) - alt(s - u)) / (2 * u)));
    // nose up on the climb; on the approach the jet descends nose-slightly-up, so the descent shows only a little
    const attitude = a > 0.02 ? (s >= glide ? 4 : 2.5) * Math.min(1, a / 3) : 0;
    return { x, z, psi, alt: a, bank: bank(s), pitch: (gamma < 0 ? 0.3 * gamma : gamma) + attitude + rotation(s) + flare(s) };
  }
  /** ground speed at s: constant acceleration on the roll, constant deceleration on the roll-out */
  function speed(s: number) {
    if (s < ROLL) return VR * Math.sqrt(Math.max(s, 0.4 * u) / ROLL);
    if (s < climbed) return THREE.MathUtils.lerp(VR, VC, ss((s - ROLL) / (LIFT + CLIMB)));
    if (s < legs[3].s) return VC;
    if (s < glide) return THREE.MathUtils.lerp(VC, VA, (s - legs[3].s) / ARC);
    if (s < touchdown) return VA;
    return Math.max(1.5 * u, VA * Math.sqrt(Math.max(0, length - s) / RO));
  }

  return {
    length, at, speed, VC, u,
    marks: { rotate: ROLL, liftoff, climbed, turn: legs[1].s, downwind: [legs[2].s, legs[2].s + legs[2].len] as const, finalTurn: legs[3].s, glide, touchdown, flare: touchdown - 60 * u },
    /** the runway under the circuit: threshold behind the touchdown point to well past the lift-off point */
    runway: { z0: -RO - 130 * u, z1: liftoff + 230 * u, w: 32 * u },
  };
}
export type Circuit = ReturnType<typeof circuit>;
