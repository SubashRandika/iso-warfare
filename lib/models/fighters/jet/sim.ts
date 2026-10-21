// One jet on the apron: one state object, one pose per frame, keyboard / clicks / buttons calling the same actions.
// The airframe (F-22, F-35B…) supplies geometry and pose(); this file is the flight model shared by every fighter.
// Themes, accent, camera, picking, the demo clock and the readout's messages belong to the host (lib/core/host.ts).
import * as THREE from 'three';
import type { Engine } from '../../../iso/engine';
import type { ModelFactory } from '../../../core/types';
import type { RealSpec } from '../../../real/types';
import { makePlume } from '../../../real/plume';
import { approach, clamp01 } from '../../../core/anim';
import { Turbofan } from './turbofan';
import type { JetRig, JetState } from './types';

const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';

export interface JetOptions { refuelReadout: string }

export function jetModel(build: (E: Engine) => JetRig, opts: JetOptions): ModelFactory {
  return ({ E, snd, script, say, wig, has }) => {
    const R = build(E);
    const voice = snd.use(new Turbofan());
    const L = R.lights, ALT_MAX = R.altMax, HOVER = R.hoverAlt ?? 3;

    const st: JetState & {
      keys: { pitch: number; roll: number; yaw: number }; auto: { pitch: number; roll: number; yaw: number }; checkT: number;
    } = {
      eng: false, ab: false, lights: false, canopy: true, gear: true, bayMain: false, baySide: false, brake: false, refuel: false, stovl: false, hover: false,
      rpm: 0, abT: 0, canopyT: 1, gearT: 1, gearDoorT: 1, bayMainT: 0, baySideT: 0, brakeT: 0, refuelT: 0, stovlT: 0, alt: 0,
      p: 0, r: 0, y: 0, checkLef: 0,
      keys: { pitch: 0, roll: 0, yaw: 0 }, auto: { pitch: 0, roll: 0, yaw: 0 }, checkT: -1,
    };
    const engWord = R.engines > 1 ? 'engines' : 'engine';
    const airborne = () => !st.gear || st.hover || st.alt > 0.05;
    const { later, when } = script;
    const endDemo = () => script.end();

    // ── actions ──
    const act = {
      engines() {
        st.eng = !st.eng; snd.chime(st.eng);
        if (!st.eng) {
          st.ab = false;
          if (airborne()) { st.gear = true; st.hover = false; say(`${engWord} off · landing`); }
        }
      },
      afterburner() {
        if (!st.eng) return say(`start ${engWord} first`);
        if (st.stovl) {                               // the swivel nozzle must point aft: convert back, then light it
          if (airborne()) return say('no afterburner in the hover');
          act.stovl(); st.ab = true; return say('converting back for afterburner');
        }
        st.ab = !st.ab; snd.button();
      },
      lights() { st.lights = !st.lights; snd.button(); },
      canopy() { if (airborne()) return say('canopy locked in flight'); st.canopy = !st.canopy; snd.motor(2.4, st.canopy); },
      stovl() {
        if (!has('stovl')) return;
        if (airborne()) return say('land first');
        st.stovl = !st.stovl; if (st.stovl) st.ab = false;
        snd.motor(2.8, st.stovl);
      },
      gear() {
        const ready = () => {
          if (!st.eng) { say(`start ${engWord} first`); return false; }
          if (st.rpm < 0.9) { say('wait for spool-up'); return false; }
          if (st.canopyT > 0) { say('close the canopy first'); return false; }
          return true;
        };
        if (st.stovl) {                               // STOVL: lift straight up into the hover, gear stays down
          if (st.hover) st.hover = false;
          else { if (!ready()) return; if (st.stovlT < 1) return say('wait for conversion'); st.hover = true; }
          snd.motor(1.6, st.hover); return;
        }
        if (st.gear) { if (!ready()) return; st.gear = false; } else st.gear = true;
        snd.motor(2, st.gear);
      },
      bays() { const open = !(st.bayMain || st.baySide); st.bayMain = st.baySide = open; snd.motor(1.2, open); },
      bayMain() { st.bayMain = !st.bayMain; snd.motor(1.2, st.bayMain); },
      baySide() { st.baySide = !st.baySide; snd.motor(1.2, st.baySide); },
      brake() { st.brake = !st.brake; snd.button(); },
      refuel() { st.refuel = !st.refuel; snd.motor(1, st.refuel); },
      check() { st.checkT = performance.now(); snd.button(); },
      demo() {
        if (script.active) { script.stop(); endDemo(); return; }
        script.start();
        st.brake = false; st.refuel = false; st.bayMain = st.baySide = false;
        if (!st.lights) act.lights();
        if (st.canopy && !airborne()) act.canopy();
        later(600, () => { if (!st.eng) act.engines(); });
        later(2900, () => act.check());
        later(6000, () => act.bays());
        later(8600, () => act.bays());
        const ready = () => st.rpm >= 0.9 && st.canopyT === 0;
        if (has('stovl')) {                           // convert, lift into the hover, then yaw left and right
          later(10000, () => { if (!st.stovl && !airborne()) act.stovl(); });
          later(11000, () => when(() => ready() && st.stovlT >= 1, () => {
            if (!st.hover) act.gear();
            when(() => st.alt >= HOVER - 0.05, () => {
              later(400, () => { st.auto.yaw = 1; });
              later(1700, () => { st.auto.yaw = -1; });
              later(3000, endDemo);
            });
          }));
        } else {                                      // take off, light the afterburner, bank both ways
          later(10200, () => when(ready, () => {
            if (st.gear) act.gear();
            when(() => st.alt >= ALT_MAX - 0.05, () => {
              if (!st.ab) act.afterburner();
              later(1400, () => { st.auto.roll = 1; });
              later(2700, () => { st.auto.roll = -1; });
              later(4000, () => { st.auto.roll = 0; });
              later(5400, () => { if (st.ab) act.afterburner(); endDemo(); });
            });
          }));
        }
      },
    } satisfies Record<string, () => void>;

    // ── held keys: the stick ──
    const AXES: Record<string, ['pitch' | 'roll' | 'yaw', number]> = { ArrowUp: ['pitch', 1], ArrowDown: ['pitch', -1], ArrowLeft: ['roll', -1], ArrowRight: ['roll', 1], z: ['yaw', -1], x: ['yaw', 1] };

    // ── cockpit display (a real light source: it lights up when the jet has power) ──
    const scr = R.screen, sx = scr.canvas.getContext('2d')!;
    let scrSig = '';
    function drawScreen(force = false) {
      const power = st.rpm > 0.04 || st.lights;
      const sig = [power, Math.round(st.rpm * 50), st.abT > 0.5, Math.round(st.r * 10), Math.round(st.p * 10), Math.round(st.gearT * 4), st.bayMainT > 0.5, st.baySideT > 0.5, st.brake, Math.round(st.alt * 4), Math.round(st.stovlT * 4), E.theme, E.accentId].join('|');
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
      sx.fillText(R.engines > 1 ? 'ENG' : 'F135', 18, 16);
      for (let i = 0; i < R.engines; i++) { const x = 30 + i * 48, h = (H - 70) * st.rpm; sx.strokeRect(x, 44, 26, H - 70); sx.fillRect(x, 44 + (H - 70) - h, 26, h); }
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
      sx.fillText(st.hover && st.alt > 0.05 ? 'HOVER' : st.alt > 0.05 ? 'AIR' : 'GND', pw + 18, 16);
      // stores, gear and mode
      const x0 = pw * 2 + 18;
      sx.fillText('GEAR', x0, 16);
      const gearDown = st.gearT > 0.98;
      [[x0 + 60, 50], [x0 + 30, 84], [x0 + 90, 84]].forEach(([x, y]) => { sx.strokeRect(x, y, 22, 22); if (gearDown) sx.fillRect(x + 4, y + 4, 14, 14); });
      sx.fillText(st.bayMainT > 0.5 || st.baySideT > 0.5 ? 'BAYS OPEN' : 'BAYS SHUT', x0, 124);
      if (st.stovlT > 0) sx.fillText(st.stovlT >= 1 ? 'STOVL' : 'CONV', x0, 148);
      else if (st.brake) sx.fillText('SPD BRK', x0, 148);
      scr.tex.needsUpdate = true;
    }
    E.themeHooks.push(() => drawScreen(true));
    drawScreen(true);

    // ── realistic style: hot exhaust whenever the engines run, afterburner plumes, their light, heat in the nozzles ──
    // Plumes are children of the nozzle parts, so a vectoring or swivelling nozzle (the F-35B's) turns them with it.
    let real: RealSpec | undefined;
    if (R.real) {
      const X = R.real, aft = new THREE.Vector3(0, 0, -1);
      const plumes = X.nozzles.map((n, i) => makePlume(n.parent, n.at, aft, n.w, n.h, 10, i));
      const dry = X.nozzles.map((n, i) => makePlume(n.parent, n.at, aft, n.w * 0.92, n.h * 0.92, 5, i + 5, 'dry'));
      const mid = X.nozzles.reduce((a, n) => a.add(n.at), new THREE.Vector3()).divideScalar(X.nozzles.length);
      const abLight = new THREE.PointLight(0xff7a2e, 0, 0, 2); abLight.position.copy(mid).add(new THREE.Vector3(0, -0.2, -2.2));
      X.nozzles[0].parent.add(abLight);
      real = {
        skin: X.skin, focus: X.focus, size: X.size, markings: { stopZ: X.stopZ }, hide: R.stage ? [R.stage] : [], only: X.only,
        lamps: [[L.stripMat, 'slime'], [L.navMat, 'nav'], [L.beaconMat, 'red'], [L.taxiMat, 'white']],
        onStyle(on) { if (!on) { plumes.forEach(p => p.set(0, 0)); dry.forEach(p => p.set(0, 0)); abLight.intensity = 0; } },
        tick(now, mats) {
          const ab = st.abT * clamp01((st.rpm - 0.8) / 0.2);
          plumes.forEach(p => p.set(ab, now));
          dry.forEach(p => p.set(clamp01((st.rpm - 0.25) / 0.75) * (1 - 0.6 * ab), now));
          abLight.intensity = ab * 60 * (0.9 + 0.1 * Math.sin(now * 0.06));
          mats.exhaust.emissiveIntensity = st.rpm * 0.5 + ab * 5;
          X.power?.(st.rpm > 0.04 || st.lights ? 1 : 0);
        },
      };
    }

    // ── per-frame ──
    function tick(now: number, dt: number) {
      st.rpm = st.eng ? Math.min(1, st.rpm + 0.22 * dt) : Math.max(0, st.rpm - 0.12 * dt);
      st.abT = approach(st.abT, st.ab && st.rpm > 0.85 && st.stovlT < 0.05 ? 1 : 0, 1.5 * dt);
      st.canopyT = approach(st.canopyT, st.canopy ? 1 : 0, 0.42 * dt);
      st.bayMainT = approach(st.bayMainT, st.bayMain ? 1 : 0, 0.7 * dt);
      st.baySideT = approach(st.baySideT, st.baySide ? 1 : 0, 0.7 * dt);
      st.refuelT = approach(st.refuelT, st.refuel ? 1 : 0, 0.8 * dt);
      st.brakeT = approach(st.brakeT, st.brake ? 1 : 0, 1.6 * dt);
      st.stovlT = approach(st.stovlT, st.stovl ? 1 : 0, 0.34 * dt);
      if (st.hover && st.rpm < 0.9) st.hover = false;
      // gear and altitude: take off first, then the gear folds; on landing it extends first, then the jet settles.
      // In the hover the gear stays down and the jet lifts straight up.
      let altGoal = st.alt;
      if (st.gear) {
        if (st.gearDoorT < 1) st.gearDoorT = Math.min(1, st.gearDoorT + 2.2 * dt);
        else st.gearT = Math.min(1, st.gearT + 0.5 * dt);
        if (st.gearT >= 1) altGoal = st.hover ? HOVER : 0;
      } else {
        altGoal = st.rpm >= 0.9 ? ALT_MAX : 0;
        if (st.alt > 1.4) {
          if (st.gearT > 0) { if (st.gearDoorT < 1) st.gearDoorT = Math.min(1, st.gearDoorT + 2.2 * dt); else st.gearT = Math.max(0, st.gearT - 0.5 * dt); }
          else st.gearDoorT = Math.max(0, st.gearDoorT - 2.2 * dt);
        }
      }
      st.alt = approach(st.alt, altGoal, (st.hover || (st.stovl && st.alt > 0) ? 0.8 : 1.1) * dt);

      // stick: held keys + demo + the automatic control check
      if (!script.active) st.auto.pitch = st.auto.roll = st.auto.yaw = 0;      // demo stopped by the host
      let cp = 0, cr = 0, cy = 0;
      st.checkLef = 0;
      if (st.checkT >= 0) {
        const t = (now - st.checkT) / 1000, sw = (a: number) => Math.sin(Math.PI * 2 * clamp01((t - a) / 1.4));
        if (t > 5.6) st.checkT = -1;
        else if (t < 1.4) { cp = sw(0); st.checkLef = cp; } else if (t < 2.8) cr = sw(1.4); else if (t < 4.2) cy = sw(2.8); else st.checkLef = sw(4.2);
      }
      const k = Math.min(1, dt * 6);
      st.p += (THREE.MathUtils.clamp(st.keys.pitch + st.auto.pitch + cp, -1, 1) - st.p) * k;
      st.r += (THREE.MathUtils.clamp(st.keys.roll + st.auto.roll + cr, -1, 1) - st.r) * k;
      st.y += (THREE.MathUtils.clamp(st.keys.yaw + st.auto.yaw + cy, -1, 1) - st.y) * k;

      R.pose(st, now, id => wig(id, now));

      // flight attitude about the centre of gravity (gentler in the hover)
      const top = st.hover ? HOVER : ALT_MAX, a = clamp01(st.alt / top), DEG = Math.PI / 180;
      R.craft.position.y = R.cgY + st.alt + Math.sin(now / 900) * 0.05 * a;
      const bank = st.hover ? 8 : 24, yawK = st.hover ? 14 : 4;
      R.craft.rotation.set((-st.p * 7 - (st.hover ? 1 : 2.5) * a) * DEG * a, -st.y * yawK * DEG * a, st.r * bank * DEG * a, 'YXZ');

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
      L.cockpitLight.intensity = st.rpm > 0.04 || st.lights ? 2.5 : 0;
      drawScreen();

      voice.set(st.rpm, st.abT);
    }

    function readout() {
      const p: string[] = [];
      p.push(!st.eng && st.rpm < 0.01 ? `${engWord} off` : `n2 ${Math.round(st.rpm * 100)}%${st.abT > 0.5 ? ' · max ab' : ''}`);
      if (st.stovlT > 0) p.push(st.stovlT >= 1 ? 'stovl' : st.stovl ? 'converting' : 'converting back');
      p.push(st.gearT >= 1 ? 'gear down' : st.gearT <= 0 ? 'gear up' : 'gear moving');
      if (st.alt > 0.05) {
        if (st.hover || st.stovl) p.push(st.alt >= HOVER - 0.01 && st.hover ? 'hovering' : st.hover ? 'lifting' : 'descending');
        else p.push(st.alt >= ALT_MAX - 0.01 ? 'airborne' : st.gear ? 'landing' : 'climbing');
      }
      p.push(st.canopyT >= 1 ? 'canopy open' : st.canopyT <= 0 ? 'canopy shut' : 'canopy moving');
      if (st.bayMain || st.baySide) p.push(st.bayMain && st.baySide ? 'bays open' : st.bayMain ? 'main bay open' : 'side bays open');
      if (st.brake) p.push('speed brake');
      if (st.refuel) p.push(opts.refuelReadout);
      if (st.lights) p.push('lights');
      return p.join(' · ');
    }

    return {
      pickRoot: R.craft, parts: R.parts, view: R.view, real,
      actions: act, passive: ['check'],
      on: () => ({
        demo: script.active, engines: st.eng, afterburner: st.ab, lights: st.lights, canopy: st.canopy, stovl: st.stovl, gear: !st.gear || st.hover,
        bays: st.bayMain || st.baySide, brake: st.brake, refuel: st.refuel, check: st.checkT >= 0,
      }),
      tick, readout,
      keyDown(k) { const ax = AXES[k]; if (!ax) return false; st.keys[ax[0]] = ax[1]; return true; },
      keyUp(k) { const ax = AXES[k]; if (ax && st.keys[ax[0]] === ax[1]) st.keys[ax[0]] = 0; },
      blur() { st.keys = { pitch: 0, roll: 0, yaw: 0 }; },
    };
  };
}
