const express = require('express');
const router = express.Router();

const {
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
} = require('../middlewares/turnosMiddleware');

const {
  getOdontogramaPaciente,
  postOdontograma,
} = require('../controllers/odontogramaController');
const referencias = require('../controllers/odontogramaReferenciasController');

router.get('/referencias/catalogo', middlewareAutenticacion, autorizarOdontologo, referencias.listar);
router.post('/referencias/catalogo', middlewareAutenticacion, autorizarOdontologo, middlewareAuditoria, referencias.crear);
router.put('/referencias/catalogo/:id', middlewareAutenticacion, autorizarOdontologo, middlewareAuditoria, referencias.actualizar);
router.put('/referencias/catalogo/:id/activa', middlewareAutenticacion, autorizarOdontologo, middlewareAuditoria, referencias.activar);

router.get(
  '/:pacienteId',
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'consultar_odontograma_v2';
    next();
  },
  getOdontogramaPaciente
);

router.post(
  '/',
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'guardar_odontograma_v2';
    next();
  },
  postOdontograma
);

module.exports = router;
