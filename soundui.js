// Sounds tab: kits, per-organ sound + note, and a playable lead keyboard.
import { SOUNDS, CATEGORIES } from './sounds.js';
import { initAudio, audioCtx, assignSound, assignNote, midiHz, pitchMultiplier, play } from './audio.js';
import { active } from './site-state.js';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (m) => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
const DEFAULT_NOTES = { heart: 36, lungs: 60, stomach: 38, intestines: 72, liver: 45, kidneyL: 64, kidneyR: 67, brain: 72, eyes: 84, hands: 60, spine: 52, jaw: 60, feet: 40, vox: 60 };
const KITS = {
  default: {},
  band: { heart: 'kick', lungs: 'harmonica', stomach: 'bass', intestines: 'hat closed', liver: 'electric guitar', kidneyL: 'tom', kidneyR: 'snare', brain: 'piano', eyes: 'casio', hands: 'clap', spine: 'acoustic guitar', jaw: 'rim', feet: 'tom' },
  orchestra: { heart: 'tom', lungs: 'flute', stomach: 'bass', intestines: 'harp', liver: 'trombone', kidneyL: 'violin', kidneyR: 'saxophone', brain: 'piano', eyes: 'glass bell', hands: 'clap', spine: 'violin', jaw: 'trumpet', feet: 'kick' },
  hospital: { heart: 'ecg beep', lungs: 'ventilator', stomach: 'iv drip', intestines: 'suction', liver: 'mri knock', kidneyL: 'spo2 beep', kidneyR: 'pager', brain: 'eeg alpha', eyes: 'xray shot', hands: 'syringe click', spine: 'eeg spike', jaw: 'alarm', feet: 'defib shock' },
  psychedelic: { heart: 'wobble bass', lungs: 'cosmic swell', stomach: 'acid squelch', intestines: 'bubbling', liver: 'sitar drone', kidneyL: 'warble bell', kidneyR: 'trippy arp', brain: 'phaser pad', eyes: 'whale sweep', hands: 'reverse cymbal', spine: 'sitar', jaw: 'tape stop', feet: 'kick' },
  body: { heart: 'mouth kick', lungs: 'inhale', stomach: 'mouth bass hum', intestines: 'bubbling', liver: 'throat growl', kidneyL: 'tongue click', kidneyR: 'lip pop', brain: 'eeg alpha', eyes: 'whistle', hands: 'mouth hat', spine: 'sigh', jaw: 'mouth snare', feet: 'exhale' },
};
// suggested sounds per organ, shown first in each list
const SUGGEST = { heart: ['kick', 'bass', 'ecg beep', 'heart murmur', 'tom'], lungs: ['inhale', 'exhale', 'flute', 'harmonica', 'ventilator'], stomach: ['bass', 'mouth bass hum', 'acid squelch', 'iv drip'],
  intestines: ['harp', 'bubbling', 'kalimba', 'suction'], liver: ['trombone', 'electric guitar', 'sitar drone', 'mri knock'], kidneyL: ['violin', 'spo2 beep', 'warble bell'], kidneyR: ['saxophone', 'snare', 'pager'],
  brain: ['piano', 'eeg alpha', 'eeg gamma', 'phaser pad'], eyes: ['casio', 'xray shot', 'glass bell', 'whale sweep'], hands: ['clap', 'hat closed', 'syringe click', 'reverse cymbal'], spine: ['acoustic guitar', 'sitar', 'eeg spike', 'harmonium'],
  jaw: ['rim', 'trumpet', 'mouth snare', 'alarm'], feet: ['kick', 'tom', 'defib shock', 'exhale'], vox: ['whistle', 'mouth bass hum', 'saxophone'] };
const STORE = 'bodybeat.sounds.v1';

export function createSoundUI({ mount, voices, onAssign, onNote }) {
  let st = { assign: {}, notes: { ...DEFAULT_NOTES }, lead: 'piano', oct: 4 };
  try { st = { ...st, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch {}
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(st)); } catch {} };
  const optionsFor = (voice, current) => {
    const sug = (SUGGEST[voice] || []).filter((id) => SOUNDS[id]);
    const grp = (label, ids) => `<optgroup label="${label}">${ids.map((id) => `<option value="${id}"${id === current ? ' selected' : ''}>${id}${SOUNDS[id].pitched ? ' ♪' : ''}</option>`).join('')}</optgroup>`;
    return `<option value="">built-in body sound</option>` + (sug.length ? grp('suggested', sug) : '') + CATEGORIES.map((c) => grp(c, Object.keys(SOUNDS).filter((id) => SOUNDS[id].cat === c))).join('');
  };
  const noteOptions = (cur) => { let o = ''; for (let m = 24; m <= 96; m++) o += `<option value="${m}"${m === cur ? ' selected' : ''}>${noteName(m)}</option>`; return o; };
  const leadOptions = () => CATEGORIES.map((c) => { const ids = Object.keys(SOUNDS).filter((id) => SOUNDS[id].cat === c && SOUNDS[id].pitched); return ids.length ? `<optgroup label="${c}">${ids.map((id) => `<option value="${id}"${id === st.lead ? ' selected' : ''}>${id}</option>`).join('')}</optgroup>` : ''; }).join('');

  mount.innerHTML = `<div class="snd-h">kits</div><div class="snd-kits">${Object.keys(KITS).map((k) => `<button data-kit="${k}">${k}</button>`).join('')}</div>
    <div class="snd-h">lead keyboard <span class="snd-keys">keys A–' (white) · W E T Y U O P (black)</span></div>
    <div class="snd-lead"><select id="sndLead">${leadOptions()}</select><button id="octDn">oct −</button><b id="octV">C${st.oct}</b><button id="octUp">oct +</button></div>
    <div class="piano" id="piano"></div>
    <div class="snd-h">sound for each organ</div>
    <div class="snd-rows">${voices.map((v) => `<div class="snd-row" data-v="${v}"><span>${v}</span><select class="s">${optionsFor(v, st.assign[v])}</select><select class="n">${noteOptions(st.notes[v] ?? 60)}</select><button class="t">▶</button></div>`).join('')}</div>`;

  const apply = (v) => { assignSound(v, st.assign[v] || ''); assignNote(v, st.notes[v] ?? 60); };
  voices.forEach(apply);
  const syncRow = (v) => { const r = mount.querySelector(`.snd-row[data-v="${v}"] .s`); r.value = st.assign[v] || ''; };
  mount.querySelectorAll('.snd-row').forEach((row) => {
    const v = row.dataset.v;
    row.querySelector('.s').addEventListener('change', (e) => { st.assign[v] = e.target.value; if (!e.target.value) delete st.assign[v]; apply(v); save(); initAudio(); play(v, 1); if (e.target.value) onAssign?.(v, e.target.value); });
    row.querySelector('.n').addEventListener('change', (e) => { st.notes[v] = +e.target.value; apply(v); save(); initAudio(); play(v, 1); });
    row.querySelector('.t').addEventListener('click', () => { initAudio(); play(v, 1); });
  });
  mount.querySelectorAll('[data-kit]').forEach((b) => b.addEventListener('click', () => {
    const kit = KITS[b.dataset.kit]; st.assign = {}; for (const v of voices) if (kit[v]) st.assign[v] = kit[v];
    voices.forEach((v) => { apply(v); syncRow(v); }); save(); initAudio();
    for (const v of voices) if (st.assign[v]) onAssign?.(v, st.assign[v]);
    mount.querySelectorAll('[data-kit]').forEach((x) => x.classList.toggle('on', x === b));
  }));

  // ---- lead keyboard (2 octaves)
  const piano = mount.querySelector('#piano'), keyEls = {};
  const WHITE = [0, 2, 4, 5, 7, 9, 11], BLACK = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };
  function drawPiano() {
    piano.innerHTML = ''; const base = 12 * (st.oct + 1);
    for (let i = 0; i < 14; i++) { const semi = WHITE[i % 7] + 12 * Math.floor(i / 7), k = document.createElement('i'); k.className = 'w'; k.style.left = i * 20 + 'px'; k.dataset.m = base + semi; piano.appendChild(k); keyEls[base + semi] = k; }
    for (let o = 0; o < 2; o++) for (const [s, wi] of Object.entries(BLACK)) { const semi = +s + 12 * o, k = document.createElement('i'); k.className = 'b'; k.style.left = (wi + o * 7) * 20 + 13 + 'px'; k.dataset.m = base + semi; piano.appendChild(k); keyEls[base + semi] = k; }
    mount.querySelector('#octV').textContent = 'C' + st.oct;
  }
  const held = new Map();
  function noteOn(m) {
    initAudio(); const ctx = audioCtx(); const snd = SOUNDS[st.lead]; if (!ctx || !snd || held.has(m)) return;
    const h = snd.play(ctx.currentTime + 0.001, 0.9, midiHz(m) * pitchMultiplier(), snd.sustain ? Infinity : 0.5);
    held.set(m, h); keyEls[m]?.classList.add('on'); onNote?.();
  }
  function noteOff(m) { const h = held.get(m); if (!h) return; held.delete(m); h.release?.(); keyEls[m]?.classList.remove('on'); }
  piano.addEventListener('pointerdown', (e) => { const m = e.target.dataset?.m; if (m) { e.preventDefault(); noteOn(+m); const up = () => { noteOff(+m); removeEventListener('pointerup', up); }; addEventListener('pointerup', up); } });
  mount.querySelector('#sndLead').addEventListener('change', (e) => { st.lead = e.target.value; save(); });
  mount.querySelector('#octDn').addEventListener('click', () => { st.oct = Math.max(1, st.oct - 1); save(); drawPiano(); });
  mount.querySelector('#octUp').addEventListener('click', () => { st.oct = Math.min(7, st.oct + 1); save(); drawPiano(); });
  const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16, "'": 17 };
  const typing = (e) => /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range';
  addEventListener('keydown', (e) => { if (!active('body') || e.repeat || e.ctrlKey || e.metaKey || typing(e)) return; const s = KEYMAP[e.key.toLowerCase()]; if (s !== undefined) noteOn(12 * (st.oct + 1) + s); });
  addEventListener('keyup', (e) => { const s = KEYMAP[e.key.toLowerCase()]; if (s !== undefined) noteOff(12 * (st.oct + 1) + s); });
  drawPiano();
  return { applyAll: () => voices.forEach(apply) };
}
