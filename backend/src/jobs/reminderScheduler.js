const { processAutomaticReminders } = require('../services/whatsappReminder.service');

let schedulerStarted = false;
let schedulerHandle = null;

function getIntervalMinutes() {
  const value = Number.parseInt(process.env.WHATSAPP_REMINDER_INTERVAL_MINUTES || '10', 10);
  if (Number.isNaN(value) || value < 1) return 10;
  return value;
}

function startReminderScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const intervalMs = getIntervalMinutes() * 60 * 1000;
  schedulerHandle = setInterval(async () => {
    try {
      await processAutomaticReminders();
    } catch (error) {
      console.error('[WHATSAPP REMINDERS] Error en scheduler:', error.message);
    }
  }, intervalMs);

  if (typeof schedulerHandle.unref === 'function') schedulerHandle.unref();
  console.log(`[WHATSAPP REMINDERS] Scheduler iniciado cada ${getIntervalMinutes()} minutos`);
}

module.exports = {
  startReminderScheduler,
};
