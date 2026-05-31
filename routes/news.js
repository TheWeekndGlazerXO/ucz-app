'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const db      = require('../db/pool');
const { requireAdmin } = require('./auth');
const { upload }       = require('./upload');

const router = express.Router();

function toPublicPath(filePath) {
  const base = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'public/uploads');
  const rel  = path.relative(base, filePath);
  return `/uploads/${rel.replace(/\\/g, '/')}`;
}

// GET /api/news
// Query params: ?published=true  (default) | false | all
router.get('/', async (req, res, next) => {
  try {
    const filter = req.query.published;
    let whereClause = 'WHERE is_published = TRUE';
    if (filter === 'false')  whereClause = 'WHERE is_published = FALSE';
    if (filter === 'all')    whereClause = '';

    const { rows } = await db.query(
      `SELECT id, title, body, published_on, cover_path, cover_type, is_published, created_at
       FROM news_articles
       ${whereClause}
       ORDER BY published_on DESC, created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/news/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM news_articles WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/news  [admin only]
// Multipart: optional `cover` image; body: title, body, published_on, is_published
router.post('/', requireAdmin, upload('news').single('cover'), async (req, res, next) => {
  try {
    const { title, body, published_on, is_published = 'true' } = req.body;
    if (!title)        return res.status(400).json({ error: 'title is required' });
    if (!body)         return res.status(400).json({ error: 'body is required' });
    if (!published_on) return res.status(400).json({ error: 'published_on is required' });

    const coverPath = req.file ? toPublicPath(req.file.path) : null;
    const coverType = req.file ? 'image' : null;

    const { rows } = await db.query(
      `INSERT INTO news_articles (title, body, published_on, cover_path, cover_type, is_published)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [title, body, published_on, coverPath, coverType, is_published === 'true']
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(err);
  }
});

// PATCH /api/news/:id  [admin only]
// Can also replace cover image — send as multipart with `cover` field.
router.patch('/:id', requireAdmin, upload('news').single('cover'), async (req, res, next) => {
  try {
    const { title, body, published_on, is_published } = req.body;

    // Fetch existing row to get old cover path if we're replacing it
    const existing = await db.query('SELECT cover_path FROM news_articles WHERE id = $1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });

    let coverPath = undefined;
    let coverType = undefined;
    if (req.file) {
      // Remove old cover
      if (existing.rows[0].cover_path) {
        const old = path.join(__dirname, '..', 'public', existing.rows[0].cover_path.replace(/^\/uploads\//, 'uploads/'));
        fs.unlink(old, () => {});
      }
      coverPath = toPublicPath(req.file.path);
      coverType = 'image';
    }

    const { rows } = await db.query(
      `UPDATE news_articles
       SET title        = COALESCE($1, title),
           body         = COALESCE($2, body),
           published_on = COALESCE($3, published_on),
           is_published = COALESCE($4, is_published),
           cover_path   = COALESCE($5, cover_path),
           cover_type   = COALESCE($6, cover_type)
       WHERE id = $7
       RETURNING *`,
      [
        title        || null,
        body         || null,
        published_on || null,
        is_published !== undefined ? is_published === 'true' : null,
        coverPath    || null,
        coverType    || null,
        req.params.id,
      ]
    );

    res.json(rows[0]);
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(err);
  }
});

// DELETE /api/news/:id  [admin only]
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `DELETE FROM news_articles WHERE id = $1 RETURNING cover_path`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    if (rows[0].cover_path) {
      const diskPath = path.join(__dirname, '..', 'public', rows[0].cover_path.replace(/^\/uploads\//, 'uploads/'));
      fs.unlink(diskPath, () => {});
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;