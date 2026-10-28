// The viewer host: one engine, one model. It owns everything a model shouldn't have to repeat: theme, accent,
// revolve, the iso view, sound on/off, persistence, the keyboard map (from the catalogue), clicks on parts, the demo
// clock, timed messages and the snapshot the React UI renders. The model supplies geometry, state and actions.
import * as THREE from 'three';
import { createEngine, ACCENTS, type AccentId, type Theme } from '../iso/engine';
import type { ModelDef } from '../catalog/types';
import type { ModelCtx, ModelFactory } from './types';
import { Sound } from './sound';
import { createScript } from './script';
import type { Realism } from '../real/stage';
import type { RangeHud } from '../range/hud';

export interface Snapshot {
  model: string; theme: Theme; accent: AccentId; spin: boolean; iso: boolean; sound: boolean;
  /** render style: null when the model has only the hairline look */
  style: null | 'line' | 'real' | 'loading';
  selected: string | null;
  on: Record<string, boolean>;
  readout: string;
  /** a game overlay (the shooting range) */
  hud: RangeHud | null;
}
export type ViewCommand = 'iso' | 'theme' | 'spin' | 'sound' | 'real';

const store = (k: string, v: string) => { try { localStorage.setItem('iso-warfare-' + k, v); } catch { /* private mode */ } };
const load = (k: string) => { try { return localStorage.getItem('iso-warfare-' + k); } catch { return null; } };
/** one spelling for keys everywhere: letters lower-case, ' ' is 'space', named keys as the browser names them */
export const normKey = (k: string) => k === ' ' ? 'space' : k.length === 1 ? k.toLowerCase() : k.toLowerCase() === 'space' ? 'space' : k;

/** how the page opens other models (a weapon change on the range), and how this one was opened */
export interface ViewerNav { open(id: string, arrive?: 'range'): void; arrive?: 'range' }

export function createViewer(host: HTMLElement, def: ModelDef, factory: ModelFactory, onChange: (s: Snapshot) => void, nav?: ViewerNav) {
  const theme0: Theme = (load('theme') as Theme) || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  let acc0: string | null = null; try { acc0 = localStorage.getItem('iso-accent'); } catch { /* ignore */ }
  const accent0 = (ACCENTS.some(a => a.id === acc0) ? acc0 : 'cyan') as AccentId;

  const E = createEngine(host, { theme: theme0, accent: accent0, spin: load('spin') === '1', keepLock: nav?.arrive === 'range' });
  const snd = new Sound(); snd.enabled = load('sound') !== '0';
  const script = createScript();

  let msg = '', msgUntil = 0;
  const say = (m: string) => { msg = m; msgUntil = performance.now() + 2800; emit(true); };
  const wigs = new Map<string, number>();
  const wig = (id: string, now: number) => {
    const t0 = wigs.get(id); if (t0 === undefined) return 0;
    const t = (now - t0) / 1000; if (t > 1.6) { wigs.delete(id); return 0; }
    return Math.sin(t * Math.PI * 2 * 1.25) * (1 - t / 1.6);
  };
  const listed = new Set(def.actions.map(a => a.id));
  const ctx: ModelCtx = { E, snd, def, script, say, wig, has: a => listed.has(a), style: on => { void setReal(on); }, open: (id, arrive) => nav?.open(id, arrive), arrive: nav?.arrive };
  const M = factory(ctx);
  E.setPickRoot(M.pickRoot);
  const passive = new Set(['demo', ...(M.passive ?? [])]);

  // ── actions ──
  const view: Record<ViewCommand, () => void> = {
    iso() { E.toggleIso(); },
    theme() { setTheme(E.theme === 'dark' ? 'light' : 'dark'); },
    spin() { E.setSpin(!E.spin); store('spin', E.spin ? '1' : '0'); },
    sound() { snd.setEnabled(!snd.enabled); store('sound', snd.enabled ? '1' : '0'); },
    real() { void setReal(!(realism?.on ?? false)); },
  };

  // ── render style: the realistic look loads on first use (textures are generated then) ──
  let realism: Realism | null = null, realLoading = false, alive = true;
  async function setReal(on: boolean) {
    if (!M.real || realLoading) return;
    if (on && !realism) {
      realLoading = true; emit(true);
      try {
        const { createRealism } = await import('../real/stage');
        if (!alive) return;
        realism = createRealism(E, M.real, M.pickRoot);
      } catch (err) { console.error(err); say('realistic view failed to load'); }
      finally { realLoading = false; }
      if (!realism) { emit(true); return; }
    }
    realism?.set(on);
    store('style', on ? 'real' : 'line');
    emit(true);
  }
  function run(id: string) {
    if (id in view) { view[id as ViewCommand](); emit(true); return; }
    const f = M.actions[id]; if (!f) return;
    if (!passive.has(id)) script.stop();
    f(); emit(true);
  }
  const partAction = (id: string) => {
    const a = def.partActions[id]; if (!a) return;
    if (a.startsWith('wiggle:')) { wigs.set(a.slice(7), performance.now()); snd.button(); } else run(a);
  };

  let selected: string | null = null;
  function select(id: string | null) { selected = id && M.parts[id] ? id : null; E.highlight(selected ? M.parts[selected] : null); emit(true); }
  E.onPick(id => { snd.wake(); select(id); if (id) partAction(id); });

  function setTheme(t: Theme) {
    E.setTheme(t); store('theme', t);
    document.documentElement.dataset.theme = t;
    syncAccentVar(); emit(true);
  }
  function setAccent(id: AccentId) {
    E.setAccent(id); try { localStorage.setItem('iso-accent', id); } catch { /* ignore */ }
    syncAccentVar(); emit(true);
  }
  const syncAccentVar = () => document.documentElement.style.setProperty('--accent', '#' + E.accent.getHexString());

  // ── keyboard: the catalogue's keys, the view keys, then the model's held keys ──
  const KEYS = new Map<string, string>([['i', 'iso'], ['t', 'theme'], ['m', 'sound'], ['h', 'real']]);
  def.actions.forEach(a => KEYS.set(normKey(a.key), a.id));
  const typing = (e: Event) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
    snd.wake();
    const k = normKey(e.key);
    if (M.keyDown?.(k, e)) { e.preventDefault(); return; }
    if (k === 'Escape') { select(null); return; }
    const c = KEYS.get(k);
    if (c && !e.repeat) { run(c); e.preventDefault(); }
  };
  const onKeyUp = (e: KeyboardEvent) => M.keyUp?.(normKey(e.key));
  const onBlur = () => M.blur?.();
  const wake = () => snd.wake();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  host.addEventListener('pointerdown', wake);

  // ── per-frame ──
  E.onTick((now, dt) => {
    M.tick(now, dt);
    if (msg && now > msgUntil) msg = '';
    emit();
  });

  // ── snapshot for the UI (sent only when something changed) ──
  function snapshot(): Snapshot {
    const r = M.readout();
    return {
      model: def.id, theme: E.theme, accent: E.accentId, spin: E.spin, iso: E.iso, sound: snd.enabled, selected,
      style: !M.real ? null : realLoading ? 'loading' : realism?.on ? 'real' : 'line',
      on: M.on(), readout: msg ? (r ? r + ' · ' : '') + msg : r, hud: M.hud?.() ?? null,
    };
  }
  let sig = '';
  function emit(force = false) {
    const s = snapshot(), k = JSON.stringify(s);
    if (!force && k === sig) return; sig = k; onChange(s);
  }
  E.onChange(() => emit(true));

  // ── view ──
  const V = M.view;
  E.setView({
    target: V.target, dir: (V.dir ?? new THREE.Vector3(1, 1, 1)).clone().normalize(),
    dist: () => V.dist * Math.max(1, 1.75 / (host.clientWidth / Math.max(1, host.clientHeight))),
    min: V.min ?? V.dist * 0.18, max: V.max ?? V.dist * 4.5,
  });
  if (load('ortho') === '1') E.setOrtho(true, E.view.dist());
  E.onChange(() => store('ortho', E.iso ? '1' : '0'));
  document.documentElement.dataset.theme = theme0;
  E.start();
  syncAccentVar();
  if (new URLSearchParams(location.search).has('demo') && M.actions.demo) run('demo');
  // straight into the realistic view: frames wait for it rather than draw (and compile) the hairline look for a moment
  if (M.real && load('style') === 'real') void E.hold(setReal(true), 6000);
  emit(true);

  return {
    run, select, setAccent,
    dispose() {
      alive = false;
      realism?.dispose();
      script.stop();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      host.removeEventListener('pointerdown', wake);
      M.dispose?.();
      snd.dispose(); E.dispose();
    },
  };
}

export type ViewerApi = ReturnType<typeof createViewer>;
