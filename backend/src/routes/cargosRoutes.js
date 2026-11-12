const express = require('express');

const {
  crearCargo,
  listarCargos,
  obtenerCargo,
} = require('../controllers/cargosController');
const {
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
} = require('../middlewares/turnosMiddleware');
const { autorizarFinanzasOperativas } = require('../middlewares/finanzasAutorizacion');

const router = express.Router();

router.post(
  '/',
  middlewareAutenticacion,
  autorizarFinanzasOperativas,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'crear_cargo';
    next();
  },
  crearCargo,
);

router.get(
  '/',
  middlewareAutenticacion,
  autorizarFinanzasOperativas,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'listar_cargos';
    next();
  },
  listarCargos,
);

router.get(
  '/:id',
  middlewareAutenticacion,
  autorizarFinanzasOperativas,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'ver_cargo';
    next();
  },
  obtenerCargo,
);

module.exports = router;
