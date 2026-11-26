import { guardAudio, mayPlay } from './site-state.js';
// BodyBeat original synthesized sounds (Web Audio). No samples.
let ctx, master, comp, noiseBuf, fx = null, recDest = null, recorder = null, recChunks = [];
let pitchMul = 1, toneVal = 0, chemCut = 18000, chemQ = 0.7, formantScale = 1;

export function initAudio() {
  if (ctx) { if (mayPlay('body')) ctx.resume(); return ctx; }          // never wake BodyBeat while another app is on screen
  ctx = new (window.AudioContext || window.webkitAudioContext)(); guardAudio('body', ctx);
  comp = ctx.createDynamicsCompressor();
  master = ctx.createGain(); master.gain.value = 0.8;
  buildFx();
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}
export const audioCtx = () => ctx;
export const masterNode = () => master;

function curve(k) { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); } return c; }
function makeIR(sec, decay) { const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); } return b; }
// master -> (clean + drive) -> tone filter -> tremolo -> compressor, with a reverb send
function buildFx() {
  const dry = ctx.createGain(), wet = ctx.createGain(), sum = ctx.createGain(), shaper = ctx.createWaveShaper();
  shaper.curve = curve(0); shaper.oversample = '2x'; wet.gain.value = 0;
  master.connect(dry); master.connect(shaper); shaper.connect(wet); dry.connect(sum); wet.connect(sum);
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 18000; tone.Q.value = 0.7;
  const trem = ctx.createGain(), lfo = ctx.createOscillator(), lfoG = ctx.createGain();
  lfo.frequency.value = 5; lfoG.gain.value = 0; lfo.connect(lfoG); lfoG.connect(trem.gain); lfo.start();
  const conv = ctx.createConvolver(); conv.buffer = makeIR(2.2, 2.6); const rv = ctx.createGain(); rv.gain.value = 0;
  sum.connect(tone); tone.connect(trem); trem.connect(conv); conv.connect(rv);
  trem.connect(comp); rv.connect(comp); comp.connect(ctx.destination);
  recDest = ctx.createMediaStreamDestination(); comp.connect(recDest);
  fx = { dry, wet, shaper, tone, trem, lfo, lfoG, rv };
}
const ramp = (p, v) => { if (ctx) p.setTargetAtTime(v, ctx.currentTime, 0.12); };
function applyTone() {
  chemCutEff = Math.min(20000, Math.max(250, chemCut * Math.pow(2, toneVal * 1.6)));
  formantScale = Math.pow(2, toneVal * 0.22);
  if (fx) { ramp(fx.tone.frequency, chemCutEff); ramp(fx.tone.Q, chemQ); }
}
let chemCutEff = 18000;
// profile: {cutoff,q,drive,reverb,tremRate,tremDepth,pitch}
export function setChem(p) {
  chemCut = p.cutoff; chemQ = p.q; pitchMul = p.pitch; applyTone();
  if (!fx) return;
  fx.shaper.curve = curve(p.drive * 40); ramp(fx.wet.gain, Math.min(1, p.drive * 1.6)); ramp(fx.dry.gain, 1 - Math.min(0.6, p.drive));
  ramp(fx.rv.gain, p.reverb); ramp(fx.lfo.frequency, p.tremRate); ramp(fx.lfoG.gain, p.tremDepth);
}
export function setTone(x) { toneVal = x; applyTone(); }
function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}
function osc(type, f0, f1, t, dur, peak, a = 0.004, dest = master) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0 * pitchMul, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1 * pitchMul, t + dur);
  env(g, t, a, peak, dur); o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + a + 0.05); return o;
}
function noise(t, dur, peak, ftype, f0, f1, q = 1, a = 0.004, dest = master) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = ftype; f.Q.value = q; f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, a, peak, dur); s.connect(f); f.connect(g); g.connect(dest);
  s.start(t); s.stop(t + dur + a + 0.05);
}

// each voice: (when, velocity 0..1)
export const VOICES = {
  heart(t, v) { osc('sine', 150, 42, t, 0.28, 1.0 * v); osc('sine', 150, 48, t + 0.17, 0.22, 0.6 * v); noise(t, 0.03, 0.2 * v, 'lowpass', 900, 200); },
  lungs(t, v) { noise(t, 0.9, 0.5 * v, 'bandpass', 400, 2400, 0.8, 0.35); },
  stomach(t, v) { const o = osc('sawtooth', 70, 38, t, 0.7, 0.35 * v, 0.02); const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 9; lg.gain.value = 18; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 0.8); },
  intestines(t, v) { for (let i = 0; i < 5; i++) osc('sine', 300 + Math.random() * 500, 120, t + i * 0.06, 0.1, 0.25 * v); },
  liver(t, v) { osc('triangle', 55, 55, t, 1.0, 0.7 * v, 0.03); osc('sine', 110, 110, t, 0.9, 0.2 * v, 0.03); },
  kidneyL(t, v) { osc('square', 440, 440, t, 0.18, 0.15 * v); osc('square', 660, 660, t + 0.09, 0.18, 0.12 * v); },
  kidneyR(t, v) { osc('square', 330, 330, t, 0.18, 0.15 * v); osc('square', 495, 495, t + 0.09, 0.18, 0.12 * v); },
  brain(t, v) { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => osc('sine', f, f, t + i * 0.04, 1.4, 0.18 * v, 0.01)); },
  eyes(t, v) { osc('sine', 2200, 3300, t, 0.08, 0.2 * v); osc('sine', 3300, 2200, t + 0.09, 0.08, 0.15 * v); },
  hands(t, v) { noise(t, 0.12, 0.5 * v, 'highpass', 6000, 6000, 1); noise(t + 0.01, 0.1, 0.35 * v, 'bandpass', 1500, 1200, 3); },
  spine(t, v) { osc('sawtooth', 98, 98, t, 0.45, 0.4 * v, 0.005); osc('sawtooth', 98.6, 98.6, t, 0.45, 0.3 * v, 0.005); },
  jaw(t, v) { noise(t, 0.05, 0.6 * v, 'bandpass', 3000, 500, 4); osc('square', 220, 80, t, 0.1, 0.3 * v); },
  feet(t, v) { osc('sine', 120, 35, t, 0.35, 1.0 * v); noise(t, 0.05, 0.3 * v, 'lowpass', 2000, 150); },
};
// ---- VOX: formant "singing" synth. Each trigger sings the next syllable of the text.
const FORMANTS = { a: [800, 1150, 2900], e: [530, 1840, 2480], i: [270, 2290, 3010], o: [570, 840, 2410], u: [300, 870, 2240] };
const SCALE = [0, 3, 5, 7, 10, 12, 10, 7, 5, 3];
const vox = { syl: [], n: 0, base: 110, type: 'choir' };
export function syllabify(text) {
  const out = [];
  for (const w of (text.toLowerCase().match(/[a-z]+/g) || [])) {
    const parts = w.match(/[^aeiouy]*[aeiouy]+(?:[^aeiouy]+$)?|[^aeiouy]+$/g) || [w];
    for (const p of parts) {
      const m = p.match(/^([^aeiouy]*)([aeiouy]+)/);
      const v = m ? m[2][0] : 'a';
      out.push({ onset: m ? m[1] : p, vowel: v === 'y' ? 'i' : v, text: p });
    }
  }
  return out;
}
export function setVoxText(text) { vox.syl = syllabify(text); vox.n = 0; }
export function setVoxBase(hz) { vox.base = hz; }
export function setVoxType(t) { vox.type = t; }
export function voxInfo() { return { count: vox.syl.length, next: vox.n }; }
VOICES.vox = function (t, v) {
  if (!vox.syl.length) return;
  const s = vox.syl[vox.n % vox.syl.length];
  let hz = vox.base * pitchMul * Math.pow(2, SCALE[vox.n % SCALE.length] / 12); vox.n++;
  const type = vox.type;
  if (type === 'deep') hz *= 0.5;
  const fs = formantScale * (type === 'deep' ? 0.82 : 1);
  const dur = type === 'robot' ? 0.22 : 0.34, F = (FORMANTS[s.vowel] || FORMANTS.a).map((f) => f * fs);
  const c = s.onset[0];
  if (c) {
    if ('sfhzvx'.includes(c)) noise(t, 0.09, 0.35 * v, 'highpass', 5500, 5500, 1, 0.01);
    else if ('tkpdbgc'.includes(c)) noise(t, 0.03, 0.5 * v, 'bandpass', c === 'k' || c === 'g' || c === 'c' ? 1800 : 3500, 900, 2, 0.002);
    else if ('mn'.includes(c)) osc('sine', hz / pitchMul, hz / pitchMul, t, 0.1, 0.25 * v, 0.01);
  }
  const t0 = t + (c ? 0.04 : 0);
  let src, lfo = null;
  if (type === 'whisper') { src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; }
  else {
    src = ctx.createOscillator(); src.type = type === 'robot' ? 'square' : 'sawtooth'; src.frequency.setValueAtTime(hz, t0);
    if (type !== 'robot') { lfo = ctx.createOscillator(); const lg = ctx.createGain(); lfo.frequency.value = 5.5; lg.gain.value = hz * 0.012; lfo.connect(lg); lg.connect(src.frequency); }
  }
  const out = ctx.createGain(); env(out, t0, type === 'whisper' ? 0.06 : 0.03, (type === 'whisper' ? 2.4 : 0.9) * v, dur);
  F.forEach((f, k) => {
    const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = (type === 'whisper' ? 5 : 8) + k * 2;
    const g = ctx.createGain(); g.gain.value = [1, 0.7, 0.4][k] * 2.2;
    src.connect(b); b.connect(g); g.connect(out);
  });
  out.connect(master); src.start(t0); src.stop(t0 + dur + 0.1);
  if (lfo) { lfo.start(t0); lfo.stop(t0 + dur + 0.1); }
};
setVoxText('be the beat of the body');
export function _useContext(c, m) { ctx = c; master = m; noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }

// ---- per-organ sound assignment (library lives in sounds.js and is registered at start-up)
let soundTable = {}; const assigned = {}; const noteOf = {};
export const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const noiseBuffer = () => noiseBuf;
export const pitchMultiplier = () => pitchMul;
export function registerSounds(t) { soundTable = t; }
export function assignSound(voice, id) { if (id && soundTable[id]) assigned[voice] = id; else delete assigned[voice]; }
export function assignNote(voice, midi) { noteOf[voice] = midi; }
export const getAssigned = (voice) => assigned[voice] || '';
// record whatever reaches the speakers (after effects) and hand back a file
export function startRecording() {
  if (!recDest || typeof MediaRecorder === 'undefined' || recorder) return false;
  recChunks = []; recorder = new MediaRecorder(recDest.stream);
  recorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
  recorder.start(); return true;
}
export function stopRecording() {
  return new Promise((resolve) => {
    if (!recorder) return resolve(null);
    const r = recorder; recorder = null;
    r.onstop = () => resolve(new Blob(recChunks, { type: r.mimeType || 'audio/webm' }));
    r.stop();
  });
}
export function play(name, vel = 1, when) {
  if (!ctx) return;
  const t = when ?? ctx.currentTime + 0.001, snd = assigned[name] && soundTable[assigned[name]];
  if (snd) { snd.play(t, vel, midiHz(noteOf[name] ?? 60) * pitchMul, 0.32); return; }
  if (VOICES[name]) VOICES[name](t, vel);
}
