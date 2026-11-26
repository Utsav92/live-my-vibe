// Two-bar loop recorder. Hits are stored as a fraction of the loop, so the pattern stays aligned.
// Each REC pass is one layer; undo removes the last layer. Playback is scheduled ahead on the audio clock.
export function createLoop({ now, getBpm, play, visual, onChange }) {
  const BEATS = 8;                                   // 2 bars of 4/4
  let layers = [], current = null, armed = false, start = null, len = 0, timer = null, lastEnd = 0;

  const frac = (t) => ((((t - start) % len) + len) % len) / len;
  function run(t) { start = t; len = BEATS * 60 / getBpm(); lastEnd = t; timer = setInterval(tick, 25); }
  function stop() { clearInterval(timer); timer = null; start = null; lastEnd = 0; }

  function tick() {
    if (start === null) return;
    const t = now(), wEnd = t + 0.12, c0 = Math.floor((lastEnd - start) / len), c1 = Math.floor((wEnd - start) / len);
    for (const layer of layers) for (const e of layer) for (let c = c0; c <= c1; c++) {
      const when = start + c * len + e.f * len;
      if (when >= lastEnd && when < wEnd) { play(e.voice, when); setTimeout(() => visual?.(e.voice), Math.max(0, (when - t) * 1000)); }
    }
    lastEnd = wEnd;
  }

  return {
    record(voice) {
      if (!armed) return false;
      const t = now(); if (start === null) run(t);
      if (!current) { current = []; layers.push(current); onChange?.(); }
      current.push({ voice, f: frac(t) });
      lastEnd = Math.max(lastEnd, t + 0.001);        // never replay the hit we just made
      return true;
    },
    setArmed(on) { armed = !!on; current = null; onChange?.(); },
    undo() { layers.pop(); current = null; if (!layers.length) stop(); onChange?.(); },
    clear() { layers = []; current = null; armed = false; stop(); onChange?.(); },
    phase() { if (start === null) return { running: false, bar: 1, frac: 0 }; const f = frac(now()); return { running: true, bar: f < 0.5 ? 1 : 2, frac: f }; },
    get armed() { return armed; },
    get layerCount() { return layers.length; },
    get eventCount() { return layers.reduce((s, l) => s + l.length, 0); },
    _tick: tick,
  };
}
