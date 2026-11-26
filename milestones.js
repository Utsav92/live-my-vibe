// In-app milestones: progress is tracked from events and saved; unlocking one shows a toast.
export const DEFS = [
  { id: 'first-sound', title: 'First sound', desc: 'Play any organ', kind: 'pad', mode: 'count', goal: 1 },
  { id: 'every-organ', title: 'Every organ', desc: 'Play all 14 organ pads', kind: 'pad', mode: 'set', goal: 14 },
  { id: 'explorer', title: 'Explorer', desc: 'Select 12 different body parts', kind: 'select', mode: 'set', goal: 12 },
  { id: 'chemist', title: 'Chemist', desc: 'Try all 7 chemistry modes', kind: 'chem', mode: 'set', goal: 7 },
  { id: 'zoomer', title: 'Close up', desc: 'Visit all 6 zoom views', kind: 'view', mode: 'set', goal: 6 },
  { id: 'anatomist', title: 'Anatomist', desc: 'Toggle every layer', kind: 'layer', mode: 'set', goal: 7 },
  { id: 'beat-maker', title: 'Beat maker', desc: 'Have 16 steps switched on in the sequencer', kind: 'seqSteps', mode: 'max', goal: 16 },
  { id: 'groove', title: 'Groove', desc: 'Keep the sequencer running for 60 seconds', kind: 'seqPlay', mode: 'count', goal: 60 },
  { id: 'looper', title: 'Looper', desc: 'Record a loop', kind: 'loopRec', mode: 'count', goal: 1 },
  { id: 'layered', title: 'Layered', desc: 'Record 3 loop layers', kind: 'loopRec', mode: 'count', goal: 3 },
  { id: 'sound-designer', title: 'Sound designer', desc: 'Assign 6 different sounds to organs', kind: 'assign', mode: 'set', goal: 6 },
  { id: 'pianist', title: 'Pianist', desc: 'Play 30 notes on the lead keyboard', kind: 'leadNote', mode: 'count', goal: 30 },
  { id: 'racing-heart', title: 'Racing heart', desc: 'Raise the heart rate to 120 or more', kind: 'hr', mode: 'max', goal: 120 },
  { id: 'recorder', title: 'On the record', desc: 'Save a recording of your audio', kind: 'audioSaved', mode: 'count', goal: 1 },
];
const KEY = 'bodybeat.milestones.v1';

export function createMilestones({ mount, toast, storage }) {
  let st = { sets: {}, counts: {}, max: {}, done: {} };
  try { const raw = (storage || globalThis.localStorage)?.getItem(KEY); if (raw) st = { ...st, ...JSON.parse(raw) }; } catch {}
  const save = () => { try { (storage || globalThis.localStorage)?.setItem(KEY, JSON.stringify(st)); } catch {} };
  const progress = (d) => d.mode === 'set' ? (st.sets[d.kind] || []).length : d.mode === 'count' ? (st.counts[d.kind] || 0) : (st.max[d.kind] || 0);

  function render() {
    if (!mount) return;
    const n = Object.keys(st.done).length;
    mount.innerHTML = `<div class="gl-head"><span>MILESTONES</span><b>${n} / ${DEFS.length}</b></div>` + DEFS.map((d) => {
      const p = Math.min(d.goal, progress(d)), done = !!st.done[d.id];
      return `<div class="gl-row${done ? ' done' : ''}"><div class="gl-t"><span>${done ? '✓ ' : ''}${d.title}</span><em>${p}/${d.goal}</em></div><div class="gl-d">${d.desc}</div><i><u style="width:${(p / d.goal) * 100}%"></u></i></div>`;
    }).join('');
  }
  function check() {
    for (const d of DEFS) if (!st.done[d.id] && progress(d) >= d.goal) { st.done[d.id] = Date.now(); toast?.(`Milestone unlocked: ${d.title}`); }
    if (!st.done.completionist && DEFS.every((d) => st.done[d.id])) { st.done.completionist = Date.now(); toast?.('Every milestone unlocked'); }
  }
  render();
  return {
    track(kind, value = 1) {
      // every definition that shares this kind reads from the same three stores
      const a = st.sets[kind] || (st.sets[kind] = []); const key = String(value); if (!a.includes(key)) a.push(key);
      st.counts[kind] = (st.counts[kind] || 0) + (typeof value === 'number' ? value : 1);
      st.max[kind] = Math.max(st.max[kind] || 0, Number(value) || 0);
      check(); save(); render();
    },
    progress, get done() { return { ...st.done }; }, reset() { st = { sets: {}, counts: {}, max: {}, done: {} }; save(); render(); },
  };
}
