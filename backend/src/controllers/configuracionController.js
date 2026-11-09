const configuracionService = require('../services/configuracionService');
const referenciasService = require('../services/odontogramaReferenciasService');

async function obtenerConfiguracion(req, res) {
  try {
    const data = await configuracionService.obtenerConfiguracion();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al obtener configuracion' });
  }
}

async function guardarConfiguracion(req, res) {
  try {
    const data = await configuracionService.guardarConfiguracion(req.body || {});
    return res.status(200).json({
      mensaje: 'Configuracion guardada',
      ...data,
    });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al guardar configuracion' });
  }
}

async function listarReferenciasOdontograma(req, res) {
  try {
    return res.status(200).json({ referencias: await referenciasService.listar({ incluirInactivas: true }) });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message });
  }
}

async function crearReferenciaOdontograma(req, res) {
  try {
    const referencia = await referenciasService.crear(req.body || {});
    return res.status(201).json({ mensaje: 'Referencia creada', referencia });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message });
  }
}

async function actualizarReferenciaOdontograma(req, res) {
  try {
    const referencia = await referenciasService.actualizar(req.params.id, req.body || {});
    return res.status(200).json({ mensaje: 'Referencia actualizada', referencia });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message });
  }
}

module.exports = {
  obtenerConfiguracion,
  guardarConfiguracion,
  listarReferenciasOdontograma,
  crearReferenciaOdontograma,
  actualizarReferenciaOdontograma,
};
