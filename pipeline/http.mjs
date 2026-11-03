import { config } from './config.mjs';

export class HttpError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} for ${url}${body ? ` — ${body.slice(0, 200)}` : ''}`);
    this.status = status;
    this.url = url;
  }
}

// Tiny semaphore
function semaphore(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active < n && queue.length) {
      active++;
      const { fn, resolve, reject } = queue.shift();
      fn().then(resolve, reject).finally(() => {
        active--;
        next();
      });
    }
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

const globalLimit = semaphore(config.globalConcurrency);
const hostLimits = new Map();
function hostLimit(url) {
  const host = new URL(url).host;
  if (!hostLimits.has(host)) hostLimits.set(host, semaphore(config.perHostConcurrency));
  return hostLimits.get(host);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const stats = { requests: 0, failures: 0, retries: 0 };

/**
 * GET a CDR endpoint with x-v / x-min-v version negotiation, retries and backoff.
 * Returns { json, version } where version is the x-v the holder responded with.
 */
export function getJson(url, { xv, xmin }) {
  return hostLimit(url)(() => globalLimit(() => doGet(url, xv, xmin)));
}

async function doGet(url, xv, xmin) {
  let version = xv;
  let lastErr;
  for (let attempt = 0; attempt <= config.retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), config.timeoutMs);
    try {
      stats.requests++;
      const res = await fetch(url, {
        headers: {
          accept: 'application/json',
          'x-v': String(version),
          'x-min-v': String(xmin),
          'user-agent': config.userAgent,
        },
        signal: ctrl.signal,
        redirect: 'follow',
      });
      if (res.status === 406 && version > xmin) {
        // Holder doesn't support the requested range properly — step down and retry.
        version--;
        attempt--;
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get('retry-after'));
        lastErr = new HttpError(res.status, url, await res.text().catch(() => ''));
        stats.retries++;
        await sleep(ra > 0 ? Math.min(ra, 60) * 1000 : 1000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw new HttpError(res.status, url, await res.text().catch(() => ''));
      const json = await res.json();
      return { json, version: res.headers.get('x-v') || String(version) };
    } catch (err) {
      lastErr = err;
      if (err instanceof HttpError && err.status < 500 && err.status !== 429) break;
      if (attempt < config.retries) {
        stats.retries++;
        await sleep(1000 * 2 ** attempt);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  stats.failures++;
  throw lastErr;
}

/** Follow links.next across pages, collecting data[key]. */
export async function getAllPages(firstUrl, versions, key) {
  const items = [];
  let url = firstUrl;
  let version;
  const seen = new Set();
  for (let i = 0; url && i < config.maxPages; i++) {
    if (seen.has(url)) break;
    seen.add(url);
    const { json, version: v } = await getJson(url, versions);
    version ??= v;
    const page = json?.data?.[key] ?? [];
    items.push(...page);
    const next = json?.links?.next;
    url = next ? new URL(next, url).toString() : null;
  }
  return { items, version };
}
