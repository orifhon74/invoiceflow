'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, setAuthCookie, clearAuthCookie, requireAuth } = require('../auth');

const router = express.Router();

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    business_name: u.business_name,
    business_email: u.business_email,
    business_address: u.business_address,
    currency: u.currency,
    plan: u.plan,
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/signup', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Valid email required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'An account with that email already exists' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (email, password_hash, business_name) VALUES (?, ?, ?)')
    .run(email.toLowerCase(), hash, email.split('@')[0]);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);

  const token = signToken(user.id);
  setAuthCookie(res, token);
  res.json({ user: publicUser(user), token });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = signToken(user.id);
  setAuthCookie(res, token);
  res.json({ user: publicUser(user), token });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// Update business profile / settings.
router.put('/me', requireAuth, (req, res) => {
  const { business_name, business_email, business_address, currency } = req.body || {};
  db.prepare(
    `UPDATE users SET business_name = ?, business_email = ?, business_address = ?, currency = ? WHERE id = ?`
  ).run(
    business_name ?? req.user.business_name,
    business_email ?? req.user.business_email,
    business_address ?? req.user.business_address,
    currency ?? req.user.currency,
    req.user.id
  );
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(user) });
});

module.exports = { router, publicUser };
