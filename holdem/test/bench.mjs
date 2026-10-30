// Startet holdem/test/bench.ts: bündelt es mit esbuild nach dist/bench.js und führt es aus.
// Aufruf: npm run bench -- <hu|2v2|cash|cash4> <Anzahl> <Simulationen> <Modell A> <Modell B>
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', '..', 'dist', 'bench.js');
await build({ entryPoints: [join(here, 'bench.ts')], bundle: true, platform: 'node', outfile: out, logLevel: 'error' });
const r = spawnSync(process.execPath, [out, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
