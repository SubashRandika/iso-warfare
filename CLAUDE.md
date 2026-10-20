@AGENTS.md

# Iso-Warfare

An armory of interactive 3D military hardware in the iso-glow hairline style (Next.js 16, React 19, three.js 0.186).
Every model can be orbited, has a true isometric view, auto-revolve, light/dark themes and an accent picker, and
every listed part does something. Built with the `/iso-glow` and `/threejs` skills.

`npm run dev -- -p 3210` · `npx tsc --noEmit` · `npx next build` · `npm run new:model -- <category> <id> "<Name>"`

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
2. Fill `def.ts`: real specs, an intro, every part with a factual `text` (and `click` if clicking does something),
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
  on +x, green on −x), optional `markings`, `onStyle`, and `tick(now, mats)` for heat and plumes.
- Tag meshes with the material they become: `kit.add(parent, geo, mat, { real: 'strut' })`, `kit.well(…, 'bay')`.
  Tags: skin, nozzle, cockpit, intake, recess, well, bay, exhaust, strut, tyre, store, seeker, canopy. Untagged body
  meshes get the skin; `kit.wheel` and `missileGeo` tag themselves. Add a tag in `lib/real/materials.ts` if needed.
- The skin needs no UVs (triplanar in model coordinates), so keep building meshes in model coordinates.
- Afterburners and rocket motors: `makePlume(parent, at, dir, w, h, len)` from `lib/real/plume.ts`; plumes are
  real-style only (no exhaust glow in the hairline look).
- Detail that only belongs in Real goes in `only: { line, real }` (shown in one style each). The F-22 swaps in a
  fuselage with a true cockpit opening and a full cockpit built from `lib/models/fighters/jet/cockpit.ts`
  (ejection seat, panel with live displays, glareshield, HUD, consoles, stick, throttles) for its hairline boxes.
- Reference: the F-22 (`lib/models/fighters/f22/airframe.ts` tags + `real` block, `jet/sim.ts` builds the spec).

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
  octagons and lofts read better than 32-segment cylinders.
- Keys: one letter per action, unique per model. Reserved by the host: I, T, M, H, Escape, [, ], /.
  The catalogue warns in dev about clashes and unknown parts.
- Demos must survive slow or throttled frames: chain steps with `script.when(cond, f)` (wait until the model has
  settled), not fixed delays alone. End with `script.end()` and leave the model lit.
- Readout: terse, lower-case, ` · ` separated (`13 in magazine · round chambered · safe`).
- Part text describes the real equipment; keep claims modest and checkable.
