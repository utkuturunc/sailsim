import { rm } from 'node:fs/promises';

const root = import.meta.dir;
const dist = `${root}/dist`;

await rm(dist, { recursive:true, force:true });

const result = await Bun.build({
  entrypoints:[`${root}/app.ts`],
  outdir:dist,
  target:'browser',
  format:'esm',
  minify:true,
  naming:'app.js'
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  throw new Error('Browser bundle failed.');
}

const sourceHtml = await Bun.file(`${root}/index.html`).text();
const outputHtml = sourceHtml.replace(
  '<script type="module" src="./app.ts"></script>',
  '<script type="module" src="./app.js"></script>'
);

if (outputHtml === sourceHtml) throw new Error('Could not locate the TypeScript entry script in index.html.');

await Bun.write(`${dist}/index.html`, outputHtml);
console.log('Built dist/index.html and dist/app.js');
