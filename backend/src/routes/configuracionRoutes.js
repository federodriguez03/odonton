const express = require('express');

const router = express.Router();
const {
  obtenerConfiguracion,
  guardarConfiguracion,
  listarReferenciasOdontograma,
  crearReferenciaOdontograma,
  actualizarReferenciaOdontograma,
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

router.get('/odontograma-referencias', middlewareAutenticacion, autorizarOdontologo, listarReferenciasOdontograma);
router.post('/odontograma-referencias', middlewareAutenticacion, autorizarOdontologo, middlewareAuditoria, (req, res, next) => {
  req.auditAction = 'crear_referencia_odontograma';
  next();
}, crearReferenciaOdontograma);
router.put('/odontograma-referencias/:id', middlewareAutenticacion, autorizarOdontologo, middlewareAuditoria, (req, res, next) => {
  req.auditAction = 'editar_referencia_odontograma';
  next();
}, actualizarReferenciaOdontograma);

module.exports = router;
