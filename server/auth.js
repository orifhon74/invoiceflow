'use strict';
const jwt = require('jsonwebtoken');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret';
const COOKIE = 'if_token';

function signToken(userId) {
  return jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: '30d' });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE);
}

// Express middleware: requires a valid login. Attaches req.user (full row).
function requireAuth(req, res, next) {
  const token =
    req.cookies[COOKIE] ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid session' });
  }
}

module.exports = { signToken, setAuthCookie, clearAuthCookie, requireAuth, COOKIE };
