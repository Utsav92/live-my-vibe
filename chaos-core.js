// Chaos core: the systems and the numbers about them. Pure functions (no DOM), so Node can test them.
// The chaotic systems are the published equations with their usual textbook parameters; the simple
// curves are closed loops. Every system offers one "key" parameter for the MOTION knob.

const sin = Math.sin, cos = Math.cos, abs = Math.abs, exp = Math.exp, sgn = Math.sign;
const tri = (t) => 2 / Math.PI * Math.asin(sin(t));
const saw = (t) => { const u = t / (2 * Math.PI); return 2 * (u - Math.floor(u + 0.5)); };
const sqr = (t) => Math.tanh(sin(t) * 9);                      // softened, so the ring has no vertical cliffs

// ---- simple curves (closed, periodic): pos(θ, p) -> [x,y,z]; one loop = `per` of θ
const SIMPLE = [
  { id: 'circle', name: 'Circle', by: 'A loop', eq: ['cos θ', 'sin θ', 'a·sin 3θ'], p: { a: 0 }, k: 'a', r: [0, 0.6], per: 2 * Math.PI, pos: (t, p) => [cos(t), sin(t), p.a * sin(3 * t)] },
  { id: 'lissajous', name: 'Lissajous', by: 'Lissajous · 1857', eq: ['sin(aθ + π/2)', 'sin 2θ', 'sin 3θ'], p: { a: 1 }, k: 'a', r: [1, 5], per: 2 * Math.PI, pos: (t, p) => [sin(p.a * t + Math.PI / 2), sin(2 * t), sin(3 * t)] },
  { id: 'rose', name: 'Rose', by: 'Grandi · 1723', eq: ['cos kθ · cos θ', 'cos kθ · sin θ', '0.3 sin kθ'], p: { k: 3 }, k: 'k', r: [1, 7], per: 2 * Math.PI, pos: (t, p) => { const r = cos(p.k * t); return [r * cos(t), r * sin(t), 0.3 * sin(p.k * t)]; } },
  { id: 'squircle', name: 'Squircle', by: 'Lamé · 1818', eq: ['|cos θ|^(2/n)', '|sin θ|^(2/n)', '0'], p: { n: 4 }, k: 'n', r: [1, 12], per: 2 * Math.PI, pos: (t, p) => [sgn(cos(t)) * abs(cos(t)) ** (2 / p.n), sgn(sin(t)) * abs(sin(t)) ** (2 / p.n), 0] },
  { id: 'spiro', name: 'Spirograph', by: 'Fisher · 1965', eq: ['(1 − r)cos θ + d cos((1 − r)θ/r)', '(1 − r)sin θ − d sin((1 − r)θ/r)', '0.2 sin 5θ'], p: { r: 0.3, d: 0.5 }, k: 'r', r: [0.12, 0.85], per: 2 * Math.PI, pos: (t, p) => { const q = (1 - p.r) / p.r; return [(1 - p.r) * cos(t) + p.d * cos(q * t), (1 - p.r) * sin(t) - p.d * sin(q * t), 0.2 * sin(5 * t)]; } },
  { id: 'sinering', name: 'Sine ring', by: 'A wave round a circle', eq: ['cos θ', 'sin θ', 'a·sin 6θ'], p: { a: 0.35 }, k: 'a', r: [0, 1], per: 2 * Math.PI, pos: (t, p) => [cos(t), sin(t), p.a * sin(6 * t)] },
  { id: 'triring', name: 'Triangle ring', by: 'A wave round a circle', eq: ['cos θ', 'sin θ', 'a·tri 6θ'], p: { a: 0.35 }, k: 'a', r: [0, 1], per: 2 * Math.PI, pos: (t, p) => [cos(t), sin(t), p.a * tri(6 * t)] },
  { id: 'sawring', name: 'Saw ring', by: 'A wave round a circle', eq: ['cos θ', 'sin θ', 'a·saw 6θ'], p: { a: 0.35 }, k: 'a', r: [0, 1], per: 2 * Math.PI, pos: (t, p) => [cos(t), sin(t), p.a * saw(6 * t)] },
  { id: 'sqring', name: 'Square ring', by: 'A wave round a circle', eq: ['cos θ', 'sin θ', 'a·sq 6θ'], p: { a: 0.35 }, k: 'a', r: [0, 1], per: 2 * Math.PI, pos: (t, p) => [cos(t), sin(t), p.a * sqr(6 * t)] },
  { id: 'coil', name: 'Coil', by: 'A spring bent round', eq: ['(1 + a cos 12θ) cos θ', '(1 + a cos 12θ) sin θ', 'a sin 12θ'], p: { a: 0.3 }, k: 'a', r: [0.05, 0.6], per: 2 * Math.PI, pos: (t, p) => { const w = 1 + p.a * cos(12 * t); return [w * cos(t), w * sin(t), p.a * sin(12 * t)]; } },
  { id: 'trefoil', name: 'Trefoil knot', by: 'A knot', eq: ['sin θ + 2 sin 2θ', 'cos θ − 2 cos 2θ', '−h sin 3θ'], p: { h: 1 }, k: 'h', r: [0, 2.5], per: 2 * Math.PI, pos: (t, p) => [sin(t) + 2 * sin(2 * t), cos(t) - 2 * cos(2 * t), -p.h * sin(3 * t)] },
  { id: 'viviani', name: 'Viviani', by: 'Viviani · 1692', eq: ['1 + cos θ', 'sin θ', 'b sin(θ/2)'], p: { b: 2 }, k: 'b', r: [0.5, 3], per: 4 * Math.PI, pos: (t, p) => [1 + cos(t), sin(t), p.b * sin(t / 2)] },
].map((s) => ({ ...s, fam: 'Simple', kind: 'curve' }));

// ---- chaotic systems: f(x, y, z, p, out) writes dx/dt, dy/dt, dz/dt
const ODE = [
  { id: 'lorenz', name: 'Lorenz', by: 'Lorenz · 1963', fam: 'Wings', eq: ['σ(y − x)', 'x(ρ − z) − y', 'xy − βz'], p: { σ: 10, ρ: 28, β: 8 / 3 }, k: 'ρ', r: [10, 110], s: [0.1, 0, 0], f: (x, y, z, p, o) => { o[0] = p.σ * (y - x); o[1] = x * (p.ρ - z) - y; o[2] = x * y - p.β * z; } },
  { id: 'chen', name: 'Chen', by: 'Chen & Ueta · 1999', fam: 'Wings', eq: ['a(y − x)', '(c − a)x − xz + cy', 'xy − bz'], p: { a: 35, b: 3, c: 28 }, k: 'c', r: [20, 28.5], s: [-0.1, 0.5, -0.6], f: (x, y, z, p, o) => { o[0] = p.a * (y - x); o[1] = (p.c - p.a) * x - x * z + p.c * y; o[2] = x * y - p.b * z; } },
  { id: 'lu', name: 'Lü', by: 'Lü & Chen · 2002', fam: 'Wings', eq: ['a(y − x)', 'cy − xz', 'xy − bz'], p: { a: 36, b: 3, c: 20 }, k: 'c', r: [12.7, 26], s: [0.1, 0.3, -0.6], f: (x, y, z, p, o) => { o[0] = p.a * (y - x); o[1] = p.c * y - x * z; o[2] = x * y - p.b * z; } },
  { id: 'yuwang', name: 'Yu–Wang', by: 'Yu & Wang · 2012', fam: 'Wings', eq: ['a(y − x)', 'bx − cxz', 'e^(xy) − dz'], p: { a: 10, b: 40, c: 2, d: 2.5 }, k: 'b', r: [20, 60], s: [0.1, 0.1, 0.1], f: (x, y, z, p, o) => { o[0] = p.a * (y - x); o[1] = p.b * x - p.c * x * z; o[2] = exp(Math.min(30, x * y)) - p.d * z; } },
  { id: 'shimizu', name: 'Shimizu–Morioka', by: 'Shimizu & Morioka · 1980', fam: 'Wings', eq: ['y', '(1 − z)x − ay', 'x² − bz'], p: { a: 0.75, b: 0.45 }, k: 'a', r: [0.3, 1.1], s: [0.1, 0, 0], f: (x, y, z, p, o) => { o[0] = y; o[1] = (1 - z) * x - p.a * y; o[2] = x * x - p.b * z; } },
  { id: 'rucklidge', name: 'Rucklidge', by: 'Rucklidge · 1992', fam: 'Wings', eq: ['−κx + λy − yz', 'x', 'y² − z'], p: { κ: 2, λ: 6.7 }, k: 'λ', r: [3, 10], s: [1, 0, 4.5], f: (x, y, z, p, o) => { o[0] = -p.κ * x + p.λ * y - y * z; o[1] = x; o[2] = y * y - z; } },
  { id: 'burke', name: 'Burke–Shaw', by: 'Burke & Shaw · 1981', fam: 'Wings', eq: ['−s(x + y)', '−y − sxz', 'sxy + v'], p: { s: 10, v: 4.272 }, k: 'v', r: [1.5, 8], s: [0.6, 0, 0], f: (x, y, z, p, o) => { o[0] = -p.s * (x + y); o[1] = -y - p.s * x * z; o[2] = p.s * x * y + p.v; } },
  { id: 'rikitake', name: 'Rikitake dynamo', by: 'Rikitake · 1958', fam: 'Wings', eq: ['−μx + zy', '−μy + (z − a)x', '1 − xy'], p: { μ: 2, a: 5 }, k: 'a', r: [2, 8], s: [1, 0, 1], f: (x, y, z, p, o) => { o[0] = -p.μ * x + z * y; o[1] = -p.μ * y + (z - p.a) * x; o[2] = 1 - x * y; } },
  { id: 'rossler', name: 'Rössler', by: 'Rössler · 1976', fam: 'Bands & scrolls', eq: ['−y − z', 'x + ay', 'b + z(x − c)'], p: { a: 0.2, b: 0.2, c: 5.7 }, k: 'c', r: [2, 9], s: [1, 1, 0], f: (x, y, z, p, o) => { o[0] = -y - z; o[1] = x + p.a * y; o[2] = p.b + z * (x - p.c); } },
  { id: 'chua', name: 'Chua circuit', by: 'Chua · 1983', fam: 'Bands & scrolls', eq: ['α(y − x − h(x))', 'x − y + z', '−βy'], p: { α: 15.6, β: 28 }, k: 'α', r: [11, 16.5], s: [0.7, 0, 0], f: (x, y, z, p, o) => { const h = -0.714 * x - 0.2145 * (abs(x + 1) - abs(x - 1)); o[0] = p.α * (y - x - h); o[1] = x - y + z; o[2] = -p.β * y; } },
  { id: 'sprottb', name: 'Sprott B', by: 'Sprott · 1994', fam: 'Bands & scrolls', eq: ['ayz', 'x − by', '1 − xy'], p: { a: 1, b: 1 }, k: 'b', r: [0.6, 1.6], s: [0.1, 0, 0], f: (x, y, z, p, o) => { o[0] = p.a * y * z; o[1] = x - p.b * y; o[2] = 1 - x * y; } },
  { id: 'genesio', name: 'Genesio–Tesi', by: 'Genesio & Tesi · 1992', fam: 'Bands & scrolls', eq: ['y', 'z', '−cx − by − az + x²'], p: { a: 0.44, b: 1.1, c: 1 }, k: 'a', r: [0.44, 0.75], s: [0.1, 0.1, 0.1], f: (x, y, z, p, o) => { o[0] = y; o[1] = z; o[2] = -p.c * x - p.b * y - p.a * z + x * x; } },
  { id: 'arneodo', name: 'Arneodo', by: 'Arneodo, Coullet & Tresser · 1981', fam: 'Bands & scrolls', eq: ['y', 'z', 'ax − by − z − x³'], p: { a: 5.5, b: 3.5 }, k: 'b', r: [3.4, 4.4], s: [0.2, 0.2, -0.75], f: (x, y, z, p, o) => { o[0] = y; o[1] = z; o[2] = p.a * x - p.b * y - z - x * x * x; } },
  { id: 'moore', name: 'Moore–Spiegel', by: 'Moore & Spiegel · 1966', fam: 'Bands & scrolls', eq: ['y', 'z', '−z − (T − R + Rx²)y − Tx'], p: { T: 6, R: 20 }, k: 'R', r: [14, 30], s: [0.1, 0, 0], f: (x, y, z, p, o) => { o[0] = y; o[1] = z; o[2] = -z - (p.T - p.R + p.R * x * x) * y - p.T * x; } },
  { id: 'anish', name: 'Anishchenko–Astakhov', by: 'Anishchenko & Astakhov · 1983', fam: 'Bands & scrolls', eq: ['μx + y − xz', '−x', '−ηz + ηH(x)x²'], p: { μ: 1.2, η: 0.5 }, k: 'μ', r: [0.6, 1.5], s: [0.5, 0, 0], f: (x, y, z, p, o) => { o[0] = p.μ * x + y - x * z; o[1] = -x; o[2] = -p.η * z + p.η * (x > 0 ? x * x : 0); } },
  { id: 'thomas', name: 'Thomas', by: 'Thomas · 1999', fam: 'Symmetries', eq: ['sin y − bx', 'sin z − by', 'sin x − bz'], p: { b: 0.208186 }, k: 'b', r: [0.1, 0.36], s: [1.1, 1.1, -0.01], f: (x, y, z, p, o) => { o[0] = sin(y) - p.b * x; o[1] = sin(z) - p.b * y; o[2] = sin(x) - p.b * z; } },
  { id: 'halvorsen', name: 'Halvorsen', by: 'Halvorsen', fam: 'Symmetries', eq: ['−ax − 4y − 4z − y²', '−ay − 4z − 4x − z²', '−az − 4x − 4y − x²'], p: { a: 1.4 }, k: 'a', r: [1.27, 2], s: [-1.48, -1.51, 2.04], f: (x, y, z, p, o) => { o[0] = -p.a * x - 4 * y - 4 * z - y * y; o[1] = -p.a * y - 4 * z - 4 * x - z * z; o[2] = -p.a * z - 4 * x - 4 * y - x * x; } },
  { id: 'dadras', name: 'Dadras', by: 'Dadras & Momeni · 2009', fam: 'Symmetries', eq: ['y − ax + byz', 'cy − xz + z', 'dxy − ez'], p: { a: 3, b: 2.7, c: 1.7, d: 2, e: 9 }, k: 'c', r: [1.2, 2.6], s: [1.1, 2.1, -2], f: (x, y, z, p, o) => { o[0] = y - p.a * x + p.b * y * z; o[1] = p.c * y - x * z + z; o[2] = p.d * x * y - p.e * z; } },
  { id: 'fourwing', name: 'Four-wing', by: 'Wang et al. · 2009', fam: 'Symmetries', eq: ['ax + yz', 'bx + cy − xz', '−z − xy'], p: { a: 0.2, b: 0.01, c: -0.4 }, k: 'a', r: [0.1, 0.3], s: [1.3, -0.18, 0.01], f: (x, y, z, p, o) => { o[0] = p.a * x + y * z; o[1] = p.b * x + p.c * y - x * z; o[2] = -z - x * y; } },
  { id: 'newton', name: 'Newton–Leipnik', by: 'Newton & Leipnik · 1981', fam: 'Symmetries', eq: ['−ax + y + 10yz', '−x − 0.4y + 5xz', 'bz − 5xy'], p: { a: 0.4, b: 0.175 }, k: 'b', r: [0.1, 0.2], s: [0.349, 0, -0.16], f: (x, y, z, p, o) => { o[0] = -p.a * x + y + 10 * y * z; o[1] = -x - 0.4 * y + 5 * x * z; o[2] = p.b * z - 5 * x * y; } },
  { id: 'chenlee', name: 'Chen–Lee', by: 'Chen & Lee · 2004', fam: 'Symmetries', eq: ['ax − yz', 'by + xz', 'cz + xy/3'], p: { a: 5, b: -10, c: -0.38 }, k: 'c', r: [-1.2, -0.2], s: [1, 0, 4.5], f: (x, y, z, p, o) => { o[0] = p.a * x - y * z; o[1] = p.b * y + x * z; o[2] = p.c * z + x * y / 3; } },
  { id: 'aizawa', name: 'Aizawa', by: 'Aizawa · 1982', fam: 'Other forms', eq: ['(z − b)x − dy', 'dx + (z − b)y', 'c + az − z³/3 − (x² + y²)(1 + ez) + fzx³'], p: { a: 0.95, b: 0.7, c: 0.6, d: 3.5, e: 0.25, f: 0.1 }, k: 'e', r: [0.12, 0.6], s: [0.1, 0, 0], f: (x, y, z, p, o) => { o[0] = (z - p.b) * x - p.d * y; o[1] = p.d * x + (z - p.b) * y; o[2] = p.c + p.a * z - z * z * z / 3 - (x * x + y * y) * (1 + p.e * z) + p.f * z * x * x * x; } },
  { id: 'hadley', name: 'Hadley circulation', by: 'Lorenz · 1984', fam: 'Other forms', eq: ['−y² − z² − ax + aF', 'xy − bxz − y + G', 'bxy + xz − z'], p: { a: 0.25, b: 4, F: 8, G: 1 }, k: 'F', r: [4, 9], s: [0.1, 0, 0], f: (x, y, z, p, o) => { o[0] = -y * y - z * z - p.a * x + p.a * p.F; o[1] = x * y - p.b * x * z - y + p.G; o[2] = p.b * x * y + x * z - z; } },
  { id: 'rabfab', name: 'Rabinovich–Fabrikant', by: 'Rabinovich & Fabrikant · 1979', fam: 'Other forms', eq: ['y(z − 1 + x²) + γx', 'x(3z + 1 − x²) + γy', '−2z(α + xy)'], p: { α: 1.1, γ: 0.87 }, k: 'γ', r: [0.76, 0.875], s: [-1, 0, 0.5], f: (x, y, z, p, o) => { o[0] = y * (z - 1 + x * x) + p.γ * x; o[1] = x * (3 * z + 1 - x * x) + p.γ * y; o[2] = -2 * z * (p.α + x * y); } },
  { id: 'hindmarsh', name: 'Hindmarsh–Rose neuron', by: 'Hindmarsh & Rose · 1984', fam: 'Other forms', eq: ['y − x³ + 3x² − z + I', '1 − 5x² − y', 'r(4(x + 1.6) − z)'], p: { I: 3.25, r: 0.006 }, k: 'I', r: [1.4, 4], s: [-1.3, -8, 3], f: (x, y, z, p, o) => { o[0] = y - x * x * x + 3 * x * x - z + p.I; o[1] = 1 - 5 * x * x - y; o[2] = p.r * (4 * (x + 1.6) - z); } },
  { id: 'finance', name: 'Finance', by: 'Ma & Chen · 2001', fam: 'Other forms', eq: ['z + (y − a)x', '1 − by − x²', '−x − cz'], p: { a: 0.9, b: 0.2, c: 1.2 }, k: 'a', r: [0.5, 1.4], s: [1, 2, 0.5], f: (x, y, z, p, o) => { o[0] = z + (y - p.a) * x; o[1] = 1 - p.b * y - x * x; o[2] = -x - p.c * z; } },
  { id: 'sakarya', name: 'Sakarya', by: 'Pehlivan & Uyaroğlu · 2010', fam: 'Other forms', eq: ['−x + y + yz', '−x − y + axz', 'z − bxy'], p: { a: 0.4, b: 0.3 }, k: 'a', r: [0.3, 0.5], s: [1, -1, 1], f: (x, y, z, p, o) => { o[0] = -x + y + y * z; o[1] = -x - y + p.a * x * z; o[2] = z - p.b * x * y; } },
].map((s) => ({ ...s, kind: 'ode' }));

export const SYSTEMS = [...SIMPLE, ...ODE];
export const FAMILIES = ['Simple', 'Wings', 'Bands & scrolls', 'Symmetries', 'Other forms'];
export const byId = (id) => SYSTEMS.find((s) => s.id === id);

// one RK4 step of size h on state st (Float64Array(3)), in place
const k1 = new Float64Array(3), k2 = new Float64Array(3), k3 = new Float64Array(3), k4 = new Float64Array(3);
export function rk4(sys, p, st, h) {
  const [x, y, z] = st;
  sys.f(x, y, z, p, k1);
  sys.f(x + h / 2 * k1[0], y + h / 2 * k1[1], z + h / 2 * k1[2], p, k2);
  sys.f(x + h / 2 * k2[0], y + h / 2 * k2[1], z + h / 2 * k2[2], p, k3);
  sys.f(x + h * k3[0], y + h * k3[1], z + h * k3[2], p, k4);
  st[0] = x + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
  st[1] = y + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
  st[2] = z + h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
}
const finite = (st) => Number.isFinite(st[0]) && Number.isFinite(st[1]) && Number.isFinite(st[2]) && abs(st[0]) + abs(st[1]) + abs(st[2]) < 1e6;

// Look at a system once: settle onto the attractor, measure its centre and size, how long one loop takes
// (in the system's own time), the step size to integrate it with, and the largest Lyapunov exponent.
export function analyse(sys, p) {
  if (sys.kind === 'curve') {
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < 2000; i++) { const q = sys.pos(i / 2000 * sys.per, p); for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], q[a]); hi[a] = Math.max(hi[a], q[a]); } }
    const c = lo.map((v, a) => (v + hi[a]) / 2), size = Math.max(...hi.map((v, a) => v - lo[a])) / 2 || 1;
    return { ok: true, center: c, scale: size, loopT: sys.per, h: sys.per / 800, lyap: 0, start: [0, 0, 0] };
  }
  const st = Float64Array.from(sys.s); let h = 0.002;
  // 1) coarse run to learn the size and speed, so the step can be chosen to move ~0.3% of the figure
  for (let pass = 0; pass < 2; pass++) {
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], dist = 0, prev = Float64Array.from(st);
    for (let i = 0; i < 12000; i++) { rk4(sys, p, st, h); if (!finite(st)) return { ok: false }; for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], st[a]); hi[a] = Math.max(hi[a], st[a]); } dist += Math.hypot(st[0] - prev[0], st[1] - prev[1], st[2] - prev[2]); prev.set(st); }
    const S = Math.max(...hi.map((v, a) => v - lo[a])) || 1, V = dist / (12000 * h);
    h = Math.min(0.05, Math.max(1e-4, 0.003 * S / Math.max(V, 1e-9)));
  }
  for (let i = 0; i < 20000; i++) { rk4(sys, p, st, h); if (!finite(st)) return { ok: false }; }       // settle
  const start = Array.from(st);
  // 2) statistics over a long run: bounds, loops (local maxima of each coordinate), Lyapunov (two nearby paths)
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], maxima = [0, 0, 0], last = [[0, 0], [0, 0], [0, 0]];
  const sh = Float64Array.from(st); const d0 = 1e-8 * (1 + abs(st[0]) + abs(st[1]) + abs(st[2])); sh[0] += d0; let lsum = 0, N = 0;
  for (let i = 0; i < 240000; i++, N++) {
    if (i >= 60000 && i % 20000 === 0 && Math.max(...maxima) >= 120) break;      // slow systems run longer, until ~120 loops are seen
    rk4(sys, p, st, h); rk4(sys, p, sh, h); if (!finite(st)) return { ok: false };
    for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], st[a]); hi[a] = Math.max(hi[a], st[a]); if (i > 1 && last[a][1] > last[a][0] && last[a][1] > st[a]) maxima[a]++; last[a][0] = last[a][1]; last[a][1] = st[a]; }
    if (i % 8 === 7) { const dx = sh[0] - st[0], dy = sh[1] - st[1], dz = sh[2] - st[2], d = Math.hypot(dx, dy, dz) || d0; lsum += Math.log(d / d0); const k = d0 / d; sh[0] = st[0] + dx * k; sh[1] = st[1] + dy * k; sh[2] = st[2] + dz * k; }
  }
  const T = N * h, center = lo.map((v, a) => (v + hi[a]) / 2), scale = Math.max(...hi.map((v, a) => v - lo[a])) / 2 || 1;
  const sizes = hi.map((v, a) => v - lo[a]), loops = Math.max(1, ...maxima.map((m, a) => (sizes[a] > scale * 0.2 ? m : 0)));
  return { ok: true, center, scale, loopT: T / loops, h, lyap: lsum / T, start };
}

// Plain-language state from the exponent (per unit of the system's own time)
export function stateOf(lyap, kind) {
  if (kind === 'curve') return { word: 'LOOP', chaos: false };
  if (lyap > 0.004) return { word: 'CHAOS', chaos: true };      // slow systems (Thomas, Hindmarsh-Rose) sit near 0.01
  if (lyap > -0.004) return { word: 'LOOP', chaos: false };
  return { word: 'SETTLES', chaos: false };
}

// Loop rate in Hz from the tempo controls. RATE indexes DIVS; FREE uses its own Hz.
export const DIVS = [['4/1', 4], ['2/1', 2], ['1/1', 1], ['1/2', 0.5], ['1/4', 0.25], ['1/8', 0.125], ['1/16', 1 / 16], ['1/32', 1 / 32]];
export function loopHz({ bpm, rateIx, mode, freeHz }) {
  if (mode === 'free') return freeHz;
  const beats = DIVS[rateIx][1] * 4 * (mode === 'trip' ? 2 / 3 : mode === 'dot' ? 1.5 : 1);   // whole note = 4 beats
  return bpm / 60 / beats;
}

// How many beats it takes a gap between two paths to double
export function doublingBeats(lyap, loopT, hz, bpm) {
  if (!(lyap > 1e-6)) return Infinity;
  const simPerSec = loopT * hz;                                  // the system's own time that passes in one real second
  return (Math.LN2 / lyap) / simPerSec * (bpm / 60);
}

// ---- your own sound: tempo, root note, waveform overview, WAV out

// Tempo: onset strength (rises in short-time energy), then the autocorrelation lag that fits 70..180 BPM best
export function detectBpm(data, sr) {
  const hop = Math.round(sr / 100), frames = Math.floor(data.length / hop); if (frames < 200) return 0;
  const en = new Float32Array(frames); for (let f = 0; f < frames; f++) { let s = 0; for (let i = f * hop; i < (f + 1) * hop; i++) s += data[i] * data[i]; en[f] = Math.log(1e-9 + s); }
  const on = new Float32Array(frames); for (let f = 1; f < frames; f++) on[f] = Math.max(0, en[f] - en[f - 1]);
  let best = 0, bestLag = 0;
  for (let bpm = 70; bpm <= 180; bpm += 0.5) {
    const lag = 6000 / bpm; let s = 0, c = 0;
    for (let f = 0; f + lag * 2 < frames - 1; f++) { const i1 = Math.round(f + lag), i2 = Math.round(f + 2 * lag); s += on[f] * (on[i1] + 0.5 * on[i2]); c++; }
    if (c > 20 && s / c > best) { best = s / c; bestLag = bpm; }
  }
  return bestLag;
}
// Root note: autocorrelation pitch of the loudest 100 ms, as a MIDI number
export function detectRoot(data, sr) {
  const w = Math.round(sr * 0.1); if (data.length < w * 2) return 60;
  let bestE = 0, at = 0; for (let s = 0; s + w < data.length; s += Math.round(w / 2)) { let e = 0; for (let i = s; i < s + w; i++) e += data[i] * data[i]; if (e > bestE) { bestE = e; at = s; } }
  const minLag = Math.floor(sr / 1500), maxLag = Math.floor(sr / 50); let bestR = 0, lagB = 0;
  for (let lag = minLag; lag <= maxLag; lag++) { let r = 0, e1 = 0, e2 = 0; for (let i = at; i < at + w - lag; i++) { r += data[i] * data[i + lag]; e1 += data[i] * data[i]; e2 += data[i + lag] * data[i + lag]; } r /= Math.sqrt(e1 * e2) + 1e-12; if (r > bestR * 1.02) { bestR = r; lagB = lag; } }
  if (!lagB || bestR < 0.3) return 60;
  return Math.round(69 + 12 * Math.log2(sr / lagB / 440));
}
// min/max per column, for drawing the waveform
export function peaks(data, cols) { const out = new Float32Array(cols * 2), step = data.length / cols; for (let c = 0; c < cols; c++) { let lo = 1, hi = -1; for (let i = Math.floor(c * step); i < Math.floor((c + 1) * step); i++) { const v = data[i]; if (v < lo) lo = v; if (v > hi) hi = v; } out[c * 2] = lo < hi ? lo : 0; out[c * 2 + 1] = lo < hi ? hi : 0; } return out; }
// 24-bit stereo WAV
export function wav24(chunksL, chunksR, sr) {
  let n = 0; for (const c of chunksL) n += c.length;
  const bytes = 44 + n * 6, b = new ArrayBuffer(bytes), v = new DataView(b), str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, bytes - 8, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 6, true); v.setUint16(32, 6, true); v.setUint16(34, 24, true); str(36, 'data'); v.setUint32(40, n * 6, true);
  let o = 44; const put = (x) => { const s = Math.max(-8388608, Math.min(8388607, Math.round(Math.max(-1, Math.min(1, x)) * 8388607))); v.setUint8(o, s & 255); v.setUint8(o + 1, (s >> 8) & 255); v.setUint8(o + 2, (s >> 16) & 255); o += 3; };
  for (let k = 0; k < chunksL.length; k++) { const l = chunksL[k], r = chunksR[k]; for (let i = 0; i < l.length; i++) { put(l[i]); put(r[i]); } }
  return b;
}

// The MIDI note number to a name, e.g. 60 -> C4
const NN = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const noteName = (m) => NN[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
