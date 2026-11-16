const estadisticasService = require('../services/estadisticasService');

async function obtenerEstadisticas(req, res) {
  try {
    const { fecha_desde: fechaDesde, fecha_hasta: fechaHasta } = req.query;
    const data = await estadisticasService.generarEstadisticas({ fechaDesde, fechaHasta });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al generar estadísticas' });
  }
}

module.exports = {
  obtenerEstadisticas,
};
