// Catalogue shapes, shared by the UI and the controller. Plain data: no three.js here.

export interface PartInfo { id: string; name: string; text: string; click?: string }

export type ActionId = 'demo' | 'engines' | 'afterburner' | 'lights' | 'canopy' | 'stovl' | 'gear' | 'bays' | 'brake' | 'refuel' | 'check';
export interface ActionInfo { id: ActionId; label: string; key: string }

/** what clicking a part on the jet does: run an action, or wiggle a control surface */
export type PartAction = ActionId | 'bayMain' | 'baySide' | `wiggle:${string}`;

export interface JetDef {
  id: JetId;
  name: string;                    // brand line and tab
  tab: string;
  specs: [string, string][];
  intro: { title: string; text: string };
  parts: PartInfo[];
  actions: ActionInfo[];
  partActions: Record<string, PartAction>;
  hint: string;
  refuelReadout: string;           // readout word when the refuel door / probe is out
}

export type JetId = 'f22' | 'f35';
