import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const root = resolve(import.meta.dir, '../..');
const dist = `${root}/dist`;
const pages = ['index', 'forces', 'anchor'] as const;

// Clearing dist is the first filesystem action so no stale deployment asset survives a build.
await rm(dist, { recursive: true, force: true });

function fingerprint(content: string | ArrayBuffer): string {
  const hash = createHash('sha256');
  hash.update(typeof content === 'string' ? content : new Uint8Array(content));
  return hash.digest('hex').slice(0, 12);
}

const result = await Bun.build({
  entrypoints: [`${root}/lib/forces/forces.ts`, `${root}/lib/anchor/anchor.ts`],
  outdir: `${dist}/assets`,
  target: 'browser',
  format: 'esm',
  minify: true,
  naming: '[name]-[hash].js'
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  throw new Error('Browser bundle failed.');
}

const scriptNames = new Map<string, string>();

for (const page of ['forces', 'anchor']) {
  const output = result.outputs.find((candidate) => {
    const filename = basename(candidate.path);
    return filename.startsWith(`${page}-`) && filename.endsWith('.js');
  });

  if (!output) throw new Error(`Could not locate the bundled ${page} script.`);
  scriptNames.set(page, basename(output.path));
}

const stylesheetNames = new Map<string, string>();

for (const page of pages) {
  const stylesheet = await Bun.file(`${root}/static/css/${page}.css`).text();
  const filename = `${page}-${fingerprint(stylesheet)}.css`;

  stylesheetNames.set(page, filename);
  await Bun.write(`${dist}/assets/${filename}`, stylesheet);
}

const favicon = await Bun.file(`${root}/static/assets/favicon.png`).arrayBuffer();
const faviconName = `favicon-${fingerprint(favicon)}.png`;
await Bun.write(`${dist}/assets/${faviconName}`, favicon);

for (const page of pages) {
  const sourceHtml = await Bun.file(`${root}/static/${page}.html`).text();
  const stylesheetName = stylesheetNames.get(page);

  if (!stylesheetName) throw new Error(`Could not fingerprint the ${page} stylesheet.`);

  let outputHtml = sourceHtml
    .replace(`./assets/favicon.png`, `./assets/${faviconName}`)
    .replace(`./css/${page}.css`, `./assets/${stylesheetName}`);

  if (page !== 'index') {
    const scriptName = scriptNames.get(page);
    if (!scriptName) throw new Error(`Could not fingerprint the ${page} script.`);

    outputHtml = outputHtml.replace(
      `<script type="module" src="../lib/${page}/${page}.ts"></script>`,
      `<script type="module" src="./assets/${scriptName}"></script>`
    );
  }

  const staleReferences = [`./assets/favicon.png`, `./css/${page}.css`, '../lib/'];

  if (
    outputHtml === sourceHtml ||
    staleReferences.some((reference) => outputHtml.includes(reference))
  )
    throw new Error(`Could not rewrite all production assets in ${page}.html.`);

  await Bun.write(`${dist}/${page}.html`, outputHtml);
}

console.log('Built cache-safe landing, force, and anchor-chain pages in dist/');
