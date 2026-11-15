/** Punto de entrada y cierre coordinado del servidor. */
const { app, inicializar } = require('./app');
const { pool } = require('./config/db');
const { stopReminderScheduler } = require('./jobs/reminderScheduler');
const { destroyWhatsAppClient } = require('./services/whatsappClient.service');
const { createGracefulShutdown } = require('./services/shutdownService');

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await inicializar();
    const server = app.listen(PORT, () => {
      console.log(`[SERVIDOR] Escuchando en puerto ${PORT}`);
      console.log(`[SERVIDOR] URL: http://localhost:${PORT}`);
      console.log(`[SERVIDOR] Liveness: http://localhost:${PORT}/health/live`);
      console.log(`[SERVIDOR] Readiness: http://localhost:${PORT}/health/ready\n`);
    });

    const parsedTimeout = Number.parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '15000', 10);
    const shutdown = createGracefulShutdown({
      server,
      stopScheduler: stopReminderScheduler,
      stopWhatsApp: destroyWhatsAppClient,
      closePool: () => pool.end(),
      timeoutMs: Number.isInteger(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 15000,
    });

    const handleSignal = (signal) => {
      shutdown(signal)
        .then(() => { process.exitCode = 0; })
        .catch((error) => {
          console.error('[SHUTDOWN] Cierre incompleto:', error.message);
          process.exitCode = 1;
        });
    };
    process.once('SIGTERM', () => handleSignal('SIGTERM'));
    process.once('SIGINT', () => handleSignal('SIGINT'));
    return { server, shutdown };
  } catch (error) {
    console.error('[FATAL] Error al iniciar servidor:', error);
    process.exitCode = 1;
    throw error;
  }
}

if (require.main === module) {
  start().catch(() => {});
}

module.exports = { start };
