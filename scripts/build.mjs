// Build de produção: dist/ (index.html + main.js + styles.css).
// --single gera dist/surf-strike.html com tudo embutido em um único arquivo.
import { build } from 'esbuild';
import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(root, 'client/src/main.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: !process.argv.includes('--single'),
  outfile: join(out, 'main.js'),
  logLevel: 'info',
});
copyFileSync(join(root, 'client/index.html'), join(out, 'index.html'));
copyFileSync(join(root, 'client/styles.css'), join(out, 'styles.css'));

if (process.argv.includes('--single')) {
  const html = readFileSync(join(root, 'client/index.html'), 'utf8');
  const css = readFileSync(join(root, 'client/styles.css'), 'utf8');
  const js = readFileSync(join(out, 'main.js'), 'utf8').replace(/<\/script/g, '<\\/script');
  const single = html
    .replace('<link rel="stylesheet" href="./styles.css" />', `<style>\n${css}\n</style>`)
    .replace('<script type="module" src="./main.js"></script>', `<script type="module">\n${js}\n</script>`);
  writeFileSync(join(out, 'surf-strike.html'), single);
  console.log('single-file build: dist/surf-strike.html');
}
