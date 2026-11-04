// What the shooting range shows on its head-up overlay (components/RangeHud.tsx). Plain data: the host puts it in the
// snapshot, so the UI never imports three.js. Numbers are rounded where they are made, so the snapshot only changes
// (and React only renders) when something on screen does.

/** where a shot went: scoring zones A, C, D on a hostile, a miss, a no-shoot hit, or the steel guard */
export type ShotZone = 'A' | 'C' | 'D' | 'M' | 'NS' | 'S';

export interface ShotRecord {
  n: number;                       // shot number in this string
  split: number;                   // seconds since the previous shot (since the beep for the first)
  zone: ShotZone;
  dist: number;                    // metres to what it hit (0 for a miss)
}

export interface RangeResult {
  score: number; best: number; newBest: boolean;
  shots: number; hits: number; presented: number; noShoot: number;
  zones: Record<'A' | 'C' | 'D', number>;
  accuracy: number;                // per cent of shots that hit a hostile
  reaction: number;                // mean seconds from a target standing up to its hit (0 if none)
  longest: number;                 // the field: the farthest hit, metres
}

export interface RangeHud {
  kind: 'range';
  lane: number; gun: string; calibre: string;
  /** setup: lane loading · free: free practice · standby: waiting for the beep · live: the drill · done: results */
  phase: 'setup' | 'free' | 'standby' | 'live' | 'done';
  /** the pointer is captured; otherwise the overlay asks for a click */
  locked: boolean;
  lowLight: boolean;
  /** seconds left in the drill (live), the drill's length otherwise */
  time: number;
  par: number;
  score: number; shots: number; hits: number; presented: number; noShoot: number;
  rounds: number; cap: number; chamber: boolean; magIn: boolean; safe: boolean; slideLocked: boolean; reloading: boolean;
  aiming: boolean;
  /** the selector's setting ('safe', 'semi', 'auto') for weapons that have one */
  mode: string | null;
  /** the optic's magnification while looking through it */
  power: number | null;
  /** breath held: 1 full, 0 out of breath; null when breathing normally */
  breath: number | null;
  shotsList: ShotRecord[];
  /** the last hit, for the marker: `seq` changes on every shot that hits something */
  hit: { seq: number; zone: ShotZone };
  /** the range officer's last command and when it changed */
  call: { seq: number; text: string };
  result: RangeResult | null;
  /** the weapons that can be changed to on the range (key, name, the one in the hands) */
  weapons: { key: string; name: string; on: boolean }[];
  /** the weapon's own keys (RangeGun.keys) */
  keys: [string, string][];
  /** the indoor hall, or the long-distance field */
  site: 'hall' | 'field';
  /** the field's data: the turret's elevation (mrad), the wind (m/s; + from the left), the called target's distance, and
   *  the spotter's dope for it: the elevation to dial and the hold for the wind (mrad, + to the left) */
  dope: { elev: number; wind: number; dist: number | null; need: number | null; hold: number | null } | null;
}
