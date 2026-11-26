// 16-step beat sequencer: one row per body voice, lookahead scheduler on the audio clock.
import { initAudio, audioCtx, play } from './audio.js';
import { active } from './site-state.js';

const STEPS = 16;
const KEY = 'bodybeat.pattern.v1';

const PRESET = {
  heart:      [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
  feet:       [0,0,0,0, 0,0,0,1, 0,0,1,0, 0,0,0,0],
  hands:      [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,1],
  jaw:        [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
  eyes:       [0,1,0,1, 0,1,0,1, 0,1,0,1, 0,1,0,1],
  spine:      [1,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
  intestines: [0,0,0,0, 0,0,0,0, 0,0,0,1, 0,0,0,0],
  vox:        [0,0,0,0, 1,0,0,1, 0,0,1,0, 1,0,0,0],
};

export function createSequencer({ voices, mount, onTrigger, onChange }) {
  let pattern = {};
  try { pattern = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { pattern = {}; }
  if (!Object.keys(pattern).length) pattern = JSON.parse(JSON.stringify(PRESET));
  for (const v of voices) if (!Array.isArray(pattern[v]) || pattern[v].length !== STEPS) pattern[v] = Array(STEPS).fill(0);

  let tempoMul = 1, jitter = 0, bpm = 110, swing = 0, playing = false, step = 0, next = 0, timer = null;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pattern)); } catch {} };

  // ---- UI
  mount.innerHTML = `
    <div class="sq-bar">
      <button id="sqPlay">▶ play</button>
      <label>bpm <input id="sqBpm" type="range" min="60" max="180" value="${bpm}"><b id="sqBpmV">${bpm}</b></label>
      <label>swing <input id="sqSwing" type="range" min="0" max="60" value="0"></label>
      <button id="sqClear">clear</button>
    </div>
    <div class="sq-grid"></div>`;
  const grid = mount.querySelector('.sq-grid');
  const cells = {};
  for (const v of voices) {
    const row = document.createElement('div'); row.className = 'sq-row';
    row.innerHTML = `<span class="sq-name">${v}</span>`;
    cells[v] = [];
    for (let i = 0; i < STEPS; i++) {
      const c = document.createElement('button');
      c.className = 'sq-c' + (i % 4 === 0 ? ' beat' : '') + (pattern[v][i] ? ' on' : '');
      c.addEventListener('pointerdown', () => {
        pattern[v][i] = pattern[v][i] ? 0 : 1; c.classList.toggle('on', !!pattern[v][i]); save(); onChange?.();
        if (pattern[v][i]) { initAudio(); play(v, 1); onTrigger?.(v); }
      });
      row.appendChild(c); cells[v].push(c);
    }
    grid.appendChild(row);
  }
  const playBtn = mount.querySelector('#sqPlay');
  const showStep = (i) => { for (const v of voices) cells[v].forEach((c, k) => c.classList.toggle('now', k === i)); };

  // ---- scheduler
  function stepTime(i) { return (60 / bpm) / 4 * (1 + (i % 2 === 1 ? swing / 100 : -swing / 100 * 0)); }
  function tick() {
    const ctx = audioCtx(); if (!ctx) return;
    while (next < ctx.currentTime + 0.12) {
      const s = step, when = next;
      for (const v of voices) if (pattern[v][s]) {
        play(v, s % 4 === 0 ? 1 : 0.8, when);
        setTimeout(() => onTrigger?.(v), Math.max(0, (when - ctx.currentTime) * 1000));
      }
      setTimeout(() => showStep(s), Math.max(0, (when - ctx.currentTime) * 1000));
      const base = (60 / (bpm * tempoMul)) / 4;
      next += (s % 2 === 0 ? base * (1 + swing / 100) : base * (1 - swing / 100)) * (1 + (Math.random() - 0.5) * 2 * jitter);
      step = (step + 1) % STEPS;
    }
  }
  function start() {
    initAudio(); const ctx = audioCtx();
    step = 0; next = ctx.currentTime + 0.06; playing = true;
    timer = setInterval(tick, 25); playBtn.textContent = '■ stop'; playBtn.classList.add('on');
  }
  function stop() {
    playing = false; clearInterval(timer); playBtn.textContent = '▶ play'; playBtn.classList.remove('on'); showStep(-1);
  }
  const toggle = () => (playing ? stop() : start());
  playBtn.addEventListener('click', toggle);
  mount.querySelector('#sqBpm').addEventListener('input', (e) => { bpm = +e.target.value; mount.querySelector('#sqBpmV').textContent = bpm; });
  mount.querySelector('#sqSwing').addEventListener('input', (e) => { swing = +e.target.value; });
  mount.querySelector('#sqClear').addEventListener('click', () => {
    for (const v of voices) { pattern[v].fill(0); cells[v].forEach((c) => c.classList.remove('on')); } save(); onChange?.();
  });
  addEventListener('keydown', (e) => { if (active('body') && e.code === 'Space') { e.preventDefault(); toggle(); } });
  return {
    toggle, setTempoMul(m) { tempoMul = m; }, setJitter(j) { jitter = j; }, get playing() { return playing; },
    getBpm() { return bpm * tempoMul; },
    setBpm(v) { bpm = Math.min(180, Math.max(60, Math.round(v))); mount.querySelector('#sqBpm').value = bpm; mount.querySelector('#sqBpmV').textContent = bpm; },
    stepCount() { return voices.reduce((s, v) => s + pattern[v].filter(Boolean).length, 0); },
  };
}
