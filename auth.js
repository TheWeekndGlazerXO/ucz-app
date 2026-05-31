'use strict';

const db = require('../db/pool');

/**
 * requireAdmin — Express middleware.
 * Reads the `tc_session` cookie, validates it against admin_sessions table.
 * Returns 401 if missing or expired.
 */
async function requireAdmin(req, res, next) {
  const token = req.cookies && req.cookies.tc_session;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorised — no session' });
  }

  try {
    const { rows } = await db.query(
      `SELECT token FROM admin_sessions
       WHERE token = $1 AND expires_at > now()`,
      [token]
    );

    if (!rows.length) {
      res.clearCookie('tc_session');
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    // Token is valid — extend its lifetime on each use
    await db.query(
      `UPDATE admin_sessions
       SET expires_at = now() + ($1 || ' hours')::INTERVAL
       WHERE token = $2`,
      [process.env.SESSION_HOURS || '8', token]
    );

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAdmin };