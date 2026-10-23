// Baut den Ordner dist/pages: index.html plus Manifest, Service Worker und Icons.
// Den Inhalt von dist/pages lädt man auf GitHub Pages (oder einen anderen Webspace) hoch.
// Vorher einmal: python3 make-icons.py pwa
import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const out = 'dist/pages';
mkdirSync(out, { recursive: true });

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

// Die Vorlage ist ein Fragment (Titel, Stil, Markup, Skript). Hier bekommt sie ein vollständiges Dokument.
const tpl = readFileSync('src/template.html', 'utf8').replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '');
const cut = tpl.indexOf('</style>') + '</style>'.length;
const head = tpl.slice(0, cut);
const body = tpl.slice(cut).replace('/*__APP_JS__*/', () => js);

const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0a110e">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Hold'em">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="icon-192.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}[hidden]{display:none!important}</style>
${head}
</head>
<body>
${body}
<script>if('serviceWorker' in navigator)addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){})})</script>
</body>
</html>
`;
writeFileSync(`${out}/index.html`, html);

for (const f of ['manifest.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) {
  if (!existsSync(`pwa/${f}`)) throw new Error(`pwa/${f} fehlt (make-icons.py ausführen?)`);
  copyFileSync(`pwa/${f}`, `${out}/${f}`);
}
console.log(`${out}/index.html: ${(html.length / 1024).toFixed(1)} KB`);
