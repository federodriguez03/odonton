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
