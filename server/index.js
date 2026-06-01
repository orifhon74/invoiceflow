'use strict';
require('./env').loadEnv();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth').router;
const clientRoutes = require('./routes/clients');
const invoiceRoutes = require('./routes/invoices').router;
const statsRoutes = require('./routes/stats');
const billing = require('./routes/billing');
const publicRoutes = require('./routes/public');

const app = express();

// Stripe webhook needs the raw body, so mount it BEFORE the JSON parser.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), billing.webhookHandler);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Health check for hosting platforms (Render, etc.).
app.get('/healthz', (req, res) => res.json({ ok: true, status: 'healthy' }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/billing', billing.router);

// Public invoice (JSON + standalone HTML page)
app.use('/', publicRoutes);

// Static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA fallback for any non-API GET.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// JSON error handler.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

// Only listen when run directly (tests import the app without binding a port).
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  InvoiceFlow running →  http://localhost:${PORT}\n`);
  });
}

module.exports = app;
