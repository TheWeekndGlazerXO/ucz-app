'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const db      = require('../db/pool');
const { requireAdmin } = require('./auth');
const { upload }       = require('./upload');

const router = express.Router();

function fileType(mimetype) {
  return mimetype === 'application/pdf' ? 'pdf' : 'image';
}

function toPublicPath(filePath) {
  // Convert absolute disk path to a web-relative path under /uploads/
  const base = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'public/uploads');
  const rel  = path.relative(base, filePath);
  return `/uploads/${rel.replace(/\\/g, '/')}`;
}

// GET /api/brochures
// Returns all brochures ordered by service_date ascending.
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, title, service_date, file_path, file_type, original_name, file_size, created_at
       FROM brochures
       ORDER BY service_date ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/brochures/next
// Returns the single brochure whose service_date >= today (or the most recent).
router.get('/next', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, title, service_date, file_path, file_type, original_name
       FROM brochures
       WHERE service_date >= CURRENT_DATE
       ORDER BY service_date ASC
       LIMIT 1`
    );

    if (rows.length) return res.json(rows[0]);

    // Fall back to the most recent past brochure
    const fallback = await db.query(
      `SELECT id, title, service_date, file_path, file_type, original_name
       FROM brochures
       ORDER BY service_date DESC
       LIMIT 1`
    );
    res.json(fallback.rows[0] || null);
  } catch (err) {
    next(err);
  }
});

// GET /api/brochures/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM brochures WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/brochures   [admin only]
// Multipart: field `file` (PDF or image), body fields: title, service_date
router.post('/', requireAdmin, upload('brochures').single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { title = '', service_date } = req.body;
    if (!service_date) return res.status(400).json({ error: 'service_date is required' });

    const webPath = toPublicPath(req.file.path);
    const type    = fileType(req.file.mimetype);

    const { rows } = await db.query(
      `INSERT INTO brochures (title, service_date, file_path, file_type, original_name, file_size)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [title, service_date, webPath, type, req.file.originalname, req.file.size]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    // Clean up uploaded file on DB error
    if (req.file) fs.unlink(req.file.path, () => {});
    next(err);
  }
});

// PATCH /api/brochures/:id  [admin only]  — update title / date only
router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { title, service_date } = req.body;
    const { rows } = await db.query(
      `UPDATE brochures
       SET title        = COALESCE($1, title),
           service_date = COALESCE($2, service_date)
       WHERE id = $3
       RETURNING *`,
      [title || null, service_date || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/brochures/:id  [admin only]
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `DELETE FROM brochures WHERE id = $1 RETURNING file_path`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    // Remove file from disk
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