// B-2 part catalogue: names, what each part does on the real aircraft, and what clicking it does here.
// Plain data so the UI can import it without pulling in three.js.

import type { PartInfo } from '../../../catalog/types';

export const SPIRIT_PARTS: PartInfo[] = [
  { id: 'airframe', name: 'Centre body', text: 'There is no fuselage and no tail: the crew, fuel, engines and weapons all sit inside one blended wing. The thick centre section carries the cockpit, the bomb bays and the landing gear; the shape, the coatings and buried engines keep its radar signature very small.' },
  { id: 'wings', name: 'Flying wing', text: 'A 52.4 m span for a length of only 21 m. Every edge is parallel to one of two directions: the 33° leading edges and the sawtooth "double W" trailing edge, so radar reflections bunch into a few narrow beams instead of spreading.' },
  { id: 'canopy', name: 'Cockpit & crew hatch', click: 'opens or closes the crew hatch', text: 'Two crew, the pilot on the left and the mission commander on the right, behind four windscreen panels in the raised crown. They climb in through a hatch under the cockpit that folds down with a ladder built in.' },
  { id: 'intakes', name: 'Engine intakes', click: 'starts or stops the engines', text: 'Four General Electric F118 turbofans without afterburners, buried in pairs under the humps either side of the cockpit. The intakes sit on top of the wing with jagged lips, and the ducts curve so the engine faces cannot be seen from outside.' },
  { id: 'nozzles', name: 'Exhaust troughs', click: 'starts or stops the engines', text: 'The exhaust leaves through troughs in the upper skin, well ahead of the trailing edge, where it mixes with cool air and spreads out before it leaves the aircraft. That hides it from radar and infrared sensors on the ground.' },
  { id: 'elevons', name: 'Elevons', click: 'runs a deflection check', text: 'Three control surfaces on each outer trailing edge. With no tail, they do the work of both elevators and ailerons: together for pitch, in opposite directions for roll, under fly-by-wire control.' },
  { id: 'rudders', name: 'Split drag rudders', click: 'runs a deflection check', text: 'At each wingtip a surface splits into upper and lower halves that open like a clam. Opening one side creates drag on that side and turns the nose (Z and X keys here); opening both is the speed brake (S).' },
  { id: 'glas', name: 'Gust load alleviation', click: 'runs a deflection check', text: 'The pointed "beaver tail" on the centre line moves to trim pitch and to ease the loads from turbulence on the long, flexible wing.' },
  { id: 'gearNose', name: 'Nose gear', click: 'raises or lowers the gear', text: 'A twin-wheel nose leg with the taxi light, closed in by two doors with saw-toothed edges when retracted.' },
  { id: 'gearMain', name: 'Main gear', click: 'raises or lowers the gear', text: 'Four-wheel bogies on legs either side of the bomb bays, about 12 m apart. They fold into bays in the wing under large single doors.' },
  { id: 'bayMain', name: 'Bomb bays', click: 'opens or closes the bays', text: 'Two bays side by side in the centre body, each with a rotary launcher that turns to present the next weapon at the doors. Together they carry up to about 18 tonnes of guided bombs, conventional or nuclear, entirely internally.' },
  { id: 'refuel', name: 'Refuelling receptacle', click: 'opens or closes the receptacle', text: 'A dorsal receptacle behind the cockpit for flying-boom refuelling. Tanker support gives the B-2 its intercontinental reach: missions of more than 30 hours have been flown from bases in the United States.' },
  { id: 'lights', name: 'Formation & nav lights', click: 'switches the lights', text: 'Formation strips near the wingtips, position lights at the tips and anti-collision beacons above and below the centre body.' },
];
