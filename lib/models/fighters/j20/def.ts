import type { ModelDef } from '../../../catalog/types';
import { JET_ACTIONS as A } from '../jet/def';
import { DRAGON_PARTS } from './parts';

export const j20: ModelDef = {
  id: 'j20', category: 'fighters', name: 'J-20 Mighty Dragon', tab: 'J-20', designation: 'J-20',
  role: 'Long-range stealth fighter · PLA Air Force',
  specs: [['Length', '20.4 m'], ['Span', '12.9 m'], ['Height', '4.45 m'], ['Engines', '2 × WS-10C']],
  info: { country: 'CN', manufacturer: 'Chengdu Aircraft Corporation (AVIC)', role: 'Long-range stealth fighter', status: 'In service · PLA Air Force', first: 2011 },
  parts: DRAGON_PARTS,
  actions: [A.demo, A.engines, A.afterburner, A.lights, A.canopy, A.gear, A.bays, A.brake, { ...A.refuel, label: 'Refuel probe' }, A.check, A.pilot],
  partActions: {
    canopy: 'canopy', intakes: 'engines', nozzles: 'afterburner', gearNose: 'gear', gearMain: 'gear',
    bayMain: 'bayMain', baySide: 'baySide', refuel: 'refuel', lights: 'lights',
    canards: 'wiggle:canards', lef: 'wiggle:lef', flaperons: 'wiggle:flaperons', ailerons: 'wiggle:ailerons', fins: 'wiggle:fins',
  },
  hint: '↑↓ pitch · ←→ roll · Z X yaw · E engines · G take off · P pilot view (real) · I iso',
  load: () => import('./model'),
};
