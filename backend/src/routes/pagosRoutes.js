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
const { autorizarFinanzasOperativas, autorizarAnulacionesFinancieras } = require('../middlewares/finanzasAutorizacion');

const router = express.Router();

router.get(
  '/:id/constancia',
  middlewareAutenticacion,
  autorizarFinanzasOperativas,
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
  autorizarFinanzasOperativas,
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
  autorizarFinanzasOperativas,
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
  autorizarAnulacionesFinancieras,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'anular_pago';
    next();
  },
  anularPago,
);

module.exports = router;
