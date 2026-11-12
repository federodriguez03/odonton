const express = require('express');
const router = express.Router();

const { obtenerResumenClinicoFinanciero } = require('../controllers/reportesController');
const {
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
} = require('../middlewares/turnosMiddleware');
const { autorizarReportesOperativos } = require('../middlewares/finanzasAutorizacion');

router.get(
  '/resumen',
  middlewareAutenticacion,
  autorizarReportesOperativos,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'ver_reporte_clinico_financiero';
    next();
  },
  obtenerResumenClinicoFinanciero,
);

module.exports = router;
