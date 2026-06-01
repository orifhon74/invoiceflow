'use strict';
const path = require('path');
const fs = require('fs');
// Uses Node's built-in SQLite (node:sqlite) — no native compilation, no
// external dependencies. Available in Node 22.5+ / 23+.
const { DatabaseSync } = require('node:sqlite');

// Store the DB file in a data/ directory next to the project root.
// Allow override via DB_PATH (used by the test suite to get a clean DB).
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, 'invoiceflow.db');
const db = new DatabaseSync(dbPath);
// WAL improves concurrency but isn't supported on some network/overlay mounts.
// Treat it as a best-effort optimization and fall back to the default journal.
try { db.exec('PRAGMA journal_mode = WAL;'); } catch (e) { /* fall back to default */ }
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  business_name TEXT DEFAULT '',
  business_email TEXT DEFAULT '',
  business_address TEXT DEFAULT '',
  currency TEXT DEFAULT 'USD',
  plan TEXT NOT NULL DEFAULT 'free',           -- 'free' | 'pro'
  stripe_customer_id TEXT DEFAULT '',
  business_logo TEXT DEFAULT '',               -- data URL, Pro only
  email_verified INTEGER NOT NULL DEFAULT 1,   -- 0 until verified (only enforced when email is configured)
  verify_token TEXT DEFAULT '',
  reset_token TEXT DEFAULT '',
  reset_expires INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  company TEXT DEFAULT '',
  address TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',         -- draft | sent | paid | overdue
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  notes TEXT DEFAULT '',
  tax_rate REAL NOT NULL DEFAULT 0,             -- percent, e.g. 8.5
  discount REAL NOT NULL DEFAULT 0,             -- flat amount in currency
  currency TEXT NOT NULL DEFAULT 'USD',
  public_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_items_invoice ON line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_token ON invoices(public_token);
`);

// Migrations for databases created before these columns existed (e.g. production).
// node:sqlite throws if the column already exists, so each is best-effort.
const migrations = [
  "ALTER TABLE users ADD COLUMN business_logo TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE users ADD COLUMN verify_token TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN reset_token TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN reset_expires INTEGER NOT NULL DEFAULT 0",
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (e) { /* column already exists */ }
}

module.exports = db;
