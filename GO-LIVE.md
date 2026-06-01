# Go Live & Get Paid — InvoiceFlow

This is the practical checklist for turning the app on your machine into a product that collects real money. Three phases: **ship it**, **charge for it**, **get customers**.

---

## Phase 1 — Ship it (≈30 minutes)

You need a public URL so customers can reach the app and open their invoice links.

### Option A — Render.com (easiest, free tier)
1. Push this folder to a new GitHub repo.
2. On [render.com](https://render.com) → **New → Web Service** → connect the repo.
3. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free is fine to start.
4. Add a **Persistent Disk** (1 GB) mounted at `/data`, and set env var `DB_PATH=/data/invoiceflow.db` so your database survives restarts.
5. Add env vars `JWT_SECRET` (a long random string) and `APP_URL` (your Render URL).
6. Deploy. You now have a live URL.

### Option B — Railway / Fly.io / a $5 VPS
Same idea: run `npm install && npm start`, expose the port, and give it a persistent volume for the SQLite file (`DB_PATH`). On a VPS, put it behind Nginx + a free Let's Encrypt certificate and keep it alive with `pm2 start server/index.js`.

### Must-do before real users
- Set a strong, random **`JWT_SECRET`** (e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).
- Set **`APP_URL`** to your real https domain.
- Make sure the SQLite file lives on a **persistent disk**, not the app's ephemeral filesystem.
- Take a periodic backup of the DB file (a nightly copy to cloud storage is enough at this stage).

---

## Phase 2 — Charge for it (Stripe, ≈20 minutes)

The app already contains the full subscription flow. You just plug in keys.

1. Create a [Stripe](https://stripe.com) account.
2. **Products → Add product:** "InvoiceFlow Pro", recurring **$12/month**. Copy the **Price ID** (`price_...`).
3. Get your **Secret key** (`sk_live_...`) from Developers → API keys.
4. Set these env vars on your host:
   ```
   STRIPE_SECRET_KEY=sk_live_xxx
   STRIPE_PRICE_ID=price_xxx
   APP_URL=https://yourdomain.com
   ```
5. **Webhook:** Stripe → Developers → Webhooks → Add endpoint:
   - URL: `https://yourdomain.com/api/billing/webhook`
   - Event: `checkout.session.completed`
   - Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
6. Restart. The "Upgrade now" button now opens real Stripe Checkout, and a successful payment flips the user to **Pro** automatically.

> Until keys are set, the app stays in **mock mode** (instant free upgrade) — great for demos, but it does **not** collect money. Real keys = real revenue.

Pricing levers you can turn (all in code, clearly marked):
- Free invoice cap → `FREE_INVOICE_LIMIT` in `server/routes/invoices.js` (currently 5).
- Monthly price → your Stripe Price (and the displayed `$12` in `public/app.js`).

---

## Phase 3 — Get your first paying customers (the part that actually makes money)

The product is the easy part. Distribution is where the money is. Pick **one** channel and go deep for two weeks.

**Fastest paths to first revenue:**
1. **Sell to people you can already reach.** Freelancers in your network — designers, developers, photographers, consultants, tradespeople, tutors, cleaners. DM 20 of them: *"I built a dead-simple invoicing tool — want a free Pro account to try it?"* Free now, paid later converts well.
2. **Go where freelancers complain about invoicing.** Reddit (r/freelance, r/smallbusiness, r/Entrepreneur), Indie Hackers, freelancer Facebook groups, and X. Don't spam — answer "what do you use for invoices?" threads with a genuine link.
3. **Niche down for a sharper pitch.** "Invoicing for dog groomers" or "invoicing for freelance video editors" converts far better than "invoicing for everyone." Same code, targeted landing copy.
4. **Local businesses.** Walk into or email small service businesses that still use Word/PDF invoices. A 10-minute demo of the shareable pay-link often closes them.

**Make the funnel work:**
- Free plan (5 invoices) is your lead magnet — let them feel the value before the paywall.
- The paywall hits exactly when they're already getting value (6th invoice). That's the right moment to ask for $12.
- Add your logo, a real domain, and a support email to look legitimate.

**Quick wins to add next** (in rough ROI order):
- Email the invoice to the client directly (e.g. via Resend/Postmark) — removes the copy-link step.
- Recurring invoices for retainer clients.
- "Pay now" button on the public invoice (Stripe payment link) so clients pay the invoice itself, not just subscribe.
- A logo upload on invoices (already have the business profile to hang it on).

---

## Reality check

This is a genuine, working product, but money isn't instant — software revenue comes from **distribution and persistence**, not the build. Realistic early trajectory: a handful of free users in week one, your first few paying customers within a few weeks of consistent outreach. At $12/mo, 50 paying customers ≈ $600 MRR; 200 ≈ $2,400 MRR. The build is done — now it's a sales-and-iteration game.
