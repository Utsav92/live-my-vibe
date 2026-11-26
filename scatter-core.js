// Scatter core: pure functions (no DOM) so they can be unit-tested in Node.
// An uploaded picture becomes (a) a depth estimate, (b) a set of points sampled where the picture has "weight",
// and (c) a list of feature points ("trackers"). The drift function is mirrored in the vertex shader.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// RGBA bytes -> luminance 0..1
export function toGray(rgba, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255;
  return g;
}

// separable box blur, repeated passes approximate a gaussian
export function blur(src, w, h, r, passes = 2) {
  let a = Float32Array.from(src), b = new Float32Array(w * h);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {                       // horizontal
      let sum = 0, cnt = 0;
      for (let x = -r; x <= r; x++) if (x >= 0 && x < w) { sum += a[y * w + x]; cnt++; }
      for (let x = 0; x < w; x++) {
        b[y * w + x] = sum / cnt;
        const add = x + r + 1, rem = x - r;
        if (add < w) { sum += a[y * w + add]; cnt++; } if (rem >= 0) { sum -= a[y * w + rem]; cnt--; }
      }
    }
    for (let x = 0; x < w; x++) {                       // vertical
      let sum = 0, cnt = 0;
      for (let y = -r; y <= r; y++) if (y >= 0 && y < h) { sum += b[y * w + x]; cnt++; }
      for (let y = 0; y < h; y++) {
        a[y * w + x] = sum / cnt;
        const add = y + r + 1, rem = y - r;
        if (add < h) { sum += b[add * w + x]; cnt++; } if (rem >= 0) { sum -= b[rem * w + x]; cnt--; }
      }
    }
  }
  return a;
}

// Depth ESTIMATE from luminance: smoothed brightness relief, stretched to 0..1.
// This is a heuristic (bright = near), not a learned depth model.
export function buildDepth(gray, w, h) {
  const d = blur(gray, w, h, Math.max(2, Math.round(Math.min(w, h) / 48)), 3);
  let lo = Infinity, hi = -Infinity; for (const v of d) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = Math.max(1e-6, hi - lo); for (let i = 0; i < d.length; i++) d[i] = (d[i] - lo) / span;
  return d;
}

// weight per pixel: bright pictures glow on black paper (mode 'light'); on white paper ink goes where it is dark ('ink').
// Linear, so density alone carries the tone, with a soft floor: tones under ~4% get no points at all, so black stays black.
export function weightsFrom(gray, mode, floor = 0.04) {
  const w = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    const v = Math.min(1, Math.max(0, mode === 'ink' ? 1 - gray[i] : gray[i]));
    const t = Math.min(1, Math.max(0, (v - floor) / (2 * floor))); w[i] = v * t * t * (3 - 2 * t);
  }
  return w;
}

// Error-diffusion placement (serpentine Floyd-Steinberg on the expected point count per pixel). Every region gets its
// exact share of points and neighbouring points keep an even spacing, so flat tones come out smooth instead of grainy.
// Returns exactly n points as [u,v,...] in 0..1, shuffled so the index carries no spatial order.
export function samplePointsED(weights, w, h, n, rand) {
  let total = 0; for (let i = 0; i < weights.length; i++) total += weights[i];
  const out = new Float32Array(n * 2);
  if (total <= 0) { for (let i = 0; i < n * 2; i++) out[i] = rand(); return out; }
  const k = n / total, cur = new Float32Array(w + 2), nxt = new Float32Array(w + 2);
  const xs = new Uint16Array(n + w * 4), ys = new Uint16Array(n + w * 4), cnt = new Uint8Array(n + w * 4); let m = 0;
  for (let y = 0; y < h; y++) {
    const ltr = (y & 1) === 0;
    for (let s = 0; s < w; s++) {
      const x = ltr ? s : w - 1 - s, v = weights[y * w + x] * k + cur[x + 1];
      const c = Math.max(0, Math.min(255, Math.floor(v + 0.5))), e = v - c, d = ltr ? 1 : -1;
      if (c > 0 && m < xs.length) { xs[m] = x; ys[m] = y; cnt[m] = c; m++; }
      cur[x + 1 + d] += e * 7 / 16; nxt[x + 1 - d] += e * 3 / 16; nxt[x + 1] += e * 5 / 16; nxt[x + 1 + d] += e / 16;
    }
    cur.set(nxt); nxt.fill(0);
  }
  let emitted = 0; for (let q = 0; q < m; q++) emitted += cnt[q];
  const all = new Float32Array(Math.max(n, emitted) * 2); let j = 0;
  for (let q = 0; q < m; q++) {
    const c = cnt[q], g = Math.ceil(Math.sqrt(c));                 // several points in one pixel: stratify them on a sub-grid
    for (let r = 0; r < c; r++) { const sx = r % g, sy = Math.floor(r / g); all[j * 2] = (xs[q] + (sx + rand()) / g) / w; all[j * 2 + 1] = (ys[q] + (sy + rand()) / g) / h; j++; }
  }
  for (const filled = j; j < n; j++) { const s = Math.floor(rand() * filled); all[j * 2] = Math.min(1, Math.max(0, all[s * 2] + (rand() - 0.5) / w)); all[j * 2 + 1] = Math.min(1, Math.max(0, all[s * 2 + 1] + (rand() - 0.5) / h)); }   // rounding shortfall: duplicate a few with a nudge
  for (let i = j - 1; i > 0; i--) { const s = Math.floor(rand() * (i + 1)); const a = all[i * 2], b = all[i * 2 + 1]; all[i * 2] = all[s * 2]; all[i * 2 + 1] = all[s * 2 + 1]; all[s * 2] = a; all[s * 2 + 1] = b; }
  out.set(all.subarray(0, n * 2));                                // shuffled first, so any surplus is dropped at random
  return out;
}
export function buildCdf(weights) {
  const c = new Float64Array(weights.length + 1);
  for (let i = 0; i < weights.length; i++) c[i + 1] = c[i] + weights[i];
  return c;
}
// n points as [u,v,u,v,...] in 0..1, density proportional to the weights (inverse-CDF sampling, jittered inside the cell)
export function samplePoints(cdf, w, h, n, rand) {
  const out = new Float32Array(n * 2), total = cdf[cdf.length - 1], cells = cdf.length - 1;
  for (let i = 0; i < n; i++) {
    const r = rand() * total; let lo = 0, hi = cells - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m + 1] < r) lo = m + 1; else hi = m; }
    out[i * 2] = ((lo % w) + rand()) / w; out[i * 2 + 1] = (Math.floor(lo / w) + rand()) / h;
  }
  return out;
}

// Same distribution, but the position along the CDF uses a golden-ratio low-discrepancy sequence, so every region gets
// almost exactly its share of points (far less clumping noise than plain random sampling).
export function samplePointsLD(cdf, w, h, n, rand) {
  const out = new Float32Array(n * 2), total = cdf[cdf.length - 1], cells = cdf.length - 1, phi = 0.6180339887498949, off = rand();
  for (let i = 0; i < n; i++) {
    const r = (((off + i * phi) % 1) * 0.9998 + rand() * 0.0002) * total; let lo = 0, hi = cells - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m + 1] < r) lo = m + 1; else hi = m; }
    out[i * 2] = ((lo % w) + rand()) / w; out[i * 2 + 1] = (Math.floor(lo / w) + rand()) / h;
  }
  return out;
}

// Harris corner response, then greedy non-maximum suppression. Returns [{x,y,s}] with x,y in 0..1.
export function featurePoints(gray, w, h, k, minDist) {
  const ix = new Float32Array(w * h), iy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    ix[i] = (gray[i + 1] - gray[i - 1]) * 0.5; iy[i] = (gray[i + w] - gray[i - w]) * 0.5;
  }
  const resp = new Float32Array(w * h); let maxR = 0;
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    let a = 0, b = 0, c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = (y + dy) * w + x + dx; a += ix[j] * ix[j]; b += iy[j] * iy[j]; c += ix[j] * iy[j]; }
    const r = a * b - c * c - 0.05 * (a + b) * (a + b); resp[y * w + x] = r; if (r > maxR) maxR = r;
  }
  if (maxR <= 0) return [];
  const cand = []; for (let i = 0; i < resp.length; i++) if (resp[i] > maxR * 0.01) cand.push(i);
  cand.sort((p, q) => resp[q] - resp[p]);
  const picked = [], md2 = minDist * minDist;
  for (const i of cand) {
    const x = (i % w + 0.5) / w, y = (Math.floor(i / w) + 0.5) / h;
    let ok = true; for (const p of picked) { const dx = (p.x - x) * (w / h), dy = p.y - y; if (dx * dx + dy * dy < md2) { ok = false; break; } }
    if (ok) { picked.push({ x, y, s: resp[i] / maxR }); if (picked.length >= k) break; }
  }
  return picked;
}

// gentle wander field, identical in GLSL (see scatter.js). Returns [x,y,z] in -1..1
export function drift(ux, uy, t) {
  const a = ux * 6.0 + t * 0.37, b = uy * 6.0 - t * 0.29;
  return [Math.sin(a * 1.7 + b), Math.cos(b * 1.3 - a * 0.8), Math.sin(a * 0.9 + b * 1.1 + t * 0.2)];
}
