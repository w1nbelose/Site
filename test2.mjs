// Headless smoke test for БУНКЕР 7: map sanity, noise/stealth model, water, bolts,
// generators, hiding, monster hearing, death and win flows.
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const url = new URL('./bunker.html', import.meta.url).href;
const shots = fileURLToPath(new URL('./shots2/', import.meta.url));
mkdirSync(shots, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/usr/local/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'],
});
const errors = [];
const fail = m => { errors.push(m); console.log('FAIL', m); };
async function open() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', e => fail('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') fail('console: ' + m.text()); });
  await page.goto(url);
  await page.waitForFunction('window.__game');
  return page;
}
// software GL is far too slow for wall-clock timing: step the simulation directly, then render one frame
const wait = async ms => {
  await page.evaluate(n => { const g = window.__game; g.noRender = true; for (let i = 0; i < n; i++) g.frame(0.05); g.noRender = false; g.frame(0.001); }, Math.ceil(ms / 50));
  await new Promise(r => setTimeout(r, 1400));
};
const shot = (page, n) => page.screenshot({ path: `${shots}${n}.png` });

let page = await open();
const map = await page.evaluate(() => {
  const g = window.__game, W = g.MAP[0].length;
  const bad = g.MAP.filter(r => r.length !== W).length;
  const start = [Math.floor(g.P.x / 3), Math.floor(g.P.z / 3)];
  const f = g.field(start[0], start[1]);
  const cells = ch => { const o = []; g.MAP.forEach((r, z) => [...r].forEach((c, x) => { if (ch.includes(c)) o.push([x, z]); })); return o; };
  const isolated = [];
  g.MAP.forEach((r, z) => [...r].forEach((c, x) => { if (c !== '#' && c !== 'E' && f[x + z * W] < 0) isolated.push(c + x + ',' + z); }));
  const markers = {};
  for (const ch of '123FPMN') markers[ch] = cells(ch).length;
  return { bad, isolated, markers, exitReach: f[Math.floor(g.exitDoor.x / 3) + Math.floor(g.exitDoor.z / 3) * W] };
});
console.log('map', JSON.stringify(map));
if (map.bad || map.isolated.length || map.markers['1'] !== 1 || map.markers['2'] !== 1 || map.markers['3'] !== 1 ||
  map.markers.F !== 3 || map.markers.P !== 1 || map.markers.M !== 1 || map.markers.N !== 2 || map.exitReach < 0) fail('map invalid');
await wait(600); await shot(page, '1-menu');

await page.click('#start'); await wait(600);
if (await page.evaluate(() => window.__game.state) !== 'play') fail('did not start');
await shot(page, '2-start-room');

// movement + noise model: stand, walk, run, crouch, water
const noise = await page.evaluate(async () => {
  const g = window.__game, o = {};
  // монстра держим в дальнем углу, пока измеряем модель шума
  const park = () => { Object.assign(g.mon, { x: g.cw(19), z: g.cw(2), tx: g.cw(19), tz: g.cw(2), state: 'patrol', acc: 0, wait: 999 }); };
  const step = (n, keys) => {
    Object.assign(g.keys, keys);
    for (let i = 0; i < n; i++) { g.frame(0.05); park(); }
    for (const k in keys) g.keys[k] = false;
    return g.P.noise;
  };
  const tp = (x, z) => { g.P.x = g.cw(x); g.P.z = g.cw(z); g.P.vx = g.P.vz = 0; };
  g.noRender = true; g.mon.state = 'patrol'; g.mon.x = g.cw(19); g.mon.z = g.cw(2); g.mon.tx = g.mon.x; g.mon.tz = g.mon.z; g.mon.wait = 999;
  tp(11, 11); o.crouchIdle = step(30, { KeyC: false });
  g.P.crouch = true; o.crouchIdle = step(30, {}); o.crouchWalk = step(30, { KeyW: true });
  g.P.crouch = false; o.walk = step(30, { KeyW: true }); o.run = step(30, { KeyW: true, ShiftLeft: true });
  tp(4, 16); g.P.crouch = true; g.P.yaw = -Math.PI / 2; o.waterCrouch = step(30, { KeyW: true });
  g.P.crouch = false; o.waterRun = step(30, { KeyW: true, ShiftLeft: true });
  o.waterSpeed = Math.hypot(g.P.vx, g.P.vz);
  tp(11, 11); g.P.crouch = false; g.P.yaw = -Math.PI / 2;
  step(40, { KeyW: true, ShiftLeft: true });
  o.drySpeed = Math.hypot(g.P.vx, g.P.vz);
  o.inWater = g.isWater();
  return o;
});
console.log('noise', JSON.stringify(noise, null, 0));
if (!(noise.crouchIdle < 0.05 && noise.crouchWalk < noise.walk && noise.walk < noise.run)) fail('noise model wrong');
if (!(noise.waterCrouch > 0.4 && noise.waterRun > noise.run)) fail('water noise wrong');
if (!(noise.waterSpeed < noise.drySpeed * 0.8)) fail('water does not slow the player');
await shot(page, '3-hall');

// water visual
await page.evaluate(() => { const g = window.__game; g.P.x = g.cw(4); g.P.z = g.cw(16); g.P.yaw = Math.PI * 0.5; g.P.pitch = -0.05; g.P.on = true; });
await wait(300); await shot(page, '4-flooded');

// throwing a bolt distracts the monster
const bolt = await page.evaluate(async () => {
  const g = window.__game;
  g.noRender = true;
  g.P.x = g.cw(11); g.P.z = g.cw(11); g.P.yaw = Math.PI * 0.5; g.P.pitch = 0.1;
  g.mon.x = g.cw(11); g.mon.z = g.cw(8); g.mon.tx = g.mon.x; g.mon.tz = g.mon.z; g.mon.state = 'patrol'; g.mon.wait = 999; g.mon.acc = 0;
  g.frame(0.016); // камера должна встать на новое место: болт летит из камеры
  const before = g.bolts.length, ammo = g.P.bolts;
  g.throwBolt();
  for (let i = 0; i < 60 && !g.bolts.some(b => b.rang); i++) g.frame(0.05);
  const b = g.bolts[g.bolts.length - 1];
  const landed = { x: b.x, z: b.z, rang: !!b.rang, rest: !!b.rest };
  for (let i = 0; i < 24; i++) g.frame(0.05);
  const res = { spawned: g.bolts.length - before, ammoLeft: g.P.bolts, ammoBefore: ammo, landed, monState: g.mon.state, monT: [g.mon.tx, g.mon.tz] };
  g.frame(0.001);
  return res;
});
console.log('bolt', JSON.stringify(bolt));
if (bolt.spawned !== 1 || bolt.ammoLeft !== bolt.ammoBefore - 1 || !bolt.landed.rang) fail('bolt throw broken');
if (bolt.monState !== 'investigate') fail('monster ignores thrown bolts');
await wait(200); await shot(page, '5-bolt');

// item pickup: fuel can
await page.evaluate(() => { const g = window.__game; const c = g.items.find(i => i.type === 'F'); g.P.x = c.x; g.P.z = c.z; g.frame(0.016); });
if (await page.evaluate(() => window.__game.P.fuel) !== 1) fail('fuel can not picked up');
await shot(page, '6-fuel');

// generator: needs fuel, then lever; runs loud and pulls the monster in
const gen = await page.evaluate(() => {
  const g = window.__game, o = {};
  g.noRender = true;
  g.P.x = g.cw(1); g.P.z = g.cw(1) + 1.4; // рядом с дизелем 1, лицом к нему
  g.P.yaw = 0;
  g.frame(0.016); o.promptFuel = g.prompt;
  g.doInteract(); o.fueled = g.gens[0].fueled; o.carrying = g.P.fuel;
  g.frame(0.016); o.promptStart = g.prompt;
  g.mon.x = g.cw(19); g.mon.z = g.cw(2); g.mon.tx = g.mon.x; g.mon.tz = g.mon.z; g.mon.state = 'patrol'; g.mon.acc = 0; g.mon.wait = 999;
  g.doInteract(); o.running = g.gens[0].on; o.count = g.P.gens; o.monState = g.mon.state;
  o.monTargetsGen = Math.hypot(g.mon.tx - g.cw(1), g.mon.tz - g.cw(1)) < 2;
  for (let i = 0; i < 40; i++) g.frame(0.05);
  g.frame(0.001);
  return o;
});
console.log('gen', JSON.stringify(gen));
if (!/ТОПЛИВО/.test(gen.promptFuel)) fail('no fuel prompt at generator');
if (!gen.fueled || gen.carrying !== 0) fail('fueling failed');
if (gen.running !== true || gen.count !== 1) fail('generator did not start');
if (!(gen.monState === 'investigate' && gen.monTargetsGen)) fail('running generator does not attract the monster');
await wait(300); await shot(page, '7-generator');

// the lift is dead until all three diesels run
const lift = await page.evaluate(() => {
  const g = window.__game;
  g.P.x = g.exitDoor.x; g.P.z = g.exitDoor.z + 1.6;
  g.P.yaw = Math.PI; g.frame(0.016);
  const dead = { prompt: g.prompt, state: g.state };
  g.doInteract();
  dead.after = g.state;
  // запускаем остальные дизели: по канистре на каждый
  g.noRender = true;
  const cans = g.items.filter(i => i.type === 'F');
  for (const gg of g.gens) {
    if (gg.on) continue;
    if (!gg.fueled) {
      const c = cans.find(i => !i.got);
      if (c) { g.P.x = c.x; g.P.z = c.z; g.frame(0.016); }
      g.P.x = gg.x; g.P.z = gg.z + 1.4; g.P.yaw = 0; g.frame(0.016); g.doInteract();
    }
    g.frame(0.016); g.doInteract();
  }
  g.P.x = g.exitDoor.x; g.P.z = g.exitDoor.z + 1.6; g.P.yaw = Math.PI; g.frame(0.016);
  const ready = { count: g.P.gens, prompt: g.prompt };
  g.doInteract();
  ready.state = g.state;
  g.frame(0.001);
  return { dead, ready };
});
console.log('lift', JSON.stringify(lift));
if (!/0\/3|ОБЕСТОЧЕН/.test(lift.dead.prompt) || lift.dead.after === 'won') fail('lift opens without generators');
if (lift.ready.count !== 3 || !/ЛИФТ/.test(lift.ready.prompt)) fail('lift prompt missing at 3/3');
await wait(2600); await shot(page, '8-lift');
if (await page.evaluate(() => window.__game.state) !== 'won') fail('win flow broken');
const end = await page.evaluate(() => document.getElementById('endTitle').textContent);
console.log('end screen:', end);
await shot(page, '9-win');
await page.close();

// hiding in a locker keeps you safe from the blind hunter
page = await open();
await page.click('#start'); await wait(300);
const hide = await page.evaluate(() => {
  const g = window.__game, o = {};
  g.noRender = true;
  const lk = g.lockers.find(l => l.cell[1] === 11) || g.lockers[0];
  g.P.x = lk.x + 1.2; g.P.z = lk.z; g.P.yaw = Math.atan2(1.2, 0);
  g.frame(0.016); o.prompt = g.prompt;
  g.doInteract(); o.hidden = !!g.P.hidden;
  g.mon.x = lk.x + 1.4; g.mon.z = lk.z; g.mon.tx = g.mon.x; g.mon.tz = g.mon.z; g.mon.state = 'patrol'; g.mon.wait = 999; g.mon.acc = 0;
  for (let i = 0; i < 200; i++) g.frame(0.05);
  Object.assign(o, { state: g.state, noise: g.P.noise });
  g.noRender = false; g.frame(0.001);
  return o;
});
console.log('hide', JSON.stringify(hide));
if (!/СПРЯТАТЬСЯ/.test(hide.prompt) || !hide.hidden) fail('locker hiding broken');
if (hide.state !== 'play' || hide.noise > 0.02) fail('hiding is not silent/safe');
await wait(200); await shot(page, '10-locker');
const out = await page.evaluate(() => { const g = window.__game; g.doInteract(); return { out: !g.P.hidden, state: g.state }; });
if (!out.out || out.state !== 'play') fail('cannot leave the locker');
await page.close();

// the blind hunter follows noise and kills
page = await open();
await page.click('#start'); await wait(300);
const stalk = await page.evaluate(() => {
  const g = window.__game;
  g.noRender = true;
  g.mon.x = g.cw(19); g.mon.z = g.cw(2); g.mon.tx = g.mon.x; g.mon.tz = g.mon.z; g.mon.wait = 999;
  g.P.x = g.cw(11); g.P.z = g.cw(11); g.P.crouch = true;
  let quietState = '';
  for (let i = 0; i < 300; i++) { g.frame(0.05); quietState = quietState || g.mon.state; }
  const crouchSurvived = g.state === 'play';
  // теперь проверяем обратное: шумный игрок должен быть найден
  Object.assign(g.mon, { x: g.cw(11), z: g.cw(13), tx: g.cw(11), tz: g.cw(13), state: 'patrol', acc: 0, wait: 999, chase: 0 });
  Object.assign(g.keys, { KeyW: true, ShiftLeft: true });
  for (let i = 0; i < 400 && g.state === 'play'; i++) { if (i % 60 === 0) { g.P.yaw += 1.9; } g.frame(0.05); }
  for (const k in g.keys) g.keys[k] = false;
  return { crouchSurvived, quietState, killed: g.state === 'dying' || g.state === 'dead', heard: g.mon.acc, dist: Math.hypot(g.mon.x - g.P.x, g.mon.z - g.P.z) };
});
console.log('stalk', JSON.stringify(stalk));
if (!stalk.crouchSurvived) fail('crouching still got the player killed');
if (!stalk.killed) fail('monster never found the loud player');
await page.evaluate(() => { const g = window.__game; if (g.state === 'dying') { g.noRender = false; g.frame(0.001); } });
await wait(2400); await shot(page, '11-chase');
await wait(2200); await shot(page, '12-dead');
if (await page.evaluate(() => window.__game.state) !== 'dead') fail('death flow broken');
await page.close();

// портрет слепого в луче фонаря
page = await open();
await page.click('#start'); await wait(200);
await page.evaluate(() => {
  const g = window.__game;
  g.noRender = true;
  g.P.x = g.cw(11); g.P.z = g.cw(11); g.P.yaw = 0; g.P.pitch = -0.04; g.P.on = true;
  g.frame(0.016);
  Object.assign(g.mon, { x: g.cw(11), z: g.cw(11) - 3.3, tx: g.cw(11), tz: g.cw(11) - 3.3, state: 'patrol', wait: 999, acc: 0, silent: 0, chase: 0.35, yaw: 0 });
  for (let i = 0; i < 6; i++) { g.frame(0.05); Object.assign(g.mon, { tx: g.mon.x, tz: g.mon.z, state: 'patrol', wait: 999, acc: 0 }); }
  g.noRender = false; g.frame(0.001);
});
await new Promise(r => setTimeout(r, 1600));
await shot(page, '13-monster');
const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t = performance.now(); (function f() { n++; performance.now() - t < 1000 ? requestAnimationFrame(f) : r(n); })(); }));
console.log('fps (software GL):', fps);
await browser.close();
console.log(errors.length ? `\n${errors.length} FAILURE(S)` : '\nALL OK');
process.exit(errors.length ? 1 : 0);
