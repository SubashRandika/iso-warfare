#!/usr/bin/env node
// Scaffold a model: lib/models/<category>/<id>/{def.ts, model.ts}, registered in lib/catalog/index.ts.
//
//   npm run new:model -- <category> <id> "<Name>" [--designation M1A2] [--size 9.8]
//   npm run new:model -- tanks m1a2 "M1A2 Abrams" --designation M1A2 --size 9.8
//
// The stub runs at once: a placeholder body on a ground plate, a light you can switch, a demo. Replace the body with
// the real geometry (see CLAUDE.md and the M17 pistol / fighter jets for full examples).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf('--' + n); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const designation = flag('designation');
const sizeArg = flag('size');
const [category, id, name] = args;
const die = (m) => { console.error('new-model: ' + m); process.exit(1); };

if (!category || !id || !name) die('usage: npm run new:model -- <category> <id> "<Name>" [--designation X] [--size metres]');
if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) die(`id "${id}" must be lower-case letters, digits and dashes (it goes in the URL)`);

const cats = fs.readFileSync(path.join(root, 'lib/catalog/categories.ts'), 'utf8');
const known = [...cats.matchAll(/id: '([a-z-]+)', domain: '[a-z-]+', name: '([^']+)', one: '([^']+)'/g)].map(m => ({ id: m[1], name: m[2], one: m[3] }));
const cat = known.find(c => c.id === category);
if (!cat) die(`unknown category "${category}". Known: ${known.map(c => c.id).join(', ')}`);

const indexPath = path.join(root, 'lib/catalog/index.ts');
let index = fs.readFileSync(indexPath, 'utf8');
const dir = path.join(root, 'lib/models', category, id);
if (fs.existsSync(dir)) die(`${path.relative(root, dir)} already exists`);
if (new RegExp(`id: '${id}'`).test(index) || fs.readdirSync(path.join(root, 'lib/models'), { recursive: true }).some(p => path.basename(String(p)) === id)) die(`a model with id "${id}" already exists`);

// typical overall length per category, for the plate, grid and camera of the stub
const SIZE = { fighters: 18, pistols: 0.2, rifles: 0.9, 'sniper-rifles': 1.2, 'machine-guns': 1.2, tanks: 10, trucks: 8, missiles: 5, launchers: 10, warships: 150 };
const S = Number(sizeArg ?? SIZE[category] ?? 5);
if (!(S > 0)) die('--size must be a positive number of metres');
// small arms float raised above the floor with no stand (the floor stays for spent cases and dropped magazines)
const raised = ['pistols', 'rifles', 'sniper-rifles', 'machine-guns'].includes(category);
const grid = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10].find(g => g >= S / 20) ?? 10;
const v = id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase()).replace(/^(\d)/, 'm$1');
const desig = designation ?? name.split(/\s+/)[0];
const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const def = `import type { ModelDef } from '../../../catalog/types';

export const ${v}: ModelDef = {
  id: '${id}', category: '${category}', name: '${q(name)}', tab: '${q(name)}', designation: '${q(desig)}',
  role: 'TODO: role · operator',
  specs: [['Length', '${S} m']],
  intro: {
    title: '${q(name)}',
    text: 'Click a part to see what it does; parts that move will move. Switch the lights on, or run the demo.',
  },
  parts: [
    { id: 'body', name: 'Body', text: 'TODO: what this part is and does on the real ${cat.one}.' },
    { id: 'lights', name: 'Lights', click: 'switches the lights on or off', text: 'TODO: the lights on the real ${cat.one}.' },
  ],
  actions: [
    { id: 'demo', label: 'Demo', key: 'D' },
    { id: 'lights', label: 'Lights', key: 'L' },
  ],
  partActions: { lights: 'lights' },
  hint: 'L lights · I iso · T theme · / armory',
  load: () => import('./model'),
};
`;

const model = `// ${name}: stub from scripts/new-model.mjs. Replace the placeholder body with the real geometry; keep the contract
// (see CLAUDE.md). Coordinates in metres: +y up, +z forward, +x to the model's left.
import * as THREE from 'three';
import type { ModelFactory } from '../../../core/types';
import { approach } from '../../../core/anim';
import { makeKit } from '../../../kit/build';
import { buildPlate } from '../../../stages/plate';

const S = ${S};                                  // overall length, metres

const model: ModelFactory = ({ E, snd, script }) => {
  const K = makeKit(E, { unit: S / 10 });
  const { add, part, box } = K;
  const plate = buildPlate(E, { w: S * 1.6, d: S * 1.6, grid: ${grid}, shadow: [S * 0.5, S * 1.15, 0, 0] });
${raised ? '  K.root.position.y = S * 0.6;                    // raised above the floor, no stand\n' : ''}
  // ═════ geometry: every clickable piece is a part ═════
  const pBody = part('body');
  add(pBody, box(-S * 0.15, S * 0.15, 0, S * 0.2, -S * 0.5, S * 0.5));
  // a lamp: only what is live gets the accent
  const pLights = part('lights');
  const lampMat = E.glowMat(), at = new THREE.Vector3(0, S * 0.212, S * 0.44);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(S * 0.012, 16, 10), lampMat); lamp.position.copy(at); pLights.add(lamp);
  const glow = E.glowPoints([at], S * 0.06); pLights.add(glow);

  // ═════ state and actions: keys, buttons and clicks all call these ═════
  const st = { lights: false, k: 0 };
  const act = {
    lights() { st.lights = !st.lights; snd.button(); },
    demo() {
      if (script.active) { script.stop(); return; }
      script.start();
      if (!st.lights) act.lights();
      script.later(800, () => script.end());
    },
  };

  return {
    pickRoot: K.root, parts: K.parts,
    view: { target: new THREE.Vector3(0, S * ${raised ? 0.55 : 0.12}, 0), dist: S * ${raised ? 2.4 : 1.8} },
    actions: act,
    on: () => ({ demo: script.active, lights: st.lights }),
    tick(_now, dt) {
      st.k = approach(st.k, st.lights ? 1 : 0, 4 * dt);
      lampMat.emissiveIntensity = 1.8 * st.k;
      glow.material.uniforms.intensity.value = 0.9 * st.k;
      plate.shadowMat.uniforms.opacity.value = E.shadowStrength() * 0.8;
    },
    readout: () => (st.lights ? 'lights on' : 'lights off'),
  };
};

export default model;
`;

// register: import after the last model import, append to MODELS
const imports = [...index.matchAll(/^import \{ \w+ \} from '\.\.\/models\/.+';$/gm)];
if (!imports.length || !/export const MODELS: ModelDef\[\] = \[[^\]]*\];/.test(index)) die('could not find the model list in lib/catalog/index.ts');
const last = imports[imports.length - 1];
const at = last.index + last[0].length;
index = index.slice(0, at) + `\nimport { ${v} } from '../models/${category}/${id}/def';` + index.slice(at);
index = index.replace(/export const MODELS: ModelDef\[\] = \[([^\]]*)\];/, (_, list) => `export const MODELS: ModelDef[] = [${list.trim().replace(/,\s*$/, '')}, ${v}];`);

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'def.ts'), def);
fs.writeFileSync(path.join(dir, 'model.ts'), model);
fs.writeFileSync(indexPath, index);
console.log(`created lib/models/${category}/${id}/def.ts and model.ts, registered in lib/catalog/index.ts`);
console.log(`open http://localhost:3210/?model=${id}`);
