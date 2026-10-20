// Physically based materials for the realistic style, keyed by the tag a mesh carries (`userData.real`, set through
// kit.add(..., { real }) or on the geometry). Untagged hairline body meshes get the skin.
//
// The skin needs no UVs: it samples the panel texture triplanar in the mesh's own coordinates. Every model mesh is
// built in model coordinates (hinged parts offset their inner group by the pivot), so seams, patches and grime stay
// put on the surface while flaps, doors and gear move.
import * as THREE from 'three';
import type { SkinSpec } from './types';

const SKIN_VERT_HEAD = /* glsl */`varying vec3 vObjPos; varying vec3 vObjNrm;\n`;
const SKIN_FRAG_HEAD = /* glsl */`
uniform sampler2D uSkin; uniform float uTile; uniform vec3 uLight; uniform vec3 uDark; uniform float uCamo; uniform float uBump;
varying vec3 vObjPos; varying vec3 vObjNrm;
vec4 triSkin(vec3 p, vec3 n) {
  vec3 w = pow(abs(normalize(n)), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-5);
  return texture2D(uSkin, p.zy / uTile) * w.x + texture2D(uSkin, p.xz / uTile) * w.y + texture2D(uSkin, p.xy / uTile + 0.37) * w.z;
}
float sHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float sNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sHash(i), sHash(i + vec3(1, 0, 0)), f.x), mix(sHash(i + vec3(0, 1, 0)), sHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(sHash(i + vec3(0, 0, 1)), sHash(i + vec3(1, 0, 1)), f.x), mix(sHash(i + vec3(0, 1, 1)), sHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float sFbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * sNoise(p); p *= 2.07; a *= 0.5; } return s; }
vec3 perturbSkin(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
  vec3 sx = normalize(dFdx(surfPos)), sy = normalize(dFdy(surfPos));
  vec3 r1 = cross(sy, surfNorm), r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

/** a MeshPhysicalMaterial wearing the procedural skin */
export function skinMaterial(tex: THREE.Texture, s: SkinSpec) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: s.metalness, roughness: s.roughness, clearcoat: 0.12, clearcoatRoughness: 0.5 });
  const u = {
    uSkin: { value: tex }, uTile: { value: s.panel }, uLight: { value: new THREE.Color(s.light) }, uDark: { value: new THREE.Color(s.dark) },
    uCamo: { value: s.camo }, uBump: { value: 0.45 },
  };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = SKIN_VERT_HEAD + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vObjPos = position; vObjNrm = normal;');
    sh.fragmentShader = SKIN_FRAG_HEAD + sh.fragmentShader
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        vec4 sk = triSkin(vObjPos, vObjNrm);
        float camo = smoothstep(0.46, 0.54, sFbm(vObjPos * vec3(0.17, 0.24, 0.13) + 3.1));
        vec3 skBase = mix(uLight, uDark, camo * uCamo);
        float skTone = sk.g, skGrime = sk.b, skSeam = sk.r;
        diffuseColor.rgb = skBase * (0.9 + (skTone - 0.5) * 0.62) * mix(1.0, 0.78, smoothstep(0.5, 0.9, skGrime)) * mix(0.35, 1.0, skSeam);`)
      .replace('#include <roughnessmap_fragment>', /* glsl */`#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (skTone - 0.5) * 0.4 + (skGrime - 0.5) * 0.22 + (1.0 - skSeam) * 0.35, 0.06, 1.0);`)
      .replace('#include <metalnessmap_fragment>', /* glsl */`#include <metalnessmap_fragment>
        metalnessFactor = clamp(metalnessFactor * mix(0.7, 1.15, skTone), 0.0, 1.0);`)
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
        normal = perturbSkin(-vViewPosition, normal, vec2(dFdx(skSeam), dFdy(skSeam)) * uBump, faceDirection);`);
  };
  m.customProgramCacheKey = () => 'iso-skin';
  return m;
}

/** lamp colours (HDR emissive, so bloom picks them up) */
export const LAMP_RGB: Record<string, number> = { red: 0xff2a1a, green: 0x2bff6a, white: 0xfff4e0, slime: 0xc6ff7a, amber: 0xffa424 };

export function realMaterials(tex: THREE.Texture, skin: SkinSpec) {
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  const mats = {
    skin: skinMaterial(tex, skin),
    nozzle: skinMaterial(tex, { ...skin, light: '#5b5f62', dark: '#45494c', camo: 0.4, metalness: 0.7, roughness: 0.36 }),
    cockpit: std({ color: 0x24272b, roughness: 0.85, metalness: 0.1 }),
    intake: std({ color: 0x0d0e0f, roughness: 0.95 }),
    recess: std({ color: 0x1c1e20, roughness: 0.9 }),
    well: std({ color: 0xc9ccc8, roughness: 0.72, metalness: 0.05 }),
    bay: std({ color: 0xd3d6d2, roughness: 0.7, metalness: 0.05 }),
    exhaust: std({ color: 0x1d1b1a, roughness: 0.6, metalness: 0.6, emissive: 0xff5a14, emissiveIntensity: 0 }),
    strut: std({ color: 0xd8dad8, roughness: 0.32, metalness: 0.55 }),
    tyre: std({ color: 0x141414, roughness: 0.93 }),
    store: std({ color: 0xdedfd9, roughness: 0.42, metalness: 0.08 }),
    seeker: new THREE.MeshPhysicalMaterial({ color: 0x0e1216, roughness: 0.04, metalness: 0.3, clearcoat: 1 }),
    // gold, metallised canopy: reflective, tinted, with a thin-film sheen; the cockpit shows through dimly
    canopy: new THREE.MeshPhysicalMaterial({
      color: 0xa0702c, metalness: 0.95, roughness: 0.03, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide,
      iridescence: 0.12, iridescenceIOR: 1.5, iridescenceThicknessRange: [250, 330], envMapIntensity: 1.6,
    }),
  };
  Object.values(mats).forEach(m => { m.userData.realStyle = true; });   // keep the hairline light theme's accent fill off them
  return mats;
}

export type RealMaterials = ReturnType<typeof realMaterials>;
export type RealTag = keyof RealMaterials;
