'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { Command, RaptorApi, Snapshot } from '@/lib/raptor';
import { ACTIONS, PART, PARTS, type PartId } from '@/lib/raptor/parts';
import { ACCENTS } from '@/lib/iso/accents';

const INTRO = {
  title: 'F-22 Raptor',
  text: 'Click any part to see what it does; parts that move will move. Drag to orbit, scroll to zoom, right-drag to pan. Start the engines, close the canopy and take off, or run the demo.',
};

export default function RaptorViewer() {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<RaptorApi | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    let disposed = false, inst: RaptorApi | null = null;
    import('@/lib/raptor').then(({ createRaptor }) => {
      if (disposed || !host.current) return;
      inst = createRaptor(host.current, setSnap);
      api.current = inst;
    });
    return () => { disposed = true; inst?.dispose(); api.current = null; };
  }, []);

  const run = (c: Command) => (e: MouseEvent<HTMLButtonElement>) => { api.current?.run(c); e.currentTarget.blur(); };
  const pick = (id: PartId) => (e: MouseEvent<HTMLButtonElement>) => { api.current?.select(snap?.selected === id ? null : id); e.currentTarget.blur(); };

  const sel = snap?.selected ? PART[snap.selected] : null;

  return (
    <>
      <div ref={host} className="stage" aria-label="Interactive 3D F-22 Raptor. Drag to orbit, click parts to operate them." role="img" />

      <header className="ui top">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 1 L11 7 L17 10 L11 11 L10 17 L9 15 L8 17 L7 11 L1 10 L7 7 Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
          </span>
          <b>Iso-Warfare</b><span className="sub">· F-22 Raptor</span>
        </div>
        <div className="specs" aria-label="Specifications">
          <span>Length<em>18.9 m</em></span><span>Span<em>13.6 m</em></span><span>Height<em>5.1 m</em></span><span>Engines<em>2 × F119</em></span>
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
        {PARTS.map((p, i) => (
          <button key={p.id} aria-pressed={snap?.selected === p.id} onClick={pick(p.id)}>
            <i>{String(i + 1).padStart(2, '0')}</i>{p.name}
          </button>
        ))}
      </nav>

      <div className="ui ctl" role="toolbar" aria-label="Aircraft controls">
        {ACTIONS.map(a => (
          <button key={a.id} className={snap?.on[a.id] ? 'on' : ''} onClick={run(a.id)} aria-pressed={!!snap?.on[a.id]}>
            {a.label}<kbd>{a.key}</kbd>
          </button>
        ))}
        <div className="sep" />
        <button className={snap?.iso ? 'on' : ''} onClick={run('iso')} aria-pressed={!!snap?.iso}>Iso view<kbd>I</kbd></button>
      </div>

      <section className="ui info" aria-live="polite">
        <h2>{sel ? sel.name : INTRO.title}</h2>
        <p>{sel ? sel.text : INTRO.text}</p>
        {sel?.click && <p className="act">Click it on the jet: <b>{sel.click}</b></p>}
      </section>
      <div className="ui hint">↑↓ pitch · ←→ roll · Z X yaw · E engines · G take off · I iso · T theme</div>
      <a className="ui credit" href="https://iso-glow.vercel.app" target="_blank" rel="noopener noreferrer">Made with ISO-GLOW ↗</a>
      <div className="ui read" aria-live="off">{snap ? snap.readout : 'loading'}</div>
    </>
  );
}
