const express = require('express');

const {
  anularPago,
  listarPagos,
  obtenerConstanciaPago,
  registrarPago,
} = require('../controllers/pagosController');
const {
  middlewareAutenticacion,
  middlewareAuditoria,
} = require('../middlewares/turnosMiddleware');
const { exigirPermiso } = require('../middleware/authorizationMiddleware');

const router = express.Router();

router.get(
  '/:id/constancia',
  middlewareAutenticacion,
  exigirPermiso('finanzas_consulta'),
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'ver_constancia_pago';
    next();
  },
  obtenerConstanciaPago,
);

router.get(
  '/',
  middlewareAutenticacion,
  exigirPermiso('finanzas_consulta'),
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'listar_pagos';
    next();
  },
  listarPagos,
);

router.post(
  '/',
  middlewareAutenticacion,
  exigirPermiso('pagos_registrar'),
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'crear_pago';
    next();
  },
  registrarPago,
);

router.post(
  '/:id/anular',
  middlewareAutenticacion,
  exigirPermiso('pagos_anular'),
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'anular_pago';
    next();
  },
  anularPago,
);

module.exports = router;
