// Bündelt roulette/src/main.ts, setzt es in roulette/src/template.html ein und schreibt roulette.html.
// Aufruf: node roulette/build.mjs [ausgabe.html]   (Standard: roulette.html im Projektordner)
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || join(here, '..', 'roulette.html');

const res = await build({
  entryPoints: [join(here, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  charset: 'utf8',
  write: false,
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync(join(here, 'src/template.html'), 'utf8').replace('/*__APP_JS__*/', () => js);
writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1024).toFixed(1)} KB`);
