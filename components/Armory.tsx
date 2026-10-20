'use client';

// The armory index: every model, grouped by domain and category, with a filter. Opens from the header (or "/").
import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, DOMAINS, MODELS } from '@/lib/catalog';
import type { ModelDef } from '@/lib/catalog/types';

export default function Armory({ current, onPick, onClose }: { current: string; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  // close on Escape or a click outside the panel
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current && !panel.current.contains(t) && !(t as HTMLElement).closest?.('[data-armory-toggle]')) onClose();
    };
    window.addEventListener('keydown', key, true); window.addEventListener('pointerdown', down);
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('pointerdown', down); };
  }, [onClose]);

  const match = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return (_: ModelDef) => true;
    return (m: ModelDef) => {
      const c = CATEGORIES.find(x => x.id === m.category)!;
      return [m.name, m.designation, m.role, c.name, c.one].some(t => t.toLowerCase().includes(s));
    };
  }, [q]);

  const groups = DOMAINS.map(d => ({
    d,
    cats: CATEGORIES.filter(c => c.domain === d.id).map(c => ({ c, models: MODELS.filter(m => m.category === c.id && match(m)) })).filter(x => x.models.length),
  })).filter(g => g.cats.length);
  const stocked = CATEGORIES.filter(c => MODELS.some(m => m.category === c.id)).length;

  return (
    <div ref={panel} id="armory" className="ui armory" role="dialog" aria-label="Armory">
      <div className="armory-head">
        <h2>Armory</h2>
        <span>{MODELS.length} models · {stocked} {stocked === 1 ? 'category' : 'categories'}</span>
        <button className="x" onClick={onClose} aria-label="Close the armory">×</button>
      </div>
      <input ref={input} className="armory-find" type="search" value={q} onChange={e => setQ(e.target.value)}
        placeholder="Filter by name or type" aria-label="Filter models" spellCheck={false}
        onKeyDown={e => { if (e.key === 'Enter') { const first = groups[0]?.cats[0]?.models[0]; if (first) onPick(first.id); } }} />
      <div className="armory-list">
        {groups.map(({ d, cats }) => (
          <section key={d.id} aria-label={d.name}>
            <h3>{d.name}</h3>
            {cats.map(({ c, models }) => (
              <div key={c.id} className="armory-cat">
                <h4>{c.name}<i>{models.length}</i></h4>
                {models.map(m => (
                  <button key={m.id} className="armory-item" aria-current={m.id === current ? 'true' : undefined} onClick={() => onPick(m.id)}>
                    <b className="stencil">{m.designation}</b>
                    <span><em>{m.name}</em>{m.role}</span>
                  </button>
                ))}
              </div>
            ))}
          </section>
        ))}
        {!groups.length && <p className="armory-none">Nothing matches “{q}”. Try a type such as pistol or fighter.</p>}
      </div>
    </div>
  );
}
