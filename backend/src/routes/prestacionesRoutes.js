const express = require('express');
const router = express.Router();

const {
  listarPrestaciones,
  crearPrestacion,
  actualizarPrestacion,
  activarPrestacion,
  desactivarPrestacion,
  normalizarPrestaciones,
} = require('../controllers/prestacionesController');
const {
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
} = require('../middlewares/turnosMiddleware');
const { autorizarAgenda } = require('../middleware/authorizationMiddleware');

router.get(
  '/',
  middlewareAutenticacion,
  autorizarAgenda,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'ver_listado_prestaciones';
    next();
  },
  listarPrestaciones,
);

router.post(
  '/',
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'crear_prestacion';
    next();
  },
  crearPrestacion,
);

router.put(
  '/normalizar-datos',
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'normalizar_prestaciones';
    next();
  },
  normalizarPrestaciones,
);

router.put(
  '/:id',
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'editar_prestacion';
    next();
  },
  actualizarPrestacion,
);

router.put(
  '/:id/activar',
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'activar_prestacion';
    next();
  },
  activarPrestacion,
);

router.put(
  '/:id/desactivar',
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'desactivar_prestacion';
    next();
  },
  desactivarPrestacion,
);

module.exports = router;
