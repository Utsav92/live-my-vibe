// Pandora's default kit, made in code: six two-bar loops for the cube and a drum loop underneath.
// 120 BPM, A minor. Each loop is rendered once into an AudioBuffer.
export const KIT_BPM = 120;
export const TRACKS = [
  { name: 'GLASS', col: '#8ec5ff', hint: 'FM bells, arpeggiated' },
  { name: 'REED', col: '#ffb45e', hint: 'a breathing pad of detuned saws' },
  { name: 'WIRE', col: '#7fe0bd', hint: 'plucked strings' },
  { name: 'BLOOM', col: '#c59cff', hint: 'slow sine swells' },
  { name: 'GRIT', col: '#ff8470', hint: 'driven bass' },
  { name: 'SPARK', col: '#fff1d6', hint: 'glitch blips and ticks' },
];
export const BEAT = { name: 'BEAT', col: '#8a8f98', hint: 'broken-beat drums' };
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const S16 = 60 / KIT_BPM / 4;                                  // a sixteenth: 0.125 s
const LEN = S16 * 32;                                          // two bars: 4 s

function seeded(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0008, t + a + d); };
function verbIR(c, secs) { const n = Math.round(c.sampleRate * secs), b = c.createBuffer(2, n, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); } return b; }
function bus(c, wet = 0.25) { const out = c.createGain(), v = c.createConvolver(), w = c.createGain(); v.buffer = verbIR(c, 1.6); w.gain.value = wet; out.connect(c.destination); out.connect(v).connect(w).connect(c.destination); return out; }

const glass = (c, o) => {                                       // FM bells: Am7 then Fmaj7, up and down in eighths
  const notes = [[69, 72, 76, 79, 81, 79, 76, 72], [65, 69, 72, 76, 77, 76, 72, 69]];
  for (let b = 0; b < 2; b++) notes[b].forEach((m, i) => { const t = b * 2 + i * S16 * 2, car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
    car.frequency.value = hz(m + 12); mod.frequency.value = hz(m + 12) * 3.5; mg.gain.setValueAtTime(hz(m + 12) * 2.2, t); mg.gain.exponentialRampToValueAtTime(5, t + 0.6);
    mod.connect(mg).connect(car.frequency); car.connect(g).connect(o); env(g, t, 0.004, 0.22, 0.9); car.start(t); mod.start(t); car.stop(t + 1.2); mod.stop(t + 1.2); });
};
const reed = (c, o) => {                                        // pad chords that breathe with the beat
  const chords = [[57, 60, 64, 67], [53, 57, 60, 64]], lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4; lp.connect(o);
  lp.frequency.setValueAtTime(500, 0); lp.frequency.linearRampToValueAtTime(2400, 1.9); lp.frequency.setValueAtTime(600, 2); lp.frequency.linearRampToValueAtTime(2600, 3.9);
  chords.forEach((ch, b) => ch.forEach((m) => [-7, 7].forEach((det) => { const s = c.createOscillator(), g = c.createGain(); s.type = 'sawtooth'; s.frequency.value = hz(m); s.detune.value = det; s.connect(g).connect(lp);
    for (let q = 0; q < 4; q++) { const t = b * 2 + q * 0.5; g.gain.setValueAtTime(0.012, t); g.gain.linearRampToValueAtTime(0.05, t + 0.3); g.gain.linearRampToValueAtTime(0.02, t + 0.5); }
    s.start(b * 2); s.stop(b * 2 + 2); })));
};
function wire(c, sr) {                                          // plucked strings (Karplus-Strong), written sample by sample
  const n = Math.round(LEN * sr), L = new Float32Array(n), R = new Float32Array(n), rnd = seeded(11);
  const line = [[0, 64], [3, 67], [6, 69], [8, 72], [11, 71], [14, 67], [16, 65], [19, 69], [22, 72], [24, 76], [27, 74], [30, 72]];
  for (const [step, m] of line) {
    const start = Math.round(step * S16 * sr), per = Math.round(sr / hz(m)), buf = new Float32Array(per); for (let i = 0; i < per; i++) buf[i] = rnd() * 2 - 1;
    const pan = (rnd() - 0.5) * 0.8; let idx = 0;
    for (let i = start; i < Math.min(n, start + sr * 1.6); i++) { const a = buf[idx], b = buf[(idx + 1) % per]; buf[idx] = (a + b) * 0.4965; idx = (idx + 1) % per; const v = a * 0.32; L[i] += v * (1 - pan); R[i] += v * (1 + pan); }
  }
  return [L, R];
}
const bloom = (c, o) => {                                       // slow sine swells, a chord per bar
  [[45, 57, 64, 72], [41, 53, 60, 69]].forEach((ch, b) => ch.forEach((m, j) => { const s = c.createOscillator(), v = c.createOscillator(), vg = c.createGain(), g = c.createGain(); s.type = j ? 'sine' : 'triangle'; s.frequency.value = hz(m);
    v.frequency.value = 5 + j * 0.4; vg.gain.value = hz(m) * 0.004; v.connect(vg).connect(s.frequency); s.connect(g).connect(o);
    const t = b * 2; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 1.1); g.gain.linearRampToValueAtTime(0.0, t + 2); s.start(t); v.start(t); s.stop(t + 2); v.stop(t + 2); }));
};
const grit = (c, o) => {                                        // driven bass in eighths, octave jumps
  const ws = c.createWaveShaper(), curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 4); } ws.curve = curve;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 6; ws.connect(lp).connect(o);
  const line = [33, 33, 45, 33, 36, 33, 43, 45, 29, 29, 41, 29, 31, 29, 40, 41];
  line.forEach((m, i) => { const t = i * S16 * 2, s = c.createOscillator(), q = c.createOscillator(), g = c.createGain(); s.type = 'sawtooth'; q.type = 'square'; s.frequency.value = hz(m); q.frequency.value = hz(m) * 0.5; s.connect(g); q.connect(g); g.connect(ws); env(g, t, 0.003, 0.5, 0.22); s.start(t); q.start(t); s.stop(t + 0.3); q.stop(t + 0.3); });
};
const spark = (c, o) => {                                       // short FM pings and noise ticks on a sixteenth grid
  const rnd = seeded(29), nb = c.createBuffer(1, c.sampleRate * 0.05, c.sampleRate); const nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  for (let s = 0; s < 32; s++) {
    const t = s * S16, r = rnd();
    if (r < 0.45) { const n = c.createBufferSource(), hp = c.createBiquadFilter(), g = c.createGain(), p = c.createStereoPanner(); n.buffer = nb; hp.type = 'highpass'; hp.frequency.value = 6000 + rnd() * 4000; p.pan.value = rnd() * 2 - 1; n.connect(hp).connect(g).connect(p).connect(o); env(g, t, 0.001, 0.35, 0.04); n.start(t); }
    else if (r < 0.7) { const a = c.createOscillator(), g = c.createGain(), p = c.createStereoPanner(); a.type = 'square'; a.frequency.setValueAtTime(hz(84 + Math.floor(rnd() * 12)), t); a.frequency.exponentialRampToValueAtTime(hz(60), t + 0.06); p.pan.value = rnd() * 2 - 1; a.connect(g).connect(p).connect(o); env(g, t, 0.001, 0.12, 0.07); a.start(t); a.stop(t + 0.1); }
  }
};
const beat = (c, o) => {                                        // broken beat: kick, snare with ghosts, swung hats
  const kick = (t, v = 1) => { const s = c.createOscillator(), g = c.createGain(); s.frequency.setValueAtTime(140, t); s.frequency.exponentialRampToValueAtTime(42, t + 0.12); s.connect(g).connect(o); env(g, t, 0.002, 0.9 * v, 0.32); s.start(t); s.stop(t + 0.4); };
  const nb = c.createBuffer(1, c.sampleRate * 0.4, c.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const noise = (t, f, q, v, d, type = 'bandpass') => { const n = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(); n.buffer = nb; bp.type = type; bp.frequency.value = f; bp.Q.value = q; n.connect(bp).connect(g).connect(o); env(g, t, 0.001, v, d); n.start(t); };
  const snare = (t, v = 1) => { noise(t, 1900, 0.8, 0.55 * v, 0.18); const s = c.createOscillator(), g = c.createGain(); s.frequency.value = 190; s.connect(g).connect(o); env(g, t, 0.001, 0.3 * v, 0.08); s.start(t); s.stop(t + 0.12); };
  for (const st of [0, 6, 10, 16, 19, 26]) kick(st * S16);
  for (const st of [4, 12, 20, 28]) snare(st * S16); for (const st of [7, 15, 23, 30]) snare(st * S16, 0.25);
  for (let st = 0; st < 32; st++) noise(st * S16 + (st % 2 ? S16 * 0.18 : 0), 9000, 1.2, st % 4 === 2 ? 0.22 : 0.1, st % 8 === 6 ? 0.25 : 0.04, 'highpass');
};

export async function renderKit(sr = 44100) {
  const make = async (fn, wet) => { const c = new OfflineAudioContext(2, Math.round(LEN * sr), sr), o = bus(c, wet); fn(c, o); return c.startRendering(); };
  const out = await Promise.all([make(glass, 0.35), make(reed, 0.25), null, make(bloom, 0.45), make(grit, 0.08), make(spark, 0.2), make(beat, 0.08)]);
  const [L, R] = wire(null, sr), wb = new AudioBuffer({ numberOfChannels: 2, length: L.length, sampleRate: sr }); wb.copyToChannel(L, 0); wb.copyToChannel(R, 1); out[2] = wb;
  return { loops: out.slice(0, 6), beat: out[6], bpm: KIT_BPM, bars: 2 };
}
