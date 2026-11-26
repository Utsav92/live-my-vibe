// Scatter: drop in pictures, get a point cloud you can drift, splash, gather, light, track and scan.
import * as THREE from './vendor/three.module.js';
import { mulberry32, toGray, buildDepth, weightsFrom, samplePointsED, featurePoints } from './scatter-core.js';
import { active } from './site-state.js';

THREE.ColorManagement.enabled = false;
const $ = (s) => document.querySelector(s);
const root = $('#app-scatter');
const params = new URLSearchParams(location.search);
const N = Math.max(4096, Math.min(1 << 20, +params.get('n') || 524288));
$('#pts').textContent = N.toLocaleString('en-US');
const MAXPICS = 4;

// ---------------------------------------------------------------- state
const S = {
  drift: 80, splash: 70, gather: 33, depth: 80,          // DAO Gather's defaults
  track: true, links: true, scan: false, trails: false, marks: true,
  density: 'sparse', travel: 'swarm', paper: 'black', onWhite: 'negative',
  light: false, lightColor: '#ffe9c4', pictureColors: false,
  line1: [0.2, 0.5], line2: [-0.15, -0.4],            // swarm path handles (the LINE box)
};
const pics = []; let cur = 0;
const tr = { active: false, t0: 0, dur: 2600, to: 0 };
let trackers = [], trackHist = [], splashE = 0, lastPtr = null, scanT = 0, clockT = 0;
const ptr = { x: 0, y: 0, nx: 0, ny: 0, inside: false };           // world-plane pointer + normalised
let tiltX = 0, tiltY = 0;
const view = { rx: 0, ry: 0, vx: 0, vy: 0, px: 0, py: 0, tz: 8.03, resetting: false };   // manual orbit, pan and zoom
let drag = null;

// ---------------------------------------------------------------- renderer
const canvas = $('#scGl'), ov = $('#scOv'), octx = ov.getContext('2d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'default' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
const DPR = Math.min(devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(DPR);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(12, 1, 0.5, 40); camera.position.set(0, 0.05, 8.03);   // near-orthographic: depth no longer distorts the flat picture
const group = new THREE.Group(); scene.add(group);

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
{ const r = mulberry32(1234), a = new Float32Array(N * 4); for (let i = 0; i < a.length; i++) a[i] = r(); geo.setAttribute('aRnd', new THREE.BufferAttribute(a, 4)); }
geo.setAttribute('aUv0', new THREE.BufferAttribute(new Float32Array(N * 2), 2).setUsage(THREE.DynamicDrawUsage));
geo.setAttribute('aUv1', new THREE.BufferAttribute(new Float32Array(N * 2), 2).setUsage(THREE.DynamicDrawUsage));

const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blank.needsUpdate = true;
const U = {
  uTex0: { value: blank }, uTex1: { value: blank }, uDep0: { value: blank }, uDep1: { value: blank },
  uAsp0: { value: 1 }, uAsp1: { value: 1 }, uScl0: { value: 1 }, uScl1: { value: 1 },
  uT: { value: 0 }, uMode: { value: 0 }, uTime: { value: 0 }, uDrift: { value: 0.8 }, uSplashAmt: { value: 0.7 }, uSplashE: { value: 0 },
  uDepth: { value: 0.6 }, uLight: { value: 0 }, uPicCol: { value: 0 }, uPaper: { value: 0 },
  uScan: { value: -9 }, uScanW: { value: 0.025 }, uSize: { value: 1.5 }, uAlpha: { value: 0.7 }, uPR: { value: DPR },
  uPtr: { value: new THREE.Vector2(9, 9) }, uLine1: { value: new THREE.Vector2(0.2, 0.5) }, uLine2: { value: new THREE.Vector2(-0.15, -0.4) },
  uLightDir: { value: new THREE.Vector3(0.3, 0.4, 0.85) }, uWind: { value: new THREE.Vector2(0.99, 0.12).normalize() }, uLightCol: { value: new THREE.Color('#ffe9c4') },
};
const VERT = `
attribute vec2 aUv0; attribute vec2 aUv1; attribute vec4 aRnd;
uniform sampler2D uTex0, uTex1, uDep0, uDep1;
uniform float uAsp0, uAsp1, uScl0, uScl1, uT, uMode, uTime, uDrift, uSplashAmt, uSplashE, uDepth, uLight, uPicCol, uPaper, uScan, uScanW, uSize, uAlpha, uPR;
uniform vec2 uPtr, uLine1, uLine2, uWind; uniform vec3 uLightDir, uLightCol;
varying vec4 vCol;
vec3 homeP(vec2 uv, float d, float asp, float scl){ return vec3((uv.x-0.5)*asp*scl, (0.5-uv.y)*scl, (d-0.5)*uDepth*0.6); }
vec3 ballP(vec4 r, float scl){                                  // the soft glowing ball the sand passes through between pictures
  float rad = sqrt(-2.0*log(max(r.y, 1e-4)))*0.12*scl, th = 6.2831853*r.z, ph = acos(2.0*fract(r.w*7.31+r.x)-1.0);
  return vec3(rad*sin(ph)*cos(th), rad*sin(ph)*sin(th), rad*cos(ph)*0.6);
}
vec3 shade(vec3 c, vec3 dep){                                   // dep = depth, slope x, slope y (precomputed on the CPU)
  float lum = dot(c, vec3(0.299,0.587,0.114));
  vec2 g = (dep.yz - 0.5)*0.25*1.8;                               // the old 1/256 central difference, at the depth map's resolution
  vec3 n = normalize(vec3(-g.x*uDepth*7.0, g.y*uDepth*7.0, 1.0));
  float k = mix(1.0, 0.25 + 1.6*max(dot(n, normalize(uLightDir)), 0.0), uLight);
  vec3 base = mix(uLightCol, min(c / max(lum, 0.05), vec3(4.0)), uPicCol);   // tone lives in the point density: every point has luminance 1 and the picture's exact hue
  return base*k;
}
// DRIFT: grains on the fading side keep peeling off and streaming away on the wind, then grow back in place.
// Written without branches: Windows' D3D shader compiler stalls for minutes on early returns here.
float blowOn(vec3 h, float asp, float scl){ return step(aRnd.y, uDrift*(0.03 + 0.42*smoothstep(-0.2, 0.55, dot(h.xy/vec2(asp*scl, scl), uWind)))); }   // 1 = this grain blows
vec4 blow(vec3 h, float asp, float scl){                          // xyz = position, w = fade
  float on = blowOn(h, asp, scl);
  float ph = fract(uTime*(0.05+0.05*aRnd.z) + aRnd.x*7.13);
  float out_ = step(ph, 0.82), k = min(ph/0.82, 1.0);
  float d = k*k*(0.35+0.9*uDrift)*(0.45+aRnd.w)*scl;
  vec2 turb = vec2(sin(h.y*9.0 + uTime*1.3 + aRnd.z*6.0), cos(h.x*7.0 - uTime*1.1 + aRnd.w*6.0));
  vec3 away = vec3(uWind*d + turb*k*0.07*scl + vec2(0.0, (aRnd.z-0.5)*k*0.12*scl), (aRnd.w-0.5)*k*0.35*scl);
  vec3 shimmer = vec3(sin(uTime*1.7+aRnd.z*40.0), cos(uTime*1.3+aRnd.w*40.0), 0.0)*0.0015*uDrift;
  float f = mix(clamp((ph-0.82)/0.18, 0.0, 1.0), pow(max(1.0-k, 0.0), 1.3), out_);
  return vec4(h + mix(shimmer, away*out_, on), mix(1.0, f, on));
}
void main(){
  float tt = clamp((uT - aRnd.x*0.22)/0.78, 0.0, 1.0); float e = tt*tt*(3.0-2.0*tt);
  vec3 q0 = texture2D(uDep0, aUv0).rgb, q1 = texture2D(uDep1, aUv1).rgb; float d0 = q0.r, d1 = q1.r;
  vec3 r0 = homeP(aUv0, d0, uAsp0, uScl0), r1 = homeP(aUv1, d1, uAsp1, uScl1);
  vec4 b0 = blow(r0, uAsp0, uScl0), b1 = blow(r1, uAsp1, uScl1);
  float grain = mix(blowOn(r0, uAsp0, uScl0), blowOn(r1, uAsp1, uScl1), e);   // grains in the wind are lone specks: give them enough light to be seen
  vec3 h0 = b0.xyz, h1 = b1.xyz, b = ballP(aRnd, max(uScl0, uScl1));
  float first = step(e, 0.5), k = mix((e-0.5)*2.0, e*2.0, first), sk = k*k*(3.0-2.0*k), arc = sin(3.14159*k), mid = sin(3.14159*e);
  vec3 sw = mix(mix(b, h1, sk) + vec3(uLine2*arc*0.35*(0.5+aRnd.z), 0.0), mix(h0, b, sk) + vec3(uLine1*arc*0.35*(0.5+aRnd.y), 0.0), first);   // SWARM: out to the ball along the LINE's first bend, in along the second
  vec3 ml = mix(mix(b, h1, k), mix(h0, b, k), first) + vec3(sin(aRnd.z*40.0 + uTime*2.0), cos(aRnd.w*40.0 + uTime*1.7), 0.0)*0.06*arc;          // MELT: soften and swell into the ball, then condense
  float moving = step(0.0001, uT), melt = step(0.5, uMode);
  vec3 p = mix(h0, mix(sw, ml, melt), moving);
  float fade = mix(b0.w, mix(b0.w, b1.w, e) * (1.0 - mix(0.45, 0.6, melt)*mid), moving);
  vec2 uv = mix(aUv0, aUv1, e);
  vec2 dd = p.xy - uPtr; float dist = length(dd);               // SPLASH: the pointer's kick throws the sand
  float f = uSplashE*exp(-dist*dist*14.0);
  p.xy += normalize(dd + vec2(1e-4)) * f * 0.4 * uSplashAmt * (0.4+aRnd.w); p.z += f*0.3*uSplashAmt;
  float sb = step(-5.0, uScan)*smoothstep(uScanW, 0.0, abs(p.y - uScan)); p.z += sb*0.05;   // SCAN
  vec3 col = mix(shade(texture2D(uTex0, aUv0).rgb, q0), shade(texture2D(uTex1, aUv1).rgb, q1), e);
  col *= 1.0 + 2.2*sb;
  float a = mix(uAlpha, max(uAlpha, 0.55), grain) * fade * (0.92 + 0.16*aRnd.w);
  vCol = vec4(mix(col, mix(vec3(0.06,0.05,0.04), col*0.6, uPicCol), step(0.5, uPaper)), a);
  gl_PointSize = uSize*uPR*(0.9 + aRnd.z*0.2) * (1.0 + 0.8*sb);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const FRAG = `
uniform float uPaper; varying vec4 vCol;
void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard; float soft = smoothstep(0.5, 0.15, r);
  if (uPaper < 0.5) gl_FragColor = vec4(vCol.rgb * vCol.a * soft, 1.0); else gl_FragColor = vec4(mix(vec3(1.0), vCol.rgb, clamp(vCol.a*soft, 0.0, 1.0)), 1.0); }`;
const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false });
function setBlend() {
  if (S.paper === 'black') { mat.blending = THREE.CustomBlending; mat.blendEquation = THREE.AddEquation; mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneFactor; }
  else { mat.blending = THREE.CustomBlending; mat.blendEquation = THREE.AddEquation; mat.blendSrc = THREE.DstColorFactor; mat.blendDst = THREE.ZeroFactor; }
}
const points = new THREE.Points(geo, mat); points.frustumCulled = false; group.add(points);

// trails: feedback render target that is faded a little every frame
let trailRT = null;
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.08, depthTest: false, depthWrite: false });
const fadeScene = new THREE.Scene(); fadeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMat));
const copyMat = new THREE.MeshBasicMaterial({ map: null, depthTest: false, depthWrite: false, toneMapped: false });
const copyScene = new THREE.Scene(); copyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMat));
const paperHex = () => (S.paper === 'black' ? 0x000000 : 0xf1efe9);
function resetTrails() { if (!trailRT) return; renderer.setRenderTarget(trailRT); renderer.setClearColor(paperHex(), 1); renderer.clear(); renderer.setRenderTarget(null); }
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  ov.width = w * DPR; ov.height = h * DPR; octx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (trailRT) trailRT.dispose(); trailRT = new THREE.WebGLRenderTarget(Math.round(w * DPR), Math.round(h * DPR), { depthBuffer: false }); resetTrails();
}
addEventListener('resize', resize);

// ---------------------------------------------------------------- pictures
function drawDemo(i) {
  const c = document.createElement('canvas'); c.width = c.height = 640; const g = c.getContext('2d'), R = mulberry32(40 + i);
  g.fillStyle = '#000'; g.fillRect(0, 0, 640, 640);
  if (i === 0) {                                              // ORB: a moon lit from the left; its shaded right side is the side that blows away
    const im = g.createImageData(640, 640), L = [-0.72, -0.32, 0.62], ln = Math.hypot(...L);
    const blobs = Array.from({ length: 26 }, () => [R() * 2 - 1, R() * 2 - 1, 0.08 + R() * 0.22, 0.1 + R() * 0.18]);   // soft darker "seas"
    for (let y = 0; y < 640; y++) for (let x = 0; x < 640; x++) {
      const o = (y * 640 + x) * 4, nx = (x - 320) / 250, ny = (y - 320) / 250, r2 = nx * nx + ny * ny; im.data[o + 3] = 255;
      if (r2 > 1) continue;
      const nz = Math.sqrt(1 - r2); let alb = 1;
      for (const [bx, by, br, bd] of blobs) { const d = Math.hypot(nx - bx, ny - by) / br; if (d < 1.6) alb -= bd * Math.exp(-d * d * 1.6); }
      alb *= 0.94 + 0.06 * Math.sin(nx * 37 + ny * 23) * Math.sin(ny * 41 - nx * 13);
      const lam = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / ln), v = Math.min(1, (0.03 + 1.05 * Math.pow(lam, 0.8)) * alb);
      im.data[o] = 255 * v; im.data[o + 1] = 246 * v; im.data[o + 2] = 228 * v;
    }
    g.putImageData(im, 0, 0);
  } else if (i === 1) {                                       // RIPPLE: two ring systems interfering inside a disc, black outside
    const im = g.createImageData(640, 640);
    for (let y = 0; y < 640; y++) for (let x = 0; x < 640; x++) { const o = (y * 640 + x) * 4, rr = Math.hypot(x - 320, y - 320) / 270; im.data[o + 3] = 255; if (rr > 1) continue;
      const a = Math.hypot(x - 255, y - 300), b = Math.hypot(x - 400, y - 345), v = 0.5 + 0.25 * Math.sin(a * 0.2) + 0.25 * Math.sin(b * 0.2), edge = Math.min(1, (1 - rr) * 14), q = Math.pow(v, 2.2) * edge;
      im.data[o] = 30 + q * 150; im.data[o + 1] = 60 + q * 195; im.data[o + 2] = 70 + q * 185; if (q < 0.02) im.data[o] = im.data[o + 1] = im.data[o + 2] = 0; }
    g.putImageData(im, 0, 0);
  } else if (i === 2) {                                       // TAIJI: the yin-yang, white half with a thin rim so the dark half still reads
    const c0 = 320, R0 = 240; g.fillStyle = '#f4f1ea'; g.beginPath(); g.arc(c0, c0, R0, -Math.PI / 2, Math.PI / 2); g.arc(c0, c0 + R0 / 2, R0 / 2, Math.PI / 2, -Math.PI / 2, true); g.arc(c0, c0 - R0 / 2, R0 / 2, Math.PI / 2, -Math.PI / 2); g.closePath(); g.fill();
    g.fillStyle = '#000'; g.beginPath(); g.arc(c0, c0 - R0 / 2, R0 / 7, 0, 7); g.fill(); g.fillStyle = '#f4f1ea'; g.beginPath(); g.arc(c0, c0 + R0 / 2, R0 / 7, 0, 7); g.fill();
    g.strokeStyle = 'rgba(244,241,234,.8)'; g.lineWidth = 3; g.beginPath(); g.arc(c0, c0, R0 + 4, 0, 7); g.stroke();
  } else {                                                    // GLYPH: triangle, circle, square with gradient light
    const sh = (x, y, r, c0, c1) => { const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, 2, x, y, r * 1.3); gr.addColorStop(0, c0); gr.addColorStop(1, c1); return gr; };
    g.fillStyle = sh(215, 340, 150, '#e9ddff', '#2a1a5a'); g.beginPath(); g.moveTo(215, 190); g.lineTo(365, 470); g.lineTo(65, 470); g.closePath(); g.fill();
    g.fillStyle = sh(430, 250, 110, '#ffffff', '#5b3fd0'); g.beginPath(); g.arc(430, 250, 105, 0, 7); g.fill();
    g.fillStyle = sh(445, 440, 90, '#c8b8ff', '#1b1040'); g.fillRect(360, 360, 170, 170);
  }
  return c;
}
function buildPic(src, name, demo) {
  const w = src.width, h = src.height, longest = Math.max(w, h), sc = Math.min(1, 1024 / longest);
  const c = document.createElement('canvas'); c.width = Math.max(8, Math.round(w * sc)); c.height = Math.max(8, Math.round(h * sc)); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c); tex.flipY = false; tex.generateMipmaps = false; tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.colorSpace = THREE.NoColorSpace;
  const small = (m) => { const k = Math.min(1, m / Math.max(c.width, c.height)), cw = Math.max(8, Math.round(c.width * k)), ch = Math.max(8, Math.round(c.height * k)); const t = document.createElement('canvas'); t.width = cw; t.height = ch; const g = t.getContext('2d', { willReadFrequently: true }); g.drawImage(c, 0, 0, cw, ch); return { cw, ch, data: g.getImageData(0, 0, cw, ch).data }; };
  const big = small(1024), dsm = small(256);
  const gray = toGray(big.data, big.cw, big.ch), grayD = toGray(dsm.data, dsm.cw, dsm.ch), depth = buildDepth(grayD, dsm.cw, dsm.ch);
  const d8 = new Uint8Array(depth.length * 4), DW = dsm.cw, DH = dsm.ch, at = (x, y) => depth[Math.min(DH - 1, Math.max(0, y)) * DW + Math.min(DW - 1, Math.max(0, x))];
  for (let y = 0, i = 0; y < DH; y++) for (let x = 0; x < DW; x++, i++) {         // r = depth, g/b = its slope (x4, around 0.5) for the relief light
    d8[i * 4] = Math.round(depth[i] * 255); d8[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, (at(x + 1, y) - at(x - 1, y)) * 4 + 0.5)) * 255); d8[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, (at(x, y + 1) - at(x, y - 1)) * 4 + 0.5)) * 255); d8[i * 4 + 3] = 255;
  }
  const depthTex = new THREE.DataTexture(d8, DW, DH, THREE.RGBAFormat, THREE.UnsignedByteType); depthTex.minFilter = depthTex.magFilter = THREE.LinearFilter; depthTex.generateMipmaps = false; depthTex.needsUpdate = true;
  const th = document.createElement('canvas'); th.width = th.height = 80; const tg = th.getContext('2d'), s2 = Math.max(80 / c.width, 80 / c.height);
  tg.fillStyle = '#000'; tg.fillRect(0, 0, 80, 80); tg.drawImage(c, (80 - c.width * s2) / 2, (80 - c.height * s2) / 2, c.width * s2, c.height * s2);
  const asp = c.width / c.height;
  return { name: name.toUpperCase().replace(/\.[A-Z0-9]+$/, '').slice(0, 14), demo, tex, depthTex, depth, dw: dsm.cw, dh: dsm.ch, gray, gw: big.cw, gh: big.ch, asp, scale: Math.min(1, 1.55 / asp), feats: featurePoints(grayD, dsm.cw, dsm.ch, 80, 0.045), thumb: th.toDataURL('image/jpeg', 0.8), uv: {}, wsum: {} };
}
const wmode = () => (S.paper === 'white' && S.onWhite === 'true' ? 'ink' : 'light');
function uvFor(p, mode) {
  if (!p.uv[mode]) { const wt = weightsFrom(p.gray, mode); let s = 0; for (let i = 0; i < wt.length; i++) s += wt[i]; p.wsum[mode] = s; p.uv[mode] = samplePointsED(wt, p.gw, p.gh, N, mulberry32(77 + p.gw)); }
  return p.uv[mode];
}
// exposure: choose point size and brightness from the frame size so the brightest areas just reach white without clipping
const KERNEL = (() => { let a = 0; const n = 200; for (let i = 0; i < n; i++) { const r = (i + 0.5) / n * 0.5, t = Math.min(1, Math.max(0, (0.5 - r) / 0.35)), s = t * t * (3 - 2 * t); a += 2 * Math.PI * r * s * (0.5 / n); } return a; })();
function exposure() {
  const p = pics[cur]; if (!p) return; const mode = wmode(); uvFor(p, mode);
  const fw = p.asp * p.scale, fh = p.scale, tl = toScreen(-fw / 2, fh / 2, 0, false), br = toScreen(fw / 2, -fh / 2, 0, false);
  const area = Math.max(1000, (br[0] - tl[0]) * (br[1] - tl[1]) * DPR * DPR);
  const ppp = N / Math.max(1e-6, p.wsum[mode]) * (p.gw * p.gh) / area;               // points per framebuffer pixel where the weight is 1
  const target = 1.12;                                                               // calibrated: full white in the picture lands on full white on screen
  let D = 1.3 * DPR, alpha = target / (ppp * KERNEL * D * D);
  if (alpha > 1) { D = Math.sqrt(target / (ppp * KERNEL)); alpha = 1; }                    // too few points for this frame: grow them instead of dimming
  U.uSize.value = D / DPR; U.uAlpha.value = Math.max(0.02, alpha * (S.trails ? 0.08 : 1));
}
function setSlot(slot, p) {
  U['uTex' + slot].value = p.tex; U['uDep' + slot].value = p.depthTex; U['uAsp' + slot].value = p.asp; U['uScl' + slot].value = p.scale;
  const a = geo.attributes['aUv' + slot]; a.array = uvFor(p, wmode()); a.needsUpdate = true;
}
function showCurrent() { tr.active = false; U.uT.value = 0; setSlot(0, pics[cur]); setSlot(1, pics[cur]); buildTrackers(); renderThumbs(); }
function refreshMode() { if (!pics.length) return; setSlot(0, pics[cur]); setSlot(tr.active ? 1 : 1, pics[tr.active ? tr.to : cur]); }

// ---------------------------------------------------------------- trackers (Harris corners, strongest first)
function trackersFor(p) {
  if (!p) return []; const out = [], minD = S.density === 'sparse' ? 0.2 : 0.06, cap = S.density === 'sparse' ? 12 : 56;
  const far = (f) => out.every((q) => Math.hypot((q.x - f.x) * p.asp, q.y - f.y) >= minD);
  for (const f of p.feats) { if (far(f)) out.push(f); if (out.length >= cap) break; }
  const want = S.density === 'sparse' ? 9 : 40;                   // smooth pictures have few corners: top up with well-spread points on the lit part
  if (out.length < want) {
    const R = mulberry32(991 + p.gw), cand = [];
    for (let k = 0; k < 600; k++) { const x = 0.04 + R() * 0.92, y = 0.04 + R() * 0.92, v = p.gray[Math.floor(y * p.gh) * p.gw + Math.floor(x * p.gw)]; if (v > 0.12) cand.push({ x, y, s: v * 0.5 }); }
    for (const f of cand) { if (out.length >= want) break; if (far(f)) out.push(f); }
  }
  return out;
}
function buildTrackers() { if (!pics[cur]) return; trackers = trackersFor(pics[cur]); trackHist = trackers.map(() => []); }
const sampleDepth = (p, x, y) => p.depth[Math.min(p.dh - 1, Math.floor(y * p.dh)) * p.dw + Math.min(p.dw - 1, Math.floor(x * p.dw))];
function trackerWorld(f, p, t) {                             // mirrors the vertex shader for a point with aRnd = 0.5
  const d = sampleDepth(p, f.x, f.y), uD = S.depth / 100;
  let x = (f.x - 0.5) * p.asp * p.scale, y = (0.5 - f.y) * p.scale, z = (d - 0.5) * uD * 0.6;
  const dx = x - ptr.x, dy = y - ptr.y, dist = Math.hypot(dx, dy), fl = splashE * Math.exp(-dist * dist * 14), n = Math.hypot(dx, dy) + 1e-4;
  x += (dx / n) * fl * 0.4 * (S.splash / 100) * 0.9; y += (dy / n) * fl * 0.4 * (S.splash / 100) * 0.9; z += fl * 0.3 * (S.splash / 100);
  return [x, y, z, d];
}

// ---------------------------------------------------------------- UI
const thumbsEl = $('#thumbs');
function renderThumbs() {
  thumbsEl.innerHTML = '';
  pics.forEach((p, i) => { const b = document.createElement('button'); b.className = 'th' + (i === cur ? ' on' : ''); b.innerHTML = `<i style="background-image:url(${p.thumb})"></i><span>${i + 1}</span>`; b.title = p.name; b.addEventListener('click', () => goTo(i)); thumbsEl.appendChild(b); });
  if (pics.length < MAXPICS) { const b = document.createElement('button'); b.className = 'th add'; b.innerHTML = '<i>+</i>'; b.addEventListener('click', () => $('#fileImg').click()); thumbsEl.appendChild(b); }
}
function toast(t) { const el = $('#scToast'); el.textContent = t; el.classList.add('in'); clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove('in'), 2600); }
async function addFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/')).slice(0, MAXPICS); if (!list.length) return toast('Drop image files');
  const fresh = []; for (const f of list) { try { const bmp = await createImageBitmap(f); fresh.push(buildPic(bmp, f.name, false)); bmp.close?.(); } catch { toast('Could not read ' + f.name); } }
  if (!fresh.length) return;
  const keep = pics.filter((p) => !p.demo), demos = pics.filter((p) => p.demo); const all = [...keep, ...fresh, ...demos].slice(0, MAXPICS);   // uploads take the demo slots first
  pics.length = 0; pics.push(...all);                                      // uploads replace the demo pictures first
  cur = Math.max(0, keep.length); if (cur >= pics.length) cur = 0; showCurrent(); startTransitionFromScatter(); toast(`${fresh.length} picture${fresh.length > 1 ? 's' : ''} added`);
}
const gatherMs = () => 3000 - 2200 * (S.gather / 100);              // GATHER 0 = slow 3.0 s, 33 = 2.3 s, 100 = brisk 0.8 s
function startTransitionFromScatter() { tr.active = true; tr.to = cur; tr.t0 = performance.now(); tr.dur = gatherMs(); tr.seek = trackersFor(pics[cur]); setSlot(1, pics[cur]); }
function goTo(i) {
  if (tr.active || !pics.length) return; tr.active = true; tr.to = i % pics.length; tr.t0 = performance.now(); tr.dur = gatherMs() * (S.travel === 'swarm' ? 1 : 1.3); tr.seek = trackersFor(pics[tr.to]);
  setSlot(1, pics[tr.to]); U.uMode.value = S.travel === 'swarm' ? 0 : 1;
}
function finishTransition() {
  cur = tr.to; tr.active = false; U.uT.value = 0; setSlot(0, pics[cur]); setSlot(1, pics[cur]); buildTrackers(); renderThumbs();
}
const next = () => goTo(pics.length > 1 ? (cur + 1) % pics.length : cur);
$('#next').addEventListener('click', next); $('#add').addEventListener('click', () => $('#fileImg').click());
$('#fileImg').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
addEventListener('dragover', (e) => { if (!active('scatter')) return; e.preventDefault(); root.classList.add('dragging'); });
addEventListener('dragleave', (e) => { if (active('scatter') && !e.relatedTarget) root.classList.remove('dragging'); });
addEventListener('drop', (e) => { if (!active('scatter')) return; e.preventDefault(); root.classList.remove('dragging'); addFiles(e.dataTransfer.files); });
function setLight(on) { S.light = on; $('#light').classList.toggle('off', !on); }
$('#light').addEventListener('click', () => setLight(!S.light));
addEventListener('keydown', (e) => { if (!active('scatter')) return; if (/INPUT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range') return; if (e.code === 'Space') { e.preventDefault(); next(); } else if (e.key === 's' || e.key === 'S') setLight(!S.light); else if (e.key === 'r' || e.key === 'R') resetView(); });
for (const [id, key, div] of [['sDrift', 'drift'], ['sSplash', 'splash'], ['sGather', 'gather'], ['sDepth', 'depth']]) $('#' + id).addEventListener('input', (e) => { S[key] = +e.target.value; $('#v' + key[0].toUpperCase() + key.slice(1)).textContent = e.target.value; });
document.querySelectorAll('[data-tg]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.tg; S[k] = !S[k]; if (k === 'trails') resetTrails(); sync(); }));
document.querySelectorAll('[data-dens]').forEach((b) => b.addEventListener('click', () => { S.density = b.dataset.dens; buildTrackers(); sync(); }));
document.querySelectorAll('[data-travel]').forEach((b) => b.addEventListener('click', () => { S.travel = b.dataset.travel; sync(); }));
document.querySelectorAll('[data-white]').forEach((b) => b.addEventListener('click', () => { S.onWhite = b.dataset.white; refreshMode(); sync(); }));
function setPaper(p) { S.paper = p; root.classList.toggle('white', p === 'white'); setBlend(); U.uPaper.value = p === 'white' ? 1 : 0; fadeMat.color.set(paperHex()); resetTrails(); refreshMode(); }
$('#paper').addEventListener('click', () => setPaper(S.paper === 'black' ? 'white' : 'black'));
$('#full').addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()));
$('#credBtn').addEventListener('click', () => $('#cred').classList.toggle('open'));
// light colours
const SW = [['Bone', '#ffe9c4'], ['Ice', '#cfe0ff'], ['Amber', '#ffb347'], ['Ember', '#ff5a3c'], ['Jade', '#3ddcb0'], ['Violet', '#8f7bff']];
const swEl = $('#swatches');
for (const [name, hex] of SW) { const b = document.createElement('button'); b.className = 'sw'; b.style.background = hex; b.title = name; b.dataset.hex = hex; b.addEventListener('click', () => { S.lightColor = hex; S.pictureColors = false; sync(); }); swEl.appendChild(b); }
{ const b = document.createElement('button'); b.className = 'sw pic'; b.title = "Picture's own colours"; b.dataset.pic = '1'; b.addEventListener('click', () => { S.pictureColors = true; sync(); }); swEl.appendChild(b); }
{ const b = document.createElement('label'); b.className = 'sw any'; b.title = 'Any colour'; b.innerHTML = '<input type="color" value="#ffe9c4">'; b.querySelector('input').addEventListener('input', (e) => { S.lightColor = e.target.value; S.pictureColors = false; sync(); }); swEl.appendChild(b); }
function sync() {
  document.querySelectorAll('[data-tg]').forEach((b) => b.classList.toggle('on', !!S[b.dataset.tg]));
  document.querySelectorAll('[data-dens]').forEach((b) => b.classList.toggle('on', S.density === b.dataset.dens));
  document.querySelectorAll('[data-travel]').forEach((b) => b.classList.toggle('on', S.travel === b.dataset.travel));
  document.querySelectorAll('[data-white]').forEach((b) => b.classList.toggle('on', S.onWhite === b.dataset.white));
  swEl.querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', b.dataset.pic ? S.pictureColors : (!S.pictureColors && b.dataset.hex === S.lightColor)));
  U.uLightCol.value.set(S.lightColor); U.uPicCol.value = S.pictureColors ? 1 : 0;
}
// LINE editor: two handles that bend the swarm's flight path
{
  const c = $('#line'), g = c.getContext('2d'); let drag = -1;
  const pos = (i) => { const h = i ? S.line2 : S.line1; return [54 + h[0] * 40, 66 - h[1] * 48]; };
  function draw() {
    g.clearRect(0, 0, 108, 132); const col = getComputedStyle(root).getPropertyValue('--ink').trim() || '#fff';
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.2; g.globalAlpha = 0.9; const a = pos(0), b = pos(1);
    g.beginPath(); g.moveTo(54, 120); g.bezierCurveTo(a[0], a[1], b[0], b[1], 54, 12); g.stroke(); g.globalAlpha = 0.4; g.beginPath(); g.moveTo(54, 120); g.lineTo(a[0], a[1]); g.moveTo(54, 12); g.lineTo(b[0], b[1]); g.stroke(); g.globalAlpha = 1;
    for (const p of [a, b]) { g.beginPath(); g.arc(p[0], p[1], 5, 0, 7); g.fillStyle = '#000'; g.fill(); g.stroke(); }
    g.fillStyle = col; g.fillRect(52, 118, 4, 4); g.fillRect(52, 10, 4, 4);
  }
  const set = (e) => { if (drag < 0) return; const r = c.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * 108, y = ((e.clientY - r.top) / r.height) * 132; const h = [Math.max(-1.2, Math.min(1.2, (x - 54) / 40)), Math.max(-1.2, Math.min(1.2, (66 - y) / 48))]; if (drag) S.line2 = h; else S.line1 = h; draw(); };
  c.addEventListener('pointerdown', (e) => { const r = c.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * 108, y = ((e.clientY - r.top) / r.height) * 132; const d0 = Math.hypot(x - pos(0)[0], y - pos(0)[1]), d1 = Math.hypot(x - pos(1)[0], y - pos(1)[1]); drag = d0 <= d1 ? 0 : 1; c.setPointerCapture(e.pointerId); set(e); });
  c.addEventListener('pointermove', set); c.addEventListener('pointerup', () => { drag = -1; }); draw(); window.__lineDraw = draw;
}

// ---------------------------------------------------------------- pointer
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointermove', (e) => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true;
    if (drag.pan) { const k = 0.0017 * (camera.position.z / 8.03); view.px += dx * k; view.py -= dy * k; }
    else { view.ry += dx * 0.007; view.rx = Math.max(-1.4, Math.min(1.4, view.rx + dy * 0.007)); view.vx = dx * 0.007; view.vy = dy * 0.007; }
    view.resetting = false;
  }
  const nx = e.clientX / innerWidth * 2 - 1, ny = -(e.clientY / innerHeight * 2 - 1);
  const v = new THREE.Vector3(nx, ny, 0.5).unproject(camera), dir = v.sub(camera.position).normalize(), k = -camera.position.z / dir.z;
  const wx = camera.position.x + dir.x * k, wy = camera.position.y + dir.y * k;
  if (lastPtr && !drag) splashE = Math.min(1.6, splashE + Math.hypot(wx - lastPtr[0], wy - lastPtr[1]) * 2.4);
  lastPtr = [wx, wy]; ptr.x = wx; ptr.y = wy; ptr.nx = nx; ptr.ny = ny; ptr.inside = true;
});
canvas.addEventListener('pointerleave', () => { ptr.inside = false; lastPtr = null; });
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, pan: e.button === 2 || e.shiftKey, moved: false }; view.vx = view.vy = 0; canvas.setPointerCapture?.(e.pointerId); });
addEventListener('pointerup', () => { if (drag && !drag.moved) splashE = 1.6; drag = null; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.tz = Math.max(3.8, Math.min(16, view.tz + e.deltaY * 0.008)); }, { passive: false });
const resetView = () => { view.resetting = true; view.vx = view.vy = 0; };
canvas.addEventListener('dblclick', resetView);

// ---------------------------------------------------------------- overlay (trackers, links, marks, scan, frame)
const proj = new THREE.Vector3();
function toScreen(x, y, z, useGroup = true) { proj.set(x, y, z); if (useGroup) group.localToWorld(proj); proj.project(camera); return [(proj.x * 0.5 + 0.5) * innerWidth, (-proj.y * 0.5 + 0.5) * innerHeight]; }
const fmt = (v) => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2);
function drawOverlay(t) {
  const w = innerWidth, h = innerHeight; octx.clearRect(0, 0, w, h);
  const ink = S.paper === 'black' ? '237,234,228' : '20,17,13'; const col = (a) => `rgba(${ink},${a})`;
  const p = pics[cur]; if (!p) return;
  // frame: ticks + corner crosses around the picture
  const fw = p.asp * p.scale, fh = p.scale, tl = toScreen(-fw / 2 + view.px, fh / 2 + view.py, 0, false), br = toScreen(fw / 2 + view.px, -fh / 2 + view.py, 0, false), pad = 16;
  const L = tl[0] - pad, T = tl[1] - pad, R = br[0] + pad, B = br[1] + pad;
  octx.strokeStyle = col(0.22); octx.lineWidth = 1; octx.beginPath();
  for (let x = L, i = 0; x <= R; x += 9, i++) { const n = i % 5 === 0 ? 8 : 4; octx.moveTo(x, T); octx.lineTo(x, T - n); octx.moveTo(x, B); octx.lineTo(x, B + n); }
  for (let y = T, i = 0; y <= B; y += 9, i++) { const n = i % 5 === 0 ? 8 : 4; octx.moveTo(L, y); octx.lineTo(L - n, y); octx.moveTo(R, y); octx.lineTo(R + n, y); }
  for (const [cx, cy] of [[L, T], [R, T], [L, B], [R, B]]) { octx.moveTo(cx - 9, cy); octx.lineTo(cx + 9, cy); octx.moveTo(cx, cy - 9); octx.lineTo(cx, cy + 9); }
  octx.stroke();
  octx.font = '500 10px ui-monospace,Menlo,Consolas,monospace'; octx.fillStyle = col(0.4);
  octx.textAlign = 'left'; octx.fillText(`${String(cur + 1).padStart(2, '0')} / ${String(pics.length).padStart(2, '0')}   ${p.name}`, L, T - 14);
  octx.textAlign = 'right'; octx.fillText(`DRIFT ${S.drift}`, R, T - 14); octx.textAlign = 'left'; octx.fillText(`${N.toLocaleString('en-US')} PTS`, L, B + 22);
  if (tr.active) {
    const k = U.uT.value, from = pics[cur], to = pics[tr.to], seek = tr.seek || [], n = Math.max(trackers.length, seek.length);
    octx.font = '500 10px ui-monospace,Menlo,Consolas,monospace'; octx.textAlign = 'left';
    for (let i = 0; i < n && (S.track || S.marks); i++) {
      const a = trackers[i % Math.max(1, trackers.length)], b = seek[i % Math.max(1, seek.length)], ang = i * 2.39996, rr = 0.11 * (0.6 + (i % 5) * 0.2);
      const ball = [Math.cos(ang) * rr * to.scale * 1.6, Math.sin(ang) * rr * to.scale, 0];
      const A = a ? trackerWorld(a, from, t) : ball, B = b ? trackerWorld(b, to, t) : ball, e = k < 0.5 ? k * 2 : (k - 0.5) * 2, se = e * e * (3 - 2 * e);
      const w = k < 0.5 ? [A[0] + (ball[0] - A[0]) * se, A[1] + (ball[1] - A[1]) * se, A[2]] : [ball[0] + (B[0] - ball[0]) * se, ball[1] + (B[1] - ball[1]) * se, B[2]];
      const sc = toScreen(w[0], w[1], w[2]), s = 9, q = 4; octx.strokeStyle = col(0.6); octx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const cx = sc[0] + sx * s, cy = sc[1] + sy * s; octx.moveTo(cx - sx * q, cy); octx.lineTo(cx, cy); octx.lineTo(cx, cy - sy * q); }
      octx.stroke(); if (i < 14) { octx.fillStyle = col(0.7); octx.fillText(`${String(i + 1).padStart(2, '0')}  SEEK`, sc[0] + 14, sc[1] - 6); }
    }
    return;
  }
  // scan line
  if (S.scan) { const sy = toScreen(0, U.uScan.value, 0)[1]; octx.strokeStyle = col(0.55); octx.beginPath(); octx.moveTo(L, sy); octx.lineTo(R, sy); octx.stroke(); octx.fillStyle = col(0.7); octx.textAlign = 'right'; octx.fillText(`SCAN ${fmt(U.uScan.value / (fh / 2))}`, R - 4, sy - 5); }
  if (!(S.track || S.links || S.marks)) return;
  const pts = trackers.map((f, i) => { const wd = trackerWorld(f, p, t), sc = toScreen(wd[0], wd[1], wd[2]); return { f, x: sc[0], y: sc[1], wd, i }; });
  // LINKS: each tracker to its two nearest neighbours
  if (S.links) {
    const maxD = (R - L) * 0.3; octx.lineWidth = 1; const seen = new Set();
    for (const a of pts) { const near = pts.filter((b) => b !== a).map((b) => [b, Math.hypot(a.x - b.x, a.y - b.y)]).sort((m, n) => m[1] - n[1]).slice(0, 2);
      for (const [b, d] of near) { if (d > maxD) continue; const key = a.i < b.i ? a.i + '-' + b.i : b.i + '-' + a.i; if (seen.has(key)) continue; seen.add(key); octx.strokeStyle = col(0.5 * (1 - d / maxD)); octx.beginPath(); octx.moveTo(a.x, a.y); octx.lineTo(b.x, b.y); octx.stroke(); } }
  }
  const scanY = S.scan ? toScreen(0, U.uScan.value, 0)[1] : -999;
  pts.forEach((a, k) => {
    const hot = Math.abs(a.y - scanY) < 14 ? 1 : 0, al = 0.55 + 0.45 * hot;
    if (S.track) { const hist = trackHist[k]; hist.push([a.x, a.y]); if (hist.length > 14) hist.shift(); octx.strokeStyle = col(0.28); octx.beginPath(); hist.forEach((q, j) => (j ? octx.lineTo(q[0], q[1]) : octx.moveTo(q[0], q[1]))); octx.stroke();
      octx.strokeStyle = col(al); octx.beginPath(); octx.moveTo(a.x - 4, a.y); octx.lineTo(a.x + 4, a.y); octx.moveTo(a.x, a.y - 4); octx.lineTo(a.x, a.y + 4); octx.stroke(); }
    if (S.marks) {
      const s = 9, q = 4; octx.strokeStyle = col(al); octx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const cx = a.x + sx * s, cy = a.y + sy * s; octx.moveTo(cx - sx * q, cy); octx.lineTo(cx, cy); octx.lineTo(cx, cy - sy * q); }
      octx.stroke();
      if (S.density === 'sparse' || k < 14) { octx.fillStyle = col(0.55 + 0.4 * hot); octx.textAlign = 'left'; const x = (a.f.x - 0.5) * 2, y = (0.5 - a.f.y) * 2, z = (a.wd[3] - 0.5) * 2; octx.fillText(`${String(k + 1).padStart(2, '0')}  ${fmt(x)} ${fmt(y)} ${fmt(z)}`, a.x + 14, a.y - 6); }
    }
  });
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock(); let lastT = 0, rampN = params.has('noramp') ? N : 2048; geo.setDrawRange(0, rampN);
function frame() {
  if (window.__frames) window.__frames.scatter++;
  if (rampN < N) { rampN = Math.min(N, rampN * 2); geo.setDrawRange(0, rampN); }   // first frames: double the drawn points each frame instead of one huge first draw
  const t = clock.getElapsedTime(), dt = Math.min(0.1, t - lastT); lastT = t; clockT = t;
  splashE *= Math.exp(-2.4 * dt);
  if (tr.active) { const k = (performance.now() - tr.t0) / tr.dur; U.uT.value = Math.min(1, k); if (k >= 1) finishTransition(); }
  scanT += dt; const ph = (scanT / 6) % 2, sp = ph < 1 ? ph : 2 - ph, p = pics[cur];
  U.uScan.value = S.scan && p ? (0.5 - sp) * p.scale : -9;
  U.uTime.value = t; U.uDrift.value = S.drift / 100; U.uSplashAmt.value = S.splash / 100; U.uSplashE.value = splashE;
  U.uDepth.value = S.depth / 100; U.uLight.value = S.light ? 1 : 0;
  U.uPtr.value.set(ptr.inside ? ptr.x : 9, ptr.inside ? ptr.y : 9); U.uLine1.value.set(...S.line1); U.uLine2.value.set(...S.line2);
  exposure();
  if (S.light) { const lx = ptr.inside ? ptr.nx : 0.35, ly = ptr.inside ? ptr.ny : 0.45; U.uLightDir.value.set(lx * 1.2, ly * 1.2, 0.8).normalize(); }
  { const L = U.uLightDir.value, tx = S.light ? -L.x : 0.99, ty = S.light ? -L.y : 0.12, n = Math.hypot(tx, ty) || 1; U.uWind.value.x += (tx / n - U.uWind.value.x) * 0.05; U.uWind.value.y += (ty / n - U.uWind.value.y) * 0.05; U.uWind.value.normalize(); }   // the fading side is the one away from the light
  // gentle parallax tilt that grows with the DEPTH slider
  const tx = ptr.inside && !drag ? ptr.ny * -0.12 : 0, ty = ptr.inside && !drag ? ptr.nx * 0.16 : 0, dk = S.depth / 100;
  tiltX += (tx * dk - tiltX) * 0.06; tiltY += (ty * dk - tiltY) * 0.06;
  if (!drag) { view.ry += view.vx * dt * 60; view.rx = Math.max(-1.4, Math.min(1.4, view.rx + view.vy * dt * 60)); const damp = Math.exp(-10 * dt); view.vx *= damp; view.vy *= damp; if (Math.abs(view.vx) < 0.0003) view.vx = 0; if (Math.abs(view.vy) < 0.0003) view.vy = 0; }
  if (view.resetting) { const k = 1 - Math.exp(-7 * dt); view.rx -= view.rx * k; view.ry -= view.ry * k; view.px -= view.px * k; view.py -= view.py * k; view.tz += (8.03 - view.tz) * k; if (Math.abs(view.rx) + Math.abs(view.ry) + Math.abs(view.px) + Math.abs(view.py) < 0.004) { view.rx = view.ry = view.px = view.py = 0; view.tz = 8.03; view.resetting = false; } }
  camera.position.z += (view.tz - camera.position.z) * (1 - Math.exp(-9 * dt));
  group.rotation.set(tiltX + view.rx, tiltY + view.ry, 0); group.position.set(view.px, view.py, 0);
  const paper = paperHex();
  if (S.trails && trailRT) {
    renderer.setRenderTarget(trailRT); renderer.autoClear = false; renderer.render(fadeScene, orthoCam); renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.autoClear = true; renderer.setClearColor(paper, 1); copyMat.map = trailRT.texture; renderer.render(copyScene, orthoCam);
  } else { renderer.setRenderTarget(null); renderer.autoClear = true; renderer.setClearColor(paper, 1); renderer.render(scene, camera); }
  drawOverlay(t);
}

// ---------------------------------------------------------------- boot
setBlend(); resize(); sync(); setLight(false);
for (const [i, name] of [[0, 'ORB'], [2, 'TAIJI'], [1, 'RIPPLE'], [3, 'GLYPH']]) pics.push(buildPic(drawDemo(i), name, true));
showCurrent(); startTransitionFromScatter();
renderer.setAnimationLoop(frame);
window.__scatterApp = { start() { renderer.setAnimationLoop(frame); }, stop() { renderer.setAnimationLoop(null); } };   // site.js pauses this while BodyBeat is open
function stats() {                                         // render once, read the real pixels back, summarise
  frame(); const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, buf = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const p0 = S.paper === 'black' ? 0 : 0.945; let mass = 0, lit = 0, sx = 0, sy = 0, sxx = 0, syy = 0, left = 0, right = 0, rowMax = new Float64Array(h), rs = 0, gs = 0, bs = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { const o = (y * w + x) * 4, l = (buf[o] + buf[o + 1] + buf[o + 2]) / 765, ink = Math.abs(l - p0); if (ink > 0.02) { mass += ink; if (ink > 0.08) lit++; sx += ink * x; sy += ink * y; sxx += ink * x * x; syy += ink * y * y; if (x < w / 2) left += ink; else right += ink; rowMax[y] += ink; rs += buf[o] * ink; gs += buf[o + 1] * ink; bs += buf[o + 2] * ink; } }
  const mx = sx / mass, my = sy / mass; let bestRow = 0; for (let y = 0; y < h; y++) if (rowMax[y] > rowMax[bestRow]) bestRow = y;
  return { mass: Math.round(mass), lit, cx: Math.round(mx), cy: Math.round(my), spreadX: Math.round(Math.sqrt(Math.max(0, sxx / mass - mx * mx))), spreadY: Math.round(Math.sqrt(Math.max(0, syy / mass - my * my))), spread: Math.round(Math.sqrt(Math.max(0, sxx / mass - mx * mx) + Math.max(0, syy / mass - my * my))), left: Math.round(left), right: Math.round(right), bestRow: h - bestRow, rgb: [Math.round(rs / mass), Math.round(gs / mass), Math.round(bs / mass)] };
}
function grid() {                                          // coarse brightness map of the current frame
  frame(); const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, buf = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const gw = 64, gh = 40, out = new Float32Array(gw * gh); for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) { const o = (y * w + x) * 4; out[Math.min(gh - 1, Math.floor(y / h * gh)) * gw + Math.min(gw - 1, Math.floor(x / w * gw))] += (buf[o] + buf[o + 1] + buf[o + 2]) / 765; }
  return out;
}
async function motion(ms) { const a = grid(); await new Promise((r) => setTimeout(r, ms)); const b = grid(); let d = 0, m = 0; for (let i = 0; i < a.length; i++) { d += Math.abs(a[i] - b[i]); m += a[i]; } return d / Math.max(1, m); }
function fidelity(cells = 64) {                              // how closely the drawn points reproduce the source picture's tones
  frame(); const p = pics[cur], gl = renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, buf = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const fw = p.asp * p.scale, fh = p.scale, tl = toScreen(-fw / 2, fh / 2, 0, false), br = toScreen(fw / 2, -fh / 2, 0, false);
  const x0 = Math.round(tl[0] * DPR), x1 = Math.round(br[0] * DPR), y0 = Math.round(H - br[1] * DPR), y1 = Math.round(H - tl[1] * DPR);
  const out = new Float64Array(cells * cells), cnt = new Float64Array(cells * cells), src = new Float64Array(cells * cells), sc = new Float64Array(cells * cells);
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
    const o = (y * W + x) * 4, cx = Math.min(cells - 1, Math.floor((x - x0) / (x1 - x0) * cells)), cy = Math.min(cells - 1, Math.floor((y1 - 1 - y) / (y1 - y0) * cells));
    out[cy * cells + cx] += (buf[o] + buf[o + 1] + buf[o + 2]) / 765; cnt[cy * cells + cx]++;
  }
  for (let y = 0; y < p.gh; y++) for (let x = 0; x < p.gw; x++) { const cx = Math.min(cells - 1, Math.floor(x / p.gw * cells)), cy = Math.min(cells - 1, Math.floor(y / p.gh * cells)); src[cy * cells + cx] += p.gray[y * p.gw + x]; sc[cy * cells + cx]++; }
  const a = [], b = []; for (let i = 0; i < cells * cells; i++) if (cnt[i] > 0 && sc[i] > 0) { a.push(out[i] / cnt[i]); b.push(src[i] / sc[i]); }
  const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n; let sab = 0, saa = 0, sbb = 0, ae = 0;
  const k = (() => { let num = 0, den = 0; for (let i = 0; i < n; i++) { num += a[i] * b[i]; den += b[i] * b[i]; } return num / Math.max(den, 1e-9); })();      // best brightness scale
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; ae += Math.abs(a[i] - k * b[i]); }
  let leak = 0, lc = 0, hi = 0; for (let i = 0; i < n; i++) { if (b[i] < 0.01) { leak += a[i]; lc++; } if (b[i] > 0.97) hi = Math.max(hi, a[i]); }   // light spilled onto pure black, relative to full white
  return { corr: +(sab / Math.sqrt(saa * sbb + 1e-12)).toFixed(4), mae: +(ae / n).toFixed(4), meanOut: +ma.toFixed(3), meanSrc: +mb.toFixed(3), leak: +(lc ? leak / lc / Math.max(hi, 1e-3) : 0).toFixed(4), white: +hi.toFixed(3), cells: n };
}
window.__g = { fidelity, view, stats, grid, motion, S, U, pics, get cur() { return cur; }, get tr() { return tr; }, get trackers() { return trackers; }, goTo, setPaper, setLight, addFiles, sync, refreshMode, buildTrackers, get splashE() { return splashE; }, ready: true };
