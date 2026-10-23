// Bündelt src/main.ts zu einem Skript und setzt es in src/template.html ein.
// Aufruf: node build.mjs [ausgabe.html]
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const out = process.argv[2] || 'dist/holdem.html';
const res = await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  charset: 'utf8',
  write: false,
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync('src/template.html', 'utf8').replace('/*__APP_JS__*/', () => js);
writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1024).toFixed(1)} KB`);
