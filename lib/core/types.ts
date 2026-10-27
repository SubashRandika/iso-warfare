// The contract between the viewer host and one model. The host owns the engine, themes, accent, camera, sound,
// keyboard, picking, the demo clock and the readout line; a model owns its geometry, its state and its actions.
import type * as THREE from 'three';
import type { Engine } from '../iso/engine';
import type { ModelDef } from '../catalog/types';
import type { Sound } from './sound';
import type { Script } from './script';
import type { RealSpec } from '../real/types';
import type { RangeHud } from '../range/hud';

export type GlowPoints = ReturnType<Engine['glowPoints']>;

export interface ModelCtx {
  E: Engine;
  snd: Sound;
  def: ModelDef;
  /** timers for the demo; the host stops it whenever a non-passive action runs */
  script: Script;
  /** a short message appended to the readout for a few seconds ('start engines first') */
  say(msg: string): void;
  /** decaying −1..1 wiggle for a part clicked with `wiggle:<id>` (0 when idle) */
  wig(id: string, now: number): number;
  /** the catalogue lists this action for the model */
  has(action: string): boolean;
  /** switch the render style (true: the realistic view, loading it if needed); the model hears back through onStyle */
  style(real: boolean): void;
}

export interface ModelView {
  target: THREE.Vector3;
  dist: number;                    // camera distance that frames the model at a 1.75 aspect
  dir?: THREE.Vector3;             // default: the isometric diagonal (1, 1, 1)
  min?: number; max?: number;      // zoom limits (default 0.18 × and 4.5 × dist)
}

export interface ModelRuntime {
  /** clicks are tested against this object; a part is any ancestor with userData.part */
  pickRoot: THREE.Object3D;
  parts: Record<string, THREE.Object3D>;
  view: ModelView;
  /** every id in the catalogue's actions and partActions; extra ids are allowed (clicked-only actions) */
  actions: Record<string, () => void>;
  /** which buttons show as on */
  on(): Record<string, boolean>;
  tick(now: number, dt: number): void;
  readout(): string;
  /** actions that do not interrupt the demo ('demo' always counts) */
  passive?: string[];
  /** held keys (arrows, space…): return true when handled */
  keyDown?(key: string, e: KeyboardEvent): boolean;
  keyUp?(key: string): void;
  blur?(): void;
  /** a game overlay to draw over the scene (the shooting range); the usual panels hide while it shows */
  hud?(): RangeHud | null;
  /** opt in to the realistic render style (Line / Real switch); see lib/real/types.ts */
  real?: RealSpec;
  dispose?(): void;
}

export type ModelFactory = (ctx: ModelCtx) => ModelRuntime;
