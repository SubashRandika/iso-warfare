import type { ModelDef } from '../../../catalog/types';
import { JET_ACTIONS as A, WIGGLES } from '../jet/def';
import { RAPTOR_PARTS } from './parts';

export const f22: ModelDef = {
  id: 'f22', category: 'fighters', name: 'F-22 Raptor', tab: 'F-22 Raptor', designation: 'F-22',
  role: 'Air superiority fighter · USAF',
  specs: [['Length', '18.9 m'], ['Span', '13.6 m'], ['Height', '5.1 m'], ['Engines', '2 × F119']],
  info: { country: 'US', manufacturer: 'Lockheed Martin, with Boeing', role: 'Air superiority fighter', status: 'In service · USAF', first: 1997 },
  parts: RAPTOR_PARTS,
  actions: [A.demo, A.engines, A.afterburner, A.lights, A.canopy, A.gear, A.bays, A.brake, A.refuel, A.check, A.pilot],
  partActions: {
    canopy: 'canopy', intakes: 'engines', nozzles: 'afterburner', gearNose: 'gear', gearMain: 'gear',
    bayMain: 'bayMain', baySide: 'baySide', refuel: 'refuel', lights: 'lights', ailerons: 'wiggle:ailerons', ...WIGGLES,
  },
  hint: '↑↓ pitch · ←→ roll · Z X yaw · E engines · G take off · P pilot view (real) · I iso',
  load: () => import('./model'),
};
