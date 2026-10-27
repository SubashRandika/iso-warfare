'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import type { Snapshot, ViewCommand, ViewerApi } from '@/lib/core/host';
import { categoryOf, DEFAULT_MODEL, getModel, hasModel, modelsIn } from '@/lib/catalog';
import { ACCENTS } from '@/lib/iso/accents';
import Armory from './Armory';
import { COUNTRY_NAMES, Flag } from './Flag';
import RangeHud from './RangeHud';

const MODEL_KEY = 'iso-warfare-model';
/** ?model=, then the last one opened (older links and saves used ?jet= / iso-warfare-jet) */
const readModel = (): string => {
  try {
    const u = new URLSearchParams(location.search);
    for (const v of [u.get('model'), u.get('jet'), localStorage.getItem(MODEL_KEY), localStorage.getItem('iso-warfare-jet')]) if (hasModel(v)) return v!;
  } catch { /* ignore */ }
  return DEFAULT_MODEL;
};

export default function Viewer() {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<ViewerApi | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [id, setId] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [armory, setArmory] = useState(false);

  useEffect(() => { setId(readModel()); }, []);

  // one scene per model: switching tears the old one down and loads the new model's code
  useEffect(() => {
    if (!id) return;
    let disposed = false, inst: ViewerApi | null = null;
    setSnap(null); setFailed(false);
    const def = getModel(id);
    Promise.all([import('@/lib/core/host'), def.load()]).then(([{ createViewer }, mod]) => {
      if (disposed || !host.current) return;
      inst = createViewer(host.current, def, mod.default, setSnap);
      api.current = inst;
    }).catch(err => { console.error(err); if (!disposed) setFailed(true); });
    return () => { disposed = true; inst?.dispose(); api.current = null; };
  }, [id]);

  const open = useCallback((next: string) => {
    setArmory(false);
    if (next === id) return;
    try { localStorage.setItem(MODEL_KEY, next); } catch { /* ignore */ }
    const u = new URL(location.href); u.searchParams.delete('jet'); u.searchParams.delete('demo'); u.searchParams.set('model', next); history.replaceState(null, '', u);
    setId(next);
  }, [id]);
  const closeArmory = useCallback(() => { setArmory(false); toggle.current?.focus(); }, []);

  const def = getModel(id);
  const cat = categoryOf(def);
  const siblings = modelsIn(def.category);

  // "/" opens the armory; [ and ] step through the models in this category
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'))) return;
      if (e.key === '/') { e.preventDefault(); setArmory(true); }
      else if ((e.key === '[' || e.key === ']') && siblings.length > 1) {
        const i = siblings.findIndex(m => m.id === def.id), n = siblings.length;
        open(siblings[(i + (e.key === ']' ? 1 : n - 1)) % n].id);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [siblings, def.id, open]);

  const run = (c: string) => (e: MouseEvent<HTMLButtonElement>) => { api.current?.run(c); e.currentTarget.blur(); };
  const pick = (p: string) => (e: MouseEvent<HTMLButtonElement>) => { api.current?.select(snap?.selected === p ? null : p); e.currentTarget.blur(); };
  const view = (c: ViewCommand) => run(c);
  const sel = snap?.selected ? def.parts.find(p => p.id === snap.selected) ?? null : null;
  // hint segments as keycaps + label: 'Z X yaw' → keys [Z, X], label 'yaw'
  const hint = `${def.hint}${snap?.style ? ' · H real view' : ''} · / armory`.split(' · ').map(seg => {
    const t = seg.split(' '); let i = 0;
    while (i < t.length - 1 && t[i].length <= 2) i++;
    return { keys: t.slice(0, i), label: t.slice(i).join(' ') };
  });
  // a game overlay (the shooting range) replaces the viewer's panels while it shows
  const range = snap?.hud ?? null;
  const status = failed ? [`${def.name} failed to load`, 'reload the page to retry'] : snap ? snap.readout.split(' · ') : ['loading'];

  return (
    <>
      <div ref={host} className={range ? 'stage ranging' : 'stage'} role="img"
        aria-label={range ? `Shooting range, lane ${range.lane}. Click to take control; Escape leaves.` : `Interactive 3D ${def.name}. Drag to orbit, click parts to operate them.`} />

      {range && <RangeHud h={range} />}
      {!range && <>
      <header className="ui top">
        <div className="lead">
          <div className="brand">
            <span className="mark" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 1 L11 7 L17 10 L11 11 L10 17 L9 15 L8 17 L7 11 L1 10 L7 7 Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
            </span>
            <b>Iso-Warfare</b>
          </div>
          <button ref={toggle} className="crumb" data-armory-toggle aria-expanded={armory} aria-controls="armory" onClick={() => setArmory(a => !a)} title="Open the armory (/)">
            <span className="crumb-cat">{cat.name}</span><span className="crumb-caret" aria-hidden="true">▾</span>
          </button>
          {siblings.length > 1 && (
            <div className="seg" role="tablist" aria-label={cat.name}>
              {siblings.map(m => (
                <button key={m.id} role="tab" aria-selected={m.id === def.id} onClick={e => { e.currentTarget.blur(); open(m.id); }}>{m.tab}</button>
              ))}
            </div>
          )}
          {siblings.length === 1 && <span className="solo">{def.name}</span>}
        </div>
        <div className="specs" aria-label="Specifications">
          {def.specs.map(([k, v]) => <span key={k}>{k}<em>{v}</em></span>)}
        </div>
        <div className="tools">
          {snap?.style && (
            <div className="seg style" role="radiogroup" aria-label="Render style" title="Hairline drawing or realistic textured view (H)">
              {(['line', 'real'] as const).map(s => (
                <button key={s} role="radio" aria-checked={s === 'line' ? snap.style === 'line' : snap.style !== 'line'}
                  onClick={e => { e.currentTarget.blur(); if ((s === 'line') !== (snap.style === 'line')) api.current?.run('real'); }}>
                  {s === 'line' ? 'Line' : snap.style === 'loading' ? 'Real…' : 'Real'}
                </button>
              ))}
            </div>
          )}
          <div className="swatches" role="radiogroup" aria-label="Glow colour">
            {ACCENTS.map(a => (
              <button key={a.id} role="radio" aria-checked={snap?.accent === a.id} aria-label={a.name} title={a.name}
                style={{ ['--sw' as string]: snap?.theme === 'light' ? a.light : a.dark }}
                onClick={e => { api.current?.setAccent(a.id); e.currentTarget.blur(); }}><i /></button>
            ))}
          </div>
          <button className="pill" aria-pressed={!!snap?.spin} onClick={view('spin')} title={`Slowly turn the camera around the ${cat.one}`}>⟳<span>Revolve</span></button>
          <button className="round" onClick={view('sound')} aria-pressed={!!snap?.sound} title="Sound on / off (M)" aria-label="Sound on or off">{snap?.sound ? '♪' : '–'}</button>
          <button className="round" onClick={view('theme')} title="Light / dark (T)" aria-label="Switch light or dark theme">◐</button>
        </div>
      </header>

      {armory && <Armory current={def.id} onPick={open} onClose={closeArmory} />}

      <nav className="ui parts" aria-label="Parts">
        <h3>Parts</h3>
        {def.parts.map((p, i) => (
          <button key={p.id} aria-pressed={snap?.selected === p.id} onClick={pick(p.id)}>
            <i>{String(i + 1).padStart(2, '0')}</i>{p.name}
          </button>
        ))}
      </nav>

      <div className="ui ctl" role="toolbar" aria-label={`${def.name} controls`}>
        {def.actions.map(a => (
          <button key={a.id} className={snap?.on[a.id] ? 'on' : ''} onClick={run(a.id)} aria-pressed={!!snap?.on[a.id]}>
            {a.label}<kbd>{a.key}</kbd>
          </button>
        ))}
        <div className="sep" />
        <button className={snap?.iso ? 'on' : ''} onClick={view('iso')} aria-pressed={!!snap?.iso}>Iso view<kbd>I</kbd></button>
      </div>

      <section className="ui info" aria-live="polite">
        <h2>{sel ? sel.name : def.name}</h2>
        {sel ? <>
          <p>{sel.text}</p>
          {sel.click && <p className="act">Click it on the {cat.one}: <b>{sel.click}</b></p>}
        </> : <>
          <dl className="facts">
            <dt>Country</dt><dd><Flag country={def.info.country} />{COUNTRY_NAMES[def.info.country]}</dd>
            <dt>Manufacturer</dt><dd>{def.info.manufacturer}</dd>
            <dt>Role</dt><dd>{def.info.role}</dd>
            <dt>Status</dt><dd>{def.info.status.startsWith('In service') && <i className="live" aria-hidden="true" />}{def.info.status}</dd>
            <dt>{cat.domain === 'air' ? 'First flight' : 'First used'}</dt><dd className="num">{def.info.first}</dd>
          </dl>
          <p className="act">Click a part to see what it does.</p>
        </>}
      </section>
      <ul className="ui hint" aria-label="Keyboard shortcuts">
        {hint.map(h => <li key={h.label}>{h.keys.map(k => <kbd key={k}>{k}</kbd>)}<span>{h.label}</span></li>)}
      </ul>
      <a className="ui credit" href="https://iso-glow.vercel.app" target="_blank" rel="noopener noreferrer">Made with ISO-GLOW ↗</a>
      <div className="ui read" aria-live="off" role="status">{status.map((s, i) => <span key={i}>{s}</span>)}</div>
      </>}
    </>
  );
}
