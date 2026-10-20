// Every jet in the hangar: what the UI lists and what the controller allows. Plain data (no three.js).
import type { JetDef, JetId } from './types';
import { RAPTOR_PARTS } from '../raptor/parts';
import { LIGHTNING_PARTS } from '../lightning/parts';

const WIGGLES = { lef: 'wiggle:lef', flaperons: 'wiggle:flaperons', stabs: 'wiggle:stabs', rudders: 'wiggle:rudders', fins: 'wiggle:rudders' } as const;

export const JETS: Record<JetId, JetDef> = {
  f22: {
    id: 'f22', name: 'F-22 Raptor', tab: 'F-22 Raptor',
    specs: [['Length', '18.9 m'], ['Span', '13.6 m'], ['Height', '5.1 m'], ['Engines', '2 × F119']],
    intro: { title: 'F-22 Raptor', text: 'Click any part to see what it does; parts that move will move. Drag to orbit, scroll to zoom, right-drag to pan. Start the engines, close the canopy and take off, or run the demo.' },
    parts: RAPTOR_PARTS,
    actions: [
      { id: 'demo', label: 'Demo', key: '▶' }, { id: 'engines', label: 'Engines', key: 'E' }, { id: 'afterburner', label: 'Afterburner', key: 'A' },
      { id: 'lights', label: 'Lights', key: 'L' }, { id: 'canopy', label: 'Canopy', key: 'C' }, { id: 'gear', label: 'Take off / land', key: 'G' },
      { id: 'bays', label: 'Weapons bays', key: 'B' }, { id: 'brake', label: 'Speed brake', key: 'S' }, { id: 'refuel', label: 'Refuel door', key: 'R' },
      { id: 'check', label: 'Control check', key: 'K' },
    ],
    partActions: {
      canopy: 'canopy', intakes: 'engines', nozzles: 'afterburner', gearNose: 'gear', gearMain: 'gear',
      bayMain: 'bayMain', baySide: 'baySide', refuel: 'refuel', lights: 'lights', ailerons: 'wiggle:ailerons', ...WIGGLES,
    },
    hint: '↑↓ pitch · ←→ roll · Z X yaw · E engines · G take off · I iso · T theme',
    refuelReadout: 'receptacle open',
  },
  f35: {
    id: 'f35', name: 'F-35B Lightning II', tab: 'F-35 Lightning II',
    specs: [['Length', '15.6 m'], ['Span', '10.7 m'], ['Height', '4.4 m'], ['Engine', '1 × F135']],
    intro: { title: 'F-35B Lightning II', text: 'The STOVL version. Click any part to see what it does; parts that move will move. Start the engine, close the canopy, convert to STOVL (V) and lift off into the hover, or take off conventionally. Or run the demo.' },
    parts: LIGHTNING_PARTS,
    actions: [
      { id: 'demo', label: 'Demo', key: '▶' }, { id: 'engines', label: 'Engine', key: 'E' }, { id: 'afterburner', label: 'Afterburner', key: 'A' },
      { id: 'lights', label: 'Lights', key: 'L' }, { id: 'canopy', label: 'Canopy', key: 'C' }, { id: 'stovl', label: 'STOVL mode', key: 'V' },
      { id: 'gear', label: 'Take off / hover', key: 'G' }, { id: 'bays', label: 'Weapons bays', key: 'B' }, { id: 'brake', label: 'Speed brake', key: 'S' },
      { id: 'refuel', label: 'Refuel probe', key: 'R' }, { id: 'check', label: 'Control check', key: 'K' },
    ],
    partActions: {
      canopy: 'canopy', intakes: 'engines', nozzle: 'stovl', liftFan: 'stovl', rollPosts: 'stovl', gearNose: 'gear', gearMain: 'gear',
      bayMain: 'bays', refuel: 'refuel', lights: 'lights', ...WIGGLES,
    },
    hint: '↑↓ pitch · ←→ roll · Z X yaw · V STOVL · G take off / hover · I iso · T theme',
    refuelReadout: 'probe out',
  },
};

export const JET_IDS = Object.keys(JETS) as JetId[];
