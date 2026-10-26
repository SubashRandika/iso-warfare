// Catalogue pieces every fighter shares: the flight actions and the control surfaces a click wiggles.
import type { ActionInfo } from '../../../catalog/types';

export const JET_ACTIONS = {
  demo: { id: 'demo', label: 'Demo', key: 'D' },
  engines: { id: 'engines', label: 'Engines', key: 'E' },
  afterburner: { id: 'afterburner', label: 'Afterburner', key: 'A' },
  lights: { id: 'lights', label: 'Lights', key: 'L' },
  canopy: { id: 'canopy', label: 'Canopy', key: 'C' },
  stovl: { id: 'stovl', label: 'STOVL mode', key: 'V' },
  gear: { id: 'gear', label: 'Take off / land', key: 'G' },
  bays: { id: 'bays', label: 'Weapons bays', key: 'B' },
  brake: { id: 'brake', label: 'Speed brake', key: 'S' },
  refuel: { id: 'refuel', label: 'Refuel door', key: 'R' },
  check: { id: 'check', label: 'Control check', key: 'K' },
  pilot: { id: 'pilot', label: 'Pilot view', key: 'P' },
} satisfies Record<string, ActionInfo>;

export const WIGGLES = { lef: 'wiggle:lef', flaperons: 'wiggle:flaperons', stabs: 'wiggle:stabs', rudders: 'wiggle:rudders', fins: 'wiggle:rudders' } as const;
