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
  middlewareAuditoria,
} = require('../middlewares/turnosMiddleware');
const { exigirPermiso } = require('../middleware/authorizationMiddleware');

router.get(
  '/',
  middlewareAutenticacion,
  exigirPermiso('prestaciones_consulta'),
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
  exigirPermiso('prestaciones_admin'),
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
  exigirPermiso('prestaciones_admin'),
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
  exigirPermiso('prestaciones_admin'),
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
  exigirPermiso('prestaciones_admin'),
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
  exigirPermiso('prestaciones_admin'),
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'desactivar_prestacion';
    next();
  },
  desactivarPrestacion,
);

module.exports = router;
