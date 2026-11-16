const express = require('express');
const fs = require('fs/promises');
const crypto = require('crypto');
const multer = require('multer');

const {
  subirDocumento,
  listarDocumentos,
  descargarDocumento,
  eliminarDocumento,
} = require('../controllers/documentosController');
const { ensureUploadsBaseDir } = require('../utils/documentPaths');
const { validateAndNormalizeUploadedFile } = require('../utils/documentFileValidation');
const { middlewareAutenticacion, middlewareAuditoria } = require('../middlewares/turnosMiddleware');
const { autorizarClinicaPacientes, exigirProfesionalConfirmado } = require('../middlewares/pacientesAutorizacion');

const router = express.Router();

const allowedMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureUploadsBaseDir().then((dir) => cb(null, dir), cb);
  },
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}.upload`);
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
  upload.single('archivo')(req, res, async (err) => {
    if (!err) {
      try {
        await validateAndNormalizeUploadedFile(req.file);
        return next();
      } catch (validationError) {
        if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ mensaje: validationError.message || 'Archivo invalido' });
      }
    }

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ mensaje: 'Archivo demasiado grande. Máximo 10 MB' });
    }

    return res.status(400).json({ mensaje: err.message || 'Error al subir archivo' });
  });
}

router.post(
  '/subir',
  middlewareAutenticacion,
  autorizarClinicaPacientes,
  exigirProfesionalConfirmado,
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
  autorizarClinicaPacientes,
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
  autorizarClinicaPacientes,
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
  autorizarClinicaPacientes,
  exigirProfesionalConfirmado,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'eliminar_documento_paciente';
    next();
  },
  eliminarDocumento
);

module.exports = router;
