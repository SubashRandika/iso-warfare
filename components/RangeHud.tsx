'use client';

// The shooting range's overlay: lane plate, the shot timer, the range officer's commands, the shot string (each
// shot's split and where it went, as a shot timer's review shows it), score, the magazine, and the cards for
// taking the line and for the drill's result. Purely a view of the model's RangeHud state; clicks pass through to
// the scene (the first click captures the mouse).
import type { RangeHud as Hud, ShotZone } from '@/lib/range/hud';

const ZONE_NAME: Record<ShotZone, string> = { A: 'A', C: 'C', D: 'D', M: 'Miss', NS: 'No-shoot', S: 'Steel' };
const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

const CONTROLS: [string, string][] = [
  ['Mouse', 'look'], ['Left click', 'fire'], ['Right click · Z', 'aim'], ['Wheel', 'zoom while aiming'],
  ['W A S D', 'walk'], ['C', 'kneel'], ['Shift', 'hold breath'], ['R', 'reload'], ['X', 'safety'], ['N', 'night sights'],
  ['Space', 'start the drill'], ['T', 'house lights'], ['1 2 · Q', 'change weapon'], ['Esc', 'leave the range'],
];
/** the card's controls with the weapon's own keys laid over them (same key: replaced; new keys before Esc) */
const controls = (own: [string, string][]) => {
  const list = CONTROLS.map(([k, v]) => [k, own.find(o => o[0] === k)?.[1] ?? v] as [string, string]);
  list.splice(list.length - 1, 0, ...own.filter(([k]) => !CONTROLS.some(c => c[0] === k)));
  return list;
};

export default function RangeHud({ h }: { h: Hud }) {
  const live = h.phase === 'live', head = h.phase === 'live' ? clock(h.time) : h.phase === 'standby' ? 'Standby' : h.phase === 'done' ? clock(0) : h.phase === 'setup' ? '—' : 'Free';
  const label = live ? 'Drill' : h.phase === 'free' ? 'Free practice' : h.phase === 'standby' ? 'Wait for the beep' : h.phase === 'done' ? 'Cease fire' : 'Load and make ready';
  const status = h.reloading ? 'Reloading' : !h.magIn ? 'Magazine out' : h.slideLocked ? (h.mode ? 'Bolt locked · R' : 'Slide locked · R') : h.safe ? 'Safe · X' : !h.chamber ? 'Chamber empty' : h.mode ? (h.mode === 'auto' ? 'Auto' : 'Semi') : 'Ready';
  const shotsDesc = [...h.shotsList].reverse();
  const r = h.result;

  return (
    <div className={`range${h.aiming ? ' aiming' : ''}`}>
      <div className="r-lane">
        <b>Lane {h.lane}</b>
        <span>{h.gun} · {h.calibre}{h.site === 'field' ? ' · 1000 m field' : h.lowLight ? ' · low light' : ''}</span>
      </div>

      <div className={`r-timer${live ? ' live' : ''}`} role="timer" aria-label={label}>
        <span className="r-k">{label}</span>
        <span className="r-t">{head}</span>
        {(live || h.phase === 'standby') && <span className="r-k">par {h.par} s</span>}
      </div>

      <div className="r-leave"><kbd>Esc</kbd><span>leave the range</span></div>

      {!h.aiming && <i className="r-dot" aria-hidden="true" />}
      {h.hit.seq > 0 && <i key={`hit${h.hit.seq}`} className={`r-mark z-${h.hit.zone}`} aria-hidden="true" />}
      {h.breath !== null && <i className="r-breath" style={{ ['--b' as string]: h.breath }} aria-hidden="true" />}
      {h.power !== null && <div className="r-power" aria-label={`Optic at ${h.power} power`}><b>{h.power.toFixed(1)}×</b><span>wheel</span></div>}
      {h.dope && (
        <dl className="r-dope" aria-label="Firing data">
          <div><dt>Elevation</dt><dd><b>{h.dope.elev.toFixed(1)}</b> mil</dd><span><kbd>U</kbd><kbd>J</kbd><kbd>N</kbd></span></div>
          <div><dt>Wind</dt><dd><b>{Math.abs(h.dope.wind).toFixed(1)}</b> m/s</dd>
            <span className="r-wind" aria-label={h.dope.wind > 0 ? 'from the left' : 'from the right'}>{h.dope.wind > 0 ? '→' : '←'}</span></div>
          <div><dt>Target</dt><dd><b>{h.dope.dist ?? '—'}</b>{h.dope.dist ? ' m' : ''}</dd></div>
        </dl>
      )}
      {h.call.text && <div key={`call${h.call.seq}`} className="r-call" role="status">{h.call.text}</div>}

      <div className="r-score" aria-label="Score">
        <span className="r-k">Score</span>
        <b>{h.score}</b>
        <span className="r-sub">{h.hits}/{h.presented} hit · {h.shots ? Math.round(h.hits / h.shots * 100) : 0}%{h.site === 'field' ? ' · a point per 100 m' : ` · ${h.noShoot} no-shoot`}</span>
      </div>

      {shotsDesc.length > 0 && (
        <ol className="r-string" aria-label="Shot string">
          {shotsDesc.map(s => (
            <li key={s.n} className={`z-${s.zone}`}>
              <i>{String(s.n).padStart(2, '0')}</i><em title={ZONE_NAME[s.zone]}>{s.zone}</em>
              <span>{s.split.toFixed(2)}</span><span>{s.dist ? `${s.dist} m` : '—'}</span>
            </li>
          ))}
        </ol>
      )}

      {h.weapons.length > 0 && (
        <ol className="r-weapons" aria-label="Weapons">
          {h.weapons.map(w => <li key={w.key} className={w.on ? 'on' : ''} aria-current={w.on || undefined}><kbd>{w.key}</kbd>{w.name}</li>)}
        </ol>
      )}

      <div className={`r-ammo${h.safe || h.slideLocked || !h.magIn ? ' warn' : ''}`} aria-label={`${h.rounds} in the magazine${h.chamber ? ', one chambered' : ''}`}>
        <div className="r-count"><b>{h.magIn ? h.rounds : '–'}</b>{h.chamber && <em>+1</em>}<span>/{h.cap}</span></div>
        <div className="r-cells" aria-hidden="true">
          {Array.from({ length: h.cap }, (_, i) => <i key={i} className={h.magIn && i < h.rounds ? 'on' : ''} />)}
        </div>
        <span className="r-k">{status}</span>
      </div>

      {!h.locked && h.phase !== 'done' && (
        <div className="r-card r-take">
          <b className="r-big">Lane {h.lane}</b>
          <p>Click to take the line</p>
          <dl>{controls(h.keys).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </div>
      )}

      {r && h.phase === 'done' && (
        <div className="r-card r-result" aria-live="polite">
          <span className="r-k">{h.site === 'field' ? 'Course complete' : 'Drill complete'} · {h.par} s</span>
          <b className="r-big">{r.score}</b>
          <p>{r.newBest ? 'New best on this lane' : `Best ${r.best}`}</p>
          {h.site === 'field' ? (
            <dl>
              <div><dt>Plates hit</dt><dd>{r.hits} of {r.presented} called</dd></div>
              <div><dt>Accuracy</dt><dd>{r.accuracy}% of {r.shots} rounds</dd></div>
              <div><dt>Longest hit</dt><dd>{r.longest ? `${r.longest} m` : '—'}</dd></div>
              <div><dt>Mean time to a hit</dt><dd>{r.reaction ? `${r.reaction.toFixed(1)} s` : '—'}</dd></div>
            </dl>
          ) : (
            <dl>
              <div><dt>Targets hit</dt><dd>{r.hits} of {r.presented}</dd></div>
              <div><dt>Accuracy</dt><dd>{r.accuracy}% of {r.shots} shots</dd></div>
              <div><dt>Zones</dt><dd>A {r.zones.A} · C {r.zones.C} · D {r.zones.D}</dd></div>
              <div><dt>No-shoots hit</dt><dd>{r.noShoot}</dd></div>
              <div><dt>Mean reaction</dt><dd>{r.reaction ? `${r.reaction.toFixed(2)} s` : '—'}</dd></div>
            </dl>
          )}
          <p className="r-again"><kbd>Space</kbd> run the drill again</p>
        </div>
      )}
    </div>
  );
}
