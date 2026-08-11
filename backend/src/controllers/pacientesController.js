const pacientesService = require('../services/pacientesService');
const {
	generarTokenAutogestion,
	enviarLinkAutogestionPorWhatsapp,
	validarTokenAutogestion,
	consultarDisponibilidadAutogestion,
	confirmarSolicitudTurnoAutogestion,
	generarTokenCancelacionAutogestion,
	enviarLinkCancelacionPorWhatsapp,
	listarTurnosCancelablesAutogestion,
	cancelarTurnoPropioAutogestion,
	generarTokenReprogramacionAutogestion,
	enviarLinkReprogramacionPorWhatsapp,
	listarTurnosReprogramablesAutogestion,
	consultarDisponibilidadReprogramacionAutogestion,
	reprogramarTurnoPropioAutogestion,
} = require('../services/autogestionService');

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
			observaciones,
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
			observaciones,
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

async function obtenerOdontograma(req, res) {
	try {
		const { id } = req.params;
		if (!id) return res.status(400).json({ mensaje: 'Id de paciente requerido' });

		const result = await pacientesService.obtenerOdontogramaPaciente(id);
		req.auditAction = 'consultar_odontograma';
		req.auditMeta = {
			paciente_id: Number(id),
			piezas_total: Array.isArray(result?.piezas) ? result.piezas.length : 0,
		};

		return res.status(200).json(result);
	} catch (error) {
		return res.status(400).json({ mensaje: error.message || 'Error al consultar odontograma' });
	}
}

async function guardarOdontogramaPieza(req, res) {
	try {
		const { id, pieza } = req.params;
		if (!id) return res.status(400).json({ mensaje: 'Id de paciente requerido' });
		if (!pieza) return res.status(400).json({ mensaje: 'Numero de pieza requerido' });

		const result = await pacientesService.guardarOdontogramaPieza({
			pacienteId: id,
			piezaNumero: pieza,
			estadoPieza: req.body?.estado_pieza,
			caras: req.body?.caras || null,
			observaciones: req.body?.observaciones || null,
			usuarioId: req.user?.id || null,
		});

		req.auditAction = 'actualizar_odontograma_pieza';
		req.auditMeta = {
			paciente_id: Number(id),
			pieza_numero: Number(pieza),
			estado_pieza: result?.pieza?.estado_pieza || null,
		};

		return res.status(200).json(result);
	} catch (error) {
		return res.status(400).json({ mensaje: error.message || 'Error al guardar pieza de odontograma' });
	}
}

module.exports = {
	registrarPaciente,
	actualizarPaciente,
	listarPacientes,
	obtenerPaciente,
	obtenerOdontograma,
	guardarOdontogramaPieza,
};

module.exports.fichaClinica = fichaClinica;

async function generarLinkSolicitudTurno(req, res) {
	try {
		const { telefono = null } = req.body || {};
		const tokenData = await generarTokenAutogestion({ telefono, creadoPor: 'whatsapp' });
		const wa = await enviarLinkAutogestionPorWhatsapp({
			telefono,
			link: tokenData.link,
		});

		req.auditAction = 'autogestion_generar_link_solicitud_turno';
		req.auditMeta = {
			telefono: telefono || null,
			token_expires_at: tokenData.expires_at,
			whatsapp_ok: wa.enviado,
			whatsapp_error: wa.advertencia || null,
		};

		return res.status(201).json({
			mensaje: 'Enlace de solicitud generado',
			token: tokenData,
			notificacion: wa,
		});
	} catch (error) {
		return res.status(400).json({ mensaje: error.message || 'Error al generar enlace de solicitud' });
	}
}

async function validarTokenSolicitudTurno(req, res) {
	try {
		const token = String(req.params.token || '').trim();
		if (!token) return res.status(400).json({ mensaje: 'Token requerido' });

		const tokenData = await validarTokenAutogestion(token);
		req.auditAction = 'autogestion_validar_token_solicitud_turno';
		req.auditMeta = {
			token_expires_at: tokenData.expires_at,
		};

		return res.status(200).json({
			valido: true,
			token: {
				telefono: tokenData.telefono || null,
				expires_at: tokenData.expires_at,
				estado: tokenData.estado,
			},
		});
	} catch (error) {
		return res.status(400).json({ valido: false, mensaje: error.message || 'Token invalido' });
	}
}

async function consultarDisponibilidadSolicitudTurno(req, res) {
	try {
		const { token, fechaDesde, fechaHasta } = req.body || {};
		const data = await consultarDisponibilidadAutogestion({
			token,
			fechaDesde,
			fechaHasta,
		});

		req.auditAction = 'autogestion_consultar_disponibilidad_turnos';
		req.auditMeta = {
			fecha_desde: data.fecha_desde,
			fecha_hasta: data.fecha_hasta,
			ocupados: Array.isArray(data.ocupados) ? data.ocupados.length : 0,
		};

		return res.status(200).json(data);
	} catch (error) {
		return res.status(400).json({ mensaje: error.message || 'Error al consultar disponibilidad' });
	}
}

async function confirmarSolicitudTurno(req, res) {
	try {
		const result = await confirmarSolicitudTurnoAutogestion(req.body || {});
		req.auditAction = 'autogestion_confirmar_turno';
		req.auditMeta = {
			turno_id: result.turno?.id || null,
			paciente_id: result.paciente?.id || null,
			whatsapp_ok: result.notificacion?.enviado || false,
			whatsapp_error: result.notificacion?.advertencia || null,
			sync_warning: result.advertencia_sync || null,
		};

		return res.status(201).json(result);
	} catch (error) {
		return res.status(400).json({ mensaje: error.message || 'Error al confirmar solicitud de turno' });
	}
}

module.exports.generarLinkSolicitudTurno = generarLinkSolicitudTurno;
module.exports.validarTokenSolicitudTurno = validarTokenSolicitudTurno;
module.exports.consultarDisponibilidadSolicitudTurno = consultarDisponibilidadSolicitudTurno;
module.exports.confirmarSolicitudTurno = confirmarSolicitudTurno;

async function generarLinkCancelacionTurno(req, res) {
	try {
		const { telefono = null } = req.body || {};
		const tokenData = await generarTokenCancelacionAutogestion({ telefono, creadoPor: 'whatsapp' });
		const wa = await enviarLinkCancelacionPorWhatsapp({ telefono, link: tokenData.link });

		req.auditAction = 'autogestion_generar_link_cancelacion_turno';
		req.auditMeta = {
			telefono: telefono || null,
			token_expires_at: tokenData.expires_at,
			whatsapp_ok: wa.enviado,
			whatsapp_error: wa.advertencia || null,
		};

		return res.status(201).json({
			mensaje: 'Enlace de cancelacion generado',
			token: tokenData,
			notificacion: wa,
		});
	} catch (error) {
		return res.status(400).json({ mensaje: error.message || 'Error al generar enlace de cancelacion' });
	}
}

async function validarTokenCancelacionTurno(req, res) {
	try {
		const token = String(req.params.token || '').trim();
		if (!token) return res.status(400).json({ mensaje: 'Token requerido' });

		const tokenData = await validarTokenAutogestion(token);
		if (tokenData.tipo_flujo !== 'cancelar_turno') {
			return res.status(400).json({ valido: false, mensaje: 'Token no corresponde a cancelacion de turno' });
		}

		req.auditAction = 'autogestion_validar_token_cancelacion_turno';
		req.auditMeta = {
			token_expires_at: tokenData.expires_at,
		};

		return res.status(200).json({
			valido: true,
			token: {
				telefono: tokenData.telefono || null,
				expires_at: tokenData.expires_at,
				estado: tokenData.estado,
				tipo_flujo: tokenData.tipo_flujo,
			},
		});
	} catch (error) {
		return res.status(400).json({ valido: false, mensaje: error.message || 'Token invalido' });
	}
}

async function listarTurnosCancelables(req, res) {
	try {
		const { token, dni } = req.body || {};
		const data = await listarTurnosCancelablesAutogestion({ token, dni });

		req.auditAction = 'autogestion_listar_turnos_cancelables';
		req.auditMeta = {
			dni: dni || null,
			turnos_cancelables: Array.isArray(data.turnos) ? data.turnos.length : 0,
		};

		return res.status(200).json(data);
	} catch (error) {
		return res.status(400).json({ mensaje: error.message || 'Error al listar turnos cancelables' });
	}
}

async function cancelarTurnoPropio(req, res) {
	try {
		const result = await cancelarTurnoPropioAutogestion(req.body || {});

		req.auditAction = 'autogestion_cancelar_turno_propio';
		req.auditMeta = {
			turno_id: result.turno?.id || null,
			paciente_id: result.paciente?.id || null,
			whatsapp_ok: result.notificacion?.enviado || false,
			whatsapp_error: result.notificacion?.advertencia || null,
			sync_warning: result.advertencia_sync || null,
		};

		return res.status(200).json(result);
	} catch (error) {
		return res.status(400).json({ mensaje: error.message || 'Error al cancelar turno propio' });
	}
}

module.exports.generarLinkCancelacionTurno = generarLinkCancelacionTurno;
module.exports.validarTokenCancelacionTurno = validarTokenCancelacionTurno;
module.exports.listarTurnosCancelables = listarTurnosCancelables;
module.exports.cancelarTurnoPropio = cancelarTurnoPropio;

async function generarLinkReprogramacionTurno(req, res) {
	try {
		const { telefono = null } = req.body || {};
		const tokenData = await generarTokenReprogramacionAutogestion({ telefono, creadoPor: 'whatsapp' });
		const wa = await enviarLinkReprogramacionPorWhatsapp({ telefono, link: tokenData.link });

		req.auditAction = 'autogestion_generar_link_reprogramacion_turno';
		req.auditMeta = {
			telefono: telefono || null,
			token_expires_at: tokenData.expires_at,
			whatsapp_ok: wa.enviado,
			whatsapp_error: wa.advertencia || null,
		};

		return res.status(201).json({
			mensaje: 'Enlace de reprogramacion generado',
			token: tokenData,
			notificacion: wa,
		});
	} catch (error) {
		return res.status(400).json({ mensaje: error.message || 'Error al generar enlace de reprogramacion' });
	}
}

async function validarTokenReprogramacionTurno(req, res) {
	try {
		const token = String(req.params.token || '').trim();
		if (!token) return res.status(400).json({ mensaje: 'Token requerido' });

		const tokenData = await validarTokenAutogestion(token);
		if (tokenData.tipo_flujo !== 'reprogramar_turno') {
			return res.status(400).json({ valido: false, mensaje: 'Token no corresponde a reprogramacion de turno' });
		}

		req.auditAction = 'autogestion_validar_token_reprogramacion_turno';
		req.auditMeta = {
			token_expires_at: tokenData.expires_at,
		};

		return res.status(200).json({
			valido: true,
			token: {
				telefono: tokenData.telefono || null,
				expires_at: tokenData.expires_at,
				estado: tokenData.estado,
				tipo_flujo: tokenData.tipo_flujo,
			},
		});
	} catch (error) {
		return res.status(400).json({ valido: false, mensaje: error.message || 'Token invalido' });
	}
}

async function listarTurnosReprogramables(req, res) {
	try {
		const { token, dni } = req.body || {};
		const data = await listarTurnosReprogramablesAutogestion({ token, dni });

		req.auditAction = 'autogestion_listar_turnos_reprogramables';
		req.auditMeta = {
			dni: dni || null,
			turnos_reprogramables: Array.isArray(data.turnos) ? data.turnos.length : 0,
		};

		return res.status(200).json(data);
	} catch (error) {
		return res.status(400).json({ mensaje: error.message || 'Error al listar turnos reprogramables' });
	}
}

async function consultarDisponibilidadReprogramacion(req, res) {
	try {
		const data = await consultarDisponibilidadReprogramacionAutogestion(req.body || {});

		req.auditAction = 'autogestion_consultar_disponibilidad_reprogramacion';
		req.auditMeta = {
			turno_id: req.body?.turnoId || null,
			ocupados: Array.isArray(data.ocupados) ? data.ocupados.length : 0,
		};

		return res.status(200).json(data);
	} catch (error) {
		return res.status(400).json({ mensaje: error.message || 'Error al consultar disponibilidad de reprogramacion' });
	}
}

async function reprogramarTurnoPropio(req, res) {
	try {
		const result = await reprogramarTurnoPropioAutogestion(req.body || {});

		req.auditAction = 'autogestion_reprogramar_turno_propio';
		req.auditMeta = {
			turno_id: result.turno?.id || null,
			paciente_id: result.paciente?.id || null,
			whatsapp_ok: result.notificacion?.enviado || false,
			whatsapp_error: result.notificacion?.advertencia || null,
			sync_warning: result.advertencia_sync || null,
		};

		return res.status(200).json(result);
	} catch (error) {
		return res.status(400).json({ mensaje: error.message || 'Error al reprogramar turno propio' });
	}
}

module.exports.generarLinkReprogramacionTurno = generarLinkReprogramacionTurno;
module.exports.validarTokenReprogramacionTurno = validarTokenReprogramacionTurno;
module.exports.listarTurnosReprogramables = listarTurnosReprogramables;
module.exports.consultarDisponibilidadReprogramacion = consultarDisponibilidadReprogramacion;
module.exports.reprogramarTurnoPropio = reprogramarTurnoPropio;

