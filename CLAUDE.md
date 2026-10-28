@AGENTS.md

# Iso-Warfare

An armory of interactive 3D military hardware in the iso-glow hairline style (Next.js 16, React 19, three.js 0.186).
Every model can be orbited, has a true isometric view, auto-revolve, light/dark themes and an accent picker, and
every listed part does something. Built with the `/iso-glow` and `/threejs` skills.

`npm run dev -- -p 3210` · `npx tsc --noEmit` · `npx next build` · `npm run new:model -- <category> <id> "<Name>"`

Don't run `next build` while the dev server is up: it breaks the dev server's next/font (500s). Stop the server, delete
`.next/dev`, restart.

## Layout

```
lib/iso/        engine (renderer, hairlines, glow, themes, iso camera), geo (lofts, slabs), accents
lib/core/       host (one engine + one model: keys, picking, theme, demo clock, snapshot), types (the model
                contract), sound (cues + pluggable voices), script (demo timers), anim (ease, phase, approach)
lib/kit/        build (parts, hairlined meshes, hinges, primitives through a coordinate frame, wells, canvas
                displays), ordnance (missile bodies, seekers)
lib/real/       the realistic render style (Line / Real switch, key H): stage (sky, sun, shadows, apron, fog, bloom,
                material swap), materials (PBR library + triplanar skin), textures (procedural), plume (afterburner)
lib/range/      the shooting range for small arms: hall, pop-up targets, gloved hands, controller, overlay state
lib/stages/     apron (aircraft), plate (any ground plate: grid, optional ruler; small arms use a cm bench mat)
lib/catalog/    categories (domains and shelves), types (ModelDef, three-free), index (the MODELS registry)
lib/models/<category>/<id>/   def.ts (catalogue data) + model.ts (default export: ModelFactory)
lib/models/fighters/jet/      flight model shared by every fighter (sim, jet kit, turbofan voice)
components/     Viewer (shell, header, panels), Armory (index of every model)
```

The UI imports only `lib/catalog` (plain data). A model's code is fetched when it is opened (`def.load()`), so each
model is its own chunk; three.js loads with the first model.

## Adding a model

1. `npm run new:model -- tanks m1a2 "M1A2 Abrams" --designation M1A2 --size 9.8` writes a working stub and registers
   it. Categories: see `lib/catalog/categories.ts` (add one there if needed; the armory shows a category once it has
   a model).
2. Fill `def.ts`: real specs, the information card's `info` (country, manufacturer, role, service status, and the year
   of the first flight for aircraft or of first use for everything else; a new country needs its flag in
   `components/Flag.tsx`), every part with a factual `text` (and `click` if clicking does something),
   actions with single-letter keys, `partActions` mapping parts to actions (or `wiggle:<id>`).
3. Build the geometry in `model.ts`. References: `lib/models/pistols/m17/model.ts` (small, self-contained, raised over
   its mat: extruded side profiles, slide cycle, magazine drop, thrown brass), `lib/models/rifles/m8/model.ts` (a rifle:
   profiles traced from a photo that is not square-scaled, a handguard of flat panels with real M-LOK cut-outs so the
   barrel shows through, an ejection port cut right through the receiver with the bolt carrier moving inside, a lathe-turned
   scope, folding stock, removable suppressor, selector with automatic fire), `lib/models/rifles/ak47/model.ts` (profiles
   written in the photo's own pixels and converted by `px`, an open stamped receiver of two walls and a floor so the
   carrier lifts out of a real channel, a carrier carrying its gas piston and reciprocating handle, a magazine that rocks
   about its front lug, a field strip that lays the parts beside the rifle, laminated-wood grain drawn on a canvas, matt
   sights so they don't mirror the range's lights), `lib/models/rifles/hk416/model.ts` (scale taken from the Picatinny
   rail's 10.01 mm slot pitch, an upper built in two halves so the ejection port is cut into the right side only, a sprung
   port cover, quad rail, holographic sight with a flip-to-side magnifier, an aiming laser, a telescoping skeleton stock
   (a thin core extrusion under a thicker frame extrusion whose holes are the pockets, so they read as moulded recesses,
   a proud ribbed strut, a holed rubber pad); through an
   AR rear sight the eye sees a ring round a large aperture, so it is modelled as one, not as a plate with a pinhole)
   and `lib/models/fighters/` (large lofted airframes,
   hinged surfaces, gear, bays). Several models of one kind share a sim the way the fighters share `jet/sim.ts`.
4. Check: `npx tsc --noEmit`, `npx next build`, then open `/?model=<id>` and run each action, the demo, both themes.

## The model contract (`lib/core/types.ts`)

`ModelFactory(ctx) → ModelRuntime`. `ctx` gives `E` (engine), `snd`, `script`, `say(msg)`, `wig(id, now)`, `has(action)`,
`style(real)`, `open(id, arrive?)` (open another model; `'range'` goes straight onto the range) and `arrive`.
The runtime returns `pickRoot`, `parts`, `view {target, dist}`, `actions` (every id the def names), `on()`,
`tick(now, dt)`, `readout()`, and optionally `passive`, `keyDown/keyUp/blur` (held keys), `dispose`.
The host owns themes, accent, revolve, iso, sound toggle, persistence, picking, messages and the demo stop rule
(any non-passive action stops the demo). Models never touch the DOM outside their canvas displays.

## Realistic style (optional per model)

The hairline look is the default. A model can also offer **Real**: physically based materials, a sky that lights
the scene, sun shadows, a textured apron, bloom. Light theme = midday, dark theme = dusk. To opt in:

- Return `real: RealSpec` from the runtime (`lib/real/types.ts`): the skin paint (`SkinSpec`), `focus` and `size`
  for the shadow camera, hairline scenery to `hide`, `lamps` (hairline glow material → real colour; `'nav'` is red
  on +x, green on −x), optional `markings`, `onStyle`, and `tick(now, mats)` for heat and plumes. Sun distance,
  shadow bias and fog scale with `size`, so the same stage works for a pistol and a fighter.
- Models that aren't painted aircraft bring their own finishes: `materials: { polymer, nitride, … }` keyed by the tags
  they use (`body` for untagged meshes); they own and dispose them. Small arms add `bench: { w, d, cx, cz }` (the
  plate's size): a shooting bench with a printed rubber mat whose top is y = 0, the range floor below.
  Reference: `lib/models/pistols/m17/model.ts` (also real-only stippling and serrations, a fireball muzzle flash, and
  spent cases that carry a hairline and a real version, switched in `onStyle`, since they are spawned at runtime).
- Tag meshes with the material they become: `kit.add(parent, geo, mat, { real: 'strut' })`, `kit.well(…, 'bay')`.
  Tags: skin, edge (the skin in `SkinSpec.edge`, for lighter edge treatments), nozzle, metal (bare engine metal in
  heat-tinted rings), radome, cockpit, intake, recess, well, bay,
  exhaust, strut, tyre, rim, primer, store, seeker, canopy. Untagged body meshes get the skin; `kit.wheel` (tyre on rim) and `missileGeo` tag
  themselves. Add a tag in `lib/real/materials.ts` if needed.
- Paint: `SkinSpec` gives two tones and soft camouflage patches; `pixel` (block size in m) makes it digital, `core`
  darkens the spine, `scale` sizes the patches, `tone` and `seam` set how strongly panels and seams show. The F-22
  wears a clean silver-grey coating with soft darker patches, light edge bands (its leading-edge flaps are tagged
  'edge', the rest are edge strips laid on the moving surfaces), small dark diamond panels and sawtooth bay-door
  outlines; the Su-57 light grey with dark blue-grey pixel bands.
  Match the paint to a photo of the real aircraft. Insignia, numbers and markings are real-only decals from
  `lib/real/decals.ts`: a fine grid laid onto the skin with a cut-out canvas texture (see the F-22 and Su-57).
- The skin needs no UVs (triplanar in model coordinates), so keep building meshes in model coordinates.
- Afterburners and rocket motors: `makePlume(parent, at, dir, w, h, len, seed, kind)` from `lib/real/plume.ts`
  (`kind` 'ab' or 'dry': the jets show a faint dry plume whenever the engine runs, the afterburner on top); plumes are
  real-style only (no exhaust glow in the hairline look).
- Detail that only belongs in Real goes in `only: { line, real }` (shown in one style each). The F-22 swaps in a
  fuselage with a true cockpit opening and a full cockpit built from `lib/models/fighters/jet/cockpit.ts`
  (ejection seat, panel with live displays, glareshield, HUD, consoles, stick, throttles) for its hairline boxes.
  The F-35B does the same with a panoramic display and no HUD, a sawtooth nozzle edge and real lift-fan blades.
- Reference: the F-22 and F-35B (`lib/models/fighters/*/airframe.ts` tags + `real` block, `jet/sim.ts` builds the
  spec). A plume parented to a moving part (the F-35B's swivel nozzle segment, the Su-57's vectoring nozzles) turns
  with it. The Su-57 (`lib/models/fighters/su57/`) also shows all-moving fins, LEVCONs and tandem tunnel bays.
  The J-20 (`lib/models/fighters/j20/`) is a canard-delta: all-moving canards on the intake tops share pitch with the
  wing's trailing edges (no tailplane, no airbrake panel: the speed brake tilts the canards and splays the fins), caret
  DSI intakes with the bump inside each mouth, ventral fins, serrated nozzles, one wide ventral bay and side-bay
  trapezes; in Real, light grey edge bands on every surface and low-visibility insignia.
  The B-2 (`lib/models/bombers/b2/`) reuses the jet sim for a flying wing: a wing lofted by span stations, elevons,
  split drag rudders, a crew hatch instead of a canopy (`canopyWord`), rotary-launcher bomb bays, no afterburner
  (the demo only lights one when the def lists the action) and no plumes at all (`nozzles: []`: its troughs hide
  the exhaust). Its trailing edge runs at ±33° in every segment (constant-chord outer panels, tips level with the
  tail), and its crown and humps use a (1 − u²)ⁿ cross-section so they fade into the wing instead of sitting on it.
  Light grey seams and the tiled troughs are real-only ribbons and decals.
  The B-52H (`lib/models/bombers/b52/`) is the big conventional bomber on the same sim: a superellipse fuselage
  lofted by stations, a drooping high wing, eight engines in four paired pods (the engine display packs its bars to
  fit), bicycle gear on four trucks plus wingtip outriggers, Fowler flaps that translate aft as well as rotate (the
  hinge's outer group moves) uncovering 'primer' yellow coves, spoilers instead of ailerons (roll and air brakes).

## The jets' demo and sound

- In the Real view every jet's demo flies a real circuit from a runway (`lib/models/fighters/jet/circuit.ts`): take-off roll, rotation,
  climb, two banked 180° turns, final with gear down, flare, touchdown and a roll-out that stops on the parking
  spot. Distances and speeds scale with `view.dist / 36`, so bombers take longer runs and every jet takes ~44 s.
  The craft really moves; `E.track(delta)` moves the orbit target and camera with it (the user can still orbit),
  `RealSpec.follow` moves the sun's shadow box, `markings.runway` paints the runway, and the soft shadow follows from the
  sim. Stopping the demo part-way puts the jet back over its spot. The F-35B then hovers. The Line view never flies or
  attacks: its demo stays on the apron (start-up, control check, bays open and shut), and switching to Line mid-flight
  stops the demo and sets the jet back down on its spot (the sim tracks the style through `onStyle`).
- On the circuit's downwind leg the demo flies a strike (`jet/strike.ts`) with the weapons the airframe lists in
  `JetRig.stores` (`store(kind, obj, bay)`: 'aam' radar missiles, 'srm' side-bay heat-seekers, 'bomb', 'cruise'):
  a generic range of shelters, bunkers, a radar site and fuel tanks beside the leg, target drones head-on (a large
  support aircraft first when `airTarget: 'awacs'`, as for the J-20). The strike opens each bay when its weapons are
  needed; the real store objects detach, fly and are put back after landing. Launches follow the real sequence: bay
  missiles and bombs are rammed down clear of the jet first (the missile's motor lights ~0.3 s later), a heat-seeker
  fires straight off its trapeze. Missiles home by proportional navigation (lateral acceleration capped in g) with a
  short loft, and burst on a proximity fuze tested along the whole frame's path (a 4 Mach-ish missile moves 15 m a
  frame: a point test misses). Every fighter carries a ground-attack load too (F-22: 2 AMRAAM + 2 GBU-32; Su-57 and
  J-20: 2 missiles + 2 guided bombs; bombs have no seeker glow, so bay seeker indices stop at `bayGlows`). The camera
  eases back for the strike and in again after. Explosions: accent flash and shock ring (line); in real, fireball,
  sparks, dust, smoke and a light flash; the boom delayed by distance; brevity calls via `say` (fox three, fox two,
  bombs away, rifle, splash). Targets and effects keep their own line/real materials (`setReal` from onStyle).
- Smoke and fire in the real view come from `lib/real/smoke.ts`: soft camera-facing puffs (instanced, lit by the sun,
  fogged; fire additive). Lay trail puffs by distance along the path, wider than their spacing, never one per frame
  (that comes out as a dotted line of balls).
- Bloom only takes what is brighter than the sky (`bloomT` per time of day, just over the midday horizon) and is
  capped, so the sky never hazes what stands in front of it and a sun in frame doesn't white the screen out. Keep
  anything meant to glow (flames, flashes, plumes) well above it.
- Never add, remove, show or hide lights at runtime in the real view: a change in the light count recompiles every
  shader in the scene (a multi-second freeze per explosion). Keep a fixed pool in a visible group and vary intensity;
  compile new effects' materials when the real view comes on (`E.warm(root, holding)`: `renderer.compileAsync` with
  the composer's target; holding, frames wait until the programs are linked instead of stalling on a sync compile).
- Shaders compile once per session (`lib/iso/engine.ts`): there is one WebGL renderer for the whole session (a
  disposed engine hands it to the next), every program stays pinned (`keepPrograms`), and disposing a `ShaderMaterial`
  keeps its program and source registered (three would otherwise give the next identical material a new cache id and
  compile it again). Textures generated at load that are shared for the session (`share()` in `lib/real/textures.ts`:
  skin, concrete, the range hall's, the hands' weave, smoke puffs) are marked `userData.shared`, which the engine's
  dispose skips. The Real view comes on behind `E.warm()`, and opening a model whose stored style is Real holds the
  first frames until it is up (no hairline flash, no hairline compile).
- Pilot view (key P, Real view only, `jet/pilot.ts`): the engine's first-person camera (`E.setEye(spec)`: the model
  poses the head each frame, drag looks round and eases back, wheel zooms; the orbit camera keeps tracking meanwhile,
  so use `E.orbitCamera` for orbit work and `E.camera` for what is drawn). The head looks ahead, into turns, at the
  touchdown point on final and is padlocked on what the strike engages (`strike.focus`). Each airframe gives
  `JetRig.pilot`: the eye point (in P() coordinates), `hud` ('hud' symbology fixed to the airframe, conformal, drawn on
  a canvas plane far ahead of the eye; 'helmet' on the F-35, carried by the head; 'none'), and for the bombers a
  `deck` shown only from the seat: the inside of the skin with the windows cut out (`jet/deck.ts`, built from the
  airframe's own surface and window table so the openings match the panes), floor, panels, yokes or sticks, seats.
  `hide` lists parts the deck stands in for (the B-2's centre body, whose top skin runs through its cabin, swaps for a
  finer copy with the cabin cut out). From the seat the gold canopy (material named 'canopy') turns clear, the HUD
  combiner's static glyphs hide, and the turbofan voice goes through its cabin filter. Performance: nothing is built
  when it comes on; its materials compile with the Real view; the symbology redraws at 30 Hz; smoke puffs the eye is
  inside fade and are dropped in the vertex shader (no screen-filling overdraw).
- The engine voice (`jet/turbofan.ts`) is synthesised from a turbofan's parts: pink-noise roar and tearing, per-engine
  fan tones detuned to beat, buzz-saw near full power, start-up whine and light-off thump, afterburner rumble and
  crackle, runway rumble, wind and the touchdown chirp, through a short outdoor reverb. No recorded samples.

## The shooting range (small arms)

- Key G on a small arm (Real view; it switches the style on by itself): the weapon leaves its bench for gloved hands
  on lane 3 of an indoor range (`lib/range/`). The weapon supplies a `RangeGun` (`lib/range/types.ts`: sight line,
  muzzle, grip, recoil, trigger/magazine/rack/safety, and `hold(on, {ground, flash})` so its cases and dropped
  magazines land on the floor or a counter and its flash lights the hall); the range owns the hall (`chamber.ts`),
  the pop-up targets (`targets.ts`), the hands (`hands.ts`), the camera, the drill and the overlay state
  (`hud.ts` → `components/RangeHud.tsx`, which replaces the viewer's panels while `ModelRuntime.hud()` returns one).
  References: the M17, the M8, the AK-47 and the HK416 (`rangeGun` in each model.ts; the AK on its iron sights, with no
  hold-open; the HK416 with a holographic sight, magnifier and laser). A rifle sets `kind: 'rifle'`, `fore` (where the support
  hand holds the handguard), `hip`, `optic()` (the fitted optic's sight line, relief and power range, or null for the
  irons), `auto()` and `loud()` (a suppressed report makes the hall answer quietly); `grip.fingers` sets how far below the
  web the middle finger sits on its grip (its trigger guard hangs lower than a pistol's).
- Poses (`hip`, the rear sight in camera space when not aiming): a pistol is carried out in the firing hand alone, low
  and right with the wrist running to the corner of the view, and the support hand (its own group, `hands.support`)
  comes up and wraps the grip as it is aimed; a rifle sits close in, low and right, running diagonally out of the
  corner with the support hand under the handguard.
- Changing weapon: 1, 2 … pick a weapon by its place among the models that list a `range` action, Q goes back to the
  last one. The weapon lowers out of view, the viewer opens the other model with `arrive: 'range'` behind a short
  "Changing weapon" cover (`Viewer.tsx`), and it comes straight up on the line where the shooter stood (`carry` in
  `range.ts`, relative to the lane: each weapon's bench, so its hall, differs a little). The canvas stays in place and
  the next engine keeps the pointer captured (`keepLock`). The model passes `{ id, open }` to `createRange`.
- Performance: a weapon builds its range as soon as the Real view is up (`onStyle`) and the range compiles off the
  main thread while the weapon still lies on its bench; G waits for that (`ready`) rather than stall. The hall and
  targets per bench size (`kits`) and each weapon's hand meshes (meshed a few milliseconds a frame: `meshSteps` and
  `handMeshes` are generators; a worker was tried, but the production build ships `new Worker(new URL(...))` as a raw
  file instead of bundling it) are kept for the session, and their materials are never disposed.
- Holographic and red-dot sights: `optic()` returns `kind: 'holo'` (unmagnified): aiming looks over the sight and only
  its ring and dot are drawn on the optic's axis; the weapon stays in view. A magnifier flipped in behind it is a
  `kind: 'scope'` with `reticle: 'holo'` (the ring and dot in a 3× tube picture). The pose cache is keyed by the optic's
  kind and eyepiece, so flipping a magnifier re-poses the rifle. A laser module returns `laser()` (emitter and beam in the
  weapon's coordinates): the range puts a glowing dot where the beam meets the hall or a target.
- Optics: aiming ends looking through the scope: the view magnifies (wheel sets the power) behind a clip-space shader
  picture (tube, eyebox rim, second-focal-plane reticle with an illuminated horseshoe and dot) centred on where the
  optic's axis points, so sway and recoil move the reticle with the shot. The rifle and hands are hidden there by moving
  their meshes to layer 1 (never by hiding the root: its muzzle-flash light would change the light count).
- The hands (`hands.ts`) are anatomy, not boxes: metacarpals, palm and heel pads, jointed fingers and thumbs as rounded
  cones and ellipsoids, blended with smooth unions and meshed once by surface nets (`sdf.ts`, coarse-to-fine; the
  shapes are in `handshape.ts`, generators spread over frames). Fingerless gloves: one material whose colour, roughness, bump depth and skin
  sheen come per vertex from the region (glove, knuckle pads, strap, skin, nail), with contact shading baked from the
  field. The index finger is a separate mesh hinged at its knuckle and presses the trigger on each shot.
- Aiming: a quick right click toggles the aim (as Z does), a held right button aims until it is released.
- Controls go through the engine's first-person camera with `EyeSpec.lock`: the first click captures the pointer,
  then raw mouse look, buttons and wheel go to the model (no part picking); a refused lock falls back to drag-look with
  click-to-fire. Escape releases the pointer, a second Escape leaves; G, H and I leave too.
- The bullet goes along the sights (zeroed at 15 m) with a small spread, more from the hip and on the move; one ray per
  shot against the hall and target colliders (`userData.surface` / `userData.target`). Scoring A 5 · C 3 · D 1 ·
  no-shoot −10; the drill is 45 s after a random-delay shot-timer beep; the best score is kept per weapon.
- Lighting: `RealSpec.stage()` hands the stage an indoor override (room environment, no sky, the sun overhead as the
  house lights, haze); light theme = house lights up, dark theme = low light (floods only, muzzle flash lights the room).
  Still no runtime lights: lamps are emissive meshes. The glow threshold sits above every lamp in the hall (only
  flashes and sparks glow): with the troffers blooming, the whole hall hazed white whenever the ceiling was in view.

## Rules that keep the look and the behaviour consistent

- Small arms (pistols, rifles, sniper rifles, machine guns) float raised above a floor with no stand or post.
  The floor stays: spent cases and dropped magazines land on it. Vehicles, ships and launchers stand on their stage.
- Units are metres, +y up, +z forward, +x to the model's left (three.js is right-handed;
  aircraft call +x port). Build at real size; pass `unit` to `makeKit`
  (about size / 10) so short crease lines survive on small things. The engine scales clip planes to `view.dist`.
- Accent colour only on what is live: lit lamps and screens, seekers when armed, muzzle flashes, tritium.
  Light parts with `E.glowMat()` (+ `E.glowPoints` for the halo); the light theme turns them flat accent and hides
  glow automatically. Never hard-code a hue.
- Every mesh goes through `kit.add` (silhouette + creases) unless it is a flat well/decal. Faceted, not smooth:
  octagons and lofts read better than 32-segment cylinders. Rounded edges are fine when each step turns less than
  the 30° crease threshold (an extrude bevel in 4 segments, a loft corner in 4 steps): they then show only as
  silhouette, and the Real view shades them smooth. Sharp single chamfers everywhere look boxy.
- Trace side profiles from a true side photo at a known scale (overall length ÷ pixels) and say so in a comment;
  draw the profiles back over the photo to check them (the M17 grip and slide came out 25–30 % too big by eye).
- Keys: one letter per action, unique per model. Reserved by the host: I, T, M, H, Escape, [, ], /. On the range the
  range takes W A S D, F, R, E, Z, X, C, P, Q, Space, Shift, the digits and the arrows while it is on (other model keys,
  such as the HK416's V magnifier and L laser, still work on the line).
  The catalogue warns in dev about clashes and unknown parts.
- Demos must survive slow or throttled frames: chain steps with `script.when(cond, f)` (wait until the model has
  settled), not fixed delays alone. End with `script.end()` and leave the model lit.
- Readout: terse, lower-case, ` · ` separated (`13 in magazine · round chambered · safe`).
- Part text describes the real equipment; keep claims modest and checkable.
