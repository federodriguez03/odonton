const odontogramaService = require('../services/odontogramaService');

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
		if (Array.isArray(body.registros)) {
			const odontograma = await odontogramaService.guardarOdontogramaCompleto({ ...body, actor: req.clinicalActor });
			return res.status(200).json({ mensaje: 'Odontograma guardado', odontograma });
		}
		const hasCara = body.diente !== undefined && body.cara !== undefined && body.estado !== undefined;
		const hasMeta = body.sarro !== undefined || body.periodontal !== undefined || body.observaciones !== undefined;

		if (!hasCara && hasMeta) {
			if (!body.paciente_id) throw new Error('paciente_id requerido');
			await odontogramaService.guardarMeta(
				body.paciente_id,
				body.sarro === undefined ? undefined : Boolean(body.sarro),
				body.periodontal === undefined ? undefined : Boolean(body.periodontal),
				body.observaciones,
				req.clinicalActor
			);
			return res.status(201).json({ mensaje: 'Metadatos de odontograma guardados' });
		}

		const resultado = await odontogramaService.guardarOdontogramaCompleto({
			paciente_id: body.paciente_id,
			registros: [body],
			meta: {
				...(body.sarro !== undefined ? { sarro: Boolean(body.sarro) } : {}),
				...(body.periodontal !== undefined ? { periodontal: Boolean(body.periodontal) } : {}),
				...(body.observaciones !== undefined ? { observaciones: body.observaciones } : {}),
			},
			actor: req.clinicalActor,
		});
		const registro = resultado.registros.find((item) => item.diente === Number(body.diente) && item.cara === body.cara);

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
};
