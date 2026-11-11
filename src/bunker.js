(() => {
'use strict';
const T = THREE;
const $ = id => document.getElementById(id);

// ───────────────────────── утилиты
let seed = 20260511;
function rnd() { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const rr = (a, b) => a + rnd() * (b - a);
const R = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const pick = a => a[(rnd() * a.length) | 0];
const ang = a => Math.atan2(Math.sin(a), Math.cos(a));

// ───────────────────────── карта 23×19
const CS = 3, WH = 3;
const MAP = [
  '#######################',
  '#1.L..b#.F....c#c....B#',
  '#......#r......#...M..#',
  '#......#...N...#......#',
  '#......#......c#.r..c.#',
  '###.#######.#######.###',
  '#....L.....L.....L....#',
  '####.######.######.####',
  '#~~~.L..#.L...#....b..#',
  '#~~~....#r....#c......#',
  '#~~~...F#.....#......2#',
  '#~~~...c#..P.A#.BA....#',
  '####.######.######.####',
  '#.L........L........L.#',
  '####.###########.######',
  '#3~~~~~r~#.F........L.#',
  '#~~~~~~~~c#...r.......#',
  '#~~~~N~~~~#c..........#',
  '##################E####',
];
const H = MAP.length, W = MAP[0].length;
const solid = (x, z) => x < 0 || z < 0 || x >= W || z >= H || MAP[z][x] === '#' || MAP[z][x] === 'E';
const wetAt = (x, z) => !solid(x, z) && MAP[z][x] === '~';
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const cw = c => (c + .5) * CS;
const cellOf = v => Math.floor(v / CS);
const floorCells = [], waterCells = [];
for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (!solid(x, z)) { floorCells.push([x, z]); if (MAP[z][x] === '~') waterCells.push([x, z]); }

function field(tx, tz) {
  const f = new Int16Array(W * H).fill(-1), q = [tx + tz * W];
  f[q[0]] = 0;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % W, z = (c / W) | 0;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx, nz = z + dz;
      if (solid(nx, nz)) continue;
      const n = nx + nz * W;
      if (f[n] < 0) { f[n] = f[c] + 1; q.push(n); }
    }
  }
  return f;
}
const boxes = [];
function pushOut(p, r, x0, z0, x1, z1) {
  const nx = clamp(p.x, x0, x1), nz = clamp(p.z, z0, z1);
  const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  if (d2 > 1e-9) { const d = Math.sqrt(d2); p.x = nx + dx / d * r; p.z = nz + dz / d * r; return; }
  const l = p.x - x0, ri = x1 - p.x, tp = p.z - z0, bt = z1 - p.z, m = Math.min(l, ri, tp, bt);
  if (m === l) p.x = x0 - r; else if (m === ri) p.x = x1 + r; else if (m === tp) p.z = z0 - r; else p.z = z1 + r;
}
function collide(p, r, props) {
  const cx = cellOf(p.x), cz = cellOf(p.z);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const x = cx + dx, z = cz + dz;
    if (solid(x, z)) pushOut(p, r, x * CS, z * CS, (x + 1) * CS, (z + 1) * CS);
  }
  if (props) for (const b of boxes) pushOut(p, r, b[0], b[1], b[2], b[3]);
}

// ───────────────────────── процедурные текстуры
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return [c, c.getContext('2d')]; }
function grain(g, amt) {
  const id = g.getImageData(0, 0, g.canvas.width, g.canvas.height), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - .5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(id, 0, 0);
}
function blot(g, n, rgb, rmin, rmax, a, y0 = 0, y1 = 1) {
  const w = g.canvas.width, h = g.canvas.height;
  for (let i = 0; i < n; i++) {
    const x = R(0, w), y = R(y0 * h, y1 * h), r = R(rmin, rmax), gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},${a * R(.4, 1)})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
function cracks(g, n, col, len) {
  g.strokeStyle = col;
  for (let i = 0; i < n; i++) {
    let x = R(0, g.canvas.width), y = R(0, g.canvas.height), a = R(0, 6.28);
    g.lineWidth = R(.5, 1.7); g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < len; k++) { a += R(-.7, .7); x += Math.cos(a) * 7; y += Math.sin(a) * 7; g.lineTo(x, y); }
    g.stroke();
  }
}
function tex(c, rx = 1, ry = 1) {
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function wallTex() { // бетонные панели: сырость, ржавые потёки, плесень, разметка
  const [c, g] = cv(512);
  g.fillStyle = '#6e6c62'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(30,30,26,.55)'; g.lineWidth = 5;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 512); g.stroke(); }
  g.beginPath(); g.moveTo(0, 256); g.lineTo(512, 256); g.stroke();
  g.fillStyle = '#57554c'; g.fillRect(0, 470, 512, 42);
  g.fillStyle = 'rgba(150,120,30,.45)';
  for (let i = 0; i < 6; i++) g.fillRect(i * 96 + 10, 420, 44, 26);
  blot(g, 70, '34,36,26', 20, 110, .45);
  blot(g, 30, '90,52,16', 10, 60, .5);
  blot(g, 24, '12,20,10', 20, 90, .5, .6, 1);
  for (let i = 0; i < 30; i++) {
    const x = R(0, 512), y = R(0, 200), l = R(50, 300), gr = g.createLinearGradient(0, y, 0, y + l);
    gr.addColorStop(0, 'rgba(96,52,14,.45)'); gr.addColorStop(1, 'rgba(96,52,14,0)');
    g.fillStyle = gr; g.fillRect(x, y, R(1.5, 5), l);
  }
  cracks(g, 10, 'rgba(20,20,16,.7)', 14);
  grain(g, 34);
  return tex(c);
}
function floorTex() { // бетон с решётками стоков
  const [c, g] = cv(512);
  g.fillStyle = '#56544c'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(26,26,22,.8)'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(256, 0); g.lineTo(256, 512); g.moveTo(0, 256); g.lineTo(512, 256); g.stroke();
  for (let i = 0; i < 4; i++) {
    const x = R(0, 440), y = R(0, 440);
    g.fillStyle = '#2a2926'; g.fillRect(x, y, 52, 52);
    g.strokeStyle = '#151514'; g.lineWidth = 5;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(x + 4 + k * 11, y + 4); g.lineTo(x + 4 + k * 11, y + 48); g.stroke(); }
  }
  blot(g, 60, '24,22,16', 20, 110, .5);
  blot(g, 26, '14,18,16', 30, 130, .5);
  cracks(g, 12, 'rgba(18,18,15,.8)', 12);
  grain(g, 38);
  return tex(c, W, H);
}
function ceilTex() {
  const [c, g] = cv(512);
  g.fillStyle = '#484740'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#141412'; g.lineWidth = 5;
  for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * 256, 0); g.lineTo(i * 256, 512); g.moveTo(0, i * 256); g.lineTo(512, i * 256); g.stroke(); }
  for (let i = 0; i < 8; i++) {
    const y = R(0, 512), gr = g.createLinearGradient(0, y, 0, y + 10);
    gr.addColorStop(0, 'rgba(20,20,18,.9)'); gr.addColorStop(1, 'rgba(60,55,40,.5)');
    g.fillStyle = gr; g.fillRect(0, y, 512, R(4, 11));
  }
  blot(g, 40, '12,12,10', 20, 90, .5);
  grain(g, 28);
  return tex(c, W, H);
}
function waterTex() {
  const [c, g] = cv(256);
  g.fillStyle = '#1d2a26'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(${R(90, 150) | 0},${R(120, 170) | 0},${R(115, 155) | 0},${R(.05, .22)})`;
    g.lineWidth = R(1, 3.5);
    const y = R(0, 256), x = R(0, 256);
    g.beginPath(); g.moveTo(0, y);
    g.bezierCurveTo(x, y + R(-18, 18), x + 60, y + R(-18, 18), 256, y + R(-10, 10));
    g.stroke();
  }
  blot(g, 40, '8,12,10', 10, 60, .5);
  return tex(c, 1, 1);
}
function paintTex(rgb, rust) { // крашеный металл: шкафчики, дизели, трубы
  const [c, g] = cv(256);
  g.fillStyle = rgb; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 4;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); }
  blot(g, 24 + rust * 90, '104,48,16', 6, 42, .65);
  blot(g, 18, '40,22,10', 6, 34, .5);
  for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(220,220,210,.13)'; g.lineWidth = R(.5, 1.3); const x = R(0, 256), y = R(0, 256); g.beginPath(); g.moveTo(x, y); g.lineTo(x + R(-30, 30), y + R(-6, 6)); g.stroke(); }
  grain(g, 30);
  return tex(c);
}
function woodTex() {
  const [c, g] = cv(256);
  g.fillStyle = '#4a3a26'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 160; i++) {
    g.strokeStyle = `rgba(${R(12, 96) | 0},${R(10, 60) | 0},${R(6, 30) | 0},.4)`; g.lineWidth = R(.5, 2.4);
    const y = R(0, 256); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(80, y + R(-6, 6), 170, y + R(-6, 6), 256, y + R(-4, 4)); g.stroke();
  }
  g.fillStyle = '#100c08'; for (let i = 1; i < 4; i++) g.fillRect(0, i * 64 - 2, 256, 4);
  blot(g, 16, '10,8,5', 10, 50, .6);
  grain(g, 26);
  return tex(c);
}
function skinTex() { // мокрая серая кожа слепого
  const [c, g] = cv(256);
  g.fillStyle = '#8d9188'; g.fillRect(0, 0, 256, 256);
  blot(g, 46, '54,62,58', 10, 54, .55);
  blot(g, 26, '170,180,172', 8, 34, .5);
  blot(g, 14, '66,20,16', 6, 24, .55);
  for (let i = 0; i < 34; i++) {
    let x = R(0, 256), y = R(0, 256), a = R(0, 6.28);
    g.strokeStyle = `rgba(${R(40, 80) | 0},${R(50, 90) | 0},${R(45, 80) | 0},.55)`; g.lineWidth = R(.6, 2.2);
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 16; k++) { a += R(-.6, .6); x += Math.cos(a) * 6; y += Math.sin(a) * 6; g.lineTo(x, y); }
    g.stroke();
  }
  grain(g, 26);
  return tex(c, 2, 2);
}
function panelTex() { // пульт дизеля
  const [c, g] = cv(256, 256);
  g.fillStyle = '#3f4a3c'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#20241f'; g.fillRect(18, 18, 220, 150);
  g.strokeStyle = '#6d6f66'; g.lineWidth = 4; g.strokeRect(18, 18, 220, 150);
  g.fillStyle = '#cfd3c4'; g.beginPath(); g.arc(74, 92, 40, 0, 6.28); g.fill();
  g.strokeStyle = '#22261f'; g.lineWidth = 4; g.stroke();
  g.beginPath(); g.moveTo(74, 92); g.lineTo(74 + Math.cos(3.9) * 30, 92 + Math.sin(3.9) * 30); g.stroke();
  g.font = 'bold 22px Arial'; g.fillStyle = '#d8b04a'; g.fillText('ДИЗЕЛЬ', 140, 70);
  g.fillStyle = '#8d9382'; g.font = '16px Arial'; g.fillText('Д-6', 140, 96);
  g.fillStyle = '#c23b22'; g.fillRect(140, 116, 26, 26);
  g.fillStyle = '#3ab54a'; g.fillRect(176, 116, 26, 26);
  blot(g, 30, '104,48,16', 6, 40, .6); blot(g, 20, '14,14,12', 8, 40, .5);
  grain(g, 28);
  return tex(c);
}
function liftTex() {
  const [c, g] = cv(256, 512);
  g.fillStyle = '#4c4f48'; g.fillRect(0, 0, 256, 512);
  g.fillStyle = '#2e312c'; g.fillRect(0, 0, 256, 60);
  blot(g, 40, '104,48,16', 8, 46, .6);
  grain(g, 28);
  const t = tex(c); t.wrapS = t.wrapT = T.ClampToEdgeWrapping; return t;
}
function signTex(ok) {
  const [c, g] = cv(256, 64);
  g.fillStyle = '#050505'; g.fillRect(0, 0, 256, 64);
  g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = g.fillStyle = ok ? '#4dff7a' : '#ff2a1c'; g.shadowBlur = 14;
  g.fillText('ЛИФТ', 128, 34);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
const RED = () => `rgba(${R(88, 128) | 0},${R(4, 12) | 0},${R(4, 10) | 0},${R(.75, .95)})`;
function bloodDecal() {
  const [c, g] = cv(256);
  const cx = R(90, 166), cy = R(70, 130);
  for (let i = 0; i < 90; i++) {
    const a = R(0, 6.28), d = Math.pow(Math.random(), 1.8) * 110, r = R(1.5, 20) * (1 - d / 150);
    g.fillStyle = RED(); g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * .8, Math.max(1, r), 0, 6.28); g.fill();
  }
  for (let i = 0; i < 9; i++) { const x = cx + R(-50, 50), w = R(2.5, 6), l = R(30, 120); g.fillStyle = RED(); g.fillRect(x, cy, w, l); g.beginPath(); g.arc(x + w / 2, cy + l, w * .8, 0, 6.28); g.fill(); }
  return c;
}
function handDecal() {
  const [c, g] = cv(256);
  for (let h = 0; h < 2; h++) {
    g.save(); g.translate(80 + h * 95, 95 + R(-15, 25)); g.rotate(R(-.35, .35)); g.fillStyle = RED();
    g.beginPath(); g.ellipse(0, 0, 26, 30, 0, 0, 6.28); g.fill();
    for (let f = 0; f < 4; f++) { g.save(); g.rotate(-.42 + f * .28); g.beginPath(); g.ellipse(0, -52, 6.5, 22, 0, 0, 6.28); g.fill(); g.restore(); }
    g.save(); g.rotate(h ? 1.25 : -1.25); g.beginPath(); g.ellipse(0, -36, 7, 17, 0, 0, 6.28); g.fill(); g.restore();
    const gr = g.createLinearGradient(0, 0, 0, 150); gr.addColorStop(0, 'rgba(98,6,6,.55)'); gr.addColorStop(1, 'rgba(98,6,6,0)');
    g.fillStyle = gr; g.fillRect(-24, 0, 48, 150);
    g.restore();
  }
  return c;
}
function textDecal(str) {
  const [c, g] = cv(512, 256), lines = str.split('|');
  g.textBaseline = 'middle';
  lines.forEach((ln, li) => {
    const size = Math.min(78, 470 / ln.length * 1.4);
    g.font = `bold ${size}px "Courier New", monospace`;
    let x = (512 - g.measureText(ln).width) / 2;
    const y = 256 * (li + .5) / lines.length;
    for (const ch of ln) {
      const w = g.measureText(ch).width;
      g.save(); g.translate(x + w / 2, y + R(-6, 6)); g.rotate(R(-.12, .12)); g.fillStyle = RED(); g.fillText(ch, -w / 2, 0); g.restore();
      if (Math.random() < .3 && ch !== ' ') { g.fillStyle = RED(); g.fillRect(x + w * R(.3, .7), y + size * .2, R(2, 4), R(14, 55)); }
      x += w;
    }
  });
  return c;
}
function stencilDecal(str) { // трафаретная надпись
  const [c, g] = cv(512, 128);
  g.textBaseline = 'middle'; g.font = 'bold 62px "Courier New", monospace';
  g.fillStyle = 'rgba(206,196,150,.82)';
  const w = g.measureText(str).width;
  g.fillText(str, (512 - w) / 2, 68);
  const id = g.getImageData(0, 0, 512, 128), d = id.data;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0 && Math.random() < .35) d[i] *= R(.2, .7);
  g.putImageData(id, 0, 0);
  return c;
}
function tallyDecal() {
  const [c, g] = cv(256);
  g.strokeStyle = 'rgba(210,205,180,.7)'; g.lineWidth = 3; g.lineCap = 'round';
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) {
    const x0 = 22 + k * 56, y0 = 30 + r * 56;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(x0 + i * 9 + R(-2, 2), y0); g.lineTo(x0 + i * 9 + R(-2, 2), y0 + 36); g.stroke(); }
    g.beginPath(); g.moveTo(x0 - 6, y0 + 28); g.lineTo(x0 + 36, y0 + 6); g.stroke();
  }
  return c;
}
function glowTex() {
  const [c, g] = cv(64), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(c);
}
// ===== часть 1 =====

// ───────────────────────── рендер и сцена
const canvas = $('c');
const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;
const scene = new T.Scene();
scene.background = new T.Color(0x000000);
scene.fog = new T.FogExp2(0x03060a, .062);
const camera = new T.PerspectiveCamera(76, 1, .05, 70);
camera.rotation.order = 'YXZ';
scene.add(camera);
scene.add(new T.HemisphereLight(0x2f3d44, 0x14120c, .24));

const std = o => new T.MeshStandardMaterial(o);
const tWall = wallTex(), tFloor = floorTex(), tCeil = ceilTex(), tWater = waterTex(), tWood = woodTex(), tSkin = skinTex(), tGlow = glowTex();
const tPaint = paintTex('#44523f', .3), tRust = paintTex('#5b4a3a', 1), tPanel = panelTex();
const mWall = std({ map: tWall, bumpMap: tWall, bumpScale: 1.7, roughness: .94 });
const mFloor = std({ map: tFloor, bumpMap: tFloor, bumpScale: 1.2, roughness: .68, metalness: .04 });
const mCeil = std({ map: tCeil, bumpMap: tCeil, bumpScale: 1, roughness: 1 });
const mMetal = std({ map: tPaint, bumpMap: tPaint, bumpScale: .5, roughness: .5, metalness: .65 });
const mRust = std({ map: tRust, bumpMap: tRust, bumpScale: 1.4, roughness: .85, metalness: .3 });
const mWood = std({ map: tWood, bumpMap: tWood, bumpScale: 1.2, roughness: .92 });
const mDark = std({ color: 0x040505, roughness: 1 });
const mWater = std({ map: tWater, transparent: true, opacity: .92, roughness: .1, metalness: .35, color: 0x9fb4b2, emissive: 0x0d1c1c });

function M(geo, mat, x, y, z, parent) { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; }
const Box = (w, h, d) => new T.BoxGeometry(w, h, d);
const Cyl = (r1, r2, h, s = 12) => new T.CylinderGeometry(r1, r2, h, s);
const Sph = (r, a = 16, b = 12) => new T.SphereGeometry(r, a, b);
{
  const g = new T.PlaneGeometry(W * CS, H * CS);
  const f = new T.Mesh(g, mFloor); f.rotation.x = -Math.PI / 2; f.position.set(W * CS / 2, 0, H * CS / 2); f.receiveShadow = true; scene.add(f);
  const c = new T.Mesh(g, mCeil); c.rotation.x = Math.PI / 2; c.position.set(W * CS / 2, WH, H * CS / 2); c.receiveShadow = true; scene.add(c);
}
{
  // стены; клетка лифта остаётся пустой — там шахта
  const cells = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++)
    if (solid(x, z) && MAP[z][x] !== 'E' && DIRS.some(([dx, dz]) => !solid(x + dx, z + dz))) cells.push([x, z]);
  const im = new T.InstancedMesh(Box(CS, WH, CS), mWall, cells.length);
  const m4 = new T.Matrix4(), col = new T.Color();
  cells.forEach(([x, z], i) => {
    m4.makeTranslation(cw(x), WH / 2, cw(z)); im.setMatrixAt(i, m4);
    const v = rr(.68, .98); col.setRGB(v, v * rr(.95, 1), v * rr(.9, 1)); im.setColorAt(i, col);
  });
  im.castShadow = im.receiveShadow = true; scene.add(im);
}
{
  const im = new T.InstancedMesh(new T.PlaneGeometry(CS, CS), mWater, waterCells.length);
  const m4 = new T.Matrix4(), q = new T.Quaternion().setFromEuler(new T.Euler(-Math.PI / 2, 0, 0)), one = new T.Vector3(1, 1, 1);
  waterCells.forEach(([x, z], i) => { m4.compose(new T.Vector3(cw(x), .11, cw(z)), q, one); im.setMatrixAt(i, m4); });
  scene.add(im);
}

// ───────────────────────── пропсы
const wallDir = (x, z) => DIRS.filter(([dx, dz]) => solid(x + dx, z + dz) && MAP[z + dz][x + dx] !== 'E');
const faceRot = (dx, dz) => Math.atan2(-dx, -dz); // локальная -Z смотрит в стену
function place(obj, x, z, depth, hw, off = 0) {
  const ds = wallDir(x, z); if (!ds.length) return null;
  const [dx, dz] = pick(ds), k = CS / 2 - depth / 2 - .06 - off;
  obj.position.set(cw(x) + dx * k, 0, cw(z) + dz * k);
  obj.rotation.y = faceRot(dx, dz);
  scene.add(obj);
  const ex = dx ? depth / 2 : hw, ez = dx ? hw : depth / 2;
  boxes.push([obj.position.x - ex, obj.position.z - ez, obj.position.x + ex, obj.position.z + ez]);
  return { dx, dz };
}
function bunkBed() {
  const g = new T.Group();
  const matt = std({ color: 0x2f3a33, roughness: 1 });
  for (const y of [.45, 1.15]) {
    M(Box(2, .07, .9), mMetal, 0, y, 0, g);
    M(Box(1.92, .1, .8), matt, 0, y + .09, 0, g);
    for (const sz of [-1, 1]) M(Cyl(.022, .022, .86), mMetal, -.75, y - .42, sz * .43, g).rotation.x = Math.PI / 2;
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) M(Cyl(.032, .032, 1.35), mMetal, sx * .98, .675, sz * .43, g);
  for (const x of [-.3, .4]) M(Box(.1, .06, .84), mRust, x, 1.26, 0, g);
  return g;
}
function locker() {
  const g = new T.Group();
  M(Box(.8, 1.95, .5), mMetal, 0, .975, 0, g);
  M(Box(.82, .06, .52), mRust, 0, 1.96, 0, g);
  for (let i = 0; i < 5; i++) M(Box(.34, .015, .015), mDark, .12, 1.5 - i * .07, .25, g);
  const hinge = new T.Group(); hinge.position.set(-.38, 1.05, .245); g.add(hinge);
  M(Box(.74, 1.9, .03), mMetal, .37, 0, 0, hinge);
  M(Box(.26, .03, .02), mRust, .55, .1, .02, hinge);
  M(Box(.05, .16, .04), mRust, .6, 0, .03, hinge);
  M(Box(.06, .03, .03), mRust, -.34, 0, .02, g);
  hinge.rotation.y = -1.2;
  return { g, hinge };
}
function crate() {
  const g = new T.Group();
  M(Box(.8, .7, .8), mWood, 0, .35, 0, g);
  for (const y of [.06, .64]) M(Box(.84, .06, .84), mRust, 0, y, 0, g);
  M(Box(.5, .06, .1), mRust, 0, .35, .42, g);
  return g;
}
function generator() { // дизель: корпус, пульт, рычаг, выхлоп, лампа
  const g = new T.Group();
  M(Box(1.15, 1.0, .7), mMetal, 0, .5, 0, g);
  M(Box(1.2, .12, .75), mRust, 0, 1.05, 0, g);
  M(Box(.9, .55, .04), std({ map: tPanel, roughness: .6 }), 0, .62, .36, g);
  M(Box(1.0, .1, .8), mDark, 0, .07, 0, g);
  M(Cyl(.09, .11, 1.5, 12), mRust, -.42, 1.7, -.18, g);
  M(Cyl(.16, .16, .12, 12), mRust, -.42, 2.5, -.18, g);
  M(Cyl(.09, .09, .3, 12), mRust, -.42, 2.62, -.02, g).rotation.z = Math.PI / 2;
  M(Cyl(.14, .14, .18, 12), mMetal, .4, 1.14, .1, g);
  const lever = new T.Group(); lever.position.set(.34, .45, .36); g.add(lever);
  M(Cyl(.022, .022, .5, 8), mRust, 0, .22, .06, lever);
  M(Sph(.05, 10, 8), std({ color: 0x8a1f14, roughness: .5 }), 0, .46, .1, lever);
  lever.rotation.x = -.9;
  const lamp = M(Sph(.045, 10, 8), new T.MeshBasicMaterial({ color: 0x241206 }), .5, 1.14, .34, g);
  lamp.castShadow = false;
  const light = new T.PointLight(0xffb040, 0, 5, 1.8); light.position.set(.5, 1.35, .5); g.add(light);
  return { g, lever, lamp, light };
}
function boltCrate() {
  const g = new T.Group();
  M(Box(.44, .3, .34), mWood, 0, .15, 0, g);
  M(Box(.45, .05, .35), mRust, 0, .31, 0, g);
  for (let i = 0; i < 7; i++) { const b = M(Cyl(.012, .012, .18, 6), mMetal, R(-.14, .14), .38, R(-.1, .1), g); b.rotation.set(R(-1.5, 1.5), R(0, 6.28), R(-1.5, 1.5)); }
  return g;
}

// ───────────────────────── надписи и мусор на стенах
const decalMats = [];
{
  const mk = c => { const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return std({ map: t, transparent: true, depthWrite: false, roughness: .6, polygonOffset: true, polygonOffsetFactor: -4 }); };
  const bloods = [];
  for (let i = 0; i < 4; i++) bloods.push([mk(bloodDecal()), 1.5, 1.5]);
  for (let i = 0; i < 2; i++) decalMats.push([mk(handDecal()), 1.1, 1.1]);
  for (const s of ['ОНО СЛЫШИТ', 'НЕ БЕГИ|ПО ВОДЕ', 'ТИШЕ', 'ОНО|РЯДОМ', 'ВЫХОДА|НЕТ']) decalMats.push([mk(textDecal(s)), 2.1, 1.05]);
  for (const s of ['СЕКТОР 7', 'НЕ ВХОДИТЬ', 'ОБЪЕКТ 7', 'АВАРИЙНЫЙ', 'Д-6']) decalMats.push([mk(stencilDecal(s)), 2.4, .6]);
  decalMats.push([mk(tallyDecal()), 1, 1]);
  for (const [x, z] of floorCells) {
    for (const [dx, dz] of wallDir(x, z)) if (rnd() < .26 && MAP[z + dz][x + dx] !== 'E') {
      const [m, w, h] = pick(decalMats), p = new T.Mesh(new T.PlaneGeometry(w, h), m);
      p.position.set(cw(x) + dx * (CS / 2 - .013) + (dz ? rr(-.5, .5) : 0), rr(1.1, 1.9), cw(z) + dz * (CS / 2 - .013) + (dx ? rr(-.5, .5) : 0));
      p.rotation.y = faceRot(dx, dz); p.receiveShadow = true; scene.add(p);
    }
    if (rnd() < .12) {
      const [m] = pick(bloods), s = rr(1, 2.2), p = new T.Mesh(new T.PlaneGeometry(s, s), m);
      p.rotation.x = -Math.PI / 2; p.rotation.z = rr(0, 6.28);
      p.position.set(cw(x) + rr(-.5, .5), .013, cw(z) + rr(-.5, .5)); p.receiveShadow = true; scene.add(p);
    }
    if (rnd() < .34) { // трубы под потолком
      const ds = wallDir(x, z); if (!ds.length) continue;
      const [dx, dz] = pick(ds), p = M(Cyl(.07, .07, CS, 10), mRust, cw(x) + dx * (CS / 2 - .17), WH - .22, cw(z) + dz * (CS / 2 - .17), scene);
      if (dx) p.rotation.x = Math.PI / 2; else p.rotation.z = Math.PI / 2;
      if (rnd() < .6) { const q = M(Cyl(.035, .035, CS, 8), mRust, p.position.x - dx * .16, WH - .13, p.position.z - dz * .16, scene); q.rotation.copy(p.rotation); }
    }
  }
}

// ───────────────────────── предметы, свет, точки
const lamps = [], items = [], gens = [], lockers = [], bolts = [];
let start = [11, 11], monStart = [19, 2], exitDoor = null, promptText = '';
const mFuel = std({ color: 0x8a3222, metalness: .5, roughness: .45, emissive: 0x2a0a04 });
const mBolt = std({ color: 0x9aa0a2, metalness: .9, roughness: .35 });
const mGreen = std({ color: 0x3d6b3a, metalness: .4, roughness: .5, emissive: 0x0d2a10 });
function glow(color, s) { const sp = new T.Sprite(new T.SpriteMaterial({ map: tGlow, color, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: .7 })); sp.scale.setScalar(s); return sp; }
function fuelModel() {
  const g = new T.Group(), k = new T.Group(); g.add(k);
  M(Box(.26, .34, .14), mFuel, 0, 0, 0, k);
  M(Box(.1, .04, .1), mFuel, 0, .2, 0, k);
  M(Box(.04, .1, .16), mFuel, 0, .12, 0, k);
  M(Cyl(.03, .03, .06, 8), mMetal, .07, .19, 0, k);
  M(Box(.2, .05, .02), std({ color: 0xd8cfc0, roughness: .8 }), 0, 0, .075, k);
  k.rotation.z = .5; k.scale.setScalar(1.3); g.add(glow(0xff8a3a, .85));
  return g;
}
function batteryModel() {
  const g = new T.Group(), k = new T.Group(); g.add(k);
  M(Cyl(.035, .035, .13, 12), mGreen, 0, 0, 0, k);
  M(Cyl(.035, .035, .03, 12), mMetal, 0, .08, 0, k);
  M(Cyl(.012, .012, .02, 8), mMetal, 0, .105, 0, k);
  k.rotation.z = .6; k.scale.setScalar(1.5); g.add(glow(0x50ff70, .6));
  return g;
}
function noteModel() {
  const [c, x] = cv(128, 160); x.fillStyle = '#b9b09a'; x.fillRect(0, 0, 128, 160);
  x.fillStyle = 'rgba(35,30,20,.75)'; for (let i = 0; i < 11; i++) x.fillRect(12, 16 + i * 12, R(50, 100), 2);
  blot(x, 8, '90,60,20', 10, 40, .5); blot(x, 3, '90,5,5', 8, 22, .8);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
  const g = new T.Group(), p = new T.Mesh(new T.PlaneGeometry(.26, .33), std({ map: t, emissive: 0x24231c, side: T.DoubleSide, roughness: 1 }));
  p.rotation.x = -.5; g.add(p); g.add(glow(0xd8d0b0, .5));
  return g;
}
function boltModel() {
  const g = new T.Group();
  M(Cyl(.013, .013, .17, 6), mBolt, 0, 0, 0, g).rotation.x = Math.PI / 2;
  M(Cyl(.02, .02, .03, 6), mBolt, 0, 0, .08, g).rotation.x = Math.PI / 2;
  g.traverse(o => { o.castShadow = false; });
  return g;
}
for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
  const ch = MAP[z][x];
  if (ch === 'P') start = [x, z];
  else if (ch === 'M') monStart = [x, z];
  else if (ch === 'b') place(bunkBed(), x, z, .95, 1.02);
  else if (ch === 'r') place(crate(), x, z, .8, .42);
  else if (ch === 'c') {
    const inst = locker(), r = place(inst.g, x, z, .5, .42);
    if (r) lockers.push({ x: cw(x), z: cw(z), cell: [x, z], meshX: inst.g.position.x, meshZ: inst.g.position.z, dx: r.dx, dz: r.dz, out: Math.atan2(-r.dx, -r.dz), hinge: inst.hinge, hiding: false, node: inst.g });
  } else if (ch === '1' || ch === '2' || ch === '3') {
    const inst = generator(), r = place(inst.g, x, z, .78, .6);
    if (r) gens.push({ x: cw(x), z: cw(z), on: false, fueled: false, lever: inst.lever, lamp: inst.lamp, light: inst.light, clang: rr(14, 26), node: inst.g });
  } else if (ch === 'L') {
    const flick = rnd() < .45, col = flick ? 0xbfd4c0 : 0xffd9a0;
    const light = new T.PointLight(col, 0, 10, 1.7); light.position.set(cw(x), WH - .45, cw(z)); scene.add(light);
    M(Box(1.2, .08, .32), mRust, cw(x), WH - .04, cw(z), scene);
    const pm = new T.MeshBasicMaterial({ color: col });
    M(Box(1.1, .03, .2), pm, cw(x), WH - .09, cw(z), scene).castShadow = false;
    lamps.push({ light, pm, col: new T.Color(col), base: flick ? 9 : 7, flick, f: 1, next: 0 });
  } else if (ch === 'F' || ch === 'B' || ch === 'N' || ch === 'A') {
    const o = ch === 'F' ? fuelModel() : ch === 'B' ? batteryModel() : ch === 'N' ? noteModel() : boltCrate();
    o.position.set(cw(x), ch === 'N' ? .9 : ch === 'A' ? .12 : 1.1, cw(z)); scene.add(o);
    items.push({ type: ch, o, x: cw(x), z: cw(z), ph: rr(0, 6) });
  } else if (ch === 'E') { // лифт: шахта, створки, знак
    const [dx, dz] = DIRS.find(([dx, dz]) => !solid(x + dx, z + dz));
    const mx = cw(x) + dx * (CS / 2 + .02), mz = cw(z) + dz * (CS / 2 + .02);
    const g = new T.Group(); g.position.set(mx, 0, mz); g.rotation.y = Math.atan2(dx, dz); scene.add(g);
    M(Box(2.4, 2.4, .1), mMetal, 0, 1.2, .1, g);
    const doorL = new T.Group(), doorR = new T.Group();
    doorL.position.set(-.6, 0, 0); doorR.position.set(.6, 0, 0); g.add(doorL); g.add(doorR);
    M(Box(1.15, 2.25, .07), std({ map: liftTex(), roughness: .5, metalness: .5 }), .575, 1.125, 0, doorL);
    M(Box(1.15, 2.25, .07), std({ map: liftTex(), roughness: .5, metalness: .5 }), -.575, 1.125, 0, doorR);
    M(Box(.1, 2.4, .16), mRust, -1.2, 1.2, 0, g); M(Box(.1, 2.4, .16), mRust, 1.2, 1.2, 0, g); M(Box(2.5, .16, .16), mRust, 0, 2.4, 0, g);
    const sm = new T.MeshBasicMaterial({ map: signTex(false) });
    M(Box(.95, .26, .06), sm, 0, 2.66, .04, g).castShadow = false;
    const sl = new T.PointLight(0xff2010, 1.8, 7, 1.8); sl.position.set(0, 2.5, .5); g.add(sl);
    const back = new T.Mesh(new T.PlaneGeometry(CS, WH), std({ color: 0x1a1c1a, roughness: .9 }));
    back.position.set(mx, WH / 2, cw(z) - dz * CS / 2); back.rotation.y = Math.atan2(-dx, -dz); scene.add(back);
    const cab = new T.PointLight(0x9fb8c4, 0, 5, 2); cab.position.set(mx, 2.4, cw(z)); scene.add(cab);
    exitDoor = { x: cw(x + dx), z: cw(z + dz), meshX: mx, meshZ: mz, dx, dz, doorL, doorR, sm, sl, cab, open: 0 };
  }
}
// ===== часть 2 =====

// ───────────────────────── СЛЕПОЙ: глаз нет, только уши
function buildMonster() {
  const skin = std({ map: tSkin, bumpMap: tSkin, bumpScale: 2.2, roughness: .45, metalness: .08, color: 0x929a92 });
  const bone = std({ color: 0xc9c3a4, roughness: .5 });
  const voidM = std({ color: 0x080808, roughness: 1 });
  const g = new T.Group(), body = new T.Group(); body.position.y = 1.22; g.add(body);
  M(Sph(.16), skin, 0, 0, 0, body).scale.set(1.05, .8, .85);
  const spine = new T.Group(); body.add(spine);
  M(new T.CapsuleGeometry(.15, .52, 6, 14), skin, 0, .44, 0, spine).scale.set(1.1, 1, .72);
  for (let i = 0; i < 5; i++) { const rib = M(new T.TorusGeometry(.165 + i * .007, .016, 6, 18), skin, 0, .26 + i * .095, .005, spine); rib.rotation.x = Math.PI / 2 + .12; rib.scale.set(1.12, .74, 1); }
  for (let i = 0; i < 8; i++) M(Sph(.03, 8, 6), skin, 0, .08 + i * .095, -.12, spine);
  M(Cyl(.05, .07, .22, 10), skin, 0, .88, .03, spine);
  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    M(Sph(.09), skin, s * .24, .74, 0, spine);
    const sh = new T.Group(); sh.position.set(s * .29, .74, 0); spine.add(sh);
    M(new T.CapsuleGeometry(.042, .52, 4, 10), skin, 0, -.31, 0, sh);
    const el = new T.Group(); el.position.y = -.62; sh.add(el);
    M(Sph(.048, 10, 8), skin, 0, 0, 0, el);
    M(new T.CapsuleGeometry(.035, .58, 4, 10), skin, 0, -.34, 0, el);
    M(Box(.075, .11, .035), skin, 0, -.7, 0, el);
    for (let i = 0; i < 4; i++) { const cl = M(new T.ConeGeometry(.011, .27, 6), bone, (i - 1.5) * .023, -.86, .01, el); cl.rotation.x = Math.PI; cl.rotation.z = (i - 1.5) * .1; }
    arms.push({ sh, el, s });
    const hip = new T.Group(); hip.position.set(s * .105, -.02, 0); body.add(hip);
    M(new T.CapsuleGeometry(.06, .46, 4, 10), skin, 0, -.29, 0, hip);
    const kn = new T.Group(); kn.position.y = -.58; hip.add(kn);
    M(Sph(.058, 10, 8), skin, 0, 0, 0, kn);
    M(new T.CapsuleGeometry(.044, .46, 4, 10), skin, 0, -.29, 0, kn);
    M(Box(.09, .05, .24), skin, 0, -.575, .07, kn);
    legs.push({ hip, kn, s });
  }
  const head = new T.Group(); head.position.set(0, 1.0, .06); spine.add(head);
  M(Sph(.15, 22, 16), skin, 0, .06, 0, head).scale.set(.8, 1.35, .92);   // вытянутый череп
  M(Sph(.11, 16, 12), skin, 0, -.02, .06, head).scale.set(.95, .9, .8);
  for (let i = 0; i < 4; i++) M(Sph(.03, 8, 6), voidM, 0, .18 - i * .05, -.13, head);
  const skinDark = std({ map: tSkin, bumpMap: tSkin, bumpScale: 2, roughness: .5, color: 0x79817b });
  const ears = [];
  for (const s of [-1, 1]) { // огромные ушные раковины, отведённые назад
    const ear = new T.Group(); ear.position.set(s * .1, .04, -.05); head.add(ear);
    ear.rotation.z = s * .5; ear.rotation.x = -.3;
    M(Sph(.12, 14, 10), skinDark, s * .05, .06, 0, ear).scale.set(.5, 1.6, .11);
    M(new T.TorusGeometry(.075, .007, 5, 14), bone, s * .04, .06, 0, ear).rotation.y = Math.PI / 2;
    ears.push({ ear, s });
  }
  const jaw = new T.Group(); jaw.position.set(0, -.12, .02); head.add(jaw);
  M(Sph(.1, 14, 10), skin, 0, -.05, .04, jaw).scale.set(.78, .45, 1);
  for (let i = 0; i < 8; i++) M(new T.ConeGeometry(.009, .05, 5), bone, (i - 3.5) * .016, .02, .12 - Math.abs(i - 3.5) * .006, jaw).rotation.z = R(-.1, .1);
  for (let i = 0; i < 8; i++) { const t = M(new T.ConeGeometry(.008, .055, 5), bone, (i - 3.5) * .0155, -.07, .11 - Math.abs(i - 3.5) * .006, head); t.rotation.x = Math.PI; }
  M(Sph(.055, 12, 10), skin, 0, .01, .13, head).scale.set(.85, .7, .6);   // морда без глаз
  for (const s of [-1, 1]) M(Sph(.011, 6, 5), voidM, s * .018, 0, .17, head);
  const earLight = new T.PointLight(0x402020, .2, 3, 2); earLight.position.set(0, .1, 0); head.add(earLight);
  g.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  return { g, body, spine, head, jaw, ears, arms, legs, earLight };
}
const mm = buildMonster();
scene.add(mm.g);
const mon = { x: cw(monStart[0]), z: cw(monStart[1]), state: 'patrol', tx: 0, tz: 0, f: null, fc: -1, wait: 1, acc: 0, silent: 0, phase: 0, chase: 0, yaw: 0, step: 0, twitch: 0, peek: 0, heard: -99 };
mon.tx = mon.x; mon.tz = mon.z;

function animMonster(dt, speed, t) {
  mon.phase += speed * dt * 2.5;
  const c = mon.chase, s = Math.sin(mon.phase), idle = Math.sin(t * 1.2) * .03;
  for (const l of mm.legs) {
    const v = l.s > 0 ? s : -s, m = Math.min(1, speed);
    l.hip.rotation.x = -v * .66 * m - .1;
    l.kn.rotation.x = .18 + Math.max(0, v) * .95 * m;
  }
  for (const a of mm.arms) {
    const v = a.s > 0 ? -s : s;
    a.sh.rotation.x = lerp(v * .45 + .1, -1.5 + v * .25, c);
    a.sh.rotation.z = a.s * lerp(.12 + idle, .3, c);
    a.el.rotation.x = lerp(-.3, -.6 + Math.sin(t * 14 + a.s) * .15, c);
  }
  mm.spine.rotation.x = lerp(.36, .58, c) + idle;
  mm.spine.rotation.y = s * .12;
  mm.body.position.y = 1.22 - Math.abs(s) * .04 * Math.min(1, speed) - .03;
  mon.twitch -= dt;
  if (mon.twitch < 0) { // голова рыщет, уши ловят звук
    mon.twitch = R(.07, c > .5 ? .25 : 1.6);
    mm.head.rotation.y = mon.peek + R(-.5, .5) * (1 - c);
    mm.head.rotation.z = R(-.4, .4) * (Math.random() < .4 ? 1 : .12);
    for (const e of mm.ears) e.ear.rotation.y = R(-.3, .3);
  }
  mm.head.rotation.x = lerp(-.2, -.5, c);
  for (const e of mm.ears) e.ear.rotation.x = -.3 - .3 * c; // на погоне уши прижаты
  mm.jaw.rotation.x = lerp(.06, .7, c) + Math.abs(Math.sin(t * 18)) * .14 * c;
}

// ───────────────────────── игрок, фонарь, пыль
const P = { x: cw(start[0]), z: cw(start[1]), yaw: -Math.PI / 2, pitch: 0, vx: 0, vz: 0, crouch: false, noise: 0, bat: 1, on: true, bolts: 3, fuel: 0, gens: 0, hidden: null, bob: 0, step: 0, notes: 0, camY: 1.62, lastNoise: -99 };
const SPOT = 30;
const spot = new T.SpotLight(0xffe8bc, 0, 32, .56, .5, 1.1);
spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.camera.near = .3; spot.shadow.camera.far = 32; spot.shadow.bias = -.003;
spot.position.set(.24, -.2, -.56); camera.add(spot); spot.target.position.set(0, 0, -6); camera.add(spot.target);
const torch = new T.Group(), mLens = new T.MeshBasicMaterial({ color: 0xfff3d8 });
{
  const bm = std({ color: 0x1a1c1e, roughness: .45, metalness: .8, emissive: 0x161616 });
  M(Cyl(.021, .021, .21, 12), bm, 0, 0, .06, torch).rotation.x = Math.PI / 2;
  M(Cyl(.038, .023, .07, 14), bm, 0, 0, -.07, torch).rotation.x = -Math.PI / 2;
  M(Cyl(.031, .031, .004, 14), mLens, 0, 0, -.107, torch).rotation.x = Math.PI / 2;
  torch.traverse(o => { o.castShadow = o.receiveShadow = false; });
  torch.position.set(.24, -.21, -.42); torch.rotation.set(.06, .1, 0); camera.add(torch);
}
const hideLight = new T.PointLight(0xa9b6b0, 0, 3, 2); // глаза привыкают в укрытии
hideLight.position.set(0, .1, -.2); camera.add(hideLight);
const DN = 300, dPos = new Float32Array(DN * 3), dCol = new Float32Array(DN * 3), dBase = [];
for (let i = 0; i < DN; i++) dBase.push([R(0, 12), R(0, 3), R(0, 12), R(0, 6.28)]);
const dustGeo = new T.BufferGeometry();
dustGeo.setAttribute('position', new T.BufferAttribute(dPos, 3)); dustGeo.setAttribute('color', new T.BufferAttribute(dCol, 3));
const dust = new T.Points(dustGeo, new T.PointsMaterial({ size: .02, vertexColors: true, blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
dust.frustumCulled = false; scene.add(dust);
const fwd = new T.Vector3();
function updDust(t, on) {
  camera.getWorldDirection(fwd);
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, c0 = Math.cos(.45);
  for (let i = 0; i < DN; i++) {
    const b = dBase[i];
    const x = ((b[0] + Math.sin(t * .18 + b[3]) * .3 - cx) % 12 + 18) % 12 - 6 + cx;
    const z = ((b[2] + Math.cos(t * .15 + b[3]) * .3 - cz) % 12 + 18) % 12 - 6 + cz;
    const y = (b[1] + t * .015 + Math.sin(t * .3 + b[3]) * .1) % 3;
    dPos[i * 3] = x; dPos[i * 3 + 1] = y; dPos[i * 3 + 2] = z;
    const vx = x - cx, vy = y - cy, vz = z - cz, d = Math.hypot(vx, vy, vz) || 1, cs = (vx * fwd.x + vy * fwd.y + vz * fwd.z) / d;
    const v = on && cs > c0 && d < 7 && d > .4 ? (cs - c0) / (1 - c0) * (1 - d / 7) * .55 * on : 0;
    dCol[i * 3] = v * .9; dCol[i * 3 + 1] = v; dCol[i * 3 + 2] = v * .95;
  }
  dustGeo.attributes.position.needsUpdate = dustGeo.attributes.color.needsUpdate = true;
}

// ───────────────────────── звук (синтез, без файлов)
const A = { c: null, genNodes: new Map() };
function initAudio() {
  if (A.c) { A.c.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const C = A.c = new AC();
  A.out = C.createGain(); A.out.gain.value = .9; A.out.connect(C.destination);
  const nb = A.nb = C.createBuffer(1, C.sampleRate * 2, C.sampleRate), d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const osc = (type, f) => { const o = C.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
  const gain = v => { const g = C.createGain(); g.gain.value = v; return g; };
  const filt = (type, f, q = 1) => { const b = C.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const loop = () => { const s = C.createBufferSource(); s.buffer = nb; s.loop = true; s.start(); return s; };
  const dl = filt('lowpass', 130); dl.connect(gain(.1)).connect(A.out);
  osc('sawtooth', 38).connect(dl); osc('sawtooth', 40.4).connect(dl); osc('sine', 76.4).connect(dl);
  const ring = filt('bandpass', 1180, 3); loop().connect(ring).connect(gain(.02)).connect(A.out);
  osc('sine', .07).connect(gain(120)).connect(ring.frequency);
  const wb = filt('bandpass', 260, 1.2); loop().connect(wb).connect(gain(.045)).connect(A.out);
  osc('sine', .09).connect(gain(140)).connect(wb.frequency);
  A.gG = gain(0); A.gP = C.createStereoPanner ? C.createStereoPanner() : null;
  const gl = filt('lowpass', 260), tr = gain(.5);
  A.gO = osc('sawtooth', 34); A.gO.connect(gl); osc('square', 51).connect(gain(.4)).connect(gl);
  loop().connect(filt('bandpass', 620, 1.8)).connect(gain(.5)).connect(gl);
  A.gT = osc('sine', 11); A.gT.connect(gain(.5)).connect(tr.gain);
  gl.connect(tr).connect(A.gG); if (A.gP) A.gG.connect(A.gP).connect(A.out); else A.gG.connect(A.out);
  A.breath = gain(0); const br = filt('bandpass', 700, 2.2);
  loop().connect(br).connect(A.breath).connect(A.out);
  osc('sine', .42).connect(gain(240)).connect(br.frequency);
  A.sG = gain(0); loop().connect(filt('highpass', 2600)).connect(A.sG).connect(A.out);
}
function envGain(peak, at, dec, t0) {
  const C = A.c, g = C.createGain(), t = C.currentTime + (t0 || 0);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + at); g.gain.exponentialRampToValueAtTime(.0001, t + at + dec);
  return g;
}
function sNoise(vol, type, f, q, at, dec, t0, p) {
  if (!A.c) return; const C = A.c, s = C.createBufferSource(), b = C.createBiquadFilter();
  s.buffer = A.nb; b.type = type; b.frequency.value = f; b.Q.value = q;
  let n = s.connect(b).connect(envGain(vol, at, dec, t0));
  if (p !== undefined && C.createStereoPanner) { const sp = C.createStereoPanner(); sp.pan.value = clamp(p, -1, 1); n = n.connect(sp); }
  n.connect(A.out); const t = C.currentTime + (t0 || 0); s.start(t, Math.random() * 1.5); s.stop(t + at + dec + .05);
}
function sTone(vol, type, f0, f1, at, dec, t0) {
  if (!A.c) return; const C = A.c, o = C.createOscillator(), t = C.currentTime + (t0 || 0);
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + at + dec);
  o.connect(envGain(vol, at, dec, t0)).connect(A.out); o.start(t); o.stop(t + at + dec + .05);
}
const pan = (dx, dz) => { const d = Math.hypot(dx, dz) || 1; return clamp((Math.cos(P.yaw) * dx - Math.sin(P.yaw) * dz) / d, -1, 1); };
const sfx = {
  step: (run, wet) => {
    if (wet) { sNoise(run ? .34 : .24, 'bandpass', R(900, 1500), 1.1, .01, .3); sTone(.1, 'sine', R(120, 180), 60, .01, .18); }
    else { sNoise(run ? .3 : .15, 'lowpass', R(500, 800), 1, .005, .1); sTone(run ? .16 : .08, 'sine', R(95, 130), 45, .004, .09); }
  },
  drip: () => { const f = R(1100, 1900); sTone(.07, 'sine', f, f * .35, .002, .1); sTone(.03, 'sine', f * .8, f * .3, .002, .09, .17); },
  clang: (v = .6, p) => { sTone(v * .3, 'square', R(600, 900), R(300, 500), .002, .35); sTone(v * .22, 'sine', R(1900, 2600), R(700, 1200), .002, .5); sNoise(v * .3, 'bandpass', R(1800, 3200), 1, .002, .25, 0, p); },
  whoosh: () => sNoise(.16, 'bandpass', 800, 1.2, .06, .18),
  monStep: (v, p) => { sNoise(v * .5, 'lowpass', 170, 1, .01, .24, 0, p); sTone(v * .5, 'sine', 58, 30, .008, .22); },
  beat: () => { sTone(.5, 'sine', 66, 36, .012, .13); sTone(.34, 'sine', 58, 32, .012, .13, .2); },
  pickup: () => { sTone(.15, 'sine', 620, 620, .01, .2); sTone(.14, 'sine', 930, 930, .01, .5, .12); },
  paper: () => sNoise(.11, 'bandpass', 3200, 1, .02, .25),
  refuel: () => { sNoise(.18, 'lowpass', 520, 1, .1, .7); sTone(.12, 'sine', 200, 90, .1, .7); },
  locker: () => { sTone(.16, 'sawtooth', 180, 120, .02, .35); sNoise(.2, 'bandpass', 1500, 3, .01, .2); sTone(.12, 'square', 90, 60, .01, .12); },
  door: () => { sNoise(.22, 'bandpass', 900, 2, .05, .9); sTone(.14, 'sawtooth', 130, 80, .1, 1.1); },
  roar: () => { sTone(.36, 'sawtooth', 210, 45, .05, 1.3); sTone(.28, 'square', 141, 35, .05, 1.3); sNoise(.3, 'bandpass', 800, 1.4, .05, 1.1); },
  screech: () => {
    if (!A.c) return;
    for (const f of [280, 420, 592, 1056, 1250]) { sTone(.3, 'sawtooth', f * R(.96, 1.04), f * R(.7, 1.5), .02, 1.7); sTone(.15, 'square', f * 1.5, f * .8, .02, 1.5); }
    sNoise(.7, 'bandpass', 2200, .7, .01, 1.7); sTone(.8, 'sine', 64, 24, .01, 1.6);
  },
  claw: () => { for (let i = 0; i < 3; i++) sNoise(.22, 'bandpass', R(1200, 2600), 4, .004, .1, i * .07); },
  genStart: () => { sTone(.4, 'sawtooth', 30, 58, .35, .7); sNoise(.3, 'lowpass', 500, 1, .3, .6); sTone(.2, 'square', 120, 60, .02, .3, .6); },
  buzz: () => sNoise(.14, 'bandpass', 1200, 6, .02, .35),
  win: () => { [196, 262, 330, 392].forEach((f, i) => sTone(.13, 'sine', f, f, .5, 3, i * .4)); },
};
function genNode(g) { // гул работающего дизеля
  if (!A.c || A.genNodes.has(g)) return;
  const C = A.c, out = C.createGain(); out.gain.value = 0; out.connect(A.out);
  const flt = C.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 400; flt.connect(out);
  const o1 = C.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 57; o1.start();
  const o2 = C.createOscillator(); o2.type = 'square'; o2.frequency.value = 114.5; o2.start();
  const g2 = C.createGain(); g2.gain.value = .16; o1.connect(flt); o2.connect(g2).connect(flt);
  const kn = C.createBufferSource(); kn.buffer = A.nb; kn.loop = true; kn.start();
  kn.connect(C.createBiquadFilter()).connect(g2);
  A.genNodes.set(g, out);
}
// ===== часть 3 =====

// ───────────────────────── интерфейс и ввод
const ui = { hud: $('hud'), keys: $('keys'), noise: $('bNoise').firstElementChild, bat: $('bBat').firstElementChild, inv: $('inv'), prompt: $('prompt'), msg: $('msg'), red: $('red'), grain: $('grain'), fade: $('fade'), dot: $('dot') };
let state = 'menu', time = 0, playTime = 0, touchMode = false, wasLocked = false, msgT = 0, dieT = 0, eventT = 18, beatT = 0, dripT = 4, crouchHeld = false, act = null;
function say(text, dur = 4) { ui.msg.textContent = text; ui.msg.style.opacity = 1; msgT = dur; }
const NOTES = [
  '«Объект 7. Уровень затопило на два метра. Свет держим только в центральных коридорах. Наверх никого не поднимали».',
  '«Оно слепое. Глаз нет вообще — только уши. Оно слышит каждый шаг, всплеск и лязг железа. Ходи медленно, приседай и бросай болты подальше от себя».',
  '«Дизели питают лифт. Три дизеля, три канистры. Канистры: склад, каптёрка, оружейка. И не беги по воде — вода слышна по всему бункеру».',
];
const keysDown = {};
addEventListener('keydown', e => {
  keysDown[e.code] = true;
  if (state === 'play') {
    if (e.code === 'KeyF') toggleLight();
    else if (e.code === 'KeyQ') throwBolt();
    else if (e.code === 'KeyE') doInteract();
  }
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { keysDown[e.code] = false; });
addEventListener('blur', () => { for (const k in keysDown) keysDown[k] = false; });
addEventListener('mousedown', e => { if (state === 'play' && e.button === 0 && document.pointerLockElement === canvas) throwBolt(); });
function toggleLight() { if (P.bat <= 0) { say('Батарея села.', 2); return; } P.on = !P.on; sfx.buzz(); $('tLight').classList.toggle('act', P.on); }
function lock() { if (touchMode) return; try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { } }
document.addEventListener('mousemove', e => {
  if (state !== 'play' || document.pointerLockElement !== canvas) return;
  P.yaw -= clamp(e.movementX, -250, 250) * .0022;
  P.pitch = clamp(P.pitch - clamp(e.movementY, -250, 250) * .0022, -1.45, 1.45);
});
document.addEventListener('pointerlockchange', () => {
  const l = document.pointerLockElement === canvas;
  if (l) { wasLocked = true; if (state === 'pause') setState('play'); }
  else if (state === 'play' && wasLocked && !touchMode) setState('pause');
});
function setState(s) {
  state = s;
  $('menu').classList.toggle('hidden', s !== 'menu');
  $('pause').classList.toggle('hidden', s !== 'pause');
  $('end').classList.toggle('hidden', s !== 'dead' && s !== 'won');
  ui.hud.classList.toggle('on', s === 'play' || s === 'pause');
  ui.dot.style.display = s === 'play' ? 'block' : 'none';
  $('touch').style.display = touchMode && s === 'play' ? 'block' : 'none';
  if (A.c) A.out.gain.setTargetAtTime(s === 'pause' ? 0 : .9, A.c.currentTime, .1);
}
function begin(e) {
  if (e && e.pointerType === 'touch') touchMode = true;
  initAudio(); setState('play'); lock();
  say('Свет держится только в центральных коридорах. Где-то в темноте что-то ходит.', 6);
}
$('start').addEventListener('pointerup', begin);
$('pause').addEventListener('click', () => { if (touchMode || !wasLocked) setState('play'); else lock(); });
canvas.addEventListener('click', () => { if (state === 'play' && document.pointerLockElement !== canvas) lock(); });
$('again').addEventListener('click', () => location.reload());

const tc = { mid: null, lid: null, mx: 0, my: 0, sx: 0, sy: 0, lx: 0, ly: 0, run: false };
canvas.addEventListener('touchstart', e => {
  touchMode = true; e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.clientX < innerWidth / 2 && tc.mid === null) { tc.mid = t.identifier; tc.sx = t.clientX; tc.sy = t.clientY; const s = $('stick'); s.style.display = 'block'; s.style.left = t.clientX + 'px'; s.style.top = t.clientY + 'px'; }
    else if (tc.lid === null) { tc.lid = t.identifier; tc.lx = t.clientX; tc.ly = t.clientY; }
  }
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === tc.mid) { tc.mx = clamp((t.clientX - tc.sx) / 55, -1, 1); tc.my = clamp((t.clientY - tc.sy) / 55, -1, 1); }
    else if (t.identifier === tc.lid) {
      if (state === 'play') { P.yaw -= (t.clientX - tc.lx) * .005; P.pitch = clamp(P.pitch - (t.clientY - tc.ly) * .005, -1.45, 1.45); }
      tc.lx = t.clientX; tc.ly = t.clientY;
    }
  }
}, { passive: false });
const tEnd = e => { for (const t of e.changedTouches) { if (t.identifier === tc.mid) { tc.mid = null; tc.mx = tc.my = 0; $('stick').style.display = 'none'; } if (t.identifier === tc.lid) tc.lid = null; } };
canvas.addEventListener('touchend', tEnd); canvas.addEventListener('touchcancel', tEnd);
const tBtn = (id, fn) => $(id).addEventListener('touchstart', e => { e.preventDefault(); fn(); }, { passive: false });
tBtn('tAct', () => { if (state === 'play') doInteract(); });
tBtn('tThrow', () => { if (state === 'play') throwBolt(); });
tBtn('tLight', () => { if (state === 'play') toggleLight(); });
tBtn('tCrouch', () => { P.crouch = !P.crouch; $('tCrouch').classList.toggle('act', P.crouch); });
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const gctx = ui.grain.getContext('2d'), gimg = gctx.createImageData(ui.grain.width, ui.grain.height);
let grainT = 0;
function drawGrain() {
  const d = gimg.data;
  for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  gctx.putImageData(gimg, 0, 0);
}

// ───────────────────────── шум, слух, действия
const isWater = () => wetAt(cellOf(P.x), cellOf(P.z));
let mf = null, mfCell = -1, mfT = -99;
function monField() {
  const c = cellOf(mon.x) + cellOf(mon.z) * W;
  if (c !== mfCell || time - mfT > 1.2) { mf = field(cellOf(mon.x), cellOf(mon.z)); mfCell = c; mfT = time; }
  return mf;
}
const pathTo = (x, z) => { const f = monField(), c = cellOf(x), r = cellOf(z); return c < 0 || r < 0 || c >= W || r >= H ? -1 : f[c + r * W]; };
function noiseEvent(x, z, str) { // лязг: слышно по коридорам, звук огибает углы
  if (state !== 'play') return;
  const d = pathTo(x, z);
  if (str < 1 && (d < 0 || d * CS > 8 + 34 * str)) return; // запуск дизеля слышно везде
  mon.tx = x; mon.tz = z;
  if (mon.state !== 'hunt') mon.state = 'investigate';
  sfx.roar();
}
function pickPatrol() {
  const pf = field(cellOf(P.x), cellOf(P.z)), mf2 = field(cellOf(mon.x), cellOf(mon.z));
  const near = Math.random() < .6 + P.gens * .05;
  const c = floorCells.filter(([x, z]) => { const i = x + z * W; return near ? pf[i] >= 4 && pf[i] <= 11 : mf2[i] > 8; });
  const [x, z] = c.length ? c[(Math.random() * c.length) | 0] : floorCells[(Math.random() * floorCells.length) | 0];
  mon.tx = cw(x); mon.tz = cw(z);
}
const tmp = { x: 0, z: 0 };
function updMonster(dt) {
  const dx = P.x - mon.x, dz = P.z - mon.z, dist = Math.hypot(dx, dz);
  const noise = P.hidden ? 0 : P.noise;
  const dPath = pathTo(P.x, P.z);
  const dM = dPath < 0 ? 1e9 : dPath * CS;
  const heard = noise > .07 && dM <= 5 + 24 * noise;
  if (heard) { mon.acc = Math.min(1.4, mon.acc + dt); mon.tx = P.x; mon.tz = P.z; mon.heard = time; }
  else mon.acc = Math.max(0, mon.acc - dt * .45);
  if (mon.acc > .24 && mon.state !== 'hunt') { mon.state = 'hunt'; sfx.roar(); }
  if (mon.state === 'hunt') {
    if (heard) mon.silent = 0; else mon.silent += dt;
    if (mon.silent > 3.6) { mon.state = 'search'; mon.silent = 0; mon.wait = 0; }
  }
  const atT = Math.hypot(mon.tx - mon.x, mon.tz - mon.z) < .5;
  let speed = 0;
  if (mon.state === 'hunt') { speed = 4.1 + P.gens * .1; if (atT && !heard) { mon.state = 'search'; mon.wait = 0; } }
  else if (mon.state === 'investigate') { speed = 2.6; if (atT) { mon.state = 'search'; mon.wait = 0; } }
  else if (mon.state === 'search') {
    speed = 1.9;
    if (atT) { speed = 0; mon.wait += dt; mon.yaw += Math.sin(mon.wait * 2.4) * dt * 2.6; if (mon.wait > 6) { mon.state = 'patrol'; mon.wait = 0; pickPatrol(); } }
  } else {
    speed = 1.7 + P.gens * .1;
    if (atT) { speed = 0; mon.wait -= dt; if (mon.wait <= 0) { mon.wait = R(.5, 2.4); pickPatrol(); } }
  }
  if (speed > 0) {
    const mc = cellOf(mon.x) + cellOf(mon.z) * W, tcx = cellOf(mon.tx), tcz = cellOf(mon.tz), tcell = tcx + tcz * W;
    if (mon.fc !== tcell) { mon.f = field(tcx, tcz); mon.fc = tcell; }
    let gx = mon.tx, gz = mon.tz;
    if (mc !== tcell && !(heard && dist < CS)) {
      const f = mon.f, x = mc % W, z = (mc / W) | 0;
      let best = f[mc] < 0 ? 1e9 : f[mc];
      if (f[mc] < 0) pickPatrol();
      for (const [ddx, ddz] of DIRS) { const n = x + ddx + (z + ddz) * W; if (!solid(x + ddx, z + ddz) && f[n] >= 0 && f[n] < best) { best = f[n]; gx = cw(x + ddx); gz = cw(z + ddz); } }
    }
    const vx = gx - mon.x, vz = gz - mon.z, d = Math.hypot(vx, vz) || 1, st = Math.min(d, speed * dt);
    tmp.x = mon.x + vx / d * st; tmp.z = mon.z + vz / d * st; collide(tmp, .38, false);
    mon.x = tmp.x; mon.z = tmp.z;
    mon.yaw += ang(Math.atan2(vx, vz) - mon.yaw) * Math.min(1, dt * 8);
    mon.step += st;
    if (mon.step > (mon.state === 'hunt' ? 1.6 : 1.15)) {
      mon.step = 0; const v = clamp(1 - dist / 26, 0, 1);
      if (v > 0) sfx.monStep(v * v, pan(dx, dz));
      if (wetAt(cellOf(mon.x), cellOf(mon.z))) sfx.step(false, true);
    }
  }
  mon.peek = heard ? ang(Math.atan2(P.x - mon.x, P.z - mon.z) - mon.yaw) : 0;
  mon.chase = lerp(mon.chase, mon.state === 'hunt' ? 1 : 0, Math.min(1, dt * 4));
  const kill = mon.state === 'hunt' && (P.hidden ? dist < 2.2 && time - P.lastNoise < 2.5 : dist < .95);
  if (kill) die();
  return { dist, heard, dM };
}
function startGen(g) {
  g.on = true; P.gens++;
  ui.keys.textContent = `ДИЗЕЛИ ${P.gens}/3`;
  sfx.genStart(); genNode(g);
  noiseEvent(g.x, g.z, 1);
  say(P.gens >= 3 ? 'Все три дизеля работают. Лифт под напряжением — уходи!' : `Дизель ${P.gens} из 3. Лязг слышно по всему бункеру...`, 5);
  if (P.gens >= 3) { exitDoor.sm.map = signTex(true); exitDoor.sm.needsUpdate = true; exitDoor.sl.color.set(0x40ff70); }
}
function hideIn(lk) {
  P.hidden = lk; lk.hiding = true; P.vx = P.vz = 0; P.noise = 0;
  P.x = lk.x; P.z = lk.z; P.yaw = lk.out; P.pitch = 0;
  sfx.locker(); say('Шкафчик закрыт. Притаись и слушай.', 4);
}
function unhide() {
  const lk = P.hidden; P.hidden = null; lk.hiding = false;
  sfx.locker(); say('Ты вышел из шкафчика.', 2);
}
function winSeq() { state = 'winning'; setState('winning'); dieT = 0; exitDoor.open = 1; sfx.door(); sfx.win(); }
function updInteract() {
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  let best = null, bd = 2.1;
  const consider = (x, z, label, fn, face = true) => {
    const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz) || 1;
    if (d < bd && (!face || (dx * fx + dz * fz) / d > .25)) { bd = d; best = { label, fn }; }
  };
  if (P.hidden) best = { label: '[E] ВЫЙТИ ИЗ ШКАФЧИКА', fn: unhide };
  else {
    for (const g of gens) {
      if (g.on) { consider(g.x, g.z, 'ДИЗЕЛЬ РАБОТАЕТ', null); continue; }
      if (g.fueled) consider(g.x, g.z, '[E] ЗАПУСТИТЬ ДИЗЕЛЬ', () => startGen(g));
      else if (P.fuel > 0) consider(g.x, g.z, '[E] ЗАЛИТЬ ТОПЛИВО', () => { g.fueled = true; P.fuel--; sfx.refuel(); say('Топливо залито. Дёрни рычаг.', 3); });
      else consider(g.x, g.z, 'НУЖНА КАНИСТРА', null);
    }
    for (const lk of lockers) consider(lk.x, lk.z, '[E] СПРЯТАТЬСЯ В ШКАФЧИК', () => hideIn(lk));
    if (exitDoor) consider(exitDoor.meshX, exitDoor.meshZ, P.gens >= 3 ? '[E] ВОЙТИ В ЛИФТ' : `ЛИФТ ОБЕСТОЧЕН · ДИЗЕЛИ ${P.gens}/3`, P.gens >= 3 ? winSeq : null, false);
  }
  promptText = best ? best.label : '';
  ui.prompt.textContent = promptText;
  ui.prompt.style.opacity = best && state === 'play' ? 1 : 0;
  act = best && best.fn ? best.fn : null;
}
function doInteract() { updInteract(); if (act) act(); }
function throwBolt() {
  if (state !== 'play' || P.hidden || P.bolts <= 0 || bolts.length >= 14) return;
  P.bolts--;
  const cp = Math.cos(P.pitch), dx = -Math.sin(P.yaw) * cp, dy = Math.sin(P.pitch), dz = -Math.cos(P.yaw) * cp;
  const o = boltModel();
  o.position.set(camera.position.x + dx * .45, camera.position.y + dy * .45 - .05, camera.position.z + dz * .45);
  scene.add(o);
  bolts.push({ o, x: o.position.x, y: o.position.y, z: o.position.z, vx: dx * 17, vy: dy * 17 + 3, vz: dz * 17, life: 0, rang: false, rest: false });
  sfx.whoosh();
}
function updBolts(dt) {
  for (const b of bolts) {
    if (b.rest) continue;
    b.life += dt; b.vy -= 15 * dt;
    let nx = b.x + b.vx * dt, ny = b.y + b.vy * dt, nz = b.z + b.vz * dt, hit = false;
    if (solid(cellOf(nx), cellOf(b.z))) { b.vx *= -.4; nx = b.x; hit = true; }
    if (solid(cellOf(b.x), cellOf(nz))) { b.vz *= -.4; nz = b.z; hit = true; }
    if (ny < .08) { ny = .08; if (Math.abs(b.vy) > .9) { b.vy = -b.vy * .35; b.vx *= .7; b.vz *= .7; hit = true; } else { b.vy = 0; b.rest = true; if (!b.rang) hit = true; } }
    if (ny > WH - .14) { ny = WH - .14; b.vy = -Math.abs(b.vy) * .3; hit = true; }
    b.x = nx; b.y = ny; b.z = nz;
    b.o.position.set(b.x, b.y, b.z);
    b.o.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
    if (hit && !b.rang) {
      b.rang = true;
      const v = clamp(1 - Math.hypot(b.x - P.x, b.z - P.z) / 24, .2, 1);
      sfx.clang(v, pan(b.x - P.x, b.z - P.z));
      noiseEvent(b.x, b.z, .85);
    }
  }
}
function die() {
  if (state !== 'play') return;
  state = 'dying'; dieT = 0; setState('dying');
  if (P.hidden) { const lk = P.hidden; P.hidden = null; lk.hiding = false; }
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  P.pitch = .05; mon.x = P.x + fx * .84; mon.z = P.z + fz * .84;
  mon.yaw = Math.atan2(-fx, -fz); mon.chase = 1; P.on = true;
  spot.position.set(.1, -.15, 0);
  sfx.screech();
  if (A.c) { A.gG.gain.setTargetAtTime(0, A.c.currentTime, .05); A.breath.gain.setTargetAtTime(0, A.c.currentTime, .05); A.sG.gain.setTargetAtTime(.25, A.c.currentTime, .02); }
}
function endScreen(won) {
  setState(won ? 'won' : 'dead');
  if (document.exitPointerLock) document.exitPointerLock();
  const m = Math.floor(playTime / 60), s = Math.floor(playTime % 60);
  $('endTitle').textContent = won ? 'ТЫ УЕХАЛ' : 'ОНО УСЛЫШАЛО';
  $('endTitle').style.color = won ? '#c8cbc0' : '';
  $('endSub').textContent = won
    ? `Лифт поднялся. Дизелей: ${P.gens}/3, время: ${m}:${String(s).padStart(2, '0')}. Сверху тебя попросили не рассказывать, что внизу.`
    : `Дизелей запущено: ${P.gens} из 3. Оно слепое — но ты шумел.`;
  if (A.c) { A.sG.gain.setTargetAtTime(0, A.c.currentTime, .3); A.gG.gain.setTargetAtTime(0, A.c.currentTime, .1); A.breath.gain.setTargetAtTime(0, A.c.currentTime, .1); }
}
function updPlayer(dt) {
  const keyCrouch = !!(keysDown.ControlLeft || keysDown.ControlRight || keysDown.KeyC);
  if (keyCrouch !== crouchHeld) { crouchHeld = keyCrouch; P.crouch = keyCrouch; }
  const wet = isWater();
  if (P.hidden) { P.vx = P.vz = 0; P.noise = lerp(P.noise, 0, Math.min(1, dt * 10)); return { run: false, wet }; }
  let ix = (keysDown.KeyD || keysDown.ArrowRight ? 1 : 0) - (keysDown.KeyA || keysDown.ArrowLeft ? 1 : 0) + tc.mx;
  let iz = (keysDown.KeyS || keysDown.ArrowDown ? 1 : 0) - (keysDown.KeyW || keysDown.ArrowUp ? 1 : 0) + tc.my;
  const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
  const wantRun = (keysDown.ShiftLeft || keysDown.ShiftRight || tc.run) && il > .1 && !P.crouch;
  let sp = P.crouch ? 1.5 : wantRun ? 5.2 : 3;
  if (wet) sp *= .62;
  const s = Math.sin(P.yaw), c = Math.cos(P.yaw);
  const tx = (ix * c + iz * s) * sp, tz = (-ix * s + iz * c) * sp, k = 1 - Math.exp(-10 * dt);
  P.vx += (tx - P.vx) * k; P.vz += (tz - P.vz) * k;
  const ox = P.x, oz = P.z;
  P.x += P.vx * dt; P.z += P.vz * dt; collide(P, .34, true);
  const moved = Math.hypot(P.x - ox, P.z - oz);
  P.bob += moved * 1.75; P.step += moved;
  const spd = Math.hypot(P.vx, P.vz), moving = il > .1;
  let n = moving ? (P.crouch ? .12 : wantRun ? .9 : .36) : (P.crouch ? .01 : .06);
  if (wet) n = moving ? Math.max(n, .78) + (wantRun ? .22 : 0) : Math.max(n, .3);
  for (const g of gens) if (g.on) n *= 1 - .45 * clamp(1 - Math.hypot(g.x - P.x, g.z - P.z) / 8, 0, 1); // гул дизеля глушит шаги
  n = clamp(n, 0, 1);
  P.noise = lerp(P.noise, n, Math.min(1, dt * 9));
  if (P.noise > .2) P.lastNoise = time;
  if (P.step > (P.crouch ? 2.4 : spd > 4.4 ? 2.3 : 1.8)) { P.step = 0; sfx.step(spd > 4.4, wet); }
  if (P.on) { P.bat = Math.max(0, P.bat - dt / 240); if (P.bat <= 0) { P.on = false; say('Фонарь погас. Нужна батарейка.', 4); } }
  return { run: spd > 4.4, wet };
}
function updItems() {
  for (const it of items) {
    if (it.got) continue;
    it.o.position.y = (it.type === 'N' ? .9 : it.type === 'A' ? .12 : 1.1) + Math.sin(time * 2 + it.ph) * .05;
    it.o.rotation.y = time * 1.3 + it.ph;
    if (Math.hypot(P.x - it.x, P.z - it.z) > 1.15) continue;
    if (it.type === 'A') { it.got = true; scene.remove(it.o); P.bolts += 3; sfx.clang(.35); say('Ящик болтов: +3.', 2.5); continue; }
    if (it.type === 'F' && P.fuel > 0) continue; // по одной канистре за раз
    it.got = true; scene.remove(it.o);
    if (it.type === 'F') { P.fuel = 1; sfx.pickup(); say('Канистра с топливом. Неси к дизелю.', 4); }
    else if (it.type === 'B') { P.bat = Math.min(1, P.bat + .5); sfx.pickup(); say('Батарейка.', 2.5); }
    else { sfx.paper(); say(NOTES[P.notes++ % NOTES.length], 10); }
  }
}
function updLights(dt, flick) {
  for (const l of lamps) {
    if (l.flick) {
      l.next -= dt;
      if (l.next <= 0) { const r = Math.random(); l.f = r < .3 ? 0 : r < .5 ? .35 : 1; l.next = r > .85 ? R(.6, 2.5) : R(.03, .22); }
    }
    l.light.intensity = l.base * l.f; l.pm.color.copy(l.col).multiplyScalar(.08 + l.f * .92);
  }
  for (const g of gens) {
    g.lever.rotation.x = lerp(g.lever.rotation.x, g.on ? .8 : -.9, Math.min(1, dt * 4));
    g.lamp.material.color.set(g.on ? 0x4dff7a : g.fueled ? 0xffb040 : 0x241206);
    g.light.intensity = g.on ? 5 : g.fueled ? .6 : 0;
    if (g.on && A.c && A.genNodes.has(g)) A.genNodes.get(g).gain.setTargetAtTime(clamp(1 - Math.hypot(g.x - P.x, g.z - P.z) / 24, 0, 1) * .55, A.c.currentTime, .2);
  }
  if (exitDoor) exitDoor.sl.intensity = 1.8 + Math.sin(time * 2) * .4;
  let i = P.on && P.bat > 0 ? SPOT * (.45 + .55 * Math.min(1, P.bat * 3.5)) : 0;
  if (P.bat < .15 && Math.random() < .12) i *= .15;
  if (flick > 0 && Math.random() < flick * .5) i *= .1;
  if (state === 'dying') i = 6;
  spot.intensity = i; mLens.color.setScalar(i > 5 ? 1 : .03);
  hideLight.intensity = P.hidden ? 1.5 : 0;
  return i;
}
function updCam(dt) {
  P.camY = lerp(P.camY, P.crouch ? 1.02 : 1.62, Math.min(1, dt * 8));
  if (P.hidden) {
    const lk = P.hidden; // камера чуть в глубине шкафчика, взгляд в щель
    camera.position.set(lk.meshX - lk.dx * .05, 1.42, lk.meshZ - lk.dz * .05);
    P.yaw = lk.out + clamp(ang(P.yaw - lk.out), -1, 1);
    P.pitch = clamp(P.pitch, -.7, .7);
    camera.rotation.set(P.pitch * .7, P.yaw, 0);
    return;
  }
  const mv = Math.min(1, Math.hypot(P.vx, P.vz) / 3);
  camera.position.set(P.x, P.camY + Math.sin(P.bob * 2) * .04 * mv, P.z);
  camera.rotation.set(P.pitch, P.yaw, Math.sin(P.bob) * .012 * mv);
  torch.position.set(.24 + Math.sin(P.bob) * .012 * mv, -.21 + Math.abs(Math.cos(P.bob)) * .012 * mv, -.42);
}

function frame(dt) {
  time += dt;
  let near = 0, flick = 0;
  if (state === 'play') {
    playTime += dt;
    const pl = updPlayer(dt);
    updItems();
    updBolts(dt);
    updInteract();
    const m = updMonster(dt);
    if (state === 'play') {
      const dm = m.dM > 1e8 ? 999 : m.dM;
      near = clamp(clamp(1 - dm / 14, 0, 1) * (m.heard ? 1 : .3) + clamp(1 - Math.hypot(mon.x - P.x, mon.z - P.z) / 9, 0, 1) * .5, 0, 1);
      flick = clamp(1 - Math.hypot(mon.x - P.x, mon.z - P.z) / 8, 0, 1);
      if (A.c) {
        const t = A.c.currentTime, ch = mon.state === 'hunt', d = Math.hypot(mon.x - P.x, mon.z - P.z);
        A.gG.gain.setTargetAtTime(Math.pow(clamp(1 - d / 26, 0, 1), 2) * (ch ? .55 : .3), t, .1);
        A.gO.frequency.setTargetAtTime(ch ? 54 : 34, t, .3);
        A.gT.frequency.setTargetAtTime(ch ? 18 : 11, t, .3);
        A.breath.gain.setTargetAtTime(Math.pow(clamp(1 - d / 9, 0, 1), 2) * .5, t, .15);
        if (A.gP) A.gP.pan.setTargetAtTime(pan(mon.x - P.x, mon.z - P.z), t, .1);
        A.sG.gain.setTargetAtTime(near * near * .07, t, .1);
        beatT -= dt;
        if (d < 18 && beatT <= 0) { beatT = lerp(.42, 1.3, d / 18); sfx.beat(); }
        dripT -= dt;
        if (dripT <= 0) { dripT = R(3, 11); sfx.drip(); }
        eventT -= dt;
        if (eventT <= 0) { eventT = R(16, 40); const r = Math.random(); if (r < .45) sfx.drip(); else if (r < .75) sfx.clang(.35, R(-1, 1)); else sfx.buzz(); }
        for (const g of gens) {
          if (!g.on) continue;
          g.clang -= dt;
          if (g.clang <= 0) { g.clang = R(16, 30); sfx.clang(.5, pan(g.x - P.x, g.z - P.z)); noiseEvent(g.x, g.z, .8); }
        }
      }
      ui.noise.style.width = (P.noise * 100) + '%';
      ui.noise.style.background = P.noise > .7 ? '#c8402a' : P.noise > .35 ? '#d8b04a' : '#8fd08f';
      ui.bat.style.width = (P.bat * 100) + '%';
      ui.inv.textContent = `БОЛТЫ ${P.bolts}${P.fuel ? ' · КАНИСТРА' : ''}`;
      if (P.hidden && Math.random() < dt * 1.2) sfx.claw();
    }
    updCam(dt);
  } else if (state === 'menu') {
    camera.position.set(P.x, 1.62, P.z); camera.rotation.set(Math.sin(time * .3) * .04, P.yaw + Math.sin(time * .13) * .5, 0);
  } else if (state === 'dying') {
    dieT += dt; near = 1; flick = .3;
    if (Math.random() < dt * 3) sfx.claw();
    const sh = .06 * Math.max(0, 1 - dieT / 1.6);
    camera.position.set(P.x + R(-sh, sh), 1.62 + R(-sh, sh), P.z + R(-sh, sh));
    camera.rotation.set(P.pitch + R(-sh, sh), P.yaw + R(-sh, sh), R(-sh, sh) * 2);
    if (dieT > 1.15) ui.fade.style.opacity = 1;
    if (dieT > 2.3) { ui.fade.style.transition = 'opacity 2s'; ui.fade.style.opacity = .82; endScreen(false); }
  } else if (state === 'winning') {
    dieT += dt;
    if (dieT < 1.7) {
      P.x = lerp(P.x, exitDoor.meshX, Math.min(1, dt * 1.1));
      P.z = lerp(P.z, exitDoor.meshZ - 1.1, Math.min(1, dt * 1.1));
      P.yaw = lerp(P.yaw, ang(Math.atan2(-(exitDoor.meshX - P.x), -(exitDoor.meshZ - P.z))), Math.min(1, dt * 2));
    }
    updCam(dt);
    if (dieT > 1.5) ui.fade.style.opacity = .85;
    if (dieT > 2.2) endScreen(true);
  }
  const dying = state === 'dying';
  mm.g.position.set(mon.x, dying ? -.62 : 0, mon.z); mm.g.rotation.y = mon.yaw;
  if (state !== 'pause') animMonster(dt, state === 'play' ? (mon.state === 'hunt' ? 4.1 : mon.state === 'investigate' ? 2.6 : mon.state === 'search' ? 1.9 : 1.7) * (Math.hypot(mon.tx - mon.x, mon.tz - mon.z) < .5 ? 0 : 1) : 0, time);
  if (dying) { mm.spine.rotation.x = .15; mm.head.rotation.set(-.12, 0, Math.sin(time * 40) * .12); mm.jaw.rotation.x = .8 + Math.sin(time * 50) * .1; mm.earLight.intensity = .7; }
  for (const lk of lockers) lk.hinge.rotation.y = lerp(lk.hinge.rotation.y, lk.hiding ? -.4 : -1.2, Math.min(1, dt * 5));
  if (exitDoor) {
    exitDoor.doorL.position.x = lerp(exitDoor.doorL.position.x, -.6 - exitDoor.open * .62, Math.min(1, dt * 2));
    exitDoor.doorR.position.x = lerp(exitDoor.doorR.position.x, .6 + exitDoor.open * .62, Math.min(1, dt * 2));
    exitDoor.cab.intensity = lerp(exitDoor.cab.intensity, exitDoor.open ? 4 : 0, Math.min(1, dt * 2));
  }
  tWater.offset.x += dt * .012; tWater.offset.y += dt * .008;
  const li = updLights(dt, flick);
  updDust(time, li / SPOT);
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) ui.msg.style.opacity = 0; }
  ui.red.style.opacity = near * near * .9;
  ui.grain.style.opacity = .07 + near * near * .26;
  grainT -= dt; if (grainT <= 0) { grainT = .045; drawGrain(); }
  if (!window.__game.noRender) renderer.render(scene, camera);
}
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (state === 'pause') { renderer.render(scene, camera); return; }
  frame(dt);
}
requestAnimationFrame(loop);

window.__game = {
  P, mon, items, gens, lockers, bolts, lamps, keys: keysDown, MAP, cw, field, frame,
  exitDoor, camera, isWater, throwBolt, doInteract, pan,
  get state() { return state; }, get prompt() { return promptText; },
};
})();
