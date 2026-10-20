// Catalogue shapes, shared by the UI and the runtime. Plain data: nothing here imports three.js, so the UI can list
// every model without loading any of them. A model's code arrives only when it is opened (`load`).
import type { ModelFactory } from '../core/types';

export type DomainId = 'air' | 'land' | 'sea' | 'strike' | 'small-arms';
export type CategoryId =
  | 'fighters'
  | 'pistols' | 'rifles' | 'sniper-rifles' | 'machine-guns'
  | 'tanks' | 'trucks'
  | 'missiles' | 'launchers'
  | 'warships';

export interface Domain { id: DomainId; name: string }
export interface Category { id: CategoryId; domain: DomainId; name: string; one: string }

export interface PartInfo { id: string; name: string; text: string; click?: string }

/** A button in the action panel. `key` is both the label and the shortcut ('E', 'Space'). */
export interface ActionInfo { id: string; label: string; key: string }

export interface ModelDef {
  id: string;                      // unique across the whole catalogue; used in the URL (?model=f22)
  category: CategoryId;
  name: string;                    // full name: 'F-22 Raptor'
  tab: string;                     // label in the category's tab strip
  designation: string;             // stencilled code in the armory: 'F-22'
  role: string;                    // one line in the armory: 'Air superiority fighter · USAF'
  specs: [string, string][];
  intro: { title: string; text: string };
  parts: PartInfo[];
  actions: ActionInfo[];
  /** what clicking a part does: an action id, or `wiggle:<id>` for a surface that only twitches */
  partActions: Record<string, string>;
  hint: string;
  load: () => Promise<{ default: ModelFactory }>;
}
