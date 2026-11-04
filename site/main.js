// Open Banking Comparator \u2014 front end (no build step, no dependencies)

const DATA = 'data/';
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
const pct = (r) => (r === null || r === undefined ? '\u2014' : `${r.toFixed(2)}%`);
const money = (n, dp = 0) => (n === null || n === undefined ? '\u2014' : `$${n.toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`);
const termLabel = (m) => (m === null || m === undefined ? '' : m % 12 === 0 ? `${m / 12} yr` : `${Math.round(m)} mth`);
const fromColumnar = (d) => (d?.rows || []).map((row) => Object.fromEntries(d.columns.map((c, i) => [c, row[i]])));
const LABEL = {
  OWNER_OCCUPIED: 'Owner-occupied', INVESTMENT: 'Investment', UNCONSTRAINED: 'Any purpose', UNSPECIFIED: 'Not stated',
  PRINCIPAL_AND_INTEREST: 'P&I', INTEREST_ONLY: 'Interest only',
};
const CAT = {
  RESIDENTIAL_MORTGAGES: 'Home loans', TRANS_AND_SAVINGS_ACCOUNTS: 'Transaction & savings', TERM_DEPOSITS: 'Term deposits',
  CRED_AND_CHRG_CARDS: 'Credit & charge cards', PERS_LOANS: 'Personal loans', BUSINESS_LOANS: 'Business loans', MARGIN_LOANS: 'Margin loans',
  LEASES: 'Leases', OVERDRAFTS: 'Overdrafts', REGULATED_TRUST_ACCOUNTS: 'Trust accounts', TRADE_FINANCE: 'Trade finance', TRAVEL_CARDS: 'Travel cards',
};
const FEATURE = { OFFSET: 'Offset', REDRAW: 'Redraw', EXTRA_REPAYMENTS: 'Extra repayments', INTEREST_FREE: 'Interest-free days', UNLIMITED_TXNS: 'Unlimited txns', DIGITAL_WALLET: 'Digital wallet', CASHBACK_OFFER: 'Cashback' };

let D = {}; // loaded data
const productByKey = new Map();
const ratesByKey = new Map();

// ---------- matching helpers (mirror pipeline/insights.mjs)
const appliesLvr = (r, lvr) => !lvr || ((r.lvrMin === null || r.lvrMin < lvr || (r.lvrMin === 0 && lvr === 0)) && (r.lvrMax === null || r.lvrMax >= lvr));
const appliesBal = (r, bal) => (r.balMin === null || r.balMin <= bal) && (r.balMax === null || r.balMax >= bal);
const matchP = (v, want) => want === 'ANY' || v === want || v === 'UNCONSTRAINED';
const lvrText = (r) => (r.lvrMin === null && r.lvrMax === null ? "Any" : `<span style="white-space:nowrap">${r.lvrMin ?? 0}\u2013${r.lvrMax ?? 100}%</span>`);

function monthlyRepayment(P, ratePct, years, io) {
  const i = ratePct / 1200;
  if (io) return P * i;
  const n = years * 12;
  return i === 0 ? P / n : (P * i) / (1 - (1 + i) ** -n);
}

// ---------- boot
async function load() {
  const files = ['meta', 'insights', 'boards', 'products', 'rates', 'brands', 'quality', 'changes'];
  const res = await Promise.all(files.map((f) => fetch(`${DATA}${f}.json`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
  files.forEach((f, i) => (D[f] = res[i]));
  if (!D.meta) {
    $('#freshness').textContent = 'No data yet \u2014 run the refresh pipeline';
    $('#tab-insights').innerHTML = `<div class="card empty">No data found in <code>site/data/</code>. Run <code>npm run refresh</code>.</div>`;
    return;
  }
  D.products = fromColumnar(D.products);
  D.rates = fromColumnar(D.rates);
  for (const p of D.products) productByKey.set(p.key, p);
  for (const r of D.rates) {
    if (!ratesByKey.has(r.k)) ratesByKey.set(r.k, []);
    ratesByKey.get(r.k).push(r);
  }
  const at = new Date(D.meta.generatedAt);
  const ageH = (Date.now() - at) / 36e5;
  $('#freshness').innerHTML = `<span class="dot ${ageH > 36 ? 'stale' : ''}"></span>Updated ${esc(at.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }))}`;
  renderAll();
  route();
}

const renderers = {};
function renderAll() {
  for (const k of Object.keys(renderers)) renderers[k]();
}
// Each menu address maps to a page section; banking product pages share sections and set a mode.
const ROUTES = {
  home: { tab: 'insights' },
  'home-loans': { tab: 'home', group: 'banking' },
  savings: { tab: 'deposits', group: 'banking', apply: () => setDepMode('savings') },
  'term-deposits': { tab: 'deposits', group: 'banking', apply: () => setDepMode('td') },
  'credit-cards': { tab: 'cards', group: 'banking', apply: () => setCpMode('cards') },
  'personal-loans': { tab: 'cards', group: 'banking', apply: () => setCpMode('pl') },
  products: { tab: 'all', group: 'banking' },
  insights: { tab: 'rankings' },
  quality: { tab: 'quality' },
  about: { tab: 'about' },
};
const LEGACY = { '': 'home', deposits: 'savings', cards: 'credit-cards', all: 'products', rankings: 'insights' };
function route() {
  let name = location.hash.slice(1);
  name = LEGACY[name] ?? name;
  if (!ROUTES[name]) name = 'home';
  const r = ROUTES[name];
  document.querySelectorAll('.tab').forEach((s) => (s.hidden = s.id !== `tab-${r.tab}`));
  document.querySelectorAll('#menu a[href]').forEach((a) => {
    if (a.getAttribute('href') === `#${name}`) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.querySelectorAll('.menu-trigger').forEach((t) => t.classList.toggle('active', t.dataset.group === r.group));
  if (D.meta) r.apply?.();
  closeMenus();
}
function go(name) {
  if (location.hash === `#${name}`) route();
  else location.hash = name;
  window.scrollTo({ top: 0 });
}
window.addEventListener('hashchange', () => {
  route();
  window.scrollTo({ top: 0 });
});

// Dropdown menus
function closeMenus(except) {
  document.querySelectorAll('.menu-trigger').forEach((t) => {
    if (t === except) return;
    t.setAttribute('aria-expanded', 'false');
    document.getElementById(t.getAttribute('aria-controls')).hidden = true;
  });
}
document.querySelectorAll('.menu-trigger').forEach((t) =>
  t.addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = document.getElementById(t.getAttribute('aria-controls'));
    const open = t.getAttribute('aria-expanded') === 'true';
    closeMenus(t);
    t.setAttribute('aria-expanded', String(!open));
    panel.hidden = open;
  })
);
document.addEventListener('click', (e) => !e.target.closest('.menu-group') && closeMenus());
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = document.querySelector('.menu-trigger[aria-expanded="true"]');
  if (open) {
    closeMenus();
    open.focus();
  }
});

// ---------- generic sortable table
function table(el, cols, rows, state, onRow) {
  state.sort ??= cols.find((c) => c.defaultSort)?.key ?? cols[0].key;
  state.dir ??= cols.find((c) => c.key === state.sort)?.defaultDir ?? 'asc';
  const col = cols.find((c) => c.key === state.sort) || cols[0];
  const val = col.sort || ((r) => r[col.key]);
  const sorted = [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    const c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
    return state.dir === 'asc' ? c : -c;
  });
  const limit = state.limit ?? 300;
  el.innerHTML = rows.length
    ? `<div class="table-wrap"><table><thead><tr>${cols
        .map((c) => `<th data-k="${c.key}" class="${c.n ? 'n' : ''}" ${c.key === state.sort ? `aria-sort="${state.dir === 'asc' ? 'ascending' : 'descending'}"` : ''}>${esc(c.label)}</th>`)
        .join('')}</tr></thead><tbody>${sorted
        .slice(0, limit)
        .map((r, i) => `<tr data-i="${rows.indexOf(r)}" class="${i === 0 && state.highlightTop ? 'top1' : ''}">${cols.map((c) => `<td class="${c.n ? 'n' : ''} ${c.cls || ''}">${c.fmt ? c.fmt(r) : esc(r[c.key])}</td>`).join('')}</tr>`)
        .join('')}</tbody></table></div><div class="count">${rows.length.toLocaleString()} result${rows.length === 1 ? '' : 's'}${rows.length > limit ? ` \u2014 showing first ${limit}` : ''}</div>`
    : `<div class="table-wrap"><div class="empty">No products match these filters.</div></div>`;
  el.querySelectorAll('th').forEach((th) =>
    th.addEventListener('click', () => {
      const k = th.dataset.k;
      if (state.sort === k) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      else {
        state.sort = k;
        state.dir = cols.find((c) => c.key === k).defaultDir || 'asc';
      }
      table(el, cols, rows, state, onRow);
    })
  );
  el.querySelectorAll('tbody tr').forEach((tr) => tr.addEventListener('click', () => onRow?.(rows[+tr.dataset.i])));
}

const bankCell = (p) => `<div class="bank">${esc(p.brand)}</div><div class="prod">${esc(p.name)}${p.tailored ? ' <span class="tag warn">Tailored</span>' : ''}</div>`;
const featureTags = (p) => (p.features || []).filter((f) => FEATURE[f]).map((f) => `<span class="tag ${f === 'OFFSET' ? 'good' : ''}">${FEATURE[f]}</span>`).join('');
const brandOptions = () => [...new Set(D.products.map((p) => p.brand))].sort().map((b) => `<option>${esc(b)}</option>`).join('');

const changeDesc = (c) =>
  [CAT[c.cat] || c.cat, c.type.toLowerCase().replace(/_/g, ' ') + (c.term ? ` ${termLabel(c.term)}` : ''), c.purpose && !['UNSPECIFIED', 'UNCONSTRAINED'].includes(c.purpose) ? (LABEL[c.purpose] || c.purpose).toLowerCase() : null, c.repay && !['UNSPECIFIED', 'UNCONSTRAINED'].includes(c.repay) ? LABEL[c.repay] || c.repay : null, c.lvrMax ? `up to ${c.lvrMax}% LVR` : null]
    .filter(Boolean)
    .join(', ');

// ---------- OVERVIEW (front page: deliberately short)
const LEDGER = [
  { board: 'hl-oo-pi-var', name: 'Home loan to live in', scn: 'Variable, principal & interest, 80% LVR' },
  { board: 'hl-inv-pi-var', name: 'Investment home loan', scn: 'Variable, principal & interest, 80% LVR' },
  { board: 'td-12', name: '1-year term deposit', scn: 'On a $10,000 deposit' },
  { board: 'sav-total', name: 'Savings account', scn: 'Including bonus interest, $10,000 balance' },
];
const FEATURED = ['cross-var', 'investor-premium', 'fixed-vs-variable', 'offset-cost', 'savings-bonus', 'td-best', 'lvr-reward', 'card-fee'];

renderers.insights = () => {
  const el = $('#tab-insights');
  const boards = new Map((D.boards || []).map((b) => [b.id, b]));
  const ins = D.insights || [];
  const featured = FEATURED.map((id) => ins.find((i) => i.id === id)).filter(Boolean).slice(0, 3);
  const run = D.changes?.runs?.[0];
  const rows = LEDGER.map((l) => ({ ...l, b: boards.get(l.board) })).filter((l) => l.b?.n);
  el.innerHTML = `
    <section class="hero">
      <h2 class="hero-title">The best published rates from ${D.meta.brandsOk} Australian banks and lenders, checked every morning.</h2>
      <p class="hero-sub">Taken directly from each bank's official Open Banking data. Nobody pays to be listed or ranked.</p>
    </section>

    <section class="block">
      <h2 class="block-title">Today's best rates</h2>
      <div class="ledger">${rows
        .map((l) => {
          const top = l.b.ranking[0];
          const [whole, frac] = top.rate.toFixed(2).split('.');
          return `<button class="ledger-row" data-k="${esc(top.key)}">
            <span class="l-what"><span class="l-name">${esc(l.name)}</span><span class="l-scn">${esc(l.scn)}</span></span>
            <span class="l-who"><span class="l-bank">${esc(top.brand)}</span><span class="l-prod">${esc(top.product)}</span></span>
            <span class="l-fig"><span class="l-rate">${whole}<span class="l-frac">.${frac}</span><span class="l-pct">%</span></span>
              <span class="l-note">${top.comp ? `Comparison rate ${pct(top.comp)}` : `Typical: ${pct(l.b.median)}`}</span></span>
          </button>`;
        })
        .join('')}</div>
      <p class="block-foot">
        <button class="textbtn" data-goto="home-loans">Compare home loans</button>
        <button class="textbtn" data-goto="savings">Compare savings accounts</button>
        <button class="textbtn" data-goto="term-deposits">Compare term deposits</button>
      </p>
    </section>

    ${featured.length ? `<section class="block">
      <h2 class="block-title">What stands out</h2>
      <div class="notes">${featured.map((i) => `<article class="note"><h3>${esc(i.headline)}</h3><p>${esc(i.detail)}</p></article>`).join('')}</div>
      <p class="block-foot"><button class="textbtn" data-goto="insights">See all insights</button></p>
    </section>` : ''}

    <section class="block">
      <h2 class="block-title">Changed since the last check</h2>
      ${run?.count
        ? `<p class="muted">${run.count} published rate${run.count > 1 ? 's' : ''} changed: ${(() => { const up = run.changes.filter((c) => c.delta > 0).length; return `${up} went up and ${run.changes.length - up} went down`; })()}.</p>
           <ul class="changes">${run.changes
             .slice(0, 3)
             .map((c) => `<li><button class="change-row" data-k="${esc(c.k)}"><span><b>${esc(c.brand)}</b> ${esc(c.product)}<span class="c-what">${esc(changeDesc(c))}</span></span><span class="c-fig">${pct(c.from)} <span aria-hidden="true">to</span> <b class="${c.delta > 0 ? 'up' : 'down'}">${pct(c.to)}</b></span></button></li>`)
             .join('')}</ul>
           ${run.count > 3 ? `<p class="block-foot"><button class="textbtn" data-goto="insights" data-anchor="changes">See every change</button></p>` : ''}`
        : `<p class="muted">No published rates changed since the previous check.</p>`}
    </section>`;
  el.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => openProduct(b.dataset.k)));
  el.querySelectorAll('[data-goto]').forEach((b) =>
    b.addEventListener('click', () => {
      go(b.dataset.goto);
      if (b.dataset.anchor) setTimeout(() => $(`#${b.dataset.anchor}`)?.scrollIntoView(), 0);
    })
  );
};

// ---------- RANKINGS (full detail lives here)
renderers.rankings = () => {
  const el = $('#tab-rankings');
  const ins = (D.insights || []).filter((i) => i.id !== 'dq');
  const groups = [...new Set(ins.map((i) => i.group))];
  const boards = D.boards || [];
  el.innerHTML = `
    <h2 class="page-title">Insights</h2>
    <p class="muted">What the published rates show today, worked out automatically each morning.</p>
    ${groups
      .map(
        (g) => `<h3 class="group-title">${esc(g)}</h3><div class="notes">${ins
          .filter((i) => i.group === g)
          .map((i) => `<article class="note"><h3>${esc(i.headline)}</h3><p>${esc(i.detail)}</p>${i.board ? `<button class="textbtn" data-board="${esc(i.board)}">Show this ranking</button>` : ''}</article>`)
          .join('')}</div>`
      )
      .join('')}


    <h2 class="page-title" id="rankings">Rankings</h2>
    <p class="muted">Each lender's best published rate in the chosen category. Tailored products are left out because their rate depends on the applicant.</p>
    <div class="board-head"><label class="field">Category<select id="board-select">${[...new Set(boards.map((b) => b.group))]
      .map((g) => `<optgroup label="${esc(g)}">${boards.filter((b) => b.group === g).map((b) => `<option value="${esc(b.id)}">${esc(b.label)}, ${esc(b.scenario)} (${b.n} lenders)</option>`).join('')}</optgroup>`)
      .join('')}</select></label></div>
    <div id="board"></div>

    <h2 class="page-title" id="changes">Rate changes</h2>
    <div id="changes-list"></div>`;
  const sel = $('#board-select', el);
  sel.addEventListener('change', () => drawBoard(sel.value));
  el.querySelectorAll('[data-board]').forEach((b) =>
    b.addEventListener('click', () => {
      sel.value = b.dataset.board;
      drawBoard(sel.value);
      $('#rankings').scrollIntoView({ behavior: 'smooth' });
    })
  );
  if (boards.length) drawBoard(boards[0].id);
  drawChanges();
};

function drawBoard(id) {
  const b = D.boards.find((x) => x.id === id);
  const el = $('#board');
  if (!b || !b.n) return (el.innerHTML = `<div class="card empty">No lenders publish a comparable rate for this segment.</div>`);
  const vals = b.ranking.map((r) => r.rate);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  // bar length = "goodness": best lender gets the full bar
  const w = (v) => 12 + 88 * (b.dir === 'asc' ? (hi - v) / span : (v - lo) / span);
  el.innerHTML = `<div class="card"><div class="bars">${b.ranking
    .slice(0, 40)
    .map(
      (r, i) => `<div class="bar-row" data-k="${esc(r.key)}" title="${esc(r.product)}"><span class="rank">${i + 1}</span>
        <span class="who">${esc(r.brand)} <small>${esc(r.product)}</small></span>
        <span class="bar-track"><span class="bar-fill" style="width:${w(r.rate).toFixed(1)}%"></span></span>
        <span class="val">${pct(r.rate)}</span></div>`
    )
    .join('')}</div><p class="median-note">Typical rate across ${b.n} lenders: <b>${pct(b.median)}</b>. ${b.dir === 'asc' ? 'Lower is better.' : 'Higher is better.'}${b.n > 40 ? ' Top 40 shown.' : ''}</p></div>`;
  el.querySelectorAll('.bar-row').forEach((row) => row.addEventListener('click', () => openProduct(row.dataset.k)));
}

function drawChanges() {
  const el = $('#changes-list');
  const runs = D.changes?.runs || [];
  const all = runs.flatMap((r) => r.changes.map((c) => ({ ...c, at: r.at })));
  if (!all.length) return (el.innerHTML = `<div class="card empty">No rate changes recorded yet. Changes appear after the second daily refresh.</div>`);
  const st = { sort: 'at', dir: 'desc', limit: 200 };
  table(
    el,
    [
      { key: 'at', label: 'Detected', fmt: (c) => esc(new Date(c.at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })) },
      { key: 'brand', label: 'Lender / product', fmt: (c) => `<div class="bank">${esc(c.brand)}</div><div class="prod">${esc(c.product)}</div>` },
      { key: 'cat', label: 'Rate', fmt: (c) => esc(changeDesc(c)) },
      { key: 'from', label: 'From', n: true, fmt: (c) => pct(c.from) },
      { key: 'to', label: 'To', n: true, fmt: (c) => pct(c.to) },
      { key: 'delta', label: 'Change', n: true, fmt: (c) => `<b style="color:var(${c.delta > 0 ? '--bad' : '--good'})">${c.delta > 0 ? '+' : '\u2212'}${Math.abs(c.delta).toFixed(2)}</b>`, sort: (c) => Math.abs(c.delta) },
    ],
    all,
    st,
    (c) => openProduct(c.k)
  );
}

// ---------- HOME LOANS
const hl = { purpose: 'OWNER_OCCUPIED', repay: 'PRINCIPAL_AND_INTEREST', type: 'VARIABLE', term: 36, lvr: 80, amount: 600000, years: 30, offset: false, tailored: false, best: true, brand: '', t: {} };
renderers.home = () => {
  const el = $('#tab-home');
  el.innerHTML = `
    <h2 class="page-title">Home loans</h2>
    <p class="muted">Every lender's published home-loan rates. Set your situation and the table updates.</p>
    <div class="filters" id="hl-f">
      <label class="field">Property use<select data-k="purpose"><option value="OWNER_OCCUPIED">Owner-occupied</option><option value="INVESTMENT">Investment</option></select></label>
      <label class="field">Repayments<select data-k="repay"><option value="PRINCIPAL_AND_INTEREST">Principal &amp; interest</option><option value="INTEREST_ONLY">Interest only</option></select></label>
      <label class="field">Rate type<select data-k="type"><option value="VARIABLE">Variable</option><option value="FIXED">Fixed</option></select></label>
      <label class="field" id="hl-term">Fixed term<select data-k="term"><option value="12">1 year</option><option value="24">2 years</option><option value="36">3 years</option><option value="48">4 years</option><option value="60">5 years</option></select></label>
      <label class="field">LVR %<input type="number" data-k="lvr" min="10" max="100" step="5" /></label>
      <label class="field">Loan amount<input type="number" data-k="amount" min="10000" step="10000" /></label>
      <label class="field">Loan term (yrs)<input type="number" data-k="years" min="1" max="40" /></label>
      <label class="field">Lender<select data-k="brand"><option value="">All lenders</option>${brandOptions()}</select></label>
      <label class="check"><input type="checkbox" data-k="offset" /> Offset only</label>
      <label class="check"><input type="checkbox" data-k="best" /> Best per lender</label>
      <label class="check"><input type="checkbox" data-k="tailored" /> Include tailored</label>
    </div>
    <div id="hl-table"></div>`;
  bindFilters($('#hl-f', el), hl, drawHome);
  drawHome();
};
function drawHome() {
  $('#hl-term').style.display = hl.type === 'FIXED' ? '' : 'none';
  const rows = [];
  const best = new Map();
  for (const r of D.rates) {
    if (r.cat !== 'RESIDENTIAL_MORTGAGES' || r.kind !== 'L' || r.type !== hl.type) continue;
    if (hl.type === 'FIXED' && (r.term === null || Math.abs(r.term - hl.term) >= 0.5)) continue;
    if (!matchP(r.purpose, hl.purpose) || !matchP(r.repay, hl.repay) || !appliesLvr(r, hl.lvr)) continue;
    const p = productByKey.get(r.k);
    if (!p || (p.tailored && !hl.tailored) || (hl.offset && !p.offset) || (hl.brand && p.brand !== hl.brand)) continue;
    const key = hl.best ? p.brandId : p.key;
    const cur = best.get(key);
    if (!cur || r.rate < cur.r.rate) best.set(key, { r, p });
  }
  for (const { r, p } of best.values())
    rows.push({ ...r, p, monthly: monthlyRepayment(hl.amount, r.rate, hl.years, hl.repay === 'INTEREST_ONLY'), fees: p.yearlyFees });
  table(
    $('#hl-table'),
    [
      { key: 'brand', label: 'Lender / product', fmt: (r) => bankCell(r.p), sort: (r) => r.p.brand },
      { key: 'rate', label: 'Rate', n: true, cls: 'rate', fmt: (r) => pct(r.rate), defaultSort: true },
      { key: 'comp', label: 'Comparison', n: true, fmt: (r) => pct(r.comp) },
      { key: 'monthly', label: 'Monthly repayment', n: true, fmt: (r) => money(r.monthly) },
      { key: 'fees', label: 'Ongoing fees / yr', n: true, fmt: (r) => money(r.fees) },
      { key: 'lvr', label: 'LVR band', fmt: lvrText, sort: (r) => r.lvrMax ?? 100 },
      { key: 'features', label: 'Features', fmt: (r) => featureTags(r.p), sort: (r) => (r.p.offset ? 0 : 1) },
    ],
    rows,
    Object.assign(hl.t, { highlightTop: true }),
    (r) => openProduct(r.k)
  );
}

function bindFilters(root, state, redraw) {
  root.querySelectorAll('[data-k]').forEach((input) => {
    const k = input.dataset.k;
    if (input.type === 'checkbox') input.checked = !!state[k];
    else input.value = state[k];
    input.addEventListener(input.type === 'number' || input.type === 'search' ? 'input' : 'change', () => {
      state[k] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) || 0 : input.tagName === 'SELECT' && /^\d+$/.test(input.value) ? Number(input.value) : input.value;
      redraw();
    });
  });
}

// ---------- DEPOSITS
const dep = { mode: 'savings', balance: 10000, term: 12, conditions: true, brand: '', ts: {}, tt: {} };
renderers.deposits = () => {
  const el = $('#tab-deposits');
  el.innerHTML = `
    <h2 class="page-title" id="dep-title"></h2>
    <p class="muted" id="dep-intro"></p>
    <div class="filters" id="dep-f">
      <label class="field">Balance<input type="number" data-k="balance" min="0" step="1000" /></label>
      <label class="field" id="dep-term">Term<select data-k="term"><option value="1">1 month</option><option value="3">3 months</option><option value="4">4 months</option><option value="6">6 months</option><option value="9">9 months</option><option value="12">12 months</option><option value="18">18 months</option><option value="24">2 years</option><option value="36">3 years</option><option value="48">4 years</option><option value="60">5 years</option></select></label>
      <label class="field">Provider<select data-k="brand"><option value="">All providers</option>${brandOptions()}</select></label>
      <label class="check" id="dep-cond"><input type="checkbox" data-k="conditions" /> Include bonus rates (conditions apply)</label>
    </div><div id="dep-table"></div>`;
  bindFilters($('#dep-f', el), dep, drawDeposits);
  drawDeposits();
};
function setDepMode(m) {
  dep.mode = m;
  drawDeposits();
}
function drawDeposits() {
  $('#dep-title').textContent = dep.mode === 'td' ? 'Term deposits' : 'Savings accounts';
  $('#dep-intro').textContent = dep.mode === 'td' ? 'Fixed rates for your balance and term, with the interest you would earn at maturity.' : 'Base, bonus and introductory rates for your balance. Bonus rates come with monthly conditions.';
  $('#dep-term').style.display = dep.mode === 'td' ? '' : 'none';
  $('#dep-cond').style.display = dep.mode === 'savings' ? '' : 'none';
  const el = $('#dep-table');
  if (dep.mode === 'td') {
    const best = new Map();
    for (const r of D.rates) {
      if (r.cat !== 'TERM_DEPOSITS' || r.kind !== 'D' || r.type !== 'FIXED' || r.term === null || Math.abs(r.term - dep.term) >= 0.5 || !appliesBal(r, dep.balance)) continue;
      const p = productByKey.get(r.k);
      if (!p || (dep.brand && p.brand !== dep.brand)) continue;
      const cur = best.get(p.key);
      if (!cur || r.rate > cur.r.rate) best.set(p.key, { r, p });
    }
    const rows = [...best.values()].map(({ r, p }) => ({ ...r, p, interest: (dep.balance * r.rate * (dep.term / 12)) / 100 }));
    return table(
      el,
      [
        { key: 'brand', label: 'Provider / product', fmt: (r) => bankCell(r.p), sort: (r) => r.p.brand },
        { key: 'rate', label: 'Rate p.a.', n: true, cls: 'rate', fmt: (r) => pct(r.rate), defaultSort: true, defaultDir: 'desc' },
        { key: 'interest', label: 'Interest at maturity', n: true, fmt: (r) => money(r.interest, 2), defaultDir: 'desc' },
        { key: 'bal', label: 'Balance range', fmt: (r) => `${money(r.balMin)}${r.balMax ? `\u2013${money(r.balMax)}` : '+'}`, sort: (r) => r.balMin },
        { key: 'info', label: 'Notes', fmt: (r) => `<span class="small muted">${esc(r.info || r.tierNote || '')}</span>` },
      ],
      rows,
      Object.assign(dep.tt, { highlightTop: true }),
      (r) => openProduct(r.k)
    );
  }
  // Savings: base + best bonus per product at this balance
  const per = new Map();
  for (const r of D.rates) {
    if (r.cat !== 'TRANS_AND_SAVINGS_ACCOUNTS' || r.kind !== 'D' || !appliesBal(r, dep.balance)) continue;
    const p = productByKey.get(r.k);
    if (!p || (dep.brand && p.brand !== dep.brand)) continue;
    const e = per.get(p.key) || { p, k: p.key, base: 0, bonus: 0, bonusInfo: '', intro: null, introTerm: null };
    if (['VARIABLE', 'FLOATING', 'MARKET_LINKED'].includes(r.type)) e.base = Math.max(e.base, r.rate);
    else if ((r.type === 'BONUS' || r.type === 'BUNDLE_BONUS') && r.rate > e.bonus) Object.assign(e, { bonus: r.rate, bonusInfo: r.info || '' });
    else if (r.type === 'INTRODUCTORY' && r.rate > (e.intro ?? 0)) Object.assign(e, { intro: r.rate, introTerm: r.term });
    per.set(p.key, e);
  }
  const rows = [...per.values()]
    .map((e) => ({ ...e, total: e.base + (dep.conditions ? e.bonus : 0) }))
    .filter((e) => e.total > 0 || e.intro)
    .map((e) => ({ ...e, yearly: (dep.balance * e.total) / 100 }));
  table(
    el,
    [
      { key: 'brand', label: 'Provider / account', fmt: (r) => bankCell(r.p), sort: (r) => r.p.brand },
      { key: 'total', label: dep.conditions ? 'Max rate' : 'Base rate', n: true, cls: 'rate', fmt: (r) => pct(r.total), defaultSort: true, defaultDir: 'desc' },
      { key: 'base', label: 'Base', n: true, fmt: (r) => pct(r.base), defaultDir: 'desc' },
      { key: 'bonus', label: 'Bonus', n: true, fmt: (r) => (r.bonus ? pct(r.bonus) : '\u2014'), defaultDir: 'desc' },
      { key: 'intro', label: 'Intro offer', n: true, fmt: (r) => (r.intro ? `${pct(r.intro)}${r.introTerm ? ` <span class="small muted">for ${termLabel(r.introTerm)}</span>` : ''}` : '\u2014'), defaultDir: 'desc' },
      { key: 'yearly', label: 'Interest / yr', n: true, fmt: (r) => money(r.yearly), defaultDir: 'desc' },
      { key: 'bonusInfo', label: 'Bonus conditions', fmt: (r) => `<span class="small muted">${esc(r.bonusInfo)}</span>` },
    ],
    rows,
    Object.assign(dep.ts, { highlightTop: true }),
    (r) => openProduct(r.k)
  );
}

// ---------- CARDS & PERSONAL LOANS
const cp = { mode: 'cards', balance: 3000, nofee: false, tailored: true, brand: '', tc: {}, tp: {} };
renderers.cards = () => {
  const el = $('#tab-cards');
  el.innerHTML = `
    <h2 class="page-title" id="cp-title"></h2>
    <p class="muted" id="cp-intro"></p>
    <div class="filters" id="cp-f">
      <label class="field" id="cp-bal">Typical balance carried<input type="number" data-k="balance" min="0" step="500" /></label>
      <label class="field">Provider<select data-k="brand"><option value="">All providers</option>${brandOptions()}</select></label>
      <label class="check" id="cp-nofee"><input type="checkbox" data-k="nofee" /> $0 annual fee only</label>
      <label class="check" id="cp-tail"><input type="checkbox" data-k="tailored" /> Include tailored</label>
    </div><div id="cp-table"></div>`;
  bindFilters($('#cp-f', el), cp, drawCards);
  drawCards();
};
function setCpMode(m) {
  cp.mode = m;
  drawCards();
}
function drawCards() {
  $('#cp-title').textContent = cp.mode === 'pl' ? 'Personal loans' : 'Credit cards';
  $('#cp-intro').textContent = cp.mode === 'pl' ? 'Advertised starting rates. Most personal loans are priced on your profile, so your rate may be higher.' : 'Purchase rates and fees, with an estimate of what a card costs you each year at your balance.';
  $('#cp-bal').style.display = $('#cp-nofee').style.display = cp.mode === 'cards' ? '' : 'none';
  const el = $('#cp-table');
  const cat = cp.mode === 'cards' ? 'CRED_AND_CHRG_CARDS' : 'PERS_LOANS';
  const per = new Map();
  for (const r of D.rates) {
    if (r.cat !== cat || r.kind !== 'L' || !r.comparable) continue;
    const p = productByKey.get(r.k);
    if (!p || (cp.brand && p.brand !== cp.brand) || (p.tailored && !cp.tailored)) continue;
    if (cp.mode === 'cards' && cp.nofee && p.yearlyFees) continue;
    const e = per.get(p.key) || { p, k: p.key, purchase: null, cash: null, fixed: null, variable: null, comp: null };
    const t = r.type;
    if (t === 'PURCHASE') e.purchase = Math.min(e.purchase ?? 99, r.rate);
    else if (t === 'CASH_ADVANCE') e.cash = Math.min(e.cash ?? 99, r.rate);
    else if (t === 'FIXED' && r.rate < (e.fixed ?? 99)) Object.assign(e, { fixed: r.rate, comp: r.comp ?? e.comp });
    else if (t === 'VARIABLE' && r.rate < (e.variable ?? 99)) Object.assign(e, { variable: r.rate, comp: e.comp ?? r.comp });
    per.set(p.key, e);
  }
  const rows = [...per.values()];
  if (cp.mode === 'cards') {
    rows.forEach((r) => (r.cost = r.purchase !== null ? (cp.balance * r.purchase) / 100 + (r.p.yearlyFees || 0) : null));
    return table(
      el,
      [
        { key: 'brand', label: 'Provider / card', fmt: (r) => bankCell(r.p), sort: (r) => r.p.brand },
        { key: 'purchase', label: 'Purchase rate', n: true, cls: 'rate', fmt: (r) => pct(r.purchase) },
        { key: 'cash', label: 'Cash advance', n: true, fmt: (r) => pct(r.cash) },
        { key: 'fee', label: 'Annual fees', n: true, fmt: (r) => money(r.p.yearlyFees), sort: (r) => r.p.yearlyFees },
        { key: 'cost', label: 'Est. cost / yr', n: true, fmt: (r) => money(r.cost), defaultSort: true },
        { key: 'features', label: 'Features', fmt: (r) => featureTags(r.p), sort: () => 0 },
      ],
      rows.filter((r) => r.purchase !== null),
      Object.assign(cp.tc, { highlightTop: true }),
      (r) => openProduct(r.k)
    );
  }
  rows.forEach((r) => (r.best = Math.min(r.fixed ?? 99, r.variable ?? 99)));
  table(
    el,
    [
      { key: 'brand', label: 'Provider / loan', fmt: (r) => bankCell(r.p), sort: (r) => r.p.brand },
      { key: 'best', label: 'From', n: true, cls: 'rate', fmt: (r) => pct(r.best < 99 ? r.best : null), defaultSort: true },
      { key: 'fixed', label: 'Fixed', n: true, fmt: (r) => pct(r.fixed) },
      { key: 'variable', label: 'Variable', n: true, fmt: (r) => pct(r.variable) },
      { key: 'comp', label: 'Comparison', n: true, fmt: (r) => pct(r.comp) },
      { key: 'upfront', label: 'Upfront fees', n: true, fmt: (r) => money(r.p.upfrontFees), sort: (r) => r.p.upfrontFees },
    ],
    rows.filter((r) => r.best < 99),
    Object.assign(cp.tp, { highlightTop: true }),
    (r) => openProduct(r.k)
  );
}

// ---------- ALL PRODUCTS
const ap = { q: '', cat: '', brand: '', t: { sort: 'brand' } };
renderers.all = () => {
  const el = $('#tab-all');
  const cats = [...new Set(D.products.map((p) => p.category))].sort();
  el.innerHTML = `
    <h2 class="page-title">All banking products</h2>
    <p class="muted">Search every product published by every bank, including business and specialist products.</p>
    <div class="filters" id="ap-f">
      <label class="field">Search<input type="search" data-k="q" placeholder="Product, provider or feature\u2026" /></label>
      <label class="field">Category<select data-k="cat"><option value="">All categories</option>${cats.map((c) => `<option value="${esc(c)}">${esc(CAT[c] || c)}</option>`).join('')}</select></label>
      <label class="field">Provider<select data-k="brand"><option value="">All providers</option>${brandOptions()}</select></label>
    </div><div id="ap-table"></div>`;
  bindFilters($('#ap-f', el), ap, drawAll);
  drawAll();
};
function drawAll() {
  const q = ap.q.trim().toLowerCase();
  const rows = D.products.filter(
    (p) => (!ap.cat || p.category === ap.cat) && (!ap.brand || p.brand === ap.brand) && (!q || `${p.brand} ${p.name} ${(p.features || []).join(' ')}`.toLowerCase().includes(q))
  );
  table(
    $('#ap-table'),
    [
      { key: 'brand', label: 'Provider / product', fmt: bankCell },
      { key: 'category', label: 'Category', fmt: (p) => esc(CAT[p.category] || p.category) },
      { key: 'rates', label: 'Rates', n: true, fmt: (p) => (ratesByKey.get(p.key) || []).length, sort: (p) => (ratesByKey.get(p.key) || []).length },
      { key: 'yearlyFees', label: 'Ongoing fees / yr', n: true, fmt: (p) => money(p.yearlyFees) },
      { key: 'features', label: 'Features', fmt: featureTags, sort: (p) => (p.features || []).length },
      { key: 'lastUpdated', label: 'Updated by bank', fmt: (p) => esc(p.lastUpdated ? new Date(p.lastUpdated).toLocaleDateString('en-AU') : '\u2014') },
    ],
    rows,
    ap.t,
    (p) => openProduct(p.key)
  );
}

// ---------- DATA QUALITY
renderers.quality = () => {
  const el = $('#tab-quality');
  const q = new Map((D.quality || []).map((x) => [x.brandId, x]));
  const brands = D.brands || [];
  const failing = brands.filter((b) => !b.ok);
  el.innerHTML = `
    <h2 class="page-title">Data quality</h2>
    <p class="muted">How well each data holder's public product data conforms to the Consumer Data Standards \u2014 useful for spotting gaps that affect comparisons, and for holders checking their own implementation.</p>
    <div class="stats">
      <div class="stat"><div class="v">${brands.length - failing.length}/${brands.length}</div><div class="l">endpoints responding</div></div>
      <div class="stat"><div class="v">${(D.quality || []).length}</div><div class="l">brands with issues</div></div>
      <div class="stat"><div class="v">${(D.quality || []).reduce((s, x) => s + x.total, 0).toLocaleString()}</div><div class="l">issues found</div></div>
    </div>
    <div id="dq-table"></div>`;
  const rows = brands.map((b) => ({ ...b, q: q.get(b.brandId), total: q.get(b.brandId)?.total || 0 }));
  table(
    $('#dq-table', el),
    [
      { key: 'brand', label: 'Data holder brand', fmt: (b) => `<div class="bank">${esc(b.brand)}</div><div class="prod">${esc(b.baseUri)}</div>` },
      { key: 'ok', label: 'Status', fmt: (b) => (b.ok ? '<span class="status-ok">Responding</span>' : '<span class="status-fail">Failed</span>'), sort: (b) => (b.ok ? 1 : 0) },
      { key: 'products', label: 'Products', n: true },
      { key: 'listVersion', label: 'API versions', fmt: (b) => `<span class="small">list v${esc(b.listVersion ?? '\u2014')}; detail ${Object.entries(b.detailVersions || {}).map(([v, n]) => `v${esc(v)}\u00d7${n}`).join(', ') || '\u2014'}</span>` },
      { key: 'total', label: 'Issues', n: true, defaultSort: true, defaultDir: 'desc' },
      {
        key: 'detail',
        label: 'What we found',
        fmt: (b) =>
          b.q ? `<ul class="issue-list">${b.q.issues.map((i) => `<li><b>${i.count}\u00d7</b> ${esc(i.label)} <code>${esc(i.code)}</code>${i.examples[0]?.product ? ` \u2014 e.g. ${esc(i.examples[0].product)}` : ''}${i.examples[0]?.value && i.code !== 'LIST_FAILED' ? ` <code>${esc(String(i.examples[0].value).slice(0, 60))}</code>` : ''}${i.code === 'LIST_FAILED' ? ` <span class="small muted">${esc(String(i.examples[0]?.value || '').slice(0, 400))}</span>` : ''}</li>`).join('')}</ul>` : '<span class="status-ok">No issues</span>',
        sort: (b) => b.total,
      },
    ],
    rows,
    { sort: 'total', dir: 'desc' },
    null
  );
};

// ---------- ABOUT
renderers.about = () => {
  $('#tab-about').innerHTML = `<div class="about">
    <h2>How this works</h2>
    <p>Every day, a scheduled job reads the <a href="https://www.cdr.gov.au/" target="_blank" rel="noopener">CDR Register</a> to find every banking data holder brand and its public base URI, then calls each one's unauthenticated Product Reference APIs \u2014 <code>GET /banking/products</code> and <code>GET /banking/products/{productId}</code> \u2014 as defined in the <a href="https://consumerdatastandardsaustralia.github.io/standards/" target="_blank" rel="noopener">Consumer Data Standards</a>.</p>
    <p>Rates, fees, features, eligibility and constraints are normalised so like can be compared with like: lending rates are split by loan purpose, repayment type, fixed term and LVR band; deposit rates by term and balance tier. Insights are generated automatically from the rankings.</p>
    <h2>Comparison assumptions</h2>
    <ul>
      <li>Headline home-loan comparisons use an LVR of ${D.meta.scenarios.homeLoanLvr}%; the Home loans tab lets you change it.</li>
      <li>Deposit comparisons assume a $${D.meta.scenarios.depositBalance.toLocaleString('en-AU')} balance.</li>
      <li>Tailored products (where the rate depends on your circumstances) are excluded from home-loan and deposit leaderboards and flagged elsewhere.</li>
      <li>Savings "max rate" adds the highest bonus rate to the base rate; conditions apply.</li>
      <li>Monthly repayments are estimates for a standard amortising loan and ignore fees.</li>
    </ul>
    <h2>Run details</h2>
    <dl class="kv"><dt>Last refresh</dt><dd>${esc(new Date(D.meta.generatedAt).toLocaleString('en-AU'))}</dd>
    <dt>Duration</dt><dd>${(D.meta.durationMs / 60000).toFixed(1)} min</dd>
    <dt>Brands</dt><dd>${D.meta.brandsOk} of ${D.meta.brandsTotal} responded</dd>
    <dt>API calls</dt><dd>${D.meta.http.requests.toLocaleString()} (${D.meta.http.retries} retries, ${D.meta.http.failures} failures)</dd>
    <dt>Register</dt><dd><code class="small">${esc(D.meta.registerUrl)}</code></dd></dl>
    <p class="small muted">General information only, not financial advice.</p></div>`;
};

// ---------- PRODUCT DRAWER
const detailCache = new Map();
async function openProduct(key) {
  const p = productByKey.get(key);
  if (!p) return;
  const drawer = $('#drawer');
  const body = $('#drawer-body');
  drawer.hidden = false;
  document.body.style.overflow = 'hidden';
  const b = (D.brands || []).find((x) => x.brandId === p.brandId);
  body.innerHTML = `<h2 id="drawer-title">${esc(p.name)}</h2><div class="muted">${esc(p.brand)}, ${esc((CAT[p.category] || p.category).toLowerCase())}</div><div class="empty">Loading\u2026</div>`;
  let det = {};
  if (b?.detailFile) {
    if (!detailCache.has(b.detailFile)) detailCache.set(b.detailFile, fetch(DATA + b.detailFile).then((r) => r.json()).catch(() => ({})));
    det = (await detailCache.get(b.detailFile))[key] || {};
  }
  const rates = (ratesByKey.get(key) || []).slice().sort((a, b) => (a.purpose || '').localeCompare(b.purpose || '') || (a.repay || '').localeCompare(b.repay || '') || a.type.localeCompare(b.type) || (a.term ?? 0) - (b.term ?? 0) || (a.lvrMax ?? 0) - (b.lvrMax ?? 0));
  const isLoan = rates.some((r) => r.kind === 'L');
  const apply = safeUrl(p.uri) || safeUrl(det.overviewUri);
  body.innerHTML = `
    <h2 id="drawer-title">${esc(p.name)}</h2>
    <div class="muted">${esc(p.brand)}, ${esc((CAT[p.category] || p.category).toLowerCase())}${p.tailored ? ' <span class="tag warn">Tailored: your rate may differ</span>' : ''}</div>
    ${det.description ? `<p>${esc(det.description)}</p>` : ''}
    <div>${featureTags(p)}${(p.features || []).filter((f) => !FEATURE[f]).map((f) => `<span class="tag">${esc(f.replace(/_/g, ' ').toLowerCase())}</span>`).join('')}</div>
    ${apply ? `<a class="btn" href="${esc(apply)}" target="_blank" rel="noopener nofollow">View on ${esc(p.brand)} site \u2197</a>` : ''}
    <h4>Rates (${rates.length})</h4>
    ${rates.length ? `<div class="table-wrap"><table><thead><tr><th>Type</th>${isLoan ? '<th>Purpose</th><th>Repayment</th><th>LVR</th>' : '<th>Balance</th>'}<th>Term</th><th class="n">Rate</th>${isLoan ? '<th class="n">Comp.</th>' : ''}</tr></thead><tbody>${rates
      .map((r) => `<tr><td>${esc(r.type.toLowerCase().replace(/_/g, ' '))}${r.info ? `<div class="small muted">${esc(r.info)}</div>` : ''}</td>${isLoan ? `<td>${esc(r.kind === 'L' ? LABEL[r.purpose] || r.purpose : '')}</td><td>${esc(r.kind === 'L' ? LABEL[r.repay] || r.repay : '')}</td><td>${lvrText(r)}</td>` : `<td>${r.balMin !== null || r.balMax !== null ? `${money(r.balMin ?? 0)}${r.balMax ? `\u2013${money(r.balMax)}` : '+'}` : 'Any'}</td>`}<td>${esc(termLabel(r.term))}</td><td class="n rate">${pct(r.rate)}</td>${isLoan ? `<td class="n">${pct(r.comp)}</td>` : ''}</tr>`)
      .join('')}</tbody></table></div>` : '<p class="muted">No rates published for this product.</p>'}
    <h4>Fees</h4>
    ${det.fees?.length ? `<div class="table-wrap"><table><thead><tr><th>Fee</th><th>Type</th><th class="n">Amount</th></tr></thead><tbody>${det.fees
      .map((f) => `<tr><td>${esc(f.name)}${f.info ? `<div class="small muted">${esc(f.info)}</div>` : ''}</td><td>${esc((f.type || '').toLowerCase())}${f.freqMonths ? `, every ${esc(termLabel(f.freqMonths))}` : ''}</td><td class="n">${f.amount !== null ? money(f.amount, 2) : f.rate !== null ? pct(f.rate) : '\u2014'}</td></tr>`)
      .join('')}</tbody></table></div>` : '<p class="muted">No fees published.</p>'}
    ${det.eligibility?.length ? `<h4>Eligibility</h4><dl class="kv">${det.eligibility.map((e) => `<dt>${esc((e.type || '').replace(/_/g, ' ').toLowerCase())}</dt><dd>${esc([e.value, e.info].filter(Boolean).join(' \u2014 ') || '\u2014')}</dd>`).join('')}</dl>` : ''}
    ${det.constraints?.length ? `<h4>Constraints</h4><dl class="kv">${det.constraints.map((c) => `<dt>${esc((c.type || '').replace(/_/g, ' ').toLowerCase())}</dt><dd>${esc([c.value, c.info].filter(Boolean).join(' \u2014 ') || '\u2014')}</dd>`).join('')}</dl>` : ''}
    <h4>Source</h4>
    <dl class="kv"><dt>Product ID</dt><dd><code class="small">${esc(p.productId)}</code></dd><dt>Last updated</dt><dd>${esc(p.lastUpdated ? new Date(p.lastUpdated).toLocaleString('en-AU') : '\u2014')}</dd>${safeUrl(det.feesUri) ? `<dt>Fees &amp; pricing</dt><dd><a href="${esc(det.feesUri)}" target="_blank" rel="noopener nofollow">Provider page \u2197</a></dd>` : ''}</dl>`;
}
function closeDrawer() {
  $('#drawer').hidden = true;
  document.body.style.overflow = '';
}
$('#drawer').addEventListener('click', (e) => e.target.closest('[data-close]') && closeDrawer());
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeDrawer());

load();
