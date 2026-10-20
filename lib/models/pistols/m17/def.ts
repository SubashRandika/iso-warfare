import type { ModelDef } from '../../../catalog/types';

export const m17: ModelDef = {
  id: 'm17', category: 'pistols', name: 'M17 pistol', tab: 'M17', designation: 'M17',
  role: 'Service pistol (SIG Sauer P320) · US Army',
  specs: [['Calibre', '9×19 mm'], ['Length', '203 mm'], ['Barrel', '119 mm'], ['Magazine', '17 rounds']],
  intro: {
    title: 'M17 pistol',
    text: 'The US Army’s Modular Handgun System, built on the SIG Sauer P320. Click a part to see what it does; parts that move will move. Load the magazine, rack the slide, take the safety off and fire, or field-strip it. Or run the demo.',
  },
  parts: [
    { id: 'slide', name: 'Slide', click: 'racks the slide (or releases it when locked back)', text: 'Stainless steel with a nitride finish, serrated front and rear for a grip when racking. On firing it recoils about three centimetres, ejects the case, cocks the striker and strips the next round from the magazine. The top is cut for a red-dot optic, here under a cover plate.' },
    { id: 'barrel', name: 'Barrel', click: 'field-strips the pistol', text: 'A 119 mm (4.7 in) barrel. It locks into the slide’s ejection port for the shot and tilts down to unlock as the slide moves back, the Browning short-recoil cycle used by most service pistols.' },
    { id: 'sights', name: 'Night sights', click: 'shows or hides the tritium glow', text: 'Fixed front and rear sights with tritium inserts: two dots at the rear notch, one on the front post. The glow comes from radioactive tritium gas in tiny glass vials, so it needs no batteries and no charging and lasts about a decade.' },
    { id: 'frame', name: 'Grip module', text: 'The polymer grip is only a housing. On the P320 it can be swapped for another size or colour in a minute, because the part that is legally the firearm sits inside it (the fire control unit).' },
    { id: 'chassis', name: 'Fire control unit', click: 'field-strips the pistol', text: 'The serialised stainless-steel chassis: rails, trigger group and striker release. It shows once the slide comes off. Moving it to a new grip module changes the pistol’s size without changing the firearm.' },
    { id: 'trigger', name: 'Trigger', click: 'fires (safety off, round chambered)', text: 'A striker-fired trigger: the slide cocks the striker as it cycles, and the trigger releases it. With an empty chamber it just clicks.' },
    { id: 'safety', name: 'Thumb safety', click: 'puts the safety on or off', text: 'An ambidextrous manual safety was an Army requirement for the M17 (the civilian P320 usually has none). Up is safe: the trigger is blocked.' },
    { id: 'slideStop', name: 'Slide stop', click: 'releases a locked-back slide', text: 'After the last round the empty magazine’s follower pushes this lever up and it holds the slide open, a visible sign the pistol is empty. Press it down (or rack the slide) to send the slide forward.' },
    { id: 'takedown', name: 'Takedown lever', click: 'field-strips the pistol', text: 'Turning it frees the slide to run forward off the frame. Unlike many striker pistols, the P320 comes apart without pulling the trigger.' },
    { id: 'magazine', name: 'Magazine', click: 'drops or loads the magazine', text: 'A double-stack steel magazine holding 17 rounds; the Army also issues a 21-round extended one. Here an ejected magazine drops onto the mat, and loading it again refills it.' },
  ],
  actions: [
    { id: 'demo', label: 'Demo', key: 'D' },
    { id: 'fire', label: 'Fire', key: 'F' },
    { id: 'rack', label: 'Rack slide', key: 'R' },
    { id: 'magazine', label: 'Magazine', key: 'E' },
    { id: 'safety', label: 'Safety', key: 'S' },
    { id: 'night', label: 'Night sights', key: 'N' },
    { id: 'strip', label: 'Field strip', key: 'P' },
  ],
  partActions: {
    slide: 'rack', slideStop: 'rack', trigger: 'fire', safety: 'safety', magazine: 'magazine', sights: 'night',
    takedown: 'strip', barrel: 'strip', chassis: 'strip',
  },
  hint: 'F fire · R rack · E magazine · S safety · P field strip · I iso · T theme',
  load: () => import('./model'),
};
