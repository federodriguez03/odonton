function waitForServerClose(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function withShutdownTimeout(promise, timeoutMs, onTimeout) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      const error = new Error('El cierre coordinado excedió el tiempo máximo');
      error.code = 'SHUTDOWN_TIMEOUT';
      reject(error);
    }, timeoutMs);
  })]).finally(() => clearTimeout(timer));
}

function createGracefulShutdown({ server, stopScheduler, stopWhatsApp, closePool, timeoutMs = 15000, logger = console }) {
  let shutdownPromise = null;
  return function shutdown(signal = 'manual') {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = withShutdownTimeout((async () => {
      logger.info(`[SHUTDOWN] Señal ${signal}: deteniendo nuevas solicitudes`);
      const serverClosed = waitForServerClose(server);
      await stopScheduler();
      await serverClosed;
      await stopWhatsApp();
      await closePool();
      logger.info('[SHUTDOWN] Cierre coordinado completo');
    })(), timeoutMs, () => server.closeAllConnections?.());
    return shutdownPromise;
  };
}

module.exports = { createGracefulShutdown, waitForServerClose, withShutdownTimeout };
