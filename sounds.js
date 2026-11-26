// BodyBeat sound library: every sound is synthesized live with Web Audio (no samples).
// play(t, vel, freq, dur) -> handle { release() }.  Pitched sounds use freq; the rest ignore it.
import { audioCtx, masterNode, noiseBuffer } from './audio.js';

const C = () => audioCtx(), OUT = () => masterNode(), NB = () => noiseBuffer();
export const SOUNDS = {};
export const CATEGORIES = ['Instruments', 'Drums', 'Mouth', 'Breath', 'EEG', 'X-ray', 'Hospital', 'Psychedelic'];
const NOOP = { release() {} };
function reg(id, cat, play, o = {}) { SOUNDS[id] = { id, name: id, cat, play, pitched: !!o.pitched, sustain: !!o.sustain }; }

// ---- helpers
const G = (v = 0.0001) => { const g = C().createGain(); g.gain.value = v; return g; };
const F = (type, f, q = 1) => { const b = C().createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
function OS(type, f, det = 0) { const o = C().createOscillator(); if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type); o.frequency.value = f; o.detune.value = det; return o; }
function NS() { const s = C().createBufferSource(); s.buffer = NB(); s.loop = true; return s; }
const wcache = new WeakMap();
function wave(key, fn) {
  const c = C(); let m = wcache.get(c); if (!m) { m = new Map(); wcache.set(c, m); }
  if (!m.has(key)) { const n = 48, re = new Float32Array(n + 1), im = new Float32Array(n + 1); for (let k = 1; k <= n; k++) im[k] = fn(k); m.set(key, c.createPeriodicWave(re, im)); }
  return m.get(key);
}
const clipCurve = (k) => { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = Math.tanh(k * x); } return c; };
function shaper(k) { const s = C().createWaveShaper(); s.curve = clipCurve(k); s.oversample = '2x'; return s; }
function perc(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function run(src, t, dur) { src.start(t); src.stop(t + dur + 0.05); return src; }
function tone(type, f0, f1, t, dur, peak, a = 0.003, dest = OUT()) {
  const o = OS(type, f0), g = G(); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  perc(g, t, a, peak, dur); o.connect(g); g.connect(dest); run(o, t, dur + a); return o;
}
function noise(t, dur, peak, ftype, f0, f1, q = 1, a = 0.003, dest = OUT()) {
  const s = NS(), f = F(ftype, f0, q), g = G(); f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  perc(g, t, a, peak, dur); s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur + a + 0.05);
}
// sustained voice: ADSR gain, sources started at t, held until release() or dur
function sus(t, dur, p, build) {
  const g = G(), srcs = [], fin = Number.isFinite(dur);
  if (fin) dur = Math.max(dur, p.a + p.d + 0.02);
  const stopAt = fin ? t + dur + p.r * 1.6 + 0.1 : Infinity;
  const add = (s) => { s.start(t); if (fin) s.stop(stopAt); srcs.push(s); return s; };
  build(g, add);
  const sl = Math.max(0.0002, p.peak * p.s);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(p.peak, t + p.a); g.gain.exponentialRampToValueAtTime(sl, t + p.a + p.d);
  if (fin) g.gain.setTargetAtTime(0.0001, t + dur, p.r / 3);
  g.connect(OUT());
  let done = false;
  return { release() { if (done || fin) return; done = true; const n = C().currentTime; g.gain.cancelScheduledValues(n); g.gain.setTargetAtTime(0.0001, n, p.r / 3); srcs.forEach((s) => { try { s.stop(n + p.r * 1.6 + 0.1); } catch {} }); } };
}
function vibrato(add, osc, t, rate, cents, delay = 0.25) {
  const l = add(OS('sine', rate)), lg = G(0); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(cents, t + delay + 0.25); l.connect(lg); lg.connect(osc.detune);
}
// plucked string: custom spectrum through a closing lowpass
function pluck(wv, t, f, vel, o) {
  const os = OS(wv, f, o.det || 0), lp = F('lowpass', Math.min(18000, f * o.c0)), g = G();
  lp.frequency.setValueAtTime(Math.min(18000, f * o.c0), t); lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * o.c1), t + o.ct);
  perc(g, t, 0.004, o.peak * vel, o.decay); os.connect(lp); lp.connect(g); g.connect(o.dest || OUT()); run(os, t, o.decay + 0.004); return { os, lp, g };
}

// ================= INSTRUMENTS =================
reg('piano', 'Instruments', (t, v, f) => {
  const w = wave('piano', (k) => 1 / Math.pow(k, 1.1) * (k % 7 === 0 ? 0.3 : 1)), dec = Math.min(3, Math.max(0.6, 3.2 - f / 500));
  pluck(w, t, f, v, { c0: 9 + 6 * v, c1: 2.5, ct: dec * 0.5, decay: dec, peak: 0.3, det: -3 }); pluck(w, t, f, v, { c0: 9 + 6 * v, c1: 2.5, ct: dec * 0.5, decay: dec, peak: 0.3, det: 3 });
  noise(t, 0.012, 0.12 * v, 'bandpass', 2800, 2000, 1.2); return NOOP;
}, { pitched: true });
reg('electric guitar', 'Instruments', (t, v, f, dur) => {
  const o1 = OS('sawtooth', f, -6), o2 = OS('square', f, 7), ws = shaper(18), lp = F('lowpass', 3200, 0.8), hp = F('highpass', 110), g = G(), mix = G(0.5);
  const d = Math.min(1.6, Math.max(0.5, dur + 0.5)); perc(g, t, 0.003, 0.28 * v, d);
  o1.connect(mix); o2.connect(mix); mix.connect(ws); ws.connect(lp); lp.connect(hp); hp.connect(g); g.connect(OUT());
  const l = OS('sine', 5.5), lg = G(0); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(9, t + 0.5); l.connect(lg); lg.connect(o1.detune); lg.connect(o2.detune);
  [o1, o2, l].forEach((s) => run(s, t, d)); return NOOP;
}, { pitched: true });
reg('acoustic guitar', 'Instruments', (t, v, f) => {
  const w = wave('ac', (k) => (k % 2 ? 1 : 0.8) / Math.pow(k, 1.05));
  pluck(w, t, f, v, { c0: 11, c1: 2.8, ct: 0.35, decay: 1.5, peak: 0.34 }); noise(t, 0.015, 0.1 * v, 'bandpass', 2200, 1500, 1); return NOOP;
}, { pitched: true });
reg('harp', 'Instruments', (t, v, f) => {
  const w = wave('harp', (k) => 1 / Math.pow(k, 1.5));
  pluck(w, t, f, v, { c0: 7, c1: 3, ct: 0.5, decay: 2.4, peak: 0.36 }); tone('sine', f * 2, f * 2, t, 1.2, 0.05 * v); return NOOP;
}, { pitched: true });
reg('sitar', 'Instruments', (t, v, f) => {
  const w = wave('sitar', (k) => 1 / Math.pow(k, 0.75)), o = OS(w, f * 0.985), ws = shaper(4), lp = F('lowpass', f * 14), g = G();
  o.frequency.setValueAtTime(f * 0.985, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
  lp.frequency.setValueAtTime(Math.min(16000, f * 14), t); lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 3), t + 0.9);
  perc(g, t, 0.004, 0.3 * v, 2.4); o.connect(ws); ws.connect(lp); lp.connect(g); g.connect(OUT()); run(o, t, 2.5);
  tone('sine', f * 2.01, f * 2.01, t, 3, 0.03 * v, 0.05); tone('sine', f * 3.02, f * 3.02, t, 3, 0.02 * v, 0.05); noise(t, 0.06, 0.08 * v, 'bandpass', f * 6, f * 4, 3); return NOOP;
}, { pitched: true });
reg('bass', 'Instruments', (t, v, f, dur) => sus(t, dur, { a: 0.005, d: 0.3, s: 0.5, r: 0.12, peak: 0.42 * v }, (g, add) => {
  const s = add(OS('sine', f)), sw = add(OS('sawtooth', f)), sub = add(OS('sine', f / 2)), lp = F('lowpass', 700, 0.7), m = G(0.4);
  lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(220, t + 0.3);
  s.connect(g); sw.connect(m); m.connect(lp); lp.connect(g); sub.connect(g);
}), { pitched: true, sustain: true });
reg('violin', 'Instruments', (t, v, f, dur) => sus(t, dur, { a: 0.09, d: 0.15, s: 0.8, r: 0.18, peak: 0.2 * v }, (g, add) => {
  const a = add(OS('sawtooth', f, -5)), b = add(OS('sawtooth', f, 5)), lp = F('lowpass', Math.min(9000, f * 6), 0.7), p1 = F('peaking', 350), p2 = F('peaking', 2500);
  p1.gain.value = 6; p2.gain.value = 5; vibrato(add, a, t, 5.2, 14); vibrato(add, b, t, 5.2, 14);
  const bn = add(NS()), bf = F('bandpass', Math.min(8000, f * 4), 2), bg = G(0.03); bn.connect(bf); bf.connect(bg); bg.connect(g);
  a.connect(lp); b.connect(lp); lp.connect(p1); p1.connect(p2); p2.connect(g);
}), { pitched: true, sustain: true });
reg('flute', 'Instruments', (t, v, f, dur) => sus(t, dur, { a: 0.07, d: 0.1, s: 0.85, r: 0.12, peak: 0.3 * v }, (g, add) => {
  const a = add(OS('sine', f)), b = add(OS('sine', f * 2)), c = add(OS('sine', f * 3)), gb = G(0.16), gc = G(0.05), lp = F('lowpass', 5000);
  vibrato(add, a, t, 5, 8, 0.35); b.connect(gb); c.connect(gc); a.connect(lp); gb.connect(lp); gc.connect(lp); lp.connect(g);
  const n = add(NS()), nf = F('bandpass', Math.min(9000, f * 2), 3), ng = G(0.07); n.connect(nf); nf.connect(ng); ng.connect(g);
}), { pitched: true, sustain: true });
reg('harmonium', 'Instruments', (t, v, f, dur) => sus(t, dur, { a: 0.05, d: 0.05, s: 0.9, r: 0.1, peak: 0.2 * v }, (g, add) => {
  const a = add(OS('sawtooth', f)), b = add(OS('sawtooth', f * 1.003)), c = add(OS('square', f * 0.5)), gc = G(0.4), lp = F('lowpass', 2400), pk = F('peaking', 1100);
  pk.gain.value = 8; a.connect(lp); b.connect(lp); c.connect(gc); gc.connect(lp); lp.connect(pk);
  const tr = G(1), l = add(OS('sine', 4.5)), lg = G(0.06); l.connect(lg); lg.connect(tr.gain); pk.connect(tr); tr.connect(g);
  const n = add(NS()), nf = F('lowpass', 500), ng = G(0.012); n.connect(nf); nf.connect(ng); ng.connect(g);
}), { pitched: true, sustain: true });
reg('harmonica', 'Instruments', (t, v, f, dur) => sus(t, dur, { a: 0.03, d: 0.1, s: 0.8, r: 0.1, peak: 0.24 * v }, (g, add) => {
  const a = add(OS('sawtooth', f, -8)), b = add(OS('square', f, 8)), gb = G(0.5), lp = F('lowpass', 3500), bp = F('bandpass', 1400, 1.5), m = G(1), tr = G(1);
  const l = add(OS('sine', 6)), lg = G(0.12); l.connect(lg); lg.connect(tr.gain); a.connect(lp); b.connect(gb); gb.connect(lp); lp.connect(m); lp.connect(bp); bp.connect(m); m.connect(tr); tr.connect(g);
  const n = add(NS()), nf = F('bandpass', 3000, 1), ng = G(0.04); n.connect(nf); nf.connect(ng); ng.connect(g);
}), { pitched: true, sustain: true });
reg('saxophone', 'Instruments', (t, v, f, dur) => sus(t, dur, { a: 0.05, d: 0.1, s: 0.85, r: 0.14, peak: 0.22 * v }, (g, add) => {
  const a = add(OS('sawtooth', f)), b = add(OS('square', f * 1.002)), gb = G(0.35), lp = F('lowpass', Math.min(7000, f * 7)), p1 = F('peaking', 800), p2 = F('peaking', 1800), bp = F('bandpass', 1500, 1), bg = G(0.4);
  p1.gain.value = 7; p2.gain.value = 5; vibrato(add, a, t, 5, 11, 0.3); a.connect(lp); b.connect(gb); gb.connect(lp); lp.connect(p1); p1.connect(p2); p2.connect(g); lp.connect(bp); bp.connect(bg); bg.connect(g);
  const n = add(NS()), nf = F('bandpass', 2200, 2), ng = G(0.035); n.connect(nf); nf.connect(ng); ng.connect(g);
}), { pitched: true, sustain: true });
reg('trumpet', 'Instruments', (t, v, f, dur) => sus(t, dur, { a: 0.04, d: 0.08, s: 0.85, r: 0.1, peak: 0.2 * v }, (g, add) => {
  const a = add(OS('sawtooth', f)), lp = F('lowpass', f * 3), pk = F('peaking', 1200); pk.gain.value = 6;
  lp.frequency.setValueAtTime(f * 3, t); lp.frequency.exponentialRampToValueAtTime(Math.min(12000, f * 9), t + 0.12); vibrato(add, a, t, 5.2, 8, 0.35); a.connect(lp); lp.connect(pk); pk.connect(g);
}), { pitched: true, sustain: true });
reg('trombone', 'Instruments', (t, v, f, dur) => sus(t, dur, { a: 0.07, d: 0.1, s: 0.85, r: 0.14, peak: 0.22 * v }, (g, add) => {
  const a = add(OS('sawtooth', f)), b = add(OS('sawtooth', f * 1.004)), lp = F('lowpass', f * 2.5), pk = F('peaking', 600); pk.gain.value = 7;
  lp.frequency.setValueAtTime(f * 2.5, t); lp.frequency.exponentialRampToValueAtTime(Math.min(8000, f * 6), t + 0.2); vibrato(add, a, t, 4.6, 9, 0.4); a.connect(lp); b.connect(lp); lp.connect(pk); pk.connect(g);
}), { pitched: true, sustain: true });
reg('organ', 'Instruments', (t, v, f, dur) => sus(t, dur, { a: 0.01, d: 0.05, s: 1, r: 0.06, peak: 0.16 * v }, (g, add) => {
  [1, 2, 3, 4, 6, 8].forEach((h, i) => { const o = add(OS('sine', f * h)), og = G([0.6, 0.5, 0.35, 0.3, 0.18, 0.12][i]); o.connect(og); og.connect(g); });
}), { pitched: true, sustain: true });
reg('casio', 'Instruments', (t, v, f, dur) => sus(t, dur, { a: 0.003, d: 0.25, s: 0.15, r: 0.08, peak: 0.2 * v }, (g, add) => {
  const c = add(OS(wave('pulse', (k) => Math.sin(k * Math.PI * 0.25) / k), f)), m = add(OS('sine', f * 3)), mg = G(f * 2);
  mg.gain.setValueAtTime(f * 2, t); mg.gain.exponentialRampToValueAtTime(f * 0.2, t + 0.25); m.connect(mg); mg.connect(c.frequency); c.connect(g);
}), { pitched: true, sustain: true });
reg('kalimba', 'Instruments', (t, v, f) => { tone('sine', f, f, t, 1.2, 0.3 * v); tone('sine', f * 5.4, f * 5.4, t, 0.12, 0.12 * v); noise(t, 0.01, 0.06 * v, 'bandpass', 3000, 2000, 2); return NOOP; }, { pitched: true });
reg('glass bell', 'Instruments', (t, v, f) => {
  const c = OS('sine', f), m = OS('sine', f * 3.5), mg = G(f * 2.2), g = G(); mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 2.5);
  m.connect(mg); mg.connect(c.frequency); perc(g, t, 0.003, 0.25 * v, 3); c.connect(g); g.connect(OUT()); run(c, t, 3); run(m, t, 3); return NOOP;
}, { pitched: true });

// ================= DRUMS =================
reg('kick', 'Drums', (t, v) => { tone('sine', 150, 45, t, 0.2, 0.9 * v); noise(t, 0.012, 0.25 * v, 'lowpass', 1500, 300); return NOOP; });
reg('snare', 'Drums', (t, v) => { noise(t, 0.2, 0.5 * v, 'bandpass', 1800, 1500, 0.8); tone('triangle', 190, 160, t, 0.1, 0.4 * v); return NOOP; });
reg('hat closed', 'Drums', (t, v) => { noise(t, 0.05, 0.3 * v, 'highpass', 7000, 7000, 1); return NOOP; });
reg('hat open', 'Drums', (t, v) => { noise(t, 0.35, 0.28 * v, 'highpass', 6500, 6500, 1); return NOOP; });
reg('tom', 'Drums', (t, v, f) => { tone('sine', 200, 90, t, 0.35, 0.7 * v); noise(t, 0.02, 0.15 * v, 'bandpass', 1500, 800, 1); return NOOP; });
reg('clap', 'Drums', (t, v) => { [0, 0.011, 0.023].forEach((o) => noise(t + o, 0.04, 0.4 * v, 'bandpass', 1500, 1300, 1.2)); noise(t + 0.03, 0.18, 0.3 * v, 'bandpass', 1400, 900, 1); return NOOP; });
reg('rim', 'Drums', (t, v) => { tone('sine', 1700, 1500, t, 0.03, 0.4 * v); tone('square', 480, 440, t, 0.03, 0.15 * v); return NOOP; });
reg('cymbal', 'Drums', (t, v) => { noise(t, 1.3, 0.25 * v, 'highpass', 5000, 5000, 0.7); noise(t, 0.8, 0.12 * v, 'bandpass', 8500, 8000, 3); return NOOP; });
reg('cowbell', 'Drums', (t, v) => { const g = G(); perc(g, t, 0.002, 0.3 * v, 0.28); const bp = F('bandpass', 700, 1.2); [560, 845].forEach((f) => { const o = OS('square', f); o.connect(bp); run(o, t, 0.3); }); bp.connect(g); g.connect(OUT()); return NOOP; });

// ================= MOUTH =================
reg('lip pop', 'Mouth', (t, v) => { tone('sine', 700, 120, t, 0.07, 0.55 * v); noise(t, 0.015, 0.2 * v, 'bandpass', 1800, 900, 2); return NOOP; });
reg('tongue click', 'Mouth', (t, v) => { noise(t, 0.025, 0.5 * v, 'bandpass', 2500, 1800, 8); tone('sine', 1200, 400, t, 0.05, 0.3 * v); return NOOP; });
reg('mouth kick', 'Mouth', (t, v) => { tone('sine', 130, 48, t, 0.14, 0.8 * v); noise(t, 0.035, 0.3 * v, 'lowpass', 700, 200); noise(t, 0.01, 0.15 * v, 'bandpass', 1800, 1200, 2); return NOOP; });
reg('mouth snare', 'Mouth', (t, v) => { noise(t, 0.11, 0.5 * v, 'bandpass', 2600, 1900, 1.2); tone('sine', 320, 200, t, 0.05, 0.25 * v); return NOOP; });
reg('mouth hat', 'Mouth', (t, v) => { noise(t, 0.07, 0.3 * v, 'highpass', 6500, 6500, 1.5); return NOOP; });
reg('kiss', 'Mouth', (t, v) => { tone('sine', 900, 1800, t, 0.06, 0.3 * v); noise(t + 0.04, 0.05, 0.2 * v, 'bandpass', 3500, 2500, 3); return NOOP; });
reg('mouth bass hum', 'Mouth', (t, v, f, dur) => sus(t, dur, { a: 0.03, d: 0.1, s: 0.9, r: 0.1, peak: 0.34 * v }, (g, add) => {
  const o = add(OS('sawtooth', f / 2)), lp = F('lowpass', 320, 1.4), pk = F('peaking', 450); pk.gain.value = 8; vibrato(add, o, t, 5, 6, 0.3); o.connect(lp); lp.connect(pk); pk.connect(g);
}), { pitched: true, sustain: true });
reg('whistle', 'Mouth', (t, v, f, dur) => sus(t, dur, { a: 0.05, d: 0.08, s: 0.9, r: 0.1, peak: 0.22 * v }, (g, add) => {
  const o = add(OS('sine', f * 2)); vibrato(add, o, t, 5.5, 18, 0.2); o.connect(g);
  const n = add(NS()), nf = F('bandpass', Math.min(9000, f * 2), 12), ng = G(0.05); n.connect(nf); nf.connect(ng); ng.connect(g);
}), { pitched: true, sustain: true });
reg('throat growl', 'Mouth', (t, v) => {
  const o = OS('sawtooth', 55), am = G(0.5), l = OS('sine', 32), lg = G(0.5), g = G(), lp = F('lowpass', 500, 1); l.connect(lg); lg.connect(am.gain);
  perc(g, t, 0.03, 0.4 * v, 0.55); o.connect(am); am.connect(lp); lp.connect(g); g.connect(OUT()); run(o, t, 0.6); run(l, t, 0.6); noise(t, 0.5, 0.15 * v, 'lowpass', 500, 250, 1); return NOOP;
});

// ================= BREATH =================
reg('inhale', 'Breath', (t, v) => { noise(t, 1.1, 0.38 * v, 'bandpass', 500, 2500, 0.9, 0.5); return NOOP; });
reg('exhale', 'Breath', (t, v) => { noise(t, 1.2, 0.38 * v, 'bandpass', 2500, 420, 0.9, 0.12); return NOOP; });
reg('sigh', 'Breath', (t, v) => { noise(t, 1.6, 0.35 * v, 'bandpass', 1800, 300, 0.8, 0.25); tone('sine', 220, 150, t + 0.05, 1.3, 0.04 * v, 0.2); return NOOP; });
reg('gasp', 'Breath', (t, v) => { noise(t, 0.28, 0.5 * v, 'bandpass', 800, 3500, 1.2, 0.05); return NOOP; });
reg('wheeze', 'Breath', (t, v) => {
  const s = NS(), f = F('bandpass', 1400, 10), am = G(0.6), l = OS('sine', 7), lg = G(0.4), g = G(); l.connect(lg); lg.connect(am.gain); perc(g, t, 0.1, 2.0 * v, 1.1);
  s.connect(f); f.connect(am); am.connect(g); g.connect(OUT()); s.start(t); s.stop(t + 1.3); run(l, t, 1.3); return NOOP;
});
reg('panting', 'Breath', (t, v) => { for (let i = 0; i < 6; i++) noise(t + i * 0.2, 0.17, 0.3 * v, 'bandpass', i % 2 ? 2400 : 1200, i % 2 ? 1500 : 2200, 1.2, 0.04); return NOOP; });

// ================= EEG =================
function eegTone(carrier, hz, t, dur, peak, pan = 0) {
  const o = OS('sine', carrier), am = G(0.5), l = OS('sine', hz), lg = G(0.5), g = G(); l.connect(lg); lg.connect(am.gain);
  perc(g, t, 0.25, peak, dur); o.connect(am); am.connect(g);
  if (pan && C().createStereoPanner) { const p = C().createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(OUT()); } else g.connect(OUT());
  run(o, t, dur + 0.3); run(l, t, dur + 0.3);
}
reg('eeg delta', 'EEG', (t, v) => { eegTone(70, 2, t, 1.8, 0.4 * v); eegTone(140, 2, t, 1.8, 0.12 * v); return NOOP; });
reg('eeg theta', 'EEG', (t, v) => { eegTone(140, 6, t, 1.6, 0.34 * v); return NOOP; });
reg('eeg alpha', 'EEG', (t, v) => { eegTone(220, 10, t, 1.6, 0.3 * v); eegTone(330, 10, t, 1.6, 0.1 * v); return NOOP; });
reg('eeg beta', 'EEG', (t, v) => { eegTone(330, 20, t, 1.3, 0.26 * v); noise(t, 1.2, 0.04 * v, 'bandpass', 2500, 2500, 2, 0.3); return NOOP; });
reg('eeg gamma', 'EEG', (t, v) => { eegTone(660, 40, t, 1.2, 0.22 * v); eegTone(1320, 40, t, 1.2, 0.07 * v); return NOOP; });
reg('eeg spike', 'EEG', (t, v) => { noise(t, 0.012, 0.5 * v, 'highpass', 3000, 3000, 1); tone('sine', 420, 90, t, 0.18, 0.4 * v); tone('sine', 1400, 1400, t, 0.3, 0.08 * v); return NOOP; });
reg('sleep spindle', 'EEG', (t, v) => { eegTone(520, 13, t, 0.9, 0.3 * v); return NOOP; });
reg('binaural drift', 'EEG', (t, v) => { eegTone(200, 0.1, t, 2.6, 0.2 * v, -1); eegTone(210, 0.1, t, 2.6, 0.2 * v, 1); return NOOP; });

// ================= X-RAY =================
reg('xray charge', 'X-ray', (t, v) => {
  const o = OS('sawtooth', 150), lp = F('lowpass', 4000), g = G(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(3200, t + 1);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28 * v, t + 0.95); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.04); o.connect(lp); lp.connect(g); g.connect(OUT()); run(o, t, 1.05);
  tone('sine', 300, 6400, t, 1, 0.06 * v, 0.4); return NOOP;
});
reg('xray shot', 'X-ray', (t, v) => { noise(t, 0.01, 0.55 * v, 'highpass', 4000, 4000, 1, 0.001); noise(t + 0.005, 0.13, 0.4 * v, 'bandpass', 900, 500, 1); tone('sine', 95, 50, t, 0.28, 0.5 * v); return NOOP; });
reg('xray tube hum', 'X-ray', (t, v) => {
  const g = G(); perc(g, t, 0.25, 0.22 * v, 1.8); g.connect(OUT()); [60, 120, 180, 240].forEach((f, i) => { const o = OS('sine', f), og = G(0.5 / (i + 1)); o.connect(og); og.connect(g); run(o, t, 2.1); });
  noise(t, 1.8, 0.03 * v, 'bandpass', 3000, 3000, 2, 0.25); return NOOP;
});
reg('detector blips', 'X-ray', (t, v) => { for (let i = 0; i < 14; i++) noise(t + Math.random() * 1.2, 0.008, 0.4 * v, 'highpass', 4000, 4000, 1, 0.001); return NOOP; });
reg('fluoro buzz', 'X-ray', (t, v) => {
  const o = OS('sawtooth', 120), am = G(0.5), l = OS('sine', 60), lg = G(0.5), g = G(), hp = F('highpass', 300); l.connect(lg); lg.connect(am.gain); perc(g, t, 0.1, 0.2 * v, 1.2);
  o.connect(am); am.connect(hp); hp.connect(g); g.connect(OUT()); run(o, t, 1.4); run(l, t, 1.4); noise(t, 1.2, 0.04 * v, 'highpass', 5000, 5000, 1); return NOOP;
});

// ================= HOSPITAL =================
reg('ecg beep', 'Hospital', (t, v) => { tone('sine', 1000, 1000, t, 0.1, 0.34 * v, 0.002); return NOOP; });
reg('spo2 beep', 'Hospital', (t, v, f) => { tone('sine', 880, 880, t, 0.09, 0.3 * v, 0.002); return NOOP; });
reg('flatline', 'Hospital', (t, v) => { const o = OS('sine', 1000), g = G(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3 * v, t + 0.01); g.gain.setValueAtTime(0.3 * v, t + 1.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6); o.connect(g); g.connect(OUT()); run(o, t, 1.65); return NOOP; });
reg('alarm', 'Hospital', (t, v) => { [0, 0.18, 0.36].forEach((o, i) => tone('square', i % 2 ? 700 : 880, i % 2 ? 700 : 880, t + o, 0.13, 0.2 * v, 0.003)); return NOOP; });
reg('defib charge', 'Hospital', (t, v) => { tone('sine', 250, 2800, t, 1.1, 0.3 * v, 0.6); tone('sawtooth', 125, 1400, t, 1.1, 0.06 * v, 0.6); return NOOP; });
reg('defib shock', 'Hospital', (t, v) => { noise(t, 0.07, 0.7 * v, 'lowpass', 3500, 800, 0.8, 0.001); tone('sine', 60, 28, t, 0.55, 0.6 * v); noise(t, 0.01, 0.4 * v, 'highpass', 3000, 3000, 1, 0.001); return NOOP; });
reg('ventilator', 'Hospital', (t, v) => { noise(t, 0.9, 0.3 * v, 'bandpass', 600, 1800, 0.8, 0.4); noise(t + 0.95, 0.012, 0.3 * v, 'bandpass', 1800, 1200, 4); noise(t + 1.0, 1.0, 0.22 * v, 'bandpass', 1500, 400, 0.8, 0.05); return NOOP; });
reg('iv drip', 'Hospital', (t, v) => { tone('sine', 1800, 700, t, 0.06, 0.3 * v); noise(t, 0.01, 0.1 * v, 'highpass', 4000, 4000, 1); tone('sine', 1500, 600, t + 0.11, 0.05, 0.1 * v); return NOOP; });
reg('mri knock', 'Hospital', (t, v) => { for (let i = 0; i < 6; i++) { tone('square', 100, 90, t + i * 0.07, 0.05, 0.28 * v, 0.002); noise(t + i * 0.07, 0.03, 0.15 * v, 'lowpass', 900, 400, 1, 0.002); } return NOOP; });
reg('monitor hum', 'Hospital', (t, v) => { const g = G(); perc(g, t, 0.3, 0.16 * v, 2); g.connect(OUT()); [60, 120].forEach((f) => { const o = OS('sine', f); o.connect(g); run(o, t, 2.4); }); noise(t, 2, 0.02 * v, 'highpass', 6000, 6000, 1, 0.3); return NOOP; });
reg('pager', 'Hospital', (t, v) => { for (let i = 0; i < 4; i++) tone('sine', i % 2 ? 1800 : 1400, i % 2 ? 1800 : 1400, t + i * 0.07, 0.06, 0.25 * v, 0.002); return NOOP; });
reg('autoclave hiss', 'Hospital', (t, v) => { noise(t, 1.7, 0.3 * v, 'highpass', 3000, 3000, 0.7, 0.1); return NOOP; });
reg('syringe click', 'Hospital', (t, v) => { noise(t, 0.012, 0.5 * v, 'bandpass', 3500, 3000, 6, 0.001); noise(t + 0.08, 0.012, 0.4 * v, 'bandpass', 3000, 2500, 6, 0.001); return NOOP; });
reg('heart murmur', 'Hospital', (t, v) => { tone('sine', 140, 45, t, 0.2, 0.7 * v); noise(t + 0.08, 0.28, 0.2 * v, 'bandpass', 450, 250, 1.2, 0.05); tone('sine', 150, 50, t + 0.35, 0.16, 0.45 * v); return NOOP; });
reg('suction', 'Hospital', (t, v) => { const s = NS(), f = F('bandpass', 600, 1.5), am = G(0.6), l = OS('sine', 9), lg = G(0.4), g = G(); f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(220, t + 1); l.connect(lg); lg.connect(am.gain); perc(g, t, 0.15, 0.9 * v, 0.9); s.connect(f); f.connect(am); am.connect(g); g.connect(OUT()); s.start(t); s.stop(t + 1.2); run(l, t, 1.2); return NOOP; });

// ================= PSYCHEDELIC =================
reg('reverse cymbal', 'Psychedelic', (t, v) => {
  const s = NS(), f = F('highpass', 3000), g = G(); f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(9000, t + 1.2);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4 * v, t + 1.2); g.gain.linearRampToValueAtTime(0.0001, t + 1.24); s.connect(f); f.connect(g); g.connect(OUT()); s.start(t); s.stop(t + 1.3); return NOOP;
});
reg('sitar drone', 'Psychedelic', (t, v, f, dur) => sus(t, dur, { a: 0.3, d: 0.4, s: 1, r: 0.6, peak: 0.16 * v }, (g, add) => {
  const o = add(OS(wave('sitar', (k) => 1 / Math.pow(k, 0.8)), f / 2)), o2 = add(OS('sawtooth', f / 2 * 1.5, 4)), og = G(0.3), ws = shaper(5), lp = F('lowpass', 2200, 1.2);
  vibrato(add, o, t, 0.4, 20, 0.1); o.connect(ws); o2.connect(og); og.connect(ws); ws.connect(lp); lp.connect(g);
}), { pitched: true, sustain: true });
reg('phaser pad', 'Psychedelic', (t, v, f, dur) => sus(t, dur, { a: 0.6, d: 0.3, s: 1, r: 1, peak: 0.14 * v }, (g, add) => {
  const bp = F('bandpass', 800, 3), m = G(1), l = add(OS('sine', 0.35)), lg = G(500); l.connect(lg); lg.connect(bp.frequency);
  [[f, 0], [f * 1.005, 6], [f * 0.5, -5]].forEach(([fr, d]) => { const o = add(OS('sawtooth', fr, d)); o.connect(bp); }); bp.connect(m); m.connect(g);
}), { pitched: true, sustain: true });
reg('warble bell', 'Psychedelic', (t, v, f) => {
  const c = OS('sine', f), m = OS('sine', f * 2.01), mg = G(f * 1.4), g = G(), l = OS('sine', 6), lg = G(40); mg.gain.setValueAtTime(f * 1.4, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 2.5);
  m.connect(mg); mg.connect(c.frequency); l.connect(lg); lg.connect(c.detune); perc(g, t, 0.01, 0.24 * v, 2.6); c.connect(g); g.connect(OUT()); [c, m, l].forEach((s) => run(s, t, 2.7)); return NOOP;
}, { pitched: true });
reg('wobble bass', 'Psychedelic', (t, v, f, dur) => sus(t, dur, { a: 0.01, d: 0.1, s: 0.9, r: 0.08, peak: 0.3 * v }, (g, add) => {
  const o = add(OS('sawtooth', f / 2)), lp = F('lowpass', 900, 6), l = add(OS('sine', 3)), lg = G(700); l.connect(lg); lg.connect(lp.frequency); o.connect(lp); lp.connect(g);
}), { pitched: true, sustain: true });
reg('trippy arp', 'Psychedelic', (t, v, f) => {
  const dl = C().createDelay(1), fb = G(0.4), wet = G(0.5); dl.delayTime.value = 0.27; dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(OUT());
  [1, 1.2, 1.5, 1.8, 2, 1.8, 1.5, 1.2].forEach((r, i) => { const g = G(), o = OS('triangle', f * r); perc(g, t + i * 0.09, 0.004, 0.22 * v, 0.25); o.connect(g); g.connect(OUT()); g.connect(dl); run(o, t + i * 0.09, 0.3); }); return NOOP;
}, { pitched: true });
reg('whale sweep', 'Psychedelic', (t, v) => {
  const o = OS('sine', 300), l = OS('sine', 6), lg = G(25), g = G(); o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(800, t + 1.1); o.frequency.exponentialRampToValueAtTime(250, t + 2.2);
  l.connect(lg); lg.connect(o.detune); perc(g, t, 0.5, 0.3 * v, 1.9); o.connect(g); g.connect(OUT()); run(o, t, 2.4); run(l, t, 2.4); return NOOP;
});
reg('bubbling', 'Psychedelic', (t, v) => { for (let i = 0; i < 12; i++) { const f0 = 300 + Math.random() * 900; tone('sine', f0, f0 * 1.6, t + Math.random() * 1.2, 0.07, 0.2 * v, 0.004); } return NOOP; });
reg('tape stop', 'Psychedelic', (t, v, f) => {
  const o = OS('sawtooth', f), lp = F('lowpass', 4000), g = G(); o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.1); lp.frequency.setValueAtTime(4000, t); lp.frequency.exponentialRampToValueAtTime(150, t + 1.1);
  g.gain.setValueAtTime(0.25 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15); o.connect(lp); lp.connect(g); g.connect(OUT()); run(o, t, 1.2); return NOOP;
}, { pitched: true });
reg('cosmic swell', 'Psychedelic', (t, v, f, dur) => sus(t, dur, { a: 1.4, d: 0.5, s: 0.9, r: 1.2, peak: 0.13 * v }, (g, add) => {
  const lp = F('lowpass', 800, 0.8); lp.frequency.setValueAtTime(800, t); lp.frequency.exponentialRampToValueAtTime(6000, t + 2.5);
  [f, f * 1.5, f * 2.003, f * 0.5].forEach((fr, i) => { const o = add(OS('sawtooth', fr, i * 3 - 4)); o.connect(lp); }); lp.connect(g);
}), { pitched: true, sustain: true });
reg('acid squelch', 'Psychedelic', (t, v, f) => {
  const o = OS('sawtooth', f), lp = F('lowpass', f * 4, 14), g = G(); lp.frequency.setValueAtTime(Math.min(12000, f * 8), t); lp.frequency.exponentialRampToValueAtTime(Math.max(120, f * 0.5), t + 0.3);
  perc(g, t, 0.005, 0.28 * v, 0.35); o.connect(lp); lp.connect(g); g.connect(OUT()); run(o, t, 0.4); return NOOP;
}, { pitched: true });
reg('laser', 'Psychedelic', (t, v) => { tone('sine', 3000, 200, t, 0.16, 0.3 * v, 0.002); return NOOP; });
reg('ufo', 'Psychedelic', (t, v) => { const o = OS('sine', 800), l = OS('sine', 10), lg = G(400), g = G(); l.connect(lg); lg.connect(o.frequency); perc(g, t, 0.3, 0.25 * v, 1.2); o.connect(g); g.connect(OUT()); run(o, t, 1.6); run(l, t, 1.6); return NOOP; });
