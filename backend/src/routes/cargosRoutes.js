const express = require('express');

const {
  crearCargo,
  listarCargos,
  obtenerCargo,
} = require('../controllers/cargosController');
const {
  middlewareAutenticacion,
  middlewareAuditoria,
} = require('../middlewares/turnosMiddleware');
const { exigirPermiso } = require('../middleware/authorizationMiddleware');

const router = express.Router();

router.post(
  '/',
  middlewareAutenticacion,
  exigirPermiso('cargos_crear'),
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
  exigirPermiso('finanzas_consulta'),
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
  exigirPermiso('finanzas_consulta'),
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'ver_cargo';
    next();
  },
  obtenerCargo,
);

module.exports = router;
