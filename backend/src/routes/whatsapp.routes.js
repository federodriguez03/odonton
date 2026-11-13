const express = require('express');
const {
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
} = require('../controllers/whatsapp.controller');
const {
  middlewareAutenticacion,
  autorizarOdontologo,
} = require('../middlewares/turnosMiddleware');

const router = express.Router();

router.use((req, res, next) => {
  const demoMode = String(process.env.ODONTON_DEMO_MODE || '').toLowerCase() === 'true';
  const diagnosticMode = String(process.env.WHATSAPP_DIAGNOSTIC_MODE || '').toLowerCase() === 'true';
  if (demoMode && !diagnosticMode) {
    return res.status(503).json({
      mensaje: 'WhatsApp y los envios externos estan desactivados en la base demo.',
      codigo: 'DEMO_EXTERNAL_SENDS_DISABLED',
    });
  }
  if (diagnosticMode) {
    const allowed = new Set([
      'GET /status', 'GET /qr',
      'POST /initialize', 'POST /connect', 'POST /reset', 'POST /restart', 'POST /disconnect',
    ]);
    if (!allowed.has(`${req.method} ${req.path}`)) {
      return res.status(503).json({
        mensaje: 'El modo diagnóstico permite conexión y estado, pero mantiene bloqueados los envíos y el procesamiento.',
        codigo: 'WHATSAPP_DIAGNOSTIC_SENDS_DISABLED',
      });
    }
  }
  return next();
});

router.use(middlewareAutenticacion, autorizarOdontologo);

router.get('/status', getWhatsAppStatus);
router.get('/qr', getWhatsAppQr);
// Ruta de desarrollo/prueba. No exponer en produccion sin autenticacion.
router.get('/debug/chats', debugRecentChats);
router.post('/initialize', initializeWhatsApp);
router.post('/connect', initializeWhatsApp);
router.post('/reset', resetWhatsApp);
router.post('/restart', resetWhatsApp);
router.post('/logout', logoutWhatsApp);
router.post('/disconnect', disconnectWhatsApp);
// Ruta de desarrollo/prueba. No exponer en produccion sin autenticacion.
router.post('/send-test', sendTestMessage);
router.post('/send-reminder/:appointmentId', sendReminder);
router.post('/process-reminders', processReminders);
// Ruta de desarrollo/prueba. No exponer en produccion sin autenticacion.
router.post('/simulate-reply', simulateReply);

module.exports = router;
