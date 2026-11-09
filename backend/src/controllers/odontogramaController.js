const odontogramaService = require('../services/odontogramaService');
const referenciasService = require('../services/odontogramaReferenciasService');

async function getOdontogramaPaciente(req, res) {
  try {
    const { pacienteId } = req.params;
    const data = await odontogramaService.obtenerOdontogramaPorPaciente(pacienteId);
    return res.status(200).json(data);
  } catch (error) {
    const mensaje = error.message || 'Error al obtener odontograma';
    const status = mensaje.includes('no encontrado') ? 404 : 400;
    return res.status(status).json({ mensaje });
  }
}

async function postOdontograma(req, res) {
	try {
		const body = req.body || {};
		const hasCara = body.diente !== undefined && body.cara !== undefined && body.estado !== undefined;
		const hasMeta = body.sarro !== undefined || body.periodontal !== undefined || body.observaciones !== undefined;

		if (!hasCara && hasMeta) {
			if (!body.paciente_id) throw new Error('paciente_id requerido');
			await odontogramaService.guardarMeta(
				body.paciente_id,
				body.sarro === undefined ? undefined : Boolean(body.sarro),
				body.periodontal === undefined ? undefined : Boolean(body.periodontal),
				body.observaciones === undefined ? undefined : (body.observaciones === null ? null : String(body.observaciones))
			);
			return res.status(201).json({ mensaje: 'Metadatos de odontograma guardados' });
		}

		const registro = await odontogramaService.guardarEstadoCara(body);

		if (hasMeta) {
			await odontogramaService.guardarMeta(
				registro.paciente_id,
				body.sarro === undefined ? undefined : Boolean(body.sarro),
				body.periodontal === undefined ? undefined : Boolean(body.periodontal),
				body.observaciones === undefined ? undefined : (body.observaciones === null ? null : String(body.observaciones))
			);
		}

		return res.status(201).json({ mensaje: 'Estado odontograma guardado', registro });
	} catch (error) {
		const mensaje = error.message || 'Error al guardar odontograma';
		const status = mensaje.includes('no encontrado') ? 404 : 400;
		return res.status(status).json({ mensaje });
	}
}

module.exports = {
  getOdontogramaPaciente,
  postOdontograma,
  getReferencias: async (req, res) => {
    try {
      return res.status(200).json({ referencias: await referenciasService.listar({ pacienteId: req.query.paciente_id || null }) });
    } catch (error) {
      return res.status(400).json({ mensaje: error.message });
    }
  },
};
