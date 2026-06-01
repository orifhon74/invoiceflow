'use strict';
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM clients WHERE user_id = ? ORDER BY name COLLATE NOCASE')
    .all(req.user.id);
  res.json({ clients: rows });
});

router.post('/', (req, res) => {
  const { name, email, company, address } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Client name required' });
  const info = db
    .prepare('INSERT INTO clients (user_id, name, email, company, address) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, String(name).trim(), email || '', company || '', address || '');
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ client });
});

router.put('/:id', (req, res) => {
  const client = db
    .prepare('SELECT * FROM clients WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const { name, email, company, address } = req.body || {};
  db.prepare('UPDATE clients SET name = ?, email = ?, company = ?, address = ? WHERE id = ?').run(
    name ?? client.name,
    email ?? client.email,
    company ?? client.company,
    address ?? client.address,
    client.id
  );
  res.json({ client: db.prepare('SELECT * FROM clients WHERE id = ?').get(client.id) });
});

router.delete('/:id', (req, res) => {
  const info = db
    .prepare('DELETE FROM clients WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Client not found' });
  res.json({ ok: true });
});

module.exports = router;
