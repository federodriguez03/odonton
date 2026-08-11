const pagosService = require('../services/pagosService');

async function listarPagos(req, res) {
  try {
    const { pacienteId, desde, hasta } = req.query;
    const pagos = await pagosService.listarPagos({ pacienteId, desde, hasta });
    return res.status(200).json({ pagos });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al listar pagos' });
  }
}

async function resumenPaciente(req, res) {
  try {
    const { pacienteId } = req.params;
    const data = await pagosService.obtenerResumenPaciente(pacienteId);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al obtener resumen del paciente' });
  }
}

async function crearPago(req, res) {
  try {
    const pago = await pagosService.crearPago(req.body || {});
    return res.status(201).json({ mensaje: 'Pago registrado', pago });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al registrar pago' });
  }
}

async function actualizarPago(req, res) {
  try {
    const { id } = req.params;
    const pago = await pagosService.actualizarPago(id, req.body || {});
    return res.status(200).json({ mensaje: 'Pago actualizado', pago });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al actualizar pago' });
  }
}

module.exports = {
  listarPagos,
  crearPago,
  actualizarPago,
  resumenPaciente,
};
