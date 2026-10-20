// F-35B part catalogue: names, what each part does on the real aircraft, and what clicking it does here.
// Plain data so the UI can import it without pulling in three.js.

import type { PartInfo } from '../jets/types';

export const LIGHTNING_PARTS: PartInfo[] = [
  { id: 'radome', name: 'Radome & sensors', text: 'The nose carries the AN/APG-81 active electronically scanned radar. Under the chin sits the faceted window of the electro-optical targeting system, and six infrared cameras around the airframe give the pilot a view straight through the jet.' },
  { id: 'canopy', name: 'Canopy & cockpit', click: 'opens or closes the canopy', text: 'A one-piece canopy hinged at the front, so it opens by lifting at the rear. There is no head-up display: flight data is projected inside the pilot’s helmet, and a single panoramic touchscreen spans the instrument panel.' },
  { id: 'intakes', name: 'Diverterless inlets', click: 'starts or stops the engine', text: 'Diverterless supersonic inlets: a smooth bump on the fuselage ahead of each inlet pushes the slow boundary-layer air aside, so no splitter plate or bleed system is needed. The forward-swept lips also hide the engine face from radar.' },
  { id: 'liftFan', name: 'Lift fan & doors', click: 'converts to STOVL mode', text: 'The F-35B’s lift fan sits behind the cockpit, driven by a shaft and clutch from the engine. In STOVL mode a large door hinged at its rear opens above it, doors underneath open to let the air out, and the two-stage counter-rotating fan blows about 20,000 lbf of lift straight down. Auxiliary inlet doors behind it feed the engine extra air.' },
  { id: 'wings', name: 'Wings', text: 'Moderately swept trapezoidal wing, about 10.7 m in span and smaller than the land-based F-35A’s. Its edges are aligned with the tails and doors so radar reflections bunch into a few narrow directions.' },
  { id: 'lef', name: 'Leading-edge flaps', click: 'runs a deflection check', text: 'Full-span leading-edge flaps, scheduled with angle of attack and Mach number. They droop for slow flight and for the transition to the hover.' },
  { id: 'flaperons', name: 'Flaperons', click: 'runs a deflection check', text: 'The F-35 has no separate ailerons: one surface on each wing works as both flap and aileron, helped by differential horizontal tails.' },
  { id: 'fins', name: 'Vertical tails', click: 'swings the rudders', text: 'Twin canted vertical tails, smaller than the F-22’s and set further forward over the wing’s trailing edge.' },
  { id: 'rudders', name: 'Rudders', click: 'runs a deflection check', text: 'Yaw control (Z and X keys here). With no dedicated air brake, the rudders splay in opposite directions and the flaperons rise to add drag (S).' },
  { id: 'stabs', name: 'Horizontal tails', click: 'runs a deflection check', text: 'All-moving horizontal tails on short booms either side of the nozzle. They move together for pitch and apart to help roll.' },
  { id: 'nozzle', name: 'Swivel nozzle', click: 'converts to STOVL mode', text: 'One Pratt & Whitney F135 turbofan, around 40,000 lbf with afterburner. On the F-35B its nozzle sits on a three-bearing swivel module: three ring segments counter-rotate to bend the exhaust from straight aft to straight down for the hover, in a few seconds.' },
  { id: 'rollPosts', name: 'Roll posts', click: 'converts to STOVL mode', text: 'Ducts in each wing root carry engine bypass air to small downward nozzles under the wings. In the hover they keep the wings level, since the ailerons have no airflow to work with.' },
  { id: 'gearNose', name: 'Nose gear', click: 'raises or lowers the gear', text: 'Steerable nose leg that retracts forward under the cockpit and carries the taxi light.' },
  { id: 'gearMain', name: 'Main gear', click: 'raises or lowers the gear', text: 'Main legs that fold into bays under the wing roots. In the hover the F-35B keeps its gear down, ready to land vertically.' },
  { id: 'bayMain', name: 'Weapons bays', click: 'opens or closes the bays', text: 'Two internal bays, each with an inboard and an outboard door. On the F-35B each bay typically carries an AIM-120 AMRAAM and a 1,000 lb-class guided bomb, kept inside so the jet stays stealthy.' },
  { id: 'refuel', name: 'Refuelling probe', click: 'extends or stows the probe', text: 'The F-35B refuels by probe and drogue, like most naval and Marine aircraft: a probe folds out of the right side of the forward fuselage to plug into a tanker’s basket.' },
  { id: 'lights', name: 'Formation & nav lights', click: 'switches the lights', text: 'Formation light strips on the forward fuselage, wingtips and tails, position lights at the wingtips and flashing anti-collision beacons above and below.' },
  { id: 'airframe', name: 'Airframe', text: 'Single-seat, single-engine stealth multirole fighter. The F-35B is the short take-off and vertical landing (STOVL) version: 15.6 m long, 10.7 m span, 4.4 m tall.' },
];
