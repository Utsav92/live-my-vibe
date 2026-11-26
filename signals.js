// Signal-processing layer: leader-line labels, selected-organ pathway, info card, live monitors.
// Physiology is a deliberately simplified teaching model, not clinical data.
import * as THREE from './vendor/three.module.js';

const INFO = {
  heart: { title: 'Heart', stages: ['Sinoatrial node fires (pacemaker)', 'Atria contract', 'AV node delays ~0.1 s', 'His bundle + Purkinje fibres', 'Ventricles contract, pulse wave leaves'],
    afferent: 'Vagus (X): baroreceptors → NTS in medulla', efferent: 'Sympathetic raises rate · vagus lowers it', transmitter: 'Noradrenaline · acetylcholine', live: (c) => `${c.hr} beats/min` },
  lungs: { title: 'Lungs', stages: ['Stretch receptors sense inflation', 'Vagus afferent → medulla', 'Pre-Bötzinger rhythm generator', 'Phrenic nerve (C3–C5)', 'Diaphragm contracts, air moves in'],
    afferent: 'Vagus (X): pulmonary stretch receptors', efferent: 'Phrenic nerve → diaphragm', transmitter: 'Glutamate · acetylcholine', live: (c) => `${c.resp} breaths/min` },
  stomach: { title: 'Stomach', stages: ['Stretch + chemical sensing in wall', 'Enteric plexus integrates locally', 'Vagus afferent → NTS', 'Dorsal motor nucleus of vagus', 'Smooth muscle contracts (slow wave)'],
    afferent: 'Vagus (X) afferent fibres', efferent: 'Vagus efferent → myenteric plexus', transmitter: 'Acetylcholine · nitric oxide', live: () => '3 slow waves/min' },
  intestines: { title: 'Intestines', stages: ['Enterochromaffin cells release serotonin', 'Enteric neurons detect it', 'Peristaltic reflex runs locally', 'Vagal afferents report to brainstem', 'Motility adjusts'],
    afferent: 'Vagus (X) + spinal afferents', efferent: 'Enteric motor neurons', transmitter: 'Serotonin (5-HT) · acetylcholine', live: () => 'gut serotonin ≈ 90% of body total' },
  liver: { title: 'Liver', stages: ['Portal vein glucose sensed', 'Hepatic vagal afferent fires', 'Nucleus of the solitary tract', 'Hypothalamus adjusts intake + output', 'Splanchnic sympathetic → glycogen release'],
    afferent: 'Hepatic branch of vagus (X)', efferent: 'Splanchnic sympathetic nerves', transmitter: 'Noradrenaline · glutamate', live: () => 'metabolic loop' },
  kidneyL: { title: 'Left kidney', stages: ['Pressure + chemo sensing in kidney', 'Renal afferent → dorsal root ganglion', 'Spinal cord (T10–L1)', 'Hypothalamus integrates', 'Renal sympathetic → renin release (β1)'],
    afferent: 'Renal afferent nerves', efferent: 'Renal sympathetic nerves', transmitter: 'Noradrenaline', live: () => 'blood pressure control' },
  kidneyR: { title: 'Right kidney', stages: ['Pressure + chemo sensing in kidney', 'Renal afferent → dorsal root ganglion', 'Spinal cord (T10–L1)', 'Hypothalamus integrates', 'Renal sympathetic → renin release (β1)'],
    afferent: 'Renal afferent nerves', efferent: 'Renal sympathetic nerves', transmitter: 'Noradrenaline', live: () => 'blood pressure control' },
  brain: { title: 'Brain', stages: ['Sensory input arrives at thalamus', 'Thalamic gate passes or blocks it', 'Cortex integrates (EEG rhythms)', 'Basal ganglia + limbic modulate', 'Motor + autonomic commands go out'],
    afferent: 'All ascending tracts via thalamus', efferent: 'Corticospinal + autonomic pathways', transmitter: 'Dopamine · serotonin · noradrenaline · GABA · glutamate', live: (c) => `dominant: ${c.band}` },
  eyes: { title: 'Eyes', stages: ['Photoreceptors transduce light', 'Retinal ganglion cells fire', 'Optic nerve (II)', 'Lateral geniculate nucleus (thalamus)', 'Primary visual cortex (occipital)'],
    afferent: 'Optic nerve (II)', efferent: 'Oculomotor (III) for movement + pupil', transmitter: 'Glutamate · dopamine (retina)', live: () => 'visual pathway' },
  jaw: { title: 'Jaw', stages: ['Mechanoreceptors in joint + muscle', 'Trigeminal nerve V3', 'Trigeminal ganglion → pons', 'Thalamus (VPM)', 'Somatosensory cortex'],
    afferent: 'Trigeminal nerve (V3)', efferent: 'Motor branch of V3 → chewing muscles', transmitter: 'Glutamate · acetylcholine', live: () => 'orofacial pathway' },
  hands: { title: 'Hands', stages: ['Touch receptors fire (Meissner, Merkel)', 'Median / ulnar nerve', 'Dorsal column up the spinal cord', 'Cuneate nucleus (medulla) → thalamus', 'Somatosensory cortex'],
    afferent: 'Median + ulnar nerves', efferent: 'Same nerves, motor fibres', transmitter: 'Glutamate · acetylcholine', live: () => 'fine-touch pathway' },
  feet: { title: 'Feet', stages: ['Pressure + proprioceptors fire', 'Tibial nerve', 'Dorsal column up the spinal cord', 'Gracile nucleus (medulla) → thalamus', 'Somatosensory cortex'],
    afferent: 'Tibial + peroneal nerves', efferent: 'Same nerves, motor fibres', transmitter: 'Glutamate · acetylcholine', live: () => 'ground-contact pathway' },
  spine: { title: 'Spinal cord', stages: ['Dorsal root ganglion relays input', 'Dorsal horn processes it', 'Ascending tracts (dorsal column, spinothalamic)', 'Brainstem relay', 'Descending commands reach ventral horn'],
    afferent: 'Dorsal roots', efferent: 'Ventral roots → muscles', transmitter: 'Glutamate · GABA · glycine', live: () => 'main signal highway' },
  vox: { title: 'Voice box', stages: ['Motor cortex plans the sound', 'Nucleus ambiguus in brainstem', 'Vagus → recurrent laryngeal nerve', 'Vocal folds vibrate', 'Vocal tract shapes the vowel'],
    afferent: 'Superior laryngeal nerve', efferent: 'Recurrent laryngeal nerve (vagus X)', transmitter: 'Acetylcholine', live: () => 'speech motor loop' },
  shoulder: { title: 'shoulder', stages: ['Muscle spindles + joint receptors fire', 'Axillary nerve (C5–C6) carries it to the spinal cord', 'Dorsal column / spinothalamic tracts ascend', 'Thalamus relays to cortex', 'Motor cortex answers: deltoid lifts the arm'], afferent: 'Axillary nerve (C5–C6)', efferent: 'Same nerve, motor fibres', transmitter: 'Glutamate · acetylcholine', live: () => 'movement + position loop' },
  upperarm: { title: 'upperArm', stages: ['Muscle spindles + joint receptors fire', 'Musculocutaneous + radial nerves carries it to the spinal cord', 'Dorsal column / spinothalamic tracts ascend', 'Thalamus relays to cortex', 'Motor cortex answers: biceps / triceps'], afferent: 'Musculocutaneous + radial nerves', efferent: 'Same nerve, motor fibres', transmitter: 'Glutamate · acetylcholine', live: () => 'movement + position loop' },
  elbow: { title: 'elbow', stages: ['Muscle spindles + joint receptors fire', 'Ulnar + radial nerves carries it to the spinal cord', 'Dorsal column / spinothalamic tracts ascend', 'Thalamus relays to cortex', 'Motor cortex answers: flex or extend the elbow'], afferent: 'Ulnar + radial nerves', efferent: 'Same nerve, motor fibres', transmitter: 'Glutamate · acetylcholine', live: () => 'movement + position loop' },
  forearm: { title: 'forearm', stages: ['Muscle spindles + joint receptors fire', 'Median + radial nerves carries it to the spinal cord', 'Dorsal column / spinothalamic tracts ascend', 'Thalamus relays to cortex', 'Motor cortex answers: forearm flexors / extensors'], afferent: 'Median + radial nerves', efferent: 'Same nerve, motor fibres', transmitter: 'Glutamate · acetylcholine', live: () => 'movement + position loop' },
  wrist: { title: 'wrist', stages: ['Muscle spindles + joint receptors fire', 'Median nerve carries it to the spinal cord', 'Dorsal column / spinothalamic tracts ascend', 'Thalamus relays to cortex', 'Motor cortex answers: wrist and finger flexors'], afferent: 'Median nerve', efferent: 'Same nerve, motor fibres', transmitter: 'Glutamate · acetylcholine', live: () => 'movement + position loop' },
  hip: { title: 'hip', stages: ['Muscle spindles + joint receptors fire', 'Femoral + obturator nerves carries it to the spinal cord', 'Dorsal column / spinothalamic tracts ascend', 'Thalamus relays to cortex', 'Motor cortex answers: hip flexors / adductors'], afferent: 'Femoral + obturator nerves', efferent: 'Same nerve, motor fibres', transmitter: 'Glutamate · acetylcholine', live: () => 'movement + position loop' },
  thigh: { title: 'thigh', stages: ['Muscle spindles + joint receptors fire', 'Femoral + sciatic nerves carries it to the spinal cord', 'Dorsal column / spinothalamic tracts ascend', 'Thalamus relays to cortex', 'Motor cortex answers: quadriceps / hamstrings'], afferent: 'Femoral + sciatic nerves', efferent: 'Same nerve, motor fibres', transmitter: 'Glutamate · acetylcholine', live: () => 'movement + position loop' },
  knee: { title: 'knee', stages: ['Muscle spindles + joint receptors fire', 'Tibial + common peroneal nerves carries it to the spinal cord', 'Dorsal column / spinothalamic tracts ascend', 'Thalamus relays to cortex', 'Motor cortex answers: knee extension'], afferent: 'Tibial + common peroneal nerves', efferent: 'Same nerve, motor fibres', transmitter: 'Glutamate · acetylcholine', live: () => 'movement + position loop' },
  shin: { title: 'shin', stages: ['Muscle spindles + joint receptors fire', 'Tibial + deep peroneal nerves carries it to the spinal cord', 'Dorsal column / spinothalamic tracts ascend', 'Thalamus relays to cortex', 'Motor cortex answers: calf / tibialis'], afferent: 'Tibial + deep peroneal nerves', efferent: 'Same nerve, motor fibres', transmitter: 'Glutamate · acetylcholine', live: () => 'movement + position loop' },
  ear: { title: 'Ear', stages: ['Eardrum vibrates, ossicles amplify', 'Cochlear hair cells transduce sound', 'Vestibulocochlear nerve (VIII)', 'Brainstem + thalamus (medial geniculate)', 'Auditory cortex (temporal lobe)'],
    afferent: 'Vestibulocochlear nerve (VIII)', efferent: 'Olivocochlear bundle tunes hair cells', transmitter: 'Glutamate · acetylcholine', live: () => 'auditory pathway' },
  nose: { title: 'Nose', stages: ['Odorants bind receptor neurons', 'Olfactory nerve (I)', 'Olfactory bulb', 'Piriform cortex + amygdala', 'Orbitofrontal cortex (smell + memory)'],
    afferent: 'Olfactory nerve (I) · trigeminal for airflow', efferent: 'Facial nerve for sniffing muscles', transmitter: 'Glutamate · dopamine (bulb)', live: () => 'olfactory pathway' },
  tongue: { title: 'Tongue', stages: ['Taste buds detect chemicals', 'Facial (VII), glossopharyngeal (IX), vagus (X)', 'Solitary nucleus (gustatory)', 'Thalamus (VPM)', 'Insula + frontal operculum'],
    afferent: 'CN VII · IX · X', efferent: 'Hypoglossal nerve (XII) moves the tongue', transmitter: 'ATP · serotonin (taste cells)', live: () => 'gustatory pathway' },
  pancreas: { title: 'Pancreas', stages: ['Islet cells sense blood glucose', 'Insulin / glucagon released', 'Vagal afferents report to brainstem', 'Hypothalamus integrates', 'Vagal efferent tunes islet output'],
    afferent: 'Vagus (X) afferents', efferent: 'Vagus efferent + splanchnic', transmitter: 'Insulin · glucagon · acetylcholine', live: () => 'glucose control loop' },
  bladder: { title: 'Bladder', stages: ['Stretch receptors in the wall fire', 'Pelvic nerve (S2–S4)', 'Sacral spinal cord', 'Pontine micturition centre', 'Cortex decides; parasympathetic contracts detrusor'],
    afferent: 'Pelvic nerve', efferent: 'Pelvic parasympathetic (ACh) · pudendal to sphincter', transmitter: 'Acetylcholine · noradrenaline', live: () => 'storage + voiding reflex' },
  esophagus: { title: 'Oesophagus', stages: ['Pharyngeal sensors trigger swallow', 'Glossopharyngeal + vagus afferents', 'Swallowing centre (medulla)', 'Vagus motor sequence', 'Peristaltic wave carries food down'],
    afferent: 'CN IX · X', efferent: 'Vagus → striated + smooth muscle', transmitter: 'Acetylcholine · nitric oxide', live: () => 'swallow reflex' },
  diaphragm: { title: 'Diaphragm', stages: ['Medullary rhythm generator fires', 'Phrenic motor neurons (C3–C5)', 'Phrenic nerve', 'Diaphragm contracts and flattens', 'Chest volume rises, air flows in'],
    afferent: 'Muscle spindles via phrenic', efferent: 'Phrenic nerve', transmitter: 'Acetylcholine · glutamate', live: (c) => `${c.resp} breaths/min` },
  aorta: { title: 'Aorta', stages: ['Arch baroreceptors sense stretch', 'Vagus (X) afferent', 'Solitary nucleus in medulla', 'Sympathetic outflow adjusts', 'Heart rate + vessel tone change'],
    afferent: 'Vagus (X) aortic depressor fibres', efferent: 'Sympathetic nerves to vessels', transmitter: 'Glutamate · noradrenaline', live: (c) => `${c.hr} beats/min` },
  spleen: { title: 'Spleen', stages: ['Immune cells sense inflammation', 'Vagus signals via the celiac ganglion', 'Splenic nerve releases noradrenaline', 'T cells release acetylcholine', 'Macrophages lower TNF output'],
    afferent: 'Vagal + cytokine sensing', efferent: 'Splenic sympathetic nerve', transmitter: 'Noradrenaline · acetylcholine', live: () => 'anti-inflammatory reflex' },
  gallbladder: { title: 'Gallbladder', stages: ['Fat in duodenum releases CCK', 'CCK acts on vagal afferents', 'Solitary nucleus integrates', 'Vagal efferent fires', 'Gallbladder contracts, bile released'],
    afferent: 'Vagus (X) · CCK receptors', efferent: 'Vagus efferent', transmitter: 'Cholecystokinin · acetylcholine', live: () => 'bile release loop' },
};

// brainwave band weights per chemistry mode (delta, theta, alpha, beta, gamma)
const BANDS = ['delta', 'theta', 'alpha', 'beta', 'gamma'], BAND_HZ = [2, 6, 10, 20, 40];
const BAND_W = {
  baseline: [0.5, 0.4, 0.8, 0.4, 0.2], dopamine: [0.2, 0.3, 0.4, 0.8, 0.7], serotonin: [0.3, 0.5, 1.0, 0.3, 0.1],
  noradrenaline: [0.1, 0.2, 0.3, 0.8, 1.0], cortisol: [0.2, 0.4, 0.2, 1.0, 0.6], oxytocin: [0.3, 0.5, 0.9, 0.4, 0.2], gaba: [1.0, 0.8, 0.5, 0.15, 0.05],
};
const g = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2);
const TRACES = [
  { id: 'ecg', label: 'ECG', col: '#e8a04a' }, { id: 'pulse', label: 'PULSE WAVE', col: '#e8a04a' }, { id: 'resp', label: 'RESPIRATION', col: '#cfe3ff' },
  { id: 'emgA', label: 'EMG · ARMS', col: '#9fb4c4' }, { id: 'emgL', label: 'EMG · LEGS', col: '#9fb4c4' }, { id: 'nerve', label: 'NERVE · SPINE', col: '#9fb4c4' },
  { id: 'gut', label: 'GUT · 3 /MIN', col: '#9fb4c4' }, { id: 'eeg', label: 'BRAINWAVES', col: '#e8a04a' },
];
const W = 440 - 22, H = 26;

export function createSignals({ body, pads, camera, getChem, mount, hud, landmarks, onLabel }) {
  const act = { heart: 0, lungs: 0, stomach: 0, intestines: 0, hands: 0, feet: 0, spine: 0, brain: 0, any: 0 };
  let selected = null, selId = null, selT = 0, hrBase = 66, lastBand = 'alpha · 10 Hz';
  const bufs = Object.fromEntries(TRACES.map((t) => [t.id, new Float32Array(W)]));
  const ctxs = {};

  // ---- monitor DOM
  mount.innerHTML = `<div class="sg-head"><span>SENSORY / PATHWAYS</span><b id="sgBpm">66 BPM</b></div>
    <div id="sgCard" class="sg-card"><div class="sg-title">select an organ</div><div class="sg-sub">click the body or a pad to follow its signal</div></div>
    <div class="sg-traces">${TRACES.map((t) => `<canvas data-t="${t.id}" width="${W}" height="${H}"></canvas>`).join('')}</div>
    <div class="sg-bands">${BANDS.map((b) => `<div><span>${b}</span><i><u data-b="${b}"></u></i><em data-bv="${b}">0</em></div>`).join('')}</div>`;
  mount.querySelectorAll('canvas').forEach((c) => { ctxs[c.dataset.t] = c.getContext('2d'); });
  const card = mount.querySelector('#sgCard'), bpmEl = mount.querySelector('#sgBpm');

  // ---- 3D pathway (children of the body group, so they rotate with it)
  const pathGroup = new THREE.Group(); body.add(pathGroup);
  const pulses = []; let curve = null, lineMesh = null, reversed = false;
  const padBy = (v) => pads.find((p) => p.voice === v);
  const centerOf = (p) => p.box.getCenter(new THREE.Vector3());
  function route(key, from) {
    const brain = padBy('brain'), spine = padBy('spine'); if (!brain || !spine) return null;
    const bc = centerOf(brain), sc = centerOf(spine), sb = spine.box;
    const spineAt = (y) => new THREE.Vector3(sc.x, THREE.MathUtils.clamp(y, sb.min.y, sb.max.y), sc.z);
    const head = spineAt(sb.max.y);
    let c;
    if (from) c = from.clone(); else { const pad = padBy(key); if (!pad) return null; c = centerOf(pad);
      if (key === 'hands') c.x = Math.sign(c.x || 1) * pad.box.max.x * 0.95;
      if (key === 'feet') c.x = pad.box.max.x * 0.5; }
    if (key === 'brain' && !from) return { pts: [bc, head, spineAt(sc.y), spineAt(sb.min.y)], rev: false };
    if (key === 'eyes') { const front = body.userData.frontSign || 1; const back = bc.clone(); back.z = front > 0 ? brain.box.min.z : brain.box.max.z; return { pts: [c, bc, back], rev: false }; }
    if (c.y > sb.max.y - 0.03) return { pts: [c, c.clone().lerp(bc, 0.5), bc], rev: false };   // head parts go straight in
    return { pts: [c, spineAt(c.y), head, bc], rev: false };
  }
  function clearPath() { while (pathGroup.children.length) { const o = pathGroup.children.pop(); o.geometry?.dispose(); o.material?.dispose(); } pulses.length = 0; curve = null; }
  function buildPath(key, from) {
    clearPath(); const r = route(key, from); if (!r) return;
    curve = new THREE.CatmullRomCurve3(r.pts, false, 'catmullrom', 0.35);
    const pts = curve.getPoints(120);
    lineMesh = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffb25a, transparent: true, opacity: 0.8, depthTest: false }));
    lineMesh.renderOrder = 20; pathGroup.add(lineMesh);
    for (let i = 0; i < 4; i++) spawnPulse(i / 4, 0.28, 0.016);
  }
  function spawnPulse(t, speed, size, life = Infinity) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0.95, depthTest: false }));
    m.renderOrder = 21; pathGroup.add(m); pulses.push({ t, speed, mesh: m, life, age: 0 });
  }

  // ---- card
  function renderCard(c) {
    const info = INFO[selected]; if (!info) return;
    card.innerHTML = `<div class="sg-title">${info.title}</div><div class="sg-sub">signal route · simplified teaching model</div>
      <ol>${info.stages.map((s, i) => `<li data-s="${i}">${s}</li>`).join('')}</ol>
      <dl><dt>afferent</dt><dd>${info.afferent}</dd><dt>efferent</dt><dd>${info.efferent}</dd><dt>transmitter</dt><dd>${info.transmitter}</dd><dt>live</dt><dd id="sgLive">${info.live(c)}</dd></dl>`;
  }

  // ---- labels + leader lines (2D overlay): every organ and body part, clickable
  const hctx = hud.getContext('2d'); const lm = landmarks || {};
  const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const labelItems = [];
  const padLabel = (voice, text) => { const p = padBy(voice); if (p) labelItems.push({ id: voice, text, voice, info: voice, pos: centerOf(p), pad: p }); };
  ['brain:BRAIN', 'jaw:JAW', 'heart:HEART', 'lungs:LUNGS', 'liver:LIVER', 'stomach:STOMACH', 'intestines:INTESTINES', 'kidneyL:L KIDNEY', 'kidneyR:R KIDNEY', 'spine:SPINE'].forEach((e) => padLabel(...e.split(':')));
  const X = (id, text, voice, info) => { if (lm[id]) labelItems.push({ id, text, voice, info, pos: V3(lm[id]) }); };
  for (const [sd, W] of [['R', 'R'], ['L', 'L']]) {
    X('eye' + sd, W + ' EYE', 'eyes', 'eyes'); X('ear' + sd, W + ' EAR', 'brain', 'ear');
    X('shoulder' + sd, W + ' SHOULDER', 'hands', 'shoulder'); X('upperArm' + sd, W + ' UPPER ARM', 'hands', 'upperArm'); X('elbow' + sd, W + ' ELBOW', 'hands', 'elbow');
    X('forearm' + sd, W + ' FOREARM', 'hands', 'forearm'); X('wrist' + sd, W + ' WRIST', 'hands', 'wrist'); X('hand' + sd, W + ' HAND', 'hands', 'hands');
    X('hip' + sd, W + ' HIP', 'feet', 'hip'); X('thigh' + sd, W + ' THIGH', 'feet', 'thigh'); X('knee' + sd, W + ' KNEE', 'feet', 'knee');
    X('shin' + sd, W + ' SHIN', 'feet', 'shin'); X('foot' + sd, W + ' FOOT', 'feet', 'feet');
  }
  X('nose', 'NOSE', 'lungs', 'nose'); X('tongue', 'TONGUE', 'jaw', 'tongue'); X('throat', 'THROAT', 'vox', 'vox');
  X('pancreas', 'PANCREAS', 'stomach', 'pancreas'); X('bladder', 'BLADDER', 'kidneyL', 'bladder'); X('esophagus', 'OESOPHAGUS', 'stomach', 'esophagus');
  X('diaphragm', 'DIAPHRAGM', 'lungs', 'diaphragm'); X('aorta', 'AORTA', 'heart', 'aorta'); X('cord', 'SPINAL CORD', 'spine', 'spine');
  X('spleen', 'SPLEEN', 'liver', 'spleen'); X('gallbladder', 'GALLBLADDER', 'liver', 'gallbladder');
  for (const it of labelItems) {
    const el = document.createElement('div'); el.className = 'lbl'; el.textContent = it.text; hud.parentNode.appendChild(el); it.el = el;
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); onLabel?.(it); });
  }
  function layoutLabels() {
    const W2 = innerWidth, H2 = innerHeight; hud.width = W2; hud.height = H2; hctx.clearRect(0, 0, W2, H2);
    body.updateMatrixWorld(true); const items = [], v = new THREE.Vector3();
    for (const it of labelItems) {
      v.copy(it.pos); body.localToWorld(v); v.project(camera);
      const sx = (v.x * 0.5 + 0.5) * W2, sy = (-v.y * 0.5 + 0.5) * H2;
      if (v.z > 1 || sy < 80 || sy > H2 - 120 || sx < 0 || sx > W2) { it.el.style.display = 'none'; continue; }   // off-screen or under the pads
      items.push({ it, x: sx, y: sy });
    }
    const o = new THREE.Vector3(0, 0, 0); body.localToWorld(o); o.project(camera); const cx = (o.x * 0.5 + 0.5) * W2;
    for (const side of [-1, 1]) {
      const col = items.filter((i) => (side < 0 ? i.x < cx : i.x >= cx)).sort((a, b) => a.y - b.y || a.x - b.x);
      let last = -1e9; const lx = cx + side * 132;
      for (const a of col) {
        const it = a.it, y = Math.max(a.y, last + 15); last = y;
        const sel = selId === it.id, on = !!(it.pad && it.pad.flash > 0.15), hot = sel || on;
        const el = it.el; el.style.display = 'block'; el.style.top = y - 7 + 'px'; el.classList.toggle('sel', hot);
        if (side < 0) { el.style.left = ''; el.style.right = W2 - lx + 6 + 'px'; el.style.textAlign = 'right'; } else { el.style.right = ''; el.style.left = lx + 6 + 'px'; el.style.textAlign = 'left'; }
        hctx.strokeStyle = hot ? '#e8a04a' : 'rgba(150,170,185,0.26)'; hctx.lineWidth = 1;
        hctx.beginPath(); hctx.moveTo(lx, y); hctx.lineTo(a.x, a.y); hctx.stroke();
        hctx.fillStyle = hot ? '#e8a04a' : 'rgba(180,200,215,0.55)'; hctx.fillRect(a.x - 1.5, a.y - 1.5, 3, 3);
      }
    }
  }

  // ---- monitor sampling
  let acc = 0, tt = 0;
  const bandPow = [0, 0, 0, 0, 0];
  function sample(t, c) {
    const hr = hrBase * c.heartRate, ph = (t * hr / 60) % 1;
    const ecg = 0.12 * g(ph, 0.18, 0.025) - 0.15 * g(ph, 0.3, 0.012) + 1.0 * g(ph, 0.33, 0.012) - 0.25 * g(ph, 0.36, 0.014) + 0.3 * g(ph, 0.58, 0.045) + (Math.random() - 0.5) * 0.02;
    const p2 = (ph - 0.33 + 1) % 1, pulse = 0.9 * g(p2, 0.15, 0.07) + 0.25 * g(p2, 0.42, 0.05);
    const resp = Math.sin(2 * Math.PI * t * c.resp / 60) * 0.7 + act.lungs * 0.3 * Math.sin(t * 20);
    const emgA = (Math.random() * 2 - 1) * (0.06 + act.hands * 0.9), emgL = (Math.random() * 2 - 1) * (0.06 + act.feet * 0.9);
    const nerve = Math.random() < 0.02 + act.spine * 0.25 + act.any * 0.05 ? (Math.random() < 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.5) : (Math.random() - 0.5) * 0.04;
    const gut = Math.sin(2 * Math.PI * t * 3 / 60 * 6) * 0.45 + (act.intestines + act.stomach) * Math.sin(t * 14) * 0.5;
    const w = BAND_W[c.key] || BAND_W.baseline; let eeg = 0;
    BAND_HZ.forEach((f, i) => { const a = w[i] * (1 + act.brain * 0.6); eeg += a * Math.sin(2 * Math.PI * f * t + i * 1.7) * (i === 4 ? 0.35 : i === 3 ? 0.5 : 1); bandPow[i] += (a - bandPow[i]) * 0.02; });
    eeg /= 2.2;
    return { ecg, pulse, resp, emgA, emgL, nerve, gut, eeg, hr };
  }
  function draw() {
    for (const tr of TRACES) {
      const ctx = ctxs[tr.id], b = bufs[tr.id]; ctx.fillStyle = '#060b12'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = tr.col; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i < W; i++) { const y = H / 2 - b[i] * (H / 2 - 3); i ? ctx.lineTo(i, y) : ctx.moveTo(i, y); } ctx.stroke();
      ctx.fillStyle = 'rgba(150,170,185,0.7)'; ctx.font = '8px monospace'; ctx.fillText(tr.label, 3, 9);
    }
  }

  function update(t, dt) {
    const c0 = getChem(), c = { key: c0.key || 'baseline', heartRate: c0.heartRate, resp: Math.round(14 * Math.sqrt(c0.heartRate) * 10) / 10, hr: Math.round(hrBase * c0.heartRate), band: '' };
    for (const k in act) act[k] *= 0.93;
    acc += dt; let last = null;
    while (acc >= 0.02) { acc -= 0.02; tt += 0.02; last = sample(tt, c); for (const tr of TRACES) { const b = bufs[tr.id]; b.copyWithin(0, 1); b[W - 1] = last[tr.id]; } }
    const mx = bandPow.indexOf(Math.max(...bandPow)); c.band = `${BANDS[mx]} · ${BAND_HZ[mx]} Hz`; lastBand = c.band;
    bpmEl.textContent = `${c.hr} BPM`; draw();
    mount.querySelectorAll('[data-b]').forEach((u, i) => { const v = bandPow[i]; u.style.width = Math.min(100, v * 90) + '%'; mount.querySelector(`[data-bv="${u.dataset.b}"]`).textContent = (BAND_HZ[i] * (0.9 + v * 0.1)).toFixed(1); });
    // pathway pulses + stage progress
    if (curve) {
      const speedMul = c0.tempo || 1;
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i]; p.t += p.speed * dt * speedMul; p.age += dt;
        if (p.t > 1) { if (p.life === Infinity) p.t -= 1; else { pathGroup.remove(p.mesh); pulses.splice(i, 1); continue; } }
        p.mesh.position.copy(curve.getPoint(p.t));
      }
      if (lineMesh) lineMesh.material.opacity = 0.45 + 0.35 * Math.sin(t * 3);
    }
    if (selected) {
      const info = INFO[selected], n = info.stages.length, cycle = 2.6, ph = ((t - selT) % cycle) / cycle, idx = Math.min(n - 1, Math.floor(ph * n));
      card.querySelectorAll('li').forEach((li, i) => li.classList.toggle('on', i === idx));
      const live = card.querySelector('#sgLive'); if (live) live.textContent = info.live(c);
    }
    layoutLabels();
  }
  return {
    select(key, opts = {}) {
      const t = opts.t ?? performance.now() / 1000;
      if (!INFO[key]) return; selected = key; selId = opts.id ?? key; selT = t; buildPath(key, opts.from);
      renderCard({ hr: Math.round(hrBase * getChem().heartRate), resp: 14, band: '' });
    },
    hit(voice) {
      const k = voice === 'kidneyL' || voice === 'kidneyR' ? 'any' : voice; if (k in act) act[k] = 1; act.any = Math.max(act.any, 0.6);
      if (selected === voice && curve) spawnPulse(0, 1.0, 0.02, 1);
    },
    update, setHr(v) { hrBase = v; }, get band() { return lastBand; }, get selected() { return selected; }, clear() { selected = null; selId = null; clearPath(); },
  };
}
