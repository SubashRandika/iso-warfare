// The pilot's view, in the Real view only: the camera sits at the pilot's eye and turns with the head, so the take-off
// roll, the circuit, the attack run and the landing are seen from the seat. The head looks where a pilot would: ahead
// on the ground, into each turn, down the runway on the approach, and padlocked onto whatever the strike engages (the
// drone a missile is chasing, the target a bomb is falling on, then the burst). Drag to look round yourself (the head
// comes back after a pause), scroll to zoom. Runway roll shakes it, the touchdown jolts it.
// Head-up display: the symbology is drawn on a plane far ahead of the eye, fixed to the airframe and conformal, so the
// flight path marker sits on the real flight path, the pitch ladder on the real horizon and the target boxes on the
// targets. The F-35 has no HUD: the same symbology rides on the helmet and turns with the head. Bombers have none.
// From inside, the canopy's gold coating is clear and the HUD combiner's static glyphs give way to the live symbology.
// Cost: nothing is built when the view comes on; its materials are compiled with the Real view's; the symbology canvas
// is redrawn at 30 Hz; the scene is the same one (smoke the eye is inside fades and is culled in its shader).
import * as THREE from 'three';
import type { Engine, EyeSpec } from '../../../iso/engine';
import type { Circuit } from './circuit';
import type { Strike } from './strike';
import type { JetRig } from './types';

const DEG = Math.PI / 180;
const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';
const GREEN = '#8dffb4';                              // HUD symbology green
const clamp = THREE.MathUtils.clamp;

export interface PilotFrame {
  /** circuit position while the demo flies it, −1 otherwise */
  s: number;
  ground: boolean; gearDown: boolean;
  /** cockpit power: the head-up display is lit */
  power: boolean;
}

export function createPilotView(E: Engine, R: JetRig, C: Circuit, strike: Strike | null, onExit: () => void) {
  const P = R.pilot!, kind = P.hud, u = C.u, G = 9.8 * u;
  const EYE = P.eye.clone().setY(P.eye.y - R.cgY);                    // the airframe sits cgY below the craft's origin
  const V = () => new THREE.Vector3();

  // ── symbology: a canvas on a plane D ahead of the eye; KPX pixels per unit of tan(angle), about the same for the HUD
  // (512 px over ±11°) and the helmet's wider field (768 px over ±16°), so a stroke or a glyph is the same size in both ──
  const N = kind === 'helmet' ? 768 : 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const x = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  // drawn over (not added to) the view: added light washes out to grey against a midday sky
  const hudMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
  hudMat.userData.realStyle = true;
  // the HUD's field sits a little above the nose (below it is the glareshield); the helmet's is centred on the view
  const TAN = Math.tan((kind === 'helmet' ? 16 : 11) * DEG), LIFT = kind === 'helmet' ? 0 : Math.tan(4 * DEG), D = 30 * u, KPX = (N / 2) / TAN;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2 * D * TAN, 2 * D * TAN), hudMat);
  plane.renderOrder = 1000; plane.frustumCulled = false; plane.raycast = () => {}; plane.visible = false; E.scene.add(plane);
  // clear glass for the canopy seen from inside (its gold coating reads as nearly clear from the seat)
  const clear = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, roughness: 0.04, metalness: 0, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.8 });
  clear.userData.realStyle = true;
  if (P.deck) P.deck.visible = false;

  let on = false, real = false, lastDraw = -1e9, call = { text: '', t: -1e9 }, power = false, frameInfo: PilotFrame = { s: -1, ground: true, gearDown: true, power: false };
  const head = { yaw: 0, pitch: -0.06 }, shake = { yaw: 0, pitch: 0 };
  let bump = 0, gLoad = 1, first = true, clock = 0;
  const vel = V(), acc = V(), prev = V(), tmp = V(), tmp2 = V(), focus = V(), local = V(), lean = V(), fR = V(), fU = V(), fF = V();
  const qCraft = new THREE.Quaternion(), qy = new THREE.Quaternion(), qx = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const AY = new THREE.Vector3(0, 1, 0), AX = new THREE.Vector3(1, 0, 0), FLIP = new THREE.Quaternion().setFromAxisAngle(AY, Math.PI);

  // ── inside the cockpit: clear canopy, no static HUD glyphs, the flight deck shown ──
  const swapped: { m: THREE.Mesh; was: THREE.Material | THREE.Material[]; cast: boolean }[] = [], hidden: THREE.Object3D[] = [];
  const glassSet = new Set(P.glass ?? []);
  function inside(v: boolean) {
    if (v) {
      R.craft.traverse(o => {
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        const name = (m.material as THREE.Material).name;
        if (name === 'canopy' || glassSet.has(m)) { swapped.push({ m, was: m.material, cast: m.castShadow }); m.material = clear; m.castShadow = false; }
        else if (name === 'cockpit.hud' && kind !== 'none') { hidden.push(m); m.visible = false; }
      });
    } else {
      // the Real view may already have put the hairline materials back (switching to Line): leave those alone
      for (const s of swapped) if (s.m.material === clear) { s.m.material = s.was; s.m.castShadow = s.cast; }
      swapped.length = 0; hidden.forEach(o => { o.visible = true; }); hidden.length = 0;
    }
    if (P.deck) P.deck.visible = v;
    for (const o of P.hide ?? []) o.visible = !v;
  }

  // ── the head: where the model puts it each frame (the engine adds the viewer's own look-around) ──
  const spec: EyeSpec = {
    fov: 64, near: 0.06, far: 4000 * u,
    pose(pos, quat) {
      R.craft.updateWorldMatrix(true, false);                              // the craft only, not its 200 parts
      const l = clamp((Math.abs(head.yaw) - 0.9) / 0.8, 0, 1);           // looking far round: lean that way, clear of the headrest
      local.copy(EYE).add(lean.set(Math.sign(head.yaw) * 0.07 * l, -0.035 * bump, 0.05 * l));
      pos.copy(local).applyMatrix4(R.craft.matrixWorld);
      R.craft.getWorldQuaternion(qCraft);
      qy.setFromAxisAngle(AY, Math.PI + head.yaw + shake.yaw); qx.setFromAxisAngle(AX, head.pitch + shake.pitch);
      quat.copy(qCraft).multiply(qy).multiply(qx);                        // cameras look down −z: turn round to face the nose
    },
    frame(cam) {
      if (kind === 'none') return;
      // fixed to the airframe ahead of the eye, or carried by the helmet
      if (kind === 'hud') qb.copy(qCraft).multiply(FLIP); else qb.copy(cam.quaternion);
      fR.set(1, 0, 0).applyQuaternion(qb); fU.set(0, 1, 0).applyQuaternion(qb); fF.set(0, 0, -1).applyQuaternion(qb);
      plane.position.copy(cam.position).addScaledVector(fF, D).addScaledVector(fU, D * LIFT); plane.quaternion.copy(qb);
      plane.visible = power;
      hudMat.color.setScalar(E.theme === 'light' ? 1.15 : 1);              // brighter against the midday sky
      if (power && clock - lastDraw > 33) { lastDraw = clock; draw(cam.position, fR, fU, fF); }
    },
    exit() { set(false); onExit(); },
  };

  function set(v: boolean) {
    if (v === on || (v && !real)) return;
    on = v;
    if (v) { first = true; head.yaw = 0; head.pitch = -0.06; lastDraw = -1e9; E.setEye(spec); }
    else { E.setEye(null); plane.visible = false; }
    inside(v);
  }

  /** where a pilot looks, and the airframe's own motion (flight path, g) from the craft's movement */
  function tick(now: number, dt: number, f: PilotFrame) {
    clock = now; frameInfo = f; power = f.power;
    if (!on) return;
    const p = R.craft.position;
    if (first) { prev.copy(p); vel.set(0, 0, 0); acc.set(0, 0, 0); first = false; }
    if (dt > 0) {
      const v = tmp.copy(p).sub(prev).divideScalar(dt);
      acc.lerp(tmp2.copy(v).sub(vel).divideScalar(dt), Math.min(1, dt * 3));
      vel.lerp(v, Math.min(1, dt * 12));
    }
    prev.copy(p);
    R.craft.getWorldQuaternion(qCraft);
    gLoad += ((tmp.set(0, 1, 0).applyQuaternion(qCraft).dot(tmp2.copy(acc).setY(acc.y + G)) / G) - gLoad) * Math.min(1, dt * 3);

    // where to look
    const m = C.marks, s = f.s, flying = s >= 0;
    let wy = 0, wp = f.ground ? -0.07 : -0.04, rate = 2.4;
    const aim = (pt: THREE.Vector3, yMax: number) => {
      local.copy(pt); R.craft.worldToLocal(local).sub(EYE);
      wy = clamp(Math.atan2(local.x, local.z), -yMax, yMax); wp = clamp(Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.95, 0.9);
    };
    if (strike?.focus(focus)) { aim(focus, 1.75); rate = 3.2; }
    else if (flying && s > m.finalTurn && s < m.touchdown) { const q = C.at(m.touchdown); aim(focus.set(q.x, 0, q.z), 0.9); }
    else if (flying && !f.ground) wy = clamp(-R.craft.rotation.z * 0.7, -0.6, 0.6);          // look into the turn
    const k = 1 - Math.exp(-dt * rate);
    head.yaw += (wy - head.yaw) * k; head.pitch += (wp - head.pitch) * k;

    // runway roll, touchdown jolt, a little air
    const t = now / 1000, sp = vel.length() / C.VC, roll = f.ground ? Math.min(1, sp * 1.5) : 0;
    bump *= Math.exp(-dt * 5);
    shake.pitch = 0.0025 * roll * (Math.sin(t * 61) + 0.6 * Math.sin(t * 97 + 1.3)) + 0.022 * bump * Math.sin(t * 38) + (!f.ground ? 0.0008 * Math.sin(t * 6.1) * Math.sin(t * 2.3) : 0);
    shake.yaw = 0.0013 * roll * Math.sin(t * 83 + 0.4) + (!f.ground ? 0.0006 * Math.sin(t * 4.7 + 2) : 0);
  }

  // ── the symbology ──
  let bR = V(), bU = V(), bF = V(), eye = V();
  /** canvas position of a world direction, or null behind the plane */
  const pr = (d: THREE.Vector3): [number, number] | null => {
    const z = d.dot(bF); if (z <= 1e-4) return null;
    return [N / 2 + d.dot(bR) / z * KPX, N / 2 - (d.dot(bU) / z - LIFT) * KPX];
  };
  const toward = (pt: THREE.Vector3) => tmp2.copy(pt).sub(eye);
  const dirAt = (psi: number, th: number) => tmp2.set(Math.cos(th) * Math.sin(psi), Math.sin(th), Math.cos(th) * Math.cos(psi));
  const onCanvas = (q: [number, number] | null, pad = 0): q is [number, number] => !!q && q[0] > pad && q[0] < N - pad && q[1] > pad && q[1] < N - pad;
  const line = (a: number, b: number, c: number, d: number) => { x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke(); };
  const text = (s: string, px: number, py: number, align: CanvasTextAlign = 'center') => { x.textAlign = align; x.fillText(s, px, py); };

  function draw(at: THREE.Vector3, r: THREE.Vector3, up: THREE.Vector3, fw: THREE.Vector3) {
    eye.copy(at); bR = r; bU = up; bF = fw;
    x.clearRect(0, 0, N, N);
    x.strokeStyle = x.fillStyle = GREEN; x.lineWidth = 5; x.lineCap = 'round'; x.textBaseline = 'middle'; x.font = `600 30px ${MONO}`;
    const nose = tmp.set(0, 0, 1).applyQuaternion(qCraft).clone();
    const slow = vel.length() < 4 * u, path = slow ? nose : vel.clone().normalize();

    // nose (waterline mark) and flight path marker
    const w = pr(nose);
    if (onCanvas(w)) { const [a, b] = w; x.beginPath(); x.moveTo(a - 32, b); x.lineTo(a - 16, b); x.lineTo(a - 8, b + 11); x.lineTo(a, b); x.lineTo(a + 8, b + 11); x.lineTo(a + 16, b); x.lineTo(a + 32, b); x.stroke(); }
    const fpm = pr(path);
    if (onCanvas(fpm)) {
      const [a, b] = fpm;
      x.beginPath(); x.arc(a, b, 12, 0, Math.PI * 2); x.stroke();
      line(a - 12, b, a - 32, b); line(a + 12, b, a + 32, b); line(a, b - 12, a, b - 24);
    }

    // pitch ladder about the flight path's heading: the horizon long, rungs every 5° (dashed below), with their angle
    const psi = Math.atan2(path.x, path.z);
    for (let th = -30; th <= 30; th += 5) {
      const c = pr(dirAt(psi, th * DEG).clone()), a = pr(dirAt(psi - 0.03, th * DEG).clone()), b = pr(dirAt(psi + 0.03, th * DEG).clone());
      if (!c || !a || !b || c[1] < -60 || c[1] > N + 60 || c[0] < -200 || c[0] > N + 200) continue;
      let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const [L0, L1] = th === 0 ? [34, 250] : [26, 84];
      x.setLineDash(th < 0 ? [9, 7] : []);
      for (const sg of [-1, 1]) line(c[0] + sg * dx * L0, c[1] + sg * dy * L0, c[0] + sg * dx * L1, c[1] + sg * dy * L1);
      x.setLineDash([]);
      if (th !== 0) {
        const h = pr(dirAt(psi, (th - Math.sign(th)) * DEG).clone());         // ticks toward the horizon
        if (h) {
          let nx = h[0] - c[0], ny = h[1] - c[1]; const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
          for (const sg of [-1, 1]) { const ex = c[0] + sg * dx * L1, ey = c[1] + sg * dy * L1; line(ex, ey, ex + nx * 9, ey + ny * 9); }
          x.font = `600 25px ${MONO}`;
          for (const sg of [-1, 1]) text(String(Math.abs(th)), c[0] + sg * dx * (L1 + 20), c[1] + sg * dy * (L1 + 20));
          x.font = `600 30px ${MONO}`;
        }
      }
    }

    // heading tape
    const hdg = ((Math.atan2(-nose.x, nose.z) / DEG) % 360 + 360) % 360;
    x.save(); x.beginPath(); x.rect(N / 2 - 150, 0, 300, 70); x.clip();
    for (let d = Math.floor((hdg - 30) / 5) * 5; d <= hdg + 30; d += 5) {
      const px = N / 2 + (d - hdg) * 9;
      const big = ((d % 10) + 10) % 10 === 0;
      line(px, 52, px, big ? 40 : 46);
      if (big) { x.font = `600 25px ${MONO}`; text(String(((d / 10) % 36 + 36) % 36).padStart(2, '0'), px, 28); }
    }
    x.restore(); x.font = `600 30px ${MONO}`;
    x.beginPath(); x.moveTo(N / 2, 56); x.lineTo(N / 2 - 6, 64); x.lineTo(N / 2 + 6, 64); x.closePath(); x.stroke();

    // airspeed (left) and altitude (right) boxes, mach and g under the speed
    const kt = vel.length() / u * 1.944, ft = Math.max(0, (R.craft.position.y - R.cgY) / u * 3.281);
    x.strokeRect(14, N / 2 - 24, 110, 48); text(String(Math.round(kt)), 69, N / 2 + 1);
    x.strokeRect(N - 134, N / 2 - 24, 120, 48); text(String(Math.round(ft / 10) * 10), N - 74, N / 2 + 1);
    x.font = `600 25px ${MONO}`;
    text(`M ${(vel.length() / u / 340).toFixed(2)}`, 14, N / 2 + 50, 'left');
    text(`G ${gLoad.toFixed(1)}`, 14, N / 2 + 82, 'left');
    text(frameInfo.ground ? 'GND' : 'R', N - 134, N / 2 + 50, 'left');

    // the run: target boxes on drones and ground targets, with range, a locator line to the one being engaged
    const S = strike, mode = !frameInfo.ground && frameInfo.gearDown && frameInfo.s > C.marks.finalTurn ? 'LDG' : 'NAV';
    let modeTxt = mode;
    if (S && S.active) {
      const { drones, targets, shots } = S.contacts;
      const chased = new Set(shots.filter(sh => !sh.done && sh.drone).map(sh => sh.drone));
      const bombed = new Map(shots.filter(sh => !sh.done && sh.target).map(sh => [sh.target, sh]));
      const airLive = drones.some(d => d.alive && d.g.visible), groundLive = targets.some(t => !t.hit);
      modeTxt = airLive ? 'A/A' : groundLive ? 'A/G' : mode;
      for (const d of drones) {
        if (!d.alive || !d.g.visible) continue;
        const q = pr(toward(d.p)); if (!onCanvas(q, 12)) continue;
        const h = d.big ? 24 : 17;
        x.strokeRect(q[0] - h, q[1] - h, 2 * h, 2 * h);
        if (chased.has(d)) { x.beginPath(); x.moveTo(q[0], q[1] - h - 7); x.lineTo(q[0] + h + 7, q[1]); x.lineTo(q[0], q[1] + h + 7); x.lineTo(q[0] - h - 7, q[1]); x.closePath(); x.stroke(); }
        x.font = `600 24px ${MONO}`; text((d.p.distanceTo(eye) / u / 1852).toFixed(1), q[0], q[1] + h + 14); x.font = `600 30px ${MONO}`;
      }
      for (const t of targets) {
        if (t.hit) continue;
        const q = pr(toward(t.at)); if (!onCanvas(q, 10)) continue;
        const sh = bombed.get(t);
        if (sh) {
          x.strokeRect(q[0] - 16, q[1] - 16, 32, 32);
          const tti = sh.s.kind === 'bomb' ? Math.max(0, sh.dur - sh.t) : sh.p.distanceTo(sh.aim) / Math.max(1, sh.v.length());
          x.font = `600 24px ${MONO}`; text(`${tti.toFixed(0)}`, q[0] + 22, q[1] - 16, 'left'); x.font = `600 30px ${MONO}`;
        } else { x.beginPath(); x.moveTo(q[0], q[1] - 7); x.lineTo(q[0] + 7, q[1]); x.lineTo(q[0], q[1] + 7); x.lineTo(q[0] - 7, q[1]); x.closePath(); x.stroke(); }
      }
      // the target being engaged, when it is off the display: a locator line from the centre and its angle off the nose
      if (S.focus(focus)) {
        const d = toward(focus).clone(), q = pr(d);
        if (!onCanvas(q, 12)) {
          const lx = d.dot(bR), ly = d.dot(bU), n = Math.hypot(lx, ly) || 1;
          line(N / 2 + lx / n * 30, N / 2 - ly / n * 30, N / 2 + lx / n * 92, N / 2 - ly / n * 92);
          x.font = `600 24px ${MONO}`; text(String(Math.round(d.angleTo(bF) / DEG)), N / 2 + lx / n * 112, N / 2 - ly / n * 112); x.font = `600 30px ${MONO}`;
        }
      }
    }
    // weapons aboard and the master mode
    x.font = `600 25px ${MONO}`;
    text(modeTxt, 18, N - 34, 'left');
    if (S) {
      const r = S.remaining(), w = [r.aam && `MRM ${r.aam}`, r.srm && `SRM ${r.srm}`, r.bomb && `GBU ${r.bomb}`, r.cruise && `CM ${r.cruise}`].filter(Boolean).join('  ');
      text(w, N - 18, N - 34, 'right');
    }
    if (frameInfo.gearDown && !frameInfo.ground) text('GEAR', 18, N - 70, 'left');
    // the last weapons call, big under the centre for a moment
    if (clock - call.t < 1800) { x.font = `700 38px ${MONO}`; text(call.text, N / 2, N / 2 + 120); }
    tex.needsUpdate = true;
  }

  /** compile the view's materials as the Real view draws them, so switching it on never stalls on a shader */
  function warm() {
    const r = E.renderer, show: THREE.Object3D[] = [plane, ...(P.deck ? [P.deck] : [])], was = show.map(o => o.visible);
    const probe = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), clear); E.scene.add(probe);
    show.forEach(o => { o.visible = true; });
    const prevRT = r.getRenderTarget(); r.setRenderTarget(E.composer.readBuffer);
    try { r.compileAsync(E.scene, E.camera).catch(() => {}); } catch { /* a compile problem shows up as a normal draw later */ }
    r.setRenderTarget(prevRT);
    show.forEach((o, i) => { o.visible = was[i]; });
    E.scene.remove(probe); probe.geometry.dispose();
  }

  return {
    get on() { return on; },
    set,
    tick,
    /** the brevity call the strike just made, shown on the head-up display */
    call(m: string) { call = { text: m.toUpperCase(), t: clock }; },
    touchdown() { bump = 1; },
    setReal(v: boolean) { real = v; if (v) warm(); else set(false); },
  };
}
export type PilotView = ReturnType<typeof createPilotView>;
