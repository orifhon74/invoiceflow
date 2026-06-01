'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

// Use an isolated temp DB on local disk so tests never touch real data
// (and avoid mount filesystems that don't support all SQLite features).
const tmpDb = path.join(os.tmpdir(), `invoiceflow-test-${process.pid}.db`);
for (const ext of ['', '-wal', '-shm', '-journal']) {
  try { fs.unlinkSync(tmpDb + ext); } catch (e) {}
}
process.env.DB_PATH = tmpDb;
process.env.JWT_SECRET = 'test-secret';
process.env.STRIPE_SECRET_KEY = '';
process.env.STRIPE_PRICE_ID = '';

const app = require('../server/index');

let server, base, cookie = '';

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); });
  });
});
test.after(() => { server.close(); });

async function call(method, urlPath, body, useCookie = true) {
  const data = body !== undefined ? JSON.stringify(body) : null;
  const headers = {};
  if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
  if (useCookie && cookie) headers['Cookie'] = cookie;
  return new Promise((resolve, reject) => {
    const req = http.request(base + urlPath, { method, headers }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        if (res.headers['set-cookie']) cookie = res.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
        let json = null; try { json = JSON.parse(raw); } catch (e) {}
        resolve({ status: res.statusCode, body: json, raw });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const email = `user${Date.now()}@test.com`;
let clientId, invoiceId, publicToken;

test('signup creates an account and sets cookie', async () => {
  const r = await call('POST', '/api/auth/signup', { email, password: 'secret123' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.user.email, email);
  assert.strictEqual(r.body.user.plan, 'free');
  // Email isn't configured in tests, so signups are auto-verified.
  assert.strictEqual(r.body.needsVerification, false);
  assert.strictEqual(r.body.user.email_verified, 1);
  assert.ok(cookie.includes('if_token'), 'auth cookie set');
});

test('duplicate signup is rejected', async () => {
  const r = await call('POST', '/api/auth/signup', { email, password: 'secret123' });
  assert.strictEqual(r.status, 409);
});

test('weak password rejected', async () => {
  const r = await call('POST', '/api/auth/signup', { email: 'x@y.com', password: '123' });
  assert.strictEqual(r.status, 400);
});

test('me returns current user', async () => {
  const r = await call('GET', '/api/auth/me');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.user.email, email);
});

test('unauthenticated request is blocked', async () => {
  const r = await call('GET', '/api/clients', undefined, false);
  assert.strictEqual(r.status, 401);
});

test('update business profile', async () => {
  const r = await call('PUT', '/api/auth/me', { business_name: 'Acme Co', currency: 'EUR' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.user.business_name, 'Acme Co');
  assert.strictEqual(r.body.user.currency, 'EUR');
});

test('create client', async () => {
  const r = await call('POST', '/api/clients', { name: 'Jane Doe', email: 'jane@co.com', company: 'Doe LLC' });
  assert.strictEqual(r.status, 201);
  clientId = r.body.client.id;
  assert.ok(clientId);
});

test('client without name rejected', async () => {
  const r = await call('POST', '/api/clients', { email: 'no@name.com' });
  assert.strictEqual(r.status, 400);
});

test('free plan client limit enforced (4th client blocked)', async () => {
  // we already have 1 client (Jane); add 2 more to reach the limit of 3
  for (let i = 0; i < 2; i++) {
    const r = await call('POST', '/api/clients', { name: 'Extra Client ' + i });
    assert.strictEqual(r.status, 201, `client ${i + 2} should be created`);
  }
  const blocked = await call('POST', '/api/clients', { name: 'One Too Many' });
  assert.strictEqual(blocked.status, 402);
  assert.strictEqual(blocked.body.upgrade, true);
});

test('free plan cannot set a business logo', async () => {
  const r = await call('PUT', '/api/auth/me', { business_logo: 'data:image/png;base64,iVBORw0KGgo=' });
  assert.strictEqual(r.status, 402);
  assert.strictEqual(r.body.upgrade, true);
});

test('create invoice with line items and correct totals', async () => {
  const r = await call('POST', '/api/invoices', {
    client_id: clientId,
    issue_date: '2026-01-01',
    due_date: '2026-01-15',
    tax_rate: 10,
    discount: 20,
    status: 'sent',
    items: [
      { description: 'Design work', quantity: 10, unit_price: 100 },   // 1000
      { description: 'Hosting', quantity: 2, unit_price: 50 },         // 100
    ],
  });
  assert.strictEqual(r.status, 201);
  invoiceId = r.body.invoice.id;
  publicToken = r.body.invoice.public_token;
  const t = r.body.invoice.totals;
  // subtotal 1100, discount 20 -> taxable 1080, tax 10% = 108, total 1188
  assert.strictEqual(t.subtotal, 1100);
  assert.strictEqual(t.discount, 20);
  assert.strictEqual(t.taxAmount, 108);
  assert.strictEqual(t.total, 1188);
  assert.match(r.body.invoice.number, /^INV-\d{4}-0001$/);
});

test('invoice inherits user currency (EUR)', async () => {
  const r = await call('GET', '/api/invoices/' + invoiceId);
  assert.strictEqual(r.body.invoice.currency, 'EUR');
});

test('invalid client_id rejected on invoice create', async () => {
  const r = await call('POST', '/api/invoices', { client_id: 999999, items: [] });
  assert.strictEqual(r.status, 400);
});

test('list invoices', async () => {
  const r = await call('GET', '/api/invoices');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.invoices.length, 1);
});

test('update invoice status to paid', async () => {
  const r = await call('PATCH', `/api/invoices/${invoiceId}/status`, { status: 'paid' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.invoice.status, 'paid');
});

test('invalid status rejected', async () => {
  const r = await call('PATCH', `/api/invoices/${invoiceId}/status`, { status: 'banana' });
  assert.strictEqual(r.status, 400);
});

test('stats reflect paid revenue', async () => {
  const r = await call('GET', '/api/stats');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.stats.paid, 1188);
  assert.strictEqual(r.body.stats.outstanding, 0);
  assert.strictEqual(r.body.stats.clientCount, 3); // Jane + 2 from the client-limit test
  assert.strictEqual(r.body.stats.series.length, 6);
});

test('public invoice JSON accessible without auth', async () => {
  const r = await call('GET', '/api/public/invoices/' + publicToken, undefined, false);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.invoice.totals.total, 1188);
  assert.strictEqual(r.body.invoice.business.business_name, 'Acme Co');
});

test('public invoice HTML page renders', async () => {
  const r = await call('GET', '/i/' + publicToken, undefined, false);
  assert.strictEqual(r.status, 200);
  assert.match(r.raw, /Invoice/);
  assert.match(r.raw, /INV-/);
});

test('free plan invoice limit enforced (6th invoice blocked)', async () => {
  // We already have 1 invoice; create 4 more to reach the limit of 5.
  for (let i = 0; i < 4; i++) {
    const r = await call('POST', '/api/invoices', { client_id: clientId, items: [{ description: 'x', quantity: 1, unit_price: 1 }] });
    assert.strictEqual(r.status, 201, `invoice ${i + 2} should be created`);
  }
  // 6th should be blocked with 402 + upgrade flag.
  const blocked = await call('POST', '/api/invoices', { client_id: clientId, items: [{ description: 'x', quantity: 1, unit_price: 1 }] });
  assert.strictEqual(blocked.status, 402);
  assert.strictEqual(blocked.body.upgrade, true);
});

test('mock checkout upgrades user to pro and lifts the limit', async () => {
  const up = await call('POST', '/api/billing/checkout');
  assert.strictEqual(up.status, 200);
  assert.ok(up.body.mock, 'mock mode');
  const me = await call('GET', '/api/auth/me');
  assert.strictEqual(me.body.user.plan, 'pro');
  // now a 6th+ invoice succeeds
  const r = await call('POST', '/api/invoices', { client_id: clientId, items: [{ description: 'pro', quantity: 1, unit_price: 1 }] });
  assert.strictEqual(r.status, 201);
});

test('pro can set a business logo, invalid format rejected', async () => {
  const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const ok = await call('PUT', '/api/auth/me', { business_logo: logo });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.user.business_logo, logo);
  const bad = await call('PUT', '/api/auth/me', { business_logo: 'not-an-image' });
  assert.strictEqual(bad.status, 400);
});

test('pro can add a 4th+ client (limit lifted)', async () => {
  const r = await call('POST', '/api/clients', { name: 'Pro Client' });
  assert.strictEqual(r.status, 201);
});

test('cancel downgrades to free (and clears subscription id)', async () => {
  const c = await call('POST', '/api/billing/cancel');
  assert.strictEqual(c.status, 200);
  const me = await call('GET', '/api/auth/me');
  assert.strictEqual(me.body.user.plan, 'free');
  // re-upgrade for any later expectations
  await call('POST', '/api/billing/checkout');
});

test('delete invoice', async () => {
  const r = await call('DELETE', '/api/invoices/' + invoiceId);
  assert.strictEqual(r.status, 200);
  const check = await call('GET', '/api/invoices/' + invoiceId);
  assert.strictEqual(check.status, 404);
});

test('send invoice: builds email + marks draft as sent (mock/unconfigured)', async () => {
  // fresh client WITH email + a draft invoice
  const c = await call('POST', '/api/clients', { name: 'Email Client', email: 'pay@client.com' });
  const cid = c.body.client.id;
  const inv = await call('POST', '/api/invoices', { client_id: cid, status: 'draft', items: [{ description: 'Job', quantity: 1, unit_price: 200 }] });
  const id = inv.body.invoice.id;
  assert.strictEqual(inv.body.invoice.status, 'draft');

  const r = await call('POST', `/api/invoices/${id}/send`);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.configured, false);      // no RESEND_API_KEY in tests
  assert.strictEqual(r.body.sent, false);
  assert.strictEqual(r.body.reason, 'not_configured');
  assert.match(r.body.shareUrl, /\/i\/[a-f0-9]+$/);
  assert.strictEqual(r.body.invoice.status, 'sent');  // draft auto-advanced to sent
});

test('send invoice: client without email is rejected', async () => {
  const c = await call('POST', '/api/clients', { name: 'No Email Client' });
  const cid = c.body.client.id;
  const inv = await call('POST', '/api/invoices', { client_id: cid, items: [{ description: 'x', quantity: 1, unit_price: 5 }] });
  const r = await call('POST', `/api/invoices/${inv.body.invoice.id}/send`);
  assert.strictEqual(r.status, 400);
});

test('email template builder produces subject + html', () => {
  const { buildInvoiceEmail } = require('../server/email');
  const out = buildInvoiceEmail({
    invoice: { number: 'INV-2026-0009', currency: 'USD', due_date: '2026-02-01', notes: '' },
    client: { name: 'Pat' },
    business: { business_name: 'Acme Co' },
    totals: { total: 488.25 },
    shareUrl: 'https://x.test/i/abc',
  });
  assert.match(out.subject, /INV-2026-0009/);
  assert.match(out.subject, /\$488\.25/);
  assert.match(out.html, /https:\/\/x\.test\/i\/abc/);
  assert.match(out.html, /Acme Co/);
});

test('healthz responds', async () => {
  const r = await call('GET', '/healthz', undefined, false);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.ok, true);
});

test('login with correct and wrong password', async () => {
  cookie = '';
  const ok = await call('POST', '/api/auth/login', { email, password: 'secret123' });
  assert.strictEqual(ok.status, 200);
  const bad = await call('POST', '/api/auth/login', { email, password: 'wrong' });
  assert.strictEqual(bad.status, 401);
});

test('password reset: forgot is always ok; reset with valid token works', async () => {
  // forgot-password never reveals whether the account exists
  const unknown = await call('POST', '/api/auth/forgot-password', { email: 'nobody@nowhere.com' });
  assert.strictEqual(unknown.status, 200);
  const known = await call('POST', '/api/auth/forgot-password', { email });
  assert.strictEqual(known.status, 200);

  // email isn't configured in tests, so set a token directly to exercise the reset endpoint
  const db = require('../server/db');
  const token = 'testresettoken1234567890abcdef';
  db.prepare('UPDATE users SET reset_token = ?, reset_expires = ? WHERE email = ?')
    .run(token, Date.now() + 3600000, email);

  // wrong token and short password are rejected
  assert.strictEqual((await call('POST', '/api/auth/reset-password', { token: 'wrong', password: 'newpass123' })).status, 400);
  assert.strictEqual((await call('POST', '/api/auth/reset-password', { token, password: '123' })).status, 400);

  // valid token + good password succeeds
  const ok = await call('POST', '/api/auth/reset-password', { token, password: 'newpass123' });
  assert.strictEqual(ok.status, 200);

  // old password no longer works; new one does
  cookie = '';
  assert.strictEqual((await call('POST', '/api/auth/login', { email, password: 'secret123' })).status, 401);
  assert.strictEqual((await call('POST', '/api/auth/login', { email, password: 'newpass123' })).status, 200);

  // token can't be reused
  assert.strictEqual((await call('POST', '/api/auth/reset-password', { token, password: 'another123' })).status, 400);
});

test('cleanup', () => {
  for (const ext of ['', '-wal', '-shm', '-journal']) {
    try { fs.unlinkSync(tmpDb + ext); } catch (e) {}
  }
});
