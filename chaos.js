// Migros: a point follows three equations through space; its path plays a synth. Original code for BodyBeat. Sound engine in chaos-worklet.js, graph in chaos-audio.js, maths in chaos-core.js.
import * as THREE from './vendor/three.module.js';
import { SYSTEMS, FAMILIES, byId, rk4, analyse, stateOf, DIVS, loopHz, doublingBeats, noteName, peaks } from './chaos-core.js';
import * as AU from './chaos-audio.js';
import { active } from './site-state.js';

THREE.ColorManagement.enabled = false;
const root = document.getElementById('app-chaos');
const $ = (s) => root.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- state
const S = {
  sys: 'lorenz', bpm: 66, rate: 4 / 7, rateMode: 'sync', keyMode: 'free', colA: '#f1f3f5', colB: '#ea3a2f',
  vb: 3, phase: 45, sound: 'synth', shape: 2, pitch: 0, sub: 40, fm: 0, fold: 0, noise: 0, tone: 70, res: 3.9, drive: 35,
  level: 50, pan: 0, width: 50, poly: 'chord', attack: 8, release: 350, glide: 60, latch: false, oct: 3,
  echo: 0, reverb: 0, chorus: 0, crush: 0, freeze: false, draw: 'thread', space: 'stars', axes: true, plane: false,
  pos: 0, slice: 80, grid: 0, sbpm: 120, root: 60, start: 'free', kp: 28,
};
const routes = { tone: { src: 'z', amt: 0.55 }, level: { src: 'v', amt: 0.3 }, pan: { src: 'y', amt: 0.15 } };   // source -> knob
const SRC = { x: { g: 'x', nm: 'X', col: '--cx', tip: 'where the point is along x' }, y: { g: 'y', nm: 'Y', col: '--cy', tip: 'where the point is along y' }, z: { g: 'z', nm: 'Z', col: '--cz', tip: 'where the point is along z' }, v: { g: 'v', nm: 'SPEED', col: '--cv', tip: 'how fast the point is moving' }, d: { g: 'δ', nm: 'GAP', col: '--cd', tip: 'how far voice B has drifted from voice A' } };
const SHAPES = ['SINE', 'TRI', 'SAW', 'SQR'];
const fmtShape = (v) => (v < 3 ? SHAPES[Math.round(v)] : v < 3.05 ? 'SQR' : 'PW' + Math.round((0.5 - 0.45 * (v - 3)) * 100));
const fmtMs = (v) => (v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 's' : Math.round(v) + 'ms');
const GRIDS = ['OFF', '1/4', '1/8', '1/16', '1/32'];
// knob definitions: min, max, default, curve, label, formatter, routable
const K = {
  kp: { nm: 'ρ', min: 10, max: 110, fmt: (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(Math.abs(v) < 1 ? 3 : 2)), tip: "the system's own parameter" },
  bpm: { nm: 'BPM', min: 40, max: 240, step: 1, fmt: (v) => String(Math.round(v)) },
  rate: { nm: 'RATE', min: 0, max: 1, fmt: () => rateLabel() },
  vb: { nm: 'VOICE B', min: 0, max: 3, step: 1, fmt: (v) => ['OFF', 'UNI', '5TH', 'OCT'][Math.round(v)], tip: 'the second point: off, in unison, a fifth up or an octave up' },
  phase: { nm: 'PHASE', min: 0, max: 180, fmt: (v) => Math.round(v) + '°', tip: 'how far along the path voice B starts ahead of voice A, up to half a loop' },
  shape: { nm: 'SHAPE', min: 0, max: 4, fmt: fmtShape, r: 1, tip: 'sine, triangle, saw, square, then the square narrows to a thin pulse' },
  pitch: { nm: 'PITCH', min: -24, max: 24, step: 1, fmt: (v) => (v > 0 ? '+' : '') + Math.round(v), r: 1 },
  sub: { nm: 'SUB', min: 0, max: 100, fmt: (v) => Math.round(v), r: 1, tip: 'a sine an octave below' },
  fm: { nm: 'FM', min: 0, max: 100, fmt: (v) => Math.round(v), r: 1, tip: 'a second sine at the same note swings the pitch of the wave, up to twelve times its own frequency: from clean to a hard growl' },
  fold: { nm: 'FOLD', min: 0, max: 100, fmt: (v) => Math.round(v), r: 1, tip: 'pushes the wave past its top so it folds back on itself' },
  noise: { nm: 'NOISE', min: 0, max: 100, fmt: (v) => Math.round(v), r: 1, tip: 'air and grit, through the same drive and filter' },
  tone: { nm: 'TONE', min: 0, max: 100, fmt: (v) => Math.round(v), r: 1, tip: 'filter cutoff' },
  res: { nm: 'RES', min: 0.5, max: 20, fmt: (v) => v.toFixed(1), r: 1, tip: 'filter resonance' },
  drive: { nm: 'DRIVE', min: 0, max: 100, fmt: (v) => Math.round(v), r: 1 },
  level: { nm: 'LEVEL', min: 0, max: 100, fmt: (v) => Math.round(v), r: 1 },
  pan: { nm: 'PAN', min: -100, max: 100, fmt: (v) => (Math.abs(v) < 2 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v))), r: 1 },
  width: { nm: 'WIDTH', min: 0, max: 100, fmt: (v) => Math.round(v), r: 1, tip: 'how far apart voices A and B sit, left and right' },
  attack: { nm: 'ATTACK', min: 1, max: 2000, curve: 'exp', fmt: fmtMs },
  release: { nm: 'RELEASE', min: 10, max: 5000, curve: 'exp', fmt: fmtMs },
  glide: { nm: 'GLIDE', min: 0, max: 1000, fmt: fmtMs, tip: 'how long the pitch takes to slide to a new note' },
  pos: { nm: 'POSITION', min: 0, max: 100, fmt: (v) => Math.round(v), r: 1, tip: 'where in your sound the keys read' },
  slice: { nm: 'SLICE', min: 10, max: 500, curve: 'exp', fmt: fmtMs, r: 1, tip: 'how long each slice of your sound is' },
  grid: { nm: 'GRID', min: 0, max: 4, step: 1, fmt: (v) => GRIDS[Math.round(v)], tip: "your sound's beat grid: in Scrub the movement stays free; in Grains it steps too. Off is free" },
  sbpm: { nm: 'BPM', min: 60, max: 200, step: 1, fmt: (v) => String(Math.round(v)), tip: 'the tempo of your sound, found when it loaded; set it if the guess is off' },
  root: { nm: 'ROOT', min: 24, max: 96, step: 1, fmt: (v) => noteName(Math.round(v)), tip: 'the note your sound was recorded at' },
  echo: { nm: 'ECHO', min: 0, max: 100, fmt: (v) => Math.round(v), r: 1, tip: 'repeats in step with the tempo, bouncing left and right; further round, louder and more of them' },
  reverb: { nm: 'REVERB', min: 0, max: 100, fmt: (v) => Math.round(v), r: 1, tip: 'a large room behind the sound' },
  chorus: { nm: 'CHORUS', min: 0, max: 100, fmt: (v) => Math.round(v), r: 1, tip: 'two copies drifting slightly out of tune, one in each ear: wider and thicker' },
  crush: { nm: 'CRUSH', min: 0, max: 100, fmt: (v) => Math.round(v), r: 1, tip: 'fewer samples and fewer steps: grit, then digital ruin' },
};
const DEF = Object.fromEntries(Object.keys(K).map((k) => [k, S[k]]));
const rateHz = () => (S.rateMode === 'free' ? 0.05 * Math.pow(400, S.rate) : loopHz({ bpm: S.bpm, rateIx: Math.round(S.rate * 7), mode: S.rateMode }));
function rateLabel() { return S.rateMode === 'free' ? rateHz().toFixed(rateHz() < 1 ? 2 : 1) + 'Hz' : DIVS[Math.round(S.rate * 7)][0]; }

// ---------------------------------------------------------------- markup
const knobHTML = (k, cls = '') => `<div class="knob ${cls}" data-k="${k}" title="${(K[k].tip || K[k].nm.toLowerCase()) + ' · drag up or down, click to type, double-click to reset'}"><svg viewBox="0 0 46 46"><circle cx="23" cy="23" r="17" fill="none" stroke="var(--hair)" stroke-width="1.2" stroke-dasharray="80 27" transform="rotate(135 23 23)"/><path class="arc" fill="none" stroke="var(--ink)" stroke-width="1.6"/><path class="mod" fill="none" stroke-width="2.4" opacity=".9"/><line class="tick" stroke="var(--ink)" stroke-width="1.4"/></svg><span class="val"></span><span class="nm">${K[k].nm}</span></div>`;
root.innerHTML = `
<canvas id="chGl"></canvas><canvas id="chOv"></canvas>
<div id="chLeft">
  <h1>MIGROS<small>A BODYBEAT PAGE</small></h1>
  <button id="chSysBtn" title="Open the library of systems"><span id="chSysName">LORENZ</span><span>›</span></button>
  <div id="chBy" class="cap"></div>
  <div id="chEq" title="The equations and their live values"></div>
  <div id="chParams"></div>
  <div id="chXYZ"></div>
  <div class="row"><span class="cap">Note</span><span class="v" id="chNote">—</span></div>
  <div class="row"><span class="cap">One loop</span><span class="v" id="chLoop"></span></div>
  <div class="row" title="The largest Lyapunov exponent: how fast two nearby paths separate"><span class="cap">State</span><span class="v" id="chState"></span></div>
  <div class="row"><span class="cap">A gap doubles</span><span class="v" id="chDouble"></span></div>
  <div class="row"><span class="cap"><span style="color:var(--A)">A</span> ↔ <span style="color:var(--B)">B</span></span><span class="v" id="chGapV"></span></div>
  <div id="chGap"><i></i></div>
</div>
<div id="chView">
  <div class="pill" id="chSpace" title="What fills the space around the figure"><button data-space="none">None</button><button data-space="ripples" title="Earlier loops rippling outward">Ripples</button><button data-space="stars" title="A far field of stars behind the figure">Stars</button><button data-space="notes" title="Each note lights a star somewhere in the space, and its light falls on the figure">Notes</button><button data-space="wash" title="Each note washes the figure with a wide light from round the camera">Wash</button></div>
  <div class="pill"><button id="chAxes" title="The x, y and z axes">Axes</button><button id="chPlane" title="A plane through the figure: each crossing leaves a dot (3)">Plane</button></div>
  <div class="pill" id="chDraw" title="How the figure is drawn (4)"><button data-draw="thread">Thread</button><button data-draw="comet">Comet</button><button data-draw="dust">Dust</button><button data-draw="ghost">Ghost</button></div>
</div>
<div id="chTR"><button id="chFull" class="cap" title="Full screen (5)">⛶</button></div>
<div id="chHint" class="cap">A W S E D F T G Y H U J K play · Z X octave · Space latch · 1 reset B · 2 freeze · 3 plane · 4 draw · 5 full screen · 0 hide</div>
<div id="chToast" class="cap"></div>
<div id="chRight" title="Controls">
  <div class="sec" style="margin-top:0"><div class="hd"><span class="cap">Motion</span></div>
    <div class="knobs">${knobHTML('kp')}${knobHTML('bpm')}${knobHTML('rate')}</div>
    <div class="seg"><span class="cap">Key</span><div class="pill" id="chKey" title="What a key press does to the point"><button data-key="free" title="The point keeps travelling; every note catches a different movement">Free</button><button data-key="restart" title="Every key restarts the point from the same spot">Restart</button></div></div>
    <div class="seg"><span class="cap">Rate</span><div class="pill" id="chRateMode" title="How the rate is set: follow the tempo, or run at a frequency of its own"><button data-rm="sync">Sync</button><button data-rm="trip" title="Triplet: two thirds as long">Trip</button><button data-rm="dot" title="Dotted: half as long again">Dot</button><button data-rm="free" title="Its own frequency, in Hz">Hz</button></div></div>
  </div>
  <div class="sec"><div class="hd"><span class="cap">Voices</span><span title="The colour of each voice"><span class="cap">A</span> <label class="sw" id="chSwA" title="Colour of voice A (double-click: back to white)"><input type="color" value="#f1f3f5"></label> &nbsp;<span class="cap">B</span> <label class="sw" id="chSwB" title="Colour of voice B (double-click: back to red)"><input type="color" value="#ea3a2f"></label></span></div>
    <div class="knobs">${knobHTML('vb')}${knobHTML('phase')}<div class="knob" id="chResetB" title="Put voice B back at its phase from voice A (1)"><svg viewBox="0 0 46 46"><circle cx="23" cy="23" r="17" fill="none" stroke="var(--hair)"/><circle cx="19" cy="23" r="4" fill="var(--A)"/><circle cx="27" cy="23" r="4" fill="var(--B)"/></svg><span class="nm">RESET B</span></div></div>
  </div>
  <div class="sec"><div class="hd"><span class="cap">Sources</span><span class="cap" style="letter-spacing:.06em;text-transform:none">drag one onto a knob</span></div>
    <div id="chSrc">${Object.entries(SRC).map(([k, s]) => `<div class="chip" data-src="${k}" style="color:var(${s.col})" title="${s.g}: ${s.tip}. Drag it onto a knob."><i>${s.g}</i><span>${s.nm}</span></div>`).join('')}</div>
  </div>
  <div class="sec"><div class="hd"><span class="cap">Sound</span><button class="btn" id="chLoad" style="padding:5px 10px" title="Load a sound of your own, or drop a file anywhere on the page">Load a sound</button></div>
    <div class="seg" style="margin-top:0"><span class="cap">Keys play</span><div class="pill" id="chMode" title="What the keys play"><button data-mode="synth" title="The synth">Synth</button><button data-mode="scrub" title="Your sound, read exactly where Position is: it follows the movement forward and back">Scrub</button><button data-mode="grains" title="Your sound as grains: each key plays it at its pitch from where Position is">Grains</button></div></div>
    <div id="chSample"><canvas id="chWave" width="460" height="92" title="Your sound. Drag to choose the section Position plays through; drag its edges to adjust; double-click for all of it."></canvas>
      <div class="knobs">${knobHTML('pos')}${knobHTML('slice')}${knobHTML('grid')}${knobHTML('sbpm')}${knobHTML('root')}</div>
      <div class="seg"><span class="cap">Start</span><div class="pill" id="chStart" title="Where a note starts"><button data-start="free" title="A note starts wherever the movement has Position">Free</button><button data-start="knob" title="Every note starts where the Position knob is">Knob</button></div></div>
    </div>
    <div class="knobs">${knobHTML('shape')}${knobHTML('pitch')}${knobHTML('sub')}</div>
  </div>
  <div class="sec"><div class="hd"><span class="cap">Colour</span></div><div class="knobs">${knobHTML('fm')}${knobHTML('fold')}${knobHTML('noise')}</div></div>
  <div class="sec"><div class="hd"><span class="cap">Filter</span></div><div class="knobs">${knobHTML('tone')}${knobHTML('res')}${knobHTML('drive')}</div></div>
  <div class="sec"><div class="hd"><span class="cap">Output</span></div><div class="knobs">${knobHTML('level')}${knobHTML('pan')}${knobHTML('width')}</div></div>
  <div class="sec"><div class="hd"><span class="cap">Envelope</span><div class="pill" id="chPoly" title="How many notes sound at once"><button data-poly="mono" title="One note at a time; overlapping keys slide">Mono</button><button data-poly="chord" title="Up to four keys sound together">Chord</button></div></div>
    <div class="knobs">${knobHTML('attack')}${knobHTML('release')}${knobHTML('glide')}</div></div>
</div>
<div id="chBot">
  <div style="display:flex;flex-direction:column;gap:8px"><button class="btn" id="chLatch" title="Keep the note sounding after you let go (space)"><span class="led"></span>Latch</button>
    <div id="chOct"><button id="chOctDn" title="Octave down (Z)">−</button><b id="chOctL">C3</b><button id="chOctUp" title="Octave up (X)">+</button></div></div>
  <div id="chFx" title="Effects">${knobHTML('echo', 'small')}${knobHTML('reverb', 'small')}${knobHTML('chorus', 'small')}${knobHTML('crush', 'small')}</div>
  <div id="chKeys" title="Keyboard"></div>
  <div id="chRightBtns"><button class="btn" id="chFreeze" title="Hold the point where it is (2)"><span class="led"></span>Freeze</button><button class="btn" id="chMidi" title="Play from a MIDI keyboard"><span class="led"></span>MIDI</button>
    <button class="btn" id="chShot" title="Save this view as an image">Save image</button><button class="btn" id="chRecBtn" title="Record the figure and the sound"><span id="chRecDot"></span><span id="chRecL">Record</span></button></div>
</div>
<input type="file" id="chFile" accept="audio/*" hidden>
<div class="modal" id="chLib"><div class="sheet"><h3><span id="chLibCount">Library</span><button id="chLibX" title="Close the library">✕</button></h3><nav id="chLibList" aria-label="Library of chaotic systems"></nav></div></div>
<div class="modal" id="chRec"><div class="sheet"><h3><span>Record</span><button id="chRecX">✕</button></h3>
  <div class="cap">Frame</div><div class="opts" id="chRecFrame"><button data-f="vertical">Vertical</button><button data-f="portrait">Portrait</button><button data-f="wide">Wide</button><button data-f="square">Square</button><button data-f="wav" title="No picture, a 24-bit WAV">Sound only (WAV)</button></div>
  <div class="cap">Quality</div><div class="opts" id="chRecQ"><button data-q="1080" title="1080 pixels on the short side">1080</button><button data-q="2160" title="2160 pixels on the short side. Heavier: it needs a strong graphics card">2160</button></div>
  <div class="cap">What the film shows</div><div class="opts" id="chRecShow"><button data-s="figure" title="The figure, its name and its numbers">Figure</button><button data-s="knobs" title="Also the knobs in use, moving, and which source drives which knob">Figure + knobs</button></div>
  <button class="btn" id="chRecGo"><span id="chRecDot2" style="width:8px;height:8px;border-radius:50%;background:var(--B);display:inline-block"></span>Start recording</button></div></div>`;

const toast = (t) => { const el = $('#chToast'); el.textContent = t; el.classList.add('in'); clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove('in'), 2400); };

// ---------------------------------------------------------------- knobs + routes
const kv = (k) => (k === 'kp' ? S.kp : S[k]);
const toN = (k, v) => { const d = K[k]; return d.curve === 'exp' ? Math.log(v / d.min) / Math.log(d.max / d.min) : (v - d.min) / (d.max - d.min); };
const fromN = (k, n) => { const d = K[k]; n = clamp(n, 0, 1); let v = d.curve === 'exp' ? d.min * Math.pow(d.max / d.min, n) : d.min + n * (d.max - d.min); if (d.step) v = Math.round(v / d.step) * d.step; return v; };
const arcPath = (a0, a1) => { const r = 17, p = (a) => [23 + r * Math.cos(a), 23 + r * Math.sin(a)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} ${a1 > a0 ? 1 : 0} ${x1.toFixed(2)},${y1.toFixed(2)}`; };
const A0 = Math.PI * 0.75, SPAN = Math.PI * 1.5;
function drawKnob(k, effN) {
  const el = root.querySelector(`.knob[data-k="${k}"]`); if (!el) return;
  const n = clamp(toN(k, kv(k)), 0, 1), a = A0 + n * SPAN;
  el.querySelector('.arc').setAttribute('d', n > 0.002 ? arcPath(A0, a) : '');
  const t = el.querySelector('.tick'); t.setAttribute('x1', 23 + 12 * Math.cos(a)); t.setAttribute('y1', 23 + 12 * Math.sin(a)); t.setAttribute('x2', 23 + 18 * Math.cos(a)); t.setAttribute('y2', 23 + 18 * Math.sin(a));
  const v = el.querySelector('.val'); if (v.contentEditable !== 'true') v.textContent = K[k].fmt(kv(k));
  const m = el.querySelector('.mod'), rt = routes[k];
  if (rt && effN != null) { const b = A0 + clamp(effN, 0, 1) * SPAN; m.setAttribute('d', Math.abs(b - a) > 0.01 ? arcPath(Math.min(a, b), Math.max(a, b)) : ''); m.setAttribute('stroke', `var(${SRC[rt.src].col})`); } else m.setAttribute('d', '');
  let bd = el.querySelector('.badge');
  if (rt) { if (!bd) { bd = document.createElement('span'); bd.className = 'badge'; el.appendChild(bd); bindBadge(bd, k); } bd.textContent = SRC[rt.src].g; bd.style.color = `var(${SRC[rt.src].col})`; bd.title = `${SRC[rt.src].g} → ${K[k].nm[0] + K[k].nm.slice(1).toLowerCase()}, ${rt.amt > 0 ? '+' : ''}${Math.round(rt.amt * 100)}%. Drag up or down to change, double-click to remove.`; }
  else if (bd) bd.remove();
}
function setKnob(k, v) {
  const d = K[k]; v = clamp(v, Math.min(d.min, d.max), Math.max(d.min, d.max)); if (d.step) v = Math.round(v / d.step) * d.step;
  if (k === 'kp') { S.kp = v; sys.p[sys.k] = v; scheduleReanalyse(); } else S[k] = v;
  if (k === 'vb' || k === 'phase') { pushCfg(); if (k === 'phase') resetB(); }
  if (['attack', 'release', 'glide', 'width', 'slice', 'grid', 'sbpm', 'root'].includes(k)) pushCfg();
  drawKnob(k);
}
function bindKnob(el) {
  const k = el.dataset.k; let drag = null;
  el.addEventListener('pointerdown', (e) => { if (e.target.classList.contains('badge') || e.target.isContentEditable) return; e.preventDefault(); el.setPointerCapture(e.pointerId); drag = { y: e.clientY, n: toN(k, kv(k)), moved: false }; ensureAudio(); });
  el.addEventListener('pointermove', (e) => { if (!drag) return; const dy = drag.y - e.clientY; if (Math.abs(dy) > 3) drag.moved = true; if (drag.moved) setKnob(k, fromN(k, drag.n + dy / (e.shiftKey ? 600 : 160))); });
  el.addEventListener('pointerup', () => { if (drag && !drag.moved) typeInto(el, k); drag = null; });
  el.addEventListener('dblclick', (e) => { if (e.target.classList.contains('badge')) return; setKnob(k, k === 'kp' ? sys.def : DEF[k]); });
  el.addEventListener('wheel', (e) => { e.preventDefault(); setKnob(k, fromN(k, toN(k, kv(k)) - Math.sign(e.deltaY) * 0.02)); }, { passive: false });
}
function typeInto(el, k) {                                   // click and type a value
  const v = el.querySelector('.val'); v.contentEditable = 'true'; v.textContent = String(+kv(k).toFixed(3)); v.focus(); document.getSelection().selectAllChildren(v);
  const done = (ok) => { if (v.contentEditable !== 'true') return; v.contentEditable = 'false'; const x = parseFloat(v.textContent.replace(/[^\d.+-]/g, '')); if (ok && Number.isFinite(x)) setKnob(k, x); drawKnob(k); };
  v.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); done(true); } if (e.key === 'Escape') done(false); };
  v.onblur = () => done(true);
}
function bindBadge(bd, k) {
  let d = null;
  bd.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); bd.setPointerCapture(e.pointerId); d = { y: e.clientY, a: routes[k].amt }; });
  bd.addEventListener('pointermove', (e) => { if (!d || !routes[k]) return; routes[k].amt = clamp(d.a + (d.y - e.clientY) / 150, -1, 1); drawKnob(k); refreshRouteLabels(); });
  bd.addEventListener('pointerup', () => { d = null; });
  bd.addEventListener('dblclick', (e) => { e.stopPropagation(); delete routes[k]; drawKnob(k); refreshRouteLabels(); });
}
root.querySelectorAll('.knob[data-k]').forEach(bindKnob);
// drag a source chip onto a knob
root.querySelectorAll('.chip').forEach((c) => c.addEventListener('pointerdown', (e) => {
  e.preventDefault(); const src = c.dataset.src, g = document.createElement('div'); g.className = 'ghost'; g.textContent = SRC[src].g; g.style.color = `var(${SRC[src].col})`; root.appendChild(g);
  const move = (ev) => { g.style.left = ev.clientX + 'px'; g.style.top = ev.clientY + 'px'; root.querySelectorAll('.knob.drop').forEach((x) => x.classList.remove('drop')); const t = targetKnob(ev); if (t) t.classList.add('drop'); };
  const up = (ev) => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); g.remove(); root.querySelectorAll('.knob.drop').forEach((x) => x.classList.remove('drop')); const t = targetKnob(ev); if (t) routeTo(src, t.dataset.k); };
  move(e); addEventListener('pointermove', move); addEventListener('pointerup', up);
}));
const targetKnob = (ev) => { const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.knob[data-k]'); return el && K[el.dataset.k].r ? el : null; };
function routeTo(src, k) { if (!K[k]?.r) return false; routes[k] = { src, amt: routes[k]?.src === src ? routes[k].amt : 0.3 }; drawKnob(k); refreshRouteLabels(); toast(`${SRC[src].g} → ${K[k].nm.toLowerCase()}`); return true; }
function refreshRouteLabels() { for (const a of ['x', 'y', 'z']) { const el = root.querySelector(`#chXYZ [data-r="${a}"]`); if (el) { const ks = Object.keys(routes).filter((k) => routes[k].src === a); el.textContent = ks.length ? '→ ' + ks.map((k) => K[k].nm).join(' · ') : 'FREE'; } } }

// pills
function pill(sel, attr, key, cb) { root.querySelectorAll(`${sel} [data-${attr}]`).forEach((b) => b.addEventListener('click', () => { S[key] = b.dataset[attr]; syncPills(); cb?.(); })); }
function syncPills() {
  const on = (sel, attr, val) => root.querySelectorAll(`${sel} [data-${attr}]`).forEach((b) => b.classList.toggle('on', b.dataset[attr] === val));
  on('#chSpace', 'space', S.space); on('#chDraw', 'draw', S.draw); on('#chKey', 'key', S.keyMode); on('#chRateMode', 'rm', S.rateMode); on('#chMode', 'mode', S.sound); on('#chPoly', 'poly', S.poly); on('#chStart', 'start', S.start);
  $('#chAxes').classList.toggle('on', S.axes); $('#chPlane').classList.toggle('on', S.plane); $('#chLatch').classList.toggle('on', S.latch); $('#chFreeze').classList.toggle('on', S.freeze);
}
pill('#chSpace', 'space', 'space', () => { ripples.forEach((r) => r.line.removeFromParent()); ripples.length = 0; });
pill('#chDraw', 'draw', 'draw', seedDust);
pill('#chKey', 'key', 'keyMode');
pill('#chRateMode', 'rm', 'rateMode', () => drawKnob('rate'));
pill('#chMode', 'mode', 'sound', () => { if (S.sound !== 'synth' && !sample) { S.sound = 'synth'; syncPills(); toast('Load a sound first'); } pushCfg(); });
pill('#chPoly', 'poly', 'poly', () => { AU.allOff(); held.clear(); latched.clear(); pushCfg(); });
pill('#chStart', 'start', 'start');
$('#chAxes').addEventListener('click', () => { S.axes = !S.axes; syncPills(); });
$('#chPlane').addEventListener('click', () => togglePlane());
const togglePlane = () => { S.plane = !S.plane; planeDots.n = 0; syncPills(); };
const cycleDraw = () => { const L = ['thread', 'comet', 'dust', 'ghost']; S.draw = L[(L.indexOf(S.draw) + 1) % 4]; syncPills(); seedDust(); toast('Draw: ' + S.draw); };
function seedDust() {                                       // Dust starts from the path already travelled, then keeps growing
  if (S.draw !== 'dust' || dustCount) return; const p = dustGeo.attributes.position.array;
  for (let i = 0; i < countA; i++) { const s = ((headA - countA + i) % TR + TR) % TR; p[dustHead * 3] = ringA[s * 3]; p[dustHead * 3 + 1] = ringA[s * 3 + 1]; p[dustHead * 3 + 2] = ringA[s * 3 + 2]; dustHead = (dustHead + 1) % DUST; dustCount = Math.min(DUST, dustCount + 1); }
  dustGeo.attributes.position.needsUpdate = true;
}
for (const [id, key, def] of [['#chSwA', 'colA', '#f1f3f5'], ['#chSwB', 'colB', '#ea3a2f']]) {
  const lab = $(id), inp = lab.querySelector('input'), paint = () => { lab.style.background = S[key]; root.style.setProperty(key === 'colA' ? '--A' : '--B', S[key]); };
  inp.addEventListener('input', () => { S[key] = inp.value; paint(); }); lab.addEventListener('dblclick', (e) => { e.preventDefault(); S[key] = def; inp.value = def; paint(); }); paint();
}

// ---------------------------------------------------------------- the system and its two points
let sys = null, ana = null, reTimer = 0;
const A = { st: new Float64Array(3), th: 0, n: [0, 0, 0], v: 0 }, B = { st: new Float64Array(3), th: 0, n: [0, 0, 0], v: 0 };
const shadow = new Float64Array(3); let lyapLive = 0, vRef = 1, lastNote = null;
function loadSystem(id) {
  const base = byId(id); if (!base) return;
  sys = { ...base, p: { ...base.p }, def: base.p[base.k] }; S.sys = id; S.kp = sys.p[sys.k];
  K.kp.nm = sys.k; K.kp.min = Math.min(...sys.r); K.kp.max = Math.max(...sys.r);
  root.querySelector('.knob[data-k="kp"] .nm').textContent = sys.k;
  ana = analyse(sys, sys.p); if (!ana.ok) { sys.p = { ...base.p }; ana = analyse(sys, sys.p); }
  lyapLive = ana.lyap; restart(); resetHistory(); renderEq(); renderLib(); drawKnob('kp');
  $('#chSysName').textContent = sys.name.toUpperCase(); $('#chBy').textContent = sys.by;
}
function scheduleReanalyse() { clearTimeout(reTimer); reTimer = setTimeout(() => { const a = analyse(sys, sys.p); if (a.ok) { ana = { ...a, start: ana.start }; lyapLive = a.lyap; } else toast('That value runs away, try another'); renderEq(); }, 120); }
function restart() {                                         // put A at the fixed starting spot; B follows at its phase
  if (sys.kind === 'curve') { A.th = 0; } else { A.st.set(ana.start); shadow.set(ana.start); shadow[0] += 1e-7 * ana.scale; }
  resetB();
}
function resetB() {
  if (!sys) return; const ahead = S.phase / 360 * ana.loopT;
  if (sys.kind === 'curve') { B.th = A.th + ahead; return; }
  B.st.set(A.st); const n = Math.ceil(ahead / ana.h); for (let i = 0; i < n; i++) rk4(sys, sys.p, B.st, ana.h);
  B.st[0] += 1e-4 * ana.scale;                                // a hair's breadth off, so the chaos has something to grow
}
const norm = (st, out) => { for (let a = 0; a < 3; a++) out[a] = (st[a] - ana.center[a]) / ana.scale; return out; };
const curvePos = (th) => { const q = sys.pos(th, sys.p); return q.map((v, a) => (v - ana.center[a]) / ana.scale); };
const tmp = [0, 0, 0];
// advance both points by `secs` of real time; every step is recorded into the trail
function advance(secs) {
  const simT = secs * ana.loopT * rateHz();
  if (sys.kind === 'curve') {
    const steps = Math.max(1, Math.min(2000, Math.ceil(simT / ana.h))), dth = simT / steps;
    for (let i = 0; i < steps; i++) { A.th += dth; B.th += dth; pushTrail(curvePos(A.th), curvePos(B.th)); }
    A.n = curvePos(A.th); B.n = curvePos(B.th); return;
  }
  const steps = Math.min(6000, Math.ceil(simT / ana.h)), h = simT / Math.max(1, steps);
  let lsum = 0, lt = 0;
  for (let i = 0; i < steps; i++) {
    rk4(sys, sys.p, A.st, h); rk4(sys, sys.p, B.st, h); rk4(sys, sys.p, shadow, h);
    if (!Number.isFinite(A.st[0] + A.st[1] + A.st[2]) || Math.abs(A.st[0]) + Math.abs(A.st[1]) + Math.abs(A.st[2]) > 1e5) { restart(); toast('The point ran away, so it was restarted'); return; }
    if (!Number.isFinite(B.st[0]) || Math.abs(B.st[0]) > 1e5) resetB();
    const n0 = norm(A.st, [0, 0, 0]), n1 = norm(B.st, [0, 0, 0]); pushTrail(n0, n1);
    if (i % 8 === 7) { const d0 = 1e-7 * ana.scale, dx = shadow[0] - A.st[0], dy = shadow[1] - A.st[1], dz = shadow[2] - A.st[2], d = Math.hypot(dx, dy, dz) || d0; lsum += Math.log(d / d0); lt += 8 * h; const k = d0 / d; shadow[0] = A.st[0] + dx * k; shadow[1] = A.st[1] + dy * k; shadow[2] = A.st[2] + dz * k; }
  }
  if (lt > 0) { const w = Math.min(1, lt / (60 * ana.loopT)); lyapLive += (lsum / lt - lyapLive) * w; }     // running estimate over ~60 loops
  norm(A.st, A.n); norm(B.st, B.n);
}

// ---------------------------------------------------------------- equations + library
function renderEq() {
  const dots = sys.kind === 'curve' ? ['x', 'y', 'z'] : ['ẋ', 'ẏ', 'ż'];
  $('#chEq').innerHTML = sys.eq.map((e, i) => `<div><b>${dots[i]} =</b><span>${e}</span></div>`).join('');
  $('#chParams').innerHTML = Object.entries(sys.p).map(([k, v]) => `<span class="${k === sys.k ? 'k' : ''}">${k} ${Math.abs(v) < 1 ? v.toFixed(3) : v.toFixed(2)}</span>`).join('');
  $('#chXYZ').innerHTML = ['x', 'y', 'z'].map((a) => `<div class="row"><span><i style="color:var(--c${a})">${a}</i><span class="v" data-xyz="${a}">0</span></span><span class="r" data-r="${a}">FREE</span></div>`).join('');
  refreshRouteLabels();
}
function renderLib() {
  const list = $('#chLibList'); $('#chLibCount').textContent = `Library · ${SYSTEMS.length} systems`;
  list.innerHTML = FAMILIES.map((f) => `<div class="fam cap">${f}</div>` + SYSTEMS.filter((s) => s.fam === f).map((s) => `<button data-sys="${s.id}" class="${s.id === S.sys ? 'on' : ''}">${s.name}<small>${s.by.split('·').pop().trim()}</small></button>`).join('')).join('');
  list.querySelectorAll('[data-sys]').forEach((b) => b.addEventListener('click', () => { loadSystem(b.dataset.sys); $('#chLib').classList.remove('open'); }));
}
$('#chSysBtn').addEventListener('click', () => $('#chLib').classList.add('open'));
$('#chLibX').addEventListener('click', () => $('#chLib').classList.remove('open'));
root.querySelectorAll('.modal').forEach((m) => m.addEventListener('pointerdown', (e) => { if (e.target === m) m.classList.remove('open'); }));

// ---------------------------------------------------------------- sources -> sound
function sources(P, other) {
  const v = P.v / (2 * vRef), d = Math.hypot(A.n[0] - B.n[0], A.n[1] - B.n[1], A.n[2] - B.n[2]) / 2;
  return { x: clamp(P.n[0], -1, 1), y: clamp(P.n[1], -1, 1), z: clamp(P.n[2], -1, 1), v: clamp(v, 0, 1), d: clamp(d, 0, 1) };
}
function eff(k, src) {                                       // a knob's value after its route has moved it
  const r = routes[k], d = K[k], base = S[k]; if (!r) return base;
  if (k === 'pos' && S.start === 'knob') return base;
  const s = src[r.src], bip = r.src === 'x' || r.src === 'y' || r.src === 'z', span = (d.max - d.min) * (bip ? 0.5 : 1);
  return clamp(base + r.amt * s * span, Math.min(d.min, d.max), Math.max(d.min, d.max));
}
const toEngine = (src) => ({ shape: eff('shape', src), pitch: eff('pitch', src), sub: eff('sub', src) / 100, fm: eff('fm', src) / 100, fold: eff('fold', src) / 100, noise: eff('noise', src) / 100,
  cutoff: 30 * Math.pow(2, eff('tone', src) / 100 * 9.4), q: eff('res', src), drive: eff('drive', src) / 100, gain: Math.pow(eff('level', src) / 100, 2) * 0.5, pan: eff('pan', src) / 100, pos: eff('pos', src) / 100 });
let secA = 0, secB = 1;
function pushCfg() {
  const grid = Math.round(S.grid), secs = sample ? sample.seconds * (secB - secA) : 1, perBeat = [0, 1, 2, 4, 8][grid], slots = grid ? Math.max(1, Math.round(secs * S.sbpm / 60 * perBeat)) : 0;
  AU.setCfg({ attack: S.attack / 1000, release: S.release / 1000, glide: S.glide / 1000, mono: S.poly === 'mono', bMode: Math.round(S.vb), width: S.width / 100, mode: S.sound, slice: S.slice / 1000, root: Math.round(S.root), secA, secB, grid: slots });
}
let srcA = { x: 0, y: 0, z: 0, v: 0, d: 0 }, srcB = srcA;
function pushSound() {
  const eA = toEngine(srcA), eB = toEngine(srcB); AU.setVoices(eA, eB);
  AU.setFx({ echo: eff('echo', srcA) / 100, reverb: eff('reverb', srcA) / 100, chorus: eff('chorus', srcA) / 100, crushAmt: eff('crush', srcA) / 100, bpm: S.bpm });
  for (const k of Object.keys(routes)) drawKnob(k, toN(k, eff(k, srcA)));
}

// ---------------------------------------------------------------- keys, latch, octave, MIDI
let audioReady = false;
async function ensureAudio() { if (!active('chaos')) return false; if (audioReady) return true; try { await AU.initChaosAudio(); await AU.resume(); audioReady = true; pushCfg(); return true; } catch (e) { toast('Sound could not start: ' + e.message); return false; } }
const held = new Set(), latched = new Set();
const KEYS = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k', 'o', 'l', 'p', ';', "'"];
const baseNote = () => 12 * (S.oct + 1);
async function press(note, vel = 1) {
  if (!(await ensureAudio())) return;
  if (S.keyMode === 'restart') restart();
  if (S.latch && S.poly === 'mono') { for (const n of latched) if (n !== note) AU.noteOff(n); latched.clear(); }
  if (S.latch && latched.has(note) && S.poly === 'chord') { latched.delete(note); AU.noteOff(note); keyLight(note, false); return; }   // a latched key pressed again lets go
  held.add(note); if (S.latch) latched.add(note);
  AU.noteOn(note, vel); lastNote = note; keyLight(note, true); onNoteVisual(note);
}
function release(note) { held.delete(note); if (S.latch) return; AU.noteOff(note); keyLight(note, false); }
function setLatch(on) { S.latch = on; if (!on) { for (const n of latched) if (!held.has(n)) { AU.noteOff(n); keyLight(n, false); } latched.clear(); } else for (const n of held) latched.add(n); syncPills(); }
function setOct(o) { S.oct = clamp(o, 0, 7); $('#chOctL').textContent = 'C' + S.oct; buildKeys(); }
$('#chLatch').addEventListener('click', () => setLatch(!S.latch));
$('#chOctDn').addEventListener('click', () => setOct(S.oct - 1)); $('#chOctUp').addEventListener('click', () => setOct(S.oct + 1));
const freeze = (on = !S.freeze) => { S.freeze = on; syncPills(); };
$('#chFreeze').addEventListener('click', () => freeze());
$('#chResetB').addEventListener('click', () => { resetB(); toast('Voice B back at its phase'); });
const typing = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable;
addEventListener('keydown', (e) => {
  if (!active('chaos') || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase(), i = KEYS.indexOf(k);
  if (i >= 0) { e.preventDefault(); if (!e.repeat) press(baseNote() + i); return; }
  if (e.repeat) return;
  if (e.code === 'Space') { e.preventDefault(); setLatch(!S.latch); }
  else if (k === 'z') setOct(S.oct - 1); else if (k === 'x') setOct(S.oct + 1);
  else if (k === '1') { resetB(); toast('Voice B back at its phase'); } else if (k === '2') freeze(); else if (k === '3') togglePlane(); else if (k === '4') cycleDraw();
  else if (k === '5') toggleFull(); else if (k === '0') root.classList.toggle('hideui');
  else if (k === 'escape') root.querySelectorAll('.modal.open').forEach((m) => m.classList.remove('open'));
});
addEventListener('keyup', (e) => { if (!active('chaos')) return; const i = KEYS.indexOf(e.key.toLowerCase()); if (i >= 0) release(baseNote() + i); });
addEventListener('blur', () => { if (!active('chaos')) return; for (const n of [...held]) release(n); });
// on-screen keyboard: three octaves and a C
const keysEl = $('#chKeys'); let keyEls = new Map();
function buildKeys() {
  keysEl.innerHTML = ''; keyEls = new Map(); const whites = [], b0 = baseNote(), W = 22 * 0 + 1;
  const isBlack = (m) => [1, 3, 6, 8, 10].includes(m % 12); let wi = 0;
  const total = 37, nW = Array.from({ length: total }, (_, i) => !isBlack(b0 + i)).filter(Boolean).length, wpct = 100 / nW;
  for (let i = 0; i < total; i++) {
    const n = b0 + i, el = document.createElement('div'), blk = isBlack(n); el.className = blk ? 'b' : 'w'; el.dataset.n = n;
    if (blk) { el.style.left = `calc(${wi * wpct}% - ${wpct * 0.3}%)`; el.style.width = wpct * 0.6 + '%'; } else { el.style.left = wi * wpct + '%'; el.style.width = wpct + '%'; wi++; }
    const lab = (i < KEYS.length ? KEYS[i].toUpperCase() : '') + (n % 12 === 0 && !blk ? `<br>${noteName(n)}` : ''); el.innerHTML = `<span>${lab}</span>`;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); press(n); });
    el.addEventListener('pointerup', () => release(n)); el.addEventListener('pointercancel', () => release(n));
    keysEl.appendChild(el); keyEls.set(n, el);
  }
}
const keyLight = (n, on) => keyEls.get(n)?.classList.toggle('on', on);
let midi = null;
$('#chMidi').addEventListener('click', async () => {
  if (midi) { for (const i of midi.inputs.values()) i.onmidimessage = null; midi = null; $('#chMidi').classList.remove('on'); toast('MIDI off'); return; }
  if (!navigator.requestMIDIAccess) return toast('This browser has no Web MIDI');
  try {
    midi = await navigator.requestMIDIAccess(); let n = 0;
    for (const inp of midi.inputs.values()) { n++; inp.onmidimessage = (m) => { if (!active('chaos')) return; const [st, d1, d2] = m.data, c = st & 0xf0; if (c === 0x90 && d2 > 0) press(d1, d2 / 127); else if (c === 0x80 || (c === 0x90 && d2 === 0)) release(d1); }; }
    $('#chMidi').classList.add('on'); toast(n ? `MIDI: ${n} input${n > 1 ? 's' : ''}` : 'MIDI on: no keyboard connected');
  } catch { midi = null; toast('MIDI was not allowed'); }
});

// ---------------------------------------------------------------- your own sound
let sample = null;
$('#chLoad').addEventListener('click', () => $('#chFile').click());
$('#chFile').addEventListener('change', (e) => { if (e.target.files[0]) useSound(e.target.files[0]); e.target.value = ''; });
addEventListener('dragover', (e) => { if (!active('chaos')) return; e.preventDefault(); root.classList.add('dragging'); });
addEventListener('dragleave', (e) => { if (active('chaos') && !e.relatedTarget) root.classList.remove('dragging'); });
addEventListener('drop', (e) => { if (!active('chaos')) return; e.preventDefault(); root.classList.remove('dragging'); const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('audio/')); if (f) useSound(f); else toast('Drop a sound file'); });
async function useSound(file) {
  try {
    await ensureAudio(); const r = await AU.loadSound(file);
    sample = { ...r, name: file.name, pk: peaks(r.data, 230) }; secA = 0; secB = 1; S.sbpm = r.bpm; S.root = r.root;
    if (!routes.pos) routes.pos = { src: 'x', amt: 0.5 }; S.pos = 50;          // centred, so the movement swings both ways through the sound
    S.sound = 'grains'; $('#chSample').classList.add('on'); syncPills(); pushCfg(); ['sbpm', 'root', 'pos'].forEach((k) => drawKnob(k)); drawWave();
    toast(`${file.name}: ${r.seconds.toFixed(1)} s · ${r.bpm} BPM · ${noteName(r.root)}`);
  } catch (err) { toast('Could not read that sound'); }
}
const wave = $('#chWave'), wg = wave.getContext('2d');
function drawWave(posA) {
  if (!sample) return; const W = wave.width, H = wave.height, pk = sample.pk, n = pk.length / 2; wg.clearRect(0, 0, W, H);
  wg.fillStyle = 'rgba(238,241,244,.06)'; wg.fillRect(secA * W, 0, (secB - secA) * W, H);
  wg.fillStyle = 'rgba(238,241,244,.55)'; for (let c = 0; c < n; c++) { const x = c / n * W, lo = pk[c * 2], hi = pk[c * 2 + 1]; wg.fillRect(x, H / 2 - hi * H / 2, Math.max(1, W / n - 0.5), Math.max(1, (hi - lo) * H / 2)); }
  wg.strokeStyle = 'rgba(238,241,244,.7)'; wg.beginPath(); wg.moveTo(secA * W, 0); wg.lineTo(secA * W, H); wg.moveTo(secB * W, 0); wg.lineTo(secB * W, H); wg.stroke();
  if (posA != null) { const x = (secA + posA * (secB - secA)) * W; wg.strokeStyle = S.colA; wg.lineWidth = 2; wg.beginPath(); wg.moveTo(x, 0); wg.lineTo(x, H); wg.stroke(); wg.lineWidth = 1; }
}
{ let d = null; const fx = (e) => clamp((e.clientX - wave.getBoundingClientRect().left) / wave.getBoundingClientRect().width, 0, 1);
  wave.addEventListener('pointerdown', (e) => { if (!sample) return; wave.setPointerCapture(e.pointerId); const x = fx(e), px = 6 / wave.getBoundingClientRect().width; d = Math.abs(x - secA) < px ? 'a' : Math.abs(x - secB) < px ? 'b' : { from: x }; });
  wave.addEventListener('pointermove', (e) => { if (!d) return; const x = fx(e); if (d === 'a') secA = Math.min(x, secB - 0.01); else if (d === 'b') secB = Math.max(x, secA + 0.01); else if (Math.abs(x - d.from) > 0.005) { secA = Math.min(x, d.from); secB = Math.max(x, d.from); } drawWave(); });
  wave.addEventListener('pointerup', () => { d = null; pushCfg(); });
  wave.addEventListener('dblclick', () => { secA = 0; secB = 1; pushCfg(); drawWave(); }); }

// ---------------------------------------------------------------- scene
const canvas = $('#chGl'), ov = $('#chOv'), octx = ov.getContext('2d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'default' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
const DPR = Math.min(devicePixelRatio || 1, 1.5); renderer.setPixelRatio(DPR);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(34, 1, 0.05, 200);
const fig = new THREE.Group(); scene.add(fig);
const TR = 14000, TRB = 5000, DUST = 60000;
const mkLine = (n) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setDrawRange(0, 0); return new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); };
const lineA = mkLine(TR), lineB = mkLine(TRB); fig.add(lineA, lineB);
const ringA = new Float32Array(TR * 3), ringB = new Float32Array(TRB * 3); let headA = 0, countA = 0, headB = 0, countB = 0;
const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST * 3), 3)); dustGeo.setDrawRange(0, 0);
const dustMat = new THREE.PointsMaterial({ size: 1.4, sizeAttenuation: false, color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
const dust = new THREE.Points(dustGeo, dustMat); fig.add(dust); let dustHead = 0, dustCount = 0, dustSkip = 0;
const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, '#fff'); r.addColorStop(0.25, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })();
const mkHead = () => new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
const headAS = mkHead(), headBS = mkHead(); headAS.scale.setScalar(0.09); headBS.scale.setScalar(0.08); fig.add(headAS, headBS);
// axes (three: X = x, Y = z, Z = y, so z points up)
const P3 = (n, out = new THREE.Vector3()) => out.set(n[0], n[2], n[1]);
const axes = new THREE.Group(); fig.add(axes);
for (const [a, col] of [[[1.25, 0, 0], 0xe8a13a], [[0, 1.25, 0], 0x7cc36b], [[0, 0, 1.25], 0x5aa9e6]]) { const g = new THREE.BufferGeometry().setFromPoints([P3(a.map((v) => -v)), P3(a)]); axes.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.45 }))); }
// Poincaré plane at z = 0 of the figure
const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ color: 0x5aa9e6, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false })); plane.rotation.x = -Math.PI / 2; fig.add(plane);
const planeEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(2.6, 2.6)), new THREE.LineBasicMaterial({ color: 0x5aa9e6, transparent: true, opacity: 0.35 })); planeEdge.rotation.x = -Math.PI / 2; fig.add(planeEdge);
const PD = 4000, planeGeo = new THREE.BufferGeometry(); planeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PD * 3), 3)); planeGeo.setDrawRange(0, 0);
const planePts = new THREE.Points(planeGeo, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, color: 0xbfe2ff, transparent: true, opacity: 0.9, depthWrite: false })); fig.add(planePts);
const planeDots = { n: 0 }; let prevZ = 0;
// space: stars, ripples, note stars
const starGeo = new THREE.BufferGeometry(); { const n = 2400, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, r = 30 + Math.random() * 40, s = Math.sqrt(1 - u * u); a[i * 3] = r * s * Math.cos(t); a[i * 3 + 1] = r * u; a[i * 3 + 2] = r * s * Math.sin(t); } starGeo.setAttribute('position', new THREE.BufferAttribute(a, 3)); }
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 1.3, sizeAttenuation: false, color: 0xaab4c4, transparent: true, opacity: 0.7, depthWrite: false })); scene.add(stars);
const ripples = []; let loopClock = 0;
const noteStars = []; const tint = new THREE.Color(0, 0, 0); let wash = 0;
function onNoteVisual(note) {
  const col = new THREE.Color(Math.random() < 0.5 || S.vb < 1 ? S.colA : S.colB);
  if (S.space === 'notes') {
    const s = mkHead(); s.material.color.copy(col); const u = Math.random() * 2 - 1, t = Math.random() * 6.283, r = 1.6 + Math.random() * 1.2, q = Math.sqrt(1 - u * u);
    s.position.set(r * q * Math.cos(t), r * u, r * q * Math.sin(t)); s.scale.setScalar(0.22); scene.add(s); noteStars.push({ s, life: 1, col }); if (noteStars.length > 24) noteStars.shift().s.removeFromParent();
  }
  if (S.space === 'wash') { wash = 1; tint.copy(col); }
}
function resetHistory() { headA = countA = headB = countB = 0; dustHead = dustCount = 0; planeDots.n = 0; ripples.forEach((r) => r.line.removeFromParent()); ripples.length = 0; }
function pushTrail(a, b) {
  ringA[headA * 3] = a[0]; ringA[headA * 3 + 1] = a[2]; ringA[headA * 3 + 2] = a[1]; headA = (headA + 1) % TR; countA = Math.min(TR, countA + 1);
  ringB[headB * 3] = b[0]; ringB[headB * 3 + 1] = b[2]; ringB[headB * 3 + 2] = b[1]; headB = (headB + 1) % TRB; countB = Math.min(TRB, countB + 1);
  if (S.draw === 'dust') { const p = dustGeo.attributes.position.array; p[dustHead * 3] = a[0]; p[dustHead * 3 + 1] = a[2]; p[dustHead * 3 + 2] = a[1]; dustHead = (dustHead + 1) % DUST; dustCount = Math.min(DUST, dustCount + 1); dustGeo.attributes.position.needsUpdate = true; }
  if (S.plane && prevZ < 0 && a[2] >= 0 && planeDots.n < PD) { const p = planeGeo.attributes.position.array, i = planeDots.n++; p[i * 3] = a[0]; p[i * 3 + 1] = 0; p[i * 3 + 2] = a[1]; planeGeo.attributes.position.needsUpdate = true; }   // each upward crossing leaves a dot
  prevZ = a[2];
}
const cA = new THREE.Color(), cB = new THREE.Color();
function fillLine(line, ring, head, count, N, col, mode) {
  const pos = line.geometry.attributes.position.array, c = line.geometry.attributes.color.array;
  const show = mode === 'comet' ? Math.min(count, 500) : count, w = wash;
  for (let i = 0; i < show; i++) {
    const src = ((head - show + i) % N + N) % N; pos[i * 3] = ring[src * 3]; pos[i * 3 + 1] = ring[src * 3 + 1]; pos[i * 3 + 2] = ring[src * 3 + 2];
    const age = i / Math.max(1, show - 1);                     // 0 oldest .. 1 newest
    let k = mode === 'ghost' ? 0.16 + 0.84 * Math.pow(age, 40) : mode === 'comet' ? Math.pow(age, 2.2) : 0.05 + 0.95 * Math.pow(age, 1.6);
    k *= 0.85 + w * 0.9;
    c[i * 3] = (col.r + tint.r * w) * k; c[i * 3 + 1] = (col.g + tint.g * w) * k; c[i * 3 + 2] = (col.b + tint.b * w) * k;
  }
  line.geometry.setDrawRange(0, show); line.geometry.attributes.position.needsUpdate = true; line.geometry.attributes.color.needsUpdate = true;
}
// camera: slow orbit, drag to turn, scroll to zoom, double-click to reset
const cam = { yaw: 0.6, pitch: 0.18, dist: 3.5, vy: 0, auto: true };
{ let d = null;
  canvas.addEventListener('pointerdown', (e) => { d = { x: e.clientX, y: e.clientY }; cam.auto = false; canvas.setPointerCapture(e.pointerId); ensureAudio(); });
  canvas.addEventListener('pointermove', (e) => { if (!d) return; cam.yaw -= (e.clientX - d.x) * 0.006; cam.pitch = clamp(cam.pitch + (e.clientY - d.y) * 0.006, -1.4, 1.4); cam.vy = -(e.clientX - d.x) * 0.006; d = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', () => { d = null; setTimeout(() => { cam.auto = true; }, 2500); });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = clamp(cam.dist + e.deltaY * 0.004, 1.6, 12); }, { passive: false });
  canvas.addEventListener('dblclick', () => { cam.yaw = 0.6; cam.pitch = 0.18; cam.dist = 3.5; cam.auto = true; }); }
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); ov.width = w * DPR; ov.height = h * DPR; octx.setTransform(DPR, 0, 0, DPR, 0, 0); }
addEventListener('resize', resize);
const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
$('#chFull').addEventListener('click', toggleFull);
const proj = new THREE.Vector3();
const toScreen = (v) => { proj.copy(v); fig.localToWorld(proj); proj.project(camera); return [(proj.x * 0.5 + 0.5) * innerWidth, (-proj.y * 0.5 + 0.5) * innerHeight, proj.z]; };
function drawOverlay() {
  octx.clearRect(0, 0, innerWidth, innerHeight); if (!S.axes) return;
  octx.font = 'italic 14px Georgia,serif';
  for (const [n, lab, col] of [[[1.32, 0, 0], 'x', '#e8a13a'], [[0, 1.32, 0], 'y', '#7cc36b'], [[0, 0, 1.32], 'z', '#5aa9e6']]) { const s = toScreen(P3(n)); if (s[2] < 1) { octx.fillStyle = col; octx.fillText(lab, s[0] + 4, s[1] - 4); } }
}

// ---------------------------------------------------------------- left panel numbers
let panelT = 0;
function updatePanel() {
  const raw = sys.kind === 'curve' ? sys.pos(A.th, sys.p) : A.st, hz = rateHz();
  for (const [i, a] of ['x', 'y', 'z'].entries()) { const el = root.querySelector(`[data-xyz="${a}"]`); if (el) el.textContent = (raw[i] < 0 ? '−' : '') + Math.abs(raw[i]).toFixed(Math.abs(raw[i]) < 10 ? 3 : 2); }
  $('#chNote').textContent = lastNote == null ? '—' : noteName(lastNote) + (S.vb >= 1 ? ` · B ${noteName(lastNote + [0, 0, 7, 12][Math.round(S.vb)])}` : '');
  $('#chLoop').textContent = `${hz.toFixed(2)} Hz · ${Math.round(1000 / hz)} ms`;
  const lam = sys.kind === 'curve' ? 0 : lyapLive, st = stateOf(lam, sys.kind);
  $('#chState').textContent = `${st.word} · λ ${lam >= 0 ? '+' : '−'}${Math.abs(lam).toFixed(3)}`;
  const db = doublingBeats(lam, ana.loopT, hz, S.bpm); $('#chDouble').textContent = Number.isFinite(db) && st.chaos ? `EVERY ${db < 10 ? db.toFixed(1) : Math.round(db)} BEATS` : 'NEVER';
  const gap = Math.round(srcA.d * 100); $('#chGapV').textContent = S.vb >= 1 ? gap + '%' : 'OFF'; $('#chGap i').style.width = (S.vb >= 1 ? gap : 0) + '%';
  if (sample) drawWave(eff('pos', srcA) / 100);
}

// ---------------------------------------------------------------- image + film
let wantShot = false, rec = null;
$('#chShot').addEventListener('click', () => { wantShot = true; });
function composeFrame(c2, W, H, withKnobs) {
  const g = c2.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const sw = canvas.width, sh = canvas.height, s = Math.max(W / sw, H / sh), dw = sw * s, dh = sh * s; g.drawImage(canvas, (W - dw) / 2, (H - dh) / 2, dw, dh);
  const u = Math.min(W, H) / 1080; g.fillStyle = '#eef1f4'; g.font = `${Math.round(30 * u)}px -apple-system,Segoe UI,sans-serif`; g.fillText(sys.name.toUpperCase().split('').join(' '), 60 * u, 90 * u);
  g.font = `${Math.round(20 * u)}px -apple-system,Segoe UI,sans-serif`; g.fillStyle = 'rgba(238,241,244,.6)'; g.fillText(`${sys.by}   ·   ${$('#chState').textContent}   ·   ${$('#chLoop').textContent}`, 60 * u, 126 * u);
  g.font = `italic ${Math.round(22 * u)}px Georgia,serif`; g.fillStyle = '#eef1f4'; sys.eq.forEach((e, i) => g.fillText(`${['ẋ', 'ẏ', 'ż'][i]} = ${e}`, 60 * u, (172 + i * 32) * u));
  if (withKnobs) { g.font = `${Math.round(18 * u)}px -apple-system,Segoe UI,sans-serif`; let y = H - 60 * u; for (const [k, r] of Object.entries(routes)) { g.fillStyle = getComputedStyle(root).getPropertyValue(SRC[r.src].col).trim() || '#fff'; g.fillText(`${SRC[r.src].g} → ${K[k].nm}  ${r.amt > 0 ? '+' : ''}${Math.round(r.amt * 100)}%   ${K[k].fmt(eff(k, srcA))}`, 60 * u, y); y -= 28 * u; } }
}
function saveShot() {
  const c2 = document.createElement('canvas'); c2.width = canvas.width; c2.height = canvas.height; composeFrame(c2, c2.width, c2.height, false);
  c2.toBlob((b) => download(b, `migros-${S.sys}.png`)); toast('Image saved');
}
const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
const recOpt = { f: 'wide', q: '1080', s: 'figure' };
const syncRec = () => { for (const [id, key, attr] of [['#chRecFrame', 'f', 'f'], ['#chRecQ', 'q', 'q'], ['#chRecShow', 's', 's']]) root.querySelectorAll(`${id} [data-${attr}]`).forEach((b) => b.classList.toggle('on', b.dataset[attr] === recOpt[key])); };
for (const [id, key] of [['#chRecFrame', 'f'], ['#chRecQ', 'q'], ['#chRecShow', 's']]) root.querySelectorAll(`${id} button`).forEach((b) => b.addEventListener('click', () => { recOpt[key] = b.dataset[key]; syncRec(); }));
syncRec();
$('#chRecBtn').addEventListener('click', () => { if (rec) stopRec(); else $('#chRec').classList.add('open'); });
$('#chRecX').addEventListener('click', () => $('#chRec').classList.remove('open'));
$('#chRecGo').addEventListener('click', async () => { $('#chRec').classList.remove('open'); await startRec(); });
async function startRec() {
  if (!(await ensureAudio())) return;
  if (recOpt.f === 'wav') { AU.wavStart(); rec = { wav: true, t0: performance.now() }; }
  else {
    if (!window.MediaRecorder) return toast('This browser cannot record video');
    const q = +recOpt.q, dims = { vertical: [q, q * 16 / 9], portrait: [q, q * 5 / 4], wide: [q * 16 / 9, q], square: [q, q] }[recOpt.f], c2 = document.createElement('canvas'); c2.width = Math.round(dims[0]); c2.height = Math.round(dims[1]);
    const stream = c2.captureStream(30); const at = AU.mediaStream()?.getAudioTracks()[0]; if (at) stream.addTrack(at);
    const type = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=h264', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || '';   // explicit VP8/VP9 records nothing on some machines
    const mr = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: q > 1080 ? 24e6 : 10e6 }), chunks = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = () => { const mt = (mr.mimeType || type || 'video/webm').split(';')[0]; download(new Blob(chunks, { type: mt }), `migros-${S.sys}-${recOpt.f}.${mt.includes('mp4') ? 'mp4' : 'webm'}`); };
    mr.start(500); rec = { mr, c2, t0: performance.now() };
  }
  $('#chRecBtn').classList.add('rec'); toast('Recording · press Record again to stop');
}
function stopRec() {
  if (!rec) return;
  if (rec.wav) download(AU.wavStop(), `migros-${S.sys}.wav`); else rec.mr.stop();
  rec = null; $('#chRecBtn').classList.remove('rec'); $('#chRecL').textContent = 'Record'; toast('Recording saved');
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock(); let lastT = 0, frames = 0;
function frame() {
  frames++; if (window.__frames) window.__frames.chaos = (window.__frames.chaos || 0) + 1;
  const t = clock.getElapsedTime(), dt = Math.min(0.05, t - lastT); lastT = t;
  if (sys && !S.freeze) {
    const before = [...A.n]; advance(dt);
    const sp = Math.hypot(A.n[0] - before[0], A.n[1] - before[1], A.n[2] - before[2]) / Math.max(dt, 1e-3); A.v = sp; vRef += (sp - vRef) * 0.002;
    B.v = A.v;                                               // B travels the same figure at much the same speed
    loopClock += dt * rateHz();
    if (S.space === 'ripples' && loopClock >= 1) { loopClock -= 1; addRipple(); }
  }
  if (loopClock > 1) loopClock = 0;
  if (sys) { srcA = sources(A); srcB = sources(B); if (audioReady) pushSound(); }
  // figure
  cA.set(S.colA); cB.set(S.colB);
  const showLine = S.draw !== 'dust';
  lineA.visible = showLine; lineB.visible = showLine && S.vb >= 1; dust.visible = S.draw === 'dust';
  if (showLine) { fillLine(lineA, ringA, headA, countA, TR, cA, S.draw); if (S.vb >= 1) fillLine(lineB, ringB, headB, countB, TRB, cB, S.draw === 'ghost' ? 'comet' : S.draw); }
  if (S.draw === 'dust') { dustGeo.setDrawRange(0, dustCount); dustMat.color.copy(cA); }
  P3(A.n, headAS.position); P3(B.n, headBS.position); headAS.material.color.copy(cA); headBS.material.color.copy(cB); headBS.visible = S.vb >= 1;
  axes.visible = S.axes; plane.visible = planeEdge.visible = planePts.visible = S.plane; planeGeo.setDrawRange(0, planeDots.n);
  stars.visible = S.space === 'stars' || S.space === 'notes';
  for (const r of ripples) { r.age += dt; const k = 1 + r.age * 0.22; r.line.scale.setScalar(k); r.line.material.opacity = Math.max(0, 0.45 - r.age * 0.09); }
  while (ripples.length && ripples[0].age > 5) ripples.shift().line.removeFromParent();
  for (const n of noteStars) { n.life *= Math.exp(-dt * 0.35); n.s.material.opacity = n.life; }
  if (S.space === 'notes' && noteStars.length) { const last = noteStars[noteStars.length - 1]; tint.copy(last.col); wash = Math.max(wash, last.life * 0.5); }
  wash *= Math.exp(-dt * 1.6);
  // camera
  if (cam.auto) cam.yaw += dt * 0.07; else { cam.yaw += cam.vy * 0.2; cam.vy *= 0.9; }
  camera.position.set(Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist, Math.sin(cam.pitch) * cam.dist, Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist); camera.lookAt(0, 0, 0);
  renderer.render(scene, camera); drawOverlay();
  if (wantShot) { wantShot = false; saveShot(); }
  if (rec && !rec.wav) composeFrame(rec.c2, rec.c2.width, rec.c2.height, recOpt.s === 'knobs');
  if (rec) { const s = Math.floor((performance.now() - rec.t0) / 1000); $('#chRecL').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  panelT += dt; if (panelT > 0.1 && sys) { panelT = 0; updatePanel(); }
}
function addRipple() {
  const n = Math.min(countA, 900); if (n < 10) return; const g = new THREE.BufferGeometry(), a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const s = ((headA - n + i) % TR + TR) % TR; a[i * 3] = ringA[s * 3]; a[i * 3 + 1] = ringA[s * 3 + 1]; a[i * 3 + 2] = ringA[s * 3 + 2]; }
  g.setAttribute('position', new THREE.BufferAttribute(a, 3)); const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: new THREE.Color(S.colA), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
  fig.add(line); ripples.push({ line, age: 0 }); if (ripples.length > 7) ripples.shift().line.removeFromParent();
}

// ---------------------------------------------------------------- boot
resize(); buildKeys(); syncPills(); loadSystem(S.sys); Object.keys(K).forEach((k) => drawKnob(k)); refreshRouteLabels();
renderer.setAnimationLoop(frame);
window.__chaosApp = { start() { renderer.setAnimationLoop(frame); AU.resume(); }, stop() { renderer.setAnimationLoop(null); AU.allOff(); held.clear(); latched.clear(); keyEls.forEach((e) => e.classList.remove('on')); AU.suspend(); } };
function stats() {                                         // render once and summarise the real pixels (for tests)
  renderer.render(scene, camera); const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, buf = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let lit = 0, mass = 0, red = 0; for (let i = 0; i < buf.length; i += 16) { const l = (buf[i] + buf[i + 1] + buf[i + 2]) / 765; if (l > 0.08) lit++; mass += l; if (buf[i] > 120 && buf[i + 1] < 90) red++; }
  return { lit, mass: Math.round(mass), red };
}
window.__c = { S, routes, K, stats, get sys() { return sys; }, get ana() { return ana; }, get A() { return A; }, get B() { return B; }, get lyap() { return lyapLive; }, get frames() { return frames; }, get planeDots() { return planeDots.n; }, get ripples() { return ripples.length; }, get noteStars() { return noteStars.length; }, get countA() { return countA; }, get dustCount() { return dustCount; },
  get audio() { return AU.chaosCtx()?.state ?? 'none'; }, meter: () => AU.chaosMeter(), press, release, setKnob, routeTo, loadSystem, resetB, setLatch, setOct, freeze, ensureAudio, eff: (k, v) => eff(k, v === 'B' ? srcB : srcA), sources: () => ({ A: srcA, B: srcB }), useSound, get sample() { return sample; }, startRec, stopRec, get rec() { return !!rec; }, held, latched, ready: true };
