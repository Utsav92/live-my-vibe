// Pandora core: a 4x4x4 cube whose 96 tiles are slices of six loops. Pure functions (no DOM) so Node can test them.
// Coordinates are doubled so every turn stays in whole numbers: cubie centres sit at -3, -1, 1, 3 and tiles at +-4.

export const FACES = [
  { id: 'F', name: 'FRONT', n: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0] },
  { id: 'R', name: 'RIGHT', n: [1, 0, 0], u: [0, 0, -1], v: [0, -1, 0] },
  { id: 'B', name: 'BACK', n: [0, 0, -1], u: [-1, 0, 0], v: [0, -1, 0] },
  { id: 'L', name: 'LEFT', n: [-1, 0, 0], u: [0, 0, 1], v: [0, -1, 0] },
  { id: 'U', name: 'TOP', n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { id: 'D', name: 'BOTTOM', n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
export const slotPos = (f, r, c) => { const F = FACES[f]; return add(add(F.n.map((x) => x * 4), F.u, 2 * c - 3), F.v, 2 * r - 3); };

// a fresh, whole cube: every side holds its own track, slices 0..15 in reading order
export function newCube() {
  const tiles = [];
  for (let f = 0; f < 6; f++) for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) tiles.push({ id: tiles.length, track: f, slice: r * 4 + c, p: slotPos(f, r, c), n: [...FACES[f].n] });
  return { tiles, history: [] };
}
const AX = { x: 0, y: 1, z: 2 };
function rot(v, a, d) {                                    // quarter turn about axis a (0,1,2); d = +1 counter-clockwise seen from +axis
  const [x, y, z] = v;
  if (a === 0) return [x, -d * z, d * y];
  if (a === 1) return [d * z, y, -d * x];
  return [-d * y, d * x, z];
}
export const inLayer = (t, a, k) => Math.max(-3, Math.min(3, t.p[a])) === 2 * k - 3;
// a move: { a: 'x'|'y'|'z', k: 0..3 (layer), d: +1|-1 }
export function turn(cube, m, record = true) {
  const a = AX[m.a];
  for (const t of cube.tiles) if (inLayer(t, a, m.k)) { t.p = rot(t.p, a, m.d); t.n = rot(t.n, a, m.d); }
  if (record) cube.history.push({ ...m });
  return cube;
}
export const inverse = (m) => ({ a: m.a, k: m.k, d: -m.d });
// the tile sitting in a side's slot
export function tileAt(cube, f, r, c) { const p = slotPos(f, r, c), n = FACES[f].n; return cube.tiles.find((t) => eq(t.p, p) && eq(t.n, n)); }
export const side = (cube, f) => Array.from({ length: 16 }, (_, s) => tileAt(cube, f, s >> 2, s & 3));
// how whole the cube is: share of tiles back in their own slot
export function wholeness(cube) { let ok = 0; for (let f = 0; f < 6; f++) for (let s = 0; s < 16; s++) { const t = tileAt(cube, f, s >> 2, s & 3); if (t.track === f && t.slice === s) ok++; } return ok / 96; }
// notation: outer layers by face letter, inner ones with a 2 in front; a prime for the other way
const NAMES = { x: ['L', '2L', '2R', 'R'], y: ['D', '2D', '2U', 'U'], z: ['B', '2B', '2F', 'F'] };
export function notation(m) {
  const name = NAMES[m.a][m.k], positive = m.k >= 2;          // R-side layers turn clockwise (seen from +axis) when d = -1
  const cw = positive ? m.d === -1 : m.d === 1;
  return name + (cw ? '' : "'");
}
// seeded scramble that never undoes its previous move
export function mulberry32(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function scrambleMoves(n, seed) {
  const R = mulberry32(seed), out = []; let last = null;
  while (out.length < n) { const m = { a: 'xyz'[Math.floor(R() * 3)], k: Math.floor(R() * 4), d: R() < 0.5 ? 1 : -1 }; if (last && last.a === m.a && last.k === m.k && last.d === -m.d) continue; out.push(m); last = m; }
  return out;
}
export const solveMoves = (cube) => cube.history.slice().reverse().map(inverse);
export const wordFor = (w) => (w > 0.999 ? 'WHOLE' : w > 0.7 ? 'WORN' : w > 0.4 ? 'CARVED' : 'SCATTERED');
// which side the camera looks at most squarely, given the direction from the cube to the camera
export function facing(dir) { let best = 0, bd = -Infinity; FACES.forEach((F, i) => { const d = F.n[0] * dir[0] + F.n[1] * dir[1] + F.n[2] * dir[2]; if (d > bd) { bd = d; best = i; } }); return best; }
// a turn from a drag: on a tile with normal N, dragging along world axis D turns the layer about N x D
export function dragTurn(tile, D) {
  const N = tile.n, A = [N[1] * D[2] - N[2] * D[1], N[2] * D[0] - N[0] * D[2], N[0] * D[1] - N[1] * D[0]];
  const a = A.findIndex((v) => v !== 0); if (a < 0) return null;
  const k = (Math.max(-3, Math.min(3, tile.p[a])) + 3) / 2;
  return { a: 'xyz'[a], k, d: Math.sign(A[a]) };
}
