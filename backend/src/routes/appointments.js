/**
 * Rutas de gestión de turnos (placeholder)
 */

const express = require('express');
const { verifyToken, verifyAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/appointments
 * Obtiene lista de turnos
 */
router.get('/', verifyToken, verifyAdmin, (req, res) => {
  res.status(200).json({ 
    message: 'Endpoints de turnos en desarrollo',
    endpoints: [
      'GET /api/appointments - Lista de turnos',
      'GET /api/appointments/:id - Detalle de turno',
      'POST /api/appointments - Crear turno',
      'PUT /api/appointments/:id - Editar turno',
      'DELETE /api/appointments/:id - Cancelar turno',
    ]
  });
});

module.exports = router;
