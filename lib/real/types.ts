// What a model hands the realistic render style. Models opt in by returning `real` from their runtime; the host
// shows the Line / Real switch only for those. Everything else (sky, sun, shadows, ground, bloom, swapping every
// hairline material for a physically based one) is done by lib/real/stage.ts.
import type * as THREE from 'three';
import type { RealMaterials } from './materials';

/** paint scheme of the main skin: two greys in a disruptive pattern, a panel patchwork, recessed panel lines */
export interface SkinSpec {
  light: string;                   // base grey
  dark: string;                    // camouflage patches
  camo: number;                    // 0 = plain, 1 = strong patches
  panel: number;                   // metres one panel-texture tile covers
  metalness: number;
  roughness: number;
  /** digital camouflage: patches built from square blocks this many metres across (absent = soft-edged patches) */
  pixel?: number;
  /** 0..1: how strongly the body along the centre line takes the dark tone (a darker spine and fuselage) */
  core?: number;
  /** patch size relative to the default (1); smaller = tighter patches */
  scale?: number;
  /** contrast of the panel-to-panel shading and grime (1 default; lower = a cleaner, more even coating) */
  tone?: number;
  /** depth of the panel seams (1 default; lower = fainter lines) */
  seam?: number;
  /** colour of edge treatments (the lighter bands along leading edges, tips and trailing edges); tag meshes 'edge' */
  edge?: string;
}

/** colour an emissive (lamp) material takes in the real style; 'nav' = red on the port (+x) side, green starboard */
export type LampColor = 'red' | 'green' | 'white' | 'slime' | 'amber' | 'nav';

export interface RealSpec {
  /** aircraft-style painted skin for untagged body meshes (triplanar, panel lines, camouflage) */
  skin?: SkinSpec;
  /**
   * the model's own materials by tag, checked before the shared library (lib/real/materials.ts); `body` replaces the
   * skin on untagged meshes. The model owns and disposes them.
   */
  materials?: Record<string, THREE.Material>;
  /**
   * small arms: a shooting bench with a rubber mat (w × d metres, centred on cx, cz, its top at y = 0, printed with the
   * hairline plate's centimetre grid) instead of the apron; the concrete floor lies `height` below
   */
  bench?: { w: number; d: number; cx: number; cz: number; height?: number };
  /** hairline-only scenery to hide (aprons, plates, painted pads): the real style brings its own ground */
  hide?: THREE.Object3D[];
  /** hairline glow materials and the real colour each lamp becomes; brightness follows the hairline material */
  lamps?: [THREE.MeshStandardMaterial, LampColor][];
  /** centre of the model, for the shadow camera */
  focus: THREE.Vector3;
  /** size of the model in metres (shadow coverage, ground scale) */
  size: number;
  /** pieces shown in one style only: `line` in the hairline view, `real` in the realistic one */
  only?: { line: THREE.Object3D[]; real: THREE.Object3D[] };
  /**
   * where the taxi line and stop bar go: the line runs along z through x = 0, the bar at z = stopZ; `runway` paints a
   * runway along z (threshold to threshold, width w) with edge lines, a dashed centre line and threshold bars
   */
  markings?: { stopZ: number; runway?: { z0: number; z1: number; w: number } };
  /** the sun and its shadow box follow this object across the ground (a jet on its take-off run) */
  follow?: THREE.Object3D;
  /** called when the style changes (show plumes, swap behaviours) */
  onStyle?(real: boolean): void;
  /** every frame while the real style is on: drive emissive heat, plumes and the like */
  tick?(now: number, mats: RealMaterials): void;
  /**
   * an indoor set (the shooting range): while this returns a value the stage lights the scene from it instead of the
   * time of day. Polled every frame; it is applied again whenever the returned object changes (return the same
   * object while nothing changes)
   */
  stage?(): StageOverride | null;
}

export interface StageOverride {
  /** show the sky dome (false indoors; the concrete ground stays as the floor) */
  sky: boolean;
  /** what lights and reflects: the sky, or a lit room (three's RoomEnvironment) */
  env: 'sky' | 'room';
  envI: number;
  exposure: number;
  fog: { color: number; density: number } | null;
  bloom: number;
  bloomT: number;
  /** the sun stands in for the house lights: direction toward it, strength, colour, and the shadow box (half-size) */
  sun: { dir: THREE.Vector3; intensity: number; color: number; focus: THREE.Vector3; size: number };
}
