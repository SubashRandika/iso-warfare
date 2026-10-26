import type { ModelDef } from '../../../catalog/types';
import { JET_ACTIONS as A, WIGGLES } from '../jet/def';
import { LIGHTNING_PARTS } from './parts';

export const f35: ModelDef = {
  id: 'f35', category: 'fighters', name: 'F-35B Lightning II', tab: 'F-35 Lightning II', designation: 'F-35B',
  role: 'STOVL multirole fighter · USMC',
  specs: [['Length', '15.6 m'], ['Span', '10.7 m'], ['Height', '4.4 m'], ['Engine', '1 × F135']],
  info: { country: 'US', manufacturer: 'Lockheed Martin', role: 'STOVL multirole stealth fighter', status: 'In service · USMC', first: 2008 },
  parts: LIGHTNING_PARTS,
  actions: [
    A.demo, { ...A.engines, label: 'Engine' }, A.afterburner, A.lights, A.canopy, A.stovl,
    { ...A.gear, label: 'Take off / hover' }, A.bays, A.brake, { ...A.refuel, label: 'Refuel probe' }, A.check, A.pilot,
  ],
  partActions: {
    canopy: 'canopy', intakes: 'engines', nozzle: 'stovl', liftFan: 'stovl', rollPosts: 'stovl', gearNose: 'gear', gearMain: 'gear',
    bayMain: 'bays', refuel: 'refuel', lights: 'lights', ...WIGGLES,
  },
  hint: '↑↓ pitch · ←→ roll · Z X yaw · V STOVL · G take off / hover · P pilot view (real) · I iso',
  load: () => import('./model'),
};
