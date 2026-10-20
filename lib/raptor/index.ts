// The F-22 figure: one state object, one render per frame, keyboard / clicks / buttons calling the same actions.
import * as THREE from 'three';
import { createEngine, ACCENTS, type AccentId, type Theme } from '../iso/engine';
import { buildRaptor, P, DEG } from './airframe';
import { Sound } from './sound';
import type { ActionId, PartId } from './parts';

export interface Snapshot {
  theme: Theme; accent: AccentId; spin: boolean; iso: boolean; sound: boolean;
  selected: PartId | null;
  on: Record<ActionId, boolean>;
  readout: string;
}
export type Command = ActionId | 'iso' | 'theme' | 'spin' | 'sound';

const store = (k: string, v: string) => { try { localStorage.setItem('iso-warfare-' + k, v); } catch { /* private mode */ } };
const load = (k: string) => { try { return localStorage.getItem('iso-warfare-' + k); } catch { return null; } };
const ease = (t: number) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const approach = (v: number, goal: number, rate: number) => v + Math.sign(goal - v) * Math.min(Math.abs(goal - v), rate);
const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';
const ALT_MAX = 3.6;

export function createRaptor(host: HTMLElement, onChange: (s: Snapshot) => void) {
  const theme0: Theme = (load('theme') as Theme) || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  let acc0: string | null = null; try { acc0 = localStorage.getItem('iso-accent'); } catch { /* ignore */ }
  const accent0 = (ACCENTS.some(a => a.id === acc0) ? acc0 : 'cyan') as AccentId;

  const E = createEngine(host, { theme: theme0, accent: accent0, spin: load('spin') === '1' });
  const R = buildRaptor(E);
  const snd = new Sound(); snd.enabled = load('sound') !== '0';
  const L = R.lights;

  const st = {
    eng: false, ab: false, lights: false, canopy: true, gear: true, bayMain: false, baySide: false, brake: false, refuel: false,
    rpm: 0, abT: 0, canopyT: 1, gearT: 1, gearDoorT: 1, bayMainT: 0, baySideT: 0, brakeT: 0, refuelT: 0, alt: 0,
    keys: { pitch: 0, roll: 0, yaw: 0 }, auto: { pitch: 0, roll: 0, yaw: 0 }, p: 0, r: 0, y: 0,
    checkT: -1, wig: {} as Partial<Record<string, number>>, msg: '', msgUntil: 0, demo: false,
  };
  let selected: PartId | null = null;
  const say = (m: string) => { st.msg = m; st.msgUntil = performance.now() + 2800; };

  // ── actions ──
  let demoTimers: number[] = [];
  const later = (ms: number, f: () => void) => { demoTimers.push(window.setTimeout(f, ms)); };
  const stopDemo = () => { demoTimers.forEach(clearTimeout); demoTimers = []; st.demo = false; st.auto = { pitch: 0, roll: 0, yaw: 0 }; };
  const airborne = () => !st.gear || st.alt > 0.05;
  const act = {
    engines() {
      st.eng = !st.eng; snd.chime(st.eng);
      if (!st.eng) { st.ab = false; if (airborne()) { st.gear = true; say('engines off · landing'); } }
    },
    afterburner() { if (!st.eng) return say('start engines first'); st.ab = !st.ab; snd.button(); },
    lights() { st.lights = !st.lights; snd.button(); },
    canopy() { if (airborne()) return say('canopy locked in flight'); st.canopy = !st.canopy; snd.motor(2.4, st.canopy); },
    gear() {
      if (st.gear) {
        if (!st.eng) return say('start engines first');
        if (st.rpm < 0.9) return say('wait for spool-up');
        if (st.canopyT > 0) return say('close the canopy first');
        st.gear = false;
      } else st.gear = true;
      snd.motor(2, st.gear);
    },
    bays() { const open = !(st.bayMain || st.baySide); st.bayMain = st.baySide = open; snd.motor(1.2, open); },
    bayMain() { st.bayMain = !st.bayMain; snd.motor(1.2, st.bayMain); },
    baySide() { st.baySide = !st.baySide; snd.motor(1.2, st.baySide); },
    brake() { st.brake = !st.brake; snd.button(); },
    refuel() { st.refuel = !st.refuel; snd.motor(1, st.refuel); },
    check() { st.checkT = performance.now(); snd.button(); },
    demo() {
      if (st.demo) { stopDemo(); return; }
      stopDemo(); st.demo = true;
      st.brake = false; st.refuel = false; st.bayMain = st.baySide = false;
      if (!st.lights) act.lights();
      if (st.canopy && !airborne()) act.canopy();
      later(600, () => { if (!st.eng) act.engines(); });
      later(2900, () => act.check());
      later(6000, () => act.bays());
      later(8600, () => act.bays());
      later(10200, () => { if (st.gear && st.rpm >= 0.9 && st.canopyT === 0) act.gear(); });
      later(13600, () => { if (!st.ab) act.afterburner(); });
      later(15000, () => { st.auto.roll = 1; });
      later(16300, () => { st.auto.roll = -1; });
      later(17600, () => { st.auto.roll = 0; });
      later(19000, () => { if (st.ab) act.afterburner(); st.demo = false; });
    },
    iso() { E.toggleIso(); },
    theme() { setTheme(E.theme === 'dark' ? 'light' : 'dark'); },
    spin() { E.setSpin(!E.spin); store('spin', E.spin ? '1' : '0'); },
    sound() { snd.setEnabled(!snd.enabled); store('sound', snd.enabled ? '1' : '0'); },
  } satisfies Record<string, () => void>;
  const wiggle = (id: string) => { st.wig[id] = performance.now(); snd.button(); };
  const PART_ACTION: Partial<Record<PartId, () => void>> = {
    canopy: act.canopy, intakes: act.engines, nozzles: act.afterburner, gearNose: act.gear, gearMain: act.gear,
    bayMain: act.bayMain, baySide: act.baySide, refuel: act.refuel, lights: act.lights,
    lef: () => wiggle('lef'), flaperons: () => wiggle('flaperons'), ailerons: () => wiggle('ailerons'),
    stabs: () => wiggle('stabs'), rudders: () => wiggle('rudders'), fins: () => wiggle('rudders'),
  };

  function select(id: PartId | null) { selected = id; E.highlight(id ? R.parts[id] : null); emit(true); }
  E.onPick(id => { snd.wake(); select(id as PartId | null); if (id) PART_ACTION[id as PartId]?.(); });

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

  // ── keyboard ──
  const KEYS: Record<string, Command> = { e: 'engines', a: 'afterburner', l: 'lights', c: 'canopy', g: 'gear', b: 'bays', s: 'brake', r: 'refuel', k: 'check', i: 'iso', t: 'theme', m: 'sound', d: 'demo' };
  const AXES: Record<string, ['pitch' | 'roll' | 'yaw', number]> = { ArrowUp: ['pitch', 1], ArrowDown: ['pitch', -1], ArrowLeft: ['roll', -1], ArrowRight: ['roll', 1], z: ['yaw', -1], x: ['yaw', 1] };
  const typing = (e: Event) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
    snd.wake();
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const ax = AXES[k];
    if (ax) { st.keys[ax[0]] = ax[1]; e.preventDefault(); return; }
    if (k === 'Escape') { select(null); return; }
    const c = KEYS[k];
    if (c && !e.repeat) { run(c); e.preventDefault(); }
  };
  const onKeyUp = (e: KeyboardEvent) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; const ax = AXES[k]; if (ax && st.keys[ax[0]] === ax[1]) st.keys[ax[0]] = 0; };
  const onBlur = () => { st.keys = { pitch: 0, roll: 0, yaw: 0 }; };
  const wake = () => snd.wake();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  host.addEventListener('pointerdown', wake);

  function run(c: Command) {
    if (c !== 'demo' && c !== 'iso' && c !== 'theme' && c !== 'spin' && c !== 'sound' && c !== 'check') stopDemo();
    act[c](); emit(true);
  }

  // ── cockpit displays (a real light source: they light up when the jet has power) ──
  const scr = R.screen, sx = scr.canvas.getContext('2d')!;
  let scrSig = '';
  function drawScreen(force = false) {
    const power = st.rpm > 0.04 || st.lights;
    const sig = [power, Math.round(st.rpm * 50), st.abT > 0.5, Math.round(st.r * 10), Math.round(st.p * 10), Math.round(st.gearT * 4), st.bayMainT > 0.5, st.baySideT > 0.5, st.brake, Math.round(st.alt * 4), E.theme, E.accentId].join('|');
    if (!force && sig === scrSig) return; scrSig = sig;
    const W = scr.canvas.width, H = scr.canvas.height, light = E.theme === 'light';
    const A = '#' + E.accent.getHexString(), dim = light ? '#9aa1a5' : '#262b2e', bg = light ? '#dfe2e3' : '#0b0d0e';
    sx.fillStyle = bg; sx.fillRect(0, 0, W, H);
    const pw = W / 3;
    sx.strokeStyle = dim; sx.lineWidth = 2;
    for (let i = 0; i < 3; i++) sx.strokeRect(i * pw + 6, 6, pw - 12, H - 12);
    if (!power) { scr.tex.needsUpdate = true; return; }
    sx.fillStyle = A; sx.strokeStyle = A; sx.font = `600 18px ${MONO}`; sx.textBaseline = 'top';
    // engines
    sx.fillText('ENG', 18, 16);
    for (let i = 0; i < 2; i++) { const x = 30 + i * 48, h = (H - 70) * st.rpm; sx.strokeRect(x, 44, 26, H - 70); sx.fillRect(x, 44 + (H - 70) - h, 26, h); }
    sx.fillText(`${Math.round(st.rpm * 100)}%`, 120, 60);
    if (st.abT > 0.5) { sx.fillRect(118, 100, 44, 26); sx.fillStyle = bg; sx.fillText('AB', 128, 104); sx.fillStyle = A; }
    // attitude
    const cx = pw * 1.5, cy = H / 2;
    sx.save(); sx.beginPath(); sx.rect(pw + 10, 10, pw - 20, H - 20); sx.clip();
    sx.translate(cx, cy + st.p * 22); sx.rotate(-st.r * 0.38 * clamp01(st.alt / ALT_MAX + 0.15));
    sx.beginPath(); sx.moveTo(-160, 0); sx.lineTo(160, 0); sx.stroke();
    for (const d of [-40, -20, 20, 40]) { sx.beginPath(); sx.moveTo(-24, d); sx.lineTo(24, d); sx.stroke(); }
    sx.restore();
    sx.lineWidth = 3; sx.beginPath(); sx.moveTo(cx - 44, cy); sx.lineTo(cx - 14, cy); sx.lineTo(cx, cy + 10); sx.lineTo(cx + 14, cy); sx.lineTo(cx + 44, cy); sx.stroke(); sx.lineWidth = 2;
    sx.fillText(st.alt > 0.05 ? 'AIR' : 'GND', pw + 18, 16);
    // stores & gear
    const x0 = pw * 2 + 18;
    sx.fillText('GEAR', x0, 16);
    const gearDown = st.gearT > 0.98;
    [[x0 + 60, 50], [x0 + 30, 84], [x0 + 90, 84]].forEach(([x, y]) => { sx.strokeRect(x, y, 22, 22); if (gearDown) sx.fillRect(x + 4, y + 4, 14, 14); });
    sx.fillText(st.bayMainT > 0.5 || st.baySideT > 0.5 ? 'BAYS OPEN' : 'BAYS SHUT', x0, 124);
    if (st.brake) sx.fillText('SPD BRK', x0, 148);
    scr.tex.needsUpdate = true;
  }
  E.themeHooks.push(() => drawScreen(true));

  // ── per-frame ──
  const wig = (id: string, now: number) => { const t0 = st.wig[id]; if (t0 === undefined) return 0; const t = (now - t0) / 1000; if (t > 1.6) { delete st.wig[id]; return 0; } return Math.sin(t * Math.PI * 2 * 1.25) * (1 - t / 1.6); };
  function tick(now: number, dt: number) {
    st.rpm = st.eng ? Math.min(1, st.rpm + 0.22 * dt) : Math.max(0, st.rpm - 0.12 * dt);
    st.abT = approach(st.abT, st.ab && st.rpm > 0.85 ? 1 : 0, 1.5 * dt);
    st.canopyT = approach(st.canopyT, st.canopy ? 1 : 0, 0.42 * dt);
    st.bayMainT = approach(st.bayMainT, st.bayMain ? 1 : 0, 0.7 * dt);
    st.baySideT = approach(st.baySideT, st.baySide ? 1 : 0, 0.7 * dt);
    st.refuelT = approach(st.refuelT, st.refuel ? 1 : 0, 0.8 * dt);
    st.brakeT = approach(st.brakeT, st.brake ? 1 : 0, 1.6 * dt);
    // gear and altitude: take off first, then the gear folds; on landing it extends first, then the jet settles
    let altGoal = st.alt;
    if (st.gear) {
      if (st.gearDoorT < 1) st.gearDoorT = Math.min(1, st.gearDoorT + 2.2 * dt);
      else st.gearT = Math.min(1, st.gearT + 0.5 * dt);
      if (st.gearT >= 1) altGoal = 0;
    } else {
      altGoal = st.rpm >= 0.9 ? ALT_MAX : 0;
      if (st.alt > 1.4) {
        if (st.gearT > 0) { if (st.gearDoorT < 1) st.gearDoorT = Math.min(1, st.gearDoorT + 2.2 * dt); else st.gearT = Math.max(0, st.gearT - 0.5 * dt); }
        else st.gearDoorT = Math.max(0, st.gearDoorT - 2.2 * dt);
      }
    }
    st.alt = approach(st.alt, altGoal, 1.1 * dt);
    if (st.msg && now > st.msgUntil) st.msg = '';

    // stick: held keys + demo + the automatic control check
    let cp = 0, cr = 0, cy = 0, cl = 0;
    if (st.checkT >= 0) {
      const t = (now - st.checkT) / 1000, sw = (a: number) => Math.sin(Math.PI * 2 * clamp01((t - a) / 1.4));
      if (t > 5.6) st.checkT = -1;
      else if (t < 1.4) { cp = sw(0); cl = cp; } else if (t < 2.8) cr = sw(1.4); else if (t < 4.2) cy = sw(2.8); else cl = sw(4.2);
    }
    const k = Math.min(1, dt * 6);
    st.p += (THREE.MathUtils.clamp(st.keys.pitch + st.auto.pitch + cp, -1, 1) - st.p) * k;
    st.r += (THREE.MathUtils.clamp(st.keys.roll + st.auto.roll + cr, -1, 1) - st.r) * k;
    st.y += (THREE.MathUtils.clamp(st.keys.yaw + st.auto.yaw + cy, -1, 1) - st.y) * k;

    // control surfaces (degrees, trailing edge down positive)
    const ground = st.gearT * (1 - clamp01(st.alt / 2));
    const lefDeg = 14 * ground + 10 * cl + 12 * wig('lef', now);
    for (const s of [1, -1] as const) {
      const ail = s * st.r * 22 + 25 * st.brakeT + 22 * s * wig('ailerons', now);
      const flap = s * st.r * 14 + 12 * ground - 35 * st.brakeT + 20 * s * wig('flaperons', now);
      const stab = -st.p * 20 + s * st.r * 7 + 16 * wig('stabs', now);
      const rud = st.y * 25 - s * 28 * st.brakeT + 24 * wig('rudders', now);
      R.lef[s].set(lefDeg * DEG); R.flap[s].set(-flap * DEG); R.ail[s].set(-ail * DEG); R.stab[s].set(-stab * DEG); R.rud[s].set(rud * DEG);
      const vec = st.p * 20, open = 3 + st.rpm * 5 + st.abT * 11;
      R.nozU[s].set((vec + open) * DEG); R.nozL[s].set((vec - open) * DEG);
    }
    // doors, gear, bays
    const g = ease(st.gearT), gd = ease(st.gearDoorT);
    R.noseGear.set(-(1 - g) * 100 * DEG);
    R.mainGear[1].set(-(1 - g) * 72 * DEG); R.mainGear[-1].set(-(1 - g) * 72 * DEG);
    R.gearLegs.forEach(o => { o.visible = st.gearT > 0.002; });
    R.noseDoor.forEach((h, i) => h.set((i === 0 ? 1 : -1) * 88 * DEG * gd));
    R.mainDoor[1].set(95 * DEG * gd); R.mainDoor[-1].set(-95 * DEG * gd);
    const bd = ease(clamp01(st.bayMainT / 0.45)), bm = ease(clamp01((st.bayMainT - 0.45) / 0.55));
    R.bayDoor.forEach((h, i) => h.set((i === 0 ? 1 : -1) * 102 * DEG * bd));
    R.bayMissiles.forEach(m => { m.g.position.y = (m.g.userData.y0 ??= m.g.position.y) - m.drop * bm; m.rail.scale.y = 0.15 + m.drop * bm; });
    const sd = ease(clamp01(st.baySideT / 0.5)), sm = ease(clamp01((st.baySideT - 0.4) / 0.6));
    R.sideDoor[1].set(112 * DEG * sd); R.sideDoor[-1].set(-112 * DEG * sd);
    R.sideRack[1].set(62 * DEG * sm); R.sideRack[-1].set(-62 * DEG * sm);
    const armed = Math.min(bm, sm) > 0.98 ? 1 : Math.max(bm, sm) > 0.98 ? 0.5 : 0;
    R.seekerMat.emissiveIntensity = armed ? 1.6 : 0;
    R.seekerGlows.forEach((g, i) => { g.material.uniforms.intensity.value = (i < 4 ? bm : sm) > 0.98 ? 0.8 : 0; });
    R.canopyH.set(-38 * DEG * ease(st.canopyT));
    R.refuelDoor.set(-62 * DEG * ease(st.refuelT));

    // flight attitude about the centre of gravity
    const a = clamp01(st.alt / ALT_MAX);
    R.craft.position.y = 2.2 + st.alt + Math.sin(now / 900) * 0.05 * a;
    R.craft.rotation.set((-st.p * 7 - 2.5 * a) * DEG * a, -st.y * 4 * DEG * a, st.r * 24 * DEG * a, 'YXZ');

    // lights
    const flash = st.lights && now % 1100 < 140;
    L.stripMat.emissiveIntensity = st.lights ? 1.6 : 0; L.stripGlow.material.uniforms.intensity.value = st.lights ? 0.75 : 0;
    L.navMat.emissiveIntensity = st.lights ? 1.8 : 0; L.navGlow.material.uniforms.intensity.value = st.lights ? 0.9 : 0;
    L.beaconMat.emissiveIntensity = flash ? 2.2 : 0; L.beaconGlow.material.uniforms.intensity.value = flash ? 1 : 0;
    const taxi = st.lights && st.gearT > 0.98;
    L.taxiMat.emissiveIntensity = taxi ? 1.8 : 0; L.taxiGlow.material.uniforms.intensity.value = taxi ? 0.9 : 0;
    L.taxiPoolMat.uniforms.opacity.value = taxi ? 0.38 * (1 - clamp01(st.alt / 2.5)) : 0;
    L.padLightMat.emissiveIntensity = st.lights ? 1.5 : 0; L.padGlow.material.uniforms.intensity.value = st.lights ? 0.8 : 0;
    L.shadowMat.uniforms.opacity.value = E.shadowStrength() * (1 - clamp01(st.alt / 14));
    const power = st.rpm > 0.04 || st.lights;
    L.cockpitLight.intensity = power ? 2.5 : 0;
    drawScreen();

    snd.engine(st.rpm, st.abT);
    emit();
  }
  E.onTick(tick);

  // ── snapshot for the UI ──
  function readout() {
    const p: string[] = [];
    p.push(!st.eng && st.rpm < 0.01 ? 'engines off' : `n2 ${Math.round(st.rpm * 100)}%${st.abT > 0.5 ? ' · max ab' : ''}`);
    p.push(st.gearT >= 1 ? 'gear down' : st.gearT <= 0 ? 'gear up' : 'gear moving');
    if (st.alt > 0.05) p.push(st.alt >= ALT_MAX - 0.01 ? 'airborne' : st.gear ? 'landing' : 'climbing');
    p.push(st.canopyT >= 1 ? 'canopy open' : st.canopyT <= 0 ? 'canopy shut' : 'canopy moving');
    if (st.bayMain || st.baySide) p.push(st.bayMain && st.baySide ? 'bays open' : st.bayMain ? 'main bay open' : 'side bays open');
    if (st.brake) p.push('speed brake');
    if (st.refuel) p.push('receptacle open');
    if (st.lights) p.push('lights');
    if (st.msg) p.push(st.msg);
    return p.join(' · ');
  }
  function snapshot(): Snapshot {
    return {
      theme: E.theme, accent: E.accentId, spin: E.spin, iso: E.iso, sound: snd.enabled, selected,
      on: { demo: st.demo, engines: st.eng, afterburner: st.ab, lights: st.lights, canopy: st.canopy, gear: !st.gear, bays: st.bayMain || st.baySide, brake: st.brake, refuel: st.refuel, check: st.checkT >= 0 },
      readout: readout(),
    };
  }
  let sig = '';
  function emit(force = false) {
    const s = snapshot(), k = JSON.stringify(s);
    if (!force && k === sig) return; sig = k; onChange(s);
  }
  E.onChange(() => emit(true));

  // ── view ──
  E.setView({
    target: P(0, 1.9, 9.6), dir: new THREE.Vector3(1, 1, 1).normalize(),
    dist: () => 33 * Math.max(1, 1.75 / (host.clientWidth / Math.max(1, host.clientHeight))), min: 6, max: 150,
  });
  if (load('ortho') === '1') E.setOrtho(true, E.view.dist());
  const isoSync = () => store('ortho', E.iso ? '1' : '0');
  E.onChange(isoSync);
  document.documentElement.dataset.theme = theme0;
  E.start();
  syncAccentVar();
  drawScreen(true);
  if (new URLSearchParams(location.search).has('demo')) act.demo();
  emit(true);

  return {
    run, select, setAccent,
    dispose() {
      stopDemo();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      host.removeEventListener('pointerdown', wake);
      snd.dispose(); E.dispose();
    },
  };
}

export type RaptorApi = ReturnType<typeof createRaptor>;
