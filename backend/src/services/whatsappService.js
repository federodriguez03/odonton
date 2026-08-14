const { getStatus, sendWhatsAppMessage } = require('./whatsappClient.service');
const { renderizarMensajeAutomatico } = require('./configuracionService');

const WARNING_NO_PHONE = 'El paciente no tiene un teléfono registrado.';
const WARNING_NOT_READY = 'WhatsApp no está conectado o listo.';
const WARNING_SEND_FAILED = 'No se pudo enviar la notificación por WhatsApp.';
const WARNING_CONFIG_FAILED = 'No se pudo preparar la notificación configurada de WhatsApp.';

function administrativeNotificationResult({ intentado, enviado, advertencia = null }) {
  return { intentado, enviado, advertencia };
}

function warningFromSendError(error) {
  if (error?.code === 'INVALID_WHATSAPP_PHONE') return error.message;
  if (/no esta listo|no está listo/i.test(String(error?.message || ''))) return WARNING_NOT_READY;
  return WARNING_SEND_FAILED;
}

async function enviarNotificacionAdministrativaWhatsapp({ telefono, mensaje } = {}) {
  if (!String(telefono || '').trim()) {
    return administrativeNotificationResult({
      intentado: false,
      enviado: false,
      advertencia: WARNING_NO_PHONE,
    });
  }

  if (!String(mensaje || '').trim()) {
    return administrativeNotificationResult({
      intentado: false,
      enviado: false,
      advertencia: 'No se pudo preparar la notificación por WhatsApp.',
    });
  }

  if (!getStatus()?.ready) {
    return administrativeNotificationResult({
      intentado: true,
      enviado: false,
      advertencia: WARNING_NOT_READY,
    });
  }

  try {
    await sendWhatsAppMessage(telefono, mensaje);
    return administrativeNotificationResult({ intentado: true, enviado: true });
  } catch (error) {
    return administrativeNotificationResult({
      intentado: true,
      enviado: false,
      advertencia: warningFromSendError(error),
    });
  }
}

async function enviarMensajeAdministrativoConfigurado({ tipo, telefono, turno } = {}) {
  let mensaje;

  try {
    mensaje = await renderizarMensajeAutomatico(tipo, { turno });
  } catch (error) {
    const detalleSeguro = [
      'WHATSAPP_MESSAGE_TYPE_NOT_FOUND',
      'WHATSAPP_MESSAGE_TEMPLATE_INVALID',
    ].includes(error?.code)
      ? error.message
      : WARNING_CONFIG_FAILED;

    return administrativeNotificationResult({
      intentado: false,
      enviado: false,
      advertencia: detalleSeguro,
    });
  }

  if (mensaje === null) {
    return administrativeNotificationResult({
      intentado: false,
      enviado: false,
      advertencia: null,
    });
  }

  return enviarNotificacionAdministrativaWhatsapp({ telefono, mensaje });
}

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

async function notificarCambioTurnoPorWhatsapp(payload = {}) {
  return enviarMensajeAdministrativoConfigurado({
    tipo: 'reprogramacion_turno',
    telefono: payload.telefono,
    turno: payload.turno,
  });
}

async function notificarConfirmacionSolicitudTurnoPorWhatsapp(payload = {}) {
  return enviarMensajeAdministrativoConfigurado({
    tipo: 'confirmacion_turno',
    telefono: payload.telefono,
    turno: payload.turno,
  });
}

async function notificarCancelacionTurnoPorWhatsapp(payload = {}) {
  return enviarMensajeAdministrativoConfigurado({
    tipo: 'cancelacion_turno',
    telefono: payload.telefono,
    turno: payload.turno,
  });
}

async function notificarRechazoSolicitudTurnoPorWhatsapp(payload = {}) {
  return enviarMensajeAdministrativoConfigurado({
    tipo: 'rechazo_solicitud_turno',
    telefono: payload.telefono,
    turno: payload.turno,
  });
}

module.exports = {
  notificarCambioTurnoPorWhatsapp,
  notificarConfirmacionSolicitudTurnoPorWhatsapp,
  notificarCancelacionTurnoPorWhatsapp,
  notificarRechazoSolicitudTurnoPorWhatsapp,
  enviarRecordatorioTurnoPorWhatsapp,
  enviarMensajeWhatsapp,
};
