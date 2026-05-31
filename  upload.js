'use strict';

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_ROOT = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'public/uploads');

const DEFAULT_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
];

function allowedMimes() {
  if (process.env.ALLOWED_MIME_TYPES) {
    return process.env.ALLOWED_MIME_TYPES.split(',').map(s => s.trim());
  }
  return DEFAULT_MIME;
}

function makeStorage(subdir) {
  const dest = path.join(UPLOAD_ROOT, subdir);
  fs.mkdirSync(dest, { recursive: true });

  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dest),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '';
      cb(null, `${uuidv4()}${ext}`);
    },
  });
}

function fileFilter(_req, file, cb) {
  if (allowedMimes().includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(Object.assign(new Error(`File type not allowed: ${file.mimetype}`), { status: 400, expose: true }));
  }
}

const maxSize = (parseInt(process.env.MAX_FILE_SIZE_MB || '20', 10)) * 1024 * 1024;

function upload(subdir) {
  return multer({
    storage:    makeStorage(subdir),
    fileFilter,
    limits: { fileSize: maxSize },
  });
}

module.exports = { upload };