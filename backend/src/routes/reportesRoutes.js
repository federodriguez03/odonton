const express = require('express');
const router = express.Router();

const { obtenerResumenClinicoFinanciero } = require('../controllers/reportesController');
const {
  middlewareAutenticacion,
  middlewareAuditoria,
} = require('../middlewares/turnosMiddleware');
const { exigirPermiso } = require('../middleware/authorizationMiddleware');

router.get(
  '/resumen',
  middlewareAutenticacion,
  exigirPermiso('reportes'),
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'ver_reporte_clinico_financiero';
    next();
  },
  obtenerResumenClinicoFinanciero,
);

module.exports = router;
