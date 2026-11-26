// One page, two apps: BodyBeat and Scatter. Each app is loaded the first time it is opened; the hidden one is paused.
import { site, audioRegistry } from './site-state.js';
import { audioCtx } from './audio.js';

window.__frames = { body: 0, scatter: 0, chaos: 0, pandora: 0, summits: 0 };
window.__site = { get mode() { return site.mode; }, get audio() { return audioCtx()?.state ?? 'none'; } };
const $ = (s) => document.querySelector(s);
const APPS = {
  body: { root: '#app-body', file: './main.js', api: '__bodyApp', booted: false },
  scatter: { root: '#app-scatter', file: './scatter.js', api: '__scatterApp', booted: false },
  chaos: { root: '#app-chaos', file: './chaos.js', api: '__chaosApp', booted: false },
  pandora: { root: '#app-pandora', file: './pandora.js', api: '__pandoraApp', booted: false },
  summits: { root: '#app-summits', file: './summits.js', api: '__summitsApp', booted: false },
};
const order = ['body', 'scatter', 'chaos', 'pandora', 'summits'];
let busy = Promise.resolve();

async function activate(app, { replace = true } = {}) {
  const next = APPS[app]; if (!next) return;
  const prevName = site.mode, prev = APPS[prevName];
  if (prevName !== app && prev.booted) window[prev.api]?.stop?.();                  // pause the app we are leaving
  site.mode = app;
  for (const name of order) $(APPS[name].root).classList.toggle('off', name !== app);
  document.querySelectorAll('#site [data-app]').forEach((b) => b.classList.toggle('on', b.dataset.app === app));
  document.title = app === 'scatter' ? 'Scatter · BodyBeat' : app === 'chaos' ? 'Migros · BodyBeat' : app === 'pandora' ? 'Niagra · BodyBeat' : app === 'summits' ? 'Summits · BodyBeat' : 'BodyBeat';
  if (replace) { const u = new URL(location.href); if (app === 'body') u.searchParams.delete('app'); else u.searchParams.set('app', app === 'chaos' ? 'migros' : app === 'pandora' ? 'niagra' : app); history.replaceState(null, '', u); }
  for (const [name, c] of Object.entries(audioRegistry)) if (name !== app) c.suspend?.();   // every other app goes silent
  const ctx = audioCtx();
  if (ctx && app === 'body') ctx.resume?.();
  if (!next.booted) { next.booted = true; await import(next.file); } else window[next.api]?.start?.();
  window.dispatchEvent(new Event('resize'));
}

document.querySelectorAll('#site [data-app]').forEach((b) => b.addEventListener('click', () => { busy = busy.then(() => activate(b.dataset.app)); }));
if (new URLSearchParams(location.search).has('embed')) document.documentElement.classList.add('embed');   // opened inside Live My Vibe: its own switcher hides
const wanted = new URLSearchParams(location.search).get('app') || (/\bapp=scatter\b/.test(location.hash) ? 'scatter' : 'body');
site.mode = APPS[wanted] ? wanted : wanted === 'migros' ? 'chaos' : wanted === 'niagra' ? 'pandora' : 'body';   // ?app=migros opens it too
for (const name of order) $(APPS[name].root).classList.toggle('off', name !== site.mode);
document.querySelectorAll('#site [data-app]').forEach((b) => b.classList.toggle('on', b.dataset.app === site.mode));
busy = busy.then(() => activate(site.mode, { replace: false }));
