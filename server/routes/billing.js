'use strict';
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const billing = require('../billing');

const router = express.Router();

// Tells the frontend whether real payments are configured.
router.get('/config', (req, res) => {
  res.json({ live: billing.isLive() });
});

// Start an upgrade. In live mode returns a Stripe Checkout URL; in mock mode
// upgrades the user immediately and returns a redirect back to the dashboard.
router.post('/checkout', requireAuth, async (req, res) => {
  if (req.user.plan === 'pro') return res.json({ alreadyPro: true });

  if (billing.isLive()) {
    try {
      const url = await billing.createCheckoutSession(req.user);
      return res.json({ url });
    } catch (e) {
      console.error('[billing] checkout error', e.message);
      return res.status(500).json({ error: 'Could not start checkout' });
    }
  }

  // MOCK mode — instant upgrade so the product is fully testable without Stripe.
  db.prepare("UPDATE users SET plan = 'pro' WHERE id = ?").run(req.user.id);
  res.json({ url: '/?upgraded=1', mock: true });
});

// Downgrade (cancel) — works in both modes for local management.
router.post('/cancel', requireAuth, (req, res) => {
  db.prepare("UPDATE users SET plan = 'free' WHERE id = ?").run(req.user.id);
  res.json({ ok: true });
});

// Stripe webhook: marks the user pro after successful subscription.
// Mounted with a raw body parser in index.js so signature verification works.
function webhookHandler(req, res) {
  if (!billing.isLive()) return res.json({ received: true, mock: true });
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  let event;
  try {
    event = secret
      ? billing.stripe.webhooks.constructEvent(req.body, sig, secret)
      : JSON.parse(req.body.toString());
  } catch (e) {
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata && session.metadata.user_id;
    if (userId) {
      db.prepare("UPDATE users SET plan = 'pro', stripe_customer_id = ? WHERE id = ?").run(
        session.customer || '',
        userId
      );
    }
  }
  res.json({ received: true });
}

module.exports = { router, webhookHandler };
