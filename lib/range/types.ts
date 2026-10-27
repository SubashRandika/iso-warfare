// What a small arm hands the shooting range (lib/range/range.ts). The range owns the hall, the targets, the camera,
// the hands and the drill; the weapon keeps its own mechanics (trigger, slide, magazine, brass, flash, sound) and is
// only posed by the range. Points are in the weapon root's coordinates (+z toward the muzzle, +y up).
import type * as THREE from 'three';

export type TriggerResult = 'shot' | 'click' | 'safe' | 'locked' | 'busy';

export interface GunState {
  rounds: number; cap: number; chamber: boolean; magIn: boolean; safe: boolean;
  /** slide locked back on an empty magazine */
  locked: boolean;
  /** a cycle or magazine change is still moving */
  busy: boolean;
  night: boolean;
}

/** a pistol grip, for the hands that hold it */
export interface PistolGrip {
  /** top of the backstrap under the beavertail, where the web of the hand sits */
  web: THREE.Vector3;
  /** unit vector down the grip (it rakes back toward the base) */
  down: THREE.Vector3;
  /** web to base, backstrap to front strap, half-width across */
  length: number; depth: number; half: number;
  /** the trigger face the index finger rests on */
  trigger: THREE.Vector3;
  /** height and half-width of the frame below the slide, where the thumbs lie forward */
  thumbY: number; frameHalf: number;
}

export interface RangeGun {
  name: string;                    // 'M17'
  calibre: string;                 // '9×19 mm'
  root: THREE.Object3D;
  /** the sight line: top centre of the rear notch and the top of the front post */
  sight: { rear: THREE.Vector3; front: THREE.Vector3 };
  muzzle: THREE.Vector3;
  /** eye to rear sight when aiming, metres (arm's length for a pistol) */
  relief: number;
  grip: PistolGrip;
  /** per shot: muzzle rise (radians) and push back toward the shooter (metres) */
  recoil: { rise: number; push: number };
  trigger(): TriggerResult;
  /** magazine out (it falls away) or a full one in */
  magazine(): void;
  /** rack the slide, or release it when locked back */
  rack(): void;
  safety(): void;
  night(): void;
  state(): GunState;
  /**
   * taken into the hands (true) or set back on the bench; `ground(x, z)` gives the height that cases and dropped
   * magazines land on, and `flash` how far the muzzle flash lights the room (metres)
   */
  hold(on: boolean, o?: { ground(x: number, z: number): number; flash: number }): void;
}

/** the bench the weapon lies on (RealSpec.bench): the range's own lane is built round it */
export interface BenchSpec { w: number; d: number; cx: number; cz: number; height?: number }
