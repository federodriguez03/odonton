const express = require('express');
const router = express.Router();

const { obtenerEstadisticas } = require('../controllers/estadisticasController');
const {
  middlewareAutenticacion,
  middlewareAuditoria,
} = require('../middlewares/turnosMiddleware');
const { exigirPermiso } = require('../middleware/authorizationMiddleware');

router.get(
  '/',
  middlewareAutenticacion,
  exigirPermiso('reportes'),
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'ver_estadisticas';
    next();
  },
  obtenerEstadisticas,
);

module.exports = router;
