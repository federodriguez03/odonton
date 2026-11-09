const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const {
  subirDocumento,
  listarDocumentos,
  descargarDocumento,
  eliminarDocumento,
  asociarDocumento,
  UPLOADS_BASE_DIR,
} = require('../controllers/documentosController');
const { middlewareAutenticacion, middlewareAuditoria } = require('../middlewares/turnosMiddleware');

const router = express.Router();

const allowedMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);

function ensureUploadDir() {
  if (!fs.existsSync(UPLOADS_BASE_DIR)) {
    fs.mkdirSync(UPLOADS_BASE_DIR, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureUploadDir();
    cb(null, UPLOADS_BASE_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeName = `${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error('Tipo de archivo no permitido. Solo PDF, JPG o PNG'));
    }
    return cb(null, true);
  },
});

function manejarSubida(req, res, next) {
  upload.single('archivo')(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ mensaje: 'Archivo demasiado grande. Máximo 10 MB' });
    }

    return res.status(400).json({ mensaje: err.message || 'Error al subir archivo' });
  });
}

router.post(
  '/subir',
  middlewareAutenticacion,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'subir_documento_paciente';
    next();
  },
  manejarSubida,
  subirDocumento
);

router.get(
  '/',
  middlewareAutenticacion,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'listar_documentos_paciente';
    next();
  },
  listarDocumentos
);

router.get(
  '/descargar/:id',
  middlewareAutenticacion,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'descargar_documento_paciente';
    next();
  },
  descargarDocumento
);

router.delete(
  '/:id',
  middlewareAutenticacion,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'eliminar_documento_paciente';
    next();
  },
  eliminarDocumento
);

router.put(
  '/:id/asociar',
  middlewareAutenticacion,
  middlewareAuditoria,
  (req, res, next) => { req.auditAction = 'asociar_documento_consulta'; next(); },
  asociarDocumento
);

module.exports = router;
