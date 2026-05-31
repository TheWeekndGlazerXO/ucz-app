'use strict';

const express = require('express');
const db      = require('../db/pool');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/links
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, url, description, sort_order, created_at
       FROM useful_links
       ORDER BY sort_order ASC, created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/links/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM useful_links WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/links  [admin only]
// Body (JSON): { name, url, description?, sort_order? }
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { name, url, description = '', sort_order = 0 } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!url)  return res.status(400).json({ error: 'url is required' });

    // Basic URL validation
    try { new URL(url); } catch {
      return res.status(400).json({ error: 'url must be a valid URL including scheme (https://...)' });
    }

    const { rows } = await db.query(
      `INSERT INTO useful_links (name, url, description, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, url, description, sort_order]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/links/:id  [admin only]
router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { name, url, description, sort_order } = req.body;

    if (url) {
      try { new URL(url); } catch {
        return res.status(400).json({ error: 'url must be a valid URL' });
      }
    }

    const { rows } = await db.query(
      `UPDATE useful_links
       SET name        = COALESCE($1, name),
           url         = COALESCE($2, url),
           description = COALESCE($3, description),
           sort_order  = COALESCE($4, sort_order)
       WHERE id = $5
       RETURNING *`,
      [name || null, url || null, description ?? null, sort_order ?? null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/links/reorder  [admin only]
// Body: { ids: ['uuid1','uuid2', ...] }  — sets sort_order to array index
router.put('/reorder', requireAdmin, async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });

    const client = await require('../db/pool').connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < ids.length; i++) {
        await client.query(
          `UPDATE useful_links SET sort_order = $1 WHERE id = $2`,
          [i, ids[i]]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/links/:id  [admin only]
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `DELETE FROM useful_links WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;