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
     │        fees, features, eligibility, constraints, data-quality checks
     ▼
insights ──► segment leaderboards, head-to-heads, market stats, day-on-day changes
     │
     ▼
site/data/*.json ──► static website (GitHub Pages), rebuilt daily
```

| Folder | What's in it |
|---|---|
| `pipeline/config.mjs` | Endpoints, API versions, concurrency, comparison scenarios (LVR, balance, terms) |
| `pipeline/http.mjs` | `x-v`/`x-min-v` negotiation (steps down on 406), retries with backoff, `Retry-After`, per-host and global rate limits |
| `pipeline/fetch.mjs` | CDR Register discovery, product list paging, product detail fetch; one failing bank never breaks the run |
| `pipeline/normalise.mjs` | Flattens `lendingRates`/`depositRates`/tiers/fees; parses ISO-8601 durations; flags non-conformant data |
| `pipeline/insights.mjs` | Leaderboards and narrative insights; rate-change diff |
| `pipeline/build.mjs` | Orchestrates the run and writes `site/data/` |
| `site/` | The website — plain HTML/CSS/JS, no build step |
| `scripts/mock-server.mjs` | Local mock of the Register + data-holder APIs (fictional banks) for offline testing |

## Website

- **Insights** — auto-generated findings, leaderboards for ~30 segments, and recent rate changes
- **Home loans** — filter by owner-occupied/investment, P&I/interest-only, variable/fixed term, LVR, offset, loan amount; shows comparison rate, monthly repayment and ongoing fees
- **Savings & term deposits** — base vs bonus vs intro rates and bonus conditions; term deposits by term with interest at maturity
- **Cards & personal loans** — purchase/cash rates, annual fees, estimated yearly cost at your balance
- **All products** — search every product from every bank
- **Data quality** — per-holder conformance issues (e.g. rates published as 6.24 instead of 0.0624, missing comparison rates, missing `loanPurpose`, failing endpoints, API versions served)

Every row opens a detail panel with all published rates, fees, eligibility and constraints, plus a link to the bank's page.

## Deploy (GitHub Pages, ~5 minutes)

1. Create a GitHub repo and push this folder to `main`.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Settings → Actions → General → Workflow permissions: Read and write.**
4. **Actions → Daily CDR refresh → Run workflow** for the first load.

After that it runs every day at ~4:20 am Melbourne time, commits the new data (giving you a history and change detection), and redeploys the site.

> The repo must be **public** for free GitHub Pages, or on a paid plan for private repos. Any static host works — Netlify, Cloudflare Pages, S3 + CloudFront, Azure Static Web Apps — just run `node pipeline/build.mjs` on a daily schedule and publish `site/`.

## Run locally

Requires Node 20+. No `npm install` needed.

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

Useful environment variables: `CDR_BRAND_FILTER="commbank,anz"` (fetch only matching brands), `CDR_PER_HOST_CONCURRENCY`, `CDR_GLOBAL_CONCURRENCY`, `CDR_TIMEOUT_MS`, `CDR_SAVE_RAW=1` (keep raw payloads in `raw/` for debugging).

## Comparison rules

- Home-loan leaderboards use each lender's best **non-tailored** rate at **80% LVR** (also 60% and 85% for LVR insights). Rates with `loanPurpose`/`repaymentType` of `UNCONSTRAINED` count for both.
- Savings "max rate" = highest base rate + highest bonus rate applicable at a $10,000 balance.
- Personal loans include tailored products (most are), labelled as "from" rates.
- Expired products (`effectiveTo` in the past) are dropped.
- Safety rails: the run aborts without overwriting yesterday's data if the Register returns nothing or fewer than 30% of brands respond.

Change any of these in `pipeline/config.mjs`.

## Known real-world quirks handled

- Holders that don't honour `x-min-v` (we step the version down on HTTP 406)
- Rejected `page-size` (retries with defaults) and repeated items across pages
- LVR tiers published as fractions (0.8) vs percentages (80)
- Rates published as percentages instead of decimals (corrected and flagged)
- Several brands sharing one base URI
- Throttling (honours `Retry-After`), slow or dead endpoints (timeouts, isolated failures)

## Disclaimer

General information only, not financial advice. Rates are as published by data holders and may differ from what a customer is offered.
