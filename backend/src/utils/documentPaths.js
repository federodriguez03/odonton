const fs = require('fs/promises');
const path = require('path');

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const UPLOADS_ROOT = path.resolve(BACKEND_ROOT, 'uploads');
const configuredUploadsSubdir = process.env.DOCUMENTOS_UPLOAD_SUBDIR || path.join('uploads', 'documentos');
const UPLOADS_BASE_DIR = path.resolve(BACKEND_ROOT, configuredUploadsSubdir);

function isInside(root, target) {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

if (!isInside(UPLOADS_ROOT, UPLOADS_BASE_DIR)) {
  throw new Error('DOCUMENTOS_UPLOAD_SUBDIR debe estar dentro de backend/uploads');
}

async function ensureUploadsBaseDir() {
  await fs.mkdir(UPLOADS_BASE_DIR, { recursive: true });
  const [uploadsReal, configuredReal] = await Promise.all([
    fs.realpath(UPLOADS_ROOT),
    fs.realpath(UPLOADS_BASE_DIR),
  ]);
  if (!isInside(uploadsReal, configuredReal)) {
    throw new Error('La raiz configurada de documentos sale de backend/uploads mediante un enlace simbolico');
  }
  return configuredReal;
}

async function resolveDocumentPath(storedPath, { mustExist = true } = {}) {
  const value = String(storedPath || '').trim();
  if (!value || path.isAbsolute(value)) throw new Error('Ruta de documento invalida');

  const resolved = path.resolve(BACKEND_ROOT, value);
  if (!isInside(UPLOADS_BASE_DIR, resolved)) throw new Error('Ruta de documento fuera de la raiz configurada');

  const configuredReal = await ensureUploadsBaseDir();
  if (!mustExist) return resolved;

  const targetReal = await fs.realpath(resolved);
  if (!isInside(configuredReal, targetReal)) {
    throw new Error('El documento apunta fuera de la raiz configurada mediante un enlace simbolico');
  }
  return targetReal;
}

function toStoredDocumentPath(absolutePath) {
  const resolved = path.resolve(absolutePath);
  if (!isInside(UPLOADS_BASE_DIR, resolved)) throw new Error('Ruta interna de documento invalida');
  return path.relative(BACKEND_ROOT, resolved);
}

module.exports = {
  BACKEND_ROOT,
  UPLOADS_ROOT,
  UPLOADS_BASE_DIR,
  ensureUploadsBaseDir,
  resolveDocumentPath,
  toStoredDocumentPath,
};
