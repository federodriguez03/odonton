/**
 * Punto de entrada del servidor
 * - Inicializa la aplicación
 * - Verifica conexión a BD
 * - Inicia el servidor HTTP
 */

const { app, inicializar } = require('./app');

const PORT = process.env.PORT || 3000;

/**
 * Iniciar servidor
 */
async function start() {
  try {
    // Verificar conexión a BD antes de iniciar
    await inicializar();

    // Iniciar servidor HTTP
    const server = app.listen(PORT, () => {
      console.log(`[SERVIDOR] Escuchando en puerto ${PORT}`);
      console.log(`[SERVIDOR] URL: http://localhost:${PORT}`);
      console.log(`[SERVIDOR] Health check: http://localhost:${PORT}/health\n`);
    });

    // Manejo graceful shutdown
    process.on('SIGTERM', () => {
      console.log('\n[SHUTDOWN] Recibida señal SIGTERM, cerrando servidor...');
      server.close(() => {
        console.log('[SHUTDOWN] ✓ Servidor cerrado');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('\n[SHUTDOWN] Recibida señal SIGINT, cerrando servidor...');
      server.close(() => {
        console.log('[SHUTDOWN] ✓ Servidor cerrado');
        process.exit(0);
      });
    });
  } catch (err) {
    console.error('[FATAL] Error al iniciar servidor:', err);
    process.exit(1);
  }
}

// Iniciar si este es el archivo principal
if (require.main === module) {
  start();
}

module.exports = { start };