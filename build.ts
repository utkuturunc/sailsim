import { rm } from 'node:fs/promises';

const root = import.meta.dir;
const dist = `${root}/dist`;

await rm(dist, { recursive:true, force:true });

const result = await Bun.build({
  entrypoints:[`${root}/app.ts`, `${root}/anchor.ts`],
  outdir:dist,
  target:'browser',
  format:'esm',
  minify:true,
  naming:'[name].js'
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  throw new Error('Browser bundle failed.');
}

await Bun.write(`${dist}/index.html`, Bun.file(`${root}/index.html`));

for (const page of ['forces', 'anchor']) {
  const sourceHtml = await Bun.file(`${root}/${page}.html`).text();
  const entry = page === 'forces' ? 'app' : 'anchor';
  const outputHtml = sourceHtml.replace(
    `<script type="module" src="./${entry}.ts"></script>`,
    `<script type="module" src="./${entry}.js"></script>`
  );
  if (outputHtml === sourceHtml) throw new Error(`Could not locate the TypeScript entry script in ${page}.html.`);
  await Bun.write(`${dist}/${page}.html`, outputHtml);
}
console.log('Built landing, force, and anchor-chain pages in dist/');
