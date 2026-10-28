import type { ModelDef } from '../../../catalog/types';

export const ak47: ModelDef = {
  id: 'ak47', category: 'rifles', name: 'AK-47 assault rifle', tab: 'AK-47', designation: 'AK-47',
  role: 'Assault rifle (shown in its AKM form) · Soviet Army',
  specs: [['Calibre', '7.62×39 mm'], ['Barrel', '415 mm'], ['Magazine', '30 rounds'], ['Weight', '3.1 kg']],
  info: { country: 'SU', manufacturer: 'Izhmash (now Kalashnikov Concern)', role: 'Assault rifle', status: 'In service · worldwide', first: 1949 },
  parts: [
    { id: 'receiver', name: 'Receiver', click: 'works the charging handle', text: 'This is the AKM, the 1959 modernisation of the AK-47: its receiver is stamped from 1 mm sheet steel and riveted to machined front and rear trunnions, lighter and quicker to make than the original milled receiver. The dimple over the magazine well guides the magazine in.' },
    { id: 'dustCover', name: 'Dust cover', click: 'field strips the rifle', text: 'A stamped steel cover over the action, held at the rear by the recoil spring guide. Pressing the guide’s button frees it: it is the first piece off in a field strip.' },
    { id: 'carrier', name: 'Bolt carrier and charging handle', click: 'works the charging handle', text: 'A long-stroke gas system: the gas piston is part of the bolt carrier, so carrier, piston and handle all travel about 85 mm back on every shot. The handle on the right moves when the rifle fires. The rotating bolt rides in the front of the carrier.' },
    { id: 'handguard', name: 'Handguards', text: 'Laminated wood. The lower one is shaped to fill the palm; the upper one covers the gas tube, which gets too hot to hold after sustained fire.' },
    { id: 'barrel', name: 'Barrel', text: 'A 415 mm chrome-lined barrel for the 7.62×39 mm intermediate cartridge. The gas block bleeds propellant gas into the tube above the barrel to drive the piston. A bayonet lug sits under the front sight.' },
    { id: 'frontSight', name: 'Front sight', text: 'A post inside a protective hood on a tower at the muzzle. The post screws up or down to zero the rifle for elevation.' },
    { id: 'rearSight', name: 'Rear sight', text: 'A tangent leaf with a notch, graduated in hundreds of metres to 1000 m, and a battle setting (П) for about 300 m: the bullet then stays within a man’s height of the line of sight out to that range.' },
    { id: 'selector', name: 'Selector', click: 'moves to the next setting: safe, automatic, single shots', text: 'A long lever on the right of the receiver. All the way up is safe, and it also blocks the charging handle’s slot; the middle notch (АВ) is automatic; the bottom notch (ОД) is single shots. Moving it is loud, a well-known giveaway.' },
    { id: 'trigger', name: 'Trigger', click: 'fires (selector off safe, round chambered)', text: 'Pulling it releases the hammer. On automatic the rifle fires at about 600 rounds a minute for as long as it is held.' },
    { id: 'magazine', name: 'Magazine', click: 'drops or loads the magazine', text: 'A 30-round steel magazine, curved because the tapered cartridges stack in an arc. It rocks in: front lug first, then back until the catch clicks. To remove it, press the paddle and rock it forward. There is no bolt hold-open: after the last round the bolt closes on an empty chamber.' },
    { id: 'magRelease', name: 'Magazine catch', click: 'drops the magazine', text: 'The paddle in front of the trigger guard. Pushing it forward frees the magazine’s rear lug.' },
    { id: 'grip', name: 'Pistol grip', text: 'Moulded from a phenolic plastic (Bakelite-type) on rifles of this period, earlier ones were wood.' },
    { id: 'stock', name: 'Stock', text: 'Laminated birch, fixed, with a steel buttplate. A trap in the butt holds the cleaning kit.' },
    { id: 'cleaningRod', name: 'Cleaning rod', text: 'Stored under the barrel, held by the front sight base and the handguard.' },
  ],
  actions: [
    { id: 'demo', label: 'Demo', key: 'D' },
    { id: 'fire', label: 'Fire', key: 'F' },
    { id: 'rack', label: 'Charging handle', key: 'R' },
    { id: 'magazine', label: 'Magazine', key: 'E' },
    { id: 'selector', label: 'Selector', key: 'S' },
    { id: 'strip', label: 'Field strip', key: 'K' },
    { id: 'range', label: 'Shooting range', key: 'G' },
  ],
  partActions: {
    receiver: 'rack', carrier: 'rack', dustCover: 'strip', trigger: 'fire', selector: 'selector', magazine: 'magazine', magRelease: 'magazine',
  },
  hint: 'G range (real) · F fire · R charging handle · E magazine · S selector · K field strip · I iso',
  load: () => import('./model'),
};
