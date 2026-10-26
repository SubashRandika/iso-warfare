import type { ModelDef } from '../../../catalog/types';
import { JET_ACTIONS as A } from '../../fighters/jet/def';
import { STRATO_PARTS } from './parts';

export const b52: ModelDef = {
  id: 'b52', category: 'bombers', name: 'B-52H Stratofortress', tab: 'B-52H', designation: 'B-52H',
  role: 'Long-range strategic bomber · USAF',
  specs: [['Length', '48.5 m'], ['Span', '56.4 m'], ['Height', '12.4 m'], ['Engines', '8 × TF33-P-3/103']],
  info: { country: 'US', manufacturer: 'Boeing', role: 'Long-range strategic bomber', status: 'In service · USAF', first: 1961 },
  parts: STRATO_PARTS,
  actions: [
    A.demo, A.engines, A.lights, { ...A.canopy, label: 'Crew hatch' }, A.gear, { ...A.bays, label: 'Bomb bay' },
    { ...A.brake, label: 'Air brakes' }, { ...A.refuel, label: 'Refuel door' }, A.check, A.pilot,
  ],
  partActions: {
    canopy: 'canopy', engines: 'engines', gearMain: 'gear', outriggers: 'gear', bayMain: 'bays', refuel: 'refuel', lights: 'lights',
    flaps: 'wiggle:flaps', spoilers: 'wiggle:spoilers', rudder: 'wiggle:rudder', stabs: 'wiggle:stabs', elevators: 'wiggle:elevators',
  },
  hint: '↑↓ pitch · ←→ roll · Z X yaw · E engines · G take off · P pilot view (real) · I iso',
  load: () => import('./model'),
};
