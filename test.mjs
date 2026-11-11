// Headless smoke test: loads horror.html, checks the map, plays through pickup, death and win paths.
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const url = new URL('./horror.html', import.meta.url).href;
const shots = fileURLToPath(new URL('./shots/', import.meta.url));
mkdirSync(shots, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/usr/local/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720'],
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
  await new Promise(r => setTimeout(r, 1300));
};
const shot = (page, n) => page.screenshot({ path: `${shots}${n}.png` });

let page = await open();
// map sanity
const map = await page.evaluate(() => {
  const g = window.__game, W = g.MAP[0].length, bad = g.MAP.filter(r => r.length !== W).length;
  const f = g.field(Math.floor(g.P.x / 3), Math.floor(g.P.z / 3));
  const unreachable = [];
  g.MAP.forEach((r, z) => [...r].forEach((ch, x) => { if (ch !== '#' && ch !== 'E' && f[x + z * W] < 0) unreachable.push(ch + x + ',' + z); }));
  const ex = Math.floor(g.exitDoor.x / 3), ez = Math.floor(g.exitDoor.z / 3);
  return { bad, unreachable, keys: g.items.filter(i => i.type === 'K').length, exitReach: f[ex + ez * W] };
});
console.log('map', JSON.stringify(map));
if (map.bad || map.unreachable.length || map.keys !== 5 || map.exitReach < 0) fail('map invalid');
await wait(800); await shot(page, '1-menu');

await page.click('#start'); await wait(1500);
if (await page.evaluate(() => window.__game.state) !== 'play') fail('did not start');
await shot(page, '2-start');
// walk forward with real key input
const x0 = await page.evaluate(() => window.__game.P.x);
await page.keyboard.down('KeyW'); await wait(1500); await page.keyboard.up('KeyW');
const x1 = await page.evaluate(() => window.__game.P.x);
console.log('walked', (x1 - x0).toFixed(2)); if (x1 - x0 < 1) fail('player did not move');
await shot(page, '3-corridor');
// wall collision: push into a wall for a while, must stay in a floor cell
await page.evaluate(() => { window.__game.P.yaw = 0; });
await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft'); await wait(1500); await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
const cell = await page.evaluate(() => { const g = window.__game; return g.MAP[Math.floor(g.P.z / 3)][Math.floor(g.P.x / 3)]; });
if (cell === '#') fail('walked into wall');
// props + pickup
const tp = (x, z, yaw) => page.evaluate((x, z, yaw) => { const g = window.__game; g.P.x = g.cw(x); g.P.z = g.cw(z); g.P.yaw = yaw; g.P.pitch = -0.15; g.P.vx = g.P.vz = 0; }, x, z, yaw);
const look = (x, z, tx, tz) => tp(x, z, Math.atan2(x - tx, z - tz));
await look(11.5, 2.3, 10, 1); await wait(300); await shot(page, '4-bed');
await look(7.7, 3, 6, 3); await wait(100); await shot(page, '4-cabinet');
await look(8, 8.7, 8, 7); await wait(100); await shot(page, '4-junk');
await look(13.4, 7.3, 12, 6); await wait(100); await shot(page, '4-key');
await tp(12, 1, 0); await wait(600);
if (await page.evaluate(() => window.__game.P.keys) !== 1) fail('key not picked up');
await shot(page, '5-blackout');
await look(17, 8.6, 17, 7); await wait(400); await shot(page, '6-wheelchair');
await look(11.6, 17, 13, 18); await wait(3200); await shot(page, '7-exit-locked');
// monster in view
await page.evaluate(() => { const g = window.__game; g.P.x = g.cw(21); g.P.z = g.cw(9.5); g.P.yaw = Math.PI; g.P.pitch = 0; g.mon.x = g.cw(21); g.mon.z = g.cw(12.6); g.mon.state = 'patrol'; g.mon.tx = g.mon.x; g.mon.tz = g.mon.z; g.mon.wait = 99; g.P.on = false; });
await wait(60); await page.evaluate(() => { window.__game.P.on = true; });
await wait(350); await shot(page, '8-monster');
await wait(1500);
const st = await page.evaluate(() => window.__game.state); console.log('after chase:', st);
await shot(page, '9-jumpscare');
await wait(3500); await shot(page, '10-dead');
if (await page.evaluate(() => window.__game.state) !== 'dead') fail('death flow broken');
await page.close();

// monster AI reaches the player on its own; then win path
page = await open();
await page.click('#start'); await wait(300);
const reached = await page.evaluate(() => {
  const g = window.__game; g.mon.state = 'search'; g.mon.tx = g.P.x; g.mon.tz = g.P.z; g.P.on = false;
  g.noRender = true;
  for (let i = 0; i < 20 * 120 && g.state === 'play'; i++) { g.mon.state === 'patrol' && (g.mon.state = 'search', g.mon.tx = g.P.x, g.mon.tz = g.P.z); g.frame(0.05); }
  return { state: g.state, cell: g.MAP[Math.floor(g.mon.z / 3)][Math.floor(g.mon.x / 3)] };
});
console.log('pathfinding', JSON.stringify(reached)); if (reached.state !== 'dying') fail('monster never reached player');
await page.close();

page = await open();
await page.click('#start'); await wait(300);
await page.evaluate(() => { const g = window.__game; g.mon.x = g.cw(1); g.mon.z = g.cw(1); g.mon.tx = g.mon.x; g.mon.tz = g.mon.z; g.mon.wait = 999; g.P.on = false;
  g.noRender = true;
  for (const it of g.items) { if (it.type === 'B') continue; g.P.x = it.x; g.P.z = it.z; g.frame(0.016); }
  g.P.x = g.cw(11.6); g.P.z = g.cw(17); g.P.yaw = Math.atan2(-1.4, -1); g.P.on = true; });
await wait(700); await shot(page, '11-exit-open');
if (await page.evaluate(() => window.__game.P.keys) !== 5) fail('not all keys');
await page.evaluate(() => { const g = window.__game; g.P.x = g.cw(13); g.P.z = g.cw(17.2); });
await wait(3200); await shot(page, '12-win');
if (await page.evaluate(() => window.__game.state) !== 'won') fail('win flow broken');
const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t = performance.now(); (function f() { n++; performance.now() - t < 1000 ? requestAnimationFrame(f) : r(n); })(); }));
console.log('fps (software GL):', fps);
await browser.close();
console.log(errors.length ? `\n${errors.length} FAILURE(S)` : '\nALL OK');
process.exit(errors.length ? 1 : 0);
