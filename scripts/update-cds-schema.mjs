#!/usr/bin/env node
// Refreshes pipeline/cds/banking-products.json from the official Consumer Data Standards OpenAPI file.
// Usage: node scripts/update-cds-schema.mjs [path-or-url-to-cds_banking.json]
// Default source: the ConsumerDataStandardsAustralia/standards repository on GitHub.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const SRC =
  process.argv[2] ||
  'https://raw.githubusercontent.com/ConsumerDataStandardsAustralia/standards/master/swagger-gen/api/cds_banking.json';

const spec = /^https?:/.test(SRC) ? await (await fetch(SRC)).json() : JSON.parse(await readFile(SRC, 'utf8'));
const all = spec.components.schemas;

function versionOf(path) {
  const op = spec.paths[path]?.get;
  return Number(op?.['x-version'] ?? NaN);
}

// Collect the detail response schema and everything it references.
const keep = {};
const queue = ['ResponseBankingProductByIdV7'.replace('V7', `V${versionOf('/banking/products/{productId}')}`)];
while (queue.length) {
  const name = queue.pop();
  if (keep[name] || !all[name]) continue;
  keep[name] = all[name];
  JSON.stringify(all[name]).replace(/#\/components\/schemas\/([A-Za-z0-9_]+)/g, (_, n) => queue.push(n));
}

// Strip long descriptions to keep the file small, but keep a short version for messages.
const slim = JSON.parse(
  JSON.stringify(keep, (k, v) => (k === 'description' && typeof v === 'string' ? v.replace(/\s+/g, ' ').slice(0, 160) : k === 'example' || k === 'examples' ? undefined : v))
);

const out = {
  source: 'ConsumerDataStandardsAustralia/standards swagger-gen/api/cds_banking.json',
  specVersion: spec.info.version,
  listVersion: versionOf('/banking/products'),
  detailVersion: versionOf('/banking/products/{productId}'),
  root: Object.keys(keep)[0],
  schemas: slim,
};
await mkdir(new URL('../pipeline/cds/', import.meta.url), { recursive: true });
await writeFile(new URL('../pipeline/cds/banking-products.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(`Wrote CDS ${out.specVersion}: list v${out.listVersion}, detail v${out.detailVersion}, ${Object.keys(keep).length} schemas`);
