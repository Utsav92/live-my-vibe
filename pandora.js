// Niagra: a 4x4x4 glass cube whose tiles are slices of six loops. Turn its layers to remix them; a side plays
// its sixteen tiles in reading order. Original code for BodyBeat; the default kit is made in pandora-kit.js.
import * as THREE from './vendor/three.module.js';
import { FACES, newCube, turn, inverse, side, wholeness, notation, scrambleMoves, solveMoves, wordFor, facing, dragTurn, inLayer } from './pandora-core.js';
import { TRACKS, BEAT, renderKit } from './pandora-kit.js';
import { detectBpm, wav24 } from './chaos-core.js';
import { active, guardAudio } from './site-state.js';
import { EffectComposer } from './vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from './vendor/jsm/postprocessing/ShaderPass.js';
import { RoomEnvironment } from './vendor/jsm/environments/RoomEnvironment.js';

THREE.ColorManagement.enabled = false;
const root = document.getElementById('app-pandora');
const $ = (s) => root.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- state
const S = { playing: false, mode: 'face', side: 0, bpm: 120, bars: 2, paper: 'white', camAuto: true, text: true, tracks: true, drive: true, follow: false, quality: 1.25, bloom: 0.6, glow: '#ffa53a', glowRate: 0, seed: 0 };
const T = TRACKS.map((t) => ({ ...t, buf: null, bpm: 120, bars: 2, sync: true, file: null }));
const BT = { ...BEAT, buf: null, bpm: 120, bars: 2, sync: true, file: null, kick: null, snare: null };
const LIGHTS = [{ name: 'Key', az: 44, el: 38, i: 1.4, col: '#ffffff' }, { name: 'Back', az: 167, el: -30, i: 0.7, col: '#bcd4ff' }, { name: 'Fill', az: -80, el: -24, i: 0.25, col: '#ffe2c0' }];
let cube = newCube(); let moves = 0;

// ---------------------------------------------------------------- markup
root.innerHTML = `
<canvas id="pnGl"></canvas>
<div id="pnTicker" class="pn-mono"></div>
<div id="pnTC" class="pn-mono"><span id="pnTime">TC 00:00:00:00</span><span id="pnBar">BAR 001 · 1 · 1</span><span id="pnFrame">FRAME 000000</span></div>
<div id="pnTitle" class="pn-text"><h1>NIAGRA</h1><p class="pn-mono">A BODYBEAT PAGE · TURN THE CUBE, REMIX THE LOOPS</p></div>
<div id="pnHead" class="pn-text"><b>SIX LOOPS, NINETY-SIX TILES</b><span class="pn-mono">ONE SIDE PLAYS SIXTEEN SLICES · EVERY TURN REWRITES THE SONG</span></div>
<div id="pnPaper" class="pn-seg"><button data-paper="black">Black</button><button data-paper="white">White</button></div>
<div id="pnTracks" class="pn-panel">
  <div class="pn-ph"><b>TRACKS</b><span class="pn-mono">Drop audio on a row or on the cube</span></div>
  <div id="pnRows"></div>
  <p class="pn-mono pn-note" id="pnKitNote">Default kit at 120 BPM: six loops made in code (glass, reed, wire, bloom, grit, spark) over a broken-beat drum loop. Drop your own loops on any row.</p>
</div>
<div id="pnMapWrap"><div id="pnMap" title="Unfolded cube. Click a side to play it."></div></div>
<div id="pnHelp" class="pn-mono pn-text">Drag a glass tile to turn its layer.<br>Drag empty space to look around.<br>Click a side of the map to play it.<br>Drag a side off the map into your DAW.</div>
<div id="pnInfo" class="pn-mono">
  <div class="pn-cap">SIDE</div>
  <div id="pnSide"><b id="pnSideL">F</b><span id="pnSideN">FRONT</span><span id="pnStep">— / —</span></div>
  <div class="pn-row"><span id="pnWhole">WHOLE</span><span id="pnPct">100%</span></div><div id="pnWBar"><i></i></div>
  <div class="pn-row"><span id="pnSeed">SEED —</span><span id="pnMoves">MOVES 0000</span></div>
  <div class="pn-cap" style="margin-top:12px">NOTATION</div><div id="pnNot">Turn a layer to begin</div>
  <div class="pn-row pn-cap" style="margin-top:12px"><span>SPECTRUM</span><span id="pnFps">— FPS</span></div><canvas id="pnSpec" width="440" height="60"></canvas>
  <div id="pnStats"></div>
</div>
<div id="pnLegend" class="pn-mono"></div>
<div id="pnFoot" class="pn-mono"></div>
<div id="pnBot">
  <button id="pnPlay" class="pn-btn wide">Play</button>
  <div class="pn-seg" id="pnMode" title="Play mode"><button data-mode="face" title="Loop the chosen side">Face</button><button data-mode="all" title="Each loop moves on to the next side">All</button><button data-mode="cubes" title="Play the side that faces you">Cubes</button></div>
  <div class="pn-seg" id="pnSides" title="Side to play">${FACES.map((f, i) => `<button data-side="${i}">${f.name}</button>`).join('')}</div>
  <label class="pn-lab">TEMPO <input id="pnTempo" type="number" min="60" max="200" value="120"></label>
  <label class="pn-lab">LOOP <select id="pnLoop"><option value="1">1 bar</option><option value="2" selected>2 bars</option><option value="4">4 bars</option></select></label>
  <div class="pn-seg"><button id="pnScr">Scramble</button><button id="pnUndo">Undo</button><button id="pnSolve">Solve</button></div>
  <button id="pnCam" class="pn-btn" title="Camera moves (C)">Camera</button>
  <button id="pnTxt" class="pn-btn" title="Text layers (T)">Text</button>
  <button id="pnTrk" class="pn-btn" title="Tracks">Tracks</button>
  <button id="pnRec" class="pn-btn" title="Record (R video · Shift+R sound)"><i class="dot"></i>Rec</button>
  <button id="pnLit" class="pn-btn" title="Studio lights">Lights</button>
</div>
<div id="pnLights" class="pn-panel pn-float"><div class="pn-ph"><b>LIGHTS</b><button id="pnLitX" title="Close lights">✕</button></div><div id="pnLightRows"></div>
  <div class="pn-lrow"><span>Quality</span><select id="pnQ"><option value="1">Draft</option><option value="1.25" selected>High</option><option value="1.75">Ultra</option></select></div>
  <div class="pn-lrow"><span>Bloom</span><input type="range" id="pnBloom" min="0" max="1" step="0.01" value="0.6" title="Light bloom amount"></div>
  <div class="pn-lrow"><span>Glow</span><input type="color" id="pnGlow" value="#ffa53a" title="Glow color"><input type="range" id="pnGlowRate" min="0" max="1" step="0.01" value="0" title="Glow color change rate"></div>
  <div class="pn-lrow"><span>Drive</span><button id="pnDrive" class="pn-btn" title="Kicks pulse the cube, snares flash the studio lights">On</button></div></div>
<div id="pnToast" class="pn-mono"></div>
<input type="file" id="pnFile" accept="audio/*" hidden>`;
const toast = (t) => { const el = $('#pnToast'); el.textContent = t; el.classList.add('in'); clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove('in'), 2400); };

// ---------------------------------------------------------------- audio
let ctx = null, master = null, analyser = null, streamDest = null, tap = null, wavOn = false, wavL = [], wavR = [], kitReady = null;
async function ensureAudio() {
  if (!active('pandora')) return false;                       // only the page on screen may make sound
  if (ctx) { if (ctx.state !== 'running') await ctx.resume(); return true; }
  try {
    ctx = new AudioContext({ latencyHint: 'interactive' }); guardAudio('pandora', ctx);
    master = ctx.createGain(); master.gain.value = 0.9; analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -4; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.15;
    streamDest = ctx.createMediaStreamDestination();
    await ctx.audioWorklet.addModule('./chaos-worklet.js');                  // reuses its WAV tap
    tap = new AudioWorkletNode(ctx, 'chaos-tap', { outputChannelCount: [2] }); tap.port.onmessage = (e) => { if (wavOn) { wavL.push(e.data[0]); wavR.push(e.data[1]); } };
    master.connect(lim).connect(tap).connect(analyser); analyser.connect(ctx.destination); analyser.connect(streamDest);
    await loadKit(); return true;
  } catch (err) { toast('Sound could not start: ' + err.message); return false; }
}
function loadKit() {                                         // offline rendering needs no click, so this starts when the page opens
  if (!kitReady) kitReady = renderKit(48000).then((k) => { k.loops.forEach((b, i) => { if (!T[i].file) { T[i].buf = b; T[i].bpm = k.bpm; T[i].bars = k.bars; } }); if (!BT.file) { BT.buf = k.beat; BT.bpm = k.bpm; BT.bars = k.bars; analyseBeat(); } renderRows(); });
  return kitReady;
}
function analyseBeat() {                                    // kick (low) and snare (mid) envelopes, 10 ms frames, for DRIVE
  const d = BT.buf.getChannelData(0), sr = BT.buf.sampleRate, hop = Math.round(sr / 100), n = Math.floor(d.length / hop);
  const k = new Float32Array(n), s = new Float32Array(n); let lp = 0, lp2 = 0, mk = 1e-9, ms = 1e-9;
  for (let f = 0; f < n; f++) { let ek = 0, es = 0; for (let i = f * hop; i < (f + 1) * hop; i++) { lp += (d[i] - lp) * 0.02; lp2 += (d[i] - lp2) * 0.35; ek += lp * lp; const hi = d[i] - lp2 * 0.2 - lp; es += hi * hi; } k[f] = ek; s[f] = es; mk = Math.max(mk, ek); ms = Math.max(ms, es); }
  for (let f = 0; f < n; f++) { k[f] /= mk; s[f] /= ms; } BT.kick = k; BT.snare = s;
}
const stepSec = () => S.bars * 4 * 60 / S.bpm / 16;
let nextT = 0, stepN = 0, schedTimer = 0, playT0 = 0, curStep = -1, curSide = 0, flashes = [];
const lit = new Map();                                      // tile id -> time it lights
function playSlice(buf, offset, dur, rate, when, gain = 1) {
  const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = buf; src.playbackRate.value = rate; src.connect(g).connect(master);
  const len = Math.min(dur, stepSec() + 0.004), f = 0.004; g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + f); g.gain.setValueAtTime(gain, when + Math.max(f, len - f)); g.gain.linearRampToValueAtTime(0, when + len);
  src.start(when, Math.max(0, offset), dur * rate + 0.01); src.stop(when + len + 0.02);
}
function sideFor(loopIx) { if (S.mode === 'all') return (S.side + loopIx) % 6; if (S.mode === 'cubes') return viewSide; return S.side; }
function schedule() {
  while (nextT < ctx.currentTime + 0.12) {
    const s = stepN % 16, loopIx = Math.floor(stepN / 16), f = sideFor(loopIx), tile = side(cube, f)[s], tr = T[tile.track], sp = stepSec();
    if (tr.buf) { const tdur = tr.buf.duration / 16, rate = tr.sync ? tdur / sp : 1; playSlice(tr.buf, tile.slice * tdur, tdur / rate, rate, nextT, 0.9); }
    if (BT.buf) {                                           // the drums run underneath in time, at the song tempo
      const beatsPerStep = S.bars * 4 / 16, bBeats = BT.bars * 4, pos = ((stepN * beatsPerStep) % bBeats) / bBeats * BT.buf.duration, rate = BT.sync ? S.bpm / BT.bpm : 1;
      playSlice(BT.buf, pos, sp * rate, rate, nextT, 0.8);
    }
    flashes.push({ t: nextT, s, f, id: tile.id, stepN });
    nextT += sp; stepN++;
  }
}
async function play(on = !S.playing) {
  if (on && !(await ensureAudio())) return;
  await kitReady; S.playing = on; $('#pnPlay').textContent = on ? 'Stop' : 'Play'; $('#pnPlay').classList.toggle('on', on);
  clearInterval(schedTimer);
  if (on) { nextT = ctx.currentTime + 0.06; playT0 = nextT; stepN = 0; flashes = []; schedTimer = setInterval(schedule, 25); schedule(); } else { curStep = -1; }
}

// ---------------------------------------------------------------- tracks panel
const rowsEl = $('#pnRows');
function renderRows() {
  rowsEl.innerHTML = [...T.map((t, i) => [t, i]), [BT, 6]].map(([t, i]) => `<div class="pn-trow" data-i="${i}" title="${t.hint}">
    <i style="background:${t.col}"></i><span class="nm">${t.name}${t.file ? `<small>${t.file}</small>` : ''}</span>
    ${i === 6 ? `<button data-act="follow" class="sq ${S.follow ? 'on' : ''}" title="Follow: the drums set the tempo">F</button>` : ''}
    <button data-act="sync" class="sq ${t.sync ? 'on' : ''}" title="Sync: stretch to the song tempo">S</button>
    <button data-act="bpm" class="bpm" title="${t.bpm} BPM. Click for half, double or quadruple">${Math.round(t.bpm * 10) / 10}</button>
    <select data-act="bars" title="Length in bars">${[1, 2, 4, 8].map((b) => `<option value="${b}" ${b === t.bars ? 'selected' : ''}>×${b}</option>`).join('')}</select>
    ${i === 6 ? `<button data-act="drive" class="sq wide ${S.drive ? 'on' : ''}" title="Kicks pulse the cube, snares flash the studio lights">DRIVE</button>` : ''}
    <button data-act="load" title="Load a file">+</button><button data-act="remove" title="Remove: back to the kit">×</button></div>`).join('');
  rowsEl.querySelectorAll('.pn-trow').forEach((row) => {
    const i = +row.dataset.i, t = i === 6 ? BT : T[i];
    row.querySelector('[data-act=sync]').onclick = () => { t.sync = !t.sync; renderRows(); };
    row.querySelector('[data-act=bars]').onchange = (e) => { t.bars = +e.target.value; renderRows(); };
    row.querySelector('[data-act=bpm]').onclick = () => { const base = t.baseBpm || t.bpm; t.baseBpm = base; const seq = [base, base / 2, base * 2, base * 4], k = (seq.findIndex((v) => Math.abs(v - t.bpm) < 0.01) + 1) % 4; t.bpm = seq[k]; if (i === 6 && S.follow) setTempo(t.bpm); renderRows(); };
    row.querySelector('[data-act=load]').onclick = () => { pickFor = i; $('#pnFile').click(); };
    row.querySelector('[data-act=remove]').onclick = async () => { t.file = null; kitReady = null; await ensureAudio(); await loadKit(); toast(`${t.name} back to the kit`); };
    if (i === 6) { row.querySelector('[data-act=follow]').onclick = () => { S.follow = !S.follow; if (S.follow) setTempo(BT.bpm); renderRows(); }; row.querySelector('[data-act=drive]').onclick = () => { S.drive = !S.drive; renderRows(); syncUI(); }; }
    row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drop'); }); row.addEventListener('dragleave', () => row.classList.remove('drop'));
    row.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); row.classList.remove('drop'); const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('audio/')); if (f) loadInto(i, f); });
  });
}
let pickFor = 0;
$('#pnFile').addEventListener('change', (e) => { if (e.target.files[0]) loadInto(pickFor, e.target.files[0]); e.target.value = ''; });
async function loadInto(i, file) {
  if (!(await ensureAudio())) return;
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer()), mono = buf.getChannelData(0);
    let bpm = detectBpm(mono, buf.sampleRate) || 120; const bars0 = Math.max(1, Math.round(buf.duration * bpm / 240)), bars = [1, 2, 4, 8].reduce((a, b) => (Math.abs(b - bars0) < Math.abs(a - bars0) ? b : a));
    bpm = bars * 240 / buf.duration;                         // trust the length: whole bars at the detected tempo
    const t = i === 6 ? BT : T[i]; Object.assign(t, { buf, bpm, baseBpm: bpm, bars, file: file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 18) });
    if (i === 6) { analyseBeat(); if (S.follow) setTempo(bpm); }
    renderRows(); toast(`${file.name} → ${t.name} · ${bpm.toFixed(1)} BPM · ${bars} bar${bars > 1 ? 's' : ''}`);
  } catch { toast('Could not read that sound'); }
}
function setTempo(b) { S.bpm = clamp(Math.round(b * 10) / 10, 60, 200); $('#pnTempo').value = S.bpm; }

// ---------------------------------------------------------------- scene
const canvas = $('#pnGl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false, powerPreference: 'default' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
{ const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture; pm.dispose(); }   // a studio to reflect in the glass
const world = new THREE.Group(); scene.add(world);
// the core: a warm light inside the cube that leaks through every gap between the glass tiles
const coreMat = new THREE.MeshBasicMaterial({ color: 0xffb04a, toneMapped: false });
const core = new THREE.Mesh(new THREE.BoxGeometry(3.7, 3.7, 3.7), coreMat); world.add(core);
// inner walls between the cubies, so the seams read as light-filled channels rather than holes
{ const wm = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }); for (const a of [0, 1, 2]) for (const c of [-1, 0, 1]) { const g = new THREE.PlaneGeometry(4.1, 4.1), m = new THREE.Mesh(g, wm); if (a === 0) { m.rotation.y = Math.PI / 2; m.position.x = c; } else if (a === 1) { m.rotation.x = Math.PI / 2; m.position.y = c; } else m.position.z = c; world.add(m); } }
const glowL = new THREE.PointLight(0xffa53a, 3, 9, 1.5); world.add(glowL);
const amb = new THREE.HemisphereLight(0xffffff, 0x202028, 0.35); scene.add(amb);
const dirs = LIGHTS.map(() => { const l = new THREE.DirectionalLight(0xffffff, 1); scene.add(l); return l; });
// a chunky glass brick: rounded square, bevelled, extruded outward from the cubie face
const tileGeo = (() => { const w = 0.8, r = 0.16, h = w / 2, s = new THREE.Shape(); s.moveTo(-h + r, -h); s.lineTo(h - r, -h); s.quadraticCurveTo(h, -h, h, -h + r); s.lineTo(h, h - r); s.quadraticCurveTo(h, h, h - r, h); s.lineTo(-h + r, h); s.quadraticCurveTo(-h, h, -h, h - r); s.lineTo(-h, -h + r); s.quadraticCurveTo(-h, -h, -h + r, -h);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.05, bevelSegments: 4, curveSegments: 8 }); g.translate(0, 0, -0.2); return g; })();
const tileCol = (t) => { const c = new THREE.Color(TRACKS[t.track].col), hsl = {}; c.getHSL(hsl); return c.setHSL((hsl.h + (t.slice / 16 - 0.5) * 0.07 + 1) % 1, Math.min(1, hsl.s * 1.05 + 0.08), Math.max(0.22, Math.min(0.62, hsl.l * 0.85 + (t.slice / 15) * 0.1))); };   // a gentle gradient across each track's tiles
// light from inside: bright and warm in the middle of each tile, falling to the tile's own colour at the rim
const innerGlow = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = g.createRadialGradient(64, 70, 6, 64, 64, 78); r.addColorStop(0, '#ffffff'); r.addColorStop(0.45, '#9a9a9a'); r.addColorStop(1, '#1a1a1a'); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.repeat.set(1 / 0.94, 1 / 0.94); t.offset.set(0.5, 0.5); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; })();
const glassMat = (t) => { const c = tileCol(t); return new THREE.MeshPhysicalMaterial({ color: c.clone().lerp(new THREE.Color(1, 1, 1), 0.35), emissive: c, emissiveMap: innerGlow, emissiveIntensity: 0.25, roughness: 0.32, metalness: 0, transmission: 1, thickness: 0.7, ior: 1.5, attenuationColor: c, attenuationDistance: 0.55, clearcoat: 1, clearcoatRoughness: 0.15, specularIntensity: 1, envMapIntensity: 0.6, iridescence: 0.25, iridescenceIOR: 1.3, iridescenceThicknessRange: [180, 520] }); };
const meshes = cube.tiles.map((t) => { const m = new THREE.Mesh(tileGeo, glassMat(t)); m.userData.id = t.id; m.userData.col = tileCol(t); world.add(m); return m; });
// bloom: the glow and the playing tiles flare
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.4, 0.82); composer.addPass(bloom); composer.addPass(new OutputPass());
// lens: a soft vignette, fine moving grain and a hint of colour fringing towards the corners
const lens = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.32 }, uGrain: { value: 0.035 }, uCA: { value: 0.0016 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVig, uGrain, uCA; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 37.0) * 43758.5453); }
    void main(){ vec2 d = vUv - 0.5; float r2 = dot(d, d); vec2 o = d * uCA * (1.0 + 6.0 * r2);
      vec3 c = vec3(texture2D(tDiffuse, vUv + o).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - o).b);
      c *= mix(1.0, smoothstep(0.85, 0.15, sqrt(r2) * 1.25), uVig); c += (h(vUv * 917.0) - 0.5) * uGrain; gl_FragColor = vec4(c, 1.0); }` });
composer.addPass(lens);
// a soft shadow pooled under the cube, tinted by the glow
const shadowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 4, 64, 64, 64); r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(0.55, 'rgba(0,0,0,.22)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = -3.1; scene.add(shadow);
const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: shadowTex, color: 0xffa53a, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); pool.rotation.x = -Math.PI / 2; pool.position.y = -3.08; scene.add(pool);
// dust motes drifting in the glow
const MOTES = 420, moteGeo = new THREE.BufferGeometry(), moteP = new Float32Array(MOTES * 3), moteV = new Float32Array(MOTES * 3);
for (let i = 0; i < MOTES; i++) { const u = Math.random() * 2 - 1, a = Math.random() * 6.283, r = 3.2 + Math.pow(Math.random(), 0.7) * 4.5, q = Math.sqrt(1 - u * u); moteP.set([r * q * Math.cos(a), r * u * 0.8, r * q * Math.sin(a)], i * 3); moteV.set([(Math.random() - 0.5) * 0.05, 0.02 + Math.random() * 0.05, (Math.random() - 0.5) * 0.05], i * 3); }
moteGeo.setAttribute('position', new THREE.BufferAttribute(moteP, 3));
const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ size: 0.06, map: dotTex, color: 0xffd9a0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); scene.add(motes);
// a flare on each tile as it plays
const flares = Array.from({ length: 6 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); s.scale.setScalar(1.6); world.add(s); return { s, t: -9 }; }); let flareIx = 0;
function flareAt(id, t) { const m = meshes[id], f = flares[flareIx++ % flares.length]; f.s.position.copy(m.position).add(new THREE.Vector3(0, 0, 0.25).applyQuaternion(m.quaternion)); f.s.material.color.copy(m.userData.col).lerp(new THREE.Color(1, 1, 1), 0.5); f.t = t; }
const zAxis = new THREE.Vector3(0, 0, 1);
function placeTiles() { for (const t of cube.tiles) { const m = meshes[t.id]; m.position.set(t.p[0] / 2, t.p[1] / 2, t.p[2] / 2); m.quaternion.setFromUnitVectors(zAxis, new THREE.Vector3(...t.n)); } }
placeTiles();
// turns are queued and animated; the model changes when a turn finishes
const queue = []; let anim = null; const pivot = new THREE.Group(); world.add(pivot);
function enqueue(o) { queue.push(o && o.m ? o : { m: o }); }      // takes { m, fast, record, undo, last } or a bare move
function stepAnim(dt) {
  if (!anim && queue.length) {
    const q = queue.shift(), a = 'xyz'.indexOf(q.m.a), ids = cube.tiles.filter((t) => inLayer(t, a, q.m.k)).map((t) => t.id);
    ids.forEach((id) => pivot.attach(meshes[id])); anim = { ...q, a, ids, t: 0, dur: q.fast ? 0.07 : 0.2 };
  }
  if (!anim) return;
  anim.t += dt; const k = Math.min(1, anim.t / anim.dur), c1 = 0.9, c3 = c1 + 1, e = anim.fast ? k * k * (3 - 2 * k) : 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
  pivot.rotation.set(0, 0, 0); pivot.rotation['xyz'[anim.a]] = e * anim.m.d * Math.PI / 2;
  if (k >= 1) {
    anim.ids.forEach((id) => world.attach(meshes[id])); pivot.rotation.set(0, 0, 0);
    turn(cube, anim.m, !anim.undo && anim.record !== false);
    if (anim.undo) cube.history.pop();                        // the move it undid leaves the history
    if (anim.last) cube.history.length = 0;                   // solved: the history starts again
    moves = cube.history.length;
    notes.unshift(notation(anim.m)); notes.length = Math.min(notes.length, 14);
    placeTiles(); anim = null; renderMap(); mapWav.clear();
  }
}
const notes = [];
// camera: orbit with drag on empty space, auto camera moves
const cam = { az: 44, el: 28, dist: 15.5, vaz: 0 };
let viewSide = 0;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  ensureAudio(); canvas.setPointerCapture(e.pointerId);
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(meshes)[0];
  drag = { x: e.clientX, y: e.clientY, tile: hit ? cube.tiles[hit.object.userData.id] : null, done: false };
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.tile) { cam.az -= dx * 0.3; cam.el = clamp(cam.el + dy * 0.3, -80, 80); cam.vaz = -dx * 0.3; drag.x = e.clientX; drag.y = e.clientY; return; }
  if (drag.done || Math.hypot(dx, dy) < 14) return;
  // which world axis (in the tile's plane) does the drag follow best on screen?
  const t = drag.tile, P = new THREE.Vector3(t.p[0] / 2, t.p[1] / 2, t.p[2] / 2), base = P.clone().project(camera);
  let best = null, bs = -Infinity;
  for (const D of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    if (D[0] * t.n[0] + D[1] * t.n[1] + D[2] * t.n[2] !== 0) continue;
    const q = P.clone().add(new THREE.Vector3(...D).multiplyScalar(0.5)).project(camera), sx = (q.x - base.x) * innerWidth, sy = -(q.y - base.y) * innerHeight, l = Math.hypot(sx, sy) || 1;
    const score = (sx * dx + sy * dy) / l; if (score > bs) { bs = score; best = D; }
  }
  const m = best && dragTurn(t, best); if (m) { enqueue({ m }); drag.done = true; }
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = clamp(cam.dist + e.deltaY * 0.01, 9, 30); }, { passive: false });
canvas.addEventListener('dragover', (e) => { if (active('pandora')) e.preventDefault(); });
canvas.addEventListener('drop', (e) => {                    // a file dropped on the cube goes to the track of the side under the pointer
  if (!active('pandora')) return; e.preventDefault(); e.stopPropagation(); const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('audio/')); if (!f) return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); const hit = ray.intersectObjects(meshes)[0];
  loadInto(hit ? cube.tiles[hit.object.userData.id].track : S.side, f);
});
function resize() { const pr = Math.min(devicePixelRatio || 1, S.quality); renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false); composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

// ---------------------------------------------------------------- the map (unfolded cube)
const NET = { 4: [1, 0], 3: [0, 1], 0: [1, 1], 1: [2, 1], 2: [3, 1], 5: [1, 2] };   // face -> grid column, row
const mapEl = $('#pnMap'), mapWav = new Map();
mapEl.innerHTML = FACES.map((F, f) => `<div class="pn-face" data-f="${f}" draggable="true" style="grid-column:${NET[f][0] + 1};grid-row:${NET[f][1] + 1}" title="${F.name}: click to play it · drag into your DAW as a WAV · Shift+click saves it">${'<i></i>'.repeat(16)}<b>${F.id}</b></div>`).join('');
function renderMap() {
  mapEl.querySelectorAll('.pn-face').forEach((el) => { const f = +el.dataset.f, tl = side(cube, f); el.querySelectorAll('i').forEach((c, s) => { c.style.background = TRACKS[tl[s].track].col; c.classList.toggle('play', S.playing && curSide === f && curStep === s); }); el.classList.toggle('on', f === S.side); });
  const w = wholeness(cube); $('#pnWhole').textContent = wordFor(w); $('#pnPct').textContent = Math.round(w * 100) + '%'; $('#pnWBar i').style.width = w * 100 + '%';
  $('#pnMoves').textContent = 'MOVES ' + String(moves).padStart(4, '0'); $('#pnNot').textContent = notes.length ? notes.join('  ') : 'Turn a layer to begin';
}
async function renderSide(f) {                               // the side's sixteen slices as one WAV, at the song tempo
  const key = f + ':' + S.bpm + ':' + S.bars; if (mapWav.has(key)) return mapWav.get(key);
  if (!(await ensureAudio())) return null; await kitReady;
  const sr = ctx.sampleRate, sp = stepSec(), oc = new OfflineAudioContext(2, Math.ceil(sp * 16 * sr), sr), tl = side(cube, f);
  tl.forEach((tile, s) => { const tr = T[tile.track]; if (!tr.buf) return; const tdur = tr.buf.duration / 16, rate = tr.sync ? tdur / sp : 1, src = oc.createBufferSource(), g = oc.createGain(); src.buffer = tr.buf; src.playbackRate.value = rate; src.connect(g).connect(oc.destination); const t = s * sp; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.004); g.gain.setValueAtTime(0.9, t + sp - 0.004); g.gain.linearRampToValueAtTime(0, t + sp); src.start(t, tile.slice * tdur, sp * rate + 0.01); });
  const b = await oc.startRendering(), blob = new Blob([wav24([b.getChannelData(0)], [b.getChannelData(1)], sr)], { type: 'audio/wav' }), url = URL.createObjectURL(blob);
  const out = { blob, url, name: `niagra-${FACES[f].name.toLowerCase()}-${Math.round(S.bpm)}bpm.wav` }; mapWav.set(key, out); return out;
}
mapEl.querySelectorAll('.pn-face').forEach((el) => {
  const f = +el.dataset.f;
  el.addEventListener('pointerenter', () => { renderSide(f); });         // ready before a drag starts
  el.addEventListener('click', async (e) => { if (e.shiftKey) { const w = await renderSide(f); if (w) download(w.blob, w.name); toast('Saved ' + FACES[f].name.toLowerCase() + ' as a WAV'); return; } selectSide(f); });
  el.addEventListener('dragstart', (e) => { const w = mapWav.get(f + ':' + S.bpm + ':' + S.bars); if (!w) { e.preventDefault(); toast('One moment, the side is still rendering'); return; } e.dataTransfer.setData('DownloadURL', `audio/wav:${w.name}:${w.url}`); e.dataTransfer.effectAllowed = 'copy'; });
});
function selectSide(f) { S.side = f; syncUI(); renderMap(); }
const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };

// ---------------------------------------------------------------- controls
const segs = (sel, attr, fn) => root.querySelectorAll(`${sel} [data-${attr}]`).forEach((b) => b.addEventListener('click', () => fn(b.dataset[attr])));
segs('#pnMode', 'mode', (v) => { S.mode = v; syncUI(); });
segs('#pnSides', 'side', (v) => selectSide(+v));
segs('#pnPaper', 'paper', (v) => { S.paper = v; syncUI(); });
$('#pnPlay').addEventListener('click', () => play());
$('#pnTempo').addEventListener('change', (e) => { setTempo(+e.target.value || 120); mapWav.clear(); });
$('#pnLoop').addEventListener('change', (e) => { S.bars = +e.target.value; mapWav.clear(); });
function scramble() { S.seed = (Math.random() * 0xffffffff) >>> 0; for (const m of scrambleMoves(30, S.seed)) enqueue({ m, fast: true }); $('#pnSeed').textContent = 'SEED ' + S.seed.toString(16).toUpperCase().slice(0, 4) + '·' + S.seed.toString(16).toUpperCase().slice(4, 8); }
function undo() { if (anim || queue.length) return; const last = cube.history[cube.history.length - 1]; if (!last) return toast('Nothing to undo'); enqueue({ m: inverse(last), undo: true }); }
function solve() { if (anim || queue.length) return; const ms = solveMoves(cube); if (!ms.length) return toast('Already whole'); ms.forEach((m, i) => enqueue({ m, fast: true, record: false, last: i === ms.length - 1 })); }
$('#pnScr').addEventListener('click', scramble); $('#pnUndo').addEventListener('click', undo); $('#pnSolve').addEventListener('click', solve);
$('#pnCam').addEventListener('click', () => { S.camAuto = !S.camAuto; syncUI(); });
$('#pnTxt').addEventListener('click', () => { S.text = !S.text; syncUI(); });
$('#pnTrk').addEventListener('click', () => { S.tracks = !S.tracks; syncUI(); });
$('#pnLit').addEventListener('click', () => $('#pnLights').classList.toggle('open'));
$('#pnLitX').addEventListener('click', () => $('#pnLights').classList.remove('open'));
$('#pnQ').addEventListener('change', (e) => { S.quality = +e.target.value; for (const m of meshes) { m.material.transmission = S.quality < 1.1 ? 0 : 1; m.material.transparent = S.quality < 1.1; m.material.opacity = S.quality < 1.1 ? 0.82 : 1; m.material.needsUpdate = true; } resize(); });   // Draft drops refraction for slow machines
$('#pnBloom').addEventListener('input', (e) => { S.bloom = +e.target.value; });
$('#pnGlow').addEventListener('input', (e) => { S.glow = e.target.value; });
$('#pnGlowRate').addEventListener('input', (e) => { S.glowRate = +e.target.value; });
$('#pnDrive').addEventListener('click', () => { S.drive = !S.drive; renderRows(); syncUI(); });
$('#pnLightRows').innerHTML = LIGHTS.map((L, i) => `<div class="pn-lrow" data-l="${i}"><span>${L.name}</span><input type="range" min="-180" max="180" value="${L.az}" data-k="az" title="${L.name} light position"><input type="range" min="-80" max="80" value="${L.el}" data-k="el" title="${L.name} light height"><input type="range" min="0" max="3" step="0.05" value="${L.i}" data-k="i" title="${L.name} brightness"><input type="color" value="${L.col}" data-k="col" title="${L.name} light color"></div>`).join('');
$('#pnLightRows').querySelectorAll('input').forEach((inp) => inp.addEventListener('input', () => { const L = LIGHTS[+inp.closest('[data-l]').dataset.l]; L[inp.dataset.k] = inp.type === 'color' ? inp.value : +inp.value; }));
function syncUI() {
  const on = (sel, attr, val) => root.querySelectorAll(`${sel} [data-${attr}]`).forEach((b) => b.classList.toggle('on', b.dataset[attr] === String(val)));
  on('#pnMode', 'mode', S.mode); on('#pnSides', 'side', S.side); on('#pnPaper', 'paper', S.paper);
  root.classList.toggle('white', S.paper === 'white'); root.classList.toggle('notext', !S.text); root.classList.toggle('notracks', !S.tracks);
  $('#pnCam').classList.toggle('on', S.camAuto); $('#pnTxt').classList.toggle('on', S.text); $('#pnTrk').classList.toggle('on', S.tracks); $('#pnDrive').classList.toggle('on', S.drive); $('#pnDrive').textContent = S.drive ? 'On' : 'Off';
  $('#pnSideL').textContent = FACES[S.side].id; $('#pnSideN').textContent = FACES[S.side].name;
  scene.background = new THREE.Color(S.paper === 'white' ? 0xfbf8f1 : 0x020203); bloom.threshold = S.paper === 'white' ? 0.92 : 0.82;   // tone-mapped, the light paper lands near DAO's warm grey
}
// keys
const typing = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
addEventListener('keydown', (e) => {
  if (!active('pandora') || typing(e) || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space') { e.preventDefault(); play(); }
  else if (k === 'c') $('#pnCam').click(); else if (k === 't') $('#pnTxt').click();
  else if (k === 'r') { e.shiftKey ? recSound() : recVideo(); }
  else if (k === 'u') undo();
  else if (/^[1-6]$/.test(k)) selectSide(+k - 1);
});
// recording
let rec = null;
$('#pnRec').addEventListener('click', (e) => (e.shiftKey ? recSound() : recVideo()));
async function recVideo() {
  if (rec) return stopRec(); if (!(await ensureAudio())) return;
  if (!window.MediaRecorder) return toast('This browser cannot record video');
  const stream = canvas.captureStream(30), at = streamDest.stream.getAudioTracks()[0]; if (at) stream.addTrack(at);
  const type = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=h264', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
  const mr = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 12e6 }), chunks = [];
  mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  mr.onstop = () => { const mt = (mr.mimeType || type || 'video/webm').split(';')[0]; download(new Blob(chunks, { type: mt }), `niagra-${Date.now()}.${mt.includes('mp4') ? 'mp4' : 'webm'}`); };
  mr.start(500); rec = { mr }; $('#pnRec').classList.add('on'); toast('Recording video · R stops');
}
async function recSound() {
  if (rec) return stopRec(); if (!(await ensureAudio())) return;
  wavL = []; wavR = []; wavOn = true; tap.port.postMessage({ on: true }); rec = { wav: true }; $('#pnRec').classList.add('on'); toast('Recording sound · R stops');
}
function stopRec() {
  if (rec.wav) { wavOn = false; tap.port.postMessage({ on: false }); download(new Blob([wav24(wavL, wavR, ctx.sampleRate)], { type: 'audio/wav' }), `niagra-${Date.now()}.wav`); }
  else rec.mr.stop();
  rec = null; $('#pnRec').classList.remove('on'); toast('Saved');
}

// ---------------------------------------------------------------- loop
const WHITE = new THREE.Color(1, 1, 1);
const clock = new THREE.Clock(); let lastT = 0, frames = 0, fps = 60, glowHue = 0, pulse = 0, flash = 0;
const spec = $('#pnSpec'), sg = spec.getContext('2d'), fbins = new Uint8Array(512);
function frame() {
  frames++; if (window.__frames) window.__frames.pandora = (window.__frames.pandora || 0) + 1;
  const t = clock.getElapsedTime(), dt = Math.min(0.05, t - lastT); lastT = t; fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  stepAnim(dt);
  // sequencer position and the tiles it lights
  if (S.playing && ctx) {
    while (flashes.length && flashes[0].t <= ctx.currentTime) { const f = flashes.shift(); curStep = f.s; curSide = f.f; lit.set(f.id, t); flareAt(f.id, t); stepNow = f.stepN; renderMap(); }
    if (S.drive && BT.kick) { const pos = ((ctx.currentTime - playT0) * S.bpm / 60 % (BT.bars * 4)) / (BT.bars * 4) * BT.buf.duration * (BT.sync ? 1 : 1), fr = Math.min(BT.kick.length - 1, Math.max(0, Math.floor(pos * 100))); pulse = Math.max(pulse * 0.86, BT.kick[fr]); flash = Math.max(flash * 0.8, BT.snare[fr] > 0.5 ? BT.snare[fr] : 0); }
  }
  pulse *= 0.92; flash *= 0.9;
  for (const m of meshes) { const tr = cube.tiles[m.userData.id], l = lit.get(tr.id), age = l == null ? 9 : t - l, hot = Math.max(0, 1 - age / 0.4); m.material.emissiveIntensity = 0.15 + S.bloom * 0.35 + hot * 1.8 + (S.drive ? pulse * 0.3 : 0); m.material.color.copy(m.userData.col).lerp(WHITE, hot * 0.45); }
  const gc = S.glowRate > 0 ? new THREE.Color().setHSL(glowHue, 0.8, 0.55) : new THREE.Color(S.glow); coreMat.color.copy(gc).lerp(WHITE, 0.25).multiplyScalar(1.3 + S.bloom * 1.4 + (S.drive ? pulse * 1.4 : 0)); bloom.strength = 0.15 + S.bloom * 0.55 + (S.drive ? flash * 0.3 : 0);
  world.scale.setScalar(1 + (S.drive ? pulse * 0.035 : 0));
  for (const f of flares) { const age = t - f.t; f.s.material.opacity = age < 0.5 ? (1 - age / 0.5) * 0.9 : 0; f.s.scale.setScalar(1.1 + age * 2.2); }
  for (let i = 0; i < MOTES; i++) { const o = i * 3; moteP[o] += moteV[o] * dt + Math.sin(t * 0.3 + i) * 0.002; moteP[o + 1] += moteV[o + 1] * dt; moteP[o + 2] += moteV[o + 2] * dt + Math.cos(t * 0.27 + i) * 0.002; if (moteP[o + 1] > 4.5) moteP[o + 1] = -3.5; }
  moteGeo.attributes.position.needsUpdate = true; motes.material.opacity = (S.paper === 'white' ? 0.35 : 0.6) * (0.7 + S.bloom * 0.5);
  pool.material.opacity = (S.paper === 'white' ? 0.18 : 0.45) * (0.6 + S.bloom * 0.6 + (S.drive ? pulse * 0.6 : 0)); pool.material.color.copy(coreMat.color).multiplyScalar(0.6); shadow.material.opacity = S.paper === 'white' ? 0.9 : 0.6;
  lens.uniforms.uTime.value = t % 100;
  if (S.glowRate > 0) glowHue = (glowHue + dt * S.glowRate * 0.2) % 1;
  glowL.color.set(S.glowRate > 0 ? new THREE.Color().setHSL(glowHue, 0.8, 0.55) : new THREE.Color(S.glow)); glowL.intensity = 1.5 + S.bloom * 4 + (S.drive ? pulse * 4 : 0);
  LIGHTS.forEach((L, i) => { const a = L.az * Math.PI / 180, e = L.el * Math.PI / 180; dirs[i].position.set(Math.sin(a) * Math.cos(e) * 10, Math.sin(e) * 10, Math.cos(a) * Math.cos(e) * 10); dirs[i].color.set(L.col); dirs[i].intensity = L.i * (1 + (S.drive ? flash * 1.6 : 0)); });
  // camera
  if (S.camAuto && !drag) { cam.az += dt * 6; cam.el = 26 + Math.sin(t * 0.21) * 10; } else if (!drag) { cam.az += cam.vaz * 0.1; cam.vaz *= 0.9; }
  const a = cam.az * Math.PI / 180, e = cam.el * Math.PI / 180; camera.position.set(Math.sin(a) * Math.cos(e) * cam.dist, Math.sin(e) * cam.dist, Math.cos(a) * Math.cos(e) * cam.dist); camera.lookAt(0, 0, 0);
  viewSide = facing([camera.position.x / cam.dist, camera.position.y / cam.dist, camera.position.z / cam.dist]);
  composer.render();
  if (frames % 6 === 0) hud(t);
}
let stepNow = 0;
function hud(t) {
  const secs = S.playing && ctx ? Math.max(0, ctx.currentTime - playT0) : 0, ff = Math.floor((secs % 1) * 30), z = (n, w = 2) => String(n).padStart(w, '0');
  $('#pnTime').textContent = `TC ${z(Math.floor(secs / 3600))}:${z(Math.floor(secs / 60) % 60)}:${z(Math.floor(secs) % 60)}:${z(ff)}`;
  const beat = secs * S.bpm / 60; $('#pnBar').textContent = `BAR ${z(Math.floor(beat / 4) + 1, 3)} · ${Math.floor(beat % 4) + 1} · ${Math.floor((beat % 1) * 4) + 1}`; $('#pnFrame').textContent = 'FRAME ' + z(frames, 6);
  $('#pnStep').textContent = S.playing && curStep >= 0 ? `${z(curStep + 1)} / 16` : '— / —';
  $('#pnFps').textContent = Math.round(fps) + ' FPS';
  $('#pnStats').textContent = `CAM   AZ ${z(((Math.round(cam.az) % 360) + 360) % 360, 3)}°  EL ${cam.el >= 0 ? '+' : '−'}${z(Math.abs(Math.round(cam.el)))}°  D ${cam.dist.toFixed(1)}\nVIEW  ${FACES[viewSide].name}   MODE ${S.mode.toUpperCase()}\n` + LIGHTS.map((L) => `${L.name.toUpperCase().padEnd(5)} AZ ${L.az >= 0 ? '+' : '−'}${z(Math.abs(L.az), 3)}  EL ${L.el >= 0 ? '+' : '−'}${z(Math.abs(L.el))}  ×${L.i.toFixed(2)}`).join('\n') + `\nGLOW  ${S.glowRate > 0 ? 'CYCLING' : 'FIXED · ' + S.glow.toUpperCase()}\nDRUM  K ${z(Math.round(pulse * 9999), 4)}  S ${z(Math.round(flash * 9999), 4)}\nRENDER ${S.quality}×`;
  const day = new Date(), date = `${day.getFullYear()}.${z(day.getMonth() + 1)}.${z(day.getDate())}`;
  $('#pnTicker').textContent = (TRACKS.map((tr, i) => T[i].file ? T[i].file.toUpperCase() : tr.name).join(' · ') + ` · ${Math.round(S.bpm)} BPM · ${S.bars} BAR LOOP · ${date} · 64 CUBIES · 6 VOICES · ${S.playing ? 'PLAYING' : 'AT REST'} · `).repeat(2);
  $('#pnFoot').textContent = `${FACES[S.mode === 'cubes' ? viewSide : S.side].name} · ${z((S.playing && curStep >= 0 ? curStep : 0) + 1)}/16`;
  if (analyser) { analyser.getByteFrequencyData(fbins); sg.clearRect(0, 0, spec.width, spec.height); sg.fillStyle = getComputedStyle(root).getPropertyValue('--ink'); for (let i = 0; i < 88; i++) { const v = fbins[Math.floor(Math.pow(i / 88, 2) * 400)] / 255; sg.fillRect(i * 5, spec.height - v * spec.height, 3, v * spec.height); } }
}

// ---------------------------------------------------------------- boot
$('#pnLegend').innerHTML = TRACKS.map((t) => `<span><i style="background:${t.col}"></i>${t.name}</span>`).join('');
resize(); syncUI(); renderRows(); renderMap(); loadKit();
renderer.setAnimationLoop(frame);
window.__pandoraApp = { start() { renderer.setAnimationLoop(frame); if (active('pandora')) ctx?.resume(); }, stop() { renderer.setAnimationLoop(null); if (S.playing) play(false); ctx?.suspend(); } };
window.__p = { S, T, BT, get cube() { return cube; }, get moves() { return moves; }, get curStep() { return curStep; }, get frames() { return frames; }, get busy() { return !!anim || queue.length > 0; }, get audio() { return ctx?.state ?? 'none'; },
  rms: () => { if (!analyser) return 0; const b = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(b); let s = 0; for (const v of b) s += v * v; return Math.sqrt(s / b.length); },
  get kitReady() { return kitReady; }, play, ensureAudio, enqueue, scramble, undo, solve, selectSide, renderSide, loadInto, wholeness: () => wholeness(cube), get viewSide() { return viewSide; }, ready: true };
