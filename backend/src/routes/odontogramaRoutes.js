const express = require('express');
const router = express.Router();

const {
  middlewareAutenticacion,
  middlewareAuditoria,
} = require('../middlewares/turnosMiddleware');
const {
  autorizarEscrituraClinica,
  autorizarLecturaClinica,
  exigirTodosLosRoles,
} = require('../middleware/authorizationMiddleware');

const {
  getOdontogramaPaciente,
  postOdontograma,
} = require('../controllers/odontogramaController');
const referencias = require('../controllers/odontogramaReferenciasController');

router.get('/referencias/catalogo', middlewareAutenticacion, autorizarLecturaClinica, referencias.listar);
router.post('/referencias/catalogo', middlewareAutenticacion, exigirTodosLosRoles('administrador', 'odontologo'), middlewareAuditoria, referencias.crear);
router.put('/referencias/catalogo/:id', middlewareAutenticacion, exigirTodosLosRoles('administrador', 'odontologo'), middlewareAuditoria, referencias.actualizar);
router.put('/referencias/catalogo/:id/activa', middlewareAutenticacion, exigirTodosLosRoles('administrador', 'odontologo'), middlewareAuditoria, referencias.activar);

router.get(
  '/:pacienteId',
  middlewareAutenticacion,
  autorizarLecturaClinica,
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
  autorizarEscrituraClinica,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'guardar_odontograma_v2';
    next();
  },
  postOdontograma
);

module.exports = router;
