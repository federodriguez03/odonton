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
  processPatientReply,
} = require('../services/whatsappReminder.service');

async function getWhatsAppStatus(req, res) {
  return res.status(200).json(getStatus());
}


async function getWhatsAppQr(req, res) {
  const qr = getLastQr();
  if (!qr) {
    return res.status(404).json({
      mensaje: 'QR no disponible para el estado actual de WhatsApp.',
      status: getStatus(),
    });
  }
  return res.status(200).json({ qr, status: getStatus() });
}

async function initializeWhatsApp(req, res) {
  await initializeWhatsAppClient();
  return res.status(200).json({
    mensaje: 'Inicializacion de WhatsApp solicitada.',
    status: getStatus(),
  });
}

async function resetWhatsApp(req, res) {
  const status = await restartWhatsAppClient();
  return res.status(200).json({
    mensaje: 'Cliente WhatsApp reiniciado. Espera unos segundos y revisa consola/status para el QR.',
    status,
  });
}

async function disconnectWhatsApp(req, res) {
  await destroyWhatsAppClient();
  return res.status(200).json({
    mensaje: 'Cliente WhatsApp desconectado. La sesion local se conserva.',
    status: getStatus(),
  });
}

async function logoutWhatsApp(req, res) {
  const result = await logoutWhatsAppClient();
  return res.status(200).json({
    mensaje: 'Sesion de WhatsApp cerrada. Usa Iniciar o Nuevo QR para vincular otra vez.',
    resultado: result,
    status: getStatus(),
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
  try {
    const { phone, body } = req.body || {};
    if (!phone || !body) {
      return res.status(400).json({ mensaje: 'phone y body son obligatorios' });
    }
    const result = await processPatientReply(phone, body, { replyWhenNoPending: false });
    if (result?.codigo === 'NO_PENDING_REMINDER') {
      const { processAutogestionMessage } = require('../services/whatsappAutogestion.service');
      const autogestion = await processAutogestionMessage(phone, body);
      return res.status(200).json({ tipo: 'autogestion', resultado: autogestion });
    }
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ mensaje: error.message || 'Error simulando respuesta' });
  }
}

async function debugRecentChats(req, res) {
  try {
    const processMessages = String(req.query?.process || '').toLowerCase() === 'true';
    const result = await pollRecentMessagesOnce({
      limitChats: Number.parseInt(req.query?.limitChats || '20', 10),
      limitMessages: Number.parseInt(req.query?.limitMessages || '5', 10),
      maxAgeMinutes: Number.parseInt(req.query?.maxAgeMinutes || '120', 10),
      process: processMessages,
    });
    return res.status(200).json(result);
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
