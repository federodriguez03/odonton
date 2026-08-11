const express = require('express');

const router = express.Router();
const {
  obtenerConfiguracion,
  guardarConfiguracion,
} = require('../controllers/configuracionController');
const {
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
} = require('../middlewares/turnosMiddleware');

router.get(
  '/',
  middlewareAutenticacion,
  autorizarOdontologo,
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
  autorizarOdontologo,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'editar_configuracion_consultorio';
    next();
  },
  guardarConfiguracion,
);

module.exports = router;
