// B-52H part catalogue: names, what each part does on the real aircraft, and what clicking it does here.
// Plain data so the UI can import it without pulling in three.js.

import type { PartInfo } from '../../../catalog/types';

export const STRATO_PARTS: PartInfo[] = [
  { id: 'airframe', name: 'Fuselage', text: 'A long, slab-sided fuselage about 48.5 m from nose to tail. The crew of five sit in two decks in the nose: pilot and co-pilot on the upper deck, the navigators below them. Behind the cockpit come fuel tanks, the bomb bay between the main gear, and the avionics in the tail.' },
  { id: 'canopy', name: 'Cockpit & crew hatch', click: 'opens or closes the crew hatch', text: 'The pilots look out through the stepped windscreen, eyebrow and side windows of the upper deck. The crew climb in through a hatch in the underside of the forward fuselage, left of centre, which swings down.' },
  { id: 'evs', name: 'EVS turrets', text: 'Two small turrets under the nose for the electro-optical viewing system: a low-light television camera and a forward-looking infrared sensor that help the crew fly low at night.' },
  { id: 'wings', name: 'Wings', text: 'A 56.4 m span, 35° swept wing set high on the fuselage, holding most of the fuel. It is so flexible that the tips droop toward the ground when the tanks are full and rise several metres in flight.' },
  { id: 'flaps', name: 'Fowler flaps', click: 'runs the flaps out and back', text: 'Large flaps along the inner trailing edges that slide aft and down for take-off and landing, adding wing area as well as camber. Running out, they reveal the yellow zinc-chromate primer inside the coves.' },
  { id: 'spoilers', name: 'Spoilers', click: 'raises the spoilers', text: 'The B-52 has no conventional ailerons, which would twist its flexible wing. Instead spoilers rise from the top of one wing to roll the aircraft that way (← → keys here); raised on both wings they are the air brakes (S).' },
  { id: 'engines', name: 'Engines', click: 'starts or stops the engines', text: 'Eight Pratt & Whitney TF33 turbofans, paired in four pods on pylons ahead of the wing. Each gives about 76 kN of thrust; the bare metal rings around the intakes and the cores at the back are unpainted.' },
  { id: 'tanks', name: 'External tanks', text: 'A fixed fuel tank under each wing near the tip, holding about 2,650 litres. Their weight also helps damp the wing’s bending in turbulence.' },
  { id: 'pylons', name: 'Inboard pylons', text: 'A pylon under each inner wing carries a stores beam for cruise missiles or guided bombs, in addition to what fits in the bomb bay.' },
  { id: 'fin', name: 'Fin', text: 'The tall fin reaches 12.4 m above the ground. It can be folded on the ground to fit older hangars. The red band and the tail code show the unit.' },
  { id: 'rudder', name: 'Rudder', click: 'runs a deflection check', text: 'A narrow rudder along the whole trailing edge of the fin, for yaw (Z and X keys here).' },
  { id: 'stabs', name: 'Stabilisers', click: 'runs a deflection check', text: 'The whole horizontal stabiliser moves slowly to trim the aircraft in pitch as fuel burns and weapons are released.' },
  { id: 'elevators', name: 'Elevators', click: 'runs a deflection check', text: 'Narrow elevators along the stabilisers’ trailing edges for pitch control (↑ ↓ keys here).' },
  { id: 'gearMain', name: 'Main gear', click: 'raises or lowers the gear', text: 'A "bicycle" layout: four two-wheel trucks under the fuselage, a pair ahead of the bomb bay and a pair behind it. The trucks can be steered together, so the B-52 can land in a crosswind crabbed at an angle to the runway.' },
  { id: 'outriggers', name: 'Outrigger wheels', click: 'raises or lowers the gear', text: 'Small twin wheels near each wingtip keep the drooping wing off the ground while taxiing. They fold up into the wing after take-off.' },
  { id: 'bayMain', name: 'Bomb bay', click: 'opens or closes the bomb bay', text: 'The bay between the main gear trucks carries conventional or nuclear weapons. A rotary launcher holds eight cruise missiles or guided bombs and turns to present each one at the open doors.' },
  { id: 'refuel', name: 'Refuelling receptacle', click: 'opens or closes the receptacle', text: 'A receptacle on top, just behind the cockpit, for flying-boom refuelling from a tanker. Its range on internal fuel is over 14,000 km; with refuelling it is limited by the crew.' },
  { id: 'lights', name: 'Formation & nav lights', click: 'switches the lights', text: 'Formation light strips on the rear fuselage and wingtips, position lights at the wingtips and flashing anti-collision beacons above and below.' },
];
