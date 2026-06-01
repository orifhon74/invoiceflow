'use strict';
const express = require('express');
const db = require('../db');
const { computeTotals } = require('../totals');

const router = express.Router();

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$', INR: '₹', JPY: '¥' };

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(n, cur) {
  const sym = CURRENCY_SYMBOLS[cur] || '';
  return `${sym}${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// JSON endpoint (used by frontend preview).
router.get('/api/public/invoices/:token', (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE public_token = ?').get(req.params.token);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  const items = db.prepare('SELECT * FROM line_items WHERE invoice_id = ? ORDER BY position, id').all(inv.id);
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(inv.client_id);
  const business = db
    .prepare('SELECT business_name, business_email, business_address FROM users WHERE id = ?')
    .get(inv.user_id);
  res.json({ invoice: { ...inv, items, client, business, totals: computeTotals(inv, items) } });
});

// Full standalone printable HTML page (shareable link + "Save as PDF" via print).
router.get('/i/:token', (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE public_token = ?').get(req.params.token);
  if (!inv) return res.status(404).send('<h1 style="font-family:sans-serif">Invoice not found</h1>');
  const items = db.prepare('SELECT * FROM line_items WHERE invoice_id = ? ORDER BY position, id').all(inv.id);
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(inv.client_id);
  const biz = db
    .prepare('SELECT business_name, business_email, business_address FROM users WHERE id = ?')
    .get(inv.user_id);
  const t = computeTotals(inv, items);
  const cur = inv.currency;

  const statusColors = {
    paid: '#16a34a', sent: '#2563eb', overdue: '#dc2626', draft: '#6b7280',
  };

  const rows = items
    .map(
      (it) => `<tr>
        <td>${esc(it.description)}</td>
        <td class="num">${Number(it.quantity)}</td>
        <td class="num">${money(it.unit_price, cur)}</td>
        <td class="num">${money(it.quantity * it.unit_price, cur)}</td>
      </tr>`
    )
    .join('');

  res.send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(inv.number)} · ${esc(biz.business_name || 'Invoice')}</title>
<style>
  :root { --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --brand:#4f46e5; }
  * { box-sizing: border-box; }
  body { margin:0; background:#f1f5f9; color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .sheet { max-width:800px; margin:32px auto; background:#fff; border-radius:16px; box-shadow:0 10px 40px rgba(2,6,23,.08); padding:48px; }
  .top { display:flex; justify-content:space-between; align-items:flex-start; gap:24px; flex-wrap:wrap; }
  h1 { margin:0; font-size:34px; letter-spacing:-.5px; }
  .badge { display:inline-block; padding:5px 12px; border-radius:999px; color:#fff; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; }
  .muted { color:var(--muted); }
  .grid { display:flex; gap:48px; flex-wrap:wrap; margin:28px 0; }
  .grid h3 { font-size:11px; text-transform:uppercase; letter-spacing:.8px; color:var(--muted); margin:0 0 6px; }
  table { width:100%; border-collapse:collapse; margin-top:12px; }
  th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.6px; color:var(--muted); border-bottom:2px solid var(--line); padding:10px 8px; }
  td { padding:12px 8px; border-bottom:1px solid var(--line); font-size:14px; }
  .num { text-align:right; white-space:nowrap; }
  .totals { margin-left:auto; width:280px; margin-top:18px; }
  .totals .row { display:flex; justify-content:space-between; padding:7px 8px; font-size:14px; }
  .totals .grand { border-top:2px solid var(--line); margin-top:6px; padding-top:12px; font-size:20px; font-weight:800; }
  .notes { margin-top:32px; padding-top:18px; border-top:1px solid var(--line); font-size:13px; color:var(--muted); white-space:pre-wrap; }
  .actions { max-width:800px; margin:0 auto 8px; display:flex; justify-content:flex-end; }
  .btn { background:var(--brand); color:#fff; border:0; padding:10px 18px; border-radius:10px; font-weight:600; cursor:pointer; font-size:14px; text-decoration:none; }
  @media print { body { background:#fff; } .sheet { box-shadow:none; margin:0; border-radius:0; } .actions { display:none; } }
</style></head>
<body>
  <div class="actions"><button class="btn" onclick="window.print()">Download / Print PDF</button></div>
  <div class="sheet">
    <div class="top">
      <div>
        <h1>Invoice</h1>
        <div class="muted">${esc(inv.number)}</div>
      </div>
      <div style="text-align:right">
        <span class="badge" style="background:${statusColors[inv.status] || '#6b7280'}">${esc(inv.status)}</span>
        <div style="margin-top:10px;font-weight:700">${esc(biz.business_name || '')}</div>
        <div class="muted" style="font-size:13px">${esc(biz.business_email || '')}</div>
        <div class="muted" style="font-size:13px;white-space:pre-wrap">${esc(biz.business_address || '')}</div>
      </div>
    </div>

    <div class="grid">
      <div>
        <h3>Billed to</h3>
        <div style="font-weight:600">${esc(client ? client.name : '')}</div>
        <div class="muted" style="font-size:13px">${esc(client ? client.company : '')}</div>
        <div class="muted" style="font-size:13px">${esc(client ? client.email : '')}</div>
        <div class="muted" style="font-size:13px;white-space:pre-wrap">${esc(client ? client.address : '')}</div>
      </div>
      <div>
        <h3>Issue date</h3><div>${esc(inv.issue_date)}</div>
      </div>
      <div>
        <h3>Due date</h3><div>${esc(inv.due_date)}</div>
      </div>
    </div>

    <table>
      <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="muted">No line items</td></tr>'}</tbody>
    </table>

    <div class="totals">
      <div class="row"><span class="muted">Subtotal</span><span>${money(t.subtotal, cur)}</span></div>
      ${t.discount ? `<div class="row"><span class="muted">Discount</span><span>-${money(t.discount, cur)}</span></div>` : ''}
      ${inv.tax_rate ? `<div class="row"><span class="muted">Tax (${inv.tax_rate}%)</span><span>${money(t.taxAmount, cur)}</span></div>` : ''}
      <div class="row grand"><span>Total</span><span>${money(t.total, cur)}</span></div>
    </div>

    ${inv.notes ? `<div class="notes">${esc(inv.notes)}</div>` : ''}
  </div>
</body></html>`);
});

module.exports = router;
