const service = require('../services/declaracionesSaludService');

async function getDeclaration(req, res) {
  try {
    const result = await service.getByPatient(req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    const status = /no encontrado/i.test(error.message) ? 404 : 400;
    return res.status(status).json({ mensaje: error.message || 'No se pudo obtener la declaración de salud' });
  }
}

async function saveDeclaration(req, res) {
  try {
    const declaration = await service.saveVersion({
      patientId: req.params.id,
      actorUserId: req.user.id,
      respondidoPor: req.body?.respondido_por,
      nombreTutor: req.body?.nombre_tutor,
      rawResponses: req.body?.respuestas || {},
    });
    req.auditMeta = { paciente_id: Number(req.params.id), declaracion_id: declaration.id, numero_version: declaration.numero_version, estado: declaration.estado };
    return res.status(201).json({ mensaje: declaration.estado === 'completa' ? 'Declaración de salud completa' : 'Borrador de declaración guardado', declaracion: declaration });
  } catch (error) {
    const status = /no encontrado/i.test(error.message) ? 404 : 400;
    return res.status(status).json({ mensaje: error.message || 'No se pudo guardar la declaración de salud' });
  }
}

module.exports = { getDeclaration, saveDeclaration };
