const express = require('express');
const router = express.Router();

const { reporteAtencionFacturacion } = require('../controllers/reportesController');
const {
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
} = require('../middlewares/turnosMiddleware');

router.get(
  '/atencion-facturacion',
  middlewareAutenticacion,
  autorizarOdontologo,
  middlewareAuditoria,
  (req, res, next) => {
    req.auditAction = 'reporte_atencion_facturacion';
    next();
  },
  reporteAtencionFacturacion,
);

module.exports = router;
