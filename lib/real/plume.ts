// Exhaust plumes for the realistic style. Afterburner: three nested additive shells (white-hot core, orange body,
// faint blue-violet tail) with shock diamonds near the nozzle and a fast flicker. Dry thrust: two short, faint shells.
// Small and dependency-free, so a vehicle model can import it directly.
import * as THREE from 'three';

const VERT = /* glsl */`
uniform float uLen;
varying float vAlong; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main() {
  vAlong = -position.y / uLen; vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz; vN = normalMatrix * normal;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
uniform float uPower, uTime, uDiam, uSeed; uniform vec3 uC0, uC1, uC2;
varying float vAlong; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  float a = clamp(vAlong, 0.0, 1.0);
  float facing = pow(abs(dot(normalize(vN), normalize(vV))), 0.9);
  float shape = smoothstep(0.0, 0.06, a) * (1.0 - smoothstep(0.3, 1.0, a));
  float diamonds = 1.0 + uDiam * pow(0.5 + 0.5 * cos(a * 6.2831 * 5.0), 10.0) * (1.0 - smoothstep(0.05, 0.55, a));
  float flick = 0.75 + 0.5 * n2(vec2(a * 9.0 - uTime * 16.0, vUv.x * 7.0 + uSeed));
  vec3 col = mix(uC0, uC1, smoothstep(0.0, 0.32, a)); col = mix(col, uC2, smoothstep(0.3, 0.95, a));
  float k = facing * shape * diamonds * flick * uPower;
  gl_FragColor = vec4(col * k, k);
}`;

const SHELLS = {
  // afterburner: white-hot core with shock diamonds, orange body, blue-violet tail
  ab: [
    { len: 0.45, r: 0.72, power: 1.0, diam: 2.4, c0: [7, 5.2, 2.6], c1: [4.5, 1.8, 0.5], c2: [1.2, 0.5, 0.4] },
    { len: 0.72, r: 0.98, power: 0.8, diam: 1.0, c0: [4, 2.6, 1.2], c1: [3.2, 1.0, 0.25], c2: [0.5, 0.25, 0.8] },
    { len: 1.0, r: 1.18, power: 0.45, diam: 0.0, c0: [2, 1.2, 0.6], c1: [1.4, 0.45, 0.2], c2: [0.25, 0.2, 0.9] },
  ],
  // dry thrust: hot gas glowing faintly orange at the exit and fading within a few metres
  dry: [
    { len: 0.38, r: 0.8, power: 1.0, diam: 0.5, c0: [2.4, 1.35, 0.6], c1: [1.3, 0.5, 0.16], c2: [0.25, 0.14, 0.28] },
    { len: 1.0, r: 1.02, power: 0.4, diam: 0.0, c0: [1.1, 0.62, 0.34], c1: [0.55, 0.26, 0.12], c2: [0.12, 0.1, 0.24] },
  ],
};

/**
 * A plume leaving a nozzle at `at`, blowing along `dir`, `w` wide and `h` tall at the exit, up to `len` long.
 * `kind` 'ab' is an afterburner, 'dry' the faint hot exhaust of an engine without it.
 * set(power 0..1, now ms) each frame; power 0 hides it.
 */
export function makePlume(parent: THREE.Object3D, at: THREE.Vector3, dir: THREE.Vector3, w: number, h: number, len: number, seed = 0, kind: keyof typeof SHELLS = 'ab') {
  const g = new THREE.Group(); g.position.copy(at);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
  g.visible = false; parent.add(g);
  const mats: THREE.ShaderMaterial[] = [];
  for (const s of SHELLS[kind]) {
    const L = len * s.len;
    const geo = new THREE.CylinderGeometry(0.5, 0.5 * 0.28, L, 36, 24, true); geo.translate(0, -L / 2, 0);
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: {
        uLen: { value: L }, uPower: { value: 0 }, uTime: { value: 0 }, uDiam: { value: s.diam }, uSeed: { value: seed * 3.7 },
        uC0: { value: new THREE.Vector3(...s.c0) }, uC1: { value: new THREE.Vector3(...s.c1) }, uC2: { value: new THREE.Vector3(...s.c2) },
      },
    });
    const mesh = new THREE.Mesh(geo, m); mesh.scale.set(w * s.r, 1, h * s.r); mesh.raycast = () => {}; mesh.renderOrder = 6;
    mesh.userData.plume = s.power; g.add(mesh); mats.push(m);
  }
  return {
    group: g,
    set(power: number, now: number) {
      g.visible = power > 0.01;
      if (!g.visible) return;
      g.children.forEach((c, i) => { const m = mats[i]; m.uniforms.uPower.value = power * (c.userData.plume as number); m.uniforms.uTime.value = now / 1000; });
      g.scale.set(1, 0.55 + 0.45 * power, 1);
    },
  };
}
