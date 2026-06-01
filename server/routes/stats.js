'use strict';
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { computeTotals } = require('../totals');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const invoices = db.prepare('SELECT * FROM invoices WHERE user_id = ?').all(req.user.id);
  const today = new Date().toISOString().slice(0, 10);

  let paid = 0, outstanding = 0, overdue = 0, draftCount = 0;
  const monthly = {}; // 'YYYY-MM' -> paid revenue

  for (const inv of invoices) {
    const items = db.prepare('SELECT * FROM line_items WHERE invoice_id = ?').all(inv.id);
    const { total } = computeTotals(inv, items);

    if (inv.status === 'paid') {
      paid += total;
      const ym = inv.issue_date.slice(0, 7);
      monthly[ym] = (monthly[ym] || 0) + total;
    } else if (inv.status === 'draft') {
      draftCount += 1;
    } else {
      // sent or overdue -> outstanding
      outstanding += total;
      const isOverdue = inv.status === 'overdue' || (inv.status === 'sent' && inv.due_date < today);
      if (isOverdue) overdue += total;
    }
  }

  // Build last 6 months series for the chart.
  const series = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = d.toISOString().slice(0, 7);
    series.push({ month: ym, revenue: Math.round((monthly[ym] || 0) * 100) / 100 });
  }

  res.json({
    stats: {
      paid: Math.round(paid * 100) / 100,
      outstanding: Math.round(outstanding * 100) / 100,
      overdue: Math.round(overdue * 100) / 100,
      invoiceCount: invoices.length,
      clientCount: db.prepare('SELECT COUNT(*) AS c FROM clients WHERE user_id = ?').get(req.user.id).c,
      draftCount,
      series,
      currency: req.user.currency || 'USD',
      plan: req.user.plan,
    },
  });
});

module.exports = router;
