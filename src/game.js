(() => {
'use strict';
const T = THREE;
const $ = id => document.getElementById(id);

// ───────────────────────── utils
let seed = 90210;
function rnd() { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const rr = (a, b) => a + rnd() * (b - a);
const R = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const pick = a => a[(rnd() * a.length) | 0];

// ───────────────────────── level
const CS = 3, WH = 3;
const MAP = [
  '#######################',
  '#P..L....#b.K#....#Nb.#',
  '#.##.###.#...#.##.#...#',
  '#.#b.#c..#.#.#.#c...#.#',
  '#.#..#.###.#...#.####.#',
  '#...L#..B..####.....L.#',
  '###.##.###.#K.#.###.###',
  '#b#....#r#.#..#.#w#...#',
  '#.####.#.#L##.#.#.#.#.#',
  '#K...#.....#....L...#B#',
  '#.##.#####.#.####.###.#',
  '#.#B.....#...#r.#.N.#.#',
  '#.####.#.#####..#.#.#.#',
  '#N...#.#L....#.##.#...#',
  '####.#.####.##....###.#',
  '#Kc#.#....#....##.#M..#',
  '#..#.####.####.#..#.#.#',
  '#.L....b#....L...r#.#K#',
  '#############E#########',
];
const H = MAP.length, W = MAP[0].length;
const solid = (x, z) => x < 0 || z < 0 || x >= W || z >= H || MAP[z][x] === '#' || MAP[z][x] === 'E';
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const cw = c => (c + .5) * CS;
const cellOf = v => Math.floor(v / CS);
const floorCells = [];
for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (!solid(x, z)) floorCells.push([x, z]);

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
function los(ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / .25);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (solid(cellOf(ax + (bx - ax) * t), cellOf(az + (bz - az) * t))) return false;
  }
  return true;
}
const boxes = []; // prop colliders [x0,z0,x1,z1]
function pushOut(p, r, x0, z0, x1, z1) {
  const nx = clamp(p.x, x0, x1), nz = clamp(p.z, z0, z1);
  const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  if (d2 > 1e-9) { const d = Math.sqrt(d2); p.x = nx + dx / d * r; p.z = nz + dz / d * r; return; }
  const l = p.x - x0, ri = x1 - p.x, t = p.z - z0, b = z1 - p.z, m = Math.min(l, ri, t, b);
  if (m === l) p.x = x0 - r; else if (m === ri) p.x = x1 + r; else if (m === t) p.z = z0 - r; else p.z = z1 + r;
}
function collide(p, r, props) {
  const cx = cellOf(p.x), cz = cellOf(p.z);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const x = cx + dx, z = cz + dz;
    if (solid(x, z)) pushOut(p, r, x * CS, z * CS, (x + 1) * CS, (z + 1) * CS);
  }
  if (props) for (const b of boxes) pushOut(p, r, b[0], b[1], b[2], b[3]);
}

// ───────────────────────── procedural textures
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return [c, c.getContext('2d')]; }
function grain(g, amt) {
  const w = g.canvas.width, h = g.canvas.height, id = g.getImageData(0, 0, w, h), d = id.data;
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
    g.lineWidth = R(.5, 1.6); g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < len; k++) { a += R(-.7, .7); x += Math.cos(a) * 7; y += Math.sin(a) * 7; g.lineTo(x, y); }
    g.stroke();
  }
}
function tex(c, rx = 1, ry = 1) {
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function wallTex() {
  const [c, g] = cv(512), S = 512, split = S * .56;
  g.fillStyle = '#8d8873'; g.fillRect(0, 0, S, split);
  g.fillStyle = '#46584a'; g.fillRect(0, split, S, S - split);
  // peeling paint
  for (let i = 0; i < 26; i++) {
    const x = R(0, S), y = R(split + 10, S - 40), r = R(8, 34);
    g.fillStyle = `rgba(${130 + R(-15, 15) | 0},${122 + R(-15, 15) | 0},${100 + R(-10, 10) | 0},.9)`;
    g.beginPath();
    for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28, q = r * R(.45, 1); g.lineTo(x + Math.cos(a) * q * 1.4, y + Math.sin(a) * q); }
    g.fill();
  }
  g.fillStyle = '#2a2f27'; g.fillRect(0, split - 5, S, 9);
  g.fillStyle = '#22211d'; g.fillRect(0, S - 34, S, 34);
  blot(g, 60, '30,26,18', 20, 90, .35);
  blot(g, 26, '14,24,12', 20, 70, .55, .8, 1);
  blot(g, 18, '20,16,10', 30, 90, .6, 0, .12);
  for (let i = 0; i < 40; i++) { // drips
    const x = R(0, S), y = R(0, S * .5), l = R(40, 260), gr = g.createLinearGradient(0, y, 0, y + l);
    gr.addColorStop(0, 'rgba(35,26,14,.5)'); gr.addColorStop(1, 'rgba(35,26,14,0)');
    g.fillStyle = gr; g.fillRect(x, y, R(1.5, 5), l);
  }
  cracks(g, 9, 'rgba(15,12,8,.75)', 16);
  grain(g, 34);
  return tex(c);
}
function floorTex() {
  const [c, g] = cv(512), n = 4, s = 512 / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = (x + y) & 1, b = R(-10, 10) | 0;
    g.fillStyle = d ? `rgb(${52 + b},${50 + b},${44 + b})` : `rgb(${104 + b},${98 + b},${84 + b})`;
    g.fillRect(x * s, y * s, s, s);
  }
  g.strokeStyle = '#141310'; g.lineWidth = 4;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 512); g.moveTo(0, i * s); g.lineTo(512, i * s); g.stroke(); }
  blot(g, 50, '18,14,8', 20, 100, .5);
  blot(g, 5, '50,6,4', 20, 60, .55);
  cracks(g, 10, 'rgba(10,9,7,.8)', 12);
  grain(g, 40);
  return tex(c, W, H);
}
function ceilTex() {
  const [c, g] = cv(512);
  g.fillStyle = '#5b5850'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#1c1b18'; g.lineWidth = 5;
  for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * 256, 0); g.lineTo(i * 256, 512); g.moveTo(0, i * 256); g.lineTo(512, i * 256); g.stroke(); }
  for (let i = 0; i < 9; i++) { // water rings
    const x = R(0, 512), y = R(0, 512), r = R(30, 110);
    g.strokeStyle = `rgba(48,34,16,${R(.3, .6)})`; g.lineWidth = R(3, 9); g.beginPath(); g.arc(x, y, r, 0, 6.28); g.stroke();
    blot(g, 1, '40,30,14', r, r, .01);
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(46,34,18,.45)'); gr.addColorStop(1, 'rgba(46,34,18,.1)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
  }
  blot(g, 40, '12,10,8', 20, 80, .45);
  grain(g, 30);
  return tex(c, W, H);
}
function metalTex(rust) {
  const [c, g] = cv(256);
  g.fillStyle = rust > .5 ? '#4f4034' : '#5d6466'; g.fillRect(0, 0, 256, 256);
  blot(g, 30 + rust * 80, '110,52,20', 6, 40, .7);
  blot(g, 20 + rust * 30, '40,20,10', 6, 30, .7);
  g.strokeStyle = 'rgba(210,210,200,.16)';
  for (let i = 0; i < 50; i++) { const x = R(0, 256), y = R(0, 256); g.lineWidth = R(.4, 1.2); g.beginPath(); g.moveTo(x, y); g.lineTo(x + R(-40, 40), y + R(-8, 8)); g.stroke(); }
  grain(g, 30);
  return tex(c);
}
function woodTex() {
  const [c, g] = cv(256);
  g.fillStyle = '#4a3320'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 180; i++) { g.strokeStyle = `rgba(${R(10, 90) | 0},${R(8, 55) | 0},${R(5, 25) | 0},.4)`; g.lineWidth = R(.5, 2.5); const y = R(0, 256); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(80, y + R(-6, 6), 170, y + R(-6, 6), 256, y + R(-4, 4)); g.stroke(); }
  g.fillStyle = '#120c07'; for (let i = 1; i < 4; i++) g.fillRect(0, i * 64 - 2, 256, 4);
  blot(g, 14, '10,7,4', 10, 50, .6);
  grain(g, 26);
  return tex(c);
}
function fabricTex() {
  const [c, g] = cv(256);
  g.fillStyle = '#b3ad98'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(70,80,95,.35)'; g.lineWidth = 3;
  for (let i = 0; i < 16; i++) { g.beginPath(); g.moveTo(i * 16 + 8, 0); g.lineTo(i * 16 + 8, 256); g.stroke(); }
  blot(g, 26, '110,84,30', 14, 60, .55);
  blot(g, 5, '70,6,4', 18, 55, .9);
  blot(g, 16, '20,16,10', 10, 40, .5);
  grain(g, 30);
  return tex(c);
}
function skinTex() {
  const [c, g] = cv(256);
  g.fillStyle = '#a39d93'; g.fillRect(0, 0, 256, 256);
  blot(g, 40, '60,50,60', 10, 50, .5);
  blot(g, 20, '190,180,165', 8, 30, .5);
  blot(g, 12, '70,14,10', 6, 26, .6);
  for (let i = 0; i < 26; i++) {
    let x = R(0, 256), y = R(0, 256), a = R(0, 6.28);
    g.strokeStyle = `rgba(${R(40, 80) | 0},${R(20, 40) | 0},${R(60, 95) | 0},.55)`; g.lineWidth = R(.6, 2);
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 18; k++) { a += R(-.6, .6); x += Math.cos(a) * 6; y += Math.sin(a) * 6; g.lineTo(x, y); }
    g.stroke();
  }
  grain(g, 28);
  return tex(c, 2, 2);
}
function doorTex() {
  const [c, g] = cv(256, 512);
  g.fillStyle = '#3d4a44'; g.fillRect(0, 0, 256, 512);
  g.strokeStyle = '#161a18'; g.lineWidth = 5;
  g.strokeRect(22, 24, 212, 200); g.strokeRect(22, 250, 212, 238);
  g.fillStyle = '#050606'; g.fillRect(78, 60, 100, 44);
  g.strokeStyle = '#70756f'; g.lineWidth = 3; g.strokeRect(78, 60, 100, 44);
  for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(98 + i * 20, 60); g.lineTo(98 + i * 20, 104); g.stroke(); }
  g.fillStyle = '#8b8d86'; g.fillRect(196, 262, 26, 12); g.fillRect(200, 250, 16, 46);
  blot(g, 50, '110,52,20', 6, 40, .7); blot(g, 30, '12,10,8', 10, 60, .6);
  for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(70,5,5,.55)'; g.fillRect(R(30, 220), R(250, 330), R(2, 5), R(40, 170)); }
  grain(g, 30);
  const t = tex(c); t.wrapS = t.wrapT = T.ClampToEdgeWrapping; return t;
}
const RED = () => `rgba(${R(85, 125) | 0},${R(2, 10) | 0},${R(2, 8) | 0},${R(.75, .95)})`;
function bloodDecal() {
  const [c, g] = cv(256);
  const cx = R(90, 166), cy = R(70, 130);
  for (let i = 0; i < 90; i++) {
    const a = R(0, 6.28), d = Math.pow(Math.random(), 1.8) * 110, r = R(1.5, 20) * (1 - d / 150);
    g.fillStyle = RED(); g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * .8, Math.max(1, r), 0, 6.28); g.fill();
  }
  for (let i = 0; i < 9; i++) {
    const x = cx + R(-50, 50), w = R(2.5, 6), l = R(30, 120);
    g.fillStyle = RED(); g.fillRect(x, cy, w, l); g.beginPath(); g.arc(x + w / 2, cy + l, w * .8, 0, 6.28); g.fill();
  }
  return c;
}
function handDecal() {
  const [c, g] = cv(256);
  for (let h = 0; h < 2; h++) {
    g.save(); g.translate(80 + h * 95, 95 + R(-15, 25)); g.rotate(R(-.35, .35)); g.fillStyle = RED();
    g.beginPath(); g.ellipse(0, 0, 26, 30, 0, 0, 6.28); g.fill();
    for (let f = 0; f < 4; f++) { g.save(); g.rotate(-.42 + f * .28); g.beginPath(); g.ellipse(0, -52, 6.5, 22, 0, 0, 6.28); g.fill(); g.restore(); }
    g.save(); g.rotate(h ? 1.25 : -1.25); g.beginPath(); g.ellipse(0, -36, 7, 17, 0, 0, 6.28); g.fill(); g.restore();
    const gr = g.createLinearGradient(0, 0, 0, 150); gr.addColorStop(0, 'rgba(95,5,5,.6)'); gr.addColorStop(1, 'rgba(95,5,5,0)');
    g.fillStyle = gr; g.fillRect(-24, 0, 48, 150);
    g.restore();
  }
  return c;
}
function textDecal(str) {
  const [c, g] = cv(512, 256), lines = str.split('|');
  g.textBaseline = 'middle';
  lines.forEach((ln, li) => {
    const size = Math.min(82, 470 / ln.length * 1.45);
    g.font = `bold ${size}px Georgia, serif`;
    let x = (512 - g.measureText(ln).width) / 2;
    const y = 256 * (li + .5) / lines.length;
    for (const ch of ln) {
      const w = g.measureText(ch).width;
      g.save(); g.translate(x + w / 2, y + R(-7, 7)); g.rotate(R(-.14, .14)); g.fillStyle = RED(); g.fillText(ch, -w / 2, 0); g.restore();
      if (Math.random() < .35 && ch !== ' ') { g.fillStyle = RED(); g.fillRect(x + w * R(.3, .7), y + size * .2, R(2, 4), R(15, 60)); }
      x += w;
    }
  });
  return c;
}
function tallyDecal() {
  const [c, g] = cv(256);
  g.strokeStyle = 'rgba(15,12,10,.85)'; g.lineWidth = 3; g.lineCap = 'round';
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

// ───────────────────────── renderer / scene
const canvas = $('c');
const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new T.Scene();
scene.background = new T.Color(0x000000);
scene.fog = new T.FogExp2(0x020203, .075);
const camera = new T.PerspectiveCamera(74, 1, .05, 60);
camera.rotation.order = 'YXZ';
scene.add(camera);
scene.add(new T.HemisphereLight(0x3a4658, 0x1a1410, .16));

const std = (o) => new T.MeshStandardMaterial(o);
const tWall = wallTex(), tFloor = floorTex(), tCeil = ceilTex(), tMetal = metalTex(.2), tRust = metalTex(1), tWood = woodTex(), tFab = fabricTex(), tSkin = skinTex(), tGlow = glowTex();
const mWall = std({ map: tWall, bumpMap: tWall, bumpScale: 1.6, roughness: .93 });
const mFloor = std({ map: tFloor, bumpMap: tFloor, bumpScale: 1.2, roughness: .62, metalness: .05 });
const mCeil = std({ map: tCeil, bumpMap: tCeil, bumpScale: 1, roughness: 1 });
const mMetal = std({ map: tMetal, bumpMap: tMetal, bumpScale: .6, roughness: .55, metalness: .7 });
const mRust = std({ map: tRust, bumpMap: tRust, bumpScale: 1.5, roughness: .85, metalness: .35 });
const mWood = std({ map: tWood, bumpMap: tWood, bumpScale: 1.2, roughness: .9 });
const mFab = std({ map: tFab, bumpMap: tFab, bumpScale: .6, roughness: 1 });
const mLeather = std({ color: 0x1b1512, roughness: .7 });
const mDark = std({ color: 0x030202, roughness: 1 });

function M(geo, mat, x, y, z, parent) {
  const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
const Box = (w, h, d) => new T.BoxGeometry(w, h, d);
const Cyl = (r1, r2, h, s = 12) => new T.CylinderGeometry(r1, r2, h, s);
const Sph = (r, a = 16, b = 12) => new T.SphereGeometry(r, a, b);

// floor / ceiling
{
  const g = new T.PlaneGeometry(W * CS, H * CS);
  const f = new T.Mesh(g, mFloor); f.rotation.x = -Math.PI / 2; f.position.set(W * CS / 2, 0, H * CS / 2); f.receiveShadow = true; scene.add(f);
  const c = new T.Mesh(g, mCeil); c.rotation.x = Math.PI / 2; c.position.set(W * CS / 2, WH, H * CS / 2); c.receiveShadow = true; scene.add(c);
}
// walls
{
  const cells = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++)
    if (solid(x, z) && DIRS.some(([dx, dz]) => !solid(x + dx, z + dz))) cells.push([x, z]);
  const im = new T.InstancedMesh(Box(CS, WH, CS), mWall, cells.length);
  const m4 = new T.Matrix4(), col = new T.Color();
  cells.forEach(([x, z], i) => {
    m4.makeTranslation(cw(x), WH / 2, cw(z)); im.setMatrixAt(i, m4);
    const v = rr(.72, 1); col.setRGB(v, v * rr(.94, 1), v * rr(.88, 1)); im.setColorAt(i, col);
  });
  im.castShadow = im.receiveShadow = true; scene.add(im);
}

// props
const wallDir = (x, z) => DIRS.filter(([dx, dz]) => solid(x + dx, z + dz) && MAP[z + dz][x + dx] !== 'E');
const faceRot = (dx, dz) => Math.atan2(-dx, -dz); // local -z points at the wall
function place(obj, x, z, depth, hw, off = 0) {
  const ds = wallDir(x, z); if (!ds.length) return;
  const [dx, dz] = pick(ds), k = CS / 2 - depth / 2 - .06 - off;
  obj.position.set(cw(x) + dx * k, 0, cw(z) + dz * k);
  obj.rotation.y = faceRot(dx, dz);
  scene.add(obj);
  const ex = dx ? depth / 2 : hw, ez = dx ? hw : depth / 2;
  boxes.push([obj.position.x - ex, obj.position.z - ez, obj.position.x + ex, obj.position.z + ez]);
}
function bed() {
  const g = new T.Group();
  M(Box(2, .05, .9), mMetal, 0, .45, 0, g);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) M(Cyl(.028, .028, .45), mMetal, sx * .95, .225, sz * .4, g);
  M(Box(1.9, .15, .82), mFab, 0, .55, 0, g);
  M(Box(.42, .1, .6), mFab, -.68, .67, 0, g).rotation.y = rr(-.2, .2);
  for (const [x, h, ys] of [[-1, 1.05, [.62, .78, .94]], [1, .8, [.55, .7]]]) {
    for (const sz of [-1, 1]) M(Cyl(.028, .028, h), mMetal, x, h / 2, sz * .43, g);
    for (const y of ys) M(Cyl(.018, .018, .86), mMetal, x, y, 0, g).rotation.x = Math.PI / 2;
  }
  for (const x of [-.25, .45]) M(Box(.09, .17, .86), mLeather, x, .555, 0, g); // restraints
  return g;
}
function cabinet() {
  const g = new T.Group();
  M(Box(.9, 1.9, .45), mMetal, 0, .95, 0, g);
  M(Box(.015, 1.8, .01), mDark, 0, .95, .228, g);
  M(Box(.03, .16, .03), mRust, -.06, 1.05, .24, g);
  const hinge = new T.Group(); hinge.position.set(.45, .95, .225); hinge.rotation.y = rr(.5, 1.3); g.add(hinge);
  M(Box(.44, 1.84, .02), mMetal, -.22, 0, 0, hinge);
  M(Box(.4, 1.8, .02), mDark, .22, .95, .215, g);
  for (const y of [.5, 1, 1.5]) M(Box(.42, .02, .4), mMetal, .22, y, 0, g);
  return g;
}
function wheelchair() {
  const g = new T.Group();
  M(Box(.46, .04, .44), mLeather, 0, .5, 0, g);
  M(Box(.46, .5, .04), mLeather, 0, .8, -.22, g);
  for (const s of [-1, 1]) {
    const wh = new T.Group(); wh.position.set(s * .28, .3, -.05); wh.rotation.y = Math.PI / 2; g.add(wh);
    M(new T.TorusGeometry(.29, .018, 8, 24), mDark, 0, 0, 0, wh);
    for (let i = 0; i < 4; i++) M(Cyl(.006, .006, .56, 5), mMetal, 0, 0, 0, wh).rotation.z = i * Math.PI / 4;
    const fw = M(new T.TorusGeometry(.07, .018, 6, 14), mDark, s * .2, .09, .3, g); fw.rotation.y = Math.PI / 2;
    M(Cyl(.014, .014, .42), mMetal, s * .2, .3, .28, g);
    M(Box(.04, .03, .4), mLeather, s * .25, .7, -.02, g);
    M(Cyl(.014, .014, .22), mMetal, s * .25, .6, .17, g);
    M(Cyl(.016, .016, .5), mMetal, s * .22, .82, -.25, g);
    const hd = M(Cyl(.02, .02, .14), mLeather, s * .22, 1.06, -.31, g); hd.rotation.x = Math.PI / 2;
    M(Box(.14, .015, .1), mMetal, s * .13, .12, .36, g);
  }
  g.rotation.y = rr(-.8, .8);
  const w = new T.Group(); w.add(g); return w;
}
function junk() {
  const g = new T.Group();
  const b = M(Cyl(.3, .3, .9, 18), mRust, -.42, .45, 0, g);
  for (const y of [-.25, .25]) M(new T.TorusGeometry(.305, .014, 6, 20), mRust, 0, y, 0, b).rotation.x = Math.PI / 2;
  M(Box(.7, .7, .7), mWood, .36, .35, 0, g).rotation.y = rr(-.15, .15);
  const c2 = M(Box(.42, .42, .42), mWood, .32, .91, 0, g); c2.rotation.y = rr(.2, .7);
  return g;
}

// decals
const decalMats = [];
{
  const mk = c => { const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return std({ map: t, transparent: true, depthWrite: false, roughness: .55, polygonOffset: true, polygonOffsetFactor: -4 }); };
  for (let i = 0; i < 4; i++) decalMats.push([mk(bloodDecal()), 1.5, 1.5]);
  for (let i = 0; i < 2; i++) decalMats.push([mk(handDecal()), 1.1, 1.1]);
  for (const s of ['ОНО СЛЫШИТ', 'НЕ БЕГИ', 'ВЫХОДА|НЕТ', 'ТИШЕ', 'ОНО|ЗА СПИНОЙ', 'ПРОСТИТЕ']) decalMats.push([mk(textDecal(s)), 2.1, 1.05]);
  decalMats.push([mk(tallyDecal()), 1, 1]);
  const bl = decalMats.slice(0, 4);
  for (const [x, z] of floorCells) {
    for (const [dx, dz] of wallDir(x, z)) if (rnd() < .2) {
      const [m, w, h] = pick(decalMats), p = new T.Mesh(new T.PlaneGeometry(w, h), m);
      p.position.set(cw(x) + dx * (CS / 2 - .012) + (dz ? rr(-.4, .4) : 0), rr(1.1, 1.8), cw(z) + dz * (CS / 2 - .012) + (dx ? rr(-.4, .4) : 0));
      p.rotation.y = faceRot(dx, dz); p.receiveShadow = true; scene.add(p);
    }
    if (rnd() < .1) {
      const [m] = pick(bl), s = rr(1, 2.2), p = new T.Mesh(new T.PlaneGeometry(s, s), m);
      p.rotation.x = -Math.PI / 2; p.rotation.z = rr(0, 6.28); p.position.set(cw(x) + rr(-.5, .5), .012, cw(z) + rr(-.5, .5)); p.receiveShadow = true; scene.add(p);
    }
    if (rnd() < .3) { // ceiling pipe
      const ds = wallDir(x, z); if (!ds.length) continue;
      const [dx, dz] = pick(ds), p = M(Cyl(.06, .06, CS, 10), mRust, cw(x) + dx * (CS / 2 - .16), WH - .2, cw(z) + dz * (CS / 2 - .16), scene);
      if (dx) p.rotation.x = Math.PI / 2; else p.rotation.z = Math.PI / 2;
      if (rnd() < .5) { const q = M(Cyl(.03, .03, CS, 8), mMetal, p.position.x - dx * .14, WH - .12, p.position.z - dz * .14, scene); q.rotation.copy(p.rotation); }
    }
  }
}

// lamps, items, spawn points
const lamps = [], items = [];
let start = [1, 1], monStart = [1, 1], exitDoor = null, totalKeys = 0;
const mGold = std({ color: 0xd8a83a, metalness: .9, roughness: .3, emissive: 0x5a3a00 });
function glow(color, s) { const sp = new T.Sprite(new T.SpriteMaterial({ map: tGlow, color, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: .7 })); sp.scale.setScalar(s); return sp; }
function keyModel() {
  const g = new T.Group(), k = new T.Group(); g.add(k);
  const r = M(new T.TorusGeometry(.07, .018, 8, 20), mGold, 0, .1, 0, k);
  M(Cyl(.013, .013, .22, 8), mGold, 0, -.07, 0, k);
  M(Box(.05, .022, .014), mGold, .03, -.15, 0, k); M(Box(.035, .022, .014), mGold, .024, -.105, 0, k);
  r.castShadow = false; k.scale.setScalar(1.7); k.rotation.z = .5; g.add(glow(0xffb040, .9));
  return g;
}
function batteryModel() {
  const g = new T.Group(), k = new T.Group(); g.add(k);
  M(Cyl(.035, .035, .13, 12), std({ color: 0x2f7a3a, emissive: 0x0f3a14, roughness: .5 }), 0, 0, 0, k);
  M(Cyl(.035, .035, .03, 12), mMetal, 0, .08, 0, k); M(Cyl(.012, .012, .02, 8), mMetal, 0, .105, 0, k);
  k.rotation.z = .6; k.scale.setScalar(1.5); g.add(glow(0x50ff70, .6));
  return g;
}
function noteModel() {
  const [c, x] = cv(128, 160); x.fillStyle = '#cfc5a6'; x.fillRect(0, 0, 128, 160);
  x.fillStyle = 'rgba(30,25,20,.75)'; for (let i = 0; i < 11; i++) x.fillRect(12, 16 + i * 12, R(60, 104), 2);
  blot(x, 8, '90,60,20', 10, 40, .5); blot(x, 2, '90,5,5', 8, 20, .8);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
  const g = new T.Group(), p = new T.Mesh(new T.PlaneGeometry(.26, .33), std({ map: t, emissive: 0x2a2820, side: T.DoubleSide, roughness: 1 }));
  p.rotation.x = -.5; g.add(p); g.add(glow(0xd8d0b0, .5));
  return g;
}
function signTex(ok) {
  const [c, g] = cv(256, 64); g.fillStyle = '#050505'; g.fillRect(0, 0, 256, 64);
  g.font = 'bold 44px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = g.fillStyle = ok ? '#35ff6a' : '#ff2a1c'; g.shadowBlur = 14; g.fillText('ВЫХОД', 128, 34);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
  const ch = MAP[z][x];
  if (ch === 'P') start = [x, z];
  else if (ch === 'M') monStart = [x, z];
  else if (ch === 'b') place(bed(), x, z, .9, 1.0);
  else if (ch === 'c') place(cabinet(), x, z, .45, .45);
  else if (ch === 'w') place(wheelchair(), x, z, .7, .35, .25);
  else if (ch === 'r') place(junk(), x, z, .75, .75);
  else if (ch === 'L') {
    const flick = rnd() < .6, col = flick ? 0xcfe6c8 : 0xffd9a0;
    const light = new T.PointLight(col, 0, 9.5, 1.7); light.position.set(cw(x), WH - .45, cw(z)); scene.add(light);
    M(Box(1.2, .07, .3), mMetal, cw(x), WH - .035, cw(z), scene);
    const pm = new T.MeshBasicMaterial({ color: col });
    M(Box(1.1, .03, .2), pm, cw(x), WH - .08, cw(z), scene).castShadow = false;
    lamps.push({ light, pm, col: new T.Color(col), base: flick ? 9 : 6, flick, f: 1, next: 0 });
  } else if (ch === 'K' || ch === 'B' || ch === 'N') {
    const o = ch === 'K' ? keyModel() : ch === 'B' ? batteryModel() : noteModel();
    o.position.set(cw(x), ch === 'N' ? .85 : 1.05, cw(z)); scene.add(o);
    items.push({ type: ch, o, x: cw(x), z: cw(z), ph: rr(0, 6) });
    if (ch === 'K') totalKeys++;
  } else if (ch === 'E') {
    const [dx, dz] = DIRS.find(([dx, dz]) => !solid(x + dx, z + dz));
    const g = new T.Group();
    g.position.set(cw(x) + dx * (CS / 2 + .02), 0, cw(z) + dz * (CS / 2 + .02));
    g.rotation.y = Math.atan2(dx, dz);
    M(Box(1.25, 2.25, .08), std({ map: doorTex(), roughness: .6, metalness: .5 }), 0, 1.125, 0, g);
    M(Box(.12, 2.4, .16), mRust, -.69, 1.2, 0, g); M(Box(.12, 2.4, .16), mRust, .69, 1.2, 0, g); M(Box(1.5, .14, .16), mRust, 0, 2.38, 0, g);
    const sm = new T.MeshBasicMaterial({ map: signTex(false) });
    M(Box(.95, .26, .06), sm, 0, 2.66, .02, g).castShadow = false;
    const sl = new T.PointLight(0xff2010, 2.2, 6, 1.8); sl.position.set(0, 2.5, .5); g.add(sl);
    scene.add(g);
    exitDoor = { x: g.position.x, z: g.position.z, sm, sl };
  }
}

// ───────────────────────── monster
function buildMonster() {
  const skin = std({ map: tSkin, bumpMap: tSkin, bumpScale: 2, roughness: .8, color: 0x8f8a84 });
  const bone = std({ color: 0xcfc6a8, roughness: .5 });
  const eyeM = new T.MeshBasicMaterial({ color: 0xff3018 });
  const g = new T.Group(), body = new T.Group(); body.position.y = 1.2; g.add(body);
  M(Sph(.17), skin, 0, 0, 0, body).scale.set(1.1, .75, .8);
  const spine = new T.Group(); body.add(spine);
  M(new T.CapsuleGeometry(.16, .5, 6, 14), skin, 0, .44, 0, spine).scale.set(1.15, 1, .72);
  for (let i = 0; i < 5; i++) {
    const rib = M(new T.TorusGeometry(.17 + i * .006, .017, 6, 18), skin, 0, .26 + i * .095, .005, spine);
    rib.rotation.x = Math.PI / 2 + .12; rib.scale.set(1.17, .76, 1);
  }
  for (let i = 0; i < 8; i++) M(Sph(.032, 8, 6), skin, 0, .08 + i * .095, -.125, spine);
  M(Cyl(.05, .065, .2, 10), skin, 0, .86, .02, spine);
  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    M(Sph(.095), skin, s * .26, .72, 0, spine);
    const sh = new T.Group(); sh.position.set(s * .3, .72, 0); spine.add(sh);
    M(new T.CapsuleGeometry(.043, .5, 4, 10), skin, 0, -.3, 0, sh);
    const el = new T.Group(); el.position.y = -.6; sh.add(el);
    M(Sph(.05, 10, 8), skin, 0, 0, 0, el);
    M(new T.CapsuleGeometry(.036, .55, 4, 10), skin, 0, -.32, 0, el);
    M(Box(.075, .11, .035), skin, 0, -.67, 0, el);
    for (let i = 0; i < 4; i++) {
      const cl = M(new T.ConeGeometry(.011, .24, 6), bone, (i - 1.5) * .022, -.83, 0, el);
      cl.rotation.x = Math.PI; cl.rotation.z = (i - 1.5) * .1;
    }
    arms.push({ sh, el, s });
    const hip = new T.Group(); hip.position.set(s * .11, -.02, 0); body.add(hip);
    M(new T.CapsuleGeometry(.062, .45, 4, 10), skin, 0, -.29, 0, hip);
    const kn = new T.Group(); kn.position.y = -.58; hip.add(kn);
    M(Sph(.06, 10, 8), skin, 0, 0, 0, kn);
    M(new T.CapsuleGeometry(.046, .45, 4, 10), skin, 0, -.29, 0, kn);
    M(Box(.09, .05, .25), skin, 0, -.575, .07, kn);
    legs.push({ hip, kn, s });
  }
  const head = new T.Group(); head.position.set(0, 1.03, .05); spine.add(head);
  const voidM = new T.MeshBasicMaterial({ color: 0x000000 });
  M(Sph(.15, 22, 16), skin, 0, .03, 0, head).scale.set(.84, 1.28, .96);
  for (const s of [-1, 1]) {
    const so = M(Sph(.05, 14, 10), voidM, s * .06, .05, .112, head); so.scale.set(1.15, .85, .5); so.rotation.z = -s * .25; so.castShadow = false;
    M(Sph(.007, 8, 6), eyeM, s * .058, .048, .141, head).castShadow = false;
    M(Box(.007, .028, .01), voidM, s * .011, -.012, .141, head).castShadow = false;
  }
  M(Sph(.085, 14, 10), voidM, 0, -.092, .088, head).scale.set(1.12, .7, .55);
  for (let i = 0; i < 9; i++) { const t = M(new T.ConeGeometry(.007, .06, 5), bone, (i - 4) * .0165, -.082, .136 - Math.abs(i - 4) * .005, head); t.rotation.x = Math.PI; t.rotation.z = R(-.12, .12); }
  const jaw = new T.Group(); jaw.position.set(0, -.09, .02); head.add(jaw);
  M(Sph(.1, 14, 10), skin, 0, -.05, .045, jaw).scale.set(.84, .42, 1);
  for (let i = 0; i < 9; i++) M(new T.ConeGeometry(.007, .055, 5), bone, (i - 4) * .0155, -.012, .125 - Math.abs(i - 4) * .005, jaw).rotation.z = R(-.12, .12);
  const eye = new T.PointLight(0xff2a10, .25, 2.5, 2); eye.position.set(0, .05, .35); head.add(eye);
  g.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  return { g, body, spine, head, jaw, arms, legs, eye };
}
const mm = buildMonster();
scene.add(mm.g);
const mon = { x: cw(monStart[0]), z: cw(monStart[1]), state: 'patrol', tx: 0, tz: 0, f: null, fc: -1, wait: 1, lost: 0, phase: 0, chase: 0, yaw: 0, step: 0, twitch: 0 };
mon.tx = mon.x; mon.tz = mon.z;

function animMonster(dt, speed, t) {
  mon.phase += speed * dt * 2.3;
  const c = mon.chase, s = Math.sin(mon.phase), idle = Math.sin(t * 1.3) * .03;
  for (const l of mm.legs) {
    const v = l.s > 0 ? s : -s, m = Math.min(1, speed);
    l.hip.rotation.x = -v * .62 * m - .12;
    l.kn.rotation.x = .2 + Math.max(0, v) * .9 * m;
  }
  for (const a of mm.arms) {
    const v = a.s > 0 ? -s : s;
    a.sh.rotation.x = lerp(v * .4 + .05, -1.45 + v * .22, c);
    a.sh.rotation.z = a.s * lerp(.1 + idle, .28, c);
    a.el.rotation.x = lerp(-.25, -.5 + Math.sin(t * 13 + a.s) * .12, c);
  }
  mm.spine.rotation.x = lerp(.3, .5, c) + idle;
  mm.spine.rotation.y = s * .1;
  mm.body.position.y = 1.2 - Math.abs(s) * .035 * Math.min(1, speed) - .03;
  mon.twitch -= dt;
  if (mon.twitch < 0) { mon.twitch = R(.08, c > .5 ? .3 : 2.5); mm.head.rotation.z = R(-.45, .45) * (Math.random() < .4 ? 1 : .15); mm.head.rotation.y = R(-.5, .5) * (1 - c); }
  mm.head.rotation.x = lerp(-.15, -.45, c);
  mm.jaw.rotation.x = lerp(.08, .6, c) + Math.abs(Math.sin(t * 17)) * .12 * c;
}

// ───────────────────────── player, flashlight, dust
const P = { x: cw(start[0]), z: cw(start[1]), yaw: -Math.PI / 2, pitch: 0, vx: 0, vz: 0, sta: 1, tired: false, bat: 1, on: true, bob: 0, step: 0, keys: 0, notes: 0 };
const SPOT = 30;
const spot = new T.SpotLight(0xfff0d2, 0, 30, .56, .5, 1.1);
spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.camera.near = .3; spot.shadow.camera.far = 30; spot.shadow.bias = -.003;
spot.position.set(.24, -.2, -.56); camera.add(spot); spot.target.position.set(0, 0, -6); camera.add(spot.target);
const torch = new T.Group(), mLens = new T.MeshBasicMaterial({ color: 0xfff3d8 });
{
  const bm = std({ color: 0x18191b, roughness: .45, metalness: .8, emissive: 0x161616 });
  M(Cyl(.02, .02, .2, 12), bm, 0, 0, .06, torch).rotation.x = Math.PI / 2;
  M(Cyl(.036, .022, .07, 14), bm, 0, 0, -.07, torch).rotation.x = -Math.PI / 2;
  M(Cyl(.03, .03, .004, 14), mLens, 0, 0, -.107, torch).rotation.x = Math.PI / 2;
  torch.traverse(o => { o.castShadow = false; o.receiveShadow = false; });
  torch.position.set(.24, -.21, -.42); torch.rotation.set(.06, .1, 0); camera.add(torch);
}
const DN = 320, dPos = new Float32Array(DN * 3), dCol = new Float32Array(DN * 3), dBase = [];
for (let i = 0; i < DN; i++) dBase.push([R(0, 12), R(0, 3), R(0, 12), R(0, 6.28)]);
const dustGeo = new T.BufferGeometry();
dustGeo.setAttribute('position', new T.BufferAttribute(dPos, 3)); dustGeo.setAttribute('color', new T.BufferAttribute(dCol, 3));
const dust = new T.Points(dustGeo, new T.PointsMaterial({ size: .022, vertexColors: true, blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
dust.frustumCulled = false; scene.add(dust);
const fwd = new T.Vector3();
function updDust(t, on) {
  camera.getWorldDirection(fwd);
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, c0 = Math.cos(.45);
  for (let i = 0; i < DN; i++) {
    const b = dBase[i];
    const x = ((b[0] + Math.sin(t * .2 + b[3]) * .3 - cx) % 12 + 18) % 12 - 6 + cx;
    const z = ((b[2] + Math.cos(t * .17 + b[3]) * .3 - cz) % 12 + 18) % 12 - 6 + cz;
    const y = (b[1] + t * .02 + Math.sin(t * .3 + b[3]) * .1) % 3;
    dPos[i * 3] = x; dPos[i * 3 + 1] = y; dPos[i * 3 + 2] = z;
    const vx = x - cx, vy = y - cy, vz = z - cz, d = Math.hypot(vx, vy, vz) || 1, cs = (vx * fwd.x + vy * fwd.y + vz * fwd.z) / d;
    const v = on && cs > c0 && d < 7 && d > .4 ? (cs - c0) / (1 - c0) * (1 - d / 7) * .6 * on : 0;
    dCol[i * 3] = v; dCol[i * 3 + 1] = v * .93; dCol[i * 3 + 2] = v * .8;
  }
  dustGeo.attributes.position.needsUpdate = dustGeo.attributes.color.needsUpdate = true;
}

// ───────────────────────── audio (fully synthesized)
const A = { c: null };
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
  // drone
  const dl = filt('lowpass', 150), dg = gain(.085); dl.connect(dg).connect(A.out);
  osc('sawtooth', 41).connect(dl); osc('sawtooth', 43.6).connect(dl); osc('sine', 82.9).connect(dl); osc('sine', 123.1).connect(gain(.25)).connect(dl);
  // wind
  const wb = filt('bandpass', 340, 1.4); loop().connect(wb).connect(gain(.05)).connect(A.out);
  const wl = osc('sine', .11), wg = gain(190); wl.connect(wg).connect(wb.frequency);
  // monster growl
  A.gG = gain(0); A.gP = C.createStereoPanner ? C.createStereoPanner() : null;
  const gl = filt('lowpass', 300), tr = gain(.55);
  A.gO = osc('sawtooth', 39); A.gO.connect(gl); osc('square', 58.5).connect(gain(.4)).connect(gl);
  loop().connect(filt('bandpass', 700, 2)).connect(gain(.5)).connect(gl);
  A.gT = osc('sine', 12); A.gT.connect(gain(.45)).connect(tr.gain);
  gl.connect(tr).connect(A.gG); if (A.gP) A.gG.connect(A.gP).connect(A.out); else A.gG.connect(A.out);
  // static
  A.sG = gain(0); loop().connect(filt('highpass', 2600)).connect(A.sG).connect(A.out);
}
function envGain(peak, att, dec, t0) {
  const C = A.c, g = C.createGain(), t = C.currentTime + (t0 || 0);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + att); g.gain.exponentialRampToValueAtTime(.0001, t + att + dec);
  return g;
}
function sNoise(vol, type, f, q, att, dec, t0, pan) {
  if (!A.c) return; const C = A.c, s = C.createBufferSource(), b = C.createBiquadFilter();
  s.buffer = A.nb; b.type = type; b.frequency.value = f; b.Q.value = q;
  let n = s.connect(b).connect(envGain(vol, att, dec, t0));
  if (pan !== undefined && C.createStereoPanner) { const p = C.createStereoPanner(); p.pan.value = pan; n = n.connect(p); }
  n.connect(A.out); const t = C.currentTime + (t0 || 0); s.start(t, Math.random() * 1.5); s.stop(t + att + dec + .05);
}
function sTone(vol, type, f0, f1, att, dec, t0) {
  if (!A.c) return; const C = A.c, o = C.createOscillator(), t = C.currentTime + (t0 || 0);
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + att + dec);
  o.connect(envGain(vol, att, dec, t0)).connect(A.out); o.start(t); o.stop(t + att + dec + .05);
}
const sfx = {
  step: run => { sNoise(run ? .3 : .16, 'lowpass', R(380, 620), 1, .005, .11); sTone(run ? .16 : .08, 'sine', 85, 50, .004, .08); },
  monStep: (v, pan) => { sNoise(v * .5, 'lowpass', 190, 1, .008, .22, 0, pan); sTone(v * .55, 'sine', 62, 34, .006, .2); },
  beat: () => { sTone(.5, 'sine', 68, 38, .012, .13); sTone(.36, 'sine', 60, 34, .012, .13, .2); },
  pickup: () => { sTone(.16, 'sine', 660, 660, .01, .2); sTone(.16, 'sine', 990, 990, .01, .5, .12); },
  paper: () => { sNoise(.12, 'bandpass', 3200, 1, .02, .25); },
  click: () => { sNoise(.2, 'highpass', 2500, 1, .001, .03); },
  blackout: () => { sTone(.6, 'sine', 120, 26, .01, 1.4); sNoise(.25, 'lowpass', 300, 1, .01, .7); },
  roar: () => { sTone(.4, 'sawtooth', 240, 52, .05, 1.3); sTone(.3, 'square', 163, 40, .05, 1.3); sNoise(.3, 'bandpass', 900, 1.5, .05, 1.1); },
  whisper: () => { const p = R(-1, 1); for (let i = 0; i < 6; i++) sNoise(R(.03, .07), 'bandpass', R(1700, 3400), 5, .05, R(.1, .25), i * R(.16, .26), p); },
  bang: () => { sTone(.35, 'sine', 90, 30, .005, .5); sNoise(.2, 'lowpass', 240, 1, .005, .6, 0, R(-1, 1)); },
  locked: () => { sNoise(.25, 'bandpass', 1200, 3, .002, .06); sNoise(.25, 'bandpass', 900, 3, .002, .08, .12); },
  screech: () => {
    if (!A.c) return;
    for (const f of [311, 466, 657, 1173, 1390]) { sTone(.3, 'sawtooth', f * R(.96, 1.04), f * R(.7, 1.5), .02, 1.7); sTone(.16, 'square', f * 1.5, f * .8, .02, 1.5); }
    sNoise(.7, 'bandpass', 2400, .7, .01, 1.7); sTone(.8, 'sine', 70, 28, .01, 1.6);
  },
  win: () => { [262, 330, 392, 523].forEach((f, i) => sTone(.14, 'sine', f, f, .4, 2.8, i * .35)); },
};

// ───────────────────────── UI / input
const ui = { hud: $('hud'), keys: $('keys'), bat: $('bBat').firstElementChild, sta: $('bSta').firstElementChild, msg: $('msg'), red: $('red'), grain: $('grain'), fade: $('fade'), dot: $('dot') };
let state = 'menu', time = 0, playTime = 0, touchMode = false, wasLocked = false, msgT = 0, blackout = 0, dieT = 0, lockMsgT = 0, eventT = 25, beatT = 0;
function say(text, dur = 4) { ui.msg.textContent = text; ui.msg.style.opacity = 1; msgT = dur; }
const NOTES = [
  '«12 марта. Пациент из шестой палаты перестал спать. Говорит, что по ночам кто-то ходит по потолку и считает нас».',
  '«Оно почти слепое в темноте. Но свет фонаря видит издалека. И слышит, когда бежишь. Гаси свет. Иди тихо».',
  '«Персонал эвакуирован. Двери заперли снаружи. Пять ключей остались внутри, вместе с ним. Простите нас».',
];
const keysDown = {};
addEventListener('keydown', e => {
  keysDown[e.code] = true;
  if (e.code === 'KeyF' && state === 'play') toggleLight();
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { keysDown[e.code] = false; });
addEventListener('blur', () => { for (const k in keysDown) keysDown[k] = false; });
function toggleLight() { if (P.bat <= 0) { say('Батарея села.', 2); return; } P.on = !P.on; sfx.click(); $('tLight').classList.toggle('act', P.on); }
function lock() { if (touchMode) return; try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { } }
document.addEventListener('mousemove', e => {
  if (state !== 'play' || document.pointerLockElement !== canvas) return;
  const mx = clamp(e.movementX, -250, 250), my = clamp(e.movementY, -250, 250);
  P.yaw -= mx * .0022; P.pitch = clamp(P.pitch - my * .0022, -1.45, 1.45);
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
  ui.keys.textContent = `КЛЮЧИ 0/${totalKeys}`;
  say('Где я?.. Надо найти ключи и выбираться отсюда.', 5);
}
$('start').addEventListener('pointerup', begin);
$('pause').addEventListener('click', () => { if (touchMode || !wasLocked) setState('play'); else lock(); });
canvas.addEventListener('click', () => { if (state === 'play' && document.pointerLockElement !== canvas) lock(); });
$('again').addEventListener('click', () => location.reload());

// touch controls: left half moves, right half looks
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
$('tRun').addEventListener('touchstart', e => { e.preventDefault(); tc.run = !tc.run; $('tRun').classList.toggle('act', tc.run); }, { passive: false });
$('tLight').addEventListener('touchstart', e => { e.preventDefault(); toggleLight(); }, { passive: false });

function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// film grain overlay
const gctx = ui.grain.getContext('2d'), gimg = gctx.createImageData(ui.grain.width, ui.grain.height);
let grainT = 0;
function drawGrain() {
  const d = gimg.data;
  for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  gctx.putImageData(gimg, 0, 0);
}

// ───────────────────────── game logic
function monHear(x, z) {
  if (mon.state === 'chase') return;
  mon.state = 'search'; mon.tx = x; mon.tz = z; mon.wait = 0;
}
function pickPatrol() {
  const pf = field(cellOf(P.x), cellOf(P.z)), mf = field(cellOf(mon.x), cellOf(mon.z));
  const near = Math.random() < .55 + P.keys * .06;
  const c = floorCells.filter(([x, z]) => { const i = x + z * W; return near ? pf[i] >= 3 && pf[i] <= 9 : mf[i] > 6; });
  const [x, z] = c.length ? c[(Math.random() * c.length) | 0] : floorCells[(Math.random() * floorCells.length) | 0];
  mon.tx = cw(x); mon.tz = cw(z);
}
const tmp = { x: 0, z: 0 };
function updMonster(dt) {
  const dx = P.x - mon.x, dz = P.z - mon.z, dist = Math.hypot(dx, dz);
  const lightOn = P.on && P.bat > 0;
  const sees = dist < (lightOn ? 17 : 6.5) && los(mon.x, mon.z, P.x, P.z);
  if (sees) {
    if (mon.state !== 'chase') { mon.state = 'chase'; sfx.roar(); }
    mon.lost = 0; mon.tx = P.x; mon.tz = P.z;
  } else if (mon.state === 'chase') {
    mon.lost += dt;
    if (mon.lost < 1.2) { mon.tx = P.x; mon.tz = P.z; }
    if (mon.lost > 6) { mon.state = 'search'; mon.wait = 0; }
  }
  const atT = Math.hypot(mon.tx - mon.x, mon.tz - mon.z) < .5;
  let speed = 0;
  if (mon.state === 'chase') { speed = 3.85 + P.keys * .12; if (atT && !sees) { mon.state = 'search'; mon.wait = 0; } }
  else if (mon.state === 'search') {
    speed = 2.7;
    if (atT) { speed = 0; mon.wait += dt; mon.yaw += Math.sin(mon.wait * 2.2) * dt * 2.5; if (mon.wait > 3) { mon.state = 'patrol'; mon.wait = 0; pickPatrol(); } }
  } else {
    speed = 1.5 + P.keys * .12;
    if (atT) { speed = 0; mon.wait -= dt; if (mon.wait <= 0) { mon.wait = R(.5, 2.5); pickPatrol(); } }
  }
  if (speed > 0) {
    const mc = cellOf(mon.x) + cellOf(mon.z) * W, tcx = cellOf(mon.tx), tcz = cellOf(mon.tz), tcell = tcx + tcz * W;
    if (mon.fc !== tcell) { mon.f = field(tcx, tcz); mon.fc = tcell; }
    let gx = mon.tx, gz = mon.tz;
    if (mc !== tcell && !(sees && dist < CS)) {
      const f = mon.f, x = mc % W, z = (mc / W) | 0; let best = f[mc] < 0 ? 1e9 : f[mc];
      if (f[mc] < 0) pickPatrol();
      for (const [ddx, ddz] of DIRS) { const n = x + ddx + (z + ddz) * W; if (!solid(x + ddx, z + ddz) && f[n] >= 0 && f[n] < best) { best = f[n]; gx = cw(x + ddx); gz = cw(z + ddz); } }
    }
    const vx = gx - mon.x, vz = gz - mon.z, d = Math.hypot(vx, vz) || 1, st = Math.min(d, speed * dt);
    tmp.x = mon.x + vx / d * st; tmp.z = mon.z + vz / d * st; collide(tmp, .38, false);
    mon.x = tmp.x; mon.z = tmp.z;
    let da = Math.atan2(vx, vz) - mon.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
    mon.yaw += da * Math.min(1, dt * 8);
    mon.step += st;
    if (mon.step > (mon.state === 'chase' ? 1.5 : 1.1)) { mon.step = 0; const v = clamp(1 - dist / 24, 0, 1); if (v > 0) sfx.monStep(v * v, pan(dx, dz)); }
  }
  mon.chase = lerp(mon.chase, mon.state === 'chase' ? 1 : 0, Math.min(1, dt * 4));
  if (dist < 1.05 && sees) die();
  return { dist, sees };
}
// stereo pan of a world offset: projection onto the player's right vector
function pan(dx, dz) { const d = Math.hypot(dx, dz) || 1; return clamp((Math.cos(P.yaw) * dx - Math.sin(P.yaw) * dz) / d, -1, 1); }

function die() {
  if (state !== 'play') return;
  state = 'dying'; dieT = 0; setState('dying');
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  P.pitch = .04; mon.x = P.x + fx * .82; mon.z = P.z + fz * .82; mon.yaw = Math.atan2(-fx, -fz); mon.chase = 1;
  P.on = true; sfx.screech(); spot.position.set(.1, -.15, 0); // pull the beam back so it lights the face

  if (A.c) { A.gG.gain.setTargetAtTime(0, A.c.currentTime, .05); A.sG.gain.setTargetAtTime(.25, A.c.currentTime, .02); }
}
function endScreen(won) {
  setState(won ? 'won' : 'dead');
  if (document.exitPointerLock) document.exitPointerLock();
  const m = Math.floor(playTime / 60), s = Math.floor(playTime % 60);
  $('endTitle').textContent = won ? 'ТЫ ВЫБРАЛСЯ' : 'ОНО НАШЛО ТЕБЯ';
  $('endTitle').style.color = won ? '#cfc8ba' : '';
  $('endSub').textContent = won ? `Дверь захлопнулась за спиной. Время: ${m}:${String(s).padStart(2, '0')}. Но ночью ты всё ещё слышишь шаги по потолку.` : `Ключей найдено: ${P.keys} из ${totalKeys}.`;
  if (A.c) { A.sG.gain.setTargetAtTime(0, A.c.currentTime, .3); A.gG.gain.setTargetAtTime(0, A.c.currentTime, .1); }
}

function updPlayer(dt) {
  let ix = (keysDown.KeyD || keysDown.ArrowRight ? 1 : 0) - (keysDown.KeyA || keysDown.ArrowLeft ? 1 : 0) + tc.mx;
  let iz = (keysDown.KeyS || keysDown.ArrowDown ? 1 : 0) - (keysDown.KeyW || keysDown.ArrowUp ? 1 : 0) + tc.my;
  const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
  const moving = il > .1;
  const wantRun = (keysDown.ShiftLeft || keysDown.ShiftRight || tc.run) && moving;
  if (P.sta <= 0) P.tired = true; else if (P.sta > .3) P.tired = false;
  const run = wantRun && !P.tired;
  P.sta = clamp(P.sta + (run ? -dt / 6 : dt / 9), 0, 1);
  const sp = run ? 5.3 : 3, s = Math.sin(P.yaw), c = Math.cos(P.yaw);
  const tx = (ix * c + iz * s) * sp, tz = (-ix * s + iz * c) * sp, k = 1 - Math.exp(-10 * dt);
  P.vx += (tx - P.vx) * k; P.vz += (tz - P.vz) * k;
  const ox = P.x, oz = P.z;
  P.x += P.vx * dt; P.z += P.vz * dt; collide(P, .34, true);
  const moved = Math.hypot(P.x - ox, P.z - oz);
  P.bob += moved * 1.75; P.step += moved;
  if (P.step > (run ? 2.3 : 1.75)) {
    P.step = 0; sfx.step(run);
    if (run && Math.hypot(P.x - mon.x, P.z - mon.z) < 34) monHear(P.x, P.z);
  }
  // flashlight
  if (P.on) { P.bat = Math.max(0, P.bat - dt / 210); if (P.bat <= 0) { P.on = false; say('Фонарь погас. Нужна батарейка.', 4); } }
  // items
  for (const it of items) {
    if (it.got) continue;
    it.o.rotation.y = time * 1.4 + it.ph; it.o.position.y = (it.type === 'N' ? .85 : 1.05) + Math.sin(time * 2 + it.ph) * .06;
    if (Math.hypot(P.x - it.x, P.z - it.z) > 1.05) continue;
    it.got = true; scene.remove(it.o);
    if (it.type === 'K') {
      P.keys++; ui.keys.textContent = `КЛЮЧИ ${P.keys}/${totalKeys}`; sfx.pickup(); sfx.blackout();
      blackout = 2.8; monHear(it.x, it.z);
      if (P.keys === totalKeys) { say('Все ключи у меня. Теперь — к двери с надписью «ВЫХОД».', 6); exitDoor.sm.map = signTex(true); exitDoor.sm.needsUpdate = true; exitDoor.sl.color.set(0x30ff60); }
      else say(`Ключ ${P.keys} из ${totalKeys}. Что-то услышало меня...`, 4);
    } else if (it.type === 'B') { P.bat = Math.min(1, P.bat + .5); sfx.pickup(); say('Батарейка.', 2.5); }
    else { sfx.paper(); say(NOTES[P.notes++ % NOTES.length], 9); }
  }
  // exit
  lockMsgT -= dt;
  if (exitDoor && Math.hypot(P.x - exitDoor.x, P.z - exitDoor.z) < 1.5) {
    if (P.keys >= totalKeys) { state = 'winning'; setState('winning'); dieT = 0; sfx.win(); ui.fade.style.opacity = 1; }
    else if (lockMsgT <= 0) { lockMsgT = 4; sfx.locked(); say(`Заперто. Нужно ещё ключей: ${totalKeys - P.keys}.`, 3); }
  }
  return { run, moving };
}

function updLights(dt, flick) {
  blackout -= dt;
  for (const l of lamps) {
    if (l.flick) { l.next -= dt; if (l.next <= 0) { const r = Math.random(); l.f = r < .3 ? 0 : r < .5 ? .35 : 1; l.next = r > .85 ? R(.6, 2.5) : R(.03, .22); } }
    const f = blackout > 0 ? (blackout < .4 && Math.random() < .5 ? .5 : 0) : l.f;
    l.light.intensity = l.base * f; l.pm.color.copy(l.col).multiplyScalar(.08 + f * .92);
  }
  let i = P.on && P.bat > 0 ? SPOT * (.45 + .55 * Math.min(1, P.bat * 3.5)) : 0;
  if (P.bat < .15 && Math.random() < .12) i *= .15;
  if (flick > 0 && Math.random() < flick * .5) i *= .1;
  if (blackout > 0 && Math.random() < .3) i *= .2;
  if (state === 'dying') i = 5;
  spot.intensity = i; mLens.color.setScalar(i > 5 ? 1 : .03);
  return i;
}

function frame(dt) {
  time += dt;
  let near = 0, flick = 0;
  if (state === 'play') {
    playTime += dt;
    const pl = updPlayer(dt);
    const m = state === 'play' ? updMonster(dt) : { dist: 1, sees: true };
    const d = m.dist;
    near = clamp(1 - d / 12, 0, 1) * (m.sees || d < 7 ? 1 : .35);
    flick = clamp(1 - d / 7, 0, 1);
    if (A.c) {
      const t = A.c.currentTime, ch = mon.state === 'chase';
      A.gG.gain.setTargetAtTime(Math.pow(clamp(1 - d / 26, 0, 1), 2) * (ch ? .5 : .28), t, .1);
      A.gO.frequency.setTargetAtTime(ch ? 62 : 39, t, .3); A.gT.frequency.setTargetAtTime(ch ? 19 : 11, t, .3);
      if (A.gP) A.gP.pan.setTargetAtTime(pan(mon.x - P.x, mon.z - P.z), t, .1);
      A.sG.gain.setTargetAtTime(near * near * .09, t, .1);
      beatT -= dt;
      if (d < 18 && beatT <= 0) { beatT = lerp(.42, 1.25, d / 18); sfx.beat(); }
      eventT -= dt;
      if (eventT <= 0) { eventT = R(14, 34); Math.random() < .6 ? sfx.whisper() : sfx.bang(); }
    }
    ui.bat.style.width = (P.bat * 100) + '%'; ui.sta.style.width = (P.sta * 100) + '%';
    ui.sta.style.background = P.tired ? '#9a3a30' : '';
    // camera
    const mv = Math.min(1, Math.hypot(P.vx, P.vz) / 3), sh = near * near * .012;
    camera.position.set(P.x + R(-sh, sh), 1.62 + Math.sin(P.bob * 2) * .04 * mv + R(-sh, sh), P.z);
    camera.rotation.set(P.pitch, P.yaw, Math.sin(P.bob) * .012 * mv);
    torch.position.set(.24 + Math.sin(P.bob) * .012 * mv, -.21 + Math.abs(Math.cos(P.bob)) * .012 * mv, -.42);
  } else if (state === 'menu') {
    camera.position.set(P.x, 1.62, P.z); camera.rotation.set(Math.sin(time * .3) * .04, P.yaw + Math.sin(time * .15) * .5, 0);
  } else if (state === 'dying') {
    dieT += dt; near = 1; flick = .3;
    const sh = .06 * Math.max(0, 1 - dieT / 1.6);
    camera.position.set(P.x + R(-sh, sh), 1.62 + R(-sh, sh), P.z + R(-sh, sh));
    camera.rotation.set(P.pitch + R(-sh, sh), P.yaw + R(-sh, sh), R(-sh, sh) * 2);
    if (dieT > 1.15) ui.fade.style.opacity = 1;
    if (dieT > 2.3) { ui.fade.style.transition = 'opacity 2s'; ui.fade.style.opacity = .82; endScreen(false); }
  } else if (state === 'winning') {
    dieT += dt; if (dieT > 1.6) { ui.fade.style.opacity = .85; endScreen(true); }
  }
  // monster pose
  const dying = state === 'dying';
  mm.g.position.set(mon.x, dying ? -.6 : 0, mon.z); mm.g.rotation.y = mon.yaw;
  if (state !== 'pause') animMonster(dt, state === 'play' ? (mon.state === 'chase' ? 3.9 : mon.state === 'search' ? 2.7 : 1.5) * (Math.hypot(mon.tx - mon.x, mon.tz - mon.z) < .5 ? 0 : 1) : 0, time);
  if (dying) { mm.spine.rotation.x = .12; mm.head.rotation.set(-.1, 0, Math.sin(time * 40) * .12); mm.jaw.rotation.x = .75 + Math.sin(time * 50) * .1; mm.eye.intensity = .8; }
  const li = updLights(dt, flick);
  updDust(time, li / SPOT);
  // overlays
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

// debug/testing handle
window.__game = { P, mon, items, field, MAP, cw, get state() { return state; }, exitDoor, frame, lamps, camera };
})();
