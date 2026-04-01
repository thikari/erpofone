const { Router } = require('express');
const { getAllMetrics, getAccounts } = require('../lib/stripeMetrics');

const router = Router();

router.get('/', async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.render('pages/revenue', { pageTitle: 'Revenue', metrics: null, accounts: [], error: 'STRIPE_SECRET_KEY not set in .env' });
  }

  const accounts = getAccounts();
  if (!accounts.length) {
    return res.render('pages/revenue', { pageTitle: 'Revenue', metrics: null, accounts: [], error: 'No Stripe accounts configured. Add STRIPE_ACCOUNT_IDS to your .env (see below).' });
  }

  try {
    const metrics = await getAllMetrics();
    res.render('pages/revenue', { pageTitle: 'Revenue', metrics, accounts, error: null });
  } catch (err) {
    const msg = err.type === 'StripeAuthenticationError'
      ? 'Invalid Stripe key — check STRIPE_SECRET_KEY in your .env'
      : err.message;
    res.render('pages/revenue', { pageTitle: 'Revenue', metrics: null, accounts, error: msg });
  }
});

module.exports = router;
