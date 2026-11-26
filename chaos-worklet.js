// Chaos sound engine (AudioWorklet). Original DSP written for BodyBeat.
// One processor plays the notes: each key makes a part for voice A and, when voice B is on, a part for B.
// The main thread sends each voice's settings (already moved by the attractor) about 60 times a second;
// they are smoothed here per sample, so nothing zips.
const TAU = Math.PI * 2;
const blep = (t, dt) => { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; };

class Part {
  constructor(voice) { this.voice = voice; this.ph = Math.random(); this.sub = 0; this.fmp = 0; this.ic1 = 0; this.ic2 = 0; this.ic1r = 0; this.ic2r = 0; this.freq = 0; this.target = 0; this.env = 0; this.gate = 0; this.on = false; this.note = 0; this.vel = 1; this.pos = 0; this.grains = []; this.gclock = 0; this.read = -1; }
}

class ChaosSynth extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sr = sampleRate;
    const blank = { shape: 2, pitch: 0, sub: 0.4, fm: 0, fold: 0, noise: 0, cutoff: 3000, q: 1, drive: 0.35, gain: 0.25, pan: 0, pos: 0 };
    this.P = { A: { ...blank }, B: { ...blank } };        // targets from the main thread
    this.S = { A: { ...blank }, B: { ...blank } };        // smoothed values
    this.cfg = { attack: 0.008, release: 0.35, glide: 0.06, mono: false, bMode: 0, width: 0.5, mode: 'synth', slice: 0.08, root: 60, secA: 0, secB: 1, grid: 0 };
    this.parts = [];                                       // active parts
    this.held = [];                                        // mono note stack
    this.buf = null;
    this.meterN = 0; this.acc = 0;
    this.port.onmessage = (e) => this.msg(e.data);
  }
  msg(d) {
    if (d.type === 'voices') { Object.assign(this.P.A, d.A); Object.assign(this.P.B, d.B); }
    else if (d.type === 'cfg') { Object.assign(this.cfg, d.cfg); if (this.cfg.bMode === 0) for (const p of this.parts) if (p.voice === 'B') p.gate = 0; }
    else if (d.type === 'on') this.noteOn(d.note, d.vel ?? 1);
    else if (d.type === 'off') this.noteOff(d.note);
    else if (d.type === 'allOff') { this.held = []; for (const p of this.parts) p.gate = 0; }
    else if (d.type === 'sample') this.buf = d.data;
  }
  hz(note, voice) { const iv = [0, 0, 7, 12][this.cfg.bMode] || 0; return 440 * Math.pow(2, (note + (voice === 'B' ? iv : 0) - 69) / 12); }
  spawn(note, vel, voice) { const p = new Part(voice); p.note = note; p.vel = vel; p.freq = p.target = this.hz(note, voice); p.gate = 1; p.on = true; this.parts.push(p); return p; }
  noteOn(note, vel) {
    const voices = this.cfg.bMode > 0 ? ['A', 'B'] : ['A'];
    if (this.cfg.mono) {
      this.held = this.held.filter((n) => n !== note); this.held.push(note);
      const live = this.parts.filter((p) => p.on && p.gate);
      if (live.length) { for (const p of live) { p.note = note; p.target = this.hz(note, p.voice); p.vel = vel; } for (const v of voices) if (!live.some((p) => p.voice === v)) this.spawn(note, vel, v); }   // legato: slide
      else for (const v of voices) { const p = this.spawn(note, vel, v); }
      return;
    }
    for (const p of this.parts) if (p.note === note && p.gate) p.gate = 0;          // re-strike
    const notes = [...new Set(this.parts.filter((p) => p.gate).map((p) => p.note))];
    if (notes.length >= 4) for (const p of this.parts) if (p.note === notes[0]) p.gate = 0;   // chord: four keys at most, oldest goes
    for (const v of voices) this.spawn(note, vel, v);
  }
  noteOff(note) {
    if (this.cfg.mono) {
      this.held = this.held.filter((n) => n !== note);
      const live = this.parts.filter((p) => p.on && p.gate);
      if (this.held.length && live.length && live[0].note === note) { const back = this.held[this.held.length - 1]; for (const p of live) { p.note = back; p.target = this.hz(back, p.voice); } }
      else if (!this.held.length) for (const p of live) p.gate = 0;
      return;
    }
    for (const p of this.parts) if (p.note === note) p.gate = 0;
  }
  osc(p, S, dt) {                                           // one sample of the wave, shape 0..4: sine, triangle, saw, square, thinning pulse
    const sh = S.shape, beta = S.fm * 12;                   // FM: a sine at the same note swings the phase, up to 12x
    let ph = p.ph;
    if (beta > 0.001) { p.fmp += dt; if (p.fmp >= 1) p.fmp -= 1; ph = ph + beta * Math.sin(TAU * p.fmp) / TAU; ph -= Math.floor(ph); }
    const clean = beta <= 0.001;
    const sine = () => Math.sin(TAU * ph);
    const trian = () => 1 - 4 * Math.abs(ph - 0.5);
    const sawv = () => 2 * ph - 1 - (clean ? blep(ph, dt) : 0);
    const pulse = (pw) => { let v = ph < pw ? 1 : -1; if (clean) { v += blep(ph, dt); let t = ph - pw; if (t < 0) t += 1; v -= blep(t, dt); } return v; };
    if (sh <= 1) return sine() * (1 - sh) + trian() * sh;
    if (sh <= 2) return trian() * (2 - sh) + sawv() * (sh - 1);
    if (sh <= 3) return sawv() * (3 - sh) + pulse(0.5) * (sh - 2);
    return pulse(0.5 - 0.45 * (sh - 3)) * 0.9;
  }
  sampleAt(x) { const b = this.buf, n = b.length; if (!n) return 0; x = ((x % n) + n) % n; const i = Math.floor(x), f = x - i; return b[i] * (1 - f) + b[(i + 1) % n] * f; }
  process(_in, outs) {
    const out = outs[0], L = out[0], R = out[1] || out[0], n = L.length, sr = this.sr, cfg = this.cfg;
    const sm = 1 - Math.exp(-1 / (0.012 * sr));             // 12 ms smoothing of incoming settings
    const atk = 1 / Math.max(1, cfg.attack * sr), rel = Math.exp(-6.9 / Math.max(1, cfg.release * sr)), gl = cfg.glide > 0.001 ? 1 - Math.exp(-1 / (cfg.glide * sr / 3)) : 1;
    let sq = 0;
    for (let i = 0; i < n; i++) {
      for (const v of ['A', 'B']) { const S = this.S[v], P = this.P[v]; for (const k in P) S[k] += (P[k] - S[k]) * sm; }
      let l = 0, r = 0;
      for (const p of this.parts) {
        const S = this.S[p.voice];
        if (p.gate) p.env = Math.min(1, p.env + atk); else { p.env *= rel; if (p.env < 1e-4) { p.on = false; continue; } }
        p.freq += (p.target - p.freq) * gl;
        const f = p.freq * Math.pow(2, S.pitch / 12), dt = Math.min(0.45, f / sr);
        let x;
        if (cfg.mode !== 'synth' && this.buf && this.buf.length) {
          const len = this.buf.length, a = cfg.secA * len, span = Math.max(64, (cfg.secB - cfg.secA) * len);
          let pos = Math.min(1, Math.max(0, S.pos));
          if (cfg.grid > 0) pos = Math.round(pos * cfg.grid) / cfg.grid;
          if (cfg.mode === 'scrub') { const tgt = a + pos * span; if (p.read < 0) p.read = tgt; p.read += (tgt - p.read) * 0.0025; x = this.sampleAt(p.read) * 1.6; }
          else {                                            // grains: each key plays the sound at its pitch from where Position is
            const glen = Math.max(0.01, cfg.slice) * sr, rate = Math.pow(2, (p.note + S.pitch - cfg.root) / 12);
            p.gclock -= 1; if (p.gclock <= 0) { p.gclock = glen / 2; if (p.grains.length < 6) p.grains.push({ at: a + pos * span, t: 0, len: glen, rate }); }
            x = 0; for (const g of p.grains) { const w = 0.5 - 0.5 * Math.cos(TAU * g.t / g.len); x += w * this.sampleAt(g.at + g.t * g.rate); g.t++; }
            p.grains = p.grains.filter((g) => g.t < g.len); x *= 1.2;
          }
          p.ph += dt; if (p.ph >= 1) p.ph -= 1;
        } else {
          x = this.osc(p, S, dt);
          p.ph += dt; if (p.ph >= 1) p.ph -= 1;
          p.sub += dt / 2; if (p.sub >= 1) p.sub -= 1;
          x += S.sub * 0.8 * Math.sin(TAU * p.sub);
        }
        if (S.fold > 0.001) { const fx = Math.sin(Math.PI / 2 * x * (1 + 6 * S.fold)); x = x + (fx - x) * Math.min(1, S.fold * 4); }   // fold back past the top
        x += S.noise * (Math.random() * 2 - 1) * 0.9;
        const g = 1 + S.drive * 7; x = Math.tanh(x * g) / Math.tanh(g) * (1 + S.drive * 0.4);                                      // drive
        // filter: state-variable low-pass (cutoff and resonance), run twice for 24 dB
        // only the first stage resonates (stacking two would square the peak), and the peak is compensated
        const fc = Math.min(sr * 0.45, Math.max(20, S.cutoff)), gg = Math.tan(Math.PI * fc / sr), q = Math.max(0.5, S.q), k = 1 / q, kb = Math.SQRT2;
        const a1 = 1 / (1 + gg * (gg + k)), a2 = gg * a1, a3 = gg * a2, b1 = 1 / (1 + gg * (gg + kb)), b2 = gg * b1, b3 = gg * b2;
        x /= Math.sqrt(Math.max(1, q * 0.75));
        let v3 = x - p.ic2, v1 = a1 * p.ic1 + a2 * v3, v2 = p.ic2 + a2 * p.ic1 + a3 * v3; p.ic1 = 2 * v1 - p.ic1; p.ic2 = 2 * v2 - p.ic2; x = v2;
        v3 = x - p.ic2r; v1 = b1 * p.ic1r + b2 * v3; v2 = p.ic2r + b2 * p.ic1r + b3 * v3; p.ic1r = 2 * v1 - p.ic1r; p.ic2r = 2 * v2 - p.ic2r; x = v2;
        const y = x * p.env * p.vel * S.gain;
        const spread = this.cfg.bMode > 0 ? (p.voice === 'A' ? -0.5 : 0.5) * cfg.width : 0;
        const pan = Math.max(-1, Math.min(1, S.pan + spread)), ang = (pan + 1) * Math.PI / 4;
        l += y * Math.cos(ang); r += y * Math.sin(ang);
      }
      L[i] = l; R[i] = r; sq += l * l + r * r;
    }
    this.parts = this.parts.filter((p) => p.on);
    this.acc += sq / (2 * n);
    if (++this.meterN >= 8) { this.port.postMessage({ type: 'meter', rms: Math.sqrt(this.acc / this.meterN), parts: this.parts.length }); this.meterN = 0; this.acc = 0; }
    return true;
  }
}
registerProcessor('chaos-synth', ChaosSynth);

// CRUSH: fewer samples and fewer steps
class ChaosCrush extends AudioWorkletProcessor {
  constructor() { super(); this.amt = 0; this.ph = 1; this.h = [0, 0]; this.port.onmessage = (e) => { this.amt = e.data.amt; }; }
  process(ins, outs) {
    const a = ins[0], o = outs[0]; if (!a || !a.length) return true;
    const amt = this.amt;
    if (amt < 0.002) { for (let c = 0; c < o.length; c++) o[c].set(a[c] || a[0]); this.ph = 1; return true; }
    const step = 1 / (1 + 40 * amt * amt), levels = Math.pow(2, 12 - 10 * Math.pow(amt, 0.6));
    for (let i = 0; i < o[0].length; i++) {
      this.ph += step; if (this.ph >= 1) { this.ph -= 1; for (let c = 0; c < o.length; c++) this.h[c] = Math.round((a[c] || a[0])[i] * levels) / levels; }
      for (let c = 0; c < o.length; c++) o[c][i] = this.h[c];
    }
    return true;
  }
}
registerProcessor('chaos-crush', ChaosCrush);

// TAP: hands the final stereo signal to the page, for the WAV recorder
class ChaosTap extends AudioWorkletProcessor {
  constructor() { super(); this.on = false; this.port.onmessage = (e) => { this.on = !!e.data.on; }; }
  process(ins, outs) {
    const a = ins[0];
    if (a && a.length) { for (let c = 0; c < outs[0].length; c++) outs[0][c].set(a[c] || a[0]); if (this.on) { const l = a[0].slice(), r = (a[1] || a[0]).slice(); this.port.postMessage([l, r], [l.buffer, r.buffer]); } }
    return true;
  }
}
registerProcessor('chaos-tap', ChaosTap);
