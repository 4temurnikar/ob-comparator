# Open Banking Comparator

Compares every Australian bank's products using the public **Consumer Data Right (CDR) Product Reference APIs**, generates plain-English insights (e.g. *"Bank A is better if you'll live in the property; Bank B is better for investors"*), and refreshes automatically every day.

No accreditation, API keys or database needed — product reference data is public and unauthenticated under the Consumer Data Standards.

## How it works

```
CDR Register ──► every banking brand's publicBaseUri
     │
     ▼
GET {base}/cds-au/v1/banking/products            (paged, x-v negotiated)
GET {base}/cds-au/v1/banking/products/{id}       (full detail per product)
     │
     ▼
normalise ──► rates split by purpose / repayment / fixed term / LVR / balance tier
     │        fees, features, eligibility, constraints
     ▼
standards ─► every product checked against the Consumer Data Standards schema and rules
     │
     ▼
web ───────► every URL the bank publishes in CDR (overview, fees & pricing, terms, eligibility,
     │        additionalInfoUri…) plus rate sheets, fee schedules, PDS and key-facts PDFs one click away
     ▼
compare ───► each CDR rate, comparison rate and fee looked for on those pages and PDFs;
     │        every link classed as working / broken / homepage / blocked / robots-excluded
     ▼
insights ──► segment leaderboards, head-to-heads, market stats, day-on-day changes
     │
     ▼
site/data/*.json ──► static website (GitHub Pages), rebuilt daily
```

| Folder | What's in it |
|---|---|
| `pipeline/config.mjs` | Endpoints, API versions, concurrency, comparison scenarios (LVR, balance, terms) |
| `pipeline/http.mjs` | `x-v`/`x-min-v` negotiation (range first, then exact versions newest-first, remembered per host), retries with backoff, `Retry-After`, per-host and global rate limits, descriptive network errors |
| `pipeline/fetch.mjs` | CDR Register discovery, product list paging, product detail fetch; one failing bank never breaks the run |
| `pipeline/normalise.mjs` | Flattens `lendingRates`/`depositRates`/tiers/fees; parses ISO-8601 durations; flags non-conformant data |
| `pipeline/insights.mjs` | Leaderboards and narrative insights; rate-change diff |
| `pipeline/standards.mjs` | Consumer Data Standards checks: mandatory fields, allowed values, RateString / AmountString / date / URI / ISO-duration formats, conditional `additionalValue` and `additionalInfo` rules |
| `pipeline/cds/banking-products.json` | Product schemas extracted from the official CDS OpenAPI file (v1.36.0: list v5, detail v7) |
| `pipeline/web.mjs` | Website and PDF reader: robots.txt, 2 requests per host, size and time limits, optional headless Chromium for JavaScript pages, PDF text via pdf.js |
| `pipeline/consistency.mjs` | Compares CDR figures with page and PDF content; link health |
| `pipeline/dq.mjs` | Catalogue of every check: label, category, severity |
| `scripts/update-cds-schema.mjs` | Refreshes the schema file when a new standard is published |
| `pipeline/build.mjs` | Orchestrates the run and writes `site/data/` |
| `site/` | The website — plain HTML/CSS/JS, no build step |
| `scripts/mock-server.mjs` | Local mock of the Register + data-holder APIs (fictional banks) for offline testing |

## Website

- **Insights** — auto-generated findings, leaderboards for ~30 segments, and recent rate changes
- **Home loans** — filter by owner-occupied/investment, P&I/interest-only, variable/fixed term, LVR, offset, loan amount; shows comparison rate, monthly repayment and ongoing fees
- **Savings & term deposits** — base vs bonus vs intro rates and bonus conditions; term deposits by term with interest at maturity
- **Cards & personal loans** — purchase/cash rates, annual fees, estimated yearly cost at your balance
- **All products** — search every product from every bank
- **Data quality** — for every bank: standards conformance, data accuracy, link health and whether CDR rates and fees match the bank's own pages and PDFs. Each bank opens a full report listing every finding with the product, field, value and source page.

Every row opens a detail panel with all published rates, fees, eligibility and constraints, plus a link to the bank's page.

## Deploy (GitHub Pages, ~5 minutes)

1. Create a GitHub repo and push this folder to `main`.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Settings → Actions → General → Workflow permissions: Read and write.**
4. **Actions → Daily CDR refresh → Run workflow** for the first load.

After that it runs every day at ~4:20 am Melbourne time, commits the new data (giving you a history and change detection), and redeploys the site.

> The repo must be **public** for free GitHub Pages, or on a paid plan for private repos. Any static host works — Netlify, Cloudflare Pages, S3 + CloudFront, Azure Static Web Apps — just run `node pipeline/build.mjs` on a daily schedule and publish `site/`.

## Run locally

Requires Node 20+.

```bash
npm run refresh        # fetch live data from all banks (~10–20 min)
npm run serve          # http://localhost:8080
```

Offline, against the mock APIs:

```bash
npm run mock &         # fictional banks on :8787
npm run refresh:mock
MOCK_SHIFT=1 npm run mock   # restart with shifted rates, refresh again to see change detection
```

Useful environment variables: `CDR_BRAND_FILTER="commbank,anz"` (fetch only matching brands), `CDR_PER_HOST_CONCURRENCY`, `CDR_GLOBAL_CONCURRENCY`, `CDR_TIMEOUT_MS`, `CDR_SAVE_RAW=1` (keep raw payloads in `raw/` for debugging), `CDR_WEB=0` (skip website and PDF checks), `CDR_WEB_RENDER=1` (render JavaScript pages with headless Chromium; needs `npm i playwright && npx playwright install chromium`), `CDR_WEB_BUDGET_MIN` (time limit for the web stage), `CDR_WEB_MAX_URLS` / `CDR_WEB_MAX_LINKED` (per-bank page limits).

Run `npm install` once before the first local refresh (installs pdf.js for reading PDFs).

## Data-quality checks

| Category | What is checked |
|---|---|
| API availability | Product endpoints respond; product list not empty |
| Standards conformance | At the current detail version (v7): mandatory fields, allowed values, data types. At every version: RateString, AmountString, RFC 3339 dates, ISO 4217 currencies, URIs, ISO 8601 durations, `additionalValue` / `additionalInfo` rules from the standard's Product Components tables (e.g. FIXED needs a term, PERIODIC fee needs a period, MAX_LVR as a RateString). Older versions are noted, not penalised. |
| Data accuracy | Rates published as percentages instead of decimals, implausible values, home-loan rates without purpose / repayment type / comparison rate, products with no rates, stale `lastUpdated` |
| Links | Broken links, product links that land on the homepage, http instead of https; blocked and robots-excluded pages are reported as "not checked", not as faults |
| Matches the bank's website | Each CDR rate, comparison rate and fee looked for on the product's own pages and PDFs. Shared rate schedules are read only in the section about that product, so one product's figure can't confirm another's. |

**Severity:** *error* breaks the standard or can't be used; *warning* is probably wrong or missing; *note* is informational.

**Reading "not found" correctly:** it means the exact figure didn't appear on the pages and PDFs linked from that product. Rates loaded by JavaScript the reader couldn't run, images of tables, or different rounding can cause it. Treat it as a prompt to check, not proof of an error.

### Things to know about the website checks

- **Bot protection.** Some banks' sites block automated visitors, especially from overseas cloud servers like GitHub's. Those pages are reported as "blocked" and the product as "not checked". If many banks block the GitHub runner, run the job from an Australian machine or cloud region instead.
- **Politeness.** The reader identifies itself in its user agent, obeys robots.txt, sends at most 2 requests at a time to any site, and only follows links one click from URLs the bank itself published in CDR.
- **Run time.** The web stage stops starting new requests after `CDR_WEB_BUDGET_MIN` minutes (default 40) so the daily job always finishes; anything not reached is marked "not checked (time limit)".
- **Terms of use.** Reading public pages and PDFs a bank links to from its own CDR data is low-risk, but check that it fits each site's terms before publishing findings about named banks.
- **New standard versions.** Run `node scripts/update-cds-schema.mjs` to pull the latest schema from the ConsumerDataStandardsAustralia/standards repository.

## Comparison rules

- Home-loan leaderboards use each lender's best **non-tailored** rate at **80% LVR** (also 60% and 85% for LVR insights). Rates with `loanPurpose`/`repaymentType` of `UNCONSTRAINED` count for both.
- Savings "max rate" = highest base rate + highest bonus rate applicable at a $10,000 balance.
- Personal loans include tailored products (most are), labelled as "from" rates.
- Expired products (`effectiveTo` in the past) are dropped.
- Safety rails: the run aborts without overwriting yesterday's data if the Register returns nothing or fewer than 30% of brands respond.

Change any of these in `pipeline/config.mjs`.

## Known real-world quirks handled

- Holders that don't honour `x-min-v` ranges or only serve one exact version (e.g. ANZ on v5)
- Rejected `page-size` (retries with defaults) and repeated items across pages
- LVR tiers published as fractions (0.8) vs percentages (80)
- Rates published as percentages instead of decimals (corrected and flagged)
- Several brands sharing one base URI
- Throttling (honours `Retry-After`), slow or dead endpoints (timeouts, isolated failures)

## Known holder-side failures (Nov 2026)

These are the data holders' problems, not the pipeline's. The daily run retries them automatically and lists them on the Data quality tab.

| Brand | Error | Meaning |
|---|---|---|
| DDH Graham | 401 | Public product endpoint requires authentication (non-conformant) |
| IMB Bank | 502 | Bad gateway at the holder |
| Geelong Bank | 520 | Origin error behind Cloudflare |
| Aussie Home Loans | 404 | Registered base URI has no products endpoint |
| Thriday | fetch failed | Connection-level failure; cause logged from next run |
| Wise | 422 | Request rejected; full error needed to diagnose |

CBA - CommBiz and HSBC respond but publish no products (flagged as `NO_PRODUCTS`).

## Daily job notes

The commit step never merges data: it sets the fresh data aside, syncs to the latest `main`, puts the data back and pushes (retrying on races). Start manual runs with **Run workflow**, not **Re-run jobs**, because a re-run reuses the workflow file from the original commit.

## Disclaimer

General information only, not financial advice. Rates are as published by data holders and may differ from what a customer is offered.
