const express = require('express');

const router = express.Router();
const {
  obtenerConfiguracion,
  guardarConfiguracion,
} = require('../controllers/configuracionController');
const {
  middlewareAutenticacion,
  middlewareAuditoria,
} = require('../middlewares/turnosMiddleware');
const { exigirPermiso } = require('../middleware/authorizationMiddleware');

router.get(
  '/',
  middlewareAutenticacion,
  exigirPermiso('configuracion_admin'),
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'ver_configuracion_consultorio';
    next();
  },
  obtenerConfiguracion,
);

router.put(
  '/',
  middlewareAutenticacion,
  exigirPermiso('configuracion_admin'),
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'editar_configuracion_consultorio';
    next();
  },
  guardarConfiguracion,
);

module.exports = router;
