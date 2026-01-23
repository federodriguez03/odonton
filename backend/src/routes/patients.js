/**
 * Rutas de gestión de pacientes
 */

const express = require('express');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const { handleValidationErrors, validators } = require('../middleware/validation');
const Patient = require('../models/Patient');

const router = express.Router();

/**
 * GET /api/patients
 * Obtiene lista de todos los pacientes (solo admin)
 */
router.get('/', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const patients = await Patient.findAll(limit, offset);
    res.status(200).json({ patients });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener pacientes' });
  }
});

/**
 * GET /api/patients/:id
 * Obtiene datos de un paciente específico (solo admin)
 */
router.get('/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }
    res.status(200).json({ patient });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener paciente' });
  }
});

/**
 * POST /api/patients
 * Crea un nuevo paciente
 */
router.post('/', 
  [
    validators.name('name'),
    validators.dni(),
    validators.email(),
    validators.phone(),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { name, dni, email, phone, birthdate, address, observations } = req.body;

      // Verificar si el paciente ya existe
      const existingPatient = await Patient.findByDni(dni);
      if (existingPatient) {
        return res.status(400).json({ error: 'Paciente con este DNI ya existe' });
      }

      const newPatient = await Patient.create({
        name,
        dni,
        email,
        phone,
        birthdate,
        address,
        observations,
      });

      res.status(201).json({
        message: 'Paciente creado exitosamente',
        patient: newPatient,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al crear paciente' });
    }
  }
);

/**
 * PUT /api/patients/:id
 * Actualiza datos de un paciente (solo admin)
 */
router.put('/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    const updatedPatient = await Patient.update(req.params.id, req.body);
    res.status(200).json({
      message: 'Paciente actualizado exitosamente',
      patient: updatedPatient,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar paciente' });
  }
});

/**
 * DELETE /api/patients/:id
 * Elimina un paciente (solo admin)
 */
router.delete('/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    await Patient.delete(req.params.id);
    res.status(200).json({ message: 'Paciente eliminado exitosamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar paciente' });
  }
});

module.exports = router;
