'use strict';
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, setAuthCookie, clearAuthCookie, requireAuth } = require('../auth');
const email = require('../email');

const router = express.Router();

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    business_name: u.business_name,
    business_email: u.business_email,
    business_address: u.business_address,
    business_logo: u.business_logo || '',
    currency: u.currency,
    plan: u.plan,
    email_verified: u.email_verified,
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function appBaseUrl(req) {
  return (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

router.post('/signup', async (req, res) => {
  const { email: rawEmail, password } = req.body || {};
  if (!rawEmail || !EMAIL_RE.test(rawEmail)) return res.status(400).json({ error: 'Valid email required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const addr = rawEmail.toLowerCase();
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(addr);
  if (exists) return res.status(409).json({ error: 'An account with that email already exists' });

  const hash = bcrypt.hashSync(password, 10);
  // Only gate on verification when we can actually send the email. Otherwise
  // auto-verify so the app stays usable until Resend is configured.
  const mustVerify = email.isConfigured();
  const token = crypto.randomUUID().replace(/-/g, '');
  const info = db
    .prepare(
      'INSERT INTO users (email, password_hash, business_name, email_verified, verify_token) VALUES (?, ?, ?, ?, ?)'
    )
    .run(addr, hash, addr.split('@')[0], mustVerify ? 0 : 1, mustVerify ? token : '');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);

  if (mustVerify) {
    const verifyUrl = `${appBaseUrl(req)}/api/auth/verify?token=${token}`;
    await email.sendVerificationEmail({ email: addr, verifyUrl });
  }

  const jwtToken = signToken(user.id);
  setAuthCookie(res, jwtToken);
  res.json({ user: publicUser(user), token: jwtToken, needsVerification: mustVerify });
});

router.post('/login', (req, res) => {
  const { email: rawEmail, password } = req.body || {};
  if (!rawEmail || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(rawEmail).toLowerCase());
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

// Verify an email via the link sent on signup. Redirects to the app.
router.get('/verify', (req, res) => {
  const { token } = req.query || {};
  if (token) {
    const user = db.prepare('SELECT id FROM users WHERE verify_token = ? AND verify_token != ?').get(token, '');
    if (user) {
      db.prepare("UPDATE users SET email_verified = 1, verify_token = '' WHERE id = ?").run(user.id);
      return res.redirect('/?verified=1');
    }
  }
  res.redirect('/?verified=0');
});

// Resend the verification email.
router.post('/resend-verification', requireAuth, async (req, res) => {
  if (req.user.email_verified === 1) return res.json({ ok: true, already: true });
  if (!email.isConfigured()) {
    // No email provider configured — auto-verify so the user isn't stuck.
    db.prepare("UPDATE users SET email_verified = 1, verify_token = '' WHERE id = ?").run(req.user.id);
    return res.json({ ok: true, autoVerified: true });
  }
  let token = req.user.verify_token;
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, '');
    db.prepare('UPDATE users SET verify_token = ? WHERE id = ?').run(token, req.user.id);
  }
  const verifyUrl = `${appBaseUrl(req)}/api/auth/verify?token=${token}`;
  const result = await email.sendVerificationEmail({ email: req.user.email, verifyUrl });
  res.json({ ok: true, sent: result.sent });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// Update business profile / settings. Logo is a Pro-only feature.
router.put('/me', requireAuth, (req, res) => {
  const { business_name, business_email, business_address, currency, business_logo } = req.body || {};

  let logo = req.user.business_logo;
  if (business_logo !== undefined) {
    if (req.user.plan !== 'pro') {
      return res.status(402).json({ error: 'Custom logo is a Pro feature. Upgrade to add your logo.', upgrade: true });
    }
    // Basic guard: only accept image data URLs, capped in size.
    if (business_logo && !/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/.test(business_logo)) {
      return res.status(400).json({ error: 'Logo must be a PNG, JPG, GIF, WEBP, or SVG image.' });
    }
    if (business_logo && business_logo.length > 700000) {
      return res.status(400).json({ error: 'Logo image is too large (max ~500KB). Please upload a smaller file.' });
    }
    logo = business_logo;
  }

  db.prepare(
    `UPDATE users SET business_name = ?, business_email = ?, business_address = ?, currency = ?, business_logo = ? WHERE id = ?`
  ).run(
    business_name ?? req.user.business_name,
    business_email ?? req.user.business_email,
    business_address ?? req.user.business_address,
    currency ?? req.user.currency,
    logo,
    req.user.id
  );
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(user) });
});

module.exports = { router, publicUser };
