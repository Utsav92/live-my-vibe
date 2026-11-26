// Which app of the single page is showing. Every global listener asks this before it reacts.
export const site = { mode: 'body' };
export const active = (app) => site.mode === app;
// Every app's AudioContext is registered here. Only the app on screen may make sound: if anything wakes a hidden
// app's context (a timer, a MIDI note, a late click), it is put straight back to sleep.
export const audioRegistry = {};
export function guardAudio(app, ctx) {
  audioRegistry[app] = ctx;
  const hush = () => { if (site.mode !== app && ctx.state === 'running') ctx.suspend(); };
  ctx.addEventListener('statechange', hush); hush();
  return ctx;
}
export const mayPlay = (app) => site.mode === app;
