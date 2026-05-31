'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const db      = require('../db/pool');
const { requireAdmin } = require('./auth');
const { upload }       = require('../middleware/upload');

const router = express.Router();

function toPublicPath(filePath) {
  const base = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'public/uploads');
  const rel  = path.relative(base, filePath);
  return `/uploads/${rel.replace(/\\/g, '/')}`;
}

function fileType(mimetype) {
  return mimetype === 'application/pdf' ? 'pdf' : 'image';
}

// GET /api/hymns
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, label, file_path, file_type, original_name, file_size, sort_order, created_at
       FROM hymn_pages
       ORDER BY sort_order ASC, created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/hymns/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM hymn_pages WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/hymns  [admin only]
// Multipart: `file` (image or PDF), body: label, sort_order?
router.post('/', requireAdmin, upload('hymns').single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { label, sort_order = 0 } = req.body;
    if (!label) return res.status(400).json({ error: 'label is required' });

    const webPath = toPublicPath(req.file.path);
    const type    = fileType(req.file.mimetype);

    const { rows } = await db.query(
      `INSERT INTO hymn_pages (label, file_path, file_type, original_name, file_size, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [label, webPath, type, req.file.originalname, req.file.size, sort_order]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(err);
  }
});

// PATCH /api/hymns/:id  [admin only]  — update label / sort_order
router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { label, sort_order } = req.body;
    const { rows } = await db.query(
      `UPDATE hymn_pages
       SET label      = COALESCE($1, label),
           sort_order = COALESCE($2, sort_order)
       WHERE id = $3
       RETURNING *`,
      [label || null, sort_order ?? null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/hymns/reorder  [admin only]
// Body: { ids: ['uuid1', ...] }
router.put('/reorder', requireAdmin, async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < ids.length; i++) {
        await client.query(`UPDATE hymn_pages SET sort_order = $1 WHERE id = $2`, [i, ids[i]]);
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

// DELETE /api/hymns/:id  [admin only]
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `DELETE FROM hymn_pages WHERE id = $1 RETURNING file_path`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    const diskPath = path.join(
      __dirname, '..', 'public',
      rows[0].file_path.replace(/^\/uploads\//, 'uploads/')
    );
    fs.unlink(diskPath, () => {});

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;