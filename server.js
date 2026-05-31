'use strict';

require('dotenv').config();

const express      = require('express');
const path         = require('path');
const cookieParser = require('cookie-parser');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const fs           = require('fs');

const db           = require('./db/pool');
const brochureRoutes = require('./routes/brochures');
const newsRoutes     = require('./routes/news');
const linksRoutes    = require('./routes/links');
const hymnsRoutes    = require('./routes/hymns');
const adminRoutes    = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// ── Upload directory ─────────────────────────────────────────
const uploadDir = path.join(__dirname, process.env.UPLOAD_DIR || 'public/uploads');
['brochures','news','hymns'].forEach(sub => {
  fs.mkdirSync(path.join(uploadDir, sub), { recursive: true });
});

// ── Security middleware ──────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   ["'self'", "'unsafe-inline'", "'unsafe-hashes'", "'unsafe-eval'"],
        styleSrc:    ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
        fontSrc:     ["'self'", 'fonts.gstatic.com'],
        imgSrc:      ["'self'", 'data:', 'blob:'],
        objectSrc:   ["'self'"],
        frameSrc:    ["'self'", 'blob:'],
        connectSrc:  ["'self'"],
      },
    },
  }));

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : [];
if (corsOrigins.length) {
  app.use(cors({ origin: corsOrigins, credentials: true }));
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '200', 10),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ── Body / cookie parsing ────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());

// ── Static files ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API routes ───────────────────────────────────────────────
app.use('/api/brochures', brochureRoutes);
app.use('/api/news',      newsRoutes);
app.use('/api/links',     linksRoutes);
app.use('/api/hymns',     hymnsRoutes);
app.use('/api/admin',     adminRoutes);

// ── SPA fallback — serve index.html for all non-API routes ───
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Global error handler ─────────────────────────────────────
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const msg    = err.expose ? err.message : 'Internal server error';
  console.error(`[${new Date().toISOString()}] ${status} ${req.method} ${req.path} —`, err.message);
  res.status(status).json({ error: msg });
});

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, HOST, async () => {
  try {
    await db.query('SELECT 1');
    console.log(`✓ Database connected`);
  } catch (e) {
    console.error('✗ Database connection failed:', e.message);
  }
  console.log(`✓ Trinity Church server running → http://${HOST}:${PORT}`);
});

module.exports = app;