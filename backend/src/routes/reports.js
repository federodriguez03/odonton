/**
 * Rutas de reportes (placeholder)
 */

const express = require('express');
const { verifyToken, verifyAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/reports
 * Obtiene reportes disponibles
 */
router.get('/', verifyToken, verifyAdmin, (req, res) => {
  res.status(200).json({ 
    message: 'Endpoints de reportes en desarrollo',
    endpoints: [
      'GET /api/reports/patients - Estadísticas de pacientes',
      'GET /api/reports/revenue - Ingresos',
      'GET /api/reports/treatments - Tratamientos',
    ]
  });
});

module.exports = router;
