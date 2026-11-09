const service = require('../services/consultasClinicasService');

async function crear(req, res) {
  try {
    const consulta = await service.crearConsulta({ pacienteId: req.params.id, actorId: req.user.id, datos: req.body || {} });
    return res.status(201).json({ mensaje: 'Atención registrada correctamente', consulta });
  } catch (error) {
    return res.status(error.message.includes('no encontrado') ? 404 : 400).json({ mensaje: error.message });
  }
}
async function listar(req, res) {
  try { return res.json({ consultas: await service.listarConsultas(req.params.id) }); }
  catch (error) { return res.status(400).json({ mensaje: error.message }); }
}
async function actualizar(req, res) {
  try {
    const consulta = await service.actualizarConsulta({ pacienteId: req.params.id, consultaId: req.params.consultaId, datos: req.body || {} });
    return res.json({ mensaje: 'Atención actualizada correctamente', consulta });
  } catch (error) {
    return res.status(error.message.includes('no encontrada') ? 404 : 400).json({ mensaje: error.message });
  }
}
module.exports = { crear, listar, actualizar };
