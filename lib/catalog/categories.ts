// The armory's shelves. Every category exists up front; the armory shows a category once it has a model.
// Order here is the order on screen.
import type { Category, Domain } from './types';

export const DOMAINS: Domain[] = [
  { id: 'air', name: 'Air' },
  { id: 'land', name: 'Land' },
  { id: 'sea', name: 'Sea' },
  { id: 'strike', name: 'Strike' },
  { id: 'small-arms', name: 'Small arms' },
];

export const CATEGORIES: Category[] = [
  { id: 'fighters', domain: 'air', name: 'Fighter jets', one: 'fighter' },
  { id: 'bombers', domain: 'air', name: 'Bombers', one: 'bomber' },
  { id: 'tanks', domain: 'land', name: 'Tanks', one: 'tank' },
  { id: 'trucks', domain: 'land', name: 'Military trucks', one: 'truck' },
  { id: 'warships', domain: 'sea', name: 'Warships', one: 'warship' },
  { id: 'missiles', domain: 'strike', name: 'Missiles', one: 'missile' },
  { id: 'launchers', domain: 'strike', name: 'Missile launchers', one: 'launcher' },
  { id: 'pistols', domain: 'small-arms', name: 'Pistols', one: 'pistol' },
  { id: 'rifles', domain: 'small-arms', name: 'Rifles', one: 'rifle' },
  { id: 'sniper-rifles', domain: 'small-arms', name: 'Sniper rifles', one: 'sniper rifle' },
  { id: 'machine-guns', domain: 'small-arms', name: 'Machine guns', one: 'machine gun' },
];
