// Inlines three.js and the game code into a single self-contained HTML file.
import { readFileSync, writeFileSync } from 'node:fs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const safe = s => s.replace(/<\/script/gi, '<\\/script');
const html = read('./src/template.html')
  .replace('/*__THREE__*/', () => safe(read('./node_modules/three/build/three.min.js')))
  .replace('/*__GAME__*/', () => safe(read('./src/game.js')));
writeFileSync(new URL('./horror.html', import.meta.url), html);
console.log(`horror.html: ${(html.length / 1024).toFixed(0)} KB`);
