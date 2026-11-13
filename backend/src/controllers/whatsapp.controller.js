const {
  sendWhatsAppMessage,
  getStatus,
  initializeWhatsAppClient,
  getLastQr,
  destroyWhatsAppClient,
  logoutWhatsAppClient,
  restartWhatsAppClient,
  pollRecentMessagesOnce,
} = require('../services/whatsappClient.service');
const {
  sendAppointmentReminder,
  processAutomaticReminders,
} = require('../services/whatsappReminder.service');

function sanitizeConnectionError(value) {
  return String(value || '')
    .replace(/[A-Za-z]:\\[^\r\n]+/g, '[ruta local]')
    .replace(/\b(qr|token|secret|password)=\S+/gi, '$1=[oculto]')
    .slice(0, 500);
}

function publicStatus() {
  const status = getStatus();
  const safeError = sanitizeConnectionError(status.last_error || status.lastError);
  return { ...status, last_error: safeError || null, lastError: safeError || null };
}

async function getWhatsAppStatus(req, res) {
  return res.status(200).json(publicStatus());
}


async function getWhatsAppQr(req, res) {
  const qr = getLastQr();
  if (!qr) {
    return res.status(404).json({
      mensaje: 'QR no disponible para el estado actual de WhatsApp.',
      status: publicStatus(),
    });
  }
  return res.status(200).json({ qr, status: publicStatus() });
}

async function initializeWhatsApp(req, res) {
  await initializeWhatsAppClient();
  return res.status(202).json({
    mensaje: 'Inicio de conexion solicitado. El estado conectado se informara solamente cuando WhatsApp confirme que esta listo.',
    status: publicStatus(),
  });
}

async function resetWhatsApp(req, res) {
  await restartWhatsAppClient();
  return res.status(202).json({
    mensaje: 'Reintento solicitado conservando la sesion guardada.',
    status: publicStatus(),
  });
}

async function disconnectWhatsApp(req, res) {
  await destroyWhatsAppClient();
  return res.status(200).json({
    mensaje: 'Cliente WhatsApp desconectado. La sesion local se conserva.',
    status: publicStatus(),
  });
}

async function logoutWhatsApp(req, res) {
  if (req.body?.confirmarDesvinculacion !== true) {
    return res.status(400).json({
      mensaje: 'La desvinculacion requiere confirmacion explicita del dueño.',
      codigo: 'WHATSAPP_UNLINK_CONFIRMATION_REQUIRED',
    });
  }
  const result = await logoutWhatsAppClient({ confirmed: true });
  return res.status(200).json({
    mensaje: 'Sesion de WhatsApp cerrada. Usa Iniciar o Nuevo QR para vincular otra vez.',
    resultado: result,
    status: publicStatus(),
  });
}

async function sendTestMessage(req, res) {
  try {
    const { phone, message } = req.body || {};
    if (!phone || !message) {
      return res.status(400).json({ mensaje: 'phone y message son obligatorios' });
    }

    const result = await sendWhatsAppMessage(phone, message);
    return res.status(200).json({
      mensaje: 'Mensaje enviado',
      message_id: result?.id?._serialized || result?.id || null,
    });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error enviando WhatsApp' });
  }
}

async function sendReminder(req, res) {
  try {
    const { appointmentId } = req.params;
    const force = req.body?.force === true || String(req.query?.force || '').toLowerCase() === 'true';
    const result = await sendAppointmentReminder(appointmentId, { force });
    return res.status(200).json({
      mensaje: result.skipped ? result.mensaje : 'Recordatorio enviado',
      resultado: result,
    });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error enviando recordatorio' });
  }
}

async function processReminders(req, res) {
  try {
    const result = await processAutomaticReminders();
    return res.status(200).json({
      mensaje: 'Proceso de recordatorios ejecutado',
      resultado: result,
    });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error procesando recordatorios' });
  }
}

async function simulateReply(req, res) {
  const { phone, body } = req.body || {};
  if (!phone || !body) {
    return res.status(400).json({ mensaje: 'phone y body son obligatorios' });
  }

  return res.status(200).json({
    tipo: 'simulacion',
    resultado: {
      handled: false,
      codigo: 'SIMULATION_ONLY_NO_REAL_TRANSPORT',
      mensaje: 'Simulacion sin procesamiento ni envio real de WhatsApp.',
    },
  });
}

async function debugRecentChats(req, res) {
  try {
    const processingRequested = String(req.query?.process || '').toLowerCase() === 'true';
    const result = await pollRecentMessagesOnce({
      limitChats: Number.parseInt(req.query?.limitChats || '20', 10),
      limitMessages: Number.parseInt(req.query?.limitMessages || '5', 10),
      maxAgeMinutes: Number.parseInt(req.query?.maxAgeMinutes || '120', 10),
      process: false,
    });
    return res.status(200).json({
      ...result,
      processing_requested: processingRequested,
      processing_enabled: false,
    });
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error leyendo chats de WhatsApp' });
  }
}

module.exports = {
  getWhatsAppStatus,
  getWhatsAppQr,
  initializeWhatsApp,
  resetWhatsApp,
  logoutWhatsApp,
  disconnectWhatsApp,
  sendTestMessage,
  sendReminder,
  processReminders,
  simulateReply,
  debugRecentChats,
};
