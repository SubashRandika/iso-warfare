// National flags for the information card, drawn as SVG at their official proportions (emoji flags don't render on
// Windows). One entry per CountryId in lib/catalog/types.ts; add the flag here when a model brings a new country.
import type { JSX } from 'react';
import type { CountryId } from '@/lib/catalog/types';

export const COUNTRY_NAMES: Record<CountryId, string> = { US: 'United States', RU: 'Russia', CN: 'China', SU: 'Soviet Union', DE: 'Germany', GB: 'United Kingdom' };

/** a five-pointed star centred at (cx, cy), outer radius r, one point toward angle a (radians, y down) */
function star(cx: number, cy: number, r: number, a = -Math.PI / 2) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const t = a + i * Math.PI / 5, k = i % 2 ? r * 0.382 : r;
    pts.push(`${(cx + k * Math.cos(t)).toFixed(3)},${(cy + k * Math.sin(t)).toFixed(3)}`);
  }
  return `M${pts.join('L')}Z`;
}

/** United States, 19:10: 13 stripes, a canton of 50 stars in 9 alternating rows of 6 and 5 */
function US() {
  const stripe = 100 / 13, stars: string[] = [];
  for (let row = 0; row < 9; row++) for (let col = row % 2; col < 11; col += 2) stars.push(star(6.33 * (col + 1), 5.385 * (row + 1), 3.08));
  return (
    <svg viewBox="0 0 190 100">
      <rect width="190" height="100" fill="#fff" />
      {Array.from({ length: 7 }, (_, i) => <rect key={i} y={i * 2 * stripe} width="190" height={stripe} fill="#B22234" />)}
      <rect width="76" height={stripe * 7} fill="#3C3B6E" />
      <path d={stars.join('')} fill="#fff" />
    </svg>
  );
}

/** Russia, 3:2: white, blue and red bands */
function RU() {
  return (
    <svg viewBox="0 0 9 6">
      <rect width="9" height="2" fill="#fff" /><rect y="2" width="9" height="2" fill="#0039A6" /><rect y="4" width="9" height="2" fill="#D52B1E" />
    </svg>
  );
}

/** China, 3:2: a large star and four small ones, each small star pointing at the large one's centre */
function CN() {
  const small = [[10, 2], [12, 4], [12, 7], [10, 9]];
  return (
    <svg viewBox="0 0 30 20">
      <rect width="30" height="20" fill="#EE1C25" />
      <path d={[star(5, 5, 3), ...small.map(([x, y]) => star(x, y, 1, Math.atan2(5 - y, 5 - x)))].join('')} fill="#FFFF00" />
    </svg>
  );
}

/** Soviet Union, 2:1: red, a gold hammer and sickle under a gold-bordered star in the upper hoist */
function SU() {
  return (
    <svg viewBox="0 0 40 20">
      <rect width="40" height="20" fill="#CC0000" />
      <path d={star(7.5, 2.7, 1.55)} fill="none" stroke="#FFD700" strokeWidth="0.35" strokeLinejoin="round" />
      <g fill="none" stroke="#FFD700" strokeLinecap="round">
        <path d="M5.4 5.4 A3.1 3.1 0 1 0 9.8 9.4" strokeWidth="0.85" />
        <path d="M6.6 9.2 L5.4 10.4" strokeWidth="0.85" />
        <path d="M6.3 6.4 L9.6 9.7" strokeWidth="0.65" />
        <path d="M5.2 7.3 L7.3 5.2" strokeWidth="1.15" strokeLinecap="butt" />
      </g>
    </svg>
  );
}

/** Germany, 5:3: black, red and gold bands */
function DE() {
  return (
    <svg viewBox="0 0 5 3">
      <rect width="5" height="1" fill="#000" /><rect y="1" width="5" height="1" fill="#DD0000" /><rect y="2" width="5" height="1" fill="#FFCE00" />
    </svg>
  );
}

/** United Kingdom, 2:1: the Union Flag, its red saltire counterchanged (offset clockwise within the white) */
function GB() {
  return (
    <svg viewBox="0 0 60 30">
      <clipPath id="flag-gb-saltire"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#flag-gb-saltire)" stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

const FLAGS: Record<CountryId, () => JSX.Element> = { US, RU, CN, SU, DE, GB };

export function Flag({ country }: { country: CountryId }) {
  const F = FLAGS[country];
  return <span className="flag" role="img" aria-label={`Flag of ${COUNTRY_NAMES[country]}`}><F /></span>;
}
