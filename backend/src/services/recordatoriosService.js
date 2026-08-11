const {
  sendAppointmentReminder,
  processAutomaticReminders,
  processPatientReply,
} = require('./whatsappReminder.service');

async function procesarRecordatoriosAutomaticos() {
  const result = await processAutomaticReminders();
  return {
    enabled: result.enabled,
    procesados: result.processed || 0,
    enviados: result.sent || 0,
    fallidos: result.failed || 0,
    resultados: result.results || [],
  };
}

async function enviarRecordatorioManualTurno(turnoId) {
  const result = await sendAppointmentReminder(turnoId);
  return {
    turno_id: result.appointment_id,
    enviado: Boolean(result.sent),
    omitido: Boolean(result.skipped),
    advertencia: result.skipped ? result.mensaje : null,
    tracking: result.reminder,
  };
}

async function procesarRespuestaPaciente({ telefono, phone, mensaje, body, accion } = {}) {
  const text = accion || mensaje || body;
  const sourcePhone = telefono || phone;
  if (!sourcePhone) throw new Error('telefono es obligatorio para procesar respuesta por WhatsApp Web');
  return processPatientReply(sourcePhone, text);
}

async function procesarWebhookWhatsapp() {
  throw new Error('Webhook externo obsoleto. Las respuestas se reciben directamente con whatsapp-web.js.');
}

async function aplicarReprogramacionConToken() {
  throw new Error('Reprogramacion por token externo obsoleta. Use el flujo interno del consultorio.');
}

function iniciarSchedulerRecordatorios() {
  const { startReminderScheduler } = require('../jobs/reminderScheduler');
  startReminderScheduler();
}

module.exports = {
  procesarRecordatoriosAutomaticos,
  enviarRecordatorioManualTurno,
  procesarRespuestaPaciente,
  procesarWebhookWhatsapp,
  aplicarReprogramacionConToken,
  iniciarSchedulerRecordatorios,
};
