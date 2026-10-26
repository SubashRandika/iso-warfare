// National flags for the information card, drawn as SVG at their official proportions (emoji flags don't render on
// Windows). One entry per CountryId in lib/catalog/types.ts; add the flag here when a model brings a new country.
import type { JSX } from 'react';
import type { CountryId } from '@/lib/catalog/types';

export const COUNTRY_NAMES: Record<CountryId, string> = { US: 'United States', RU: 'Russia', CN: 'China' };

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

const FLAGS: Record<CountryId, () => JSX.Element> = { US, RU, CN };

export function Flag({ country }: { country: CountryId }) {
  const F = FLAGS[country];
  return <span className="flag" role="img" aria-label={`Flag of ${COUNTRY_NAMES[country]}`}><F /></span>;
}
