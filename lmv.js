// Live My Vibe: the front door. One living point cloud morphs between the five instruments as you scroll;
// each app opens inside the page, full screen, and closes back to where you were.
import * as THREE from './vendor/three.module.js';

const APPS = [
  { id: 'bodybeat', param: 'body', name: 'BodyBeat', line: 'Your body is the instrument.', text: 'A beat maker played on a living x-ray of the human body. Tap an organ, build a groove, watch the signals travel.', tags: ['Sequencer', 'Signals', 'Milestones'], col: [1.0, 0.62, 0.2] },
  { id: 'scatter', param: 'scatter', name: 'Scatter', line: 'Pictures turn to sand.', text: 'Drop in any picture and it becomes half a million points of light that drift, splash and gather into the next.', tags: ['Point cloud', 'Depth', 'Light'], col: [0.92, 0.88, 0.8] },
  { id: 'migros', param: 'migros', name: 'Migros', line: 'Play the shape of chaos.', text: 'Thirty-nine strange attractors drive a synth you play with your keys. Two voices drift apart, and that drift is music.', tags: ['Lorenz', 'Synth', 'MIDI'], col: [0.92, 0.25, 0.2] },
  { id: 'niagra', param: 'niagra', name: 'Niagra', line: 'Turn the cube. Remix the song.', text: 'Six loops become ninety-six glass tiles. Every twist of the cube rewrites what you hear.', tags: ['Loops', 'Glass', 'Export'], col: [1.0, 0.68, 0.3] },
  { id: 'summits', param: 'summits', name: 'Summits', line: 'A forest that listens.', text: 'Walk a Himalayan forest at night. Everything you touch glows and sings, and stays in the loop.', tags: ['Walk', 'Spatial sound', 'Storms'], col: [0.55, 0.95, 0.6] },
];

// ---------------------------------------------------------------- the artwork: six forms for one cloud of light
const N = 26000, rnd = Math.random;
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
function form(kind) {
  const p = new Float32Array(N * 3);
  const put = (i, x, y, z) => { p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z; };
  if (kind === 'swirl') {                                     // the hero: a slow spiral nebula
    for (let i = 0; i < N; i++) { const arm = i % 3, r = Math.pow(rnd(), 0.6) * 3.2, a = r * 1.9 + arm * 2.094 + gauss() * 0.25; put(i, Math.cos(a) * r, gauss() * 0.12 * (3.4 - r), Math.sin(a) * r); }
  } else if (kind === 'body') {                               // a figure: head, torso, arms, legs
    const parts = [[0, 1.55, 0, 0.27, 0.32, 0.27, 0.08], [0, 0.75, 0, 0.45, 0.62, 0.24, 0.3], [0, -0.05, 0, 0.38, 0.25, 0.22, 0.1]];
    const limbs = [[[-0.5, 1.15], [-0.75, 0.2]], [[0.5, 1.15], [0.75, 0.2]], [[-0.2, -0.2], [-0.25, -1.75]], [[0.2, -0.2], [0.25, -1.75]]];
    for (let i = 0; i < N; i++) {
      if (i % 10 < 6) { const t = parts[i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2], u = rnd() * 2 - 1, a = rnd() * 6.283, q = Math.sqrt(1 - u * u); put(i, t[0] + Math.cos(a) * q * t[3], t[1] + u * t[4], t[2] + Math.sin(a) * q * t[5]); }
      else { const L = limbs[i % 4], t = rnd(), a = rnd() * 6.283, r = 0.1 * (1 - t * 0.3); put(i, L[0][0] + (L[1][0] - L[0][0]) * t + Math.cos(a) * r, L[0][1] + (L[1][1] - L[0][1]) * t, Math.sin(a) * r); }
    }
  } else if (kind === 'orb') {                                // a moon of sand, blowing away on one side
    for (let i = 0; i < N; i++) { const u = rnd() * 2 - 1, a = rnd() * 6.283, q = Math.sqrt(1 - u * u), x = Math.cos(a) * q, blow = x > 0.3 && rnd() < 0.25 ? rnd() * 2.2 : 0; put(i, x * 1.6 + blow, u * 1.6 + blow * 0.15, Math.sin(a) * q * 1.6); }
  } else if (kind === 'attractor') {                          // the Lorenz butterfly
    let x = 0.1, y = 0, z = 0; for (let k = 0; k < 2000; k++) { const dx = 10 * (y - x), dy = x * (28 - z) - y, dz = x * y - 8 / 3 * z; x += dx * 0.005; y += dy * 0.005; z += dz * 0.005; }
    for (let i = 0; i < N; i++) { for (let k = 0; k < 2; k++) { const dx = 10 * (y - x), dy = x * (28 - z) - y, dz = x * y - 8 / 3 * z; x += dx * 0.004; y += dy * 0.004; z += dz * 0.004; } put(i, x * 0.085, (z - 25) * 0.085, y * 0.085); }
  } else if (kind === 'cube') {                               // a 4x4x4 cube of glass tiles
    for (let i = 0; i < N; i++) { const f = Math.floor(rnd() * 6), a = Math.floor(rnd() * 4), b = Math.floor(rnd() * 4), u = (a - 1.5) * 0.75 + (rnd() - 0.5) * 0.6, v = (b - 1.5) * 0.75 + (rnd() - 0.5) * 0.6, w = 1.5 + rnd() * 0.08;
      const s = f % 2 ? 1 : -1, ax = Math.floor(f / 2); put(i, ax === 0 ? s * w : u, ax === 1 ? s * w : ax === 0 ? u : v, ax === 2 ? s * w : v); }
  } else {                                                    // a forest: trunks, drooping tiers, a floor
    const trees = Array.from({ length: 9 }, (_, k) => [(k % 3 - 1) * 1.3 + gauss() * 0.2, Math.floor(k / 3) * 1.1 - 1.1 + gauss() * 0.2, 1.8 + rnd() * 1.4]);
    for (let i = 0; i < N; i++) { const r = rnd();
      if (r < 0.22) put(i, gauss() * 1.8, -1.6, gauss() * 1.4);
      else { const T = trees[i % 9], t = rnd(); if (r < 0.32) put(i, T[0] + gauss() * 0.03, -1.6 + t * T[2], T[1] + gauss() * 0.03); else { const h = -1.6 + T[2] * (0.25 + 0.75 * t), w = (1 - t) * 0.55, a = rnd() * 6.283; put(i, T[0] + Math.cos(a) * w * rnd(), h - (rnd() * w * 0.3), T[1] + Math.sin(a) * w * rnd()); } } }
  }
  return p;
}
const FORMS = ['swirl', 'body', 'orb', 'attractor', 'cube', 'forest'].map(form);
const COLS = [[0.62, 0.7, 1.0], ...APPS.map((a) => a.col)];
const TINTS = COLS.map((c) => { const t = new Float32Array(N * 3); for (let i = 0; i < N; i++) t.set(c, i * 3); return t; });
// the x-ray body: real anatomy (BodyParts3D, as in BodyBeat), baked to 26,000 points tagged by tissue
const XRAY = [[0.28, 0.42, 0.72], [0.82, 0.9, 1.0], [0.95, 0.55, 0.62], [1.0, 0.28, 0.24], [0.32, 0.5, 1.0]];
fetch('anatomy/lmv_body.bin').then((r) => r.arrayBuffer()).then((b) => { const f = new Float32Array(b), pos = new Float32Array(N * 3), tint = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos.set([f[i * 4], f[i * 4 + 1], f[i * 4 + 2]], i * 3); tint.set(XRAY[f[i * 4 + 3]] || XRAY[0], i * 3); }
  FORMS[1] = pos; TINTS[1] = tint; if (target === 1) { geo.attributes.to.array.set(pos); geo.attributes.tc.array.set(tint); geo.attributes.to.needsUpdate = geo.attributes.tc.needsUpdate = true; } }).catch(() => {});

const canvas = document.getElementById('art'), renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100); camera.position.set(0, 0.4, 7.2);
const geo = new THREE.BufferGeometry(), seed = new Float32Array(N); for (let i = 0; i < N; i++) seed[i] = rnd();
geo.setAttribute('position', new THREE.BufferAttribute(FORMS[0].slice(), 3)); geo.setAttribute('to', new THREE.BufferAttribute(FORMS[0].slice(), 3)); geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1)); geo.setAttribute('fc', new THREE.BufferAttribute(TINTS[0].slice(), 3)); geo.setAttribute('tc', new THREE.BufferAttribute(TINTS[0].slice(), 3));
const U = { uMix: { value: 0 }, uTime: { value: 0 }, uColA: { value: new THREE.Color(...COLS[0]) }, uColB: { value: new THREE.Color(...COLS[0]) }, uPx: { value: 1 } };
const mat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `attribute vec3 to; attribute float seed; attribute vec3 fc; attribute vec3 tc; uniform float uMix, uTime, uPx; uniform vec3 uColA, uColB; varying vec3 vC;
    void main(){ float m = smoothstep(0.0, 1.0, clamp((uMix - seed * 0.35) / 0.65, 0.0, 1.0));
      vec3 p = mix(position, to, m); float flight = sin(m * 3.14159);                       // points swirl out mid-flight
      p += vec3(sin(seed * 40.0 + uTime), cos(seed * 31.0 + uTime * 0.8), sin(seed * 17.0 - uTime)) * (0.012 + flight * 0.6 * seed);
      vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
      float tw = 0.6 + 0.4 * sin(uTime * (1.0 + seed * 2.0) + seed * 50.0);
      vC = mix(fc, tc, m) * tw * (0.55 + seed * 0.5); gl_PointSize = uPx * (1.4 + seed * 2.2) * (6.0 / -mv.z); }`,
  fragmentShader: `varying vec3 vC; void main(){ vec2 c = gl_PointCoord - 0.5; float a = exp(-dot(c, c) * 16.0); if (a < 0.03) discard; gl_FragColor = vec4(vC * a * 0.8, 1.0); }` });
const cloud = new THREE.Points(geo, mat); scene.add(cloud);
let cur = 0, target = 0, mix = 1;
function morphTo(k) {
  if (k === target) return; const g = geo.attributes, pos = g.position.array, to = g.to.array, m = mix;
  for (let i = 0; i < N; i++) { const s = seed[i], mm = Math.min(1, Math.max(0, (m - s * 0.35) / 0.65)), e = mm * mm * (3 - 2 * mm); for (let a = 0; a < 3; a++) pos[i * 3 + a] += (to[i * 3 + a] - pos[i * 3 + a]) * e; }   // freeze where it is now
  const fc = g.fc.array, tc = g.tc.array; for (let i = 0; i < N * 3; i++) { const s2 = seed[(i / 3) | 0], mm = Math.min(1, Math.max(0, (m - s2 * 0.35) / 0.65)), e = mm * mm * (3 - 2 * mm); fc[i] += (tc[i] - fc[i]) * e; } tc.set(TINTS[k]); g.fc.needsUpdate = g.tc.needsUpdate = true;
  to.set(FORMS[k]); g.position.needsUpdate = true; g.to.needsUpdate = true; U.uColA.value.copy(U.uColB.value).lerp(U.uColA.value, 0); U.uColA.value.setRGB(...COLS[target]); U.uColB.value.setRGB(...COLS[k]); mix = 0; target = k;
}
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); U.uPx.value = renderer.getPixelRatio() * Math.min(1.4, h / 700); }
addEventListener('resize', resize); resize();
const clock = new THREE.Clock(); let mx = 0, my = 0;
addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; });
function loop() {
  const t = clock.getElapsedTime(); U.uTime.value = t; mix = Math.min(1, mix + 0.012); U.uMix.value = mix;
  cloud.rotation.y = t * (target === 1 ? 0.25 : 0.08) + mx * 0.5; cloud.rotation.x = -my * 0.3 + (target === 0 ? 0.35 : 0);
  const side = target > 0 && innerWidth > 900 ? 1.6 : 0; cloud.position.x += (side - cloud.position.x) * 0.04;   // the form steps aside for the words
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(loop);

// ---------------------------------------------------------------- the page
const list = document.getElementById('apps');
list.innerHTML = APPS.map((a, i) => `<section class="app" id="${a.id}" data-i="${i + 1}">
  <div class="copy reveal"><div class="num"><b>${String(i + 1).padStart(2, '0')}</b> / 05</div><h2>${a.name}</h2><p class="line">${a.line}</p><p class="text">${a.text}</p>
  <div class="tags">${a.tags.map((t) => `<span>${t}</span>`).join('')}</div><button class="enter" data-open="${a.id}">Enter ${a.name}<i>→</i></button></div></section>`).join('');
document.getElementById('navApps').innerHTML = APPS.map((a) => `<a href="#${a.id}" data-nav="${a.id}">${a.name}</a>`).join('');
// which form shows: the section in view
const sections = [document.getElementById('hero'), ...APPS.map((a) => document.getElementById(a.id))];
const watch = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { const k = sections.indexOf(e.target); morphTo(k); document.querySelectorAll('[data-nav]').forEach((n) => n.classList.toggle('on', n.dataset.nav === APPS[k - 1]?.id)); } }, { threshold: 0.55 });
sections.forEach((s) => watch.observe(s));
const reveal = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) e.target.classList.add('in'); }, { threshold: 0.25 });
document.querySelectorAll('.reveal').forEach((el) => reveal.observe(el));
addEventListener('scroll', () => { const y = scrollY; document.documentElement.style.setProperty('--scroll', y); document.getElementById('nav').classList.toggle('solid', y > 40); }, { passive: true });

// ---------------------------------------------------------------- opening an app inside the page
const stage = document.getElementById('stage'), frame = document.getElementById('frame');
function openApp(id, push = true) {
  const a = APPS.find((x) => x.id === id); if (!a) return;
  frame.src = `play.html?app=${a.param}&embed=1`; document.getElementById('stageName').textContent = a.name;
  stage.classList.add('open'); document.body.classList.add('inapp'); renderer.setAnimationLoop(null);
  if (push) history.pushState({ app: id }, '', `#/${id}`);
  setTimeout(() => frame.focus(), 400);
}
function closeApp(push = true) {
  if (!stage.classList.contains('open')) return;
  stage.classList.remove('open'); document.body.classList.remove('inapp'); renderer.setAnimationLoop(loop);
  setTimeout(() => { frame.src = 'about:blank'; }, 450);                                  // leaving stops its sound
  if (push) history.pushState({}, '', location.pathname + location.search);
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) { e.preventDefault(); openApp(b.dataset.open); } });
document.getElementById('back').addEventListener('click', () => closeApp());
addEventListener('keydown', (e) => { if (e.key === 'Escape' && stage.classList.contains('open')) closeApp(); });
addEventListener('popstate', () => { const m = location.hash.match(/^#\/(\w+)/); if (m) openApp(m[1], false); else closeApp(false); });
{ const m = location.hash.match(/^#\/(\w+)/); if (m) openApp(m[1], false); }
window.__lmv = { openApp, closeApp, get form() { return target; }, ready: true };
