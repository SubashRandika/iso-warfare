'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { Command, JetApi, Snapshot } from '@/lib/jet/controller';
import { JETS, JET_IDS } from '@/lib/jets/catalog';
import type { JetId } from '@/lib/jets/types';
import { ACCENTS } from '@/lib/iso/accents';

const JET_KEY = 'iso-warfare-jet';
const readJet = (): JetId => {
  try {
    const q = new URLSearchParams(location.search).get('jet');
    const v = q || localStorage.getItem(JET_KEY);
    return JET_IDS.includes(v as JetId) ? (v as JetId) : 'f22';
  } catch { return 'f22'; }
};

export default function JetViewer() {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<JetApi | null>(null);
  const [jet, setJet] = useState<JetId | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => { setJet(readJet()); }, []);

  // one scene per jet: switching tears the old one down and builds the new airframe
  useEffect(() => {
    if (!jet) return;
    let disposed = false, inst: JetApi | null = null;
    setSnap(null);
    import('@/lib/jet/controller').then(({ createJetApp }) => {
      if (disposed || !host.current) return;
      inst = createJetApp(host.current, jet, setSnap);
      api.current = inst;
    });
    return () => { disposed = true; inst?.dispose(); api.current = null; };
  }, [jet]);

  const pickJet = (id: JetId) => (e: MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    if (id === jet) return;
    try { localStorage.setItem(JET_KEY, id); } catch { /* ignore */ }
    const u = new URL(location.href); u.searchParams.set('jet', id); history.replaceState(null, '', u);
    setJet(id);
  };
  const run = (c: Command) => (e: MouseEvent<HTMLButtonElement>) => { api.current?.run(c); e.currentTarget.blur(); };
  const pick = (id: string) => (e: MouseEvent<HTMLButtonElement>) => { api.current?.select(snap?.selected === id ? null : id); e.currentTarget.blur(); };

  const def = JETS[jet ?? 'f22'];
  const sel = snap?.selected ? def.parts.find(p => p.id === snap.selected) ?? null : null;

  return (
    <>
      <div ref={host} className="stage" aria-label={`Interactive 3D ${def.name}. Drag to orbit, click parts to operate them.`} role="img" />

      <header className="ui top">
        <div className="lead">
          <div className="brand">
            <span className="mark" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 1 L11 7 L17 10 L11 11 L10 17 L9 15 L8 17 L7 11 L1 10 L7 7 Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
            </span>
            <b>Iso-Warfare</b>
          </div>
          <div className="seg" role="tablist" aria-label="Aircraft">
            {JET_IDS.map(id => (
              <button key={id} role="tab" aria-selected={jet === id} onClick={pickJet(id)}>{JETS[id].tab}</button>
            ))}
          </div>
        </div>
        <div className="specs" aria-label="Specifications">
          {def.specs.map(([k, v]) => <span key={k}>{k}<em>{v}</em></span>)}
        </div>
        <div className="tools">
          <div className="swatches" role="radiogroup" aria-label="Glow colour">
            {ACCENTS.map(a => (
              <button key={a.id} role="radio" aria-checked={snap?.accent === a.id} aria-label={a.name} title={a.name}
                style={{ ['--sw' as string]: snap?.theme === 'light' ? a.light : a.dark }}
                onClick={e => { api.current?.setAccent(a.id); e.currentTarget.blur(); }}><i /></button>
            ))}
          </div>
          <button className="pill" aria-pressed={!!snap?.spin} onClick={run('spin')} title="Slowly turn the camera around the jet">⟳<span>Revolve</span></button>
          <button className="round" onClick={run('sound')} aria-pressed={!!snap?.sound} title="Sound on / off (M)" aria-label="Sound on or off">{snap?.sound ? '♪' : '–'}</button>
          <button className="round" onClick={run('theme')} title="Light / dark (T)" aria-label="Switch light or dark theme">◐</button>
        </div>
      </header>

      <nav className="ui parts" aria-label="Parts">
        <h3>Parts</h3>
        {def.parts.map((p, i) => (
          <button key={p.id} aria-pressed={snap?.selected === p.id} onClick={pick(p.id)}>
            <i>{String(i + 1).padStart(2, '0')}</i>{p.name}
          </button>
        ))}
      </nav>

      <div className="ui ctl" role="toolbar" aria-label="Aircraft controls">
        {def.actions.map(a => (
          <button key={a.id} className={snap?.on[a.id] ? 'on' : ''} onClick={run(a.id)} aria-pressed={!!snap?.on[a.id]}>
            {a.label}<kbd>{a.key}</kbd>
          </button>
        ))}
        <div className="sep" />
        <button className={snap?.iso ? 'on' : ''} onClick={run('iso')} aria-pressed={!!snap?.iso}>Iso view<kbd>I</kbd></button>
      </div>

      <section className="ui info" aria-live="polite">
        <h2>{sel ? sel.name : def.intro.title}</h2>
        <p>{sel ? sel.text : def.intro.text}</p>
        {sel?.click && <p className="act">Click it on the jet: <b>{sel.click}</b></p>}
      </section>
      <div className="ui hint">{def.hint}</div>
      <a className="ui credit" href="https://iso-glow.vercel.app" target="_blank" rel="noopener noreferrer">Made with ISO-GLOW ↗</a>
      <div className="ui read" aria-live="off">{snap ? snap.readout : 'loading'}</div>
    </>
  );
}
