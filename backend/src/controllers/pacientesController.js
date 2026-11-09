const pacientesService = require('../services/pacientesService');

async function registrarPaciente(req, res) {
	try {
		const {
			nombre,
			apellido,
			dni,
			nacionalidad,
			domicilio,
			telefono,
			email,
			fecha_nacimiento,
		} = req.body;

		if (!nombre || !apellido || !dni) {
			return res.status(400).json({ mensaje: 'Faltan datos obligatorios: nombre, apellido, dni' });
		}

		const paciente = await pacientesService.crearPaciente({
			nombre,
			apellido,
			dni,
			nacionalidad,
			domicilio,
			telefono,
			email,
			fecha_nacimiento,
		});

		req.auditAction = 'registrar_paciente';

		return res.status(201).json({ mensaje: 'Paciente registrado correctamente', paciente });
	} catch (error) {
		return res.status(400).json({ mensaje: error.message || 'Error al registrar paciente' });
	}
}

async function actualizarPaciente(req, res) {
	try {
		const { id } = req.params;
		if (!id) {
			return res.status(400).json({ mensaje: 'Id de paciente requerido' });
		}

		const fields = req.body || {};

		const paciente = await pacientesService.actualizarPaciente(id, fields);

		req.auditAction = 'actualizar_paciente';

		return res.status(200).json({ mensaje: 'Paciente actualizado correctamente', paciente });
	} catch (error) {
		return res.status(400).json({ mensaje: error.message || 'Error al actualizar paciente' });
	}
}

async function listarPacientes(req, res) {
	try {
		const { page, limit, q, dni, sort } = req.query;
		const result = await pacientesService.listarPacientes({ page, limit, q, dni, sort });
		req.auditAction = 'ver_listado_pacientes';
		return res.status(200).json(result);
	} catch (error) {
		return res.status(400).json({ mensaje: error.message || 'Error al listar pacientes' });
	}
}

async function obtenerPaciente(req, res) {
	try {
		const { id } = req.params;
		if (!id) return res.status(400).json({ mensaje: 'Id de paciente requerido' });

		const paciente = await pacientesService.obtenerPaciente(id);
		if (!paciente) return res.status(404).json({ mensaje: 'Paciente no encontrado' });

		req.auditAction = 'ver_paciente';
		return res.status(200).json({ paciente });
	} catch (error) {
		return res.status(400).json({ mensaje: error.message || 'Error al obtener paciente' });
	}
}

async function fichaClinica(req, res) {
	try {
		const { id } = req.params;
		if (!id) return res.status(400).json({ mensaje: 'Id de paciente requerido' });

		const { page, limit, estado_turno, sort } = req.query;
		const result = await pacientesService.obtenerFichaClinica(id, { page, limit, estado_turno, sort });
		if (!result) return res.status(404).json({ mensaje: 'Paciente no encontrado' });

		req.auditAction = 'consultar_ficha_clinica';
		return res.status(200).json(result);
	} catch (error) {
		return res.status(400).json({ mensaje: error.message || 'Error al obtener ficha clínica' });
	}
}

async function actualizarFichaClinica(req, res) {
	try {
		const paciente = await pacientesService.actualizarDatosClinicos(req.params.id, req.body || {});
		return res.status(200).json({ mensaje: 'Información clínica actualizada', paciente });
	} catch (error) {
		return res.status(error.message.includes('no encontrado') ? 404 : 400).json({ mensaje: error.message });
	}
}

module.exports = {
	registrarPaciente,
	actualizarPaciente,
	listarPacientes,
	obtenerPaciente,
};

module.exports.fichaClinica = fichaClinica;
module.exports.actualizarFichaClinica = actualizarFichaClinica;
