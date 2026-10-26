import type { ModelDef } from '../../../catalog/types';
import { JET_ACTIONS as A } from '../../fighters/jet/def';
import { SPIRIT_PARTS } from './parts';

export const b2: ModelDef = {
  id: 'b2', category: 'bombers', name: 'B-2 Spirit', tab: 'B-2 Spirit', designation: 'B-2A',
  role: 'Stealth strategic bomber · USAF',
  specs: [['Length', '21.0 m'], ['Span', '52.4 m'], ['Height', '5.18 m'], ['Engines', '4 × F118']],
  info: { country: 'US', manufacturer: 'Northrop Grumman', role: 'Stealth strategic bomber', status: 'In service · USAF', first: 1989 },
  parts: SPIRIT_PARTS,
  actions: [
    A.demo, A.engines, A.lights, { ...A.canopy, label: 'Crew hatch' }, A.gear, { ...A.bays, label: 'Bomb bays' },
    { ...A.brake, label: 'Drag rudders' }, { ...A.refuel, label: 'Refuel door' }, A.check, A.pilot,
  ],
  partActions: {
    canopy: 'canopy', intakes: 'engines', nozzles: 'engines', gearNose: 'gear', gearMain: 'gear', bayMain: 'bays',
    refuel: 'refuel', lights: 'lights', elevons: 'wiggle:elevons', rudders: 'wiggle:rudders', glas: 'wiggle:glas',
  },
  hint: '↑↓ pitch · ←→ roll · Z X yaw · E engines · G take off · P pilot view (real) · I iso',
  load: () => import('./model'),
};
