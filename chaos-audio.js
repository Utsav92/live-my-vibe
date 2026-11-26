// Chaos audio graph: synth worklet -> chorus -> echo -> reverb -> crush -> tap -> limiter -> speakers (+ a stream for filming).
import { wav24, detectBpm, detectRoot } from './chaos-core.js';
import { guardAudio, mayPlay } from './site-state.js';

let ctx = null, synth = null, crush = null, tap = null, limiter = null, streamDest = null, ready = null;
const fx = {}; let meter = { rms: 0, parts: 0 };
let wavOn = false, wavL = [], wavR = [];

export const chaosCtx = () => ctx;
export const chaosMeter = () => meter;

function impulse(c, secs, decay) {
  const n = Math.round(c.sampleRate * secs), b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
  return b;
}

export function initChaosAudio() {
  if (ready) return ready;
  ready = (async () => {
    ctx = new AudioContext({ latencyHint: 'interactive' }); guardAudio('chaos', ctx);
    await ctx.audioWorklet.addModule('./chaos-worklet.js');
    synth = new AudioWorkletNode(ctx, 'chaos-synth', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    synth.port.onmessage = (e) => { if (e.data.type === 'meter') meter = e.data; };
    // CHORUS: two copies drifting slightly out of tune, one in each ear
    const chIn = ctx.createGain(), chOut = ctx.createGain(), split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2);
    fx.chWet = ctx.createGain(); fx.chWet.gain.value = 0; chIn.connect(chOut);
    chIn.connect(split);
    for (let c = 0; c < 2; c++) {
      const d = ctx.createDelay(0.05); d.delayTime.value = 0.012 + c * 0.004; const lfo = ctx.createOscillator(), dep = ctx.createGain();
      lfo.frequency.value = 0.31 + c * 0.17; dep.gain.value = 0.0035; lfo.connect(dep).connect(d.delayTime); lfo.start(); split.connect(d, c); d.connect(merge, 0, c);
    }
    merge.connect(fx.chWet).connect(chOut);
    // ECHO: in step with the tempo, bouncing left and right
    const ecIn = ctx.createGain(), ecOut = ctx.createGain(); ecIn.connect(ecOut);
    fx.dL = ctx.createDelay(4); fx.dR = ctx.createDelay(4); fx.fb = ctx.createGain(); fx.fb.gain.value = 0; fx.ecWet = ctx.createGain(); fx.ecWet.gain.value = 0;
    const ecMerge = ctx.createChannelMerger(2), mono = ctx.createGain(); mono.channelCount = 1; mono.channelCountMode = 'explicit';
    ecIn.connect(mono).connect(fx.dL); fx.dL.connect(fx.dR); fx.dR.connect(fx.fb).connect(fx.dL);
    fx.dL.connect(ecMerge, 0, 0); fx.dR.connect(ecMerge, 0, 1); ecMerge.connect(fx.ecWet).connect(ecOut);
    // REVERB: a large room behind the sound
    const rvIn = ctx.createGain(), rvOut = ctx.createGain(); rvIn.connect(rvOut);
    const conv = ctx.createConvolver(); conv.buffer = impulse(ctx, 3.6, 2.6); fx.rvWet = ctx.createGain(); fx.rvWet.gain.value = 0; rvIn.connect(conv).connect(fx.rvWet).connect(rvOut);
    crush = new AudioWorkletNode(ctx, 'chaos-crush', { outputChannelCount: [2] });
    tap = new AudioWorkletNode(ctx, 'chaos-tap', { outputChannelCount: [2] });
    tap.port.onmessage = (e) => { if (wavOn) { wavL.push(e.data[0]); wavR.push(e.data[1]); } };
    limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.12;
    streamDest = ctx.createMediaStreamDestination();
    synth.connect(chIn); chOut.connect(ecIn); ecOut.connect(rvIn); rvOut.connect(crush).connect(tap).connect(limiter);
    limiter.connect(ctx.destination); limiter.connect(streamDest);
    return ctx;
  })();
  return ready;
}

const post = (m) => synth?.port.postMessage(m);
export const noteOn = (note, vel = 1) => post({ type: 'on', note, vel });
export const noteOff = (note) => post({ type: 'off', note });
export const allOff = () => post({ type: 'allOff' });
export const setVoices = (A, B) => post({ type: 'voices', A, B });
export const setCfg = (cfg) => post({ type: 'cfg', cfg });
export function setFx({ echo, reverb, chorus, crushAmt, bpm }) {
  if (!ctx) return; const t = ctx.currentTime;
  const beat = 60 / bpm, dly = Math.min(3.9, beat * 0.75);              // a dotted eighth
  fx.dL.delayTime.setTargetAtTime(dly, t, 0.05); fx.dR.delayTime.setTargetAtTime(dly, t, 0.05);
  fx.fb.gain.setTargetAtTime(0.15 + 0.7 * echo, t, 0.05); fx.ecWet.gain.setTargetAtTime(echo * 0.9, t, 0.05);
  fx.rvWet.gain.setTargetAtTime(reverb * 0.9, t, 0.05); fx.chWet.gain.setTargetAtTime(chorus, t, 0.05);
  crush.port.postMessage({ amt: crushAmt });
}
export async function loadSound(file) {
  await initChaosAudio();
  const ab = await file.arrayBuffer(), buf = await ctx.decodeAudioData(ab);
  const n = buf.length, mono = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / buf.numberOfChannels; }
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(mono[i])); if (pk > 0) for (let i = 0; i < n; i++) mono[i] /= pk;   // normalise
  post({ type: 'sample', data: mono });
  return { data: mono, seconds: n / ctx.sampleRate, bpm: Math.round(detectBpm(mono, ctx.sampleRate)) || 120, root: detectRoot(mono, ctx.sampleRate) };
}
export const mediaStream = () => streamDest?.stream;
export function wavStart() { wavL = []; wavR = []; wavOn = true; tap.port.postMessage({ on: true }); }
export function wavStop() { wavOn = false; tap.port.postMessage({ on: false }); return new Blob([wav24(wavL, wavR, ctx.sampleRate)], { type: 'audio/wav' }); }
export const suspend = () => ctx?.suspend();
export const resume = () => (mayPlay('chaos') ? ctx?.resume() : undefined);
