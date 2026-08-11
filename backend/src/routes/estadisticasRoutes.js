const express = require('express');
const router = express.Router();

const { obtenerEstadisticas } = require('../controllers/estadisticasController');
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
    req.auditAction = 'ver_estadisticas';
    next();
  },
  obtenerEstadisticas,
);

module.exports = router;
