// Summits instruments: every element of the two worlds has its own voice, made in Web Audio (no samples).
// Each voice is a function (ctx, dest, time, midiNote, velocity) that schedules one hit.
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
let noiseBuf = null;
function noise(ctx) { if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } const s = ctx.createBufferSource(); s.buffer = noiseBuf; return s; }
function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function osc(ctx, type, f, t, dur) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(t + dur + 0.05); return o; }
// inharmonic bell / bowl: partial ratios with their own decays
function bell(ctx, dest, t, m, v, ratios, decay, bright = 1) {
  for (const [r, a, d] of ratios) { const o = osc(ctx, 'sine', hz(m) * r, t, decay * d), g = ctx.createGain(); o.connect(g).connect(dest); env(g, t, 0.004, v * a, decay * d); if (bright > 1) o.detune.setValueAtTime((Math.random() - 0.5) * 6, t); }
}
function pluck(ctx, dest, t, m, v, bright, dur) {           // plucked string: a saw through a closing low-pass, plus a noise attack
  const o = osc(ctx, 'sawtooth', hz(m), t, dur), lp = ctx.createBiquadFilter(), g = ctx.createGain(); lp.type = 'lowpass'; lp.Q.value = 3;
  lp.frequency.setValueAtTime(hz(m) * bright, t); lp.frequency.exponentialRampToValueAtTime(hz(m) * 1.1, t + dur * 0.6); o.connect(lp).connect(g).connect(dest); env(g, t, 0.002, v * 0.5, dur);
  const n = noise(ctx), bp = ctx.createBiquadFilter(), ng = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = hz(m) * 3; bp.Q.value = 2; n.connect(bp).connect(ng).connect(dest); env(ng, t, 0.001, v * 0.25, 0.03); n.start(t, Math.random()); n.stop(t + 0.06);
}
function breath(ctx, dest, t, m, v, dur, airy = 0.3, vib = 5) {   // flute-like: sine + breath noise + vibrato
  const o = osc(ctx, 'sine', hz(m), t, dur), lfo = osc(ctx, 'sine', vib, t, dur), lg = ctx.createGain(), g = ctx.createGain(); lg.gain.value = hz(m) * 0.008; lfo.connect(lg).connect(o.frequency);
  o.connect(g).connect(dest); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * 0.4, t + 0.08); g.gain.setValueAtTime(v * 0.36, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const n = noise(ctx), bp = ctx.createBiquadFilter(), ng = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = hz(m) * 2; bp.Q.value = 6; n.connect(bp).connect(ng).connect(dest); env(ng, t, 0.05, v * airy, dur * 0.8); n.start(t, Math.random()); n.stop(t + dur);
}
function drum(ctx, dest, t, m, v, f0, f1, dur, click = 0.3) {
  const o = osc(ctx, 'sine', f0, t, dur), g = ctx.createGain(); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.5); o.connect(g).connect(dest); env(g, t, 0.002, v, dur);
  const n = noise(ctx), lp = ctx.createBiquadFilter(), ng = ctx.createGain(); lp.type = 'lowpass'; lp.frequency.value = 1800; n.connect(lp).connect(ng).connect(dest); env(ng, t, 0.001, v * click, 0.05); n.start(t, Math.random()); n.stop(t + 0.08);
}
function wood(ctx, dest, t, m, v, dur = 0.5) {               // marimba-like: two sines, the upper one at four times, quick decay
  const a = osc(ctx, 'sine', hz(m), t, dur), b = osc(ctx, 'sine', hz(m) * 4, t, dur * 0.3), g = ctx.createGain(), g2 = ctx.createGain(); a.connect(g).connect(dest); b.connect(g2).connect(dest); env(g, t, 0.002, v * 0.6, dur); env(g2, t, 0.001, v * 0.18, dur * 0.25);
}
function shaker(ctx, dest, t, v, dur, f = 6000, grains = 14) {   // rainstick: many tiny noise grains
  for (let i = 0; i < grains; i++) { const tt = t + Math.random() * dur, n = noise(ctx), bp = ctx.createBiquadFilter(), g = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = f * (0.7 + Math.random() * 0.6); bp.Q.value = 4; n.connect(bp).connect(g).connect(dest); env(g, tt, 0.001, v * (0.2 + Math.random() * 0.3), 0.03); n.start(tt, Math.random()); n.stop(tt + 0.05); }
}
function water(ctx, dest, t, m, v, dur) {                     // a resonant swell of noise pitched to the note
  const n = noise(ctx), bp = ctx.createBiquadFilter(), g = ctx.createGain(); bp.type = 'bandpass'; bp.Q.value = 14; bp.frequency.setValueAtTime(hz(m), t); bp.frequency.linearRampToValueAtTime(hz(m) * 1.5, t + dur); n.connect(bp).connect(g).connect(dest); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * 1.4, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); n.start(t, Math.random()); n.stop(t + dur);
}
function horn(ctx, dest, t, m, v, dur) {                      // dungchen / pututu: a low brassy saw with slow vibrato and a closing filter
  const o = osc(ctx, 'sawtooth', hz(m), t, dur), o2 = osc(ctx, 'sawtooth', hz(m) * 1.003, t, dur), lp = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = osc(ctx, 'sine', 4.2, t, dur), lg = ctx.createGain(); lg.gain.value = 2.5; lfo.connect(lg).connect(o.frequency);
  lp.type = 'lowpass'; lp.Q.value = 2; lp.frequency.setValueAtTime(hz(m) * 1.5, t); lp.frequency.linearRampToValueAtTime(hz(m) * 6, t + dur * 0.35); lp.frequency.linearRampToValueAtTime(hz(m) * 2, t + dur);
  o.connect(lp); o2.connect(lp); lp.connect(g).connect(dest); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * 0.3, t + 0.25); g.gain.setValueAtTime(v * 0.28, t + dur * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

// voices by element id
export const VOICES = {
  // Himalaya
  firefly: (c, d, t, m, v) => bell(c, d, t, m + 24, v * 0.5, [[1, 1, 1], [2.76, 0.4, 0.5], [5.4, 0.2, 0.3]], 0.9, 2),                      // tingsha-like pings
  deodar: (c, d, t, m, v) => wood(c, d, t, m - 12, v, 0.9),                                                                               // deep wood
  rhodo: (c, d, t, m, v) => pluck(c, d, t, m, v * 0.7, 3, 1.4),
  flags: (c, d, t, m, v) => { for (let i = 0; i < 4; i++) bell(c, d, t + i * 0.06, m + 12 + [0, 3, 7, 10][i], v * 0.25, [[1, 1, 1], [3.1, 0.3, 0.4]], 0.6); },   // a flutter of chimes
  wheel: (c, d, t, m, v) => { shaker(c, d, t, v * 0.6, 0.25, 2500, 8); bell(c, d, t + 0.05, m, v * 0.4, [[1, 1, 1], [2.71, 0.5, 0.7], [5.1, 0.25, 0.4]], 2.5); },
  chorten: (c, d, t, m, v) => bell(c, d, t, m - 12, v * 0.7, [[1, 1, 1], [2.71, 0.6, 0.8], [5.2, 0.35, 0.6], [8.9, 0.15, 0.4]], 5),       // singing bowl
  mani: (c, d, t, m, v) => { bell(c, d, t, m, v * 0.35, [[1, 1, 1], [2.9, 0.3, 0.5]], 1.6); drum(c, d, t, m, v * 0.3, hz(m) * 2, hz(m), 0.1, 0.15); },   // a struck stone that rings                                                         // stone clack
  river: (c, d, t, m, v) => water(c, d, t, m, v, 1.4),
  peak: (c, d, t, m, v) => horn(c, d, t, m - 24, v, 2.6),                                                                                 // dungchen
  moss: (c, d, t, m, v) => wood(c, d, t, m, v * 0.5, 0.9),
  moon: (c, d, t, m, v) => { bell(c, d, t, m + 12, v * 0.5, [[1, 1, 1], [1.5, 0.5, 0.8], [2, 0.4, 0.7], [3, 0.2, 0.5]], 3); drum(c, d, t, 0, v * 0.6, 60, 30, 1.6, 1); },   // the light, with thunder
  // Machu Picchu
  terrace: (c, d, t, m, v) => wood(c, d, t, m, v, 0.6),                                                                                   // marimba steps
  wall: (c, d, t, m, v) => drum(c, d, t, m, v, 95, 48, 0.5, 0.4),                                                                         // bombo
  sunstone: (c, d, t, m, v) => bell(c, d, t, m - 12, v * 0.6, [[1, 1, 1], [2.4, 0.5, 0.8], [3.9, 0.3, 0.6], [6.3, 0.15, 0.4]], 4),     // Intihuatana gong
  llama: (c, d, t, m, v) => { pluck(c, d, t, m + 12, v * 0.8, 10, 0.5); pluck(c, d, t + 0.012, m + 24, v * 0.4, 10, 0.4); },             // charango (paired courses)
  ichu: (c, d, t, m, v) => shaker(c, d, t, v, 0.5, 7000, 18),                                                                             // rainstick
  cloud: (c, d, t, m, v) => breath(c, d, t, m + 12, v, 1.2, 0.45, 4.5),                                                                   // siku pan pipe
  condor: (c, d, t, m, v) => { const o = breath(c, d, t, m + 19, v, 1.6, 0.25, 6); },                                                   // quena
  huayna: (c, d, t, m, v) => horn(c, d, t, m - 12, v * 0.9, 2.2),                                                                         // pututu conch
  sun: (c, d, t, m, v) => { bell(c, d, t, m + 12, v * 0.5, [[1, 1, 1], [2, 0.5, 0.9], [3, 0.3, 0.7], [4, 0.2, 0.5]], 3); drum(c, d, t, 0, v * 0.5, 70, 35, 1.4, 1); },
  // more of the forest
  snag: (c, d, t, m, v) => { breath(c, d, t, m - 12, v * 0.9, 1.8, 0.6, 2.5); wood(c, d, t, m - 12, v * 0.5, 1.2); },                    // a hollow, bowed dead tree
  birch: (c, d, t, m, v) => { for (const iv of [0, 7, 12]) breath(c, d, t, m + iv, v * 0.35, 1.6, 0.15, 3.5); shaker(c, d, t, v * 0.4, 0.8, 3500, 12); },   // leaves stirring
  stone: (c, d, t, m, v) => { bell(c, d, t, m, v * 0.3, [[1, 1, 1], [2.4, 0.35, 0.6], [4.2, 0.12, 0.4]], 1.8); drum(c, d, t, m, v * 0.25, hz(m) * 1.6, hz(m), 0.08, 0.15); },
  flower: (c, d, t, m, v) => bell(c, d, t, m + 12, v * 0.45, [[1, 1, 1], [4, 0.35, 0.35], [10.2, 0.12, 0.15]], 1.4),                     // celesta
  stick: (c, d, t, m, v) => { const n = noise(c), bp = c.createBiquadFilter(), g = c.createGain(); bp.type = 'bandpass'; bp.frequency.value = hz(m) * 4; bp.Q.value = 8; n.connect(bp).connect(g).connect(d); env(g, t, 0.001, v * 0.45, 0.06); n.start(t, Math.random()); n.stop(t + 0.1); wood(c, d, t + 0.01, m, v * 0.4, 0.5); },   // a soft snap, a hollow knock
  grass: (c, d, t, m, v) => shaker(c, d, t, v * 0.8, 0.45, 2600, 20),                                                                       // brushed grass
};
// thunder: a crack, then a long low roll that grumbles away
export function thunder(c, d, t, v) {
  const n = noise(c), lp = c.createBiquadFilter(), g = c.createGain(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2200, t); lp.frequency.exponentialRampToValueAtTime(140, t + 0.6); lp.frequency.exponentialRampToValueAtTime(60, t + 5);
  n.loop = true; n.connect(lp).connect(g).connect(d); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * 1.1, t + 0.04); g.gain.exponentialRampToValueAtTime(v * 0.5, t + 0.5);
  for (let k = 1; k < 5; k++) g.gain.linearRampToValueAtTime(v * (0.55 - k * 0.09) * (0.7 + Math.random() * 0.6), t + 0.5 + k * 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 6); n.start(t, Math.random()); n.stop(t + 6.2);
  const o = osc(c, 'sine', 45, t, 4), og = c.createGain(); o.frequency.exponentialRampToValueAtTime(28, t + 3); o.connect(og).connect(d); env(og, t, 0.05, v * 0.6, 3.5);
}
// new voices: the sacred place, birds, insects
VOICES.cairn = (c, d, t, m, v) => bell(c, d, t, m - 12, v * 0.6, [[1, 1, 1], [2.0, 0.5, 0.9], [2.76, 0.5, 0.8], [5.4, 0.2, 0.5]], 7);   // a deep bowl
VOICES.lamp = (c, d, t, m, v) => bell(c, d, t, m + 12, v * 0.35, [[1, 1, 1], [2.32, 0.5, 0.7], [4.25, 0.25, 0.4], [6.8, 0.1, 0.3]], 3.5);   // a small temple bell
VOICES.bird = (c, d, t, m, v) => { for (let k = 0; k < 3; k++) { const tt = t + k * 0.13, o = osc(c, 'sine', hz(m + 24), tt, 0.12), g = c.createGain(); o.frequency.setValueAtTime(hz(m + 24) * 0.9, tt); o.frequency.exponentialRampToValueAtTime(hz(m + 24 + (k === 2 ? 5 : 2)), tt + 0.09); o.connect(g).connect(d); env(g, tt, 0.01, v * 0.16, 0.1); } };
VOICES.insect = (c, d, t, m, v) => { for (let k = 0; k < 4; k++) { const tt = t + k * 0.07, o = osc(c, 'sine', 4200 + (m % 12) * 90, tt, 0.04), g = c.createGain(); o.connect(g).connect(d); env(g, tt, 0.004, v * 0.05, 0.035); } };
// the open forest
VOICES.pine = (c, d, t, m, v) => breath(c, d, t, m + 12, v * 0.5, 1.4, 0.35, 4);                                     // a wooden flute
VOICES.oldtree = (c, d, t, m, v) => { breath(c, d, t, m - 12, v * 0.6, 2.6, 0.2, 3); breath(c, d, t, m - 5, v * 0.3, 2.6, 0.1, 3.3); };   // low bowed tones
VOICES.log = (c, d, t, m, v) => { drum(c, d, t, m, v * 0.6, hz(m) * 1.5, hz(m) * 0.9, 0.7, 0.1); wood(c, d, t, m, v * 0.35, 0.8); };          // a hollow log
VOICES.mushroom = (c, d, t, m, v) => bell(c, d, t, m + 12, v * 0.4, [[1, 1, 1], [5.9, 0.25, 0.25], [9.3, 0.1, 0.15]], 1.2);                 // kalimba
VOICES.fern = (c, d, t, m, v) => shaker(c, d, t, v * 0.35, 0.7, 4200, 14);                                                                      // a whisper
VOICES.canopy = (c, d, t, m, v) => { for (const iv of [0, 7]) breath(c, d, t, m + 12 + iv, v * 0.25, 2.2, 0.5, 2.5); };                      // breath in the leaves
export const click = (c, d, t, accent) => { const o = osc(c, 'square', accent ? 1760 : 1320, t, 0.03), g = c.createGain(); o.connect(g).connect(d); env(g, t, 0.001, 0.12, 0.03); };
// ambience beds: a world's air, looped
export function ambience(ctx, dest, kind) {
  const out = ctx.createGain(); out.gain.value = 0; out.connect(dest);
  const wind = noise(ctx), lp = ctx.createBiquadFilter(), wg = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(); wind.loop = true; lp.type = 'lowpass'; lp.frequency.value = 520; lfo.frequency.value = 0.07; lg.gain.value = 260; lfo.connect(lg).connect(lp.frequency); wg.gain.value = 0.18; wind.connect(lp).connect(wg).connect(out); wind.start(); lfo.start();
  if (kind === 'himalaya') { for (const [m, lv] of [[38, 0.05], [45, 0.035], [50, 0.02]]) { const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lf = ctx.createOscillator(), lg = ctx.createGain(); o.frequency.value = hz(m); o2.frequency.value = hz(m) * 1.003; lf.frequency.value = 0.05 + Math.random() * 0.04; lg.gain.value = lv * 0.6; lf.connect(lg).connect(g.gain); g.gain.value = lv; o.connect(g); o2.connect(g); g.connect(out); o.start(); o2.start(); lf.start(); }   // a low drone: root, fifth and octave, slowly breathing
    const r = noise(ctx), bp = ctx.createBiquadFilter(), rg = ctx.createGain(); r.loop = true; bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.6; rg.gain.value = 0.07; r.connect(bp).connect(rg).connect(out); r.start(); }    // the river
  else { const timer = setInterval(() => { if (ctx.state !== 'running' || out.gain.value < 0.01) return; const t = ctx.currentTime + Math.random() * 0.5, f = 2400 + Math.random() * 1600; for (let k = 0; k < 3; k++) { const o = osc(ctx, 'sine', f, t + k * 0.09, 0.08), g = ctx.createGain(); o.frequency.linearRampToValueAtTime(f * 1.2, t + k * 0.09 + 0.07); o.connect(g).connect(out); env(g, t + k * 0.09, 0.005, 0.03, 0.07); } }, 2600); out.stopBirds = () => clearInterval(timer); }   // birds
  return out;
}
