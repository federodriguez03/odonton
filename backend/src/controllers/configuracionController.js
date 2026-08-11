const configuracionService = require('../services/configuracionService');

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

module.exports = {
  obtenerConfiguracion,
  guardarConfiguracion,
};
