'use strict';

const express = require('express');
const crypto  = require('crypto');
const db      = require('../db/pool');
const { requireAdmin } = require('./auth');

const router = express.Router();

// GET /api/admin/status
router.get('/status', async (req, res) => {
  const token = req.cookies && req.cookies.tc_session;
  if (!token) return res.json({ authenticated: false });

  try {
    const { rows } = await db.query(
      `SELECT token FROM admin_sessions WHERE token = $1 AND expires_at > now()`,
      [token]
    );
    res.json({ authenticated: rows.length > 0 });
  } catch {
    res.json({ authenticated: false });
  }
});

// POST /api/admin/login
router.post('/login', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  const correct = process.env.ADMIN_PASSWORD;
  if (!correct || password !== correct) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const hours = process.env.SESSION_HOURS || '8';

  try {
    await db.query(
      `INSERT INTO admin_sessions (token, expires_at)
       VALUES ($1, now() + ($2 || ' hours')::INTERVAL)`,
      [token, hours]
    );

    res.cookie('tc_session', token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   parseInt(hours) * 60 * 60 * 1000,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/admin/logout
router.post('/logout', (req, res) => {
  const token = req.cookies && req.cookies.tc_session;
  if (token) {
    db.query('DELETE FROM admin_sessions WHERE token = $1', [token]).catch(() => {});
  }
  res.clearCookie('tc_session');
  res.json({ ok: true });
});

// DELETE /api/admin/sessions  [admin only] — clear all expired sessions
router.delete('/sessions', requireAdmin, async (req, res, next) => {
  try {
    await db.query('DELETE FROM admin_sessions WHERE expires_at < now()');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;