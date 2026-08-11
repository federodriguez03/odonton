const express = require('express');
const router = express.Router();

const { listarPagos, crearPago, actualizarPago, resumenPaciente } = require('../controllers/pagosController');
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
    req.auditAction = 'listar_pagos';
    next();
  },
  listarPagos,
);

router.get(
  '/resumen/:pacienteId',
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'resumen_pagos_paciente';
    next();
  },
  resumenPaciente,
);

router.post(
  '/',
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'crear_pago';
    next();
  },
  crearPago,
);

router.put(
  '/:id',
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'actualizar_pago';
    next();
  },
  actualizarPago,
);

module.exports = router;
