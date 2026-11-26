import * as THREE from './vendor/three.module.js';
import { initAudio, play, VOICES, setVoxText, setVoxBase, setVoxType, setChem, setTone, audioCtx, midiHz, startRecording, stopRecording } from './audio.js';
import { createSequencer } from './sequencer.js';
import { createSignals } from './signals.js';
import { SOUNDS } from './sounds.js';
import { registerSounds } from './audio.js';
import { createSoundUI } from './soundui.js';
import { createLoop } from './loop.js';
import { createMilestones } from './milestones.js';
import { active } from './site-state.js';
let signals = null, lastT = null, ms = null, loop = null, hrBpm = 66, frameN = 0;

const canvas = document.getElementById('gl');
const status = document.getElementById('label');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040a);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
camera.position.set(0, 0.2, 7.5);
const VIEWS = { full: { x: 0, y: 0.2, z: 7.5 }, head: { x: 0, y: 1.85, z: 2.7 }, chest: { x: 0, y: 1.15, z: 3.8 }, abdomen: { x: 0, y: 0.5, z: 3.8 }, hands: { x: 1.0, y: 0.0, z: 3.4 }, feet: { x: 0, y: -1.4, z: 3.4 } };
let curView = 'full'; const view = { ...VIEWS.full }; const look = new THREE.Vector3(0, 0, 0);

// shared look state, driven by the chemistry mode + colour slider
const SH = { tint: { value: new THREE.Color(0xffffff) }, tintMix: { value: 0 }, hue: { value: 0 }, pulse: { value: 0 } };
// ---- x-ray material: bright rim, faint interior
function xray(color, rim = 2.2, base = 0.06) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcColorFactor, side: THREE.DoubleSide,
    uniforms: { c: { value: new THREE.Color(color) }, rim: { value: rim }, base: { value: base }, glow: { value: 0 }, tint: SH.tint, tintMix: SH.tintMix, hue: SH.hue, pulse: SH.pulse },
    vertexShader: `varying vec3 n; varying vec3 v;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); n=normalize(normalMatrix*normal); v=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 c; uniform float rim; uniform float base; uniform float glow; uniform vec3 tint; uniform float tintMix; uniform float hue; uniform float pulse; varying vec3 n; varying vec3 v;
      vec3 hueRot(vec3 col,float a){ float s=sin(a), co=cos(a); vec3 k=vec3(.57735); return col*co+cross(k,col)*s+k*dot(k,col)*(1.-co); }
      void main(){ float f=pow(1.-abs(dot(normalize(n),normalize(v))),rim);
        vec3 col=mix(c, tint*(.35+dot(c,vec3(.33))*1.3), tintMix); col=hueRot(col,hue);
        gl_FragColor=vec4(col*(base+f+glow*1.6)*(1.+pulse),1.); }`,
  });
}

const body = new THREE.Group(); scene.add(body);
const pads = [];   // { voice, label, meshes[], box }

// group name -> style + optional pad
const STYLE = {
  skin:      { color: 0x2b7fff, rim: 3.2, base: 0.012 },
  bone:      { color: 0xcfe8ff, rim: 2.0, base: 0.05 },
  cartilage: { color: 0x4fd8ff, rim: 2.0, base: 0.03 },
  skull:     { color: 0xcfe8ff, rim: 2.2, base: 0.05 },
  muscle:    { color: 0xd0505a, rim: 2.2, base: 0.03 },
  teeth:     { color: 0xffffff, rim: 1.6, base: 0.12 },
  cord:      { color: 0xffe14d, rim: 1.2, base: 0.4 },
  aorta:     { color: 0xff2a55, rim: 1.4, base: 0.3 },
  diaphragm: { color: 0x27ffd3, rim: 2.2, base: 0.06 },
  esophagus: { color: 0xff9a2e, rim: 1.2, base: 0.4 },
  trachea:   { color: 0x9fe8ff, rim: 1.2, base: 0.5, voice: 'vox', label: 'Voice' },
  pancreas:  { color: 0xffb347, rim: 1.2, base: 0.4 },
  bladder:   { color: 0xffe14d, rim: 1.2, base: 0.4 },
  // playable
  heart:    { color: 0xff2a55, rim: 1.4, base: 0.22, voice: 'heart', label: 'Heart' },
  lungR:    { color: 0x27ffd3, rim: 1.8, base: 0.05, voice: 'lungs', label: 'Lungs' },
  lungL:    { color: 0x27ffd3, rim: 1.8, base: 0.05, voice: 'lungs', label: 'Lungs' },
  stomach:  { color: 0xffe14d, rim: 1.4, base: 0.2, voice: 'stomach', label: 'Stomach' },
  smallInt: { color: 0xff9a2e, rim: 1.4, base: 0.14, voice: 'intestines', label: 'Small intestine' },
  largeInt: { color: 0xff6a00, rim: 1.8, base: 0.05, voice: 'intestines', label: 'Large intestine' },
  liver:    { color: 0xa855ff, rim: 1.8, base: 0.07, voice: 'liver', label: 'Liver' },
  kidneyL:  { color: 0x4dd2ff, rim: 1.1, base: 0.5, voice: 'kidneyL', label: 'Left kidney' },
  kidneyR:  { color: 0x4dd2ff, rim: 1.1, base: 0.5, voice: 'kidneyR', label: 'Right kidney' },
  brain:    { color: 0xff3df2, rim: 2.0, base: 0.05, voice: 'brain', label: 'Brain' },
  jaw:      { color: 0xffb3d1, rim: 1.6, base: 0.12, voice: 'jaw', label: 'Jaw' },
  spine:    { color: 0xffc400, rim: 1.8, base: 0.1, voice: 'spine', label: 'Spine' },
  hands:    { color: 0x8bff4d, rim: 1.2, base: 0.5, voice: 'hands', label: 'Hands' },
  feet:     { color: 0xff6a00, rim: 1.2, base: 0.5, voice: 'feet', label: 'Feet' },
};


// medical x-ray look: pale blue-white bone, nearly invisible skin, muted warm organs
const BONEC = 0xbcd8ff;
const XRAY = {
  skin:      { color: 0x1f4f95, rim: 3.2, base: 0.006 },
  bone:      { color: BONEC,   rim: 1.1, base: 0.11 },
  cartilage: { color: 0x7fb2ff, rim: 1.4, base: 0.05 },
  skull:     { color: BONEC,   rim: 2.0, base: 0.028 },
  muscle:    { color: 0xa84a4e, rim: 2.4, base: 0.022 },
  teeth:     { color: 0xeaf4ff, rim: 1.4, base: 0.14 },
  cord:      { color: 0xe8d6a8, rim: 1.2, base: 0.25 },
  aorta:     { color: 0xc24a4a, rim: 1.3, base: 0.2 },
  diaphragm: { color: 0x8a6070, rim: 2.0, base: 0.05 },
  esophagus: { color: 0xb88060, rim: 1.2, base: 0.25 },
  trachea:   { color: 0xa8d0ff, rim: 1.2, base: 0.25 },
  pancreas:  { color: 0xb89060, rim: 1.2, base: 0.2 },
  bladder:   { color: 0xb8a070, rim: 1.2, base: 0.25 },
  heart:     { color: 0xd04848, rim: 1.2, base: 0.18 },
  lungR:     { color: 0x9a6a78, rim: 1.5, base: 0.05 },
  lungL:     { color: 0x9a6a78, rim: 1.5, base: 0.05 },
  stomach:   { color: 0xd0a070, rim: 1.2, base: 0.2 },
  smallInt:  { color: 0xb8805a, rim: 1.3, base: 0.1 },
  largeInt:  { color: 0xa87858, rim: 1.6, base: 0.05 },
  liver:     { color: 0xa86050, rim: 1.5, base: 0.08 },
  kidneyL:   { color: 0xb85858, rim: 1.1, base: 0.3 },
  kidneyR:   { color: 0xb85858, rim: 1.1, base: 0.3 },
  brain:     { color: 0xe09090, rim: 1.3, base: 0.12 },
  jaw:       { color: BONEC,   rim: 1.2, base: 0.16 },
  spine:     { color: 0xd4e6ff, rim: 1.2, base: 0.16 },
  hands:     { color: BONEC,   rim: 1.2, base: 0.2 },
  feet:      { color: BONEC,   rim: 1.2, base: 0.18 },
};
const made = {};
let lookKey = 'xray';
function applyLook(key) {
  lookKey = key;
  const table = key === 'xray' ? XRAY : STYLE;
  for (const [name, m] of Object.entries(made)) {
    const o = table[name]; if (!o) continue;
    m.material.uniforms.c.value.set(o.color); m.material.uniforms.rim.value = o.rim; m.material.uniforms.base.value = o.base;
  }
  document.querySelectorAll('.fx [data-look]').forEach((b) => b.classList.toggle('on', b.dataset.look === key));
  try { localStorage.setItem('bodybeat.look', key); } catch {}
}

// ---- vessels + nerves: flow shader (pulse travels along the tube, arteries beat with the heart)
const FLOW = { time: { value: 0 }, beat: { value: 0 } };
function flowMat(color, speed, freq, kind) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcColorFactor, side: THREE.DoubleSide,
    uniforms: { c: { value: new THREE.Color(color) }, speed: { value: speed }, freq: { value: freq }, kind: { value: kind }, time: FLOW.time, beat: FLOW.beat, tint: SH.tint, tintMix: SH.tintMix, hue: SH.hue, pulse: SH.pulse },
    vertexShader: `varying vec3 n; varying vec3 v; varying vec3 lp;
      void main(){ lp=position; vec4 mv=modelViewMatrix*vec4(position,1.); n=normalize(normalMatrix*normal); v=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 c; uniform float speed; uniform float freq; uniform float kind; uniform float time; uniform float beat;
      uniform vec3 tint; uniform float tintMix; uniform float hue; uniform float pulse; varying vec3 n; varying vec3 v; varying vec3 lp;
      vec3 hueRot(vec3 col,float a){ float s=sin(a), co=cos(a); vec3 k=vec3(.57735); return col*co+cross(k,col)*s+k*dot(k,col)*(1.-co); }
      void main(){
        float f=pow(1.-abs(dot(normalize(n),normalize(v))),1.1);
        float ph=lp.y*freq-time*speed+lp.x*3.;
        float w=pow(.5+.5*sin(ph),kind>1.5?10.:5.);
        float amp=kind<0.5?(.5+beat*1.6):(kind<1.5?.7:1.2);
        vec3 col=mix(c,tint*(.35+dot(c,vec3(.33))*1.3),tintMix*.6); col=hueRot(col,hue);
        gl_FragColor=vec4(col*(.2+f*1.0+w*amp*(.4+f))*(1.+pulse),1.); }`,
  });
}
const vesselMeshes = {};
let detail = 'full';
try { detail = localStorage.getItem('bodybeat.detail') || 'full'; } catch {}
if (location.hash.includes('detail=lite')) detail = 'lite';
let vesselLoad = 0;
async function loadVessels(q = detail) {
  const token = ++vesselLoad, sfx = q === 'lite' ? '_lite' : '';
  const [meta, buf] = await Promise.all([fetch(`anatomy/vessels${sfx}.json`).then((r) => r.json()), fetch(`anatomy/vessels${sfx}.bin`).then((r) => r.arrayBuffer())]);
  if (token !== vesselLoad) return;                       // a newer request replaced this one
  for (const [k, old] of Object.entries(vesselMeshes)) { body.remove(old); old.geometry.dispose(); delete vesselMeshes[k]; }
  const mats = { artery: flowMat(0xff4a4a, 9.0, 16.0, 0), vein: flowMat(0x3f7dff, -3.5, 10.0, 1), nerve: flowMat(0xf2e2a8, 14.0, 22.0, 2) };
  for (const [name, g] of Object.entries(meta.groups)) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, g.pOff, g.v * 3), 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, g.iOff, g.i), 1));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mats[name]); m.renderOrder = 2; body.add(m); vesselMeshes[name] = m;
  }
  applyLayers(); window.__vessels = q;
}
const LAYERS = { skin: true, muscles: true, skeleton: true, organs: true, arteries: true, veins: true, nerves: true };
// muscle layer: thinned BodyParts3D muscle meshes, loaded after the main anatomy
async function loadMuscle() {
  const [meta, buf] = await Promise.all([fetch('anatomy/muscle.json').then((r) => r.json()), fetch('anatomy/muscle.bin').then((r) => r.arrayBuffer())]);
  const g = meta.groups.muscle, geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, g.pOff, g.v * 3), 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, g.iOff, g.i), 1)); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, xray(0xa84a4e, 2.4, 0.022)); m.renderOrder = 0; body.add(m); made.muscle = m;
  applyLook(lookKey); applyLayers(); window.__muscle = true;
}
const SKEL = ['bone', 'skull', 'cartilage', 'teeth', 'jaw', 'spine', 'hands', 'feet'];
function applyLayers() {
  for (const [name, m] of Object.entries(made)) m.visible = name === 'skin' ? LAYERS.skin : name === 'muscle' ? LAYERS.muscles : SKEL.includes(name) ? LAYERS.skeleton : LAYERS.organs;
  for (const p of pads) if (p.voice === 'eyes') for (const m of p.meshes) m.visible = LAYERS.organs;
  if (vesselMeshes.artery) vesselMeshes.artery.visible = LAYERS.arteries;
  if (vesselMeshes.vein) vesselMeshes.vein.visible = LAYERS.veins;
  if (vesselMeshes.nerve) vesselMeshes.nerve.visible = LAYERS.nerves;
  document.querySelectorAll('.fx [data-layer]').forEach((b) => b.classList.toggle('on', LAYERS[b.dataset.layer]));
}

async function loadAnatomy() {
  status.textContent = 'loading anatomy…';
  const [meta, buf] = await Promise.all([
    fetch('anatomy/anatomy.json').then((r) => r.json()),
    fetch('anatomy/anatomy.bin').then((r) => r.arrayBuffer()),
  ]);
  for (const [name, g] of Object.entries(meta.groups)) {
    const st = STYLE[name]; if (!st) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, g.pOff, g.v * 3), 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, g.iOff, g.i), 1));
    geo.computeVertexNormals(); geo.computeBoundingBox();
    const m = new THREE.Mesh(geo, xray(st.color, st.rim, st.base));
    m.renderOrder = name === 'skin' ? 0 : 1;
    body.add(m); made[name] = m;
    if (st.voice) {
      let p = pads.find((q) => q.voice === st.voice && q.group === (st.voice === 'lungs' || st.voice === 'intestines' ? st.voice : name));
      if (!p) { p = { voice: st.voice, label: st.label, meshes: [], box: new THREE.Box3(), group: (st.voice === 'lungs' || st.voice === 'intestines') ? st.voice : name }; pads.push(p); }
      p.meshes.push(m); p.box.union(geo.boundingBox);
    }
  }
  // eyes + facing direction come from real BodyParts3D landmarks (eyeballs sit in front of the ears)
  const lmFile = await fetch('anatomy/landmarks.json').then((r) => r.json()).catch(() => null);
  const LM = lmFile ? lmFile.landmarks : null;
  const sign = LM ? (LM.eyeR[2] > LM.earR[2] ? 1 : -1) : 1; body.userData.frontSign = sign;
  const eyes = { voice: 'eyes', label: 'Eyes', meshes: [], box: new THREE.Box3(), group: 'eyes' };
  for (const key of ['eyeR', 'eyeL']) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.012, 20, 14), xray(0xffffff, 1, 0.9));
    if (LM) m.position.set(...LM[key]); body.add(m); eyes.meshes.push(m);
    eyes.box.expandByObject(m);
  }
  eyes.box.expandByScalar(0.012); pads.push(eyes);
  for (const p of pads) p.box.expandByScalar(0.004);
  body.rotation.y = 0;
  // face the camera (+z)
  body.userData.baseRot = sign > 0 ? 0 : Math.PI;
  rotY = body.userData.baseRot;
  applyLook(lookKey);
  initFace(made, eyes.meshes, pads);
  status.textContent = '';
}

// ---- interaction
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
const label = document.getElementById('label');
function hit(name, silent = false) {
  if (!silent) { play(name, 1); loop?.record(name); ms?.track('pad', name); }
  signals?.hit(name);
  for (const p of pads) if (p.voice === name) { p.flash = 1; label.textContent = p.label; }
  const b = document.querySelector(`[data-v="${name}"]`);
  if (b) { b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 120); }
}
function pick(e) {
  ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  body.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(body.matrixWorld).invert();
  const r = ray.ray.clone().applyMatrix4(inv);
  let best = null, bv = Infinity, tmp = new THREE.Vector3();
  for (const p of pads) {
    if (!r.intersectBox(p.box, tmp)) continue;
    const s = new THREE.Vector3(); p.box.getSize(s); const vol = s.x * s.y * s.z;
    if (vol < bv) { bv = vol; best = p; }
  }
  return best;
}
let dragging = false, panning = false, lastX = 0, lastY = 0, picked = false, rotY = 0, vel = 0; const pan = { x: 0, y: 0 };
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  dragging = true; lastX = e.clientX; lastY = e.clientY; vel = 0; picked = false; panning = e.button === 2 || e.shiftKey;
  if (e.button === 0 && !e.shiftKey) { const p = pick(e); if (p) { initAudio(); hit(p.voice); selectOrgan(p.voice); picked = true; } }
});
addEventListener('pointermove', (e) => {
  if (!dragging || picked) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
  if (panning) { const k = 0.0022 * view.z; pan.x -= dx * k; pan.y += dy * k; } else { rotY += dx * 0.008; vel = dx * 0.008; }
});
addEventListener('pointerup', () => { dragging = false; panning = false; });
addEventListener('wheel', (e) => { if (!active('body')) return; view.z = THREE.MathUtils.clamp(view.z + e.deltaY * 0.005, 1.4, 12); }, { passive: true });

function selectOrgan(voice) { signals?.select(voice); ms?.track('select', voice); showTab('sig'); }
function showTab(k) {
  for (const id of ['seq', 'sig', 'gls']) document.getElementById(id).style.display = id === k ? '' : 'none';
  document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === k));
}
document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
addEventListener('keydown', (e) => { if (active('body') && e.key === 'Escape') signals?.clear(); });
const KEYS = '1234567890-=zx'.split(''), names = Object.keys(VOICES);
const row = document.getElementById('keys');
row.style.gridTemplateColumns = `repeat(${names.length}, minmax(0, 1fr))`;
names.forEach((n, i) => {
  const b = document.createElement('button'); b.dataset.v = n; b.innerHTML = `${n}<small>${KEYS[i].toUpperCase()}</small>`;
  b.addEventListener('pointerdown', () => { initAudio(); hit(n); selectOrgan(n); }); row.appendChild(b);
});
addEventListener('keydown', (e) => { if (!active('body') || e.repeat) return; const i = KEYS.indexOf(e.key.toLowerCase()); if (i >= 0 && i < names.length) { initAudio(); hit(names[i]); } });
// lyrics box for the VOX voice
const voxEl = document.createElement('div'); voxEl.className = 'vox';
let lyric = 'be the beat of the body', pitch = 110;
try { lyric = localStorage.getItem('bodybeat.lyric') || lyric; pitch = +localStorage.getItem('bodybeat.pitch') || pitch; } catch {}
voxEl.innerHTML = `<span>vox</span><input id="lyric" maxlength="120" spellcheck="false" value="${lyric.replace(/"/g, '&quot;')}"><label>pitch <input id="pitch" type="range" min="80" max="500" value="${pitch}"></label><button id="lyricGo">restart</button>`;
document.getElementById('seq').prepend(voxEl);
const applyVox = () => { const l = voxEl.querySelector('#lyric').value; setVoxText(l); setVoxBase(+voxEl.querySelector('#pitch').value); try { localStorage.setItem('bodybeat.lyric', l); localStorage.setItem('bodybeat.pitch', voxEl.querySelector('#pitch').value); } catch {} };
voxEl.querySelector('#lyric').addEventListener('input', applyVox);
voxEl.querySelector('#pitch').addEventListener('input', applyVox);
voxEl.querySelector('#lyricGo').addEventListener('click', applyVox);
voxEl.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
applyVox();
let trig = 0;
registerSounds(SOUNDS);
createSoundUI({ mount: document.getElementById('snd'), voices: names, onAssign: (v, id) => ms?.track('assign', id), onNote: () => ms?.track('leadNote', 1) });
const seq = createSequencer({ voices: names, mount: document.getElementById('seq'), onTrigger: (v) => { trig++; hit(v, true); }, onChange: () => ms?.track('seqSteps', seq.stepCount()) });
document.getElementById('seq').prepend(voxEl);          // the sequencer rebuilds its panel, so re-attach the lyric box
if (location.hash.includes('autoplay')) { seq.toggle(); setTimeout(() => { document.title = 'triggers:' + trig + ' playing:' + seq.playing; }, 2500); }

// ---- chemistry modes: each reshapes sound (tempo/filter/drive/reverb/tremolo/pitch) and look (tint/pulse)
const CHEMS = {
  baseline:      { label: 'baseline',      color: '#6fb7c4', tint: 0xffffff, mix: 0,    pulseRate: 1,   pulseAmp: 0,    irregular: 0,    heartRate: 1,   tempo: 1,    jitter: 0,     audio: { cutoff: 18000, q: 0.7, drive: 0,    reverb: 0.05, tremRate: 5,   tremDepth: 0,    pitch: 1 } },
  dopamine:      { label: 'dopamine',      color: '#ff3df2', tint: 0xff3df2, mix: 0.5,  pulseRate: 2.4, pulseAmp: 0.35, irregular: 0,    heartRate: 1.5, tempo: 1.12, jitter: 0,     audio: { cutoff: 20000, q: 0.8, drive: 0.04, reverb: 0.18, tremRate: 7,   tremDepth: 0.08, pitch: 1.06 } },
  serotonin:     { label: 'serotonin',     color: '#3dffa0', tint: 0x3dffa0, mix: 0.55, pulseRate: 0.6, pulseAmp: 0.15, irregular: 0,    heartRate: 0.8, tempo: 0.9,  jitter: 0,     audio: { cutoff: 3800,  q: 0.9, drive: 0,    reverb: 0.55, tremRate: 0.4, tremDepth: 0.05, pitch: 0.98 } },
  noradrenaline: { label: 'noradrenaline', color: '#ff5a1a', tint: 0xff5a1a, mix: 0.55, pulseRate: 3.2, pulseAmp: 0.4,  irregular: 0.05, heartRate: 2.0, tempo: 1.2,  jitter: 0.01,  audio: { cutoff: 20000, q: 1.5, drive: 0.25, reverb: 0.05, tremRate: 0,   tremDepth: 0,    pitch: 1.03 } },
  cortisol:      { label: 'cortisol',      color: '#ff8a00', tint: 0xff8a00, mix: 0.6,  pulseRate: 1.6, pulseAmp: 0.3,  irregular: 0.3,  heartRate: 1.7, tempo: 1.08, jitter: 0.035, audio: { cutoff: 2600,  q: 3.0, drive: 0.6,  reverb: 0.1,  tremRate: 11,  tremDepth: 0.22, pitch: 0.94 } },
  oxytocin:      { label: 'oxytocin',      color: '#ff8fcf', tint: 0xff8fcf, mix: 0.5,  pulseRate: 1.0, pulseAmp: 0.2,  irregular: 0,    heartRate: 1.0, tempo: 0.95, jitter: 0,     audio: { cutoff: 7000,  q: 0.8, drive: 0,    reverb: 0.4,  tremRate: 4,   tremDepth: 0.1,  pitch: 1.0 } },
  gaba:          { label: 'GABA',          color: '#4d7bff', tint: 0x4d7bff, mix: 0.6,  pulseRate: 0.3, pulseAmp: 0.1,  irregular: 0,    heartRate: 0.6, tempo: 0.75, jitter: 0,     audio: { cutoff: 1400,  q: 0.7, drive: 0,    reverb: 0.7,  tremRate: 0,   tremDepth: 0,    pitch: 0.9 } },
};
let chem = CHEMS.baseline, hueDeg = 0; const chemTint = new THREE.Color(0xffffff);
function setChemistry(key) {
  chem = Object.assign({}, CHEMS[key], { key }); chemTint.set(chem.tint);
  setChem(chem.audio); seq.setTempoMul(chem.tempo); seq.setJitter(chem.jitter);
  document.querySelectorAll('.fx [data-chem]').forEach((b) => b.classList.toggle('on', b.dataset.chem === key));
  label.textContent = chem.label;
  try { localStorage.setItem('bodybeat.chem', key); } catch {}
}
function setView(key) {
  curView = key; Object.assign(view, VIEWS[key]); pan.x = pan.y = 0;
  document.querySelectorAll('.fx [data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === key));
}
const fxEl = document.createElement('div'); fxEl.className = 'fx glass';
fxEl.innerHTML = `<section><h4>Chemistry</h4><div class="chips">${Object.entries(CHEMS).map(([k, c]) => `<button data-chem="${k}"><i style="background:${c.color}"></i>${c.label}</button>`).join('')}</div></section>
<section><h4>Zoom</h4><div class="seg3">${Object.keys(VIEWS).map((k) => `<button data-view="${k}">${k}</button>`).join('')}</div></section>
<section><h4>Layers</h4><div class="chips2">${Object.keys(LAYERS).map((k) => `<button data-layer="${k}">${k}</button>`).join('')}</div></section>
<section><h4>Look</h4><div class="seg"><button data-look="xray">X-ray</button><button data-look="neon">Neon</button></div>
<h4 style="margin-top:12px">Vessel detail</h4><div class="seg"><button data-detail="full">Full</button><button data-detail="lite">Lite</button></div></section>
<section><h4>Sound</h4>
<label>Tone <input id="tone" type="range" min="-100" max="100" value="0"></label>
<label>Colour <input id="hue" type="range" min="0" max="360" value="0"></label>
<label>Voice <select id="voxType"><option value="choir">Choir</option><option value="robot">Robot</option><option value="whisper">Whisper</option><option value="deep">Deep</option></select></label></section>`;
document.getElementById('app-body').appendChild(fxEl);
fxEl.addEventListener('pointerdown', (e) => e.stopPropagation());
fxEl.querySelectorAll('[data-chem]').forEach((b) => b.addEventListener('click', () => { initAudio(); setChemistry(b.dataset.chem); ms?.track('chem', b.dataset.chem); }));
fxEl.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { setView(b.dataset.view); ms?.track('view', b.dataset.view); }));
fxEl.querySelector('#tone').addEventListener('input', (e) => setTone(+e.target.value / 100));
fxEl.querySelector('#hue').addEventListener('input', (e) => { hueDeg = +e.target.value; });
fxEl.querySelector('#voxType').addEventListener('change', (e) => setVoxType(e.target.value));
const markDetail = () => fxEl.querySelectorAll('[data-detail]').forEach((b) => b.classList.toggle('on', b.dataset.detail === detail));
fxEl.querySelectorAll('[data-detail]').forEach((b) => b.addEventListener('click', () => { detail = b.dataset.detail; try { localStorage.setItem('bodybeat.detail', detail); } catch {} markDetail(); loadVessels(detail).catch((e) => console.error(e)); }));
markDetail();
fxEl.querySelectorAll('[data-layer]').forEach((b) => b.addEventListener('click', () => { LAYERS[b.dataset.layer] = !LAYERS[b.dataset.layer]; applyLayers(); ms?.track('layer', b.dataset.layer); }));
fxEl.querySelectorAll('[data-look]').forEach((b) => b.addEventListener('click', () => applyLook(b.dataset.look)));
try { lookKey = localStorage.getItem('bodybeat.look') || 'xray'; } catch {}
if (location.hash.includes('look=')) lookKey = location.hash.match(/look=(\w+)/)[1];
document.querySelectorAll('.fx [data-look]').forEach((b) => b.classList.toggle('on', b.dataset.look === lookKey));
setView('full'); setChemistry('baseline');
if (location.hash.includes('chem=')) setChemistry(location.hash.match(/chem=(\w+)/)[1]);
if (location.hash.includes('layers=')) { const on = location.hash.match(/layers=([\w+]+)/)[1].split('+'); for (const k of Object.keys(LAYERS)) LAYERS[k] = on.includes(k); }
if (location.hash.includes('view=')) setView(location.hash.match(/view=(\w+)/)[1]);
document.getElementById('start')?.addEventListener('pointerdown', (e) => { initAudio(); e.currentTarget.remove(); });
if (location.hash.includes('demo')) document.getElementById('start')?.remove();

// ================= toast + milestones =================
const toastEl = document.getElementById('toast');
function toast(text) {
  const d = document.createElement('div'); d.className = 'toast-i'; d.textContent = text; toastEl.appendChild(d);
  requestAnimationFrame(() => d.classList.add('in'));
  setTimeout(() => { d.classList.remove('in'); setTimeout(() => d.remove(), 450); }, 3400);
}
ms = createMilestones({ mount: document.getElementById('gls'), toast });
document.addEventListener('click', (e) => { if (e.target.matches?.('button')) e.target.blur(); });   // keep Space for play/stop

// ================= dock: heart rate, throat, loop, save audio =================
const hrHz = () => hrBpm / 60 * chem.heartRate;
const NOTE_N = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteLabel = (m) => NOTE_N[m % 12] + (Math.floor(m / 12) - 1);
const dock = document.getElementById('dock');
dock.innerHTML = `<div class="dk-group"><label>Heart rate <input id="hr" type="range" min="40" max="180" value="${hrBpm}"><b id="hrV">${hrBpm}</b></label>
<label>Throat <input id="throat" type="range" min="0" max="24" value="0"><b id="thV">${noteLabel(45)}</b></label>
<label class="chk"><input id="syncT" type="checkbox">Sync tempo</label></div>
<div class="dk-group"><button id="lpRec">Rec loop</button><button id="lpUndo">Undo</button><button id="lpClear">Clear</button><span id="lpBar">Bar – / 2</span><i class="lp-prog"><u id="lpFill"></u></i></div>
<div class="dk-group"><button id="aSave">Save audio</button></div>`;
const $ = (id) => document.getElementById(id);
dock.addEventListener('pointerdown', (e) => e.stopPropagation());
dock.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
$('hr').addEventListener('input', (e) => {
  hrBpm = +e.target.value; $('hrV').textContent = hrBpm; signals?.setHr(hrBpm); ms.track('hr', hrBpm);
  if ($('syncT').checked) seq.setBpm(hrBpm);
});
$('syncT').addEventListener('change', (e) => { if (e.target.checked) seq.setBpm(hrBpm); });
$('throat').addEventListener('input', (e) => {
  const m = 45 + +e.target.value; $('thV').textContent = noteLabel(m);
  const p = document.querySelector('#pitch'); if (p) { p.value = Math.round(midiHz(m)); p.dispatchEvent(new Event('input')); }
});
loop = createLoop({ now: () => audioCtx()?.currentTime ?? 0, getBpm: () => seq.getBpm(), play: (v, when) => play(v, 0.9, when), visual: (v) => hit(v, true), onChange: () => $('lpRec').classList.toggle('armed', loop.armed) });
let lastLayers = 0;
$('lpRec').addEventListener('click', () => { initAudio(); const was = loop.armed; loop.setArmed(!was); if (was && loop.layerCount > lastLayers) ms.track('loopRec'); lastLayers = loop.layerCount; });
$('lpUndo').addEventListener('click', () => { loop.undo(); lastLayers = loop.layerCount; });
$('lpClear').addEventListener('click', () => { loop.clear(); lastLayers = 0; });
let saving = false;
$('aSave').addEventListener('click', async () => {
  initAudio();
  if (!saving) { saving = startRecording(); if (saving) { $('aSave').textContent = 'Stop & save'; $('aSave').classList.add('rec'); } return; }
  saving = false; $('aSave').textContent = 'Save audio'; $('aSave').classList.remove('rec');
  const blob = await stopRecording(); if (!blob) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'bodybeat-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.webm';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); ms.track('audioSaved'); toast('Recording saved');
});

// ================= live face inset (bottom right): the head, synced with the body's yaw =================
const FACE = { size: 132, right: 28, bottom: 116 };
let faceReady = false, faceRT, faceScene, faceOrtho, faceCam;
function initFace(madeMeshes, eyeMeshes, padList) {
  for (const n of ['skin', 'skull', 'brain', 'teeth', 'jaw']) madeMeshes[n]?.layers.enable(1);
  for (const m of eyeMeshes) m.layers.enable(1);
  const bp = padList.find((p) => p.voice === 'brain'), c = bp.box.getCenter(new THREE.Vector3());
  const hy = body.position.y + c.y * body.scale.y;
  faceCam = new THREE.PerspectiveCamera(26, 1, 0.05, 20); faceCam.position.set(0, hy, 1.3); faceCam.lookAt(0, hy, 0); faceCam.layers.set(1);
  faceRT = new THREE.WebGLRenderTarget(320, 320);
  faceScene = new THREE.Scene(); faceOrtho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  faceScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    transparent: true, depthTest: false, uniforms: { tex: { value: faceRT.texture } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: 'uniform sampler2D tex; varying vec2 vUv; void main(){ vec2 p = vUv - .5; float r = length(p); float a = smoothstep(.5, .488, r); vec4 c = texture2D(tex, vUv); float vig = .62 + .38 * smoothstep(.5, .12, r); gl_FragColor = vec4(c.rgb * vig, a); }',
  })));
  faceReady = true;
}
function drawFace() {
  frameN++;
  if (frameN % 4 === 0) {                                  // refresh the head texture ~15 times a second
    const prev = renderer.getRenderTarget(); renderer.setRenderTarget(faceRT); renderer.render(scene, faceCam); renderer.setRenderTarget(prev);
  }
  const S = FACE.size, x = innerWidth - FACE.right - S, y = FACE.bottom;
  renderer.autoClear = false; renderer.setScissorTest(true); renderer.setViewport(x, y, S, S); renderer.setScissor(x, y, S, S);
  renderer.render(faceScene, faceOrtho);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight); renderer.autoClear = true;
}
const pop = $('pop'), faceBtn = $('face');
function openPop(on) { pop.classList.toggle('open', on); faceBtn.classList.toggle('active', on); }
faceBtn.addEventListener('click', () => { initAudio(); openPop(!pop.classList.contains('open')); });
$('popClose').addEventListener('click', () => openPop(false));
pop.addEventListener('pointerdown', (e) => e.stopPropagation());
addEventListener('keydown', (e) => { if (active('body') && e.key === 'Escape') openPop(false); });

// ================= status line, yaw dial, loop bar (10 Hz) =================
let lastUi = 0, playAcc = 0;
function uiTick(t) {
  if (t - lastUi < 0.1) return; lastUi = t;
  $('stBpm').textContent = Math.round(hrBpm * chem.heartRate) + ' BPM';
  $('stSub').textContent = 'Loop · 2 bars — ' + (signals ? signals.band : 'alpha · 10 Hz');
  let yaw = ((rotY - (body.userData.baseRot || 0)) * 180 / Math.PI) % 360; if (yaw > 180) yaw -= 360; if (yaw < -180) yaw += 360;
  $('yaw').textContent = 'YAW ' + (yaw < 0 ? '−' : '') + String(Math.round(Math.abs(yaw))).padStart(3, '0') + '°';
  $('faceMark').style.transform = `rotate(${yaw}deg)`;
  const ph = loop.phase(); $('lpBar').textContent = ph.running ? `Bar ${ph.bar} / 2` : 'Bar – / 2'; $('lpFill').style.width = ph.frac * 100 + '%';
  if (seq.playing) { playAcc += 0.1; if (playAcc >= 1) { ms.track('seqPlay', 1); playAcc = 0; } }
}
window.__bb = { get seqPlaying() { return seq.playing; }, get rotY() { return rotY; }, get pan() { return { ...pan }; }, get loop() { return loop; }, get ms() { return ms; }, get hr() { return hrBpm; }, openPop, toast };
if (location.hash.includes('pop=1')) openPop(true);


function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// body: real-scale metres (~1.72 m) -> fit the view
body.scale.setScalar(2.1); body.position.y = 0.2;
const clock = new THREE.Clock();
const bodyLoop = () => {
  if (window.__frames) window.__frames.body++;
  const t = clock.getElapsedTime(); const dt = Math.min(0.5, t - (lastT ?? t)); lastT = t;
  const tx = view.x + pan.x, ty = view.y + pan.y;
  camera.position.x += (tx - camera.position.x) * 0.07; camera.position.y += (ty - camera.position.y) * 0.07; camera.position.z += (view.z - camera.position.z) * 0.07;
  look.x += (tx - look.x) * 0.07; look.y += (ty - look.y) * 0.07; camera.lookAt(look.x, look.y, 0);
  SH.tint.value.lerp(chemTint, 0.05); SH.tintMix.value += (chem.mix - SH.tintMix.value) * 0.05;
  SH.hue.value = hueDeg * Math.PI / 180;
  FLOW.time.value = t; { const hp = pads.find((p) => p.voice === 'heart'); FLOW.beat.value = Math.max(0, Math.sin(t * 6.283 * hrHz())) ** 4 + (hp ? hp.flash || 0 : 0); }
  SH.pulse.value = chem.pulseAmp * (0.5 + 0.5 * Math.sin(t * 6.283 * chem.pulseRate)) + chem.irregular * (Math.random() - 0.5);
  if (!dragging) { rotY += vel * dt * 60; vel *= Math.exp(-9 * dt); if (Math.abs(vel) < 0.0004) vel = 0; }   // manual only: a short coast after release, no auto-rotation
  body.rotation.y = rotY;
  for (const p of pads) {
    const f = p.flash || 0; p.flash = f * 0.9;
    let s = 1 + f * 0.04;
    if (p.voice === 'heart') s *= 1 + 0.03 * Math.max(0, Math.sin(t * 6.28 * hrHz())) ** 4;
    for (const m of p.meshes) { if (m.material.uniforms) m.material.uniforms.glow.value = f; m.scale.setScalar(s); }
  }
  signals?.update(t, dt);
  renderer.autoClear = true; renderer.render(scene, camera);
  if (faceReady) drawFace();
  uiTick(t);
};
renderer.setAnimationLoop(bodyLoop);
window.__bodyApp = { start() { renderer.setAnimationLoop(bodyLoop); }, stop() { renderer.setAnimationLoop(null); } };   // site.js pauses this while Scatter is open
loadAnatomy().then(async () => {
  const lmData = await fetch('anatomy/landmarks.json').then((r) => r.json()).catch(() => ({ landmarks: {} }));
  signals = createSignals({ body, pads, camera, getChem: () => chem, mount: document.getElementById('sig'), hud: document.getElementById('hud'), landmarks: lmData.landmarks,
    onLabel: (it) => { initAudio(); hit(it.voice); signals.select(it.info, { id: it.id, from: it.pad ? undefined : new THREE.Vector3(...lmData.landmarks[it.id]) }); ms?.track('select', it.id); showTab('sig'); } });
  signals.setHr(hrBpm);
  { const tb = (location.hash.match(/tab=(\w+)/) || [, 'seq'])[1]; if (tb === 'snd') openPop(true); else showTab(tb); }
  if (location.hash.includes('select=')) { const v = location.hash.match(/select=(\w+)/)[1]; selectOrgan(v); }
  window.__ready = true;
  loadVessels().catch((e) => console.error('vessels', e));
  loadMuscle().catch((e) => console.error('muscle', e));
}).catch((e) => { status.textContent = 'failed to load anatomy: ' + e.message; console.error(e); });
