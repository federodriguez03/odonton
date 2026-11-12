const reportesService = require('../services/reportesService');

async function obtenerResumenClinicoFinanciero(req, res) {
  try {
    const { fecha_desde: fechaDesde, fecha_hasta: fechaHasta } = req.query;
    const resumenOnly = String(req.query?.resumen || '').toLowerCase() === 'true';

    const generar = req.user?.rol === 'recepcion' ? reportesService.generarReporteOperativo : reportesService.generarReporteClinicoFinanciero;
    const reporte = await generar({
      fechaDesde,
      fechaHasta,
      incluirDetalle: !resumenOnly,
    });

    return res.status(200).json(reporte);
  } catch (error) {
    const entradaInvalida = ['RANGO_REQUERIDO', 'RANGO_INVALIDO'].includes(error?.code);
    return res.status(entradaInvalida ? 400 : 500).json({
      mensaje: entradaInvalida ? error.message : 'Error interno al generar el reporte',
    });
  }
}

module.exports = {
  obtenerResumenClinicoFinanciero,
};
