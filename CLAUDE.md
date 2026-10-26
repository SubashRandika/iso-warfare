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
   its mat: extruded side profiles, slide cycle, magazine drop, thrown brass) and `lib/models/fighters/` (large lofted airframes,
   hinged surfaces, gear, bays). Several models of one kind share a sim the way the fighters share `jet/sim.ts`.
4. Check: `npx tsc --noEmit`, `npx next build`, then open `/?model=<id>` and run each action, the demo, both themes.

## The model contract (`lib/core/types.ts`)

`ModelFactory(ctx) → ModelRuntime`. `ctx` gives `E` (engine), `snd`, `script`, `say(msg)`, `wig(id, now)`, `has(action)`.
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
- Never add, remove, show or hide lights at runtime in the real view: a change in the light count recompiles every
  shader in the scene (a multi-second freeze per explosion). Keep a fixed pool in a visible group and vary intensity;
  compile new effects' materials when the real view comes on (`renderer.compileAsync` with the composer's target).
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
- Keys: one letter per action, unique per model. Reserved by the host: I, T, M, H, Escape, [, ], /.
  The catalogue warns in dev about clashes and unknown parts.
- Demos must survive slow or throttled frames: chain steps with `script.when(cond, f)` (wait until the model has
  settled), not fixed delays alone. End with `script.end()` and leave the model lit.
- Readout: terse, lower-case, ` · ` separated (`13 in magazine · round chambered · safe`).
- Part text describes the real equipment; keep claims modest and checkable.
