const { sendWhatsAppMessage } = require('./whatsappClient.service');

async function enviarMensajeWhatsapp({ telefono, mensaje, tipo = 'whatsapp' } = {}) {
  if (!telefono) return { intentado: false, enviado: false, advertencia: 'Telefono no informado' };
  if (!mensaje) return { intentado: false, enviado: false, advertencia: 'Mensaje no informado' };

  try {
    const result = await sendWhatsAppMessage(telefono, mensaje);
    return {
      intentado: true,
      enviado: true,
      advertencia: null,
      tipo,
      message_id: result?.id?._serialized || result?.id || null,
    };
  } catch (error) {
    return {
      intentado: true,
      enviado: false,
      advertencia: error.message || 'No se pudo enviar WhatsApp',
      tipo,
    };
  }
}

async function enviarRecordatorioTurnoPorWhatsapp(payload = {}) {
  return enviarMensajeWhatsapp({
    telefono: payload.telefono,
    mensaje: payload.mensaje,
    tipo: payload.tipo || 'recordatorio_turno',
  });
}

function formatFechaHoraTurno(turno = {}) {
  const fechaInicio = turno.fecha_hora_inicio ? new Date(turno.fecha_hora_inicio) : null;
  return {
    fecha: fechaInicio && !Number.isNaN(fechaInicio.getTime())
      ? fechaInicio.toLocaleDateString('es-AR')
      : '-',
    hora: fechaInicio && !Number.isNaN(fechaInicio.getTime())
      ? fechaInicio.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      : '-',
  };
}

function nombrePaciente(turno = {}) {
  return [turno?.paciente?.nombre, turno?.paciente?.apellido].filter(Boolean).join(' ').trim() || 'paciente';
}

async function notificarCambioTurnoPorWhatsapp(payload = {}) {
  const turno = payload.turno || {};
  const { fecha, hora } = formatFechaHoraTurno(turno);
  const profesional = turno?.profesional?.nombre || turno?.profesional?.email || 'consultorio';
  const mensaje = payload.mensaje || `Hola ${nombrePaciente(turno)}, tu turno odontologico fue modificado.

Fecha nueva: ${fecha}
Horario nuevo: ${hora}
Profesional: ${profesional}

Si tenes alguna duda, comunicate con el consultorio.
Gracias.`;

  return enviarMensajeWhatsapp({
    telefono: payload.telefono,
    mensaje,
    tipo: 'cambio_turno',
  });
}

async function notificarConfirmacionSolicitudTurnoPorWhatsapp(payload = {}) {
  const turno = payload.turno || {};
  const { fecha, hora } = formatFechaHoraTurno(turno);
  const prestacion = turno?.prestacion?.nombre || 'la prestacion solicitada';
  const mensaje = payload.mensaje || `Hola ${nombrePaciente(turno)}, tu turno de ${prestacion} fue confirmado para el ${fecha} a las ${hora}. Te esperamos en Odonton.`;

  return enviarMensajeWhatsapp({
    telefono: payload.telefono,
    mensaje,
    tipo: 'confirmacion_solicitud_turno',
  });
}

async function notificarCancelacionTurnoPorWhatsapp(payload = {}) {
  const turno = payload.turno || {};
  const { fecha, hora } = formatFechaHoraTurno(turno);
  const prestacion = turno?.prestacion?.nombre || 'tu prestacion';
  const mensaje = payload.mensaje || `Hola ${nombrePaciente(turno)}, te informamos que tu turno de ${prestacion} del ${fecha} a las ${hora} fue cancelado. Para coordinar un nuevo turno, comunicate con Odonton.`;

  return enviarMensajeWhatsapp({
    telefono: payload.telefono,
    mensaje,
    tipo: 'cancelacion_turno',
  });
}

module.exports = {
  notificarCambioTurnoPorWhatsapp,
  notificarConfirmacionSolicitudTurnoPorWhatsapp,
  notificarCancelacionTurnoPorWhatsapp,
  enviarRecordatorioTurnoPorWhatsapp,
  enviarMensajeWhatsapp,
};
