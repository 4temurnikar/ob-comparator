// Central configuration. Everything can be overridden with environment variables.

export const config = {
  // CDR Register: lists every data holder brand and its public base URI.
  registerUrl:
    process.env.CDR_REGISTER_URL ||
    'https://api.cdr.gov.au/cdr-register/v1/banking/data-holders/brands/summary',
  registerVersion: { xv: 2, xmin: 1 },

  // Product reference endpoints (unauthenticated, public). We ask for the newest
  // version we understand and accept anything down to v1; the normaliser is tolerant.
  productsPath: '/cds-au/v1/banking/products',
  productsVersion: { xv: 6, xmin: 1 },
  productDetailVersion: { xv: 8, xmin: 1 },
  pageSize: 100,
  maxPages: 50,

  // Politeness / resilience
  globalConcurrency: Number(process.env.CDR_GLOBAL_CONCURRENCY || 16),
  perHostConcurrency: Number(process.env.CDR_PER_HOST_CONCURRENCY || 3),
  timeoutMs: Number(process.env.CDR_TIMEOUT_MS || 25000),
  retries: 3,
  userAgent: 'cdr-product-comparator/1.0 (+open-source product comparison)',

  // Optional: only fetch some brands (comma-separated substrings), handy for debugging.
  brandFilter: (process.env.CDR_BRAND_FILTER || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),

  // Comparison scenarios used for insights
  scenarios: {
    homeLoanLvr: 80, // headline LVR
    lowLvr: 60,
    highLvr: 85,
    depositBalance: 10000,
    homeLoanFixedTerms: [12, 24, 36, 60],
    termDepositTerms: [3, 6, 12, 24, 36, 60],
  },

  outDir: process.env.CDR_OUT_DIR || new URL('../site/data/', import.meta.url).pathname,
  historyDays: 30,
};
