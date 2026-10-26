import type { ModelDef } from '../../../catalog/types';
import { JET_ACTIONS as A } from '../jet/def';
import { FELON_PARTS } from './parts';

export const su57: ModelDef = {
  id: 'su57', category: 'fighters', name: 'Su-57 Felon', tab: 'Su-57 Felon', designation: 'Su-57',
  role: 'Multirole fighter · Russian Aerospace Forces',
  specs: [['Length', '20.1 m'], ['Span', '14.1 m'], ['Height', '4.6 m'], ['Engines', '2 × AL-41F1']],
  info: { country: 'RU', manufacturer: 'Sukhoi (United Aircraft Corporation)', role: 'Multirole stealth fighter', status: 'In service · Russian Aerospace Forces', first: 2010 },
  parts: FELON_PARTS,
  actions: [A.demo, A.engines, A.afterburner, A.lights, A.canopy, A.gear, A.bays, A.brake, { ...A.refuel, label: 'Refuel probe' }, A.check, A.pilot],
  partActions: {
    canopy: 'canopy', intakes: 'engines', nozzles: 'afterburner', gearNose: 'gear', gearMain: 'gear',
    bayMain: 'bayMain', baySide: 'baySide', refuel: 'refuel', lights: 'lights',
    lef: 'wiggle:lef', levcon: 'wiggle:levcon', flaperons: 'wiggle:flaperons', ailerons: 'wiggle:ailerons', stabs: 'wiggle:stabs', fins: 'wiggle:fins',
  },
  hint: '↑↓ pitch · ←→ roll · Z X yaw · E engines · G take off · P pilot view (real) · I iso',
  load: () => import('./model'),
};
