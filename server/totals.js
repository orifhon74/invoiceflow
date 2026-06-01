'use strict';
// Pure functions for computing invoice money values. Kept separate so they can
// be unit-tested and reused by the public view and PDF rendering.

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function computeTotals(invoice, items) {
  const subtotal = round2(
    (items || []).reduce((sum, it) => sum + Number(it.quantity) * Number(it.unit_price), 0)
  );
  const discount = round2(Number(invoice.discount) || 0);
  const taxable = Math.max(0, subtotal - discount);
  const taxAmount = round2(taxable * (Number(invoice.tax_rate) || 0) / 100);
  const total = round2(taxable + taxAmount);
  return { subtotal, discount, taxAmount, total };
}

module.exports = { computeTotals, round2 };
