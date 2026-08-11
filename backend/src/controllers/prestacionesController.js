const prestacionesService = require('../services/prestacionesService');

async function listarPrestaciones(req, res) {
  try {
    const incluirInactivas = String(req.query?.all || req.query?.incluir_inactivas || '').toLowerCase() === 'true';
    const result = await prestacionesService.listarPrestaciones({ incluirInactivas });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({
      mensaje: error.message || 'Error al listar prestaciones',
    });
  }
}

async function crearPrestacion(req, res) {
  try {
    const prestacion = await prestacionesService.crearPrestacion(req.body || {});
    return res.status(201).json({ mensaje: 'Prestacion creada', prestacion });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al crear prestacion' });
  }
}

async function actualizarPrestacion(req, res) {
  try {
    const { id } = req.params;
    const prestacion = await prestacionesService.actualizarPrestacion(id, req.body || {});
    return res.status(200).json({ mensaje: 'Prestacion actualizada', prestacion });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al actualizar prestacion' });
  }
}

async function activarPrestacion(req, res) {
  try {
    const { id } = req.params;
    const prestacion = await prestacionesService.setActivoPrestacion(id, true);
    return res.status(200).json({ mensaje: 'Prestacion activada', prestacion });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al activar prestacion' });
  }
}

async function desactivarPrestacion(req, res) {
  try {
    const { id } = req.params;
    const prestacion = await prestacionesService.setActivoPrestacion(id, false);
    return res.status(200).json({ mensaje: 'Prestacion desactivada', prestacion });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al desactivar prestacion' });
  }
}

async function normalizarPrestaciones(req, res) {
  try {
    const resultado = await prestacionesService.normalizarPrestacionesDuplicadas();
    return res.status(200).json({
      mensaje: 'Prestaciones duplicadas normalizadas',
      resultado,
    });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al normalizar prestaciones' });
  }
}

module.exports = {
  listarPrestaciones,
  crearPrestacion,
  actualizarPrestacion,
  activarPrestacion,
  desactivarPrestacion,
  normalizarPrestaciones,
};
