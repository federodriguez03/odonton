const express = require('express');
const router = express.Router();

const {
  middlewareAutenticacion,
  middlewareAuditoria,
} = require('../middlewares/turnosMiddleware');
const { autorizarClinicaPacientes, exigirProfesionalConfirmado } = require('../middlewares/pacientesAutorizacion');

const {
  getOdontogramaPaciente,
  postOdontograma,
  getReferencias,
} = require('../controllers/odontogramaController');

router.get('/referencias', middlewareAutenticacion, autorizarClinicaPacientes, getReferencias);

router.get(
  '/:pacienteId',
  middlewareAutenticacion,
  autorizarClinicaPacientes,
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
  autorizarClinicaPacientes,
  exigirProfesionalConfirmado,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'guardar_odontograma_v2';
    next();
  },
  postOdontograma
);

module.exports = router;
