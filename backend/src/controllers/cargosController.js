const cargosService = require('../services/cargosService');
const { responderErrorPagos } = require('../utils/pagosHttp');

async function crearCargo(req, res) {
  try {
    const cargo = await cargosService.crearCargo(req.body || {});
    req.auditMeta = { cargo_id: cargo.id };
    return res.status(201).json({ mensaje: 'Cargo registrado', cargo });
  } catch (error) {
    return responderErrorPagos(res, error, 'Error interno al registrar el cargo');
  }
}

async function listarCargos(req, res) {
  try {
    const resultado = await cargosService.listarCargos(req.query || {});
    return res.status(200).json(resultado);
  } catch (error) {
    return responderErrorPagos(res, error, 'Error interno al listar cargos');
  }
}

async function obtenerCargo(req, res) {
  try {
    const resultado = await cargosService.obtenerCargo(req.params.id);
    return res.status(200).json(resultado);
  } catch (error) {
    return responderErrorPagos(res, error, 'Error interno al consultar el cargo');
  }
}

module.exports = {
  crearCargo,
  listarCargos,
  obtenerCargo,
};
