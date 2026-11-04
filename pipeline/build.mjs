#!/usr/bin/env node
// Daily refresh: CDR Register → every bank's product APIs → normalised data + insights → site/data/*.json
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config.mjs';
import { stats } from './http.mjs';
import { fetchRegister, fetchBrand } from './fetch.mjs';
import { normaliseBrand, ISSUE_LABELS, CATEGORY_LABELS } from './normalise.mjs';
import { buildInsights, diffRates } from './insights.mjs';

const OUT = config.outDir;
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const RATE_COLS = ['k', 'kind', 'cat', 'type', 'comparable', 'rate', 'comp', 'purpose', 'repay', 'term', 'lvrMin', 'lvrMax', 'balMin', 'balMax', 'tierNote', 'info'];
const PRODUCT_COLS = ['key', 'brandId', 'brand', 'productId', 'name', 'category', 'uri', 'tailored', 'business', 'staff', 'special', 'lastUpdated', 'features', 'offset', 'redraw', 'yearlyFees', 'monthlyFee', 'upfrontFees', 'detailMissing'];
const columnar = (cols, rows) => ({ columns: cols, rows: rows.map((r) => cols.map((c) => r[c] ?? null)) });
const fromColumnar = (d) => (d?.rows || []).map((row) => Object.fromEntries(d.columns.map((c, i) => [c, row[i]])));
const safe = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '_');

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}
const writeJson = (name, data) => writeFile(join(OUT, name), JSON.stringify(data));

async function main() {
  await mkdir(join(OUT, 'details'), { recursive: true });
  const prevRates = fromColumnar(await readJson(join(OUT, 'rates.json')));
  const prevChanges = (await readJson(join(OUT, 'changes.json'))) || { runs: [] };

  log('Fetching CDR Register…');
  const brands = await fetchRegister();
  log(`${brands.length} banking brands with a public base URI`);
  if (!brands.length) throw new Error('CDR Register returned no banking brands — aborting so yesterday’s data is kept.');

  let done = 0;
  const results = await Promise.all(
    brands.map(async (b) => {
      const r = await fetchBrand(b);
      done++;
      log(`${String(done).padStart(3)}/${brands.length} ${r.ok ? 'OK  ' : 'FAIL'} ${b.brandName} — ${r.products.length} products${r.errors.length ? `, ${r.errors.length} errors` : ''}`);
      return r;
    })
  );

  const products = [];
  const rates = [];
  const quality = [];
  const brandRows = [];
  await rm(join(OUT, 'details'), { recursive: true, force: true });
  await mkdir(join(OUT, 'details'), { recursive: true });

  if (process.env.CDR_SAVE_RAW) {
    await mkdir(join(OUT, '..', '..', 'raw'), { recursive: true });
  }

  for (const r of results) {
    const { products: ps, rates: rs, issues } = normaliseBrand(r.brand, r.products);
    products.push(...ps);
    rates.push(...rs);
    if (process.env.CDR_SAVE_RAW)
      await writeFile(join(OUT, '..', '..', 'raw', `${safe(r.brand.brandId)}.json`), JSON.stringify(r.products, null, 1));

    // full details for the product drawer, one file per brand (loaded on demand)
    if (ps.length) {
      const det = Object.fromEntries(ps.map((p) => [p.key, { description: p.description, fees: p.fees, eligibility: p.eligibility, constraints: p.constraints, overviewUri: p.overviewUri, feesUri: p.feesUri, effectiveFrom: p.effectiveFrom }]));
      await writeFile(join(OUT, 'details', `${safe(r.brand.brandId)}.json`), JSON.stringify(det));
    }

    const all = [
      ...r.errors.map((e) => ({ code: e.stage === 'list' ? 'LIST_FAILED' : e.stage === 'empty' ? 'EMPTY_PRODUCT_LIST' : 'DETAIL_FAILED', productId: e.productId ?? null, value: e.message })),
      ...issues,
      ...(r.ok && !ps.length ? [{ code: 'NO_PRODUCTS', value: 'Products endpoint responded but listed no products' }] : []),
    ];
    const byCode = {};
    for (const i of all) {
      byCode[i.code] ??= { code: i.code, label: ISSUE_LABELS[i.code] || i.code, count: 0, examples: [] };
      byCode[i.code].count++;
      if (byCode[i.code].examples.length < 5) byCode[i.code].examples.push({ product: i.product ?? i.productId ?? null, field: i.field ?? null, value: i.value ?? null });
    }
    quality.push({ brandId: r.brand.brandId, brand: r.brand.brandName, issues: Object.values(byCode).sort((a, b) => b.count - a.count), total: all.length });

    const cats = {};
    for (const p of ps) cats[p.category] = (cats[p.category] || 0) + 1;
    brandRows.push({
      brandId: r.brand.brandId,
      brand: r.brand.brandName,
      logoUri: r.brand.logoUri,
      baseUri: r.brand.publicBaseUri,
      ok: r.ok,
      products: ps.length,
      categories: cats,
      listVersion: r.listVersion,
      detailVersions: r.detailVersions,
      errors: r.errors.length,
      issues: all.length,
      durationMs: r.durationMs,
      detailFile: ps.length ? `details/${safe(r.brand.brandId)}.json` : null,
    });
  }

  log(`Normalised ${products.length} products, ${rates.length} rate rows`);
  const okCount = results.filter((r) => r.ok).length;
  if (okCount < Math.max(1, brands.length * 0.3))
    throw new Error(`Only ${okCount}/${brands.length} brands responded — refusing to overwrite data (likely a network problem).`);

  const { boards, insights } = buildInsights({ products, rates });
  const changes = diffRates(prevRates, rates, products);
  const today = new Date().toISOString();

  if (changes.length) {
    const ups = changes.filter((c) => c.delta > 0).length;
    const top = changes[0];
    insights.unshift({
      id: 'changes',
      group: 'Changes',
      tone: 'change',
      headline: `${changes.length} rate change${changes.length > 1 ? 's' : ''} since the last refresh (${ups} up, ${changes.length - ups} down)`,
      detail: `Biggest move: ${top.brand} ${top.product} ${top.type.toLowerCase()} ${top.from.toFixed(2)}% → ${top.to.toFixed(2)}%.`,
      brands: [...new Set(changes.slice(0, 5).map((c) => c.brandId))],
    });
  }
  const dqWorst = quality.filter((q) => q.total).sort((a, b) => b.total - a.total);
  if (dqWorst.length)
    insights.push({
      id: 'dq',
      group: 'Data quality',
      tone: 'dq',
      headline: `${dqWorst.length} of ${brands.length} brands have data-quality issues in their published product data`,
      detail: `Most issues: ${dqWorst.slice(0, 3).map((q) => `${q.brand} (${q.total})`).join(', ')}. See the Data quality tab — affected rates may be missing from comparisons.`,
      brands: dqWorst.slice(0, 3).map((q) => q.brandId),
    });

  prevChanges.runs = [{ at: today, count: changes.length, changes: changes.slice(0, 300) }, ...(prevChanges.runs || [])].slice(0, config.historyDays);

  const catCounts = {};
  for (const p of products) catCounts[p.category] = (catCounts[p.category] || 0) + 1;

  await Promise.all([
    writeJson('rates.json', columnar(RATE_COLS, rates)),
    writeJson('products.json', columnar(PRODUCT_COLS, products)),
    writeJson('brands.json', brandRows),
    writeJson('boards.json', boards),
    writeJson('insights.json', insights),
    writeJson('quality.json', quality.filter((q) => q.total).sort((a, b) => b.total - a.total)),
    writeJson('changes.json', prevChanges),
    writeJson('meta.json', {
      generatedAt: today,
      durationMs: Date.now() - t0,
      registerUrl: config.registerUrl,
      brandsTotal: brands.length,
      brandsOk: okCount,
      products: products.length,
      rates: rates.length,
      categories: Object.entries(catCounts).map(([id, n]) => ({ id, label: CATEGORY_LABELS[id] || id, n })).sort((a, b) => b.n - a.n),
      scenarios: config.scenarios,
      http: stats,
    }),
  ]);
  log(`Done: ${okCount}/${brands.length} brands OK, ${insights.length} insights, ${changes.length} changes. Output → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
