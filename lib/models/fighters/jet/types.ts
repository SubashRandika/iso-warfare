// Shared shapes between the jet controller and each airframe.
import type * as THREE from 'three';
import type { Engine } from '../iso/engine';

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

export interface Hinge { outer: THREE.Group; inner: THREE.Group; set(rad: number): void }

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
  view: { target: THREE.Vector3; dist: number };
  altMax: number;                      // conventional flight altitude
  hoverAlt?: number;                   // STOVL hover altitude
  engines: number;                     // for the engine display
  /** move every part from the state; `wig(id)` is a decaying −1..1 wiggle for a clicked surface */
  pose(st: JetState, now: number, wig: (id: string) => number): void;
}

export type GlowPoints = ReturnType<Engine['glowPoints']>;
