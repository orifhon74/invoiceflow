# InvoiceFlow

A complete, ready-to-sell invoicing SaaS for freelancers and small businesses. Create professional invoices, share them with a single public link (printable to PDF), track who's paid vs. overdue, and charge a monthly Pro subscription.

Built to run with **zero native dependencies** and **no build step** — it starts with a single command.

---

## Features

- **Accounts** — email/password signup & login (bcrypt-hashed, JWT cookie sessions)
- **Clients** — full address book, unlimited on every plan
- **Invoices** — line items, quantity × unit price, tax %, flat discounts, auto-numbering (`INV-2026-0001`), draft/sent/paid/overdue statuses
- **Shareable links** — every invoice has a clean public URL (`/i/<token>`) your client can open and "Save as PDF" via the browser
- **Dashboard** — paid / outstanding / overdue totals plus a 6-month revenue chart
- **Settings** — business profile (name, email, address, currency) printed on every invoice
- **Monetization** — Free plan capped at 5 invoices; **Pro** ($12/mo) unlocks unlimited. Stripe Checkout is wired in, with a built-in mock mode so everything works before you add keys.

## Tech

- **Backend:** Node.js + Express
- **Database:** SQLite via Node's built-in `node:sqlite` (no compilation, no external DB)
- **Frontend:** vanilla JS single-page app + Tailwind (CDN) + Chart.js (CDN)
- **Auth:** `jsonwebtoken` + `bcryptjs`
- **Payments:** Stripe (optional)

## Requirements

- **Node.js 22.5 or newer** (uses the built-in SQLite module). Check with `node -v`.

## Run it

```bash
cd InvoiceFlow
npm install        # installs express, bcryptjs, jsonwebtoken, cookie-parser
npm start
```

Then open **http://localhost:3000**, click **Start free**, and create your first invoice.

> Runs in **mock billing mode** out of the box: the "Upgrade to Pro" button works instantly and for free, so you can test the entire product. To take real money, see `GO-LIVE.md`.

## Run the tests

```bash
npm test
```

22 integration tests cover auth, clients, invoice math, stats, the public invoice page, the free-plan limit, and the upgrade flow.

## Project layout

```
server/
  index.js            Express app + routes wiring
  db.js               SQLite schema & connection
  auth.js             JWT helpers + requireAuth middleware
  billing.js          Stripe-or-mock billing abstraction
  totals.js           Invoice math (subtotal/discount/tax/total)
  routes/             auth, clients, invoices, stats, billing, public
public/
  index.html          App shell (Tailwind + Chart.js)
  app.js              Entire single-page frontend
test/
  api.test.js         Integration test suite
```

## Configuration

Copy `.env.example` to `.env` to override defaults:

| Variable | Purpose |
|---|---|
| `PORT` | Server port (default 3000) |
| `JWT_SECRET` | Secret for signing login tokens — **set a long random value in production** |
| `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` | Enable real payments (leave blank for mock mode) |
| `STRIPE_WEBHOOK_SECRET` | Verify Stripe webhook signatures |
| `APP_URL` | Public URL used for Stripe redirects |

See **`GO-LIVE.md`** for deployment, Stripe setup, and a plan for getting your first paying customers.
