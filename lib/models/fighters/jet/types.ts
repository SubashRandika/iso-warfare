// Shared shapes between the jet simulation and each airframe.
import type * as THREE from 'three';
import type { GlowPoints } from '../../../core/types';
import type { Hinge } from '../../../kit/build';
import type { SkinSpec } from '../../../real/types';
export type { GlowPoints, Hinge };

/** Everything the controller animates; an airframe's pose() reads it each frame. */
export interface JetState {
  eng: boolean; ab: boolean; lights: boolean; canopy: boolean; gear: boolean; bayMain: boolean; baySide: boolean;
  brake: boolean; refuel: boolean; stovl: boolean; hover: boolean;
  rpm: number; abT: number; canopyT: number; gearT: number; gearDoorT: number; bayMainT: number; baySideT: number;
  brakeT: number; refuelT: number; stovlT: number; alt: number;
  /** smoothed stick: pitch (+ nose up), roll (+ right), yaw (+ nose right), −1..1 */
  p: number; r: number; y: number;
  /** leading-edge flap sweep during the control check, −1..1 */
  checkLef: number;
}

/**
 * A weapon the demo strike can release: the object that leaves the jet (detached, flown and put back after landing),
 * what it is, and which bay must be open first ('none': a pylon). aam: radar air-to-air missile; srm: short-range
 * heat-seeker on a side-bay trapeze; bomb: guided bomb; cruise: stand-off cruise missile.
 */
export interface Store { kind: 'aam' | 'srm' | 'bomb' | 'cruise'; obj: THREE.Object3D; bay: 'main' | 'side' | 'none' }
export const store = (kind: Store['kind'], obj: THREE.Object3D, bay: Store['bay']): Store => ({ kind, obj, bay });

/** What an airframe hands the controller. */
export interface JetRig {
  craft: THREE.Group;                  // altitude and attitude act here, about the centre of gravity
  cgY: number;                         // craft height above the ground with the gear down
  parts: Record<string, THREE.Group>;
  lights: {
    stripMat: THREE.MeshStandardMaterial; navMat: THREE.MeshStandardMaterial; beaconMat: THREE.MeshStandardMaterial;
    taxiMat: THREE.MeshStandardMaterial; padLightMat: THREE.MeshStandardMaterial;
    stripGlow: GlowPoints; navGlow: GlowPoints; beaconGlow: GlowPoints; taxiGlow: GlowPoints; padGlow: GlowPoints;
    shadowMat: THREE.ShaderMaterial; taxiPoolMat: THREE.ShaderMaterial; cockpitLight: THREE.PointLight;
  };
  screen: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture };
  view: { target: THREE.Vector3; dist: number; min?: number };
  altMax: number;                      // conventional flight altitude
  hoverAlt?: number;                   // STOVL hover altitude
  engines: number;                     // for the engine display
  /** hairline-only scenery (the apron) the realistic style hides */
  stage?: THREE.Object3D;
  /** opt in to the realistic style: paint, framing, and where the afterburner plumes leave the nozzles */
  real?: {
    skin: SkinSpec; focus: THREE.Vector3; size: number; stopZ: number;
    nozzles: { parent: THREE.Object3D; at: THREE.Vector3; w: number; h: number }[];   // empty: no plumes (the B-2)
    /** pieces that exist in one style only (the Real view swaps in a detailed cockpit) */
    only?: { line: THREE.Object3D[]; real: THREE.Object3D[] };
    /** cockpit power 0..1 (HUD symbology) */
    power?(k: number): void;
  };
  /** weapons for the demo strike (see Store); `airTarget` 'awacs': its first air target is a large support aircraft */
  stores?: Store[];
  airTarget?: 'fighter' | 'awacs';
  /**
   * The pilot's seat for the pilot's view (Real view only). `eye`: the design eye point in the airframe's coordinates
   * (as P() gives them, ground at y = 0). `hud`:
   * 'hud' symbology fixed to the airframe ahead of the eye, 'helmet' carried by the head (F-35), 'none'. `deck`: a flight
   * deck drawn only from the seat (bombers, whose crew stations aren't modelled otherwise). `glass`: window meshes made
   * clear from inside (canopies in the canopy material are found by themselves). `hide`: parts the deck stands in for
   * (the B-2's centre body, whose top skin runs through the cabin, is swapped for a copy with the cabin cut out).
   */
  pilot?: { eye: THREE.Vector3; hud: 'hud' | 'helmet' | 'none'; deck?: THREE.Object3D; glass?: THREE.Mesh[]; hide?: THREE.Object3D[] };
  /** move every part from the state; `wig(id)` is a decaying −1..1 wiggle for a clicked surface */
  pose(st: JetState, now: number, wig: (id: string) => number): void;
}

