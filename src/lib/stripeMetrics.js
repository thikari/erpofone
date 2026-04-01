/**
 * Stripe metrics — supports one or multiple accounts.
 * Set STRIPE_ACCOUNT_IDS as comma-separated list of "Label:acct_xxx" pairs, e.g.:
 *   STRIPE_ACCOUNT_IDS=Sponsorgap:acct_abc,PaperclipHQ:acct_def
 * Falls back to STRIPE_ACCOUNT_ID (single account) if the multi-account var isn't set.
 *
 * Results cached per account for 5 minutes.
 */

const Stripe = require('stripe');

let client = null;
function getClient() {
  if (!client) client = Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

// Parse account config from env
function getAccounts() {
  const multi = process.env.STRIPE_ACCOUNT_IDS;
  if (multi) {
    return multi.split(',').map(entry => {
      const [label, id] = entry.trim().split(':');
      return { label: label?.trim() || id, id: id?.trim() };
    }).filter(a => a.id);
  }
  const single = process.env.STRIPE_ACCOUNT_ID;
  if (single) return [{ label: 'Default', id: single.trim() }];
  return [];
}

// Per-account cache
const caches = {};
const TTL = 5 * 60 * 1000;

async function getAllMetrics() {
  const accounts = getAccounts();
  if (!accounts.length) throw new Error('No Stripe accounts configured');

  const results = await Promise.all(accounts.map(acct => getAccountMetrics(acct)));

  // Aggregate totals
  const total = results.reduce((sum, r) => ({
    mrr:                 sum.mrr + r.mrr,
    arr:                 sum.arr + r.arr,
    dailyRevenue:        sum.dailyRevenue + r.dailyRevenue,
    activeSubscriptions: sum.activeSubscriptions + r.activeSubscriptions,
  }), { mrr: 0, arr: 0, dailyRevenue: 0, activeSubscriptions: 0 });

  // Combine and sort recent transactions across all accounts
  const allRecent = results.flatMap(r => r.recent).sort((a, b) => b.date - a.date).slice(0, 15);

  // Overall growth & churn from the largest account (most meaningful)
  const biggest = results.reduce((a, b) => a.mrr >= b.mrr ? a : b);

  return {
    ...total,
    churnRate:  biggest.churnRate,
    growthRate: biggest.growthRate,
    recent:     allRecent,
    accounts:   results,   // per-account breakdown
  };
}

async function getAccountMetrics({ label, id }) {
  const now = Date.now();
  if (caches[id]?.data && now - caches[id].at < TTL) return caches[id].data;
  const data = await fetchForAccount(id, label);
  caches[id] = { data, at: now };
  return data;
}

async function fetchForAccount(accountId, label) {
  const stripe = getClient();
  const opts   = { headers: { 'Stripe-Context': accountId } };

  // ── Active subscriptions → MRR ──
  const subs = await paginate(stripe.subscriptions, { status: 'active', expand: ['data.items.data.price'] }, opts);
  let mrrCents = 0;
  for (const sub of subs) {
    for (const item of sub.items.data) {
      const price    = item.price;
      const amount   = price.unit_amount * (item.quantity || 1);
      const interval = price.recurring?.interval;
      const count    = price.recurring?.interval_count || 1;
      if (interval === 'month') mrrCents += amount / count;
      else if (interval === 'year')  mrrCents += amount / (count * 12);
      else if (interval === 'week')  mrrCents += amount * (52 / 12) / count;
      else if (interval === 'day')   mrrCents += amount * (365 / 12) / count;
    }
  }
  const mrr = mrrCents / 100;
  const arr = mrr * 12;

  // ── Daily revenue ──
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const charges = await paginate(stripe.charges, {
    created: { gte: Math.floor(todayStart.getTime() / 1000) },
  }, opts);
  const dailyRevenue = charges
    .filter(c => c.paid && !c.refunded)
    .reduce((sum, c) => sum + c.amount, 0) / 100;

  // ── Churn this month ──
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const canceled = await paginate(stripe.subscriptions, {
    status:  'canceled',
    created: { gte: Math.floor(monthStart.getTime() / 1000) },
  }, opts);
  const churnRate = subs.length > 0
    ? ((canceled.length / (subs.length + canceled.length)) * 100).toFixed(1)
    : '0.0';

  // ── MoM growth ──
  const lastMonthStart = new Date(monthStart); lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
  const lastMonthInvoices = await paginate(stripe.invoices, {
    status:  'paid',
    created: { gte: Math.floor(lastMonthStart.getTime() / 1000), lt: Math.floor(monthStart.getTime() / 1000) },
  }, opts);
  const lastMrr = lastMonthInvoices
    .filter(inv => inv.subscription)
    .reduce((sum, inv) => sum + (inv.amount_paid || 0), 0) / 100;

  let growthRate = '—';
  if (lastMrr > 0) {
    const pct = ((mrr - lastMrr) / lastMrr * 100).toFixed(1);
    growthRate = (pct > 0 ? '+' : '') + pct + '%';
  } else if (mrr > 0) {
    growthRate = '+∞';
  }

  // ── Recent transactions ──
  const recent = charges
    .filter(c => c.paid && !c.refunded)
    .slice(0, 10)
    .map(c => ({
      account:     label,
      amount:      c.amount / 100,
      currency:    c.currency.toUpperCase(),
      description: c.description || c.billing_details?.name || 'Charge',
      date:        new Date(c.created * 1000),
    }));

  return { label, accountId, mrr, arr, dailyRevenue, churnRate, growthRate, activeSubscriptions: subs.length, recent };
}

async function paginate(resource, params = {}, opts = {}) {
  const items = [];
  let page = await resource.list({ limit: 100, ...params }, opts);
  items.push(...page.data);
  while (page.has_more) {
    page = await resource.list(
      { limit: 100, ...params, starting_after: page.data[page.data.length - 1].id },
      opts
    );
    items.push(...page.data);
  }
  return items;
}

module.exports = { getAllMetrics, getAccounts };
