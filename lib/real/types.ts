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
}

/** colour an emissive (lamp) material takes in the real style; 'nav' = red on the port (+x) side, green starboard */
export type LampColor = 'red' | 'green' | 'white' | 'slime' | 'amber' | 'nav';

export interface RealSpec {
  skin: SkinSpec;
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
  /** where the taxi line and stop bar go: the line runs along z through x = 0, the bar at z = stopZ */
  markings?: { stopZ: number };
  /** called when the style changes (show plumes, swap behaviours) */
  onStyle?(real: boolean): void;
  /** every frame while the real style is on: drive emissive heat, plumes and the like */
  tick?(now: number, mats: RealMaterials): void;
}
