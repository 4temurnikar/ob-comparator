// One catalogue of every data-quality check: label, category and severity.
import { ISSUE_LABELS } from './normalise.mjs';
import { STANDARDS_LABELS } from './standards.mjs';

export const CATEGORIES = [
  { id: 'availability', label: 'API availability' },
  { id: 'standards', label: 'Standards conformance' },
  { id: 'accuracy', label: 'Data accuracy' },
  { id: 'links', label: 'Links' },
  { id: 'website', label: 'Matches the bank’s website' },
];

const WEB_LABELS = {
  LINK_BROKEN: 'Link is broken (error page or unreachable)',
  LINK_HOMEPAGE: 'Product link goes to the homepage, not the product',
  LINK_NOT_HTTPS: 'Link uses http rather than https',
  LINK_BLOCKED: 'Page blocked our automated check (bot protection)',
  LINK_ROBOTS: 'Page excluded from automated checks by robots.txt',
  WEB_RATE_NOT_FOUND: 'CDR rate not found on the bank’s linked pages or PDFs',
  WEB_COMP_NOT_FOUND: 'CDR comparison rate not found on the bank’s linked pages or PDFs',
  WEB_FEE_NOT_FOUND: 'CDR fee amount not found on the bank’s linked pages or PDFs',
  WEB_UNVERIFIABLE: 'No readable page or PDF to check this product against',
};

const META = {
  LIST_FAILED: ['availability', 'error'],
  DETAIL_FAILED: ['availability', 'error'],
  NO_PRODUCTS: ['availability', 'warning'],
  SCHEMA_REQUIRED: ['standards', 'error'],
  SCHEMA_ENUM: ['standards', 'error'],
  SCHEMA_TYPE: ['standards', 'error'],
  FORMAT_RATE: ['standards', 'error'],
  FORMAT_AMOUNT: ['standards', 'error'],
  FORMAT_DATETIME: ['standards', 'error'],
  FORMAT_DATE: ['standards', 'error'],
  FORMAT_CURRENCY: ['standards', 'error'],
  FORMAT_URI: ['standards', 'error'],
  FORMAT_DURATION: ['standards', 'error'],
  RULE_ADDITIONAL_VALUE: ['standards', 'warning'],
  RULE_ADDITIONAL_INFO: ['standards', 'warning'],
  RULE_NEGATIVE_ADJUSTMENT: ['standards', 'error'],
  RULE_LVR_SCALE: ['standards', 'error'],
  VERSION_OLDER: ['standards', 'info'],
  RATE_SCALE: ['accuracy', 'error'],
  RATE_OUT_OF_RANGE: ['accuracy', 'error'],
  RATE_NOT_NUMERIC: ['accuracy', 'error'],
  MORTGAGE_NO_PURPOSE: ['accuracy', 'warning'],
  MORTGAGE_NO_REPAYMENT_TYPE: ['accuracy', 'warning'],
  MORTGAGE_NO_COMPARISON_RATE: ['accuracy', 'warning'],
  NO_RATES: ['accuracy', 'warning'],
  STALE_LAST_UPDATED: ['accuracy', 'info'],
  NO_PRODUCT_LINK: ['links', 'warning'],
  LINK_BROKEN: ['links', 'error'],
  LINK_HOMEPAGE: ['links', 'warning'],
  LINK_NOT_HTTPS: ['links', 'warning'],
  LINK_BLOCKED: ['links', 'info'],
  LINK_ROBOTS: ['links', 'info'],
  WEB_RATE_NOT_FOUND: ['website', 'warning'],
  WEB_COMP_NOT_FOUND: ['website', 'warning'],
  WEB_FEE_NOT_FOUND: ['website', 'warning'],
  WEB_UNVERIFIABLE: ['website', 'info'],
};

const LABELS = { ...ISSUE_LABELS, ...STANDARDS_LABELS, ...WEB_LABELS };
export function describe(code) {
  const [category, severity] = META[code] || ['accuracy', 'warning'];
  return { code, label: LABELS[code] || code, category, severity };
}
export const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };
