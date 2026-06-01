'use strict';
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { requireAuth, requireVerified } = require('../auth');
const { computeTotals } = require('../totals');
const email = require('../email');

const router = express.Router();

// Free plan limit. Pro is unlimited. This is the core monetization lever.
const FREE_INVOICE_LIMIT = 5;

function loadFull(invoiceId, userId) {
  const inv = userId
    ? db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(invoiceId, userId)
    : db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  if (!inv) return null;
  const items = db
    .prepare('SELECT * FROM line_items WHERE invoice_id = ? ORDER BY position, id')
    .all(inv.id);
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(inv.client_id);
  const totals = computeTotals(inv, items);
  return { ...inv, items, client, totals };
}

function nextNumber(userId) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM invoices WHERE user_id = ?').get(userId).c;
  const year = new Date().getFullYear();
  return `INV-${year}-${String(count + 1).padStart(4, '0')}`;
}

function replaceItems(invoiceId, items) {
  db.prepare('DELETE FROM line_items WHERE invoice_id = ?').run(invoiceId);
  const stmt = db.prepare(
    'INSERT INTO line_items (invoice_id, description, quantity, unit_price, position) VALUES (?, ?, ?, ?, ?)'
  );
  (items || []).forEach((it, i) => {
    stmt.run(
      invoiceId,
      String(it.description || ''),
      Number(it.quantity) || 0,
      Number(it.unit_price) || 0,
      i
    );
  });
}

router.use(requireAuth);

// List (with computed totals for the dashboard table).
router.get('/', (req, res) => {
  const invs = db
    .prepare('SELECT * FROM invoices WHERE user_id = ? ORDER BY date(issue_date) DESC, id DESC')
    .all(req.user.id);
  const result = invs.map((inv) => {
    const items = db.prepare('SELECT * FROM line_items WHERE invoice_id = ?').all(inv.id);
    const client = db.prepare('SELECT name, company FROM clients WHERE id = ?').get(inv.client_id);
    return { ...inv, client, totals: computeTotals(inv, items) };
  });
  res.json({ invoices: result, freeLimit: FREE_INVOICE_LIMIT, plan: req.user.plan });
});

router.get('/:id', (req, res) => {
  const full = loadFull(req.params.id, req.user.id);
  if (!full) return res.status(404).json({ error: 'Invoice not found' });
  res.json({ invoice: full });
});

router.post('/', requireVerified, (req, res) => {
  // Feature gate: free users capped at FREE_INVOICE_LIMIT invoices.
  if (req.user.plan !== 'pro') {
    const count = db.prepare('SELECT COUNT(*) AS c FROM invoices WHERE user_id = ?').get(req.user.id).c;
    if (count >= FREE_INVOICE_LIMIT) {
      return res.status(402).json({
        error: `Free plan is limited to ${FREE_INVOICE_LIMIT} invoices. Upgrade to Pro for unlimited invoices.`,
        upgrade: true,
      });
    }
  }

  const { client_id, issue_date, due_date, notes, tax_rate, discount, status, items } = req.body || {};
  const client = db
    .prepare('SELECT * FROM clients WHERE id = ? AND user_id = ?')
    .get(client_id, req.user.id);
  if (!client) return res.status(400).json({ error: 'Valid client_id required' });

  const today = new Date().toISOString().slice(0, 10);
  const issue = issue_date || today;
  const due = due_date || today;
  const info = db
    .prepare(
      `INSERT INTO invoices (user_id, client_id, number, status, issue_date, due_date, notes, tax_rate, discount, currency, public_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.user.id,
      client.id,
      nextNumber(req.user.id),
      ['draft', 'sent', 'paid', 'overdue'].includes(status) ? status : 'draft',
      issue,
      due,
      notes || '',
      Number(tax_rate) || 0,
      Number(discount) || 0,
      req.user.currency || 'USD',
      crypto.randomUUID().replace(/-/g, '')
    );
  replaceItems(info.lastInsertRowid, items);
  res.status(201).json({ invoice: loadFull(info.lastInsertRowid, req.user.id) });
});

router.put('/:id', (req, res) => {
  const inv = db
    .prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });

  const { client_id, issue_date, due_date, notes, tax_rate, discount, status, items } = req.body || {};
  let clientId = inv.client_id;
  if (client_id && client_id !== inv.client_id) {
    const client = db
      .prepare('SELECT id FROM clients WHERE id = ? AND user_id = ?')
      .get(client_id, req.user.id);
    if (!client) return res.status(400).json({ error: 'Invalid client_id' });
    clientId = client.id;
  }
  db.prepare(
    `UPDATE invoices SET client_id = ?, status = ?, issue_date = ?, due_date = ?, notes = ?, tax_rate = ?, discount = ? WHERE id = ?`
  ).run(
    clientId,
    ['draft', 'sent', 'paid', 'overdue'].includes(status) ? status : inv.status,
    issue_date || inv.issue_date,
    due_date || inv.due_date,
    notes ?? inv.notes,
    tax_rate != null ? Number(tax_rate) : inv.tax_rate,
    discount != null ? Number(discount) : inv.discount,
    inv.id
  );
  if (Array.isArray(items)) replaceItems(inv.id, items);
  res.json({ invoice: loadFull(inv.id, req.user.id) });
});

// Quick status change (e.g. mark paid).
router.patch('/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (!['draft', 'sent', 'paid', 'overdue'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const info = db
    .prepare('UPDATE invoices SET status = ? WHERE id = ? AND user_id = ?')
    .run(status, req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Invoice not found' });
  res.json({ invoice: loadFull(req.params.id, req.user.id) });
});

// Email this invoice to the client and mark it sent.
router.post('/:id/send', requireVerified, async (req, res) => {
  const full = loadFull(req.params.id, req.user.id);
  if (!full) return res.status(404).json({ error: 'Invoice not found' });
  if (!full.client || !full.client.email) {
    return res.status(400).json({ error: 'This client has no email address. Add one on the Clients page first.' });
  }

  const baseUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const shareUrl = `${baseUrl}/i/${full.public_token}`;
  const business = {
    business_name: req.user.business_name,
    business_email: req.user.business_email,
    business_logo: req.user.business_logo,
  };

  const result = await email.sendInvoiceEmail({
    invoice: full,
    client: full.client,
    business,
    totals: full.totals,
    shareUrl,
  });

  // Mark as sent when it was a draft (whether or not email delivery is configured).
  if (full.status === 'draft') {
    db.prepare("UPDATE invoices SET status = 'sent' WHERE id = ?").run(full.id);
  }

  res.json({
    sent: result.sent,
    reason: result.reason || null,
    configured: email.isConfigured(),
    shareUrl,
    invoice: loadFull(full.id, req.user.id),
  });
});

router.delete('/:id', (req, res) => {
  const info = db
    .prepare('DELETE FROM invoices WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Invoice not found' });
  res.json({ ok: true });
});

module.exports = { router, loadFull, FREE_INVOICE_LIMIT };
