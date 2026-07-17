import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '../..');
const dist = `${root}/dist`;

await rm(dist, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: [`${root}/lib/forces/forces.ts`, `${root}/lib/anchor/anchor.ts`],
  outdir: dist,
  target: 'browser',
  format: 'esm',
  minify: true,
  naming: '[name].js'
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  throw new Error('Browser bundle failed.');
}

await Bun.write(`${dist}/index.html`, Bun.file(`${root}/static/index.html`));

for (const stylesheet of ['index', 'forces', 'anchor']) {
  await Bun.write(
    `${dist}/css/${stylesheet}.css`,
    Bun.file(`${root}/static/css/${stylesheet}.css`)
  );
}

for (const page of ['forces', 'anchor']) {
  const sourceHtml = await Bun.file(`${root}/static/${page}.html`).text();

  const outputHtml = sourceHtml.replace(
    `<script type="module" src="../lib/${page}/${page}.ts"></script>`,
    `<script type="module" src="./${page}.js"></script>`
  );

  if (outputHtml === sourceHtml)
    throw new Error(`Could not locate the TypeScript entry script in ${page}.html.`);

  await Bun.write(`${dist}/${page}.html`, outputHtml);
}

console.log('Built landing, force, and anchor-chain pages in dist/');
