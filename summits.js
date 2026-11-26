// Summits: walk through a Himalayan forest at night. A light falls; whatever you touch wakes
// into sound and lands on a sixteen-step loop that keeps playing. Every sound sits where its element stands, so where
// you walk is the mix. Original code for BodyBeat (worlds built in code, instruments in summits-sound.js).
import * as THREE from './vendor/three.module.js';
import { VOICES, click as metroClick, ambience, thunder } from './summits-sound.js';
import { wav24 } from './chaos-core.js';
import { active, guardAudio } from './site-state.js';
import { MeshSurfaceSampler } from './vendor/jsm/math/MeshSurfaceSampler.js';
import { EffectComposer } from './vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/jsm/postprocessing/OutputPass.js';

const root = document.getElementById('app-summits');
const $ = (s) => root.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (() => { let s = 7; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
const NN = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const noteName = (m) => NN[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

// ---------------------------------------------------------------- the two worlds
const WORLDS = {
  himalaya: {
    name: 'HIMALAYA', place: 'A deodar forest under the snow peaks', root: 50, scale: [0, 2, 3, 5, 7, 9, 10], keyName: 'D dorian',
    blurb: 'Moonlight falls into a Himalayan forest, and whatever it touches wakes into sound. Walk toward it and touch the cedars, the rhododendrons, the prayer flags, the chorten and its wheels, the mani stones, the river and the peaks. Every touch lands on a sixteen-step loop and keeps playing. Walk away and it drifts into the distance. Where you stand is the mix.',
    lanes: [['firefly', 'FIREFLY', 'They drift: catch them', 'tingsha'], ['deodar', 'DEODAR', 'Cedar trunks and boughs, tall trees low', 'wood'], ['rhodo', 'RHODODENDRON', 'Each flowering bush a note', 'pluck'], ['flags', 'PRAYER FLAGS', 'Strings between the trees', 'chimes'],
      ['wheel', 'PRAYER WHEEL', 'Round the chorten', 'spin + bowl'], ['chorten', 'CHORTEN', 'The white stupa', 'singing bowl'], ['mani', 'MANI STONE', 'Pebbles high, boulders low', 'stone'], ['river', 'RIVER', 'Water and the falls', 'water'],
      ['peak', 'PEAK', 'The snow peaks far away', 'dungchen horn'], ['pine', 'PINE', 'Tall and straight, a small crown high up', 'wooden flute'], ['oldtree', 'OLD TREE', 'Thick and gnarled', 'low bowed tone'], ['log', 'LOG', 'Whole fallen trunks and stumps', 'log drum'], ['mushroom', 'MUSHROOM', 'Each cluster a note', 'kalimba'], ['fern', 'FERN', 'Bracken on the floor', 'whisper'], ['canopy', 'CANOPY', 'The high leaves between the crowns', 'breath pad'],
      ['snag', 'BARE PINE', 'Tall dead pines, a few needles left', 'bowed wood'], ['birch', 'BIRCH', 'Tall, full of leaves', 'leaf pad'], ['stone', 'STONE', 'Pebbles high, boulders low', 'clack'], ['flower', 'BLUE POPPY', 'Wildflower patches', 'celesta'], ['stick', 'STICK', 'Fallen branches', 'crack'], ['grass', 'GRASS', 'Tall grass patches', 'brush'],
      ['cairn', 'SACRED CAIRN', 'A ring of standing stones', 'deep bowl'], ['lamp', 'BUTTER LAMP', 'Flames at the cairn', 'temple bell'], ['bird', 'BIRD', 'They circle the canopy', 'birdsong'], ['insect', 'INSECT', 'Moths and crickets near the ground', 'chirp'],
      ['moss', 'MOSS', 'Underfoot, every patch a different note', 'mallet'], ['moon', 'MOONBEAM', 'The light, strikes distant thunder', 'bell + thunder']],
    palettes: { DUSK: { sky: 0x05080f, fog: 0x070b14, ground: 0x2e4230, leaf: 0x3f7048, trunk: 0x5a4030, snow: 0xeef3fa, stone: 0x8a8d92, light: 0xc8dcff }, DAWN: { sky: 0x120a10, fog: 0x180d14, ground: 0x2a3322, leaf: 0x3d5a34, trunk: 0x4a3326, snow: 0xffe6d6, stone: 0x8a8580, light: 0xffc9a8 }, MONSOON: { sky: 0x050c09, fog: 0x08120d, ground: 0x1f3a22, leaf: 0x2f6a38, trunk: 0x2f2419, snow: 0xc9d3d6, stone: 0x5a6660, light: 0xd8ffe8 } },
  }
};
const LIGHT_COLS = [['White', 0xffffff], ['Amber', 0xffc070], ['Moss', 0xb8ff9a], ['Moon', 0xbcd2ff], ['Rose', 0xffa8c8], ['Cyan', 0x8ff3ff], ['Violet', 0xc8a8ff], ['Ember', 0xff7a4a]];
const S = { storm: true, world: 'himalaya', palette: null, light: 0, fog: 1, amb: true, bpm: 66, keyShift: 0, bank: 0, playing: false, metro: false, started: false };

// ---------------------------------------------------------------- markup (English only)
root.innerHTML = `
<canvas id="smGl"></canvas>
<div id="smCross"></div><div id="smAim" class="sm-mono"></div>
<div id="smTL" class="sm-mono"><b id="smTitle">SUMMITS</b><span id="smPlace"></span><span>A BODYBEAT PAGE</span></div>
<div id="smHud" class="sm-mono"><div><span>TEMPO</span><b><button id="smSlow" title="Slower">−</button><i id="smBpm">66 BPM</i><button id="smFast" title="Faster">+</button></b></div><div><span>KEY</span><b><button id="smKDn" title="Key down">−</button><i id="smKey"></i><button id="smKUp" title="Key up">+</button></b></div>
  <div><span>STEP</span><b id="smStep">01 / 16</b></div><div><span>HITS</span><b id="smHits">0</b></div><div><span>POSITION</span><b id="smPos"></b></div><div><span>TRANSPORT</span><b id="smTr">stopped</b></div><div><span>BANK</span><b id="smBank">1</b></div></div>
<div id="smSet" class="sm-mono">
  <div><span>PALETTE · C</span><div class="sm-seg" id="smPal"></div></div>
  <div><span>LIGHT · L</span><div id="smLights"></div></div>
  <div><span>FOG · G</span><div class="sm-seg" id="smFog"><button data-f="0">Off</button><button data-f="1">Light</button><button data-f="2">Thick</button></div></div>
  <div><span>STORM · K</span><div class="sm-seg" id="smStorm"><button data-k="1">On</button><button data-k="0">Off</button></div></div>
  <div><span>AMBIENCE · N</span><div class="sm-seg" id="smAmb"><button data-a="1">On</button><button data-a="0">Off</button></div></div>
  <div><span>METRONOME · T</span><div class="sm-seg" id="smMet"><button data-m="1">On</button><button data-m="0">Off</button></div></div>
  <div><span>RECORD</span><div class="sm-seg"><button id="smRecV" title="Record a video of the world with its sound · R">Video</button><button id="smRecA" title="Record what you hear as a WAV · Shift + R">Audio</button></div></div>
  <div><span>SESSION</span><div class="sm-seg"><button id="smSave" title="Save everything as a .summit file · Ctrl + S">Save</button><button id="smOpen" title="Open a .summit file · Ctrl + O · or drop one on the page">Open</button><button id="smMidi" title="Save this bank's loop as a MIDI file, every lane on its own track, in key">MIDI</button></div></div>
</div>
<div id="smKeys" class="sm-mono"><b>WALK TOWARD THE LIGHT</b>
  <div><i>W A S D</i>move</div><div><i>SHIFT</i>jog</div><div><i>SPACE</i>jump</div><div><i>MOUSE</i>look (click to grab the mouse)</div><div><i>ESC</i>release the mouse</div>
  <div><i>CLICK</i>play what you aim at</div><div><i>F</i>same, from the keyboard</div><div><i>RIGHT-CLICK</i>aim closer</div><div><i>SHIFT + CLICK</i>take it out of the loop</div><div><i>ENTER</i>play / stop the loop</div><div><i>I</i>inventory</div><div><i>1 · 2</i>banks</div><div><i>H</i>hide this</div></div>
<div id="smInv" class="sm-mono"><div class="sm-ph"><b>INVENTORY · BANK <span id="smInvBank">1</span></b><button id="smInvX">✕</button></div><div id="smLanes"></div></div>
<div id="smIntro"><div class="sm-card"><h1 id="smIntroT">SUMMITS</h1><p id="smBlurb" class="sm-mono"></p><div id="smList" class="sm-mono"></div><button id="smEnter">Enter</button></div></div>
<div id="smToast" class="sm-mono"></div><input type="file" id="smFile" accept=".summit,application/json" hidden>`;
const toast = (t) => { const el = $('#smToast'); el.textContent = t; el.classList.add('in'); clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove('in'), 2400); };

// ---------------------------------------------------------------- renderer + scene
const canvas = $('#smGl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'default' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
scene.fog = new THREE.FogExp2(0x101826, 0.018);
const hemi = new THREE.HemisphereLight(0xbfd6ff, 0x1a1a10, 0.5); scene.add(hemi);
const moonL = new THREE.DirectionalLight(0xbfd6ff, 0.8); moonL.position.set(-30, 60, -20); scene.add(moonL);
let world = new THREE.Group(); scene.add(world);
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.5, 0.2); composer.addPass(bloom); composer.addPass(new OutputPass());
let bugs = null, bugPts = null, els = [], picks = [], H = () => 0, beam = null, beamLight = null, movers = [], fireflies = null, ff = null, flagsAnim = [], pal = null, bounds = 55;
const mat = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
function addEl(type, obj, pos, note, radius = 1) { const i = els.length; els.push({ type, obj, pos: pos.clone(), note, radius, hits: 0 }); if (obj) { obj.userData.el = i; picks.push(obj); } return i; }
function noteFor(degree, octave = 0) { const sc = WORLDS[S.world].scale, d = ((degree % sc.length) + sc.length) % sc.length, o = Math.floor(degree / sc.length); return WORLDS[S.world].root + sc[d] + 12 * (o + octave); }   // the key shift is added when a note sounds
function terrain(size, seg, hfn, color) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, hfn(p.getX(i), p.getZ(i))); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat(color)); return m;
}
const n2 = (x, z) => Math.sin(x * 0.13) * Math.cos(z * 0.11) + 0.5 * Math.sin(x * 0.31 + z * 0.23) + 0.25 * Math.cos(x * 0.57 - z * 0.47);

function buildHimalaya(p) {
  H = (x, z) => 0.12 * Math.max(0, -z - 10) + 1.4 * n2(x, z) - 3.2 * Math.exp(-((z - 24) ** 2) / 30) + 0.04 * Math.max(0, z - 30) * 6;   // rising to the north, a river valley to the south
  const ground = terrain(160, 120, H, p.ground); world.add(ground); addEl('moss', ground, new THREE.Vector3(), 0, 0); ground.userData.ground = true;
  // snow peaks far to the north
  for (let i = 0; i < 6; i++) { const h = 70 + rand() * 50, g = new THREE.ConeGeometry(28 + rand() * 18, h, 7), m = new THREE.Mesh(g, mat(p.snow)); m.position.set(-120 + i * 48 + rand() * 20, h / 2 - 8, -150 - rand() * 40); world.add(m); addEl('peak', m, m.position.clone().setY(30), noteFor(i % 3, -1), 30);
    const rock = new THREE.Mesh(new THREE.ConeGeometry(30 + rand() * 18, h * 0.55, 7), mat(p.stone)); rock.position.set(m.position.x + 6, h * 0.27 - 10, m.position.z + 12); world.add(rock); }
  // deodar cedars: trunk + three tiers
  const NT = 40, trunkG = new THREE.CylinderGeometry(0.25, 0.45, 1, 6), coneG = new THREE.ConeGeometry(1, 1, 7);
  const trunks = new THREE.InstancedMesh(trunkG, mat(p.trunk), NT), tiers = new THREE.InstancedMesh(coneG, mat(p.leaf), NT * 3); const M = new THREE.Matrix4();
  for (let i = 0; i < NT; i++) {
    let x, z; do { x = (rand() - 0.5) * 100; z = (rand() - 0.5) * 100; } while (Math.hypot(x, z - 4) < 9 || Math.abs(z - 24) < 4);
    const y = H(x, z), h = 7 + rand() * 9; M.compose(new THREE.Vector3(x, y + h * 0.3, z), new THREE.Quaternion(), new THREE.Vector3(1, h * 0.6, 1)); trunks.setMatrixAt(i, M);
    for (let k = 0; k < 3; k++) { const r = (2.6 - k * 0.7) * (h / 12), th = h * (0.42 - k * 0.07); M.compose(new THREE.Vector3(x, y + h * (0.42 + k * 0.2), z), new THREE.Quaternion(), new THREE.Vector3(r, th, r)); tiers.setMatrixAt(i * 3 + k, M); }
    addEl('deodar', null, new THREE.Vector3(x, y + h * 0.5, z), noteFor(Math.round((16 - h) / 2)), 2.5);
  }
  trunks.userData.inst = (id) => elBase.deodar + id; tiers.userData.inst = (id) => elBase.deodar + Math.floor(id / 3); world.add(trunks, tiers); picks.push(trunks, tiers);
  // rhododendron bushes with red and pink flowers
  const NB = 16, bushG = new THREE.IcosahedronGeometry(1, 0), bush = new THREE.InstancedMesh(bushG, mat(p.leaf), NB), flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.22, 0), new THREE.MeshLambertMaterial({ color: 0xd8334a, emissive: 0x401018 }), NB * 6);
  for (let i = 0; i < NB; i++) { const x = (rand() - 0.5) * 90, z = (rand() - 0.5) * 80, y = H(x, z), s = 0.9 + rand() * 0.9; M.compose(new THREE.Vector3(x, y + s * 0.6, z), new THREE.Quaternion(), new THREE.Vector3(s * 1.3, s, s * 1.3)); bush.setMatrixAt(i, M);
    for (let k = 0; k < 6; k++) { const a = rand() * 6.28, b = rand() * 1.2; M.compose(new THREE.Vector3(x + Math.cos(a) * s * 1.1 * Math.cos(b), y + s * 0.6 + Math.sin(b) * s * 0.8, z + Math.sin(a) * s * 1.1 * Math.cos(b)), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)); flowers.setMatrixAt(i * 6 + k, M); flowers.setColorAt(i * 6 + k, new THREE.Color(rand() < 0.5 ? 0xd8334a : 0xf06aa0)); }
    addEl('rhodo', null, new THREE.Vector3(x, y + s * 0.6, z), noteFor(i % 7, 1), 1.5); }
  bush.userData.inst = (id) => elBase.rhodo + id; flowers.userData.inst = (id) => elBase.rhodo + Math.floor(id / 6); world.add(bush, flowers); picks.push(bush, flowers);
  // the chorten (white stupa) in a clearing, prayer wheels round it
  const ch = new THREE.Group(), white = mat(0xf2efe8), gold = mat(0xd8a640, { emissive: 0x2a1a00 }); const cy = H(0, 4);
  const base = new THREE.Mesh(new THREE.BoxGeometry(5, 1.4, 5), white); base.position.y = 0.7; const step = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1, 3.8), white); step.position.y = 1.9;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), white); dome.position.y = 2.4; const box = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 1), gold); box.position.y = 4.5;
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3, 10), gold); spire.position.y = 6.4; ch.add(base, step, dome, box, spire); ch.position.set(0, cy, 4); world.add(ch);
  for (const m of [base, step, dome, box, spire]) { m.userData.el = els.length; picks.push(m); } addEl('chorten', null, new THREE.Vector3(0, cy + 3, 4), noteFor(0), 3);
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 10), gold); w.position.set(Math.cos(a) * 3.6, cy + 0.6, 4 + Math.sin(a) * 3.6); world.add(w); movers.push({ m: w, spin: 0.4 + rand() }); addEl('wheel', w, w.position, noteFor(i, 0), 0.6); }
  // prayer flags strung from the chorten to the trees
  const flagCols = [0x2f6fd6, 0xf2f2f2, 0xd6342f, 0x2e9e55, 0xf2c230];
  for (let s = 0; s < 6; s++) {
    const a = s / 6 * Math.PI * 2 + 0.3, end = new THREE.Vector3(Math.cos(a) * 16, 0, 4 + Math.sin(a) * 16); end.y = H(end.x, end.z) + 7; const start = new THREE.Vector3(0, cy + 7.5, 4), n = 14;
    const pts = []; for (let k = 0; k <= n; k++) { const t = k / n, q = start.clone().lerp(end, t); q.y -= Math.sin(t * Math.PI) * 1.6; pts.push(q); }
    world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8a8070 })));
    const string = new THREE.Group(); world.add(string);
    for (let k = 1; k < n; k++) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.7), new THREE.MeshLambertMaterial({ color: flagCols[k % 5], side: THREE.DoubleSide, emissive: flagCols[k % 5], emissiveIntensity: 0.12 })); f.position.copy(pts[k]).add(new THREE.Vector3(0, -0.38, 0)); f.lookAt(f.position.clone().add(new THREE.Vector3(-(end.z - start.z), 0, end.x - start.x))); string.add(f); f.userData.el = els.length; picks.push(f); flagsAnim.push(f); }
    addEl('flags', null, pts[n >> 1], noteFor(s), 4);
  }
  // mani stones: carved stones in piles; small ones high, boulders low
  const NS = 36, stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mat(p.stone), NS);
  for (let i = 0; i < NS; i++) { const a = rand() * 6.28, r = 6 + rand() * 30, x = Math.cos(a) * r, z = 4 + Math.sin(a) * r * 0.9, s = 0.25 + Math.pow(rand(), 2) * 1.6; M.compose(new THREE.Vector3(x, H(x, z) + s * 0.6, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(), rand(), rand())), new THREE.Vector3(s * 1.3, s * 0.8, s)); stones.setMatrixAt(i, M);
    addEl('mani', null, new THREE.Vector3(x, H(x, z) + s * 0.6, z), noteFor(Math.round(8 - s * 5), 0), Math.max(0.6, s)); }
  stones.userData.inst = (id) => elBase.mani + id; world.add(stones); picks.push(stones);
  // the river and its falls
  const riverG = new THREE.PlaneGeometry(160, 5, 80, 1); riverG.rotateX(-Math.PI / 2); const rp = riverG.attributes.position; for (let i = 0; i < rp.count; i++) { const x = rp.getX(i), z = rp.getZ(i) + 24; rp.setZ(i, z + Math.sin(x * 0.06) * 3); rp.setY(i, H(x, z) + 0.35); }
  const river = new THREE.Mesh(riverG, new THREE.MeshLambertMaterial({ color: 0x5f8fb4, emissive: 0x0d2030, transparent: true, opacity: 0.85 })); world.add(river);
  const falls = new THREE.Mesh(new THREE.PlaneGeometry(4, 14), new THREE.MeshLambertMaterial({ color: 0xcfe6f5, emissive: 0x233a48, transparent: true, opacity: 0.8, side: THREE.DoubleSide })); falls.position.set(-46, H(-46, 22) + 7, 21); falls.rotation.y = 0.3; world.add(falls);
  for (let k = 0; k < 6; k++) { const x = -40 + k * 16; addEl('river', k ? null : river, new THREE.Vector3(x, H(x, 24) + 0.4, 24 + Math.sin(x * 0.06) * 3), noteFor(k + 2, 1), 3); }
  river.userData.nearest = true; falls.userData.nearest = true; picks.push(falls);
  // fireflies
  const NF = 70, fp = new Float32Array(NF * 3); ff = Array.from({ length: NF }, () => { const x = (rand() - 0.5) * 70, z = (rand() - 0.5) * 70; return { x, z, y: H(x, z) + 1 + rand() * 3, ph: rand() * 6.28 }; });
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  fireflies = new THREE.Points(fg, new THREE.PointsMaterial({ opacity: 0.55, map: (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, '#fff'); r.addColorStop(0.35, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })(), color: 0xe8ff9a, size: 0.32, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })); fireflies.userData.keepSolid = true; world.add(fireflies);
  ff.forEach((f, i) => addEl('firefly', null, new THREE.Vector3(f.x, f.y, f.z), noteFor(i % 7, 1), 0.9));
  // ---- more of the forest: bare pines, leafy birches, stones, wildflowers, fallen sticks, grass
  const free = (r) => { let x, z, n = 0; do { x = (rand() - 0.5) * 110; z = (rand() - 0.5) * 100; n++; } while ((Math.hypot(x, z - 4) < r || Math.abs(z - 24) < 4) && n < 50); return [x, z]; };
  const place = (type, count, geo, sizeFn, noteFn) => {
    const im = new THREE.InstancedMesh(geo, mat(0x333333), count), Mx = new THREE.Matrix4();
    for (let i = 0; i < count; i++) { const [x, z] = free(7), y = H(x, z), sz = sizeFn(); Mx.compose(new THREE.Vector3(x, y + sz.y / 2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 6.283, sz.lie ? Math.PI / 2 : 0)), new THREE.Vector3(sz.x, sz.y, sz.z)); im.setMatrixAt(i, Mx); addEl(type, null, new THREE.Vector3(x, y + (sz.lie ? 0.2 : sz.y / 2), z), noteFn(i, sz), Math.max(0.8, sz.x)); }
    im.userData.inst = (id) => elBase[type] + id; world.add(im); picks.push(im); return im;
  };
  place('snag', 12, new THREE.CylinderGeometry(0.4, 0.5, 1, 6), () => ({ x: 1, y: 14 + rand() * 8, z: 1 }), (i) => noteFor(i % 4, -1));
  place('birch', 14, new THREE.CylinderGeometry(1.6, 1.6, 1, 8), () => ({ x: 1, y: 12 + rand() * 6, z: 1 }), (i) => noteFor((i * 2) % 7));
  place('stone', 110, new THREE.DodecahedronGeometry(1, 0), () => { const s = 0.2 + Math.pow(rand(), 2.2) * 1.4; return { x: s * 1.3, y: s * 0.8, z: s }; }, (i, sz) => noteFor(Math.round(9 - sz.x * 4), 0));
  place('flower', 70, new THREE.CylinderGeometry(1.2, 1.2, 0.4, 8), () => ({ x: 1, y: 0.4, z: 1 }), (i) => noteFor(i % 7, 2));
  place('stick', 80, new THREE.BoxGeometry(0.16, 1, 0.16), () => ({ x: 1, y: 1.5 + rand() * 2.5, z: 1, lie: true }), (i) => noteFor((i * 3) % 7, 1));
  place('grass', 18, new THREE.CylinderGeometry(1.4, 1.4, 0.8, 8), () => ({ x: 1, y: 0.8, z: 1 }), (i) => noteFor(i % 7, 0));
  // ---- an open forest: tall pines, a few old trees, fallen logs and stumps, mushrooms, ferns
  place('pine', 40, new THREE.CylinderGeometry(0.4, 0.5, 1, 6), () => ({ x: 1, y: 18 + rand() * 10, z: 1 }), (i) => noteFor(i % 7, 0));
  place('oldtree', 8, new THREE.CylinderGeometry(1.2, 1.4, 1, 8), () => ({ x: 1, y: 11 + rand() * 4, z: 1 }), (i) => noteFor(i % 4, -1));
  place('log', 18, new THREE.BoxGeometry(0.9, 1, 0.9), () => ({ x: 1, y: 3 + rand() * 4, z: 1, lie: true }), (i) => noteFor(i % 5, -1));
  place('mushroom', 30, new THREE.CylinderGeometry(0.6, 0.6, 0.4, 8), () => ({ x: 1, y: 0.4, z: 1 }), (i) => noteFor(i % 7, 1));
  place('fern', 60, new THREE.CylinderGeometry(1.1, 1.1, 0.7, 8), () => ({ x: 1, y: 0.7, z: 1 }), (i) => noteFor(i % 7, 0));
  { const cm = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1.4, 8), mat(0x333333), 28), Mx = new THREE.Matrix4();
    for (let i = 0; i < 28; i++) { const [x, z] = free(6), r = 4 + rand() * 3.5, y = H(x, z) + 17 + rand() * 7; Mx.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(r, 1, r)); cm.setMatrixAt(i, Mx); addEl('canopy', null, new THREE.Vector3(x, y, z), noteFor(i % 7, 1), r); }
    cm.userData.inst = (id) => elBase.canopy + id; world.add(cm); picks.push(cm); }
  // ---- the sacred place: a cairn in a ring of standing stones, butter lamps burning, by the grove under the moonbeam
  const sx = 16, sz = -6, sy = H(sx, sz), cairnMat = mat(0x6d6a66);
  for (let k = 0; k < 7; k++) { const r = 1.3 - k * 0.15, st = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), cairnMat); st.position.set(sx + (rand() - 0.5) * 0.2, sy + 0.5 + k * 0.62, sz + (rand() - 0.5) * 0.2); st.scale.y = 0.55; st.userData.el = els.length; world.add(st); picks.push(st); }
  addEl('cairn', null, new THREE.Vector3(sx, sy + 2.5, sz), noteFor(0, -1), 2);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, x = sx + Math.cos(a) * 6, z = sz + Math.sin(a) * 6, h = 1.6 + rand() * 1.2, st = new THREE.Mesh(new THREE.BoxGeometry(0.6, h, 0.4), cairnMat); st.position.set(x, H(x, z) + h / 2, z); st.rotation.y = -a; st.userData.el = els.length; world.add(st); picks.push(st); addEl('cairn', null, st.position.clone(), noteFor(k % 5, -1), 1); }
  for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2 + 0.2, x = sx + Math.cos(a) * 2.4, z = sz + Math.sin(a) * 2.4, lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffb04a })); lamp.position.set(x, H(x, z) + 0.25, z); lamp.userData.el = els.length; lamp.userData.kind = 'flame'; world.add(lamp); picks.push(lamp); addEl('lamp', null, lamp.position.clone(), noteFor([0, 2, 4, 7, 9][k % 5], 1), 0.6); }
  // ---- birds circling over the canopy
  for (let i = 0; i < 9; i++) { const g = new THREE.Group(), bm = mat(0x9aa0a8), body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.5), bm), w1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.22), bm), w2 = w1.clone(); w1.position.x = 0.4; w2.position.x = -0.4; g.add(body, w1, w2);
    const cx = (rand() - 0.5) * 60, cz = (rand() - 0.5) * 60; g.position.set(cx, 16, cz); world.add(g); const ix = addEl('bird', null, g.position.clone(), noteFor(i % 7, 2), 1.5);
    g.traverse((o) => { if (o.isMesh) { o.userData.el = ix; o.userData.kind = 'wool'; picks.push(o); } }); movers.push({ m: g, el: ix, fly: { cx, cz, r: 8 + rand() * 14, h: 14 + rand() * 6, a: rand() * 6.28, sp: 0.15 + rand() * 0.2, w1, w2 } }); }
  // ---- insects: moths and crickets low over the ground
  { const NI = 50, ip = new Float32Array(NI * 3); bugs = Array.from({ length: NI }, () => { const x = (rand() - 0.5) * 70, z = (rand() - 0.5) * 70; return { x, z, y: H(x, z) + 0.2 + rand() * 0.6, ph: rand() * 6.28 }; });
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(ip, 3));
    bugPts = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0xffe9b0, size: 0.09, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })); bugPts.userData.keepSolid = true; world.add(bugPts);
    bugs.forEach((b, i) => addEl('insect', null, new THREE.Vector3(b.x, b.y, b.z), noteFor(i % 7, 2), 0.6)); }
  addBeam(new THREE.Vector3(8, H(8, -12), -12), 'moon');
}
function addBeam(at, type) {
  const g = new THREE.CylinderGeometry(0.35, 1.6, 90, 24, 1, true); g.translate(0, 45, 0);
  beam = new THREE.Mesh(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { color: { value: new THREE.Color(1, 1, 1) }, opacity: { value: 0.05 } },
    vertexShader: 'varying float vF; varying float vH; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * normal); vF = abs(dot(n, normalize(-mv.xyz))); vH = position.y / 90.0; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 color; uniform float opacity; varying float vF; varying float vH; void main(){ float a = pow(vF, 2.5) * (1.0 - smoothstep(0.15, 1.0, vH)) * opacity * 7.0; gl_FragColor = vec4(color * a, 1.0); }' }));
  beam.material.color = beam.material.uniforms.color.value; Object.defineProperty(beam.material, 'opacity', { get() { return this.uniforms.opacity.value; }, set(v) { this.uniforms.opacity.value = v; } }); beam.position.copy(at); world.add(beam);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(5, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.04, blending: THREE.AdditiveBlending, depthWrite: false })); pool.rotation.x = -Math.PI / 2; pool.position.copy(at).add(new THREE.Vector3(0, 0.12, 0)); world.add(pool); beam.userData.pool = pool;
  beamLight = new THREE.PointLight(0xffffff, 3, 40, 1.4); beamLight.position.copy(at).add(new THREE.Vector3(0, 6, 0)); world.add(beamLight);
  addEl(type, beam, at.clone().setY(at.y + 3), noteFor(0, 0), 4);
}
const elBase = {};
// ---------------------------------------------------------------- the world as light: every surface becomes glowing Gaussian points
const GW = 1024, glowArr = new Float32Array(GW), glowBytes = new Uint8Array(GW * 4), elGlowTex = new THREE.DataTexture(glowBytes, GW, 1, THREE.RGBAFormat); elGlowTex.needsUpdate = true;
const ptsUniforms = { uTime: { value: 0 }, uScale: { value: 400 }, uGlow: { value: elGlowTex }, uGlowW: { value: GW }, uBase: { value: 0.38 }, uFog: { value: 0.012 }, uFlash: { value: 0 }, uWaveC: { value: new THREE.Vector3(0, -999, 0) }, uWaveR: { value: 0 }, uWaveA: { value: 0 }, uWaveCol: { value: new THREE.Color(1, 1, 1) },
  uTouch: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, -999, 0, 0)) }, uTouchCol: { value: Array.from({ length: 4 }, () => new THREE.Color(1, 1, 1)) }, uTouchR: { value: [4, 4, 4, 4] } };
const ptsMat = new THREE.ShaderMaterial({ uniforms: ptsUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `attribute vec3 color; attribute float size; attribute float el; attribute float seed; attribute float sway; attribute float mode; attribute float lit;
    uniform float uTime, uScale, uGlowW, uBase, uFog, uWaveR, uWaveA, uFlash; uniform vec3 uWaveC, uWaveCol; uniform vec4 uTouch[4]; uniform vec3 uTouchCol[4]; uniform float uTouchR[4]; uniform sampler2D uGlow; varying vec3 vCol;
    void main(){
      vec3 p = position;
      p.x += sin(uTime * 1.3 + p.z * 0.35 + seed * 6.0) * 0.09 * sway; p.z += cos(uTime * 1.1 + p.x * 0.3 + seed * 5.0) * 0.06 * sway;   // wind in grass and boughs
      if (mode > 2.5) p.y -= mod(uTime * 0.35 + seed * 18.0, 18.0);                                                                       // dust drifting down a shaft of moonlight
      else if (mode > 1.5) p.y -= mod(uTime * 3.2 + seed * 14.0, 14.0);                                                                       // the falls
      vec4 mv = modelViewMatrix * vec4(p, 1.0); float d = max(0.1, -mv.z);
      float g = el < 0.0 ? 0.0 : texture2D(uGlow, vec2((el + 0.5) / uGlowW, 0.5)).r;
      float tw = 0.78 + 0.22 * sin(uTime * (0.5 + seed * 1.6) + seed * 40.0);
      if (mode > 2.5) tw = 0.5 + 0.5 * sin(uTime * 2.0 + seed * 30.0);
      if (mode > 0.5 && mode < 1.5) tw = 0.35 + 1.4 * pow(0.5 + 0.5 * sin(p.x * 0.9 - uTime * 3.5 + seed * 3.0), 6.0);                 // glints running down the river
      float fog = exp(-uFog * uFog * d * d);
      vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
      float wave = uWaveA * exp(-pow((distance(wp, uWaveC) - uWaveR) / 2.2, 2.0));
      vec3 after = vec3(0.0);
      for (int i = 0; i < 4; i++) { float dd = distance(wp, uTouch[i].xyz); float rr = uTouchR[i]; after += uTouchCol[i] * uTouch[i].w * exp(-dd * dd / (rr * rr * 0.5)); }
      float sacred = step(1.0, lit) * (0.6 + 0.4 * sin(uTime * 0.7 + seed * 2.0));
      vCol = (vec3(0.05, 0.045, 0.02) * sacred + color * (uBase * tw * lit + g * 4.0 + wave * 1.2 + uFlash * (0.35 + sacred * 0.9) + sacred * 1.1) + uWaveCol * wave * 0.35 + after * 0.55 + vec3(0.3, 0.35, 0.5) * uFlash * 0.03) * mix(fog, 1.0, uFlash * 0.15);   // lightning lights the whole forest
      gl_PointSize = clamp(size * uScale * (1.0 + g * 0.8 + wave * 0.5) / d, 1.0, 26.0); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `varying vec3 vCol; void main(){ vec2 c = gl_PointCoord - 0.5; float a = exp(-dot(c, c) * 16.0); if (a < 0.03) discard; gl_FragColor = vec4(vCol * a, 1.0); }` });
function triArea(g) { const p = g.attributes.position, ix = g.index, n = ix ? ix.count : p.count, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(); let A = 0; for (let i = 0; i < n; i += 3) { const i0 = ix ? ix.getX(i) : i, i1 = ix ? ix.getX(i + 1) : i + 1, i2 = ix ? ix.getX(i + 2) : i + 2; a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2); A += b.sub(a).cross(c.sub(a)).length() / 2; } return A; }
const hsl = (h, s, l) => new THREE.Color().setHSL(h, s, l);
// ---- organic growers: plants are built as points, the way they grow, not sampled off simple shapes
function growDeodar(A, x, y, z, h, el) {
  const lean = (Math.random() - 0.5) * 0.08, tiers = 7 + Math.floor(h / 2.5);
  for (let i = 0; i < h * 30; i++) { const t = Math.random(), r = 0.18 * (1 - t * 0.8); const a = Math.random() * 6.283; A.add(x + Math.cos(a) * r + lean * t * h, y + t * h, z + Math.sin(a) * r, hsl(0.07, 0.2, 0.1 + Math.random() * 0.07), 0.05, el, 0); }   // trunk
  for (let k = 0; k < tiers; k++) {                          // drooping boughs, wide at the bottom, short at the top
    const ty = y + h * (0.22 + 0.76 * k / tiers), reach = (1 - k / tiers) * h * 0.32 + 0.5, nb = 6 + Math.floor(Math.random() * 4);
    for (let b = 0; b < nb; b++) {
      const a = (b / nb) * 6.283 + Math.random() * 0.6 + k, len = reach * (0.7 + Math.random() * 0.5);
      for (let s = 0; s < len * 9; s++) {
        const u = s / (len * 9), bx = Math.cos(a) * u * len, bz = Math.sin(a) * u * len, by = -u * u * len * 0.35 + Math.sin(u * 3) * 0.05;
        const n = u > 0.4 ? 2 : 1;
        for (let q = 0; q < n; q++) { const sp = 0.12 + u * 0.35; A.add(x + lean * (ty - y) + bx + (Math.random() - 0.5) * sp, ty + by + (Math.random() - 0.5) * sp * 0.6, z + bz + (Math.random() - 0.5) * sp, hsl(0.27 + Math.random() * 0.06, 0.22 + Math.random() * 0.12, 0.08 + u * 0.12 + Math.random() * 0.05), 0.065, el, 0.25 + u * 0.75); }
      }
    }
  }
}
function growBush(A, x, y, z, s, el, flowers) {
  const n = Math.round(380 * s * s);
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, u = Math.random() * 2 - 1, r = Math.pow(Math.random(), 0.45) * s * (1 + 0.25 * Math.sin(a * 3 + u * 2)), q = Math.sqrt(1 - u * u);
    A.add(x + Math.cos(a) * q * r * 1.3, y + Math.max(-0.1, u * r * 0.8) + s * 0.55, z + Math.sin(a) * q * r * 1.3, hsl(0.31, 0.25, 0.07 + Math.random() * 0.08), 0.06, el, 0.4); }
  for (let f = 0; f < flowers; f++) { const a = Math.random() * 6.283, b = Math.random() * 1.1, fx = x + Math.cos(a) * s * 1.15 * Math.cos(b), fy = y + s * 0.6 + Math.sin(b) * s * 0.75, fz = z + Math.sin(a) * s * 1.15 * Math.cos(b), col = Math.random() < 0.5 ? hsl(0.98, 0.75, 0.5) : hsl(0.92, 0.6, 0.62);
    for (let i = 0; i < 26; i++) A.add(fx + (Math.random() - 0.5) * 0.28, fy + (Math.random() - 0.5) * 0.22, fz + (Math.random() - 0.5) * 0.28, col, 0.07, el, 0.4); }
}
function growBlades(A, x, y, z, n, hgt, col, el, spread = 0.35) {
  for (let b = 0; b < n; b++) { const a = Math.random() * 6.283, bend = 0.2 + Math.random() * 0.5, bh = hgt * (0.6 + Math.random() * 0.6), ox = x + Math.cos(a) * Math.random() * spread, oz = z + Math.sin(a) * Math.random() * spread;
    for (let s = 0; s < 9; s++) { const t = s / 8; A.add(ox + Math.cos(a) * bend * t * t * bh, y + t * bh, oz + Math.sin(a) * bend * t * t * bh, col.clone().multiplyScalar(0.55 + t * 0.6), 0.04, el, t); } }
}
const KIND = { foliage: [1.2, 0.07], trunk: [0.9, 0.06], stone: [0.7, 0.07], snow: [0.9, 0.3], flower: [1.6, 0.07], flag: [1.3, 0.07], water: [1.0, 0.07], build: [0.75, 0.07], wool: [1.0, 0.07], cloud: [0.32, 0.22], peak: [0.75, 0.32], grassy: [1.1, 0.05], gold: [1.4, 0.06], white: [0.9, 0.07] };
// what each thing is made of decides how it glows
function kindOf(o) {
  if (o.userData.kind) return o.userData.kind;
  const g = o.geometry?.type || '', el = o.isInstancedMesh ? (o.userData.inst ? els[o.userData.inst(0)] : null) : els[o.userData.el], t = el?.type;
  if (t === 'deodar') return g.startsWith('Cylinder') ? 'trunk' : 'foliage';
  if (t === 'rhodo') return o.geometry?.parameters?.radius < 0.5 ? 'flower' : 'foliage';
  if (t === 'ichu' || t === 'huayna') return t === 'ichu' ? 'grassy' : 'peak';
  return { stone: 'stone', flags: 'flag', mani: 'stone', peak: 'snow', river: 'water', llama: 'wool', cloud: 'cloud', wheel: 'gold', chorten: 'white', sunstone: 'white', terrace: 'stone', wall: 'stone', condor: 'build' }[t] || 'build';
}
function growSnag(A, x, y, z, h, el) {                      // a tall bare pine: crooked trunk, a few dead branches, sparse needles at the top
  const lean = (Math.random() - 0.5) * 0.12;
  for (let i = 0; i < h * 26; i++) { const t = Math.random(), a = Math.random() * 6.283, r = 0.16 * (1 - t * 0.7); A.add(x + Math.cos(a) * r + lean * t * h + Math.sin(t * 9) * 0.08, y + t * h, z + Math.sin(a) * r, hsl(0.08, 0.15, 0.09 + Math.random() * 0.07), 0.05, el, 0); }
  for (let b = 0; b < 7; b++) { const by = y + h * (0.45 + Math.random() * 0.5), a = Math.random() * 6.283, len = 1 + Math.random() * 2.5;
    for (let s = 0; s < len * 12; s++) { const u = s / (len * 12); A.add(x + lean * (by - y) + Math.cos(a) * u * len, by + u * len * 0.35 * (Math.random() < 0.5 ? 1 : -0.3), z + Math.sin(a) * u * len, hsl(0.08, 0.12, 0.09), 0.04, el, u * 0.4); }
    if (Math.random() < 0.45) for (let q = 0; q < 26; q++) A.add(x + lean * (by - y) + Math.cos(a) * len + (Math.random() - 0.5) * 0.7, by + len * 0.3 + (Math.random() - 0.5) * 0.5, z + Math.sin(a) * len + (Math.random() - 0.5) * 0.7, hsl(0.27, 0.25, 0.12 + Math.random() * 0.06), 0.06, el, 0.8); }
}
function growBirch(A, x, y, z, h, el) {                     // a birch: slim white trunk with dark marks, an airy crown of small leaves
  for (let i = 0; i < h * 34; i++) { const t = Math.random() * 0.85, a = Math.random() * 6.283, r = 0.13 * (1 - t * 0.4), mark = Math.sin(t * h * 7 + a) > 0.86; A.add(x + Math.cos(a) * r + Math.sin(t * 5) * 0.05, y + t * h, z + Math.sin(a) * r, mark ? hsl(0.08, 0.1, 0.04) : hsl(0.11, 0.06, 0.3 + Math.random() * 0.12), 0.045, el, 0); }
  for (let b = 0; b < 6; b++) { const by = y + h * (0.55 + b * 0.07), a = Math.random() * 6.283, len = 1.2 + Math.random() * 1.6;
    for (let s = 0; s < 14; s++) { const u = s / 13, px = x + Math.cos(a) * u * len, py = by + u * len * 0.7, pz = z + Math.sin(a) * u * len; A.add(px, py, pz, hsl(0.1, 0.06, 0.25), 0.035, el, u * 0.5);
      if (u > 0.3) for (let q = 0; q < 6; q++) A.add(px + (Math.random() - 0.5) * 0.9, py - Math.random() * 0.7, pz + (Math.random() - 0.5) * 0.9, hsl(0.2 + Math.random() * 0.06, 0.35, 0.1 + Math.random() * 0.08), 0.05, el, 0.9); } }
}
function growCanopy(A, x, y, z, r, el) {                    // a drift of high leaves between the crowns
  const n = Math.round(r * r * 26);
  for (let i = 0; i < r * r * 9; i++) { const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * r * 0.95; A.add(x + Math.cos(a) * rr, y + 0.6 + Math.random() * 0.5 - rr * rr * 0.02, z + Math.sin(a) * rr, Math.random() < 0.8 ? hsl(0.45, 0.3, 0.55 + Math.random() * 0.25) : hsl(0.16, 0.3, 0.65), 0.13, el, 1, 0, 0.8 + Math.random() * 0.18); }   // moonlit leaf-tops
  if (Math.random() < 0.6) { const gx = x + (Math.random() - 0.5) * r, gz = z + (Math.random() - 0.5) * r, top = y - 0.5, rad = 0.6 + Math.random() * 0.9;
    for (let i = 0; i < 420; i++) { const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * rad; A.add(gx + Math.cos(a) * rr, top, gz + Math.sin(a) * rr, hsl(0.5, 0.2, 0.6), 0.06, -1, 0.2, 3, 0.6); } }   // a shaft of drifting dust under a gap
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * r * (0.7 + 0.3 * Math.sin(a * 3)); A.add(x + Math.cos(a) * rr, y + (Math.random() - 0.5) * 1.6 - rr * rr * 0.02, z + Math.sin(a) * rr, hsl(0.25 + Math.random() * 0.07, 0.3, 0.06 + Math.random() * 0.07), 0.07, el, 1); }
}
function growFlowers(A, x, y, z, el) {                      // Himalayan blue poppies, yellow primulas, violets: stems and heads
  const heads = [hsl(0.58, 0.75, 0.55), hsl(0.14, 0.8, 0.55), hsl(0.76, 0.55, 0.55), hsl(0.98, 0.6, 0.55)];
  for (let f = 0; f < 34; f++) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 1.2, fx = x + Math.cos(a) * r, fz = z + Math.sin(a) * r, fh = 0.25 + Math.random() * 0.45, col = heads[Math.floor(Math.random() * (Math.random() < 0.55 ? 1 : 4))];
    for (let s = 0; s < 6; s++) A.add(fx, y + fh * s / 6, fz, hsl(0.3, 0.3, 0.12), 0.035, el, s / 6);
    for (let p = 0; p < 7; p++) A.add(fx + (Math.random() - 0.5) * 0.1, y + fh + (Math.random() - 0.5) * 0.07, fz + (Math.random() - 0.5) * 0.1, col, 0.05, el, 1); }
}
function growStick(A, mat, el) {                            // a fallen stick and its twigs
  const a = new THREE.Vector3(0, -0.5, 0).applyMatrix4(mat), b = new THREE.Vector3(0, 0.5, 0).applyMatrix4(mat); a.y = H(a.x, a.z) + 0.07; b.y = H(b.x, b.z) + 0.07;
  const len = a.distanceTo(b), v = new THREE.Vector3();
  for (let i = 0; i < len * 45; i++) { v.copy(a).lerp(b, Math.random()); A.add(v.x + (Math.random() - 0.5) * 0.04, v.y + (Math.random() - 0.5) * 0.04, v.z + (Math.random() - 0.5) * 0.04, hsl(0.08, 0.25, 0.1 + Math.random() * 0.08), 0.04, el, 0); }
  for (let t = 0; t < 4; t++) { v.copy(a).lerp(b, Math.random()); const d = new THREE.Vector3(Math.random() - 0.5, 0.3, Math.random() - 0.5).normalize(); for (let s = 0; s < 8; s++) A.add(v.x + d.x * s * 0.05, v.y + d.y * s * 0.05, v.z + d.z * s * 0.05, hsl(0.08, 0.2, 0.1), 0.035, el, 0); }
}
function growPine(A, x, y, z, h, el) {                      // a tall straight pine: bare trunk, a small crown high up
  for (let i = 0; i < h * 26; i++) { const t = Math.random(), a = Math.random() * 6.283, r = 0.22 * (1 - t * 0.75); A.add(x + Math.cos(a) * r, y + t * h, z + Math.sin(a) * r, hsl(0.07, 0.22, 0.09 + Math.random() * 0.07), 0.05, el, 0); }
  for (let k = 0; k < 6; k++) { const ty = y + h * (0.66 + k * 0.055), reach = (1.6 - k * 0.22) * (0.8 + Math.random() * 0.4);
    for (let b = 0; b < 5; b++) { const a = b / 5 * 6.283 + Math.random() + k; for (let s = 0; s < 10; s++) { const u = s / 9; A.add(x + Math.cos(a) * u * reach + (Math.random() - 0.5) * 0.25, ty - u * u * 0.4 + (Math.random() - 0.5) * 0.2, z + Math.sin(a) * u * reach + (Math.random() - 0.5) * 0.25, hsl(0.29, 0.25, 0.08 + u * 0.08), 0.06, el, 0.4 + u * 0.6); } } }
}
function growOldTree(A, x, y, z, h, el) {                   // a thick old tree: root flare, gnarled limbs, clumps of leaves at their ends
  for (let i = 0; i < h * 90; i++) { const t = Math.pow(Math.random(), 1.4), a = Math.random() * 6.283, r = 0.7 * (1 - t * 0.5) + (t < 0.08 ? (0.08 - t) * 9 : 0); A.add(x + Math.cos(a) * r, y + t * h * 0.6, z + Math.sin(a) * r, hsl(0.07, 0.2, 0.08 + Math.random() * 0.07), 0.06, el, 0); }
  for (let b = 0; b < 5; b++) { const a = b / 5 * 6.283 + Math.random(), by = y + h * (0.45 + Math.random() * 0.15), len = h * (0.3 + Math.random() * 0.15);
    let px = x, py = by, pz = z;
    for (let s = 0; s < len * 14; s++) { const u = s / (len * 14); px = x + Math.cos(a + Math.sin(u * 4) * 0.3) * u * len; py = by + u * len * 0.6 + Math.sin(u * 7) * 0.2; pz = z + Math.sin(a + Math.sin(u * 4) * 0.3) * u * len; const r = 0.3 * (1 - u * 0.7); A.add(px + (Math.random() - 0.5) * r, py + (Math.random() - 0.5) * r, pz + (Math.random() - 0.5) * r, hsl(0.07, 0.2, 0.08), 0.055, el, u * 0.3); }
    for (let i = 0; i < 520; i++) { const a2 = Math.random() * 6.283, u2 = Math.random() * 2 - 1, r2 = Math.pow(Math.random(), 0.4) * 2.2, q = Math.sqrt(1 - u2 * u2); A.add(px + Math.cos(a2) * q * r2, py + u2 * r2 * 0.6 + 0.4, pz + Math.sin(a2) * q * r2, hsl(0.24 + Math.random() * 0.06, 0.25, 0.07 + Math.random() * 0.08), 0.065, el, 0.7); } }
}
function growLog(A, mat, el, stump) {                       // a fallen trunk lying on the floor, or a stump with its rings
  const a = new THREE.Vector3(0, -0.5, 0).applyMatrix4(mat), b = new THREE.Vector3(0, 0.5, 0).applyMatrix4(mat);
  if (stump) { const r = 0.6, h = 0.9, y0 = H(a.x, a.z); for (let i = 0; i < 700; i++) { const t = Math.random(), an = Math.random() * 6.283; A.add(a.x + Math.cos(an) * r, y0 + t * h, a.z + Math.sin(an) * r, hsl(0.07, 0.2, 0.08 + Math.random() * 0.06), 0.05, el, 0); } for (let i = 0; i < 260; i++) { const rr = Math.sqrt(Math.random()) * r, an = Math.random() * 6.283, ring = 0.5 + 0.5 * Math.sin(rr * 40); A.add(a.x + Math.cos(an) * rr, y0 + h, a.z + Math.sin(an) * rr, hsl(0.09, 0.3, 0.12 + ring * 0.1), 0.045, el, 0); } return; }
  a.y = H(a.x, a.z) + 0.4; b.y = H(b.x, b.z) + 0.4; const dir = b.clone().sub(a), len = dir.length(); dir.normalize(); const side = new THREE.Vector3(-dir.z, 0, dir.x), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3();
  for (let i = 0; i < len * 220; i++) { const t = Math.random(), an = Math.random() * 6.283, r = 0.4 * (1 - t * 0.25); v.copy(a).addScaledVector(dir, t * len).addScaledVector(side, Math.cos(an) * r).addScaledVector(up, Math.sin(an) * r); const moss = Math.sin(an) > 0.5 && Math.random() < 0.5; A.add(v.x, v.y, v.z, moss ? hsl(0.27, 0.35, 0.1) : hsl(0.07, 0.2, 0.08 + Math.random() * 0.05), 0.05, el, 0); }
}
function growMushrooms(A, x, y, z, el) {                    // a cluster: pale stems, caps that glow faintly
  const n = 5 + Math.floor(Math.random() * 5), cap = [hsl(0.08, 0.6, 0.5), hsl(0.12, 0.3, 0.7), hsl(0.95, 0.35, 0.6)][Math.floor(Math.random() * 3)];
  for (let m = 0; m < n; m++) { const mx = x + (Math.random() - 0.5) * 0.9, mz = z + (Math.random() - 0.5) * 0.9, h = 0.1 + Math.random() * 0.25, r = 0.05 + Math.random() * 0.09;
    for (let s = 0; s < 8; s++) A.add(mx + (Math.random() - 0.5) * 0.02, y + h * s / 8, mz + (Math.random() - 0.5) * 0.02, hsl(0.12, 0.15, 0.4), 0.025, el, 0);
    for (let i = 0; i < 40; i++) { const an = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * r; A.add(mx + Math.cos(an) * rr, y + h + (1 - rr / r) * r * 0.5, mz + Math.sin(an) * rr, cap, 0.03, el, 0); } }
}
function growFern(A, x, y, z, el) {                         // bracken: fronds arching out from the middle, leaflets along them
  const n = 6 + Math.floor(Math.random() * 4);
  for (let f = 0; f < n; f++) { const a = f / n * 6.283 + Math.random() * 0.5, len = 0.7 + Math.random() * 0.6;
    for (let s = 0; s < 16; s++) { const u = s / 15, px = x + Math.cos(a) * u * len, pz = z + Math.sin(a) * u * len, py = y + Math.sin(u * Math.PI * 0.8) * len * 0.55; A.add(px, py, pz, hsl(0.27, 0.35, 0.12), 0.035, el, u);
      for (const sd of [-1, 1]) A.add(px + Math.cos(a + sd * 1.4) * 0.12 * (1 - u), py - 0.03, pz + Math.sin(a + sd * 1.4) * 0.12 * (1 - u), hsl(0.28, 0.4, 0.1 + u * 0.06), 0.035, el, u); } }
}
function pointify() {
  world.updateMatrixWorld(true);
  const moverRoots = new Set(movers.map((m) => m.m)), groups = new Map();
  const LIT = { canopy: 0.04, pine: 0.05, oldtree: 0.05, log: 0.05, mushroom: 0.22, fern: 0.06, deodar: 0.05, snag: 0.04, birch: 0.05, rhodo: 0.07, stick: 0.05, grass: 0.07, flower: 0.12, stone: 0.07, mani: 0.09, flags: 0.22, chorten: 0.28, wheel: 0.22, river: 0.32, peak: 0.16, moss: 0.06, cairn: 0.25, lamp: 1, bird: 0.15, insect: 0.5, firefly: 1 };
  const litOf = (el) => (el < 0 ? 0.07 : els[el]?.sacred ? 1.15 : LIT[els[el]?.type] ?? 0.15);
  const newBuf = () => { const B = { pos: [], col: [], size: [], el: [], seed: [], sway: [], mode: [], lit: [] }; B.add = (x, y, z, c, sz, el, sw = 0, md = 0, lt = null) => { B.pos.push(x, y, z); B.col.push(c.r, c.g, c.b); B.size.push(sz * (0.75 + Math.random() * 0.5)); B.el.push(el); B.seed.push(Math.random()); B.sway.push(sw); B.mode.push(md); B.lit.push(lt ?? litOf(el)); }; return B; };
  const out = newBuf(), rootOf = (o) => { for (let p = o; p; p = p.parent) if (moverRoots.has(p)) return p; return null; };
  const v = new THREE.Vector3(), M = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), c = new THREE.Color();
  const elOf = (o, i) => (o.isInstancedMesh ? (o.userData.inst ? o.userData.inst(i) : -1) : o.userData.el ?? -1), typeOf = (o) => els[elOf(o, 0)]?.type;
  const groundEl = els.findIndex((e) => e.radius === 0), himalaya = S.world === 'himalaya';
  world.traverse((o) => {
    if (!o.isMesh || o === beam || o.userData.pool || o.userData.keepSolid) return;
    const t = typeOf(o), gtype = o.geometry?.type || '';
    if (o.userData.ground) {                                   // the floor: fine moss and litter, ferns and grass blades
      for (let x = -80; x < 80; x += 0.55) for (let z = -80; z < 80; z += 0.55) { const px = x + Math.random() * 0.55, pz = z + Math.random() * 0.55, k = 0.5 + 0.5 * Math.sin(px * 0.21) * Math.cos(pz * 0.17); out.add(px, H(px, pz) + 0.03, pz, himalaya ? hsl(0.27, 0.35, 0.05 + k * 0.08) : hsl(0.2, 0.4, 0.06 + k * 0.08), 0.06, -1); }
      for (let i = 0; i < 800; i++) { const px = (Math.random() - 0.5) * 140, pz = (Math.random() - 0.5) * 140; growBlades(out, px, H(px, pz), pz, 3 + Math.floor(Math.random() * 4), 0.35 + Math.random() * 0.4, hsl(0.27, 0.28, 0.17), groundEl); }
      o.visible = false; return;
    }
    if (t === 'deodar') { if (gtype.startsWith('Cylinder')) for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); M.decompose(v, q, sc); const h = sc.y / 0.6, by = v.y - h * 0.3; growDeodar(out, v.x, by, v.z, h * 1.15, elOf(o, i)); } o.visible = false; return; }
    if (t === 'rhodo') { if (gtype.startsWith('Icosahedron') && o.geometry.parameters.radius > 0.5) for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); M.decompose(v, q, sc); growBush(out, v.x, H(v.x, v.z), v.z, sc.y, elOf(o, i), 5); } o.visible = false; return; }
    if (t === 'canopy') { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); M.decompose(v, q, sc); growCanopy(out, v.x, v.y, v.z, sc.x, elOf(o, i)); } o.visible = false; return; }
    if (t === 'pine') { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); M.decompose(v, q, sc); growPine(out, v.x, H(v.x, v.z), v.z, sc.y, elOf(o, i)); } o.visible = false; return; }
    if (t === 'oldtree') { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); M.decompose(v, q, sc); growOldTree(out, v.x, H(v.x, v.z), v.z, sc.y, elOf(o, i)); } o.visible = false; return; }
    if (t === 'log') { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); growLog(out, M, elOf(o, i), i % 3 === 0); } o.visible = false; return; }
    if (t === 'mushroom') { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); M.decompose(v, q, sc); growMushrooms(out, v.x, H(v.x, v.z), v.z, elOf(o, i)); } o.visible = false; return; }
    if (t === 'fern') { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); M.decompose(v, q, sc); growFern(out, v.x, H(v.x, v.z), v.z, elOf(o, i)); } o.visible = false; return; }
    if (t === 'snag') { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); M.decompose(v, q, sc); growSnag(out, v.x, H(v.x, v.z), v.z, sc.y, elOf(o, i)); } o.visible = false; return; }
    if (t === 'birch') { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); M.decompose(v, q, sc); growBirch(out, v.x, H(v.x, v.z), v.z, sc.y, elOf(o, i)); } o.visible = false; return; }
    if (t === 'flower') { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); M.decompose(v, q, sc); growFlowers(out, v.x, H(v.x, v.z), v.z, elOf(o, i)); } o.visible = false; return; }
    if (t === 'stick') { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); growStick(out, M, elOf(o, i)); } o.visible = false; return; }
    if (t === 'grass') { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); M.decompose(v, q, sc); growBlades(out, v.x, H(v.x, v.z), v.z, 70, 0.7 + Math.random() * 0.5, hsl(0.25, 0.35, 0.22), elOf(o, i), 1.3); } o.visible = false; return; }
    if (t === 'ichu') { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); M.decompose(v, q, sc); growBlades(out, v.x, v.y - 0.5, v.z, 26, 1 + sc.y * 0.4, hsl(0.13, 0.6, 0.45), elOf(o, i), 0.3); } o.visible = false; return; }
    if (t === 'river' || o.userData.nearest) {                // water: fine points with glints running downstream; the falls stream down
      if (gtype.startsWith('Plane') && o.geometry.parameters.height > 10) { for (let i = 0; i < 2600; i++) { const u = Math.random() - 0.5; v.set(u * 4, 7 - Math.random() * 0.2, 0).applyMatrix4(o.matrixWorld); out.add(v.x + (Math.random() - 0.5) * 0.3, v.y, v.z + (Math.random() - 0.5) * 0.3, hsl(0.55, 0.3, 0.6 + Math.random() * 0.2), 0.06, elOf(o, 0), 0, 2); } }
      else for (let x = -80; x < 80; x += 0.22) for (let k = 0; k < 6; k++) { const z = 24 + Math.sin(x * 0.06) * 3 + (Math.random() - 0.5) * 4.6, px = x + Math.random() * 0.2; let best = -1, bd = 1e9; els.forEach((e, j) => { if (e.type === 'river') { const d = Math.abs(e.pos.x - px); if (d < bd) { bd = d; best = j; } } }); out.add(px, H(px, z) + 0.38, z, hsl(0.56, 0.35, 0.3 + Math.random() * 0.25), 0.07, best, 0, 1); }
      o.visible = false; return;
    }
    // everything else: sampled off its surface, small and soft
    const kind = kindOf(o), [bright, sz] = KIND[kind] || KIND.build, dens = kind === 'peak' || kind === 'snow' ? 0.5 : kind === 'cloud' ? 6 : 7;
    const root = rootOf(o); let A = out, inv = null; if (root) { if (!groups.has(root)) groups.set(root, newBuf()); A = groups.get(root); inv = root.matrixWorld.clone().invert(); }
    const sampler = new MeshSurfaceSampler(o.isInstancedMesh ? new THREE.Mesh(o.geometry) : o).build(), area = triArea(o.geometry);
    const doOne = (mat, el, colr) => {
      mat.decompose(new THREE.Vector3(), new THREE.Quaternion(), sc);
      const n = Math.max(24, Math.min(o.isInstancedMesh ? 900 : 7000, Math.round(area * sc.x * sc.y * dens * (kind === 'peak' || kind === 'snow' ? 1 : Math.max(1, sc.z)))));
      for (let i = 0; i < n; i++) { sampler.sample(v); if (kind === 'cloud') v.multiplyScalar(Math.cbrt(Math.random())); v.applyMatrix4(mat); if (inv) v.applyMatrix4(inv); c.copy(colr).multiplyScalar(bright * (0.7 + Math.random() * 0.5)); A.add(v.x, v.y, v.z, c, sz, el, kind === 'flag' ? 0.6 : 0); }
    };
    if (o.isInstancedMesh) { const col = new THREE.Color(); for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); M.premultiply(o.matrixWorld); if (o.instanceColor) o.getColorAt(i, col); else col.copy(o.material.color); doOne(M, elOf(o, i), col); } }
    else doOne(o.matrixWorld, elOf(o, 0), o.material.color || new THREE.Color(0xffffff));
    o.visible = false;                                         // the solid shape stays only for aiming
  });
  const make = (B) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3)); for (const k of ['size', 'el', 'seed', 'sway', 'mode', 'lit']) g.setAttribute(k, new THREE.Float32BufferAttribute(B[k], 1)); const p = new THREE.Points(g, ptsMat); p.frustumCulled = false; p.raycast = () => {}; return p; };
  world.add(make(out)); for (const [root, B] of groups) root.add(make(B));
  return out.pos.length / 3 + [...groups.values()].reduce((n, B) => n + B.pos.length / 3, 0);
}
function buildWorld(id) {
  scene.remove(world); world.traverse((o) => { o.geometry?.dispose?.(); }); world = new THREE.Group(); scene.add(world);
  els = []; picks = []; movers = []; flagsAnim = []; fireflies = null; ff = null; beam = null; bugs = null; bugPts = null;
  for (const k in elBase) delete elBase[k];
  S.world = id; const W = WORLDS[id]; S.palette = S.palette && W.palettes[S.palette] ? S.palette : Object.keys(W.palettes)[0]; pal = W.palettes[S.palette];
  buildHimalaya(pal);
  for (let i = els.length - 1; i >= 0; i--) elBase[els[i].type] = i;     // each lane starts at its first element
  // the sacred grove: the cedars nearest the moonbeam glow always, and blaze when thunder strikes
  const beamAt = els.find((e) => e.type === 'moon')?.pos || new THREE.Vector3(); els.filter((e) => e.type === 'deodar').sort((p, q) => p.pos.distanceTo(beamAt) - q.pos.distanceTo(beamAt)).slice(0, 6).forEach((e) => { e.sacred = true; });
  window.__pointCount = pointify(); glowArr.fill(0);
  applyLook(); resetPlayer(); renderLanes(); renderIntro(); renderSettings();
}

// ---------------------------------------------------------------- look: palette, light, fog
function applyLook() {
  const W = WORLDS[S.world]; pal = W.palettes[S.palette]; const lc = new THREE.Color(LIGHT_COLS[S.light][1]).lerp(new THREE.Color(pal.light), 0.4);
  scene.background = new THREE.Color(pal.sky); scene.fog.color.set(pal.fog); scene.fog.density = [0, 0.009, 0.026][S.fog]; ptsUniforms.uFog.value = [0.0015, 0.0055, 0.014][S.fog];
  hemi.color.set(pal.light); hemi.groundColor.set(pal.ground); hemi.intensity = 0.95; moonL.color.copy(lc); moonL.intensity = 1.15;
  if (beam) { beam.material.color.copy(lc); beam.userData.pool.material.color.copy(lc); beamLight.color.copy(lc); }
}

// ---------------------------------------------------------------- the player
const P = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, vy: 0, keys: new Set(), locked: false };
function resetPlayer() { const W = S.world === 'himalaya'; P.pos.set(W ? 0 : -6, 0, W ? 30 : 22); P.yaw = W ? 0 : -0.5; P.pitch = 0.04; P.vy = 0; P.pos.y = H(P.pos.x, P.pos.z) + 1.7; }
addEventListener('keydown', (e) => {
  if (!active('summits') || !S.started || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); saveSession(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'o') { e.preventDefault(); $('#smFile').click(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  P.keys.add(k); if (k === ' ') e.preventDefault();
  if (e.repeat) return;
  if (k === ' ' && P.ground) { P.vy = 5.2; P.ground = false; }
  else if (k === 'enter') transport(!S.playing);
  else if (k === 'f') hitAimed(false);
  else if (k === 'i') $('#smInv').classList.toggle('open');
  else if (k === '1' || k === '2') setBank(+k - 1);
  else if (k === 't') setMetro(!S.metro);
  else if (k === 'c') { const ks = Object.keys(WORLDS[S.world].palettes); S.palette = ks[(ks.indexOf(S.palette) + 1) % ks.length]; applyLook(); renderSettings(); }
  else if (k === 'l') { S.light = (S.light + 1) % LIGHT_COLS.length; applyLook(); renderSettings(); }
  else if (k === 'g') { S.fog = (S.fog + 1) % 3; applyLook(); renderSettings(); }
  else if (k === 'n') setAmb(!S.amb);
  else if (k === 'k') { S.storm = !S.storm; renderSettings(); toast(S.storm ? 'Storms on' : 'Storms off'); }
  else if (k === 'h') $('#smKeys').classList.toggle('hide');
  else if (k === 'p') (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
  else if (k === 'r') (e.shiftKey ? recAudio() : recVideo());
});
addEventListener('keyup', (e) => P.keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => P.keys.clear());
// look: pointer lock when the browser allows it, otherwise drag to look
let dragLook = null;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  if (!S.started) return; ensureAudio();
  if (e.button === 2) { aimCloser(); return; }
  if (P.locked) { hitAimed(e.shiftKey); return; }
  dragLook = { x: e.clientX, y: e.clientY, moved: false, shift: e.shiftKey };
});
addEventListener('pointermove', (e) => {
  if (!active('summits')) return;
  if (P.locked) { P.yaw -= e.movementX * 0.0022; P.pitch = clamp(P.pitch - e.movementY * 0.0022, -1.4, 1.4); return; }
  if (dragLook) { const dx = e.clientX - dragLook.x, dy = e.clientY - dragLook.y; if (Math.hypot(dx, dy) > 4) dragLook.moved = true; if (dragLook.moved) { P.yaw -= dx * 0.004; P.pitch = clamp(P.pitch - dy * 0.004, -1.4, 1.4); dragLook.x = e.clientX; dragLook.y = e.clientY; } }
});
addEventListener('pointerup', (e) => {
  if (!dragLook) return; const d = dragLook; dragLook = null;
  if (!d.moved) { const hit = pickAt(e.clientX, e.clientY); if (hit) playEl(hit.el, hit.point, d.shift); else canvas.requestPointerLock?.()?.catch?.(() => {}); }
});
document.addEventListener('pointerlockchange', () => { P.locked = document.pointerLockElement === canvas; });

// ---------------------------------------------------------------- aiming and picking
const ray = new THREE.Raycaster(); ray.far = 260; const ndc = new THREE.Vector2();
function elFromHit(h) {
  const o = h.object; if (o.userData.inst && h.instanceId != null) return o.userData.inst(h.instanceId);
  if (o.userData.ground) { const lane = S.world === 'himalaya' ? 'moss' : 'grass'; return els.findIndex((e) => e.type === lane); }
  if (o.userData.nearest) { let best = -1, bd = Infinity; els.forEach((e, i) => { if (e.type === 'river') { const d = e.pos.distanceTo(h.point); if (d < bd) { bd = d; best = i; } } }); return best; }
  return o.userData.el;
}
function pickAt(cx, cy) { ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); return pickRay(); }
function pickRay() {
  // fireflies first: they are points, so test the distance to the ray
  if (bugs) { let best = -1, bd = 0.7; const tmp = new THREE.Vector3(); bugs.forEach((f, i) => { tmp.set(f.x, f.y, f.z); const d = ray.ray.distanceToPoint(tmp); if (d < bd && tmp.distanceTo(ray.ray.origin) < 30) { bd = d; best = i; } }); if (best >= 0) { const i0 = elBase.insect + best; return { el: i0, point: els[i0].pos.clone() }; } }
  if (ff) { let best = -1, bd = 0.9; const tmp = new THREE.Vector3(); ff.forEach((f, i) => { tmp.set(f.x, f.y, f.z); const d = ray.ray.distanceToPoint(tmp); if (d < bd && tmp.distanceTo(ray.ray.origin) < 40) { bd = d; best = i; } }); if (best >= 0) { const i0 = els.findIndex((e) => e.type === 'firefly') + best; return { el: i0, point: els[i0].pos.clone() }; } }
  const h = ray.intersectObjects(picks, false)[0]; if (!h) return null; const el = elFromHit(h); return el == null || el < 0 ? null : { el, point: h.point.clone() };
}
let aimed = null;                                           // { el, point } of what the crosshair holds
function updateAim() { ray.setFromCamera(ndc.set(0, 0), camera); aimed = pickRay(); const el = aimed && els[aimed.el]; $('#smAim').textContent = el ? `${laneName(el.type)} · ${noteName(noteOf(el, aimed.point))}` : ''; }
function aimCloser() {                                       // right-click: snap the aim onto the nearest element near the crosshair
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); let best = -1, bs = 0.97;
  els.forEach((e, i) => { if (e.radius === 0) return; const v = e.pos.clone().sub(camera.position), d = v.length(); if (d > 60) return; const c = v.normalize().dot(dir); if (c > bs) { bs = c; best = i; } });
  if (best < 0) return toast('Nothing close to aim at');
  const v = els[best].pos.clone().sub(camera.position); P.yaw = Math.atan2(-v.x, -v.z); P.pitch = Math.atan2(v.y, Math.hypot(v.x, v.z)); toast('Aimed at ' + laneName(els[best].type).toLowerCase());
}
const laneName = (t) => (WORLDS[S.world].lanes.find((l) => l[0] === t) || [, t.toUpperCase()])[1];
function noteOf(el, point) {                                // ground: every patch a different note; everything else its own note
  if (el.radius === 0 && point) { const cell = Math.floor(point.x / 7) * 7 + Math.floor(point.z / 7) * 3; return noteFor(((cell % 7) + 7) % 7) + S.keyShift; }
  return el.note + S.keyShift;
}

// ---------------------------------------------------------------- sound + loop
let ctx = null, master = null, analyser = null, streamDest = null, tap = null, amb = null, wavOn = false, wavL = [], wavR = [];
async function ensureAudio() {
  if (!active('summits')) return false;
  if (ctx) { if (ctx.state !== 'running') await ctx.resume(); return true; }
  ctx = new AudioContext({ latencyHint: 'interactive' }); guardAudio('summits', ctx);
  master = ctx.createGain(); master.gain.value = 0.62; const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -3; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.15;   // a limiter so nothing clips
  const verb = ctx.createConvolver(), n = Math.round(ctx.sampleRate * 5.5), b = ctx.createBuffer(2, n, ctx.sampleRate); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.2) * (i < n * 0.02 ? i / (n * 0.02) : 1); } verb.buffer = b; const vg = ctx.createGain(); vg.gain.value = 0.42;   // a long, soft space
  analyser = ctx.createAnalyser(); streamDest = ctx.createMediaStreamDestination();
  await ctx.audioWorklet.addModule('./chaos-worklet.js'); tap = new AudioWorkletNode(ctx, 'chaos-tap', { outputChannelCount: [2] }); tap.port.onmessage = (e) => { if (wavOn) { wavL.push(e.data[0]); wavR.push(e.data[1]); } };
  master.connect(lim); master.connect(verb).connect(vg).connect(lim); lim.connect(tap).connect(analyser); analyser.connect(ctx.destination); analyser.connect(streamDest);
  setAmb(S.amb); return true;
}
function voiceAt(pos) {                                      // a sound placed in the world: distance and direction make the mix
  const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 4; p.rolloffFactor = 1.1; p.maxDistance = 400;
  p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; p.connect(master); return p;
}
function sound(el, m, pos, when, vel = 0.9) { const v = VOICES[el.type]; if (!v || !ctx) return; const p = voiceAt(pos); v(ctx, p, when, m, vel); setTimeout(() => p.disconnect(), (when - ctx.currentTime + 6) * 1000); }
const banks = [[], []];                                      // each hit: { step, el, m, pos }
const lanesState = {};                                       // lane -> { mute, solo }
let step = 0, nextT = 0, timer = 0, flashes = [];
const stepSec = () => 60 / S.bpm / 4;
async function playEl(i, point, remove = false) {
  if (!(await ensureAudio())) return; const el = els[i]; if (!el) return;
  if (remove) { const before = banks[S.bank].length; banks[S.bank] = banks[S.bank].filter((h) => h.el !== i); renderLanes(); toast(before !== banks[S.bank].length ? `${laneName(el.type).toLowerCase()} taken out of the loop` : 'It was not in the loop'); return; }
  const m = noteOf(el, point), pos = el.radius === 0 ? point.clone().setY(point.y + 0.5) : el.pos.clone();
  const at = point && el.radius !== 0 ? point.clone() : pos.clone();      // the light falls where you touched
  sound(el, m, pos, ctx.currentTime + 0.005); flash(i, at);
  if (!S.playing) transport(true);
  const s = (step + 15) % 16;                               // it lands on the step being heard now
  banks[S.bank].push({ step: s, el: i, m, pos: [pos.x, pos.y, pos.z], at: [at.x, at.y, at.z], type: el.type }); if (banks[S.bank].length > 96) banks[S.bank].shift(); el.hits++; renderLanes();
}
function hitAimed(remove) { if (aimed) playEl(aimed.el, aimed.point, remove); else toast('Aim at something first'); }
function transport(on) {
  S.playing = on; clearInterval(timer); $('#smTr').textContent = on ? 'playing' : 'stopped';
  if (on) { if (!ctx) return; nextT = ctx.currentTime + 0.05; step = 0; timer = setInterval(schedule, 25); }
}
function schedule() {
  if (!ctx) return;
  while (nextT < ctx.currentTime + 0.12) {
    const solo = Object.values(lanesState).some((l) => l.solo);
    for (const h of banks[S.bank]) { if (h.step !== step) continue; const ls = lanesState[h.type] || {}; if (ls.mute || (solo && !ls.solo)) continue; const el = els[h.el]; if (!el) continue; sound(el, h.m, new THREE.Vector3(...h.pos), nextT, 0.8); flashes.push({ t: nextT, el: h.el, at: h.at }); }
    if (S.metro && step % 4 === 0) metroClick(ctx, master, nextT, step === 0);
    flashes.push({ t: nextT, step }); nextT += stepSec(); step = (step + 1) % 16;
  }
}
function setBank(b) { S.bank = b; $('#smBank').textContent = b + 1; $('#smInvBank').textContent = b + 1; renderLanes(); toast('Bank ' + (b + 1)); }
function setMetro(on) { S.metro = on; renderSettings(); }
function setAmb(on) {
  S.amb = on; renderSettings(); if (!ctx) return;
  if (amb && amb.kind !== S.world) { amb.gain.value = 0; amb.stopBirds?.(); amb.disconnect(); amb = null; }
  if (!amb) { amb = ambience(ctx, master, S.world); amb.kind = S.world; }
  amb.gain.setTargetAtTime(on ? 0.6 : 0, ctx.currentTime, 0.4);
}
// a touch lights its element up for a moment
const glows = []; const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
// ---------------------------------------------------------------- touch effects: each kind of thing answers with its own light
const FX = { spores: ['moss', 'grass'], ring: ['river', 'terrace'], sparks: ['mani', 'rhodo', 'llama', 'ichu', 'flags', 'firefly', 'stone', 'flower', 'stick', 'bird', 'insect', 'lamp'], pillar: ['deodar', 'chorten', 'wheel', 'sunstone', 'wall', 'snag', 'birch', 'cairn'], wave: ['peak', 'moon', 'sun', 'huayna', 'cloud', 'condor'] };
const fxOf = (type) => Object.keys(FX).find((k) => FX[k].includes(type)) || 'sparks';
const TINT = { moss: 0x9dff8a, grass: 0xc8ff7a, river: 0x7fd8ff, terrace: 0xffd08a, mani: 0xd9dcff, rhodo: 0xff6f9a, llama: 0xfff0d0, ichu: 0xffe27a, flags: 0xfff2a0, firefly: 0xe8ff9a,
  deodar: 0xa8ffb8, canopy: 0xc8ffb0, pine: 0xb8ffc8, oldtree: 0xd0ffa8, log: 0xffc890, mushroom: 0xffd0a0, fern: 0xb8ffa0, cairn: 0xffe2a8, lamp: 0xffb04a, bird: 0xdff0ff, insect: 0xfff0a0, snag: 0xd8c8a8, birch: 0xd8ffb0, stone: 0xd9dcff, flower: 0x9ec8ff, stick: 0xffd8a0, chorten: 0xfff6e0, wheel: 0xffc860, sunstone: 0xffd27a, wall: 0xffb98a, peak: 0xcfe2ff, moon: 0xd8e6ff, sun: 0xffe2a0, huayna: 0xa8ffcf, cloud: 0xffffff, condor: 0xffd8a8 };
const fxList = []; let touchIx = 0, waveT = 9;
const sparkTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, '#fff'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
function touchFx(i, pos) {                                 // no objects are added: the thing itself glows, and the forest around it catches the light
  const el = els[i]; if (!el) return; const col = new THREE.Color(TINT[el.type] || 0xffffff).lerp(new THREE.Color(LIGHT_COLS[S.light][1]), 0.25);
  const reach = { peak: 30, moon: 16, cairn: 7, chorten: 6, deodar: 3.5, pine: 3.5, birch: 3.5, snag: 3, oldtree: 4.5 }[el.type] || (el.radius === 0 ? 2.5 : 3);
  const T = ptsUniforms.uTouch.value[touchIx], TC = ptsUniforms.uTouchCol.value[touchIx]; ptsUniforms.uTouchR.value[touchIx] = reach; touchIx = (touchIx + 1) % 4; T.set(pos.x, pos.y, pos.z, 1); TC.copy(col);
}
function stepFx(dt) {
  for (let i = fxList.length - 1; i >= 0; i--) {
    const f = fxList[i]; f.age += dt; const k = f.age / f.life;
    if (k >= 1) { world.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); fxList.splice(i, 1); continue; }
    if (f.kind === 'ring') { f.m.scale.setScalar(1 + f.age * 1.8); f.m.material.opacity = 0.4 * (1 - k) * (1 - k); }
    else if (f.kind === 'spores') { const p = f.m.geometry.attributes.position.array; for (let j = 0; j < f.v.length; j++) { p[j * 3] += f.v[j][0] * dt + Math.sin(f.age * 3 + j) * 0.004; p[j * 3 + 1] += f.v[j][1] * dt; p[j * 3 + 2] += f.v[j][2] * dt; } f.m.geometry.attributes.position.needsUpdate = true; f.m.material.opacity = 0.8 * (1 - k); }
    else if (f.kind === 'sparks') { const p = f.m.geometry.attributes.position.array; for (let j = 0; j < f.v.length; j++) { f.v[j][1] -= 6 * dt; p[j * 3] += f.v[j][0] * dt; p[j * 3 + 1] += f.v[j][1] * dt; p[j * 3 + 2] += f.v[j][2] * dt; } f.m.geometry.attributes.position.needsUpdate = true; f.m.material.opacity = 1 - k; }
    else if (f.kind === 'pillar') { f.m.scale.set(1 + k * 0.6, 0.3 + Math.min(1, k * 3) * 0.7, 1 + k * 0.6); f.m.material.opacity = 0.22 * (1 - k); }
  }
  waveT += dt; ptsUniforms.uWaveR.value = waveT * 26; ptsUniforms.uWaveA.value = 0.6 * Math.max(0, 1 - waveT / 2.6);
  for (const T of ptsUniforms.uTouch.value) T.w *= Math.exp(-dt * 0.55);   // the light lingers, then sinks back into the dark   // afterglow fades over a couple of seconds
}
// tall things glow only faintly as a whole: the light pools where you touched
const TALL = new Set(['canopy', 'deodar', 'pine', 'snag', 'birch', 'oldtree', 'peak']);
function flash(i, pos, fromLoop = false) { if (i >= 0 && i < GW) { const cap = TALL.has(els[i]?.type) ? 0.16 : 1; glowArr[i] = Math.max(glowArr[i], (fromLoop ? 0.7 : 1) * cap); } touchFx(i, pos);  if (!fromLoop && els[i]?.type === 'moon') strike(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 20, 0, -10 - Math.random() * 20)), true); }
let lightning = 0;
// ---------------------------------------------------------------- storms: forked bolts, the forest lit white for an instant, thunder late with distance
const bolts = []; let nextStorm = 18 + Math.random() * 20;
function boltPoints(top, bottom) {                         // a jagged path that forks on the way down
  const pts = [top.clone()], n = 22; let cur = top.clone();
  for (let i = 1; i <= n; i++) { const t = i / n, base = top.clone().lerp(bottom, t); cur = base.add(new THREE.Vector3((Math.random() - 0.5) * 6 * (1 - t * 0.6), 0, (Math.random() - 0.5) * 6 * (1 - t * 0.6))); pts.push(cur.clone()); }
  return pts;
}
const boltTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, '#fff'); r.addColorStop(0.3, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
function strike(at, fromTouch = false) {
  // far behind the trees, so it reads as a storm in the mountains
  const dir = at.clone().sub(P.pos).setY(0); if (dir.lengthSq() < 1) dir.set(0, 0, -1); dir.normalize();
  const ground = P.pos.clone().addScaledVector(dir, 70 + Math.random() * 40); ground.y = H(ground.x, ground.z) + 4; const top = ground.clone().add(new THREE.Vector3((Math.random() - 0.5) * 20, 70, (Math.random() - 0.5) * 20));
  const main = boltPoints(top, ground), lines = [main];
  for (let f = 0; f < 4; f++) { const from = main[3 + Math.floor(Math.random() * 14)]; lines.push(boltPoints(from, from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 26, -14 - Math.random() * 18, (Math.random() - 0.5) * 26)))); }
  const pts = []; for (const L of lines) for (let k = 0; k < L.length - 1; k++) for (let q = 0; q < 10; q++) pts.push(L[k].clone().lerp(L[k + 1], q / 10).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4)));
  const g = new THREE.BufferGeometry().setFromPoints(pts), m = new THREE.Points(g, new THREE.PointsMaterial({ map: boltTex, color: 0xb8c8ff, size: 1.1, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  m.raycast = () => {}; world.add(m); bolts.push({ m, age: 0, flick: [0, 0.09, 0.2].map((x) => x + Math.random() * 0.04) });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: boltTex, color: 0x6070a8, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); glow.position.copy(top.clone().lerp(ground, 0.4)); glow.scale.setScalar(70); world.add(glow); bolts.push({ m: glow, age: 0, sky: true });   // the cloud lit from inside
  lightning = 1;
  if (ctx && ctx.state === 'running') { const d = ground.distanceTo(P.pos); thunder(ctx, master, ctx.currentTime + Math.min(4, d / 343 * 3), 0.5 * Math.max(0.3, 1 - d / 200)); }   // sound travels slower than light
  if (!fromTouch) toast('Thunder');
}
function stepStorm(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) { const b = bolts[i]; b.age += dt;
    if (b.sky) b.m.material.opacity = 0.5 * Math.max(0, 1 - b.age / 0.5) * (Math.random() < 0.75 ? 1 : 0.3);
    else { const on = b.flick.some((f) => b.age > f && b.age < f + 0.07); b.m.material.opacity = on ? 0.9 : b.age < 0.5 ? 0.12 * (1 - b.age / 0.5) : 0; }   // two or three flickers, an afterimage
    if (b.age > 0.55) { world.remove(b.m); b.m.geometry?.dispose(); b.m.material.dispose(); bolts.splice(i, 1); } }
  ptsUniforms.uFlash.value = lightning > 0.05 ? lightning * (Math.random() < 0.8 ? 0.6 : 0.2) : 0;
  if (S.storm && S.started) { nextStorm -= dt; if (nextStorm <= 0) { nextStorm = 22 + Math.random() * 40; const a = Math.random() * 6.283, r = 25 + Math.random() * 50; strike(new THREE.Vector3(P.pos.x + Math.cos(a) * r, 0, P.pos.z + Math.sin(a) * r)); } }
}


// ---------------------------------------------------------------- inventory
function renderLanes() {
  const W = WORLDS[S.world], bank = banks[S.bank];
  $('#smLanes').innerHTML = W.lanes.map(([id, nm, , inst]) => { const n = bank.filter((h) => h.type === id).length, ls = lanesState[id] || {}; return `<div class="sm-lane" data-l="${id}"><span class="nm">${nm}<small>${inst}</small></span><span class="cnt">${n}</span><button data-a="mute" class="${ls.mute ? 'on' : ''}" title="Mute ${nm.toLowerCase()}">M</button><button data-a="solo" class="${ls.solo ? 'on' : ''}" title="Solo ${nm.toLowerCase()}">S</button><button data-a="clear" title="Clear ${nm.toLowerCase()}">×</button></div>`; }).join('');
  $('#smLanes').querySelectorAll('.sm-lane').forEach((row) => row.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { const id = row.dataset.l, ls = (lanesState[id] ||= {}); if (b.dataset.a === 'clear') banks[S.bank] = banks[S.bank].filter((h) => h.type !== id); else ls[b.dataset.a] = !ls[b.dataset.a]; renderLanes(); })));
  $('#smHits').textContent = bank.length;
}
$('#smInvX').addEventListener('click', () => $('#smInv').classList.remove('open'));

// ---------------------------------------------------------------- settings + intro
function renderSettings() {
  const W = WORLDS[S.world];
  $('#smPal').innerHTML = Object.keys(W.palettes).map((k) => `<button data-p="${k}" class="${k === S.palette ? 'on' : ''}">${k}</button>`).join('');
  $('#smPal').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { S.palette = b.dataset.p; applyLook(); renderSettings(); }));
  $('#smLights').innerHTML = LIGHT_COLS.map(([n, c], i) => `<button class="sm-sw ${i === S.light ? 'on' : ''}" data-i="${i}" title="${n} light" style="background:#${c.toString(16).padStart(6, '0')}"></button>`).join('');
  $('#smLights').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { S.light = +b.dataset.i; applyLook(); renderSettings(); }));
  const on = (sel, attr, v) => root.querySelectorAll(`${sel} [data-${attr}]`).forEach((b) => b.classList.toggle('on', b.dataset[attr] === String(v)));
  on('#smFog', 'f', S.fog); on('#smStorm', 'k', S.storm ? 1 : 0); on('#smAmb', 'a', S.amb ? 1 : 0); on('#smMet', 'm', S.metro ? 1 : 0); 
  $('#smKey').textContent = noteName(W.root + S.keyShift).replace(/\d+$/, '') + ' ' + W.keyName.split(' ').slice(1).join(' '); $('#smBpm').textContent = S.bpm + ' BPM';
  $('#smPlace').textContent = W.name + ' · ' + W.place.toUpperCase();
}
function renderIntro() {
  const W = WORLDS[S.world]; $('#smBlurb').textContent = W.blurb;
  $('#smList').innerHTML = W.lanes.map(([, nm, hint, inst]) => `<div><b>${nm}</b><span>${hint.toUpperCase()} · ${inst.toUpperCase()}</span></div>`).join('');
}
const segs = (sel, attr, fn) => root.querySelectorAll(`${sel} [data-${attr}]`).forEach((b) => b.addEventListener('click', () => fn(b.dataset[attr])));
segs('#smFog', 'f', (v) => { S.fog = +v; applyLook(); renderSettings(); });
segs('#smStorm', 'k', (v) => { S.storm = v === '1'; renderSettings(); });
segs('#smAmb', 'a', (v) => setAmb(v === '1'));
segs('#smMet', 'm', (v) => setMetro(v === '1'));
function switchWorld(id) { if (id === S.world) return; transport(false); banks[0] = []; banks[1] = []; S.palette = null; buildWorld(id); if (ctx) setAmb(S.amb); toast(WORLDS[id].name); }
$('#smSlow').addEventListener('click', () => { S.bpm = Math.max(40, S.bpm - 2); renderSettings(); });
$('#smFast').addEventListener('click', () => { S.bpm = Math.min(160, S.bpm + 2); renderSettings(); });
$('#smKDn').addEventListener('click', () => { S.keyShift--; renderSettings(); });
$('#smKUp').addEventListener('click', () => { S.keyShift++; renderSettings(); });
$('#smEnter').addEventListener('click', async () => { $('#smIntro').classList.add('gone'); S.started = true; await ensureAudio(); canvas.requestPointerLock?.()?.catch?.(() => {}); });

// ---------------------------------------------------------------- record, save, open, MIDI
const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
let rec = null;
async function recVideo() {
  if (rec) return stopRec(); if (!(await ensureAudio())) return; if (!window.MediaRecorder) return toast('This browser cannot record video');
  const st = canvas.captureStream(30), at = streamDest.stream.getAudioTracks()[0]; if (at) st.addTrack(at);
  const type = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=h264', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
  const mr = new MediaRecorder(st, { mimeType: type, videoBitsPerSecond: 10e6 }), ch = []; mr.ondataavailable = (e) => { if (e.data.size) ch.push(e.data); };
  mr.onstop = () => { const mt = (mr.mimeType || 'video/webm').split(';')[0]; download(new Blob(ch, { type: mt }), `summits-${S.world}.${mt.includes('mp4') ? 'mp4' : 'webm'}`); };
  mr.start(500); rec = { mr }; $('#smRecV').classList.add('on'); toast('Recording video · R stops');
}
async function recAudio() { if (rec) return stopRec(); if (!(await ensureAudio())) return; wavL = []; wavR = []; wavOn = true; tap.port.postMessage({ on: true }); rec = { wav: true }; $('#smRecA').classList.add('on'); toast('Recording sound · Shift+R stops'); }
function stopRec() { if (rec.wav) { wavOn = false; tap.port.postMessage({ on: false }); download(new Blob([wav24(wavL, wavR, ctx.sampleRate)], { type: 'audio/wav' }), `summits-${S.world}.wav`); } else rec.mr.stop(); rec = null; $('#smRecV').classList.remove('on'); $('#smRecA').classList.remove('on'); toast('Saved'); }
$('#smRecV').addEventListener('click', recVideo); $('#smRecA').addEventListener('click', recAudio);
function saveSession() { const data = { app: 'summits', v: 1, world: S.world, bpm: S.bpm, keyShift: S.keyShift, palette: S.palette, light: S.light, fog: S.fog, banks, lanes: lanesState }; download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `summits-${S.world}.summit`); toast('Session saved'); }
async function openSession(file) {
  try { const d = JSON.parse(await file.text()); if (d.app !== 'summits') throw 0; if (d.world !== S.world) buildWorld(d.world); Object.assign(S, { bpm: d.bpm, keyShift: d.keyShift, palette: d.palette, light: d.light, fog: d.fog }); banks[0] = d.banks[0] || []; banks[1] = d.banks[1] || []; for (const k in lanesState) delete lanesState[k]; Object.assign(lanesState, d.lanes || {}); applyLook(); renderSettings(); renderLanes(); toast('Session opened'); }
  catch { toast('That is not a .summit file'); }
}
$('#smSave').addEventListener('click', saveSession); $('#smOpen').addEventListener('click', () => $('#smFile').click());
$('#smFile').addEventListener('change', (e) => { if (e.target.files[0]) openSession(e.target.files[0]); e.target.value = ''; });
addEventListener('dragover', (e) => { if (active('summits')) e.preventDefault(); });
addEventListener('drop', (e) => { if (!active('summits')) return; e.preventDefault(); const f = [...e.dataTransfer.files].find((x) => /\.summit$/i.test(x.name)); if (f) openSession(f); });
function midiFile() {                                        // type 1: a tempo track, then one track per lane, sixteenth = 120 ticks
  const vlq = (n) => { const b = [n & 127]; while ((n >>= 7)) b.unshift((n & 127) | 128); return b; }, str = (s) => [...s].map((c) => c.charCodeAt(0)), u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255], u16 = (n) => [(n >> 8) & 255, n & 255];
  const trk = (ev) => [...str('MTrk'), ...u32(ev.length), ...ev];
  const tempo = Math.round(60e6 / S.bpm), tracks = [trk([0, 0xff, 0x51, 3, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255, 0, 0xff, 0x2f, 0])];
  WORLDS[S.world].lanes.forEach(([id, nm], ci) => {
    const hits = banks[S.bank].filter((h) => h.type === id); if (!hits.length) return; const ch = ci % 16 === 9 ? 10 : ci % 16; const ev = [0, 0xff, 0x03, nm.length, ...str(nm)], list = [];
    for (const h of hits) { const m = clamp(Math.round(h.m), 0, 127); list.push([h.step * 120, 0x90 | ch, m, 96], [h.step * 120 + 110, 0x80 | ch, m, 0]); }
    list.sort((a, b) => a[0] - b[0]); let last = 0; for (const [t, s, n, v] of list) { ev.push(...vlq(t - last), s, n, v); last = t; } ev.push(...vlq(16 * 120 - last), 0xff, 0x2f, 0); tracks.push(trk(ev));
  });
  return new Blob([new Uint8Array([...str('MThd'), ...u32(6), ...u16(1), ...u16(tracks.length), ...u16(480), ...tracks.flat()])], { type: 'audio/midi' });
}
$('#smMidi').addEventListener('click', () => { if (!banks[S.bank].length) return toast('The loop is empty'); download(midiFile(), `summits-${S.world}-bank${S.bank + 1}.mid`); toast('MIDI saved: one track per lane'); });

// ---------------------------------------------------------------- loop
function resize() { renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);
const clock = new THREE.Clock(); let last = 0, frames = 0;
const fwd = new THREE.Vector3(), right = new THREE.Vector3();
function frame() {
  frames++; if (window.__frames) window.__frames.summits = (window.__frames.summits || 0) + 1;
  const t = clock.getElapsedTime(), dt = Math.min(0.05, t - last); last = t;
  // walking
  if (S.started) {
    const sp = (P.keys.has('shift') ? 9 : 4.2) * dt; fwd.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); right.set(-fwd.z, 0, fwd.x);
    const mv = new THREE.Vector3(); if (P.keys.has('w')) mv.add(fwd); if (P.keys.has('s')) mv.sub(fwd); if (P.keys.has('d')) mv.add(right); if (P.keys.has('a')) mv.sub(right);
    if (mv.lengthSq()) P.pos.addScaledVector(mv.normalize(), sp); P.pos.x = clamp(P.pos.x, -bounds - 20, bounds + 20); P.pos.z = clamp(P.pos.z, -bounds - 20, bounds + 20);
    const floor = H(P.pos.x, P.pos.z) + 1.7; P.vy -= 14 * dt; P.pos.y += P.vy * dt;
    if (P.pos.y < floor || (P.vy <= 0 && P.pos.y - floor < 0.25)) { P.pos.y = floor; P.vy = 0; P.ground = true; } else P.ground = false;   // walking downhill keeps your feet on the ground
  }
  camera.position.copy(P.pos); camera.rotation.set(P.pitch, P.yaw, 0, 'YXZ');
  if (ctx) { const L = ctx.listener, d = new THREE.Vector3(); camera.getWorldDirection(d); if (L.positionX) { L.positionX.value = P.pos.x; L.positionY.value = P.pos.y; L.positionZ.value = P.pos.z; L.forwardX.value = d.x; L.forwardY.value = d.y; L.forwardZ.value = d.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; } else { L.setPosition(P.pos.x, P.pos.y, P.pos.z); L.setOrientation(d.x, d.y, d.z, 0, 1, 0); } }
  // life in the world
  if (ff && fireflies) { const p = fireflies.geometry.attributes.position.array, base = els.findIndex((e) => e.type === 'firefly'); ff.forEach((f, i) => { f.ph += dt * 0.5; const x = f.x + Math.sin(f.ph * 0.7 + i) * 1.5, y = f.y + Math.sin(f.ph * 1.3) * 0.6, z = f.z + Math.cos(f.ph * 0.6 + i) * 1.5; p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z; els[base + i].pos.set(x, y, z); }); fireflies.geometry.attributes.position.needsUpdate = true; fireflies.material.opacity = 0.32 + Math.sin(t * 3) * 0.2; }
  if (bugs && bugPts) { const p = bugPts.geometry.attributes.position.array; bugs.forEach((f, i) => { f.ph += 0.016 * (1 + i % 3); const x = f.x + Math.sin(f.ph * 1.7 + i) * 0.6, y = f.y + Math.abs(Math.sin(f.ph * 2.3)) * 0.4, z = f.z + Math.cos(f.ph * 1.3 + i) * 0.6; p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z; els[elBase.insect + i].pos.set(x, y, z); }); bugPts.geometry.attributes.position.needsUpdate = true; }
  for (const f of flagsAnim) f.rotation.z = Math.sin(t * 2.2 + f.position.x) * 0.25;
  for (const m of movers) {
    if (m.spin) m.m.rotation.y += m.spin * dt;
    if (m.walk) { m.walk.a += (Math.sin(t * 0.3 + m.el) * 0.4) * dt; const g = m.m; g.position.x += Math.cos(m.walk.a) * m.walk.sp * dt; g.position.z += Math.sin(m.walk.a) * m.walk.sp * dt; g.position.x = clamp(g.position.x, -40, 50); g.position.z = clamp(g.position.z, -45, 10); g.position.y = H(g.position.x, g.position.z); g.rotation.y = -m.walk.a; els[m.el].pos.copy(g.position).setY(g.position.y + 1.4); }
    if (m.orbit) { m.orbit.a += m.orbit.sp * dt; m.m.position.x = Math.cos(m.orbit.a) * m.orbit.r; m.m.position.z = Math.sin(m.orbit.a) * m.orbit.r - 30; els[m.el].pos.copy(m.m.position); }
    if (m.fly) { m.fly.a += dt * m.fly.sp; m.m.position.set(m.fly.cx + Math.cos(m.fly.a) * m.fly.r, m.fly.h + Math.sin(t * 0.7 + m.el) * 1.5, m.fly.cz + Math.sin(m.fly.a) * m.fly.r); m.m.rotation.y = -m.fly.a - Math.PI / 2; const fl = Math.sin(t * 9 + m.el) * 0.6; m.fly.w1.rotation.z = fl; m.fly.w2.rotation.z = -fl; els[m.el].pos.copy(m.m.position); }
    if (m.soar) { m.soar.a += dt * 0.12; m.m.position.set(Math.cos(m.soar.a) * m.soar.r + 10, 30 + Math.sin(t * 0.4) * 3, Math.sin(m.soar.a) * m.soar.r - 30); m.m.rotation.y = -m.soar.a; const fl = Math.sin(t * 1.4) * 0.12; m.soar.wing.rotation.z = fl; m.soar.w2.rotation.z = -fl; els[m.el].pos.copy(m.m.position); }
  }
  if (beam) { beam.material.opacity = 0.018 + Math.sin(t * 0.8) * 0.005 + lightning * 0.02; beamLight.intensity = 1.5 + lightning * 2; }
  lightning *= 0.86; scene.background.copy(new THREE.Color(pal.sky)).lerp(new THREE.Color(0x2a3350), lightning * 0.25);
  // the loop: what plays now glows
  if (ctx && S.playing) while (flashes.length && flashes[0].t <= ctx.currentTime) { const f = flashes.shift(); if (f.step != null) $('#smStep').textContent = String(f.step + 1).padStart(2, '0') + ' / 16'; else if (els[f.el]) flash(f.el, f.at ? new THREE.Vector3(...f.at) : els[f.el].pos, true); }
  for (let i = glows.length - 1; i >= 0; i--) { const g = glows[i], age = (performance.now() - g.t) / 600; if (age > 1) { world.remove(g.s); g.s.material.dispose(); glows.splice(i, 1); } else { g.s.material.opacity = 1 - age; g.s.scale.multiplyScalar(1.01); } }
  if (S.started) updateAim();
  if (frames % 10 === 0) $('#smPos').textContent = `${P.pos.x.toFixed(1)} · ${P.pos.z.toFixed(1)}`;
  for (let i = 0; i < els.length && i < GW; i++) { glowArr[i] *= 0.982; glowBytes[i * 4] = Math.min(255, glowArr[i] * 255); } elGlowTex.needsUpdate = true;
  stepFx(dt); stepStorm(dt);
  ptsUniforms.uTime.value = t; ptsUniforms.uScale.value = innerHeight * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360));
  composer.render();
}

// ---------------------------------------------------------------- boot
resize(); buildWorld('himalaya'); renderLanes();
renderer.setAnimationLoop(frame);
window.__summitsApp = { start() { renderer.setAnimationLoop(frame); if (active('summits')) ctx?.resume(); }, stop() { renderer.setAnimationLoop(null); transport(false); P.keys.clear(); if (document.pointerLockElement === canvas) document.exitPointerLock(); ctx?.suspend(); } };
window.__s = { S, P, get els() { return els; }, banks, lanesState, get aimed() { return aimed; }, get frames() { return frames; }, get audio() { return ctx?.state ?? 'none'; }, ensureAudio, playEl, transport, setBank, switchWorld, midiFile, pickAt,
  rms: () => { if (!analyser) return 0; const b = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(b); let s = 0; for (const v of b) s += v * v; return Math.sqrt(s / b.length); }, enter: () => $('#smEnter').click(), ready: true };
