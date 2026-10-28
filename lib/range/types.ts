// What a small arm hands the shooting range (lib/range/range.ts). The range owns the hall, the targets, the camera,
// the hands and the drill; the weapon keeps its own mechanics (trigger, slide, magazine, brass, flash, sound) and is
// only posed by the range. Points are in the weapon root's coordinates (+z toward the muzzle, +y up).
import type * as THREE from 'three';

export type TriggerResult = 'shot' | 'click' | 'safe' | 'locked' | 'busy';

export interface GunState {
  rounds: number; cap: number; chamber: boolean; magIn: boolean; safe: boolean;
  /** slide (or bolt) locked back on an empty magazine */
  locked: boolean;
  /** a cycle or magazine change is still moving */
  busy: boolean;
  night: boolean;
  /** the selector's setting, for weapons that have one ('safe', 'semi', 'auto') */
  mode?: string;
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
  /** how far down the grip from the web the middle finger sits, under the trigger guard (default 0.004: a pistol) */
  fingers?: number;
}

/** a rifle's support hand: it holds the handguard round this point on the bore line (the handguard's radius r) */
export interface ForeGrip { at: THREE.Vector3; r: number; dir: THREE.Vector3 }

/**
 * an optic: the eye looks along rear → front from `relief` behind the eyepiece; zoom is its power range. A 'scope'
 * (the default) is looked through: the view magnifies behind the tube's picture. A 'holo' (holographic or red-dot
 * sight) is unmagnified and looked over: only its reticle is drawn, collimated on the optic's axis, and the weapon stays
 * in view. `reticle`: a horseshoe with a fine crosshair (scopes) or a ring and dot (holographic sights and magnifiers).
 */
export interface OpticSight { rear: THREE.Vector3; front: THREE.Vector3; relief: number; zoom: [number, number]; kind?: 'scope' | 'holo'; reticle?: 'horseshoe' | 'holo' }

export interface RangeGun {
  name: string;                    // 'M17'
  /** a pistol is held out in both hands; a rifle is shouldered, its support hand on the handguard (`fore`) */
  kind?: 'pistol' | 'rifle';
  calibre: string;                 // '9×19 mm'
  root: THREE.Object3D;
  /** the sight line: top centre of the rear notch and the top of the front post */
  sight: { rear: THREE.Vector3; front: THREE.Vector3 };
  muzzle: THREE.Vector3;
  /** eye to rear sight when aiming, metres (arm's length for a pistol) */
  relief: number;
  /** the optic that is fitted, if any: aiming then looks through it (magnified) instead of the iron sights */
  optic?(): OpticSight | null;
  /** the firing hand's grip (a rifle's pistol grip too) */
  grip: PistolGrip;
  fore?: ForeGrip;
  /** where the rear sight sits, in camera space, when not aiming (default: a pistol held low and right) */
  hip?: THREE.Vector3;
  /** per shot: muzzle rise (radians), push back toward the shooter (metres), and the eye's own kick (radians) */
  recoil: { rise: number; push: number; cam?: number };
  /** the selector is on automatic: holding the trigger keeps it firing */
  auto?(): boolean;
  /** loudness of the report, 1 = unsuppressed (sets how loudly the hall answers) */
  loud?(): number;
  /** a laser aiming module that is switched on: its emitter and beam direction (the range puts its dot where it lands) */
  laser?(): { from: THREE.Vector3; dir: THREE.Vector3 } | null;
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
