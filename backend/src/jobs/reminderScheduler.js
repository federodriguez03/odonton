const { processAutomaticReminders } = require('../services/whatsappReminder.service');

let schedulerStarted = false;
let schedulerHandle = null;
let schedulerRunPromise = null;

function getIntervalMinutes() {
  const value = Number.parseInt(process.env.WHATSAPP_REMINDER_INTERVAL_MINUTES || '10', 10);
  if (Number.isNaN(value) || value < 1) return 10;
  return value;
}

function startReminderScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const intervalMs = getIntervalMinutes() * 60 * 1000;
  schedulerHandle = setInterval(() => {
    if (schedulerRunPromise) return;
    schedulerRunPromise = processAutomaticReminders()
      .catch((error) => console.error('[WHATSAPP REMINDERS] Error en scheduler:', error.message))
      .finally(() => { schedulerRunPromise = null; });
  }, intervalMs);

  if (typeof schedulerHandle.unref === 'function') schedulerHandle.unref();
  console.log(`[WHATSAPP REMINDERS] Scheduler iniciado cada ${getIntervalMinutes()} minutos`);
}

async function stopReminderScheduler() {
  if (schedulerHandle) clearInterval(schedulerHandle);
  schedulerHandle = null;
  schedulerStarted = false;
  if (schedulerRunPromise) await schedulerRunPromise;
}

module.exports = {
  startReminderScheduler,
  stopReminderScheduler,
};
