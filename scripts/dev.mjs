// Servidor de desenvolvimento com rebuild automático (esbuild). Abre em http://localhost:5173
import { context } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 5173);

const ctx = await context({
  entryPoints: [join(root, 'client/src/main.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  outdir: join(root, 'client'),
  entryNames: '[name]',
  banner: { js: "new EventSource('/esbuild').addEventListener('change', () => location.reload());" },
  logLevel: 'info',
});
await ctx.watch();
const { host } = await ctx.serve({ servedir: join(root, 'client'), port, host: '127.0.0.1' });
console.log(`\n  SURF STRIKE rodando em  http://localhost:${port}\n`);
void host;
