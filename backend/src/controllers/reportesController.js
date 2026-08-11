const reportesService = require('../services/reportesService');

async function reporteAtencionFacturacion(req, res) {
  try {
    const { fecha_desde: fechaDesde, fecha_hasta: fechaHasta } = req.query;
    const resumenOnly = String(req.query?.resumen || '').toLowerCase() === 'true';

    const reporte = await reportesService.generarReporteAtencionFacturacion({
      fechaDesde,
      fechaHasta,
      incluirDetalle: !resumenOnly,
    });

    return res.status(200).json(reporte);
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al generar reporte' });
  }
}

module.exports = {
  reporteAtencionFacturacion,
};
