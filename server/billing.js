'use strict';
// Billing abstraction. If STRIPE_SECRET_KEY + STRIPE_PRICE_ID are set, we use
// real Stripe Checkout. Otherwise we run in MOCK mode: the upgrade endpoint
// flips the user to 'pro' instantly so the whole product is testable locally.

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const PRICE_ID = process.env.STRIPE_PRICE_ID || '';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

let stripe = null;
let stripeReady = false;
if (STRIPE_KEY && PRICE_ID) {
  try {
    // stripe is an optional dependency; require lazily so the app runs without it.
    const Stripe = require('stripe');
    stripe = new Stripe(STRIPE_KEY);
    stripeReady = true;
  } catch (e) {
    console.warn('[billing] Stripe key present but "stripe" package not installed — falling back to mock mode.');
  }
}

function isLive() {
  return stripeReady;
}

// Returns a checkout URL (real Stripe session in live mode).
async function createCheckoutSession(user) {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: PRICE_ID, quantity: 1 }],
    customer_email: user.email,
    success_url: `${APP_URL}/?upgraded=1`,
    cancel_url: `${APP_URL}/?canceled=1`,
    metadata: { user_id: String(user.id) },
  });
  return session.url;
}

// Schedules a Stripe subscription to cancel at the end of the current paid
// period (the customer keeps access until then, and isn't billed again).
// Returns the unix timestamp when access ends.
async function scheduleCancelAtPeriodEnd(subscriptionId) {
  if (!stripeReady || !subscriptionId) return { scheduled: false, endsAt: 0 };
  const sub = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
  return { scheduled: true, endsAt: sub.cancel_at || sub.current_period_end || 0 };
}

// Undo a scheduled cancellation (subscription keeps renewing).
async function resumeSubscription(subscriptionId) {
  if (!stripeReady || !subscriptionId) return { resumed: false };
  await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false });
  return { resumed: true };
}

module.exports = {
  isLive,
  createCheckoutSession,
  scheduleCancelAtPeriodEnd,
  resumeSubscription,
  stripe,
  PRICE_ID,
  APP_URL,
};
