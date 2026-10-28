// Every model in the armory. Plain data (no three.js): a model's code loads only when it is opened.
// To add one, create lib/models/<category>/<id>/{def.ts, model.ts} and list its def below (see CLAUDE.md).
import type { Category, CategoryId, ModelDef } from './types';
import { CATEGORIES, DOMAINS } from './categories';
import { f22 } from '../models/fighters/f22/def';
import { f35 } from '../models/fighters/f35/def';
import { su57 } from '../models/fighters/su57/def';
import { j20 } from '../models/fighters/j20/def';
import { b2 } from '../models/bombers/b2/def';
import { b52 } from '../models/bombers/b52/def';
import { m17 } from '../models/pistols/m17/def';
import { m8 } from '../models/rifles/m8/def';
import { ak47 } from '../models/rifles/ak47/def';

export const MODELS: ModelDef[] = [f22, f35, su57, j20, b2, b52, m17, m8, ak47];

export { CATEGORIES, DOMAINS };
export const DEFAULT_MODEL = 'f22';

const byId = new Map(MODELS.map(m => [m.id, m]));
export const getModel = (id: string | null | undefined) => (id && byId.get(id)) || byId.get(DEFAULT_MODEL)!;
export const hasModel = (id: string | null | undefined) => !!id && byId.has(id);
export const modelsIn = (c: CategoryId) => MODELS.filter(m => m.category === c);
export const categoryOf = (m: ModelDef): Category => CATEGORIES.find(c => c.id === m.category)!;
/** categories that have at least one model, in shelf order */
export const stockedCategories = () => CATEGORIES.filter(c => MODELS.some(m => m.category === c.id));

// keys the host keeps for itself: iso view, theme, sound, the Line / Real switch, and armory navigation
export const RESERVED_KEYS = ['i', 't', 'm', 'h', 'escape', '[', ']', '/'];

if (process.env.NODE_ENV !== 'production') {
  const seen = new Set<string>();
  for (const m of MODELS) {
    if (seen.has(m.id)) console.warn(`[catalog] duplicate model id "${m.id}"`);
    seen.add(m.id);
    if (!CATEGORIES.some(c => c.id === m.category)) console.warn(`[catalog] ${m.id}: unknown category "${m.category}"`);
    const keys = new Set<string>();
    for (const a of m.actions) {
      const k = a.key.toLowerCase();
      if (RESERVED_KEYS.includes(k)) console.warn(`[catalog] ${m.id}: action "${a.id}" uses reserved key ${a.key}`);
      if (keys.has(k)) console.warn(`[catalog] ${m.id}: key ${a.key} bound twice`);
      keys.add(k);
    }
    for (const [p, a] of Object.entries(m.partActions)) if (!m.parts.some(x => x.id === p)) console.warn(`[catalog] ${m.id}: partActions names unknown part "${p}" (→ ${a})`);
  }
}
