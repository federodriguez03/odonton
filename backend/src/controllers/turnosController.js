// Archivo controller para gestionar turnos

const turnosService = require('../services/turnosService');
const {
  notificarCambioTurnoPorWhatsapp,
  notificarConfirmacionSolicitudTurnoPorWhatsapp,
  notificarCancelacionTurnoPorWhatsapp,
  notificarRechazoSolicitudTurnoPorWhatsapp,
} = require('../services/whatsappService');
const {
  procesarRecordatoriosAutomaticos,
  enviarRecordatorioManualTurno,
} = require('../services/recordatoriosService');
const { listarSolicitudesTurno } = require('../services/turnoSolicitudesService');
const { resolverRecordatorioHabilitado } = require('../domain/recordatorioTurno');

function parseFechaHora(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

async function registrarTurno(req, res) {
  try {
    const {
      pacienteId,
      prestacionId,
      profesionalId,
      fechaHoraInicio,
      duracionMinutos,
      observaciones,
      recordatorioHabilitado,
    } = req.body;

    if (!pacienteId || !prestacionId || !fechaHoraInicio) {
      return res.status(400).json({
        mensaje: 'Faltan datos obligatorios para registrar el turno: paciente, prestacion y fecha/hora de inicio',
      });
    }

    if (duracionMinutos !== undefined && duracionMinutos !== null && Number(duracionMinutos) <= 0) {
      return res.status(400).json({ mensaje: 'La duracion debe ser mayor a 0' });
    }

    const fechaInicio = parseFechaHora(fechaHoraInicio);
    if (!fechaInicio) {
      return res.status(400).json({ mensaje: 'Fecha y hora de inicio invalidas' });
    }

    const turno = await turnosService.crearTurno({
      pacienteId,
      prestacionId,
      fechaHoraInicio: fechaInicio,
      duracionMinutos,
      profesionalId: profesionalId || req.user?.id || null,
      origen: 'interno',
      observaciones,
      recordatorioHabilitado: resolverRecordatorioHabilitado(recordatorioHabilitado, { defaultValue: true }),
    });

    const turnoDetalle = await turnosService.obtenerTurnoDetalle(turno.id);
    req.auditAction = 'registrar_turno';

    return res.status(201).json({
      mensaje: 'Turno registrado correctamente',
      turno: turnoDetalle,
    });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al registrar el turno' });
  }
}

// WhatsApp se intenta después de persistir; su fallo se informa sin revertir el turno.
async function editarTurno(req, res) {
  try {
    const { id } = req.params;
    const {
      pacienteId,
      prestacionId,
      profesionalId,
      fechaHoraInicio,
      duracionMinutos,
      observaciones,
      recordatorioHabilitado,
    } = req.body;

    if (!id) {
      return res.status(400).json({ mensaje: 'Id de turno requerido' });
    }

    if (!pacienteId || !prestacionId) {
      return res.status(400).json({ mensaje: 'Paciente y prestacion son obligatorios' });
    }

    if (duracionMinutos !== undefined && duracionMinutos !== null && Number(duracionMinutos) <= 0) {
      return res.status(400).json({ mensaje: 'La duracion debe ser mayor a 0' });
    }

    if (fechaHoraInicio && !parseFechaHora(fechaHoraInicio)) {
      return res.status(400).json({ mensaje: 'Fecha y hora de inicio invalidas' });
    }

    const turnoActualizado = await turnosService.editarTurno(id, {
      pacienteId,
      prestacionId,
      profesionalId,
      fechaHoraInicio,
      duracionMinutos,
      observaciones,
      recordatorioHabilitado: resolverRecordatorioHabilitado(recordatorioHabilitado),
    });

    const turnoDetalle = await turnosService.obtenerTurnoDetalle(turnoActualizado.id);

    const telefono = await turnosService.obtenerTelefonoPaciente(turnoDetalle.paciente.id);
    const whatsappResult = await notificarCambioTurnoPorWhatsapp({
      telefono,
      turno: turnoDetalle,
    });

    req.auditAction = 'editar_turno';
    req.auditMeta = {
      whatsapp_intentado: whatsappResult.intentado,
      whatsapp_ok: whatsappResult.enviado,
      whatsapp_error: whatsappResult.advertencia || null,
    };

    const advertencias = [whatsappResult.advertencia].filter(Boolean);

    return res.status(200).json({
      mensaje: 'El turno se actualizo correctamente',
      turno: turnoDetalle,
      notificacion: whatsappResult,
      ...(advertencias.length > 0 && { advertencias }),
    });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al editar el turno' });
  }
}

async function listarProfesionales(req, res) {
  try {
    const profesionales = await turnosService.listarProfesionales();
    return res.status(200).json({ profesionales });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al listar profesionales' });
  }
}

async function consultarDisponibilidad(req, res) {
  try {
    const {
      profesional_id: profesionalId,
      fecha,
      tratamiento_id: tratamientoId,
      prestacion_id: prestacionId,
      turno_id: turnoId,
      excluir_turno_id: excluirTurnoId,
      duracion_minutos: duracionMinutos,
    } = req.query;

    if (!profesionalId || !fecha || !(tratamientoId || prestacionId)) {
      return res.status(400).json({
        mensaje: 'profesional_id, fecha y tratamiento_id son obligatorios',
      });
    }

    const disponibilidad = await turnosService.consultarDisponibilidad({
      profesionalId,
      fecha,
      prestacionId: tratamientoId || prestacionId,
      turnoId: turnoId || excluirTurnoId || null,
      duracionMinutos: duracionMinutos || null,
    });

    req.auditAction = 'consultar_disponibilidad_turnos';
    req.auditMeta = {
      profesional_id: profesionalId,
      fecha,
      prestacion_id: tratamientoId || prestacionId,
      turno_id: turnoId || excluirTurnoId || null,
      duracion_minutos: duracionMinutos || null,
      slots: disponibilidad.length,
    };

    return res.status(200).json(disponibilidad);
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al consultar disponibilidad' });
  }
}

async function reprogramarTurno(req, res) {
  try {
    const { id } = req.params;
    const { fechaHoraInicio, fechaHoraFin, recordatorioHabilitado } = req.body;

    if (!id) {
      return res.status(400).json({ mensaje: 'Id de turno requerido' });
    }

    if (!fechaHoraInicio || !fechaHoraFin) {
      return res.status(400).json({ mensaje: 'Fecha y hora de inicio y fin son obligatorias' });
    }

    const inicio = parseFechaHora(fechaHoraInicio);
    const fin = parseFechaHora(fechaHoraFin);
    if (!inicio || !fin) {
      return res.status(400).json({ mensaje: 'Fecha y hora invalidas para reprogramar' });
    }

    const turnoReprogramado = await turnosService.reprogramarTurno(id, inicio, fin, {
      recordatorioHabilitado: resolverRecordatorioHabilitado(recordatorioHabilitado),
    });
    const turnoDetalle = await turnosService.obtenerTurnoDetalle(turnoReprogramado.id);
    const telefono = await turnosService.obtenerTelefonoPaciente(turnoDetalle.paciente.id);
    const whatsappResult = await notificarCambioTurnoPorWhatsapp({
      telefono,
      turno: turnoDetalle,
    });

    req.auditAction = 'reprogramar_turno';
    req.auditMeta = {
      turno_id: id,
      whatsapp_intentado: whatsappResult.intentado,
      whatsapp_ok: whatsappResult.enviado,
      whatsapp_error: whatsappResult.advertencia || null,
    };

    const advertencias = [whatsappResult.advertencia].filter(Boolean);

    return res.status(200).json({
      mensaje: 'El turno se reprogramo correctamente',
      turno: turnoDetalle,
      notificacion: whatsappResult,
      ...(advertencias.length > 0 && { advertencias }),
    });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al reprogramar el turno' });
  }
}

async function cancelarTurno(req, res) {
  try {
    const { id } = req.params;
    const enviarMensaje = req.body?.enviarMensaje === true;

    if (!id) {
      return res.status(400).json({ mensaje: 'Id de turno requerido' });
    }

    const turnoCancelado = await turnosService.cancelarTurno(id);
    const turnoDetalle = await turnosService.obtenerTurnoDetalle(turnoCancelado.id);
    let whatsappResult = { intentado: false, enviado: false, advertencia: null };

    if (enviarMensaje) {
      const telefono = await turnosService.obtenerTelefonoPaciente(turnoDetalle.paciente.id);
      whatsappResult = await notificarCancelacionTurnoPorWhatsapp({
        telefono,
        turno: turnoDetalle,
      });
    }

    req.auditAction = 'cancelar_turno';
    req.auditMeta = {
      turno_id: id,
      whatsapp_intentado: whatsappResult.intentado,
      whatsapp_ok: whatsappResult.enviado,
      whatsapp_error: whatsappResult.advertencia || null,
    };

    const advertencias = [whatsappResult.advertencia].filter(Boolean);

    return res.status(200).json({
      mensaje: 'El turno se cancelo correctamente',
      turno: turnoDetalle,
      notificacion: whatsappResult,
      ...(advertencias.length > 0 && { advertencias }),
    });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al cancelar el turno' });
  }
}

async function confirmarSolicitudTurno(req, res) {
  try {
    const { id } = req.params;
    const {
      profesionalId,
      prestacionId,
      fechaHoraInicio,
      duracionMinutos,
      observaciones,
      recordatorioHabilitado,
    } = req.body;

    if (!id) return res.status(400).json({ mensaje: 'Id de turno requerido' });
    if (!profesionalId || !fechaHoraInicio) {
      return res.status(400).json({
        mensaje: 'Profesional y fecha/hora son obligatorios para confirmar la solicitud',
      });
    }

    const fechaInicio = parseFechaHora(fechaHoraInicio);
    if (!fechaInicio) return res.status(400).json({ mensaje: 'Fecha y hora de inicio invalidas' });

    const turnoConfirmado = await turnosService.confirmarSolicitudTurno(id, {
      profesionalId,
      prestacionId,
      fechaHoraInicio: fechaInicio,
      duracionMinutos,
      observaciones,
      recordatorioHabilitado: resolverRecordatorioHabilitado(recordatorioHabilitado),
    });

    const turnoDetalle = await turnosService.obtenerTurnoDetalle(turnoConfirmado.id);
    const telefono = await turnosService.obtenerTelefonoPaciente(turnoDetalle.paciente.id);
    const whatsappResult = await notificarConfirmacionSolicitudTurnoPorWhatsapp({
      telefono,
      turno: turnoDetalle,
    });

    req.auditAction = 'confirmar_solicitud_turno';
    req.auditMeta = {
      turno_id: id,
      whatsapp_intentado: whatsappResult.intentado,
      whatsapp_ok: whatsappResult.enviado,
      whatsapp_error: whatsappResult.advertencia || null,
    };

    const advertencias = [whatsappResult.advertencia].filter(Boolean);
    return res.status(200).json({
      mensaje: 'La solicitud fue confirmada correctamente',
      turno: turnoDetalle,
      notificacion: whatsappResult,
      ...(advertencias.length > 0 && { advertencias }),
    });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al confirmar la solicitud' });
  }
}

async function rechazarSolicitudTurno(req, res) {
  try {
    const { id } = req.params;
    const { observaciones } = req.body || {};
    if (!id) return res.status(400).json({ mensaje: 'Id de turno requerido' });

    const turno = await turnosService.rechazarSolicitudTurno(id, { observaciones });
    let turnoDetalle = turno;
    let whatsappResult = { intentado: false, enviado: false, advertencia: null };

    try {
      turnoDetalle = await turnosService.obtenerTurnoDetalle(turno.id);
      whatsappResult = await notificarRechazoSolicitudTurnoPorWhatsapp({
        telefono: turnoDetalle.paciente?.telefono,
        turno: turnoDetalle,
      });
    } catch (notificationError) {
      whatsappResult = {
        intentado: false,
        enviado: false,
        advertencia: 'No se pudo preparar la notificación de rechazo por WhatsApp.',
      };
    }

    req.auditAction = 'rechazar_solicitud_turno';
    req.auditMeta = {
      turno_id: id,
      whatsapp_intentado: whatsappResult.intentado,
      whatsapp_ok: whatsappResult.enviado,
      whatsapp_error: whatsappResult.advertencia || null,
    };

    const advertencias = [whatsappResult.advertencia].filter(Boolean);

    return res.status(200).json({
      mensaje: 'Solicitud rechazada correctamente',
      turno: turnoDetalle,
      notificacion: whatsappResult,
      ...(advertencias.length > 0 && { advertencias }),
    });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al rechazar la solicitud' });
  }
}

async function listarTurnos(req, res) {
  try {
    const {
      page,
      limit,
      estado,
      paciente_id: pacienteId,
      q,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      sort,
    } = req.query;

    const result = await turnosService.listarTurnos({
      page,
      limit,
      estado,
      pacienteId,
      q,
      fechaDesde,
      fechaHasta,
      sort,
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al listar turnos' });
  }
}

async function listarSolicitudesPendientes(req, res) {
  try {
    const { estado = 'pendiente', tipo_solicitud: tipoSolicitud, limit } = req.query;
    const solicitudes = await listarSolicitudesTurno({ estado, tipoSolicitud, limit });

    req.auditAction = 'listar_solicitudes_turno';
    req.auditMeta = { estado, tipo_solicitud: tipoSolicitud || null, total: solicitudes.length };

    return res.status(200).json({ solicitudes });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al listar solicitudes de turno' });
  }
}

async function procesarRecordatorios(req, res) {
  try {
    const resultado = await procesarRecordatoriosAutomaticos();

    req.auditAction = 'procesar_recordatorios_automaticos';
    req.auditMeta = {
      reminders_enabled: resultado.enabled,
      reminders_procesados: resultado.procesados,
      reminders_enviados: resultado.enviados,
      reminders_fallidos: resultado.fallidos,
    };

    return res.status(200).json({
      mensaje: 'Proceso de recordatorios ejecutado',
      resultado,
    });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al procesar recordatorios' });
  }
}

async function enviarRecordatorioManual(req, res) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ mensaje: 'Id de turno requerido' });
    }

    const resultado = await enviarRecordatorioManualTurno(id);

    req.auditAction = resultado.enviado
      ? 'recordatorio_manual_enviado'
      : 'recordatorio_manual_omitido';
    req.auditMeta = {
      turno_id: id,
      whatsapp_ok: resultado.enviado,
      whatsapp_error: resultado.advertencia || null,
    };

    return res.status(200).json({
      mensaje: resultado.enviado
        ? 'Recordatorio enviado por WhatsApp'
        : resultado.omitido
          ? resultado.advertencia || 'El turno ya tiene un recordatorio registrado'
          : 'No se pudo enviar el recordatorio',
      resultado,
    });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error al enviar recordatorio manual' });
  }
}

module.exports = {
  registrarTurno,
  editarTurno,
  reprogramarTurno,
  cancelarTurno,
  confirmarSolicitudTurno,
  rechazarSolicitudTurno,
  listarTurnos,
  listarSolicitudesPendientes,
  listarProfesionales,
  consultarDisponibilidad,
  procesarRecordatorios,
  enviarRecordatorioManual,
};
