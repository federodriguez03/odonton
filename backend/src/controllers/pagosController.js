const pagosService = require('../services/pagosService');
const { responderErrorPagos } = require('../utils/pagosHttp');

async function listarPagos(req, res) {
  try {
    const resultado = await pagosService.listarPagos(req.query || {});
    return res.status(200).json(resultado);
  } catch (error) {
    return responderErrorPagos(res, error, 'Error interno al listar pagos');
  }
}

async function registrarPago(req, res) {
  try {
    const resultado = await pagosService.registrarPago(req.body || {});
    req.auditMeta = {
      pago_id: resultado.pago.id,
      cargo_id: resultado.pago.cargo_id,
    };
    return res.status(201).json({ mensaje: 'Pago registrado', ...resultado });
  } catch (error) {
    return responderErrorPagos(res, error, 'Error interno al registrar el pago');
  }
}

async function anularPago(req, res) {
  try {
    const resultado = await pagosService.anularPago(req.params.id, {
      motivo: req.body?.motivo,
      usuarioId: req.user?.id,
    });
    req.auditMeta = { cargo_id: resultado.pago.cargo_id };
    return res.status(200).json({ mensaje: 'Pago anulado', ...resultado });
  } catch (error) {
    return responderErrorPagos(res, error, 'Error interno al anular el pago');
  }
}

module.exports = {
  anularPago,
  listarPagos,
  registrarPago,
};
