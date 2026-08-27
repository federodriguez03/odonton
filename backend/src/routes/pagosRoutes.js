const express = require('express');

const {
  anularPago,
  listarPagos,
  registrarPago,
} = require('../controllers/pagosController');
const {
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
} = require('../middlewares/turnosMiddleware');

const router = express.Router();

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

router.post(
  '/',
  middlewareAutenticacion,
  autorizarOdontologo,
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
  autorizarOdontologo,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'anular_pago';
    next();
  },
  anularPago,
);

module.exports = router;
