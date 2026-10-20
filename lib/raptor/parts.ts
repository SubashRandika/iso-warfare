// Part catalogue: names, what each part does on the real aircraft, and what clicking it does here.
// Plain data so the UI can import it without pulling in three.js.

export type PartId =
  | 'radome' | 'canopy' | 'intakes' | 'wings' | 'lef' | 'flaperons' | 'ailerons' | 'fins' | 'rudders'
  | 'stabs' | 'nozzles' | 'gearNose' | 'gearMain' | 'bayMain' | 'baySide' | 'refuel' | 'lights' | 'airframe';

export interface PartInfo { id: PartId; name: string; text: string; click?: string }

export const PARTS: PartInfo[] = [
  { id: 'radome', name: 'Radome & chines', text: 'The nose houses the AN/APG-77 active electronically scanned radar, which steers its beam electronically with about two thousand transmit/receive modules and no moving dish. The sharp chine starts at the nose tip and runs aft into the intakes and the wing leading edge.' },
  { id: 'canopy', name: 'Canopy & cockpit', click: 'opens or closes the canopy', text: 'A single-piece bubble canopy with no forward bow frame, hinged at the rear. Its metallised coating keeps radar energy out of the cockpit, which gives the real canopy its gold tint. Inside: an ejection seat, a wide-angle head-up display and large colour displays that light up when the jet has power.' },
  { id: 'intakes', name: 'Caret intakes', click: 'starts or stops the engines', text: 'Fixed, swept caret inlets on either side of the cockpit. The ducts curve inward and upward behind them so the engine faces cannot be seen from the front, one of the largest single reductions in the jet’s radar signature.' },
  { id: 'wings', name: 'Wings', text: 'Diamond planform: 42° leading-edge sweep, a forward-swept trailing edge and slight anhedral. About 78 m² of area with fuel inside. Every edge is aligned with the edges of the tails and doors, so radar reflections bunch into a few narrow directions.' },
  { id: 'lef', name: 'Leading-edge flaps', click: 'runs a deflection check', text: 'Full-span leading-edge flaps, scheduled by the flight computers with angle of attack and Mach number. They droop for take-off and landing and for high-angle-of-attack manoeuvring.' },
  { id: 'flaperons', name: 'Flaperons', click: 'runs a deflection check', text: 'Inboard trailing-edge surfaces that work as both flaps and ailerons. With the ailerons down and the rudders split, they deflect upward to act as the speed brake, since the jet has no dedicated air brake.' },
  { id: 'ailerons', name: 'Ailerons', click: 'runs a deflection check', text: 'Outboard trailing-edge surfaces for roll control. They move in opposite directions on each wing, helped by differential flaperons and stabilators.' },
  { id: 'fins', name: 'Vertical tails', click: 'swings the rudders', text: 'Twin vertical tails canted outward about 28°, which keeps them from forming a strong corner reflector with the fuselage. Formation light strips sit near the tips.' },
  { id: 'rudders', name: 'Rudders', click: 'runs a deflection check', text: 'Yaw control. Both move together to turn the nose (Z and X keys here). For the speed brake they split outward, which adds drag without changing yaw.' },
  { id: 'stabs', name: 'Stabilators', click: 'runs a deflection check', text: 'All-moving horizontal tails. They move together for pitch and in opposite directions to help roll. Their leading and trailing edges are parallel to the wing’s.' },
  { id: 'nozzles', name: 'Thrust-vectoring nozzles', click: 'toggles afterburner', text: 'Two-dimensional convergent-divergent nozzles for the twin Pratt & Whitney F119 turbofans. The upper and lower flaps vector the exhaust up to ±20° in pitch, in step with the stabilators, and open wide in afterburner. The F119 can cruise above Mach 1.5 without afterburner (supercruise).' },
  { id: 'gearNose', name: 'Nose gear', click: 'raises or lowers the gear', text: 'Single-wheel nose leg with a steerable oleo strut. It retracts forward into a bay closed by two doors, and carries the taxi light.' },
  { id: 'gearMain', name: 'Main gear', click: 'raises or lowers the gear', text: 'Single-wheel main legs that fold forward into bays under the wing roots. The bay doors open only while a leg is moving or extended, so the underside stays smooth in flight.' },
  { id: 'bayMain', name: 'Main weapons bay', click: 'opens or closes the main bay', text: 'Internal carriage keeps the radar signature low. The main bay holds up to six AIM-120 AMRAAMs on LAU-142/A launchers, which push each missile clear of the airflow before it fires; bombs can replace some of them.' },
  { id: 'baySide', name: 'Side weapons bays', click: 'opens or closes the side bays', text: 'One bay in each intake wall, each holding an AIM-9 Sidewinder on a trapeze launcher. The trapeze swings the missile out into the airstream so its seeker can see the target before launch.' },
  { id: 'refuel', name: 'Refuelling door', click: 'opens or closes the receptacle', text: 'A dorsal receptacle behind the cockpit for flying-boom air-to-air refuelling. Its door stays flush and closed until the jet is behind a tanker.' },
  { id: 'lights', name: 'Formation & nav lights', click: 'switches the lights', text: 'Electroluminescent formation strips on the nose, wingtips, tails and aft fuselage for night formation flying, position lights at the wingtips and flashing anti-collision beacons above and below.' },
  { id: 'airframe', name: 'Airframe', text: 'Single-seat, twin-engine air-superiority fighter. 18.9 m long, 13.6 m span, 5.1 m tall. A faceted, blended shape with aligned edges and internal weapons keeps its radar cross-section very small.' },
];

export const PART = Object.fromEntries(PARTS.map(p => [p.id, p])) as Record<PartId, PartInfo>;

export const ACTIONS = [
  { id: 'demo', label: 'Demo', key: '▶' },
  { id: 'engines', label: 'Engines', key: 'E' },
  { id: 'afterburner', label: 'Afterburner', key: 'A' },
  { id: 'lights', label: 'Lights', key: 'L' },
  { id: 'canopy', label: 'Canopy', key: 'C' },
  { id: 'gear', label: 'Take off / land', key: 'G' },
  { id: 'bays', label: 'Weapons bays', key: 'B' },
  { id: 'brake', label: 'Speed brake', key: 'S' },
  { id: 'refuel', label: 'Refuel door', key: 'R' },
  { id: 'check', label: 'Control check', key: 'K' },
] as const;
export type ActionId = (typeof ACTIONS)[number]['id'];
