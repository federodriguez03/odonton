const express = require('express');
const router = express.Router();

const { obtenerResumenClinicoFinanciero } = require('../controllers/reportesController');
const {
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
} = require('../middlewares/turnosMiddleware');

router.get(
  '/resumen',
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'ver_reporte_clinico_financiero';
    next();
  },
  obtenerResumenClinicoFinanciero,
);

module.exports = router;
